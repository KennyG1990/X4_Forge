/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Determinism Doctrine — Phase 3: the deterministic critic.
 *
 * A small, named lint library over the semantics registry. It replaces the AI
 * "Playtester Guidance" speculation with rules that are deterministic and
 * false-positive-free *by construction* — every finding is a fact the rule can
 * justify from the graph + registry, never a guess.
 *
 * Rules:
 *   (a) ref_mismatch       — a cue's trigger object and an action object are NOT
 *                            equivalent. Crucially SUPPRESSED when `areEquivalentRefs`
 *                            is true: this is the exact case the AI false-positived on
 *                            (`playership` vs `player.primaryship`). The oracle proves
 *                            the non-flag.
 *   (b) oneway_no_restore  — an action with a "does not restore" registry note whose
 *                            written state key is never restored later in the cue
 *                            (the deterministic "no shield recharge").
 *   (c) unguarded_high_risk— a spawn/economy/irreversible action in a cue triggered by
 *                            a frequently-firing event, with no guard (condition or do_if).
 *
 * Reuses the explainer's canonical graph-walk (`triggerNodesOf`/`actionChainOf`) and the
 * registry (`areEquivalentRefs`/`semanticsForNode`) — one module per capability.
 */

import type { MDNode, MDLink } from '../types';
import { areEquivalentRefs, semanticsForNode } from './mdSemantics';
import { triggerNodesOf, actionChainOf } from './mdExplain';

export type CriticSeverity = 'info' | 'warning';
export type CriticCode = 'ref_mismatch' | 'oneway_no_restore' | 'unguarded_high_risk';

export interface CriticFinding {
  severity: CriticSeverity;
  code: CriticCode;
  cueId: string;
  cueName: string;
  nodeId?: string;
  message: string;
}
export interface CriticResult {
  findings: CriticFinding[];
  /** Counts by code, for quick UI/summary. */
  summary: Record<string, number>;
}

/** Events that fire often enough that an unconditional high-risk action is worth a note. */
const FREQUENT_EVENTS = new Set<string>([
  'event_object_changed_sector',
  'event_player_money_changed',
  'event_object_attacked',
]);

const GUARD_CONDITION_TAGS = new Set<string>(['check_value', 'custom_condition']);

/** The primary object reference of a node's top-level `object` attribute, or null. */
function primaryObjectRef(node: MDNode): string | null {
  const v = node?.properties?.object;
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Variables/expressions/literals are not static object references we can compare.
  if (s.startsWith('$') || s.startsWith('{') || /^-?\d/.test(s)) return null;
  if (!/^[a-zA-Z_][\w.]*$/.test(s)) return null;
  return s;
}

function cueNameOf(cue: MDNode): string {
  return (cue.properties?.name && String(cue.properties.name).trim()) || cue.label || cue.id;
}

