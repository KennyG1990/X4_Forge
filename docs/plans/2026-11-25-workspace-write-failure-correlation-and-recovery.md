# Unit 55 — Correlated Workspace File-Write Failure Telemetry, Readback Verification & Landed-Bytes Recovery (`#68` / `FF-29`)

Task: Unify sanitized `writeFailure` + `X-Forge-Write-Request-Id` correlation across `POST /api/fs/write` and `POST /api/agent/files/write`, and equip Studio file-save / native-materialization clients (`DirectoryExplorer.tsx`, `nativeEditor.ts`) with bounded error telemetry and readback-before-retry reconciliation (including writes that already landed on disk) without blind retries (`#68`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Address all 4 acceptance criteria of `#68` (`FF-29`):
  1. **Correlated server failure envelope & header (`server.ts`):**
     - Emit `X-Forge-Write-Request-Id: <failure.requestId>` on both `POST /api/fs/write` (`7128-7139`) and `POST /api/agent/files/write` (`14874-14887`) when `WORKSPACE_FILE_WRITE_FAILED` (`500`) occurs so callers that inspect HTTP headers on `HTTPError` preserve the correlation ID alongside `[workspace-file-write]` server logs.
     - Align `POST /api/agent/files/write` (`500` catch block) with `POST /api/fs/write` by returning `failedStages: [failure.stage]`, `writeFailure: failure` (preserving `failure` for backward compatibility), and the sanitized stage guidance (`Workspace write failed during ${failure.stage}. Inspect the workspace file before deciding whether to retry.`), never leaking paths or content.
  2. **Pure readback-before-retry & landed-write reconciliation (`src/lib/workspaceWriteRecovery.ts` [new]):**
     - Provide pure, `fs`-free helpers (`extractWorkspaceWriteFailure`, `formatWorkspaceWriteErrorMessage`, `reconcileFailedWorkspaceWrite`, `runWorkspaceWriteRecoverySelftest`, `runWorkspaceWriteRecoveryAsyncSelftest`):
       - Preserves bounded sanitized fields (`stage`, `outcome`, `systemCode`, `syscall`, `requestId`) in surfaced errors.
       - **Zero blind retries:** inspects `writeFailure` + optional `GET /api/fs/read?path=...&root=workspace` readback after a failed write (`landed-verified`, `unchanged-verified`, `diverged`, `unconfirmed`).
  3. **Wire Studio callers (`src/components/DirectoryExplorer.tsx`, `src/lib/nativeEditor.ts`):**
     - Keep literal `'/api/fs/write'` in `src/components/DirectoryExplorer.tsx` (`forgeCapabilities.ts:6807` anchor).
     - Adopt landed `sha256` without a duplicate write when readback proves `'landed-verified'`, clear `unconfirmedPath` when zero bytes landed, and surface bounded correlated diagnostics otherwise.
  4. **Selftests, manifest promotion & HTTP route integration (`src/lib/forgeCapabilities.selftest.ts`, `config/forge-route-dispositions.json`, `scripts/route-integration.mjs`):**
     - Wire `runWorkspaceWriteRecoverySelftest()` into `runForgeCapabilitiesSelftest()`.
     - Promote `config/forge-route-dispositions.json` (`+src/lib/workspaceWriteRecovery.ts`, SHA-256 `00da8941dab9619552a78cef4456292b31452a68c66ff0da83e34d84ea38f528`).
     - Add HTTP route checks (`802 -> 804`) verifying `X-Forge-Write-Request-Id`, `/api/agent/files/write` `writeFailure` parity & sanitization, `8,902`-byte intact before-bytes readback, and explicit `10,231`-byte recovery write.
- **Risks & rollback:** Rollback target: `722412e6e073bf1eb022ee4227cd6bd80f6f4759`.

## BASELINE
- **Revision:** `722412e6e073bf1eb022ee4227cd6bd80f6f4759` (`main == origin/main`, Release `0.0.96`), clean working tree.

## RECONCILE
- **Resources & callers searched:** `server.ts` (`workspaceWriteFailure`, `writeWorkspaceFileGuarded`, `POST /api/fs/write`, `POST /api/agent/files/write`, `GET /api/fs/read`), `src/components/DirectoryExplorer.tsx`, `src/lib/nativeEditor.ts`, `src/lib/forgeCapabilities.ts`, `scripts/route-integration.mjs:5129-5141`, `tests/e2e/native-authoring.spec.ts`.
- **Capability-map delta:** `no capability-map delta` (`113` capabilities, Contract SHA-256 `e5268173...` and UI-action parity SHA-256 `3518ab2b...` unchanged; `config/forge-route-dispositions.json` promoted with `+src/lib/workspaceWriteRecovery.ts`, SHA-256 `00da8941dab9619552a78cef4456292b31452a68c66ff0da83e34d84ea38f528`; `50` raw writers / `74f0a969...` and `action-receipt-coverage.json` `dc34d679...` unchanged).

## IMPLEMENT
- **`src/lib/workspaceWriteRecovery.ts` [new]:** Added pure browser/Node-safe failure extraction, bounded error formatting, readback-before-retry reconciliation (`landed-verified`, `unchanged-verified`, `diverged`, `unconfirmed`), and sync/async selftests (`7/7`).
- **`server.ts`:** Added `X-Forge-Write-Request-Id` header on `POST /api/fs/write` & `POST /api/agent/files/write` `500` responses, and unified `failedStages` + `writeFailure` + stage message on `POST /api/agent/files/write`.
- **`src/components/DirectoryExplorer.tsx` & `src/lib/nativeEditor.ts`:** Wired `reconcileFailedWorkspaceWrite` + `formatWorkspaceWriteErrorMessage` without blind retries.
- **`src/lib/forgeCapabilities.selftest.ts`, `config/forge-route-dispositions.json`, & `scripts/route-integration.mjs`:** Wired `runWorkspaceWriteRecoverySelftest`, promoted route-source manifest (`00da8941...`), exposed `headers` on `req(...)`, and added `#68` `8,902 -> 10,231` byte handoff failure/readback/recovery route tests (`804/804`).

## VALIDATE
- `npx tsx -e "import { runWorkspaceWriteRecoveryAsyncSelftest } ..."` -> `7/7 PASS` (`task-15075`).
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`113` capabilities, `402` routes, `task-15109`).
- `npm run test:writers` -> `30/30 + PASS + 8/8` (`task-15082`).
- `npm run test:action-receipt-coverage` -> `PASS` (`dc34d679...`, `141/69`, `task-15109`).
- `npm run typecheck` -> exit `0` (`task-15109`).
- `npm run lint -- --max-warnings 600` -> `0` errors, `578` warnings (`task-15109`).
- `X4_REFERENCE_ROOT=... node scripts/run-e2e.mjs tests/e2e/native-authoring.spec.ts` -> `VERDICT: PASS` (`task-15109`).
- `npm run test:oracles` -> `134/134 PASS` (`task-15109`).
- `npm run test:routes` (`X4_*` env unset) -> `804/804 PASS` (`task-15122`).
- `npm run precommit:check` -> `[precommit] OK` (`task-15136`).

