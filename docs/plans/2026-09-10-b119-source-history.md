# B119 source-authoring undo/redo integration

Status: PARTIAL — frozen source/headless checkpoint; strict lint and browser acceptance remain open.
Lane: FULL. Date: 2026-09-10 EDT; final checkpoint 2026-09-11T00:06Z. Plan was SPECIFIED before implementation.
Goal: make accepted visual menu creation, property edits and structural insertion reversible through
the existing App Undo/Redo controls, without overwriting newer work or crossing workspace identities.
Architecture: App remains the single history owner; UIBuilder's existing exact-CAS/post-commit
acknowledgement is the transaction boundary. Real Lua and existing source/edit/renderer owners remain.
Tech stack: React/TypeScript, current source-owner selftests, isolated Playwright harness.

## PLAN

- Bounded unit: source-authoring history integration, a prerequisite within approved Batch3.
- Full objective remains all nine journeys plus three-menu/twelve-reference native fidelity. This unit
  does not complete rearrangement, save/reopen, imports, scenarios, packaging or native acceptance.
- Assumptions: source changes return immutable owner-issued workspace objects; App normalization retains
  exact objects when unchanged. Existing global toolbar and keyboard Undo/Redo remain the user surface.
- References: full goal attachment; original FORGE-UI-EDITOR-BRIEF.md; approved canvas-first plan;
  ADR-F1/F2/F5; current App/UIBuilder/source acknowledgement and workspaceIdentity implementations.
- In scope: exactly-once checkpoints after accepted parent readback; same-workspace undo/redo with exact
  before/after source bytes; rejection of stale history; ordinary typing shortcuts unchanged; tests.
- Out of scope: row movement itself, new source/history stores, whole-Lua regeneration, arbitrary imported
  Lua execution, renderer/layout changes, server protocol changes, release/install or real-mod writes.
- Risks: App history is shared by other authoring views. Preserve legacy checkpoint callers, 40-entry
  bound, redo clearing on new edits and reset on workspace create/switch. No side effects inside
  React-replayable state updater functions. A source transaction must not be recorded on a refusal,
  no-op, wrong workspace, duplicate acknowledgement or stale callback.
- Authorization: workspace source/test/doc edits and focused headless checks only. Machine-state question
  remains unanswered; no E2E/desktop input yet. No game/mod/save/config/install/reload/publish/Git mutations.
- Rollback: exact pre-task inert snapshots plus baseline hashes; reverse only newly owned hunks after
  checking current work. Never restore whole old files over concurrent/unrelated changes.

## BASELINE

- HEAD main: 93c9af111d63ca77c99dee11f21882c4073bcda6. Large dirty worktree predates this unit;
  unrelated modified/deleted/untracked files are preserved. All previous native workers closed.
- App.tsx SHA256 ACDC33E26DA06F9C487330D2CC218C7C65ADCFACE9A1B41E41C07AF8C4984166.
- UIBuilder.tsx SHA256 C7FD9DEBCBA1339BB5A19809DC0037E6C7210F865392B9555413EF92798F6980.
- SourceEditor.selftest.tsx SHA256 960F3ABBA2E1C6C9AFDF2A31C97F7606DB3B730950143B4AAD9C4C567E5CD64F.
- workspaceIdentity.ts SHA256 6DE1BBBB9E7D7E54DC9B4BC0D3A4E7FCF5E5EA4507670E33F12559E41236C9E3 (read-only).
- Latest Add-row focused receipt is green; latest browser gate remains FAILED9passed/1flaky and new
  Add-row browser journey is unrun. Neither older green results nor this unit waive those gates.
- Pre-change component test and inert snapshots: test-results/b119-source-history-baseline-20260910T2235Z/.
- Parent baseline component command completed exit0 at22:37Z, session65044. New-menu21/21,
  callback/Discard12/12 and all preceding suites passed; three target hashes unchanged after the run.
  Optional reviewctl executable, .reviewctl/rules.yaml and named BlastRadius path are absent; manual
  ownership review, focused tests, compiler/lint and exact diff are the available review methods.

## RECONCILE / DESIGN

- Search boundary: current graph vocabulary/traversal, App history/checkpoint/reset call sites,
  UIBuilder mount/commit/ack boundary, SourceEditor pending receipts, SourceEdits structural exports,
  current component and browser tests, capability map and ADR ledger.
- App.tsx owns pastStates/futureStates, saveCheckpoint, handleUndo/handleRedo, toolbar and shortcuts.
  UIBuilder currently receives no checkpoint callback. Its existing queued layout-effect readback
  acknowledges the precise workspace, but does not record App history.
- SourceEdits owns insert/delete/replace entries; no row-move/reorder API found in those exports/types.
  Row movement remains the following source-owned unit, not a claim made by history wiring.
- Workspace selection/create already clears history. Immutable selected workspace ID is separate from
  mutable ModWorkspace.id/name. Canonical complete snapshot comparison must include unrelated fields.
- Alternatives: (1) checkpoint before scheduling is small but records rejected changes; rejected.
  (2) editor-private history is locally simple but competes with global history; rejected.
  (3) accepted-transaction integration into App's existing stacks with conditional restore; selected.
- Extend versus replace: retain the existing single App history owner and public controls. Add the
  safety facts needed by acknowledged source entries rather than replace history or general sync.
  ADR-F1/F5's repeated clobber hazards require exact workspace identity and before/after comparison.
- Source history entries must retain the restore snapshot, immutable workspace scope, and expected
  current snapshot. Check current state before undo/redo; on mismatch leave both history and workspace
  unchanged and show actionable refusal. Guard metadata belongs to these existing entries, not a
  parallel source-only stack. Use canonicalWorkspaceSnapshotString or equivalent existing full-data
  equality, not a short hash as the sole equality proof.
