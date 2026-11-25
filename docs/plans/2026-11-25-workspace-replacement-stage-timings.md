# Unit 59 — Stage-Attributed Workspace Replacement Persistence Telemetry & Redundant Hash Elimination (`#137`)

Task: Instrument deterministic wall-clock stage timings across workspace receipt serialization, recovery preparation, receipt persistence, mutation diagnostics/commit, postcondition, receipt commit, HTTP response delivery, and Action Ledger rows while eliminating redundant workspace re-sanitization/hashing on `POST /api/agent/workspace`
Lane: FULL | Status: VERIFIED

## PLAN

- **Bounded unit:**
  1. Add optional `onTimings?: (timings: ActionReceiptTransactionKernelTimingsMs) => void` in `src/lib/actionReceiptTransaction.ts` (`runActionReceiptTransaction`) to record monotonic (`performance.now()`, rounded to `0.01` ms) durations for `readExistingMs`, `recoveryPrepareMs`, `receiptPrepareMs`, `mutateMs`, `postconditionMs`, `receiptCommitMs`, and `kernelTotalMs` without changing `ActionReceipt` bytes/hashes or `ActionReceiptTransactionResult`.
  2. Add optional `onTimings?: (timings: WorkspaceReceiptTransactionTimingsMs) => void` in `src/server/workspaceReceiptService.ts` (`WorkspaceReceiptService.execute`) to record `policyAndCandidateMs`, `queueWaitMs`, `replayLookupMs`, `recoveryPrepareMs`, `receiptPrepareMs`, `mayMutateMs`, `mutateMs`, `postconditionMs`, `receiptCommitMs`, and `serviceTotalMs` without changing `WorkspaceReceiptServiceResult`.
  3. Export `WorkspaceStageTimingsMs` and optional `stageTimingsMs?: WorkspaceStageTimingsMs` on `LedgerRow` in `src/lib/agentHistory.ts`.
  4. In `server.ts` (`applyWorkspaceMutation`, `executeWorkspaceReceiptMutation`, `ledgerMiddleware`):
     - Record `diagnosticsMs` (`computeWorkspaceDiagnostics`) and `registryPersistMs` (`registry.commit`) inside `applyWorkspaceMutation`.
     - Eliminate redundant per-transaction work in `executeWorkspaceReceiptMutation` / `applyWorkspaceMutation`:
       - Reuse `beforeResources` inside `mayMutate` when `latest.record === preparedRecord` (exact immutable `WorkspaceRecord` identity; recompute fresh whenever `latest.record !== preparedRecord`).
       - Precompute 16-hex `nextContentHead` (`workspaceContentHash(nextWorkspace)`) and `nextSnapshotHead` (`workspaceSnapshotHash(nextWorkspace)`) once when `receiptRecoveryRequired` is true, reusing them across `prepareRecovery`, `applyWorkspaceMutation`, and `rollback`, and reuse `beforeWorkspace` + `isDifferent` when `target.record === preparedRecord`.
     - Attach complete `stageTimingsMs` (`adapterPrepareMs`, `policyAndCandidateMs`, `queueWaitMs`, `replayLookupMs`, `recoveryPrepareMs`, `receiptPrepareMs`, `mayMutateMs`, `diagnosticsMs`, `registryPersistMs`, `mutateMs`, `postconditionMs`, `receiptCommitMs`, `responseBuildMs`, `totalMs`) to:
       - HTTP header `X-Forge-Workspace-Stage-Timings` across all `executeWorkspaceReceiptMutation` responses,
       - `LedgerRow.stageTimingsMs` via `ForgeDecoratedRequest.__workspaceStageTimingsMs`, and
       - JSON response bodies on `POST /api/agent/workspace` and `POST /api/agent/workspace/merge` (`!options.transformSuccessBody`, preserving closed `outputSchema` envelopes on `POST /api/agent/mod-folder/sync` and `POST /api/agent/workspace/domain`).
  5. Expand `src/server/workspaceReceiptService.selftest.ts` with deterministic `onTimings` + pre-admission client-timeout (`ACTION_RECEIPT_MUTATION_FAILED` -> `ACTION_RECEIPT_REPLAY`, `0` mutations) + post-admission client-timeout (`replayed: true`, `1` mutation, `ACTION_RECEIPT_DUPLICATE_CONFLICT` on changed payload) checks, and add live HTTP `welcome -> B116_Resume_Adoption` stage-timing, replay, ledger, and conflict checks in `scripts/route-integration.mjs`.
  6. Refresh `config/durable-writers.json` `sourceFingerprint` (`50` raw writers unchanged) and promote `config/action-receipt-coverage.json` + `src/lib/actionReceiptPolicyBundle.ts` if `server.ts` changes the writer source fingerprint.
