# B119 numeric alias and sample dependency workstream
> For agent: read this plan and SESSION-HANDOFF.md; Astra owns design/review, native Luna/max implements.
Status: PARTIAL; A/parser/scalar and stale-census follow-ons now have green source checkpoints; B remains open.
Execution: all prior workers closed. Current source gate: Scene192/192, Pipeline124/124, Layout800/800,
SourceEdits164/164, Session/types/lint green. See 2026-09-11 census plan for exact current evidence.
Lane: FULL. Date: 2026-09-11. GitHub owner: existing B119 #41 (no duplicate issue).

## Purpose and scope

Make ordinary real-menu layout expressions usable without asking the author to manually sample each
intermediate local variable. Real Lua and the existing CallModel/LayoutProgram/Scene owners remain
canonical. This is a dependency of goal journeys7/8, not a replacement for visual authoring acceptance.

The full workstream includes:
A. Source-proven transitive numeric alias chains.
B. Source-grounded nested preview-sample dependencies and truthful derived evidence.
C. Real MENU/HUB/COMM visual editing/recovery and all remaining source/corpus/profile/native gates.
Only A is ready for implementation in this checkpoint. B is required follow-on, not silently dropped.
The separate all-operations-applied scalar edit lock is NOT changed in A or bypassed to show progress.

## Reconciliation and design

Current authoritative sources:
- F:/DEV_ENV/X4_Forge/src/lib/x4UiCallModel.ts (valueAtUse and model.aliases).
- F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts (numericExpressionStructureError,
  numericExpressionError, resolveNumber, resolveNumericExpression and source AST provenance index).
- F:/StarForge/wiki/x4-forge/capability-map.md:756-810 and decisions.md ADR-F1 throughF5, read in parent
  preparation. Existing source/order/context/reassignment, exact AST and finite-number authority stays.
- Genuine read-only F:/DEV_ENV/projects/Mods/X4Mods/x4_ai_influence/ui/addons/ai_influence_chat/aic_hub.lua,
  SHA256657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F, display653-680.
- test-results/b119-real-menu-viewport-consumption-parent-20260911T0628Z.log and retained Ohm
  read-only task01a08f28-ca1b-7093-9325-4073eccd4de4, completed/closed.

Observed dependency: vw/vh659-660 -> mx/my664-665 -> x,w671 -> title addTable674. CallModel already
retains the exact numeric descriptor across x=mx; numericExpressionError requires an immediate alias
whose expression/location equal the descriptor root and therefore cannot establish x's transitive root.
The error string is NUMERIC_EXPRESSION_PREVIEW_FALLBACK_ERROR: resolveNumber may try eligible exact-
source sample fallback before returning it. The earlier claim of an unconditional pre-sample rejection
was corrected in the Lua-file plan, BACKLOG and handoff. Do not reintroduce that diagnosis.

Current diagnostic: viewport samples are accepted AND consumed; HUB5applied/11unresolved/3conditional,
title x unavailable, y27 and requestedWidth1866 already known. This is not a sample UI/cache failure.
The genuine model's x binding has value expression mx at671, descriptor math.floor(...) rooted at664;
the descriptor is present, not missing. Parent read the retained successful CallModel diagnostic rather
than re-running the sidecar investigation. Agent-Brain recall was weak: the read July known-bugs note
(part1of8) concerns older workspace/package reviews and contains no numeric-alias/sample discussion;
it does not establish an earlier implementation.

Options considered:
1. Extend exact alias proof in LayoutProgram (selected): reuses retained descriptors and source index;
   confines A to one proof owner plus its tests. Requires careful binding-at-capture and shadowing checks.
2. Rewrite descriptors to each alias use in CallModel: changes identity and sample/source-range contracts
   across consumers; not needed while the original descriptor and alias records are already available.
3. Existing manual preview samples: remain valid for genuinely unknown inputs, but are not the solution
   for source-provable intermediate aliases in ordinary visual authoring.

No capability-map positive delta yet. No ADR reversal, renderer/deployer/history owner, network/spend/
delete/credential surface, configuration, game/mod/save write, dependency install or release is proposed.
Extend-vs-replace: extend the existing closed grammar; the findings concern bounded proof/dependency gaps,
not evidence justifying a replacement interpreter or geometry engine.

## Baseline and recovery

Parent before-write source-only runs with genuine read-only X4_REFERENCE_ROOT:
- CallModel:127/127, allPassed:true, exit0.
- LayoutProgram:790/790, allPassed:true, exit0 (session16364 terminal).
- Logs:test-results/b119-numeric-alias-baseline-{call-model,layout}-20260911T0715Z.log.
  Actual run started2026-09-11 07:17:01 UTC; filename timestamp is a label.
-13 input hashes remained equal before/after baseline. Relevant frozen fingerprints:
  CallModel: 8C44CB538BDCF6AD8C97BA537D8A29D1B0CBECC1BB9B730907D7F8CAFAD7A0F7.
  LayoutProgram: 511CA88FA8959870E8B593D5D0254D306837260F5E414F0476BE1846AB0610A3.
  Layout selftest: 3027C66E278B5ECF84F3E57B547AE4CAEF3902BDFF6D6BDB4CDA976B5596FB8C.
- Current branch/revision recorded in SESSION-HANDOFF: main93c9af111d63ca77c99dee11f21882c4073bcda6.
  Recheck read-only before implementation. Dirty work belongs to the user; no broad cleanup/staging.
- B/C Lua-file test checkpoint9E244B15/B5588B0A is frozen; never edit those files in this workstream.
- Recovery: revert only this slice's reviewed new delta against the dedicated baseline snapshots, using
  apply_patch if needed. Never git reset/checkout/clean, replace the user's files from HEAD, or erase
  pre-existing numeric/compiler work.

## Slice A implementation contract

Own only:
- F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts.
- F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.selftest.ts.
- Bounded test-results/b119-numeric-alias-worker-* evidence logs.

Everything else is read-only. No descendants. Main will prepare independent HUB acceptance and the B
evidence-schema contract while the one worker implements A; no overlapping writers or duplicate coding.
If CallModel cannot provide sufficient source binding authority, report the exact missing evidence
before expanding the write set. No new parser or permissive name-only alias fallback.

### A1. Add red source-bound proof checks

Use the existing real test owners and corpus fixtures. Preserve all790 checks and all existing negative
semantics; never skip, delete or loosen an oracle. If a prior negative explicitly asserts the newly
supported exact case, report it for parent reconciliation before changing its expectation.

Add positive two-hop and longer finite numeric aliases within the same valid lexical/function context.
Use real parsed source and independently calculated expected values, not descriptors copied from the
implementation output as the expected result. Include arithmetic/math-call roots and an alias captured
before a later unrelated/source-variable assignment where the existing source model proves Lua value
semantics. The negative matrix must cover:
- reassigned alias or reachable conditional reassignment before its relevant use;
- same-name aliases in another function/scope or shadowing with different binding authority;
- future/out-of-order bindings and a forged same-expression root at a different source range/file;
- malformed/cyclic/foreign descriptor or alias evidence, including accessors/unsafe data where applicable;
- nonfinite/divide-by-zero/unsupported numeric grammar and existing preview fallback rejection boundaries.
Require deterministic refusal/unavailable facts, not thrown exceptions or fabricated geometry.

Record the failing new checks BEFORE implementing. Existing tests must stay green in this red phase.

### A2. Extend the existing binding proof

Keep descriptor structure/source AST validation BEFORE root/alias acceptance. Follow only exact
source-checked local identifier aliases back to that validated descriptor root. Each hop must retain:
- actual declaration/assignment association, exact source identity/range/expression and descriptor;
- correct context, source ordering and capture/use point, not just the last matching name anywhere;
- existing reassignment/reachability safeguards, with lookup evaluated at the alias's capture point;
- cycle detection and bounded traversal using the finite recorded bindings, not unbounded recursion.