- Record after exact acknowledgement once, with before/after captured at submission; check current
  immutable workspace scope. Duplication/replayed effects must not create another entry. New accepted
  edit clears redo; equivalent/no-op edits do not. Never put checkpoint callbacks in React updaters.
- Preserve existing non-source checkpoint semantics unless a necessary change is documented first.
- Recall returned a clipped old MD-canvas UX audit, not a current B119/history decision; weak match,
  not an implementation authority. Graph navigation alone did not establish App wiring.
- Capability-map delta: none yet; implementation and proof pending.

## IMPLEMENTATION TASKS / EXACT OWNERSHIP

Native GPT-5.6 Luna owns only these code/test paths, all under F:/DEV_ENV/X4_Forge/:

1. src/App.tsx: integrate acknowledged source history into the existing owner/stacks/actions/resets.
2. src/components/UIBuilder.tsx: report accepted exact readbacks once to App; preserve pending protocol.
3. src/lib/workspaceUndoHistory.ts and .selftest.ts (new, if needed): pure entry/transition helpers used
   by the real App owner, not another history state/store. Cover exact restoration and refusals.
4. src/components/X4UiSourceEditor.selftest.tsx: extend real commit-boundary tests; retain existing
   callback/draft/Discard/row assertions. Tests must exercise actual exported helpers/callbacks, not
   duplicate logic or only regex presence. Reproduce missing history linkage before implementing.

No other code paths are authorized without parent plan amendment. Parent owns plans/handoff/evidence,
independent review, and eventual browser acceptance; no concurrent writes to worker-owned files.

## ACCEPTANCE / VALIDATION

1. Actual accepted New menu/property/widget/row transactions record exactly one existing-history entry.
2. Edit A->B, Undo->exact A, Redo->exact B; creation includes exact registration and file count; repeated
   rows include complete Lua and unrelated sibling bytes. Source projection refreshes with workspace.
3. Stale scheduled update, failed acknowledgement, replayed acknowledgement, no-op, double callback,
   workspace switch (including same mod name), changed unrelated field, and external edit before Undo
   or Redo never add false entries or overwrite current data. Refusal leaves stacks unchanged.
4. New accepted edit clears redo; 40-entry limit and existing non-source checkpoint callers still work.
5. Focused commands (Node runtime from handoff): --import tsx src/lib/workspaceUndoHistory.selftest.ts;
   --import tsx src/components/X4UiSourceEditor.selftest.tsx; node_modules/typescript/bin/tsc --noEmit;
   node_modules/eslint/bin/eslint.js <exact changed code paths> --max-warnings 0; exact diff whitespace.
6. Parent independently reruns checks on frozen hashes and reviews the complete task diff. Optional
   reviewctl/BlastRadius were unavailable previously; recheck availability, no installation/upgrade.
7. Required actual-browser proof after fresh machine clearance: New menu -> edit -> Add row -> Undo ->
   Redo, current global toolbar/shortcuts, fresh canvas each time, exact compiled source/siblings and
   negative workspace/stale cases. Use 3200/3201, serial harness, fresh14filebaseline, strict zero-flake
   verdict, archived screenshots/bytes/logs and clean teardown. E2E spec follows integration review.
8. Current production build, full isolated E2E, packaged/installed and authorized X4 checks remain
   full-goal gates; focused/mounted tests cannot establish native UI acceptance.
- Evidence prefix: test-results/b119-source-history-*; detailed receipt records timestamps, commands,
  exit status, stable hashes and exact limits. Status remains PARTIAL until all unit-required gates pass.

## Necessary integration amendment — recorded 22:48Z

- [REPRODUCED] Parent invoked the actual exported reconcileX4UiEditorSelections with a selected source
  key containing sha-after and the restored same-path/same-target candidate containing sha-before.
  Result: both selectors empty; unchanged-hash control retains both. Command: Node --import tsx
  --input-type=module importing src/components/X4UiSourceEditor.tsx, exit0. This proves the selector
  gap, not a newly observed browser rendering. sourceKeyFor includes SHA; the selection useMemo returns
  no selected source/target on this mismatch. Thus history wiring alone misses acceptance2's fresh canvas.
  Durable parent result: test-results/b119-source-history-selector-baseline.json.
- Extend Luna's exact write set by ONE necessary production path: src/components/X4UiSourceEditor.tsx.
  Baseline SHA256 7433246292785DEF8599141B575F94CC9F636E8E2F41A817863BF8BBBF6B3523;
  inert snapshot added to the same baseline directory before worker authorization.
- Reuse resolveSourceEditSelectionIntent (unique exact path + target kind/name) and current selector/
  projection ownership. Do not change sourceKeyFor, weaken global reconciliation, automatically choose
  the first source/target, or relax stale-source guards. Ordinary external edits remain fail-closed.
- App may send an explicit successful history-restoration notice through UIBuilder. It must name exact
  pre/post workspace objects and immutable workspace scope, be issued only after guarded restoration,
  and be consumed only against the corresponding current readback. It is UI continuity metadata, not
  another history store or source writer. Reject stale/wrong-scope/replayed notices.
- SourceEditor may carry the immediately preceding selected menu intent across that exact restoration,
  provided the user has not selected another source/target in the meantime. Resolve against the fresh
  unique source/target catalog, then reproject normally. Do not transfer old builder IDs, drafts,
  receipts, paints or verification. Missing/ambiguous restored menus remain honestly unselected.
- New-menu Undo may have no remaining source; Redo can recover existing retained selector intent.
  Preserve no-auto-selection for unselected workspaces and normal source changes. Include controls for
  unrelated external replacement, user selection interruption, scope change, duplicate notice and
  ambiguous/missing target, plus mounted title-edit -> Undo -> Redo fresh canvas/menu tests.
- This is a required correctness/experience amendment, not a new subsystem or scope reduction.
  Parent independently verifies it with the other history changes; browser/native gates remain open.

## CLOSE / AAR

