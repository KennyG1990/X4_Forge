# B119 original numeric input roots — execution plan

> For the executor: requirements and architecture are already approved in the parent numeric plan.
> Use planning/brainstorming only if a genuinely missing design choice is discovered; do not restart product design.

Date: 2026-09-11. Lane: FULL. Status: VERIFIED for this source-root unit; the full canvas-first goal remains ACTIVE/PARTIAL. Final parent receipt and close are at the end of this plan.
Goal: source-supported numeric calculations consume the original preview inputs through scalar aliases and
eligible member/index reads, so the author does not manually calculate intermediate values.
Architecture: extend existing CallModel private provenance and alias records, Layout source AST/binding
validation, closed numeric evaluator and sample catalog. No second interpreter, format, store or renderer.
Tech stack: TypeScript, existing luaparse AST, shipped X4 source-backed projection, existing selftests.
Parent: F:/DEV_ENV/X4_Forge/docs/plans/2026-09-11-b119-nested-numeric-preview-inputs.md.
This closes its remaining source-root portion only; full dependencies/downstream/product scope stays open.

## PLAN / RECONCILE

Previous goal turn PROGRESS: fallback repaired and reviewed; Layout824/824,CallModel139/139,tsc/lint0.
Read full goal, original brief, current handoff/backlog, parent contract and20:56Z/21:11Z preflights.
Capability-map756-810 and complete ADR-F1..F5 reaffirm source/CAS/immutable identity/artifact boundaries.
Agent-brain recall returned only an older July reference-API note; inspected text has no numeric input,
scalar alias, preview-input or B119 matches. Weak retrieval is not evidence of an existing implementation.
No capability-map delta until new behavior is verified.

The approved alternative to intermediate-value overrides is original-source capture in the existing pipeline.
A second evaluator/DSL would split source authority. Replacing the pipeline is not justified by the observed
test-oracle and missing-provenance defects; extend its exact source/reassignment protections.

Current source facts (line numbers are navigation, inspect the actual code):
- CallModel InternalValue778 holds sourceLiteralRoot but only boolean previewInputCandidate.
  valueAtUse1479 drops sourceNode; evaluate1959 resets it to the latest use. Numeric leaf construction1530
  therefore sees the alias use rather than original read. addAlias4521/isRelevantBinding4560 skip ordinary
  scalar bindings. Retain the original READ and materialize only needed alias records through existing
  pending ordering. A parameter declaration is not its initializer read. Preserve lexical shadowing and
  LocalStatement/AssignmentStatement simultaneous initializer evaluation.
- tableFieldValueAtUse1751 already wraps literal-table member/string-index provenance. Numeric indexedValues
  in evaluateIndex2180 directly returns valueAtUse and misses that path. Existing table-field AST matching
  must also distinguish explicit numeric keys and implicit positional TableValue entries correctly.
- Deferred candidates must not survive mutation/escape as usable roots. Current escape detection1577
  inspects fields with numericExpressionForValue(field,false), not deferred inputs/indexedValues.
  Current sourceTableUnavailable branch only explicitly refuses already-materialized numeric expressions.
  Repair coordinated invalidation if required; keep known/source-table protections and safe-helper policy.
- Existing direct runtimeState.width numeric sampling is supported and has a retained passing regression;
  current preview-input leaf construction/validation only accepts Identifier. Support this already-eligible
  member in arithmetic using independent source proof. Do not assume arbitrary unresolved reference indexing
  is eligible: existing isSampleableValue rejects references, tables, functions, opaque numeric calls and
  C/Helper expressions. Establish each index form from actual model/source, not its spelling alone.
- Layout numericExpressionPreviewInputError5462 and nodeMatches2536 require exact source AST. Preserve
  independent eligibility/binding validation. The parent design permits fresh buildX4UiCallModel analysis
  of the original exact file as source authority; it may not trust caller-edited descriptors/status flags.
  Keep all current source-order/reassignment/context/parameter/loop/instance and math-authority guards.

## BASELINE / OWNERS / RECOVERY

Workspace: F:/DEV_ENV/X4_Forge. HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, branchmain.
All24current inputs match the reviewed fallback+graph close. Four owner byte-equal snapshots:
F:/DEV_ENV/X4_Forge/test-results/b119-scalar-root-baseline-20260911T212356911Z/baseline.json.
All four files were already dirty; preserve their existing content and every unrelated change.
Rollback only this unit's reviewed delta against its snapshots; no Git restore/reset/commit/push.

ONE native gpt-5.6-luna/max, no descendants, owns ONLY:
- F:/DEV_ENV/X4_Forge/src/lib/x4UiCallModel.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiCallModel.selftest.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.selftest.ts

All other source/tests/docs/graph/corpus/config/mod files read-only to worker. New evidence only at unique
test-results/b119-scalar-root-* paths; never overwrite prior logs or baseline snapshots.
Parent reviews downstream dependency and scenario boundaries read-only, then the complete diff/results;
parent does not run Node while this worker owns execution.

## TASK 1 — Source-parsed regressions before implementation

Use existing input/profile/projection/sample/evidence helpers. No new standalone harness.
Add distinct checks (avoid one giant conjunction hiding unrelated absence), then run CallModel and Layout
serially to prove which new cases fail before implementation. Do not rerun an unchanged baseline.
Keep all139CallModel and824Layout existing names/assertions; known source-policy conflicts require parent
reconciliation before changing prior tests. A new assertion may not be satisfied solely by missing entries.

Required behavior:
1. local input=runtimeWidth; local alias=input; local width=math.floor((alias-24)/2), consumed by a table
   plus a second alias-based numeric consumer: exactly ONE original runtimeWidth read entry,200->88,
   260->118. No input/alias/width or compound overrides. Exact consumer/source/root IDs and valid evidence.
