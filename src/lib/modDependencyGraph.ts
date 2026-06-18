/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #66 (GLM Tier B #6) — Multi-mod project / dependency view, deterministic core.
 *
 * EXTENDS the Extension Doctor (server.ts runExtensionDoctor), which already parses
 * <dependency> from each content.xml, flags unresolved required deps, and computes a
 * load order via overrideMap.simulateLoadOrder. This module is the PURE graph analyzer
 * on top of that data — same split as overrideMap.ts ("the server collects records,
 * this module analyzes"). It adds two things the Doctor's path doesn't surface:
 *   1. a reusable content.xml manifest/dependency parser (no fs), and
 *   2. EXPLICIT dependency-cycle detection — simulateLoadOrder silently bails out of a
 *      cyclic branch, so cycles never reach the user; here they are reported as paths.
 * Also distinguishes missing-REQUIRED (breaks load) from missing-OPTIONAL (soft) deps.
 * Pure: no fs, no network. House pattern: engine + runModDependencyGraphSelftest() + GET.
 */

import { simulateLoadOrder } from './overrideMap';

export interface ModDependency {
  /** the dependency's extension id (X4 matches on id, case-insensitively) */
  id: string;
  version?: string;
  /** X4: optional="true" → soft dependency (load-after if present, no error if absent) */
  optional: boolean;
  name?: string;
}

export interface ModManifest {
  /** extension folder name (the on-disk identity / load-order key) */
  folder: string;
  /** content.xml id attribute */
  id: string;
  version?: string;
  name?: string;
  enabled?: boolean;
  deps: ModDependency[];
}

export interface DependencyNode {
  folder: string;
  id: string;
  name?: string;
  version?: string;
  enabled: boolean;
  /** declared deps that resolve to an installed mod */
  resolvedDeps: { id: string; folder: string; optional: boolean }[];
  /** declared REQUIRED dep ids with no installed match — these break the load */
  missingRequired: string[];
  /** declared OPTIONAL dep ids with no installed match — soft, informational */
  missingOptional: string[];
  /** folders that declare a dependency on THIS mod */
  dependents: string[];
}

export interface DependencyIssue {
  folder: string;
  modId: string;
  kind: 'missing_required' | 'missing_optional' | 'cycle' | 'self_dependency' | 'duplicate_dependency';
  /** plain-language, deterministic description */
  detail: string;
  /** the offending dependency id, when applicable */
  depId?: string;
  /** for kind === 'cycle': the closed folder path (first folder repeated at the end) */
  cyclePath?: string[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  /** resolved load order (deps before dependents; alpha-stable), via simulateLoadOrder */
  loadOrder: string[];
  /** detected dependency cycles, each a closed folder path (e.g. ['a','b','a']) */
  cycles: string[][];
  issues: DependencyIssue[];
  counts: { mods: number; missingRequired: number; missingOptional: number; cycles: number };
}

/* ------------------------------------------------------------------ *
 * Parsing — content.xml → manifest (no fs; takes the raw XML string).
 * Regex-based to mirror runExtensionDoctor's existing inline parse and to
 * tolerate the partial/odd content.xml files real mods ship.
 * ------------------------------------------------------------------ */

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : undefined;
}

/** Parse the <dependency> children of a content.xml string. */
export function parseContentDependencies(xml: string): ModDependency[] {
  if (!xml || typeof xml !== 'string') return [];
  const out: ModDependency[] = [];
  const re = /<dependency\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1] || '';
    const id = attr(body, 'id');
    if (!id) continue;
    const optRaw = (attr(body, 'optional') || '').toLowerCase();
    out.push({
      id,
      version: attr(body, 'version'),
      optional: optRaw === 'true' || optRaw === '1',
      name: attr(body, 'name'),
    });
  }
  return out;
}

/** Parse a full manifest (id/version/name/enabled + deps) from a content.xml string. */
export function parseModManifest(folder: string, xml: string): ModManifest | null {
  if (!xml || typeof xml !== 'string') return null;
  const tag = xml.match(/<content\b[^>]*>/i)?.[0];
  if (!tag) return null;
  const enabledRaw = (attr(tag, 'enabled') || '').toLowerCase();
  return {
    folder,
    id: attr(tag, 'id') || folder,
    version: attr(tag, 'version'),
    name: attr(tag, 'name'),
    // X4 default is enabled unless explicitly disabled
    enabled: !(enabledRaw === '0' || enabledRaw === 'false'),
    deps: parseContentDependencies(xml),
  };
}

/* ------------------------------------------------------------------ *
 * Analysis — manifests → dependency graph (resolution + cycles + order).
 * ------------------------------------------------------------------ */

