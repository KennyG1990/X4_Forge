import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseCatManifest } from '../lib/x4CatDat';
import { readX4MenuLuaPaths } from '../lib/x4UiSourceBundle';
import type { DeploymentSnapshot } from './deploymentSnapshot';

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_CATALOG_FILES = 32;
const EXTENSION_CATALOG_PART = /^ext_(?:\d{2}(?:_diff_v\d{3,})?|v\d{3,})\.(cat|dat)$/i;
const VERSIONED_CATALOG_PART = /^ext_(?:\d{2}_diff_)?v\d{3,}\.(cat|dat)$/i;

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function sameFile(before: fs.BigIntStats, after: fs.BigIntStats): boolean {
  return after.isFile() && before.dev === after.dev && before.ino === after.ino
    && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

function withRegularFile<T>(root: string, name: string, read: (fd: number, size: number) => T): T {
  const file = path.join(root, name);
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || pathKey(fs.realpathSync.native(file)) !== pathKey(file)) {
    throw new Error('Installed manifest inputs must be contained regular files.');
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true }))) throw new Error('Installed manifest input changed.');
    const result = read(fd, Number(before.size));
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true })) || !sameFile(before, fs.lstatSync(file, { bigint: true }))) {
      throw new Error('Installed manifest input changed.');
    }
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

function installedUiManifest(target: string): string | undefined {
  const directory = fs.lstatSync(target, { bigint: true, throwIfNoEntry: false });
  if (!directory) return;
  if (!directory.isDirectory()) throw new Error('Installed target is not a regular directory.');
  const root = fs.realpathSync.native(target);
  const physical = fs.lstatSync(root, { bigint: true });
  if (!physical.isDirectory() || physical.dev !== directory.dev || physical.ino !== directory.ino) {
    throw new Error('Installed target directory changed.');
  }
  const names = fs.readdirSync(root);
  if (names.some(name => VERSIONED_CATALOG_PART.test(name))) {
    throw new Error('Versioned catalogs need an active-game manifest selection.');
  }
  const loose = names.filter(name => name.toLowerCase() === 'ui.xml');
  if (loose.length > 1) throw new Error('Installed loose ui.xml is ambiguous.');
  if (loose.length) return withRegularFile(root, loose[0], (fd, size) => {
    if (size > MAX_MANIFEST_BYTES) throw new Error('Installed ui.xml exceeds the read limit.');
    return decode(readBytes(fd, 0, size));
  });

  const volumes = names.filter(name => /^ext_\d{2}\.(cat|dat)$/i.test(name));
  const byName = new Map(volumes.map(name => [name.toLowerCase(), name]));
  if (volumes.length > MAX_CATALOG_FILES || byName.size !== volumes.length) {
    throw new Error('Installed catalog inventory is outside the read limits.');
  }
  let remaining = MAX_INDEX_BYTES;
  let manifest: string | undefined;
  for (const [name, volume] of byName) {
    const catalog = name.endsWith('.cat');
    const pair = byName.get(name.slice(0, -4) + (catalog ? '.dat' : '.cat'));
    if (!pair) throw new Error('Installed catalog volume is missing its pair.');
    if (!catalog) continue;
    const entries = withRegularFile(root, volume, (fd, size) => {
      if (size > remaining) throw new Error('Installed catalog indexes exceed the read limit.');
      remaining -= size;
      return parseCatManifest(decode(readBytes(fd, 0, size)), { strict: true, maxEntries: 16_384 });
    });
    const end = entries.at(-1);
    const matches = entries.filter(entry => entry.name.toLowerCase() === 'ui.xml');
    withRegularFile(root, pair, (fd, size) => {
      if ((end ? end.offset + end.size : 0) !== size) throw new Error('Installed catalog index does not cover its data volume.');
      if (!matches.length) return;
      const entry = matches[0];
      if (manifest !== undefined || matches.length !== 1 || entry.size > MAX_MANIFEST_BYTES) {
        throw new Error('Installed packed ui.xml is ambiguous or oversized.');
      }
      const bytes = readBytes(fd, entry.offset, entry.size);
      if (createHash('md5').update(bytes).digest('hex') !== entry.md5) throw new Error('Installed packed ui.xml checksum differs.');
      manifest = decode(bytes);
    });
  }
  return manifest;
}

/** Compare the exact reviewed artifact with the native target before any write. */
export function previewLuaRegistrationChange(snapshot: DeploymentSnapshot, target: string, preserved: readonly string[]) {
  const unavailable = { status: 'unavailable' as const, detail: 'Forge could not compare the prior and planned Lua registrations.' };
  const planned = snapshot.plan.entries.filter(file => file.path.toLowerCase() === 'ui.xml');
  if (!planned.length) return null;
  const manifest = snapshot.files.find(file => file.path === planned[0].path);
  if (planned.length !== 1 || planned[0].size > MAX_MANIFEST_BYTES || typeof manifest?.content !== 'string') return unavailable;
  if (snapshot.plan.entries.some(file => EXTENSION_CATALOG_PART.test(file.path))
    || preserved.some(name => EXTENSION_CATALOG_PART.test(name)
      || (snapshot.manifest.format === 'catalog' && !planned[0].catalogLoose && name.toLowerCase() === 'ui.xml'))) return unavailable;
  try {
    const next = readX4MenuLuaPaths(manifest.content, true);
    if (!next) return unavailable;
    if (!next.size) return null;
    const priorText = installedUiManifest(target);
    const prior = priorText === undefined ? [] : readX4MenuLuaPaths(priorText, true);
    if (!prior) return unavailable;
    const previous = new Set([...prior].map(pathKey));
    const uniqueNext = new Map([...next].map(name => [pathKey(name), name]));
    const added = [...uniqueNext].filter(([name]) => !previous.has(name)).map(([, name]) => name).sort();
    return added.length ? { status: 'added' as const, addedCount: added.length,
      addedPaths: added.slice(0, 64), restartMayBeRequired: true as const } : null;
  } catch {
    return unavailable;
  }
}