Pending implementation and review. No VERIFIED close, release or goal completion.
Previous turn: NO PROGRESS (user-requested status only); this unit revalidated the missing live wiring.
Triggered AAR: repeated oversized read output during reconciliation; use bounded reads with sufficient
output allowance, and recover missing instruction text before acting. No memory/skill writes.
Additional lookup failures: guessed helper path ego_detailmonitor/helper.lua was absent; bounded filename
enumeration completed and found ego_detailmonitorhelper/helper.lua. Guessed x4UiCorpus source paths were
also absent; do not reuse them. These were read-only failures, not runtime defects. Parent called
degradation territory and checkpointed the current batch instead of expanding implementation scope.
Sustain: existing App ownership and exact post-commit acknowledgement. Improve: don't confuse a known
Undo button with source-edit integration. Highest evidenced weakness: source authoring bypasses history;
this unit repairs that gap while guarding restored snapshots. Remaining product obligations unchanged.

## Continuation checkpoint — 22:54Z

- PROGRESS: parent reproduced the SHA-keyed selection gap, preserved its exact result, amended the
  implementation/acceptance contract before authorizing the extra production path, and reviewed the
  first history-test draft. Luna acknowledged the amendment and is continuing the same batch.
- Worker Poincare01a08d78-e31f-7be0-be69-0a911fa74183 remains active; current turn
  01a08d78-e3f7-7972-9d38-713655070700 was authoritatively inProgress at22:50Z. Subsequent bounded native
  waits timed out without terminal status. Do not restart it because a wait expired.
- New history selftest exists (8073 bytes at22:47:58Z); production App/UIBuilder/SourceEditor still
  matched their baseline hashes at22:54Z. No implementation acceptance or post-change green test claim.
- Early review finding: metadata-only A/B transitions and a disconnected creation assertion are not
  Lua history evidence. Worker was asked to exercise actual creation/source edits through history,
  exact registration/file count/sibling preservation, and actual App commit/restore callbacks.
- Corrected parent assumption: retaining SHA-keyed selectors can recover the identical source on Redo,
  but does not select a different restored source revision on Undo. The explicit, guarded continuity
  amendment addresses this. Browser/native observation remains separate and unavailable this turn.
- Next action: wait for the same worker's completed checkpoint, inspect its actual diff and test coverage,
  independently run focused/type/lint checks on frozen hashes, request bounded corrections if necessary,
  then close the worker. No row-move implementation or broader gate has been substituted or waived.

## Early recording-identity review

- Worker helper and expanded real-creation Undo/Redo selftest now exist; worker helper command reported0.
  That is worker-level evidence only; App/selector integration and independent final checks remain.
- [REPRODUCED] Parent direct invocation of prepareX4UiSourceHistoryEntry on stable helper hash
  13DEB2407FF492E31BC8240DA22091F675BAF2DB7BA1B00AC0B5B86E8467C65F recorded a receipt against a
  different live workspace object with equal bytes. Receipt/ack correspondence was also value-based.
  This weakens the existing exact acknowledgement contract; requested correction is within original scope.
- Recording must preserve exact expected/after/ack/current object correspondence and bound immutable
  scope. Stored-history Undo/Redo instead compares exact canonical snapshots because restoration clones.
  No-op detection remains canonical equality. Worker notified with cloned-current/tuple negative cases.
- Evidence:test-results/b119-source-history-recording-identity-review.json. No new full-goal claim.

## Early App restoration review — correction required

- [REPRODUCED] Parent extracted/transpiled actual handleUndo from stable App hash
  83CE3A3D20FC464A0D70D1A7931548524630A3CE02C823D3F5EAB356B9CE0F06 and invoked it with the real
  transition helper. Ref still B, history A->B, and a newer unrelated X already in the state queue.
  Flushing after Undo erased X, restored A, popped/pushed history, and published a restoration notice.
- The current new callback checks only rendered/ref state, then unconditionally schedules a workspace
  replacement and mutates history before live readback. Redo uses the same pattern. This is not acceptance.
- Required within original contract: exact functional-updater CAS with scope/history origin, no updater
  side effects, exact committed readback before history/accepted restoration notice changes, unchanged
  stacks and current data on refusal. Reuse the existing acknowledgement facilities/real App owner.
- Tests must exercise actual App callbacks with deferred/replayed scheduling, queued external updates,
  double actions and scope switching. Pure transition tests do not cover this integration contract.
- Do not invent 'unbound' as a valid immutable workspace scope; missing authority fails closed for source
  history. Parent notified the same worker; no scope expansion or new state/history owner is authorized.
- Evidence:test-results/b119-source-history-queued-undo-review.json. Test execution0 is successful
  reproduction of the defect, not a passing acceptance gate. Correction and independent rerun required.

## Independent helper correction checkpoint

- Parent full workspaceUndoHistory.selftest.ts exits0 with stable hashes before/after:
  helper092237B37F03356DB704BE586E857196FFE419FA8ADBA06E33847CBF991BC624;
  selftestD354D6F4C1AB511F79738E8A80AA41B0D66ED6ECE0E37AE73C905EB29CF352F1.
  Includes real New menu creation THROUGH guarded history, exact Lua/ui.xml/full snapshot restoration,
  old/new file counts, sibling preservation, stale/scope/no-op/identity and legacy-bound controls.
- Parent separate direct7case probe exits0: exact recording positive; cloned current workspace,
  cloned expected/after/readback tuple, empty scope and unbound-scope recording all refuse.
- Logs:test-results/b119-source-history-parent-helper-first.log and
  test-results/b119-source-history-parent-recording-identity-first.log.
- Recording-identity defect is corrected at this helper checkpoint. App queue-CAS/readback defect and
  delayed post-readback selector recovery remain required corrections; no full-batch or visual acceptance.

## Captured-content guard follow-up

