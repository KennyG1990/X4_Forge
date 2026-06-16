/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Determinism Doctrine — Phase 4: the deterministic MD simulator.
 *
 * This is NOT the old "Mock Simulator" (which walked the graph and logged a hardcoded
 * "0 warnings, 0 crash errors"). It actually EVALUATES cue logic against a small, honest
 * modeled state and reports true / false / **unknown** (tri-state, Kleene logic).
 *
 * The cardinal rule of this module is HONESTY OVER COVERAGE: if an expression references
 * anything we do not model (a game-object property like `player.money`, an `event.param`,
 * a list/string/lookup function, a dotted path), the result is `unknown` — we NEVER invent
 * an MD function's behavior to fill the gap. `unknown` is a first-class verdict, not a
 * failure. This is what keeps the simulator deterministic rather than a guesser.
 *
 * Scope (mirrors ROADMAP.md "PRIORITY A" — kept in lock-step):
 *   STATE we model: $variables (Map<name, Value>), cue states (waiting|active|complete).
 *   EXPRESSIONS we evaluate: comparisons {ge,gt,le,lt,eq,ne,==,!=,>=,<=,>,<} joined by
 *     and/or/not with parens, arithmetic +,-,*,/ on resolved numbers; operands are numeric
 *     /string/bool literals and $variables present in state.
 *   STATE EFFECTS we apply: set_value / add_value family (exact / min / operation add|subtract|…).
 *   CONTROL FLOW we follow: do_if/do_elseif/do_else guards, sub-cue recursion.
 *   OUT OF SCOPE → reported `unknown`: object properties & relations, event payloads,
 *     timers/delays, custom_xml internals, loop iteration counts, any unlisted MD function.
 *
 * A2 (the cue executor) builds on the A1 evaluator below.
 */

/* ============================================================================ *
 * A1 — Value model + tri-state expression evaluator
 * ============================================================================ */

/** A resolved scalar, or the honest `unknown` when an operand is outside our model. */
export type Value =
  | { kind: 'num'; n: number }
  | { kind: 'str'; s: string }
  | { kind: 'bool'; b: boolean }
  | { kind: 'unknown'; why?: string };

/** Tri-state boolean. `'unknown'` means "we cannot determine this deterministically". */
export type Tri = true | false | 'unknown';

/** Modeled variable store. Absent key ⇒ unmodeled ⇒ resolves to `unknown`. */
export type VarState = Map<string, Value>;

export const UNKNOWN = (why?: string): Value => ({ kind: 'unknown', why });
const NUM = (n: number): Value => ({ kind: 'num', n });
const STR = (s: string): Value => ({ kind: 'str', s });
const BOOL = (b: boolean): Value => ({ kind: 'bool', b });

const isUnknown = (v: Value): v is { kind: 'unknown'; why?: string } => v.kind === 'unknown';

/** Coerce a literal-ish string (from seed JSON or XML attr) into a Value. */
export function literalToValue(raw: unknown): Value {
  if (raw === null || raw === undefined) return UNKNOWN('null/undefined');
  if (typeof raw === 'number') return Number.isFinite(raw) ? NUM(raw) : UNKNOWN('non-finite');
  if (typeof raw === 'boolean') return BOOL(raw);
  const s = String(raw).trim();
  if (s === '') return UNKNOWN('empty');
  if (s === 'true') return BOOL(true);
  if (s === 'false') return BOOL(false);
  // pure numeric literal (int/float, optional sign)
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NUM(Number(s));
  // quoted string
  const q = s.match(/^'(.*)'$/) || s.match(/^"(.*)"$/);
  if (q) return STR(q[1]);
  // a seed value is a concrete datum, not an expression — a bare word is a string value.
  return STR(s);
}

/* ---- tokenizer ------------------------------------------------------------ */

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'var'; v: string }      // $name
  | { t: 'ident'; v: string }    // bare word: true/false, or an unmodeled path
  | { t: 'op'; v: string }       // arithmetic/comparison symbol or word-op
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'unknown'; v: string }; // opaque chunk (function call, dotted path) ⇒ unknown operand

const WORD_OPS = new Set(['and', 'or', 'not', 'ge', 'gt', 'le', 'lt', 'eq', 'ne']);

/** Tokenize; returns null if a character is wholly unrecognized (caller ⇒ unknown). */
function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    // strings
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) return null;
      toks.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    // parens
    if (c === '(') { toks.push({ t: 'lparen' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rparen' }); i++; continue; }
    // multi-char symbolic operators
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
      toks.push({ t: 'op', v: two }); i += 2; continue;
    }
    if (c === '>' || c === '<') { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '+' || c === '-' || c === '*' || c === '/') { toks.push({ t: 'op', v: c }); i++; continue; }
    // numbers
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      const numStr = src.slice(i, j);
      if (!/^\d*\.?\d+$|^\d+\.?\d*$/.test(numStr)) return null;
      toks.push({ t: 'num', v: Number(numStr) });
      i = j;
      continue;
    }
    // $variables and identifiers (which may be dotted paths / function calls)
    if (c === '$' || /[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_.]/.test(src[j])) j++;
      const word = src.slice(i, j);
      // function call? consume a balanced (...) and mark the whole thing opaque/unknown
      if (src[j] === '(') {
        let depth = 0, k = j;
        for (; k < n; k++) {
          if (src[k] === '(') depth++;
          else if (src[k] === ')') { depth--; if (depth === 0) { k++; break; } }
        }
        toks.push({ t: 'unknown', v: src.slice(i, k) });
        i = k;
        continue;
      }
      if (c === '$') { toks.push({ t: 'var', v: word }); i = j; continue; }
      const lower = word.toLowerCase();
      if (WORD_OPS.has(lower)) { toks.push({ t: 'op', v: lower }); i = j; continue; }
      if (lower === 'true' || lower === 'false') { toks.push({ t: 'ident', v: lower }); i = j; continue; }
      // dotted path or bare property (player.money, etc.) ⇒ opaque/unknown operand
      toks.push({ t: 'unknown', v: word }); i = j; continue;
    }
    // unrecognized character ⇒ bail
    return null;
  }
  return toks;
}

