/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FORGE-WATCH — watched variables from the running game (Play-In-Editor slice 3).
 *
 * MD has no debugger, but it has debug_text — and the Forge already tails the log.
 * Protocol: a mod emits `FORGE-WATCH <name>=<value>` lines (via the helper snippet
 * below); the watcher parses the tail and the canvas shows the latest value per name,
 * updating while the game runs. Last occurrence wins; values are strings (MD renders
 * them into the text itself).
 *
 * `buildWatchActionXml` generates the exact MD action to paste/insert so users never
 * hand-type the protocol. In-game verification of the full loop is human+game gated;
 * the parse side is oracle-covered and works against any log tail.
 */

export interface WatchValue {
  name: string;
  value: string;
  lineNo: number;
}

const WATCH_RE = /FORGE-WATCH\s+([A-Za-z_][\w.]*)\s*=\s*([^\r\n]*)/;

/** Latest value per watch name from a log tail (last occurrence wins). */
export function parseForgeWatches(tail: string): WatchValue[] {
  const byName = new Map<string, WatchValue>();
  const lines = String(tail ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(WATCH_RE);
    if (!m) continue;
    byName.set(m[1], { name: m[1], value: m[2].trim(), lineNo: i + 1 });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The MD action that emits a watch — expression interpolated by MD at runtime. */
export function buildWatchActionXml(name: string, expression: string): string {
  const safeName = String(name || 'watch').replace(/[^\w.]/g, '_');
  const expr = String(expression || "'?'").trim();
  return `<debug_text text="'FORGE-WATCH ${safeName}=' + (${expr})" />`;
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runForgeWatchSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  // real X4 shape: mods can only log via DebugError → engine stamps [=ERROR=]
  const tail = [
    '[General] 100.0 ======',
    "[=ERROR=] 101.2 Error ... FORGE-WATCH npcs=3",
    "[=ERROR=] 102.9 Error ... FORGE-WATCH influence=0.25",
    "[=ERROR=] 140.1 Error ... FORGE-WATCH npcs=7",
    '[General] noise FORGE-WATCHnot_a_watch=1',
  ].join('\n');
  const watches = parseForgeWatches(tail);
  const get = (n: string) => watches.find(w => w.name === n);

  ok('parses watches from [=ERROR=]-stamped lines', watches.length === 2, JSON.stringify(watches));
  ok('last occurrence wins', get('npcs')?.value === '7' && get('npcs')?.lineNo === 4);
  ok('multiple names coexist', get('influence')?.value === '0.25');
  ok('requires whitespace before name (no false match on FORGE-WATCHnot…)', get('not_a_watch') === undefined);
  ok('empty tail degrades', parseForgeWatches('').length === 0);

  const xml = buildWatchActionXml('npcs', '$npcs');
  ok('emit helper produces the exact protocol line', xml === `<debug_text text="'FORGE-WATCH npcs=' + ($npcs)" />`, xml);
  ok('emit helper sanitizes hostile names', buildWatchActionXml('a b"c', '$x').includes('FORGE-WATCH a_b_c='));

  // round-trip: emit-shape output, once through the game, parses back
  const rendered = "[=ERROR=] 12.3 Error in ... FORGE-WATCH npcs=42";
  ok('emit→log→parse round-trip', parseForgeWatches(rendered)[0]?.value === '42');

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
