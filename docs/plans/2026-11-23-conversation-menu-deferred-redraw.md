# Conversation-Triggered UI Menu Deferred-Redraw Rule (#62 / FF-23)

**Status:** `VERIFIED` (Dev source, selftest, HTTP oracle/route suites & read-only `x4_ai_influence` A/B replay; `#62` remains `in_progress` pending `0.0.94` packaged/installed qualification)
**Owner:** GitHub `#62` (`FF-23`, related `#61`)
**Lane:** `FULL`

## PLAN
- **Bounded unit:** Add deterministic cross-file warning rule `md_lua.conversation_menu_without_deferred_redraw` in `src/lib/projectCrossFileValidation.ts` (plus specific diagnostic explanation in `src/lib/diagnosticExplain.ts`) that traces `<event_conversation_started>` cues (directly and transitively through `<run_actions>`/`<include_actions>` libraries) -> `<raise_lua_event>` -> `RegisterEvent` -> `OpenMenu` to project UI menu definitions, flagging any conversation-opened UI menu that never schedules/executes a deferred redraw after its initial `display` (`"drawn under the conversation menu - add a deferred redraw"`).
- **Assumptions & References:**
  - Issue `#62` (`FF-23`): In X4 9.00, an `OpenMenu` UI overlay opened in the same frame as a starting native conversation (`<event_conversation_started>`) is drawn underneath the native conversation menu, causing clicks or `Return` keys to hit and cancel the conversation (`g_cancel`). Re-drawing once after open (e.g. `~0.3 s` later in `menu.onUpdate`, as in `x4_ai_influence` `ui/addons/ai_influence_chat/aic_menu.lua:143,154,2606`) lifts the overlay above the conversation menu.
  - Pre-fix `aic_menu.lua` already had `menu.onUpdate` with conditional redraws for async/external events (`menu._cardDirty`, `menu._fillLine`, `menu._payArmed`) that are NOT unconditionally armed on open; the rule must distinguish open-armed deferred redraws (`menu._liftAt`, `menu._redrawAt`, `menu._needsRedraw`, or unconditional tick redraws) from unrelated conditional redraws in `onUpdate`.
- **In scope:**
  - `src/lib/projectCrossFileValidation.ts`: add `'md_lua.conversation_menu_without_deferred_redraw'` to `ProjectCrossFileFindingCode`, implement `validateConversationMenuRedraw(mdFiles, luaFiles)`, wire into `validateProjectCrossFile`, and add positive/negative unit tests in `runProjectCrossFileSelftest()`.
  - `src/lib/diagnosticExplain.ts`: add specific guidance for `md_lua.conversation_menu_without_deferred_redraw` (and cover `md_lua.*` bridge codes cleanly) + selftest assertion in `runDiagnosticExplainSelftest()`.
- **Out of scope:** Modifying `AiLive` on disk, changing error-blocking deploy status (`severity: 'warning'`), touching `FORGE DEVELOPMENT` IDE (`PID 34076`), X4 install/saves, or pushing/publishing.
- **Risks & Rollback:**
  - Risk 1: False positives on menus NOT opened from `<event_conversation_started>` (e.g. HUD/hub/sheet/proclaim menus opened from `event_ui_triggered` or Lua clicks), or bleeding `<event_conversation_started>` into nested child `<cues>`. Mitigated by restricting MD condition/action walks to each cue's own `<conditions>` and `<actions>` (excluding nested `<cues>`/`<cue>`/`<library>`) and requiring a resolved `<event_conversation_started>` -> `<raise_lua_event>` -> `RegisterEvent` -> `OpenMenu` chain.
  - Risk 2: Missing pre-fix `aic_menu.lua` because `onUpdate` contains unrelated `if menu._cardDirty then menu.display() end`. Mitigated by tracking sequential top-level non-`nil`/non-`false` menu field writes on the open path (`armedOnOpen`, deleting fields reset to `nil`/`false` like `menu._openRequested = false`) and requiring an `onUpdate` redraw branch whose guard conjuncts read only `armedOnOpen` dynamic menu fields (supporting predicate helpers like `menu.liftDue`).
  - Rollback: Revert this single commit against `9895fe8`.
- **Acceptance Criteria:**
  1. Fires `warning` `md_lua.conversation_menu_without_deferred_redraw` (with `"drawn under the conversation menu - add a deferred redraw"`, Lua menu location, and MD `target` location) on:
     - a conversation-opened UI menu with no `onUpdate` or no `display` in `onUpdate`,
     - a conversation-opened UI menu whose `onUpdate` only redraws on un-armed/reset flags (`_cardDirty`, `_openRequested = false`), and
     - an in-memory pre-fix copy of `x4_ai_influence` (`aic_menu.lua` with `menu._liftAt` arming removed).
  2. Emits `0` `md_lua.conversation_menu_without_deferred_redraw` warnings on:
     - unmodified post-fix `x4_ai_influence` (`264` files + `canonicalMd`),
     - conversation-opened menus using timer/flag deferred redraws in `onUpdate`, unconditional `onUpdate` redraws, or timer callbacks, and
     - menus opened from non-conversation events (`event_ui_triggered`, `event_game_loaded`, `check="false"`, or nested child cues).
  3. `explainDiagnostic` returns dedicated guidance for `md_lua.conversation_menu_without_deferred_redraw`.
  4. All required post-edit validation suites pass cleanly.
