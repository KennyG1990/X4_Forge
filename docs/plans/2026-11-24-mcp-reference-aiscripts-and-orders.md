# Plan: Canonical AI Script & `<order>` Header Reference Index over Agent API & MCP (`#63` FF-24 + `#19`)

- **Status:** `VERIFIED` (`Unit 46` Dev source, X4 9.00 canonical corpus `0.77 ms` warm, HTTP/MCP, `798/798` routes, `134/134` oracles, `precommit:check`, and live `FORGE DEVELOPMENT` IDE `PID 14728` reload; `#63` & `#19` remain `PARTIAL` pending `0.0.94` public Open VSX VSIX qualification)
- **Date:** 2026-11-24
- **Owner:** Forge QA Agent (`Unit 46`)
- **Lane:** `FULL`
- **Related Issues:** `#63` (`FF-24`: AI script `<order>` header catalogue in one sub-second request), `#19` (Agent API & MCP capability convergence)

## 1. Baseline & Reconciliation

- **Baseline:** `358def4e9fa57b01a0926fc7537eb4ae50b21553` (`Unit 45`, clean worktree, `HEAD == origin/main`; `110` capabilities, `399` route dispositions, `111` MCP aliases, `50` raw writers / `sourceFingerprint: 0350c67b6812482b04a227277fc50b1e09e339e2b0b4e80e49ce38c223765052`).
- **Existing infrastructure reused:**
  - `getReferenceCorpus` / `parseAIScripts` / `parseAIScriptOrder` in `src/lib/referenceCorpus.ts` (`AIScriptReference`: `{ id, name, source, path, order: { id, category, infinite, params[] } | null, overrideOrders? }`).
  - `validateReferenceCapabilityQuery` + `sendCorpusError` in `src/server/referenceRoutes.ts`.
- **Reproduced gap (`[REPRODUCED]`):**
  - `GET /api/reference/aiscripts` (`src/server/referenceRoutes.ts:846`) is unreviewed for custom/scoped agent keys (`agentScopes: []` -> `403 AUTHORITY_ROUTE_UNREVIEWED`) and has zero MCP projection (`#19`) or server-side filtering (`orderOnly`, `category`, `source`, `q`, `limit`, `offset`). Agents operating over MCP or scoped `read`/`write`/`deploy` keys cannot query the `178` X4 9.00 AI scripts and `86` `<order>` headers in one sub-second call without falling back to per-file reads.

## 2. Bounded Scope & Non-Goals

### In Scope
1. **Host-Path-Redacted Agent Endpoint (`GET /api/agent/reference/aiscripts`):**
   - Export `respondAgentReferenceAiScripts(req, res)` in `src/server/referenceRoutes.ts` and register `app.get('/api/agent/reference/aiscripts', ...)` + `durableKeyRoute` in `server.ts` (`agentScopes: ['read', 'write', 'deploy']`, `resourceClass: 'stateless-analysis'`, `workspaceMode: 'none'`).
   - Support closed query parameters (`q`, `category`, `source`, `orderOnly` `'0' | '1'`, `limit` `1..500` default `200`, `offset` `0..10000` default `0`, `refresh` `'0' | '1'`, `workspaceId`, `clientId`).
   - Return `{ ok: true, generation, total, orderCount, filteredTotal, truncated, byCategory, items }` with zero host filesystem paths (`0` new raw `fs.*` writer calls).
2. **Canonical Capability & MCP Projection (`reference.aiscripts.read@1` / `list_reference_aiscripts`):**
   - Register `reference.aiscripts.read@1` in `src/lib/forgeCapabilities.ts` and wire into `reference.corpus.browse_and_search` in `FORGE_UI_ACTION_PARITY_CENSUS`.
   - Project `list_reference_aiscripts` in `vscode-extension/mcp/x4forge-mcp.cjs` (`MCP_MODULE_AUDIT_VERSION = 44`, `112` MCP aliases, `111` capabilities).
   - Promote `config/forge-route-dispositions.json` (`400` routes) and `config/action-receipt-coverage.json` + `src/lib/actionReceiptPolicyBundle.ts` if changed.

### Out of Scope
- Modifying `GET /api/reference/aiscripts` or `GET /api/reference/search` wire contracts consumed by Studio UI or `test:reference-api` baseline checks.
- Claiming runtime player-order eligibility beyond authored `<order>` header metadata.

