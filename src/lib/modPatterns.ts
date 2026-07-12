/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Proven-pattern library (BACKLOG B22 slice 1, Vision v2 Phase 2 — 2026-07-11).
 *
 * The DeadAir/x4_ai_influence grounding knowledge moves INTO the product: each
 * pattern is a stampable workspace fragment that carries its PROVENANCE — the
 * shipping mod/file that proves the shape works in-game. A newcomer browses
 * "how do real mods do X" and stamps a working example; a veteran reads the
 * provenance and opens the real file.
 *
 * Every pattern must compile to 0 validation errors (oracle-enforced, same
 * contract as modTemplates). Patterns teach FORMULAS and EVENT SHAPES — they
 * use $variables the modder is expected to rename, which is normal MD practice.
 */

import type { MDNode, MDLink, ModWorkspace } from '../types';
import { sanitizeWorkspace, generateMDXML, validateModWorkspace } from '../types';

export interface PatternProvenance {
  /** The shipping mod (or vanilla) that proves this shape. */
  provenMod: string;
  /** The exact file worth reading. */
  file: string;
  /** One line on what the source proves. */
  note: string;
}

export interface ModPattern {
  id: string;
  title: string;
  blurb: string;
  provenance: PatternProvenance;
  build: () => { nodes: Partial<MDNode>[]; links: MDLink[] };
}

const N = (id: string, type: MDNode['type'], xmlTag: string, x: number, y: number, properties: Record<string, unknown> = {}): Partial<MDNode> =>
  ({ id, type, xmlTag, x, y, properties, label: xmlTag });
const L = (id: string, s: string, sp: string, t: string, tp: string): MDLink =>
  ({ id, sourceNodeId: s, sourcePortId: sp, targetNodeId: t, targetPortId: tp });