- [REPRODUCED] Actual updated App Undo callback plus actual readback effect at stable hash
  8998358AAC5710B4DCA3C88249DAB16C5EE2E338BDB5BB24E6E0A820D51898F5 still erased an in-place
  mutation of expected B made after scheduling and before the updater; history moved and notice published.
- Comparing canonical(current) to canonical(currentWorkspace) after identity equality compares an object
  to itself. The readback's current-versus-result object comparison had the same weakness. Capture both
  expected-current and intended-restored snapshot strings before scheduling, then compare live data to
  those immutable strings. Rejection must settle pending state even if React returns the same object.
- Worker notified; tests must include mutation before updater and target mutation before readback.
  Evidence:test-results/b119-source-history-inplace-undo-review.json. This is within original snapshot/CAS
  contract. No full App integration acceptance yet; standalone recording helper checkpoint stays distinct.

## Independent App callback correction checkpoint

- Parent extracted/transpiled ACTUAL App Undo/Redo callbacks and pending-history readback effect, invoking
  the real transition helper with controlled deferred/replayed state scheduling.20/20 cases pass, exit0,
  App hash stable before/after:2BA9E42894272C11B34913F6BF7FB91C458583E370E24A5005330DFF4CC94AF5.
- Each direction covers exact restoration, queued newer object, in-place mutation before updater,
  mutated target before updater, scope change, history-origin change, double click, replayed updater
  (no history/notice side effects before readback), target mutation after apply, and cloned readback.
- Rejections retain history/current newer data, emit no accepted notice, and clear pending. Accepted
  transitions settle exactly once. The new boundary counter ensures no-change rejections can settle.
- Evidence:test-results/b119-source-history-parent-app-causal-first.log. A subsequent snapshot raced
  another worker edit and captured23C6726F2717D174E3847355CA3186549A08005E26F4BF5D7A5998DD2E5C86F3,
  NOT the tested2BA9E428 version. It is explicitly unvalidated WIP at
  test-results/b119-source-history-parent-app-post-probe-wip.snapshot; never cite it as the20case proof.
  The probe itself had matching pre/post2BA9E428 hashes. Final checks/snapshots must await worker freeze.
- Queued-update and in-place-mutation defects are corrected at this callback-scheduler checkpoint.
  This is not a mounted React/UIBuilder/selector or browser test. Those gates, compiler/lint and full
  goal acceptance remain open; same worker is finishing integration validation.

## Independent current callback checkpoint — 23:31Z

- PROGRESS after the user-status-only turn: reviewed complete current App/UIBuilder/SourceEditor deltas
  and full helper after extracting scheduling/readback into pure App-used functions. App remains the
  only history owner; no architecture or acceptance change.
- Actual current App callbacks and layout-effect readback again pass20/20, exit0 at23:30:54Z. Both Undo
  and Redo cover exact/queued-newer/in-place-expected/target-before/scope/history-origin/double/replay/
  target-after/cloned-readback. Stable App00FAC411372E25E73CD4A238B5D60A62284743025B7B5F0D53C621A2033F7A0D,
  helperB5B29A69A7D035F86925F1828C8B3D406766578AAA82B8F07ADBBCF9139F115B and baseline workspaceIdentity.
  Evidence:test-results/b119-source-history-parent-app-causal-second.log. NOT mounted/browser evidence.
- [REPRODUCED] Early WIP helper suite exits1: its new causal fixture uses app-causal-scope while the
  reused recorded entry belongs to selected-scope-a. Correct guard refusal, incorrect positive fixture.
  Evidence:test-results/b119-source-history-parent-helper-second.log; test07AD26FF09DEE122A7D65A36C2062AB07EB29428E8A01403CF2A5B36D730AE10.
  Same worker notified; do not weaken production scope policy. Review also flagged the negative test's
  old-array expectation after its intentional external history replacement; preserve the new array.
- Worker is still active on mounted editor integration tests; no final frozen acceptance result yet.
  Parent requested exact UIBuilder accepted-history callback plus delayed App-style notice/title-edit
  Undo/Redo menu recovery, full helper/component/type/lint, then explicit six-file freeze.
- AAR trigger: WIP test-fixture mismatch. Sustain independent actual-callback probes; improve by matching
  positive fixture authority before testing negative scheduling. Highest evidenced risk remains losing
  selection after restored source revisions until the actual mounted path passes. No capability-map
  completion delta, external write or goal completion. Handoff compacted to current actionable state.

### Corrected helper follow-through and mounted review

- Parent independently reran the complete helper suite after Luna's fixture repair: exit0, stable
  helperB5B29A69, baseline workspaceIdentity and test60E0BE05140DCB505E7BDBA143DE135C0FABF76444676B6DE3199BA5D82DD670.
  Evidence:test-results/b119-source-history-parent-helper-third.log. The earlier failing positive
  fixture is corrected; full mounted/browser acceptance still outstanding.
- Native read_thread still reports the same worker active/inProgress. Its new mounted UIBuilder
  title-edit test now exercises the real accepted-history callback and a deliberately delayed Undo/Redo
  notice. Parent flagged WIP test oracle gaps: undefined fresh selector values must not pass merely by
  differing from old keys; corpus authority must be explicit rather than depend on prior-test cache.
  Worker is correcting within its six-path scope; no separate worker or production guard relaxation.
- A fresh async machine-state question was issued for the upcoming browser gate. Headless work continues;
  no answer or browser authorization is inferred. No full-batch freeze or final independent component,
  compiler/lint/browser pass yet. Goal active/PARTIAL; this continuation produced concrete new evidence.

## Mounted corpus fixture amendment — existing injection seam

- [REPRODUCED] Worker's actual mounted UIBuilder run refuses its fixture before the title-edit step:
  corpusDetail reports supplied bytes do not match the pinned SHA-256. New-menu22/22 passes before
  this failure. The existing P7 fixture is synthetic and its SourceEditor tests intentionally use the
  already-supported injected corpusLoader; it is not a byte-exact game corpus transport.
