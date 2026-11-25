/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Scriptproperty validation — the ROADMAP "TOOL GAP" (AAR, 2026-06-27).
 *
 * The Forge validates XSD structure + cross-file cues, but NOT MD/AIScript PROPERTY
 * ACCESS against the game's `libraries/scriptproperties.xml`. A wrong-but-schema-legal
 * property (`$station.controlentity`, `$station.manager`) passes validate and only fails
 * IN-GAME (cost 3 /refreshmd cycles building the NPC census). This engine parses the
 * real scriptproperties.xml (keywords + datatypes with inheritance + `{$...}` placeholder
 * properties + `<import>`-generated dynamic properties) and lints `$obj.property` chains
 * in MD/AIScript XML, flagging unknown property segments as WARNINGS with the valid
 * options — "caught offline at author time" instead of "discovered in-game over N reloads".
 *
 * Honesty scope (determinism doctrine): `$var` roots are UNTYPED in MD, so traversal
 * retains every authoritative datatype/path candidate and accepts a chain only when a
 * candidate survives each literal segment. Typed first-segment checks apply to
 * non-dynamic KEYWORD roots (`event.`, `player.`, …) where the root is unambiguous.
 * Everything is a warning, never an error: absence from the parsed set can mean an
 * `<import>`-generated property, so we never claim certainty we don't have.
 *
 * House pattern: pure engine (no fs/network — caller supplies the XML strings) + oracle
 * (`runScriptPropertiesSelftest`) + public GET selftest route in server.ts.
 * XML parsing: xmldom (nested structure), per the house rule — regex only for flat files.
 */

import { DOMParser, type Element } from '@xmldom/xmldom';
import { parseMdScriptRoot } from './cueLineage';
import { parseExpressionChains } from './expressionAst';
import { createSourcePositionLocator, createXmlNodePositionLocator } from './xmlSourceSpans';
import { maskXmlOpaqueMarkup, scanXmlTagTokens } from '../../shared/xmlMarkup';

export interface SPEntry {
  kind: 'keyword' | 'datatype';
  name: string;
  /** datatype inheritance parent (`<datatype name="ship" type="container">`) */
  parent?: string;
  /** Authored pseudo datatype metadata; not an inferred runtime type. */
  pseudo?: boolean;
  /** literal HEAD tokens of this entry's own property names ("isclass.{$class}" → "isclass") */
  heads: Set<string>;
  /** head → `result` documentation text (for autocomplete; first definition wins) */
  headDocs: Map<string, string>;
  /** full property names as written (for suggestions/diagnostics) */
  propNames: string[];
  /** full property records as authored in scriptproperties.xml (reference API). */
  properties: Array<{ name: string; result: string; type: string }>;
  /** has a pure-placeholder property like "{$numeric}" — any segment is legal here */
  wildcard: boolean;
  /** contains <import> children — property set is dynamic/incomplete, don't type-check */
  dynamic: boolean;
  /** return datatype declared by a dynamic import template (faction.<id> -> faction) */
  dynamicResultType?: string;
}

export interface ResolvedScriptProperty {
  name: string;
  result: string;
  type: string;
  owner: string;
  inherited: boolean;
  /** Complete normalized authored path, retained for ordered traversal. */
  path?: string[];
}

export interface ScriptPropertyModel {
  keywords: Map<string, SPEntry>;
  datatypes: Map<string, SPEntry>;
  parsedProperties: number;
}

export interface ScriptPropertyPathIndex {
  keywords: Map<string, ResolvedScriptProperty[]>;
  datatypes: Map<string, ResolvedScriptProperty[]>;
}

export interface ScriptPropertyIndex {
  sourceInputs?: readonly { path: string; source: string; sha256: string }[];
  model: ScriptPropertyModel;
  /** union of every literal property head across all keywords + datatypes */
  union: Set<string>;
  /** head → first `result` doc seen (for autocomplete detail text; first wins) */
  docs: Map<string, string>;
  /** heads that exist as a COMPLETE bare property name on at least one type ("exists") */
  bareOk: Set<string>;
  /**
   * head → its literal continuation tokens ("controlentity" → {"default"}), with "*"
   * when a placeholder continuation exists ("controlentity.{$controlpost}" → "*").
   * A head present here but NOT in bareOk requires a sub-selector — using it bare is
   * exactly the $station.controlentity in-game failure from the 2026-06-27 AAR.
   */
  continuations: Map<string, Set<string>>;
  /** Complete normalized authored paths by keyword/datatype, including inherited datatype paths. */
  pathProperties?: ScriptPropertyPathIndex;
  /** true when built from a real (non-empty) scriptproperties.xml */
  loaded: boolean;
}

/** Source offsets use UTF-16 units in the validated, unmodified XML text. */
export interface ScriptPropertyCorrection {
  start: number;
  end: number;
  expectedText: string;
  replacement: string;
  datatype: string;
  declarationOwner: string;
}

export interface ScriptPropertyFinding {
  code: 'scriptproperty.unknown' | 'scriptproperty.requires_subselector' | 'scriptproperty.unresolved_type';
  severity: 'warning' | 'info';
  /** the full chain as written, e.g. "$station.controlentity" */
  chain: string;
  /** the offending segment */
  segment: string;
  /** keyword root the typed check used, when applicable */
  root?: string;
  /** Project-relative source file so editor diagnostics land in the correct buffer. */
  filePath?: string;
  line: number;
  column: number;
  typeContext?: { datatype: string; confidence: 'declared' | 'guarded' | 'hint' };
  suggestions: string[];
  correction?: ScriptPropertyCorrection;
  detail: string;
}

/* ------------------------------------------------------------------ *
 * Parsing — real shape (probed from the unpacked 9.00 game data):
 *   <scriptproperties>
 *     <keyword name="event" description="…"> <property name="param2" …/> … </keyword>
 *     <keyword name="faction" …> <import source="libraries/factions.xml" …> … </import> </keyword>
 *     <datatype name="component"> <property name="isclass.{$class}" …/> … </datatype>
 *     <datatype name="ship" type="container"> … </datatype>   (inheritance via type)
 *     <datatype name="list"> <property name="{$numeric}" …/> </datatype>  (wildcard)
 * ------------------------------------------------------------------ */

/** Literal head of a property name: text before the first '.' or placeholder. Empty → wildcard. */
export function propertyHead(name: string): string {
  const m = String(name || '').match(/^([A-Za-z_][\w]*)/);
  return m ? m[1].toLowerCase() : '';
}

function normalizedPropertyPath(name: string): string[] {
  return String(name || '')
    .split('.')
    .map(segment => segment.replace(/\?$/, '').trim().toLowerCase())
    .filter(Boolean);
}

export function parseScriptProperties(xml: string): ScriptPropertyModel {
  const model: ScriptPropertyModel = { keywords: new Map(), datatypes: new Map(), parsedProperties: 0 };
  if (!xml || typeof xml !== 'string') return model;
  let doc: ReturnType<DOMParser['parseFromString']>;
  try {
    doc = new DOMParser({ onError: () => { /* collect nothing; degrade */ } }).parseFromString(xml, 'text/xml');
  } catch {
    return model;
  }
  const root = doc?.documentElement;
  if (!root || root.nodeName !== 'scriptproperties') return model;

  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i] as unknown as { nodeType: number; nodeName: string; getAttribute?: (n: string) => string | null; getElementsByTagName?: (n: string) => ArrayLike<{ getAttribute: (n: string) => string | null }>; childNodes?: ArrayLike<{ nodeType: number; nodeName: string }> };
    if (node.nodeType !== 1) continue;
    const kind = node.nodeName === 'keyword' ? 'keyword' : node.nodeName === 'datatype' ? 'datatype' : null;
    if (!kind || !node.getAttribute) continue;
    const name = (node.getAttribute('name') || '').toLowerCase();
    if (!name) continue;

    const entry: SPEntry = {
      kind,
      name,
      parent: (node.getAttribute('type') || '').toLowerCase() || undefined,
      pseudo: node.getAttribute('pseudo') ? ['true', '1'].includes(node.getAttribute('pseudo') || '') : undefined,
      heads: new Set<string>(),
      headDocs: new Map<string, string>(),
      propNames: [],
      properties: [],
      wildcard: false,
      dynamic: false,
    };
    // properties can be direct children OR nested inside <import> templates; count only
    // direct <property> children as the static set, and any <import> marks it dynamic.
    const kids = node.childNodes || [];
    for (let k = 0; k < kids.length; k++) {
      const kid = kids[k] as unknown as { nodeType: number; nodeName: string; getAttribute?: (n: string) => string | null };
      if (kid.nodeType !== 1) continue;
      if (kid.nodeName === 'import') {
        entry.dynamic = true;
        const imported = (kid as unknown as { getElementsByTagName?: (n: string) => ArrayLike<{ getAttribute: (n: string) => string | null }> })
          .getElementsByTagName?.('property');
        const resultType = imported?.[0]?.getAttribute?.('type') || '';
        if (resultType && !entry.dynamicResultType) entry.dynamicResultType = resultType.toLowerCase();
        continue;
      }
      if (kid.nodeName !== 'property' || !kid.getAttribute) continue;
      const pname = kid.getAttribute('name') || '';
      if (!pname) continue;
      model.parsedProperties++;
      entry.propNames.push(pname);
      entry.properties.push({
        name: pname,
        result: kid.getAttribute('result') || '',
        type: kid.getAttribute('type') || '',
      });
      const head = propertyHead(pname);
      if (head) {
        entry.heads.add(head);
        const doc = kid.getAttribute('result') || '';
        if (doc && !entry.headDocs.has(head)) entry.headDocs.set(head, doc);
      } else entry.wildcard = true; // pure placeholder like "{$numeric}"
    }
    (kind === 'keyword' ? model.keywords : model.datatypes).set(name, entry);
  }
  return model;
}

/** Resolve a datatype's full head set following `type` inheritance (cycle-safe). */
export function resolveDatatypeHeads(model: ScriptPropertyModel, name: string): Set<string> {
  const out = new Set<string>();
  let cur = model.datatypes.get(String(name || '').toLowerCase());
  const seen = new Set<string>();
  while (cur && !seen.has(cur.name)) {
    seen.add(cur.name);
    for (const h of cur.heads) out.add(h);
    cur = cur.parent ? model.datatypes.get(cur.parent) : undefined;
  }
  return out;
}

/** Full property records for a datatype, own definitions first then inherited parents. */
export function resolveDatatypeProperties(model: ScriptPropertyModel, name: string): ResolvedScriptProperty[] {
  const out: ResolvedScriptProperty[] = [];
  const seenTypes = new Set<string>();
  const seenNames = new Set<string>();
  let current = model.datatypes.get(String(name || '').toLowerCase());
  let inherited = false;
  while (current && !seenTypes.has(current.name)) {
    seenTypes.add(current.name);
    for (const property of current.properties) {
      const key = property.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      out.push({ ...property, owner: current.name, inherited, path: normalizedPropertyPath(property.name) });
    }
    current = current.parent ? model.datatypes.get(current.parent) : undefined;
    inherited = true;
  }
  return out;
}

export function buildScriptPropertyIndex(xml: string): ScriptPropertyIndex {
  const model = parseScriptProperties(xml);
  return buildScriptPropertyIndexFromModel(model);
}

export function buildScriptPropertyIndexFromModel(model: ScriptPropertyModel): ScriptPropertyIndex {
  const union = new Set<string>();
  const docs = new Map<string, string>();
  const bareOk = new Set<string>();
  const continuations = new Map<string, Set<string>>();
  for (const entry of [...model.keywords.values(), ...model.datatypes.values()]) {
    for (const h of entry.heads) {
      union.add(h);
      const d = entry.headDocs.get(h);
      if (d && !docs.has(h)) docs.set(h, d);
    }
    for (const pname of entry.propNames) {
      const head = propertyHead(pname);
      if (!head) continue;
      const rest = pname.slice(head.length);
      if (rest === '') { bareOk.add(head); continue; }
      if (!rest.startsWith('.')) { bareOk.add(head); continue; } // "head?" style oddities — treat as bare
      const contSet = continuations.get(head) || new Set<string>();
      const contTok = rest.slice(1).match(/^([A-Za-z_]\w*)/)?.[1];
      contSet.add(contTok ? contTok.toLowerCase() : '*'); // placeholder continuation → "*"
      continuations.set(head, contSet);
    }
  }
  const pathProperties: ScriptPropertyPathIndex = {
    keywords: new Map<string, ResolvedScriptProperty[]>(),
    datatypes: new Map<string, ResolvedScriptProperty[]>(),
  };
  for (const entry of model.keywords.values()) {
    pathProperties.keywords.set(entry.name, entry.properties.map(property => ({
      ...property,
      owner: entry.name,
      inherited: false,
      path: normalizedPropertyPath(property.name),
    })));
  }
  for (const entry of model.datatypes.values()) {
    pathProperties.datatypes.set(entry.name, resolveDatatypeProperties(model, entry.name));
  }
  return { model, union, docs, bareOk, continuations, pathProperties, loaded: union.size > 0 };
}

