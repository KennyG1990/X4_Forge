# B119 contextual preview-input recovery

Status: PARTIAL; required rendered recovery test FAILED. Lane FULL. Astra direct/local. Full goal ACTIVE/PARTIAL.
Skills: brainstorming, planning, Graphify orientation; code-review before close.

## PLAN / BASELINE / RECONCILE

Bounded unit: select an imported element in the hierarchy and supply its related preview
values in the inspector without searching the52-input all-menu panel or editing Lua.
Reuse existing source-bound sample catalog, presentation mapper, Samples component,
single parent draft/apply/discard state, scenario controller and exact selection guards.
No source, renderer, sample authority, history, profile or persistent-state redesign.

Authorities: full goal attachment d06dfea8-8256-48a5-97f5-b524fac87153; original UI brief;
approved canvas-first plan and viewport contract; read-only capability map and ADR-F5.
Graphify vocabulary [preview,input,sample,presentation,recovery,canvas] locates presentation/
call-model owners, not a missing-input recovery implementation. Weak June recall supplies
no verified matching repair. Live code: Samples primary form lists all entries; mapper
already maps exact consumer operation IDs to hierarchy nodes. Unresolved selection only
routes to Inspect. Existing hierarchy permits selecting unresolved source-issued nodes.

Alternatives: all-menu search/filter alone still requires identifying an opaque control;
automatic sample defaults invent runtime geometry; selected: contextual inspector view
over existing inputs, plus a small canvas recovery hint and retained All preview inputs.
Related means this element, its descendants and its ancestor containers via exact IDs,
not inferred labels. Other menu values may also affect layout; do not call subset complete
or every unsupplied value required. Unknown geometry remains unknown until explicit Apply.

Owned5files under F:/DEV_ENV/X4_Forge: src/lib/x4UiBuilderPresentation.ts and selftest;
src/components/X4UiSourceEditor.tsx and selftest; tests/e2e/x4-ui-source-editor.spec.ts.
HEAD/main93c9af111d63ca77c99dee11f21882c4073bcda6; extensive prior dirty work retained.
Capture prior31pins, five byte backups and status before code;26independentpins immutable.
Evidence: F:/DEV_ENV/X4_Forge/test-results/b119-context-preview-inputs-20260913/.
Existing selection-focus/check-guards.mjs unchanged:34olderinputs,4original Lua sources,
19protected files plus directory membership. Fresh X4 absent; only Deckwright3100 listening.

Risks: wrong-node/source/target input association, duplicate labels/test IDs, hidden draft
edits applied unexpectedly, inspector overflow, runtime loss of current selection or geometry.
Use distinct view test IDs, current-catalog controls, explicit shared-draft wording. Context
view offers Apply/Discard but no ambiguous clear-all action. No new draft or sample writer.
Rollback exact reviewed owned hunks using .bak snapshots; no broad restore/staging.
No Git/release/install/game/mod/save/config/spend/network/schema/security/external ledger
or memory writes. Native CUA unavailable; do not bypass. Rendered tests authorized.

## Acceptance / implementation steps

1. Extend existing pure input presentation mapper with optional exact selected-node context.
   Verify catalog source/target equals presentation, require node membership, traverse related
   hierarchy IDs with cycle bounds, match only original consumer operation IDs. Return
   original entries in original order; locally disambiguate labels. No expression matching.
2. Fail-first source-derived pure tests: own/ancestor/descendant scope, sibling exclusion,
   identical expressions kept distinct, known unrelated node yields no controls, wrong
   source/target/copied node fail closed, catalog/source/geometry not mutated.
3. Add contextual use of existing Samples in selected inspector, accessible while canvas
   stays visible. Explain game-driven values, show applied/unsupplied counts; plain labels,
   consumers and typed controls. Existing All-input/Inspect paths unchanged. Global draft
   remains one owner; Apply/Discard clearly include input edits made in other views.
4. Actual mounted SourceEditor: context controls share current draft/apply with all-input
   controls, no source/history mutation, exact independent same-expression controls,
   invalid/stale selection/source/target paths retain existing refusal semantics.
