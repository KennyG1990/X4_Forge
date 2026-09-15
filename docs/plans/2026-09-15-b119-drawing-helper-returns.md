# B119 source-proven drawing-helper return positions

Status PARTIAL: implementation candidate under validation. FULL lane. Full visual builder ACTIVE/PARTIAL.
Latest: source-only authority scan index has fresh coupled/headless and rendered7/7 plus
traced3/3 first-attempt proof, including real-HUB edit/export/reopen. Actual Apply17.65s,
Undo13.71s,Redo13.35s remain too slow.57artifacts from both runs preserved with hashes.
Normal precommit rerun PASS06:57Z; exact local checkpoint tracked in the authority-scan-index plan.
Current performance close:2026-09-15-b119-authority-scan-index.md.
Earlier preparation10s timeout and retry120s interaction failure retained; subsequent
unchanged HUB gate passes. Cold-preparation timeout causality remains unresolved.
Detailed current close/AAR:2026-09-15-b119-scene-loop-census.md; current commands/hazards:SESSION-HANDOFF.md.
Goal: let the real menu's later sections acquire their source-defined positions instead
of stopping after the first section. Not a replacement renderer or a sampled-Y workaround.

## Baseline and reconciliation

HEAD9eb3561b891d094454451e8351787951b6baa12c; preceding turn made verified progress:
stable catalog handles, normal precommit and six-path checkpoint passed.96 excluded dirty
paths remain user/earlier work. No staged changes at this unit's start.
Read goal, original brief, approved canvas-first contract, handoff, local plans, capability
map and ADR-F1/F2. Graph query found generic source/invocation nodes, insufficient for this
mechanism; actual CallModel/LayoutProgram source is authority. Older agent-brain hits are
not evidence of a solved helper-return implementation. No capability-map delta yet.

Actual aic_hub.lua SHA657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F:
sectionHeader123-130 draws then returns y + rowH(1) + Helper.scaleY(10).
tabDossier201 assigns that return to ly. Its later content consumes ly. Existing first
caption proof does not prove later Y, helper-caption editing or the complete body.

Existing owners to extend, not duplicate:
- src/lib/x4UiCallModel.ts: source-issued declaration/parameter/invocation identities,
  returnSources, numeric expression descriptors, immutable callee/escape checks.
- src/lib/x4UiLayoutProgram.ts: resolveNumericExpression call-result currently accepts
  exact scale results/metric wrappers only; parameter bindings are ancestry-preserving
  maps copied for sibling local expansions. Existing source AST index and exact metric
  wrapper resolver are reusable; no arbitrary Lua execution.
- src/lib/x4UiSourceEdits.ts: ordinary scalar editing excludes expanded-helper anchors.
  This is a separate real editing obligation, not fixed by resolving positions.
- Existing scene/paint/session owners consume source-proven facts. Keep them authoritative.

## Design alternatives and selected contract

1. Supply preview Y manually: does not satisfy source-owned stacking or normal authoring.
2. Execute imported helper Lua: violates the stated safety/architecture boundary.
3. Extend source proof of bounded scalar returns using exact declaration, call and binding
   identity. Selected direction. Unknown branch/mutation/return dependencies stay unresolved.

The initial regression must have two distinct invocations of the same drawing helper, each
with its own Y, then a following table at the returned Y. A source-inlined control must pass.
Both profiles must prove the intended difference is the return dependency, not failed
expansion, missing target selection or generic incomplete fixture setup. Use no rendered
claim from this low-level diagnostic. Permanent regression is added before production code.

Implementation requirements:
- Prove one terminal return expression, exact callee/argument source and current invocation
  parameter bindings. No function-name special case, shared per-function numeric cache,
  caller-authored descriptor trust or metadata-only acceptance.
- Reuse existing arithmetic/scale/profile semantics. If additional return-expression data
  is needed, extend its owning parser/validator contract together; do not quietly add an
  independent approximate expression evaluator in presentation code.
- Refuse reassigned/shadowed/captured parameters, ambiguous control flow or multiple returns,
  recursion/depth overflow, unknown calls, invalid arity, forged offsets and changed source.
- Preserve sibling/ancestor call separation, source/profile invalidation, selected-path
  provenance and preview-only sample dependencies. Avoid reclassifying arbitrary numeric
  returns as direct Helper scales merely to fit the existing map type.
- Recognize the actual sectionHeader/rowH dependency and prove its following content at two
  profiles from unchanged real source before asserting that the body problem improved.

## Validation and evidence

