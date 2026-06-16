/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A4.2 — Proposal review engine. Turns an AI-proposed workspace into a reviewable,
 * verifiable artifact BEFORE it can be applied: a node-level diff plus three
 * independent, separately-sourced verdicts (Codex round-2 three-verdict model):
 *   - Schema  : XSD/MD legality            (validateModWorkspace)
 *   - Graph   : ports/links/lineage sanity (analyzeCueLineage)
 *   - Intent  : does it satisfy the ask?   (A4.9 — not yet implemented → 'not-checked')
 *
 * Pure (no I/O), so it is the shared, unit-testable basis for both the review
 * card (A4.2 UI) and the Architect per-step done-checks (A5.3). The AI is never
 * the authority here — the deterministic verdicts are.
 */
import { ModWorkspace, generateMDXML, validateModWorkspace, sanitizeWorkspace, NODE_TEMPLATES } from '../types';
import { analyzeCueLineage } from './cueLineage';
import { checkIntent, type IntentRequirement, type IntentRequirementResult } from './intentCheck';

// A4.5 — boundary hardening. The curated visual vocabulary; combined at call time
// with the live md.xsd element set so legitimate schema-driven tags are NOT
// false-flagged (the trap sanitizeWorkspace documents).
const CURATED_TAGS = new Set(NODE_TEMPLATES.map((t: any) => t.xmlTag));

export type VerdictStatus = 'pass' | 'warn' | 'fail' | 'not-checked';

export interface ProposalVerdict {
  status: VerdictStatus;
  errors: number;
  warnings: number;
  detail?: string;
}

interface NodeBrief { id: string; label: string; xmlTag: string }

export interface ProposalReview {
  diff: { added: NodeBrief[]; removed: NodeBrief[]; changed: NodeBrief[] };
  nodeCounts: { base: number; proposed: number };
  verdicts: { schema: ProposalVerdict; graph: ProposalVerdict; intent: ProposalVerdict };
  /** A4.5 — nodes whose xmlTag is unrecognized (likely hallucinated); flagged, not silently carried. */
  unknownTags: NodeBrief[];
  /** A4.9 — per-requirement intent results when requirements are supplied. */
  intentResults?: IntentRequirementResult[];
  /** Safe to apply outright = no hard schema/graph error AND no unknown tags. */
  applySafe: boolean;
}

function brief(n: any): NodeBrief {
  return { id: String(n?.id ?? ''), label: String(n?.label ?? n?.id ?? ''), xmlTag: String(n?.xmlTag ?? '') };
}

/**
 * A4.5 — flag nodes carrying an xmlTag that matches neither the curated visual
 * vocabulary, the (optionally supplied) live md.xsd element set, nor a `custom*`
 * escape hatch. These are the most likely hallucinations (e.g. `set_god_mode`).
 * Pure; `knownTags` lets a caller inject the schema-derived tag set at runtime.
 */
export function findUnknownTags(ws: ModWorkspace, knownTags?: Set<string>): NodeBrief[] {
  const out: NodeBrief[] = [];
  for (const n of (ws?.nodes || []) as any[]) {
    const tag = String(n?.xmlTag ?? '').trim();
    if (!tag) continue;
    if (/^custom/i.test(tag)) continue; // intentional escape hatch (custom_xml, custom_event, …)
    if (CURATED_TAGS.has(tag)) continue;
    if (knownTags && knownTags.has(tag)) continue;
    out.push(brief(n));
  }
  return out;
}