5. Real original MENU recovery journey: select its unresolved footer Table 6 from hierarchy, see a
   contextual subset including its table Y input, explicitly supply no-agreement sample,
   Apply then Focus and inspect readable caption. Source/history unchanged; unrelated gaps
   remain; no guessed default. Validate narrow width, clear/recovery and source navigation.
6. Keep existing complete real MENU roundtrip and canvas-first tests unchanged; new recovery
   fixture adds proof, not replaces them. Full presentation/mounted tests, typecheck, exact
   lint, whitespace; standard isolated3200/3201run-e2e,workers1,retry1,zero flakes and120s
   deadline. Inspect actual screenshots; independently check source bytes/pins/guards/cleanup.
7. Re-read complete owned diff, record requirement review, status and triggered/clean AAR,
   update BACKLOG/handoff and verified history only if every declared gate passes.

Full nine journeys, finalRedo selection, numeric downstream, three menus/twelve refs,
full E2E/precommit/package/install/deployed-byte/native/public release remain required.
Proposed eventual commit: feat(ui): show preview inputs for the selected element.

## Reconciliation correction before implementation

[REPRODUCED] menu-baseline and menu-node-diagnostic could not find an unsupplied SEND
text node. The actual presentation retains structural Layout nodes but emits widget/text
nodes only from Scene; unresolved table geometry prevents those Scene children. Table 6
is present and its exact operation owns `_choiceY`. This corrects step5, not the full-goal
bar: contextual table recovery is useful partial infrastructure, but locating an unresolved
control by a recognizable caption remains REQUIRED follow-up before calling this journey
usable end-to-end. No source-derived placeholder node or invented rectangle is added here.
Evidence: menu-baseline.json/log and menu-node-diagnostic.json/log. AAR is triggered.

Mounted validation exposed a pre-existing test-double gap: `defaultValue` on textarea was
a plain field, whereas React initTextarea sets defaultValue then reads textContent to
initialize value. Newly mounted prefilled contextual fields therefore appeared empty only
in that double. Reconcile against installed React initTextarea/updateTextarea and a real
Chromium textarea probe; repair only this DOM model contract inside the already-owned
component selftest, preserving assertions. Browser field-value proof remains required.

## IMPLEMENT / review checkpoint

Five bounded owners changed. Optional selected-node mapper checks exact source/target and
current object membership, rejects duplicate IDs, traverses source-issued parent/children
with cycle bounds and filters original entry objects by property-operation IDs. No source,
catalog, geometry, history, sample writer or authority changes. Existing two-argument path
is unchanged. Context reuses Samples with distinct IDs, one parent draft, local labels,
shared Apply/Discard notice, count, bounded scroll and no clear-all. Unresolved inspector
opens recovery; resolved element disclosure starts closed. Canvas recovery hint added.

Actual original MENU: Table6 owns/contains36of52input entries; after explicit979sample,
the emitted SEND selection needs just2relatedcontrols. Do not call36a small subset or
pretend Table6 is a discoverable caption. Missing identities remain an explicit follow-up.

Pure fail-first presentation-red exit1 -> presentation-green exit0. Focused mounted
shared draft/Apply/Discard/source-history invariants and retained stale target/source
handler rejection pass (mounted-focused-current-target). Typecheck and exact5file lint
pass. Full mounted and rendered batch remain required before close.

Code-review skill: complete5-owner baseline diff read. No new network/spend/security API,
sample authority or production persistence surface. Optional reviewctl and documented
BlastRadius script unavailable; exact-owner static/type checks and local dependency
orientation are the fallback, not an invented scan result. Original browser diff removes
zero lines; the new container-recovery test supplements the original MENU roundtrip.

AAR triggered: wrong assumptions about unsupplied SEND/cell identities; mounted textarea
model missing native defaultValue semantics; cached positional target option reused after
catalog reissuance; avoidable evidence filename errors. Retained original failures instead
of weakening assertions. Recovery uses live current option by label and exact source-issued
identities. Degradation called: checkpoint this unit, fresh session for next bounded work.
No Git action authorized by this bounded plan; no publication or protected writes.

## Validation continuation