2. Repeat the same spelling in another source range/scope: distinct original reads remain distinct.
   Known200 through identical aliases yields88 with ZERO preview-input leaves/entries of any name.
3. Literal-table member, string-key index, explicit numeric key and implicit positional index carrying
   the original unknown scalar, then arithmetic/alias use, preserve root source and expected calculation.
   Include field-to-alias chain, table alias/copy identity, and known numeric field controls.
4. Already-eligible direct runtime member (runtimeState.width) inside arithmetic resolves88/118 from
   its exact one member-read input, without numeric execution or whole-expression overrides.
   Other index forms must be proven eligible from source/model; report concrete unsupported authority,
   not silently accept references or claim this test covers arbitrary runtime indexing.
5. Parameters retain exact declaration/caller/instance authority. Existing literal200 caller->88 and
   runtime caller200/260->88/118 remain green; add scalar-alias parameter read/second-consumer coverage.
   Distinct invocation/read ranges must not collapse into one declaration-only sample.
6. Original Lua/model snapshots are captured BEFORE the first projection and compared afterward.
   Direct and member dynamic string/boolean semantics and their real catalog values remain supported
   without indiscriminate numeric metadata.

Negative cases must retain rejection/unavailable and cannot become source-known or accepted via forged data:
- Reassigned/shadowed aliases, stale/foreign root/source/operand order and known-value-as-input forgery.
- Field overwritten before numeric use; literal source table escaped to an opaque call; table alias
  mutation and numeric-index mutation. No stale original leaf may authorize a changed field.
- C/Helper/math/global-authority objects, tables/functions/references and opaque numeric calls as leaves.
- Existing wrong-type/nonfinite/divide-zero, missing input and numeric-or-zero/skip behavior preserved.
- Forged source/alias/declaration/binding/loop evidence cannot become valid by changing both model labels
  and the purported result. Use source-parsed actual authority, not fabricated unknown status.

## TASK 2 — Implement the settled source-authority design

Private original-read capture survives lexical aliases but is created at the first actual expression read,
not all parameter declarations. Reuse required alias records with exact initializer/declaration/scope;
do not emit unrelated scalar aliases or numeric descriptors for all strings/booleans.
Reuse table-field authority for supported fields/indexes and carry/clear it correctly through aliases,
writes and escapes. Handle source identity before broadening descriptor matching.
Extend independent Layout source eligibility/structure proof only for forms this contract authorizes.
Keep the existing closed numeric grammar, sample IDs/canonical ordering, fallback policy and model/evidence
authority. No schema widening beyond existing preview-input source forms or new public mutable environment.
If a required case needs another owner or an unapproved authority policy, STOP and report exact source evidence.
Expected fail-first failures are part of this batch; unexpected existing regressions or ambiguous contracts
require parent review, not weakened oracles or a different product end state.

## TASK 3 — Serial verification, freeze and parent review

Authorized pure gates, DIRECT PowerShell invocation with bundled Node:
C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
- --no-warnings --import tsx src/lib/x4UiCallModel.selftest.ts
- --no-warnings --import tsx src/lib/x4UiLayoutProgram.selftest.ts
- node_modules/typescript/bin/tsc --noEmit
- node_modules/eslint/bin/eslint.js <exact4owners> --max-warnings 0
- git diff --check -- <exact4owners>

Before Layout set process-local X4_REFERENCE_ROOT to exactly
F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00 and Test-Path its ui/widget/lua/widget_fullscreen.lua.
No nested cmd/pwsh/string-built executable commands. If setup fails simplify once; second setup failure
means stop/report. No reruns solely to fix receipt formatting. Capture each actual command, UTC start/end,
exit, unique raw stdout/stderr, compact boolean/name counts. Parse large JSON, never dump it.
All required records explicit pass:true,0skips/unavailable/nonboolean. Preserve every old name once.
Final assertions must inspect final geometry owners, not intermediate unavailable operation placeholders.
After gates freeze4hashes and return concise changed paths/results/remaining limitations; STOP for parent.
Do not duplicate parent's24input census, rewrite docs, start a later batch, or loop on final reporting.
Reviewctl/BlastRadius unavailable: parent full-diff/source and strict raw-result review is the fallback.

## FULL GOAL / AUTHORIZATION / AAR

This source portion is not the complete numeric slice: full minRowHeight/y/scaling and text-height
contributors, independent Scene/SourceEdits validation, all6pure gates and accepted actual-corpus public
EditorSession->Layout->nonemptyScene/Paint probe remain required. Numeric sampleIds membership, shape,
actually-consumed dependencies and source/instance authority may not be waived by this checkpoint.
Scenario persistence/history/recovery and all9actual-interface journeys, full E2E/precommit/package/install/
native and three-menu/twelve-reference fidelity remain mandatory. Samples still need friendly primary UI.
No browser/fullSourceEditor/Chromium/service/E2E/build/package/native work before fresh machine clearance.
Pure serial tests/static gates are already authorized; do not ask again. No Git/publish, real mod/game/
save/install/reload/config, external issue/wiki/memory/skill writes.0.0.78 immutable.
No new spend/network/delete/permission/security surface. No policy bypass or external dependencies.

Close requires explicit per-requirement evidence, parent full review, exact four-owner/24input freeze,
local plan/backlog/roadmap/handoff update and AAR. Suggested commit when eligible:
feat(ui): preserve original numeric preview inputs through source aliases.
AAR baseline NON-CLEAN from prerequisite review: intermediate/absent facts can make tests falsely green.
Sustain exact final-owner geometry and pre-projection snapshots. Highest current evidenced risk is losing
or inventing source authority through alias/member/escape paths. Use independent source proof and explicit
negative controls. Bank task lessons locally only; no global-memory/skill write.

