# Unit 36 Plan & Close — `#19` P4 Slice 13 + `#31`: Integration-Contract Workspace Authoring, Contract Lua/MD Glue Preview, Workspace XML Patch Audit, XSD Domain Inspection & AI Spend Status over MCP

- **Status:** `VERIFIED` (Dev source, contracts, isolated HTTP routes, and real stdio MCP; `#19` & `#31` remain `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification)
- **Date:** 2026-11-24
- **Lane:** `FULL`
- **Owning Issues:** `#19` (UI-Action Parity Census P4 Slice 13: `editors.contracts.author`, `diagnostics.patch_readiness.check`, `extension.ide_capabilities.inspect`, `ai.copilot.generate_and_chat`), `#31` (External API / Integration Contract Seam)
- **Baseline HEAD:** `93b03133d9339792daeee6524b9b273c632b2a99` (`134/134` oracles, `774/774` routes, `94` capabilities, `95` MCP tools, `50` raw filesystem writer sources)

## 1. Scope, Non-Goals & Acceptance Contract

- **Bounded unit:**
  1. Bump `workspace.domain.read@1 -> @2` (`get_workspace_domain`) and explicit-grant `workspace.domain.write@1 -> @2` (`update_workspace_domain`) to add the 7th Studio workspace domain **`integration_contract`** (`integrationContract: IntegrationContract | null` + `customLua: string`), enforcing closed `IntegrationContract` / `ContractEndpoint` / `ContractField` / `fileBridge` shapes and rejecting contracts with `validateContract` `severity === 'error'` findings (`400 CAPABILITY_INPUT_INVALID`).
  2. Project `contracts.glue.preview@1` (`preview_contract_glue` -> `POST /api/agent/external-api/glue-preview`, `LEDGER_QUIET_ROUTES`, `read`/`write`/`deploy` scopes), validating and generating X4-side HTTP/UI-event/file-bridge Lua (`generateHttpGlueLua`) and MD script (`generateContractMdScript`) from an inline `contract`, the addressed workspace's `integrationContract` (`mode: 'workspace'`), or the canonical Lever-2 sample (`mode: 'sample'`).
  3. Project `patch.audit.read@1` (`audit_workspace_patches` -> `GET /api/agent/patch/audit`, `read`/`write`/`deploy` scopes), running `runPatchDiagnostics` over either the addressed workspace's `xmlPatches` (`mode=workspace`, default, bounded at `200` diagnostics with zero host paths) or the deterministic 3-patch self-audit fixture (`mode=selftest`, matching `GET /api/agent/patch-audit`).
  4. Project `schema.domain.inspect@1` (`inspect_schema_domain` -> `GET /api/agent/schema/domain`, `read`/`write`/`deploy` scopes), discovering X4 XSD domains with optional `refresh` (`'0' | '1'`) and optional `domain` element-index drill-down (`getDomainIndex`, `limit` `1..500`, default `200`) with all host filesystem paths redacted to basenames (`rootCount`, `file`, `sourceFiles`) while preserving public `schema.domains.list@1` (`GET /api/agent/schema-registry`) untouched.
  5. Project `ai.usage.read@1` (`get_ai_spend_status` -> `GET /api/agent/ai/usage`, `read`/`write`/`deploy` scopes), returning a closed-query read-only snapshot of `aiSpendMeter.snapshot()` (`day`, `cap`, `usdCap`, `calls`, `refused`, `usd`, `totalToday`, `totalUsdToday`, `meterAvailable`, optional `meterError`) while preserving `workspace.generate.preview@1` as `surfaces.mcp.length === 0` (`forgeCapabilities.selftest.ts:453`).
- **Out of scope:** Paid/network MCP generation (`workspace.generate.preview@1` remains `mcp: []`), Studio-session-only `POST /api/agent/external-api/register` (`#31`), Studio-session-only `/api/ai/keys*`, Open VSX publishing, and restarting `FORGE DEVELOPMENT` IDE (`PID 34076`).

## 2. Reconciled Infrastructure & Implementation Summary

- **`src/lib/workspaceDomainAuthoring.ts`:** Expanded `WORKSPACE_AUTHORING_DOMAINS` (`6 -> 7`, adding `'integration_contract'`), added closed `validateIntegrationContractInput` + `validateIntegrationContractDomainFields` over `validateContract`, supported `integrationContract: null` clearing + `customLua` validation, and expanded `runWorkspaceDomainAuthoringSelftest()`.
- **`src/lib/agentHistory.ts`:** Added `'/api/agent/external-api/glue-preview'` to `LEDGER_QUIET_ROUTES`.
- **`server.ts` (`0` new raw `fs.*` writer calls; `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged):**
  - Extracted `resolveActiveSchemaRegistry(refresh)` and fixed `[REPRODUCED]` fallback bug where `fs.existsSync(referenceLibraries)` returned `0` XSD domains when `<x4ReferenceRoot>/libraries/` contained XML files without `.xsd` files even though `resolved.schemaDir` / `resolved.x4GamePath` had valid `.xsd` files.
  - Registered `GET /api/agent/ai/usage`, `POST /api/agent/external-api/glue-preview`, `GET /api/agent/patch/audit`, and `GET /api/agent/schema/domain` in `durableKeyRoute` and implemented closed-input, host-path-redacted handlers.
- **`src/lib/forgeCapabilities.ts` & `vscode-extension/mcp/x4forge-mcp.cjs`:**
  - Bumped `workspace.domain.read@1 -> @2` and `workspace.domain.write@1 -> @2` (`workspaceFilesGrantAllowed` updated for `@2`) and registered `ai.usage.read@1` (`get_ai_spend_status`), `contracts.glue.preview@1` (`preview_contract_glue`), `patch.audit.read@1` (`audit_workspace_patches`), and `schema.domain.inspect@1` (`inspect_schema_domain`) (`94 -> 98` capabilities, `95 -> 99` MCP tools, `MCP_MODULE_AUDIT_VERSION = 39`, Contract SHA-256 `912b8f2304b0878813f9a3b7153c1259c853694ef9e6f02daa6c0ba8f9163d0b`, UI-action parity SHA-256 `9106c36c422568c3ca31adbc7cffd0be2fb8d7079e0b5e9b92bb95ec38f5774d`).
  - Promoted `config/forge-route-dispositions.json` (`387` routes, SHA-256 `4359fab203327e6c3de563fca6f9a11622afabab67ed4b4bb774ffee5e49e8ce`) and `config/action-receipt-coverage.json` (`134` routes / `69` surfaces, `manifestSha256: d06df7ad5ef9cf94df238c2cdb0393195af0e4ea3f2808fe93aaf0c420a42841`, `envelopeSha256: 6d1bf1fffaf062dc5b5af8ab46291721f2df83e9adb564a34469c77a54ccb13b`).

## 3. Validation Evidence

- `npm run lint -- --max-warnings 600` -> `0` errors, `579` warnings (`<= 600`)
- `npm run typecheck` -> `0` errors
- `npm run test:writers` -> `30/30 + PASS + 8/8` (`50` raw writers, `sourceFingerprint` unchanged)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`98` capabilities, `387` routes, `99` MCP aliases, `51` census rows)
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> `PASS` (`134` routes / `69` surfaces, `79/79 + 23/23`)
- `npx tsx scripts/c06-contracts.selftest.ts` -> `196/196`
- `npx tsx scripts/c06-api.selftest.ts` -> `42/42`
- `npm run test:mcp-capabilities` -> `PASS` (`read=53, write=58, deploy=59`)
- `npm run test:native-deploy-mcp` -> `6/6 PASS`
- `npm run test:workspace-files-mcp` -> `16/16 PASS`
- `npm run build` -> `0` (`dist/server.cjs` + `dist/canonical-md-worker.cjs` + Vite bundle)
- `npm run test:oracles` -> `134/134 green`
- `npm run test:routes` -> `779/779 PASS`
- `npm run precommit:check` -> `[precommit] OK`

## 4. Review & Close

- **Status:** `VERIFIED` (Dev source, governance manifests, `134/134` oracles, `779/779` HTTP routes, `16/16` live stdio MCP; `#19` and `#31` remain `PARTIAL` pending remaining census slices and `0.0.94` installed IDE/E2E qualification).
- **Capability-map delta:** Bumped `workspace.domain.read@2` & `workspace.domain.write@2`, added `ai.usage.read@1`, `contracts.glue.preview@1`, `patch.audit.read@1`, and `schema.domain.inspect@1` (`94 -> 98` capabilities, `95 -> 99` MCP tools).
- **Suggested commit title:** `feat(mcp): integration contract domain, glue preview, patch audit, schema inspect & AI spend status (#19, #31)`

## 5. Triggered AAR

- **Triggers:**
  1. Initial `typecheck` caught `parsed.value` vs `parsed.contract` and `d.shadowedCopies.length` (`number` in `SchemaDomainInfo`) plus `FORGE_CAPABILITIES.length === 98` at `forgeCapabilities.selftest.ts:728`.
  2. Route candidate promotion caught `--generate-candidate`'s default `resourceClass: "global-session"` (`global-session routes must remain Studio-session only`), updated to `"stateless-analysis"`.
  3. `test:workspace-files-mcp` check 16 reproduced (`[REPRODUCED]`) an existing `server.ts` fallback bug where `fs.existsSync(referenceLibraries)` shadowed `resolved.schemaDir` even when `<x4ReferenceRoot>/libraries/` held zero `.xsd` files, and clarified `DIAGNOSTIC_READ_LIVE_TOOLS` plain-text `404` formatting vs JSON error payloads.
  4. Observed one non-deterministic Windows `Node v24.15.0` `0xC0000409` (`-1073740791`) exit race right after `esbuild` before `oracle-integration.mjs`; immediate rerun passed `134/134` + `779/779` + `[precommit] OK`.
- **Points to sustain:** Extracting `resolveActiveSchemaRegistry` kept `config/durable-writers.json` at `50` raw writers with zero `sourceFingerprint` churn while fixing the empty-reference-libraries XSD fallback for both `/api/agent/schema-registry` and `/api/agent/schema/domain`; checking `requireResponse` in `x4forge-mcp.cjs` before implementation prevented a `contract: null` false-failure when `mode === "workspace"` has no authored contract yet.
- **Points to improve — work/approach:** Always set `resourceClass: "stateless-analysis"` (or `"workspace"`) and `workspaceMode` in the same script that populates `agentScopes` on newly generated `forge-route-dispositions.candidate.json` entries, and update both lines `56` and `728` of `src/lib/forgeCapabilities.selftest.ts` together.
- **Points to improve — tools:** `--generate-candidate` defaults new routes to `resourceClass: "global-session"`; banked in `SESSION-HANDOFF.md` Live Hazards to explicitly set `resourceClass` + `workspaceMode` alongside `agentScopes` before `--promote-candidate`.
- **Highest-risk evidenced weakness:** `resolveActiveSchemaRegistry` previously tested only `fs.existsSync(<x4ReferenceRoot>/libraries)` rather than checking `registry.domains.length > 0`, silently hiding `xsdSchemaPath` whenever a partial unpacked corpus lacked `.xsd` files — fixed directly in `server.ts` and covered by `workspace-files-mcp.selftest.ts` check 16 (`domainCount >= 1`, `domain=md`).
