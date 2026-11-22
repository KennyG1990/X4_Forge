import { Buffer } from 'node:buffer';
import { DOMParser, type Attr, type Element, type Node as XmlNode } from '@xmldom/xmldom';
import {
  buildAuthoredAiScriptIndex, isAuthoredAiScriptName, isAuthoredAiScriptParameterName,
  readAiScriptInputParameters, readAiScriptSignature, readLiteralAiScriptName, resolveAuthoredAiScript,
} from './aiScriptIdentity';
import { MAX_PROJECT_XML_DEPTH, maskXmlOpaqueMarkup, scanXmlTagTokens } from './xmlMarkup';
import { createXmlNodePositionLocator } from './xmlSourcePosition';

interface Position { line: number; column: number; }
interface NameRange { start: Position; end: Position; }
export interface AiScriptLocation extends NameRange { file: string; }
interface AiInterruptLibrary extends NameRange {
  name: string;
  kind: 'handler' | 'conditions' | 'actions';
}

export interface AiScriptNavigationDocument {
  path: string;
  name?: string;
  declaration?: NameRange;
  interruptLibraries?: AiInterruptLibrary[];
  selectedDeclaration?: true;
  callee?: string;
  references?: NameRange[];
  call?: {
    callee: string;
    arguments: readonly { name: string; point: number }[];
    activeArgument?: string;
  };
  signature?: readonly {
    name: string;
    hasDefault: boolean;
    defaultValue?: string;
    comment?: string;
    location: AiScriptLocation;
  }[];
}

interface AiScriptCallDocumentOptions {
  callStart?: number;
  parameterStart?: number;
  includeSignature?: boolean;
  editingParameterName?: boolean;
}

interface AiScriptReadCoverage {
  readable?: true;
  scanLimited?: true;
}

const scriptName = (document: AiScriptNavigationDocument) => document.name;

/** Preserve the source span even when the author uses an XML entity for a quote or name character. */
function attributeSpan(
  text: string, attribute: Attr, locator: ReturnType<typeof createXmlNodePositionLocator>,
  first: number, last: number, cursor?: number,
): { start: number; end: number } | undefined {
  const opening = locator.offset(attribute);
  if (opening === undefined || attribute.value.length > 1_024) return undefined;
  if (cursor !== undefined && (cursor <= opening || cursor - opening > 8_192)) return undefined;
  if (!locator.point(attribute)) return undefined;
  const closing = text.indexOf(text[opening], opening + 1);
  if (closing < 0 || closing - opening > 8_192 || (cursor !== undefined && cursor >= closing)) return undefined;
  const value = text.slice(opening + 1, closing);
  let decoded = '';
  let start: number | undefined;
  let end: number | undefined;
  for (const match of value.matchAll(/&(?:apos|quot|amp|lt|gt|#\d+|#x[\da-fA-F]+);|\r\n|[\s\S]/g)) {
    const raw = match[0];
    const offset = opening + 1 + match.index;
    if (decoded.length === first) start = offset;
    if (raw.startsWith('&#')) {
      const number = raw.startsWith('&#x') ? Number.parseInt(raw.slice(3, -1), 16) : Number.parseInt(raw.slice(2, -1), 10);
      if (number > 0x10ffff) return undefined;
      decoded += String.fromCodePoint(number);
    } else if (raw === '&apos;') {
      decoded += "'";
    } else if (raw === '&quot;') {
      decoded += '"';
    } else if (raw === '&amp;') {
      decoded += '&';
    } else if (raw === '&lt;') {
      decoded += '<';
    } else if (raw === '&gt;') {
      decoded += '>';
    } else {
      decoded += /[\t\r\n]/.test(raw) ? ' ' : raw;
    }
    if (decoded.length === last) end = offset + raw.length;
  }
  if (decoded !== attribute.value || start === undefined || end === undefined) return undefined;
  return { start, end };
}

function* directElements(parent: Element, tag?: string): Iterable<Element> {
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && !(node as Element).namespaceURI && (tag === undefined || node.nodeName === tag)) {
      yield node as Element;
    }
  }
}

function readInterruptLibraries(
  root: Element, text: string, locator: ReturnType<typeof createXmlNodePositionLocator>,
  zeroBased: (offset: number) => Position,
): AiInterruptLibrary[] {
  const results: AiInterruptLibrary[] = [];
  for (const interrupts of directElements(root, 'interrupts')) {
    for (const library of directElements(interrupts, 'library')) {
      for (const entry of directElements(library)) {
        const kind = entry.tagName;
        if (kind !== 'handler' && kind !== 'conditions' && kind !== 'actions') continue;
        const attribute = entry.getAttributeNode('name');
        if (!attribute?.value || attribute.value.includes("'")) continue;
        const span = attributeSpan(text, attribute, locator, 0, attribute.value.length);
        if (span) results.push({ kind, name: attribute.value, start: zeroBased(span.start), end: zeroBased(span.end) });
      }
    }
  }
  return results;
}

