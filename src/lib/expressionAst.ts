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

const CHAIN_RE = /(@?)(\$[A-Za-z_]\w*|[A-Za-z_]\w*)((?:\.(?:\$[A-Za-z_]\w*|\{[^}\n]*\}|\[[^\]\n]*\]|[A-Za-z_]\w*\??))+)/g;
const SEGMENT_RE = /\.(\$[A-Za-z_]\w*|\{[^}\n]*\}|\[[^\]\n]*\]|[A-Za-z_]\w*\??)/g;

function segmentKind(raw: string): ExpressionSegmentKind {
  if (raw.startsWith('$')) return 'variable-selector';
  if (raw.startsWith('{')) return 'dynamic-selector';
  if (raw.startsWith('[')) return 'list-selector';
  return 'property';
}

export function parseExpressionChains(textInput: string): ExpressionChainAst[] {
  const text = String(textInput || '');
  const chains: ExpressionChainAst[] = [];
  CHAIN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHAIN_RE.exec(text)) !== null) {
    const rootStart = match.index + match[1].length;
    const rootRaw = match[2];
    const segments: ExpressionSegmentAst[] = [];
    SEGMENT_RE.lastIndex = 0;
    let segment: RegExpExecArray | null;
    while ((segment = SEGMENT_RE.exec(match[3])) !== null) {
      const raw = segment[1];
      const start = rootStart + rootRaw.length + segment.index + 1;
      segments.push({
        kind: segmentKind(raw), raw, name: raw.replace(/\?$/, '').toLowerCase(),
        start, end: start + raw.length, optional: raw.endsWith('?'),
      });
    }
    chains.push({
      kind: 'chain', raw: match[0], start: match.index, end: CHAIN_RE.lastIndex,
      root: { kind: 'root', raw: rootRaw, name: rootRaw.replace(/^\$/, '').toLowerCase(), start: rootStart, end: rootStart + rootRaw.length, optional: false },
      segments,
    });
  }
  return chains;
}

export function expressionChainAt(text: string, offset: number): ExpressionChainAst | null {
  return parseExpressionChains(text).find(chain => offset >= chain.start && offset <= chain.end) || null;
}

/** Resolve literal results of MD inline-if expressions without evaluating predicates. */
export function collectMdStringResults(expression: string): { values: string[]; unresolved: boolean } {
  const unknown = { values: [], unresolved: true };
  if (expression.length > 8192) return unknown;
  const tokens = expression.match(/'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|(?:[$\p{L}_]|\.(?=[$\p{L}_]))[$\p{L}\p{N}_.]*|[^\s]/gu) ?? [];
  const closers = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
  const groups = new Map<number, number>();
  const stack: { index: number; closer: string }[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token === "'" || token === '"') return unknown;
    const closer = closers.get(token);
    if (closer) stack.push({ index, closer });
    else if (token === ')' || token === ']' || token === '}') {
      const group = stack.pop();
      if (group?.closer !== token) return unknown;
      groups.set(group.index, index);
    }
  }
  if (stack.length) return unknown;

  const values = new Set<string>();
  let unresolved = false;
  function visit(start: number, end: number, depth: number): void {
    if (depth >= 32 || start >= end) { unresolved = true; return; }
    while (tokens[start] === '(' && groups.get(start) === end - 1) { start++; end--; }
    if (end === start + 1 && /^'(?:\\['\\n]|[^'\\])+'$/.test(tokens[start])) {
      const value = tokens[start].slice(1, -1).replace(/\\(['\\n])/g, (_, escaped) => escaped === 'n' ? '\n' : escaped);
      values.add(value);
      return;
    }
    if (tokens[start] !== 'if') { unresolved = true; return; }

    const pending = ['then'];
    let then = -1;
    for (let index = start + 1; index < end; index++) {
      const groupEnd = groups.get(index);
      if (groupEnd !== undefined) { index = groupEnd; continue; }
      if (tokens[index - 1] === '.') continue;
      const token = tokens[index];
      if (token === 'if') pending.push('then');
      if (token !== 'then' && token !== 'else') continue;
      if (pending.pop() !== token) { unresolved = true; return; }
      if (token === 'then') {
        if (!pending.length) then = index;
        pending.push('else');
      } else if (!pending.length) {
        if (then <= start + 1 || index <= then + 1 || index >= end - 1) { unresolved = true; return; }
        visit(then + 1, index, depth + 1);
        visit(index + 1, end, depth + 1);
        return;
      }
    }
    // An omitted else produces null when the condition is false.
    if (then > start + 1 && pending.every(token => token === 'else')) visit(then + 1, end, depth + 1);
    unresolved = true;
  }
  visit(0, tokens.length, 0);
  return { values: [...values], unresolved };
}

export function runExpressionAstSelftest() {
  const checks: Array<{ name: string; pass: boolean }> = [];
  const ok = (name: string, pass: boolean) => checks.push({ name, pass });
  const nested = collectMdStringResults("if ($x.then == 'if then else') then (if $next then 'one') else 'two'");
  ok('inline_if_retains_known_results_and_implicit_null', nested.values.join(',') === 'one,two' && nested.unresolved);
  const exact = collectMdStringResults("if $table.[$else] then 'one' else if $next then 'two' else 'three'");
  ok('inline_if_matches_grouping_and_nested_else', exact.values.join(',') === 'one,two,three' && !exact.unresolved);
  const escaped = collectMdStringResults("if $x then 'one\\'two' else 'three\\\\four\\nfive'");
  ok('inline_if_decodes_supported_literal_escapes',
    escaped.values.join('|') === "one'two|three\\four\nfive" && !escaped.unresolved);
  ok('inline_if_does_not_fabricate_values_from_unsupported_results', [
    "if $x then 'not-ready' else", "if $x then ('unbalanced'", "if $x else 'invalid'", "$runtime", '"not-an-md-literal"', "'unknown\\q'",
  ].every(expression => {
    const result = collectMdStringResults(expression);
    return result.unresolved && !result.values.length;
  }));
  const text = `<do_if value="$ship.owner.relationto.{faction.argon} and $list.[$index].exists?"/>`;
  const chains = parseExpressionChains(text);
  ok('two_chains_parsed', chains.length === 2);
  ok('root_span_exact', text.slice(chains[0].root.start, chains[0].root.end) === '$ship');
  ok('properties_preserve_order', chains[0].segments.slice(0, 2).map(segment => segment.name).join(',') === 'owner,relationto');
  ok('dynamic_selector_classified', chains[0].segments[2]?.kind === 'dynamic-selector');
  ok('list_selector_classified', chains[1].segments[0]?.kind === 'list-selector');
  ok('optional_property_retained', chains[1].segments[1]?.optional === true && chains[1].segments[1]?.name === 'exists');
  const passed = checks.filter(check => check.pass).length;
  return { pass: passed === checks.length, allPassed: passed === checks.length, passed, total: checks.length, checks };
}

