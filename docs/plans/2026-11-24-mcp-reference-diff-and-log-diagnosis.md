# Curated MCP & Canonical Capability Projections for Reference Corpus, Object Index, XML Diff Simulation, and Log Diagnosis (#19 P4 Slice 2)

**Status: PARTIAL — VERIFIED across source, governance manifests, `134/134` oracles, `690/690` isolated HTTP routes, `93/93` X4 9.00 reference API checks, and real stdio MCP (`read=23, write=28, deploy=29`); installed `0.0.94` IDE/E2E qualification remains gated.**
**Lane:** FULL.
**Owner:** [#19](https://github.com/KennyG1990/X4_Forge/issues/19) (`P4` gap-closure slice in `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md`).

## 1. Plan & Acceptance Contract (Reconciled)

- **Bounded unit:** Close six high-leverage read/analyze MCP parity gaps across `reference.corpus.browse_and_search`, `diagnostics.patch_readiness.check`, and `runtime.logs_and_probes.diagnose` in `FORGE_UI_ACTION_PARITY_CENSUS` using strictly `public: false` (`read`, `write`, `deploy`) agent capabilities so narrowed custom keys (`authorityMode: 'exact'`) preserve exact least-privilege:
  1. **`patch.diff.simulate@1`** (`POST /api/agent/reference/simulate-diff`) + MCP tool **`simulate_xml_diff`** (`partial`: caps submitted `content` at `524,288` chars and returned `content` preview at `262,144` chars with `contentTruncated: boolean` and `contentLength: number`), keeping `POST /api/reference/simulate-diff` untouched for legacy callers.
  2. **`reference.file.read@1`** (`GET /api/agent/reference/effective-file`) + MCP tool **`read_reference_file`** (`partial`: omits host `root` and caps `content` at `262,144` chars with `contentTruncated` / `contentLength`), keeping `GET /api/reference/effective-file` untouched as `legacy-public` for Studio/extension hover.
  3. **`reference.objects.search@1`** (`GET /api/agent/object-index`) + MCP tool **`search_x4_objects`** (`partial`: omits host `roots` and caps `limit` at `200`).
  4. **`reference.status.read@1`** (`GET /api/agent/reference/status`) + MCP tool **`get_reference_status`** (`connected`: omits host `root`, `manifest.root`, and `instance`), keeping `GET /api/reference/status` untouched as `legacy-public` for discovery probes.
  5. **`reference.suggest@1`** (`GET /api/agent/reference/suggest`) + MCP tool **`search_reference_symbols`** (`connected`: context-aware ranking across base, DLC, and optional workspace `faction`, `ware`, `sector`, `macro`, `job`, and `aiscript` symbols), keeping `GET /api/reference/suggest` untouched for Studio.
  6. **`runtime.log.diagnose@1`** (`POST /api/agent/log-diagnose`) + MCP tool **`diagnose_game_log`** (`partial`: caps pasted `tail` at `524,288` chars vs HTTP `10 MiB`, returning deterministic root-cause hypotheses + `#58` `rawEngineIdLeaks`).
- **Authoritative references:**
  - `docs/plans/2026-11-10-agent-control-ui-api-mcp-parity.md`, `docs/plans/2026-11-24-mcp-history-validation-proof-brief.md`.
  - `src/server/referenceRoutes.ts`, `server.ts`, `src/lib/agentHistory.ts`, `src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `scripts/action-receipt-coverage-audit.ts`, `scripts/mcp-capability-selftest.ts`, `scripts/route-integration.mjs`.
- **In scope:**
  1. `src/lib/agentHistory.ts`: add `'/api/agent/reference/simulate-diff'` to `LEDGER_QUIET_ROUTES`.
  2. `src/server/referenceRoutes.ts` & `server.ts`: export `respondAgentReferenceStatus`, `respondAgentEffectiveReferenceFile`, `respondAgentReferenceSuggest`, and `respondAgentSimulateDiff` (redacting host filesystem `root` / `manifest.root` and enforcing `400 CAPABILITY_INPUT_INVALID` on undeclared/invalid parameters), register top-level `/api/agent/reference/status|effective-file|suggest|simulate-diff` routes in `server.ts`, and add strict query validation on `GET /api/agent/object-index`.
  3. `src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`: register sorted `patch.diff.simulate@1`, `reference.file.read@1`, `reference.objects.search@1`, `reference.status.read@1`, `reference.suggest@1`, and `runtime.log.diagnose@1` (`FORGE_CAPABILITIES` `38 -> 44`, non-native `35 -> 41`), omitting volatile `generatedAt` declarations from hashed capability `outputSchema` properties (`additionalProperties: true` preserves runtime response shape), and update `FORGE_UI_ACTION_PARITY_CENSUS` rows (`diagnostics.patch_readiness.check`, `reference.corpus.browse_and_search`, `runtime.logs_and_probes.diagnose`).
  4. `vscode-extension/mcp/x4forge-mcp.cjs` (`MCP_MODULE_AUDIT_VERSION` `26 -> 27`, `38 -> 44` MCP tools), `config/forge-route-dispositions.json` (`332 -> 336` literal routes), `config/action-receipt-coverage.json` (`105 -> 106` routes / `69` surfaces) + `src/lib/actionReceiptPolicyBundle.ts` & `.selftest.ts`, `scripts/mcp-capability-selftest.ts`, and `scripts/route-integration.mjs`.
- **Out of scope:**
  - Mutating file/workspace/snapshot/revert MCP tools (`#19` P4 Slice 3).
  - Modifying live Forge, `FORGE DEVELOPMENT` IDE (`0.0.89`), `AiLive`, X4 game installation, or saves.
- **Rollback / checkpoint:** Clean pushed `origin/main` checkpoint `91225a64745afa9694eec772a9789f528e48b408` (`Quality` CI `45357444633` `success`).

## 2. Baseline

- **Revision:** `91225a64745afa9694eec772a9789f528e48b408` on `main` (`HEAD == origin/main`), `Quality` CI `45357444633` `success`.
- **Governance state:** `38` capabilities, `332` literal routes, `38` MCP aliases (`MCP_MODULE_AUDIT_VERSION = 26`), `105` receipt-coverage routes / `69` surfaces.

## 3. Reconciliation

- **Resources & couplings checked:**
  - `src/lib/agentCapabilityAuthority.ts:194` & `scripts/mcp-capability-selftest.ts:1295, 1984`: `public: true` capabilities cannot be narrowed out of custom `exact` keys; binding all new reference/diff capabilities to protected `/api/agent/reference/*` routes (`public: false`) preserves exact least-privilege on narrowed keys (`CUSTOM_TOOLS` `inventory=5`, `expression-check-only` `inventory=3`) while leaving `/api/reference/*` untouched for Studio and discovery.
  - `scripts/capability-contract-audit.ts`: `externalAgents` `server.ts::app.get/post(...)` semantic anchors require top-level Express route registrations in `server.ts`, and `surfaces.ui` anchors must mark compatibility routes (`/api/reference/*`) as `disconnected(...)` documenting the shared engine owner when the canonical agent route uses `/api/agent/reference/*`.
  - `scripts/action-receipt-coverage-audit.ts`: promoting `POST /api/agent/log-diagnose` to `canonical-capability` and adding `POST /api/agent/reference/simulate-diff` (`LEDGER_QUIET_ROUTES`) updates `config/action-receipt-coverage.json` (`105 -> 106` routes, `69` surfaces) and `src/lib/actionReceiptPolicyBundle.ts` + `.selftest.ts` (both lines `95-96` and `184`).
  - `src/lib/forgeCapabilities.selftest.ts:70`: `canonicalCapabilityContractPayload()` forbids `generatedAt` and `timestamp` substrings inside hashed capability descriptors.
  - `scripts/c06-contracts.selftest.ts:113-115`: `validateProjectApiBody('/api/agent/log-diagnose', ...)` already enforces `['tail', 'modId']` on `POST /api/agent/log-diagnose` (`196/196` preserved).
- **Capability-map delta:** Adds `patch.diff.simulate@1`, `reference.file.read@1`, `reference.objects.search@1`, `reference.status.read@1`, `reference.suggest@1`, and `runtime.log.diagnose@1` (`38 -> 44` capabilities, `38 -> 44` MCP tools, `332 -> 336` literal routes, `105 -> 106` receipt-coverage routes).

## 4. Implementation Summary

- **`src/server/referenceRoutes.ts` & `server.ts`:** Exported `respondAgentReferenceStatus`, `respondAgentEffectiveReferenceFile`, `respondAgentReferenceSuggest`, and `respondAgentSimulateDiff` sharing the canonical corpus/manifest/diff/suggest engines with `/api/reference/*` while redacting host `root` / `manifest.root` and enforcing `400 CAPABILITY_INPUT_INVALID` on invalid or undeclared fields; registered top-level `GET /api/agent/reference/status`, `GET /api/agent/reference/effective-file`, `GET /api/agent/reference/suggest`, and `POST /api/agent/reference/simulate-diff` in `server.ts`, plus strict query validation on `GET /api/agent/object-index`.
- **`src/lib/agentHistory.ts`:** Added `'/api/agent/reference/simulate-diff'` to `LEDGER_QUIET_ROUTES`.
- **`src/lib/forgeCapabilities.ts` & `src/lib/forgeCapabilities.selftest.ts`:** Registered sorted `patch.diff.simulate@1`, `reference.file.read@1`, `reference.objects.search@1`, `reference.status.read@1`, `reference.suggest@1`, and `runtime.log.diagnose@1` (`38 -> 44`, Contract SHA-256 `3efa3148b535c740de21ad93a5b39a791d3181478f86bc16c86e13b5d8cbd264`, `69/69` selftests), and updated `FORGE_UI_ACTION_PARITY_CENSUS` (`SHA-256: 1065a95bfd4616ea0fd98c94e45c0bc2ebba317b1d8dfd93c3357179b2012d32`).
- **`vscode-extension/mcp/x4forge-mcp.cjs` & `scripts/capability-contract-audit.ts`:** Added `get_reference_status`, `search_reference_symbols`, `read_reference_file` (`256 KiB` output cap), `search_x4_objects` (`limit <= 200`, host `roots` omitted), `simulate_xml_diff` (`512 KiB` input / `256 KiB` output cap), and `diagnose_game_log` (`512 KiB` input cap) (`MCP_MODULE_AUDIT_VERSION = 27`, `44` MCP aliases).
- **Manifests & Suites:** Promoted `config/forge-route-dispositions.json` (`522a51a514a0894b77a12ff9dbeb16e8597a288a0866426d67c0d7280609c686`, `336` routes) and `config/action-receipt-coverage.json` (`manifestSha256: 079c05eda00198285061b0decea21aacf0982e719aacc4a2f860d1be89edb8ae`, `106` routes / `69` surfaces) + `src/lib/actionReceiptPolicyBundle.ts` & `.selftest.ts`, and expanded `scripts/mcp-capability-selftest.ts` and `scripts/route-integration.mjs` (`690/690`).

## 5. Validation Evidence

- `npm run lint -- --max-warnings 600`: `PASS` (`0` errors, `584` warnings).
- `npm run typecheck`: `PASS` (`0` errors).
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities`: `PASS` (`44` capabilities, `336` disposed literal routes, `1` reviewed dynamic registrar, `44` MCP aliases, `51` UI-action parity rows; Contract SHA-256 `3efa3148b535c740de21ad93a5b39a791d3181478f86bc16c86e13b5d8cbd264`, UI-action parity SHA-256 `1065a95bfd4616ea0fd98c94e45c0bc2ebba317b1d8dfd93c3357179b2012d32`).
- `npm run test:writers`: `30/30` + `PASS` (`50` raw FS, `12` host-store, `4` browser-output, `3` SQLite owners) + `durableWrite 8/8`.
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest`: `PASS` (`106` routes / `69` surfaces, `79/79` + `23/23`).
- `npx tsx scripts/c06-contracts.selftest.ts`: `196/196 PASS`.
- `runForgeCapabilitiesSelftest`: `69/69 PASS`.
- `npm run test:mcp-capabilities`: `PASS` (`read=23, write=28, deploy=29`, `CUSTOM_TOOLS=5`, `LEGACY_TOOLS=10`, positive stdio MCP calls, `-32602` schema/stale-authority rejections, `outage` sticky-live withdrawal, `md-navigation-mcp`, `ai-navigation-mcp`, `native-performance-mcp 30/30`).
- `npm run test:native-deploy-mcp`: `6/6 PASS`.
- `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00' npm run test:reference-api`: `93/93 PASS`.
- `npm run test:oracles`: `134/134 green`.
- `npm run test:routes` (`X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset): `690/690 PASS` (including `agent_reference_status_requires_auth_and_redacts_host_roots`, `agent_reference_effective_file_redacts_root_and_rejects_unknown_query`, `agent_reference_suggest_returns_ranked_symbols_and_validates_inputs`, `agent_object_index_returns_bounded_items_and_rejects_oversize_limit`, `agent_simulate_diff_applies_in_memory_and_rejects_undeclared_fields`, `agent_log_diagnose_returns_hypotheses_and_raw_engine_id_leaks`, and `all_canonical_capability_outputs_exercised` across all `44` capabilities).
- `npm run precommit:check`: `[precommit] OK`.

## 6. Review & Close

- **Status:** `PARTIAL` overall (`VERIFIED` across source, governance manifests, `134/134` oracles, `690/690` isolated HTTP routes, `93/93` X4 9.00 reference API checks, and real stdio MCP; installed `0.0.94` IDE/E2E qualification remains gated on Ken's `0.0.94` release window).
- **Suggested commit title:** `feat(mcp): project reference corpus, object index, diff simulation, and log diagnosis (#19)`

## 7. After-Action Review (Triggered)

- **Triggers:**
  1. `capability-contract-audit.ts --generate-candidate` refused initial `/api/reference/suggest|simulate-diff` anchors (`task-6423`) because `externalAgents` semantic anchors must resolve to top-level `server.ts::app.get/post(...)` calls and `surfaces.ui` cannot claim `connected` on a different normalized path -> exported clean `/api/agent/reference/*` handler adapters registered in `server.ts`.
  2. `action-receipt-coverage-audit.ts --promote-candidate` initially received an empty hash when parsing `.candidateSha256` instead of `.envelopeSha256` (`task-6473`), and `actionReceiptPolicyBundle.selftest.ts` had a second hardcoded `routeCount === 105` in `later_load_is_not_poisoned` (`line 184`, caught immediately by `test:action-receipt-coverage:selftest` in `task-6496`).
  3. `test:oracles` (`task-6534`) caught `generatedAt` declared in `reference.objects.search` and `reference.status.read` `outputSchema` (`no volatile timestamp field` in `forgeCapabilities.selftest.ts:70`), and `test:routes` (`task-6573`) caught `item.id` vs `item.label` in our new `agent_reference_suggest_returns_ranked_symbols_and_validates_inputs` test (`689/690` -> `690/690 PASS`).
- **Points to sustain:**
  - Running `npm run test:action-receipt-coverage:selftest`, `npm run test:oracles`, and `npm run test:routes` caught all three subtle contract/test assertions before commit/push, with `#48`'s `compactCandidateSelftest` (`d220464`) pinpointing `policyBundle:later_load_is_not_poisoned` on the first line.
  - Binding all six tools to protected `public: false` `/api/agent/...` routes kept narrowed custom keys (`CUSTOM_TOOLS` `inventory=5`) completely isolated while leaving Studio `/api/reference/*` routes 100% compatible.
- **Points to improve — work/approach:**
  - When updating `src/lib/actionReceiptPolicyBundle.selftest.ts` `routeCount`/`surfaceCount`, update both `bundled_policy_positive_counts` (`lines 95-97`) and `later_load_is_not_poisoned` (`lines 184-185`) in the same edit, and never declare `generatedAt` or `timestamp` property names inside `FORGE_CAPABILITIES` `outputSchema`.
- **Points to improve — tools:**
  - `src/lib/forgeCapabilities.selftest.ts` exports `runForgeCapabilitiesSelftest()` without a direct CLI entry block (`if (invokedDirectly) ...`), so running `npx tsx src/lib/forgeCapabilities.selftest.ts` exits `0` without executing checks; always invoke `runForgeCapabilitiesSelftest()` via `node --import tsx --input-type=module -e` or `npm run test:oracles`.
- **Highest-risk observed weakness:**
  - `src/lib/forgeCapabilities.selftest.ts` silently exiting `0` when run directly via `tsx` can give a false sense of early validation before `test:oracles` runs; mitigated by invoking `runForgeCapabilitiesSelftest()` explicitly during focused capability checks.
