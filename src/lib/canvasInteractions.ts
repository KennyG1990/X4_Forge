/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * G14 — pure, testable rules behind the canvas interactions that previously had
 * only manual browser checks (link create, group-move, palette spawn). Extracting
 * them here gives a deterministic regression guard (runCanvasInteractionSelftest)
 * and a single source of truth the Canvas handlers consume. No React, no I/O.
 *
 * Port direction is by id convention — `out*` = output, `in*` = input — matching the
 * rest of the codebase (Port.type is 'flow'|'data'|'parent'|'child', not a direction).
 */

import type { MDNode, MDLink, Port } from '../types';

export type PortDir = 'out' | 'in' | 'unknown';

export function portDirection(portId: string): PortDir {
  const p = String(portId || '');
  if (p.startsWith('out')) return 'out';
  if (p.startsWith('in')) return 'in';
  return 'unknown';
}

export interface Endpoint { nodeId: string; portId: string; }

/**
 * Validate + orient a user-drawn connection between two clicked ports. A link is
 * only valid output→input; this returns it correctly oriented (source = the output
 * side, target = the input side) regardless of which port the user clicked first,
 * or `null` if the pair is invalid (same node, out↔out, in↔in, or an unknown port).
 * Fixes the latent reversed/invalid-link bug in the raw click handler.
 */
export function orientConnection(a: Endpoint, b: Endpoint): Omit<MDLink, 'id'> | null {
  if (!a || !b) return null;
  if (a.nodeId === b.nodeId) return null; // no self-links
  const da = portDirection(a.portId);
  const db = portDirection(b.portId);
  if (da === 'out' && db === 'in') {
    return { sourceNodeId: a.nodeId, sourcePortId: a.portId, targetNodeId: b.nodeId, targetPortId: b.portId };
  }
  if (da === 'in' && db === 'out') {
    return { sourceNodeId: b.nodeId, sourcePortId: b.portId, targetNodeId: a.nodeId, targetPortId: a.portId };
  }
  return null; // out↔out, in↔in, or unknown direction
}

/** True if an equivalent (oriented) link already exists — dedupe guard for link creation. */
export function linkExists(links: MDLink[], candidate: Omit<MDLink, 'id'>): boolean {
  return (links || []).some(l =>
    l.sourceNodeId === candidate.sourceNodeId && l.sourcePortId === candidate.sourcePortId &&
    l.targetNodeId === candidate.targetNodeId && l.targetPortId === candidate.targetPortId);
}

/**
 * Move the selected nodes by (dx, dy), clamped to the positive canvas quadrant.
 * Pure: returns a new array; non-selected nodes are returned unchanged (same ref).
 */
export function applyGroupMove(nodes: MDNode[], selectedIds: Set<string> | string[], dx: number, dy: number): MDNode[] {
  const sel = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return (nodes || []).map(n =>
    sel.has(n.id) ? { ...n, x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) } : n);
}

/**
 * Instantiate a node from a palette template at a grid position. Pure: clones the
 * template's `properties` (and port arrays) so the spawned node never shares mutable
 * state with the template, and stamps a unique id.
 */
export function nodeFromTemplate(template: MDNode, x: number, y: number, idSeed?: string): MDNode {
  const id = `node_${idSeed ?? `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`}`;
  return {
    ...template,
    id,
    x,
    y,
    properties: { ...(template.properties || {}) },
    inputs: [...(template.inputs || [])] as Port[],
    outputs: [...(template.outputs || [])] as Port[],
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic oracle. House shape: { allPassed, pass, passed, total, checks[] }.
 * ------------------------------------------------------------------ */
export function runCanvasInteractionSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // portDirection
  ok('portDir out', portDirection('out_act') === 'out');
  ok('portDir in', portDirection('in_cond') === 'in');
  ok('portDir unknown', portDirection('foo') === 'unknown');

  // orientConnection — valid out→in keeps orientation
  const a = { nodeId: 'cue1', portId: 'out_act' };
  const b = { nodeId: 'act1', portId: 'in_act' };
  const l1 = orientConnection(a, b);
  ok('orient out→in valid', !!l1 && l1.sourceNodeId === 'cue1' && l1.sourcePortId === 'out_act' && l1.targetNodeId === 'act1' && l1.targetPortId === 'in_act', JSON.stringify(l1));
  // clicked input-first → still oriented output→input (the bug fix)
  const l2 = orientConnection(b, a);
  ok('orient in→out re-oriented', !!l2 && l2.sourceNodeId === 'cue1' && l2.targetNodeId === 'act1', JSON.stringify(l2));
  // invalid pairings
  ok('reject out↔out', orientConnection(a, { nodeId: 'x', portId: 'out_next' }) === null);
  ok('reject in↔in', orientConnection(b, { nodeId: 'y', portId: 'in_flow' }) === null);
  ok('reject self-link', orientConnection(a, { nodeId: 'cue1', portId: 'in_act' }) === null);
  ok('reject unknown port', orientConnection(a, { nodeId: 'z', portId: 'weird' }) === null);

  // linkExists dedupe
  const existing: MDLink[] = [{ id: 'l', sourceNodeId: 'cue1', sourcePortId: 'out_act', targetNodeId: 'act1', targetPortId: 'in_act' }];
  ok('linkExists true for dup', linkExists(existing, l1!));
  ok('linkExists false for new', !linkExists(existing, { sourceNodeId: 'cue1', sourcePortId: 'out_cond', targetNodeId: 'ev1', targetPortId: 'in_cond' }));

  // applyGroupMove
  const nodes: MDNode[] = [
    { id: 'n1', type: 'action', label: 'a', xmlTag: 'play_sound', x: 10, y: 10, properties: {}, propertiesSchema: [], inputs: [], outputs: [] },
    { id: 'n2', type: 'action', label: 'b', xmlTag: 'reward_player', x: 5, y: 5, properties: {}, propertiesSchema: [], inputs: [], outputs: [] },
  ];
  const moved = applyGroupMove(nodes, ['n1'], 20, -5);
  ok('group-move moves selected', moved[0].x === 30 && moved[0].y === 5);
  ok('group-move leaves others (same ref)', moved[1] === nodes[1]);
  const clamped = applyGroupMove(nodes, ['n2'], -100, -100);
  ok('group-move clamps to ≥0', clamped[1].x === 0 && clamped[1].y === 0);

  // nodeFromTemplate
  const tpl: MDNode = { id: 'tpl', type: 'action', label: 'Reward', xmlTag: 'reward_player', x: 0, y: 0, properties: { money: '5000' }, propertiesSchema: [], inputs: [{ id: 'in_act', name: 'in', type: 'flow' }], outputs: [] };
  const spawned = nodeFromTemplate(tpl, 100, 200, 'seed');
  ok('spawn sets position', spawned.x === 100 && spawned.y === 200);
  ok('spawn unique id', spawned.id !== tpl.id && spawned.id.startsWith('node_'));
  ok('spawn clones properties (not shared)', spawned.properties !== tpl.properties && spawned.properties.money === '5000');
  spawned.properties.money = '1';
  ok('spawn property edit does not mutate template', tpl.properties.money === '5000');

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
