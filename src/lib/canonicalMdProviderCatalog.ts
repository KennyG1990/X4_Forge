import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseMdScriptRoot } from './cueLineage';
import { discoverOfficialDlcOrder, resolveEffectiveReferenceDocument } from './referenceOverlay';

const MAX_FILES = 2048;
const MAX_ENTRIES = 8192;
const MAX_DEPTH = 16;
const MAX_FILE_BYTES = 8n * 1024n * 1024n;
const MAX_TOTAL_BYTES = 64n * 1024n * 1024n;
const HEADER_BYTES = 32 * 1024;

export interface CanonicalMdProvider {
  readonly name: string;
  readonly relativePath: string;
}

export type CanonicalMdCatalog = {
  readonly status: 'ready';
  readonly root: string;
  readonly generation: string;
  readonly logicalPaths: number;
  /** Case-folded keys expose collisions without resolving names case-insensitively. */
  readonly providers: ReadonlyMap<string, CanonicalMdProvider | null>;
} | { readonly status: 'unavailable'; readonly reason: string };

type SourceFile = { relativePath: string; absolutePath: string; stamp: string };
type Snapshot = { root: string; officialFolders: string[]; generation: string; paths: Map<string, SourceFile[]> };
let lastCatalog: Extract<CanonicalMdCatalog, { status: 'ready' }> | undefined;

const fileStamp = (root: string, file: string, stat: fs.BigIntStats) =>
  JSON.stringify([path.relative(root, file), stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String));

function directoryExists(directory: string): boolean {
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat) return false;
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(directory, fs.realpathSync(directory))) {
    throw new Error('A canonical MD inventory directory is not physical.');
  }
  return true;
}

function snapshot(rootInput: string): Snapshot {
  const root = fs.realpathSync(path.resolve(rootInput));
  const officialFolders: string[] = [];
  const paths = new Map<string, SourceFile[]>();
  const stamps: string[] = [];
  let entryCount = 0;
  let fileCount = 0;
  let totalBytes = 0n;
  const files = (directory: string, visitor: (entry: fs.Dirent) => void) => {
    const handle = fs.opendirSync(directory);
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
        if (++entryCount > MAX_ENTRIES) throw new Error('Canonical MD inventory exceeds its entry budget.');
        visitor(entry);
      }
    } finally { handle.closeSync(); }
  };
  const capture = (parent: string, relativePath: string) => {
    const absolutePath = path.join(parent, ...relativePath.split('/'));
    const stat = fs.lstatSync(absolutePath, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('A canonical MD source is not a physical file.');
    totalBytes += stat.size;
    if (++fileCount > MAX_FILES || stat.size > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('Canonical MD inventory exceeds its file or byte budget.');
    }
    const stamp = fileStamp(root, absolutePath, stat);
    stamps.push(stamp);
    return { relativePath, absolutePath, stamp };
  };
  const walk = (parent: string, relativeDir: string, depth: number, seen: Set<string>) => {
    if (depth > MAX_DEPTH) throw new Error('Canonical MD inventory exceeds its directory depth budget.');
    const directory = path.join(parent, ...relativeDir.split('/'));
    if (!directoryExists(directory)) return;
    files(directory, entry => {
      if (entry.name.includes('\\')) throw new Error('Canonical MD inventory contains an invalid path.');
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(parent, relativePath, depth + 1, seen);
        return;
      }
      if (entry.isSymbolicLink()) throw new Error('Canonical MD inventory contains a linked entry.');
      if (!/\.xml$/i.test(entry.name)) return;
      const folded = relativePath.toLowerCase();
      const layers = paths.get(folded);
      if (seen.has(folded) || (layers && layers[0].relativePath !== relativePath)) {
        throw new Error('Canonical MD paths collide by case.');
      }
      seen.add(folded);
      const file = capture(parent, relativePath);
      if (layers) layers.push(file);
      else paths.set(folded, [file]);
    });
  };
  walk(root, 'md', 0, new Set());
  const extensions = path.join(root, 'extensions');
  if (directoryExists(extensions)) files(extensions, entry => {
    if (!/^ego_dlc_/i.test(entry.name)) return;
    if (!entry.isDirectory()) throw new Error('An official DLC folder is not physical.');
    const dlc = path.join(extensions, entry.name);
    if (!directoryExists(dlc)) throw new Error('An official DLC folder disappeared.');
    officialFolders.push(entry.name);
    capture(dlc, 'content.xml');
    walk(dlc, 'md', 0, new Set());
  });
  if (!paths.size) throw new Error('No canonical MD documents were available in the configured corpus.');
  const generation = crypto.createHash('sha256').update(JSON.stringify([root, stamps.sort()])).digest('hex');
  return { root, officialFolders, generation, paths };
}

