# B119 nested numeric preview inputs — implementation contract
Status: PARTIAL; fallback and original numeric-root prerequisites VERIFIED. Current batch: 2026-09-12-b119-numeric-downstream-integration.md (IN_PROGRESS, Beauvoir). Lane: FULL. Date: 2026-09-11.
Parent workstream: docs/plans/2026-09-11-b119-numeric-alias-dependencies.md, required SliceB.
Full canvas-first goal remains ACTIVE/PARTIAL; all nine interface and native/fidelity obligations remain.

## Purpose and acceptance boundary

Let ordinary supported numeric layout calculations consume exact source-bound preview inputs, rather
than requiring the author to calculate and supply each intermediate expression. Preserve canonical Lua.
This is a vertical source-to-Scene/Paint slice, not completion of scenario-preserving history or all
geometry dependency tracking. The latter remain required next units, not dropped requirements.

Astra owns architecture, scope, review and acceptance. ONE native gpt-5.6-luna/max implements.
The Stage1/Stage2 instructions below record the original release; subsequent dated checkpoints retain
its full acceptance contract. Mencius completed the original-root prerequisite and is closed. The next
seven-owner downstream release is recorded in 2026-09-12-b119-numeric-downstream-integration.md.
No descendants or overlapping test runners. Parent reviews scenario/edit integration boundaries without
changing the worker's owners or authorization.

## Reconciled source of truth

- Full objective attachment and current SESSION-HANDOFF.md were read. Previous turn PROGRESS:
  automatic-height source repair closed with174/174actual-corpus assertions and24stablecode/8asset hashes.
- Existing numeric workstream sections152-175 and644-808 govern the remainingB boundary; historical
  A/parser/census/zero-height work is complete at its recorded scope and must not be repeated.
- Current capability-map numeric/table geometry deltas756-810 and complete ADR-F1..F5 read. Canonical
  source, CAS/immutable workspace identity, existing renderer and artifact ownership remain authoritative.
- Graph query's broad vocabulary matched unrelated resolve symbols; exact resolveNumericExpression
  graph node correctly identifies Layout2877, called by resolveNumber and owning its evaluate closure.
  Subsequent scoped source reads confirm the actual relationships. No architecture inferred from noise.
- Agent-brain recall/read returned a July reference-API conversation with no B119/numeric-sample matches
  in the inspected topic excerpts. It is weak historical retrieval, not current implementation proof.
- REPRODUCED prerequisite: parent153700294Z diagnostic shows whole arithmetic/group/or samples, no
  nested inputs, unknown math.floor unsampleable; two consumed floor inputs yield only one fact sampleId.
  Automatic-height refusal exposed during that diagnostic is now independently repaired; do not replay
  its pre-fix assertions as a post-fix oracle.
- Live source owners: CallModel585-657 numeric union;1499 operand helper; unary/binary2138-2260 and
  math-call3203; Layout2877 recursive evaluator,2999 resolveNumber,4134 catalog,7424 fact schema.
  Layout12741-12866 constructs minRowHeightFloor/final text height. SourceEdits3960 independently
  validates structural facts. Scene759/1120 expands facts into links;3347 validates facts.
- Existing Scene links are already arrays; Paint validates individual links and joins commands through
  nodeId to Scene. No Paint output schema/renderer change is needed.
- Scoped search found no sampleIds/sampleDependencies or numeric preview-input/runtime-input variant
  in CallModel/Layout/Scene/SourceEdits. Extend these owners; do not duplicate them.
- Alternatives: whole-expression manual samples fail the authoring intent; a separate evaluator/format
  would split source authority; extend current closed grammar/catalog/evaluator and existing link arrays
  (selected). Recurring problems were fixture/proof and bounded source authority gaps, not evidence
  warranting a replacement interpreter.

## Owned files and baseline

Root F:/DEV_ENV/X4_Forge. Stage1 may edit only these existing test owners:
- src/lib/x4UiCallModel.selftest.ts
- src/lib/x4UiLayoutProgram.selftest.ts
- src/lib/x4UiScene.selftest.ts
- src/lib/x4UiSourceEdits.selftest.ts
- src/lib/x4UiPreviewPipeline.selftest.ts (only a directly necessary cross-layer regression, not broad census edits)

Stage2 candidate production owners (READ ONLY during Stage1):
- src/lib/x4UiCallModel.ts
- src/lib/x4UiLayoutProgram.ts
- src/lib/x4UiScene.ts
- src/lib/x4UiSourceEdits.ts

Evidence: new test-results/b119-nested-numeric-inputs-* paths only; probes use .probe.txt, backups .snapshot.
All other sources, tests, docs, previous evidence, graph, corpus/mod/config files are read-only to worker.
Parent prepares the9owner snapshots and24input census before dispatch; hashes and exact directory in
the dispatch checkpoint below. HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, branchmain, dirty work preserved.
Latest unchanged gate baseline: automatic-height parent164500483Z final-close-receipt.json.
Rollback only this unit's reviewed delta against its snapshots, never entire dirty-file restore.

## Exact design

### 1. Source-bound numeric input operands

Extend X4UiNumericExpression with one closed preview-input leaf:
{ kind: 'preview-input', expression: string, source: X4UiSourceLocation }.
The node contains no supplied value and grants no source/game authority.

Only eligible unknown scalar operands in already-supported numeric grammar may produce it. Preserve
literals, profile/Helper-pinned values, direct-scale identities, math authority, exact ranges, binding
capture, reachability and reassignment safeguards. Never turn source-known values into sampleable inputs.
Reuse the existing sample-eligibility exclusions: no opaque calls, C/Helper expressions, functions,
tables, object references, unsupported operators or arbitrary Lua execution. Numeric parameter/identifier
and already-eligible member/index scalar expressions must remain exact source reads, not broad strings.

Do not attach a numeric descriptor indiscriminately to every unknown value: that would suppress existing
string/boolean sampling and broaden table-escape checks. Construct inputs in numeric operand contexts,
retaining original source-backed alias roots. Repeated consumers of the SAME proved root share entries;
different ranges/scopes must not be merged merely because their names match.

Independent Layout validation must prove leaf eligibility from real parsed source, not trust caller-edited
descriptor labels or a forged unknown status. Reuse existing CallModel/AST and source-binding authorities.
A source-known local, Helper member, reordered operand or stale alias forged into preview-input must fail.
No name-only fallback. If current authority cannot establish a proposed eligible form, report the exact
boundary; do not silently broaden accepted grammar or replace the source parser.

### 2. Existing catalog and evaluator

Collect eligible leaves recursively from SOURCE-VALID descriptors into the existing sample catalog,
with existing source/type/target/loop IDs and ordinary reciprocal consumer links. No new catalog/store.
For newly-supported compound numeric expressions, expose required base inputs, not redundant intermediate
compound-value overrides. Preserve existing explicit fallback policy for constructs outside this new
supported route; do not accidentally make source-known geometry overrideable.

Pass accepted sample/consumed maps and exact loop/instance context through resolveNumericExpression.
Only matching catalog-issued finite numeric values resolve input leaves. Missing/invalid input stays
unavailable. Evaluate existing grouping, unary signs, + - * /, floor/ceil/min/max and numeric Lua or.
Finite zero is truthy; do not evaluate/consume a skipped or branch, infer missing input as zero, accept
divide-by-zero/nonfinite results, or execute arbitrary Lua. Existing constant-only results stay unchanged.

### 3. Truthful evaluated sample dependencies

Extend only known NUMBER facts and numeric Resolution with optional sampleIds: readonly string[] for
genuinely multiple dependencies. Keep existing sampleId for exactly one; omit both for none.
Forms are mutually exclusive. sampleIds contains2..128 unique nonempty IDs in deterministic lexical order;
arrays must be plain dense data, no getters/symbols/extra keys. Over-limit results are explicitly unavailable
or refused, never silently truncated. Color/string/boolean/unavailable facts must not gain this field.

For arithmetic/group/math/table-field results, union dependencies actually evaluated, deduplicate shared
root IDs, and mark sample-derived results preview-sample. Preserve root expression/source as derived
evidence; retain existing pinned metadata where meaningful. A single dependency remains sampleId even
when its calculated value differs from the input. A dependency is not a replacement for source proof.

At minRowHeightFloor, merge BOTH minRowHeight/y and scaling contributors instead of selecting one.
Do not erase this set when final text-height facts are copied. Final text-height has additional dependencies
(content/font/fontSize/wrap/width/table-span/x); retain all applicable inputs already available through
existing resolutions/facts in this calculation. Document any wider geometry dependency gap rather than
claiming this slice yields a universal dependency graph. Scenario carry must still use exact source-splice
and fresh model/catalog reissue, not these IDs as sole authority.

Validate canonical forms and contributor membership at Layout/evidence replay and downstream consumers.
Every ID must be consumed, from the exact current catalog/source and correct consumer/loop authority.
Copied/forged sets must not become valid merely by replacing matching values in both program and manifest.