- **Assumptions & authoritative references:**
  - GitHub Issue `#137` (`[Performance] Workspace replacement committed 53 seconds after fixture request began`), `#issuecomment-7090341457`, and `#issuecomment-7091958556`.
  - `src/lib/actionReceipt.ts` (`ActionReceipt` canonical JSON / SHA-256 contract — never embed wall-clock durations inside hashed `ActionReceipt` fields).
  - `src/lib/forgeCapabilities.ts:2007` (`history.list@2` `rows` items allow `additionalProperties: true`; `POST /api/agent/mod-folder/sync` & `POST /api/agent/workspace/domain` use `transformSuccessBody` for closed `outputSchema`).
- **In scope:**
  - `src/lib/actionReceiptTransaction.ts`
  - `src/server/workspaceReceiptService.ts`
  - `src/server/workspaceReceiptService.selftest.ts`
  - `src/lib/agentHistory.ts`
  - `server.ts`
  - `scripts/route-integration.mjs`
  - `config/durable-writers.json`, `config/action-receipt-coverage.json`, `src/lib/actionReceiptPolicyBundle.ts` (manifest fingerprint sync only, zero raw-writer or route/surface count delta)
- **Out of scope:**
  - Prematurely closing `#137` before `0.0.98` full source + compiled Playwright E2E release qualification runs with stage attribution active.
  - Modifying `ActionReceipt` schema, `ActionReceiptStore` file format, or `fetchFixtureResponse` retry deadlines.
  - Touching live Forge, `AiLive`, X4 game installation, or saves.
- **Risks and authorization boundaries:**
  - Risk: Polluting closed `outputSchema` routes (`POST /api/agent/mod-folder/sync`, `POST /api/agent/workspace/domain`) or `WorkspaceReceiptServiceResult` shape checks (`workspaceReceiptService.selftest.ts:610-615`). Mitigation: surface kernel/service timings via optional `onTimings` callbacks and attach body `stageTimingsMs` only when `!options.transformSuccessBody`.
  - Authorization: Authorized local/GitHub engineering under `/goal` inside `G:\Forge-QA\forge-development`.
- **Rollback/checkpoint:**
  - Clean baseline commit `3b1299db25820955b2faa828c8bb7e9598e69a3c` (`0.0.97` release, `Quality` `45689532871` `SUCCESS`).
- **Acceptance criteria:**
  1. `POST /api/agent/workspace` (`welcome -> B116_Resume_Adoption`) records all 14 monotonic stage timings (`adapterPrepareMs`, `policyAndCandidateMs`, `queueWaitMs`, `replayLookupMs`, `recoveryPrepareMs`, `receiptPrepareMs`, `mayMutateMs`, `diagnosticsMs`, `registryPersistMs`, `mutateMs`, `postconditionMs`, `receiptCommitMs`, `responseBuildMs`, `totalMs`) on JSON response `stageTimingsMs`, `X-Forge-Workspace-Stage-Timings` header, and Action Ledger `LedgerRow.stageTimingsMs`.
  2. Exact `workspaceHash`, `snapshotHash`, `x-forge-operation-id`, `ActionReceipt` projection (`id`, `hash`, `status`), and `recovery` availability are preserved.
  3. Same-operation-ID replay after commit returns `200`, `replayed: true`, `applied: false`, `mutateMs === 0`, identical receipt projection, and zero extra workspace mutation; pre-admission timeout/abort returns `ACTION_RECEIPT_REPLAY` (`409`) on retry with zero mutation; changed payload under the same operation ID returns `409 ACTION_RECEIPT_DUPLICATE_CONFLICT` (negative path).
  4. `50` raw writers, `113` capabilities, `402` route dispositions, `141` action-receipt routes / `69` surfaces, `134/134` runtime oracles, all route-integration checks, and `precommit:check` pass.