Reuse the existing source AST provenance index/checks. Do not trust caller-mutated alias metadata merely
because it repeats a source location; prove the association against the actual parsed source. Do not
relocate the descriptor root, clone a competing descriptor format, change accepted numeric operators,
invoke Lua, add new sample entries, hardcode27/1866, or weaken unrelated shape/identity/evidence gates.
Keep NUMERIC_EXPRESSION_PREVIEW_FALLBACK_ERROR semantics and existing sample precedence unchanged in A.

### A3. Freeze and independently validate

Worker runs full LayoutProgram selftest plus strict owned-pair lint and whitespace, with current corpus
configured process-locally. Report source/test hashes and exact command results, then freeze for parent.
No browser, SourceEditor selftest, E2E, service, build, package, config, real mod/game/save/install or Git
operation is authorized. Other pure regression suites below may be run only after parent scheduling.

Required parent checks before A close:
1. Read complete baseline-relative source/test diff and every new guard/negative assertion.
2. Full CallModel and LayoutProgram suites; zero failed/skipped new or pre-existing checks.
3. Existing SourceEdits, Scene, PreviewPipeline and EditorSession pure suites relevant to new numeric
   projection; inspect their runtime boundary before running. Full SourceEditor suite remains held.
4. Whole-project tsc; strict owned files lint; tracked and baseline-relative whitespace.
5. Genuine HUB via normal public Session/catalog/sample owners and8 pinned corpus assets, same existing
   source-grounded vw/vh scenario at1920x1080/uiScale1. Require title x27/y27/requestedWidth1866 and
   table kernel/projected-table existence. Preserve exact source/workspace bytes and unknown body data.
   If another independent gap prevents table establishment, record it as PARTIAL; do not extend scope or
   weaken the requirement. No browser/game/source-editability claim from this pure projection check.
6. Corrupt/foreign source evidence and missing corpus cannot gain geometry or editable authority.
   Whole-program scalar edit lock remains in force when unrelated operations remain unresolved.
7. Stable input hashes, exact snapshots/receipt, and every unavailable UI/package/native gate named.

Evidence:test-results/b119-numeric-alias-*; close/AAR in this plan, BACKLOG and SESSION-HANDOFF.
Static proof is not actual UI/native proof. After A, continue to B and real-menu editability, not goal close.

## Required following slice B — design boundary, NOT implementation authorization

Nested numeric evaluation currently consults pinned Helper values and drops derived provenance to
source-literal in arithmetic/math/group nodes; it does not consume existing accepted nested samples.
Only catalog-issued, source/type/loop-bound samples may be propagated; source-proven literals/constants
must not become arbitrarily overrideable. No new manual sample requirement for intermediate variables.

Current readers/writers found:
- Layout Resolution, known scalar DescriptorFact, constructors, validators/evidence-pair replay.
- SourceEdits structural descriptor validation.
- Scene numeric fact validation and factProvenanceLink; Scene already supports a list of provenance links.
- PaintPlan validates individual provenance links; its existing links can carry one sampleId each.
- CanvasRenderer validates PaintPlan/color evidence; numeric dependency proof must not get lost upstream.

Candidate: retain existing sampleId for a single dependency; explicitly validate a canonical dependency
set for multi-sample numeric facts, expand to ordinary per-sample Scene provenance links instead of
inventing a new renderer. This is not yet the approved schema: multiplicity, ordering, bounds, source
membership, getter/proxy refusal, and all readers/validators need an exact parent-reviewed contract first.
Required B positives include a sample variation that cannot pass using profile defaults, two distinct
sample dependencies, correct consumed IDs/source provenance, and unchanged unsampled literal authority.
Required B negatives include malformed/duplicate/foreign dependencies, stale or wrong-loop sample
authority, nonfinite arithmetic, and no sample override of source-proven geometry. Maintain all prior
negative gates. B is required, but A worker must not implement it speculatively.

## Close and AAR (to be filled from evidence)

Current status: SPECIFIED A; full workstream PARTIAL. No implementation yet at plan creation.
Acceptance scope stays the complete canvas-first goal; UI/packaged/native proof remains gated on fresh
machine/explicit protected-write clearance.0.0.78 is immutable. No commit/release/issue update claimed.
Baseline is clean for the declared two source suites. Prior investigation's tool/diagnostic corrections
are retained in the Lua-file plan; this task will record its own red/green findings and AAR immediately.

## A dispatch checkpoint — 2026-09-11 07:23Z

Avicenna01a08f59-3b7e-75e3-afd7-43594f702bb8 dispatched native gpt-5.6-luna/max, fork_context:false,
no descendants, exact owned pair above. Confirmed ACTIVE turn01a08f59-3ce4-7893-85b0-7e194068030c;
cursor6aab532f-59d0-4e9c-9bdb-63379f6cebcd:1. No second worker. Parent owns independent HUB acceptance
and following B schema design, not the worker's alias implementation.

Baseline receipt:test-results/b119-numeric-alias-baseline-20260911T072301Z/receipt.json with2 inert
snapshots and13 before/after-stable input hashes. Layout result also explicitly reports skipped0 and
phase3D/G/J fixtureNotReady0. Main HEAD93c9af111d63ca77c99dee11f21882c4073bcda6,92 dirty entries
including this newly specified plan; unrelated changes preserved. Source-only baseline sessions terminal.

Machine boundary clarification sent to worker: this exact inspected local LayoutProgram fixture suite is
the allowed independent pure unit check; it does not launch browser/UI/service. No claim that the machine
is quiet. Full SourceEditor, E2E, services/build/native/protected runs remain held. If a side effect is
found in the named pure test/import chain, stop and report its source instead of expanding authorization.

## Parent acceptance preparation — 2026-09-11 07:36Z

Independent probe: test-results/b119-numeric-alias-parent-hub-acceptance.probe.txt, AUTHORED/UNRUN.
Readback matches the prepared probe. Node --input-type=module --check via stdin passed exit0
(tool chunk c5856f); this only checks syntax and does not execute imports or the acceptance journey.
Before execution, source inspection corrected one invalid probe assertion: HelperTableProperties has
width/x/scaling/reserveScrollBar, not y. The required exact y27 check stays on the table's descriptor
fact, alongside x27/width1866 and required kernel/table existence. No product criterion was removed.
Keep source/workspace and24 disk inputs unchanged, require exactly the existing2 viewport samples,
corrupt-asset/nonfinite-sample/corpus-removal refusal, and no whole-stream scalar edit-lock bypass.
Do not run against the worker's moving source. Parent review/regressions follow its explicit freeze.

Current active worker confirmed via compact snapshot: same Avicenna, same turn, cursor
6aab532f-59d0-4e9c-9bdb-63379f6cebcd:2; preparing fail-first alias coverage. No replacement worker.
Graphify existing graph is navigation only: resolveNumericExpression is called by resolveNumber;
current source governs the new delta. No graph rebuild or query-result write while source is moving.
Machine/browser clearance remains unanswered. No browser, service, package/native or protected write.

## Additional parent reconciliation — 2026-09-11 07:40Z

Sample-catalog coupling found before A acceptance: targetNeedsNumericExpressionPreviewSamples scans
selected call semantics for the exact fallback root-binding error. That target-wide flag permits the
current numeric sample entries. A may legitimately remove their applicability by proving the source.
The authored probe deliberately stops if the old2 viewport entries change; diagnose from actual output,
do not invent replacement samples or alter catalog policy in A. Required real-HUB geometry stays
x27/y27/width1866 with an established table kernel and unchanged Lua/workspace; source-derived success
without unnecessary samples is consistent with the product goal. Any probe applicability adjustment
must record observed before/after evidence, never silently turn a failing count into a passing result.

