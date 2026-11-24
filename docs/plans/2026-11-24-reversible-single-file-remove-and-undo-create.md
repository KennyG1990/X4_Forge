# Plan & Close — Reversible Single-File Removal, Undo-Create, and One-Use Recovery (`#69` FF-30 + `#19`)

- **Date:** 2026-11-24
- **Status:** `VERIFIED` (Dev source, CLI/audit, `134/134` oracles, `725/725` HTTP routes, `7/7` real child-backend stdio MCP, `precommit:check`; `#69` and `#19` remain `PARTIAL` overall pending `0.0.94` installed IDE/E2E qualification)
- **Lane:** `FULL`
- **Owners / Issues:** `#69` (`FF-30`), `#19` (`files.project_sources.manage` MCP & explicit-grant parity)

## 1. Plan And Acceptance Contract

- **Bounded unit:** Add a workspace-scoped, CAS-guarded, reversible single-file removal and one-use recovery workflow across the legacy configured-root filesystem API (`POST /api/fs/delete-file`, `POST /api/fs/restore-file`, and `expectedSha256: null` undo-create on `POST /api/fs/write`), the explicit-grant Agent API (`files.delete@1` -> `POST /api/agent/files/delete`, `files.restore@1` -> `POST /api/agent/files/restore`, `files.write@2` -> `POST /api/agent/files/write`), the stdio MCP server (`remove_workspace_file`, `restore_workspace_file`, `write_workspace_file`), and the shared Action Ledger revert surface (`handleHistoryRevertById` on `POST /api/agent/history/:id/revert` and `POST /api/agent/history/revert`).
- **Assumptions & unresolved facts:** Existing unguarded `POST /api/fs/write` calls without `expectedSha256` (`expectedSha256 === undefined`) intentionally retain `revertible: false` (`scripts/route-integration.mjs:5194-5200` and `src/lib/agentHistory.selftest.ts:417`). Only explicit CAS new-file creation (`expectedSha256 === null`) records an `undo-create` one-use recovery receipt.
- **Authoritative references:**
  - GitHub `#69` (`[Feature] Reversible single-file removal / undo-create for guarded workspace edits (FF-30)`)
  - GitHub `#19` (`FORGE_UI_ACTION_PARITY_CENSUS` row `files.project_sources.manage`)
  - `src/lib/destructiveRecovery.ts`, `src/lib/agentHistory.ts`, `server.ts`, `src/server/projectApiContract.ts`, `src/lib/agentCapabilityAuthority.ts`, `src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`.
- **Out of scope:** Changing `POST /api/fs/delete-dir` recursive directory semantics, adding recursive directory deletion to MCP, or modifying live Forge / `FORGE DEVELOPMENT` IDE / X4 game directories.
- **Rollback / checkpoint:** Clean `HEAD` at `49cbf18f8437ecc581de849abdbdf68de2106a8b` (`origin/main`).

## 2. Baseline

- **Revision:** `49cbf18f8437ecc581de849abdbdf68de2106a8b` (`HEAD == origin/main`, GitHub Actions `Quality` run `45390349719` `SUCCESS`).
- **Worktree:** Clean (`git status --short` empty).

## 3. Reconciliation Summary

- **Resources & callers searched:** `server.ts` (`authMiddleware` `durableKeyRoute`, `ledgerMiddleware`, `sourceOperationKeys`, `writeWorkspaceFileGuarded`, `POST /api/fs/write`, `handleHistoryRevertById`, `POST /api/fs/delete-dir`, `POST /api/agent/files/write`), `src/lib/destructiveRecovery.ts`, `src/lib/agentHistory.ts` & `.selftest.ts`, `src/components/AgentBridge.tsx`, `src/server/projectApiContract.ts`, `src/lib/agentCapabilityAuthority.ts`, `src/lib/forgeCapabilities.ts` & `.selftest.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/action-receipt-coverage-audit.ts`, `scripts/mcp-capability-selftest.ts`, `scripts/workspace-files-mcp.selftest.ts`, `scripts/route-integration.mjs`.
- **Capability-map delta:** Added `files.delete@1` (`remove_workspace_file`) and `files.restore@1` (`restore_workspace_file`), upgraded `files.write@1 -> @2` (`write_workspace_file`), and updated `FORGE_UI_ACTION_PARITY_CENSUS` row `files.project_sources.manage` (`57 -> 59` capabilities, `58 -> 60` MCP tools, `MCP_MODULE_AUDIT_VERSION = 30`, Contract SHA-256 `b5554f50cd9962bb84cf091d4968a724c35364f1fb1fd883fef33a4a0864ec8d`, UI-action parity SHA-256 `4b7963d0c1f065b978c4c8de45dffef0def3f33acbb35aff5d1dfc1de9625e27`).