/** Find every dependency cycle as a closed folder path. DFS with a recursion stack. */
function detectCycles(
  folders: string[],
  edges: Map<string, string[]>, // folder -> resolved dependency folders
): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();   // canonical signatures, to dedupe rotations
  const color = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 on-stack, 2 done
  const stack: string[] = [];

  const signature = (path: string[]): string => {
    // path is the cycle WITHOUT the repeated closing node; rotate to start at min for dedupe
    const min = path.reduce((a, b) => (a < b ? a : b));
    const i = path.indexOf(min);
    return [...path.slice(i), ...path.slice(0, i)].join('>');
  };

  const visit = (f: string) => {
    color.set(f, 1);
    stack.push(f);
    for (const next of edges.get(f) || []) {
      const c = color.get(next) || 0;
      if (c === 1) {
        // back-edge: cycle from `next` … up to current top of stack
        const start = stack.indexOf(next);
        if (start >= 0) {
          const loop = stack.slice(start);
          const sig = signature(loop);
          if (!seen.has(sig)) {
            seen.add(sig);
            cycles.push([...loop, next]); // closed path
          }
        }
      } else if (c === 0) {
        visit(next);
      }
    }
    stack.pop();
    color.set(f, 2);
  };

  for (const f of folders) if ((color.get(f) || 0) === 0) visit(f);
  return cycles;
}

export function analyzeModDependencies(mods: ModManifest[]): DependencyGraph {
  const list = Array.isArray(mods) ? mods.filter(m => m && m.folder) : [];
  // id (lowercased) -> folder. If two mods share an id, first wins (deterministic by input order).
  const folderByIdLower = new Map<string, string>();
  for (const m of list) {
    const key = (m.id || m.folder).toLowerCase();
    if (!folderByIdLower.has(key)) folderByIdLower.set(key, m.folder);
  }

  const issues: DependencyIssue[] = [];
  const dependentsOf = new Map<string, Set<string>>();
  list.forEach(m => dependentsOf.set(m.folder, new Set()));

  const edges = new Map<string, string[]>(); // folder -> resolved dep folders (for cycle/order)
  const nodes: DependencyNode[] = [];

  for (const m of list) {
    const resolvedDeps: DependencyNode['resolvedDeps'] = [];
    const missingRequired: string[] = [];
    const missingOptional: string[] = [];
    const seenDep = new Set<string>();
    const resolvedFolders: string[] = [];

    for (const d of m.deps) {
      const depKey = d.id.toLowerCase();
      if (seenDep.has(depKey)) {
        issues.push({ folder: m.folder, modId: m.id, kind: 'duplicate_dependency', depId: d.id,
          detail: `Declares dependency "${d.id}" more than once.` });
        continue;
      }
      seenDep.add(depKey);

      const targetFolder = folderByIdLower.get(depKey);
      if (targetFolder === m.folder) {
        issues.push({ folder: m.folder, modId: m.id, kind: 'self_dependency', depId: d.id,
          detail: `"${m.id}" depends on itself.` });
        continue;
      }

      if (targetFolder) {
        resolvedDeps.push({ id: d.id, folder: targetFolder, optional: d.optional });
        resolvedFolders.push(targetFolder);
        dependentsOf.get(targetFolder)?.add(m.folder);
      } else if (d.optional) {
        missingOptional.push(d.id);
        issues.push({ folder: m.folder, modId: m.id, kind: 'missing_optional', depId: d.id,
          detail: `Optional dependency "${d.id}" is not installed — "${m.id}" will still load.` });
      } else {
        missingRequired.push(d.id);
        issues.push({ folder: m.folder, modId: m.id, kind: 'missing_required', depId: d.id,
          detail: `Required dependency "${d.id}" is not installed — "${m.id}" will not load correctly.` });
      }
    }

    edges.set(m.folder, resolvedFolders);
    nodes.push({
      folder: m.folder, id: m.id, name: m.name, version: m.version,
      enabled: m.enabled !== false,
      resolvedDeps, missingRequired, missingOptional, dependents: [],
    });
  }

  // backfill dependents (sorted, deterministic)
  for (const n of nodes) n.dependents = [...(dependentsOf.get(n.folder) || [])].sort();

  // explicit cycles
  const cycles = detectCycles(list.map(m => m.folder), edges);
  for (const cyc of cycles) {
    const human = cyc.join(' → ');
    // attach the issue to the lexically-first folder in the loop for stable placement
    const anchor = cyc.slice(0, -1).reduce((a, b) => (a < b ? a : b));
    const anchorMod = list.find(m => m.folder === anchor);
    issues.push({ folder: anchor, modId: anchorMod?.id || anchor, kind: 'cycle',
      detail: `Dependency cycle: ${human}. X4 has no valid load order for these mods.`, cyclePath: cyc });
  }

  // resolved load order (deps before dependents) — reuse the Doctor's topo sort.
  const loadOrder = simulateLoadOrder(
    list.map(m => ({
      folder: m.folder,
      idLower: (m.id || m.folder).toLowerCase(),
      deps: m.deps.map(d => ({ id: d.id })),
    })),
  );

  const counts = {
    mods: list.length,
    missingRequired: issues.filter(i => i.kind === 'missing_required').length,
    missingOptional: issues.filter(i => i.kind === 'missing_optional').length,
    cycles: cycles.length,
  };

  // stable node order: by load order rank, then folder name
  const rank = new Map(loadOrder.map((f, i) => [f, i]));
  nodes.sort((a, b) => (rank.get(a.folder) ?? 1e9) - (rank.get(b.folder) ?? 1e9) || a.folder.localeCompare(b.folder));

  return { nodes, loadOrder, cycles, issues, counts };
}

