/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TTFM funnel — Time To First Mod (BACKLOG B20, Vision v2 Phase 1 — 2026-07-11).
 *
 * The north-star metric (ADR-F2): how long from "stranger sits down" to "an effect
 * THEY chose is visibly running in THEIR game". This records the funnel stages
 * LOCALLY (localStorage; zero network, zero telemetry — Ken's policy) so closes can
 * cite real numbers instead of guesses.
 *
 * Stages (each recorded ONCE, first occurrence — this is a first-run funnel, not an
 * activity log): first_boot → paths_configured → template_loaded → first_deploy →
 * game_confirmed. A separate "first_green_validate" stage was DELIBERATELY dropped:
 * deploy-verify's gate subsumes it (a deploy that passed validated by definition).
 *
 * Storage is injected so the oracle proves the logic without a browser.
 */

export const TTFM_STAGES = [
  'first_boot',
  'paths_configured',
  'template_loaded',
  'first_deploy',
  'game_confirmed',
] as const;
export type TtfmStage = (typeof TTFM_STAGES)[number];

const KEY = 'x4_ttfm_funnel';

export interface TtfmStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TtfmFunnel {
  /** Record a stage timestamp — first occurrence only. Returns true if recorded. */
  mark(stage: TtfmStage, nowMs?: number): boolean;
  /** All recorded stages with per-stage deltas from first_boot (ms). */
  read(): { stage: TtfmStage; at: number; sinceBootMs: number | null }[];
  /** first_boot → game_confirmed in ms, or null while the funnel is incomplete. */
  totalMs(): number | null;
}

export function createTtfmFunnel(store: TtfmStore, now: () => number = () => Date.now()): TtfmFunnel {
  const load = (): Partial<Record<TtfmStage, number>> => {
    try { return JSON.parse(store.getItem(KEY) || '{}'); } catch { return {}; }
  };
  const save = (data: Partial<Record<TtfmStage, number>>) => {
    try { store.setItem(KEY, JSON.stringify(data)); } catch { /* quota/unavailable — metric is best-effort */ }
  };
  return {
    mark(stage, nowMs) {
      if (!TTFM_STAGES.includes(stage)) return false;
      const data = load();
      if (data[stage] !== undefined) return false;
      data[stage] = nowMs ?? now();
      save(data);
      return true;
    },
    read() {
      const data = load();
      const boot = data.first_boot;
      return TTFM_STAGES.filter(s => data[s] !== undefined).map(s => ({
        stage: s,
        at: data[s]!,
        sinceBootMs: boot !== undefined ? data[s]! - boot : null,
      }));
    },
    totalMs() {
      const data = load();
      return data.first_boot !== undefined && data.game_confirmed !== undefined
        ? data.game_confirmed - data.first_boot
        : null;
    },
  };
}

/** Browser singleton (no-ops cleanly where localStorage is unavailable). */
export const ttfm: TtfmFunnel = createTtfmFunnel(
  typeof localStorage !== 'undefined'
    ? localStorage
    : { getItem: () => null, setItem: () => { /* headless */ } },
);

/* ------------------------------------------------------------------ *
 * Oracle
 * ------------------------------------------------------------------ */

export function runTtfmSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  const mem = new Map<string, string>();
  const store: TtfmStore = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } };
  let clock = 1000;
  const f = createTtfmFunnel(store, () => clock);

  ok('mark_records_first', f.mark('first_boot') === true);
  clock = 61000;
  ok('mark_once_only', f.mark('first_boot') === false, 'second mark must be ignored');
  ok('boot_time_kept', f.read()[0]?.at === 1000);
  f.mark('paths_configured');
  clock = 121000;
  f.mark('template_loaded');
  ok('deltas_from_boot', f.read().find(r => r.stage === 'template_loaded')?.sinceBootMs === 120000);
  ok('total_null_while_incomplete', f.totalMs() === null);
  clock = 300000;
  f.mark('first_deploy');
  clock = 481000;
  f.mark('game_confirmed');
  ok('total_boot_to_game', f.totalMs() === 480000, String(f.totalMs()));
  ok('read_ordered_by_funnel', f.read().map(r => r.stage).join(',') === TTFM_STAGES.join(','));
  ok('unknown_stage_rejected', (f.mark as (s: string) => boolean)('not_a_stage') === false);
  const broken = createTtfmFunnel({ getItem: () => 'not json', setItem: () => {} });
  ok('corrupt_store_degrades', broken.totalMs() === null && broken.mark('first_boot') === true);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
