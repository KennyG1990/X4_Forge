/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * X4 Foundations packed archive (.cat / .dat) reader.
 *
 * Format (same as X Rebirth):
 *   - A `.cat` file is a UTF-8 manifest. Each non-empty line describes one
 *     packed file as:  `<relative/path> <byteSize> <unixTimestamp> <md5hash>`
 *     The path may itself contain spaces, so the three trailing tokens
 *     (size, timestamp, hash) are parsed from the RIGHT.
 *   - The paired `.dat` file (same basename) is the raw concatenation of every
 *     listed file's bytes, in manifest order, with no separators or headers.
 *     The byte offset of entry N is the sum of all preceding entry sizes.
 *
 * We never read a whole `.dat` into memory — only the exact byte range of the
 * entries we want (via a positioned `fs.readSync`).
 */

import fs from 'fs';
import path from 'path';

export interface CatEntry {
  /** forward-slash normalized relative path, e.g. "libraries/wares.xml" */
  name: string;
  size: number;
  offset: number;
}

export interface CatDatArchive {
  catPath: string;
  datPath: string;
  entries: CatEntry[];
}

/** Parse a single `.cat` manifest into entries with computed byte offsets. */
export function parseCat(catPath: string): CatEntry[] {
  const text = fs.readFileSync(catPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const entries: CatEntry[] = [];
  let offset = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(' ');
    if (parts.length < 4) continue;
    const size = parseInt(parts[parts.length - 3], 10);
    if (!Number.isFinite(size) || size < 0) continue;
    const name = parts.slice(0, parts.length - 3).join(' ').replace(/\\/g, '/');
    entries.push({ name, size, offset });
    offset += size;
  }
  return entries;
}

/**
 * Enumerate usable `.cat`/`.dat` archive pairs under the given roots.
 * Looks at each root directory itself (base game `01.cat`..`NN.cat`) and one
 * level of `extensions/<id>/` subfolders (DLC `ext_NN.cat`).
 *
 * @param includeSubst include `subst_*.cat` substitution archives (default false).
 */
