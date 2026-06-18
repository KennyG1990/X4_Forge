/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Determinism Doctrine — Phase 2: the deterministic explainer.
 *
 * Turns {nodes, links} into a structured human-readable explanation of what a mod
 * is *supposed to do*. The two correctness guarantees that distinguish this from the
 * old AI "Cognitive Script Summary":
 *   1. PROSE is template-filled from each node's real attributes via
 *      `mdSemantics.describeNode` — never AI-generated, never invented.
 *   2. SEQUENCE comes from the canonical graph edge-walk (the same port wiring the
 *      compiler uses: out_cond conditions, out_act→out_next action chain, out_sub
 *      sub-cues) — never inferred from prose context, so order is guaranteed correct.
 *
 * Output is shaped to the existing SCANNER `ScriptAnalysis` contract so the UI renders
 * it unchanged. `tacticalInsights` carries only the registry's DETERMINISTIC notes
 * (e.g. "set_object_shieldlevel is a one-way write"), never speculative AI critique —
 * open-ended critique is Phase 3's deterministic lint library.
 */

import type { MDNode, MDLink } from '../types';
import { describeNode, semanticsForNode } from './mdSemantics';

export interface ExplainStep {
  nodeId: string;
  nodeLabel: string;
  xmlTag: string;
  plainEnglishAction: string;
  sequenceOrder: number;
  depth: number;
  role: 'cue' | 'trigger' | 'action';
}
export interface ExplainAsset { name: string; type: string; detail: string; }
export interface ExplainResult {
  summary: string;
  triggerCondition: string;
  flowSteps: ExplainStep[];
  entityRegistry: ExplainAsset[];
  tacticalInsights: string[];
  /** Deterministic provenance: how many described nodes had a curated entry vs. fell back. */
  coverage: { total: number; curated: number; fallback: number };
}

const PORT_COND = 'out_cond';
const PORT_ACT = 'out_act';
const PORT_NEXT = 'out_next';
const PORT_SUB = 'out_sub';

function labelOf(n: MDNode): string {
  return (n.properties?.name && String(n.properties.name).trim()) || n.label || n.id;
}

/** Ordered condition (trigger) nodes for a cue. (Exported for reuse by the Phase-3 critic.) */
export function triggerNodesOf(cueId: string, nodeById: Map<string, MDNode>, links: MDLink[]): MDNode[] {
  return links
    .filter((l) => l.sourceNodeId === cueId && l.sourcePortId === PORT_COND)
    .map((l) => nodeById.get(l.targetNodeId))
    .filter((n): n is MDNode => !!n);
}

/** Ordered action chain for a cue: first via out_act, then following out_next. Cycle-safe. (Exported for the critic.) */
export function actionChainOf(cueId: string, nodeById: Map<string, MDNode>, links: MDLink[]): MDNode[] {
  const out: MDNode[] = [];
  const firstLinks = links.filter((l) => l.sourceNodeId === cueId && l.sourcePortId === PORT_ACT);
  for (const first of firstLinks) {
    let cur = nodeById.get(first.targetNodeId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.push(cur);
      const next = links.find((l) => l.sourceNodeId === cur!.id && l.sourcePortId === PORT_NEXT);
      cur = next ? nodeById.get(next.targetNodeId) : undefined;
    }
  }
  return out;
}

/** Child cues of a cue (out_sub). */
function subCuesOf(cueId: string, nodeById: Map<string, MDNode>, links: MDLink[]): MDNode[] {
  return links
    .filter((l) => l.sourceNodeId === cueId && l.sourcePortId === PORT_SUB)
    .map((l) => nodeById.get(l.targetNodeId))
    .filter((n): n is MDNode => !!n && n.type === 'cue');
}

/**
 * Short trigger clause for the summary, derived deterministically from the describe
 * sentence. Always reads cleanly after a "Triggers " prefix — strips a leading
 * "Triggers " so it never doubles, and normalizes the `event_cue_signalled` phrasing
 * ("Waits for cue X to be signalled, then triggers" → "when cue X is signalled").
 */
function triggerPhrase(trigger: MDNode): string {
  const d = describeNode(trigger).trim().replace(/\.$/, '');
  // Already a "Triggers ..." sentence (event_*): drop the verb so the caller's prefix wins.
  let m = d.match(/^Triggers\s+(.+)$/i);
  if (m) return m[1];
  // event_cue_signalled: "Waits for <X>, then triggers" → "when <X is signalled>".
  m = d.match(/^Waits for (.+?),?\s*then triggers$/i);
  if (m) return `when ${m[1].replace(/\bto be signalled\b/i, 'is signalled')}`;
  m = d.match(/^Waits for (.+)$/i);
  if (m) return `when ${m[1].replace(/\bto be signalled\b/i, 'is signalled')}`;
  return d;
}

