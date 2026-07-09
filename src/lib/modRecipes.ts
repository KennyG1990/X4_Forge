/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recipe wizards (beta-UX bundle D2, 2026-07-09) — intent-driven mod builders.
 *
 * A template gives a fixed example; a RECIPE asks two or three plain-English questions
 * ("which faction counts?", "how much money?") and builds a complete, wired, validated
 * graph from the answers. The user learns by reading a working graph THEY specified —
 * the fastest learning loop there is.
 *
 * Extends the G9 template machinery (same minimal node shapes; ports hydrated by
 * sanitizeWorkspace). Every recipe must compile to 0 validation errors with its
 * DEFAULT answers and with edge answers — `runModRecipesSelftest` enforces it against
 * the real compiler + validator, exactly like the templates oracle.
 */

import type { MDNode, MDLink, ModWorkspace } from '../types';
import { sanitizeWorkspace, generateMDXML, validateModWorkspace } from '../types';

export interface RecipeQuestion {
  key: string;
  label: string;          // plain-English question
  help: string;           // one-line explanation of what it controls
  type: 'text' | 'number' | 'faction';
  default: string;
}

export interface ModRecipe {
  id: string;
  title: string;
  blurb: string;
  questions: RecipeQuestion[];
  build: (answers: Record<string, string>) => { name: string; nodes: Partial<MDNode>[]; links: MDLink[] };
}

const N = (id: string, type: MDNode['type'], xmlTag: string, x: number, y: number, properties: Record<string, unknown> = {}): Partial<MDNode> =>
  ({ id, type, xmlTag, x, y, properties, label: xmlTag });
const L = (id: string, s: string, sp: string, t: string, tp: string): MDLink =>
  ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

/** MD string literal — single quotes, with embedded quotes stripped (safe by construction). */
const lit = (s: string) => `'${String(s).replace(/'/g, '')}'`;
const num = (s: string, fallback: number) => {
  const n = Number(String(s).trim());
  return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : String(fallback);
};
const factionId = (s: string) => String(s).trim().toLowerCase().replace(/^faction\./, '').replace(/[^a-z0-9_]/g, '') || 'argon';

export const MOD_RECIPES: ModRecipe[] = [
  {
    id: 'faction_kill_reward',
    title: 'Bounty: pay me for killing a faction\'s ships',
    blurb: 'Every time you destroy a ship of the chosen faction, you get paid and see a notice.',
    questions: [
      { key: 'faction', label: 'Which faction\'s ships count?', help: 'The owner of the destroyed ship (e.g. xenon, khaak, argon).', type: 'faction', default: 'xenon' },
      { key: 'credits', label: 'How many credits per kill?', help: 'Paid instantly on each qualifying kill.', type: 'number', default: '25000' },
      { key: 'notice', label: 'What should the notice say?', help: 'Shown on screen with each payment.', type: 'text', default: 'Bounty collected!' },
    ],
    build: (a) => {
      const fac = factionId(a.faction ?? 'xenon');
      const credits = num(a.credits ?? '', 25000);
      return {
        name: `X4_Bounty_${fac}`,
        nodes: [
          N('bk', 'cue', 'cue', 80, 80, { name: 'Bounty_Kill', instantiate: 'true', namespace: 'this' }),
          N('bev', 'event', 'event_object_destroyed', 80, 300, { object: 'player.target' }),
          N('bif', 'action', 'do_if', 440, 80, { value: `event.object.owner == faction.${fac}` }),
          N('brew', 'action', 'reward_player', 780, 60, { money: credits }),
          N('bmsg', 'action', 'show_help', 1120, 60, { text: lit(a.notice || 'Bounty collected!'), duration: 5 }),
        ],
        links: [
          L('l1', 'bk', 'out_cond', 'bev', 'in_cond'),
          L('l2', 'bk', 'out_act', 'bif', 'in_act'),
          L('l3', 'bif', 'out_body', 'brew', 'in_act'),
          L('l4', 'brew', 'out_next', 'bmsg', 'in_act'),
        ],
      };
    },
  },
  {
    id: 'timed_message',
    title: 'Reminder: show me a message on a timer',
    blurb: 'A message appears when the game starts and repeats on your chosen interval.',
    questions: [
      { key: 'minutes', label: 'How many minutes between messages?', help: 'The repeat interval, in real minutes.', type: 'number', default: '10' },
      { key: 'text', label: 'What should the message say?', help: 'Shown on screen each time.', type: 'text', default: 'Time for a supply check.' },
    ],
    build: (a) => {
      const mins = num(a.minutes ?? '', 10);
      return {
        name: 'X4_Timed_Reminder',
        nodes: [
          N('tb', 'cue', 'cue', 80, 80, { name: 'Reminder_Boot', namespace: 'this' }),
          N('tev', 'event', 'event_game_started', 80, 300, {}),
          N('tmsg0', 'action', 'show_help', 440, 60, { text: lit(a.text || 'Reminder armed.'), duration: 6 }),
          N('tloop', 'cue', 'cue', 80, 520, { name: 'Reminder_Tick', instantiate: 'true', namespace: 'this', checkinterval: `${mins}min` }),
          N('tchk', 'condition', 'check_value', 80, 740, { value: 'true' }),
          N('tmsg', 'action', 'show_help', 440, 520, { text: lit(a.text || 'Reminder.'), duration: 6 }),
          N('trst', 'action', 'reset_cue', 780, 520, { cue: 'this' }),
        ],
        links: [
          L('l1', 'tb', 'out_cond', 'tev', 'in_cond'),
          L('l2', 'tb', 'out_act', 'tmsg0', 'in_act'),
          L('l3', 'tloop', 'out_cond', 'tchk', 'in_cond'),
          L('l4', 'tloop', 'out_act', 'tmsg', 'in_act'),
          L('l5', 'tmsg', 'out_next', 'trst', 'in_act'),
        ],
      };
    },
  },
  {
    id: 'gamestart_patrol',
    title: 'Escort: spawn ships for me at game start',
    blurb: 'A wing of fighters of your chosen faction appears in your sector when the game starts.',
    questions: [
      { key: 'faction', label: 'Which faction owns the ships?', help: 'Sets ship ownership (e.g. argon, teladi).', type: 'faction', default: 'argon' },
      { key: 'count', label: 'How many fighters (1-5)?', help: 'Each is a light fighter spawned in your current sector.', type: 'number', default: '2' },
    ],
    build: (a) => {
      const fac = factionId(a.faction ?? 'argon');
      const count = Math.max(1, Math.min(5, Number(num(a.count ?? '', 2))));
      const nodes: Partial<MDNode>[] = [
        N('pc', 'cue', 'cue', 80, 80, { name: 'Spawn_Escort', namespace: 'this' }),
        N('pev', 'event', 'event_game_started', 80, 300, {}),
      ];
      const links: MDLink[] = [L('l0', 'pc', 'out_cond', 'pev', 'in_cond')];
      for (let i = 0; i < count; i++) {
        nodes.push(N(`ps${i}`, 'action', 'create_ship', 440 + i * 340, 60, {
          name: `$Escort${i + 1}`, macro: 'ship_arg_s_fighter_01_a_macro', faction: fac, sector: 'player.sector',
        }));
        links.push(i === 0
          ? L(`l${i + 1}`, 'pc', 'out_act', `ps${i}`, 'in_act')
          : L(`l${i + 1}`, `ps${i - 1}`, 'out_next', `ps${i}`, 'in_act'));
      }
      return { name: `X4_Escort_${fac}`, nodes, links };
    },
  },
];

