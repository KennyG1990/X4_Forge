# B119 source-grounded menu selection

Lane: FULL. Status: PARTIAL (implemented; final workspace-return UI gate remains). Owner: existing B119 / issue 41.

## PLAN / acceptance

Bounded unit: reopen a single imported menu automatically without offering cleanup/refresh functions
as ordinary menus. Preserve the complete technical target catalog under Inspect and every exact
source/target selection, asynchronous acknowledgement, stale-action and workspace guard.
Reuse LayoutProgram target/context and Helper receiver checks, PreviewPipeline candidate projection,
and SourceEditor selection/import controls. Real Lua remains canonical; no execution of imported Lua.

Alternatives: function-name guesses fail on renamed builders; projecting every target through the full
renderer adds avoidable work and confuses unknown geometry with absence. Use source-only frame
constructor evidence in exact contexts; conditional/dynamic builders remain candidates, not verified
geometry. No-constructor sources remain inspectable. Multiple real builders require explicit choice.

Likely files: src/lib/x4UiLayoutProgram.ts and selftest; src/lib/x4UiPreviewPipeline.ts;
src/components/X4UiSourceEditor.tsx and selftest; existing E2E spec only if further evidence requires it.
No replacement parser, source writer, history, renderer, dependency, endpoint or persistence system.
No release/install/game/mod/save/config or external issue/wiki writes; no Git mutations/interim pushes.
Rollback: exact pre-unit file copies under test-results/b119-menu-targets-20260912; reverse only these
hunks and preserve every pre-existing change.

Required validation: fail-first source-catalog and UI regressions; full LayoutProgram/SourceEditor;
whole tsc and strict touched-file lint; unchanged original real-corpus Lua browser journey through
export/import/edit/Undo/Redo/collision/workspace restoration, serial3200/3201; inspect actual screenshots.
Negatives: helper-only, same-spelled non-Helper call, dead constructor, nested context, genuinely multiple
builders, ambiguous/no evidence, later user action, stale acknowledgement; no silent first-target choice.
All broader9journeys/3native menus/12reference/numeric/scenario/fullE2E/precommit/package gates stay open.
Installed/native proof unavailable without its separate authorization gate; browser proof cannot replace it.
Evidence: test-results/b119-menu-targets-20260912 and this plan. Freeze inputs during validation;
hash persistent guards and verify no owned listener/process remains and Deckwright3100 stays untouched.

## BASELINE / RECONCILE

HEAD/main93c9af111d63ca77c99dee11f21882c4073bcda6; extensive prior dirty work preserved.
Previous goal turn: PROGRESS (blank creation and actual exact-byte import verified).
No X4 or E2E runner;3200/3201free;3100PID30164. User rendered-test clearance remains active.
Current actual imported catalog: top-level, refreshHelper, menu.open, menu.onShowMenu,
menu.createFrame, menu.cleanup. Existing settleImport auto-selects only a sole broad target.
Graph sourceCandidatesFor -> SourceEditor -> createX4UiEditorSessionOwner confirmed; actual source
shows PreviewPipeline uses LayoutProgram catalog. Existing catalog intentionally retains all contexts.
Extend, do not replace it. Presentation hints must not become source-edit authority.
Full objective/original brief/approved plan read. Capability/ADR-F5 reviewed; no capability-map delta yet.
Recall's old June conversation did not supply current target-selection evidence; current code is authority.

## EXECUTION

1. Snapshot owners and safety state; add constructor/context negatives and assert red before repair.
2. Add source-only menu subset, keep all target IDs unchanged, wire primary/Inspect/import views.
3. Run full declared gates, original browser journey and rendered inspection; independently reread diff.

## CLOSE / AAR

Pending implementation and validation. Full goal ACTIVE/PARTIAL, not reduced to this unit.

10:22Z review correction: full Layout PASS and tsc PASS. Mounted P7 initially19/21: handler-negative
still targeted the primary Menu instead of its new Inspect home; a transient empty catalog exposed
an unintended synthetic selected option. Route the same handler test through Inspect (retain all
canvas/refusal/restoration assertions) and only show the advanced-selection indicator for a target
present in the actual current full catalog. Update the transient placeholder text, not its empty-value
guard. Add exact primary3menu/Inspect-handler assertions. All original9import negatives remain,
now each with an additional non-menu cleanup target. This is a non-clean review correction.

Original real Lua E2E also gains exact primary single-menu and retained6technical-target assertions
after import; all its original downstream assertions/timeouts remain. Its original bytes are snapshotted.
Top-level primary menu labels are human-readable; raw exact IDs remain in Inspect/value, never labels.
Source-only classification does not expand arbitrary wrapper calls; unproven targets remain in Inspect.

## Evidence-led aggregate budget amendment — 10:33Z