- **Required validation and negative path:**
  - `node --import tsx src/server/workspaceReceiptService.selftest.ts`
  - `npm run typecheck`
  - `npm run lint -- --max-warnings 600`
  - `npm run test:writers`
  - `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`
  - `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest`
  - `npm run test:oracles` (`134/134`)
  - `npm run test:routes` (with `X4_XSD_PATH` / `X4_REFERENCE_ROOT` unset)
  - `npm run precommit:check`
- **Evidence locations:**
  - This document (`docs/plans/2026-11-25-workspace-replacement-stage-timings.md`), `SESSION-HANDOFF.md`, and `#137` GitHub comment receipt.

## BASELINE

- **Revision/version:** `3b1299db25820955b2faa828c8bb7e9598e69a3c` (`0.0.97`, GitHub Actions `Quality` `45689532871` `SUCCESS`).
- **Existing changes/failures/runtime state:** `git status --short` clean (`0` dirty/untracked files).

## RECONCILE

- **Resources and readers/writers searched:**
  - `src/lib/actionReceiptTransaction.ts` (`runActionReceiptTransaction` lines `592-727`, `ActionReceiptTransactionCallbacks` lines `158-167`).
  - `src/server/workspaceReceiptService.ts` (`WorkspaceReceiptService.execute` lines `405-547`) & `src/server/workspaceReceiptService.selftest.ts` (`lines 1-651`).
  - `server.ts` (`ForgeDecoratedRequest` lines `1156-1175`, `ledgerMiddleware` lines `1538-1840`, `computeWorkspaceDiagnostics` / `applyWorkspaceMutation` lines `9315-9561`, `executeWorkspaceReceiptMutation` / `POST /api/agent/workspace` lines `9726-10225`).
  - `src/lib/agentHistory.ts` (`LedgerRow` lines `45-93`, `encodeRow`/`decodeRows` lines `739-756`) & `src/lib/forgeCapabilities.ts` (`history.list@2` line `2007`, `POST /api/agent/mod-folder/sync` line `5466`, `POST /api/agent/workspace/domain` line `5142`).
  - `tests/e2e/continuous-polling.spec.ts` (`lines 543-714`) & `tests/e2e/fixtures/largeWorkspace.ts` (`1,424` nodes, `6,040,734` bytes).
- **Existing capability reused:**
  - `runActionReceiptTransaction`, `WorkspaceReceiptService`, `executeWorkspaceReceiptMutation`, `applyWorkspaceMutation`, and `AgentHistoryStore` / `LedgerRow`.
- **Couplings checked:**
  - `ActionReceipt` canonical bytes/hashes (`src/lib/actionReceipt.ts` / `src/lib/actionReceiptStore.ts`) remain untouched.
  - `WorkspaceReceiptServiceResult` closed projection check (`workspaceReceiptService.selftest.ts:610-615`) preserved via callback-based `onTimings`.
  - Closed `outputSchema` routes (`POST /api/agent/mod-folder/sync`, `POST /api/agent/workspace/domain`) gated by `!options.transformSuccessBody`.
  - `history.list@2` (`src/lib/forgeCapabilities.ts:2007`) allows `additionalProperties: true` on `rows` items.
- **Capability-map delta:** `no capability-map delta` (`113` capabilities, `402` routes, `114` MCP aliases unchanged).
- **3-strike / hazard-sweep check:** Clean (`0` new `fs.*` writers, `0` network/credential/spend surface changes).

## IMPLEMENT

