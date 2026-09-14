# B119 readable selected-element working view

Status: PARTIAL. Lane: FULL. Astra direct/local. Full goal ACTIVE/PARTIAL.
Skills: brainstorming (interaction alternatives), planning (bounded acceptance), Graphify
(existing owner orientation); fresh-eyes code review before close. No agents/Git mutations.

## PLAN / BASELINE / RECONCILE

Previous unit made verified progress: real MENU source editing and full roundtrip passed.
Actual edited/reopened screenshot remains tiny at20.1%Fit menu. Existing helper deliberately
fits whole frame including blank space; previous tests explicitly require that behavior.
The original brief and approved canvas-first/viewport plans require readable authoring,
one source-canonical canvas, and no changes to authored game geometry from preview zoom.
Read-only capability map/ADR-F5 retain exact workspace/source/profile selection ownership.
Graph query located existing presentation tests; June recall is weak, no prior fix assumed.

Alternatives:
- Redefine Fit menu to omit full-screen frames: hides intentional blank/context space and
  contradicts the existing verified whole-frame contract.
- Auto-zoom every selection: changes the camera unexpectedly during ordinary navigation.
- Selected: explicit Focus selection button beside preview zoom. Center at100% native
  scale; fit only when the selected issued bounds exceed the available viewport. Return
  to existing Fit menu/Fit screen any time. No camera movement merely from selection.

Reuse computeX4UiBuilderViewport, boundedCanvasRect, existing manual scale/anchor/scroll
effect and exact reconciled selection. A small pure focus calculation supplies scale and
center; no second camera/renderer/history. Repeated focus after panning must work even
when scale/selection did not change. Disable/refuse absent, stale, unknown or unmounted
selection. Retained callbacks must check live projection, selection and mounted authority.

Owned files under F:/DEV_ENV/X4_Forge: src/lib/x4UiBuilderPresentation.ts and selftest;
src/components/X4UiSourceEditor.tsx and selftest; tests/e2e/x4-ui-source-editor.spec.ts.
Preserve extensive prior dirty changes, recorded HEAD/main93c9af111d63ca77c99dee11f21882c4073bcda6.
Byte backups end.ts.bak; exact prior receipt pins checked before edits. Evidence:
F:/DEV_ENV/X4_Forge/test-results/b119-selection-focus-20260913/.
Rollback only reviewed unit hunks against these snapshots, never reset/overwrite prior work.

Risks: focus uses stale rects, selection jumps or incorrect scroll/overlay coordinates,
toolbar wrapping at1280/1024, same-scale repeated focus not triggering React update.
No new spend/network/delete/security surface. No real mod/game/save/install/config,
external wiki/GitHub/global-memory writes or Git/push/release. Rendered tests authorized;
reobserve X4/ports and preserve Deckwright3100. All three menus/twelve refs/native remain.
Missing-input recovery is explicitly deferred, not concealed or marked complete here.

## Acceptance / implementation steps

1. Add fail-first pure tests for offset/tiny/large/clipped bounds, aspect/scale limits,
   no/malformed/unselectable bounds and zero viewport; preserve existing Fit-menu tests.
2. Extend existing camera and compact toolbar with Focus selection. Guard current
   projection/selection/canvas, reuse anchor effect; trigger repeated same-scale recenter.
3. Mounted actual SourceEditor: initial disabled, fresh focus accepted, stale retained
   callback after selecting another node refused, source/history unchanged. Existing full
   mounted/canvas/selection/export negatives must remain green.
4. Extend existing rendered canvas-first fixture with focus/repeat-after-pan/narrow resize,
   exact same native canvas/PNG/profile/source/history and native hit-testing checks.
   Extend complete real MENU journey with actual Focus click, visible/readable SEND bound
   (at least16CSSpx tall), unchanged native pixels and screenshot. Keep every original
   edit/UndoRedo/export/independent-reopen/collision assertion,120s deadline and zero flakes.
5. Required: full presentation and mounted SourceEditor tests; typecheck, exact lint,
   whitespace; standard isolated run-e2e wrapper3200/3201,workers1,retry1 for the two affected
   rendered journeys. Independently inspect focused/edited/reopened images and Lua exports.
6. Recheck all pinned independent owners/protected files/membership/HEAD; stack teardown;
   document requirement review, honest outcome and AAR. Full E2E/precommit/package/install/
   native gates remain required by the full goal and cannot be claimed from this unit.

Initial status was SPECIFIED before implementation. Final review below governs current status.

## Implementation / review checkpoint

Implemented only the five declared owners. Existing whole-frame Fit menu tests retained.
Pure focus helper returns native scale capped by the existing fit calculation and center;
component retains the exact projection/selection/mounted-canvas guards. Explicit focus uses
manual scale/anchor plus a revision in the existing viewport key so repeated same-scale
focus after panning re-centers. No source/profile/history action or new renderer.
All five complete per-unit diffs reread against byte snapshots. Original browser checks
are intact; focus checks are additional. No hardcoded real-menu source coordinates in UI.

Fail-first missing helper export retained in presentation-red.log. Presentation full pass.
Mounted focused checks first found absent dimensions in the event-only DOM, then its select
value property not tracking React-selected options. Local fixture now supplies640x320 and
reads actual selected option state, as other mounted tests do. Live guards not weakened;
real layout/scroll/pixel proof remains required from the browser. Focused mounted pass,
including stale retained callback and zero source submissions. Full mounted subsequently passed.
Typecheck-final and lint-final pass. Degradation called; finish only this bounded unit.