## 3. Acceptance Criteria & Negative Paths
1. `read`-, `write`-, and `deploy`-scoped agent keys and stdio MCP `list_reference_aiscripts` succeed (`200 OK`) in `< 100 ms` warm against X4 9.00 (`178` AI scripts, `86` `<order>` headers, exact `byCategory` counts, exact `orderOnly=1` / `category` / `q` filtering).
2. **Negative paths:** Unauthenticated requests return `401`; unknown query keys, invalid `orderOnly`/`refresh`, or out-of-range `limit`/`offset` return `400 CAPABILITY_INPUT_INVALID`; zero host filesystem roots appear anywhere in the JSON payload.
3. Live `FORGE DEVELOPMENT` IDE (`G:\Forge-QA\development-ide`) hot-reloads into `111` capabilities via `Reload-FORGE-DEVELOPMENT.ps1`.

## 4. Planned Rollback
- Revert the single bounded Unit 46 commit across `src/server/referenceRoutes.ts`, `server.ts`, `src/lib/forgeCapabilities.ts`, `src/lib/forgeCapabilities.selftest.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `scripts/mcp-capability-selftest.ts`, `scripts/workspace-files-mcp.selftest.ts`, `scripts/route-integration.mjs`, and `config/forge-route-dispositions.json`.

## 5. Implementation, Validation, Review & Close (`Unit 46`)

- **Reconciliation & Capability-Map Delta:**
  - Added `respondAgentReferenceAiScripts` (`src/server/referenceRoutes.ts`) + `GET /api/agent/reference/aiscripts` (`server.ts`, `durableKeyRoute`, `resourceClass: 'configured-root'`, `workspaceMode: 'none'`), `reference.aiscripts.read@1` (`src/lib/forgeCapabilities.ts`, wired into `reference.corpus.browse_and_search`), and `list_reference_aiscripts` (`vscode-extension/mcp/x4forge-mcp.cjs`, `MCP_MODULE_AUDIT_VERSION = 44`, `110 -> 111` capabilities, `111 -> 112` MCP aliases, Contract SHA-256 `97179e9d180689b61be74ffb9d036b4559ff81f78600f91822dba6f6d9cf6c41`, UI-action parity SHA-256 `b9241ce14f0fd5708902e3d57744a1f6d4c59355ec2c1b0f8c1df38505f641b2`).
  - Promoted `config/forge-route-dispositions.json` (`400` routes, SHA-256 `898ef61101b96c531ce5d74e22eef926a839d77170240b743bcf089f11f4ff0a`); `config/durable-writers.json` (`50` raw writers, `0350c67b...`) and `config/action-receipt-coverage.json` (`140` routes / `69` surfaces, `e3b54de5...`) unchanged.
- **Validation Evidence (Post-Final-Edit):**
  - Canonical X4 9.00 corpus probe (`X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00'`): `total=178`, `orderCount=86`, `filteredTotal=86` (`internal=44, trade=15, navigation=9, combat=7, mining=5, salvage=5, coordination=1`) in **`0.77 ms` warm** (`1060.25 ms` cold).
  - `npm run typecheck` (`0`), `npm run lint -- --max-warnings 600` (`0` errors), `npm run test:writers` (`30/30 + PASS + 8/8`), `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` (`PASS`), `npm run test:mcp-capabilities` (`read=66, write=71, deploy=72`), `npm run test:action-receipt-coverage` (`140/69`), `npm run test:workspace-files-mcp` (`18/18`), `npm run test:oracles` (`134/134`), `npm run test:routes` (`798/798 PASS`), `npm run precommit:check` (`[precommit] OK`).
  - Live `FORGE DEVELOPMENT` IDE (`Reload-FORGE-DEVELOPMENT.ps1 -Reason unit46-reference-aiscripts`): graceful sentinel reload `PID 47032 -> 14728` on `http://127.0.0.1:62560`, serving `111` capabilities (`contractHash=97179e9d180689b61be74ffb9d036b4559ff81f78600f91822dba6f6d9cf6c41`, `censusHash=b9241ce14f0fd5708902e3d57744a1f6d4c59355ec2c1b0f8c1df38505f641b2`).
- **Final Status:** `VERIFIED` (`#63` & `#19` remain `PARTIAL` pending `0.0.94` public Open VSX VSIX qualification).
- **Suggested Commit Title:** `feat(reference): expose canonical AI script and order-header index over Agent API and MCP (#63, #19)`

## 6. Full-Lane AAR (Clean Execution)

1. **Triggers:** None — every compile, audit, manifest promotion, MCP, oracle, route, precommit, and live reload step passed on the first attempt.
2. **Points to sustain:** Checking `reference.manifest.list` (`string` query integer bounds + `LIVE_DISCOVERY_ONLY_TOOLS` + `configured-root` `resourceClass`) and `scripts/route-integration.mjs` `.json` return shape before editing gave a 100% first-try pass across all 400 route dispositions and 798 route checks.
3. **Points to improve — work/approach:** None evidenced.
4. **Points to improve — tools / Highest-risk evidenced weakness:** `No evidenced risk delta`.
