import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import * as path from 'node:path';
import {
  createCatManifestParser, MAX_CAT_ENTRIES, MAX_CAT_MANIFEST_BYTES, numberedBaseGameCatalogPairs,
  orderedExtensionCatalogPairs, orderedSubstitutionCatalogPairs, type CatEntry,
} from '../../shared/x4CatalogManifest';
import { hasInvalidNavigationPathCharacters } from '../../shared/mdScriptNavigation';
import { physicalStamp, readDiskInput, sameStamp, withDiskInput } from './aiScriptDefinitionHost';

const MAX_VERSION_BYTES = 32n;
const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_INDEX_ENTRIES = 16_384;
export const REFERENCE_SYMBOL_FILE_LIMIT = 2_048;
const MAX_BASE_INDEX_BYTES = 128 * 1024 * 1024;
const INDEX_CHUNK_BYTES = 256 * 1024;
const MAX_INDEX_LINE_CHARS = 64 * 1024;

type ArchiveFile = { file: string; stamp: BigIntStats };

export interface PackedScriptInput {
  archive: string;
  data: ArchiveFile;
  entry: CatEntry;
  logical: string;
}

export interface ExtensionScriptCatalogs {
  identity: string;
  parts: ArchiveFile[];
  scripts: Map<string, PackedScriptInput>;
}

export interface GameCatalogVersion {
  file: string;
  stamp?: BigIntStats;
  version?: number;
  identity: string;
}

export async function readGameCatalogVersion(root: string): Promise<GameCatalogVersion> {
  const file = path.join(root, 'version.dat');
  const stamp = await physicalStamp(file).catch(() => undefined);
  const identity = createHash('sha256').update(file).update('\0');
  let version: number | undefined;
  if (stamp) {
    identity.update([stamp.dev, stamp.ino, stamp.mode, stamp.nlink, stamp.size, stamp.mtimeNs, stamp.ctimeNs].join(':'));
    if (stamp.isFile() && stamp.nlink === 1n && stamp.size <= MAX_VERSION_BYTES) {
      const bytes = await readDiskInput({ file, stamp }).catch(() => undefined);
      if (bytes) {
        identity.update('\0').update(bytes);
        const token = /^[ \t\r\n]*([1-9][0-9]{2,})[ \t\r\n]*$/.exec(bytes.toString('latin1'));
        const parsed = Number(token?.[1]);
        if (Number.isSafeInteger(parsed)) version = parsed;
      }
    }
  }
  return { file, stamp, version, identity: identity.digest('hex') };
}

/** Inventory applicable extension sources without extracting any entries. */
export async function readExtensionScriptCatalogs(
  directory: string,
  names: readonly string[],
  chargeRead: (bytes: number) => void,
  gameVersion?: number,
): Promise<ExtensionScriptCatalogs> {
  return readScriptCatalogs(directory, orderedExtensionCatalogPairs(names, gameVersion), MAX_INDEX_BYTES, MAX_INDEX_ENTRIES, chargeRead);
}

export async function readSubstitutionScriptCatalogs(
  directory: string,
  names: readonly string[],
  chargeRead: (bytes: number) => void,
  gameVersion?: number,
): Promise<ExtensionScriptCatalogs> {
  return readScriptCatalogs(directory, orderedSubstitutionCatalogPairs(names, gameVersion), MAX_INDEX_BYTES, MAX_INDEX_ENTRIES,
    chargeRead, true);
}

export function readBaseGameScriptCatalogs(directory: string, names: readonly string[]): Promise<ExtensionScriptCatalogs> {
  return readScriptCatalogs(directory, numberedBaseGameCatalogPairs(names), MAX_BASE_INDEX_BYTES, MAX_CAT_ENTRIES);
}

