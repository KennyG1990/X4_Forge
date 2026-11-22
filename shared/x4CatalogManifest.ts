/** Strict and compatibility parsing for X4 CAT indexes, shared by runtime and editor. */
export interface CatEntry {
  /** forward-slash normalized relative path, e.g. "libraries/wares.xml" */
  name: string;
  size: number;
  offset: number;
  timestamp?: number;
  md5?: string;
}

export const MAX_CAT_MANIFEST_BYTES = 64 * 1024 * 1024;
export const MAX_CAT_ENTRIES = 1_000_000;

export function safeCatalogName(input: string): string | null {
  const normalized = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0') || /[\r\n]/.test(normalized) || /^[a-zA-Z]:\//.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

/** Read successive CAT rows while retaining their offsets without retaining the whole index. */
export function createCatManifestParser({ maxEntries = MAX_CAT_ENTRIES, strict = false, sourcePath = '' } = {}) {
  const location = sourcePath ? ': ' + sourcePath : '';
  let offset = 0;
  let count = 0;
  return {
    get dataLength() { return offset; },
    line(raw: string): CatEntry | undefined {
      const line = raw.trim();
      if (!line) return undefined;
      if (strict && !/^.+ \d+ \d+ [a-f0-9]{32}$/i.test(line)) throw new Error('CAT manifest has a malformed entry.');
      const parts = line.split(' ');
      if (parts.length < 4) return undefined;
      const size = parseInt(parts[parts.length - 3], 10);
      if (!Number.isFinite(size) || size < 0) {
        if (strict) throw new Error('CAT manifest has an invalid entry size.');
        return undefined;
      }
      if (count >= maxEntries) throw new Error('CAT manifest exceeds the '+maxEntries+'-entry limit'+location);
      if (!Number.isSafeInteger(offset + size)) throw new Error('CAT entry offsets exceed JavaScript\'s safe integer range'+location);
      const name = parts.slice(0, parts.length - 3).join(' ').replace(/\\/g, '/');
      if (strict && (safeCatalogName(name) !== name || /^[a-z]:/i.test(name))) {
        throw new Error('CAT manifest has an unsafe entry path.');
      }
      const timestamp = parseInt(parts[parts.length - 2], 10);
      if (strict && !Number.isSafeInteger(timestamp)) throw new Error('CAT manifest has an invalid entry timestamp.');
      const md5 = parts[parts.length - 1].toLowerCase();
      const entry = {
        name, size, offset,
        ...(Number.isFinite(timestamp) ? { timestamp } : {}),
        ...(/^[0-9a-f]{32}$/.test(md5) ? { md5 } : {}),
      };
      offset += size;
      count++;
      return entry;
    },
  };
}

/** Parse already bounded CAT text, optionally rejecting any unparseable entry. */
export function parseCatManifest(text: string, options: Parameters<typeof createCatManifestParser>[0] = {}): CatEntry[] {
  const parser = createCatManifestParser(options);
  const entries: CatEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const entry = parser.line(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

export const VERSIONED_EXTENSION_CATALOG_PART = /^ext_(?:(\d{2})_diff_)?v(\d{3,})\.(cat|dat)$/i;
const NUMBERED_EXTENSION_CATALOG_PART = /^ext_\d{2}\.(cat|dat)$/i;
export const VERSIONED_SUBSTITUTION_CATALOG_PART = /^subst_v(\d{3,})\.(cat|dat)$/i;
const NUMBERED_SUBSTITUTION_CATALOG_PART = /^subst_\d{2}\.(cat|dat)$/i;
const MAX_EXTENSION_CATALOG_PARTS = 32;

/** Validate the ordinary paired catalog names within one extension folder. */
export function numberedExtensionCatalogPairs(names: readonly string[]): Array<{ cat: string; dat: string }> {
  return pairExtensionCatalogParts(names.filter(name => NUMBERED_EXTENSION_CATALOG_PART.test(name)));
}

/** Select direct extension catalogs for a known game version. Substitutions are a separate stack. */
export function orderedExtensionCatalogPairs(names: readonly string[], gameVersion?: number): Array<{ cat: string; dat: string }> {
  const numbered = new Set<string>();
  const layers = new Map<string, { number: number; version: number }>();
  const selected = names.filter(name => {
    if (!NUMBERED_EXTENSION_CATALOG_PART.test(name)) return false;
    const number = name.slice(4, 6);
    numbered.add(number);
    layers.set(name.toLowerCase(), { number: Number(number), version: 0 });
    return true;
  });
  for (const name of names) {
    const match = VERSIONED_EXTENSION_CATALOG_PART.exec(name);
    if (!match) continue;
    if (gameVersion === undefined) throw new Error('Versioned extension catalogs need a verified game version.');
    const [, number, code] = match;
    const version = Number(code);
    const applicable = number === undefined ? version === gameVersion
      : gameVersion >= 900 && numbered.has(number) && version >= 100 && version <= gameVersion;
    if (!applicable || code !== String(version)) continue;
    layers.set(name.toLowerCase(), { number: number === undefined ? 100 : Number(number), version });
    selected.push(name);
  }
  return pairExtensionCatalogParts(selected).map(pair => ({ pair, layer: layers.get(pair.cat.toLowerCase())! }))
    .sort((a, b) => a.layer.number - b.layer.number || a.layer.version - b.layer.version)
    .map(({ pair }) => pair);
}

/** Replacement catalogs are game-root-relative and have no numbered diff layers. */
export function orderedSubstitutionCatalogPairs(names: readonly string[], gameVersion?: number): Array<{ cat: string; dat: string }> {
  const selected = names.filter(name => {
    if (NUMBERED_SUBSTITUTION_CATALOG_PART.test(name)) return true;
    const version = VERSIONED_SUBSTITUTION_CATALOG_PART.exec(name)?.[1];
    if (version === undefined) return false;
    if (gameVersion === undefined) throw new Error('Versioned substitution catalogs need a verified game version.');
    return version === String(gameVersion);
  });
  return pairExtensionCatalogParts(selected).sort((a, b) => a.cat.toLowerCase().localeCompare(b.cat.toLowerCase()));
}

function pairExtensionCatalogParts(parts: readonly string[]): Array<{ cat: string; dat: string }> {
  const byName = new Map(parts.map(name => [name.toLowerCase(), name]));
  if (parts.length > MAX_EXTENSION_CATALOG_PARTS || byName.size !== parts.length) {
    throw new Error('Installed catalog inventory is outside the read limits.');
  }
  const pairs: Array<{ cat: string; dat: string }> = [];
  for (const [name, part] of byName) {
    const cat = name.endsWith('.cat');
    const other = byName.get(name.slice(0, -4) + (cat ? '.dat' : '.cat'));
    if (!other) throw new Error('Installed catalog volume is missing its pair.');
    if (cat) pairs.push({ cat: part, dat: other });
  }
  return pairs;
}

/** The base game mounts consecutive numbered catalog pairs from 01. */
export function numberedBaseGameCatalogPairs(names: readonly string[]): Array<{ cat: string; dat: string }> {
  const candidates = names.filter(name => /^\d{2}\.(cat|dat)$/i.test(name));
  const byName = new Map(candidates.map(name => [name.toLowerCase(), name]));
  if (byName.size !== candidates.length) throw new Error('The game catalog inventory contains duplicate parts.');
  const results: Array<{ cat: string; dat: string }> = [];
  for (let index = 1; index <= 99; index++) {
    const number = String(index).padStart(2, '0');
    const cat = byName.get(number+'.cat');
    const dat = byName.get(number+'.dat');
    if (!cat && !dat) break;
    if (!cat || !dat) throw new Error('A numbered game catalog is missing its pair.');
    results.push({ cat, dat });
  }
  return results;
}
