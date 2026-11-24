# Plan & Close — `#19` P4 Slice 8: Explicit-Grant Steam Workshop Release Staging, Post-Tool Verification & CAS Source Adoption + Schema Contract Caching (`#19`)

- **Date:** 2026-11-24
- **Status:** `VERIFIED` (isolated Dev HTTP, stdio MCP, governance manifests, `134/134` oracles, `752/752` route checks, `precommit:check`; whole `#19` remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification)
- **Lane:** `FULL`
- **Owners / Issues:** `#19` (`release.steam.prepare_verify_adopt`), `#118` (reuses long-path-safe Steam staging allocation), CI `Quality` run `45430444533` discovery-storm fix

## 1. Plan And Acceptance Contract

- **Bounded unit:** Project Forge's local Steam Workshop release preparation, post-`WorkshopTool` integrity verification, and CAS-guarded source `content.xml` `ws_<numeric>` Workshop ID adoption across canonical capabilities, protected explicit-grant Agent HTTP routes, and stdio MCP tools — while preserving Studio-session-only isolation on host-path `POST /api/agent/release/steam/{prepare,verify,adopt}` and human save-picker `POST /api/agent/release/export/receipt` (`src/lib/agentKeys.ts:559-566`) — moving `release.steam.prepare_verify_adopt` in `FORGE_UI_ACTION_PARITY_CENSUS` from `missing` to `partial` (`missing: 10 -> 9`, `partial: 23 -> 24`), AND resolve the `[REPRODUCED]` GitHub Actions `Quality` run `45430444533` MCP discovery timeout storm on `GET /api/agent/schema`:
  1. **`release.steam.prepare@1`** (`prepare_steam_release` -> `POST /api/agent/release/steam/build`, `agentScopes: ['deploy']`, explicit-grant in `DEPLOY_EXPLICIT_GRANT_CAPABILITIES`, `effects: ['filesystem-write', 'package', 'delete', 'audit-write', 'audit-retention-delete']`, `context.workspace: 'optional'`, `LEDGER_ROUTES` `kind: 'package'`):
     - Closed body: `{ path?, useAddressedWorkspace?, bump?: 'none' | 'patch' | 'minor', previewFile?, changeNote?, minorUpdate? }`.
     - Rejects host-path inputs (`previewPath`, `toolPath` are not accepted); validates optional `previewFile` as a single-segment `.png`/`.jpg`/`.jpeg` file inside the selected mod folder, builds and verifies the CAT/DAT staging folder + preview image + reopen-verified rollback backup ZIP + `<modId>.forge-release.json` report under `.forge-builds/releases/steam/`, and returns redacted `targetFolder`, `backupFile`, `backupHash`, `backupSizeBytes`, `reportFile`, `sourceManifestAdoptionAvailable`, and redacted `stages`.
  2. **`release.steam.verify@1`** (`verify_steam_release` -> `POST /api/agent/release/steam/check`, `agentScopes: ['deploy']`, explicit-grant in `DEPLOY_EXPLICIT_GRANT_CAPABILITIES`, `effects: ['read', 'analyze', 'filesystem-write', 'audit-write', 'audit-retention-delete']`, `context.workspace: 'optional'`, `LEDGER_ROUTES` `kind: 'package'`):
     - Closed body: `{ modId }`.
     - Verifies on disk after interactive `WorkshopTool.exe` execution that staged `content.xml` carries a valid `ws_<numeric>` Workshop ID, only Workshop-managed manifest attributes changed relative to `preparedManifestXml`, and all non-manifest staged payload files remain byte-identical, updating `<modId>.forge-release.json` (`VERIFIED_AFTER_WORKSHOP_TOOL`) and returning redacted `targetFolder`, `reportFile`, `workshopId`, `sourceManifestAdoptionRequired`, `sourceManifestAdoptionAvailable`, and redacted `stages`.
  3. **`release.steam.adopt@1`** (`adopt_steam_workshop_id` -> `POST /api/agent/release/steam/apply-adoption`, `agentScopes: ['deploy']`, explicit-grant in `DEPLOY_EXPLICIT_GRANT_CAPABILITIES`, `effects: ['filesystem-write', 'audit-write', 'audit-retention-delete']`, `context.workspace: 'optional'`, `LEDGER_ROUTES` `kind: 'package'`):
     - Closed body: `{ modId, apply?: boolean, expectedSourceSha256?, expectedWorkshopId?, expectedBindingHash? }`.
     - Previews (`apply: false`, suppressed from Action Ledger when `sourceWritePerformed === false && res.statusCode < 400`) or CAS-adopts (`apply: true`, enforcing `expectedSourceSha256`, `expectedWorkshopId`, `expectedBindingHash`, and physical `steamAdoptionSource` stamp identity with automatic rollback on write mismatch) the verified `ws_<numeric>` Workshop ID and release version into `<folderName>/content.xml` inside `Mod Workspace`, returning redacted `sourceManifestFile` (`<folderName>/content.xml`), `beforeSha256`, `afterSha256`, `bindingHash`, and redacted `stages`.
  4. **CI `45430444533` Discovery-Storm Fix (`server.ts` & `scripts/workspace-files-mcp.selftest.ts`):**
     - Cache immutable startup constants `CACHED_FORGE_CAPABILITY_CONTRACT`, `CACHED_FORGE_UI_ACTION_PARITY_CENSUS`, and `CACHED_MINIMAL_SCHEMA_WORKSPACE` in `server.ts` so `GET /api/agent/schema` does not recompute canonical sorting + SHA-256 over `76` capabilities and `51` UI-action parity rows on every poll, remove `X4FORGE_CAPABILITY_RETRY_MS: '100'` from `scripts/workspace-files-mcp.selftest.ts`, and close disposable MCP child sessions once their checks complete.
