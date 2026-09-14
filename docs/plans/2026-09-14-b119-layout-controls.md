# B119 ordinary existing layout controls

Lane FULL. Status VERIFIED (bounded control/evidence, 2026-09-14 05:00Z). Full goal PARTIAL. Previous turn PROGRESS: overlays verified.
Goal: edit supported existing dimensions/spacing/alignment on selected elements without Lua
or Inspect. This unit replaces alignment's free-text entry with canonical named choices and
proves the existing numeric controls through real source/history/canvas interaction.

Reconcile: SourceEditorSourceEdits already maps issued entries through BuilderPresentation,
then stages/apply via existing source/CAS/selection/history owner. Width/height/row padding
controls exist where explicit literals exist. Alignment is an ordinary text input. Plain
new Text insertion emits createText(text,{}); missing-property insertion is NOT implemented
by this change and remains required next work. No duplicate editor/source writer/renderer.
Graph query returned property nodes only, insufficient to establish relationships; current
source inspection is authority. Agent-brain June note is a weak match, not prior solution.

Reference: approved canvas-first plan/objective/brief. Shipped helper.lua at
F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00/ui/addons/ego_detailmonitorhelper/helper.lua
lines3206/3338/3421 explicitly documents horizontal text choices left,center,right.
Restrict selector to existing supported text halign entries; technical mode keeps raw field.
Preserve unknown current values with a visible retained option; never silently coerce source.
Choice writes still use onStage/onApply, same entry and exact string, with pending disable.

Design alternatives: three buttons give fast clicks but consume selected-pane width; a native
select provides keyboard access/labels compactly. Free text requires Lua vocabulary. Choose
native select Left/Center/Right, preserve explicit Apply/history transaction semantics.

Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, extensive existing dirty work. Own
only SourceEditor.tsx, its selftest.tsx, tests/e2e/x4-ui-source-editor.spec.ts. Baseline exact
dirty bytes and410pins from overlay rendered receipt; protect50artifacts/4Lua/19live files.
No Git/release/mod/game/install/config/network/wiki/global-memory changes. Source-only delta
rollback against three owner backups, never whole-file checkout. Reobserve machine before
rendered validation, isolated3200/3201,one worker, no live canvas replacement.

Acceptance/tasks:
1. Add fail-first friendly alignment selector test. Preserve generic string field in Inspect,
   unknown original value, pending disable, and existing source-entry authority/negative tests.
2. Implement bounded control in existing component. No parser, geometry or edit-owner changes.
3. Add actual browser journey with explicit supported Lua fixture: edit table Width, row Top
   padding and text Alignment without Inspect. Each Apply updates exact expected Lua and
   native canvas pixels; select retains current entry after reparse. Undo/Redo last alignment
   restores exact source/pixels. All other source bytes remain identical. Per-test screenshots.
4. Run tsc, scoped lint, full mounted selftest and rendered new journey plus existing selected
   properties/locked recovery. Inspect screenshot; complete receipts/guard/cleanup verification.
   Preserve all old assertions and deadlines. No full130/production/native claim.

Evidence:test-results/b119-layout-controls-20260914/. Baseline/inputs/receipts/logs/browser.
Risks: coercing unknown alignment, selector on unsupported fields, stale selection writes,
slow UI interactions. Negative: retained unknown + disabled pending; existing mounted stale
callbacks and rendered locked recovery retained. No core capability-map delta. Missing props,
3menu/12reference, remaining nine journeys and packaged/native/full integration remain open.

Pre-implementation AAR triggers: oversized reads, guessed corpus path and PowerShell glob
error. Corrected to scoped ui enumeration and actual helper path. Broad read-only rg finished
exit0 (session74647 terminal). Degradation call made; no extra unit after this bounded work.

