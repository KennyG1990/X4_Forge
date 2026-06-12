// overrideMap.ts — T4.4 Override Visualizer engine (Inc 1).
//
// EXTENDS the Extension Doctor (server.ts runExtensionDoctor): the Doctor detects
// that >=2 mods touch the same base file and simulates load order; this module is
// the per-element drill-down on top of that data — for one target file, it builds
// the map of WHO rewrites WHAT (element/attribute granularity) and WHO WINS by
// load order. It deliberately reuses the Doctor's data shapes (folder/isDiff/
// selectors records, loadOrder array) and its xpath+xmldom resolution approach.
// It is NOT a new scan system: the server collects records, this module analyzes.
//
// House pattern: pure engine + runOverrideMapSelftest() oracle + public GET
// (wired in server.ts), THEN UI (Inc 2: PackageModDoctor drill-down panel).

import * as xpathLib from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import { selectorFor } from "./xpathSynth";

export interface PatchSelector { op: string; sel: string }

/** One mod's file occupying the target base path — same shape the Doctor collects. */
export interface OverrideRecord {
  folder: string;
  /** false = full-file override (no <diff> root) */
  isDiff: boolean;
  selectors: PatchSelector[];
}

export interface OverrideClaim {
  folder: string;
  /** add | replace | remove | fullfile */
  op: string;
  sel: string;
}

export interface OverrideEntry {
  /** Human-readable node identity: element path, element path + "/@attr", or "(entire file)". */
  node: string;
  kind: "element" | "attribute" | "file" | "selector";
  /** Claims sorted by simulated load order (earliest first). */
  claims: OverrideClaim[];
  /** >=2 distinct mods AND at least one destructive op (replace/remove/fullfile). */
  contested: boolean;
  /** >=2 distinct mods, all ops are add — X4 merges appends, low risk. */
  merged: boolean;
  /** Last-loaded claimant (the one whose change survives) — always set. */
  winner: string;
}

export interface OverrideMap {
  targetFile: string;
  /** Whether node identity was resolved against real base content ("base") or by
   *  normalized selector-string identity only ("string" — pre-T4.1 fallback). */
  resolution: "base" | "string";
  /** Folders claiming this file, in simulated load order. */
  loadOrder: string[];
  entries: OverrideEntry[];
  counts: { contested: number; merged: number; single: number };
}

export interface AnalyzeOverridesInput {
  targetFile: string;
  records: OverrideRecord[];
  /** Simulated global load order (folder names) from the Extension Doctor. */
  loadOrder: string[];
  /** Resolved vanilla content of targetFile, when available (loose or .cat/.dat). */
  baseContent?: string | null;
}

// Bounds mirror the Doctor's xpath-overlap guards.
const MAX_BASE_BYTES = 2_000_000;
const MAX_SELECTOR_EVALS = 200;
const MAX_MATCHES_PER_SELECTOR = 50;
const MAX_ENTRIES = 500;

// Element-path identity is delegated to xpathSynth.selectorFor — one selector
// builder for the whole codebase (review unification; a local near-duplicate
// lived here until the 38th pass).

function normalizeSel(sel: string): string {
  return sel.replace(/\s+/g, " ").trim();
}

function loadRankMap(loadOrder: string[]): Map<string, number> {
  return new Map(loadOrder.map((f, i) => [f, i]));
}

/**
 * Build the per-element override map for one contested base file.
 * Pure: no fs, no network — the caller supplies records, load order, and
 * (optionally) the resolved vanilla content.
 */
