# Unit 35 Plan & Close — `#19` P4 Slice 12: Addressed Workspace Domain-Model Read & Explicit-Grant CAS Authoring over MCP + 3-Unit Release Readiness Review

- **Status:** `VERIFIED` (isolated Dev source, governance manifests, `134/134` oracles, `774/774` HTTP routes, and real stdio MCP `15/15`; overall `#19` remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification)
- **Date:** 2026-11-24
- **Lane:** `FULL`
- **Owning Issue:** `#19` (UI-Action Parity Census P4 Slice 12: `editors.aiscripts.author`, `editors.libraries.author`, `editors.translations.author`, `editors.ui_lua.author`, `editors.xml_patches.author`, `editors.md_canvas.author`)
- **Baseline HEAD:** `34d08ed63cc34980a04cc7878d573308d97ea6d4` (`Quality` CI run `45470301665` `SUCCESS`; `134/134` oracles, `771/771` routes, `92` capabilities, `93` MCP tools)

## 1. Scope, Non-Goals & Acceptance Contract

- **Bounded unit:** Project complete, host-path-redacted, domain-isolated readback (`workspace.domain.read@1` / `get_workspace_domain` -> `GET /api/agent/workspace/domain`) and explicit-grant CAS domain-model preview + merge (`workspace.domain.write@1` / `update_workspace_domain` -> `POST /api/agent/workspace/domain`) across all six Studio workspace domains (`aiscripts`, `libraries`, `md_graph`, `translations`, `ui_layout`, `xml_patches`), flipping four `FORGE_UI_ACTION_PARITY_CENSUS` rows (`editors.aiscripts.author`, `editors.libraries.author`, `editors.translations.author`, `editors.ui_lua.author`) from `partial` to `available` and upgrading `editors.xml_patches.author` and `editors.md_canvas.author`, followed by the mandatory **3-Unit Release Readiness Review** covering `1ab7b47`, `34d08ed`, and Unit 35.
- **Out of scope:** Browser-local React Canvas Undo/Redo (`editors.md_canvas.author`), `synthesize_xml_patch` payload size caps (`editors.xml_patches.author`), Studio-session-only `POST /api/agent/external-api/register` (`#31`), Open VSX publishing, and restarting `FORGE DEVELOPMENT` IDE (`PID 34076`).
- **Risks & authorization boundaries:**
  - Zero new raw `fs.*` writer calls (`config/durable-writers.json` remains at `50` raw writers, `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged).
  - Never expose `sourceFolder`, `sourceStamp`, or raw binary/oversized `passthroughFiles` in `workspace.domain.read@1` / `workspace.domain.write@1`; bound serialized responses at `512 KiB` UTF-8 (`413 WORKSPACE_DOMAIN_TOO_LARGE` instead of silent truncation).
  - Never permit `force: true` on `POST /api/agent/workspace/domain`; `apply: true` strictly requires an explicit `workspace.domain.write@1` grant (`WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`), a caller-owned `operationId`, and paired `expectedHead` + `expectedSnapshotHash` (or `expectedVersion`) CAS preconditions routed through `executeWorkspaceReceiptMutation` (`mode: 'merge'`, `merge: true`, `force: false`), preserving nested `compileSettings` and `uiTheme` fields and recording one-use `DestructiveRecoveryStore` workspace undo.
- **Planned rollback:** Restore touched source/manifest files from `34d08ed` via `git show HEAD:<path>` + `fs.writeFileSync` and remove `src/lib/workspaceDomainAuthoring.ts` + this plan file if needed before commit.

## 2. Reconciled Infrastructure Reused & Implemented Changes

- **Pure Domain Authoring Module (`src/lib/workspaceDomainAuthoring.ts`):**
  - Added `WORKSPACE_AUTHORING_DOMAINS` (`['aiscripts', 'libraries', 'md_graph', 'translations', 'ui_layout', 'xml_patches']`), `WORKSPACE_DOMAIN_MAX_RESPONSE_BYTES` (`512 * 1024`), `projectWorkspaceDomainData(sanitized, domain)`, `buildWorkspaceDomainMergePatch(currentSanitized, domain, rawChanges)` (enforcing strict per-domain field isolation, rejecting `NaN` / malformed items, and merging `compileSettings` and `uiTheme` against `currentSanitized` so partial domain patches never shallow-clobber sibling flags or theme colors), and `runWorkspaceDomainAuthoringSelftest()` wired into `runForgeCapabilitiesSelftest()` (`134/134` `SELFTESTS`).
- **Authority, Action Ledger & Server Routes (`src/lib/agentCapabilityAuthority.ts`, `src/lib/agentHistory.ts`, `server.ts`):**
  - Added `'workspace.domain.write'` to `WORKSPACE_FILES_EXPLICIT_GRANT_CAPABILITIES`, `{ method: 'POST', path: '/api/agent/workspace/domain', kind: 'workspace' }` to `LEDGER_ROUTES` + `describeAction`, `durableKeyRoute` coverage for `/api/agent/workspace/domain`, dry-run (`applied === false`) Action Ledger suppression, and `GET /api/agent/workspace/domain` + `POST /api/agent/workspace/domain` (delegating `apply: true` to `executeWorkspaceReceiptMutation`).
- **Canonical Capability Contract, UI-Action Parity Census & MCP Projection (`src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`):**
  - Registered `workspace.domain.read@1` (`get_workspace_domain`, `read`/`write`/`deploy` scopes) and `workspace.domain.write@1` (`update_workspace_domain`, explicit-grant `write`/`deploy` scopes) (`92 -> 94` capabilities, `93 -> 95` MCP tools, `MCP_MODULE_AUDIT_VERSION = 38`, Contract SHA-256 `cfade27181dbdc4206592a6ad1b1b02f1d166226573353345cc6c5b6126d7549`).
  - Flipped **`editors.aiscripts.author`**, **`editors.libraries.author`**, **`editors.translations.author`**, and **`editors.ui_lua.author`** from `partial` to **`available`** (`available: 19 -> 23`, `approvalRequired: 2`, `partial: 23 -> 19`, `missing: 7`, `openGaps: 30 -> 26`, UI-action parity SHA-256 `878dca143728751732871a1ef2a5b351df4d03efd9f82e30cbaadebbe0921851`), and upgraded `editors.md_canvas.author` and `editors.xml_patches.author`.
  - Promoted `config/forge-route-dispositions.json` (`383` literal routes, SHA-256 `a651ada0222aa116352389ab930665942856569b8b320a39e7c327b7439a86e5`) and `config/action-receipt-coverage.json` (`133` routes / `69` surfaces, `manifestSha256: ddd5f73321e65e2c8d5a74afd134ff4960398cd494e49d0d9bf3a5dc471d9253`, `envelopeSha256: 101d829e06b249e84ebb86fea470a63d6a0705d86e2f2bef96bb0171db5adc8e`).
- **Capability-Map Delta:** Added `workspace.domain.read@1` and `workspace.domain.write@1`; flipped 4 `canvas-and-domain-editors` rows to `available` (`23/51` `available`, `2` `approval-required`, `26` open gaps).

## 3. Validation Evidence

- `npm run lint -- --max-warnings 600` -> `PASS` (`0` errors, `579` warnings)
- `npm run typecheck` -> `PASS` (`0` errors)
- `npm run test:writers` -> `PASS` (`30/30` selftest, `50` raw filesystem writer sources, `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged, `durableWrite 8/8`)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`94` capabilities, `383` disposed routes, `95` MCP aliases, `51` UI-action parity rows)
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> `PASS` (`133` routes / `69` surfaces, `79/79` candidate invariants + `23/23` promotion selftests)
- `npx tsx scripts/c06-contracts.selftest.ts` -> `PASS` (`196/196`)
- `npx tsx scripts/c06-api.selftest.ts` -> `PASS` (`42/42`)
- `npm run test:mcp-capabilities` -> `PASS` (`read=49, write=54, deploy=55`, `30/30` native performance checks)
- `npm run test:native-deploy-mcp` -> `PASS` (`6/6`)
- `npm run test:workspace-files-mcp` -> `PASS` (`15/15`, including `15_workspace_domain_read_and_cas_domain_authoring_with_undo_over_mcp` across all 6 domains, cross-domain rejection, dry-run preview, stale CAS `409`, `apply: true` receipt commit, sibling `compileSettings` preservation, and one-use `revert_action_history` undo)
- `npm run build` -> `PASS` (`dist/index-*.js`, `dist/server.cjs`, `dist/canonical-md-worker.cjs`)
- `npm run test:oracles` -> `PASS` (`134/134` runtime selftest endpoints)
- `npm run test:routes` -> `PASS` (`774/774`, including `slice12_workspace_domain_read_and_cas_write_routes_isolate_domains_and_undo_cleanly` and `all_canonical_capability_outputs_exercised`)
- `npm run precommit:check` -> `PASS` (`[precommit] OK`)

