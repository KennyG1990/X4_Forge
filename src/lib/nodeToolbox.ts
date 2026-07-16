import type { MDNode } from '../types';
import { STARTER_TAGS } from './mdFriendlyNames';

export type NodeTemplate = Omit<MDNode, 'id' | 'x' | 'y'>;
export type NodeToolboxMode = 'curated' | 'all';
export type NodeToolboxType = 'all' | 'cue' | 'event' | 'condition' | 'action';

/** B21's measured 2026-07-14 vanilla-corpus order (GET action-census?top=52). */
export const CENSUS_TOP_52_TAGS = [
  'set_value', 'param', 'debug_text', 'text', 'add_npc_line', 'append_to_list',
  'remove_value', 'create_order', 'add_player_choice', 'owner', 'add_to_group',
  'create_position', 'replace', 'position', 'assert', 'create_ship', 'break',
  'safepos', 'create_group', 'find_object_component', 'cancel_all_orders',
  'show_help', 'speak', 'substitute_text', 'destroy_object', 'return',
  'set_entity_traits', 'find_sector', 'rotation', 'remove_help',
  'remove_help_overlay', 'show_help_overlay', 'create_list', 'remove_from_list',
  'allow_conversation_escape', 'cutscene_event', 'signal_objects', 'find_station',
  'show_notification', 'append_list_elements', 'remove_from_group',
  'set_object_min_hull', 'set_userdata', 'stop_cutscene', 'play_cutscene', 'match',
  'add_effect', 'add_actor_to_room', 'add_inventory', 'set_object_name',
  'set_entity_overrides', 'create_object',
] as const;

/** These occur frequently as children but are not legal standalone palette actions. */
export const NON_STANDALONE_STRUCTURAL_TAGS = new Set([
  'param', 'text', 'owner', 'position', 'rotation', 'safepos', 'match', 'replace',
]);

/** Bounded plain-language aliases; raw labels and tags remain the authoritative search text. */
export const NODE_INTENT_ALIASES: Record<string, readonly string[]> = {
  reward_player: ['money', 'credits', 'cash', 'payment'],
  set_value: ['variable', 'remember', 'store value'],
  add_value: ['increment', 'increase variable'],
  remove_value: ['clear variable', 'delete variable'],
  show_help: ['message', 'popup', 'tutorial'],
  show_notification: ['message', 'toast', 'alert'],
  write_to_logbook: ['log', 'journal', 'message'],
  create_ship: ['spawn ship', 'fighter', 'vessel'],
  create_station: ['spawn station', 'build station'],
  destroy_object: ['delete object', 'kill object', 'remove object'],
  event_game_started: ['game start', 'new game', 'startup'],
  event_object_destroyed: ['death', 'killed', 'destroyed'],
  event_object_changed_sector: ['enter sector', 'leave sector', 'sector change'],
  do_if: ['if then', 'branch', 'condition'],
  do_while: ['loop', 'repeat'],
  do_for_each: ['loop list', 'each item'],
  wait: ['delay', 'timer', 'pause'],
  signal_cue: ['trigger cue', 'call cue'],
  debug_text: ['debug log', 'trace', 'print'],
};

const TOP_RANK = new Map<string, number>(CENSUS_TOP_52_TAGS.map((tag, index) => [tag, index]));

export interface NodeToolboxEntry {
  template: NodeTemplate;
  favorite: boolean;
  recent: boolean;
  curatedRank: number | null;
}

export interface BuildNodeToolboxOptions {
  templates: NodeTemplate[];
  nodeType?: NodeToolboxType;
  query?: string;
  mode?: NodeToolboxMode;
  favorites?: string[];
  recents?: string[];
}

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (value: string): string[] => normalize(value).split(/\s+/).filter(Boolean);

export function parseToolboxPreference(raw: string | null | undefined, limit = 100): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))].slice(0, limit);
  } catch {
    return [];
  }
}

