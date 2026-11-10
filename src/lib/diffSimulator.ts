/**
 * Read-only X4 XML-patch interpreter.
 *
 * The game grammar is libraries/diff.xsd.  This module deliberately keeps the
 * interpreter pure: callers provide base + <diff> text and receive a new string
 * plus diagnostics.  No filesystem writes are possible here.
 */

import * as xpath from 'xpath';
import {
  DOMParser,
  normalizeLineEndings,
  XMLSerializer,
  type Attr as XmlAttr,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
} from '@xmldom/xmldom';
import { createXmlNodePositionLocator } from './xmlSourceSpans';

export type DiffPosition = 'child' | 'before' | 'after' | 'prepend';

export interface DiffOperation {
  type: 'add' | 'replace' | 'remove';
  sel: string;
  pos?: DiffPosition;
  /** X4 diff.xsd calls this `type`; attribute additions use values such as @chance. */
  attrType?: string;
  content?: string;
  ifCondition?: string;
  silent?: boolean;
  line?: number;
}

export interface DiffFinding {
  severity: 'error' | 'warning' | 'info';
  code:
    | 'DIFF_XML_INVALID'
    | 'DIFF_ROOT_INVALID'
    | 'DIFF_OPERATION_INVALID'
    | 'DIFF_SELECTOR_INVALID'
    | 'DIFF_SELECTOR_ZERO'
    | 'DIFF_SELECTOR_MULTI'
    | 'DIFF_CONDITION_INVALID'
    | 'DIFF_CONDITION_FALSE'
    | 'DIFF_APPLY_FAILED';
  message: string;
  operation?: number;
  line?: number;
  selector?: string;
  matches?: number;
}

export interface DiffSimulationResult {
  ok: boolean;
  content: string;
  operations: Array<DiffOperation & { index: number; matches: number; applied: boolean }>;
  findings: DiffFinding[];
  /** Opt-in provenance of surviving literal operation-text attribute assignments. */
  attributeAssignments?: DiffAttributeAssignment[];
  attributeAttributionGaps?: DiffAttributeAttributionGap[];
  /** Internal, opt-in DOM analysis; never emitted by default HTTP simulations. */
  elementProvenance?: DiffElementProvenance;
}

export interface DiffSimulationOptions {
  attributeProvenance?: boolean;
  elementProvenance?: boolean | { maxElements?: number; maxSourceChars?: number };
}

export interface DiffSourcePoint { operation: number; line?: number; column?: number; reason?: string }
export interface DiffElementState {
  readonly id: number;
  readonly elementName: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly parent: XmlElement | null;
}
export interface DiffElementProvenance {
  available: boolean;
  reason?: string;
  document?: XmlDocument;
  initial: ReadonlyMap<XmlElement, DiffElementState>;
  elements: ReadonlyMap<XmlElement, DiffSourcePoint>;
  attributes: ReadonlyMap<XmlElement, ReadonlyMap<string, DiffSourcePoint>>;
  removed: ReadonlyMap<XmlElement, DiffSourcePoint>;
  /** Actual pre-mutation parent identities, including nodes authored by earlier operations. */
  removedParents: ReadonlyMap<XmlElement, XmlElement | null>;
  gaps: readonly string[];
}

export interface DiffAttributePayload {
  /** Decoded UTF-16 offset -> original, one-based authored patch position. */
  locate(decodedOffset: number): { line: number; column: number } | undefined;
}

export interface DiffAttributeAssignment {
  operation: number;
  elementName: string;
  attributeName: string;
  value: string;
  /** One mapper is shared by every target of the same authored operation. */
  payload: DiffAttributePayload;
}

export interface DiffAttributeAttributionGap {
  operation: number;
  elementName: string;
  attributeName: string;
  reason: string;
}

interface LiteralPayload {
  value: string;
  payload: DiffAttributePayload;
}

type LiteralPayloadResult = LiteralPayload | { reason: string };

interface AttributeProvenanceContext {
  payload(operation: number): LiteralPayloadResult;
}

interface ElementSourceContext {
  source: string;
  repaired: boolean;
  operations: XmlElement[];
  point(node: XmlNode): { line: number; column: number } | undefined;
  payload(operation: number): LiteralPayloadResult;
}

const serializer = new XMLSerializer();

function isElement(node: XmlNode | null | undefined): node is XmlElement {
  return Boolean(node && node.nodeType === 1);
}

