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
import { analyzeMdCueTrigger, classifyCueRef, mdConditionKind } from './cueLineage';
import { maskNonExpressionSpans, type ScriptPropertyIndex } from './scriptProperties';
import { assertXmlInputWithinLimits } from './xmlInputLimits';
import type { SchemaIndex } from './xsdValidate';
import type { DiffElementProvenance, DiffElementState } from './diffSimulator';

export interface MdPitfallFinding {
  code: 'md_pitfall.products_existence' | 'md_pitfall.cancel_conversation_actor_or_template' | 'md_pitfall.ui_listener_one_shot'
    | 'md_pitfall.offer_accepted_keyword_cue' | 'md_pitfall.param3_table_barekey' | 'md_pitfall.return_context'
    | 'md_pitfall.numeric_time_value' | 'md_pitfall.no_event_condition' | 'md_pitfall.illegal_instantiate'
    | MdExpressionFinding['code'];
  severity: 'error' | 'warning';
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

const EXPRESSION_TYPE = /^(?:\w+:)?(?:lvalue|boolean)?expression$/i;

/** The same actual attribute role governs direct scripts and effective diff writes. */
export function isScriptExpressionAttribute(elementName: string, attributeName: string, schema: SchemaIndex | null): boolean {
  const spec = schema?.elements.get(elementName)?.attributes.get(attributeName);
  return (elementName === 'set_value' && attributeName === 'exact')
    || (elementName === 'debug_text' && attributeName === 'text')
    || (elementName === 'do_if' && attributeName === 'value')
    || EXPRESSION_TYPE.test(spec?.type ?? '') || EXPRESSION_TYPE.test(spec?.baseType ?? '');
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

interface NumericFact {
  line?: number;
  inferred?: boolean;
}

function isStaticRootCue(node: Element | null, root: Element): boolean {
  return node?.tagName === 'cue' && node.parentElement?.tagName === 'cues'
    && node.parentElement.parentElement === root && !node.hasAttribute('ref')
    && (node.getAttribute('instantiate') === null || node.getAttribute('instantiate') === 'false');
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

function comparedEventParameter(value: string): string | undefined {
  let parameter: string | undefined;
  for (const term of value.trim().split(/\s+or\s+/)) {
    const comparison = /^(event\.param\d*)\s*==\s*(\S+)$/.exec(term);
    if (!comparison || !UNITLESS_NUMBER.test(comparison[2]) || (parameter && parameter !== comparison[1])) return;
    parameter = comparison[1];
  }
  return parameter;
}

function trackAssignment(action: Element, facts: Map<string, NumericFact>, tables: Set<string>, cues: Set<string>): void {
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
  if (!qualifier && /^table\[\s*\]$/.test(exact)) tables.add(field);
  if (source) facts.set(name, source);
}

function monitoredTimeout(action: Element): Attr | null {
  return action.getAttribute('targetmonitor') === 'true' ? action.getAttributeNode('timeout') : null;
}

/** Follow definite numeric values only within a single MD action region. */
function lintMdCutsceneTimeouts(root: Element, filePath?: string): MdPitfallFinding[] {
  const cutscenes = root.getElementsByTagName('play_cutscene');
  if (!cutscenes.length) return [];
  const findings: MdPitfallFinding[] = [];
  const cues = staticCueNames(root);
  function report(attribute: Attr, fact: NumericFact = {}): void {
    const expression = attribute.value.trim();
    const provenance = fact.line ? ` (source line ${fact.line})` : '';
    findings.push({
      code: 'md_pitfall.numeric_time_value', severity: fact.inferred ? 'warning' : 'error',
      filePath, line: attribute.lineNumber, column: attribute.columnNumber, sourceRef: 'play_cutscene/@timeout',
      detail: fact.inferred
        ? `<play_cutscene> timeout="${expression}" receives an event value compared with unitless numbers. Verify its type and convert it if it represents seconds.`
        : `<play_cutscene> timeout="${expression}" receives a unitless number${provenance}. X4 expects a time value. If this value represents seconds, use "(${expression})s".`,
    });
  }
  for (const cutscene of Array.from(cutscenes)) {
    const timeout = monitoredTimeout(cutscene);
    if (timeout && UNITLESS_NUMBER.test(timeout.value.trim())) report(timeout);
  }
  function walk(block: Element, facts: Map<string, NumericFact>, tables: Set<string>, visibleCues: Set<string>, depth: number): void {
    if (depth >= 128) return;
    for (let child = block.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      const action = child as Element;
      const tag = action.tagName;
      if (tag === 'set_value') {
        trackAssignment(action, facts, tables, visibleCues);
        continue;
      }
      if (tag === 'play_cutscene') {
        const timeout = monitoredTimeout(action);
        const fact = timeout && facts.get(timeout.value.trim());
        if (timeout && fact) report(timeout, fact);
      }
      if (CONDITIONAL_ACTIONS.has(tag)) {
        const inside = new Map(facts);
        const parameter = comparedEventParameter(action.getAttribute('value') ?? '');
        if (parameter) inside.set(parameter, { inferred: true });
        walk(action, inside, new Set(tables), visibleCues, depth + 1);
      }
      facts.clear();
      tables.clear();
    }
  }
  const noNamedCues = new Set<string>();
  for (const actions of Array.from(root.getElementsByTagName('actions'))) {
    const visibleCues = isStaticRootCue(actions.parentElement, root) ? cues : noNamedCues;
    walk(actions, new Map(), new Set(), visibleCues, 0);
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

/**
 * Lint one MD file. `propertyUnion` (from the scriptproperty index) makes the param3
 * lint union-aware; without it the param3 lint stays conservative (identifier must
 * look like a custom key: it is flagged only when it contains no known-property hit,
 * so with no union supplied we skip the lint entirely rather than guess).
 */
export function lintMdPitfalls(xml: string, opts: { propertyUnion?: Set<string>; propertyIndex?: ScriptPropertyIndex; filePath?: string } = {}): MdPitfallFinding[] {
  const out: MdPitfallFinding[] = [];
  if (!xml || typeof xml !== 'string' || !/<mdscript\b/i.test(xml)) return out;
  const masked = maskNonExpressionSpans(xml);

  // DOM parse for the cue-tree lints
  let doc: Document;
  let parseError = false;
  try {
    doc = new DOMParser({ onError: () => { parseError = true; } }).parseFromString(xml, 'text/xml');
  } catch { return out; }
  const element = doc.documentElement;
  // Non-MD and malformed XML produce no semantic finding here; structural/wellformedness validation owns those diagnostics.
  if (!element || element.nodeName !== 'mdscript' || parseError) return out;
  const root = element as unknown as ElementLike;
  out.push(...lintMdCutsceneTimeouts(element, opts.filePath));

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

  return out;
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

  // --- degradation ---
  ok('non-mdscript degrades to []', lint('<aiscript name="x"/>').length === 0);
  ok('garbage degrades to []', lint('not xml').length === 0);
  ok('empty degrades to []', lint('').length === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
