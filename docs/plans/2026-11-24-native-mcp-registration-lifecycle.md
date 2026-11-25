# Plan — Secure Native MCP Opt-In Registration Lifecycle (Unit 43 / GitHub `#31` / Kimi R21)

- **Date:** 2026-11-24
- **Lane:** FULL
- **Status:** PARTIAL (Dev controller, live sidecar + stdio MCP, secret scans, and packaged VSIX VERIFIED; installed VS Code & `FORGE DEVELOPMENT` Antigravity interaction gated on `0.0.94`)
- **Issue:** `#31` (`[Feature] Secure native MCP opt-in registration lifecycle (Kimi R21)`, parent `#29`)

## PLAN

- **Bounded unit:** Implement an explicit, opt-in extension-native MCP server definition-provider registration lifecycle in `vscode-extension/` that stores credentials exclusively in `context.secrets`, persists only validated non-secret state metadata in `context.globalState`, lazily resolves the managed Forge sidecar and workspace-bound scoped key (`read` or `write`, never `deploy` or spend), invalidates authority on IDE or Forge workspace switches, exposes truthful `disabled` / `enabled` / `revocation-pending` states, revokes the exact owned key on disable, preserves unrelated MCP configs without touching external files, and provides manual clipboard fallback on unsupported hosts.
- **Assumptions:**
  - Modern VS Code (1.99+) and Antigravity expose `vscode.lm.registerMcpServerDefinitionProvider` and `vscode.McpStdioServerDefinition` at runtime even though `vscode-extension/package.json` compiles against `@types/vscode` `^1.85.0` for broad engine compatibility; runtime feature detection (`detectHostMcpProviderApi`) cleanly distinguishes supported hosts from older hosts without raising activation errors.
  - Installed VS Code and `FORGE DEVELOPMENT` Antigravity UI interaction remain gated on Ken's `0.0.94` Machine-State Ask + Write Gate, so `#31` will close at `VERIFIED` for isolated controller/real-sidecar/stdio-MCP/VSIX layers and remain `PARTIAL` on GitHub until `0.0.94` installed-host qualification.
- **Authoritative references:**
  - GitHub `#31` & `docs/plans/2026-07-29-kimi-recommendations-ledger.md` (R21)
  - `vscode-extension/src/extension.ts` (`activate`, `ensureBackend`, `handleStudioMessage` `workspace-authority-changed`, `createAgentKey`, `copyMcpConfig`, `showIdeCapabilities`)
  - `vscode-extension/src/capabilities.ts` (`detectIdeCapabilities`, `formatIdeCapabilityReport`)
  - `vscode-extension/mcp/x4forge-mcp.cjs` (bundled stdio MCP shim, capability discovery, monotonic narrowing)
  - `server.ts:1874-2012` (`GET /api/agent/keys`, `POST /api/agent/keys`, `POST /api/agent/keys/revoke`), `server.ts:2109` (`GET /api/agent/capabilities/effective`), `server.ts:4904` (`GET /api/agent/schema`)
  - `config/durable-writers.json`, `config/action-receipt-coverage.json`, `src/lib/forgeCapabilities.ts` (`FORGE_UI_ACTION_PARITY_CENSUS`), `vscode-extension/scripts/inspect-vsix.mjs`
