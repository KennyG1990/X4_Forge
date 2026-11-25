# Unit 50 — Explicit TTL-Bounded Driver Session Lease (`#49` / `FF-3, FF-13`)

Task: Implement an opt-in, TTL-bounded driver session lease across the Forge sidecar API, `GET /api/agent/status`, stdio MCP, and Studio UI (`#49`, `FF-3`, `FF-13`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Deliver the remaining multi-step session-level coordination layer tracked in GitHub Issue `#49` (`FF-3`, `FF-13`) on top of `07dc015`'s short-lived `sourceCoordination`:
  1. Ephemeral in-memory `DriverLeaseStore` (`src/lib/driverLease.ts`, zero raw `fs.*` writers so sidecar restart or TTL expiry always frees the lease without zombie lockfiles) with deterministic unit selftest (`runDriverLeaseSelftest()`, `16/16` checks).
  2. Live `driverLease` projection on `GET /api/agent/status` alongside `sourceCoordination`, plus canonical `GET /api/agent/lease` (`session.lease.read@1` / MCP `get_driver_lease`, `read`/`write`/`deploy` scopes) and `POST /api/agent/lease` (`session.lease.manage@1` / MCP `manage_driver_lease`, `write`/`deploy` scopes, `LEDGER_ROUTES` `'action'`, `durableKeyRoute`).
  3. Deterministic `409 DRIVER_LEASE_HELD` enforcement (`enforceDriverLeaseForMutation` and receipt-preserving `preflightFailure`) across mutating workspace, file, mod-folder sync (`apply: true`), and native deploy (`dryRun !== true` / undo) endpoints when held by a different principal, with Studio-owner-only override (`force: true` on `POST /api/agent/lease` or `x-forge-lease-force: 1` header; agents attempting force receive `403 DRIVER_LEASE_FORCE_STUDIO_ONLY`). When no lease is active (`held: false`), all endpoints behave identically to baseline.
  4. Studio UI coordination surface (`src/App.tsx` + `src/components/StudioActionsMenu.tsx`): `Take UI Driver Lease` / `Release UI Driver Lease` menu control (`data-testid="driver-lease-menu-btn"`) and a conditional `data-testid="studio-driver-lease-banner"` rendered strictly when `driverLease.held === true` (zero layout shift when idle) with `Extend 5m`, `Release Lease`, and `Force Release (Owner)`.
- **Rollback / checkpoint:** Clean baseline commit `a9426d17d103941bb422a5a5323dc2c77dfb2982` (`origin/main`), GitHub Actions `Quality` run `45579554962` (`SUCCESS`).

## BASELINE
- **Revision / CI:** `a9426d17d103941bb422a5a5323dc2c77dfb2982` (`main == origin/main`), GitHub Actions `Quality` `45579554962` `SUCCESS`, clean working tree.

## RECONCILE
- **Resources & callers searched:** `server.ts` (`authMiddleware`, `GET /api/agent/status`, mutating workspace/file/deploy handlers), `src/lib/forgeCapabilities.ts` (`111 -> 113` capabilities, `51 -> 52` UI-action parity rows), `vscode-extension/mcp/x4forge-mcp.cjs` (`112 -> 114` MCP aliases), `scripts/action-receipt-coverage-audit.ts`, `src/App.tsx`, `src/components/StudioActionsMenu.tsx`.
- **Capability-map delta:** Added `session.lease.manage@1` (`POST /api/agent/lease` / `manage_driver_lease`), `session.lease.read@1` (`GET /api/agent/lease` / `get_driver_lease`), and census row `workspace.driver_lease.coordinate` (`status: 'available'`, `available: 23 -> 24`, Contract SHA-256 `e526817379d4c41550a4b2f178940df5ac97e1780d83853d971bae3ad01f3717`, UI-action parity SHA-256 `3518ab2b2930464c51acc5ca11f34a4cc89b825909e7a9ba2ea7ac59afb22767`).
- **3-strike / hazard-sweep check:** Zero new raw `fs.*` writers (`50` writers and `sourceFingerprint: 2161db26e17fece661fb10c726cdbfe593a806d2d2773f65225500cf8506134d` unchanged); agent keys cannot spoof principal ownership or force-break leases (`403 DRIVER_LEASE_FORCE_STUDIO_ONLY`); raw tokens/secrets never appear in `PublicDriverLeaseStatus`.

## IMPLEMENT
- Created `src/lib/driverLease.ts` (`DriverLeaseStore`, `parseDriverLeaseManageBody`, `formatDriverLeaseConflictMessage`, `runDriverLeaseSelftest` `16/16`).
- Updated `src/lib/agentHistory.ts` (`LEDGER_ROUTES` `'POST /api/agent/lease'` as `'action'`).
- Updated `server.ts` (`driverLeaseStore`, `driverLeaseActorForRequest`, `enforceDriverLeaseForMutation`, `GET /api/agent/lease`, `POST /api/agent/lease`, `driverLease` on `GET /api/agent/status`, and mutation gates across `/api/fs/*`, `/api/agent/files/*`, `POST /api/agent/workspace` & `/merge` `preflightFailure`, `/api/agent/mod-folder/sync`, `/api/agent/workspace/domain`, `/api/agent/bulk-transform/execute`, `/api/agent/snapshots/restore`, `handleDeployUndoRoute`, `handleHistoryRevertById`, and `deployVerifyHandler` when `dryRun !== true`).
- Updated `src/components/StudioActionsMenu.tsx` and `src/App.tsx` (`driver-lease-menu-btn` + conditional `studio-driver-lease-banner` with `Extend 5m`, `Release Lease`, and `Force Release (Owner)`).
- Updated `src/lib/forgeCapabilities.ts`, `src/lib/forgeCapabilities.selftest.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts` (`MCP_MODULE_AUDIT_VERSION = 46`, `114` MCP mappings), `src/lib/actionReceiptPolicyBundle.ts` (`dc34d679e9d5558fa5b871da3daa269e70196d06f020c16144046c80e8e09334`), `src/lib/actionReceiptPolicyBundle.selftest.ts` (`routeCount: 141`), `config/forge-route-dispositions.json` (`402` routes, SHA-256 `d4c9bf4b08c746bcf92a7dde2e92bc47fa22ba3260589d012316cb64d8af74c9`), and `config/action-receipt-coverage.json` (`141` routes / `69` surfaces).
- Added MCP selftest assertions in `scripts/mcp-capability-selftest.ts`, HTTP integration checks in `scripts/route-integration.mjs`, and Chromium E2E spec `tests/e2e/driver-session-lease.spec.ts`.
- Post-lock scope changes: switched `session.lease.read@1` and `session.lease.manage@1` from `workspaceMode: 'optional'` / `global-session` to `workspaceMode: 'required'` / `resourceClass: 'workspace'` to satisfy B117's closed-world rule that `global-session` routes are Studio-session-only (matching `GET /api/agent/status`).

## VALIDATE
- **Static / types / lint:** `npm run typecheck` (`0` errors) & `npm run lint -- --max-warnings 600` (`0` errors, `578` warnings).
- **Durable-writer & capability audits:** `npm run test:writers` (`30/30 + PASS + 8/8`), `npm run test:capabilities` (`PASS`, `113` capabilities, `402` routes, `114` MCP aliases, `52` census rows).
- **Action-receipt coverage & selftests:** `npm run test:action-receipt-coverage` + `npm run test:action-receipt-coverage:selftest` (`141` routes / `69` surfaces, `79/79 + 23/23 PASS`).
- **MCP capability & transport suites:** `npm run test:mcp-capabilities` (`read=67, write=73, deploy=74`, `30/30 PASS`, including `get_driver_lease`, `manage_driver_lease`, malformed-input `-32602` pre-HTTP refusals, and `409 DRIVER_LEASE_HELD` `isError: true` structured payload), `npm run test:native-deploy-mcp` (`6/6`), `npm run test:workspace-files-mcp` (`18/18`).
- **Runtime oracles & HTTP routes:** `npm run test:oracles` (`134/134 PASS`, including `runDriverLeaseSelftest` `16/16`) & `npm run test:routes` (`801/801 PASS`, exercising `driver_session_lease_blocks_competing_mutations_and_supports_studio_owner_override`).
- **Real rendered Chromium UI (Playwright E2E):** `node scripts/run-e2e.mjs tests/e2e/capability-contract.spec.ts` (`5/5 PASS`) and `node scripts/run-e2e.mjs tests/e2e/driver-session-lease.spec.ts` (`1/1 PASS`, `VERDICT: PASS`, `treeGone=true`, screenshot `test-results/driver-session-lease-agent-held.png`).
- **Full precommit gate:** `npm run precommit:check` (`[precommit] OK`).

## REVIEW
- TTL-bounded holder record with auto-release on expiry & sidecar restart: **done and evidenced** (`src/lib/driverLease.ts`, `16/16` selftest).
- Readable on `GET /api/agent/status` and `GET /api/agent/lease` + MCP `get_driver_lease` / `manage_driver_lease`: **done and evidenced** (`801/801` routes, `test:mcp-capabilities`).
- `409 DRIVER_LEASE_HELD` on mutating endpoints with `dryRun: true` unblocked and Studio-owner-only override (`403 DRIVER_LEASE_FORCE_STUDIO_ONLY` for agents): **done and evidenced** (`801/801` routes).
- Live Studio UI coordination banner (0px idle impact) + menu toggle + `Force Release (Owner)`: **done and evidenced** (`driver-session-lease.spec.ts` `1/1 PASS`).

## CLOSE
- **Status:** `VERIFIED` (GitHub Issue `#49` remains open until `0.0.95` public VSIX ships after Unit 51).
- **Suggested commit title:** `feat(session): add TTL-bounded driver session lease across API, MCP, and Studio UI (#49)`

## AAR
- **Triggers:** `strictNullChecks: false` union narrowing error on first `tsc` pass; `capability-contract-audit` `global-session` / `vscode-extension-*` surface projection / `114` MCP mapping count checks; `PROMOTE_SUMMARY.manifestHash` field name vs `.manifestSha256`; `mintJson.record.id` in Playwright spec.
- **Sustain:** Keeping `DriverLeaseStore` pure in-memory avoided lockfile hazards and preserved `50` raw writers with zero `durable-writers.json` churn; routing `POST /api/agent/workspace` lease refusals through `preflightFailure` (`preflightKind = 'scope'`) preserved `executeWorkspaceReceiptMutation` invariants on the first pass.
- **Improve work/approach:** Always read the `Live Hazards & Environment Rules` tail of `SESSION-HANDOFF.md` at session start (lines `165-181`, not only lines `1-120`) — several of the exact manifest promotion rules (`vscode-extension-*` UI projection, `resourceClass: "workspace"`, `strictNullChecks: false` `=== false` narrowing) were already documented there.
- **Improve tools:** Documented `PROMOTE_SUMMARY.manifestHash` (vs `manifestSha256`) and `mappings.length` (`scripts/capability-contract-audit.ts:8977`) in `SESSION-HANDOFF.md` so future capability additions hit zero promotion friction.
- **Highest-risk evidenced weakness:** None beyond bookkeeping friction (`No evidenced risk delta`).
