# Raw Engine IDs in Player-Visible Text (#58)

Status: `VERIFIED` (Dev source, `134/134` oracles, `643/643` HTTP routes, and X4 9.00 + `x4_ai_influence` A/B replays; installed IDE pending `0.0.94` release gate)
Date: `2026-11-23`
Issue: GitHub `#58` (`Lint: raw engine ids (faction/ware ids) reaching player-visible text pass validation`)
Lane: `FULL`

## PLAN

- **Bounded unit:** Deliver both layers requested by `#58` without introducing mod-specific hardcoding:
  1. **Static layer:**
     - `lua.raw_engine_id_in_player_text` (`severity: 'warning'`, `layer: 'x4'` in `src/lib/luaStaticAnalysis.ts`): detect display-name-to-ID fallbacks (`<expr>.<nameField> or <idExpr>`, e.g. `sess.fname or sess.fac`, `c.wname or c.ware`, `(A._strat[fac] or {}).name or fac`, `p.on or p.o`), raw faction/ware/macro ID concatenations into player-visible UI/comm/notification/logbook sinks (`message =`, `title =`, `text =`, `body =`, `note =`, `sender =`, `mouseOverText =`, `notify(`, `showNotification(`, `createText(`, `createButton(`, `setText(`, `AddLogbookEntry(`, display-list appends), and local/helper-carried raw ID prose, while honoring comments, debug/log lines (`DebugError`, `log`, `print`, etc.), wire keys (`:`, `=`, `|`, `~`), comparisons, display-lookup helpers (`FactionName`, `GetFactionData`, `GetWareData`, `GetMacroData`, etc.), explicit `-- rawid-ok: <reason>` opt-outs, and cross-file MD-proven display-name event payload fields (`<raise_lua_event>` setting `key=` exclusively from `.name`/`.knownname`).
     - `md_pitfall.raw_engine_id_in_player_text` (`severity: 'warning'` in `src/lib/mdPitfallLints.ts`): detect `<write_to_logbook>`, `<show_notification>`, `<show_help>`, and `<write_incoming_message>` `@text`/`@title`/`@custom`/`@source` expressions concatenating `.id` / `.owner.id` / `.trueowner.id` / `.macro.id` / `.faction.id` (excluding `.idcode`) or local `$var`s whose `<set_value>` assignments in that file are exclusively `.id` reads, recommending `.knownname` / `.name`.
     - Deterministic explanations in `src/lib/diagnosticExplain.ts` for both static codes.
  2. **Runtime layer:**
     - Canonical-corpus prose leak detection (`detectRawEngineIdsInProse` in `src/lib/runtimeDebugger.ts`, consumed by `parseRuntimeCandidateBatch` / `analyzeRuntimeDebugger`, `RuntimeDebuggerAdapter`, `analyzeLuaRuntimeLog`, and `POST /api/agent/log-diagnose`) using canonical factions and wares from `getCanonicalReferenceCorpus()` (`32` bare faction IDs + `1,902` ware IDs in X4 9.00), flagging bare lowercase canonical IDs used as words in prose (`"cannot sign for civilian"`, `"with loanshark"`, `"200 hullparts"`) while excluding capitalized display names, articles + attributive adjectives (`"for civilian ships"`), common uncountable English words (`"credits"`, `"crew"`, `"water"`, `"player"`), FileIO/signature lines, stack frames, and `key=value`/path tokens, and correlating leaked prose back to its Lua/MD source file and line.
- **Assumptions:**
  - Static findings are advisory `warning`s (never flipping structural `ok`, participating normally in `forge.rules.json` / deploy-verify zero-unreviewed-warning policy).
  - Runtime incidents use `kind: 'raw_engine_id_in_player_text'`, `isEngineFailure: false`, `severity: 'warning'` so they surface prominently above `info` telemetry without falsely marking the mod `loaded_with_errors`.
- **Authoritative references:**
  - GitHub `#58` specification (`2026-10-27` live `"<name> cannot sign for civilian"` defect).
  - Unpacked X4 9.00 corpus (`G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`: `libraries/factions.xml`, `libraries/wares.xml`, `t/0001-l044.xml`, `362` vanilla + DLC `md/*.xml`).
  - Read-only `x4_ai_influence` corpus (`37` `md/*.xml`, `160+` `ui/**/*.lua`) and `tools/playertextgate_test.py` (`R1` & `R5` probes).
