/** Effective read-only X4 document resolver: base plus official ego_dlc_* overlays. */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import { simulateXmlDiff, validateDiffSourceXml, type DiffFinding } from './diffSimulator';

export interface OverlaySource {
  source: 'base' | `ego_dlc_${string}`;
  path: string;
  mode: 'base' | 'replace' | 'merge' | 'diff';
}

export interface OverlayFinding extends Omit<DiffFinding, 'code'> {
  code: DiffFinding['code'] | 'REFERENCE_WARES_UNQUALIFIED';
  source: string;
  path: string;
}

export interface EffectiveReferenceDocument {
  available: boolean;
  /** Current content lineage was composed without unavailable/failed sources. */
  complete: boolean;
  /** Active failures only; findings below also retain superseded history. */
  incompleteFindings: OverlayFinding[];
  root: string;
  relativePath: string;
  content?: string;
  sources: OverlaySource[];
  findings: OverlayFinding[];
  signature: string;
}

/** Canonical consumer wire evidence; content is exposed separately only for inspection. */
export function effectiveReferenceMetadata(document: EffectiveReferenceDocument) {
  return { available: document.available, complete: document.complete === true,
    signature: document.signature, sources: document.sources, findings: document.findings,
    incompleteFindings: document.incompleteFindings };
}

interface DlcInfo {
  folder: string;
  id: `ego_dlc_${string}`;
  root: string;
  dependencies: string[];
  requiredDependencies?: string[];
  manifestQualified?: boolean;
  duplicateId?: boolean;
}

const cache = new Map<string, EffectiveReferenceDocument>();
const cacheSizes = new Map<string, number>();
let cacheBytes = 0;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 64;

function cached(key: string, signature: string): EffectiveReferenceDocument | null {
  const value = cache.get(key);
  if (!value || value.signature !== signature) return null;
  // Map insertion order is the LRU order.
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function storeCached(key: string, value: EffectiveReferenceDocument): void {
  const priorSize = cacheSizes.get(key) || 0;
  cacheBytes -= priorSize;
  cache.delete(key);
  cacheSizes.delete(key);
  const size = (value.content?.length || 0) * 2 + JSON.stringify({ sources: value.sources,
    findings: value.findings, incompleteFindings: value.incompleteFindings }).length * 2;
  // A single oversized document is still returned, but not retained indefinitely.
  if (size > MAX_CACHE_BYTES) return;
  cache.set(key, value);
  cacheSizes.set(key, size);
  cacheBytes += size;
  while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
    cacheBytes -= cacheSizes.get(oldest) || 0;
    cacheSizes.delete(oldest);
  }
}

export function getReferenceOverlayCacheStats(): { entries: number; bytes: number; maxBytes: number } {
  return { entries: cache.size, bytes: cacheBytes, maxBytes: MAX_CACHE_BYTES };
}

function normalizeRelative(relativeInput: string): string {
  const raw = String(relativeInput || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw || path.posix.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) throw new Error('Invalid request: a vanilla-relative path is required.');
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error('Directory traversal detected.');
  return normalized;
}

function safeJoin(root: string, relative: string): string {
  const target = path.resolve(root, ...relative.split('/'));
  const rel = path.relative(path.resolve(root), target);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Directory traversal detected.');
  return target;
}

function sniffRoot(xml: string): string | null {
  const match = /<(?!\?|!)([A-Za-z_][\w.:-]*)/.exec(xml.slice(0, 32768).replace(/<!--[\s\S]*?-->/g, ''));
  return match ? match[1].toLowerCase() : null;
}

export function isWareCollectionPath(relativePath: string): boolean {
  return relativePath.toLowerCase() === 'libraries/wares.xml';
}

function parseWareCollection(xml: string): XmlDocument {
  // The strict reference parser has already qualified this source's XML.
  return new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'text/xml');
}

function wareRoot(document: XmlDocument): XmlElement | null {
  const element = document.documentElement;
  return !document.doctype && element?.nodeName === 'wares' && !element.namespaceURI ? element : null;
}

function wareDefinition(node: XmlElement): boolean {
  return node.nodeName === 'ware' && !node.namespaceURI && !!node.getAttribute('id')?.trim();
}