B design evidence now also includes minRowHeightFloor: its current scalar dependency choice retains
only one of minRowHeight/y although the floor subtracts both. A numeric multi-dependency contract must
not lose IDs in this existing downstream aggregation or its duplicated fact constructors. No B code
has been authorized. Scene already emits an array of one-ID provenance links; color facts are a separate
domain and must not acquire numeric multi-sample fields. Existing structural/Scene/manifest validators
must all agree on any later schema. Sample-varying acceptance must use values distinct from the profile:
genuine HUB vw1600/vh900 implies x22/y22/width1556, independently of the1920x1080 profile defaults.

Early (not frozen) parent test review sent to Avicenna: require zero accessor invocations, explicit
hostile-mutation application guards, bounded diagnostics, and removal of one unused descriptor lookup.
Current test delta is353 additions with prior tests unchanged; final full diff/hashes are still required.

## Parent red review and AAR checkpoint — 2026-09-11 07:46:15Z

PROGRESS: red execution, source baseline, and new failure mechanisms independently checked. Status
remains PARTIAL/in progress, not A acceptance. Same Avicenna ACTIVE at cursor
6aab532f-59d0-4e9c-9bdb-63379f6cebcd:17, acknowledged parent corrections. No restart/second writer.

Terminal red log:test-results/b119-numeric-alias-worker-red-20260911T074313Z.log,
SHA256230E2BD1F2249FDDBC3C33C4D1FD49BFB9D7A68D9E255C0D7D71262CEDABDCF9.
Worker command itemexec-2d13c08f-0d61-4ada-a6c8-00512698b0ef completed exit1. Parent parsed full JSON
and footer:791/794, skipped0; all790 prior checks pass,4 new checks,3 new failures. Phase3D/G/J
fixtureNotReady all0. Production still baseline511CA88F at07:46:15; tests are moving, not frozen.
Independent compact review artifact:test-results/b119-numeric-alias-parent-red-review-20260911T074615Z.json.

[REPRODUCED] Both positive chains fail the exact old root-binding boundary. Hostile alias accessor is
invoked4times even though geometry is unavailable; exception containment does not establish zero
invocation. Worker must locate and guard reads before dereference within the owned implementation,
or report the exact coupling if expansion is necessary. Do not waive the counter.

Test-fixture correction: constant100 %3 is folded to a valid static1 by the existing CallModel and is
therefore not an unsupported dynamic numeric-descriptor test. Parent authorized replacing only that
new fixture with Helper.viewWidth %3 plus an explicit dynamic/no-descriptor assertion. Preserve the
original red log and existing constant-folding capability; no numeric grammar expansion/removal.

AAR triggers: red command, review-driven test correction, corrected probe/kernel-y assumption,
oversized inspection outputs, and one rejected documentation patch anchor. The rejected patch made
no changes (readback confirmed); corrected exact-file patches used after reading the current header.
Sustain: exact ownership, preserved790-test baseline, red-before-production change, independent getter
counters and source-model distinctions. Improve work: negative fixtures must exercise the claimed
parser boundary; inspect owner types before asserting fields. Improve tools: parse detail JSON and
project only needed fields; use rg --files --no-ignore for ignored test-results evidence. Default rg
omission is not absent evidence. Highest-risk evidenced weakness: unsafe getter reads before refusal;
bounded A countermeasure is reject-before-read with zero-invocation regression, not yet fixed/verified.
Project lesson banked in this plan; no external wiki, memory, issue, Git or protected-state write.

Parent called degradation/checkpoint due repeated oversized read outputs. Take fresh parent review
context before accepting implementation; same confirmed-live worker continues. No parent process or
wait handle remains. Full SourceEditor/browser/E2E/package/native gates remain held, not waived.

## Fresh parent review and following edit-boundary reconciliation — 2026-09-11 07:53Z

Same Avicenna active, latest observed cursor:21. Early model-data guard is under review, not accepted.
The reused hasOnlyJsonDataProperties scans Object.keys; parent identified a non-enumerable accessor
gap and requested explicit hidden alias.value/model.aliases getter hostiles with zero invocation.
Any helper tightening must retain legitimate array length handling and all790 baseline checks. Do not
claim Proxy-trap immunity: reflective inspection itself may execute Proxy traps. No outside-owner patch.

Separate next product-critical reconciliation (NOT implementation authorization): SourceEdits already
checks each candidate operation at editableEntry1594 and exact direct source-literal/CAS provenance.
Its additional scalarProgramIsActionable1688 requires every operation applied; discovery7057 and
scalar application8156 both enforce it. The SAME predicate also protects row movement8791 and widget
insertion8892. Therefore loosening that shared predicate would silently broaden structural authority,
not merely permit independent scalar edits. Any future contract must separate those policies and keep
structural requirements intact unless independently redesigned and proven. Current A does not touch it.

Existing negatives explicitly lock partial/dynamic and conditional/rejected/unresolved/mixed streams
(SourceEdits.selftest4153,4365), plus no-corpus automatic-height cases1592/3279. These are intentional
old contracts, not tests to delete. A later scoped scalar change needs an explicit replacement proof:
issued complete source/model/evidence, a direct applied literal anchor, unchanged unrelated source and
operation structure, fresh complete reparse/authority, and missing-corpus/stale/foreign/unsafe cases.
Graphify confirms discovery is also called from both scalar and structural reparse owners; source reads
above establish the concrete coupling. No positive capability-map delta or edit-lock weakening this turn.

## First implementation review — 2026-09-11 08:02Z

Status: FAILED first implementation acceptance; workstream still PARTIAL and same worker ACTIVE.
Parent independently read the complete first production delta and parsed the terminal log named
test-results/b119-numeric-alias-worker-green-20260911T075520Z.log. Despite its filename, result is
791/794, skipped0, exit1. SHA1493802A65159B55B74EF8CCD9DD201CC8868D666490F6951FC0B9BF08256D02.
Compact artifact:test-results/b119-numeric-alias-parent-first-implementation-review.json.

Both new chain positives pass, and the reassignment/conditional/shadow/future aggregate passes.
Enumerable alias.value, hidden alias.value, and hidden model.aliases getters are all actually installed,
invoked0times, and refused by the new early JSON-data boundary. This is bounded fixture evidence,
not arbitrary Proxy-trap immunity or acceptance of the whole patch. Hostile aggregate still red because
the new dynamic modulo test asserts the wrong parser status/type (noDescriptorAuthority:false while
x is correctly unavailable). Worker must inspect and correct that new fixture assertion.

Two of790 PRE-EXISTING checks now fail: exact-root fallback under binding loss/deduplicated uses, and
malformed-descriptor refusal with attempted samples. Parent traced the old fixture: it shifts frame-x
property.context.source offsets. The new proof discarded the previous propertyContext check and now
resolves geometry from that altered-context model, removing expected fallback entries. These are not
newly supported transitive-chain expectations. Worker must restore the old boundary; tests unchanged.

Additional blocking first-diff findings sent before acceptance:
- Root proof collapsed non-identifier mismatch and reassignment into the fallback error. Preserve the
  existing nonfallback rejection categories and prove attempted samples cannot bypass them.
- Function containment alone is not lexical declaration binding. Add do-block/out-of-scope and
  simultaneous local-initializer cases; same name/function/source order is insufficient authority.
- AST write scan ignores reachability and would reject proven-unreachable writes. Preserve the old
  behavior, with an explicit literal-false-write positive and source-grounded reachability proof.