function parseDocument(xml: string, rejectRepairs = false): { document: XmlDocument | null; error?: string; repaired?: boolean } {
  let fatal = '';
  let repaired = false;
  try {
    const document = new DOMParser({
      onError(level: string, message: string) {
        if (level === 'warning') repaired = true;
        if (level === 'fatalError' || level === 'error' || (rejectRepairs && level === 'warning')) fatal ||= message;
      },
    }).parseFromString(String(xml || '').replace(/^\uFEFF/, ''), 'text/xml');
    if (!document?.documentElement) return { document: null, error: fatal || 'document has no root element' };
    if (fatal) return { document: null, error: fatal };
    return { document, repaired };
  } catch (error) {
    return { document: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Canonical source authority cannot rely on a parser's repaired XML. Default simulation stays compatible. */
export function validateDiffSourceXml(xml: string): DiffFinding[] {
  const parsed = parseDocument(xml, true);
  return parsed.document ? [] : [{ severity: 'error', code: 'DIFF_XML_INVALID',
    message: `Reference XML is invalid: ${parsed.error || 'parse failed'}.` }];
}

function operationLines(xml: string): number[] {
  const lines: number[] = [];
  for (const match of xml.matchAll(/<(?:add|replace|remove)\b/gi)) {
    lines.push(xml.slice(0, match.index || 0).split('\n').length);
  }
  return lines;
}

function serializeChildren(element: XmlElement): string {
  let value = '';
  for (let i = 0; i < element.childNodes.length; i++) value += serializer.serializeToString(element.childNodes[i]);
  return value;
}

const PAYLOAD_XML_ENTITIES: Readonly<Record<string, string>> = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>' };

function decodePayloadEntity(entity: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(PAYLOAD_XML_ENTITIES, entity)) return PAYLOAD_XML_ENTITIES[entity];
  if (!/^#(?:x[\da-f]+|\d+)$/i.test(entity)) return undefined;
  const point = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return undefined;
  return String.fromCodePoint(point);
}

function createPayloadMapper(source: string, locator = createXmlNodePositionLocator(source)): (operation: XmlElement) => LiteralPayloadResult {
  const locateRaw = locator.locateRaw;
  const rawOffset = locator.offset;

  interface SourceRun {
    decodedStart: number;
    rawStart: number;
    length: number;
    stride: number;
  }

  interface Piece {
    start: number;
    end: number;
    cdata: boolean;
    decodedLength: number;
    decodedStart: number;
    runs: SourceRun[];
  }

  /**
   * Retain affine runs rather than a per-character or per-target source map.
   * Ordinary literal text compresses to one run; entities and newline contractions
   * introduce sparse changes. Numeric entities may emit two UTF-16 units.
   * The second newline normalization mirrors serializeChildren -> wrapper parse.
   */
  const mapPiece = (piece: Piece): boolean => {
    let decoded = 0;
    let pendingCr: number | undefined;
    const emit = (raw: number) => {
      const last = piece.runs.at(-1);
      if (last?.length === 1) {
        last.stride = raw - last.rawStart;
        last.length++;
      } else if (last && raw === last.rawStart + last.length * last.stride) {
        last.length++;
      } else {
        piece.runs.push({ decodedStart: decoded, rawStart: raw, length: 1, stride: 1 });
      }
      decoded++;
    };
    for (let cursor = piece.start; cursor < piece.end;) {
      const tokenStart = cursor;
      let text = source[cursor++];
      if (text === '\r') {
        if (source[cursor] === '\n' || source[cursor] === '\u0085') cursor++;
        text = '\n';
      } else if (text === '\u0085' || text === '\u2028' || text === '\u2029') {
        text = '\n';
      } else if (!piece.cdata && text === '&') {
        const end = source.indexOf(';', cursor);
        if (end < 0 || end >= piece.end) return false;
        const entity = decodePayloadEntity(source.slice(cursor, end));
        if (entity === undefined) return false;
        text = entity;
        cursor = end + 1;
      }
      for (let index = 0; index < text.length; index++) {
        const unit = text[index];
        if (pendingCr !== undefined) {
          emit(pendingCr);
          pendingCr = undefined;
          if (unit === '\n' || unit === '\u0085') continue;
        }
        if (unit === '\r') pendingCr = tokenStart;
        else emit(tokenStart);
      }
    }
    if (pendingCr !== undefined) emit(pendingCr);
    return decoded === piece.decodedLength;
  };

  return operation => {
    const pieces: Piece[] = [];
    const values: string[] = [];
    const pending: XmlNode[] = [];
    for (let i = operation.childNodes.length - 1; i >= 0; i--) pending.push(operation.childNodes[i]);
    let length = 0;
    while (pending.length) {
      const node = pending.pop()!;
      if (node.nodeType === 1) {
        for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i]);
        continue;
      }
      if (node.nodeType !== 3 && node.nodeType !== 4) continue;
      const offset = rawOffset(node);
      if (offset === undefined) return { reason: 'Original operation text has no reliable source locator.' };
      const cdata = node.nodeType === 4;
      if (cdata && !source.startsWith('<![CDATA[', offset)) {
        return { reason: 'Original CDATA locator does not match its authored opener.' };
      }
      const start = offset + (cdata ? 9 : 0);
      let end = source.indexOf(cdata ? ']]>' : '<', start);
      if (end < 0) end = source.length;
      let unsupportedEntity = false;
      let firstValue = normalizeLineEndings(source.slice(start, end));
      if (!cdata) {
        firstValue = firstValue.replace(/&([^;]*);/g, (_match, name: string) => {
          const value = decodePayloadEntity(name);
          if (value === undefined) unsupportedEntity = true;
          return value ?? '';
        });
      }
      if (unsupportedEntity) return { reason: 'Original operation text contains an unsupported entity expansion.' };
      if (firstValue !== (node.nodeValue || '')) {
        return { reason: 'Original operation text could not be matched to its parsed value.' };
      }
      const value = normalizeLineEndings(firstValue);
      const piece: Piece = { start, end, cdata, decodedLength: value.length, decodedStart: length, runs: [] };
      if (!mapPiece(piece)) return { reason: 'Original operation text has an inconsistent decoded source map.' };
      pieces.push(piece);
      values.push(value);
      length += value.length;
    }
    const value = values.join('');
    return {
      value,
      payload: {
        locate(offset) {
          if (!Number.isInteger(offset) || offset < 0 || offset > length) return undefined;
          if (offset === length) {
            const last = pieces.at(-1);
            return last ? locateRaw(last.end) : undefined;
          }
          let low = 0;
          let high = pieces.length;
          while (low < high) {
            const middle = Math.floor((low + high) / 2);
            const candidate = pieces[middle];
            if (candidate.decodedStart + candidate.decodedLength <= offset) low = middle + 1;
            else high = middle;
          }
          const piece = pieces[low];
          if (!piece) return undefined;
          const wanted = offset - piece.decodedStart;
          low = 0;
          high = piece.runs.length;
          while (low + 1 < high) {
            const middle = Math.floor((low + high) / 2);
            if (piece.runs[middle].decodedStart <= wanted) low = middle;
            else high = middle;
          }
          const run = piece.runs[low];
          if (!run || wanted < run.decodedStart || wanted >= run.decodedStart + run.length) return undefined;
          return locateRaw(run.rawStart + (wanted - run.decodedStart) * run.stride);
        },
      },
    };
  };
}

function parseOperations(diffXml: string, attributeProvenance = false, elementProvenance = false): {
  operations: DiffOperation[];
  findings: DiffFinding[];
  provenance?: AttributeProvenanceContext;
  elementSource?: ElementSourceContext;
} {
  const parsed = parseDocument(diffXml);
  if (!parsed.document) {
    return { operations: [], findings: [{ severity: 'error', code: 'DIFF_XML_INVALID', message: `Diff XML is invalid: ${parsed.error || 'parse failed'}.` }] };
  }
  const root = parsed.document.documentElement;
  if (root.nodeName.toLowerCase() !== 'diff') {
    return { operations: [], findings: [{ severity: 'error', code: 'DIFF_ROOT_INVALID', message: `Expected <diff> root, found <${root.nodeName}>.` }] };
  }
  const lines = operationLines(diffXml);
  const operations: DiffOperation[] = [];
  const findings: DiffFinding[] = [];
  const sourceOperations: XmlElement[] = [];
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i];
    if (!isElement(child)) continue;
    const type = child.nodeName.toLowerCase();
    const operationIndex = operations.length;
    if (type !== 'add' && type !== 'replace' && type !== 'remove') {
      findings.push({
        severity: 'error', code: 'DIFF_OPERATION_INVALID', operation: operationIndex, line: lines[operationIndex],
        message: `Illegal <${child.nodeName}> operation; diff.xsd permits add, replace, or remove.`,
      });
      continue;
    }
    const sel = child.getAttribute('sel') || '';
    if (!sel) {
      findings.push({
        severity: 'error', code: 'DIFF_OPERATION_INVALID', operation: operationIndex, line: lines[operationIndex],
        message: `<${type}> is missing required @sel (diff.xsd).`,
      });
    }
    const rawPos = child.getAttribute('pos') || '';
    const pos = rawPos ? rawPos as DiffPosition : undefined;
    if (pos && !['before', 'after', 'prepend'].includes(pos)) {
      findings.push({
        severity: 'error', code: 'DIFF_OPERATION_INVALID', operation: operationIndex, line: lines[operationIndex], selector: sel,
        message: `Illegal add position "${rawPos}"; diff.xsd permits before, after, or prepend.`,
      });
    }
    operations.push({
      type,
      sel,
      pos,
      attrType: child.getAttribute('type') || undefined,
      content: serializeChildren(child),
      ifCondition: child.getAttribute('if') || undefined,
      silent: /^(1|true)$/i.test(child.getAttribute('silent') || ''),
      line: lines[operationIndex],
    });
    if (attributeProvenance || elementProvenance) sourceOperations.push(child);
  }
  if (!attributeProvenance && !elementProvenance) return { operations, findings };
  const locator = createXmlNodePositionLocator(diffXml);
  const mapPayload = createPayloadMapper(diffXml, locator);
  const mapped = new Map<number, LiteralPayloadResult>();
  const context: AttributeProvenanceContext = {
      payload(operation) {
        let result = mapped.get(operation);
        if (!result) {
          const element = sourceOperations[operation];
          result = element ? mapPayload(element) : { reason: 'Original operation source is unavailable.' };
          mapped.set(operation, result);
        }
        return result;
      },
  };
  return { operations, findings,
    ...(attributeProvenance ? { provenance: context } : {}),
    ...(elementProvenance ? { elementSource: { source: diffXml, repaired: !!parsed.repaired,
      operations: sourceOperations, point: locator.point, payload: context.payload } } : {}),
  };
}

