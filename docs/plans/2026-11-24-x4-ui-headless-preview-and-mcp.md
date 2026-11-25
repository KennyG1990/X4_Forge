# Plan: Headless X4 UI Lua Preview/Verify Service, Agent API, MCP Projection & CLI (`#59` FF-20 + `#19`)

- **Status:** `VERIFIED` (`Unit 45` Dev source, X4 9.00 canonical corpus, HTTP/MCP/CLI, `precommit:check`, and live `FORGE DEVELOPMENT` IDE `PID 47032` reload; `#59` & `#19` remain `PARTIAL` pending `0.0.94` public Open VSX VSIX qualification)
- **Date:** 2026-11-24
- **Owner:** Forge QA Agent (`Unit 45`)
- **Lane:** `FULL`
- **Related Issues:** `#59` (`FF-20`: X4 UI builder agent 403, shared-frame/helper-wrapper preview gap, headless CLI), `#19` (Agent API & MCP capability convergence), `#41` (X4 UI layout model & linter-first validation)

## 1. Bounded Scope & Non-Goals

### In Scope
1. **Headless X4 UI Preview & Verification Service (`src/server/x4UiHeadlessPreview.ts`):**
   - Reuse `buildX4UiCallModel` (`src/lib/x4UiCallModel.ts`), `lintX4UiCallModel` (`src/lib/x4UiLint.ts`), `createX4UiLayoutTargetCatalog` + `projectX4UiLayoutProgram` (`src/lib/x4UiLayoutProgram.ts`), `buildX4UiPreviewProfile` (`src/lib/x4UiPreviewPipeline.ts`), `projectX4UiScene` (`src/lib/x4UiScene.ts`), and `loadCanonicalX4UiCorpusAssets` + `loadCanonicalX4UiCorpusColorEvidence` (`src/lib/x4UiCorpusAssets.ts`).
   - Provide an in-process, reference-root-cached `X4UiCorpusTransport` reading canonical X4 9.00 Zekton font/Lua/color assets from `resolveXsdConfig().x4ReferenceRoot` when configured, degrading cleanly to CallModel + Lint + Layout Program diagnostics when canonical corpus assets are absent.
   - Support ergonomic `fixture` bindings (`samples`, `loops`, `drawable`, `uiScale`, `frameParameter`) mapped onto owner-issued `sampleCatalog` and `previewLoopCatalog` IDs across a 2-pass projection, with `localExpansion: { maxDepth: 4, maxInvocations: 16 }` enabled by default so local helper wrappers around `addTable`/`addRow`/`createText` expand automatically.
   - Support **shared-hub frame-parameter tab modules** (`function Tab.render(frame, ...)` / `local function draw(frame, ...)` where `Helper.createFrameHandle` lives in a separate hub file) via an append-at-EOF `previewHarness: 'shared-frame-parameter'` wrapper that preserves 1-based line and 0-based column coordinates of every authored statement while keeping `lint` grounded on the unmodified Lua text.
   - Extract bounded, deterministic geometry diagnostics: `tables` (column/row counts, widths, heights, scroll/frame-bound checks), `clippedText` (`truncated`/`overflow` Zekton text lines), `overlaps` (sibling frame/table bounding-box intersections), and `unresolvedSamples`.
2. **Reviewed Agent API & MCP Capability (`ui.lua.preview@1` / `POST /api/agent/ui/preview` / `preview_x4_ui_lua`):**
   - Register `ui.lua.preview@1` (`agentScopes: ['read', 'write', 'deploy']`, `workspace: 'optional'`, `effects: ['read', 'analyze']`) in `src/lib/forgeCapabilities.ts` (`editors.ui_lua.author`), `LEDGER_QUIET_ROUTES` (`src/lib/agentHistory.ts`), `durableKeyRoute` + `POST /api/agent/ui/preview` (`server.ts`, supporting `mode: 'inline' | 'workspace'`), and `vscode-extension/mcp/x4forge-mcp.cjs` (`preview_x4_ui_lua`, `MCP_MODULE_AUDIT_VERSION = 43`).
   - Promote `config/durable-writers.json`, `config/forge-route-dispositions.json`, and `config/action-receipt-coverage.json` + `src/lib/actionReceiptPolicyBundle.ts`.