The worker acknowledged the findings and continues within the same pair; no source freeze yet. Current
snapshot cursor6aab532f-59d0-4e9c-9bdb-63379f6cebcd:26. Do not run parent acceptance on moving source.
No old test change, sample-catalog edit, structural edit-lock weakening, owner expansion or release.
AAR delta: tests showing aggregate791/794 concealed that2 prior passes had become failures; always
separate pre-existing/new rows and inspect actual failing names. Fresh review prevented false acceptance.

## Second draft review and upstream evidence gap — 2026-09-11 08:17Z

PROGRESS: parent reviewed the complete current production/test delta, independently parsed the second
red log, and reproduced a missing upstream descriptor that changes the next implementation boundary.
No A acceptance, browser/product/native close, or owner expansion. Same Avicenna remains ACTIVE.

Second red log:test-results/b119-numeric-alias-worker-red-20260911T081215Z.log,
SHA0ACD1C52CD8AB0C4041FA659B14AC18048A1337C632C3B4D88F231EC107DF989; footer EXIT_CODE=1.
Parent compact result:test-results/b119-numeric-alias-parent-second-red-review.json.
778/796, skipped0;776/790 old pass,2/6 new pass; phase3D/G/J fixtureNotReady0. This is an in-flight
failed draft, not a green checkpoint. Parent found the root branch returning a raw alias instead of
the new bound-proof envelope. Worker received the exact correction; no old expectations may change.
The installed luaparse source269-278 proves distinct ElseifClause/ElseClause node types; scope and
unreachable-write validation must account for them, not treat all clauses as IfClause.

[REPRODUCED] The new if-false write positive has an independent upstream limitation. A pure CallModel
probe on the unchanged8C44CB53 source shows frame-x keeps its numeric descriptor without the branch,
but loses it for BOTH `if false then x = getWidth() end` and `if false then x = 50 end`. The resulting
value is unknown/type identifier with no numericExpression. Therefore a Layout-only patch cannot
prove this new positive without reconstructing missing evidence outside the declared A contract.
Evidence: test-results/b119-numeric-alias-parent-unreachable-callmodel.probe.txt and matching
parent-unreachable-callmodel-review.json; bundled Node/tsx exit0, tool6a88d0,2 input hashes unchanged.

Source mechanism: ifBranchContexts1336-1400 derives reachability, but processControlFlowBodies5126-5132
collects reassignments from every body; invalidateControlFlowBindings4975-5003 then replaces the binding
with an unknown identifier. The whole CallModel/control-flow owner and its positive/negative contracts
must be reconciled before any repair there. No CallModel write is currently authorized. Do not simply
skip unreachable parsing: source/call/branch evidence still needs to be retained, and shared object,
math/Helper authority, nested control-flow and escaping-call effects need separate safety review.

Parent direction: restore all790 old checks, correct bounded proof/fixture issues, then freeze/report
the exact remaining new failure as PARTIAL. Retain the unreachable positive visibly failing; do not
weaken it, manufacture a descriptor in Layout, or call the limitation solved. A separately specified
upstream prerequisite may follow that review. The full goal and this obligation remain required.
Also verified the unsupported modulo fixture's actual parser result: root/x aliases absent; frame x
unknown/type expression/expression x/no descriptor. Only the new fixture assertion is corrected.

AAR delta: the parent originally required the unreachable positive without checking that the upstream
parser retained its descriptor. Sustain the independent control/mutation comparison and explicit source
boundary. Improve planning: prove prerequisite evidence at each layer before assigning a positive to
the downstream owner. Highest-risk evidenced weakness is unsound scope expansion to compensate for
missing upstream evidence; keep the parser fix separately planned and all current failure logs visible.
Project lesson banked here; no external wiki, memory, issue, Git or protected-state writes.

### Follow-up observed result — 2026-09-11 08:22Z

Parent parsed completed red081922Z:796/798, skipped0, all790 old checks green,6/8 new green; phase3D/G/J
fixtureNotReady0. Log SHA7F19A04D0087DD68A771D76E05088CB59DBC1229B7EDD693E148A6DA771FFE8D,
footerEXIT_CODE=1. Exact compact result:test-results/b119-numeric-alias-parent-third-red-review.json.
The two new failures are the separately reproduced upstream if-false descriptor loss and the new sampled-
reassignment fixture. The latter's diagnostic shows the actual call property has no injected descriptor;
its mutation reached other records only. Worker is correcting the new fixture, not weakening production.
Same worker confirmed ACTIVE/inProgress at cursor:51, sourceCDDBD916/testFE5AF656 still in flight.
No parent runtime acceptance on moving source. After explicit freeze review final diff and run pure
regressions/genuine HUB proof; retain the upstream failing positive and PARTIAL status until repaired.

## Frozen A and first genuine HUB observation — 2026-09-11 08:33Z

Avicenna completed PARTIAL and was closed. Frozen sourceCDDBD916BE685BA5B3CE4F9C4254D84B8F07F841B61F288928010F8485E4AD00,
selftest1BC6020BE66B0B1B2D8B9107372D0FA361779A94DB5203C5EDC67E9DD5043D9D. Parent read complete
baseline-relative source/test deltas:386 additions/27 removals in source,722 additions/zero removals in
tests. Two inert before/copy/after-equal snapshots:test-results/b119-numeric-alias-parent-frozen-20260911T0833Z/.
Worker final pure result797/798, skipped0/exit1; only upstream if-false descriptor-loss positive fails.
Owned strict lint and baseline/owned whitespace exit0. These are not parent broad-regression acceptance.

Parent genuine HUB probe executed08:33:10-12Z, terminal exit1. Exact log:
test-results/b119-numeric-alias-parent-hub-acceptance-20260911T0833Z.log,
SHAE4AB045CAE7004B0E5B9C8A5AA9567616F5B248D4A7B1AE7888FACB7B250B2F7;24 disk inputs unchanged.
Corrupt Helper bytes rejected hash-mismatch. Actual viewport entries changed2->0 as predicted: source
proof now resolves them. Without supplying any sample, applied operations5->11, unresolved11->5,
conditional3 unchanged, mapped geometric nodes1->9. Title x27/y27/requestedWidth1866 known; kernel
exists,2 columns, kernel requestedWidth1866 and x27. Kernel finalized width1865 is separate from requested
width1866, not an arithmetic mismatch. Editable0 and whole-stream lock remain unchanged.

Probe stopped on old viewport count2; acceptance applicability now reconciled from actual output:
- Preserve original probe/log; prepare a separate source-derived variant allowing exactly0 or2 viewport
  entries. Zero means use unchanged initial projection without inventing/applying replacement samples.
- Correct an independent parent probe-field mistake: table descriptor key is requestedWidth, not width
  (source11519 and actual serialized facts). Numeric expected1866 remains unchanged.
- Nonfinite rejection uses a current catalog-issued numeric entry (nextTab at674) for the invalid Infinity
  attempt only; do not supply a valid guessed tab counter or any other new positive scenario input.
- Run unchanged corpus-removal/workspace/hash guards before the full-table status assertion so all
  independently applicable evidence is recorded. Keep status===projected as a required final assertion.

Another independent gap is observed: title status is partial because tabOrder nextTab() at674 is unknown.
The addTable operation explicitly says its kernel is deterministic but a descriptor fact is unavailable.
Do NOT relabel this table projected or waive the final status criterion to turn the probe green. Expected
outcome remains PARTIAL unless that independent source-grounded gap is separately addressed.
No actual canvas/browser/native proof follows from geometric-node counts. Full goals unchanged.

