/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workspace quick-fixes — "Fix it for me" buttons (beta-UX pass, 2026-07-09).
 *
 * The validators became excellent at SAYING what's wrong; this engine makes the
 * obvious repairs one click, like spellcheck's "did you mean". Two halves:
 *   listQuickFixes(workspace, opts)   → deterministic, self-describing descriptors
 *   applyQuickFix(workspace, fix)     → pure application (new workspace, no mutation)
 * Descriptors carry everything needed to apply, so listing can run server-side
 * (where the scriptproperty union lives) and application client-side (with the
 * user's undo checkpoint around it).
 *
 * Covered fix classes (each maps to a proven failure from the AARs / LAW rules):
 *   qf.checkinterval    — check-only cue missing checkinterval/onfail → add checkinterval="1s"
 *   qf.event_attrs      — event-based cue carrying forbidden onfail/checkinterval/checktime → remove them
 *   qf.instantiate_ui   — root one-shot <event_ui_triggered> listener → instantiate="true" + namespace="this"
 *   qf.param3_barekey   — `$x.key` read off event.param3 where key isn't a property → `$x.$key`
 */

import type { MDNode, MDLink, ModWorkspace } from '../types';

export interface QuickFixDescriptor {
  id: string;
  code: 'qf.checkinterval' | 'qf.event_attrs' | 'qf.instantiate_ui' | 'qf.param3_barekey';
  nodeId: string;
  nodeLabel: string;
  title: string;
  detail: string;
  /** property operations to apply, in order */
  ops: Array<
    | { op: 'set_property'; key: string; value: string }
    | { op: 'delete_property'; key: string }
    | { op: 'replace_in_property'; key: string; from: string; to: string }
  >;
}

const EVENT_TAG = /^event_/i;

function cueConditionNodes(cue: MDNode, nodes: MDNode[], links: MDLink[]): MDNode[] {
  const ids = links.filter(l => l.sourceNodeId === cue.id && l.sourcePortId === 'out_cond').map(l => l.targetNodeId);
  return nodes.filter(n => ids.includes(n.id));
}

/** True when a condition node IS or CONTAINS an event (imported mods carry events inside
 * custom_condition rawXml blobs — Save_identity's `<check_any><event_game_started/>` was
 * exactly this shape and false-positived the first checkinterval listing). */
function conditionBearsEvent(node: MDNode): boolean {
  if (EVENT_TAG.test(node.xmlTag || '')) return true;
  return /<event_/i.test(String(node.properties?.rawXml ?? ''));
}

/** True when we can be POSITIVE the condition set is check-only: every condition is a
 * known non-event tag with NO raw blob that could hide events. Conservative by design —
 * an unreadable blob means "unknown", and unknown must never produce a fix. */
function definitelyCheckOnly(conditions: MDNode[]): boolean {
  if (!conditions.length) return false;
  return conditions.every(c =>
    !conditionBearsEvent(c)
    && !String(c.properties?.rawXml ?? '').trim()
  );
}

export function listQuickFixes(
  workspace: Pick<ModWorkspace, 'nodes' | 'links'>,
  opts: { propertyUnion?: Set<string> } = {},
): QuickFixDescriptor[] {
  const out: QuickFixDescriptor[] = [];
  const nodes = workspace.nodes || [];
  const links = workspace.links || [];

  for (const cue of nodes) {
    if (cue.type !== 'cue') continue;
    const name = String(cue.properties?.name ?? cue.label ?? cue.id);
    const conditions = cueConditionNodes(cue, nodes, links);
    const hasEvent = conditions.some(conditionBearsEvent);
    const hasCheckCondition = definitelyCheckOnly(conditions);
    const props = cue.properties || {};

    // LAW 5 — check-only cue needs checkinterval/onfail
    const hasInterval = String(props.checkinterval ?? '').trim().length > 0;
    const hasOnfail = String(props.onfail ?? '').trim().length > 0;
    if (hasCheckCondition && !hasInterval && !hasOnfail) {
      out.push({
        id: `qf.checkinterval:${cue.id}`,
        code: 'qf.checkinterval',
        nodeId: cue.id,
        nodeLabel: name,
        title: `Add checkinterval="1s" to "${name}"`,
        detail: 'Check-only cues need checkinterval (or onfail) so the engine knows how often to re-evaluate — without it the cue is rejected at load.',
        ops: [{ op: 'set_property', key: 'checkinterval', value: '1s' }],
      });
    }

    // LAW 6 — event cue must not carry onfail/checkinterval/checktime
    if (hasEvent) {
      const forbidden = (['onfail', 'checkinterval', 'checktime'] as const)
        .filter(k => String(props[k] ?? '').trim().length > 0);
      if (forbidden.length) {
        out.push({
          id: `qf.event_attrs:${cue.id}`,
          code: 'qf.event_attrs',
          nodeId: cue.id,
          nodeLabel: name,
          title: `Remove ${forbidden.join('/')} from event cue "${name}"`,
          detail: 'Event-based cues must not use onfail/checkinterval/checktime — the engine rejects the combination.',
          ops: forbidden.map(k => ({ op: 'delete_property' as const, key: k })),
        });
      }

      // Pitfall — one-shot UI listener (graph version of md_pitfall.ui_listener_one_shot)
      const hasUiEvent = conditions.some(c => (c.xmlTag || '').toLowerCase() === 'event_ui_triggered');
      const instantiated = String(props.instantiate ?? '').toLowerCase() === 'true';
      if (hasUiEvent && !instantiated) {
        out.push({
          id: `qf.instantiate_ui:${cue.id}`,
          code: 'qf.instantiate_ui',
          nodeId: cue.id,
          nodeLabel: name,
          title: `Make UI listener "${name}" repeatable (instantiate="true")`,
          detail: 'A UI-event listener without instantiate fires ONCE then goes dead (the proven On_action bug). instantiate="true" + namespace="this" keeps it alive per event.',
          ops: [
            { op: 'set_property', key: 'instantiate', value: 'true' },
            ...(String(props.namespace ?? '').trim() ? [] : [{ op: 'set_property' as const, key: 'namespace', value: 'this' }]),
          ],
        });
      }
    }
  }

  // Pitfall — param3 bare-key reads inside node property VALUES (needs the union)
  if (opts.propertyUnion?.size) {
    const union = opts.propertyUnion;
    // find $var assigned from event.param3 anywhere, then bare reads in any property value
    const assigned = new Set<string>();
    for (const n of nodes) {
      if ((n.xmlTag || '') === 'set_value' && String(n.properties?.exact ?? '') === 'event.param3') {
        const nm = String(n.properties?.name ?? '').trim();
        if (nm.startsWith('$')) assigned.add(nm);
      }
    }
    if (assigned.size) {
      for (const n of nodes) {
        for (const [key, raw] of Object.entries(n.properties || {})) {
          const text = String(raw ?? '');
          for (const varName of assigned) {
            const re = new RegExp(varName.replace('$', '\\$') + '\\.(?![\\$\\{\\[])([A-Za-z_]\\w*)', 'g');
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
              const ident = m[1].toLowerCase();
              if (union.has(ident)) continue;
              out.push({
                id: `qf.param3_barekey:${n.id}:${key}:${m[1]}`,
                code: 'qf.param3_barekey',
                nodeId: n.id,
                nodeLabel: String(n.properties?.name ?? n.label ?? n.id),
                title: `Change ${varName}.${m[1]} → ${varName}.$${m[1]}`,
                detail: `${varName} holds a Lua table (event.param3); "${m[1]}" is not a script property, so the bare read silently evaluates false. You almost certainly meant the $-key form.`,
                ops: [{ op: 'replace_in_property', key, from: `${varName}.${m[1]}`, to: `${varName}.$${m[1]}` }],
              });
            }
          }
        }
      }
    }
  }

  return out;
}