## 4. Implementation Summary

- **`src/lib/destructiveRecovery.ts`:** Extended `RecoveryKind` with `'file'`, added `FileRecoveryOperation` (`'delete-file' | 'undo-create'`) and `FileRecoveryRecord`, extended `isRecord` structural validation, added `prepareFileDeletion`, `finalizeFileDeletion`, `readFilePayload`, and `createFileUndoCreate` (persisting raw pre-delete bytes via `atomicWriteFile` + SHA-256 readback verification with zero new raw `fs.*` writer calls), and added 3 selftest checks (`25/25`).
- **`src/lib/agentHistory.ts`, `src/lib/agentHistory.selftest.ts`, & `src/components/AgentBridge.tsx`:** Added `/api/fs/delete-file`, `/api/agent/files/delete` (`kind: 'edit'`) and `/api/fs/restore-file`, `/api/agent/files/restore` (`kind: 'revert'`) to `LEDGER_ROUTES`; updated `revertibility('edit', ...)` to allow recovery-backed edit rows (`!hasBeforeBlob && !hasRecovery` remains `false`, preserving `agentHistory.selftest.ts:417` and unguarded `POST /api/fs/write`); added human-readable summaries in `describeAction` and button labels in `AgentBridge.tsx`.
- **`src/server/projectApiContract.ts` & `scripts/c06-api.selftest.ts`:** Added closed body contracts for `/api/fs/delete-file` and `/api/fs/restore-file` (`42/42` selftest checks).
- **`server.ts` & `config/durable-writers.json`:** Added `unlinkRegularWorkspaceFile` (`unlinkSync: 6 -> 7`, `sourceFingerprint: 86da6654baf9a98dc4805813b44d66656eedee8bd21d7d7044ecbdba3d990f61`), `createUndoCreateFileRecovery`, `removeWorkspaceFileGuarded`, and `executeFileRecoveryRestore`; wired `POST /api/fs/delete-file`, `POST /api/fs/restore-file`, `POST /api/agent/files/delete`, `POST /api/agent/files/restore`, `undo-create` on `expectedSha256 === null` writes, `ledgerMiddleware` deletion byte/line/diff capture, `sourceOperationKeys` `recoveryId` folder lock resolution, `durableKeyRoute` disk-key verification, and `handleHistoryRevertById` `kind === 'file'` dispatch.
- **Capabilities, MCP & Manifests:** Updated `src/lib/agentCapabilityAuthority.ts`, `src/lib/forgeCapabilities.ts` & `.selftest.ts`, `vscode-extension/mcp/x4forge-mcp.cjs` (`remove_workspace_file`, `restore_workspace_file`, `write_workspace_file` `@2`), `scripts/capability-contract-audit.ts`, `scripts/action-receipt-coverage-audit.ts`, `config/forge-route-dispositions.json` (`349` routes, SHA-256 `2211d1fefb9d9ae561497ab3b1e6431183bb4572805cd8965d1337302befedb3`), `config/action-receipt-coverage.json` (`115` routes / `69` surfaces, SHA-256 `d5444fd9f565e2d4add756c5a73df84aa925e316e22840e959a4268fda041e4e`), `src/lib/actionReceiptPolicyBundle.ts` & `.selftest.ts`, `scripts/mcp-capability-selftest.ts`, `scripts/workspace-files-mcp.selftest.ts` (`7/7`), and `scripts/route-integration.mjs` (`725/725`).

## 5. Validation Results

- `npm run typecheck`: **PASS** (`0` errors)
- `npm run lint -- --max-warnings 600`: **PASS** (`0` errors, `578` warnings)
- `npm run test:writers`: **PASS** (`30/30` + `PASS` + `8/8`)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`: **PASS** (`59` capabilities, `349` literal routes, `60` MCP aliases, `51` UI-action parity rows, Contract SHA-256 `b5554f50cd9962bb84cf091d4968a724c35364f1fb1fd883fef33a4a0864ec8d`, UI-action parity SHA-256 `4b7963d0c1f065b978c4c8de45dffef0def3f33acbb35aff5d1dfc1de9625e27`)
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest`: **PASS** (`115` routes / `69` surfaces, `79/79` + `23/23`, manifest SHA-256 `d5444fd9f565e2d4add756c5a73df84aa925e316e22840e959a4268fda041e4e`)
- `node --import tsx scripts/c06-api.selftest.ts` & `node --import tsx scripts/c06-contracts.selftest.ts`: **PASS** (`42/42` + `196/196`)
- `npm run test:mcp-capabilities`: **PASS** (`read=29, write=34, deploy=35`, explicit-grant tools gated)
- `npm run test:workspace-files-mcp`: **PASS** (`7/7` real child backend + stdio MCP, including explicit `write`-scope create/undo-create/edit/remove/restore + Action Ledger `revert_action_history` + negative guards)
- `npm run build`: **PASS** (`0`)
- `npm run test:oracles`: **PASS** (`134/134` green, including `destructive-recovery-selftest 25/25` and `agent-history-selftest 92/92`)
- `npm run test:routes` (`X4_XSD_PATH` / `X4_REFERENCE_ROOT` unset): **PASS** (`725/725 PASS`)
- `npm run precommit:check`: **PASS** (`[precommit] OK`)

