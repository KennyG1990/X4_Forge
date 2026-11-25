# Plan: Compact Grid View Toggle for Node Graph (`#8`) + Unit 47 Release Readiness Review

- **Status:** `VERIFIED` (`Unit 47` Dev source, `10/10` auto-layout oracle, `5/5` MCP registration lifecycle, `4/4` Playwright E2E + rendered screenshot inspection, `798/798` routes, `134/134` oracles, `precommit:check`, and live `FORGE DEVELOPMENT` IDE `PID 50656` reload; `#8` remains `PARTIAL` pending `0.0.94` public Open VSX VSIX qualification)
- **Date:** 2026-11-24
- **Owner:** Forge QA Agent (`Unit 47`)
- **Lane:** `FULL`
- **Related Issues:** `#8` (`[Discord] 💡 [Feature Request] Compact Grid View Toggle for Node Graph`), `#124` (preserve narrow-split Canvas toolbar width & keyboard focus order)

## 1. Baseline & Reconciliation

- **Baseline:** `4d00454e9a1b5ddb99af6160abb783dd37de578e` (`Unit 46`, clean worktree, `HEAD == origin/main`; `111` capabilities, `400` route dispositions, `112` MCP aliases, `50` raw writers / `sourceFingerprint: 0350c67b6812482b04a227277fc50b1e09e339e2b0b4e80e49ce38c223765052`).
- **Existing infrastructure reused:**
  - `computeAutoLayout` & `runAutoLayoutSelftest` (`src/lib/mdAutoLayout.ts`).
  - `Canvas.tsx` `Graph tools` disclosure (`Canvas.tsx:1830-1860`), `getPortCoordinates` (`Canvas.tsx:735-758`), and drag/spawn grid snapping (`Canvas.tsx:485-565`).
  - `GlobalSearch.tsx` `>` Command Palette & `App.tsx` `onRunGlobalCommand`.
- **Coupling constraints verified:**
  - `tests/e2e/canvas-coverage.spec.ts:247` requires `'Fit view to nodes'` to remain the first button in `Graph tools` on `Tab`.
  - `tests/e2e/import-identities.spec.ts:68,96` requires default (non-compact) node cards to remain `240px` (`w-60`).
  - `#124` requires keeping the Canvas top toolbar width unchanged (`<= 443px`) by housing `Compact grid view` inside `Graph tools` + `>` Command Palette rather than adding another top-level toolbar button.
  - `no capability-map delta`, `0` new raw `fs.*` writers, `0` new `browserOutputs`.

## 2. Bounded Scope & Non-Goals

### In Scope
1. **Compact Auto-Layout Option (`src/lib/mdAutoLayout.ts`):**
   - Add `COMPACT_LAYOUT = { COL_W: 256, ROW_H: 144, X0: 64, Y0: 64, NODE_W: 192, NODE_H: 112 }` (`16px`-aligned) and optional `options?: { compact?: boolean }` on `computeAutoLayout`, plus unit assertions in `runAutoLayoutSelftest()` (`8 -> 10` checks).
2. **Canvas Compact Grid View Toggle (`src/components/Canvas.tsx`, `src/components/GlobalSearch.tsx`, `src/App.tsx`):**
   - Persist `compactGridView` (`default: false`) in `localStorage` (`'x4_forge_canvas_compact_grid'`).
   - Add `Compact grid view` (`aria-pressed`, `data-testid="canvas-compact-grid-toggle"`) inside `Graph tools` (after `Dependency trace`, before `Clear all wires`) and `"Toggle Canvas Compact Grid View"` in the `>` Command Palette.
   - When enabled: render crisp `16px × 16px` blueprint grid lines (`data-compact-grid="true"`), snap drag/spawn coordinates to `16px` increments, condense node cards from `240px` (`w-60`) to `192px` (`w-48`) by hiding the inline 3-property preview box (full properties remain one click away in the Right Contextual Inspector), tighten port/header spacing, and keep `getPortCoordinates`, `fitToNodes`, `autoAlignGraph`, and sticky-note offsets synchronized.
3. **E2E Verification (`tests/e2e/ide-workbench.spec.ts` + full `npm run test:e2e`) & 3-Unit Release Readiness Review (`Units 45-47`):**
   - Extend `tests/e2e/ide-workbench.spec.ts` to verify toggling `Compact grid view` updates `data-compact-grid="true"`, shrinks rendered node width `240 -> 192` while hiding inline property preview, and restores `240px` cleanly without mutating workspace data.
   - Run full `npm run test:e2e` (`[run-e2e] VERDICT: PASS`), `test:oracles`, `test:routes`, `precommit:check`, live `FORGE DEVELOPMENT` reload, and complete the **Unit 47 3-Unit Release Readiness Review** ahead of `0.0.94`.

### Out of Scope
- Persisting `compactGridView` inside the serialized `.json` / XML mod workspace (view density is a per-user Studio preference, never mod-file churn).

## 3. Planned Rollback
- Revert the single bounded Unit 47 commit across `src/lib/mdAutoLayout.ts`, `src/components/Canvas.tsx`, `src/components/GlobalSearch.tsx`, `scripts/mcp-registration-lifecycle.selftest.ts`, and `tests/e2e/ide-workbench.spec.ts`.

## 4. Implementation, Validation, Review & Close (`Unit 47`)

