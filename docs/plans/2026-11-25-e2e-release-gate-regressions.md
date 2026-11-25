# Plan: Resolve `0.0.94` Full-Suite Playwright E2E Release-Gate Regressions (`Unit 48`)

- **Status:** `VERIFIED` (`151/151` full Playwright E2E `VERDICT: PASS`, `134/134` oracles, `798/798` routes, `30/30 + PASS + 8/8` writers, `precommit:check`, and live `FORGE DEVELOPMENT` hot-reload)
- **Date:** 2026-11-25
- **Owner:** Forge QA Agent (`Unit 48`)
- **Lane:** `FULL`
- **Related Issues:** `#8` (Compact Grid View `data-testid` prefix hygiene), `#124` / Unit 39 (Unified IDE Workbench selector & mouse-propagation contracts), `#138` (`POST /api/agent/project/validate` deterministic warm-response receipt reuse)

## 1. Baseline & Reconciliation

- **Baseline:** `12dac663b90f1f880ce0c3a767e00f0fbdbe6257` (`Unit 47`, clean worktree, `HEAD == origin/main`; GitHub Actions `Quality` run `45550923121` `SUCCESS`; `134/134` oracles, `798/798` routes).
- **Reproduced Full-Suite E2E Gate Result (`task-13091`, `144/151` passed, `7` failed, `0` flaky):**
  1. **`[REPRODUCED]` `continuous-polling.spec.ts:514,543,556` (`3 -> 6` and `1424 -> 2848` rendered node count):**
     - `renderedCanvasNodeCount` (`continuous-polling.spec.ts:132`) counts `page.locator('[data-testid^="canvas-node-"]')`.
     - Unit 47 added `data-testid="canvas-node-props-preview"` inside each non-compact node card (`src/components/Canvas.tsx:2444`), matching the `canvas-node-` prefix and doubling every count.
  2. **`[REPRODUCED]` `diagnostic-suppression.spec.ts:195` (`Delete Node` click on unselected node `ev` does not delete):**
     - None of the 3 node-header action buttons (`Attach sticky-note annotation`, `Simulate Event from this step specifically`, `Delete Node` in `src/components/Canvas.tsx:2398-2439`) called `onMouseDown={(e) => e.stopPropagation()}`.
     - Pressing `mousedown` on `Delete Node` bubbled into `handleNodeMouseDown(node.id, e)` (`Canvas.tsx:441`), which selected `node` (`scale-[1.015]`), started `draggedNodeId`, and opened the `340px` Right Contextual Inspector synchronously before `mouseup` — shifting the `20px` button out from under the cursor so `onClick` never fired (`button "Delete Node" [active]`, `Minimap (3)`).
  3. **`[REPRODUCED]` `corpus-authoring.spec.ts:175,204,238` (`button[title="Wares & Jobs"]` / `button[title="XML Patching"]` timeout):**
     - Unit 39 (`30f30e1`) changed `WorkspaceNavigationBar.tsx:144` from `title={item.label}` to `title={`${item.label} — drag to reorder`}`.
  4. **`[REPRODUCED]` `diagnostic-suppression.spec.ts:379` (`geometry.footer` null):**
     - Unit 39 (`30f30e1`) changed `Sidebar.tsx:1375` footer text from `'Engine Context: Egosoft MD 4.5'` to `'Egosoft MD 4.5 · Selection opens Right Inspector'`, breaking the diagnostics scroll-containment footer boundary lookup (`diagnostic-suppression.spec.ts:547`).
  5. **`[REPRODUCED]` `incremental-project.spec.ts:9` (`C05` `expect(warm).toEqual(cold)` & revert-to-original equality):**
     - Unit 18 (`0fb55f9`, `#138`) attached `validationReceipt` (`validatedAt: new Date().toISOString()` and `receiptHash`) to `POST /api/agent/project/validate` (`server.ts:13253`), causing identical inline `project-validate` calls `150ms` apart to differ on `validatedAt` and `receiptHash`.
- **Capability-Map & Writer Couplings:**
  - `no capability-map delta` (`111` capabilities, `400` routes, `112` MCP aliases unchanged).
  - `0` new raw `fs.*` writer calls and `0` new `hostStores` calls; editing `src/components/Sidebar.tsx` and `server.ts` requires updating `sourceFingerprint` in `config/durable-writers.json` and promoting `config/action-receipt-coverage.json` + `ACTION_RECEIPT_COVERAGE_REVIEWED_MANIFEST_SHA256` (`src/lib/actionReceiptPolicyBundle.ts`).

