# B119 source-owned row rearrangement

Date: 2026-09-10 EDT. Lane: FULL. Status: PARTIAL; source/headless UI checkpoint passed, browser pending.
Goal: select an ordinary supported row (or its widget), move it up/down visually, and undo/redo the
real Lua change. This implements part of goal journey4, not the whole nine-journey goal.
Architecture: extend the existing SourceEdits transaction/catalog and presentation owners. Lua remains
canonical; App remains the sole history owner; existing Session/LayoutProgram/Scene reproject the result.
Tech: TypeScript, React, existing Lua static model and game-derived layout kernel. No new dependency.

## PLAN and acceptance contract

- Bounded unit: adjacent row movement within one proven table, including the row's owned widget calls.
  Use ordinary Move up / Move down controls, not offsets, operation IDs, raw Lua or an independent model.
- Positive scope MUST include actual New menu -> Add row -> Text/Button/Input authoring, repeated moves,
  first/middle/last positions, multi-cell rows and supported cell spans. Empty rows must remain usable
  through the hierarchy even when the game gives them no positive painted height.
- Imported static local-row blocks are supported when ownership and dependency checks prove safety.
  Unknown, ambiguous, interleaved or runtime-dependent constructs may refuse honestly. They must not
  force ordinary builder-generated menus onto the unsupported path.
- Non-goals: cross-table moves, arbitrary Lua execution, freeform drag placement, new parser/renderer,
  whole-file regeneration, new history/deployment owner, incidental lint cleanup, release/install/native
  writes. Other eight journeys and three-menu/twelve-reference fidelity obligations remain required.
- Risks: changing Lua binding scope or side effects; moving a widget away from its row; changing width
  finalization/default timing; accepting stale/forged edits; losing selection/history after acknowledgement.
  No spending, credential, permission, endpoint or network surface is added.
- Recovery: inert pre-unit snapshots and exact own-hunk review. Never restore whole dirty files over
  unrelated changes. No git reset/clean, broad staging, commit/push or publishing in this source checkpoint.
- Source acceptance: a trusted catalog-issued move swaps exactly the two proven row blocks; no other
  file or bytes outside the bounded interval change. Each original statement is retained byte-for-byte.
  Reparse proves exact retained calls, records, row/cell/widget ownership and kernel semantics with the
  declared row permutation. Source/target/corpus guards and all existing negative tests remain intact.
- State acceptance: success returns fresh moved-row identity/creator proof and new source/catalog. An
  accepted parent transaction contributes once to existing App history. Refusal/no-op/stale/superseded
  acknowledgement changes neither workspace nor history and must not select another row accidentally.
- Interface acceptance: context from selected row/cell/widget; first/last boundary actions disabled;
  readable unavailability reason for unsupported source; Apply/Discard/pending draft rules preserved;
  after acknowledgement, selection resolves to the moved row using fresh proof, not a stale row index.
- Required visual journey: New menu, add populated rows, move a middle row both ways, edit it afterwards,
  Undo, Redo, make a new edit and show redo clears; compare exact Lua, hierarchy and visible order.

### Required validation and evidence

All commands run in F:/DEV_ENV/X4_Forge with bundled Node
C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe and
X4_REFERENCE_ROOT=F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00.

1. Source owner full selftest, existing LayoutProgram regression, mapper and mounted SourceEditor suites.
2. Whole-project TypeScript --noEmit and strict exact-owned-file ESLint --max-warnings0; diff whitespace.
   Existing App five-warning lint failure is not waived, fixed or counted as this unit's new defect.
3. Source negatives: stale workspace/source/catalog/entry; forged/cloned/foreign proof; accessor/hostile
   request without getter execution; expected-range mismatch; boundary move; wrong table/frame/target;
   aliases/rebinding/shadowing, escaped rows, later cross-row references, unknown executable statements,
   interleaved side effects, malformed source, changed column/default timing and mutated retained ledger.
4. Positive byte controls: LF/CRLF, BOM, comments, semicolon statements when safely owned, unrelated
   sibling files/tables/functions, spans and canonical automatic heights. Repeated up/down restores
   exact original bytes. Tests use the real creation/insertion producers, not only hand-written fixtures.
5. Parent independently reviews the complete two-file delta against an inert baseline and reruns the
   tests; mutation tests must challenge moved AND retained ownership/state, not merely count operations.
6. After fresh machine clearance: serial isolated 3200/3201 two-spec E2E including the combined journey,
   actual screenshots/source inspection, fresh fourteen-file live-state baseline and clean teardown.
   Latest required browser9passed/1flaky remains FAILED until replaced by a clean current gate.
7. Current production build, full E2E, installed host and native fidelity remain required broader gates.
   Browser/desktop work is currently unavailable pending fresh machine clearance; installed/native
   writes retain the paragraph-and-explicit-go gate. No inference from headless checks can close them.

Evidence prefix: F:/DEV_ENV/X4_Forge/test-results/b119-row-rearrangement-.
This plan records decisions, results, requirement review and AAR; SESSION-HANDOFF.md records next action.

## BASELINE

- HEAD/main93c9af111d63ca77c99dee11f21882c4073bcda6; origin is KennyG1990/X4_Forge.
  Large pre-existing dirty tree and deleted/untracked files; index/branch untouched by this unit.
- SourceEdits.ts B152C812E570A3F9DC1DD3AED3F5720CD7043E3EB1A57EA2EE33CD029B4E1BC1.
- SourceEdits.selftest.ts A01245758F461663837BBFB2CAC8034564254ECEB886F522977BEBCDB2555BCD.
- BuilderPresentation.ts 1BB9D40BB545B373D5A265A4050CCE8C9EA5113269020D6B35B96E89AB7E50C4.
- SourceEditor.tsx 1B3E92CA6B70016982D0AD7F12405567849DA8AC0729875BFE179AF3C26920CE.
- App.tsx BBA39AB4433EBDB7238413C1E0F1F2F02089B7AC051EC67D923AAC81D3087F48.
- Frozen history receipt: test-results/b119-source-history-parent-reviewed-20260911T0007Z/receipt.json.
  Its source/headless evidence remains PARTIAL, strict lint/browser gates open; all earlier workers closed.
