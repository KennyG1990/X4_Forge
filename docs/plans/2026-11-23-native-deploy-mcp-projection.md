# Curated Native Deploy, Status, Receipt/Recovery, and Undo MCP Projection (#19 P3)

**Status: PARTIAL — VERIFIED across source, governance manifests, isolated HTTP backend (`672/672` routes, `134/134` oracles), real stdio MCP (`6/6`), CAS/preview bindings, recovery/undo, and key revocation; installed `0.0.94` IDE/E2E & live X4 runtime remain gated.**
**Lane:** FULL.
**Owner:** [#19](https://github.com/KennyG1990/X4_Forge/issues/19) (`P3` in `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md`; reinforces native deploy replacement of external scripts under [#20](https://github.com/KennyG1990/X4_Forge/issues/20)).

## 1. Plan & Acceptance Contract

- **Bounded unit:** Expose native deployment preview, CAS/preview-bound apply, operation/receipt/target/effect status, and one-use CAS deployment undo as four curated capabilities and MCP tools over the existing native deploy, status, and recovery owners (`deploy.preview@1` / `preview_native_deploy`, `deploy.apply@1` / `apply_native_deploy`, `deploy.status@1` / `get_deploy_operation_status`, `deploy.undo@1` / `undo_native_deploy`), gated behind explicit per-key capability and effect grants.
- **Assumptions:**
  - `scripts/capability-contract-audit.ts` (`line 8431`) and `src/lib/actionReceiptCoverageInventory.ts` (`line 118`) enforce a strict 1-to-1 primary route-to-capability ownership rule, and `callPath()` (`scripts/capability-contract-audit.ts:4322`) forbids dynamic path-segment interpolation before `?` in `vscode-extension/mcp/x4forge-mcp.cjs`.
  - Four dedicated literal adapter routes (`/api/agent/deploy-verify/preview`, `/api/agent/deploy-verify/apply`, `/api/agent/deploy-verify/status`, `/api/agent/deploy-verify/undo`) delegate directly to the existing `deployVerifyHandler`, `GET /api/agent/status` (`deployOperationId`), and `POST /api/agent/history/:id/revert` (`deploy` recovery) owners without duplicating deployment, validation, receipt, or recovery logic, while leaving legacy HTTP routes (`POST /api/agent/deploy`, `POST /api/agent/deploy-verify`, `GET /api/agent/status`, `POST /api/agent/history/:id/revert`) 100% compatible.
- **Authoritative references:**
  - `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md` (`§ Deployment format and native deploy through MCP`, `§ Acceptance and validation contract`, `P3`).
  - `docs/plans/2026-11-09-deploy-undo-target-coordination.md` (extensions-root coordination and durable key verification on deploy undo/observation).
  - `server.ts` (`deployVerifyHandler`, `GET /api/agent/status`, `POST /api/agent/history/:id/revert`, `sourceOperationKeys`, `durableKeyRoute`).
  - `src/lib/forgeCapabilities.ts`, `src/lib/agentCapabilityAuthority.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`.
- **In scope:**
  1. Explicit-grant narrowing in `src/lib/agentCapabilityAuthority.ts` (`DEPLOY_EXPLICIT_GRANT_CAPABILITIES`: `deploy.apply`, `deploy.preview`, `deploy.status`, `deploy.undo`) so legacy/preset `read`, `write`, and `deploy` keys gain zero automatic MCP deployment authority (`docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md:12,48,56`).
  2. Capability catalog registration (`src/lib/forgeCapabilities.ts`, `src/lib/forgeCapabilities.selftest.ts`) for `deploy.apply@1`, `deploy.preview@1`, `deploy.status@1`, and `deploy.undo@1`.
  3. Thin server route adapters in `server.ts`, `src/lib/agentHistory.ts`, and `src/server/projectApiContract.ts`:
     - `POST /api/agent/deploy-verify/preview`: validates strict preview input (`path` + optional `root`, or `useAddressedWorkspace: true`; optional `deployFormat`, `detail`, `autoReimport`, `inspectDeployOperationId`, `projectCheckSuiteReceiptId`, `expectedProjectCheckSuiteReceiptHash`, `acceptances`), refuses `dryRun: false` or apply-only fields before coordination, forces `dryRun: true`, and delegates to `coordinatedSourceOperation(deployVerifyHandler)`.
     - `POST /api/agent/deploy-verify/apply`: validates strict apply input including required `operationId` and required preview identities (`expectedModId`, `expectedSourceHash`, `expectedArtifactHash`, `expectedBindingHash`, `expectedTargetFingerprint`), promotes `operationId` into `x-forge-operation-id` before `sourceOperationKeys(req)` runs (refusing mismatched header vs body `operationId`), forces `dryRun: false`, and delegates to `coordinatedSourceOperation(deployVerifyHandler)`.
     - `GET /api/agent/deploy-verify/status`: validates strict query (`deployOperationId` required, optional `inspectDeployTarget` `'1' | 'managed'`, optional `inspectDeployEffect` `'1'`) and shares an extracted status/observation helper with `GET /api/agent/status`.
     - `POST /api/agent/deploy-verify/undo`: validates strict undo selector (exactly one of `deployOperationId`, `recoveryId`, or `historyId`), acquires the extensions-root source lease in `sourceOperationKeys(req)`, verifies durable deploy-key and workspace/actor ownership before reading or consuming recovery state, refuses non-deploy history/recovery records (`409 NOT_DEPLOY_RECOVERY`), and shares an extracted deployment-recovery restore helper with `POST /api/agent/history/:id/revert`.
  4. Curated stdio MCP projections in `vscode-extension/mcp/x4forge-mcp.cjs` (`preview_native_deploy`, `apply_native_deploy`, `get_deploy_operation_status`, `undo_native_deploy`) with live-discovery-only gating, explicit capability+effect grant verification, structured JSON error forwarding, and `isError: true` on both HTTP `>=400` and HTTP `200` operational failures (`ok === false` / `success === false`, such as `UNACCEPTED_MOD_FINDINGS`) so transport success never masquerades as deploy or game success.
  5. Candidate generation and promotion for `config/forge-route-dispositions.json`, `config/durable-writers.json`, and `config/action-receipt-coverage.json` (plus `src/lib/actionReceiptPolicyBundle.ts` & `.selftest.ts`), updated capability/MCP audits, and a dedicated real backend + stdio MCP selftest (`scripts/native-deploy-mcp.selftest.ts`).
- **Out of scope:**
  - UI-wide capability parity census (`#19` P2 — separate next unit).
  - Modifying live Forge, `FORGE DEVELOPMENT` IDE (`0.0.89`), `AiLive`, X4 game installation, or saves.
  - Creating a parallel deployment engine, standalone deploy CLI, or bypassing preview/CAS/approval gates.
- **Risks & authorization boundaries:**
  - Accidental widening of legacy `deploy` keys -> prevented by `requiresExplicitCapabilityGrant` on all four `deploy.*` capabilities plus negative MCP/route tests.
  - Cross-workspace or cross-key undo via raw `recoveryId` -> prevented by requiring an actor+workspace-owned committed `ActionReceipt` (for agent keys) or workspace-owned `deploy` ledger row (for Studio sessions) matching `recoveryId` before reading/consuming recovery state.
  - Transport `200` with `ok: false` (`UNACCEPTED_MOD_FINDINGS`, `compile-failed`, `wellformed-failed`) misread as success -> prevented by `isError: true` in `x4forge-mcp.cjs` while returning the full structured response (`acceptanceRequest`, `blockingFindings`, `checklist`).
- **Rollback / checkpoint:** Clean `git` checkpoint at `8a4f4dc` on `G:\Forge-QA\forge-development` (`main`).
- **Acceptance criteria & required validation:**
  1. Preset `read`, `write`, and unconstrained `deploy` keys advertise zero `deploy.*` MCP tools and receive `403 CAPABILITY_NOT_GRANTED` on the new `/api/agent/deploy-verify/*` routes, while legacy `/api/agent/deploy-verify` HTTP callers continue working unchanged.
  2. An explicitly granted `deploy` key discovers and invokes `preview_native_deploy`, `apply_native_deploy`, `get_deploy_operation_status`, and `undo_native_deploy` over real stdio MCP against an isolated scratch backend:
     - `preview_native_deploy` exercises both `loose` and `catalog` per-deploy overrides without mutating target files or persisted `deployFormat` config.
     - `apply_native_deploy` refuses stale/mismatched preview hashes and target fingerprints (`409` with `isError: true` and zero writes), surfaces `UNACCEPTED_MOD_FINDINGS` as `isError: true` with actionable `acceptanceRequest`, and commits verified `loose` and `catalog` deployments when identities/acceptances match.
     - `get_deploy_operation_status` reports committed receipt, `managedObservation` (`matches-committed`), `targetObservation`, and `effectReport`, and returns `404 DEPLOY_OPERATION_NOT_FOUND` (`isError: true`) for unknown or foreign operations.
     - `undo_native_deploy` restores exact pre-deploy target state (`absent` or prior files) via `deployOperationId` / `recoveryId`, refuses a second replay (`409 RECOVERY_ALREADY_USED`), and refuses cross-workspace/revoked-key undo.
  3. All governance and regression gates pass: `npm run test:writers`, `npm run test:capabilities`, `npm run test:action-receipt-coverage`, `npm run test:action-receipt-coverage:selftest`, `npm run test:mcp-capabilities`, `npm run test:native-deploy-mcp`, `npm run lint`, `npm run build`, `npm run test:oracles`, `npm run test:routes` (with `X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset), and `npm run precommit:check`.
  - **Unavailable validation:** Installed `0.0.94` IDE host / full Playwright E2E and live X4 game runtime check (gated on Ken's `0.0.94` release window and Claude's X4 test lane -> unit closes `PARTIAL` on installed host/E2E, `VERIFIED` across source, isolated HTTP backend, and stdio MCP).

## 2. Baseline

- **Revision:** `8a4f4dc` on `main` (`G:\Forge-QA\forge-development`), clean working tree, 21 commits ahead of `origin/main` (`e9c12e1`, `0.0.93`).
- **Current governance state:**
  - `config/forge-route-dispositions.json`: `327` literal routes, `31` capabilities (`28` non-native), `29` MCP aliases (`MCP_MODULE_AUDIT_VERSION = 24`).
  - `config/durable-writers.json`: `sourceFingerprint = 3dba91cb24d8a0ac4c73181239062f177b5a6f2c2b364f466d9481debf1ee63e` (`50` raw filesystem writer sources, `0` new raw FS writers planned).
  - `config/action-receipt-coverage.json`: `manifestSha256 = aa8ef926549aa4f621fef4156feabd78151a8e22870bee393e8aaed2d6ca2923` (`routeCount = 102`, `surfaceCount = 69`).

## 3. Reconciliation

- **Resources & owners searched:**
  - `server.ts`: `deployVerifyHandler` (`16668-18092`), `requestDeployOperation` (`16629-16639`), `GET /api/agent/status` (`6285-6325`), `observeDeployTarget` (`13284-13365`), `POST /api/agent/history/:id/revert` (`6588-6718`), `sourceOperationKeys` (`1612-1656`), `durableKeyRoute` (`1173-1183`).
  - `src/server/deploymentTrust.ts`: `readDeployOperationReceipt`, `readDeployOperationStatus`, `prepareDeployRecord`.
  - `src/lib/agentCapabilityAuthority.ts`, `src/lib/forgeCapabilities.ts`, `src/lib/agentHistory.ts`, `src/server/projectApiContract.ts`.
  - `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `scripts/action-receipt-coverage-audit.ts`, `scripts/mcp-capability-selftest.ts`, `scripts/route-integration.mjs`.
- **Reconciled couplings:**
  - `history.list` is not projected on MCP (`surfaces.mcp: []`), and `agentHistoryStore` appends deploy ledger rows on `res.on('finish')` after the HTTP response is sent. Therefore, `deploy.undo@1` (`undo_native_deploy`) cannot rely solely on `historyId`: accepting mutually exclusive `deployOperationId`, `recoveryId`, or `historyId` lets an MCP agent undo directly from the `operationId` or `recovery.id` returned by `apply_native_deploy` / `get_deploy_operation_status` while still linking the matching ledger row when present.
  - Supporting `useAddressedWorkspace: true` (mutually exclusive with `path`) on `/api/agent/deploy-verify/preview` and `/api/agent/deploy-verify/apply` allows MCP callers to preview/deploy either a disk mod folder (`path`, optional `root`) or the key's addressed saved canvas workspace without sending an entire `ModWorkspace` JSON payload over stdio.
  - `scripts/route-integration.mjs` (`deploy_key_effective_capabilities_are_exact_and_hashed`, line `1435`) and `scripts/mcp-capability-selftest.ts` (`EXPLICIT_ONLY_MCP_CAPABILITIES`, line `71`) must exclude `deploy.*` alongside `configuration.*` because preset `deploy` keys require explicit capability grants for MCP deployment.
- **Capability-map delta:** Adds `deploy.apply@1`, `deploy.preview@1`, `deploy.status@1`, and `deploy.undo@1` (`31 -> 35` capabilities, `29 -> 33` MCP tools, `327 -> 331` literal routes, `102 -> 105` mutating receipt-coverage routes).

## 4. Implementation Summary

- **`src/lib/agentCapabilityAuthority.ts`:** Exported `DEPLOY_EXPLICIT_GRANT_CAPABILITIES` (`deploy.apply`, `deploy.preview`, `deploy.status`, `deploy.undo`) and merged them into `EXPLICIT_CAPABILITY_GRANT_IDS` (`requiresExplicitCapabilityGrant`), keeping legacy/preset `read`, `write`, and `deploy` keys at zero automatic MCP deployment authority.
- **`src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`:** Registered sorted `deploy.apply@1`, `deploy.preview@1`, `deploy.status@1`, and `deploy.undo@1` (`FORGE_CAPABILITIES` `31 -> 35`, non-native `28 -> 32`, Contract SHA-256 `fa0b591c4d194cbc1985566ddbce22a6dfe4ac44d794cfb967ccc08cbd8477af`) with closed JSON input/output schemas and `67/67` selftest checks.
- **`src/lib/agentHistory.ts` & `src/server/projectApiContract.ts`:** Added `LEDGER_ROUTES` classifications for `/api/agent/deploy-verify/preview` (`deploy`), `/api/agent/deploy-verify/apply` (`deploy`), and `/api/agent/deploy-verify/undo` (`revert`), and enrolled `deploy-verify/(preview|apply|status|undo)` in `scoped` and `validationSubject`.
- **`server.ts`:**
  - Added `/api/agent/deploy-verify/(status|apply|undo)` to `durableKeyRoute` and `/api/agent/deploy-verify/(preview|apply|undo)` to `sourceOperationKeys` (including `.forge-builds` and `extensions/` lease ownership).
  - Extracted `respondDeployOperationStatus` shared between `GET /api/agent/status` and `GET /api/agent/deploy-verify/status`.
  - Extracted `executeDeploymentRecoveryRestore`, `prepareDeployUndoRoute`, and `handleDeployUndoRoute` shared between `POST /api/agent/history/:id/revert` and `POST /api/agent/deploy-verify/undo` (accepting mutually exclusive `deployOperationId`, `recoveryId`, or `historyId` with actor+workspace ownership verification before reading/consuming recovery records).
  - Added `deployAdapterRefusal`, `prepareDeployPreviewRoute`, and `prepareDeployApplyRoute` delegating to `coordinatedSourceOperation(deployVerifyHandler)` (defaulting `detail: 'compact'` on `x-forge-channel: mcp`, supporting `path` or `useAddressedWorkspace: true`, promoting `body.operationId` to `x-forge-operation-id` while refusing mismatched headers, and emitting curated `acceptanceRequest` targeting `/api/agent/deploy-verify/apply`).
  - Added typed `ForgeDecoratedRequest` (`decoratedReq`) and trimmed unused imports so repo-wide ESLint warnings drop from `616` to `584` (`<= 600` CI threshold in `.github/workflows/quality.yml:76`).
- **`vscode-extension/mcp/x4forge-mcp.cjs`:** Added `DEPLOY_TOOLS` / `DEPLOY_CAPABILITIES` (`preview_native_deploy`, `apply_native_deploy`, `get_deploy_operation_status`, `undo_native_deploy`), `deployGrantAllowed`, and `deployRoute` structured JSON error forwarding with `isError: true` on both HTTP `>=400` and HTTP `200` `ok === false` / `success === false` / `status === 'FAILED'`.
- **Audits, Manifests & Selftests:**
  - Bumped `MCP_MODULE_AUDIT_VERSION` (`24 -> 25`, `33` MCP aliases) in `scripts/capability-contract-audit.ts`, updated `scripts/mcp-capability-selftest.ts` and `scripts/route-integration.mjs` (`672/672 PASS`), and added `scripts/native-deploy-mcp.selftest.ts` (`npm run test:native-deploy-mcp`, `6/6 PASS`).
  - Promoted `config/forge-route-dispositions.json` (`331` literal routes, `35` capabilities, `33` MCP aliases) and `config/action-receipt-coverage.json` + `src/lib/actionReceiptPolicyBundle.ts` + `.selftest.ts` (`manifestSha256 = 12c68f8a9bd8a6f9f65decdb4705ae822fd0acf5ce7a0777762b8747c16717f5`, `105` routes, `69` surfaces); `config/durable-writers.json` `sourceFingerprint` (`3dba91cb24d8a0ac4c73181239062f177b5a6f2c2b364f466d9481debf1ee63e`, `50` raw FS writers) unchanged.

## 5. Validation Evidence

- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`: `PASS` (`35` capabilities, `331` disposed literal routes, `1` reviewed dynamic registrar, `33` MCP aliases, Contract SHA-256 `fa0b591c4d194cbc1985566ddbce22a6dfe4ac44d794cfb967ccc08cbd8477af`).
- `npm run test:writers`: `30/30` + `PASS` (`50` raw FS, `12` host-store, `4` browser-output, `3` SQLite owners) + `durableWrite 8/8`.
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest`: `PASS` (`105` routes / `69` surfaces, `79/79` + `23/23`).
- `tsx src/lib/forgeCapabilities.selftest.ts`: `PASS 67`.
- `npm run test:mcp-capabilities`: `PASS` (`read=13, write=17, deploy=18`, `md-navigation-mcp`, `ai-navigation-mcp`, `native-performance-mcp 30/30`).
- `npm run test:configuration-transport`: `7/7 PASS`.
- `npm run test:native-deploy-mcp`: `6/6 PASS` (preset key denial + legacy HTTP parity; preview-only vs full explicit MCP tool narrowing; `loose` + `catalog` + `useAddressedWorkspace` dry-run previews with zero target/config writes; mismatched hash/target `409` refusal + `UNACCEPTED_MOD_FINDINGS` `isError: true` + `acceptanceRequest` qualified apply; `loose` + `catalog` committed apply, `managedObservation` + `targetObservation` + `effectReport` status, and one-use `deployOperationId` / `recoveryId` undo + `409 RECOVERY_ALREADY_USED` replay refusal; cross-workspace isolation + key revocation fail-closed).
- `npm run lint -- --max-warnings 600`: `PASS` (`0` errors, `584` warnings).
- `npm run typecheck` & `npm run build`: `PASS` (`0` errors).
- `npm run test:oracles`: `134/134 green`.
- `npm run test:routes` (`X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset): `672/672 PASS` (including `preset_deploy_key_denied_curated_deploy_without_explicit_grant`, `curated_deploy_apply_refuses_mismatched_operation_id_header`, `curated_deploy_apply_commits_bytes_and_receipt`, `curated_deploy_status_reports_managed_outputs_and_effect`, `curated_deploy_undo_restores_absent_pre_state_once`, and `all_canonical_capability_outputs_exercised` across all `35` capabilities).
- `npm run precommit:check`: `[precommit] OK`.

## 6. Review & Close

- **Status:** `PARTIAL` overall (`VERIFIED` across source, governance manifests, isolated HTTP backend, and real stdio MCP; installed `0.0.94` IDE/E2E qualification and Claude's live X4 runtime lane remain gated on Ken's `0.0.94` release window).
- **Suggested commit title:** `feat(mcp): expose explicit-grant native deploy preview, apply, status, and undo (#19)`

## 7. After-Action Review (Triggered)

- **Triggers:**
  1. Windows child-process cleanup & `httpJson` header forwarding bugs in initial `scripts/native-deploy-mcp.selftest.ts` draft (`tasks 5610, 5636, 5714, 5727, 5732`).
  2. `scripts/route-integration.mjs` `req()` helper auto-injected a random `x-forge-operation-id` header when `options.operationId` was omitted, triggering `prepareDeployApplyRoute`'s `400 DEPLOY_OPERATION_INPUT_INVALID` header/body mismatch guard (`task-5801` -> fixed in `route-integration.mjs:6158-6190` with an explicit mismatch negative test + `operationId: null`, `672/672 PASS`).
  3. Repo-wide ESLint warnings had crept to `616` (`> 600` CI threshold in `.github/workflows/quality.yml:76`); trimmed unused imports and added `ForgeDecoratedRequest` in `server.ts` (`616 -> 584`).
- **Points to sustain:**
  - Checking `.github/workflows/quality.yml` (`--max-warnings 600` and `FORGE_CAPABILITY_BASE_REF`) before pushing `22` commits prevented a guaranteed CI lint failure on `origin/main`.
  - Supporting mutually exclusive `deployOperationId`, `recoveryId`, and `historyId` on `deploy.undo@1` eliminated any hidden dependency on `history.list` (which is not projected on MCP) or `res.on('finish')` ledger timing.
- **Points to improve — work/approach:**
  - Check harness request wrappers (`route-integration.mjs` `req()` default headers) before writing route tests for endpoints that enforce header-vs-body `operationId` consistency.
- **Points to improve — tools:**
  - On Windows Node 24, `tsx` child servers spawned in standalone selftests need `taskkill /PID <pid> /T /F` plus `process.exitCode` (never synchronous `process.exit(0)` with closing sockets) so SQLite `coord/` handles release deterministically before `fs.rmSync`.
- **Highest-risk observed weakness:**
  - `npm run precommit:check` runs `typecheck` and governance audits but does not run `npm run lint -- --max-warnings 600`, allowing `@typescript-eslint/no-explicit-any` warnings across multi-unit sessions to silently cross the GitHub Actions `Quality` cap (`600`). Keep checking `npm run lint -- --max-warnings 600` before every commit/push batch.
