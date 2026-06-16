/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { extractEntries } from './x4CatDat';

export type X4ObjectKind = 'ship' | 'station' | 'ware' | 'faction' | 'sound' | 'job' | 'aiscript' | 'md_element' | 'macro';

export interface X4IndexedObject {
  id: string;
  name: string;
  kind: X4ObjectKind;
  sourceFile: string;
  detail?: string;
}

export interface X4ObjectIndex {
  generatedAt: string;
  roots: string[];
  scannedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  /** number of .cat/.dat archive pairs the packed scan walked */
  packedArchives: number;
  /** number of packed XML entries actually extracted and scanned */
  packedEntriesScanned: number;
  counts: Record<X4ObjectKind, number>;
  items: X4IndexedObject[];
}

const MAX_XML_FILES = 15000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const KINDS: X4ObjectKind[] = ['ship', 'station', 'ware', 'faction', 'sound', 'job', 'aiscript', 'md_element', 'macro'];

/**
 * Whitelist of packed entries worth extracting for the object browser. Keeping
 * this tight avoids reading thousands of individual macro files: the catalog
 * indexes already enumerate every ship/station, and the libraries cover the
 * remaining domains.
 */
function isWantedPackedEntry(name: string): boolean {
  const n = name.toLowerCase();
  if (n === 'index/macros.xml' || n === 'index/components.xml') return true;
  if (n === 'libraries/factions.xml') return true;
  if (n === 'libraries/wares.xml') return true;
  if (n === 'libraries/jobs.xml') return true;
  if (n === 'libraries/sounds.xml' || n === 'libraries/soundlibrary.xml' || n === 'index/sounds.xml' || n === 'libraries/sound_library.xml') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Localization (t/) resolution — H8.
// X4 display names live in t-files keyed by {page,id} refs. Without resolving
// them the browser shows raw refs like `{20201,401}` and human search
// ("behemoth", "energy cells") matches nothing. We index the English text
// (…-l044.xml) into a {page,id}->text map and resolve name refs to readable text.
// ---------------------------------------------------------------------------
const LOCALIZATION_FILE_RE = /(?:^|[\\/])t[\\/]\d{4}-l044\.xml$/i;
const LOC_REF = /\{\s*(\d+)\s*,\s*(\d+)\s*\}/;
const LOC_REF_GLOBAL = /\{\s*(\d+)\s*,\s*(\d+)\s*\}/g;

export type LocalizationMap = Map<string, string>;

function isLocalizationFile(name: string): boolean {
  return LOCALIZATION_FILE_RE.test(name);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _m; } })
    .replace(/&#(\d+);/g, (_m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _m; } })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Parse an X4 t-file (`<page id><t id>text</t></page>`) into the loc map. Later
 *  calls override earlier entries for the same key (DLC/extension text wins). */
function parseLocalizationXml(xml: string, map: LocalizationMap): void {
  for (const pageMatch of xml.matchAll(/<page\b[^>]*\bid\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/page>/gi)) {
    const page = pageMatch[1];
    const body = pageMatch[2];
    for (const tMatch of body.matchAll(/<t\b[^>]*\bid\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/t>/gi)) {
      map.set(`${page},${tMatch[1]}`, tMatch[2]);
    }
  }
}

/** Recursively replace {page,id} refs with their text (t-strings can nest refs). */
function expandLocRefs(raw: string, map: LocalizationMap, depth = 0): string {
  if (!raw || depth > 5 || raw.indexOf('{') === -1) return raw;
  return raw.replace(LOC_REF_GLOBAL, (full, p, i) => {
    const v = map.get(`${p},${i}`);
    return v == null ? full : expandLocRefs(v, map, depth + 1);
  });
}

/**
 * Strip X4 localization comments. X4 treats text inside unescaped parentheses
 * `( … )` as a non-displayed comment (removed before display); a literal
 * parenthesis is escaped as `\(` / `\)`. Comments may nest. e.g.
 * "(Behemoth Vanguard)Behemoth Vanguard" → "Behemoth Vanguard".
 */
function stripX4Comments(s: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === ')')) {
      if (depth === 0) out += s[i + 1]; // escaped paren is a literal char
      i++;
      continue;
    }
    if (c === '(') { depth++; continue; }
    if (c === ')') { if (depth > 0) depth--; continue; }
    if (depth === 0) out += c;
  }
  return out;
}

