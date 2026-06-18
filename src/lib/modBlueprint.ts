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

import { ModWorkspace, generateMDXML, validateModWorkspace } from '../types';
import { analyzeCueLineage } from './cueLineage';
import { checkIntent, type IntentCheckSpec } from './intentCheck';
import { critiqueWorkspace } from './mdCritic';

export type BlueprintTaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

/** A5.3 — a task's machine-evaluable done-check, run against the live workspace. */
export type DoneCheckSpec =
  | { kind: 'schema' }                              // XSD/MD: no errors
  | { kind: 'graph' }                               // cue lineage: no errors
  | { kind: 'intent'; spec: IntentCheckSpec };      // a single intent pattern passes

export interface BlueprintTask {
  id: string;
  title: string;
  status: BlueprintTaskStatus;
  /** Human label of which deterministic check proves this task complete. */
  doneCheck?: string;
  /** Machine-evaluable spec (A5.3) — run by evaluateBlueprintChecks against the workspace. */
  check?: DoneCheckSpec;
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
        check: t?.check && typeof t.check === 'object' ? t.check : undefined,
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

/**
 * A5.3 — run each task's machine-evaluable `check` against the live workspace and
 * set `checkPassed`. A task auto-advances to `done` ONLY when its check passes
 * (M-ARCH-2); a previously-`done` task whose check now fails reverts to
 * `in_progress` (so the blueprint can't claim done for work that regressed).
 * Tasks with no machine `check` are left untouched. Pure (no I/O); never throws.
 */
export function evaluateBlueprintChecks(blueprint: ModBlueprint, workspace: ModWorkspace): ModBlueprint {
  let schemaOk = false;
  let graphOk = false;
  try {
    const diags = validateModWorkspace(workspace, generateMDXML(workspace)) || [];
    schemaOk = !diags.some((d: any) => d.severity === 'error');
  } catch { schemaOk = false; }
  try {
    const findings = analyzeCueLineage(workspace?.nodes || [], (workspace as any)?.links || []).findings || [];
    graphOk = !findings.some((f: any) => f.severity === 'error');
  } catch { graphOk = false; }

  const tasks = blueprint.tasks.map(t => {
    if (!t.check) return t; // no machine check — leave as authored
    let passed = false;
    if (t.check.kind === 'schema') passed = schemaOk;
    else if (t.check.kind === 'graph') passed = graphOk;
    else if (t.check.kind === 'intent') {
      const r = checkIntent(workspace, [{ id: t.id, label: t.title, check: t.check.spec }]);
      passed = r.results[0]?.status === 'pass';
    }
    let status = t.status;
    if (passed && status !== 'done') status = 'done';
    else if (!passed && status === 'done') status = 'in_progress';
    return { ...t, checkPassed: passed, status };
  });
  return { ...blueprint, tasks };
}

// ---------------------------------------------------------------------------
// A5.4 — lessons log + self-critique gate (anti-loop / pre-proposal vetting).
// ---------------------------------------------------------------------------

/** Append a rejected approach to the scratchpad lessons log (deduped, case-insensitive). */
export function recordRejection(b: ModBlueprint, reason: string): ModBlueprint {
  const r = String(reason || '').trim();
  if (!r) return b;
  if (b.scratchpad.rejected.some(x => x.toLowerCase() === r.toLowerCase())) return b;
  return { ...b, scratchpad: { ...b.scratchpad, rejected: [...b.scratchpad.rejected, r] } };
}

/** True if `approach` overlaps something already in the lessons log — so the agent
 *  loop (A5.2) won't re-propose a rejected idea (matches either direction). */
export function isRejectedApproach(b: ModBlueprint, approach: string): boolean {
  const n = String(approach || '').trim().toLowerCase();
  if (!n) return false;
  return b.scratchpad.rejected.some(x => {
    const r = x.toLowerCase();
    return r.includes(n) || n.includes(r);
  });
}

/**
 * Self-critique gate — run the deterministic critic (mdCritic) over a candidate
 * step BEFORE proposing it, so the agent vets its own draft against rule-based
 * advisories (one-way ops without restore, unguarded high-risk actions, ref
 * mismatches). Advisory (info/warning), never a hard block. Never throws.
 */
export function critiqueGate(nodes: any[], links: any[]): { warnings: number; advisories: number; clean: boolean; findings: any[] } {
  try {
    const { findings } = critiqueWorkspace(nodes || [], links || []);
    const warnings = findings.filter((f: any) => f.severity === 'warning').length;
    const advisories = findings.filter((f: any) => f.severity === 'info').length;
    return { warnings, advisories, clean: findings.length === 0, findings };
  } catch {
    return { warnings: 0, advisories: 0, clean: true, findings: [] };
  }
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
      { id: 't1', title: 'Startup cue present', status: 'pending', doneCheck: 'graph valid', check: { kind: 'graph' } },
      { id: 't2', title: 'Game-start trigger wired', status: 'pending', doneCheck: 'intent: triggerWired event_game_started', check: { kind: 'intent', spec: { kind: 'triggerWired', xmlTag: 'event_game_started' } } },
      { id: 't3', title: 'Reward action present', status: 'pending', doneCheck: 'intent: actionInChain reward_player', check: { kind: 'intent', spec: { kind: 'actionInChain', xmlTag: 'reward_player' } } },
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

  // sample render shape
  const sample = sampleBlueprint();
  expect('sample has plan + scratchpad', sample.implementationPlan.length === 3 && sample.scratchpad.rejected.length >= 1);
  expect('sample tasks start pending', blueprintProgress(sample).done === 0);

  // A5.3 — evaluateBlueprintChecks against a synthetic workspace.
  const mkN = (id: string, type: string, xmlTag: string, props: any = {}) => ({ id, type, label: id, xmlTag, x: 0, y: 0, properties: props });
  const wsFull: any = {
    id: 'w', name: 'W_Test', version: '1.0.0', author: '', description: '', uiWidgets: [], uiTheme: {}, templates: [],
    nodes: [mkN('cue_0', 'cue', 'cue', { name: 'Start' }), mkN('ev_0', 'event', 'event_game_started'), mkN('act_0', 'action', 'reward_player', { money: '5000' })],
    links: [
      { id: 'l1', sourceNodeId: 'cue_0', sourcePortId: 'out_cond', targetNodeId: 'ev_0', targetPortId: 'in_cond' },
      { id: 'l2', sourceNodeId: 'cue_0', sourcePortId: 'out_act', targetNodeId: 'act_0', targetPortId: 'in_act' },
    ],
  };
  const ev = evaluateBlueprintChecks(sampleBlueprint(), wsFull);
  const t = (id: string) => ev.tasks.find(x => x.id === id)!;
  expect('graph check passes → done', t('t1').checkPassed === true && t('t1').status === 'done', JSON.stringify(t('t1')));
  expect('triggerWired check passes → done', t('t2').checkPassed === true && t('t2').status === 'done', JSON.stringify(t('t2')));
  expect('actionInChain check passes → done', t('t3').checkPassed === true);
  expect('all three verified → 3/3', blueprintProgress(ev).done === 3);

  // Missing the game-start trigger → t2's intent check fails, stays not-done (M-ARCH-2).
  const wsNoTrigger: any = { ...wsFull, nodes: wsFull.nodes.filter((n: any) => n.id !== 'ev_0'), links: wsFull.links.filter((l: any) => l.id !== 'l1') };
  const ev2 = evaluateBlueprintChecks(sampleBlueprint(), wsNoTrigger);
  expect('missing trigger → t2 fails', ev2.tasks.find(x => x.id === 't2')!.checkPassed === false);
  expect('failed check → not done', ev2.tasks.find(x => x.id === 't2')!.status !== 'done');

  // A5.4 — lessons log + self-critique gate.
  const rej = recordRejection(emptyBlueprint(), 'Auto-apply the whole workspace');
  expect('recordRejection appends', rej.scratchpad.rejected.length === 1);
  expect('recordRejection dedups', recordRejection(rej, 'auto-apply the whole workspace').scratchpad.rejected.length === 1);
  expect('isRejectedApproach matches', isRejectedApproach(rej, 'auto-apply') === true);
  expect('isRejectedApproach no false positive', isRejectedApproach(rej, 'add a reward action') === false);
  const gate = critiqueGate(wsFull.nodes, wsFull.links);
  expect('critiqueGate returns shape', typeof gate.clean === 'boolean' && Array.isArray(gate.findings));
  expect('critiqueGate empty → clean', critiqueGate([], []).clean === true);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