- **Out of scope:** Executing Egosoft `WorkshopTool.exe` from the backend/agent (remains interactive human-terminal only), accepting arbitrary host `toolPath`/`previewPath` from agents, and agent claims of human save-picker export receipts (`POST /api/agent/release/export/receipt` remains Studio-session-only per `no_agent_key_scope_can_claim_user_export_receipt`).
- **Rollback / checkpoint:** `ba4cb96a51b16fbac94654e7cd755c976cf57e9e` (`origin/main`).

## 2. Baseline & Reconciliation

- **Baseline:** `main` at `ba4cb96a51b16fbac94654e7cd755c976cf57e9e`; GitHub Actions `Quality` run `45430444533` failed step 21 (`workspace-files-mcp.selftest.ts:1346` -> `Unknown tool: restore_workspace_file`) at `9/10` checks on `windows-latest`.
- **Reconciliation:**
  - `src/lib/agentKeys.ts:559-566` and `scripts/route-integration.mjs:5439,5451` enforce `no_agent_key_scope_can_prepare_or_verify_steam_uploads` on Studio `POST /api/agent/release/steam/{prepare,verify,adopt}` (which accept raw host `previewPath`/`toolPath` and return raw host paths) and `no_agent_key_scope_can_claim_user_export_receipt` on `POST /api/agent/release/export/receipt`. Keeping those four Studio routes `session-only` while adding closed-input, host-path-redacted `POST /api/agent/release/steam/{build,check,apply-adoption}` in `DEPLOY_EXPLICIT_GRANT_CAPABILITIES` preserves every security invariant and honestly transitions `release.steam.prepare_verify_adopt` from `missing` to `partial` (`missing: 10 -> 9`, `partial: 23 -> 24`, `openGaps: 33`).
  - `[REPRODUCED]` `45430444533` root cause: `workspace-files-mcp.selftest.ts:112` passed `X4FORGE_CAPABILITY_RETRY_MS: '100'` across 6 persistent MCP child processes (`~60` HTTP discovery requests/sec) while `server.ts:4791-4792` recomputed `buildForgeCapabilityContract(...)` + `buildForgeUiActionParityCensus(...)` + `sanitizeWorkspace(...)` on every `GET /api/agent/schema` request. When a discovery cycle exceeded `CAPABILITY_DISCOVERY_TIMEOUT_MS = 2000` on 2-vCPU CI, `x4forge-mcp.cjs:3770` entered `unavailable-sticky-live` mode and stripped `WORKSPACE_FILES_TOOLS`.
  - **Capability-map delta:** `73 -> 76` capabilities (`release.steam.adopt@1`, `release.steam.prepare@1`, `release.steam.verify@1`), `74 -> 77` MCP tools (`adopt_steam_workshop_id`, `prepare_steam_release`, `verify_steam_release`, `MCP_MODULE_AUDIT_VERSION = 34`), Contract SHA-256 `dff40037dce50f705d46ff7af0f89e4daaf0a7b72f18f652a539daeef1835bea`, UI-action parity SHA-256 `778d042281fd39aa291386f7f3ad94887bcd72b23c5369a892bde8af050ee430` (`available: 16`, `approvalRequired: 2`, `partial: 24`, `missing: 9`, `openGaps: 33`).

## 3. Implementation Summary

