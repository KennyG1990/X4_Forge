# Curated Explicit-Grant MCP & Canonical Capability Projections for Source Files, History Revert, Bulk Transform, and Mod-Folder Import/Drift (#19 P4 Slice 3)

**Status: VERIFIED (isolated Dev source, governance manifests, `134/134` oracles, `707/707` HTTP routes, and `5/5` real child-backend stdio MCP suites; `#19` overall remains PARTIAL pending P4 Slice 4 & `0.0.94` installed IDE/E2E qualification).**
**Lane:** FULL.
**Owner:** [#19](https://github.com/KennyG1990/X4_Forge/issues/19) (`P4` gap-closure slice in `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md`).

## 1. Plan & Acceptance Contract

- **Bounded unit:** Close eight high-leverage source-file, undo/revert, bulk-transform, and mod-folder import/drift parity gaps across `files.bulk_transform.execute`, `files.history_and_snapshots.manage`, `files.project_sources.manage`, and `workspace.mod_folder.import_and_sync` in `FORGE_UI_ACTION_PARITY_CENSUS`, gated behind explicit per-key capability and effect grants (`EXPLICIT_CAPABILITY_GRANT_IDS`) so legacy/preset `read`, `write`, and `deploy` keys gain zero automatic filesystem or workspace mutation MCP authority while all existing Studio and legacy HTTP routes remain 100% compatible:
  1. **`bulk.transform.preview@1`** (`POST /api/agent/bulk-transform/preview-plan`) + MCP tool **`preview_bulk_transform`** (`connected`).
  2. **`bulk.transform.apply@1`** (`POST /api/agent/bulk-transform/execute`) + MCP tool **`apply_bulk_transform`** (`connected`, supporting `detail: 'compact' | 'full'` with default `'compact'`, promoting `body.operationId` into `x-forge-operation-id`, and delegating to `executeBulkTransformApplyReceipt` while keeping `POST /api/agent/bulk-transform/apply` untouched as `reviewed-legacy`). Flips `files.bulk_transform.execute` in `FORGE_UI_ACTION_PARITY_CENSUS` from `partial` to **`available`** (`available: 12 -> 13`, `partial: 27 -> 26`, `openGaps: 37 -> 36`).
  3. **`files.list@1`** (`GET /api/agent/files/list`) + MCP tool **`list_workspace_files`** (`connected`: shallow bounded directory listing `<= 500` items across `workspace` or `filesystem` root without host root paths).
  4. **`files.read@1`** (`GET /api/agent/files/read`) + MCP tool **`read_workspace_file`** (`connected`: UTF-8 regular file read `<= 512 KiB` with `sha256`, `bytes`, optional `expectedWorkspaceRootId`, and host `absolutePath` redacted).
  5. **`files.write@1`** (`POST /api/agent/files/write`) + MCP tool **`write_workspace_file`** (`connected`: CAS-mandatory `expectedSha256: string | null`, default `strict: true` XML/scriptproperty preflight before write, `<= 512 KiB`, sharing `writeWorkspaceFileGuarded` and redacting `absolutePath`).
  6. **`history.revert@2`** (upgrading `history.revert@1`, `POST /api/agent/history/revert`) + MCP tool **`revert_action_history`** (`connected`: body `{ id, detail?: 'compact' | 'full' }`, sharing `handleHistoryRevertById` and `extensions`/`modWorkspacePath` source leases with `POST /api/agent/history/:id/revert`).
  7. **`workspace.mod.drift@1`** (`GET /api/agent/mod-folder/drift`) + MCP tool **`get_mod_drift`** (`connected`: deterministic workspace-vs-deployed `DriftReport` over `computeModDrift`).
  8. **`workspace.mod.import@1`** (`POST /api/agent/mod-folder/sync`) + MCP tool **`import_mod_folder`** (`connected`: dry-run preview by default or CAS-guarded `apply: true` direct commit to the addressed `workspaceRegistry` with one-use `DestructiveRecoveryStore` workspace recovery, eliminating the multi-megabyte `ModWorkspace` round-trip echo).
- **Out of scope:**
  - Editor/authoring read-only helpers (`suggest/expression`, `xpath-synth`, `patch-targets`, `override-map`, `galaxy-map`, `mod-dependency-graph` — `#19` P4 Slice 4).
  - Modifying live Forge, `FORGE DEVELOPMENT` IDE (`0.0.89`), `AiLive`, X4 game installation, or saves.
- **Rollback / checkpoint:** Clean pushed `origin/main` checkpoint `c7dbbb3277b4fd715da88c45a35c4e1f6e35e377` (`Quality` CI `45368191048` `success`).

## 2. Baseline

- **Revision:** `c7dbbb3277b4fd715da88c45a35c4e1f6e35e377` on `main` (`HEAD == origin/main`), `Quality` CI `45368191048` `success`.
- **Governance state:** `44` capabilities (`41` non-native), `336` literal routes, `44` MCP aliases (`MCP_MODULE_AUDIT_VERSION = 27`), `106` receipt-coverage routes / `69` surfaces.

## 3. Reconciliation

- **Resources & couplings checked:**
  - `src/server/bulkTransformApplyReceiptAdapter.ts:301-305, 419-421, 705`: `executeBulkTransformApplyReceipt` binds `BULK_TRANSFORM_APPLY_ROUTE_KEY = 'POST /api/agent/bulk-transform/apply'` and asserts `'legacyRoute' in capability && capability.legacyRoute === '/api/agent/bulk-transform/apply'`. Keeping `POST /api/agent/bulk-transform/apply` as `reviewed-legacy` (`legacy-agent-api`) while adding `POST /api/agent/bulk-transform/execute` (`bulk.transform.apply@1`) delegating to the shared handler preserves 100% receipt-adapter compatibility.
  - `src/lib/agentHistory.ts:206-212`: `ledgerRouteKind` checks `if (path.startsWith('/api/agent/history')) return null;` right after `LEDGER_REVERT_PATTERN`; matching `path === '/api/agent/history/revert'` alongside `LEDGER_REVERT_PATTERN` ensures MCP reverts record visible `'revert'` ledger rows and satisfy `action-receipt-coverage` non-quiet mutation invariants.
  - **`[REPRODUCED]` pre-existing bulk-transform revert bug (`server.ts:6900-6924` vs `src/server/bulkTransformApplyReceiptAdapter.ts:775-778`):** `bulkTransformApplyReceiptAdapter` stores 64-hex `workspaceContentReceiptHash` / `workspaceSnapshotReceiptHash` digests in `expectedCurrentHash` and `expectedCurrentSnapshotHash`, whereas `handleHistoryRevertById` in `server.ts` compared them unconditionally against 16-hex `workspaceHash(record)` and `workspaceRegistry.snapshotHash(record)`, causing every bulk-transform workspace undo to fail with `409 RECOVERY_STALE`. Fixed in `handleHistoryRevertById` so both 64-hex receipt hashes and 16-hex workspace heads verify cleanly across both `/api/agent/history/:id/revert` and `/api/agent/history/revert`.
- **Capability-map delta:** Upgrades `history.revert@1 -> @2` and adds `bulk.transform.apply@1`, `bulk.transform.preview@1`, `files.list@1`, `files.read@1`, `files.write@1`, `workspace.mod.drift@1`, and `workspace.mod.import@1` (`44 -> 51` capabilities, `44 -> 52` MCP tools, `336 -> 344` literal routes, `106 -> 111` receipt-coverage routes).

## 4. Implementation Summary

- **`src/lib/agentCapabilityAuthority.ts`:** Exported `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES` (`bulk.transform.apply`, `bulk.transform.preview`, `files.list`, `files.read`, `files.write`, `history.revert`, `workspace.mod.drift`, `workspace.mod.import`) and added them to `EXPLICIT_CAPABILITY_GRANT_IDS`.
- **`src/lib/agentHistory.ts`:** Added `'/api/agent/bulk-transform/preview-plan'` to `LEDGER_QUIET_ROUTES`, added `'/api/agent/bulk-transform/execute'`, `'/api/agent/files/write'`, `'/api/agent/history/revert'`, and `'/api/agent/mod-folder/sync'` to `LEDGER_ROUTES`, matched `path === '/api/agent/history/revert'` in `ledgerRouteKind`, and added semantic `describeAction` titles for `/api/agent/bulk-transform/execute` and `/api/agent/mod-folder/sync`.
- **`src/server/bulkTransformRoutes.ts`, `src/server/referenceRoutes.ts`, & `server.ts`:**
  - Exported `executeBulkTransformPreviewRoute` and `executeBulkTransformApplyRoute` (`detail?: 'compact' | 'full'`).
  - Fixed `handleHistoryRevertById` (`server.ts`) to support both 64-hex `workspaceContentReceiptHash`/`workspaceSnapshotReceiptHash` (used by `bulkTransformApplyReceiptAdapter`) and 16-hex `workspaceHash`/`snapshotHash` (used by `executeWorkspaceReceiptMutation`), plus `detail: 'compact' | 'full'`.
  - Updated `respondAgentReferenceStatus` (`src/server/referenceRoutes.ts`) to schedule/refresh the SQLite `referenceManifest` when `!observe` and `manifest.state === 'idle'` or `refresh === '1'`.
  - Registered top-level `/api/agent/bulk-transform/preview-plan`, `/api/agent/bulk-transform/execute`, `/api/agent/files/list`, `/api/agent/files/read`, `/api/agent/files/write`, `/api/agent/history/revert`, `/api/agent/mod-folder/drift`, and `/api/agent/mod-folder/sync` in `server.ts` (`durableKeyRoute` + `sourceOperationKeys` + `executeWorkspaceReceiptMutation` `transformSuccessBody` + host-path redaction).
- **`src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`:** Upgraded `history.revert@1 -> @2`, added `7` explicit-grant capabilities (`51` total, Contract SHA-256 `367f7750bde7dfaa273b71d733b05661a09f061ef8127c6e235cfad1cec5282e`), and updated `FORGE_UI_ACTION_PARITY_CENSUS` (`available: 12 -> 13`, `partial: 27 -> 26`, `openGaps: 37 -> 36`, SHA-256 `0cb9203095639cedb2b733b86388613c230a8361e93375d555a2a0b128f457da`).
- **`vscode-extension/mcp/x4forge-mcp.cjs` & `scripts/capability-contract-audit.ts`:** Added `WORKSPACE_FILES_TOOLS` (`8` tools, `52` total MCP mappings, `MCP_MODULE_AUDIT_VERSION = 28`), explicit-grant checks, outage withdrawal, and structured error response forwarding (`isError: true`).
- **Governance manifests & test suites:**
  - Promoted `config/forge-route-dispositions.json` (`344` literal routes, SHA-256 `9d00afe004b1d17f9db20502d224fc212ee7a8bbe30ec8ead72ce1f356d22ee5`).
  - Added legacy `durableRoutePolicy` for `POST /api/agent/history/:id/revert` in `scripts/action-receipt-coverage-audit.ts`, promoted `config/action-receipt-coverage.json` (`111` routes / `69` surfaces, manifest SHA-256 `3e622b44b5c08d06e8c5e5e46e24dada84001a05a0d87b92503a75357bb9a407`), and updated `src/lib/actionReceiptPolicyBundle.ts`, `src/lib/actionReceiptPolicyBundle.selftest.ts`, and `src/server/workspaceReceiptService.selftest.ts`.
  - Added `scripts/workspace-files-mcp.selftest.ts` (`npm run test:workspace-files-mcp`), updated `scripts/mcp-capability-selftest.ts`, and added HTTP route & capability-envelope checks in `scripts/route-integration.mjs`.

## 5. Validation Evidence

- `npm run lint -- --max-warnings 600` -> **PASS (`0` errors, `578` warnings)**.
- `npm run typecheck` -> **PASS (`0`)**.
- `runForgeCapabilitiesSelftest()` -> **PASS (`77/77`)**.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> **PASS (`51` capabilities, `344` literal routes, `52` MCP aliases, `51` UI-action parity rows)**.
- `npm run test:writers` -> **PASS (`30/30 + PASS + 8/8`, zero `durable-writers.json` drift)**.
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> **PASS (`111` routes / `69` surfaces, `79/79 + 23/23`)**.
- `npx tsx scripts/c06-contracts.selftest.ts` -> **PASS (`196/196`)**.
- `npm run test:mcp-capabilities` -> **PASS (`read=23, write=28, deploy=29`, `CUSTOM_TOOLS=5`, `LEGACY_TOOLS=10`)**.
- `npm run test:native-deploy-mcp` -> **PASS (`6/6`)**.
- `npm run test:workspace-files-mcp` -> **PASS (`5/5` real child backend + stdio MCP across preset non-grant, read-only narrowing, CAS/strict-XML file writes + revert, mod drift + import commit + one-use workspace revert, and bulk-transform preview/apply + CAS conflict + one-use revert)**.
- `X4_REFERENCE_ROOT=... npm run test:reference-api` -> **PASS (`93/93`)**.
- `npm run test:oracles` -> **PASS (`134/134` green)**.
- `npm run test:routes` -> **PASS (`707/707 PASS`)**.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run precommit:check` -> **PASS (`[precommit] OK`)**.

## 6. Review & Close

- **Status:** `VERIFIED` (for `#19` P4 Slice 3 in isolated Dev source, HTTP, and stdio MCP; `#19` overall remains `PARTIAL` pending P4 Slice 4 and `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): expose explicit-grant source file, revert, bulk-transform, and import tools (#19)`

## 7. Triggered AAR

1. **Points to sustain:**
   - Writing a real isolated child-backend + stdio MCP selftest (`scripts/workspace-files-mcp.selftest.ts`) rather than relying solely on synthetic mocks immediately caught three real end-to-end defects before commit: (a) `GET /api/agent/mod-folder/drift` omitting `mod` on `available: true`; (b) `GET /api/agent/reference/status` leaving `referenceManifest` `idle` under `API_ONLY=true`; and (c) the pre-existing `64`-hex vs `16`-hex `RECOVERY_STALE` bug in `handleHistoryRevertById` on bulk-transform workspace recovery records.
2. **Points to improve - work/approach:**
   - When upgrading an existing canonical capability (`history.revert@1 -> @2`) onto a new primary route (`POST /api/agent/history/revert`) while keeping its old path (`POST /api/agent/history/:id/revert`) as `reviewed-legacy`, check both `scripts/action-receipt-coverage-audit.ts` (`legacyRoutePolicy`) and `src/server/workspaceReceiptService.selftest.ts` (`ROUTE_KEY`) upfront so the retired route does not fall through to `conditionalRefusal`.
   - Remember to include a `vscode-extension-*` entry in `surfaces.ui` on every new `FORGE_CAPABILITIES` descriptor and update `expectedCapabilityIds` / `expectedCapabilityIdentity` in `scripts/route-integration.mjs` (`lines 810-825`) alongside `capabilityResponses.set(...)`.
3. **Points to improve - tools:**
   - `scripts/route-integration.mjs` called synchronous `process.exit(...)` immediately after closing child servers, triggering intermittent Windows Node v24 libuv `0xC0000409` handle teardown crashes when `undici` keep-alive sockets were still draining; adding a brief `75 ms` drain before `process.exit(...)` eliminated the crash cleanly.
4. **Highest-risk observed weakness:**
   - **Mixed 16-hex vs 64-hex workspace hash representations across recovery producers (`evidence: scripts/workspace-files-mcp.selftest.ts` check #5):** `executeWorkspaceReceiptMutation` writes 16-hex `workspaceHash`/`snapshotHash` into `DestructiveRecoveryStore`, whereas `bulkTransformApplyReceiptAdapter` writes 64-hex `workspaceContentReceiptHash`/`workspaceSnapshotReceiptHash` into `expectedCurrentHash`/`expectedCurrentSnapshotHash`. Fixed in `handleHistoryRevertById` by checking hash length (`64` vs `16`) and computing the matching canonical digest.
