import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { numberedExtensionCatalogPairs, parseCatManifest, VERSIONED_EXTENSION_CATALOG_PART, type CatEntry } from '../../shared/x4CatalogManifest';
import { readContentManifestIdentity } from '../lib/validationEvidence';

export const MAX_INSTALLED_ROOT_FILE_BYTES = 64 * 1024;
const MAX_INDEX_BYTES = 1024 * 1024;

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export function installedRuntimeContentId(extensionsRoot: string, target: string): string | undefined {
  const folder = path.basename(target);
  if (!/^[a-z0-9_-][a-z0-9_.-]{0,127}$/i.test(folder)) return;
  try {
    const root = fs.realpathSync.native(extensionsRoot);
    const parent = pathKey(path.dirname(path.resolve(target)));
    if (parent !== pathKey(path.resolve(extensionsRoot)) && parent !== pathKey(root)) return;
    const installed = path.join(root, folder);
    if (!fs.lstatSync(installed).isDirectory() || pathKey(fs.realpathSync.native(installed)) !== pathKey(installed)) return;
    const content = readInstalledExtensionRootFiles(installed, ['content.xml']).get('content.xml');
    return readContentManifestIdentity(content)?.modId.toLowerCase();
  } catch {
    return undefined;
  }
}

function sameStamp(before: fs.BigIntStats, after: fs.BigIntStats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

function withRegularFile<T>(root: string, name: string, observed: Map<string, fs.BigIntStats>, read: (fd: number, size: number) => T): T {
  const file = path.join(root, name);
  const before = fs.lstatSync(file, { bigint: true });
  const previouslyObserved = observed.get(file);
  if (previouslyObserved && !sameStamp(previouslyObserved, before)) throw new Error('Installed manifest input changed.');
  if (!before.isFile() || pathKey(fs.realpathSync.native(file)) !== pathKey(file)) {
    throw new Error('Installed manifest inputs must be contained regular files.');
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !sameStamp(before, opened)) throw new Error('Installed manifest input changed.');
    const result = read(fd, Number(before.size));
    if (!sameStamp(before, fs.fstatSync(fd, { bigint: true }))) throw new Error('Installed manifest input changed.');
    observed.set(file, before);
    return result;
  } finally {
    fs.closeSync(fd);
  }
}

function readBytes(fd: number, offset: number, length: number): Buffer {
  const buffer = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const count = fs.readSync(fd, buffer, read, length - read, offset + read);
    if (!count) throw new Error('Installed manifest input ended before its expected length.');
    read += count;
  }
  return buffer;
}