- **In scope:**
  - `src/lib/luaStaticAnalysis.ts`
  - `src/lib/mdPitfallLints.ts`
  - `src/server/projectValidation.ts`
  - `src/lib/diagnosticExplain.ts`
  - `src/lib/runtimeDebugger.ts`, `src/lib/runtimeDebuggerView.ts`, `src/lib/runtimeDebugSession.ts`, `src/server/runtimeDebuggerAdapter.ts` (`RUNTIME_DEBUGGER_ANALYZER_POLICY_VERSION` `7 -> 8`)
  - `src/lib/luaRuntimeLog.ts`
  - `server.ts` (`runtimeDebuggerAdapter` `referenceVocabulary` injection + `/api/agent/log-diagnose` `rawEngineIdLeaks` / hypothesis)
  - Focused selftests and `scripts/route-integration.mjs` HTTP coverage.
- **Out of scope:**
  - Modifying `AiLive` (`aic_supply.lua:402` remains untouched in `AiLive` per strict read-only boundary).
  - Pushing commits, publishing VSIX, or restarting `FORGE DEVELOPMENT` IDE.
- **Risks and authorization boundaries:**
  - False positives on ordinary English words (`civilian`, `criminal`, `water`, `credits`, `player`) or MD-proven display fields (`aic_aid.lua` `p.fac`): mitigated via corpus grounding before implementation (`0` hits on `362` vanilla MD files; `0` faction hits + `1` genuine ware fallback hit at `aic_supply.lua:402` on `x4_ai_influence`).
  - Cache-key staleness in `projectValidation.ts` (`projectLuaFacts`) when MD `<raise_lua_event>` changes without Lua edits: mitigated by binding the serialized MD-proven display-field map into the `projectLuaFacts` cache key.
  - Zero new durable writers or new HTTP routes; existing route dispositions and receipt coverage stay valid.
- **Rollback/checkpoint:**
  - Clean Git `HEAD` at `0fb55f9` on `main` (`G:\Forge-QA\forge-development`).
- **Acceptance criteria:**
  1. `lua.raw_engine_id_in_player_text` catches all planted `P1..P1h` and real-file `T1..T10` faction leaks plus ware/macro leaks (`c.wname or c.ware`, `notify("Need " .. wareid)`), while reporting `0` findings on `ok.lua` (logs, comments, display helpers, wire keys, comparisons, `-- rawid-ok: <reason>`, and MD-proven `.name`/`.knownname` fields) and lapsing immediately when MD switches `|fac=` from `.name` to `.id`.
  2. `md_pitfall.raw_engine_id_in_player_text` catches `<write_to_logbook>`, `<show_notification>`, `<show_help>`, and `<write_incoming_message>` concatenating `.id` / `.owner.id` / `.trueowner.id` / `.macro.id` / `.faction.id` or single-purpose `.id` `$var`s, while reporting `0` findings on `.knownname`, `.name`, `.idcode`, and all `362` vanilla + DLC X4 9.00 MD files.
  3. Runtime debugger (`analyzeRuntimeDebugger`, `RuntimeDebuggerAdapter`, `GET /api/agent/runtime-debugger`, `POST /api/agent/log-diagnose`, and `analyzeLuaRuntimeLog`) detects bare canonical faction and ware IDs in prose (`"Viv Otani cannot sign for civilian"`, `"brokered with loanshark for 200 hullparts"`), attributes and maps unique prose emitters to their exact Lua/MD `file` and `line`, keeps `severity: 'warning'` (`isEngineFailure: false`), and ignores capitalized names, `key=value` telemetry (`civilian=Civilian`), FileIO notices, and attributive adjectives (`"for civilian ships"`).
  4. All selftests, `eslint`, `typecheck`, `test:capabilities`, `test:writers`, `test:oracles`, `test:routes`, `npm run build`, and `precommit:check` pass.
- **Required validation and negative path:**
  - Unit selftests: `runLuaStaticAnalysisSelftest`, `runMdPitfallSelftest`, `runProjectValidationSelftest`, `runDiagnosticExplainSelftest`, `runRuntimeDebuggerSelftest`, `runRuntimeDebuggerViewSelftest`, `runRuntimeDebuggerAdapterSelftest`, `runLuaRuntimeLogSelftest`.
  - Corpus & A/B replay: `362` vanilla X4 9.00 MD files (`0` hits) + `x4_ai_influence` read-only project validation & planted-probe A/B replay.
  - Negative checks: `civilian=Civilian` telemetry, `"for civilian ships"`, `"Paid 500 credits to the player"`, `.idcode`, `-- rawid-ok: reason`, and incremental cache invalidation when MD changes `.name` -> `.id`.
  - Integration & full gates: `eslint`, `typecheck`, `test:capabilities`, `test:writers`, `test:oracles`, `test:routes`, `npm run build`, `precommit:check`.