Dispatch21:27Z: native gpt-5.6-luna/max Mencius01a0925d-e4bb-7de0-bb56-49ee549d5135,
fork_context=false,no descendants,SOLE Node runner. Initial compactdd815ff6-ce5c-40ec-8d1c-b87c4606e054:1
confirms active/inProgress. Parent has no Node runner. No new implementation result claimed at release.

## Early parent test review — 2026-09-11 21:44Z

Mencius remains active, initial CallModel test delta208lines observed at SHA
4791BDAD9332389741814D001CD561E216724644D2F3D1A7102FB95628F69EDF.
No raw test result yet; production and Layout selftest had not changed at this read. This is not a close.
Full delta compared with x4UiCallModel.selftest.ts.snapshot, not against unrelated dirty HEAD changes.
Parent requested changes via same-worker submission01a0926d-de99-7862-8437-0b153a6d93bf:
- [REPRODUCED by assertion inspection] The escaped-width assertion accepts undefined because optional
  numericExpression is undefined and optional status is not static. Require an actual width value with
  the expected unavailable/unknown semantics before asserting no usable numeric descriptor.
- Known-value controls only exclude a preview leaf named runtimeWidth. They must exclude ALL preview
  leaves, including wrongly named alias/intermediate inputs; use the existing recursive predicate.
- Separate member/string/numeric/implicit-index named checks so a red case cannot hide the other forms.
These corrections enforce the original contract; expected new fail-first failures remain authorized and
the worker does not need another release to implement. No extra owner or authority was granted.
AAR trigger: parent review found vacuous negative controls before their first reported run. Sustain
positive existence guards and total dependency-absence checks; inspect failure oracles, not only positives.

## First raw results and fixture correction — 2026-09-11 21:51Z

CallModel fail-first run: test-results/b119-scalar-root-fail-first-callmodel-20260911T214528724Z/.
Parent independently parsed raw stdout:140/148,8false,0nonboolean; all139old checks remain once and pass.
Raw SHA951D40A3C95F9885AD0EF13878EC081D473EBE6C1038ADD7FFD41EBD9EDF13D0.
Structured independent review: same directory parent-review.json. Seven failures demonstrate missing
original scalar/member/index authority; the escaped-table case is a wrong new oracle, not a production
failure: actual width is present/dynamic, expression width, no value/descriptor. valueAtUse1479 deliberately
uses the final read's spelling. Parent required correcting the test, not changing production to emit
the inner tableAlias.width spelling. The previous existence/zero-all-leaves/per-index corrections landed.

Parent also reviewed the complete initial415-line Layout test delta. Geometry scenarios and snapshots
captured before first projection are present. Full evidence-pair assertions, entirely empty known-only
catalogs and both singular/plural dependency absence, plus new-root mutation/forgery negatives remain
required before the unit closes; sent to the same worker without broadening owners or operators.

First Layout run214914142Z exited1 on namedTarget before producing check JSON. Configured complete corpus
root/widget existence were confirmed; receipt0checks/nullfailedname is NOT a test pass/fail census.
[REPRODUCED source/test mismatch] namedTarget179 matches candidate.name exactly; contextName1478 and
catalog1512 preserve qualified names. Four new selectors used display/secondary for menu.display/
menu.secondary. Parent interrupted before the retry; current readback confirms all four corrected.
The local function display parameter fixture remains unqualified. The worker's initial same-line-end
explanation was withdrawn; it was not a demonstrated Lua parse failure. Keep the original raw streams.
Worker remains active in turn01a09273-c0eb-7592-8704-0f0c97df350e, same agent, not a replacement.
Next: inspect the corrected Layout fail-first run and complete missing required controls, then implement
the full original-root contract and serial gates. No source-root close or product acceptance claimed.
AAR NON-CLEAN: expected new missing-capability failures are distinct from wrong source-use assertions and
target-name setup mistakes. Sustain exact catalog names and raw-data review before changing production.
Parent doc-check command with an invalid foreach pipeline failed without writes; simplified exact-path
diff/regex checks succeeded. Three changed docs have no whitespace/conflict markers; no parent Node ran.

## Required test-only checkpoint — 2026-09-11 21:57Z

Corrected Layout fail-first215404126Z:835/859,24false,0skips/nonboolean. Parent independently parsed the
64,805,920-byte raw stream; all824old names remain once and pass. SHA
F06BC583F433E309C1C539211FA7742577BE2344383BD4274A57F6052F03A57A.
Evidence: test-results/b119-scalar-root-fail-first-layout-20260911T215404126Z/parent-review.json.
Known-only catalogs are empty, but expected88 is unavailable because numeric operands escape/reorder
source ranges. This is required original-alias validation work, not a reason to discard known controls.

Parent found new forgery controls unsound: they project without samples, so the valid baseline is already
unavailable. Not-known alone cannot prove corruption rejection. Require a valid sampled positive and
counted mutation of the actual original input leaf/outer source/operand/binding, then an authoritative
refusal or an existing unavailable target fact for the corruption reason. Missing operations cannot pass
through optional ?.status checks. Do not require non-refusal when a valid fail-closed refusal is stronger.

Mutation negatives currently contain a fresh final-use width fallback, not the stale runtimeWidth leaf.
Their empty-catalog oracle requires reconciliation with the explicitly preserved existing fallback policy.
Prove no old sample/forged original root can authorize the changed field; do not suppress independently
allowed final-use fallback behavior solely to obtain an empty catalog. This is not permission to weaken
source/table escape or mutation validation. Parent review must resolve the exact expected policy first.