/** Parse the actual first element from a bounded UTF-8 prefix. Declarations with DTDs are unavailable. */
function rootHeader(text: string): { tag: string; xml: string } | undefined {
  const whitespace = /\s*/y;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    whitespace.lastIndex = index;
    whitespace.test(text);
    index = whitespace.lastIndex;
    const isComment = text.startsWith('<!--', index);
    if (!isComment && !text.startsWith('<?', index)) break;
    const terminator = isComment ? '-->' : '?>';
    const end = text.indexOf(terminator, index + (isComment ? 4 : 2));
    if (end < 0) return;
    index = end + terminator.length;
  }
  const pattern = /<([A-Za-z_][\w.:-]*)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/y;
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  if (match) return { tag: match[1], xml: match[0] };
}

function readHeader(file: string): string {
  const fd = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.allocUnsafe(HEADER_BYTES);
    const size = fs.readSync(fd, bytes, 0, bytes.length, 0);
    return bytes.toString('utf8', 0, size);
  } finally { fs.closeSync(fd); }
}

function buildCatalog(inventory: Snapshot): ReadonlyMap<string, CanonicalMdProvider | null> {
  const providers = new Map<string, CanonicalMdProvider | null>();
  const dlcs = discoverOfficialDlcOrder(inventory.root, true);
  if (dlcs.length !== inventory.officialFolders.length || dlcs.some(dlc => !inventory.officialFolders.includes(dlc.folder))) {
    throw new Error('The official DLC inventory changed during canonical MD discovery.');
  }
  for (const layers of inventory.paths.values()) {
    const [file] = layers;
    let head: string;
    if (layers.length === 1) {
      head = readHeader(file.absolutePath);
    } else {
      const effective = resolveEffectiveReferenceDocument(inventory.root, file.relativePath, true, { dlcs, cache: false });
      if (!effective.complete || effective.content === undefined) {
        throw new Error(`Canonical MD overlay is incomplete for ${file.relativePath}.`);
      }
      head = effective.content.slice(0, HEADER_BYTES);
    }
    const header = rootHeader(head);
    if (!header || header.tag.toLowerCase() === 'diff') {
      throw new Error(`Canonical MD root is unavailable for ${file.relativePath}.`);
    }
    if (header.tag !== 'mdscript') continue;
    const opening = header.xml.slice(0, -1).replace(/\/$/, '') + '/>';
    const name = parseMdScriptRoot(opening)?.getAttribute('name');
    if (!name) throw new Error(`Canonical MD script name is unavailable for ${file.relativePath}.`);
    const key = name.toLowerCase();
    providers.set(key, providers.has(key) ? null : { name, relativePath: file.relativePath });
  }
  return providers;
}

/** Check only physical MD metadata, without composing any documents. */
export function readCanonicalMdProviderGeneration(root: string): { root: string; generation: string } | undefined {
  if (!root.trim()) return;
  try {
    const current = snapshot(root);
    return { root: current.root, generation: current.generation };
  } catch { return undefined; }
}

/** Bind the physical sources behind the consulted logical paths to the current inventory. */
export function readCanonicalMdProviderProof(root: string, generation: string, paths: readonly string[]) {
  try {
    const current = snapshot(root);
    if (current.generation !== generation) return;
    const layers = paths.flatMap(relative => {
      const entries = current.paths.get(relative.toLowerCase());
      if (!entries || entries[0].relativePath !== relative) throw new Error('Canonical MD provider path changed.');
      return entries;
    });
    const flags = process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
    const files = layers.map(({ absolutePath, stamp }): [string, string] => {
      const fd = fs.openSync(absolutePath, fs.constants.O_RDONLY | flags);
      try {
        const stat = fs.fstatSync(fd, { bigint: true });
        if (!stat.isFile() || fileStamp(current.root, absolutePath, stat) !== stamp) throw new Error('Canonical MD provider changed.');
        const bytes = Buffer.alloc(Number(stat.size));
        let offset = 0;
        while (offset < bytes.length) {
          const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
          if (!count) throw new Error('Canonical MD provider ended before its captured size.');
          offset += count;
        }
        if (fileStamp(current.root, absolutePath, fs.fstatSync(fd, { bigint: true })) !== stamp) {
          throw new Error('Canonical MD provider changed during the read.');
        }
        return [path.relative(current.root, absolutePath), crypto.createHash('sha256').update(bytes).digest('hex')];
      } finally { fs.closeSync(fd); }
    });
    if (!layers.length || snapshot(root).generation === generation) return files.sort(([a], [b]) => a.localeCompare(b));
  } catch { /* A missing or changed input cannot prove current provider authority. */ }
}

/** A warm read rechecks only the canonical MD metadata. No provider contents are retained. */
export function readCanonicalMdProviderCatalog(root: string): CanonicalMdCatalog {
  if (!root.trim()) return { status: 'unavailable', reason: 'Canonical corpus is not configured.' };
  try {
    const before = snapshot(root);
    if (lastCatalog?.generation === before.generation) return lastCatalog;
    const providers = buildCatalog(before);
    if (snapshot(root).generation !== before.generation) throw new Error('Canonical MD inventory changed during discovery.');
    lastCatalog = { status: 'ready', root: before.root, generation: before.generation, logicalPaths: before.paths.size, providers };
    return lastCatalog;
  } catch (error) {
    return { status: 'unavailable', reason: (error instanceof Error ? error.message : String(error)).slice(0, 512) };
  }
}
