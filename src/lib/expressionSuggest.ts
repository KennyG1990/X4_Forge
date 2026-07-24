/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Expression autocomplete — the "Gmail for MD expressions" engine (2026-07-09 beta-UX
 * pass). The user types `$station.` in any expression field and gets the REAL legal
 * continuations from the game's scriptproperties.xml, with documentation, instead of
 * guessing property names the game will silently evaluate to null.
 *
 * Context rules (derived from the same chain grammar the lint uses):
 *   `$var.` / `this.` / `parent.` …      → UNION heads (untyped roots), docs attached
 *   `player.` / `event.` (static keyword) → that keyword's OWN heads (typed)
 *   `…controlentity.` (continuation-req.) → its continuations (e.g. `default`)
 *   `$var.cont` (partial segment)         → same set, prefix-filtered
 *   dynamic segments (`{`, `[`, `$`)      → no suggestions (untypable — stay quiet)
 *
 * Pure: caller supplies the ScriptPropertyIndex. Suggestions are capped and sorted
 * (prefix matches first, then alphabetical). Never throws on garbage input.
 */

import {
  propertyHead,
  resolveDatatypeProperties,
  type ResolvedScriptProperty,
  type ScriptPropertyIndex,
} from './scriptProperties';

export interface ExpressionSuggestion {
  /** the text to insert for the CURRENT segment (replaces the partial after the dot) */
  insert: string;
  label: string;
  /** doc text (scriptproperties `result`), when known */
  detail?: string;
  resultType?: string;
  ownerType?: string;
  propertyName?: string;
  kind?: 'property' | 'function' | 'reference';
  /** where it came from: typed keyword, union, or continuation set */
  source: 'keyword' | 'union' | 'continuation' | 'datatype' | 'reference';
}

export interface DynamicExpressionValue {
  id: string;
  label?: string;
  documentation?: string;
}

export interface ExpressionSuggestOptions {
  dynamicValues?: Record<string, DynamicExpressionValue[]>;
  /** variable name with or without leading `$` -> datatype */
  variableTypes?: Record<string, string>;
}

const UNTYPED_ROOTS = new Set(['this', 'parent', 'static', 'namespace']);

/**
 * Find the chain context ending at `caret` in `text`: the root, completed segments,
 * and the partial segment being typed. Returns null when the caret isn't in a
 * completable chain position (no dot yet, inside a dynamic segment, etc.).
 */
export function chainContextAt(text: string, caret: number): { root: string; prevSegment: string | null; partial: string; depth: number; segments: string[] } | null {
  const upTo = String(text ?? '').slice(0, Math.max(0, caret));
  // walk back over the current partial segment (identifier chars)
  const m = upTo.match(/([$@]?[A-Za-z_][\w]*(?:\.(?:[A-Za-z_]\w*|\$[A-Za-z_]\w*|\{[^}]*\}|\[[^\]]*\]))*)\.([A-Za-z_]\w*)?$/);
  if (!m) return null;
  const chain = m[1];
  const partial = m[2] || '';
  const segments: string[] = [];
  // split chain into root + segments, respecting {…}/[…] blobs (no dots inside matter here
  // because the regex above only permits them inside balanced braces/brackets)
  const rootMatch = chain.match(/^([$@]?[A-Za-z_]\w*)/);
  if (!rootMatch) return null;
  const root = rootMatch[1].replace(/^@/, '');
  const rest = chain.slice(rootMatch[0].length);
  let token = '';
  let braces = 0;
  let brackets = 0;
  for (const char of rest) {
    if (char === '{') braces++;
    else if (char === '}') braces = Math.max(0, braces - 1);
    else if (char === '[') brackets++;
    else if (char === ']') brackets = Math.max(0, brackets - 1);
    if (char === '.' && braces === 0 && brackets === 0) {
      if (token) segments.push(token);
      token = '';
    } else token += char;
  }
  if (token) segments.push(token);
  const prevSegment = segments.length ? segments[segments.length - 1] : null;
  return { root, prevSegment, partial, depth: segments.length, segments };
}

/** Suggest completions for the segment being typed at `caret`. */
function inferredVariableType(root: string, index: ScriptPropertyIndex, opts?: ExpressionSuggestOptions): string | null {
  const clean = root.replace(/^[$@]/, '').toLowerCase();
  const supplied = opts?.variableTypes?.[root] || opts?.variableTypes?.[clean] || opts?.variableTypes?.[`$${clean}`];
  if (supplied && index.model.datatypes.has(supplied.toLowerCase())) return supplied.toLowerCase();
  const candidates = [clean, clean.replace(/\d+$/, ''), clean.replace(/(?:list|array)$/i, '')];
  for (const candidate of candidates) if (index.model.datatypes.has(candidate)) return candidate;
  return null;
}