RELEASE CHANGE communicated via01a09278-0e8f-7481-b28e-5ca9e9459436 and01a09279-7d59-7be2-9a4f-184dbf501824:
same worker finishes the current raw run, corrects failure oracles, freezes two selftest hashes and STOPS
BEFORE PRODUCTION. Earlier whole-unit execution permission is paused at this test checkpoint. Repeated
oracle/setup mistakes require lead review under executing-plans. Full implementation scope/acceptance is
unchanged and remains required after explicit parent release; no goal completion or blocker claimed.

## Parent checkpoint acceptance and production re-release — 2026-09-11 22:11Z

Full current test deltas reviewed against the four-owner baseline: CallModel251 added lines and
Layout819 added lines. Re-read diffs are identical to the reviewed copies. Parent24input census at
22:11:09Z finds only the two test owners changed;22inputs, including both production owners, are unchanged.
Frozen tests match the actual test-only-checkpoint-20260911T221005467Z/receipt.json:
- CallModel.selftest C72534BEE5496F53E7F7FBA0C326BEA10CD3AD19C91E0B102F23FB90C57907DE.
- Layout.selftest C39169D02FDBA594EBB57A50795400DD064A196D16A8A1651719A0C8AAE43C0E.
Parent read the actual static receipts and checked all six raw streams are empty:
- tsc: b119-scalar-root-static-tsc-20260911T220757797Z, exit0.
- CallModel lint: b119-scalar-root-static-eslint-callmodel-20260911T220853389Z, exit0.
- Layout lint: b119-scalar-root-static-eslint-layout-20260911T220915172Z, exit0.
Paths are under test-results. First tsc220548325Z has real test-typing errors in stdout, and its receipt
is null following a wrapper failure; do not call that run passed or invent its lost exit metadata.
Earlier behavioral counts predate final test corrections: they establish fail-first history, not current
green/red totals. In particular, one of the eight first CallModel failures was a wrong new oracle.

Acceptance refinements required during implementation, not another test-only hold:
1. Preserve existing eligible final-use preview fallback after mutation. A missing old runtimeWidth leaf,
   entry and consumer is required; blanket empty catalogs are not. A fresh fallback must have exact final
   source/use authority and remain preview-only. Old samples cannot control the changed field. Foreign
   whole-input rejection alone is not mutation-specific proof: include a current-identity stale-leaf or
   forged-old-root negative beside a valid current-identity control.
2. The do-block shadow fixture has a still-valid OUTER alias after the block. Its test must not demand
   disappearance of runtimeWidth merely because an INNER local shares the name. Prove no inner otherWidth
   root controls the outer consumer. Correct independently proved outer-root geometry is acceptable;
   existing conservative unavailability is acceptable only with a present fact and no stale/inner-root
   acceptance. This does not authorize binding by spelling or weakening lexical source guards.
3. Do not overconstrain required alias-record implementation. The current CallModel test demands every
   input/alias record has no numericExpression, but the contract forbids indiscriminate metadata on
   ordinary string/boolean values, not numeric-only records materialized when actually consumed.
   Permit source-exact numeric descriptors on those needed record copies if that reuses the existing
   independent alias validator; keep semantic string/boolean controls and zero known-value preview leaves.

Source reconciliation: numericExpressionForValue1528 preserves the original numeric literal range;
exactNumericExpressionAliasBinding2401 currently accepts only alias records with an equal descriptor.
Thus known200 through a scalar alias can fail binary containment2817 despite an empty input catalog.
Extend those existing source/alias owners with exact initializer/scope/order/write proof; do not remove
containment checks or accept caller-edited labels as authority. Table-field child roots outside the
constructor and string/numeric/positional keys need the same independent source bridge, not broad regex
or range relaxations. Existing source reparsing is the authority. No new interpreter or schema owner.

RELEASE: same native Luna/max Mencius may now edit the original four owners, finish these bounded test
corrections, implement TASK2, then run TASK3 serial gates and freeze/STOP for parent review. No new worker,
descendant, Node runner, browser, service, E2E, build, package or protected/external write is authorized.
Full nested numeric/downstream/scenario/history/UX/native/fidelity scope remains mandatory and PARTIAL.

AAR NON-CLEAN: oracle and typing repairs were required. Sustain whole-diff test review and raw receipts.
Improve: negative tests must distinguish wrong-source authority from generic foreign-input refusal, and
must not turn implementation details into product requirements. Highest evidenced risk remains false
confidence from negatives whose baseline already fails. These corrections stay in this local record.

## In-flight production review — 2026-09-11 22:27:54Z

Same worker active in implementation turn01a09287-eb76-71a2-b3fd-5375036ff3e6. Initial production delta
adds private deferred alias records and materializes numeric aliases on consumption. No gate has run yet.
Parent observed a cross-feature invariant change: valueAtUse copies sourceNode and evaluate sets it only
if absent. That field is the exact current-use AST and colorExpression also reads it to issue source/alias
evidence. WIP read-time CallModel SHA6D1FA9ACB0672E29A66F6D6C207FF62A40E402782143BFDF9BC59ED1FF8E769F.
The invariant change is source-observed; a resulting color runtime/test failure is HYPOTHESIS, not reproduced.
Parent submission01a09295-9ef5-77b0-b6b9-2c22edf13117 requires a separate private numeric original-read
slot, preserving sourceNode's existing current-use meaning and parameter declaration/read distinction.
This is the already-approved private provenance architecture, not a new owner/feature or production hold.
Existing color-alias source checks remain required; add a precise location regression if they do not cover
this distinction. Worker continues implementation and original serial gates. No parent Node/UI test ran.
AAR: review caught a numeric-only repair reaching a shared source field. Sustain explicit consumer
enumeration before repurposing metadata; preserve old semantic owners instead of adjusting their tests.

