/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Composite blocks (53rd pass — UX grind, gap G10).
 *
 * A composite is ONE palette entry that drops a whole common pattern (several wired nodes)
 * instead of a single primitive — so a newcomer gets "Tiered Reward" or "If / Else" in one
 * click rather than hand-wiring 4 nodes. Each `build(seed, x, y)` returns a self-consistent
 * subgraph with unique ids (prefixed by `seed`) positioned around (x, y); the caller appends
 * it to the workspace (ports are hydrated by sanitizeWorkspace).
 */

import type { MDNode, MDLink, ModWorkspace } from '../types';
import { sanitizeWorkspace, generateMDXML, validateModWorkspace } from '../types';
import { buildFileBridgePollingSubgraph } from './fileBridgeTransport';

export interface CompositeBlock {
  id: string;
  title: string;
  blurb: string;
  /** first node id in the subgraph (what a drag-off-pin link should attach to), given the seed */
  entryId: (seed: string) => string;
  build: (seed: string, x: number, y: number) => { nodes: Partial<MDNode>[]; links: MDLink[] };
}

const N = (id: string, type: MDNode['type'], xmlTag: string, x: number, y: number, properties: any = {}): Partial<MDNode> =>
  ({ id, type, xmlTag, x, y, properties, label: xmlTag });
const L = (s: string, sp: string, t: string, tp: string): MDLink =>
  ({ id: `lk_${s}_${sp}_${t}`, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

export const COMPOSITE_BLOCKS: CompositeBlock[] = [
  {
    id: 'on_game_start',
    title: 'Trigger: On Game Start',
    blurb: 'A cue already wired to fire once when a game starts.',
    entryId: (s) => `${s}_cue`,
    build: (s, x, y) => ({
      nodes: [
        N(`${s}_cue`, 'cue', 'cue', x, y, { name: 'My_Cue', namespace: 'this' }),
        N(`${s}_ev`, 'event', 'event_game_started', x, y + 220, {}),
      ],
      links: [L(`${s}_cue`, 'out_cond', `${s}_ev`, 'in_cond')],
    }),
  },
  {
    id: 'if_else',
    title: 'If / Else',
    blurb: 'A do_if + do_else scaffold — wire each Branch Body to fill it in.',
    entryId: (s) => `${s}_if`,
    build: (s, x, y) => ({
      nodes: [
        N(`${s}_if`, 'action', 'do_if', x, y, { value: '$value ge 1' }),
        N(`${s}_else`, 'action', 'do_else', x, y + 200, {}),
      ],
      links: [L(`${s}_if`, 'out_next', `${s}_else`, 'in_act')],
    }),
  },
  {
    id: 'tiered_reward',
    title: 'Tiered Reward',
    blurb: 'If a variable is high, give a big reward; otherwise a small one.',
    entryId: (s) => `${s}_if`,
    build: (s, x, y) => ({
      nodes: [
        N(`${s}_if`, 'action', 'do_if', x, y, { value: '$score ge 5' }),
        N(`${s}_big`, 'action', 'reward_player', x + 360, y - 60, { money: '100000' }),
        N(`${s}_else`, 'action', 'do_else', x, y + 200, {}),
        N(`${s}_small`, 'action', 'reward_player', x + 360, y + 200, { money: '10000' }),
      ],
      links: [
        L(`${s}_if`, 'out_body', `${s}_big`, 'in_act'),
        L(`${s}_if`, 'out_next', `${s}_else`, 'in_act'),
        L(`${s}_else`, 'out_body', `${s}_small`, 'in_act'),
      ],
    }),
  },
  {
    id: 'repeat_loop',
    title: 'Repeat Loop',
    blurb: 'A do_while loop with a counter that increments each pass.',
    entryId: (s) => `${s}_while`,
    build: (s, x, y) => ({
      nodes: [
        N(`${s}_while`, 'action', 'do_while', x, y, { value: '$i lt 3' }),
        N(`${s}_inc`, 'action', 'set_value', x + 360, y, { name: '$i', operation: 'add', exact: '1' }),
      ],
      links: [L(`${s}_while`, 'out_body', `${s}_inc`, 'in_act')],
    }),
  },
  {
    id: 'file_bridge_poll',
    title: 'File Bridge Poll',
    blurb: 'Write a request file, poll for a response, then timeout cleanly.',
    entryId: (s) => `${s}_cue`,
    build: (s, x, y) => ({
      nodes: [
        N(`${s}_cue`, 'cue', 'cue', x, y, { name: 'File_Bridge_Request', namespace: 'this' }),
        N(`${s}_poll`, 'action', 'custom_xml', x, y + 220, {
          rawXml: buildFileBridgePollingSubgraph({
            namespace: 'x4forge_bridge',
            actionId: 'send_prompt',
            directory: 'x4_forge_bridge',
            requestFile: 'send_prompt_request.json',
            responseFile: 'send_prompt_response.json',
            requestPayloadExpr: `table[action='send_prompt', prompt=$prompt]`,
            pollInterval: '1s',
            timeout: '10s',
          }),
        }),
      ],
      links: [L(`${s}_cue`, 'out_act', `${s}_poll`, 'in_act')],
    }),
  },
];

/* ============================================================================ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * Structural integrity + each composite compiles clean when wrapped in a cue.
 * ============================================================================ */
export function runCompositeBlocksSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  for (const c of COMPOSITE_BLOCKS) {
    const { nodes, links } = c.build('seed1', 100, 100);
    const ids = nodes.map((n) => n.id as string);
    const idSet = new Set(ids);
    ok(`${c.id}_unique_ids`, ids.length === idSet.size && ids.every((id) => id.startsWith('seed1')), ids);
    ok(`${c.id}_links_internal`, links.every((l) => idSet.has(l.sourceNodeId) && idSet.has(l.targetNodeId)), links.map((l) => `${l.sourceNodeId}->${l.targetNodeId}`));
    ok(`${c.id}_entry_exists`, idSet.has(c.entryId('seed1')));

    // Compile-clean: wrap action composites under a cue; cue-composites stand alone.
    const isCueComposite = nodes.some((n) => n.type === 'cue');
    let wsNodes = nodes;
    let wsLinks = links;
    if (!isCueComposite) {
      wsNodes = [N('host_cue', 'cue', 'cue', 0, 0, { name: 'Host' }), ...nodes];
      wsLinks = [L('host_cue', 'out_act', c.entryId('seed1'), 'in_act'), ...links];
    }
    try {
      const ws = sanitizeWorkspace({ name: 'CompTest', nodes: wsNodes, links: wsLinks, uiWidgets: [] } as Partial<ModWorkspace>);
      const xml = generateMDXML(ws);
      const errors = validateModWorkspace(ws, xml).filter((d) => d.severity === 'error');
      ok(`${c.id}_compiles_clean`, errors.length === 0, errors.map((e) => e.message));
      if (c.id === 'file_bridge_poll') {
        ok('file_bridge_poll_writes_request', xml.includes('<debug_to_file') && xml.includes(`send_prompt_request.json`));
        ok('file_bridge_poll_has_timeout', xml.includes('player.age + 10s') && xml.includes(`'x4forge_bridge.send_prompt.timeout'`));
        ok('file_bridge_poll_uses_contract_event_name', xml.includes(`'x4forge_bridge.send_prompt.poll'`));
      }
    } catch (e: any) {
      ok(`${c.id}_compiles_clean`, false, 'threw: ' + (e?.message || e));
    }
  }

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