Update SourceEdits' independent fact validator and Scene's numeric fact validation; keep closed color
domains unchanged. Expand numeric fact dependencies into existing individual Scene provenance links
with their original sampleId shape. Preserve derived-fact identity/source and existing source pins.
Paint/Canvas continue using existing accepted Scene/link/nodeId contracts without a second representation.

## Tests and independent acceptance

Stage1: add source-parsed fail-first regressions proving actual missing behavior, then freeze. Keep
all prior tests; never weaken/delete/skip a test. If a historical expectation genuinely conflicts with
the new support contract, show the exact case and request parent reconciliation before changing it.

Required positives:
- An actual compound calculation such as local width=math.floor((runtimeWidth-24)/2), then a supported
  addTable/setColWidth uses width. With only runtimeWidth samples200 and260, expected88 and118.
  No sample is needed for the computed local width or compound expression; known literals unchanged.
- Two distinct inputs in one expression, correct independent variation and exact dependency union;
  same proved root used through multiple aliases/consumers is deduplicated, not sampled repeatedly.
- Existing grouping/unary and all four supported math functions; numeric or short-circuit with zero.
- Independently issued minRowHeight/y scenarios40/5 and50/9 -> floors35/41; the floor and inherited
  automatic-height sample evidence retain both contributors. Explicit/omitted-height equality stays green.
- Public EditorSession -> Layout -> accepted nonempty Scene/Paint geometry over real corpus for the new
  nested-input calculation, two changed scenarios, exact semantic coordinates and contributor joins.
- Original Lua/ui.xml/raw metadata unchanged; standalone dynamic string/boolean samples still work.
- Unsampled literal/profile/Helper controls stay exact and non-overridable.

Required negatives:
missing input; wrong scalar type; nonfinite/divide-zero; foreign/stale source/catalog and wrong-loop;
known-value-as-input forgery; rebound/shadowed/reassigned aliases; copied/reordered AST descriptors;
malformed/empty/duplicate/unsorted/over-limit sampleIds, both ID forms, unavailable/color/string/boolean
fields carrying sampleIds, getters/proxies/cycles; nonconsumed/foreign ID; duplicate manifest forgery.
Use actual public contracts and existing strict rejection paths, not private guard bypasses.

Serial commands (inspect current selftest entrypoints before execution; no parallel test runners):
node --no-warnings --import tsx src/lib/x4UiCallModel.selftest.ts
node --no-warnings --import tsx src/lib/x4UiLayoutProgram.selftest.ts
node --no-warnings --import tsx src/lib/x4UiScene.selftest.ts
node --no-warnings --import tsx src/lib/x4UiSourceEdits.selftest.ts
node --no-warnings --import tsx src/lib/x4UiPreviewPipeline.selftest.ts
node --no-warnings --import tsx src/lib/x4UiEditorSession.selftest.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <exact changed owners> --max-warnings 0
git diff --check -- <exact changed owners>

Use bundled Node C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.
Set X4_REFERENCE_ROOT=F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00 process-locally only.
Worker runs only parent-scheduled gates. Stage1 runs focused CallModel/Layout tests serially to record
new fail-first failures; it must not run Scene/other full gates or implement production until parent release.
Parent does not run Node concurrently. Full gate replay follows a reviewed final freeze; capture24source
and8actual asset hashes, exact commands/timestamps/exits. Never print giant Layout logs; parse counts.

Real-corpus probe must reuse the actual-byte transport/normal loader in the accepted explicit-zero
probe. No synthetic font bytes, crypto overrides, hand-typed hashes or optimistic UNRUN=PASS claims.
Parent independently reviews/runs frozen proof and compares machine-produced censuses. Its before source
snapshot precedes all projections; original workspace and ui.xml comparisons are actual assertions.

## Required later work and unavailable validation

No browser/full SourceEditor/Chromium/E2E/service/build/package/native testing until fresh machine
clearance. After clearance, actual sample controls, fresh canvas changes and missing-input recovery
must be inspected in the real host. Source-only green is not product completion.
Following required work: safe scenario-preserving scalar edits and existing Undo/Redo integration,
friendly applied/staged-sample recovery, all9interface journeys, three-menu/twelve-reference fidelity,
fullE2E/precommit/packaged/installed/native checks. Do not silently reduce this list.

## Risks, authority and close

Main risks: false source authority, consumed dependency loss, overbroad sampleability, stale/cross-loop
inputs, nonfinite geometry, and excessive proof/schema expansion. No new spend/network/credential/
delete/config surface. No Git/push/publish/external issue/wiki/memory/skill/protected-game/mod writes.
0.0.78 immutable. Current owner issue41 remains unchanged at this checkpoint.

After validation, review EVERY requirement against actual evidence. Mark only this slice's evidenced
source scope VERIFIED; otherwise PARTIAL/FAILED/BLOCKED with exact missing method. Capability-map changes
are by delta, external writes still gated. Update local plan/BACKLOG/ROADMAP/handoff and record AAR.
Suggested eventual commit: feat(ui): derive numeric layouts from source-bound preview inputs.

AAR baseline: NON-CLEAN due oversized combined parent reads; missing selected ranges reread separately.
No production/test changes or new runtime failures yet. Sustain source/corpus authority and bounded workers.
Highest current evidenced risk: partial dependency evidence mistaken for safe automatic scenario carry.
Countermeasure: typed closed sets plus source-splice reissue remains a separate mandatory acceptance boundary.

## Stage1 dispatch baseline

- All24source/test inputs independently still equal the completed automatic-height baseline.
- Nine current owner files copied byte-identically to inert snapshots at
 F:/DEV_ENV/X4_Forge/test-results/b119-nested-numeric-inputs-baseline-20260911T173225165Z/.
 Machine-produced baseline.json contains all24hashes and9before/copy/after-equal owner snapshots.
- CallModel and Layout selftest entrypoints inspected: both execute their run and set exitCode on failure.
 Stage1 may now add focused fail-first tests and run ONLY those two tests SERIAL; production remains frozen.
- DISPATCHED: native Luna/max Nietzsche01a09187-1dc6-7770-a003-f1ad20202397, no descendants,
 fork_context=false. Initial compact cursor90203a45-dbdd-4338-8926-c9aebb1be44f:1 confirms live Stage1.

### Parent downstream integration check while Stage1 runs

- SourceEditor4660-4755 retains owner-issued menu intent and validates exact before/after workspace
 references, immutable scope and selection epoch for second-render history notices. It does not carry
 samples. Existing effect5005-5017 clears applied samples and private sample authority when the new
 projection has no accepted samples;5020 clears a stale draft. Preserve these fail-closed guards.
- updateSample5303+ stages values against the exact issued catalog/binding/authority; applySampleDraft
 adopts only the currently matching draft. resetSampleDraft5364 clears the draft, not applied samples.
 No source/UI mutation performed in this review; this confirms the existing distinct state owners.
- Therefore this numeric slice must NOT silently rebind samples by variable name or attach scenario
 snapshots to the source undo stack. Following edit/history work needs exact source-splice lineage,
 fresh paths -> loops -> sample catalog reissue and latest-current-scenario semantics across the
 first workspace render and later successful acknowledgement. Numeric dependency arrays alone are
 insufficient. Ordinary applied-input reset/recovery remains a separate required product action.

### Verified wait checkpoint — 2026-09-11 17:42Z

- Same Nietzsche remains active/inProgress at compact cursor90203a45-dbdd-4338-8926-c9aebb1be44f:22.
 No terminal worker result or fail-first acceptance yet. Do not cancel/restart from elapsed time.
- Parent17:41:52Z census: all24inputs unchanged; production remains frozen. See baseline directory
 parent-stage1-checkpoint.json. New inert baseline probe artifacts exist, but no test result is inferred
 from their mere existence. Only scheduled worker execution is permitted; parent has no Node handle.
- Parent plan/record whitespace check17:40:21Z exit0. A subsequent handoff patch used out-of-order
 hunks and was rejected; read-only checks confirmed neither handoff nor new receipt had changed.
 Corrected with ascending hunks. This is a parent reporting error, not a product/worker failure.
- Current outcome VERIFIED WAIT plus documented reconciliation, not implemented numeric-input support.
 Production Stage2 still requires reviewed fail-first evidence and explicit parent release.

### Parent local-helper binding review — 2026-09-11 17:51Z

- Source inspection confirms instantiateValue4965-4999 substitutes only an outer value.parameter;
 instantiateTree5003-5014 returns immediately for a value shape. It does not recursively instantiate
 parameter reads inside numericExpression. Existing local expansion accepts direct scalar literals
 and bounded dynamic scalar arguments, with exact parameter IDs and per-invocation ownership.
- HYPOTHESIS for the new leaf design, not a reproduced runtime failure: treating an inner callee
 parameter read as an independent input could offer an override for a known caller literal or share
 samples between different invocation instances. The current closed leaf has no parameter ID; source
 and existing declaration/binding authority must prove any substitution. No new name-only authority.