/* ------------------------------------------------------------------ *
 * Chain lint.
 * ------------------------------------------------------------------ */

/** Small edit distance for suggestions (capped; returns >cap early). */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > cap) return cap + 1;
  }
  return dp[b.length];
}

export function suggestProperties(segment: string, candidates: Iterable<string>, max = 5): string[] {
  const seg = segment.toLowerCase();
  const scored: { name: string; score: number }[] = [];
  for (const c of candidates) {
    let score = Number.MAX_SAFE_INTEGER;
    if (c.startsWith(seg.slice(0, 4)) && seg.length >= 4) score = 1;
    const d = editDistance(seg, c, 2);
    if (d <= 2) score = Math.min(score, d);
    if (score !== Number.MAX_SAFE_INTEGER) scored.push({ name: c, score });
  }
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return scored.slice(0, max).map(s => s.name);
}

const PROSE_XML_ATTRIBUTES = new Set(['comment', 'result', 'description']);
const NON_EXPRESSION_DECLARATION_NAME_ELEMENTS = new Set(['mdscript', 'aiscript', 'cue', 'library', 'param', 'order']);
const MD_STRING_MARKERS = /('|&apos;|&#(?:0*39|x0*27);)|\\|&#(?:0*92|x0*5[cC]);/g;
const blankXmlSpan = (source: string) => source.replace(/[^\r\n]/g, ' ');

function maskMdAttributeStrings(value: string): string {
  if (!value.includes("'") && !value.includes('&')) return value;
  let start: number | undefined;
  let escapedAt = -1;
  let cursor = 0;
  const parts: string[] = [];
  for (const match of value.matchAll(MD_STRING_MARKERS)) {
    const { index } = match;
    const end = index + match[0].length;
    if (start === undefined) {
      if (match[1]) start = index;
    } else if (index !== escapedAt) {
      if (match[1]) {
        parts.push(value.slice(cursor, start), blankXmlSpan(value.slice(start, end)));
        cursor = end;
        start = undefined;
      } else {
        escapedAt = end;
      }
    }
  }
  if (start !== undefined) parts.push(value.slice(cursor, start), blankXmlSpan(value.slice(start)));
  else parts.push(value.slice(cursor));
  return parts.join('');
}

type XmlAttributeSpan = { element: string; name: string; start: number; end: number; value: string };

/** Hide opaque markup, prose/declaration attributes and MD strings at their original source widths. */
export function maskNonExpressionSpans(xml: string, onAttribute?: (attribute: XmlAttributeSpan) => void): string {
  const source = maskXmlOpaqueMarkup(String(xml || ''));
  const parts: string[] = [];
  let cursor = 0;
  for (const { start, token, complete } of scanXmlTagTokens(source)) {
    const tagElement = /^<([A-Za-z_][\w.:-]*)\b/.exec(token)?.[1];
    const lowerElement = tagElement?.toLowerCase();
    const element = onAttribute && complete ? tagElement : undefined;
    const attributes: XmlAttributeSpan[] | undefined = element ? [] : undefined;
    for (const match of token.matchAll(/\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g)) {
      const [, name, quote, value] = match;
      const lowerName = name.toLowerCase();
      const isDeclarationIdentifier = (lowerName === 'name' && lowerElement !== undefined && NON_EXPRESSION_DECLARATION_NAME_ELEMENTS.has(lowerElement))
        || (lowerName === 'id' && lowerElement === 'order');
      const end = start + match.index + match[0].length;
      if (PROSE_XML_ATTRIBUTES.has(lowerName) || isDeclarationIdentifier) {
        const attributeStart = start + match.index;
        parts.push(source.slice(cursor, attributeStart), blankXmlSpan(match[0]));
      } else {
        if (element && attributes) {
          attributes.push({ element, name, start: end - value.length - 1, end: end - 1, value });
        }
        const masked = maskMdAttributeStrings(value);
        if (quote === '"' && masked === value) continue;
        // Normalize XML delimiters for downstream scans of the masked text.
        parts.push(source.slice(cursor, end - value.length - 2), '"', masked, '"');
      }
      cursor = end;
    }
    if (onAttribute && attributes?.length && new Set(attributes.map(attribute => attribute.name)).size === attributes.length) {
      attributes.forEach(onAttribute);
    }
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

/** Roots that behave like untyped object references in MD/AIScript context. */
const UNTYPED_ROOTS = new Set(['this', 'parent', 'static', 'namespace']);

type PathContextKind = 'keyword' | 'datatype';

interface PathContext {
  kind: PathContextKind;
  name: string;
}

interface PathAnchor {
  head: string;
  at: number;
  chainAt: string;
}

interface PlaceholderLiteralMatch {
  segment: string;
  at: number;
  chainAt: string;
}

type PathState =
  | { kind: 'context'; context: PathContext }
  | {
    kind: 'pending';
    remaining: string[];
    property: ResolvedScriptProperty;
    anchor: PathAnchor;
    requiresSubselector: boolean;
    placeholderLiteral?: PlaceholderLiteralMatch;
  }
  | { kind: 'complete'; property: ResolvedScriptProperty }
  | { kind: 'opaque'; property?: ResolvedScriptProperty };

function normalizedPathSegment(segment: string): string {
  return String(segment || '').replace(/\?$/, '').trim().toLowerCase();
}

function pathForProperty(property: ResolvedScriptProperty): string[] {
  return property.path?.length ? property.path : normalizedPropertyPath(property.name);
}

function isAuthoredPlaceholder(segment: string): boolean {
  return /^\{[^}]*\}$/.test(segment) || /^<[^>]+>$/.test(segment);
}

function pathHeadMatches(expected: string, actual: { kind: string; name: string }): boolean {
  if (actual.kind !== 'property') return isAuthoredPlaceholder(expected);
  // A placeholder at the start of a candidate cannot validate an arbitrary
  // literal on an untyped root. Placeholder literals become conservative only
  // after a literal head has grounded the authored path.
  if (isAuthoredPlaceholder(expected)) return false;
  return normalizedPathSegment(expected) === actual.name;
}

function pathContinuationMatches(expected: string, actual: { kind: string; name: string }): boolean {
  // Dynamic/list/variable selectors conservatively satisfy an authored pending
  // continuation. An unbraced literal can also bind an authored placeholder,
  // but its selector domain is not certified by this engine.
  if (actual.kind !== 'property' || isAuthoredPlaceholder(expected)) return true;
  return normalizedPathSegment(expected) === actual.name;
}

function pathPropertiesForContext(index: ScriptPropertyIndex, context: PathContext): ResolvedScriptProperty[] {
  const cached = context.kind === 'keyword'
    ? index.pathProperties?.keywords.get(context.name)
    : index.pathProperties?.datatypes.get(context.name);
  if (cached) return cached;
  if (context.kind === 'keyword') {
    const entry = index.model.keywords.get(context.name);
    return entry ? entry.properties.map(property => ({
      ...property,
      owner: entry.name,
      inherited: false,
      path: normalizedPropertyPath(property.name),
    })) : [];
  }
  return resolveDatatypeProperties(index.model, context.name);
}

function allPathContexts(index: ScriptPropertyIndex): PathContext[] {
  return [...index.model.datatypes.keys()].sort().map(name => ({ kind: 'datatype' as const, name }));
}

function keyedSubtypeReceivers(index: ScriptPropertyIndex, states: PathState[], head: string): string[] {
  if (!index.continuations.get(head)?.has('*') && !index.bareOk.has(head)) return [];
  const receivers = new Set(states.flatMap(state =>
    state.kind === 'context' && state.context.kind === 'datatype' ? [state.context.name] : []));
  if (!receivers.size) return [];

  const unresolved = new Set<string>();
  for (const entry of index.model.datatypes.values()) {
    if (!entry.heads.has(head) || !entry.properties.some(property => {
      const [name, key] = normalizedPropertyPath(property.name);
      if (name !== head) return false;
      if (key) return isAuthoredPlaceholder(key);
      // The selector may index the declared result, as in attackers.{1}.
      const result: PathContext = { kind: 'datatype', name: property.type.trim().toLowerCase() };
      return pathPropertiesForContext(index, result).some(candidate => {
        const path = pathForProperty(candidate);
        return path.length === 1 && isAuthoredPlaceholder(path[0]);
      });
    })) continue;

    const visited = new Set([entry.name]);
    let parent = entry.parent;
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      if (receivers.has(parent)) unresolved.add(parent);
      parent = index.model.datatypes.get(parent)?.parent;
    }
  }
  return [...unresolved].sort();
}

function pathStateKey(state: PathState): string {
  if (state.kind === 'context') return `context:${state.context.kind}:${state.context.name}`;
  if (state.kind === 'pending') {
    return `pending:${state.property.name.toLowerCase()}:${state.property.type.toLowerCase()}:${state.remaining.join('.')}:${state.anchor.head}:${state.requiresSubselector}:${state.placeholderLiteral?.segment || ''}`;
  }
  if (state.kind === 'opaque') {
    return `opaque:${state.property?.owner || ''}:${state.property?.name.toLowerCase() || ''}:${state.property?.type.toLowerCase() || ''}`;
  }
  return `complete:${state.property.name.toLowerCase()}:${state.property.type.toLowerCase()}`;
}

function dedupePathStates(states: PathState[]): PathState[] {
  const seen = new Set<string>();
  const out: PathState[] = [];
  for (const state of states) {
    const key = pathStateKey(state);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(state);
  }
  return out;
}

function statesAfterProperty(
  index: ScriptPropertyIndex,
  property: ResolvedScriptProperty,
  remaining: string[],
  anchor: PathAnchor,
  requiresSubselector: boolean,
  placeholderLiteral?: PlaceholderLiteralMatch,
): PathState[] {
  if (remaining.length) {
    return [{ kind: 'pending', remaining, property, anchor, requiresSubselector, placeholderLiteral }];
  }
  const nextType = String(property.type || '').trim().toLowerCase();
  if (nextType && index.model.datatypes.has(nextType)) {
    return [{ kind: 'context', context: { kind: 'datatype', name: nextType } }];
  }
  // The authored property is complete, but an empty or unavailable return type
  // cannot support deterministic checking of any later segment.
  return [{ kind: 'complete', property }, { kind: 'opaque', property }];
}

interface PropertyHeadCandidate {
  property: ResolvedScriptProperty;
  path: string[];
  head: string;
}

interface PropertyHeadGroup {
  candidates: PropertyHeadCandidate[];
  hasBareForm: boolean;
}

interface PropertyHeadLookup {
  literal: Map<string, PropertyHeadGroup>;
  placeholder: PropertyHeadGroup;
}

function propertyHeadsForContext(
  index: ScriptPropertyIndex, context: PathContext, cache: Map<string, PropertyHeadLookup>,
): PropertyHeadLookup {
  const key = `${context.kind}:${context.name}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const lookup: PropertyHeadLookup = { literal: new Map(), placeholder: { candidates: [], hasBareForm: false } };
  for (const property of pathPropertiesForContext(index, context)) {
    const path = pathForProperty(property);
    if (!path.length) continue;
    const literalHead = normalizedPathSegment(path[0]);
    const candidate = { property, path, head: propertyHead(property.name) || literalHead };
    if (isAuthoredPlaceholder(path[0])) {
      lookup.placeholder.candidates.push(candidate);
      continue;
    }
    let group = lookup.literal.get(literalHead);
    if (!group) {
      group = { candidates: [], hasBareForm: false };
      lookup.literal.set(literalHead, group);
    }
    group.candidates.push(candidate);
    if (path.length === 1) group.hasBareForm = true;
  }
  cache.set(key, lookup);
  return lookup;
}

function advancePathStates(
  index: ScriptPropertyIndex,
  states: PathState[],
  segment: { kind: string; name: string },
  chainAt: string,
  at: number,
  headCache: Map<string, PropertyHeadLookup>,
): PathState[] {
  const next: PathState[] = [];
  for (const state of states) {
    if (state.kind === 'opaque') {
      next.push(state);
      continue;
    }
    if (state.kind === 'context') {
      const heads = propertyHeadsForContext(index, state.context, headCache);
      // Only dynamic selectors may start at an authored placeholder.
      const group = segment.kind === 'property' ? heads.literal.get(segment.name) : heads.placeholder;
      if (!group) continue;
      for (const { property, path, head } of group.candidates) {
        next.push(...statesAfterProperty(index, property, path.slice(1), { head, at, chainAt }, !group.hasBareForm));
      }
      continue;
    }
    if (state.kind === 'pending' && state.remaining.length && pathContinuationMatches(state.remaining[0], segment)) {
      const placeholderLiteral = segment.kind === 'property' && isAuthoredPlaceholder(state.remaining[0])
        ? { segment: segment.name, at, chainAt }
        : state.placeholderLiteral;
      next.push(...statesAfterProperty(
        index,
        state.property,
        state.remaining.slice(1),
        state.anchor,
        state.requiresSubselector,
        placeholderLiteral,
      ));
    }
  }
  return dedupePathStates(next);
}

function pendingPathState(states: PathState[]): Extract<PathState, { kind: 'pending' }> | undefined {
  return states
    .filter((state): state is Extract<PathState, { kind: 'pending' }> => state.kind === 'pending')
    .sort((a, b) => Number(b.requiresSubselector) - Number(a.requiresSubselector)
      || a.anchor.at - b.anchor.at || a.anchor.head.localeCompare(b.anchor.head))[0];
}

function candidateHeads(index: ScriptPropertyIndex, states: PathState[]): Set<string> {
  const heads = new Set<string>();
  for (const state of states) {
    if (state.kind === 'pending') {
      const next = state.remaining[0];
      if (next && !isAuthoredPlaceholder(next)) heads.add(normalizedPathSegment(next));
      continue;
    }
    if (state.kind !== 'context') continue;
    for (const property of pathPropertiesForContext(index, state.context)) {
      const path = pathForProperty(property);
      const head = path[0];
      if (head && !isAuthoredPlaceholder(head)) heads.add(normalizedPathSegment(head));
    }
  }
  return heads.size ? heads : new Set(index.union);
}

function pushFinding(out: ScriptPropertyFinding[], finding: ScriptPropertyFinding): void {
  if (out.some(existing => existing.code === finding.code
    && existing.line === finding.line
    && existing.column === finding.column
    && existing.chain === finding.chain
    && existing.segment === finding.segment)) return;
  out.push(finding);
}

function knownVariableDatatype(
  root: string,
  index: ScriptPropertyIndex,
  opts?: { variableTypes?: Record<string, string> },
): string | undefined {
  if (!root.startsWith('$')) return undefined;
  const rootName = root.slice(1).toLowerCase();
  const supplied = opts?.variableTypes?.[root]
    || opts?.variableTypes?.[root.toLowerCase()]
    || opts?.variableTypes?.[rootName];
  const candidate = String(supplied || (index.model.datatypes.has(rootName) ? rootName : '')).toLowerCase();
  return candidate && index.model.datatypes.has(candidate) ? candidate : undefined;
}

function variablePathContexts(
  root: string,
  index: ScriptPropertyIndex,
  opts?: { variableTypes?: Record<string, string> },
): PathContext[] {
  const contexts = allPathContexts(index);
  const preferred = knownVariableDatatype(root, index, opts);
  if (!preferred) return contexts;
  return [
    { kind: 'datatype', name: preferred },
    ...contexts.filter(context => context.name !== preferred),
  ];
}

/** A known lookup-only keyword can declare its receiver after literal selectors. */
function literalKeywordLookup(
  index: ScriptPropertyIndex,
  keyword: string,
  segments: readonly { kind: string; name: string }[],
): { consumed: number; states: PathState[] } | undefined {
  const entry = index.model.keywords.get(keyword);
  if (!entry || entry.dynamic || entry.heads.size || !segments.length) return undefined;
  const types = new Set<string>();
  let consumed: number | undefined;
  for (const property of pathPropertiesForContext(index, { kind: 'keyword', name: keyword })) {
    const path = pathForProperty(property);
    if (!path.length) continue;
    const compatible = path.slice(0, segments.length).every((expected, position) => {
      const actual = segments[position];
      return actual.kind !== 'property' || isAuthoredPlaceholder(expected)
        || normalizedPathSegment(expected) === actual.name;
    });
    if (!compatible) continue;
    // Do not discard a competing shortcut, incomplete lookup or unknown result.
    // readtext, for example, also owns a longer .test fallback template.
    if (!path.every(isAuthoredPlaceholder) || path.length > segments.length
      || segments.slice(0, path.length).some(segment => segment.kind !== 'property')) return undefined;
    const datatype = property.type.trim().toLowerCase();
    if (!datatype || !index.model.datatypes.has(datatype)
      || (consumed !== undefined && consumed !== path.length)) return undefined;
    consumed = path.length;
    types.add(datatype);
  }
  if (consumed === undefined || !types.size) return undefined;
  return { consumed, states: [...types].map(name => ({
    kind: 'context' as const, context: { kind: 'datatype' as const, name },
  })) };
}

type ScriptPropertyOptions = {
  filePath?: string;
  variableTypes?: Record<string, string>;
  correctionAttribute?: (element: string, attribute: string) => boolean;
};
type PropertyPosition = Pick<ScriptPropertyFinding, 'line' | 'column'>;
interface IsClassGuardSpan {
  start: number;
  end: number;
  receiverChainLower: string;
  targetDatatype: string;
}

const POSITIVE_GUARD_ATTRIBUTES = new Set(['value', 'chance', 'weight', 'comment']);
const CONTROL_FLOW_ANCESTOR_TAGS = new Set(['do_if', 'do_elseif', 'do_else', 'do_all', 'do_for_each', 'do_while']);
const ACTIONS_OWNER_TAGS = new Set(['cue', 'library', 'attention', 'aiscript']);
const POSITIVE_ISCLASS_GUARD_RE = /^@?([A-Za-z_$][\w$.]*)\.isclass\.([A-Za-z_]\w*)$/;

function parseScriptDocumentRoot(xml: string): Element | null {
  const mdRoot = parseMdScriptRoot(xml);
  if (mdRoot && !mdRoot.namespaceURI) return mdRoot;
  let malformed = false;
  try {
    const root = new DOMParser({ onError: () => { malformed = true; } })
      .parseFromString(xml.replace(/^\uFEFF/, ''), 'text/xml').documentElement;
    return !malformed && root && !root.namespaceURI && root.nodeName === 'aiscript' ? root : null;
  } catch {
    return null;
  }
}

function collectDeclaredMdCueNames(root: Element | null): ReadonlySet<string> {
  if (!root || root.nodeName !== 'mdscript') return new Set();
  const names = new Set<string>();
  for (const cue of Array.from(root.getElementsByTagName('cue'))) {
    if (cue.namespaceURI) continue;
    const rawName = cue.getAttribute('name')?.trim();
    if (rawName && /^[A-Za-z_]\w*$/.test(rawName)) names.add(rawName);
  }
  return names;
}

function datatypeRootAncestor(model: ScriptPropertyModel, datatype: string): string | undefined {
  let current: string | undefined = datatype.toLowerCase();
  const seen = new Set<string>();
  let last: string | undefined;
  while (current && !seen.has(current)) {
    const entry = model.datatypes.get(current);
    if (!entry) break;
    seen.add(current);
    last = entry.name;
    current = entry.parent;
  }
  return last;
}

function sharesDatatypeRoot(model: ScriptPropertyModel, left: string, right: string): boolean {
  const leftRoot = datatypeRootAncestor(model, left);
  const rightRoot = datatypeRootAncestor(model, right);
  return Boolean(leftRoot && leftRoot === rightRoot);
}

function hasValidActionsAncestor(branch: Element): boolean {
  let cursor = branch.parentElement;
  while (cursor) {
    if (cursor.namespaceURI) return false;
    if (cursor.tagName === 'actions') {
      const owner = cursor.parentElement;
      return Boolean(owner && !owner.namespaceURI && ACTIONS_OWNER_TAGS.has(owner.tagName));
    }
    if (!CONTROL_FLOW_ANCESTOR_TAGS.has(cursor.tagName)) return false;
    cursor = cursor.parentElement;
  }
  return false;
}

function parsePositiveIsClassClause(clause: string, index: ScriptPropertyIndex): { receiverChainLower: string; targetDatatype: string } | null {
  let trimmed = clause.trim();
  while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0 && i < trimmed.length - 1) {
          balanced = false;
          break;
        }
      }
    }
    if (!balanced || depth !== 0) break;
    trimmed = trimmed.slice(1, -1).trim();
  }
  const match = POSITIVE_ISCLASS_GUARD_RE.exec(trimmed);
  if (!match) return null;
  const targetDatatype = match[2].toLowerCase();
  const targetEntry = index.model.datatypes.get(targetDatatype);
  if (!targetEntry || targetEntry.pseudo) return null;
  return { receiverChainLower: match[1].toLowerCase(), targetDatatype };
}

function collectXmlIsClassGuardSpans(xml: string, root: Element | null, index: ScriptPropertyIndex): IsClassGuardSpan[] {
  if (!root || !xml.includes('.isclass.')) return [];
  const spans: IsClassGuardSpan[] = [];
  const locate = createXmlNodePositionLocator(xml);
  const pushAttributeSpan = (attrNode: ReturnType<Element['getAttributeNode']>, guard: { receiverChainLower: string; targetDatatype: string }) => {
    if (!attrNode) return;
    const quote = locate.offset(attrNode);
    if (quote === undefined) return;
    const delimiter = xml[quote];
    if (delimiter !== '"' && delimiter !== "'") return;
    const end = xml.indexOf(delimiter, quote + 1);
    if (end > quote) {
      spans.push({ start: quote + 1, end, ...guard });
    }
  };

  const branches = [
    ...Array.from(root.getElementsByTagName('do_if')),
    ...Array.from(root.getElementsByTagName('do_elseif')),
  ];
  for (const branch of branches) {
    if (branch.namespaceURI || !hasValidActionsAncestor(branch)
      || Array.from(branch.attributes).some(attribute => !POSITIVE_GUARD_ATTRIBUTES.has(attribute.name))) continue;
    const guard = parsePositiveIsClassClause(branch.getAttribute('value') ?? '', index);
    if (!guard) continue;
    const rootVarLower = guard.receiverChainLower.startsWith('$') ? guard.receiverChainLower.split('.')[0] : undefined;

    for (const child of Array.from(branch.children)) {
      if (child.namespaceURI) break;
      if (child.tagName === 'debug_text' && child.children.length === 0) {
        pushAttributeSpan(child.getAttributeNode('text'), guard);
        continue;
      }
      if (child.tagName === 'set_value' && child.children.length === 0
        && /^\$[A-Za-z_]\w*$/.test(child.getAttribute('name') ?? '')
        && !child.hasAttribute('operation')) {
        pushAttributeSpan(child.getAttributeNode('exact'), guard);
        if (rootVarLower && child.getAttribute('name')?.trim().toLowerCase() === rootVarLower) break;
        continue;
      }
      if (child.tagName === 'substitute_text' && /^\$[A-Za-z_]\w*$/.test(child.getAttribute('text') ?? '')) {
        const children = Array.from(child.children);
        if (children.some(grand => grand.namespaceURI || grand.tagName !== 'replace' || grand.children.length > 0)) break;
        pushAttributeSpan(child.getAttributeNode('source'), guard);
        for (const rep of children) {
          pushAttributeSpan(rep.getAttributeNode('string'), guard);
          pushAttributeSpan(rep.getAttributeNode('with'), guard);
        }
        if (rootVarLower && child.getAttribute('text')?.trim().toLowerCase() === rootVarLower) break;
        continue;
      }
      // Any other action could mutate state or suspend execution; stop narrowing.
      break;
    }
  }
  return spans.sort((a, b) => a.start - b.start || a.end - b.end);
}

function splitTopLevelKeywordOperator(maskedExpr: string, keyword: 'and' | 'or'): { start: number; end: number; text: string }[] {
  const parts: { start: number; end: number; text: string }[] = [];
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let partStart = 0;
  const len = maskedExpr.length;
  const kwLen = keyword.length;
  const isIdentOrDot = (ch: string | undefined) => Boolean(ch && /[A-Za-z0-9_$.]/.test(ch));
  for (let i = 0; i < len; i++) {
    const ch = maskedExpr[i];
    if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if (ch === '{') brace++;
    else if (ch === '}') brace = Math.max(0, brace - 1);
    else if (paren === 0 && bracket === 0 && brace === 0
      && maskedExpr.slice(i, i + kwLen).toLowerCase() === keyword
      && !isIdentOrDot(maskedExpr[i - 1])
      && !isIdentOrDot(maskedExpr[i + kwLen])) {
      parts.push({ start: partStart, end: i, text: maskedExpr.slice(partStart, i) });
      i += kwLen - 1;
      partStart = i + 1;
    }
  }
  parts.push({ start: partStart, end: len, text: maskedExpr.slice(partStart, len) });
  return parts;
}

function collectConjunctionIsClassGuards(maskedExpr: string, baseOffset: number, index: ScriptPropertyIndex): IsClassGuardSpan[] {
  if (!maskedExpr.includes('.isclass.')) return [];
  if (splitTopLevelKeywordOperator(maskedExpr, 'or').length > 1) return [];
  const conjuncts = splitTopLevelKeywordOperator(maskedExpr, 'and');
  if (conjuncts.length < 2) return [];
  const spans: IsClassGuardSpan[] = [];
  for (let i = 0; i < conjuncts.length - 1; i++) {
    const guard = parsePositiveIsClassClause(conjuncts[i].text, index);
    if (!guard) continue;
    spans.push({
      start: baseOffset + conjuncts[i + 1].start,
      end: baseOffset + maskedExpr.length,
      ...guard,
    });
  }
  return spans;
}

const MAX_TRACE_STEPS = 32;
const MAX_TRACE_EXPRESSION_LENGTH = 4096;

export interface ScriptPropertyTraceStep {
  segment: string;
  start: number;
  end: number;
  kind: 'keyword' | 'variable' | 'property';
  confidence: 'declared' | 'hint' | 'unestablished';
  owner?: string;
  property?: string;
  datatype?: string;
  inherited?: boolean;
}

export interface ScriptPropertyTrace {
  status: 'resolved' | 'unknown-receiver' | 'unknown-property' | 'ambiguous' | 'unsupported' | 'unavailable' | 'limit';
  steps: ScriptPropertyTraceStep[];
  resultType?: string;
}

function explicitTraceHints(root: string, variableTypes: Readonly<Record<string, string>> | undefined): string[] {
  const name = root.slice(1).toLowerCase();
  return [...new Set(Object.entries(variableTypes ?? {}).flatMap(([key, value]) =>
    key.replace(/^\$/, '').toLowerCase() === name ? [value.trim().toLowerCase()] : []))];
}

/** Resolve authored property paths for one whole static chain, without editor guesses. */
export function traceScriptPropertyExpression(
  expression: string,
  index: ScriptPropertyIndex | null | undefined,
  opts?: Pick<ScriptPropertyOptions, 'variableTypes'>,
): ScriptPropertyTrace {
  const steps: ScriptPropertyTraceStep[] = [];
  if (!index?.loaded) return { status: 'unavailable', steps };
  const normalized = expression.trim();
  if (normalized.length > MAX_TRACE_EXPRESSION_LENGTH) return { status: 'limit', steps };
  const parsed = parseExpressionChains(normalized)
    .find(chain => chain.start === 0 && chain.end === normalized.length);
  if (!parsed || normalized.startsWith('@')
    || parsed.segments.some(segment => segment.kind !== 'property' || segment.optional)) return { status: 'unsupported', steps };
  if (parsed.segments.length + 1 > MAX_TRACE_STEPS) return { status: 'limit', steps };

  const { root, segments } = parsed;
  const variable = root.raw.startsWith('$');
  const hints = variable ? explicitTraceHints(root.raw, opts?.variableTypes) : [];
  const hint: string | undefined = hints[0];
  const keyword = variable ? undefined : index.model.keywords.get(root.name);
  const knownHint = hints.length === 1 && hint !== undefined && index.model.datatypes.has(hint);
  const confidence = variable ? 'hint' : 'declared';
  steps.push({
    segment: root.raw, start: root.start, end: root.end,
    kind: variable ? 'variable' : 'keyword',
    confidence: knownHint || keyword ? confidence : 'unestablished',
    ...(knownHint ? { datatype: hint } : {}),
  });
  if (hints.length > 1) return { status: 'ambiguous', steps };
  if (!knownHint && !keyword) return { status: 'unknown-receiver', steps };
  if (keyword?.dynamic) return { status: 'unsupported', steps };

  let context: PathContext | undefined = knownHint
    ? { kind: 'datatype', name: hint }
    : { kind: 'keyword', name: root.name };
  let resultType: string | undefined;
  for (let position = 0; position < segments.length;) {
    const segment = segments[position];
    const unestablished = (status: ScriptPropertyTrace['status']): ScriptPropertyTrace => {
      steps.push({ segment: segment.raw, start: segment.start, end: segment.end, kind: 'property', confidence: 'unestablished' });
      return { status, steps };
    };
    if (!context) return unestablished('unknown-receiver');

    const candidates = pathPropertiesForContext(index, context).flatMap(property => {
      const path = pathForProperty(property);
      if (!path.length || !pathHeadMatches(path[0], segment)) return [];
      const compatible = path.every((token, offset) => {
        const actual = segments[position + offset];
        return !actual || isAuthoredPlaceholder(token) || normalizedPathSegment(token) === actual.name;
      });
      return compatible ? [{ property, path }] : [];
    });
    const exact = candidates.filter(({ path }) =>
      path.length <= segments.length - position && !path.some(isAuthoredPlaceholder));
    if (exact.length > 1) return unestablished('ambiguous');
    const match = exact[0];
    if (!match) return unestablished(candidates.length ? 'unsupported' : 'unknown-property');
    const { property, path } = match;
    const owner = context.kind === 'keyword' ? index.model.keywords.get(property.owner) : index.model.datatypes.get(property.owner);
    // The inheritance index gives one winner per property name. Multiple definitions
    // on that same owner are competing declarations, independent of inheritance.
    if (owner?.properties.filter(candidate => candidate.name.toLowerCase() === property.name.toLowerCase()).length > 1) {
      return unestablished('ambiguous');
    }
    const datatype = property.type.trim().toLowerCase();
    if (candidates.some(candidate => candidate !== match
      && candidate.path.length <= segments.length - position
      && candidate.path.some(isAuthoredPlaceholder)
      && (candidate.path.length !== path.length || candidate.property.type.trim().toLowerCase() !== datatype))) {
      return unestablished('unsupported');
    }

    resultType = datatype || undefined;
    for (let offset = 0; offset < path.length; offset++) {
      const part = segments[position + offset];
      steps.push({
        segment: part.raw, start: part.start, end: part.end,
        kind: 'property', confidence,
        owner: property.owner, property: property.name, inherited: property.inherited,
        ...(offset === path.length - 1 && resultType ? { datatype: resultType } : {}),
      });
    }
    context = resultType && index.model.datatypes.has(resultType) ? { kind: 'datatype', name: resultType } : undefined;
    position += path.length;
  }

  return resultType ? { status: 'resolved', steps, resultType } : { status: 'unknown-receiver', steps };
}

/**
 * Lint every `$var.prop…` / `keyword.prop…` chain in MD/AIScript XML text.
 * - untyped variable roots retain all datatype/path candidates and traverse them in order;
 * - non-dynamic keyword roots use that keyword's own authored paths;
 * - dynamic keyword roots skip the lookup selector and use its declared result datatype;
 * - lookup-only keywords can bind a complete literal selector prefix to its declared result;
 * - actual dynamic/list/variable selectors remain conservative and can satisfy a pending path.
 * Unresolved receiver types are advisory. Unknown properties remain warnings.
 */
export function lintScriptPropertyChains(xml: string, index: ScriptPropertyIndex, opts?: ScriptPropertyOptions): ScriptPropertyFinding[] {
  if (!index.loaded) return [];
  const hasIsClass = xml.includes('.isclass.');
  const needsCueRootCheck = /\b[A-Z]\w*\./.test(xml) && xml.includes('<cue');
  const scriptRoot = (hasIsClass || needsCueRootCheck) ? parseScriptDocumentRoot(xml) : null;
  const declaredCueNames = needsCueRootCheck ? collectDeclaredMdCueNames(scriptRoot) : undefined;
  const guardedReads = hasIsClass ? collectXmlIsClassGuardSpans(xml, scriptRoot, index) : [];
  const correctionSpans: { start: number; end: number }[] = [];
  const isClassAttrSpans: { start: number; end: number }[] = [];
  const accepts = opts?.correctionAttribute;
  const needAttrCallback = Boolean(accepts || hasIsClass);
  const masked = maskNonExpressionSpans(xml, needAttrCallback ? (attribute => {
    if (accepts && !attribute.value.includes('&') && accepts(attribute.element, attribute.name)) {
      correctionSpans.push({ start: attribute.start, end: attribute.end });
    }
    if (hasIsClass && attribute.value.includes('.isclass.')) {
      isClassAttrSpans.push({ start: attribute.start, end: attribute.end });
    }
  }) : undefined);
  for (const attr of isClassAttrSpans) {
    guardedReads.push(...collectConjunctionIsClassGuards(masked.slice(attr.start, attr.end), attr.start, index));
  }
  if (guardedReads.length > 1) guardedReads.sort((a, b) => a.start - b.start || a.end - b.end);
  return lintPropertyChains(xml, masked, index, opts, guardedReads, correctionSpans, declaredCueNames);
}

export function lintScriptPropertyExpression(expression: string, index: ScriptPropertyIndex, opts?: ScriptPropertyOptions): ScriptPropertyFinding[] {
  if (!index.loaded) return [];
  const masked = expression.replace(/'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"/g,
    literal => literal.replace(/[^\r\n]/g, ' '));
  const conjunctionGuards = collectConjunctionIsClassGuards(masked, 0, index);
  return lintPropertyChains(expression, masked, index, opts, conjunctionGuards);
}

function lintPropertyChains(source: string, masked: string, index: ScriptPropertyIndex, opts?: ScriptPropertyOptions,
  guardedReads: IsClassGuardSpan[] = [], correctionSpans: { start: number; end: number }[] = [],
  declaredCueNames?: ReadonlySet<string>,
): ScriptPropertyFinding[] {
  const out: ScriptPropertyFinding[] = [];
  let attributeIndex = 0;
  const locate = createSourcePositionLocator(source);
  const headCache = new Map<string, PropertyHeadLookup>();
  for (const parsed of parseExpressionChains(masked)) {
    while (attributeIndex < correctionSpans.length && correctionSpans[attributeIndex].end <= parsed.start) attributeIndex++;
    const correctionSpan = correctionSpans[attributeIndex];
    const rootRaw = parsed.root.raw;
    const rootLower = rootRaw.toLowerCase();
    const activeGuards = guardedReads.length
      ? guardedReads.filter(guard => parsed.start >= guard.start && parsed.end <= guard.end)
      : [];
    const isVar = rootRaw.startsWith('$');
    const isDeclaredLocalCue = !isVar && rootRaw !== rootLower && Boolean(declaredCueNames?.has(rootRaw));
    const keywordEntry = (!isVar && !isDeclaredLocalCue) ? index.model.keywords.get(rootLower) : undefined;
    let states: PathState[];
    let firstSegment = 0;
    let findingRoot: string | undefined;

    if (isVar || UNTYPED_ROOTS.has(rootLower)) {
      states = variablePathContexts(rootRaw, index, opts)
        .map(context => ({ kind: 'context' as const, context }));
    } else if (isDeclaredLocalCue) {
      if (!index.model.datatypes.has('cue')) continue;
      states = [{ kind: 'context', context: { kind: 'datatype', name: 'cue' } }];
      findingRoot = rootRaw;
    } else if (!keywordEntry) {
      continue; // unknown bare identifier roots are not property chains we understand
    } else if (keywordEntry.dynamic) {
      const datatype = String(keywordEntry.dynamicResultType || '').toLowerCase();
      if (!datatype || !index.model.datatypes.has(datatype)) continue;
      // The first segment is the imported lookup id (faction.argon / ware.energycells).
      firstSegment = 1;
      states = [{ kind: 'context', context: { kind: 'datatype', name: datatype } }];
      findingRoot = rootLower;
    } else if (!keywordEntry.heads.size) {
      const lookup = literalKeywordLookup(index, rootLower, parsed.segments);
      if (!lookup) continue;
      firstSegment = lookup.consumed;
      states = lookup.states;
      findingRoot = rootLower;
    } else {
      states = [{ kind: 'context', context: { kind: 'keyword', name: rootLower } }];
      findingRoot = rootLower;
    }

    let chain = rootRaw + parsed.segments.slice(0, firstSegment).map(segment => `.${segment.raw}`).join('');
    let stopQuietly = false;
    let narrowedGuard: { datatype: string; atSegmentIndex: number } | undefined;
    for (let segmentIndex = firstSegment; segmentIndex < parsed.segments.length; segmentIndex++) {
      const segment = parsed.segments[segmentIndex];
      chain += `.${segment.raw}`;
      const isDynamic = segment.kind !== 'property';
      const nextStates = advancePathStates(index, states, segment, chain, segment.start, headCache);

      if (isDynamic) {
        // A partial path can stay opaque when no candidate has a result.
        // When a complete candidate establishes a result, keep alternate paths
        // pending so they cannot hide a typo on that result.
        if (!nextStates.length) states = [{ kind: 'opaque' }];
        else if (nextStates.every(state => state.kind === 'pending')) {
          states = dedupePathStates(nextStates.map(state => ({ kind: 'opaque', property: state.property })));
        } else states = nextStates;
        continue;
      }

      if (!nextStates.length) {
        const pending = pendingPathState(states);
        const hasUsableDatatypeContext = states.some(state => state.kind === 'context'
          && pathPropertiesForContext(index, state.context).length > 0);
        const key = parsed.segments[segmentIndex + 1];
        const unresolved = !pending && key?.kind === 'dynamic-selector' ? keyedSubtypeReceivers(index, states, segment.name) : [];
        if (key && unresolved.length) {
          pushFinding(out, {
            code: 'scriptproperty.unresolved_type',
            severity: 'info',
            chain: `${chain}.${key.raw}`,
            segment: segment.raw,
            filePath: opts?.filePath,
            ...locate(segment.start),
            suggestions: [],
            detail: `Unresolved receiver type for "${segment.raw}". The corpus declares this property on a subtype of ${unresolved.join(', ')}. The expression does not establish that subtype.`,
          });
        } else if (pending?.placeholderLiteral) {
          pushFinding(out, buildFinding(locate(segment.start), chain, segment.raw, findingRoot, candidateHeads(index, states), opts));
        } else if (pending?.requiresSubselector && !hasUsableDatatypeContext) {
          pushFinding(out, buildSubselectorFinding(locate(pending.anchor.at), pending.anchor.chainAt, pending.anchor.head, index, opts));
        } else {
          const onlyState = states.length === 1 ? states[0] : undefined;
          const guardedRootVar = isVar && segmentIndex === 0
            ? activeGuards.find(guard => guard.receiverChainLower === rootLower)
            : undefined;
          const narrowedImmediate = narrowedGuard && segmentIndex === narrowedGuard.atSegmentIndex + 1
            ? narrowedGuard.datatype
            : undefined;
          const declared = findingRoot && onlyState?.kind === 'context' && onlyState.context.kind === 'datatype'
            ? onlyState.context.name : undefined;
          const rootHint = isVar ? knownVariableDatatype(rootRaw, index, opts) : undefined;
          const hint = rootHint === undefined
            ? undefined
            : segmentIndex === 0
              ? rootHint
              : (() => {
                const prefix = rootRaw + parsed.segments.slice(0, segmentIndex).map(part => `.${part.raw}`).join('');
                const traced = traceScriptPropertyExpression(prefix, index, { variableTypes: { [rootRaw]: rootHint } });
                return traced.status === 'resolved' && traced.resultType && index.model.datatypes.has(traced.resultType)
                  ? traced.resultType
                  : undefined;
              })();
          const typeContext: ScriptPropertyFinding['typeContext'] = narrowedImmediate
            ? { datatype: narrowedImmediate, confidence: 'guarded' }
            : guardedRootVar
              ? { datatype: guardedRootVar.targetDatatype, confidence: 'guarded' }
              : declared
                ? { datatype: declared, confidence: 'declared' }
                : hint ? { datatype: hint, confidence: 'hint' as const } : undefined;
          const candidates = guardedRootVar
            ? candidateHeads(index, [{ kind: 'context', context: { kind: 'datatype', name: guardedRootVar.targetDatatype } }])
            : candidateHeads(index, states);
          const finding = buildFinding(locate(segment.start), chain, segment.raw, findingRoot, candidates, opts, typeContext);
          if (correctionSpan && correctionSpan.start <= parsed.start && parsed.end <= correctionSpan.end
            && typeContext?.confidence === 'declared' && firstSegment === 0 && !narrowedGuard
            && segmentIndex === parsed.segments.length - 1
            && parsed.segments.every(part => part.kind === 'property' && !part.optional)
            && source.slice(parsed.start, parsed.end) === parsed.raw
            && source[parsed.end] !== '.') {
            const correction = directPropertyCorrection(index, typeContext.datatype, segment, candidates);
            if (correction) finding.correction = correction;
          }
          pushFinding(out, finding);
        }
        stopQuietly = true;
        break;
      }
      const matchingGuard = activeGuards.length
        ? activeGuards.find(guard => guard.receiverChainLower === chain.toLowerCase())
        : undefined;
      if (matchingGuard && nextStates.some(state =>
        state.kind === 'context'
        && state.context.kind === 'datatype'
        && sharesDatatypeRoot(index.model, state.context.name, matchingGuard.targetDatatype))) {
        narrowedGuard = { datatype: matchingGuard.targetDatatype, atSegmentIndex: segmentIndex };
        states = [{ kind: 'context', context: { kind: 'datatype', name: matchingGuard.targetDatatype } }];
      } else {
        states = nextStates;
      }
    }

    if (stopQuietly) continue;
    if (states.some(state => state.kind === 'context' || state.kind === 'complete' || state.kind === 'opaque')) continue;
    const pending = pendingPathState(states);
    if (pending) {
      if (pending.placeholderLiteral) {
        pushFinding(out, buildFinding(
          locate(pending.placeholderLiteral.at),
          pending.placeholderLiteral.chainAt,
          pending.placeholderLiteral.segment,
          findingRoot,
          candidateHeads(index, states),
          opts,
        ));
      } else {
        pushFinding(out, buildSubselectorFinding(locate(pending.anchor.at), pending.anchor.chainAt, pending.anchor.head, index, opts));
      }
    }
  }
  return out;
}

/** Offer one exact one-edit candidate only if it completes a real declared property. */
function directPropertyCorrection(
  index: ScriptPropertyIndex, datatype: string, segment: { name: string; raw: string; start: number; end: number },
  candidates: Set<string>,
): ScriptPropertyCorrection | undefined {
  if (segment.raw.length < 3 || segment.raw.length > 128) return undefined;
  const close = [...candidates].filter(name => editDistance(segment.name, name, 1) === 1);
  if (close.length !== 1 || !/^[A-Za-z_]\w*$/.test(close[0])) return undefined;
  const [replacement] = close;
  const declaration = pathPropertiesForContext(index, { kind: 'datatype', name: datatype })
    .find(property => property.path.length === 1 && property.path[0] === replacement);
  if (!declaration) return undefined;
  return { start: segment.start, end: segment.end, expectedText: segment.raw,
    replacement, datatype, declarationOwner: declaration.owner };
}

function buildSubselectorFinding(position: PropertyPosition, chain: string, head: string, index: ScriptPropertyIndex, opts?: ScriptPropertyOptions): ScriptPropertyFinding {
  const conts = [...(index.continuations.get(head) || [])]
    .sort((a, b) => (a === '*' ? 1 : b === '*' ? -1 : a.localeCompare(b)))
    .map(c => c === '*' ? `{$...}` : c);
  const suggestions = [...new Set(conts.map(c => `${head}.${c}`))].slice(0, 8);
  const location = `${chain}${opts?.filePath ? `, ${opts.filePath}` : ''}`;
  const detail = index.bareOk.has(head)
    ? `"${head}" (in ${location}) has a bare form on another datatype, but the matching path requires a sub-selector (${suggestions.join(', ')}). The supplied continuation is not valid for that path.`
    : `"${head}" (in ${location}) has no bare form in scriptproperties.xml — it always takes a sub-selector (${suggestions.join(', ')}). Bare use evaluates to nothing in-game with no error (the $station.controlentity failure class).`;
  return {
    code: 'scriptproperty.requires_subselector',
    severity: 'warning',
    chain,
    segment: head,
    filePath: opts?.filePath,
    ...position,
    suggestions,
    detail,
  };
}

function buildFinding(position: PropertyPosition, chain: string, segment: string, root: string | undefined,
  candidates: Iterable<string>, opts?: ScriptPropertyOptions, typeContext?: ScriptPropertyFinding['typeContext']): ScriptPropertyFinding {
  const clean = segment.replace(/\?$/, '');
  const suggestions = suggestProperties(clean, candidates);
  const context = typeContext ? propertyTypeLabel(typeContext) : root ? ` of keyword "${root}"` : '';
  return {
    code: 'scriptproperty.unknown',
    severity: 'warning',
    chain,
    segment: clean,
    root,
    filePath: opts?.filePath,
    ...position,
    ...(typeContext ? { typeContext } : {}),
    suggestions,
    detail: `"${clean}" (in ${chain}${opts?.filePath ? `, ${opts.filePath}` : ''}) is not a known script property${context} in the game's scriptproperties.xml — X4 raises no error for unknown properties, the expression just evaluates false/null and the branch silently skips.${suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : ''}`,
  };
}

