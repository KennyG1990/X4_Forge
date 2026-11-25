# Unit 54 — Broader MD Timing Attributes, Cross-Cue `CueName.$field` / Queue Provenance & Diagnostic Guidance (`#72` / `FF-32`)

Task: Extend `md_pitfall.numeric_time_value` in `src/lib/mdPitfallLints.ts` with sound cross-cue `CueName.$field` and `CueName.$queue` table-list numeric provenance, inline `table[...]` field tracking, broader XSD-grounded MD timing attribute checks (`cue/@checktime`, `cue/@checkinterval`, `delay/@exact|min|max`, `show_notification/@timeout`, `show_interactive_notification/@timeout`, `set_requested_job_ship_timeout/@timeout`), and dedicated `diagnosticExplain` remediation guidance (`#72`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Close the remaining static analysis and diagnostic guidance scope of `#72` (`FF-32`):
  1. **Inline `table[...]` literal field provenance (`src/lib/mdPitfallLints.ts`):** Extend `trackAssignment` beyond empty `table[]` via `parseMdTableLiteralEntries` so `table[$wait = 240, $actor = $npc]` or `table[$wait = State.$wait]` registers `$entry` as a fresh table and tracks proven numeric `$field` entries (`UNITLESS_NUMBER` or `facts.get(rhs)`).
  2. **Sound cross-cue `CueName.$field` and `CueName.$queue` provenance (`src/lib/mdPitfallLints.ts`):**
     - When `root` has no `<include_actions>`, identify unambiguous static root cues (`staticCueNames(root)`).
     - Seed `CueName.$field` across static root cues via two-pass fixed-point `collectCrossCueNumericInvariants` when there is `>= 1` proven numeric `<set_value name="CueName.$field" exact="..."/>` write and **`0`** non-numeric/conditional-operation/range/schema/dynamic writes to `CueName.$field` anywhere in `root` (and `0` writes to bare `$field` inside `<cue name="CueName">`'s own subtree). Preserve non-mutated `CueName.$field` seeds across guard `<do_if>` blocks and pure non-mutating tags (`debug_text`, `append_to_list`, `remove_from_list`, etc.).
     - Seed homogeneous `CueName.$queue` list-of-table field facts across static root cues when every mutation of `CueName.$queue` in `root` is `exact="[]"` initialization, `<remove_from_list>`, `<remove_value>`, `<clear_list>`, or `<append_to_list name="CueName.$queue" exact="..."/>` of a fresh unaliased table carrying a proven numeric `$field` (with `0` non-numeric writes to `.$field` on indexed or table receivers), propagating through `<set_value name="$entry" exact="CueName.$queue.{...}"/>` and `<do_for_each name="$entry" in="CueName.$queue">`.
  3. **Broader MD timing attributes (`src/lib/mdPitfallLints.ts`):**
     - Preserve `severity: 'error'` on X4-runtime-proven `play_cutscene[targetmonitor="true"]/@timeout` (`severity: 'warning'` when `fact.inferred` is true).
     - Emit `severity: 'warning'` `md_pitfall.numeric_time_value` with exact `(line, column)` and `sourceRef` (`<element>/@<attr>`) on `cue/@checktime`, `cue/@checkinterval`, `show_notification/@timeout`, `show_interactive_notification/@timeout`, `set_requested_job_ship_timeout/@timeout` (unitless literals + proven numeric variables), and `delay/@exact|min|max` (proven numeric variables across cue-level and action-interleaved `<delay>`).
     - Exclude `show_help/@timeout` (`common.xsd:7701` `booleanexpression`) and `<aiscript>` `<wait>` (`aiscripts/masstraffic.fight.xml:18`).
  4. **Remediation guidance (`src/lib/diagnosticExplain.ts`):** Add dedicated `GUIDANCE` rule for `md_pitfall.numeric_time_value` + selftest check (`26/26`).
- **Assumptions & authoritative references:**
  - GitHub Issue `#72` (`https://github.com/KennyG1990/X4_Forge/issues/72`).
  - X4 9.00 schemas: `md.xsd:1680-1688,4591-4604`, `common.xsd:7701,23396,31225,36960,37025`, `aiscripts.xsd:2144-2156`.
  - Pre-implementation 544-file X4 9.00 corpus audit (`362` MD + `182` AIScript files).
  - `no capability-map delta`; `0` new `fs.*` writers.
- **Risks & rollback:** Rollback target: `fdf94093cad850c29532b2719da6bd7f8371dddc`.

## BASELINE
- **Revision:** `fdf94093cad850c29532b2719da6bd7f8371dddc` (`main == origin/main`), clean working tree.

## RECONCILE
- **Resources & callers searched:** `src/lib/mdPitfallLints.ts` (`196-210`, `1159-1269`, `1548-1551`, `2485-2525`), `src/lib/diagnosticExplain.ts` (`100-275`), `src/server/projectValidation.ts` (`961`), `md.xsd`, `common.xsd`, `aiscripts.xsd`, and all `544` official X4 9.00 MD/AIScript files (`G:\Forge-QA\temp\probe-timing-attrs.ts`).
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT
- **`src/lib/mdPitfallLints.ts`:**
  - Added `parseMdTableLiteralEntries`, `enclosingStaticRootCueName`, `collectMutatedFieldNames`, `collectCrossCueNumericInvariants`, and `lintMdTimeValues` (replacing `lintMdCutsceneTimeouts` with fast zero-allocation bailout when no `$` variable appears in any timing attribute).
  - Added 4 selftest suites in `runMdPitfallSelftest()` (`117 -> 121` checks) covering cross-cue `State.$wait` + inline `table[...]` across guard `<do_if>` and `<debug_text>`, cross-cue `State.$queue` (`Queue.{1}` + `<remove_from_list>` + `<do_for_each>`), negative taint suppression (`240s` writer, bare `$wait` inside `<cue name="State">`, `<include_actions>`, heterogeneous queue, in-place post-append `$item.$wait = 240s`), and broader timing attributes (`7` warnings across `cue`, `show_notification`, `show_interactive_notification`, `set_requested_job_ship_timeout`, and interleaved `<delay>`, while `show_help/@timeout="true"` and literal `<delay exact="0.5"/>` produce `0` findings).
- **`src/lib/diagnosticExplain.ts`:**
  - Added dedicated `md_pitfall.numeric_time_value` `GUIDANCE` rule and `runDiagnosticExplainSelftest()` check (`25 -> 26`).
- **Deliberately unchanged:** `X4_CORE_RULE_PACK`, `config/durable-writers.json` (`50` raw writers, `74f0a969...`), `config/forge-route-dispositions.json`, `config/action-receipt-coverage.json`.

## VALIDATE
- `npx tsx G:\Forge-QA\temp\unit54-544-corpus-sweep.ts` -> `mdPitfallLints` **`121/121 PASS`**, `diagnosticExplain` **`26/26 PASS`**, and **`544` official X4 9.00 MD/AIScript files scanned in `11,846 ms` with `numericTimeFindingCount: 0`** (`task-14892`).
- `X4_REFERENCE_ROOT=... X4_XSD_PATH=... npx tsx scripts/diagnostic-source-navigation-selftest.ts` -> `33/33 passed` (`task-14898`).
- `X4_REFERENCE_ROOT=... X4_XSD_PATH=... npx tsx scripts/claude-validation-matrix.selftest.ts` -> `PASS` (`task-14898`).
- `npm run typecheck` -> exit `0` (`task-14898`).
- `npm run lint -- --max-warnings 600` -> `0` errors, `578` warnings (`task-14898`).
- `npm run test:writers` -> `30/30` selftest + `[durable-writer audit] PASS` (`50` raw writers, `74f0a969...`) + `8/8` `durableWrite` (`task-14898`).
- `npm run test:oracles` -> `134/134 PASS` (`md-pitfall-selftest 121/121`, `diagnostic-explain-selftest 26/26`, `reference-literal-lint-selftest 28/28`, `task-14910`).
- `npm run test:routes` (`X4_*` env unset) -> `802/802 PASS` (`task-14910`).
- `npm run precommit:check` -> `[precommit] OK` (`task-14910`).

## REVIEW
- Cross-cue `State.$wait` and `State.$queue` table-list numeric provenance across static root cues (with negative taint guards): **Done & evidenced**.
- Inline `table[...]` field provenance: **Done & evidenced**.
- Broader XSD-grounded MD timing attributes (`cue/@checktime`, `cue/@checkinterval`, `delay/@exact|min|max`, `show_notification/@timeout`, `show_interactive_notification/@timeout`, `set_requested_job_ship_timeout/@timeout`) with `0/544` official X4 9.00 false positives: **Done & evidenced**.
- Dedicated `diagnosticExplain` remediation guidance for `md_pitfall.numeric_time_value`: **Done & evidenced**.
- Public `0.0.96` VSIX delivery + installed `FORGE DEVELOPMENT` verification: **Next step (3-Unit Release Readiness Review triggered now)**.

## CLOSE
- **Status:** `VERIFIED`
- **3-Unit Release Readiness Review (`0.0.96` — Units 52 `cea83c1`, 53 `fdf9409`, and 54):**
  - Dev `typecheck`, `lint`, `test:writers` (`50` raw writers, `74f0a969...`), `test:oracles` (`134/134`), `test:routes` (`802/802`), `test:mcp-cold-bootstrap` (`7/7`), `544`-file X4 9.00 MD/AIScript sweep (`0` findings), and `126`-file X4 9.00 Lua sweep (`0` findings) are all green.
  - **Verdict:** **QUALIFIED** to execute clean-tree release gates (`prod oracle-sweep` + full `npm run test:e2e`) and publish **`0.0.96`** to Open VSX (`x4forge/x4-forge-studio`) + GitHub Release `v0.0.96` per `vscode-extension/PUBLISHING.md`.
- **Suggested commit title:** `feat(validation): add cross-cue MD time provenance and broader timing lints (#72)`

## AAR
- **Triggers:** Non-unique `Target: "  return findings;\n}"` in `edit_file` matched 4 functions in `src/lib/mdPitfallLints.ts` (`task-14887`), immediately caught by `unit54-544-corpus-sweep.ts` and cleaned up (`task-14892`); initial `probe-timing-attrs.ts` scratch script in `G:\Forge-QA\temp` needed explicit `@xmldom/xmldom` path and UTF-8 BOM strip (`task-14834`, `task-14842`).
- **Sustain:** Grounding every candidate timing attribute against `md.xsd`, `common.xsd`, `aiscripts.xsd`, and all `544` shipped X4 9.00 scripts before implementation caught `show_help/@timeout` (`booleanexpression`), `aiscripts/masstraffic.fight.xml:18` (`<wait min="1" max="5"/>`), and `md/tutorial_spacesuit.xml:407` (`<delay exact="0.5"/>`) upfront with zero post-lock design churn.
- **Improve work/approach:** Always include `>= 4` lines of function-specific context in `edit_file` `Target` strings when editing multi-function files like `src/lib/mdPitfallLints.ts`.
- **Improve tools:** Zero-allocation `$` precheck in `lintMdTimeValues` skips `staticCueNames` and `collectCrossCueNumericInvariants` whenever timing attributes contain only literals (`544` files swept in `11.8s` cold).
- **Highest-risk evidenced weakness:** `No evidenced risk delta`.
- **Lessons banked:** Always check `common.xsd` attribute types before treating identically named attributes (`@timeout` on `show_help` vs `show_notification` / `play_cutscene`) as uniform.