function decode(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

interface InstalledRootSources {
  loose: Map<string, string>;
  packed: Map<string, string>;
  tombstones: Set<string>;
}

function readRootSources(
  target: string,
  filenames: readonly string[],
  numberedPaths?: ReadonlySet<string>,
): InstalledRootSources {
  if (filenames.some(name => !/^[a-z0-9_.-]+$/i.test(name) || name === '.' || name === '..')) {
    throw new Error('Installed extension lookup requires root filenames.');
  }
  const loose = new Map<string, string>();
  const packed = new Map<string, string>();
  const tombstones = new Set<string>();
  if (!filenames.length) return { loose, packed, tombstones };
  const directory = fs.lstatSync(target, { bigint: true, throwIfNoEntry: false });
  if (!directory) return { loose, packed, tombstones };
  if (!directory.isDirectory()) throw new Error('Installed target is not a regular directory.');
  const root = fs.realpathSync.native(target);
  const physical = fs.lstatSync(root, { bigint: true });
  if (!physical.isDirectory() || !sameStamp(directory, physical)) throw new Error('Installed target directory changed.');
  const names = fs.readdirSync(root);
  if (names.some(name => VERSIONED_EXTENSION_CATALOG_PART.test(name)
    || (numberedPaths && /^subst_.+\.(cat|dat)$/i.test(name)))) {
    throw new Error('Versioned or substitution catalogs need an active-game manifest selection.');
  }

  const observed = new Map<string, fs.BigIntStats>();
  const requested = new Set(filenames.map(name => name.toLowerCase()));
  const packedNames = new Set(numberedPaths ?? requested);
  for (const name of requested) {
    const matches = names.filter(file => file.toLowerCase() === name);
    if (!matches.length) continue;
    if (matches.length > 1) throw new Error('Installed loose root file is ambiguous.');
    loose.set(name, withRegularFile(root, matches[0], observed, (fd, size) => {
      if (size > MAX_INSTALLED_ROOT_FILE_BYTES) throw new Error('Installed loose root file exceeds the read limit.');
      return decode(readBytes(fd, 0, size));
    }));
    if (!numberedPaths) packedNames.delete(name);
  }

  if (packedNames.size) {
    let remaining = MAX_INDEX_BYTES;
    const pairs = numberedExtensionCatalogPairs(names);
    if (numberedPaths) pairs.sort((a, b) => a.cat.toLowerCase().localeCompare(b.cat.toLowerCase()));
    const selected = new Map<string, { part: string; entry: CatEntry }>();
    for (const { cat, dat } of pairs) {
      const entries = withRegularFile(root, cat, observed, (fd, size) => {
        if (size > remaining) throw new Error('Installed catalog indexes exceed the read limit.');
        remaining -= size;
        return parseCatManifest(decode(readBytes(fd, 0, size)), { strict: true, maxEntries: 16_384 });
      });
      const end = entries.at(-1);
      withRegularFile(root, dat, observed, (_fd, size) => {
        if ((end ? end.offset + end.size : 0) !== size) throw new Error('Installed catalog index does not cover its data volume.');
      });
      const seen = new Set<string>();
      for (const entry of entries) {
        const name = entry.name.toLowerCase();
        if (!packedNames.has(name)) continue;
        if (seen.has(name) || (!numberedPaths && selected.has(name))) throw new Error('Installed packed root file is ambiguous.');
        seen.add(name);
        selected.set(name, { part: dat, entry });
      }
    }
    for (const [name, { part, entry }] of selected) {
      if (entry.size > MAX_INSTALLED_ROOT_FILE_BYTES) throw new Error('Installed packed root file exceeds the read limit.');
      packed.set(name, withRegularFile(root, part, observed, (fd) => {
        const bytes = readBytes(fd, entry.offset, entry.size);
        const explicitEmpty = numberedPaths && entry.size === 0 && entry.md5 === '0'.repeat(32);
        if (!explicitEmpty && createHash('md5').update(bytes).digest('hex') !== entry.md5) {
          throw new Error('Installed packed root file checksum differs.');
        }
        return decode(bytes);
      }));
      if (numberedPaths && entry.size === 0 && entry.timestamp === 0) tombstones.add(name);
    }
  }

  for (const [file, before] of observed) {
    const after = fs.lstatSync(file, { bigint: true });
    if (!after.isFile() || !sameStamp(before, after)) throw new Error('Installed manifest input changed.');
  }
  const current = fs.lstatSync(target, { bigint: true });
  if (!current.isDirectory() || !sameStamp(directory, current) || pathKey(fs.realpathSync.native(target)) !== pathKey(root)) {
    throw new Error('Installed target directory changed.');
  }
  return { loose, packed, tombstones };
}

/** Read exact extension-root text files with loose precedence and bounded catalog validation. */
export function readInstalledExtensionRootFiles(target: string, filenames: readonly string[]): Map<string, string> {
  const { loose, packed } = readRootSources(target, filenames);
  return new Map([...loose, ...packed]);
}

/** Read both file preferences over a single verified numbered catalog inventory. */
export function readInstalledExtensionRootVariants(target: string, selectable: readonly string[], looseOnly: readonly string[] = []) {
  return readRootSources(target, [...selectable, ...looseOnly], new Set(selectable.map(name => name.toLowerCase())));
}

export function installedRootFileVariants(sources: InstalledRootSources, name: string) {
  const loose = sources.loose.get(name);
  // A deletion entry masks this path in the catalog-first view.
  const packed = sources.packed.get(name);
  const catalogValue = sources.tombstones.has(name) ? undefined : packed;
  return { loosePreferred: loose ?? catalogValue, catalogPreferred: packed === undefined ? loose : catalogValue };
}