/**
 * Resolve a raw `name` attribute that is (or contains) a {page,id} ref into
 * readable text. Returns null when the input isn't a ref or can't be resolved,
 * so callers can fall back to a sensible label. Decodes entities and removes
 * X4 parenthetical comments.
 */
function resolveLocName(rawName: string, map: LocalizationMap | undefined): string | null {
  if (!rawName || !map || !LOC_REF.test(rawName)) return null;
  const expanded = expandLocRefs(rawName.trim(), map);
  if (expanded.indexOf('{') !== -1) return null; // a ref stayed unresolved
  const text = stripX4Comments(decodeXmlEntities(expanded))
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function addUnique(items: X4IndexedObject[], seen: Set<string>, item: X4IndexedObject) {
  const key = `${item.kind}:${item.id}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

function walkXmlFiles(root: string, out: string[], state: { skipped: number; truncated: boolean }) {
  if (out.length >= MAX_XML_FILES) {
    state.truncated = true;
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    state.skipped++;
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_XML_FILES) {
      state.truncated = true;
      return;
    }
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkXmlFiles(fullPath, out, state);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
      out.push(fullPath);
    }
  }
}

function extractAttr(tag: string, attr: string): string {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*"([^"]+)"`, 'i'));
  return match?.[1] || '';
}

