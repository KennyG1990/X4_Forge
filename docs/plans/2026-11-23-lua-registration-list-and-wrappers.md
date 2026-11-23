# Lua Registration Verification Across Lexical Scopes, Literal `ipairs` Lists, and Bookkeeping Wrappers (#101 / #61)

Status: **VERIFIED (source / headless routes & oracles / live AiLive replay; installed IDE & public release remain open)**
Lane: **FULL**
Owner: [#101](https://github.com/KennyG1990/X4_Forge/issues/101), [#61](https://github.com/KennyG1990/X4_Forge/issues/61)
Baseline commit: `a00d117488029d501d5e10796ae7a7e0b844c804` (`HEAD` on isolated `main`, local ahead of `0.0.93`)

## PLAN

- **Bounded unit:** Replace the file-wide string-keyed variable/parameter tracking in `parseLuaRegisteredEvents()` inside `src/lib/projectCrossFileValidation.ts` with lexical binding resolution (`luaparse` `scope: true` + block/function scope tracking) and add bounded, sound support for the three verified registration patterns observed in the read-only `x4_ai_influence` witness:
  1. Iterating an unescaped, immutable local table constructor of clean exact string expressions via unshadowed global `ipairs(...)` (`aic_perf.lua`: `local EVENTS = { ... }; for _, ev in ipairs(EVENTS) do RegisterEvent(ev, ...) end`).
  2. Lexical local forwarding wrappers without file-wide parameter name collision poisoning (`aic_reward.lua`: unrelated `function A.RewardFunds(..., on, known)` parameter `on` colliding with `local function on(ev, f)`).
  3. Captured global registrar wrappers that locally shadow `RegisterEvent` after capturing it and append to a plain local bookkeeping table (`aic_uix.lua`: `local _REG = {}; local _RegisterEvent = RegisterEvent; local function RegisterEvent(name, handler) _RegisterEvent(name, handler); _REG[#_REG + 1] = name end`), while keeping global `RegisterEvent` calls outside the shadowed block (`if RegisterEvent then RegisterEvent("AIChat.defected", ...)`) cleanly distinguished from global rebinds or `_ENV` replacement.
- **Assumptions:** Removing the 3 false `md_lua.registration_verification_gap` findings on `x4_ai_influence` will allow `validateProjectCrossFile()`'s `missingRegisters` check (which skips emission whenever `parseUnavailable.length > 0`) to execute end-to-end across all `412` `<raise_lua_event>` calls in `x4_ai_influence`. Pre-check showed `4` calls to `'AIChat.health_note'` in `md/ai_influence_chat.xml` have no Lua `RegisterEvent` anywhere in `x4_ai_influence` (verified real missing-listener finding, not a parser gap).
- **Authoritative references:**
  - `src/lib/projectCrossFileValidation.ts`: `parseLuaRegisteredEvents` (`343-454`), `scanLuaScope` (`767-775`), `luaContains` (`777-779`), `parseLuaUiEmits` global mutation conventions (`1625-1745`), built-in selftests (`2770-2992`).
  - `scripts/claude-validation-matrix.selftest.ts` (`46-64`): `shadowed local registrar cannot invent engine registration`, `duplicate wrapper parameters stay unverified`, registration uncertainty checks.
  - `scripts/event-coverage-selftest.ts` (`1-431`).
  - Read-only AiLive witness files (`G:\F-rescue-2026-09-26\DEV_ENV\projects\Mods\X4Mods\x4_ai_influence\ui\addons\ai_influence_chat\`):
    - `aic_perf.lua` (`265-277`)
    - `aic_reward.lua` (`93`, `537-564`)
    - `aic_uix.lua` (`15507-16271`)
- **In scope:**
  - `src/lib/projectCrossFileValidation.ts`: lexical binding resolver helper, global registrar/environment integrity helper, unescaped literal-array `ipairs` expansion inside `parseLuaRegisteredEvents`, and wrapper verification accepting plain local-table index/member bookkeeping writes alongside one unconditional forwarding `CallStatement`.
  - Regression tests (positive + negative controls) in `scripts/event-coverage-selftest.ts` and `runProjectCrossFileSelftest()` (as needed).
- **Out of scope:**
  - `lua_md.emit_verification_gap` (13 remaining `x4_ai_influence` files — separate Unit C under `#101`/`#61`).
  - General arbitrary loops (`pairs`, numeric `for`, computed/non-literal/mutated arrays, helper-factory-returned registrars, cross-module global table wrappers, or editing `x4_ai_influence`).
- **Files affected:**
  - `src/lib/projectCrossFileValidation.ts`
  - `scripts/event-coverage-selftest.ts`
  - `docs/plans/2026-11-23-lua-registration-list-and-wrappers.md` (and at close: `BACKLOG.md`, `SESSION-HANDOFF.md`)
- **Risks & authorization boundaries:**
  - **False verification risk:** Accepting mutated arrays, `nil` holes inside array constructors, shadowed `ipairs`, early `break`/`return` inside `ipairs`, non-forwarding local `RegisterEvent` shadows, conditional wrappers, `setmetatable`-attached bookkeeping tables, or global rebinds / `_ENV` mutations would create false negatives on `md_lua.missing_register` and violate trust invariants. Every rule must fail closed into `md_lua.registration_verification_gap` (or non-registration for non-forwarding shadows like `local function RegisterEvent(a,b) end`).
  - **Scope / boundary:** Read-only on `x4_ai_influence` and `X4 unpacked 9.00`. Do NOT create new `.ts` files imported by `server.ts` (avoid triggering `capability-contract-audit` route-source manifest drift). Do NOT push or touch `FORGE DEVELOPMENT` IDE (`0.0.89`).
- **Rollback:** `git checkout -- src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts` (plus doc files).
- **Acceptance criteria:**
  1. `aic_perf.lua`, `aic_reward.lua`, and `aic_uix.lua` patterns recover all exact registered event names (`15`, `13`, `50` respectively on read-only `x4_ai_influence`) with zero `md_lua.registration_verification_gap` false positives.
  2. File-wide parameter/variable collisions (e.g. an unrelated function having parameter `on` or an unrelated block defining `local reg` / `local RegisterEvent`) do not poison clean lexical registrar aliases, wrappers, or unshadowed global `RegisterEvent` calls.
  3. All negative controls remain strictly bounded / fail closed:
     - `local function RegisterEvent(a,b) end; RegisterEvent("lab.reply", fn)` still emits `md_lua.missing_register` (`1`, never invents registration).
     - `local _RegisterEvent = RegisterEvent; local function RegisterEvent(name, handler) if cond then _RegisterEvent(name, handler) end end` stays unverified (`md_lua.registration_verification_gap`).
     - Bookkeeping table with `setmetatable(t, mt)`, helper `CallExpression` side effects in wrapper body/index, or `return` inside wrapper body stays unverified.
     - Duplicate wrapper params stay unverified.
     - `ipairs` list with `nil` hole, non-literal / prefix entry, keyed entry (`{ k = "a" }`), subsequent write (`EVENTS[#EVENTS+1] = x`), escape (`table.insert(EVENTS, x)`), loop jump (`break`/`return`), deferred nested function closure (`Schedule(function() RegisterEvent(ev, fn) end)`), reassigned loop variable, or shadowed `ipairs` stays unverified (`md_lua.registration_verification_gap`).
     - Global rebinds (`RegisterEvent = custom`, `_G.RegisterEvent = custom`, `rawset(_G, "RegisterEvent", custom)`, `local _ENV = {}`) stay unverified (`md_lua.registration_verification_gap`).
     - Tainted non-Latin-1 literals (direct, alias, wrapper, or inside `EVENTS = { "a—b" }`) keep `md_lua.registration_verification_gap`.
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
  - `npm run test:routes` (with `X4_REFERENCE_ROOT` and `X4_XSD_PATH` unset!)
  - `npm run precommit:check`
  - With `X4_REFERENCE_ROOT` & `X4_XSD_PATH`: `npx tsx scripts/validation-noise.selftest.ts`, `npx tsx scripts/claude-validation-matrix.selftest.ts`
  - Read-only `x4_ai_influence` cross-file + full project validation replay (`md_lua.registration_verification_gap: 3 -> 0`, `aic_perf=15`, `aic_reward=13`, `aic_uix=50`, confirm `missingRegisters` accurately surfaces only the 4 real `'AIChat.health_note'` findings and `0` spurious missing registers).
- **Unavailable validation methods:** Live `FORGE DEVELOPMENT` IDE rendering (`0.0.89`), Open VSX packaged verification (`0.0.94`), and live X4 game execution remain held under Machine-State Ask / release gates.
- **Evidence locations:** `docs/plans/2026-11-23-lua-registration-list-and-wrappers.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.

## BASELINE

- Revision: `a00d117488029d501d5e10796ae7a7e0b844c804` (`HEAD` clean, local ahead of `0.0.93`).
- Baseline checks (`task-3264`, `task-3276`, `task-3287`):
  - `npx eslint src/lib/projectCrossFileValidation.ts`: exit `0` (`0` errors, pre-existing warnings check in post-edit run).
  - `npx tsx scripts/event-coverage-selftest.ts`: PASS (`41/41`).
  - Read-only `x4_ai_influence` (`269` files in cross-file check): `mdLua.parseUnavailable.length === 3` (`aic_perf.lua` registered `["aic.http.update"]` (`1`); `aic_reward.lua` registered `[]` (`0`); `aic_uix.lua` registered `[]` (`0`)); `mdLuaMissingRegisters: 0` because `parseUnavailable.length > 0` suppressed `missingRegisters` across all `412` MD `raise_lua_event` sites (masking `4` unattached `'AIChat.health_note'` calls in `md/ai_influence_chat.xml`).

## RECONCILE

- **Resources searched:** `src/lib/projectCrossFileValidation.ts` (`1-100`, `161-250`, `250-455`, `456-555`, `751-850`, `1590-1745`, `1795-1895`, `2001-2100`, `2241-2340`, `2485-2585`, `2895-3529`), `scripts/event-coverage-selftest.ts`, `scripts/claude-validation-matrix.selftest.ts`, `scripts/validation-noise.selftest.ts`, and read-only `x4_ai_influence` witnesses.
- **Existing capability reused:** Extend `parseLuaRegisteredEvents` in `src/lib/projectCrossFileValidation.ts` using existing `buildLuaAnalysisSource`, `parse` (`luaparse` with `scope: true`), `walkLuaAst`, `luaContains`, `luaIdentifier`, `isLuaGlobalEnvironment`, `luaStringPrefix`, and `boundedLuaParseDetail`.
- **Couplings checked:**
  - `validateProjectCrossFile` (`2563`): once `parseUnavailable.length` drops to `0`, `missingRegisters` actively validates all `412` MD `raise_lua_event` calls against registered names and prefixes.
  - `claude-validation-matrix.selftest.ts` (`46-64`): `shadowed local registrar cannot invent engine registration` requires non-forwarding `local function RegisterEvent(a, b) end` calls to NOT emit `md_lua.registration_verification_gap` and instead yield `mdLuaMissingRegisters === 1`; `duplicate wrapper parameters stay unverified` requires duplicate-parameter wrappers whose body calls `RegisterEvent` to stay unverified (`md_lua.registration_verification_gap`).
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT

- **Actual bounded changes (`src/lib/projectCrossFileValidation.ts`, `scripts/event-coverage-selftest.ts`):**
  - Replaced file-wide variable/parameter name maps in `parseLuaRegisteredEvents()` with lexical scope resolution via `collectLuaRegistrationScopes()` (`bindings`, `declToBinding`, `identToBinding`, `functions`, `forLoops`, `nodeFnScope`, `jumpFnScopes`, `reboundGlobals`, `opaqueGlobals`), respecting true Lua lexical boundaries (`Chunk`, `DoStatement`, `WhileStatement`, `RepeatStatement` `body -> until`, `IfStatement` arms, `ForNumericStatement`, `ForGenericStatement`, `LocalStatement` RHS-before-LHS, `FunctionDeclaration` param scopes) and tracking `_ENV` / `setfenv` / `rawset` / `_G` writes.
  - Added `extractPureIpairsEventList()` and updated `resolveLuaRegistrationStrings()` to expand finite, unescaped, read-only local `TableConstructorExpression` arrays of exact clean strings iterated by unshadowed global `ipairs(...)` directly inside loop-level `CallStatement`s without `break`/`return`/`goto` or conditional wrappers inside the loop body, while still flagging non-Latin-1 literals (`tainted`), `nil` holes, keyed tables, dynamic entries, mutations, escapes, and deferred closures.
  - Updated forwarding wrapper verification and `isPlainLocalBookkeepingTable()` so single unconditional forwarding wrappers may also perform plain local-table bookkeeping writes (e.g. `_REG[#_REG + 1] = name`) provided the local table has no `setmetatable`, no escaping alias, no `CallExpression` side effects in index or RHS, and no return/branch jumps; separated unshadowed global `RegisterEvent` calls (`!node.isLocal && !opaqueGlobals && !reboundGlobals.has('RegisterEvent')`) from lexical wrapper calls (`local function RegisterEvent` in `init()`); restricted wrapper `possibleRegistrarBindings` detection to parameterized forwarding functions whose `nodeFnScope` directly forwards a parameter (avoiding zero-arg initializer functions such as `init()`).
  - Added 4 focused test groups (`registration-ipairs-literal-list`, `registration-ipairs-negative-controls`, `registration-scoped-wrapper-avoids-unrelated-parameter-collision`, `registration-captured-shadow-and-bookkeeping-wrapper`) in `scripts/event-coverage-selftest.ts`.
- **Scope adjustment during implementation:** None to external APIs or schemas; kept new helpers local to `src/lib/projectCrossFileValidation.ts` to preserve clean modular separation without introducing new route sources.

## VALIDATE

All checks ran strictly AFTER the final edits (`src/lib/projectCrossFileValidation.ts` & `scripts/event-coverage-selftest.ts`):
- `npx eslint src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts` -> exit `0`
- `npm run typecheck` -> exit `0`
- `npx tsx scripts/event-coverage-selftest.ts` -> PASS `45/45` (includes all 41 existing + 4 new registration unit/negative checks + `runProjectCrossFileSelftest()`)
- `npx tsx scripts/validation-trust.selftest.ts` -> PASS (`50` checks)
- `npx tsx scripts/finding-review.selftest.ts` -> PASS (`25` checks)
- `npx tsx scripts/incremental-lua-selftest.ts` -> PASS `24/24`
- `npm run test:project-validation-overlay` -> PASS `24/24`
- `npm run test:x4-ui-integration` -> PASS `21/21`
- `npx tsx scripts/claude-validation-matrix.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> PASS `34/34`
- `npx tsx scripts/validation-noise.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> PASS (`reference 25/25`, `properties 112/112`, `crossFile 117/117`, `38` corpus assertions)
- `npx tsx scripts/ui-manifest-integrity.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`) -> PASS `16/16`
- `npm run test:oracles` -> exit `0` (`[oracle-sweep] 134/134 green`, `runtime_debugger_selftest_route_is_registered_and_green` `49/49`)
- `npm run test:routes` (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` unset) -> exit `0` (`[route-integration] 624/624 PASS`)
- `npm run precommit:check` -> exit `0` (`[precommit] OK`, `action-receipt-coverage` PASS: `routeCount: 98, surfaceCount: 69`)
- Read-only `x4_ai_influence` cross-file & full project replay:
  - `validateProjectCrossFile` (`269` XML+Lua files, `task-3336`): `luaRegistrationUnavailable: 0` (down from `3`), `parseUnavailable: []`, `aic_perf.lua: 15`, `aic_reward.lua: 13`, `aic_uix.lua: 56`, `mdLuaMissingRegisters: 4` (unblocking real `missing_register` verification on `'AIChat.health_note'` at `md/ai_influence_chat.xml:3785`, `4010`, `4270`, `5959`).
  - `runProjectValidation` (`264` loaded files, `task-3391`): `ok: false`, `flatCount: 497`, `info:md_lua.registration_verification_gap: 0` (was `3`), `error:md_lua.missing_register: 4` (was `0`), `info:lua.undefined_global: 0`.

## REVIEW

- Criterion 1 (`aic_perf.lua`, `aic_reward.lua`, `aic_uix.lua` pattern recovery): **Done and evidenced** (`15`, `13`, `56` events recovered cleanly, `md_lua.registration_verification_gap: 3 -> 0`).
- Criterion 2 (lexical scoping prevents unrelated parameter/shadow cross-talk): **Done and evidenced** (`A.RewardFunds(..., on, ...)` no longer poisons `local function on`, nested shadow/parameter still isolated).
- Criterion 3 (all negative controls fail closed cleanly): **Done and evidenced** (`45/45` `event-coverage-selftest`, `34/34` `claude-validation-matrix`, `117/117` `validation-noise` crossFile).
- Fresh-eyes diff check: Verified `collectLuaRegistrationScopes` visits `TableKeyString.value`, `TableKey.key/value`, `TableValue.value`, `MemberExpression.base`, `IndexExpression.base/index`, and `RepeatStatement` `body -> condition` in exact Lua scope order without leaking property identifiers (`t.on`) into lexical variable resolution; confirmed `node.isLocal` is only checked on `Identifier` nodes (not `MemberExpression` like `table.concat`), and `argBinding.writes === 1` protects wrapper parameters against re-assignment before forwarding.

## CLOSE

- **Status:** **VERIFIED (source / headless suites / routes & oracles / live read-only AiLive replay; installed IDE `0.0.89` & `0.0.94` public release remain open)**
- **What changed:** `src/lib/projectCrossFileValidation.ts`, `scripts/event-coverage-selftest.ts`, `docs/plans/2026-11-23-lua-registration-list-and-wrappers.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.
- **What was deliberately not changed:** `lua_md.emit_verification_gap` (`13` files — next Unit C), `x4_ai_influence` source files (read-only witness, note 4 genuine `AIChat.health_note` missing-register findings), route/receipt manifests, or `FORGE DEVELOPMENT` IDE (`0.0.89`).
- **Reconciliation / capability-map delta:** `no capability-map delta`.
- **Baseline & rollback:** Baseline `a00d117488029d501d5e10796ae7a7e0b844c804`; rollback via `git checkout -- src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts`.
- **Remaining risks / deferred work:** `#101`/`#61` Unit C (`13` `lua_md.emit_verification_gap` files), `#101` Unit B (`27` remaining indexed payload keys), installed IDE/E2E qualification (`0.0.94`).
- **Suggested commit title:** `fix(cross-file): verify lexical Lua registration lists, wrappers, and shadow bookkeeping (#101, #61)`

## AAR

- **Triggers:** Three implementation/test catches during development:
  1. `isPlainLocalBookkeepingTable()` initially checked `parent.base?.isLocal === false` on `table.concat(...)`, where `parent.base` is a `MemberExpression` (`isLocal === undefined`) rather than its inner `Identifier` `parent.base.base`.
  2. Initial `possibleRegistrarBindings` walked arbitrarily deep inside zero-parameter initializers (`local function init() ... RegisterEvent("...", ...) end`), wrongly tagging `init` itself as a possible dynamic registrar and failing on `init()`.
  3. The new `registration-ipairs-literal-list` unit test initially expected `['ForgeLab.c', 'ForgeLab.a', 'ForgeLab.b']` before running and observing source AST order `['ForgeLab.a', 'ForgeLab.b', 'ForgeLab.c']` (and one ad-hoc inline `runProjectValidation` check omitted `uiXsdPath` / `canonicalMd.read`, quickly caught by matching `server.ts`'s `loadProjectFromDisk` + `X4_REFERENCE_ROOT` / `X4_XSD_PATH` invocation).
- **Points to sustain:** Running live read-only `x4_ai_influence` cross-file checks right after code edits immediately caught both subtle static-analysis misses (`table.concat` `MemberExpression` check and `init()` wrapper false tag) before adding final tests or closing, and unmasked 4 genuine `AIChat.health_note` missing-register errors in `x4_ai_influence`.
- **Points to improve — work/approach:** When checking callee AST nodes (`Identifier` vs `MemberExpression`), always distinguish `node.type === 'Identifier'` before reading `.isLocal`, and test inline CLI scripts against exported `server.ts` / `loadProjectFromDisk` signatures first rather than guessing helper option bags.
- **Points to improve — tools:** Standalone validation selftests (`ui-manifest-integrity.selftest.ts`, `validation-noise.selftest.ts`) still fail implicitly or downgrade when `X4_XSD_PATH`/`X4_REFERENCE_ROOT` are toggled manually across `test:routes` runs; already logged in Forge QA Field Log.
- **Highest-risk evidenced weakness:** Treating any function body containing a nested `RegisterEvent` call as a forwarding registrar wrapper caused initializer routines (`init()`) to taint whole files; constraining `possibleRegistrarBindings` to parameterized functions whose same-scope body directly forwards a parameter (alongside direct alias propagation) eliminates initializer false positives cleanly.
- **Lessons banked:** In Lua static AST checks with `luaparse` (`scope: true`), `.isLocal` exists only on `Identifier` leaves, never on `MemberExpression` bases; wrapper-alias heuristics must check `nodeFnScope` and parameter flow rather than naive subtree text/call searches.
