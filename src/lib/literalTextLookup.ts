import { DOMParser, type Element } from '@xmldom/xmldom';
import { stripX4Comments } from './x4ObjectIndex';
import { maskXmlOpaqueMarkup, scanXmlTagTokens } from '../../shared/xmlMarkup';
import { createXmlNodePositionLocator } from './xmlSourceSpans';

export const LITERAL_TEXT_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const LITERAL_TEXT_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
export const LITERAL_TEXT_MAX_FILES = 512;
const MAX_ENTRIES = 150_000;
const MAX_TEXT_LENGTH = 16_384;
const MAX_EXPANSIONS = 128;
const MAX_DEPTH = 16;
const MAX_PROVENANCE_SOURCES = 8;
const ENCODER = new TextEncoder();
// eslint-disable-next-line no-control-regex -- Apply the XML 1.0 Char production to raw text.
const INVALID_XML_CHARACTER = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

export interface LiteralTextLookupRequest {
  page: number;
  id: number;
  language: number;
  scope: 'reference' | 'workspace';
}

export interface LiteralTextDocument {
  path: string;
  content: string;
  representation?: 'source' | 'generated';
}

export interface LiteralTextSource {
  file: string;
  line: number;
  column: number;
  representation?: LiteralTextDocument['representation'];
}

export type LiteralTextLookupResult = LiteralTextLookupRequest & {
  status: 'found' | 'missing' | 'unavailable' | 'ambiguous' | 'unresolved';
  selectedLanguage?: number;
  authored?: string;
  text?: string;
  source?: LiteralTextSource;
  sources?: LiteralTextSource[];
  reason?: 'incomplete-coverage' | 'language-unavailable' | ExpansionReason;
};

type ExpansionReason = 'missing-reference' | 'ambiguous-reference' | 'cycle' | 'limit';
type Entry = { source: LiteralTextSource; content: string; offset: number; decoded: string };
type Entries = Map<string, Entry[]>;