- Do not replace global cryptographic hashing to make the default loader accept synthetic bytes in
  this history integration test. That changes a process-wide service unrelated to history and can
  affect other source-identity consumers. No production integrity policy is relaxed.
- Necessary bounded adjustment within the existing six-path write set: UIBuilder may accept an optional
  typed source-editor corpus loader and forward it to the existing SourceEditor corpusLoader prop.
  Undefined keeps the existing real configured loader unchanged. No new loader/authority owner,
  environment/configuration change, exported network service, or runtime selection path.
- The mounted UIBuilder history test supplies the same explicit canonical fixture loader already used
  by the neighboring SourceEditor mounted tests; assert ordinary acknowledged edit and delayed menu
  recovery through the real UIBuilder. It proves history integration, not corpus authenticity or native
  fidelity. Default-loader integrity tests and actual-corpus browser gates remain unchanged and required.
- Parent requested this amendment before authorizing the forwarding implementation. Rollback is the
  optional prop/pass-through plus fixture wiring only. Required full component/type/lint and final hash
  freeze remain; preserve real-parent callback assertions and require defined selected fresh keys.

## Mounted negative-path diagnosis — 23:48Z

- Worker mounted title edit/Undo/Redo reaches the real callback and recovery path, but the duplicate-
  notice control reports a source selected after the user clears selection. Treat that as a mounted
  symptom, not a proven production defect. Parent inspected the fake DOM before authorizing a fix.
- [REPRODUCED] Parent extracted the ACTUAL MountedDomElement class and installed React DOM's actual
  updateOptions implementation. Selecting Lua and then empty leaves both fake options selected because
  selected is a plain boolean without native single-select sibling deselection. The same React function
  in isolated headless Chromium leaves only the empty option selected. Browser closed in finally;
  no app workspace, live browser UI, game, service port or configuration was touched.
- Command: Node --import tsx --input-type=module inline actual-class/React/headless comparison; exit0.
  Evidence:test-results/b119-source-history-parent-select-dom-review.log,23:48:21Z. Inspected test hash
  20B3C910F3FBE73CF336D02B04148584633BC02131B294BB7426DCC66613019F.
- This proves a test-DOM fidelity defect capable of producing the observed false re-adoption report;
  it does not yet prove every production history path correct. Same worker notified: repair the fake
  single-select behavior within the existing owned test path, add its direct regression, retain the
  original duplicate-notice negative, and rerun the full matrix. Do not weaken production recovery.
- Triggered AAR: a partial DOM mock can retain impossible native option states. Sustain native headless
  controls against actual React behavior before changing production to satisfy a contradictory mock.
  Full authoring/browser/native-X4 gates remain open.

## Read-only following-unit preparation

- Graph query for row/binding vocabulary returned generic or unrelated neighbors, not proof of row
  movement ownership. Targeted current-source inspection supplies the useful facts instead.
- SourceEdits currently catalogs insert-row/widget/delete/replace, not row movement. Existing local
  row ownership, row/table binding continuity and exact retained-operation/kernel-state correspondence
  must be extended, not replaced. Moving a row must carry its proven owned statements and preserve
  unrelated bytes; an array-only visual reordering would leave canonical Lua unchanged.
- Exact shipped helper.lua table:addRow finalizes column widths, appends the row and derives its index,
  then applies scaling/properties/default spans. Movement needs proof of call-order effects and an
  explicit row/operation correspondence, not a blanket waiver of existing ledger comparisons.
- This is preflight only: no row-move implementation plan declared ready, no code changes or second
  worker dispatched while history dependencies are under acceptance. Full rearrangement remains required.

## Actual App normalization failure — 23:50Z, correction required

- Parent complete test diff review found a history-roundtrip-only bypass of the normal parent
  sanitizeWorkspace/retainWorkspaceCandidateIfNormalizedUnchanged path. That bypass is not valid proof
  of the real application boundary and must be removed. The new UIBuilder Parent also needs to exercise
  the existing real normalization/retention functions rather than a plain unrestricted state setter.
- [REPRODUCED] Real createX4UiWorkspaceMenu -> source history -> schedule -> the actual App normalization
  functions -> settle fails for BOTH Undo and Redo. JSON snapshot cloning drops undefined own fields
  integrationContract/sourceStamp; sanitizer restores them. The exact retention owner correctly chooses
  the normalized object, so readback differs from the proposed object even though canonical bytes match.
  Result: workspace changes but history settlement refuses. This contradicts the baseline assumption.
- Evidence:test-results/b119-source-history-parent-normalized-readback-review.log,23:50:21Z, inline Node
  command exit0 reproducing the failure. Tested current helperB5B29A69 and baseline workspaceIdentity.
  Each direction: candidate19keys, normalized21keys, exactCandidateRetained:false, canonicalBytesEqual:true,
  settlement:refused. Earlier20case scheduler probes did not include this App normalization boundary;
  they remain limited scheduling evidence, not integration acceptance.
- Required correction within the same six-path write set: materialize restored history candidates in
  the existing App-compatible sanitized shape BEFORE capturing/scheduling their exact readback identity.
  Reuse sanitizeWorkspace/normalization owners; no weakened identity rule, no change to workspaceIdentity,
  no restoration-only App bypass and no parallel normalization implementation. Preserve canonical
  snapshots/Lua/sibling bytes and legacy history behavior.
- Add real creation/source edit Undo/Redo through App-normalizing setters, assert history settles exactly
  once and restores exact source bytes, and retain stale/mutation/scope/replay negatives. Remove the
  scenario-specific test bypass. Rerun all required checks on the corrected final dependency hashes.
- Triggered AAR: a test omitted an application normalization step and produced a false integration
  impression. Sustain complete diff review and independent real-boundary probes; highest evidenced
  production risk is restored data with unadvanced history. Unit remains IN_PROGRESS/PARTIAL.