export function buildNodeToolboxEntries({
  templates,
  nodeType = 'all',
  query = '',
  mode = 'curated',
  favorites = [],
  recents = [],
}: BuildNodeToolboxOptions): NodeToolboxEntry[] {
  const favoriteRank = new Map(favorites.map((tag, index) => [tag, index]));
  const recentRank = new Map(recents.map((tag, index) => [tag, index]));
  const normalizedQuery = normalize(query);
  const queryTokens = tokens(query);
  const byTag = new Map<string, NodeTemplate>();
  for (const template of templates) if (!byTag.has(template.xmlTag)) byTag.set(template.xmlTag, template);

  const scored: Array<NodeToolboxEntry & { score: number; label: string }> = [];
  for (const template of byTag.values()) {
    if (nodeType !== 'all' && template.type !== nodeType) continue;
    const tag = template.xmlTag;
    const structural = NON_STANDALONE_STRUCTURAL_TAGS.has(tag);
    const curatedRank = TOP_RANK.get(tag) ?? null;
    const favorite = favoriteRank.has(tag);
    const recent = recentRank.has(tag);
    const isCurated = !structural && (curatedRank !== null || STARTER_TAGS.has(tag) || favorite || recent);
    if (queryTokens.length === 0 && mode === 'curated' && !isCurated) continue;

    const aliasText = (NODE_INTENT_ALIASES[tag] || []).join(' ');
    const haystack = normalize(`${template.label} ${tag} ${aliasText}`);
    if (queryTokens.some(token => !haystack.includes(token))) continue;

    let score: number;
    if (queryTokens.length > 0) {
      const normalizedTag = normalize(tag);
      const normalizedLabel = normalize(template.label);
      const exact = normalizedTag === normalizedQuery || normalizedLabel === normalizedQuery;
      const prefix = normalizedTag.startsWith(normalizedQuery) || normalizedLabel.startsWith(normalizedQuery);
      const alias = queryTokens.every(token => normalize(aliasText).includes(token));
      // Relevance owns the large bands. Preferences and corpus rank may break ties,
      // but can never lift a fuzzy favorite above an exact tag/label match.
      score = exact ? 0 : prefix ? 10_000 : alias ? 20_000 : 30_000;
      score += curatedRank === null ? 500 : Math.min(curatedRank, 499);
      if (recent) score -= 100 - Math.min(recentRank.get(tag) ?? 0, 99);
      if (favorite) score -= 200 - Math.min(favoriteRank.get(tag) ?? 0, 99);
    } else {
      score = curatedRank === null ? 30_000 : 10_000 + curatedRank;
      if (STARTER_TAGS.has(tag)) score = Math.min(score, 12_000 + [...STARTER_TAGS].indexOf(tag));
      if (recent) score = 2_000 + (recentRank.get(tag) ?? 0);
      if (favorite) score = 1_000 + (favoriteRank.get(tag) ?? 0);
    }
    scored.push({ template, favorite, recent, curatedRank, score, label: normalizedLabelForSort(template) });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label) || a.template.xmlTag.localeCompare(b.template.xmlTag))
    .map(({ score: _score, label: _label, ...entry }) => entry);
}

function normalizedLabelForSort(template: NodeTemplate): string {
  return normalize(template.label || template.xmlTag);
}

export function runNodeToolboxSelftest() {
  const mk = (xmlTag: string, label: string, type: MDNode['type'] = 'action') => ({
    xmlTag, label, type, properties: {}, propertiesSchema: [], inputs: [], outputs: [], includeInBuild: true,
  } as NodeTemplate);
  const fixture = [
    mk('obscure_action', 'Obscure Action'),
    mk('create_ship', 'Create Ship'),
    mk('set_value', 'Set Value'),
    mk('reward_player', 'Reward Player'),
    mk('player_reward_history', 'Player Reward History'),
    mk('param', 'Parameter'),
    mk('event_game_started', 'Game Started', 'event'),
    mk('set_value', 'Duplicate Set Value'),
  ];
  const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
  const ok = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

  const curated = buildNodeToolboxEntries({ templates: fixture });
  ok('curated_excludes_long_tail', !curated.some(entry => entry.template.xmlTag === 'obscure_action'));
  ok('curated_excludes_structural_children', !curated.some(entry => entry.template.xmlTag === 'param'));
  ok('measured_order_preserved', curated.findIndex(e => e.template.xmlTag === 'set_value') < curated.findIndex(e => e.template.xmlTag === 'create_ship'));
  ok('deduplicates_by_tag', curated.filter(entry => entry.template.xmlTag === 'set_value').length === 1);
  ok('intent_alias_searches_full_catalog', buildNodeToolboxEntries({ templates: fixture, query: 'money' })[0]?.template.xmlTag === 'reward_player');
  ok('exact_search_outranks_fuzzy_favorite', buildNodeToolboxEntries({
    templates: fixture,
    query: 'reward player',
    favorites: ['player_reward_history'],
  })[0]?.template.xmlTag === 'reward_player');
  ok('raw_tag_search', buildNodeToolboxEntries({ templates: fixture, query: 'obscure_action' })[0]?.template.xmlTag === 'obscure_action');
  ok('favorite_surfaces_long_tail', buildNodeToolboxEntries({ templates: fixture, favorites: ['obscure_action'] })[0]?.template.xmlTag === 'obscure_action');
  ok('recent_surfaces_long_tail', buildNodeToolboxEntries({ templates: fixture, recents: ['obscure_action'] }).some(e => e.template.xmlTag === 'obscure_action'));
  ok('type_filter', buildNodeToolboxEntries({ templates: fixture, nodeType: 'event', mode: 'all' }).every(e => e.template.type === 'event'));
  ok('all_mode_keeps_structural', buildNodeToolboxEntries({ templates: fixture, mode: 'all' }).some(e => e.template.xmlTag === 'param'));
  ok('corrupt_preference_fails_soft', parseToolboxPreference('{bad json').length === 0);
  ok('preference_deduplicates', JSON.stringify(parseToolboxPreference('["a","a","b"]')) === JSON.stringify(['a', 'b']));
  ok('empty_results_safe', buildNodeToolboxEntries({ templates: fixture, query: 'definitely missing' }).length === 0);

  const passed = checks.filter(check => check.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