Following WIP read restores sourceNode to the exact use and adds private numericSourceNode for original
reads. Existing selftest595 already asserts the precise validAlias color use and the literalEvidence
helper checks declaration/use separately; parent confirmed no duplicate test is required for this concern.
This is a source-review observation, not a passing regression result. Same worker remains live at compact59;
all original implementation, serial validation and final parent-review requirements remain open.

## First production CallModel green — 2026-09-11 22:37:04 UTC

Parent independently parsed all three raw CallModel runs, not their receipt summaries:
222754383Z141/148 exit1;222911053Z145/148 exit1;223021015Z148/148 exit0.
All139historical names retained once in every run,0nonboolean; final all148 checks pass. First raw run
reproduces the color-source regression identified in review; later green retains the existing exact-use
color tests. First worker receipt incorrectly reports148nonboolean failures; raw141/148 is authoritative.
Original receipt/raw remain untouched; independent correction and hashes are in the final run directory's
parent-review.json. No rerun was performed to repair bookkeeping.
Current baseline-relative CallModel test diff adds262lines with no removed baseline lines. The approved
optional lazy alias-record descriptor refinement checks the exact original runtimeWidth leaf; it does
not remove historical assertions. This is an in-flight result, not a final source freeze or unit close.
Layout source validation and all final gates remain required; no UI/native proof or completion claim.

Evidence-path correction: the worker's final prose used221005500Z (its internal command start time),
but the actual test-only checkpoint directory is221005467Z. Parent read its raw hash list and receipt;
both reviewed frozen hashes match. Links corrected to the existing directory; no artifact rewritten.
AAR: treat raw boolean checks and actual artifact paths as authority. The first summary schema mismatch
and wrong narrated directory are tooling/reporting errors, distinct from the reproduced code failures.

## Parent Layout regression review — 2026-09-11 22:47:39 UTC

Previous goal turn: verified wait/status response; same worker authoritatively active. This turn PROGRESS:
independent raw-result census and a concrete shared-validator scope defect sent to the same worker.
Both configured Layout raw streams preserve all824old names once, with0nonboolean and empty stderr:
- implementation-layout-20260911T223501701Z:850/863,13false,exit1;2historical failures.
  SHA7722321A44DC4E991388D95C3AC6510BD3FD03B1F55D254592DDD926FF969D5B.
- implementation-layout-20260911T224324551Z:810/863,53false,exit1;38historical failures.
  SHAA5B337C2D24FE4C962913379C184EEB01E0261E10E10462B08FE83FF1100B4E7.
Directories are under test-results and retain original receipt/stdout.raw.txt/stderr.raw.txt.

[REPRODUCED source-scope defect; matching runtime refusal observed] numericExpressionHasExactAlias
was declared inside numericExpressionStructureError, while numericExpressionError called it outside that
lexical scope. Its catch returned "numeric expression descriptor could not be safely inspected", exactly
as the failed frame-x raw fact reports. Parent submission01a092a6-f423-73c0-a705-a4d26cf348db identified
the actual declarations/callers and requested the minimal scope repair, not changed geometry oracles.
Worker compact68 confirms the helper moved to module scope with explicit model argument and tsc running.
That commentary is not a passing gate. Same live worker continues; no second Node runner or restart.

Parent also identified the table-field matching conjunction requiring original-leaf range equality with
the constructor initializer before its existing alias-aware nodeMatches proof. That excludes the required
runtimeWidth -> input -> {width=input} case. Submission01a092a7-839e-7ce1-a947-34bae34a9a3d requires exact
alias/source proof as an alternative, retaining constructor/key uniqueness, scope/order/write validation.
No blanket containment relaxation or removal of the independent whole-expression AST walk is authorized.

Graphify query used existing vocabulary numeric/expression/alias/binding/source/layout; returned broad
Binding/CallModel pointers only, not evidence about the latest patch. Graph predates current worker writes;
no graph rebuild or saved-answer mutation performed. Full current production deltas read against baseline
snapshots. Final reread/freeze, all source gates and the complete product acceptance remain required.
AAR NON-CLEAN: source-scope regression and an oversized combined instruction read required correction.
Sustain bounded reads and static checking before expensive behavioral reruns after shared helper changes.
Highest evidenced risk is fail-closed exception handling concealing programmer errors as unsupported input;
the current bounded countermeasure is preserving known-positive regressions plus whole-project tsc.

### Regression recovery evidence — 2026-09-11 22:52:36 UTC

Configured Layout225100704Z now857/863,6false,0nonboolean; all824historical names retained once and pass.
Parent independently parsed raw stdout and compared old names. Evidence and exact hash:
test-results/b119-scalar-root-implementation-layout-20260911T225100704Z/parent-review.json.
The two earlier historical table failures are recovered; full source unit is still NOT VERIFIED.
Third prior run224611602Z remained810/863. Tsc224733097Z exited2 on unknown AST base argument typing;
corrected tsc224851193Z exited0 with empty stdout (receipt also records empty stderr).