- Fresh parent SourceEdits baseline PASS143/143 and all prior causal matrices, exit0 before mutation;
  log test-results/b119-row-rearrangement-parent-baseline-source.log (session57654 terminal).
  Exact two-file snapshots: test-results/b119-row-rearrangement-baseline/*.snapshot;
  source hashes checked before copying and destination hashes checked after. Existing source unchanged.
- No realmod/game/save/config/installed-extension/workspace changes. Preserve x4AiLive806765,
  live3000/3001, Deckwright3100 and sidecar55835; installed0.0.78 is immutable, never republish it.

## RECONCILE and design decision

- Read full goal/original brief, current approved canvas-first plan sections, handoff/backlog, B119
  capability-map deltas and ADR-F1/F2/F5. Exact helper source overrides outdated brief font/column claims.
- Graph query expanded from graph vocabulary [row,insertion,structural] found generic/weak row neighbors;
  it did not prove source-edit ownership. Live targeted code reads provide the facts below. Agent-Brain
  recall returned an old reference-data task, not evidence of a completed rearrangement capability.
- Existing F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceEdits.ts issues delete/replace/insert/insert-row/widget
  entries but no move/reorder operation (searched its types, discovery, payload and public apply owners).
  Reuse localRowOwnerForInsertion, rowContinuityIsProven, structural statement/provenance discovery,
  source issuance/CAS, reparse and structural ledger machinery, extending where the new transform needs it.
- Existing insertion proof only checks some row uses until the next anchor. Movement needs a stronger
  pair proof over the relevant target, including uses after either block and Lua shadowing/dependencies.
  Do not use the insertion guard alone as blanket permission to move a block.
- Game authority: F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00/ui/addons/ego_detailmonitorhelper/helper.lua
  lines4895-4957: addRow finalizes table widths, appends the row, assigns index, propagates scaling and
  properties, builds cells and applies default spans. A move changes Lua call order, not just visual order.
- Existing structuralKernelLedgerStatesCorrespond replays retained kernel transitions and has an
  explicit insertion mapping. A row move needs an explicit bounded operation/row permutation with
  retained-state proof. Never skip ledger checking, drop fields or globally relax identity comparisons.
- Alternatives: preview-array reordering is rejected because Lua would stay wrong. Delete-and-regenerate
  rows is rejected because it loses source locality/comments and introduces unnecessary regeneration.
  Selected: exact adjacent proven-block swap through the existing transaction owner and fresh reparse.
- Extend versus replace: prior bugs demonstrate the value of current exact authority and regression
  checks, not evidence that a new parser/writer would solve row permutation. Extend the existing owner,
  isolate the new permutation proof and test its failure modes; do not duplicate its pipeline.
- UI coupling: SourceEditor uses one execution context, draft/Apply/Discard/ack path; UIBuilder's accepted
  readback feeds App history. BuilderPresentation resolves row from row/cell/widget selection. Extend these
  after the source result contract is frozen. No App/history edits are currently authorized for this unit.
- Capability-map delta at SPECIFIED: none. A source-tested move is not yet a user-visible capability.

## Execution batches and ownership

### A. Source move transaction (first Luna write set, no other code)

- Modify F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceEdits.ts.
- Modify F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceEdits.selftest.ts.
- Read the plan/current owners; first add producer-backed failing move tests. Issue up/down entries for
  adjacent proven local rows. Keep closed typed request/proof boundaries and exact catalog object issuance.
- Build an exact block permutation descriptor from current owned statements, never caller-supplied Lua.
  Prove every moved statement belongs to its row, no cross-binding/side effects change, and byte locality.
  Reuse reparse/workspace splice. Extend deterministic correspondence for this permutation; assert fresh
  moved-row/creator ownership in the result so the UI can reselect without name/index guessing.
- Add positive/negative/retained-ledger matrices. Run full SourceEdits, typecheck, exact two-file lint/diff.
  Report API names/shape, support limits, exact commands/results and hashes. Do not run E2E, desktop,
  broad build, graph refresh, Git or any protected external writer. No recursive delegation.
- Stop for parent review after the two-file slice. If an unowned dependency change is necessary, report
  the exact reproduced boundary first; parent revises scope before any such write.

### B. Contextual controls and fresh selection (reconcile and freeze source API before dispatch)

- Planned files: F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.ts and its selftest;
  F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx and its selftest.
- Parent examines UX integration while source worker operates; no simultaneous source dependency edits.
- Map selected descendants to the exact row; expose up/down availability and clear boundary/unsupported
  text. Route through existing draft/commit/ack and resolve fresh moved-row selection after acceptance.
- Mounted tests include supported generated multi-row menus, repeated move/edit, user interruption,
  stale callback/refused acknowledgement, Undo/Redo restoration and unchanged wrong workspace.
- These files are NOT assigned for writing until BatchA's public contract is reviewed/frozen and BatchB
  reconciled. The later explicit schedule amendment allows disjoint UI work during internal source
  hardening; it does not waive final source, combined regression or actual-interface acceptance.

### C. Actual authoring acceptance

- Planned file: F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts.
- Extend existing same-menu fixture/oracles; do not replace them with state injection or weaken timeouts.
  All button actions use the UI, exact Lua and fresh pixels corroborate moved order and history.
- Parent owns serial E2E/build/real rendered inspection after clearance. Record screenshot/source paths,
  current gate outcome and isolation receipts. Native/install remain separately authorized.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE

- BatchA dispatched to native GPT-5.6 Luna/max Curie01a08dd8-a957-70b3-8502-39e5be6ffbd5;
  exact two-file write set only. Read_thread confirmed active/inProgress after dispatch; not terminal.
  Full goal ACTIVE/PARTIAL; no complete-builder or release claim.
- Source slice cannot close row rearrangement as VERIFIED without its actual-interface acceptance.
- Eventual suggested commit: feat(ui): rearrange source-owned menu rows. Commit remains gated.

## AAR (planning/baseline)

- Previous status-only turn: no implementation progress; current turn revalidates and takes source work.
- Trigger: parent combined several long document reads, truncating output. No source or protected state
  changed, but this wasted context. Sustain explicit output budgets and focused owner reads; improve by
  storing long output then emitting small sections instead of combining vocabulary and historical plans.
- Highest evidenced new weakness: broad graph terms matched unrelated inferred neighbors. Use exact live
  owner references for scope, never treat weak traversal as proof. No architecture/semantic defect claimed.
- Project lesson banked here. No global memory or reusable skill mutation is authorized/performed.

## Parent UI reconciliation while BatchA executes

- Existing resolveX4UiBuilderRowForNode (BuilderPresentation.ts) rejects duplicate IDs, detached selection
  objects, cycles and wrong ancestor kinds, and resolves row/cell/widget/text to the exact row/table/frame.
  Reuse it for move context; do not add a second tree walk based on labels or row numbering.
- Current SourceEditor applySourceEdit checks live execution-context/draft/selection references before
  mutation, refuses insertion while a draft or acknowledgement is pending, and verifies the selected
  contextual entry again. A move needs the same action-context guards, not only a disabled button.
- Existing submitSourceEditWithSelectionTransfer is the shared readback/ack path. It can defer selection
  until fresh source/target keys and projection arrive, and cancels on user/external interruption.
  Extend its continuation with the move result proof; do not call App history directly from this control.
- Existing resolveX4UiBuilderNodeAfterSourceEdit maps a simple splice; it cannot prove identity inside a
  swapped interval. Existing Add-row continuation intentionally chooses a first empty cell. Neither is
  the correct moved-row identity rule. Reuse shared source/owner checks, then resolve exact moved row from
  its new creator proof. Boundary moves/no action must not produce history or selection changes.
- Existing palette title is Add to selection. Place row move controls in an explicitly labelled Row
  controls group; do not describe moving as adding content. No selected row -> selection guidance;
  first/last -> disabled corresponding direction; unsupported pair -> readable source dependency reason.
  Keep details and exact source coordinates behind Inspect. Maintain compact authoring area.
- Independent second worker Tesla01a08ddb-1914-7e11-91d1-0321c124343c owns ONLY the existing E2E spec for
  frozen history acceptance, as specified at end of source-history plan. No E2E/server execution, no
  shared code writes, no dependency on the unfinished move API. Curie notified; two-worker cap enforced.
- Review skill loaded for parent integration. Optional reviewctl/rules/BlastRadius unavailable (read-only
  discovery checked); no install/upgrade or claim that optional scan ran. Manual exact-delta and existing
  static/behavioral checks remain required.

### Existing screenshot review (not current move acceptance)

- Parent viewed contextual-input.png and contextual-text.png from
  test-results/b119-contextual-insertion-targeted-fifth-artifacts/e2e/ on this continuation. These are
  prior widget-authoring captures, not evidence that Add row, history or row movement renders now.
- Repeated read-only notice cards occupy the selected-element inspector around the ordinary text field.
  This confirms the already-recorded diagnostic clutter issue. Row buttons should share one compact
  Row controls group; do not add another large diagnostic panel above the current editable fields.
- Preserve the existing authoring-space requirement and verify the actual resulting1280x720 layout in
  BatchB/C. No screenshot was edited/generated and no new desktop interaction occurred.

### Parent source WIP review and bounded diagnostic

- Parent read the complete1357-line baseline-relative source delta while Curie remained authoritatively
  active/inProgress. This was an early review, not a frozen checkpoint or acceptance; the worker is
  still implementing producer-backed positive/negative coverage and repairing its first iteration.
- [REPRODUCED, helper scope only] Exact current mapRowMovePoint extracted with the TypeScript AST maps
  lower-block start30 to40 for adjacent ranges[10,30) and[30,60), instead of the relocated lower start10.
  Log:test-results/b119-row-rearrangement-parent-point-boundary-probe.log, exit0. Source observed next:
  00113B0DCA8862ED95FAAAFF21984F113670C2B326B566DA8ADCF48B89AF2B64. This does not yet establish
  a public-API/user-visible failure. Curie owns endpoint-aware correction and reachable fixture tests.
- Another WIP review concern: operation-state comparison must allow the legitimate one-sided row
  prefix difference when the first row becomes second, without dropping moved or retained kernel
  facts. Require actual producer success and causal mutation negatives before accepting this proof.
- No BatchB UI dispatch, source acceptance, graph refresh, real E2E, protected write or release occurred.
  Current continuation made PROGRESS through independent evidence and concrete review corrections;
  preceding user status-answer turn made no implementation progress. Full goal stays active/PARTIAL.
- Parent corrected the execution order after observing that the initial new test only checked for the
  move API export: that is not the planned producer-backed failing test. Same worker must run the actual
  Newmenu/Addrow/Text move/inverse path next, preserve the exact refusal if it fails, and establish this
  working path before expanding further proof machinery. No acceptance requirement was removed.
- [REPRODUCED, public generated-menu path] First actual Newmenu/Addrow/Text/Button/Input movement
  test failed with moveEntries:0,rowCount:4 before apply. Worker command exited1; parent independently
  read test-results/b119-row-rearrangement-worker-producer-first.log. Assertion at selftest2420 required
  a real middle-row move. This establishes a candidate-discovery failure, not yet its causal predicate
  and not a kernel-apply diagnosis. Same active Curie handle owns diagnosis/repair with no scope change.
  Required next evidence is a successful real move and inverse plus unchanged prior/negative coverage.

### Next continuation — public move reached, populated-cell proof still fails

- Prior goal turn classification: PROGRESS (history-spec checkpoint and first real movement failure).
- Parent re-evaluated exact mapRowMovePoint from source55b198bc with start/end affinity at all three
  boundaries. Five of six checks pass; lowerEnd with end affinity still returns60 instead of the moved
  lower block's end40 for ranges[10,30)/[30,60). Evidence:
  test-results/b119-row-rearrangement-parent-point-affinity-probe.log. Scope remains isolated helper,
  not a public edit failure. Same worker owns the remaining endpoint correction.
- [REPRODUCED] Worker discovery repair reaches the public API: moveEntries2,rowCount4. Parent read
  worker-producer-repair5.log and worker-producer-proof6.log under the row-rearrangement evidence prefix.
  Apply is still atomically refused, changed:false, reason reparse-provenance-drift, detail fresh moved
  row lacks the complete table/frame/cell creator ownership chain. No source success is claimed.
- Parent identified a concrete failing condition in the fresh-row guard: it copied the empty inserted-row
  requirement cell.kernelState.type === cell, while the moved Text cell in the exact proof6 log has
  kernelType:text. Populated row movement cannot require empty cells. Same Curie handle is correcting
  this against preserved ownership and retained cell/kernel correspondence, not removing the proof.
- First/middle/last, full source negatives, stable whole-project checks, UI controls and real browser
  remain required. Two discovered move entries do not satisfy the full structural support contract.

### Reconciled schedule amendment and BatchB contract — SPECIFIED

- New evidence: worker producer-repair7.log reports a real generated four-row Text/Button/Input menu
  with six issued directions, accepted middle-row movement and exact inverse restoration; full source
  suite146/146. Parent independently reran the full suite, exit0/session19659, same146/146 and accepted
  producer result. Log:test-results/b119-row-rearrangement-parent-producer-first-green.log.
  Source changed from8E9C52F9 toB7B4794B during that run; test11F3A7DC stayed stable. Therefore this is
  independent functional evidence, NOT a frozen current-source acceptance receipt.
- Curie explicitly froze X4UiSourceEditRowMoveEntry, catalog.moveEntries, applyX4UiSourceRowMove and
  accepted result.movedRow: no signature, field or observable contract change without parent agreement.
  Parent has reviewed those public types/issuer/apply/result boundaries. Remaining SourceEdits work is
  internal proof/negative tests, owned only by Curie. Source implementation is not yet accepted/frozen.
- Schedule change: begin the already-planned four-file UI slice against that frozen public API while
  internal source hardening continues. Rationale: the previously missing/zero-entry API now has actual
  producer/inverse evidence and a stable contract; waiting for all source negative matrices no longer
  needs to serialize writing the controls. Two-worker cap, no overlapping writes, no shared test stack.
  Any dependency-contract drift stops UI integration and returns to parent. Final combined checks wait
  for both owners to stop writing. A passing interim check is provisional when dependency hashes drift.
- UI-only baseline, source and destination SHA256 verified before/after copy:
  test-results/b119-row-rearrangement-ui-baseline/*.snapshot.
  BuilderPresentation.ts1BB9D40BB545B373D5A265A4050CCE8C9EA5113269020D6B35B96E89AB7E50C4;
  selftestE0CC5C8816762524AC688F2A767069CBE3E3084197349F1794D74BFDA6EA62AA;
  SourceEditor.tsx1B3E92CA6B70016982D0AD7F12405567849DA8AC0729875BFE179AF3C26920CE;
  selftestB45DBCAEB9A92FC4CCD292859BD70923CC3942B6B6D94269EC957CA077FFECEB.
- Exact UI ownership: F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.ts and its selftest;
  F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx and its selftest. No App/UIBuilder/history,
  SourceEdits/LayoutProgram, E2E spec, styles elsewhere, config or dependency writes.
- Reuse resolveX4UiBuilderRowForNode for row/cell/widget/text context. Derive boundaries from the exact
  parent table's current row children and match catalog-issued move entries to selected row/source.
  Render one compact Row controls group with Move up/Move down. First/last corresponding direction is
  disabled; unsupported source has a concise dependency/unsupported explanation. No row selected gives
  selection guidance. Technical source coordinates and IDs stay behind Inspect.
- Reuse SourceEditor's applySourceEdit and submitSourceEditWithSelectionTransfer: guard current execution
  context, draft, selected row and exact catalog entry again in the callback. Draft/pending mutations
  disable movement and direct stale callbacks still refuse. Supply exact expected-range CAS. Route
  accepted moves through the existing UIBuilder acknowledgement/App history chain, not a second writer.
- Existing resolveX4UiBuilderNodeAfterSourceRowInsertion already proves source identity, unique nodes,
  row/table/frame creator chain and complete cell children, returning the row when no fresh empty-cell
  lookup is requested. Share those proof checks for movement instead of copying them or pretending a
  swap is a scalar splice. Keep Add-row's first-empty-cell selection unchanged; movement selects the
  exact fresh moved ROW, including populated/spanned cells, never an old row index or widget ID.
- Required tests-first UI cases use the actual Newmenu/Addrow/Text/Button/Input producers, not fabricated
  accepted results: select descendant -> move middle row -> fresh row selection -> move inverse -> edit
  its current widget. Cover first/last, empty row, supported spans, repeated actions and exact source.
  Negatives: stale direct callback, wrong workspace/source/catalog, draft/pending Apply/Discard, refused
  or delayed/superseded parent acknowledgement, intervening user selection/source switch, forged fresh
  creator/cell proof. Reuse existing mounted App-history integration and prove Undo/Redo reprojects;
  do not bypass normalization or inject a fake successful source result to manufacture a green UI test.
- Baseline mapper/component suites before mutation; then full mapper/component suites, scoped exact
  four-file strict lint and whitespace. Whole-project TypeScript after dependency stabilization; if run
  while Curie writes, label provisional and record hashes. Parent independently reviews all four deltas
  and repeats final checks. No actual E2E/browser/build/graph/Git/protected writes by the UI worker.
- Actual serial browser movement/history journey, current full E2E/build/package/installed/native gates
  remain unchanged. No capability-map delta at dispatch. Full goal remains active/PARTIAL.
- AAR triggered: schedule/acceptance sequencing changed with new evidence, prior test-design gap,
  source discovery/proof failures, and one parent empty documentation patch that failed its context
  match without changing a file. Sustain exact producer evidence and disjoint ownership; highest risk
  is treating a stable API or changing-source pass as complete source/UI validation. Final stable-hash
  source plus combined interface gates remain mandatory. No memory/skill or external ledger writes.

### BatchB dispatch

- Native GPT-5.6 Luna/max Schrodinger01a08e0e-8f99-7e80-b264-9ceb905b745f assigned the four UI files
  above with no context fork. Active/inProgress confirmed01:24Z; mapper baseline exited0. Curie remains
  active on its SourceEdits pair. Both received the frozen public API and exact disjoint ownership.
- Parent required all six directions issued for the real four-row producer to actually apply and invert,
  including first-row down and last-row up. A middle-row success alone is not all-position coverage.
  First-row width-finalization behavior is a review hypothesis until exercised, not a diagnosed defect.
- Contract freeze preserves the declared API and support/safety contract; it does not freeze provisional
  bugs. Repairs within the already-required generated-menu support and rejection rules remain in scope.
  Shape/field/new authority or support-contract changes require parent coordination before UI integration.

### Parent follow-on review — terminal state and first-row phase

- Previous goal turn: PROGRESS (producer move/inverse, independent provisional rerun, frozen API and UI
  dispatch). Both native handles remain active; no timed-out observation was treated as stopped work.
- Parent read worker-debug-semicolon.log: the actual BOM/CRLF/no-indent/semicolon/span fixture issued
  first-down, middle-down and last-up entries, but all three refused at ledger correspondence. This is
  a preserved failing supported fixture, not an unsupported case silently removed from acceptance.
- Source review found that latestKernelByTable chose max BEFORE modelOrder and used its matched AFTER
  operation as after-final. When the old final row moves up, its matched after operation is no longer
  terminal. Parent sent this exact selection defect and required independent terminal selection on each
  timeline while retaining per-operation checks. Curie confirmed it with controlled trace and repaired it.
- Parent independently read worker-debug-first-phase.log: both terminal snapshots now contain three rows;
  middle-down and last-up accept, invert, preserve exact swap/roundtrip bytes, fresh proof and formatting.
  First-down still refuses at addRow:12:stateBefore. The exact non-row differences are columns and final:
  before has0rows/final:false/widths0,0,0; after has1row/final:true/widths176,175,175.
- The first-row phase hypothesis is thus supported by the exact differing-state trace. Existing
  finalizeHelperTable in src/lib/x4UiLayoutKernel.ts1076 deterministically implements column finalization;
  addHelperRow calls it at1464 when state.final is false. Parent directed any first-row-only phase proof
  to reuse this existing kernel transition, preserve original pre-final correspondence/continuity and
  test column/final-flag mutations. No LayoutKernel edit or general omission of state fields authorized.
- The whole source/row UI unit remains PARTIAL. Required next proof includes corrected first-down and
  all generated directions, existing and new negatives, final stable source/combined tests and browser.
  AAR is triggered by these controlled failures and correction of the terminal-state selection premise.
- Parent read worker-debug-first-repair.log: all three imported span/semicolon directions now accept and
  invert with exact source/formatting/fresh proof; full source150/150. The first-row correction uses the
  existing finalizeHelperTable only for a0/1-row first-creation phase. Parent reviewed that restricted
  comparison and required column/final-flag causal negatives and removal of temporary source logging
  before the stable source checkpoint. This worker run is not independent final-source acceptance.

### Parent UI WIP review — corrections required before acceptance

- Parent read the entire current mapper delta and513-line SourceEditor delta, including live JSX
  placement inside the inspector. The code routes movement through the existing CAS/ack/selection
  continuation, as planned. The mounted real producer/history movement journey is still being written.
- Product correction: ordinary row-control messages must not say current source authority or movement
  authority. Use plain unsupported-row guidance without inventing a reason, and keep technical details
  in Inspect. Row controls currently follow the long Friendly properties list; move the same compact
  group before that list. New buttons need at least11px text and28px height; no global style rewrite.
- Proof correction: movedFromRowIndex is1-based, not zero-based; validate the declared one-position
  relation without using ordinal as identity. Count every row containing the creator operation when
  checking unique ownership, then separately reject repeated operation IDs on the selected row. The
  initial count-exactly-one filter could ignore an extra owner listing that creator twice.
- Callback correction: reject a movement request combined with insertion flags/text before calling the
  source API; do not silently select one action from an ambiguous direct callback. Existing safeguards
  and real producer tests remain required. Same Schrodinger handle owns all four UI files and corrections.
- Worker had an SSR status-copy expectation failure, then a clean full component run; parent inspected
  both command records. This was not claimed to be a production/runtime failure or actual browser proof.

### Continuation review 2026-09-11T02:00Z — generated terminal metadata case

- Previous user status turn: VERIFIED WAIT, both exact native handles confirmed active/inProgress.
  No progress percentage was treated as an acceptance metric. Full goal remains active/PARTIAL.
- [REPRODUCED] worker-source-full-final-kernel.log supersedes the earlier152/152 run: generated
  row3-down and row4-up refuse at reparse-provenance-drift; the other four directions apply/invert.
  Parent independently read the failure and worker-operation-timeline.log, not just worker narration.
- Exact down3 timeline: before ends with createEditBox index12/model45 carrying kernel state; after has
  createButton index11/model45 carrying kernel state, then setText index12/model46 with no kernel,
  stateBefore or stateAfter. The final arbitrary table-operation selector demands a nonexistent snapshot.
  This trace supports the metadata-only terminal cause, not a modelOrder tie for this particular case.
- Same source worker must select each table/timeline's last actual kernel-bearing transition. Paired
  per-operation snapshot keys/presence, original continuity and final row-permutation state proof must
  remain enforced so deleting a real snapshot cannot manufacture success. Preserve this failure, verify
  all six generated directions and causal negatives, remove temporary logging before source freeze.
- Parent inspected current mapper corrections: 1-based indices, exact one-position relation checked
  against fresh hierarchy, all creator owners counted, duplicate creator entries refused. Identity still
  comes from fresh creator/cell proof, never an ordinal fallback. Final stable-hash review remains due.
- Parent read the mounted actual-producer row-rearrangement branch through move, inverse and continued
  text editing. Manual replacement/ack is source-selection integration evidence, not App history proof.
  Old descendant-selection assertion was wrong for the required fresh ROW selection; explicit reselect
  of the moved widget before continued editing is correct. Movement negatives and existing real history
  integration remain required before UI checkpoint. Same worker/four-file ownership, no added owner.
- Existing graph query expanded from actual vocabulary [kernel,ledger,structural,row,source,selection]
  returned weak generic/inferred neighbors; it does not explain this defect. Current trace/source own
  the finding. No graph refresh while writers are active; no capability-map delta or external writes.
- AAR remains triggered: source acceptance regression, corrected UI oracle assumption, and parent output
  truncation during combined reads. Missing instruction/source spans were reread; use smaller bounded
  output slices. Highest evidenced risk remains substituting stale/provisional passes for current source
  and actual-interface proof. No acceptance criterion, test oracle scope or machine gate was waived.

### Review checkpoint 02:08Z

- Newer worker-source-final.log explicitly reports all six generated directions accepted, inverse
  accepted, exact swap/roundtrip and fresh proof. This supersedes the individual last-pair refusal,
  not the need for full final stable-source acceptance. Parent did not run the full current source gate.
- Parent exact AST-extracted endpoint helper independently passes6/6, exit0, source SHA256
  91c1b97a7980d98e8d5e1b1d4e2b0267bc82753833c6e6454c2c260b96f089d0 stable before/after.
  Evidence:test-results/b119-row-rearrangement-parent-point-affinity-final.log. No public-API claim
  from this isolated helper check. Temporary source debug logging was absent in the later source search.
- Parent read complete478-line test delta and full source increment since prior complete1357-line review.
  Required remaining tests sent to Curie: empty-row apply/inverse; alias/rebinding/late cross-row reference
  refusals; terminal real kernel/stateAfter removal negatives; positive first-phase comparator baseline;
  non-vacuous full sibling-file equality. These are the existing planned contract, not expanded scope.
- UI history integration now has a reproduced disabled-control assertion on History Row2. Current static
  fixture is HISTORY_ROW_REARRANGEMENT_SOURCE in SourceEditor.selftest.tsx; four local rows/spans/Button.
  Cause unresolved. Parent rejected premature fixture-only diagnosis and notified both owners to preserve
  exact source/catalog/status, fix a production gap if reproduced, and use real producers without
  fabricating accepted results or replacing the history owner. No source support narrowing authorized.
- No final source/UI freeze, combined checks, browser/build/installed/native or release claim. Both
  authoritatively active handles retained. Parent degradation call follows repeated output truncation and
  one atomic documentation patch mismatch; corrected patch below this checkpoint preserves records.
  AAR triggered; no source/protected mutation from those tool errors. Next continuation reviews live
  worker results, completes missing checks, then independently verifies stable code before acceptance.

### Continuation 02:26Z — source156 and controlled UI-history comparison

- Previous goal turn: PROGRESS (terminal selector correction, independent6/6 helper check and source/UI
  review). Current turn also makes PROGRESS through semantic diagnostics and coverage/causality review.
- Parent exact-owned TypeScript diagnostic failed26 errors with stable source91c1b97a and testa49d3c35,
  exit1/session83593 terminal. All errors were new test accesses to ledger operation arrays typed as
  unknown, not production-source diagnostics. Evidence:parent-owned-type-review.log under this prefix.
  Worker corrected use of typed fixture operations. Its initial explicit NodeNext command used different
  compiler settings and failed32 import-extension diagnostics; parent rejected changing imports to fit
  that probe. Repository-tsconfig exact-owned check now reports0 diagnostics in
  worker-owned-tsc-project-options.log. This is not a whole-project typecheck or independent parent rerun.
- Worker source-final-gates.log reports PASS156/156. Parent independently READ this log; parent has NOT
  independently RUN the final156 suite. A mistaken worker attribution was explicitly corrected. Final
  exact lint first failed prefer-const in the test; same worker owns correction and fresh final run/freeze.
- New empty imported-row apply/inverse checks pass exact source swap/restoration and base-cell ownership.
  Terminal Button/Input kernel/stateAfter-removal negatives3/3 refuse against a positive baseline.
  Genuine rebound-alias, table-rebind, later cross-row assignment and interleaved-execution cases issue0.
  Initial alias-negative expectation was overbroad: static local alias=ftable; first=alias:addRow is tracked
  by existing table-alias proof. It is retained as an apply/inverse positive, not silently removed or made
  unsupported. Prior empty-case failures and source-gates{,2,3}.log remain evidence, not current successes.
- Parent reviewed full214-line UI-source increment and102-line mapper-test delta; requested plain text,
  compact readable placement, one-based/unique creator proof and mixed-action guard are present.
  Mounted New-menu matrix23/23 includes actual move/inverse/continued edit; history check still failed.
- Coverage finding: replacing PORTABLE_PIPELINE_TEST_SOURCE with the new one-target history source
  removed menuB/menuC context from existing title-history recovery. Worker must preserve original
  multi-target/handler coverage while extending movement checks. No old oracle scope may be weakened.
- Parent inspected the complete successful worker actual-corpus diagnostic: catalog ready,6 issued moves,
  selected History Row2 widget with both contextual directions. BUT it used cold History Before bytes,
  a new workspace and NO colorEvidence. The failing mounted path uses History After following title edit,
  Undo/Redo and fixture.color. This multi-variable probe does not isolate P7 fixture versus production
  history/color behavior. Both workers notified; no production gap is either proven or excluded yet.
- UI worker now owns a SAME-workspace/History After/profile comparison with and without color evidence,
  plus current onSessionProjection observation if needed. Preserve failing fixture until cause is known.
  P7 helper/widget transport uses test stubs/hash overrides; it is test-model evidence, not real corpus
  fidelity. No blanket fixture weakening, color removal from acceptance or speculative source patch.
- Fresh machine-state question reissued for the eventual browser gate; no answer yet. Both exact native
  handles active, no desktop/E2E/protected writes. Parent type-probe process exited; no parent test running.
- AAR triggered by test typing, incorrect probe compiler mode, overbroad alias expectation, fixture
  coverage loss, uncontrolled successful comparison and evidence-attribution correction. Sustain real
  producer positives and independent diagnostics; improve by keeping comparison inputs identical and
  using project compiler options. Highest evidenced risk: making integration green by weakening fixtures
  or relabelling worker output as independent verification. Existing acceptance/freeze requirements stand.

### Continuation after user status — frozen source and mounted-history isolation

- Previous goal turn: PROGRESS. Parent polled session40309 to terminal exit0 at02:36:09Z and read the
  independent source selftest PASS156/156; both owned hashes still match the worker freeze. This is new
  source evidence, not completion inferred from the user's status question or worker counts.
- Curie is completed/frozen, not running. Source91C1B97A7980D98E8D5E1B1D4E2B0267BC82753833C6E6454C2C260B96F089D0;
  selftest55A472AF7CEA90B48DF1E0F1D3C8297B5163A16D265FE80995BEF1EFB20BA536. Parent source log:
  test-results/b119-row-rearrangement-parent-frozen-source.log. Parent finished the remaining frozen-test
  increment review. Layout regression, target types/lint/whitespace and ten-dependency stability remain
  before this source checkpoint; source writes stay frozen. No source/API support change is authorized.
- Schrodinger completed a diagnostic, not UI acceptance. Parent inspected the current test: the mounted
  history branch uses the revised one-column portable fixture, whereas its new cold diagnostic uses
  ORIGINAL two-column/spanned History After bytes. Worker reports original source09305FE2 produces all
  six moves with and without color. This rejects color as the standalone original-catalog cause, not
  the original mounted-history failure. Current failing up assertion belongs to the different portable
  fixture with its row1 handler. Moving that handler or merely deleting the up assertion is not a fix.
- Next bounded UI work, same four-file owner: preserve baseline multi-target/handler title-history
  coverage, restore and run the ORIGINAL mounted four-row/spanned history case, then compare actual
  live projection/catalog/selection/pending state after title edit/Undo/Redo against the identical cold
  projection. Parameterizing the existing test harness is allowed; fabricating accepted moves, removing
  old oracles, changing fixture support to get green, or adding a second history owner is not.
- If current original mounted behavior is green, preserve the historical red and report inability to
  reproduce it on the frozen source; do not invent a past cause. If red, preserve the exact differing
  state, correct only a demonstrated owner defect, and retain the red-to-green regression. Source-owner
  changes require parent coordination. Finish all existing movement acknowledgement/selection/history
  negatives, remove temporary diagnostic logging, freeze and independently validate before browser work.
- Current parent Layout regression session6011 is live. No new E2E/desktop/protected write; fresh machine
  state remains unanswered. Goal remains ACTIVE/PARTIAL, with all nine journeys/native obligations intact.
- AAR remains triggered: second comparison used a different mounted fixture, and raw long log lines
  caused output truncation in the status inspection. Use compact parsed summaries and explicit source
  hashes. Highest evidenced weakness remains accepting a different passing fixture as causal repair.

### Parent source checkpoint — 02:48Z, PARTIAL unit / source checks passed

- Receipt and two inert snapshots:
  test-results/b119-row-rearrangement-source-parent-reviewed-20260911T0245Z/receipt.json.
  Parent source156/156exit0; target project-options semantic types0; strict exact two-file ESLint0;
  exact whitespace0. Ten owned/dependency hashes match before and after all checks. Source freeze
 91C1B97A/55A472AF remains in force. Curie COMPLETED and CLOSED by authoritative native close result.
- Parent Layout portable run789/790 with1 skip is NOT zero-skip proof. Named skip: configured widget
  source hash/fallback expressions, because X4_REFERENCE_ROOT was absent. Parent reran with the saved
  corpus root only in the child shell environment, restoring its previous value afterward. Final
  configured Layout790/790,0 skips,exit0. Exact widget hash420AFBA33D925A7B55F2A82AB12773DF04826EF588317010D209B249DE7BAED1;
  shipped fallback expressions at16977/16978 match. Logs:parent-frozen-layout{,-configured}.log.
- Full baseline-relative source/test review plus final199-line source cleanup comparison and remaining
 349-line test increment completed. Final source change since earlier review removes diagnostic logs
  and fixes indentation, without a new public contract or unreviewed semantics. Source positives and
  causal refusal cases are listed in the receipt. This is not whole-project or installed/runtime proof.
- Graph vocabulary[source,workspace,history,selection,row,catalog] traversal located the existing
  mounted selection-transfer/pending seams, with weak generic/inferred neighbors; no direct causal
  evidence for row/history failure. Current source and controlled mounted tests remain authoritative.
  No graph rebuild or capability-map delta; no public issue/Git/release/protected state advanced.
- Same UI worker is authoritatively active. It reports two parameter sets using one shared mounted
  history owner, preserved handler, removed temporary diagnostics and final checks underway. Parent
  four-file review and independent acceptance remain. Do not elevate this interim report to a green UI.
- AAR non-clean: initial configured-source skip was caught and rerun; incorrect guessed widget path in
  a read-only Test-Path probe was not used as a gate. Sustain actual corpus hash checks and frozen hashes.
  Improve bounded output sizing; no state corruption from diagnostic output truncation. No broader
  completion, release or commit point is claimed while UI/browser/full-goal requirements remain open.

### Final UI review follow-up — exact history bytes required

- Parent read final production/context/mapper delta and all301-line UI-test increment. The existing
  portable fixture is restored, and the test harness now parameterizes baseline multi-target title
  history separately from the original spanned-row history journey. No second production history owner.
- Worker reports both mounted history runs green; original both-disabled behavior is not reproduced on
  current frozen source. Its historical cause remains UNPROVEN. The cold color comparison cannot explain
  the earlier mounted failure. Do not recast the later portable handler boundary as that original cause.
- Review requires one narrow test correction before parent acceptance: movement/Undo/Redo currently
  prove label order with indexOf, not full Lua/workspace preservation at those movement transitions.
  Same worker must derive expected swapped Lua independently from current issued entry intervals and
  assert full source plus unrelated metadata/sibling preservation. Undo must equal pre-move workspace;
  Redo must equal accepted moved workspace, with fresh hierarchy/current canvas. Production stays frozen.
- Movement-specific make-new-edit/redo-clearing remains an actual-browser BatchC obligation; generic
  App history evidence is not a new browser claim. Parent requested exact reporting of this limitation.
  Preserve existing title-history negative coverage, source-owner positive/negative evidence, and all
  outstanding full-goal journeys. No change of acceptance scope or permissive fixture workaround.
- Worker lint transcript attempt produced no file on empty stdout; parent requested a real rerun with
  output redirection, not reconstruction from narration. Full final checks and hashes remain required.
- Graph query result saved under graphify-out/memory/query_20260911_025006_what_existing_source_workspace_history_selection_r.md;
  this is a workspace graph navigation note, not a Codex memory update or graph rebuild.
- AAR trigger: exact-byte UI history assertions were missing despite green label-order checks. Sustain
  source-derived expectations; highest evidenced risk is a narrow oracle being read as full preservation.

### Parent UI integration checkpoint — 03:05Z, PARTIAL / actual browser pending

- Parent independently RUN SourceEditor with configured X4_REFERENCE_ROOT, session89733exit0. Named
  matrices:canonical color19/19, selection transfer32/32, insertion transfer6/6, New-menu25/25, direct
  callback/Discard12/12. BOTH portable-title-history and original-row-movement-history pass. Stale-cell
  direct callback and actual Session unnamed-chunk regression pass. No matrix count is goal completion.
- Parent mapper selftestexit0; WHOLE-project tsc --noEmit session41877exit0/empty log; strict exact SIX
  source/UI-file ESLint --max-warnings=0exit0/empty log; tracked whitespace0. Baseline-relative no-index
  checks for the untracked mapper pair return normal difference exit1 and only LF-to-CRLF notices,
  no whitespace errors. Do not mislabel these raw exit codes as0. Prior App lint warnings remain outside
  this six-file check; no unrelated App cleanup or precommit waiver.
- Four UI-owned hashes stable before/after parent checks and equal worker freeze. Ten source/dependency
  hashes unchanged since source checkpoint. App/UIBuilder/history helper hashes still match the frozen
  source-history receipt. Four inert final snapshots copied with before/copy/after hash agreement.
- Receipt:test-results/b119-row-rearrangement-ui-parent-reviewed-20260911T0304Z/receipt.json.
  Final UI hashes:mapperCDAF4EFADC5E932D9FEA1DB7A4AEFA6004EB00AF86E0AD35FCB6FA377049AB0A;
  mapperTest15ECD66DA54B1DDA85A2312922A2BF2FCCE876D199ED8F10C6FE3DDD9FD80F1B;
  componentE822FB63AA556629E4B190660D92793A18A5FBB01F8E74D8CE84DBA778390CF4;
  componentTest3AB48AC40FDAE15BDB9789060A2F74EFEEA024A4D31E1EEFFC492B21DECAA81F.
- Parent reviewed the full four-file delta, subsequent301-line test increment and final exact-byte
  amendment (265 diff lines, including indentation/context). Current issued entry independently defines
  expected swapped Lua; tests compare complete moved workspace, unrelated metadata/siblings, exact
  pre-move Undo snapshot and accepted-move Redo snapshot. Portable initializer remains byte-exact to
  pre-unit baseline. Canvas assertions compare mounted instance identity/current status, NOT pixel
  signatures despite one assertion-message wording. Real rendered browser inspection remains required.
- Historical original both-disabled failure is NOT reproduced now; its old cause remains UNPROVEN.
  No handler relocation, color stripping, unsupported-scope redefinition or replacement history owner
  was accepted as its fix. Generated movement, inverse, continued edit, and acknowledgement negatives
  now have independent headless evidence. Generic history coverage does not newly prove the actual
  movement->new edit->redo-clearing browser journey; BatchC must still exercise that boundary.
- Schrodinger COMPLETED and CLOSED; Curie and Tesla already CLOSED. No live subagent or parent process
  remains. No E2E/browser/desktop/build/package/install/native/Git/protected mutation this checkpoint.
- NEXT safe unit: author/review movement and redo-clearing in the existing frozen history E2E spec,
  retaining prior assertions. Running the browser still requires fresh machine-state clearance,
  serial3200/3201 and new live-state baseline/teardown. Full goal remains ACTIVE/PARTIAL; no VERIFIED
  release/commit close. Suggested future title: feat(ui): add source-owned row rearrangement.
- AAR triggered by the weak original history oracle and its correction. Sustain real generated inputs,
  independent expected bytes, frozen hashes and immediate worker cleanup. Improve proof vocabulary:
  instance replacement is not pixel fidelity. Highest evidenced risk is accepting headless green as
  usable rendered authoring; browser/native obligations remain explicit. Lessons recorded here only.

### Code-index maintenance after writer cleanup — 03:09Z

- Read graphify update instructions and local CLI help; local `update` explicitly re-extracts code without
  LLM calls. Existing .graphifyignore excludes docs/assets. Both native writers were closed before run.
- `graphify update .` parent session84300exit0;462files,11251nodes,28394edges,336communities. Updated
  graph.json/GRAPH_REPORT.md; graph.html intentionally skipped by its5000-node size guard. Do not use
  old HTML as current index proof. No force/shrink override, semantic extraction or API spend.
- Old graph preserved at the UI checkpoint's graph-before-update.json.snapshot. Exact output:
  test-results/b119-row-rearrangement-parent-graph-update.log. No source/installed/live workspace change.
  All parent processes and native workers are terminal/closed. Goal ACTIVE/PARTIAL; next BatchC unchanged.

## BatchC reconciled browser specification — 03:15Z, SPECIFIED

- Previous goal turn: PROGRESS (independent source/headless UI checks, exact-byte history correction,
  both worker closures and code-index refresh). This continuation revalidated the full objective and
  current source/history receipts; full goal remains unchanged and ACTIVE/PARTIAL.
- Bounded unit: add a dedicated actual-browser row movement/history journey to the existing
  tests/e2e/x4-ui-source-editor.spec.ts. Keep its ten existing discovered tests and all old assertions.
  No production, harness/config, corpus, service, installed, live workspace, game or Git writes.
- Current sole-file baseline SHA256 C2A7CB92986023BD5AD7DD09BEF2E6C8CCD9CB94D3DDA57478170F9FD3C17C2F;
  exact earlier snapshot/receipt:test-results/b119-source-history-browser-spec-parent-reviewed-20260911T0104Z/receipt.json.
  Capture a new inert pre-BatchC copy and use exact owner diffs for rollback. Six source/UI files remain
  frozen at the two03:05Z/02:45Z parent checkpoints; there is no live code worker to overlap.
- Reconciliation: fresh graph node x4-ui-source-editor.spec.ts contains setupContextualInsertionFixture,
  createActualNewMenu, assertContextualLuaSiblings, assertFreshNativeCanvas, readNativeCanvasSignature
  and existing source-locality helpers; current source confirms their bodies. Existing history journey
  at1803 performs Newmenu/Addrow/Text/edit/Undo/Redo/new-edit redo-clearing but no row movement. Existing
  same-menu multi-row journey creates populated widgets but does not move them. Reuse these owners;
  add no hidden state injection, parallel parser/source editor, history writer or fake accepted result.
- Acceptance: create a sibling menu and a three-row target through real UI New menu/Add row/palette;
  at least two movable rows have distinct visible text/button content. Select row2 via its widget,
  move down, obtain fresh ROW3 selection, move back up and restore exact source/pixels; move down again,
  use global Undo and Redo to recover exact before/after source/workspace/hierarchy/native pixels.
  Then Undo the move, visually edit the restored widget, and prove Redo disabled plus stale redo shortcut
  cannot restore the discarded move or change the current full workspace. Keep Not verified in game.
- First/last boundary controls must be disabled with no workspace/history effect. Every accepted move
  must preserve all other source bytes/files/metadata. Derive the expected adjacent-block permutation
  from the known generated source using existing sourceLineSpans/strict unique addRow boundaries, not
  by comparing accepted output to itself. This is a test oracle for the fixed builder-generated grammar,
  not a production Lua parser. Its module-time selfchecks must reject unchanged output, dropped widget,
  wrong row order and unrelated-byte mutation against a genuine positive swap.
- Native evidence: stable-profile getImageData signature/nontransparent pixels, fresh canvas identity,
  correct hierarchy/selected-row identity and visible positive selection geometry; pixels must change
  on visible movement and match on inverse/history restoration. Persist complete workspace/Lua states,
  native signatures and actual browser screenshots to test.info().outputPath, attach durable files.
  No screenshot-generation tool or mocked pixel oracle. Monitor all console/page errors without filters.
- Keep the standard test timeout/retries/workers. A dedicated journey avoids bloating the existing
  history test; it must still exercise the complete movement sequence in one real browser session.
  If the unchanged timeout is exceeded, retain the failure and reconcile actual performance; do not
  increase it, inject ready-made Lua, skip steps, or silently remove earlier assertions to get green.
- Worker owns ONLY that one spec and bounded test-results/b119-row-movement-browser-worker-* logs.
  No browser/E2E/service/build launch by worker. Parent immediate independent work: review current
  save/export/reopen resource ownership read-only while Luna authors this test; do not duplicate coding.
- Static acceptance: module oracle selfchecks via safe Playwright --list, exact-file strict ESLint,
  repository-options target TypeScript and whitespace at frozen hash; parent full diff review and rerun.
  All are test-authored evidence only. Actual serial3200/3201 browser gate remains parent-owned and needs
  fresh machine clearance plus new fourteen-file live baseline/teardown. Machine question renewed and
  unanswered; no actual browser authorization inferred from old quiet messages.
- Evidence prefix:test-results/b119-row-movement-browser-*; append exact outcomes and AAR here. No
  capability-map delta, public issue status change, release or full-goal completion from authored tests.

### BatchC dispatch / active wait checkpoint

- New inert baseline copy byte/hash-matches C2A7CB92. Resumed existing Tesla native Luna/max handle
 01a08ddb-1914-7e11-91d1-0321c124343c; submission01a08e75-43a8-7850-9573-1416aa2fb54f confirmed
  active/inProgress. Sole spec writer; no overlapping source/UI worker or parent runtime process.
- Worker validated baseline and is authoring dedicated test/oracle. Spec hash remained unchanged at
  last parent inspection, so this observation is VERIFIED WAIT, not a claimed implementation close.
  Parent next: review actual changed delta, repeat frozen static checks, keep browser UNRUN until go.
- Parent read relevant existing fixture/source/pixel/history helpers and prepared full acceptance above.
  Save/export sidecar inspection did not establish a new capability; existing App persistence/restore
  and ReleaseCenter artifact owners must be reused. No route or external write executed.
- AAR triggered: parent guessed StudioHeader.tsx (nonexistent) and oversized combined inspection output
  truncated unrelated spans. Correct discovery uses rg --files; unread spans are not evidence. Parent
  made degradation call, stopped broader sidecar exploration and retained the frozen checkpoint for a
  fresh continuation. Native worker remains active; no restart/interrupt for observation timeouts.
  Highest evidenced risk: noisy inspection obscuring scope/evidence. No source/protected state changed.

## BatchC parent checkpoint — 2026-09-11 03:35Z, PARTIAL / BROWSER-UNRUN

- Previous user-status turn was VERIFIED WAIT: authoritative same-worker active snapshot. This goal
  continuation is PROGRESS: worker implementation, complete parent review, stronger property identity
  assertion, independent static evidence, snapshot and worker closure. Full objective unchanged.
- Sole implementation path: tests/e2e/x4-ui-source-editor.spec.ts, +347/-0. Old142195-byte C2A7CB92
  baseline remains an exact prefix; no earlier test, timeout, retry, oracle or harness setting changed.
  Final SHA256:8F71D08573A4D9EAAD82B312CC78D027C6DE559CBBA97102B1EE498A7AD3B2C4.
  Receipt/inert final snapshot:test-results/b119-row-movement-browser-parent-reviewed-20260911T0333Z/receipt.json.
- Reuses actual New menu/Add row/Text/Button controls, source readback, global Undo/Redo, existing native
  canvas signature and hierarchy owners. Dedicated journey includes sibling preservation, first/last
  disabled controls, down/up/down, Undo/Redo, edit after Undo, and focused Control+y no-op. Exact complete
  expected workspace changes only target Lua content/optional byte count; no hidden state injection.
- Independent fixture-grammar oracle derives row blocks BEFORE movement, preserves all other bytes,
  and selfchecks LF/CRLF permutations/inverses. Unchanged output, dropped widget, wrong row order,
  unrelated prefix/suffix mutation, duplicate binding and unowned executable statements are rejected.
  These module-time checks ran during discovery. Authored native-pixel/hierarchy/screenshot assertions
  are NOT executed or visual evidence yet; the eventual actual browser must produce the artifacts.
- REVIEW: parent read the initial335-line append and exact final increment. Source IDs include literal
  start/end offsets, so current assertion now proves unique new value, changed property ID and old-ID
  disappearance. The original locator was a live ordinal: strengthening proof, NOT a reproduced stale-ID
  browser failure. Current App confirms Ctrl+y outside input/textarea/select routes to global Redo.
- Parent checks at stable8F71D085: project-options target TypeScript0 with0 owned/global/outside diagnostics;
  strict exact-file ESLint --max-warnings0exit0; Playwright --list exit0/11 tests; tracked whitespace0.
  Baseline-relative no-index --check raw1: differences and only baseline LF-to-CRLF notice, no whitespace
  errors. Logs:test-results/b119-row-movement-browser-parent-frozen-{types,lint,list,whitespace}.log and
  test-results/b119-row-movement-browser-parent-baseline-whitespace.log. This is NOT whole-project tsc
  or browser acceptance. Optional reviewctl/rules/external BlastRadius unavailable; manual review and
  named deterministic checks used. Spec hash identical before/after checks and before/copy/after snapshot.
- Eighteen frozen source/UI/history files match prior receipts before/after checks. Tesla native Luna/max
  01a08ddb-1914-7e11-91d1-0321c124343c COMPLETED and CLOSED; no live worker or parent process remains.
- Code-only graph updated after writer closure, session73649exit0:462files,11255nodes,28402edges,
  320communities. graph.json/GRAPH_REPORT.md current; HTML skipped by5000-node guard and not current.
  Old graph retained beside receipt; log:test-results/b119-row-movement-browser-parent-graph-update.log.
- Read-only save/reopen reconciliation: NativeProjectFiles owns native open/materialize/diff; materialize
  writes Mod Workspace and is not harmless export. SyncModal preview/import calls existing round-trip
  and mod-folder owners, then checkpoints/adopts workspace. App persistence and ReleaseCenter artifact
  paths remain existing owners. No route called, no new export implementation/proof. No capability-map
  delta. Old recall hit was an unrelated June static-audit discussion, not evidence for this batch.
- CLOSE: PARTIAL. Actual browser awaits fresh machine confirmation, serial3200/3201, new14-file live
  baseline and clean teardown. Latest required browser remains FAILED9passed/1flaky ERR_NO_BUFFER_SPACE;
  no old-green substitution. All nine full-goal journeys, three-menu/twelve-reference, package/native and
  precommit obligations remain. No release, installed, game/mod/save/config, public issue or Git mutation.
  Suggested future commit title remains: feat(ui): add source-owned row rearrangement.
- AAR triggered: first worker ESLint had two no-regex-spaces errors (worker-eslint-1.log retained), review
  strengthened identity proof, parent repeated a guessed nonexistent path, initially overstated the live
  ordinal concern, and first close-doc patch failed exact context. Failed patch made no partial changes;
  exact current blocks were reread before retry. Parent declared degradation and stopped broader sidecar
  exploration; fresh continuation for next unit. Sustain exact source expectations, preserved baseline,
  independent frozen checks and prompt worker cleanup. Improve path discovery and locator reasoning;
  keep output bounded. Highest evidenced risk: authored/headless green mistaken for rendered usability.
  This plan/receipt bank the lesson; no global wiki or Codex memory writes. No unrelated scope expansion.
