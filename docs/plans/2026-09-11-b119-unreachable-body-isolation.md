# B119 unreachable-body parser effect isolation
> For agent: read this entire plan and SESSION-HANDOFF.md. Astra plans/reviews; native Luna/max codes/tests.

Date: 2026-09-11. Lane: FULL. Status: PARTIAL (bounded parser repair independently verified; integration/product gates remain).
Goal parent: full canvas-first B119; existing GitHub owner #41. No duplicate feature or issue.
This unit repairs source analysis needed for ordinary imported layouts; it does not close real-menu editing.

## PLAN / acceptance contract

Bounded unit: already-proven unreachable control-flow BODIES must retain source/call/branch evidence
without mutating the semantic state used by reachable continuation. Reuse existing CallModel owners.
Real Lua remains canonical; no imported Lua execution, new interpreter, source regeneration or guessed geometry.

In scope:
- Scalar alias invalidation, shared tracked-object changes/escape, numeric math authority, and enclosing
  control-flow mutation records caused ONLY by bodies whose existing context proves unreachable.
- Correct nested handling: an outer reassignment census cannot reintroduce writes from a known-dead inner body.
- Preserve exact dead-body call records, source ranges, reachability and local-function/handler evidence.
- Preserve conservative behavior for reachable/conditional/unknown branches and all current source guards.

Out of scope:
- New expression grammar, arbitrary evaluation, loop reachability inference, whole branch value merging.
- Changing the separate global protected-pcall/rawget/rawset preflight authority scan.
- Reworking evaluation order of short-circuited expressions or elseif CONDITIONS. Their possible effects
  must not be mislabeled as repaired body effects. Record a concrete additional gap if tests expose one.
- Layout source/test changes; Scene/Pipeline expectation updates; sample schema/dependencies; scalar/structural
  edit locks; UI/history/corpus/deployer/packaging; browser/E2E/full SourceEditor; real mod/game/save/install/
  reload/config/Git/release/external issue/wiki/memory writes.0.0.78 stays immutable.

Risks: wrongly treating a reachable write as dead could invent geometry; shared object/outer-state leakage
could keep safe source unknown; deleting dead records would break provenance/selection. No network/spend/
deletion/credential/schema/API surface is added. Roll back only this reviewed delta against exact snapshots.

## BASELINE / current authoritative evidence

Current read-only HEAD main93c9af111d63ca77c99dee11f21882c4073bcda6; unrelated dirty files preserved.
Frozen source hashes rechecked immediately before planning:
- src/lib/x4UiCallModel.ts:8C44CB538BDCF6AD8C97BA537D8A29D1B0CBECC1BB9B730907D7F8CAFAD7A0F7.
- src/lib/x4UiCallModel.selftest.ts:8349308DD5246552A2122184AF736FB81E68991E71E7DF92F4F395719AD8FE2F.
- LayoutProgram:0770487808964873FC5304F2FC943C8103BDB4246A4E57835CBEDE973AA60270.
- Layout selftest:76A79660BF89A5868C7D4105896EEA70DF6149CC32EFE9D283B52DFF294BAE6F.

Reuse the fresh hash-matched parent baseline instead of repeating unchanged checks:
test-results/b119-numeric-alias-parent-a4-reviewed-20260911T092105Z/receipt.json.
CallModel127/127; Layout799/800 (only the known unreachable-write positive red), skipped0;
SourceEdits156/156; EditorSession PASS; whole tsc/strict prior owned-pair lint/whitespace0.
Scene191/192 and Pipeline121/122 have recorded sample/glyph census deltas, not clean baseline gates.
24 source/test hashes stable. All prior workers closed; no parent process remains.

[REPRODUCED] test-results/b119-numeric-alias-parent-dead-branch-effects-review.json:
- No branch retains the numeric descriptor and known props.width80.
- if false x=50 drops x's descriptor.
- if false props.width=33 makes later width unknown.
- if false mutate(math) makes later math.floor expression dynamic.
- Tested dead Helper replacement does not lose these later facts.
- Conditional scalar control stays unknown.
- A dead frame call at line5 is retained/unreachable; later line7 call remains reachable.
Probe exit0,2 stable inputs. This is parser-only evidence, not native Lua execution or game proof.
A second unchanged probe also reproduces dead scalar unknown-call and literal writes:
test-results/b119-numeric-alias-parent-unreachable-callmodel.probe.txt.

Exact pre-write snapshots are required under test-results/b119-unreachable-body-baseline/
before the worker touches source. Never replace source from HEAD or erase pre-existing work.

## RECONCILE