Review refinement: first2browser tests PASSfirst, but screenshots leave Alignment below the
fold. Strengthen new test with actual control-in-viewport checks before interaction and final
capture; record before/after inspector scroll to distinguish remount reset from merely being
offscreen. Earlier reset explanation is a hypothesis until these observations. Right-aligned
text's last glyph appears clipped in screenshot; cause/fidelity unproven, retain as follow-up
in full renderer/experience obligation, not proof of native correctness. Product unchanged.

## Implement / validate / review

SourceEditor renders Left/Center/Right only for editable supported halign entries from
createText/setText/setText2/createEditBox. No default synthesis. Other imported strings stay
visible as Other value; technical mode retains its text input. Existing staged identity,
pending disable, exact onStage/onApply path and all other code remain unchanged.
Selftest adds selector/labels/selected value/unknown value/technical input/pending checks.
New browser case uses issued controls for width180->220, row padding0->12, left->right.
Every draft preserves source/history; each Apply changes only the exact expected literal and
canvas pixels. Last Undo/Redo restores exact Lua and pixels, selection and source-only history.
Original comments, function, sibling, registration and other workspace fields stay identical.

Evidence directory stores exact commands, UTCs, baseline bytes, inputs, raw logs and receipts.
- alignment-red exit1: expected missing-select assertion; guard clean.
- types and types-final exit0; lint and lint-final exit0.
- mounted complete SourceEditor selftest exit0; includes stale callbacks, missing-input and
  scenario/profile/history continuity. Product/selftest unchanged after this pass.
- review and review-final exit0: remove only declared presentation delta -> exact baseline
  product bytes after newline normalization; all old test assertion lines retained.
- rendered PASS2/2 first,0flake/0skip/0errors: layout21.5s, locked-property recovery17.0s.
- rendered-final PASS2/2 first,0flake/0skip/0errors: strengthened layout33.4s, recovery18.0s.
  Current tests bring controls into viewport before editing and capture visible final selector.
  Both owned stacks treeGone; final receipt04:59:56Z, all410pins frozen through each run,
  protected50artifacts/4realLua/19livefiles and memberships unchanged. X4absent; only
  Deckwright3100/PID69604. All sessions terminal, including47516/49166/80194/2580.
- Inspected layout-width.png, layout-top-padding.png, layout-alignment.png and final
  browser-final/...7da74.../layout-alignment-redo.png plus existing history recovery image.
  Width/spacing changes and readable Alignment Right control are visible with canvas and
  Inspect closed. No native/installed/full-suite or complete property-authoring claim.

Review: declared requirements1-4 done/evidenced. Existing-source editing is proven only for
this explicit supported fixture; missing-property insertion remains absent. No core
capability-map delta, no new source/renderer/history owner, no external/Git/release writes.

## Close / AAR

VERIFIED bounded selector and existing layout-edit evidence; full builder PARTIAL.
Commit point: feat(ui): offer named text alignment choices (not committed).
Triggered AAR: expected red, repeated lookup/output mistakes, visual-review refinement.
Sustain: preserve existing owners and assert complete workspace equality, not just changed
substring; inspect actual screenshots even after machine tests pass.
Improve approach/tools: avoid combined oversized reads and guessed optional filenames; use
known owned file paths or scoped enumeration. Extra guessed X4UiBuilderSurface.tsx lookup
failed because that optional plan file does not exist. No implementation was based on it.
Highest evidenced weakness [REPRODUCED]: inspector scroll227->0 on Alignment Apply, while
Width/Top padding0->0. Mechanism beyond observed scroll reset unproven. Next bounded repair
must preserve scroll for the same selected element after an accepted edit, without carrying
stale selection to a different source. Record an explicit before/after regression.
Additional [HYPOTHESIS]: clipped final glyph on right alignment may reflect paint/metric/clip
semantics; inspect source-derived text bounds and native evidence before changing the renderer.
Missing-property insertion on newly added text remains the larger authoring gap; do not
substitute more small presentation changes indefinitely. Project lessons banked here only.
