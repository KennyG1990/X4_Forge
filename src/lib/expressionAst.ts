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

// A dollar starts a variable, including directly after a keyword (vanilla uses if$variable).
const MD_EXPRESSION_TOKEN = /'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|(?:[$\p{L}_]|\.(?=[$\p{L}_]))(?:\.\$|[\p{L}\p{N}_.])*|[^\s]/gu;
const MD_GROUP_CLOSERS = new Map([['(', ')'], ['[', ']'], ['{', '}']]);

export const MD_UNMATCHED_ELSE = {
  code: 'md.unmatched_else',
  message: "An 'else' requires a matching 'if … then' in the same expression.",
} as const;

export interface MdExpressionFinding {
  code: typeof MD_UNMATCHED_ELSE.code | 'expression-format-specifier' | 'format-arguments-missing';
  severity: 'error' | 'warning';
  offset: number;
  segment: string;
  message: string;
}

/** Find an else without a matching if/then in its group or argument. */
export function findUnmatchedMdElse(expression: string): number | undefined {
  if (!/\belse\b/.test(expression)) return undefined;
  const scopes: { closer?: string; pending: ('then' | 'else')[] }[] = [{ pending: [] }];
  let previous = '';
  for (const match of expression.matchAll(MD_EXPRESSION_TOKEN)) {
    const token = match[0];
    const scope = scopes[scopes.length - 1];
    const closer = MD_GROUP_CLOSERS.get(token);
    if (token === "'" || token === '"') return undefined;
    if (closer) {
      scopes.push({ closer, pending: [] });
    } else if (token === ')' || token === ']' || token === '}') {
      if (scope.closer !== token) return undefined;
      scopes.pop();
    } else if (token === ',') {
      scope.pending.length = 0;
    } else if (previous !== '.') {
      if (token === 'if') scope.pending.push('then');
      if (token === 'then') {
        // A nested conditional used as the predicate can omit its else.
        while (scope.pending.at(-1) === 'else') scope.pending.pop();
        if (scope.pending.at(-1) === 'then') scope.pending[scope.pending.length - 1] = 'else';
      }
      if (token === 'else' && scope.pending.pop() !== 'else') return match.index;
    }
    previous = token;
  }
  return undefined;
}

interface LiteralFormatCall {
  literal: string;
  offset: number;
  argumentStart: number;
  commas: number;
  emptyArgument: boolean;
}

function checkLiteralFormat(call: LiteralFormatCall, hasLast: boolean, findings: MdExpressionFinding[]): void {
  let sequential = 0;
  let indexed = 0;
  for (const specifier of call.literal.matchAll(/%(?:%|,?(?:\.\d)?([sd]|[1-9]\d*))/g)) {
    const parameter = specifier[1];
    if (parameter === 'd') {
      findings.push({ code: 'expression-format-specifier', severity: 'error', offset: call.offset + specifier.index,
        segment: specifier[0], message: "X4 string formatting uses '%s' or a numbered placeholder for numbers. Replace '%d'." });
    } else if (parameter === 's') sequential++;
    else if (parameter) indexed = Math.max(indexed, Number(parameter));
  }
  const needed = sequential || indexed;
  const given = call.commas + Number(hasLast);
  if (!call.emptyArgument && (hasLast || call.commas === 0) && !(sequential && indexed)
    && Number.isSafeInteger(needed) && needed > given) {
    findings.push({ code: 'format-arguments-missing', severity: 'warning', offset: call.offset, segment: 'format',
      message: `X4 format needs ${needed} arguments but the list supplies ${given}.` });
  }
}

