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
function scanMacroIndex(xml: string, sourceFile: string, items: X4IndexedObject[], seen: Set<string>, macroPaths?: Map<string, string>) {
  // N2: index/components.xml lists the component twins of station macros (e.g.
  // `prod_arg_foodrations` vs `prod_arg_foodrations_macro`) which have no
  // <identification> and can never resolve — keep them OUT of the 'station' kind
  // so they don't clutter station results with id-labels.
  const isComponents = /components\.xml$/i.test(sourceFile);
  for (const match of xml.matchAll(/<entry\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    if (!id) continue;
    let kind = classifyMacroName(id);
    if (isComponents && kind === 'station') kind = 'macro';
    // N2: capture the macro's source-file path (`value`, no extension, backslashes) so a
    // bounded second pass can read its <identification name="{page,id}"/> for a real name.
    if (macroPaths && (kind === 'station' || kind === 'ship')) {
      const value = extractAttr(tag, 'value');
      if (value) macroPaths.set(id, value.replace(/\\/g, '/').toLowerCase() + '.xml');
    }
    addUnique(items, seen, {
      id,
      name: labelFromId(id),
      kind,
      sourceFile,
      detail: kind === 'macro' ? 'macro (packed index)' : `${kind} macro (packed index)`
    });
  }
}

/**
 * N2 second pass: station/ship macros enumerated from index/macros.xml carry only
 * id-labels because their real <identification> lives in their own macro file (not in
 * the cheap catalog). For those still on an id-label, do ONE bounded archive pass over
 * exactly their source files, parse each `<macro>`'s bounded <identification>, and UPDATE
 * the item's name via the loc map. Pure read; never throws past its own guard.
 */
/**
 * Pure helper (oracle-testable, no I/O): given one macro file's text, parse each
 * `<macro name>`'s BOUNDED <identification name="{page,id}"/> and UPDATE the matching
 * item's name via the loc map — but only items still on an id-label (never clobber an
 * already-resolved name). Bounding to each macro's own block prevents a later macro's
 * identification bleeding onto an earlier one (the N1 multi-macro regression). Returns
 * the number of items updated.
 */
function updateNamesFromMacroFile(byId: Map<string, X4IndexedObject>, fileText: string, locMap?: LocalizationMap): number {
  let updated = 0;
  for (const mm of fileText.matchAll(/<macro\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const it = byId.get(mm[1]);
    if (!it || it.name !== labelFromId(it.id)) continue; // only touch un-resolved items
    const start = (mm.index ?? 0) + mm[0].length;
    const end = fileText.indexOf('</macro>', start);
    const region = end === -1 ? fileText.slice(start) : fileText.slice(start, end); // bound to THIS macro
    const idMatch = region.match(/<identification\b[^>]*\bname\s*=\s*"([^"]+)"/i);
    if (idMatch) {
      const resolved = resolveLocName(idMatch[1], locMap);
      if (resolved) { it.name = resolved; updated++; }
    }
  }
  return updated;
}

function resolveStationMacroNames(packedRoots: string[], items: X4IndexedObject[], locMap: LocalizationMap | undefined, macroPaths: Map<string, string>): number {
  if (!packedRoots.length || !macroPaths.size) return 0;
  const byId = new Map(items.map(it => [it.id, it]));
  // archivePath -> still want it (item exists, kind ship/station, still id-labelled)
  const wanted = new Set<string>();
  for (const it of items) {
    if (it.kind !== 'station' && it.kind !== 'ship') continue;
    if (it.name !== labelFromId(it.id)) continue; // already resolved elsewhere
    const p = macroPaths.get(it.id);
    if (p) wanted.add(p);
  }
  if (!wanted.size) return 0;
  let updated = 0;
  try {
    const result = extractEntries(packedRoots, n => wanted.has(n), { dedupeByName: false });
    for (const m of result.matches) updated += updateNamesFromMacroFile(byId, m.text, locMap);
  } catch {
    /* archive re-scan failed — keep id-labels (no worse than before) */
  }
  return updated;
}

/** Core content scanner shared by loose-file and packed-archive paths. */
function scanXmlContent(xml: string, sourceFile: string, lowerPathHint: string, items: X4IndexedObject[], seen: Set<string>, locMap?: LocalizationMap, macroPaths?: Map<string, string>) {
  const relative = sourceFile;
  const lowerPath = lowerPathHint;

  // Catalog indexes (index/macros.xml, index/components.xml) use <entry name=...>.
  const isCatalogPath = /(?:^|[\\/])index[\\/](?:macros|components)\.xml$/i.test(lowerPath);
  const looksLikeCatalog = /<index\b/i.test(xml) && /<entry\b[^>]*\bname=/i.test(xml) && !/<macro\b/i.test(xml);
  if (isCatalogPath || looksLikeCatalog) {
    scanMacroIndex(xml, sourceFile, items, seen, macroPaths);
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
    // Pull the human display name from this macro's <identification name="{page,id}"/>.
    // Bound the search to THIS macro's block (up to its </macro>) so a multi-macro
    // file can't bleed a later macro's identification onto an earlier one.
    let displayName = labelFromId(id);
    const idStart = (match.index ?? 0) + tag.length;
    const macroEnd = xml.indexOf('</macro>', idStart);
    const region = macroEnd === -1 ? xml.slice(idStart) : xml.slice(idStart, macroEnd);
    const idMatch = region.match(/<identification\b[^>]*\bname\s*=\s*"([^"]+)"/i);
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

function scanXmlFile(filePath: string, items: X4IndexedObject[], seen: Set<string>, locMap?: LocalizationMap, macroPaths?: Map<string, string>) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_BYTES) return false;
  const xml = fs.readFileSync(filePath, 'utf8');
  scanXmlContent(xml, filePath, filePath.toLowerCase(), items, seen, locMap, macroPaths);
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
  // N2: catalog macro-id → archive file path, captured during scanning so station/ship
  // macros still on id-labels can be name-resolved by a bounded second archive pass.
  const macroPaths = new Map<string, string>();
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
      if (scanXmlFile(file, items, seen, locMap, macroPaths)) scannedFiles++;
    } catch {
      state.skipped++;
    }
  }
  for (const match of packedItemMatches) {
    try {
      scanXmlContent(match.text, match.name, match.name.toLowerCase(), items, seen, locMap, macroPaths);
      packedEntriesScanned++;
    } catch {
      state.skipped++;
    }
  }

  // ---- N2: bounded second archive pass to resolve station/ship macro display names
  // from each macro's own <identification> (the catalog only carries id-labels). ----
  resolveStationMacroNames(packedRoots, items, locMap, macroPaths);

  enrichMacroDisplayNames(items);

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

