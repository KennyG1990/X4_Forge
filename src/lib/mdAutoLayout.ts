/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic graph auto-layout (53rd pass — UX grind, gap G11).
 *
 * Powers TIDY GRAPH. The old in-component layout didn't position control-flow `out_body`
 * chains (branch bodies stayed wherever they landed) and could overlap. This is a pure,
 * tested function instead: an indented-tree layout where every node gets its own row, so
 * no two nodes can overlap by construction, and depth → column gives clean left-to-right
 * structure (cue → conditions/actions → branch bodies indented → sub-cues indented).
 *
 * Comment frames are intentionally NOT moved (they're background grouping boxes).
 */

import type { MDNode, MDLink } from '../types';

export const LAYOUT = { COL_W: 320, ROW_H: 230, X0: 80, Y0: 80, NODE_W: 240, NODE_H: 200 };

export function computeAutoLayout(nodes: MDNode[], links: MDLink[]): Map<string, { x: number; y: number }> {
  const { COL_W, ROW_H, X0, Y0 } = LAYOUT;
  const pos = new Map<string, { x: number; y: number }>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const placeable = nodes.filter((n) => n.type !== 'comment');

  const outTargets = (id: string, port: string) =>
    links.filter((l) => l.sourceNodeId === id && l.sourcePortId === port).map((l) => l.targetNodeId);
  const firstOut = (id: string, port: string) => {
    const l = links.find((x) => x.sourceNodeId === id && x.sourcePortId === port);
    return l ? l.targetNodeId : undefined;
  };

  let row = 0;
  const seen = new Set<string>();
  const place = (id: string, col: number) => {
    if (seen.has(id) || !nodeById.has(id)) return;
    seen.add(id);
    pos.set(id, { x: X0 + col * COL_W, y: Y0 + row * ROW_H });
    row++;
  };

  const layoutActionChain = (startId: string | undefined, col: number) => {
    let cur = startId;
    const guard = new Set<string>();
    while (cur && !guard.has(cur) && !seen.has(cur)) {
      guard.add(cur);
      place(cur, col);
      const body = firstOut(cur, 'out_body'); // branch/loop body indents one column deeper
      if (body) layoutActionChain(body, col + 1);
      cur = firstOut(cur, 'out_next');
    }
  };

  const layoutCue = (cueId: string, col: number) => {
    if (seen.has(cueId)) return;
    place(cueId, col);
    for (const c of outTargets(cueId, 'out_cond')) place(c, col + 1);   // triggers/conditions
    for (const a of outTargets(cueId, 'out_act')) layoutActionChain(a, col + 1); // actions
    for (const s of outTargets(cueId, 'out_sub')) {                      // sub-cues, indented
      const n = nodeById.get(s);
      if (n && n.type === 'cue') layoutCue(s, col + 1);
    }
  };

  const cues = placeable.filter((n) => n.type === 'cue');
  const subTargets = new Set(links.filter((l) => l.sourcePortId === 'out_sub').map((l) => l.targetNodeId));
  for (const c of cues.filter((c) => !subTargets.has(c.id))) layoutCue(c.id, 0); // root cues first
  for (const c of cues) if (!seen.has(c.id)) layoutCue(c.id, 0);                  // any cue cycle remnants
  for (const f of placeable) if (!seen.has(f.id)) place(f.id, 0);                 // floating/orphan nodes

  return pos;
}

/* ============================================================================ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * ============================================================================ */
export function runAutoLayoutSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const N = (id: string, type: any, xmlTag: string): MDNode =>
    ({ id, type, xmlTag, properties: {}, label: id, x: 999, y: 999, propertiesSchema: [], inputs: [], outputs: [] } as any);
  const L = (s: string, sp: string, t: string): MDLink => ({ id: `${s}_${sp}_${t}`, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: 'in' });

  const nodes = [
    N('cue', 'cue', 'cue'),
    N('ev', 'event', 'event_game_started'),
    N('a1', 'action', 'set_value'),
    N('g', 'action', 'do_if'),
    N('b1', 'action', 'reward_player'),   // body of do_if
    N('a2', 'action', 'play_sound'),      // sibling after do_if
    N('sub', 'cue', 'cue'),               // sub-cue
    N('float', 'action', 'wait'),         // orphan
    N('cmt', 'comment', 'comment'),       // must NOT be moved
  ];
  const links = [
    L('cue', 'out_cond', 'ev'),
    L('cue', 'out_act', 'a1'),
    L('a1', 'out_next', 'g'),
    L('g', 'out_body', 'b1'),
    L('g', 'out_next', 'a2'),
    L('cue', 'out_sub', 'sub'),
  ];
  const pos = computeAutoLayout(nodes, links);
  const P = (id: string) => pos.get(id)!;

  // every non-comment node placed
  ok('all_placed', ['cue', 'ev', 'a1', 'g', 'b1', 'a2', 'sub', 'float'].every((id) => pos.has(id)), [...pos.keys()]);
  // comment NOT moved (not in the layout map)
  ok('comment_untouched', !pos.has('cmt'));

  // NO overlap between any two placed nodes
  const ids = [...pos.keys()];
  let overlap = false; let bad: any = null;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = P(ids[i]), b = P(ids[j]);
    if (Math.abs(a.x - b.x) < LAYOUT.NODE_W && Math.abs(a.y - b.y) < LAYOUT.NODE_H) { overlap = true; bad = [ids[i], ids[j]]; }
  }
  ok('no_overlap', !overlap, bad);

  // cue is the left-most of its own subtree
  ok('cue_leftmost', ['ev', 'a1', 'g', 'b1', 'a2', 'sub'].every((id) => P(id).x >= P('cue').x), null);
  // branch body is indented deeper (further right) than its container
  ok('body_indented', P('b1').x > P('g').x, { body: P('b1').x, container: P('g').x });
  // sub-cue indented deeper than parent
  ok('subcue_indented', P('sub').x > P('cue').x);
  // condition placed right of the cue
  ok('condition_right_of_cue', P('ev').x > P('cue').x);

  // deterministic: same input ⇒ same output
  const pos2 = computeAutoLayout(nodes, links);
  ok('deterministic', ids.every((id) => pos2.get(id)!.x === P(id).x && pos2.get(id)!.y === P(id).y));

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
