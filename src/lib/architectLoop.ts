/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A5.2 — Architect agent loop, DETERMINISTIC CORE (D1). No model, no I/O.
 *
 * This is the anti-hallucination *referee*: given a model-proposed workspace for
 * the active blueprint task, it decides accept / revise / reject using ONLY the
 * determinism engine (proposalReview's schema+graph+unknown-tag gate, the task's
 * own deterministic done-check via evaluateBlueprintChecks, and the lessons log).
 * The model never gets to declare success — a task advances only when its
 * machine check passes on the proposed workspace (M-ARCH-2). The headline
 * guarantee is `revise-on-valid-but-wrong`: structurally valid XML that does NOT
 * satisfy the task's intent is sent back, never accepted (the Codex finding).
 */

import type { ModWorkspace } from '../types';
import type { IntentRequirement } from './intentCheck';
import { reviewProposal, type ProposalReview } from './proposalReview';
import {
  evaluateBlueprintChecks,
  isRejectedApproach,
  type ModBlueprint,
  type BlueprintTask,
} from './modBlueprint';

export type ArchitectDecision = 'accept' | 'revise' | 'reject';

export interface VetResult {
  /** What the referee decided, from deterministic evidence only. */
  decision: ArchitectDecision;
  /** Human-readable justification (cites the failing gate). */
  reason: string;
  /** The full proposal review (diff + schema/graph/intent verdicts + unknown tags). */
  review: ProposalReview;
  /** Did the active task's deterministic check pass on the PROPOSED workspace? */
  taskNowPasses: boolean;
  /** Did the approach match something in the lessons log? */
  isRejected: boolean;
  /** Which task this was vetted against (may be null if the plan has no open task). */
  activeTaskId: string | null;
}

/** A short signature for a proposal: the sorted set of node tags it ADDS. Used to
 *  match against the lessons log so the loop can't re-propose a rejected idea. */
export function deriveApproach(base: ModWorkspace, proposed: ModWorkspace): string {
  const baseIds = new Set((base?.nodes || []).map((n: any) => n.id));
  const addedTags = (proposed?.nodes || [])
    .filter((n: any) => !baseIds.has(n.id))
    .map((n: any) => String(n?.xmlTag || ''))
    .filter(Boolean)
    .sort();
  return Array.from(new Set(addedTags)).join('+');
}

/** First task that is not `done` and whose `blockedBy` are all done. Null if none. */
export function nextActiveTask(b: ModBlueprint): BlueprintTask | null {
  if (!b || !Array.isArray(b.tasks)) return null;
  const doneIds = new Set(b.tasks.filter(t => t.status === 'done').map(t => t.id));
  for (const t of b.tasks) {
    if (t.status === 'done') continue;
    const blocked = (t.blockedBy || []).some(id => !doneIds.has(id));
    if (!blocked) return t;
  }
  return null;
}

export type StopReason = 'complete' | 'max-iterations' | 'stalled' | null;

/**
 * Why the loop should halt, if it should:
 *  - `complete`       — there are tasks and every one is done.
 *  - `max-iterations` — the iteration budget is exhausted (latency/cost guard).
 *  - `stalled`        — open tasks remain but every one is blocked (no progress possible).
 *  - `null`           — keep going.
 */
export function loopStopReason(b: ModBlueprint, iterations: number, max: number): StopReason {
  const tasks = b?.tasks || [];
  if (tasks.length > 0 && tasks.every(t => t.status === 'done')) return 'complete';
  if (iterations >= max) return 'max-iterations';
  if (tasks.length > 0 && !nextActiveTask(b)) return 'stalled';
  return null;
}

/**
 * The referee. Decide what to do with a model-proposed workspace for the active task.
 * Order matters: a known-rejected approach is rejected outright; otherwise hard
 * legality (schema/graph/unknown-tags) must pass to even consider it; then the
 * task's own deterministic check must pass on the proposed workspace; only then accept.
 */