function toVerdict(errors: number, warnings: number, detail?: string): ProposalVerdict {
  return { status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass', errors, warnings, detail };
}

/**
 * Compute the reviewable artifact for a proposed workspace against the current one.
 * Never throws — verdict computation is individually guarded so a malformed
 * proposal degrades to a 'fail' verdict rather than crashing the review.
 */
export function reviewProposal(base: ModWorkspace, proposed: ModWorkspace, opts?: { knownTags?: Set<string>; requirements?: IntentRequirement[] }): ProposalReview {
  const baseNodes = new Map<string, any>((base?.nodes || []).map(n => [n.id, n]));
  const propNodes = new Map<string, any>((proposed?.nodes || []).map(n => [n.id, n]));

  const added: NodeBrief[] = [];
  const removed: NodeBrief[] = [];
  const changed: NodeBrief[] = [];
  for (const [id, n] of propNodes) {
    if (!baseNodes.has(id)) added.push(brief(n));
    else if (JSON.stringify(baseNodes.get(id)) !== JSON.stringify(n)) changed.push(brief(n));
  }
  for (const [id, n] of baseNodes) {
    if (!propNodes.has(id)) removed.push(brief(n));
  }

  // Schema verdict — XSD/MD legality of the proposed workspace.
  let schema: ProposalVerdict;
  try {
    const code = generateMDXML(proposed);
    const diags = validateModWorkspace(proposed, code) || [];
    schema = toVerdict(
      diags.filter(d => d.severity === 'error').length,
      diags.filter(d => d.severity === 'warning').length,
    );
  } catch (e: any) {
    schema = { status: 'fail', errors: 1, warnings: 0, detail: e?.message || 'schema check threw' };
  }

  // Graph verdict — ports/links/cue-lineage coherence.
  let graph: ProposalVerdict;
  try {
    const findings = analyzeCueLineage(proposed?.nodes || [], (proposed as any)?.links || []).findings || [];
    graph = toVerdict(
      findings.filter(f => f.severity === 'error').length,
      findings.filter(f => f.severity === 'warning').length,
    );
  } catch (e: any) {
    graph = { status: 'fail', errors: 1, warnings: 0, detail: e?.message || 'graph check threw' };
  }

  // Intent verdict — A4.9 requirement-pattern assertions. When requirements are
  // supplied (extracted from the prompt), each is verified deterministically; a
  // green Schema/Graph can NEVER imply the prompt was satisfied. With no
  // requirements it stays 'not-checked' (honest — never "pass").
  let intent: ProposalVerdict;
  let intentResults: IntentRequirementResult[] | undefined;
  if (opts?.requirements && opts.requirements.length > 0) {
    const report = checkIntent(proposed, opts.requirements);
    intent = { status: report.verdict.status, errors: report.verdict.errors, warnings: report.verdict.warnings, detail: report.verdict.detail };
    intentResults = report.results;
  } else {
    intent = {
      status: 'not-checked',
      errors: 0,
      warnings: 0,
      detail: 'No requirements supplied — output legality does not prove the request was satisfied.',
    };
  }

  const unknownTags = findUnknownTags(proposed, opts?.knownTags);

  return {
    diff: { added, removed, changed },
    nodeCounts: { base: baseNodes.size, proposed: propNodes.size },
    verdicts: { schema, graph, intent },
    unknownTags,
    intentResults,
    // applySafe gates on hard legality (schema/graph/unknown tags). Intent failures
    // are surfaced loudly but do NOT hard-block apply — a valid-but-incomplete build
    // is safe to apply and iterate on (the user decides), per A4.2.
    applySafe: schema.status !== 'fail' && graph.status !== 'fail' && unknownTags.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Deterministic oracle (synthetic fixtures; no disk/AI/key). Asserts the review
// engine's contract: diff exactness, verdict shape, and applySafe consistency.
// ---------------------------------------------------------------------------
function mkNode(id: string, type: string, xmlTag: string, props: Record<string, any> = {}): any {
  return { id, type, label: id, xmlTag, x: 0, y: 0, properties: props };
}
function mkWs(nodes: any[], links: any[] = []): ModWorkspace {
  return sanitizeWorkspace({ name: 'Selftest_WS', version: '1.0.0', author: 'oracle', description: '', nodes, links, uiWidgets: [], uiTheme: {} });
}

export function runProposalReviewSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const expect = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // Base: a cue + an action. Proposed: keep the cue (modified), drop the action, add a new action.
  const base = mkWs([
    mkNode('cue_0', 'cue', 'cue', { name: 'Start' }),
    mkNode('act_0', 'action', 'show_help', { text: 'hi' }),
  ]);
  const proposed = mkWs([
    mkNode('cue_0', 'cue', 'cue', { name: 'Start_Renamed' }), // changed
    mkNode('act_1', 'action', 'reward_player', { money: '5000' }), // added
  ]);

  const r = reviewProposal(base, proposed);

  expect('added detected', r.diff.added.length === 1 && r.diff.added[0].id === 'act_1', JSON.stringify(r.diff.added));
  expect('removed detected', r.diff.removed.length === 1 && r.diff.removed[0].id === 'act_0', JSON.stringify(r.diff.removed));
  expect('changed detected', r.diff.changed.length === 1 && r.diff.changed[0].id === 'cue_0', JSON.stringify(r.diff.changed));
  expect('node counts', r.nodeCounts.base === 2 && r.nodeCounts.proposed === 2, JSON.stringify(r.nodeCounts));

  // No-op proposal (identical) → empty diff.
  const same = reviewProposal(base, base);
  expect('identical → empty diff', same.diff.added.length === 0 && same.diff.removed.length === 0 && same.diff.changed.length === 0);

  // Verdict shape + statuses are valid enum members.
  const validStatus = (v: ProposalVerdict) => ['pass', 'warn', 'fail', 'not-checked'].includes(v.status);
  expect('schema verdict valid', validStatus(r.verdicts.schema), r.verdicts.schema.status);
  expect('graph verdict valid', validStatus(r.verdicts.graph), r.verdicts.graph.status);
  expect('intent is not-checked (A4.9 stub)', r.verdicts.intent.status === 'not-checked');

  // applySafe is consistent with the schema/graph verdicts + unknown tags.
  const expectedSafe = r.verdicts.schema.status !== 'fail' && r.verdicts.graph.status !== 'fail' && r.unknownTags.length === 0;
  expect('applySafe consistent', r.applySafe === expectedSafe);

  // A4.5 — unknown-tag flagging. Hallucinated tag flagged; curated/custom not; never applySafe.
  const halluc = mkWs([
    mkNode('cue_0', 'cue', 'cue', { name: 'X' }),
    mkNode('act_h', 'action', 'set_god_mode', {}),   // invented capability
    mkNode('act_c', 'action', 'custom_xml', { xml: '<x/>' }), // escape hatch — NOT unknown
  ]);
  const hr = reviewProposal(base, halluc);
  expect('hallucinated tag flagged', hr.unknownTags.length === 1 && hr.unknownTags[0].id === 'act_h', JSON.stringify(hr.unknownTags));
  expect('custom_* not flagged', !hr.unknownTags.some(u => u.id === 'act_c'));
  expect('curated tag (cue) not flagged', !hr.unknownTags.some(u => u.id === 'cue_0'));
  expect('unknown tag → not applySafe', hr.applySafe === false);
  // Injected knownTags (schema-derived) suppress the flag.
  const hr2 = reviewProposal(base, halluc, { knownTags: new Set(['set_god_mode']) });
  expect('knownTags suppresses flag', hr2.unknownTags.length === 0);

  // A4.9 integration: supplied requirements drive the Intent verdict (base has a 'cue').
  const reqReview = reviewProposal(base, base, { requirements: [{ id: 'r', label: 'has a cue', check: { kind: 'nodePresent', xmlTag: 'cue' } }] });
  expect('intent verdict from requirements', reqReview.verdicts.intent.status !== 'not-checked' && Array.isArray(reqReview.intentResults), JSON.stringify(reqReview.verdicts.intent));
  expect('intent default not-checked w/o reqs', reviewProposal(base, base).verdicts.intent.status === 'not-checked');

  // A workspace whose graph has a hard error (dangling link) must NOT be applySafe.
  const broken = mkWs(
    [mkNode('cue_0', 'cue', 'cue', { name: 'X' })],
    [{ id: 'l0', sourceNodeId: 'cue_0', sourcePortId: 'out_act', targetNodeId: 'ghost', targetPortId: 'in_act' }],
  );
  const br = reviewProposal(base, broken);
  expect('dangling link → graph fail', br.verdicts.graph.status === 'fail', JSON.stringify(br.verdicts.graph));
  expect('graph fail → not applySafe', br.applySafe === false);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