export function critiqueWorkspace(nodes: MDNode[], links: MDLink[]): CriticResult {
  nodes = Array.isArray(nodes) ? nodes.filter((n) => n && n.includeInBuild !== false) : [];
  links = Array.isArray(links) ? links : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const cues = nodes.filter((n) => n.type === 'cue');
  const findings: CriticFinding[] = [];

  for (const cue of cues) {
    const cueName = cueNameOf(cue);
    const triggers = triggerNodesOf(cue.id, nodeById, links);
    const actions = actionChainOf(cue.id, nodeById, links);

    // --- (a) ref_mismatch — suppressed when equivalent (the anti-false-positive) ---
    const triggerObj = triggers.map(primaryObjectRef).find((r): r is string => !!r);
    if (triggerObj) {
      for (const a of actions) {
        const ao = primaryObjectRef(a);
        if (ao && !areEquivalentRefs(triggerObj, ao)) {
          findings.push({
            severity: 'info', code: 'ref_mismatch', cueId: cue.id, cueName, nodeId: a.id,
            message: `Cue "${cueName}" triggers on "${triggerObj}" but action <${a.xmlTag}> targets "${ao}". These are not known to be the same entity — confirm it's intended.`,
          });
        }
        // equivalent refs (e.g. playership ≡ player.primaryship) are intentionally NOT flagged.
      }
    }

    // --- (b) oneway_no_restore ---
    // Count writes per state key across the cue's actions. A one-way-write action is
    // only flagged when the cue touches that key EXACTLY ONCE — if the key is written
    // more than once we assume a deliberate drop+restore pair and stay silent (this
    // also prevents flagging the restoring action itself).
    const writeCounts: Record<string, number> = {};
    for (const a of actions) for (const w of semanticsForNode(a).writes) writeCounts[w] = (writeCounts[w] || 0) + 1;
    for (const a of actions) {
      const sem = semanticsForNode(a);
      const isOneWay = !!sem.note && /does not restore/i.test(sem.note);
      if (isOneWay && sem.writes.length > 0) {
        const key = sem.writes[0];
        if ((writeCounts[key] || 0) <= 1) {
          findings.push({
            severity: 'warning', code: 'oneway_no_restore', cueId: cue.id, cueName, nodeId: a.id,
            message: `Cue "${cueName}": <${a.xmlTag}> performs a one-way write to ${key} and nothing else in the cue restores it. If the change is meant to be temporary, add a restore step.`,
          });
        }
      }
    }

    // --- (c) unguarded_high_risk on a frequent trigger ---
    const frequentTrigger = triggers.find((t) => FREQUENT_EVENTS.has(t.xmlTag));
    const hasGuard = triggers.some((t) => GUARD_CONDITION_TAGS.has(t.xmlTag))
      || actions.some((a) => a.xmlTag === 'do_if' || a.xmlTag === 'do_while');
    if (frequentTrigger && !hasGuard) {
      for (const a of actions) {
        const risk = semanticsForNode(a).risk;
        if (risk === 'spawn' || risk === 'economy' || risk === 'irreversible') {
          findings.push({
            severity: 'info', code: 'unguarded_high_risk', cueId: cue.id, cueName, nodeId: a.id,
            message: `Cue "${cueName}": <${a.xmlTag}> (${risk}) runs unconditionally on a frequently-firing trigger (<${frequentTrigger.xmlTag}>). Consider a condition/guard so it doesn't fire more often than intended.`,
          });
        }
      }
    }
  }

  const summary: Record<string, number> = {};
  for (const f of findings) summary[f.code] = (summary[f.code] || 0) + 1;
  return { findings, summary };
}

/* ------------------------------------------------------------------ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * Proves each rule fires on a positive AND, for the headline rule, that equivalent
 * references are NOT flagged (the deterministic fix for the AI's false positive).
 * ------------------------------------------------------------------ */
