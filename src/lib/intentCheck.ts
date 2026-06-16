/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A4.9 — Intent-satisfaction checker. Closes the "valid-but-wrong" gap Codex
 * flagged: a workspace can be XSD-legal yet not do what the user asked (e.g.
 * "on game start, show help" compiling fine while the game-start trigger was
 * silently dropped). This decomposes the request into structured requirements,
 * each compiled to a DETERMINISTIC graph-pattern assertion. Requirements that
 * can't be reduced to a pattern are reported as 'not-verified' (AI-claimed),
 * never as satisfied — so a green Schema/Graph can never masquerade as "did
 * what you asked". Pure (no I/O); the shared basis for the review Intent verdict
 * and the Architect per-step done-checks.
 */
import { ModWorkspace } from '../types';

export type IntentCheckSpec =
  | { kind: 'nodePresent'; xmlTag: string }
  | { kind: 'nodePropPositive'; xmlTag: string; prop: string }
  | { kind: 'triggerWired'; xmlTag: string }
  | { kind: 'actionInChain'; xmlTag: string }
  | { kind: 'manual' };

export interface IntentRequirement {
  id: string;
  label: string;
  check: IntentCheckSpec;
}

export interface IntentRequirementResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'not-verified';
  detail?: string;
}

export interface IntentReport {
  results: IntentRequirementResult[];
  verdict: { status: 'pass' | 'warn' | 'fail' | 'not-checked'; errors: number; warnings: number; detail?: string };
}

function nodesByTag(ws: ModWorkspace, tag: string): any[] {
  return ((ws?.nodes || []) as any[]).filter(n => String(n?.xmlTag ?? '') === tag);
}

/** Event node-ids wired into a cue's condition port (cue.out_cond → event). */
function cueWiredEventIds(ws: ModWorkspace): Set<string> {
  const ids = new Set<string>();
  const cueIds = new Set(((ws?.nodes || []) as any[]).filter(n => n?.type === 'cue').map(n => n.id));
  for (const l of ((ws as any)?.links || [])) {
    if (cueIds.has(l.sourceNodeId) && l.sourcePortId === 'out_cond') ids.add(l.targetNodeId);
  }
  return ids;
}

/** Action node-ids reachable from a cue's action chain (cue.out_act → … out_next →). */
function cueChainActionIds(ws: ModWorkspace): Set<string> {
  const ids = new Set<string>();
  const links = ((ws as any)?.links || []);
  const cueIds = ((ws?.nodes || []) as any[]).filter(n => n?.type === 'cue').map(n => n.id);
  for (const cue of cueIds) {
    const queue = links.filter((l: any) => l.sourceNodeId === cue && l.sourcePortId === 'out_act').map((l: any) => l.targetNodeId);
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      ids.add(id);
      for (const l of links) if (l.sourceNodeId === id && l.sourcePortId === 'out_next') queue.push(l.targetNodeId);
    }
  }
  return ids;
}

/** Run the deterministic requirement assertions against a workspace. */
export function checkIntent(ws: ModWorkspace, requirements: IntentRequirement[]): IntentReport {
  const reqs = Array.isArray(requirements) ? requirements : [];
  const wiredEvents = cueWiredEventIds(ws);
  const chainActions = cueChainActionIds(ws);

  const results: IntentRequirementResult[] = reqs.map(r => {
    const c = r.check;
    let status: 'pass' | 'fail' | 'not-verified' = 'not-verified';
    let detail: string | undefined;
    switch (c?.kind) {
      case 'manual':
        status = 'not-verified';
        detail = 'No deterministic check — AI-claimed only.';
        break;
      case 'nodePresent':
        status = nodesByTag(ws, c.xmlTag).length > 0 ? 'pass' : 'fail';
        break;
      case 'nodePropPositive': {
        const ok = nodesByTag(ws, c.xmlTag).some(n => {
          const v = String(n?.properties?.[c.prop] ?? '').trim();
          if (v === '') return false;
          const num = parseFloat(v);
          return isNaN(num) ? true : num > 0;
        });
        status = ok ? 'pass' : 'fail';
        break;
      }
      case 'triggerWired':
        status = nodesByTag(ws, c.xmlTag).some(n => wiredEvents.has(n.id)) ? 'pass' : 'fail';
        break;
      case 'actionInChain':
        status = nodesByTag(ws, c.xmlTag).some(n => chainActions.has(n.id)) ? 'pass' : 'fail';
        break;
      default:
        status = 'not-verified';
        detail = 'Unknown requirement kind — treated as unverifiable.';
    }
    return { id: r.id, label: r.label, status, detail };
  });

  const checkable = results.filter(r => r.status !== 'not-verified');
  const failed = checkable.filter(r => r.status === 'fail').length;
  const notVerified = results.filter(r => r.status === 'not-verified').length;

  let verdict: IntentReport['verdict'];
  if (reqs.length === 0) {
    verdict = { status: 'not-checked', errors: 0, warnings: 0, detail: 'No requirements supplied — intent not verified.' };
  } else if (failed > 0) {
    verdict = { status: 'fail', errors: failed, warnings: notVerified, detail: `${failed} required pattern(s) missing.` };
  } else if (checkable.length > 0) {
    verdict = { status: notVerified > 0 ? 'warn' : 'pass', errors: 0, warnings: notVerified };
  } else {
    verdict = { status: 'not-checked', errors: 0, warnings: notVerified, detail: 'All requirements are AI-claimed; none machine-verifiable.' };
  }
  return { results, verdict };
}

