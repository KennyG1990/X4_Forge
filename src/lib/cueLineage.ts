/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tier 2 / T2.1 — structural cue-lineage analysis over the MD node graph.
 *
 * Builds a cue dependency tree from {nodes, links} and reports *structural* broken
 * lineage — the statically-decidable subset of MD logic bugs. It deliberately does NOT
 * attempt to prove a condition is "never met" (that is runtime/satisfiability-dependent
 * and undecidable); it reports things that are unambiguously wrong from the graph alone:
 * duplicate/unnamed cue names, dangling LOCAL cue references, fully-disconnected cues,
 * and links to missing nodes. Cross-script (`md.Script.Cue`) and qualified refs are
 * treated as external and never flagged, to avoid false positives.
 *
 * Graph model (from generateMDXML / nodeToCueMap):
 *   - a cue is a node with type === 'cue'; its name is properties.name.
 *   - root cue = not targeted by an `out_sub` link.
 *   - parent -> child cue nesting: parent `out_sub` -> child `in_flow`.
 *   - a cue's trigger events: cue `out_cond` -> event/condition node `in_cond`.
 *   - cross-cue LISTEN: an `event_cue_signalled` node's properties.cue.
 *   - cross-cue SIGNAL: signal_cue / signal_cue_instantly / reset_cue / cancel_cue,
 *     read from a structured action node's properties.cue OR a `custom_xml` rawXml.
 */

import type { MDNode, MDLink } from '../types';
import { parseXmlLenient, walkElements } from './xmlLite';

export type CueLineageSeverity = 'error' | 'warning';
export type CueLineageCode =
  | 'duplicate_cue_name'
  | 'unnamed_cue'
  | 'dangling_cue_ref'
  | 'isolated_cue'
  | 'dangling_link';

export interface CueLineageFinding {
  severity: CueLineageSeverity;
  code: CueLineageCode;
  cueId?: string;
  nodeId?: string;
  /** The offending reference text, when relevant. */
  ref?: string;
  message: string;
}

export interface CueLineageEdge {
  fromCueId: string;
  /** Resolved local cue id, or null when external/unresolved. */
  toCueId: string | null;
  toRef: string;
  kind: 'parent' | 'listen' | 'signal';
}

export interface CueLineageCueInfo {
  id: string;
  name: string;
  label: string;
  parentId: string | null;
  childIds: string[];
  hasTriggerEvent: boolean;
  /** Local cue names this cue listens for (event_cue_signalled). */
  listensTo: string[];
  /** Local cue names this cue signals/resets/cancels (custom_xml rawXml). */
  signals: string[];
  /** Whether any other cue listens-for or signals this cue. */
  referencedByOthers: boolean;
}

export interface CueLineageResult {
  cues: CueLineageCueInfo[];
  edges: CueLineageEdge[];
  findings: CueLineageFinding[];
}

const SIGNAL_TAGS = ['signal_cue_instantly', 'signal_cue', 'reset_cue', 'cancel_cue'];

/** Extract cue="X" targets from raw signal/reset/cancel XML inside a custom_xml node,
 * plus <run_actions ref="X"> / <include_actions ref="X"> library invocations — those are
 * cue-graph references too (definedCueNames indexes <library> alongside <cue>, so they
 * resolve through the same machinery; audit R1 side-find 2026-07-08).
 *
 * B6 (2026-07-09): DOM-first scan — the input is parsed with xmldom and WALKED, so
 * comments and CDATA are structurally invisible (regex could only approximate this; the
 * doc-comment-indexed-as-ref FP was the lived mechanism). Unparseable input degrades to
 * the old comment-stripped regex so malformed blobs never lose refs. */
const SIGNAL_REF_TAGS = new Set(['signal_cue_instantly', 'signal_cue', 'reset_cue', 'cancel_cue']);
const ACTION_REF_TAGS = new Set(['run_actions', 'include_actions']);