async function readScriptCatalogs(
  directory: string, pairs: ReadonlyArray<{ cat: string; dat: string }>, indexBudget: number, rowLimit: number,
  chargeRead?: (bytes: number) => void, gameRootPaths = false,
): Promise<ExtensionScriptCatalogs> {
  const scriptPath = gameRootPaths ? /^(?:extensions\/[^/]+\/)?(md|aiscripts)\/([^/]+\.xml)$/i : /^(md|aiscripts)\/([^/]+\.xml)$/i;
  const scripts = new Map<string, PackedScriptInput>();
  const parts: ArchiveFile[] = [];
  const identity = createHash('sha256');
  let remaining = indexBudget;
  for (const pair of pairs) {
    const file = path.join(directory, pair.cat);
    const dat = path.join(directory, pair.dat);
    const catStamp = await physicalStamp(file);
    const datStamp = await physicalStamp(dat);
    if (!catStamp.isFile() || catStamp.nlink !== 1n || !datStamp.isFile() || datStamp.nlink !== 1n) {
      throw new Error('The extension catalog inputs are not physical files.');
    }
    const size = Number(catStamp.size);
    if (size > remaining || size > MAX_CAT_MANIFEST_BYTES) throw new Error('The catalog indexes exceed their read budget.');
    remaining -= size;
    chargeRead?.(size);
    const data = { file: dat, stamp: datStamp };
    const definedHere = new Set<string>();
    identity.update(pair.cat).update('\0').update(pair.dat).update('\0');
    const dataLength = await scanCatalogIndex({ file, stamp: catStamp }, rowLimit, identity, entry => {
      const direct = scriptPath.exec(entry.name);
      if (!direct || hasInvalidNavigationPathCharacters(entry.name)) return;
      const logical = `${direct[1].toLowerCase()}/${direct[2]}`;
      const key = (gameRootPaths ? entry.name : logical).toLowerCase();
      if (definedHere.has(key)) throw new Error('The catalog contains duplicate script paths.');
      if (!scripts.has(key) && scripts.size >= REFERENCE_SYMBOL_FILE_LIMIT) {
        throw new Error('The catalog contains more scripts than the symbol inventory allows.');
      }
      definedHere.add(key);
      scripts.set(key, { archive: pair.cat, data, entry, logical });
    });
    if (datStamp.size !== BigInt(dataLength)) throw new Error('The catalog index does not cover its data volume.');
    parts.push({ file, stamp: catStamp }, data);
    identity.update('\0');
    for (const stamp of [catStamp, datStamp]) {
      identity.update([stamp.dev, stamp.ino, stamp.size, stamp.mtimeNs, stamp.ctimeNs].join(':')).update('\0');
    }
  }
  if (!(await extensionScriptCatalogsCurrent(parts))) throw new Error('The numbered extension catalog changed during inventory.');
  return { identity: identity.digest('hex'), parts, scripts };
}

/** Keep one read buffer and retain only the current line and wanted entries. */
async function scanCatalogIndex(
  input: ArchiveFile, rowLimit: number, digest: ReturnType<typeof createHash>, accept: (entry: CatEntry) => void,
): Promise<number> {
  return withDiskInput(input, async handle => {
    const buffer = Buffer.alloc(INDEX_CHUNK_BYTES);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const parser = createCatManifestParser({ strict: true, maxEntries: rowLimit });
    let tail = '';
    const acceptLine = (line: string) => {
      if (line.length > MAX_INDEX_LINE_CHARS) throw new Error('A CAT index line exceeds its read limit.');
      const entry = parser.line(line);
      if (entry) accept(entry);
    };
    const size = Number(input.stamp.size);
    for (let offset = 0; offset < size;) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - offset), offset);
      if (bytesRead === 0) throw new Error('The CAT index ended before its expected length.');
      offset += bytesRead;
      const bytes = buffer.subarray(0, bytesRead);
      digest.update(bytes);
      const text = tail + decoder.decode(bytes, { stream: true });
      let start = 0;
      for (let end = text.indexOf('\n'); end >= 0; end = text.indexOf('\n', start)) {
        acceptLine(text.slice(start, end));
        start = end + 1;
      }
      tail = text.slice(start);
      if (tail.length > MAX_INDEX_LINE_CHARS) throw new Error('A CAT index line exceeds its read limit.');
    }
    acceptLine(tail + decoder.decode());
    return parser.dataLength;
  });
}

export async function extensionScriptCatalogsCurrent(parts: readonly ArchiveFile[]): Promise<boolean> {
  for (const part of parts) {
    const stamp = await physicalStamp(part.file).catch(() => undefined);
    if (!stamp || !sameStamp(part.stamp, stamp)) return false;
  }
  return true;
}

export async function readPackedScript(input: PackedScriptInput): Promise<Buffer> {
  const bytes = await readDiskInput(input.data, input.entry);
  if (createHash('md5').update(bytes).digest('hex') !== input.entry.md5) {
    throw new Error('The selected extension catalog script checksum differs.');
  }
  return bytes;
}
