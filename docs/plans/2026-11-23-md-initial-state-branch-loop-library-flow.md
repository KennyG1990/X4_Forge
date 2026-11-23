# `#129` / `#114` Sound Intra-Block Initial-State Flow Across Branches, Loops, Instantiated Cues, and Libraries

**Status:** `VERIFIED` (isolated Dev source & full project/route/oracle/precommit gates; `#129` remains `in_progress` pending `0.0.94` installed IDE & Claude readback)
**Owner:** GitHub `#129`, `#114` (parent `#74`)
**Lane:** `FULL`
**Date:** 2026-11-23

## 1. Plan And Acceptance Contract

- **Bounded unit of work:** Upgrade `lintLocalVariableReads` in `src/lib/mdPitfallLints.ts` so guaranteed `{ kind: 'present' }` local initializations propagate cleanly through non-existence / `do_elseif` `<do_if>` chains, structured loop blocks (`<do_for_each>`, `<do_all>`, `<do_while>`), `<library>` blocks (including `<params><param name="..."/></params>`), and non-plain cues (such as `instantiate="true"`), eliminating false `md.variable_initial_state` coverage gaps on locally initialized sequential reads while strictly preserving `potential = false` uncertainty on uninitialized variables, existing removal/absence rules, and negative/opaque boundaries.
- **Assumptions & unresolved facts:**
  - Read-only `x4_ai_influence` (`264` files with `canonicalMd` ready) currently emits **768** `md.variable_initial_state` gaps (`765` located reads across 25 MD files + `3` unpositioned records). Over `420` of the `765` located gaps read a variable already written by `<set_value>` earlier in the same `<actions>` block; `190+` read `<do_for_each>`/`<do_all>` loop variables inside the loop body; `73` read `<library>` `<param>` inputs inside library `<actions>`.
  - Actions whose X4 effects remain unmodeled or non-guaranteed (`<find_*>`, `<run_actions result="...">`, `<opaque_effect/>`, `<include_actions/>`) keep `potential: false` and remain `unavailable` unless written earlier in deterministic local flow.
