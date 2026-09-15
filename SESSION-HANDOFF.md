# Session handoff — B119 stable catalog authority repair

## Current state / checkpoint

Project F:/DEV_ENV/X4_Forge. Full visual-builder goal ACTIVE/PARTIAL.
Bounded sample/path catalog-handle repair VERIFIED 2026-09-15 00:26Z.
Preparing a six-path LOCAL development commit above HEAD/main332e2158ae4d90715f7bd4df612a5cbfcc8e3551.
Do not infer commit success from this file. First command:
Get-Content test-results/b119-stable-catalog-authority-20260915/checkpoint/post-commit.json
If absent, inspect checkpoint/commit-exit.json and commit.log; recover the existing process,
do not blindly rerun the wx evidence writer or create a second commit.
checkpoint.mjs commit uses the normal npm run precommit:check hook; verify checks exact
six committed paths, empty index, all excluded dirty bytes, input pins and live guards.
No push, release, install or native-game write. Push only PUBLIC RELEASES; never republish0.0.78.
Astra directly; no Luna or delegation.

Read complete objective:
C:/Users/Moshi/.codex/attachments/d06dfea8-8256-48a5-97f5-b524fac87153/goal-objective.md.
Approved product plan:docs/plans/2026-09-10-b119-canvas-first-builder.md.
Lua canonical; reuse source/CAS, renderer, workspace/history and corpus owners.

## New reproduced cause / actual repair

Read BOTH:
docs/plans/2026-09-15-b119-scenario-mismatch-diagnostic.md
docs/plans/2026-09-15-b119-stable-catalog-authority.md

[REPRODUCED] Equivalent rebindSampleCatalogAuthority/rebindPathCatalogAuthority mutated
the issued WeakMap record's catalog. Earlier frozen projections retained old catalog with
same handle. Exact reference admission then refused the old pair with catalog-authority-required.
Browser snapshots found saved B retained edited-source E3E99FB2 after Undo to7D00629E;
saved A migrated, B did not. Checkpoint6 is sample draft refusal inside replay. B's values
remained visible, but B was filtered as stale. This is not a JSON ordering or label-only bug.

Repair mirrors EXISTING loop rebinding: readonly issuance records, exact catalog returns
same handle, equivalent new catalog gets a distinct handle. Populated sample/path inputs
use successfully rebound-or-supplied authority, never newly-issued fallback for forged/missing
supplied authority. Source/profile binding checks and cross-catalog refusal preserved.
Production single-entry cache unchanged. NO production LRU / no retained speedup claim.

The September11 partial-scalar-editing plan already documents equivalent-binding rebinding;
this repair preserves its prohibition on using these helpers for changed-source migration.

## Evidence / completed tests

Root:test-results/b119-stable-catalog-authority-20260915/. Read RESULTS.md.
- red-sample and red-path each FAILED1 as intended against mutable rebinding.
- Full session and scenarios PASS0. Final types/lint PASS0 after diagnostic hook removal.
- rejected-fixed: exact rejected five-entry factory through test-only response interception,
  calling repaired current helpers: original Undo/Redo assertion PASS1/1 first attempt.
  Observer counts1/1/1 and no replay failures.
- diagnostic-fixed: normal owner with same observer PASS1/1 first attempt, counts1/0/1,
  no replay failures. causal-summary.json contains compact observations.
- history-browser: final ordinary code, no diagnostic hooks/interception, PASS3/3 first
  attempt 00:24:22–00:26:01Z. ScenarioB Undo/Redo, named scenarios, New-menu row/Text history.
  Redo screenshot visually inspected: Title after edit A, Scenario B, Independent B.
  Separate shell validation1error remains visible; this fix does not clear that gate.
- All protected50/realLua4/live19 and final824 input pins preserved; X4 absent, only unrelated
  Deckwright3100/PID61604 listener unchanged; isolated3200/3201 process tree stopped.
- Full diff review and diff --check pass. Optional reviewctl/BlastRadius unavailable;
  manual review, established loop pattern, authority negatives and browser checks used.

Terminal handles:78522 rejected-fixed,82621 diagnostic-fixed,92867 final-types,
67532 final-lint,61797 history-browser. Earlier types59101/lint9118 completed0 by receipts.
No browser run active at handoff writing. Check checkpoint runner for any later live handle.

## Files / preservation

Six checkpoint paths:src/lib/x4UiEditorSession.ts,src/lib/x4UiEditorSession.selftest.ts,
BACKLOG.md,SESSION-HANDOFF.md and the two September15 plans.
Do not stage other work. Prior optional HUB count wrapper in
tests/e2e/x4-ui-source-editor.spec.ts remains +7/-5, unchanged by final cleanup.
Two older dirty plans remain:2026-09-14-b119-edit-projection-reuse.md and
2026-09-14-b119-session-replay-cache.md. Preserve them and the prior93 unrelated paths,
including Discord/data deletions, extension metadata/evidence, W3B1 and generated files.
Checkpoint baseline inventories exact excluded paths and hashes.

Temporary tests/e2e/x4-ui-scenario-diagnostic.ts removed from portable test suite, archived
as test-results/b119-scenario-mismatch-20260915/scenario-diagnostic.ts.txt.
Original import/beforeEach/afterEach hooks removed; historical route factory JS retained.
Standalone .ts evidence files are still compiler-included despite gitignore: use .ts.txt.
Trace JSON attachment lives INSIDE trace.zip; read-comparison.ps1 reads it without writes.
Locate artifacts with rg --files; PowerShell does not expand positional path globs for rg.
Do not dump raw multi-snapshot JSON. Read compact fields/causal-summary.json.
No external ledger or memory writes.

## Remaining important work

Do not treat this correctness repair as completion of the performance goal.
Last accepted performance work332e215: original HUB edit/undo/redo action+settlement
14.372/10.021/10.257s; immediate feedback still unmet. Real HUB later body unresolved.
Helper-caption caller-literal editing and helper-returnY geometry remain:
FACTIONS caller201 ->sectionHeader123–130/createText127 ->ASCIIhelper65–73.
Rendering is not editing; preserve shared-instance scope.

Two historical complete-projection caches were rejected (four and five entry).
The underlying failure is now diagnosed and repaired, but this does not authorize retaining
either cache without a new bounded design, regression and actual UX evidence.
Eager ordinary fallback projection before successful scenario transfer is ALREADY REMOVED
(2026-09-14-b119-continuation-fallback.md). Do not rebuild it.
Measured9layout/21validation/6scene/12session-pipeline calls per HUB edit are repeated work,
not proof that every call is redundant. Count instrumentation is not a latency benchmark.

Prior scene gate FAILED194/196: portableHUB expects7ops/3gaps, actual9/6;
configuredMENU expects52samples, actual54. Exact prior failures, not waived.
All9journeys,3realmenus/12reference obligations,current full integration,packaged/installed/
native gates remain. gameVerified=false. Preview for layout; game for truth.

Operator: quiet rendered-test authority retained; recheck X4/ports before heavy runs.
Real mod/game/save/install/config writes require impact/rollback paragraph and explicit go.
During authorized CUA keep Antigravity visible; obey Escape/tool stop. No CUA this unit.
Eyeball queue: RESULTS.md -> actual scenario-B-redo.png; isolated browser only.
Next work: finish/verify local checkpoint, then select a bounded user-facing latency/body
editing improvement from the existing owner/corpus evidence, not another documentation-only close.