/** Read name claims and a caret-selected literal from the authored XML, without opening paths. */
function readAiScriptNavigationDocumentCore(
  path: string, text: string, cursor?: number, referenceQuery?: { name: string; limit: number },
  coverage?: AiScriptReadCoverage, includeInterruptLibraries = false,
  callOptions?: AiScriptCallDocumentOptions,
): AiScriptNavigationDocument {
  const document: AiScriptNavigationDocument = { path };
  if (text.length > 8 * 1024 * 1024) return document;
  let malformed = false;
  let xml;
  try {
    xml = new DOMParser({ onError: () => { malformed = true; } })
      .parseFromString(text.replace(/^\uFEFF/, ''), 'text/xml');
  } catch {
    return document;
  }
  const root = xml.documentElement;
  if (malformed || xml.doctype || !root) return document;
  if (coverage) coverage.readable = true;
  if (root.tagName !== 'aiscript' || root.namespaceURI) {
    if (referenceQuery) document.references = [];
    return document;
  }
  const name = root.getAttributeNode('name');
  if (!name || !isAuthoredAiScriptName(name.value)) return document;
  document.name = name.value;
  const locator = createXmlNodePositionLocator(text);
  const zeroBased = (offset: number): Position => {
    const { line, column } = locator.locateRaw(offset);
    return { line: line - 1, column: column - 1 };
  };
  const declaration = attributeSpan(text, name, locator, 0, name.value.length);
  if (declaration) {
    document.declaration = { start: zeroBased(declaration.start), end: zeroBased(declaration.end) };
    if (cursor !== undefined && cursor >= declaration.start && cursor < declaration.end) {
      document.selectedDeclaration = true;
    }
  }
  if (includeInterruptLibraries) document.interruptLibraries = readInterruptLibraries(root, text, locator, zeroBased);
  if (callOptions?.includeSignature) {
    const parameters = readAiScriptSignature(root);
    if (parameters) {
      const signature: NonNullable<AiScriptNavigationDocument['signature']>[number][] = [];
      for (const parameter of parameters) {
        const span = attributeSpan(text, parameter.attribute, locator, 0, parameter.name.length);
        if (!span) break;
        signature.push({
          name: parameter.name, hasDefault: parameter.hasDefault,
          ...(parameter.hasDefault ? { defaultValue: parameter.defaultValue } : {}),
          ...(parameter.comment !== undefined ? { comment: parameter.comment } : {}),
          location: { file: path, start: zeroBased(span.start), end: zeroBased(span.end) },
        });
      }
      if (signature.length === parameters.length) document.signature = signature;
    }
  }
  if (cursor === undefined && !referenceQuery && callOptions?.callStart === undefined) return document;
  const references: NameRange[] = [];
  const pending: Array<{ node: XmlNode; depth: number; inActions: boolean }> = [];
  if (root.firstChild) pending.push({ node: root.firstChild, depth: 1, inActions: false });
  for (let visited = 0; pending.length && visited < 50_000; visited++) {
    const { node, depth, inActions } = pending.pop()!;
    if (depth > MAX_PROJECT_XML_DEPTH) {
      if (coverage) coverage.scanLimited = true;
      return document;
    }
    if (node.nextSibling) pending.push({ node: node.nextSibling, depth, inActions });
    if (node.nodeType !== 1 || (node as Element).namespaceURI) continue;
    if (node.firstChild) pending.push({
      node: node.firstChild, depth: depth + 1, inActions: inActions || node.nodeName === 'actions',
    });
    if (!inActions || node.nodeName !== 'run_script') continue;
    const call = node as Element;
    const attribute = call.getAttributeNode('name');
    const callee = attribute && readLiteralAiScriptName(attribute.value);
    if (!attribute || !callee) continue;
    if (callOptions?.callStart !== undefined && callOptions.callStart === locator.offset(call)) {
      if (!locator.point(call)) return document;
      const selected = callOptions.parameterStart === undefined ? undefined
        : Array.from(call.children).find(parameter => locator.offset(parameter) === callOptions.parameterStart);
      if (callOptions.parameterStart !== undefined && (!selected || selected.nodeName !== 'param'
        || selected.namespaceURI || !locator.point(selected))) return document;
      const activeName = selected?.getAttributeNode('name');
      if (selected && (!activeName || (activeName.value !== '' && !isAuthoredAiScriptParameterName(activeName.value)))) return document;
      const supplied = readAiScriptInputParameters(call, true, selected);
      if (!supplied || (!callOptions.editingParameterName && activeName?.value
        && supplied.some(parameter => parameter.name.toLowerCase() === activeName.value.toLowerCase()))) return document;
      const arguments_: { name: string; point: number }[] = [];
      for (const parameter of supplied) {
        const span = attributeSpan(text, parameter.attribute, locator, 0, parameter.name.length);
        if (!span) return document;
        arguments_.push({ name: parameter.name, point: span.start });
      }
      document.call = { callee, arguments: arguments_, ...(activeName ? { activeArgument: activeName.value } : {}) };
      return document;
    }
    const collect = referenceQuery?.name === callee;
    if (!collect && cursor === undefined) continue;
    const first = attribute.value.length - attribute.value.trimStart().length + 1;
    const span = attributeSpan(text, attribute, locator, first, first + callee.length, collect ? undefined : cursor);
    if (referenceQuery && collect) {
      if (!span) return document;
      if (references.length >= referenceQuery.limit) {
        if (coverage) coverage.scanLimited = true;
        return document;
      }
      references.push({ start: zeroBased(span.start), end: zeroBased(span.end) });
    }
    if (span && cursor !== undefined && cursor >= span.start && cursor < span.end) {
      document.callee = callee;
      if (!referenceQuery) break;
    }
  }
  if (coverage && pending.length > 0 && (!document.callee || referenceQuery)) coverage.scanLimited = true;
  if (referenceQuery && pending.length === 0) document.references = references;
  return document;
}