- **Actual bounded changes:**
  1. `src/lib/actionReceiptTransaction.ts`: added `ActionReceiptTransactionKernelTimingsMs` (`readExistingMs`, `recoveryPrepareMs`, `receiptPrepareMs`, `mutateMs`, `postconditionMs`, `receiptCommitMs`, `kernelTotalMs`) and optional fail-soft `onTimings` callback on `ActionReceiptTransactionCallbacks`, preserving exact `ActionReceipt` bytes/hashes and `ActionReceiptTransactionResult`.
  2. `src/server/workspaceReceiptService.ts`: added `WorkspaceReceiptTransactionTimingsMs` (`policyAndCandidateMs`, `queueWaitMs`, `replayLookupMs`, `recoveryPrepareMs`, `receiptPrepareMs`, `mayMutateMs`, `mutateMs`, `postconditionMs`, `receiptCommitMs`, `serviceTotalMs`) and optional fail-soft `onTimings` callback on `WorkspaceReceiptTransactionDescription`, separating `mayMutateMs` from domain `mutateMs` and preserving exact `WorkspaceReceiptServiceResult` projection keys.
  3. `src/lib/agentHistory.ts`: exported `WorkspaceStageTimingsMs` (14 fields) and added optional `stageTimingsMs?: WorkspaceStageTimingsMs` on `LedgerRow`.
  4. `server.ts`:
     - Added `__workspaceStageTimingsMs?: WorkspaceStageTimingsMs` on `ForgeDecoratedRequest` and persisted `stageTimingsMs` onto `LedgerRow` in `ledgerMiddleware`.
     - Measured `diagnosticsMs` (`computeWorkspaceDiagnostics`) and `registryPersistMs` (`registry.commit`) inside `applyWorkspaceMutation`.
     - Eliminated redundant workspace re-sanitization/hashing inside `executeWorkspaceReceiptMutation` & `applyWorkspaceMutation` (`mayMutate` reuses `beforeResources` when `latest.record === preparedRecord`, `nextContentHead`/`nextSnapshotHead` computed once for `prepareRecovery`/`applyWorkspaceMutation`/`rollback`, and `beforeWorkspace`/`isDifferent` reused when `target.record === preparedRecord`).
     - Attached complete 14-field `stageTimingsMs` onto `X-Forge-Workspace-Stage-Timings` across all `executeWorkspaceReceiptMutation` responses, onto `LedgerRow.stageTimingsMs`, and onto JSON response bodies when `!options.transformSuccessBody` (`POST /api/agent/workspace` & `POST /api/agent/workspace/merge`).
  5. `src/server/workspaceReceiptService.selftest.ts` (`25 -> 27` checks) & `scripts/route-integration.mjs` (`804 -> 807` checks): added deterministic stage-timing, pre-admission client-timeout (`ACTION_RECEIPT_MUTATION_FAILED` -> `ACTION_RECEIPT_REPLAY`, `0` mutations), post-admission client-timeout (`replayed: true, applied: false`, `1` mutation, `mutateMs === 0`), Action Ledger parity, and same-operation changed-payload `409 ACTION_RECEIPT_DUPLICATE_CONFLICT` tests.
  - **Deliberately unchanged:** `config/durable-writers.json` (`50` raw writers, `sourceFingerprint: 74f0a969...`), `config/forge-route-dispositions.json` (`402` routes), `config/action-receipt-coverage.json` (`141` routes / `69` surfaces), `ActionReceipt` schema/bytes, and `#137` issue state (kept open through `0.0.98` full source + compiled Playwright E2E qualification).
- **Post-lock contract changes:** None (`config/durable-writers.json` required zero updates because raw filesystem writer AST sites did not change).

## VALIDATE

- `node --import tsx src/lib/actionReceiptTransaction.selftest.ts` -> `23/23 PASS` (`task-15726`).
- `node --import tsx src/server/workspaceReceiptService.selftest.ts` -> `27/27 PASS` (`task-15726`).
- `node --import tsx src/lib/agentHistory.selftest.ts` -> `PASS` (`task-15726`).
- `npm run typecheck` -> exit `0` (`task-15726`).
- `npm run lint -- --max-warnings 600` -> `0` errors, `579` warnings (`task-15726`).
- `npm run test:writers` -> `30/30` selftest + `PASS` (`50` raw writers, `74f0a969e78384f1531772240177506b49893797e395506ac78213dfa7a4c9e0`) + `8/8` (`task-15726`).
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`113` capabilities, `402` routes, `114` MCP aliases, `52` UI-action parity rows; `task-15732`).
- `npm run test:action-receipt-coverage` & `:selftest` -> `PASS` (`141` routes / `69` surfaces, `79/79` + `23/23`; `task-15732`).
- `npm run test:oracles` -> `134/134 PASS` (`task-15732`).
- `npm run test:routes` (with `X4_XSD_PATH` & `X4_REFERENCE_ROOT` unset) -> `807/807 PASS` (`task-15732`), including:
  - `workspace_replace_records_complete_stage_timings_header_and_ledger`: `{"adapterPrepareMs":0.66,"policyAndCandidateMs":2.66,"queueWaitMs":0.08,"replayLookupMs":2.13,"recoveryPrepareMs":11.23,"receiptPrepareMs":16.12,"mayMutateMs":0.02,"diagnosticsMs":53.82,"registryPersistMs":1.64,"mutateMs":55.5,"postconditionMs":0.24,"receiptCommitMs":20.7,"responseBuildMs":0.31,"totalMs":110.3,"headerMatch":true,"ledgerMatch":true}`
  - `workspace_replace_timeout_replay_reuses_receipt_with_zero_mutation_stage_time`: `{"status":200,"replayed":true,"applied":false,"mutateMs":0,"diagnosticsMs":0,"registryPersistMs":0,"recoveryPrepareMs":0,"totalMs":57.51}`
  - `workspace_replace_same_operation_changed_payload_refuses_409_with_stage_timings`: `{"status":409,"code":"ACTION_RECEIPT_DUPLICATE_CONFLICT","mutateMs":0,"totalMs":8.79}`

