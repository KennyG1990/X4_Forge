/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

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
  counts: Record<X4ObjectKind, number>;
  items: X4IndexedObject[];
}

const MAX_XML_FILES = 15000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const KINDS: X4ObjectKind[] = ['ship', 'station', 'ware', 'faction', 'sound', 'job', 'aiscript', 'md_element', 'macro'];

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

function scanXmlFile(filePath: string, items: X4IndexedObject[], seen: Set<string>) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_BYTES) return false;
  const xml = fs.readFileSync(filePath, 'utf8');
  const relative = filePath;
  const lowerPath = filePath.toLowerCase();

  for (const match of xml.matchAll(/<macro\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    const macroClass = extractAttr(tag, 'class');
    const kind: X4ObjectKind = id.startsWith('ship_') || macroClass === 'ship'
      ? 'ship'
      : id.startsWith('station_') || macroClass === 'station'
        ? 'station'
        : 'macro';
    addUnique(items, seen, {
      id,
      name: labelFromId(id),
      kind,
      sourceFile: relative,
      detail: macroClass ? `macro class=${macroClass}` : 'macro'
    });
  }

  for (const match of xml.matchAll(/<ware\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    addUnique(items, seen, {
      id,
      name: extractAttr(tag, 'name') || labelFromId(id),
      kind: 'ware',
      sourceFile: relative,
      detail: extractAttr(tag, 'transport') ? `transport=${extractAttr(tag, 'transport')}` : 'ware'
    });
  }

  for (const match of xml.matchAll(/<faction\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    addUnique(items, seen, {
      id: `faction.${id}`,
      name: extractAttr(tag, 'name') || id.toUpperCase(),
      kind: 'faction',
      sourceFile: relative,
      detail: 'faction'
    });
  }

  for (const match of xml.matchAll(/<job\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const tag = match[0];
    const id = match[1];
    addUnique(items, seen, {
      id,
      name: extractAttr(tag, 'name') || labelFromId(id),
      kind: 'job',
      sourceFile: relative,
      detail: 'job'
    });
  }

  if (lowerPath.includes(`${path.sep}aiscripts${path.sep}`)) {
    const name = path.basename(filePath, '.xml');
    addUnique(items, seen, {
      id: name,
      name: labelFromId(name),
      kind: 'aiscript',
      sourceFile: relative,
      detail: 'aiscript file'
    });
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

  return true;
}

export function buildX4ObjectIndex(roots: string[], schemaElements: Array<{ tag: string; category?: string; description?: string }> = []): X4ObjectIndex {
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

  for (const file of files) {
    try {
      if (scanXmlFile(file, items, seen)) scannedFiles++;
    } catch {
      state.skipped++;
    }
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