function duplicateWareId(root: XmlElement): string | undefined {
  const ids = new Set<string>();
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== 1 || !wareDefinition(node as XmlElement)) continue;
    const id = (node as XmlElement).getAttribute('id')!;
    const key = id.trim().toLowerCase();
    if (ids.has(key)) return id;
    ids.add(key);
  }
  return undefined;
}

function readDlcInfo(extensionRoot: string, folder: string, requireManifest: boolean): DlcInfo {
  const root = path.join(extensionRoot, folder);
  const contentPath = path.join(root, 'content.xml');
  let id = folder.toLowerCase();
  const dependencies: string[] = [];
  const requiredDependencies: string[] = [];
  let manifestQualified = false;
  try {
    const xml = fs.readFileSync(contentPath, 'utf8').replace(/^\uFEFF/, '');
    let malformed = false;
    const document = new DOMParser({ onError: () => { malformed = true; } }).parseFromString(xml, 'text/xml');
    const content = document.documentElement;
    manifestQualified = !malformed && content?.nodeName === 'content' && /^ego_dlc_/i.test(content.getAttribute('id') ?? '');
    if (requireManifest && !manifestQualified) {
      throw new Error('Invalid official DLC manifest.');
    }
    if (content?.getAttribute('id')) id = content.getAttribute('id')!.toLowerCase();
    const nodes = content?.getElementsByTagName('dependency') || [];
    for (let index = 0; index < nodes.length; index++) {
      const dependency = nodes[index].getAttribute('id');
      if (dependency) {
        const dependencyId = dependency.toLowerCase();
        dependencies.push(dependencyId);
        if (!/^(?:true|1)$/i.test(nodes[index].getAttribute('optional') ?? '')) requiredDependencies.push(dependencyId);
      }
    }
  } catch {
    if (requireManifest) throw new Error(`The official DLC manifest for ${folder} is unavailable or invalid.`);
    // Other callers retain the existing deterministic folder-order fallback.
  }
  return { folder, id: id as `ego_dlc_${string}`, root, dependencies, requiredDependencies, manifestQualified };
}