### Legacy absent-scope compatibility follow-up

- [REPRODUCED] App selectedWorkspaceId returns empty string when the context is absent, the new scope
  ref stores null, and callbacks pass empty string to schedule but null through live scope/readback.
  The new guard refuses otherwise valid legacy Undo and Redo. Baseline legacy actions had no selected-
  workspace scope requirement; source-history bound-scope policy must not silently impose one on them.
- Evidence:test-results/b119-source-history-parent-legacy-unbound-review.log. Actual schedule/settle
  helpers both refuse with the existing App empty/null inputs and leave the old description unchanged.
- Within original legacy-compatibility acceptance4, make absent-scope representation consistent at
  the real boundary/helpers, add both legacy direction controls, and retain missing/unbound-scope refusal
  for source history. No synthetic bound scope or new source authority is authorized. Same worker notified.

## Corrected actual-App boundary checkpoint — 23:57Z

- Parent extracted the real App setWorkspace callback (including its sanitizer and exact-retention
  owner), Undo/Redo callbacks and layout-effect readback.22/22 cases pass, exit0 at23:57:09Z, using
  actual createX4UiWorkspaceMenu transactions rather than description-only source-history fixtures.
- Both directions retain the ten scheduling negatives/positives and add absent-context legacy controls.
  Accepted transitions retain the exact proposed object AFTER normalizing, restore complete canonical
  workspace/Lua/sibling bytes and advance history once. Refused cases retain current newer data/stacks.
- Evidence:test-results/b119-source-history-parent-app-normalized-first.log. Stable hashes:
  AppBBA39AB4433EBDB7238413C1E0F1F2F02089B7AC051EC67D923AAC81D3087F48;
  helperE77B3ECC616B56D1CF2D7F38C929FDADDF351686EB535457CBDDB17565DF3453;
  identity6DE1BBBB9E7D7E54DC9B4BC0D3A4E7FCF5E5EA4507670E33F12559E41236C9E3;
  types1E4644682654CCF26F12315A257F67DB50C25B3122B76EE523D7E5684CE5DAD4;
  WorkspaceSource72D69CACF90A2F6BB8468B3A38C725D7683755C3D202C7CA29A9A10A137F7878.
- The restoration-normalization and absent-scope legacy defects are corrected at this real-boundary
  scheduling checkpoint. It remains distinct from full mounted editor, browser, packaged or native proof.
- Parent also independently verified corrected fake-DOM single-select behavior against actual React:
  select Lua/empty/Lua, plus multiple-select control,4/4 exit0 at23:54:19Z on testE98D50BF.
  Evidence:test-results/b119-source-history-parent-select-dom-corrected.log. The prior real headless
  Chromium control provides the native option-selection reference; no production guard was relaxed.
- Parent explicitly called degradation territory after multiple fixture errors and the omitted App
  boundary. Keep the scope fixed: remaining full component/helper/type/lint, final freeze, independent
  review/validation. No row-move implementation until this checkpoint is stable.

## Strict lint baseline reconciliation — no unrelated cleanup

- Worker reports full helper/component/type checks green, but exact six-file lint with max-warnings0
  finds five App warnings. Parent independently ran the EXACT pre-unit App snapshot through current
  ESLint with filePath src/App.tsx, not HEAD. It has five warnings, zero errors: unused NODE_TEMPLATES;
  missing releasePreferences/layoutPreferences dependencies; native-apply effect dependencies
  saveCheckpoint/setWorkspace; and an unused exhaustive-deps suppression.
- These warnings predate this unit. The strict declared gate remains red; there is no waiver, rule
  suppression or VERIFIED close. Record exact baseline-relative diagnostics as additional evidence,
  not as a substitute green strict gate. Any warning-free cleanup needs its own bounded reconciliation
  and validation before changing unrelated preferences or native integration behavior.
- Worker began incidental lint edits in App. Parent stopped that scope expansion and requested reversal
  of only new non-history import/preference-effect/suppression/dependency edits. During WIP a dependency
  array was briefly inserted into an unrelated callback before saveCheckpoint initialization; static
  review identified the render-time initialization hazard. It must not survive the checkpoint. No actual
  user App crash or runtime validation of that temporary code is claimed.
- Parent initial CLI JSON lint output unexpectedly included the complete App source and was truncated;
  use ESLint API reports containing counts/messages only for durable baseline comparison. Evidence:
  test-results/b119-source-history-parent-lint-baseline-review.log. Same six code paths; no new worker,
  release, config or game write. Finish correction/review at a stable PARTIAL checkpoint, not forced green.

## Parent checkpoint / review close — PARTIAL

- Native Luna Poincare completed and was closed after final parent review. No live workers or parent
  test processes remain. Six changed source/test files are frozen, with exact inert copies and receipt:
  test-results/b119-source-history-parent-reviewed-20260911T0007Z/receipt.json.
- Parent independently passed full history helper, full mounted SourceEditor/UIBuilder suite (New-menu
  22/22, actual title edit/history/selection/canvas lifecycle, recovery refusals, prior callback12/12 and
  earlier matrices), actual App setter/Undo/Redo/readback22/22 with real source creation, full TypeScript,
  and exact tracked/untracked whitespace checks.12 source/dependency hashes match before and after.
- Logs: test-results/b119-source-history-parent-final-helper.log, -final-component.log,
  -final-app-normalized.log, -final-lint.log. TypeScript session32022 completed exit0 with empty stdout;
  no typecheck.log was created, and the receipt records that limit instead of linking a nonexistent log.
- Strict exact six-file lint remains FAILED/exit1: five identical pre-unit App warnings, zero errors;
  the other five paths are clean. Exact baseline comparison is in parent-lint-baseline-review.log.
  Incidental non-history lint edits were reversed. No suppression, reduced warning limit or forced green.
