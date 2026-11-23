# `#101` / `#71` Finite Namespace Health Hooks & Verified `AddUITriggeredEvent` Forwarding Wrappers

**Status:** `VERIFIED` (Unit A scoped complete; `#101`/`#71` remain `in_progress` for Unit B remaining 27 keys & `0.0.94` release)
**Owner:** GitHub `#101`, `#71` (parent `#74`)
**Lane:** `FULL`
**Date:** 2026-11-23

## 1. Plan And Acceptance Contract

- **Bounded unit of work:** Extend `src/lib/projectCrossFileValidation.ts` so returned-table `player_orders` builder verification (`26004b7`) soundly verifies (a) finite literal registry dynamic namespace-member hooks like `aic_health.lua:386-509` (`A.HEALTH_TICKS` `ipairs` wrapper loop + read-only UI table consumers) without poisoning unrelated members of `AI_Influence`, and (b) global `AddUITriggeredEvent` forwarding wrappers like `aic_utf8.lua:17-72` and `aic_plaintext.lua:77-99` when every AST invariant proves `screen`, `control`, table identity, and non-nil keys are preserved. Preserve uncertainty (`bindingUnverified` / `forwardingUnverified`) on all non-proven dynamic member writes and unsafe/opaque emitter wrappers.
- **Assumptions & unresolved facts:**
  - Read-only `x4_ai_influence` (269 files) currently reports 1 `md_lua.payload_writer_unverified` finding covering **50** indexed `player_orders` keys (`a`..`y`), of which **23** already link `AI_Influence.BuildOrderPayload` -> `aic_uix.lua:7800/8081` but stay blocked on `bindingUnverified` (`aic_health.lua:498`) and `forwardingUnverified` (`aic_utf8.lua:62`, `aic_plaintext.lua:97`).
  - The remaining **27** keys (`25` conversation-dispatch keys in `aic_uix.lua:11895-12577` + conditional `g` clear + `ri` in `aic_confirm.lua:400`) belong to the next bounded unit and MUST remain explicitly unverified by this unit.
