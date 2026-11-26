/**
 * Pure X4 IDE language intelligence core (folding, document symbols/outline,
 * semantic tokens, inlay hints, reference CodeLens, format-string signature help,
 * Lua ReadText definition/completion, local variable/label rename, and XML quick fixes).
 *
 * Kept `vscode`-free so every feature can be deterministically self-tested and
 * benchmarked headlessly in Node (`x4IdeFeatures.selftest.ts`).
 */

import { readMdDefinitionDocument, resolveMdReferences, planMdRename, type MdDefinitionDocument } from './langNav';

export interface IdePosition {
  line: number;
  character: number;
}

export interface IdeRange {
  start: IdePosition;
  end: IdePosition;
}

export interface IdeFoldingRange {
  startLine: number;
  endLine: number;
  kind: 'comment' | 'region' | 'element';
}

export interface IdeDocumentSymbol {
  name: string;
  detail?: string;
  kind: 'Module' | 'Class' | 'Function' | 'Method' | 'Property' | 'Variable' | 'Constant' | 'Event' | 'Key';
  range: IdeRange;
  selectionRange: IdeRange;
  children: IdeDocumentSymbol[];
}

export const X4_SEMANTIC_TOKEN_TYPES = [
  'variable',
  'keyword',
  'property',
  'enumMember',
  'function',
  'number',
  'string',
  'operator',
  'class',
  'parameter',
] as const;

export type X4SemanticTokenType = typeof X4_SEMANTIC_TOKEN_TYPES[number];

export interface IdeSemanticToken {
  line: number;
  startChar: number;
  length: number;
  tokenType: number;
}

export interface IdeInlayHint {
  position: IdePosition;
  label: string;
  kind: 'Text' | 'Type';
  paddingLeft?: boolean;
}

export interface IdeCodeLens {
  range: IdeRange;
  symbolName: string;
  symbolKind: 'cue' | 'library' | 'label' | 'interrupt';
  referenceCount: number;
  locations: Array<{ file: string; line: number; character: number }>;
}

export interface IdeFormatSignature {
  label: string;
  documentation?: string;
  parameters: Array<{ label: [number, number] | string; documentation?: string }>;
  activeParameter: number;
}

export interface LuaReadTextCall {
  page: string;
  id: string;
  callRange: { start: number; end: number };
}

export interface TFileEntryLocation {
  file: string;
  line: number;
  character: number;
  text: string;
}

export interface IdeQuickFixEdit {
  title: string;
  preferred: boolean;
  edits: Array<{ start: number; end: number; newText: string }>;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

export function positionAtOffset(lineStarts: readonly number[], offset: number): IdePosition {
  let lo = 0;
  let hi = lineStarts.length - 1;
  const clamped = Math.max(0, offset);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= clamped) lo = mid + 1;
    else hi = mid - 1;
  }
  const line = Math.max(0, lo - 1);
  return { line, character: clamped - lineStarts[line] };
}

export function offsetAtPosition(lineStarts: readonly number[], textLength: number, pos: IdePosition): number {
  if (pos.line < 0) return 0;
  if (pos.line >= lineStarts.length) return textLength;
  return Math.min(textLength, lineStarts[pos.line] + Math.max(0, pos.character));
}

function maskXmlCommentsAndCdata(text: string): string {
  return text.replace(
    /<!--[\s\S]*?(-->|$)|<!\[CDATA\[[\s\S]*?(\]\]>|$)|<\?[\s\S]*?(\?>|$)/g,
    m => m.replace(/[^\n]/g, ' '),
  );
}

// ---------------------------------------------------------------------------
// 1. FOLDING RANGES (elements, multiline comments, #region / #endregion)
// ---------------------------------------------------------------------------
export function computeXmlFoldingRanges(text: string): IdeFoldingRange[] {
  const ranges: IdeFoldingRange[] = [];
  const starts = buildLineStarts(text);

  // Comments and #region / #endregion
  const regionStack: number[] = [];
  const commentRe = /<!--([\s\S]*?)-->/g;
  let cm: RegExpExecArray | null;
  while ((cm = commentRe.exec(text)) !== null) {
    const body = cm[1].trim();
    const startLine = positionAtOffset(starts, cm.index).line;
    const endLine = positionAtOffset(starts, cm.index + cm[0].length).line;
    if (/^#region\b/i.test(body)) {
      regionStack.push(startLine);
    } else if (/^#endregion\b/i.test(body)) {
      const regStart = regionStack.pop();
      if (regStart !== undefined && endLine > regStart) {
        ranges.push({ startLine: regStart, endLine, kind: 'region' });
      }
    } else if (endLine > startLine) {
      ranges.push({ startLine, endLine, kind: 'comment' });
    }
  }

  // XML element spans
  const masked = maskXmlCommentsAndCdata(text);
  const tagStack: Array<{ name: string; line: number }> = [];
  const tagRe = /<(\/)?([A-Za-z_][\w.:-]*)(?:(?:"[^"]*"|'[^']*'|[^'"<>])*)?(\/?)>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(masked)) !== null) {
    const isClose = Boolean(tm[1]);
    const name = tm[2].toLowerCase();
    const selfClose = !isClose && /\/\s*>$/.test(tm[0]);
    const line = positionAtOffset(starts, tm.index).line;
    if (isClose) {
      for (let i = tagStack.length - 1; i >= 0; i--) {
        if (tagStack[i].name === name) {
          const opened = tagStack[i];
          tagStack.length = i;
          if (line > opened.line) {
            ranges.push({ startLine: opened.line, endLine: line - 1 >= opened.line ? line : line, kind: 'element' });
          }
          break;
        }
      }
    } else if (!selfClose) {
      tagStack.push({ name, line });
    }
  }

  ranges.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  return ranges;
}

