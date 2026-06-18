/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A4.0 contextual verbs (deterministic, no AI): "Find missing trigger" and
 * "Suggest fix". These complement `mdCritic` (which flags ref-mismatch / one-way
 * writes / unguarded risk) by detecting the two structural mistakes it doesn't:
 *   - a cue with NO wired trigger (it will never fire), and
 *   - an orphaned non-cue node (nothing points at it, so it never runs).
 * Each finding carries a plain-language, deterministic fix suggestion. Pure; no I/O.
 */

import type { MDNode, MDLink } from '../types';
import { triggerNodesOf } from './mdExplain';

export interface MissingTrigger { cueId: string; cueLabel: string; }

export interface FixSuggestion {
  /** node the suggestion attaches to */
  nodeId: string;
  nodeLabel: string;
  code: 'missing_trigger' | 'orphan_node';
  severity: 'warning' | 'info';
  /** what's wrong (deterministic) */
  issue: string;
  /** the concrete, deterministic remedy */
  suggestion: string;
}

function labelOf(n: MDNode): string {
  return (n.properties?.name && String(n.properties.name).trim()) || n.label || n.id;
}

/**
 * Cues with no wired trigger (no `out_cond` edge to an event/condition). Such a cue
 * never fires — except a sub-cue driven by a parent `out_sub`, which is legitimately
 * trigger-less, so those are excluded.
 */
export function findMissingTriggers(nodes: MDNode[], links: MDLink[]): MissingTrigger[] {
  nodes = Array.isArray(nodes) ? nodes : [];
  links = Array.isArray(links) ? links : [];
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const subTargets = new Set(links.filter(l => l.sourcePortId === 'out_sub').map(l => l.targetNodeId));
  const out: MissingTrigger[] = [];
  for (const cue of nodes.filter(n => n.type === 'cue')) {
    if (subTargets.has(cue.id)) continue; // sub-cue: parent drives it, no own trigger needed
    if (triggerNodesOf(cue.id, nodeById, links).length === 0) {
      out.push({ cueId: cue.id, cueLabel: labelOf(cue) });
    }
  }
  return out;
}

/** Deterministic fix suggestions for the two structural gaps mdCritic doesn't cover. */
export function suggestFixes(nodes: MDNode[], links: MDLink[]): FixSuggestion[] {
  nodes = Array.isArray(nodes) ? nodes : [];
  links = Array.isArray(links) ? links : [];
  const fixes: FixSuggestion[] = [];

  for (const mt of findMissingTriggers(nodes, links)) {
    fixes.push({
      nodeId: mt.cueId,
      nodeLabel: mt.cueLabel,
      code: 'missing_trigger',
      severity: 'warning',
      issue: `Cue "${mt.cueLabel}" has no trigger wired, so it will never fire.`,
      suggestion: `Wire an event (e.g. event_game_started or event_object_changed_sector) into this cue's CONDITIONS port.`,
    });
  }

  // Orphaned non-cue nodes: nothing points at them (no incoming link), so they never run.
  const hasIncoming = new Set(links.map(l => l.targetNodeId));
  for (const n of nodes) {
    if (n.type === 'cue') continue;
    if (!hasIncoming.has(n.id)) {
      fixes.push({
        nodeId: n.id,
        nodeLabel: labelOf(n),
        code: 'orphan_node',
        severity: 'info',
        issue: `"${labelOf(n)}" (<${n.xmlTag}>) is not connected to anything, so it never runs.`,
        suggestion: n.type === 'action'
          ? `Link it into a cue's ACTIONS chain (cue out_act → this node's in_act), or remove it.`
          : `Wire it into a cue (a condition/event belongs on a cue's CONDITIONS port), or remove it.`,
      });
    }
  }

  return fixes;
}

/* ------------------------------------------------------------------ *
 * Deterministic oracle. House shape: { allPassed, pass, passed, total, checks[] }.
 * ------------------------------------------------------------------ */
export function runModFixesSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });
  const N = (id: string, type: any, xmlTag: string, properties: any = {}): MDNode =>
    ({ id, type, xmlTag, properties, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] } as any);
  const L = (id: string, s: string, sp: string, t: string, tp = 'in'): MDLink =>
    ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

  // A cue with a wired trigger + an action chain — no issues.
  const goodNodes = [N('c1', 'cue', 'cue', { name: 'Good' }), N('ev', 'event', 'event_game_started'), N('a1', 'action', 'reward_player', { money: '5000' })];
  const goodLinks = [L('l1', 'c1', 'out_cond', 'ev', 'in_cond'), L('l2', 'c1', 'out_act', 'a1', 'in_act')];
  ok('no missing trigger on wired cue', findMissingTriggers(goodNodes, goodLinks).length === 0);
  ok('no fixes on a clean graph', suggestFixes(goodNodes, goodLinks).length === 0, JSON.stringify(suggestFixes(goodNodes, goodLinks)));

  // A cue with NO trigger → missing_trigger.
  const noTrig = [N('c2', 'cue', 'cue', { name: 'NoTrigger' }), N('a2', 'action', 'play_sound', { sound: 'beep' })];
  const noTrigLinks = [L('l3', 'c2', 'out_act', 'a2', 'in_act')];
  const mt = findMissingTriggers(noTrig, noTrigLinks);
  ok('missing trigger detected', mt.length === 1 && mt[0].cueId === 'c2', JSON.stringify(mt));
  const noTrigFixes = suggestFixes(noTrig, noTrigLinks);
  ok('missing_trigger fix suggested', noTrigFixes.some(f => f.code === 'missing_trigger' && f.nodeId === 'c2' && /CONDITIONS/.test(f.suggestion)), JSON.stringify(noTrigFixes));

  // A sub-cue (driven by parent out_sub) is NOT flagged as missing-trigger.
  const subNodes = [N('p', 'cue', 'cue', { name: 'Parent' }), N('pe', 'event', 'event_game_started'), N('s', 'cue', 'cue', { name: 'Child' })];
  const subLinks = [L('x1', 'p', 'out_cond', 'pe', 'in_cond'), L('x2', 'p', 'out_sub', 's', 'in_flow')];
  ok('sub-cue not flagged missing-trigger', findMissingTriggers(subNodes, subLinks).length === 0, JSON.stringify(findMissingTriggers(subNodes, subLinks)));

  // An orphan action (nothing points at it) → orphan_node.
  const orphanNodes = [N('c3', 'cue', 'cue', { name: 'C' }), N('ev3', 'event', 'event_game_started'), N('lonely', 'action', 'play_sound', { sound: 'x' })];
  const orphanLinks = [L('o1', 'c3', 'out_cond', 'ev3', 'in_cond')];
  const oFixes = suggestFixes(orphanNodes, orphanLinks);
  ok('orphan action flagged', oFixes.some(f => f.code === 'orphan_node' && f.nodeId === 'lonely'), JSON.stringify(oFixes));
  ok('orphan action fix mentions action chain', oFixes.some(f => f.code === 'orphan_node' && /ACTIONS chain/.test(f.suggestion)));
  // a wired action is NOT an orphan
  ok('wired action not orphan', !suggestFixes(goodNodes, goodLinks).some(f => f.nodeId === 'a1'));

  // empty graph degrades safely
  ok('empty graph → no fixes', suggestFixes([], []).length === 0 && findMissingTriggers([], []).length === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
