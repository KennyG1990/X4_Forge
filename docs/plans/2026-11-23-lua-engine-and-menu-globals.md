# Grounded X4 9.00 Lua Engine & Menu-Environment Global Catalogue (#86)

Status: **VERIFIED (source / headless routes & oracles / live AiLive replay; installed IDE & public release remain open)**
Lane: **FULL**
Owner: [#86](https://github.com/KennyG1990/X4_Forge/issues/86), consumer prerequisite for [#61](https://github.com/KennyG1990/X4_Forge/issues/61#issuecomment-6774988939)
Baseline commit: `1c0d6fc72e4d9817426d879c897a2ac31bbf5c5e` (`HEAD` on isolated `main`, local ahead of `0.0.93`)

## PLAN

- **Bounded unit:** Replace the 27-entry hardcoded `X4_ENGINE_GLOBALS` list and add LuaJIT stdlib + menu-environment value globals in the shared Lua analyzer (`src/lib/luaStaticAnalysis.ts` + new curated data module `src/lib/x4LuaEngineGlobals.ts`), strictly grounded in the read-only unpacked X4 9.00 `ui/` corpus. Eliminate false `lua.undefined_global` diagnostics and unseeded-global gaps on real X4 engine C APIs, Anark UI runtime calls, `widget_fullscreen.lua` `AddGlobalAccess`/`MakeGlobalAvailable` exports, and menu-framework tables (`Color`, `ColorText`, `Menus`, `View`), while keeping typos, unregistered `tools/`, invalid manifests, explicit `nil` rebinds, dynamic environments, and non-callable table calls strictly bounded.
- **Assumptions:** X4 9.00 (`X4 unpacked 9.00/ui`) represents the authoritative shipped engine/UI Lua surface; vanilla `core/lua/unittests.lua` test callbacks (`TestCallback`) and misspelled/leaked lowercase locals in vanilla Lua (`activityolor`, `counteMeasureElement`, `hasImporantMails`, `isblocked`, etc.) must not be promoted into engine globals.
- **Authoritative references:**
  - Issue [#86](https://github.com/KennyG1990/X4_Forge/issues/86) (`#86` body + comments `6736089913` and `11/17/2026` `Color` contract) and [#61](https://github.com/KennyG1990/X4_Forge/issues/61#issuecomment-6774988939)
  - `docs/plans/2026-11-10-lua-runtime-scope-order.md`
  - Unpacked X4 9.00 (`G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00\ui`, read-only):
    - `ui/widget/lua/widget_fullscreen.lua` (SHA-256 `420AFBA33D925A7B55F2A82AB12773DF04826EF588317010D209B249DE7BAED1`): `MakeGlobalAvailable`, `AddGlobalAccess`, `SetEGOGlobals`, `Color`, `ColorText`
    - `ui/addons/ego_detailmonitorhelper/helper.lua` (SHA-256 `D24A08B8DA9F2C972794B60ACB48AE36F38CB026C991249DAB9F1164272D4DF2`): `Helper`, `Menus`
    - `ui/addons/ego_viewhelper/viewhelper.lua` (SHA-256 `B10446755C4C7129CDC4B7C210ABA5D78BBAB0EA6FCD8EF1C5DA0C9FE1977AE4`): `View`
    - `ui/core/addon.xsd` (SHA-256 `67D318EE4A6892905198519DF094B8ABE357C84751166E3BC4AF2EE19A826CCA`): `<environment type="menus">`
- **In scope:**
  - `src/lib/x4LuaEngineGlobals.ts`: structured, deduplicated sets of LuaJIT standard extensions (`bit`, `jit`, `newproxy`), X4 9.00 engine/Anark/`AddGlobalAccess`/`MakeGlobalAvailable` callables extracted and audited from `X4 unpacked 9.00/ui`, and non-callable menu-environment value tables (`X4_MENU_VALUE_GLOBALS`: `Color`, `ColorText`, `Menus`, `View`, `addonSystem`, `DebugConfig`, `Vector`, `Matrix`, `Rotation`).
  - `src/lib/luaStaticAnalysis.ts`: consume `LUAJIT_STANDARD_GLOBALS`, `X4_ENGINE_CALLABLE_GLOBALS`, and `X4_MENU_VALUE_GLOBALS`; seed `X4_MENU_VALUE_GLOBALS` ONLY in resolved `<environment type="menus">` scopes (`inventory.manifestStatus === 'known' && !mismatch`), preserving invalid-manifest exclusion, explicit `nil`/rebind boundaries, dynamic-environment clearing, and non-callable boundary when invoked as `Color()`.
  - Regression selftests inside `runLuaStaticAnalysisSelftest()` covering all reported AiLive globals (`ConvertStringToLuaID`, `ConvertIDTo64Bit`, `ConvertMoneyString`, `GetLibraryEntry`, `GetSubordinates`, `SetOrderParam`, `GetPlayerMoney`, `getElapsedTime`, `Color`, `Menus`, `View`), invalid manifest refusal of `Color`, calling `Color()` opaque boundary, `Color = nil` rebind boundary, dynamic `_G` boundary, and genuine typos (`Colro`, `GetWareDat`, `MissingGlobalCall`).
- **Out of scope:**
  - Parser grammar changes for trailing `;` (`break;`) in vanilla `helper.lua`/`menu_map.lua` (`x4LuaParser.ts` remains aligned with `LuaJIT` rules).
  - Dynamically resolved `require()` modules, `<savedvariable>` global inference, `ui.xml` `<dependency>` cross-extension symbol graphs (`#61` broader runtime scope), `lua_md.emit_verification_gap` (`#101`/`#61`), or installed IDE / VSIX / `git push` actions.
- **Files affected:** `src/lib/x4LuaEngineGlobals.ts` (new), `src/lib/luaStaticAnalysis.ts` (edit), `docs/plans/2026-11-23-lua-engine-and-menu-globals.md` (plan/close/AAR), and at close `BACKLOG.md` + `SESSION-HANDOFF.md`.
- **Risks & authorization boundaries:**
  - Promoting typos or vanilla local leaks (`activityolor`, `counteMeasureElement`, `buttonID`, etc.) or test-only callbacks (`TestCallback`) would hide real bugs; every symbol is filtered to audited callable engine/Anark/widget APIs or proven exported menu tables.
  - Read-only reads only on `X4 unpacked 9.00` and `x4_ai_influence`; no writes outside `G:\Forge-QA\forge-development`, no server/port/process churn, no `git push`.
- **Rollback:** `git checkout -- src/lib/luaStaticAnalysis.ts` and remove `src/lib/x4LuaEngineGlobals.ts` (plus plan/doc updates).
- **Acceptance criteria:**
  1. Valid `<environment type="menus">` scripts reading `Color`, `ColorText`, `Menus`, `View`, and calling vanilla X4/Anark/widget globals (`ConvertStringToLuaID`, `ConvertIDTo64Bit`, `ConvertMoneyString`, `GetLibraryEntry`, `GetSubordinates`, `SetOrderParam`, `GetPlayerMoney`, `getElapsedTime`, `AddGlobalAccess` & `MakeGlobalAvailable` exports, etc.) emit zero `lua.undefined_global` diagnostics and zero unseeded-global scope gaps for those symbols.
  2. Negative controls hold: (a) calling `Color()` / `Menus()` / `View()` retains an opaque-call scope gap (`lua.runtime_scope_unverified`); (b) invalid or absent `ui.xml` manifests do NOT grant `X4_MENU_VALUE_GLOBALS` (`Color` / `Menus` / `View` remain flagged); (c) `Color = nil` before a load-time read or dynamic `_G` mutation preserves load-order / rebound-seed boundaries; (d) typos (`Colro`, `GetWareDat`, `MissingGlobalCall`) still emit `lua.undefined_global`; (e) unlisted `tools/` globals stay outside runtime scope.
  3. Live read-only replay of `x4_ai_influence` (264 files) reduces `lua.undefined_global` from `16` to `0` without introducing any errors, warnings, or regressions in existing diagnostics or gaps.
- **Required validation methods:**
  - `npx eslint src/lib/luaStaticAnalysis.ts src/lib/x4LuaEngineGlobals.ts` (0 errors, no new warnings)
  - `npm run typecheck`
  - `npx tsx scripts/incremental-lua-selftest.ts`
  - `npx tsx scripts/validation-trust.selftest.ts`
  - `npx tsx scripts/finding-review.selftest.ts`
  - `npx tsx scripts/event-coverage-selftest.ts`
  - `npx tsx scripts/validation-noise.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`)
  - `npx tsx scripts/claude-validation-matrix.selftest.ts` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH`)
  - `npm run test:project-validation-overlay`
  - `npm run test:x4-ui-integration`
  - `npm run test:oracles`
  - `npm run test:routes` (with `X4_REFERENCE_ROOT` and `X4_XSD_PATH` unset!)
  - `npm run precommit:check`
  - Read-only `x4_ai_influence` full project validation replay (`errorCount === 0`, `lua.undefined_global === 0`)
- **Unavailable validation methods:** Live `FORGE DEVELOPMENT` IDE rendering (`0.0.89`), Open VSX packaged verification (`0.0.94`), and live X4 game execution remain held under Machine-State Ask / release gates.
- **Evidence locations:** `docs/plans/2026-11-23-lua-engine-and-menu-globals.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.

## BASELINE

- Revision: `1c0d6fc72e4d9817426d879c897a2ac31bbf5c5e` (`HEAD` clean, `git status --short` empty).
- Baseline checks (`task-3083` & `task-3000`):
  - `npx eslint src/lib/luaStaticAnalysis.ts`: 0 errors, 31 existing warnings (`@typescript-eslint/no-explicit-any`).
  - `npx tsx scripts/incremental-lua-selftest.ts`: PASS (`24/24`).
  - `npx tsx scripts/validation-trust.selftest.ts`: PASS (`50/50`).
  - `npx tsx scripts/finding-review.selftest.ts`: PASS (`25/25`).
  - Live read-only `x4_ai_influence` (`task-3000`): `16` `info:lua.undefined_global` false positives (`ConvertStringToLuaID` x3, `ConvertIDTo64Bit` x2, `GetLibraryEntry`, `GetSubordinates`, `SetOrderParam`, `Menus`, `Color` x3, `getElapsedTime`, `ConvertMoneyString`, `View`, `GetPlayerMoney`).

## RECONCILE

- **Resources searched:** `src/lib/luaStaticAnalysis.ts` (`X4_ENGINE_GLOBALS`, `LUA_STANDARD_GLOBALS`, `collectLuaFacts`, `analyzeRuntimeScopes`, `analyzeLuaFiles`, `runLuaStaticAnalysisSelftest`), `src/lib/x4UiSourceBundle.ts`, `src/lib/x4LuaParser.ts`, `src/lib/luaSnippets.ts`, `src/lib/modCompiler.ts`, `scripts/validation-trust.selftest.ts`, `scripts/incremental-lua-selftest.ts`, `scripts/finding-review.selftest.ts`, `docs/plans/2026-11-10-lua-runtime-scope-order.md`, and read-only `X4 unpacked 9.00/ui`.
- **Existing capability reused:** Extend `X4_ENGINE_GLOBALS`, `LUA_STANDARD_GLOBALS`, and `analyzeRuntimeScopes` in `src/lib/luaStaticAnalysis.ts`, backed by audited X4 9.00 constants in `src/lib/x4LuaEngineGlobals.ts`. No duplicate parser, route, or capability surface introduced.
- **Couplings checked:**
  - `validation-trust.selftest.ts` and `incremental-lua-selftest.ts` use synthetic names (`ConsumerProvider`, `ConsumerTypo`, `SharedThing`, `RegisteredMissing`, `MissingGlobalCall`, `OrderedGlobal`, `ToolOnly`, `GetWareDat`), none of which collide with X4 9.00 engine/UI globals.
  - `modCompiler.ts` checks `lua.undefined_global` via `runProjectValidation` / `analyzeLuaFiles`.
  - No hardcoded `globalAllowlistSize` numeric assertion exists in tests or production callers.
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT

- **Actual bounded changes (`src/lib/luaStaticAnalysis.ts` only):**
  - Added LuaJIT 2.1 standard globals (`bit`, `jit`, `newproxy`) into `LUA_STANDARD_GLOBALS`.
  - Expanded `X4_ENGINE_GLOBALS` from `27` entries to the full audited set of `520+` callable C/Anark/widget-shell engine globals (`AddGlobalAccess`, `MakeGlobalAvailable`, `SetEGOGlobals`, `ConvertStringToLuaID`, `ConvertIDTo64Bit`, `ConvertMoneyString`, `GetLibraryEntry`, `GetSubordinates`, `SetOrderParam`, `GetPlayerMoney`, `getElapsedTime`, `PlaySound`, `GetMacroData`, `GetControllerInfo`, etc.) derived read-only from unpacked X4 9.00 `ui/` (`addons/`, `widget_fullscreen.lua`, `core/lua/`), excluding `core/lua/unittests.lua`'s `TestCallback` and leaked/typo locals (`activityolor`, `counteMeasureElement`, `buttonID`, etc.).
  - Added `X4_MENU_VALUE_GLOBALS` (`Color`, `ColorText`, `DebugConfig`, `Matrix`, `Menus`, `Rotation`, `Vector`, `View`, `addonSystem`) seeded strictly inside resolved `<environment type="menus">` blocks (`inventory.manifestStatus === 'known' && !mismatch`) via `available.set(name, 'seed')` and shared `isMenuSeed` helper for deferred-read suppression (line 728) and rebound-seed / dynamic-environment gap reporting (line 732). Because `X4_MENU_VALUE_GLOBALS` stays outside callable `X4_ENGINE_GLOBALS`, calling `Color()` keeps its opaque-call boundary and invalid/absent manifests continue flagging unseeded menu globals.
  - Added `runtime_x4_900_engine_and_menu_globals_resolve_while_typos_and_calls_remain_bounded` in `runLuaStaticAnalysisSelftest()`.
- **Scope adjustment during implementation:** Initially split constants into `src/lib/x4LuaEngineGlobals.ts`; `capability-contract-audit` flagged the added `.ts` file against the pinned route-source boundary (`config/forge-route-dispositions.json`), so the pure data tables were folded into `src/lib/luaStaticAnalysis.ts` and `src/lib/x4LuaEngineGlobals.ts` was removed to avoid unnecessary route/policy churn. Additionally, live `x4_ai_influence` replay revealed a deferred read of `Color`/`Menus`/`View` after an earlier dynamic `_G` boundary at line 728 checking `!seed.has(event.name)` instead of `!isMenuSeed`; both line 728 and line 732 now share `isMenuSeed`.

## VALIDATE

All checks ran strictly AFTER the final edit (`Remove-Item src/lib/x4LuaEngineGlobals.ts` + inline constants in `src/lib/luaStaticAnalysis.ts`):
- `npx eslint src/lib/luaStaticAnalysis.ts` -> exit `0` (`0` errors, `31` pre-existing `@typescript-eslint/no-explicit-any` warnings)
- `npm run typecheck` -> exit `0` (`tsc --noEmit`)
- `npx tsx scripts/incremental-lua-selftest.ts` -> PASS `24/24`
- `npx tsx scripts/validation-trust.selftest.ts` -> PASS `50/50`
- `npx tsx scripts/finding-review.selftest.ts` -> PASS `25/25`
- `npx tsx scripts/event-coverage-selftest.ts` -> PASS `41/41`
- `npm run test:project-validation-overlay` -> PASS `24/24`
- `npm run test:x4-ui-integration` -> PASS `21/21`
- `npm run test:oracles` -> exit `0` (`[oracle-sweep] 134/134 green`)
- `npm run test:routes` (with `X4_XSD_PATH` and `X4_REFERENCE_ROOT` removed) -> exit `0` (`[route-integration] 624/624 PASS`)
- `npm run precommit:check` -> exit `0` (`action-receipt-coverage` PASS: `routeCount: 98, surfaceCount: 69`, `[precommit] OK`)
- Corpus / XSD checks (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` set):
  - `npx tsx scripts/validation-noise.selftest.ts` -> PASS (`reference 25/25`, `properties 112/112`, `crossFile 117/117`, `38` corpus assertions)
  - `npx tsx scripts/claude-validation-matrix.selftest.ts` -> PASS `34/34`
  - `npx tsx scripts/ui-manifest-integrity.selftest.ts` -> PASS `16/16`
  - Read-only live `x4_ai_influence` (`264` files + `canonicalMd` ready): `ok: true`, `flatCount: 496` (down from `512`), **`info:lua.undefined_global`: `16 -> 0`** (eliminated `ConvertStringToLuaID` x3, `ConvertIDTo64Bit` x2, `Color` x3, `Menus`, `View`, `getElapsedTime`, `ConvertMoneyString`, `GetLibraryEntry`, `GetSubordinates`, `SetOrderParam`, `GetPlayerMoney`), `0` errors/warnings; remaining gap counts untouched (`x4-ui.verification-gap: 217`, `lua.runtime_scope_unverified: 217`, `x4-ui.truncated-evidence: 43`, `lua_md.emit_verification_gap: 13`, `md_lua.registration_verification_gap: 3`, `scriptproperty.unresolved_type: 2`, `md_lua.payload_writer_unverified: 1`).
- **Negative / boundary results:** `Colro.bad()` flagged at line 9; `Color()` retains opaque-callable gap and `'partial'` stage; `Color = nil` and `_G` writes retain seed-rebound / dynamic-environment boundaries (while deferred post-boundary reads of `Color`/`Menus`/`View` suppress bogus `lua.undefined_global`); invalid `<addon` manifest still flags `Color`.

## REVIEW

- Grounded catalogue in `src/lib/luaStaticAnalysis.ts` covers all audited X4 9.00 engine/Anark/widget APIs -> **Done and evidenced**.
- `X4_MENU_VALUE_GLOBALS` scoped cleanly to resolved menu manifests via shared `isMenuSeed` -> **Done and evidenced**.
- Fresh-eyes diff check: single-file scope (`src/lib/luaStaticAnalysis.ts` only), zero new ESLint warnings, zero route/policy drift (`98 routes / 69 surfaces` unchanged) -> **Done**.
- Installed `FORGE DEVELOPMENT` IDE rendering (`0.0.89`), packaged `0.0.94` VSIX verification, dynamic `require()` resolution, and broader dependency scheduling -> **Open / Deferred** (`#86` & `#61` remain open for installed IDE & `0.0.94` gate).

## CLOSE

- **Status:** `VERIFIED` (source / headless routes & oracles / live read-only `x4_ai_influence` replay; `#86` remains open on GitHub until installed IDE & `0.0.94` verification).
- **Capability-map delta:** `no capability-map delta`.
- **Remaining risks / deferred work:** Dynamic `tools/` or cross-extension `ui.xml` `<dependency>` loading stays uninferred (`#61` / `#86` broader runtime scope); vanilla `break;` empty statements (`helper.lua:11098`, `menu_map.lua:11658`) stay intentionally excluded under Forge's `LuaJIT` parser alignment.
- **Suggested commit title:** `fix(lua): ground X4 9.00 engine and menu-environment globals in vanilla ui corpus (#86)`

## AAR

- **Triggers fired:**
  1. Initial helper module split (`src/lib/x4LuaEngineGlobals.ts`) failed `capability-contract-audit` due to the pinned route-source boundary.
  2. First live `x4_ai_influence` replay revealed `5` residual `lua.undefined_global` hits (`Color` x3, `Menus`, `View`) caused by deferred reads after an earlier dynamic `_G` boundary hitting line 728 (`!seed.has`) instead of `isMenuSeed`.
- **Points to sustain:** Extracting constants from the actual unpacked X4 9.00 `ui/` AST while explicitly excluding leaked lowercase globals/test callbacks avoided hiding real typos; replaying full 264-file `x4_ai_influence` caught the deferred-read branch immediately.
- **Points to improve — work/approach:** Inspect all `seed.has(...)` sites in `analyzeRuntimeScopes` before the first replay, and check `config/forge-route-dispositions.json` source-boundary rules before splitting pure constants into a new `src/lib/` file.
- **Points to improve — tools:** `capability-contract-audit` message names `"manifest source boundary differs..."` without printing the diff path unless invoked directly via script inspection; manageable by keeping pure rule data inside existing audited modules when zero routes change.
- **Highest-risk evidenced weakness:** `217` `lua.runtime_scope_unverified` and `3` `md_lua.registration_verification_gap` + `13` `lua_md.emit_verification_gap` advisories remain on `x4_ai_influence` due to dynamic `_G`/`require` boundaries and non-literal event emitters (`#61`/`#101`), keeping UI verification incomplete until project-check execution/coverage advances.
- **Lessons banked:** Project-level: when adding static data tables imported by validation layers, either co-locate inside the existing audited `src/lib/` module or explicitly plan a route-disposition promotion; always check every `seed.has` / seed-rebind branch (both eager line 732 and deferred line 728) when adding scoped seed tables.
