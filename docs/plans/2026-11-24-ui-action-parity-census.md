# Project-Wide UI-Action Parity Census & Regression Gate (#19 P2)

**Status: PARTIAL — VERIFIED across source, read-only CLI (`npm run capabilities -- --census`), `GET /api/agent/schema`, capability-contract audit (`51` rows, `0` gaps), `134/134` oracles, and `673/673` HTTP routes; installed `0.0.94` IDE/E2E & `#19` P4 gap closures remain open.**
**Lane:** FULL.
**Owner:** [#19](https://github.com/KennyG1990/X4_Forge/issues/19) (`P2` and regression-gate portion of `P4` in `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md`).

## 1. Plan & Acceptance Contract

- **Bounded unit:** Add one authoritative, browser-safe semantic UI-action parity census (`FORGE_UI_ACTION_PARITY_CENSUS`, `forge.ui-action-parity.v1`) directly inside `src/lib/forgeCapabilities.ts`, expose read-only discovery via `npm run capabilities -- --census [--json] [filter]` (`scripts/x4capabilities.ts`) and `GET /api/agent/schema` (`ui_action_parity_census`), and enforce fail-closed completeness and truthfulness in `scripts/capability-contract-audit.ts` (`npm run test:capabilities`, `npm run precommit:check`, and GitHub CI).
- **Assumptions:**
  - `FORGE_CAPABILITIES` (`35` descriptors, Contract SHA-256 `fa0b591c4d194cbc1985566ddbce22a6dfe4ac44d794cfb967ccc08cbd8477af`) and `/api/agent/capabilities/effective` remain byte-identical so no released capability versions or MCP live-authority envelopes change.
  - `src/lib/actionCensus.ts` (`computeActionCensus`) is the B21 Mission Director XML action-tag frequency counter (`set_value`, `create_ship`), distinct from `#19` P2's Forge UI/API/MCP product-action parity census.
- **Authoritative references:**
  - `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md` (`§ Selected design`, `§ Full parity census and later slices`, `§ Acceptance and validation contract #5`, `P2 / #19`).
  - `src/lib/forgeCapabilities.ts`, `src/lib/studioLayout.ts`, `vscode-extension/package.json`, `config/forge-route-dispositions.json`, `scripts/capability-contract-audit.ts`, `scripts/x4capabilities.ts`.
- **In scope:**
  1. Authoritative census types, deterministic hash builder (`buildForgeUiActionParityCensus`), pure validator (`validateForgeUiActionParityCensus`), and sorted semantic action inventory (`FORGE_UI_ACTION_PARITY_CENSUS`) in `src/lib/forgeCapabilities.ts` across all 15 product domains named in `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md:60`.
  2. Exhaustive bi-directional regression gates in `scripts/capability-contract-audit.ts`:
     - Every `vscode-extension/package.json` `contributes.commands` ID (`12/12`), `contributes.configuration.properties` key (`10/10`), and `src/lib/studioLayout.ts` `GLOBAL_ACTION_IDS` (`12/12`), `WORKSPACE_NAV_ITEMS` (`10/10`), and `SIDEBAR_NAV_ITEMS` (`11/11`) must be bound by `>= 1` census row; adding any unclassified UI entrypoint fails the audit.
     - Every `FORGE_CAPABILITIES` descriptor (`35/35`) must be referenced by `>= 1` census row.
     - Every `uiAnchors` token (`file::literalToken`), `apiRoutes` entry (`METHOD /api/...`), and `mcpTools` entry is verified against repository files, AST-discovered server routes + `config/forge-route-dispositions.json` dispositions, and live `vscode-extension/mcp/x4forge-mcp.cjs` `TOOLS`.
     - Truthfulness invariants:
       - `available`: requires `>= 1` `capabilityIdentities` with `access.agentScopes.length > 0`, `>= 1` `connected` `mcpTools`, non-session-grant authority (`configuration.*` must use `approval-required`), and no `missingBehavior`.
       - `approval-required`: requires `approvalWorkflow` whose `requestCapabilityIdentity`, `statusCapabilityIdentity`, `applyCapabilityIdentities`, and `receiptCapabilityIdentity` all exist in `FORGE_CAPABILITIES`, allow agent scopes, and project `connected` MCP tools, plus verified `ownerDecisionRoutes`.
       - `partial`: requires genuine agent-reachable machine coverage (an agent-scoped capability, a non-`session-only` / non-`ui-internal` API route in `config/forge-route-dispositions.json`, or an extension-native language provider) AND non-empty `ownerIssue` (`#<n>`) + `missingBehavior`. Studio-only (`session-only`) routes cannot be claimed as `partial` agent parity.
       - `missing`: requires `capabilityIdentities.length === 0` and `mcpTools.length === 0`, zero false claims of agent parity, AND non-empty `ownerIssue` (`#<n>`) + `missingBehavior`.
  3. Read-only discovery in `scripts/x4capabilities.ts` (`--census`) and `server.ts` (`GET /api/agent/schema` `ui_action_parity_census`), plus unit/audit/route tests in `src/lib/forgeCapabilities.selftest.ts`, `scripts/capability-contract-audit.ts`, and `scripts/route-integration.mjs`.
- **Out of scope:**
  - Implementing new runtime capabilities for rows currently classified `partial` or `missing` (`#19` P4 — subsequent bounded units).
  - Modifying live Forge, `FORGE DEVELOPMENT` IDE (`0.0.89`), `AiLive`, X4 game installation, or saves.
- **Risks & authorization boundaries:**
  - Breaking `x4forge-mcp.cjs` live discovery -> prevented by keeping `capability_contract` and `/api/agent/capabilities/effective` completely unchanged and only adding `ui_action_parity_census` to `GET /api/agent/schema` (verified via `npm run test:mcp-capabilities` + `npm run test:native-deploy-mcp`).
  - `server.ts` `sourceFingerprint` shift -> verify with `node scripts/durable-writer-audit.mjs --print-current` (`server.ts:4682` is far from raw FS writers, so `sourceFingerprint` should stay unchanged).
- **Rollback / checkpoint:** Clean pushed `origin/main` checkpoint `de3399eed4246dcd40280c7f6832e928adb4783a`.
- **Acceptance criteria & required validation:**
  1. `validateForgeUiActionParityCensus()` and `npm run test:capabilities` (`FORGE_CAPABILITY_BASE_REF=origin/main`) pass with `0` errors across all `12` extension commands, `10` extension settings, `12` global Studio actions, `10` workspace views, `11` sidebar tools, and `35` canonical capabilities, plus synthetic negative probes proving unclassified UI actions, Studio-only false `available`/`partial` claims, incomplete `approval-required` claims, missing owners, and broken anchors fail closed.
  2. `npm run capabilities -- --census` and `npm run capabilities -- --census --json` return deterministic output and hash; `GET /api/agent/schema` exposes matching `ui_action_parity_census`.
  3. All gates pass: `forgeCapabilities.selftest.ts`, `npm run test:capabilities`, `npm run test:mcp-capabilities`, `npm run test:native-deploy-mcp`, `npm run test:writers`, `npm run test:action-receipt-coverage`, `npm run lint -- --max-warnings 600`, `npm run typecheck`, `npm run build`, `npm run test:oracles`, `npm run test:routes`, and `npm run precommit:check`.
  - **Unavailable validation:** Installed `0.0.94` IDE host / full Playwright E2E remain gated on Ken's `0.0.94` release window (`PARTIAL` overall; `VERIFIED` in source, CLI, capability audit, isolated HTTP, and CI).

## 2. Baseline

- **Revision:** `de3399eed4246dcd40280c7f6832e928adb4783a` on `main` (`HEAD == origin/main`), clean working tree.
- **Current inventory counts:**
  - `FORGE_CAPABILITIES`: `35` capabilities (`33` MCP aliases, `331` disposed literal routes, `105` mutating receipt-covered routes).
  - `vscode-extension/package.json`: `12` contributed commands, `10` configuration properties.
  - `src/lib/studioLayout.ts`: `12` `GLOBAL_ACTION_IDS`, `10` `WORKSPACE_NAV_ITEMS`, `11` `SIDEBAR_NAV_ITEMS`.

## 3. Reconciliation

- **Resources & callers searched:**
  - `src/lib/actionCensus.ts` (`computeActionCensus` — MD XML tag frequency census, unrelated to `#19` P2).
  - `src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts` (single authoritative browser-safe capability catalog).
  - `src/lib/studioLayout.ts` (`GLOBAL_ACTION_IDS`, `WORKSPACE_NAV_ITEMS`, `SIDEBAR_NAV_ITEMS` — imported by `StudioActionsMenu.tsx`, `WorkspaceNavigationBar.tsx`, `Sidebar.tsx`, `App.tsx`).
  - `vscode-extension/package.json` & `vscode-extension/src/extension.ts` (contributed commands, configuration settings, language providers).
  - `scripts/capability-contract-audit.ts` (`projectionAnchorErrors`, `routeFacts`, `manifest.routes`, `mcpInventory`), `scripts/x4capabilities.ts`, `server.ts` (`GET /api/agent/schema`), `vscode-extension/mcp/x4forge-mcp.cjs` (`discoverContract`).
- **Capability-map delta:** `no capability-map delta` to `FORGE_CAPABILITIES` (`35` capabilities unchanged); adds `FORGE_UI_ACTION_PARITY_CENSUS` (`forge.ui-action-parity.v1`, `51` rows, SHA-256 `b4c414484b94dccded355944e191f14aad990658e5eff1fc7e77fb89042fc014`) and fail-closed UI-action parity audit gates.

## 4. Implementation Summary

- **`src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts` (`69/69 PASS`):**
  - Added `FORGE_UI_ACTION_PARITY_SCHEMA_VERSION` (`forge.ui-action-parity.v1`), `FORGE_UI_ACTION_PARITY_DOMAINS` (`15` domains), `FORGE_UI_ACTION_PARITY_STATUSES` (`available`, `approval-required`, `partial`, `missing`), `FORGE_UI_ACTION_PARITY_CENSUS` (`51` sorted semantic product-action rows: `available = 11`, `approvalRequired = 2`, `partial = 28`, `missing = 10`, `openGaps = 38`), `summarizeForgeUiActionParityCensus`, `buildForgeUiActionParityCensus`, and `validateForgeUiActionParityCensus`.
  - Kept `FORGE_CAPABILITIES` (`35` descriptors) and `contractHash` (`fa0b591c4d194cbc1985566ddbce22a6dfe4ac44d794cfb967ccc08cbd8477af`) byte-identical.
  - Enforced strict alignment between `ForgeUiActionParityStatus` and `ForgeCapabilityDescriptorV1`: `available` requires `surfaces.mcp` `status === 'connected'` (preventing truncated/summarized `partial` MCP projections or Studio-only routes from masquerading as full parity), and `approval-required` requires complete machine `request`/`status`/`apply`/`receipt` MCP capabilities.
- **`scripts/capability-contract-audit.ts`:**
  - Bound `FORGE_UI_ACTION_PARITY_CENSUS` directly to `vscode-extension/package.json` (`12` commands, `10` configuration settings), `src/lib/studioLayout.ts` (`12` `GLOBAL_ACTION_IDS`, `10` `WORKSPACE_NAV_ITEMS`, `11` `SIDEBAR_NAV_ITEMS`), `manifest.routes` dispositions (`331` literal routes), live `mcpInventory()` (`33` MCP tools), and physical repository `file::token` anchors.
  - Added synthetic negative probes verifying fail-closed rejection on unclassified extension commands, unclassified Studio global actions, false `partial` claims over `session-only` routes, and missing `uiAnchor` tokens.
- **`scripts/x4capabilities.ts`, `server.ts`, & `scripts/route-integration.mjs`:**
  - Added `--census [--json] [domain|status|action.id]` to `npm run capabilities`.
  - Exposed `ui_action_parity_census` additively on `GET /api/agent/schema` and verified it in `scripts/route-integration.mjs` (`ui_action_parity_census_discoverable`).

## 5. Validation Evidence

- `tsx src/lib/forgeCapabilities.selftest.ts`: `69/69 PASS`.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`: `PASS` (`35` capabilities, `331` literal routes, `33` MCP aliases, `51` UI-action parity rows, Census SHA-256 `b4c414484b94dccded355944e191f14aad990658e5eff1fc7e77fb89042fc014`).
- `npm run capabilities -- --census available`: `PASS` (`11` `available` rows rendered cleanly).
- `npm run typecheck` & `npm run lint -- --max-warnings 600`: `PASS` (`0` errors, `<= 584` warnings).
- `npm run test:writers`: `30/30 + PASS + 8/8` (`sourceFingerprint` `3dba91cb24d8a0ac4c73181239062f177b5a6f2c2b364f466d9481debf1ee63e` unchanged).
- `npm run test:mcp-capabilities` & `npm run test:native-deploy-mcp` (`6/6`): `PASS`.
- `npm run test:oracles`: `134/134 green`.
- `npm run test:routes` (`X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset): `673/673 PASS` (including `ui_action_parity_census_discoverable`).
- `npm run precommit:check`: `[precommit] OK`.