/** Read editor call/signature facts from complete authored XML without resolving or opening a path. */
export function readAiScriptCallDocument(
  path: string, text: string, options: AiScriptCallDocumentOptions,
): AiScriptNavigationDocument {
  if (text.length > 8 * 1024 * 1024 || snapshotMarkupIssue(text)) return { path };
  const validOffsets = [options.callStart, options.parameterStart].every(offset =>
    offset === undefined || (Number.isSafeInteger(offset) && offset >= 0 && offset < text.length));
  return readAiScriptNavigationDocumentCore(path, text, undefined, undefined, undefined, false,
    validOffsets ? options : { includeSignature: options.includeSignature });
}

/** Native callers keep the original document shape and behavior. */
export function readAiScriptNavigationDocument(
  path: string, text: string, cursor?: number, referenceQuery?: { name: string; limit: number },
): AiScriptNavigationDocument {
  return readAiScriptNavigationDocumentCore(path, text, cursor, referenceQuery);
}

export function readAiScriptWorkspaceDocument(path: string, text: string): AiScriptNavigationDocument {
  return readAiScriptNavigationDocumentCore(path, text, undefined, undefined, undefined, true);
}

function readAiScriptSnapshotDocument(
  path: string, text: string, cursor?: number, referenceQuery?: { name: string; limit: number },
): AiScriptNavigationDocument & AiScriptReadCoverage {
  const coverage: AiScriptReadCoverage = {};
  return Object.assign(readAiScriptNavigationDocumentCore(path, text, cursor, referenceQuery, coverage), coverage);
}

function resolveNavigationTarget(
  caller: AiScriptNavigationDocument, files: readonly AiScriptNavigationDocument[], name: string | undefined,
): AiScriptLocation | undefined {
  if (!caller.name || !name) return undefined;
  const index = buildAuthoredAiScriptIndex(files, scriptName);
  if (resolveAuthoredAiScript(index, caller.name, scriptName) !== caller) return undefined;
  const target = resolveAuthoredAiScript(index, name, scriptName);
  return target?.declaration && { file: target.path, ...target.declaration };
}

export function resolveAiScriptDefinition(
  caller: AiScriptNavigationDocument, files: readonly AiScriptNavigationDocument[],
): AiScriptLocation | undefined {
  return resolveNavigationTarget(caller, files, caller.callee);
}

export function resolveAiScriptReferences(
  caller: AiScriptNavigationDocument, files: readonly AiScriptNavigationDocument[], includeDeclaration: boolean,
): AiScriptLocation[] | undefined {
  const target = resolveNavigationTarget(caller, files, caller.selectedDeclaration ? caller.name : caller.callee);
  if (!target) return undefined;
  const results = includeDeclaration ? [target] : [];
  for (const file of files) {
    if (!file.references) return undefined;
    for (const range of file.references) results.push({ file: file.path, ...range });
  }
  return results.sort((a, b) => a.file === b.file
    ? a.start.line - b.start.line || a.start.column - b.start.column
    : (a.file < b.file ? -1 : 1));
}

export const AI_SCRIPT_NAVIGATION_LIMITS = Object.freeze({
  files: 512,
  fileBytes: 8 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  references: 2_048,
  markupTokensPerFile: 100_000,
});

type AiScriptSnapshotResult =
  | { status: 'resolved'; locations: AiScriptLocation[] }
  | { status: 'not-found' | 'not-a-literal' | 'ambiguous' }
  | { status: 'unavailable'; reason: 'focus' | 'inventory' | 'source' | 'limit' };