export const MOD_PATTERNS: ModPattern[] = [
  {
    id: 'kill_capture_group',
    title: 'Kill capture on a watched group',
    blurb: 'Watch a GROUP of ships and react when any of them is destroyed — the proven listener shape.',
    provenance: {
      provenMod: 'DeadAir Dynamic Universe / x4_ai_influence (#66, in-game proven)',
      file: 'deadair_scripts (InfPatrolDestroyedListener pattern)',
      note: 'Group created with a BARE groupname; the listener references it BARE (child cues inherit the namespace). event_object_destroyed: object=destroyed, param=killer.',
    },
    build: () => ({
      nodes: [
        N('setup', 'cue', 'cue', 80, 80, { name: 'Watch_Setup', namespace: 'this' }),
        N('evs', 'event', 'event_game_started', 80, 300, {}),
        N('grp', 'action', 'add_to_group', 440, 80, { groupname: '$Watched', object: 'player.ship' }),
        N('killed', 'cue', 'cue', 80, 520, { name: 'On_Group_Kill', instantiate: 'true', namespace: 'this' }),
        N('evk', 'event', 'event_object_destroyed', 80, 740, { group: '$Watched' }),
        N('react', 'action', 'debug_text', 440, 520, { text: 'A watched ship died — event.object is the victim, event.param the killer.' }),
      ],
      links: [
        L('l1', 'setup', 'out_cond', 'evs', 'in_cond'),
        L('l2', 'setup', 'out_act', 'grp', 'in_act'),
        L('l3', 'killed', 'out_cond', 'evk', 'in_cond'),
        L('l4', 'killed', 'out_act', 'react', 'in_act'),
      ],
    }),
  },
  {
    id: 'order_dispatch',
    title: 'Dispatch an order to a ship',
    blurb: 'Give an existing ship a real order (no spawning, no cheating) — the fleet-actuation primitive.',
    provenance: {
      provenMod: 'DeadAir Scripts',
      file: 'deadair_scripts/aiscripts/order.move.recon.xml',
      note: 'create_order on an EXISTING ship; the order id must match an aiscript order. Fleets come from the JOB system, never from spawning.',
    },
    build: () => ({
      nodes: [
        N('c', 'cue', 'cue', 80, 80, { name: 'Dispatch_Order', namespace: 'this' }),
        N('ev', 'event', 'event_cue_signalled', 80, 300, { cue: 'md.$$SCRIPTNAME$$.Watch_Setup' }),
        N('ord', 'action', 'create_order', 440, 80, { object: '$Ship', id: "'MoveWait'" }),
      ],
      links: [
        L('l1', 'c', 'out_cond', 'ev', 'in_cond'),
        L('l2', 'c', 'out_act', 'ord', 'in_act'),
      ],
    }),
  },
  {
    id: 'station_shortage_read',
    title: 'Station cargo shortage formula',
    blurb: "Read a station's cargo vs target and compute shortage severity — the economy-read pattern.",
    provenance: {
      provenMod: 'DeadAir Dynamic Universe',
      file: 'deadair_scripts/md/deadairdynamicuniverse.xml',
      note: 'The "Fill" engine: $station.cargo.{$ware}.count (current) vs .target (desired); shortage severity = 1 - count/target.',
    },
    build: () => ({
      nodes: [
        N('c', 'cue', 'cue', 80, 80, { name: 'Read_Shortage', namespace: 'this' }),
        N('ev', 'event', 'event_game_started', 80, 300, {}),
        N('v1', 'action', 'set_value', 440, 60, { name: '$Count', exact: '$Station.cargo.{$Ware}.count' }),
        N('v2', 'action', 'set_value', 780, 60, { name: '$Target', exact: '$Station.cargo.{$Ware}.target' }),
        N('v3', 'action', 'set_value', 1120, 60, { name: '$Shortage', exact: '1.0f - ($Count / $Target)' }),
      ],
      links: [
        L('l1', 'c', 'out_cond', 'ev', 'in_cond'),
        L('l2', 'c', 'out_act', 'v1', 'in_act'),
        L('l3', 'v1', 'out_next', 'v2', 'in_act'),
        L('l4', 'v2', 'out_next', 'v3', 'in_act'),
      ],
    }),
  },
  {
    id: 'relation_eligibility',
    title: 'Faction relation-change eligibility',
    blurb: 'The legality checklist before ANY faction relation move — active, not excluded, bounded step.',
    provenance: {
      provenMod: 'DeadAir Dynamic Wars',
      file: 'deadairdynamicwars/md/dynamicwardiplomacy.xml',
      note: 'A legal relation move: both factions isactive, neither in $ExcludedFactions, relation uivalue bounded ±25 (steps of ±5), cost-gated by player.money.',
    },
    build: () => ({
      nodes: [
        N('c', 'cue', 'cue', 80, 80, { name: 'Check_Eligibility', namespace: 'this' }),
        N('ev', 'event', 'event_game_started', 80, 300, {}),
        N('v1', 'action', 'set_value', 440, 60, { name: '$BothActive', exact: '($FactionA.isactive) and ($FactionB.isactive)' }),
        N('v2', 'action', 'set_value', 780, 60, { name: '$Bounded', exact: '($NewValue ge -25) and ($NewValue le 25)' }),
        N('dbg', 'action', 'debug_text', 1120, 60, { text: 'Eligible only if $BothActive and $Bounded and neither faction is excluded.' }),
      ],
      links: [
        L('l1', 'c', 'out_cond', 'ev', 'in_cond'),
        L('l2', 'c', 'out_act', 'v1', 'in_act'),
        L('l3', 'v1', 'out_next', 'v2', 'in_act'),
        L('l4', 'v2', 'out_next', 'dbg', 'in_act'),
      ],
    }),
  },
];

/** Materialize a pattern into a loadable (sanitized) workspace, like templates do. */
export function buildPatternWorkspace(id: string): ModWorkspace {
  const p = MOD_PATTERNS.find((x) => x.id === id) || MOD_PATTERNS[0];
  return sanitizeWorkspace({
    name: `X4_Pattern_${p.id}`,
    description: `Proven pattern: ${p.title}. Source: ${p.provenance.provenMod} — ${p.provenance.file}. ${p.provenance.note}`,
    nodes: p.build().nodes,
    links: p.build().links,
    uiWidgets: [],
  } as Partial<ModWorkspace>);
}

/* ------------------------------------------------------------------ *
 * Oracle — house contract; every pattern compiles to 0 errors and
 * carries complete provenance.
 * ------------------------------------------------------------------ */

export function runModPatternsSelftest() {
  const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

  ok('has_patterns', MOD_PATTERNS.length >= 4);
  for (const p of MOD_PATTERNS) {
    ok(`pattern_${p.id}_provenance_complete`,
      !!(p.provenance.provenMod && p.provenance.file && p.provenance.note));
    try {
      const ws = buildPatternWorkspace(p.id);
      const diags = validateModWorkspace(ws, generateMDXML(ws));
      const errors = diags.filter((d) => d.severity === 'error');
      ok(`pattern_${p.id}_compiles_clean`, errors.length === 0, errors.map((e) => e.message));
    } catch (e) {
      ok(`pattern_${p.id}_compiles_clean`, false, e instanceof Error ? e.message : String(e));
    }
  }

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