/* ---- parser (recursive descent) ------------------------------------------ *
 * Grammar (low→high precedence):
 *   or      := and ( 'or' and )*
 *   and     := not ( 'and' not )*
 *   not     := 'not' not | cmp
 *   cmp     := add ( CMPOP add )?
 *   add     := mul ( ('+'|'-') mul )*
 *   mul     := unary ( ('*'|'/') unary )*
 *   unary   := '-' unary | primary
 *   primary := num | str | bool | var | unknown | '(' or ')'
 */

type Node =
  | { k: 'lit'; v: Value }
  | { k: 'var'; name: string }
  | { k: 'unknown'; why: string }
  | { k: 'unary'; op: string; x: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'logic'; op: 'and' | 'or'; a: Node; b: Node }
  | { k: 'lognot'; x: Node };

const CMP_OPS = new Set(['ge', 'gt', 'le', 'lt', 'eq', 'ne', '==', '!=', '>=', '<=', '>', '<']);

function parse(toks: Tok[]): Node | null {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return t && t.t === 'op' && t.v === v; };

  function parseOr(): Node | null {
    let left = parseAnd();
    if (!left) return null;
    while (isOp('or')) { p++; const r = parseAnd(); if (!r) return null; left = { k: 'logic', op: 'or', a: left, b: r }; }
    return left;
  }
  function parseAnd(): Node | null {
    let left = parseNot();
    if (!left) return null;
    while (isOp('and')) { p++; const r = parseNot(); if (!r) return null; left = { k: 'logic', op: 'and', a: left, b: r }; }
    return left;
  }
  function parseNot(): Node | null {
    if (isOp('not')) { p++; const x = parseNot(); return x ? { k: 'lognot', x } : null; }
    return parseCmp();
  }
  function parseCmp(): Node | null {
    const left = parseAdd();
    if (!left) return null;
    const t = peek();
    if (t && t.t === 'op' && CMP_OPS.has(t.v)) { p++; const r = parseAdd(); if (!r) return null; return { k: 'bin', op: t.v, a: left, b: r }; }
    return left;
  }
  function parseAdd(): Node | null {
    let left = parseMul();
    if (!left) return null;
    while (isOp('+') || isOp('-')) { const op = (peek() as any).v; p++; const r = parseMul(); if (!r) return null; left = { k: 'bin', op, a: left, b: r }; }
    return left;
  }
  function parseMul(): Node | null {
    let left = parseUnary();
    if (!left) return null;
    while (isOp('*') || isOp('/')) { const op = (peek() as any).v; p++; const r = parseUnary(); if (!r) return null; left = { k: 'bin', op, a: left, b: r }; }
    return left;
  }
  function parseUnary(): Node | null {
    if (isOp('-')) { p++; const x = parseUnary(); return x ? { k: 'unary', op: '-', x } : null; }
    return parsePrimary();
  }
  function parsePrimary(): Node | null {
    const t = peek();
    if (!t) return null;
    if (t.t === 'lparen') { p++; const e = parseOr(); if (!e) return null; if (!peek() || peek().t !== 'rparen') return null; p++; return e; }
    if (t.t === 'num') { p++; return { k: 'lit', v: NUM(t.v) }; }
    if (t.t === 'str') { p++; return { k: 'lit', v: STR(t.v) }; }
    if (t.t === 'ident') { p++; return { k: 'lit', v: BOOL(t.v === 'true') }; }
    if (t.t === 'var') { p++; return { k: 'var', name: t.v }; }
    if (t.t === 'unknown') { p++; return { k: 'unknown', why: `unmodeled operand: ${t.v}` }; }
    return null;
  }

  const ast = parseOr();
  if (!ast || p !== toks.length) return null; // trailing garbage ⇒ honest unknown
  return ast;
}

/* ---- evaluator (tri-state Kleene logic) ----------------------------------- */

function evalNode(node: Node, vars: VarState): Value {
  switch (node.k) {
    case 'lit': return node.v;
    case 'unknown': return UNKNOWN(node.why);
    case 'var': {
      const v = vars.get(node.name);
      return v ?? UNKNOWN(`unmodeled variable: ${node.name}`);
    }
    case 'unary': {
      const x = evalNode(node.x, vars);
      if (isUnknown(x)) return x;
      if (x.kind === 'num') return NUM(-x.n);
      return UNKNOWN('unary - on non-number');
    }
    case 'bin': {
      const a = evalNode(node.a, vars);
      const b = evalNode(node.b, vars);
      // arithmetic
      if (['+', '-', '*', '/'].includes(node.op)) {
        if (isUnknown(a) || isUnknown(b)) return UNKNOWN('arithmetic on unknown');
        if (a.kind === 'num' && b.kind === 'num') {
          switch (node.op) {
            case '+': return NUM(a.n + b.n);
            case '-': return NUM(a.n - b.n);
            case '*': return NUM(a.n * b.n);
            case '/': return b.n === 0 ? UNKNOWN('division by zero') : NUM(a.n / b.n);
          }
        }
        return UNKNOWN('arithmetic on non-numbers');
      }
      // comparison
      if (isUnknown(a) || isUnknown(b)) return UNKNOWN('comparison with unknown');
      const cmp = compare(a, b, node.op);
      return cmp === 'unknown' ? UNKNOWN('incomparable operands') : BOOL(cmp);
    }
    case 'lognot': {
      const x = toTri(evalNode(node.x, vars));
      if (x === 'unknown') return UNKNOWN('not of unknown');
      return BOOL(!x);
    }
    case 'logic': {
      const a = toTri(evalNode(node.a, vars));
      const b = toTri(evalNode(node.b, vars));
      if (node.op === 'and') {
        if (a === false || b === false) return BOOL(false);   // Kleene: false dominates
        if (a === true && b === true) return BOOL(true);
        return UNKNOWN('and with unknown');
      } else {
        if (a === true || b === true) return BOOL(true);      // Kleene: true dominates
        if (a === false && b === false) return BOOL(false);
        return UNKNOWN('or with unknown');
      }
    }
  }
}