function labelFromId(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

/** Classify an X4 macro/entry name into a browser object kind by its prefix. */
function classifyMacroName(id: string): X4ObjectKind {
  const lower = id.toLowerCase();
  if (lower.startsWith('ship_')) return 'ship';
  const stationPrefixes = ['station_', 'struct_', 'prod_', 'buildmodule_', 'dockarea_', 'pier_', 'hab_', 'storage_', 'defence_', 'def_', 'conn_', 'module_', 'landmark_', 'venture_'];
  if (stationPrefixes.some(p => lower.startsWith(p))) return 'station';
  return 'macro';
}

/**
 * Parse an X4 `index/macros.xml` (or `index/components.xml`) catalog. These map
 * every macro/component name to a source path via `<entry name="..." value="..."/>`
 * and are the cheapest way to enumerate all ships/stations in a packed install.
 */
function scanMacroIndex(xml: string, sourceFile: string, items: X4IndexedObject[], seen: Set<string>) {
  for (const match of xml.matchAll(/<entry\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const id = match[1];
    if (!id) continue;
    const kind = classifyMacroName(id);
    addUnique(items, seen, {
      id,
      name: labelFromId(id),
      kind,
      sourceFile,
      detail: kind === 'macro' ? 'macro (packed index)' : `${kind} macro (packed index)`
    });
  }
}

/** Core content scanner shared by loose-file and packed-archive paths. */
function scanXmlContent(xml: string, sourceFile: string, lowerPathHint: string, items: X4IndexedObject[], seen: Set<string>, locMap?: LocalizationMap) {
  const relative = sourceFile;
  const lowerPath = lowerPathHint;

  // Catalog indexes (index/macros.xml, index/components.xml) use <entry name=...>.
  const isCatalogPath = /(?:^|[\\/])index[\\/](?:macros|components)\.xml$/i.test(lowerPath);
  const looksLikeCatalog = /<index\b/i.test(xml) && /<entry\b[^>]*\bname=/i.test(xml) && !/<macro\b/i.test(xml);
  if (isCatalogPath || looksLikeCatalog) {
    scanMacroIndex(xml, sourceFile, items, seen);
  }

  for (const match of xml.matchAll(/<macro\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    const macroClass = extractAttr(tag, 'class');
    const kind: X4ObjectKind = id.startsWith('ship_') || macroClass === 'ship'
      ? 'ship'
      : id.startsWith('station_') || macroClass === 'station'
        ? 'station'
        : 'macro';
    // Pull the human display name from this macro's <identification name="{page,id}"/>
    // (the first one after the <macro> tag — correct for the usual one-macro-per-file).
    let displayName = labelFromId(id);
    const idStart = (match.index ?? 0) + tag.length;
    const idMatch = xml.slice(idStart).match(/<identification\b[^>]*\bname\s*=\s*"([^"]+)"/i);
    if (idMatch) {
      const resolved = resolveLocName(idMatch[1], locMap);
      if (resolved) displayName = resolved;
    }
    addUnique(items, seen, {
      id,
      name: displayName,
      kind,
      sourceFile: relative,
      detail: macroClass ? `macro class=${macroClass}` : 'macro'
    });
  }

  for (const match of xml.matchAll(/<ware\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    const rawName = extractAttr(tag, 'name');
    const resolved = resolveLocName(rawName, locMap);
    // Prefer resolved display name; never surface a raw {page,id} ref.
    const name = resolved || (rawName && !LOC_REF.test(rawName) ? rawName : labelFromId(id));
    addUnique(items, seen, {
      id,
      name,
      kind: 'ware',
      sourceFile: relative,
      detail: extractAttr(tag, 'transport') ? `transport=${extractAttr(tag, 'transport')}` : 'ware'
    });
  }

  for (const match of xml.matchAll(/<faction\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    const rawName = extractAttr(tag, 'name');
    const resolved = resolveLocName(rawName, locMap);
    const name = resolved || (rawName && !LOC_REF.test(rawName) ? rawName : id.toUpperCase());
    addUnique(items, seen, {
      id: `faction.${id}`,
      name,
      kind: 'faction',
      sourceFile: relative,
      detail: 'faction'
    });
  }

  for (const match of xml.matchAll(/<job\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const id = match[1];
    addUnique(items, seen, {
      id,
      name: labelFromId(id),
      kind: 'job',
      sourceFile: relative,
      detail: 'job'
    });
  }

  if (/(?:^|[\\/])aiscripts[\\/]/i.test(lowerPath)) {
    const base = sourceFile.split('\\').join('/');
    const name = base.slice(base.lastIndexOf('/') + 1).replace(/\.xml$/i, '');
    if (name) {
      addUnique(items, seen, {
        id: name,
        name: labelFromId(name),
        kind: 'aiscript',
        sourceFile: relative,
        detail: 'aiscript file'
      });
    }
  }

  if (lowerPath.includes('sound')) {
    for (const match of xml.matchAll(/<(?:sound|entry)\b[^>]*(?:\bid|\bname)\s*=\s*"([^"]+)"[^>]*>/gi)) {
      const id = match[1];
      addUnique(items, seen, {
        id: id.startsWith('sound.') ? id : `sound.${id}`,
        name: labelFromId(id),
        kind: 'sound',
        sourceFile: relative,
        detail: 'sound reference'
      });
    }
  }
}

function scanXmlFile(filePath: string, items: X4IndexedObject[], seen: Set<string>, locMap?: LocalizationMap) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_BYTES) return false;
  const xml = fs.readFileSync(filePath, 'utf8');
  scanXmlContent(xml, filePath, filePath.toLowerCase(), items, seen, locMap);
  return true;
}

const MAX_LOC_FILE_BYTES = 64 * 1024 * 1024; // t-files can be several MB

export function buildX4ObjectIndex(
  roots: string[],
  schemaElements: Array<{ tag: string; category?: string; description?: string }> = [],
  catDatRoots: string[] = []
): X4ObjectIndex {
  const existingRoots = roots
    .filter(Boolean)
    .map(root => path.normalize(root))
    .filter((root, index, list) => fs.existsSync(root) && fs.statSync(root).isDirectory() && list.findIndex(other => other.toLowerCase() === root.toLowerCase()) === index);

  const state = { skipped: 0, truncated: false };
  const files: string[] = [];
  existingRoots.forEach(root => walkXmlFiles(root, files, state));

  const items: X4IndexedObject[] = [];
  const seen = new Set<string>();
  let scannedFiles = 0;

  // ---- Pass 1: build the localization map (loose t-files) so display names
  // and search resolve to readable text instead of raw {page,id} refs (H8). ----
  const locMap: LocalizationMap = new Map();
  const looseItemFiles: string[] = [];
  for (const file of files) {
    if (isLocalizationFile(file.toLowerCase())) {
      try {
        const stat = fs.statSync(file);
        if (stat.size <= MAX_LOC_FILE_BYTES) parseLocalizationXml(fs.readFileSync(file, 'utf8'), locMap);
      } catch {
        state.skipped++;
      }
    } else {
      looseItemFiles.push(file);
    }
  }

  // Packed .cat/.dat archives: extract a small whitelist of high-value catalog
  // and library files (plus the English t-files) so ships/stations/factions/
  // wares/sounds populate with readable names even when the install ships them
  // packed (the default for a Steam X4 install).
  let packedArchives = 0;
  let packedEntriesScanned = 0;
  const packedItemMatches: { name: string; text: string }[] = [];
  const packedRoots = catDatRoots
    .filter(Boolean)
    .map(r => path.normalize(r))
    .filter((r, i, list) => list.findIndex(o => o.toLowerCase() === r.toLowerCase()) === i);
  if (packedRoots.length) {
    try {
      const result = extractEntries(packedRoots, n => isWantedPackedEntry(n) || isLocalizationFile(n), { dedupeByName: false });
      packedArchives = result.archiveCount;
      for (const match of result.matches) {
        if (isLocalizationFile(match.name.toLowerCase())) {
          try { parseLocalizationXml(match.text, locMap); } catch { state.skipped++; }
        } else {
          packedItemMatches.push(match);
        }
      }
    } catch {
      /* archive scan failed — fall back to loose-only index */
    }
  }

  // ---- Pass 2: scan item-bearing files with the loc map in hand. ----
  for (const file of looseItemFiles) {
    try {
      if (scanXmlFile(file, items, seen, locMap)) scannedFiles++;
    } catch {
      state.skipped++;
    }
  }
  for (const match of packedItemMatches) {
    try {
      scanXmlContent(match.text, match.name, match.name.toLowerCase(), items, seen, locMap);
      packedEntriesScanned++;
    } catch {
      state.skipped++;
    }
  }

  // Enrich ship/station display names from their matching ware entry. On packed
  // installs ships/stations come from index/macros.xml (no <identification>), so
  // they fall back to id-derived labels; the ware in libraries/wares.xml carries
  // the localized name. Ware id == macro id without the trailing `_macro`.
  const wareNameById = new Map<string, string>();
  for (const it of items) {
    if (it.kind === 'ware') wareNameById.set(it.id.toLowerCase(), it.name);
  }
  for (const it of items) {
    if (it.kind !== 'ship' && it.kind !== 'station') continue;
    if (it.name !== labelFromId(it.id)) continue; // already has a real display name
    const wareId = it.id.toLowerCase().replace(/_macro$/, '');
    const wareName = wareNameById.get(wareId);
    if (wareName && wareName !== labelFromId(wareId)) it.name = wareName;
  }

  schemaElements.forEach(element => {
    addUnique(items, seen, {
      id: element.tag,
      name: element.tag,
      kind: 'md_element',
      sourceFile: 'schema-library',
      detail: element.category || element.description || 'Mission Director schema element'
    });
  });

  const counts = KINDS.reduce((acc, kind) => {
    acc[kind] = items.filter(item => item.kind === kind).length;
    return acc;
  }, {} as Record<X4ObjectKind, number>);

  return {
    generatedAt: new Date().toISOString(),
    roots: existingRoots,
    scannedFiles,
    skippedFiles: state.skipped,
    truncated: state.truncated,
    packedArchives,
    packedEntriesScanned,
    counts,
    items: items.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
  };
}

export function filterX4ObjectIndex(index: X4ObjectIndex, options: { q?: string; kind?: string; limit?: number }): X4ObjectIndex {
  const query = (options.q || '').trim().toLowerCase();
  const kind = (options.kind || '').trim();
  const limit = Math.max(1, Math.min(options.limit || 500, 2000));
  const items = index.items
    .filter(item => !kind || kind === 'all' || item.kind === kind)
    .filter(item => {
      if (!query) return true;
      return item.id.toLowerCase().includes(query)
        || item.name.toLowerCase().includes(query)
        || (item.detail || '').toLowerCase().includes(query)
        || item.sourceFile.toLowerCase().includes(query);
    })
    .slice(0, limit);

  return {
    ...index,
    items
  };
}