function decimal(value: string | null): number | undefined {
  if (!value || !/^\d{1,32}$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

/** A missing suffix is undefined. An explicit unsupported language is zero. */
export function literalTextFilenameLanguage(file: string): number | undefined {
  const suffix = /-l(\d+)\.xml$/i.exec(file);
  if (!suffix) return undefined;
  const language = Number(suffix[1]);
  return language >= 1 && language <= 999 ? language : 0;
}

function selectPath(file: string, scope: LiteralTextLookupRequest['scope']): string | undefined {
  if (file.length > 512 || /[:\p{Cc}]/u.test(file)) return undefined;
  const relative = file.replace(/\\/g, '/');
  if (/^t\/[^/]+\.xml$/i.test(relative)) return relative;
  if (scope === 'reference' && /^extensions\/ego_dlc_[\w-]+\/t\/[^/]+\.xml$/i.test(relative)) return relative;
  return undefined;
}

function hasInvalidXmlReference(source: string): boolean {
  for (const match of source.matchAll(/&(?:amp;|lt;|gt;|quot;|apos;|#x([\da-fA-F]+);|#(\d+);)?/g)) {
    if (match[0] === '&') return true;
    if (match[1] === undefined && match[2] === undefined) continue;
    const point = match[1] === undefined ? Number(match[2]) : Number.parseInt(match[1], 16);
    if (point > 0x10FFFF || INVALID_XML_CHARACTER.test(String.fromCodePoint(point))) return true;
  }
  return false;
}

function hasSupportedXmlDeclaration(source: string): boolean {
  const header = /^<\?xml(?=[ \t\r\n])([\s\S]*?)\?>/.exec(source)?.[1];
  if (header === undefined) return true;
  if (!/^[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(['"])1\.0\1(?=[ \t\r\n]|$)/.test(header)) return false;
  const encoding = /[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(['"])([^'"]+)\1/.exec(header)?.[2];
  return encoding === undefined || /^utf-8$/i.test(encoding);
}

function parseTextDocument(content: string): Element | undefined {
  const xml = content.replace(/^\uFEFF/, '');
  if (INVALID_XML_CHARACTER.test(xml) || !hasSupportedXmlDeclaration(xml)) return undefined;
  const declaration = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
  if (declaration.test(xml) || hasInvalidXmlReference(xml)) {
    const visible = maskXmlOpaqueMarkup(xml);
    if (declaration.test(visible) || hasInvalidXmlReference(visible)) return undefined;
  }
  let depth = 0;
  for (const { token, complete } of scanXmlTagTokens(content)) {
    if (!complete) return undefined;
    if (token.startsWith('</')) depth--;
    else if (!/\/\s*>$/.test(token) && ++depth > MAX_DEPTH) return undefined;
  }
  let hadError = false;
  try {
    const root = new DOMParser({
      normalizeLineEndings: source => source.replace(/\r\n?/g, '\n'),
      onError: (level, message) => {
        // U+FFFD is a valid authored character. The reference reader rejects invalid UTF-8 bytes.
        if (level !== 'warning' || message !== 'Unicode replacement character detected, source encoding issues?') hadError = true;
      },
    }).parseFromString(xml, 'text/xml').documentElement;
    return !hadError && root?.tagName === 'language' && !root.namespaceURI ? root : undefined;
  } catch {
    return undefined;
  }
}

function* elementChildren(node: Element): Generator<Element> {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) yield child as Element;
  }
}

function hasContainerText(node: Element): boolean {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if ((child.nodeType === 3 || child.nodeType === 4) && /[^ \t\r\n]/.test(child.textContent ?? '')) return true;
  }
  return false;
}

function indexFile(
  file: LiteralTextDocument,
  relative: string,
  language: number,
  index: Entries,
  capacity: number,
): { selected: boolean; count: number } | undefined {
  const root = parseTextDocument(file.content);
  if (!root) return undefined;
  const fileLanguage = literalTextFilenameLanguage(relative);
  const languageAttribute = root.getAttribute('id');
  const rootLanguage = decimal(languageAttribute);
  if (languageAttribute !== null && rootLanguage === undefined) return undefined;
  if (fileLanguage !== undefined && rootLanguage !== undefined && fileLanguage !== rootLanguage) return undefined;
  const selectedLanguage = rootLanguage ?? fileLanguage;
  if (selectedLanguage === undefined || selectedLanguage < 1 || selectedLanguage > 999) return undefined;
  if (selectedLanguage !== language) return { selected: false, count: 0 };
  if (hasContainerText(root)) return undefined;

  // The locator follows xmldom's default XML 1.1 line rules. Ignore only the
  // extra 1.1 separators here, keeping original UTF-16 offsets and columns.
  const locate = createXmlNodePositionLocator(file.content.replace(/[\u0085\u2028\u2029]/g, ' '));
  let count = 0;
  for (const page of elementChildren(root)) {
    const pageId = decimal(page.getAttribute('id'));
    if (page.tagName !== 'page' || page.namespaceURI || pageId === undefined || hasContainerText(page)) return undefined;
    for (const text of elementChildren(page)) {
      const id = decimal(text.getAttribute('id'));
      if (text.tagName !== 't' || text.namespaceURI || id === undefined || ++count > capacity) return undefined;
      if (!elementChildren(text).next().done) return undefined;
      const offset = locate.offset(text);
      if (offset === undefined || !file.content.startsWith('<t', offset)) return undefined;
      const source = {
        file: relative, ...locate.locateRaw(offset),
        ...(file.representation ? { representation: file.representation } : {}),
      };
      const key = `${pageId},${id}`;
      const row = { source, content: file.content, offset, decoded: text.textContent ?? '' };
      const prior = index.get(key);
      if (prior) prior.push(row);
      else index.set(key, [row]);
    }
  }
  return { selected: true, count };
}

/** Read the exact authored inner XML only for the requested entry. */
function authoredValue(entry: Entry): string | undefined {
  const source = entry.content.slice(entry.offset);
  const tokens = scanXmlTagTokens(source);
  const opening = tokens.next().value;
  if (!opening || opening.start !== 0 || !/^<t(?:\s|\/|>)/.test(opening.token)) return undefined;
  if (/\/\s*>$/.test(opening.token)) return '';
  const closing = tokens.next().value;
  if (!closing || !/^<\/t\s*>$/.test(closing.token)) return undefined;
  if (closing.start - opening.end > MAX_TEXT_LENGTH) return undefined;
  return source.slice(opening.end, closing.start);
}

function expand(index: Entries, rootKey: string): { text?: string; reason?: ExpansionReason } {
  const active = new Set<string>();
  let count = 0;

  function visit(key: string): { text?: string; reason?: ExpansionReason } {
    if (active.has(key)) return { reason: 'cycle' };
    if (active.size >= MAX_DEPTH || ++count > MAX_EXPANSIONS) return { reason: 'limit' };
    const entries = index.get(key);
    if (!entries?.length) return { reason: 'missing-reference' };
    if (entries.length !== 1) return { reason: 'ambiguous-reference' };
    if (entries[0].decoded.length > MAX_TEXT_LENGTH) return { reason: 'limit' };
    const template = stripX4Comments(entries[0].decoded);
    let expanded = '';
    let offset = 0;
    let reason: ExpansionReason | undefined;
    active.add(key);
    for (const match of template.matchAll(/\{\s*(\d+)\s*,\s*(\d+)\s*\}/g)) {
      const page = decimal(match[1]);
      const id = decimal(match[2]);
      const part = page === undefined || id === undefined ? { reason: 'missing-reference' as const } : visit(`${page},${id}`);
      if (part.reason === 'limit') {
        active.delete(key);
        return part;
      }
      reason ??= part.reason;
      const replacement = part.text ?? match[0];
      const start = match.index;
      if (expanded.length + start - offset + replacement.length > MAX_TEXT_LENGTH) {
        active.delete(key);
        return { reason: 'limit' };
      }
      expanded += template.slice(offset, start) + replacement;
      offset = start + match[0].length;
    }
    active.delete(key);
    if (expanded.length + template.length - offset > MAX_TEXT_LENGTH) return { reason: 'limit' };
    return { text: expanded + template.slice(offset), ...(reason ? { reason } : {}) };
  }

  return visit(rootKey);
}

/** Query only the caller-supplied, explicitly addressed authority and language. */
export function resolveLiteralText(
  files: readonly LiteralTextDocument[],
  request: LiteralTextLookupRequest,
  coverageComplete = true,
): LiteralTextLookupResult {
  const unavailable = { ...request, status: 'unavailable', reason: 'incomplete-coverage' } as const;
  if (!coverageComplete || files.length > LITERAL_TEXT_MAX_FILES) return unavailable;
  const paths = new Set<string>();
  const entries: Entries = new Map();
  let bytes = 0;
  let count = 0;
  let hasLanguage = false;
  for (const file of files) {
    const relative = selectPath(file.path, request.scope);
    const key = relative?.toLowerCase();
    if (!relative || !key || paths.has(key)) return unavailable;
    paths.add(key);
    if (file.content.length > LITERAL_TEXT_MAX_FILE_BYTES) return unavailable;
    const length = ENCODER.encode(file.content).byteLength;
    bytes += length;
    if (length > LITERAL_TEXT_MAX_FILE_BYTES || bytes > LITERAL_TEXT_MAX_TOTAL_BYTES) return unavailable;
    const result = indexFile(file, relative, request.language, entries, MAX_ENTRIES - count);
    if (!result) return unavailable;
    hasLanguage ||= result.selected;
    count += result.count;
  }
  if (!hasLanguage) return { ...request, status: 'unavailable', reason: 'language-unavailable' };
  const result = { ...request, selectedLanguage: request.language };
  const key = `${request.page},${request.id}`;
  const matching = entries.get(key);
  if (!matching?.length) return { ...result, status: 'missing' };
  if (matching.length > 1) {
    return { ...result, status: 'ambiguous', sources: matching.slice(0, MAX_PROVENANCE_SOURCES).map(entry => entry.source) };
  }
  const entry = matching[0];
  const authored = authoredValue(entry);
  if (authored === undefined) return { ...result, status: 'unresolved', source: entry.source, reason: 'limit' };
  const expanded = expand(entries, key);
  return { ...result, status: expanded.reason ? 'unresolved' : 'found', authored, source: entry.source, ...expanded };
}
