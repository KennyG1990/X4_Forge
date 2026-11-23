# `#129` / `#114` Sub-Member Mutations, Conjunctive Existence Guards, and Schema-Grounded `find_*` Initialization

**Status:** `VERIFIED` (isolated Dev source & full project/corpus/oracle/route/precommit gates; `#129` remains `in_progress` pending `0.0.94` installed IDE, Claude readback, and optional X4 engine oracle batch on `<create_order>` / un-pre-initialized `<run_actions result="...">` / unguarded single `<find_*>`)
**Owner:** GitHub `#129`, `#114` (parent `#74`), live Agent Board request [4214618ed15b81d7b6f0c835d30e0429](https://app.notion.com/p/4214618ed15b81d7b6f0c835d30e0429)
**Lane:** `FULL`
**Date:** 2026-11-23
**Baseline:** `0b5ed14` (`main`, clean working tree); live read-only `x4_ai_influence` (`264` files, `canonicalMd` ready) emitted `159` `md.variable_initial_state` gaps (`158` located reads + `1` unpositioned `unusable_script` in `md/conversations.xml`).

## 1. Plan And Acceptance Contract

- **Bounded unit of work:** Fix the verified XSD- and engine-grounded false `md.variable_initial_state` gaps in `src/lib/mdPitfallLints.ts` (`destination`, `collectLoopInvalidations`, `initialAction`, `scanActions`) exposed by profiling the remaining `159` gaps on `x4_ai_influence` and inspecting Claude's live Agent Board ticket (`find_ship name=`):
  1. Treat brace-indexed / nested member mutations on cue/global/variable tables and lists (e.g., `Cards.$plans.{'$p' + id}`, `md.S.C.$tbl.{$k}`, `global.$H.$out.{...}`, `State.$OrdWatch.{$hit}.{2}`) as sub-member mutations (`{ initializes: false }`) in `destination()` and `remove_value` handling, and stop `collectLoopInvalidations()` from setting `clearAll = true` on sub-member `<remove_value>` targets (`md.AIC_Upkeep.Store.$Seen.{$uiOld}`, `$tbl.{$k}`).
  2. When an opaque or child-bearing action has `initialAction()` entry state `flow`, check the action's own `@exact`/`@text` (`readAttribute`) against entry `{ kind: 'present' }` (unless `selfOrderingUnknown` applies) before applying post-action invalidation, while still scanning any child elements.
  3. On non-`remove_value` known-declaration actions (`run_actions`, `remove_cargo`, `add_cargo`, `$C.$police` table-member writes, etc.), do not erase ALREADY-`present` variables via `unknownVariables` or `destinations` overwrites; on `<remove_value>` with a known declaration, delete only resolved target variables matching local or current-cue scope without wiping unrelated locals (`$gsNotice`, `$rsOld`, `$spSt`), clearing all only when target is dynamic (`{$dyn}`) or absent.
  4. Support conjunctive top-level `and`-guards (`<do_if value="$X? and ...">`, `<do_elseif value="$X? and ...">`, only with `hasOnlyAttributes(..., ['value', 'comment'])` and no `chance`, top-level `or`, or `if/then/else`) by seeding exact guarded `$X` variables as `{ kind: 'present' }` strictly inside that branch arm (never inferring absence in `<do_else>` and intersecting cleanly on join).
  5. With a loaded schema (`fact.knownDeclaration` for `/^find_/`, no `chance`, `!childUnsafe`), credit XSD-documented guaranteed local outputs: `@groupname` (`common.xsd:94`) and `multiple="true"` with `append` not `'true'`/`'1'` (`common.xsd:745`) for `@name`/`@result` (`LOCAL_VARIABLE`).
- **Authoritative references:**
  - [Issue #129](https://github.com/KennyG1990/X4_Forge/issues/129), [Issue #114](https://github.com/KennyG1990/X4_Forge/issues/114), [Agent Board ticket 4214618ed15b81d7b6f0c835d30e0429](https://app.notion.com/p/4214618ed15b81d7b6f0c835d30e0429).
  - X4 9.00 XSD (`G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00\libraries\common.xsd` lines 92-97 `groupname`, 728-752 `findappend`/`findmultiple`) and vanilla `9.00/md/*.xml` (`277/277` `multiple="true"`, `37/37` `groupname=` direct reads without `?`).
  - `src/lib/mdPitfallLints.ts`.
- **Out of scope:** Guessing unverified `<create_order name="$ord"/>`, `<create_trade_offer name="$o"/>`, un-pre-initialized `<run_actions result="$r"/>`, or unguarded single-match `<find_*>` (`multiple="false"` / omitted) runtime behavior; changing `MdVariableAvailabilityContext` cache shapes; touching live Forge, `AiLive`, or X4 files.
- **Rollback:** `git checkout -- src/lib/mdPitfallLints.ts`.

## 2. Reconcile & Implementation

- **Resources searched:** `src/lib/mdPitfallLints.ts`, `src/lib/xsdValidate.ts`, `src/server/projectValidation.ts`, `libraries/common.xsd`, `libraries/md.xsd`, vanilla `9.00/md/*.xml`, read-only `x4_ai_influence`.
- **Capability-map delta:** `no capability-map delta`.
- **Changes in `src/lib/mdPitfallLints.ts` (`+273/-9` lines):**
  - Added module-level `splitTopLevelMdSegments`, `isSubMemberDestination`, `extractGuaranteedExistenceVars`, and `findGuaranteedLocalOutputs`.
  - Updated `destination()` and `collectLoopInvalidations()` to recognize brace-indexed / nested sub-member writes and removals (`Cards.$plans.{'$p' + id}`, `Store.$Seen.{$uiOld}`, etc.) without false `opaque` / `clearAll` barriers.
  - Updated `initialAction()` to respect `{ kind: 'present' }` entry facts on opaque action own `readAttribute`, preserve already-`present` variables across non-`remove_value` `unknownVariables`/`destinations`, isolate resolved `<remove_value>` deletions to their target variable/scope, and credit `find_*` `@groupname` + `multiple="true"` `!append` `@name`/`@result` outputs under `knownDeclaration`.
  - Updated unmodeled `<do_if>`/`<do_elseif>` arm evaluation in `scanActions()` to seed `extractGuaranteedExistenceVars` only when attributes are restricted to `['value', 'comment']` without `chance`.
  - Extended `initialSchema` and added 3 selftest groups (`subMemberDoc` + `cueBraceDoc`, `conjunctiveDoc`, `findDoc` w/ & w/o schema) in `runMdPitfallSelftest()`.

## 3. Validation (All Executed Strictly After Final Edit)

- `npx eslint src/lib/mdPitfallLints.ts` -> exit `0`.
- `npm run typecheck` -> exit `0`.
- `runMdPitfallSelftest()` -> `113/113` PASS (`allPassed: true`, `failed: []`).
- `npx tsx scripts/diagnostic-source-navigation-selftest.ts` -> exit `0` (`Diagnostic source snapshot: passed, existing AI lint 33/33 passed`).
- `npx tsx scripts/event-coverage-selftest.ts` -> exit `0` (`48/48` PASS).
- `npx tsx scripts/validation-trust.selftest.ts` -> exit `0` (`50` checks PASS).
- `npx tsx scripts/finding-review.selftest.ts` -> exit `0` (`25` checks PASS).
- `npx tsx scripts/incremental-lua-selftest.ts` -> exit `0` (`24/24` PASS).
- `npm run test:project-validation-overlay` -> exit `0` (`24/24` PASS).
- `npm run test:x4-ui-integration` -> exit `0` (`21/21` PASS).
- `npx tsx scripts/ui-manifest-integrity.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> exit `0` (`16/16` PASS).
- `npx tsx scripts/claude-validation-matrix.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> exit `0` (`34/34` PASS).
- `npx tsx scripts/validation-noise.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> exit `0` (`reference 25/25`, `properties 112/112`, `crossFile 117/117`, `38` corpus assertions PASS).
- `npm run test:oracles` (`X4_*` env unset) -> exit `0` (`134/134` oracles PASS).
- `npm run test:routes` (`X4_*` env unset) -> exit `0` (`624/624 PASS`).
- `npm run precommit:check` (`X4_*` env unset) -> exit `0` (`action-receipt-coverage` PASS `98/69`, `[precommit] OK`).
- **Live read-only `x4_ai_influence` replay (`264` files, `canonicalMd` ready):** `xsdErrors: 0`, `crossFileErrors: 4`, `flatCount: 487`, `md.variable_initial_state: 80` (`79` located + `1` unpositioned `md/conversations.xml` `unusable_script`), down from **`159` (`-49.7%`, cumulative `768 -> 80`, `-89.6%`)**, `md/ai_influence_chat.xml` **`26 -> 10`** (down from `129` in Claude's report), `md/aic_inspect.xml` **`7 -> 3`**. Remaining `79` positioned gaps are strictly conservative: `<run_actions result="..."/>` (`~36`), `<create_order name="$ord"/>` (`~15`), `<signal_cue*>`/`<reset_cue>` barriers (`~6`), and genuine save-state / cross-cue / conditional-branch reads (`~22`).

## 4. Review Against Source Of Truth

- Brace-indexed member mutations/removals, entry reads on opaque actions, pre-initialized result outputs (`$removed`, `$dvA`, `$race`, `$police` param preservation across `$C.$police`), conjunctive `and` existence guards (fixing all 3 single-match `find_*` reads cleanly), and XSD-proven `find_*` `multiple="true"` / `groupname` local initializations all implemented with negative controls -> **Done & evidenced**.
- Fresh-eyes diff review confirmed clean helper boundaries, shallow nesting, zero new files/route side-effects, and strict conservatism on unverified engine actions.

## 5. Close & AAR

- **Status:** `VERIFIED` (isolated Dev source & full corpus/project/route/oracle/precommit gates; `#129` remains `in_progress` pending `0.0.94` installed IDE verification, Claude readback, and optional X4 runtime batch for `<create_order>`/`<run_actions>`/`<find_*>` single-match).
- **Suggested commit title:** `fix(validation): handle sub-member writes, conjunctive guards, and find_* outputs in MD initial-state flow (#129, #114)`
- **AAR (Triggered):**
  - **Triggers:** (1) Initial `subMemberDoc` asserted `dynamic_destination count === 1` inside a `<library>` where local variables also carry `target: undefined` (`count === 5`), resolved by inspecting both action-level flags inside `<library>` and a standalone plain `<cue>` `count === 1` fixture; (2) First pass cleared all `flow.facts` on non-sub-member `<remove_value name="$gsState.$pending"/>` / `Cards.$probeOffer`, exposing 4 new false positives (`$gsNotice`, `$rsOld`, `$rsSuit`, `$spSt`) until scoped to resolved local/current-cue target variables; (3) Profiling revealed `$Tbl.$ship` (`variableMember`) clobbered ALREADY-`present` `<param name="ship"/>` / `$police` via `unknownVariables`, resolved by guarding `flow.facts.get(variable)?.kind !== 'present'`.
  - **Sustain:** Always replaying real `x4_ai_influence` AND inspecting the diff of remaining gaps (not just the net drop!) immediately caught both subtle `remove_value` and `variableMember` side-effects.
  - **Improve work/approach:** When asserting `dynamic_destination` cause counts in `<library>` vs `<cue>` selftests, remember `<library>` locals intentionally lack a cue namespace (`target: undefined`).
  - **Improve tools:** `No evidenced risk delta` (`MD` pitfall selftests now directly lock all 3 newly discovered edge behaviors).