export function parseSignalCueRefs(rawXml: string): string[] {
  if (!rawXml || typeof rawXml !== 'string') return [];
  const refs: string[] = [];

  const root = parseXmlLenient(rawXml);
  if (root) {
    walkElements(root, el => {
      if (SIGNAL_REF_TAGS.has(el.nodeName)) {
        const cue = el.getAttribute('cue');
        if (cue) refs.push(cue);
      } else if (ACTION_REF_TAGS.has(el.nodeName)) {
        const ref = el.getAttribute('ref');
        if (ref) refs.push(ref);
      }
    });
    return refs;
  }

  // Degrade path: comment-strip + regex (never lose refs on malformed input).
  const text = rawXml.replace(/<!--[\s\S]*?-->/g, '');
  const re = /<\s*(signal_cue_instantly|signal_cue|reset_cue|cancel_cue)\b[^>]*\bcue\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) refs.push(m[2]);
  const raRe = /<\s*(run_actions|include_actions)\b[^>]*\bref\s*=\s*"([^"]+)"/g;
  while ((m = raRe.exec(text)) !== null) refs.push(m[2]);
  return refs;
}

/**
 * MD structural cue KEYWORDS the engine resolves at runtime — these are legal wherever a
 * cue reference is accepted (`<cancel_cue cue="parent"/>`, `<remove_offer cue="parent"/>`,
 * `<reset_cue cue="this"/>`, …) and must NEVER be flagged as unresolved cue names.
 * Source: shipping, in-game-proven usage (x4_ai_influence Cleanup_on_load precedent;
 * ROADMAP tool-improvement #8, 2026-07-02 — the resolver cried wolf on these ×3).
 */
export const MD_CUE_KEYWORDS = new Set(['this', 'parent', 'static', 'namespace']);

/**
 * THE shared cue-reference classifier (audit A2, 2026-07-09). Three resolvers used to
 * carry their own drifting copies of this logic (this file, extensionProject's index,
 * projectCrossFileValidation's qnameOf) — the keyword whitelist had to be fixed twice
 * and the multi-script duplicate fix reached only one of them. One classifier, three
 * consumers, one semantics.
 */
export type CueRefClass =
  | { kind: 'keyword' }                              // parent/this/static/namespace (exact lowercase)
  | { kind: 'local'; cue: string }                   // bare name or this.Name
  | { kind: 'cross'; script: string; cue: string }   // md.<script>.<cue>[.deeper]
  | { kind: 'external' };                            // $expr, {…}, other-qualified — never flagged

export function classifyCueRef(raw: string): CueRefClass {
  const ref = String(raw ?? '').trim();
  if (!ref) return { kind: 'external' };
  if (MD_CUE_KEYWORDS.has(ref)) return { kind: 'keyword' };
  const cross = ref.match(/^md\.([^.]+)\.(.+)$/i);
  if (cross) return { kind: 'cross', script: cross[1], cue: cross[2].split('.')[0] };
  const local = ref.startsWith('this.') ? ref.slice(5) : ref;
  if (!local || local.includes('.') || local.startsWith('$') || local.startsWith('{')) return { kind: 'external' };
  return { kind: 'local', cue: local };
}

/**
 * Resolve a cue reference to a *local* candidate name, or null if it should be treated
 * as external/qualified (and therefore never flagged). Strips a leading `this.`; any
 * remaining dot (e.g. `md.X.Y`, `parent.X`, `static.X`) means external/qualified.
 * Bare engine keywords (`parent`, `this`, `static`, `namespace`) are always-resolved
 * keyword forms, not local names — they return null so no resolver flags them.
 */
export function normalizeLocalCueRef(ref: string): string | null {
  const c = classifyCueRef(ref);
  return c.kind === 'local' ? c.cue : null;
}

/** Map each node id to the cue id that owns it (BFS over links, excluding out_sub→in_flow). */
function buildNodeOwnership(nodes: MDNode[], links: MDLink[]): Map<string, string> {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => { const arr = adj.get(a) || []; arr.push(b); adj.set(a, arr); };
  for (const l of links) {
    if (l.sourcePortId === 'out_sub' && l.targetPortId === 'in_flow') continue;
    add(l.sourceNodeId, l.targetNodeId);
    add(l.targetNodeId, l.sourceNodeId);
  }
  const owner = new Map<string, string>();
  for (const cue of nodes) {
    if (cue.type !== 'cue') continue;
    owner.set(cue.id, cue.id);
    const visited = new Set([cue.id]);
    const queue = [cue.id];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const nb of adj.get(cur) || []) {
        if (visited.has(nb)) continue;
        const nbNode = nodeById.get(nb);
        if (nbNode && nbNode.type !== 'cue') { visited.add(nb); owner.set(nb, cue.id); queue.push(nb); }
      }
    }
  }
  return owner;
}