// ---------------------------------------------------------------------------
// 2. DOCUMENT SYMBOLS / OUTLINE (MD, AIScript, <diff>, and libraries/*.xml)
// ---------------------------------------------------------------------------
function extractAttrs(attrRaw: string): Map<string, { value: string; valOffset: number }> {
  const out = new Map<string, { value: string; valOffset: number }>();
  const re = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrRaw)) !== null) {
    const val = m[2] ?? m[3] ?? '';
    const quoteIdx = m[0].indexOf(m[2] !== undefined ? '"' : "'");
    out.set(m[1].toLowerCase(), { value: val, valOffset: m.index + quoteIdx + 1 });
  }
  return out;
}

export function computeX4DocumentSymbols(filePath: string, text: string): IdeDocumentSymbol[] {
  const starts = buildLineStarts(text);
  const masked = maskXmlCommentsAndCdata(text);
  const tagRe = /<(\/)?([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)(\/?)>/g;

  interface OpenNode {
    tag: string;
    attrs: Map<string, { value: string; valOffset: number }>;
    attrBaseOffset: number;
    openStart: number;
    openEnd: number;
    symbol?: IdeDocumentSymbol;
    seenVars?: Set<string>;
  }

  const roots: IdeDocumentSymbol[] = [];
  const stack: OpenNode[] = [];
  let rootKind: string | null = null;

  const makeSym = (
    name: string,
    kind: IdeDocumentSymbol['kind'],
    openStart: number,
    openEnd: number,
    selStart: number,
    selEnd: number,
    detail?: string,
  ): IdeDocumentSymbol => ({
    name: name || '(unnamed)',
    ...(detail ? { detail } : {}),
    kind,
    range: { start: positionAtOffset(starts, openStart), end: positionAtOffset(starts, openEnd) },
    selectionRange: { start: positionAtOffset(starts, selStart), end: positionAtOffset(starts, selEnd) },
    children: [],
  });

  const attachSymbol = (sym: IdeDocumentSymbol) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].symbol) {
        stack[i].symbol!.children.push(sym);
        return;
      }
    }
    roots.push(sym);
  };

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(masked)) !== null) {
    const isClose = Boolean(m[1]);
    const tag = m[2].toLowerCase();
    const attrStr = m[3] || '';
    const selfClose = !isClose && Boolean(m[4]);
    const openStart = m.index;
    const openEnd = tagRe.lastIndex;

    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          const closed = stack[i];
          stack.length = i;
          if (closed.symbol) {
            closed.symbol.range.end = positionAtOffset(starts, openEnd);
          }
          break;
        }
      }
      continue;
    }

    if (!rootKind) rootKind = tag;
    const attrBaseOffset = openStart + 1 + m[2].length;
    const attrs = extractAttrs(attrStr);
    const nameAttr = attrs.get('name');
    const idAttr = attrs.get('id');
    const selAttr = attrs.get('sel');

    let sym: IdeDocumentSymbol | undefined;
    if (tag === 'mdscript' || tag === 'aiscript') {
      const label = nameAttr?.value || tag;
      const s0 = nameAttr ? attrBaseOffset + nameAttr.valOffset : openStart + 1;
      sym = makeSym(label, 'Module', openStart, openEnd, s0, s0 + label.length, tag);
    } else if (tag === 'cue' || tag === 'library') {
      const label = nameAttr?.value || `(${tag})`;
      const s0 = nameAttr ? attrBaseOffset + nameAttr.valOffset : openStart + 1;
      const purpose = attrs.get('purpose')?.value;
      sym = makeSym(label, tag === 'cue' ? 'Event' : 'Function', openStart, openEnd, s0, s0 + label.length, purpose || tag);
    } else if (tag === 'order' && rootKind === 'aiscript') {
      const label = idAttr?.value || 'order';
      const s0 = idAttr ? attrBaseOffset + idAttr.valOffset : openStart + 1;
      sym = makeSym(label, 'Class', openStart, openEnd, s0, s0 + label.length, 'order');
    } else if (tag === 'attention' && rootKind === 'aiscript') {
      const minVal = attrs.get('min')?.value || 'unknown';
      sym = makeSym(`attention (${minVal})`, 'Method', openStart, openEnd, openStart + 1, openStart + 10);
    } else if (tag === 'label' && rootKind === 'aiscript' && nameAttr) {
      const s0 = attrBaseOffset + nameAttr.valOffset;
      sym = makeSym(nameAttr.value, 'Constant', openStart, openEnd, s0, s0 + nameAttr.value.length, 'label');
    } else if (tag === 'handler' && rootKind === 'aiscript') {
      const label = nameAttr?.value || attrs.get('ref')?.value || 'handler';
      sym = makeSym(label, 'Event', openStart, openEnd, openStart + 1, openStart + 8, 'interrupt handler');
    } else if (tag === 'param' && nameAttr && stack.some(s => s.tag === 'params')) {
      const s0 = attrBaseOffset + nameAttr.valOffset;
      sym = makeSym(nameAttr.value, 'Property', openStart, openEnd, s0, s0 + nameAttr.value.length, attrs.get('type')?.value || 'param');
    } else if ((tag === 'set_value' || /^(?:find|create)_/.test(tag)) && nameAttr && /^\$[A-Za-z_]\w*$/.test(nameAttr.value.trim())) {
      const varName = nameAttr.value.trim();
      const ownerScope = [...stack].reverse().find(s => s.seenVars);
      if (ownerScope && !ownerScope.seenVars!.has(varName.toLowerCase())) {
        ownerScope.seenVars!.add(varName.toLowerCase());
        const s0 = attrBaseOffset + nameAttr.valOffset;
        sym = makeSym(varName, 'Variable', openStart, openEnd, s0, s0 + varName.length, tag);
      }
    } else if (rootKind === 'diff' && (tag === 'add' || tag === 'replace' || tag === 'remove')) {
      const label = selAttr ? `${tag} ${selAttr.value}` : tag;
      const s0 = selAttr ? attrBaseOffset + selAttr.valOffset : openStart + 1;
      const sLen = selAttr ? selAttr.value.length : tag.length;
      sym = makeSym(label, 'Key', openStart, openEnd, s0, s0 + sLen, 'diff patch');
    } else if (rootKind !== 'mdscript' && rootKind !== 'aiscript' && rootKind !== 'diff' && stack.length <= 2 && (idAttr || nameAttr)) {
      const chosen = idAttr || nameAttr!;
      const s0 = attrBaseOffset + chosen.valOffset;
      sym = makeSym(chosen.value, 'Class', openStart, openEnd, s0, s0 + chosen.value.length, tag);
    }

    if (sym) attachSymbol(sym);

    if (!selfClose) {
      const tracksVars = tag === 'cue' || tag === 'library' || tag === 'aiscript' || tag === 'mdscript';
      stack.push({
        tag,
        attrs,
        attrBaseOffset,
        openStart,
        openEnd,
        symbol: sym,
        seenVars: tracksVars ? new Set<string>() : undefined,
      });
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// 3. SEMANTIC TOKENS (X4 Expressions & <diff> XPath sel/if)
// ---------------------------------------------------------------------------
const TOKEN_TYPE_INDEX: Record<X4SemanticTokenType, number> = Object.fromEntries(
  X4_SEMANTIC_TOKEN_TYPES.map((t, i) => [t, i]),
) as Record<X4SemanticTokenType, number>;

const X4_KEYWORDS = new Set([
  'player', 'this', 'event', 'md', 'global', 'static', 'staticbase', 'parent', 'namespace',
  'if', 'then', 'else', 'and', 'or', 'not', 'typeof', 'true', 'false', 'null', 'pi', 'table',
]);

const X4_LOOKUP_ROOTS = new Set([
  'faction', 'ware', 'class', 'macro', 'race', 'sector', 'moodtype', 'licencetype',
  'relationchangereason', 'killmethod', 'missiontype', 'attention', 'controlpost', 'skill',
  'isclass', 'isrealclass', 'datatype',
]);

const EXPR_ATTR_NAMES = new Set([
  'value', 'exact', 'min', 'max', 'chance', 'object', 'space', 'sector', 'zone', 'destination',
  'position', 'rotation', 'text', 'param', 'param1', 'param2', 'param3', 'name', 'result',
  'list', 'group', 'groupname', 'filter', 'cue', 'ref', 'show', 'checkinterval', 'timeout', 'delay',
]);

function tokenizeXPathAttribute(raw: string, baseOffset: number, starts: readonly number[], out: IdeSemanticToken[]): void {
  const re = /'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|@[A-Za-z_][\w.:-]*|\b(?:not|text|count|position|last|contains|starts-with)\s*(?=\()|[A-Za-z_][\w.:-]*|\d+|[=/[\]()]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const tok = m[0];
    const pos = positionAtOffset(starts, baseOffset + m.index);
    let kind: X4SemanticTokenType = 'operator';
    if (tok.startsWith("'") || tok.startsWith('"')) kind = 'string';
    else if (tok.startsWith('@')) kind = 'parameter';
    else if (/^\d+$/.test(tok)) kind = 'number';
    else if (/^[A-Za-z_]/.test(tok)) {
      const nextCh = raw[m.index + tok.length] || '';
      kind = nextCh === '(' ? 'function' : (tok === 'and' || tok === 'or') ? 'keyword' : 'class';
    }
    out.push({ line: pos.line, startChar: pos.character, length: tok.length, tokenType: TOKEN_TYPE_INDEX[kind] });
  }
}