function truthyXpath(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') return value.length > 0;
  return Boolean(value);
}

function splitAbsolutePath(expression: string): string[] | null {
  if (!expression.startsWith('/') || expression.startsWith('//')) return null;
  const steps: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let quote = '';
  for (let index = 1; index < expression.length; index++) {
    const char = expression[index];
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === '[') bracketDepth++;
    else if (char === ']') bracketDepth--;
    if (char === '/' && bracketDepth === 0) { steps.push(current); current = ''; }
    else current += char;
  }
  if (current) steps.push(current);
  return bracketDepth === 0 && !quote && steps.every(Boolean) ? steps : null;
}

/** Fast, exact subset covering the corpus' common /root/item[@id='x']/@attr selectors. */
function selectSimpleAbsolute(expression: string, document: XmlDocument): XmlNode[] | null {
  const steps = splitAbsolutePath(expression);
  if (!steps?.length) return null;
  let nodes: XmlNode[] = [document.documentElement];
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    if (step.startsWith('@')) {
      if (stepIndex !== steps.length - 1 || !/^@[A-Za-z_][\w.:-]*$/.test(step)) return null;
      const attrs: XmlNode[] = [];
      for (const node of nodes) {
        if (!isElement(node)) continue;
        const attr = node.getAttributeNode(step.slice(1));
        if (attr) attrs.push(attr);
      }
      return attrs;
    }
    const match = /^([A-Za-z_][\w.:-]*|\*)(?:\[@([A-Za-z_][\w.:-]*)=(['"])([\s\S]*?)\3\])?(?:\[(\d+)\])?$/.exec(step);
    if (!match) return null;
    const [, tag, attrName, , attrValue, positionText] = match;
    if (stepIndex === 0) {
      const root = document.documentElement;
      if ((tag !== '*' && root.nodeName !== tag) || (attrName && root.getAttribute(attrName) !== attrValue)) return [];
      if (positionText && Number(positionText) !== 1) return [];
      nodes = [root];
      continue;
    }
    const next: XmlNode[] = [];
    for (const parent of nodes) {
      const local: XmlNode[] = [];
      for (let childIndex = 0; childIndex < parent.childNodes.length; childIndex++) {
        const child = parent.childNodes[childIndex];
        if (!isElement(child) || (tag !== '*' && child.nodeName !== tag)) continue;
        if (attrName && child.getAttribute(attrName) !== attrValue) continue;
        local.push(child);
      }
      if (positionText) {
        const selected = local[Number(positionText) - 1];
        if (selected) next.push(selected);
      } else next.push(...local);
    }
    nodes = next;
    if (nodes.length === 0) return nodes;
  }
  return nodes;
}

function normalizeXpathTokens(expression: string): string {
  let normalized = '';
  let quote = '';
  for (let index = 0; index < expression.length; index++) {
    const char = expression[index];
    if (quote) {
      normalized += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; normalized += char; continue; }
    if (expression.startsWith('or.', index) && (index === 0 || /\s|\]/.test(expression[index - 1]))) {
      normalized += 'or .'; index += 2; continue;
    }
    if (expression.startsWith('and.', index) && (index === 0 || /\s|\]/.test(expression[index - 1]))) {
      normalized += 'and .'; index += 3; continue;
    }
    normalized += char;
  }
  return normalized;
}

function select(expression: string, document: XmlDocument): unknown {
  const fast = selectSimpleAbsolute(expression, document);
  return fast === null ? xpath.select(normalizeXpathTokens(expression), document as unknown as Node) : fast;
}

function payloadNodes(document: XmlDocument, content: string): XmlNode[] {
  if (!content) return [];
  const wrapped = parseDocument(`<x4forge-fragment>${content}</x4forge-fragment>`);
  if (!wrapped.document) throw new Error(`invalid patch payload: ${wrapped.error || 'parse failed'}`);
  const nodes: XmlNode[] = [];
  const root = wrapped.document.documentElement;
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i];
    // Formatting-only whitespace belongs to the patch wrapper, not the target document.
    if (node.nodeType === 3 && !String(node.nodeValue || '').trim()) continue;
    nodes.push(document.importNode(node, true));
  }
  return nodes;
}