- Review of original contract: source creation/title edit and guarded restoration have focused evidence;
  source widget/row changes use the shared acknowledged path, but the combined actual-interface
  row/widget Undo/Redo and redo-clearing journey remains required. Browser proof is not replaced by
  the mounted fixture or extracted callback probes. Strict lint is still red. No full-unit VERIFIED close.
- Reconciliation delta: source authoring is wired into the existing App history owner, with source-only
  focused proof. No duplicate history/renderer/source format; no shipped or native capability promotion.
  Public owner41 stays open/PARTIAL; no release or external projection was advanced in this checkpoint.
- Graph refresh exit0:11183nodes/28180edges/336communities/461files. Existing5000node HTML guard skipped
  visualization; no force-open, LLM or semantic API. Log:parent-graph-update.log under the same prefix.
- Not changed: real mod/game/save/config, installed immutable0.0.78, live workspace, existing SourceEdits/
  LayoutProgram/mapper owners, unrelated dirty work, Git/release state. No commit or push was performed.
- Remaining: strict-lint repair as a separately reconciled bounded unit; fresh machine clearance and
  browser authoring/history checks; source-owned row rearrangement; all other nine full-goal journeys,
  full E2E/build/package/install and authorized native three-menu/twelve-reference obligations.
- Suggested eventual commit title: feat(ui): integrate source-authoring undo and redo. This is a source
  checkpoint, not a VERIFIED release or authorization to skip precommit/publication/machine gates.

### AAR outcome

- TRIGGERED: production overwrite/normalization/scope failures, fixture authority and DOM fidelity
  mistakes, baseline-red lint discovery, incidental cleanup reversed, and oversized CLI JSON output.
- Sustain: native Luna ownership, complete diff review, real App-boundary probes, independent native
  headless control before altering production for a contradictory mock, exact final hashes/snapshots.
- Improve work: never omit the real normalization step in an integration fixture; distinguish a test
  setup failure from production behavior before patching; baseline exact-file diagnostics before cleanup.
- Improve tools: single-select mock fidelity is now corrected and directly checked; use compact ESLint
  diagnostics without embedded source and filtered worker readbacks. No reusable skill/memory writes.
- Highest current evidenced weakness: strict lint is still red on five baseline App warnings and the
  current real-browser authoring gate is unproved. Preserve those boundaries, add the combined real
  authoring journey next when authorized, and do not promote internal checks into native acceptance.
- Project-specific findings and exact evidence are banked in this plan. Full goal remains active/PARTIAL.

## Follow-on: actual browser history acceptance specification — PARTIAL / under review

Date2026-09-10 EDT / after00:24Z. LaneFULL, bounded test-only unit.
Purpose: author the missing actual-App browser journey for the frozen source-history implementation.
This does not reopen the six-file implementation or claim the source-history unit VERIFIED.

### Plan, baseline and reconciliation

- Exact sole write path: F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts.
  Baseline SHA2563740A4373CBCCA4CB3D907EB56311DDC97A1DCE59BE01ED9AB270E906F8861C2.
  Inert copy: test-results/b119-source-history-browser-spec-baseline.snapshot.
- Existing setupContextualInsertionFixture/createActualNewMenu create through real UI after an isolated
  fixture seed. Existing Add-row/widget test uses exact complete Lua deltas and unchanged sibling oracles.
  Reuse these helpers, page-error/console-error checks, source artifacts and canvas-current guards.
- Real App toolbar buttons are data-global-action=undo/redo; they call existing handleUndo/handleRedo.
  No custom history endpoint, direct history-state injection, fake callback or DOM-only success oracle.
- Add a separate focused source-history browser journey; preserve the existing same-menu Text/Button/Input
  authoring test and all current assertions. Do not inflate its timeout or hide the previous flaky gate.
- Required actions via UI: create a menu; add a row; insert a visible Text widget; edit its text; Undo and
  Redo the edit with byte-exact source/canvas/hierarchy checks; undo widget insertion and row insertion;
  redo those transactions; then undo and make a different accepted edit to prove redo clears.
- Existing canvas/selection semantics matter: history restores the menu but deliberately clears obsolete
  widget identity. Reselect a current hierarchy element through the UI when needed; do not assume old
  data-testid/source IDs remain valid. Verify fresh source/target selection and rendered/current state.
- Keep setup lean under existing60s/test limit. Split genuinely independent additional cases if needed,
  but the core create/add/edit/history journey must remain one genuine linked UI flow.
- Record full source snapshots for each history transition and screenshots/native-canvas signatures
  sufficient to prove visible old/new state, not only a green status label. Every transition preserves
  ui.xml, unrelated sentinel and any established sibling Lua. Whole workspace/history assertions must
  account for normal existing owner normalization; do not bypass it.
- Negative: redo is disabled after a new accepted edit, and source remains the new value; repeated Undo
  at a known boundary must not erase unrelated source. Preserve Not verified in game on all preview proof.
- No code under src/, config, dependencies, services, actual E2E, desktop input, realmod/game/save/install,
  Git/push/release/network changes. Actual execution remains pending fresh machine clearance. This is an
  authored-test checkpoint only; strict App lint and broader package/native gates remain open.
- Rollback: reverse only this spec delta against the verified inert copy, preserving earlier uncommitted
  test changes. Evidence prefix: test-results/b119-source-history-browser-spec-.
- Validation: exact-spec strict ESLint and diff checks; Playwright --list through local CLI may prove test
  discovery without starting servers. Parent reviews source/DOM oracles independently and runs final tsc
  after concurrent source worker stabilizes. Type checks during source mutation are provisional only.
- Capability-map delta: none until behavior is run and evidenced. Public owner41 remains open/PARTIAL.

### Coordination and acceptance

- A second native Luna owns ONLY this test file. Curie owns ONLY SourceEdits.ts/selftest for row moves.
  These are independent implementations against the already-frozen history API; no shared file writes,
  test services or source patches. Future row-move browser work waits for both contracts to be reviewed.
