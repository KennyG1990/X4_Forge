/** Shared, read-only XML file-reference contract and deterministic extraction. */
import { DOMParser, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import { resolveReferenceBinding, resolveXmlAssetReferenceBinding } from './referenceBindings';
import { createXmlNodePositionLocator } from './xmlSourceSpans';
import type { SchemaIndex } from './xsdValidate';
export type XmlReferenceOrigin = 'project' | 'reference';
export type XmlReferenceStatus = 'resolved' | 'missing' | 'ambiguous' | 'dynamic' | 'unsupported' | 'incomplete';
export type XmlReferenceLocationKind = 'authored' | 'effective';
export type XmlReferenceKind = 'macro' | 'component' | 'ware' | 'bullet' | 'index-file' | 'local-connection' | 'unknown';
export interface XmlReferenceFocus { origin: XmlReferenceOrigin; path: string; line?: number; column?: number }
export interface XmlReferenceMapRequest {
  workspace?: unknown;
  project?: unknown;
  focus?: XmlReferenceFocus;
  maxDepth?: number;
  maxNodes?: number;
  maxEdges?: number;
  includeSource?: boolean;
}
export interface XmlReferenceLocation extends XmlReferenceFocus { kind: XmlReferenceLocationKind }
export interface XmlReferenceFile {
  id: string;
  origin: XmlReferenceOrigin;
  path: string;
  sha256: string;
  locationKind: XmlReferenceLocationKind;
  complete: boolean;
  available: boolean;
  depth?: number;
  sourcePaths?: string[];
  reason?: string;
}
export interface XmlReferenceEdge {
  id: string;
  sourceId: string;
  targetId?: string;
  targetIds: string[];
  kind: XmlReferenceKind;
  symbol: string;
  status: XmlReferenceStatus;
  reason?: string;
  candidates?: Array<{ fileId: string; origin: XmlReferenceOrigin; path: string }>;
  location: XmlReferenceLocation;
}
export interface XmlReferenceLimits {
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  maxDocuments: number;
  maxDocumentBytes: number;
  maxTotalBytes: number;
  maxPreviewChars: number;
  maxResponseBytes: number;
}
export interface XmlReferenceCoverage {
  scope: string;
  incomingScope: string;
  scannedFiles: number;
  scannedProjectFiles: number;
  scannedReferenceFiles: number;
  knownProjectFiles: number;
  truncated: boolean;
  reasons: string[];
  unsupported: number;
  incomplete: number;
  limits: XmlReferenceLimits;
}
export interface XmlReferencePreview {
  fileId: string;
  origin: XmlReferenceOrigin;
  path: string;
  sha256: string;
  content: string;
  startLine: number;
  truncated: boolean;
  locationKind: 'authored';
  line?: number;
  column?: number;
}
export interface XmlReferenceContext {
  inputMode?: string;
  inputFingerprint?: string;
  workspaceId?: string;
  corpusSignature?: string;
  corpusGeneration?: string;
  usedSourceSignature?: string;
  nativeSourceFolder?: string;
}
export interface XmlReferenceMapResult {
  ok: boolean;
  schemaVersion: 'forge.xml-reference-map.v1';
  signature: string;
  files: XmlReferenceFile[];
  nodes: XmlReferenceFile[];
  edges: XmlReferenceEdge[];
  coverage: XmlReferenceCoverage;
  preview?: XmlReferencePreview;
  context?: XmlReferenceContext;
}

export type XmlAssetSymbolKind = 'macro' | 'component' | 'ware';
export interface XmlReferenceDefinition {
  kind: XmlAssetSymbolKind;
  symbol: string;
  location: XmlReferenceLocation;
}
export interface XmlExtractedReference {
  kind: XmlReferenceKind;
  targetKind?: XmlAssetSymbolKind | 'file';
  value: string;
  symbol: string;
  location: XmlReferenceLocation;
  status?: Exclude<XmlReferenceStatus, 'resolved' | 'missing' | 'ambiguous'>;
  reason?: string;
  expectedDefinition?: { kind: XmlAssetSymbolKind; symbol: string };
}
export interface XmlCatalogEntry {
  kind: 'macro' | 'component';
  name: string;
  value: string;
  location: XmlReferenceLocation;
}
export interface XmlReferenceDocumentAnalysis {
  root: string;
  complete: boolean;
  definitionsComplete: boolean;
  definitions: XmlReferenceDefinition[];
  references: XmlExtractedReference[];
  catalog: XmlCatalogEntry[];
  issues: string[];
}

/** Relative XML paths only. Decode neither percent escapes nor URI schemes. */
export function normalizeXmlReferencePath(input: string): string | null {
  if (typeof input !== 'string' || !input || input.length > 1024) return null;
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    if (code < 32 || code === 127) return null;
  }
  const value = input.replace(/\\/g, '/').replace(/^\.\//, '');
  if (value.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return value;
}

export function xmlCatalogTargetPath(value: string): string | null {
  const safe = normalizeXmlReferencePath(value);
  if (!safe || /[*?{}$]/.test(safe)) return null;
  return /\.xml$/i.test(safe) ? safe : `${safe}.xml`;
}

export function xmlReferenceFileId(origin: XmlReferenceOrigin, relativePath: string, variant = ''): string {
  return `${origin}:${relativePath}${variant ? `#${variant}` : ''}`;
}

export function xmlCatalogNameMatches(pattern: string, symbol: string): boolean {
  if (pattern.length > 512 || symbol.length > 512) return false;
  const parts = pattern.toLowerCase().split('*');
  const value = symbol.toLowerCase();
  if (parts.length === 1) return parts[0] === value;
  if (!value.startsWith(parts[0]) || !value.endsWith(parts[parts.length - 1])) return false;
  let cursor = parts[0].length;
  const end = value.length - parts[parts.length - 1].length;
  for (let index = 1; index < parts.length - 1; index++) {
    const found = value.indexOf(parts[index], cursor);
    if (found < 0 || found + parts[index].length > end) return false;
    cursor = found + parts[index].length;
  }
  return cursor <= end;
}

/** No I/O: callers own content, optional schema and any effective-to-authored mapping. */
export function analyzeXmlReferenceDocument(input: {
  origin: XmlReferenceOrigin;
  path: string;
  content: string;
  locationKind?: XmlReferenceLocationKind;
  document?: XmlDocument;
  positionForAttribute?: (element: XmlElement, attribute: string) => XmlReferenceLocation;
  schema?: SchemaIndex | null;
  schemaDomain?: string;
  /** Authored payload context for the configured canonical wares contributor. */
  definitionDomain?: 'wares';
}): XmlReferenceDocumentAnalysis {
  const result: XmlReferenceDocumentAnalysis = { root: '', complete: true, definitionsComplete: true, definitions: [], references: [], catalog: [], issues: [] };
  const issue = (message: string) => { result.complete = false; if (result.issues.length < 16) result.issues.push(message.slice(0, 300)); };
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(input.content)) { result.definitionsComplete = false; issue('DTD/entity declarations are outside the bounded XML navigation parser.'); return result; }
  let document: XmlDocument;
  try {
    document = input.document ?? new DOMParser({ onError: (level: string) => { issue(`XML parser reported ${level}; recovered XML is not authoritative.`); } })
      .parseFromString(input.content.replace(/^\uFEFF/, ''), 'text/xml');
  } catch { result.definitionsComplete = false; issue('XML could not be parsed.'); return result; }
  const root = document.documentElement;
  if (!root || !result.complete) { result.definitionsComplete = false; return result; }
  result.root = root.nodeName.toLowerCase();
  const locator = createXmlNodePositionLocator(input.content);
  const position = (element: XmlElement, attribute: string): XmlReferenceLocation => {
    if (input.positionForAttribute) return input.positionForAttribute(element, attribute);
    const kind = input.locationKind || 'authored';
    const point = kind === 'authored' ? locator.point(element.getAttributeNode(attribute) ?? element) : undefined;
    return { origin: input.origin, path: input.path, kind, ...(point ?? {}) };
  };
  const catalogKind = /(?:^|\/)index\/macros\.xml$/i.test(input.path) ? 'macro'
    : /(?:^|\/)index\/components\.xml$/i.test(input.path) ? 'component' : undefined;
  // Definition inventory is independent of outgoing-reference limits. A large
  // wares file may have more production inputs than the displayed graph can show.
  const rootDefinition: XmlAssetSymbolKind | undefined = result.root === 'macros' ? 'macro' : result.root === 'components' ? 'component' : result.root === 'wares' ? 'ware' : undefined;
  if (rootDefinition) for (let index = 0; index < root.childNodes.length; index++) {
    const child = root.childNodes[index];
    if (child.nodeType !== 1 || child.nodeName.toLowerCase() !== rootDefinition) continue;
    const element = child as XmlElement;
    const attribute = rootDefinition === 'ware' ? 'id' : 'name';
    const symbol = element.getAttribute(attribute)?.trim();
    if (!symbol) continue;
    if (result.definitions.length >= 10_000) { result.definitionsComplete = false; issue('XML definition inventory budget reached.'); break; }
    result.definitions.push({ kind: rootDefinition, symbol, location: position(element, attribute) });
  }
  const pending: Array<{ element: XmlElement; ancestors: string[] }> = [{ element: root, ancestors: [] }];
  const referenceBudget = catalogKind ? 20_000 : 2_000;
  let elements = 0;
  while (pending.length) {
    const { element, ancestors } = pending.pop()!;
    if (++elements > 30_000 || ancestors.length > 128 || result.references.length >= referenceBudget || result.definitions.length >= 10_000) {
      if (!rootDefinition) result.definitionsComplete = false;
      issue('XML element/reference/depth budget reached; this file was only partially scanned.'); break;
    }
    const tag = element.nodeName.toLowerCase();
    const payload = ancestors.includes('add') || ancestors.includes('replace');
    const warePayload = result.root === 'diff' && input.definitionDomain === 'wares' && payload;
    if (warePayload && tag === 'ware' && element.getAttribute('id')) {
      result.definitions.push({ kind: 'ware', symbol: element.getAttribute('id')!.trim(), location: position(element, 'id') });
    }
    if ((result.root === 'index' || result.root === 'diff' && payload) && tag === 'entry' && catalogKind) {
      const name = element.getAttribute('name')?.trim();
      const value = element.getAttribute('value')?.trim();
      if (name && value && name.length <= 512 && value.length <= 1024) {
        const location = position(element, 'value');
        result.catalog.push({ kind: catalogKind, name, value, location });
        result.references.push({ kind: 'index-file', targetKind: 'file', value, symbol: name, location,
          ...(!name.includes('*') ? { expectedDefinition: { kind: catalogKind, symbol: name } } : {}) });
      } else if (name || value) issue('Catalog entry has missing or oversized name/value; catalog coverage is incomplete.');
    }
    for (let index = 0; index < element.attributes.length; index++) {
      const attr = element.attributes[index];
      const attribute = attr.name.toLowerCase();
      const binding = resolveXmlAssetReferenceBinding({ root: warePayload ? 'wares' : result.root, ancestors, element: tag, attribute });
      let targetKind = binding?.targetKind;
      let unsupportedSchemaKind: string | null = null;
      if (!binding && input.schema) {
        const spec = input.schema.elements.get(tag)?.attributes.get(attribute);
        // Component schema types are intentionally not folded into the completion
        // engine's macro union. Only unambiguous in-scope typed namespaces extend it.
        const types = `${spec?.type || ''} ${spec?.baseType || ''}`.toLowerCase();
        const typed = types.includes('component') ? null : resolveReferenceBinding({ domain: input.schemaDomain || result.root,
          element: tag, attribute, type: spec?.type, baseType: spec?.baseType });
        if (typed === 'macro' || typed === 'ware') targetKind = typed;
        else if (typed) unsupportedSchemaKind = typed;
      }
      if (!binding && !targetKind && !unsupportedSchemaKind && attribute !== 'ref') continue;
      const value = attr.value.trim();
      const reference: XmlExtractedReference = { kind: binding?.kind ?? targetKind ?? 'unknown', targetKind,
        value: value.slice(0, 512), symbol: value.slice(0, 512), location: position(element, attr.name) };
      if (value.length > 512) {
        reference.status = 'incomplete'; reference.reason = 'Reference value exceeds the bounded literal size.';
      } else if (unsupportedSchemaKind) {
        reference.status = 'unsupported'; reference.reason = `The shared schema binds this as ${unsupportedSchemaKind}; file navigation for that namespace is outside this asset map.`;
      } else if (binding?.scope === 'local') {
        reference.status = 'unsupported';
        reference.reason = 'Connection names are scoped within the referenced component; they are not global file IDs.';
      } else if (!binding && !targetKind) {
        reference.status = 'unsupported';
        reference.reason = 'No corpus-grounded contextual or supported schema binding exists for this reference attribute.';
      } else if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)) {
        reference.status = 'dynamic'; reference.reason = 'This value is not a statically resolvable literal asset ID.';
      }
      result.references.push(reference);
    }
    const children: XmlElement[] = [];
    for (let index = 0; index < element.childNodes.length; index++) {
      const child = element.childNodes[index];
      if (child.nodeType === 1) children.push(child as XmlElement);
    }
    for (let index = children.length - 1; index >= 0; index--) pending.push({ element: children[index], ancestors: [...ancestors, tag] });
  }
  return result;
}