function directPayloadText(content: string): string {
  const wrapped = parseDocument(`<x4forge-fragment>${content}</x4forge-fragment>`);
  return wrapped.document?.documentElement.textContent || '';
}

function applyToNode(document: XmlDocument, target: XmlNode, operation: DiffOperation, onPayload?: (nodes: XmlNode[]) => void): void {
  const anyTarget = target as any;
  if (operation.type === 'remove') {
    if (target.nodeType === 2) {
      const owner = anyTarget.ownerElement as XmlElement | undefined;
      if (!owner) throw new Error('selected attribute has no owner element');
      owner.removeAttribute(anyTarget.name || target.nodeName);
      return;
    }
    if (!target.parentNode) throw new Error('cannot remove the document root');
    target.parentNode.removeChild(target);
    return;
  }

  if (operation.type === 'replace') {
    if (target.nodeType === 2) {
      anyTarget.value = directPayloadText(operation.content || '');
      anyTarget.nodeValue = anyTarget.value;
      return;
    }
    const nodes = payloadNodes(document, operation.content || '');
    onPayload?.(nodes);
    if (nodes.length === 0) throw new Error('replace operation has no payload');
    if (!target.parentNode) throw new Error('cannot replace the document root');
    const parent = target.parentNode;
    for (const node of nodes) parent.insertBefore(node, target);
    parent.removeChild(target);
    return;
  }

  if (!isElement(target)) throw new Error('add selector must resolve to an element');
  if (operation.attrType) {
    if (!operation.attrType.startsWith('@')) throw new Error(`unsupported add @type "${operation.attrType}"; expected @attribute`);
    target.setAttribute(operation.attrType.slice(1), directPayloadText(operation.content || ''));
    return;
  }
  const nodes = payloadNodes(document, operation.content || '');
  onPayload?.(nodes);
  if (operation.pos === 'before' || operation.pos === 'after') {
    if (!target.parentNode) throw new Error(`cannot insert ${operation.pos} the document root`);
    const parent = target.parentNode;
    const reference = operation.pos === 'before' ? target : target.nextSibling;
    for (const node of nodes) parent.insertBefore(node, reference);
  } else if (operation.pos === 'prepend') {
    const reference = target.firstChild;
    for (const node of nodes) target.insertBefore(node, reference);
  } else {
    for (const node of nodes) target.appendChild(node);
  }
}

function unavailableElementProvenance(reason: string): DiffElementProvenance {
  return { available: false, reason, initial: new Map(), elements: new Map(), attributes: new Map(), removed: new Map(), removedParents: new Map(), gaps: [reason] };
}

