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

import type { ScriptPropertyIndex } from './scriptProperties';

export interface ExpressionSuggestion {
  /** the text to insert for the CURRENT segment (replaces the partial after the dot) */
  insert: string;
  label: string;
  /** doc text (scriptproperties `result`), when known */
  detail?: string;
  /** where it came from: typed keyword, union, or continuation set */
  source: 'keyword' | 'union' | 'continuation';
}

const UNTYPED_ROOTS = new Set(['this', 'parent', 'static', 'namespace']);
const MAX_SUGGESTIONS = 24;

/**
 * Find the chain context ending at `caret` in `text`: the root, completed segments,
 * and the partial segment being typed. Returns null when the caret isn't in a
 * completable chain position (no dot yet, inside a dynamic segment, etc.).
 */
export function chainContextAt(text: string, caret: number): { root: string; prevSegment: string | null; partial: string; depth: number } | null {
  const upTo = String(text ?? '').slice(0, Math.max(0, caret));
  // walk back over the current partial segment (identifier chars)
  const m = upTo.match(/([$@]?[A-Za-z_][\w]*(?:\.(?:[A-Za-z_]\w*|\$[A-Za-z_]\w*|\{[^}]*\}|\[[^\]]*\]))*)\.([A-Za-z_]\w*)?$/);
  if (!m) return null;
  const chain = m[1];
  const partial = m[2] || '';
  const segments = [] as string[];
  // split chain into root + segments, respecting {…}/[…] blobs (no dots inside matter here
  // because the regex above only permits them inside balanced braces/brackets)
  const rootMatch = chain.match(/^([$@]?[A-Za-z_]\w*)/);
  if (!rootMatch) return null;
  const root = rootMatch[1].replace(/^@/, '');
  const rest = chain.slice(rootMatch[0].length);
  for (const seg of rest.split('.')) {
    if (seg) segments.push(seg);
  }
  const prevSegment = segments.length ? segments[segments.length - 1] : null;
  // dynamic previous segment → untypable; stay quiet
  if (prevSegment && (/^[${[]/.test(prevSegment))) return null;
  return { root, prevSegment, partial, depth: segments.length };
}

/** Suggest completions for the segment being typed at `caret`. */
export function suggestExpression(text: string, caret: number, index: ScriptPropertyIndex): ExpressionSuggestion[] {
  if (!index?.loaded) return [];
  const ctx = chainContextAt(text, caret);
  if (!ctx) return [];
  const partial = ctx.partial.toLowerCase();

  const out: ExpressionSuggestion[] = [];
  const push = (name: string, source: ExpressionSuggestion['source'], detail?: string) => {
    out.push({ insert: name, label: name, detail, source });
  };

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
      // dynamic lookup keywords (faction.<id>, ware.<id> — import-generated) can't be
      // enumerated from the static set: stay quiet rather than suggest wrong things.
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
    })
    .slice(0, MAX_SUGGESTIONS);
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

  ok('empty text → no suggestions', sug('').length === 0);
  ok('no dot yet → no suggestions', sug('$station').length === 0);
  const afterVar = sug('$station.');
  ok('after $var. → union suggestions flow', afterVar.length > 0 && afterVar.every(s => s.source === 'union'), afterVar.length);
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
  ok('mid-text caret works', suggestExpression('$a.exi and $b', 7, index).every(s => s.insert.startsWith('exi')));
  ok('capped at 24', sug('$x.').length <= 24);
  ok('docs attached where known', afterVar.some(s => !!s.detail), JSON.stringify(afterVar.filter(s => s.detail).slice(0, 2)));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
