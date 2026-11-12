/** Bounded read-only adapter over the configured Forge reference pipeline. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Node as XmlNode, type Element as XmlElement } from '@xmldom/xmldom';
import * as xpath from 'xpath';
import { simulateXmlDiff } from '../lib/diffSimulator';
import { resolveReferenceFile } from '../lib/referenceCorpus';
import { discoverOfficialDlcOrder, resolveEffectiveReferenceDocument } from '../lib/referenceOverlay';
import { sniffRootElement } from '../lib/schemaRouting';
import {
  analyzeXmlReferenceDocument, normalizeXmlReferencePath, selectXmlReferenceNeighborhood,
  xmlCatalogNameMatches, xmlCatalogTargetPath, xmlReferenceFileId,
  type XmlAssetSymbolKind, type XmlCatalogEntry, type XmlExtractedReference,
  type XmlReferenceContext, type XmlReferenceDocumentAnalysis, type XmlReferenceEdge,
  type XmlReferenceFile, type XmlReferenceFocus, type XmlReferenceLimits,
  type XmlReferenceMapResult, type XmlReferenceOrigin,
} from '../lib/xmlReferenceGraph';
import type { SchemaIndex } from '../lib/xsdValidate';

export interface XmlReferenceMapInput {
  projectFiles: readonly { path: string; content?: string }[];
  referenceRoot?: string | null;
  focus?: XmlReferenceFocus;
  maxDepth?: number;
  maxNodes?: number;
  maxEdges?: number;
  includeSource?: boolean;
  context?: XmlReferenceContext;
  /** Inject the existing canonical referenceLanguage registry; never MD-only getSchemaIndex. */
  schemaForDocument?: (filePath: string, content: string) => { schema: SchemaIndex | null; domain: string };
}

export class XmlReferenceMapInputError extends Error { readonly status = 400; }

interface SourceDocument {
  file: XmlReferenceFile;
  raw: string;
  effective: string;
  analysis: XmlReferenceDocumentAnalysis;
}
interface ReferenceText {
  path: string;
  raw: string;
  effective: string;
  complete: boolean;
  sourcePaths: string[];
  signature: string;
  authored: boolean;
  reason?: string;
}
interface CatalogCandidate extends XmlCatalogEntry { sourceId: string }
const sha256 = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const key = (value: string) => value.toLowerCase();
const sameSymbol = (left: string, right: string) => key(left) === key(right);
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
interface CompositionBudget { document: XmlDocument; bytes: number; nodes: number; mutated: boolean }
const COMPOSITION_NODES = 100_000;
const COMPOSITION_OPERATIONS = 128;
function compositionDocument(content: string, maxBytes: number): CompositionBudget | null {
  if (Buffer.byteLength(content, 'utf8') > maxBytes || /<!\s*(DOCTYPE|ENTITY)\b/i.test(content)) return null;
  let invalid = false;
  try {
    const document = new DOMParser({ onError: () => { invalid = true; } }).parseFromString(content.replace(/^\uFEFF/, ''), 'text/xml');
    if (invalid || !document.documentElement) return null;
    let nodes = 0;
    const pending: XmlNode[] = [document.documentElement];
    while (pending.length) {
      const node = pending.pop()!;
      if (++nodes > COMPOSITION_NODES) return null;
      if (node.nodeType === 1) nodes += (node as XmlElement).attributes.length;
      for (let index = 0; index < node.childNodes.length; index++) pending.push(node.childNodes[index]);
    }
    // XML serialization can expand raw attribute quoting. Its expansion is
    // bounded by the raw input; reject that actual baseline before composition.
    const bytes = Buffer.byteLength(new XMLSerializer().serializeToString(document), 'utf8');
    return bytes <= maxBytes && nodes <= COMPOSITION_NODES ? { document, bytes, nodes, mutated: false } : null;
  } catch { return null; }
}
/** A conservative upper bound, before the existing interpreter can clone payloads. */
function compositionPatch(base: CompositionBudget, patch: string, maxBytes: number): CompositionBudget | null {
  const source = compositionDocument(patch, maxBytes);
  if (!source || source.document.documentElement.nodeName !== 'diff') return null;
  const operations = Array.from(source.document.documentElement.childNodes).filter(node => node.nodeType === 1) as XmlElement[];
  if (operations.length > COMPOSITION_OPERATIONS) return null;
  const bound = { ...base };
  const serializer = new XMLSerializer();
  for (const operation of operations) {
    if (!['add', 'replace', 'remove'].includes(operation.nodeName)) return null;
    const selector = operation.getAttribute('sel');
    const attributeType = operation.getAttribute('type') || '';
    if (!selector || selector.length > 2048 || attributeType.length > 2048) return null;
    let matches: number;
    if (bound.mutated) matches = bound.nodes;
    else {
      try {
        // xpath types use browser Node; match the existing diffSimulator xmldom bridge.
        const selected = xpath.select(selector, base.document as unknown as Node);
        if (!Array.isArray(selected)) return null;
        matches = selected.length;
      } catch { return null; }
    }
    let payloadBytes = 0;
    let payloadNodes = 0;
    if (operation.nodeName !== 'remove') {
      const pending = Array.from(operation.childNodes);
      for (const node of pending) payloadBytes += Buffer.byteLength(serializer.serializeToString(node), 'utf8');
      while (pending.length) {
        const node = pending.pop()!;
        payloadNodes++;
        if (node.nodeType === 1) payloadNodes += (node as XmlElement).attributes.length;
        for (let index = 0; index < node.childNodes.length; index++) pending.push(node.childNodes[index]);
      }
      // Extra escaping and attribute syntax can only increase this conservative
      // estimate. After an edit, every bounded node is a possible later match.
      bound.bytes += matches * (payloadBytes * 6 + Buffer.byteLength(attributeType, 'utf8') + 64);
      bound.nodes += matches * (payloadNodes + 1);
    }
    if (bound.bytes > maxBytes || bound.nodes > COMPOSITION_NODES) return null;
    if (matches) bound.mutated = true;
  }
  return bound;
}