- **Evidence locations:**
  - Durable close & AAR in this file (`docs/plans/2026-11-23-raw-engine-id-player-text-lint.md`), `BACKLOG.md`, `SESSION-HANDOFF.md`, and Notion Forge QA Field Log (`4124618ed15b8131bdd5ff6aabefbd6d`).

## BASELINE

- **Revision/version:** `0fb55f9` on `main` (`G:\Forge-QA\forge-development`, clean working tree).
- **Existing changes/failures/runtime state:** Clean working tree; `route-integration` baseline `641/641 PASS`, `test:oracles` `134/134 PASS`; `362` vanilla X4 9.00 MD files and `37` `x4_ai_influence` MD files scanned at baseline (`0` MD hits; `1` real ware-ID fallback at `x4_ai_influence/ui/addons/ai_influence_chat/aic_supply.lua:402`).

## RECONCILE

- **Resources and readers/writers searched:**
  - `src/lib/luaStaticAnalysis.ts` (`analyzeLuaFiles`, `LuaStaticFinding`, `runLuaStaticAnalysisSelftest`)
  - `src/lib/mdPitfallLints.ts` (`lintMdPitfalls`, `MdPitfallFinding`, `runMdPitfallSelftest`)
  - `src/server/projectValidation.ts` (`runProjectValidation`, `projectLuaFacts` cache key, `flattenProjectValidationRaw`, `runProjectValidationSelftest`)
  - `src/lib/diagnosticExplain.ts` (`GUIDANCE`, `runDiagnosticExplainSelftest`)
  - `src/lib/runtimeDebugger.ts`, `src/lib/runtimeDebuggerView.ts`, `src/lib/runtimeDebugSession.ts`, `src/server/runtimeDebuggerAdapter.ts`, `src/lib/luaRuntimeLog.ts`, `src/server/referenceRoutes.ts` (`getCanonicalReferenceCorpus`), `server.ts` (`runtimeDebuggerAdapter`, `/api/agent/log-diagnose`)
- **Existing capability reused:**
  - Shared `runProjectValidation` / `flattenProjectValidation` diagnostic pipeline, `getCanonicalReferenceCorpus()` faction/ware catalogs, `RuntimeDebuggerAdapter` incident persistence & policy-version reanalysis (`RUNTIME_DEBUGGER_ANALYZER_POLICY_VERSION`), and `findAuthoredEmitterLocations` / `mapRuntimeCandidateToSource` source mapping.
- **Couplings checked:**
  - `projectLuaFacts` cache key in `src/server/projectValidation.ts` must bind MD-proven display-name event fields so MD edits invalidate cached Lua findings.
  - `runtimeDebuggerView.ts` (`nonFailureClassification`), `runtimeDebugSession.ts` (`incidentRetentionPriority`), and `runtimeDebuggerAdapter.ts` (`isGovernedAuthoredMarker`, `positiveExecutionEvidence`, `runtimeIncidentPriority`, `RUNTIME_DEBUGGER_ANALYZER_POLICY_VERSION` `7 -> 8`) must agree that `raw_engine_id_in_player_text` is a non-engine-failure `warning`.
- **Capability-map delta:** `no capability-map delta` (extends existing static validation, runtime debugger, and log-diagnose capabilities).
- **Plan changes:** Grounding against `x4_ai_influence` confirmed `aic_reachout.lua` stores display names in `a.ware` (`wid` holds the ID) while `aic_supply.lua:402` has a genuine `c.wname or c.ware` fallback; refined bare-`ware`/`macro` matching so `wname or ware` and `wareid`/`wid`/`macroid` flag accurately without false alarms on display-string `a.ware` fields, and generalized cross-file MD `<raise_lua_event>` `.name`/`.knownname` proof so `aic_aid.lua` `p.fac`/`p.afac` is proven without any mod-specific list.

## IMPLEMENT