- Add a focused existing-owner regression for an expanded helper whose width is
 math.floor((widthArg-24)/2): a direct caller literal200 must resolve88 without a preview override;
 a caller runtimeWidth input must resolve88/118 for200/260 through the exact caller binding, not a
 separately issued callee widthArg sample. Include distinct invocations/forged binding rejection.
 This clarifies the already-in-scope numeric parameter and known-source invariants, not broader Lua
 execution. If that mapping requires unsupported authority, stop and report the exact boundary for
 parent design review; do not silently sample the known value or omit the required parameter case.
- Parent read-only census17:51:04Z found only CallModel.selftest changed among24inputs. All production
 and remaining23inputs still match the dispatch baseline. Worker remains sole test runner.

### Early Stage1 test review — 2026-09-11 17:55Z

Parent reviewed the initial130-line CallModel and208-line Layout test additions while the worker was
still authoring. These are not accepted/frozen tests or executed fail-first results yet.

- REPRODUCED by inspection: the union fixture compared JSON.stringify(model) with itself; the single
 fixture captured its supposed before-model snapshot after every projection. Neither proves projection
 preservation. Require immutable before snapshots ahead of the first catalog/projection, and real after
 comparisons for both fixtures. This repeats a previously recorded proof-ordering hazard.
- REPRODUCED by inspection: the knownFormula control searched only four unrelated runtime names for
 preview-input leaves. A wrongly emitted leaf named known would pass. Require zero preview-input leaves
 of ANY expression plus the source-known expected value/no-override behavior through public projection.
- The test-only sampleIds shape helper must check every dense numeric index via own data descriptors,
 not array.every alone, which skips holes. Include a trailing-hole negative; no getter execution as proof.
- Findings sent together to the same worker for correction before its freeze. No parent edits to owned
 tests or production. AAR trigger: review required strengthening assertions before accepting evidence.

### Stage1 checkpoint sequencing and product coupling — 2026-09-11

- Stage1 acceptance is the corrected CallModel/Layout fail-first core: source-bound compound operands,
 one/two-input calculations and dependency identity, known-value/no-override controls, and the local-helper
 binding boundary (or exact source-backed explanation if that boundary cannot be represented safely).
 Freeze and run those two scheduled selftests serially, then report. The three other permitted test
 owners need not be filled before this first review. The full positive/negative/downstream matrix above
 remains mandatory before final slice acceptance; sequencing does not defer or remove the product goal.
- The test-only dependency shape helper briefly required writable/configurable index descriptors,
 rejecting valid freezeDeep-frozen arrays. Parent identified the overconstraint; worker acknowledged
 and added a frozen dense-array positive. The contract requires data-only density, not mutability.
- SourceEditor4193-4248 renders sample expressions, type/ID, source ranges and hashes. The only main
 mount6361 is inside Inspect6255-6509. The approved canvas-first plan44/48/171 already requires a
 primary-workspace scenario control, affected-element explanations and concise recovery. This is an
 existing remaining product obligation, not proof that the numeric slice completes usable scenarios.
 Do not move that component or add a parallel sample store in this production slice. The subsequent
 scenario/history unit must reuse the exact catalog/draft authority and provide friendly controls while
 retaining technical evidence under Inspect; actual rendered inspection remains required after clearance.

## Stage1 frozen review checkpoint — 2026-09-11 18:10Z

Status: VERIFIED core failure reproduction only; numeric slice/full goal PARTIAL. Production unchanged.
Nietzsche completed Stage1, was CLOSED by parent, and native wait returned not_found. No test handles remain.

Parent read the complete149-line CallModel and405-line Layout additive deltas, and independently parsed
all baseline/final reports and the relevant failure details. Existing946green checks are still present
and pass by exact check-name comparison. No previous tests were removed or weakened.

- CallModel baseline136/136 exit0; final136/137 exit1,18:02:24.224Z..18:02:24.760Z.
- Layout baseline810/810 exit0; final811/815 exit1,skips0,18:03:24.000Z..18:03:51.573Z.
- Five new core checks fail. The one passing new check exercises a TEST-ONLY array helper; it is NOT
 evidence that production validators reject malformed dependency sets.
- REPRODUCED: single/two-input catalogs expose width/widthAlias instead of runtimeWidth/runtimePadding;
 width facts unavailable. Expanded helper catalog exposes one callee width; all3facts unavailable,
 including the literal200 invocation. This is exact source-level behavior, not a rendered/native claim.
- Parent18:09:40Z census:22/24inputs unchanged; the two intended test hashes match the worker freeze;
 all production remains identical. Four complete log hashes/sizes, exact commands/timestamps/exits,
 baseline comparison and review limits are in baseline-directory
 parent-stage1-frozen-review-20260911T180940Z.json. Parent did not rerun Node tests.

### Mandatory review limits before/within the production batch

1. The test-only canonicalNumericSampleIds permits extra enumerable own keys because it compares
 own-key lists to each other, not to exact dense indices plus length. Correct that helper and cover
 production Layout/Scene/SourceEdits validation/evidence replay independently; helper-green is not enough.
2. CallModel dynamicText/dynamicFlag checks use optional chaining over aliases that may be absent.
 Assert actual call semantics and issued string/boolean catalog inputs, not absence of an alias entry.
3. The knownFormula88 control is currently absent from the raw alias ledger. isRelevantBinding4483
 records numeric-descriptor bindings, not all scalar locals; numericLiteralExpression1490 requires
 exact literal range, while fallback arithmetic2290 folds values without a closed descriptor. Reconcile
 the source-known local arithmetic route and existing public canonicalization before Stage2. Keep the
 no-override/known88 requirement, but do not invent a parser defect or silently broaden raw-model
 authority merely because the alias list is empty. Split distinct controls so one red conjunction does
 not hide another unsupported assumption. Exact source-known local binding support is a design decision
 to record, not a name-only sample fallback.
4. Helper forgery currently appends an unknown sample ID; true forged declaration/binding/instance
 metadata rejection remains required. The failed core means this branch has not yet run successfully.
5. Floor dependencies, operator value/short-circuit checks, malformed/forged contributor sets, downstream
 validators, all6pure tests/static gates and the real-corpus public Scene/Paint proof are still required.

Next action: fresh-context parent review of these exact source/authority limits, then an explicit bounded
native Luna production release under this same full contract. No live worker to poll/restart now.
No capability-map delta; no product/release close. No Git, publish, installed/native or external writes.

AAR: NON-CLEAN. Sustain bounded ownership and causal red tests before production. Improve assertion
independence and distinguish fixture helpers from production validators. Parent made3log parsing errors
(JSON plus footer; baseline footer differs from final), plus truncated diagnostic reads. Correct extraction
uses the observed unindented JSON root terminator and parses metadata separately; no tests rerun for
reporting errors. Degradation call made: checkpoint now, fresh context before production. Highest evidenced
risk is self-confirming or vacuous test evidence masking authority mistakes. Lessons banked here; external
ledger writes remain unauthorized. Suggested eventual commit stays the feature title above, NOT ready now.

## Stage2 design resolution and production release — 2026-09-11 18:31Z

Parent continuation classified PROGRESS: frozen evidence checked, exact source implementation reconciled.
All24inputs still match the Stage1 freeze at18:15:25Z. The original9snapshots remain rollback authority
for this unit; retain the frozen Stage1 hashes/logs. No other worker or Node process owns these files.

### Selected source-authority design

1. Retain exact numeric operand provenance privately through lexical binding capture. Materialize closed
 numeric descriptors and required alias evidence when a value participates in supported numeric grammar;
 do not attach numeric descriptors to every standalone unknown/string/boolean/number value. The current
 literal path creates sourceLiteral but not a numericExpression, valueAtUse changes the use range, and
 numericLiteralExpression only recognizes an exact literal range. Thus a captured scalar constant can
 fold arithmetic while losing the descriptor needed by a surrounding math call. The model normalizer
 only removes metadata; it does NOT restore these descriptors. Preserve the real initializer literal
 root and exact declaration/context evidence rather than inventing a literal at the identifier use.
 This explicitly includes source-known local arithmetic such as known=200 and knownFormula=floor((known-24)/2),
 which must resolve88 and never expose known/knownFormula as preview overrides. Reuse existing lexical
 bindings and alias source proof; materialize only required numeric alias records, not all unrelated locals.

2. Keep helper expression descriptors faithful to the callee source. Carry the EXISTING validated
 parameterBindings through the internal projectable-call evaluation context for catalog and resolution.
 Resolve a parameter read through its exact declaration/source/instance to the caller argument, retaining
 caller source identity. Literal caller inputs resolve without catalog entries; dynamic caller inputs
 use the caller's exact source-bound entry. Do not splice a caller node into a callee expression and then
 weaken AST range/structure checks to accept the mismatch. No public mutable environment or second
 binding engine. Retain existing recursion/depth/reachability/ownership limits and validate binding
 chains from real source, including nested/shadowed parameters and distinct invocation ancestry.

3. Independently prove each new preview-input leaf against source-derived analysis, not caller-edited
 model fields. Reuse the existing source AST/binding proof and, where necessary, a fresh buildX4UiCallModel
 analysis of the exact input file. CallModel only imports luaparse, so a Layout -> CallModel runtime
 reference introduces no observed reverse dependency. Any cache is private/read-only source analysis,
 keyed/invalidated by exact file identity and text, not sample values or unverified descriptors. It must
 not become an alternate evaluator or authorize opaque calls, known values, C/Helper/global object reads.
 Retain independent AST operand order/range/math-authority checks and evidence replay for contributors.