## 2. Bounded Scope & Non-Goals

### In Scope
1. **`src/components/Canvas.tsx` + `tests/e2e/ide-workbench.spec.ts`:**
   - Rename `data-testid="canvas-node-props-preview"` to `data-testid="canvas-props-preview"`.
   - Add `onMouseDown={(e) => e.stopPropagation()}` on all 3 node-header action buttons (`Attach sticky-note annotation`, `Simulate Event from this step specifically`, `Delete Node`).
2. **`src/components/WorkspaceNavigationBar.tsx`:**
   - Restore `title={item.label}` on workspace navigation buttons (placing `"Drag to reorder"` on the grip icon).
3. **`src/components/Sidebar.tsx`:**
   - Restore `'Engine Context: Egosoft MD 4.5'` as the Sidebar footer text while retaining compact workbench styling.
4. **`server.ts` + `config/durable-writers.json` + `config/action-receipt-coverage.json` + `src/lib/actionReceiptPolicyBundle.ts`:**
   - Add bounded (`<= 256` entries) content-addressed `projectValidateReceiptCache` inside `recordValidationReceiptBestEffort` strictly for `input.surface === 'project-validate'` (leaving `deploy-verify` fresh per check) keyed by `(resultId, modId, verdict, outcome, sourceHash, diskSourceHash, artifactPlanHash, forgeVersion, errors, warnings, acceptedWarnings, unreviewedWarnings, coverageGaps, unavailableChecks)`, while still recording `validationReceiptStore.record(receipt)` on every call so `GET /api/agent/validation/last` always reflects the latest evaluated source slot.
   - Sync `config/durable-writers.json` `sourceFingerprint` and `config/action-receipt-coverage.json` + `ACTION_RECEIPT_COVERAGE_REVIEWED_MANIFEST_SHA256`.

### Out of Scope
- Weakening any assertion in `continuous-polling.spec.ts`, `corpus-authoring.spec.ts`, `diagnostic-suppression.spec.ts`, or `incremental-project.spec.ts`.
- Caching `surface === 'deploy-verify'` receipts (deploy gate checks remain timestamped per invocation).

## 3. Acceptance Contract & Required Validation

- Focused reproduction re-run of all 5 affected E2E spec files (`continuous-polling.spec.ts` lines 514-586, `corpus-authoring.spec.ts`, `diagnostic-suppression.spec.ts`, `incremental-project.spec.ts`, `ide-workbench.spec.ts`) -> `PASS`.
- Full unfiltered `npm run test:e2e` (`151/151` tests) -> `[run-e2e] VERDICT: PASS` (`0` failed, `0` flaky, `treeGone=true`).
- `npm run typecheck`, `npm run lint -- --max-warnings 600`, `npm run test:writers`, `npm run test:capabilities`, `npm run test:action-receipt-coverage`, `npm run test:action-receipt-coverage:selftest`, `npm run test:oracles` (`134/134`), `npm run test:routes` (`798/798`), and `npm run precommit:check` -> `PASS`.
- Negative check: `incremental-project.spec.ts` `edited` (`forge_invalid="yes"`) produces a distinct `sourceHash` and `receiptHash` (`!== cold.validationReceipt.receiptHash`), and reverting `md.content = original` restores exact `toEqual(cold)` equality while `route-integration.mjs` `#138` receipt freshness/supersession checks pass.

## 4. Planned Rollback
- Revert the single bounded Unit 48 commit across `src/components/Canvas.tsx`, `src/components/WorkspaceNavigationBar.tsx`, `src/components/Sidebar.tsx`, `server.ts`, and `tests/e2e/ide-workbench.spec.ts`.

## 5. Implementation, Validation, Review & Close (`Unit 48`)

