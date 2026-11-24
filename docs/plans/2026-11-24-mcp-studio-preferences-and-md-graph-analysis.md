# Unit 38 Plan — `#19` P4 Slice 15: Studio Preferences Read & MD Canvas Node Diagnostics, Deterministic Simulator, Graph Critic, and Flow/Diagnostic Explainer over MCP + 3-Unit Release Readiness Review

- **Status:** `VERIFIED`
- **Date:** 2026-11-24
- **Lane:** `FULL`
- **Owning Issues:** `#19` (UI-Action Parity Census P4 Slice 15: `preferences.studio_layout.configure` `missing -> partial`, `editors.md_canvas.author` deterministic MD graph analysis parity) + Mandatory 3-Unit Release Readiness Review (Units 36–38)
- **Baseline HEAD:** `7e7037ea5f0655c0a8cdb71838ee03c4e1683a24` (`134/134` oracles, `785/785` routes, `103` capabilities, `104` MCP tools, `50` raw filesystem writer sources)

## 1. Scope, Non-Goals & Acceptance Contract

- **Bounded unit:**
  1. Project `studio.preferences.read@1` (`get_studio_preferences` -> `GET /api/agent/studio/preferences`, `EMPTY_INPUT` / `inputLocation: 'none'`), returning normalized `layout` (`StudioLayoutPreferences`), `visibleWorkspaceViews`, `visibleSidebarTabs`, `releasePreferences` (`ReleasePreferences`), and `persisted: { layout: boolean, releasePreferences: boolean }` with zero host paths or secrets while keeping Studio `/api/studio/layout` and `/api/studio/release-preferences` strictly `session-only` (`src/lib/agentKeys.ts:579-580`). Flip `preferences.studio_layout.configure` in `FORGE_UI_ACTION_PARITY_CENSUS` from **`missing` -> `partial`** (`missing: 7 -> 6`, `partial: 19 -> 20`).
  2. Project `workspace.graph.critic@1` (`critique_md_graph` -> `POST /api/agent/workspace/critic`, `LEDGER_QUIET_ROUTES`), running deterministic false-positive-free MD cue lints (`critiqueWorkspace`) against the addressed workspace (`mode: 'workspace'`, default) or bounded inline `nodes`/`links` (`mode: 'inline'`, `nodes <= 2000`, `links <= 4000`), capping returned `findings` at `200`.
  3. Project `workspace.graph.explain@1` (`explain_md_graph` -> `POST /api/agent/workspace/explain`, `LEDGER_QUIET_ROUTES`), running deterministic non-AI cue flow explanation (`explainWorkspace`, capping `flowSteps` at `300` and `entityRegistry` at `200`) for `mode: 'workspace'` (default) or `mode: 'inline'`, OR deterministic remediation guidance (`explainDiagnostic`) for `mode: 'diagnostic'`.
  4. Project `workspace.graph.simulate@1` (`simulate_md_graph` -> `POST /api/agent/workspace/simulate`, `LEDGER_QUIET_ROUTES`), running deterministic tri-state Kleene cue/expression simulation (`simulateWorkspace`) with optional scalar `seed` variables (`<= 100` keys) against the addressed workspace (`mode: 'workspace'`, default) or bounded inline `nodes`/`links` (`mode: 'inline'`), capping `trace` at `300` and `findings`/`finalState` at `200`.
  5. Project `workspace.nodes.diagnose@1` (`diagnose_workspace_nodes` -> `POST /api/agent/workspace/node-diagnostics`, `LEDGER_QUIET_ROUTES`), running `md.xsd`-driven per-node `unknown_element` and `missing_required_attr` schema checks (`validateNodesAgainstSchema` + `summarizeByNode`) against the addressed workspace (`mode: 'workspace'`, default) or bounded inline `nodes` (`mode: 'inline'`, `<= 2000`), capping `diagnostics` at `200`.
  6. Conduct and record the **mandatory 3-Unit Release Readiness Review** covering Units 36 (`8379ef2`), 37 (`7e7037e`), and 38.