4. Strengthen Stage1 test evidence as part of implementation: exact own-index/length array shape,
 frozen positives; standalone text/boolean actual semantics and public catalog entries, not absent-alias
 optional chains; separate known-local constant control; true parameter/instance/declaration forgery.
 Preserve all original assertions. Changes to prior green expectations still require exact reconciliation,
 not deletion/skip/loosening. Test-only helper controls remain labeled fixture checks, never production proof.

### Released batch and acceptance

Stage2 is RELEASED to ONE fresh native gpt-5.6-luna/max worker for the9named owners above:4production
and5test files. Implement the full nested-input/dependency slice, including floor/final-text contributors
and downstream numeric validation/Scene links. No Paint/Canvas/EditorSession/SourceEditor production edits.
If required correctness needs another file or a different authority design, report the exact coupling
before changing that boundary. Full positive/negative matrix and public real-corpus proof remain mandatory.

The worker is the SOLE Node runner. It may run the6listed pure selftests serially, whole-project typecheck,
exact-owner strict lint and whitespace, beginning with CallModel/Layout after each relevant correction.
Do not repeat the unchanged Stage1 baseline or completed automatic-height/census repairs. Preserve each
actual failure, exact command/time/exit and concise summaries. Write new evidence only beneath
test-results/b119-nested-numeric-inputs-stage2-*; use plain JSON receipts separate from stdout/stderr logs.
Author the real-corpus public probe as an inert .probe.txt using the accepted real-byte loader, but do NOT
execute it before parent review. Freeze all files/results, report remaining limitations and STOP for review.
Parent will inspect the full diff and independently replay the frozen proof after the worker is stopped.

Parent concurrent work is read-only real-menu dependency/authoring-path reconciliation, not duplicate
implementation or concurrent Node execution. Scenario/history/friendly primary-workspace UI remains the
next required product unit. All9interface journeys, fullE2E/precommit/packaged/installed/native and
three-menu/twelve-reference obligations remain; source-only green will not close the full goal.
Machine/protected-write/Git/release boundaries are unchanged. No capability-map delta until verified.

Dispatch: native Luna/max Mendel01a091bd-22f0-74d3-b5ab-35437cc96a77, fork_context=false, no descendants.
Initial compact f850665b-45aa-4a51-adcc-59becd9752ee:1 confirms active/inProgress. SOLE Node runner.
Fresh24input/9byte-equal snapshot baseline:
test-results/b119-nested-numeric-inputs-stage2-baseline-20260911T183037400Z/baseline.json.
All24inputs match Stage1 freeze; parent has no Node handle. Authoring new code is now released ONLY to
this worker's9named owners. No passing implementation result is claimed at dispatch.

### Parent real-menu compatibility review — 2026-09-11 18:40Z

Read-only source inspection, not runtime or rendered acceptance. Source root:
F:/DEV_ENV/projects/Mods/X4Mods/x4_ai_influence/ui/addons/ai_influence_chat/.

- HUB tabDossier190-194 uses floor(w*.30) and parameter/Helper-scale arithmetic; tabInfluence344-347
 uses floor((w-Helper.scaleX(40))/3). These are real consumers motivating the selected numeric grammar
 and exact helper-parameter binding tests, not permission to add another evaluator.
- HUB659-671 derives width from Helper.viewWidth; SHEET81-92 derives width/position from profile
 dimensions. These must remain source/profile-derived, never redundant author-entered preview inputs.
- Separate caller boundary: HUB698-699 selects TAB_FN[hub.tab] and invokes pcall(fn,frame,x,y,w,bodyH).
 The existing CallModel processProtectedCallbackIfPresent2920-2939 only traverses an immediate anonymous
 zero-parameter callback, with exactly one pcall argument. This is a source-observed shape mismatch;
 no fresh execution of the complete HUB was performed. A direct-local helper fixture cannot establish
 that real dispatch path. Preserve it as an explicit full-menu census/recovery check, not an implicit
 Stage2 promise or authority to implement arbitrary function-table/pcall execution.
- MENU277-287 normalizes pct through tonumber before calculating floor(w*pct); tonumber remains outside
 this closed numeric slice. The existing opaque-call boundary must not be silently converted to geometry.
- Parent sent these boundaries in one message to the same Mendel handle. No code/test or mod files were
 changed by parent, no Node/test execution overlapped, and no Stage2 acceptance was inferred.
- Observed source hashes at18:40:04Z: HUB657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F;
 SHEET682ED230C3ECE1C90C44C25DCA63C026B6182C2FCE4227382202B0AF16286101;
 MENU8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD.
- AAR delta: bounded reads recovered truncated broad output. One patch used a nonexistent handoff
 context and was rejected; read-only verification confirmed neither target changed. Parent degradation
 call made, checkpoint before next review unit. Highest evidenced acceptance risk here is treating a
 supported arithmetic fragment as proof of its unsupported real caller path. Keep source-shape
 compatibility and actual full-menu acceptance separate. No capability-map delta.
- Parent18:43:23Z census passes24/24unchanged; receipt in Stage2 baseline directory:
 parent-compatibility-census.json. Three inspected mod hashes still match; exact documentation diff check
 exits0. Latest native worker compact:12 remains active/inProgress and acknowledges these boundaries.
 This checkpoint is PROGRESS plus VERIFIED WAIT, not completed production or real-menu acceptance.

### First CallModel batch review and grouping-test reconciliation — 2026-09-11

- Parent18:53:55Z census still found all24inputs unchanged after22minutes of live worker reconnaissance.
 Same Mendel was redirected, not replaced: implement CallModel first, run its focused test, then advance
 to Layout. Worker reported no source-authority blocker. Full nine-owner/six-gate acceptance is unchanged.
- Initial production delta:69lines (54added/15removed), plus direct text/boolean and separate known-local
 test controls. Parent read both complete diffs. New leaf/private literal-root/candidate handling exists;
 this is an in-progress patch, not accepted source support. Downstream layers remain outstanding.
- Parent independently parsed actual stdout from
 test-results/b119-nested-numeric-inputs-stage2-callmodel-feedback-20260911T145825842Z/:
 UTC18:58:25.846Z..18:58:26.135Z, exit1,138/139. The failed check is the NEW Stage1 nested-input conjunction.
 Actual kinds:math-call,binary,preview-input,literal,unary; leaves:runtimeWidth/runtimeHeight/runtimeOffset;
 runtimeZero/or are absent. Known arithmetic is static88, no preview-input, with its legitimate math
 descriptor. The worker's initial known-descriptor failure explanation contradicted the assertion;
 parent corrected it from actual test code and parsed output. Do not remove that known descriptor.
- RECONCILED TEST ASSUMPTION: installed luaparse.js2506-2532 consumes parentheses and returns the inner
 expression; CallModel1102 uses it directly with Lua5.2/ranges/locations. There is no ParenthesizedExpression
 emitted for these parsed fixtures. Layout2607 only accepts an explicit group against that AST type.
 Requiring nestedAllDescriptorKinds.has('group') therefore tests an invented representation, not the
 required arithmetic semantics. Parent authorizes replacing THAT new predicate with stronger exact
 source/precedence-tree assertions: floor argument is division whose left child is subtraction, and
 groupedValue is unary minus over division whose left child is addition. Keep exact source ranges/text
 and the later public88/118 and grouped-versus-ungrouped numerical controls. Do not fabricate parser
 nodes or relax source validators. Grouping semantics, not a mandatory wrapper node, is the contract.
- Numeric or remains an implementation failure: CallModel2239 currently discards the descriptor when
 the left truth value is unknown. Preserve a source-proven closed expression for later finite numeric
 sample evaluation; missing samples remain unavailable and numeric0 stays truthy. No assertion removal.
- HYPOTHESIS pending actual regression: generic numericExpressionForValue is also called from
 tableFieldValueAtUse1733/1756 and escape checks1553. Synthesizing unknown leaves there could promote
 ordinary table-member text/boolean values outside numeric use. Worker must test actual member controls,
 retain normal sampleability, and preserve numeric table authority; parent made no code edits.
- AAR: parent read_thread output request exceeded the undocumented20,000character cap and one raw receipt
 read included a giant escaped detail line. Corrected by parsing on disk and selecting fields; no parent
 Node rerun. Worker receipt's regex-selected firstFailureLines includes passing checks named fail-closed;
 acceptance must use JSON checks where pass===false. Highest evidenced weakness: a compound test and
 substring log selection supported a wrong diagnosis. Preserve first failures and inspect exact predicates.

### First CallModel green feedback — 2026-09-11 19:08Z

- Same worker's logged CallModel run19:06:45.343Z..19:06:46.073Z exits0,139/139,0failures,0stderr bytes.
 Parent independently parsed stdout and compared all136original baseline check names: all retained,
 exactly once and passing. No parent Node execution. Actual log:
 test-results/b119-nested-numeric-inputs-stage2-callmodel-feedback-20260911T190645336Z/stdout.log,
 SHA2564931A8590428D69E71343DA503996E8DF92B1474EF7A36F98525A7495E397E1B.
