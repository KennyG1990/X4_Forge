# Plan & Close — `#19` P4 Slice 5 + `#69` MCP Grant Fix: Round-Trip Check, Quick-Fixes, Warning-Suppression Rules, Review Revocation, and Nexus Release Build/Verify MCP Projections

- **Date:** 2026-11-24
- **Status:** `VERIFIED` (isolated Dev source, HTTP, and real child-backend stdio MCP; whole `#19` and `#69` remain `PARTIAL` pending `0.0.94` packaged IDE/E2E qualification)
- **Lane:** `FULL`
- **Owners / Issues:** `#19`, `#69`

## 1. Plan And Acceptance Contract

- **Bounded unit:** Close seven agent/MCP parity gaps across `workspace.mod_folder.import_and_sync` (flipping it from `partial` to `available`), `diagnostics.project.validate`, and `release.nexus.prepare_and_download`, plus fix the `[REPRODUCED]` `files.write@2` MCP explicit-grant version check in `vscode-extension/mcp/x4forge-mcp.cjs` and CI-gate both live MCP explicit-grant suites:
  1. **`workspace.roundtrip.check@1`** (`check_xml_round_trip` -> `POST /api/agent/mod-folder/round-trip`, `effects: ['read', 'analyze']`, `agentScopes: ['read', 'write', 'deploy']`, in `LEDGER_QUIET_ROUTES`): closed input `{ path, root? }` sharing `evaluateModFolderRoundTrip` with `POST /api/agent/round-trip-check` while omitting host `importReport.folder`, flipping `workspace.mod_folder.import_and_sync` in `FORGE_UI_ACTION_PARITY_CENSUS` to `available` (`available: 13 -> 14`, `partial: 26 -> 25`, `openGaps: 36 -> 35`).
  2. **`diagnostics.quick.fixes@1`** (`suggest_quick_fixes` -> `POST /api/agent/quick-fixes`, `effects: ['read', 'analyze']`, `agentScopes: ['read', 'write', 'deploy']`): supports inline `{ workspace }` (preserving Studio compatibility) or addressed-workspace omission (`{ limit?: 1..200 }`), returning `{ ok: true, total, truncated, fixes }`.
  3. **`rules.suppression.prepare@1`** (`prepare_warning_suppression` -> `POST /api/agent/project-rules/suppression/prepare`, `effects: ['read', 'analyze']`, `agentScopes: ['read', 'write', 'deploy']`, in `LEDGER_QUIET_ROUTES`): resolves target mod from `{ path }` or `{ useAddressedWorkspace: true }` + `{ scope: { code, file?, sourceRef? } }` via `suppressionPreparation`, returning `expectedSha256`, `defaults`, `target`, and `explanation`.
  4. **`rules.suppression.apply@1`** (`apply_warning_suppression` -> `POST /api/agent/project-rules/suppression/apply`, `effects: ['filesystem-write', 'audit-write', 'audit-retention-delete']`, `agentScopes: ['write', 'deploy']`, explicit-grant in `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`): CAS-commits a reviewed `forge.rules.json` v1 warning suppression rule using `expectedSha256` (`string | null`) and `writeWorkspaceFileGuarded`, with Action Ledger diff/revert capture and one-use `undo-create` recovery when creating `forge.rules.json`.
  5. **`reviews.warning.revoke@1`** (`revoke_warning_review` -> `POST /api/agent/warning-reviews/revoke-review`, `effects: ['filesystem-write', 'audit-write', 'audit-retention-delete']`, `agentScopes: ['deploy']`, explicit-grant in `DEPLOY_EXPLICIT_GRANT_CAPABILITIES`): thin explicit-grant adapter sharing `handleWarningReviewRevoke` while keeping `POST /api/agent/warning-reviews/revoke` untouched as `legacy-agent-api` (`src/server/findingAcceptance.ts:328`).
  6. **`release.nexus.prepare@1`** (`prepare_nexus_release` -> `POST /api/agent/release/nexus/build`, `effects: ['filesystem-write', 'package', 'delete', 'audit-write', 'audit-retention-delete']`, `agentScopes: ['deploy']`, explicit-grant in `DEPLOY_EXPLICIT_GRANT_CAPABILITIES`): packages a reopen-verified Nexus Mods release ZIP + `.forge-release.json` from `{ path }` or `{ useAddressedWorkspace: true }` (`bump?: 'none' | 'patch' | 'minor'`), redacting host `zipPath`/`reportPath` and stage paths to relative `artifactFile`/`reportFile`.
  7. **`release.artifact.verify@1`** (`verify_release_artifact` -> `GET /api/agent/release/artifact/status`, `effects: ['read', 'analyze']`, `agentScopes: ['read', 'write', 'deploy']`): verifies a prepared Nexus/Steam release ZIP against its `.forge-release.json` report on disk (`?platform=nexus|steam&modId=...&artifactFile=...`) without streaming raw binary bytes over JSON-RPC stdio.
  8. **Reproduced `files.write@2` MCP grant fix & CI gate (`#69` / `#19`):** fix `[REPRODUCED]` `workspaceFilesGrantAllowed` in `vscode-extension/mcp/x4forge-mcp.cjs` (`expectedVersion = capability.id === "history.revert" || capability.id === "files.write" ? 2 : 1`) and wire `npm run test:native-deploy-mcp && npm run test:workspace-files-mcp` into `.github/workflows/quality.yml`.
- **Out of scope:** `W3B3` external-process `project-check-runs` (`'process'` effect outside `FORGE_CAPABILITY_EFFECTS`), Studio-session-only Steam Workshop interactive upload / export receipts, and live IDE/game writes.

## 2. Baseline & Reconciliation

