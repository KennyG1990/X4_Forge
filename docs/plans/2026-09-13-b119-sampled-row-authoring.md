# Sampled-row authoring and inserted-cell content

Lane: FULL. Status: VERIFIED bounded sampled-row authoring. Full B119 ACTIVE/PARTIAL. Existing owner issue41;
repo records only, no Git/external projections or protected writes in this unit.

## Design / reconciliation

Goal: move rows containing distinct sample values, add a row and text through the actual
palette, and Undo/Redo while every input follows its exact original source consumer.
Keep the canvas primary and saved scenario selected; never make the user repair Lua
or re-enter unchanged preview inputs after an ordinary structural edit.
References: full goal-objective.md, original FORGE-UI-EDITOR-BRIEF.md (corrected font/
column folklore does not override corpus), approved2026-09-10 canvas-first plan,
2026-09-13 structural-preview close, ADR-F5, current capability-map.

Existing owners: source structural edits and exact ledger already pass independent-sample
move/insertion; x4UiPreviewScenarios replay/capture and fresh Session input authority;
SourceEditor acknowledgement/App source history and contextual Add row/Add text palette.
Graph path connects transfer/capture through SourceEditor; current code shows exact
source-descriptor mapping then order-sensitive array readback. Hypothesis: reordered
catalogs make a valid transfer look incomplete. No rebuild or new UI owner is warranted.

Options: preserve array order (incorrect if source order legitimately changes); bind by
display label/index (ambiguous/wrong consumer); compare complete exact keyed bindings
and retain the fresh owner's canonical order. Use the last only if reproduction proves
the issue. Cardinality, duplicate, wrong-value/type/consumer and subset negatives remain
required. Do not reduce equality to an uncounted set or silently clear samples.

Scope: F:/DEV_ENV/X4_Forge/src/lib/x4UiPreviewScenarios.ts + selftest;
F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts; mounted SourceEditor selftest
only if needed. Reuse other owners without changes unless a new necessary failure is
reconciled/documented first. Out: loop-expanded structural editing, grammar/renderer,
long-text repair, real mod/game/config/install/native/release writes. These remain full
goal obligations, not dropped requirements. No new network/spend/permission surface.

## Baseline / recovery

HEAD93c9af111d63ca77c99dee11f21882c4073bcda6; extensive prior dirty work preserved.
Prior checkpoint's7owned source hashes unchanged. X4 stopped and all relevant ports
3000/3001/3100/3200/3201 absent. No workers. Baseline copies/hash/status:
test-results/b119-sampled-row-authoring-20260913/. Roll back only this unit's diff against
those copies. Prior external3100 termination cause remains unknown; no restart attempted.

## Steps / acceptance

1. Add a fail-first public Session permutation test with distinct values on equal-expression
   consumers. Prove source ranges, exact inverse/currentB history and canonical readback.
2. Run an actual browser move of sampled rows, Save scenario, insert row/Add text, exact
   Undo/Redo source snapshots, active scenario and readable values. Preserve red evidence.
3. Repair existing scenario readback only if causal; preserve complete typed keyed input
   multiset, reject duplicates/foreign/subset and return fresh canonical-order scenario.
4. Validate focused scenario/history, full mounted SourceEditor, SourceEdits regression,
   typecheck/lint, previous browser scenario/structural cases and new journey (serial3200/3201).
5. Inspect actual screenshots and exact Lua locality, frozen independent guards/membership,
   owned tree teardown, whole diff/old assertions. Record close/AAR/handoff and graph delta.

Required negative paths: duplicate saved sample/loop/path, conflicting branch arms,
foreign consumer/source identity, false retained span, stale history and local-store quota.
New control actions must not create preview values in Lua or extra history entries.
Evidence folder as above. Full E2E/precommit/package/install/three native menus/twelve
references remain explicitly required for goal, not evidenced by this bounded browser slice.

## Close / AAR

### Necessary scope reconciliation (before domain implementation)

Public Session permutation test is RED at order-sensitive scenario readback. Actual
browser first stopped at setup (known content was in the unresolved table); corrected
fixture preserves a separate known anchor and still moves the sampled rows themselves.
Corrected browser then showed Move down disabled. Current rowMoveBlockFor rejects every
raw parser gap, including exact unknown text already resolved by a consumed sample in
the issued layout program. This is an earlier required owner boundary, not a UI workaround.
Add src/lib/x4UiSourceEdits.ts + selftest to scope; before copies/hashes captured separately.
Reuse its complete statement/call/row/kernel ownership checks. A contained raw dynamic/
unknown scalar gap may pass only through an exact catalog source/expression, consumed
matching sample, reciprocal in-block operation consumers, and absence of that remaining
gap in the issued program. Unresolved/unsupported/side-effect/foreign evidence still refuses.
Do not broaden syntax or bypass the structural ledger. Add direct actual-owner positive
and no-sample/partial-sample negatives before implementation, then keep the entire prior
source-edit suite. Scenario order repair remains independently required after admission.

### Implementation / validation / review — 2026-09-13 03:59Z