/** Inspect only literal strings directly applied to an explicit argument list. */
function lintLiteralFormats(expression: string, findings: MdExpressionFinding[]): void {
  if (!expression.includes('%') || !expression.includes('[')) return;
  const suffix = /\s*\.\s*\[/y;
  const stack: { closer: string; format?: LiteralFormatCall }[] = [];
  let pending: LiteralFormatCall | undefined;
  for (const match of expression.matchAll(MD_EXPRESSION_TOKEN)) {
    const token = match[0];
    if (token === "'" || token === '"') return;
    if (token.startsWith("'")) {
      suffix.lastIndex = match.index + token.length;
      if (token.includes('%') && suffix.test(expression)) {
        pending = { literal: token.slice(1, -1), offset: match.index + 1,
          argumentStart: suffix.lastIndex, commas: 0, emptyArgument: false };
      }
      continue;
    }
    const closer = MD_GROUP_CLOSERS.get(token);
    if (closer) {
      stack.push({ closer, format: token === '[' && pending?.argumentStart === match.index + 1 ? pending : undefined });
      pending = undefined;
    } else if (token === ',') {
      const format = stack.at(-1)?.format;
      if (format) {
        if (!expression.slice(format.argumentStart, match.index).trim()) format.emptyArgument = true;
        format.commas++;
        format.argumentStart = match.index + 1;
      }
    } else if (token === ')' || token === ']' || token === '}') {
      const frame = stack.pop();
      if (frame?.closer !== token) stack.length = 0;
      else if (frame.format) checkLiteralFormat(frame.format,
        !!expression.slice(frame.format.argumentStart, match.index).trim(), findings);
    }
  }
}

export function lintMdExpressionRules(expression: string): MdExpressionFinding[] {
  const findings: MdExpressionFinding[] = [];
  const offset = findUnmatchedMdElse(expression);
  if (offset !== undefined) findings.push({ ...MD_UNMATCHED_ELSE, severity: 'error', offset, segment: 'else' });
  lintLiteralFormats(expression, findings);
  return findings.sort((a, b) => a.offset - b.offset);
}

/** Resolve literal results of MD inline-if expressions without evaluating predicates. */
export function collectMdStringResults(expression: string): { values: string[]; unresolved: boolean } {
  const unknown = { values: [], unresolved: true };
  if (expression.length > 8192) return unknown;
  const tokens = expression.match(MD_EXPRESSION_TOKEN) ?? [];
  const groups = new Map<number, number>();
  const stack: { index: number; closer: string }[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token === "'" || token === '"') return unknown;
    const closer = MD_GROUP_CLOSERS.get(token);
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
  ok('unmatched_else_locates_the_orphan', [
    ['md.ai_influence_chat.Cards.$needScanStart else 0', 0],
    ['if $x else 0', 0],
    ['if $x then 1 else 2 else 3', 1],
    ['(if $x then 1) else 0', 0],
    ['[if $x then 1, $y else 0]', 0],
  ].every(([expression, index]) => {
    const source = String(expression);
    const offsets = [...source.matchAll(/\belse\b/g)];
    return findUnmatchedMdElse(source) === offsets[Number(index)].index;
  }));
  ok('unmatched_else_preserves_nested_conditionals_and_non_keyword_uses', [
    'if $x then 1', 'if $x then if $y then 1 else 2 else 3',
    'if if $x then 1 then 2 else 3', 'if $x then (if $y then 1) else 2',
    'if $x then [1, 2] else 3', 'if$PlayerDestroyedElements? then 150 else 0',
    "if $value.then then [$else, $x.else, 'an escaped \\'else'] else 0",
  ].every(expression => findUnmatchedMdElse(expression) === undefined));
  const specifier = lintMdExpressionRules("'%d'.[1]");
  ok('literal format reports the unsupported specifier at its percent sign', specifier.length === 1
    && specifier[0].offset === 1 && specifier[0].code === 'expression-format-specifier' && specifier[0].severity === 'error');
  ok('missing explicit format arguments are advisory', ["'%s %s'.['one']", "'%3 %1'.[1,2]", "'%1'.[]"].every(expression => {
    const findings = lintMdExpressionRules(expression);
    return findings.length === 1 && findings[0].code === 'format-arguments-missing' && findings[0].severity === 'warning';
  }));
  ok('documented formats and separate date selectors stay clean', [
    "'%2 %1 %2 %%d'.[1,2]", "'%.3s %s'.[table[$a = 1, $b = 2], 'two, three']",
    "'%s %s'.[$object.[$a,$b], '%s'.[1]]", "'%d in prose'", "player.systemtime.{'%Y-%m-%d %H:%M:%S'}",
    "'%s %s'.[1,]", "'%s %1'.[1]", "'%s %s'.[,1]", "'%d'.[1", "$computed.[1]",
  ].every(expression => lintMdExpressionRules(expression).length === 0));
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