- **In scope:**
  1. `vscode-extension/src/mcpRegistrationLifecycle.ts`: Pure, host-agnostic lifecycle controller (`createMcpRegistrationLifecycle`), runtime host-API detector (`detectHostMcpProviderApi`), non-secret metadata validator, secret redactor (`redactMcpSecrets`), lazy `provideDefinitions` / `resolveDefinition` state machine, workspace-authority invalidation, exact key revocation + `revocation-pending` retry, all 7 required refusal paths (`UNSUPPORTED_HOST_API`, `SIDECAR_UNAVAILABLE`, `KEY_INVALID_OR_REVOKED`, `SECRET_STORE_FAILURE`, `WORKSPACE_AUTHORITY_CHANGED`, `REVOKE_FAILED`, `MALFORMED_CAPABILITY_CONTRACT`), and pure non-destructive manual MCP config merge/fallback helper (`buildManualMcpConfigFallback`).
  2. `vscode-extension/src/capabilities.ts`: Extend `IdeCapabilityInput` and `IdeCapabilityReport` with optional `mcpRegistration` status (`disabled` | `enabled` | `revocation-pending`, host API support, scope, bound workspace ID, key ID, last refusal code — zero secrets) and add selftest assertions.
  3. `vscode-extension/src/extension.ts` & `vscode-extension/package.json`:
     - Contribute `mcpServerDefinitionProviders` (`id: "x4forge.mcp"`, `label: "X4 Forge Studio"`) and command `x4forge.manageMcpRegistration` (`"X4 Forge: Manage Native MCP Registration"`, plus `viewsWelcome` link) while preserving `x4forge.copyMcpConfig` as the explicit manual fallback.
     - Wire `context.secrets` (`secretStore: 1`, `secretDelete: 1`) and `context.globalState` (`globalStateUpdate: 3 -> 4`) adapters, `vscode.lm.registerMcpServerDefinitionProvider`, `vscode.workspace.onDidChangeWorkspaceFolders`, and Studio `workspace-authority-changed` invalidation.
  4. `vscode-extension/scripts/inspect-vsix.mjs`: Scan non-vendored packaged VSIX entries for leaked `x4fk_<64 hex>` agent keys (+ selftest negative control).
  5. `vscode-extension/src/mcpRegistrationLifecycle.selftest.ts`, `package.json` (`test:extension-mcp-lifecycle`), & `.github/workflows/quality.yml`: End-to-end deterministic + live-backend + real `x4forge-mcp.cjs` stdio harness proving lazy resolution, restart survival, workspace-switch invalidation, exact key revocation, `revocation-pending` truth, all 7 refusal paths, list/call parity & monotonic narrowing, external `.mcp.json` byte non-mutation, and secret scans across metadata/logs/settings/clipboard/VSIX.
  6. Update coupled manifests: `config/durable-writers.json` (`vscode-extension/src/extension.ts` host-store counts + `sourceFingerprint`), `config/action-receipt-coverage.json` (`host-store:vscode-extension/src/extension.ts` owner metadata, preserving `139` routes / `69` surfaces), and `src/lib/forgeCapabilities.ts` (`FORGE_UI_ACTION_PARITY_CENSUS` `credentials.agent_keys.manage` `extensionCommands` & `uiAnchors`).
- **Out of scope:**
  - Writing external `.mcp.json` / `.vscode/mcp.json` / Cursor / Claude / Antigravity user config files on disk.
  - Auto-enabling MCP without explicit user opt-in, or minting `deploy` / `all` / spend keys through native MCP registration.
  - Modifying `FORGE DEVELOPMENT` (`PID 34076`) or publishing to Open VSX without Ken's Machine-State Ask + Write Gate.
- **Risks and authorization boundaries:**
  - Orphaned active agent key if `context.secrets.store` or `POST /api/agent/keys/revoke` fails: mitigated by immediate server revocation on `secrets.store` failure and retaining `keyId` in `revocation-pending` whenever revocation is unconfirmed.
  - Secret leakage into `globalState`, output logs, error banners, clipboard, or VSIX: mitigated by `assertNonSecretMetadata`, `redactMcpSecrets`, placeholder-only manual clipboard fallback, and `inspect-vsix.mjs` `x4fk_` byte scanning.
- **Rollback/checkpoint:**
  - Restore touched files to `60ea11b60e196366b136a84319abb3147254d5c5` via `git show HEAD:<path>` and delete `vscode-extension/src/mcpRegistrationLifecycle.ts` / `.selftest.ts`.
- **Acceptance criteria:**
  1. Default state is `disabled`; `provideMcpServerDefinitions` returns `[]` and touches neither the sidecar nor external MCP config files unless the user explicitly opts in.
  2. When opted in (`enabled`), `provideMcpServerDefinitions` returns a secret-free stub without starting the sidecar or minting a key; `resolveMcpServerDefinition` lazily resolves the owned sidecar, validates `/api/agent/schema`, verifies workspace binding, mints/reuses a `read` or `write` scoped key stored solely in `context.secrets`, verifies `/api/agent/capabilities/effective`, and spawns a working `x4forge-mcp.cjs` session with green `tools/list` / `tools/call` parity and monotonic narrowing.
  3. Restarting the extension host preserves `enabled` / `disabled` / `revocation-pending` truth without widening authority; switching IDE workspace folders or Studio `workspaceId` invalidates authority, revokes the previous workspace's key, and refuses cross-workspace reuse (`WORKSPACE_AUTHORITY_CHANGED`).
  4. Disabling revokes the exact owned key (`POST /api/agent/keys/revoke`) and deletes the secret; failed/offline revocation transitions truthfully to `revocation-pending` until retry succeeds.
  5. Unsupported hosts refuse native enablement with `UNSUPPORTED_HOST_API` and offer placeholder-only manual config fallback while preserving unrelated `mcpServers` entries.
  6. All 7 required refusal paths, secret scans (metadata, logs, settings, clipboard, VSIX), `inspect-vsix` on a real packaged `.vsix`, `precommit:check`, and GitHub Actions `Quality` pass.