Remaining four table-form geometry cases still fail exact AST validation. Reassignment's new test compares
consumer final-call source against computed-root fact source; parent requires exact call-argument source
and sampled88 proof. Shadowed outer root remains catalogued but fails containment; inspect declaration
identity rather than treating every same-name local in one function as a reassignment. Current-identity
mutation positive/negative controls remain mandatory. Parent feedback01a092ac-385c-7143-a7d6-3ae65916a15b.
Capture-order hypothesis sent01a092ab-4778-7e20-b92b-2d45d2652221: recursively resolving table aliases must
use each initializer capture point, while shared-table mutation authority remains checked through use.
This is within the existing alias/capture contract, not a new evaluator or added owner.

Parent24input read22:52:36Z: exactly4assigned owners changed,20unchanged. Not a final freeze. Full-diff
review, required test refinements, final serial gates and all downstream/product obligations remain open.
Same worker active; no parent Node/browser, protected writes, release or Git mutation.

### Remaining field-alias source capture — 2026-09-11 22:55:13 UTC

Parent source review locates the four remaining table-form failures upstream: the deferred table-field
candidate retains base/property/constructor/field but not its exact original member/index read. Later
numericExpressionForValue constructs a table-field descriptor using the alias use's public location and
expression (for example memberInput), which correctly fails member/index AST matching. Its branch also
returns without materializing the required deferred numeric alias records. Parent submission
01a092ae-a04d-70b3-b8d9-396c62f6ed3a requests private original-field-read capture and source-exact alias
materialization. Keep Layout's exact AST check and sourceNode current-use meaning. This is a source review
finding consistent with the failed raw geometry, not a newly passing result. Final CallModel gate must
rerun after this production change. Same four-owner batch remains active; no additional worker/runner.

## Continuation review — 2026-09-11 23:04:35 UTC

Previous goal turn PROGRESS: recovered historical Layout checks, independent evidence and source fixes.
Current parent read confirms private tableFieldPreviewCandidate.readNode now preserves the exact original
member/index read; numericExpressionForValue uses it and materializes the deferred field-alias chain.
Layout now distinguishes later bindings by declarationOwner and checks recursive table writes at each
useRange capture point. These are reviewed source changes, not new green behavioral results. Last full
Layout remains225100704Z857/863; previous tsc predates these additional changes and is not final proof.

[HYPOTHESIS requiring the already-planned known-value-as-input negative] Existing selftest8024 attacks
a whole numeric root; it does not prove an embedded alias cannot be relabelled with another valid read
from the SAME unchanged source. nodeMatchesExactAlias uses model alias descriptors plus initializer
location evidence; a matching descriptor alone is not independent proof of initializer derivation.
Parent submission01a092b1-c58e-7bf1-9b2f-88e954e803c3 requires a valid known200->88 control and counted
same-file child/alias substitution, deriving current-identity samples if the altered catalog is available.
The result must refuse or retain an actual unavailable fact, never override the known source constant.
Only a reproduced failure warrants a source repair. No new grammar, owner or acceptance narrowing.

Same worker's first diagnostic returned empty aliases/refused; its corrected diagnostic has the expected
menu.display target and knownInput literal descriptor. The invalid baseline is not rejection proof.
Consolidated finish checklist sent01a092b7-34f1-7932-91a8-7feff9f5b21d: original field capture; lexical
shadow/capture behavior; corrected consumer-use oracle; current-identity mutation controls; known-child
forgery. Then all original serial gates, four hashes and STOP for parent. No further batch is released.
Current4read-time hashes (not final or run-start pins): CallModel72F9CC0DD51B8522E154FA75E53E49742A6D7E879A23A3C23886E59D14D658E9;
Layout35C8BE1F957516DA5016AC6B90994042403A83C461CE568145F02B8B30B9A15D;
CallModelTest3A339BB24799FF77F29A16577A163927868B3515DF90CEB552061B9464BBF4FB;
LayoutTest5851DD1956FBC5960756C374A81C4B3102D58240F582D62C804421E806D27BED.
AAR: source review separates whole-root validation from child-alias derivation; preserve valid controls
and current source identity for negative tests. Full numeric/downstream/scenario/UX/native scope stays open.

### Child-alias review checkpoint — 2026-09-11 23:10:07 UTC

Same live worker added numericExpressionAliasDescriptorHasExactSourceLineage to connect each numeric
child alias to its actual initializer. Parent requires exact resolved declarationOwner at both each
predecessor hop and nodeMatchesExactAlias's actual use; scope ancestry alone does not exclude a nearer
shadowing declaration. Keep NUMERIC_EXPRESSION_ALIAS_MAX_HOPS in the new recursion. Feedback
01a092ba-630d-7140-b489-112173737e95 stays within the existing lexical/forged-binding acceptance.

No raw pre-fix child-forgery result has been inspected yet, so the suspected false acceptance remains
HYPOTHESIS, not REPRODUCED. Parent checkpoint01a092bc-462f-7f31-a6e9-7b4d91d32764 asks the worker to
identify actual reproduction evidence or finish the behavioral test before further production changes.
If necessary it may snapshot its exact current owner, temporarily remove ONLY the new lineage gate to
run that same test against pre-fix behavior, restore it and rerun. This is bounded proof/recovery inside
the four-owner unit, not an authorized production weakening. Do not interrupt such a diagnostic merely
because the gate is briefly absent; the same live worker owns it. Final frozen source must retain the
validated proof and all old tests. No new full gate result or unit close has been claimed.

### Parent degradation checkpoint — 2026-09-11 23:12:10 UTC

Parent stops broad inspection for this turn; same live worker continues its bounded finish checklist.
An output-inspection mistake applied Object.keys to a stored STRING diff and emitted character indices,
producing oversized output. No source/permission/machine mutation resulted. Corrected by checking typeof
and comparing string lines in memory with a capped preview. Do not repeat raw metadata enumeration.
The current full test diff is captured for later review; a line-set delta is navigation, NOT full review.
Current test snapshot adds973baseline-relative lines with0removed; no final behavioral gate yet.

