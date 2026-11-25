/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MD pitfall lints — the failure-corpus lints from the 2026-06-25 ACTUATION bug-hunt
 * and ROADMAP item #4 (offer-accept), GROUNDED against the full vanilla md/ corpus
 * (unpacked 9.00) before shipping. Grounding results (2026-07-08):
 *
 *  SHIPPED (0 vanilla false positives):
 *   1. `md_pitfall.ui_listener_one_shot` — a ROOT-level cue listening for
 *      <event_ui_triggered> without instantiate="true", never reset/cancelled anywhere
 *      (incl. keyword self-resets in its own subtree), fires ONCE then completes
 *      forever. Vanilla count of this exact shape: 0/516. (The broad "any event_*
 *      without instantiate" form was FALSIFIED: vanilla does it 6321/8456 times —
 *      one-shot listeners are a normal idiom. Do not widen this lint.)
 *   2. `md_pitfall.offer_accepted_keyword_cue` — <event_offer_accepted cue="parent|
 *      this|static"> validates clean but NEVER FIRES in-game (proven in x4_ai_influence
 *      2026-07-01; kuertee_emergent_missions_escort.xml:325 "event_offer_accepted
 *      doesn't work"). Vanilla uses the variable idiom exclusively (0 keyword uses).
 *      Suggests the proven pattern: <event_object_signalled object="$Client"
 *      param="'accept'"/> or the $OfferCue variable form.
 *   3. `md_pitfall.param3_table_barekey` — `$x = event.param3` (a Lua table from
 *      AddUITriggeredEvent) followed by `$x.barekey` where `barekey` is NOT a known
 *      script property: that's a PROPERTY lookup (almost always nonexistent → branch
 *      silently skips); the author meant `$x.$barekey`. Union-aware: vanilla's 6
 *      `$x.<ident>` uses after param3 are all REAL properties (count, buildobject,
 *      roleobject, …) and pass. (This was THE silent killer of the 2026-06-25 hunt.)
 *   4. `md_pitfall.cancel_conversation_actor_or_template` — X4 emits a startup/load ERROR when
 *      <cancel_conversation> has neither actor nor template, even though common.xsd leaves each
 *      attribute individually optional. This is a blocking runtime-semantic check, not an XSD rule.
 *
 *  FALSIFIED BY GROUNDING (deliberately NOT shipped — recorded so nobody re-adds them):
 *   - "event_* handler without instantiate → warn" (6321 vanilla uses).
 *   - "instantiated cue setting $vars without namespace='this' → warn" (1345 vanilla uses).
 *
 * House pattern: pure engine + oracle + public GET. xmldom for cue-tree structure.
 */

import { DOMParser, normalizeLineEndings, type Attr, type Document, type Element } from '@xmldom/xmldom';
import { lintMdExpressionRules, type MdExpressionFinding } from './expressionAst';
import { isScriptExpressionRole } from '../../shared/scriptExpressionRole';
import { analyzeMdCueTrigger, classifyCueRef, mdConditionKind } from './cueLineage';
import { maskNonExpressionSpans, type ScriptPropertyIndex } from './scriptProperties';
import { assertXmlInputWithinLimits } from './xmlInputLimits';
import type { SchemaIndex } from './xsdValidate';
import type { DiffElementProvenance, DiffElementState } from './diffSimulator';
import { MD_INITIAL_STATE_COVERAGE_CHECK, type MdInitialStateCause, type MdInitialStateSample, type ValidationCoverageGap } from './validationEvidence';

export interface MdPitfallFinding {
  code: 'md_pitfall.products_existence' | 'md_pitfall.cancel_conversation_actor_or_template' | 'md_pitfall.ui_listener_one_shot'
    | 'md_pitfall.destroyed_event_source_required'
    | 'md_pitfall.offer_accepted_keyword_cue' | 'md_pitfall.param3_table_barekey' | 'md_pitfall.return_context'
    | 'md_pitfall.numeric_time_value' | 'md_pitfall.no_event_condition' | 'md_pitfall.illegal_instantiate'
    | 'md_pitfall.variable_read_after_removal' | 'md_pitfall.variable_read_when_absent'
    | 'md_pitfall.variable_read_before_initialization'
    | 'md_pitfall.raw_engine_id_in_player_text'
    | 'md_pitfall.order_cancelled_override_suspension'
    | MdExpressionFinding['code'];
  severity: 'error' | 'warning' | 'info';
  cue?: string;
  filePath?: string;
  line?: number;
  column?: number;
  sourceRef?: string;
  detail: string;
}

import { directElementChildren, type ElementLike } from './xmlLite';

function lineOf(haystack: string, needleIndex: number): number {
  return haystack.slice(0, Math.max(0, needleIndex)).split('\n').length;
}

/** The same actual attribute role governs direct scripts and effective diff writes. */
export function isScriptExpressionAttribute(elementName: string, attributeName: string, schema: SchemaIndex | null): boolean {
  return isScriptExpressionRole(elementName, attributeName, schema?.elements.get(elementName)?.attributes.get(attributeName));
}

/** Apply shared grammar rules using a caller-owned decoded-value source mapping. */
export function lintScriptExpressionValue(input: {
  elementName: string;
  attributeName: string;
  value: string;
  schema: SchemaIndex | null;
  filePath?: string;
  locate: (offset: number) => { line?: number; column?: number } | undefined;
}): MdPitfallFinding[] {
  if (!isScriptExpressionAttribute(input.elementName, input.attributeName, input.schema)) return [];
  return lintMdExpressionRules(input.value).flatMap(finding => {
    const position = input.locate(finding.offset);
    // An unavailable lexical mapping cannot manufacture an authored position.
    if (!position) return [];
    return [{
      code: finding.code, severity: finding.severity, filePath: input.filePath,
      sourceRef: `${input.elementName}/@${input.attributeName}`,
      ...position, detail: finding.message,
    }];
  });
}

/** Translate a decoded attribute offset to a one-based raw XML source position. */
function expressionLocation(source: string, lines: number[], attr: Attr, offset: number) {
  const fallback = { line: attr.lineNumber, column: attr.columnNumber };
  if (!attr.lineNumber || !attr.columnNumber) return fallback;
  let line = attr.lineNumber;
  const quoteAt = lines[line - 1] + attr.columnNumber - 1;
  const quote = source[quoteAt];
  if (quote !== '"' && quote !== "'") return fallback;
  const end = source.indexOf(quote, quoteAt + 1);
  const entity = /&(?:#(x[\da-f]+|\d+)|amp|apos|quot|lt|gt);/iy;
  let index = quoteAt + 1;
  for (let decoded = 0; decoded < offset && index < end; decoded++) {
    entity.lastIndex = index;
    const match = source[index] === '&' ? entity.exec(source) : null;
    if (match) {
      const numeric = match[1];
      const value = numeric?.startsWith('x') ? parseInt(numeric.slice(1), 16) : Number(numeric);
      if (value > 0xffff) decoded++;
      index = entity.lastIndex;
    } else {
      index++;
    }
  }
  if (index >= end) return fallback;
  while (lines[line] !== undefined && lines[line] <= index) line++;
  return { line, column: index - lines[line - 1] + 1 };
}

/** Validate expression-valued attributes in script files and their XML diff payloads. */
export function lintScriptExpressions(xml: string, schema: SchemaIndex | null, filePath?: string): MdPitfallFinding[] {
  if (!/\belse\b|[%{]|&#/.test(xml) && !(xml.includes('@') && xml.includes('?'))) return [];
  const source = normalizeLineEndings(xml.replace(/^\uFEFF/, ''));
  let invalid = false;
  let doc;
  try {
    assertXmlInputWithinLimits(source);
    doc = new DOMParser({ onError: () => { invalid = true; } }).parseFromString(source, 'text/xml');
  } catch { return []; }
  if (invalid || !['mdscript', 'aiscript', 'diff'].includes(doc.documentElement?.nodeName ?? '')) return [];

  const findings: MdPitfallFinding[] = [];
  const elements = doc.getElementsByTagName('*');
  let lines: number[] | undefined;
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      findings.push(...lintScriptExpressionValue({
        elementName: element.nodeName, attributeName: attr.name, value: attr.value, schema, filePath,
        locate: offset => {
          lines ??= [0, ...Array.from(source.matchAll(/\n/g), match => match.index + 1)];
          return expressionLocation(source, lines, attr, offset);
        },
      }));
    }
  }
  return findings;
}

/** Preserve source offsets while excluding markup-looking content that is not an element. */
function maskXmlDecoys(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, match => match.replace(/[^\r\n]/g, ' '));
}

/** Find real opening-tag offsets after comments and CDATA have been masked. */
function openingTagOffsets(xml: string, elementName: string): number[] {
  const masked = maskXmlDecoys(xml);
  const re = new RegExp(`<${elementName}(?=[\\s/>])`, 'g');
  const offsets: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(masked)) !== null) {
    let quote = '';
    let end = match.index + match[0].length;
    for (; end < masked.length; end++) {
      const ch = masked[end];
      if (quote) {
        if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
    }
    if (end < masked.length && !quote) offsets.push(match.index);
  }
  return offsets;
}

function hasXmlAttribute(element: ElementLike, name: string): boolean {
  const candidate = element as unknown as { hasAttribute?: (attributeName: string) => boolean };
  if (typeof candidate.hasAttribute === 'function') return candidate.hasAttribute(name);
  const openingTag = element.toString().match(/^<[^>]*>/s)?.[0] || '';
  return new RegExp(`\\b${name}\\s*=`, 'i').test(openingTag);
}

const UNITLESS_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)f?$/i;
const STORAGE = /^(?:([A-Za-z_]\w*|\$[A-Za-z_]\w*)\.)?(\$[A-Za-z_]\w*)$/;
const CONDITIONAL_ACTIONS = new Set(['do_if', 'do_elseif', 'do_else']);
// <signal_cue> dispatches only after the current cue actions complete (md.xsd:4282),
// whereas <signal_cue_instantly>, <reset_cue>, <cancel_cue>, and <include_actions> act inline.
const OPAQUE_OR_INLINE_ACTIONS = new Set(['opaque_effect', 'include_actions', 'signal_cue_instantly', 'reset_cue', 'cancel_cue']);

interface NumericFact {
  line?: number;
  inferred?: boolean;
}

function isStaticRootCue(node: Element | null, root: Element): boolean {
  return node?.tagName === 'cue' && node.parentElement?.tagName === 'cues'
    && node.parentElement.parentElement === root && !node.hasAttribute('ref')
    && (node.getAttribute('instantiate') === null || node.getAttribute('instantiate') === 'false');
}

// In ordinary cue actions, bare variables and namespace-qualified variables share one namespace.
const LOCAL_VARIABLE = /^(?:namespace\.)?(\$[A-Za-z_]\w*)$/;
const STRICT_LOCAL_OPERAND = String.raw`(?:namespace\.)?(\$[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)*`;
const STRICT_LOCAL_READ = new RegExp(`^${STRICT_LOCAL_OPERAND}$`);
const STRICT_ARITHMETIC_TOKEN = new RegExp(String.raw`\s+|${STRICT_LOCAL_OPERAND}|((?:\d+(?:\.\d+)?|\.\d+)[fF]?)|.`, 'gs');
const LOCAL_EXISTENCE_TEST = /^(not\s+)?(?:namespace\.)?(\$[A-Za-z_]\w*)\?$/;
const MAX_VARIABLE_BRANCH_DEPTH = 16;
type AbsenceReason = 'removal' | 'flow';

function strictLocalReads(value: string): { variable: string; offset: number }[] {
  const single = STRICT_LOCAL_READ.exec(value.trim());
  if (single) return [{ variable: single[1], offset: value.indexOf(single[0]) }];
  // Bound the work of repeatedly mapping operand offsets through the same raw XML attribute.
  if (!value.includes('$') || value.length > 4096) return [];

  const reads: { variable: string; offset: number }[] = [];
  let depth = 0;
  let needsOperand = true;
  // Accept a complete arithmetic expression. Unknown and conditional syntax can change which reads run.
  for (const match of value.matchAll(STRICT_ARITHMETIC_TOKEN)) {
    const [token, variable, number] = match;
    if (/^\s/.test(token)) continue;
    if (needsOperand) {
      if (token === '+' || token === '-') continue;
      if (token === '(') { depth += 1; continue; }
      if (!variable && !number) return [];
      needsOperand = false;
      if (variable) reads.push({ variable, offset: match.index });
    } else if (token === ')' && depth > 0) {
      depth -= 1;
    } else if (token.length === 1 && '+-*/%^'.includes(token)) {
      needsOperand = true;
    } else {
      return [];
    }
  }
  return needsOperand || depth !== 0 ? [] : reads;
}

export interface MdVariableAvailabilityInput { path: string; content?: string }
interface MdAvailabilityDestination { target?: string; variable?: string; initializes: boolean }
interface MdAvailabilityAction {
  order: number;
  destinations: readonly MdAvailabilityDestination[];
  opaque: boolean;
  knownDeclaration?: boolean;
  guaranteedOutputs?: readonly string[];
  unknownVariables: readonly string[];
  selfOrderingUnknown?: string;
}
interface MdAvailabilityCue {
  namespace: string;
  block: string;
  unavailable: boolean;
}
interface MdAvailabilityBlocks { readonly count: number; readonly last: Readonly<Record<string, number>> }
interface MdAvailabilityVariable { readonly writers: MdAvailabilityBlocks; readonly opaque: MdAvailabilityBlocks }
interface MdAvailabilityAuthority {
  readonly variables: Readonly<Record<string, MdAvailabilityVariable>>;
  readonly opaque: MdAvailabilityBlocks;
}
interface MdAvailabilityFile {
  source: string;
  cues: Readonly<Record<string, MdAvailabilityCue>>;
  actions: Readonly<Record<string, MdAvailabilityAction>>;
}
/** Immutable source facts only. Each lint call owns its separate forward-flow state. */
export interface MdVariableAvailabilityContext {
  readonly files: Readonly<Record<string, MdAvailabilityFile>>;
  readonly authority: Readonly<Record<string, MdAvailabilityAuthority>>;
  readonly global: MdAvailabilityAuthority;
  readonly scope: { readonly eligibleCues: number; readonly skippedCues: number; readonly indexedFacts: number; readonly limited: boolean };
}

const availabilityRecord = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const availabilityOwn = <T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
const availabilityOtherBlock = (index: MdAvailabilityBlocks | undefined, block: string) =>
  !!index && index.count > (availabilityOwn(index.last, block) === undefined ? 0 : 1);

const availabilityPath = (value: string) => value.replace(/\\/g, '/');
const availabilityNode = (node: Element) => `${node.lineNumber ?? 0}:${node.columnNumber ?? 0}:${node.tagName}`;
function availabilityCueKey(cue: Element): string {
  const names: string[] = [];
  for (let node: Element | null = cue; node; node = node.parentElement) {
    if (node.tagName === 'cue') names.unshift(node.getAttribute('name') ?? '');
  }
  return JSON.stringify(names);
}

const MD_INITIAL_STATE_REASONS: Readonly<Record<MdInitialStateCause, string>> = {
  ambiguous_cue: 'Unnamed or duplicate cue declarations leave script writer authority ambiguous.',
  ambiguous_script: 'Duplicate script names make exact remote writer destinations ambiguous.',
  analysis_budget: 'Project initial-state analysis reached its bounded derived-fact budget.',
  duplicate_file: 'Duplicate MD file identity leaves writer authority unavailable.',
  dynamic_destination: 'A dynamic or unresolved variable destination leaves possible writer authority unknown.',
  input_limit: 'Project MD writer analysis reached its bounded input-fact limit.',
  missing_source: 'MD source content is unavailable.',
  omitted_input: 'An authored MD file or its containing inventory was skipped before writer analysis.',
  omitted_paths_unlisted: 'Additional omitted MD paths exceeded the per-file coverage reporting limit.',
  self_update_order: 'Self-referential add/subtract RHS ordering is not established by the available engine evidence.',
  unknown_effect: 'An undeclared or foreign action/condition has unavailable writer effects.',
  unresolved_schema: 'An unresolved or open schema declaration leaves possible destination attributes unavailable.',
  unsupported_effect: 'An action has unsupported ordered effects; schema destinations are possible writers only.',
  unsupported_namespace: 'Library, instance, reference or unsupported cue namespace leaves local writer authority unavailable.',
  unusable_script: 'Malformed, patch-derived, foreign or unnamed MD script has unavailable writer authority.',
};
const MAX_INITIAL_STATE_SAMPLES = 2;
const MAX_INITIAL_STATE_READ_GAPS = 128;
const INITIAL_STATE_INPUT_FAILURES: ReadonlySet<MdInitialStateCause> = new Set([
  'ambiguous_cue', 'ambiguous_script', 'analysis_budget', 'duplicate_file', 'input_limit',
  'missing_source', 'omitted_input', 'omitted_paths_unlisted', 'unusable_script',
]);

function splitTopLevelMdSegments(raw: string): string[] {
  const value = raw.trim();
  if (!value) return [];
  const segments: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) { depth--; continue; }
    if (ch === '.' && depth === 0) {
      segments.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  segments.push(value.slice(start).trim());
  return segments;
}

function isSubMemberDestination(raw: string): boolean {
  const value = raw.trim();
  if (/^(?:namespace\.)?\$[A-Za-z_]\w*\.(?!\$[A-Za-z_]\w*$)/.test(value)) return true;
  const segments = splitTopLevelMdSegments(value);
  if (segments.length < 2) return false;
  const last = segments[segments.length - 1] ?? '';
  if (/^\$[A-Za-z_]\w*$/.test(last)) return false;
  return segments.slice(0, -1).some(segment => segment.startsWith('$'));
}

function extractGuaranteedExistenceVars(rawExpr: string): string[] {
  const collect = (raw: string, out: Set<string>): boolean => {
    let expr = raw.trim();
    if (!expr || (!expr.includes('?') && !expr.includes('@'))) return true;
    while (expr.startsWith('(') && expr.endsWith(')')) {
      let depth = 0;
      let quote = '';
      let encloses = true;
      for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (quote) {
          if (ch === '\\') { i++; continue; }
          if (ch === quote) quote = '';
          continue;
        }
        if (ch === "'" || ch === '"') { quote = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') {
          depth--;
          if (depth === 0 && i < expr.length - 1) { encloses = false; break; }
        }
      }
      if (!encloses || depth !== 0) break;
      expr = expr.slice(1, -1).trim();
    }
    if (!expr) return true;
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let quote = '';
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (quote) {
        if (ch === '\\') { i++; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
      if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) { depth--; continue; }
      if (depth === 0 && /[A-Za-z_]/.test(ch)) {
        const prev = i > 0 ? expr[i - 1] : '';
        if (/[A-Za-z0-9_.$]/.test(prev)) continue;
        let end = i + 1;
        while (end < expr.length && /\w/.test(expr[end])) end++;
        const next = end < expr.length ? expr[end] : '';
        if (next === '$') { i = end - 1; continue; }
        const word = expr.slice(i, end);
        const lower = word.toLowerCase();
        if (lower === 'or' || lower === 'if' || lower === 'then' || lower === 'else') return false;
        if (word === 'and') {
          parts.push(expr.slice(start, i).trim());
          start = end;
        }
        i = end - 1;
      }
    }
    parts.push(expr.slice(start).trim());
    for (const part of parts) {
      const direct = /^(?:(?:namespace\.)?(\$[A-Za-z_]\w*)\?|@(?:namespace\.)?(\$[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)*)$/.exec(part);
      const guarded = direct?.[1] ?? direct?.[2];
      if (guarded) {
        out.add(guarded);
        continue;
      }
      if (part.startsWith('(') && part.endsWith(')') && (part.includes('?') || part.includes('@'))) {
        const nested = new Set<string>();
        if (collect(part, nested)) for (const v of nested) out.add(v);
      }
    }
    return true;
  };
  const found = new Set<string>();
  return collect(rawExpr, found) ? [...found] : [];
}

function findGuaranteedLocalOutputs(action: Element): string[] {
  if (action.hasAttribute('chance')) return [];
  if (action.tagName === 'create_order' || action.tagName === 'create_trade_order') {
    const target = LOCAL_VARIABLE.exec(action.getAttribute('name')?.trim() || '')?.[1];
    return target ? [target] : [];
  }
  if (!/^find_/.test(action.tagName)) return [];
  const out = new Set<string>();
  const groupTarget = LOCAL_VARIABLE.exec(action.getAttribute('groupname')?.trim() || '')?.[1];
  if (groupTarget) out.add(groupTarget);
  const multiple = ['true', '1'].includes((action.getAttribute('multiple') ?? '').trim());
  const append = ['true', '1'].includes((action.getAttribute('append') ?? '').trim());
  if (multiple && !append) {
    for (const attr of ['name', 'result']) {
      const target = LOCAL_VARIABLE.exec(action.getAttribute(attr)?.trim() || '')?.[1];
      if (target) out.add(target);
    }
  }
  return [...out];
}

function containsValuelessReturnOrInlineAction(subtree: Element): boolean {
  for (const node of [subtree, ...Array.from(subtree.getElementsByTagName('*'))]) {
    if (node.namespaceURI || OPAQUE_OR_INLINE_ACTIONS.has(node.tagName)) return true;
    if (node.tagName === 'return' && !node.getAttribute('value')?.trim()) return true;
  }
  return false;
}

function doesLibraryGuaranteeReturnValue(container: Element, depth = 0): boolean {
  if (depth >= MAX_VARIABLE_BRANCH_DEPTH) return false;
  const children = Array.from(container.children);
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.namespaceURI || OPAQUE_OR_INLINE_ACTIONS.has(child.tagName)) return false;
    if (child.tagName === 'return') {
      if (!child.getAttribute('value')?.trim()) return false;
      if (!child.hasAttribute('chance')) return true;
      continue;
    }
    if (child.tagName === 'do_if') {
      let after = i + 1;
      while (['do_elseif', 'do_else'].includes(children[after]?.tagName)) after++;
      const arms = children.slice(i, after);
      i = after - 1;
      if (arms.some(arm => containsValuelessReturnOrInlineAction(arm))) return false;
      const lastArm = arms[arms.length - 1];
      const unconditionalElse = lastArm?.tagName === 'do_else' && !lastArm.namespaceURI
        && !arms.some(arm => arm.hasAttribute('chance'));
      if (unconditionalElse && arms.every(arm => doesLibraryGuaranteeReturnValue(arm, depth + 1))) {
        return true;
      }
      continue;
    }
    if (containsValuelessReturnOrInlineAction(child)) return false;
  }
  return false;
}