- Parent continues contextual-row integration review and then reviews both returned diffs, without
  duplicating worker code. Worker must report PARTIAL/test-authored until actual browser validation runs.
- AAR trigger: parent guessed nonexistent Toolbar.tsx despite App owning the toolbar; read-only path
  search failed. No mutation occurred. Use observed owner paths; avoid broad combined output. Operator
  degradation call made; checkpoint active handles before the next integration continuation.

### Parent browser-spec review — in progress, not browser proof

- Tesla authored one linked Newmenu/Addrow/Text/edit/history/redo-clearing test and native-canvas
  signature/source-delta/fresh-canvas helpers. Parent reviewed its full baseline-relative diff (~356lines),
  including real toolbar actions, exact complete passthrough path/content equality, source/target menus,
  fresh hierarchy reselection, pixel equality on restoration and changed pixels for visible text edits.
- Review clarified that empty-row creation need not change pixels. Current kernel control with existing
  selftest metrics returned height1 despite cell height0 (border contributes), so parent did NOT reproduce
  a zero-height failure for this exact generated fixture. Evidence:
  test-results/b119-source-history-browser-spec-parent-empty-row.log, exit0. Initial probe used incorrect
  metric keys and refused; corrected to the existing fixture shape before drawing conclusions.
  A universally positive selection-rectangle assertion was a hypothesis, not a production diagnosis.
- [REPRODUCED] Parent semantic TypeScript check with real tsconfig and target-spec diagnostics failed
  TS2345 at1922: Locator.elementHandle returns ElementHandle<HTMLElement|SVGElement>, not the helper's
  narrower ElementHandle<HTMLCanvasElement>. Source SHA at observation B9C02891286E81400E3B14498C599F3881474B030FA99E7804B25147925AFEE4.
  Evidence:test-results/b119-source-history-browser-spec-parent-types-first.log. Same Tesla handle owns
  the correction; require accurate types/runtime checks, no cast/suppression. This check is scoped to the
  spec and does NOT replace full-project tsc after concurrent source work freezes.
- Worker strict-spec ESLint and corrected Playwright test --list report exit0; its initial wrong CLI
  subcommand attempt failed. Parent final strictlint/list/type and exact snapshot still pending.
- AAR triggered by command-shape and type failures, parent malformed-read/probe setup mistakes, and
  review-forced correction. Preserve failures; do not claim unrun actual browser, installed or native proof.

### Continued parent review — empty-history boundary still required

- Parent reviewed the corrected complete375-line baseline-relative spec delta at C5079B3E. Scoped
  semantic TypeScript passed0 with no spec diagnostics; strict exact-spec ESLint passed0; safe Playwright
  test discovery passed0,10tests. These are static checks, not browser execution or whole-project tsc.
  Evidence: test-results/b119-source-history-browser-spec-parent-types-confirmed.log,
  -parent-lint-confirmed.log and -parent-list-final.log under the same prefix.
- Review found a missing planned negative: the linked journey restored the initial created menu but
  did not test repeated Undo at an empty history boundary. The same Tesla handle is adding that check,
  not changing production history or broadening its sole E2E-spec ownership.
- App's actual keyboard handler requires lowercase key z and ignores input/textarea/select targets.
  Parent caught uppercase Control+Z and passthrough-only workspace comparison in the boundary WIP;
  requested lowercase Control+z on a real non-input UI target and complete saved-workspace equality.
  These are test-validity findings, NOT reproduced production history failures. Final checks/snapshot
  must follow the correction. Actual browser, full-project tsc and broader gates remain open.

### Parent-reviewed browser-spec checkpoint — PARTIAL, 2026-09-11T01:03Z

- Final sole-file SHA256 C2A7CB92986023BD5AD7DD09BEF2E6C8CCD9CB94D3DDA57478170F9FD3C17C2F.
  Exact inert copy and receipt:
  test-results/b119-source-history-browser-spec-parent-reviewed-20260911T0104Z/receipt.json.
- The empty-history negative focuses the real UI-designer button, verifies focus, sends lowercase
  Control+z three times, keeps both toolbar buttons disabled, and compares the complete saved workspace
  plus exact sorted passthrough files. All later Newmenu/Addrow/Text/edit/Undo/Redo/redo-clearing actions
  and original source/pixel/error oracles remain intact. No timeout increase or fixture-history injection.
- Parent final scoped semantic TypeScript0/no spec diagnostics, exact strict ESLint0, safe Playwright
  discovery0/10tests and exact whitespace0. Logs use the same browser-spec prefix with
  parent-boundary-types/lint/list/whitespace.log suffixes. Source hash stable before/after checks and copy;
  destination hash matches. Full earlier diff and final boundary delta independently reviewed.
- Tesla completed PARTIAL/test-authored; native close_agent confirmed prior completed status and closed
  handle01a08ddb-1914-7e11-91d1-0321c124343c. Curie remains the sole active implementation worker.
- Not performed: actual browser/E2E, whole-project tsc after row-source stabilization, build/package,
  install/native validation. Existing strict App lint and latest browser failure are not waived.
- Requirement review: complete planned linked journey and empty-history negative are AUTHORED; static
  spec checks are evidenced; all runtime/experience behavior is still unproven for this new test.
  No capability-map delta, no external/public/Git/protected mutation. Full goal remains active/PARTIAL.
- AAR: triggered by review-forced type and boundary-test corrections. Sustain exact source/pixel and
  full-workspace oracles plus one-file Luna ownership. Improve test design by checking actual shortcut
  case/focus and full persistence scope before claiming a boundary test. Highest evidenced remaining
  weakness: the browser journey is unrun, so static validity cannot establish actual authoring/history.
  Findings are banked here; no memory/skill or external ledger write. Suggested eventual commit remains
  feat(ui): integrate source-authoring undo and redo; this is not a VERIFIED release/commit point.