AAR delta: first compact HUB-log parser had a JavaScript syntax error (tool ebd86e); rewritten as a
small imperative projection, same existing log parsed successfully at7680da. No product/probe rerun was
needed for that correction. Main acceptance mistakes: wrong descriptor key and stale scenario count;
both now source-grounded and explicitly reconciled rather than silently weakened. Existing full-table
status and the new parser failure remain red. No positive capability-map, release or external write.

## Parent acceptance results and A4 corrective unit — 2026-09-11 08:46Z

Status: FAILED required gates / overall PARTIAL. Avicenna is CLOSED. Parent regression session23158
and static session82003 are terminal; no browser/service/native or protected write occurred.
- CallModel127/127 exit0; SourceEdits156/156 exit0; EditorSession PASS exit0.
- Layout797/798, skipped0 exit1: the retained upstream if-false descriptor-loss positive remains red.
- Scene191/192 exit1: genuine HUB census expects samples11/consumed9; now6/4. Other reported Layout
  counts identical (19 operations,13 applied,1 frame,2 tables,2 rows,4 cells,30 gaps). Reconcile exact
  removed sample authority before proposing an expectation delta; the test is unchanged and red.
- PreviewPipeline121/122 exit1: exact deployed fixture has113 glyphs/54 gaps at both profiles versus
  expected99/57. Heights, row/table totals and text-evidence booleans match. Do not infer the extra
  glyphs are correct without inspecting their source/scene origin. Existing expectation remains intact.
- Whole-project tsc exit2: six errors in ONLY the newly added test diagnostics (639 reason on known fact;
  6767 refusal/frame.reason union fields;7191/7192/7208 required threw missing for ordinary projections).
- Strict owned-pair lint and tracked whitespace exit0.13 input hashes stable across all parent checks.
Logs:test-results/b119-numeric-alias-parent-{x4UiCallModel,x4UiLayoutProgram,x4UiSourceEdits,x4UiScene,
x4UiPreviewPipeline,x4UiEditorSession}-20260911T0838Z.log and {types,lint,whitespace}-20260911T0844Z.log.

Revised genuine HUB probe08:36:43-45Z (filename0837 label) validates x27/y27/requestedWidth1866,2-column
kernel/x27; rejects hash mismatch and Infinity/nonfinite-number; removing corpus removes all geometry;
workspace unchanged and24 stable disk inputs. It then FAILS unchanged full-table projected assertion:
tabOrder nextTab() remains unavailable. No guessed replacement samples. Log SHA
46B236C22E0AA149A8E95AA1BD5BB3CBAD8F135E0B4C0760AAE30CBCB7845B72.

[REPRODUCED] Independent assignment-control probe4 cases,1 pass/3 failures, exit1 at tool95c4f0.
`local x = math.floor(...)` yields expected1; `local x; x = ...`, `local x = 0; x = ...`, and an assigned
mx captured by local x all retain the correct parser numeric descriptor but fail root source binding.
Evidence:test-results/b119-numeric-alias-parent-assignment.probe.txt and matching0842Z.log;2 stable inputs.
The current root proof compares assignment target AST node identity directly with the local declaration
node, so assigned bindings cannot match. Its write scan also compares declaration range to the binding's
assignment source range; a correction must distinguish declaration owner from the write/capture point.
This is a current supported-contract gap; no earlier runtime baseline for these extra cases was claimed.

### A4 SPECIFIED before implementation: assigned-local proof and test typing

Purpose: complete the already intended exact declaration/assignment association; no new Lua grammar.
Fresh native Luna/max owns ONLY LayoutProgram.ts, LayoutProgram.selftest.ts and worker A4 logs.
Baseline: frozen CDDBD916/1BC6020 pair; inert snapshots in parent-frozen-20260911T0833Z. Preserve all
pre-existing changes, all790 original checks and all8 current new checks, including the failing upstream
positive. Parent owns other files, broader test reconciliation and documentation. No descendants.

1. Fix only the six diagnostic TypeScript errors by inspecting real discriminated unions and providing
   explicit ordinary-projection shape/narrowing. No any casts, suppressed errors or weakened assertions.
2. Add fail-first real-source cases for the three assignment forms above plus existing direct-local
   control. Add reachable later writes, shadowed locals, wrong-scope assignment and capture-before-later-
   write cases; both legitimate capture and unsafe replacement must be differentiated.
3. Reuse the current AST source association/lexical resolution. Prove which declaration each assignment
   writes, and independently retain the assignment source/capture point for ordering. Match root uses to
   that declaration owner. Scan intervening writes to that same owner, not by raw assignment-range
   equality. Never accept a later/unknown/conditional write, name-only fallback or forged source record.
4. Preserve fallback/nonfallback categories, property-context checks, hidden/enumerable accessor
   rejection, bounded/cycle-safe traversal, and source/model/corpus guards. No sample/catalog change.
5. Allowed worker validations: full Layout pure selftest with process-local X4_REFERENCE_ROOT, the
   unchanged parent assignment probe, whole-project tsc, strict owned-pair lint and whitespace. Parent
   has scheduled these after the terminal broad/static runs. Require all790 old and all new checks except
   the already reproduced upstream if-false positive to pass; that positive stays visible, status PARTIAL.
6. Freeze exact source/test hashes and return compact counts/failed names/logs. No additional task after
   freeze. Parent independently reviews/reruns relevant acceptance; further negative evidence may return
   the unit to correction. Rollback only A4 delta against its frozen baseline, never reset the worktree.

Explicitly out of scope: CallModel fix; nextTab counter evaluation; sampleIds/schema B; Scene or
PreviewPipeline expectation updates; partial-menu scalar/structural edit locks; UI/browser/fullSourceEditor/
E2E/service/build/package/native/game/mod/save/config/Git/release/external writes. Those obligations
remain open, not deleted to accept A4.0.0.78 stays immutable; machine clearance is still unanswered.

AAR: parent called degradation checkpoint after a malformed compact-log script and oversized detail
output. Sustain independent real-source controls and immutable evidence. Improve tools by selecting
primitive summary fields before serializing nested failure detail. Test typing and assignment coverage
must be checked before a worker calls its bounded patch ready for review. Fresh parent context for the
next implementation review; no broad corrective redesign while degraded. Project lesson recorded here.

## A4 dispatch and frozen receipt verification — 2026-09-11 08:55Z

Gauss01a08fa7-4c33-7551-bdf1-be331cc4c296 dispatched at08:48Z, native gpt-5.6-luna/max,
fork_context:false, no descendants. Active/inProgress confirmed at cursor
de389ebb-92d5-44d0-922c-4163413ffb2d:2. Exact A4 ownership/contract above; no scope expansion.
Parent receipt:test-results/b119-numeric-alias-parent-frozen-20260911T0833Z/receipt.json exists and
JSON readback exactly matches captured pre-A4 evidence. Both source/test snapshots and full reviewed
diff artifacts exist; compact HUB original/source-derived review artifacts preserved. These are frozen
FAILED/PARTIAL results, not acceptance of Gauss changes. No parent runtime tests against moving code.
Current continuation reconciles downstream sample/glyph evidence offline while A4 runs. Last user-status
turn was a VERIFIED WAIT on this exact active worker plus status, not a new product acceptance close.
Full goal, all nine journeys and three-menu/native obligations remain unchanged. No capability-map delta.

## Offline reconciliation and parser-only prerequisite probe — 2026-09-11, before09:02:57Z

Graph vocabulary used: preview,pipeline,scene,glyph,text,layout; existing graph confirms the owned
pipeline/Scene path, not current acceptance. No graph mutation/rebuild while A4 source moves.
Historical passing Input-default Scene log (SHA9B64A6A1A7211E473301BF2B5410909813D86FA33193CEFAED9854D064BEF0A5)
records HUB's exact11 sample expressions:vw,vh,x,my,w,nextTab(),#TABS,nextTab(),y,i,name. The current
failed census does not print its6 selected entries before throwing; do not infer exact removed IDs yet.
[HYPOTHESIS] Pipeline's14 extra glyphs correspond to its14-character defaultText "Type a note..." from
the prior Input-default repair, not necessarily numeric A. Three changed gaps still need exact origin.
The prior Input-default plan records that producer facts/visible defaults were extended, but no current
Pipeline scene text/glyph receipt is available. Do not relabel a pre-existing change an A regression.