- Parent reviewed the complete81-line production and93-line test deltas against Stage2 snapshots.
 Numeric candidate synthesis is disabled at the two non-numeric table/escape call sites. Exact parsed
 precedence-tree assertions replace only the authorized group-kind assumption; numeric or, known88,
 direct and table-member text/boolean no-numeric-descriptor controls pass. Public catalog sampleability,
 member/index numeric inputs, scalar-root alias evidence and all downstream proofs remain required.
- Parent receipt: Stage2 baseline directory/parent-callmodel-green-feedback.json. Its current owner
 hashes are read-time observations, not falsely labeled final run pins. Worker is NOT frozen/closed;
 it continues into Layout. This is verified focused feedback, not full numeric-slice or product acceptance.

### First Layout feedback and parent review — 2026-09-11 19:28Z

- Previous status turn classified VERIFIED WAIT: exact Mendel handle was confirmed active. Current
 turn PROGRESS: parent reviewed complete initial Layout diff and original failing fixture, sent bounded
 correction requests; same worker continues. No additional worker, parent Node, or protected action.
- REPRODUCED worker run19:25:15.488Z..19:25:34.661Z exits1 and aborts before emitting JSON. Empty stdout
 means assertion counts unavailable, not zero failures. Actual1401-byte stderr records an original
 sampled-local-expansion refusal: operations[11] property localInvocationResult does not match its direct
 consumer location. Preserve consumed-return sample support and expected widths30,55,40,65; no inference
 of arbitrary helper return values or relaxation of exact source-occurrence validation is authorized.
- Parent source review also flags numeric-catalog fallback removal, sample-dependent arithmetic still
 labeled source-literal, and exact-global-Identifier syntax being treated as scalar eligibility proof.
 These are in-progress review findings, not a final acceptance verdict. Worker is restoring existing
 fallback while retaining the new closed route; each claimed repair still requires executed proof.
- Parent19:27:21Z census:5authorized owner deltas among24inputs, no unexpected changes. Read-time hashes,
 raw log hashes and review limits in Stage2 baseline directory/parent-layout-first-feedback.json.
- AAR NON-CLEAN: original regression exposed during production; parent oversized combined instruction
 reads required bounded recovery. Reviewctl/BlastRadius unavailable; existing graph path plus manual
 diff/source checks used, no tool installation. Highest observed weakness: catalog changes can cause a
 seemingly unrelated source-evidence refusal. Keep catalog/consumer authority and historical tests intact.
 No capability-map delta; all9interface and full product/native/fidelity gates remain required.
- Additional source review: CallModel createLocalFunction records parameter.source at the declaration
 token, while evaluate.sourceNode and preview-input.source identify the use token. Layout's initial
 parameterForPreviewInput and eligibility branch compare these ranges directly, so nested helper uses
 cannot bind that way. Worker must use existing exact lexical/declaration proof, preserving shadow and
 reassignment guards; no name-only matching. Required helper200->88/260->118 tests decide the repair.
 Initial deferred tableFieldPreviewCandidate covers tracked source-literal tables only; it does not by
 itself prove the required already-eligible runtime member/index forms. No support narrowing authorized.

### Second Layout feedback and explicit fixture reconciliation — 2026-09-11 19:36Z

- Actual worker run19:33:32.706Z..19:34:08.042Z exits1 with806/815,9failures. Parent independently parsed
 stdout JSON: nested runtimeWidth200/260->88/118, two-input union/variation and exact local-helper tests
 now pass. This is focused proof only; remaining downstream/floor/negative/public corpus gates are open.
- Four failures are existing explicit numeric-root fallback regressions. Preserve that bounded policy
 outside the new valid closed-input route, including malformed/reassigned refusal and the exact original
 assertions. Removing every descriptor-bearing fallback is not authorized by this slice.
- Three production-shaped sample checks still expect a manual value for tw-mx*2. This DOES conflict
 with the approved base-input contract. Parent authorizes changing only that fixture's input setup and
 catalog assertions to exact tw and mx entries, with tw=100/mx=10->80 and tw=110/mx=10->90. Preserve
 kernel column widths40,39 and45,44, both distinct dynamicText source IDs, exact sample provenance,
 source/input immutability and all stale/extra/wrong-type/nonfinite schema negatives. Add missing-mx
 refusal/unavailable proof. No whole-expression override or absent-entry optional-chain success.
- The sampled-conditional-cell-owner fixture filters specifically for tableWidth-margin*2; its new
 base entries are discarded, preventing the sampled projection entirely. Parent authorizes exact
 tableWidth/margin setup100/10->80 in BOTH conditional source fixtures, preserving every original
 causal table/row/cell closure and schema assertion, local expansion control and12column count.
 These are test input migrations to the selected feature, not waivers of the underlying outcomes.
- Separate REPRODUCED implementation gap: menu.display(tw,...,mx) operands are unavailable with reason
 numeric preview-input local binding is not declared at this source use. The current lookup only uses
 model.localFunctions, whose declaration owner excludes nonlocal/member menu functions. Source-proven
 parameter eligibility in a selected global/member function must use the actual AST lexical parameter
 declaration; this does NOT authorize expanding arbitrary global calls or inventing local invocation IDs.
- No original check removal or broader historical expectation changes authorized. Required implementation
 fixes and migrated fixtures must pass together. Full goal unchanged; parent Node ownership remains off.

### Intermediate review freeze requested — 2026-09-11

- Parent read the complete migrated Layout selftest diff. Approved base-input setup retains expected
 geometry and source/causal negatives. Review found new widthSample redeclared in the same run function
 (lines7902/12109) and removal of the old computed-expression no-gap check. Requested unique fixture
 naming and retaining the old root alongside tw/mx; no assertion relaxation. Missing-mx check retained.
- Worker reported a PowerShell wrapper parse failure before the next Layout run started; no new test
 execution/result artifact exists for that attempt. Latest collected result remains806/815.
- Degradation call: duplicate declaration plus wrapper quoting error justify an intermediate review
 checkpoint. Same Mendel must finish exact corrections, execute the corrected focused Layout run, then
 STOP with all9owner hashes/changed-file list/result logs and remaining requirements. No downstream
 production/test batch before parent review. Do not start another worker while this handle remains live.
- This changes batch sequencing only, not the full nine-owner/six-gate/floor/negative/public-corpus
 acceptance contract. No intermediate freeze may be called a completed numeric slice or goal close.
- AAR NON-CLEAN: fixture migration required exact parent reconciliation, output overread required
 bounded recovery, and two avoidable worker errors triggered the checkpoint. Sustain actual JSON result
 inspection and original-name comparison; improve fixture-local names and reuse the proven run wrapper.
 No capability-map delta or external ledger write. All actual-interface/native gates remain unchanged.

### Third Layout feedback — 2026-09-11 19:50Z

- Corrected run19:45:31.235Z..19:46:05.576Z exits1,811/816/skips0. Parent independently parsed actual
64,129,904-byte stdout and compared all810original names: none missing/duplicated;4originals and1new
missing-input assertion fail. Evidence:Stage2 baseline directory/parent-layout-third-feedback.json.
- New nested/helper cases remain passing; production width80/columns40,39/textFirst,Second with4consumed
samples and preview-sample provenance are observed. Nonfallback reassignment and conditional cell-owner
checks now pass. Do not call the entire production sample case passed: its stale root width gap persists.
- Three root-fallback assertions still fail. REPRODUCED recovery defects: a correct sampled width retains
the old dynamic-root warning; missing mx withholds geometry correctly but exposes only generic root
arithmetic failure. Keep root no-gap and exact missing-input checks, not weaker surrogate assertions.
- Current census5authorized deltas/24inputs, no unexpected changes. Worker is collecting requested9owner
freeze inventory and must STOP before further work; parent Node remains off until authoritative stop.
Full source/dependency/downstream/public-corpus and all product/UI/native obligations remain unchanged.

### Intermediate worker close — 2026-09-11 19:53Z

- Mendel completed the requested intermediate freeze, was CLOSED, and native wait confirms not_found.
 No live worker/Node ownership remains. Full current production diff review precedes the next release.
- Worker final cites a fourth captured Layout run19:46:47.819Z..19:47:23.056Z,811/816/skips0/exit1.
 Parent verified its stdout is byte-identical to the already parsed third run; stderr empty. Preserve
 both actual run receipts, do not merge their timestamps or mislabel the later result as parent execution.
- Parent19:52:18Z verifies all9reported owner hashes, no nonowner delta. Frozen receipt:
 Stage2 baseline directory/parent-intermediate-freeze.json. Five owner deltas are present, including
 the Scene selftest's one-line type assertion; no downstream production completion is inferred.
- IMPORTANT: CallModel139/139 was captured before later deferred-table candidate production changes.
 It is historical feedback, not validation of the current E28EAAB... source hash. Current focused/static,
 full6serial gates, remaining source/negative/dependency cases and real-corpus public proof are required.