- **`src/lib/agentCapabilityAuthority.ts`:** Added `'release.steam.adopt'`, `'release.steam.prepare'`, and `'release.steam.verify'` to `DEPLOY_EXPLICIT_GRANT_CAPABILITIES`.
- **`src/lib/agentHistory.ts` & `src/lib/agentHistory.selftest.ts`:** Registered `/api/agent/release/steam/build`, `/api/agent/release/steam/check`, and `/api/agent/release/steam/apply-adoption` as `kind: 'package'`.
- **`server.ts`:**
  - Precomputed `CACHED_FORGE_CAPABILITY_CONTRACT`, `CACHED_FORGE_UI_ACTION_PARITY_CENSUS`, and `CACHED_MINIMAL_SCHEMA_WORKSPACE` once at startup for `GET /api/agent/schema`.
  - Added `/api/agent/release/steam/{build,check,apply-adoption}` to `durableKeyRoute`, suppressed dry-run `apply: false` (`sourceWritePerformed === false && res.statusCode < 400`) in Action Ledger, and registered `/steam/apply-adoption` in `sourceOperationKeys`.
  - Added recursive `redactReleaseStageValue` inside `redactReleaseStages` (stripping `evidence.preview.path` / `evidence.tool.path`), extracted `executeSteamReleasePrepare`, `executeSteamReleaseVerify`, and `executeSteamReleaseAdopt` with zero new raw `fs.*` calls, and registered host-path-redacted `POST /api/agent/release/steam/{build,check,apply-adoption}`.
- **`src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`:** Registered `release.steam.adopt@1`, `release.steam.prepare@1`, and `release.steam.verify@1`, updated `release.steam.prepare_verify_adopt` (`missing -> partial`), and updated `reviews.warning.revoke` `workspace: 'optional'` + census count assertions.
- **`vscode-extension/mcp/x4forge-mcp.cjs` & `scripts/capability-contract-audit.ts`:** Projected `prepare_steam_release`, `verify_steam_release`, and `adopt_steam_workshop_id` (`DEPLOY_TOOLS`, `deployRoute` `/api/agent/release/steam/`, `MCP_MODULE_AUDIT_VERSION = 34`, and pointed `sessionOnlyFalsePartialProbe` at `'preferences.studio_layout.configure'`).
- **`scripts/mcp-capability-selftest.ts`, `scripts/workspace-files-mcp.selftest.ts`, `scripts/route-integration.mjs`, `src/lib/actionReceiptPolicyBundle.ts`, `src/lib/actionReceiptPolicyBundle.selftest.ts`, & `config/*`:** Added explicit-grant Steam MCP discovery & end-to-end tests (`11/11`), removed `X4FORGE_CAPABILITY_RETRY_MS: '100'`, closed disposable MCP sessions, added HTTP route checks (`752/752`), and promoted `config/durable-writers.json` (`sourceFingerprint: 9cc279cb534af7a1c622df6b7bd404f80ee8fb72457b6b53dbd49c9d360a2ae7`, `50` raw writers unchanged), `config/forge-route-dispositions.json` (`365` routes, SHA-256 `2690807c25208af50dae30992fb4d053ac5447806bc67eedc4cd66155bd224c1`), and `config/action-receipt-coverage.json` (`127` routes / `69` surfaces, SHA-256 `0a245fd17868c753e58cb64429ba3abd6d7b4d612c38fedd3def5aa3b3c287fa`).

## 4. Validation Evidence

