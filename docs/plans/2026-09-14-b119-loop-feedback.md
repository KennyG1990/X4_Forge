# B119 automatic loop feedback

Lane FULL. Status VERIFIED for focused browser feedback; full B119 remains PARTIAL.
Parent main6fe7b844c1d9bbb7f6cdf1d2110f8fac08b33ce2.
Full goal remains ACTIVE/PARTIAL; this is the visible follow-through to source-loop recovery.

## Plan and reconciliation

Goal: source-proven iteration counts must be visible without becoming manual preview state.
Reuse X4UiSourceEditorPreviewLoops, session.previewLoopSelections, explicit session.loops,
existing update/reset callbacks and Inspector placement. Graphify confirms this component and
its existing selftest owner. Agent-brain returned an old reference-API/header match, not a
verified prior solution. Original brief/approved canvas-first plan and source truth retained.

Chosen design: explicit status beside each optional override. Automatic from source: N
iterations when effective replay exists without a manual selection; Manual preview: N when
explicit state exists; otherwise Count unavailable: enter a preview override. Keep number
input empty when no manual override, with automatic-count placeholder and explanatory text.
Reject showing recovered values as editable/persisted user values: clearing would refill the
input and obscure authority. No renderer, source, session, schema or history rewrite.

Owned: src/components/X4UiSourceEditor.tsx, its selftest.tsx, and
tests/e2e/x4-ui-source-editor.spec.ts. Record changes only in this plan/handoff/backlog.
93 unrelated changes preserved; index empty at baseline. No new endpoint/dependency,
spend/network/delete/config/install/mod/game writer. Existing controls remain behind Inspect.
Rollback: exact owned diff against6fe7b84, not broad reset/clean.

## Acceptance and validation

1. Automatic count visible, override input empty and no event/state mutation on render.
2. Manual override visibly distinguished; reset/clear returns to automatic source count.
3. Unknown count remains unavailable, never called automatic; invalid count rejection and
Not verified in game remain intact. Source/profile changes must use current projection only.
4. Add pure markup and existing mounted-handler checks; complete component selftest,
types and exact lint. Existing handler/stale authority tests stay strict.
5. Extend current mounted-PNG E2E journey with automatic/manual/reset checks and screenshot
at test.info().outputPath. Run this focused journey using standard isolated run-e2e, one
worker,3200/3201, after writer/process/state audit. Retain structured verdict and inspect
actual screenshot. Focused run is not full E2E or installed/native/full-HUB acceptance.
6. Freeze executable/test inputs per run, preserve live/protected files and verify cleanup.
Evidence root:test-results/b119-loop-feedback-20260914/. Review complete owned diff and
record failures/AAR honestly. Normal precommit before any local commit; no interim push.

Outstanding: generic tab labels, rowH/y, body dispatch, full9journeys/3menus/12references,
complete post-change E2E, packaged/installed and native proof remain required.

Reconciliation: the component suite's literal2-loop fixture still expected one unresolved
sample. Source-loop default now correctly issues two independently identified iteration
samples; update that expectation and assert indexes1/2, unique IDs and no manual state.
Initial failure preserved in component-first.log. No unknown/invalid-input assertion removed.
Writer audit: selected browser journey has four screenshots, all test.info().outputPath;
its two downloads use Playwright-managed temporary storage, no saveAs/custom download path.
Other spec writers enumerated, unchanged from the previous audited full run; three added
captures use only per-run paths. Standard setup/ephemeral helpers isolate config/workspace,
studio cache/discovery and servers; no live workspace seeding. Full component selftest has
no direct screenshot/writeFile/copyFile writer. Machine14:50Z: X4absent, only Deckwright3100.
Canonical --list found exactly the one selected existing PNG-export journey. No test skip,
deadline change or assertion relaxation. Source/UI bytes frozen for every run.