Authoritative implementation inspected:
- ifBranchContexts1336-1400 and combineReachability/branchContext carry existing source-bound truth.
- processStatement IfStatement evaluates conditions and dispatches those contexts to processControlFlowBodies.
- processControlFlowBodies5110-5148 currently accumulates every body into reassignment and body-result sets.
- collectControlFlowReassignments4868-4958 recursively scans nested clauses independently of reachability.
- recordControlFlowPropertyMutation5037 and recordControlFlowHelperAliasAssignment5054 write every
  same-function-depth outer mutation state; isolating only the newest state is insufficient.
- snapshotTrackedObjectState4691 and restoreTrackedObjectState4724 cover cyclic/reachable objects,
  reference metadata, known fields/indexed values, aliases, mutation flags and escaped status.
- processFunction4752-4812 and protected callback analysis already restore tracked state and numeric
  math authority around dormant analysis. Reuse these helpers rather than inventing another object copier.
- processStatements4840 currently swaps bindings, processes statements, restores bindings. The dead-body
  boundary must restore its saved state in finally even if inner analysis fails; no false success.
- numericMathAuthorityAvailable is mutated on math authority escapes; restore it at dead-body exit.
- protectedCallbackAuthorityHazard is set by a separate whole-source preflight at build1105; leave its
  contract unchanged. Pending records/gaps/IDs and function/handler/source metadata are observation, not
  reachable semantic state to delete/rewind.
- Existing tests cover conditional math mutation/escape, purity of reads, cyclic dormant restoration,
  protected authority, row evidence and helper identity. Preserve all127 checks.

Capability map F:/StarForge/wiki/x4-forge/capability-map.md756-781 rechecked: source-proof must retain
source/context/reassignment integrity and closed grammar. ADR-F1/F2/F5 ownership/source intent unchanged.
Agent-Brain returned broad old decompile/known-bug titles; no prior solution is established by those hits.

Extend-versus-replace:
1. Skip parsing dead bodies: rejected; loses source/call provenance and diagnostic coverage.
2. Filter scalar names only: rejected; independent property/math leakage and nested-census coupling remain.
3. Analyze dead bodies in isolated existing state, excluding their effects from live merge: selected.
No positive capability-map delta until validated; no new compiler/renderer/authority format.

## IMPLEMENTATION TASKS (Luna owns exactly two files)

Own ONLY:
F:/DEV_ENV/X4_Forge/src/lib/x4UiCallModel.ts
F:/DEV_ENV/X4_Forge/src/lib/x4UiCallModel.selftest.ts
and test-results/b119-unreachable-body-worker-* logs. Everything else read-only. No descendants.

### 1. Fail-first tests

Add bounded real parsed-source checks; preserve all127 prior tests and the unchanged Layout positive.
Use independent expected literals/descriptors and explicit cases, not values copied from current outputs.
Required positives:
- Literal false body with scalar literal and unknown-call assignment retains prior exact descriptor.
- Dead property mutation and deep/cyclic shared-object escape retain later known values.
- Dead math mutation/escape retains later existing numeric math authority.
- Dead body nested in do/conditional/true outer body cannot poison enclosing reassignment/property state.
- Dead else/elseif body after an earlier statically selected clause remains isolated.
- Dead frame/table/property/local-function observations retain their exact source/reachability; live
  continuation still appears in the correct context, with no dead call projected as live.
Required negatives:
- Equivalent reachable and runtime-conditional scalar/property/math effects remain conservative.
- Unknown and not-runtime-condition branches must not become proven dead.
- Shadowed locals and same-name values in other scopes cannot alter unrelated declaration evidence.
- Prior reachable mutation must not be erased by subsequently analyzing a dead body.
- Dead body followed by a live/conditional write must not restore over that later write.
- Existing protected-pcall/global hazard checks stay unchanged; no bypass or new exception swallowing.
Record red results and original/new split BEFORE production edits. Keep malformed-source/no-throw
behavior within existing parser contract; do not add test-only production hooks.

### 2. Bounded state isolation

Use existing reachability decisions; do not re-evaluate imported expressions speculatively.
Analyze an unreachable body for metadata, but exclude it from live reassignments/bodyResults/row merging.
Snapshot reachable tracked objects, scalar binding context and math authority; restore in finally.
Prevent dead nested analysis from writing any enclosing live control-flow mutation state. Preserve
real functionAnalysisDepth; do not fake a function boundary merely to evade mutation tracking.