- **Out of scope:** Mutating Studio layout or release preferences from agent keys (`POST /api/studio/*` stays `session-only`), VS Code/Antigravity extension-host settings (`preferences.extension_host.configure`), Open VSX publishing, and restarting `FORGE DEVELOPMENT` IDE (`PID 34076`).
- **Risks & authorization boundaries:**
  - Zero new raw `fs.*` writer calls (`config/durable-writers.json` stays at `50` raw writers and identical `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c`).
  - Preserve `src/lib/agentKeys.ts:573-580` (`scopeAllows(s, 'GET', '/studio/layout') === false` and `scopeAllows(s, 'POST', '/studio/release-preferences') === false`).
  - Never include `'timestamp'` or `'generatedAt'` anywhere in `FORGE_CAPABILITIES`, and use `inputLocation: 'none'` for `EMPTY_INPUT` (`studio.preferences.read@1`).
- **Acceptance criteria & required validation:**
  1. All 5 new capabilities (`studio.preferences.read@1`, `workspace.graph.critic@1`, `workspace.graph.explain@1`, `workspace.graph.simulate@1`, `workspace.nodes.diagnose@1`) enforce closed input schemas (`400 CAPABILITY_INPUT_INVALID` on unknown/oversized inputs), stay quiet in Action Ledger, leak zero host paths, and pass `test:mcp-capabilities` (`read=63, write=68, deploy=69`), `test:workspace-files-mcp` (`18/18`), and `test:routes` (`791/791`).
  2. `preferences.studio_layout.configure` flips from `missing` to `partial` (`missing: 7 -> 6`, `partial: 19 -> 20`), and `editors.md_canvas.author` includes all 4 deterministic MD graph analysis capabilities/routes/MCP tools.
  3. Pass `lint -- --max-warnings 600`, `typecheck`, `test:writers`, `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` (`108` capabilities, `397` routes, `109` MCP aliases, `MCP_MODULE_AUDIT_VERSION = 41`), `test:action-receipt-coverage` + `:selftest` (`139` routes / `69` surfaces), `c06-contracts`, `c06-api`, `test:mcp-capabilities`, `test:native-deploy-mcp`, `test:workspace-files-mcp`, `npm run build`, `test:oracles` (`134/134`), `test:routes`, `precommit:check`, and GitHub Actions `Quality` CI.
- **Planned rollback:** Restore touched source/manifest files from `7e7037e` via `git show HEAD:<path>` + `fs.writeFileSync` and remove this plan file if needed before commit.

## 2. Reconciled Infrastructure Reused

- `readStudioLayoutState`, `normalizeStudioLayoutPreferences`, `visibleWorkspaceViews`, `visibleSidebarTabs` (`src/lib/studioLayout.ts` + `server.ts`), and `readReleasePreferencesState`, `normalizeReleasePreferences` (`src/lib/releasePreferences.ts` + `server.ts`).
- `validateNodesAgainstSchema`, `summarizeByNode`, `getNodeSchemaView` (`src/lib/nodeDiagnostics.ts` + `server.ts`).
- `simulateWorkspace` (`src/lib/mdSimulate.ts`), `critiqueWorkspace` (`src/lib/mdCritic.ts`), `explainWorkspace` (`src/lib/mdExplain.ts`), and `explainDiagnostic` (`src/lib/diagnosticExplain.ts`).

## 3. Close Record