- Review checkpoint status PARTIAL/FAILED required Layout gate, not VERIFIED. No commit, release,
 browser/native or external writes. Full goal remains ACTIVE; next batch keeps the original acceptance.

## Fresh review and recovery correction batch — 2026-09-11 20:04Z

Previous goal turn NO PROGRESS (user requested status). This continuation completed full frozen production
CallModel/Layout and all three changed selftest diffs against Stage2 snapshots. Nine frozen hashes match;
the15nonowners in the24input census are unchanged. HEAD remains93c9af1; dirty unrelated work is preserved.
Reviewctl/BlastRadius remain unavailable; manual complete-diff/source review is the explicit fallback.
Agent-brain returned the same July reference-API note; targeted note text had no B119/numeric/canvas matches.
That retrieval is weak and does not establish prior numeric implementation. No capability-map delta.

SPECIFIED immediate batch: repair the two reproduced user-facing recovery failures in existing Layout
and its selftest only. Reuse current evaluator, model gaps, operation/evidence events and sample catalog.
All other source/test owners are read-only. No source grammar expansion, fallback-policy restoration,
Scene/schema redesign, UI changes or unrelated refactoring in this first correction checkpoint.

- Successful closed arithmetic must clear only its exact now-resolved numeric model warning; preserve
 unrelated same-text/different-range, wrong-owner/loop, unsupported and still-unavailable warnings.
 Existing cleanup14307+ only knows consumed leaf ranges, not their successfully resolved compound root.
- Missing-input recovery must identify the actual missing leaf (mx), retain the unavailable root fact's
 exact source/expression authority, and withhold geometry. Evaluator3230+ currently replaces child gaps
 with a generic arithmetic-root gap. Add focused controls for nested missing input and unrelated gaps;
 do not remove either existing failed recovery assertion or discard evidence events to hide warnings.
- The producer dependency sorter uses localeCompare while schemaNumericSampleIds requires default
 lexical sort. Align the producer to its existing canonical contract; remove the unused descriptorError
 local in catalog collection if strict lint confirms it. No validator or source-eligibility weakening.

Required immediate validation: current CallModel and Layout selftests SERIAL, whole-project tsc, exact
two-owner ESLint with max-warnings0 and whitespace. Expected first checkpoint: both recovery failures
fixed with no new failures; the three legacy fallback failures remain explicitly open pending the
parent reconciliation below. Passing this checkpoint does not accept the full numeric slice.
Baseline/rollback:24current hashes and9byte-equal inert snapshots in
test-results/b119-nested-numeric-inputs-recovery-baseline-20260911T200348387Z/baseline.json.
Worker writes new evidence only under test-results/b119-nested-numeric-inputs-recovery-*; capture exact
commands, UTC start/end, exit, raw stdout/stderr and compact JSON counts. Freeze and stop for parent review.
Parent reviews legacy fallback semantics and subsequent source-authority work independently, without Node.

Fresh reconciliation finding: old catalog4161+ used target-wide allowNumericExpressionSamples; once any
root lost binding it offered vw/vh/my/w as well as x. Old resolveNumber3030+ prioritized those samples
even for otherwise valid descriptors. The unchanged fixture supplies their known values, so it cannot
detect overrides. Current runtime receipt proves vw1920/vh1080/my540 remain source-known with only the
frame-x property context shifted. Restoring blanket overrides conflicts with the declared no-known-value
override contract. Parent is reconciling exact fixture migrations before authorizing any changes to the
three fallback tests; do NOT simply restore target-wide overrides to make them green. Preserve genuine
root fallback, deduplication of eligible uses, malformed/reassigned rejection and unrelated geometry.

Still mandatory after this checkpoint: eligible member/index and scalar-alias roots; independent source
authority; full operator/short-circuit/negative matrix; complete floor/text/scaling contributors; downstream
Scene/SourceEdits/replay validation; all6serial gates and actual-byte public Scene/Paint proof. Full nine
interface journeys, scenarios/history, fullE2E/package/native and three-menu/twelve-reference proof remain.
Machine clearance is not renewed; no browser/Chromium/SourceEditor/service/build/game/protected/Git writes.
AAR NON-CLEAN: review exposed an old test-contract conflict and canonical-sort mismatch. Sustain full-diff
review and exact snapshots. Highest evidenced risk: restoring historical fallback behavior would allow
samples to override already-derived geometry. Resolve the conflict explicitly rather than treating old
green tests as authority over the product contract. Local plan is the durable record; no external writes.

### Explicit fallback reconciliation for the following checkpoint — 2026-09-11 20:09Z

SPECIFIED, NOT YET RELEASED to worker. This explicitly supersedes the earlier instruction to retain the
legacy five-input/three-consumer expectations on the single-property-corruption fixture. It strengthens
the goal's existing no-known-value-override rule rather than restoring known geometry as manual inputs.
The immediate worker batch remains the two recovery fixes; do not overlap or silently expand it.

Source evidence: numericExpressionRootAliasBinding5837+ checks propertyContext at the exact VALUE USE.
The old fixture shifts only the frame-x property context. Its two text-x uses, vw/vh/my/w values retain
independent valid bindings; they must not become eligible merely because frame-x is unavailable.
The old target-wide fallback flag and sample-first resolver bypassed this distinction. Recorded current
feedback shows those unaffected frame values still known; this is a source/test-contract conflict, not
a request to recreate that previous behavior. No new runtime claim is made by this read-only review.

Reconciled acceptance for that fixture:
- Unmodified source/model remains sample-free with exact frame x695/y540/width1920/height1080.
- Shift only frame-x binding context: only genuinely unbound use(s) enter the catalog, using the existing
 fallback display expression x and exact root source identity. Preserve the unsupported-root reason
 while unsampled. Supply x695 to restore frame-x; all unrelated geometry remains source-derived.
- Add a changed x sample (e.g.600) proving unrelated source-known text-x uses/profile dimensions/my/w
 remain unchanged and have no sample override. Do not require sampled geometry to match source truth.
- Preserve deduplication coverage in a separate explicit fixture that removes the exact property binding
 contexts for ALL three x uses. Those three eligible consumers share one root sample ID, line6, and must
 all receive695. Keep exact consumer/source/field checks, source/model preservation and evidence validity.
- Malformed my descriptor must remain unavailable with the original unsupported-node reason while a
 valid independent x sample still applies. Do not falsely require a not-applied my binding when my is
 no longer catalog-eligible. Separately attempt a forged/stale my sample ID and REQUIRE whole-input
 refusal before geometry, preserving the stronger existing foreign/static-ID policy. Test a malformed
 descriptor even WITHOUT extra-ID input so source rejection cannot pass solely because the ID is foreign.
- Keep existing check names when rewriting these expectations; add separate strengthened controls rather
 than delete tests. Retain reassignment/shadow/no-false-success/source-pinned controls unchanged.
All hypothetical counts must be confirmed by actual source-bound consumer identities in the run.

Remaining source-authority review (not this immediate patch): CallModel valueAtUse1479/evaluate1962
retain a boolean previewInputCandidate but overwrite sourceNode with the latest alias USE. addAlias4521
records only isRelevantBinding4560 values, excluding ordinary scalar aliases. Thus the new computed-root
positive does not prove runtimeWidth -> scalar alias -> numeric expression root capture/deduplication.
Preserve this as the next required bounded source repair; private original source plus deferred required
alias evidence and independent source reanalysis remain the approved design, not a global name lookup.

AAR addition: parent issued two invalid doc-patch contexts; apply_patch rejected both before mutation.
Readback confirmed no partial writes. Parent degradation checkpoint made20:10Z; next review uses fresh
context while the same Luna worker continues. No code/test changed by parent. Latest authoritative worker
compact0ae3e1fb-0d2b-4bf8-8493-1b26296c2945:11 is active/inProgress, not terminal. No test result yet.

### Downstream evidence integration preflight — 2026-09-11 20:15Z

Read-only parent review while the same recovery worker runs; no new owner release or runtime claim.
Scene761 factProvenanceLink emits one link and reads only sampleId. Updating factLinks1122 alone will
miss direct numeric font-size/border link sites2754/2756 and2823; expand every applicable known numeric
fact at the existing link-building boundary, keeping color/string/boolean shapes unchanged. Source,
expression, operation and sourcePin stay on each original-shaped single-sample link; no Paint schema.
Scene3347 validateFact currently reads selected own data values but does not close the scalar record's
extra keys; add explicit numeric-only plural validation, including unavailable/non-number rejection.
SourceEdits3960 structuralDescriptorFactIsValid independently allows only sourcePin/sampleId and will
reject plural facts. Its source-offset/data-property/canonical-color checks must remain independent.
Scene6030 requires an actually issued Layout program/evidence pair before geometry; do not bypass that
authority in new positives or label forged/unissued refusal as proof of contributor-specific validation.
Require producer-backed positives and independent public malformed/contributor negatives in each owner;
matching values copied into program and manifest are not independent evaluation evidence. Existing
Layout issue registry7432 already retains modelSnapshot; reuse its source authority for replay.
This refines the already-required downstream test matrix, not an additional subsystem or broader scope.
Worker compact18 remains active/inProgress. Parent clarified that scheduled pure serialized tests/static
gates are authorized; fresh clearance still blocks all browser/service/game/heavy state-touching work.