function createElementTrace(
  document: XmlDocument, baseXml: string, repaired: boolean, source: ElementSourceContext | undefined,
  options: Exclude<DiffSimulationOptions['elementProvenance'], undefined | false>,
) {
  const initial = new Map<XmlElement, DiffElementState>();
  const elements = new Map<XmlElement, DiffSourcePoint>();
  const attributes = new Map<XmlElement, Map<string, DiffSourcePoint>>();
  const removed = new Map<XmlElement, DiffSourcePoint>();
  const removedParents = new Map<XmlElement, XmlElement | null>();
  const gaps: string[] = [];
  const result: DiffElementProvenance = { available: true, initial, elements, attributes, removed, removedParents, gaps };
  const maxElements = typeof options === 'object' ? options.maxElements ?? 50_000 : 50_000;
  const maxSourceChars = typeof options === 'object' ? options.maxSourceChars ?? 8 * 1024 * 1024 : 8 * 1024 * 1024;
  let attributeFacts = 0;
  const gap = (reason: string) => { if (gaps.length < 100 && !gaps.includes(reason)) gaps.push(reason); };
  const disable = (reason: string) => {
    result.available = false; result.reason ||= reason; gap(reason);
    initial.clear(); elements.clear(); attributes.clear(); removed.clear(); removedParents.clear(); delete result.document;
  };
  const safe = (work: () => void) => {
    if (!result.available) return;
    try { work(); } catch { disable('Element context provenance failed internally; no authored ownership is claimed.'); }
  };
  const visit = (roots: XmlNode[], work: (element: XmlElement) => void) => {
    const pending = [...roots].reverse();
    while (pending.length && result.available) {
      const node = pending.pop()!;
      if (!isElement(node)) continue;
      work(node);
      for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push(node.childNodes[index]);
    }
  };
  const budget = () => {
    if (initial.size + elements.size >= maxElements || attributeFacts > maxElements * 8) {
      disable('Element context provenance tracking budget exceeded.'); return false;
    }
    return true;
  };
  const point = (operation: number, node?: XmlNode): DiffSourcePoint => {
    const location = node ? source?.point(node) : undefined;
    if (location) return { operation, ...location };
    const reason = `Operation ${operation + 1}: original XML node position unavailable.`;
    gap(reason); return { operation, reason };
  };
  const rememberAttribute = (owner: XmlElement, name: string, origin: DiffSourcePoint) => {
    let values = attributes.get(owner);
    if (!values) { values = new Map(); attributes.set(owner, values); }
    if (!values.has(name)) attributeFacts++;
    if (attributeFacts > maxElements * 8) { disable('Element context attribute provenance budget exceeded.'); return; }
    values.set(name, origin);
  };
  if (!Number.isSafeInteger(maxElements) || maxElements < 1 || !Number.isSafeInteger(maxSourceChars) || maxSourceChars < 1) {
    disable('Element context provenance budgets must be positive safe integers.');
  } else if (!source || repaired || source.repaired) {
    disable('Element context requires original XML without parser repairs.');
  } else if (baseXml.length + source.source.length > maxSourceChars) {
    disable('Element context source budget exceeded.');
  }
  safe(() => visit([document.documentElement], element => {
    if (!budget()) return;
    const values = Object.create(null) as Record<string, string>;
    for (const attribute of Array.from(element.attributes)) { values[attribute.name] = attribute.value; attributeFacts++; }
    if (attributeFacts > maxElements * 8) { disable('Element context attribute provenance budget exceeded.'); return; }
    initial.set(element, Object.freeze({ id: initial.size, elementName: element.nodeName, attributes: Object.freeze(values),
      parent: isElement(element.parentNode) ? element.parentNode : null }));
  }));
  return {
    result,
    payload(nodes: XmlNode[], operation: number) { safe(() => {
      const originals = Array.from(source!.operations[operation]?.childNodes ?? []).filter(isElement);
      const actual = nodes.filter(isElement);
      const pairs: Array<[XmlElement, XmlElement]> = [];
      const pending = actual.map((node, index) => [node, originals[index]] as const);
      let matched = actual.length === originals.length;
      while (pending.length && matched) {
        const [node, original] = pending.pop()!;
        if (!original || node.nodeName !== original.nodeName) { matched = false; break; }
        pairs.push([node, original]);
        if (initial.size + elements.size + pairs.length > maxElements) { disable('Element context provenance tracking budget exceeded.'); return; }
        const children = Array.from(node.childNodes).filter(isElement);
        const originalChildren = Array.from(original.childNodes).filter(isElement);
        if (children.length !== originalChildren.length) { matched = false; break; }
        for (let index = children.length - 1; index >= 0; index--) pending.push([children[index], originalChildren[index]]);
      }
      if (!matched) {
        const reason = `Operation ${operation + 1}: imported payload could not be paired with original XML elements.`;
        gap(reason);
        visit(nodes, element => { if (budget()) elements.set(element, { operation, reason }); });
        return;
      }
      for (const [node, original] of pairs) {
        if (!budget()) return;
        elements.set(node, point(operation, original));
        for (const attribute of Array.from(node.attributes)) {
          const authored = original.getAttributeNode(attribute.name);
          const origin = authored && authored.value === attribute.value ? point(operation, authored)
            : { operation, reason: `Operation ${operation + 1}: original attribute correspondence unavailable.` };
          if (origin.reason) gap(origin.reason);
          rememberAttribute(node, attribute.name, origin);
          if (!result.available) return;
        }
      }
    }); },
    attribute(owner: XmlElement, name: string, operation: number, removedAttribute: boolean) { safe(() => {
      let origin: DiffSourcePoint;
      if (removedAttribute) origin = point(operation, source!.operations[operation]);
      else {
        const payload = source!.payload(operation);
        // Empty text has no value character to locate. The exact destructive
        // assignment operation is still a known authored cause.
        if (!('reason' in payload) && payload.value === '' && owner.getAttribute(name) === '') {
          rememberAttribute(owner, name, point(operation, source!.operations[operation])); return;
        }
        const location = 'reason' in payload || payload.value !== owner.getAttribute(name) ? undefined : payload.payload.locate(0);
        origin = location ? { operation, ...location } : { operation,
          reason: `Operation ${operation + 1}: assigned attribute source position unavailable.` };
        if (origin.reason) gap(origin.reason);
      }
      rememberAttribute(owner, name, origin);
    }); },
    deleted(node: XmlElement, operation: number, parentBefore: XmlElement | null) { safe(() => {
      // XPath snapshots may include both an ancestor and its descendants. An
      // identity destroyed with that ancestor never becomes attached again.
      if (removed.has(node)) return;
      const origin = point(operation, source!.operations[operation]);
      visit([node], element => {
        removed.set(element, origin);
        removedParents.set(element, element === node ? parentBefore : element.parentElement);
      });
    }); },
    finish(ok: boolean) {
      if (!ok) disable('Patch simulation failed; effective element context is unavailable.');
      if (result.available) result.document = document;
      return result;
    },
  };
}

/** Apply already parsed operations. Used by the patch synthesizer's round-trip oracle too. */
export function applyDiffOperations(baseXml: string, operations: DiffOperation[]): DiffSimulationResult {
  return applyParsedDiffOperations(baseXml, operations);
}