- **Actual bounded changes:**
  1. **Static Lua (`src/lib/luaStaticAnalysis.ts`, `src/server/projectValidation.ts`):**
     - Added `lua.raw_engine_id_in_player_text` (`layer: 'x4'`, `severity: 'warning'`) via `scanGroupRawEngineIdInPlayerText` and cross-file `collectMdEventFieldDisplayProof`, binding serialized MD display-name proofs into `projectLuaFacts` cache keys in `src/server/projectValidation.ts`.
     - Added unit selftests in `runLuaStaticAnalysisSelftest()` (`75/75`) and `runProjectValidationSelftest()` (`67/67`).
  2. **Static MD (`src/lib/mdPitfallLints.ts`) & Explanations (`src/lib/diagnosticExplain.ts`):**
     - Added `md_pitfall.raw_engine_id_in_player_text` (`severity: 'warning'`) via `lintMdRawEngineIdInPlayerText` across `<write_to_logbook>`, `<show_notification>`, `<show_help>`, and `<write_incoming_message>` `@text`/`@title`/`@custom`/`@source` (masking quoted literals, flagging `.id`/`.owner.id`/`.trueowner.id`/`.macro.id`/`.faction.id` and single-purpose `.id` `$var`s while excluding `.idcode`), plus `runMdPitfallSelftest()` checks (`115/115`).
     - Added deterministic remediation guidance for both codes in `src/lib/diagnosticExplain.ts` (`23/23`).
  3. **Runtime Layer (`src/lib/runtimeDebugger.ts`, `src/lib/runtimeDebuggerView.ts`, `src/lib/runtimeDebugSession.ts`, `src/server/runtimeDebuggerAdapter.ts`, `src/lib/luaRuntimeLog.ts`, `server.ts`, `scripts/route-integration.mjs`):**
     - Added `WeakMap`-compiled `detectRawEngineIdsInProse` and `findPlayerTextLeakLocations` in `src/lib/runtimeDebugger.ts` (`kind: 'raw_engine_id_in_player_text'`, `isEngineFailure: false`, `severity: 'warning'`), wired canonical `getCanonicalReferenceCorpus()` factions & wares into `RuntimeDebuggerAdapter` (`RUNTIME_DEBUGGER_ANALYZER_POLICY_VERSION` `7 -> 8`), `analyzeLuaRuntimeLog`, and `POST /api/agent/log-diagnose`, and added selftests (`68/68`, `15/15`, `50/50`, `16/16`) + 2 HTTP checks in `scripts/route-integration.mjs` (`643/643`).
- **Scope changes and reasons:** None.

## VALIDATE

- **`runLuaStaticAnalysisSelftest`:** `75/75 PASS`
- **`runMdPitfallSelftest`:** `115/115 PASS`
- **`runProjectValidationSelftest`:** `67/67 PASS` (including incremental cache invalidation when MD `<raise_lua_event>` switches `.name` -> `.id`)
- **`runDiagnosticExplainSelftest`:** `23/23 PASS`
- **`runRuntimeDebuggerSelftest`:** `68/68 PASS`
- **`runRuntimeDebuggerViewSelftest`:** `15/15 PASS`
- **`runRuntimeDebuggerAdapterSelftest`:** `50/50 PASS`
- **`runLuaRuntimeLogSelftest`:** `16/16 PASS`
- **X4 9.00 vanilla + DLC MD corpus (`362` files):** `0` false positives (`vanillaMd (362 files) raw_engine_id_in_player_text hits: 0`).
- **Read-only `x4_ai_influence` (`266` project files) static + runtime A/B replay:**
  - `md_pitfall.raw_engine_id_in_player_text`: `0` hits on current `x4_ai_influence`.
  - `lua.raw_engine_id_in_player_text`: `0` false positives across `160+` Lua files (including MD-proven `aic_aid.lua` `p.fac`/`p.afac`), `1` genuine live ware-ID fallback caught at `ui/addons/ai_influence_chat/aic_supply.lua:401` (`ware = c.wname or c.ware`), and `1` exact hit at `ui/addons/ai_influence_chat/aic_negsign.lua:113` when pre-`#85` `sess.fname or sess.fac` is planted in memory.
  - Runtime live-defect replay (`"[=ERROR=] 88.0 [AICHAT][NEG] Viv Otani cannot sign for civilian - only their representative can; they keep no council to carry terms to."` against `266`-file manifest + X4 9.00 canonical corpus): `confirmed_active` mapped directly to `ui/addons/ai_influence_chat/aic_negsign.lua:140`.
