# B119 visible working-view reopening

Status: VERIFIED (bounded camera navigation and visible reopening). Lane FULL.
Astra direct/local. Full goal ACTIVE/PARTIAL.
Skills: planning, brainstorming (camera ownership alternatives), Graphify navigation,
code-review for complete per-unit diff. No agents or Git/protected/external writes.

## PLAN / BASELINE / RECONCILE

Bounded unit: fix the observed blank real MENU viewport after focus/edit/export/new
workspace/import/sample. Original goal and approved canvas-first/viewport plans require
visible appearance-preserved reopening; offscreen bitmap equality is insufficient.
Existing selection-focus unit is PARTIAL. Its screenshot proves the blank viewport while
the native pixels and source exports remain exact. Causal lead: workspace-change render
effect clears the old canvas but retains manual zoom; camera is not workspace-owned.

Read-only Graphify vocabulary [canvas,viewport,workspace,selection,zoom] locates existing
presentation/App owners but graph lacks detailed camera lifecycle. Live code governs.
Capability map and ADR-F5 require immutable workspace ownership. Prior June recall is
weak/general and supplies no verified camera repair. No prior fix assumed.

Alternatives: copy camera across unrelated workspaces (wrong context); add persistent
per-workspace camera registry (unneeded new state contract); selected: reset existing
view state to Fit menu at explicit workspace/source/menu navigation. Keep camera through
ordinary source edits, scenario changes and undo/redo. No automatic node-selection zoom.
Reuse existing camera refs, zoom setters, workspace invalidation effect and selectors.

Owned: F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx and its selftest;
F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts. Extensive prior dirty work
preserved; HEAD/main93c9af111d63ca77c99dee11f21882c4073bcda6. Capture all31priorpins,
three owned byte backups and git status before mutation.28independent pins immutable.
Evidence: F:/DEV_ENV/X4_Forge/test-results/b119-reopen-working-view-20260913/.
Use preceding selection-focus check-guards.mjs unchanged:34olderinputs,4real Lua originals,
19protectedfiles plus membership. X4 absent and only Deckwright3100 at fresh baseline.

Risks: reset during same-menu editing, stale anchor reused after navigation, zero-sized
intermediate canvas, same-named source in another workspace, unnecessary render/history
writes. No spend/network/delete/schema/renderer/source-authority changes. No native,
installed, full E2E/precommit/release claims. Real game/mod/config writes remain gated.
Rollback: reviewed exact unit hunks using .bak snapshots; never overwrite older changes.

## Implementation and acceptance

1. Add visible native-caption rectangle assertion at independent real MENU reopen BEFORE
   selecting/refocusing anything. Save camera/clip observation. Preserve all original source,
   hierarchy/pixel/history/negative/export assertions and120s deadline. Run red baseline.
2. Reset the existing view when workspace changes and explicit source/target navigation
   selects another item; clear one-shot anchors and remembered camera. Do not persist or
   transfer selection/geometry authority. No reset for same-item navigation/source edits.
3. Mounted regression: focused view is reset by different workspace/source/menu navigation,
   existing stale-focus guards and same-menu edits remain. No source submissions from reset.
4. Browser: complete real MENU edit/history/export/independent reopen/collision; caption
   inside visible viewport immediately after supplied scenario; then explicit reselect/focus
   makes reopened TRANSMIT readable. Canvas-first pan/resize/hit-test invariants still pass.
5. Full mounted SourceEditor and presentation selftests, typecheck, owned lint, whitespace;
   standard isolated run-e2e3200/3201,workers1,retry1,ZERO flakes for two affected journeys.
6. Inspect actual reopened/edited/focused screenshots, independently verify exported bytes,
   all pins/guards/HEAD and owned stack teardown. Required visual failure means PARTIAL.
7. Review complete diff, update this plan/BACKLOG/handoff and verified history only if green.

Missing-input UX, final-Redo selection, full numeric/census, three menus/twelve refs, full
E2E/precommit/package/install/deployed bytes/native/public release remain required by goal.
No external capability-map/GitHub/wiki/global-memory updates authorized in this unit.
Every failure preserved; triggered AAR at close. Proposed eventual commit:
fix(ui): reset source canvas view across menu navigation.

## IMPLEMENT / review checkpoint

Red standard browser run finished11:07:23Z: both attempts fail the NEW visible-reopen
assertion, after native pixels/hierarchy/source checks pass.0passed/1failed/0flaky; owned
stack gone and all pre-implementation source pins unchanged. No timeout/policy changes.
First trace camera attachment: scrollLeft0/scrollTop0,100%preview; caption rectangle
left1617.3125,top1369.65625,right1704.3125,bottom1390.65625 while visible clip ends
at899.09375,707. [REPRODUCED] It is rendered offscreen, not lost Lua or missing glyphs.
Trace: red/browser/x4-ui-source-editor-Source-e9f36-s-and-reopens-real-MENU-Lua-chromium/
trace.zip, attachments/f5ef2230fce7a7b355cb176952b4c9400789e2f6.