function applyParsedDiffOperations(
  baseXml: string,
  operations: DiffOperation[],
  provenance?: AttributeProvenanceContext,
  elementSource?: ElementSourceContext,
  elementOptions?: DiffSimulationOptions['elementProvenance'],
): DiffSimulationResult {
  const parsed = parseDocument(baseXml);
  if (!parsed.document) {
    return {
      ok: false, content: baseXml, operations: [],
      findings: [{ severity: 'error', code: 'DIFF_XML_INVALID', message: `Base XML is invalid: ${parsed.error || 'parse failed'}.` }],
      ...(provenance ? { attributeAssignments: [], attributeAttributionGaps: [] } : {}),
      ...(elementOptions ? { elementProvenance: unavailableElementProvenance('Base XML could not be parsed for element context.') } : {}),
    };
  }
  const elementTrace = elementOptions ? createElementTrace(parsed.document, baseXml, !!parsed.repaired, elementSource, elementOptions) : undefined;
  const document = parsed.document;
  const findings: DiffFinding[] = [];
  const outcomes: DiffSimulationResult['operations'] = [];
  const attributeWrites = provenance ? new Map<XmlAttr, number>() : undefined;

  operations.forEach((operation, index) => {
    if (operation.ifCondition) {
      try {
        if (!truthyXpath(select(operation.ifCondition, document))) {
          outcomes.push({ ...operation, index, matches: 0, applied: false });
          findings.push({
            severity: 'info', code: 'DIFF_CONDITION_FALSE', operation: index, line: operation.line,
            selector: operation.sel, matches: 0, message: `Operation ${index + 1} skipped because @if evaluated false.`,
          });
          return;
        }
      } catch (error) {
        findings.push({
          severity: 'error', code: 'DIFF_CONDITION_INVALID', operation: index, line: operation.line,
          selector: operation.sel, message: `Invalid @if XPath "${operation.ifCondition}": ${error instanceof Error ? error.message : String(error)}.`,
        });
        outcomes.push({ ...operation, index, matches: 0, applied: false });
        return;
      }
    }

    let selected: unknown;
    try {
      selected = select(operation.sel, document);
    } catch (error) {
      findings.push({
        severity: 'error', code: 'DIFF_SELECTOR_INVALID', operation: index, line: operation.line,
        selector: operation.sel, message: `Invalid XPath selector "${operation.sel}": ${error instanceof Error ? error.message : String(error)}.`,
      });
      outcomes.push({ ...operation, index, matches: 0, applied: false });
      return;
    }
    const matches = Array.isArray(selected) ? selected as XmlNode[] : [];
    if (matches.length === 0) {
      if (!operation.silent) findings.push({
        severity: 'warning', code: 'DIFF_SELECTOR_ZERO', operation: index, line: operation.line,
        selector: operation.sel, matches: 0, message: `Selector matched no nodes: ${operation.sel}.`,
      });
      outcomes.push({ ...operation, index, matches: 0, applied: false });
      return;
    }
    if (matches.length > 1) findings.push({
      severity: 'warning', code: 'DIFF_SELECTOR_MULTI', operation: index, line: operation.line,
      selector: operation.sel, matches: matches.length,
      message: `Selector matched ${matches.length} nodes; X4 will apply this operation to every match. Narrow it if that was not intentional.`,
    });

    let applied = 0;
    // Removal/replacement mutates the tree. Snapshot selection is intentional and mirrors
    // an XML patch processor applying the operation to the selector's original result set.
    for (const target of matches) {
      try {
        const attributeOwner = target.nodeType === 2 ? (target as XmlAttr).ownerElement
          : operation.type === 'add' && operation.attrType && isElement(target) ? target : null;
        const attributeName = target.nodeType === 2 ? target.nodeName : operation.attrType?.slice(1);
        const parentBefore = elementTrace && isElement(target) ? target.parentElement : null;
        applyToNode(document, target, operation, elementTrace ? nodes => elementTrace.payload(nodes, index) : undefined);
        if (attributeOwner && attributeName) elementTrace?.attribute(attributeOwner, attributeName, index, operation.type === 'remove');
        if (isElement(target) && (operation.type === 'remove' || operation.type === 'replace')) elementTrace?.deleted(target, index, parentBefore);
        if (attributeWrites) {
          if (operation.type === 'replace' && target.nodeType === 2) {
            attributeWrites.set(target as XmlAttr, index);
          } else if (operation.type === 'add' && operation.attrType && isElement(target)) {
            const attribute = target.getAttributeNode(operation.attrType.slice(1));
            if (attribute) attributeWrites.set(attribute, index);
          }
        }
        applied++;
      } catch (error) {
        findings.push({
          severity: 'error', code: 'DIFF_APPLY_FAILED', operation: index, line: operation.line,
          selector: operation.sel, matches: matches.length,
          message: `Could not apply ${operation.type} to "${operation.sel}": ${error instanceof Error ? error.message : String(error)}.`,
        });
        break;
      }
    }
    outcomes.push({ ...operation, index, matches: matches.length, applied: applied === matches.length });
  });

  const ok = !findings.some(finding => finding.severity === 'error');
  const result: DiffSimulationResult = {
    ok,
    content: serializer.serializeToString(document),
    operations: outcomes,
    findings,
  };
  if (elementTrace) result.elementProvenance = elementTrace.finish(ok);
  if (provenance && attributeWrites) {
    result.attributeAssignments = [];
    result.attributeAttributionGaps = [];
    if (ok) {
      const seenGaps = new Set<string>();
      for (const [attribute, operation] of attributeWrites) {
        const owner = attribute.ownerElement;
        if (!owner || owner.ownerDocument !== document || owner.getAttributeNode(attribute.name) !== attribute) continue;
        let ancestor: XmlNode | null = owner;
        while (ancestor && ancestor !== document) ancestor = ancestor.parentNode;
        if (ancestor !== document) continue;
        const role = { operation, elementName: owner.nodeName, attributeName: attribute.name };
        const mapped = provenance.payload(operation);
        const reason = 'reason' in mapped ? mapped.reason
          : mapped.value !== attribute.value ? 'Original operation text does not match its final assigned value.' : undefined;
        if (reason) {
          const key = JSON.stringify([operation, role.elementName, role.attributeName, reason]);
          if (!seenGaps.has(key)) {
            seenGaps.add(key);
            result.attributeAttributionGaps.push({ ...role, reason });
          }
        } else if (!('reason' in mapped)) {
          result.attributeAssignments.push({ ...role, value: attribute.value, payload: mapped.payload });
        }
      }
    }
  }
  return result;
}