## REVIEW
- Correlated `requestId` in `[workspace-file-write]` server logs, JSON `writeFailure`, and `X-Forge-Write-Request-Id` header across `/api/fs/write` and `/api/agent/files/write`: **Done & evidenced**.
- Structured failure response & explicit before/after observation with zero path/content disclosure: **Done & evidenced**.
- Calling clients (`DirectoryExplorer.tsx`, `nativeEditor.ts`) preserve bounded sanitized error metadata and inspect/read back before any retry (zero blind retries): **Done & evidenced**.
- Recovery verified for both intact prior bytes (`8,902` -> `10,231` after readback) and writes that already landed on disk (`landed-verified`, `0` duplicate writes): **Done & evidenced**.

## CLOSE
- **Status:** `VERIFIED`
- **Remaining risks / deferred work:** Deliver in `0.0.97` VSIX (after Units 56 & 57) and verify against installed `FORGE DEVELOPMENT` before closing `#68`.
- **Suggested commit title:** `feat(files): correlate workspace write failures and reconcile readback state (#68)`

## AAR
- **Triggers:**
  1. Adding `src/lib/workspaceWriteRecovery.ts` to the `forgeCapabilities.selftest.ts` import graph required promoting `config/forge-route-dispositions.json` (`00da8941...`, `task-15082` -> `task-15098`).
  2. Initial `#68` route test on `POST /api/agent/files/write` omitted required `expectedSha256: null` (`400 CAPABILITY_INPUT_INVALID`, `task-15109`); fixed to `expectedSha256: null` (`804/804 PASS`, `task-15122`).
  3. `[REPRODUCED]` `tsx scripts/e2e-vite-server.selftest.ts` inside `task-15122` hit Windows Node 24 / libuv process-exit `0xC0000409` (`3221226505`) after completing `[profile-proxy listener controls] PASS` and retiring its Vite cache; immediate rerun in `task-15136` passed `[precommit] OK`.
- **Sustain:** Reading `#68`'s exact acceptance rules prevented adding blind retries (explicitly forbidden by `#68`) and respected `route-integration.mjs:5138`'s strict path/content non-disclosure rule.
- **Improve work/approach:** Whenever adding a new `src/lib/*.ts` module imported by server/capability modules, promote `config/forge-route-dispositions.json` before running `test:capabilities`, and always supply `expectedSha256` (`string | null`) on `/api/agent/files/write`.
- **Improve tools:** `req(...)` in `scripts/route-integration.mjs` now exposes `headers` so HTTP correlation headers (`X-Forge-Write-Request-Id`, `X-Forge-Validation-Role`, etc.) are directly testable.
- **Highest-risk evidenced weakness:** `tsx scripts/e2e-vite-server.selftest.ts` runs raw `tsx` rather than `node --import tsx` or structured exit-verdict parsing and can hit intermittent Windows libuv teardown `0xC0000409` (`3221226505`) after passing all checks; track as bounded harness item alongside `#112` without expanding `#68` scope.
- **Lessons banked:** `POST /api/agent/files/write` enforces closed CAS input (`expectedSha256: <64-hex> | null`).