/** content.xml dependencies are explicitly documented by Egosoft as extension load order. */
export function discoverOfficialDlcOrder(referenceRoot: string, requireManifest = false, onUnavailable?: () => void): DlcInfo[] {
  const extensionRoot = path.join(referenceRoot, 'extensions');
  let folders: string[] = [];
  try {
    folders = fs.readdirSync(extensionRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^ego_dlc_/i.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') onUnavailable?.();
    return [];
  }
  const infos = folders.map(folder => readDlcInfo(extensionRoot, folder, requireManifest));
  const byId = new Map<string, DlcInfo>();
  for (const info of infos) {
    const prior = byId.get(info.id);
    if (prior) {
      if (requireManifest) throw new Error('Official DLC IDs are ambiguous.');
      prior.duplicateId = true;
      info.duplicateId = true;
    }
    byId.set(info.id, info);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: DlcInfo[] = [];
  const visit = (info: DlcInfo) => {
    if (visited.has(info.id)) return;
    if (visiting.has(info.id)) {
      if (requireManifest) throw new Error('Official DLC dependency order is ambiguous.');
      return; // Other callers retain the deterministic lexical fallback.
    }
    visiting.add(info.id);
    for (const dependency of info.dependencies) {
      const local = byId.get(dependency);
      if (local) visit(local);
    }
    visiting.delete(info.id);
    visited.add(info.id);
    ordered.push(info);
  };
  for (const info of infos) visit(info);
  return ordered;
}

function signatureFor(paths: string[]): string {
  const parts: string[] = [];
  for (const file of paths) {
    try {
      const stat = fs.statSync(file);
      parts.push(`${file.toLowerCase()}|${stat.size}|${Math.floor(stat.mtimeMs)}|${Math.floor(stat.ctimeMs)}`);
    } catch { parts.push(`${file.toLowerCase()}|missing`); }
  }
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

export function resolveEffectiveReferenceDocument(
  referenceRootInput: string, relativeInput: string, force = false,
  options: { dlcs?: ReturnType<typeof discoverOfficialDlcOrder>; cache?: boolean } = {},
): EffectiveReferenceDocument {
  const root = path.resolve(referenceRootInput);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Reference root unavailable or not a directory: ${root}`);
  const relativePath = normalizeRelative(relativeInput);
  const wareCollection = isWareCollectionPath(relativePath);
  let contributorsUnavailable = false;
  const dlcs = options.dlcs ?? discoverOfficialDlcOrder(root, false, () => { contributorsUnavailable = true; });
  const basePath = safeJoin(root, relativePath);
  const candidatePaths = [basePath, ...dlcs.flatMap(dlc => [path.join(dlc.root, 'content.xml'), safeJoin(dlc.root, relativePath)])];
  if (wareCollection) candidatePaths.push(path.join(root, 'extensions'));
  const signature = signatureFor(candidatePaths);
  const key = `${root.toLowerCase()}|${relativePath.toLowerCase()}`;
  const previous = !force && options.cache !== false ? cached(key, signature) : null;
  if (previous) return previous;

  let content: string | undefined;
  const sources: OverlaySource[] = [];
  const findings: OverlayFinding[] = [];
  let incompleteFindings: OverlayFinding[] = [];
  let hasFullWareContribution = false;
  let hasWareCollision = false;
  const validateFullSource = (xml: string, source: OverlayFinding['source'], sourcePath: string, supersedes = true) => {
    if (supersedes) incompleteFindings = [];
    const invalid = validateDiffSourceXml(xml).map(finding => ({ ...finding, source, path: sourcePath }));
    findings.push(...invalid);
    incompleteFindings.push(...invalid);
    return invalid.length === 0;
  };
  const wareGap = (source: string, sourcePath: string, message: string) => {
    const finding: OverlayFinding = { severity: 'warning', code: 'REFERENCE_WARES_UNQUALIFIED', source, path: sourcePath, message };
    findings.push(finding);
    incompleteFindings.push(finding);
  };
  const readSource = (absolute: string, source: string, sourcePath: string): string | undefined => {
    if (!wareCollection) return fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? fs.readFileSync(absolute, 'utf8') : undefined;
    let found = false;
    try {
      const stat = fs.statSync(absolute);
      found = true;
      if (stat.isFile()) return fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      if (!found && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    }
    wareGap(source, sourcePath, 'The ware source could not be read as a regular file.');
    return undefined;
  };
  const qualifyWares = (root: XmlElement, source: string, sourcePath: string) => {
    if (hasWareCollision) return;
    const id = duplicateWareId(root);
    if (id === undefined) return;
    hasWareCollision = true;
    wareGap(source, sourcePath, `Ware identity ${JSON.stringify(id.slice(0, 128))} has multiple declarations. The patchable XML retains each declaration, and registry precedence is unqualified.`);
  };
  content = readSource(basePath, 'base', relativePath);
  if (content !== undefined) {
    sources.push({ source: 'base', path: relativePath, mode: 'base' });
    validateFullSource(content, 'base', relativePath);
  }
  if (wareCollection && contributorsUnavailable) wareGap('base', 'extensions', 'Official ware contributors could not be enumerated.');
  for (const dlc of dlcs) {
    const absolute = safeJoin(dlc.root, relativePath);
    const sourcePath = `extensions/${dlc.folder}/${relativePath}`;
    const overlay = readSource(absolute, dlc.id, sourcePath);
    if (overlay === undefined) continue;
    if (sniffRoot(overlay) === 'diff') {
      if (content === undefined) {
        const finding: OverlayFinding = {
          severity: 'warning', code: 'DIFF_SELECTOR_ZERO', source: dlc.id, path: sourcePath,
          message: `${dlc.id} supplies a diff for ${relativePath}, but no earlier base document exists.`,
        };
        findings.push(finding);
        incompleteFindings.push(finding);
        continue;
      }
      const result = simulateXmlDiff(content, overlay);
      content = result.content;
      sources.push({ source: dlc.id, path: sourcePath, mode: 'diff' });
      const attributed = result.findings.map(finding => ({ ...finding, source: dlc.id, path: sourcePath }));
      findings.push(...attributed);
      incompleteFindings.push(...attributed.filter(finding => finding.severity === 'error'));
      if (result.ok) {
        const repaired = validateDiffSourceXml(overlay).map(finding => ({ ...finding, source: dlc.id, path: sourcePath }));
        findings.push(...repaired);
        incompleteFindings.push(...repaired);
        if (hasFullWareContribution) {
          const root = wareRoot(parseWareCollection(content));
          if (root) qualifyWares(root, dlc.id, sourcePath);
          else wareGap(dlc.id, sourcePath, 'The diff no longer produces a supported wares collection root.');
        }
      }
    } else if (wareCollection) {
      sources.push({ source: dlc.id, path: sourcePath, mode: content === undefined ? 'base' : 'merge' });
      if (!validateFullSource(overlay, dlc.id, sourcePath, false)) continue;
      const incoming = wareRoot(parseWareCollection(overlay));
      if (!incoming || incoming.attributes.length || Array.from(incoming.childNodes).some(node => node.nodeType === 1
        ? !wareDefinition(node as XmlElement) : node.nodeType !== 8 && (node.nodeType !== 3 || !!node.nodeValue?.trim()))) {
        wareGap(dlc.id, sourcePath, 'Full ware contributors must provide a plain wares root with direct ware declarations and IDs.');
        continue;
      }
      if (content === undefined) {
        content = overlay;
        qualifyWares(incoming, dlc.id, sourcePath);
      } else {
        if (validateDiffSourceXml(content).length) {
          wareGap(dlc.id, sourcePath, 'The earlier wares XML is invalid, so the full contributor could not be appended.');
          continue;
        }
        const document = parseWareCollection(content);
        const root = wareRoot(document);
        if (!root) {
          wareGap(dlc.id, sourcePath, 'The earlier XML does not provide a supported wares collection root.');
          continue;
        }
        if (!hasFullWareContribution) {
          qualifyWares(root, sources.length === 2 ? 'base' : 'ware-collection', relativePath);
        }
        for (const child of Array.from(incoming.childNodes)) root.appendChild(document.importNode(child, true));
        qualifyWares(root, dlc.id, sourcePath);
        content = new XMLSerializer().serializeToString(document);
      }
      hasFullWareContribution = true;
    } else {
      const hadContent = content !== undefined;
      content = overlay;
      sources.push({ source: dlc.id, path: sourcePath, mode: hadContent ? 'replace' : 'base' });
      validateFullSource(overlay, dlc.id, sourcePath);
    }
  }

  if (wareCollection && (hasFullWareContribution || dlcs.some(dlc => dlc.duplicateId))) {
    const profileIds = new Set<string>(dlcs.map(dlc => dlc.id));
    const earlierIds = new Set<string>();
    for (const dlc of dlcs) {
      if (dlc.duplicateId || dlc.manifestQualified === false || earlierIds.has(dlc.id) || dlc.dependencies.some(id => profileIds.has(id) && !earlierIds.has(id))
        || dlc.requiredDependencies?.some(id => !profileIds.has(id))) {
        wareGap(dlc.id, `extensions/${dlc.folder}/content.xml`, 'Manifest or dependency order could not be established for this wares collection.');
      }
      earlierIds.add(dlc.id);
    }
  }

  const result: EffectiveReferenceDocument = {
    available: content !== undefined,
    complete: content !== undefined && incompleteFindings.length === 0,
    incompleteFindings,
    root,
    relativePath,
    content,
    sources,
    findings,
    signature,
  };
  if (options.cache !== false) storeCached(key, result);
  return result;
}

export interface ReferenceOverlayCheck { name: string; pass: boolean; detail?: string }

export function runReferenceOverlaySelftest(): { pass: boolean; allPassed: boolean; passed: number; total: number; checks: ReferenceOverlayCheck[] } {
  const checks: ReferenceOverlayCheck[] = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-overlay-'));
  const write = (relative: string, content: string) => {
    const absolute = path.join(tmp, ...relative.split('/'));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, 'utf8');
  };
  try {
    write('libraries/test.xml', '<root><item id="base"/><item id="remove"/></root>');
    write('extensions/ego_dlc_a/content.xml', '<content id="ego_dlc_a"/>');
    write('extensions/ego_dlc_a/libraries/test.xml', '<diff><add sel="/root"><item id="a"/></add><remove sel="/root/item[@id=\'remove\']"/></diff>');
    write('extensions/ego_dlc_b/content.xml', '<content id="ego_dlc_b"><dependency id="ego_dlc_a" optional="true"/></content>');
    write('extensions/ego_dlc_b/libraries/test.xml', '<diff><add sel="/root/item[@id=\'a\']" pos="after"><item id="b"/></add></diff>');
    write('extensions/community/libraries/test.xml', '<diff><add sel="/root"><item id="wrong"/></add></diff>');
    const before = fs.statSync(path.join(tmp, 'libraries', 'test.xml')).mtimeMs;
    const effective = resolveEffectiveReferenceDocument(tmp, 'libraries/test.xml', true);
    const after = fs.statSync(path.join(tmp, 'libraries', 'test.xml')).mtimeMs;
    check('base plus dependency-ordered DLC diffs', effective.available && /id="base"/.test(effective.content || '')
      && /id="a"/.test(effective.content || '') && /id="b"/.test(effective.content || '') && !/id="remove"/.test(effective.content || ''));
    check('community extensions excluded', !/id="wrong"/.test(effective.content || ''));
    check('resolver is read-only', before === after);
    check('source provenance', effective.sources.map(source => source.source).join(',') === 'base,ego_dlc_a,ego_dlc_b');
    fs.rmSync(path.join(tmp, 'extensions', 'ego_dlc_b'), { recursive: true, force: true });
    const refreshed = resolveEffectiveReferenceDocument(tmp, 'libraries/test.xml');
    check('DLC removal invalidates cache', !/id="b"/.test(refreshed.content || '') && effective.signature !== refreshed.signature);
    const stats = getReferenceOverlayCacheStats();
    check('effective document cache stays byte bounded', stats.bytes <= stats.maxBytes && stats.entries <= MAX_CACHE_ENTRIES, JSON.stringify(stats));
    let traversal = false;
    try { resolveEffectiveReferenceDocument(tmp, '../outside.xml'); } catch (error) { traversal = /traversal/i.test(String(error)); }
    check('traversal rejected', traversal);

    const wares = 'libraries/wares.xml';
    const wareA = `extensions/ego_dlc_a/${wares}`;
    const wareB = `extensions/ego_dlc_b/${wares}`;
    const warePatch = `extensions/ego_dlc_patch/${wares}`;
    const wareResult = () => resolveEffectiveReferenceDocument(tmp, wares, true);
    write(wares, '<wares><production><method id="default"/></production><ware id="stock" volume="1"/></wares>');
    write(wareA, '<wares><ware id="a_keep"/><ware id="drop"/></wares>');
    write('extensions/ego_dlc_b/content.xml', '<content id="ego_dlc_b"><dependency id="ego_dlc_a"/></content>');
    write(wareB, '<wares><ware id="rename" volume="23"/></wares>');
    write('extensions/ego_dlc_patch/content.xml', '<content id="ego_dlc_patch"><dependency id="ego_dlc_b"/></content>');
    write(warePatch, `<diff><remove sel="/wares/ware[@id='drop']"/><replace sel="/wares/ware[@id='rename']/@id">renamed</replace></diff>`);
    const merged = wareResult();
    check('full wares append in dependency order before later diffs', merged.complete
      && merged.sources.map(source => source.mode).join(',') === 'base,merge,merge,diff'
      && /method id="default"/.test(merged.content || '') && /id="stock"/.test(merged.content || '')
      && /id="a_keep"/.test(merged.content || '') && /id="renamed" volume="23"/.test(merged.content || '')
      && !/id="(?:drop|rename)"/.test(merged.content || '') && merged.findings.length === 0);

    write(wareA, '<wares><ware id="broken"></wares>');
    const badSource = wareResult();
    check('valid later wares retain earlier malformed-source coverage', badSource.available && !badSource.complete
      && badSource.incompleteFindings.some(finding => finding.code === 'DIFF_XML_INVALID' && finding.path === wareA)
      && /id="renamed"/.test(badSource.content || '') && !/id="broken"/.test(badSource.content || ''));
    write(wareA, '<wares><production><method id="extra"/></production></wares>');
    const unsupported = wareResult();
    check('unsupported full ware structure is attributed without erasing the base', unsupported.available && !unsupported.complete
      && unsupported.incompleteFindings.some(finding => finding.code === 'REFERENCE_WARES_UNQUALIFIED' && finding.path === wareA)
      && /id="default"/.test(unsupported.content || '') && !/id="extra"/.test(unsupported.content || ''));
    write(wareA, '<wares><![CDATA[unmodeled content]]><ware id="never_admitted"/></wares>');
    const embeddedText = wareResult();
    check('a full ware contributor with embedded text is incomplete', !embeddedText.complete
      && embeddedText.incompleteFindings.some(finding => finding.path === wareA) && !/never_admitted/.test(embeddedText.content || ''));

    write(wareA, '<wares><ware id="duplicate" volume="14"/></wares>');
    write(wareB, '<wares><ware id="duplicate" volume="24"/></wares>');
    write(warePatch, `<diff><remove sel="/wares/ware[@id='duplicate'][1]"/></diff>`);
    const duplicate = wareResult();
    check('duplicate candidates stay in the working tree for later positional diffs', !duplicate.complete
      && duplicate.incompleteFindings.some(finding => finding.code === 'REFERENCE_WARES_UNQUALIFIED' && finding.path === wareB)
      && /id="duplicate" volume="24"/.test(duplicate.content || '') && !/volume="14"/.test(duplicate.content || ''));
    write(wareB, '<wares><ware id="second" volume="24"/></wares>');
    write(warePatch, `<diff><replace sel="/wares/ware[@id='second']/@id">duplicate</replace></diff>`);
    const patchCollision = wareResult();
    check('a later diff can introduce a ware identity collision', !patchCollision.complete
      && patchCollision.incompleteFindings.some(finding => finding.code === 'REFERENCE_WARES_UNQUALIFIED' && finding.path === warePatch));

    write(warePatch, '<diff/>');
    const manifestB = 'extensions/ego_dlc_b/content.xml';
    write(manifestB, '<content id="ego_dlc_b"><dependency id="ego_dlc_absent"/></content>');
    const missingDependency = wareResult();
    check('missing required ware dependency makes the ordered composition incomplete', missingDependency.available && !missingDependency.complete
      && missingDependency.incompleteFindings.some(finding => finding.code === 'REFERENCE_WARES_UNQUALIFIED' && finding.path === manifestB));
    write(manifestB, '<content id="ego_dlc_b"><dependency id="ego_dlc_absent" optional="true"/></content>');
    check('absent optional ware dependency does not make composition incomplete', wareResult().complete);

    write(wares, '<wares><ware id="stock" volume="1"/><ware id="stock" volume="2"/></wares>');
    const baseCollision = wareResult();
    check('an earlier base collision is attributed to the base', !baseCollision.complete && baseCollision.incompleteFindings.some(finding =>
      finding.code === 'REFERENCE_WARES_UNQUALIFIED' && finding.path === wares && finding.source === 'base'));

    const blockedSource = path.join(tmp, ...wareB.split('/'));
    fs.unlinkSync(blockedSource);
    fs.mkdirSync(blockedSource);
    const nonFile = wareResult();
    check('existing non-file ware source stops canonical absence claims', !nonFile.complete
      && nonFile.incompleteFindings.some(finding => finding.path === wareB && finding.message.includes('regular file')));
    const incompleteRoot = path.join(tmp, 'blocked-ware-inventory');
    write(`blocked-ware-inventory/${wares}`, '<wares><ware id="stock"/></wares>');
    const initiallyAbsent = resolveEffectiveReferenceDocument(incompleteRoot, wares);
    write('blocked-ware-inventory/extensions', 'not a directory');
    const blockedInventory = resolveEffectiveReferenceDocument(incompleteRoot, wares);
    check('official inventory read errors invalidate prior complete absence', initiallyAbsent.complete && !blockedInventory.complete
      && blockedInventory.incompleteFindings.some(finding => finding.path === 'extensions' && finding.message.includes('enumerated')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const passed = checks.filter(entry => entry.pass).length;
  return { pass: passed === checks.length, allPassed: passed === checks.length, passed, total: checks.length, checks };
}