function compare(a: Value, b: Value, op: string): Tri {
  // numeric comparison
  if (a.kind === 'num' && b.kind === 'num') return applyCmp(a.n, b.n, op);
  // bool == / !=
  if (a.kind === 'bool' && b.kind === 'bool') {
    if (op === 'eq' || op === '==') return a.b === b.b;
    if (op === 'ne' || op === '!=') return a.b !== b.b;
    return 'unknown';
  }
  // string equality / ordering
  if (a.kind === 'str' && b.kind === 'str') {
    if (op === 'eq' || op === '==') return a.s === b.s;
    if (op === 'ne' || op === '!=') return a.s !== b.s;
    return applyCmp(a.s, b.s, op);
  }
  return 'unknown'; // mixed types ⇒ not deterministically comparable
}

function applyCmp(a: number | string, b: number | string, op: string): Tri {
  switch (op) {
    case 'gt': case '>': return a > b;
    case 'ge': case '>=': return a >= b;
    case 'lt': case '<': return a < b;
    case 'le': case '<=': return a <= b;
    case 'eq': case '==': return a === b;
    case 'ne': case '!=': return a !== b;
    default: return 'unknown';
  }
}

/** Coerce a Value to a tri-state for boolean context (e.g. a bare `$flag` or number). */
function toTri(v: Value): Tri {
  if (isUnknown(v)) return 'unknown';
  if (v.kind === 'bool') return v.b;
  if (v.kind === 'num') return v.n !== 0;     // MD truthiness: non-zero ⇒ true
  if (v.kind === 'str') return v.s.length > 0;
  return 'unknown';
}

/**
 * Evaluate an MD expression string to true / false / 'unknown'.
 * The PUBLIC entry-point of the A1 evaluator. Never throws; any parse failure or
 * unmodeled operand degrades honestly to 'unknown'.
 */
export function evaluateExpr(expr: string | undefined | null, vars: VarState): Tri {
  if (expr === undefined || expr === null) return 'unknown';
  const s = String(expr).trim();
  if (s === '') return 'unknown';
  const toks = tokenize(s);
  if (!toks || toks.length === 0) return 'unknown';
  const ast = parse(toks);
  if (!ast) return 'unknown';
  return toTri(evalNode(ast, vars));
}

/** Evaluate an expression to a resolved Value (used by set_value effects). */
export function evaluateValue(expr: string | undefined | null, vars: VarState): Value {
  if (expr === undefined || expr === null) return UNKNOWN('no expr');
  const s = String(expr).trim();
  if (s === '') return UNKNOWN('empty expr');
  const toks = tokenize(s);
  if (!toks || toks.length === 0) return UNKNOWN('untokenizable');
  const ast = parse(toks);
  if (!ast) return UNKNOWN('unparseable');
  return evalNode(ast, vars);
}

/* ============================================================================ *
 * A2 — the cue executor
 *
 * Walks cues (roots → sub-cues), evaluates trigger conditions, walks the flat
 * out_act→out_next action chain applying set_value effects, evaluates do_if/do_while
 * guards, and emits a per-step trace + static reachability findings.
 *
 * HONESTY BOUNDARY (documented in `limitations`): Forge's graph encodes the action
 * chain as a FLAT sibling list — a do_if's body is not structurally distinct from the
 * actions that follow the branch. So once a guard that is NOT provably-true appears,
 * we conservatively TAINT subsequent variable writes to `unknown` rather than assert a
 * value that might not actually have been set. Over-tainting errs toward `unknown`
 * (the safe direction) and never toward a fabricated assertion. Cue *trigger* conditions
 * live in the structurally-clean <conditions> block and are evaluated precisely.
 * ============================================================================ */

import type { MDNode, MDLink } from '../types';
import { triggerNodesOf } from './mdExplain';
import { isContainerTag } from './portSemantics';

const PORT_SUB = 'out_sub';

export type SimRole = 'cue' | 'trigger' | 'action';
export type SimVerdict =
  | 'fires'        // cue/trigger: assumed to fire (event) or conditions hold
  | 'never'        // cue: a required condition is provably false ⇒ never fires
  | 'ran'          // action: definitely reached & applied
  | 'skipped'      // guard provably false ⇒ branch body never runs
  | 'conditional'  // runs only if a non-asserted guard holds (effect not asserted)
  | 'unknown';     // depends on unmodeled runtime state

export interface SimStep {
  nodeId: string;
  label: string;
  xmlTag: string;
  role: SimRole;
  depth: number;
  verdict: SimVerdict;
  detail: string;
  /** For conditions/guards: the tri-state result of the evaluated expression. */
  condition?: Tri;
  /** Running variable snapshot AFTER this step (name → printable value). */
  vars?: { name: string; value: string }[];
}

export interface SimFinding {
  kind: 'never_satisfiable_cue' | 'dead_branch_guard' | 'unreachable_subcue';
  severity: 'error' | 'warning';
  nodeId: string;
  message: string;
}

export interface SimResult {
  trace: SimStep[];
  findings: SimFinding[];
  finalState: { name: string; value: string }[];
  limitations: string[];
  coverage: {
    cues: number;
    conditionsEvaluated: number;
    conditionsUnknown: number;
    actionsWalked: number;
    effectsApplied: number;
  };
}

function valueToString(v: Value): string {
  switch (v.kind) {
    case 'num': return String(v.n);
    case 'str': return `"${v.s}"`;
    case 'bool': return String(v.b);
    case 'unknown': return 'unknown';
  }
}

function labelOf(n: MDNode): string {
  return (n.properties?.name && String(n.properties.name).trim()) || n.label || n.id;
}

function snapshot(vars: VarState): { name: string; value: string }[] {
  return [...vars.entries()].map(([name, v]) => ({ name, value: valueToString(v) }));
}

const GUARD_TAGS = new Set(['do_if', 'do_elseif', 'do_while']);

