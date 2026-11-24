# Plan & Close — `#19` P4 Slice 7: Action History Raw Blob Read & Compact CAS Workspace Snapshot Management across API & MCP

- **Date:** 2026-11-24
- **Status:** `VERIFIED` (Dev source, governance manifests, `134/134` oracles, `748/748` HTTP routes, `10/10` real child-backend stdio MCP; `#19` remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification)
- **Lane:** `FULL`
- **Owners / Issues:** `#19` (`files.history_and_snapshots.manage`)

## 1. Plan And Acceptance Contract

- **Bounded unit:** Project Action Ledger raw diff/before/after/diagnostics blob inspection and compact, CAS-guarded, reversible Workspace Snapshot management (`list`, `create`, `restore`, `delete`) across canonical capabilities, protected Agent HTTP endpoints, and stdio MCP tools, flipping `files.history_and_snapshots.manage` in `FORGE_UI_ACTION_PARITY_CENSUS` from `partial` to `available` (`available: 15 -> 16`, `partial: 24 -> 23`, `openGaps: 34 -> 33`):
  1. **`history.raw.read@1`** (`read_action_history_blob` -> `GET /api/agent/history/raw`, `effects: ['read']`, `agentScopes: ['read', 'write', 'deploy']`, `context.workspace: 'required'`):
     - Closed query: `id` (required non-empty string `<= 128`), optional `which` (`'diff' | 'before' | 'after' | 'diagnostics'`, default `'diff'`).
     - Shares blob/receipt verification logic (`respondHistoryRawPayload`) with `GET /api/agent/history/:id/raw`, bounding returned `content` at `256 KiB` (`262,144` chars) with `bytes`, `contentLength`, and `contentTruncated` metadata.
  2. **`snapshots.list@1`** (`list_workspace_snapshots` -> `GET /api/agent/snapshots/list`, `effects: ['read']`, `agentScopes: ['read', 'write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `context.workspace: 'optional'`):
     - Closed query: `modId` (required single-segment relative mod folder name inside `Mod Workspace`).
     - Returns compact snapshot metadata (`snapshotName`, `name`, `savedAt`, `sha256`, `bytes`, `nodeCount`, `linkCount`) filtered by `.studio-mod-id` when present, without inlining multi-megabyte `ModWorkspace` JSON bodies.
  3. **`snapshots.create@1`** (`create_workspace_snapshot` -> `POST /api/agent/snapshots/create`, `effects: ['filesystem-write', 'audit-write', 'audit-retention-delete']`, `agentScopes: ['write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `context.workspace: 'required'`, `LEDGER_ROUTES` `kind: 'snapshot'`):
     - Closed body: `{ modId, name? }`.
     - Captures the addressed Studio workspace (`requestWorkspace(req).workspace`) directly into `<modId>/.snapshots/snapshot_<stamp>.json` via `writeWorkspaceFileGuarded`, prunes oldest snapshots beyond `30` via `unlinkRegularWorkspaceFile`, and emits a one-use `undo-create` `FileRecoveryRecord` (`recovery`).
  4. **`snapshots.restore@1`** (`restore_workspace_snapshot` -> `POST /api/agent/snapshots/restore`, `effects: ['workspace-write', 'audit-write', 'audit-retention-delete']`, `agentScopes: ['write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `context.workspace: 'required'`, `LEDGER_ROUTES` `kind: 'snapshot'`):
     - Closed body: `{ operationId, modId, snapshotName, expectedHead, expectedSnapshotHash, expectedVersion?, detail?: 'compact' | 'full' }`.
     - Delegates to `executeWorkspaceSnapshotRestoreReceipt` (same receipted engine as `POST /api/fs/restore-snapshot`), defaulting `detail` to `'compact'` (`workspaceSummary` instead of full `workspace` JSON) and returning one-use `DestructiveRecoveryStore` workspace undo (`recovery`).
  5. **`snapshots.delete@1`** (`delete_workspace_snapshot` -> `POST /api/agent/snapshots/delete`, `effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete']`, `agentScopes: ['write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `context.workspace: 'optional'`, `LEDGER_ROUTES` `kind: 'snapshot'`):
     - Closed body: `{ modId, snapshotName, expectedSha256 }`.
     - Verifies physical single-link regular file inside `<modId>/.snapshots/` and exact `expectedSha256` (`409 SNAPSHOT_CHANGED` before unlink on mismatch), creates a one-use `delete-file` `FileRecoveryRecord`, unlinks via `unlinkRegularWorkspaceFile`, and allows `executeFileRecoveryRestore` to restore exact 3-segment `[modFolder, '.snapshots', 'snapshot_*.json']` records while keeping `.git` and all other hidden paths blocked (`403 HIDDEN_PATH_FORBIDDEN`).
- **Out of scope:** Unbounded streaming of raw multi-megabyte snapshot JSON over stdio MCP (`read_workspace_file` remains hidden-path-blocked; `restore_workspace_snapshot` applies snapshots directly on the backend) and live IDE/game writes.
- **Risks & authorization boundaries:**
  - Zero new raw `fs.*` mutation calls (`50` raw writer sources in `config/durable-writers.json` unchanged).
  - All four `snapshots.*@1` capabilities require an explicit key grant (`WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`), keeping default preset `read`/`write`/`deploy` tool counts minimal (`35 / 40 / 41`, `+1` for `read_action_history_blob`).
- **Rollback / checkpoint:** `66b3793b8c7e544435870434f2198d0a3f163dcb` (`origin/main`).

## 2. Baseline & Reconciliation

- **Baseline:** `origin/main` at `66b3793b8c7e544435870434f2198d0a3f163dcb` (GitHub Actions `Quality` run `45423769322` `SUCCESS`, `68` capabilities, `357` routes, `121` receipt-coverage routes / `69` surfaces, `69` MCP tools).
- **Reconciliation findings:**
  - `GET /api/agent/history/:id/raw` used parameterized `:id` (disallowed for primary MCP `GET` template literals in `capability-contract-audit.ts`), so `respondHistoryRawPayload` was extracted and shared with literal query-bound `GET /api/agent/history/raw`.
  - `src/lib/agentHistory.ts` (`revertibility`) previously checked `kind === 'workspace'` for `hasRecovery`, leaving `kind === 'snapshot'` (`POST /api/fs/restore-snapshot` and `/api/agent/snapshots/*`) non-revertible in `handleHistoryRevertById`; updated `revertibility` to accept `(kind === 'workspace' || kind === 'snapshot')` and updated `normalizeHistoryRecoveryTruth` to require `row.recoveryKind === 'workspace'` before reporting workspace-kind recovery truth.
  - `executeFileRecoveryRestore` (`server.ts:6318`) rejected dot-prefixed segments via `includeFilesystemEntry`; allowed exact 3-segment `[modFolder, '.snapshots', 'snapshot_*.json']` file recoveries while preserving `403 HIDDEN_PATH_FORBIDDEN` for `.git` and every other dotfile/dotdir.
- **Capability-map delta:** `68 -> 73` capabilities (`history.raw.read@1`, `snapshots.create@1`, `snapshots.delete@1`, `snapshots.list@1`, `snapshots.restore@1`; Contract SHA-256 `d31de35e28e30c2b9279f083f2424eb0e41188c730dbafbcf410b0fdb8459874`), `357 -> 362` disposed literal routes (`config/forge-route-dispositions.json` SHA-256 `7a494870218e7c950916a15f3c38dbc0649d29d14fc343f0970d47dd3b85c604`), `121 -> 124` non-GET receipt-coverage routes / `69` surfaces (`config/action-receipt-coverage.json` SHA-256 `ed641d09972fc49c56e6de5cdfc50af3abd7bdb385aea894b2f9ffa7677b85e2`), `69 -> 74` MCP aliases (`MCP_MODULE_AUDIT_VERSION = 33`), `FORGE_UI_ACTION_PARITY_CENSUS` `files.history_and_snapshots.manage` flipped `partial -> available` (`available: 15 -> 16`, `partial: 24 -> 23`, `openGaps: 34 -> 33`, UI-action parity SHA-256 `d537d4f4d10fa0f75a22c0ce9d9a2e0e9aaf3e9aec4dd24cbbc92b998a78e0ae`).

## 3. Validation Evidence

- `npm run lint -- --max-warnings 600` -> `0` errors, `579` warnings (`<= 600`).
- `npm run typecheck` -> exit `0`.
- `npm run test:writers` -> `30/30 + PASS + 8/8` (`50` raw filesystem writer sources unchanged; `sourceFingerprint: 1d43ae6417943cc0632b4f5c80de8d6406d499ab4d228325777564cee458c60c`).
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`73` capabilities, `362` routes, `74` MCP aliases, `51` UI-action parity rows).
- `runForgeCapabilitiesSelftest()` -> `92/92` (`pass: true`).
- `runAgentHistorySelftest()` -> `pass: true`.
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> `PASS` (`124` routes / `69` surfaces, `79/79` incl. `policyBundle: 19/19`, `23/23` promotion).
- `npx tsx scripts/c06-contracts.selftest.ts` -> `196/196` (`allPassed: true`).
- `npx tsx scripts/c06-api.selftest.ts` -> `42/42` (`allPassed: true`).
- `npm run test:mcp-capabilities` -> `PASS` (`read=35, write=40, deploy=41`, `CUSTOM_TOOLS=5`, `LEGACY_TOOLS=10`).
- `npm run test:native-deploy-mcp` -> `6/6 PASS`.
- `npm run test:workspace-files-mcp` -> `10/10 PASS` (check `10_history_raw_blob_and_cas_workspace_snapshots_create_list_restore_delete_undo_over_mcp` proving raw diff/diagnostics reads, compact snapshot create/list + `undo-create` reversal, stale `expectedHead` `409` refusal + compact `restore_workspace_snapshot` + one-use `revert_action_history`, stale `expectedSha256` `409 SNAPSHOT_CHANGED` refusal + `delete_workspace_snapshot` + one-use `restore_workspace_file`, and `.git/config` `403 HIDDEN_PATH_FORBIDDEN`).
- `npm run build` -> exit `0`.
- `npm run test:oracles` -> `134/134 green`.
- `npm run test:routes` -> `748/748 PASS` (with `X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset).
- `npm run precommit:check` -> `[precommit] OK`.

## 4. Review & Close

- **Status:** `VERIFIED` (Dev source, governance manifests, isolated runtime HTTP, and real child-backend stdio MCP; `#19` remains `PARTIAL` overall pending remaining census slices and `0.0.94` packaged IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): project action history raw blob read and CAS workspace snapshots (#19)`

## 5. AAR (Triggered)

- **Triggers:**
  1. Running `npx tsx -e` without `--input-type=module` evaluated inline code in sloppy mode so `Object.freeze` mutations in `runActionReceiptPolicyBundleSelftest()` did not throw `TypeError` (`node --import tsx --input-type=module -e` ran `19/19` in strict ESM mode).
  2. `test:oracles` (`133/134` on attempt 1) caught the literal substring `'timestamp'` inside prose word `'timestamped'` in `snapshots.create@1`'s description (`!canonical.includes('timestamp')` in `forgeCapabilities.selftest.ts:70`). Replaced with `'time-stamped'`, re-promoted `config/forge-route-dispositions.json` (`7a494870...`), and passed `134/134` oracles + `748/748` routes + `precommit:check`.
- **Points to sustain:**
  - Reusing `writeWorkspaceFileGuarded`, `unlinkRegularWorkspaceFile`, and `executeWorkspaceSnapshotRestoreReceipt` added 5 capabilities and 5 HTTP routes with zero new raw `fs.*` writer sources (`50` unchanged).
  - Running `test:oracles` over compiled `dist/server.cjs` immediately caught `forgeCapabilities.selftest.ts`'s full-string `!canonical.includes('timestamp')` invariant before commit.
- **Points to improve — work/approach:**
  - Always check `canonicalCapabilityContractPayload()` against `includes('timestamp')` and `includes('generatedAt')` (even inside prose words like `timestamped`) before first promotion so `config/forge-route-dispositions.json` only needs one promotion pass.
- **Points to improve — tools:**
  - Always invoke inline TS checks via `node --import tsx --input-type=module -e` rather than `npx tsx -e` so ESM strict-mode semantics (`Object.freeze` throws `TypeError`) match production.
- **Highest-risk evidenced weakness:** `forgeCapabilities.selftest.ts:70` runs only inside `runForgeCapabilitiesSelftest()` / `test:oracles` rather than during `capability-contract-audit.ts --generate-candidate`, allowing a description containing `'timestamp'` to promote into `config/forge-route-dispositions.json` before `test:oracles` rejects it; banked in `SESSION-HANDOFF.md` to run `runForgeCapabilitiesSelftest()` prior to `--generate-candidate`.