20:17Z manager checkpoint: worker remained active after11minutes with both allowed files byte-unchanged.
Parent redirected the SAME Plato handle using interrupt=true to implement the settled recovery patch now,
not reconstruct governance/source broadly. New turn01a0921e-214c-7640-ab06-9859255acdcf; compact20 confirms
active/inProgress. No replacement worker or overlapping runner. Report a concrete coupling if blocked;
otherwise patch, run scheduled pure gates serially, freeze. This is sequencing, not a scope/acceptance cut.

### Initial recovery patch review — 2026-09-11 20:27Z

PROGRESS: parent read the complete initial11212-character production diff and initial selftest delta.
At20:25:34Z only the2authorized owners differ among24inputs;22others unchanged. Read-time census and
review limits: recovery-baseline200348387Z/parent-initial-review.json. These are not final/run-start pins.
The patch propagates nested leaf gaps, retains unavailable root fact source, adds successful-root gap
proofs, aligns lexical ID sorting and removes the unused catalog local. Three new focused checks cover
leaf/root authority, injected unrelated range/category warnings and program/evidence ledger agreement.
No new passing result yet; full numeric/product acceptance remains open.

Parent finding sent to SAME worker: root-only proof/consumer containment misses an already-supported
local numeric alias whose initializer precedes its later call. HYPOTHESIS pending executed regression:
the alias-use warning can remain even when geometry resolves. Capture/prove exact value-use identity
alongside root identity, require genuine source-valid closed evaluation (not binding-loss fallback), and
add a source-parsed alias positive. Preserve unrelated warnings and original scalar cleanup controls.
Worker compact35 acknowledges the source/use distinction and is implementing the bounded correction.
Typecheck must also verify arithmetic narrowing after the unavailableOperand refactor. No unsafe casts
or expected-value weakening are authorized. Parent performed no Node run and did not edit source/tests.
AAR NON-CLEAN: fresh review required in-scope correction before acceptance; sustain exact source/use
distinctions and early complete-diff review. No capability-map delta or external/protected/Git writes.

## Recovery checkpoint reviewed — 2026-09-11

Status: PARTIAL overall; the immediate recovery acceptance criteria pass at source level. The required
Layout gate is still FAILED on the three explicitly unreleased fallback cases. No full numeric, UI,
packaged or native acceptance is claimed. Previous status turn was VERIFIED WAIT on the live Plato handle;
this turn is PROGRESS: complete recovery diff reviewed, final raw results parsed and exact census checked.

Changes are confined to Layout production/selftest. Nested failures now identify the missing input leaf
while the unavailable fact retains its root source. Successful closed computations clear only matching
numeric warnings, including a prior initializer alias and an already-supported non-descriptor numeric
member. Unrelated range/category warnings and both program/evidence ledgers remain covered. Numeric ID
sorting now matches the existing lexical schema. Source grammar and fallback policy were not expanded.

Parent evidence: recovery-baseline200348387Z/parent-layout-review-20260911T204026Z.json. Full path root:
test-results/b119-nested-numeric-inputs-recovery-baseline-20260911T200348387Z/.
All816previous names retained exactly once; both original recovery failures and five new checks pass.
The fifth control uses actual parsed runtimeState.width, a catalog-issued200, exact consumed warning
removal and valid evidence. It proves existing direct member cleanup, not the still-required general
nested member/index or scalar-root-alias authority matrix.

Required immediate gates (worker executed; parent inspected raw evidence, not another Node replay):
- CallModel139/139, exit0: test-results/b119-nested-numeric-inputs-recovery-callmodel-final.*.
- Configured Layout818/821, exit1,0skips,0nonboolean records: recovery-layout-final-20260911T203818409Z/.
  Actual execution20:38:18.415Z..20:38:53.787Z. Raw64676713bytes,
  SHA2568F43B44E90D39E8D5F920409424D52B6F2B761F00DB157612A13BDAE840D0750.
  The exact widget_fullscreen.lua hash and16977/16978expressions pass from the actual configured corpus.
- Final whole-project tsc exit0: recovery-tsc-final-20260911T203924094Z/tsc.receipt.json.
- Exact2owner strict ESLint exit0: recovery-lint-final-20260911T204026286Z/eslint.receipt.json.
- Exact2owner whitespace exit0: recovery-whitespace-final-20260911T204115298Z/diff-check.receipt.json.
  All directory abbreviations above are beneath test-results/b119-nested-numeric-inputs-.

Parent24input census20:40:26Z: only the2authorized owners differ;22others unchanged. Rechecked20:43:41Z:
- Layout.ts990F874F334533ED45791520FE0F8655EB39591D8EC77ECF8B8090186CE8FC40.
- Layout.selftest.ts0829E1D39C550E9CD8DDEEFDBFC414AD960B365B6BFE70C1DAA5CA61F6F0B762.
These are independent read-time hashes, not invented run-start pins. Recovery9snapshot baseline remains
the rollback reference; earlier source edits and all unrelated dirty files remain untouched. No Git action.

Next checkpoint remains the20:09Z explicit fallback reconciliation, not yet released. Current raw feedback
shows the filtered x catalog empty and frame-x unavailable even after the attempted empty-value sample;
do not call these merely obsolete expectations. Source4533 emits evidenceExpressionForValue for the
fallback catalog label whereas the retained contract uses the value-use label x with exact root-source ID.
Reconcile and repair catalog/display/lookup together with the specified no-known-override controls.
Preserve malformed-source rejection separately from extra-ID rejection and all-three-use dedup evidence.
Afterward the FULL numeric authority/dependency/downstream/public-corpus slice and scenario/history/UI
work remain mandatory. No capability-map delta; no external ledger or issue update at this checkpoint.

AAR NON-CLEAN:
- Sustain: complete two-owner review, retained historical names, independent JSON parsing and exact paths.
- Improve work: review required alias-use and non-descriptor numeric cleanup controls before acceptance.
- Improve tools: worker repeated wrapper parse errors, omitted the corpus root, then used a truncated root;
  an earlier final-named CallModel raw stream/receipt was overwritten. Initial and latest streams remain.
  Later runs use unique directories. Parent also attempted an unobserved lint receipt filename, then
  enumerated the actual eslint.receipt.json; no test rerun was used to repair that reporting read.
- Highest evidenced weakness: zero skipped:true records can conceal an unavailable pass:null corpus
  check. Require explicit boolean success for every required check, as well as exact root readback and
  raw streams. The corrected direct PowerShell invocation passed the source-backed check; do not nest
  command strings or shorten paths. Repeated operational errors triggered a freeze/fresh-worker checkpoint.
- Lessons banked here only; no global memory/skill/config writes. Overall status remains PARTIAL.

20:46Z lifecycle close: all scheduled gates had finished and parent review was recorded, but the worker
continued redundant freeze/report work. Parent interrupted that reporting turn, then CLOSED Plato;
close returned previous_status running and the subsequent native wait returned not_found. No timeout
was treated as terminal. No final worker narrative is used as acceptance. No live workers remain.
Final parent evidence: recovery-baseline200348387Z/parent-recovery-freeze.json. Handoff was overwritten
with current state and BACKLOG updated. Next coding batch remains SPECIFIED/unreleased, with fresh context.

## Parent scalar-root authority preflight — 2026-09-11 20:56Z

Read-only work concurrent with the separately released fallback worker Newton; not another owner release.
The fallback checkpoint has its short execution contract in2026-09-11-b119-numeric-fallback-reconciliation.md.
Graph explain valueAtUse confirms member/index/table-field/binding callers; current source below is authority.

Source facts: InternalValue778+ has sourceLiteralRoot but only a boolean previewInputCandidate. valueAtUse1479
preserves that flag yet not sourceNode; evaluate1959 then assigns the latest use node. numericExpressionForValue
1528 synthesizes the leaf from that latest Identifier. bindName4601 captures values through the existing lexical
binding map, but addAlias4521/isRelevantBinding4560 omit ordinary scalar input aliases. Layout5460+ validates
exact source AST/declaration and deliberately rejects an unproved local leaf. Changing only the leaf label
or loosening that local guard would therefore be wrong; retain exact original read and required alias evidence.

Next required acceptance example (NOT claimed executed): local input=runtimeWidth; local alias=input;
local width=math.floor((alias-24)/2). Both width and a second alias-based consumer must use ONE original
source-read sample, not independent input/alias/width overrides;200->88 and260->118. Another raw read at
a different range/scope must not be merged merely by name. A known200 through the same aliases remains88
with zero preview leaves. Preserve source use/root distinctions, caller binding and actual consumer IDs.

