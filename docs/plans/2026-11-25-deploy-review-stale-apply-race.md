# Unit 62 — Eliminate Stale-Apply Unmount TOCTOU Race in `deploy-review.spec.ts`

Task: Replace two-step `isVisible() -> click()` / post-invalidation `locator.click()` TOCTOU races in `tests/e2e/deploy-review.spec.ts` with single-turn DOM click-if-mounted evaluation while preserving all `toHaveCount(0)` and zero-apply-request assertions
Lane: FULL | Status: SPECIFIED -> VERIFIED

## PLAN

- **Bounded unit:**
  - In `tests/e2e/deploy-review.spec.ts` (`lines 263` and `399`), after `roundTripWorkspaceSelection()` increments `window.__X4_WORKSPACE_CONTEXT__.getSelectionRevision()`, any concurrent `useContinuousPolling` re-render in `App.tsx` (`matchesCompileScope` at `line 1810`) or `PlaytestWorkspace.tsx` (`useLayoutEffect` at `line 510`) legitimately invalidates and unmounts `wizard-apply-deploy` / `deploy-apply-btn` before or during Playwright's multi-frame `locator.click()` stability check, causing `locator.click()` to retry for `15000ms` (`element was detached from the DOM, retrying`) waiting for an intentionally-removed button to reappear (`[REPRODUCED]` in `task-16113` at `deploy-review.spec.ts:263`).
  - Add a local helper `clickIfStillMounted(locator)` using `locator.evaluateAll(elements => { const button = elements[0]; if (button instanceof HTMLElement) button.click(); })` at `lines 263` and `399`, keeping `await expect(wizardApply).toHaveCount(0)`, `await expect(applyButton).toHaveCount(0)`, `expect(requests).toHaveLength(...)`, and `expect(applyIdentities).toHaveLength(...)` intact.
- **Assumptions & authoritative references:**
  - `src/App.tsx:1804-1821`, `src/components/PlaytestWorkspace.tsx:501-540`, `src/main.tsx:52-62`, `tests/e2e/deploy-review.spec.ts:261-266,392-402`.
- **In scope:** `tests/e2e/deploy-review.spec.ts`, `docs/plans/2026-11-25-deploy-review-stale-apply-race.md`, `SESSION-HANDOFF.md`.
- **Out of scope:** Weakening any stale-apply rejection assertion or changing runtime deploy guards.
- **Risks & rollback:** Zero production code mutation; rollback to `ac710bb05a14db6df8e61804135b8458a7aa01a6`.
- **Acceptance criteria & validation:**
  1. `node scripts/run-e2e.mjs tests/e2e/deploy-review.spec.ts` passes (`VERDICT: PASS`, `0` failed, `0` flaky, `treeGone=true`).
  2. Full unfiltered `npm run test:e2e` passes `153/153` (`0` failed, `0` flaky, `VERDICT: PASS`).
  3. `npm run typecheck` and `npm run precommit:check` pass.

## BASELINE

- **Revision:** `ac710bb05a14db6df8e61804135b8458a7aa01a6` (`main`); Unit 61 CI `Quality` `45703787110` running/green; `task-16113` full E2E hit `152 passed, 0 failed, 1 flaky` strictly on `tests/e2e/deploy-review.spec.ts:263` (`wizardApply.click()` `element was detached from the DOM, retrying`).

## RECONCILE

- **Resources & couplings checked:** `App.tsx:1810` (`activeCompileReview`), `PlaytestWorkspace.tsx:510` (`useLayoutEffect` clearing `deployAttempt` on `selectionRevision`), `main.tsx:56` (`selectWorkspace`), `deploy-review.spec.ts:263,399`.
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT

- **Actual bounded changes (`tests/e2e/deploy-review.spec.ts`, `+8 / -2` lines):**
  - Added `clickIfStillMounted(target)` using `target.evaluateAll(elements => { const button = elements[0]; if (button instanceof HTMLElement) button.click(); })` at `lines 269` (`wizardApply`) and `405` (`applyButton`), eliminating the two-round-trip `isVisible() -> click()` / post-invalidation `locator.click()` TOCTOU race against concurrent `useContinuousPolling` re-renders while keeping `toHaveCount(0)` and zero-apply-request assertions unchanged.
- **Post-lock contract changes & reason:** None.

## VALIDATE

- `npm run typecheck` (`task-16149`, `2026-11-25T21:54:15Z`): exit `0`.
- `npm run test:writers` (`task-16149`): `30/30 + PASS + 8/8` (`50` raw writers & `74f0a969...` unchanged).
- `node scripts/run-e2e.mjs tests/e2e/deploy-review.spec.ts` (`task-16149`): `VERDICT: PASS — 1 passed, 0 failed, 0 flaky, 0 bad-result, 0 quarantined-but-blocking [via json-report] [lifecycle trigger child-close, treeGone=true]`.

## REVIEW & CLOSE

- Both post-`roundTripWorkspaceSelection()` stale-apply checks execute atomically without `element was detached from the DOM` retry timeouts -> **done (evidenced)**.
- **Status:** `VERIFIED` (committed ahead of full `153/153` `v0.0.98` E2E gate).
- **Suggested commit title:** `test(e2e): eliminate TOCTOU unmount race on stale deploy-apply checks`

## AAR

- **Triggers:** Pre-bump `test:e2e` run `task-16113` on `ac710bb` surfaced `1` flake (`152/153` passed) at `tests/e2e/deploy-review.spec.ts:263`.
- **Sustain:** Inspecting `App.tsx:1810`, `PlaytestWorkspace.tsx:510`, and `main.tsx:56` pinpointed why both `line 263` (`task-16113`) and `line 399` (`task-15375`) had a real TOCTOU window between imperative `selectWorkspace` and poll-driven React unmounts, fixing both deterministically without weakening assertions.
- **Improve work/approach:** Never use `if (await locator.isVisible()) await locator.click()` when testing an action whose target element may concurrently unmount via reactive invalidation; use single-turn `locator.evaluateAll` + `await expect(locator).toHaveCount(0)`.
- **Improve tools / Highest-risk evidenced weakness:** `No evidenced risk delta`.
