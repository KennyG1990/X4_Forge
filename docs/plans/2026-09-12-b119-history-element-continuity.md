# B119 history element continuity

Lane: FULL. Status: PARTIAL (scalar history browser passed; full editor suite still red).
Direct Astra implementation; no agents or Git mutation.

## Plan / baseline / reconcile

Bounded unit: retain the selected element and editable inspector after an exact scalar Undo/Redo.
This repairs objective journeys3/4/8; it does not narrow any other authoring or native fidelity gate.
Baseline: test-results/b119-history-selection-20260912/baseline.json (07:13:49.5694865Z),
HEAD93c9af111d63ca77c99dee11f21882c4073bcda6;35inputs unchanged from the red rendered run,
four byte snapshots of the intended owners. Unrelated dirty/deleted/untracked files preserved.
Existing rendered property regression fails at spec1424 after exact source/fresh-canvas Undo;
no extra baseline browser run is needed on these identical bytes.

References: original FORGE-UI-EDITOR-BRIEF, approved canvas-first plan, source-history plan133+,
current SourceEditor/App/UIBuilder/workspaceUndoHistory and source-issued edit/presentation owners.
Read capability map: no current selection-continuity claim; no capability-map delta for partial work.
Graph path confirms existing SourceEditor/history test coupling. No new history store/writer needed.

Alternatives: stale node-ID reuse is rejected because source identities change; unconstrained text
diff mapping is rejected because structural swaps could select a different element. Selected approach:
reuse the existing exact-span fresh-node resolver, accepting only an unchanged source or a single
literal replacement described by BOTH old and fresh scalar catalogs, with byte-identical surrounding
source. Catalogs supply compatibility facts only; old authority never authorizes a write.

Files: src/lib/x4UiBuilderPresentation.ts and .selftest.ts; src/components/X4UiSourceEditor.tsx and
.selftest.tsx. No App/UIBuilder/history schema/source edits/renderer changes planned. Existing E2E
property case remains unchanged and must pass. Other7failed cases remain separately open.

Implementation steps:
1. Extend presentation source-span continuation with a narrow kind/source anchor and scalar-history
   resolver. Require one unique fresh compatible node; reject missing/ambiguous/cross-file/structural
   changes and edited surrounding bytes. No Lua execution or generation.
2. Capture the selected anchor/catalog/profile with existing menu intent; carry it only through exact
   App readback notice and current scope/epoch. Restore source/target first, wait for fresh projection,
   then issue a NEW selection using fresh workspace/source/target/profile keys. Explicit element
   selection/clear invalidates the carry. No draft/receipt/paint/verification transfer.
3. Strengthen existing mounted history regression with retained inspector/node on Undo/Redo and
   stale/interruption controls; add pure resolver rejection controls. Preserve all existing checks.

Validation: pure BuilderPresentation selftest; whole SourceEditor selftest (includes Chromium layout);
whole-repo tsc; strict four-owner ESLint; exact diff review. Rendered property/recovery case via existing
run-e2e.mjs serial3200/3201 with unchanged retry/flake/cleanup policy, unique evidence directory;
inspect screenshot/source/selection results. Guard35inputs and19persistent files before/after browser.
Required negatives: unchanged source, longer/shorter literal, ambiguous/missing node, wrong path,
multi-literal/structural change, stale/scope/external restoration and explicit selection interruption.
No skip/retry/timeout weakening. Full E2E, installed/native fidelity, COMM numeric and scenarios remain
required but outside this bounded repair. If a required test fails, record the exact reached failure.

Risks: inappropriate restored selection or delayed notice overriding user intent; fail closed on any
ambiguity. Rollback only this unit's exact patch using four snapshots as reference, not whole dirty
file restoration. No network/spend/delete/persistent preference or real mod/game/config surface added.
Evidence under test-results/b119-history-selection-20260912; update this plan, BACKLOG and handoff.

## Close / AAR

Pending. Previous turn PROGRESS: completed16-case rendered run and evidence-driven failure triage.
No release/install/commit/push; public releases remain the only push points. Degradation checkpoint
was honored; this is the fresh bounded repair. Current source inspection is not completion evidence.

Reconciliation amendment07:22Z: pure/typecheck passed, but full SourceEditor run07:21:13..07:21:41
failed before history regression: Lua async double-action/superseded/reentrant expected1submission,
observed0 (6/9matrix passed). Cause not assumed. Temporarily reverse ONLY this unit's four exact diffs,
run unchanged baseline SourceEditor, then reapply the stored exact diffs and verify hashes. Do not
restore whole files or alter unrelated changes. If baseline also fails there, place existing history
regressions earlier in the same suite so they execute without skipping or weakening any import check.
Full suite remains red until the independent failure is repaired; original goal keeps import required.

