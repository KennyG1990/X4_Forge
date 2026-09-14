# Scenario continuation through source edits and history

Lane: FULL. Status: PARTIAL. Owner: existing B119 issue41; no external writes.
Previous goal turn: PROGRESS (named Save/Select/Remove/reload implemented and rendered).
Goal: selected scenarioB survives source editA, Undo and Redo, including the first pre-App-ack render.
Keep the complete goal and all prior native/numeric/long-text obligations; no narrowed completion.

## Reconciled design / acceptance

Use existing SourceEditor source-edit result/splice and UIBuilder acknowledgement, existing App-owned
workspaceUndoHistory, and existing local scenario store and public Session replay. Reject scenarios
in ModWorkspace (source undo would undo preview choice); reject an independent history/renderer.
Add optional exact source-splice metadata to the existing source history receipt/entry. It authorizes
no source write. Source before/after bytes must prove the splice each time before data is remapped.
For row permutations use source-owner upper/lower retained byte spans, validated against both texts.

SourceEditor retains current applied preview data across the exact submitted workspace transition.
App passes the existing guarded pending history target as a preview-only continuation on the first
target render, using the same settlement predicate; source-history mutation still waits for readback.
Map exact source ranges, type, consumer field/call/range and loop iteration identities. Never fuzzy
match a name/expression, copy old opaque authority, or substitute geometry. Reissue paths->loops->samples.
Persist successfully migrated scenario DATA at exact new source/menu identity using the existing local
store; scenarios remain outside source undo snapshots. B chosen after editA remainsB after Undo/Redo.
Quota failure must preserve old stored data and retain current preview honestly; ambiguous or changed
input mappings must fail closed and preserve independently known content rather than invent geometry.

In scope: supported scalar edits, zero-length insertions and adjacent row permutations; source/history
first-render and duplicate/refused/wrong-scope guards; local saved-scenario data migration and feedback.
Out: new Lua grammar/renderer/history/deployer, long-text geometry repair, game/install/release writes.
Risks: source remap to wrong consumer; transient first-render input loss; old storage overwrite; cross-
workspace leakage. No new network, credential, spend or external deletion surface. Local store remains
bounded20records/240Ki code units; no eviction or unrelated-key writes. ADR-F5 scope remains immutable.

## Baseline / evidence / rollback

HEAD/main93c9af111d63ca77c99dee11f21882c4073bcda6. Existing source and extensive unrelated dirty files
predate this slice. Prior named-scenario receipt at test-results/b119-named-scenarios-20260913/receipt.json.
New evidence:test-results/b119-scenario-continuation-20260913/. Exact before copies and hashes required.
Rollback only task-owned deltas against those copies, never git reset/checkout. No Git mutation.
Graph orientation exposed SourceEditor selection-transfer/testing/history relationship (ambiguous
target match); live code establishes actual App/UIBuilder couplings. Recall match was an unrelated
July reference-API note and was not used as evidence about scenarios.

## Files / steps

1. src/lib/x4UiPreviewScenarios.ts + selftest: exact splice interval/retained-span mapping, fresh target
   selection and scenario replay/migration; fail-first forward/inverse/foreign/ambiguous tests.
2. src/lib/workspaceUndoHistory.ts + selftest: optional immutable source metadata and guarded pending
   preview notice; existing history semantics/CAS/40-entry bound unchanged. No scenario values here.
3. src/components/X4UiSourceEditor.tsx and UIBuilder.tsx, src/App.tsx: forward source metadata, early
   exact preview continuation, reconcile existing sample state/selection without a blank first render.
4. src/components/X4UiPreviewScenarios.tsx: existing local-store migration and honest refusal/quota UI.
5. Existing SourceEditor mounted tests and tests/e2e/x4-ui-source-editor.spec.ts: B-after-A/UndoRedo,
   readable distinct values, exact source bytes and history boundaries; insertion/permutation coverage.
6. Review whole delta, preserve negatives, document close/handoff/AAR, graph update. No external writes.

## Validation contract

Required: focused scenario and workspace history tests, SourceEditor mounted first-render regression,
source-edit regression, typecheck, exact lint/whitespace; isolated serialized rendered source edit+
scenario/history journey and old primary/named controls on3200/3201. Inspect actual screenshots and
positive known geometry/content, not just pixel differences. Exact frozen unrelated/protected guards
before/after and complete owned process teardown. Stale/foreign scope, false/spliced endpoints,
duplicate notices, changed sample consumer, repeated iterations and quota failure must not claim success.
Full native/package/full E2E/precommit remain unavailable/outside this unit and stay required for goal.
Capability delta only if actual source/history continuation is verified. External projections deferred.

## Reconciliation during implementation

The source-edit and history lifecycle boundaries differ. History already has a guarded pending
target, so preview transfer is required on the first target render before App settlement. Forward
source edits must wait for the existing selection-transfer owner's exact acknowledgement; early
selector adoption cancelled its row-selection continuation. The implementation now captures preview
data at source submission and adopts it only through that existing acknowledged onSelect callback.
No acknowledgement oracle was relaxed. Committed preview epoch also follows selection-only renders.

Fail-first evidence retained: history-red.log, typecheck-first.log, source-editor-first through
seventh.log, browser-first.log/e2e-first-verdict.json. Extracted harnesses required their new closure
inputs; their old assertions remain. P12 detected unnecessary profile-only candidate materialization;
moving remap discovery out of ordinary selection fixed it. New mounted B-after-A/first UndoRedo and
the whole existing SourceEditor suite passed in source-editor-eighth.log before the added actual
row-permutation/insertion extension. That extension and final browser state still require validation.

## Close / AAR

