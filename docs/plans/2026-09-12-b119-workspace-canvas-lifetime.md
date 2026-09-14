# B119 workspace-scoped canvas lifetime

Lane FULL. Status PARTIAL. Full goal ACTIVE/PARTIAL. Current goal turn PROGRESS.

## PLAN

Bounded unit: detach the previous workspace's canvas when immutable workspaceScope changes.
Reuse SourceEditor's existing render/adopt layout effect, EMPTY canvas state, host DOM ownership,
export identity checks and renderer session. Ordinary same-scope source/target refusal must still
retain its last canvas as stale; scope-only changes must run the boundary even for identical source.
No component-wide remount, renderer/history/deployer duplication, source regeneration or cache bypass.

Files: src/components/X4UiSourceEditor.tsx, its mounted selftest, this plan, BACKLOG.md and
SESSION-HANDOFF.md. Evidence: test-results/b119-workspace-canvas-20260912/.
Risks: accidentally clearing on every workspace object change, retaining cross-workspace pixels,
or permitting a pending old PNG export. Rollback only this unit's hunks against exact source snapshots;
preserve all existing dirty files. No Git, issue/wiki, real mod/game/save/install/config or remote writes.

Acceptance and negative paths:
- Same immutable scope retains stale canvas and disables export after target refusal, even when the
  workspace object changes; source bytes stay canonical and untouched.
- A new scope with identical workspace/paint replaces the canvas; prior DOM node is detached.
- A new empty workspace has no canvas, refused rather than stale status, no parent verification
  snapshot, and disabled export. Returning to the source workspace renders a fresh current canvas.
- Existing asynchronous PNG surface/identity guards and all mounted stale recovery tests still pass.
- Actual Lua file journey retains its original 60s deadline, retry/zero-flake policy, source/workspace/
  history/pixel assertions; inspect actual rendered screenshot and record every reached checkpoint.

Validation: add mounted scope regression and run full SourceEditor on old production (expected red),
then on repair (expected green); full EditorSession, whole tsc, strict touched lint, whitespace review;
serial run-e2e on isolated 3200/3201 with genuine corpus, optional CPU profiler absent; verify all input
pins and persistent-file hashes including additions/deletions, no remaining owned processes/ports,
protected Deckwright 3100 unchanged. Fresh complete unit diff review and deterministic graph refresh.
Installed/native and complete UI-builder fidelity gates remain separate required work, not claimed here.
Previously reproduced Scene193/194 and Pipeline123/124 numeric geometry failures remain open.

## BASELINE / RECONCILE

HEAD 93c9af111d63ca77c99dee11f21882c4073bcda6, main. Dirty worktree recorded in baseline.json;
snapshot the two exact source owners before editing. Earlier normal Lua journey failed twice after
independent-empty: empty selectors/source/hierarchy, but old canvas8931opaque pixels retained stale.
Evidence: test-results/b119-authoring-cpu-20260912/receipt.json and inspected final JPEG.

Actual App workspaceHistoryScopeRef -> UIBuilder workspaceScope -> SourceEditor currentWorkspaceScope
already provides immutable identity. Render layout effect has no scope reset/dependency. Shared
adoptX4UiEditorCanvasResult deliberately retains prior surface on refusal and must not be changed.
Renderer session caches corpus atlas conversions, not previous surfaces. PNG completion already
rechecks exact mounted canvas identity; replacing/detaching rejects an old completion.
Graph direct import paths checked; ADR-F5/capability ownership and approved canvas-first contract read.
AgentBrain match was weak older onboarding, not evidence of a solved fix. No capability-map delta.

## EXECUTION

1. Extend the existing StrictMode mounted transition fixture without duplicating its large Lua literal.
   Add a named scope regression checking unchanged-scope object churn, scope-only change, empty switch,
   and fresh return. Run old production to establish fail-first evidence.
2. Add canvas scope ref initialized to currentWorkspaceScope. At the start of the existing render
   layout effect, on changed scope: host.replaceChildren(), canvasStateRef=EMPTY, clear export identity,
   update scope ref. Normal adopt then creates current/refused state. Include scope in dependencies.
   Run mounted/session/static gates and review exact owner diff; do not weaken any existing assertion.
3. Freeze inputs and run the original actual Lua browser journey. Inspect screenshot/trace, record
   reached gates and any newly exposed failure, check guards/cleanup, refresh graph, document close/AAR.
   Work remains local; suggested eventual commit: fix(b119): scope retained canvas to its workspace.

## IMPLEMENT / VALIDATION IN PROGRESS

Added two mounted scope modes using the existing fixture. Old production fails both exact boundaries:
P7 matrix19/21, only identical-scope-ID replacement and empty-workspace canvas removal red. Original
same-workspace transition still green. Repair adds scope ref, host/receipt/export reset and effect
dependency only. Full mounted suite then PASS0, including pending old PNG completion rejection; full
EditorSession and strict two-owner lint PASS0. Whole typecheck exposed two new test spread errors:
the reused fixture was unnecessarily cast to unknown. Retain its inferred object type instead; rerun
static and mounted gates before browser testing. Also corrected an unreached test selector to the
existing export-status surface before the first repaired run; no product selector or assertion relaxed.