function normalizedSelectorKind(raw: string): string {
  const value = raw.toLowerCase();
  for (const known of ['faction', 'ware', 'sector', 'macro', 'component']) if (value.includes(known)) return known;
  return value;
}

function continuationTokens(propertyName: string): string[] {
  return String(propertyName || '').split('.').slice(1);
}

function selectorKindOfToken(token: string): string | null {
  const match = token.match(/^(?:\{\$?([A-Za-z_][\w]*)\}|<([A-Za-z_][\w]*)>)$/);
  const raw = match?.[1] || match?.[2];
  return raw ? normalizedSelectorKind(raw) : null;
}

function placeholderKind(propertyName: string): string | null {
  for (const token of continuationTokens(propertyName)) {
    const kind = selectorKindOfToken(token);
    if (kind) return kind;
  }
  return null;
}

function propertiesForType(index: ScriptPropertyIndex, datatype: string): ResolvedScriptProperty[] {
  return resolveDatatypeProperties(index.model, datatype);
}

function preferredProperty(candidates: ResolvedScriptProperty[], opts?: ExpressionSuggestOptions, nextSegment?: string): ResolvedScriptProperty | null {
  if (nextSegment) {
    const exact = candidates.find(property => {
      const token = continuationTokens(property.name)[0];
      return !!token && !selectorKindOfToken(token) && token.toLowerCase() === nextSegment.toLowerCase();
    });
    if (exact) return exact;
  }
  return candidates.find(property => {
    const selector = placeholderKind(property.name);
    return !!selector && !!opts?.dynamicValues?.[selector]?.length;
  }) || candidates[0] || null;
}

function propertyForSegment(index: ScriptPropertyIndex, datatype: string, segment: string, opts?: ExpressionSuggestOptions, nextSegment?: string): ResolvedScriptProperty | null {
  const clean = segment.replace(/\?$/, '').toLowerCase();
  return preferredProperty(propertiesForType(index, datatype).filter(property => propertyHead(property.name) === clean), opts, nextSegment);
}

export interface ExpressionState {
  datatype: string | null;
  pendingSelector: string | null;
  pendingProperty: ResolvedScriptProperty | null;
  valid: boolean;
}

