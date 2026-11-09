import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseCatManifest } from '../lib/x4CatDat';
import { readContentManifestIdentity } from '../lib/validationEvidence';

export const MAX_INSTALLED_ROOT_FILE_BYTES = 64 * 1024;
const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_CATALOG_FILES = 32;
const VERSIONED_CATALOG_PART = /^ext_(?:\d{2}_diff_)?v\d{3,}\.(cat|dat)$/i;

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

/** Read exact extension-root text files with loose precedence and bounded catalog validation. */
export function readInstalledExtensionRootFiles(target: string, filenames: readonly string[]): Map<string, string> {
  if (filenames.some(name => !/^[a-z0-9_.-]+$/i.test(name) || name === '.' || name === '..')) {
    throw new Error('Installed extension lookup requires root filenames.');
  }
  const result = new Map<string, string>();
  if (!filenames.length) return result;
  const directory = fs.lstatSync(target, { bigint: true, throwIfNoEntry: false });
  if (!directory) return result;
  if (!directory.isDirectory()) throw new Error('Installed target is not a regular directory.');
  const root = fs.realpathSync.native(target);
  const physical = fs.lstatSync(root, { bigint: true });
  if (!physical.isDirectory() || !sameStamp(directory, physical)) throw new Error('Installed target directory changed.');
  const names = fs.readdirSync(root);
  if (names.some(name => VERSIONED_CATALOG_PART.test(name))) {
    throw new Error('Versioned catalogs need an active-game manifest selection.');
  }

  const observed = new Map<string, fs.BigIntStats>();
  const packedNames = new Set(filenames.map(name => name.toLowerCase()));
  for (const name of packedNames) {
    const loose = names.filter(file => file.toLowerCase() === name);
    if (!loose.length) continue;
    if (loose.length > 1) throw new Error('Installed loose root file is ambiguous.');
    result.set(name, withRegularFile(root, loose[0], observed, (fd, size) => {
      if (size > MAX_INSTALLED_ROOT_FILE_BYTES) throw new Error('Installed loose root file exceeds the read limit.');
      return decode(readBytes(fd, 0, size));
    }));
    packedNames.delete(name);
  }

  if (packedNames.size) {
    const volumes = names.filter(name => /^ext_\d{2}\.(cat|dat)$/i.test(name));
    const byName = new Map(volumes.map(name => [name.toLowerCase(), name]));
    if (volumes.length > MAX_CATALOG_FILES || byName.size !== volumes.length) {
      throw new Error('Installed catalog inventory is outside the read limits.');
    }
    let remaining = MAX_INDEX_BYTES;
    for (const [name, volume] of byName) {
      const catalog = name.endsWith('.cat');
      const pair = byName.get(name.slice(0, -4) + (catalog ? '.dat' : '.cat'));
      if (!pair) throw new Error('Installed catalog volume is missing its pair.');
      if (!catalog) continue;
      const entries = withRegularFile(root, volume, observed, (fd, size) => {
        if (size > remaining) throw new Error('Installed catalog indexes exceed the read limit.');
        remaining -= size;
        return parseCatManifest(decode(readBytes(fd, 0, size)), { strict: true, maxEntries: 16_384 });
      });
      const end = entries.at(-1);
      withRegularFile(root, pair, observed, (fd, size) => {
        if ((end ? end.offset + end.size : 0) !== size) throw new Error('Installed catalog index does not cover its data volume.');
        for (const entry of entries) {
          const entryName = entry.name.toLowerCase();
          if (!packedNames.has(entryName)) continue;
          if (result.has(entryName) || entry.size > MAX_INSTALLED_ROOT_FILE_BYTES) {
            throw new Error('Installed packed root file is ambiguous or oversized.');
          }
          const bytes = readBytes(fd, entry.offset, entry.size);
          if (createHash('md5').update(bytes).digest('hex') !== entry.md5) throw new Error('Installed packed root file checksum differs.');
          result.set(entryName, decode(bytes));
        }
      });
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
  return result;
}