## VALIDATE / REVIEW / CLOSE — 2026-09-12 09:39Z

Production scope: one initialized ref and the existing render effect's cross-scope DOM/state/export
reset plus dependency. No other production owner changed. Exact before/after diff independently read;
same-scope retention, no component remount, corpus-session reuse, source preservation and pending
export identity checks all retained. Source SHA256:
F1FEA1894D50D50893DE66A767C3949173E49F97849F899F484E6D499513E381.

- Full mounted SourceEditor old-owner run09:25:54..09:26:10: FAILED1, P7 matrix19/21; only new identical
  and empty scope regressions red. First repaired full suite PASS0. After correcting the fixture's
  unnecessary unknown cast, final full run09:28:54..09:29:56 PASS0, P7 matrix21/21; all existing
  Lua async9/9, selection9/9, input6/6, export6/6, New-menu25/25, history and stale callback checks pass.
- Full EditorSession09:27:24..09:27:37 PASS0. Final whole tsc PASS0, strict two-owner lint PASS0;
  initial tsc FAILED2 on the new fixture spreads. No validator or assertion suppressed. Whitespace0.
- Original Lua browser journey09:30:34..09:35:31 FAILED0passed/1failed/0flakes, both attempts terminal.
  Genuine corpus indexed in isolated scratch state; CPU flag absent. Original60s UI deadline and
  retry1/zero-flake/source/workspace/history/RGBA assertions retained; test spec untouched this unit.
  Both attempts pass initial-empty/New/add/edit/exact save/export/original reload, then independent-
  empty with sourcePath=null,targetLabel=null,hierarchy=[],nativeCanvas=null. This is actual browser
  evidence for the ownership fix, not only a mounted fixture. Page errors and failed requests empty.
- Both then fail import status at the next original10s assertion. Observed message: "The current UI
  source is unavailable or changed. Keep the current workspace, then retry the file action."
  Import/history/collision/restored-original checkpoints remain unreached. [REPRODUCED] UI refusal;
  internal reason/root cause not yet diagnosed because this copy maps five source-owner reasons.
  Next read importX4UiWorkspaceLua at x4UiWorkspaceSource.ts1646 and the real SourceEditor import
  continuation around2831; reproduce exact owner reason before changing any guard.
- Visually inspected empty-workspace-import-refusal.jpeg extracted unchanged from first attempt's
  final native browser trace frame: canvas area is empty, status refused (not stale), file/menu
  selectors empty, import refusal visible. Trace2 timestamp231935.782; source JPEG retained in ZIP.
- after-rendered.json09:36:55:39frozen input pins,19persistent hashes unchanged, no additions/deletions;
  3200/3201closed,3100still30164,HEAD unchanged. Runner lifecycle/report/ownership/termination complete,
  treeGone=true,remainingPids=[],commandedPids=[]; no owned runner remains.
- Manual complete unit diff and negative-path review done. reviewctl and configured BlastRadius path
  unavailable; no automated review claim. Deterministic graph09:36:58..09:37:51 PASS0:11519nodes,
  29027edges,352communities; no LLM, existing HTML5000 cap retained.

PARTIAL: workspace canvas fix implemented and rendered evidence passes; full declared Lua journey
still fails at newly reached import. Numeric Scene193/194 and Pipeline123/124 gates remain open.
All9journeys/3menus/12reference/scenario/installed/native/fullE2E/precommit/release duties unchanged.
No capability-map delta. No Git/push/release/install/real mod/config/save/issue/wiki/global memory writes.
Evidence receipt:test-results/b119-workspace-canvas-20260912/receipt.json. Suggested eventual commit:
fix(b119): scope retained canvas to its workspace. Next unit is import refusal, not another renderer.

## AAR

Triggered: fail-first regression, unreached selector typo corrected before repaired run, typecheck
failure on reused unknown fixture type, and new actual import refusal. Two fixture mistakes prompted
an explicit degradation checkpoint; do not widen implementation in this turn.
Sustain: test immutable scope separately from object identity; keep same-scope stale recovery; prove
pending PNG refusal and actual empty DOM in the browser without weakening the original journey.
Improve approach: use existing rendered test IDs and preserve useful fixture object inference before
running full checks. A newly passed checkpoint does not close the whole journey.
Improve tools: compare exact per-unit snapshots in this dirty tree; parse summary JSON and selected
trace entries, not giant one-line logs. Review utilities remain unavailable; manual review is explicit.
Final receipt capture initially mixed Git line-ending warnings into JSON; split diagnostic and JSON
commands, then wrote the receipt successfully. No source or test rerun was required for that wrapper issue.
Highest-risk observed remaining weakness: ordinary downloaded-Lua import is refused in the genuinely
empty independent workspace despite green mounted import matrices. Mechanism is not yet established;
bounded next experiment captures the exact owner refusal and workspace/source snapshot, then exercises
the same real transition in a regression. Do not assume it is another stale-canvas issue or weaken CAS.
Project lessons banked in this plan and handoff; no external ledger/global memory write.
