# B58 · Community patch — the gap-map candidates, RECONCILED — SPECIFIED 2026-07-17

Lane: **FULL** (multi-unit patch scope). Source research:
`docs/research/2026-07-17-community-gap-map.md`. Ken's standing caution honored: every item was
reconciled against existing capability BEFORE speccing; two candidates collapsed or vanished.

## Reconcile results (the headline)

- **B58e (debug-logging onboarding) — ALREADY SHIPPED.** `healthCard.ts` (walkaround card)
  already reports "No debuglog found — … (launch X4 with -debug scripts -logfile debuglog.txt)".
  ACTION: none. Recorded as reconciled-exists; do not build.
- **B58b (conflict analyzer) — ENGINE ALREADY SHIPPED, projection missing.** The stack is deep:
  `runExtensionDoctor` (server.ts ~4392, GET endpoint ~4740) scans the extensions root, parses
  deps, simulates load order, detects ≥2 mods touching one base file; `overrideMap.analyzeOverrides`
  drills to ELEMENT/attribute granularity with contested/merged/WINNER semantics (T4.4);
  `modDependencyGraph` (#66) adds missing-required/cycles/dependents; the Diagnostics INSTALL tab
  renders it. **B58b is therefore a PROJECTION slice only:** ① MCP tool `check_conflicts`
  (Doctor summary: contested files w/ winners, missing deps, cycles), ② IDE command "Check Mod
  Conflicts" mapping contested files into the Problems panel. NO new analysis code.
- **B58d (custom gamestart) — substrate exists.** `modRecipes.ts` already ships
  `gamestart_patrol` + `buildRecipeWorkspace` Q&A machinery, and gamestarts is a routed,
  corpus-proven validation domain (B46P2). B58d = ONE new recipe (`custom_gamestart`: start
  ship, credits, sector, relations preset) — an EXTEND, not a build.
- **B58a (mission-arc templates) — genuine gap.** Existing templates are single-purpose
  (welcome/price/t-file/HUD); recipes are single-cue-ish. No multi-stage ARC skeleton exists.
  Ground every cue in x4-reference-mods/DeadAir patterns + the proven offer-accept pattern
  (event_object_signalled 'accept' — in-game proven 2026-07-01, ROADMAP #4). Scope: 2 templates
  this patch — `epic_arc_skeleton` (3 stages: offer→task→reward, briefing + objectives) and
  `war_reactive_mission` (war-state-gated offer). Patrol behavior DEFERRED (aiscript-side, own
  unit).
- **B58c (save-safety) — RESCOPED to facts, not rules.** No documented-grounded STATIC lint
  rules exist that we can ship without cry-wolf risk (rename detection needs history; the
  modified-flag is engine-side). v1 = a **save-impact FACTS section** in the brief/PROOF:
  cues added (named — renaming them later breaks saves), vanilla files patched (list), full-file
  overrides vs diffs. Deterministic facts only; zero new judgment rules.
- **B58f (missing-docs export) — extend the existing reference surface.** The app has a
  reference/X4-WIKI surface; add a generated "MD element reference" (schema attrs + census rank
  + curated semantics — the X4_NOTES generator generalized, paginated). Locate the tab's source
  during build; EXTEND it, never a parallel docs system.

## Build order (this patch) & acceptance
1. **B58b projection** — MCP `check_conflicts` drilled over stdio incl. a synthetic 2-mod
   collision fixture in a scratch extensions root (contested + winner + missing-dep surfaced);
   IDE command maps contested files to Problems (mapping selftest).
2. **B58d recipe** — recipes selftest extended (compiles 0 errors; answers flow into gamestart
   XML); routed-domain validation green on the emitted file.
3. **B58a templates** — templates selftest auto-covers compile-0-errors; rail metadata present;
   corpus-grounded pattern citations in comments; validate emitted md via project/validate.
4. **B58c facts section** — brief/proof selftest asserts the save-impact block renders the
   fixture mod's cues/patched files truthfully.
5. **B58f reference export** — deterministic generation selftest; eyes check of the rendered
   surface.
Gates per unit: focused oracle + tsc; patch-final: sweep + e2e + lint + precommit + eyes pass
on b/f surfaces + records/AAR.

## Out of scope this patch
Patrol/behavior aiscript template (own unit) · any save-flag manipulation · lemminx/EmmyLua
(B57 s6 bucket) · Steam Workshop publishing integration.
