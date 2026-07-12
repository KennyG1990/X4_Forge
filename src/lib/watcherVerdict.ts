/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Watcher verdict — the ONE server-computed answer to "is my mod loaded and clean?"
 * (B19s2, Vision v2). The guided rail (and any agent) previously guessed from fields
 * that didn't exist on the brief's top level, so it reported "clean" whenever the
 * endpoint answered at all. This pure function is the single source of that truth;
 * the brief endpoint feeds it deterministic inputs from the log tail.
 */

export type WatcherVerdictState =
  | 'no_log'              // no readable debuglog found at all
  | 'stale'               // log exists but predates the last Studio deploy
  | 'not_seen'            // log is current, but nothing from this mod appears in it
  | 'loaded_with_errors'  // the mod is in the log AND errors are attributed to it
  | 'loaded_clean';       // the mod is in the log with zero attributed errors

export interface WatcherVerdictInputs {
  hasLog: boolean;
  /** Log written within the last ~2 minutes (the game is actively playing). */
  logFresh: boolean;
  hasDeploy: boolean;
  /** Log changed at or after the last deploy timestamp. */
  changedSinceDeploy: boolean;
  /** Mod's own log markers seen in the tail (modRuntime.markersSeen). */
  markersSeen: boolean;
  /** Any of the mod's cues firing or erroring in the tail (cue liveness). */
  cuesActive: boolean;
  /** Errors attributed to THIS mod (runtime + cue + active log issues). */
  errorCount: number;
}

export interface WatcherVerdict {
  state: WatcherVerdictState;
  detail: string;
  errorCount: number;
}

export function computeWatcherVerdict(i: WatcherVerdictInputs): WatcherVerdict {
  if (!i.hasLog) {
    return { state: 'no_log', errorCount: 0, detail: 'No X4 debuglog found — start the game with logging enabled (-debug all -logfile debuglog.txt).' };
  }
  if (i.hasDeploy && !i.changedSinceDeploy) {
    return { state: 'stale', errorCount: 0, detail: 'The log predates your last deploy — reload a save (or /refreshmd) so the game reads the new files.' };
  }
  const modInLog = i.markersSeen || i.cuesActive;
  if (!modInLog) {
    return {
      state: 'not_seen',
      errorCount: 0,
      detail: i.logFresh
        ? 'The game is running but nothing from this mod has appeared in the log yet — load a save or trigger the mod.'
        : 'Nothing from this mod appears in the current log; the log is not being written right now.',
    };
  }
  if (i.errorCount > 0) {
    return { state: 'loaded_with_errors', errorCount: i.errorCount, detail: `The mod is loaded and running, but ${i.errorCount} error(s) in the log are attributed to it.` };
  }
  return { state: 'loaded_clean', errorCount: 0, detail: 'The mod is loaded and running with zero attributed errors.' };
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runWatcherVerdictSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : JSON.stringify(detail) });

  const base: WatcherVerdictInputs = {
    hasLog: true, logFresh: true, hasDeploy: true, changedSinceDeploy: true,
    markersSeen: true, cuesActive: false, errorCount: 0,
  };
  const v = (over: Partial<WatcherVerdictInputs>) => computeWatcherVerdict({ ...base, ...over });

  ok('no log → no_log', v({ hasLog: false }).state === 'no_log');
  ok('log predates deploy → stale (beats everything but no_log)', v({ changedSinceDeploy: false, errorCount: 9 }).state === 'stale');
  ok('no deploy metadata → stale check skipped', v({ hasDeploy: false, changedSinceDeploy: false }).state === 'loaded_clean');
  ok('fresh log, mod absent → not_seen', v({ markersSeen: false, cuesActive: false }).state === 'not_seen');
  ok('cue liveness alone counts as "in the log"', v({ markersSeen: false, cuesActive: true }).state === 'loaded_clean');
  ok('attributed errors → loaded_with_errors with count', (() => { const r = v({ errorCount: 3 }); return r.state === 'loaded_with_errors' && r.errorCount === 3; })());
  ok('markers seen, zero errors → loaded_clean', v({}).state === 'loaded_clean');
  ok('not_seen message distinguishes live vs idle log', v({ markersSeen: false, logFresh: false }).detail.includes('not being written'));
  ok('every state carries a human detail', (['no_log','stale','not_seen','loaded_with_errors','loaded_clean'] as const).every(s => {
    const samples: Record<string, WatcherVerdict> = {
      no_log: v({ hasLog: false }), stale: v({ changedSinceDeploy: false }),
      not_seen: v({ markersSeen: false }), loaded_with_errors: v({ errorCount: 1 }), loaded_clean: v({}),
    };
    return samples[s].state === s && samples[s].detail.length > 10;
  }));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
