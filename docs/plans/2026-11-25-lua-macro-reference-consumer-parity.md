# Unit 53 — Lua `macro.*` AST-Consumer Parity & Full `#64` Reference Consumer Qualification (`#64`)

Task: Align Lua `reference.unknown_macro` with the lexical AST consumer-only contract already enforced for `faction` and `ware` in `src/lib/referenceLint.ts` so arbitrary Lua string literals / table keys shaped `"macro.<word>"`, multiline long-bracket strings containing `GetMacroData(...)`, shadowed locals, global rebinds, and member calls never emit false `reference.unknown_macro` warnings while genuine `GetMacroData(...)` calls retain exact 1-based UTF-16 `(line, column)` anchors (`#64`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Close the remaining Lua reference-literal consumer gap in `src/lib/referenceLint.ts` uncovered during `#64` reconciliation:
  1. Move `scan('macro', references.macros, /(?<![\w$.\]])macro\.([A-Za-z_][\w-]*)\b/gd)` inside `if (!isLua)` alongside `faction` and `ware` so arbitrary Lua string identifiers (`"macro.service"`, `{ ["macro.rivals"] = true }`) never trigger `reference.unknown_macro`.
  2. Extend `LuaLiteralConsumer` (`'GetFactionData' | 'GetComponentData' | 'GetWareData' | 'GetMacroData'`) and `luaConsumedReferenceLiterals` in `src/lib/referenceLint.ts` to replace the raw `GetMacroData` regex (`/\bGetMacroData\s*\(\s*(["'])([^"']+)\1\s*,/gd`), respecting Lua comments, long-bracket string literals (`[[GetMacroData("fake", "name")]]`), local shadows (`local function GetMacroData() end`), member calls (`obj.GetMacroData(...)`), global rebinds (`_G.GetMacroData = ...`, `rawset(_G, "GetMacroData", ...)`), `_ENV` rebinds, single-argument/string-call forms, and UTF-8 BOM / CRLF / lone-CR offsets while preserving `'ware'`, `'faction'`, `'macro'` diagnostic ordering.
  3. Sweep the full unpacked X4 9.00 UI Lua corpus (`126` `.lua` files across base + official DLCs) to verify zero false-positive regressions on vanilla Lua files.
- **Assumptions & authoritative references:**
  - GitHub Issue `#64` (`https://github.com/KennyG1990/X4_Forge/issues/64`).
  - `src/lib/referenceLint.ts` (`78-208`), `scripts/validation-noise.selftest.ts`, `vscode-extension/src/diagnosticsMap.ts` (`115-160`).
  - `no capability-map delta`; `0` new `fs.*` writers (`src/lib/referenceLint.ts` has `0` writer calls).
- **Out of scope:** Changing XML/MD `macro.<id>` or `macro="..._macro"` rules.
- **Risks & rollback:** Rollback target: `cea83c1614c5e89893aae1562efbcad759f8f6d1`.
- **Acceptance criteria & validation:**
  1. `runReferenceLiteralLintSelftest()` passes (`28/28`) with positive & negative `macro` checks (`"macro.service"`, `{ ["macro.rivals"] = true }`, `[=[GetMacroData("fakemacro", "name")]=]`, shadowed/rebound/member `GetMacroData` -> `0` findings; genuine `GetMacroData("\\110otamacro", "name")`, `GetMacroData([=[\r\nlongmacro]=], "name")`, and `GetMacroData[=[\r\nstringcallmacro]=]` -> exact `(line, column)` `reference.unknown_macro` findings).
  2. `scripts/validation-noise.selftest.ts` passes (`42/42`) with full-project `runProjectValidation` + `flattenProjectValidation` `macroProjectCases`.
  3. Read-only sweep across all `126` unpacked X4 9.00 Lua files confirms `0` findings.
  4. `typecheck`, `lint -- --max-warnings 600`, `test:writers`, `test:oracles` (`134/134`), `test:routes` (`802/802`), and `precommit:check` pass.

## BASELINE
- **Revision:** `cea83c1614c5e89893aae1562efbcad759f8f6d1` (`main == origin/main`; GitHub Actions `Quality` run `45611567258` `SUCCESS`), clean working tree.

## RECONCILE
- **Resources & callers searched:** `src/lib/referenceLint.ts` (`78-327`), `src/server/projectValidation.ts` (`922-932`), `scripts/validation-noise.selftest.ts` (`1-84`), `vscode-extension/src/diagnosticsMap.ts` (`115-165`), `tests/e2e/validation-trust.spec.ts` (`316`).
- **Couplings checked:** `lintReferenceLiterals` family ordering (`ware -> faction -> macro`), `durable-writer-audit.mjs` (`50` raw writers, `sourceFingerprint: 74f0a969...` unchanged because `src/lib/referenceLint.ts` is not a registered writer file), `schema-intelligence` (`332/332`).
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT
- **`src/lib/referenceLint.ts`:**
  - Moved `scan('macro', references.macros, /(?<![\w$.\]])macro\.([A-Za-z_][\w-]*)\b/gd)` inside `if (!isLua)` alongside `faction` and `ware`.
  - Extended `LuaLiteralConsumer` with `'GetMacroData'` and unified Lua `macro` resolution inside `luaConsumedReferenceLiterals`, preserving `ware -> faction -> macro` output ordering and full lexical/rebinding/BOM/CRLF/long-bracket fidelity.
  - Expanded `runReferenceLiteralLintSelftest()` from `25` to `28` checks covering Lua `"macro.*"` strings/table keys, long-bracket quotes, shadows, member calls, BOM/CRLF/lone-CR/string-call coordinates, and `GetMacroData` global rebinding isolation.
- **`scripts/validation-noise.selftest.ts`:**
  - Added `macroProjectCases` (`4` end-to-end assertions across `runProjectValidation` and `flattenProjectValidation`, `38 -> 42` assertions).
- **Deliberately unchanged:** XML/MD `macro.<id>` and `macro="..._macro"` scanning, `config/durable-writers.json`, `config/forge-route-dispositions.json`, `config/action-receipt-coverage.json`.

## VALIDATE
- `npx tsx -e "import { runReferenceLiteralLintSelftest } ..."` -> `{"allPassed":true,"passed":28,"total":28}`.
- `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00' npx tsx scripts/validation-noise.selftest.ts` -> `{"assertions":42,"pass":true}` (`reference: 28/28`, `properties: 112/112`, `crossFile: 124/124`).
- `X4_REFERENCE_ROOT=... npx tsx scripts/claude-validation-matrix.selftest.ts` -> `PASS`.
- `X4_REFERENCE_ROOT=... npm run test:schema-intelligence` -> `332/332 PASS` (`reference-literals: 28/28 PASS`).
- `npx tsx G:\Forge-QA\temp\unit53-lua-corpus-sweep.ts` -> `126` official X4 9.00 `.lua` files (`6,505` macros, `1,902` wares, `64` factions), **`totalFindings: 0`**.
- `npm run typecheck` -> exit `0`.
- `npm run lint -- --max-warnings 600` -> `0` errors, `578` warnings.
- `npm run test:writers` -> `30/30` selftest + `[durable-writer audit] PASS` (`50` raw writers, `74f0a969...`) + `8/8` `durableWrite`.
- `npm run test:oracles` -> `134/134 PASS` (`reference-literal-lint-selftest` `28/28`).
- `npm run test:routes` (with `X4_XSD_PATH`/`X4_REFERENCE_ROOT` unset) -> `802/802 PASS`.
- `npm run precommit:check` -> `[precommit] OK`.

## REVIEW
- Lua `"macro.<word>"` plain string literals & table keys produce `0` `reference.unknown_macro` findings: **Done & evidenced** (`src/lib/referenceLint.ts:177-181`, `validation-noise.selftest.ts:84-99`).
- Lua `GetMacroData(...)` uses AST consumer resolution matching `GetFactionData` and `GetWareData` (ignoring comments, long-bracket text, local shadows, member lookalikes, global rebinds, `_ENV` replacement, and partial parses while preserving exact 1-based UTF-16 `(line, column)` on genuine unknown IDs): **Done & evidenced** (`src/lib/referenceLint.ts:95-139,185-193`).
- Vanilla X4 9.00 UI Lua corpus (`126` files) has `0` false positives: **Done & evidenced** (`task-14810`).
- Public VSIX (`0.0.96`) + installed `FORGE DEVELOPMENT` Problems/navigation check for `#64`: **Scheduled for `0.0.96` release gate (after Unit 54)**; keep `#64` open until `0.0.96` VSIX verification completes.

## CLOSE
- **Status:** `VERIFIED`
- **Remaining risks / deferred work:** Deliver in `0.0.96` VSIX and verify installed `FORGE DEVELOPMENT` Problems mapping & exact navigation on `#64` before closing `#64`.
- **Suggested commit title:** `fix(validation): use Lua AST consumer resolution for GetMacroData and macro literals (#64)`

## AAR
- **Triggers:** Initial selftest expectation in `runReferenceLiteralLintSelftest()` wrote `longmacro:5:1` instead of `longmacro:4:1` on a 4-line fixture (`task-14772`); `scripts/validation-noise.selftest.ts` initially ran without `X4_REFERENCE_ROOT` (`task-14784`).
- **Sustain:** Auditing sibling reference families (`faction`, `ware`, `macro`) together uncovered `macro.*` outside `if (!isLua)` and raw regex `GetMacroData` before closing `#64`.
- **Improve work/approach:** Count explicit `\r` / `\r\n` / `\n` line breaks directly on multiline BOM/CRLF selftest fixtures before running, and always set `X4_REFERENCE_ROOT` when invoking `scripts/validation-noise.selftest.ts`.
- **Improve tools:** `scripts/validation-noise.selftest.ts` now covers end-to-end `macroProjectCases` alongside `wareProjectCases` (`42/42` assertions).
- **Highest-risk evidenced weakness:** `No evidenced risk delta`.
- **Lessons banked:** Keep `#64` open until `0.0.96` VSIX installed-IDE verification confirms all three Lua reference families (`faction`, `ware`, `macro`) in native Problems.