Guard reconciliation: baseline used previous36-input guard before edits. Two of those
are this unit's explicitly declared presentation owners. Unit-local guard removes those
two from OLD baseline expectations (34unchanged old inputs); fresh31pins include their
current hashes before/after rendered run. Other26 fresh independent pins, four originals,
19 protected files and directory membership remain exact. Prior guard script untouched.

## VALIDATE / REVIEW / CLOSE — 2026-09-13 10:54Z

Status PARTIAL, not a VERIFIED close. Focus interaction is implemented and visually proven;
the complete working-view roundtrip has an observed reopen defect. Full goal ACTIVE/PARTIAL.

Required commands (exact argv, times, exits and logs are in matching evidence JSON):
- presentation-full: exit0; all existing tests plus B119_SELECTION_FOCUS_GEOMETRY.
- mounted-full: exit0; complete editor matrix, new stale-focus negative, existing scenario
  first-render/profile-input continuity markers. No focused-only environment override.
- typecheck-final, lint-final (five owned files): exit0. Owned git diff --check: exit0.
- rendered.mjs invokes unchanged standard run-e2e wrapper3200/3201,workers1,retry1:
  2passed/0failed/0flaky/0bad. Canvas-first14.4s; complete real MENU1.7m; batch3.7m.
  Both first attempts. Original browser assertions/lines all retained;120s deadline unchanged.
- verify-results.mjs: exit0 at10:54:22Z, receipt.json. Verifies all31currentpins,
  26independentbaselinepins, five backups, four required command receipts and E2E lifecycle.
  Four original Lua sources,34olderinputs,19protectedfiles and membership unchanged.
- Independent downloaded bytes: untouched90060bytes equals original SHA
  8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD;
  edited90064bytes ONLY SEND->TRANSMIT, SHA
  0E6459062CF1B918DEBC9492D8098F0AD76686773352469B2E689250E8C4D674.
- Post-run10:54:37Z: X4 absent,3000/3001/3101/3200/3201 no listeners;3100/PID8256
  remains. Standard lifecycle treeGone=true. HEAD/main unchanged. No protected writes.

Visual review used actual browser screenshots, not generated images. At1280 and1024,
builder-focused images show readable text, reachable focus button and appropriate toolbar
wrapping. Real-MENU-focused and edited show readable SEND/TRANSMIT at100%, correct selection
and visible surrounding input-bar context. Real-MENU-reopened instead shows a BLACK viewport
at100%, no selection, and a disabled Focus button. Native canvas signature and hierarchy
still match the edited version. These are different proof layers; the screenshot wins for UX.

[REPRODUCED] Reopened working viewport is blank after the focus/edit/export/new-workspace/
import/sample journey. [HYPOTHESIS, ~85%] Manual scale survives the workspace transition
while focused camera position is lost; the exact lifecycle transition is not isolated yet.
Existing camera effect resets scroll when the viewport key changes and no anchor exists;
this is an inspection lead, not a confirmed causal reproduction.

Acceptance reconciliation: screenshot inspection exposes an unasserted visible-reopen
requirement. Native-bitmap equality alone does not fulfill appearance-preserved authoring.
The receipt therefore records PARTIAL even though all automated checks pass. No original
assertion is removed, and no native/canonical geometry or source authority is relaxed.

Requirement review:
1. Pure invalid/clipped/small/large focus and existing whole-frame fit: DONE, full test.
2. Explicit guarded focus and repeated same-scale recenter: DONE, mounted plus browser.
3. Stale retained callback, no automatic selection zoom, zero source writes: DONE.
4. Native bitmap/profile/history/source/hit-test/narrow viewport: DONE, browser assertions.
5. Full declared automated gates and real screenshot/export review: RUN; screenshot review
   fails visible independent reopening. This behavior remains OPEN, not deferred as complete.
6. Protected owners/bytes/process cleanup and records: DONE; overall unit remains PARTIAL.
Missing-input recovery, broader menus/references, installed/full/native/release: still OPEN.

Fresh-eyes code-review skill: reread all five complete per-unit diffs against byte snapshots;
no source/history/profile write added, no renderer duplication, original browser checks intact.
reviewctl unavailable (already known); no installation or invented automated review claim.
No external capability-map write authorized: local delta is explicit preview focus with
reopen UX limitation. ROADMAP verified history not updated for this partial unit.
Rollback remains exact reviewed owned hunks against .bak files, preserving all older work.
Suggested commit after repair/gates: feat(ui): focus selected elements in the source canvas.
NOT staged/committed/pushed; no release, install, game/mod/save/config writes.

## AAR — non-clean

- Triggers: expected fail-first, two mounted-fixture corrections, screenshot finding changed
  acceptance status, one close-doc patch context typo (no write, corrected and checked),
  oversized combined output. Degradation already called; no further behavior unit this turn.
- Sustain: preserve original oracles and use source-byte, native-bitmap AND visible viewport
  proof independently. Screenshot review prevented a false VERIFIED close.
- Improve work: add visible content assertions after independent reopen, not only pixels
  inside an offscreen canvas. Next unit reconciles camera ownership before missing-input UX.
- Improve tools: event-only DOM needs explicit measured dimensions/selected-option reads;
  browser remains the layout authority. Emit one screenshot per call and bound output.
- Highest-risk evidenced weakness: machine-green offscreen pixels can hide a blank working
  view. Bounded follow-up: assert visible reopened caption, then repair existing camera
  lifecycle without autozooming ordinary selection or persisting stale selection authority.
- Project lesson banked here and in SESSION-HANDOFF/BACKLOG. No global-memory/wiki writes.