export function explainWorkspace(nodes: MDNode[], links: MDLink[]): ExplainResult {
  nodes = Array.isArray(nodes) ? nodes.filter((n) => n && n.includeInBuild !== false) : [];
  links = Array.isArray(links) ? links : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const cues = nodes.filter((n) => n.type === 'cue');

  // Root cues = cues not targeted by an out_sub link (mirrors the compiler/cueLineage).
  const subTargets = new Set(links.filter((l) => l.sourcePortId === PORT_SUB).map((l) => l.targetNodeId));
  const rootCues = cues.filter((c) => !subTargets.has(c.id));

  const flowSteps: ExplainStep[] = [];
  const insights: string[] = [];
  const assets: ExplainAsset[] = [];
  const assetSeen = new Set<string>();
  const summaryBlocks: string[] = [];
  const triggerSummaries: string[] = [];
  let seq = 0;
  let curated = 0, fallbackCount = 0, described = 0;

  const addAsset = (name: string, type: string, detail: string) => {
    const key = `${type}::${name}`;
    if (!name || assetSeen.has(key)) return;
    assetSeen.add(key);
    assets.push({ name, type, detail });
  };
  const harvestAssets = (n: MDNode) => {
    const p = n.properties || {};
    if (p.sound) addAsset(String(p.sound), 'SOUND', 'Audio cue played by the script.');
    if (p.money) addAsset(`${p.money} Credits`, 'CURRENCY', 'Credits moved by the script.');
    if (p.macro) addAsset(String(p.macro).split(' (')[0], 'MACRO', 'Game object blueprint spawned.');
    if (p.faction) addAsset(String(p.faction), 'FACTION', 'Faction referenced by the script.');
    if (p.sector) addAsset(String(p.sector), 'SECTOR REF', 'Location reference.');
    if (n.xmlTag === 'event_cue_signalled' && p.cue) addAsset(String(p.cue), 'CUE REF', 'Cross-cue signal listened for.');
    if ((n.xmlTag === 'signal_cue' || n.xmlTag === 'reset_cue' || n.xmlTag === 'cancel_cue') && p.cue)
      addAsset(String(p.cue), 'CUE REF', 'Cross-cue signal sent.');
  };
  const describeAndTrack = (n: MDNode): string => {
    const text = describeNode(n);
    described++;
    const sem = semanticsForNode(n);
    if (sem.curated) curated++; else fallbackCount++;
    if (sem.note) insights.push(`${labelOf(n)} (<${n.xmlTag}>): ${sem.note}`);
    if (sem.notInSchema) insights.push(`⚠ ${labelOf(n)} (<${n.xmlTag}>): not a declared md.xsd element — the game schema does not recognize it (see canvas diagnostics).`);
    harvestAssets(n);
    return text;
  };

  const walkCue = (cue: MDNode, depth: number, summaryInto?: string[]) => {
    // cue node
    flowSteps.push({ nodeId: cue.id, nodeLabel: labelOf(cue), xmlTag: cue.xmlTag,
      plainEnglishAction: describeNode(cue), sequenceOrder: seq++, depth, role: 'cue' });

    const triggers = triggerNodesOf(cue.id, nodeById, links);
    const actions = actionChainOf(cue.id, nodeById, links);

    for (const t of triggers) {
      flowSteps.push({ nodeId: t.id, nodeLabel: labelOf(t), xmlTag: t.xmlTag,
        plainEnglishAction: describeAndTrack(t), sequenceOrder: seq++, depth: depth + 1, role: 'trigger' });
    }
    for (const a of actions) {
      flowSteps.push({ nodeId: a.id, nodeLabel: labelOf(a), xmlTag: a.xmlTag,
        plainEnglishAction: describeAndTrack(a), sequenceOrder: seq++, depth: depth + 1, role: 'action' });
    }

    // summary sentence for this cue (only top-level cues seed the summary blocks)
    if (summaryInto) {
      const trig = triggers.length ? `Triggers ${triggerPhrase(triggers[0])}.` : `Has no trigger (runs via parent/signal).`;
      if (triggers.length) triggerSummaries.push(`"${labelOf(cue)}" triggers ${triggerPhrase(triggers[0])}`);
      const actSentences = actions.map((a) => describeNode(a));
      const block = [`${labelOf(cue)}: ${trig}`, ...actSentences].join(' ');
      summaryInto.push(block);
    }

    for (const sub of subCuesOf(cue.id, nodeById, links)) walkCue(sub, depth + 1, undefined);
  };

  for (const root of rootCues) walkCue(root, 0, summaryBlocks);

  const summary = summaryBlocks.length
    ? summaryBlocks.join(' — ')
    : (cues.length ? 'The workspace has cues but no described triggers or actions yet.'
                   : 'No cues in the workspace. Add a cue with a trigger and actions to begin.');
  const triggerCondition = triggerSummaries.length
    ? triggerSummaries.join('; ') + '.'
    : 'No activation triggers found (no condition nodes wired to a cue).';

  return {
    summary,
    triggerCondition,
    flowSteps,
    entityRegistry: assets,
    tacticalInsights: insights,
    coverage: { total: described, curated, fallback: fallbackCount },
  };
}

