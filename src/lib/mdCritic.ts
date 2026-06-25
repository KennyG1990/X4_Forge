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

export type CriticSeverity = 'info' | 'warning' | 'error';
export type CriticCode = 'ref_mismatch' | 'oneway_no_restore' | 'unguarded_high_risk' | 'instantiate_reload' | 'game_loaded_no_refresh' | 'illegal_instantiate' | 'no_event_condition';

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

    // Instantiate-eligibility: X4 only permits instantiate="true" on a cue that has an EVENT
    // condition or a checkinterval. (An "instance" is spun up each time the trigger fires; with
    // neither there is no trigger to instance on.) These flags drive rules (d), (f) and (g).
    const hasEventCondition = triggers.some((t) => t.type === 'event' || String(t.xmlTag || '').startsWith('event_'));
    const checkIntervalRaw = cue.properties?.checkinterval;
    const hasCheckInterval = checkIntervalRaw != null && String(checkIntervalRaw).trim() !== '';
    const hasAnyCondition = triggers.length > 0;
    const instantiateEligible = hasEventCondition || hasCheckInterval;
    const hasSubCues = links.some((l) => l.sourceNodeId === cue.id && l.sourcePortId === 'out_sub');
    const instantiated = String(cue.properties?.instantiate) === 'true';

    // --- (d) instantiate_reload — ONLY for instantiate-eligible cues. A cue that DOES have an
    // event condition / checkinterval and holds a sub-cue tree but is instantiate="false" can
    // fail to re-establish its instanced state on reload; recommending instantiate="true" is
    // legal there. For a conditionless cue this advice would be ILLEGAL (see rule f), so we no
    // longer emit it — fixing the bad guidance that produced the unloadable Chat_boot.
    if (hasSubCues && !instantiated && instantiateEligible) {
      findings.push({
        severity: 'warning', code: 'instantiate_reload', cueId: cue.id, cueName, nodeId: cue.id,
        message: `Cue "${cueName}" has sub-cues and an event condition/checkinterval but instantiate="false". X4 can fail to re-instantiate this cue's active state on a save/game reload. Set instantiate="true" so the cue + its sub-cue tree re-establish on load.`,
      });
    }

    // --- (f) illegal_instantiate (ERROR) — X4 hard-rejects instantiate="true" on a cue with
    // neither an event condition nor a checkinterval: "would instantiate without either an event
    // condition or a check interval". The cue then fails to load. This is the exact defect our
    // own (now-fixed) instantiate_reload advice introduced into Chat_boot.
    if (instantiated && !instantiateEligible) {
      findings.push({
        severity: 'error', code: 'illegal_instantiate', cueId: cue.id, cueName, nodeId: cue.id,
        message: `Cue "${cueName}" sets instantiate="true" but has no event condition and no checkinterval. X4 rejects this ("would instantiate without either an event condition or a check interval") and the cue fails to load. Remove instantiate (a conditionless cue runs on load AND on refreshmd), or add an event condition / checkinterval.`,
      });
    }

    // --- (g) no_event_condition (ERROR) — a cue WITH a <conditions> block whose only entries are
    // non-event checks (e.g. a bare <check_value>) and that has no checkinterval is illegal: X4
    // needs an event to trigger on, or a checkinterval to poll the check. A conditionless cue
    // (zero conditions = "instantly true") is fine and is NOT flagged. This is the Save_identity
    // defect: <check_value> as a root cue's sole condition.
    if (hasAnyCondition && !hasEventCondition && !hasCheckInterval) {
      findings.push({
        severity: 'error', code: 'no_event_condition', cueId: cue.id, cueName, nodeId: cue.id,
        message: `Cue "${cueName}" has only non-event conditions and no checkinterval. X4 requires an event condition OR a checkinterval — a bare <check_value> as a cue's sole condition is illegal ("event condition required"). Add an event condition, add a checkinterval to poll the check, or move the check into a <do_if> guard inside the actions of a conditionless cue.`,
      });
    }

    // --- (e) game_loaded_no_refresh — engine semantic the XSD/Lua can't see. event_game_loaded
    // (and event_game_started) DO NOT fire on `refreshmd`, the in-game MD hot-reload. A cue that
    // bootstraps a driver (raises a lua UI event, runs a library, or starts a sub-cue loop) gated
    // SOLELY on game-load therefore stays dead through every refreshmd — exactly the bug that left
    // the AI-Influence chat window unopenable. Advisory only: event_game_loaded is still the right
    // trigger for save-restore cues, so this is a warning, not an error.
    const loadTrigger = triggers.find((t) => t.xmlTag === 'event_game_loaded' || t.xmlTag === 'event_game_started');
    const drivesSomething = hasSubCues || actions.some((a) => a.xmlTag === 'raise_lua_event' || a.xmlTag === 'run_actions');
    if (loadTrigger && drivesSomething) {
      findings.push({
        severity: 'warning', code: 'game_loaded_no_refresh', cueId: cue.id, cueName, nodeId: cue.id,
        message: `Cue "${cueName}" bootstraps a driver (UI event / library / sub-cue loop) but is gated on <${loadTrigger.xmlTag}>, which does NOT fire on \`refreshmd\`. It stays dead through hot-reloads until a full save reload. For dev-testable bootstrap use a conditionless cue (fires on load AND refreshmd); keep <${loadTrigger.xmlTag}> only if this is purely save-restore.`,
      });
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

  // ---- (d) instantiate_reload: fires ONLY for an instantiate-eligible cue (event cond / checkinterval)
  // with sub-cues + instantiate=false; suppressed when instantiate=true AND suppressed for a
  // conditionless cue (where instantiate would be illegal — see rule f). ----
  // Eligible (has event condition) + sub-cues + instantiate=false → fires.
  const reloadUnsafe = critiqueWorkspace(
    [N('cb', 'cue', 'cue', { name: 'Boot', instantiate: 'false' }),
     N('cbe', 'event', 'event_cue_signalled', { cue: 'md.X.Y' }),
     N('sub', 'cue', 'cue', { name: 'Poll' })],
    [L('s0', 'cb', 'out_cond', 'cbe', 'in_cond'), L('s1', 'cb', 'out_sub', 'sub', 'in_flow')]
  );
  ok('instantiate_reload_fires_when_eligible', has(reloadUnsafe, 'instantiate_reload', 'cb'), reloadUnsafe.findings);
  // Eligible + instantiate=true → instantiate_reload suppressed (and NOT illegal_instantiate).
  const reloadSafe = critiqueWorkspace(
    [N('cb2', 'cue', 'cue', { name: 'Boot', instantiate: 'true' }),
     N('cbe2', 'event', 'event_cue_signalled', { cue: 'md.X.Y' }),
     N('sub2', 'cue', 'cue', { name: 'Poll' })],
    [L('s2c', 'cb2', 'out_cond', 'cbe2', 'in_cond'), L('s2', 'cb2', 'out_sub', 'sub2', 'in_flow')]
  );
  ok('instantiate_reload_suppressed_when_true', !has(reloadSafe, 'instantiate_reload'), reloadSafe.findings);
  ok('eligible_instantiate_true_not_illegal', !has(reloadSafe, 'illegal_instantiate'), reloadSafe.findings);
  // Conditionless cue with sub-cues + instantiate=false → instantiate_reload must NOT fire
  // (recommending instantiate here would be the illegal advice we removed).
  const conditionlessReload = critiqueWorkspace(
    [N('cb3', 'cue', 'cue', { name: 'Chat_boot', instantiate: 'false' }), N('sub3', 'cue', 'cue', { name: 'Poll' })],
    [L('s3', 'cb3', 'out_sub', 'sub3', 'in_flow')]
  );
  ok('instantiate_reload_not_for_conditionless', !has(conditionlessReload, 'instantiate_reload'), conditionlessReload.findings);

  // ---- (f) illegal_instantiate (ERROR): instantiate=true with no event condition + no checkinterval ----
  const illegalInst = critiqueWorkspace(
    [N('ci', 'cue', 'cue', { name: 'Chat_boot', instantiate: 'true' }), N('subi', 'cue', 'cue', { name: 'Poll' })],
    [L('f1', 'ci', 'out_sub', 'subi', 'in_flow')]
  );
  ok('illegal_instantiate_fires', has(illegalInst, 'illegal_instantiate', 'ci'), illegalInst.findings);
  // Suppressed by a checkinterval (instantiate-eligible without an event).
  const instWithInterval = critiqueWorkspace(
    [N('ci2', 'cue', 'cue', { name: 'Poller', instantiate: 'true', checkinterval: '1s' }),
     N('chkv', 'condition', 'check_value', { value: '$x' })],
    [L('f2', 'ci2', 'out_cond', 'chkv', 'in_cond')]
  );
  ok('illegal_instantiate_suppressed_by_checkinterval', !has(instWithInterval, 'illegal_instantiate'), instWithInterval.findings);

  // ---- (g) no_event_condition (ERROR): only non-event conditions + no checkinterval ----
  // Positive: a bare check_value as the sole condition (the Save_identity defect).
  const bareCheck = critiqueWorkspace(
    [N('bc', 'cue', 'cue', { name: 'Save_identity' }),
     N('bcv', 'condition', 'check_value', { value: 'not $save_uuid?' })],
    [L('g1', 'bc', 'out_cond', 'bcv', 'in_cond')]
  );
  ok('no_event_condition_fires', has(bareCheck, 'no_event_condition', 'bc'), bareCheck.findings);
  // Suppressed when there IS an event condition.
  const eventGated = critiqueWorkspace(
    [N('eg', 'cue', 'cue', { name: 'Save_identity' }),
     N('egl', 'event', 'event_game_loaded', {})],
    [L('g2', 'eg', 'out_cond', 'egl', 'in_cond')]
  );
  ok('no_event_condition_suppressed_by_event', !has(eventGated, 'no_event_condition'), eventGated.findings);
  // Suppressed when the non-event check is polled by a checkinterval.
  const polledCheck = critiqueWorkspace(
    [N('pc', 'cue', 'cue', { name: 'Poller', checkinterval: '2s' }),
     N('pcv', 'condition', 'check_value', { value: '$x' })],
    [L('g3', 'pc', 'out_cond', 'pcv', 'in_cond')]
  );
  ok('no_event_condition_suppressed_by_checkinterval', !has(polledCheck, 'no_event_condition'), polledCheck.findings);
  // Suppressed for a conditionless cue (zero conditions = instantly true, legal).
  const conditionlessClean = critiqueWorkspace(
    [N('cc', 'cue', 'cue', { name: 'Chat_boot' }), N('ccs', 'cue', 'cue', { name: 'Poll' })],
    [L('g4', 'cc', 'out_sub', 'ccs', 'in_flow')]
  );
  ok('no_event_condition_not_for_conditionless', !has(conditionlessClean, 'no_event_condition'), conditionlessClean.findings);

  // ---- (e) game_loaded_no_refresh: fires for a load-gated driver cue, suppressed when conditionless or non-driver ----
  // Positive: event_game_loaded + raise_lua_event (a UI driver) → flagged (the chat-window bug).
  const loadDriver = critiqueWorkspace(
    [N('cl', 'cue', 'cue', { name: 'Chat_boot' }),
     N('el', 'event', 'event_game_loaded', {}),
     N('rl', 'action', 'raise_lua_event', { name: "'AIChat.open'" })],
    [L('z1', 'cl', 'out_cond', 'el', 'in_cond'), L('z2', 'cl', 'out_act', 'rl', 'in_act')]
  );
  ok('game_loaded_no_refresh_fires', has(loadDriver, 'game_loaded_no_refresh', 'cl'), loadDriver.findings);
  // Suppressed: conditionless cue with the same driver action → fires on load AND refreshmd, not flagged.
  const conditionlessDriver = critiqueWorkspace(
    [N('cl2', 'cue', 'cue', { name: 'Chat_boot' }),
     N('rl2', 'action', 'raise_lua_event', { name: "'AIChat.open'" })],
    [L('z3', 'cl2', 'out_act', 'rl2', 'in_act')]
  );
  ok('game_loaded_no_refresh_suppressed_conditionless', !has(conditionlessDriver, 'game_loaded_no_refresh'), conditionlessDriver.findings);
  // Suppressed: load-gated but NOT a driver (pure save-restore state write) → not flagged.
  const loadRestore = critiqueWorkspace(
    [N('cl3', 'cue', 'cue', { name: 'Restore' }),
     N('el3', 'event', 'event_game_loaded', {}),
     N('sv', 'action', 'set_value', { name: '$x', exact: '1' })],
    [L('z4', 'cl3', 'out_cond', 'el3', 'in_cond'), L('z5', 'cl3', 'out_act', 'sv', 'in_act')]
  );
  ok('game_loaded_no_refresh_suppressed_nondriver', !has(loadRestore, 'game_loaded_no_refresh'), loadRestore.findings);

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