## 6. Review Against Source Of Truth

- Create file -> edit -> remove -> restore preserving exact CRLF/UTF-8 bytes & workspace identity (`#69`): **Done and evidenced** (`scripts/workspace-files-mcp.selftest.ts` Check 7 & `scripts/route-integration.mjs:6463-6611`).
- Undo-create without general shell command execution or broader scope (`#69`): **Done and evidenced** (`write`-scope explicit grant over MCP `write_workspace_file` + `restore_workspace_file`, and `deploy`-preset parity on `/api/fs/write` + `/api/fs/delete-file` + `/api/fs/restore-file`).
- Negative guards (wrong hash `409 FILE_CHANGED`, wrong workspace `403 RECOVERY_WORKSPACE_MISMATCH` / `WORKSPACE_BINDING_MISMATCH`, wrong root `409 WORKSPACE_ROOT_CHANGED`, traversal/hidden/symlink `403`, directory target `400 NOT_A_REGULAR_FILE`, stale undo-create `409 RECOVERY_STALE`, occupied restore `409 RECOVERY_STALE`, repeated recovery `409 RECOVERY_ALREADY_USED`): **Done and evidenced**.
- Existing directory deletion (`/api/fs/delete-dir`) & unguarded new-file non-revertibility (`route-integration.mjs:5194-5200`): **Done and evidenced** (`725/725 PASS`).
- Installed IDE / compiled Playwright E2E qualification: **Deferred** to `0.0.94` release gate pending Ken's Machine-State Ask + Write Gate (`#69` and `#19` stay open/`PARTIAL` until installed verification).
- **Suggested commit title:** `feat(files): add reversible CAS single-file removal, undo-create, and MCP tools (#69, #19)`

## 7. AAR (Triggered)

- **Triggers:**
  1. `capability-contract-audit.ts --generate-candidate` failed once before `mappings.length !== 58` was updated to `60`, and `--promote-candidate` refused once before `POST /api/fs/delete-file` and `POST /api/fs/restore-file` had `disposition` updated from default `'session-only'` to `'legacy-agent-api'` alongside `agentScopes: ['deploy']`.
  2. `action-receipt-coverage-audit.ts --promote-candidate` required the third flag `--expected-current-reviewed <priorManifestSha256>`.
  3. First `test:routes` run returned `724/725` because `deployKey` in `route-integration.mjs` was bound to the initial bootstrap workspace rather than `slice3WsId` (`403 WORKSPACE_BINDING_MISMATCH`).
- **Points to sustain:**
  - Reconciling `scripts/route-integration.mjs:5194-5200` and `src/lib/agentHistory.selftest.ts:417` before implementation prevented breaking unguarded `/api/fs/write` non-revertibility (`expectedSha256 === undefined` vs `expectedSha256 === null`).
  - Reusing `atomicWriteFile` inside `DestructiveRecoveryStore` kept `src/lib/destructiveRecovery.ts`'s raw `fs.*` writer counts unchanged and localized `config/durable-writers.json` delta to a single `unlinkRegularWorkspaceFile` helper in `server.ts` (`unlinkSync: 6 -> 7`).
- **Points to improve — work/approach:**
  - When reviewing newly generated legacy `/api/fs/*` routes in `test-results/forge-route-dispositions.candidate.json`, always update `disposition: 'legacy-agent-api'` at the same time as `agentScopes` because `--generate-candidate` seeds new routes with `disposition: 'session-only'` when `agentScopes` starts empty.
  - Always check which workspace a fixture key (`deployKey`) is bound to before passing another test block's `x-workspace-id` (`slice3Address`).
- **Points to improve — tools:**
  - Chaining commands across newlines in PowerShell (`npm run test:routes` followed by `npm run precommit:check`) returns only the final command's exit code unless `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` is appended after each command. Banked in `SESSION-HANDOFF.md` Live Hazards.
- **Highest-risk observed weakness:** Silent exit-code masking in multi-line PowerShell validation batches (`npm run test:routes` `724/725` exited `1`, masked by subsequent `precommit:check` exiting `0`, caught only because we inspected `[route-integration]` output directly). **Bounded fix:** Always guard multi-step PowerShell test invocations with `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` and inspect summary counts directly.