- **Required Validation & Negative Paths:**
  - `npx eslint src/lib/projectCrossFileValidation.ts src/lib/diagnosticExplain.ts` (`0` errors)
  - `npm run typecheck` (`0` errors)
  - `runProjectCrossFileSelftest()` & `runDiagnosticExplainSelftest()`
  - `npx tsx scripts/event-coverage-selftest.ts`
  - `npx tsx scripts/validation-trust.selftest.ts`
  - `npx tsx scripts/finding-review.selftest.ts`
  - `npx tsx scripts/validation-noise.selftest.ts` (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` set)
  - `npx tsx scripts/claude-validation-matrix.selftest.ts` (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` set)
  - Read-only `x4_ai_influence` A/B replay (post-fix `0` hits vs in-memory pre-fix `1` hit on `aic_menu.lua`)
  - `npm run test:oracles` (`134/134`, `X4_*` unset)
  - `npm run test:routes` (`634/634`, `X4_*` unset)
  - `npm run precommit:check` (`[precommit] OK`, `X4_*` unset)
- **Evidence Locations:** `docs/plans/2026-11-23-conversation-menu-deferred-redraw.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`, Notion **Forge QA Field Log** (`4124618ed15b8131bdd5ff6aabefbd6d`).

## BASELINE
- Commit: `9895fe8` on `main` in `G:\Forge-QA\forge-development`, clean working tree.
- Baseline `x4_ai_influence` (`264` files): `0` `md_lua.conversation_menu_without_deferred_redraw` findings exist because no rule checks conversation-opened `OpenMenu` menus (`#62`).

## RECONCILE
- Searched `src/lib/projectCrossFileValidation.ts`, `src/lib/luaStaticAnalysis.ts`, `src/lib/mdCritic.ts`, `src/lib/x4UiLint.ts`, and `src/lib/diagnosticExplain.ts`.
- Confirmed `luaStaticAnalysis.ts` checks single-addon `lua.menu_never_opened` and `lua.helper_cached_at_load` without MD event context, while `projectCrossFileValidation.ts` owns MD `<->` Lua event wiring (`parseMdScriptRoot`, `buildMdLibraryIndex`, `resolveMdLibraryReference`, `collectMdStringResults`, `parseX4Lua`, `collectLuaLexicalScopes`). Extending `projectCrossFileValidation.ts` reuses both XML library resolution and Lua AST infrastructure without duplicating parsers.
- Verified couplings: `src/server/projectValidation.ts:1193` flattens `result.crossFile.findings` directly into `FlatProjectDiagnostic[]` with `sourceRef`, `line`, `column`, `target`; `src/lib/diagnosticExplain.ts` maps codes to `DiagnosticExplanation`.
- Capability-map delta: `no capability-map delta` (adds deterministic cross-file diagnostic rule to existing validation surface).

## IMPLEMENT
- `src/lib/projectCrossFileValidation.ts`:
  - Added `'md_lua.conversation_menu_without_deferred_redraw'` to `ProjectCrossFileFindingCode`.
  - Implemented `collectConversationStartedLuaEvents(mdFiles)` (fast-path exit when `'event_conversation_started'` is absent; scopes `<conditions>` and `<actions>` to each `<cue>` without descending into nested `<cues>`/`<cue>`/`<library>`, ignoring `check="false"`, and transitively resolving `<run_actions>`, `<include_actions>`, and `<signal_cue_instantly>` via `buildMdLibraryIndex` + `resolveMdLibraryReference`).
  - Implemented `validateConversationMenuRedraw(mdFiles, luaFiles)` (discovers project UI menu definitions across global/local aliases and constructor/member assignments, distinguishes top-level constants from function-mutated fields, traces `RegisterEvent` direct/`pcall`/alias/forwarding-wrapper handlers and up to 2 local hops to `OpenMenu` / `<menu>.open` across `rawget(_G, ...)` and `Menus` lookups, computes `armedOnOpen` sequentially while clearing fields reset to `nil`/`false` and rejecting maybe-`nil` `... or nil` writes, and verifies `onUpdate` redraw conditions including single-return predicate methods like `menu.liftDue` and inverted guard-returns).
  - Wired `validateConversationMenuRedraw(mdFiles, luaFiles)` into `validateProjectCrossFile` and added 4 positive/negative unit assertions in `runProjectCrossFileSelftest()`.