function tokenizeExpressionAttribute(raw: string, baseOffset: number, starts: readonly number[], out: IdeSemanticToken[]): void {
  const re = /'(?:\\.|[^'])*'|\$[A-Za-z_]\w*|\d+(?:\.\d+)?(?:ms|km|min|deg|Cr|LF|[smhf])?\b|[A-Za-z_]\w*|[+\-*/%=!<>?@]+/g;
  let prevWasDot = false;
  let prevWord = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const tok = m[0];
    const between = m.index > 0 ? raw.slice(0, m.index) : '';
    prevWasDot = /\.\s*$/.test(between);
    const pos = positionAtOffset(starts, baseOffset + m.index);
    let kind: X4SemanticTokenType = 'operator';
    if (tok.startsWith("'")) kind = 'string';
    else if (tok.startsWith('$')) kind = 'variable';
    else if (/^\d/.test(tok)) kind = 'number';
    else if (/^[A-Za-z_]/.test(tok)) {
      const lower = tok.toLowerCase();
      if (!prevWasDot && X4_KEYWORDS.has(lower)) kind = 'keyword';
      else if (!prevWasDot && X4_LOOKUP_ROOTS.has(lower)) kind = 'keyword';
      else if (prevWasDot && X4_LOOKUP_ROOTS.has(prevWord)) kind = 'enumMember';
      else if (prevWasDot && prevWord === 'md') kind = 'class';
      else if (prevWasDot) kind = 'property';
      else kind = 'function';
      prevWord = lower;
    } else {
      prevWord = '';
    }
    if (!/^[A-Za-z_]/.test(tok)) prevWord = '';
    out.push({ line: pos.line, startChar: pos.character, length: tok.length, tokenType: TOKEN_TYPE_INDEX[kind] });
  }
}

