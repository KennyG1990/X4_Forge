/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LIVE canvas telemetry — the "Play-In-Editor-adjacent" layer (2026-07-09).
 *
 * UE5's defining loop is edit → Play → SEE it. X4 can't host an editor, but the debug
 * log is a live stream of which MD cues actually fire/error while the game runs. This
 * engine maps the log watcher's per-cue telemetry (logTelemetry.parseLogTelemetry)
 * onto the CANVAS NODES the user is looking at, so a running game lights the graph up:
 * green ▶ hit-count badges on firing cues, red ✗ badges on erroring ones — in the
 * editor, on the exact nodes, while playing.
 *
 * Pure mapping (no I/O): workspace nodes + CueTelemetry[] → per-node badges.
 * The polling endpoint and the Canvas LIVE toggle live in server.ts / Canvas.tsx.
 */

import type { CueTelemetry } from './logTelemetry';

export interface LiveNodeBadge {
  nodeId: string;
  cueName: string;
  hits: number;
  errors: number;
  state: 'firing' | 'erroring';
  lastLineNo: number;
}

interface NodeLike {
  id: string;
  type: string;
  properties?: Record<string, unknown>;
}

/**
 * Map per-cue log telemetry onto cue nodes by name (case-insensitive — X4's log casing
 * follows the script, but hand-authored references drift). Only cue nodes get badges;
 * a cue with errors>0 is `erroring` regardless of hits (errors are the louder truth).
 */
export function mapTelemetryToNodes(nodes: NodeLike[], cues: CueTelemetry[]): LiveNodeBadge[] {
  const out: LiveNodeBadge[] = [];
  if (!Array.isArray(nodes) || !Array.isArray(cues) || !cues.length) return out;
  const byName = new Map<string, CueTelemetry>();
  for (const c of cues) {
    if (c && c.name) byName.set(String(c.name).toLowerCase(), c);
  }
  for (const node of nodes) {
    if (!node || node.type !== 'cue') continue;
    const name = String(node.properties?.name ?? '').trim();
    if (!name) continue;
    const t = byName.get(name.toLowerCase());
    if (!t || (t.hits <= 0 && t.errors <= 0)) continue;
    out.push({
      nodeId: node.id,
      cueName: name,
      hits: t.hits,
      errors: t.errors,
      state: t.errors > 0 ? 'erroring' : 'firing',
      lastLineNo: t.lastLineNo,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runLiveCanvasTelemetrySelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  const nodes: NodeLike[] = [
    { id: 'n1', type: 'cue', properties: { name: 'On_action' } },
    { id: 'n2', type: 'cue', properties: { name: 'Poll_tick' } },
    { id: 'n3', type: 'action', properties: { name: 'On_action' } }, // non-cue, same name
    { id: 'n4', type: 'cue', properties: { name: 'Silent_cue' } },
    { id: 'n5', type: 'cue', properties: {} },                        // unnamed
    { id: 'n6', type: 'cue', properties: { name: 'on_ACTION' } },     // case-drifted duplicate name
  ];
  const cues: CueTelemetry[] = [
    { name: 'On_action', hits: 6, errors: 0, warnings: 0, lastLineNo: 120 },
    { name: 'Poll_tick', hits: 40, errors: 2, warnings: 1, lastLineNo: 300 },
    { name: 'Unrelated', hits: 3, errors: 0, warnings: 0, lastLineNo: 10 },
    { name: 'Zeroed', hits: 0, errors: 0, warnings: 0, lastLineNo: 0 },
  ];
  const badges = mapTelemetryToNodes(nodes, cues);
  const by = (id: string) => badges.find(b => b.nodeId === id);

  ok('firing cue gets a green badge with hit count', by('n1')?.state === 'firing' && by('n1')?.hits === 6, JSON.stringify(by('n1')));
  ok('erroring cue is erroring even with hits', by('n2')?.state === 'erroring' && by('n2')?.errors === 2);
  ok('non-cue node with a matching name is NOT badged', by('n3') === undefined);
  ok('silent cue (no log presence) is NOT badged (silence is not a fault)', by('n4') === undefined);
  ok('unnamed cue skipped', by('n5') === undefined);
  ok('case-insensitive name match badges the drifted duplicate too', by('n6')?.hits === 6, JSON.stringify(by('n6')));
  ok('zero-activity telemetry produces no badge', badges.every(b => b.hits > 0 || b.errors > 0));
  ok('exactly the expected badges', badges.length === 3, JSON.stringify(badges.map(b => b.nodeId)));

  ok('degrades on empty nodes', mapTelemetryToNodes([], cues).length === 0);
  ok('degrades on empty telemetry', mapTelemetryToNodes(nodes, []).length === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