## REVIEW

- Stage-by-stage wall-clock timing across candidate/policy, serialization queue wait, replay lookup, recovery preparation, receipt persistence, `mayMutate`, diagnostics, registry persistence, postcondition, receipt commit, HTTP response build, and Action Ledger -> **done (evidenced)**.
- Exact `workspaceHash`, `snapshotHash`, caller `x-forge-operation-id`, receipt projection, and recovery preserved -> **done (evidenced)**.
- Post-timeout replay (`replayed: true, applied: false`, single mutation), pre-admission timeout refusal (`ACTION_RECEIPT_REPLAY`, zero mutation), and changed-payload conflict (`409 ACTION_RECEIPT_DUPLICATE_CONFLICT`) -> **done (evidenced)**.
- Redundant workspace re-sanitization/hash recomputation eliminated without weakening `postcondition` or `ActionReceipt` hashes -> **done (evidenced)**.
- Full source + compiled browser E2E release qualification on `#137` -> **deferred to `0.0.98` release gate** (`#137` stays open).

## CLOSE

- **Status:** `VERIFIED` (Unit 59 bounded scope; `#137` stays open pending `0.0.98` full source + compiled E2E qualification).
- **Remaining risks/deferred work:** `#137` remains open so the `0.0.98` full source + compiled Playwright E2E release gate qualifies with permanent stage attribution active.
- **Suggested commit title:** `feat(workspace): add stage-attributed replacement timings and reuse prepared hashes (#137)`

## AAR

- **Triggers:** Two read-only pre-plan scratch `node --import tsx --input-type=module -` probes failed on first try (`step 15596`: TS non-null assertion `!` in JS `--input-type=module` stdin; `step 15609`: guessed `./src/lib/templates.ts` instead of reading `modTemplates.ts`). Zero implementation/validation failures once coded.
- **Sustain:** Checking `WorkspaceReceiptServiceResult` projection assertions (`workspaceReceiptService.selftest.ts:610-615`), `transformSuccessBody` closed-`outputSchema` routes, and `history.list@2` (`additionalProperties: true`) before coding yielded 100% green `typecheck`, `lint`, `test:writers`, `test:capabilities`, `test:oracles` (`134/134`), and `test:routes` (`807/807`) on the very first run with zero manifest churn.
- **Improve work/approach:** When piping inline code into `node --import tsx --input-type=module -`, remember Node parses stdin as standard ESM JavaScript (never use TS syntax like `!` or `as`), and always check existing imports via `read_file` before importing internal modules in scratch probes.
- **Improve tools:** `X-Forge-Workspace-Stage-Timings` and `LedgerRow.stageTimingsMs` now localize any future slow `POST /api/agent/workspace` call to exact millisecond stages (`queueWaitMs`, `recoveryPrepareMs`, `receiptPrepareMs`, `diagnosticsMs`, `registryPersistMs`, `receiptCommitMs`, `responseBuildMs`) without requiring ad-hoc in-memory instrumentation.
- **Highest-risk evidenced weakness:** `diagnosticsMs` (`computeWorkspaceDiagnostics`, `53.82 ms` on `B116_Resume_Adoption` vs `1.64 ms` `registryPersistMs`) accounts for `97%` of `mutateMs` inside the serialized workspace lock; if a future `0.0.98` E2E run attributes any multi-second spike to `diagnosticsMs`, bounded content-addressed caching of pure unlinked canvas validation can eliminate it cleanly.
- **Global/project lessons banked:** Updated `SESSION-HANDOFF.md` with Unit 59 receipt and `node --import tsx --input-type=module -` JS-only stdin note.