- `src/lib/diagnosticExplain.ts`:
  - Added dedicated explanation entry for `md_lua.conversation_menu_without_deferred_redraw` (and aligned `md_lua.*` bridge matching alongside `lua_md.*`), plus 2 selftest checks in `runDiagnosticExplainSelftest()`.

## VALIDATE
- `npx eslint src/lib/projectCrossFileValidation.ts src/lib/diagnosticExplain.ts` -> exit `0` (`0` errors, `0` warnings).
- `npm run typecheck` -> exit `0` (`tsc --noEmit`).
- `runDiagnosticExplainSelftest()` -> `22/22 PASS`.
- `runProjectCrossFileSelftest()` -> `121/121 PASS`.
- `npx tsx scripts/event-coverage-selftest.ts` -> `48/48 PASS`.
- `npx tsx scripts/validation-trust.selftest.ts` -> `50/50 PASS`.
- `npx tsx scripts/finding-review.selftest.ts` -> `25/25 PASS`.
- `npx tsx scripts/validation-noise.selftest.ts` (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` set) -> `25/25 + 112/112 + 121/121 + 38 PASS`.
- `npx tsx scripts/claude-validation-matrix.selftest.ts` (`X4_REFERENCE_ROOT` & `X4_XSD_PATH` set) -> `34/34 PASS`.
- Read-only `x4_ai_influence` (`271` files) A/B replay (`task-4169`):
  - Current post-fix `aic_menu.lua`: **`0` findings** (`22.9 s`).
  - In-memory pre-fix `aic_menu.lua` (`menu._liftAt = ...` stripped in memory only): **`1` warning** `md_lua.conversation_menu_without_deferred_redraw` at `ui/addons/ai_influence_chat/aic_menu.lua:108:1` (`sourceRef: "AIChat.open->X4_Terminal"`, `target: { file: "md/ai_influence_chat.xml", line: 3693, column: 31 }`, message containing `"drawn under the conversation menu - add a deferred redraw"`).
- `npm run test:oracles` (`X4_*` unset, `task-4173`) -> `134/134 PASS` (`diagnostic-explain-selftest 22/22`, `project-crossfile-selftest 121/121`).
- `npm run test:routes` (`X4_*` unset, `task-4173`) -> `634/634 PASS`.
- `npm run build` (`task-4173`) -> exit `0`.
- `npm run precommit:check` (`task-4173`) -> `[precommit] OK` (`98/69`, `tsc --noEmit` `0`).

## REVIEW
- Direct & transitive `<event_conversation_started>` -> `<raise_lua_event>` -> `RegisterEvent` -> `OpenMenu` warning emitted with required remediation text -> **Done & evidenced**.
- Distinguishes open-armed deferred redraw (`_liftAt` + `liftDue`) from unrelated async/external `onUpdate` redraws (`_cardDirty`, `_fillLine`, `_payArmed`, `nh and menu.active`) and reset flags (`_openRequested = false`) -> **Done & evidenced** (`x4_ai_influence` A/B replay `0` vs `1` hit + selftests).
- Non-conversation events (`event_ui_triggered`, `check="false"`, nested child `<cue>`) excluded -> **Done & evidenced**.
- `explainDiagnostic` guidance registered and verified -> **Done & evidenced** (`22/22`).
- Packaged/installed IDE qualification -> **Deferred** to `0.0.94` release gate.

## CLOSE
- **Status:** `VERIFIED` (Dev source, selftest, HTTP oracle/route suites & read-only `x4_ai_influence` A/B replay; `#62` stays open in `BACKLOG.md` pending `0.0.94` installed/release qualification).
- **Capability-map delta:** `no capability-map delta`.
- **Commit title:** `feat(validation): flag conversation-triggered UI menus lacking a deferred redraw (#62)`

## AAR
- **Triggers:** Scratch ESM `.mts` script in `G:\Forge-QA\temp` initially used a bare Windows path (`G:/...`) instead of `file:///G:/...` (resolved immediately by switching to `.ts` + `file:///`).
- **Points to sustain:** Reading the full live `aic_uix.lua` (`onOpenCommLink = function(...)`, shadowed local `RegisterEvent` wrapper, `termMenu._pendingInitial = ... or nil`) and full `aic_menu.lua:2576-2702` (`if nh and menu.active`, `if ... and menu.display`, `_cardDirty`, `_fillLine`) BEFORE coding prevented four subtle false-positive/false-negative traps on the first implementation pass.
- **Points to improve — work/approach:** Always use `.ts` + `file:///G:/Forge-QA/forge-development/...` URLs for disposable `G:\Forge-QA\temp` probe scripts under Node 24 ESM.
- **Points to improve — tools:** None required.
- **Highest-risk observed weakness:** Cross-file Lua menu resolution is intentionally bounded to literal menu names, `rawget(_G, "GlobalMenu")` / global tables, and literal `m.name == "..."` loop lookups; dynamically computed menu names will be skipped conservatively rather than guessed.
