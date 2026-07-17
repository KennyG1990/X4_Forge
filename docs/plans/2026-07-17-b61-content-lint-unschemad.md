# B61 · Content validation for un-schema'd domains (jobs first) — RECONCILE + SPEC 2026-07-17

Lane: FULL. Status: **SPECIFIED — build is Ken-gated (design decision), NOT started.**
Origin: Ken's directive off the B59d honest limit — "if you've identified un-schema'd work it
sounds like we need a schema for that." Reconcile done read-only while Ken is away (weekend).

## Reconcile (verified 2026-07-17, read-only)

**The gap is real and already precisely characterized by the codebase — this is NOT rediscovery.**
- The unpacked 9.00 corpus ships **no `jobs.xsd` and no `wares.xsd`** (and none for god.xml,
  ships.xml, loadouts.xml, stations/modules, constructionplans.xml, baskets.xml, and ~29 niche
  library domains). Confirmed by enumerating `libraries/*.xml` vs `libraries/*.xsd`.
- `src/lib/schemaRouting.ts:70-71` already maps `jobs.xml → null` and `wares.xml → null`,
  **CORPUS-FALSIFIED 2026-07-16**: they must not route to `libraries.xsd` (that schema governs a
  different usage; the game ships no content schema for jobs/wares). Diff-rooted jobs/wares patches
  currently get **wrapper-only `diff.xsd`** validation — the `<diff>` shape is checked, the job/ware
  CONTENT is not. So a structurally-valid diff carrying a semantically-wrong job compiles clean and
  fails only in-game (the exact hole the B59d copy admits, and the B59b AAR flagged).
- Existing infra to REUSE (do not rebuild): the `null`-route hook (jobs.xml already has a routing
  slot); the `CORPUS_PROVEN_DOMAINS` cry-wolf gate (findings for unproven domains severity-capped to
  WARNING — schemaRouting.ts:48-55, 192-193); the reference sets already threaded through validation
  (`references?: { macros, wares, factions }` — schemaRouting.ts:174) which a job linter needs anyway.

**Extend-vs-new decision (workflow rule 3.5):** there is no XSD to extend → this is a **NEW pure
lib** (`src/lib/jobsContentLint.ts`), but it PLUGS INTO the existing routing + cry-wolf + reference-set
machinery rather than standing up parallel infrastructure. Same house pattern as patchReadiness
(B59a): pure resolver/vocabulary-injected engine + `run*Selftest()` oracle + advisory WARNING findings.

## Design (proposed — for Ken's sign-off)

**A corpus-GROUNDED content linter, NOT a hand-authored XSD.** It does not invent rules; it learns
the legal vocabulary from vanilla `jobs.xml` (606 jobs) and checks a mod's jobs against it:
1. **Learn** (from the corpus, at index time): the set of legal `<order>` names, `<location class=>`
   values, ship-select `tags`, faction refs, and which `<job>` child elements/attrs actually occur in
   vanilla. This is the "schema" — derived from real data, not asserted.
2. **Check** a mod's job entries (whether authored fresh or diff-added) against that learned vocabulary
   + the existing reference sets (macro/faction existence). Findings advisory (WARNING), cry-wolf-gated
   exactly like the routed domains.
3. **Scope:** jobs first (highest-value overhaul target, known gap, has the null-route hook).
   `wares.xml` is the natural phase 2 (same pattern, price/economy vocabulary). god.xml and the rest
   are OUT until jobs proves the pattern.

## Acceptance contract (proposed)
- Pure lib + oracle `jobs-content-lint-selftest` (sweep-discovered).
- **Zero-false-positive corpus proof (the cry-wolf bar):** every one of the 606 vanilla jobs lints
  CLEAN through the engine — a domain that cries wolf on legit vanilla content cannot ship.
- **Negative path:** a synthetic job with an invented order / bad class / non-existent macro →
  exactly the expected WARNING(s), no more.
- Wire into the jobs.xml null-route (a new route kind) + surface through the same validate response
  + capsules currency (so IDE/MCP/loop all see it, per B57s2).
- Gates: tsc/lint/precommit/sweep/e2e green; publish decision Ken's.

## Risks & boundaries
- **Cry-wolf is THE risk** (this surface's #1 historical failure mode). Mitigated structurally by the
  corpus-clean bar + WARNING cap + the existing CORPUS_PROVEN_DOMAINS gate (jobs only promoted to
  "proven" after the 606-clean proof). If it can't hit corpus-clean, it ships capped or not at all.
- Out of scope: authoring a real XSD; wares/god/ships (phase 2+); semantic correctness beyond
  vocabulary (a legal-but-pointless job still passes — no linter reads intent).
- Rollback: additive pure lib + one route-kind; single-commit revert.

## Why the build waits for Ken
This authors validation the game itself does not ship — a product-direction decision (does the Forge
assert a "schema" Egosoft never blessed, and is the cry-wolf risk worth the catch?). The reconcile +
this spec de-risk it, but the go/no-go on shape is Ken's. Reconcile is read-only and done; build holds.
