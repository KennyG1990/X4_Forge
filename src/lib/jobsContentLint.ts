/**
 * jobsContentLint.ts — B61 (2026-07-17): corpus-grounded content lint for jobs.xml.
 *
 * X4 ships NO content XSD for jobs (schemaRouting.ts maps jobs.xml → null; only the <diff> WRAPPER
 * validates — B46P2/B59b). A structurally-valid diff can still carry a semantically-wrong job (an
 * invented order, a bad location class, a non-existent faction, a wrong ship size) that compiles
 * clean and fails only in-game — the exact gap the B59d anti-hallucination copy admits, which Ken
 * then directed us to close ("we need a schema for that").
 *
 * This is NOT a hand-authored XSD (there is none to extend). It LEARNS the legal vocabulary from the
 * real vanilla jobs.xml and checks a mod's jobs against it, advisory only (WARNING severity when
 * surfaced). Cry-wolf — the documented #1 failure mode of validation surfaces — is defended three ways:
 *   1. NARROW scope: only a few closed-set attributes are checked (location/@class, order/@order,
 *      ship/select/@size, and faction refs when a reference set is supplied). Unknown elements/attrs
 *      are IGNORED, never flagged.
 *   2. Learned-from-corpus: vocabulary comes from vanilla itself, so learn-X ∧ check-X ⇒ 0 findings
 *      (the corpus-clean bar — all 606 vanilla jobs must lint clean).
 *   3. Honest messaging: an unknown value is reported as "not a known vanilla value — ignore if you
 *      defined it in your mod", i.e. a hint, not an assertion of breakage.
 *
 * Pure + vocabulary-injected (mirrors patchReadiness.ts): the oracle needs no game install; the
 * server wires learnJobsVocabulary() to the real jobs.xml (+ faction reference set) from the game root.
 */

import { DOMParser } from "@xmldom/xmldom";

export interface JobsVocabulary {
  /** location/@class values seen in vanilla (galaxy, sector, zone, station, ...) */
  classes: Set<string>;
  /** orders/order/@order values seen in vanilla (Patrol, TradeRoutine, Escort, ...) */
  orders: Set<string>;
  /** ship/select/@size values seen in vanilla (ship_s, ship_m, ship_l, ship_xl, ...) */
  sizes: Set<string>;
  /** known faction ids (from the merged reference sets). undefined ⇒ faction checks are SKIPPED. */
  factions?: Set<string>;
}

export type JobLintKind =
  | "missing_id"
  | "unknown_order"
  | "unknown_location_class"
  | "unknown_ship_size"
  | "unknown_faction";

export interface JobLintFinding {
  jobId: string;
  kind: JobLintKind;
  value: string;
  message: string;
}

export interface JobsLintResult {
  findings: JobLintFinding[];
  summary: { jobs: number; findings: number; byKind: Record<JobLintKind, number> };
}

export interface LintJobsInput {
  /** the mod's jobs content — a full <jobs> doc OR a <diff> wrapping <add><job/></add>, etc. */
  jobsXml: string;
  vocabulary: JobsVocabulary;
}

const MAX_JOBS = 5000; // vanilla has 606; a runaway backstop, never a real cap.

function parseDoc(content: string | null): Document | null {
  if (!content || !content.trim()) return null;
  const attempt = (xml: string): Document | null => {
    try {
      const doc = new DOMParser({ onError: () => { /* tolerate recoverable parse noise */ } })
        .parseFromString(xml, "text/xml");
      return doc && doc.documentElement ? (doc as unknown as Document) : null;
    } catch {
      return null;
    }
  };
  // Full doc first; if that yields nothing (e.g. a bare multi-<job> fragment), wrap and retry.
  return attempt(content) || attempt(`<__wrap>${content}</__wrap>`);
}

/** Collect the distinct attribute values found on `tag` elements' `attr` within a parsed doc. */
function collectAttr(doc: Document, tag: string, attr: string, into: Set<string>): void {
  const els = doc.getElementsByTagName(tag);
  for (let i = 0; i < els.length; i++) {
    const v = els[i].getAttribute(attr);
    if (v) into.add(v);
  }
}

/**
 * Learn the legal jobs vocabulary from a vanilla jobs.xml string. Optionally attach a faction id set
 * (from the merged reference sets) so faction refs can be checked; omit it to skip faction checks.
 */
