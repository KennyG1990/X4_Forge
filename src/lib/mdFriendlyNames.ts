/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Friendly node names (51st pass — Approachability Track 1).
 *
 * Forge's palette and freshly-spawned schema nodes show the RAW md.xsd tag
 * (`event_object_destroyed`, `set_value`, `check_value`), which reads like "learn the
 * syntax." This registry maps the common tags to plain English the way a UE5 Blueprint
 * palette does ("On Game Start", "Set Variable", "Compare Value"). The raw tag is never
 * thrown away — it stays as the node's `xmlTag` and is shown as a subtitle — so power
 * users still see the truth. Deterministic; presentation only.
 */

/** Curated friendly names for the high-traffic tags. */
export const FRIENDLY_NAMES: Record<string, string> = {
  // structure
  cue: 'Cue (rule)',
  // events (triggers)
  event_game_started: 'On Game Start',
  event_object_destroyed: 'When Object Destroyed',
  event_object_changed_sector: 'When Object Changes Sector',
  event_cue_signalled: 'When Cue Signalled',
  event_cue_completed: 'When Cue Completed',
  event_player_changed_zone: 'When Player Changes Zone',
  event_object_attacked: 'When Object Attacked',
  // conditions
  check_value: 'Compare Value',
  check_age: 'Check Age',
  custom_condition: 'Custom Condition (raw XML)',
  // control flow
  do_if: 'If / Then',
  do_elseif: 'Else If',
  do_else: 'Else',
  do_while: 'Repeat While',
  do_for_each: 'For Each',
  do_all: 'Do All',
  // variables
  set_value: 'Set Variable',
  add_value: 'Add to Variable',
  remove_value: 'Remove Variable',
  // common actions
  reward_player: 'Give Reward',
  play_sound: 'Play Sound',
  show_help: 'Show Message',
  write_to_logbook: 'Logbook Entry',
  create_ship: 'Spawn Ship',
  create_station: 'Spawn Station',
  destroy_object: 'Destroy Object',
  signal_cue: 'Signal Cue',
  signal_cue_instantly: 'Signal Cue (Instant)',
  reset_cue: 'Reset Cue',
  cancel_cue: 'Cancel Cue',
  set_faction_relation: 'Set Faction Relation',
  set_object_shieldlevel: 'Set Shield Level',
  set_object_hulllevel: 'Set Hull Level',
  wait: 'Wait',
  custom_event: 'Custom Event (raw XML)',
  custom_xml: 'Custom XML',
};

/** Verb prefixes we rewrite to friendly leading words in the humanizer fallback. */
const PREFIX_VERBS: Array<[string, string]> = [
  ['event_', 'On '],
  ['set_', 'Set '],
  ['get_', 'Get '],
  ['create_', 'Create '],
  ['add_', 'Add '],
  ['remove_', 'Remove '],
  ['cancel_', 'Cancel '],
  ['reset_', 'Reset '],
  ['enable_', 'Enable '],
  ['disable_', 'Disable '],
  ['destroy_', 'Destroy '],
  ['signal_', 'Signal '],
  ['show_', 'Show '],
  ['play_', 'Play '],
  ['check_', 'Check '],
];

const titleCase = (s: string): string =>
  s.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * The friendly display name for a raw tag. Curated map first; otherwise humanize
 * (rewrite a known verb prefix + title-case the rest); otherwise title-case the whole tag.
 * Always deterministic and total — never throws, never returns empty.
 */
export function friendlyName(tag: string | undefined | null): string {
  const t = (tag ?? '').trim();
  if (!t) return 'Node';
  if (FRIENDLY_NAMES[t]) return FRIENDLY_NAMES[t];
  for (const [pre, verb] of PREFIX_VERBS) {
    if (t.startsWith(pre) && t.length > pre.length) return verb + titleCase(t.slice(pre.length));
  }
  return titleCase(t);
}

/* ============================================================================ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * ============================================================================ */
export function runFriendlyNamesSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  ok('curated_event', friendlyName('event_game_started') === 'On Game Start');
  ok('curated_setvalue', friendlyName('set_value') === 'Set Variable');
  ok('curated_do_if', friendlyName('do_if') === 'If / Then');
  ok('curated_check', friendlyName('check_value') === 'Compare Value');
  ok('curated_reward', friendlyName('reward_player') === 'Give Reward');

  // humanizer fallback (uncurated tag) rewrites the verb prefix
  ok('humanize_event_prefix', friendlyName('event_object_unloaded') === 'On Object Unloaded', friendlyName('event_object_unloaded'));
  ok('humanize_set_prefix', friendlyName('set_some_obscure_thing') === 'Set Some Obscure Thing', friendlyName('set_some_obscure_thing'));
  ok('humanize_plain', friendlyName('teleport_object') === 'Teleport Object', friendlyName('teleport_object'));

  // totality / safety
  ok('empty_safe', friendlyName('') === 'Node');
  ok('undefined_safe', friendlyName(undefined) === 'Node');
  ok('never_empty', friendlyName('xyz') !== '' && typeof friendlyName('xyz') === 'string');

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
