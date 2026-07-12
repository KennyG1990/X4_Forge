/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI spend meter (BACKLOG B25 — from the 2026-07-11 standing-hazard sweep).
 *
 * `callMultiProviderAI` is the single chokepoint for ALL paid AI calls (~10 call
 * sites; one orchestration request can fan out 5 provider calls). Gates existed
 * (tier default-off, per-call token caps, origin-locked keys) but nothing METERED
 * cumulative spend or LIMITED a runaway day — the exact shape that cost $256 on
 * the neural-link project. This meter counts per-provider daily calls at the
 * chokepoint and soft-stops past a configurable daily cap.
 *
 * Pure logic with injected store/clock (oracle-testable); the server persists to
 * data/ai-usage.json. Zero behavior change while the AI tier is off — no calls
 * reach the chokepoint at all.
 */

export interface SpendStore {
  load(): string | null;
  save(text: string): void;
}

interface DayUsage {
  /** YYYY-MM-DD (local) the counters belong to — rollover resets them. */
  day: string;
  calls: Record<string, number>;
  /** Calls REFUSED by the cap (kept for the day, visibility into pressure). */
  refused: Record<string, number>;
}

export interface SpendMeter {
  /** Is another call allowed right now? Never throws. */
  check(provider: string): { allowed: boolean; usedToday: number; cap: number };
  /** Count one outgoing call. */
  record(provider: string): void;
  /** Count one refused call. */
  recordRefusal(provider: string): void;
  snapshot(): { day: string; cap: number; calls: Record<string, number>; refused: Record<string, number>; totalToday: number };
}

const dayOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function createSpendMeter(store: SpendStore, dailyCallCap: number, now: () => number = () => Date.now()): SpendMeter {
  const empty = (day: string): DayUsage => ({ day, calls: {}, refused: {} });
  const load = (): DayUsage => {
    const today = dayOf(now());
    try {
      const parsed = JSON.parse(store.load() || 'null') as DayUsage | null;
      if (parsed && parsed.day === today && parsed.calls) return parsed;
    } catch { /* corrupt file → fresh day */ }
    return empty(today);
  };
  const save = (u: DayUsage) => { try { store.save(JSON.stringify(u)); } catch { /* metering is best-effort, never fatal */ } };
  const total = (u: DayUsage) => Object.values(u.calls).reduce((a, b) => a + b, 0);

  return {
    check(_provider) {
      const u = load();
      const usedToday = total(u);
      // The cap is TOTAL calls per local day across providers — the runaway-loop
      // backstop, not a budget planner. <=0 disables the meter's stop (never metering).
      return { allowed: dailyCallCap <= 0 || usedToday < dailyCallCap, usedToday, cap: dailyCallCap };
    },
    record(provider) {
      const u = load();
      u.calls[provider] = (u.calls[provider] || 0) + 1;
      save(u);
    },
    recordRefusal(provider) {
      const u = load();
      u.refused[provider] = (u.refused[provider] || 0) + 1;
      save(u);
    },
    snapshot() {
      const u = load();
      return { day: u.day, cap: dailyCallCap, calls: { ...u.calls }, refused: { ...u.refused }, totalToday: total(u) };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Oracle
 * ------------------------------------------------------------------ */

export function runAiSpendMeterSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  let text: string | null = null;
  const store: SpendStore = { load: () => text, save: (t) => { text = t; } };
  let clock = new Date(2026, 6, 11, 10, 0, 0).getTime();
  const m = createSpendMeter(store, 3, () => clock);

  ok('fresh_allows', m.check('gemini').allowed === true);
  m.record('gemini'); m.record('gemini'); m.record('claude');
  ok('counts_per_provider', m.snapshot().calls['gemini'] === 2 && m.snapshot().calls['claude'] === 1);
  ok('cap_is_cross_provider_total', m.check('openai').allowed === false, JSON.stringify(m.check('openai')));
  m.recordRefusal('openai');
  ok('refusals_tracked', m.snapshot().refused['openai'] === 1);

  clock += 24 * 3600 * 1000; // next local day → counters roll
  ok('daily_rollover_resets', m.check('gemini').allowed === true && m.snapshot().totalToday === 0);

  const unlimited = createSpendMeter(store, 0, () => clock);
  for (let i = 0; i < 10; i++) unlimited.record('gemini');
  ok('cap_zero_never_stops', unlimited.check('gemini').allowed === true);

  text = '{corrupt';
  ok('corrupt_store_degrades_fresh', createSpendMeter(store, 5, () => clock).check('x').allowed === true);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