2026-09-13 02:48Z checkpoint. Planned unit PARTIAL; scalar scenario-history rendered checkpoint
VERIFIED. Full goal remains ACTIVE/PARTIAL. Evidence:receipt.json; finalize.mjs verification exit0.
No Git, game/mod, install, release, config, global-memory or external issue/wiki projection writes.

Implemented: exact source-splice metadata in existing history; source range/consumer/loop remapping;
fresh Session authority; local-store data migration; acknowledged forward edits; first history target
projection before App settlement; retained inspector selection through equivalent pending/final
receipts; quota preserves stored bytes and current preview. Optional history metadata copies only
explicit source fields, excluding arbitrary attached state. No Lua grammar/renderer/deployer change.

Validation:
- history-final.log / scenarios-final.log exit0: metadata snapshot and no preview payload, pending
  pre-settlement and wrong-scope/clone guards, exact changed source/consumer and false-span refusals,
  public branch->loop->three independent samples, inverse B-after-A, zero-length range insertion,
  storage quota/corruption/bounds. Pure binding tests intentionally have no corpus/paint claim.
- browser-third.log/e2e-third-verdict.json:3/3,0failed/flake/skip, child+wrapper0, complete owned
  teardown. Primary inputs, original named scenarios, new A-edit/B-choice/UndoRedo; exact Lua bytes,
  no extra scenario history, retained text inspector, switching again after Redo, migration quota
  with byte-identical old store, successful recovery. Real configured corpus bytes; synthetic fixture
  readiness. This is not installed/native/full reference-readiness proof. gameVerified=false.
- Actual browser-third scenario-B-undo.png and scenario-history-quota.png visually inspected.
  B and its independent second text readable; title inspector retained; visible storage-failure
  feedback. Earlier browser-second captures exposed lost inspector selection and were superseded
  by the additional current assertion/fix, not discarded. Diagnostic UI clutter remains.
- source-editor-final.log exit1: ALL existing regressions reached their final unnamed-chunk PASS;
  current new scalar/first-projection/duplicate-notice assertions executed before the new required
  row-move assertion FAILED. Do not summarize this as a green SourceEditor suite.
- source-edits-final.log exit0:170/170 plus its existing detailed source/ledger negative matrices.
- typecheck-final.log exit0; lint-final.log exit0,0errors. Five App warnings independently matched
  the exact before-copy via app-baseline-lint.json/app-current-lint.json. No new warnings; core lint0.
- Existing E2E bytes/order unchanged after removing only the newly inserted test (finalize assertion).
- final-guards.json:40 independent inputs/4 real sources/19 protected config-state files and
  membership unchanged. final-safety.json:HEAD unchanged, X4stopped,3000/3001/3200/3201 absent,
  external3100PID60188 untouched. Exact before copies and SHA256s in baseline-hashes.json/receipt.json.
- AST graph update exit0:11586nodes/29238edges/343communities. Oversize HTML skip expected.

REQUIRED FAILURE, NOT WAIVED: Move down with active preview inputs is offered but refuses before
parent commit: "structural edit did not produce the exact intended call and operation ledger delta".
New test runMountedPreviewScenarioHistoryRegression keeps its positive assertion RED (entries1,
expected2); insertion-with-active-inputs assertions below it are NOT REACHED. An earlier two-row
fixture also failed catalog admission because its last row block included another table; a bounded
three-static-row/two-sampled-row fixture now reaches the actual owner refusal. No source-owner oracle
was relaxed. Next unit must reconcile reparseStructuralAndProveUnsafe / issued-color reprojection /
complete structural ledger in x4UiSourceEdits.ts, including preview-input source binding, then prove
the original row/insertion/scalar/negative oracles plus current browser journeys. Do not clear B or
change this positive into a refusal test merely to make the suite green.

Review outcome: scalar/history/storage scope done and evidenced; structural continuation partial and
red; insertion unverified. Full native/package/full E2E/precommit deferred, still required for goal.
No capability-map delta for structural support. Scalar continuation delta recorded here only;
external capability/issue projection remains deferred by write scope. Review skill drove complete
owned-diff inspection and extra state-whitelist/inspector/quota checks. reviewctl and configured
BlastRadius path unavailable; manual review, graph orientation, tsc and lint used instead.
Suggested eventual commit:feat(ui): retain local preview scenarios through source history.
NOT committed: required structural test remains red and precommit/release gates have not run.

AAR (non-clean):
- Sustain: independent exact source/consumer bindings, first-render mounted assertions, real readable
  screenshots, protected hashes and source-only history, no weakened existing safety comparisons.
- Improve work: source-edit acknowledgement and App history preview are distinct lifecycles. Early
  automatic selector adoption cancelled row selection; selection-only commits also advanced epochs.
  Two fixture assumptions delayed reaching the real structural owner boundary; source-shaped row
  fixtures must be reconciled against the existing admitted block boundaries before browser runs.
- Improve tools: extracted closure harnesses need new local inputs without weakening their original
  assertions. Whole SourceEditor reruns were expensive; next step should first build a small actual
  owner-based reproduction of the preserved ledger refusal. Bound output by characters, not lines.
  Browser-first wrong ARIA role corrected from observed treeitem state. One overlapping mounted/browser
  run was inefficient; later rendered runs were serialized. All failure artifacts retained.
- Highest evidenced weakness: an enabled structural edit can still refuse its exact reparse ledger
  when preview inputs are active. This blocks ordinary layout authoring; repair the owner coupling,
  do not bypass it or mark goal complete. Degradation checkpoint called; fresh bounded continuation.
- Project lessons banked here; no global memory/skills/wiki changes.