- `npm run lint -- --max-warnings 600` -> `0` errors, `579` warnings (`PASS`)
- `npm run typecheck` -> exit `0` (`PASS`)
- `npm run test:writers` -> `30/30 + PASS + 8/8` (`50` raw filesystem sources, `sourceFingerprint: 9cc279cb534af7a1c622df6b7bd404f80ee8fb72457b6b53dbd49c9d360a2ae7`)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`76` capabilities, `365` routes, `77` MCP aliases, `51` UI-action parity rows)
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> `PASS` (`127` routes / `69` surfaces, `79/79 + 23/23`, `actionReceiptPolicyBundle.selftest.ts` `19/19`)
- `npx tsx src/lib/agentHistory.selftest.ts` -> `PASS`
- `npx tsx scripts/c06-contracts.selftest.ts` -> `196/196 PASS`
- `npx tsx scripts/c06-api.selftest.ts` -> `42/42 PASS`
- `npm run test:mcp-capabilities` -> `PASS` (`read=35, write=40, deploy=41`, `md-navigation`, `ai-navigation`, `native-performance` `30/30`)
- `npm run test:native-deploy-mcp` -> `6/6 PASS`
- `npm run test:workspace-files-mcp` -> `11/11 PASS` (including `11_steam_release_prepare_verify_and_cas_workshop_id_adoption_over_mcp`: preset `deploy` isolation, `prepare_steam_release` + zero host-path leakage, `verify_release_artifact` on rollback backup ZIP, `409 STEAM_WORKSHOP_ID_MISSING` before tool, `409 STEAM_POST_TOOL_INTEGRITY_FAILED` on tampered `ext_01.cat`, `VERIFIED_AFTER_WORKSHOP_TOOL` after `ws_987654321`, quiet `apply: false` adoption preview, `409 STEAM_ADOPTION_PREVIEW_CHANGED` refusal, and CAS `VERIFIED_AND_ADOPTED` apply)
- `npm run build` -> exit `0` (`PASS`)
- `npm run test:oracles` -> `134/134 green` (`PASS`)
- `npm run test:routes` (with `X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset) -> `752/752 PASS`
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run precommit:check` -> `[precommit] OK`

## 5. Review & Close

- **Requirements walkthrough:**
  - `release.steam.prepare@1` (`prepare_steam_release`), `release.steam.verify@1` (`verify_steam_release`), and `release.steam.adopt@1` (`adopt_steam_workshop_id`) with explicit `deploy` grant, closed input schemas, and host-path redaction -> **Done and evidenced**.
  - Studio-session-only isolation preserved on `POST /api/agent/release/steam/{prepare,verify,adopt}` and `POST /api/agent/release/export/receipt` -> **Done and evidenced**.
  - `FORGE_UI_ACTION_PARITY_CENSUS` updated (`missing: 10 -> 9`, `partial: 23 -> 24`) -> **Done and evidenced**.
  - GitHub Actions `Quality` `45430444533` MCP discovery storm & `/api/agent/schema` recomputation fixed -> **Done and evidenced**.
- **Final status:** `VERIFIED` (isolated Dev; whole `#19` remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): project Steam release staging, verify, and adoption + cache schema contract (#19)`

## 6. Triggered AAR

- **Triggers:**
  1. CI `Quality` run `45430444533` on `ba4cb96` surfaced a `[REPRODUCED]` `2000 ms` MCP discovery timeout under `X4FORGE_CAPABILITY_RETRY_MS: '100'`, folded into this unit.
  2. Redirecting `node scripts/durable-writer-audit.mjs --print-current > config/durable-writers.json` overwrote annotated writer metadata (`categories`, `owners`, `rationale`, `failureContract`) because `--print-current` emits raw discovery counts only; immediately restored from `git show HEAD:config/durable-writers.json` and updated only `sourceFingerprint`.
  3. `test:routes` caught `!id.startsWith('release.steam.')` missing in `deploy_key_effective_capabilities_are_exact_and_hashed` (`scripts/route-integration.mjs:1469`) on attempt 1 (`751/752 -> 752/752`).
- **Sustain:** Checking GitHub Actions `Quality` immediately after every push caught `45430444533` within minutes and allowed a clean root-cause fix (`server.ts` startup schema caching + `workspace-files-mcp.selftest.ts` polling cleanup) instead of ignoring a flaky test.
- **Improve — work/approach:** Never redirect `durable-writer-audit.mjs --print-current` directly over `config/durable-writers.json`; always patch only the `"sourceFingerprint"` field in place so human-authored `categories`/`owners`/`rationale`/`failureContract` annotations remain untouched, and always update `scripts/route-integration.mjs:1469`'s preset `deploy` exclusion filter whenever adding capabilities to `DEPLOY_EXPLICIT_GRANT_CAPABILITIES`.
- **Improve — tools:** `GET /api/agent/schema` previously recomputed `buildForgeCapabilityContract` + `buildForgeUiActionParityCensus` + `sanitizeWorkspace` on every request; precomputing those three static structures at module startup eliminates unnecessary CPU churn across all IDE/MCP discovery polls.
- **Highest-risk evidenced weakness:** High-frequency `X4FORGE_CAPABILITY_RETRY_MS` overrides in multi-session MCP integration tests create background discovery storms (`2` HTTP requests $\times$ `N` sessions $\times$ `10 Hz`) that can trip `CAPABILITY_DISCOVERY_TIMEOUT_MS = 2000` on 2-vCPU CI runners and drop explicit-grant tools via `unavailable-sticky-live`; mitigated here by startup schema caching, default `5000 ms` retry interval in `workspace-files-mcp.selftest.ts`, and immediate `session.close()` on disposable test sessions.