2026-09-15 implementation reconciliation: the existing opaque-return sample regression
used `return width`, which is now within the selected exact-parameter return contract.
Keep its sample-consumption assertions unchanged, but make that fixture genuinely opaque
with `return runtimeWidth(width)`. Add a separate exact-parameter-return assertion (10)
alongside literal/arithmetic/alias tests. This is an explicit acceptance-contract update,
not a waiver of unknown-return sampling. Full permanent-candidate first run1126/1130:
two new root-scope failures and the two old sample-contract expectations; receipt retained.
Eight original paired return/control probes now pass. Source proof compares both records
through existing JSON normalization (parser-owned undefined members are not semantic).
Parser now retains opaque local-result aliases without assigning numeric semantics.

Evidence:test-results/b119-drawing-helper-returns-20260915/.
Start with diagnostic red/control receipt using existing projection/profile fixtures,
source hash guards and currentHEAD/input pins. Then permanent positive/negative tests in
src/lib/x4UiLayoutProgram.selftest.ts and parser tests if that contract changes.
Full layout, source-edit, session/scenario, pipeline and scene suites; types/focused lint;
preserve exact existing scene194/196 failures without weakening their oracles.
Fresh original-HUB diagnostic at1080p/scale1 and1440p/scale1.4, then ordinary isolated
rendered HUB test with source/history/export/reopen checks and manual image inspection.
Audit direct output writers first; sequential3200/3201, workers1, X4 absent, live state and
Deckwright preserved. No full-suite/native claim from a focused run.

## Boundaries and rollback

### Implementation refinement — source records, not a second evaluator

Retain return argument X4UiValue records in the existing CallModel declaration as optional
returnValues, keyed by return-statement location. The existing numeric-expression builder
produces their descriptors. LayoutProgram independently reparses the same source with
buildX4UiCallModel, normalizes it, and matches the declaration/invocation records before use.
Cache only this source-derived parse beside the existing source AST index, never a numeric
result or issued authority. Also validate exact terminal-return AST and numeric descriptor.
Existing resolveNumericExpression arithmetic evaluates the returned descriptor with copied
invocation bindings and matching expansion ancestry. Bound recursion and operation count.
Parser fields are optional for legacy model compatibility; absent proof remains unresolved.
New return facts and their consumers require forged-record/source-replacement regression.

Repo-only source/test/docs and ignored evidence. No game/mod/save/install/config/external
ledger/push/release writes. Read original mod and corpus only. No memory writes. Local
commit only after normal precommit; no commit of deliberately failing production tests.
Rollback only owned hunks. Current96 excluded paths must remain unchanged.
Full9journeys/3menus/12reference obligations remain; caption editing, immediate feedback,
packaged/installed/native checks are not waived by a position improvement.

## Original diagnostic close / AAR (historical)

Diagnostic completed2026-09-15 00:47:18Z at unchangedHEAD9eb3561. No production edits.
[REPRODUCED] Eight cases cover two scales, two helper/parameter spellings and paired
direct-arithmetic/return-dependent variants. All four inline controls pass. All four return
variants retain first positions10/45 but leave both following positions unavailable.
Expected atscale1:[10,20,45,55]; atscale1.4:[10,24,45,59]. Actual returns:[10,null,45,null].
All cases produce four tables and every local invocation expands. Those preconditions pass
before the intentional expected-position assertion fails. No missing-expansion surrogate.

Exact command: bundledNode test-results/b119-drawing-helper-returns-20260915/run.mjs
return-red --import tsx test-results/b119-drawing-helper-returns-20260915/return-probe.mjs return-red.
Exit1 is the expected red assertion, not a successful feature test. Full observations and
run receipt retained;823 input pins and protected50/realLua4/live19 unchanged, no launch or
guard error. No browser/installed/native test run in this diagnostic.

New source finding: CallModel processStatement ReturnStatement currently evaluates each
argument then discards its InternalValue; functionReturnSources preserves only locations.
LayoutProgram call-result accepts existing exact scale values, not the discarded general
numeric return. Carrying a proven returned expression through the existing parser/validator
contract is the next implementation question. Do not conceal this gap with a function-name
special case or a numeric-result cache. Any public shape addition must include source-bound
schema/evidence/continuation negatives; no metadata-only trust.

Review: meaningful red/control dependency established; source and runtime rendering remain
unchanged. Actual real-HUB/native acceptance remains unrun for this unit. No capability-map
delta. No new commit, push, release, mod/game/config or memory write. Last verified9eb3561.
AAR triggered by expected red and repeated oversized reads. Sustain independent sibling
calls, renaming and profile controls before implementation. Improve tool reads by reading one
bounded owner section per call, not combined large files. Highest-risk observed weakness:
conflating successful helper expansion with usable returned geometry. The regression now
distinguishes them. Degradation call made; precise handoff saved for the implementation unit.

