# Plan — `#19` P4 Slice 9: Project File Inventory, Mod-Skeleton Scaffolding & Reversible CAS Directory Removal across API & MCP

- **Date:** 2026-11-24
- **Status:** `VERIFIED`
- **Lane:** `FULL`
- **Owners / Issues:** `#19` (`files.project_sources.manage`), `#69` (extends `FileRecoveryRecord` with `delete-dir` & `undo-create-dir`)

## 1. Plan And Acceptance Contract

- **Bounded unit:** Complete `files.project_sources.manage` parity across canonical capabilities, protected explicit-grant Agent HTTP routes, and stdio MCP tools — flipping `files.project_sources.manage` in `FORGE_UI_ACTION_PARITY_CENSUS` from `partial` to `available` (`available: 16 -> 17`, `partial: 24 -> 23`, `openGaps: 33 -> 32`):
  1. **`files.inventory.read@1`** (`get_project_file_inventory` -> `GET /api/agent/files/inventory`, `agentScopes: ['read', 'write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `effects: ['read', 'analyze']`, `context: { workspace: 'required', profile: 'none' }`):
     - Reuses `buildProjectFileInventory` + `buildWorkspaceFileManifest(activeBuildWorkspace(record.workspace))` (same artifact-plan authority as `POST /api/agent/project/files` and `NativeProjectFiles.tsx`), capping `entries` at `500` (`totalEntries`, `truncated`) and redacting host paths (`sourceFolder` single-segment folder name + `workspaceRootId`).
  2. **`files.scaffold@1`** (`scaffold_mod_project` -> `POST /api/agent/files/scaffold`, `agentScopes: ['write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `effects: ['filesystem-write', 'audit-write', 'audit-retention-delete']`, `context: { workspace: 'optional', profile: 'none' }`, `LEDGER_ROUTES` `kind: 'edit'`):
     - Closed body: `{ id, name?, version?, author?, description?, deps?: Array<{ id, version?, optional? }>, starterKind?: 'minimal' | 'md_cue' | 'ai_influence_starter', apply?: boolean, expectedWorkspaceRootId? }`.
     - Validates `id` as a strict single-segment mod identifier (`/^[a-z][a-z0-9_]{1,63}$/`), supports dry-run preview (`apply: false`, suppressed from Action Ledger when `applied === false && res.statusCode < 400`), refuses when `<modWorkspacePath>/<id>` already exists (`409 MOD_FOLDER_ALREADY_EXISTS`), materializes all starter files (`createAgentProject` / `md_cue` / `generateAgentProject`) atomically via `writeWorkspaceFileGuarded`, verifies `regularTreeFingerprintAndBytes(modDir)`, and returns a one-use `undo-create-dir` `FileRecoveryRecord` restorable via `restore_workspace_file` or `revert_action_history`.
  3. **`files.delete.dir@1`** (`remove_workspace_directory` -> `POST /api/agent/files/delete-dir`, `agentScopes: ['write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `effects: ['filesystem-write', 'delete', 'audit-write', 'audit-retention-delete']`, `context: { workspace: 'optional', profile: 'none' }`, `LEDGER_ROUTES` `kind: 'edit'`):
     - Closed body: `{ path, apply?: boolean, expectedTreeSha256?, expectedWorkspaceRootId? }`.
     - Refuses root deletion, path traversal, symlinks, hidden target paths (`403 HIDDEN_PATH_FORBIDDEN`), regular files (`400 NOT_A_DIRECTORY`), directories containing hidden/Forge-managed entries such as `.git` or `.snapshots` (`409 DIRECTORY_CONTAINS_PROTECTED_ENTRIES`), and trees `> 32 MiB` (`413 DIRECTORY_TOO_LARGE_FOR_RECOVERY`).
     - Supports dry-run preview (`apply: false`, quiet in Action Ledger) returning `{ treeSha256, totalBytes, fileCount, dirCount, workspaceRootId }`, and CAS-guarded removal (`apply: true`, enforcing `expectedTreeSha256` against `regularTreeFingerprintAndBytes(realTarget)`, `409 DIRECTORY_CHANGED` on drift), copying the regular directory tree into `DestructiveRecoveryStore` (`operation: 'delete-dir'`), removing via shared `removeDirectoryRecursive`, and returning a one-use `FileRecoveryRecord` restorable via `restore_workspace_file` or `revert_action_history`.
- **Out of scope:** Deleting `.git`/`.snapshots`/`.forge-builds` trees or deployed game `extensions/` directories through `files.delete.dir@1` (deployed `extensions/` remains owned exclusively by `deploy.undo@1`).
- **Risks & authorization boundaries:**
  - Zero new raw `fs.*` mutation calls across `src/lib/destructiveRecovery.ts` and `server.ts` (`50` raw filesystem writer sources in `config/durable-writers.json` unchanged; `removeDirectoryRecursive` extracts the existing `fs.rmSync` from `/api/fs/delete-dir` and `copyRegularTree`/`writeWorkspaceFileGuarded` reuse existing writers).
  - All three capabilities require an explicit grant (`WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`), keeping preset `read`/`write`/`deploy` MCP tool counts unchanged (`35 / 40 / 41`).
- **Rollback / checkpoint:** `aa8572bfd43b30bc67b4a5a89a859a8b2d194f03` (`origin/main`).
- **Acceptance criteria & validation:**
  1. `src/lib/destructiveRecovery.ts` selftest verifies `prepareDirectoryDeletion` / `finalizeDirectoryDeletion` and `createDirectoryUndoCreate`.
  2. Real child-backend + stdio MCP selftest (`scripts/workspace-files-mcp.selftest.ts` check `12`) proves: `get_project_file_inventory` returns redacted B100 ownership metadata; `scaffold_mod_project` previews (`apply: false`, quiet in Action Ledger), creates a starter mod folder, refuses duplicate `MOD_FOLDER_ALREADY_EXISTS`, and undoes cleanly via `restore_workspace_file` (`undo-create-dir`) while refusing `409 RECOVERY_STALE` if modified; `remove_workspace_directory` previews `treeSha256`, refuses `.git`-containing folders (`409 DIRECTORY_CONTAINS_PROTECTED_ENTRIES`) and stale `expectedTreeSha256` (`409 DIRECTORY_CHANGED`), removes the directory, and restores exact nested files via `restore_workspace_file` (`delete-dir`).
  3. `lint -- --max-warnings 600`, `typecheck`, `test:writers`, `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`, `test:action-receipt-coverage` + `:selftest`, `c06-contracts`, `c06-api`, `test:mcp-capabilities`, `test:native-deploy-mcp`, `test:workspace-files-mcp`, `npm run build`, `test:oracles`, `test:routes`, and `precommit:check` all pass, followed by the 3-Unit Release Readiness Review (Units 30–32).

## 2. Baseline & Reconciliation

- **Baseline HEAD:** `aa8572bfd43b30bc67b4a5a89a859a8b2d194f03` (`origin/main`, GitHub Actions `Quality` run `45441113396` `SUCCESS`, worktree clean).
- **Reconciled resources & couplings:**
  - `src/lib/projectFileInventory.ts`: `buildProjectFileInventory` computes deterministic `disk` / `modeled-xml` / `preserved-original` / `excluded` ownership across the addressed workspace's `modWorkspacePath` folder; reused directly by `GET /api/agent/files/inventory` with host path redaction (`sourceFolder` single-segment basename + `workspaceRootId`) and a `500`-entry cap.
  - `src/lib/agentAuthoring.ts`: `createAgentProject` and `generateAgentProject` already generate validated X4 mod skeletons (`content.xml`, `md/*.xml`, `aiscripts/*.xml`, `t/0001-L044.xml`); reused directly by `POST /api/agent/files/scaffold` alongside `writeWorkspaceFileGuarded`.
  - `src/lib/destructiveRecovery.ts` & `server.ts`: `regularTreeFingerprintAndBytes`, `copyRegularTree`, `inspectRegularTree`, and `fs.rmSync` (extracted from `/api/fs/delete-dir` into shared `removeDirectoryRecursive`) let `FileRecoveryRecord` support `'delete-dir'` and `'undo-create-dir'` with **zero** new raw `fs.*` writer calls (`50` raw filesystem writer sources in `config/durable-writers.json` unchanged).
  - **Capability-map delta:** Added `files.delete.dir@1` (`remove_workspace_directory`), `files.inventory.read@1` (`get_project_file_inventory`), and `files.scaffold@1` (`scaffold_mod_project`), upgraded `files.restore@1 -> @2` (`restore_workspace_file`, documenting directory `delete-dir` and `undo-create-dir` restoration), and flipped `files.project_sources.manage` in `FORGE_UI_ACTION_PARITY_CENSUS` from `partial` to `available` (`available: 16 -> 17`, `partial: 24 -> 23`, `openGaps: 33 -> 32`, `76 -> 79` capabilities, `77 -> 80` MCP tools).

## 3. Implementation Summary

- `src/lib/destructiveRecovery.ts`: Extended `FileRecoveryOperation` to `'delete-file' | 'undo-create' | 'delete-dir' | 'undo-create-dir'`, updated `isRecord`, added `prepareDirectoryDeletion`, `finalizeDirectoryDeletion`, and `createDirectoryUndoCreate`, and added directory recovery selftest assertions (`27/27 PASS`).
- `src/lib/agentCapabilityAuthority.ts`: Added `'files.delete.dir'`, `'files.inventory.read'`, and `'files.scaffold'` to `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`.
- `src/lib/agentHistory.ts` & `src/lib/agentHistory.selftest.ts`: Added `POST /api/agent/files/scaffold` and `POST /api/agent/files/delete-dir` to `LEDGER_ROUTES` (`kind: 'edit'`) + readable summary titles (`93/93 PASS`).
- `server.ts`: Added `/api/agent/files/inventory`, `/api/agent/files/scaffold`, and `/api/agent/files/delete-dir` to `durableKeyRoute`, suppressed dry-run `applied === false` previews in `ledgerMiddleware`, wired `req.body?.id` for `/api/agent/files/scaffold` in `sourceOperationKeys`, extracted `removeDirectoryRecursive`, extended `executeFileRecoveryRestore` with `'delete-dir'` (`restored-directory`) and `'undo-create-dir'` (`removed-created-directory`), and registered `GET /api/agent/files/inventory`, `POST /api/agent/files/scaffold`, and `POST /api/agent/files/delete-dir`.
- `src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`: Registered `files.delete.dir@1`, `files.inventory.read@1`, and `files.scaffold@1`, bumped `files.restore@1 -> @2`, and flipped `files.project_sources.manage` in `FORGE_UI_ACTION_PARITY_CENSUS` to `available` (`100/100 PASS`, Contract SHA-256 `f6f9228cfc11015630f3d3926cd215d4f3de6acad2d875455db19d662d8fe093`, UI-action parity SHA-256 `bdc0b7f1eb54848984e570f7e2020a0fb3eaea701eb59e06758439e485bd397f`).
- `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `scripts/mcp-capability-selftest.ts`, `src/lib/actionReceiptPolicyBundle.ts`, `src/lib/actionReceiptPolicyBundle.selftest.ts`, `scripts/workspace-files-mcp.selftest.ts`, & `scripts/route-integration.mjs`: Added `get_project_file_inventory`, `scaffold_mod_project`, and `remove_workspace_directory`, updated `workspaceFilesGrantAllowed` for `files.restore@2` (`MCP_MODULE_AUDIT_VERSION = 35`, `80` MCP tools), added policy-bundle coverage for `/api/agent/files/scaffold` and `/api/agent/files/delete-dir` (`129` routes / `69` surfaces), added stdio MCP check `12` (`12/12 PASS`), and added end-to-end HTTP route integration checks (`756/756 PASS`).
- Promoted governance manifests:
  - `config/durable-writers.json`: `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` (`50` raw filesystem writer sources unchanged).
  - `config/forge-route-dispositions.json`: `368` routes, SHA-256 `55d397ccce8c8069bfe847fbe1221af8957993db7558956164c64335a9671e38`.
  - `config/action-receipt-coverage.json`: `129` routes / `69` surfaces, `manifestSha256: 4c94e21351aa033022b248e94027cefcffc2e3a433d65be2bb061fc5401c65f0`.

## 4. Validation & Review Evidence

- `npm run lint -- --max-warnings 600` -> `0` errors, `579` warnings (`PASS`).
- `npm run typecheck` -> exit `0` (`PASS`).
- `npm run test:writers` -> `30/30` + `PASS` + `8/8` (`50` raw writers unchanged).
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`79` capabilities, `368` routes, `80` MCP tools).
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> `PASS` (`129` routes / `69` surfaces, `79/79 + 23/23` selftest).
- `npx tsx scripts/c06-contracts.selftest.ts` -> `196/196 PASS`.
- `npx tsx scripts/c06-api.selftest.ts` -> `42/42 PASS`.
- `npm run test:mcp-capabilities` -> `PASS` (`read=35, write=40, deploy=41`).
- `npm run test:native-deploy-mcp` -> `6/6 PASS`.
- `npm run test:workspace-files-mcp` -> `12/12 PASS` (real child backend + stdio MCP).
- `npm run build` -> exit `0` (`PASS`).
- `npm run test:oracles` -> `134/134 PASS`.
- `npm run test:routes` (with `X4_REFERENCE_ROOT` / `X4_XSD_PATH` cleared) -> `756/756 PASS`.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run precommit:check` -> `[precommit] OK`.

### 3-Unit Release Readiness Review (Units 30–32: `ba4cb96`, `aa8572b`, and Unit 32; `32` units ahead of `0.0.93`)

- **Source, Governance, Oracles, Routes, Stdio MCP & CI Gates:** `GREEN` across all `32` verified units since `0.0.93` (`e9c12e1`), including `79` canonical capabilities, `80` stdio MCP tools (`read=35, write=40, deploy=41` presets + `39` explicit-grant tools), `368` route dispositions, `129/69` action-receipt coverage surfaces, `134/134` oracles, `756/756` HTTP route integration checks, and live stdio MCP selftests (`test:native-deploy-mcp` `6/6` + `test:workspace-files-mcp` `12/12`).
- **Public `0.0.94` Release & `FORGE DEVELOPMENT` IDE (`0.0.89 -> 0.0.94`) Upgrade Verdict:** **`NOT_READY`** (strictly gated on Ken's explicit Machine-State Ask + Write Gate per `AGENTS.md` §2/§6 and `vscode-extension/PUBLISHING.md`, which are required before running the heavy `150/150` compiled Playwright E2E suite, upgrading `FORGE DEVELOPMENT` `PID 34076`, capturing installed Antigravity witness proof, and publishing `x4forge/x4-forge-studio` `0.0.94`). Continue executing headless Tier 2 backlog slices on `origin/main`.

## 5. Close & Triggered AAR

- **Final Status:** `VERIFIED` (Dev source, governance manifests, `134/134` oracles, `756/756` HTTP routes, and `12/12` real stdio MCP; `#19` and `#69` remain `PARTIAL` overall pending remaining census slices and `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): project file inventory, mod scaffolding, and reversible CAS directory removal (#19, #69)`
- **Triggered AAR:**
  1. **Points to sustain:** Extending `FileRecoveryRecord` with `'delete-dir'` and `'undo-create-dir'` over `regularTreeFingerprintAndBytes` + `copyRegularTree` + `removeDirectoryRecursive` made both recursive folder deletion (`remove_workspace_directory`) and mod-skeleton creation (`scaffold_mod_project`) 100% CAS-guarded and one-use reversible via existing `restore_workspace_file` (`files.restore@2`) and `revert_action_history` (`history.revert@2`) with **zero** new raw `fs.*` writer calls.
  2. **Points to improve — work/approach:**
     - `isRecord` in `src/lib/destructiveRecovery.ts` initially kept a narrow hardcoded `['delete-file', 'undo-create']` operation check (`caught immediately by destructiveRecovery.ts selftest` -> expanded to include `'delete-dir'` and `'undo-create-dir'`).
     - In `scripts/route-integration.mjs`, `expectedCapabilityIdentity` needed `'files.restore'` added to its `@2` array after bumping `files.restore@1 -> @2`, and sequential `fs.existsSync` checks on a directory that is deleted, restored, and then undone at the end of the test must be captured right after each HTTP call rather than inside `ok(...)` after the final undo has removed the folder.
  3. **Points to improve — tools:** `capability-contract-audit.ts --generate-candidate` rejects `config/forge-route-dispositions.json` if new routes are hand-added with `capabilitySignatures: []` before promotion; banked rule: keep `config/forge-route-dispositions.json` at `HEAD`, run `--generate-candidate`, edit `agentScopes`/`resourceClass`/`workspaceMode` on the new routes inside `test-results/forge-route-dispositions.candidate.json`, and run `--promote-candidate <sha256>`.
  4. **Highest-risk evidenced weakness:** When bumping any capability version (`@1 -> @2`) in `FORGE_CAPABILITIES`, three downstream allowlists/oracles must stay synchronized (`vscode-extension/mcp/x4forge-mcp.cjs` explicit-grant version checks, `scripts/route-integration.mjs:829` `expectedCapabilityIdentity`, and `config/forge-route-dispositions.json` `capabilitySignatures`). Both `test:workspace-files-mcp` and `test:routes` caught these deterministically before commit.