- **Required validation and negative path:**
  - `npm run test:extension-mcp-lifecycle` (all 7 refusal paths + real `server.ts` + real `x4forge-mcp.cjs` + secret scans + external `.mcp.json` byte-unchanged check)
  - `npm run test:extension-capabilities`
  - `npm run build --prefix vscode-extension`
  - `node vscode-extension/scripts/inspect-vsix.mjs --selftest` + real `vsce package` + `inspect-vsix`
  - `npm run test:writers`
  - `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`
  - `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest`
  - `npm run lint -- --max-warnings 600` & `npm run typecheck`
  - `npm run test:oracles` & `npm run test:routes` (`X4_XSD_PATH` / `X4_REFERENCE_ROOT` unset)
  - `npm run precommit:check`
- **Evidence locations:**
  - `docs/plans/2026-11-24-native-mcp-registration-lifecycle.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`, GitHub `#31` comment, and Notion `Forge QA Field Log`.

## BASELINE

- **Revision/version:** `60ea11b60e196366b136a84319abb3147254d5c5` (`0.0.93` + 42 Dev units), clean worktree.
- **Existing changes/failures/runtime state:**
  - `vscode-extension/src/extension.ts:2310` (`copyMcpConfig`) only copies placeholder JSON to clipboard; no `mcpServerDefinitionProviders`, `context.secrets` integration, lazy resolution, or key revocation lifecycle exists yet.

## RECONCILE

- **Resources and readers/writers searched:**
  - `vscode-extension/src/extension.ts`, `vscode-extension/src/capabilities.ts`, `vscode-extension/package.json`, `vscode-extension/mcp/x4forge-mcp.cjs`, `server.ts:1874-2012,2109,4904`, `scripts/durable-writer-audit.mjs`, `config/durable-writers.json`, `scripts/action-receipt-coverage-audit.ts`, `config/action-receipt-coverage.json`, `src/lib/forgeCapabilities.ts` (`FORGE_UI_ACTION_PARITY_CENSUS`), `scripts/capability-contract-audit.ts`, and `vscode-extension/scripts/inspect-vsix.mjs`.
- **Existing capability reused:**
  - Reuses bundled `vscode-extension/mcp/x4forge-mcp.cjs`, `POST /api/agent/keys` + `createdAgentKeyMatchesRequestedAuthority`, `GET /api/agent/keys`, `POST /api/agent/keys/revoke`, `GET /api/agent/schema`, `GET /api/agent/capabilities/effective`, `ensureBackend(context)`, `handleStudioMessage` (`workspace-authority-changed`), and `detectIdeCapabilities`.
- **Couplings checked:**
  - `config/durable-writers.json`: `vscode-extension/src/extension.ts` `hostStores.calls` updates from `{ "globalStateUpdate": 3 }` to `{ "globalStateUpdate": 4, "secretDelete": 1, "secretStore": 1 }` (`0` new raw filesystem writers; `12` host-store sources & `69` receipt-coverage surfaces unchanged; `owners` avoids `/credential|keystore|agentkeys/` substring collision in `action-receipt-coverage-audit.ts:949`).
  - `config/action-receipt-coverage.json`: `host-store:vscode-extension/src/extension.ts` `owner` string promoted via `--generate-candidate` + `--promote-candidate`.
  - `src/lib/forgeCapabilities.ts`: `FORGE_UI_ACTION_PARITY_CENSUS` row `credentials.agent_keys.manage` updated with `x4forge.manageMcpRegistration` command and `uiAnchors` (`status: 'missing'` preserved since MCP registration remains IDE-owner-only).
