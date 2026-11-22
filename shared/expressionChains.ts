/** Span-preserving AST for the X4 MD/AI dotted expression-chain subset. */

export type ExpressionSegmentKind = 'root' | 'property' | 'variable-selector' | 'dynamic-selector' | 'list-selector';

export interface ExpressionSegmentAst {
  kind: ExpressionSegmentKind;
  raw: string;
  name: string;
  start: number;
  end: number;
  optional: boolean;
}

export interface ExpressionChainAst {
  kind: 'chain';
  raw: string;
  start: number;
  end: number;
  root: ExpressionSegmentAst;
  segments: ExpressionSegmentAst[];
}

export const MAX_SELECTOR_ANALYSIS_DEPTH = 64;
const CHAIN_STRING = /'(?:\\[^\r\n]|[^'\\\r\n])*'?/;
const XML_CHAIN_STRING = /'(?:\\[^"\r\n]|[^'"\\\r\n])*'?/;

function segmentKind(raw: string): ExpressionSegmentKind {
  if (raw.startsWith('$')) return 'variable-selector';
  if (raw.startsWith('{')) return 'dynamic-selector';
  if (raw.startsWith('[')) return 'list-selector';
  return 'property';
}

/** Pair selectors without letting an unfinished key consume the next XML attribute. */
function selectorEnds(text: string, stringToken: RegExp): Map<number, number> {
  const ends = new Map<number, number>();
  const stack: { start: number; closer: string }[] = [];
  const boundary = /["\r\n[\]{}()]/;
  for (const match of text.matchAll(new RegExp(`${stringToken.source}|${boundary.source}`, 'g'))) {
    const token = match[0];
    if (token.startsWith("'")) continue;
    const closer = MD_GROUP_CLOSERS.get(token);
    if (closer) {
      stack.push({ start: match.index, closer });
      continue;
    }
    const frame = stack.pop();
    if (frame?.closer !== token) stack.length = 0;
    else if (text[frame.start - 1] === '.') ends.set(frame.start, match.index + 1);
  }
  return ends;
}

export function parseExpressionChains(textInput: string): ExpressionChainAst[] {
  const text = String(textInput || '');
  const chains: ExpressionChainAst[] = [];
  const stringToken = /^\s*</.test(text) ? XML_CHAIN_STRING : CHAIN_STRING;
  const ends = selectorEnds(text, stringToken);
  // Consume an unfinished string once instead of restarting at every escaped quote.
  const rootToken = /(@?)(\$[A-Za-z_]\w*|(?<![\w$])[A-Za-z_]\w*)(?=\.)/;
  const rootPattern = new RegExp(`${stringToken.source}|${rootToken.source}`, 'g');
  const simpleSegment = /\$[A-Za-z_]\w*|[A-Za-z_]\w*\??/y;
  const ranges = [{ start: 0, end: text.length, depth: 0 }];
  for (let range = ranges.pop(); range; range = ranges.pop()) {
    const scope = text.slice(range.start, range.end);
    rootPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rootPattern.exec(scope))) {
      const rootRaw = match[2];
      if (!rootRaw) continue;
      const chainStart = range.start + match.index;
      const rootStart = chainStart + match[1].length;
      const rootEnd = rootStart + rootRaw.length;
      let end = rootEnd;
      let incomplete = false;
      const segments: ExpressionSegmentAst[] = [];
      while (text[end] === '.' && end + 1 < range.end) {
        const start = end + 1;
        const isSelector = text[start] === '{' || text[start] === '[';
        simpleSegment.lastIndex = start;
        const segmentEnd = isSelector ? ends.get(start) : simpleSegment.test(text) ? simpleSegment.lastIndex : undefined;
        if (segmentEnd === undefined || segmentEnd > range.end) {
          incomplete = isSelector;
          break;
        }
        // Keep the whole outer key even when nested lint detail reaches the work bound.
        if (isSelector && range.depth < MAX_SELECTOR_ANALYSIS_DEPTH && start + 1 < segmentEnd - 1) {
          ranges.push({ start: start + 1, end: segmentEnd - 1, depth: range.depth + 1 });
        }
        const raw = text.slice(start, segmentEnd);
        segments.push({
          kind: segmentKind(raw), raw, name: isSelector ? raw : raw.replace(/\?$/, '').toLowerCase(),
          start, end: segmentEnd, optional: raw.endsWith('?'),
        });
        end = segmentEnd;
      }
      rootPattern.lastIndex = end - range.start;
      if (incomplete || !segments.length) continue;
      chains.push({
        kind: 'chain', raw: text.slice(chainStart, end), start: chainStart, end,
        root: { kind: 'root', raw: rootRaw, name: rootRaw.replace(/^\$/, '').toLowerCase(), start: rootStart, end: rootEnd, optional: false },
        segments,
      });
    }
  }
  return chains.sort((a, b) => a.start - b.start);
}

export function expressionChainAt(text: string, offset: number): ExpressionChainAst | null {
  return parseExpressionChains(text).reverse().find(chain => offset >= chain.start && offset <= chain.end) || null;
}

export const MD_GROUP_CLOSERS = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