export function computeX4SemanticTokens(filePath: string, text: string): { tokens: IdeSemanticToken[]; data: number[] } {
  const starts = buildLineStarts(text);
  const masked = maskXmlCommentsAndCdata(text);
  const tokens: IdeSemanticToken[] = [];
  const tagRe = /<([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)\/?>/g;
  const attrRe = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(masked)) !== null) {
    const tag = tm[1].toLowerCase();
    const attrStr = tm[2] || '';
    const attrBase = tm.index + 1 + tm[1].length;
    attrRe.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrStr)) !== null) {
      const attrName = am[1].toLowerCase();
      if (attrName === 'comment') continue;
      const val = am[2] ?? am[3] ?? '';
      if (!val || val.includes('\n')) continue;
      const qIdx = am[0].indexOf(am[2] !== undefined ? '"' : "'");
      const valOffset = attrBase + am.index + qIdx + 1;

      if ((tag === 'add' || tag === 'replace' || tag === 'remove') && (attrName === 'sel' || attrName === 'if')) {
        tokenizeXPathAttribute(val, valOffset, starts, tokens);
      } else if (EXPR_ATTR_NAMES.has(attrName) && /[$'.{}[\]+*/?]|\b(?:player|this|event|md|faction|ware|class)\b/.test(val)) {
        tokenizeExpressionAttribute(val, valOffset, starts, tokens);
      }
    }
  }

  tokens.sort((a, b) => a.line - b.line || a.startChar - b.startChar);
  // Encode relative LSP SemanticTokens data array (5 ints per token)
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const t of tokens) {
    const dLine = t.line - prevLine;
    const dChar = dLine === 0 ? t.startChar - prevChar : t.startChar;
    data.push(dLine, dChar, t.length, t.tokenType, 0);
    prevLine = t.line;
    prevChar = t.startChar;
  }
  return { tokens, data };
}

// ---------------------------------------------------------------------------
// 4. INLAY HINTS ({page, id} localized text + : datatype variable hints)
// ---------------------------------------------------------------------------
export function computeX4InlayHints(
  filePath: string,
  text: string,
  opts: {
    resolveText?: (page: string, id: string) => string | null | undefined;
    variableTypes?: Readonly<Record<string, string>>;
    showTexts?: boolean;
    showVariableTypes?: boolean;
  } = {},
): IdeInlayHint[] {
  const hints: IdeInlayHint[] = [];
  const starts = buildLineStarts(text);
  const masked = maskXmlCommentsAndCdata(text);
  const showTexts = opts.showTexts !== false;
  const showVarTypes = opts.showVariableTypes !== false;

  if (showTexts && opts.resolveText) {
    const braceRe = /\{\s*(\d+)\s*,\s*(\d+)\s*\}/g;
    let bm: RegExpExecArray | null;
    while ((bm = braceRe.exec(masked)) !== null) {
      const resolved = opts.resolveText(bm[1], bm[2]);
      if (!resolved) continue;
      const preview = resolved.length > 42 ? `${resolved.slice(0, 39)}…` : resolved;
      hints.push({
        position: positionAtOffset(starts, bm.index + bm[0].length),
        label: ` "${preview}"`,
        kind: 'Text',
        paddingLeft: true,
      });
    }
  }

  if (showVarTypes && opts.variableTypes) {
    const hintedVars = new Set<string>();
    const tagRe = /<([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)\/?>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(masked)) !== null) {
      const tag = tm[1].toLowerCase();
      if (tag === 'param') continue; // <param type="..."> already shows explicit type
      const attrs = extractAttrs(tm[2] || '');
      const nameAttr = attrs.get('name');
      if (!nameAttr || !/^\$[A-Za-z_]\w*$/.test(nameAttr.value.trim())) continue;
      const varName = nameAttr.value.trim();
      const lower = varName.toLowerCase();
      if (hintedVars.has(lower)) continue;
      const exactVal = (attrs.get('exact')?.value || '').trim();
      if (/^(?:'[^']*'|\[\s*\]|table\s*\[\s*\]|\{\s*\d+\s*,\s*\d+\s*\})$/.test(exactVal)) continue;
      const inferred = opts.variableTypes[varName] || opts.variableTypes[lower] || opts.variableTypes[lower.slice(1)];
      if (!inferred) continue;
      hintedVars.add(lower);
      const attrBase = tm.index + 1 + tm[1].length;
      const endOffset = attrBase + nameAttr.valOffset + nameAttr.value.length;
      const isGuess = /^(?:find|create|get|select)_/.test(tag) && !/^(?:true|1)$/i.test(attrs.get('multiple')?.value || '');
      hints.push({
        position: positionAtOffset(starts, endOffset),
        label: `: ${inferred}${isGuess ? '?' : ''}`,
        kind: 'Type',
      });
    }
  }

  hints.sort((a, b) => a.position.line - b.position.line || a.position.character - b.position.character);
  return hints;
}