export function runCriticSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const N = (id: string, type: any, xmlTag: string, properties: any = {}): MDNode =>
    ({ id, type, xmlTag, properties, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] } as any);
  const L = (id: string, s: string, sp: string, t: string, tp = 'in'): MDLink =>
    ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });
  const has = (r: CriticResult, code: string, nodeId?: string) =>
    r.findings.some((f) => f.code === code && (nodeId ? f.nodeId === nodeId : true));

  // ---- (a) ref_mismatch: equivalent NOT flagged, non-equivalent flagged ----
  // Trigger on playership; one action targets player.primaryship (EQUIVALENT → suppressed),
  // another targets station.alpha (NOT equivalent → flagged).
  const eqNodes: MDNode[] = [
    N('c', 'cue', 'cue', { name: 'RefCue' }),
    N('ev', 'event', 'event_object_changed_sector', { object: 'playership', sector: 'player.sector' }),
    N('a_eq', 'action', 'set_object_shieldlevel', { object: 'player.primaryship', level: '0' }),
    N('a_ne', 'action', 'set_owner', { object: 'station.alpha', exact: 'xenon' }),
  ];
  const eqLinks: MDLink[] = [
    L('l1', 'c', 'out_cond', 'ev', 'in_cond'),
    L('l2', 'c', 'out_act', 'a_eq', 'in_act'),
    L('l3', 'a_eq', 'out_next', 'a_ne', 'in_act'),
  ];
  const rEq = critiqueWorkspace(eqNodes, eqLinks);
  ok('equiv_ref_NOT_flagged', !has(rEq, 'ref_mismatch', 'a_eq'), rEq.findings); // THE headline: no false positive
  ok('nonequiv_ref_flagged', has(rEq, 'ref_mismatch', 'a_ne'), rEq.findings);

  // ---- (b) oneway_no_restore: fires when not restored, suppressed when restored ----
  const owNoRestore = critiqueWorkspace(
    [N('c2', 'cue', 'cue', { name: 'Drain' }), N('s1', 'action', 'set_object_shieldlevel', { object: 'playership', level: '0' })],
    [L('m1', 'c2', 'out_act', 's1', 'in_act')]
  );
  ok('oneway_fires', has(owNoRestore, 'oneway_no_restore', 's1'), owNoRestore.findings);

  const owRestored = critiqueWorkspace(
    [N('c3', 'cue', 'cue', { name: 'DrainRestore' }),
     N('s2', 'action', 'set_object_shieldlevel', { object: 'playership', level: '0' }),
     N('s3', 'action', 'set_object_shieldlevel', { object: 'playership', level: '100' })],
    [L('m2', 'c3', 'out_act', 's2', 'in_act'), L('m3', 's2', 'out_next', 's3', 'in_act')]
  );
  ok('oneway_suppressed_when_restored', !has(owRestored, 'oneway_no_restore'), owRestored.findings);

  // ---- (c) unguarded_high_risk: fires on frequent trigger + high-risk action, suppressed by a guard ----
  const unguarded = critiqueWorkspace(
    [N('c4', 'cue', 'cue', { name: 'Spawner' }),
     N('e4', 'event', 'event_object_changed_sector', { object: 'playership' }),
     N('cs', 'action', 'create_ship', { macro: 'ship_xen', faction: 'xenon' })],
    [L('n1', 'c4', 'out_cond', 'e4', 'in_cond'), L('n2', 'c4', 'out_act', 'cs', 'in_act')]
  );
  ok('unguarded_fires', has(unguarded, 'unguarded_high_risk', 'cs'), unguarded.findings);

  const guardedDoIf = critiqueWorkspace(
    [N('c5', 'cue', 'cue', { name: 'GuardedSpawner' }),
     N('e5', 'event', 'event_object_changed_sector', { object: 'playership' }),
     N('g', 'action', 'do_if', { value: '$ready' }),
     N('cs2', 'action', 'create_ship', { macro: 'ship_xen', faction: 'xenon' })],
    [L('o1', 'c5', 'out_cond', 'e5', 'in_cond'), L('o2', 'c5', 'out_act', 'g', 'in_act'), L('o3', 'g', 'out_next', 'cs2', 'in_act')]
  );
  ok('unguarded_suppressed_by_doif', !has(guardedDoIf, 'unguarded_high_risk'), guardedDoIf.findings);

  const guardedCheck = critiqueWorkspace(
    [N('c6', 'cue', 'cue', { name: 'CheckedSpawner' }),
     N('e6', 'event', 'event_object_changed_sector', { object: 'playership' }),
     N('chk', 'condition', 'check_value', { value: '$ready' }),
     N('cs3', 'action', 'create_ship', { macro: 'ship_xen', faction: 'xenon' })],
    [L('p1', 'c6', 'out_cond', 'e6', 'in_cond'), L('p2', 'c6', 'out_cond', 'chk', 'in_cond'), L('p3', 'c6', 'out_act', 'cs3', 'in_act')]
  );
  ok('unguarded_suppressed_by_condition', !has(guardedCheck, 'unguarded_high_risk'), guardedCheck.findings);

  // non-frequent trigger: high-risk action is NOT flagged by rule (c)
  const infreq = critiqueWorkspace(
    [N('c7', 'cue', 'cue', { name: 'OnceSpawner' }),
     N('e7', 'event', 'event_game_started', {}),
     N('cs4', 'action', 'create_ship', { macro: 'ship_xen', faction: 'xenon' })],
    [L('q1', 'c7', 'out_cond', 'e7', 'in_cond'), L('q2', 'c7', 'out_act', 'cs4', 'in_act')]
  );
  ok('infrequent_not_flagged', !has(infreq, 'unguarded_high_risk'), infreq.findings);

  // ---- clean cue produces no findings ----
  const clean = critiqueWorkspace(
    [N('c8', 'cue', 'cue', { name: 'Clean' }),
     N('e8', 'event', 'event_game_started', {}),
     N('snd', 'action', 'play_sound', { object: 'playership', sound: 'beep' })],
    [L('r1', 'c8', 'out_cond', 'e8', 'in_cond'), L('r2', 'c8', 'out_act', 'snd', 'in_act')]
  );
  ok('clean_no_findings', clean.findings.length === 0, clean.findings);

  // summary counts
  ok('summary_counts', typeof rEq.summary['ref_mismatch'] === 'number' && rEq.summary['ref_mismatch'] === 1, rEq.summary);

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
