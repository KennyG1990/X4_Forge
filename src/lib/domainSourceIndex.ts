/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure dual-mode domain indexing for source-backed mod assets stored in
 * `workspace.passthroughFiles` (ADR 4264618e-d15b-810d-8214-e38394084f8f / #141).
 *
 * Design invariant:
 * - Never mutates `workspace.passthroughFiles` and never converts hand-written
 *   passthrough XML back through a lossy compiler.
 * - Keeps original bytes authoritative for deploy/compile while exposing full
 *   structural indexing, lint visibility, and XML inspection across AI Scripts,
 *   Wares/Baskets/Jobs/God Libraries, and XML Diff Patching.
 */

import { DOMParser, XMLSerializer, type Element, type Node } from '@xmldom/xmldom';
import type { ModWorkspace, PassthroughFile } from '../types';
import { parseBasketPatchBlocks, parseGodPatchBlocks } from './economyLibraryHelpers';
import { checkXmlWellformed } from './xmlWellformed';

export interface SourceBackedDiffOp {
  index: number;
  op: 'add' | 'replace' | 'remove';
  sel: string;
  pos?: 'before' | 'after' | 'prepend' | 'append';
  attrType?: string;
  content: string;
}

export interface SourceBackedAiScriptParam {
  name: string;
  type: string;
  text?: string;
  defaultValue?: string;
  required?: boolean;
  advanced?: boolean;
}

export interface SourceBackedAiScriptOrder {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  infinite?: boolean;
}

export interface SourceBackedAiScript {
  id: string;
  path: string;
  stem: string;
  name: string;
  mode: 'aiscript' | 'diff';
  targetVanillaPath?: string;
  version?: number;
  priority?: number;
  order?: SourceBackedAiScriptOrder;
  params: SourceBackedAiScriptParam[];
  interruptCount: number;
  attentionLevels: string[];
  patchVersions: number[];
  diffOps: SourceBackedDiffOp[];
  rawXml: string;
  parseError?: string;
}

export type LibraryDomainTab = 'wares' | 'baskets' | 'jobs' | 'god';

export interface SourceBackedLibraryItem {
  key: string;
  domain: LibraryDomainTab;
  path: string;
  id: string;
  label: string;
  entryKind: 'definition' | 'diff_op' | 'parse_error';
  subKind?: string;
  op?: 'add' | 'replace' | 'remove';
  sel?: string;
  summary: string;
  rawSnippet: string;
  fullFileXml: string;
  parseError?: string;
}

export interface SourceBackedLibraryFileMeta {
  domain: LibraryDomainTab;
  path: string;
  isDiff: boolean;
  rawXml: string;
  parseError?: string;
}

export interface SourceBackedLibrariesIndex {
  wares: SourceBackedLibraryItem[];
  baskets: SourceBackedLibraryItem[];
  jobs: SourceBackedLibraryItem[];
  god: SourceBackedLibraryItem[];
  filesByDomain: Partial<Record<LibraryDomainTab, SourceBackedLibraryFileMeta>>;
}

export interface SourceBackedDiffFile {
  id: string;
  path: string;
  domain: 'aiscripts' | 'libraries' | 'assets' | 'maps' | 'md' | 'other';
  ops: SourceBackedDiffOp[];
  rawXml: string;
  parseError?: string;
}

export interface WorkspaceDomainAssetCounts {
  editableAiScripts: number;
  sourceAiScripts: number;
  totalAiScripts: number;
  editableWares: number;
  sourceWares: number;
  totalWares: number;
  editableBaskets: number;
  sourceBaskets: number;
  totalBaskets: number;
  editableJobs: number;
  sourceJobs: number;
  totalJobs: number;
  editableGod: number;
  sourceGod: number;
  totalGod: number;
  editablePatches: number;
  sourceDiffFiles: number;
  totalPatches: number;
}

export function normalizeSourceRelPath(raw: string): string {
  return String(raw || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}

function isReadableXmlPassthrough(pf: PassthroughFile | null | undefined): pf is PassthroughFile & { path: string; content: string } {
  if (!pf || typeof pf.path !== 'string') return false;
  if (pf.omitted) return false;
  if (pf.contentEncoding === 'base64') return false;
  if (typeof pf.content !== 'string' || !pf.content.trim()) return false;
  return /\.xml$/i.test(normalizeSourceRelPath(pf.path));
}

function parseXmlSafe(rawXml: string): { root: Element | null; parseError?: string } {
  const cleaned = rawXml.replace(/^\uFEFF/, '');
  const wf = checkXmlWellformed(cleaned);
  if (!wf.ok) {
    const summary = wf.errors
      .slice(0, 2)
      .map(e => `${e.message} (L${e.line}:${e.col})`)
      .join('; ');
    return { root: null, parseError: summary || 'Malformed XML.' };
  }

  const errors: string[] = [];
  try {
    const doc = new DOMParser({
      onError: (_level, msg) => {
        if (msg) errors.push(String(msg));
      },
    }).parseFromString(cleaned, 'text/xml');
    const root = doc?.documentElement || null;
    if (!root) {
      return { root: null, parseError: errors[0] || 'Missing XML root element.' };
    }
    return { root, ...(errors.length > 0 ? { parseError: errors[0] } : {}) };
  } catch (err) {
    return {
      root: null,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

function childElements(parent: Element | null | undefined, tagName?: string): Element[] {
  if (!parent) return [];
  const out: Element[] = [];
  const want = tagName?.toLowerCase();
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const node = parent.childNodes[i];
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (!want || el.nodeName.toLowerCase() === want) out.push(el);
  }
  return out;
}

const xmlSerializer = new XMLSerializer();

function serializeNodeSafe(node: Node): string {
  try {
    return xmlSerializer.serializeToString(node);
  } catch {
    return '';
  }
}

function serializeInnerChildren(el: Element): string {
  const parts: string[] = [];
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const child = el.childNodes[i];
    if (child.nodeType === 3) {
      const text = child.nodeValue?.trim();
      if (text) parts.push(text);
    } else if (child.nodeType === 4 || child.nodeType === 8 || child.nodeType === 1) {
      const serialized = serializeNodeSafe(child).trim();
      if (serialized) parts.push(serialized);
    }
  }
  return parts.join('\n').trim();
}

function normalizeDiffPos(raw: string | null): SourceBackedDiffOp['pos'] | undefined {
  if (!raw) return undefined;
  const val = raw.trim().toLowerCase();
  if (val === 'before' || val === 'after' || val === 'prepend' || val === 'append') {
    return val;
  }
  return undefined;
}

function extractDiffOps(root: Element): SourceBackedDiffOp[] {
  const ops: SourceBackedDiffOp[] = [];
  let index = 0;
  for (const child of childElements(root)) {
    const tag = child.nodeName.toLowerCase();
    if (tag !== 'add' && tag !== 'replace' && tag !== 'remove') continue;
    const sel = child.getAttribute('sel')?.trim() || '';
    const pos = normalizeDiffPos(child.getAttribute('pos'));
    const attrType = child.getAttribute('type')?.trim() || undefined;
    const content = tag === 'remove' ? '' : serializeInnerChildren(child);
    ops.push({
      index: index++,
      op: tag,
      sel,
      ...(pos ? { pos } : {}),
      ...(attrType ? { attrType } : {}),
      content,
    });
  }
  return ops;
}

function parseOptionalInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  return Number.parseInt(trimmed, 10);
}

/**
 * Index source-backed `aiscripts/*.xml` files preserved inside `workspace.passthroughFiles`.
 * Deduplicates against editable scripts in `workspace.aiScripts` by exact relative filename.
 */
export function indexSourceBackedAiScripts(
  workspace: Pick<ModWorkspace, 'aiScripts' | 'passthroughFiles'>,
): SourceBackedAiScript[] {
  const editablePaths = new Set(
    (workspace.aiScripts || [])
      .map(s => {
        const rawName = String(s.name || '').trim();
        if (!rawName) return '';
        const fileName = rawName.toLowerCase().endsWith('.xml') ? rawName : `${rawName}.xml`;
        return `aiscripts/${fileName}`.toLowerCase();
      })
      .filter(Boolean),
  );

  const indexed: SourceBackedAiScript[] = [];
  const seenPaths = new Set<string>();

  for (const pf of workspace.passthroughFiles || []) {
    if (!isReadableXmlPassthrough(pf)) continue;
    const rel = normalizeSourceRelPath(pf.path);
    if (!/^aiscripts\/.+\.xml$/i.test(rel)) continue;
    const lowerRel = rel.toLowerCase();
    if (editablePaths.has(lowerRel) || seenPaths.has(lowerRel)) continue;
    seenPaths.add(lowerRel);

    const stem = rel.replace(/^aiscripts\//i, '').replace(/\.xml$/i, '');
    const { root, parseError } = parseXmlSafe(pf.content);
    const rootName = root?.nodeName.toLowerCase() || '';

    if (root && rootName === 'diff') {
      indexed.push({
        id: `source_ai::${lowerRel}`,
        path: rel,
        stem,
        name: stem,
        mode: 'diff',
        targetVanillaPath: `aiscripts/${stem}.xml`,
        params: [],
        interruptCount: 0,
        attentionLevels: [],
        patchVersions: [],
        diffOps: extractDiffOps(root),
        rawXml: pf.content,
        ...(parseError ? { parseError } : {}),
      });
      continue;
    }

    if (root && rootName === 'aiscript') {
      const scriptName = root.getAttribute('name')?.trim() || stem;
      const version = parseOptionalInt(root.getAttribute('version'));
      const priority = parseOptionalInt(root.getAttribute('priority'));

      const orderEl = childElements(root, 'order')[0];
      const order: SourceBackedAiScriptOrder | undefined = orderEl
        ? {
            id: orderEl.getAttribute('id')?.trim() || '',
            name: orderEl.getAttribute('name')?.trim() || undefined,
            description: orderEl.getAttribute('description')?.trim() || undefined,
            category: orderEl.getAttribute('category')?.trim() || undefined,
            infinite: orderEl.getAttribute('infinite') === 'true',
          }
        : undefined;

      const paramsParent = orderEl
        ? childElements(orderEl, 'params')[0]
        : childElements(root, 'params')[0];
      const params: SourceBackedAiScriptParam[] = childElements(paramsParent, 'param').map(p => ({
        name: p.getAttribute('name')?.trim() || '',
        type: p.getAttribute('type')?.trim() || 'internal',
        text: p.getAttribute('text')?.trim() || undefined,
        defaultValue: p.getAttribute('default')?.trim() || undefined,
        required: p.getAttribute('required') === 'true',
        advanced: p.getAttribute('advanced') === 'true',
      }));

      const interruptsEl = childElements(root, 'interrupts')[0];
      const interruptCount = childElements(interruptsEl, 'handler').length;

      const attentionLevels = Array.from(
        new Set(
          childElements(root, 'attention')
            .map(a => a.getAttribute('min')?.trim() || '')
            .filter(Boolean),
        ),
      );

      const patchVersions = childElements(root, 'patch')
        .map(p => parseOptionalInt(p.getAttribute('sinceversion')))
        .filter((v): v is number => v !== undefined);

      indexed.push({
        id: `source_ai::${lowerRel}`,
        path: rel,
        stem,
        name: scriptName,
        mode: 'aiscript',
        ...(version !== undefined ? { version } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(order ? { order } : {}),
        params,
        interruptCount,
        attentionLevels,
        patchVersions,
        diffOps: [],
        rawXml: pf.content,
        ...(parseError ? { parseError } : {}),
      });
      continue;
    }

    indexed.push({
      id: `source_ai::${lowerRel}`,
      path: rel,
      stem,
      name: stem,
      mode: 'aiscript',
      params: [],
      interruptCount: 0,
      attentionLevels: [],
      patchVersions: [],
      diffOps: [],
      rawXml: pf.content,
      parseError: parseError || `Unexpected root element <${root?.nodeName || 'none'}> (expected <aiscript> or <diff>).`,
    });
  }

  return indexed.sort((a, b) => a.path.localeCompare(b.path));
}

function summarizeWareEl(el: Element): { label: string; subKind: string; summary: string } {
  const id = el.getAttribute('id')?.trim() || 'ware';
  const name = el.getAttribute('name')?.trim() || id;
  const transport = el.getAttribute('transport')?.trim() || 'container';
  const priceEl = childElements(el, 'price')[0];
  const avg = priceEl?.getAttribute('average')?.trim();
  const volume = el.getAttribute('volume')?.trim();
  const bits = [transport];
  if (volume) bits.push(`vol ${volume}`);
  if (avg) bits.push(`${avg} Cr`);
  return { label: name, subKind: transport, summary: bits.join(' · ') };
}

function summarizeBasketEl(el: Element): { label: string; subKind: string; summary: string } {
  const id = el.getAttribute('id')?.trim() || 'basket';
  const waresContainer = childElements(el, 'wares')[0] || el;
  const wareCount = childElements(waresContainer, 'ware').length;
  return { label: id, subKind: 'basket', summary: `${wareCount} ware${wareCount === 1 ? '' : 's'}` };
}

function summarizeJobEl(el: Element): { label: string; subKind: string; summary: string } {
  const id = el.getAttribute('id')?.trim() || 'job';
  const name = el.getAttribute('name')?.trim() || id;
  const categoryEl = childElements(el, 'category')[0];
  const faction = categoryEl?.getAttribute('faction')?.trim() || el.getAttribute('owner')?.trim() || 'job';
  const ordersEl = childElements(el, 'orders')[0];
  const orderEl = childElements(ordersEl, 'order')[0];
  const orderId = orderEl?.getAttribute('order')?.trim();
  const bits = [faction];
  if (orderId) bits.push(orderId);
  return { label: name, subKind: faction, summary: bits.join(' · ') };
}

function summarizeGodEl(el: Element): { label: string; subKind: string; summary: string } {
  const id = el.getAttribute('id')?.trim() || 'god_entry';
  const tag = el.nodeName.toLowerCase();
  const owner = el.getAttribute('owner')?.trim() || 'universe';
  const quotaEl = childElements(el, 'quota')[0];
  const galaxyQuota = quotaEl?.getAttribute('galaxy')?.trim();
  const bits = [tag, owner];
  if (galaxyQuota) bits.push(`q=${galaxyQuota}`);
  return { label: id, subKind: tag === 'station' ? 'station' : 'product', summary: bits.join(' · ') };
}

function rootAddSelectorMatchesDomain(domain: LibraryDomainTab, sel: string): boolean {
  const s = sel.trim().toLowerCase();
  if (domain === 'wares') return s === '/wares' || s === '//wares';
  if (domain === 'baskets') return s === '/baskets' || s === '//baskets';
  if (domain === 'jobs') return s === '/jobs' || s === '//jobs';
  return s === '/god/products' || s === '//god/products' || s === '/god/stations' || s === '//god/stations' || s === '/god' || s === '//god';
}

function extractDomainElementsFromParent(domain: LibraryDomainTab, parent: Element): Element[] {
  if (domain === 'wares') return childElements(parent, 'ware');
  if (domain === 'baskets') return childElements(parent, 'basket');
  if (domain === 'jobs') return childElements(parent, 'job');
  const direct = [
    ...childElements(parent, 'product'),
    ...childElements(parent, 'station'),
  ];
  const nestedProducts = childElements(childElements(parent, 'products')[0], 'product');
  const nestedStations = childElements(childElements(parent, 'stations')[0], 'station');
  return [...direct, ...nestedProducts, ...nestedStations];
}

function summarizeDomainElement(domain: LibraryDomainTab, el: Element) {
  if (domain === 'wares') return summarizeWareEl(el);
  if (domain === 'baskets') return summarizeBasketEl(el);
  if (domain === 'jobs') return summarizeJobEl(el);
  return summarizeGodEl(el);
}

/**
 * Index source-backed `libraries/{wares,baskets,jobs,god}.xml` files preserved in
 * `workspace.passthroughFiles`, omitting definition IDs already authored in editable models.
 */
export function indexSourceBackedLibraries(
  workspace: Pick<ModWorkspace, 'wares' | 'jobs' | 'xmlPatches' | 'passthroughFiles'>,
): SourceBackedLibrariesIndex {
  const result: SourceBackedLibrariesIndex = {
    wares: [],
    baskets: [],
    jobs: [],
    god: [],
    filesByDomain: {},
  };

  const editableBaskets = parseBasketPatchBlocks(workspace.xmlPatches || []);
  const editableGod = parseGodPatchBlocks(workspace.xmlPatches || []);
  const editableIds: Record<LibraryDomainTab, Set<string>> = {
    wares: new Set((workspace.wares || []).map(w => w.id.trim().toLowerCase()).filter(Boolean)),
    baskets: new Set(editableBaskets.map(b => b.id.trim().toLowerCase()).filter(Boolean)),
    jobs: new Set((workspace.jobs || []).map(j => j.id.trim().toLowerCase()).filter(Boolean)),
    god: new Set(editableGod.map(g => g.id.trim().toLowerCase()).filter(Boolean)),
  };

  const domainFileMap: Record<string, LibraryDomainTab> = {
    'libraries/wares.xml': 'wares',
    'libraries/baskets.xml': 'baskets',
    'libraries/jobs.xml': 'jobs',
    'libraries/god.xml': 'god',
  };

  for (const pf of workspace.passthroughFiles || []) {
    if (!isReadableXmlPassthrough(pf)) continue;
    const rel = normalizeSourceRelPath(pf.path);
    const domain = domainFileMap[rel.toLowerCase()];
    if (!domain) continue;
    if (result.filesByDomain[domain]) continue;

    const { root, parseError } = parseXmlSafe(pf.content);
    const rootTag = root?.nodeName.toLowerCase() || '';
    const isDiff = rootTag === 'diff';

    result.filesByDomain[domain] = {
      domain,
      path: rel,
      isDiff,
      rawXml: pf.content,
      ...(parseError ? { parseError } : {}),
    };

    if (!root) {
      result[domain].push({
        key: `source_lib::${domain}::parse_error`,
        domain,
        path: rel,
        id: `${domain}.xml`,
        label: `${domain}.xml (Parse Error)`,
        entryKind: 'parse_error',
        subKind: 'error',
        summary: parseError || 'Malformed XML file on disk.',
        rawSnippet: pf.content.slice(0, 2000),
        fullFileXml: pf.content,
        parseError: parseError || 'Malformed XML file on disk.',
      });
      continue;
    }

    const items = result[domain];
    let itemIdx = 0;

    if (isDiff) {
      let opIdx = 0;
      for (const child of childElements(root)) {
        const tag = child.nodeName.toLowerCase();
        if (tag !== 'add' && tag !== 'replace' && tag !== 'remove') continue;
        const op = tag as 'add' | 'replace' | 'remove';
        const sel = child.getAttribute('sel')?.trim() || '';
        const defs = op === 'add' && rootAddSelectorMatchesDomain(domain, sel)
          ? extractDomainElementsFromParent(domain, child)
          : [];

        if (defs.length > 0) {
          for (const defEl of defs) {
            const defId = defEl.getAttribute('id')?.trim() || `${domain}_def_${itemIdx}`;
            if (editableIds[domain].has(defId.toLowerCase())) continue;
            const meta = summarizeDomainElement(domain, defEl);
            items.push({
              key: `source_lib::${domain}::${itemIdx++}::${defId}`,
              domain,
              path: rel,
              id: defId,
              label: meta.label,
              entryKind: 'definition',
              subKind: meta.subKind,
              op: 'add',
              sel,
              summary: meta.summary,
              rawSnippet: serializeNodeSafe(defEl) || pf.content,
              fullFileXml: pf.content,
            });
          }
        } else {
          const opId = `${op}_${opIdx}`;
          const shortSel = sel.length > 42 ? `${sel.slice(0, 39)}...` : sel || '(no sel)';
          items.push({
            key: `source_lib::${domain}::${itemIdx++}::${opId}`,
            domain,
            path: rel,
            id: opId,
            label: `${op.toUpperCase()} ${shortSel}`,
            entryKind: 'diff_op',
            subKind: op,
            op,
            sel,
            summary: sel || `RFC 5261 <${op}>`,
            rawSnippet: serializeNodeSafe(child) || pf.content,
            fullFileXml: pf.content,
          });
        }
        opIdx += 1;
      }
      continue;
    }

    const directDefs = extractDomainElementsFromParent(domain, root);
    for (const defEl of directDefs) {
      const defId = defEl.getAttribute('id')?.trim() || `${domain}_def_${itemIdx}`;
      if (editableIds[domain].has(defId.toLowerCase())) continue;
      const meta = summarizeDomainElement(domain, defEl);
      items.push({
        key: `source_lib::${domain}::${itemIdx++}::${defId}`,
        domain,
        path: rel,
        id: defId,
        label: meta.label,
        entryKind: 'definition',
        subKind: meta.subKind,
        summary: meta.summary,
        rawSnippet: serializeNodeSafe(defEl) || pf.content,
        fullFileXml: pf.content,
      });
    }
  }

  return result;
}

function classifyDiffDomain(relPath: string): SourceBackedDiffFile['domain'] {
  const lower = relPath.toLowerCase();
  if (lower.startsWith('aiscripts/')) return 'aiscripts';
  if (lower.startsWith('libraries/')) return 'libraries';
  if (lower.startsWith('assets/')) return 'assets';
  if (lower.startsWith('maps/')) return 'maps';
  if (lower.startsWith('md/')) return 'md';
  return 'other';
}

/**
 * Index all RFC 5261 `<diff>` XML files preserved inside `workspace.passthroughFiles`
 * across all mod subdirectories (`aiscripts/`, `libraries/`, `assets/`, `maps/`, etc.).
 */
export function indexSourceBackedDiffFiles(
  workspace: Pick<ModWorkspace, 'passthroughFiles'>,
): SourceBackedDiffFile[] {
  const out: SourceBackedDiffFile[] = [];
  const seen = new Set<string>();

  for (const pf of workspace.passthroughFiles || []) {
    if (!isReadableXmlPassthrough(pf)) continue;
    const rel = normalizeSourceRelPath(pf.path);
    const lowerRel = rel.toLowerCase();
    if (seen.has(lowerRel)) continue;

    const { root, parseError } = parseXmlSafe(pf.content);
    if (!root || root.nodeName.toLowerCase() !== 'diff') continue;
    seen.add(lowerRel);

    out.push({
      id: `source_diff::${lowerRel}`,
      path: rel,
      domain: classifyDiffDomain(rel),
      ops: extractDiffOps(root),
      rawXml: pf.content,
      ...(parseError ? { parseError } : {}),
    });
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function countWorkspaceDomainAssets(
  workspace: Pick<ModWorkspace, 'aiScripts' | 'wares' | 'jobs' | 'xmlPatches' | 'passthroughFiles'>,
): WorkspaceDomainAssetCounts {
  const editableAiScripts = workspace.aiScripts?.length ?? 0;
  const sourceAiScripts = indexSourceBackedAiScripts(workspace).length;

  const libs = indexSourceBackedLibraries(workspace);
  const editableWares = workspace.wares?.length ?? 0;
  const sourceWares = libs.wares.length;

  const editableBaskets = parseBasketPatchBlocks(workspace.xmlPatches || []).length;
  const sourceBaskets = libs.baskets.length;

  const editableJobs = workspace.jobs?.length ?? 0;
  const sourceJobs = libs.jobs.length;

  const editableGod = parseGodPatchBlocks(workspace.xmlPatches || []).length;
  const sourceGod = libs.god.length;

  const editablePatches = workspace.xmlPatches?.length ?? 0;
  const sourceDiffFiles = indexSourceBackedDiffFiles(workspace).length;

  return {
    editableAiScripts,
    sourceAiScripts,
    totalAiScripts: editableAiScripts + sourceAiScripts,
    editableWares,
    sourceWares,
    totalWares: editableWares + sourceWares,
    editableBaskets,
    sourceBaskets,
    totalBaskets: editableBaskets + sourceBaskets,
    editableJobs,
    sourceJobs,
    totalJobs: editableJobs + sourceJobs,
    editableGod,
    sourceGod,
    totalGod: editableGod + sourceGod,
    editablePatches,
    sourceDiffFiles,
    totalPatches: editablePatches + sourceDiffFiles,
  };
}