function propertyTypeLabel(context: NonNullable<ScriptPropertyFinding['typeContext']>): string {
  if (context.confidence === 'guarded') return ` on datatype "${context.datatype}" established by the enclosing guard`;
  if (context.confidence === 'declared') return ` on declared datatype "${context.datatype}"`;
  return ` (variable datatype hint "${context.datatype}")`;
}

export function formatScriptPropertyFinding(finding: ScriptPropertyFinding): string {
  if (finding.code === 'scriptproperty.unresolved_type') return finding.detail;
  const context = finding.typeContext ? propertyTypeLabel(finding.typeContext) : '';
  return `Property chain "${finding.chain}": segment "${finding.segment}"${context} — ${finding.suggestions.length
    ? `did you mean ${finding.suggestions.slice(0, 3).join(', ')}?` : 'unknown in scriptproperties.xml.'}`;
}

/* ------------------------------------------------------------------ *
 * Oracle — fixtures mirror the PROBED real shapes (unpacked 9.00 data).
 * ------------------------------------------------------------------ */

export const SCRIPT_PROPERTIES_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<scriptproperties xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="scriptproperties.xsd">
  <keyword name="event" description="Event data access">
    <property name="name" result="Name of event condition that was met" type="string" />
    <property name="object" result="object according to event documentation" />
    <property name="param" result="param according to event documentation" />
    <property name="param2" result="param2 according to event documentation" />
    <property name="param3" result="param3 according to event documentation" />
  </keyword>
  <keyword name="player" description="Access to player-specific data">
    <property name="name" result="Player name" type="string" />
    <property name="entity" result="Player entity" />
    <property name="target" result="Current player target" type="object" />
  </keyword>
  <keyword name="faction" description="Faction lookup">
    <import source="common.xsd" select="/xs:schema/xs:simpleType[@name='factionlookup']//xs:enumeration">
      <property name="@value" result="xs:annotation/xs:documentation/text()" type="faction" ignoreprefix="true" />
    </import>
  </keyword>
  <datatype name="component">
    <property name="exists" result="true iff the component exists in the game graph" type="boolean" />
    <property name="isclass.{$class}" result="true iff the component exists and is of the given class" type="boolean" />
    <property name="containercargo" result="Container cargo fixture" type="containercargolist" />
    <property name="opaquereturn" result="Result type unavailable" />
    <property name="deferredselector.{$value}.name" result="Selector continuation unavailable" type="string" />
    <property name="terminalselector.{$value}" result="Known terminal selector" type="terminal" />
    <property name="name" result="component name" type="string" />
    <property name="knownname" result="component name as known to the player" type="string" />
    <property name="tradeblockedreason" result="reason string" type="string" />
  </datatype>
  <datatype name="destructible" type="component">
    <property name="hullpercentage" result="hull" type="integer" />
  </datatype>
  <datatype name="controllable" type="object">
    <property name="controlentity.default" result="Main control entity" type="entity" />
    <property name="controlentity.{$controlpost}" result="Control entity of specified control post" type="entity" />
    <property name="buildstorage.default" result="Build storage (literal-only continuation)" />
  </datatype>
  <datatype name="object" type="destructible">
    <property name="isplayerowned" result="true iff owned by the player" type="boolean" />
    <property name="boardingoperation" result="Current boarding operation" type="operation" />
  </datatype>
  <datatype name="operation">
    <property name="exists" result="Whether the operation exists" type="boolean" />
  </datatype>
  <datatype name="boardingoperation" type="operation">
    <property name="attackers" result="Attackers of a boarding operation" type="list" />
  </datatype>
  <datatype name="npc" type="component">
    <property name="npctemplate" result="Template for this NPC" type="string" />
  </datatype>
  <datatype name="ship" type="controllable">
    <property name="cargo" result="cargo access" type="containercargolist" />
    <property name="people.{$npctemplate}" result="NPC entry" type="npctemplateentry" />
    <property name="people.{$entityrole}.list" result="NPC roles" type="list" />
    <property name="people.{$entityrole}.{$level}.list" result="NPC roles by level" type="list" />
  </datatype>
  <datatype name="npctemplateentry">
    <property name="seed" result="NPC seed" type="integer" />
  </datatype>
  <datatype name="container" type="component">
    <property name="cargo" result="cargo access" type="containercargolist" />
  </datatype>
  <datatype name="storagemodule" type="component">
    <property name="cargo" result="cargo access" type="modulecargolist" />
  </datatype>
  <datatype name="wareamountlist" type="list">
    <property name="random" result="Random ware" type="string" />
  </datatype>
  <datatype name="cargolist" type="wareamountlist">
    <property name="{$ware}.free" result="Amount of ware that can be added to the cargo" type="integer" />
  </datatype>
  <datatype name="containercargolist" type="cargolist">
    <property name="free.all" result="Total free cargo volume remaining" type="largeint" />
    <property name="free.condensate" result="Free condensate cargo volume" type="largeint" />
    <property name="free.container" result="Free container cargo volume" type="largeint" />
    <property name="free.liquid" result="Free liquid cargo volume" type="largeint" />
    <property name="free.solid" result="Free solid cargo volume" type="largeint" />
    <property name="free.universal" result="Free universal cargo volume" type="largeint" />
    <property name="free.{$tag}" result="Free cargo volume for the specified tag" type="largeint" />
  </datatype>
  <datatype name="modulecargolist" type="cargolist">
    <property name="free" result="Total free cargo volume remaining" type="integer" />
  </datatype>
  <datatype name="terminal" />
  <datatype name="faction">
    <property name="id" result="Faction ID" type="string" />
    <property name="name" result="Faction name" type="string" />
    <property name="knownname" result="Known faction name" type="string" />
    <property name="relationto.{$faction}" result="Relation to another faction" type="relation" />
  </datatype>
  <datatype name="list">
    <property name="count" result="Number of elements in the list" type="integer" />
    <property name="{$numeric}" result="The numeric-th element in the list (1-based)" />
  </datatype>