- **Final Status:** `VERIFIED` (isolated Dev source, governance manifests, `134/134` runtime oracles, `791/791` HTTP route checks, and real stdio MCP; `#19` overall remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification).
- **What Changed:**
  - `server.ts`: added `durableKeyRoute` entries and protected (`public: false`) closed-input handlers `GET /api/agent/studio/preferences`, `POST /api/agent/workspace/critic`, `POST /api/agent/workspace/explain`, `POST /api/agent/workspace/simulate`, and `POST /api/agent/workspace/node-diagnostics`, plus hardened `getNodeSchemaView()` (`loaded: !!idx.loaded && idx.elements.size > 0`) so an empty `<xs:schema/>` placeholder never claims `schemaLoaded: true` (`0` new raw `fs.*` writer calls).
  - `src/lib/agentHistory.ts`: added `/api/agent/workspace/critic`, `/api/agent/workspace/explain`, `/api/agent/workspace/simulate`, and `/api/agent/workspace/node-diagnostics` to `LEDGER_QUIET_ROUTES`.
  - `src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`: registered `studio.preferences.read@1`, `workspace.graph.critic@1`, `workspace.graph.explain@1`, `workspace.graph.simulate@1`, and `workspace.nodes.diagnose@1` (`103 -> 108` capabilities, Contract SHA-256 `d55cd9d26443d27c2a54833153d637680cb99a9c97ff5af2d3b19e4eec17a88d`), flipped `preferences.studio_layout.configure` from `missing` to `partial` (`missing: 7 -> 6`, `partial: 19 -> 20`, `openGaps: 26`), and expanded `editors.md_canvas.author` (`UI-Action Parity Census` SHA-256 `bfa6f07f08eb66f1f03db990f4f49c3625f999b28b59789d1d540f850b841a1f`).
  - `vscode-extension/mcp/x4forge-mcp.cjs` & `scripts/capability-contract-audit.ts`: projected `get_studio_preferences`, `critique_md_graph`, `explain_md_graph`, `simulate_md_graph`, and `diagnose_workspace_nodes` (`104 -> 109` MCP tools, `MCP_MODULE_AUDIT_VERSION = 41`).
  - `config/forge-route-dispositions.json` & `config/action-receipt-coverage.json` (`+ src/lib/actionReceiptPolicyBundle*.ts`): promoted `397` routes (SHA-256 `5618991909cb4dacdc595bf1f1d0ed2fc7ec4ec1c582f794c5b3fce70ae7d7b6`) and `139` receipt-coverage routes / `69` surfaces (SHA-256 `6eb8ef0ed2fae8ee6a9b2787a7592090770a188f04d3b7d525cadb9386f390fa`).
  - `scripts/mcp-capability-selftest.ts`, `scripts/workspace-files-mcp.selftest.ts`, & `scripts/route-integration.mjs`: updated `READ_TOOLS` (`read=63, write=68, deploy=69`), added real stdio MCP check `18` (`18/18 PASS`), and added `6` HTTP route integration checks (`791/791 PASS`).
- **What Was Deliberately Not Changed:** Studio `/api/studio/layout` and `/api/studio/release-preferences` remain strictly `session-only` (`src/lib/agentKeys.ts:579-580`); `config/durable-writers.json` remains untouched (`50` raw writers, `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c`).
- **Validation Evidence:**
  - `npm run lint -- --max-warnings 600` -> `0 errors, 580 warnings` (`PASS`)
  - `npm run typecheck` -> `0 errors` (`PASS`)
  - `npm run test:writers` -> `30/30 + PASS + 8/8` (`PASS`)
  - `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`108` capabilities, `397` routes, `109` MCP tools)
  - `npm run test:action-receipt-coverage` + `:selftest` -> `PASS` (`139` routes / `69` surfaces, `79/79 + 23/23`)
  - `tsx scripts/c06-contracts.selftest.ts` -> `196/196 PASS`
  - `tsx scripts/c06-api.selftest.ts` -> `42/42 PASS`
  - `npm run test:mcp-capabilities` -> `PASS` (`read=63, write=68, deploy=69`)
  - `npm run test:native-deploy-mcp` -> `6/6 PASS`
  - `npm run test:workspace-files-mcp` -> `18/18 PASS`
  - `npm run build` -> `0` (`PASS`)
  - `npm run test:oracles` -> `134/134 PASS`
  - `npm run test:routes` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH` unset) -> `791/791 PASS`
  - `npm run precommit:check` -> `[precommit] OK` (`PASS`)
- **Suggested Commit Title:** `feat(mcp): studio preferences read and deterministic md graph analysis (#19)`