- **Capability-map delta:** `FORGE_UI_ACTION_PARITY_CENSUS` `credentials.agent_keys.manage` adds `x4forge.manageMcpRegistration` (`0` agent capability descriptor changes; `109` capabilities unchanged).
- **Plan changes:** None prior to implementation.

## IMPLEMENT

- **Actual bounded changes:**
  - `vscode-extension/src/mcpRegistrationLifecycle.ts`: Implemented pure, host-agnostic `createMcpRegistrationLifecycle`, `detectHostMcpProviderApi`, `assertNonSecretMetadata`, `normalizeStoredMcpMetadata`, `isValidLiveCapabilityContract` (`forge.capability.v1`), `isValidEffectiveAuthorityPayload`, `redactMcpSecrets`, `containsMcpSecretMaterial`, `computeIdeWorkspaceSignature`, and `buildManualMcpConfigFallback`.
  - `vscode-extension/src/capabilities.ts`: Extended `detectIdeCapabilities` and `formatIdeCapabilityReport` with truthful `disabled` / `enabled` / `revocation-pending` + host-support reporting (`8/8` selftest).
  - `vscode-extension/src/extension.ts` & `vscode-extension/package.json`: Contributed `mcpServerDefinitionProviders` (`x4forge.mcp`) and `x4forge.manageMcpRegistration` (`Manage Native MCP` in `viewsWelcome`), wired `context.secrets` (`secretStore: 1`, `secretDelete: 1`) + `context.globalState` (`globalStateUpdate: 4`) adapters, registered `vscode.lm.registerMcpServerDefinitionProvider`, subscribed to `vscode.workspace.onDidChangeWorkspaceFolders` + Studio `workspace-authority-changed` + `bindBackendWorkspace`, and made `x4forge.copyMcpConfig` an explicit offline-safe placeholder manual fallback.
  - `vscode-extension/scripts/inspect-vsix.mjs`: Added `findForbiddenEmbeddedSecret` rejecting embedded `x4fk_<64 hex>` agent tokens across non-vendored packaged VSIX entries (`18/18` selftest).
  - `scripts/mcp-registration-lifecycle.selftest.ts`, `package.json`, & `.github/workflows/quality.yml`: Added 5-group live sidecar + real `x4forge-mcp.cjs` stdio + fault-injection + secret-scan selftest (`test:extension-mcp-lifecycle`) and wired it into GitHub Actions `Quality`.
  - `src/lib/forgeCapabilities.ts`, `config/durable-writers.json`, `config/action-receipt-coverage.json`, & `src/lib/actionReceiptPolicyBundle.ts`: Classified `x4forge.manageMcpRegistration` under `credentials.agent_keys.manage` (`UI-action parity SHA-256: 38649a51371ad1a6f4dae10d858811ab446898ce1627f0d7fda5312e695bdc7f`) and promoted `host-store:vscode-extension/src/extension.ts` (`sourceFingerprint: 0350c67b6812482b04a227277fc50b1e09e339e2b0b4e80e49ce38c223765052`, `manifestSha256: 681d63cbd75e5deebcea754940c2463fa6c00b4d4f851a1102172f4b3b53bfcf`, `50` raw writers and `139` routes / `69` surfaces unchanged).
- **Scope changes and reasons:** Placed the live-backend selftest at `scripts/mcp-registration-lifecycle.selftest.ts` (instead of `vscode-extension/src/`) so temporary test scratch directories do not register as production extension writers in `config/durable-writers.json`.

## VALIDATE

