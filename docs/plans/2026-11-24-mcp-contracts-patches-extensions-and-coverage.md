# Plan — `#19` P4 Slice 10: External-API Contracts, Installed Extension File Read, XML Patch Base/XPath Completion, Reference Coverage & UI Lua Authoring MCP Projections

- **Date:** 2026-11-24
- **Status:** `VERIFIED` (isolated Dev source, governance manifests, `134/134` oracles, `765/765` HTTP routes, and `13/13` real stdio MCP; `#19`, `#75`, and `#31` remain `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification)
- **Lane:** `FULL`
- **Owners / Issues:** `#19` (`diagnostics.conflicts.check`, `editors.contracts.author`, `editors.ui_lua.author`, `editors.xml_patches.author`, `settings.first_run.detect_and_harvest`), `#75` (`reference.coverage.read@1`), `#31` (`contracts.registry.read@1`, `contracts.derive@1`)

## 1. Plan And Acceptance Contract

- **Bounded unit:** Project eight read/analyze authoring, patching, extension-inspection, and reference-coverage capabilities across `FORGE_CAPABILITIES`, protected (`public: false`) Agent HTTP routes, and stdio MCP tools (`79 -> 87` capabilities, `80 -> 88` MCP tools, zero new raw `fs.*` writer calls):
  1. **`contracts.derive@1`** (`derive_external_api_contract` -> `GET /api/agent/external-api/derive-draft`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`):
     - Closed query `{ ext }` (`maxLength: 128`, single folder name without path separators or `..`).
     - Scans loose `.xml`/`.lua` (`<= 400` files, `<= 2 MB`, verifying `isPathWithin` + `fs.realpathSync` containment) and packed `.cat`/`.dat` entries across `filesystemPath`, `<x4GamePath>/extensions`, or `modWorkspacePath`, derives and validates a draft external API contract (`deriveApiDefinition` + `validateApiDefinition`), and redacts host `extensionRoot` / `searched` paths in favor of `extensionFolder` and `sourceKind: 'filesystem' | 'extensions' | 'workspace'`.
  2. **`contracts.registry.read@1`** (`list_external_api_contracts` -> `GET /api/agent/external-api/registry`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read']`):
     - Closed query `{ full?: '0' | '1', extensionId?: string }`, returning the active merged external-API contract registry (`builtin`, `data-dir`, `folder`, `endpoint`) without altering `legacy-public` `GET /api/agent/external-api-registry`.
  3. **`extensions.file.read@1`** (`read_extension_file` -> `GET /api/agent/extensions/file`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read']`):
     - Closed query `{ path }` (`<extensionFolder>/<relativePath>`, `maxLength: 1024`), enforcing `isPathWithin` + `fs.realpathSync` containment on loose files inside `<x4GamePath>/extensions/` and reading packed `.cat`/`.dat` archive entries (`<= 8 MiB`), bounding returned `content` at `512 KiB` (`bytes`, `contentLength`, `contentTruncated`, `sha256`, `source: 'loose' | 'packed'`, optional `archive`) with zero host paths.
  4. **`patch.base.read@1`** (`read_patch_base_content` -> `GET /api/agent/patch/base-content`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read']`):
     - Closed query `{ targetFile }` (`maxLength: 1024`), resolving target XML base content across `modWorkspacePath`, `x4GamePath`, `<x4GamePath>/extensions/*`, and packed base-game `.cat`/`.dat` archives (`isPathWithin` + `fs.realpathSync` containment on loose roots), redacting host `sourcePath` in favor of `sourceKind: 'workspace' | 'game-loose' | 'extension-loose' | 'packed'`, optional `extensionFolder` / `archive`, and `512 KiB`-bounded `content`.
  5. **`patch.xpath.complete@1`** (`complete_xpath_selector` -> `POST /api/agent/patch/xpath-complete`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`, `LEDGER_QUIET_ROUTES`):
     - Closed body `{ path, selector, cursor, limit?, refresh? }` (`limit` integer `1..100`, default `50`), resolving `resolveEffectiveReferenceDocument`, redacting `effective.root` on `404`, enforcing `effective.complete === true` (`503 REFERENCE_EFFECTIVE_INCOMPLETE`), and returning ranked `completeXPath` completions.
  6. **`reference.coverage.read@1`** (`get_reference_coverage` -> `GET /api/agent/reference/coverage`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`):
     - Closed query `{ refresh?: '0' | '1' }`, reading/scheduling `ReferenceManifestStatus` and `getReferenceCoverage`, redacting `status.root`, `status.database`, `status.current?.root`, and `coverage?.root`, and returning `200` (`ready: true`) or `202` (`ready: false, coverage: null`).
  7. **`ui.lua.snippets.read@1`** (`list_lua_ui_snippets` -> `GET /api/agent/ui/lua-snippets`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read']`):
     - Closed query `{ q?: string }`, returning vetted X4 UI Lua patterns (`LUA_SNIPPETS`, optionally filtered by `q`) and `runLuaSnippetSelftest()`.
  8. **`ui.vanilla.harvest@1`** (`harvest_vanilla_ui_menus` -> `GET /api/agent/ui/vanilla-harvest`, `agentScopes: ['read', 'write', 'deploy']`, `effects: ['read', 'analyze']`):
     - Closed query `{ limit?: string }` (integer `1..60`, default `24`), profiling menu-like Lua entries from base-game `.cat`/`.dat` archives (`profileMenuLua` + `deriveSchemaEvidence`) with zero host paths.
- **Out of scope:** Mutating `POST /api/agent/external-api/register` (`session-only`, `#31`), `POST /api/agent/setup/harvest-schemas` (`session-only`, `#75`), or Dev-only `POST /api/agent/project-check-runs` (`X4_FORGE_PROJECT_CHECK_RUNS=1`, `#61`), and `workspace.generate.preview` MCP projection (explicitly locked to `surfaces.mcp: []` by `capability_generation_is_discovery_only_preview` due to `spend` effect).
- **Risks & authorization boundaries:**
  - All 8 new capabilities are `public: false` (`CUSTOM_TOOLS = 5` unchanged) and strictly read/analyze (`0` new raw `fs.*` writer calls; `50` raw filesystem writer sources in `config/durable-writers.json` unchanged).
  - Never include `'generatedAt'` or `'timestamp'` inside `FORGE_CAPABILITIES` descriptors (`forgeCapabilities.selftest.ts:70`).
  - Existing Studio/legacy routes (`/api/agent/extension-file`, `/api/patch/base-content`, `/api/reference/xpath-complete`, `/api/reference/coverage`, `/api/agent/external-api-registry`, `/api/agent/external-api/derive`, `/api/agent/lua-snippets`, `/api/agent/vanilla-ui-harvest`) remain untouched for Studio callers.
- **Rollback / checkpoint:** `2606b6433c4b3f589d918ec4c1696127daa78e27` (`origin/main`).

## 2. Baseline & Reconciliation

- **Baseline HEAD:** `2606b6433c4b3f589d918ec4c1696127daa78e27` (`main == origin/main`, GitHub Actions `Quality` `45450843610` `SUCCESS`).
- **Reconciled owners reused without duplication:**
  - `src/server/referenceRoutes.ts` (`getReferenceManifestStatus`, `getReferenceCoverage`, `resolveEffectiveReferenceDocument`, `effectiveReferenceMetadata`, `completeXPath`).
  - `src/lib/externalApiContract.ts` (`deriveApiDefinition`, `validateApiDefinition`) and `listActiveExternalApis` (`server.ts`).
  - `src/lib/luaSnippets.ts` (`LUA_SNIPPETS`, `runLuaSnippetSelftest`) and `src/lib/vanillaUiReference.ts` (`profileMenuLua`, `deriveSchemaEvidence` returning `SchemaEvidence[]`).
  - `src/lib/catDatParser.ts` (`findCatDatArchives`, `parseCat`, `readEntryText`, `catDatExtractBaseGameFile`).
- **Capability-map delta:**
  - `FORGE_CAPABILITIES` (`79 -> 87` capabilities, `76 -> 84` non-native; Contract SHA-256 `6a0920b3431bfb9e14b48409441400496533ce62199c48e36d7e9bd5bbea58b1`).
  - `FORGE_UI_ACTION_PARITY_CENSUS` (`SHA-256: 130b8983496565a6ee3e44237606be1c925ff155178161f2a092e4428ce339cf`; updated `diagnostics.conflicts.check`, `editors.contracts.author`, `editors.ui_lua.author`, `editors.xml_patches.author`, and `settings.first_run.detect_and_harvest`).
  - `config/forge-route-dispositions.json` (`368 -> 376` disposed literal routes, SHA-256 `ff4cbb45f92b780315f0a33d4f500087967e49ac80192ee5c506cdaeeb79233e`).
  - `config/action-receipt-coverage.json` (`129 -> 130` routes / `69` surfaces, `manifestSha256: 7fecfae134a6cdc65b0106511eb2fbc2be24b8c737788558bf6c4c12a1a8d6d0`, `envelopeSha256: 4c71678dfe99d2be777323866f8dfed4d671aa234368c670dac89537534ad0e9`).
  - `vscode-extension/mcp/x4forge-mcp.cjs` (`80 -> 88` MCP tools, `MCP_MODULE_AUDIT_VERSION = 36`, preset inventories `read=43, write=48, deploy=49`).

## 3. Validation Evidence

- `npm run lint -- --max-warnings 600`: `0` errors (`579` warnings, within `<= 600` CI ceiling).
- `npm run typecheck`: exit `0`.
- `npm run test:writers`: `30/30 + PASS + 8/8` (`50` raw filesystem writer sources, `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged).
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`: `PASS` (`87` capabilities, `376` disposed literal routes, `1` reviewed dynamic registrar, `88` MCP aliases, `51` UI-action parity rows).
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest`: `PASS` (`130` routes / `69` surfaces, `79/79 + 23/23`).
- `npx tsx scripts/c06-contracts.selftest.ts` (`196/196`) & `npx tsx scripts/c06-api.selftest.ts` (`42/42`): `PASS`.
- `npm run test:mcp-capabilities`: `PASS` (`read=43, write=48, deploy=49` + `md-navigation-mcp` + `ai-navigation-mcp` + `native-performance-mcp`).
- `npm run test:native-deploy-mcp`: `6/6 PASS`.
- `npm run test:workspace-files-mcp`: `13/13 PASS` (including `13_contracts_patch_base_xpath_extension_file_and_reference_coverage_over_mcp` exercising all 8 new tools plus negative traversal/parameter refusals and host-path redaction over real child backend + stdio MCP).
- `npm run build`: exit `0` (`dist/server.cjs`, `dist/canonical-md-worker.cjs`, `dist/index.html`).
- `npm run test:oracles`: `134/134 PASS` (`runForgeCapabilitiesSelftest` `89/89`).
- `npm run test:routes`: `765/765 PASS` (including `slice10_authoring_patch_extension_and_coverage_routes_redact_host_paths_and_validate_inputs` and `all_canonical_capability_outputs_exercised` across all `87` capabilities).
- `npm run precommit:check`: `[precommit] OK`.

## 4. Close & AAR

- **Final status:** `VERIFIED` (bounded Unit 33; `#19`, `#75`, and `#31` remain `PARTIAL` pending remaining census slices and `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): contracts, installed extension files, patch base/xpath completion, coverage, and UI Lua snippets (#19, #75, #31)`
- **AAR (Triggered — ESLint `no-control-regex`, `deriveSchemaEvidence` `array` schema, and `route-integration.mjs` `filesystemPath` precedence):**
  1. **Points to sustain:** Reusing `resolveEffectiveReferenceDocument`, `completeXPath`, `deriveApiDefinition`, `LUA_SNIPPETS`, and `profileMenuLua` behind dedicated host-path-redacted `/api/agent/*` adapters delivered 8 authoring/diagnostic MCP tools with zero raw `fs.*` writer delta (`durable-writers.json` untouched) and zero breakage on Studio's existing endpoints.
  2. **Points to improve - work/approach:** Two type/precedence details required adjustment during verification: (a) `deriveSchemaEvidence` returns `SchemaEvidence[]` (`array`, not `object`), caught immediately by live stdio MCP check `13`, and (b) `deployedRolesConfig` in `scripts/route-integration.mjs:2338` points `filesystemPath` at `liveExtensions`, so `GET /api/agent/external-api/derive-draft` resolves `sourceKind: 'filesystem'` before `'extensions'`.
  3. **Points to improve - tools:** `eslint`'s `no-control-regex` rule rejects literal `/[\u0000-\u001f\u007f]/` in `server.ts`; `hasControlChars(text)` character-code loop avoids regex lint noise cleanly and was reused across input validators.
  4. **Highest-risk observed weakness:** Non-`WORKSPACE_FILES_TOOLS` diagnostic read tools in `x4forge-mcp.cjs` format upstream HTTP `4xx` errors via plain-text `ERROR: Forge API <status>: <body>` (`formatHttpError`) rather than JSON-stringifying the raw refusal object; tests asserting negative refusals across both families must match both structured JSON `error.code` and formatted `ERROR: Forge API` strings (`scripts/workspace-files-mcp.selftest.ts`).