## Current implementation checkpoint — 2026-09-15 01:40Z

PARTIAL; not ready for a verified close or commit. HEAD remains9eb3561; no staging,
push, release, installed/native, external ledger or real mod/config mutation.

Owned production changes: CallModel retains frozen return values and opaque local-result
aliases. LayoutProgram matches fresh source-derived records, proves terminal scalar returns,
preserves caller/sibling scope and binds arguments through the existing numeric evaluator.
Existing metric wrapper authority scanning is shared with the new return proof. Return
depth/step bounds, malformed/missing records, captured/mutated parameters, late Helper
replacement, source replacement and forged ancestor arguments are refused. Sequential
calls of the same helper are not misclassified as recursive calls. No numeric-result cache.

Evidence root remains test-results/b119-drawing-helper-returns-20260915/:
- final-return-contract:1160/1160, exit0, including local parameter alias return.
- final-parser:162/162, exit0.
- hub-factions-list: unchanged original/corpus, two exact source-derived Y assertions
  PASS124/171 at1080p/1 and1440p/1.4. This is a preview-only selected populated-factions
  branch, not runtime data or game truth. Table remains partial; mixed-branch editing locked.
- coupled-session and coupled-scenarios:exit0; coupled-pipeline127/127, exit0. These
  preceded the final multi-return alias restriction; do not present as fresh final-tree runs.
- final-types and final-lint:exit0 after the production multi-return restriction; two later
  test-only additions have not been re-typechecked/linted. diff --check passes.
- coupled-scene:194/196, same prior portable HUB9operations/6gaps versus7/3 and configured
  MENU54samples versus52. Not waived or repaired here.
- source-edits-multiple-return: original174/174 PASS after avoiding numeric alias
  materialization for unsupported multi-value returns.
- source-edits-return-alias: FAIL at added `single-return parameter alias retained`
  row-insertion fixture; issued=true, accepted=false, reparse-provenance-drift.
- return-alias-schema-diagnostic: expected diagnostic exit1. Original correspondence=false;
  identical input with numeric trees stripped=true. New alias has a preview-input descriptor
  at its exact initializer range. Structural parser-value whitelist has no numericExpression.
  Diagnostic instrumentation was REMOVED; src/lib/x4UiSourceEdits.ts is identical to HEAD.
- Each recorded run preserved823 input pins where applicable,50 protected artifacts,
  four original Lua files and19 live files. All test processes terminal; no browser launched.

### Required next correction (not implemented)

2026-09-15 continuation refinement SPECIFIED: retain numericExpression in the structural
ledger. Reuse buildX4UiCallModel to independently recover exact parser values at the same
file, range and expression; require the complete JSON-normalized value (including its
numeric tree) to match source before accepting this new optional field. A bounded two-source
index may retain only parsed source facts for before/after text, never comparison results,
numeric values computed from profiles, edit authority or caller objects. During splice
comparison recursively remap only genuine source locations within the proven numeric tree;
compare all remaining fields exactly. This avoids a second numeric expression evaluator
and does not strip metadata. Positive alias insertion plus unchanged-byte/remapped-owner
controls and forged descriptor/source/literal/accessor negatives are required. Extend
SourceEdits and its existing tests only; no source-format, persistence or release change.
Graph query was weak (generic parser nodes); direct owners above govern this correction.

Continuation reconciliation: the first source-proof implementation passes174/174, but
strict presence checks expose BOM input: raw buildX4UiCallModel rejects U+FEFF while
SourceBundle already replaces it with an equal-length parser sentinel and restores raw
file text. Export/reuse that existing buildSourceCallModel owner as buildX4UiSourceCallModel
in Structural edits and numeric-return source proof; do not duplicate normalization.
SourceBundle source/selftest and LayoutProgram source/selftest are in scope for this
necessary coupling. Source fact matching permits only omissions of parser-owned undefined
members, not arbitrary undefined metadata; missing trees on both sides must also fail.

Reconcile source-retained numeric alias records with the existing closed structural ledger.
Do not remove the new positive test, suppress supported single-value alias returns, blanket
strip numericExpression fields, or allow arbitrary metadata merely to pass. Preserve exact
source/identity remapping and add forged/moved-expression negatives for any schema change.
Relevant owners: CallModel.materializeNumericAliasChain and ReturnStatement; SourceEdits
structuralChildSchema/structuralSchemaOwnsLocation/structuralProducerSchemaNodeIsValid and
compareX4UiSourceStructuralLedgerCorrespondence. Normal precommit and rendered acceptance
remain pending until this red gate is resolved. No capability-map delta claimed yet.

### Triggered AAR

