# Unit 58 — Driver-Lease Poll Epoch Fence and Idle State Referential Stability (`#49`)

Task: Fix two `[REPRODUCED]` UI race conditions introduced by `App.tsx` `refreshDriverLease()` (`17b7866`, `#49`) during the `0.0.97` full E2E release gate (`task-15375`): (1) stale mount-time `GET /api/agent/lease` responses overwriting an overlapping `POST /api/agent/lease` acquisition (`driver-session-lease.spec.ts:50`), and (2) unconditional 10-second `setDriverLease({ held: false, ... })` object replacement re-rendering `<App>` and `<PlaytestWorkspace>` while idle (`deploy-review.spec.ts:399`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Harden `refreshDriverLease` and `manageStudioDriverLease` in `src/App.tsx` (`lines 2243-2280`):
  1. Add `driverLeaseEpochRef = useRef(0)`, incremented when `manageStudioDriverLease` begins and when its response settles; capture `epoch = driverLeaseEpochRef.current` at the start of `refreshDriverLease()` and discard `GET /api/agent/lease` results if `driverLeaseEpochRef.current !== epoch`.
  2. Update `refreshDriverLease`'s `setDriverLease(prev => ...)` updater to preserve referential identity (`return prev`) when both `prev` and `next` are idle (`!next.held && !prev?.held`), avoiding spurious 10-second root `<App>` re-renders when no lease is active.
- **Assumptions & authoritative references:**
  - `task-15375` E2E failure snapshots (`deploy-review.spec.ts:399` and `driver-session-lease.spec.ts:50`), `src/App.tsx:2242-2302`, `src/components/PlaytestWorkspace.tsx:501-540`.
  - `no capability-map delta`; `0` new raw `fs.*` writers.
- **Out of scope:** Weakening `deploy-review.spec.ts` or `driver-session-lease.spec.ts` assertions, or changing backend `/api/agent/lease` behavior.
- **Risks & rollback:** Rollback target: `17b11afcbfc91b96589911bf357a69615d84f2f3`.

## BASELINE
- **Revision:** `17b11afcbfc91b96589911bf357a69615d84f2f3` (`main == origin/main`).
- **Reproduced evidence:** `task-15375` (`151 passed, 0 failed, 2 flaky`: `deploy-review.spec.ts:399` detached `deploy-apply-btn` on background `<App>` re-render; `driver-session-lease.spec.ts:50` clobbered `studio-driver-lease-banner` via mount-time `GET /api/agent/lease`).

## RECONCILE
- **Resources & callers searched:** `src/App.tsx` (`2242-2302`), `src/components/PlaytestWorkspace.tsx` (`501-540`), `tests/e2e/deploy-review.spec.ts`, `tests/e2e/driver-session-lease.spec.ts`.
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT
- **Actual bounded changes (`src/App.tsx`):**
  1. Added `driverLeaseEpochRef = useRef(0)` fencing `refreshDriverLease()` against any concurrent or subsequent `manageStudioDriverLease()` mutation.
  2. Preserved `prev` referential identity (`!next.held && !prev?.held ? prev : next`) on idle `refreshDriverLease()` polls and normalized released state in `manageStudioDriverLease()` (`next.held ? next : null`).
- **Deliberately unchanged:** All test files (`deploy-review.spec.ts`, `driver-session-lease.spec.ts`), `server.ts`, and all capability/writer/receipt manifests.

## VALIDATE
All required validation gates passed (`task-15409`):
- `npm run typecheck` -> exit `0`.
- `npm run lint -- --max-warnings 600` -> exit `0` (`0` errors, `579` pre-existing warnings).
- `npm run test:writers` -> exit `0` (`30/30 + PASS + 8/8`).
- `node scripts/run-e2e.mjs tests/e2e/driver-session-lease.spec.ts tests/e2e/deploy-review.spec.ts` -> `VERDICT: PASS` (`0` failed, `0` flaky, `treeGone=true`).
- `npm run test:oracles` -> exit `0` (`134/134` oracles PASS).
- `npm run test:routes` -> exit `0` (`804/804 PASS`).
- `npm run precommit:check` -> exit `0` (`[precommit] OK`).

## REVIEW & CLOSE
- **Status:** `VERIFIED` (full unfiltered `153`-test `0.0.97` pre-bump E2E gate runs immediately next after committing Unit 58).
- **Suggested commit title:** `fix(lease): fence stale driver-lease polls and skip no-op idle re-renders (#49)`

## AAR
- **Triggers:** Triggered by `task-15375`'s 2 `[REPRODUCED]` E2E flakes during the `0.0.97` pre-bump release gate.
- **Sustain:** Inspecting Playwright's `error-context.md` snapshots and tracing React render boundaries instead of blind-retrying the E2E suite pinpointed one shared root cause in `src/App.tsx` (`refreshDriverLease`) that accounted for both flakes simultaneously.
- **Improve work/approach:** Any background polling hook in root `<App>` MUST (a) fence `GET` polls with an epoch counter incremented by mutations on the same resource, and (b) bail out with `return prev` in `setState(prev => ...)` when the idle state is unchanged so child trees never experience unscheduled root re-renders.
- **Improve tools:** `No evidenced risk delta`.