// ---------------------------------------------------------------------------
// 5. REFERENCE CODELENSES (MD cues/libraries + AIScript labels)
// ---------------------------------------------------------------------------
export function computeX4CodeLenses(
  filePath: string,
  text: string,
  siblingMdFiles: ReadonlyArray<{ file: string; text: string }> = [],
): IdeCodeLens[] {
  const lenses: IdeCodeLens[] = [];
  const starts = buildLineStarts(text);
  const masked = maskXmlCommentsAndCdata(text);

  if (/<mdscript\b/i.test(masked)) {
    const siblingDocs: MdDefinitionDocument[] = [];
    for (const s of siblingMdFiles) {
      if (s.file.toLowerCase() === filePath.toLowerCase()) continue;
      const doc = readMdDefinitionDocument(s.file, s.text);
      if (doc) siblingDocs.push(doc);
    }
    const declRe = /<(cue|library)\b((?:"[^"]*"|'[^']*'|[^'"<>])*?)\/?>/g;
    let dm: RegExpExecArray | null;
    while ((dm = declRe.exec(masked)) !== null) {
      const kind = dm[1].toLowerCase() as 'cue' | 'library';
      const attrs = extractAttrs(dm[2] || '');
      const nameAttr = attrs.get('name');
      if (!nameAttr || !nameAttr.value) continue;
      const nameOffset = dm.index + 1 + dm[1].length + nameAttr.valOffset + 1;
      const snap = readMdDefinitionDocument(filePath, text, nameOffset, true);
      const refs = snap ? resolveMdReferences(snap, siblingDocs, false) : [];
      const linePos = positionAtOffset(starts, dm.index);
      lenses.push({
        range: { start: linePos, end: positionAtOffset(starts, dm.index + dm[0].length) },
        symbolName: nameAttr.value,
        symbolKind: kind,
        referenceCount: refs.length,
        locations: refs.map(r => ({ file: r.file, line: r.line, character: r.column })),
      });
    }
  } else if (/<aiscript\b/i.test(masked)) {
    const resumeTargets = new Map<string, Array<{ line: number; character: number }>>();
    const resRe = /<resume\b((?:"[^"]*"|'[^']*'|[^'"<>])*?)\/?>/g;
    let rm: RegExpExecArray | null;
    while ((rm = resRe.exec(masked)) !== null) {
      const lbl = extractAttrs(rm[1] || '').get('label');
      if (!lbl?.value) continue;
      const key = lbl.value.toLowerCase();
      const list = resumeTargets.get(key) || [];
      list.push(positionAtOffset(starts, rm.index + 7 + lbl.valOffset));
      resumeTargets.set(key, list);
    }
    const labelRe = /<label\b((?:"[^"]*"|'[^']*'|[^'"<>])*?)\/?>/g;
    let lm: RegExpExecArray | null;
    while ((lm = labelRe.exec(masked)) !== null) {
      const nameAttr = extractAttrs(lm[1] || '').get('name');
      if (!nameAttr?.value) continue;
      const hits = resumeTargets.get(nameAttr.value.toLowerCase()) || [];
      lenses.push({
        range: { start: positionAtOffset(starts, lm.index), end: positionAtOffset(starts, lm.index + lm[0].length) },
        symbolName: nameAttr.value,
        symbolKind: 'label',
        referenceCount: hits.length,
        locations: hits.map(h => ({ file: filePath, line: h.line, character: h.character })),
      });
    }
  }

  return lenses;
}