New tests include captured-table rebinding and a sampled known-child positive/forgery. Parent's exact rg
confirmed duplicate const originalNumericKnownChildForgeryModel declarations at10647/10743 in WIP;
feedback01a092be-7013-7c82-99d8-4a55791ea6a2 requires distinct valid/forged names before execution.
Do not mislabel this source observation as a test run or infer the entire test patch is reviewed.
Final full test/production diff review and evidence remain open. AAR NON-CLEAN; preserve lead/executor
boundaries and recover the parent review in fresh context without restarting the live worker.

## Parent behavioral review — 2026-09-11 23:26:03 UTC

Previous status turn: VERIFIED WAIT of the same active worker, not a product completion increment.
Current turn PROGRESS: parent reviewed the capture-time/declaration corrections and new current-identity
controls, then independently parsed the new raw Layout result. 867/872,5false,0skips/nonboolean;
all824historical checks retained exactly once and green. All six previous failures now pass.
Evidence: test-results/b119-scalar-root-check-layout-20260911T232300000Z/parent-review.json.

[REPRODUCED] Two new positive tests have the wrong oracle: final-use width sample200 yields200,
not original-root arithmetic88. Feedback01a092c7-5585-7a70-adb4-973ffdd42481 anticipated this;
the raw sampled facts confirm it. Correct only these two new expectations, not production semantics.
[REPRODUCED] Current-identity stale-root forgeries mutate4copies and still return sampled200 from
the old runtimeWidth range105-117. The field-overwrite catalog says width but uses the old source,
while its actual consumer is the final width use401-406. Preserve the negative; repair source authority.
[REPRODUCED] Known-child forgery mutates10copies and its geometry is unavailable via AST rejection,
but the rejected setColWidth consumer remains in the legitimate runtimeWidth catalog entry. Preserve
the independent valid frame consumer. Pre-fix geometry override without the new lineage gate remains
unproven pending the authorized controlled experiment; do not relabel this catalog defect as that proof.
Consolidated evidence feedback01a092ca-70ba-7f92-82dc-e98c2b2d8980 sent to the same live worker.

Tsc231500000Z failed on duplicate test names/type checks; tsc232200000Z then passed with empty streams,
23:22:15.3198216Z to23:22:52.8859592Z. Neither is the final frozen gate. No new scope, owners or runner.
Next: bounded repairs, controlled child-lineage experiment, all original serial gates, four hashes, STOP
for complete parent review and24input census. No heavy UI test, Git or protected/external write occurred.
AAR NON-CLEAN: sustain current-identity positives/negatives; improve by separating final-value fallback
from original-input arithmetic in test expectations. Highest evidenced risk is a caller-edited descriptor
rebinding a valid current catalog to a stale read; bounded repair belongs to this existing contract.
Full numeric/downstream/scenarios/history/actual-interface/three-menu/twelve-reference scope stays open.

### Controlled lineage proof and review correction — 2026-09-11 23:30 UTC

Worker briefly weakened the known-child invalid-consumer assertion by allowing unavailable geometry to
bypass it, claiming the red came from the legitimate frame consumer. [REPRODUCED] Raw catalog includes
BOTH frame and the invalid setColWidth consumer; the original assertion already distinguishes them.
Parent interrupted with exact evidence01a092cd-2b3a-7ab0-b087-67160c8ac283. SAME agent continues under
that new turn; no replacement worker. Parent inspected restoration of the original assertion and lineage
filter call. Do not revive that test weakening. This is review-forced correction, not acceptance narrowing.

Controlled pre-fix run: test-results/b119-scalar-root-child-forgery-fail-first-20260911T233900000Z/.
Actual timestamps23:28:13.6468706Z to23:29:00.6282150Z; directory tag is not the execution timestamp.
Parent strict raw review869/872,3false,0nonboolean. Valid known-child control88/source-literal passes;
forged10copies becomes88/preview-sample from runtimeWidth174-186 without the new lineage filter.
[REPRODUCED] Known geometry is improperly made preview-dependent. The sample200 equals source200,
so this run does NOT demonstrate a changed numeric value. Same invalid consumer and two stale-root
negatives remain red. Parent-review.json records raw hash/limits. All final gates/frozen review remain open.

Parent source follow-through23:32:40Z: createPreviewSampleCatalog.collect extracts numeric leaves even
when numericExpressionError returns a structural rejection; this is the invalid-consumer admission path.
The separate fallback path uses sampleCatalogSourceForValue's unconditional numericExpression.source,
which explains a width entry acquiring the stale runtimeWidth range. A root prover returning missing
alone selects the same fallback error and cannot establish the repair. Feedback01a092d0-eb9b-7db3-b249-
38ff5b3b643e asks the same worker to reconcile these existing collector/resolver/source-identity couplings
without weakening tests or changing genuine fallback policy. Current root-proof lineage call is present;
behavioral final proof remains pending. Latest verified waitcursor:121 confirms same active worker turn.

## Final behavioral review and oracle reconciliation — 2026-09-11 23:45:47 UTC

Previous goal turn PROGRESS: current-identity failures reproduced and source/consumer paths identified.
Current source now distinguishes an unproved transplanted preview-input root from the pre-existing
structural fallback, and the catalog admits numeric leaves only after descriptor validation. These
changes preserve exact-use inputs, proved alias roots and the existing structural fallback policy.