- **Baseline:** `72bd88115756e1dbc2120960a72cb0bdf5ce49a9` (`origin/main`, Quality CI `45400811980` `SUCCESS`).
- **Reconciliation findings & capability-map delta:**
  - Reconciled `POST /api/agent/round-trip-check` (`scripts/route-integration.mjs:5281-5284` asserts host `importReport.folder` on the legacy route) and `POST /api/agent/warning-reviews/revoke` (`src/server/findingAcceptance.ts:328` stamps `legacyRoute: '/api/agent/warning-reviews/revoke'`): kept both legacy routes untouched and projected canonical capabilities over thin redacted/explicit-grant adapters sharing `evaluateModFolderRoundTrip` and `handleWarningReviewRevoke`.
  - Reproduced (`[REPRODUCED]`) that `workspaceFilesGrantAllowed` in `vscode-extension/mcp/x4forge-mcp.cjs` checked only `capability.id === "history.revert"` for `version === 2`, rejecting explicit MCP keys carrying `files.write@2` (`72bd881`), and `.github/workflows/quality.yml` ran mocked `test:mcp-capabilities` without running `test:native-deploy-mcp` or `test:workspace-files-mcp`.
  - **Capability-map delta:** `59 -> 66` capabilities (`56 -> 63` non-native; Contract SHA-256 `5e9fa2049f373e36b19c8c40fac0656044a22f8c4701186177927c96370a9b05`), `60 -> 67` MCP tools (`MCP_MODULE_AUDIT_VERSION = 31`, preset `read=33, write=38, deploy=39`), `349 -> 355` disposed literal routes (`SHA-256: 59d7d1fe224e060b99ec92b53f53a39d0488dd0bd6a4cca6e0b5fdc3f7ba440f`), `115 -> 120` action-receipt-coverage routes / `69` surfaces (`SHA-256: cf91e5c3aa7ff92798d17f79030446ec2aace98995a00ccc95e81830d823a1fe`), and `FORGE_UI_ACTION_PARITY_CENSUS` `available: 13 -> 14`, `partial: 26 -> 25`, `openGaps: 36 -> 35` (`SHA-256: 31d98c06f7d525763624581996779d9eacb5286cf8280884858f4bb2a36025d1`), with **zero** new raw `fs.*` writer calls (`sourceFingerprint: 256d0217...` / refreshed in `config/durable-writers.json`).

## 3. Validation Evidence

- `npm run lint -- --max-warnings 600` -> **PASS** (`0` errors, `580` warnings)
- `npm run typecheck` -> **PASS** (`0` errors)
- `npm run test:writers` -> **PASS** (`30/30 + PASS + 8/8`, zero raw writer count changes)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> **PASS** (`66` capabilities, `355` routes, `67` MCP aliases, `51` census rows)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:action-receipt-coverage` & `:selftest` -> **PASS** (`120` routes / `69` surfaces, `79/79 + 23/23`)
- `npx tsx scripts/c06-contracts.selftest.ts` & `npx tsx scripts/c06-api.selftest.ts` -> **PASS** (`196/196` + `42/42`)
- `npm run test:mcp-capabilities` -> **PASS** (`read=33, write=38, deploy=39`, `md-navigation`, `ai-navigation`, `native-performance` `30/30`)
- `npm run test:native-deploy-mcp` -> **PASS** (`6/6`)
- `npm run test:workspace-files-mcp` -> **PASS** (`8/8`, including `files.write@2` explicit-grant discovery & Undo-Create + all 7 Unit 28 MCP tools & negative guards)
- `npm run build` & `npm run test:oracles` -> **PASS** (`134/134`)
- `npm run test:routes` & `npm run precommit:check` -> **PASS** (`737/737 PASS`, `[precommit] OK`)

## 4. Close & Triggered AAR

- **Final status:** `VERIFIED` (isolated Dev source/HTTP/MCP; `#19` & `#69` remain `PARTIAL` pending `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): project round-trip, quick-fixes, suppression rules, review revoke, and Nexus release over MCP (#19, #69)`
- **AAR triggers fired:**
  1. Reproduced latent `workspaceFilesGrantAllowed` `files.write@2` version check bug in `vscode-extension/mcp/x4forge-mcp.cjs` from `72bd881` during baseline verification.
  2. Candidate generation caught `PropertiesInspector.tsx` client-side quick-fix evaluation (`disconnected` UI surface) and missing explicit `LEDGER_ROUTES` entry for `POST /api/agent/warning-reviews/revoke-review`, plus `resourceClass: 'configured-root'` on new routes and `r.root` typing in `server.ts`.
  3. Route-integration preset effective capability arrays (`read`, `write`, `deploy`) needed the 4 new read/analyze capabilities and 3 explicit-grant exclusions (`734/737 -> 737/737`).
- **Points to sustain:** Inspecting `x4forge-mcp.cjs:2975-2981` and running `npm run test:workspace-files-mcp` standalone immediately caught and eliminated the `files.write@2` MCP grant bug before shipping.
- **Points to improve — work/approach:** Whenever bumping any capability version (`@1 -> @2`) inside an explicit-grant family (`WORKSPACE_FILES_CAPABILITIES`, `DEPLOY_CAPABILITIES`, `CONFIGURATION_CAPABILITIES`), always check `*GrantAllowed` in `x4forge-mcp.cjs` alongside `TOOLS[i].capabilityVersion`.
- **Points to improve — tools / Highest-risk evidenced weakness:** `.github/workflows/quality.yml` previously ran `test:mcp-capabilities` (mock discovery fixtures) without `test:native-deploy-mcp` or `test:workspace-files-mcp` (real child backend + stdio MCP explicit-grant suites). Wired both suites directly into `.github/workflows/quality.yml` in this unit so live explicit-grant MCP regressions fail CI immediately.