Rendered failure (browser-first, both attempts): clearing4 retained4. Cause reproduced in
the existing owner: updateX4UiEditorLoopState explicitly rejects empty text and restores
the last valid manual state. The new optional-override UX requires a per-loop clear, not
reset-all or DOM-only clearing. Extend owned files to src/lib/x4UiEditorSession.ts and its
selftest. Treat exactly empty string as removal of that validated loop selection after
catalog/authority/entry checks. Preserve all other overrides and normal numeric validation;
whitespace/null/zero/malformed/stale/forged authority remain rejected as applicable.
This intentionally supersedes the legacy empty-string refusal assertion, not the numeric
count bounds. Add two-loop preservation/no-op/forged-authority checks and keep the failing
browser clear assertion unchanged. Retry only after terminal treeGone and new frozen inputs.

Rendered review of browser-first/b119-loop-automatic.png shows internal ID text dominating
the inspector and pushing the override below its visible area. Refine the same component:
human ordinal loop heading; status and override before source diagnostics; exact source
range/metadata retained in a collapsed Source details disclosure. No diagnostic removal.
Add rendered visibility/source-disclosure checks; capture current automatic/manual/reset
states only after the control is in view. This is an evidence-driven presentation adjustment.

## Validation / review / close (2026-09-14 15:13Z)

Complete component selftest PASS (component-presentation); complete EditorSession PASS
(editor-clear); types-presentation/lint-presentation exit0. Final focused browser-clear
journey passed1/1,0failed/flaky/skipped/reporterrors, first attempt30.9s. It covers automatic
display, manual override, clear, reset, source disclosure, accessible name, unchanged server
workspace, existing profile/export/stale/serialization negatives and zero browser page/console
errors. Independent verify.mjs exit0 -> verification.json.413 frozen inputs,50 protected
artifacts,4 real Lua sources,19 live files unchanged; treeGone=true and only original
Deckwright3100 listener remains. No arbitrary Lua execution or installed/native claim.

Main agent inspected browser-clear automatic/manual/reset PNGs at1280x720. Status, optional
input, compact disclosure and reset are visible. The surrounding canvas is visibly stale
for this diagnostic loop fixture; these screenshots are NOT proof of full-menu geometry.
They are genuine rendered isolated-app captures, not generated artwork. Four PNGs have
independently verified containment, dimensions and hashes. Readable evidence:RESULTS.md.

Review: complete owned diff; no new state owner or renderer. Exact empty string is a scoped
clear action after existing authority/catalog/entry validation; not numeric coercion. Two-loop
test preserves the other override, proves repeat no-op, and rejects unknown/forged/stale
authority. Source metadata retained, no internal IDs in the input's accessible name.
Local capability delta: automatic/manual/unknown count feedback and per-loop clearing;
no external capability/issue/wiki/memory write. Full132/132 E2E predates these source changes;
complete current E2E, real-menu labels/y/body,3menus/12references,installed/native remain open.
Normal installed precommit required before local commit; checkpoint/post-commit.json will
record actual outcome. No push/publication/install/mod/config write.

## AAR (triggered)

Sustain: real browser caught a behavior the markup checks missed; preserve failed attempt
and original clear assertion. Screenshot review directly improved visible control placement.
Improve approach: initial implementation assumed empty text was already a clear operation;
owner explicitly refused it. Reconciled contract and tested per-entry removal before retry.
Improve tools: one numeric PowerShell-count typo, one missing runner-path lookup and an
oversized file listing wasted reads. Use known returned filenames and capped outputs.
Component suite emits React duplicate-key warnings in synthetic sampled fixtures; do not
translate its green exit into a zero-warning claim. The focused real browser has a strict
zero-console-error check, but broader current E2E is still needed before release.
Highest-risk observed weakness: automated component success did not prove a user could
clear the input. Keep actual clear/reset interaction and workspace-readback checks.
Lessons banked here only. Rollback is exact owned diff;93 unrelated dirty paths preserved.
Next substantive unit: source-bound generic ipairs tab-label recovery, then rowH/y and body
dispatch. This feedback unit does not replace or narrow the full goal.