Reconciliation of TWO NEW mutation-negative oracles: runs001900000Z and004000000Z already have actual
unavailable width facts, no sample IDs and empty catalogs. Their remaining failure was a recursive scan
finding runtimeWidth in the unavailable fact's truthful expression/source diagnostics. Rejection does
not require erasing that diagnostic. Parent feedback01a092d6-cf22-7de3-97af-c303bacc3916 authorizes replacing
the broad text scan with present unavailable/no-ID facts, no stale catalog entry/source, and no successful
sampled width. The separate valid current-use positive still requires200; the known-child exact invalid-
consumer assertion remains unchanged. This is a NON-CLEAN, evidence-based test-oracle clarification,
not permission to accept forged geometry or relax the product goal. Source/diagnostic metadata stays honest.

Parent independently parsed configured Layout010000000Z:872/872,0skips/nonboolean, all824old names once
and green; actual23:40:49.4992766Z to23:41:27.5519047Z. Final Layout012000000Z repeats that same raw SHA
39492ED7ED2C09B556215FCF24FD445EDD9D7856E1311A909784E2CA7EAFB90E,23:42:20.9934588Z to23:42:59.1963596Z.
Final CallModel011000000Z148/148,all139old once/green,0nonboolean,exit0; raw SHA
B715C4CBA24939A4B216E4E00235E1F895782557ACE41D5D98D85350A13C4B1C. Tsc013000000Z exit0/empty streams.
Raw final shadow fixture positively resolves88/preview-sample with noInnerRoottrue, not merely its allowed
conservative fallback. All run directories are under test-results/b119-scalar-root- with their full tags.

Review: CallModel's full diff is identical to the previously reviewed2258 diff, hash72F9CC0DD51B8522E154FA75E53E49742A6D7E879A23A3C23886E59D14D658E9.
CallModel selftest remains reviewed3A339BB24799FF77F29A16577A163927868B3515DF90CEB552061B9464BBF4FB.
Parent re-read the COMPLETE31792-character Layout production diff at hash7480B72C8E0BC10C477BF48316B530CF0688CEEDD3E00E934280A4DE468791BA.
For Layout tests, parent reviewed every ordered change against the already-reviewed813 added lines:
559insertions/5revised additions across7contextual hunks; current1367added/0removed baseline lines.
This is ordered diff review, not the earlier line-set shortcut. Current test hash4D5DCA2E6E50739193A52DF229F702870031F84951A27162912B3856E6A2B2B9.

Lint014000000Z found exactly one unused useOffset warning. The worker renamed it _useOffset; lint015000000Z
and diffcheck020000000Z then passed with empty streams. Parent requires Layout/tsc again on the final
renamed bytes, then four-hash freeze, complete parent24input census and worker cleanup. Feedback
01a092dc-ed54-7e93-b592-0f22deaf68d4. Source unit NOT CLOSED yet. Full numeric/downstream, scenarios/history,
actual-interface/packaged/native and three-menu/twelve-reference fidelity obligations remain open.

## DOCUMENT CLOSE / AAR — 2026-09-11 (final parent review)

Status: VERIFIED for this bounded source-root unit. Exact receipt:
test-results/b119-scalar-root-baseline-20260911T212356911Z/parent-final-review.json.
All required source cases and final serial gates passed: CallModel148/148(all139historical), configured
Layout872/872(all824historical),0missing/duplicate/nonboolean checks,0Layout skips; post-final-rename tsc,
exact4lint and whitespace exit0 with actual empty streams. Complete production and ordered test-delta
review accepted; no old baseline test lines removed. Final hashes match the worker freeze and parent
post-graph census23:53:27.8005149Z: exactly4assigned owners changed among24inputs,20nonowners unchanged.
Mencius completed, was CLOSED, and native wait returned not_found. No live coding worker remains.

Source capability delta: original numeric reads now propagate through supported scalar/literal-table/
member/parameter aliases with exact scope/capture authority. Invalid transplanted leaves and child
consumers are rejected without deleting truthful diagnostics. Existing renderer/evaluator/source owners
were extended; no parallel interpreter, schema for authoring, history or deployment mechanism was added.
Delta is recorded here; no external capability map or issue was written in this authorized workspace unit.

Graphify deterministic code refresh exit0:11397nodes/28808edges/371communities,0LLMtokens. HTML skipped
by the existing size guard; no browser. Graph SHA6A05B51ED8799EE64FCA8AA5973321B4916202921F4EF8B0235DB2EEF807C1C6.
All four final source/test hashes remain matched after refresh. Graph session37025 is terminal; do not poll.

AAR NON-CLEAN. Sustain: source-parsed positives/current-identity negatives, exact ownership/freeze,
retained fail-first artifacts and independent raw review. Improve work: capture-time/scope identity must
agree at root, child and catalog admission; reject a proposed test weakening against concrete consumers.
Distinguish final-value sample200 from original-root arithmetic88, and diagnostic names from authorization.
Improve tools: strict JSON parsing and bounded ordered diff chunks avoid oversized output and incomplete
line-set reviews. Highest evidenced weakness: separate source/catalog paths accepted transplanted roots;
this unit repairs the demonstrated paths. Remaining downstream fact/provenance validation is already
specified in the parent numeric plan, not silently waived. Lessons banked in this local plan; external
wiki/memory/skill writes remain untouched. No broader architecture replacement is justified by this
bounded failure/recovery evidence; retain one evaluator and its independent source authority.

Not changed or claimed: full numeric contributor/downstream closure, scenarios/history UX, actual-interface
journeys, current full E2E/precommit/package/installed/native or three-menu/twelve-reference fidelity.
Those remain required under the original goal. No Git/release/real mod/game/save/config mutation occurred.
Commit point: feat(ui): preserve original numeric preview input roots (not committed).
