# Curated MCP & Canonical Capability Projections for History, Validation Verdict, Compile Result, Proof, and Brief (#19 P4 Slice 1)

**Status: VERIFIED (source, capability/MCP contracts, isolated runtime & route integration — parent #19 remains PARTIAL pending subsequent P4 slices & 0.0.94 installed IDE/E2E qualification).**
**Lane:** FULL.
**Owner:** [#19](https://github.com/KennyG1990/X4_Forge/issues/19) (`P4` gap-closure slice in `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md`; completes MCP projection of [#138](https://github.com/KennyG1990/X4_Forge/issues/138) canonical validation receipt).

## 1. Plan & Acceptance Contract

- **Bounded unit:** Close five read-only MCP parity gaps identified by the `#19` P2 UI-action parity census (`FORGE_UI_ACTION_PARITY_CENSUS`) without adding any mutating route or altering preset HTTP compatibility:
  1. Upgrade `history.list@1 -> @2` (`GET /api/agent/history`) with `connected` MCP tool `list_action_history`.
  2. Upgrade `workspace.compile.result@1 -> @2` with literal query-bound primary route `GET /api/agent/compile/result` (`?id=<id>`) and `connected` MCP tool `get_compile_result`, retaining `GET /api/agent/compile/result/:id` as a `legacy-agent-api` compatibility route (`write`, `deploy`).
  3. Register `validation.last.read@1` (`GET /api/agent/validation/last`) with `connected` MCP tool `get_last_validation_verdict` (`#138` hash-bound canonical `deploy-verify` validation receipt + instant `current` vs `superseded` freshness).
  4. Register `project.proof.read@1` (`GET /api/agent/proof`) with `connected` MCP tool `get_mod_proof` and `project.brief.read@1` (`GET /api/agent/project/brief`) with `connected` MCP tool `get_agent_brief` (updating `server.ts:11480` to derive `mcpTools` dynamically from `FORGE_CAPABILITIES` rather than a stale 8-tool list), flipping `diagnostics.proof_and_brief.generate` in `FORGE_UI_ACTION_PARITY_CENSUS` from `partial` to **`available`** (`available: 11 -> 12`, `partial: 28 -> 27`, `openGaps: 38 -> 37`).
- **Assumptions:**
  - All five capabilities are strictly read-only (`GET` routes), so `config/action-receipt-coverage.json` (`105` mutating routes) and `config/durable-writers.json` (`50` raw FS writers) require zero new writer/receipt entries (verify `sourceFingerprint` on `server.ts`).
  - Because `GET /api/agent/validation/last`, `GET /api/agent/proof`, and `GET /api/agent/project/brief` are already `read`/`write`/`deploy` `legacy-agent-api` routes, promoting them to `canonical-capability` without `requiresExplicitCapabilityGrant` preserves 100% existing HTTP preset-key callers (`tools/deploy.py`, `extension.ts`) while extending `READ_TOOLS` / `WRITE_TOOLS` / `EXPECTED_TOOLS` in `vscode-extension/mcp/x4forge-mcp.cjs`.
- **Authoritative references:**
  - `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md` (`P4 / #19 children`), `docs/plans/2026-11-24-ui-action-parity-census.md`.
  - `src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `scripts/mcp-capability-selftest.ts`, `scripts/route-integration.mjs`, `server.ts`.
- **In scope:**
  1. `server.ts` & `src/server/projectApiContract.ts`: add `GET /api/agent/compile/result` (`?id=...`) sharing `respondCompileValidationResult` with `GET /api/agent/compile/result/:id`, validate strict query parameters on `GET /api/agent/history`, `GET /api/agent/validation/last`, `GET /api/agent/proof`, `GET /api/agent/project/brief`, and `GET /api/agent/compile/result`, and populate `input.mcpTools` in `GET /api/agent/project/brief` dynamically from `FORGE_CAPABILITIES`.
  2. `src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`: bump `history.list@2` and `workspace.compile.result@2`, add sorted `project.brief.read@1`, `project.proof.read@1`, and `validation.last.read@1` (`FORGE_CAPABILITIES` `35 -> 38`, non-native `32 -> 35`), and update `FORGE_UI_ACTION_PARITY_CENSUS` (`diagnostics.proof_and_brief.generate` -> `available`, plus updated `capabilityIdentities` and `mcpTools` on `compile.workspace.build`, `diagnostics.project.validate`, and `files.history_and_snapshots.manage`).
  3. `vscode-extension/mcp/x4forge-mcp.cjs`: add `list_action_history`, `get_compile_result`, `get_last_validation_verdict`, `get_mod_proof`, and `get_agent_brief` (`33 -> 38` MCP tools), preserving legacy static-fallback `LEGACY_TOOLS` untouched (`10` tools) so old-server fallback remains exact.
  4. `scripts/capability-contract-audit.ts` (`MCP_MODULE_AUDIT_VERSION` `25 -> 26`, `38` MCP mappings), reviewed candidate generation and promotion of `config/forge-route-dispositions.json` (`332` literal routes, retaining `write,deploy` on `GET /api/agent/compile/result`), `scripts/mcp-capability-selftest.ts`, and `scripts/route-integration.mjs`.
- **Out of scope:**
  - Mutating file/snapshot/bulk-transform MCP tools (separate subsequent P4 slice).
  - Modifying live Forge, `FORGE DEVELOPMENT` IDE (`0.0.89`), `AiLive`, X4 game installation, or saves.
- **Rollback / checkpoint:** Clean pushed `origin/main` checkpoint `a2430d944b526e501bd8fa443a55897daebffb08`.
- **Acceptance criteria & required validation:**
  1. `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` passes (`38` capabilities, `332` disposed routes, `38` MCP aliases, `51` UI-action parity rows with `available = 12`, `openGaps = 37`), verifying version-immutability on `history.list@1 -> @2` and `workspace.compile.result@1 -> @2`.
  2. `npm run test:mcp-capabilities` passes with real stdio MCP request/response checks for `list_action_history`, `get_compile_result`, `get_last_validation_verdict`, `get_mod_proof`, and `get_agent_brief`, while legacy static fallback remains unchanged.
  3. `npm run test:routes` exercises all `38` canonical capability output schemas (`all_canonical_capability_outputs_exercised`), legacy `GET /api/agent/compile/result/:id` compatibility, and dynamic `mcpTools` in `GET /api/agent/project/brief`.
  4. All gates pass: `forgeCapabilities.selftest.ts`, `test:writers`, `test:action-receipt-coverage`, `lint -- --max-warnings 600`, `typecheck`, `build`, `test:oracles`, `test:routes`, and `precommit:check`.

## 2. Baseline

- **Revision:** `a2430d944b526e501bd8fa443a55897daebffb08` on `main` (`HEAD == origin/main`), clean working tree.
- **Governance state:** `35` capabilities, `331` literal routes, `33` MCP aliases (`MCP_MODULE_AUDIT_VERSION = 25`), `51` UI-action parity rows (`available = 11`, `openGaps = 38`).

## 3. Reconciliation

- **Resources & couplings checked:**
  - `scripts/capability-contract-audit.ts:8975` (`mcpCallContractErrors`): every route in `capability.apiBindings` must be called by its mapped MCP tool; therefore `workspace.compile.result@2` binds `GET /api/agent/compile/result` (`role: 'primary'`, `inputLocation: 'query'`) and leaves `GET /api/agent/compile/result/:id` as `legacy-agent-api` (`write,deploy`).
  - `src/lib/agentAuthority.ts:379`: `GET /api/agent/compile/result` (`4` segments) and `GET /api/agent/compile/result/:id` (`5` segments) do not overlap templates.
  - `vscode-extension/mcp/x4forge-mcp.cjs`: `LEGACY_TOOLS` (used only when an old pre-v1 server lacks `capability_contract`) must exclude newly added tools (`list_action_history`, `get_compile_result`, `get_last_validation_verdict`, `get_mod_proof`, `get_agent_brief`) so pre-contract fallback calls only legacy routes.
- **Capability-map delta:** Upgrades `history.list@1 -> @2` and `workspace.compile.result@1 -> @2`; adds `project.brief.read@1`, `project.proof.read@1`, and `validation.last.read@1` (`35 -> 38` capabilities, `33 -> 38` MCP tools, `331 -> 332` literal routes; UI-action parity `available` `11 -> 12`, `partial` `28 -> 27`, `openGaps` `38 -> 37`).
- **Reconciliation refinements before mutation:**
  - `server.ts:6521` already honors `?checkSource=0|1` on `GET /api/agent/validation/last`, so `validation.last.read@1` and `get_last_validation_verdict` preserve `checkSource: '0' | '1'` alongside `modId` and `sourceHash`.
  - `config/forge-route-dispositions.json` classifies `GET /api/agent/project/brief` as `workspaceMode: "optional"`, so `project.brief.read@1` declares `context: { workspace: 'optional', profile: 'none' }`.

## 4. Implementation

- **`server.ts`:**
  - Added `validateCapabilityQueryKeys` for strict query-key and scalar-string enforcement (`400 CAPABILITY_INPUT_INVALID`) on `GET /api/agent/validation/last`, `GET /api/agent/history` (`limit` integer `1..1000`), `GET /api/agent/project/brief`, `GET /api/agent/proof` (adding `{ ok: true, workspaceId }` alongside `{ markdown, workspace }`), and new `GET /api/agent/compile/result` (`?id=...`, sharing `respondCompileValidationResult` with compatibility route `GET /api/agent/compile/result/:id`).
  - Updated `GET /api/agent/project/brief` to derive `input.mcpTools` dynamically from `FORGE_CAPABILITIES` (`!requiresExplicitCapabilityGrant(c.id)` connected/partial projections) rather than the stale 8-tool hardcoded list.
- **`src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`:**
  - Bumped `history.list` `version: 1 -> 2` (`list_action_history`) and `workspace.compile.result` `version: 1 -> 2` (`GET /api/agent/compile/result` + `get_compile_result`).
  - Added sorted `project.brief.read@1` (`get_agent_brief`), `project.proof.read@1` (`get_mod_proof`), and `validation.last.read@1` (`get_last_validation_verdict`) (`FORGE_CAPABILITIES` `35 -> 38`, Contract SHA-256 `6e1e960074ce7c7f6b6086981aa34fec91a6a620785ba5741e69af06f7f15a34`).
  - Updated `FORGE_UI_ACTION_PARITY_CENSUS` (`SHA-256: 6aac069cf386f1fc9951aa9bba56a9ea2afd23485b544c1e57231e5f1fac0274`): promoted `diagnostics.proof_and_brief.generate` to `status: 'available'` (`available: 11 -> 12`, `partial: 28 -> 27`, `openGaps: 38 -> 37`) and updated `compile.workspace.build`, `diagnostics.project.validate`, and `files.history_and_snapshots.manage`.
- **`vscode-extension/mcp/x4forge-mcp.cjs` (`MCP_MODULE_AUDIT_VERSION = 26`):**
  - Added `DIAGNOSTIC_READ_LIVE_TOOLS` (`list_action_history`, `get_compile_result`, `get_last_validation_verdict`, `get_mod_proof`, `get_agent_brief`, `33 -> 38` MCP tools), excluding them from `STATIC_TOOL_NAMES` (legacy pre-contract fallback) and `stickyLiveToolNames` outage fallback so current discovery is required.
- **`scripts/capability-contract-audit.ts`, `config/forge-route-dispositions.json`, `scripts/mcp-capability-selftest.ts`, & `scripts/route-integration.mjs`:**
  - Bumped `MCP_MODULE_AUDIT_VERSION` (`25 -> 26`) and expected MCP mappings (`33 -> 38`), promoted reviewed `config/forge-route-dispositions.json` (`332` literal routes, setting `agentScopes: ["write", "deploy"], resourceClass: "workspace", workspaceMode: "required"` on `GET /api/agent/compile/result`), and added stdio MCP + HTTP route/negative assertions across `mcp-capability-selftest.ts` and `route-integration.mjs`.

## 5. Validation Evidence

- `npm run lint -- --max-warnings 600` -> `0` errors, `584` warnings (`<= 600` CI threshold).
- `npm run typecheck` -> `0` errors.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`38` capabilities, `332` disposed literal routes, `38` MCP aliases, `51` UI-action parity rows).
- `npm run -s capabilities -- --census --json` -> `{"totalActions":51,"available":12,"approvalRequired":2,"partial":27,"missing":10,"openGaps":37}`, SHA-256 `6aac069cf386f1fc9951aa9bba56a9ea2afd23485b544c1e57231e5f1fac0274`.
- `npm run test:mcp-capabilities` -> `PASS` (`read=17, write=22, deploy=23`; positive stdio MCP calls, `-32602` pre-HTTP schema rejections, and `outage` sticky-live withdrawal checks for all 5 new tools).
- `npm run test:native-deploy-mcp` -> `6/6 passed`.
- `npm run test:writers` -> `30/30` + `PASS` + `8/8` (`sourceFingerprint` unchanged at `3dba91cb24d8a0ac4c73181239062f177b5a6f2c2b364f466d9481debf1ee63e`).
- `npm run test:action-receipt-coverage` -> `PASS` (`105` routes, `69` surfaces).
- `npm run test:oracles` -> `134/134 green`.
- `npm run test:routes` (`X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset) -> `678/678 PASS` (including `compile_result_query_and_legacy_path_agree_and_reject_unknown_query`, `project_brief_and_proof_capabilities_expose_live_mcp_inventory_and_reject_unknown_query`, and `all_canonical_capability_outputs_exercised` across all `38` capabilities).
- `npm run precommit:check` -> `[precommit] OK`.

## 6. Review & Close

- **Requirement walkthrough:**
  - `history.list@2` + `list_action_history` -> **Done & evidenced.**
  - `workspace.compile.result@2` (`GET /api/agent/compile/result?id=...`) + `get_compile_result` + legacy `:id` compatibility -> **Done & evidenced.**
  - `validation.last.read@1` + `get_last_validation_verdict` (`#138`) -> **Done & evidenced.**
  - `project.proof.read@1` + `get_mod_proof` & `project.brief.read@1` + `get_agent_brief` (dynamic `mcpTools` + `diagnostics.proof_and_brief.generate` -> `available`) -> **Done & evidenced.**
- **Final status:** `VERIFIED` (for this bounded slice; parent `#19` stays `PARTIAL` for subsequent P4 slices and `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): project history, compile result, validation verdict, proof, and brief (#19, #138)`

## 7. AAR (Triggered)

- **Triggers:**
  1. Reconciliation corrected two plan details before implementation (`?checkSource=0|1` on `GET /api/agent/validation/last` and `workspaceMode: "optional"` on `GET /api/agent/project/brief`).
  2. First `npm run test:mcp-capabilities` run (`task-6275`) failed at `scripts/mcp-capability-selftest.ts:1998` because `EXPECTED_TOOLS.filter(...)` in the `mode = 'outage'` sticky-live assertion needed `...DIAGNOSTIC_READ_TOOLS` alongside `x4forge-mcp.cjs:2438`; fixed with explicit stale-call refusal checks and passed on attempt 2 (`task-6298`).
- **Points to sustain:** Checking `scripts/capability-contract-audit.ts:4328` (`callPath` requiring `'?'` in template head) and `config/forge-route-dispositions.json` (`workspaceMode`) before editing prevented capability-audit failures on the first promotion run.
- **Points to improve — work/approach:** When adding a new live-only MCP tool set (`DIAGNOSTIC_READ_LIVE_TOOLS`) in `x4forge-mcp.cjs`, grep every `EXPECTED_TOOLS.filter` site in `scripts/mcp-capability-selftest.ts` before the first test run, not just `LEGACY_TOOLS` at the top of the file.
- **Points to improve — tools:** `buildBaseline` in `scripts/capability-contract-audit.ts` rightly defaults newly added routes (`GET /api/agent/compile/result`) closed (`agentScopes: []`), printing `review authority for: GET /api/agent/compile/result`; keeping that human/agent review step explicit before `--promote-candidate` worked cleanly.
- **Highest-risk evidenced weakness:** `GET /api/agent/project/brief` previously maintained a disconnected hardcoded 8-tool MCP array (`server.ts:11480`) that had drifted 15 tools behind `FORGE_CAPABILITIES`; deriving `mcpTools` directly from `FORGE_CAPABILITIES` (`!requiresExplicitCapabilityGrant(c.id)`) eliminates that silent documentation drift permanently.