#### Continuation close — 2026-09-15 02:16Z — PARTIAL

Implemented the structural numeric-source proof, source-preserving BOM parser reuse,
and retained-alias browser journey described above. No diagnostic metadata stripping.
Validation receipts under the existing evidence root:
- structural-numeric-bom: SourceEdits175/175, nine attacks rejected, reordered keys
  accepted, getter not executed. SourceBundle structural-source-bundle exit0.
- bom-return-source-pinned:1170/1170. Later edit removed only an invalid diagnostic
  property read; assertions unchanged. close-types/close-lint subsequently pass.
- close-parser162/162; close-session and close-scenarios pass; close-pipeline127/127.
- rendered-return-alias-clean-fixture4/4,0failed,0flaky; treeGone=true; ports and live
  files unchanged. Inspected rendered-return-alias-text.png and rendered-input.png.
  Alias case22.8s is total test duration, NOT property-edit latency.
- close-hub: source hash unchanged; exact faction-list Y124/171 at1080p/1 and1440p/1.4.
- close-scene194/196: existing HUB expected7ops/3gaps actual9/6; MENU52samples vs54.
  Not repaired or waived. Therefore no clean checkpoint, precommit, release or native claim.
All recorded guards preserve823inputs,50protected artifacts,4real Lua,19live files.
106dirty paths, index empty, HEAD9eb3561 unchanged. No external ledger/issue/memory writes.
No capability-map delta claimed; full9journeys/3menus/12reference obligations remain.

Review: re-read all production deltas and retained metadata negative controls. Reuses
parser, source splice, existing evaluator, history and contextual palette. The source-only
two-text index never caches comparison verdicts or caller objects. No new persistence,
network, spending or deployment surface. Not all real-menu regions are editable yet.
AAR: source-bound negatives and actual rendered checks sustained. Improve fixture setup:
Lua helpers must precede terminal return; reseeding with old scoped drafts is a409 conflict,
not proof the insertion validator failed. Existing draft-protection behavior remains intact.
Two fixture mistakes prompted a degradation call. One malformed read command also failed;
corrected without writes. Highest-risk observed weakness remains misidentifying test setup
as product behavior; require exact browser/server source agreement before authoring tests.
Suggested eventual internal commit: fix(ui): preserve source-proven drawing-helper returns.
Do not commit until the required remaining gates are resolved or explicitly scoped.

Continuation rendered contract SPECIFIED: extend the existing contextual widget journey
with a fourth Text variant whose scratch Lua contains a trailing single-return parameter
alias. Keep the original three generated-menu variants unchanged. Seed only the ephemeral
workspace, reopen that source, insert and edit Text, recover an occupied cell by adding a
row, and undo/redo that row with exact source/sibling comparisons. Preserve the helper
byte-for-byte. Screenshots and JSON go only to test.info().outputPath; use isolated
3200/3201, workers=1, X4 absent, existing protected/live guards. This is browser authoring
proof for an imported-source pattern, not native X4 proof or a replacement for real-menu
acceptance. Add BOM/CRLF return-position and forged-argument variants at both UI scales.

Rendered baseline: 3/4 passed; new fixture failed both attempts with recorded409
head_conflict. Trace proves browser retained pre-seed scoped cache and edited source
without the helper. Correct fixture preparation only: helper before terminal return,
clear that exact ephemeral workspace's two cached body/version keys on reload, and
assert browser Lua equals seeded Lua before authoring. No production CAS weakening.
Original trace/context copied to rendered-first-failure-* under the evidence root.
BOM test first omitted fixture sourcePath (all16 position controls refused); restoring
the original identity gives1170/1170. Preserve the failed receipts as test-setup evidence.

Sustain: isolated positive/control fixtures, source-derived real-HUB formula checks, and
negative authority tests found two real defects before a release. Review identified a late
Helper-mutation hole; shared source-wide authority proof fixed it without Lua execution.
Improve approach: the multi-return fix did not cover supported single-return aliases;
the added control exposed that remaining cross-owner regression. Do not equate layout-green
with authoring-safe. One early empty-state explanation was corrected: recorded note calls
reject forwarded static color arguments, not the initially attributed reassigned parameter.
Improve tools: oversized combined reads recurred; use receipt/JSON summaries and bounded
owner slices. Optional reviewctl/BlastRadius unavailable; manual diff/source/tests used.
Highest-risk evidenced weakness: new parser evidence can break a strict downstream edit
validator even when renderer tests pass. Banked here with precise red/control receipts.
Degradation called; save this failing candidate honestly rather than committing it. No global
memory or external AAR ledger write. Full9journeys/3menus/12reference obligations unchanged.
