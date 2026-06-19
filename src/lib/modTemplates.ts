/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Starter mod templates (53rd pass — UX grind, gap G9-D1).
 *
 * A blank canvas is intimidating for a newcomer. These ready-made starter mods give a
 * working example to start from. Every non-blank template is EVENT-BASED (so it never
 * trips the "check-only cue needs checkinterval" rule) and compiles to 0 errors —
 * `runModTemplatesSelftest` asserts that against the real compiler + validator.
 *
 * Nodes here are minimal ({id,type,xmlTag,properties,x,y}); ports are hydrated by
 * `sanitizeWorkspace` from the templates, so the loader stays tiny.
 */

import type { MDNode, MDLink, ModWorkspace } from '../types';
import { sanitizeWorkspace, generateMDXML, validateModWorkspace } from '../types';

export interface ModTemplate {
  id: string;
  name: string;          // mod name written into the workspace
  title: string;         // picker display title
  blurb: string;         // one-line description for the picker
  build: () => { nodes: Partial<MDNode>[]; links: MDLink[] };
}

const N = (id: string, type: MDNode['type'], xmlTag: string, x: number, y: number, properties: any = {}): Partial<MDNode> =>
  ({ id, type, xmlTag, x, y, properties, label: xmlTag });
const L = (id: string, s: string, sp: string, t: string, tp: string): MDLink =>
  ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

export const MOD_TEMPLATES: ModTemplate[] = [
  {
    id: 'blank',
    name: 'X4_My_Custom_Mod',
    title: 'Blank',
    blurb: 'Start from an empty canvas.',
    build: () => ({ nodes: [], links: [] }),
  },
  {
    id: 'welcome',
    name: 'X4_Welcome_Message',
    title: 'Welcome Message',
    blurb: 'Show a message to the player when a game starts. Great first mod.',
    build: () => ({
      nodes: [
        N('c', 'cue', 'cue', 80, 80, { name: 'Welcome', namespace: 'this' }),
        N('ev', 'event', 'event_game_started', 80, 300, {}),
        N('msg', 'action', 'show_help', 440, 60, { text: 'Welcome — this mod was built in X4 Forge!', duration: 8 }),
      ],
      links: [
        L('l1', 'c', 'out_cond', 'ev', 'in_cond'),
        L('l2', 'c', 'out_act', 'msg', 'in_act'),
      ],
    }),
  },
  {
    id: 'reward_on_kill',
    name: 'X4_Reward_On_Kill',
    title: 'Reward on Kill',
    blurb: 'Track kills in a variable and pay the player for each one.',
    build: () => ({
      nodes: [
        N('cs', 'cue', 'cue', 80, 80, { name: 'Setup', namespace: 'this' }),
        N('evs', 'event', 'event_game_started', 80, 300, {}),
        N('init', 'action', 'set_value', 440, 80, { name: '$kills', exact: '0' }),
        N('ck', 'cue', 'cue', 80, 520, { name: 'On_Kill', instantiate: 'true', namespace: 'this' }),
        N('evk', 'event', 'event_object_destroyed', 80, 740, { object: 'player.target' }),
        N('inc', 'action', 'set_value', 440, 520, { name: '$kills', operation: 'add', exact: '1' }),
        N('rew', 'action', 'reward_player', 780, 520, { money: '10000' }),
      ],
      links: [
        L('l1', 'cs', 'out_cond', 'evs', 'in_cond'),
        L('l2', 'cs', 'out_act', 'init', 'in_act'),
        L('l3', 'ck', 'out_cond', 'evk', 'in_cond'),
        L('l4', 'ck', 'out_act', 'inc', 'in_act'),
        L('l5', 'inc', 'out_next', 'rew', 'in_act'),
      ],
    }),
  },
  {
    id: 'spawn_patrol',
    name: 'X4_Spawn_Patrol',
    title: 'Spawn Patrol',
    blurb: 'Spawn a couple of ships in the player\'s sector when a game starts.',
    build: () => ({
      nodes: [
        N('c', 'cue', 'cue', 80, 80, { name: 'Spawn_Patrol', namespace: 'this' }),
        N('ev', 'event', 'event_game_started', 80, 300, {}),
        N('s1', 'action', 'create_ship', 440, 60, { name: '$Patrol1', macro: 'ship_arg_s_fighter_01_a_macro', faction: 'argon', sector: 'player.sector' }),
        N('s2', 'action', 'create_ship', 780, 60, { name: '$Patrol2', macro: 'ship_arg_s_fighter_01_a_macro', faction: 'argon', sector: 'player.sector' }),
      ],
      links: [
        L('l1', 'c', 'out_cond', 'ev', 'in_cond'),
        L('l2', 'c', 'out_act', 's1', 'in_act'),
        L('l3', 's1', 'out_next', 's2', 'in_act'),
      ],
    }),
  },
];

/** Materialize a template id into a full (sanitized) workspace ready to load. */
export function buildTemplateWorkspace(id: string): ModWorkspace {
  const tpl = MOD_TEMPLATES.find((t) => t.id === id) || MOD_TEMPLATES[0];
  const { nodes, links } = tpl.build();
  return sanitizeWorkspace({
    name: tpl.name,
    description: `Started from the "${tpl.title}" template in X4 Forge.`,
    nodes, links, uiWidgets: [],
  } as Partial<ModWorkspace>);
}

/* ============================================================================ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * Every non-blank template must compile to 0 validation errors.
 * ============================================================================ */
export function runModTemplatesSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  ok('has_blank', MOD_TEMPLATES.some((t) => t.id === 'blank'));
  ok('has_multiple', MOD_TEMPLATES.length >= 3);

  for (const tpl of MOD_TEMPLATES) {
    if (tpl.id === 'blank') continue;
    try {
      const ws = buildTemplateWorkspace(tpl.id);
      const diags = validateModWorkspace(ws, generateMDXML(ws));
      const errors = diags.filter((d) => d.severity === 'error');
      ok(`template_${tpl.id}_compiles_clean`, errors.length === 0, errors.map((e) => e.message));
      ok(`template_${tpl.id}_has_nodes`, ws.nodes.length > 0);
    } catch (e) {
      ok(`template_${tpl.id}_compiles_clean`, false, 'threw: ' + (e?.message || e));
    }
  }

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