/** Build possible-writer authority, not an assertion that entry state is empty. */
export function buildMdVariableAvailabilityContext(
  files: readonly MdVariableAvailabilityInput[], schema: SchemaIndex | null,
  omissions: { paths: readonly string[]; additionalCount: number } = { paths: [], additionalCount: 0 },
): { context: MdVariableAvailabilityContext; coverageGaps: ValidationCoverageGap[]; inputGaps: ValidationCoverageGap[] } {
  type Cause = { code: MdInitialStateCause; count: number; locatedCount: number; samples: MdInitialStateSample[] };
  const reasons = new Map<string, Map<MdInitialStateCause, Cause>>();
  const leadingBoms = new Set<string>();
  const gap = (file: string, code: MdInitialStateCause, element?: Element, attribute?: Attr, count = 1) => {
    let values = reasons.get(file);
    if (!values) { values = new Map(); reasons.set(file, values); }
    let cause = values.get(code);
    if (!cause) {
      cause = { code, count: 0, locatedCount: 0, samples: [] };
      values.set(code, cause);
    }
    // Repeated failures after exhausting the same file's budget are one interruption.
    if (code === 'analysis_budget' && cause.count) return;
    cause.count += count;
    const location = attribute ?? element;
    const line = location?.lineNumber ?? 0, column = location?.columnNumber ?? 0;
    if (!element || line < 1 || column < 1) return;
    cause.locatedCount++;
    if (cause.samples.length < MAX_INITIAL_STATE_SAMPLES) {
      cause.samples.push({ line, column: line === 1 && leadingBoms.has(file) ? column + 1 : column,
        ...(element.tagName.length <= 96 ? { element: element.tagName } : {}),
        ...(attribute && attribute.name.length <= 96 ? { attribute: attribute.name } : {}) });
    }
  };
  type Cue = { file: string; script: string; key: string; direct: string; namespace?: string; parent?: string; block: string; hasActions: boolean; element: Element };
  type Parsed = { file: string; source: string; root: Element; cues: Cue[]; actions: Map<string, MdAvailabilityAction> };
  type Writer = { target: string; variable: string; block: string; order: number };
  type Opaque = { target?: string; variable?: string; block?: string };
  const parsed: Parsed[] = [], scripts = new Map<string, Parsed[]>(), writers: Writer[] = [], opaque: Opaque[] = [];
  const paths = new Set<string>();
  const lvalues = new Set(['lvalueexpression', 'lvaluename', 'groupname', 'countresult']);
  const directId = (script: string, cue: string) => JSON.stringify([script, cue]);
  const primitive = new Set(['set_value', 'remove_value', 'debug_text', 'do_if', 'do_else', 'do_elseif', 'append_to_list', 'append_list_elements']);
  const maxFacts = 131072;
  const maxDerivedFacts = 262144;
  let facts = 0, derivedFacts = 0, limited = false;
  const reserve = (file: string, amount = 1) => {
    derivedFacts += amount;
    if (derivedFacts <= maxDerivedFacts) return true;
    limited = true; gap(file, 'analysis_budget'); return false;
  };
  const addOpaque = (effect: Opaque, file: string) => { if (reserve(file)) opaque.push(effect); };
  const addWriter = (writer: Writer, file: string) => { if (reserve(file)) writers.push(writer); };
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  for (const file of omissions.paths) gap(file, 'omitted_input');
  if (omissions.additionalCount) gap('.', 'omitted_paths_unlisted', undefined, undefined, omissions.additionalCount);
  if (omissions.paths.length || omissions.additionalCount) addOpaque({}, omissions.paths[0] ?? '.');
  for (const input of [...files].sort((a, b) => compare(a.path, b.path) || compare(a.content ?? '', b.content ?? ''))) {
    const file = availabilityPath(input.path), folded = file.toLowerCase();
    if (paths.has(folded)) { gap(file, 'duplicate_file'); addOpaque({}, file); continue; }
    paths.add(folded);
    if (typeof input.content !== 'string') { gap(file, 'missing_source'); addOpaque({}, file); continue; }
    const source = input.content;
    if (source.charCodeAt(0) === 0xfeff) leadingBoms.add(file);
    let invalid = false, root: Element | null = null;
    try {
      const xml = normalizeLineEndings(source.replace(/^\uFEFF/, ''));
      assertXmlInputWithinLimits(xml);
      root = new DOMParser({ onError: () => { invalid = true; } }).parseFromString(xml, 'text/xml').documentElement;
    } catch { invalid = true; }
    if (invalid || !root || root.tagName !== 'mdscript' || root.namespaceURI || !root.getAttribute('name')) {
      gap(file, 'unusable_script'); addOpaque({}, file); continue;
    }
    const nodeCount = root.getElementsByTagName('*').length;
    if (facts + nodeCount > maxFacts) {
      gap(file, 'input_limit'); addOpaque({}, file); limited = true; break;
    }
    facts += nodeCount;
    const script = root.getAttribute('name')!;
    const value: Parsed = { file, source, root, cues: [], actions: new Map() };
    const names = new Set<string>();
    const declaredCues = new Map<Element, Cue>();
    for (const element of Array.from(root.getElementsByTagName('cue'))) {
      const name = element.getAttribute('name');
      if (!reserve(file)) break;
      if (!name || names.has(name)) { gap(file, 'ambiguous_cue', element); addOpaque({}, file); }
      if (name) names.add(name);
      const parent = element.parentElement?.parentElement;
      const parentCue = parent?.tagName === 'cue' ? declaredCues.get(parent) : undefined;
      const direct = directId(script, name ?? '');
      const own = ['this', 'static'].includes(element.getAttribute('namespace') ?? '');
      const namespace = isPlainVariableCue(element, root) && name ? own || !parentCue ? direct : parentCue.namespace : undefined;
      if (!namespace) {
        gap(file, 'unsupported_namespace', element);
        addOpaque({}, file);
      }
      const actions = Array.from(element.children).find(child => !child.namespaceURI && child.tagName === 'actions');
      const cue: Cue = { file, script, key: availabilityCueKey(element), direct, namespace, parent: parentCue?.direct,
        block: `${file}\u0000${actions ? availabilityNode(actions) : availabilityNode(element)}`, hasActions: !!actions, element };
      value.cues.push(cue);
      declaredCues.set(element, cue);
    }
    parsed.push(value);
    const prior = scripts.get(script) ?? []; prior.push(value); scripts.set(script, prior);
  }
  for (const group of scripts.values()) if (group.length !== 1) {
    for (const file of group) gap(file.file, 'ambiguous_script');
    addOpaque({}, group[0].file);
  }
  const declarations = new Map<string, Cue>(), ambiguous = new Set<string>();
  for (const file of parsed) for (const cue of file.cues) {
    if (declarations.has(cue.direct) || ambiguous.has(cue.direct)) { declarations.delete(cue.direct); ambiguous.add(cue.direct); }
    else declarations.set(cue.direct, cue);
  }
  const hasOmissions = Boolean(omissions.paths.length || omissions.additionalCount);
  const valueReturningLibraries = new Set<string>();
  if (!hasOmissions && !limited) {
    for (const [scriptName, group] of scripts) {
      if (group.length !== 1) continue;
      const docRoot = group[0].root;
      const namedCallables = new Map<string, Element[]>();
      for (const node of Array.from(docRoot.getElementsByTagName('*'))) {
        if (node.namespaceURI || (node.tagName !== 'cue' && node.tagName !== 'library')) continue;
        const n = node.getAttribute('name')?.trim();
        if (!n) continue;
        const list = namedCallables.get(n) ?? [];
        list.push(node);
        namedCallables.set(n, list);
      }
      for (const [libName, defs] of namedCallables) {
        if (defs.length !== 1) continue;
        const lib = defs[0];
        if (lib.tagName !== 'library' || lib.getAttribute('purpose') !== 'run_actions') continue;
        if (Array.from(lib.children).some(c => !c.namespaceURI && c.tagName === 'delay')) continue;
        const actionBlocks = Array.from(lib.children).filter(c => !c.namespaceURI && c.tagName === 'actions');
        if (actionBlocks.length === 1 && doesLibraryGuaranteeReturnValue(actionBlocks[0])) {
          valueReturningLibraries.add(directId(scriptName, libName));
        }
      }
    }
  }
  const destination = (raw: string, cue: Cue | undefined): MdAvailabilityDestination => {
    const value = raw.trim();
    const local = LOCAL_VARIABLE.exec(value);
    if (local) return { target: cue?.namespace, variable: local[1], initializes: true };
    const remote = /^(?:(md)\.([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)\.(\$[A-Za-z_]\w*)$/.exec(value);
    if (remote) {
      const [, md, script, name, variable] = remote;
      const target = md ? declarations.get(directId(script, name))?.direct
        : name === 'this' || name === 'static' ? cue?.direct
          : name === 'parent' ? cue?.parent : cue ? declarations.get(directId(cue.script, name))?.direct : undefined;
      return { target, variable, initializes: true };
    }
    // A member mutation cannot create its receiver root. A variable destination
    // on an unknown receiver can still address that variable on a cue object.
    const variableMember = /^\$[A-Za-z_]\w*\.(\$[A-Za-z_]\w*)$/.exec(value);
    if (variableMember) return { variable: variableMember[1], initializes: true };
    if (isSubMemberDestination(value)
      || /\.(\$[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)+$/.test(value)) return { initializes: false };
    return { variable: /\.(\$[A-Za-z_]\w*)$/.exec(value)?.[1], initializes: true };
  };
  for (const file of parsed) {
    const cueByElement = new Map(file.cues.map(cue => [cue.element, cue]));
    const elements = Array.from(file.root.getElementsByTagName('*'));
    for (let order = 0; order < elements.length; order++) {
      const element = elements[order];
      if (!reserve(file.file)) break;
      let cue: Cue | undefined, block: Element | undefined;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        if (!block && ['actions', 'conditions'].includes(ancestor.tagName)) block = ancestor;
        if (cueByElement.has(ancestor)) { cue = cueByElement.get(ancestor); break; }
      }
      const blockId = block ? `${file.file}\u0000${availabilityNode(block)}` : `${file.file}\u0000declaration`;
      const inActions = block?.tagName === 'actions';
      const declaredSpec = schema?.loaded ? schema.elements.get(element.tagName.toLowerCase()) : undefined;
      const structural = element === block || ['check_all', 'check_any', 'event_game_started'].includes(element.tagName);
      const unresolvedSpec = !structural && !!declaredSpec && (!declaredSpec.resolved || declaredSpec.openAttributes
        || Array.from(element.attributes).some(attribute => {
          const role = declaredSpec.attributes.get(attribute.name);
          return !!role && !role.type;
        }));
      const spec = unresolvedSpec ? undefined : declaredSpec;
      if (unresolvedSpec && block) gap(file.file, 'unresolved_schema', element);
      const attributes = new Set<string>();
      if (spec) for (const [name, attribute] of spec.attributes) if (attribute.type && lvalues.has(attribute.type)) attributes.add(name);
      if (element.tagName === 'set_value' || element.tagName === 'remove_value') attributes.add('name');
      const append = ['append_to_list', 'append_list_elements'].includes(element.tagName);
      if (append && ['true', '1'].includes(element.getAttribute('create') ?? '')) attributes.add('name');
      const destinations: MdAvailabilityDestination[] = [];
      for (const name of attributes) {
        const raw = element.getAttribute(name);
        if (raw === null || !raw.trim()) continue;
        const target = destination(raw, cue);
        if (element.tagName === 'remove_value') target.initializes = false;
        destinations.push(target);
        if (target.initializes && target.target && target.variable) addWriter({ target: target.target, variable: target.variable, block: blockId, order }, file.file);
        else if (target.initializes) {
          addOpaque({ target: target.target, variable: target.variable, block: blockId }, file.file);
          gap(file.file, 'dynamic_destination', element, element.getAttributeNode(name) ?? undefined);
        }
      }
      let branchDepth = 0;
      for (let parent: Element | null = element; parent; parent = parent.parentElement) if (parent.tagName === 'do_if') branchDepth++;
      let previousElement: Element | undefined;
      if (element.tagName === 'do_else') {
        let sibling = element.previousSibling;
        while (sibling && sibling.nodeType !== 1) sibling = sibling.previousSibling;
        if (sibling?.nodeType === 1) previousElement = sibling as Element;
      }
      const branchUnsupported = element.tagName === 'do_if' && (!LOCAL_EXISTENCE_TEST.test(element.getAttribute('value')?.trim() ?? '')
        || !hasOnlyAttributes(element, ['value', 'comment']) || branchDepth > MAX_VARIABLE_BRANCH_DEPTH) || element.tagName === 'do_elseif'
        || element.tagName === 'do_else' && (!hasOnlyAttributes(element, ['comment']) || previousElement?.tagName !== 'do_if');
      const operationUnsupported = element.tagName === 'set_value' && ![null, 'set', 'add', 'subtract'].includes(element.getAttribute('operation'));
      const leafUnsupported = ['set_value', 'debug_text', 'remove_value', 'append_to_list', 'append_list_elements'].includes(element.tagName)
        && !!element.children.length;
      const removalUnsupported = element.tagName === 'remove_value'
        && (!LOCAL_VARIABLE.test(element.getAttribute('name')?.trim() ?? '') || !hasOnlyAttributes(element, ['name', 'comment']));
      const unsupported = !!element.namespaceURI || (inActions && element !== block && !primitive.has(element.tagName))
        || (!!block && !primitive.has(element.tagName) && !spec
          && !['actions', 'conditions', 'event_game_started', 'check_all', 'check_any'].includes(element.tagName))
        || branchUnsupported || operationUnsupported || leafUnsupported || removalUnsupported
        || (!!block && unresolvedSpec && !primitive.has(element.tagName));
      if (unsupported) {
        const indirect = ['run_actions', 'include_actions', 'run_script'].includes(element.tagName) || (!spec && !primitive.has(element.tagName));
        addOpaque({ target: indirect ? undefined : cue?.namespace, block: blockId }, file.file);
        gap(file.file, spec ? 'unsupported_effect' : 'unknown_effect', element);
      }
      const unknownVariables = destinations.filter(target => target.initializes && !target.target && target.variable).map(target => target.variable!);
      let guaranteedOutputs: string[] | undefined;
      if (spec && element.tagName === 'run_actions' && !element.hasAttribute('chance')) {
        const refMatch = /^(?:md\.([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)$/.exec(element.getAttribute('ref')?.trim() ?? '');
        const resultVar = LOCAL_VARIABLE.exec(element.getAttribute('result')?.trim() || '')?.[1];
        if (refMatch && resultVar) {
          const targetScript = refMatch[1] ?? file.root.getAttribute('name') ?? '';
          if (targetScript && valueReturningLibraries.has(directId(targetScript, refMatch[2]))) {
            guaranteedOutputs = [resultVar];
          }
        }
      }
      const action: MdAvailabilityAction = { order, destinations, unknownVariables,
        ...(spec && !OPAQUE_OR_INLINE_ACTIONS.has(element.tagName) ? { knownDeclaration: true } : {}),
        ...(guaranteedOutputs ? { guaranteedOutputs } : {}),
        opaque: unsupported || destinations.some(target => target.initializes && !target.variable) };
      const operation = element.getAttribute('operation');
      const target = destinations.find(value => value.initializes && value.target === cue?.namespace && value.variable);
      if (element.tagName === 'set_value' && ['add', 'subtract'].includes(operation ?? '') && target?.variable
        && strictLocalReads(element.getAttribute('exact') ?? '').some(read => read.variable === target.variable)) {
        action.selfOrderingUnknown = target.variable;
        gap(file.file, 'self_update_order', element, element.getAttributeNode('exact') ?? undefined);
      }
      file.actions.set(availabilityNode(element), action);
    }
  }
  type Blocks = { count: number; last: Record<string, number> };
  type Variable = { writers: Blocks; opaque: Blocks };
  type Authority = { variables: Record<string, Variable>; opaque: Blocks };
  const emptyBlocks = (): Blocks => ({ count: 0, last: availabilityRecord<number>() });
  const emptyAuthority = (): Authority => ({ variables: availabilityRecord<Variable>(), opaque: emptyBlocks() });
  const authority = availabilityRecord<Authority>(), global = emptyAuthority();
  const coverage = (inputsOnly = false): ValidationCoverageGap[] => Array.from(reasons).flatMap(([filePath, values]) => {
    const causes = [...values.values()].filter(cause => !inputsOnly || INITIAL_STATE_INPUT_FAILURES.has(cause.code));
    if (!causes.length) return [];
    const summaries = causes.map(cause => MD_INITIAL_STATE_REASONS[cause.code]).sort();
    return [{ check: MD_INITIAL_STATE_COVERAGE_CHECK, filePath,
      reason: summaries.slice(0, 8).join(' ') + (summaries.length > 8 ? ` ${summaries.length - 8} additional unsupported categories.` : ''),
      mdInitialState: { analysisLimited: limited, causes: causes.sort((a, b) => compare(a.code, b.code)) } }];
  }).sort((a, b) => compare(a.filePath, b.filePath));
  const limitResult = () => ({ context: { files: availabilityRecord<MdAvailabilityFile>(), authority: availabilityRecord<MdAvailabilityAuthority>(),
    global: emptyAuthority(), scope: { eligibleCues: 0, skippedCues: parsed.reduce((count, file) => count + file.cues.length, 0),
      indexedFacts: Math.min(derivedFacts, maxDerivedFacts), limited: true } }, coverageGaps: coverage(), inputGaps: coverage(true) });
  if (limited) return limitResult();
  const index = (target: string | undefined, variable: string | undefined, kind: 'writers' | 'opaque', block: string | undefined, order: number, file: string) => {
    let owner = global;
    if (target !== undefined) {
      owner = availabilityOwn(authority, target)!;
      if (!owner) { if (!reserve(file)) return; owner = emptyAuthority(); authority[target] = owner; }
    }
    let blocks = owner.opaque;
    if (variable !== undefined) {
      let entry = availabilityOwn(owner.variables, variable);
      if (!entry) { if (!reserve(file)) return; entry = { writers: emptyBlocks(), opaque: emptyBlocks() }; owner.variables[variable] = entry; }
      blocks = entry[kind];
    }
    const key = block ?? '\u0000outside';
    const prior = availabilityOwn(blocks.last, key);
    if (prior === undefined) { if (!reserve(file)) return; blocks.count++; }
    blocks.last[key] = Math.max(prior ?? -1, order);
  };
  for (const writer of writers) index(writer.target, writer.variable, 'writers', writer.block, writer.order, writer.block.split('\u0000')[0]);
  for (const effect of opaque) index(effect.target, effect.variable, 'opaque', effect.block, 0, effect.block?.split('\u0000')[0] ?? parsed[0]?.file ?? files[0]?.path ?? 'project');
  if (limited) return limitResult();
  const result = availabilityRecord<MdAvailabilityFile>();
  let eligibleCues = 0, skippedCues = 0;
  for (const file of parsed) {
    const cues = availabilityRecord<MdAvailabilityCue>();
    for (const cue of file.cues) {
      if (!cue.namespace) { skippedCues++; continue; }
      const owner = availabilityOwn(authority, cue.namespace);
      const unavailable = !cue.hasActions || availabilityOtherBlock(global.opaque, cue.block) || availabilityOtherBlock(owner?.opaque, cue.block);
      if (unavailable) skippedCues++; else eligibleCues++;
      if (!reserve(file.file)) break;
      cues[cue.key] = { namespace: cue.namespace, block: cue.block, unavailable };
    }
    if (!reserve(file.file, file.actions.size + 1)) break;
    const actions = availabilityRecord<MdAvailabilityAction>();
    for (const [key, action] of file.actions) actions[key] = action;
    result[file.file] = { source: file.source, cues, actions };
  }
  if (limited) return limitResult();
  return { context: { files: result, authority, global, scope: { eligibleCues, skippedCues, indexedFacts: derivedFacts, limited: false } }, coverageGaps: coverage(), inputGaps: coverage(true) };
}

function isPlainVariableCue(cue: Element, root: Element): boolean {
  for (let current: Element | null = cue; current;) {
    const parent = current.parentElement;
    const namespace = current.getAttribute('namespace');
    const instantiate = current.getAttribute('instantiate');
    if (current.tagName !== 'cue' || current.namespaceURI || current.hasAttribute('ref')
      || (namespace !== null && !['default', 'this', 'static'].includes(namespace))
      || (instantiate !== null && instantiate !== 'false' && instantiate !== '0')
      || parent?.tagName !== 'cues' || parent.namespaceURI) return false;
    if (parent.parentElement === root) return true;
    current = parent.parentElement;
  }
  return false;
}

function hasOnlyAttributes(element: Element, names: string[]): boolean {
  return Array.from(element.attributes).every(attribute => names.includes(attribute.name));
}

function onlyVariableLogs(branch: Element | undefined): boolean {
  return !branch || Array.from(branch.children)
    .every(action => action.tagName === 'debug_text' && !action.namespaceURI && !action.children.length);
}

function lintLocalVariableReads(root: Element, source: string, filePath?: string, leadingBom = false,
  availability?: MdAvailabilityFile, projectAvailability?: MdVariableAvailabilityContext, initialStateGaps?: ValidationCoverageGap[]): MdPitfallFinding[] {
  if (root.namespaceURI) return [];
  const findings: MdPitfallFinding[] = [];
  let lines: number[] | undefined;
  type InitialValue = { kind: 'present' | 'potential' | 'unknown' | 'unavailable'; joined?: boolean };
  type InitialFlow = { facts: Map<string, InitialValue>; potential: boolean };
  let activeCue: MdAvailabilityCue | undefined;
  const activeAuthority = () => activeCue ? availabilityOwn(projectAvailability?.authority, activeCue.namespace) : undefined;
  const initialValue = (flow: InitialFlow, variable: string): InitialValue => {
    const established = flow.facts.get(variable);
    if (established) return established;
    if (!flow.potential || !activeCue) return { kind: 'unavailable' };
    const local = availabilityOwn(activeAuthority()?.variables, variable);
    const global = availabilityOwn(projectAvailability?.global.variables, variable);
    if (availabilityOtherBlock(local?.opaque, activeCue.block) || availabilityOtherBlock(global?.opaque, activeCue.block)) {
      return { kind: 'unavailable' };
    }
    return { kind: availabilityOtherBlock(local?.writers, activeCue.block) ? 'unknown' : 'potential' };
  };
  let gapCount = 0;
  const readPosition = (attribute: Attr, offset: number) => {
    lines ??= [0, ...Array.from(source.matchAll(/\n/g), match => match.index + 1)];
    const { line, column } = expressionLocation(source, lines, attribute, offset);
    return { line, column: leadingBom && line === 1 && column ? column + 1 : column };
  };
  const unavailableRead = (attribute: Attr, variable: string, offset: number, selfOrdering = false) => {
    if (!initialStateGaps || !availability) return;
    gapCount++;
    if (gapCount > MAX_INITIAL_STATE_READ_GAPS) return;
    const reason = selfOrdering ? MD_INITIAL_STATE_REASONS.self_update_order
      : `Earlier initialization could not be verified for strict read of ${variable.slice(0, 96)}.`;
    initialStateGaps.push({ check: MD_INITIAL_STATE_COVERAGE_CHECK, filePath, reason, ...readPosition(attribute, offset) });
  };
  const readAttribute = (action: Element) => action.namespaceURI ? null
    : action.tagName === 'set_value' ? action.getAttributeNode('exact')
      : action.tagName === 'debug_text' && !action.hasAttribute('chance') ? action.getAttributeNode('text') : null;
  const inspectUnmodeled = (scope: Element) => {
    if (!initialStateGaps || !availability) return;
    for (const action of [scope, ...Array.from(scope.getElementsByTagName('*'))]) {
      const attr = readAttribute(action);
      if (!attr) continue;
      for (const { variable, offset } of strictLocalReads(attr.value)) unavailableRead(attr, variable, offset);
    }
  };
  const clearInitial = (flow: InitialFlow | undefined) => { if (flow) { flow.facts.clear(); flow.potential = false; } };
  const cloneInitial = (flow: InitialFlow | undefined) => flow ? { facts: new Map(flow.facts), potential: flow.potential } : undefined;
  const copyPresentFacts = (facts: ReadonlyMap<string, InitialValue> | undefined): Map<string, InitialValue> => {
    const out = new Map<string, InitialValue>();
    if (facts) for (const [key, value] of facts) if (value.kind === 'present') out.set(key, { kind: 'present' });
    return out;
  };
  const intersectPresentFacts = (maps: readonly Map<string, InitialValue>[]): Map<string, InitialValue> => {
    const out = new Map<string, InitialValue>();
    if (!maps.length) return out;
    for (const [key, value] of maps[0]) {
      if (value.kind === 'present' && maps.every(map => map.get(key)?.kind === 'present')) out.set(key, { kind: 'present' });
    }
    return out;
  };
  const collectLoopInvalidations = (loopEl: Element): { clearAll: boolean; removed: Set<string> } => {
    const removed = new Set<string>();
    let clearAll = false;
    for (const node of Array.from(loopEl.getElementsByTagName('*'))) {
      if (node.namespaceURI || OPAQUE_OR_INLINE_ACTIONS.has(node.tagName)) {
        clearAll = true;
        break;
      }
      if (node.tagName === 'remove_value') {
        const rawName = node.getAttribute('name')?.trim() || '';
        const removedName = LOCAL_VARIABLE.exec(rawName)?.[1];
        if (removedName) removed.add(removedName);
        else if (!rawName || !isSubMemberDestination(rawName)) clearAll = true;
      }
    }
    return { clearAll, removed };
  };
  function joinInitial(target: InitialFlow | undefined, left: InitialFlow | undefined, right: InitialFlow | undefined) {
    if (!target || !left || !right) return;
    const joined = new Map<string, InitialValue>();
    for (const variable of new Set([...left.facts.keys(), ...right.facts.keys()])) {
      const a = initialValue(left, variable), b = initialValue(right, variable);
      joined.set(variable, a.kind === 'unavailable' || b.kind === 'unavailable' ? { kind: 'unavailable' }
        : a.kind === 'unknown' || b.kind === 'unknown' ? { kind: 'unknown' }
          : a.kind === 'present' && b.kind === 'present' ? { kind: 'present' }
            : { kind: 'potential', joined: true });
    }
    target.facts = joined; target.potential = left.potential && right.potential;
  }
  function initialAction(action: Element, flow: InitialFlow | undefined, absent: Map<string, AbsenceReason>) {
    if (!flow) return;
    const fact = availabilityOwn(availability?.actions, availabilityNode(action));
    if (!fact || fact.opaque || action.children.length) {
      const ownAttr = !action.namespaceURI ? readAttribute(action) : null;
      if (ownAttr) {
        for (const { variable, offset } of strictLocalReads(ownAttr.value)) {
          if (fact?.selfOrderingUnknown === variable) {
            unavailableRead(ownAttr, variable, offset, true);
            continue;
          }
          if (flow.facts.get(variable)?.kind === 'present') continue;
          unavailableRead(ownAttr, variable, offset);
        }
      }
      for (const descendant of Array.from(action.getElementsByTagName('*'))) {
        if (descendant.namespaceURI) continue;
        const descAttr = readAttribute(descendant);
        if (!descAttr) continue;
        for (const { variable, offset } of strictLocalReads(descAttr.value)) unavailableRead(descAttr, variable, offset);
      }
      const childUnsafe = action.children.length > 0 && Array.from(action.getElementsByTagName('*')).some(child =>
        child.namespaceURI || child.tagName === 'remove_value' || OPAQUE_OR_INLINE_ACTIONS.has(child.tagName));
      if (fact?.knownDeclaration && !action.namespaceURI && !childUnsafe) {
        if (action.tagName === 'remove_value') {
          const removeRaw = action.getAttribute('name')?.trim() || '';
          if (removeRaw && isSubMemberDestination(removeRaw)) {
            flow.potential = false;
            return;
          }
          const resolvedVars = fact.destinations
            .filter(dest => dest.variable && (!dest.target || dest.target === activeCue?.namespace))
            .map(dest => dest.variable!);
          if (resolvedVars.length || (removeRaw && fact.destinations.some(dest => !!dest.target))) {
            for (const variable of resolvedVars) flow.facts.delete(variable);
            flow.potential = false;
            return;
          }
          clearInitial(flow);
          return;
        }
        for (const variable of fact.unknownVariables) {
          if (flow.facts.get(variable)?.kind !== 'present') flow.facts.delete(variable);
        }
        for (const dest of fact.destinations) {
          if (dest.initializes && dest.variable && flow.facts.get(dest.variable)?.kind !== 'present') {
            flow.facts.delete(dest.variable);
          }
        }
        for (const variable of [...(fact.guaranteedOutputs ?? []), ...findGuaranteedLocalOutputs(action)]) {
          flow.facts.set(variable, { kind: 'present' });
        }
        flow.potential = false;
        return;
      }
      clearInitial(flow);
      return;
    }
    const attribute = readAttribute(action);
    if (attribute) {
      for (const { variable, offset } of strictLocalReads(attribute.value)) {
        if (fact.selfOrderingUnknown === variable) {
          unavailableRead(attribute, variable, offset, true);
          continue;
        }
        if (absent.has(variable)) continue;
        const state = initialValue(flow, variable);
        if (state.kind === 'unavailable') {
          unavailableRead(attribute, variable, offset);
          continue;
        }
        if (state.kind !== 'potential') continue;
        const writer = availabilityOwn(activeAuthority()?.variables, variable);
        const later = (availabilityOwn(writer?.writers.last, activeCue?.block ?? '') ?? -1) > fact.order;
        const explanation = state.joined ? 'Modeled branches do not guarantee an earlier initialization'
          : later ? 'A modeled writer occurs later in this action block, without a guaranteed earlier initialization'
            : 'No guaranteed earlier initialization was found in the modeled project namespace';
        findings.push({ code: 'md_pitfall.variable_read_before_initialization', severity: 'warning', filePath, cue: enclosingNamedCue(action),
          sourceRef: `${action.tagName}/@${attribute.name}`, ...readPosition(attribute, offset),
          detail: `Project-scoped advisory for strict read of ${variable}: ${explanation}. Saved values and writers outside the analyzed project remain unknown.` });
      }
    }
    if (action.tagName === 'debug_text') return;
    if (action.tagName === 'remove_value') {
      const removeRaw = action.getAttribute('name')?.trim() || '';
      if (removeRaw && isSubMemberDestination(removeRaw)) flow.potential = false;
      else clearInitial(flow);
      return;
    }
    const initializedVars = new Set<string>();
    if (activeCue) {
      for (const destination of fact.destinations) {
        if (destination.initializes && destination.target === activeCue.namespace && destination.variable) {
          initializedVars.add(destination.variable);
        }
      }
    } else if (!action.hasAttribute('chance')) {
      const localTarget = LOCAL_VARIABLE.exec(action.getAttribute('name')?.trim() || '')?.[1];
      const localInitAction = action.tagName === 'set_value'
        || ((action.tagName === 'append_to_list' || action.tagName === 'append_list_elements')
          && ['true', '1'].includes(action.getAttribute('create') ?? ''));
      if (localTarget && localInitAction && fact.destinations.some(dest => dest.initializes && dest.variable === localTarget)) {
        initializedVars.add(localTarget);
      }
    }
    for (const variable of fact.unknownVariables) {
      if (!initializedVars.has(variable) && flow.facts.get(variable)?.kind !== 'present') {
        flow.facts.set(variable, { kind: 'unavailable' });
      }
    }
    if (fact.selfOrderingUnknown) flow.facts.set(fact.selfOrderingUnknown, { kind: 'unavailable' });
    for (const variable of initializedVars) {
      if (variable === fact.selfOrderingUnknown) continue;
      if (!action.hasAttribute('chance')) flow.facts.set(variable, { kind: 'present' });
      else if (initialValue(flow, variable).kind === 'potential') flow.facts.set(variable, { kind: 'potential', joined: true });
    }
  }

  function scanActions(container: Element | undefined, absent: Map<string, AbsenceReason>, cue: string | undefined, depth: number, initial?: InitialFlow, allowAbsence = true): Map<string, AbsenceReason> {
    if (!container) return absent;
    const actions = Array.from(container.children);
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      if (action.namespaceURI) {
        inspectUnmodeled(action);
        absent.clear();
        clearInitial(initial);
        continue;
      }
      const name = LOCAL_VARIABLE.exec(action.getAttribute('name')?.trim() || '')?.[1];
      if (action.tagName === 'remove_value' && name && !action.children.length
        && hasOnlyAttributes(action, ['name', 'comment'])) {
        if (allowAbsence) {
          absent.set(name, 'removal');
          initial?.facts.set(name, { kind: 'potential' });
        } else {
          initial?.facts.delete(name);
        }
        continue;
      }
      if (action.tagName === 'do_if') {
        let after = index + 1;
        while (['do_elseif', 'do_else'].includes(actions[after]?.tagName)) after++;
        const hasElse = after > index + 1;
        const alternative = hasElse ? actions[index + 1] : undefined;
        const simpleElse = !alternative || (after === index + 2 && alternative.tagName === 'do_else'
          && !alternative.namespaceURI && hasOnlyAttributes(alternative, ['comment']));
        const first = index;
        index = after - 1;
        const test = LOCAL_EXISTENCE_TEST.exec(action.getAttribute('value')?.trim() || '');
        if (!test || !simpleElse || !hasOnlyAttributes(action, ['value', 'comment']) || depth >= MAX_VARIABLE_BRANCH_DEPTH) {
          if (depth >= MAX_VARIABLE_BRANCH_DEPTH || !initial) {
            for (let branch = first; branch < after; branch++) inspectUnmodeled(actions[branch]);
            absent.clear();
            clearInitial(initial);
            continue;
          }
          const prePresent = copyPresentFacts(initial.facts);
          const arms = actions.slice(first, after);
          const armOutputs: Map<string, InitialValue>[] = [];
          for (const armEl of arms) {
            if (armEl.namespaceURI) {
              inspectUnmodeled(armEl);
              armOutputs.push(new Map());
              continue;
            }
            const armInitial: InitialFlow = { facts: copyPresentFacts(prePresent), potential: false };
            if ((armEl.tagName === 'do_if' || armEl.tagName === 'do_elseif')
              && !armEl.hasAttribute('chance') && hasOnlyAttributes(armEl, ['value', 'comment'])) {
              for (const guardedVar of extractGuaranteedExistenceVars(armEl.getAttribute('value') ?? '')) {
                armInitial.facts.set(guardedVar, { kind: 'present' });
              }
            }
            scanActions(armEl, new Map(), cue, depth + 1, armInitial, allowAbsence);
            armOutputs.push(armInitial.facts);
          }
          const lastArm = arms[arms.length - 1];
          const unconditionalElse = lastArm?.tagName === 'do_else' && !lastArm.namespaceURI
            && hasOnlyAttributes(lastArm, ['comment']) && !arms.some(arm => arm.hasAttribute('chance'));
          initial.facts = intersectPresentFacts(unconditionalElse ? armOutputs : [prePresent, ...armOutputs]);
          initial.potential = false;
          absent.clear();
          continue;
        }

        const variable = test[2];
        const absenceIsTrue = Boolean(test[1]);
        const absentBranch = absenceIsTrue ? action : alternative;
        const presentBranch = absenceIsTrue ? alternative : action;
        if (allowAbsence && absent.has(variable)) {
          initial?.facts.set(variable, { kind: 'potential' });
          absent = scanActions(absentBranch, absent, cue, depth + 1, initial, allowAbsence);
          continue;
        }
        // Log-only arms cannot change incoming facts, so the condition adds only a temporary fact.
        if (allowAbsence && onlyVariableLogs(presentBranch) && onlyVariableLogs(absentBranch)) {
          const previous = initial?.facts.get(variable);
          initial?.facts.set(variable, { kind: 'present' });
          scanActions(presentBranch, absent, cue, depth + 1, initial, allowAbsence);
          absent.set(variable, 'flow');
          initial?.facts.set(variable, { kind: 'potential' });
          scanActions(absentBranch, absent, cue, depth + 1, initial, allowAbsence);
          absent.delete(variable);
          if (initial) { if (previous) initial.facts.set(variable, previous); else initial.facts.delete(variable); }
          continue;
        }
        const presentInitial = cloneInitial(initial), absentInitial = cloneInitial(initial);
        presentInitial?.facts.set(variable, { kind: 'present' });
        if (allowAbsence) absentInitial?.facts.set(variable, { kind: 'potential' });
        else absentInitial?.facts.delete(variable);
        const present = scanActions(presentBranch, new Map(absent), cue, depth + 1, presentInitial, allowAbsence);
        if (allowAbsence) absent.set(variable, 'flow');
        absent = scanActions(absentBranch, absent, cue, depth + 1, absentInitial, allowAbsence);
        for (const [key, reason] of absent) {
          const otherReason = present.get(key);
          if (!otherReason) absent.delete(key);
          else if (otherReason !== reason) absent.set(key, 'flow');
        }
        joinInitial(initial, presentInitial, absentInitial);
        continue;
      }
      if (action.tagName === 'do_for_each' || action.tagName === 'do_all' || action.tagName === 'do_while') {
        if (depth >= MAX_VARIABLE_BRANCH_DEPTH || !initial) {
          inspectUnmodeled(action);
          absent.clear();
          clearInitial(initial);
          continue;
        }
        const { clearAll, removed } = collectLoopInvalidations(action);
        const preSafe = new Map<string, InitialValue>();
        if (!clearAll) {
          for (const [key, value] of initial.facts) {
            if (value.kind === 'present' && !removed.has(key)) preSafe.set(key, { kind: 'present' });
          }
        }
        const loopInitial: InitialFlow = { facts: copyPresentFacts(preSafe), potential: false };
        if (action.tagName === 'do_for_each') {
          const itemVar = LOCAL_VARIABLE.exec(action.getAttribute('name')?.trim() || '')?.[1];
          if (itemVar) loopInitial.facts.set(itemVar, { kind: 'present' });
          const valueVar = LOCAL_VARIABLE.exec(action.getAttribute('valuename')?.trim() || '')?.[1];
          if (valueVar) loopInitial.facts.set(valueVar, { kind: 'present' });
        }
        if (action.tagName === 'do_for_each' || action.tagName === 'do_all') {
          const counterVar = LOCAL_VARIABLE.exec(action.getAttribute('counter')?.trim() || '')?.[1];
          if (counterVar) loopInitial.facts.set(counterVar, { kind: 'present' });
        }
        scanActions(action, new Map(), cue, depth + 1, loopInitial, allowAbsence);
        initial.facts = clearAll ? new Map() : intersectPresentFacts([preSafe, loopInitial.facts]);
        initial.potential = false;
        absent.clear();
        continue;
      }

      initialAction(action, initial, absent);
      const assignment = action.tagName === 'set_value' ? name : undefined;
      const log = action.tagName === 'debug_text';
      if ((!assignment && !log) || action.children.length) {
        absent.clear();
        continue;
      }
      const plainAssignment = assignment && (hasOnlyAttributes(action, ['name', 'exact', 'comment'])
        || action.getAttribute('operation') === 'set' && hasOnlyAttributes(action, ['name', 'exact', 'operation', 'comment']));
      const unconditionalLog = log && !action.hasAttribute('chance');
      const attribute = plainAssignment ? action.getAttributeNode('exact') : unconditionalLog ? action.getAttributeNode('text') : null;
      if (allowAbsence && attribute && absent.size) {
        for (const { variable, offset } of strictLocalReads(attribute.value)) {
          const reason = absent.get(variable);
          if (!reason) continue;
          lines ??= [0, ...Array.from(source.matchAll(/\n/g), match => match.index + 1)];
          const position = expressionLocation(source, lines, attribute, offset);
          const removal = reason === 'removal';
          findings.push({ code: removal ? 'md_pitfall.variable_read_after_removal' : 'md_pitfall.variable_read_when_absent',
            severity: 'warning', filePath, cue, sourceRef: `${action.tagName}/@${attribute.name}`,
            line: position.line, column: leadingBom && position.line === 1 && position.column ? position.column + 1 : position.column,
            detail: `Strict read of ${variable} ${removal ? 'after remove_value in this cue' : 'where this cue’s action flow proves it is absent'}. Assign a value first or use an existence check.` });
        }
      }
      if (assignment) absent.delete(assignment);
    }
    return absent;
  }

  for (const cue of Array.from(root.getElementsByTagName('cue'))) {
    const actions = Array.from(cue.children).find(child => !child.namespaceURI && child.tagName === 'actions');
    if (!isPlainVariableCue(cue, root)) {
      if (actions) {
        if (initialStateGaps && availability) {
          activeCue = undefined;
          scanActions(actions, new Map(), enclosingNamedCue(actions), 0, { facts: new Map(), potential: false }, false);
        } else {
          inspectUnmodeled(actions);
        }
      }
      continue;
    }
    // Save state and other cues can supply a value at entry, even in a child's inherited namespace.
    activeCue = availabilityOwn(availability?.cues, availabilityCueKey(cue));
    const initial = activeCue ? { facts: new Map<string, InitialValue>(), potential: !activeCue.unavailable }
      : availability ? { facts: new Map<string, InitialValue>(), potential: false } : undefined;
    if (!initial && actions) inspectUnmodeled(actions);
    scanActions(actions, new Map(), enclosingNamedCue(actions ?? cue), 0, initial, true);
  }
  if (initialStateGaps && availability) {
    activeCue = undefined;
    const paramNamePattern = /^[A-Za-z_]\w*$/;
    for (const library of Array.from(root.getElementsByTagName('library'))) {
      if (library.namespaceURI) continue;
      const libraryFacts = new Map<string, InitialValue>();
      const paramsBlock = Array.from(library.children).find(child => !child.namespaceURI && child.tagName === 'params');
      if (paramsBlock) {
        for (const paramEl of Array.from(paramsBlock.children)) {
          if (paramEl.namespaceURI || paramEl.tagName !== 'param') continue;
          const paramName = paramEl.getAttribute('name')?.trim() || '';
          if (paramNamePattern.test(paramName)) libraryFacts.set(`$${paramName}`, { kind: 'present' });
        }
      }
      for (const actions of Array.from(library.children).filter(child => !child.namespaceURI && child.tagName === 'actions')) {
        scanActions(actions, new Map(), enclosingNamedCue(actions), 0, { facts: copyPresentFacts(libraryFacts), potential: false }, false);
      }
    }
    if (gapCount > MAX_INITIAL_STATE_READ_GAPS) initialStateGaps.push({
      check: MD_INITIAL_STATE_COVERAGE_CHECK, filePath,
      reason: `${gapCount - MAX_INITIAL_STATE_READ_GAPS} additional strict reads exceeded the per-file coverage reporting limit.`,
    });
  }
  return findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
}

function staticCueNames(root: Element): Set<string> {
  const names = new Map<string, string>();
  const cues = new Set<string>();
  for (const node of Array.from(root.getElementsByTagName('*'))) {
    if (node.tagName !== 'cue' && node.tagName !== 'library') continue;
    const name = node.getAttribute('name');
    if (!name) continue;
    const key = name.toLowerCase();
    const previous = names.get(key);
    if (previous) cues.delete(previous);
    else {
      names.set(key, name);
      if (classifyCueRef(key).kind === 'local' && isStaticRootCue(node, root)) cues.add(name);
    }
  }
  return cues;
}

const TIME_ACTION_TIMEOUT_TAGS = new Set([
  'show_notification',
  'show_interactive_notification',
  'set_requested_job_ship_timeout',
]);
const NON_MUTATING_TIME_TRACE_TAGS = new Set([
  'debug_text',
  'write_to_logbook',
  'speak',
  'show_help',
  'show_notification',
  'show_interactive_notification',
  'set_requested_job_ship_timeout',
  'play_cutscene',
  'append_to_list',
  'remove_from_list',
]);
const TIME_TRACE_LVALUE_ATTRS = ['name', 'result', 'groupname', 'list', 'table', 'valuename', 'counter'] as const;
const QUEUE_INDEX_READ = /^([A-Za-z_]\w*\.\$[A-Za-z_]\w*)\.\{[^{}]+\}$/;

function parseMdTableLiteralEntries(exact: string): Map<string, string> | null {
  const trimmed = exact.trim();
  if (!/^table\[[\s\S]*\]$/.test(trimmed)) return null;
  const inner = trimmed.slice(6, -1);
  const entries = new Map<string, string>();
  if (!inner.trim()) return entries;
  let quote = '';
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let start = 0;
  const segments: string[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) {
        if (inner[i + 1] === quote) { i++; continue; }
        quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') paren++;
    else if (ch === ')') { if (--paren < 0) return null; }
    else if (ch === '[') bracket++;
    else if (ch === ']') { if (--bracket < 0) return null; }
    else if (ch === '{') brace++;
    else if (ch === '}') { if (--brace < 0) return null; }
    else if (ch === ',' && paren === 0 && bracket === 0 && brace === 0) {
      segments.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (quote || paren !== 0 || bracket !== 0 || brace !== 0) return null;
  segments.push(inner.slice(start));
  for (const seg of segments) {
    const piece = seg.trim();
    if (!piece) continue;
    const match = /^(\$[A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(piece);
    if (!match) return null;
    entries.set(match[1], match[2].trim());
  }
  return entries;
}

function comparedEventParameter(value: string): string | undefined {
  let parameter: string | undefined;
  for (const term of value.trim().split(/\s+or\s+/)) {
    const comparison = /^(event\.param\d*)\s*==\s*(\S+)$/.exec(term);
    if (!comparison || !UNITLESS_NUMBER.test(comparison[2]) || (parameter && parameter !== comparison[1])) return;
    parameter = comparison[1];
  }
  return parameter;
}

function trackAssignment(
  action: Element,
  facts: Map<string, NumericFact>,
  tables: Set<string>,
  cues: Set<string>,
  queueFields?: ReadonlyMap<string, ReadonlyMap<string, NumericFact>>,
): void {
  const name = action.getAttribute('name')?.trim() ?? '';
  const storage = STORAGE.exec(name);
  if (!storage || (storage[1] && !tables.has(storage[1]) && !cues.has(storage[1]))) {
    facts.clear();
    tables.clear();
    return;
  }
  const [, qualifier, field] = storage;
  const exact = action.getAttribute('exact')?.trim() ?? '';
  const source = UNITLESS_NUMBER.test(exact) ? { line: action.lineNumber } : facts.get(exact);
  const tableLiteral = !qualifier ? parseMdTableLiteralEntries(exact) : null;
  const resolvedTableEntries = new Map<string, NumericFact>();
  if (tableLiteral) {
    for (const [entryKey, rhs] of tableLiteral) {
      const rhsFact = UNITLESS_NUMBER.test(rhs) ? { line: action.lineNumber } : facts.get(rhs);
      if (rhsFact) resolvedTableEntries.set(entryKey, rhsFact);
    }
  }
  const queueMatch = !qualifier && queueFields ? QUEUE_INDEX_READ.exec(exact) : null;
  const resolvedQueueFields = queueMatch ? queueFields?.get(queueMatch[1]) : undefined;
  // Qualified writes can alias another table or the current cue's namespace.
  // Resolve the RHS first, then forget possibly affected facts.
  for (const key of facts.keys()) {
    if (key.startsWith('event.')) continue;
    if (qualifier || key === field || key.endsWith(`.${field}`) || key.startsWith(`${field}.`)) facts.delete(key);
  }
  tables.delete(field);
  const operation = action.getAttribute('operation');
  if (action.hasAttribute('chance') || (operation && operation !== 'set')
    || action.hasAttribute('min') || action.hasAttribute('max')) return;
  if (!qualifier && tableLiteral !== null) {
    tables.add(field);
    for (const [entryKey, rhsFact] of resolvedTableEntries) facts.set(`${field}.${entryKey}`, rhsFact);
    return;
  }
  if (!qualifier && resolvedQueueFields) {
    tables.add(field);
    for (const [entryKey, qFact] of resolvedQueueFields) facts.set(`${field}.${entryKey}`, qFact);
    return;
  }
  if (source) facts.set(name, source);
}

function monitoredTimeout(action: Element): Attr | null {
  return action.getAttribute('targetmonitor') === 'true' ? action.getAttributeNode('timeout') : null;
}

function enclosingStaticRootCueName(node: Element | null, root: Element, cues: Set<string>): string | undefined {
  for (let cur = node; cur && cur !== root; cur = cur.parentElement) {
    if (isStaticRootCue(cur, root)) {
      const name = cur.getAttribute('name') || '';
      return cues.has(name) ? name : undefined;
    }
  }
  return undefined;
}

function collectMutatedFieldNames(subtree: Element): { wildcard: boolean; fields: Set<string> } {
  const fields = new Set<string>();
  let wildcard = false;
  for (const el of Array.from(subtree.getElementsByTagName('*'))) {
    if (el.namespaceURI) continue;
    const tag = el.tagName;
    if (tag === 'cue' || tag === 'library' || tag === 'param' || tag === 'input_param' || tag === 'raise_lua_event') continue;
    if (tag === 'run_actions' || tag === 'include_actions') { wildcard = true; continue; }
    for (const attrName of TIME_TRACE_LVALUE_ATTRS) {
      if (attrName === 'name' && NON_MUTATING_TIME_TRACE_TAGS.has(tag)) continue;
      const raw = el.getAttribute(attrName)?.trim();
      if (!raw) continue;
      if (raw.includes('{')) { wildcard = true; continue; }
      const m = /(\$[A-Za-z_]\w*)$/.exec(raw);
      if (m) fields.add(m[1]);
    }
  }
  return { wildcard, fields };
}

function collectCrossCueNumericInvariants(
  root: Element,
  cues: Set<string>,
): {
  cueFields: Map<string, NumericFact>;
  cueQueueFields: Map<string, Map<string, NumericFact>>;
} {
  const empty = { cueFields: new Map<string, NumericFact>(), cueQueueFields: new Map<string, Map<string, NumericFact>>() };
  if (!cues.size || root.getElementsByTagName('include_actions').length > 0) return empty;

  const taintedCueAll = new Set<string>();
  const taintedCueFields = new Set<string>();
  const taintedQueues = new Set<string>();
  const globalNonNumericSubFields = new Set<string>();

  const taintCueTarget = (raw: string, owningRootCue: string | undefined, allowQueueOps = false, tag = '', el?: Element) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const dynCue = /^([A-Za-z_]\w*)\.\{/.exec(trimmed);
    if (dynCue && cues.has(dynCue[1])) {
      taintedCueAll.add(dynCue[1]);
      return;
    }
    if (owningRootCue && /^(?:this|namespace)\.\{/.test(trimmed)) {
      taintedCueAll.add(owningRootCue);
      return;
    }
    const qElemField = /^([A-Za-z_]\w*\.\$[A-Za-z_]\w*)\.\{[^{}]+\}\.(\$[A-Za-z_]\w*)$/.exec(trimmed);
    if (qElemField) {
      taintedQueues.add(qElemField[1]);
      globalNonNumericSubFields.add(qElemField[2]);
      return;
    }
    const qElem = /^([A-Za-z_]\w*\.\$[A-Za-z_]\w*)\.\{[^{}]+\}$/.exec(trimmed);
    if (qElem) {
      if (!(allowQueueOps && tag === 'remove_value')) taintedQueues.add(qElem[1]);
      return;
    }
    const storage = STORAGE.exec(trimmed);
    if (!storage) {
      if (trimmed.includes('{')) {
        const tail = /\.(\$[A-Za-z_]\w*)$/.exec(trimmed);
        if (tail) globalNonNumericSubFields.add(tail[1]);
      }
      return;
    }
    const [, qual, field] = storage;
    const resolvedCue = qual && cues.has(qual)
      ? qual
      : (!qual || qual === 'this' || qual === 'namespace') && owningRootCue
        ? owningRootCue
        : undefined;
    if (!resolvedCue) return;
    const key = `${resolvedCue}.${field}`;
    taintedCueFields.add(key);
    if (allowQueueOps) {
      const isInitEmptyList = tag === 'set_value' && el
        && !el.hasAttribute('chance') && !el.hasAttribute('min') && !el.hasAttribute('max')
        && (!el.getAttribute('operation') || el.getAttribute('operation') === 'set')
        && /^\[\s*\]$/.test(el.getAttribute('exact')?.trim() ?? '');
      const isQueueOp = isInitEmptyList
        || (tag === 'append_to_list' && !qual?.startsWith('$') && Boolean(qual && cues.has(qual)))
        || tag === 'remove_from_list'
        || tag === 'remove_value'
        || tag === 'clear_list';
      if (!isQueueOp) taintedQueues.add(key);
    } else {
      taintedQueues.add(key);
    }
  };

  for (const el of Array.from(root.getElementsByTagName('*'))) {
    if (el.namespaceURI) continue;
    const tag = el.tagName;
    if (tag === 'mdscript' || tag === 'cues' || tag === 'cue' || tag === 'library'
      || tag === 'conditions' || tag === 'actions' || tag === 'delay' || tag === 'timing'
      || tag === 'params' || tag === 'input_param' || tag === 'raise_lua_event') continue;
    const owningCue = enclosingStaticRootCueName(el, root, cues);
    if (tag === 'param' && owningCue && el.parentElement?.tagName === 'params' && el.parentElement.parentElement?.getAttribute('name') === owningCue) {
      const pName = el.getAttribute('name')?.trim();
      if (pName) {
        taintedCueFields.add(`${owningCue}.$${pName}`);
        taintedQueues.add(`${owningCue}.$${pName}`);
      }
      continue;
    }
    const inStaticRootActions = (() => {
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (p.tagName === 'patch' || p.tagName === 'library') return false;
        if (p.tagName === 'cue' && !isStaticRootCue(p, root)) return false;
        if (p.tagName === 'actions' && isStaticRootCue(p.parentElement, root)) return true;
      }
      return false;
    })();
    if (tag === 'set_value') {
      const target = el.getAttribute('name')?.trim() ?? '';
      const st = STORAGE.exec(target);
      const exact = el.getAttribute('exact')?.trim() ?? '';
      if (!inStaticRootActions) {
        taintCueTarget(target, owningCue, false, tag, el);
        if (st?.[1]?.startsWith('$')) globalNonNumericSubFields.add(st[2]);
      } else if (! (/^\[\s*\]$/.test(exact) && !el.hasAttribute('chance') && !el.hasAttribute('min') && !el.hasAttribute('max') && (!el.getAttribute('operation') || el.getAttribute('operation') === 'set'))) {
        // Any non-`[]` set_value to Cue.$queue cannot be a list queue.
        if (st) {
          const resolvedCue = st[1] && cues.has(st[1]) ? st[1] : (!st[1] && owningCue ? owningCue : undefined);
          if (resolvedCue) taintedQueues.add(`${resolvedCue}.${st[2]}`);
        } else {
          taintCueTarget(target, owningCue, false, tag, el);
        }
      }
      continue;
    }
    if (tag === 'append_to_list' || tag === 'remove_from_list' || tag === 'remove_value') {
      const target = el.getAttribute('name')?.trim() ?? '';
      taintCueTarget(target, owningCue, inStaticRootActions, tag, el);
      continue;
    }
    if (tag === 'clear_list') {
      const target = el.getAttribute('list')?.trim() ?? '';
      taintCueTarget(target, owningCue, inStaticRootActions, tag, el);
      continue;
    }
    for (const attrName of TIME_TRACE_LVALUE_ATTRS) {
      if (attrName === 'name' && NON_MUTATING_TIME_TRACE_TAGS.has(tag)) continue;
      const raw = el.getAttribute(attrName);
      if (raw) taintCueTarget(raw, owningCue, false, tag, el);
    }
  }

  const runPass = (seedCueFields: ReadonlyMap<string, NumericFact>) => {
    const fieldWriters = new Map<string, NumericFact[]>();
    const passTaintedFields = new Set(taintedCueFields);
    const queueAppends = new Map<string, Array<Map<string, NumericFact>>>();
    const passTaintedQueues = new Set(taintedQueues);
    const passNonNumericSubFields = new Set(globalNonNumericSubFields);

    const walkCollect = (
      block: Element,
      facts: Map<string, NumericFact>,
      tables: Set<string>,
      owningCue: string,
      depth: number,
    ) => {
      if (depth >= 128) return;
      for (let child = block.firstChild; child; child = child.nextSibling) {
        if (child.nodeType !== 1) continue;
        const action = child as Element;
        const tag = action.tagName;
        if (tag === 'set_value') {
          const rawName = action.getAttribute('name')?.trim() ?? '';
          const storage = STORAGE.exec(rawName);
          const exact = action.getAttribute('exact')?.trim() ?? '';
          const preSource = UNITLESS_NUMBER.test(exact) ? { line: action.lineNumber } : facts.get(exact);
          const operation = action.getAttribute('operation');
          const plainSet = !action.hasAttribute('chance') && (!operation || operation === 'set')
            && !action.hasAttribute('min') && !action.hasAttribute('max');
          if (storage) {
            const [, qual, field] = storage;
            const targetCue = qual && cues.has(qual) ? qual : (!qual ? owningCue : undefined);
            if (targetCue) {
              const cueKey = `${targetCue}.${field}`;
              if (plainSet && preSource) {
                const list = fieldWriters.get(cueKey) ?? [];
                list.push(preSource);
                fieldWriters.set(cueKey, list);
              } else {
                passTaintedFields.add(cueKey);
              }
            }
            if (qual?.startsWith('$') && (!plainSet || !preSource)) {
              passNonNumericSubFields.add(field);
            }
          }
          trackAssignment(action, facts, tables, cues);
          continue;
        }
        if (tag === 'append_to_list') {
          const listName = action.getAttribute('name')?.trim() ?? '';
          const listStorage = STORAGE.exec(listName);
          if (listStorage && listStorage[1] && cues.has(listStorage[1]) && !taintedCueAll.has(listStorage[1])) {
            const qKey = `${listStorage[1]}.${listStorage[2]}`;
            const itemExpr = action.getAttribute('exact')?.trim() ?? '';
            const inlineTable = parseMdTableLiteralEntries(itemExpr);
            if (inlineTable !== null) {
              const itemFacts = new Map<string, NumericFact>();
              for (const [k, rhs] of inlineTable) {
                const f = UNITLESS_NUMBER.test(rhs) ? { line: action.lineNumber } : facts.get(rhs);
                if (f) itemFacts.set(k, f);
              }
              const list = queueAppends.get(qKey) ?? [];
              list.push(itemFacts);
              queueAppends.set(qKey, list);
            } else if (/^\$[A-Za-z_]\w*$/.test(itemExpr) && tables.has(itemExpr)) {
              const itemFacts = new Map<string, NumericFact>();
              const prefix = `${itemExpr}.`;
              for (const [k, f] of facts) {
                if (k.startsWith(prefix)) itemFacts.set(k.slice(prefix.length), f);
              }
              const list = queueAppends.get(qKey) ?? [];
              list.push(itemFacts);
              queueAppends.set(qKey, list);
            } else {
              passTaintedQueues.add(qKey);
            }
          }
          continue;
        }
        if (NON_MUTATING_TIME_TRACE_TAGS.has(tag)) continue;
        if (CONDITIONAL_ACTIONS.has(tag)) {
          const inside = new Map(facts);
          const parameter = comparedEventParameter(action.getAttribute('value') ?? '');
          if (parameter) inside.set(parameter, { inferred: true });
          walkCollect(action, inside, new Set(tables), owningCue, depth + 1);
          const mutated = collectMutatedFieldNames(action);
          facts.clear();
          tables.clear();
          if (!mutated.wildcard) {
            for (const [k, v] of seedCueFields) {
              const dot = k.indexOf('.');
              const sub = dot >= 0 ? k.slice(dot + 1) : k;
              if (!mutated.fields.has(sub)) facts.set(k, v);
            }
          }
          continue;
        }
        if (tag === 'do_for_each' || tag === 'do_all' || tag === 'do_while') {
          walkCollect(action, new Map(seedCueFields), new Set(), owningCue, depth + 1);
        }
        facts.clear();
        tables.clear();
      }
    };

    for (const actions of Array.from(root.getElementsByTagName('actions'))) {
      if (!isStaticRootCue(actions.parentElement, root)) continue;
      const cueName = actions.parentElement?.getAttribute('name') || '';
      if (!cues.has(cueName)) continue;
      walkCollect(actions, new Map(seedCueFields), new Set(), cueName, 0);
    }

    const nextCueFields = new Map<string, NumericFact>();
    for (const [key, writers] of fieldWriters) {
      const cueName = key.slice(0, key.indexOf('.'));
      if (taintedCueAll.has(cueName) || passTaintedFields.has(key) || !writers.length) continue;
      const inferred = writers.some(w => Boolean(w.inferred));
      const firstLine = writers.find(w => typeof w.line === 'number')?.line;
      nextCueFields.set(key, inferred ? { inferred: true } : { line: firstLine });
    }

    const nextQueueFields = new Map<string, Map<string, NumericFact>>();
    for (const [qKey, appends] of queueAppends) {
      const cueName = qKey.slice(0, qKey.indexOf('.'));
      if (taintedCueAll.has(cueName) || passTaintedQueues.has(qKey) || !appends.length) continue;
      const common = new Map<string, NumericFact>();
      const [first, ...rest] = appends;
      for (const [subField, firstFact] of first) {
        if (passNonNumericSubFields.has(subField)) continue;
        if (!rest.every(m => m.has(subField))) continue;
        const allFacts = [firstFact, ...rest.map(m => m.get(subField)!)];
        const inferred = allFacts.some(f => Boolean(f.inferred));
        const firstLine = allFacts.find(f => typeof f.line === 'number')?.line;
        common.set(subField, inferred ? { inferred: true } : { line: firstLine });
      }
      if (common.size > 0) nextQueueFields.set(qKey, common);
    }

    return { cueFields: nextCueFields, cueQueueFields: nextQueueFields };
  };

  const pass1 = runPass(new Map());
  return runPass(pass1.cueFields);
}

/** Follow definite numeric values across MD timing attributes and unambiguous static root cues. */
function lintMdTimeValues(root: Element, filePath?: string): MdPitfallFinding[] {
  let hasAnyTimingSite = false;
  let hasVariableTimingExpr = false;
  for (const el of Array.from(root.getElementsByTagName('*'))) {
    if (el.namespaceURI) continue;
    const tag = el.tagName;
    if (tag === 'cue') {
      for (const attr of ['checktime', 'checkinterval']) {
        const val = el.getAttribute(attr);
        if (val !== null) {
          hasAnyTimingSite = true;
          if (val.includes('$')) hasVariableTimingExpr = true;
        }
      }
    } else if (tag === 'delay') {
      for (const attr of ['exact', 'min', 'max']) {
        const val = el.getAttribute(attr);
        if (val !== null) {
          hasAnyTimingSite = true;
          if (val.includes('$')) hasVariableTimingExpr = true;
        }
      }
    } else if (tag === 'play_cutscene') {
      const timeout = monitoredTimeout(el);
      if (timeout) {
        hasAnyTimingSite = true;
        if (timeout.value.includes('$')) hasVariableTimingExpr = true;
      }
    } else if (TIME_ACTION_TIMEOUT_TAGS.has(tag)) {
      const val = el.getAttribute('timeout');
      if (val !== null) {
        hasAnyTimingSite = true;
        if (val.includes('$')) hasVariableTimingExpr = true;
      }
    }
  }
  if (!hasAnyTimingSite) return [];

  const findings: MdPitfallFinding[] = [];
  const seen = new Set<string>();
  const cues = hasVariableTimingExpr ? staticCueNames(root) : new Set<string>();
  const invariants = hasVariableTimingExpr
    ? collectCrossCueNumericInvariants(root, cues)
    : { cueFields: new Map<string, NumericFact>(), cueQueueFields: new Map<string, Map<string, NumericFact>>() };

  function report(owner: Element, attribute: Attr, fact: NumericFact = {}): void {
    const tagName = owner.tagName;
    const attrName = attribute.name;
    const key = `${attribute.lineNumber ?? 0}:${attribute.columnNumber ?? 0}:${tagName}/@${attrName}`;
    if (seen.has(key)) return;
    seen.add(key);
    const expression = attribute.value.trim();
    const provenance = fact.line ? ` (source line ${fact.line})` : '';
    const isBlockingCutscene = tagName === 'play_cutscene' && !fact.inferred;
    findings.push({
      code: 'md_pitfall.numeric_time_value',
      severity: isBlockingCutscene ? 'error' : 'warning',
      filePath,
      line: attribute.lineNumber,
      column: attribute.columnNumber,
      sourceRef: `${tagName}/@${attrName}`,
      detail: fact.inferred
        ? `<${tagName}> ${attrName}="${expression}" receives an event value compared with unitless numbers. Verify its type and convert it if it represents seconds.`
        : `<${tagName}> ${attrName}="${expression}" receives a unitless number${provenance}. X4 expects a time value. If this value represents seconds, use "(${expression})s".`,
    });
  }

  function checkTimingAttr(
    owner: Element,
    attrName: string,
    facts: ReadonlyMap<string, NumericFact>,
    allowLiteral: boolean,
  ): void {
    const attr = owner.getAttributeNode(attrName);
    if (!attr) return;
    const expr = attr.value.trim();
    if (!expr) return;
    if (allowLiteral && UNITLESS_NUMBER.test(expr)) {
      report(owner, attr);
      return;
    }
    const fact = facts.get(expr);
    if (fact) report(owner, attr, fact);
  }

  function walk(
    block: Element,
    facts: Map<string, NumericFact>,
    tables: Set<string>,
    visibleCues: Set<string>,
    seedFacts: ReadonlyMap<string, NumericFact>,
    queueFields: ReadonlyMap<string, ReadonlyMap<string, NumericFact>>,
    depth: number,
  ): void {
    if (depth >= 128) return;
    for (let child = block.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      const action = child as Element;
      if (action.namespaceURI) continue;
      const tag = action.tagName;
      if (tag === 'set_value') {
        trackAssignment(action, facts, tables, visibleCues, queueFields);
        continue;
      }
      if (tag === 'play_cutscene') {
        const timeout = monitoredTimeout(action);
        if (timeout) {
          const expr = timeout.value.trim();
          if (UNITLESS_NUMBER.test(expr)) report(action, timeout);
          else {
            const fact = facts.get(expr);
            if (fact) report(action, timeout, fact);
          }
        }
        continue;
      }
      if (TIME_ACTION_TIMEOUT_TAGS.has(tag)) {
        checkTimingAttr(action, 'timeout', facts, true);
        continue;
      }
      if (NON_MUTATING_TIME_TRACE_TAGS.has(tag)) continue;
      if (CONDITIONAL_ACTIONS.has(tag)) {
        const inside = new Map(facts);
        const parameter = comparedEventParameter(action.getAttribute('value') ?? '');
        if (parameter) inside.set(parameter, { inferred: true });
        walk(action, inside, new Set(tables), visibleCues, seedFacts, queueFields, depth + 1);
        const mutated = collectMutatedFieldNames(action);
        facts.clear();
        tables.clear();
        if (!mutated.wildcard) {
          for (const [k, v] of seedFacts) {
            const dot = k.indexOf('.');
            const sub = dot >= 0 ? k.slice(dot + 1) : k;
            if (!mutated.fields.has(sub)) facts.set(k, v);
          }
        }
        continue;
      }
      if (tag === 'do_for_each') {
        const inside = new Map(seedFacts);
        const insideTables = new Set<string>();
        const iterVar = action.getAttribute('name')?.trim() ?? '';
        const valVar = action.getAttribute('valuename')?.trim() ?? '';
        const inExpr = action.getAttribute('in')?.trim() ?? '';
        const qMap = !valVar && /^\$[A-Za-z_]\w*$/.test(iterVar) ? queueFields.get(inExpr) : undefined;
        if (qMap) {
          insideTables.add(iterVar);
          for (const [subField, qFact] of qMap) inside.set(`${iterVar}.${subField}`, qFact);
        }
        walk(action, inside, insideTables, visibleCues, seedFacts, queueFields, depth + 1);
        facts.clear();
        tables.clear();
        continue;
      }
      if (tag === 'do_all' || tag === 'do_while') {
        walk(action, new Map(seedFacts), new Set(), visibleCues, seedFacts, queueFields, depth + 1);
      }
      facts.clear();
      tables.clear();
    }
  }

  const noNamedCues = new Set<string>();
  const emptySeed = new Map<string, NumericFact>();
  const emptyQueues = new Map<string, Map<string, NumericFact>>();

  for (const node of Array.from(root.getElementsByTagName('*'))) {
    if (node.namespaceURI || (node.tagName !== 'cue' && node.tagName !== 'library')) continue;
    const staticRoot = isStaticRootCue(node, root);
    const visibleCues = staticRoot ? cues : noNamedCues;
    const seedFacts = staticRoot ? invariants.cueFields : emptySeed;
    const queueFields = staticRoot ? invariants.cueQueueFields : emptyQueues;

    if (node.tagName === 'cue') {
      checkTimingAttr(node, 'checktime', seedFacts, true);
      checkTimingAttr(node, 'checkinterval', seedFacts, true);
    }

    let currentFacts = new Map(seedFacts);
    let currentTables = new Set<string>();
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      const section = child as Element;
      if (section.namespaceURI) continue;
      if (section.tagName === 'delay') {
        checkTimingAttr(section, 'exact', currentFacts, false);
        checkTimingAttr(section, 'min', currentFacts, false);
        checkTimingAttr(section, 'max', currentFacts, false);
        currentFacts = new Map(seedFacts);
        currentTables = new Set<string>();
      } else if (section.tagName === 'actions') {
        walk(section, currentFacts, currentTables, visibleCues, seedFacts, queueFields, 0);
      }
    }
  }

  for (const patch of Array.from(root.getElementsByTagName('patch'))) {
    if (patch.namespaceURI) continue;
    for (const el of Array.from(patch.getElementsByTagName('*'))) {
      if (el.namespaceURI) continue;
      if (el.tagName === 'play_cutscene') {
        const timeout = monitoredTimeout(el);
        if (timeout && UNITLESS_NUMBER.test(timeout.value.trim())) report(el, timeout);
      } else if (TIME_ACTION_TIMEOUT_TAGS.has(el.tagName)) {
        checkTimingAttr(el, 'timeout', emptySeed, true);
      }
    }
  }

  return findings;
}

function enclosingNamedCue(element: Element): string | undefined {
  const names: string[] = [];
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName !== 'cue' && parent.tagName !== 'library') continue;
    const name = parent.getAttribute('name');
    if (!name) return undefined;
    names.push(name);
  }
  return names.length ? names.reverse().join('.') : undefined;
}

export const EFFECTIVE_MD_RETURN_CHECK = 'md.return_context';

export type MdReturnOwnerKind = 'ordinary-cue' | 'run-actions-library' | 'other-library'
  | 'outside-ordinary' | 'unavailable';

export interface MdReturnOwnerClassification {
  readonly kind: MdReturnOwnerKind;
  readonly owner?: Element;
  readonly purpose?: string | null;
}

const OUTSIDE_MD_RETURN: MdReturnOwnerClassification = Object.freeze({ kind: 'outside-ordinary' });
const UNAVAILABLE_MD_RETURN: MdReturnOwnerClassification = Object.freeze({ kind: 'unavailable' });
const MD_RETURN_CONTEXT_DETAIL = 'X4 rejects <return> in these MD actions. Returning to a caller requires a library declared with purpose="run_actions".';

/**
 * One local memo per stable document/view. Parent, tag and purpose reads in initial
 * mode come only from the frozen snapshot, never from the mutated final DOM.
 * Each newly encountered ancestry link is visited once across ordinary queries.
 */
export function createMdReturnOwnerClassifier(
  initial?: ReadonlyMap<Element, DiffElementState>,
): (action: Element) => MdReturnOwnerClassification {
  const memo = new WeakMap<Element, MdReturnOwnerClassification>();
  const owners = new WeakMap<Element, MdReturnOwnerClassification>();
  return action => {
    let branch: Element | null = action;
    const trail: Element[] = [];
    const seen = new Set<Element>();
    let result = OUTSIDE_MD_RETURN;
    while (branch) {
      const prior = memo.get(branch);
      if (prior) { result = prior; break; }
      if (seen.has(branch)) { result = UNAVAILABLE_MD_RETURN; break; }
      seen.add(branch);
      trail.push(branch);
      const state = initial?.get(branch);
      if (initial && !state) { result = UNAVAILABLE_MD_RETURN; break; }
      const parent: Element | null = initial ? state!.parent : branch.parentElement;
      if (!parent) break;
      const parentState = initial?.get(parent);
      if (initial && !parentState) { result = UNAVAILABLE_MD_RETURN; break; }
      const parentTag = initial ? parentState!.elementName : parent.tagName;
      // Check a semantic boundary before inheriting any cached ancestor context.
      if (parentTag === 'patch' || parentTag === 'on_abort' || parentTag === 'editable') break;
      if (parentTag === 'cue' || parentTag === 'library') {
        const branchTag = initial ? state!.elementName : branch.tagName;
        if (branchTag === 'actions') {
          let cachedOwner = owners.get(parent);
          if (!cachedOwner) {
            const purpose = parentTag === 'library'
              ? (initial ? parentState!.attributes.purpose ?? null : parent.getAttribute('purpose')) : undefined;
            cachedOwner = Object.freeze({ owner: parent, kind: parentTag === 'cue' ? 'ordinary-cue'
              : purpose === 'run_actions' ? 'run-actions-library' : 'other-library', purpose });
            owners.set(parent, cachedOwner);
          }
          result = cachedOwner;
        }
        break;
      }
      branch = parent;
    }
    for (const element of trail) memo.set(element, result);
    return result;
  };
}

/** Only the nearest cue or library can own an ordinary actions branch. */
function ordinaryMdActionOwner(action: Element, classify = createMdReturnOwnerClassifier()): Element | undefined {
  return classify(action).owner;
}

/**
 * Check the shared return-owner rule against one successfully composed MD DOM.
 * The historic export name is retained for existing callers. Ordinary cues and
 * non-run libraries forbid returns; no DOM or historical gap escapes this pass.
 */
export function lintEffectiveMdCueReturns(filePath: string, trace: DiffElementProvenance | undefined): {
  findings: MdPitfallFinding[];
  gaps: Array<{ filePath: string; reason: string }>;
} {
  const findings: MdPitfallFinding[] = [];
  const gaps: Array<{ filePath: string; reason: string }> = [];
  const seenGaps = new Set<string>();
  const gap = (reason: string) => {
    const bounded = reason.slice(0, 480);
    if (!seenGaps.has(bounded)) { seenGaps.add(bounded); gaps.push({ filePath, reason: bounded }); }
  };
  if (!trace?.available || !trace.document?.documentElement) {
    gap(trace?.reason || 'Final MD element provenance is unavailable; return ownership was not checked.');
    return { findings, gaps };
  }
  const root = trace.document.documentElement;
  if (root.nodeName !== 'mdscript') {
    gap('The final document is not an MD script; ordinary return ownership is unavailable.');
    return { findings, gaps };
  }
  const finalOwner = createMdReturnOwnerClassifier();
  const initialOwner = createMdReturnOwnerClassifier(trace.initial);
  const labels = new WeakMap<Element, string | undefined>();
  const label = (owner: Element) => {
    if (!labels.has(owner)) labels.set(owner, owner.getAttribute('name')?.slice(0, 160) || undefined);
    return labels.get(owner);
  };
  const ordinals = new Map<Element, number>();
  for (const element of trace.elements.keys()) ordinals.set(element, ordinals.size);
  const identity = (element: Element): string | undefined => {
    const original = trace.initial.get(element);
    if (original) return `b:${original.id}`;
    const ordinal = ordinals.get(element);
    return ordinal === undefined ? undefined : `a:${ordinal}`;
  };
  const pending = [{ element: root, foreignNamespace: false }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    const action = current.element;
    if (++count > 50_000) {
      gap('Final MD return inventory exceeds the 50000-element context budget.');
      // A partial traversal cannot establish the complete contextual verdict.
      return { findings: [], gaps };
    }
    // A default namespace written by a patch does not mutate xmldom's existing
    // namespaceURI, but it can change the serialized document's meaning.
    const foreignNamespace = current.foreignNamespace || !!action.namespaceURI || !!action.getAttribute('xmlns');
    for (let index = action.childNodes.length - 1; index >= 0; index--) {
      const child = action.childNodes[index];
      if (child.nodeType === 1) pending.push({ element: child as Element, foreignNamespace });
    }
    if (action.nodeName !== 'return') continue;
    if (foreignNamespace) {
      gap('A return uses an unsupported final XML namespace context.');
      continue;
    }
    const context = finalOwner(action);
    if (context.kind === 'outside-ordinary' || context.kind === 'run-actions-library') continue;
    const original = trace.initial.get(action);
    if (original && original.elementName !== 'return') {
      gap('The final return identity does not match its frozen original element.');
      continue;
    }
    const before = original ? initialOwner(action) : undefined;
    if (context.kind === 'unavailable' || before?.kind === 'unavailable') {
      gap('The final or canonical-before return owner could not be established.');
      continue;
    }
    if (context.kind === 'ordinary-cue' && before?.kind === 'ordinary-cue') continue;
    if (context.kind === 'other-library' && before?.kind === 'other-library' && context.owner === before.owner) {
      // Different non-run purpose strings do not introduce an inherited error:
      // this return was already forbidden in the canonical owner context.
      continue;
    }
    const origin = original && context.kind === 'other-library' && context.owner
      && before?.kind === 'run-actions-library' && before.owner === context.owner
      ? trace.attributes.get(context.owner)?.get('purpose')
      : trace.elements.get(action);
    const actionId = identity(action);
    const ownerId = context.owner && identity(context.owner);
    if (!origin || origin.reason || !Number.isInteger(origin.line) || !Number.isInteger(origin.column)
      || (origin.line ?? 0) < 1 || (origin.column ?? 0) < 1 || !actionId || !ownerId) {
      gap(origin?.reason || 'The newly affected MD return has no reliable original authored cause position.');
      continue;
    }
    findings.push({ code: 'md_pitfall.return_context', severity: 'error', filePath,
      line: origin.line, column: origin.column, sourceRef: `md.return_context:${JSON.stringify([filePath, actionId, ownerId])}`,
      cue: context.owner ? label(context.owner) : undefined, detail: MD_RETURN_CONTEXT_DETAIL });
  }
  return { findings, gaps };
}

const DESTROYED_EVENT_SOURCE_CODE = 'md_pitfall.destroyed_event_source_required';
export const EFFECTIVE_MD_DESTROYED_EVENT_CHECK = 'diff.md_destroyed_event_source';
const DESTROYED_EVENT_SOURCE_DETAIL = '<event_object_destroyed> needs an event source. Supply object="$Ship" for one object or group="$Watched" for a group. X4 rejects this event on load when both are absent.';

function unsourcedDestroyedEvents(root: Element, onForeignNamespace?: () => void): Array<{ event: Element; cue?: string }> {
  if (root.nodeName !== 'mdscript') return [];
  const missing: Array<{ event: Element; cue?: string }> = [];
  for (const event of Array.from(root.getElementsByTagName('event_object_destroyed'))) {
    if (event.hasAttribute('object') || event.hasAttribute('group')) continue;
    let parent = event.parentElement;
    while (parent?.tagName === 'check_any' || parent?.tagName === 'check_all') parent = parent.parentElement;
    const owner = parent?.tagName === 'conditions' ? parent.parentElement : null;
    if (!owner || (owner.tagName !== 'cue' && owner.tagName !== 'library') || owner.parentElement?.tagName !== 'cues') continue;

    let inScope = true;
    for (let ancestor: Element | null = event; ancestor; ancestor = ancestor.parentElement) {
      // A composed diff may set xmlns on an existing node without updating its DOM namespaceURI.
      if (ancestor.namespaceURI || ancestor.getAttribute('xmlns')) { inScope = false; break; }
      if (ancestor === root) break;
    }
    if (inScope) missing.push({ event, cue: owner.getAttribute('name') || undefined });
    else onForeignNamespace?.();
  }
  return missing;
}

/** Report newly unsourced events at the final authored cause, using the existing diff trace. */
export function lintEffectiveMdDestroyedEvents(filePath: string, trace: DiffElementProvenance | undefined): {
  findings: MdPitfallFinding[];
  gaps: Array<{ filePath: string; reason: string }>;
} {
  const root = trace?.document?.documentElement;
  if (!trace?.available || !root) return { findings: [], gaps: [{ filePath,
    reason: trace?.reason || 'Effective MD element provenance is unavailable for event source validation.' }] };
  if (root.nodeName !== 'mdscript') return { findings: [], gaps: [{ filePath,
    reason: 'The final document is not an MD script. Destruction event sources could not be checked.' }] };

  const findings: MdPitfallFinding[] = [];
  const reasons = new Set<string>();
  const events = unsourcedDestroyedEvents(root, () => {
    reasons.add('A destruction event uses an unsupported final XML namespace context.');
  });
  for (const [ordinal, { event, cue }] of events.entries()) {
    const original = trace.initial.get(event);
    if (original && !Object.hasOwn(original.attributes, 'object') && !Object.hasOwn(original.attributes, 'group')) continue;
    const attributes = trace.attributes.get(event);
    const object = attributes?.get('object');
    const group = attributes?.get('group');
    const removal = object && (!group || object.operation > group.operation) ? object : group;
    const cause = removal ?? trace.elements.get(event);
    if (!cause || cause.reason || !Number.isInteger(cause.line) || !Number.isInteger(cause.column)
      || (cause.line ?? 0) < 1 || (cause.column ?? 0) < 1) {
      reasons.add(cause?.reason || 'The newly unsourced destruction event has no reliable authored location.');
      continue;
    }
    findings.push({ code: DESTROYED_EVENT_SOURCE_CODE, severity: 'error', filePath, cue,
      line: cause.line, column: cause.column,
      sourceRef: `event_object_destroyed:${original ? `base:${original.id}` : `added:${ordinal}`}`, detail: DESTROYED_EVENT_SOURCE_DETAIL });
  }
  return { findings, gaps: [...reasons].map(reason => ({ filePath, reason })) };
}

/**
 * Lint one MD file. `propertyUnion` (from the scriptproperty index) makes the param3
 * lint union-aware; without it the param3 lint stays conservative (identifier must
 * look like a custom key: it is flagged only when it contains no known-property hit,
 * so with no union supplied we skip the lint entirely rather than guess).
 */
export function lintMdPitfalls(xml: string, opts: { propertyUnion?: Set<string>; propertyIndex?: ScriptPropertyIndex; filePath?: string;
  variableAvailability?: MdVariableAvailabilityContext; initialStateGaps?: ValidationCoverageGap[] } = {}): MdPitfallFinding[] {
  const out: MdPitfallFinding[] = [];
  if (!xml || typeof xml !== 'string' || !/<mdscript\b/i.test(xml)) return out;
  const masked = maskNonExpressionSpans(xml);

  // DOM parse for the cue-tree lints
  const hasVariableFlow = xml.includes('<remove_value') || (xml.includes('<do_if') && (xml.includes('?') || xml.includes('&#')));
  const candidateAvailability = opts.filePath ? availabilityOwn(opts.variableAvailability?.files, availabilityPath(opts.filePath)) : undefined;
  const availability = candidateAvailability?.source === xml ? candidateAvailability : undefined;
  const leadingBom = xml.startsWith('\uFEFF');
  const source = leadingBom ? xml.slice(1) : xml;
  let doc: Document;
  let parseError = false;
  try {
    doc = new DOMParser({ onError: () => { parseError = true; } }).parseFromString(source, 'text/xml');
  } catch { return out; }
  const element = doc.documentElement;
  // Non-MD and malformed XML produce no semantic finding here; structural/wellformedness validation owns those diagnostics.
  if (!element || element.nodeName !== 'mdscript' || parseError) return out;
  const root = element as unknown as ElementLike;
  if (hasVariableFlow || availability) out.push(...lintLocalVariableReads(element, normalizeLineEndings(source), opts.filePath,
    leadingBom, availability, opts.variableAvailability, opts.initialStateGaps));
  for (const { event, cue } of unsourcedDestroyedEvents(element)) {
    const column = leadingBom && event.lineNumber === 1 && event.columnNumber ? event.columnNumber + 1 : event.columnNumber;
    out.push({ code: DESTROYED_EVENT_SOURCE_CODE, severity: 'error', filePath: opts.filePath, cue,
      line: event.lineNumber, column, sourceRef: 'event_object_destroyed', detail: DESTROYED_EVENT_SOURCE_DETAIL });
  }
  // The original cue-tree lints stop when their parser sees a leading BOM outside the root.
  if (leadingBom) return out;
  out.push(...lintMdTimeValues(element, opts.filePath));

  for (const cue of Array.from(element.getElementsByTagName('*'))) {
    if (cue.namespaceURI || (cue.tagName !== 'cue' && cue.tagName !== 'library')
      || cue.parentElement?.tagName !== 'cues') continue;
    const conditions = Array.from(cue.children).find(child => child.tagName === 'conditions');
    const name = cue.getAttribute('name') || '(unnamed)';
    const { finding } = analyzeMdCueTrigger(conditions ? Array.from(conditions.children, mdConditionKind) : [], name, {
      checkinterval: cue.getAttribute('checkinterval'), onfail: cue.getAttribute('onfail'),
      instantiate: cue.getAttribute('instantiate'), ref: cue.getAttribute('ref'), libPurpose: cue.getAttribute('purpose'),
    });
    if (!finding) continue;
    out.push({ code: `md_pitfall.${finding.code}`, severity: 'error', filePath: opts.filePath, cue: name,
      line: cue.lineNumber, column: cue.columnNumber, detail: finding.detail });
  }

  const classifyReturnOwner = createMdReturnOwnerClassifier();
  for (const action of Array.from(element.getElementsByTagName('return'))) {
    const owner = ordinaryMdActionOwner(action, classifyReturnOwner);
    if (!owner || classifyReturnOwner(action).kind === 'run-actions-library') continue;
    out.push({
      code: 'md_pitfall.return_context',
      severity: 'error',
      filePath: opts.filePath,
      cue: enclosingNamedCue(action),
      line: action.lineNumber,
      column: action.columnNumber,
      detail: MD_RETURN_CONTEXT_DETAIL,
    });
  }

  const offerOccurrences = new Map<string, number>();
  for (const event of Array.from(element.getElementsByTagName('event_offer_accepted'))) {
    const attribute = event.getAttributeNode('cue');
    if (!attribute || !/^(parent|this|static)$/i.test(attribute.value)) continue;
    const cue = enclosingNamedCue(event);
    const key = JSON.stringify([cue, attribute.value]);
    const occurrence = (offerOccurrences.get(key) ?? 0) + 1;
    offerOccurrences.set(key, occurrence);
    out.push({
      code: 'md_pitfall.offer_accepted_keyword_cue',
      severity: 'warning',
      filePath: opts.filePath,
      cue,
      // Remembered reviews distinguish source references independently of columns.
      sourceRef: occurrence > 1 ? `#${occurrence} ${cue ?? 'event_offer_accepted'}` : cue,
      line: attribute.lineNumber ?? event.lineNumber,
      column: attribute.columnNumber ?? event.columnNumber,
      detail: `<event_offer_accepted cue="${attribute.value}"> validates clean but never fires in-game — the engine does not resolve cue keywords for this event at register time (proven 2026-07-01; also kuertee: "event_offer_accepted doesn't work"). Use the proven accept pattern instead: listen <event_object_signalled object="$Client" param="'accept'"/> after create_mission / set_objective, or store the offer cue in a variable (<set_value name="$OfferCue" exact="this"/> … cue="$OfferCue").${opts.filePath ? ` (${opts.filePath})` : ''}`,
    });
  }

  // Prior X4 9.00 station probe (#635): products? was false on producing stations,
  // whereas products.count worked. Gate the advisory on actual corpus metadata;
  // do not infer a receiver type or generalize to every pseudo datatype.
  const model = opts.propertyIndex?.model;
  const productDefinitions = model ? [...model.datatypes.values()].flatMap(entry =>
    entry.properties.filter(property => property.name === 'products')) : [];
  if (model?.datatypes.get('warelist')?.pseudo && productDefinitions.length
    && productDefinitions.every(property => property.type === 'warelist')) {
    const elements = root.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i] as unknown as { attributes: ArrayLike<{ name: string; value: string }>; lineNumber?: number };
      for (let a = 0; a < element.attributes.length; a++) {
        const attr = element.attributes[a];
        // Expression-valued attributes only. DOM decoding precedes MD string masking.
        if (!['value', 'exact', 'min', 'max', 'chance', 'weight'].includes(attr.name)) continue;
        const expression = attr.value.replace(/'[^']*'|"[^"]*"/g, match => ' '.repeat(match.length));
        if (!/\.products\?(?![\w$])/.test(expression)) continue;
        out.push({ code: 'md_pitfall.products_existence', severity: 'warning', filePath: opts.filePath,
          line: element.lineNumber,
          detail: 'Reported X4 9.00 station trap: .products? returned false on producing stations. The loaded scriptproperties.xml defines products as pseudo warelist. For a valid station, test .products.count gt 0 before selecting a product. Receiver type and current game behavior are not established by this advisory; .$products? table keys are a different expression.' });
      }
    }
  }

  // ---- 4. cancel_conversation runtime semantic requiredness -----------------------------
  const cancelElements = root.getElementsByTagName('cancel_conversation');
  const cancelOffsets = openingTagOffsets(xml, 'cancel_conversation');
  for (let index = 0; index < cancelElements.length; index++) {
    const element = cancelElements[index];
    if (hasXmlAttribute(element, 'actor') || hasXmlAttribute(element, 'template')) continue;
    const offset = cancelOffsets[index];
    if (offset === undefined) continue; // skip when exact source mapping is unavailable; never fabricate a finding.
    out.push({
      code: 'md_pitfall.cancel_conversation_actor_or_template',
      severity: 'error',
      filePath: opts.filePath,
      line: lineOf(xml, offset),
      detail: `X4 emits the engine ERROR "Neither of the attributes 'actor' and 'template' is present!" at startup/load when <cancel_conversation> has neither attribute. This makes Forge validation non-clean; the engine diagnostic alone does not establish whole-file or whole-frame failure (the tested compact/expanded UI still rendered and END closed the conversation). Use a valid target, for example <cancel_conversation actor="$Guide"/> or <cancel_conversation template="$Guide" context="$Context"/>. X4 common.xsd marks actor and template individually optional; this is a runtime semantic rule, not an XSD-enforced disjunction.`,
    });
  }

  const cuesBlocks = directElementChildren(root, 'cues');
  const rootCues = cuesBlocks.flatMap(b => directElementChildren(b, 'cue'));

  // reset/cancel targets by NAME anywhere in the file (masked text, cheap)
  const resetTargets = new Set<string>();
  {
    const re = /<(?:reset_cue|cancel_cue)\b[^>]*\bcue\s*=\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      const ref = m[1].trim();
      const local = ref.startsWith('this.') ? ref.slice(5) : ref;
      resetTargets.add(local.split('.').pop() || local);
    }
  }

  // ---- 1. root-level one-shot event_ui_triggered listener ----
  for (const cue of rootCues) {
    if ((cue.getAttribute('instantiate') || '').toLowerCase() === 'true') continue;
    const name = cue.getAttribute('name') || '';
    const conditions = directElementChildren(cue, 'conditions')[0];
    if (!conditions) continue;
    const hasUiEvent = conditions.getElementsByTagName('event_ui_triggered').length > 0;
    if (!hasUiEvent) continue;
    if (name && resetTargets.has(name)) continue; // something re-arms it by name
    const subtree = cue.toString();
    if (/<(?:reset_cue|cancel_cue)\b[^>]*\bcue\s*=\s*"(?:this|parent|static|namespace)"/i.test(subtree)) continue; // keyword self-reset
    out.push({
      code: 'md_pitfall.ui_listener_one_shot',
      severity: 'warning',
      cue: name || '(unnamed)',
      detail: `Cue "${name || '(unnamed)'}" listens for <event_ui_triggered> without instantiate="true" and is never reset — it fires ONCE then completes forever, so the UI handler goes dead after the first event (the exact 2026-06-25 On_action bug). Add instantiate="true" (with namespace="this" for its $vars) or re-arm it with reset_cue. Vanilla has zero root-level one-shot UI listeners.${opts.filePath ? ` (${opts.filePath})` : ''}`,
    });
  }

  // ---- 3. param3 table bare-key access (union-aware; skipped without a union) ----
  if (opts.propertyUnion && opts.propertyUnion.size) {
    const union = opts.propertyUnion;
    const allCues = root.getElementsByTagName('cue');
    const seen = new Set<string>();
    const scanScope = (scopeXml: string) => {
      const scopeMasked = maskNonExpressionSpans(scopeXml);
      const setRe = /<set_value\s+name="(\$\w+)"\s+exact="event\.param3"\s*\/?\s*>/gi;
      let m: RegExpExecArray | null;
      while ((m = setRe.exec(scopeMasked)) !== null) {
        const varName = m[1];
        const tail = scopeMasked.slice(m.index + m[0].length);
        const accessRe = new RegExp(varName.replace('$', '\\$') + '\\.(?![\\$\\{])([A-Za-z_]\\w*)', 'g');
        let a: RegExpExecArray | null;
        while ((a = accessRe.exec(tail)) !== null) {
          const ident = a[1].replace(/\?$/, '').toLowerCase();
          if (union.has(ident)) continue; // real script property — legal read
          const key = `${varName}.${ident}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            code: 'md_pitfall.param3_table_barekey',
            severity: 'warning',
            detail: `"${varName}.${a[1]}" reads a bare key off ${varName} = event.param3 (a Lua table from AddUITriggeredEvent). A bare identifier is a PROPERTY lookup — "${a[1]}" is not a known script property, so the expression is silently false and the branch skips (the 2026-06-25 silent killer). You almost certainly meant "${varName}.$${a[1]}" (variable key).${opts.filePath ? ` (${opts.filePath})` : ''}`,
          });
        }
      }
    };
    if (allCues.length) {
      for (let i = 0; i < allCues.length; i++) {
        // only leaf-ish scope scan: the cue's own serialized subtree keeps var scoping local
        scanScope(allCues[i].toString());
      }
    } else {
      scanScope(xml);
    }
  }

  // ---- 5. raw engine IDs (.id / owner.id / macro.id / faction.id) in player-visible text ----
  out.push(...lintMdRawEngineIdInPlayerText(element, opts.filePath));

  // ---- 6. FF-28 (#67): <event_object_order_cancelled> without override-suspension guard ----
  out.push(...lintMdOrderCancelledOverrideSuspension(element, opts.filePath));

  return out;
}

const MD_ORDER_OVERRIDE_GUARD_RE = /\.isoverride\b|(?:event\.param|\$[A-Za-z_]\w*)\.exists\b|\.orders\.(?:indexof|count)\b/;

function walkOwnCueSubtree(node: Element, visit: (el: Element) => void): void {
  if (node.namespaceURI) return;
  visit(node);
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    if (el.namespaceURI || el.tagName === 'cues') continue;
    walkOwnCueSubtree(el, visit);
  }
}

function directDomChild(parent: Element, tagName: string): Element | undefined {
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 && !(child as Element).namespaceURI && (child as Element).tagName === tagName) {
      return child as Element;
    }
  }
  return undefined;
}

function lintMdOrderCancelledOverrideSuspension(root: Element, filePath?: string): MdPitfallFinding[] {
  const findings: MdPitfallFinding[] = [];
  const cues = Array.from(root.getElementsByTagName('cue'));
  for (const cue of cues) {
    if (cue.namespaceURI || cue.hasAttribute('ref')) continue;
    const conditions = directDomChild(cue, 'conditions');
    if (!conditions) continue;
    const cancelledEvents = Array.from(conditions.getElementsByTagName('event_object_order_cancelled'))
      .filter(ev => !ev.namespaceURI);
    if (cancelledEvents.length === 0) continue;

    const actions = directDomChild(cue, 'actions');
    let hasOverrideGuard = false;
    let requeuesOrder = false;
    const inspectNode = (el: Element) => {
      if (el.tagName === 'create_order') requeuesOrder = true;
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (!attr.value || attr.name === 'comment') continue;
        if (MD_ORDER_OVERRIDE_GUARD_RE.test(maskMdQuotedLiterals(attr.value))) {
          hasOverrideGuard = true;
        }
      }
    };
    walkOwnCueSubtree(conditions, inspectNode);
    if (actions) walkOwnCueSubtree(actions, inspectNode);
    if (hasOverrideGuard) continue;

    for (const ev of cancelledEvents) {
      let pairedWithFinished = false;
      for (let parent = ev.parentElement; parent && parent !== conditions; parent = parent.parentElement) {
        if (!parent.namespaceURI && parent.tagName === 'check_any') {
          if (Array.from(parent.getElementsByTagName('event_object_order_finished')).some(fin => !fin.namespaceURI)) {
            pairedWithFinished = true;
            break;
          }
        }
      }
      if (pairedWithFinished) continue;

      const cueName = enclosingNamedCue(ev);
      findings.push({
        code: 'md_pitfall.order_cancelled_override_suspension',
        severity: 'info',
        filePath,
        cue: cueName,
        line: ev.lineNumber,
        column: ev.columnNumber,
        sourceRef: 'event_object_order_cancelled',
        detail: `Cue "${cueName || '(unnamed)'}" listens for <event_object_order_cancelled> without guarding against temporary override suspension: in X4 9.00, override orders (e.g. aiscripts/interrupt.attacked.xml Attack/Flee with override="true") suspend rather than delete the running order and still fire <event_object_order_cancelled>${requeuesOrder ? ' — re-issuing <create_order> here can queue a duplicate order while the suspended order is still waiting to resume' : ''}. Guard permanent-removal handlers with <check_value value="not event.param.exists"/> (vanilla md/factionsubgoal_recon.xml), not $Ship.orders.indexof.{$Order}, or branch on @$Order.exists and @$Ship.order.isoverride.${filePath ? ` (${filePath})` : ''}`,
      });
    }
  }
  return findings;
}

const MD_RAW_ID_EXPR_RE = /\.(?:owner\.|trueowner\.|macro\.|faction\.)?id\b(?!code)/;
const MD_PLAYER_TEXT_SINKS = new Set(['write_to_logbook', 'show_notification', 'show_help', 'write_incoming_message']);
const MD_PLAYER_TEXT_ATTRS = ['text', 'title', 'custom', 'source'] as const;

function maskMdQuotedLiterals(expr: string): string {
  return expr.replace(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g, match => ' '.repeat(match.length));
}

function lintMdRawEngineIdInPlayerText(root: Element, filePath?: string): MdPitfallFinding[] {
  const findings: MdPitfallFinding[] = [];
  const assignments = new Map<string, string[]>();
  const allElements = Array.from(root.getElementsByTagName('*'));
  for (const el of allElements) {
    if (el.namespaceURI || el.tagName !== 'set_value') continue;
    const varName = el.getAttribute('name')?.trim() || '';
    if (!/^\$[A-Za-z_]\w*$/.test(varName)) continue;
    const exact = el.getAttribute('exact') || '';
    const list = assignments.get(varName) || [];
    list.push(exact);
    assignments.set(varName, list);
  }
  const idOnlyVars = new Set<string>();
  for (const [varName, exprs] of assignments) {
    if (exprs.length > 0 && exprs.every(expr => {
      const unquoted = maskMdQuotedLiterals(expr);
      return MD_RAW_ID_EXPR_RE.test(unquoted) && !/\.(?:knownname|name)\b/.test(unquoted);
    })) {
      idOnlyVars.add(varName);
    }
  }

  for (const el of allElements) {
    if (el.namespaceURI || !MD_PLAYER_TEXT_SINKS.has(el.tagName)) continue;
    for (const attrName of MD_PLAYER_TEXT_ATTRS) {
      const attr = el.getAttributeNode(attrName);
      if (!attr || !attr.value) continue;
      const unquoted = maskMdQuotedLiterals(attr.value);
      const directMatch = MD_RAW_ID_EXPR_RE.exec(unquoted);
      let leakedToken = directMatch ? directMatch[0] : undefined;
      if (!leakedToken && idOnlyVars.size > 0) {
        for (const varName of idOnlyVars) {
          const escaped = varName.replace(/\$/g, '\\$');
          if (new RegExp(`${escaped}(?![\\w.])`).test(unquoted)) {
            leakedToken = varName;
            break;
          }
        }
      }
      if (!leakedToken) continue;
      findings.push({
        code: 'md_pitfall.raw_engine_id_in_player_text',
        severity: 'warning',
        filePath,
        cue: enclosingNamedCue(el),
        line: attr.lineNumber ?? el.lineNumber,
        column: attr.columnNumber ?? el.columnNumber,
        sourceRef: `${el.tagName}/@${attrName}`,
        detail: `<${el.tagName}> ${attrName}="${attr.value.slice(0, 120)}" interpolates raw engine ID "${leakedToken}" into player-visible text. Use .knownname or .name (or .idcode for ship hull codes) instead of exposing internal engine IDs.${filePath ? ` (${filePath})` : ''}`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Oracle — fixtures mirror probed vanilla shapes + the real bug shapes.
 * ------------------------------------------------------------------ */

const UNION_FIXTURE = new Set(['count', 'buildobject', 'roleobject', 'npctemplate', 'assignedcontrolled', 'formatted', 'exists', 'name']);

export function runMdPitfallSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
  const lint = (xml: string) => lintMdPitfalls(xml, { propertyUnion: UNION_FIXTURE });
  const removalCode = 'md_pitfall.variable_read_after_removal';
  const removalRows = (actions: string[], cueAttributes = '') => lintMdPitfalls([
    '\uFEFF<mdscript name="Removal"><cues>', `<cue name="Removal"${cueAttributes}><actions>`, ...actions,
    '</actions></cue></cues></mdscript>',
  ].join('\r\n'), { filePath: 'md/removal.xml' }).filter(row => row.code === removalCode);
  const removal = '<remove_value name="$Value"/>';
  const reading = '<debug_text text="&#36;Value.hull"/>';
  const sameLine = reading + reading;
  const duplicateReads = removalRows([removal, sameLine]);
  ok('removed variable reads retain exact distinct XML entity positions', duplicateReads.length === 2
    && duplicateReads[0].line === 4 && duplicateReads[0].column === sameLine.indexOf('&#36;') + 1
    && duplicateReads[1].line === 4 && duplicateReads[1].column === sameLine.lastIndexOf('&#36;') + 1
    && duplicateReads.every(row => row.severity === 'warning' && row.filePath === 'md/removal.xml'), duplicateReads);
  const firstLine = `\uFEFF<mdscript><cues><cue><actions>${removal}${reading}</actions></cue></cues></mdscript>`;
  const bomReads = lint(firstLine).filter(row => row.code === removalCode);
  ok('removed variable location includes a first-line BOM in the original XML', bomReads.length === 1
    && bomReads[0].line === 1 && bomReads[0].column === firstLine.indexOf('&#36;') + 1, bomReads);
  const restoredReads = removalRows([removal, '<set_value name="$Value" exact="$Value"/>', reading]);
  ok('assignment RHS is checked before the assignment invalidates the removal fact', restoredReads.length === 1
    && restoredReads[0].sourceRef === 'set_value/@exact' && restoredReads[0].line === 4, restoredReads);
  const guardedRemoval = removalRows([removal, '<do_if value="$Value?"><debug_text text="\'exists\'"/></do_if>',
    '<do_else><debug_text text="\'absent\'"/></do_else>', '<set_value name="$Observed" exact="$Value"/>']);
  ok('log-only existence branches preserve absence through the next strict read', guardedRemoval.length === 1
    && guardedRemoval[0].line === 6, guardedRemoval);
  ok('removal diagnostics require an observed removal and an ordinary strict local read',
    removalRows([reading]).length === 0
    && removalRows(['<remove_value name="$Value" chance="50"/>', reading]).length === 0
    && removalRows([removal, '<debug_text text="@$Value.hull"/><debug_text text="$Value?"/>'
      + '<debug_text text="\'$Value\'"/><debug_text text="$value"/><debug_text text="Other.$Value"/>']).length === 0
    && removalRows([removal, reading], ' ref="External"').length === 0);
  const conditionalLog = removalRows([removal, '<debug_text text="$Value" chance="0"/>', reading]);
  ok('a conditional log does not report a read or invalidate absence', conditionalLog.length === 1
    && conditionalLog[0].line === 5, conditionalLog);
  ok('a possible write or suspension invalidates the known removal',
    removalRows([removal, '<set_value name="$Value" exact="1" chance="50"/>', reading]).length === 0
    && removalRows([removal, '<set_value name="namespace.$Value" exact="1"/>', reading]).length === 0
    && removalRows([removal, '<wait exact="1s"/>', reading]).length === 0
    && removalRows([removal, '<do_if value="$Other?"><set_value name="$Value" exact="1"/></do_if>', reading]).length === 0);
  ok('foreign, malformed and raw diff content is outside the removal proof',
    removalRows([removal, '<debug_text xmlns="urn:foreign" text="$Value"/>']).length === 0
    && lint(`<mdscript><cues xmlns="urn:foreign"><cue xmlns=""><actions>${removal}${reading}</actions></cue></cues></mdscript>`)
      .every(row => row.code !== removalCode)
    && lint(`<diff><add sel="/mdscript">${removal}${reading}</add></diff>`).every(row => row.code !== removalCode)
    && lint(`<mdscript><cues><cue><actions>${removal}${reading}</invalid>`).every(row => row.code !== removalCode));
  const absenceCode = 'md_pitfall.variable_read_when_absent';
  const flowRows = (body: string) => lintMdPitfalls(`<mdscript name="Removal"><cues>${body}</cues></mdscript>`,
    { filePath: 'md/flow.xml' }).filter(row => row.code === absenceCode || row.code === removalCode);
  const rootFlow = (actions: string) => flowRows(`<cue name="Root"><actions>${actions}</actions></cue>`);
  const positiveCondition = `<do_if value="$Value?">${reading}</do_if>`;
  const negativeCondition = `<do_if value="not $Value&#63;">${reading}</do_if>`;
  const falseArm = `<do_else>${reading}</do_else>`;
  ok('a negated existence test reports its strict read at the authored entity',
    rootFlow(negativeCondition)[0]?.code === absenceCode
    && rootFlow(negativeCondition)[0]?.column === (`<mdscript name="Removal"><cues><cue name="Root"><actions>` + negativeCondition).lastIndexOf('&#36;') + 1);
  ok('present guard is quiet and its else arm proves absence', rootFlow(positiveCondition).length === 0
    && rootFlow(positiveCondition + falseArm).length === 1 && rootFlow(positiveCondition + falseArm)[0].code === absenceCode);
  ok('known absence skips the unreachable present branch without dropping the removal',
    rootFlow(removal + positiveCondition + reading).length === 1
    && rootFlow(removal + positiveCondition + reading)[0].code === removalCode);
  ok('absence must hold on every reachable path after a branch',
    rootFlow(`<do_if value="$Value?">${removal}</do_if>${reading}`)[0]?.code === absenceCode
    && rootFlow(`<do_if value="not $Value?">${removal}</do_if>${reading}`).length === 0
    && rootFlow(`<do_if value="$Other?">${removal}</do_if><do_else>${removal}</do_else>${reading}`)[0]?.code === removalCode
    && rootFlow(removal + '<do_if value="not $Value?"><set_value name="$Value" exact="1"/></do_if>' + reading).length === 0);
  ok('chance, comparisons, else-if chains and foreign branches stay outside existence flow',
    rootFlow('<do_if value="$Value?" chance="0"/>' + falseArm).length === 0
    && rootFlow('<do_if value="$Value?" exact="false"/>' + falseArm).length === 0
    && rootFlow('<do_if value="$Value?"/><do_elseif value="true"/>' + falseArm).length === 0
    && rootFlow('<do_if xmlns="urn:foreign" value="$Value?"/>' + falseArm).length === 0);
  const childFlow = (actions: string, parentAttributes = '', childAttributes = ' namespace="this"') => flowRows(
    `<cue name="Parent"${parentAttributes}><actions>${removal}</actions><cues>`
    + `<cue name="Child"${childAttributes}><actions>${actions}</actions></cue></cues></cue>`);
  ok('nested plain cues analyze their own flow and start with unknown entry state', childFlow(reading).length === 0
    && childFlow(negativeCondition)[0]?.cue === 'Parent.Child'
    && childFlow(removal + reading, '', ' namespace="default"')[0]?.code === removalCode
    && childFlow(negativeCondition, ' ref="External"').length === 0
    && childFlow(negativeCondition, ' instantiate="true"').length === 0);
  const namespaceRemoval = '<remove_value name="namespace.$Value"/>';
  const namespaceRead = '<debug_text text="namespace.&#36;Value.hull"/>';
  const namespaceReadRows = rootFlow(removal + namespaceRead);
  ok('exact namespace spelling shares local removal state and locates the authored qualified read',
    rootFlow(namespaceRemoval + reading)[0]?.code === removalCode
    && namespaceReadRows.length === 1 && namespaceReadRows[0].code === removalCode
    && namespaceReadRows[0].column === ('<mdscript name="Removal"><cues><cue name="Root"><actions>' + removal + namespaceRead).indexOf('namespace.') + 1,
    namespaceReadRows);
  ok('exact namespace spelling shares existence test facts',
    rootFlow(`<do_if value="not namespace.$Value?">${reading}</do_if>`)[0]?.code === absenceCode
    && rootFlow(`<do_if value="namespace.$Value?">${namespaceRead}</do_if>`).length === 0
    && rootFlow(`<do_if value="namespace.$Value?"/><do_else>${namespaceRead}</do_else>`)[0]?.code === absenceCode);
  const namespaceRestore = '<set_value name="namespace.$Value" exact="$Value"/>';
  const namespaceRestoreRows = rootFlow(removal + namespaceRestore + namespaceRead);
  ok('namespace assignment reads the old value before invalidating the shared fact',
    namespaceRestoreRows.length === 1 && namespaceRestoreRows[0].sourceRef === 'set_value/@exact'
    && rootFlow(namespaceRemoval + '<set_value name="$Value" exact="1"/>' + namespaceRead).length === 0);
  ok('namespace access keeps nested blocks isolated and other cue qualifiers outside the local proof',
    childFlow(namespaceRead).length === 0
    && childFlow(namespaceRemoval + reading, '', ' namespace="default"')[0]?.cue === 'Parent.Child'
    && childFlow(namespaceRemoval + '<debug_text text="this.$Value"/>', '', ' namespace="default"').length === 0
    && rootFlow(namespaceRemoval + '<set_value name="parent.$Value" exact="1"/>' + namespaceRead).length === 0);
  ok('namespace analysis ignores case mismatches, optional and suppressed reads and compound targets',
    rootFlow(namespaceRemoval + '<debug_text text="Namespace.$Value"/>'
      + '<debug_text text="namespace.$value"/><debug_text text="@namespace.$Value"/>'
      + '<debug_text text="namespace.$Value?"/><debug_text text="namespace.$Value.$Computed"/>').length === 0
    && rootFlow('<remove_value name="namespace.$Value.member"/>' + namespaceRead).length === 0);
  ok('branch nesting bound stops analysis inside an unsupported depth',
    rootFlow('<do_if value="not $Value?">'.repeat(MAX_VARIABLE_BRANCH_DEPTH + 1) + reading
      + '</do_if>'.repeat(MAX_VARIABLE_BRANCH_DEPTH + 1)).length === 0);
  const initialCode = 'md_pitfall.variable_read_before_initialization';
  const initialRead = '<debug_text text="$X"/>';
  const initialDocument = (actions: string, script = 'A', children = '') => `<mdscript name="${script}"><cues>`
    + `<cue name="Root"><actions>${actions}</actions>${children}</cue></cues></mdscript>`;
  const initialSchema = { loaded: true, sourceFiles: [], elementCount: 0, elements: new Map([
    ...['actions', 'conditions', 'event_game_started', 'check_all', 'check_any', 'opaque_effect', 'run_actions', 'match_distance'].map(name =>
      [name, { resolved: true, openAttributes: false, attributes: new Map() }] as const),
    ['set_value', { resolved: true, openAttributes: false, attributes: new Map([['name', { type: 'lvalueexpression', required: true }]]) }],
    ['remove_value', { resolved: true, openAttributes: false, attributes: new Map([['name', { type: 'lvalueexpression', required: true }]]) }],
    ['remove_cargo', { resolved: true, openAttributes: false, attributes: new Map([['result', { type: 'lvalueexpression' }]]) }],
    ['find_ship', { resolved: true, openAttributes: false, attributes: new Map([
      ['name', { type: 'lvaluename' }], ['groupname', { type: 'groupname' }], ['multiple', { type: 'findmultiple' }], ['append', { type: 'findappend' }],
    ]) }],
    ['find_buy_offer', { resolved: true, openAttributes: false, attributes: new Map([
      ['result', { type: 'lvaluename' }], ['multiple', { type: 'findmultiple' }],
    ]) }],
    ['output_expression', { resolved: true, openAttributes: false, attributes: new Map([['result', { type: 'lvalueexpression', required: true }]]) }],
    ['output_name', { resolved: true, openAttributes: false, attributes: new Map([['result', { type: 'lvaluename', required: true }]]) }],
    ['output_group', { resolved: true, openAttributes: false, attributes: new Map([['result', { type: 'groupname', required: true }]]) }],
    ['output_count', { resolved: true, openAttributes: false, attributes: new Map([['result', { type: 'countresult', required: true }]]) }],
  ]) } as unknown as SchemaIndex;
  const initialFiles = (actions: string, others: MdVariableAvailabilityInput[] = [], schema: SchemaIndex | null = initialSchema) => {
    const content = initialDocument(actions);
    const files = [{ path: 'md/a.xml', content }, ...others];
    const built = buildMdVariableAvailabilityContext(files, schema);
    const readGaps: ValidationCoverageGap[] = [];
    const rows = lintMdPitfalls(content, { filePath: 'md/a.xml', variableAvailability: built.context, initialStateGaps: readGaps });
    return { ...built, content, rows, readGaps };
  };
  const initialRows = (actions: string, others: MdVariableAvailabilityInput[] = []) => initialFiles(actions, others).rows.filter(row => row.code === initialCode);
  const remoteWriter = (destination: string, tag = 'set_value', attribute = 'name'): MdVariableAvailabilityInput => ({ path: 'md/b.xml',
    content: initialDocument(`<${tag} ${attribute}="${destination}" exact="1"/>`, 'B') });
  ok('project initial advisory distinguishes no modeled writer and a later same-block writer',
    initialRows(initialRead)[0]?.detail.includes('No guaranteed earlier initialization')
    && initialRows(initialRead + '<set_value name="$X" exact="1"/>')[0]?.detail.includes('later in this action block')
    && initialRows(initialRead).every(row => row.severity === 'warning' && row.detail.includes('Saved values') && row.detail.includes('outside the analyzed project')));
  const positionedInitial = '\uFEFF<mdscript name="A"><cues><cue name="Root"><actions><debug_text text="&#36;X"/></actions></cue></cues></mdscript>';
  const positionedContext = buildMdVariableAvailabilityContext([{ path: 'md/a.xml', content: positionedInitial }], initialSchema);
  const positionedRows = lintMdPitfalls(positionedInitial, { filePath: 'md/a.xml', variableAvailability: positionedContext.context });
  ok('project initial advisory preserves exact first-line BOM and entity location', positionedRows[0]?.code === initialCode
    && positionedRows[0]?.line === 1 && positionedRows[0]?.column === positionedInitial.indexOf('&#36;') + 1);
  ok('project initial prior and namespace assignments clear only the exact case-matched fact',
    initialRows('<set_value name="$X" exact="1"/>' + initialRead).length === 0
    && initialRows('<set_value name="namespace.$X" exact="1"/>' + initialRead).length === 0
    && initialRows('<set_value name="$x" exact="1"/>' + initialRead).length === 1);
  ok('project initial explicit set operation follows the ordinary initializer',
    initialRows('<set_value name="$X" operation="set" exact="1"/>' + initialRead).length === 0);
  const receiverDocument = initialDocument('<debug_text text="$Probe.hull"/><debug_text text="namespace.$Probe.hull"/>');
  const receiverContext = buildMdVariableAvailabilityContext([{ path: 'md/a.xml', content: receiverDocument }], initialSchema);
  const receiverRows = lintMdPitfalls(receiverDocument, { filePath: 'md/a.xml', variableAvailability: receiverContext.context }).filter(row => row.code === initialCode);
  ok('project initial ordinary and namespace receiver reads retain authored positions and preceding initialization control',
    receiverRows.length === 2 && receiverRows[0].line === 1 && receiverRows[0].column === receiverDocument.indexOf('$Probe.hull') + 1
    && receiverRows[1].column === receiverDocument.indexOf('namespace.$Probe.hull') + 1
    && initialRows('<set_value name="$Probe" exact="player.ship"/><debug_text text="$Probe.hull"/><debug_text text="namespace.$Probe.hull"/>').length === 0);
  const compound = '<debug_text text="1 + (namespace.&#36;Probe.hull * -&#36;Other)"/>';
  const compoundFacts = initialFiles(compound);
  const compoundRows = compoundFacts.rows.filter(row => row.code === initialCode);
  ok('project arithmetic reports each strict operand at its authored XML position',
    compoundRows.length === 2 && compoundRows[0].column === compoundFacts.content.indexOf('namespace.&#36;Probe') + 1
    && compoundRows[1].column === compoundFacts.content.indexOf('&#36;Other') + 1
    && compoundRows.every(row => row.severity === 'warning' && row.detail.includes('Saved values')));
  const increment = '<set_value name="$Next" exact="$Counter + 1"/>';
  const counter = '<set_value name="$Counter" exact="4"/>';
  const removeCounter = '<remove_value name="$Counter"/>';
  ok('project arithmetic distinguishes an earlier assignment, a later assignment and a proven removal',
    initialRows(counter + increment).length === 0
    && initialRows(increment + counter)[0]?.detail.includes('later in this action block')
    && initialFiles(counter + removeCounter + increment).rows.filter(row => String(row.code).startsWith('md_pitfall.variable_')).length === 1
    && initialFiles(counter + removeCounter + increment).rows.some(row => row.code === removalCode));
  ok('project arithmetic respects local aliases, guards and external writers',
    initialRows('<set_value name="namespace.$Counter" exact="4"/>' + increment).length === 0
    && initialRows('<do_if value="$Counter?">' + increment + '</do_if>').length === 0
    && initialRows(increment, [remoteWriter('md.A.Root.$Counter')]).length === 0
    && initialRows('<debug_text text="-($Counter.hull + .5f) ^ 2 % 3 / 4"/>').length === 1);
  ok('project arithmetic does not treat uncertain, lazy or malformed syntax as a strict read',
    ['@$X + 1', '$X.hull? + 1', '$X.{1} + 1', '$X.[1] + 1', 'false and ($X + 1)', 'if false then $X + 1 else 0',
      "'$X + 1'", '$X + ($Y * 2', '$X +', '$X 2 + 1', '$X + opaque(1)'].every(value =>
      initialFiles(`<remove_value name="$X"/><debug_text text="${value}"/>`).rows
        .every(row => !String(row.code).startsWith('md_pitfall.variable_'))));
  const selfCompound = initialFiles('<set_value name="$X" operation="subtract" exact="$X + $Y"/>' + initialRead);
  ok('project arithmetic self-referential updates keep destination ordering unknown and check the independent operand',
    selfCompound.coverageGaps.some(row => row.reason.includes('Self-referential add/subtract'))
    && selfCompound.rows.filter(row => row.code === initialCode).length === 1
    && selfCompound.rows.some(row => row.code === initialCode && row.detail.includes('strict read of $Y:')));
  ok('project initial ordinary RHS is read before its destination initialization',
    initialRows('<set_value name="$X" exact="$X"/>' + initialRead).length === 1
    && initialRows('<set_value name="$X" exact="$X"/>')[0]?.sourceRef === 'set_value/@exact');
  const pairedInitial = initialFiles('<do_if value="$X?">' + initialRead + '</do_if>\r\n<!-- adjacency -->\r\n<do_else><debug_text text="1"/></do_else>');
  ok('project initial positive guards are quiet and absent arms retain only the proven finding',
    initialRows('<do_if value="$X?">' + initialRead + '</do_if>').length === 0
    && pairedInitial.rows.filter(row => row.code === initialCode).length === 0 && pairedInitial.coverageGaps.length === 0
    && initialFiles('<do_if value="not $X?">' + initialRead + '</do_if>').rows.filter(row => String(row.code).startsWith('md_pitfall.variable_')).length === 1
    && initialFiles('<do_if value="not $X?">' + initialRead + '</do_if>').rows.some(row => row.code === absenceCode));
  ok('project initial joins require initialization on every modeled reachable arm',
    initialRows('<do_if value="$Gate?"><set_value name="$X" exact="1"/></do_if>' + initialRead)[0]?.detail.includes('branches')
    && initialRows('<do_if value="$Gate?"><set_value name="$X" exact="1"/></do_if><do_else><set_value name="$X" exact="2"/></do_else>' + initialRead).length === 0);
  ok('project initial chance initialization is possible rather than guaranteed',
    initialRows('<set_value name="$X" exact="1" chance="50"/>' + initialRead).length === 1);
  ok('project initial add and subtract initialize their destination but still inspect independent RHS reads',
    initialRows('<set_value name="$X" operation="add" exact="1"/>' + initialRead).length === 0
    && initialRows('<set_value name="$X" operation="subtract" exact="1"/>' + initialRead).length === 0
    && initialRows('<set_value name="$X" operation="add" exact="$Y"/>' + initialRead)[0]?.detail.includes('$Y'));
  const selfAdd = initialFiles('<set_value name="$X" operation="add" exact="$X"/>' + initialRead);
  ok('project initial self-referential add ordering is explicitly unknown rather than an engine error',
    selfAdd.rows.filter(row => row.code === initialCode).length === 0
    && selfAdd.coverageGaps.some(row => row.reason.includes('Self-referential add/subtract')));
  ok('self-update ordering remains explicitly unavailable after removal or an absence guard',
    ['add', 'subtract'].every(operation => {
      const update = `<set_value name="$X" operation="${operation}" exact="$X"/>`;
      return ['<remove_value name="$X"/>\n' + update, '<do_if value="not $X?">\n' + update + '\n</do_if>']
        .every(actions => {
          const result = initialFiles(actions);
          return result.readGaps.length === 1 && result.readGaps[0].reason.includes('Self-referential add/subtract')
            && (result.readGaps[0].line ?? 0) >= 2 && (result.readGaps[0].column ?? 0) > 1
            && !result.rows.some(row => String(row.code).startsWith('md_pitfall.variable_'));
        });
    }));
  ok('project initial optional suppressed quoted and property mutation roots are distinct',
    initialRows('<debug_text text="$X?"/><debug_text text="@$X"/><debug_text text="\'$X\'"/>').length === 0
    && initialRows('<set_value name="$Object.$Member" exact="1"/><debug_text text="$Object"/>').length === 1);
  ok('project initial removal does not initialize and proven reads never gain a duplicate advisory',
    initialFiles('<remove_value name="$X"/>' + initialRead).rows.filter(row => String(row.code).startsWith('md_pitfall.variable_')).length === 1
    && initialFiles('<remove_value name="$X"/>' + initialRead).rows.some(row => row.code === removalCode));
  ok('project initial append exceptions initialize only exact roots with create enabled',
    initialRows('<append_to_list name="$X" create="true" exact="1"/>' + initialRead).length === 0
    && initialRows('<append_list_elements name="$X" create="true" other="$Other"/>' + initialRead).length === 0
    && initialRows('<append_to_list name="$X" exact="1"/>' + initialRead).length === 1
    && initialRows('<append_to_list name="$X.$Member" create="true" exact="1"/>' + initialRead).length === 1);
  ok('project initial exact remote storage is distinct while unresolved spelling keeps uncertainty',
    initialRows(initialRead, [remoteWriter('md.A.Root.$X')]).length === 0
    && initialRows(initialRead, [remoteWriter('md.B.Root.$X')]).length === 1
    && initialRows(initialRead, [remoteWriter('md.a.Root.$X')]).length === 0
    && initialFiles(initialRead, [remoteWriter('md.a.Root.$X')]).coverageGaps.some(row => row.reason.includes('unresolved')));
  ok('project initial schema discovers every declared lvalue destination kind',
    ['output_expression', 'output_name', 'output_group', 'output_count'].every(tag =>
      initialRows(initialRead + '<debug_text text="$Y"/>', [remoteWriter('md.A.Root.$X', tag, 'result')]).length === 1));
  const conditionWriter: MdVariableAvailabilityInput = { path: 'md/b.xml', content: '<mdscript name="B"><cues><cue name="Root"><conditions>'
    + '<output_count result="md.A.Root.$X"/></conditions><actions/></cue></cues></mdscript>' };
  ok('project initial possible condition writers suppress only the addressed initial advisory',
    initialRows(initialRead + '<debug_text text="$Y"/>', [conditionWriter]).length === 1);
  const inheritedDocument = (childActions: string, own = '') => initialDocument('<set_value name="$X" exact="1"/>', 'A',
    `<cues><cue name="Child"${own}><actions>${childActions}</actions></cue></cues>`);
  const inheritedRows = (content: string, others: MdVariableAvailabilityInput[] = []) => {
    const built = buildMdVariableAvailabilityContext([{ path: 'md/a.xml', content }, ...others], initialSchema);
    return lintMdPitfalls(content, { filePath: 'md/a.xml', variableAvailability: built.context }).filter(row => row.code === initialCode);
  };
  ok('project initial inherited namespace and explicit this/static owners stay distinct',
    inheritedRows(inheritedDocument(initialRead)).length === 0
    && inheritedRows(inheritedDocument(initialRead, ' namespace="this"')).length === 1
    && inheritedRows(inheritedDocument(initialRead, ' namespace="static"')).length === 1);
  ok('project initial direct child storage is not the inherited namespace storage',
    inheritedRows(inheritedDocument('<debug_text text="$Y"/>'), [remoteWriter('md.A.Child.$Y')]).length === 1
    && inheritedRows(inheritedDocument('<debug_text text="$Y"/>'), [remoteWriter('md.A.Root.$Y')]).length === 0
    && inheritedRows(inheritedDocument('<set_value name="this.$Y" exact="1"/><debug_text text="$Y"/>')).length === 1
    && inheritedRows(inheritedDocument('<set_value name="this.$Y" exact="1"/><debug_text text="$Y"/>', ' namespace="this"')).length === 0);
  const dynamicWriter = initialFiles(initialRead + '<debug_text text="$Y"/>', [remoteWriter('$Destination.$X')]);
  ok('project initial unresolved destinations retain explicit authority gaps', dynamicWriter.coverageGaps.some(row => row.check === 'md.variable_initial_state')
    && initialFiles(initialRead, [remoteWriter('{ $Destination }')]).rows.filter(row => row.code === initialCode).length === 0);
  const opaqueFlow = initialFiles('<opaque_effect/>' + initialRead);
  ok('project initial unknown effects clear potential authority without fabricating mod errors',
    opaqueFlow.rows.filter(row => row.code === initialCode).length === 0 && opaqueFlow.coverageGaps.length > 0
    && opaqueFlow.coverageGaps.every(row => row.check === 'md.variable_initial_state'));
  const opaqueWithoutReads = initialFiles('<opaque_effect/><debug_text text="42"/>');
  const restoredAfterOpaque = initialFiles('<opaque_effect/>' + initialRead
    + '<set_value name="$X" exact="1"/>' + initialRead + '<remove_value name="$X"/>' + initialRead);
  ok('initial coverage belongs only to strict reads blocked by an unmodeled effect',
    opaqueWithoutReads.coverageGaps.length === 1 && opaqueWithoutReads.inputGaps.length === 0 && opaqueWithoutReads.readGaps.length === 0
    && opaqueFlow.readGaps.length === 1 && (opaqueFlow.readGaps[0].line ?? 0) > 0
    && restoredAfterOpaque.readGaps.length === 1
    && restoredAfterOpaque.rows.filter(row => row.code === removalCode).length === 1);
  ok('initial coverage distinguishes known writers from opaque readers and preserves guarded reads',
    initialFiles(initialRead, [remoteWriter('md.A.Root.$X')]).readGaps.length === 0
    && dynamicWriter.readGaps.length === 1 && dynamicWriter.readGaps[0].reason.includes('$X')
    && initialFiles('<opaque_effect/><do_if value="$X?">' + initialRead + '</do_if>').readGaps.length === 0
    && initialFiles('<opaque_effect/><debug_text text="$X?"/>').readGaps.length === 0);
  const unmodeledBranch = initialFiles('<do_if value="true">' + initialRead + '</do_if>');
  const unmodeledFile = initialDocument(initialRead).replace('<cue name="Root"', '<cue name="Root" instantiate="true"');
  const unmodeledCue = buildMdVariableAvailabilityContext([{ path: 'md/scope.xml', content: unmodeledFile }], initialSchema);
  const scopeGaps: ValidationCoverageGap[] = [];
  const scopeRows = lintMdPitfalls(unmodeledFile, { filePath: 'md/scope.xml', variableAvailability: unmodeledCue.context, initialStateGaps: scopeGaps });
  ok('unsupported branches and instantiated cues locate strict reads without asserting their execution',
    unmodeledBranch.readGaps.length === 1 && unmodeledBranch.rows.every(row => row.code !== initialCode)
    && scopeGaps.length === 1 && scopeGaps[0].filePath === 'md/scope.xml' && scopeRows.every(row => row.code !== initialCode));
  const locatedLine = '<debug_text text="&#36;X + &#36;X"/>';
  const locatedFile = '\uFEFF<mdscript name="Located"><cues><cue name="Run"><actions>\r\n<opaque_effect/>\r\n'
    + locatedLine + '\r\n</actions></cue></cues></mdscript>';
  const locatedContext = buildMdVariableAvailabilityContext([{ path: 'md/located.xml', content: locatedFile }], initialSchema);
  const positionedGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(locatedFile, { filePath: 'md/located.xml', variableAvailability: locatedContext.context, initialStateGaps: positionedGaps });
  ok('same-line strict reads keep distinct authored entity positions through CRLF and BOM',
    positionedGaps.length === 2 && positionedGaps.every(gap => gap.line === 3)
    && positionedGaps[0].column === locatedLine.indexOf('&#36;') + 1
    && positionedGaps[1].column === locatedLine.lastIndexOf('&#36;') + 1);
  const boundedReads = initialFiles('<opaque_effect/>' + initialRead.repeat(MAX_INITIAL_STATE_READ_GAPS + 3));
  ok('initial coverage keeps a bounded read inventory and an honest overflow',
    boundedReads.readGaps.length === MAX_INITIAL_STATE_READ_GAPS + 1
    && boundedReads.readGaps.filter(gap => gap.line !== undefined).length === MAX_INITIAL_STATE_READ_GAPS
    && boundedReads.readGaps.some(gap => gap.line === undefined && gap.reason.startsWith('3 additional strict reads')));
  const missingInput = initialFiles(initialRead, [{ path: 'md/missing.xml' }]);
  ok('project initial missing source and ambiguous script identities never imply no writers',
    missingInput.rows.filter(row => row.code === initialCode).length === 0 && missingInput.coverageGaps.length > 0
    && initialFiles(initialRead, [{ path: 'md/duplicate.xml', content: initialDocument('', 'A') }]).rows.filter(row => row.code === initialCode).length === 0);
  ok('project initial primitive semantics remain usable without a schema while unfamiliar declarations do not',
    initialFiles(initialRead, [], null).rows.filter(row => row.code === initialCode).length === 1
    && initialFiles(initialRead, [remoteWriter('md.A.Root.$X', 'output_name', 'result')], null).coverageGaps.length > 0);
  const observedInput = '\uFEFF<mdscript name="Reasons"><cues><cue name="Read"><actions>\r\n'
    + '<set_value name="$Receiver.$X" exact="1"/>\r\n<set_value name="$Receiver.$Y" exact="1"/>\r\n'
    + '<opaque_effect/>\r\n<opaque_effect/>\r\n<opaque_effect/>\r\n<unknown_effect/>\r\n</actions></cue></cues></mdscript>';
  const observed = buildMdVariableAvailabilityContext([{ path: 'md/reasons.xml', content: observedInput }], initialSchema);
  const detailed = observed.coverageGaps[0]?.mdInitialState;
  const causes = detailed?.causes;
  ok('initial-state gaps keep one summary with counted causes and bounded authored samples',
    observed.coverageGaps.length === 1 && typeof observed.coverageGaps[0].reason === 'string'
    && detailed?.analysisLimited === false && causes?.length === 3
    && causes[0].code === 'dynamic_destination' && causes[0].count === 2 && causes[0].locatedCount === 2
    && causes[0].samples.every((sample, index) => sample.line === 2 + index && sample.attribute === 'name' && sample.column >= 1)
    && causes[1].code === 'unknown_effect' && causes[1].count === 1 && causes[1].samples[0].line === 7
    && causes[2].code === 'unsupported_effect' && causes[2].count === 3 && causes[2].locatedCount === 3
    && causes[2].samples.length === 2 && causes[2].samples.every((sample, index) => sample.line === 4 + index
      && sample.element === 'opaque_effect' && sample.column === 1));
  ok('missing initial-state source does not acquire an invented authored position',
    missingInput.coverageGaps.some(gap => gap.filePath === 'md/missing.xml'
      && gap.mdInitialState?.causes.some(cause => cause.code === 'missing_source' && cause.count === 1
        && cause.locatedCount === 0 && cause.samples.length === 0)));
  const firstLineInitialDocument = initialDocument('<set_value name="$Receiver.$X" exact="1"/>');
  const firstSample = (content: string) => buildMdVariableAvailabilityContext([{ path: 'md/first.xml', content }], initialSchema)
    .coverageGaps[0]?.mdInitialState?.causes[0].samples[0];
  const firstPlain = firstSample(firstLineInitialDocument);
  const firstBom = firstSample('\uFEFF' + firstLineInitialDocument);
  ok('initial-state sampling maps a leading BOM to the authored first-line column',
    firstPlain?.line === 1 && firstBom?.line === 1 && firstBom.column === firstPlain.column + 1);
  const unresolvedSchema = { ...initialSchema, elements: new Map(initialSchema.elements) };
  unresolvedSchema.elements.set('output_count', { ...initialSchema.elements.get('output_count')!, resolved: false, attributes: new Map() });
  const unresolvedCondition = initialFiles(initialRead, [conditionWriter], unresolvedSchema);
  ok('project initial unresolved condition declarations cannot masquerade as complete writer authority',
    unresolvedCondition.rows.filter(row => row.code === initialCode).length === 0
    && unresolvedCondition.coverageGaps.some(row => row.reason.includes('unresolved'))
    && unresolvedCondition.context.scope.eligibleCues === 0 && unresolvedCondition.context.scope.skippedCues === 2);
  const serializableContext = initialFiles(initialRead, [remoteWriter('md.B.Root.$Y')]);
  const snapshotInitial = (value: unknown) => JSON.stringify(value, (_key, value) => value instanceof Map || value instanceof Set ? [...value] : value);
  const beforeInitial = snapshotInitial(serializableContext.context);
  const repeatedInitial = () => lintMdPitfalls(serializableContext.content, { filePath: 'md/a.xml', variableAvailability: serializableContext.context });
  ok('project initial cached context is clone-compatible and never mutated by repeated lints',
    snapshotInitial(repeatedInitial()) === snapshotInitial(repeatedInitial())
    && beforeInitial === snapshotInitial(serializableContext.context)
    && beforeInitial === snapshotInitial(structuredClone(serializableContext.context))
    && beforeInitial === JSON.stringify(JSON.parse(JSON.stringify(serializableContext.context))));
  const prototypeContent = initialDocument(initialRead);
  const prototypeContext = buildMdVariableAvailabilityContext([{ path: '__proto__', content: prototypeContent }], initialSchema);
  ok('project initial record lookups use exact own keys after JSON serialization',
    lintMdPitfalls(prototypeContent, { filePath: '__proto__', variableAvailability: JSON.parse(JSON.stringify(prototypeContext.context)) })
      .filter(row => row.code === initialCode).length === 1);
  const orderedInputs = [{ path: 'md/a.xml', content: initialDocument(initialRead) }, remoteWriter('md.A.Root.$X')];
  ok('project initial context and gaps are independent of project file order',
    snapshotInitial(buildMdVariableAvailabilityContext(orderedInputs, initialSchema))
      === snapshotInitial(buildMdVariableAvailabilityContext([...orderedInputs].reverse(), initialSchema)));
  const manyInitial = (size: number, opaqueChild = false) => {
    const writes = Array.from({ length: size }, (_, index) => `<set_value name="$Shared${index}" exact="1"/>`).join('');
    const children = Array.from({ length: size }, (_, index) => `<cue name="Child${index}"><actions><debug_text text="$Shared${index}"/>`
      + '<debug_text text="$Never"/></actions></cue>').join('');
    const extra = opaqueChild ? '<cue name="Opaque"><actions><opaque_effect/></actions></cue>' : '';
    const content = initialDocument(writes, 'A', `<cues>${children}${extra}</cues>`);
    const built = buildMdVariableAvailabilityContext([{ path: 'md/a.xml', content }], initialSchema);
    return { ...built, rows: lintMdPitfalls(content, { filePath: 'md/a.xml', variableAvailability: built.context }).filter(row => row.code === initialCode) };
  };
  const manySmall = manyInitial(16), manyLarge = manyInitial(64);
  ok('project initial many-cue shared-owner indexing stores writer authority once with bounded scaling',
    manySmall.rows.length === 16 && manyLarge.rows.length === 64
    && manyLarge.context.scope.eligibleCues === 65 && manyLarge.context.scope.skippedCues === 0
    && Object.keys(manyLarge.context.authority).length === 1
    && Object.values(manyLarge.context.authority).every(owner => Object.keys(owner.variables).length === 64)
    && JSON.stringify(manyLarge.context).length < JSON.stringify(manySmall.context).length * 6
    && manyLarge.context.scope.indexedFacts < manySmall.context.scope.indexedFacts * 6
    && !manyLarge.context.scope.limited && manyLarge.context.scope.indexedFacts <= 262144);
  const manyOpaque = manyInitial(64, true);
  ok('project initial targeted opaque authority is indexed and eligible counts follow its effective scope',
    manyOpaque.rows.length === 0 && manyOpaque.coverageGaps.length > 0
    && manyOpaque.context.scope.eligibleCues === 1 && manyOpaque.context.scope.skippedCues === 65
    && manyOpaque.context.scope.eligibleCues + manyOpaque.context.scope.skippedCues === 66
    && Object.keys(manyOpaque.context.authority).length === 1 && !manyOpaque.context.scope.limited);

  const flowDoc = (body: string) => `<mdscript name="FlowCov"><cues>${body}</cues></mdscript>`;
  const runFlowCov = (doc: string) => {
    const built = buildMdVariableAvailabilityContext([{ path: 'md/flowcov.xml', content: doc }], initialSchema);
    const readGaps: ValidationCoverageGap[] = [];
    const rows = lintMdPitfalls(doc, { filePath: 'md/flowcov.xml', variableAvailability: built.context, initialStateGaps: readGaps });
    return { ...built, rows, readGaps };
  };
  const ifChainOk = runFlowCov(flowDoc('<cue name="C"><actions><set_value name="$Pre" exact="1"/>'
    + '<do_if value="$Pre gt 0"><set_value name="$Arm" exact="$Pre"/><set_value name="$Both" exact="1"/></do_if>'
    + '<do_elseif value="$Pre eq 0"><set_value name="$Both" exact="2"/><set_value name="$OnlyOne" exact="1"/></do_elseif>'
    + '<do_else><set_value name="$Both" exact="3"/></do_else>'
    + '<debug_text text="$Pre"/><debug_text text="$Both"/>'
    + '<debug_text text="$Arm"/><debug_text text="$OnlyOne"/></actions></cue>'));
  ok('unmodeled do_if/elseif/else chains preserve pre-branch and all-branch present vars while flagging partial arms',
    ifChainOk.readGaps.length === 2 && ifChainOk.readGaps.some(g => g.reason.includes('$Arm'))
    && ifChainOk.readGaps.some(g => g.reason.includes('$OnlyOne'))
    && !ifChainOk.readGaps.some(g => g.reason.includes('$Pre') || g.reason.includes('$Both')));

  const loopOk = runFlowCov(flowDoc('<cue name="C"><actions><set_value name="$Keep" exact="1"/><set_value name="$Rm" exact="1"/>'
    + '<do_for_each name="$k" valuename="$v" counter="$i" in="$Keep">'
    + '<set_value name="$Step" exact="$k"/><debug_text text="$Keep"/><debug_text text="$v"/><debug_text text="$i"/><debug_text text="$Step"/>'
    + '<debug_text text="$Rm"/><remove_value name="$Rm"/></do_for_each>'
    + '<do_all counter="$j" exact="3"><debug_text text="$j"/><set_value name="$InAll" exact="1"/></do_all>'
    + '<debug_text text="$Keep"/><debug_text text="$k"/><debug_text text="$Step"/><debug_text text="$InAll"/></actions></cue>'));
  ok('loops bind name/valuename/counter inside body, invalidate loop-removed pre vars, and withhold post-loop leaks',
    loopOk.readGaps.length === 4 && loopOk.readGaps.some(g => g.reason.includes('$Rm'))
    && loopOk.readGaps.some(g => g.reason.includes('$k')) && loopOk.readGaps.some(g => g.reason.includes('$Step'))
    && loopOk.readGaps.some(g => g.reason.includes('$InAll')) && !loopOk.readGaps.some(g => g.reason.includes('$Keep')));

  const instLibDoc = flowDoc(
    '<cue name="Inst" instantiate="true"><conditions><event_game_started/></conditions><actions>'
    + '<set_value name="$Out" exact="0"/><set_value name="$Out" exact="$Out + 1"/>'
    + '<remove_value name="$Missing"/><do_if value="not $Missing?"><debug_text text="$Missing"/></do_if>'
    + '<run_actions ref="Lib"><param name="arg" value="$Out"/></run_actions><debug_text text="$Out"/>'
    + '<output_name result="$Dyn"/><debug_text text="$Dyn"/>'
    + '<include_actions ref="Other"/><debug_text text="$Out"/>'
    + '</actions></cue>'
    + '<library name="Lib" purpose="run_actions"><params><param name="arg"/></params><actions>'
    + '<set_value name="$Acc" exact="$arg"/><set_value name="$Acc" exact="$Acc + 1"/><debug_text text="$Acc"/><debug_text text="$UnsetLib"/>'
    + '</actions></library>',
  );
  const instBuilt = buildMdVariableAvailabilityContext([{ path: 'md/instlib.xml', content: instLibDoc }], initialSchema);
  const instGaps: ValidationCoverageGap[] = [];
  const instRows = lintMdPitfalls(instLibDoc, { filePath: 'md/instlib.xml', variableAvailability: instBuilt.context, initialStateGaps: instGaps });
  ok('libraries and instantiated cues track params and sequential writes cleanly without false warnings or unsafe clears',
    instRows.length === 0 && instGaps.length === 4
    && instGaps.filter(g => g.reason.includes('$Out')).length === 1
    && instGaps.some(g => g.reason.includes('$Missing'))
    && instGaps.some(g => g.reason.includes('$Dyn'))
    && instGaps.some(g => g.reason.includes('$UnsetLib')));

  const subMemberDoc = flowDoc(
    '<library name="Sub" purpose="run_actions"><params><param name="ship"/></params><actions>'
    + '<set_value name="$Val" exact="1"/><set_value name="$Key" exact="\'k\'"/><set_value name="$Tbl" exact="table[$f = 1]"/>'
    + '<set_value name="$Tbl.$ship" exact="$ship"/>'
    + '<do_for_each name="$e" in="md.FlowCov.Store.$Seen.keys"><remove_value name="md.FlowCov.Store.$Seen.{$e}"/></do_for_each>'
    + '<set_value name="md.FlowCov.Store.$Plans.{\'p\' + $Key}.{2}" exact="$Val"/>'
    + '<remove_value name="$Tbl.$f"/><remove_value name="md.Other.Cue.$f"/>'
    + '<debug_text text="$ship"/><debug_text text="$Val"/>'
    + '<set_value name="$Removed" exact="null"/><remove_cargo result="$Removed"/><debug_text text="$Removed"/>'
    + '<set_value name="Cards.{$Key}" exact="$Val"/><debug_text text="$Val"/>'
    + '<remove_value name="this.$Val"/><debug_text text="$Val"/>'
    + '</actions></library>',
  );
  const subMemberBuilt = buildMdVariableAvailabilityContext([{ path: 'md/submember.xml', content: subMemberDoc }], initialSchema);
  const subMemberGaps: ValidationCoverageGap[] = [];
  const subMemberRows = lintMdPitfalls(subMemberDoc, { filePath: 'md/submember.xml', variableAvailability: subMemberBuilt.context, initialStateGaps: subMemberGaps });
  const subActions = Object.values(subMemberBuilt.context.files['md/submember.xml']?.actions ?? {});
  const cueBraceDoc = flowDoc('<cue name="Store"><actions><set_value name="$Key" exact="\'k\'"/>'
    + '<set_value name="md.FlowCov.Store.$Plans.{\'p\' + $Key}.{2}" exact="1"/>'
    + '<set_value name="Cards.{$Key}" exact="1"/></actions></cue>');
  const cueBraceBuilt = buildMdVariableAvailabilityContext([{ path: 'md/bracecue.xml', content: cueBraceDoc }], initialSchema);
  ok('sub-member brace writes/removals and pre-initialized result outputs preserve present state while dynamic targets clear',
    subMemberRows.length === 0
    && subActions.some(a => a.destinations.length === 1 && a.destinations[0].initializes === false && !a.opaque)
    && subActions.some(a => a.destinations.length === 1 && a.destinations[0].initializes === true && a.destinations[0].variable === undefined && a.opaque)
    && cueBraceBuilt.coverageGaps.some(g => g.mdInitialState?.causes.some(c => c.code === 'dynamic_destination' && c.count === 1))
    && subMemberGaps.filter(g => g.reason.includes('$Val')).length === 1
    && subMemberGaps.length === 1, { cueBraceBuilt, subMemberGaps });

  const conjunctiveDoc = flowDoc(
    '<cue name="Conj"><actions>'
    + '<do_if value="$GuardOk? and $GuardOk != null and ($Ready? and $GuardOk.exists)"><debug_text text="$GuardOk"/><debug_text text="$Ready"/></do_if>'
    + '<do_elseif value="$BranchVar? and $BranchVar == 1"><debug_text text="$BranchVar"/></do_elseif>'
    + '<do_else><debug_text text="$GuardOk"/></do_else>'
    + '<debug_text text="$GuardOk"/>'
    + '<do_if value="$OrGuard? or $Fallback"><debug_text text="$OrGuard"/></do_if>'
    + '<do_if value="not ($NegParen? and $Flag)"><debug_text text="$NegParen"/></do_if>'
    + '<do_if value="if $Flag then $Cond? else true"><debug_text text="$Cond"/></do_if>'
    + '<do_if value="$NegatedAttr? and true" exact="false"><debug_text text="$NegatedAttr"/></do_if>'
    + '<do_if value="$Chancy? and true" chance="50"><debug_text text="$Chancy"/></do_if>'
    + '</actions></cue>',
  );
  const conjBuilt = buildMdVariableAvailabilityContext([{ path: 'md/conj.xml', content: conjunctiveDoc }], initialSchema);
  const conjGaps: ValidationCoverageGap[] = [];
  const conjRows = lintMdPitfalls(conjunctiveDoc, { filePath: 'md/conj.xml', variableAvailability: conjBuilt.context, initialStateGaps: conjGaps });
  ok('conjunctive existence guards protect guarded arms without leaking or accepting or/negated/chance arms',
    conjRows.length === 0
    && !conjGaps.some(g => g.reason.includes('$Ready') || g.reason.includes('$BranchVar'))
    && conjGaps.filter(g => g.reason.includes('$GuardOk')).length === 2
    && ['$OrGuard', '$NegParen', '$Cond', '$NegatedAttr', '$Chancy'].every(v => conjGaps.some(g => g.reason.includes(v))),
    { conjRows, conjGaps });

  const findDoc = flowDoc(
    '<cue name="Find" instantiate="true"><conditions><event_game_started/></conditions><actions>'
    + '<find_ship name="$List" multiple="true"><match_distance/></find_ship><debug_text text="$List"/>'
    + '<find_ship groupname="$Group"/><debug_text text="$Group"/>'
    + '<find_buy_offer result="$Offers" multiple="true"/><debug_text text="$Offers"/>'
    + '<find_ship name="$Single" multiple="false"/><debug_text text="$Single"/>'
    + '<find_ship name="$Appended" multiple="true" append="true"/><debug_text text="$Appended"/>'
    + '<find_ship name="$ChanceList" multiple="true" chance="50"/><debug_text text="$ChanceList"/>'
    + '<find_ship name="$ForeignList" multiple="true"><unknown xmlns="urn:foreign"/></find_ship><debug_text text="$ForeignList"/>'
    + '</actions></cue>',
  );
  const findBuilt = buildMdVariableAvailabilityContext([{ path: 'md/find.xml', content: findDoc }], initialSchema);
  const findGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(findDoc, { filePath: 'md/find.xml', variableAvailability: findBuilt.context, initialStateGaps: findGaps });
  const findNoSchema = buildMdVariableAvailabilityContext([{ path: 'md/find.xml', content: findDoc }], null);
  const findNoSchemaGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(findDoc, { filePath: 'md/find.xml', variableAvailability: findNoSchema.context, initialStateGaps: findNoSchemaGaps });
  ok('find_* initializes multiple=true and groupname outputs only when schema-resolved and unconditional',
    findGaps.length === 4
    && ['$Single', '$Appended', '$ChanceList', '$ForeignList'].every(v => findGaps.some(g => g.reason.includes(v)))
    && findNoSchemaGaps.some(g => g.reason.includes('$List')),
    { findGaps, findNoSchemaGaps });

  const unit56Schema = { loaded: true, sourceFiles: [], elementCount: 0, elements: new Map<string, unknown>([
    ...initialSchema.elements,
    ['run_actions', { resolved: true, openAttributes: false, attributes: new Map([['result', { type: 'lvaluename' }]]) }],
    ['create_order', { resolved: true, openAttributes: false, attributes: new Map([['name', { type: 'lvaluename' }]]) }],
    ['create_trade_order', { resolved: true, openAttributes: false, attributes: new Map([['name', { type: 'lvaluename' }]]) }],
    ['signal_cue', { resolved: true, openAttributes: false, attributes: new Map() }],
    ['signal_cue_instantly', { resolved: true, openAttributes: false, attributes: new Map() }],
    ['reset_cue', { resolved: true, openAttributes: false, attributes: new Map() }],
    ['cancel_cue', { resolved: true, openAttributes: false, attributes: new Map() }],
    ['include_actions', { resolved: true, openAttributes: false, attributes: new Map() }],
    ['do_for_each', { resolved: true, openAttributes: false, attributes: new Map([['name', { type: 'lvaluename' }]]) }],
  ]) } as unknown as SchemaIndex;
  const helperXml = '<mdscript name="Helper"><cues>'
    + '<library name="DirectVal" purpose="run_actions"><actions><return value="42"/></actions></library>'
    + '<library name="BranchVal" purpose="run_actions"><params><param name="flag"/></params><actions>'
    + '<do_if value="$flag"><return value="1"/></do_if><do_elseif value="$flag == 0"><return value="2"/></do_elseif><do_else><return value="3"/></do_else>'
    + '</actions></library>'
    + '<library name="Fallthrough" purpose="run_actions"><actions><do_if value="true"><return value="1"/></do_if></actions></library>'
    + '<library name="VoidReturn" purpose="run_actions"><actions><do_if value="true"><return/></do_if><do_else><return value="1"/></do_else></actions></library>'
    + '<library name="DelayedLib" purpose="run_actions"><delay exact="1s"/><actions><return value="1"/></actions></library>'
    + '<library name="DupLib" purpose="run_actions"><actions><return value="1"/></actions></library>'
    + '<library name="DupLib" purpose="run_actions"><actions><return value="2"/></actions></library>'
    + '</cues></mdscript>';
  const callerXml = '<mdscript name="Caller"><cues>'
    + '<library name="LocalVal" purpose="run_actions"><actions><set_value name="$Tmp" exact="5"/><return value="$Tmp"/></actions></library>'
    + '<cue name="Main" instantiate="true"><conditions><event_game_started/></conditions><actions>'
    + '<run_actions ref="LocalVal" result="$LocRes"/><debug_text text="$LocRes"/>'
    + '<run_actions ref="md.Helper.DirectVal" result="$ExtRes"/><debug_text text="$ExtRes"/>'
    + '<run_actions ref="md.Helper.BranchVal" result="$BrRes"><param name="flag" value="1"/></run_actions><debug_text text="$BrRes"/>'
    + '<create_order object="player.ship" id="\'Wait\'" name="$Ord"/><debug_text text="$Ord"/>'
    + '<create_trade_order object="player.ship" name="$TradeOrd"/><debug_text text="$TradeOrd"/>'
    + '<run_actions ref="md.Helper.Fallthrough" result="$FallBad"/><debug_text text="$FallBad"/>'
    + '<run_actions ref="md.Helper.VoidReturn" result="$VoidBad"/><debug_text text="$VoidBad"/>'
    + '<run_actions ref="md.Helper.DelayedLib" result="$DelayBad"/><debug_text text="$DelayBad"/>'
    + '<run_actions ref="md.Helper.DupLib" result="$DupBad"/><debug_text text="$DupBad"/>'
    + '<run_actions ref="LocalVal" result="$ChanceRun" chance="50"/><debug_text text="$ChanceRun"/>'
    + '<create_order object="player.ship" id="\'Wait\'" name="$ChanceOrd" chance="50"/><debug_text text="$ChanceOrd"/>'
    + '</actions></cue></cues></mdscript>';
  const runOrderBuilt = buildMdVariableAvailabilityContext(
    [{ path: 'md/helper.xml', content: helperXml }, { path: 'md/caller.xml', content: callerXml }],
    unit56Schema,
  );
  const runOrderGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(callerXml, { filePath: 'md/caller.xml', variableAvailability: runOrderBuilt.context, initialStateGaps: runOrderGaps });
  const omittedBuilt = buildMdVariableAvailabilityContext(
    [{ path: 'md/helper.xml', content: helperXml }, { path: 'md/caller.xml', content: callerXml }],
    unit56Schema,
    { paths: ['md/missing.xml'], additionalCount: 0 },
  );
  const omittedGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(callerXml, { filePath: 'md/caller.xml', variableAvailability: omittedBuilt.context, initialStateGaps: omittedGaps });
  const noSchemaRunOrder = buildMdVariableAvailabilityContext([{ path: 'md/caller.xml', content: callerXml }], null);
  const noSchemaRunGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(callerXml, { filePath: 'md/caller.xml', variableAvailability: noSchemaRunOrder.context, initialStateGaps: noSchemaRunGaps });
  ok('value-returning run_actions and create_order/create_trade_order initialize outputs only when unambiguous, unconditional, and schema-resolved',
    runOrderGaps.length === 6
    && !['$LocRes', '$ExtRes', '$BrRes', '$Ord', '$TradeOrd'].some(v => runOrderGaps.some(g => g.reason.includes(v)))
    && ['$FallBad', '$VoidBad', '$DelayBad', '$DupBad', '$ChanceRun', '$ChanceOrd'].every(v => runOrderGaps.some(g => g.reason.includes(v)))
    && omittedGaps.some(g => g.reason.includes('$LocRes')) && omittedGaps.some(g => g.reason.includes('$ExtRes'))
    && noSchemaRunGaps.some(g => g.reason.includes('$LocRes')) && noSchemaRunGaps.some(g => g.reason.includes('$Ord')),
    { runOrderGaps, omittedGaps, noSchemaRunGaps });

  const signalXml = '<mdscript name="SigFlow"><cues><cue name="Sig" instantiate="true"><conditions><event_game_started/></conditions><actions>'
    + '<set_value name="$Keep" exact="1"/><signal_cue cue="Other"/><debug_text text="$Keep"/>'
    + '<do_for_each name="$item" in="[]"><signal_cue cue="Other"/><debug_text text="$Keep"/><debug_text text="$item"/></do_for_each><debug_text text="$Keep"/>'
    + '<set_value name="$DropInst" exact="1"/><signal_cue_instantly cue="Other"/><debug_text text="$DropInst"/>'
    + '<set_value name="$DropReset" exact="1"/><reset_cue cue="this"/><debug_text text="$DropReset"/>'
    + '<set_value name="$DropCancel" exact="1"/><cancel_cue cue="this"/><debug_text text="$DropCancel"/>'
    + '<set_value name="$DropInc" exact="1"/><include_actions ref="Other"/><debug_text text="$DropInc"/>'
    + '</actions></cue></cues></mdscript>';
  const signalBuilt = buildMdVariableAvailabilityContext([{ path: 'md/sig.xml', content: signalXml }], unit56Schema);
  const signalGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(signalXml, { filePath: 'md/sig.xml', variableAvailability: signalBuilt.context, initialStateGaps: signalGaps });
  ok('post-block signal_cue preserves present local flow across actions and loops while inline cue actions clear',
    signalGaps.length === 4
    && !signalGaps.some(g => g.reason.includes('$Keep') || g.reason.includes('$item'))
    && ['$DropInst', '$DropReset', '$DropCancel', '$DropInc'].every(v => signalGaps.some(g => g.reason.includes(v))),
    { signalGaps });

  const atGuardXml = '<mdscript name="AtFlow"><cues><cue name="AtCue" instantiate="true"><conditions><event_game_started/></conditions><actions>'
    + '<do_if value="@$areaHoldOrder.exists"><set_value name="$typedOrder" exact="$areaHoldOrder"/></do_if>'
    + '<do_elseif value="not @$typedOrder.exists and @$mhOrd.exists"><set_value name="$picked" exact="$mhOrd"/><debug_text text="$typedOrder"/></do_elseif>'
    + '<do_else><debug_text text="$areaHoldOrder"/></do_else>'
    + '<do_if value="(@$bareAt and @namespace.$nsAt.pilot.exists)"><debug_text text="$bareAt"/><debug_text text="$nsAt"/></do_if>'
    + '<do_if value="@$eqNull == null"><debug_text text="$eqNull"/></do_if>'
    + '<do_if value="@$orAt.exists or $Flag"><debug_text text="$orAt"/></do_if>'
    + '</actions></cue></cues></mdscript>';
  const atGuardBuilt = buildMdVariableAvailabilityContext([{ path: 'md/atguard.xml', content: atGuardXml }], unit56Schema);
  const atGuardGaps: ValidationCoverageGap[] = [];
  lintMdPitfalls(atGuardXml, { filePath: 'md/atguard.xml', variableAvailability: atGuardBuilt.context, initialStateGaps: atGuardGaps });
  ok('positive null-suppressed truthiness conjuncts guard branch reads without crediting negated, comparison, or, or else paths',
    atGuardGaps.length === 4
    && !['$mhOrd', '$bareAt', '$nsAt'].some(v => atGuardGaps.some(g => g.reason.includes(v)))
    && atGuardGaps.filter(g => g.reason.includes('$areaHoldOrder')).length === 1
    && ['$typedOrder', '$eqNull', '$orAt'].every(v => atGuardGaps.some(g => g.reason.includes(v))),
    { atGuardGaps });
  const triggerRules = (cues: string) => lintMdPitfalls(`<mdscript name="Trigger"><cues>\n${cues}\n</cues></mdscript>`,
    { filePath: 'md/trigger.xml' }).filter(f => f.code === 'md_pitfall.no_event_condition' || f.code === 'md_pitfall.illegal_instantiate');
  const triggerCue = (attributes = '', body = '<check_value value="true"/>') =>
    `  <cue name="Trigger"${attributes}><conditions>${body}</conditions></cue>`;
  const noMode = triggerRules(triggerCue(' checktime="1s"'));
  ok('checktime alone leaves a check-only cue without a checking mode', noMode.length === 1
    && noMode[0].code === 'md_pitfall.no_event_condition' && noMode[0].filePath === 'md/trigger.xml'
    && noMode[0].line === 2 && noMode[0].column === 3, noMode);
  ok('one-shot checks pass but one-shot instantiation fails',
    triggerRules(triggerCue(' onfail="cancel"')).length === 0
    && triggerRules(triggerCue(' onfail="complete"')).length === 0
    && triggerRules(triggerCue(' onfail="cancel" instantiate="1"'))[0]?.code === 'md_pitfall.illegal_instantiate');
  ok('only owned checking modes are analyzed and legal grouped events pass',
    triggerRules(triggerCue(' instantiate="true"', '<check_any><event_game_loaded/><event_game_started/></check_any>')).length === 0
    && triggerRules('  <cue name="Instance" ref="External" instantiate="true"/>').length === 0
    && triggerRules('  <library name="Run" purpose="run_actions" instantiate="true"/>').length === 0);
  const orphan = '  <set_value name="$probe" exact="$n &lt; 5 &#101;lse 0"/>';
  const expressionXml = [
    '<mdscript name="ElseProbe">',
    '  <!-- <set_value exact="else"/> -->',
    '  <![CDATA[<set_value exact="else"/>]]>',
    '  <set_value name="$else" exact="\'else\'" comment="else"/>',
    orphan,
    '</mdscript>',
  ].join('\r\n');
  const expressionFindings = lintScriptExpressions(expressionXml, null, 'md/probe.xml');
  ok('unmatched_else_uses_decoded_attributes_and_raw_coordinates',
    expressionFindings.length === 1 && expressionFindings[0].line === 5
    && expressionFindings[0].column === orphan.indexOf('&#101;') + 1
    && expressionFindings[0].sourceRef === 'set_value/@exact', expressionFindings);
  ok('unmatched_else_ignores_non_script_root_and_invalid_xml',
    lintScriptExpressions('<root><set_value exact="else"/></root>', null).length === 0
    && lintScriptExpressions('<mdscript><set_value exact="else"/></invalid>', null).length === 0);
  const formatLine = '    <debug_text text="&apos;&#37;d&apos;.[7]"/>';
  const formatFindings = lintScriptExpressions([
    '<aiscript><actions>', formatLine, '    <set_value name="$out" exact="\'%s %s\'.[1]"/>', '</actions></aiscript>',
  ].join('\r\n'), null, 'aiscripts/format.xml');
  ok('literal format findings retain decoded severity and raw coordinates',
    formatFindings.length === 2 && formatFindings[0].code === 'expression-format-specifier'
      && formatFindings[0].severity === 'error' && formatFindings[0].line === 2
      && formatFindings[0].column === formatLine.indexOf('&#37;') + 1
      && formatFindings[0].sourceRef === 'debug_text/@text'
      && formatFindings[1].code === 'format-arguments-missing' && formatFindings[1].severity === 'warning', formatFindings);
  const mixedLine = '    <do_if value="not &#64;$ship.pilot.seed&#63;" comment="@$decoy?"/>';
  const mixedFindings = lintScriptExpressions([
    '<mdscript>', '  <!-- <do_if value="@$decoy?"/> -->', mixedLine, '</mdscript>',
  ].join('\r\n'), null, 'md/mixed.xml');
  ok('mixed access reports raw XML coordinates without a schema index',
    mixedFindings.length === 1 && mixedFindings[0].code === 'expression-null-safe-exists'
      && mixedFindings[0].severity === 'error' && mixedFindings[0].line === 3
      && mixedFindings[0].column === mixedLine.indexOf('&#64;') + 1
      && mixedFindings[0].sourceRef === 'do_if/@value', mixedFindings);
  ok('mixed access alone triggers script scanning',
    lintScriptExpressions('<aiscript><do_if value="not @$ship.pilot.seed?"/></aiscript>', null).length === 1
    && lintScriptExpressions('<aiscript><do_if value="not @$ship.pilot or $ship.pilot.seed?"/></aiscript>', null).length === 0);
  const referenceLine = '    <debug_text text="&#123;$page,$id&#125;" comment="{$decoy,$id}"/>';
  const referenceFindings = lintScriptExpressions([
    '<mdscript>', '  <!-- <debug_text text="{$decoy,$id}"/> -->', referenceLine, '</mdscript>',
  ].join('\r\n'), null, 'md/textref.xml');
  ok('TextDB shorthand reports raw entity coordinates without a schema index',
    referenceFindings.length === 1 && referenceFindings[0].code === 'expression-text-reference'
      && referenceFindings[0].severity === 'error' && referenceFindings[0].line === 3
      && referenceFindings[0].column === referenceLine.indexOf('&#123;') + 1
      && referenceFindings[0].sourceRef === 'debug_text/@text', referenceFindings);
  ok('literal TextDB shorthand is checked in AIScript with no other fast filter triggers',
    lintScriptExpressions('<aiscript><set_value exact="{$page,$id}"/></aiscript>', null).length === 1
    && lintScriptExpressions('<aiscript><set_value exact="readtext.{$page}.{$id}"/></aiscript>', null).length === 0);
  const returnCode = 'md_pitfall.return_context';
  const returnFindings = (xml: string) => lint(xml).filter(finding => finding.code === returnCode);
  const ordinaryReturns = '    <cue name="Direct"><actions><do_if value="true"><return/><return/></do_if></actions></cue>';
  const returns = returnFindings([
    '<mdscript><cues>',
    '    <!-- <cue name="Decoy"><actions><return/></actions></cue> -->',
    ordinaryReturns,
    '    <library name="Run" purpose="run_actions"><actions><return value="true"/></actions>',
    '      <cues><cue name="Child"><actions><return/></actions></cue></cues></library>',
    '    <library name="Include" purpose="include_actions"><actions><return/></actions></library>',
    '    <library name="Default"><actions><return/></actions></library>',
    '    <library name="Reference" purpose="cue_ref"><actions><return/></actions></library>',
    '    <cue name="Caller"><actions><run_actions ref="Run" result="$Result"/><include_actions ref="Run"/></actions></cue>',
    '    <cue name="Patch"><patch><return/></patch><force><return/></force></cue>',
    '</cues></mdscript>',
  ].join('\r\n'));
  ok('ordinary returns use the nearest action owner and retain both same-line positions',
    returns.map(finding => finding.cue).join(',') === 'Direct,Direct,Run.Child,Include,Default,Reference'
      && returns.every(finding => finding.severity === 'error')
      && returns[0].line === 3 && returns[1].line === 3
      && returns[0].column === ordinaryReturns.indexOf('<return') + 1
      && returns[1].column === ordinaryReturns.lastIndexOf('<return') + 1, returns);
  ok('return context ignores partial diffs, AI scripts and malformed XML',
    returnFindings('<diff><add sel="/mdscript/cues/cue/actions"><return/></add></diff>').length === 0
    && returnFindings('<aiscript><actions><return/></actions></aiscript>').length === 0
    && returnFindings('<mdscript><cue><actions><return/></invalid></cue></mdscript>').length === 0);
  const timeoutCode = 'md_pitfall.numeric_time_value';
  const timeout = (value: string, monitor = 'true') => `<play_cutscene targetmonitor="${monitor}" timeout="${value}"/>`;
  const assign = (name: string, value: string) => `<set_value name="${name}" exact="${value}"/>`;
  const timeFindings = (...actions: string[]) => lint([
    '<mdscript><cues><cue name="State"/><cue name="Probe"><actions>',
    ...actions, '</actions></cue></cues></mdscript>',
  ].join('\n')).filter(finding => finding.code === timeoutCode);
  const numericCopy = timeFindings(
    assign('$entry', 'table[]'), assign('State.$wait', '240'),
    assign('$entry.$wait', 'State.$wait'), timeout('$entry.$wait'),
  );
  ok('monitored timeout traces a unitless cue value through a new table',
    numericCopy.length === 1 && numericCopy[0].severity === 'error' && numericCopy[0].line === 5
      && numericCopy[0].detail.includes('source line 3') && numericCopy[0].detail.includes('($entry.$wait)s'), numericCopy);
  ok('timeout only blocks proven numbers under explicit target monitoring',
    timeFindings(timeout('240f')).some(finding => finding.detail.includes('(240f)s'))
    && [
      [timeout('240', 'false')], [timeout('240', '$monitor')], [timeout('240s')],
      [assign('$wait', '240'), assign('$wait', '240s'), timeout('$wait')],
      [assign('Unknown.$wait', '240'), timeout('Unknown.$wait')],
      [assign('$entry.$wait', '240'), timeout('$entry.$wait')],
      [assign('$wait', '240'), '<run_actions ref="MaybeWrite"/>', timeout('$wait')],
      [assign('$wait', '240'), `<do_if value="$cond">${assign('$wait', '240s')}</do_if>`, timeout('$wait')],
      [assign('$wait', '240'), '<set_value name="$wait" exact="240s" chance="10"/>', timeout('$wait')],
      [assign('$entry', 'table[]'), assign('$entry.$wait', '240'), assign('$entry', '$other'), timeout('$entry.$wait')],
      [assign('State.$wait', '240'), assign('$wait', '240s'), timeout('State.$wait')],
    ].every(actions => timeFindings(...actions).length === 0));
  const eventBranch = `<do_if value="event.param == 120 or event.param == 240">${assign('$wait', 'event.param')}${timeout('$wait')}</do_if>`;
  const eventTime = timeFindings(eventBranch);
  ok('a numeric event comparison gives an advisory inside the branch',
    eventTime.length === 1 && eventTime[0].severity === 'warning'
    && timeFindings('', eventBranch)[0]?.detail === eventTime[0].detail, eventTime);
  const namedTimeout = `${assign('State.$wait', '240')}${timeout('State.$wait')}`;
  ok('named timeout storage needs unambiguous static root cue authority', [
    `<cue name="State" instantiate="true"/><cue name="Probe"><actions>${namedTimeout}</actions></cue>`,
    `<cue name="Parent"><cues><cue name="State"/></cues></cue><cue name="Probe"><actions>${namedTimeout}</actions></cue>`,
    `<cue name="State"/><library name="Probe" purpose="run_actions"><actions>${namedTimeout}</actions></library>`,
    `<cue name="State"/><cue name="Parent"><cues><cue name="State"/></cues></cue><cue name="Probe"><actions>${namedTimeout}</actions></cue>`,
    `<cue name="State"/><cue name="state"/><cue name="Probe"><actions>${namedTimeout}</actions></cue>`,
  ].every(cues => !lint(`<mdscript><cues>${cues}</cues></mdscript>`).some(finding => finding.code === timeoutCode)));
  const crossCuePump = lint([
    '<mdscript name="CrossCueTime"><cues>',
    '  <cue name="State"/>',
    '  <cue name="UiSet"><actions>',
    '    <set_value name="State.$wait" exact="240"/>',
    '  </actions></cue>',
    '  <cue name="Call_pump"><actions>',
    '    <do_if value="not State.$ready?"><return/></do_if>',
    '    <debug_text text="\'pumping\'"/>',
    '    <set_value name="$entry" exact="table[$wait = State.$wait, $label = \'call\']"/>',
    '    <play_cutscene targetmonitor="true" timeout="$entry.$wait"/>',
    '  </actions></cue>',
    '</cues></mdscript>',
  ].join('\n')).filter(finding => finding.code === timeoutCode);
  ok('cross-cue State.$wait and inline table[...] propagate provenance across guard and debug_text (#72)',
    crossCuePump.length === 1 && crossCuePump[0].severity === 'error'
      && crossCuePump[0].line === 10 && crossCuePump[0].sourceRef === 'play_cutscene/@timeout'
      && crossCuePump[0].detail.includes('source line 4') && crossCuePump[0].detail.includes('($entry.$wait)s'),
    crossCuePump);
  const crossCueQueue = lint([
    '<mdscript name="CrossCueQueue"><cues>',
    '  <cue name="State"><actions><set_value name="$queue" exact="[]"/></actions></cue>',
    '  <cue name="Enqueue"><actions>',
    '    <set_value name="State.$wait" exact="180"/>',
    '    <append_to_list name="State.$queue" exact="table[$wait = State.$wait, $who = \'npc\']"/>',
    '  </actions></cue>',
    '  <cue name="PumpIndex"><actions>',
    '    <set_value name="$entry" exact="State.$queue.{1}"/>',
    '    <remove_from_list name="State.$queue" exact="$entry"/>',
    '    <play_cutscene targetmonitor="true" timeout="$entry.$wait"/>',
    '  </actions></cue>',
    '  <cue name="PumpLoop"><actions>',
    '    <do_for_each name="$item" in="State.$queue">',
    '      <play_cutscene targetmonitor="true" timeout="$item.$wait"/>',
    '    </do_for_each>',
    '  </actions></cue>',
    '</cues></mdscript>',
  ].join('\n')).filter(finding => finding.code === timeoutCode);
  ok('cross-cue State.$queue list-of-tables propagates through indexed pop and do_for_each (#72)',
    crossCueQueue.length === 2
      && crossCueQueue.every(f => f.severity === 'error' && f.detail.includes('source line 4'))
      && crossCueQueue[0].line === 10 && crossCueQueue[1].line === 14,
    crossCueQueue);
  ok('cross-cue provenance suppresses when tainted by non-numeric write, bare State alias, include_actions, or mixed queue (#72)', [
    '<cue name="State"/><cue name="A"><actions><set_value name="State.$wait" exact="240"/></actions></cue><cue name="B"><actions><set_value name="State.$wait" exact="240s"/></actions></cue><cue name="C"><actions><play_cutscene targetmonitor="true" timeout="State.$wait"/></actions></cue>',
    '<cue name="State"><actions><set_value name="$wait" exact="240s"/></actions></cue><cue name="A"><actions><set_value name="State.$wait" exact="240"/></actions></cue><cue name="C"><actions><play_cutscene targetmonitor="true" timeout="State.$wait"/></actions></cue>',
    '<cue name="State"/><cue name="A"><actions><set_value name="State.$wait" exact="240"/><include_actions ref="Ext"/></actions></cue><cue name="C"><actions><play_cutscene targetmonitor="true" timeout="State.$wait"/></actions></cue>',
    '<cue name="State"/><cue name="A"><actions><append_to_list name="State.$q" exact="table[$wait = 240]"/><append_to_list name="State.$q" exact="table[$wait = 240s]"/></actions></cue><cue name="C"><actions><set_value name="$e" exact="State.$q.{1}"/><play_cutscene targetmonitor="true" timeout="$e.$wait"/></actions></cue>',
    '<cue name="State"/><cue name="A"><actions><set_value name="$item" exact="table[$wait = 240]"/><append_to_list name="State.$q" exact="$item"/><set_value name="$item.$wait" exact="240s"/></actions></cue><cue name="C"><actions><set_value name="$e" exact="State.$q.{1}"/><play_cutscene targetmonitor="true" timeout="$e.$wait"/></actions></cue>',
  ].every(cues => !lint(`<mdscript><cues>${cues}</cues></mdscript>`).some(finding => finding.code === timeoutCode)));
  const broaderTiming = lint([
    '<mdscript name="BroaderTiming"><cues>',
    '  <cue name="State"><actions><set_value name="State.$poll" exact="30"/></actions></cue>',
    '  <cue name="BadCueAttrs" checktime="15" checkinterval="State.$poll" onfail="cancel">',
    '    <conditions><check_value value="true"/></conditions>',
    '    <actions>',
    '      <set_value name="$d" exact="10"/>',
    '      <show_notification text="\'hi\'" timeout="5"/>',
    '      <show_interactive_notification text="\'hi\'" timeout="$d"/>',
    '      <set_requested_job_ship_timeout ship="$ship" timeout="60"/>',
    '      <show_help custom="\'ok\'" timeout="true"/>',
    '    </actions>',
    '    <delay exact="$d" min="State.$poll" max="20s"/>',
    '    <actions><debug_text text="\'after\'"/></actions>',
    '  </cue>',
    '  <cue name="VanillaDelayLiteral" checkinterval="25s"><conditions><check_value value="true"/></conditions><delay exact="0.5"/><actions/></cue>',
    '</cues></mdscript>',
  ].join('\n')).filter(finding => finding.code === timeoutCode);
  ok('broader MD timing attributes warn on unitless numbers/provenance while keeping show_help@timeout and literal delay clean (#72)',
    broaderTiming.length === 7
      && broaderTiming.every(f => f.severity === 'warning')
      && broaderTiming.map(f => f.sourceRef).join(',') === [
        'cue/@checktime',
        'cue/@checkinterval',
        'show_notification/@timeout',
        'show_interactive_notification/@timeout',
        'set_requested_job_ship_timeout/@timeout',
        'delay/@exact',
        'delay/@min',
      ].join(','),
    broaderTiming);
  const destructionScript = (conditions: string) => '<mdscript name="DestroyFixture"><cues><cue name="Watcher"><conditions>'
    + conditions + '</conditions></cue></cues></mdscript>';
  const destroyedRows = (source: string) => lintMdPitfalls(source, { filePath: 'md/destroy.xml' })
    .filter(row => row.code === DESTROYED_EVENT_SOURCE_CODE);
  const bareDestructionEvent = '<event_object_destroyed/>';
  const destructionSource = destructionScript(bareDestructionEvent);
  const destroyed = destroyedRows(destructionSource);
  ok('destroyed event without either selector is a located load error', destroyed.length === 1
    && destroyed[0].severity === 'error' && destroyed[0].filePath === 'md/destroy.xml'
    && destroyed[0].cue === 'Watcher' && destroyed[0].line === 1
    && destroyed[0].column === destructionSource.indexOf(bareDestructionEvent) + 1);
  ok('destroyed event position preserves leading BOM and CRLF',
    destroyedRows('\uFEFF' + destructionSource)[0]?.column === destructionSource.indexOf(bareDestructionEvent) + 2
    && destroyedRows('\uFEFF' + destructionScript('\r\n  ' + bareDestructionEvent))[0]?.line === 2
    && destroyedRows('\uFEFF' + destructionScript('\r\n  ' + bareDestructionEvent))[0]?.column === 3);
  const nestedDestruction = destructionScript('<check_any><event_object_destroyed killer="$Killer"/><event_object_destroyed check="false"/></check_any>');
  ok('destroyed event reports separate nested tags and auxiliary attributes do not supply a source',
    destroyedRows(nestedDestruction).length === 2 && new Set(destroyedRows(nestedDestruction).map(row => row.column)).size === 2);
  ok('destroyed event preserves object or group and ignores misleading XML',
    ['<event_object_destroyed object="$Ship"/>', '<event_object_destroyed group="$Tracked"/>',
      '<!-- <event_object_destroyed/> -->', '<![CDATA[<event_object_destroyed/>]]>',
      '<event_object_destroyed xmlns="urn:foreign"/>', '<event_object_destroyed>',
      '<event_game_started/>'].every(value => destroyedRows(destructionScript(value)).length === 0));
  const cancelFindingCode = 'md_pitfall.cancel_conversation_actor_or_template';
  const cancelFindings = (xml: string) => lint(xml).filter(f => f.code === cancelFindingCode);

  // --- 0. cancel_conversation engine semantic requiredness ------------------------------
  const cancelMissing = [
    '<mdscript name="T">',
    '  <cues>',
    '    <cue name="A">',
    '      <actions>',
    '        <cancel_conversation force="true"/>',
    '      </actions>',
    '    </cue>',
    '  </cues>',
    '</mdscript>',
  ].join('\n');
  const missingCancel = cancelFindings(cancelMissing);
  ok('cancel_conversation without actor/template is one blocking finding',
    missingCancel.length === 1
      && missingCancel[0]?.severity === 'error'
      && missingCancel[0]?.line === 5
      && missingCancel[0]?.detail.includes('Neither of the attributes')
      && missingCancel[0]?.detail.includes('at startup/load')
      && missingCancel[0]?.detail.includes('does not establish whole-file or whole-frame failure')
      && !/\b(?:rejects|rejected)\b/i.test(missingCancel[0]?.detail || '')
      && missingCancel[0]?.detail.includes('<cancel_conversation actor="$Guide"/>')
      && missingCancel[0]?.detail.includes('<cancel_conversation template="$Guide" context="$Context"/>'),
    missingCancel);
  const cancelWithStructuredPath = lintMdPitfalls(cancelMissing, {
    propertyUnion: UNION_FIXTURE,
    filePath: 'md/ai_influence_conversation.xml',
  }).filter(f => f.code === cancelFindingCode);
  ok('cancel_conversation keeps structured file location without duplicate prose path',
    cancelWithStructuredPath.length === 1
      && cancelWithStructuredPath[0]?.filePath === 'md/ai_influence_conversation.xml'
      && cancelWithStructuredPath[0]?.line === 5
      && !cancelWithStructuredPath[0]?.detail.includes('md/ai_influence_conversation.xml'),
    cancelWithStructuredPath);
  ok('cancel_conversation actor form passes', cancelFindings(cancelMissing.replace(' force="true"', ' force="true" actor="$Guide"')).length === 0);
  ok('cancel_conversation template form passes', cancelFindings(cancelMissing.replace(' force="true"', ' force="true" template="$Guide" context="$Context"')).length === 0);
  ok('cancel_conversation with neither attribute fails', cancelFindings(cancelMissing).some(f => f.severity === 'error'));
  const cancelDecoys = `<mdscript name="T"><cues><cue name="A"><actions>
    <!-- <cancel_conversation force="true"/> -->
    <![CDATA[<cancel_conversation force="true"/>]]>
    <debug_text text="'&lt;cancel_conversation force=&quot;true&quot;/&gt;'"/>
    <conversation force="true"/>
  </actions></cue></cues></mdscript>`;
  ok('cancel_conversation decoys and unrelated tags stay quiet', cancelFindings(cancelDecoys).length === 0, cancelFindings(cancelDecoys));
  ok('cancel_conversation semantic lint skips non-mdscript, malformed, and garbage input',
    cancelFindings('<aiscript><cancel_conversation force="true"/></aiscript>').length === 0
      && cancelFindings('<mdscript><cancel_conversation force="true"></mdscript>').length === 0
      && cancelFindings('not xml').length === 0);

  // --- 1. ui_listener_one_shot ---
  const deadListener = `<mdscript name="T"><cues>
    <cue name="On_action"><conditions><event_ui_triggered screen="'aic'" control="'action'"/></conditions>
      <actions><debug_text text="'hi'"/></actions></cue>
  </cues></mdscript>`;
  ok('flags root one-shot UI listener (the On_action bug)',
    lint(deadListener).some(f => f.code === 'md_pitfall.ui_listener_one_shot' && f.cue === 'On_action'), lint(deadListener));
  const instantiated = deadListener.replace('<cue name="On_action">', '<cue name="On_action" instantiate="true">');
  ok('instantiate="true" passes', !lint(instantiated).some(f => f.code === 'md_pitfall.ui_listener_one_shot'));
  const resetByName = deadListener.replace('</cues>', `<cue name="Rearm"><conditions><event_cue_signalled cue="md.T.X"/></conditions><actions><reset_cue cue="On_action"/></actions></cue></cues>`);
  ok('listener reset by name elsewhere passes', !lint(resetByName).some(f => f.code === 'md_pitfall.ui_listener_one_shot'));
  const selfReset = deadListener.replace('<debug_text text="\'hi\'"/>', '<debug_text text="\'hi\'"/><reset_cue cue="this"/>');
  ok('keyword self-reset passes', !lint(selfReset).some(f => f.code === 'md_pitfall.ui_listener_one_shot'));
  const nonUi = deadListener.replace('event_ui_triggered screen="\'aic\'" control="\'action\'"', 'event_object_destroyed object="$target"');
  ok('non-UI one-shot event cue NOT flagged (vanilla idiom — falsified broad lint stays dead)',
    lint(nonUi).length === 0, lint(nonUi));
  const subCueListener = `<mdscript name="T"><cues>
    <cue name="Root" instantiate="true"><conditions><event_cue_signalled cue="md.X.Y"/></conditions>
      <cues><cue name="Inner"><conditions><event_ui_triggered screen="'a'" control="'b'"/></conditions></cue></cues></cue>
  </cues></mdscript>`;
  ok('non-root UI listener NOT flagged (parent instance re-arms it)',
    !lint(subCueListener).some(f => f.code === 'md_pitfall.ui_listener_one_shot'), lint(subCueListener));

  // --- 2. offer_accepted_keyword_cue ---
  const offerKw = `<mdscript name="T"><cues><cue name="A" instantiate="true"><conditions><event_offer_accepted cue="parent"/></conditions></cue></cues></mdscript>`;
  ok('flags event_offer_accepted cue="parent"',
    lint(offerKw).some(f => f.code === 'md_pitfall.offer_accepted_keyword_cue'), lint(offerKw));
  ok('offer finding suggests the proven pattern',
    lint(offerKw)[0]?.detail.includes('event_object_signalled'), lint(offerKw)[0]?.detail);
  const offerVar = `<mdscript name="T"><cues><cue name="A" instantiate="true"><conditions><event_offer_accepted cue="$OfferCue"/></conditions></cue></cues></mdscript>`;
  ok('variable-form offer listener passes (vanilla idiom)', lint(offerVar).length === 0);
  const nestedOffers = [
    '<mdscript name="T"><cues>',
    '<cue name="Left"><cues><cue name="Listen"><conditions><event_offer_accepted cue="this"/></conditions></cue></cues></cue>',
    '<cue name="Right"><cues><cue name="Listen"><conditions><event_offer_accepted cue=\'this\'/></conditions></cue></cues></cue>',
    '<!-- <event_offer_accepted cue="this"/> -->',
    '</cues></mdscript>',
  ].join('\n');
  const offers = lintMdPitfalls(nestedOffers, { filePath: 'md/probe.xml' });
  ok('offer keywords retain distinct cue ancestry and attribute locations',
    offers.length === 2 && offers[0].cue === 'Left.Listen' && offers[1].cue === 'Right.Listen'
    && offers.every((finding, index) => finding.filePath === 'md/probe.xml' && finding.line === index + 2
      && finding.column === nestedOffers.split('\n')[index + 1].indexOf('cue=') + 5), offers);

  // --- 3. param3_table_barekey ---
  const bareKey = `<mdscript name="T"><cues><cue name="A" instantiate="true" namespace="this">
    <conditions><event_ui_triggered screen="'aic'" control="'act'"/></conditions>
    <actions><set_value name="$d" exact="event.param3"/><do_if value="$d.l1 == 'relation'"><debug_text text="'x'"/></do_if></actions>
    <actions><reset_cue cue="this"/></actions></cue></cues></mdscript>`;
  ok('flags $d.l1 barekey read off event.param3 (the silent killer)',
    lint(bareKey).some(f => f.code === 'md_pitfall.param3_table_barekey' && f.detail.includes('$d.$l1')), lint(bareKey));
  const dollarKey = bareKey.replace('$d.l1', '$d.$l1');
  ok('$d.$l1 variable-key read passes', !lint(dollarKey).some(f => f.code === 'md_pitfall.param3_table_barekey'));
  const realProp = `<mdscript name="T"><cues><cue name="A"><conditions><event_cue_signalled cue="md.X.Y"/></conditions>
    <actions><set_value name="$TheNPC" exact="event.param3"/><do_if value="$TheNPC.roleobject.exists"><debug_text text="'x'"/></do_if></actions></cue></cues></mdscript>`;
  ok('real property read off param3 passes (vanilla rml_deliver_crew shape)',
    !lint(realProp).some(f => f.code === 'md_pitfall.param3_table_barekey'), lint(realProp));
  ok('param3 lint skipped without a property union (never guesses)',
    lintMdPitfalls(bareKey, {}).every(f => f.code !== 'md_pitfall.param3_table_barekey'));

  // --- 5. raw_engine_id_in_player_text (#58) ---
  const rawMdIdXml = `<mdscript name="RawIdProbe"><cues><cue name="Notify">
    <actions>
      <set_value name="$who" exact="$ship.owner.id"/>
      <write_to_logbook category="general" title="'Paid'" text="'Paid by ' + $ship.owner.id + ' today'"/>
      <show_notification text="'Lost to ' + faction.{$f}.id"/>
      <write_incoming_message title="'Alert'" text="'Attacked by ' + $who" source="'Fleet'"/>
      <show_help custom="'Macro: ' + $ship.macro.id"/>
    </actions></cue></cues></mdscript>`;
  const rawMdFindings = lintMdPitfalls(rawMdIdXml, { filePath: 'md/rawid.xml' })
    .filter(f => f.code === 'md_pitfall.raw_engine_id_in_player_text');
  ok('flags raw .id and single-purpose id $vars in MD logbook/notification/help/incoming_message (#58)',
    rawMdFindings.length === 4 && rawMdFindings.every(f => f.severity === 'warning' && f.cue === 'Notify'), rawMdFindings);
  const cleanMdIdXml = `<mdscript name="RawIdClean"><cues><cue name="Notify">
    <actions>
      <set_value name="$label" exact="$ship.owner.id"/>
      <set_value name="$label" exact="$ship.owner.knownname"/>
      <write_to_logbook category="general" title="'Paid'" text="'Paid by ' + $ship.owner.knownname + ' (' + $ship.idcode + ') — see object.id docs'"/>
      <show_notification text="'Saved ' + $label"/>
    </actions></cue></cues></mdscript>`;
  ok('knownname, idcode, literal string .id text, and mixed-assignment $vars do not false-positive (#58)',
    !lintMdPitfalls(cleanMdIdXml, { filePath: 'md/cleanid.xml' }).some(f => f.code === 'md_pitfall.raw_engine_id_in_player_text'));

  // --- 6. order_cancelled_override_suspension (#67 / FF-28) ---
  const overrideCode = 'md_pitfall.order_cancelled_override_suspension';
  const unguardedCancelRequeue = `<mdscript name="OrderCancelProbe"><cues>
    <cue name="RequeueOnCancel" instantiate="true" namespace="this">
      <conditions><event_object_order_cancelled object="$Ship"/></conditions>
      <actions>
        <debug_text text="'check event.param.exists'" comment="not event.param.exists"/>
        <create_order object="$Ship" id="'MoveGeneric'"/>
      </actions>
      <cues>
        <cue name="ChildWithUnrelatedExists"><actions><do_if value="$Other.exists"/></actions></cue>
      </cues>
    </cue>
  </cues></mdscript>`;
  const overrideHits = lintMdPitfalls(unguardedCancelRequeue, { filePath: 'md/orders.xml' })
    .filter(f => f.code === overrideCode);
  ok('flags unguarded event_object_order_cancelled as advisory info and notes create_order duplicate risk (#67)',
    overrideHits.length === 1
      && overrideHits[0].severity === 'info'
      && overrideHits[0].cue === 'RequeueOnCancel'
      && overrideHits[0].line === 3
      && overrideHits[0].detail.includes('duplicate order')
      && overrideHits[0].detail.includes('not event.param.exists'),
    overrideHits);
  const guardedCancelVariants = `<mdscript name="OrderCancelClean"><cues>
    <cue name="VanillaReconGuard" instantiate="true">
      <conditions><event_object_order_cancelled object="$Ship"/><check_value value="not event.param.exists"/></conditions>
      <actions><create_order object="$Ship" id="'Patrol'"/></actions>
    </cue>
    <cue name="DogfoodOverrideGuard" instantiate="true">
      <conditions><event_object_order_cancelled object="$Ship"/></conditions>
      <actions><do_if value="@$Order.exists and @$Ship.order.isoverride"><return/></do_if></actions>
    </cue>
    <cue name="VanillaIndexGuard" instantiate="true">
      <conditions><event_object_order_cancelled object="$Ship"/><check_value value="not $Ship.orders.indexof.{$Order}"/></conditions>
      <actions><debug_text text="'removed'"/></actions>
    </cue>
    <cue name="VanillaCountGuard" instantiate="true">
      <conditions><event_object_order_cancelled object="$Ship"/><check_value value="$Ship.orders.count == 0"/></conditions>
      <actions><debug_text text="'empty'"/></actions>
    </cue>
    <cue name="PairedEndedCheckAny" instantiate="true">
      <conditions>
        <check_any>
          <event_object_order_finished object="$Ship"/>
          <event_object_order_cancelled object="$Ship"/>
        </check_any>
      </conditions>
      <actions><debug_text text="'ended'"/></actions>
    </cue>
  </cues></mdscript>`;
  ok('suppresses order_cancelled_override_suspension on event.param.exists, .isoverride, .orders.indexof/count, and paired check_any (#67)',
    !lintMdPitfalls(guardedCancelVariants, { filePath: 'md/orders_clean.xml' }).some(f => f.code === overrideCode));

  // --- degradation ---
  ok('non-mdscript degrades to []', lint('<aiscript name="x"/>').length === 0);
  ok('garbage degrades to []', lint('not xml').length === 0);
  ok('empty degrades to []', lint('').length === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