function snapshotMarkupIssue(text: string): 'source' | 'limit' | undefined {
  // Match the current authored MD preflight: mask inert markup only to detect a real DOCTYPE.
  if (/<!DOCTYPE\b/.test(text) && /<!DOCTYPE\b/.test(maskXmlOpaqueMarkup(text))) return 'source';
  let count = 0;
  let depth = 0;
  for (const { token, complete } of scanXmlTagTokens(text)) {
    if (++count > AI_SCRIPT_NAVIGATION_LIMITS.markupTokensPerFile) return 'limit';
    if (!complete) return 'source';
    if (token.startsWith('</')) depth--;
    else if (!token.endsWith('/>') && ++depth > MAX_PROJECT_XML_DEPTH + 1) return 'limit';
  }
}

function hasInvalidSnapshotPathCharacters(value: string): boolean {
  return /[:<>"|?*]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32);
}

/** Interpret one caller-supplied snapshot. Paths are identifiers, never filesystem inputs. */
export function navigateAuthoredAiScriptSnapshot(input: {
  files: readonly { path: string; content?: string }[];
  path: string;
  offset: number;
  mode: 'definition' | 'references';
  includeDeclaration?: boolean;
}): AiScriptSnapshotResult {
  const directAiPath = /^aiscripts\/[^/\\]+\.xml$/i;
  if (!directAiPath.test(input.path) || hasInvalidSnapshotPathCharacters(input.path)
    || !Number.isSafeInteger(input.offset) || input.offset < 0) {
    return { status: 'unavailable', reason: 'focus' };
  }
  const files = new Map<string, { path: string; content: string }>();
  let totalBytes = 0;
  for (const file of input.files) {
    const path = file.path.replace(/\\/g, '/');
    if (path.length > 1_024 || hasInvalidSnapshotPathCharacters(path)
      || path.split('/').some(part => !part || part === '.' || part === '..')) {
      return { status: 'unavailable', reason: 'inventory' };
    }
    if (!directAiPath.test(path)) continue;
    const key = path.toLowerCase();
    if (files.has(key)) return { status: 'unavailable', reason: 'inventory' };
    if (typeof file.content !== 'string') return { status: 'unavailable', reason: 'source' };
    const bytes = Buffer.byteLength(file.content, 'utf8');
    totalBytes += bytes;
    if (files.size >= AI_SCRIPT_NAVIGATION_LIMITS.files || bytes > AI_SCRIPT_NAVIGATION_LIMITS.fileBytes
      || totalBytes > AI_SCRIPT_NAVIGATION_LIMITS.totalBytes) return { status: 'unavailable', reason: 'limit' };
    const markupIssue = snapshotMarkupIssue(file.content);
    if (markupIssue) return { status: 'unavailable', reason: markupIssue };
    files.set(key, { path, content: file.content });
  }

  const caller = files.get(input.path.toLowerCase());
  if (!caller || caller.path !== input.path || input.offset > caller.content.length) {
    return { status: 'unavailable', reason: 'focus' };
  }
  const initial = readAiScriptSnapshotDocument(caller.path, caller.content, input.offset);
  if (!initial.readable) return { status: 'unavailable', reason: 'source' };
  if (initial.scanLimited) return { status: 'unavailable', reason: 'limit' };
  const references = input.mode === 'references';
  const name = references && initial.selectedDeclaration ? initial.name : initial.callee;
  if (!name || !initial.name) return { status: 'not-a-literal' };
  const targetPath = `aiscripts/${name}.xml`;
  if (files.get(targetPath.toLowerCase())?.path !== targetPath) return { status: 'not-found' };

  let origin = initial;
  let remaining = AI_SCRIPT_NAVIGATION_LIMITS.references;
  const documents: AiScriptNavigationDocument[] = [];
  for (const file of files.values()) {
    const isCaller = file === caller;
    const document = isCaller && !references ? initial : readAiScriptSnapshotDocument(
      file.path, file.content, isCaller ? input.offset : undefined, references ? { name, limit: remaining } : undefined,
    );
    if (document.scanLimited) return { status: 'unavailable', reason: 'limit' };
    if (!document.readable || (references && !document.references)) return { status: 'unavailable', reason: 'source' };
    remaining -= document.references?.length ?? 0;
    if (isCaller) origin = document;
    documents.push(document);
  }
  if (references) {
    const locations = resolveAiScriptReferences(origin, documents, input.includeDeclaration === true);
    if (locations) return { status: 'resolved', locations };
  } else {
    const location = resolveAiScriptDefinition(origin, documents);
    if (location) return { status: 'resolved', locations: [location] };
  }
  const index = buildAuthoredAiScriptIndex(documents, scriptName);
  return { status: index.get(name.toLowerCase()) === null || index.get(initial.name.toLowerCase()) === null
    ? 'ambiguous' : 'not-found' };
}