function subCuesOf(cueId: string, nodeById: Map<string, MDNode>, links: MDLink[]): MDNode[] {
  return links
    .filter((l) => l.sourceNodeId === cueId && l.sourcePortId === PORT_SUB)
    .map((l) => nodeById.get(l.targetNodeId))
    .filter((n): n is MDNode => !!n && n.type === 'cue');
}

/**
 * Apply a set_value-family action to the running state.
 * `tainted` = a non-asserted guard preceded this in the chain ⇒ we cannot assert the
 * write happened, so we record the target as `unknown` instead of a definite value.
 * Returns the resolved Value we *would* assign (for the trace detail), or null if not a writer.
 */
function applyValueEffect(node: MDNode, vars: VarState, tainted: boolean): { name: string; assigned: Value } | null {
  const tag = node.xmlTag;
  if (tag !== 'set_value' && tag !== 'add_value') return null;
  const name = node.properties?.name ? String(node.properties.name).trim() : '';
  if (!name) return null;

  const op = String(node.properties?.operation || (tag === 'add_value' ? 'add' : '')).toLowerCase();
  const exact = node.properties?.exact;
  const hasRange = node.properties?.min !== undefined; // min/max ⇒ nondeterministic pick

  let assigned: Value;
  if (hasRange) {
    assigned = UNKNOWN('random range pick (min/max)');
  } else if (op === 'add' || op === 'subtract' || op === 'multiply' || op === 'divide') {
    const cur = vars.get(name) ?? UNKNOWN('unmodeled variable');
    const operand = evaluateValue(exact === undefined ? undefined : String(exact), vars);
    if (cur.kind === 'num' && operand.kind === 'num') {
      const n = op === 'add' ? cur.n + operand.n
        : op === 'subtract' ? cur.n - operand.n
        : op === 'multiply' ? cur.n * operand.n
        : (operand.n === 0 ? NaN : cur.n / operand.n);
      assigned = Number.isFinite(n) ? NUM(n) : UNKNOWN('non-finite result');
    } else {
      assigned = UNKNOWN(`${op} on unresolved operand`);
    }
  } else {
    // plain assignment to `exact`
    assigned = exact === undefined ? UNKNOWN('no exact value') : evaluateValue(String(exact), vars);
  }

  // honesty: under a non-asserted guard we cannot claim the write occurred
  vars.set(name, tainted ? UNKNOWN('conditional write (flat-chain branch)') : assigned);
  return { name, assigned };
}

/**
 * Simulate a workspace deterministically. `seed` pre-loads known variable values
 * (e.g. { "$threat": 5 }); anything unseeded resolves to `unknown`.
 */
