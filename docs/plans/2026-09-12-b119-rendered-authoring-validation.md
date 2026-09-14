# B119 rendered authoring validation

Lane: FULL. Status: FAILED (rendered acceptance); goal remains PARTIAL.
Direct Astra execution; no workers. All16 cases terminal; no source/harness change during this batch.

## Plan and acceptance

Ken authorized rendered tests and chose computer-local saved scenarios; public releases are the only
push points. Finish the UI builder before returning to X4 AiLive. This batch verifies existing code;
it does not implement scenarios, repair the separate COMM numeric failure, or release/install anything.

Reuse the existing fail-closed run-e2e.mjs, @playwright/test1.63.0, 14 SourceEditor and2 builder-mode
cases, then inspect their screenshots/geometry/trace artifacts. Next, when the first batch is sound,
run the full SourceEditor selftest (includes actual Chromium layout). Do not silently skip failures,
reduce the suite or use root Playwright1.61 as the runner. Targeted tests are not the full E2E gate.

User journeys covered by existing tests: create without Lua, contextual widgets, property/recovery
controls, primary preview inputs, source-preserving edits/history/rearrangement, PNG ownership,
resolution/scale and Lua download/reload/import/workspace isolation. Negative checks include stale
edits/authority, source/history preservation, invalid inputs, collisions and write-free mode changes.
All nine goal journeys and named scenarios/native three-menu/twelve-reference fidelity remain required.

Baseline: test-results/b119-rendered-20260912T064340Z/baseline.json, captured06:43:40.6959589Z.
35 source/harness inputs;19 persistent workspace/config/discovery files; HEAD93c9af111d63ca77c99dee11f21882c4073bcda6.
Antigravity running, no X4/Conan process,3200/3201 free; Deckwright3100 pid46444 must remain untouched.
Installed discovery advertises55835/pid42308 but neither process nor listener exists; read-only API
probe unavailable. Do not repair/restart the installed sidecar in this batch. Protect its actual global
storage state/config and repository .studio-state via recorded hashes, not a claimed live API hash.

Environment is process-local: X4_FORGE_E2E_WEB_PORT=3200, X4_FORGE_E2E_API_PORT=3201,
X4_REFERENCE_ROOT=F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00; bundled Node24.19.0.
Use node scripts/run-e2e.mjs with both exact spec paths, --project=chromium --workers=1 and unique
--output=test-results/b119-rendered-20260912T064340Z/artifacts. Existing harness owns temporary state,
API/Vite/browser children and cleanup. Preserve prior default verdict as an inert snapshot before run.

Acceptance: structured verdict green with all16 cases terminal, zero flakes/bad/global errors and
complete lifecycle cleanup; inspect actual screenshots for legibility, reachable controls and canvas
visibility. Code and persistent guards unchanged;3200/3201 gone and protected3100 ownership retained.
Capture actual command/start/end/child and wrapper results/raw streams/receipt/screenshots/hashes.
On failure preserve evidence and reconcile before any scoped repair; original assertions remain the
authority. New code changes need updated scope/baseline, minimal repair and relevant revalidation.

Rollback: no implementation changes planned; disposable stack cleanup only. Never restore entire dirty
source or user state, and never kill a process outside harness-recorded ownership. No Git mutation,
publish/install/native/mod/save/config or external ledger/memory write. No capability-map delta until
rendered behavior is genuinely verified. Record final status/review/AAR here and in SESSION-HANDOFF.

## Reconciliation and AAR baseline

Existing harness isolates both ports, config/state/data/discovery and Vite environment; no duplicate
runner or renderer needed. Two source lookups used a nonexistent fixture path/PowerShell glob; corrected
using actual filenames. No code or user state was changed by those misses. Preserve this non-clean
tooling note; use bounded existing resource paths. No new network/spend/delete surface.

## Validation / review / close — 2026-09-12

Receipt: test-results/b119-rendered-20260912T064340Z/final-receipt.json; immutable run-specific
e2e-verdict.json, raw stdout/stderr, screenshots and traces are alongside it. Started06:45:22.6886685Z,
ended07:00:35.5013400Z, wrapper/child1. Structured result:8passed/8failed/0flaky/0skipped,
16discovered/16terminal,0global errors. Lifecycle complete, ownership complete, treeGone=true.