/* ------------------------------------------------------------------ *
 * Deterministic oracle. House shape: { allPassed, pass, passed, total, checks[] }.
 * ------------------------------------------------------------------ */
export function runModDependencyGraphSelftest(): {
  allPassed: boolean; pass: boolean; passed: number; total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, cond: boolean, detail?: string) => checks.push({ name, pass: !!cond, detail });

  // --- parsing ---
  const cx = `<?xml version="1.0" encoding="utf-8"?>
<content id="my_mod" name="My Mod" version="120" enabled="true">
  <dependency id="ego_dlc_split" version="100"/>
  <dependency id="some_framework" optional="true"/>
  <text language="44" name="My Mod"/>
</content>`;
  const man = parseModManifest('my_mod_folder', cx)!;
  ok('parses content id', man.id === 'my_mod', man.id);
  ok('parses version', man.version === '120', man.version);
  ok('parses enabled', man.enabled === true);
  ok('parses two dependencies', man.deps.length === 2, JSON.stringify(man.deps));
  ok('marks optional dependency', man.deps.find(d => d.id === 'some_framework')?.optional === true);
  ok('required dependency not optional', man.deps.find(d => d.id === 'ego_dlc_split')?.optional === false);
  ok('disabled content parsed as disabled',
    parseModManifest('x', '<content id="x" enabled="false"></content>')!.enabled === false);
  ok('self-closing dependency parsed',
    parseContentDependencies('<content><dependency id="a" /></content>').length === 1);
  ok('non-content xml → null manifest', parseModManifest('x', '<jobs/>') === null);

  // --- analysis: missing required vs optional ---
  const g1 = analyzeModDependencies([
    { folder: 'a', id: 'a', deps: [{ id: 'missing_req', optional: false }, { id: 'missing_opt', optional: true }] },
  ]);
  ok('missing required flagged', g1.nodes[0].missingRequired.includes('missing_req'));
  ok('missing optional flagged separately', g1.nodes[0].missingOptional.includes('missing_opt'));
  ok('counts split required/optional', g1.counts.missingRequired === 1 && g1.counts.missingOptional === 1, JSON.stringify(g1.counts));

  // --- resolution + dependents + load order ---
  const g2 = analyzeModDependencies([
    { folder: 'app', id: 'app', deps: [{ id: 'lib', optional: false }] },
    { folder: 'lib', id: 'lib', deps: [] },
  ]);
  ok('dependency resolves to installed folder', g2.nodes.find(n => n.folder === 'app')!.resolvedDeps[0]?.folder === 'lib');
  ok('dependents backfilled', g2.nodes.find(n => n.folder === 'lib')!.dependents.includes('app'));
  ok('load order: dependency before dependent', g2.loadOrder.indexOf('lib') < g2.loadOrder.indexOf('app'), g2.loadOrder.join(','));
  ok('no cycles in acyclic graph', g2.cycles.length === 0);

  // --- explicit cycle detection (the thing simulateLoadOrder hides) ---
  const g3 = analyzeModDependencies([
    { folder: 'x', id: 'x', deps: [{ id: 'y', optional: false }] },
    { folder: 'y', id: 'y', deps: [{ id: 'x', optional: false }] },
  ]);
  ok('2-node cycle detected', g3.cycles.length === 1, JSON.stringify(g3.cycles));
  ok('cycle path is closed (first repeated last)',
    g3.cycles[0]?.length === 3 && g3.cycles[0][0] === g3.cycles[0][2], JSON.stringify(g3.cycles[0]));
  ok('cycle surfaced as issue', g3.issues.some(i => i.kind === 'cycle' && /cycle/i.test(i.detail)));

  // 3-node cycle, deduped (no rotation duplicates)
  const g4 = analyzeModDependencies([
    { folder: 'p', id: 'p', deps: [{ id: 'q', optional: false }] },
    { folder: 'q', id: 'q', deps: [{ id: 'r', optional: false }] },
    { folder: 'r', id: 'r', deps: [{ id: 'p', optional: false }] },
  ]);
  ok('3-node cycle detected once', g4.cycles.length === 1, JSON.stringify(g4.cycles));

  // --- self-dependency + duplicate dependency ---
  const g5 = analyzeModDependencies([
    { folder: 's', id: 's', deps: [{ id: 's', optional: false }, { id: 'k', optional: false }, { id: 'k', optional: false }] },
    { folder: 'k_folder', id: 'k', deps: [] },
  ]);
  ok('self-dependency flagged', g5.issues.some(i => i.kind === 'self_dependency'));
  ok('duplicate dependency flagged', g5.issues.some(i => i.kind === 'duplicate_dependency' && i.depId === 'k'));
  ok('id-based resolution (folder != id)', g5.nodes.find(n => n.folder === 's')!.resolvedDeps.some(d => d.folder === 'k_folder'));

  // --- degrades safely ---
  ok('empty input → empty graph', analyzeModDependencies([]).nodes.length === 0 && analyzeModDependencies([]).counts.mods === 0);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