// ---------------------------------------------------------------------------
// Deterministic oracle (synthetic fixtures; no disk/AI/key).
// ---------------------------------------------------------------------------
function mkNode(id: string, type: string, xmlTag: string, props: Record<string, any> = {}): any {
  return { id, type, label: id, xmlTag, x: 0, y: 0, properties: props };
}
function mkWs(nodes: any[], links: any[] = []): ModWorkspace {
  return { id: 'ic', name: 'IntentSelftest', version: '1.0.0', author: 'oracle', description: '', nodes, links, uiWidgets: [], uiTheme: {} as any, templates: [] } as any;
}

export function runIntentCheckSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const expect = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // Satisfied workspace: cue ← event_game_started (wired), cue → show_help (action chain).
  const good = mkWs(
    [mkNode('cue_0', 'cue', 'cue', { name: 'Start' }), mkNode('ev_0', 'event', 'event_game_started', {}), mkNode('act_0', 'action', 'show_help', { text: 'Welcome' })],
    [
      { id: 'l1', sourceNodeId: 'cue_0', sourcePortId: 'out_cond', targetNodeId: 'ev_0', targetPortId: 'in_cond' },
      { id: 'l2', sourceNodeId: 'cue_0', sourcePortId: 'out_act', targetNodeId: 'act_0', targetPortId: 'in_act' },
    ],
  );
  const reqs: IntentRequirement[] = [
    { id: 'r1', label: 'Trigger on game start', check: { kind: 'triggerWired', xmlTag: 'event_game_started' } },
    { id: 'r2', label: 'Show a help message', check: { kind: 'actionInChain', xmlTag: 'show_help' } },
    { id: 'r3', label: 'Reward the player', check: { kind: 'nodePresent', xmlTag: 'reward_player' } }, // absent → fail
    { id: 'r4', label: 'Feels fun', check: { kind: 'manual' } }, // not-verifiable
  ];
  const gr = checkIntent(good, reqs);
  const byId = (id: string) => gr.results.find(r => r.id === id)?.status;
  expect('triggerWired pass', byId('r1') === 'pass', byId('r1'));
  expect('actionInChain pass', byId('r2') === 'pass', byId('r2'));
  expect('absent node → fail', byId('r3') === 'fail', byId('r3'));
  expect('manual → not-verified', byId('r4') === 'not-verified', byId('r4'));
  expect('overall verdict fail (1 missing)', gr.verdict.status === 'fail' && gr.verdict.errors === 1, JSON.stringify(gr.verdict));
  expect('manual counted as warning', gr.verdict.warnings === 1, JSON.stringify(gr.verdict));

  // CODEX SCENARIO: "on game start, show help" but the game-start trigger was dropped.
  // show_help present + wired, but no event_game_started → trigger requirement FAILS,
  // even though such a workspace is otherwise XSD-legal.
  const missingTrigger = mkWs(
    [mkNode('cue_0', 'cue', 'cue', { name: 'Start' }), mkNode('act_0', 'action', 'show_help', { text: 'Welcome' })],
    [{ id: 'l2', sourceNodeId: 'cue_0', sourcePortId: 'out_act', targetNodeId: 'act_0', targetPortId: 'in_act' }],
  );
  const mr = checkIntent(missingTrigger, [reqs[0], reqs[1]]);
  expect('Codex: missing game-start trigger → FAIL', mr.results.find(r => r.id === 'r1')?.status === 'fail', JSON.stringify(mr.results));
  expect('Codex: show_help still passes', mr.results.find(r => r.id === 'r2')?.status === 'pass');
  expect('Codex: overall intent FAIL', mr.verdict.status === 'fail');

  // All-satisfied case → pass.
  const ar = checkIntent(good, [reqs[0], reqs[1]]);
  expect('all checkable pass → pass', ar.verdict.status === 'pass' && ar.verdict.errors === 0, JSON.stringify(ar.verdict));

  // No requirements → not-checked (honest stub behavior).
  expect('no requirements → not-checked', checkIntent(good, []).verdict.status === 'not-checked');

  // nodePropPositive: reward_player with money>0 passes; money=0 fails.
  const rewardOk = mkWs([mkNode('a', 'action', 'reward_player', { money: '5000' })]);
  const rewardBad = mkWs([mkNode('a', 'action', 'reward_player', { money: '0' })]);
  expect('reward money>0 → pass', checkIntent(rewardOk, [{ id: 'x', label: 'reward', check: { kind: 'nodePropPositive', xmlTag: 'reward_player', prop: 'money' } }]).results[0].status === 'pass');
  expect('reward money=0 → fail', checkIntent(rewardBad, [{ id: 'x', label: 'reward', check: { kind: 'nodePropPositive', xmlTag: 'reward_player', prop: 'money' } }]).results[0].status === 'fail');

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
