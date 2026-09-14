# B119 green integration local checkpoint

Task: preserve the verified renderer optimization, regression coverage, opt-in request
observer and their evidence records in one local commit. Lane: FULL. Plan: SPECIFIED.

## Plan and reconciliation

- Parent: 5b730a67774516d44b9fff4f4b640b4113ade9ac, main; index empty.
- Reuse existing Git hook (.git/hooks/pre-commit invokes npm run precommit:check),
  full-suite receipt and protected-state guards. No implementation or test-oracle change.
- Exactly three executable paths: src/lib/x4UiCanvasRenderer.ts,
  src/lib/x4UiCanvasRenderer.selftest.ts, tests/e2e/x4-ui-source-editor.spec.ts.
- Records: BACKLOG.md, ROADMAP.md, SESSION-HANDOFF.md and six 2026-09-14 plans:
  dense-array-validation, workspace-abort-trace, reference-status-diagnosis,
  reference-cpu, full-integration-post-repair, green-local-checkpoint (all b119-prefixed).
- Exclude every other tracked/untracked change, release metadata, screenshots, deletions,
  W3B1 records, caches and ignored test artifacts. No push, release, install, external issue,
  wiki, real mod/game/config or memory writes. No capability-map delta.
- Prior full gate VERIFIED132/132, zero failures/flakes/skips/errors, with source pins and
  protected-state checks passed. Renderer187 checks, types/lint and focused negatives passed.
  Full builder remains PARTIAL: installed-host, whole-menu/native fidelity and broader
  reference obligations are not closed by this checkpoint.
- Git mutation is delegated. Risk: unrelated staging or test-side writes; snapshot excluded
  status/membership/bytes, selected bytes and full-suite input hashes before staging.
- Recovery: retain parent and receipts; stop on a failing guard or hook. No automatic reset,
  unstaging, revert or deletion. A failed hook must leave an uncommitted index for inspection.

## Acceptance and evidence

1. Read complete executable and shared-record diff; exact selected membership reviewed.
2. All current full-suite executable pins still match. X4 absent, only prior3100 listener.
3. Negative staging guard rejects any unexpected path; initial index must be empty.
4. Normal installed hook completes all precommit checks with exit0, no bypass environment.
5. Commit parent, branch and exact12-path membership verified; index empty afterward.
6. All excluded status/membership/bytes and selected worktree bytes unchanged; original
   protected files checked again before commit and independently after it.
7. Evidence: test-results/b119-green-checkpoint-20260914/ baseline.json, commit.log,
   commit-exit.json and post-commit.json. These generated receipts remain local.

## Review / close / AAR

Reviewed product delta retains every original validation guard; the Set only replaces
repeated property-name scans. New diagnostics are opt-in and preserve test bodies/oracles.
Existing failed diagnostic attempts remain recorded as failures, not rewritten as green.
Current status: checkpoint PREPARED, not a claim of commit success. The terminal hook and
post-commit receipts determine VERIFIED versus FAILED; actual hash is in post-commit.json
and Git history, avoiding a self-referential commit hash in this file.
Next after successful checkpoint: reconcile packaged-host and real imported-menu experience;
do not repeat green tests as a substitute for unfinished product work.

AAR triggered by oversized read output and a nonexistent .husky path lookup. Sustain bounded
diff reads, source/proof distinctions and exact exclusion guards. Improve tools: inspect the
actual configured hook path first. No new product risk; highest checkpoint risk is accidental
inclusion of unrelated dirty files, addressed by exact membership and byte checks.
Lessons recorded here only. Commit point: perf(ui): checkpoint linear canvas validation and green B119 integration.

## Gate failure and bounded diagnosis — 2026-09-14 12:46Z

[REPRODUCED] Installed precommit hook exited1 at12:44:54Z: E2E Vite lifecycle
selftest failed with `Vite readiness request timed out`. HEAD remains5b730a6;
all12 selected paths remain staged. failed-audit.json verifies93excluded changes,
selected bytes,412inputs/403members/50protectedartifacts/4realLua/19livefiles unchanged.
No commit or push occurred. Old full132/132 gate remains evidence, not a waiver for this gate.
Source locator: scripts/e2e-vite-server.selftest.ts getText uses an unchanged10000ms
request timeout for `/` after the disposable Vite listener starts. Style-source check passed
(315files,42881candidates,outside0) before the failure. No response phase timings captured;
cause is unknown. The helper closes Vite in finally; current named ports show only3100.

Reconciled bounded diagnostic: run the existing lifecycle selftest once unchanged under
the existing protected-state wrapper; preserve its log/exit and compare failure signature.
No deadline change, caching/config adjustment or production edit. A pass would demonstrate
intermittency, not explain or repair the failure. Further changes require a new evidence-backed
plan. Evidence: full-post-repair-20260914/precommit-vite-diagnostic-{inputs,receipt}.json
and precommit-vite-diagnostic.log. Do not retry the Git commit during this diagnostic.
AAR additional trigger: required hook failed; sustain fail-closed commit and preserved index.

## Standalone result / checkpoint attempt 2

Unchanged lifecycle selftest passed exit0 in7.25s under the existing protected wrapper;
all protected guards passed. This used node --import tsx rather than npm's tsx CLI and the
wrapper's normal isolated environment, so a context difference remains an alternative to
intermittency. Neither the root cause nor a repair is claimed.
One fresh full-hook commit attempt is now in scope, with the original npm command, installed
hook and deadlines. Re-stage only the same12 paths to include this truthful failure record.
Attempt2 snapshots and logs go to test-results/b119-green-checkpoint-20260914/attempt2/.
Keep attempt1 untouched. If attempt2 fails, stop checkpoint attempts and diagnose the exact
hook context; no retry-until-green loop. If it passes, report current precommit success and
historical unexplained readiness failure together. Parent/index/exclusion/protected guards
remain required. Terminal attempt2 receipt determines local checkpoint status, not this plan.