function checkedLimit(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new XmlReferenceMapInputError(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}

export function analyzeXmlReferenceMap(input: XmlReferenceMapInput): XmlReferenceMapResult {
  const limits: XmlReferenceLimits = {
    maxDepth: checkedLimit(input.maxDepth, 2, 0, 6, 'maxDepth'),
    maxNodes: checkedLimit(input.maxNodes, 80, 1, 200, 'maxNodes'),
    maxEdges: checkedLimit(input.maxEdges, 300, 1, 1000, 'maxEdges'),
    maxDocuments: 256, maxDocumentBytes: 2 * 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024, maxPreviewChars: 32_000,
    maxResponseBytes: 2 * 1024 * 1024,
  };
  if (!Array.isArray(input.projectFiles)) throw new XmlReferenceMapInputError('projectFiles must be explicit XML source documents.');
  const focus = input.focus ? { ...input.focus, path: normalizeXmlReferencePath(input.focus.path) } : undefined;
  if (focus && (!focus.path || !['project', 'reference'].includes(focus.origin) || !/\.xml$/i.test(focus.path)
    || (focus.line !== undefined && (!Number.isSafeInteger(focus.line) || focus.line < 1 || focus.line > 1_000_000_000))
    || (focus.column !== undefined && (!Number.isSafeInteger(focus.column) || focus.column < 1 || focus.column > 1_000_000_000)))) {
    throw new XmlReferenceMapInputError('focus requires a safe relative XML path, valid origin and positive one-based coordinates.');
  }
  const reasons = new Set<string>();
  const note = (reason: string) => { if (reasons.size < 64) reasons.add(reason.slice(0, 360)); };
  let truncated = false;
  let unavailableProjectFiles = 0;
  let projectCoverageComplete = true;
  let totalBytes = 0;
  let documentReads = 0;
  const usedSignatures = new Map<string, string>();
  const documents = new Map<string, SourceDocument>();
  const projectByPath = new Map<string, SourceDocument[]>();
  const rawReferences = new Map<string, { content: string; sha256: string } | null>();
  const effectiveReferences = new Map<string, ReferenceText | null>();
  const referenceDocuments = new Map<string, SourceDocument | null>();
  const failedReferencePaths = new Set<string>();
  const root = input.referenceRoot ? path.resolve(input.referenceRoot) : null;
  let dlcs: ReturnType<typeof discoverOfficialDlcOrder> = [];
  let dlcCoverageComplete = true;
  const corpusAvailable = Boolean(root && fs.existsSync(root) && fs.statSync(root).isDirectory());
  if (!corpusAvailable) note('The configured unpacked reference corpus is unavailable; external asset resolution is incomplete.');
  const consume = (bytes: number, source: string): boolean => {
    if (bytes > limits.maxDocumentBytes || documentReads >= limits.maxDocuments || totalBytes + bytes > limits.maxTotalBytes) {
      truncated = true; note(`Source budget reached at ${source}; unscanned references are not classified as absent.`); return false;
    }
    documentReads++; totalBytes += bytes; return true;
  };
  const reserveComposition = (bound: CompositionBudget, source: string): boolean => {
    if (totalBytes + bound.bytes > limits.maxTotalBytes) {
      truncated = true; note(`${source}: aggregate raw/composed source budget reached; composition was not executed.`); return false;
    }
    totalBytes += bound.bytes; return true;
  };
  const schema = (filePath: string, content: string) => {
    try { const resource = input.schemaForDocument?.(filePath, content); return { schema: resource?.schema, schemaDomain: resource?.domain }; }
    catch { note('The shared configured schema registry was unavailable for a document; only corpus-grounded contextual bindings were used.'); return {}; }
  };
  const parse = (origin: XmlReferenceOrigin, filePath: string, content: string,
    extra: Partial<Parameters<typeof analyzeXmlReferenceDocument>[0]> = {}) => {
    const analysis = analyzeXmlReferenceDocument({ origin, path: filePath, content, ...schema(filePath, content), ...extra });
    for (const issue of analysis.issues) note(`${filePath}: ${issue}`);
    return analysis;
  };
  const readReference = (relative: string): { content: string; sha256: string } | null => {
    const safe = normalizeXmlReferencePath(relative);
    if (!safe || !/\.xml$/i.test(safe) || !root || !corpusAvailable) return null;
    const cacheKey = key(safe);
    if (rawReferences.has(cacheKey)) return rawReferences.get(cacheKey)!;
    rawReferences.set(cacheKey, null);
    let fd: number | undefined;
    try {
      const physical = resolveReferenceFile(root, safe);
      fd = fs.openSync(physical, 'r');
      const before = fs.fstatSync(fd);
      if (!before.isFile() || !consume(before.size, safe)) { failedReferencePaths.add(cacheKey); return null; }
      const buffer = Buffer.alloc(before.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = fs.readSync(fd, buffer, count, buffer.length - count, null);
        if (!read) break;
        count += read;
      }
      const after = fs.fstatSync(fd);
      if (count !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
        || fs.realpathSync(physical) !== physical) { failedReferencePaths.add(cacheKey); note(`${safe}: source changed during the bounded read.`); return null; }
      const bytes = buffer.subarray(0, count);
      const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      const value = { content, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
      usedSignatures.set(safe, value.sha256); rawReferences.set(cacheKey, value); return value;
    } catch (error) {
      if (!/File not found/.test(String(error))) {
        failedReferencePaths.add(cacheKey); note(`${safe}: reference source could not be read through the configured containment guard.`);
      }
      return null;
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  };
  if (root && corpusAvailable) {
    let folders: string[] = [];
    try { folders = fs.readdirSync(path.join(root, 'extensions'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^ego_dlc_/i.test(entry.name)).map(entry => entry.name).sort(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        dlcCoverageComplete = false; note('Official DLC directories could not be enumerated; absence of DLC definitions is not established.');
      }
    }
    if (folders.length > 32) { folders = folders.slice(0, 32); dlcCoverageComplete = false; truncated = true; note('Official DLC source limit reached; further sources are unscanned.'); }
    for (const folder of folders) {
      const manifest = `extensions/${folder}/content.xml`;
      if (fs.existsSync(path.join(root, ...manifest.split('/'))) && !readReference(manifest)) dlcCoverageComplete = false;
    }
    // The existing ordering owner is invoked only after its manifest sources
    // have passed the same containment/size checks as reference XML.
    dlcs = dlcCoverageComplete ? discoverOfficialDlcOrder(root) : folders.map(folder => ({ folder,
      id: folder.toLowerCase() as `ego_dlc_${string}`, root: path.join(root, 'extensions', folder), dependencies: [] }));
  }
  const effectiveReference = (relative: string): ReferenceText | null => {
    const safe = normalizeXmlReferencePath(relative);
    if (!safe || !root || !corpusAvailable) return null;
    const cacheKey = key(safe);
    if (effectiveReferences.has(cacheKey)) return effectiveReferences.get(cacheKey)!;
    effectiveReferences.set(cacheKey, null);
    const sourcePaths = [safe, ...dlcs.map(dlc => `extensions/${dlc.folder}/${safe}`)];
    const present: Array<{ path: string; raw: { content: string; sha256: string } }> = [];
    let guarded = true;
    for (const sourcePath of sourcePaths) {
      const candidate = path.join(root, ...sourcePath.split('/'));
      if (!fs.existsSync(candidate)) continue;
      const raw = readReference(sourcePath);
      if (raw) present.push({ path: sourcePath, raw }); else guarded = false;
    }
    if (!present.length) { if (!guarded) failedReferencePaths.add(cacheKey); return null; }
    const incompleteReference = (reason: string): ReferenceText => {
      failedReferencePaths.add(cacheKey); note(`${safe}: ${reason}`);
      const first = present[0];
      const value: ReferenceText = { path: first.path, raw: first.raw.content, effective: first.raw.content,
        complete: false, sourcePaths: present.map(source => source.path), authored: true, reason,
        signature: sha256(present.map(source => `${source.path}|${source.raw.sha256}`).join('\n')) };
      effectiveReferences.set(cacheKey, value); return value;
    };
    // Guard content manifests as well: they govern the existing resolver's order.
    for (const dlc of dlcs) {
      const manifest = `extensions/${dlc.folder}/content.xml`;
      if (fs.existsSync(path.join(root, ...manifest.split('/'))) && !readReference(manifest)) guarded = false;
    }
    if (!guarded || !dlcCoverageComplete) return incompleteReference('Canonical composition was refused because source containment/coverage is incomplete; only the guarded raw source is shown.');
    let composition: CompositionBudget | null = null;
    for (const source of present) {
      composition = sniffRootElement(source.raw.content) === 'diff'
        ? composition && compositionPatch(composition, source.raw.content, limits.maxDocumentBytes)
        : compositionDocument(source.raw.content, limits.maxDocumentBytes);
      if (!composition) break;
    }
    if (!composition) {
      return incompleteReference('Canonical composition exceeds the bounded node/operation/selector/output estimate or could not be safely estimated; only guarded raw source is shown.');
    }
    if (!reserveComposition(composition, safe)) return incompleteReference('Aggregate raw/composed source budget prevents canonical composition; only guarded raw source is shown.');
    try {
      const effective = resolveEffectiveReferenceDocument(root, safe, true);
      // The resolver is the existing authority. Verify that it used exactly the
      // guarded snapshots and did not race a change between preflight and use.
      const returnedPaths = effective.sources.map(source => source.path);
      const manifests = dlcs.map(dlc => {
        const manifestPath = `extensions/${dlc.folder}/content.xml`;
        const raw = rawReferences.get(key(manifestPath));
        return raw ? { path: manifestPath, raw } : null;
      }).filter((source): source is NonNullable<typeof source> => Boolean(source));
      const snapshotsMatch = [...present, ...manifests].every(source => {
        let fd: number | undefined;
        try {
          fd = fs.openSync(resolveReferenceFile(root, source.path), 'r');
          const stamp = fs.fstatSync(fd);
          const expectedBytes = Buffer.byteLength(source.raw.content, 'utf8');
          if (stamp.size !== expectedBytes || stamp.size > limits.maxDocumentBytes) return false;
          const bytes = Buffer.alloc(stamp.size + 1);
          let length = 0;
          while (length < bytes.length) { const count = fs.readSync(fd, bytes, length, bytes.length - length, null); if (!count) break; length += count; }
          const after = fs.fstatSync(fd);
          return length === stamp.size && after.size === stamp.size && after.mtimeMs === stamp.mtimeMs
            && crypto.createHash('sha256').update(bytes.subarray(0, length)).digest('hex') === source.raw.sha256;
        } catch { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
      });
      if (!snapshotsMatch || returnedPaths.some(sourcePath => !present.some(source => key(source.path) === key(sourcePath)))) {
        return incompleteReference('Canonical sources changed during composition; only the guarded raw snapshot is shown and no resolved result is claimed.');
      }
      if (!effective.available || effective.content === undefined) return null;
      if (Buffer.byteLength(effective.content, 'utf8') > limits.maxDocumentBytes) {
        return incompleteReference('Canonical result exceeded its conservative estimate; effective parsing was refused.');
      }
      const first = present[0];
      const authored = effective.sources.length === 1 && effective.sources[0].mode !== 'diff';
      const value: ReferenceText = { path: first.path, raw: first.raw.content, effective: effective.content,
        complete: effective.complete, sourcePaths: returnedPaths, signature: effective.signature, authored,
        ...(!effective.complete ? { reason: 'Canonical overlay composition is incomplete; inspect its source findings.' }
          : !authored ? { reason: 'Effective source lineage does not establish an original raw-token position.' } : {}) };
      if (!value.complete) note(`${safe}: ${value.reason}`);
      effectiveReferences.set(cacheKey, value); usedSignatures.set(`effective:${safe}`, value.signature); return value;
    } catch { return incompleteReference('The existing canonical composition owner could not provide the document; only guarded raw source is shown.'); }
  };
  const projectInputs = input.projectFiles.filter(file => typeof file?.path === 'string' && /\.xml$/i.test(file.path));
  if (projectInputs.length > 128) { truncated = true; projectCoverageComplete = false; unavailableProjectFiles += projectInputs.length - 128; note('Only the first 128 project XML documents are scanned; incoming references outside that scope are unknown.'); }
  for (const item of projectInputs.slice(0, 128)) {
    const safe = normalizeXmlReferencePath(item.path);
    if (!safe) throw new XmlReferenceMapInputError('Project XML contains an unsafe relative path.');
    if (typeof item.content !== 'string') { projectCoverageComplete = false; unavailableProjectFiles++; note(`${safe}: project source content is unavailable; absence of definitions is not established.`); continue; }
    if (!consume(Buffer.byteLength(item.content, 'utf8'), safe)) { projectCoverageComplete = false; unavailableProjectFiles++; continue; }
    const hash = sha256(item.content);
    const prior = projectByPath.get(key(safe)) ?? [];
    if (prior.some(document => document.file.sha256 === hash)) continue;
    const id = xmlReferenceFileId('project', safe, prior.length ? hash.slice(0, 12) : '');
    const analysis = parse('project', safe, item.content);
    if (!analysis.complete) projectCoverageComplete = false;
    const document: SourceDocument = { file: { id, origin: 'project', path: safe, sha256: hash, locationKind: 'authored',
      available: true, complete: analysis.complete }, raw: item.content, effective: item.content, analysis };
    prior.push(document); projectByPath.set(key(safe), prior); documents.set(id, document); usedSignatures.set(id, hash);
  }
  for (const document of [...documents.values()]) {
    if (document.analysis.root !== 'diff') continue;
    // Catalogs are additive candidate registries. Their patches must be applied
    // to that registry, rather than the generic full-file replacement view.
    if (/(?:^|\/)index\/(macros|components)\.xml$/i.test(document.file.path)) continue;
    const base = effectiveReference(document.file.path);
    if (!base || !base.complete) {
      projectCoverageComplete = false;
      document.file.complete = false;
      document.file.reason = 'Project diff base is unavailable/incomplete; effective references could not be established.';
      note(`${document.file.path}: ${document.file.reason}`);
      continue;
    }
    const composition = compositionDocument(base.effective, limits.maxDocumentBytes);
    const bound = composition && compositionPatch(composition, document.raw, limits.maxDocumentBytes);
    if (!bound || !reserveComposition(bound, document.file.path)) {
      projectCoverageComplete = false;
      document.file.complete = false; document.file.reason = 'Project diff exceeds the conservative node/operation/selector/output estimate; composition was not executed.';
      note(`${document.file.path}: ${document.file.reason}`); continue;
    }
    const simulation = simulateXmlDiff(base.effective, document.raw, { attributeProvenance: true, elementProvenance: true });
    if (!simulation.ok) {
      projectCoverageComplete = false;
      document.file.complete = false; document.file.reason = 'Project diff simulation failed; effective references are incomplete.';
      note(`${document.file.path}: ${document.file.reason}`); continue;
    }
    document.effective = simulation.content;
    const provenance = simulation.elementProvenance;
    document.analysis = parse('project', document.file.path, simulation.content, {
      locationKind: 'effective', ...(provenance?.available && provenance.document ? { document: provenance.document,
        positionForAttribute: (element, attribute) => {
          const point = provenance.attributes.get(element)?.get(attribute);
          return point?.line && point.column ? { origin: 'project', path: document.file.path, kind: 'authored', line: point.line, column: point.column }
            : { origin: 'project', path: document.file.path, kind: 'effective' };
        } } : {}),
    });
    document.file.complete = document.analysis.complete;
    if (!document.analysis.complete) projectCoverageComplete = false;
    document.file.sourcePaths = base.sourcePaths;
    document.file.reason = 'References use the composed document; inherited effective values have no verified authored patch position.';
    usedSignatures.set(`project-effective:${document.file.path}`, sha256(simulation.content));
  }
  const referenceDocument = (relative: string): SourceDocument | null => {
    const safe = normalizeXmlReferencePath(relative);
    if (!safe) return null;
    const cacheKey = key(safe);
    if (referenceDocuments.has(cacheKey)) return referenceDocuments.get(cacheKey)!;
    referenceDocuments.set(cacheKey, null);
    const catalogContributor = /(?:^|\/)index\/(?:macros|components)\.xml$/i.test(safe);
    const wareContributor = /(?:^|\/)libraries\/wares\.xml$/i.test(safe);
    if (catalogContributor || wareContributor) {
      const raw = readReference(safe);
      if (raw) {
        const analysis = parse('reference', safe, raw.content, wareContributor ? { definitionDomain: 'wares' } : {});
        const id = xmlReferenceFileId('reference', safe);
        const catalogPatch = catalogContributor && analysis.root === 'diff';
        const document: SourceDocument = { file: { id, origin: 'reference', path: safe, sha256: raw.sha256,
          locationKind: 'authored', available: true, complete: analysis.complete && !catalogPatch, sourcePaths: [safe],
          reason: catalogPatch ? 'Authored catalog diff contributor; selector-written references may be unavailable in this raw-file graph.'
            : wareContributor ? 'Authored ware contributor; current canonical identity is checked separately from raw declarations.'
              : 'Authored catalog contributor. Global symbol resolution uses the separate base/DLC candidate registry.' },
          raw: raw.content, effective: raw.content, analysis };
        documents.set(id, document); referenceDocuments.set(cacheKey, document); return document;
      }
      if (failedReferencePaths.has(cacheKey)) return null;
    }
    const source = effectiveReference(safe);
    if (!source) return null;
    const id = xmlReferenceFileId('reference', source.path);
    const analysis = parse('reference', source.path, source.effective, { locationKind: source.authored ? 'authored' : 'effective' });
    const document: SourceDocument = { file: { id, origin: 'reference', path: source.path, sha256: sha256(source.raw), locationKind: 'authored',
      available: true, complete: source.complete && analysis.complete, sourcePaths: source.sourcePaths, reason: source.reason },
      raw: source.raw, effective: source.effective, analysis };
    documents.set(id, document); referenceDocuments.set(cacheKey, document); return document;
  };
  let catalogs: CatalogCandidate[] | null = null;
  let catalogsComplete = corpusAvailable && dlcCoverageComplete;
  const unqualifiedCatalogKinds = new Set<'macro' | 'component'>();
  const loadCatalogs = (): CatalogCandidate[] => {
    if (catalogs) return catalogs;
    catalogs = [];
    for (const kind of ['macro', 'component'] as const) {
      const relative = `index/${kind === 'macro' ? 'macros' : 'components'}.xml`;
      const paths = [relative, ...dlcs.map(dlc => `extensions/${dlc.folder}/${relative}`)];
      for (const sourcePath of paths) {
        const raw = readReference(sourcePath);
        if (!raw) { if (sourcePath === relative || failedReferencePaths.has(key(sourcePath))) catalogsComplete = false; continue; }
        let analysis = parse('reference', sourcePath, raw.content);
        if (analysis.root === 'diff') {
          const union = `<index>${catalogs.filter(entry => entry.kind === kind).map(entry => `<entry name="${escapeXml(entry.name)}" value="${escapeXml(entry.value)}"/>`).join('')}</index>`;
          const composition = compositionDocument(union, limits.maxDocumentBytes);
          const bound = composition && compositionPatch(composition, raw.content, limits.maxDocumentBytes);
          if (!bound || !reserveComposition(bound, sourcePath)) {
            catalogsComplete = false; failedReferencePaths.add(key(sourcePath)); note(`${sourcePath}: catalog diff exceeds the conservative composition estimate and was not executed.`); continue;
          }
          const simulation = simulateXmlDiff(union, raw.content);
          if (!simulation.ok) { catalogsComplete = false; note(`${sourcePath}: catalog diff could not be composed.`); continue; }
          analysis = parse('reference', sourcePath, simulation.content, { locationKind: 'effective' });
          const old = catalogs.filter(entry => entry.kind === kind);
          catalogs = catalogs.filter(entry => entry.kind !== kind);
          for (const entry of analysis.catalog) {
            const prior = old.filter(candidate => sameSymbol(candidate.name, entry.name) && candidate.value === entry.value);
            catalogs.push(...(prior.length ? prior : [{ ...entry, sourceId: xmlReferenceFileId('reference', sourcePath) }]));
          }
        } else {
          if (sourcePath !== relative && analysis.root === 'index') {
            unqualifiedCatalogKinds.add(kind);
            note(`Full official-DLC ${kind} index collections require #11 qualification; their registry identities are source candidates, not proven active identities.`);
          }
          catalogs.push(...analysis.catalog.map(entry => ({ ...entry, sourceId: xmlReferenceFileId('reference', sourcePath) })));
        }
        if (!analysis.complete) catalogsComplete = false;
      }
      const projectCatalogs = projectByPath.get(relative) ?? [];
      const conflictingCatalogs = projectCatalogs.length > 1 && projectCatalogs.some(document => sniffRootElement(document.raw) === 'diff');
      const catalogBaseline = catalogs.filter(entry => entry.kind === kind);
      const variantCatalogs: CatalogCandidate[] = [];
      if (conflictingCatalogs) note(`${relative}: conflicting project catalog variants are composed independently; their candidates have no inferred ordering.`);
      for (const document of projectCatalogs) {
        if (sniffRootElement(document.raw) === 'diff') {
          const old = conflictingCatalogs ? catalogBaseline : catalogs.filter(entry => entry.kind === kind);
          const union = `<index>${old.map(entry => `<entry name="${escapeXml(entry.name)}" value="${escapeXml(entry.value)}"/>`).join('')}</index>`;
          const composition = compositionDocument(union, limits.maxDocumentBytes);
          const bound = composition && compositionPatch(composition, document.raw, limits.maxDocumentBytes);
          if (!bound || !reserveComposition(bound, relative)) {
            catalogsComplete = false; document.file.complete = false; projectCoverageComplete = false;
            note(`${relative}: project catalog diff exceeds the conservative composition estimate and was not executed.`); continue;
          }
          const simulation = simulateXmlDiff(union, document.raw, { elementProvenance: true });
          if (!simulation.ok) { catalogsComplete = false; document.file.complete = false; note(`${relative}: project catalog diff failed.`); continue; }
          const provenance = simulation.elementProvenance;
          document.effective = simulation.content;
          document.analysis = parse('project', relative, simulation.content, { locationKind: 'effective',
            ...(provenance?.available && provenance.document ? { document: provenance.document, positionForAttribute: (element, attribute) => {
              const point = provenance.attributes.get(element)?.get(attribute);
              return point?.line && point.column ? { origin: 'project', path: relative, kind: 'authored', line: point.line, column: point.column }
                : { origin: 'project', path: relative, kind: 'effective' };
            } } : {}) });
          document.file.complete = document.analysis.complete;
          document.file.reason = 'Catalog diff is composed over the scanned candidate registry; inherited positions are effective only.';
          const branch: CatalogCandidate[] = [];
          for (const entry of document.analysis.catalog) {
            const prior = old.filter(candidate => sameSymbol(candidate.name, entry.name) && candidate.value === entry.value);
            branch.push(...(prior.length ? prior : [{ ...entry, sourceId: document.file.id }]));
          }
          if (conflictingCatalogs) variantCatalogs.push(...branch);
          else catalogs = [...catalogs.filter(entry => entry.kind !== kind), ...branch];
          usedSignatures.set(`project-effective:${relative}`, sha256(simulation.content));
          continue;
        }
        if (!document.file.complete) catalogsComplete = false;
        // Project catalog candidates stay separate; duplicate IDs are observable.
        const branch = document.analysis.catalog.map(entry => ({ ...entry, sourceId: document.file.id }));
        if (conflictingCatalogs) variantCatalogs.push(...catalogBaseline, ...branch);
        else catalogs.push(...branch);
      }
      if (conflictingCatalogs) catalogs = [...catalogs.filter(entry => entry.kind !== kind), ...variantCatalogs];
    }
    return catalogs;
  };
  if (['index/macros.xml', 'index/components.xml'].some(relative =>
    projectByPath.get(relative)?.some(document => sniffRootElement(document.raw) === 'diff'))) loadCatalogs();
  let wareSources: { documents: SourceDocument[]; active: Set<string>; activeComplete: boolean; sourcesComplete: boolean } | null = null;
  const loadWareSources = () => {
    if (wareSources) return wareSources;
    const logical = 'libraries/wares.xml';
    const current = effectiveReference(logical);
    const activeAnalysis = current ? parse('reference', logical, current.effective) : null;
    const candidates: SourceDocument[] = [];
    let sourcesComplete = corpusAvailable && dlcCoverageComplete;
    for (const sourcePath of [logical, ...dlcs.map(dlc => `extensions/${dlc.folder}/${logical}`)]) {
      const document = referenceDocument(sourcePath);
      if (document) {
        candidates.push(document);
        if (!document.analysis.definitionsComplete) sourcesComplete = false;
      } else if (sourcePath === logical || failedReferencePaths.has(key(sourcePath))) sourcesComplete = false;
    }
    const fullDlcCollection = candidates.some(document => document.file.path !== logical && document.analysis.root === 'wares');
    wareSources = { documents: candidates,
      active: new Set(activeAnalysis?.definitions.filter(definition => definition.kind === 'ware').map(definition => key(definition.symbol)) ?? []),
      activeComplete: !!current?.complete && !!activeAnalysis?.definitionsComplete && !fullDlcCollection, sourcesComplete };
    if (fullDlcCollection) note('Full DLC ware collections require the existing canonical collection-merge repair (#11); raw contributors are candidates, not an inferred active merged result.');
    if (!wareSources.activeComplete) note('Current canonical ware identity is incomplete; authored contributor candidates remain navigable without an active-definition claim.');
    return wareSources;
  };
  const edges = new Map<string, XmlReferenceEdge>();
  const resolve = (source: SourceDocument, reference: XmlExtractedReference): XmlReferenceEdge => {
    const ordinal = source.analysis.references.indexOf(reference);
    const id = `${source.file.id}:ref:${ordinal}`;
    const prior = edges.get(id);
    if (prior) return prior;
    const edge: XmlReferenceEdge = { id, sourceId: source.file.id, targetIds: [], kind: reference.kind,
      symbol: reference.symbol.slice(0, 512), status: reference.status ?? 'missing', location: reference.location,
      ...(reference.reason ? { reason: reference.reason } : {}) };
    edges.set(id, edge);
    if (reference.status) return edge;
    if (!source.file.complete) { edge.status = 'incomplete'; edge.reason = source.file.reason || 'Source parsing/composition is incomplete.'; return edge; }
    const targets = new Map<string, SourceDocument>();
    let incompleteResolution = false;
    let canonicalWareReason: string | undefined;
    let catalogQualificationReason: string | undefined;
    const addTarget = (document: SourceDocument | null, expected?: { kind: XmlAssetSymbolKind; symbol: string }) => {
      if (!document) return;
      if (document.file.complete && expected && !document.analysis.definitions.some(definition => definition.kind === expected.kind && sameSymbol(definition.symbol, expected.symbol))) return;
      targets.set(document.file.id, document);
    };
    if (reference.targetKind === 'file') {
      const targetPath = xmlCatalogTargetPath(reference.value);
      if (!targetPath) { edge.status = 'unsupported'; edge.reason = 'Catalog value is unsafe, dynamic or not a supported XML file path.'; return edge; }
      const projectTargets = projectByPath.get(key(targetPath));
      if (projectTargets?.length) for (const document of projectTargets) addTarget(document, reference.expectedDefinition);
      else {
        addTarget(referenceDocument(targetPath), reference.expectedDefinition);
        if (failedReferencePaths.has(key(targetPath))) incompleteResolution = true;
      }
    } else if (reference.targetKind) {
      for (const document of projectByPath.values()) for (const candidate of document) {
        if (candidate.analysis.definitions.some(definition => definition.kind === reference.targetKind && sameSymbol(definition.symbol, reference.value))) targets.set(candidate.file.id, candidate);
      }
      // These definitions prove source links independently of catalog membership.
      const independentProjectTargets = new Set([...targets.values()].filter(document => document.file.complete).map(document => document.file.id));
      const projectWareOverride = reference.targetKind === 'ware' && [...targets.values()].some(document => key(document.file.path) === 'libraries/wares.xml');
      if (reference.targetKind === 'ware' && !projectWareOverride) {
        const wares = loadWareSources();
        for (const document of wares.documents) {
          if (document.analysis.definitions.some(definition => definition.kind === 'ware' && sameSymbol(definition.symbol, reference.value))) {
            addTarget(document, { kind: 'ware', symbol: reference.value });
          }
        }
        if (!wares.activeComplete || !wares.sourcesComplete) {
          incompleteResolution = true; canonicalWareReason = 'Canonical ware composition or contributor inventory is incomplete; this is an authored candidate, not a proven active canonical identity.';
        } else if (!wares.active.has(key(reference.value)) && [...targets.values()].every(document => document.file.origin === 'reference')) {
          incompleteResolution = true; canonicalWareReason = 'The authored ware declaration is absent from the complete effective canonical data (removed or renamed); it is a historical source candidate.';
        } else if (!targets.size && wares.active.has(key(reference.value))) {
          incompleteResolution = true; canonicalWareReason = 'The effective canonical ware exists, but its exact authored declaration/rename source could not be attributed; missing is not established.';
        }
      }
      const entries = reference.targetKind === 'ware' ? [] : loadCatalogs().filter(entry => entry.kind === reference.targetKind && xmlCatalogNameMatches(entry.name, reference.value));
      if (entries.length > 32) { truncated = true; edge.status = 'incomplete'; note('Symbol candidate limit reached; additional candidates remain unknown.'); }
      for (const entry of entries.slice(0, 32)) {
        const targetPath = xmlCatalogTargetPath(entry.value);
        if (!targetPath) { incompleteResolution = true; note('An unsafe/dynamic catalog value was excluded from source resolution.'); continue; }
        const projectTargets = projectByPath.get(key(targetPath));
        if (projectTargets?.length) for (const document of projectTargets) addTarget(document, { kind: reference.targetKind, symbol: reference.value });
        else {
          addTarget(referenceDocument(targetPath), { kind: reference.targetKind, symbol: reference.value });
          if (failedReferencePaths.has(key(targetPath))) incompleteResolution = true;
        }
      }
      if ((reference.targetKind === 'macro' || reference.targetKind === 'component') && unqualifiedCatalogKinds.has(reference.targetKind)
        && (!targets.size || [...targets.keys()].some(id => !independentProjectTargets.has(id)))) {
        catalogQualificationReason = `Full official-DLC ${reference.targetKind} index collection identity requires #11 qualification; retained catalog targets are navigable source candidates, and absence is not established.`;
      }
    }
    const values = [...targets.values()];
    edge.targetIds = values.map(document => document.file.id);
    edge.candidates = values.map(document => ({ fileId: document.file.id, origin: document.file.origin, path: document.file.path }));
    if (values.length === 1) edge.targetId = values[0].file.id;
    if (values.length > 1) { edge.status = catalogQualificationReason ? 'incomplete' : 'ambiguous'; edge.reason = `Multiple real defining files match this symbol; no load-order winner is inferred.${canonicalWareReason ? ` ${canonicalWareReason}` : ''}${catalogQualificationReason ? ` ${catalogQualificationReason}` : ''}`; }
    else if (edge.status !== 'incomplete' && !canonicalWareReason && !catalogQualificationReason && values.length === 1 && values[0].file.complete) {
      edge.status = 'resolved';
      edge.reason = reference.location.kind === 'effective'
        ? 'Real definition found. Effective source lineage does not establish an original raw-token position.'
        : 'Real defining XML found; source navigation does not prove runtime registration or loading.';
    } else if (values.length === 1 || catalogQualificationReason || truncated || incompleteResolution || !projectCoverageComplete || (!catalogsComplete && reference.targetKind !== 'file') || !corpusAvailable) {
      edge.status = 'incomplete'; edge.reason = catalogQualificationReason || canonicalWareReason || 'Available source/catalog coverage is incomplete; missing is not established.';
    } else { edge.status = 'missing'; edge.reason = 'No matching real definition was found in project XML and the configured official catalog candidates.'; }
    return edge;
  };
  let selected: SourceDocument[] = [];
  if (focus?.path) {
    selected = focus.origin === 'project' ? projectByPath.get(key(focus.path)) ?? [] : [referenceDocument(focus.path)].filter((document): document is SourceDocument => Boolean(document));
  } else selected = [...documents.values()].filter(document => document.file.origin === 'project').slice(0, 1);
  if (!selected.length) note('The selected XML file is unavailable in the declared source scope.');
  if (selected.length > 1) note('The selected project path has conflicting source variants; all candidates remain visible and no preview winner is selected.');
  const queue = selected.map(document => ({ document, depth: 0 }));
  const visited = new Set<string>();
  while (queue.length) {
    const { document, depth } = queue.shift()!;
    if (visited.has(document.file.id)) continue;
    if (visited.size >= limits.maxNodes) { truncated = true; note('File neighborhood node limit reached; follow a file to expand a new neighborhood.'); break; }
    visited.add(document.file.id);
    if (depth >= limits.maxDepth) {
      const knownIncoming = [...documents.values()].some(source => source.file.id !== document.file.id && source.analysis.references.some(reference =>
        reference.targetKind === 'file' ? sameSymbol(xmlCatalogTargetPath(reference.value) || '', document.file.path)
          : document.analysis.definitions.some(definition => definition.kind === reference.targetKind && sameSymbol(definition.symbol, reference.value))));
      if (document.analysis.references.length || knownIncoming) { truncated = true; note('Traversal depth reached; outgoing or known incoming boundary references were not expanded.'); }
      continue;
    }
    for (const reference of document.analysis.references) {
      if (edges.size >= limits.maxEdges) { truncated = true; note('Reference edge limit reached; remaining edges are unscanned.'); break; }
      const edge = resolve(document, reference);
      for (const id of edge.targetIds) { const target = documents.get(id); if (target) queue.push({ document: target, depth: depth + 1 }); }
    }
    // Incoming edges are bounded by actually parsed project/reached documents,
    // never advertised as a reverse index of the entire unpacked corpus.
    for (const source of [...documents.values()]) {
      if (source.file.id === document.file.id) continue;
      for (const reference of source.analysis.references) {
        const bySymbol = reference.targetKind && reference.targetKind !== 'file'
          && document.analysis.definitions.some(definition => definition.kind === reference.targetKind && sameSymbol(definition.symbol, reference.value));
        const byPath = reference.targetKind === 'file' && sameSymbol(xmlCatalogTargetPath(reference.value) || '', document.file.path);
        if (!bySymbol && !byPath) continue;
        if (edges.size >= limits.maxEdges) { truncated = true; break; }
        const edge = resolve(source, reference);
        if (edge.targetIds.includes(document.file.id)) queue.push({ document: source, depth: depth + 1 });
      }
    }
  }
  const files = [...documents.values()].map(document => document.file);
  const effectiveFocus: XmlReferenceFocus | undefined = selected[0] ? { ...focus, origin: selected[0].file.origin, path: selected[0].file.path } : undefined;
  const neighborhood = selectXmlReferenceNeighborhood(files, [...edges.values()], effectiveFocus, limits);
  if (neighborhood.truncated) { truncated = true; note('Displayed neighborhood limits reached; expansion is bounded and incoming scope remains partial.'); }
  const usedSourceSignature = sha256([...usedSignatures].filter(([name]) => !name.startsWith('project:')).map(([name, hash]) => `${name}|${hash}`).sort().join('\n'));
  const context: XmlReferenceContext = { ...input.context,
    inputFingerprint: input.context?.inputFingerprint || sha256([...usedSignatures].filter(([name]) => name.startsWith('project:')).map(([name, hash]) => `${name}|${hash}`).join('\n')),
    corpusSignature: input.context?.corpusSignature || usedSourceSignature, usedSourceSignature };
  const result: XmlReferenceMapResult = { ok: selected.length > 0, schemaVersion: 'forge.xml-reference-map.v1',
    signature: sha256(JSON.stringify({ sources: [...usedSignatures].sort(), focus: effectiveFocus, limits, context })),
    files, nodes: neighborhood.nodes, edges: neighborhood.edges,
    coverage: { scope: 'Explicit project XML and lazily reached configured base/official-DLC XML.',
      incomingScope: 'Incoming references cover parsed project XML and reference files reached in this response, not every corpus file.',
      scannedFiles: documents.size, scannedProjectFiles: files.filter(file => file.origin === 'project').length,
      scannedReferenceFiles: files.filter(file => file.origin === 'reference').length, knownProjectFiles: projectInputs.length,
      truncated, reasons: [...reasons], unsupported: neighborhood.edges.filter(edge => edge.status === 'unsupported' || edge.status === 'dynamic').length,
      incomplete: files.filter(file => !file.complete).length + neighborhood.edges.filter(edge => edge.status === 'incomplete').length
        + unavailableProjectFiles + failedReferencePaths.size + (corpusAvailable ? 0 : 1), limits }, context };
  if (input.includeSource !== false && selected.length === 1) {
    const document = selected[0];
    const lines = document.raw.split(/\r\n|\r|\n/);
    const wantedLine = effectiveFocus?.line && effectiveFocus.line <= lines.length ? effectiveFocus.line : 1;
    const startLine = Math.max(1, wantedLine - 12);
    const source = lines.slice(startLine - 1).join('\n');
    const content = source.slice(0, limits.maxPreviewChars);
    result.preview = { fileId: document.file.id, origin: document.file.origin, path: document.file.path,
      sha256: document.file.sha256, content, startLine, truncated: startLine > 1 || content.length < source.length, locationKind: 'authored',
      ...(effectiveFocus?.line && effectiveFocus.line <= lines.length ? { line: effectiveFocus.line, column: effectiveFocus.column } : {}) };
  }
  const responseBytes = () => Buffer.byteLength(JSON.stringify(result), 'utf8');
  if (responseBytes() > limits.maxResponseBytes) {
    result.coverage.truncated = true;
    result.coverage.reasons.push('Response byte limit reached; source lineage and/or remaining edges were omitted. Expand a narrower file neighborhood.');
    // Keep identities/selected source usable. Raw authored positions never depend
    // on these omitted document-level lineage labels.
    for (const file of [...result.files, ...result.nodes]) delete file.sourcePaths;
    while (result.edges.length && responseBytes() > limits.maxResponseBytes) {
      result.edges.splice(Math.floor(result.edges.length * 0.75));
    }
    // At fixed file/node/path budgets the remaining envelope is below 2 MiB;
    // still fail closed if a trusted caller supplied oversized context metadata.
    if (responseBytes() > limits.maxResponseBytes) {
      delete result.context; delete result.preview;
      result.coverage.reasons.push('Oversized context/source preview omitted by the response limit.');
    }
    result.coverage.unsupported = result.edges.filter(edge => edge.status === 'unsupported' || edge.status === 'dynamic').length;
  }
  return result;
}