export function simulateWorkspace(
  nodes: MDNode[],
  links: MDLink[],
  seed: Record<string, unknown> = {},
): SimResult {
  nodes = Array.isArray(nodes) ? nodes.filter((n) => n && n.includeInBuild !== false) : [];
  links = Array.isArray(links) ? links : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const cues = nodes.filter((n) => n.type === 'cue');

  const subTargets = new Set(links.filter((l) => l.sourcePortId === PORT_SUB).map((l) => l.targetNodeId));
  const rootCues = cues.filter((c) => !subTargets.has(c.id));

  const vars: VarState = new Map();
  for (const [k, v] of Object.entries(seed || {})) vars.set(k.startsWith('$') ? k : `$${k}`, literalToValue(v));

  const trace: SimStep[] = [];
  const findings: SimFinding[] = [];
  let conditionsEvaluated = 0, conditionsUnknown = 0, actionsWalked = 0, effectsApplied = 0;

  const evalCueTrigger = (cue: MDNode, depth: number): SimVerdict => {
    const triggers = triggerNodesOf(cue.id, nodeById, links);
    let neverFalseCondId = '';
    let anyUnknown = false;
    for (const t of triggers) {
      const isCheck = t.xmlTag === 'check_value' || t.type === 'condition';
      if (isCheck) {
        const expr = t.properties?.value;
        const res = evaluateExpr(expr === undefined ? undefined : String(expr), vars);
        conditionsEvaluated++;
        if (res === 'unknown') { conditionsUnknown++; anyUnknown = true; }
        if (res === false) neverFalseCondId = t.id;
        trace.push({
          nodeId: t.id, label: labelOf(t), xmlTag: t.xmlTag, role: 'trigger', depth: depth + 1,
          verdict: res === true ? 'fires' : res === false ? 'never' : 'unknown',
          condition: res,
          detail: `Condition "${expr ?? '(unset)'}" ⇒ ${res === 'unknown' ? 'UNKNOWN (depends on runtime/unmodeled state)' : String(res).toUpperCase()}`,
        });
      } else {
        // event = runtime trigger; assumed to fire when we simulate the cue
        trace.push({
          nodeId: t.id, label: labelOf(t), xmlTag: t.xmlTag, role: 'trigger', depth: depth + 1,
          verdict: 'fires',
          detail: `Runtime event <${t.xmlTag}> — assumed to fire when simulating this cue (its payload is unmodeled).`,
        });
      }
    }
    if (neverFalseCondId) {
      findings.push({
        kind: 'never_satisfiable_cue', severity: 'error', nodeId: cue.id,
        message: `Cue "${labelOf(cue)}" can never fire under the current seed: a required check_value condition is provably false.`,
      });
      return 'never';
    }
    if (anyUnknown) return 'unknown';
    return 'fires';
  };

  const walkCue = (cue: MDNode, depth: number, parentReachable: boolean) => {
    const cueStep: SimStep = {
      nodeId: cue.id, label: labelOf(cue), xmlTag: cue.xmlTag, role: 'cue', depth,
      verdict: parentReachable ? 'ran' : 'unknown',
      detail: parentReachable ? `Evaluating cue "${labelOf(cue)}".` : `Cue "${labelOf(cue)}" (parent cue may not fire).`,
    };
    trace.push(cueStep);

    const triggerVerdict = evalCueTrigger(cue, depth);
    cueStep.verdict = triggerVerdict === 'never' ? 'never' : (parentReachable ? (triggerVerdict === 'fires' ? 'fires' : 'unknown') : 'unknown');
    const cueFires = triggerVerdict !== 'never' && parentReachable;

    // Action walk with PRECISE branch gating. A control-flow container gates its
    // out_body chain by the guard; its out_next SIBLINGS continue at the PARENT gate
    // (untainted) — that is the precision the port-semantics layer buys. A legacy
    // container with no out_body falls back to the old conservative flat taint, so
    // imported graphs behave exactly as before.
    type Gate = 'run' | 'skip' | 'cond';
    const nextOf = (n: MDNode): MDNode | undefined => {
      const nl = links.find((l) => l.sourceNodeId === n.id && l.sourcePortId === 'out_next');
      return nl ? nodeById.get(nl.targetNodeId) : undefined;
    };
    const walkActions = (startId: string | undefined, gate: Gate, seen: Set<string>) => {
      let node = startId ? nodeById.get(startId) : undefined;
      // if/else-if/else chain state, so the branches are MUTUALLY EXCLUSIVE:
      //   'none' not in a chain · 'no' nothing matched yet · 'yes' a branch already won
      //   · 'maybe' a prior guard was unknown so we can't tell if one matched.
      let group: 'none' | 'no' | 'yes' | 'maybe' = 'none';
      while (node && !seen.has(node.id)) {
        seen.add(node.id);
        actionsWalked++;
        const a = node;
        const tag = a.xmlTag;
        // a chain only continues through consecutive do_elseif/do_else; anything else ends it
        if (tag !== 'do_elseif' && tag !== 'do_else') group = 'none';

        if (isContainerTag(tag)) {
          const isElse = tag === 'do_else';
          const isLoop = tag === 'do_while' || tag === 'do_for_each';
          const isGuarded = GUARD_TAGS.has(tag); // do_if / do_elseif / do_while carry a value
          const expr = a.properties?.value;
          let guard: Tri = 'unknown';
          if (isGuarded) {
            guard = evaluateExpr(expr === undefined ? undefined : String(expr), vars);
            conditionsEvaluated++;
            if (guard === 'unknown') conditionsUnknown++;
          }

          let bodyGate: Gate;
          let liveDead = false; // does a provably-false guard HERE mean dead code?
          if (isLoop) {
            bodyGate = gate === 'skip' ? 'skip' : (isGuarded ? (guard === true ? 'run' : guard === false ? 'skip' : 'cond') : 'cond');
            liveDead = isGuarded && gate === 'run';
          } else if (gate === 'skip' || group === 'yes') {
            bodyGate = 'skip';                              // outer skip, or a prior branch already matched
          } else if (group === 'maybe') {
            bodyGate = 'cond';                              // a prior branch might have matched — undetermined
          } else {                                         // group 'no' / 'none' → this is the live branch under test
            bodyGate = isElse ? 'run' : (guard === true ? 'run' : guard === false ? 'skip' : 'cond');
            liveDead = !isElse && gate === 'run';
          }

          // advance the chain state for the next do_elseif/do_else
          if (!isLoop) {
            if (isElse) group = 'none';
            else if (group === 'no' || group === 'none') group = bodyGate === 'run' ? 'yes' : bodyGate === 'cond' ? 'maybe' : 'no';
            // group 'yes'/'maybe' are sticky until the chain ends
          }

          if (liveDead && guard === false) {
            findings.push({
              kind: 'dead_branch_guard', severity: 'warning', nodeId: a.id,
              message: `<${tag}> guard "${expr ?? ''}" is provably false under the current seed — its branch never runs (dead code).`,
            });
          }

          const verdict: SimVerdict = bodyGate === 'run' ? 'ran' : bodyGate === 'skip' ? 'skipped' : 'conditional';
          const detail = isLoop
            ? `<${tag}> loop — body ${bodyGate === 'skip' ? 'skipped' : bodyGate === 'run' ? 'runs (iteration count is runtime-dependent)' : 'conditional'}.`
            : isElse
              ? `<do_else> — ${bodyGate === 'run' ? 'all prior branches were false ⇒ runs' : bodyGate === 'skip' ? 'a prior branch already matched ⇒ skipped' : 'a prior branch is undetermined ⇒ conditional'}.`
              : `<${tag}> "${expr ?? ''}" ⇒ ${guard === 'unknown' ? 'UNKNOWN' : String(guard).toUpperCase()} (body ${bodyGate === 'run' ? 'runs' : bodyGate === 'skip' ? 'skipped (else-branch won, or guard false)' : 'conditional'})`;
          trace.push({
            nodeId: a.id, label: labelOf(a), xmlTag: tag, role: 'action', depth: depth + 1,
            verdict, condition: isGuarded ? guard : undefined, detail, vars: snapshot(vars),
          });

          const bodyFirst = links.find((l) => l.sourceNodeId === a.id && l.sourcePortId === 'out_body');
          if (bodyFirst) {
            walkActions(bodyFirst.targetNodeId, bodyGate, seen);  // gate the body
            node = nextOf(a);                                     // siblings keep PARENT gate
            continue;
          }
          // legacy flat container (no out_body): conservatively taint downstream siblings
          gate = gate === 'skip' ? 'skip' : (bodyGate === 'run' ? gate : 'cond');
          node = nextOf(a);
          continue;
        }

        // regular action
        if (gate === 'skip') {
          trace.push({
            nodeId: a.id, label: labelOf(a), xmlTag: tag, role: 'action', depth: depth + 1,
            verdict: 'skipped',
            detail: `<${tag}> is inside a branch that never runs under the current seed.`,
          });
          node = nextOf(a);
          continue;
        }
        const tainted = gate === 'cond';
        const eff = applyValueEffect(a, vars, tainted);
        if (eff) {
          effectsApplied++;
          trace.push({
            nodeId: a.id, label: labelOf(a), xmlTag: tag, role: 'action', depth: depth + 1,
            verdict: tainted ? 'conditional' : 'ran',
            detail: tainted
              ? `Would set ${eff.name} (conditional — under a branch whose guard isn't asserted, so ${eff.name} is now unknown).`
              : `Sets ${eff.name} = ${valueToString(eff.assigned)}.`,
            vars: snapshot(vars),
          });
        } else {
          trace.push({
            nodeId: a.id, label: labelOf(a), xmlTag: tag, role: 'action', depth: depth + 1,
            verdict: tainted ? 'conditional' : 'ran',
            detail: tainted ? `<${tag}> reached (conditional — may not run).` : `<${tag}> reached.`,
          });
        }
        node = nextOf(a);
      }
    };
    const firstActs = links.filter((l) => l.sourceNodeId === cue.id && l.sourcePortId === 'out_act');
    for (const fl of firstActs) walkActions(fl.targetNodeId, 'run', new Set<string>());

    // sub-cues
    for (const sub of subCuesOf(cue.id, nodeById, links)) {
      if (!cueFires) {
        findings.push({
          kind: 'unreachable_subcue', severity: 'warning', nodeId: sub.id,
          message: `Sub-cue "${labelOf(sub)}" is unreachable under the current seed: its parent "${labelOf(cue)}" never fires.`,
        });
      }
      walkCue(sub, depth + 1, cueFires);
    }
  };

  for (const root of rootCues) walkCue(root, 0, true);

  const limitations = [
    'Branch gating is PRECISE when a control-flow node wires its `out_body` port: a false guard skips only that body (siblings via `out_next` are unaffected), a true guard runs it, an unknown guard marks the body conditional. A legacy/imported control-flow node with no `out_body` falls back to the conservative flat behavior — downstream writes are tainted to `unknown` rather than asserted.',
    'Game-object properties, faction relations, event payloads, timers, custom_xml internals, and any unlisted MD function are out of scope and resolve to `unknown` (never guessed).',
    'Loop iteration counts (do_while / do_for_each) are not simulated — the body is treated as a conditional region.',
    'Findings only fire when state is sufficient to PROVE a result (e.g. a condition is false). With an empty seed most conditions are `unknown`, so the simulator reports no false positives.',
  ];

  return {
    trace,
    findings,
    finalState: snapshot(vars),
    limitations,
    coverage: { cues: cues.length, conditionsEvaluated, conditionsUnknown, actionsWalked, effectsApplied },
  };
}