</scriptproperties>`;

export function runScriptPropertiesSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  // --- parsing the real shape ---
  const idx = buildScriptPropertyIndex(SCRIPT_PROPERTIES_FIXTURE);
  // The game's md keyword declares two lookup selectors yielding a cue, rather
  // than literal property heads. A nested cue name is not a property of its parent.
  const cueLookupProperties = [
    '<scriptproperties>',
    '<keyword name="md"><property name="&lt;mdscriptname&gt;.&lt;cuename&gt;" type="cue"/><property name="$&lt;variable&gt;"/></keyword>',
    '<datatype name="cue">',
    ...['parent', 'static', 'staticbase', 'namespace', 'library'].map(name => `<property name="${name}" type="cue"/>`),
    '<property name="exists" type="boolean"/><property name="$&lt;variable&gt;"/>',
    '</datatype><datatype name="boolean"/>',
    '<datatype name="object"><property name="Child" type="cue"/></datatype>',
    '</scriptproperties>',
  ].join('');
  const cueLookupIndex = buildScriptPropertyIndex(cueLookupProperties);
  const cueSource = (role: string, ref: string) => `<mdscript name="Probe"><cues><cue name="Caller"><actions>\n<${role} cue="${ref}"/>\n</actions></cue></cues></mdscript>`;
  for (const role of ['signal_cue', 'signal_cue_instantly', 'cancel_cue', 'reset_cue']) {
    const source = cueSource(role, 'md.Probe.Parent.Child');
    const findings = lintScriptPropertyChains(source, cueLookupIndex, { filePath: 'md/probe.xml' });
    ok(`md_lookup_${role}_rejects_child_property_on_declared_cue`, findings.length === 1
      && findings[0].code === 'scriptproperty.unknown' && findings[0].severity === 'warning'
      && findings[0].segment === 'Child' && findings[0].root === 'md'
      && findings[0].typeContext?.datatype === 'cue' && findings[0].typeContext.confidence === 'declared'
      && findings[0].line === 2 && findings[0].column === source.split('\n')[1].indexOf('Child') + 1,
    findings);
  }
  for (const ref of [
    'md.Probe.Child', 'md.Probe.Parent.parent', 'md.Probe.Parent.static', 'md.Probe.Parent.staticbase',
    'md.Probe.Parent.namespace', 'md.Probe.Parent.library', 'md.Probe.Parent.parent.parent',
    'md.Probe.Parent.$target', 'md.Probe.Parent.$targets.{$i}', 'md.Probe.Parent.{$selector}',
    'md.UnknownProvider.Cue.parent', 'md.Probe', 'md.Probe.$selector', 'md.$global.Child',
  ]) {
    ok(`md_lookup_preserves_${ref}`, lintScriptPropertyChains(cueSource('signal_cue', ref), cueLookupIndex).length === 0);
  }
  const replacement = '<diff>\n<replace sel="/mdscript/cues/cue/actions/signal_cue/@cue">md.Probe.Parent.Child</replace>\n</diff>';
  const replacementFindings = lintScriptPropertyChains(replacement, cueLookupIndex);
  ok('md_lookup_attribute_replacement_body_keeps_authored_position', replacementFindings.length === 1
    && replacementFindings[0].segment === 'Child' && replacementFindings[0].line === 2
    && replacementFindings[0].column === replacement.split('\n')[1].indexOf('Child') + 1, replacementFindings);
  ok('md_lookup_does_not_turn_untyped_variable_candidates_into_wildcards',
    lintScriptPropertyExpression('$receiver.GenuinelyUnknown', cueLookupIndex).some(f => f.code === 'scriptproperty.unknown'));
  ok('md_lookup_unknown_bare_root_remains_conservative',
    lintScriptPropertyExpression('Unknown.Probe.Parent.Child', cueLookupIndex).length === 0);
  ok('md_lookup_comments_prose_and_string_literals_remain_masked',
    lintScriptPropertyChains('<!-- md.Probe.Parent.Child --><debug_text text="\'md.Probe.Parent.Child\'" description="md.Probe.Parent.Child"/>', cueLookupIndex).length === 0);
  const unknownResultIndex = buildScriptPropertyIndex(cueLookupProperties.replace('type="cue"', 'type="UnavailableType"'));
  ok('md_lookup_missing_result_datatype_is_not_guessed',
    lintScriptPropertyExpression('md.Probe.Parent.Child', unknownResultIndex).length === 0);
  const alternateIndex = (property: string) => buildScriptPropertyIndex(cueLookupProperties.replace('</keyword>', `${property}</keyword>`));
  ok('md_lookup_ambiguous_selector_counts_remain_conservative', lintScriptPropertyExpression('md.Probe.Parent.Child',
    alternateIndex('<property name="&lt;lookup&gt;" type="object"/>')).length === 0);
  ok('md_lookup_retains_all_declared_result_candidates', lintScriptPropertyExpression('md.Probe.Parent.Child',
    alternateIndex('<property name="&lt;script&gt;.&lt;cue&gt;" type="object"/>')).length === 0);
  ok('md_lookup_unavailable_result_alternative_cannot_be_discarded', lintScriptPropertyExpression('md.Probe.Parent.Child',
    alternateIndex('<property name="&lt;script&gt;.&lt;cue&gt;"/>')).length === 0);
  ok('md_lookup_keeps_explicit_literal_keyword_path_authority', lintScriptPropertyExpression('md.Known.Child',
    alternateIndex('<property name="Known" type="object"/>')).length === 0);
  const objectLookupIndex = buildScriptPropertyIndex(cueLookupProperties.replace('type="cue"', 'type="object"'));
  ok('literal_lookup_uses_its_declared_result_instead_of_assuming_cue',
    lintScriptPropertyExpression('md.Probe.Parent.Child', objectLookupIndex).length === 0
      && lintScriptPropertyExpression('md.Probe.Parent.parent', objectLookupIndex).some(f => f.code === 'scriptproperty.unknown'));
  const mixedLookupIndex = alternateIndex('<property name="&lt;script&gt;.&lt;cue&gt;.special" type="object"/>');
  ok('literal_lookup_preserves_matching_mixed_prefix_and_ignores_only_incompatible_paths',
    lintScriptPropertyExpression('md.Probe.Parent.special.Child', mixedLookupIndex).length === 0
      && lintScriptPropertyExpression('md.Probe.Parent.Child', mixedLookupIndex).some(f => f.code === 'scriptproperty.unknown'));
  ok('literal_lookup_incomplete_competing_template_is_not_discarded',
    lintScriptPropertyExpression('md.Probe.Parent.Child', alternateIndex(
      '<property name="&lt;a&gt;.&lt;b&gt;.&lt;c&gt;.&lt;d&gt;" type="object"/>')).length === 0);
  const readtextLookupIndex = buildScriptPropertyIndex('<scriptproperties><keyword name="readtext">'
    + '<property name="{$textpage}.{$textid}" type="string"/>'
    + '<property name="{$textpage}.{$textid}.test.{$fallbackstring}" type="string"/>'
    + '</keyword><datatype name="string"><property name="length" type="integer"/></datatype><datatype name="integer"/></scriptproperties>');
  ok('readtext_keyword_test_continuation_is_not_mistaken_for_string_property',
    lintScriptPropertyExpression('readtext.Page.Id.test.Fallback', readtextLookupIndex).length === 0);
  ok('index loads', idx.loaded);
  ok('parses keywords + datatypes', idx.model.keywords.size === 3 && idx.model.datatypes.size === 18,
    `kw=${idx.model.keywords.size} dt=${idx.model.datatypes.size}`);
  ok('placeholder property indexed by literal head (isclass.{$class} → isclass)',
    idx.model.datatypes.get('component')!.heads.has('isclass'));
  ok('pure-placeholder property marks wildcard ({$numeric} on list)',
    idx.model.datatypes.get('list')!.wildcard);
  ok('import-bearing keyword marked dynamic (faction)',
    idx.model.keywords.get('faction')!.dynamic);
  ok('dynamic import retains result datatype', idx.model.keywords.get('faction')!.dynamicResultType === 'faction');
  ok('datatype inheritance resolves (ship inherits component.exists)',
    resolveDatatypeHeads(idx.model, 'ship').has('exists')
    && resolveDatatypeHeads(idx.model, 'ship').has('hullpercentage')
    && resolveDatatypeHeads(idx.model, 'ship').has('cargo'));
  ok('full inherited property records retain owner', resolveDatatypeProperties(idx.model, 'ship').some(p => p.name === 'exists' && p.owner === 'component' && p.inherited));
  ok('nested authored paths retain order and datatype transitions',
    resolveDatatypeProperties(idx.model, 'container').some(p => p.name === 'cargo'
      && p.path?.join('.') === 'cargo' && p.type === 'containercargolist')
    && resolveDatatypeProperties(idx.model, 'storagemodule').some(p => p.name === 'cargo'
      && p.path?.join('.') === 'cargo' && p.type === 'modulecargolist'));
  const containerCargoPaths = resolveDatatypeProperties(idx.model, 'containercargolist');
  ok('cargolist inheritance and free paths are indexed',
    containerCargoPaths.some(p => p.name === '{$ware}.free' && p.inherited)
    && ['free.all', 'free.solid', 'free.container', 'free.liquid', 'free.universal', 'free.condensate', 'free.{$tag}']
      .every(name => containerCargoPaths.some(p => p.name === name && p.path?.join('.') === name)));
  ok('union contains heads from every level', ['exists', 'isplayerowned', 'cargo', 'param2', 'count'].every(h => idx.union.has(h)),
    [...idx.union].join(','));
  const untypedKeywordOnly = lintScriptPropertyChains('<do_if value="$obj.param2"/>', idx);
  ok('untyped variables exclude keyword-only paths ($obj.param2)',
    untypedKeywordOnly.length === 1
    && untypedKeywordOnly[0].code === 'scriptproperty.unknown'
    && untypedKeywordOnly[0].segment === 'param2', JSON.stringify(untypedKeywordOnly));

  // --- the ROADMAP ground-truth cases ---
  const bad = lintScriptPropertyChains('<set_value name="$m" exact="$station.controlentity"/><set_value name="$m2" exact="$station.manager"/>', idx);
  ok('flags $station.controlentity (the real AAR bug)', bad.some(f => f.segment === 'controlentity'), bad.map(f => f.segment).join(','));
  ok('flags $station.manager (the real AAR bug)', bad.some(f => f.segment === 'manager'));
  ok('findings are warnings with the chain + line', bad.every(f => f.severity === 'warning' && f.line === 1 && f.chain.startsWith('$station')));

  const good = lintScriptPropertyChains('<do_if value="$ship.isplayerowned and $ship.cargo.count gt 0"/>', idx);
  ok('valid chains pass ($ship.isplayerowned, $ship.cargo.count)', good.length === 0, good.map(f => f.segment).join(','));

  // --- continuation-required heads (the REAL $station.controlentity failure shape:
  // the property exists, but ONLY as controlentity.default / controlentity.{$controlpost}) ---
  const bare = lintScriptPropertyChains('<set_value name="$m" exact="$station.controlentity"/>', idx);
  ok('flags BARE $station.controlentity (requires_subselector — the exact AAR case)',
    bare.some(f => f.code === 'scriptproperty.requires_subselector' && f.segment === 'controlentity'), JSON.stringify(bare));
  ok('bare-use finding suggests the real forms (controlentity.default)',
    bare[0]?.suggestions.includes('controlentity.default')
    && bare[0]?.detail.includes('has no bare form in scriptproperties.xml'), JSON.stringify(bare[0]));
  ok('$station.controlentity.default passes',
    lintScriptPropertyChains('<set_value name="$m" exact="$station.controlentity.default"/>', idx).length === 0,
    JSON.stringify(lintScriptPropertyChains('<set_value name="$m" exact="$station.controlentity.default"/>', idx)));
  ok('$station.controlentity.{controlpost.commander} passes (placeholder continuation)',
    lintScriptPropertyChains('<set_value name="$m" exact="$station.controlentity.{controlpost.commander}"/>', idx).length === 0);
  const controlName = lintScriptPropertyChains('<set_value name="$m" exact="$station.controlentity.name"/>', idx);
  ok('$station.controlentity.name is conservative when the placeholder domain is unavailable',
    controlName.length === 0, JSON.stringify(controlName));
  ok('mid-chain bare use flagged on literal-only head ($station.buildstorage.name)',
    lintScriptPropertyChains('<set_value name="$m" exact="$station.buildstorage.name"/>', idx)
      .some(f => f.code === 'scriptproperty.requires_subselector' && f.segment === 'buildstorage'));
  ok('$station.buildstorage.default passes',
    lintScriptPropertyChains('<set_value name="$m" exact="$station.buildstorage.default"/>', idx).length === 0);
  ok('list-selector continuation satisfies a pending head (distanceto-style .[a, b])',
    lintScriptPropertyChains('<do_if value="$ship.buildstorage.[$targetsector, $position] gt 0"/>', idx).length === 0,
    JSON.stringify(lintScriptPropertyChains('<do_if value="$ship.buildstorage.[$targetsector, $position] gt 0"/>', idx)));

  // --- nested cargo paths and location-sensitive refusals ---
  const cargo = (expression: string) => lintScriptPropertyChains(`<do_if value="${expression}"/>`, idx);
  for (const expression of [
    '$pship2.cargo.free',
    '$pship2.cargo.free.all?',
    '$pship2.cargo.free.all',
    '$nsh.cargo.free.all',
    '$pship2.cargo.free.solid',
    '$pship2.cargo.free.{event.param.transporttag}',
  ]) {
    ok(`${expression} passes`, cargo(expression).length === 0, JSON.stringify(cargo(expression)));
  }
  const freeNotReal = cargo('$pship2.cargo.free.notreal');
  ok('$pship2.cargo.free.notreal is conservative when the placeholder domain is unavailable',
    freeNotReal.length === 0, JSON.stringify(freeNotReal));
  const bareContainerFree = cargo('$holder.containercargo.free');
  ok('bare free still requires a continuation on a known containercargolist path',
    bareContainerFree.length === 1
    && bareContainerFree[0].code === 'scriptproperty.requires_subselector'
    && bareContainerFree[0].segment === 'free', JSON.stringify(bareContainerFree));
  ok('free continuation suggestions retain every literal cargo selector',
    bareContainerFree[0]?.suggestions.length <= 8
    && ['all', 'solid', 'container', 'liquid', 'universal', 'condensate']
      .every(name => bareContainerFree[0]?.suggestions.includes(`free.${name}`)), JSON.stringify(bareContainerFree[0]?.suggestions));
  ok('free refusal detail is path-specific despite a globally bare form',
    bareContainerFree[0]?.detail.includes('matching path requires a sub-selector')
    && !bareContainerFree[0]?.detail.includes('has no bare form in scriptproperties.xml'), JSON.stringify(bareContainerFree[0]?.detail));
  const cargoNotReal = cargo('$pship2.cargo.notreal');
  ok('$pship2.cargo.notreal is unknown at notreal',
    cargoNotReal.length === 1
    && cargoNotReal[0].code === 'scriptproperty.unknown'
    && cargoNotReal[0].segment === 'notreal', JSON.stringify(cargoNotReal));
  const cargoHull = cargo('$pship2.cargo.hullpercentage');
  ok('$pship2.cargo.hullpercentage is location-sensitive unknown',
    cargoHull.length === 1
    && cargoHull[0].code === 'scriptproperty.unknown'
    && cargoHull[0].segment === 'hullpercentage', JSON.stringify(cargoHull));

  for (const expression of [
    '$fc.isclass.ship_xl',
    '$fc.isclass.ship_s',
    '$fc.isclass.sector',
    '$sb.isclass.ship_s',
  ]) {
    ok(`${expression} accepts an unbraced placeholder continuation`,
      cargo(expression).length === 0, JSON.stringify(cargo(expression)));
  }
  ok('$destination.{1}.isclass.sector becomes opaque after an ungrounded selector',
    cargo('$destination.{1}.isclass.sector').length === 0,
    JSON.stringify(cargo('$destination.{1}.isclass.sector')));
  ok('a selector that only partly consumes an authored path becomes opaque',
    cargo('$ship.deferredselector.{nested.value}').length === 0,
    JSON.stringify(cargo('$ship.deferredselector.{nested.value}')));
  const nestedTypo = cargo('$ship.cargo.free.{faction.{$id}.knownnmae}');
  ok('nested dynamic keyword typos keep their own chain and position',
    nestedTypo.length === 1 && nestedTypo[0].chain === 'faction.{$id}.knownnmae'
      && nestedTypo[0].column === '<do_if value="$ship.cargo.free.{faction.{$id}.'.length + 1
      && nestedTypo[0].suggestions.includes('knownname'), nestedTypo);
  const entryTypo = cargo('$ship.cargo.free.{1 + $ship.people.{$template}.seeed}');
  ok('a keyed result typo survives incomplete alternate lookup paths',
    cargo('$ship.cargo.free.{1 + $ship.people.{$template}.seed}').length === 0
      && entryTypo.length === 1 && entryTypo[0].code === 'scriptproperty.unknown'
      && entryTypo[0].chain === '$ship.people.{$template}.seeed'
      && entryTypo[0].column === '<do_if value="$ship.cargo.free.{1 + $ship.people.{$template}.'.length + 1, entryTypo);
  const unresolved = cargo('player.target.controlentity.{$post}');
  ok('a known keyed subtype property gives a positioned informational advisory',
    unresolved.length === 1 && unresolved[0].code === 'scriptproperty.unresolved_type'
      && unresolved[0].severity === 'info' && unresolved[0].segment === 'controlentity'
      && unresolved[0].column === '<do_if value="player.target.'.length + 1
      && formatScriptPropertyFinding(unresolved[0]).includes('Unresolved receiver type'), unresolved);
  ok('a typo on the same receiver still warns',
    cargo('player.target.controlentiity.{$post}')[0]?.code === 'scriptproperty.unknown');
  const indexedSubtype = cargo('player.target.boardingoperation.attackers.{1}.owner');
  ok('an index on a subtype property result reports unresolved receiver',
    indexedSubtype.length === 1 && indexedSubtype[0].code === 'scriptproperty.unresolved_type'
      && indexedSubtype[0].segment === 'attackers'
      && cargo('player.target.boardingoperation.attaackers.{1}.owner')[0]?.code === 'scriptproperty.unknown', indexedSubtype);
  ok('a wrong variable type hint does not hide a valid list.count path',
    lintScriptPropertyChains('<do_if value="$Foes.count"/>', idx, { variableTypes: { '$Foes': 'ship' } }).length === 0,
    JSON.stringify(lintScriptPropertyChains('<do_if value="$Foes.count"/>', idx, { variableTypes: { '$Foes': 'ship' } })));
  ok('an unavailable declared result leaves later segments unchecked',
    cargo('$ship.opaquereturn.notreal').length === 0,
    JSON.stringify(cargo('$ship.opaquereturn.notreal')));
  const knownTerminal = cargo('$ship.terminalselector.{fixture.value}.notreal');
  ok('a known terminal datatype still rejects an impossible continuation',
    knownTerminal.length === 1
    && knownTerminal[0].code === 'scriptproperty.unknown'
    && knownTerminal[0].segment === 'notreal', JSON.stringify(knownTerminal));

  // --- typed keyword root ---
  const evBad = lintScriptPropertyChains('<set_value name="$d" exact="event.param4"/>', idx);
  ok('typed keyword check flags event.param4', evBad.some(f => f.segment === 'param4' && f.root === 'event'), JSON.stringify(evBad));
  ok('event.param4 suggests param/param2/param3', evBad[0]?.suggestions.some(s => s.startsWith('param')), JSON.stringify(evBad[0]?.suggestions));
  const evGood = lintScriptPropertyChains('<set_value name="$d" exact="event.param3.$key"/>', idx);
  ok('valid event.param3 passes (dynamic tail skipped)', evGood.length === 0, JSON.stringify(evGood));
  const eventObject = lintScriptPropertyChains('<do_if value="event.object.owner.knownname"/>', idx);
  ok('event.object unavailable return leaves owner.knownname unchecked',
    eventObject.length === 0, JSON.stringify(eventObject));

  // --- dynamic typed roots + false-positive guards ---
  ok('dynamic keyword valid property passes (faction.argon.name)',
    lintScriptPropertyChains('<do_if value="faction.argon.name"/>', idx).length === 0);
  const factionBad = lintScriptPropertyChains('<do_if value="faction.argon.knownnmae"/>', idx);
  ok('dynamic keyword result datatype catches unknown property', factionBad.some(f => f.segment === 'knownnmae' && f.root === 'faction'), JSON.stringify(factionBad));
  ok('dynamic keyword typo has did-you-mean', factionBad.some(f => f.suggestions.includes('knownname')), JSON.stringify(factionBad));
  const typo = 'faction.argon.knownnmae';
  const repeated = `  <do_if value="&quot;&quot; + ${typo} and ${typo}"/>`;
  const positioned = lintScriptPropertyChains(`<mdscript>\r\n${repeated}\r</mdscript>`, idx);
  const columns = [...repeated.matchAll(/knownnmae/g)].map(match => match.index + 1);
  ok('identical property warnings retain their original XML columns',
    positioned.length === 2 && positioned.every((finding, i) => finding.line === 2 && finding.column === columns[i]
      && finding.typeContext?.datatype === 'faction' && finding.typeContext.confidence === 'declared'), JSON.stringify(positioned));
  const bareExpression = `'${typo}' +\r\n${typo}\r$receiver.carggo`;
  const bareFindings = lintScriptPropertyExpression(bareExpression, idx, { variableTypes: { '$receiver': 'ship' } });
  ok('unsaved property positions exclude quoted text and preserve mixed newlines',
    bareFindings.length === 2 && bareFindings[0].line === 2 && bareFindings[0].column === typo.indexOf('knownnmae') + 1
    && bareFindings[1].line === 3 && bareFindings[1].column === '$receiver.'.length + 1
    && bareFindings[1].typeContext?.datatype === 'ship' && bareFindings[1].typeContext.confidence === 'hint',
    JSON.stringify(bareFindings));
  const quoteCases: [string, string, number[]][] = [
    ['single-quoted XML attribute', "<debug_text text='" + typo + "'/>", [0]],
    ['encoded MD literal', '<debug_text text="&apos;' + typo + '&apos;"/>', []],
    ['numeric MD literal in a single-quoted attribute',
      "<debug_text text='&#039;" + typo + "&#x027;'/>", []],
    ['a backslash-escaped entity stays in the string',
      "<debug_text text='&apos;I&#92;&#39;m " + typo + "&apos; + " + typo + "'/>", [1]],
    ['a formatted literal keeps its real argument',
      "<debug_text text='&apos;%s&apos;.[" + typo + "]'/>", [0]],
    ['single-quoted prose and opaque markup',
      "<!-- " + typo + " --><?example " + typo + "?><debug_text text='true' comment='" + typo + "'/>", []],
    ['two differently quoted attributes retain separate positions',
      '<debug_text text="' + typo + '"/><debug_text text=\'' + typo + '\'/>', [0, 1]],
  ];
  for (const [label, fragment, occurrences] of quoteCases) {
    const positions = [...fragment.matchAll(/knownnmae/g)].map(match => match.index + 1);
    const actual = lintScriptPropertyChains('<mdscript>\r\n' + fragment + '\r</mdscript>', idx);
    ok(label, actual.length === occurrences.length && actual.every((finding, i) =>
      finding.line === 2 && finding.column === positions[occurrences[i]]
      && finding.suggestions.includes('knownname')), actual);
  }
  ok('single-quoted string literals masked',
    lintScriptPropertyChains(`<raise_lua_event name="'ai_influence.chat.fetchmode'"/>`, idx).length === 0);
  ok('comment attributes masked',
    lintScriptPropertyChains('<param name="x" comment="checks this.nonexistent.thing here"/>', idx).length === 0);
  ok('XML comments masked',
    lintScriptPropertyChains('<!-- $obj.bogusprop --> <cue name="A"/>', idx).length === 0);
  ok('placeholder segments skipped ($fac.{$other}.exists checks only literal segs)',
    lintScriptPropertyChains('<do_if value="$fac.{$other}.exists"/>', idx).length === 0);
  ok('nullable suffix handled ($ship.exists? passes)',
    lintScriptPropertyChains('<do_if value="$ship.exists?"/>', idx).length === 0);
  ok('unknown bare roots skipped (md.Script.Cue refs not property chains)',
    lintScriptPropertyChains('<signal_cue cue="md.SomeScript.SomeCue"/>', idx).length === 0);

  // --- suggestions quality ---
  const sug = suggestProperties('knowname', idx.union);
  ok('suggestion finds near-miss (knowname → knownname)', sug.includes('knownname'), sug.join(','));

  // --- degradation ---
  ok('garbage input degrades to empty model', !buildScriptPropertyIndex('<not-scriptproperties/>').loaded);
  ok('empty input degrades', !buildScriptPropertyIndex('').loaded && lintScriptPropertyChains('x', buildScriptPropertyIndex('')).length === 0);

  const npcTypo = '<debug_text text="player.target.npctemplat"/>';
  const npcValid = '<debug_text text="player.target.npctemplate"/>';
  const npcGuard = (actions: string, attrs = '') => `<do_if value="player.target.isclass.npc"${attrs}>${actions}</do_if>`;
  const mdActions = (actions: string, namespace = '') => `<mdscript${namespace}><cues><cue><actions>${actions}</actions></cue></cues></mdscript>`;
  const scopedLine = '<set_value name="$snapshot" exact="player.target.npctemplate"/>' + npcTypo;
  const scoped = lintScriptPropertyChains('\uFEFF' + mdActions(npcGuard(`\r\n${npcValid}\r` + scopedLine
    + '<set_value name="player.target.$mark" exact="true"/>' + npcTypo) + npcTypo), idx);
  ok('positive NPC guard narrows only contiguous reads with raw positions', scoped.length === 3
    && scoped[0].line === 3 && scoped[0].column === scopedLine.indexOf('npctemplat"') + 1
    && scoped[0].suggestions[0] === 'npctemplate'
    && scoped[0].typeContext?.datatype === 'npc' && scoped[0].typeContext?.confidence === 'guarded'
    && scoped.slice(1).every(finding => finding.typeContext?.datatype === 'object'), scoped);
  const singleQuotedGuard = mdActions(npcGuard(npcValid + npcTypo).replaceAll('"', "'"));
  const singleGuardFindings = lintScriptPropertyChains(singleQuotedGuard, idx);
  ok('single-quoted guard retains NPC provenance and the raw typo position',
    singleGuardFindings.length === 1 && singleGuardFindings[0].typeContext?.confidence === 'guarded'
    && singleGuardFindings[0].typeContext?.datatype === 'npc'
    && singleGuardFindings[0].column === singleQuotedGuard.lastIndexOf('npctemplat') + 1,
    singleGuardFindings);
  const unguarded = [
    ...[' exact="false"', ' negate="true"', ' min="0"', ' max="0"', ' list="[false]"']
      .map(attrs => mdActions(npcGuard(npcValid, attrs))),
    mdActions(npcGuard('<run_actions ref="Work"/>' + npcValid)),
    mdActions(npcGuard('<wait exact="1s"/>' + npcValid)),
    mdActions(npcGuard(`<do_all>${npcValid}</do_all>${npcValid}`)),
    mdActions(npcGuard(npcValid), ' xmlns="urn:other"'),
    mdActions(npcGuard(npcValid.replace('<debug_text', '<debug_text xmlns="urn:other"'))),
    mdActions(npcGuard(npcValid)).replace('mdscript', 'diff').replace('</mdscript>', '</diff>'),
    mdActions(npcGuard(npcValid)).replace('</actions>', ''),
    mdActions(npcGuard('').concat(`<do_else>${npcValid}</do_else>`)),
  ];
  ok('NPC guard rejects comparison, mutation, scope and malformed counterexamples', unguarded.every(xml => {
    const findings = lintScriptPropertyChains(xml, idx).filter(finding => finding.segment === 'npctemplate');
    return findings.length > 0 && findings.every(finding => finding.typeContext?.datatype === 'object');
  }));
  ok('standalone expressions retain the declared player target type',
    lintScriptPropertyExpression('player.target.npctemplate', idx)[0]?.typeContext?.datatype === 'object');
  const normalizedLines = lintScriptPropertyChains(mdActions(`<!-- earlier\u2028comment -->${npcGuard(`\n${npcTypo}`)}\n${npcTypo}`), idx);
  ok('XML-only line separators cannot move narrowing onto an aligned unguarded read', normalizedLines.length === 2
    && normalizedLines[0].typeContext?.confidence === 'guarded'
    && normalizedLines[1].typeContext?.datatype === 'object', normalizedLines);

  const fallback = buildScriptPropertyIndex('<scriptproperties><datatype name="receiver"><property name="first" type="number"/></datatype><datatype name="number"/></scriptproperties>');
  fallback.pathProperties = undefined;
  const fallbackOpts = { variableTypes: { $known: 'receiver' } };
  const beforeChange = lintScriptPropertyChains('<do_if value="$known.first"/>', fallback, fallbackOpts);
  const receiver = fallback.model.datatypes.get('receiver')!;
  receiver.properties[0] = { ...receiver.properties[0], name: 'replacement' };
  const removed = lintScriptPropertyChains('<do_if value="$known.first"/>', fallback, fallbackOpts);
  const replaced = lintScriptPropertyChains('<do_if value="$known.replacement"/>', fallback, fallbackOpts);
  ok('path-head lookup is rebuilt after a model-only receiver changes',
    beforeChange.length === 0 && removed.length === 1 && removed[0].segment === 'first' && replaced.length === 0);

  // --- Unit 60 (#80): generalized isclass branch/conjunction narrowing, multi-segment hints, declaration masking & local cue roots ---
  const doElseIfShipXml = mdActions(
    '<do_if value="player.target.isclass.npc"><debug_text text="player.target.npctemplate"/></do_if>'
    + '<do_elseif value="player.target.isclass.ship"><debug_text text="player.target.cargo.free.all"/><debug_text text="player.target.cargoo"/></do_elseif>',
  );
  const doElseIfShipFindings = lintScriptPropertyChains(doElseIfShipXml, idx);
  ok('do_elseif isclass guard narrows compatible receiver and tags guarded typo',
    doElseIfShipFindings.length === 1
    && doElseIfShipFindings[0].segment === 'cargoo'
    && doElseIfShipFindings[0].typeContext?.datatype === 'ship'
    && doElseIfShipFindings[0].typeContext?.confidence === 'guarded'
    && doElseIfShipFindings[0].suggestions.includes('cargo'),
    doElseIfShipFindings);

  const highwayIdx = buildScriptPropertyIndex(SCRIPT_PROPERTIES_FIXTURE.replace(
    '</scriptproperties>',
    '<datatype name="zone" type="component"><property name="sector" type="component"/></datatype>'
    + '<datatype name="highway" type="zone"><property name="destination" type="zone"/></datatype>'
    + '<datatype name="room" type="component"/>'
    + '<datatype name="dockingbay" type="room"><property name="dockstate" type="string"/></datatype>'
    + '<datatype name="cue"><property name="state" type="string"/></datatype>'
    + '<keyword name="gamestart"><property name="seed" type="integer"/></keyword>'
    + '<property-unused/>'
    + '</scriptproperties>',
  ).replace('<property name="name" result="component name" type="string" />', '<property name="name" result="component name" type="string" /><property name="zone" type="zone" /><property name="parent" type="component" /><property name="assignedcontrolled" type="controllable" />'));

  const substituteGuardXml = mdActions(
    '<do_if value="$killed.sector"><set_value name="$loc" exact="$killed.sector.name"/></do_if>'
    + '<do_elseif value="$killed.zone.isclass.highway">'
    + '<substitute_text text="$loc" source="{1016,4}"><replace string="\'$CLUSTER$\'" with="$killed.zone.destination.sector.name"/></substitute_text>'
    + '<set_value name="$killed" exact="$killed.zone.destination"/>'
    + '<debug_text text="$killed.zone.destination"/>'
    + '</do_elseif>',
  );
  const substituteFindings = lintScriptPropertyChains(substituteGuardXml, highwayIdx);
  ok('do_elseif zone.isclass.highway narrows substitute_text/replace and stops after root-variable overwrite',
    substituteFindings.length === 1
    && substituteFindings[0].chain === '$killed.zone.destination'
    && substituteFindings[0].segment === 'destination',
    substituteFindings);

  const conjunctionXml = mdActions(
    '<do_if value="$NPC.assignedcontrolled.parent.isclass.dockingbay and $NPC.assignedcontrolled.parent.dockstate == \'default\'"/>'
    + '<do_if value="$NPC.assignedcontrolled.parent.isclass.dockingbay and $NPC.assignedcontrolled.parent.dockstat == \'default\'"/>'
    + '<do_if value="$NPC.assignedcontrolled.parent.isclass.dockingbay or $NPC.assignedcontrolled.parent.dockstate == \'default\'"/>'
    + '<do_if value="not $NPC.assignedcontrolled.parent.isclass.dockingbay and $NPC.assignedcontrolled.parent.dockstate == \'default\'"/>',
  );
  const conjunctionFindings = lintScriptPropertyChains(conjunctionXml, highwayIdx);
  ok('same-expression positive and-conjunction narrows subsequent conjuncts while rejecting or/not',
    conjunctionFindings.length === 3
    && conjunctionFindings[0].segment === 'dockstat'
    && conjunctionFindings[0].typeContext?.datatype === 'dockingbay'
    && conjunctionFindings[0].typeContext?.confidence === 'guarded'
    && conjunctionFindings[1].segment === 'dockstate'
    && conjunctionFindings[1].typeContext?.datatype === 'component'
    && conjunctionFindings[1].typeContext?.confidence === 'hint'
    && conjunctionFindings[2].segment === 'dockstate'
    && conjunctionFindings[2].typeContext?.datatype === 'component'
    && conjunctionFindings[2].typeContext?.confidence === 'hint',
    conjunctionFindings);

  const aiScriptGuardXml = '<aiscript name="player.interaction.budget"><order id="player.interaction"/><attention min="unknown"><actions>'
    + '<do_if value="player.target.isclass.ship"><debug_text text="player.target.cargo.free.all"/><debug_text text="player.target.cargoo"/></do_if>'
    + '</actions></attention></aiscript>';
  const aiScriptFindings = lintScriptPropertyChains(aiScriptGuardXml, idx);
  ok('aiscript masks declaration name/id attributes and narrows positive isclass guards',
    aiScriptFindings.length === 1
    && aiScriptFindings[0].segment === 'cargoo'
    && aiScriptFindings[0].typeContext?.datatype === 'ship'
    && aiScriptFindings[0].typeContext?.confidence === 'guarded',
    aiScriptFindings);

  const gamestartCueXml = '<mdscript name="x4ep1_pirates"><cues><cue name="Gamestart"><actions>'
    + '<do_if value="Gamestart.state == \'complete\'"><debug_text text="Gamestart.stat"/></do_if>'
    + '<debug_text text="gamestart.seed"/>'
    + '<debug_text text="gamestart.state"/>'
    + '</actions></cue></cues></mdscript>';
  const gamestartCueFindings = lintScriptPropertyChains(gamestartCueXml, highwayIdx);
  ok('mixed-case local cue root resolves as cue without masking lowercase keyword checks',
    gamestartCueFindings.length === 2
    && gamestartCueFindings[0].chain === 'Gamestart.stat'
    && gamestartCueFindings[0].typeContext?.datatype === 'cue'
    && gamestartCueFindings[0].typeContext?.confidence === 'declared'
    && gamestartCueFindings[1].chain === 'gamestart.state'
    && gamestartCueFindings[1].root === 'gamestart',
    gamestartCueFindings);

  const multiSegHint = lintScriptPropertyExpression('$s.boardingoperation.attacker', idx, { variableTypes: { $s: 'ship' } });
  const multiSegCargoHint = lintScriptPropertyExpression('$s.cargo.fre', idx, { variableTypes: { $s: 'ship' } });
  ok('multi-segment hinted variable chains retain hint provenance on downstream segments',
    multiSegHint.length === 1
    && multiSegHint[0].typeContext?.datatype === 'operation'
    && multiSegHint[0].typeContext?.confidence === 'hint'
    && multiSegCargoHint.length === 1
    && multiSegCargoHint[0].typeContext?.datatype === 'containercargolist'
    && multiSegCargoHint[0].typeContext?.confidence === 'hint'
    && multiSegCargoHint[0].suggestions.includes('free'),
    { multiSegHint, multiSegCargoHint });

  const incompatibleGuard = lintScriptPropertyChains(mdActions('<do_if value="faction.argon.isclass.npc"><debug_text text="faction.argon.npctemplate"/></do_if>'), idx);
  ok('incompatible non-component receiver family refuses bogus isclass narrowing',
    incompatibleGuard.some(f => f.segment === 'npctemplate' && f.typeContext?.datatype === 'faction' && f.typeContext?.confidence === 'declared'),
    incompatibleGuard);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