Next safe independent evidence unit: parser-only synthetic source probe on unchanged CallModel, no
Layout import or corpus/browser/service. Compare exact same post-branch numeric/property observations
with no branch, literal-false assignment, shared-property mutation, math escape and Helper replacement,
plus a conditional control. Preserve source/call/branch observations and hash CallModel/test before/after.
Write only test-results/b119-numeric-alias-parent-dead-branch-effects.probe.txt and its log/review.
This is prerequisite reconnaissance, not parser implementation/acceptance; all real-menu/native gates stay.

AAR delta: log reader initially treated diagnostic-prefixed output as one JSON object; offline reader
now selects known record formats. A later raw-tail dump included full/UTF16 diagnostics and exceeded
the display budget. Parent is in degradation territory: finish bounded evidence/checkpoint, then use
fresh review context before accepting A4 or designing the parser fix. No product test was changed or rerun
to fix log inspection. Keep diagnostics reduced to named primitive fields before serialization.

### Parser-only observed result — 2026-09-11 09:02:57Z

PROGRESS: exact CallModel-only probe executed exit0, both input hashes stable8C44CB53/8349308D.
Log:test-results/b119-numeric-alias-parent-dead-branch-effects-20260911T0909Z.log (filename is a label;
actual timestamp09:02:57.662Z). Compact review:...parent-dead-branch-effects-review.json.
[REPRODUCED] Three unreachable-body effects remain: scalar reassignment drops the numeric descriptor;
props.width=33 inside if false makes the later known80 width unknown; mutate(math) inside if false makes
the later math.floor descriptor dynamic. The tested dead Helper replacement preserves later facts;
do not claim all authority domains fail. The runtime-condition control remains conservatively unknown.
Dead createFrameHandle calls remain recorded at line5/unreachable, with the genuine line7/reachable call.
These are parser observations, not runtime Lua execution, Layout acceptance or native-game proof.

Implication for a later separately specified parser fix: filtering only scalar reassignments is
insufficient; isolate unreachable shared-object/authority effects AND preserve dead-body metadata.
Existing snapshotTrackedObjectState/restoreTrackedObjectState and processFunction4691-4810 were read:
cyclic object descendants and numericMathAuthorityAvailable are already restored around dormant
function analysis. Reuse those owners after reconciling mutation-state nesting and remaining authority
state; no parser implementation authorization in A4. Do not delete dead calls or suppress their evidence.

Gauss latest cursor:7 reports full Layout799/800, both new assignment aggregates pass; only upstream
if-false positive red. Correcting parent assignment-probe invocation, unchanged probe hash. This is
worker progress only, not parent acceptance. Parent takes fresh review context next.
A documentation patch was rejected on an extraneous stale context line; readback proved none of its
three changes applied. Corrected per-file patches preserve all evidence and record actual09:02:57Z time.

## A4 frozen parent review — 2026-09-11

Gauss completed and is CLOSED. Final source0770487808964873FC5304F2FC943C8103BDB4246A4E57835CBEDE973AA60270;
selftest76A79660BF89A5868C7D4105896EEA70DF6149CC32EFE9D283B52DFF294BAE6F. Parent live hashes equal
worker freeze. No worker remains. Parent read COMPLETE A4 delta against pre-A4 snapshots: source+30/-12,
selftest+139/-4. Four old diagnostic lines changed only for proper type narrowing; two new test aggregates.
Fail-first log798/800 has new assignment positive red; final799/800 has only known upstream false-write red.
Source proof now retains exact declarationOwner separately from bindingTarget/source capture point;
root matching and write scan use the owner. Existing context, source validation, hop bounds, closed
grammar and sample-policy remain. No blocking code finding in this bounded diff; runtime acceptance pending.
Parent has captured24 source/test hashes and scheduled all six pure regression suites serially with
process-local corpus. Logs:test-results/b119-numeric-alias-parent-a4-{x4UiCallModel,x4UiLayoutProgram,
x4UiSourceEdits,x4UiScene,x4UiPreviewPipeline,x4UiEditorSession}.log. Expect known required reds to stay
visible; zero-skip/original-check preservation remains mandatory. No browser/fullSourceEditor/native run.

### Following independent Pipeline diagnostic, prepared before execution

Reconcile the retained113/54 versus99/57 failure without changing tests. Reuse existing public workspace
import/Session/corpus owners and8 genuinely hash-pinned assets through the read-only local transport
fixture; no live API/browser/imported-Lua execution. Extract ONLY exactPipelineFixtureText from the
selftest AST without importing/executing the selftest, require SHA C1D9CD8580C6175E95C543259A2AB19F8B463282BF48B2229EB6013D6052718E.
At both existing profiles, record all text/glyph associations and compact Scene gaps; specifically prove
the14codepoint default "Type a note..." emits14 matching glyphs and remaining texts account for99.
Preserve required table heights, source/workspace identity and all module/corpus hashes; corrupt asset
refusal remains a negative. Run after the serial regression handle terminates. This is diagnostic
evidence, not a replacement passing test or visual/native proof. Three-gap origin remains open until
before/after authority can be reconciled. No automatic expectation update is authorized.

### Pipeline diagnostic result and context comparison

Parser-derived exact Lua hash matched; source-bound public Session probe exits0 at09:17:34Z with25
inputs stable. Both profiles prove Input default "Type a note..." ->14 glyphs with exact codepoints,
other texts99, requested table heights160/202. Actual Session Scene is113glyphs/57gaps, whereas the
direct Pipeline selftest is113/54. Thus this probe proves glyph identity, NOT an exact whole-context
match to the selftest; no expected gap count is changed. Original diagnostic and log remain immutable.
Prepare a separate variant comparing public Session and direct projectX4UiPreviewPipeline using the
same exact source/target/corpus/dimensions and the selftest's explicit supplied profile. Record actual
profile/expansion settings and exact gap multiset deltas. Do not mutate source or hide the discrepancy.

## A4 parent checkpoint — PARTIAL, 2026-09-11

PROGRESS: parent full diff review and independent reruns complete.24 source/test inputs stable.
Two before/copy/after-equal snapshots, complete reviewed diffs and receipt:
test-results/b119-numeric-alias-parent-a4-reviewed-20260911T092105Z/receipt.json.
Frozen07704878/76A79660 pair. Gauss CLOSED; regression73136 and static54610 TERMINAL. No active worker.
Independent CallModel127/127, SourceEdits156/156, EditorSession PASS, tsc/strict lint/whitespace0.
Layout799/800/skipped0: only known if-false descriptor loss; phase3D/G/J fixtureNotReady0, all checks pass.
UNCHANGED parent assignment probe4/4; source CallModel8C44CB53 unchanged. The bounded assignment
correction is evidenced; full numeric A remains PARTIAL, not accepted over the required remaining reds.
Scene191/192: HUB samples11->6/consumed9->4; Pipeline121/122: expected99/57 versus actual113/54.
No expected assertion weakened. Current real-HUB replay still11applied/9geometric/0editable and title
x27/y27/requestedWidth1866; negative guards pass, then required projected status FAILS at nextTab.