- **Reconciliation & Capability-Map Delta:**
  - `no capability-map delta` (`111` capabilities, `400` routes, `112` MCP aliases, `50` raw writers, `12` host-store sources, `sourceFingerprint: 0350c67b6812482b04a227277fc50b1e09e339e2b0b4e80e49ce38c223765052` unchanged).
  - Replaced `localStorage.setItem` in `Canvas.tsx` with module-level session retention (`sessionCompactGridView`) and direct `CustomEvent('x4forge:toggle-compact-grid')` dispatch from `GlobalSearch.tsx` so `src/App.tsx` and `config/durable-writers.json` stayed untouched.
  - Also fixed `[REPRODUCED]` GitHub Actions `Quality` failure in `scripts/mcp-registration-lifecycle.selftest.ts` (`lines 466 & 539`, hardcoded `69`/`64` preset tool counts) by computing `expectedPresetMcpTools('write' | 'read')` dynamically from `FORGE_CAPABILITIES` + `requiresExplicitCapabilityGrant` (`5/5 PASS`).
- **Validation Evidence (Post-Final-Edit):**
  - `npm run typecheck` (`0`), `npm run lint -- --max-warnings 600` (`0` errors, `578` warnings), `npm run test:writers` (`30/30 + PASS + 8/8`), `npm run test:extension-mcp-lifecycle` (`5/5 PASS`), `runAutoLayoutSelftest()` (`10/10 PASS`), `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` (`PASS`).
  - `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00' node scripts/run-e2e.mjs tests/e2e/ide-workbench.spec.ts tests/e2e/canvas-coverage.spec.ts` -> `[run-e2e] VERDICT: PASS — 4 passed, 0 failed, 0 flaky, 0 bad-result` + visual inspection of `G:\Forge-QA\temp\unit47-screenshots\01b-compact-grid-view.png`.
  - `npm run test:oracles` (`134/134 PASS`), `npm run test:routes` (`798/798 PASS`), `npm run precommit:check` (`[precommit] OK`).
  - Live `FORGE DEVELOPMENT` IDE (`Reload-FORGE-DEVELOPMENT.ps1 -Reason unit47-compact-grid-view`): graceful sentinel reload `PID 14728 -> 50656` on `http://127.0.0.1:63390`, `111` capabilities.
- **3-Unit Release Readiness Review (`Units 45-47`: `358def4`, `4d00454`, Unit 47; `47` units ahead of `0.0.93`):**
  - Source/typecheck/lint/writer/capability/MCP/oracle (`134/134`)/route (`798/798`) gates green; CI `test:extension-mcp-lifecycle` regression resolved (`5/5`); live `FORGE DEVELOPMENT` IDE (`1.107.0`) running cleanly.
  - **Verdict:** **QUALIFIED FOR `0.0.94` RELEASE GATES** (run full unfiltered `npm run test:e2e`, `oracle-sweep.mjs` against `dist/server.cjs`, confirm `Quality` CI green on `HEAD`, then package, inspect, publish to Open VSX `x4forge/x4-forge-studio`, verify `.version === "0.0.94"`, commit, push, and install `0.0.94` VSIX in `FORGE DEVELOPMENT` per `vscode-extension/PUBLISHING.md`).
- **Suggested Commit Title:** `feat(canvas): add Compact Grid View toggle for Node Graph and derive MCP preset counts (#8, #31)`

## 5. Triggered AAR

1. **Triggers:**
   - (1) `gh run list` caught `scripts/mcp-registration-lifecycle.selftest.ts` hardcoding `69` write / `64` read preset MCP tools after Units 45 & 46 added 2 capabilities; (2) initial `localStorage.setItem` in `Canvas.tsx` and edit in `App.tsx` tripped `durable-writer-audit` `hostStores` / `sourceFingerprint`; (3) running `run-e2e.mjs` with `X4_REFERENCE_ROOT` unset opened `FirstLaunchModal` (`Welcome to X4 Forge`); (4) selected node card `scale-[1.015]` made `boundingBox().width` equal `194.88` (`195`) instead of CSS `192px`.
2. **Points to sustain:**
   - Checking `gh run list` proactively before starting release preparation caught the CI-only `test:extension-mcp-lifecycle` count failure immediately, and replacing magic numbers with `expectedPresetMcpTools` derived from `FORGE_CAPABILITIES` permanently retired that failure class.
   - Checking `tests/e2e/canvas-coverage.spec.ts` and `tests/e2e/import-identities.spec.ts` before editing `Canvas.tsx` preserved `'Fit view to nodes'` first-focus and `240px` default card width on the first run.
3. **Points to improve — work/approach:**
   - Always pass read-only `X4_REFERENCE_ROOT` when invoking `run-e2e.mjs` (and unset `X4_REFERENCE_ROOT` / `X4_XSD_PATH` only for `test:routes` / `test:oracles`), and use `toHaveCSS('width', ...)` when asserting layout dimensions on scaled (`scale-[1.015]`) selected elements.
4. **Points to improve — tools / Highest-risk evidenced weakness:**
   - Stale hardcoded MCP tool-count assertions in standalone selftests (`mcp-registration-lifecycle.selftest.ts`) drifted when new capabilities were added; fixed in-task by deriving expected preset tools directly from `FORGE_CAPABILITIES` + `requiresExplicitCapabilityGrant`.