- **Authoritative references:**
  - [Issue #71 comment (`26004b7`)](https://github.com/KennyG1990/X4_Forge/issues/71#issuecomment-7091543283) & `docs/plans/2026-11-09-indexed-payload-writer-evidence.md#returned-indexed-tables-sent-by-a-protected-callback`.
  - `src/lib/projectCrossFileValidation.ts` (`parseLuaUiEmits`, `validateProjectCrossFile`), `scripts/event-coverage-selftest.ts:213-276`.
  - Read-only AiLive witnesses (`G:\F-rescue-2026-09-26\DEV_ENV\projects\Mods\X4Mods\x4_ai_influence`): `ui/addons/ai_influence_chat/aic_health.lua:386-509`, `aic_utf8.lua:11-72`, `aic_plaintext.lua:76-99`, `aic_settings_board.lua:135-167`, `aic_truth_ui.lua:232-273,427,445`.
- **In scope:**
  1. **Finite literal registry member writes (`src/lib/projectCrossFileValidation.ts`):**
     - Collect single-file static literal registry definitions (`Root.Member = { { ..., lua = "FnName" }, ... }`), resolved through direct global or immutable namespace alias (`local A = rawget(_G, "Root") or {}` / `local A = Root`).
     - When an indexed member write `Base[idx] = rhs` inside `for _, elem in ipairs(RegBase.RegMember) do ... end` uses immutable `local idx = elem.lua`, track a `LuaFiniteMemberWrite` instead of poisoning `replacedRoots` unconditionally — provided ALL elements of the registry literal have valid static `StringLiteral` (or omitted) `lua` keys.
     - During cross-file aggregation in `validateProjectCrossFile`, accept the finite resolution ONLY if `RegRoot.RegMember` is written once across the project, `RegRoot` is otherwise unreplaced, `ipairs` / `rawget` / global environment are intact, and every cross-file read/argument pass of `RegRoot.RegMember` (`HealthLines`, `SetBoardRunning`, `TruthLandingRows`, `ipairs(...)`) passes an AST-checked read-only verification (no assignment, index write, `table.insert`/`table.remove`/`rawset`/`setmetatable`, or escape into unverified callees, checked recursively via `HealthEvery` with depth limit and cycle guard).
     - Record each resolved finite key (`IntelDigest`, `SupplyTick`, `RewardTick`, `CareerTick`, `ClearanceTick`) in `mutations.members` — so overlapping `lua = "BuildOrderPayload"` automatically fails `members.get(link.member) === 1`! Fail closed into `replacedRoots` if ANY check fails.
  2. **Global `AddUITriggeredEvent` pass-through wrapper verification (`src/lib/projectCrossFileValidation.ts`):**
     - Collect every global `AddUITriggeredEvent` rebinding/declaration across all project Lua files alongside unique factory (`Root.Factory`) and in-place string-cleaner (`Root.Cleaner` + leaf string-return cleaner `Root.LeafCleaner`) AST definitions (resolving both `Root.Fn` and alias `local A = Root; function A.Fn(...)`).
     - Verify `stableForwarding` (`forwardingUnverified = false`) when `!replacedRoots.has('pcall')`, `!environmentRebound`, `!dynamicGlobalWrite`, `!changesFunctionEnvironment`, `!opaqueGlobals`, `!replacedRoots.has('rawget')`, ZERO `function AddUITriggeredEvent(...) end` / `rawset(_G, 'AddUITriggeredEvent', ...)`, at least one assignment `AddUITriggeredEvent = ...`, and **every** assignment matches either:
       - inline `local orig = AddUITriggeredEvent` immediately preceding `AddUITriggeredEvent = function(screen, control, param, ...) ... end`, or
       - `AddUITriggeredEvent = FactoryRoot.FactoryFn(AddUITriggeredEvent)` returning `function(screen, control, param, ...) ... end`.
     - Inside every wrapper body, prove: (i) distinct `(screen, control, param)` params (optional `...`); (ii) zero nested `ReturnStatement`s and unconditional final `return prev(screen, control, param[, ...])`; (iii) zero mutation/shadowing/reassignment of `screen`, `control`, `prev`; (iv) every `param` touch is EITHER guarded by a `control == "<literal>"` check that cannot hold for the target link's `event` tuple (failing closed for `control`-matched writes unless proven non-nil safe!) OR uses verified non-nil string cleaning (`pcall(CleanerRoot.Cleaner, param)` returning same table identity with `string` leaf cleaner guaranteeing non-nil replacement only for existing `string`/`table` entries, zero `= nil` clears, zero table swaps).
     - Fail closed (`forwardingUnverified = true`) on opaque factories (`decorate`), empty handlers (`function AddUITriggeredEvent() end`), early returns, `control`/`screen` mutation, `param = {}` replacement, `param[k] = nil` clears, or helper redefinition.
  3. **Tests (`scripts/event-coverage-selftest.ts`):**
     - Retain all 39 existing checks (incl. all 7 `returned-table-proof-refuses-unresolved-ownership-and-clears` hostiles).
     - Add positive & negative tests for finite-registry wrapping (valid read-only consumers pass; overlapping `lua = "Build"`, dynamic entry `{ lua = make() }`, `table.insert`, and mutating helper `expect[1].lua = "Build"` fail) and `AddUITriggeredEvent` forwarding wrappers (both `Utf8CleanParam`-style recursive cleaner and `PlainTextWrap`-style control-scoped factory pass when combined; early return, `control` rewrite, `param = {}` swap, `param[k] = nil` clear, nil-returning cleaner, duplicate cleaner def, and opaque second wrapper fail).
- **Out of scope:**
  - Any modification to live `x4_ai_influence` or any file outside `G:\Forge-QA\forge-development`.
  - Conversation dispatch `CONV_ONLY(25)` / `ConfirmGate` / `g` / `ri` tracing (deferred cleanly to the subsequent `#101` Unit B).
- **Risks & rollback:**
  - Risk: false positive verifying an unsafe emitter wrapper or mutating registry helper. Mitigated by strict fail-closed AST whitelisting + depth-bounded read-only verification + adversarial negative tests covering every bypass vector.
  - Rollback: `git checkout -- src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts`.
- **Acceptance criteria & required validations:**
  1. Fail-first check: existing baseline flags all 50 keys in live read-only `x4_ai_influence` with `"binding and event forwarding"`.
  2. Post-implementation: `npx tsx scripts/event-coverage-selftest.ts` (all 39 existing + new positive/negative checks PASS), `npx tsx scripts/claude-validation-matrix.selftest.ts`, `npx tsx scripts/validation-noise.selftest.ts`, `npx tsx scripts/lua-grammar.selftest.ts`, `npm run test:routes`, `npm run test:oracles`, `npm run lint`, `npm run precommit:check`.
  3. Read-only AiLive replay (`validateProjectCrossFile` on `x4_ai_influence` 269 files): unverified `player_orders` keys drop from **50 -> 27**, zero new errors/missing-listeners, zero `"builder binding and event forwarding"` caveat remaining.
- **Evidence locations:** `docs/plans/2026-11-23-lua-health-hook-and-emitter-wrappers.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.

## 2. Baseline

- **Revision:** `d220464` (`main`), clean working tree.
- **`scripts/event-coverage-selftest.ts`:** `39/39` PASS (`{"pass":true,"total":39,...}`).
- **Read-only live `x4_ai_influence` replay (`269` files, `task-2396`):** `md_lua.payload_writer_unverified` reports **50** keys (`a`..`y`), `23` linked to returned builder table (`bindingUnverified: true`, `forwardingUnverified: true`).

## 3. Reconcile

- **Resources & callers searched:** `validateProjectCrossFile`, `runProjectCrossFileSelftest`, `aic_health.lua` (`A.HEALTH_TICKS`, `wrapTicks`, `HealthLines`, `HealthEvery`), `aic_utf8.lua` (`Utf8Clean`, `Utf8CleanParam`), `aic_plaintext.lua` (`PlainText`, `PlainTextWrap`), `aic_settings_board.lua` (`SetBoardRunning`), `aic_truth_ui.lua` (`TruthLandingRows`), `scripts/event-coverage-selftest.ts:213-276`.
- **Key reconciliation findings:**
  - `function A.Utf8CleanParam(...)` uses local alias `A = AI_Influence` (unlike `function OrderTools.Build(...)` which uses global root), so cross-file function indexing must resolve local namespace aliases via `unambiguousAlias` + `readLuaNamespace`!
  - `A.HEALTH_TICKS` is passed into `A.HealthLines`, `A.SetBoardRunning`, and `A.TruthLandingRows` (and iterated in `aic_truth_ui.lua:445`). Verifying read-only parameter usage on single-definition project functions keeps this general and zero-hardcoded-names.
- **Capability-map delta:** `no capability-map delta`.

## 4. Implementation

- **`src/lib/projectCrossFileValidation.ts`:**
  - Added static literal registry collection (`LuaRegistryRowFact`), finite member-wrap candidate tracking (`LuaFiniteRegistryCandidate`), cross-file read-only parameter checking (`isLuaParamReadOnlyInFunction`, handling `LogicalExpression` escapes via `escapesTrackedTable` so boolean/nil guard expressions like `type(e) == "table" and tonumber(e.every) or nil` stay read-only while raw table escapes fail), and `resolveFiniteRegistries`.
  - Added file-scoped immutable namespace alias (`fileAliasRoots`) and `table.concat` alias (`fileConcatAliases`) collection for qualified functions (`LuaQualifiedFunctionDef`) plus cross-file `AddUITriggeredEvent` inline & factory wrapper verification (`verifyProjectEmitterForwarding`, `verifyIdentityPreservingTableCleaner`, `isStringOnlyLeafCleaner`), permitting safe non-mutating post-clean telemetry reads like `tostring(control)` (`aic_utf8.lua`) and unrelated-control branches (`aic_plaintext.lua`) while rejecting any clear, swap, early return, parameter shadowing/reassignment, or unverified cleaner mutation.
- **`scripts/event-coverage-selftest.ts`:**
  - Added `finite-registry-member-wrap-verification` (`39 -> 40`) and `emitter-forwarding-wrapper-verification` (`40 -> 41`), covering valid combined wrappers and multiple adversarial mutation/shadow/clear/early-return/opaque-factory failure paths.

## 5. Validation

- `npx eslint src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts` -> exit `0` (`0` errors).
- `npm run typecheck` -> exit `0` (`0` errors).
- `npx tsx scripts/event-coverage-selftest.ts` -> exit `0` (`{"pass":true,"total":41,...}`).
- `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00' npx tsx scripts/claude-validation-matrix.selftest.ts` -> exit `0` (`34/34` PASS).
- `X4_REFERENCE_ROOT=... npx tsx scripts/validation-noise.selftest.ts` -> exit `0` (`25/25` reference + `38` cross-file assertions PASS).
- `X4_REFERENCE_ROOT=... X4_XSD_PATH=... npx tsx scripts/ui-manifest-integrity.selftest.ts` -> exit `0` (`16/16` PASS; fails closed without `X4_XSD_PATH` set).
- `npm run test:project-validation-overlay` -> exit `0` (`24/24` PASS).
- `npm run test:x4-ui-integration` -> exit `0` (`21/21` PASS).
- `npm run test:routes` -> exit `0`.
- `npm run test:oracles` -> exit `0`.
- `npm run precommit:check` -> exit `0` (`[precommit] OK`).
- **Read-only live `x4_ai_influence` replay (`269` XML+Lua files):** `errorCount: 0`, `totalFindings: 64`, `unverifiedCount: 1`, `md/aic_opord_execution.xml` `md_lua.payload_writer_unverified` dropped from **50 -> 27** unverified keys (`a, attackexplicit, attackfac, attackid, attacknamed, b, cq, d and 19 more`), eliminating both `"A returned table is passed to an authored callback"` and `"Cross-file Lua prevents Forge from verifying event forwarding"`.
- **Unavailable validation note:** `scripts/lua-grammar.selftest.ts` requires external private Lua runtime env `FORGE_QA_LUA_HUB` (unset in this isolated environment).

## 6. Review Against Source Of Truth

- Finite registry resolution covers literal array member wraps without hardcoding mod symbols (`AI_Influence`, `HEALTH_TICKS`, etc.) -> **Done & evidenced**.
- Forwarding wrapper verification handles both UTF-8 cleaner (`aic_utf8.lua`) and plaintext control-scoped factory (`aic_plaintext.lua`) while rejecting early return, routing overwrite, `param` swap/clear, duplicate cleaner, and opaque decorator -> **Done & evidenced**.
- Remaining `27` keys (`CONV_ONLY(25)`, conditional `g`, `ri`) remain explicitly flagged -> **Done & evidenced**.
- Fresh-eyes review confirmed: hardening check `forbiddenNames` initially rejected read-only telemetry `tostring(control)` in `aic_utf8.lua`; relaxed to `noShadowNames` (`screen`, `control`, `prev`, `param`, `cleanVar` cannot be redeclared/mutated) + `noReadNames` (`param`, `cleanVar`, `prev` cannot be read in post-clean extra statements), preserving zero alias/mutation escape while passing live `aic_utf8.lua`.

## 7. Close

- **Status:** `VERIFIED` (Unit A scoped complete; `#101` / `#71` stay `in_progress` for Unit B remaining `27` keys & `0.0.94` IDE/game release).
- **Capabilities untouched:** Live `x4_ai_influence`, `0.0.89` `FORGE DEVELOPMENT` IDE, `config/durable-writers.json` (no raw FS/SQL/store writes added).
- **Suggested commit title:** `fix(validation): verify finite registry wraps and pass-through emitter wrappers (#101, #71)`

## 8. AAR

- **Triggers:** Triggered — (1) initial hardening edit rejected `type(e) == "table" and tonumber(e.every) or nil` in `ReturnStatement` (`containsTracked` instead of `escapesTrackedTable`); (2) initial `remainingSafe` rejected `local _n = f` and then `noShadowNames`/`forbiddenNames` merge rejected benign `tostring(control)` logging inside `aic_utf8.lua` until split into `noShadowNames` vs `noReadNames`.
- **Sustain:** Re-running the full 269-file read-only `x4_ai_influence` replay *after* hardening edits immediately caught the `control` logging regression that pure unit fixtures alone hadn't exercised.
- **Improve work/approach:** Model real telemetry patterns (like reading `control` in `log(...)`) directly inside synthetic selftests when writing hardening constraints, and always distinguish variable shadowing/mutation (`noShadowNames`) from mutable table reference escape (`noReadNames`).
- **Improve tools:** `ui-manifest-integrity.selftest.ts` requires `X4_XSD_PATH` alongside `X4_REFERENCE_ROOT` when `config.json` is unconfigured (`ui/core/addon.xsd`).
- **Highest-risk evidenced weakness:** AST rule hardening without immediate real-corpus replay can silently regress real-world idioms (evidenced when `forbiddenNames` reverted `x4_ai_influence` from 27 back to 50 keys); keep real read-only mod replay mandatory after every hardening tweak.
- **Lessons banked:** Reflected in `docs/plans/2026-11-23-lua-health-hook-and-emitter-wrappers.md`.