[REPRODUCED] Two independent failures: rowMoveBlockFor rejected raw unknown text even
when its exact sample was consumed; scenario readback compared arrays in pre-edit order
although the fresh catalog correctly followed new source order. Existing owners repaired.
Initial admission repair also confused a consumer's value-use range with the whole call;
diagnostic output proved the distinction. Final check requires exact entry/value-use range
inside the same applied, owner-proven in-block operation. No remaining same-source gap,
one consumed typed sample, one catalog entry, no loop expansion. All other gap/statement/
side-effect/call/record/kernel guards remain. Scenario equality compares complete keyed
bindings including values and multiplicity, then returns canonical fresh capture order.

Five code files changed: SourceEdits implementation/test, PreviewScenarios implementation/
test, browser test. No App, SourceEditor, history, LayoutProgram, mapper, renderer or mod
runtime edits. Prior LayoutProgram/mapper/mounted-test hashes independently unchanged.

Evidence under test-results/b119-sampled-row-authoring-20260913/:
- scenarios-red.log and source-edits-red.log preserve fail-first boundaries; browser-red
  was a setup-fixture failure, browser-causal was the actual disabled Move down failure.
  typecheck-first.log preserves two new-fixture typing mistakes, corrected before final.
- source-edits-focused-second.log PASS; x4UiSourceEdits.selftest-final.log full170/170
  plus sampled-row owner positive, copied authority and incomplete sample rejection.
- x4UiPreviewScenarios.selftest-final.log: same-expression/distinct-consumer permutation,
  exact inverse, canonical saved order; duplicate path/loop/sample, conflicting arms,
  foreign consumer/source, false spans and quota tests retained and passing.
- source-editor-final.log: FULL mounted suite, including unchanged original editA/laterB/
  firstUndoRedo/duplicate-notice/structural positive. workspaceUndoHistory.selftest-final.log
  PASS. All terminal exits0; focused-only flags unset for full runs.
- typecheck-second.log exit0. npm run lint exit0 with600 repository warnings, NOT a
  zero-warning repository claim. check-owned-lint.mjs exit0: all5owned code files have
  zero warnings/errors in both saved baseline and current source, identical diagnostics.
- e2e-second-verdict.json1/1; e2e-final-verdict.json5/5,0fail/flake/skip/bad-result,
  wrapper/child0, complete report and ownership/treeGone. Actual UI move/add-row/add-text,
  exact whole-workspace source splice,3Undo+3Redo, correct independent input order,
  saved scenario selection, exact final native-canvas pixel signature and3history entries.
  Preview values/name never entered Lua/workspace/history. Old4browser cases unchanged.
- Viewed real browser PNGs: moved/readback and added-text from browser-second, final
  Redo from browser-final. Both sampled strings and Added visually are readable in correct
  order. Final Redo has no selected element; this slice does not claim automatic element
  reselection. Fixture still shows hierarchy partial/global validation1error, so no
  whole-project readiness or native fidelity claim. gameVerified remains false.
- final-guards.json:37independent inputs/4real mod sources/19protected files+membership
  unchanged. final-safety.json:X4 stopped;3000/3001/3100/3200/3201 absent. No external
  process manipulation. HEAD unchanged. All runner handles terminal. git diff --check0.
- graph-update.log0:11605nodes/29283edges/352communities, deterministic code-only update;
  over5000-node HTML omission expected. reviewctl/BlastRadius unavailable; whole owned
  baseline diffs, graph ownership, typed checks and actual negative/runtime tests reviewed.
- finalize.mjs exit0 produces receipt.json; mechanically proves all prior test assertions
  preserved and all declared bounded evidence. Temporary diagnostic removed before final.

Requirement review: moving sampled rows, inserting real palette content, preserving each
source consumer/scenario and exact source/history/pixels DONE and evidenced. Loop-expanded
edits, long text, full numeric/native/package/release scope deliberately not claimed here.
Capability delta: sampled rows themselves can now move with exact consumed inputs; fresh
canonical-order saved scenarios survive permutation and source Undo/Redo. Repository record
contains the delta; external capability-map/GitHub41 projection deferred by write boundary.

### Close / AAR

VERIFIED bounded; full goal ACTIVE/PARTIAL. This continuation PROGRESS, not completion.
All9actual journeys,3native menus/12references, fullE2E/precommit/build/package/install,
independent deployed-byte census/native zero-warning/public release remain required.
No Git/release/install/config/mod/game writes or global-memory writes. Rollback only these
five code deltas against saved .before copies, preserving older dirty work. No new spend,
network, permission or deletion surface. No new operator eyeball gate for this fixture.

Triggered AAR: fail-first tests, bad initial fixture/types, corrected source-range assumption,
and oversized log reads. Sustain: distinguish raw parser evidence from consumed layout
authority; verify identical expressions on distinct consumers with exact bytes and actual
UI history, not labels alone. Improve approach: inspect consumer schema before comparing
value ranges to enclosing calls; establish a separately renderable anchor for missing-input
tests. Improve tools: keep log reads character-bounded; npm lint exit0 does not mean no
warnings. Strict before/current owned lint proved0/0 without repairing unrelated code.
Highest-risk evidenced weakness: an apparently rendered canvas may omit the sampled table;
retain the long-text repair gate and require its actual geometry/readable screenshot. Final
Redo clears element selection; observe in the remaining complete authoring journey before
claiming selection continuity. Lessons banked here only. Degradation call made; next unit
starts from updated handoff. Suggested commit point (NOT committed):
fix(ui): retain sampled row inputs through visual authoring