export function vetTaskProposal(args: {
  base: ModWorkspace;
  proposed: ModWorkspace;
  blueprint: ModBlueprint;
  activeTaskId?: string | null;
  knownTags?: Set<string>;
  requirements?: IntentRequirement[];
  /** Optional explicit approach signature; defaults to the added-tags signature. */
  approach?: string;
}): VetResult {
  const { base, proposed, blueprint, knownTags, requirements } = args;
  const activeTaskId = args.activeTaskId ?? nextActiveTask(blueprint)?.id ?? null;

  const review = reviewProposal(base, proposed, { knownTags, requirements });

  const approach = (args.approach ?? deriveApproach(base, proposed)).trim();
  const isRejected = approach ? isRejectedApproach(blueprint, approach) : false;

  // Does the active task's deterministic check pass on the proposed workspace?
  let taskNowPasses = false;
  if (activeTaskId) {
    const evaluated = evaluateBlueprintChecks(blueprint, proposed);
    taskNowPasses = !!evaluated.tasks.find(t => t.id === activeTaskId)?.checkPassed;
  }

  if (isRejected) {
    return { decision: 'reject', reason: 'Matches a previously rejected approach (lessons log) — not re-proposing.', review, taskNowPasses, isRejected, activeTaskId };
  }
  if (!review.applySafe) {
    const why = review.unknownTags.length
      ? `unrecognized tag(s): ${review.unknownTags.map(u => u.xmlTag).join(', ')} (not in the X4 schema — likely invented)`
      : review.verdicts.schema.status === 'fail' ? 'schema errors'
        : review.verdicts.graph.status === 'fail' ? 'graph (cue lineage) errors'
          : 'not safe to apply';
    return { decision: 'revise', reason: `Send back — ${why}.`, review, taskNowPasses, isRejected, activeTaskId };
  }
  if (activeTaskId && !taskNowPasses) {
    return {
      decision: 'revise',
      reason: "Structurally valid, but the task's deterministic check still fails — valid XML ≠ satisfied intent. Revising.",
      review, taskNowPasses, isRejected, activeTaskId,
    };
  }
  return {
    decision: 'accept',
    reason: activeTaskId ? "Safe to apply AND the task's deterministic check passes." : 'Safe to apply.',
    review, taskNowPasses, isRejected, activeTaskId,
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic oracle. House contract: { allPassed, pass, passed, total, checks }.
 * ------------------------------------------------------------------ */
export function runArchitectLoopSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass: !!pass, detail });

  const mkN = (id: string, type: string, xmlTag: string, props: any = {}) =>
    ({ id, type, label: id, xmlTag, x: 0, y: 0, properties: props });
  const baseWs = (over: any = {}): any => ({
    id: 'w', name: 'W_Test', version: '1.0.0', author: '', description: '',
    uiWidgets: [], uiTheme: {}, templates: [], nodes: [], links: [], ...over,
  });

  // A blueprint with one task gated on a game-start trigger being wired (intent check).
  const bp: ModBlueprint = {
    intent: 'On game start, reward the player.',
    requirements: ['Trigger on game start', 'Reward the player'],
    implementationPlan: [],
    tasks: [
      { id: 'tA', title: 'Game-start trigger wired', status: 'pending',
        doneCheck: 'intent: triggerWired event_game_started',
        check: { kind: 'intent', spec: { kind: 'triggerWired', xmlTag: 'event_game_started' } } },
    ],
    scratchpad: { notes: [], decisions: [], rejected: [], openQuestions: [] },
    changelog: [],
  };

  const base = baseWs();
  // The schema vocabulary the live loop injects (from /api/schema/library). set_god_mode is
  // deliberately excluded so the hallucinated-tag case is still caught.
  const schemaTags = new Set(['cue', 'event_game_started', 'reward_player']);

  // ---- ACCEPT: proposed workspace wires the game-start trigger (task check passes) ----
  const proposedGood = baseWs({
    nodes: [mkN('cue_0', 'cue', 'cue', { name: 'Start' }), mkN('ev_0', 'event', 'event_game_started'), mkN('act_0', 'action', 'reward_player', { money: '5000' })],
    links: [
      { id: 'l1', sourceNodeId: 'cue_0', sourcePortId: 'out_cond', targetNodeId: 'ev_0', targetPortId: 'in_cond' },
      { id: 'l2', sourceNodeId: 'cue_0', sourcePortId: 'out_act', targetNodeId: 'act_0', targetPortId: 'in_act' },
    ],
  });
  const accept = vetTaskProposal({ base, proposed: proposedGood, blueprint: bp, activeTaskId: 'tA', knownTags: schemaTags });
  ok('accept_when_safe_and_task_passes', accept.decision === 'accept' && accept.taskNowPasses === true, accept.reason);
  ok('accept_is_applySafe', accept.review.applySafe === true);

  // ---- REVISE (headline): structurally valid but MISSING the trigger → task check fails ----
  const proposedNoTrigger = baseWs({
    nodes: [mkN('cue_0', 'cue', 'cue', { name: 'Start' }), mkN('act_0', 'action', 'reward_player', { money: '5000' })],
    links: [{ id: 'l2', sourceNodeId: 'cue_0', sourcePortId: 'out_act', targetNodeId: 'act_0', targetPortId: 'in_act' }],
  });
  const vbw = vetTaskProposal({ base, proposed: proposedNoTrigger, blueprint: bp, activeTaskId: 'tA', knownTags: schemaTags });
  ok('revise_on_valid_but_wrong', vbw.decision === 'revise' && vbw.taskNowPasses === false, `${vbw.decision} | applySafe=${vbw.review.applySafe}`);
  ok('valid_but_wrong_is_still_applySafe', vbw.review.applySafe === true, 'valid XML must pass the hard gate; only the intent check catches it');

  // ---- REVISE: a hallucinated/unknown tag fails the hard gate ----
  const proposedHallucinated = baseWs({
    nodes: [mkN('cue_0', 'cue', 'cue', { name: 'Start' }), mkN('ev_0', 'event', 'event_game_started'), mkN('bad_0', 'action', 'set_god_mode', { on: 'true' })],
    links: [
      { id: 'l1', sourceNodeId: 'cue_0', sourcePortId: 'out_cond', targetNodeId: 'ev_0', targetPortId: 'in_cond' },
      { id: 'l3', sourceNodeId: 'cue_0', sourcePortId: 'out_act', targetNodeId: 'bad_0', targetPortId: 'in_act' },
    ],
  });
  const hall = vetTaskProposal({ base, proposed: proposedHallucinated, blueprint: bp, activeTaskId: 'tA', knownTags: schemaTags });
  ok('revise_on_unknown_tag', hall.decision === 'revise' && hall.review.unknownTags.some(u => u.xmlTag === 'set_god_mode'), hall.reason);
  ok('unknown_tag_not_applySafe', hall.review.applySafe === false);

  // ---- REJECT: approach is in the lessons log ----
  const bpRej: ModBlueprint = { ...bp, scratchpad: { ...bp.scratchpad, rejected: ['event_game_started'] } };
  const rej = vetTaskProposal({ base, proposed: proposedGood, blueprint: bpRej, activeTaskId: 'tA', approach: 'event_game_started', knownTags: schemaTags });
  ok('reject_on_rejected_approach', rej.decision === 'reject' && rej.isRejected === true, rej.reason);

  // deriveApproach reflects added tags
  ok('deriveApproach_added_tags', deriveApproach(base, proposedGood) === 'cue+event_game_started+reward_player', deriveApproach(base, proposedGood));

  // ---- nextActiveTask respects blockedBy + done ----
  const bpSeq: ModBlueprint = {
    ...bp,
    tasks: [
      { id: 'p', title: 'first', status: 'pending' },
      { id: 'q', title: 'second', status: 'pending', blockedBy: ['p'] },
    ],
  };
  ok('next_is_unblocked_first', nextActiveTask(bpSeq)?.id === 'p');
  const bpSeqDone: ModBlueprint = { ...bpSeq, tasks: [{ ...bpSeq.tasks[0], status: 'done' }, bpSeq.tasks[1]] };
  ok('next_advances_after_unblock', nextActiveTask(bpSeqDone)?.id === 'q');

  // ---- loopStopReason ----
  ok('stop_null_when_open', loopStopReason(bp, 0, 10) === null);
  ok('stop_complete_when_all_done', loopStopReason({ ...bp, tasks: [{ ...bp.tasks[0], status: 'done' }] }, 0, 10) === 'complete');
  ok('stop_max_iterations', loopStopReason(bp, 10, 10) === 'max-iterations');
  const bpStalled: ModBlueprint = { ...bp, tasks: [{ id: 'x', title: 'x', status: 'pending', blockedBy: ['missing'] }] };
  ok('stop_stalled_when_all_blocked', loopStopReason(bpStalled, 0, 10) === 'stalled');

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