/** Resolve the datatype immediately to the left of the caret, plus pending selector state. */
export function resolveExpressionState(
  text: string,
  caret: number,
  index: ScriptPropertyIndex,
  opts?: ExpressionSuggestOptions,
): ExpressionState | null {
  const ctx = chainContextAt(text, caret);
  if (!ctx || !index?.loaded) return null;
  const rootLower = ctx.root.toLowerCase();
  const isVariable = ctx.root.startsWith('$');
  let datatype: string | null = null;
  let segments = [...ctx.segments];
  let keywordProperties: ResolvedScriptProperty[] | null = null;

  if (isVariable || UNTYPED_ROOTS.has(rootLower)) {
    datatype = inferredVariableType(ctx.root, index, opts);
  } else {
    const keyword = index.model.keywords.get(rootLower);
    if (!keyword) return { datatype: null, pendingSelector: null, pendingProperty: null, valid: false };
    if (keyword.dynamic) {
      if (!segments.length) return { datatype: keyword.dynamicResultType || null, pendingSelector: rootLower, pendingProperty: null, valid: true };
      segments = segments.slice(1); // imported lookup id (faction.player / ware.energycells)
      datatype = keyword.dynamicResultType || (index.model.datatypes.has(rootLower) ? rootLower : null);
    } else {
      keywordProperties = keyword.properties.map(property => ({ ...property, owner: keyword.name, inherited: false }));
      if (!segments.length) return { datatype: null, pendingSelector: null, pendingProperty: null, valid: true };
      const first = segments.shift()!;
      const property = keywordProperties.find(candidate => propertyHead(candidate.name) === first.toLowerCase());
      if (!property) return { datatype: null, pendingSelector: null, pendingProperty: null, valid: false };
      const selector = placeholderKind(property.name);
      if (selector) {
        if (!segments.length) return { datatype: property.type.toLowerCase() || null, pendingSelector: selector, pendingProperty: property, valid: true };
        segments.shift();
      }
      datatype = property.type.toLowerCase() || null;
    }
  }

  if (!datatype) return { datatype: null, pendingSelector: null, pendingProperty: null, valid: true };
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (/^[{[$]/.test(segment)) continue;
    const property = propertyForSegment(index, datatype, segment, opts, segments[i + 1]);
    if (!property) return { datatype, pendingSelector: null, pendingProperty: null, valid: false };
    for (const continuation of continuationTokens(property.name)) {
      const selector = selectorKindOfToken(continuation);
      if (i + 1 >= segments.length) {
        if (selector && opts?.dynamicValues?.[selector]?.length) {
          return { datatype: property.type.toLowerCase() || null, pendingSelector: selector, pendingProperty: property, valid: true };
        }
        // Literal and non-enumerable placeholder continuations are completed by
        // the established continuation index below suggestExpression's typed pass.
        return { datatype: null, pendingSelector: null, pendingProperty: property, valid: false };
      }
      const supplied = segments[++i];
      if (!selector && supplied.toLowerCase() !== continuation.toLowerCase()) {
        return { datatype, pendingSelector: null, pendingProperty: property, valid: false };
      }
    }
    datatype = property.type.toLowerCase() || '';
    if (!datatype || !index.model.datatypes.has(datatype)) {
      if (i < segments.length - 1) return { datatype: datatype || null, pendingSelector: null, pendingProperty: property, valid: false };
      return { datatype: datatype || null, pendingSelector: null, pendingProperty: property, valid: true };
    }
  }
  return { datatype, pendingSelector: null, pendingProperty: null, valid: true };
}

/** Suggest completions for the segment being typed at `caret`. */
export function suggestExpression(text: string, caret: number, index: ScriptPropertyIndex, opts?: ExpressionSuggestOptions): ExpressionSuggestion[] {
  if (!index?.loaded) return [];
  const ctx = chainContextAt(text, caret);
  if (!ctx) return [];
  const partial = ctx.partial.toLowerCase();

  const out: ExpressionSuggestion[] = [];
  const push = (name: string, source: ExpressionSuggestion['source'], detail?: string, extra?: Partial<ExpressionSuggestion>) => {
    out.push({ insert: name, label: name, detail, source, ...extra });
  };

  const state = resolveExpressionState(text, caret, index, opts);
  if (state?.pendingSelector) {
    const values = opts?.dynamicValues?.[state.pendingSelector] || [];
    for (const value of values) {
      const insert = state.pendingProperty ? `{${state.pendingSelector}.${value.id}}` : value.id;
      if (!partial || insert.toLowerCase().startsWith(partial) || value.id.toLowerCase().startsWith(partial)) {
        push(insert, 'reference', value.documentation || value.label, {
          label: state.pendingProperty ? `{${state.pendingSelector}.${value.id}}` : value.id,
          resultType: state.pendingProperty?.type || state.datatype || undefined,
          propertyName: state.pendingProperty?.name,
          ownerType: state.pendingProperty?.owner,
          kind: 'reference',
        });
      }
    }
    if (out.length) return rank(out, partial);
    return []; // a dynamic lookup still needs an id; never skip directly to object properties
  }

  if (state?.valid && state.datatype && index.model.datatypes.has(state.datatype)) {
    const seen = new Set<string>();
    const properties = propertiesForType(index, state.datatype);
    for (const candidate of properties) {
      const head = propertyHead(candidate.name);
      const property = preferredProperty(properties.filter(value => propertyHead(value.name) === head), opts) || candidate;
      if (!head || seen.has(head) || (partial && !head.startsWith(partial))) continue;
      seen.add(head);
      push(head, 'datatype', property.result, {
        resultType: property.type || undefined,
        ownerType: property.owner,
        propertyName: property.name,
        kind: placeholderKind(property.name) ? 'function' : 'property',
      });
    }
    if (out.length) return rank(out, partial);
  }

  // 1. continuation-required previous segment → its continuation set (precise)
  if (ctx.prevSegment) {
    const prevName = ctx.prevSegment.replace(/\?$/, '').toLowerCase();
    const conts = index.continuations.get(prevName);
    if (conts && !index.bareOk.has(prevName)) {
      for (const c of conts) {
        if (c === '*') continue;
        if (!partial || c.startsWith(partial)) push(c, 'continuation', index.docs.get(`${prevName}.${c}`));
      }
      if (out.length) return rank(out, partial);
      // continuation set was all-placeholder → fall through to union
    }
  }

  // 2. keyword roots (e.g. `player.`, `event.`, `faction.`, `md.`)
  const rootLower = ctx.root.toLowerCase();
  const isVar = ctx.root.startsWith('$');
  if (!isVar && !UNTYPED_ROOTS.has(rootLower)) {
    const kw = index.model.keywords.get(rootLower);
    // unknown bare root at ANY depth (md.Script.Cue refs, XML noise) — not a property chain
    if (!kw) return [];
    if (ctx.prevSegment === null) {
      if (kw.dynamic || !kw.heads.size) return [];
      for (const h of kw.heads) {
        if (!partial || h.startsWith(partial)) push(h, 'keyword', kw.headDocs.get(h));
      }
      return rank(out, partial);
    }
    // Dynamic-lookup keyword at depth 1 (`md.MyScript.` — script/id names are
    // unknowable): stay quiet. Deeper (`md.Script.Cue.` — an object) → union below.
    if ((kw.dynamic || !kw.heads.size) && ctx.depth === 1) return [];
    // depth ≥ 1 on a static keyword root: results are object-valued → union fallthrough
  }

  // 3. untyped roots + deeper segments → union with docs
  for (const h of index.union) {
    if (!partial || h.startsWith(partial)) push(h, 'union', index.docs.get(h));
  }
  return rank(out, partial);
}

function rank(list: ExpressionSuggestion[], partial: string): ExpressionSuggestion[] {
  return list
    .sort((a, b) => {
      const ap = partial && a.insert.startsWith(partial) ? 0 : 1;
      const bp = partial && b.insert.startsWith(partial) ? 0 : 1;
      return ap - bp || a.insert.localeCompare(b.insert);
    });
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runExpressionSuggestSelftest(index: ScriptPropertyIndex): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
  const sug = (text: string) => suggestExpression(text, text.length, index);
  const typedSug = (text: string) => suggestExpression(text, text.length, index, {
    dynamicValues: { faction: [{ id: 'player', label: 'Player' }, { id: 'argon', label: 'Argon Federation' }] },
  });

  ok('empty text → no suggestions', sug('').length === 0);
  ok('no dot yet → no suggestions', sug('$station').length === 0);
  const afterVar = sug('$station.');
  ok('after $var. → inferred datatype or conservative union suggestions flow', afterVar.length > 0 && afterVar.every(s => s.source === 'union' || s.source === 'datatype'), afterVar.length);
  const partial = sug('$station.exi');
  ok('partial segment prefix-filters', partial.length > 0 && partial.every(s => s.insert.startsWith('exi')), JSON.stringify(partial.slice(0, 3)));
  const typed = sug('event.');
  ok('typed keyword root → its OWN heads only', typed.length > 0 && typed.every(s => s.source === 'keyword'), JSON.stringify(typed.map(s => s.insert)));
  ok('typed keyword includes param3 with doc', typed.some(s => s.insert === 'param3'), JSON.stringify(typed.map(s => s.insert)));
  const cont = sug('$station.controlentity.');
  ok('continuation-required head → its continuations (default)', cont.some(s => s.insert === 'default' && s.source === 'continuation'), JSON.stringify(cont));
  ok('dynamic segment → quiet', sug('$t.{$key}.').length === 0 || sug('$t.{$key}.').every(s => s.source === 'union'));
  ok('unknown bare root (md.Script) → quiet', sug('md.MyScript.').length === 0, JSON.stringify(sug('md.MyScript.').slice(0, 2)));
  ok('dynamic keyword (faction lookup) → quiet', sug('faction.').length === 0, JSON.stringify(sug('faction.').slice(0, 2)));
  const factionIds = typedSug('faction.');
  ok('dynamic keyword uses canonical ids when supplied', factionIds.some(s => s.insert === 'player' && s.kind === 'reference'), JSON.stringify(factionIds));
  const factionProps = typedSug('faction.player.');
  ok('dynamic lookup resolves return datatype properties', factionProps.some(s => s.insert === 'id' && s.resultType === 'string') && factionProps.some(s => s.insert === 'relationto' && s.kind === 'function'), JSON.stringify(factionProps));
  const selector = typedSug('faction.player.relationto.');
  ok('selector function completes canonical faction arguments', selector.some(s => s.insert === '{faction.argon}'), JSON.stringify(selector));
  const shipProps = typedSug('$ship.');
  ok('variable name conservatively infers datatype and inheritance', shipProps.some(s => s.insert === 'cargo') && shipProps.some(s => s.insert === 'exists'), JSON.stringify(shipProps));
  ok('mid-text caret works', suggestExpression('$a.exi and $b', 7, index).every(s => s.insert.startsWith('exi')));
  ok('legal suggestions are not silently truncated', sug('$x.').length === new Set(sug('$x.').map(s => s.insert)).size);
  ok('docs attached where known', afterVar.some(s => !!s.detail), JSON.stringify(afterVar.filter(s => s.detail).slice(0, 2)));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
