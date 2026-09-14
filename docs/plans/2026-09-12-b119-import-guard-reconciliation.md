# B119 Lua import guard reconciliation

Lane: FULL. Status: PARTIAL. Direct Astra, no agents/Git/release/install writes.

Bounded unit: make the existing Lua import concurrency tests exercise valid imports and their
intended cancellation/CAS/reentrancy behavior, then validate the actual import/reopen journey.
All goal requirements and remaining fidelity/native/scenario/numeric obligations stay unchanged.

Baseline: test-results/b119-import-guards-20260912/baseline.json;35input hashes match the accepted
history-continuity checkpoint. Four inert owner snapshots. Full SourceEditor currently fails the
async import matrix6/9:double-action/superseded/reentrant stop before parent submission; exact older
baseline reproduced it. Reason unknown. HEAD93c9af111d63ca77c99dee11f21882c4073bcda6;dirty work retained.

References/reconciliation: original UI brief/canvas-first goal, Lua-file-roundtrip plan and current
SourceEditorLuaFiles -> importX4UiWorkspaceLua -> source registration transaction. Graph confirms
direct existing ownership. No parallel parser/importer/writer/history. Capability-map delta:none yet.
Agent-Brain returned only weak unrelated history; no prior solution was established.

Steps and boundaries:
1. Add compact actual UI refusal/status to failure records in SourceEditor.selftest.tsx and run the
   full existing suite without skipping groups. No production change until failure mechanism known.
2. Reconcile the observed reason with fixture/source identity and current transaction. Amend this
   plan before the minimal repair if facts change. Candidate owners:SourceEditor.selftest.tsx,
   SourceEditor.tsx,x4UiWorkspaceSource.ts; only necessary owners may change. Preserve source authority,
   exact workspace CAS, single-flight/file-size/UTF8 and cancellation/reentrancy checks.
3. Validate full SourceEditor selftest, focused affected pure owner tests if production touched,
   whole tsc, strict touched-owner lint, exact unit diff review. Then existing Lua-roundtrip browser
   journey on isolated3200/3201,serial/current retry/flake policy, with19persistent-state guards.
   Test fixture/locator repair in x4-ui-source-editor.spec.ts is allowed only after proving mismatch;
   no reduced assertions, sleeps/timeout inflation or fake success. Inspect real screenshots.

Acceptance: imports reach the real workspace owner exactly once in positive controls; cancelled,
stale,overlapping and reentrant work cannot submit improperly; source/registration/siblings preserved;
all required tests pass or exact unreached/failed gates remain PARTIAL. Full product/native release
gates are not replaced by this slice. No writes to real mod/game/save/installed config or Git.
Rollback:reverse only this unit's exact patch against snapshots; never restore an entire dirty file.
Evidence:test-results/b119-import-guards-20260912. Update this plan,BACKLOG,handoff; no external/memory
writes. Risks:invalid fixtures can make zero-call negatives appear green without testing the guard;
diagnose real refusal before timing changes. No new spend/network/delete/permission surface.

Reconciliation amendment: diagnostic full suite07:44:53..07:45:27Z failed1. All three positives report
registration-refused: addon manifest requires a nonempty name. Shared integration fixture ui.xml
has no name; SourceBundle correctly refuses it. Existing SourceBundle negative tests cover nameless
manifests. Repair only that fixture with a non-reserved name, and add a real import-owner positive
preflight to every async guard case so an invalid fixture cannot make zero-call negatives pass.
Keep production registration/CAS unchanged; run full SourceBundle selftest as an additional negative
contract check. Existing roundtrip fixture already supplies its own named manifest and is unaffected.
The remaining selection/acknowledgement matrices reuse this fixture; no blind timing changes.

Full repaired component suite07:50:26..07:51:57Z PASS0: async9/9, selection/ack9/9, input6/6,
export-failure6/6, New-menu25/25 and all earlier/later suites including both history regressions.
Browser setup reconciliation: prior real DOM repeatedly reports refused. SourceEditor layout effect
adopts sessionRefusalResult when source/paint is absent; empty is only its pre-effect initial state.
Correct the setup expectation to refused with explicit not-renderable detail, zero canvas, unchanged
empty source/target/hierarchy and enabled Open Lua; do not weaken positive rendered/current checkpoints.
This is test-state reconciliation, not a product refusal-path change. UX wording remains a separate
broader builder concern. Run the original journey unchanged beyond its setup contract.

Browser07:56:21..07:57:52Z FAILED0/1,0flakes: initial no-source checks pass; actual New menu succeeds;
independent XML oracle incorrectly expects pretty-printed environment contents. Existing createNewUiXml
emits an inline empty environment, and SourceBundle appendBeforeClosingElement preserves it by inserting
only file markup. Correct the explicit expected bytes (no production-derived expected result or XML
normalization); retain all workspace/sibling/full-byte comparisons. Add a screenshot to the existing
positive after-new-menu observation so later failures still retain rendered menu evidence.
After07:58:40Z:35inputs and19guards unchanged/no added/deleted guards;3200/3201closed; lifecycle complete,
treeGone, no termination commands or remaining owned PIDs. Deckwright3100 restarted externally after
run completion at07:58:07Z, new30164 (not in test ownership; command identifies Deckwright, not Forge).
Use current ownership for the next baseline; do not claim the unrelated process stayed identical.

