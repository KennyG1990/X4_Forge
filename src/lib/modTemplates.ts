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

/** B19 guided rail: per-template hand-holding from "loaded" to "seen in my game". */
export interface RailGuide {
  /** Node the TWEAK step points the newcomer at (canvas templates only — B19s2b:
      beyond-canvas templates navigate via the tweakHint text instead). */
  focusNodeId?: string;
  /** Plain-language "change this and it's yours" hint. */
  tweakHint: string;
  /** What to look for in the running game (the rail's step 3). */
  gameCheck: string;
}

export interface ModTemplate {
  id: string;
  name: string;          // mod name written into the workspace
  title: string;         // picker display title
  blurb: string;         // one-line description for the picker
  rail?: RailGuide;      // B19: guided-rail metadata (blank template has none)
  // B19s2b: templates may populate ANY workspace domain, not just the MD canvas.
  build: () => {
    nodes: Partial<MDNode>[];
    links: MDLink[];
    xmlPatches?: ModWorkspace['xmlPatches'];
    tFiles?: ModWorkspace['tFiles'];
    uiWidgets?: ModWorkspace['uiWidgets'];
  };
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
    rail: {
      focusNodeId: 'msg',
      tweakHint: 'Click the show_help node and change its text — that becomes the message your game shows.',
      gameCheck: 'Start or load any save: your message appears on screen within a few seconds.',
    },
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
    rail: {
      focusNodeId: 'rew',
      tweakHint: 'Click the reward_player node and change money — that is your bounty per kill.',
      gameCheck: 'Load a save and destroy a ship you have targeted: the credits arrive with a notification.',
    },
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
    rail: {
      focusNodeId: 's1',
      tweakHint: 'Click a create_ship node — swap the macro or faction to spawn different ships.',
      gameCheck: 'Start or load a game: two Argon fighters appear in your current sector.',
    },
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
  // ------------------------------------------------------------------------
  // B19s2b: beyond-canvas starter intents — first mods that aren't MD logic.
  // The rail's tweakHint carries the navigation (these have no canvas node).
  // ------------------------------------------------------------------------
  {
    id: 'price_tweak',
    name: 'X4_Cheaper_Energy',
    title: 'Price Tweak (XML patch)',
    blurb: 'Make Energy Cells cheaper — your first game-data patch, no scripting.',
    rail: {
      tweakHint: 'Open the XML PATCHING tab (top bar) — the patch sets the average price of Energy Cells. Change 64 to any number you like.',
      gameCheck: 'Dock at any trader: Energy Cells trade around your new price.',
    },
    build: () => ({
      nodes: [], links: [],
      xmlPatches: [{
        id: 'patch_price',
        targetFile: 'libraries/wares.xml',
        sel: "/wares/ware[@id='energycells']/price/@average",
        action: 'replace',
        content: '64',
        note: 'Cheaper Energy Cells — average price down from vanilla.',
        includeInBuild: true,
      }],
    }),
  },
  {
    id: 'greeting_tfile',
    name: 'X4_My_Text_Mod',
    title: 'Custom Text (t-file)',
    blurb: 'Add your own translatable text entry — the way real mods name things.',
    rail: {
      tweakHint: 'Open the LANGUAGES (t/) tab (top bar) — page 10099, entry 100 holds your text. Change it to anything; other mods reference it as {10099,100}.',
      gameCheck: 'Any mod or script that reads {10099,100} now shows your text in-game.',
    },
    build: () => ({
      nodes: [], links: [],
      tFiles: [{
        languageId: '44',
        fileName: '0001-l044.xml',
        includeInBuild: true,
        pages: [{
          id: '10099',
          title: 'My Mod Text',
          items: [{ id: '100', value: 'Hello from my first X4 Forge text mod!' }],
        }],
      }],
    }),
  },
  {
    id: 'hud_button',
    name: 'X4_My_HUD_Button',
    title: 'Standalone Menu (Lua UI)',
    blurb: 'Build a real X4 menu with a clickable button — your first UI mod.',
    rail: {
      tweakHint: 'Open the HUD & LUA UI tab (top bar) — drag the button, resize it, change its label. The designer compiles the exact preview to Lua.',
      gameCheck: 'Load a save: the starter menu opens once. Close it, then confirm the button produced no UI errors in the debug log.',
    },
    build: () => ({
      nodes: [], links: [],
      uiWidgets: [
        { id: 'w_win', type: 'window', x: 120, y: 120, w: 280, h: 120, label: 'My First Panel', properties: { autoOpen: true }, includeInBuild: true },
        { id: 'w_btn', type: 'button', x: 150, y: 170, w: 220, h: 40, label: 'My First Button', properties: { text: 'Click me' }, includeInBuild: true },
      ],
    }),
  },
];

/** Materialize a template id into a full (sanitized) workspace ready to load. */
export function buildTemplateWorkspace(id: string): ModWorkspace {
  const tpl = MOD_TEMPLATES.find((t) => t.id === id) || MOD_TEMPLATES[0];
  const built = tpl.build();
  return sanitizeWorkspace({
    name: tpl.name,
    description: `Started from the "${tpl.title}" template in X4 Forge.`,
    nodes: built.nodes,
    links: built.links,
    // B19s2b: beyond-canvas domains pass through (patches, t-files, HUD widgets).
    uiWidgets: built.uiWidgets ?? [],
    xmlPatches: built.xmlPatches ?? [],
    tFiles: built.tFiles ?? [],
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
      // B19s2b: a template's content may live in ANY domain — assert it has SOME.
      const hasContent = ws.nodes.length > 0 || (ws.xmlPatches?.length ?? 0) > 0
        || (ws.tFiles?.length ?? 0) > 0 || ws.uiWidgets.length > 0;
      ok(`template_${tpl.id}_has_content`, hasContent);
      ok(`template_${tpl.id}_has_rail`, Boolean(tpl.rail?.tweakHint && tpl.rail?.gameCheck));
    } catch (e) {
      ok(`template_${tpl.id}_compiles_clean`, false, 'threw: ' + (e?.message || e));
    }
  }

  // B19s2b: beyond-canvas domains survive sanitize (the loader used to drop them).
  const priceWs = buildTemplateWorkspace('price_tweak');
  ok('price_tweak_patch_survives', (priceWs.xmlPatches?.length ?? 0) === 1
    && priceWs.xmlPatches![0].sel.includes('energycells')
    && priceWs.xmlPatches![0].targetFile === 'libraries/wares.xml');
  const tfileWs = buildTemplateWorkspace('greeting_tfile');
  ok('greeting_tfile_survives', (tfileWs.tFiles?.length ?? 0) === 1
    && tfileWs.tFiles![0].pages[0]?.items[0]?.id === '100');
  const hudWs = buildTemplateWorkspace('hud_button');
  ok('hud_button_widgets_survive', hudWs.uiWidgets.length === 2
    && hudWs.uiWidgets.some(w => w.type === 'button'));
  ok('hud_button_requests_one_shot_open', hudWs.uiWidgets.some(w => w.properties?.autoOpen === true));

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