Exact same-source context comparison at09:20:22-23Z independently records Session113glyphs/57gaps
versus direct Pipeline113/54 at both profiles. Session uses unverified-default plus localExpansion4/64;
direct uses supplied profile without local expansion. Only Session has3 extra gaps: Helper availability
line19/data-flow, unreachable invocation line79/local-expansion, conditional invocation line80/preview-path.
There are0 direct-only gaps. Both show exact14 Input-default glyphs and99 other glyphs. This explains
CURRENT context discrepancy; it does NOT by itself prove the historical test57->54 change has those same
causes. Keep old expectation red until historical producer facts/semantic assertions are reconciled.

REVIEW: exact assignment/source ownership repaired; old tests/guards preserved; no Scene/Pipeline/parser/
sample-policy/history/UI/deployment edits. Required game/host journeys remain unverified. No capability-map
delta, Git/release/precommit or external write. Suggested later commit title: fix(ui): preserve numeric local assignment provenance.

AAR: sustain frozen ownership, fail-first controls and independent unchanged probe. Improve test coverage
couplings: scalar proof changes must run all relevant downstream owners; Input defaults also affect Pipeline
goldens. Improve tools: a metadata hash command failed from mixed PowerShell/JS quoting; exact native
Get-FileHash succeeded for17 artifacts. No product rerun was needed for metadata recovery. Highest-risk
evidenced weakness: equal numeric gap totals can hide different authority/context warnings; use exact
source-bound glyph and gap identity assertions before changing counts. Project lesson banked here only.
Next important unit: separately plan/baseline parser unreachable-body effect isolation, reusing tracked-
object/math restoration and preserving dead-call evidence. Do not only filter scalar names or implement
that broader owner change without its contract. B dependencies and partial-menu edits remain required.

## Slice B prerequisite reconciliation — SPECIFIED, 2026-09-11 after census close

- Previous goal turn PROGRESS: two-test census repair independently verified; all old workers closed.
  Baseline: test-results/b119-census-reconciliation-parent-stage2-20260911T143357603Z/receipt.json.
  Reuse that exact24input census and current green source/static results; do not rerun completed causes.
- Current source review separates two issues. minRowHeightFloor subtracts two resolved values but chooses
  one floorDependency/sampleId. Numeric evaluate receives no preview sample map and its closed expression
  grammar may not encode unknown arithmetic leaves. A schema-only fix cannot be presumed sufficient.
- Historical proposed vw1600/vh900 sample acceptance is obsolete for source-proven viewport values:
  those entries no longer exist. B must not make known Helper/profile dimensions arbitrarily overrideable.
  Use genuine runtime-dependent synthetic inputs and retain source-derived viewport controls.
- Bounded evidence unit: one native Luna/max authors ONLY new inert
  test-results/b119-numeric-dependencies-reconcile-* .txt probes and .log/.json evidence.
  All production/selftest/docs/graph files, corpus/mod/config and previous evidence are READ ONLY.
  No descendants. Parent concurrently reconciles exact downstream readers and schema, not duplicate coding.
- Probe actual CallModel/public Layout or Session owners for unknown leaf plus arithmetic/math/group/or,
  two unknown leaves, and source-known controls. Record descriptor presence/shape, sample expressions and
  source spans; no imported Lua execution, forged descriptors or invented profile samples.
- Probe createText with independently sampled minRowHeight and y through catalog-issued exact bindings.
  Two supplied scenarios must change the expected numeric floor (e.g.40-5=35,50-9=41 at uiScale1).
  Record consumed IDs, minRowHeightFloor/text-height facts and Scene/Paint provenance membership. Preserve
  original objects; do not mutate evidence, change assertions or implement the repair in this stage.
- Require nonfinite/wrong source or loop identity rejection using existing public sample guards, plus
  unchanged source-known literal/profile controls. Source/corpus hashes before/after; emit compact summaries.
  Fixture setup/canonical loading must reuse existing working probe conventions; report exact setup failure.
- Pure serialized probe execution is allowed. Browser/full SourceEditor/Chromium/E2E/services/build/package/
  native/protected-state/Git/external issue/wiki/config/memory/skill writes remain forbidden. Fresh machine
  clearance still unanswered. Snapshots must be inert .snapshot, never second compilable source trees.
- Acceptance for this evidence unit: executable reproduction or authoritative disproval of each proposed
  gap, exact commands/exits/inputs and frozen probes. This does not complete B or the scenario UX.
  Parent must write the reconciled cross-owner B implementation contract before any production release.
- Alternatives: preserve one arbitrary dependency (insufficient for changed-input recovery); require
  manually precomputed compound samples (does not meet ordinary-authoring intent); extend source-bound
  producer/dependency evidence across existing owners (selected direction, exact scope pending probe).
- Rollback: production unchanged; retain diagnostic attempts. No capability-map delta from inspection.
  Required AAR will record any corrected old-plan assumption, failed probe and exact next action.

### Parent cross-owner review while prerequisite probe runs

- Current CallModel585-657 closed numeric expression union has no unknown-input leaf.1499-1500 only
  returns an existing descriptor or exact static literal. Runtime-dependent arithmetic therefore needs
  actual producer proof before planning a Layout-only nested-sample evaluator change.
- Layout2877-2997 evaluates only those closed nodes; math/group/unary/binary/or results use source-literal
  provenance. resolveNumber2999 does have exact top-level accepted-sample lookup before evaluation,
  but the recursive evaluator receives no sample map. Catalog4134-4232 collects whole semantic values,
  not independent unknown leaves. Source-proven helper/profile constants must remain non-overridable.
- Layout12741-12758 chooses one minRowHeight/y dependency;12782 and12856 repeat it in floor/final-height
  facts. Resolution2043 and factFromResolution3252 carry only sampleId. These are the scalar producer
  propagation points; changing only the fact type would not repair emitted evidence.
- A later complete schema change must reconcile Layout7424's closed schema, Scene759's one-link helper
  and1120's array aggregator, Scene3347 fact validation, and SourceEdits3960's independent closed
  structural fact validator. Color facts use separate closed domains and must not gain numeric fields.
  PaintPlan739 and1033-1118 already accept arrays of ordinary individual sampleId provenance links;
  multiplicity need not create a parallel paint representation.
- Candidate representation, NOT released: preserve the existing single sampleId form for one dependency;
  use a canonical unique dependency set for genuinely multiple dependencies on a numeric-derived fact,
  expand into one existing Scene link per dependency. Exact set ordering, source/type/consumed/loop
  membership and fail-before-getter checks must be specified and tested at every applicable owner.
- Important limit: a numeric result can depend on nonnumeric samples too. Final text-height candidate
 12800-12845 uses content/font/fontSize/wordwrap and available width, not merely the minRowHeight floor.
  Final cell width13758-13765 also combines span width and outerX while emitting a pinned-default fact.
  Do not call a two-ID floor repair a complete transitive geometry dependency graph, or use incomplete
  dependency metadata as sole authority for preserving scenarios after arbitrary source edits.
- Scenario carry still requires exact old/new source-splice and fresh model/catalog reissue through the
  existing owners. The two-render history timing constraint remains in the scalar plan. No new schema,
  compiler grammar, scenario writer or production code is authorized by this read-only review.
- Current worker: Lagrange01a090f9-3153-7463-9320-197a3bdab074, native Luna/max, probe-only ownership.
  Parent does not run concurrent Node probes. The latest completed census receipt is the24input baseline.

### Current prerequisite checkpoint / AAR

- Status: IN_PROGRESS, evidence-only. Compact c828cd4b-6fac-4b3a-84d2-233e821774ef:9 confirms the same
  Lagrange active/inProgress. Recent source/interface reads exited0; no terminal/absence inference.
  Parent24inputs still equal the latest verified census close. No production/selftest change released.