/** Pure application: returns a NEW workspace with the descriptor's ops applied. */
export function applyQuickFix<T extends Pick<ModWorkspace, 'nodes'>>(workspace: T, fix: QuickFixDescriptor): T {
  return {
    ...workspace,
    nodes: workspace.nodes.map(n => {
      if (n.id !== fix.nodeId) return n;
      const props: Record<string, unknown> = { ...(n.properties || {}) };
      for (const op of fix.ops) {
        if (op.op === 'set_property') props[op.key] = op.value;
        else if (op.op === 'delete_property') delete props[op.key];
        else if (op.op === 'replace_in_property') props[op.key] = String(props[op.key] ?? '').split(op.from).join(op.to);
      }
      return { ...n, properties: props };
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Oracle.
 * ------------------------------------------------------------------ */

export function runWorkspaceQuickFixesSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  const N = (id: string, type: MDNode['type'], xmlTag: string, properties: Record<string, unknown>): MDNode =>
    ({ id, type, xmlTag, label: id, x: 0, y: 0, inputs: [], outputs: [], properties } as unknown as MDNode);
  const L = (id: string, s: string, sp: string, t: string, tp: string): MDLink =>
    ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp } as unknown as MDLink);

  const ws = {
    nodes: [
      N('c1', 'cue', 'cue', { name: 'CheckOnly' }),
      N('k1', 'condition', 'check_value', { value: '$x gt 1' }),
      N('c2', 'cue', 'cue', { name: 'EventCue', checkinterval: '5s' }),
      N('e2', 'event', 'event_object_destroyed', {}),
      N('c3', 'cue', 'cue', { name: 'On_action' }),
      N('e3', 'event', 'event_ui_triggered', { screen: "'aic'", control: "'act'" }),
      N('s1', 'action', 'set_value', { name: '$d', exact: 'event.param3' }),
      N('d1', 'action', 'do_if', { value: "$d.l1 == 'relation' and $d.count gt 0" }),
    ],
    links: [
      L('l1', 'c1', 'out_cond', 'k1', 'in_cond'),
      L('l2', 'c2', 'out_cond', 'e2', 'in_cond'),
      L('l3', 'c3', 'out_cond', 'e3', 'in_cond'),
    ],
  };
  const union = new Set(['count', 'exists']);
  const fixes = listQuickFixes(ws, { propertyUnion: union });
  const byCode = (c: string) => fixes.filter(f => f.code === c);

  ok('check-only cue → checkinterval fix', byCode('qf.checkinterval').length === 1 && byCode('qf.checkinterval')[0].nodeId === 'c1', JSON.stringify(byCode('qf.checkinterval')));
  ok('event cue with forbidden attr → removal fix', byCode('qf.event_attrs').length === 1 && byCode('qf.event_attrs')[0].ops[0].op === 'delete_property');
  ok('one-shot UI listener → instantiate fix (with namespace)', byCode('qf.instantiate_ui').length === 1 && byCode('qf.instantiate_ui')[0].ops.length === 2);
  ok('param3 barekey → $key fix (union-aware: count passes, l1 flagged)',
    byCode('qf.param3_barekey').length === 1 && byCode('qf.param3_barekey')[0].title.includes('$d.$l1'), JSON.stringify(byCode('qf.param3_barekey')));

  // application is pure + correct
  const applied1 = applyQuickFix(ws, byCode('qf.checkinterval')[0]);
  ok('apply adds checkinterval', String(applied1.nodes.find(n => n.id === 'c1')!.properties!.checkinterval) === '1s');
  ok('apply is non-mutating', ws.nodes.find(n => n.id === 'c1')!.properties!.checkinterval === undefined);
  const applied2 = applyQuickFix(ws, byCode('qf.event_attrs')[0]);
  ok('apply removes forbidden attr', applied2.nodes.find(n => n.id === 'c2')!.properties!.checkinterval === undefined);
  const applied4 = applyQuickFix(ws, byCode('qf.param3_barekey')[0]);
  ok('apply rewrites only the bare key', String(applied4.nodes.find(n => n.id === 'd1')!.properties!.value) === "$d.$l1 == 'relation' and $d.count gt 0");

  // fixed workspace produces no repeat fixes
  let clean = ws as typeof ws;
  for (const f of fixes) clean = applyQuickFix(clean, f) as typeof ws;
  ok('after applying all fixes, none remain', listQuickFixes(clean, { propertyUnion: union }).length === 0,
    JSON.stringify(listQuickFixes(clean, { propertyUnion: union }).map(f => f.code)));

  ok('degrades on empty workspace', listQuickFixes({ nodes: [], links: [] }).length === 0);

  // imported-mod shape: events hidden in custom_condition rawXml (the Save_identity FP)
  const blobWs = {
    nodes: [
      N('b1', 'cue', 'cue', { name: 'Save_identity', instantiate: 'true', namespace: 'this' }),
      N('bc1', 'condition', 'custom_condition', { rawXml: '<check_any><event_game_started/><event_cue_signalled cue="md.X.Y"/></check_any>' }),
      N('b2', 'cue', 'cue', { name: 'BlobNoEvent' }),
      N('bc2', 'condition', 'custom_condition', { rawXml: '<check_value value="$x"/>' }),
    ],
    links: [
      L('bl1', 'b1', 'out_cond', 'bc1', 'in_cond'),
      L('bl2', 'b2', 'out_cond', 'bc2', 'in_cond'),
    ],
  };
  const blobFixes = listQuickFixes(blobWs);
  ok('events inside rawXml blobs → NO checkinterval fix (the Save_identity false positive)',
    !blobFixes.some(f => f.code === 'qf.checkinterval' && f.nodeId === 'b1'), JSON.stringify(blobFixes));
  ok('event-free rawXml blob → still NO fix (unknown must never produce a fix)',
    !blobFixes.some(f => f.code === 'qf.checkinterval' && f.nodeId === 'b2'), JSON.stringify(blobFixes));

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
