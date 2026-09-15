# B119 exact saved/current scenario mismatch diagnostic

Status VERIFIED (bounded diagnosis). FULL lane. Full visual-builder goal ACTIVE/PARTIAL.
Goal: establish why retained complete projections break saved-scenario recognition after Undo.

## Reconcile / bounded plan

- HEAD332e215; production restored and history3/3 verified. Both four/five-entry caches
  were rejected; do not attempt another cache variant. Earlier eager fallback already removed.
- Existing X4UiPreviewScenarios captures current scenario and compares saved/current using
  JSON.stringify after blanking id/name. Existing browser test at1433 requires B after Undo
  and already proves both preview values remain B. Missing evidence: exact record difference.
- Reuse that unchanged test, isolated runner and real session/corpus/renderer. Add optional
  test-only route instrumentation to observe saved/current records, bounded20snapshots.
- Reproduce the EXACT rejected five-entry factory only by browser response interception
  inside this isolated test, not by editing production. Baseline mode leaves factory intact.
  Both modes capture identical component fields; require module rewrite hit counts.
- Files: tests/e2e/x4-ui-scenario-diagnostic.ts; import/hooks in x4-ui-source-editor.spec.ts;
  this plan and close/handoff. Source-owner and component production files unchanged.
- Acceptance: unmodified baseline history assertion passes; rejected-cache diagnostic
  fails same B/custom-values assertion; attached exact snapshots identify concrete differences
  or clearly remain inconclusive. Never weaken the existing comparison/assertion to pass.
- Validation: typecheck/focused lint; sequential ordinary Chromium3200/3201 workers1;
  frozen input/HEAD/status/protected50/realLua4/live19 and owned-process cleanup guards.
  CPU/counts off. Snapshot overhead means no latency comparison. Current quiet authorization
  retained, machine state checked by runner before every browser run.
- Outputs only testInfo attachments/output directory under
  F:/DEV_ENV/X4_Forge/test-results/b119-scenario-mismatch-20260915/.
- Risks: route pattern misses or modifies wrong module, observer affects identity/timing.
  Restrict exact module paths, assert exact replacement markers, capture plain data only;
  store original/current mode and hook hit counts. Compare same observation in both runs.
- Rollback: remove only diagnostic helper/import/hooks; preserve earlier optional call wrapper
  and93unrelated paths. No mod/game/config/install/publish/push; no product cache retained.
- Next implementation requires a separately reconciled cause/acceptance contract. Diagnosis
  does not narrow all9journeys/3menus/12references/fullintegration/installed/native obligations.
  No capability-map delta; issue#41 stays open, no public mutation.

## Validation / close / AAR

Diagnosis completed 2026-09-15 UTC. [REPRODUCED] Baseline history passes first attempt;
the exact rejected factory fails on both attempts. After Undo, current source and saved A
use hash7D00629E, but saved B retains edited-source hashE3E99FB2. Its text values remain B.
B is filtered out as stale, not merely mislabelled by JSON ordering. Checkpoint6 pinpoints
the refusal following applyX4UiEditorSampleDraft during scenario migration.

Sample/path WeakMap records are retargeted by equivalent rebinding while earlier frozen
projections retain the original catalog and same handle. Separate fail-first tests then
reproduce catalog-authority-required for both old pairs. Repair is governed by the separate
2026-09-15-b119-stable-catalog-authority.md plan, not an expansion of this diagnostic.

Evidence:test-results/b119-scenario-mismatch-20260915/.
baseline-browser PASS1/1; rejected-browser, rejected-records and rejected-checkpoints each
FAILED0/1 on both attempts at the unchanged assertion. Final observer hit counts1/1/1.
All input, protected50/realLua4/live19, machine and process cleanup guards pass.
Initial types FAILED because a standalone rejected-factory.ts evidence fragment was included
by the root compiler. Renamed the fragment to .ts.txt; types-artifact and focused lints PASS.
No compiler exclusion or oracle weakened. Later repair evidence connects the exact browser
failure to the mechanism: rejected-fixed PASS1/1 with only immutable rebinding underneath.

Temporary helper archived at scenario-diagnostic.ts.txt within this ignored evidence root;
its import/hooks removed from the E2E spec. The prior call-count wrapper remains unchanged.
To reproduce diagnostic routing, restore that helper to its former test path and the two
beforeEach/afterEach hooks; the exact rejected-factory.js is retained beside the archive.
No production cache retained, no public mutation, no capability-map delta.

AAR triggered: reproduced failures, diagnostic refinement, compiler artifact correction,
invalid PowerShell glob/path reads and oversized output. Sustain exact factory/assertion,
bounded snapshots and paired controls. Improve: locate artifacts with rg --files; use
explicit -g filters and summarize JSON before emitting it. Highest-risk evidenced weakness:
mutable issuance records invalidate already-issued frozen projections; bounded repair has
its own red/green proof. Lessons recorded here; no global memory or external ledger writes.