export function simulateXmlDiff(baseXml: string, diffXml: string, options: DiffSimulationOptions = {}): DiffSimulationResult {
  const parsed = parseOperations(diffXml, options.attributeProvenance, !!options.elementProvenance);
  if (parsed.findings.some(finding => finding.severity === 'error')) {
    return {
      ok: false, content: baseXml, operations: [], findings: parsed.findings,
      ...(options.attributeProvenance ? { attributeAssignments: [], attributeAttributionGaps: [] } : {}),
      ...(options.elementProvenance ? { elementProvenance: unavailableElementProvenance('Patch XML operations could not be parsed for element context.') } : {}),
    };
  }
  const applied = applyParsedDiffOperations(baseXml, parsed.operations, parsed.provenance, parsed.elementSource, options.elementProvenance);
  return { ...applied, findings: [...parsed.findings, ...applied.findings] };
}

export interface DiffSimulatorCheck { name: string; pass: boolean; detail?: string }

export function runDiffSimulatorSelftest(): { pass: boolean; allPassed: boolean; passed: number; total: number; checks: DiffSimulatorCheck[] } {
  const checks: DiffSimulatorCheck[] = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });
  const base = '<root enabled="old"><item id="a"/><item id="b"/><tail/></root>';
  const patch = `<diff>
    <add sel="/root/item[@id='a']" pos="after"><item id="after"/></add>
    <add sel="/root" pos="prepend"><item id="first"/></add>
    <add sel="/root" type="@new">yes</add>
    <replace sel="/root/@enabled">new</replace>
    <remove sel="/root/item[@id='b']"/>
  </diff>`;
  const result = simulateXmlDiff(base, patch);
  check('add/replace/remove/after/prepend/attribute', result.ok
    && /enabled="new"/.test(result.content) && /new="yes"/.test(result.content)
    && result.content.indexOf('id="first"') < result.content.indexOf('id="a"')
    && result.content.indexOf('id="after"') > result.content.indexOf('id="a"')
    && !/id="b"/.test(result.content), result.findings.map(f => f.message).join('; '));

  const zero = simulateXmlDiff(base, '<diff><remove sel="/root/missing"/></diff>');
  check('zero selector warning', zero.ok && zero.findings.some(f => f.code === 'DIFF_SELECTOR_ZERO'));
  const multi = simulateXmlDiff(base, '<diff><add sel="/root/item" type="@seen">1</add></diff>');
  check('multi selector warning and apply all', multi.ok && multi.findings.some(f => f.code === 'DIFF_SELECTOR_MULTI')
    && (multi.content.match(/seen="1"/g) || []).length === 2);
  const bad = simulateXmlDiff(base, '<diff><remove sel="//*["/></diff>');
  check('malformed selector error', !bad.ok && bad.findings.some(f => f.code === 'DIFF_SELECTOR_INVALID'));
  const conditional = simulateXmlDiff(base, '<diff><remove sel="/root/tail" if="false()"/></diff>');
  check('false condition skips operation', conditional.ok && /<tail\/>/.test(conditional.content)
    && conditional.findings.some(f => f.code === 'DIFF_CONDITION_FALSE'));
  const multiReplace = simulateXmlDiff('<root><!-- marker --><item id="a"/></root>',
    `<diff><replace sel="//comment()[. = ' marker ']"><first/><second/></replace></diff>`);
  check('replace target with ordered sibling sequence', multiReplace.ok && /<first\/><second\/><item/.test(multiReplace.content), multiReplace.content);
  const compactOr = simulateXmlDiff('<root><item id="a"/></root>',
    `<diff><replace sel="/root/item/@id[.='x' or.='a']">b</replace></diff>`);
  check('X4 compact or-dot XPath token', compactOr.ok && /id="b"/.test(compactOr.content), compactOr.findings.map(f => f.message).join('; '));

  check('default simulation keeps provenance fields absent', !Object.hasOwn(result, 'attributeAssignments')
    && !Object.hasOwn(result, 'attributeAttributionGaps'));
  const attributed = (baseText: string, patchText: string) => simulateXmlDiff(baseText, patchText, { attributeProvenance: true });
  const replacement = attributed('<root exact="old"/>', '<diff><replace sel="/root/@exact">$v else 0</replace></diff>');
  const assignment = replacement.attributeAssignments?.[0];
  check('literal replace preserves actual role value and original position', replacement.ok
    && replacement.attributeAssignments?.length === 1 && replacement.attributeAttributionGaps?.length === 0
    && assignment?.operation === 0 && assignment.elementName === 'root' && assignment.attributeName === 'exact'
    && assignment.value === '$v else 0' && assignment.payload.locate(3)?.line === 1
    && assignment.payload.locate(3)?.column === 38);
  const addition = attributed('<root/>', '<diff><add sel="/root" type="@exact">else</add></diff>');
  check('attribute addition receives actual resulting Attr provenance', addition.ok
    && addition.attributeAssignments?.[0]?.attributeName === 'exact' && addition.attributeAssignments[0].value === 'else');
  const overwrite = attributed('<root exact="old"/>', '<diff><replace sel="/root/@exact">bad</replace><add sel="/root" type="@exact">good</add></diff>');
  check('later attribute assignment replaces earlier provenance', overwrite.ok && overwrite.attributeAssignments?.length === 1
    && overwrite.attributeAssignments[0].operation === 1 && overwrite.attributeAssignments[0].value === 'good');
  const removedAttribute = attributed('<root exact="old"/>', '<diff><replace sel="/root/@exact">bad</replace><remove sel="/root/@exact"/></diff>');
  check('removed Attr does not survive provenance', removedAttribute.ok && removedAttribute.attributeAssignments?.length === 0
    && removedAttribute.attributeAttributionGaps?.length === 0);
  const detached = attributed('<root><item exact="old"/></root>', '<diff><replace sel="/root/item/@exact">bad</replace><remove sel="/root/item"/></diff>');
  check('detached owner does not survive provenance', detached.ok && detached.attributeAssignments?.length === 0);
  const replacedOwner = attributed('<root><item exact="old"/></root>', '<diff><replace sel="/root/item/@exact">bad</replace><replace sel="/root/item"><item exact="new"/></replace></diff>');
  check('replacement subtree does not inherit detached Attr provenance', replacedOwner.ok && replacedOwner.attributeAssignments?.length === 0);
  const falseWrite = attributed('<root exact="old"/>', '<diff><replace sel="/root/@exact" if="false()">bad</replace></diff>');
  check('false condition produces no assignment or mapping gap', falseWrite.ok && falseWrite.attributeAssignments?.length === 0
    && falseWrite.attributeAttributionGaps?.length === 0);
  const unmatchedWrite = attributed('<root/>', '<diff><replace sel="/root/@missing">bad</replace></diff>');
  check('zero selector preserves warning without fabricating assignment', unmatchedWrite.ok && unmatchedWrite.attributeAssignments?.length === 0
    && unmatchedWrite.findings.some(finding => finding.code === 'DIFF_SELECTOR_ZERO'));
  const failedAfterWrite = attributed('<root exact="old"/>', '<diff><replace sel="/root/@exact">bad</replace><add sel="/root/@exact" type="@other">fail</add></diff>');
  check('unsuccessful simulation discards all prior attribution', !failedAfterWrite.ok
    && failedAfterWrite.attributeAssignments?.length === 0 && failedAfterWrite.attributeAttributionGaps?.length === 0);
  const invalidAttributed = attributed('<root/>', '<diff><replace sel="//*[">bad</replace></diff>');
  const invalidPatch = attributed('<root/>', '<diff><replace></diff>');
  const invalidBase = attributed('<root>', '<diff/>');
  check('invalid selector patch and base expose empty opt-in attribution', [invalidAttributed, invalidPatch, invalidBase].every(value => !value.ok
    && value.attributeAssignments?.length === 0 && value.attributeAttributionGaps?.length === 0));
  const multiAttributes = attributed('<root><item exact="a"/><item exact="b"/></root>', '<diff><replace sel="/root/item/@exact">bad</replace></diff>');
  check('equivalent multimatch shares one original payload mapper', multiAttributes.ok && multiAttributes.attributeAssignments?.length === 2
    && multiAttributes.attributeAssignments[0].payload === multiAttributes.attributeAssignments[1].payload
    && multiAttributes.attributeAssignments.every(value => value.operation === 0 && value.value === 'bad'));
  const differentRoles = attributed('<root><set_value exact="a"/><do_if value="b"/></root>', '<diff><replace sel="/root/set_value/@exact | /root/do_if/@value">bad</replace></diff>');
  check('one operation retains distinct actual target roles', differentRoles.ok && differentRoles.attributeAssignments?.length === 2
    && differentRoles.attributeAssignments.map(value => `${value.elementName}/@${value.attributeName}`).join('|') === 'set_value/@exact|do_if/@value');

  const lexicalPatch = '<diff>\r\n<!-- <replace sel="/fake">decoy</replace> -->\r\n<replace sel="/root/@exact">α &#x1F680; &amp; &#101;lse<![CDATA[ $x else &amp; 0]]><?skip else?><!--else--></replace>\r\n</diff>';
  const lexical = attributed('<root exact="old"/>', lexicalPatch);
  const lexicalAssignment = lexical.attributeAssignments?.[0];
  const entityAt = lexicalPatch.indexOf('&#101;');
  const cdataAt = lexicalPatch.indexOf('else &amp;');
  check('entities astral text CDATA comments and PI preserve authored positions', lexical.ok
    && lexicalAssignment?.value === 'α 🚀 & else $x else &amp; 0'
    && lexical.attributeAttributionGaps?.length === 0
    && lexicalAssignment.payload.locate(lexicalAssignment.value.indexOf('else'))?.line === 3
    && lexicalAssignment.payload.locate(lexicalAssignment.value.indexOf('else'))?.column === entityAt - lexicalPatch.lastIndexOf('\n', entityAt)
    && lexicalAssignment.payload.locate(lexicalAssignment.value.lastIndexOf('else'))?.column === cdataAt - lexicalPatch.lastIndexOf('\n', cdataAt));
  const nestedTextPatch = '<diff><replace sel="/root/@exact">before<x>else</x><!--skip--> after</replace></diff>';
  const nestedText = attributed('<root exact="old"/>', nestedTextPatch).attributeAssignments?.[0];
  check('nested operation descendant text mirrors actual assigned value', nestedText?.value === 'beforeelse after'
    && nestedText.payload.locate(6)?.column === nestedTextPatch.indexOf('else') + 1);
  const normalizedPatch = '\uFEFF<diff>\r\u0085<replace sel="/root/@exact"><![CDATA[🛰️]]>&#13;&#10;&#x85;else\r\n tail</replace>\u2028</diff>';
  const normalized = attributed('<root exact="old"/>', normalizedPatch);
  const normalizedAssignment = normalized.attributeAssignments?.[0];
  const normalizedElse = normalizedPatch.indexOf('else');
  check('BOM XML line endings and second entity normalization map exactly', normalized.ok
    && normalized.attributeAttributionGaps?.length === 0 && normalizedAssignment?.value === '🛰️\n\nelse\n tail'
    && normalizedAssignment.payload.locate(3)?.line === 2
    && normalizedAssignment.payload.locate(3)?.column === normalizedPatch.indexOf('&#13;') - normalizedPatch.indexOf('\r')
    && normalizedAssignment.payload.locate(5)?.line === 2
    && normalizedAssignment.payload.locate(5)?.column === normalizedElse - normalizedPatch.indexOf('\r'));
  check('payload mapping rejects invalid offsets without guessed coordinates', assignment?.payload.locate(-1) === undefined
    && assignment?.payload.locate(1000) === undefined && assignment?.payload.locate(0.5) === undefined);
  const passed = checks.filter(entry => entry.pass).length;
  return { pass: passed === checks.length, allPassed: passed === checks.length, passed, total: checks.length, checks };
}