3. **Headless CLI (`scripts/x4-ui-preview.ts` — `npm run preview:ui` & `npm run test:ui-preview`):**
   - Support `npx tsx scripts/x4-ui-preview.ts <file.lua> [--fixture <state.json>] [--target <name>] [--frame-param <name>] [--width <px>] [--height <px>] [--ui-scale <n>] [--reference-root <dir>] [--json] [--fail-on-error] [--fail-on-clip] [--fail-on-overlap]` plus `--selftest` wired into `.github/workflows/quality.yml`.

### Out of Scope
- Cross-file `require()` execution or full Lua VM interpretation (Forge's CallModel + LayoutProgram remain static/symbolic with explicit `fixture` sample bindings and `NOT_VERIFIED_IN_GAME` truth labels).
- Browser PNG rasterization on the server (geometry, Zekton text metrics, clipping, overlaps, and table limits are computed deterministically from `X4UiScene`).

## 2. Acceptance Criteria & Negative Paths
1. `deploy`-, `write`-, and `read`-scoped agent keys succeed (`200 OK`) on `POST /api/agent/ui/preview` and MCP `preview_x4_ui_lua` (eliminating `#59`'s `403 AUTHORITY_ROUTE_UNREVIEWED`).
2. Direct `Helper.createFrameHandle` menus, local helper wrappers (`turnRow(frame, ...)`), and shared-hub frame-parameter tab modules (`function Tab.draw(frame, state)`) project tables, rows, Zekton clipped/truncated text, sibling overlaps, and `24`-column / `editbox` lint findings accurately while preserving authored line numbers.
3. `fixture.samples` binds plain expression names (`runtimeColumns`, `dynamicText`, etc.) and `fixture.loops` binds loop iteration counts cleanly.
4. **Negative paths:** Unauthenticated requests return `401`; unknown body properties, invalid `mode`, traversal paths (`../`), or workspace mode without an addressed workspace return `400`/`409` without leaking host paths; unparseable Lua returns structured `parsed: false` diagnostics without HTTP `500`.
5. Live `FORGE DEVELOPMENT` IDE (`G:\Forge-QA\development-ide`) hot-reloads into `110` capabilities and serves `POST /api/agent/ui/preview` live.

## 3. Planned Rollback
- Revert the single bounded Unit 45 commit across `src/server/x4UiHeadlessPreview.ts`, `scripts/x4-ui-preview.ts`, `src/lib/forgeCapabilities.ts`, `src/lib/forgeCapabilities.selftest.ts`, `src/lib/agentHistory.ts`, `server.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/route-integration.mjs`, `.github/workflows/quality.yml`, `package.json`, and the reviewed `config/*.json` manifests.

## 4. Implementation, Validation, Review & Close (`Unit 45`)

- **Baseline:** `ab113241ae74e6e4238160fb4659a14993efc6b9` (`Unit 44`, clean working tree; `config/durable-writers.json` `sourceFingerprint: 0350c67b6812482b04a227277fc50b1e09e339e2b0b4e80e49ce38c223765052`, `50` raw writers unchanged).
- **Reconciliation & Capability-Map Delta:**
  - Reused `buildX4UiCallModel`, `lintX4UiCallModel`, `createX4UiLayoutTargetCatalog`, `projectX4UiLayoutProgram`, `buildX4UiPreviewProfile`, `projectX4UiScene`, `loadCanonicalX4UiCorpusAssets`, and `loadCanonicalX4UiCorpusColorEvidence` (`0` new raw `fs.*` writer calls).
  - Registered `ui.lua.preview@1` (`POST /api/agent/ui/preview`, `preview_x4_ui_lua` stdio MCP tool, `preview:ui` CLI; `109 -> 110` capabilities, `398 -> 399` routes, `110 -> 111` MCP aliases, `MCP_MODULE_AUDIT_VERSION = 43`, Contract SHA-256 `b4cd6de627c1f93f5a0ad7de11a5ceff012955b4d492cd89c8e0b698e7145374`, UI-action parity SHA-256 `a3fe2187a8dee22e79d69457eca176255ba55703a4f4619215df44398956e73a`), promoted `config/forge-route-dispositions.json` (`SHA-256: 948ff16c73342593bc329ab2d5d262aa201d33051b5bc56a5baa439d2a0cd2a6`) and `config/action-receipt-coverage.json` (`manifestSha256: e3b54de5d3bd0017447caa910ff8ddb6835bf458ed5f05258040ff033aa3e6be`, `140` routes / `69` surfaces).
- **Validation Evidence (Post-Final-Edit):**
  - `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00' npm run test:ui-preview` -> `8/8 PASS (canonicalCorpus=true)` (direct menu, `25`-col/`editbox` lint, Zekton clipped/truncated text, sibling overlap, local helper `turnRow(frame, ...)` expansion, shared-frame `M.renderTab(frame, ...)` preserving exact authored line `3`, multi-pass `loops` + `samples` binding, CLI `--fail-on-clip` exit `2`).
  - `npm run typecheck` -> exit `0`.
  - `npm run lint -- --max-warnings 600` -> exit `0` (`0` errors, `578` warnings).
  - `npm run test:writers` -> `30/30 + PASS + 8/8` (`50` raw writers & `0350c67b...` unchanged).
  - `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`110` capabilities, `399` routes, `111` MCP aliases).
  - `npm run test:mcp-capabilities` -> `PASS` (`read=65, write=70, deploy=71`).
  - `npm run test:action-receipt-coverage` + `:selftest` -> `79/79` + `23/23 PASS`.
  - `npm run test:workspace-files-mcp` -> `18/18 PASS` (includes real stdio MCP `preview_x4_ui_lua` call).
  - `npm run test:oracles` -> `134/134 PASS`.
  - `npm run test:routes` (`X4_*` env unset) -> `796/796 PASS` (includes `deploy`-/`read`-scope `POST /api/agent/ui/preview`, JSON Schema output envelope check, `400 CAPABILITY_INPUT_INVALID` unknown-field rejection, and `403 PATH_TRAVERSAL_FORBIDDEN` traversal rejection).
  - `npm run precommit:check` -> `[precommit] OK`.
  - Live `FORGE DEVELOPMENT` IDE (`G:\Forge-QA\development-ide`, `Reload-FORGE-DEVELOPMENT.ps1 -Reason unit45-ui-preview`): graceful sentinel reload `PID 59320 -> 47032` on `http://127.0.0.1:56304`, serving `110` capabilities (`contractHash=b4cd6de627c1f93f5a0ad7de11a5ceff012955b4d492cd89c8e0b698e7145374`, `censusHash=a3fe2187a8dee22e79d69457eca176255ba55703a4f4619215df44398956e73a`).
- **Final Status:** `VERIFIED` (Dev source, canonical X4 9.00 corpus, HTTP/MCP/CLI, `precommit:check`, and live `FORGE DEVELOPMENT` reload; `#59` & `#19` remain `PARTIAL` pending `0.0.94` public Open VSX VSIX qualification).
- **Suggested Commit Title:** `feat(ui-preview): add headless X4 UI Lua preview service, API, MCP tool, and CLI (#59)`

## 5. Triggered AAR

1. **Triggers:**
   - Multi-pass `projectX4UiLayoutProgram` ordering required running `fixture.loops` (`samples = undefined`) before binding `fixture.samples` so per-iteration loop sample IDs populate first; parameter-table helpers (`turnRow(frame, { ... })`) required automatic fallback when `localExpansion` fails to substitute a table parameter; `ForgeJsonSchema` rejected `minLength`/`const`; and `scripts/route-integration.mjs` initially referenced `.body` instead of `.json` on `req(...)` return values (`793/796` -> `796/796`).
2. **Points to sustain:**
   - Same-line signature rewrite + wrapper injection immediately before top-level `return` for `previewHarness: 'shared-frame-parameter'` preserved 100% exact 1-based authored Lua line numbers across every downstream table, row, text, and lint diagnostic while keeping `lintX4UiCallModel` grounded on unmodified source bytes.
   - `Reload-FORGE-DEVELOPMENT.ps1` gracefully hot-reloaded the live `FORGE DEVELOPMENT` Antigravity IDE sidecar (`PID 59320 -> 47032`) into `110` capabilities in `< 2 s`.
3. **Points to improve — work/approach:**
   - In `scripts/route-integration.mjs`, `req(...)` inside the Slice 10+ block returns `{ status, json }`, whereas earlier helper blocks return `{ status, body }` — always check surrounding `req(...)` consumers before writing assertions.
4. **Points to improve — tools / Highest-risk evidenced weakness:**
   - `No evidenced risk delta` (`test:ui-preview`, `test:workspace-files-mcp`, and `test:routes` now lock `previewX4UiLua`, `preview_x4_ui_lua`, and `POST /api/agent/ui/preview` end to end).
