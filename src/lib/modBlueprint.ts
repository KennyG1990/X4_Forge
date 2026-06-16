/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A5.1 — Mod Blueprint: the durable, plan-driven state for Architect mode. This
 * is the anti-drift / anti-hallucination backbone (same pattern Claude/Codex use):
 * a persistent intent + requirements + ordered plan + task list + scratchpad
 * (incl. rejected approaches) + verified changelog. Architect advances it one
 * VERIFIED step at a time; a task can only reach `done` when its deterministic
 * done-check passes (enforced by canMarkDone). Pure (no I/O) + localStorage helpers.
 */

export type BlueprintTaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export interface BlueprintTask {
  id: string;
  title: string;
  status: BlueprintTaskStatus;
  /** Which deterministic check proves this task complete (validate / critic / intent / selftest). */
  doneCheck?: string;
  /** Whether that check has passed (set by the verify step; gates `done`). */
  checkPassed?: boolean;
  blockedBy?: string[];
}

export interface BlueprintPlanStep {
  id: string;
  step: string;
  rationale?: string;
  doneCheck?: string;
}

export interface BlueprintScratchpad {
  notes: string[];
  decisions: string[];
  /** Rejected approaches + why — the lessons log so the model can't loop on a mistake. */
  rejected: string[];
  openQuestions: string[];
}

export interface BlueprintChangelogEntry {
  at: string;
  entry: string;
  verdict?: string;
}

export interface ModBlueprint {
  intent: string;
  requirements: string[];
  implementationPlan: BlueprintPlanStep[];
  tasks: BlueprintTask[];
  scratchpad: BlueprintScratchpad;
  changelog: BlueprintChangelogEntry[];
}

export function emptyBlueprint(intent = ''): ModBlueprint {
  return {
    intent,
    requirements: [],
    implementationPlan: [],
    tasks: [],
    scratchpad: { notes: [], decisions: [], rejected: [], openQuestions: [] },
    changelog: [],
  };
}

/** Normalize any persisted/partial object into a complete, safe ModBlueprint. */
export function sanitizeBlueprint(raw: any): ModBlueprint {
  const b = emptyBlueprint(typeof raw?.intent === 'string' ? raw.intent : '');
  if (!raw || typeof raw !== 'object') return b;
  b.requirements = Array.isArray(raw.requirements) ? raw.requirements.map(String) : [];
  b.implementationPlan = Array.isArray(raw.implementationPlan)
    ? raw.implementationPlan.map((s: any, i: number) => ({
        id: String(s?.id ?? `step_${i}`),
        step: String(s?.step ?? ''),
        rationale: s?.rationale ? String(s.rationale) : undefined,
        doneCheck: s?.doneCheck ? String(s.doneCheck) : undefined,
      }))
    : [];
  b.tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((t: any, i: number) => ({
        id: String(t?.id ?? `task_${i}`),
        title: String(t?.title ?? ''),
        status: (['pending', 'in_progress', 'done', 'blocked'] as const).includes(t?.status) ? t.status : 'pending',
        doneCheck: t?.doneCheck ? String(t.doneCheck) : undefined,
        checkPassed: !!t?.checkPassed,
        blockedBy: Array.isArray(t?.blockedBy) ? t.blockedBy.map(String) : undefined,
      }))
    : [];
  const sp = raw.scratchpad || {};
  b.scratchpad = {
    notes: Array.isArray(sp.notes) ? sp.notes.map(String) : [],
    decisions: Array.isArray(sp.decisions) ? sp.decisions.map(String) : [],
    rejected: Array.isArray(sp.rejected) ? sp.rejected.map(String) : [],
    openQuestions: Array.isArray(sp.openQuestions) ? sp.openQuestions.map(String) : [],
  };
  b.changelog = Array.isArray(raw.changelog)
    ? raw.changelog.map((c: any) => ({ at: String(c?.at ?? ''), entry: String(c?.entry ?? ''), verdict: c?.verdict ? String(c.verdict) : undefined }))
    : [];
  return b;
}

/**
 * The core anti-hallucination guarantee (M-ARCH-2): a task can move to `done`
 * ONLY if it carries a deterministic done-check AND that check passed. Verified,
 * not asserted. Returns the reason when it can't.
 */