- **Authoritative references:**
  - [Issue #129](https://github.com/KennyG1990/X4_Forge/issues/129) & [Issue #114](https://github.com/KennyG1990/X4_Forge/issues/114), `docs/plans/2026-11-18-md-initial-writer-authority.md`.
  - X4 9.00 XSD contracts (`G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00\libraries\common.xsd` `foreach` / `counting`; `libraries\md.xsd` `library/params/param`, `run_actions`).
  - `src/lib/mdPitfallLints.ts` (`lintLocalVariableReads`, `runMdPitfallSelftest`), `src/server/projectValidation.ts:942-972`, `scripts/diagnostic-source-navigation-selftest.ts`.
- **In scope (`src/lib/mdPitfallLints.ts`):**
  1. Preserve `initial.potential` semantics while decoupling `initial.facts` tracking (`present` vs `unavailable`) inside unmodeled `<do_if>` chains (`!test || !simpleElse || extra attrs`) with `depth < MAX_VARIABLE_BRANCH_DEPTH`: evaluate each arm with `{ facts: presentOnly(initial.facts), potential: false }`, intersect `{ kind: 'present' }` across all arms (`[...arms]` when unconditional `<do_else>` is present without `chance` attributes; otherwise `[prePresent, ...arms]`), clear `absent`, and set `initial.potential = false`.
  2. Model structured loop blocks (`<do_for_each>`, `<do_all>`, `<do_while>`) when `!action.namespaceURI && depth < MAX_VARIABLE_BRANCH_DEPTH`: pre-scan for `<remove_value>` / `<include_actions>` / foreign elements inside the loop body (excluding any variable removed in the loop from pre-loop `present`, or clearing all pre-loop `present` on `<include_actions>`/dynamic removal/foreign action); enter the loop body with `{ facts: preLoopSafePresent + loopBindings, potential: false }` (`<do_for_each>` `@name` & `@counter`; `<do_all>` `@counter`, matching `LOCAL_VARIABLE`); exit loop keeping only `preLoopSafePresent` facts not invalidated by the body (`present` vars initialized inside a loop never leak after a loop that may run 0 times), clearing `absent`, and setting `initial.potential = false`.
  3. Walk `!isPlainVariableCue` cues (e.g. `instantiate="true"`) and `<library>` `<actions>` (when `availability` is provided) through `scanActions` with `potential = false` and `allowAbsenceWarnings = false`, seeding `<library>` `<params><param name="..."/></params>` (`^[A-Za-z_]\w*$` -> `$name` `{ kind: 'present' }`), recognizing `LOCAL_VARIABLE` initializations (`set_value`, `append_to_list/append_list_elements` with `create="true"`/`"1"`) after `@exact` evaluation inside `initialAction` (`line 679` unknown-variable clearing moved after strict `@exact` operand checks so `<set_value name="$x" exact="$x + 1"/>` preserves prior `present` `$x` while still catching uninitialized RHS self-reads), and removing deleted keys from `flow.facts` on `<remove_value>` without emitting absence/removal warnings when `allowAbsenceWarnings === false`.
  4. Add comprehensive positive & negative selftests in `runMdPitfallSelftest()` (`src/lib/mdPitfallLints.ts`) and verify `scripts/diagnostic-source-navigation-selftest.ts` (`read_probe` / `initial-state` line:col & BOM parity).
- **Out of scope:**
  - Guessing `<run_actions result="...">`, `<find_*>` single/multiple runtime results, or cross-cue/save-state assumptions.
  - Changing `validateProjectCrossFile`, severity levels, or `buildMdVariableAvailabilityContext` serialized shape (`MdVariableAvailabilityContext` stays unchanged for cache parity).
- **Risks & authorization boundaries:**
  - Risk: false clearance inside loops if iteration `N` removes `$A` read on iteration `N+1`; or `<set_value name="$X" exact="$X"/>` falsely cleared; or `<library>`/`instantiate="true"` emitting unintended removal warnings. Mitigated by loop removal pre-scan, post-RHS `unknownVariables` application, `allowAbsenceWarnings` gating, and negative selftests for every invariant.
  - Rollback: `git checkout -- src/lib/mdPitfallLints.ts`.
- **Acceptance criteria & required validations:**
  1. All existing selftests pass (`runMdPitfallSelftest`, `claude-validation-matrix.selftest.ts`, `validation-noise.selftest.ts`, `diagnostic-source-navigation-selftest.ts`, `event-coverage-selftest.ts`).
  2. Negative tests fail closed / preserve expected warnings & gaps: uninitialized reads inside `<do_if value="true">`, `<do_for_each>`, `<library>`, and `instantiate="true"` still emit positioned `md.variable_initial_state` gaps; loop-body writes without pre-loop init stay unverified after loop; `<remove_value>` inside `<do_for_each>` or one `<do_if>`/`<do_else>` arm drops `present` inside subsequent iterations / after branch; `<set_value name="$X" exact="$X"/>` without prior write still emits warning/gap; `instantiate="true"` with `not $Value?` still emits `0` removal/absence warnings (`line 1488`).
  3. Replaying read-only `x4_ai_influence` (`264` files + `canonicalMd`) measurably reduces `md.variable_initial_state` gaps while maintaining `errorCount: 0` and verifying zero ungrounded clearances on a sample audit of remaining & cleared reads.
  4. `npm run typecheck`, `npx eslint src/lib/mdPitfallLints.ts`, `npm run test:routes`, `npm run test:oracles`, and `npm run precommit:check` pass.
- **Evidence locations:** `docs/plans/2026-11-23-md-initial-state-branch-loop-library-flow.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.

## 2. Baseline

- **Revision:** `becb2b7` (`main`), clean working tree.
- **Live read-only `x4_ai_influence` (`264` files, `canonicalMd` ready):** `ok: true`, `xsdErrors: 0`, `md.variable_initial_state: 768` (`765` located + `3` unpositioned).
- **`claude-validation-matrix.selftest.ts`:** `34/34` PASS.

## 3. Reconcile

- **Resources & callers searched:** `src/lib/mdPitfallLints.ts` (`lintLocalVariableReads`, `buildMdVariableAvailabilityContext`, `isPlainVariableCue`, `runMdPitfallSelftest`), `src/server/projectValidation.ts:942-972`, `scripts/diagnostic-source-navigation-selftest.ts`, `libraries/common.xsd`, `libraries/md.xsd`.
- **Key findings:**
  - `mdPitfallLints.ts:742-746` calls `inspectUnmodeled` + `clearInitial(initial)` on ANY `<do_if>` with `<do_elseif>` or non-`LOCAL_EXISTENCE_TEST` condition, destroying prior intra-block `present` facts and skipping branch-local tracking.
  - `mdPitfallLints.ts:674` calls `inspectUnmodeled` + `clearInitial(flow)` on `<do_for_each>`/`<do_all>`/`<do_while>`.
  - `mdPitfallLints.ts:816-830` calls `inspectUnmodeled` on all `!isPlainVariableCue` cues and `<library>` blocks (`allowAbsenceWarnings` stays required for `plain` cues only, matching `line 1488`).
  - `mdPitfallLints.ts:679` applies `fact.unknownVariables` (`unavailable`) BEFORE `strictLocalReads(attribute.value)` at line `682`, which would clobber an already-present variable during self-reassignment (`<set_value name="$out" exact="$out + ..."/>`).
- **Capability-map delta:** `no capability-map delta`.

## 4. Implementation

- **`src/lib/mdPitfallLints.ts`:**
  - Added shared `OPAQUE_OR_INLINE_ACTIONS` (`opaque_effect`, `include_actions`, `signal_cue`, `signal_cue_instantly`, `reset_cue`, `cancel_cue`) and `MdAvailabilityAction.knownDeclaration` (`!!spec && !OPAQUE_OR_INLINE_ACTIONS.has(...)`) so non-inline schema actions without unsafe nested removals/inline calls clear only their target `unknownVariables` / written `destinations` and drop `potential` to `false`, rather than wiping unrelated pre-existing `present` variables (`<run_actions>`, `<remove_object_commander>`, `<create_order>`).
  - Updated `initialAction` to accept `!activeCue` (`<library>` and non-plain cues) for `LOCAL_VARIABLE` initializations (`set_value`, `append_to_list/append_list_elements[@create="true"|"1"]`), evaluating RHS strict reads BEFORE applying `unknownVariables` so `<set_value name="$out" exact="$out + 1"/>` preserves prior `present` `$out` while uninitialized self-reads still emit gaps.
  - Updated `<do_if>`/`<do_elseif>`/`<do_else>` unmodeled branch handling (`depth < MAX_VARIABLE_BRANCH_DEPTH`) to evaluate each arm with `{ facts: copyPresentFacts(initial.facts), potential: false }` and intersect `present` facts across all arms (`armOutputs` when unconditional `<do_else>` without `chance` exists; otherwise `[prePresent, ...armOutputs]`) instead of discarding prior `present` state.
  - Added `<do_for_each>` (`name`, `valuename`, `counter`), `<do_all>` (`counter`), and `<do_while>` loop flow with `collectLoopInvalidations` (stripping variables `<remove_value>`d inside the loop before entering the loop, seeding loop vars strictly inside the loop body, and intersecting `[preSafe, loopInitial.facts]` on exit so loop-local assignments never leak after 0-iteration loops).
  - Walked `!isPlainVariableCue` cues (with `allowAbsence = false`) and `<library>` `<actions>` (seeding `<params><param name="..."/></params>` into `libraryFacts`, `allowAbsence = false`) through `scanActions` instead of dumping `inspectUnmodeled`.
  - Added 3 selftest suites in `runMdPitfallSelftest()` covering unmodeled `do_if`/`elseif`/`else` joins, loop `name`/`valuename`/`counter` + loop-removal invalidation + post-loop leak prevention, and `<library>`/`instantiate="true"` sequential tracking + `<include_actions>`/`result` clears without false warnings.

## 5. Validation

All checks below ran AFTER the final edit (`OPAQUE_OR_INLINE_ACTIONS` extraction):
- `npx eslint src/lib/mdPitfallLints.ts` -> exit `0` (`0` errors).
- `npm run typecheck` -> exit `0` (`0` errors).
- `npx tsx scripts/diagnostic-source-navigation-selftest.ts` -> exit `0` (`Diagnostic source snapshot: passed, existing AI lint 33/33 passed`).
- `npx tsx scripts/event-coverage-selftest.ts` -> exit `0` (`41/41` PASS).
- `npm run test:project-validation-overlay` -> exit `0` (`24/24` PASS).
- `npm run test:oracles` -> exit `0`.
- `npm run test:routes` (without `X4_XSD_PATH` override) -> exit `0`.
- `npm run precommit:check` -> exit `0` (`[precommit] OK`).
- `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00' X4_XSD_PATH='...' npx tsx scripts/claude-validation-matrix.selftest.ts` -> exit `0` (`34/34` PASS).
- `X4_REFERENCE_ROOT='...' X4_XSD_PATH='...' npx tsx scripts/validation-noise.selftest.ts` -> exit `0` (`25/25` + `38` PASS).
- **Live read-only `x4_ai_influence` replay (`264` files, `canonicalMd` ready):** `ok: true`, `xsdErrors: 0`, `crossFileErrors: 0`, `pitfallCount: 0`, `md.variable_initial_state: 159` (**down from `768`, `-79.3%`**, `158` positioned + `1` `unusable_script` in `md/conversations.xml`; zero ungrounded clearances in spot check of `$noRec`, `$mhOrd`).

## 6. Review Against Source Of Truth

- Sequential `set_value` / loop bindings (`name`, `valuename`, `counter`) / library `<params>` / non-existence `<do_if>` joins propagate guaranteed `present` state without lowering uncertainty (`potential = false`) on uninitialized variables or emitting leaked removal/absence warnings in `instantiate="true"` / `<library>` -> **Done & evidenced**.
- Fresh-eyes review extracted `OPAQUE_OR_INLINE_ACTIONS` to eliminate a 3-way inline action-name array duplication and confirmed zero false warnings across `x4_ai_influence`.

## 7. Close

- **Status:** `VERIFIED` (isolated Dev source & full gates; `#129` remains `in_progress` pending `0.0.94` installed IDE verification & Claude readback).
- **Unchanged boundaries:** `validateProjectCrossFile`, severity/finding contracts, `MdVariableAvailabilityContext` serialized compatibility, `config/durable-writers.json`, live Forge/AiLive/X4/saves.
- **Suggested commit title:** `fix(validation): preserve intra-block MD initial-state flow across branches, loops, and libraries (#129, #114)`

## 8. AAR

- **Triggers:** Triggered — (1) initial synthetic fixture hit TS2769 on incomplete `ElementSpec` cast before reusing `initialSchema`'s `output_name`; (2) synthetic `instantiate="true"` fixture triggered `md_pitfall.illegal_instantiate` until `<conditions><event_game_started/></conditions>` was supplied; (3) earlier `test:routes` run inherited `X4_XSD_PATH` in the shell environment and failed 3 schema-unavailable negative tests until unset; (4) `allowAbsence` removal check confirmed `<run_actions>` / `<do_for_each valuename>` accounted for ~261 more false gaps on second-pass profiling.
- **Sustain:** Two-step profiling of live `x4_ai_influence` (`768 -> 420 -> 159`) coupled with X4 9.00 XSD `foreach`/`valuename` verification pinpointed exact deterministic wins without guessing `<find_*>` or `<run_actions>` return values.
- **Improve work/approach:** Always clear `X4_XSD_PATH` / `X4_REFERENCE_ROOT` before launching `npm run test:routes` in the same PowerShell session.
- **Improve tools:** Observed mild residual opportunity (`$C.$police` table property write matching `/^\$[A-Za-z_]\w*\.(\$[A-Za-z_]\w*)$/` in `aic_inspect.xml:603`, ~6 rows); intentionally left out of scope to preserve `remoteWriter('$Destination.$X')` contract cleanly.
- **Highest-risk evidenced weakness:** Inheriting ad-hoc shell env vars (`X4_XSD_PATH`) into subprocess integration suites (`test:routes`) can mask schema-unavailable assertions (`621/624 FAIL` when leaked). Mitigation: explicitly unset `X4_XSD_PATH` / `X4_REFERENCE_ROOT` when invoking `test:routes`.
- **Lessons banked:** Recorded in `SESSION-HANDOFF.md` and `docs/plans/2026-11-23-md-initial-state-branch-loop-library-flow.md`.