/* ============================================================================ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * (A1 coverage; extended by A2.)
 * ============================================================================ */
export function runSimulateSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const S = (entries: Record<string, unknown> = {}): VarState => {
    const m: VarState = new Map();
    for (const [k, v] of Object.entries(entries)) m.set(k, literalToValue(v));
    return m;
  };

  // ---- literal + variable resolution ----
  ok('num_literal_cmp', evaluateExpr('3 ge 2', S()) === true);
  ok('num_literal_false', evaluateExpr('1 gt 5', S()) === false);
  ok('var_resolves', evaluateExpr('$threat ge 3', S({ $threat: 5 })) === true);
  ok('var_resolves_false', evaluateExpr('$threat ge 3', S({ $threat: 1 })) === false);
  ok('unmodeled_var_unknown', evaluateExpr('$threat ge 3', S()) === 'unknown');

  // ---- the cardinal honesty rule: unmodeled operands ⇒ unknown, never guessed ----
  ok('object_prop_unknown', evaluateExpr('player.money gt 1000', S()) === 'unknown');
  ok('function_call_unknown', evaluateExpr('$x eq getrandom(1, 5)', S({ $x: 3 })) === 'unknown');
  ok('event_param_unknown', evaluateExpr('event.param eq 1', S()) === 'unknown');

  // ---- arithmetic ----
  ok('arithmetic', evaluateExpr('$a + 2 ge 5', S({ $a: 4 })) === true);
  ok('arithmetic_mul', evaluateExpr('$a * 2 eq 8', S({ $a: 4 })) === true);
  ok('div_by_zero_unknown', evaluateExpr('$a / 0 gt 1', S({ $a: 4 })) === 'unknown');
  ok('arith_with_unknown', evaluateExpr('$a + $b gt 1', S({ $a: 4 })) === 'unknown');

  // ---- symbolic operators ----
  ok('symbolic_ge', evaluateExpr('$a >= 4', S({ $a: 4 })) === true);
  ok('symbolic_ne', evaluateExpr('$a != 4', S({ $a: 5 })) === true);
  ok('symbolic_eq_false', evaluateExpr('$a == 4', S({ $a: 5 })) === false);

  // ---- Kleene logic: false dominates AND, true dominates OR ----
  ok('and_false_dominates', evaluateExpr('1 gt 5 and $x eq 1', S()) === false); // unknown $x but AND-false
  ok('or_true_dominates', evaluateExpr('3 gt 1 or $x eq 1', S()) === true);     // unknown $x but OR-true
  ok('and_unknown', evaluateExpr('3 gt 1 and $x eq 1', S()) === 'unknown');
  ok('or_unknown', evaluateExpr('1 gt 5 or $x eq 1', S()) === 'unknown');
  ok('not_true', evaluateExpr('not 1 gt 5', S()) === true);
  ok('not_unknown', evaluateExpr('not $x', S()) === 'unknown');

  // ---- parentheses + precedence ----
  ok('parens', evaluateExpr('(1 gt 5 or 3 gt 1) and $a ge 2', S({ $a: 2 })) === true);
  ok('precedence', evaluateExpr('$a + 1 * 2 eq 6', S({ $a: 4 })) === true); // 4 + (1*2) = 6

  // ---- bare truthiness ----
  ok('bare_var_truthy', evaluateExpr('$flag', S({ $flag: true })) === true);
  ok('bare_num_truthy', evaluateExpr('$n', S({ $n: 0 })) === false);

  // ---- string equality ----
  ok('string_eq', evaluateExpr("$mode eq 'hard'", S({ $mode: 'hard' })) === true);
  ok('string_ne', evaluateExpr("$mode ne 'hard'", S({ $mode: 'easy' })) === true);

  // ---- evaluateValue (for set_value effects) ----
  ok('value_arith', (() => { const v = evaluateValue('$a + 3', S({ $a: 4 })); return v.kind === 'num' && v.n === 7; })());
  ok('value_unknown', evaluateValue('player.money', S()).kind === 'unknown');

  // ---- degrade honestly, never throw ----
  ok('garbage_unknown', evaluateExpr('>>>=== ((', S()) === 'unknown');
  ok('empty_unknown', evaluateExpr('', S()) === 'unknown');

  /* ---- A2: cue executor ---- */
  const N = (id: string, type: any, xmlTag: string, properties: any = {}): MDNode =>
    ({ id, type, xmlTag, properties, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] } as any);
  const L = (id: string, s: string, sp: string, t: string, tp = 'in'): MDLink =>
    ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

  // linear cue: event trigger + set_value chain ⇒ precise state tracking
  {
    const nodes = [
      N('c1', 'cue', 'cue', { name: 'Setup' }),
      N('ev', 'event', 'event_game_started', {}),
      N('s1', 'action', 'set_value', { name: '$tier', exact: '2' }),
      N('s2', 'action', 'set_value', { name: '$tier', operation: 'add', exact: '3' }),
    ];
    const links = [
      L('lc', 'c1', 'out_cond', 'ev', 'in_cond'),
      L('la', 'c1', 'out_act', 's1', 'in_act'),
      L('ln', 's1', 'out_next', 's2', 'in_act'),
    ];
    const r = simulateWorkspace(nodes, links);
    ok('exec_event_fires', r.trace.some((s) => s.role === 'trigger' && s.verdict === 'fires'));
    ok('exec_setvalue_tracked', r.finalState.find((v) => v.name === '$tier')?.value === '5', r.finalState);
    ok('exec_effects_counted', r.coverage.effectsApplied === 2, r.coverage);
    ok('exec_no_false_findings', r.findings.length === 0, r.findings);
  }

  // never-satisfiable cue: a provably-false check_value ⇒ finding + sub-cue unreachable
  {
    const nodes = [
      N('p', 'cue', 'cue', { name: 'Gate' }),
      N('chk', 'condition', 'check_value', { value: '$tier ge 10' }),
      N('sub', 'cue', 'cue', { name: 'Child' }),
    ];
    const links = [
      L('lc', 'p', 'out_cond', 'chk', 'in_cond'),
      L('ls', 'p', 'out_sub', 'sub', 'in_flow'),
    ];
    const r = simulateWorkspace(nodes, links, { $tier: 2 });
    ok('exec_never_satisfiable', r.findings.some((f) => f.kind === 'never_satisfiable_cue' && f.nodeId === 'p'), r.findings);
    ok('exec_unreachable_subcue', r.findings.some((f) => f.kind === 'unreachable_subcue' && f.nodeId === 'sub'), r.findings);
    ok('exec_cue_verdict_never', r.trace.find((s) => s.nodeId === 'p')?.verdict === 'never');
  }

  // empty seed ⇒ unknown condition ⇒ NO false positive finding (honesty)
  {
    const nodes = [
      N('p', 'cue', 'cue', { name: 'Gate' }),
      N('chk', 'condition', 'check_value', { value: '$tier ge 10' }),
    ];
    const links = [L('lc', 'p', 'out_cond', 'chk', 'in_cond')];
    const r = simulateWorkspace(nodes, links); // no seed
    ok('exec_unknown_no_finding', r.findings.length === 0 && r.coverage.conditionsUnknown === 1, { f: r.findings, c: r.coverage });
  }

  // dead branch: do_if guard provably false ⇒ dead_branch_guard + downstream write tainted to unknown
  {
    const nodes = [
      N('c', 'cue', 'cue', { name: 'C' }),
      N('g', 'action', 'do_if', { value: '1 gt 5' }),
      N('w', 'action', 'set_value', { name: '$flag', exact: '1' }),
    ];
    const links = [
      L('la', 'c', 'out_act', 'g', 'in_act'),
      L('ln', 'g', 'out_next', 'w', 'in_act'),
    ];
    const r = simulateWorkspace(nodes, links);
    ok('exec_dead_branch', r.findings.some((f) => f.kind === 'dead_branch_guard' && f.nodeId === 'g'), r.findings);
    ok('exec_guard_skipped', r.trace.find((s) => s.nodeId === 'g')?.verdict === 'skipped');
    ok('exec_tainted_write_unknown', r.finalState.find((v) => v.name === '$flag')?.value === 'unknown', r.finalState);
  }

  // unconditional script (no guards) tracks state precisely; provably-true guard does NOT taint
  {
    const nodes = [
      N('c', 'cue', 'cue', { name: 'C' }),
      N('g', 'action', 'do_if', { value: '3 gt 1' }),
      N('w', 'action', 'set_value', { name: '$x', exact: '9' }),
    ];
    const links = [
      L('la', 'c', 'out_act', 'g', 'in_act'),
      L('ln', 'g', 'out_next', 'w', 'in_act'),
    ];
    const r = simulateWorkspace(nodes, links);
    ok('exec_true_guard_no_taint', r.finalState.find((v) => v.name === '$x')?.value === '9', r.finalState);
    ok('exec_limitations_present', r.limitations.length >= 3);
  }

  /* ---- P1-D4: PRECISE branch gating via out_body (the payoff) ---- */
  // false guard + out_body: body is SKIPPED (its write never happens), but the
  // out_next SIBLING stays DEFINITE — siblings are no longer tainted by the branch.
  {
    const nodes = [
      N('c', 'cue', 'cue', { name: 'C' }),
      N('g', 'action', 'do_if', { value: '1 gt 5' }),     // provably false
      N('bw', 'action', 'set_value', { name: '$bodyflag', exact: '1' }), // inside branch
      N('sw', 'action', 'set_value', { name: '$sib', exact: '7' }),      // sibling AFTER branch
    ];
    const links = [
      L('la', 'c', 'out_act', 'g', 'in_act'),
      L('lb', 'g', 'out_body', 'bw', 'in_act'),
      L('ln', 'g', 'out_next', 'sw', 'in_act'),
    ];
    const r = simulateWorkspace(nodes, links);
    ok('precise_skip_body', r.trace.find((s) => s.nodeId === 'bw')?.verdict === 'skipped', r.trace.find((s) => s.nodeId === 'bw'));
    ok('precise_body_var_unset', !r.finalState.some((v) => v.name === '$bodyflag'), r.finalState);
    ok('precise_sibling_definite', r.finalState.find((v) => v.name === '$sib')?.value === '7', r.finalState); // KEY: sibling NOT tainted
    ok('precise_dead_branch_finding', r.findings.some((f) => f.kind === 'dead_branch_guard' && f.nodeId === 'g'));
  }
  // true guard + out_body: body RUNS and its write is definite.
  {
    const nodes = [
      N('c', 'cue', 'cue', { name: 'C' }),
      N('g', 'action', 'do_if', { value: '3 gt 1' }),     // provably true
      N('bw', 'action', 'set_value', { name: '$bodyflag', exact: '1' }),
    ];
    const links = [
      L('la', 'c', 'out_act', 'g', 'in_act'),
      L('lb', 'g', 'out_body', 'bw', 'in_act'),
    ];
    const r = simulateWorkspace(nodes, links);
    ok('precise_run_body', r.finalState.find((v) => v.name === '$bodyflag')?.value === '1', r.finalState);
    ok('precise_run_verdict', r.trace.find((s) => s.nodeId === 'g')?.verdict === 'ran');
  }
  // unknown guard + out_body: body is CONDITIONAL (its write ⇒ unknown), but the
  // sibling AFTER the branch is still DEFINITE. This is the whole point of the layer.
  {
    const nodes = [
      N('c', 'cue', 'cue', { name: 'C' }),
      N('g', 'action', 'do_if', { value: '$u ge 1' }),    // unmodeled ⇒ unknown
      N('bw', 'action', 'set_value', { name: '$bodyflag', exact: '1' }),
      N('sw', 'action', 'set_value', { name: '$sib', exact: '7' }),
    ];
    const links = [
      L('la', 'c', 'out_act', 'g', 'in_act'),
      L('lb', 'g', 'out_body', 'bw', 'in_act'),
      L('ln', 'g', 'out_next', 'sw', 'in_act'),
    ];
    const r = simulateWorkspace(nodes, links); // no seed ⇒ $u unknown
    ok('precise_cond_body_unknown', r.finalState.find((v) => v.name === '$bodyflag')?.value === 'unknown', r.finalState);
    ok('precise_cond_sibling_definite', r.finalState.find((v) => v.name === '$sib')?.value === '7', r.finalState); // KEY
    ok('precise_cond_no_dead_finding', !r.findings.some((f) => f.kind === 'dead_branch_guard'), r.findings); // unknown ≠ dead
  }

  /* ---- if / else-if / else are MUTUALLY EXCLUSIVE (only one branch runs) ---- */
  // build: cue → do_if(g1)[body $a=1] → do_elseif(g2)[body $b=2] → do_else[body $c=3]
  const ifChain = (g1: string, g2: string) => {
    const nodes = [
      N('c', 'cue', 'cue', { name: 'C' }),
      N('i', 'action', 'do_if', { value: g1 }),
      N('ba', 'action', 'set_value', { name: '$a', exact: '1' }),
      N('e', 'action', 'do_elseif', { value: g2 }),
      N('bb', 'action', 'set_value', { name: '$b', exact: '2' }),
      N('z', 'action', 'do_else', {}),
      N('bc', 'action', 'set_value', { name: '$c', exact: '3' }),
    ];
    const links = [
      L('la', 'c', 'out_act', 'i', 'in_act'),
      L('l1', 'i', 'out_body', 'ba', 'in_act'),
      L('l2', 'i', 'out_next', 'e', 'in_act'),
      L('l3', 'e', 'out_body', 'bb', 'in_act'),
      L('l4', 'e', 'out_next', 'z', 'in_act'),
      L('l5', 'z', 'out_body', 'bc', 'in_act'),
    ];
    return simulateWorkspace(nodes, links);
  };
  const vd = (r: any, id: string) => r.trace.find((s: any) => s.nodeId === id)?.verdict;
  const fs = (r: any, name: string) => r.finalState.find((v: any) => v.name === name)?.value;
  {
    // if TRUE ⇒ only the if-body runs; elseif & else are skipped even though g2 is also true
    const r = ifChain('3 gt 1', '3 gt 1');
    ok('chain_if_wins_verdicts', vd(r, 'i') === 'ran' && vd(r, 'e') === 'skipped' && vd(r, 'z') === 'skipped', r.trace.map((s:any)=>s.nodeId+':'+s.verdict));
    ok('chain_if_wins_state', fs(r, '$a') === '1' && !r.finalState.some((v:any)=>v.name==='$b') && !r.finalState.some((v:any)=>v.name==='$c'), r.finalState);
  }
  {
    // if FALSE, elseif TRUE ⇒ only the elseif-body runs
    const r = ifChain('1 gt 5', '3 gt 1');
    ok('chain_elseif_wins', vd(r, 'i') === 'skipped' && vd(r, 'e') === 'ran' && vd(r, 'z') === 'skipped' && fs(r, '$b') === '2', r.trace.map((s:any)=>s.nodeId+':'+s.verdict));
  }
  {
    // if FALSE, elseif FALSE ⇒ the else-body runs
    const r = ifChain('1 gt 5', '1 gt 5');
    ok('chain_else_wins', vd(r, 'z') === 'ran' && fs(r, '$c') === '3', r.trace.map((s:any)=>s.nodeId+':'+s.verdict));
  }
  {
    // if UNKNOWN ⇒ the whole chain is undetermined (every branch conditional, nothing asserted)
    const r = ifChain('$u ge 1', '3 gt 1');
    ok('chain_unknown_all_conditional', vd(r, 'i') === 'conditional' && vd(r, 'e') === 'conditional' && vd(r, 'z') === 'conditional', r.trace.map((s:any)=>s.nodeId+':'+s.verdict));
    ok('chain_unknown_no_dead', !r.findings.some((f:any)=>f.kind==='dead_branch_guard'), r.findings);
  }

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