/** Materialize a recipe + answers into a full sanitized workspace ready to load. */
export function buildRecipeWorkspace(id: string, answers: Record<string, string>): ModWorkspace {
  const recipe = MOD_RECIPES.find(r => r.id === id) || MOD_RECIPES[0];
  const merged: Record<string, string> = {};
  for (const q of recipe.questions) merged[q.key] = (answers?.[q.key] ?? '').trim() || q.default;
  const { name, nodes, links } = recipe.build(merged);
  return sanitizeWorkspace({
    name,
    description: `Built with the "${recipe.title}" recipe in X4 Forge.`,
    nodes, links, uiWidgets: [],
  } as Partial<ModWorkspace>);
}

/* ------------------------------------------------------------------ *
 * Oracle — every recipe compiles clean with defaults AND edge answers.
 * ------------------------------------------------------------------ */

export function runModRecipesSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: unknown) =>
    checks.push({ name, pass: !!cond, detail: detail === undefined ? undefined : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });

  const compile = (id: string, answers: Record<string, string>) => {
    const ws = buildRecipeWorkspace(id, answers);
    const errors = validateModWorkspace(ws, generateMDXML(ws)).filter(d => d.severity === 'error');
    return { ws, errors };
  };

  for (const r of MOD_RECIPES) {
    const def = compile(r.id, {});
    ok(`${r.id}: default answers compile clean`, def.errors.length === 0, def.errors.map(e => e.message).join(' | '));
    ok(`${r.id}: has nodes`, def.ws.nodes.length > 0);
    // hostile/edge answers must sanitize, never break the graph
    const edge = compile(r.id, { faction: "FACTION.Xen'on\"; DROP", credits: '-5', minutes: 'zero', count: '99', text: "it's <great>", notice: "quote ' inside" });
    ok(`${r.id}: hostile answers still compile clean`, edge.errors.length === 0, edge.errors.map(e => e.message).join(' | '));
  }

  // parameterization is real: answers reach the emitted XML
  const bounty = buildRecipeWorkspace('faction_kill_reward', { faction: 'khaak', credits: '50000', notice: 'Kha bounty' });
  const xml = generateMDXML(bounty);
  ok('answers reach the XML (faction)', xml.includes('faction.khaak'), xml.match(/faction\.\w+/)?.[0]);
  ok('answers reach the XML (credits)', xml.includes('50000'));
  ok('escort count parameterizes node count',
    buildRecipeWorkspace('gamestart_patrol', { count: '4' }).nodes.filter(n => n.xmlTag === 'create_ship').length === 4);
  ok('count clamps to sane range',
    buildRecipeWorkspace('gamestart_patrol', { count: '99' }).nodes.filter(n => n.xmlTag === 'create_ship').length === 5);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