/* ------------------------------------------------------------------ *
 * A4.0 — single-node deterministic explanation (the "Explain this node" verb).
 * Built only from describeNode/semanticsForNode + a graph-edge walk; never AI.
 * ------------------------------------------------------------------ */
export interface NodeExplanation {
  found: boolean;
  nodeId: string;
  label: string;
  xmlTag: string;
  role: 'cue' | 'trigger' | 'action' | 'unknown';
  /** Deterministic plain-English description (mdSemantics.describeNode). */
  summary: string;
  /** Whether <xmlTag> is a declared md.xsd element (false ⇒ likely invented). */
  schemaRecognized: boolean;
  /** Registry note (e.g. "one-way write"), if any. */
  note?: string;
  /** Coarse risk class from the registry: safe | state_mutation | economy | spawn | irreversible | unknown. */
  risk: string;
  reads: string[];
  writes: string[];
  /** Graph context, edge-walked. */
  wiring: {
    /** Cue id this node is wired into as a trigger (out_cond), if any. */
    wiredToCue?: string;
    /** Cue id whose action chain (out_act/out_next) contains this node, if any. */
    inChainOf?: string;
    /** True when the node is a non-cue with no incoming wiring (won't run). */
    orphan: boolean;
  };
}

/** Explain a single node deterministically, in the context of the whole graph. */
export function explainNode(nodeId: string, nodes: MDNode[], links: MDLink[]): NodeExplanation {
  nodes = Array.isArray(nodes) ? nodes : [];
  links = Array.isArray(links) ? links : [];
  const node = nodes.find((n) => n && n.id === nodeId);
  if (!node) {
    return { found: false, nodeId, label: nodeId, xmlTag: '', role: 'unknown', summary: 'Node not found.',
      schemaRecognized: false, risk: 'unknown', reads: [], writes: [], wiring: { orphan: true } };
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sem = semanticsForNode(node);
  const role: NodeExplanation['role'] =
    node.type === 'cue' ? 'cue' : node.type === 'condition' || node.type === 'event' ? 'trigger'
      : node.type === 'action' ? 'action' : 'unknown';

  // Edge-walk the graph for this node's context (same ports the compiler uses).
  let wiredToCue: string | undefined;
  let inChainOf: string | undefined;
  const cues = nodes.filter((n) => n.type === 'cue');
  for (const cue of cues) {
    if (triggerNodesOf(cue.id, nodeById, links).some((t) => t.id === nodeId)) wiredToCue = cue.id;
    if (actionChainOf(cue.id, nodeById, links).some((a) => a.id === nodeId)) inChainOf = cue.id;
  }
  // Orphan = a non-cue node that nothing points at (so it never runs). Cues are roots, never orphans.
  const hasIncoming = links.some((l) => l.targetNodeId === nodeId);
  const orphan = node.type !== 'cue' && !hasIncoming;

  return {
    found: true,
    nodeId,
    label: labelOf(node),
    xmlTag: node.xmlTag,
    role,
    summary: describeNode(node),
    schemaRecognized: !sem.notInSchema,
    note: sem.note || undefined,
    risk: sem.risk || 'unknown',
    reads: Array.isArray(sem.reads) ? sem.reads : [],
    writes: Array.isArray(sem.writes) ? sem.writes : [],
    wiring: { wiredToCue, inChainOf, orphan },
  };
}

/* ------------------------------------------------------------------ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * ------------------------------------------------------------------ */
export function runExplainSelftest() {
  const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });
  const N = (id: string, type: MDNode['type'], xmlTag: string, properties: Record<string, unknown> = {}): MDNode =>
    ({ id, type, xmlTag, properties, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] });
  const L = (id: string, s: string, sp: string, t: string, tp = 'in'): MDLink =>
    ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

  // ---- alarm_shields-style linear cue: event + 3 ordered actions ----
  const nodes: MDNode[] = [
    N('c1', 'cue', 'cue', { name: 'Alarm_Shields_Reward_Cue', instantiate: 'true', namespace: 'this' }),
    N('ev', 'event', 'event_object_changed_sector', { object: 'playership', sector: 'player.sector' }),
    N('a1', 'action', 'play_sound', { object: 'playership', sound: 'alarm_red' }),
    N('a2', 'action', 'set_object_shieldlevel', { object: 'player.primaryship', level: '0' }),
    N('a3', 'action', 'reward_player', { money: '100000' }),
  ];
  const links: MDLink[] = [
    L('lc', 'c1', PORT_COND, 'ev', 'in_cond'),
    L('la', 'c1', PORT_ACT, 'a1', 'in_act'),
    L('ln1', 'a1', PORT_NEXT, 'a2', 'in_act'),
    L('ln2', 'a2', PORT_NEXT, 'a3', 'in_act'),
  ];
  const r = explainWorkspace(nodes, links);

  // sequence is from the edge-walk: cue, trigger, then a1->a2->a3 in chain order
  const actionOrder = r.flowSteps.filter((s) => s.role === 'action').map((s) => s.xmlTag).join(',');
  ok('action_order_from_edgewalk', actionOrder === 'play_sound,set_object_shieldlevel,reward_player', actionOrder);
  ok('cue_is_first', r.flowSteps[0].role === 'cue' && r.flowSteps[0].nodeId === 'c1');
  ok('trigger_after_cue', r.flowSteps[1].role === 'trigger' && r.flowSteps[1].xmlTag === 'event_object_changed_sector');

  // prose is the deterministic describe output (not AI)
  ok('prose_is_deterministic',
    r.flowSteps.find((s) => s.nodeId === 'a2')!.plainEnglishAction ===
      `Sets player.primaryship's shield level to 0 (drops its shields completely).`);

  // summary reflects correct order and content
  ok('summary_has_trigger', /triggers when playership changes sector/i.test(r.summary), r.summary);
  ok('summary_order_preserved',
    r.summary.indexOf("alarm_red") < r.summary.indexOf('shield level to 0') &&
    r.summary.indexOf('shield level to 0') < r.summary.indexOf('100000 credits'), r.summary);

  // activation trigger string
  ok('trigger_condition_text', /Alarm_Shields_Reward_Cue/.test(r.triggerCondition) && /sector/.test(r.triggerCondition));

  // asset registry
  ok('asset_sound', r.entityRegistry.some((a) => a.type === 'SOUND' && a.name === 'alarm_red'));
  ok('asset_currency', r.entityRegistry.some((a) => a.type === 'CURRENCY' && /100000/.test(a.name)));

  // deterministic note surfaced (shield one-way write), NOT speculative critique
  ok('deterministic_note', r.tacticalInsights.some((t) => /does not restore shields/i.test(t)), r.tacticalInsights);

  // coverage provenance
  ok('coverage_all_curated', r.coverage.total === 4 && r.coverage.curated === 4 && r.coverage.fallback === 0, r.coverage);

  // ---- branching + sub-cue recursion: parent with two sub-cues ----
  const n2: MDNode[] = [
    N('p', 'cue', 'cue', { name: 'Parent' }),
    N('pe', 'event', 'event_game_started', {}),
    N('s1', 'cue', 'cue', { name: 'ChildA' }),
    N('s1a', 'action', 'reward_player', { money: '5' }),
    N('s2', 'cue', 'cue', { name: 'ChildB' }),
    N('s2a', 'action', 'play_sound', { sound: 'beep' }),
  ];
  const l2: MDLink[] = [
    L('x0', 'p', PORT_COND, 'pe', 'in_cond'),
    L('x1', 'p', PORT_SUB, 's1', 'in_flow'),
    L('x2', 'p', PORT_SUB, 's2', 'in_flow'),
    L('x3', 's1', PORT_ACT, 's1a', 'in_act'),
    L('x4', 's2', PORT_ACT, 's2a', 'in_act'),
  ];
  const r2 = explainWorkspace(n2, l2);
  const cueOrder = r2.flowSteps.filter((s) => s.role === 'cue').map((s) => s.nodeLabel).join(',');
  ok('subcue_recursion_order', cueOrder === 'Parent,ChildA,ChildB', cueOrder);
  ok('subcue_depth', r2.flowSteps.find((s) => s.nodeLabel === 'ChildA')!.depth === 1);
  ok('only_root_in_summary', r2.summary.includes('Parent') && !/ChildA: Triggers/.test(r2.summary));
  // boundary-mod regression: no doubled "Triggers Triggers" for event_game_started
  ok('no_double_triggers', !/Triggers\s+Triggers/i.test(r2.summary), r2.summary);
  ok('game_started_clean', /Triggers once when a new game is started/.test(r2.summary), r2.summary);

  // event_cue_signalled summary phrasing is clean ("...is signalled", not "...to be signalled, then triggers")
  const n5: MDNode[] = [
    N('lc', 'cue', 'cue', { name: 'Listener' }),
    N('le', 'event', 'event_cue_signalled', { cue: 'Upstream' }),
    N('la', 'action', 'play_sound', { sound: 'beep' }),
  ];
  const l5: MDLink[] = [L('z1', 'lc', PORT_COND, 'le', 'in_cond'), L('z2', 'lc', PORT_ACT, 'la', 'in_act')];
  const r5 = explainWorkspace(n5, l5);
  ok('cue_signalled_phrasing', /Triggers when cue .*Upstream.* is signalled/.test(r5.summary) && !/then triggers/.test(r5.summary), r5.summary);

  // ---- long-tail fallback is counted honestly ----
  const n3: MDNode[] = [
    N('c3', 'cue', 'cue', { name: 'Rare' }),
    N('r3', 'action', 'set_object_someraremutation', { object: 'x', value: '9' }),
  ];
  const l3: MDLink[] = [L('y1', 'c3', PORT_ACT, 'r3', 'in_act')];
  const r3 = explainWorkspace(n3, l3);
  ok('fallback_counted', r3.coverage.fallback === 1 && r3.coverage.curated === 0, r3.coverage);
  ok('fallback_prose_generic',
    r3.flowSteps.find((s) => s.nodeId === 'r3')!.plainEnglishAction === 'Runs <set_object_someraremutation> with object=x, value=9.');

  // ---- empty workspace degrades honestly ----
  const r4 = explainWorkspace([], []);
  ok('empty_honest', /No cues/.test(r4.summary) && r4.flowSteps.length === 0);

  // ---- A4.0: explainNode (single-node deterministic verb), reusing the alarm cue graph ----
  const eAction = explainNode('a2', nodes, links); // set_object_shieldlevel
  ok('explainNode_role_action', eAction.role === 'action', eAction.role);
  ok('explainNode_in_chain', eAction.wiring.inChainOf === 'c1' && !eAction.wiring.orphan, eAction.wiring);
  ok('explainNode_summary_deterministic',
    eAction.summary === `Sets player.primaryship's shield level to 0 (drops its shields completely).`, eAction.summary);
  ok('explainNode_note_and_write', !!eAction.note && eAction.writes.includes('object.shields') && eAction.risk === 'state_mutation', eAction);
  // set_object_shieldlevel is curated-but-not-a-declared-md.xsd element → schemaRecognized false (honest).
  ok('explainNode_schema_flag', eAction.schemaRecognized === false, eAction.schemaRecognized);

  const eTrig = explainNode('ev', nodes, links); // event_object_changed_sector wired as the cue's trigger
  ok('explainNode_trigger_wired', eTrig.role === 'trigger' && eTrig.wiring.wiredToCue === 'c1', eTrig.wiring);

  const eCue = explainNode('c1', nodes, links);
  ok('explainNode_cue_not_orphan', eCue.role === 'cue' && eCue.wiring.orphan === false, eCue.wiring);

  // a safe, curated, in-schema action reads cleanly (play_sound)
  const eSafe = explainNode('a1', nodes, links);
  ok('explainNode_safe_recognized', eSafe.schemaRecognized === true && eSafe.risk === 'safe', eSafe);

  // orphan: an action nothing points at never runs — flagged honestly
  const eOrphan = explainNode('lonely', [N('lonely', 'action', 'play_sound', { sound: 'beep' })], []);
  ok('explainNode_orphan', eOrphan.wiring.orphan === true && !eOrphan.wiring.inChainOf, eOrphan.wiring);

  // missing node degrades honestly
  const eMiss = explainNode('nope', nodes, links);
  ok('explainNode_missing', eMiss.found === false && /not found/i.test(eMiss.summary), eMiss);

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
