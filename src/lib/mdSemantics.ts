/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Determinism Doctrine — Phase 1: the MD Semantics Registry (the "Meaning" layer).
 *
 * The studio already has a TRUTH layer: XSD-parsed nodes (syntax, structure, attributes,
 * types). What it has lacked is a deterministic MEANING layer — what each MD element
 * actually *does*: its plain-English description, its read/write effect on game state,
 * its reference equivalences (e.g. `playership` ≡ `player.primaryship`), and a risk class.
 *
 * This module is net-new (no existing module owns element semantics; MDScanner.tsx only
 * renders an AI `summary` prop). It is the single foundation asset consumed by:
 *   - the deterministic explainer (Phase 2)  → reads `describeNode`
 *   - the deterministic critic   (Phase 3)  → reads `areEquivalentRefs` + risk classes
 *   - the deepened simulator      (Phase 4) → reads `reads`/`writes` state effects
 *
 * Hard rule (Assist layer): nothing here calls an AI. Descriptions are template-filled
 * from the node's real attributes; the long tail degrades to an honest generic phrasing
 * rather than guessing. Determinism over opinion, by construction.
 */

import type { MDNode } from '../types';

export type SemanticKind = 'cue' | 'event' | 'condition' | 'action' | 'other';

/**
 * Risk class drives the Phase-3 deterministic critic. Deliberately coarse and finite —
 * it classifies the *kind* of effect, not a judgement about whether it's a bug.
 */
export type RiskClass =
  | 'safe'           // reads, sounds, UI, logbook — no game-state mutation
  | 'state_mutation' // mutates object/world state (reversible in principle)
  | 'irreversible'   // destroys/removes, or a one-way mutation with no auto-restore
  | 'spawn'          // creates objects (ships/stations/etc.)
  | 'economy';       // moves money/credits