- `npm run test:extension-mcp-lifecycle` -> exit `0` (`5/5 passed`: unsupported-host refusal & manual fallback merge preserving unrelated `mcpServers`, lazy opt-in & lazy sidecar/key resolution, real `x4forge-mcp.cjs` `tools/list` [`69` write, `64` read, `0` deploy/spend] & `tools/call` parity, restart survival without widening authority, Studio & IDE workspace-switch key revocation, all 7 refusal paths including `SECRET_STORE_FAILURE` rollback + `MALFORMED_CAPABILITY_CONTRACT` + `KEY_INVALID_OR_REVOKED` + `REVOKE_FAILED` `revocation-pending` recovery, `.mcp.json` / `.vscode/mcp.json` byte non-mutation, and zero-leak secret scans)
- `npm run test:extension-capabilities` -> exit `0` (`8/8 allPassed=true`)
- `npm run test:extension-backend-recovery` -> exit `0` (`39/39 allPassed=true`)
- `npm run build --prefix vscode-extension` & `npm run stage-app --prefix vscode-extension` -> exit `0`
- `npm run package --prefix vscode-extension` + `node vscode-extension/scripts/inspect-vsix.mjs` (`18/18` selftest + real `2,173`-entry VSIX) -> exit `0` (`PASS 2173 entries, 79843235 unpacked bytes`, zero embedded secrets/paths/VSCE false links; scratch VSIX deleted)
- `npm run typecheck` -> exit `0`
- `npm run lint -- --max-warnings 600` -> exit `0` (`0` errors, `578` warnings)
- `npm run test:writers` -> exit `0` (`30/30 + PASS + 8/8`, `50` raw writers, `12` host stores)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> exit `0` (`109` capabilities, `398` routes, `110` MCP aliases, `51` UI-action parity rows)
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> exit `0` (`139/69`, `79/79 + 23/23`)
- `npm run test:oracles` -> exit `0` (`134/134 PASS`)
- `npm run test:routes` (`X4_XSD_PATH` & `X4_REFERENCE_ROOT` unset) -> exit `0` (`792/792 PASS`)
- `npm run precommit:check` -> exit `0` (`[precommit] OK`)

## REVIEW

- `context.secrets`-only token storage & validated non-secret metadata -> **done**.
- Lazy sidecar + workspace-bound key resolution & restart survival -> **done**.
- Workspace-change authority invalidation & exact key revocation -> **done**.
- Truthful `enabled` / `disabled` / `revocation-pending` states -> **done**.
- Preserves unrelated MCP config & unsupported-host manual fallback -> **done**.
- All 7 required refusal paths + VSIX & output secret scans -> **done**.
- Installed VS Code & `FORGE DEVELOPMENT` Antigravity UI interaction -> **partial** (explicitly gated on Ken's `0.0.94` Machine-State Ask + Write Gate).

## CLOSE

- **Status:** `PARTIAL` (`VERIFIED` across Dev controller, live sidecar + bundled `x4forge-mcp.cjs` stdio, secret scans, and packaged VSIX; installed VS Code & Antigravity host interaction pending `0.0.94` operator gate).
- **Remaining risks/deferred work:** Installed VS Code and `FORGE DEVELOPMENT` Antigravity interactive verification during `0.0.94` qualification.
- **Suggested commit title:** `feat(extension): add opt-in native MCP registration lifecycle and secret vault (#31)`

## AAR

- **Triggers:** Triggered (1-line schema version mismatch `forge.capabilities.v1` vs `forge.capability.v1` caught on first live `test:extension-mcp-lifecycle` run against real `server.ts`; CLI flag lookup on `action-receipt-coverage-audit.ts`).
- **Points to sustain:** Testing `createMcpRegistrationLifecycle` directly against a real spawned `server.ts` AND the real `vscode-extension/mcp/x4forge-mcp.cjs` stdio child immediately caught the singular `"forge.capability.v1"` `schemaVersion` string that a mock-only unit test would have missed. Checking `backendRecovery.selftest.ts` before editing `extension.ts` also preserved all `39/39` sandboxed controller recovery tests on the first pass.
- **Points to improve - work/approach:** Check `x4forge-mcp.cjs:validateLiveContract` (`line 4765`) before writing client-side schema version guards, and remember `action-receipt-coverage-audit.ts` uses `--write-candidate test-results/action-receipt-coverage.candidate.json` + updates `ACTION_RECEIPT_COVERAGE_REVIEWED_MANIFEST_SHA256` in `src/lib/actionReceiptPolicyBundle.ts`.
- **Points to improve - tools:** Documented the exact 3-step `action-receipt-coverage` promotion command in `SESSION-HANDOFF.md` alongside the capability-contract promotion notes.
- **Highest-risk evidenced weakness:** Failing `context.secrets.store` after `POST /api/agent/keys` or failing `POST /api/agent/keys/revoke` while the sidecar is offline could otherwise leave an active bearer key unrevoked; mitigated by immediate server revocation on vault-write failure and retaining `keyId` in `revocation-pending` (blocking new key creation and stopping MCP advertisement) until server revocation is confirmed.
- **Project lessons banked:** Updated `SESSION-HANDOFF.md`, `BACKLOG.md`, and `docs/plans/2026-07-29-kimi-recommendations-ledger.md`.
