/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MD action-frequency census (BACKLOG B21, Vision v2 Phase 2 — 2026-07-11).
 *
 * MEASURE BEFORE CURATING (ADR-F2): 785 schema actions exist, ~40 have curated
 * semantics, and until now the curation order was judgment, not data. This engine
 * counts real action usage across the vanilla MD corpus (read from the game's own
 * cat/dat archives by the server route) and answers the only question that prices
 * B10 correctly: "how many actions must be curated to cover X% of real usage?"
 *
 * DOM-first counting (xmlLite) — commented-out actions and CDATA decoys are
 * structurally invisible, per the B6 house rule. Pure: files in, table out.
 */

import { parseXmlLenient, walkElements } from './xmlLite';

export interface CensusFile { name: string; text: string; }

export interface CensusRow {
  tag: string;
  count: number;
  /** Share of all counted action instances (0..100). */
  pct: number;
  /** Cumulative share down the ranking (0..100). */
  cumPct: number;
  curated: boolean;
}

export interface ActionCensus {
  filesScanned: number;
  filesUnparseable: number;
  totalInstances: number;
  distinctActions: number;
  /** Ranked by count desc, tag asc on ties. */
  ranked: CensusRow[];
  /** Curated coverage of OBSERVED usage: what % of real instances have curated semantics today. */
  curatedInstancePct: number;
  /** Smallest N such that the top N actions cover >= 90% of observed instances. */
  topNfor90pct: number;
}

export function computeActionCensus(
  files: CensusFile[],
  actionTags: ReadonlySet<string>,
  isCurated: (tag: string) => boolean,
): ActionCensus {
  const counts = new Map<string, number>();
  let filesUnparseable = 0;
  let totalInstances = 0;

  for (const f of files) {
    const root = parseXmlLenient(f.text);
    if (!root) { filesUnparseable += 1; continue; }
    walkElements(root, (el) => {
      const tag = el.nodeName;
      if (!actionTags.has(tag)) return;
      counts.set(tag, (counts.get(tag) || 0) + 1);
      totalInstances += 1;
    });
  }

  const ranked: CensusRow[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count, pct: 0, cumPct: 0, curated: isCurated(tag) }));

  let cum = 0;
  let curatedInstances = 0;
  let topNfor90pct = 0;
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    r.pct = totalInstances > 0 ? (r.count / totalInstances) * 100 : 0;
    cum += r.pct;
    r.cumPct = cum;
    if (r.curated) curatedInstances += r.count;
    if (topNfor90pct === 0 && cum >= 90) topNfor90pct = i + 1;
  }
  // Corpus smaller than the threshold (or empty): the whole list is the answer.
  if (topNfor90pct === 0) topNfor90pct = ranked.length;

  return {
    filesScanned: files.length,
    filesUnparseable,
    totalInstances,
    distinctActions: ranked.length,
    ranked,
    curatedInstancePct: totalInstances > 0 ? (curatedInstances / totalInstances) * 100 : 0,
    topNfor90pct,
  };
}

/* ------------------------------------------------------------------ *
 * Oracle
 * ------------------------------------------------------------------ */

export function runActionCensusSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  const actions = new Set(['set_value', 'reward_player', 'create_ship', 'debug_text']);
  const files: CensusFile[] = [
    {
      name: 'md/a.xml',
      text: `<mdscript><cues><cue name="C"><actions>
        <set_value name="$a" exact="1"/>
        <set_value name="$b" exact="2"/>
        <reward_player money="5"/>
        <!-- commented decoys must NOT count: <set_value/><create_ship/><debug_text/> -->
      </actions></cue></cues></mdscript>`,
    },
    {
      name: 'md/b.xml',
      text: `<mdscript><cues><cue name="D"><actions>
        <set_value name="$c" exact="3"/>
        <create_ship macro="m"/>
        <do_if value="true"><set_value name="$d" exact="4"/></do_if>
      </actions></cue></cues></mdscript>`,
    },
    { name: 'md/broken.xml', text: '<mdscript><unclosed' },
  ];
  const census = computeActionCensus(files, actions, (t) => t === 'set_value');

  ok('files_scanned', census.filesScanned === 3);
  ok('unparseable_counted_not_fatal', census.filesUnparseable === 1);
  ok('total_instances', census.totalInstances === 6, String(census.totalInstances));
  ok('comments_invisible', (census.ranked.find(r => r.tag === 'debug_text') === undefined));
  ok('nested_actions_counted', census.ranked.find(r => r.tag === 'set_value')?.count === 4);
  ok('rank_order', census.ranked[0]?.tag === 'set_value' && census.ranked.length === 3);
  ok('tie_broken_alpha', census.ranked[1]?.tag === 'create_ship' && census.ranked[2]?.tag === 'reward_player');
  ok('pct_math', Math.abs((census.ranked[0]?.pct ?? 0) - (4 / 6) * 100) < 1e-9);
  ok('cum_reaches_100', Math.abs((census.ranked[2]?.cumPct ?? 0) - 100) < 1e-9);
  ok('curated_instance_pct', Math.abs(census.curatedInstancePct - (4 / 6) * 100) < 1e-9, String(census.curatedInstancePct));
  ok('top_n_for_90', census.topNfor90pct === 3, String(census.topNfor90pct));
  const empty = computeActionCensus([], actions, () => false);
  ok('empty_corpus_degrades', empty.totalInstances === 0 && empty.curatedInstancePct === 0 && empty.topNfor90pct === 0 + empty.ranked.length);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
