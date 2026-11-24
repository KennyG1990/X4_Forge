# Curated MCP & Canonical Capability Projections for Authoring and Ecosystem Helpers (#19 P4 Slice 4)

**Status: VERIFIED (isolated Dev source, governance manifests, `134/134` oracles, `719/719` HTTP routes, `93/93` X4 9.00 reference-api, and `6/6` real child-backend stdio MCP suites; `#19` overall remains PARTIAL pending remaining P4 slices & `0.0.94` installed IDE/E2E qualification).**
**Lane:** FULL.
**Owner:** [#19](https://github.com/KennyG1990/X4_Forge/issues/19), [#79](https://github.com/KennyG1990/X4_Forge/issues/79) (`P4` gap-closure slice in `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md`).

## 1. Plan & Acceptance Contract

- **Bounded unit:** Close six read/analyze authoring, patch-synthesis, and mod-ecosystem parity gaps across `diagnostics.conflicts.check`, `editors.xml_patches.author`, `reference.corpus.browse_and_search`, and `reference.expression.check` in `FORGE_UI_ACTION_PARITY_CENSUS`, projecting them as protected (`public: false`, `agentScopes: ['read', 'write', 'deploy']`) canonical capabilities and live-discovery-gated stdio MCP tools while keeping all Studio and legacy HTTP endpoints 100% compatible:
  1. **`expression.suggest@1`** (`POST /api/agent/suggest/expression`, already in `LEDGER_QUIET_ROUTES`) + MCP tool **`suggest_expression_completions`** (`connected`): extend `POST /api/agent/suggest/expression` to accept optional `variableTypes` (`Record<string, string>`, already supported by `suggestExpression` in `src/lib/expressionSuggest.ts`) and `limit` (`1..200`, default `100`), returning `{ available, total, truncated, suggestions }` while keeping `ExpressionInput.tsx`'s `{ text, caret }` contract unchanged.
  2. **`extensions.dependencies.analyze@1`** (`GET /api/agent/extensions/dependency-graph`) + MCP tool **`get_mod_dependency_graph`** (`connected`): add a protected (`public: false`) route adapter sharing `scanInstalledModDependencyGraph` with `GET /api/agent/mod-dependency-graph` (`ModDependencyView.tsx` legacy-public route kept untouched) and redacting host `extensionsRoot`.
  3. **`extensions.overrides.analyze@1`** (`GET /api/agent/override-map`) + MCP tool **`get_extension_override_map`** (`connected`): per-element/attribute override resolution and simulated load-order winner for a contested base relative XML path (`?file=...`).
  4. **`patch.targets.list@1`** (`GET /api/agent/patch-targets`) + MCP tool **`list_patch_targets`** (`connected`): search base+DLC relative XML patch target paths (`?q=...&limit=...`, `limit` `1..100`).
  5. **`patch.xpath.synthesize@1`** (`POST /api/agent/xpath-synth`, already in `LEDGER_QUIET_ROUTES`) + MCP tool **`synthesize_xml_patch`** (`partial`: MCP bounds XML inputs at `512 KiB`, `diffXml` output at `256 KiB`, and `ops` at `200`): synthesize minimal RFC 5261 `<diff>` operations from `editedXml` against inline `vanillaXml` or a canonical/game `targetFile` (with optional `sourceSignature` revision CAS).
  6. **`reference.galaxy.read@1`** (`GET /api/agent/galaxy-map`) + MCP tool **`get_galaxy_map`** (`connected`): read merged base+DLC+extension cluster and sector 3D coordinates (`maps/xu_ep2_universe`), supporting optional substring filter `q` (`<= 256` chars) while preserving full unfiltered output for `GalaxyMapView.tsx`.
- **Out of scope:**
  - Studio-session-only credential/AI-key/Steam-Workshop/sidecar-lifecycle endpoints (`missing` rows in `FORGE_UI_ACTION_PARITY_CENSUS`).
  - Modifying live Forge, `FORGE DEVELOPMENT` IDE (`0.0.89`), `AiLive`, X4 game installation, or saves.
- **Rollback / checkpoint:** Clean pushed `origin/main` checkpoint `61596f329f124f0ec11e43438cca318c2864118a` (`Quality` CI `45383170566` `success`).

## 2. Baseline

- **Revision:** `61596f329f124f0ec11e43438cca318c2864118a` (`61596f3`) on `main` (`HEAD == origin/main`), GitHub Actions `Quality` run `45383170566` `success`.
- **Governance state:** `51` capabilities (`48` non-native), `344` literal routes, `52` MCP aliases (`MCP_MODULE_AUDIT_VERSION = 28`), `111` receipt-coverage routes / `69` surfaces, `FORGE_UI_ACTION_PARITY_CENSUS` (`available = 13`, `approvalRequired = 2`, `partial = 26`, `missing = 10`, `openGaps = 36`).

## 3. Reconciliation

- **Resources & couplings checked:**
  - `src/lib/expressionSuggest.ts:94-101, 227`: `suggestExpression(text, caret, spIndex, opts)` already supported `opts?.variableTypes`, resolving `$var.` against exact `ScriptPropertyIndex` datatypes (`source: 'datatype'`), whereas `server.ts:12781-12792` only forwarded `(text, caret, spIndex)` and returned unbounded union arrays (`1,000+` items on untyped `$var.`). Wiring `variableTypes` and `limit` (`1..200`, default `100`) + `{ available, total, truncated, suggestions }` unlocks `#79` typed completions over both HTTP and MCP while keeping `ExpressionInput.tsx` 100% compatible.
  - `server.ts:799, 10377-10400`: `GET /api/agent/mod-dependency-graph` is in `PUBLIC_READONLY_GETS` (`legacy-public`) and returns `extensionsRoot: extRoot`. Extracting `scanInstalledModDependencyGraph(extRoot)` and adding `GET /api/agent/extensions/dependency-graph` (`public: false`, `extensionsRoot` omitted) keeps `CUSTOM_TOOLS` (`5`) unpolluted and host paths redacted.
  - `src/components/XMLPatchSystem.tsx:302-307`: sends `{ vanillaXml, editedXml, targetFile, sourceSignature }` where `sourceSignature` may be `string | null | undefined`; allowing `sourceSignature: string | null` in `patch.xpath.synthesize@1`'s `inputSchema` ensures Studio UI calls pass `CAPABILITY_INPUT_INVALID` checks cleanly.
- **Capability-map delta:** Adds `expression.suggest@1`, `extensions.dependencies.analyze@1`, `extensions.overrides.analyze@1`, `patch.targets.list@1`, `patch.xpath.synthesize@1`, and `reference.galaxy.read@1` (`51 -> 57` capabilities, `52 -> 58` MCP tools, `344 -> 345` literal routes).

## 4. Implementation Summary

- **`server.ts`:**
  - Enforced closed `CAPABILITY_INPUT_INVALID` query/body validation across `GET /api/agent/patch-targets`, `GET /api/agent/extensions/dependency-graph` (new redacted `public: false` adapter over shared `scanInstalledModDependencyGraph`), `GET /api/agent/override-map`, `GET /api/agent/galaxy-map` (adding optional substring filter `q`), `POST /api/agent/suggest/expression` (adding `variableTypes`, `limit` `1..200`, `total`, and `truncated`), and `POST /api/agent/xpath-synth` (supporting `sourceSignature: string | null`).
- **`src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`:**
  - Registered `expression.suggest@1`, `extensions.dependencies.analyze@1`, `extensions.overrides.analyze@1`, `patch.targets.list@1`, `patch.xpath.synthesize@1`, and `reference.galaxy.read@1` (`51 -> 57` capabilities, `54` non-native, Contract SHA-256 `61e651f71e110830e5ccccebcd4ae253259c4a9c300fa60191dbd792ca9ab662`).
  - Updated `FORGE_UI_ACTION_PARITY_CENSUS` (`diagnostics.conflicts.check`, `editors.xml_patches.author`, `reference.corpus.browse_and_search`, `reference.expression.check`; census SHA-256 `89c422c1d0c524137c68021d5a8709dbd33031ab4ca4f7f14523697814a6b7a0`) and expanded `runForgeCapabilitiesSelftest()` (`83/83`).
- **`vscode-extension/mcp/x4forge-mcp.cjs` & `scripts/capability-contract-audit.ts`:**
  - Added `suggest_expression_completions`, `get_mod_dependency_graph`, `get_extension_override_map`, `list_patch_targets`, `synthesize_xml_patch` (`512 KiB` input / `256 KiB` `diffXml` / `200` `ops`), and `get_galaxy_map` to `DIAGNOSTIC_READ_LIVE_TOOLS` and `TOOLS` (`52 -> 58` MCP mappings, `MCP_MODULE_AUDIT_VERSION = 29`).
- **Governance manifests & test suites:**
  - Promoted `config/forge-route-dispositions.json` (`345` literal routes, SHA-256 `1f9c06f09c325d7932cdcec5512a814cb857ba56d7689b9658acddc638b79531`).
  - Removed `'POST /api/agent/xpath-synth'` from `QUIET_READ_OVERRIDE_ROUTES` (`scripts/action-receipt-coverage-audit.ts`), promoted `config/action-receipt-coverage.json` (`111` routes / `69` surfaces, manifest SHA-256 `f2f1776ab93f4ba59379a812e5b1124e9c37f477a06b439ca5ebb3c32e4a1c81`), and updated `src/lib/actionReceiptPolicyBundle.ts`.
  - Updated `scripts/mcp-capability-selftest.ts` (`read=29, write=34, deploy=35`), `scripts/workspace-files-mcp.selftest.ts` (`6/6` real child-backend stdio MCP checks), and `scripts/route-integration.mjs` (`719/719 PASS`).

## 5. Validation Evidence

- `npm run lint -- --max-warnings 600` -> **PASS (`0` errors, `578` warnings)**.
- `npm run typecheck` -> **PASS (`0`)**.
- `runForgeCapabilitiesSelftest()` -> **PASS (`83/83`)**.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> **PASS (`57` capabilities, `345` literal routes, `58` MCP aliases, `51` UI-action parity rows)**.
- `npm run test:writers` -> **PASS (`30/30 + PASS + 8/8`, zero `durable-writers.json` drift)**.
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> **PASS (`111` routes / `69` surfaces, `79/79 + 23/23`)**.
- `npx tsx scripts/c06-contracts.selftest.ts` -> **PASS (`196/196`)**.
- `npm run test:mcp-capabilities` -> **PASS (`read=29, write=34, deploy=35`, `CUSTOM_TOOLS=5`, `LEGACY_TOOLS=10`)**.
- `npm run test:native-deploy-mcp` -> **PASS (`6/6`)**.
- `npm run test:workspace-files-mcp` -> **PASS (`6/6` real child backend + stdio MCP including `6_authoring_and_ecosystem_helpers_over_preset_read_mcp`)**.
- `X4_REFERENCE_ROOT=... npm run test:reference-api` -> **PASS (`93/93`)**.
- `npm run build` -> **PASS**.
- `npm run test:oracles` -> **PASS (`134/134` green)**.
- `npm run test:routes` -> **PASS (`719/719 PASS`)**.
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run precommit:check` -> **PASS (`[precommit] OK`)**.

## 6. Review & Close

- **Status:** `VERIFIED` (for `#19` P4 Slice 4 and `#79` expression completion MCP parity in isolated Dev source, HTTP, and stdio MCP; `#19` overall remains `PARTIAL` pending remaining P4 slices and `0.0.94` installed IDE/E2E qualification).
- **Suggested commit title:** `feat(mcp): project expression suggest, override map, patch synth/targets, galaxy map, and mod dependency graph (#19, #79)`

## 7. Triggered AAR

1. **Points to sustain:**
   - Reconciling `XMLPatchSystem.tsx:302-307` and `ExpressionInput.tsx:53-65` before writing `inputSchema` and `server.ts` validators prevented breaking Studio UI requests (`sourceSignature: null` on `xpath-synth`) while unlocking `suggestExpression`'s dormant `variableTypes` parameter over both HTTP and MCP (`#79`).
   - Every validation suite (`typecheck`, `lint`, `test:writers`, `test:capabilities`, `test:action-receipt-coverage` + `:selftest`, `c06-contracts`, `test:mcp-capabilities`, `test:native-deploy-mcp`, `test:workspace-files-mcp`, `test:reference-api`, `test:oracles`, `test:routes`, and `precommit:check`) passed on the first run after route-disposition promotion.
2. **Points to improve - work/approach:**
   - `scripts/capability-contract-audit.ts`'s typed UI semantic reachability verifier rejects `connected` `surfaces.ui` anchors inside timer callbacks (`window.setTimeout` in `ExpressionInput.tsx`), on-demand drill-down handlers (`PackageModDoctor.tsx`), or JSX string props (`endpoint="/api/agent/patch-targets"` in `XMLPatchSystem.tsx`). Only top-level component/hook fetches (`XMLPatchSystem.tsx::/api/agent/xpath-synth` and `GalaxyMapView.tsx::/api/agent/galaxy-map`) satisfy `connected` UI reachability; indirect UI callers belong in `disconnected` `surfaces.ui` notes while `FORGE_UI_ACTION_PARITY_CENSUS.uiAnchors` records their literal UI file/token ownership.
   - `action-receipt-coverage-audit.ts --write-candidate` outputs `envelopeSha256` (not `candidateSha256`) as the hash argument expected by `--promote-candidate --expected-sha256`.
3. **Points to improve - tools:**
   - No new tool defects observed (`route-integration.mjs`'s `75 ms` drain fix from Unit 25 kept `719/719` route teardown 100% crash-free on Windows Node v24).
4. **Highest-risk observed weakness:**
   - `No evidenced risk delta` (the `legacy-public` `extensionsRoot` exposure hazard on `/api/agent/mod-dependency-graph` was caught during reconciliation and avoided via `/api/agent/extensions/dependency-graph`).