export function analyzeOverrides(input: AnalyzeOverridesInput): OverrideMap {
  const { targetFile, records, baseContent } = input;
  const rank = loadRankMap(input.loadOrder);
  const byRank = (a: string, b: string) => (rank.get(a) ?? -1) - (rank.get(b) ?? -1);

  // Folders touching this file, in simulated load order.
  const fileLoadOrder = [...new Set(records.map(r => r.folder))].sort(byRank);

  // node-identity key -> { kind, claims[] }
  const buckets = new Map<string, { kind: OverrideEntry["kind"]; claims: OverrideClaim[] }>();
  const claim = (key: string, kind: OverrideEntry["kind"], c: OverrideClaim) => {
    const b = buckets.get(key) || { kind, claims: [] };
    b.claims.push(c);
    buckets.set(key, b);
  };

  // Full-file overrides claim the whole document.
  for (const r of records) {
    if (!r.isDiff) claim("(entire file)", "file", { folder: r.folder, op: "fullfile", sel: "(entire file)" });
  }

  // Diff selectors: resolve against base content when we can, else bucket by
  // normalized selector string (honest fallback — flagged via `resolution`).
  let resolution: OverrideMap["resolution"] = "string";
  let doc: any = null;
  if (baseContent && baseContent.length <= MAX_BASE_BYTES) {
    try {
      doc = new DOMParser({ onError: () => { /* tolerate recoverable parse noise */ } })
        .parseFromString(baseContent, "text/xml");
      if (doc && doc.documentElement) resolution = "base";
      else doc = null;
    } catch { doc = null; }
  }

  let evaluated = 0;
  for (const r of records) {
    if (!r.isDiff) continue;
    for (const s of r.selectors) {
      const op = (s.op || "").toLowerCase();
      const c: OverrideClaim = { folder: r.folder, op, sel: s.sel };
      let matchedAny = false;
      if (doc && evaluated < MAX_SELECTOR_EVALS) {
        evaluated++;
        let matches: any;
        try { matches = xpathLib.select(s.sel, doc); } catch { matches = null; }
        if (Array.isArray(matches)) {
          for (const n of matches.slice(0, MAX_MATCHES_PER_SELECTOR)) {
            if (n && n.nodeType === 2) {
              // attribute node — key on owner element path + /@name
              const owner = (n as any).ownerElement;
              const key = `${owner ? selectorFor(owner) : ""}/@${n.nodeName}`;
              claim(key, "attribute", c);
              matchedAny = true;
            } else if (n && n.nodeType === 1) {
              claim(selectorFor(n), "element", c);
              matchedAny = true;
            }
          }
        }
      }
      // Selector unresolvable (no base, eval budget spent, bad xpath, or zero
      // matches — e.g. it targets another mod's addition): identity = the string.
      if (!matchedAny) claim(normalizeSel(s.sel), "selector", c);
    }
  }

  const entries: OverrideEntry[] = [];
  for (const [node, b] of buckets) {
    if (entries.length >= MAX_ENTRIES) break;
    const claims = [...b.claims].sort((a, c2) => byRank(a.folder, c2.folder));
    const folders = [...new Set(claims.map(x => x.folder))].sort(byRank);
    const destructive = claims.some(x => x.op === "replace" || x.op === "remove" || x.op === "fullfile");
    const contested = folders.length >= 2 && destructive;
    const merged = folders.length >= 2 && !destructive;
    entries.push({ node, kind: b.kind, claims, contested, merged, winner: folders[folders.length - 1] });
  }
  // contested first, then merged, then singles; stable by node name within groups
  const sevRank = (e: OverrideEntry) => (e.contested ? 0 : e.merged ? 1 : 2);
  entries.sort((a, b2) => sevRank(a) - sevRank(b2) || a.node.localeCompare(b2.node));

  const counts = { contested: 0, merged: 0, single: 0 };
  for (const e of entries) {
    if (e.contested) counts.contested++;
    else if (e.merged) counts.merged++;
    else counts.single++;
  }

  return { targetFile, resolution, loadOrder: fileLoadOrder, entries, counts };
}

/**
 * X4 load order: alphabetical by folder name (case-insensitive), with declared
 * dependencies loaded before their dependents. Deterministic topological sort —
 * extracted (38th pass) so runExtensionDoctor and the override-map endpoint
 * share ONE implementation instead of two copies.
 */
export function simulateLoadOrder(exts: { folder: string; idLower: string; deps: { id: string }[] }[]): string[] {
  const byIdLower = new Map(exts.map(e => [e.idLower, e]));
  const order: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (e: { folder: string; idLower: string; deps: { id: string }[] }) => {
    if (visited.has(e.folder)) return;
    if (visiting.has(e.folder)) return; // dependency cycle — bail out of the branch
    visiting.add(e.folder);
    for (const d of [...e.deps].sort((a, b) => a.id.localeCompare(b.id))) {
      const dep = byIdLower.get(d.id.toLowerCase());
      if (dep) visit(dep);
    }
    visiting.delete(e.folder);
    visited.add(e.folder);
    order.push(e.folder);
  };
  for (const e of [...exts].sort((a, b) => a.folder.toLowerCase().localeCompare(b.folder.toLowerCase()))) visit(e);
  return order;
}

// ---------------------------------------------------------------------------
// Selftest oracle — synthetic 3-mod collision (per ROADMAP T4.4 Inc 1).
// ---------------------------------------------------------------------------

export interface SelftestCheck { name: string; pass: boolean; detail?: string }