Nested reassignment census must use the SAME proven branch reachability. One acceptable bounded
implementation is private AST-keyed reachability metadata populated from existing ifBranchContexts,
with collection scheduled after relevant body analysis. Unknown/unrecorded metadata remains conservative.
Prove metadata is associated with the actual AST/current analysis context; do not reuse stale decisions
across different contexts or introduce name-only or text-only lookup. Equivalent smaller reuse is fine
if it proves the same nested contract; report any materially different approach before implementing.

Keep branch source/context records and per-call identities; do not delete pending records/gaps to make
counts green. Do not expand source acceptance, drop warnings or change unrelated source/provenance schema.

### 3. Worker validation and freeze

Allowed only named pure checks, scheduled with no concurrent parent runtime checks:
- bundled Node --import tsx src/lib/x4UiCallModel.selftest.ts: original127 plus new cases, all pass.
- bundled Node --import tsx src/lib/x4UiLayoutProgram.selftest.ts with exact process-local corpus:
  all800 unchanged checks pass, zero skips, phase3D/G/J fixtureNotReady0.
- bundled Node node_modules/typescript/bin/tsc --noEmit.
- bundled Node node_modules/eslint/bin/eslint.js OWNED TWO FILES --max-warnings0.
- git diff --check -- OWNED TWO FILES (read-only only); baseline-relative diff for ownership.

Node:C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.
X4_REFERENCE_ROOT:F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00 (process-local, not standing config).
No browser/full SourceEditor, services/build/package/E2E/native or outside-owner write is authorized.
If a baseline positive conflicts with the new contract, report its exact source/evidence to parent;
never delete, skip or weaken it. If proof needs another owner, stop before that expansion.
Capture bounded JSON totals/failed names and actual exits; huge full result details belong only in logs.
Freeze exact source/test hashes, report paths/commands/results, then stop. No additional unit.

## PARENT VALIDATION / REVIEW / CLOSE

Early test review (before production change): first worker run128/136 preserves all original127 checks;
8 of9 new checks red. Parent full300-line test diff found a tautological source-slice check, invalid
declaration-prefix selectors in a call-expression-only helper, wrong unary-not fixture, and unchecked
nested mutated width. Conditional negative already has2 correctly conditional calls; its facts are absent
because its test selected no frame. These are test defects, not reasons to alter production semantics.
Same worker directed to correct and rerun fail-first under a new log name. Original logF902B202 and
testD86F3D20/source8C44CB53 are captured in
test-results/b119-unreachable-body-parent-fail-first-review.json. Review-triggered reimplementation/AAR.

Corrected worker fail-first129/136 (logCD12D655), all original127 plus conditional/shadow controls green.
First implementation run134/136. Parent inspected both remaining failures: scalar value is already37
with exact use/literal ranges, but exactLocatedText expects source while the fixture passed location;
later live property mutation is deliberately unknown in the unchanged parser (mutated/escaped table),
not a new known61. Same worker directed to fix oracles, not expand live mutation evaluation.
Parent independently corrects its own UNRUN probe similarly, adds an explicit no-dead live-property
control, and requires both before/after-dead variants to equal that control. Probe now16 cases.
This is a recorded acceptance-oracle correction from existing source semantics, not a weakened live guard.

After freeze: full two-file diff/guard review; independent CallModel+unchanged Layout all-green run,
original assignment probe still4/4; updated parser-only oracle requiring dead effects equal control while
conditional controls remain unknown and dead-call metadata retained. Preserve original reproduced log.
Run SourceEdits/Scene/PreviewPipeline/EditorSession pure suites, tsc/strict lint/whitespace and input
hash stability. Existing Scene/Pipeline reds remain separately reconciled, not waived by parser repair.
Check genuine HUB source/safety probe; required table nextTab/real editing may remain independently partial.
Record exact capability/provenance deltas, snapshots, evidence and limitations in this plan/BACKLOG/handoff.
No actual interface/native or full-goal completion claim follows from a parser green suite.

Evidence:test-results/b119-unreachable-body-*.
Required close state remains PARTIAL if any mandatory owner/product gate lacks evidence.
All nine actual-interface journeys plus three-menu/twelve-reference/package/native fidelity remain required.

Repository-adapter graph refresh: after worker freeze and independent tests, refresh the existing local
code graph with installed `graphify update .` (CLI help confirms code-only, no LLM). Snapshot current
graph.json into the reviewed checkpoint first; no source/Git/global config/network mutation. Verify
the refreshed graph contains the new parser helper owners and all24 validation source hashes stay fixed.
This is a generated-navigation-artifact scope delta, not a new renderer or acceptance oracle.

## AAR (initial / update from results)

## Parent close 10:20Z — bounded repair verified / full acceptance PARTIAL

- Gibbs explicitly froze then was closed; shutdown confirmed. No worker remains. Parent commands87934,
  77505 and90656 plus the three-probe command are terminal. No live process/wait handle.
