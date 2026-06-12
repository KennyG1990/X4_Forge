/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Node-level schema diagnostics — maps the game-schema validation back to the EXACT
 * node that produced it, so the canvas can show an in-your-face error/warning badge on
 * the offending node instead of burying it in the Doctor panel.
 *
 * Deterministic and schema-driven: the only source of truth is the parsed md.xsd index
 * (passed in as a minimal `NodeSchemaView` so the engine stays pure and testable). No AI.
 *
 * Two checks, both node-mappable:
 *   - unknown_element: the node's xmlTag is not a declared element in the game schema
 *     (catches e.g. `add_value`, which isn't real — the real form is `set_value operation="add"`).
 *   - missing_required_attr: a schema-required attribute is absent from the node.
 *     Skipped for the handful of curated tags the compiler RENAMES/relocates attributes for
 *     (show_help→custom, create_ship→owner child, etc.), to avoid false positives — those
 *     are still covered by the post-compile XML validation in the Doctor.
 */

import type { MDNode } from '../types';

export interface NodeSchemaView {
  /** Is this element declared in the game schema (md.xsd/common.xsd)? */
  has(tag: string): boolean;
  /** Required attribute names for a declared element. */
  requiredAttrs(tag: string): string[];
  /** Whether the schema actually loaded (if false, callers should skip — no false negatives). */
  loaded: boolean;
}

export type NodeDiagSeverity = 'error' | 'warning';
export type NodeDiagCode = 'unknown_element' | 'missing_required_attr';
export interface NodeDiagnostic {
  nodeId: string;
  severity: NodeDiagSeverity;
  code: NodeDiagCode;
  tag: string;
  message: string;
}

/** Node kinds/tags the studio owns — never validated as schema elements. */
const STUDIO_SPECIAL_TAGS = new Set([
  'cue', 'comment', 'custom_xml', 'custom_event', 'custom_condition',
]);
const STUDIO_SPECIAL_TYPES = new Set(['cue', 'comment', 'variable']);

/** Tags the compiler transforms (renames/relocates attrs) — skip attribute checks. */
const TRANSFORM_TAGS = new Set([
  'show_help', 'create_ship', 'create_station', 'set_object_shieldlevel', 'set_object_hulllevel',
]);

export function validateNodesAgainstSchema(nodes: MDNode[], schema: NodeSchemaView): NodeDiagnostic[] {
  const out: NodeDiagnostic[] = [];
  if (!schema || !schema.loaded) return out; // no schema → assert nothing (no false flags)
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (!n || n.includeInBuild === false) continue;
    const tag = n.xmlTag;
    if (!tag) continue;
    if (STUDIO_SPECIAL_TAGS.has(tag) || STUDIO_SPECIAL_TYPES.has(n.type as string)) continue;

    if (!schema.has(tag)) {
      out.push({
        nodeId: n.id, severity: 'warning', code: 'unknown_element', tag,
        message: `<${tag}> is not a declared element in the game schema (md.xsd). Likely a typo or wrong element name.`,
      });
      continue;
    }
    if (TRANSFORM_TAGS.has(tag)) continue;

    for (const a of schema.requiredAttrs(tag)) {
      const v = n.properties ? n.properties[a] : undefined;
      if (v === undefined || v === null || String(v).trim() === '') {
        out.push({
          nodeId: n.id, severity: 'error', code: 'missing_required_attr', tag,
          message: `<${tag}> is missing required attribute "${a}".`,
        });
      }
    }
  }
  return out;
}

/** Severity rollup per node, for the canvas badge. */
export function summarizeByNode(diags: NodeDiagnostic[]): Record<string, { severity: NodeDiagSeverity; messages: string[] }> {
  const map: Record<string, { severity: NodeDiagSeverity; messages: string[] }> = {};
  for (const d of diags) {
    const cur = map[d.nodeId] || { severity: 'warning' as NodeDiagSeverity, messages: [] };
    cur.messages.push(d.message);
    if (d.severity === 'error') cur.severity = 'error';
    map[d.nodeId] = cur;
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * Uses a MOCK schema view so it's pure and game-file-independent.
 * ------------------------------------------------------------------ */
export function runNodeDiagnosticsSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const N = (id: string, type: any, xmlTag: string, properties: any = {}): MDNode =>
    ({ id, type, xmlTag, properties, label: id, x: 0, y: 0, propertiesSchema: [], inputs: [], outputs: [] } as any);

  const mock: NodeSchemaView = {
    loaded: true,
    has: (t) => ['set_value', 'remove_value', 'reward_player', 'write_to_logbook', 'set_faction_relation', 'show_help', 'event_game_started'].includes(t),
    requiredAttrs: (t) => t === 'write_to_logbook' ? ['title'] : t === 'set_faction_relation' ? ['value'] : t === 'set_value' ? ['name'] : [],
  };

  const nodes: MDNode[] = [
    N('c', 'cue', 'cue', { name: 'C' }),
    N('add', 'action', 'add_value', { name: '$x' }),                              // unknown element (not real)
    N('sv', 'action', 'set_value', { name: '$x', exact: '1' }),                   // ok
    N('logBad', 'action', 'write_to_logbook', { category: 'general', text: 'hi' }), // missing required title
    N('logOk', 'action', 'write_to_logbook', { title: 'T', text: 'hi' }),         // ok
    N('relBad', 'action', 'set_faction_relation', { faction: 'player' }),         // missing required value
    N('cx', 'action', 'custom_xml', { rawXml: '<foo/>' }),                        // studio-special: skipped
    N('help', 'action', 'show_help', { text: 'hi' }),                             // transform tag: attr check skipped (text→custom)
  ];
  const d = validateNodesAgainstSchema(nodes, mock);
  const has = (nodeId: string, code: string) => d.some((x) => x.nodeId === nodeId && x.code === code);

  ok('unknown_element_flagged', has('add', 'unknown_element'), d);
  ok('valid_node_clean', !d.some((x) => x.nodeId === 'sv'));
  ok('missing_required_attr_flagged', has('logBad', 'missing_required_attr'), d);
  ok('present_required_attr_clean', !d.some((x) => x.nodeId === 'logOk'), d);
  ok('missing_value_flagged', has('relBad', 'missing_required_attr'), d);
  ok('custom_xml_skipped', !d.some((x) => x.nodeId === 'cx'));
  ok('transform_tag_attr_skipped', !d.some((x) => x.nodeId === 'help'), d);
  ok('cue_skipped', !d.some((x) => x.nodeId === 'c'));

  // severity: unknown=warning, missing-attr=error
  ok('unknown_is_warning', d.find((x) => x.nodeId === 'add')!.severity === 'warning');
  ok('missing_attr_is_error', d.find((x) => x.nodeId === 'logBad')!.severity === 'error');

  // rollup
  const sum = summarizeByNode(d);
  ok('rollup_error_node', sum['logBad']?.severity === 'error');
  ok('rollup_has_messages', (sum['add']?.messages || []).length === 1);

  // no schema → no findings (no false negatives surfaced as false positives)
  ok('unloaded_schema_silent', validateNodesAgainstSchema(nodes, { ...mock, loaded: false }).length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
