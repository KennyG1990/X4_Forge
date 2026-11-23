# Lua-to-MD Emit Verification Across Local Forwarding Wrappers, Immutable Lookup Maps, and Conjunctive Equality Guards (#101 / #61)

Status: **VERIFIED (source / headless suites / routes & oracles / live read-only AiLive replay; installed IDE & public release remain open)**
Lane: **FULL**
Owner: [#101](https://github.com/KennyG1990/X4_Forge/issues/101), [#61](https://github.com/KennyG1990/X4_Forge/issues/61)
Baseline commit: `b0079be` (`HEAD` on isolated `main`, local ahead of `0.0.93`)

## PLAN

- **Bounded unit:** Upgrade `parseLuaUiEmits()` in `src/lib/projectCrossFileValidation.ts` (reusing a shared lexical scope collector `collectLuaLexicalScopes()` with `parseLuaRegisteredEvents()`) to resolve three sound, real-world emission patterns observed across the `13` `lua_md.emit_verification_gap` files in `x4_ai_influence` while keeping cross-file mutable runtime state and global tables fail-closed:
  1. **Unescaped lexical local `AddUITriggeredEvent` forwarding wrappers & thunk factories (`11` files):** Resolve single-target file-local `function` declarations (either calling `AddUITriggeredEvent(...)` directly, via `pcall(AddUITriggeredEvent, ...)`, via `pcall(function() AddUITriggeredEvent(...) end)`, or returning a zero-arg thunk calling `AddUITriggeredEvent(...)`) whose namespace is a known literal/constant and whose control is an un-reassigned parameter, provided the wrapper binding itself has `writes === 1`, is only invoked directly (`calls.length >= 1`, no escaping references or aliases), and `AddUITriggeredEvent`/`pcall` are unambiguous. Verify every caller's control argument against MD `<event_ui_triggered>` listeners instead of blindly leaving ~85 wrapper calls unchecked behind one `dynamic-arguments` gap.
  2. **Immutable unescaped local static lookup tables (`aic_strategy.lua`: `debugRunRoutes[what]`):** Resolve indexing into a closed, read-only local `TableConstructorExpression` whose field values are all exact non-tainted string constants (directly or via a single-write local `local control = tbl[k]` in the same block), emitting the finite union of literal target controls for cross-file listener checks.
  3. **Conjunctive enclosing field-equality guards (`aic_menu.lua:2405`: `pending.control == "aic_stn_act" and pending.dc == "aic_stn_decline"`):** When an `AddUITriggeredEvent` call (direct or via a synchronous inline `pcall(function() ... end)` thunk) sits directly inside an `IfClause`/`ElseifClause` whose top-level `and`-conjuncts prove `localRoot.member == "literal"` on an immutable local `localRoot` with no intervening mutation of `localRoot.member`, resolve that exact control string.
- **Assumptions:**
  - Three genuinely dynamic / mutable-heap emit sites in `x4_ai_influence` (`aic_menu.lua:2402` `pending.control or "action"`, `aic_truth_ui.lua:162` writable global table `A.DEBUG_RUN_EVT[tostring(name)]`, and `aic_corps.lua:449,452` mutable module-level `ncmRequest.control` across async callbacks/retries) intentionally remain unverified (`lua_md.emit_verification_gap`, `16 -> 4` unresolved calls across `13 -> 3` files) rather than risking unsound heuristics.
  - Pre-check (`task-3461`) verified all `~85` wrapped emissions across those files match existing MD `<event_ui_triggered>` listeners (`0` missing listeners).
- **Authoritative references:**
  - `src/lib/projectCrossFileValidation.ts`: `collectLuaRegistrationScopes`, `finiteLuaControl` (`1166-1190`), `parseLuaUiEmits` (`2093-2641`), built-in cross-file selftests (`3300-3600`).
  - `scripts/event-coverage-selftest.ts` (`1-810`, especially `dynamic-control-explicit`, `finite-control-*`, `protected-global-emitter-*`, `rebound-protected-callee-*`).
  - `scripts/validation-noise.selftest.ts` (`43-62`: `'ambiguous or shadowed value not invented'`).
  - Read-only AiLive witnesses (`x4_ai_influence/ui/addons/ai_influence_chat/`): `aic_business.lua`, `aic_corps.lua`, `aic_directorate_boardui.lua`, `aic_inspect.lua`, `aic_menu.lua`, `aic_mode_news.lua`, `aic_reward.lua`, `aic_sa.lua`, `aic_strategy.lua`, `aic_tradewar.lua`, `aic_treaty.lua`, `aic_truth_ui.lua`, `aic_upkeep.lua`.
- **In scope:**
  - `src/lib/projectCrossFileValidation.ts`: generalize `collectLuaRegistrationScopes` into shared `collectLuaLexicalScopes` with `parents` tracking; implement wrapper/factory verification, finite static local lookup-table resolution, and conjunctive `and` field-equality guard resolution inside `parseLuaUiEmits()`; preserve existing `payloadWrites`, `protectedBodies`, `finiteLuaControl`, `emitCoverage.scope`, and missing-listener checks cleanly.
  - `scripts/event-coverage-selftest.ts`: add positive and negative unit checks for local emit wrappers/thunks, lookup tables, equality guards, escaping wrappers, zero-caller dead wrappers, mutated lookup tables, `or`-disjunction non-guards, and `lua_md.missing_listener` exposure through wrappers.
- **Out of scope:**
  - Mutable module-level record tracking (`aic_corps.lua` `ncmRequest.control`) or global table inference (`aic_truth_ui.lua` `A.DEBUG_RUN_EVT` / `aic_menu.lua:2402` `pending.control`).
  - Changing `captured_table_event` or indexed payload contract verification rules.
  - `x4_ai_influence` source edits, `FORGE DEVELOPMENT` IDE (`0.0.89`), VSIX build, or `git push`.
- **Files affected:**
  - `src/lib/projectCrossFileValidation.ts`
  - `scripts/event-coverage-selftest.ts`
  - `docs/plans/2026-11-23-lua-emit-wrappers-and-guards.md` (and at close: `BACKLOG.md`, `SESSION-HANDOFF.md`)
- **Risks & authorization boundaries:**
  - **False safety risk:** Allowing uncalled (`0`-caller) local wrappers (`scripts/event-coverage-selftest.ts:93,95`), escaped/aliased local wrappers (`local alias = send`), global wrappers (`SendProbe`), mutated lookup tables (`tbl[k] = dyn`), `or` conditions, mutated local fields inside an `if`, or breaking `captured_table_event` (`payload_writer_unverified`) would regress soundness or existing selftests. Every boundary must fail closed (`unresolved++`).
  - **Boundary:** Read-only on `x4_ai_influence` and `X4 unpacked 9.00`. No new `.ts` files imported by `server.ts`. No `git push` or IDE writes.
- **Rollback:** `git checkout -- src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts`.
- **Acceptance criteria:**
  1. All `10` pure local-wrapper / lookup-table files (`aic_business`, `aic_directorate_boardui`, `aic_inspect`, `aic_mode_news`, `aic_reward`, `aic_sa`, `aic_strategy`, `aic_tradewar`, `aic_treaty`, `aic_upkeep`) clear `lua_md.emit_verification_gap` (`unresolved: 0`) on `x4_ai_influence`, with all wrapped literal/lookup controls checked cleanly (`lua_md.missing_listener` fires accurately if a wrapped call names a missing listener).
  2. `aic_menu.lua:2405` (`aic_stn_decline`) and `aic_truth_ui.lua:194` (`evt(...)` thunks) resolve cleanly, reducing `x4_ai_influence` `lua_md.emit_verification_gap` from `13` files (`16` unresolved calls) to `3` files (`4` unresolved calls: `aic_menu.lua:2402`, `aic_truth_ui.lua:162`, `aic_corps.lua:449,452`), with `exact` emissions increasing correspondingly and zero false `missing_listener` errors.
  3. Negative controls hold strictly:
     - Uncalled `local function send(x) AddUITriggeredEvent("ForgeLab", x, {}) end` (`0` calls) and global `function SendProbe(name)` keep `unresolved: 1` (`dynamic-arguments`).
     - Local wrapper whose binding escapes (`local f = send`, `return send`, `t.fn = send`, `Subscribe(send)` except when wrapper returns a zero-arg thunk) or is reassigned stays `unresolved`.
     - Lookup table with mutation (`tbl.x = dyn`, `table.insert`), dynamic/prefix/tainted entry, key/value mismatch, or table passed to external calls stays `unresolved` (or `'source-encoding'` on tainted).
     - `or` branch (`if x or pending.dc == "a"`), mutated field inside `if` (`pending.dc = dyn`), global `pending`, or async closure not inside direct `pcall` thunk fails closed (`unresolved`).
     - Rebound/local `AddUITriggeredEvent` or `pcall` inside or outside wrapper preserves `'ambiguous-callee'` / `0` emitted.
     - Existing `captured_table_event` and all `45` checks in `event-coverage-selftest.ts` remain green without weakening.
- **Required validation methods:**
  - `npx eslint src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts`
  - `npm run typecheck`
  - `npx tsx scripts/event-coverage-selftest.ts`
  - `npx tsx scripts/validation-trust.selftest.ts`
  - `npx tsx scripts/finding-review.selftest.ts`
  - `npx tsx scripts/incremental-lua-selftest.ts`
  - `npm run test:project-validation-overlay`
  - `npm run test:x4-ui-integration`
  - `npm run test:oracles`
  - `npm run test:routes` (with `X4_REFERENCE_ROOT` and `X4_XSD_PATH` unset)
  - `npm run precommit:check`
  - With `X4_REFERENCE_ROOT` & `X4_XSD_PATH`: `validation-noise.selftest.ts`, `claude-validation-matrix.selftest.ts`, `ui-manifest-integrity.selftest.ts`
  - Read-only `x4_ai_influence` cross-file & full `runProjectValidation` replay (`lua_md.emit_verification_gap`: `13 -> 3` files, `unresolved`: `16 -> 4`).
- **Unavailable validation methods:** Live `FORGE DEVELOPMENT` IDE (`0.0.89`), Open VSX packaged VSIX (`0.0.94`), and live X4 game runtime remain gated on Machine-State Ask / release approval.
- **Evidence locations:** `docs/plans/2026-11-23-lua-emit-wrappers-and-guards.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.

## BASELINE

- Revision: `b0079be` (`HEAD` clean).
- Baseline (`task-3426`):
  - `emitCoverage`: `{ exact: 362, prefix: 0, unresolved: 16, scope: 'direct-and-pcall-global-AddUITriggeredEvent-calls' }`.
  - `13` files with `lua_md.emit_verification_gap` (`dynamic-arguments`): `aic_business.lua` (`0 exact, 1 unresolved`), `aic_corps.lua` (`5, 2`), `aic_directorate_boardui.lua` (`0, 1`), `aic_inspect.lua` (`2, 1`), `aic_menu.lua` (`34, 2`), `aic_mode_news.lua` (`0, 1`), `aic_reward.lua` (`3, 1`), `aic_sa.lua` (`0, 1`), `aic_strategy.lua` (`6, 1`), `aic_tradewar.lua` (`0, 1`), `aic_treaty.lua` (`5, 1`), `aic_truth_ui.lua` (`1, 2`), `aic_upkeep.lua` (`1, 1`).
  - `luaMdMissingListeners: 0`.

## RECONCILE

- **Resources searched:** `src/lib/projectCrossFileValidation.ts` (`collectLuaRegistrationScopes`, `finiteLuaControl`, `localControlTruthiness`, `parseLuaUiEmits`), `scripts/event-coverage-selftest.ts`, `scripts/validation-noise.selftest.ts`, and all 13 `x4_ai_influence` emit-gap Lua files (`task-3433`, `steps/3437/output.txt`, `task-3461`).
- **Existing capability reused:** Generalize `collectLuaRegistrationScopes()` into shared `collectLuaLexicalScopes()` with `parents` mapping so both `parseLuaRegisteredEvents()` and `parseLuaUiEmits()` share one lexical scope & global-mutation collector without AST-walk duplication.
- **Couplings checked:**
  - `scripts/event-coverage-selftest.ts:93,95`: uncalled `local function send(on) ...` (`0` callers) with unresolved dynamic control MUST retain `unresolved: 1`; global `function SendProbe(name)` MUST retain `unresolved: 1`.
  - `src/lib/projectCrossFileValidation.ts:3534`: `captured_table_event` (`local function send() ... end; send()`) expects `md_lua.payload_writer_unverified`; payload writer verification stays untouched inside `parseLuaUiEmits`.
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT

- **Actual bounded changes (`src/lib/projectCrossFileValidation.ts`, `scripts/event-coverage-selftest.ts`):**
  - Generalized `collectLuaRegistrationScopes()` into shared `collectLuaLexicalScopes()` (with AST `parents` map including `IfStatement` -> clause links) and extracted shared `populateLuaBindingStrings()` helper so `parseLuaRegisteredEvents()` and `parseLuaUiEmits()` reuse one lexical binding/global-write analyzer with zero duplicated AST traversal.
  - Added `collectLocalEmitWrappers()` in `src/lib/projectCrossFileValidation.ts` to identify single-target lexical local `AddUITriggeredEvent` forwarding functions (direct, `pcall(AddUITriggeredEvent, ...)`, `pcall(function() AddUITriggeredEvent(...) end)`, and thunk-returning factories like `evt(ctl, p)`), requiring `writes === 1`, `refs.length >= 1`, direct call-only usage (no aliases/escapes), unambiguous `AddUITriggeredEvent` and `pcall` (rejecting any wrapper whose body contains a rebound/ambiguous `pcall(...)` call), constant resolved namespace, and un-reassigned control parameter; deduplicated direct and wrapper emission accounting into shared `recordEmitResolution()` + `resolveEmitControl()`.
  - Added `collectReadOnlyStringLookupTables()` + `resolveLookupTableControls()` to resolve immutable, unescaped read-only local string lookup tables (`debugRunRoutes[what]` directly or via single-write local `local control = debugRunRoutes[what]`).
  - Added `resolveGuardedMemberControls()` to resolve exact `localRoot.member == "literal"` predicates inside enclosing `and`-only `IfClause`/`ElseifClause` conditions (allowing direct block execution or synchronous inline zero-arg `pcall(function() ... end)` thunks while failing closed on `or` disjunctions, mutations inside the branch, reassigned roots, or async closures).
  - Added 3 regression test suites (`emit-local-forwarding-wrappers-and-thunk-factories`, `emit-local-wrapper-negative-controls`, `emit-lookup-table-and-conjunctive-equality-guards`) to `scripts/event-coverage-selftest.ts`.
- **Scope adjustments during implementation:** Added `luaIdentifier(inner.base) === 'pcall' && ambiguousProtectedCall(inner.base)` guard in `collectLocalEmitWrappers()` after our new negative test caught `local pcall = customPcall; local function ptWrap(name) pcall(function() AddUITriggeredEvent(...) end) end` bypassing thunk-call checks.

## VALIDATE

All checks ran strictly AFTER the final edit (`task-3523`):
- `npx eslint src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts` -> exit `0`
- `npm run typecheck` -> exit `0`
- `npx tsx scripts/event-coverage-selftest.ts` -> PASS `48/48` (all 45 existing + 3 new emit wrapper/lookup/guard checks + `runProjectCrossFileSelftest()`)
- `npx tsx scripts/validation-trust.selftest.ts` -> PASS (`50` checks)
- `npx tsx scripts/finding-review.selftest.ts` -> PASS (`25` checks)
- `npx tsx scripts/incremental-lua-selftest.ts` -> PASS `24/24`
- `npm run test:project-validation-overlay` -> PASS `24/24`
- `npm run test:x4-ui-integration` -> PASS `21/21`
- `npx tsx scripts/claude-validation-matrix.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> PASS `34/34`
- `npx tsx scripts/validation-noise.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> PASS (`reference 25/25`, `properties 112/112`, `crossFile 117/117`, `38` corpus assertions)
- `npx tsx scripts/ui-manifest-integrity.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> PASS `16/16`
- `npm run test:oracles` -> exit `0` (`[oracle-sweep] 134/134 green`)
- `npm run test:routes` (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` unset) -> exit `0` (`[route-integration] 624/624 PASS`)
- `npm run precommit:check` -> exit `0` (`[precommit] OK`, `action-receipt-coverage`: `routeCount: 98, surfaceCount: 69`)
- Read-only `x4_ai_influence` cross-file & full project replay (`264` loaded files, `269` XML+Lua files, `task-3523`):
  - `crossEmitCoverage`: `exact` increased **`362 -> 445` (`+83`)**, `unresolved` dropped **`16 -> 4` (`-75%`)**, `prefix: 0`, `scope: 'direct-and-pcall-global-AddUITriggeredEvent-calls'`.
  - `info:lua_md.emit_verification_gap` dropped **`13 -> 3` files** (clearing `aic_business.lua`, `aic_directorate_boardui.lua`, `aic_inspect.lua`, `aic_mode_news.lua`, `aic_reward.lua`, `aic_sa.lua`, `aic_strategy.lua`, `aic_tradewar.lua`, `aic_treaty.lua`, `aic_upkeep.lua`, and cutting `aic_menu.lua` `2 -> 1` and `aic_truth_ui.lua` `2 -> 1`; retaining only genuinely dynamic/mutable/global `aic_menu.lua:2402`, `aic_truth_ui.lua:162`, `aic_corps.lua:449,452`).
  - `flatCount`: **`497 -> 487`**, `error:lua_md.missing_listener`: `0` (`4` pre-existing `error:md_lua.missing_register` `'AIChat.health_note'` unchanged).

## REVIEW

- Criterion 1 (`10` local-wrapper / lookup-table files cleared + `missing_listener` verification active): **Done and evidenced** (`445` exact emits checked against MD, `+83` covered call sites, negative `missing_listener` tests proven in `48/48`).
- Criterion 2 (`aic_menu.lua:2405` + `aic_truth_ui.lua:194` cleared; `13 -> 3` files, `16 -> 4` unresolved calls): **Done and evidenced** (`task-3523`).
- Criterion 3 (strict negative controls & preserved `captured_table_event` / payload boundaries): **Done and evidenced** (`emit-local-wrapper-negative-controls`, `emit-lookup-table-and-conjunctive-equality-guards`, `48/48`, `117/117`).
- Fresh-eyes diff check: Verified `collectLuaLexicalScopes` shares one lexical walk with `parseLuaRegisteredEvents` via `parents`, `nodeFnScope`, and `populateLuaBindingStrings` with zero duplicate AST logic; confirmed `emitWrappers` excludes uncalled or escaped functions, parameter writes, and ambiguous `pcall` thunks; confirmed `lookupTables` rejects mutated/escaped tables and surfaces `'source-encoding'` for tainted entries; confirmed `recordEmitResolution` preserves untouched `payloadWrites` and `protectedBodies` payload contracts.

## CLOSE

- **Status:** **VERIFIED (source / headless suites / routes & oracles / live read-only AiLive replay; installed IDE `0.0.89` & `0.0.94` public release remain open)**
- **What changed:** `src/lib/projectCrossFileValidation.ts`, `scripts/event-coverage-selftest.ts`, `docs/plans/2026-11-23-lua-emit-wrappers-and-guards.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.
- **What was deliberately not changed:** Mutable module-level `aic_corps.lua` `ncmRequest.control`, global writable `A.DEBUG_RUN_EVT` (`aic_truth_ui.lua:162`), cross-file mutable `pending.control` (`aic_menu.lua:2402`), `x4_ai_influence` source files, route/receipt manifests, or `FORGE DEVELOPMENT` IDE (`0.0.89`).
- **Reconciliation / capability-map delta:** `no capability-map delta`.
- **Baseline & rollback:** Baseline `b0079be`; rollback via `git checkout -- src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts`.
- **Remaining risks / deferred work:** `#101` remaining `27` payload writer keys (e.g. `aic_confirm.lua` `CONV_ONLY`), mutable `aic_corps.lua` record tracking (if ever desired separately), `#129` remaining `159` `md.variable_initial_state` gaps, `#96`, `#97` residual staging overhead, and `0.0.94` installed IDE/E2E qualification.
- **Suggested commit title:** `fix(cross-file): verify local Lua emit wrappers, lookup tables, and equality guards (#101, #61)`

## AAR

- **Triggers:** New negative test `emit-local-wrapper-negative-controls` caught a real soundness bug in the first draft: `local pcall = customPcall; local function ptWrap(name) pcall(function() AddUITriggeredEvent("ForgeLab", name, {}) end) end; ptWrap("probe")` previously bypassed `ambiguousProtectedCall` inside `collectLocalEmitWrappers()` because `forwarded` was only `true` on `pcall(...)`, not on `AddUITriggeredEvent(...)` inside the inner thunk.
- **Points to sustain:** Writing hostile negative controls (`local pcall = customPcall` around thunk `pcall(function() ... end)` in addition to direct `pcall(AddUITriggeredEvent, ...)`) caught an exact thunk-wrapper loophole before commit; reusing `collectLuaLexicalScopes` + `populateLuaBindingStrings` eliminated duplication between MD->Lua and Lua->MD cross-file analyzers.
- **Points to improve — work/approach:** Whenever supporting thunk wrappers (`pcall(function() ... end)` or returned lambdas) inside static analyzers, explicitly audit every builtin call (`pcall`, `rawset`, `setfenv`) inside the entire wrapper function body rather than only checking the immediate call node containing `AddUITriggeredEvent`.
- **Points to improve — tools:** `No tool delta` beyond previously logged `X4_XSD_PATH` / `X4_REFERENCE_ROOT` env toggling.
- **Highest-risk evidenced weakness:** Inner-thunk indirection masking a locally rebound `pcall` (`local pcall = customPcall; pcall(function() ... end)`) — resolved in `collectLocalEmitWrappers()` by failing closed whenever any `CallExpression` in `fnDecl.body` invokes an ambiguous `pcall`.
- **Lessons banked:** In Lua static analysis, verifying `pcall` safety requires checking every `pcall` `CallExpression` across the analyzed wrapper body (`ambiguousProtectedCall(inner.base)`), because `pcall(function() target(...) end)` separates the `pcall` node from the `target` node.