- Full baseline-relative review: source+135/-38; tests+331/-0. Final source15963E50 and test2DBAFCE2
  match before/copy/after-equal inert snapshots. No blocking production finding. All127 original checks
  remain, with9 new aggregate checks. Existing global protected-authority preflight and condition-order
  behavior are unchanged; no fake function depth, deleted dead records, new grammar or parallel owner.
- Independent results: CallModel136/136; unchanged Layout800/800/skips0,3D15/15,3G49/49,3J11/11 and
  fixtureNotReady0; SourceEdits156/156; EditorSession PASS; whole tsc/strict pair lint/whitespace0.
  Separate16-case parser oracle and unchanged4-case assignment probe pass. Live property writes stay
  conservative; no-dead and dead-before/after controls match. Exact dead call source/reachability retained.
- Required remaining reds are NOT waived: Scene191/192, Pipeline121/122, genuine HUB title partial from
  nextTab(). Their complete failure/observation evidence is byte-for-byte JSON-equal to prior A4 outputs.
  HUB still9 geometric nodes/0editable, with numeric/corrupt-asset/nonfinite/no-corpus/source guards green.
-24 source/test inputs stable across all independent checks AND graph refresh. Existing code-only graph
  refreshed (exit0),11369nodes/28710edges/340communities;4 new helper owners found. graph.html deliberately
  not regenerated above5000-node limit; no stale HTML acceptance claimed. Pre-refresh graph snapshot kept.
- Receipt, source/test diffs,2 source snapshots and graph baseline:
  test-results/b119-unreachable-body-parent-reviewed-20260911T1012Z/receipt.json.
  Parent logs:test-results/b119-unreachable-body-parent-r1-*; graph log separately named.
- No capability-map delta: repairs existing reachability-integrity promise. No source-format/UI/Scene/
  Pipeline/SourceEdits/sample-schema/native/mod/game/save/config/install/release/Git changes.0.0.78 immutable.
- Next important unit is the real-menu scalar path, not more generic parser work. Read the separate scalar
  reconciliation: whole-stream lock, expanded426->18 source-order backstep, corpus authority and omitted
  scenario/local-expansion replay must be handled by existing owners. Browser clearance remains unanswered.
- Suggested eventual commit title after required close gates: fix(ui): isolate unreachable Lua body effects.

Parent AAR: review corrected six test-oracle issues, including the parent's initial live-property
expectation; no production semantics were expanded merely to satisfy those tests. A generic JSON log
reader failed on SourceEdits' prefixed text summary; bounded emitter-specific parsing recovered results
without rerunning or relabeling tests. Sustain independent controls and exact baseline-failure equality.
Optional reviewctl/rules/BlastRadius are unavailable; full manual diff and deterministic checks were used.
Project lessons recorded here only; no memory/skill/global-ledger writes. Highest current evidenced risk
is losing real-menu preview authority across scalar edits, documented in the separate reconciliation.

Dispatch checkpoint: Gibbs01a08fd6-56b9-7203-995d-e18f6912113c, native gpt-5.6-luna/max, no descendants.
Parent rechecked both current files against two inert snapshots; exact baseline hashes above match.
Worker owns the two declared parser files and worker-prefix artifacts only. Parent performs nonoverlapping
read-only SourceEdits reconciliation and waits for freeze before any independent runtime suite.
Previous goal turn was a status-only response (NO PROGRESS), not a completion claim.
Parent authored test-results/b119-unreachable-body-parent-acceptance.probe.txt:15 independent cases,
syntax check via bundled Node --check --input-type=module - passed; runtime deliberately UNRUN while
worker owns moving parser. Original reproduced diagnostic remains unchanged. New nonoverlap scalar
reconciliation records dropped scenario replay and structural-discovery coupling in its separate plan.
Parent tools improvement: repeated oversized combined/diagnostic-log output caused truncation; preserve
current checkpoint and use primitive-only parsing on continuation. Worker remains live, never restarted
from silence or observation timeout. No incomplete unit is committed.

Triggers already active: reproduced prerequisite failure and reconciliation of nested/shared-state coupling.
Sustain: independent control/mutation probes, source-bound reachability, reuse of cyclic object restoration.
Improve: a scalar-only fix would miss shared state and enclosing AST census; declare those before code.
Highest-risk evidenced weakness: falsely using an unreachable observation as a reachable effect (or vice
versa) can make correct source unusable or invent geometry. Negative live/conditional controls are mandatory.
Project record here; no skill/memory/global-ledger mutation. No Git commit or external update claimed.