- **What Changed:**
  - `src/components/Canvas.tsx` & `tests/e2e/ide-workbench.spec.ts`: renamed `data-testid="canvas-node-props-preview"` to `data-testid="canvas-props-preview"` so `[data-testid^="canvas-node-"]` counts rendered canvas nodes strictly 1:1 (`3` on `welcome`, `1424` on `dense`), and added `onMouseDown={(e) => e.stopPropagation()}` on all 3 node-header action buttons (`Attach sticky-note annotation`, `Simulate Event from this step specifically`, `Delete Node`) so clicking a header button on an unselected node never bubbles into `handleNodeMouseDown`, never starts a drag or duplicate `mouseup` checkpoint, and never pops open the `340px` Right Contextual Inspector mid-click before `mouseup`.
  - `src/components/WorkspaceNavigationBar.tsx`: restored `title={item.label}` on workspace navigation buttons (`Wares & Jobs`, `XML Patching`, etc.).
  - `src/components/Sidebar.tsx`: restored `'Engine Context: Egosoft MD 4.5'` as the Sidebar bottom-footer label while retaining compact workbench styling.
  - `server.ts`: added bounded (`<= 256` entries) content-addressed `projectValidateReceiptCache` inside `recordValidationReceiptBestEffort` strictly for `input.surface === 'project-validate'` (keyed by `resultId` + normalized `modId` + verdict/outcome + `sourceHash` + `diskSourceHash` + `artifactPlanHash` + `forgeVersion` + counts) while still calling `validationReceiptStore.record(receipt)` on every evaluation; `surface === 'deploy-verify'` remains fresh per invocation.
- **Reconciliation & Capability-Map Delta:**
  - `no capability-map delta` (`111` capabilities, `400` routes, `112` MCP aliases, `50` raw writers, `sourceFingerprint: 0350c67b6812482b04a227277fc50b1e09e339e2b0b4e80e49ce38c223765052`, and `config/action-receipt-coverage.json` `e3b54de5...` all unchanged).
- **Validation Evidence (Post-Final-Edit):**
  - `npm run typecheck` -> exit `0`.
  - `npm run lint -- --max-warnings 600` -> `0` errors (`578` warnings).
  - `npm run test:writers` -> `30/30 + PASS + 8/8`.
  - `npm run test:action-receipt-coverage` -> `PASS` (`140` routes / `69` surfaces).
  - Full unfiltered Playwright E2E gate (`X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00' npm run test:e2e`, `task-13186`) -> **`[run-e2e] VERDICT: PASS — 151 passed, 0 failed, 0 flaky, 0 bad-result`** (`18.2m`, `treeGone=true`).
  - `npm run test:oracles` -> **`134/134` green**.
  - `npm run test:routes` -> **`798/798 PASS`**.
  - `npm run precommit:check` -> `[precommit] OK`.
- **Suggested Commit Title:** `fix(workbench,validation): resolve E2E release-gate regressions on node header buttons, nav titles, and warm validation receipts`

## 6. Triggered AAR

1. **Triggers:**
   - (1) Full `151`-test `npm run test:e2e` pre-release gate (`task-13091`) caught `7` deterministic regressions (`3` `canvas-node-*` prefix collisions, `1` real UX bug where `Delete Node` `mousedown` bubbled to `handleNodeMouseDown` and opened the Right Contextual Inspector mid-click, `1` `WorkspaceNavigationBar` `title` change, `1` `Sidebar` footer boundary text change, and `1` `project-validate` `validationReceipt` timestamp inequality on `C05`); (2) initial `ide-workbench.spec.ts` edit missed line `89` (1 line above our `StartLine: 90` read), caught immediately in `task-13176` (`2.0m`).
2. **Points to sustain:**
   - Running the full unfiltered `151`-test `npm run test:e2e` gate before bumping `0.0.94` caught a genuine user-visible Canvas bug (first-click `Delete Node` on an unselected node failing to fire because `mousedown` opened the `340px` Right Inspector and shifted the Canvas) plus 3 subtle cross-suite DOM/API contracts before a single user received `0.0.94`.
3. **Points to improve — work/approach:**
   - Never name child elements inside Canvas node cards with the `canvas-node-` `data-testid` prefix (`[data-testid^="canvas-node-"]` is reserved for top-level node cards), always put `onMouseDown={(e) => e.stopPropagation()}` on interactive buttons inside draggable Canvas cards, and grep the entire test file (`git grep`) before replacing a `data-testid` rather than relying on a windowed `read_file` slice.
4. **Points to improve — tools / Highest-risk evidenced weakness:**
   - Subset E2E runs (`ide-workbench.spec.ts` + `canvas-coverage.spec.ts`) do not cover cross-surface layout/receipt contracts in `continuous-polling.spec.ts`, `corpus-authoring.spec.ts`, `diagnostic-suppression.spec.ts`, or `incremental-project.spec.ts`; keeping the full unfiltered `npm run test:e2e` gate mandatory before every Open VSX release prevents cross-suite drift from shipping.