export function runOverrideMapSelftest(): { pass: boolean; checks: SelftestCheck[] } {
  const checks: SelftestCheck[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const base = `<?xml version="1.0"?>
<jobs>
  <job id="shared"><orders foo="1" bar="2"/></job>
  <job id="solo"><orders foo="9"/></job>
</jobs>`;

  const records: OverrideRecord[] = [
    { folder: "mod_a", isDiff: true, selectors: [{ op: "replace", sel: "/jobs/job[@id='shared']" }] },
    { folder: "mod_b", isDiff: true, selectors: [
      { op: "remove", sel: "//job[@id='shared']" },        // different string, SAME node as mod_a's
      { op: "add", sel: "/jobs" }
    ] },
    { folder: "mod_c", isDiff: true, selectors: [
      { op: "add", sel: "/jobs" },                          // add+add with mod_b — merges
      { op: "replace", sel: "/jobs/job[@id='shared']/orders/@foo" } // attribute-level
    ] }
  ];
  const loadOrder = ["mod_a", "mod_b", "mod_c"];

  // --- with base content (real node identity) ---
  const m = analyzeOverrides({ targetFile: "libraries/jobs.xml", records, loadOrder, baseContent: base });

  ok("base resolution active", m.resolution === "base", `resolution=${m.resolution}`);

  const shared = m.entries.find(e => e.node === "/jobs/job[@id='shared']");
  ok("cross-string node identity: mod_a replace + mod_b remove land on ONE element entry",
    !!shared && shared.kind === "element" && new Set(shared.claims.map(c => c.folder)).size === 2,
    shared ? `claims=${shared.claims.map(c => `${c.folder}:${c.op}`).join(",")}` : "entry missing");
  ok("shared element contested with load-order winner mod_b",
    !!shared && shared.contested && shared.winner === "mod_b",
    shared ? `contested=${shared.contested} winner=${shared.winner}` : "entry missing");

  const adds = m.entries.find(e => e.node === "/jobs" && e.kind === "element");
  ok("add+add to shared parent is merged, not contested",
    !!adds && adds.merged && !adds.contested,
    adds ? `merged=${adds.merged} contested=${adds.contested}` : "entry missing");

  const attr = m.entries.find(e => e.kind === "attribute");
  ok("attribute-level claim resolves to element-path/@attr",
    !!attr && attr.node === "/jobs/job[@id='shared']/orders/@foo" && attr.winner === "mod_c",
    attr ? `node=${attr.node}` : "no attribute entry");
  ok("single-owner attribute is neither contested nor merged",
    !!attr && !attr.contested && !attr.merged);

  ok("counts consistent",
    m.counts.contested + m.counts.merged + m.counts.single === m.entries.length,
    JSON.stringify(m.counts));

  // --- full-file override joins the fight ---
  const m2 = analyzeOverrides({
    targetFile: "libraries/jobs.xml",
    records: [...records, { folder: "zz_fullmod", isDiff: false, selectors: [] }],
    loadOrder: [...loadOrder, "zz_fullmod"],
    baseContent: base
  });
  const ff = m2.entries.find(e => e.kind === "file");
  ok("full-file override produces an '(entire file)' claim with op fullfile",
    !!ff && ff.claims.some(c => c.op === "fullfile" && c.folder === "zz_fullmod"));

  // --- no base content: honest string-identity fallback ---
  const m3 = analyzeOverrides({ targetFile: "libraries/jobs.xml", records, loadOrder, baseContent: null });
  ok("no-base fallback reports resolution=string", m3.resolution === "string");
  const aStr = m3.entries.find(e => e.node === "/jobs/job[@id='shared']" && e.kind === "selector");
  const bStr = m3.entries.find(e => e.node === "//job[@id='shared']" && e.kind === "selector");
  ok("without base, differing selector strings stay separate entries (no fabricated identity)",
    !!aStr && !!bStr && aStr !== bStr);

  // --- dangling selector (matches nothing in base) falls back per-selector ---
  const m4 = analyzeOverrides({
    targetFile: "libraries/jobs.xml",
    records: [{ folder: "mod_x", isDiff: true, selectors: [{ op: "remove", sel: "//job[@id='does_not_exist']" }] }],
    loadOrder: ["mod_x"],
    baseContent: base
  });
  ok("zero-match selector degrades to a selector-identity entry without crashing",
    m4.entries.length === 1 && m4.entries[0].kind === "selector" && m4.entries[0].winner === "mod_x");

  const lo = simulateLoadOrder([
    { folder: "mod_b", idLower: "mod_b", deps: [{ id: "zdep_id" }] },
    { folder: "mod_z", idLower: "zdep_id", deps: [] }
  ]);
  ok("simulateLoadOrder: dependencies load before dependents despite alphabetical order",
    lo.join(",") === "mod_z,mod_b", lo.join(","));

  return { pass: checks.every(c => c.pass), checks };
}
