# B119 same-element inspector scroll continuity

Status: VERIFIED (bounded scroll unit); full builder PARTIAL. Lane: FULL. Parent: B119 / #41.
Goal: Apply a property and continue editing at the same inspector position.
Architecture: a disposable visual scroll snapshot in the existing SourceEditor, captured
only for accepted scalar/property additions. Existing exact parent acknowledgement and
selection transfer confirms the fresh element; restore after its actual DOM has committed.
Tech: React layout effect/ref, TypeScript, mounted event tests, isolated Chromium.

## BASELINE / RECONCILE / PLAN

Previous goal turn PROGRESS: row-top renderer repair and independent visible regression
proof. Full objective retained:9journeys/3menus/12references/full integration/installed/native.
Current guard06:32:29Z PASS, HEAD93c9af1,410pins/50priorartifacts/4realLua/19live membership.
Graph: SourceEditor imported by UIBuilder/App, owns source/session/builder consumers.
Recall was a weak July broad-Forge design discussion, not a scroll repair. Read current
source, handoff, backlog, ADR-F1/F5 and capability map. No capability-map delta.

Observed browser log: Alignment Apply scroll286->0. SourceEditor6760 renders a short empty
selection while the source identity changes; selection-transfer hook restores exact selection
after parent readback/ack. Browser clamps the now-short inspector. No explicit scroll reset
exists in this panel; canvas camera code is separate and must not change.

Alternatives: retain old controls (reject stale authoring surface); fixed minimum height
(reject arbitrary layout/empty space); scoped scroll restoration after exact reselection
(selected). Snapshot confers NO write, source, selection or history authority.

Owners: src/components/X4UiSourceEditor.tsx, its selftest.tsx, and
tests/e2e/x4-ui-source-editor.spec.ts. Reuse selection-transfer onSelect, current workspace/
scope/profile/selection epoch, existing Apply/draft/receipt/sourceSplice paths. No renderer,
parser, history, source writer or other module changes. Small hook in same component file
isolates visual snapshot tests; no persistent store or new authoring state format.

Acceptance:
- Real existing Width/Top padding/Alignment journey asserts exact inspector scroll before
  and after Apply; nonzero Alignment position and control remain visible without rescrolling.
- Add-missing-property flow also keeps scroll clamped to legitimate new content bounds.
- Capture only changed ordinary property edits, not structural selection changes/no-ops.
- No restore before confirmed same-element selection; cancel on workspace/scope/profile/
  selection change, parent refusal/rejection, unmount or later user pointer/wheel/key input.
- A late older refusal cannot cancel a newer snapshot. Source/CAS/history tests unchanged.
- Existing selection/recovery and property source/UndoRedo browser behavior stays green.

Validation: fail-first existing layout browser assertion; mounted hook positive/negative
tests plus full current SourceEditor selftest, full typecheck and scoped lint; serialized
browser layout/missing-properties/locked-recovery on3200/3201, workers1, screenshots under
test.info().outputPath. Confirm both stacks stopped and all protected inputs unchanged.
Actual DOM layout proof belongs to Chromium, not the event-only mounted harness.
Evidence:test-results/b119-inspector-scroll-20260914/. New baseline from prior types-final
receipt, exact3owner bytes for rollback; no rebaseline/overwrite failed receipts. Restore
only task delta if needed, never HEAD over dirty work. Read full diff and record close/AAR.

Out: Git/commit/push/release/install/reload, real mod/game/save/config, external wiki/issues/
global memory, agents, right-edge glyph repair. Native fidelity not claimed or waived.
Risk: restoring into a different panel or fighting user input; negative tests required.
Continue-safe-work objective overrides routine skill pause; genuine external gates remain.

## CLOSE / AAR

Reconciliation update06:48Z: first rendered run2/3, layout Width0->8 failed twice;
missing additions and locked recovery passed. Trace call491 explicitly scrolls the Apply
button into view after the original pre-click measurement. Test now exposes that ordinary
pre-click positioning before taking its baseline (same as Add property). Exact equality,
nonzero Alignment and post-Apply visibility remain required; no post-Apply rescroll allowed.
This is an oracle timing hypothesis to test, not a product failure dismissed by inspection.
All failed receipts remain. No product change for this test baseline adjustment.

IMPLEMENT: disposable inspector ref snapshot in SourceEditor only. Capture changed scalar
and missing-property edits, restore after existing exact selection confirmation/layout
commit, clamp to current bounds. Cancel on context/selection/user input/refusal/rejection/
unmount. Attempt identity prevents old refusal cancelling newer view intent. No source,
history, renderer, deployment, persistent state or authority owner changed.

VALIDATE (evidence directory above; receipts include exact commands/time/input hashes):
- rendered-red: FAIL expected286/actual0 twice, proving original bug; protected guards PASS.
- mounted: PASS exit0 full SourceEditor selftest, including scroll10/10 and existing parent
  acknowledgement/selection/CAS/history matrices. Event-only DOM is not layout evidence.
- types, types-final, types-positioned: PASS exit0 full tsc --noEmit.
- lint, lint-positioned: PASS exit0 scoped ESLint on all3 owners.
- rendered: FAIL2/3, Width0->8 twice; missing additions and locked recovery PASS.
- rendered-positioned: PASS3/3 first attempt,0flake/skip/reporterrors,26.5/15.2/13.9s.
  Exact Width8->8, Top padding8->8, Alignment286->286. Missing Alignment232->215
  (actual new maximum), Font size229->229. No post-Apply rescroll; actual controls visible.
  Original exact Lua/workspace/history/UndoRedo/pixel/sibling checks retained and green.
- Inspected actual text-properties-after-font-size.png and layout-alignment.png. Inspector
  remains on edited controls. Existing right-edge text appearance remains unresolved.
- Final receipt06:49:19.742Z treeGone=true, both isolated ports stopped, X4absent, only
  Deckwright3100/PID54964. Guard06:49:43.582Z:410pins/50olderartifacts/4realLua/19live
  files+membership and HEAD93c9af1 preserved. Every job terminal; no worker remains.

REVIEW: complete baseline-relative3owner deltas read; final test-only positioning change
reviewed separately. Existing unsupported/no-op/structural guards retained. All scoped
requirements evidenced. No capability-map delta. reviewctl unavailable on PATH; manual
source/caller/diff review plus scoped ESLint used; no tool installation or rule changes.
Native/installed/full-integration validation not covered by this bounded UI repair and
remains required for full builder; gameVerified=false. Red shelldiff status1 meant changes,
not a failed application check. Git/issue/wiki/config/release/mod/native writes not done.
Rollback: exact original3owner bytes in baseline.json; undo task delta, not dirty HEAD.
Commit point: fix(ui): retain inspector position after property edits (not committed).

AAR: NON-CLEAN; fail-first and test baseline reconciliation plus truncated reads.
Sustain: protect source/history authority, test exact scroll and pixels in real Chromium,
retain every failure receipt, verify complete runner verdict and cleanup.
Improve approach: click auto-positioning belongs before the measurement; original reset
masked this distinction. Record the correction rather than relaxing exact equality.
Improve tools: receipts contain hundreds of pins; select summary keys before printing.
Lost tool output recovered using terminal receipt/process evidence, without restarting jobs.
Highest-risk observed weakness: a broad panel collapse can destroy disposable view state;
confirmed-instance restoration now has lifecycle negatives and rendered regression proof.
Project lesson banked here; no external/global memory writes. Full objective still active.
