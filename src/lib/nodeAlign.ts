/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Selective node alignment + distribution — the UE5-Blueprint "align / straighten /
 * distribute" ergonomics that Forge lacked (TIDY GRAPH only does whole-graph auto-layout).
 *
 * Pure geometry over the selected nodes' positions: deterministic, no side effects.
 * The Canvas calls `computeAlignment` and applies the returned positions through the
 * normal workspace/undo path.
 */

export type AlignMode =
  | 'left' | 'right' | 'top' | 'bottom'
  | 'hcenter'        // align horizontal centers → a vertical column (same center-x)
  | 'vcenter'        // align vertical centers → a horizontal row (same center-y)
  | 'distribute-h'   // even horizontal spacing between centers
  | 'distribute-v';  // even vertical spacing between centers

export interface AlignNode { id: string; x: number; y: number; width?: number; height?: number; }

const DEFAULT_W = 240; // Forge node cards are w-60 (240px)
const DEFAULT_H = 120;
const w = (n: AlignNode) => (typeof n.width === 'number' && n.width > 0 ? n.width : DEFAULT_W);
const h = (n: AlignNode) => (typeof n.height === 'number' && n.height > 0 ? n.height : DEFAULT_H);
const r = (v: number) => Math.round(v);

/**
 * Compute new {x,y} for the selected nodes under an alignment/distribute mode.
 * Returns only the nodes that actually move. Needs ≥2 selected (≥3 for distribute).
 */
export function computeAlignment(
  nodes: AlignNode[],
  selectedIds: string[],
  mode: AlignMode
): Record<string, { x: number; y: number }> {
  const idset = new Set(selectedIds);
  const sel = (Array.isArray(nodes) ? nodes : []).filter((n) => n && idset.has(n.id));
  const out: Record<string, { x: number; y: number }> = {};
  if (sel.length < 2) return out;

  const put = (n: AlignNode, x: number, y: number) => {
    if (r(x) !== r(n.x) || r(y) !== r(n.y)) out[n.id] = { x: r(x), y: r(y) };
  };

  switch (mode) {
    case 'left': {
      const x = Math.min(...sel.map((n) => n.x));
      for (const n of sel) put(n, x, n.y);
      break;
    }
    case 'right': {
      const right = Math.max(...sel.map((n) => n.x + w(n)));
      for (const n of sel) put(n, right - w(n), n.y);
      break;
    }
    case 'top': {
      const y = Math.min(...sel.map((n) => n.y));
      for (const n of sel) put(n, n.x, y);
      break;
    }
    case 'bottom': {
      const bottom = Math.max(...sel.map((n) => n.y + h(n)));
      for (const n of sel) put(n, n.x, bottom - h(n));
      break;
    }
    case 'hcenter': {
      const cx = sel.reduce((s, n) => s + (n.x + w(n) / 2), 0) / sel.length;
      for (const n of sel) put(n, cx - w(n) / 2, n.y);
      break;
    }
    case 'vcenter': {
      const cy = sel.reduce((s, n) => s + (n.y + h(n) / 2), 0) / sel.length;
      for (const n of sel) put(n, n.x, cy - h(n) / 2);
      break;
    }
    case 'distribute-h': {
      if (sel.length < 3) return out;
      const sorted = [...sel].sort((a, b) => (a.x + w(a) / 2) - (b.x + w(b) / 2));
      const minC = sorted[0].x + w(sorted[0]) / 2;
      const maxC = sorted[sorted.length - 1].x + w(sorted[sorted.length - 1]) / 2;
      const step = (maxC - minC) / (sorted.length - 1);
      sorted.forEach((n, i) => put(n, (minC + step * i) - w(n) / 2, n.y));
      break;
    }
    case 'distribute-v': {
      if (sel.length < 3) return out;
      const sorted = [...sel].sort((a, b) => (a.y + h(a) / 2) - (b.y + h(b) / 2));
      const minC = sorted[0].y + h(sorted[0]) / 2;
      const maxC = sorted[sorted.length - 1].y + h(sorted[sorted.length - 1]) / 2;
      const step = (maxC - minC) / (sorted.length - 1);
      sorted.forEach((n, i) => put(n, n.x, (minC + step * i) - h(n) / 2));
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * ------------------------------------------------------------------ */
export function runNodeAlignSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const N = (id: string, x: number, y: number, width = 240, height = 100): AlignNode => ({ id, x, y, width, height });

  // three nodes at different x/y, equal size
  const ns = [N('a', 0, 0), N('b', 100, 50), N('c', 300, 200)];
  const ids = ['a', 'b', 'c'];

  // left: all share min x (0)
  const left = computeAlignment(ns, ids, 'left');
  ok('left_aligns_min_x', left['b']?.x === 0 && left['c']?.x === 0 && !left['a'], left);

  // right: all share max right edge (300+240=540) → x = 540-240 = 300
  const right = computeAlignment(ns, ids, 'right');
  ok('right_aligns_right_edge', right['a']?.x === 300 && right['b']?.x === 300 && !right['c'], right);

  // top: all share min y (0)
  const top = computeAlignment(ns, ids, 'top');
  ok('top_aligns_min_y', top['b']?.y === 0 && top['c']?.y === 0 && !top['a'], top);

  // bottom: max bottom = 200+100=300 → y = 300-100 = 200
  const bottom = computeAlignment(ns, ids, 'bottom');
  ok('bottom_aligns_bottom_edge', bottom['a']?.y === 200 && bottom['b']?.y === 200 && !bottom['c'], bottom);

  // hcenter: centers x = (120, 220, 420) avg = 253.33 → center; everyone shares same center-x
  const hc = computeAlignment(ns, ids, 'hcenter');
  const centersX = ns.map((n) => (hc[n.id]?.x ?? n.x) + 120);
  ok('hcenter_same_center_x', Math.max(...centersX) - Math.min(...centersX) <= 1, centersX);

  // distribute-h: 3 nodes → middle node's center evenly between first & last centers (120 & 420) = 270 → x=150
  const dh = computeAlignment(ns, ids, 'distribute-h');
  ok('distribute_h_even', dh['b']?.x === 150, dh);

  // distribute needs ≥3
  ok('distribute_needs_three', Object.keys(computeAlignment([N('a',0,0),N('b',100,0)], ['a','b'], 'distribute-h')).length === 0);

  // <2 selected → no-op
  ok('noop_single', Object.keys(computeAlignment(ns, ['a'], 'left')).length === 0);

  // only moves nodes that change (already-aligned node omitted)
  const already = computeAlignment([N('x', 5, 0), N('y', 5, 40)], ['x', 'y'], 'left');
  ok('omits_unmoved', Object.keys(already).length === 0, already);

  // unequal widths: right-align respects per-node width
  const uw = computeAlignment([N('p', 0, 0, 100, 50), N('q', 0, 100, 240, 50)], ['p', 'q'], 'right');
  // right edge = max(0+100, 0+240)=240 → p.x = 240-100 = 140, q.x stays 0
  ok('right_respects_width', uw['p']?.x === 140 && !uw['q'], uw);

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