## 4. Mandatory 3-Unit Release Readiness Review (Units 33–35: `1ab7b47`, `34d08ed`, Unit 35; `35` Units Since `0.0.93`)

- **Reviewed scope (`3` verified units since Review 32 at `2606b64`):**
  1. `1ab7b47` (`#19` P4 Slice 10 + `#75` + `#31`): External-API contract registry/draft derivation, installed loose/packed extension file reads, XML patch base-content & XPath completion, reference-manifest domain coverage, and UI Lua snippets/vanilla menu harvesting (`87` capabilities, `88` MCP tools, `Quality` `45462671652` `SUCCESS`).
  2. `34d08ed` (`#19` P4 Slice 11): Shared `forgeKnowledge.ts` wiki/shortcuts/onboarding queries, secret- & host-path-scrubbed diagnostic bug-report bundles, and runtime walkaround health card / `x4_forge_probe` preview / live `FORGE-STATE` inspection (`92` capabilities, `93` MCP tools, `Quality` `45470301665` `SUCCESS`).
  3. Unit 35 (`#19` P4 Slice 12): Addressed workspace domain-model read & explicit-grant CAS authoring (`get_workspace_domain`, `update_workspace_domain`), flipping 4 domain-editor parity rows to `available` (`94` capabilities, `95` MCP tools, `23/51` `available` + `2` `approval-required`, `134/134` oracles, `774/774` routes).