Rendered amendment07:29Z: unchanged property E2E now passes title Undo/Redo selection assertions,
then fails at1462 using a dynamic-row ID cached from pre-edit offsets. The title literal changed later
row offsets, correctly issuing a new ID. Reuse the existing source-model selector producer with the
actual post-Redo workspace; do not use labels/DOM order instead of source identity. Add the existing
tests/e2e/x4-ui-source-editor.spec.ts to this unit's exact write set (snapshot alongside other4).
All property/recovery assertions remain; add a real restored-inspector screenshot. First browser
run's structured0/1red/0flake receipt and cleanup are preserved as e2e-first-verdict.json.

## Implementation / review checkpoint

Implemented the documented scalar-history resolver and exact notice/epoch continuation in existing
presentation/SourceEditor owners. Old anchor contains kind/source only; catalog comparison never
authorizes a write. Both parsed catalogs must agree on one literal interval and unchanged surrounding
bytes; ambiguous/missing/cross-file/structural changes stay unselected. No source/history schema,
renderer or deployer change. Explicit element selection and empty/stale canvas clicks cancel carry.
Tests retain all prior assertions and add10pure compatibility controls, fresh selected inspector on
Undo/Redo, same-element reselection, explicit new-element interruption and external-replacement guard.

Validation evidence: test-results/b119-history-selection-20260912/receipt.json and named raw logs.
- Pure presentation + whole tsc initially passed07:18:51..07:20:29.
- Full SourceEditor07:21:13..07:21:41failed before history; exact35-input baseline07:23:29..07:23:47
  reproduced identical3import matrix failures. Exact-unit patches reversed/reapplied via apply_patch,
  no whole dirty-file restoration. Both mounted history suites then passed07:24:37..07:25:06 before
  unchanged import matrix6/9red. Browser layout subchecks2/2and3/3passed; full suite remains FAILED.
- Browser07:26:00..07:27:59passed Undo/Redo but failed later stale source-ID selector; clean cleanup.
- Fresh-ID test had a TypeScript minimal-workspace alias mismatch; corrected API readback type.
  Final whole tsc and strict5-owner lint0 at07:32:28..07:33:32; final pure test0 too.
- Final browser07:34:29.0715327..07:35:30.3457676:1passed/0failed/0flakes/0skips, structured green,
  complete lifecycle/ownership/treeGone. Full property/recovery journey reached its final assertions.
- Independent07:36:28.8533019Z:35input hashes unchanged through final browser; exactly5intended
  deltas from task baseline,30protected inputs unchanged.19persistent guards identical/no additions
  or deletions.3200/3201closed,3100still59340 (fresh run baseline; it was46444 in the older16-case run).
- Real1280x720 restored-inspector PNG inspected: selected Text and editable recovered title remain
  visible after Redo, with persistent canvas/hierarchy. Unsupported fixture geometry remains honestly
  unresolved; this is selection/inspector evidence, not native fidelity or a polished complete menu.
- Complete five-owner unit diffs independently reviewed; no unrelated source changes, weakened
  assertions or retry/timeout changes. Exact tracked diff check0. Graph refresh07:36:32..07:37:54exit0:
  11516nodes/29017edges/357communities, deterministic AST/no LLM. Existing safety limit skipped HTML.
  Final07:39:53.3248851Z source recheck:no drift; no owned test/static/graph command remains running.

## Close / AAR outcome

Overall PARTIAL: scalar editing-history journey has browser proof; full SourceEditor and broader goal
remain incomplete. No capability-map delta; no VERIFIED full-lane/release close or Git mutation.
No publish/install/config/game/mod/save or external ledger/memory write. Public releases are the only
permitted push points; nothing was pushed here.
Next: diagnose import matrix's actual refusal/status before changing timing; reconcile other7rendered
failures and profile~6sactions. Numeric COMM, local scenarios, all9journeys/3menus/12references retained.

Triggered AAR: initial full test failures, baseline counterfactual, new later E2E failure, test type
correction and repeated truncated reads. Sustain: follow real rendered failures, preserve source-owner
authority, prove baseline before calling a failure pre-existing. Improve: source-derived IDs must be
reissued after edits; type the API readback to its actual full workspace contract. Tool improvement:
emit compact diagnostic fields; do not guess installed module paths (graph CLI source lookup missed).
Highest-risk observed weakness: import matrix expects parent submission but receives none; negative
zero-submission checks may be passing because an earlier import refusal masks their intended scenario.
Bounded next experiment: expose exact refusal/status in failed matrix cases, preserve all timing and
rejection expectations. Lesson banked here; no global memory/skill update.
