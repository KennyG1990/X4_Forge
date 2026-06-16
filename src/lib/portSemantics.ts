/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Port-semantics layer (50th pass).
 *
 * Forge's raw port `type` (flow|data|parent|child) is too coarse to express two things
 * the editor and simulator need:
 *   1. WHAT A PORT ACCEPTS — so the drag-off-pin quick-add (#2) can filter to genuinely
 *      compatible nodes without emptying the menu on flow-type drags.
 *   2. THAT A CONTROL-FLOW NODE HAS A BODY distinct from its NEXT sibling — so the
 *      simulator can gate do_if branches precisely instead of conservatively tainting
 *      everything downstream.
 *
 * This module adds a thin deterministic semantic layer over the existing port ids. It
 * changes no wire behavior on its own; consumers (quick-add filter, compiler, simulator)
 * opt in. It is strictly additive and backward-compatible.
 */

import type { MDNode, MDLink, Port } from '../types';

/** Semantic connection class. An output of slot X connects to an input of slot X. */
export type Slot = 'condition' | 'action' | 'cue';

export interface PortSemantic {
  direction: 'in' | 'out';
  /** For an input: the class it accepts. For an output: the class it connects to. */
  slot: Slot;
}

/**
 * The single source of truth mapping each known port id → its direction + slot.
 * Outputs are tagged with the slot of the inputs they legally connect to.
 */
export const PORT_SLOTS: Record<string, PortSemantic> = {
  // cue ports
  in_flow: { direction: 'in', slot: 'cue' },        // a cue's parent socket (target of out_sub)
  out_sub: { direction: 'out', slot: 'cue' },       // a cue's sub-cue socket → connects to in_flow
  out_cond: { direction: 'out', slot: 'condition' },// a cue's conditions socket → connects to in_cond
  out_act: { direction: 'out', slot: 'action' },    // a cue's actions socket → connects to in_act
  // condition / event ports
  in_cond: { direction: 'in', slot: 'condition' },  // a condition/event input
  out_flow: { direction: 'out', slot: 'action' },   // event/condition trigger flow → connects to in_act
  // action ports
  in_act: { direction: 'in', slot: 'action' },      // an action input
  out_next: { direction: 'out', slot: 'action' },   // action → next action
  out_body: { direction: 'out', slot: 'action' },   // control-flow BODY → first action inside the branch
};

/** Control-flow container tags that own a body (their actions nest inside the element). */
export const CONTAINER_TAGS = new Set<string>([
  'do_if', 'do_elseif', 'do_else', 'do_while', 'do_for_each', 'do_all',
]);

export function isContainerTag(tag: string | undefined | null): boolean {
  return !!tag && CONTAINER_TAGS.has(String(tag));
}

const slotOf = (portId: string): PortSemantic | undefined => PORT_SLOTS[portId];

/**
 * Can a wire drawn FROM `sourcePortId` (on some node) legally land on `targetNode`?
 * - source is an OUTPUT of slot X ⇒ target must expose an INPUT of slot X.
 * - source is an INPUT of slot X ⇒ target must expose an OUTPUT of slot X.
 * Unknown ports are permissive (return true) so we never over-filter on data we don't model.
 */
export function canConnect(sourcePortId: string, targetNode: Pick<MDNode, 'inputs' | 'outputs'>): boolean {
  const src = slotOf(sourcePortId);
  if (!src) return true; // unknown port id ⇒ don't block
  const ports: Port[] = src.direction === 'out' ? (targetNode.inputs || []) : (targetNode.outputs || []);
  const wantDir = src.direction === 'out' ? 'in' : 'out';
  return ports.some((p) => {
    const ps = slotOf(p.id);
    return ps && ps.direction === wantDir && ps.slot === src.slot;
  });
}

/** Filter a list of node templates to those a wire from `sourcePortId` can connect to. */
export function compatibleTemplates<T extends Pick<MDNode, 'inputs' | 'outputs'>>(
  sourcePortId: string,
  templates: T[],
): T[] {
  return templates.filter((t) => canConnect(sourcePortId, t));
}

/**
 * The action chain INSIDE a control-flow node's body: first node via out_body, then
 * following out_next. Cycle-safe. Empty when the node has no out_body wiring (legacy flat).
 */
export function bodyChainOf(nodeId: string, nodeById: Map<string, MDNode>, links: MDLink[]): MDNode[] {
  const out: MDNode[] = [];
  const first = links.find((l) => l.sourceNodeId === nodeId && l.sourcePortId === 'out_body');
  if (!first) return out;
  let cur = nodeById.get(first.targetNodeId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    const next = links.find((l) => l.sourceNodeId === cur!.id && l.sourcePortId === 'out_next');
    cur = next ? nodeById.get(next.targetNodeId) : undefined;
  }
  return out;
}

/** True if the node has a wired body (⇒ precise gating is possible for it). */
export function hasBody(nodeId: string, links: MDLink[]): boolean {
  return links.some((l) => l.sourceNodeId === nodeId && l.sourcePortId === 'out_body');
}

/* ============================================================================ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * ============================================================================ */
export function runPortSemanticsSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const mk = (inIds: string[], outIds: string[]): Pick<MDNode, 'inputs' | 'outputs'> => ({
    inputs: inIds.map((id) => ({ id, name: id, type: 'child' as const })),
    outputs: outIds.map((id) => ({ id, name: id, type: 'flow' as const })),
  });
  const actionNode = mk(['in_act'], ['out_next']);
  const containerNode = mk(['in_act'], ['out_next', 'out_body']);
  const eventNode = mk(['in_cond'], ['out_flow']);
  const conditionNode = mk(['in_cond'], ['out_flow']);
  const cueNode = mk(['in_flow'], ['out_cond', 'out_act', 'out_sub']);

  // ---- output → input slot matching ----
  ok('out_next→action_ok', canConnect('out_next', actionNode) === true);
  ok('out_next→container_ok', canConnect('out_next', containerNode) === true);
  ok('out_next→event_no', canConnect('out_next', eventNode) === false);
  ok('out_next→cue_no', canConnect('out_next', cueNode) === false);
  ok('out_act→action_ok', canConnect('out_act', actionNode) === true);
  ok('out_cond→event_ok', canConnect('out_cond', eventNode) === true);
  ok('out_cond→condition_ok', canConnect('out_cond', conditionNode) === true);
  ok('out_cond→action_no', canConnect('out_cond', actionNode) === false);
  ok('out_sub→cue_ok', canConnect('out_sub', cueNode) === true);
  ok('out_sub→action_no', canConnect('out_sub', actionNode) === false);
  ok('out_flow→action_ok', canConnect('out_flow', actionNode) === true);
  ok('out_body→action_ok', canConnect('out_body', actionNode) === true);

  // ---- input-source drag (dragging from an input pin) ----
  ok('in_act←action_out', canConnect('in_act', actionNode) === true); // action has out_next (action slot)
  // in_cond is slot 'condition'; the producer of a 'condition' slot is a cue's out_cond — NOT an
  // event's out_flow (which is slot 'action'). So in_cond matches the cue, not the event.
  ok('in_cond←cue_out', canConnect('in_cond', cueNode) === true);    // cue has out_cond (condition slot)
  ok('in_cond←event_no', canConnect('in_cond', eventNode) === false);
  ok('in_flow←cue_out', canConnect('in_flow', cueNode) === true);    // cue has out_sub (cue slot)

  // ---- the regression guard: flow-type drag must NOT empty the menu ----
  const templates = [actionNode, containerNode, eventNode, cueNode];
  ok('flow_drag_not_empty', compatibleTemplates('out_next', templates).length === 2, compatibleTemplates('out_next', templates).length);
  ok('cond_drag_filters', compatibleTemplates('out_cond', templates).length === 1);
  ok('sub_drag_filters', compatibleTemplates('out_sub', templates).length === 1);

  // ---- unknown port id is permissive ----
  ok('unknown_port_permissive', canConnect('out_mystery', actionNode) === true);

  // ---- container detection ----
  ok('container_do_if', isContainerTag('do_if') === true);
  ok('container_do_while', isContainerTag('do_while') === true);
  ok('container_not_reward', isContainerTag('reward_player') === false);

  // ---- bodyChainOf walks out_body → out_next ----
  {
    const N = (id: string, xmlTag: string): MDNode => ({ id, type: 'action', xmlTag, properties: {}, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] } as any);
    const nodes = [N('g', 'do_if'), N('b1', 'set_value'), N('b2', 'reward_player'), N('s', 'play_sound')];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: MDLink[] = [
      { id: 'l1', sourceNodeId: 'g', sourcePortId: 'out_body', targetNodeId: 'b1', targetPortId: 'in_act' },
      { id: 'l2', sourceNodeId: 'b1', sourcePortId: 'out_next', targetNodeId: 'b2', targetPortId: 'in_act' },
      { id: 'l3', sourceNodeId: 'g', sourcePortId: 'out_next', targetNodeId: 's', targetPortId: 'in_act' }, // sibling, NOT body
    ];
    const body = bodyChainOf('g', byId, links).map((n) => n.id).join(',');
    ok('body_chain_excludes_sibling', body === 'b1,b2', body);
    ok('has_body_true', hasBody('g', links) === true);
    ok('has_body_false', hasBody('s', links) === false);
  }

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