Production delta21added/3replaced lines in existing SourceEditor only. resetCanvasView
clears anchor/key/camera memory and returns existing scale/mode to1/Fit menu. Existing
workspace-invalidation effect and explicit source/target navigation call it. Both primary
and Inspect target selectors share selectTarget. New-menu/import already call selectSource.
Same-item target events and internal acknowledged edit/undo selection reconciliation do
not reset zoom. No renderer, geometry, source, history, profile or workspace writer added.

Mounted regression expands existing stale-cell fixture with another file/menu and immutable
workspace scope. Focus and navigation checks passed first attempt, including old-workspace
callback refusal, original source bytes and zero source submissions. Original stale-cell
negative/fresh positive remain. Full presentation, typecheck, owned lint/whitespace pass.
All three complete diffs reread against .bak snapshots; E2E changes are additions only.
Full mounted and final rendered/visual/independent-byte gates determine final close below.

## VALIDATE / REVIEW / CLOSE — 2026-09-13 11:17Z

All declared bounded gates passed; exact commands, times, exits and logs are in evidence:
- presentation-full exit0, including prior fit/focus/clipping/invalid-geometry contracts.
- mounted-focus exit0 first attempt; full mounted-full exit0 through new navigation marker,
  original stale-cell negative/fresh positive, new-menu25/25, full Lua-file async/selection/
  boundary/export-failure matrices and scenario-first-render/profile-input-continuity.
- typecheck exit0; owned lint exit0/zero warnings; git diff --check exit0.
- red/rendered-final.json: expected1failed,0flaky; both attempts fail visible-reopen check.
  Production and mounted-test bytes unchanged at that fail-first run; original oracles pass.
- green/rendered-final.json:2passed/0failed/0flaky/0bad; first-attempt canvas-first14.2s,
  real MENU1.8m, batch2.7m. Standard wrapper and120s deadline unchanged; treeGone=true.
- Independent verify-results.mjs exit0 at11:17:33Z; receipt.json. All31currentpins,
  28independentbaselinepins, three byte backups,34olderinputs,4originals,19protectedfiles
  and protected directory membership exact. Original E2E lines removed:0.
- Untouched download90060bytes equals original SHA8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD.
  Edited90064bytes is ONLY SEND->TRANSMIT, SHA0E6459062CF1B918DEBC9492D8098F0AD76686773352469B2E689250E8C4D674.
- Fresh11:19:01Z machine check: X4/runner33364 absent;3000/3001/3101/3200/3201 free;
  Deckwright3100/PID8256 command line verified. HEAD/main unchanged. No protected writes.

Six actual screenshots inspected individually; visual-review.json records results.
Reopened overview now displays the input bar at20.1%Fit menu, inside the viewport BEFORE
selection/focus. Camera JSON caption bounds472.90,582.23–490.42,586.45 lie inside clip
183.31,382.66–899.09,707. Overview is deliberately NOT the readable working zoom.
Reopened-focused screenshot shows readable TRANSMIT at100%, current selection and friendly
Text control. Edited screenshot retains readable100%working view.1280/1024fixtures retain
usable toolbar, direct selection, pan/refocus and same native canvas/PNG/profile/history.
Known scratch15validation errors, incomplete menu bodies and gameVerified=false stay honest.

Requirement review1–7: DONE and evidenced for this unit. Explicit source/menu/Inspect/
workspace transitions reset view, same-menu events do not; no stale focus revival and no
source submissions from navigation. Real edit, Undo/Redo, export, independent reopen,
visible overview, focused readability and filename-collision safeguards all pass.
All three complete diffs reviewed against per-unit snapshots; no hidden original assertion
removal, parallel renderer/history or authored geometry/profile change. reviewctl absent;
manual review plus exact lint used, no installation or invented scan result.
No new semantic capability-map delta: repaired existing camera ownership and restored visible
reopening; no external ledger write. Previous focus unit's reopen limitation is resolved by
this evidence, without rewriting its historical partial receipt.

Out of scope STILL REQUIRED: actionable missing-input recovery, finalRedo selection,
numeric downstream matrix, all nine journeys, three menus/twelve-reference visible census,
full E2E/precommit/build/package/install/deployed bytes/native/public release. No full-goal
or native completion claim. No Git, release, mod/game/save/install/config/external writes.
Rollback is reviewed per-unit hunks only against preserved .bak snapshots.
Commit point: fix(ui): reset source canvas view across menu navigation (NOT committed).

## AAR — triggered

- Triggers: fail-first browser red; initial combined instruction/code reads exceeded output
  budget, followed by bounded complete reads. No production repair retries or oracle changes.
- Sustain: trace-backed visible geometry AND source/native-pixel proof. A red-to-green UI
  check now catches the specific condition that previous pixel-only reopening missed.
- Improve work: identify view-state ownership whenever a new focus/zoom feature is added;
  review navigation and source-edit paths separately so edits do not reset working context.
- Improve tools: one image per call; read long instructions separately, not with repo output.
  Preserve browser camera JSON beside screenshot, since temporary structured reports expire.
- Highest-risk evidenced weakness: initial MENU still looks empty until a buried runtime
  sample is supplied. Next bounded UX unit must explain affected elements and route users to
  required inputs without inventing values or executing imported Lua. Blank-camera cause is
  now fixed; do not confuse this remaining unknown-geometry state with camera clipping.
- Project lesson banked in this plan/handoff/BACKLOG. No global-memory or wiki writes.