export function canMarkDone(task: BlueprintTask): { ok: boolean; reason?: string } {
  if (!task.doneCheck) return { ok: false, reason: 'No deterministic done-check defined.' };
  if (!task.checkPassed) return { ok: false, reason: 'Done-check has not passed.' };
  return { ok: true };
}

export function blueprintProgress(b: ModBlueprint): { done: number; total: number } {
  const total = b.tasks.length;
  const done = b.tasks.filter(t => t.status === 'done').length;
  return { done, total };
}

const STORAGE_KEY = 'x4_mod_blueprint';

export function loadBlueprint(): ModBlueprint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeBlueprint(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveBlueprint(b: ModBlueprint): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

/** A demo blueprint so the panel renders meaningfully before the agent loop (A5.2) fills it. */
export function sampleBlueprint(): ModBlueprint {
  return sanitizeBlueprint({
    intent: 'On game start, greet the player and grant a small starting reward.',
    requirements: ['Trigger on game start', 'Show a welcome message', 'Reward the player with credits'],
    implementationPlan: [
      { id: 'p1', step: 'Add a startup cue', rationale: 'Root of the logic', doneCheck: 'schema valid' },
      { id: 'p2', step: 'Wire an event_game_started trigger', rationale: 'Satisfies "on game start"', doneCheck: 'intent: triggerWired event_game_started' },
      { id: 'p3', step: 'Add show_help + reward_player actions', rationale: 'The two effects', doneCheck: 'intent: actionInChain' },
    ],
    tasks: [
      { id: 't1', title: 'Startup cue present', status: 'done', doneCheck: 'graph valid', checkPassed: true },
      { id: 't2', title: 'Game-start trigger wired', status: 'in_progress', doneCheck: 'intent: triggerWired event_game_started' },
      { id: 't3', title: 'Reward action present', status: 'pending', doneCheck: 'intent: actionInChain reward_player' },
    ],
    scratchpad: {
      notes: ['X4 game-start uses event_game_started wired to a cue.'],
      decisions: ['Use a single cue with two chained actions.'],
      rejected: ['Auto-applying the whole workspace — rejected: must verify each step first.'],
      openQuestions: ['Exact credit amount?'],
    },
    changelog: [{ at: '2026-06-16', entry: 'Startup cue added', verdict: 'graph valid ✓' }],
  });
}

// ---------------------------------------------------------------------------
// Deterministic oracle (no I/O) — guards the model + the canMarkDone guarantee.
// ---------------------------------------------------------------------------
export function runBlueprintSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const expect = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  const empty = emptyBlueprint('test');
  expect('empty blueprint shape', empty.intent === 'test' && Array.isArray(empty.tasks) && Array.isArray(empty.scratchpad.rejected));

  // sanitize coerces partial/garbage safely.
  const s = sanitizeBlueprint({ intent: 'x', tasks: [{ title: 'a', status: 'bogus' }], scratchpad: { rejected: ['r'] } });
  expect('sanitize bad status → pending', s.tasks[0].status === 'pending', s.tasks[0].status);
  expect('sanitize fills ids', !!s.tasks[0].id);
  expect('sanitize keeps rejected', s.scratchpad.rejected[0] === 'r');
  expect('sanitize garbage → empty', sanitizeBlueprint(null).tasks.length === 0);

  // canMarkDone — the M-ARCH-2 guarantee.
  expect('no done-check → cannot done', canMarkDone({ id: 't', title: 't', status: 'pending' }).ok === false);
  expect('check not passed → cannot done', canMarkDone({ id: 't', title: 't', status: 'pending', doneCheck: 'x' }).ok === false);
  expect('check passed → can done', canMarkDone({ id: 't', title: 't', status: 'pending', doneCheck: 'x', checkPassed: true }).ok === true);

  // progress + sample render
  const sample = sampleBlueprint();
  const prog = blueprintProgress(sample);
  expect('progress counts done', prog.total === 3 && prog.done === 1, JSON.stringify(prog));
  expect('sample has plan + scratchpad', sample.implementationPlan.length === 3 && sample.scratchpad.rejected.length >= 1);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