- **Negative-path checks:** Verified `0` hits on `civilian=Civilian` telemetry, `"Scanning for civilian ships carrying water and 500 credits for the player."`, capitalized `"Civilian"`, `.idcode`, `-- rawid-ok: <reason>`, and debug/log lines.
- **Full repository gates:**
  - `npm run typecheck`: `PASS` (`0` errors)
  - `npx eslint` on all 10 modified files: `PASS` (`0` errors, `0` new warnings)
  - `npm run test:capabilities`: `PASS` (`25` capabilities, `319` routes)
  - `npm run test:writers`: `PASS` (`30/30` selftest, `0` raw call count deltas, `sourceFingerprint` unchanged `9090a2be...`, `8/8` durableWrite)
  - `npm run test:action-receipt-coverage`: `PASS` (`98` routes, `69` surfaces)
  - `npm run test:oracles`: `134/134 green`
  - `npm run test:routes` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH` unset): `643/643 PASS`
  - `npm run build` & `npm run precommit:check`: `[precommit] OK`

## REVIEW

- Static Lua lint (`fac`, `facid`, `faction`, `*id`, `ware`, `macro`, `x or id` fallback, player-visible sinks, remediation guidance) -> **done** (`lua.raw_engine_id_in_player_text`).
- Static MD lint (logbook, notification, help, incoming message concatenating `.id` or single-purpose `.id` `$var`s) -> **done** (`md_pitfall.raw_engine_id_in_player_text`).
- Runtime prose canonical-ID scanner using canonical `/api/reference/factions` & `/api/reference/wares` corpus with source-line correlation -> **done** (`detectRawEngineIdsInProse`, `analyzeRuntimeDebugger`, `RuntimeDebuggerAdapter`, `analyzeLuaRuntimeLog`, `/api/agent/log-diagnose`).
- Installed `FORGE DEVELOPMENT` IDE & public `0.0.94` delivery -> **deferred** to the `0.0.94` release gate pending Ken's Machine-State Ask + Write Gate.

## CLOSE

- **Status:** `VERIFIED` (Dev source & isolated runtime; `#58` stays `in_progress` in `BACKLOG.md` pending `0.0.94` installed IDE qualification).
- **Remaining risks/deferred work:** Packaged/installed `FORGE DEVELOPMENT` IDE verification (`0.0.89 -> 0.0.94`) awaits Ken's Machine-State Ask; `AiLive`'s real ware-ID fallback at `ui/addons/ai_influence_chat/aic_supply.lua:402` (`ware = c.wname or c.ware`) was left untouched per strict read-only scope and recorded for Claude.
- **Suggested commit title:** `feat(validation): detect raw engine IDs in player-visible Lua, MD, and runtime prose (#58)`

## AAR

- **Triggers:** Single-line Lua function `return` regex (`/^\s*return\b/` -> `/\breturn\b/`), `WorkspaceRegistry.lookup` vs `.get` in `server.ts`, `findPlayerTextLeakLocations` 4-word right-anchor tie between `aic_negsign.lua:139` and `:140` (resolved by summing `left` + `right` up to 10 words and confirming single-owner matches), and reusing `appendLine(selectedPath, ...)` in `runtimeDebuggerAdapter.selftest.ts` to keep `durable-writers.json` raw FS call counts unchanged.
- **Sustain:** Grounding both static rules against all `362` vanilla X4 9.00 MD files and all `266` `x4_ai_influence` files before writing implementation code caught the `a.ware` display-string convention vs `c.wname or c.ware` fallback distinction upfront and surfaced a real live ware-ID bug (`aic_supply.lua:402`) with zero false positives.
- **Improve work/approach:** Always check `WorkspaceRegistry` method names (`lookup`) and `durable-writers.json` fixture helpers (`appendLine`) before editing `server.ts` or registered `*.selftest.ts` files.
- **Improve tools:** `durable-writer-audit.mjs` immediately caught the extra `writeFileSync`/`appendFileSync` in `runtimeDebuggerAdapter.selftest.ts`, steering us to reuse the existing `appendLine` helper and keep `sourceFingerprint` unchanged.
- **Highest-risk evidenced weakness:** Short 4-word prose windows around a leaked ID in `findPlayerTextLeakLocations` tied across sibling clauses in `aic_negsign.lua` (`lines 139` & `140`), causing false `ambiguous` ownership even though both lines belonged to the same mod; fixed immediately by scoring combined left+right context up to 10 words and confirming ownership when all candidate lines belong to a single owner.
- **Project lessons banked:** Updated `BACKLOG.md` and `SESSION-HANDOFF.md`.