export function learnJobsVocabulary(vanillaJobsXml: string, factions?: Set<string>): JobsVocabulary {
  const vocab: JobsVocabulary = { classes: new Set(), orders: new Set(), sizes: new Set() };
  const doc = parseDoc(vanillaJobsXml);
  if (doc) {
    collectAttr(doc, "location", "class", vocab.classes);
    collectAttr(doc, "order", "order", vocab.orders);
    collectAttr(doc, "select", "size", vocab.sizes);
  }
  if (factions) vocab.factions = factions;
  return vocab;
}

function emptyByKind(): Record<JobLintKind, number> {
  return { missing_id: 0, unknown_order: 0, unknown_location_class: 0, unknown_ship_size: 0, unknown_faction: 0 };
}

/**
 * Lint a mod's jobs content against a learned vocabulary. Finds every <job> anywhere in the tree
 * (so it works for a full <jobs> doc AND for a <diff>/<add> wrapper), and checks only the grounded
 * closed-set attributes. Everything else is intentionally left alone.
 */
export function lintJobsContent(input: LintJobsInput): JobsLintResult {
  const { jobsXml, vocabulary } = input;
  const findings: JobLintFinding[] = [];
  const byKind = emptyByKind();
  const doc = parseDoc(jobsXml);
  let jobCount = 0;
  if (!doc) return { findings, summary: { jobs: 0, findings: 0, byKind } };

  const add = (jobId: string, kind: JobLintKind, value: string, message: string) => {
    findings.push({ jobId, kind, value, message });
    byKind[kind]++;
  };

  const jobs = doc.getElementsByTagName("job");
  for (let i = 0; i < jobs.length && jobCount < MAX_JOBS; i++) {
    const job = jobs[i];
    // A <job> nested in <jobs>...</jobs> only — skip a <jobs> element's own listing wrappers if any.
    jobCount++;
    const id = job.getAttribute("id") || "";
    const jobId = id || "(no id)";
    if (!id) {
      add(jobId, "missing_id", "", "This <job> has no id attribute — X4 identifies jobs by id; it will not load correctly without one.");
    }

    // location/@class — direct/descendant location elements of this job
    const locs = job.getElementsByTagName("location");
    for (let j = 0; j < locs.length; j++) {
      const cls = locs[j].getAttribute("class");
      if (cls && !vocabulary.classes.has(cls)) {
        add(jobId, "unknown_location_class", cls,
          `location class="${cls}" is not a known vanilla job location class (${[...vocabulary.classes].sort().join(", ")}). Check for a typo — or ignore this if it is intentional.`);
      }
    }

    // orders/order/@order
    const orders = job.getElementsByTagName("order");
    for (let j = 0; j < orders.length; j++) {
      const ord = orders[j].getAttribute("order");
      if (ord && !vocabulary.orders.has(ord)) {
        add(jobId, "unknown_order", ord,
          `order="${ord}" is not a known vanilla order used by jobs. Likely a typo (orders are case-sensitive) — or ignore this if your mod defines it.`);
      }
    }

    // ship/select/@size
    const selects = job.getElementsByTagName("select");
    for (let j = 0; j < selects.length; j++) {
      const size = selects[j].getAttribute("size");
      if (size && !vocabulary.sizes.has(size)) {
        add(jobId, "unknown_ship_size", size,
          `ship select size="${size}" is not a known vanilla ship size (${[...vocabulary.sizes].sort().join(", ")}). Check for a typo — or ignore this if it is intentional.`);
      }
    }

    // faction refs (only when a reference set is available — else skip, never guess)
    if (vocabulary.factions) {
      const refCheck = (el: Element | null, attr: string) => {
        if (!el) return;
        const f = el.getAttribute(attr);
        if (f && !vocabulary.factions!.has(f)) {
          add(jobId, "unknown_faction", f,
            `faction "${f}" is not a known faction in your setup — check the id, or make sure the mod that adds it is installed.`);
        }
      };
      for (let j = 0; j < selects.length; j++) refCheck(selects[j], "faction");
      const owners = job.getElementsByTagName("owner");
      for (let j = 0; j < owners.length; j++) refCheck(owners[j], "exact");
    }
  }

  return { findings, summary: { jobs: jobCount, findings: findings.length, byKind } };
}

/* ------------------------------------------------------------------ *
 * Oracle — synthetic fixtures grounded in real vanilla vocabulary.
 * No game install needed (pure). The real-corpus 606-clean proof is a
 * separate live validation (learn from + lint the real jobs.xml → 0).
 * ------------------------------------------------------------------ */