Full mounted suite passed at11:52Z, including canonical21/21, source transfer32/32,
insertion6/6, new-menu25/25, file guards, camera navigation and the new contextual matrix.
Final typecheck/lint pass after the browser-helper correction. The first browser batch
retained every source pin and protected guard, passed canvas-first21.6s and MENU1.8m,
but the new test failed both attempts in its unsupplied capture: it incorrectly requested
pixels when the current status was honestly refused/no bitmap. Context36inputs, empty Y,
Apply disabled, no clear-all and narrow-width placement had already passed. Correction
requires zero canvases/refused before recovery and after Clear, one current bitmap after
Apply. Native pixel reader itself and original tests remain unchanged. No product edit
after first browser run. Final three-test rendered rerun pending.

## AAR (triggered)

- Sustain: original Lua/checks and exact-consumer identities retained; one shared sample
  owner reused; negative source/target handlers exercised; actual rendered host required.
- Improve work: reconcile unsupplied node topology before promising caption recovery;
  derive each observation's render availability from its declared state, not a success-
  path helper. Avoid guessed artifact names and cached positional target values.
- Improve tools: native textarea defaultValue/dirty-value behavior was missing in the
  mounted double. Scoped correction passed full mounted; Chromium parity probe is in the
  new browser test. No oracle relaxation or optional scanner success claimed.
- Highest-risk evidenced weakness: unknown geometry also removes recognizable widget
  captions, leaving opaque structural labels as the recovery entry. Bounded follow-up:
  investigate source-issued descriptor identity/labels without granting geometry or edit
  authority. Still REQUIRED before claiming complete imported-menu recovery UX.
- Lessons banked here and in the repository handoff only; no external or global-memory
  write. No new source-execution/persistence/security capability-map delta.

## Final validation / requirement review / CLOSE — 12:00Z

Receipt: test-results/b119-context-preview-inputs-20260913/receipt.json, independently
verified by verify-partial.mjs exit0. This is a PARTIAL receipt, NOT a green task verdict.
Final browser:2passed/1failed/0flaky; canvas-first15.1s and full originalMENU1.8m pass;
new recovery test fails both attempts at the final cleared/reselected capture. Positive
container36-input projection, narrow1024visibility, shared draft/discard, explicit979Apply,
current native bitmap/readableSEND100%,2relatedcontrols and source/history preservation
all pass. Clearing removes SEND from the current hierarchy and empties the input; source
reselection hides then restores the contextual panel. But capture expects0canvases and
finds1retained stale canvas; final cleared-state image/post-clear source-history assertions
are not reached. Failure/trace preserved under rendered-final/browser/...f7d1a... and retry1.

[REPRODUCED] Current DOM reportsstale after Clear/reselection, not rendered/current.
Existing mounted contracts explicitly retain stale canvases on source-only transitions
(SourceEditor.selftest source lifecycle matrix). Therefore this is a FAILED new assertion,
not yet a proven new product regression. Reconcile that existing behavior and explicit
Clear UX in a fresh bounded unit before revising either code or expected outcome. Do not
blindly require removal or automatically accept stale pixels as a completed recovery UX.

Requirements1-4 done/evidenced by pure/full-mounted tests. Requirement5 PARTIAL: positive
rendered recovery evidenced; caption discoverability and final Clear presentation unresolved.
Requirement6 PARTIAL:full-mounted/presentation/finaltype/finalownedlint/whitespace pass;
original rendered gates pass, required new rendered gate red. Requirement7 documented with
triggered AAR; no VERIFIED roadmap entry or commit. Optional scanner unavailable as recorded.
Actual images inspected in visual-review.json; only desktop Chromium proof, not installed
Antigravity or nativeX4 verification. Independent exports90060original/90064edited bytes,
only SEND->TRANSMIT;31currentpins/26independentpins/5backups/34olderinputs/4originals/
19protectedfiles+membership exact. Stack ownership complete/treeGone=true; X4 absent,
only Deckwright3100/PID8256. HEAD/main unchanged. No Git/protected/external writes.

Checkpoint title (not committed): feat(ui): show preview inputs for the selected element.
Full goal remains ACTIVE/PARTIAL; no release or full-goal completion claimed.