/** Deterministic bounded undirected neighborhood, retaining directional edges. */
export function selectXmlReferenceNeighborhood(files: XmlReferenceFile[], edges: XmlReferenceEdge[], focus: XmlReferenceFocus | undefined,
  limits: Pick<XmlReferenceLimits, 'maxDepth' | 'maxNodes' | 'maxEdges'>) {
  const byId = new Map(files.map(file => [file.id, file]));
  const seeds = focus ? files.filter(file => file.origin === focus.origin && file.path.toLowerCase() === focus.path.toLowerCase()) : files.slice(0, 1);
  const depths = new Map<string, number>();
  const queue = seeds.map(file => ({ id: file.id, depth: 0 }));
  let truncated = false;
  while (queue.length) {
    const current = queue.shift()!;
    if (depths.has(current.id) || !byId.has(current.id)) continue;
    if (depths.size >= limits.maxNodes) { truncated = true; continue; }
    depths.set(current.id, current.depth);
    if (current.depth >= limits.maxDepth) {
      if (edges.some(edge => edge.sourceId === current.id && edge.targetIds.some(id => !depths.has(id))
        || edge.targetIds.includes(current.id) && !depths.has(edge.sourceId))) truncated = true;
      continue;
    }
    for (const edge of edges) {
      if (edge.sourceId === current.id) for (const id of edge.targetIds) queue.push({ id, depth: current.depth + 1 });
      else if (edge.targetIds.includes(current.id)) queue.push({ id: edge.sourceId, depth: current.depth + 1 });
    }
  }
  const selectedEdges = edges.filter(edge => depths.has(edge.sourceId) || edge.targetIds.some(id => depths.has(id)));
  if (selectedEdges.length > limits.maxEdges) truncated = true;
  return { nodes: [...depths].map(([id, depth]) => ({ ...byId.get(id)!, depth })),
    edges: selectedEdges.slice(0, limits.maxEdges), truncated };
}