## 4. Mandatory 3-Unit Release Readiness Review (Units 36–38: `8379ef2`, `7e7037e`, Unit 38)

- **Scope Reviewed (`38` verified Dev units ahead of `0.0.93` `e9c12e1`):**
  - **Unit 36 (`8379ef2`):** `#19` P4 Slice 13 + `#31` (`integration_contract` workspace domain authoring `workspace.domain.{read,write}@2`, `contracts.glue.preview@1`, `patch.audit.read@1`, `schema.domain.inspect@1` + `resolveActiveSchemaRegistry` fallback fix, `ai.usage.read@1`; GitHub Actions `Quality` `45488856278` `SUCCESS`).
  - **Unit 37 (`7e7037e`):** `#19` P4 Slice 14 (`reference.manifest.list@1`, `runtime.bridge.read@1`, `runtime.control.read@1`, `runtime.cue.telemetry@1`, `runtime.gamelog.read@1` with `FORGE-LUAV` Lua staleness & recursive path scrubbing; GitHub Actions `Quality` green).
  - **Unit 38 (this commit):** `#19` P4 Slice 15 (`studio.preferences.read@1` flipping `preferences.studio_layout.configure` `missing -> partial`, `workspace.graph.critic@1`, `workspace.graph.explain@1`, `workspace.graph.simulate@1`, `workspace.nodes.diagnose@1`; `108` capabilities, `109` MCP tools, `791/791` routes, `134/134` oracles).
- **Verdict:** **`NOT_READY` for `0.0.94` Open VSX publication (`x4forge/x4-forge-studio`) and `FORGE DEVELOPMENT` IDE (`0.0.89 -> 0.0.94`) restart/upgrade** pending:
  1. Execution and rendered E2E verification of Ken's newly requested **Comprehensive UI Simplification & Workbench Consolidation Spec** (Unit 39).
  2. Full compiled Playwright E2E gate + Ken's explicit Machine-State Ask + Write Gate (`vscode-extension/PUBLISHING.md`) before touching `FORGE DEVELOPMENT` (`PID 34076`) or Open VSX.
  - **Next 3-Unit Release Readiness Review due:** **Unit 41**.

## 5. Triggered AAR

1. **Points to sustain:** Reusing Forge's pure deterministic engines (`critiqueWorkspace`, `explainWorkspace`, `explainDiagnostic`, `simulateWorkspace`, `validateNodesAgainstSchema`, `readStudioLayoutState`, `readReleasePreferencesState`) behind closed-schema, Action-Ledger-quiet `/api/agent/*` endpoints added 5 high-value MCP tools (`108` capabilities, `109` MCP tools) with `0` new raw filesystem writer calls.
2. **Points to improve — work/approach:** When adding `read`-accessible capabilities (`agentScopes: ['read', 'write', 'deploy']`), update `READ_TOOLS` in `scripts/mcp-capability-selftest.ts` AND both `read_key_effective_capabilities_are_exact_and_hashed` / `write_key_effective_capabilities_are_exact_and_hashed` in `scripts/route-integration.mjs:1466,1470` in the initial edit batch rather than discovering them sequentially.
3. **Points to improve — tools:** `getNodeSchemaView()` in `server.ts` previously reported `loaded: true` even when an isolated test fixture seeded an empty `<xs:schema/>` placeholder (`elements.size === 0`), masking whether real XSD element rules were loaded; tightening `loaded: !!idx.loaded && idx.elements.size > 0` eliminated false-loaded reports for both Studio and MCP callers.
4. **Highest-risk observed weakness:** Running `precommit:check` (`test:e2e-request-transport`) simultaneously alongside 4 heavy parallel subagent processes triggered a transient Windows Node 24 `0xC0000409` (`3221226505`) libuv handle teardown exit; running `precommit:check` without competing background subagent load passed cleanly (`11/11` transport checks, `[precommit] OK`). Banked operational rule: run `precommit:check` when parallel subagents are idle.