export function analyzeCueLineage(nodes: MDNode[], links: MDLink[]): CueLineageResult {
  nodes = Array.isArray(nodes) ? nodes : [];
  links = Array.isArray(links) ? links : [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const cueNodes = nodes.filter(n => n.type === 'cue');
  const owner = buildNodeOwnership(nodes, links);

  const findings: CueLineageFinding[] = [];
  const edges: CueLineageEdge[] = [];

  // --- dangling links (source/target node missing) ---
  for (const l of links) {
    if (!nodeIds.has(l.sourceNodeId) || !nodeIds.has(l.targetNodeId)) {
      findings.push({ severity: 'error', code: 'dangling_link', nodeId: nodeIds.has(l.sourceNodeId) ? l.targetNodeId : l.sourceNodeId,
        message: `Link "${l.id}" points to a node that no longer exists.` });
    }
  }

  // --- local cue name index (duplicate counting scoped by per-cue mdScript — A2) ---
  const cueByName = new Map<string, string>(); // name -> cueId (first wins)
  const nameCounts = new Map<string, number>();
  for (const c of cueNodes) {
    const name = (c.properties?.name ?? '').toString().trim();
    if (name) {
      const scope = (c.properties?.mdScript ?? '').toString();
      nameCounts.set(`${scope}::${name}`, (nameCounts.get(`${scope}::${name}`) || 0) + 1);
      if (!cueByName.has(name)) cueByName.set(name, c.id);
    }
  }

  // build per-cue info shells
  const info = new Map<string, CueLineageCueInfo>();
  for (const c of cueNodes) {
    info.set(c.id, {
      id: c.id,
      name: (c.properties?.name ?? '').toString().trim(),
      label: c.label || c.id,
      parentId: null,
      childIds: [],
      hasTriggerEvent: false,
      listensTo: [],
      signals: [],
      referencedByOthers: false
    });
  }

  // --- parent/child via out_sub, trigger events via out_cond ---
  for (const l of links) {
    if (l.sourcePortId === 'out_sub' && l.targetPortId === 'in_flow') {
      const parent = info.get(l.sourceNodeId);
      const child = info.get(l.targetNodeId);
      if (parent && child) {
        parent.childIds.push(child.id);
        child.parentId = parent.id;
        edges.push({ fromCueId: parent.id, toCueId: child.id, toRef: child.name || child.id, kind: 'parent' });
      }
    }
    if (l.sourcePortId === 'out_cond') {
      const cue = info.get(l.sourceNodeId);
      if (cue) cue.hasTriggerEvent = true;
    }
  }

  // --- cross-cue LISTEN (event_cue_signalled) ---
  for (const ev of nodes) {
    if (ev.xmlTag !== 'event_cue_signalled') continue;
    const ownerCueId = owner.get(ev.id);
    const cue = ownerCueId ? info.get(ownerCueId) : undefined;
    if (!cue) continue;
    const ref = (ev.properties?.cue ?? '').toString().trim();
    if (!ref) continue;
    const local = normalizeLocalCueRef(ref);
    const toCueId = local ? (cueByName.get(local) ?? null) : null;
    edges.push({ fromCueId: cue.id, toCueId, toRef: ref, kind: 'listen' });
    if (local) {
      cue.listensTo.push(local);
      if (toCueId) { const t = info.get(toCueId); if (t) t.referencedByOthers = true; }
      else findings.push({ severity: 'error', code: 'dangling_cue_ref', cueId: cue.id, nodeId: ev.id, ref,
        message: `Cue "${cue.name || cue.id}" listens for local cue "${ref}" which doesn't exist.` });
    }
  }

  // --- cross-cue SIGNAL: structured signal_cue/reset_cue/cancel_cue nodes OR custom_xml rawXml ---
  for (const act of nodes) {
    let refs: string[] = [];
    if (act.xmlTag === 'custom_xml') {
      refs = parseSignalCueRefs((act.properties?.rawXml ?? '').toString());
    } else if (SIGNAL_TAGS.indexOf(act.xmlTag) !== -1) {
      const cueRef = (act.properties?.cue ?? '').toString().trim();
      if (cueRef) refs = [cueRef];
    }
    if (refs.length === 0) continue;
    const ownerCueId = owner.get(act.id);
    const cue = ownerCueId ? info.get(ownerCueId) : undefined;
    if (!cue) continue;
    for (const ref of refs) {
      const local = normalizeLocalCueRef(ref);
      const toCueId = local ? (cueByName.get(local) ?? null) : null;
      edges.push({ fromCueId: cue.id, toCueId, toRef: ref, kind: 'signal' });
      if (local) {
        cue.signals.push(local);
        if (toCueId) { const t = info.get(toCueId); if (t) t.referencedByOthers = true; }
        else findings.push({ severity: 'error', code: 'dangling_cue_ref', cueId: cue.id, nodeId: act.id, ref,
          message: `Cue "${cue.name || cue.id}" signals local cue "${ref}" which doesn't exist.` });
      }
    }
  }

  // --- duplicate / unnamed cue names (scoped by SCRIPT, matching LAW 1: the same name
  // in DIFFERENT mdScript files is legal — audit A2 closed the divergence where this
  // check stayed workspace-global after types.ts was fixed) ---
  for (const [scopedName, count] of nameCounts) {
    if (count > 1) {
      const name = scopedName.split('::').pop() || scopedName;
      findings.push({ severity: 'error', code: 'duplicate_cue_name', ref: name,
        message: `Cue name "${name}" is used by ${count} cues; cue names must be unique within a script.` });
    }
  }
  for (const c of cueNodes) {
    const name = (c.properties?.name ?? '').toString().trim();
    if (!name) findings.push({ severity: 'warning', code: 'unnamed_cue', cueId: c.id,
      message: `Cue "${c.label || c.id}" has no name; it can't be referenced and won't compile cleanly.` });
  }

  // --- isolated cue (fully disconnected and unreferenced) ---
  const linkedNodeIds = new Set<string>();
  for (const l of links) { linkedNodeIds.add(l.sourceNodeId); linkedNodeIds.add(l.targetNodeId); }
  for (const c of cueNodes) {
    const ci = info.get(c.id)!;
    const hasAnyLink = linkedNodeIds.has(c.id);
    if (!hasAnyLink && !ci.referencedByOthers) {
      findings.push({ severity: 'warning', code: 'isolated_cue', cueId: c.id,
        message: `Cue "${ci.name || ci.label}" is fully disconnected — no conditions, actions, sub-cues, parent, or references. It is dead code.` });
    }
  }

  return { cues: Array.from(info.values()), edges, findings };
}

/** Self-test oracle: known-good and known-broken graphs assert the analyzer behaves. */
export function runCueLineageSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const N = (id: string, type: any, xmlTag: string, properties: any = {}): MDNode =>
    ({ id, type, xmlTag, properties, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] } as any);
  const L = (id: string, s: string, sp: string, t: string, tp: string): MDLink =>
    ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

  // ---- clean graph: Parent cue with sub-cue Child; Listener listens for Parent; Worker signals Listener ----
  const cleanNodes: MDNode[] = [
    N('c_parent', 'cue', 'cue', { name: 'Parent' }),
    N('c_child', 'cue', 'cue', { name: 'Child' }),
    N('e_child', 'event', 'event_cue_signalled', { cue: 'md.Setup.Start' }),
    N('c_listener', 'cue', 'cue', { name: 'Listener' }),
    N('e_listen', 'event', 'event_cue_signalled', { cue: 'Parent' }),
    N('c_worker', 'cue', 'cue', { name: 'Worker' }),
    N('a_signal', 'action', 'custom_xml', { rawXml: '<signal_cue cue="Listener" />' })
  ];
  const cleanLinks: MDLink[] = [
    L('l1', 'c_parent', 'out_sub', 'c_child', 'in_flow'),
    L('l2', 'c_child', 'out_cond', 'e_child', 'in_cond'),
    L('l3', 'c_listener', 'out_cond', 'e_listen', 'in_cond'),
    L('l4', 'c_worker', 'out_act', 'a_signal', 'in_act')
  ];
  const clean = analyzeCueLineage(cleanNodes, cleanLinks);
  ok('clean_no_errors', clean.findings.filter(f => f.severity === 'error').length === 0, clean.findings);
  ok('clean_parent_child_edge', clean.edges.some(e => e.kind === 'parent' && e.fromCueId === 'c_parent' && e.toCueId === 'c_child'));
  ok('clean_listen_resolves', clean.edges.some(e => e.kind === 'listen' && e.toRef === 'Parent' && e.toCueId === 'c_parent'));
  ok('clean_signal_resolves', clean.edges.some(e => e.kind === 'signal' && e.toRef === 'Listener' && e.toCueId === 'c_listener'));
  ok('external_ref_not_flagged', !clean.findings.some(f => f.code === 'dangling_cue_ref'));
  ok('child_parent_set', clean.cues.find(c => c.id === 'c_child')!.parentId === 'c_parent');

  // ---- broken graph: dup name, dangling listen, dangling signal, isolated cue, dangling link ----
  const badNodes: MDNode[] = [
    N('b1', 'cue', 'cue', { name: 'Dup' }),
    N('b2', 'cue', 'cue', { name: 'Dup' }),
    N('b3', 'cue', 'cue', { name: 'Listener2' }),
    N('be', 'event', 'event_cue_signalled', { cue: 'NoSuchCue' }),
    N('b4', 'cue', 'cue', { name: 'Signaller2' }),
    N('ba', 'action', 'custom_xml', { rawXml: '<reset_cue cue="GhostCue" />' }),
    N('b5', 'cue', 'cue', { name: 'Lonely' }),
    N('b6', 'cue', 'cue', { name: '' })
  ];
  const badLinks: MDLink[] = [
    L('bl1', 'b3', 'out_cond', 'be', 'in_cond'),
    L('bl2', 'b4', 'out_act', 'ba', 'in_act'),
    L('bl3', 'b1', 'out_act', 'missing_node', 'in_act')
  ];
  const bad = analyzeCueLineage(badNodes, badLinks);
  const has = (code: string) => bad.findings.some(f => f.code === code);
  ok('flags_duplicate_name', has('duplicate_cue_name'));
  ok('flags_dangling_listen', bad.findings.some(f => f.code === 'dangling_cue_ref' && f.ref === 'NoSuchCue'));
  ok('flags_dangling_signal', bad.findings.some(f => f.code === 'dangling_cue_ref' && f.ref === 'GhostCue'));
  ok('flags_isolated_cue', bad.findings.some(f => f.code === 'isolated_cue' && f.cueId === 'b5'));
  ok('flags_unnamed_cue', bad.findings.some(f => f.code === 'unnamed_cue' && f.cueId === 'b6'));
  ok('flags_dangling_link', has('dangling_link'));

  // helpers
  ok('normalize_strips_this', normalizeLocalCueRef('this.Foo') === 'Foo');
  ok('normalize_external_is_null', normalizeLocalCueRef('md.Setup.Start') === null);
  ok('normalize_keyword_parent_is_null', normalizeLocalCueRef('parent') === null);
  ok('normalize_keyword_this_is_null', normalizeLocalCueRef('this') === null);
  ok('normalize_keyword_static_is_null', normalizeLocalCueRef('static') === null);
  ok('normalize_keyword_namespace_is_null', normalizeLocalCueRef('namespace') === null);
  // shared classifier (A2) — the one semantics all three resolvers consume
  ok('classify_keyword', classifyCueRef('parent').kind === 'keyword');
  ok('classify_local_bare', JSON.stringify(classifyCueRef('MyCue')) === JSON.stringify({ kind: 'local', cue: 'MyCue' }));
  ok('classify_local_this', JSON.stringify(classifyCueRef('this.MyCue')) === JSON.stringify({ kind: 'local', cue: 'MyCue' }));
  ok('classify_cross', JSON.stringify(classifyCueRef('md.SomeScript.SomeCue.Deep')) === JSON.stringify({ kind: 'cross', script: 'SomeScript', cue: 'SomeCue' }));
  ok('classify_external_expr', classifyCueRef('$OfferCue').kind === 'external' && classifyCueRef('static.X').kind === 'external');
  ok('classify_camel_parent_is_local', classifyCueRef('Parent').kind === 'local');
  // duplicate scoping (A2): same name in DIFFERENT scripts is legal; same script flags
  {
    const dn = (id: string, name: string, mdScript: string): MDNode =>
      ({ id, type: 'cue', xmlTag: 'cue', label: name, x: 0, y: 0, inputs: [], outputs: [], properties: { name, mdScript } } as unknown as MDNode);
    const multi = analyzeCueLineage([dn('m1', 'State', 'combat'), dn('m2', 'State', 'conversation')], []);
    ok('multiscript_same_name_not_flagged', !multi.findings.some(f => f.code === 'duplicate_cue_name'), JSON.stringify(multi.findings));
    const same = analyzeCueLineage([dn('s1', 'State', 'combat'), dn('s2', 'State', 'combat')], []);
    ok('same_script_duplicate_flagged', same.findings.some(f => f.code === 'duplicate_cue_name' && f.ref === 'State'), JSON.stringify(same.findings));
  }
  ok('parse_signal_multi', parseSignalCueRefs('<signal_cue cue="A"/><cancel_cue cue="B" />').join(',') === 'A,B');

  // structured signal node (not custom_xml): signal_cue with properties.cue
  const sNodes: MDNode[] = [
    N('sc1', 'cue', 'cue', { name: 'Caller' }),
    N('sc_act', 'action', 'signal_cue', { cue: 'Target' }),
    N('sc2', 'cue', 'cue', { name: 'Target' }),
    N('sc3', 'cue', 'cue', { name: 'BadCaller' }),
    N('sc_bad', 'action', 'reset_cue', { cue: 'NoStruct' })
  ];
  const sLinks: MDLink[] = [ L('sl1','sc1','out_act','sc_act','in_act'), L('sl2','sc3','out_act','sc_bad','in_act') ];
  const sr = analyzeCueLineage(sNodes, sLinks);
  ok('structured_signal_resolves', sr.edges.some(e => e.kind === 'signal' && e.toRef === 'Target' && e.toCueId === 'sc2'));
  ok('structured_signal_dangling_flagged', sr.findings.some(f => f.code === 'dangling_cue_ref' && f.ref === 'NoStruct'));

  // ---- B6: DOM-first ref scanning — comments/CDATA structurally invisible ----
  ok('b6_commented_signal_not_indexed',
    parseSignalCueRefs('<actions><!-- <signal_cue cue="Ghost"/> --><signal_cue cue="Real"/></actions>').join(',') === 'Real');
  ok('b6_doc_comment_ref_not_indexed (the lived FP)',
    parseSignalCueRefs('<actions><!-- invoke via <run_actions ref="…"> with params --><run_actions ref="md.X.Lib"/></actions>').join(',') === 'md.X.Lib');
  ok('b6_cdata_not_indexed',
    parseSignalCueRefs('<actions><debug_text text="x"><![CDATA[ <signal_cue cue="InCdata"/> ]]></debug_text></actions>').length === 0);
  ok('b6_multi_top_level_fragment_parses',
    parseSignalCueRefs('<signal_cue cue="A"/><cancel_cue cue="B"/>').join(',') === 'A,B');
  ok('b6_run_and_include_actions_captured',
    parseSignalCueRefs('<x><run_actions ref="R1"/><include_actions ref="R2"/></x>').join(',') === 'R1,R2');
  ok('b6_malformed_degrades_to_regex_without_losing_refs',
    parseSignalCueRefs('<broken <signal_cue cue="StillFound"/>').includes('StillFound'));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