- Current goal turn PROGRESS: obsolete viewport-sample assumption corrected; exact parser and derived-fact
  ownership shows why a Layout-only dependency patch cannot yet be assumed complete. Same worker is
  preparing the executable reproduction. No positive runtime/visual or full-B capability claim.
- Non-clean AAR triggers: prior-plan assumptions corrected; two parent source/plan reads exceeded output
  limits and missing sections were reread in bounded ranges. No source mutation or test rerun to repair reads.
- Sustain: existing schema/provenance arrays, finite source-bound catalog authority, no redundant renderer;
  preserve unknown-input and original source-proven controls rather than manufacturing sample overrides.
- Improve: exact range/return-shape reads and compact parsed receipts, not repeated broad validator audits.
  Parent handles cross-owner design; worker handles only the two executable observations.
- Highest-risk current design issue: incomplete numeric dependency metadata could be mistaken for a full
  geometry dependency graph and used to rebind stale scenarios unsafely. Keep exact source-splice/model
  proof and all contributors explicit. Scope/acceptance will be reconciled before a production writer starts.
- Local project record only; no external ledger/memory/skill update. Full goal and all experience gates open.
- Actual corpus Helper5482-5497 read during parent review: getMinTextHeight returns max(getTextHeight,
  scaleY(minRowHeight)-scaleY(y)). Expected floor35/41 is distinct from eventual row height; probe must
  not confuse the two. The type/loop rejection alternative may use wrong-source identity alone; no
  additional loop/HUB reconstruction is required for this prerequisite diagnostic.
- Latest compact:13 still confirms same active worker, preparing exact fact/return shapes. No runtime
  reproduction returned yet, so no bug fix or B source implementation is claimed. Parent24inputs remain
  unchanged; main design checkpoint is complete pending the frozen diagnostic.

### Parent diagnostic review checkpoint — 2026-09-11

- Previous user-status turn: VERIFIED WAIT (live Lagrange cursor15), not a new implementation close.
  Full objective reread; all nine actual-interface journeys and the native/fidelity obligations remain.
- Same probe-only worker remains active. Four failed diagnostic attempts are preserved as attempt logs;
  their failures are fixture/setup/assertion failures, not four reproduced product defects. Parent found
  a direct-control versus leaf-absence contradiction, tautological workspace immutability assertions,
  and missing post-run corpus hashes. Exact corrections were sent to the worker; acceptance awaits the
  corrected executable output and parent replay. Do not count an asserted finding as execution proof.
- Correct the earlier Paint interpretation: PaintPlan1033-1118 validates incoming Scene nodes and their
  provenanceLinks. PaintCommandBase130 and the output command types do NOT carry generic numeric links.
  basePreviewTints74 is color-only. Numeric ancestry can be inspected through a clearly labelled
  command.nodeId -> accepted Scene-node provenance join, not inferred missing from a zero tint count.
  No Paint output schema or alternate renderer is required merely to repair numeric Scene ancestry.
- Parent reread relevant current capability-map deltas and the complete ADR ledger. Reuse canonical
  source, guarded edits, existing Scene and Paint owners; no ADR conflict or capability-map delta from
  this evidence-only review. External ledger remains read-only.
- AAR trigger: repeated fixture errors plus one oversized parent combined source/map read. Required
  omitted map range was reread bounded. Degradation checkpoint called before production authorization;
  finish/freeze this diagnostic, independently replay, then use fresh implementation context. Source
  and test owners are still read-only. No Git mutation or product-completion claim.
- Acceptance amendment after observed public output: both sampled floor scenarios resolve35/41, but
  Scene currently returns malformed-structure and Paint is absent. Before attributing that refusal,
  add one exact four-way source control matrix: literal40/literal5, sampled40/literal5,
  literal40/sampled5, sampled40/sampled5. Each variant gets genuinely parsed source and issued catalog.
  Record all public statuses/facts; no patched evidence or private validation bypass. If the literal
  fixture also refuses, allow one grounded fixture simplification, then freeze with the exact limitation.
  This is a diagnostic-scope amendment, not permission for production fixes or broad iterative search.
- The four-way matrix also refuses all-literal input, so sampling alone does not explain the Scene
  refusal. Parent found a specific independent hypothesis: Layout12962 emits literal0 as the creator
  outerHeight fact when height=0 is explicit; Scene4481-4505 requires the resolved zero-height text
  candidate there. Layout13719 updates the cell fact value later, potentially leaving producer/cell
  disagreement. Actual Helper5390-5401 treats zero as automatic text height, with no omitted/explicit
  distinction. Authorize one final exact original-fixture pair removing ONLY height=0, preserving all
  earlier variants/results; compare public Layout/Scene/Paint. This targeted source-backed contrast
  supersedes generic fixture simplification as the causal next check. No production writer released.

### Parent independent diagnostic close — 2026-09-11 15:37Z

- VERIFIED bounded diagnostic reproduction; full numeric B and full product remain PARTIAL.
  Parent replay15:37:00.290Z..15:37:07.829Z exited0. Raw156204-byte log and compact receipt:
  test-results/b119-numeric-dependencies-reconcile-parent-20260911T153700294Z{.log,-receipt.json}.
  Frozen probe6DDCA57DB3EC5DE95391F01D847750D633168182EC982A18D96F03070607C7B0 unchanged;
 24source/test inputs and8actual corpus assets unchanged before/after. No live/native execution.
- Parsed source shows whole-value arithmetic/group/Lua-or sample entries, no separate underlying
  arithmetic/math/or leaf entries; unknown math.floor call remains unsampleable. Known viewport and
  literal controls remain non-overridable. This confirms producer/catalog work is necessary for B.
- Both sampled inputs consumed. Floor/text height35/41, eventual row height40/50. The floor fact keeps
  only minRowHeight's sampleId. Accepted Scene exposes that ancestry as outerHeight and y independently
  as outerY; their Scene union and Paint-node-to-Scene join contain BOTH IDs. No whole-Scene ID-loss claim.
- All four explicit-height0 controls: Layout projected, Scene refused, Paint absent. Omitted-height
  scenarios: Layout projected, Scene/Paint partial but accepted,6glyph commands each and correct floors.
  The diagnostic also uses distinct menu labels/source paths; new fail-first regression must hold the
  Lua menu name/body fixed except the height property to eliminate even incidental naming differences.
- Nonfinite-number sample refused; wrong-source sample cleared as stale-samples. Workspaces unchanged.
- Review decision: fix the independently exposed automatic-height producer discrepancy before B's
  broader metadata/grammar work. The new explicit-zero-text-height plan preserves all broader goal
  requirements. Behavior difference is REPRODUCED; precise internal correction still requires fail-first
  regression and unchanged Scene guards. No code or test expectations changed in this diagnostic.
- AAR: sustain public issued inputs, actual corpus hashes, independent replay and negative guards.
  Improve fixture review: four avoidable setup/assertion failures, missing initial Scene acceptance check,
  and inaccurate Paint-field assumptions increased diagnostic scope/time. Parent source review supplied
  the targeted zero-height contrast; no generic repeated fixture search should recur. Highest-risk
  observed weakness: correct Layout numbers can accompany a rejected Scene. Carry both through tests.
  No external ledger/memory/skill write; local plan is the durable AAR. Worker receipt is being finalized.
- Worker finalized and CLOSED/native not_found. Receipt audit found ONE transcribed Layout selftest hash
  with an extra trailing3 (65characters); all other31source/corpus hashes matched parent raw evidence.
  Preserve original receipt, use parent raw/census as authority. Exact audit is recorded in
  test-results/b119-numeric-dependencies-reconcile-worker-receipt-audit.json. Do not hand-transcribe hashes.
- Fresh automatic-height repair worker dispatched under its own plan; numeric B is not closed/deleted.