export function findCatDatArchives(roots: string[], includeSubst = false): CatDatArchive[] {
  const archives: CatDatArchive[] = [];
  const seenCat = new Set<string>();

  const collectFromDir = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const lower = e.name.toLowerCase();
      if (!lower.endsWith('.cat')) continue;
      if (!includeSubst && lower.startsWith('subst_')) continue;
      const catPath = path.join(dir, e.name);
      const datPath = catPath.slice(0, -4) + '.dat';
      const key = catPath.toLowerCase();
      if (seenCat.has(key)) continue;
      if (!fs.existsSync(datPath)) continue;
      seenCat.add(key);
      archives.push({ catPath, datPath, entries: [] });
    }
  };

  for (const root of roots) {
    if (!root) continue;
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(root);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    // Base archives in the root itself.
    collectFromDir(root);
    // One level of extension archives.
    const extRoot = path.join(root, 'extensions');
    try {
      if (fs.existsSync(extRoot) && fs.statSync(extRoot).isDirectory()) {
        for (const ext of fs.readdirSync(extRoot, { withFileTypes: true })) {
          if (ext.isDirectory()) collectFromDir(path.join(extRoot, ext.name));
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Sort so lower-numbered base archives come first, archives are deterministic.
  archives.sort((a, b) => a.catPath.toLowerCase().localeCompare(b.catPath.toLowerCase()));
  return archives;
}

/** Read the raw bytes of one entry from its `.dat` using a positioned read. */
export function readEntryBytes(datPath: string, entry: CatEntry): Buffer {
  const fd = fs.openSync(datPath, 'r');
  try {
    const buf = Buffer.allocUnsafe(entry.size);
    let read = 0;
    while (read < entry.size) {
      const n = fs.readSync(fd, buf, read, entry.size - read, entry.offset + read);
      if (n <= 0) break;
      read += n;
    }
    return read === entry.size ? buf : buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/** Read one entry as UTF-8 text. */
export function readEntryText(datPath: string, entry: CatEntry): string {
  return readEntryBytes(datPath, entry).toString('utf8');
}

export interface ExtractMatch {
  name: string;
  text: string;
  catPath: string;
}

/**
 * Walk all archives under `roots` and extract the text of every entry whose
 * normalized name satisfies `wanted(name)`. Later archives (DLC/patches) take
 * precedence for an identical path, mirroring X4's override order.
 *
 * @param maxBytesPerEntry skip entries larger than this (default 48 MB).
 */
export function extractEntries(
  roots: string[],
  wanted: (name: string) => boolean,
  options: { maxBytesPerEntry?: number; includeSubst?: boolean; dedupeByName?: boolean } = {}
): { matches: ExtractMatch[]; archiveCount: number; entryCount: number } {
  const maxBytes = options.maxBytesPerEntry ?? 48 * 1024 * 1024;
  // Default true: one result per path (last archive wins) — correct for fetching
  // a single base file. Pass false to accumulate EVERY archive's copy, which is
  // required for additive catalogs (each DLC ships its own index/macros.xml and
  // libraries/factions.xml containing only that DLC's additions).
  const dedupe = options.dedupeByName !== false;
  const archives = findCatDatArchives(roots, options.includeSubst);
  const byName = new Map<string, ExtractMatch>();
  const all: ExtractMatch[] = [];
  let entryCount = 0;

  for (const archive of archives) {
    let entries: CatEntry[];
    try {
      entries = parseCat(archive.catPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      entryCount++;
      if (entry.size <= 0 || entry.size > maxBytes) continue;
      const lname = entry.name.toLowerCase();
      if (!wanted(lname)) continue;
      try {
        const text = readEntryText(archive.datPath, entry);
        const match = { name: entry.name, text, catPath: archive.catPath };
        if (dedupe) {
          byName.set(lname, match); // archives are sorted ascending; later wins
        } else {
          all.push(match);
        }
      } catch {
        /* unreadable entry — skip */
      }
    }
  }

  return { matches: dedupe ? [...byName.values()] : all, archiveCount: archives.length, entryCount };
}

/**
 * Diagnostic helper: enumerate archives under the given roots and, for each,
 * report entry count, whether the key catalog/library files are present, and a
 * small sample of entry names. Used to debug why an install indexes few rows.
 */
export function debugScan(roots: string[], includeSubst = false) {
  const archives = findCatDatArchives(roots, includeSubst);
  const wantedNames = ['index/macros.xml', 'index/components.xml', 'libraries/factions.xml', 'libraries/wares.xml', 'libraries/jobs.xml'];
  const report = archives.map(a => {
    let entries: CatEntry[] = [];
    let parseError: string | null = null;
    try {
      entries = parseCat(a.catPath);
    } catch (e: any) {
      parseError = String(e?.message || e);
    }
    const names = entries.map(e => e.name.toLowerCase());
    const found: Record<string, boolean> = {};
    for (const w of wantedNames) found[w] = names.includes(w);
    return {
      catPath: a.catPath,
      datExists: fs.existsSync(a.datPath),
      entryCount: entries.length,
      parseError,
      found,
      sampleNames: entries.slice(0, 6).map(e => e.name),
      firstLineRaw: (() => { try { return fs.readFileSync(a.catPath, 'utf8').split(/\r?\n/)[0].slice(0, 160); } catch { return null; } })()
    };
  });
  return { roots, archiveCount: archives.length, archives: report };
}

/**
 * Locate and extract a single game file by its relative path (case-insensitive),
 * e.g. "libraries/wares.xml". Returns the merged/overridden content (last
 * archive wins) or null if not found in any archive.
 */
export function extractGameFile(roots: string[], relativePath: string): ExtractMatch | null {
  const target = relativePath.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '');
  const result = extractEntries(roots, name => name === target, { includeSubst: true });
  return result.matches[0] || null;
}

/**
 * Extract a single file from the BASE-GAME archives only — i.e. `.cat`/`.dat`
 * pairs that live directly in the game root, ignoring `extensions/<dlc>/`
 * archives whose copies are additive/partial. This yields the canonical full
 * base file (e.g. the complete `libraries/wares.xml`) that XML `<diff>` patches
 * are authored against. Returns the highest-numbered base archive's copy
 * (later base archives patch earlier ones) or null.
 */
export function extractBaseGameFile(gameRoot: string, relativePath: string): ExtractMatch | null {
  if (!gameRoot) return null;
  const target = relativePath.replace(/\\/g, '/').toLowerCase().replace(/^\/+/, '');
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(gameRoot);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return null;

  let entriesDir: fs.Dirent[];
  try {
    entriesDir = fs.readdirSync(gameRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  // Root-level .cat files only, sorted ascending so the last (highest patch) wins.
  const cats = entriesDir
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.cat') && !e.name.toLowerCase().startsWith('subst_'))
    .map(e => e.name)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let found: ExtractMatch | null = null;
  for (const catName of cats) {
    const catPath = path.join(gameRoot, catName);
    const datPath = catPath.slice(0, -4) + '.dat';
    if (!fs.existsSync(datPath)) continue;
    let entries: CatEntry[];
    try {
      entries = parseCat(catPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.toLowerCase() !== target) continue;
      try {
        found = { name: entry.name, text: readEntryText(datPath, entry), catPath };
      } catch {
        /* skip */
      }
    }
  }
  return found;
}