export interface ElementSemantics {
  tag: string;
  kind: SemanticKind;
  /** Short human label for the element type. */
  title: string;
  /** Game-state keys this element READS (abstract state names, not engine internals). */
  reads: string[];
  /** Game-state keys this element WRITES. */
  writes: string[];
  risk: RiskClass;
  /**
   * Deterministic plain-English description from the node's attributes.
   * Receives the node's `properties` map; must never throw on missing keys.
   */
  describe: (props: Record<string, any>) => string;
  /** Optional clarifying note surfaced to the user (still deterministic, no AI). */
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Reference equivalences — the anti-false-positive core.
 *
 * The AI analyzer flagged `player.primaryship` as "may differ from `playership`".
 * That is a knowable, deterministic fact: in X4 these resolve to the same entity.
 * The critic must KNOW this so it doesn't cry wolf. Each inner array is a group of
 * references that denote the same entity. Groups are deliberately CONSERVATIVE —
 * we only assert equivalence we're confident of, to avoid the inverse error of
 * claiming two genuinely-different references are the same.
 * ------------------------------------------------------------------ */
const REFERENCE_EQUIVALENCE_GROUPS: string[][] = [
  // The player's own ship. `playership` is the MD keyword; `player.primaryship` is the
  // property path to the same object in normal play.
  ['playership', 'player.primaryship'],
  // The player character / entity.
  ['player.entity', 'player.character'],
];

/** Refs that are commonly confused with an equivalence group but are NOT guaranteed equal. */
export const RELATED_NOT_EQUAL_NOTES: Record<string, string> = {
  'player.occupiedship':
    'the ship the player currently occupies — usually the player ship, but can differ (e.g. boarding/remote control); not guaranteed equal to playership.',
};

/** Normalize a reference for comparison: trim, strip a leading `this.`. */
export function normalizeRef(ref: string): string {
  if (ref == null) return '';
  let r = String(ref).trim();
  if (r.startsWith('this.')) r = r.slice(5);
  return r;
}

/**
 * Deterministically decide whether two object references denote the same entity.
 * Used by the Phase-3 critic to avoid the AI's false positive on playership vs
 * player.primaryship. Returns true for identical refs and for refs in a known
 * equivalence group; false otherwise (honest: unknown ≠ proven different, but the
 * critic only *warns* on inequality, it never hard-fails).
 */
export function areEquivalentRefs(a: string, b: string): boolean {
  const na = normalizeRef(a);
  const nb = normalizeRef(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  for (const group of REFERENCE_EQUIVALENCE_GROUPS) {
    if (group.includes(na) && group.includes(nb)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Small deterministic helpers for describe templates.
 * ------------------------------------------------------------------ */
function attr(props: Record<string, any>, key: string, fallback = '(unset)'): string {
  const v = props ? props[key] : undefined;
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  return String(v);
}
function isZero(v: any): boolean {
  return v === 0 || String(v).trim() === '0';
}

/* ------------------------------------------------------------------ *
 * The registry — common MD vocabulary (~95% of real mods).
 * Long-tail elements fall back to a generic, honest description.
 * ------------------------------------------------------------------ */
const REGISTRY: Record<string, ElementSemantics> = {
  cue: {
    tag: 'cue', kind: 'cue', title: 'Cue', reads: ['cue.state'], writes: ['cue.state'], risk: 'safe',
    describe: (p) => {
      const name = attr(p, 'name', '(unnamed)');
      const inst = String(p?.instantiate) === 'true';
      const ns = attr(p, 'namespace', 'this');
      return `Defines cue "${name}" — the container for a trigger and its actions.` +
        (inst ? ` It instantiates a fresh copy each time it triggers (namespace '${ns}').`
              : ` It runs once (namespace '${ns}').`);
    },
  },
  event_game_started: {
    tag: 'event_game_started', kind: 'event', title: 'Game Started', reads: ['game.lifecycle'], writes: [], risk: 'safe',
    describe: () => `Triggers once when a new game is started.`,
  },
  event_game_loaded: {
    tag: 'event_game_loaded', kind: 'event', title: 'Game Loaded', reads: ['game.lifecycle'], writes: [], risk: 'safe',
    describe: () => `Triggers when a saved game is loaded (use to re-establish runtime state).`,
  },
  event_cue_signalled: {
    tag: 'event_cue_signalled', kind: 'event', title: 'Cue Signalled', reads: ['cue.signal'], writes: [], risk: 'safe',
    describe: (p) => `Waits for cue "${attr(p, 'cue', '(unset)')}" to be signalled, then triggers.`,
  },
  event_object_changed_sector: {
    tag: 'event_object_changed_sector', kind: 'event', title: 'Sector Entered', reads: ['object.sector'], writes: [], risk: 'safe',
    describe: (p) =>
      `Triggers when ${attr(p, 'object', 'the object')} changes sector` +
      (p?.sector ? ` (target sector: ${attr(p, 'sector')}).` : `.`),
  },
  event_object_destroyed: {
    tag: 'event_object_destroyed', kind: 'event', title: 'Object Destroyed', reads: ['object.lifecycle'], writes: [], risk: 'safe',
    describe: (p) => `Triggers when ${attr(p, 'object', 'the object')} is destroyed.`,
  },
  check_value: {
    tag: 'check_value', kind: 'condition', title: 'Check Value', reads: ['expression'], writes: [], risk: 'safe',
    describe: (p) => `Passes only when the expression "${attr(p, 'value', '(unset)')}" is true.`,
  },
  custom_condition: {
    tag: 'custom_condition', kind: 'condition', title: 'Custom Condition', reads: ['expression'], writes: [], risk: 'safe',
    describe: (p) => `Custom condition: ${attr(p, 'rawXml', attr(p, 'value', '(custom)'))}.`,
  },
  play_sound: {
    tag: 'play_sound', kind: 'action', title: 'Play Sound', reads: [], writes: ['ui.audio'], risk: 'safe',
    describe: (p) => `Plays the '${attr(p, 'sound', '(unset)')}' sound` +
      (p?.object ? ` at ${attr(p, 'object')}'s location.` : `.`),
  },
  show_help: {
    tag: 'show_help', kind: 'action', title: 'Show Help', reads: [], writes: ['ui.help'], risk: 'safe',
    describe: (p) => `Shows an on-screen help/notification message${p?.text ? `: "${attr(p, 'text')}".` : `.`}`,
  },
  write_to_logbook: {
    tag: 'write_to_logbook', kind: 'action', title: 'Logbook Entry', reads: [], writes: ['ui.logbook'], risk: 'safe',
    describe: (p) => `Writes a logbook entry${p?.category ? ` (category: ${attr(p, 'category')})` : ''}` +
      (p?.text ? `: "${attr(p, 'text')}".` : `.`),
  },
  reward_player: {
    tag: 'reward_player', kind: 'action', title: 'Reward Player', reads: [], writes: ['player.money'], risk: 'economy',
    describe: (p) => {
      const money = attr(p, 'money', '');
      if (money) return `Gives the player ${money} credits.`;
      return `Rewards the player (no money amount set).`;
    },
  },
  set_object_shieldlevel: {
    tag: 'set_object_shieldlevel', kind: 'action', title: 'Set Shield Level', reads: [], writes: ['object.shields'], risk: 'state_mutation',
    describe: (p) => {
      const obj = attr(p, 'object', 'the object');
      const lvl = p?.level;
      if (isZero(lvl)) return `Sets ${obj}'s shield level to 0 (drops its shields completely).`;
      return `Sets ${obj}'s shield level to ${attr(p, 'level', '(unset)')}.`;
    },
    note: 'One-way write: this does not restore shields afterward. Pair with a restore step if the drop is meant to be temporary.',
  },
  set_object_hulllevel: {
    tag: 'set_object_hulllevel', kind: 'action', title: 'Set Hull Level', reads: [], writes: ['object.hull'], risk: 'state_mutation',
    describe: (p) => `Sets ${attr(p, 'object', 'the object')}'s hull level to ${attr(p, 'level', '(unset)')}.`,
  },
  create_ship: {
    tag: 'create_ship', kind: 'action', title: 'Create Ship', reads: [], writes: ['world.objects'], risk: 'spawn',
    describe: (p) => `Spawns a ship` +
      (p?.macro ? ` (${attr(p, 'macro')})` : '') +
      (p?.faction ? ` for faction ${attr(p, 'faction')}` : '') + `.`,
  },
  create_station: {
    tag: 'create_station', kind: 'action', title: 'Create Station', reads: [], writes: ['world.objects'], risk: 'spawn',
    describe: (p) => `Spawns a station` + (p?.macro ? ` (${attr(p, 'macro')})` : '') +
      (p?.faction ? ` for faction ${attr(p, 'faction')}` : '') + `.`,
  },
  destroy_object: {
    tag: 'destroy_object', kind: 'action', title: 'Destroy Object', reads: [], writes: ['world.objects'], risk: 'irreversible',
    describe: (p) => `Destroys ${attr(p, 'object', 'the object')} (irreversible).`,
  },
  signal_cue: {
    tag: 'signal_cue', kind: 'action', title: 'Signal Cue', reads: [], writes: ['cue.signal'], risk: 'safe',
    describe: (p) => `Signals cue "${attr(p, 'cue', '(unset)')}" (triggers its listeners).`,
  },
  signal_cue_instantly: {
    tag: 'signal_cue_instantly', kind: 'action', title: 'Signal Cue (Instant)', reads: [], writes: ['cue.signal'], risk: 'safe',
    describe: (p) => `Instantly signals cue "${attr(p, 'cue', '(unset)')}".`,
  },
  reset_cue: {
    tag: 'reset_cue', kind: 'action', title: 'Reset Cue', reads: [], writes: ['cue.state'], risk: 'state_mutation',
    describe: (p) => `Resets cue "${attr(p, 'cue', '(unset)')}" back to its waiting state.`,
  },
  cancel_cue: {
    tag: 'cancel_cue', kind: 'action', title: 'Cancel Cue', reads: [], writes: ['cue.state'], risk: 'state_mutation',
    describe: (p) => `Cancels cue "${attr(p, 'cue', '(unset)')}" (stops it and its sub-cues).`,
  },
  set_value: {
    tag: 'set_value', kind: 'action', title: 'Set Variable', reads: [], writes: ['variable'], risk: 'state_mutation',
    describe: (p) => `Sets variable ${attr(p, 'name', '(unset)')}` +
      (p?.exact !== undefined ? ` to ${attr(p, 'exact')}.` : (p?.min !== undefined ? ` to a value in [${attr(p, 'min')}, ${attr(p, 'max', '?')}].` : `.`)),
  },
  add_value: {
    tag: 'add_value', kind: 'action', title: 'Add To Variable', reads: ['variable'], writes: ['variable'], risk: 'state_mutation',
    describe: (p) => `Adds to variable ${attr(p, 'name', '(unset)')}.`,
  },
  remove_value: {
    tag: 'remove_value', kind: 'action', title: 'Remove Variable', reads: [], writes: ['variable'], risk: 'state_mutation',
    describe: (p) => `Removes variable ${attr(p, 'name', '(unset)')}.`,
  },
  set_faction_relation: {
    tag: 'set_faction_relation', kind: 'action', title: 'Set Faction Relation', reads: [], writes: ['faction.relations'], risk: 'state_mutation',
    describe: (p) => `Sets the relation between factions ${attr(p, 'faction', '?')} and ${attr(p, 'otherfaction', '?')}.`,
  },
  custom_event: {
    tag: 'custom_event', kind: 'event', title: 'Custom Event', reads: ['expression'], writes: [], risk: 'safe',
    describe: (p) => `Custom trigger: ${attr(p, 'rawXml', '(custom)')}.`,
  },
  custom_xml: {
    tag: 'custom_xml', kind: 'action', title: 'Custom XML', reads: ['unknown'], writes: ['unknown'], risk: 'state_mutation',
    // Honest fallback: we show the raw XML verbatim rather than guess what it does.
    describe: (p) => {
      const raw = attr(p, 'rawXml', '').trim();
      if (!raw) return `Custom XML action (empty).`;
      // Surface the leading element name deterministically; show the raw verbatim.
      const m = raw.match(/^<\s*([a-zA-Z0-9_]+)/);
      const lead = m ? m[1] : 'custom';
      return `Runs a custom <${lead}> XML action: ${raw}`;
    },
    note: 'Custom XML is shown verbatim rather than paraphrased — the studio does not guess the meaning of un-templated elements.',
  },
};

/** Humanize an unknown tag deterministically: snake_case → "Snake Case". */
function humanizeTag(tag: string): string {
  return String(tag || 'element')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Generic, honest fallback semantics for any element with no curated entry. */
export function fallbackSemantics(tag: string, kind: SemanticKind = 'other'): ElementSemantics {
  return {
    tag,
    kind,
    title: humanizeTag(tag),
    reads: [],
    writes: [],
    risk: 'safe',
    describe: (p) => {
      const keys = p ? Object.keys(p).filter((k) => k !== 'rawXml') : [];
      const attrs = keys.map((k) => `${k}=${attr(p, k)}`).join(', ');
      return `Runs <${tag}>${attrs ? ` with ${attrs}` : ''}.`;
    },
  };
}

/** Look up curated semantics for an element tag, or null if it's long-tail. */
export function getElementSemantics(tag: string): ElementSemantics | null {
  if (!tag) return null;
  return REGISTRY[tag] || null;
}

/** Resolve semantics for a tag, falling back to the generic honest description. */
export function resolveElementSemantics(tag: string, kind: SemanticKind = 'other'): ElementSemantics {
  return getElementSemantics(tag) || fallbackSemantics(tag, kind);
}

/** The deterministic, per-node plain-English description (Phase-2 explainer reads this). */
export function describeNode(node: Pick<MDNode, 'xmlTag' | 'type' | 'properties'>): string {
  const tag = node?.xmlTag || '';
  const kind = (node?.type as SemanticKind) || 'other';
  const sem = resolveElementSemantics(tag, kind);
  try {
    return sem.describe(node?.properties || {});
  } catch {
    return `Runs <${tag}>.`;
  }
}

/** Full deterministic semantic record for a node (description + effects + risk + note). */
export function semanticsForNode(node: Pick<MDNode, 'xmlTag' | 'type' | 'properties'>) {
  const tag = node?.xmlTag || '';
  const kind = (node?.type as SemanticKind) || 'other';
  const sem = resolveElementSemantics(tag, kind);
  return {
    tag,
    title: sem.title,
    kind: sem.kind,
    description: describeNode(node),
    reads: sem.reads,
    writes: sem.writes,
    risk: sem.risk,
    note: sem.note,
    curated: getElementSemantics(tag) !== null,
  };
}

/** Listing for the public GET lookup endpoint (no describe fns — JSON-safe). */
export function listSemantics() {
  return Object.values(REGISTRY).map((s) => ({
    tag: s.tag,
    title: s.title,
    kind: s.kind,
    reads: s.reads,
    writes: s.writes,
    risk: s.risk,
    note: s.note,
  }));
}

/* ------------------------------------------------------------------ *
 * Self-test oracle — the fast deterministic proof. House contract:
 * returns { allPassed, passed, total, checks:[{name, pass, detail}] }.
 * ------------------------------------------------------------------ */
export function runSemanticsSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });
  const node = (xmlTag: string, properties: any = {}, type: any = 'action') =>
    ({ xmlTag, type, properties } as Pick<MDNode, 'xmlTag' | 'type' | 'properties'>);

  // --- registry coverage ---
  ok('registry_has_common_tags',
    ['cue', 'event_object_changed_sector', 'play_sound', 'reward_player', 'set_object_shieldlevel', 'create_ship', 'custom_xml']
      .every((t) => getElementSemantics(t) !== null));

  // --- deterministic descriptions fill from real attributes ---
  ok('describe_play_sound',
    describeNode(node('play_sound', { object: 'playership', sound: 'alarm_red' })) ===
    `Plays the 'alarm_red' sound at playership's location.`,
    describeNode(node('play_sound', { object: 'playership', sound: 'alarm_red' })));

  ok('describe_reward_player',
    describeNode(node('reward_player', { money: '100000' })) === `Gives the player 100000 credits.`,
    describeNode(node('reward_player', { money: '100000' })));

  // level=0 special-cases to "drops shields completely"
  const shieldDesc = describeNode(node('set_object_shieldlevel', { object: 'player.primaryship', level: '0' }));
  ok('describe_shield_zero', /shield level to 0 \(drops its shields completely\)/.test(shieldDesc), shieldDesc);

  // non-zero level uses the plain template
  const shieldDesc2 = describeNode(node('set_object_shieldlevel', { object: 'playership', level: '50' }));
  ok('describe_shield_nonzero', /shield level to 50\./.test(shieldDesc2) && !/drops/.test(shieldDesc2), shieldDesc2);

  ok('describe_event_sector',
    /Triggers when playership changes sector \(target sector: player\.sector\)\./.test(
      describeNode(node('event_object_changed_sector', { object: 'playership', sector: 'player.sector' }, 'event'))));

  // --- long-tail fallback is honest, not invented ---
  const fb = describeNode(node('set_object_someunknownthing', { object: 'x', value: '7' }));
  ok('fallback_is_generic', fb === `Runs <set_object_someunknownthing> with object=x, value=7.`, fb);
  ok('fallback_no_curated', getElementSemantics('set_object_someunknownthing') === null);

  // --- custom_xml shows raw verbatim, never paraphrased ---
  const cx = describeNode(node('custom_xml', { rawXml: '<set_object_shieldlevel object="player.primaryship" level="0"/>' }));
  ok('custom_xml_verbatim', cx.includes('<set_object_shieldlevel object="player.primaryship" level="0"/>'), cx);

  // --- reference equivalence: the anti-false-positive headline ---
  ok('equiv_playership_primaryship', areEquivalentRefs('playership', 'player.primaryship') === true);
  ok('equiv_identity', areEquivalentRefs('playership', 'playership') === true);
  ok('equiv_normalizes_this', areEquivalentRefs('this.playership', 'player.primaryship') === true);
  ok('equiv_whitespace', areEquivalentRefs('  playership ', 'player.primaryship') === true);
  // genuinely-different entities are NOT claimed equal (avoid the inverse error)
  ok('equiv_distinct_false', areEquivalentRefs('playership', 'player.entity') === false);
  ok('equiv_empty_false', areEquivalentRefs('', 'playership') === false);

  // --- state effects feed the simulator / blast-radius ---
  ok('effect_shield_write', semanticsForNode(node('set_object_shieldlevel', { level: '0' })).writes.includes('object.shields'));
  ok('effect_reward_write', semanticsForNode(node('reward_player', { money: '1' })).writes.includes('player.money'));
  ok('effect_checkvalue_read', semanticsForNode(node('check_value', { value: '1', }, 'condition')).reads.includes('expression'));

  // --- risk classes feed the critic ---
  ok('risk_shield_mutation', semanticsForNode(node('set_object_shieldlevel', {})).risk === 'state_mutation');
  ok('risk_reward_economy', semanticsForNode(node('reward_player', {})).risk === 'economy');
  ok('risk_create_spawn', semanticsForNode(node('create_ship', {})).risk === 'spawn');
  ok('risk_destroy_irreversible', semanticsForNode(node('destroy_object', {})).risk === 'irreversible');
  ok('risk_play_sound_safe', semanticsForNode(node('play_sound', {})).risk === 'safe');

  // --- every registry entry is well-formed (no throwing describe, required fields) ---
  let wellFormed = true;
  for (const s of Object.values(REGISTRY)) {
    if (!s.tag || !s.title || !s.kind || !s.risk || typeof s.describe !== 'function') { wellFormed = false; break; }
    try { s.describe({}); } catch { wellFormed = false; break; }
  }
  ok('all_entries_well_formed', wellFormed);

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