// ---------------------------------------------------------------------------
// 6. FORMAT STRING SIGNATURE HELP ('%s of %s'.[$a, |] and {page, id}.[$a, |])
// ---------------------------------------------------------------------------
export function computeFormatSignatureHelp(
  text: string,
  offset: number,
  resolveText?: (page: string, id: string) => string | null | undefined,
): IdeFormatSignature | null {
  const windowStart = Math.max(0, offset - 512);
  const prefix = text.slice(windowStart, offset);
  // Find innermost open `.[` before cursor
  let depth = 0;
  let openBracket = -1;
  let activeComma = 0;
  let inStr = false;
  for (let i = prefix.length - 1; i >= 0; i--) {
    const ch = prefix[i];
    if (ch === "'" && prefix[i - 1] !== '\\') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === ']' || ch === ')' || ch === '}') depth++;
    else if (ch === '(' || ch === '{') {
      if (depth > 0) depth--;
      else break;
    } else if (ch === '[') {
      if (depth > 0) depth--;
      else {
        const beforeBracket = prefix.slice(0, i).trimEnd();
        if (beforeBracket.endsWith('.')) {
          openBracket = i;
          break;
        }
        return null;
      }
    } else if (ch === ',' && depth === 0) {
      activeComma++;
    }
  }
  if (openBracket < 0) return null;

  const receiver = prefix.slice(0, openBracket).trimEnd().slice(0, -1).trimEnd();
  let template: string | null = null;
  const litMatch = /'((?:\\.|[^'])*)'$/.exec(receiver);
  if (litMatch) {
    template = litMatch[1];
  } else if (resolveText) {
    const textRefMatch = /\{\s*(\d+)\s*,\s*(\d+)\s*\}$/.exec(receiver);
    if (textRefMatch) template = resolveText(textRefMatch[1], textRefMatch[2]) || `{${textRefMatch[1]}, ${textRefMatch[2]}}`;
  }
  if (!template) return null;

  const placeholders: Array<{ span: [number, number]; index: number }> = [];
  let seqIdx = 0;
  const specRe = /%(?:%|,?(?:\.\d+)?([s]|[1-9]\d*))/g;
  let sm: RegExpExecArray | null;
  while ((sm = specRe.exec(template)) !== null) {
    if (sm[0] === '%%') continue;
    const p = sm[1];
    const argIndex = p === 's' ? seqIdx++ : Number(p) - 1;
    placeholders.push({ span: [sm.index, sm.index + sm[0].length], index: argIndex });
  }
  if (!placeholders.length) return null;

  const maxParam = Math.max(...placeholders.map(p => p.index)) + 1;
  const parameters: IdeFormatSignature['parameters'] = [];
  for (let idx = 0; idx < maxParam; idx++) {
    const ph = placeholders.find(p => p.index === idx);
    parameters.push({ label: ph ? ph.span : `arg${idx + 1}` });
  }

  return {
    label: template,
    parameters,
    activeParameter: Math.min(activeComma, parameters.length - 1),
  };
}

// ---------------------------------------------------------------------------
// 7. LUA ReadText(page, id) GO-TO-DEFINITION & COMPLETION
// ---------------------------------------------------------------------------
function collectLuaNumericConstants(luaText: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of luaText.matchAll(/\blocal\s+([A-Za-z_]\w*)\s*=\s*(\d+)\b/g)) {
    map.set(m[1], m[2]);
  }
  for (const tm of luaText.matchAll(/\blocal\s+([A-Za-z_]\w*)\s*=\s*\{([^}]*)\}/g)) {
    const tbl = tm[1];
    for (const fm of tm[2].matchAll(/\b([A-Za-z_]\w*)\s*=\s*(\d+)\b/g)) {
      map.set(`${tbl}.${fm[1]}`, fm[2]);
    }
  }
  return map;
}

export function resolveLuaReadTextAtCursor(luaText: string, offset: number): LuaReadTextCall | null {
  const consts = collectLuaNumericConstants(luaText);
  const callRe = /\bReadText\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?|\d+)\s*,\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?|\d+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(luaText)) !== null) {
    const start = m.index;
    const end = callRe.lastIndex;
    if (offset < start || offset > end) continue;
    const rawPage = m[1];
    const rawId = m[2];
    const page = /^\d+$/.test(rawPage) ? rawPage : consts.get(rawPage);
    const id = /^\d+$/.test(rawId) ? rawId : consts.get(rawId);
    if (!page || !id) return null;
    return { page, id, callRange: { start, end } };
  }
  return null;
}

export function findTFileEntryLocation(
  tFiles: ReadonlyArray<{ file: string; text: string }>,
  page: string,
  id: string,
): TFileEntryLocation | null {
  const targetPage = String(Number(page));
  const targetId = String(Number(id));
  for (const tf of tFiles) {
    const starts = buildLineStarts(tf.text);
    const masked = maskXmlCommentsAndCdata(tf.text);
    const pageRe = /<page\b([^>]*?)>([\s\S]*?)<\/page>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = pageRe.exec(masked)) !== null) {
      const pidMatch = /\bid\s*=\s*["'](\d+)["']/i.exec(pm[1]);
      if (!pidMatch || String(Number(pidMatch[1])) !== targetPage) continue;
      const bodyOffset = pm.index + pm[0].indexOf('>') + 1;
      const tRe = /<t\b([^>]*?)>([\s\S]*?)<\/t>/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(pm[2])) !== null) {
        const tidMatch = /\bid\s*=\s*["'](\d+)["']/i.exec(tm[1]);
        if (!tidMatch || String(Number(tidMatch[1])) !== targetId) continue;
        const exactOffset = bodyOffset + tm.index;
        const pos = positionAtOffset(starts, exactOffset);
        const rawBody = tf.text.slice(exactOffset + tm[0].indexOf('>') + 1, exactOffset + tm[0].lastIndexOf('<'));
        return { file: tf.file, line: pos.line, character: pos.character, text: rawBody };
      }
    }
  }
  return null;
}