## 6. Review & Close

- **Status:** `PARTIAL` overall (`VERIFIED` across source, CLI, capability-contract audit, and isolated HTTP; `#19` P4 census gap closures and `0.0.94` installed IDE/E2E qualification remain open).
- **Suggested commit title:** `feat(capabilities): add project-wide UI-action parity census and audit gate (#19)`

## 7. After-Action Review (Triggered)

- **Triggers:**
  1. Initial `tsc --noEmit` caught missing `censusCount` / `censusHash` fields on `function audit()`'s explicit return-type annotation in `scripts/capability-contract-audit.ts:6556` (`task-6014` -> fixed immediately).
  2. Initial CLI formatting on `npm run capabilities -- --census available` printed `gap (#19): none` when `ownerIssue` was present without `missingBehavior`; refined to print `owner: #19` for non-gap rows.
- **Points to sustain:**
  - Checking `src/lib/actionCensus.ts` during reconciliation prevented conflating B21's Mission Director XML tag frequency counter with `#19` P2's product UI-action parity census.
  - Inspecting `FORGE_CAPABILITIES` `surfaces.mcp` `status` (`connected` vs `partial`) before authoring census rows prevented falsely classifying truncated/summarized MCP projections (`compile_workspace`, `get_workspace`, `validate_mod`) as full `available` parity.
- **Points to improve — work/approach:**
  - Check explicit return-type annotations on large functions (`function audit()` in `capability-contract-audit.ts`) before adding return object fields.
- **Points to improve — tools:**
  - `npm run capabilities -- --census <status|domain>` now gives agents and reviewers a single deterministic CLI query over all `38` open parity gaps (`28` `partial`, `10` `missing`).
- **Highest-risk observed weakness:**
  - `No evidenced risk delta` (existing governance manifests and MCP discovery remained untouched and green).