## Validation and review close

Full component07:50:26.8932059..07:51:57.1045981Z PASS0, including all9async guard cases with valid
positive preflights,9selection/ack,6input,6export-failure,25New-menu and both scalar/row history suites.
SourceBundle selftest PASS0, including existing nameless-manifest refusals. Initial whole tsc/strict
two-owner lint PASS0 in07:54:00..07:56:02 batch. After final XML-oracle/screenshot correction, whole
tsc and strict two-owner lint PASS0 at07:59:57.0127888..08:01:08.4037681Z. Tracked diff check PASS0.
Exact two-owner deltas manually re-read: fixture name/preflights/refusal diagnostics; explicit inline
XML bytes; mounted no-source status/detail/Open control; one positive screenshot. No assertion group,
byte/sibling comparison, timeout, retry, renderer, source/registration/history authority was removed.
Production owners are byte-identical to baseline. No capability-map delta.

Final browser08:01:26.5584321..08:03:06.2229950Z FAILED0passed/1failed/0flakes/0skips; full structured
report and lifecycle complete, ownership complete, treeGone/no remaining PIDs/no termination commands.
It passes corrected initial state and exact New-menu XML, selects ui/b119_lua_roundtrip_menu.lua and
menu.createFrame, then correctly fails the positive canvas assertion (0 rather than1). None of the
later add/edit/download/import/history/collision/workspace-switch gates were reached. Do NOT call the
file journey or full goal verified. No positive screenshot checkpoint was reached.

[REPRODUCED] Actual trace GET /api/reference/status returned HTTP200, available corpus/root, but
manifest.available=false,state=idle,manifestGeneration=null in the unique ephemeral state47800.
Configured loader x4UiCorpusAssets.ts explicitly rejects pending/unavailable manifests. Earlier
contextual-insertion browser setup mocks status/manifest metadata while reading actual corpus bytes;
this Lua journey does not. That distinction explains why those fixtures render but this one cannot.
Extracted unmodified response:reference-status.json. Actual final1280x720 browser screencast extracted
and visually inspected:browser-new-menu-refused.jpeg. Shows selected new menu/hierarchy with unresolved
geometry and blank/refused canvas; startup walkaround overlay also covers right-side controls. This is
failure evidence, NOT visual fidelity or native X4 evidence. No game path/config repair was attempted.

After08:06:32.4379555Z:35frozen inputs and19persistent guards unchanged, no additions/deletions;
3200/3201closed, protected3100still30164. HEADunchanged. Evidence:rendered-after-2.json and final verdict.
Graph refresh/last source pin are recorded in receipt.json. Scope unchanged; only two test owners changed.

Status PARTIAL: import guard repair behavior is evidenced; actual Lua journey remains red on missing
ephemeral manifest initialization. Next bounded unit: reconcile existing reference-manifest build/
readiness API and harness lifecycle using src/server/referenceRoutes.ts, referenceManifest.ts and
existing integration scripts. Initialize only the owned scratch index, never standing config or live
workspace; do not replace this real-service requirement with simulated metadata. Document plan first.
All full goal9journeys/3menus/12references, numeric COMM, local scenarios and release/native gates stay.
No Git/push/publish/install/config/game/mod/save/external issue/wiki/memory writes. Suggested future
commit title: test(ui): reconcile Lua import guards and source-preserving roundtrip expectations.

## AAR

NON-CLEAN: diagnostic failure, corrected fixture/state/XML assumptions, two failed rendered runs,
unreached positive screenshot, repeated oversized/guessed-path inspection errors. Degradation called;
checkpoint now and fresh context for the next repair, not a new implementation batch here.
Sustain: diagnose actual refusal, retain strict byte oracles, positive-control every zero-call guard,
run the full component suite, use structured browser verdict and independent state/ownership checks.
Improve work: reconcile fixture metadata assumptions before claiming real-service coverage. Next
experiment is real ephemeral index readiness, not more UI sleeps or relaxed canvas assertions.
Improve tools: discover file names before reading; bound large plan/process outputs. Trace format here
uses frame.file and response.content._file, not legacy sha1 keys; read schema before extracting assets.
Highest-risk observed weakness: simulated ready manifest metadata can conceal an uninitialized real
reference service and produce stronger-looking browser coverage than the actual startup journey.
Lesson banked in this project plan; no global memory/skill update. This turn made PROGRESS, full goal
remains ACTIVE/PARTIAL; import failures are resolved, rendered real-service blocker is now reproduced.