First real run FAILED0/1,0flakes; both attempts pass exact imported source/whole workspace, auto-menu,
primary-vs-Inspect list, native bitmap/hierarchy/profile preservation, local visual edit and fresh pixels.
First60s expires250ms into Undo save observation; retry passes exact Undo workspace/canvas/history and
expires entering Redo. Actual retry final GET response extracted unchanged from trace and independently
deep-compared to imported snapshot: byte-exact workspace and immutable ID match. No page/request errors.
See trace-summary.json and verify-history.mjs/last-workspace-retry1.json. This is not an Undo diagnosis.

Reconciliation: this one test contains the entire download/reload/independent-import/edit/Undo/Redo/
second-download/collision/staged-draft refusal/discard/original-return journey, with individual30s save
poll limits. The aggregate60s allowance ends before those independent checks can run; observed save
settlements are3.3–5.5s. Existing earlier~6s individual authoring CPU stalls were already repaired and
are not substituted back. Change ONLY this journey's aggregate allowance to120s to execute its whole
contract; no assertion, per-action timeout, retry or zero-flake policy relaxed. This is an explicit
non-clean acceptance amendment, not a claim that the earlier60s gate passed or an overall speed SLO.
No production changes from this timing finding. Rerun whole journey and keep any new failure visible.

## CLOSE / REVIEW / AAR — 2026-09-12 10:40Z

Status PARTIAL. Six named source/test owners changed; real Lua remains canonical. New source-only
menu IDs are presentation metadata over unchanged exact targets, not edit/geometry/game authority.
Full technical selection retained under Inspect; stale empty catalog must not synthesize an option.

Validation: fail-first catalog assertion FAILED on old code;9/9 source-classification cases green;
full Layout880/880,skipped0; final full SourceEditorexit0 including P7scope21/21 and all later matrices;
whole tsc,strict6owner lint and final tsc/spec lint after budget amendment PASS0. Complete6file
snapshot diffs independently reviewed; exact whitespace0. reviewctl/BlastRadius unavailable.
Graph PASS0:11520nodes/29031edges/349communities; final refresh reports no topology changes.

Final120s actual-corpus Lua FAILED0/1,0flakes. Both attempts pass15captured checkpoints through New,
add/edit,exact export/reload,independent-empty,auto-import/bitmap+hiearchy/profile preservation,
visual edit,UndoRedo,second exact Lua export,collision refusal,staged refusal/discard recovery.
Only final original-workspace-return canvas assertion fails its10s limit. Both actual final GET
responses independently compared against reloaded-original: exact immutable ID and FULL workspace
bytes restored, but DOM File/Menu unselected and canvas0. No page/request errors. Evidence:
returned-workspace-proof.json,returned-workspace*.json,verify-returned-workspace.mjs,roundtrip traces.
Not an import/source loss/Undo defect. Next unit: workspace-scoped file/menu view selection restoration
through fresh exact owner-issued identity; preserve blank-workspace clearing and stale/async guards.
Do not weaken the final-return assertion by teaching the test to reselect manually.

Visually inspected import and second-export PNGs plus returned-workspace-unselected.jpeg. The matching
reopened bitmap remains partial/outlined; no native-fidelity or polished-final-UX claim. All original
9journeys,3realmenus,12reference/numeric/scenario/fullE2E/precommit/package/installed/native duties remain.
Source-local capability delta: menu discovery and imported authoring continuation strengthened.
External capability/issue/wiki mirrors unchanged under local-source scope, not marked verified remotely.

Both runners/report/lifecycle/ownership/treeGone complete; no remaining/killed PIDs. Final10:40:16Z
45inputs/19persistent guards stable, no additions/deletions,3200/3201free,3100PID30164unchanged,HEADsame.
Receipt:test-results/b119-menu-targets-20260912/receipt.json. No Git/push/release/install/mod/game/save/
config/external issue/wiki/global memory write. Suggested eventual commit:
fix(ui): distinguish menu builders from helper targets.

AAR triggered: fail-first case; mounted review correction; aggregate budget amended from actual trace;
later view-selection failure; diagnostic JSON/oversized-output corrections; initial handoff patch used
unsupported delete+add same target and was refused without writes, then corrected via exact Update.
Sustain: exact constructor/context/Helper identity; full Inspect path; independent actual server bytes;
all later original assertions retained. Improve tools: parse whole structured JSON correctly, bound
entry lists and use Update for same-path replacement. Highest evidenced remaining weakness: a saved
workspace restores its contents without its file/menu view, appearing blank to the user. Bounded
next repair must restore only source-current selection, not stale canvas/authority. Lessons banked
here/receipt/handoff only. Explicit checkpoint after diagnostic/document tool corrections; fresh unit next.