export function completeLuaReadText(
  luaText: string,
  offset: number,
  pages: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Array<{ label: string; detail: string; insertText: string }> {
  const before = luaText.slice(Math.max(0, offset - 128), offset);
  const arg2 = /\bReadText\s*\(\s*(\d+)\s*,\s*(\d*)$/.exec(before);
  if (arg2) {
    const entries = pages.get(arg2[1]);
    if (!entries) return [];
    const prefix = arg2[2];
    const out: Array<{ label: string; detail: string; insertText: string }> = [];
    for (const [id, val] of entries) {
      if (prefix && !id.startsWith(prefix)) continue;
      out.push({ label: id, detail: val.slice(0, 60), insertText: id });
      if (out.length >= 100) break;
    }
    return out;
  }
  const arg1 = /\bReadText\s*\(\s*(\d*)$/.exec(before);
  if (arg1) {
    const prefix = arg1[1];
    const out: Array<{ label: string; detail: string; insertText: string }> = [];
    for (const [page, entries] of pages) {
      if (prefix && !page.startsWith(prefix)) continue;
      out.push({ label: page, detail: `${entries.size} text entries`, insertText: page });
      if (out.length >= 100) break;
    }
    return out;
  }
  return [];
}

// ---------------------------------------------------------------------------
// 8. NATIVE F2 RENAME (MD Cues/Libraries + Local $Variables + AIScript Labels)
// ---------------------------------------------------------------------------
export function planX4SymbolRename(
  files: ReadonlyArray<{ file: string; text: string }>,
  activeFile: string,
  cursorOffset: number,
  newName: string,
): { edits: Array<{ file: string; start: number; end: number; newText: string }> } | { reason: string } {
  const active = files.find(f => f.file.toLowerCase() === activeFile.toLowerCase());
  if (!active) return { reason: 'Active file is not available.' };

  // 1. Local $variable rename within the active script
  const around = active.text.slice(Math.max(0, cursorOffset - 64), Math.min(active.text.length, cursorOffset + 64));
  const localOffset = cursorOffset - Math.max(0, cursorOffset - 64);
  const varRe = /\$[A-Za-z_]\w*/g;
  let vm: RegExpExecArray | null;
  while ((vm = varRe.exec(around)) !== null) {
    if (vm.index <= localOffset && localOffset <= vm.index + vm[0].length) {
      const oldVar = vm[0];
      const cleanNew = newName.startsWith('$') ? newName : `$${newName}`;
      if (!/^\$[A-Za-z_]\w*$/.test(cleanNew)) return { reason: `Invalid X4 variable name "${newName}".` };
      const masked = maskXmlCommentsAndCdata(active.text);
      const edits: Array<{ file: string; start: number; end: number; newText: string }> = [];
      const escaped = oldVar.replace('$', '\\$');
      const hitRe = new RegExp(`${escaped}\\b`, 'g');
      let hm: RegExpExecArray | null;
      while ((hm = hitRe.exec(masked)) !== null) {
        edits.push({ file: active.file, start: hm.index, end: hm.index + oldVar.length, newText: cleanNew });
      }
      return edits.length ? { edits } : { reason: 'No variable occurrences found.' };
    }
  }

  // 2. AIScript label rename (<label name="..."/> + <resume label="..."/>)
  if (/<aiscript\b/i.test(active.text)) {
    if (!/^[A-Za-z_][\w.-]*$/.test(newName)) return { reason: `Invalid AIScript label "${newName}".` };
    const masked = maskXmlCommentsAndCdata(active.text);
    const labelTokRe = /<(label|resume)\b((?:"[^"]*"|'[^']*'|[^'"<>])*?)\/?>/g;
    let targetLabel: string | null = null;
    const occurrences: Array<{ start: number; end: number; val: string }> = [];
    let lm: RegExpExecArray | null;
    while ((lm = labelTokRe.exec(masked)) !== null) {
      const attrKey = lm[1].toLowerCase() === 'label' ? 'name' : 'label';
      const attr = extractAttrs(lm[2] || '').get(attrKey);
      if (!attr?.value) continue;
      const start = lm.index + 1 + lm[1].length + attr.valOffset;
      const end = start + attr.value.length;
      occurrences.push({ start, end, val: attr.value });
      if (start <= cursorOffset && cursorOffset <= end) targetLabel = attr.value;
    }
    if (targetLabel) {
      const edits = occurrences
        .filter(o => o.val === targetLabel)
        .map(o => ({ file: active.file, start: o.start, end: o.end, newText: newName }));
      return { edits };
    }
  }

  // 3. Cross-file MD cue / library rename via shared planMdRename
  const mdPlan = planMdRename([...files], active.file, cursorOffset, newName);
  if ('reason' in mdPlan) return { reason: mdPlan.reason };
  return {
    edits: mdPlan.edits.map(e => ({ file: e.file, start: e.start, end: e.end, newText: e.after })),
  };
}

// ---------------------------------------------------------------------------
// 9. XML QUICK FIXES (Element/Attr Typos, Missing Required Attrs, Create Cue/Library)
// ---------------------------------------------------------------------------
function damerauLevenshtein(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev2: number[] | null = null;
  let prev1 = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1);
    curr[0] = i;
    let best = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(prev1[j] + 1, curr[j - 1] + 1, prev1[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && prev2) {
        val = Math.min(val, prev2[j - 2] + 1);
      }
      curr[j] = val;
      if (val < best) best = val;
    }
    if (best > cap) return cap + 1;
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1[b.length];
}