export function runJobsContentLintSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  // A tiny "vanilla" fixture using REAL vocabulary values (galaxy/sector, Patrol/TradeRoutine, ship_s/m).
  const vanilla = `<?xml version="1.0"?><jobs>
    <job id="argon_patrol_l">
      <orders><order order="Patrol" default="true"/></orders>
      <location class="galaxy" macro="xu_ep2_universe_macro"/>
      <ship><select faction="argon" tags="[fighter]" size="ship_m"/><owner exact="argon"/></ship>
    </job>
    <job id="teladi_trade_s">
      <orders><order order="TradeRoutine" default="true"/></orders>
      <location class="sector"/>
      <ship><select faction="teladi" size="ship_s"/><owner exact="teladi"/></ship>
    </job>
  </jobs>`;

  const factions = new Set(["argon", "teladi", "paranid"]);
  const vocab = learnJobsVocabulary(vanilla, factions);

  // Vocabulary learned correctly from the fixture.
  ok("learned_classes", vocab.classes.has("galaxy") && vocab.classes.has("sector"), [...vocab.classes].join(","));
  ok("learned_orders", vocab.orders.has("Patrol") && vocab.orders.has("TradeRoutine"), [...vocab.orders].join(","));
  ok("learned_sizes", vocab.sizes.has("ship_s") && vocab.sizes.has("ship_m"), [...vocab.sizes].join(","));

  // CORPUS-CLEAN (self-consistency): learn from X, lint X ⇒ zero findings (the cry-wolf bar in miniature).
  const clean = lintJobsContent({ jobsXml: vanilla, vocabulary: vocab });
  ok("corpus_clean_self", clean.findings.length === 0 && clean.summary.jobs === 2, JSON.stringify(clean.summary));

  // NEGATIVE: a mod job with an invented order, bad class, bad size, unknown faction, and no id.
  const badMod = `<?xml version="1.0"?><jobs>
    <job>
      <orders><order order="ConquerEverything" default="true"/></orders>
      <location class="wormhole"/>
      <ship><select faction="zenith" size="ship_titan"/><owner exact="zenith"/></ship>
    </job>
  </jobs>`;
  const bad = lintJobsContent({ jobsXml: badMod, vocabulary: vocab });
  ok("missing_id_flagged", bad.summary.byKind.missing_id === 1);
  ok("unknown_order_flagged", bad.summary.byKind.unknown_order === 1 && bad.findings.some(f => f.value === "ConquerEverything"));
  ok("unknown_class_flagged", bad.summary.byKind.unknown_location_class === 1 && bad.findings.some(f => f.value === "wormhole"));
  ok("unknown_size_flagged", bad.summary.byKind.unknown_ship_size === 1 && bad.findings.some(f => f.value === "ship_titan"));
  ok("unknown_faction_flagged", bad.summary.byKind.unknown_faction === 2, JSON.stringify(bad.summary.byKind)); // select + owner

  // Faction checks SKIP when no reference set is supplied (never guess-flag a legit modded faction).
  const noFacVocab = learnJobsVocabulary(vanilla); // no factions
  const noFac = lintJobsContent({ jobsXml: badMod, vocabulary: noFacVocab });
  ok("faction_skipped_without_refs", noFac.summary.byKind.unknown_faction === 0, JSON.stringify(noFac.summary.byKind));

  // DIFF WRAPPER: a job added via <diff><add sel="/jobs"> is still found and linted.
  const diffAdd = `<?xml version="1.0"?><diff>
    <add sel="/jobs">
      <job id="mymod_patrol"><orders><order order="Patrol"/></orders><location class="galaxy"/><ship><select faction="argon" size="ship_l"/></ship></job>
    </add>
  </diff>`;
  const diffVocab = learnJobsVocabulary(vanilla + '', factions);
  // ship_l isn't in the tiny fixture's learned sizes → expect exactly one unknown_ship_size, proving the walker reaches into the wrapper.
  const diffRes = lintJobsContent({ jobsXml: diffAdd, vocabulary: diffVocab });
  ok("diff_wrapper_job_found", diffRes.summary.jobs === 1, JSON.stringify(diffRes.summary));
  ok("diff_wrapper_linted", diffRes.summary.byKind.unknown_ship_size === 1 && diffRes.findings.some(f => f.value === "ship_l"));

  // Robustness: empty and malformed input never crash.
  ok("empty_safe", lintJobsContent({ jobsXml: "", vocabulary: vocab }).findings.length === 0);
  ok("malformed_safe", lintJobsContent({ jobsXml: "<jobs><job id='x'><location class=", vocabulary: vocab }).summary.jobs >= 0);

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