Independent07:03:59.4034141Z after-check:HEAD unchanged;35input hashes unchanged; all19persistent
guards unchanged, no added/deleted guards;3200/3201 closed;3100still pid46444. Wrapper60592,
Playwright45888 and API32220 absent. No game running. Installed sidecar was not restarted or modified.

Passed:2builder-mode cases, late/aborted corpus handling, persistent canvas/exact local edit,
primary preview inputs without Lua/Inspect changes, New-menu/title editing, current-only PNG export,
and causal scale/custom-retention behavior. These are source-browser fixture results, not installed
or native-X4 verification. Required full SourceEditor selftest is UNRUN/deferred behind this red batch;
full E2E, packaged/installed/native gates remain open.

Failures, all reproduced on both attempts:
- Property recovery: exact title-edit Undo restores source and fresh canvas; selected Text label is
  absent at spec1424. Later Redo/recovery assertions not reached. [HYPOTHESIS] existing history carries
  menu intent, then stale builder identity clears without fresh node resolution. Existing owners to
  reuse: SourceEditor historySelectionCarryRef/selectedMenuIntentRef, App readback notice,
  workspaceUndoHistory; BuilderPresentation source-span mapping/fresh-node resolver. Preserve exact
  workspace/scope/user-interruption/replay guards. No repair written; amendment required first.
-3contextual widget tests: insertion/edit/selection/screenshot reached, final spec2148 expects old
  cell-unavailable copy; current containing-row context offers Add another row, required by the
  current component selftest242. Reconcile the exact cell/row context and retain no-duplicate-insert
  plus enabled Add-row assertions; do not blindly substitute text to make a test green.
- Same-menu multiwidget:60s deadline during later Add row. Trace click steps~5.8–6.5s; UI6336ms
  longtask indicator. [HYPOTHESIS] synchronous authoring work contributes; exact hot path unprofiled.
- Browser history:spec2802initial row-count locator finds0, while error snapshot explicitly contains
  Row1. No history action reached. Reconcile DOM text versus accessible name before locator repair.
- Row rearrangement: populated and moved-down captures reached; later Move at spec3716takes6431ms,
  then60sdeadline before source polling settles. No full movement/history journey pass.
- Lua roundtrip:fixture spec2711expects empty canvas, actual refused. The intended file/history/
  workspace journey has not started. Reconcile empty/refused semantics and fixture readiness.

Visually inspected five real1280x720 PNGs listed in the receipt: primary inputs, created menu,
contextual Input, moved-down rows, and scoped property Inspect. Hierarchy/canvas/inspector remain
visible; inserted input text and row movement are rendered; technical recovery is reachable.
Small Fit-menu fixtures can become heavily magnified; red diagnostic outlines and visible longtask
indicators mean these are not proof of finished polish or native parity.

No implementation, acceptance weakening, Git mutation, push, release, install, config, game/mod/save,
external ledger or memory change. No capability-map delta. Remaining work is explicitly retained.
Next bounded repair: preserve selected element through exact owner-issued scalar Undo/Redo using a
uniquely resolved fresh node, with stale/external/scope/interruption controls. Then reconcile independent
E2E expectations and profile authoring stalls; rerun the existing16cases without flakes/quarantines or
blind timeout increases. Keep numeric COMM and all9journeys/3menus/12reference obligations open.

## AAR

Triggered: red acceptance and repeated oversized inspection output, including an unbounded ZIP-entry
listing. Sustain: isolated stack, structured verdict, unchanged-state guards and screenshots caught
defects that source-only green could not. Improve approach: classify the exact reached assertion before
calling an entire journey broken. Improve tools: emit bounded trace action/title/duration/error fields,
not all ZIP entries or combined long skill/source dumps. A bounded read recovered action timing.
Degradation was explicitly called; preserve this checkpoint and start the repair with fresh context.
Highest-risk evidenced weakness: authoring can restore source while losing selection, and several
ordinary clicks take~6s. Bounded countermeasure: guarded fresh selection continuity plus targeted
profiling/revalidation, not stale IDs or longer timeouts. Lessons banked here only; no global memory
write. reviewctl unavailable on PATH; no code diff was approved or committed in this validation batch.
Close-tool note: the multi-file apply_patch wrote the receipt/plan but failed at SESSION-HANDOFF.
Readback confirmed no handoff damage; disk space and ACL were normal. A smaller same-tool patch
succeeded without permission/config changes. Cause unknown; do not assume multi-file patches atomic.