Private capture design must distinguish parameter DECLARATION from its first initializer READ: processFunction
creates parameter values directly with unknown(parameter), while evaluate assigns sourceNode at actual use.
Do not seed every occurrence from a shared declaration and accidentally merge unrelated read ranges.
Materialize only the deferred alias records needed by a numeric use, through the existing pending-record
ordering/alias source validation. Do not attach numeric descriptors to unrelated standalone text/boolean values.
LocalStatement5335 and AssignmentStatement5345 evaluate all initializers before binding their targets;
preserve simultaneous-initializer semantics. Control-flow snapshots/reassignment guards must remain intact.

Separate member/index gap: unknown1806 only marks Identifier candidates and Layout5467 only accepts identifier
leaves. Source-table deferred fields exist in tableFieldValueAtUse1751, but evaluateIndex2180's indexedValue
branch directly calls valueAtUse and bypasses that table-field authority path. Required baseline-supported
controls should include literal-table string/member and numeric-index scalar reads consumed inside arithmetic,
not claim arbitrary unresolved reference indexing is supported. Preserve mutation/escape/table identity guards.

These are source-observed couplings and unexecuted behavioral hypotheses, refining the existing full numeric
acceptance rather than narrowing it. No CallModel or other code/test changed by parent, no Node executed,
no capability-map delta. Next implementation still requires a fresh bounded release after fallback review.

### Additional member/index guard preflight — 2026-09-11 21:11Z

Graphify explain tableFieldValueAtUse locates both evaluateMember/evaluateIndex callers and the existing
numericExpressionForValue/valueAtUse path (graph line1690 is stale; current method is1751). Current source
shows numeric-index indexedValues takes the direct valueAtUse path, while string fields use the table-field
authority wrapper. Reuse that wrapper for supported literal numeric fields rather than add a second route.

[HYPOTHESIS requiring a negative test] Retaining an original preview root through aliases must not also
retain a usable candidate after a source table is mutated or escapes. Current tableFieldValueAtUse only
returns an explicit unavailable value for sourceTableUnavailable AND an already materialized numeric
expression; its other return carries the valueAtUse result. invalidateEscapedAuthorities1577-1582 marks
literal tables via fields with numericExpressionForValue(field,false), not deferred preview candidates or
numeric indexedValues. A new deferred root can therefore require coordinated invalidation at both seams.
Do not resolve this by indiscriminately attaching numeric descriptors to string/boolean values or by
weakening Layout's direct-source-leaf/local-declaration checks.

Required next controls: source literal member/string-index/numeric-index unknown scalar inside arithmetic;
same source input through a field then alias; known numeric field unchanged; field overwritten before use;
literal table passed to an opaque call before numeric use; alias/copy identity and separate ranges retained.
Expected unsupported/escaped cases remain unavailable, not source-known or sampleable by forged metadata.
This is an acceptance refinement of the existing remaining numeric scope, not a new worker release.

## Fallback prerequisite closed — 2026-09-11 21:21Z

The separate two-owner fallback checkpoint is VERIFIED at source scope. Final Layout824/824 and
CallModel139/139,tsc/exactlint/whitespace0; parent reviewed all821old names,3newcontrols, actual final-cell
geometry/model preservation and the entire diff. Newton completed and CLOSED/not_found. Evidence and
AAR:2026-09-11-b119-numeric-fallback-reconciliation.md and test-results/b119-numeric-fallback-baseline-
20260911T205035041Z/parent-final-review.json. Graph refreshed; post-graph24input hashes match the review.
The complete remaining scalar-root/member-index/dependency/downstream/public-corpus contract above
remains open. Scenario/history and full product experience/native obligations are unchanged; no new
coding batch released, no Git/release/protected/external write. Do not repeat the closed fallback repair.

## Downstream validator test seams reconciled — 2026-09-11 21:36Z

Parent source inspection while Mencius remains the sole live source-root worker. This is not a new
implementation release and does not claim a new runtime result. Scene and SourceEdits remain unchanged.
Baseline HEAD93c9af111d63ca77c99dee11f21882c4073bcda6; this plan was already untracked and handoff dirty.
Pre-edit plan SHA2E6E2671EB30F2EE8F1E278DD167443C29A3B726A839F63A8C6F76FEC8666396.

- Existing Scene5964 diagnoseX4UiSceneStructureForTest directly invokes validateProgramStructure.
  Reuse it for independent malformed numeric-fact tests; do not add another test-only export. Existing
  Scene selftest8962-9021 demonstrates a source-produced positive, exact hostile diagnostic stage and
  separate public refusal. A cloned pair refusing at public extractProgram6030 is ONLY issued-pair proof;
  it does not prove the independent fact validator inspected sampleIds. Require both layers explicitly.
- Existing SourceEdits5851 compareX4UiSourceStructuralLedgerCorrespondence is a public pure comparator
  over exact before/after source text, complete records and operation ledgers. Its structuralInvariant
  calls structuralProducerSchemaNodeIsValid and structuralDescriptorFactIsValid3960. Existing selftests
  roundFiveCompare/roundFiveCloneInput9179 and two-sided kernel mutations11799 provide reusable patterns.
  Require a passing legitimate baseline, mutation-applied assertion, false comparator and no throw/getter
  reads. Mutating both ledgers equally must not make malformed sampleIds pass. Comparator success alone
  does not establish public discover/apply authorization or a valid source-issued layout pair.
- Current SourceEdits known-fact schema allows only optional sourcePin/sampleId, so plural numeric facts
  need an independent closed-schema change there. Scene validateFact3347 currently reads own scalar data
  but has no plural-ID validation; its color schema3330 remains deliberately separate and unchanged.
  Keep the approved numeric-only 0/1/2..128 forms, dense plain canonical arrays, mutually exclusive fields,
  frozen positives, accessor/symbol/extra-key/cycle/over-limit negatives and nonnumeric controls.
- Shape checks alone cannot prove IDs are consumed. Layout source replay and source/target/operation/loop
  reciprocity must still reject foreign, omitted, extra or skipped-branch contributors, including coherent
  changes to both result and manifest. Scene's existing preview-loop reciprocity5060 validates catalog
  consumer/operation relationships, not plural fact dependency completeness; do not claim that it does.
- Scene759 factProvenanceLink and1127 factLinks need plural numeric expansion into EXISTING individual
  sampleId links, including direct numeric font/border sites2754/2756/2823. Preserve color/string/boolean
  fact schemas and Paint link schema. Prove actual resulting Scene links, not a standalone array helper.

Later execution remains: reviewed original-root close -> full contributor propagation/downstream release
with fresh owner baseline -> all six pure gates -> parent-reviewed real-byte public EditorSession/Scene/
Paint proof. The existing scenario/history, nine actual-interface journeys and native fidelity gates remain.
No capability-map delta. Rollback this documentation delta only; no source/Git/config/protected writes.
AAR: reconciliation removed the need to invent diagnostic APIs and exposed an oracle trap: public pair
refusal can conceal a permissive independent validator. Sustain source-produced positives plus targeted
diagnostics and public refusal; require two-sided malformed-ledger controls. No new runtime defect claimed.
Tool trigger: first two-file documentation patch refused a mismatched handoff context; readback confirmed
neither file changed. Use exact observed anchors in separate patches; no rollback or source change needed.
Readback validation: both edited documents have zero trailing-whitespace lines and no conflict markers;
current Mencius assignment and full nine-journey scope are present. Tracked handoff diff--check exited0.
Scene/SourceEdits hashes remain EC70C87493149A8C19FA345521EAE459BAD2E7CB6F90E2F49E564A9F80504354
and669B841EABEDF2C9C97B4032C329F104241A7B312E700282A079BFE1F4CB02A5. Parent ran no Node.
Further tool trigger: combined output and read_thread item limits still exceeded total output budget.
Do not print raw read_thread responses; store/parse and emit only selected latest items. Parent called a
degradation checkpoint; worker remains authoritatively live, not restarted or declared stopped.

## Original-root prerequisite closed — 2026-09-11 final checkpoint

The original-root source unit is now VERIFIED, not still assigned. Mencius completed, was CLOSED and
native wait returned not_found. Final parent evidence and exact4hashes:
test-results/b119-scalar-root-baseline-20260911T212356911Z/parent-final-review.json.
CallModel148/148,configured Layout872/872,all139/824historical names once/green,post-final-byte tsc/exact4
lint/whitespace0. Complete reviewed deltas; post-graph24input census4owners changed/20nonowners same.
Source capability delta: original scalar/table/member/parameter roots, captured-table identity and
independent root/child/catalog rejection are now supported and evidenced. Source diagnostics may retain
rejected expressions; they must not authorize sampled geometry or invalid catalog consumers.

THIS FULL NUMERIC PLAN REMAINS PARTIAL. Next is its existing full contributor propagation/downstream
scope, with a fresh exact-owner baseline and bounded native Luna assignment. Do not repeat the completed
root/fallback/automatic-height units or replace the existing Scene diagnostic/SourceEdits comparator.
All6pure gates and the real ABC/DDS public EditorSession->Layout->Scene/Paint proof still remain required.
Scenarios/history, all9actual-interface journeys and3menu/12reference fidelity obligations are unchanged.
No current worker or Node process from the completed unit remains. Graph session37025 completed exit0.