- **Readiness Verdict:** **`NOT_READY` for public `0.0.94` Open VSX publication or `FORGE DEVELOPMENT` IDE (`PID 34076`, `0.0.89`) upgrade.**
  - **Green layers:** Isolated Dev source, TypeScript, ESLint (`0` errors, `579/600` warnings), writer governance (`50` raw writers), capability & action-receipt manifests (`383` routes / `133` receipt-covered), `134/134` compiled runtime oracles, `774/774` external HTTP route checks, real stdio MCP suites (`6/6` + `15/15`), and GitHub Actions `Quality` CI.
  - **Missing gates keeping `0.0.94` `NOT_READY`:** Ken's explicit Machine-State Ask + Write Gate to run the full compiled Playwright E2E suite (`150/150`), build & inspect the candidate `0.0.94` VSIX (`vscode-extension/PUBLISHING.md`), upgrade `FORGE DEVELOPMENT` (`0.0.89 -> 0.0.94`) for installed Antigravity witness verification, and publish to Open VSX (`x4forge/x4-forge-studio`). Next 3-unit release review is due on **Unit 38**.

## 5. AAR (Triggered — Non-Clean)

1. **Triggers:**
   - First `action-receipt-coverage-audit.ts --candidate-selftest` run failed `later_load_is_not_poisoned` (`78/79`) because `src/lib/actionReceiptPolicyBundle.selftest.ts` asserts `routeCount` in two separate checks (`line 95` and `line 184`).
   - First `npm run test:routes` run failed `7` checks because `scripts/route-integration.mjs` needed `expectedCapabilityIds` updated (`line 826`), `mkKey(...).token` destructured (`line 7506`), and surplus `'analyze'` omitted from `allowedEffects` per `normalizeAgentCapabilityConstraint` (`src/lib/agentCapabilityAuthority.ts:176-179`).
2. **Points to sustain:**
   - Parameterizing all 6 Studio workspace domains behind two closed-input capabilities (`workspace.domain.read@1` / `workspace.domain.write@1`) flipped 4 UI-action parity rows to `available` while adding only `2` MCP tools instead of `12`, and `buildWorkspaceDomainMergePatch` prevented shallow-merge clobbering of sibling `compileSettings` and `uiTheme` properties.
3. **Points to improve — work/approach:**
   - Always update both `positive.routeCount` and `later.routeCount` in `src/lib/actionReceiptPolicyBundle.selftest.ts` before running `--candidate-selftest`, and compute custom-key `allowedEffects` in `scripts/route-integration.mjs` as the exact union of the granted capabilities' declared `effects` (`normalizeAgentCapabilityConstraint` rejects unused surplus effects).
4. **Points to improve — tools:**
   - None beyond documenting the exact-union `allowedEffects` rule in `SESSION-HANDOFF.md` Live Hazards.
5. **Highest-risk evidenced weakness:**
   - `executeWorkspaceReceiptMutation` (`server.ts:9486`) performs a top-level object spread (`{ ...beforeWorkspace, ...(incoming as object) }`), which would erase sibling nested properties on `compileSettings` or `uiTheme` if a domain writer emitted partial sub-objects. `buildWorkspaceDomainMergePatch` mitigates this by merging `compileSettings` and `uiTheme` against `currentSanitized` before returning the patch, verified by `preserves_sibling_compile_settings` and `preserves_sibling_ui_theme_fields`.
6. **Suggested commit title:** `feat(mcp): workspace domain-model read and explicit-grant CAS authoring (#19)`
