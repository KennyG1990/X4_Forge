# Lexical Lua payload-table binding isolation across same-file functions (#101)

- **Task:** `#101` (reconcile Claude's `#issuecomment-7075445507` `0.0.89` dry-run report & eliminate file-wide local-name poisoning in `parseLuaUiEmits`)
- **Lane:** `FULL`
- **Status:** `SPECIFIED`

## PLAN

- **Bounded unit:** Reconcile Claude's `0.0.89` `md_lua.payload_writer_unverified` report (`#issuecomment-7075445507`) against current `main`, and upgrade `payloadEmits` + `unaliasedLuaPayloads` in `parseLuaUiEmits` (`src/lib/projectCrossFileValidation.ts`) from file-wide string table names (`assignments.get(table)?.count === 1 && !shadowed.has(table)`) to per-declaration `LuaLocalBinding` (`scopeIndex.identToBinding` / `binding.refs`), while preserving the locked closure-capture boundary on `pcall(function() AddUITriggeredEvent(...) end)` (`scripts/event-coverage-selftest.ts:522-558`).
- **Assumptions:** Isolated Dev workspace (`G:\Forge-QA\forge-development`); read-only `x4_ai_influence` used only for non-mutating replays; `FORGE DEVELOPMENT` IDE (`0.0.89`) and X4 game untouched.
- **Authoritative references:** GitHub `#101` (`#issuecomment-7075445507`), `#71`, `docs/plans/2026-11-09-indexed-payload-writer-evidence.md`, `docs/plans/2026-11-18-payload-writer-checkpoint.md`, `src/lib/projectCrossFileValidation.ts`, `src/lib/validationEvidence.ts`, `scripts/event-coverage-selftest.ts`.
- **In scope:**
  1. Key `payloadEmits`, `indexedClears` lookup, and `unaliasedLuaPayloads` in `parseLuaUiEmits` by `LuaLocalBinding` (`varBinding.kind === 'local' && varBinding.writes === 1 && varBinding.init?.type === 'TableConstructorExpression'`) instead of file-wide string `table`, using `binding.refs.length` and per-binding `bindingUses` so separate functions or sibling blocks in the same `.lua` file declaring `local p = { ... }` no longer poison each other's direct or `pcall(AddUITriggeredEvent, ...)` payload verification or recipient disproof.
  2. Preserve existing closure-capture (`emit.scope !== write.scope` -> `recipientUnverified = true`, including `pcall(function() ... end)` locked at `event-coverage-selftest.ts:522-558`) and unemitted local-table boundaries (`shadowed_table`, `same_name_but_unbound`).
  3. Add positive and negative same-file lexical payload-table tests in `src/lib/projectCrossFileValidation.ts` and `scripts/event-coverage-selftest.ts`.
  4. Update the Notion Agent Board `#101` row (`41b4618ed15b81949b48eb0d9a41ccdc`) with the reconciled `main` replay answering Claude's `0.0.89` report.
- **Out of scope:** Changing `pcall(function() ... end)` closure-capture classification (`locked` by `payload-writer-target-prefers-an-observed-recipient-across-keys`); interprocedural reassignment flow across `AI_Influence.ConfirmGate` / `AuthChainPayload`; route/capability/writer/receipt manifest changes; installed IDE (`0.0.94`) or in-game validation.
- **Risks & recovery:** Breaking `shadowed_table` (`do local p = ... end; AddUITriggeredEvent(..., p)`) or `local_index_write_alias` (`local q = p; Mutate(q)`) if `bindingUses` or `binding.refs.length` miscounts inner references. Mitigated by computing `bindingUses` via `scopeIndex.identToBinding.get(node) === binding` and running the full `121+` cross-file and `48+` event-coverage selftest suites. Rollback: `git checkout -- src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts`.
- **Acceptance criteria:**
  1. Two functions or sibling blocks in the same `.lua` file both declaring `local p = { n = 1 }` verify independent direct (`AddUITriggeredEvent`) and protected (`pcall(AddUITriggeredEvent, ...)`) indexed payload writes and independent wrong-event disproofs (`md_lua.payload_missing_writer`) without cross-function `!shadowed.has('p')` poisoning.
  2. Negative controls (`shadowed_table` inner `do local p = ... end`, `local q = p; Mutate(q)` alias escape, reassigned `p = {}`, closure-captured `pcall(function() ... end)` at `event-coverage-selftest.ts:522-558`) remain `md_lua.payload_writer_unverified`.
  3. `runProjectCrossFileSelftest`, `event-coverage-selftest`, `validation-trust`, `finding-review`, `claude-validation-matrix`, `validation-noise`, `eslint`, `typecheck`, `test:oracles`, `test:routes`, and `precommit:check` all pass.

## BASELINE

- `HEAD`: `1e73ccb` on `G:\Forge-QA\forge-development` (`main`), clean working tree.
- `npx tsx scripts/event-coverage-selftest.ts`: `48/48 PASS`.
- `runProjectCrossFileSelftest()`: `121/121 PASS`.

## RECONCILE

- Reconciling Claude's `0.0.89` dry-run report (`#issuecomment-7075445507`) against current `main` (`1e73ccb`) established two facts:
  1. Both `0.0.89` symptoms (`target: { file: "ui/addons/ai_influence_chat/aic_confirm.lua", line: 209, column: 9 }` pointing at `SpendReport` on `"spend_request"`, and missing `payloadWriterScope`) were already resolved in `0.0.92`/`0.0.93` (`projectCrossFileValidation.ts:1043,1104-1106`, `projectValidation.ts:1217`, `server.ts:17412`), and `scripts/event-coverage-selftest.ts:522-558` (`payload-writer-target-prefers-an-observed-recipient-across-keys`) explicitly locks closure-wrapped `pcall(function() AddUITriggeredEvent("ForgeLab", "spend_request", p) end)` as `recipientUnverified: true` (`check-unavailable`). Plan revised before implementation to preserve that locked closure boundary rather than disproving `pcall(function() ... end)` closures.
  2. However, `parseLuaUiEmits` (`src/lib/projectCrossFileValidation.ts:2861-2905`) still keys `payloadEmits` and `unaliasedLuaPayloads` by file-wide string `table` (`assignments.get(table)?.count === 1 && !shadowed.has(table)`), causing any two functions in the same `.lua` file that both declare `local p = { ... }` to disable payload verification and wrong-event disproof for every `p` in that file. Reusing `scopeIndex.identToBinding` and `LuaLocalBinding.refs` eliminates this file-wide name collision cleanly.
- Capability-map delta: `no capability-map delta`.

## IMPLEMENT

- `src/lib/projectCrossFileValidation.ts`:
  - Extended `indexedPayloadTarget` with optional `identToBinding` to attach per-declaration `LuaLocalBinding` (`binding`) and count `bindingUses` strictly against `identToBinding.get(node) === binding`.
  - Switched `payloadEmits`, `indexedClears` matching, and `unaliasedLuaPayloads` in `parseLuaUiEmits` from file-wide string `table` (`assignments.get(table)?.count === 1 && !shadowed.has(table)`) to `Map<LuaLocalBinding, LuaPayloadEmit[]>` and `binding.refs.length === expected`, keeping closure-captured `pcall(function() ... end)` (`emit.scope !== write.scope` -> `recipientUnverified = true`) and unemitted local tables (`shadowed_table`, `same_name_but_unbound`) intact.
  - Added 3 unit checks in `runProjectCrossFileSelftest()` (`same_file_distinct_functions_same_local_name`, `same_file_distinct_functions_wrong_event_disproof`, `same_file_distinct_functions_alias_escape_stays_unverified`).
- `scripts/event-coverage-selftest.ts`:
  - Added `same-file-lexical-payload-bindings-avoid-name-shadow-poisoning` covering positive multi-function `local p` verification (`pcall(AddUITriggeredEvent, ...)` + `AddUITriggeredEvent(...)`) and wrong-key `md_lua.payload_missing_writer` (`error`) enforcement through `runProjectValidation`.

## VALIDATE

- `npx tsx scripts/event-coverage-selftest.ts`: `49/49 PASS`.
- `runProjectCrossFileSelftest()`: `124/124 PASS`.
- `npx tsx scripts/claude-validation-matrix.selftest.ts` (with `X4_REFERENCE_ROOT`): `34/34 PASS`.
- `npx tsx scripts/validation-noise.selftest.ts` (with `X4_REFERENCE_ROOT`): `reference 25/25`, `properties 112/112`, `crossFile 124/124`, `38` corpus `PASS`.
- `npx eslint src/lib/projectCrossFileValidation.ts scripts/event-coverage-selftest.ts`: `0` errors; `npm run typecheck`: `0` errors.
- `npm run test:oracles`: `134/134 PASS`.
- `npm run test:routes` (`X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset): `661/661 PASS`.
- `npm run precommit:check`: `[precommit] OK`.
- Read-only `x4_ai_influence` (`266` files) replay: `payloadErrors = 0`, `1` `md_lua.payload_writer_unverified` finding on `ai_influence.player_orders` (`target` omitted — no `aic_confirm.lua:209` `SpendReport` misattribution; `payloadWriterScope` populated with `27` keys down from `49` in `0.0.89`).

## REVIEW

- Same-file lexical payload-table isolation, wrong-event disproof, alias/closure/shadow negative boundaries, and reconciliation of Claude's `0.0.89` `#issuecomment-7075445507` report: **Done and evidenced**.
- Remaining `27` reassigned/cross-file `player_orders` keys (`CONV_ONLY` through `AI_Influence.ConfirmGate` / `AuthChainPayload`) and `0.0.94` packaged/installed IDE delivery: **Partial / open under `#101`**.

## CLOSE

- **Status:** `PARTIAL` overall on `#101` (`VERIFIED` in isolated Dev source/oracles/routes for Unit D lexical payload binding isolation and `#issuecomment-7075445507` reconciliation; `0.0.94` installed delivery and remaining `27` cross-file `ConfirmGate` keys stay open).
- **Suggested commit title:** `fix(validation): isolate lexical Lua payload-table bindings across same-file functions (#101)`

## AAR (Triggered)

- **Triggers:** Reconciliation of `scripts/event-coverage-selftest.ts:522-558` (`payload-writer-target-prefers-an-observed-recipient-across-keys`) revised the initial plan before implementation to preserve the locked `recipientUnverified: true` classification on closure-wrapped `pcall(function() AddUITriggeredEvent(...) end)`; first `claude-validation-matrix.selftest.ts` invocation failed fast with `Real X4_REFERENCE_ROOT required` because `X4_REFERENCE_ROOT` had been unset for route integration.
- **Points to sustain:** Checking locked selftests (`event-coverage-selftest.ts:522-558`) during reconciliation caught an intentional closure-capture invariant before writing code; reusing `scopeIndex.identToBinding` and `LuaLocalBinding.refs` eliminated file-wide `!shadowed.has(table)` collisions in ~20 lines with zero manifest churn.
- **Points to improve (work/approach):** Always export `X4_REFERENCE_ROOT` immediately before running `claude-validation-matrix.selftest.ts` / `validation-noise.selftest.ts`, then unset it before `test:routes`.
- **Points to improve (tools):** `No evidenced risk delta` beyond the already-banked `X4_REFERENCE_ROOT` prerequisite note.
- **Highest-risk evidenced weakness:** File-wide `assignments.get(table)` + `!shadowed.has(table)` in `parseLuaUiEmits` allowed a second `local p = { ... }` anywhere in a `.lua` file to silently disable positive payload verification and wrong-event `md_lua.payload_missing_writer` detection for unrelated functions in the same file; resolved in this unit via `LuaLocalBinding` identity.