/**
 * Enrich ship/station display names from their matching ware entry. On packed
 * installs ships/stations come from index/macros.xml (no <identification>), so
 * they fall back to id-derived labels; the ware in libraries/wares.xml carries
 * the localized name. Ware id == macro id without the trailing `_macro`.
 * Mutates `items` in place. Pure (no I/O) so it's unit-testable.
 */
function enrichMacroDisplayNames(items: X4IndexedObject[]): void {
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
}

/**
 * Deterministic oracle for the H8 object-index name-resolution path. Runs on
 * synthetic in-memory fixtures only (NO disk/install dependency), so it is a
 * stable regression guard for the regex XML/localization parsing — including
 * the multi-macro `<identification>` bounding bug fixed in the 2026-06-16
 * Codex pass. House shape: { allPassed, passed, total, checks[] }.
 */
export function runObjectIndexSelftest(): {
  allPassed: boolean;
  pass: boolean;
  passed: number;
  total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const expect = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // Synthetic English t-file: page 1 with a few entries, incl. a nested ref.
  const tFile = `<?xml version="1.0"?>
<language id="44">
  <page id="1">
    <t id="10">Energy Cells</t>
    <t id="20">Argon Federation</t>
    <t id="30">(comment)Behemoth Vanguard</t>
    <t id="40">{1,20} Destroyer</t>
    <t id="50">Keep \\(this\\)</t>
  </page>
</language>`;
  const locMap: LocalizationMap = new Map();
  parseLocalizationXml(tFile, locMap);
  expect('loc-map parsed entries', locMap.size === 5, `size=${locMap.size}`);

  // Comment stripping (plain, nested, escaped).
  expect('strip leading paren comment', stripX4Comments('(Behemoth Vanguard)Behemoth Vanguard') === 'Behemoth Vanguard');
  expect('strip nested paren comment', stripX4Comments('Elite Sport(same as (Elite Sport)x)') === 'Elite Sport');
  expect('escaped parens kept literal', stripX4Comments('Keep \\(this\\)') === 'Keep (this)');

  // Ref resolution: direct, nested, non-ref, unresolved.
  expect('resolve direct ref', resolveLocName('{1,10}', locMap) === 'Energy Cells', resolveLocName('{1,10}', locMap) || '');
  expect('resolve nested ref', resolveLocName('{1,40}', locMap) === 'Argon Federation Destroyer', resolveLocName('{1,40}', locMap) || '');
  expect('resolve strips comment', resolveLocName('{1,30}', locMap) === 'Behemoth Vanguard', resolveLocName('{1,30}', locMap) || '');
  expect('non-ref returns null', resolveLocName('PlainName', locMap) === null);
  expect('unresolved ref returns null', resolveLocName('{9,99}', locMap) === null);

  // Ware + faction name resolution via scanXmlContent.
  const wfItems: X4IndexedObject[] = []; const wfSeen = new Set<string>();
  scanXmlContent(
    `<wares><ware id="energycells" name="{1,10}" transport="container"/><ware id="mysteryware" name="{9,99}"/></wares>`,
    'libraries/wares.xml', 'libraries/wares.xml', wfItems, wfSeen, locMap
  );
  scanXmlContent(
    `<factions><faction id="argon" name="{1,20}"/></factions>`,
    'libraries/factions.xml', 'libraries/factions.xml', wfItems, wfSeen, locMap
  );
  const energy = wfItems.find(i => i.id === 'energycells');
  const mystery = wfItems.find(i => i.id === 'mysteryware');
  const argon = wfItems.find(i => i.id === 'faction.argon');
  expect('ware ref resolved', energy?.name === 'Energy Cells', energy?.name);
  expect('faction ref resolved', argon?.name === 'Argon Federation', argon?.name);
  // Invariant: a raw {page,id} ref must NEVER leak into a name.
  const anyRawRef = wfItems.some(i => /\{\s*\d+\s*,\s*\d+\s*\}/.test(i.name));
  expect('no raw {page,id} leaks', !anyRawRef && mystery?.name === 'Mysteryware', mystery?.name);

  // CRITICAL regression guard for the unbounded-identification bug: macro A has
  // NO <identification>, while a LATER macro B does. The old unbounded slice
  // would wrongly assign B's name to A. Bounded lookup must leave A on its
  // id-label and give B its own resolved name.
  const mItems: X4IndexedObject[] = []; const mSeen = new Set<string>();
  const multiMacro = `<macros>
    <macro name="ship_a_macro" class="ship"><properties><physics/></properties></macro>
    <macro name="ship_b_macro" class="ship"><properties><identification name="{1,20}"/></properties></macro>
  </macros>`;
  scanXmlContent(multiMacro, 'assets/ships.xml', 'assets/ships.xml', mItems, mSeen, locMap);
  const macroA = mItems.find(i => i.id === 'ship_a_macro');
  const macroB = mItems.find(i => i.id === 'ship_b_macro');
  expect('macro A keeps label (no id, no bleed)', macroA?.name === labelFromId('ship_a_macro'), macroA?.name);
  expect('macro B gets its own name', macroB?.name === 'Argon Federation', macroB?.name);

  // Ware-enrichment: a packed ship macro (placeholder label) inherits the ware name.
  const enrichItems: X4IndexedObject[] = [
    { id: 'ship_beh_destroyer_01_a_macro', name: labelFromId('ship_beh_destroyer_01_a_macro'), kind: 'ship', sourceFile: 'index/macros.xml' },
    { id: 'ship_beh_destroyer_01_a', name: 'Behemoth Vanguard', kind: 'ware', sourceFile: 'libraries/wares.xml' },
  ];
  enrichMacroDisplayNames(enrichItems);
  const enrichedShip = enrichItems.find(i => i.kind === 'ship');
  expect('ware-enrichment fills macro name', enrichedShip?.name === 'Behemoth Vanguard', enrichedShip?.name);

  // ---- N2: catalog `value` capture, components reclassification, second-pass name update ----
  const catItems: X4IndexedObject[] = []; const catSeen = new Set<string>(); const catPaths = new Map<string, string>();
  scanMacroIndex(
    `<index><entry name="prod_arg_foodrations_macro" value="assets\\structures\\macros\\prod_arg_foodrations_macro" /></index>`,
    'index/macros.xml', catItems, catSeen, catPaths,
  );
  // D1: value captured as forward-slashed, lowercased, with .xml appended.
  expect('N2 catalog value→archive path captured',
    catPaths.get('prod_arg_foodrations_macro') === 'assets/structures/macros/prod_arg_foodrations_macro.xml',
    catPaths.get('prod_arg_foodrations_macro'));
  expect('N2 macros.xml entry classified station',
    catItems.find(i => i.id === 'prod_arg_foodrations_macro')?.kind === 'station');

  // D2: the components.xml twin is reclassified OUT of 'station' (→ macro) to cut noise.
  const compItems: X4IndexedObject[] = []; const compSeen = new Set<string>();
  scanMacroIndex(
    `<index><entry name="prod_arg_foodrations" value="assets\\structures\\components\\prod_arg_foodrations" /></index>`,
    'index/components.xml', compItems, compSeen,
  );
  expect('N2 components.xml twin not a station',
    compItems.find(i => i.id === 'prod_arg_foodrations')?.kind === 'macro');

  // D3: second-pass update — an id-labelled station gets its real name from its macro
  // file's bounded <identification>; an already-resolved item is NOT clobbered.
  const stItems: X4IndexedObject[] = [
    { id: 'prod_arg_foodrations_macro', name: labelFromId('prod_arg_foodrations_macro'), kind: 'station', sourceFile: 'index/macros.xml' },
    { id: 'ship_already_named', name: 'Custom Carrier', kind: 'ship', sourceFile: 'index/macros.xml' },
  ];
  const stById = new Map(stItems.map(it => [it.id, it]));
  const macroFile = `<macros>
    <macro name="prod_arg_foodrations_macro" class="production"><properties><identification name="{1,10}"/></properties></macro>
    <macro name="ship_already_named" class="ship"><properties><identification name="{1,20}"/></properties></macro>
  </macros>`;
  const nUpdated = updateNamesFromMacroFile(stById, macroFile, locMap);
  expect('N2 second-pass resolves id-labelled station', stItems[0].name === 'Energy Cells', stItems[0].name);
  expect('N2 second-pass does NOT clobber resolved name', stItems[1].name === 'Custom Carrier', stItems[1].name);
  expect('N2 second-pass update count = 1', nUpdated === 1, String(nUpdated));

  // D3 bounding regression: a station macro with NO <identification> must not inherit a
  // later macro's name from the same file.
  const stItems2: X4IndexedObject[] = [
    { id: 'prod_a_macro', name: labelFromId('prod_a_macro'), kind: 'station', sourceFile: 'index/macros.xml' },
  ];
  updateNamesFromMacroFile(new Map(stItems2.map(it => [it.id, it])),
    `<macros><macro name="prod_a_macro" class="production"><properties/></macro><macro name="prod_b_macro"><properties><identification name="{1,10}"/></properties></macro></macros>`, locMap);
  expect('N2 no-identification station keeps id-label', stItems2[0].name === labelFromId('prod_a_macro'), stItems2[0].name);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
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