export function computeXmlQuickFixes(
  text: string,
  offset: number,
  opts: {
    knownElements?: Iterable<string>;
    requiredAttrsFor?: (tag: string) => string[];
    knownCues?: ReadonlySet<string>;
  } = {},
): IdeQuickFixEdit[] {
  const fixes: IdeQuickFixEdit[] = [];
  const masked = maskXmlCommentsAndCdata(text);
  const tagRe = /<([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)(\/?)>/g;
  const elemSet = opts.knownElements ? new Set([...opts.knownElements].map(e => e.toLowerCase())) : null;

  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(masked)) !== null) {
    const start = tm.index;
    const end = tagRe.lastIndex;
    if (offset < start || offset > end) continue;
    const rawTag = tm[1];
    const tag = rawTag.toLowerCase();
    const attrs = extractAttrs(tm[2] || '');

    // 1. Unknown/misspelled element -> offer closest XSD element(s)
    if (elemSet && elemSet.size > 0 && !elemSet.has(tag)) {
      const candidates = [...elemSet]
        .map(c => ({ c, d: damerauLevenshtein(tag, c, 2) }))
        .filter(x => x.d <= 2)
        .sort((a, b) => a.d - b.d || a.c.localeCompare(b.c))
        .slice(0, 3);
      candidates.forEach((cand, idx) => {
        const edits: Array<{ start: number; end: number; newText: string }> = [
          { start: start + 1, end: start + 1 + rawTag.length, newText: cand.c },
        ];
        if (!tm![3]) {
          const closeRe = new RegExp(`</${rawTag}\\s*>`, 'g');
          closeRe.lastIndex = end;
          const closeMatch = closeRe.exec(masked);
          if (closeMatch) {
            edits.push({ start: closeMatch.index + 2, end: closeMatch.index + 2 + rawTag.length, newText: cand.c });
          }
        }
        fixes.push({
          title: `Change <${rawTag}> to <${cand.c}>`,
          preferred: idx === 0 && (cand.d === 1 || candidates.length === 1 || candidates[1].d > cand.d),
          edits,
        });
      });
    }

    // 2. Missing required attributes
    if (opts.requiredAttrsFor && (!elemSet || elemSet.has(tag))) {
      const req = opts.requiredAttrsFor(tag).filter(r => !attrs.has(r.toLowerCase()));
      if (req.length > 0) {
        const insertAt = end - (tm[3] ? 2 : 1);
        const attrSnippet = ' ' + req.map(r => `${r}=""`).join(' ');
        fixes.push({
          title: `Add required attribute${req.length > 1 ? 's' : ''}: ${req.join(', ')}`,
          preferred: false,
          edits: [{ start: insertAt, end: insertAt, newText: attrSnippet }],
        });
      }
    }

    // 3. Create missing local cue or library when signal_cue / run_actions / include_actions targets unknown local name
    if (opts.knownCues) {
      const cueRef = (tag === 'signal_cue' || tag === 'signal_cue_instantly') ? attrs.get('cue')?.value
        : (tag === 'run_actions' || tag === 'include_actions') ? attrs.get('ref')?.value : undefined;
      if (cueRef && /^[A-Za-z_]\w*$/.test(cueRef) && !['this', 'parent', 'static'].includes(cueRef)
        && !opts.knownCues.has(cueRef)) {
        const closeCuesIdx = masked.lastIndexOf('</cues>');
        if (closeCuesIdx >= 0) {
          const isLib = tag === 'run_actions' || tag === 'include_actions';
          const stub = isLib
            ? `\n    <library name="${cueRef}"${tag === 'run_actions' ? ' purpose="run_actions"' : ''}>\n      <actions>\n      </actions>\n    </library>\n  `
            : `\n    <cue name="${cueRef}" instantiate="true" namespace="this">\n      <conditions>\n        <event_cue_signalled/>\n      </conditions>\n      <actions>\n      </actions>\n    </cue>\n  `;
          fixes.push({
            title: `Create ${isLib ? 'library' : 'cue'} "${cueRef}"`,
            preferred: false,
            edits: [{ start: closeCuesIdx, end: closeCuesIdx, newText: stub }],
          });
        }
      }
    }
    break;
  }

  return fixes;
}
