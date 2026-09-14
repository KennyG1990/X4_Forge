# B119 protected tab body implementation plan

> For Agent: use planning or brainstorming if context is missing. Astra implements directly; no delegation.

Goal: show meaningful, source-owned imported HUB body content through a friendly preview tab choice, then edit and reopen a supported body control without writing Lua.
Architecture: extend the existing call model, local invocation expansion, preview-path/scenario selection, source-edit/CAS, and history owners. Never execute imported Lua or introduce another interpreter/renderer. A selected tab is a preview scenario, not a claim about running-game state or successful pcall execution.
Tech stack: TypeScript, existing Lua AST analysis, React, source-bound projection/evidence, isolated Playwright.

Task: protected finite dispatch and first real body authoring slice.
Lane: FULL. Status: PARTIAL; dispatch/selector infrastructure implemented, body authoring acceptance not met.

## PLAN

### Declaration-name index — PARTIAL; rendered continuation passes, 21:59Z

Current browser1/1 PASS,0failed/flaky/bad/reporterrors,21:47:57–21:57:03Z. All823path pins,
HEAD/status,50protected/4realLua/19livefiles unchanged. treeGone=true; X4 absent; only
Deckwright3100/PID61604 before/after. Same120s and every existing assertion retained.
Actual real-HUB-reopened.png inspected: AI INFLUENCE HUB,all six tabs,DOSSIERselected,
FACTIONS/bar visible in independent workspace. Exact source,pixels,hierarchy,history and
duplicate-import rejection pass. Not helper-body editing or native/installed proof.
Trace reference fixture395071ms; edit20464ms,undo17863ms,redo15400ms action wall time.
Immediate-feedback UX remains unmet despite the full journey passing.

name-index-pipeline127/127 and name-index-session PASS. name-index-sceneFAILED194/196;
summary/failure lines deep-equal body-y/scene-caption.log, previously reproduced on parent.
No oracle changed. All validation processes terminal, including6260browser,58172scene,59155session.
Full goal PARTIAL; no capability-map delta. Same-runtime diagnostic now79644.186ms with exact
output parity, compared with97196.645ms prior and105747.698ms original (single-run comparison).

Checkpoint: existing guarded runner adapted to
F:/DEV_ENV/X4_Forge/test-results/b119-active-section-edit-20260914/checkpoint.mjs.
Verify current receipts/eight code-test hashes,scene parity and11exact staged paths; preserve
93excluded paths; require unchanged normal npm run precommit:check hook. No bypass or push.
Fresh checkpoint/{baseline,commit-exit,post-commit}.json decides integrity. Title:
fix(ui): preserve finite-section edits and index source declarations.
Prepare handoff before commit. This is LOCAL PARTIAL development, not full-feature acceptance.

AAR: sustained causal profiling, mutation/scope negatives and independent rendered review.
Highest risk remains15–20s authoring stalls; next performance work must target measured validation/
reprojection without trusting mutable metadata. Known scene failures stay exposed. First BACKLOG
write failed without a specific cause; read-only inspection found intact bytes, ample disk and
modify ACLs. One bounded retry succeeded; do not invent a locking/permission diagnosis.
No external-ledger/memory writes. All9journeys/3menus/12references and helper-body work remain.

21:47Z core implementation validated: name-index-layout1092/1092 plus continuity family,
name-index-source174/174 plus causal matrices,scenarios,types,8filelint PASS. All terminal0,
same50/4/19guards/input pins/HEAD/status. Same-runtime diagnostic97196.645->79644.186ms;
exact real-HUB results deep-equal. About18.1% shorter than prior cache,24.7% versus105747.698
original baseline; single diagnostic runs, not browser responsiveness proof. Source-map profile
now leads with closedJsonDomain/jsonEqual/alias binding rather than declaration search.
Complete incremental grouping/test diff reviewed; preserves original per-name order and visibility
sort, private source cache lifetime and every authority check. No new trust cache or schema change.
Next actual browser run name-index-browser keeps120000ms and every existing assertion. Reaudited
capture/export/observations/CPU fixture destinations: test.info().outputPath; real mod read-only;
manifest preparation explicitly requires owned ephemeral state database. Current X4 absent,
onlyDeckwright3100/PID61604,3200/3201 free. No concurrent validation will run during the browser gate.

Previous turn PROGRESS; live baseline64d1296 plus eleven owned dirty paths,93unrelated preserved.
No validation process remains. Reuse the private source AST declaration cache; its only lookup
consumer is DeclarationForReference. Index by exact identifier name instead of scanning all
declarations per reference. Preserve each name's original declaration ordering, visibility/scope
filter, sort/tie-break and all alias/source/model/evidence checks. No trust or selected-result cache.
Only F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts and its .selftest.ts change this step.
Extend continuity with a same-name declaration in a closed sibling scope, alongside existing
source replacement/rename/restore and forged-coordinate negatives. Existing shadowing families
remain mandatory. Rollback only this incremental grouping diff, not the earlier cache/CAS work.

Validation: full layout/source/scenario tests, bundled Node24.19.0 types/lint, exact original-HUB
two-profile CAS/inverse and fresh CPU profile/name-index-cpu. Compare diagnostic JSON exactly with
declaration-cpu; report single-pair timings without broader claims. Then rerun actual rendered HUB
edit/undo/redo/export/reopen at unchanged120s and one worker on3200/3201. Reaudit selected test's
direct writers and original/live/protected hashes; check machine/process/ports first and cleanup
after. Evidence remains under test-results/b119-active-section-edit-20260914 with fresh labels.
No native/install/config/game/mod/publish/push writes. No capability-map delta. Full nine journeys,
three menus/twelve references, known scene failures and integration/installed/native gates remain.

### Declaration lookup performance — PARTIAL, 2026-09-14 21:36Z

Implemented the bounded AST-owned declaration-list cache and same-model rename/restore tests.
Validation: declaration-layout1092/1092 including continuity family; declaration-source174/174
plus causal matrices; declaration-scenarios; declaration-types; declaration-lint8paths all PASS.
Every run terminal0 and guards50protected/4realLua/19livefiles plus input/HEAD/status unchanged.
Handles97339,54797,3011,86130,3537 terminal observed; analysis/scenarios completed inline.
No test process remains. No normal precommit/commit/push or new browser run for the cache.

Same Node24.19.0 profile pair:105747.698ms ->97196.645ms (8.1% shorter sampled interval).
Exact baseline reconstruction hash matches old pinned input; same diagnostic outputs deep-equal.
Reproducible source-map analysis: declaration-profile-summary.json and profile-summary.mjs.
Declaration construction no longer leads; DeclarationForReference repeated name filtering now
11015ms self (11.3%). This is not a browser responsiveness/universal speedup claim. The prior
rendered0/1 failure remains open. Next bounded hypothesis: group private AST declarations by name,
retaining candidate order and recomputing source visibility/alias/issuance checks. No implementation
of that next step yet. Need unchanged-timeout full rendered journey after adequate optimization.

REVIEW: complete eight-path executable/test diff reread; no additional source-format, trust-cache,
whole-file rewrite or external mutation. reviewctl and specified BlastRadius path unavailable.
No capability-map delta; full nine journeys/three menus/twelve references remain unchanged.
AAR triggered by prior rendered timeout, oversized diagnostic output and one Windows glob lookup
failure. Sustain causal before/after profiles, baseline hash reconstruction and source-mutability
negatives. Improve bounded output and explicit Node paths (static tests used system24.15.0;
profile pair/source/scenarios used bundled24.19.0). Highest evidenced risk remains multi-second
edit/history; cache results prove only one contributor improved. No external-ledger/memory writes.

Recovered real-cas-cpu terminal0 (21:20:39–21:22:26Z), guards50/4/19 unchanged.
105747.698ms sampled interval: declaration-list construction12837ms (12.1% self).
Exact esbuild transform/source map maps generated8:72714 to LayoutProgram6295;
other substantial costs include closedJsonDomain and jsonEqual. This is a contributor,
not proof it explains all browser latency. No active profiling process remains.

Bounded next implementation: F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts only
reuses the declaration list by its existing private NumericExpressionSourceAstIndex.
That index is replaced whenever exact model.file.text changes. Store frozen structural
entries/list in a WeakMap; cache no model aliases, validation result, visible-reference
decision, issuance or edit authority. Existing node-type index and all validation stay.
Extend F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.selftest.ts continuity family with
same-model renamed declarations and restoration, retaining forged-coordinate refusal.
Baseline is current seven-path invocation/CAS diff above64d1296; rollback only this
additional cache/test diff. No source schema/UI/network/game/config/publication change.

Acceptance: unchanged repeated projection, renamed/replaced/restored same-model source,
metadata tamper refusal; full layout/source selftests, types and changed-file lint;
same original-HUB CAS/inverse diagnostic with fresh CPU profile and exact output comparison.
Record sampled declaration cost and total wall time, not a single-run universal speedup.
Rendered active-section edit/reopen remains required at unchanged120s; no usable-UX claim
from this optimization alone. Evidence stays in test-results/b119-active-section-edit-20260914.
Graph explains DeclarationNodes -> DeclarationForReference and AST-node owner. No capability
map delta; unrelated dirty paths preserved, no commit until normal precommit passes.
Fresh review: AST is private and never handed to model callers; source text is cache identity;
every alias/scope/evidence check still executes. Existing cache does not justify trust caching.

### Invocation correspondence implementation — SPECIFIED, parent64d1296

21:19Z rendered result FAILED0/1, both original/configured retry hit120000ms. Cleanup treeGone=true,
same50/4/19guards and only pre-existingDeckwright3100 remain. Actual edited screenshot inspected:
heading AI INFLUENCE HUB is editable; DOSSIER remains selected and FACTIONS/bar visible. First trace
completed edit/undo/redo/export assertions, then timed out at5164 awaiting the new workspace before
reopen. test.trace durations: edit click27431ms,undo17903ms,redo19802ms; these include actionability
and processing waits, not isolated CPU costs. Reopen/current journey NOT verified. No timeout/oracle
relaxation. Complete source174/174 plus newdispatch family,layout1092/1092,session,scenario-final,
types-final and7filelint PASS. RealCAS/inverse and transfer atbothprofiles PASS, no realmodwrites.

Next diagnostic within this partial batch: profile the existing read-only/in-memory real-cas.mjs
with Node's CPU profiler into a fresh explicit real-cas-cpu.cpuprofile under this evidence root.
Reuse guarded runner and new output label, no browser/service/corpus/model-source modification.
Before interpreting costs, correlate sampled stacks with wall times; browser trace action duration
does not itself prove which function is slow. Record bounded top functions/paths and exact terminal
receipt to select the next repair. Do not cache stale authority, strip checks, or raise timeouts.
This is diagnostic only; no new performance repair before fresh review. AAR: initial type fixes
missed two more branches and one repeated refusal-message expectation; all failed receipts retained.
The highest evidenced weakness is multi-second source-edit/history interaction with an active body.

Execution delta: scenario red reproduced before repair; generic longer/shorter/pre-declaration
transfer/inverse/redo now pass, including wrong candidate/call/stale/duplicate/ambiguous ledger
negatives. Original real-transfer-green passed both profiles with all guards. Next planned scalar
gate enabled ONLY issued finite dispatch selections through exact CAS/reparse/rediscovery; ordinary
branch paths, helper/out-of-target literals, guessed loops and structural operations remain locked.
Generic scalar red confirmed old lock; new scalar/inverse case passed, but whole source suite173/174
found one second hardcoded old refusal message in the loop negative. Actual refusal, unchanged source,
empty catalog all passed. Update that message only; preserve all behavioral assertions. Typecheck also
found assertion-narrowed test error-message branches; repair test typing without weakening assertions.

Rendered follow-through updates the existing real-HUB test, retaining source/pixel/history/export/
reopen checks. Leave DOSSIER active during the heading edit/undo/redo; explicitly reselect after import
into a fresh workspace (scenarios are local, not embedded Lua). Require exact full canvas bitmap and
hierarchy equality plus selected DOSSIER and FACTIONS presence throughout. All existing captures,
downloads and observation artifacts use test.info().outputPath; original mod reads/hash checks and
ephemeral reference-state path guard reread. No new external writer or timeout change. One isolated
3200/3201 Chromium worker, recheck machine/ports, final treeGone and50/4/19 guards. This proves a real
heading edit with the body open, not editable helper-generated FACTIONS or full body fidelity.

Bounded repair: extend existing PreviewSourceMapping with optional before/after CallModel ledgers,
supplied by LayoutProgram issuance and PreviewScenarios' reparsed files. Resolve each catalog's
invocation IDs to unique source records, map call/callee/declaration/parameter ranges through the
exact splice, and compare callee identity, method/status/resolution plus dispatch path identity.
Never parse IDs to discard their offsets, assume the same dispatch index means the same callee,
or serialize the ledger as trusted authority. Presentation-only range callers need no new ledger.

Files:src/lib/x4UiPreviewSourceMapping.ts,x4UiLayoutProgram.ts,x4UiPreviewScenarios.ts and existing
x4UiPreviewScenarios.selftest.ts. SourceEdits and its tests may be extended only after this mapping
passes, preserving all direct-literal/CAS/issued-evidence checks and structural locks. Existing
body-probe baseline stays immutable; add a separate green probe under the same evidence root.

Acceptance: generic producer-backed finite dispatch survives longer/shorter/pre-declaration edits,
reverse splice/redo and saved-scenario migration; replacement of the selected callee with another
function, duplicate/unknown invocation, removed call, stale source/expectedText and extra writes
refuse. Original HUB retains DOSSIER at both profiles with different-length heading edits. Then
prove a source scalar edit with active section (not merely mapper equality). Run scenario,layout,
source/session regressions,typecheck,exact lint; inspect real rendered active-section edit/history
if the supported scalar gate is lifted. No native proof or full-body claim from headless success.

Baseline:product/test owners clean at64d1296; three prior diagnostic docs already dirty, preserved.
Guarded runner fresh labels/pins/50protected/4Lua/19livefiles; machine state checked before heavy runs.
Rollback only this bounded owned diff. No external writes/push/install; no new network/spend/delete
surface. Full9journeys/3menus/12references and required scene/integration/installed/native gates remain.
No capability-map delta yet. Read-only recall had weak historical matches, not implementation proof.

### Active-section edit continuation — SPECIFIED, parent64d1296

20:44:54Z diagnostic close: REPRODUCED, full body-authoring unit PARTIAL. Guarded
transfer-baseline run terminal0, same input hashes/HEAD/status and50protected/4realLua/19livefiles.
Both1080/1 and1440/1.4: equal-length AI INFLUENCX retains DOSSIER; seven-character-longer
AI INFLUENCE EDITED refuses target-mismatch. Boundary interval mapping, arm/index/label all match;
only invocationIds differ: ui/aic_hub.lua offsets38810..38842 ->38817..38849, dispatch0 unchanged.
Mapper compares those old/new identifiers verbatim, so matches=false. Wrong expectedText and an
unrelated extra edit both reject. See transfer-baseline.json and transfer-baseline-receipt.json.

No product/test/authority change and no new rendered proof this batch. Existing caption scene
remains present at both profiles, active-path catalog remains locked. Do not reuse this diagnostic's
expected-refusal assertions as the green implementation oracle: retain red evidence and add a fresh
positive transfer/CAS/undo/reopen test when repaired. Required negatives include wrong candidate,
callee/declaration change, ambiguous mapping, stale source, replaced/removed call, and copied authority.
Review found the same mapper serves scenario/history continuation as well as scalar reparse; repair
that existing shared owner, do not hand-edit IDs only in SourceEdits or delete the current guard.
First implementation command should locate every createPreviewSourceMapper caller and inspect the
existing source-owned localInvocations/localFunctions identity ledger before defining correspondence.
Graphify explain applyX4UiSourceEdit confirmed the existing Layout/SourceEdits/SourceEditor consumers;
graph traversal only, no semantic extraction. No capability-map delta. Checkpoint remains64d1296;
new diagnostics and three documentation deltas are uncommitted, no push. CLEAN not claimed: read/query
friction and degradation call are recorded above. Highest risk is removing a necessary lock while
source-offset transfer is broken; keep the exact negative/positive contrast and complete authoring gate.

Next bounded step is a read-only/scratch reproduction of the existing preview-path transfer used
by scalar CAS. SourceEdits currently rejects mixed streams with active paths; LayoutProgram already
has exact-splice path/loop/sample reissue. PreviewSourceMapping compares invocationIds verbatim.
Hypothesis: a length-changing heading edit shifts source-issued invocation IDs and therefore loses
the selected DOSSIER path, although an equal-length edit retains it. Prove this on unchanged original
HUB at both profiles before changing source-edit authority. Do not remove the active-path lock.

Evidence: test-results/b119-active-section-edit-20260914/. Reuse the prior guarded runner and original
source/corpus replay probe with new output paths/parent pins. Compare unchanged source, equal-length
heading splice, and length-changing heading splice; assert exact untouched bytes, fresh catalog
boundaries, candidate arm/index/label and invocation identity differences, and terminal transfer
results. Negative controls: nonlocal extra source change and wrong expectedText must refuse. Original
mod/corpus/live files remain hash-guarded. No browser/native/install/config/public writes this batch.

Acceptance here is a causal dependency reproduction, NOT an editable body or completed journey.
If reproduced, the next implementation must extend the existing mapper using exact source-owned
invocation/declaration correspondence, with shifted-source/candidate-swap/stale negatives. Then prove
scalar CAS, undo/redo and rendered active-section continuity before lifting the applicable lock.
Helper caption-to-caller edit ownership remains separate required work. Existing scene failures,
full9journeys/3menus/12references/current integration/installed/native gates are not waived.

Baseline: main64d12964b3301aca7229d1577b783fa14060cceb; previous six-file checkpoint post-commit
VERIFIED,93unrelated paths unchanged. No new product edits. Rollback only this diagnostic/docs diff.
No capability-map delta or external issue/wiki write. AAR trigger: oversized combined instruction
reads and two invalid path queries; corrected by bounded exact-file reads. Degradation was called;
limit this pass to causal evidence rather than implementing a new authority change on that footing.

- Bounded unit: import unchanged aic_hub.lua, expose source-derived finite tab choices, select a preview body, recover a meaningful body region, and edit one supported source-owned body text/property through existing CAS/history/export/reopen. Dispatch recognition alone is not acceptance.
- Assumptions: current source SHA is 657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F. Runtime hub.tab and faction data are not known game facts. Existing sectionHeader/note/kvRow return geometry and ascii/string transformations are additional dependencies, not solved by the dispatch change.
- Authoritative contract: full goal objective in C:/Users/Moshi/.codex/attachments/d06dfea8-8256-48a5-97f5-b524fac87153/goal-objective.md; approved F:/DEV_ENV/X4_Forge/docs/plans/2026-09-10-b119-canvas-first-builder.md; original FORGE-UI-EDITOR-BRIEF.md; actual configured mod source and shipped Helper corpus. Older font/column-count folklore does not override later corpus findings.
- Scope: finite same-file function-table lookup and optional exact local fallback, direct unshadowed global pcall, explicit preview selection, bounded expansion, source-bound scalar/object arguments, and dependencies necessary for one real editable body region.
- Non-goals: arbitrary Lua evaluation; simulated live game data; script execution; whole-file regeneration; executing event handlers; changes to the real mod, installation, game, saves or standing config; publishing/pushing; full three-menu acceptance by implication.
- Risks: stale or forged dispatch authority; table/callee mutation and escape; runtime nil/non-function selection; conflating pcall success with branch reachability; parameter/return provenance loss; duplicate invocation IDs; source edits affecting multiple helper instances; performance from candidate expansion. Refuse unsupported shapes and retain independent header/tabs.
- Recovery: preserve HEAD eda059f1af620cf9f90d0a7b2bf0291e203764d3; own only explicitly listed new-unit paths. No reset/clean/broad staging. Preserve unrelated dirty files. Existing passed evidence remains immutable.
- Evidence root: F:/DEV_ENV/X4_Forge/test-results/b119-protected-tab-body-20260914/. Each run uses a fresh label, input hashes, terminal result and bounded summaries.

## BASELINE

- HEAD main eda059f1af620cf9f90d0a7b2bf0291e203764d3; prior normal precommit and commit integrity receipt verified at F:/DEV_ENV/X4_Forge/test-results/b119-metric-helper-20260914/checkpoint/post-commit.json. No push.
- Existing B119 owned files clean. Unrelated modifications/deletions/untracked artifacts remain; capture exact current status before implementation and again before any local commit.
- Actual browser evidence: header and six tabs, empty body, locked loop-derived properties, visible long-task/FPS warnings. Headless local Chromium, not installed Antigravity or X4. Do not claim smooth UX.
- Current read-only parser diagnosis reproduces unsupported pcall at source line 699 while recognizing all six tab declarations (190, 344, 387, 459, 520, 557).
- No heavy tests or new app processes were started for this reconciliation. Recheck X4, occupied ports and live workspace before subsequent heavy validation.

## RECONCILE

- Existing owner F:/DEV_ENV/X4_Forge/src/lib/x4UiCallModel.ts tracks exact local declarations, direct/alias invocations, tracked table fields, mutation/escape, global pcall authority hazards, and anonymous protected callbacks. It does not turn a named function argument to pcall into a supported local invocation, nor retain finite dynamic function-table alternatives.
- Existing owner F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts createPreviewPathCatalog traverses reachable local declarations; buildLocalExpansionPlan supplies parameter bindings, selected paths, invocation ledger, cycle/depth/count limits, and conditional gaps. Reuse it.
- Existing branch arms are then/elseif/else. A dispatch is not an if clause: do not disguise it with a fabricated then/elseif arm. Reconcile a distinct, source-owned dispatch choice and label across the catalog, schemas, issuance and scene/session readers before changing the contract.
- Coupled readers: F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceEdits.ts, x4UiEditorSession.ts, x4UiScene.ts, x4UiPreviewPipeline.ts, x4UiPreviewScenarios.ts and F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx. Source-edit raw/canonical budgets and evidence authority remain unchanged.
- Source dependencies: HUB lines 648-651 finite TAB_FN; 698 dynamic selection/fallback; 699 pcall. Body helpers sectionHeader (126), kvRow (151), note (167), notBuilt (178) stack using returned Y values and transformed text. Check exact current line ranges rather than hard-coding these numbers into implementation.
- Design alternatives considered: executing Lua would handle many shapes but violates the safety/authority contract; a HUB-specific renderer would give a narrow demo and duplicate ownership; extending finite source analysis plus existing scenarios preserves the product contract and is selected.
- Capability-map delta: none yet. No external wiki or GitHub mutation during this unit.
- Plan correction from reconciliation: dispatch alone cannot produce meaningful body acceptance. Include its scalar-return/caption dependencies or mark the unit PARTIAL; do not claim a recovered body from a tab-choice dropdown.

## IMPLEMENTATION SEQUENCE

Execution delta: named protected helpers and finite table candidates are now under development.
The first layout run exposed a real coupled identity contract: multiple choices share one pcall
range, while the evidence schema previously allowed one invocation ID per range. Preserve that
range identity and add an explicit bounded dispatch index to the local-identity evidence, rather
than accepting arbitrary ID suffixes or removing uniqueness checks. Named calls retain the existing
explicit protected-success preview boundary; finite alternatives use distinct dispatch arms/labels.
The diagnostic runner also lacked X4_REFERENCE_ROOT; supply the established actual corpus path
and retain the failed layout-first log. No required oracle or acceptance criterion is relaxed.
Direct parameter arithmetic was already supported (layout-parameter-red passed); the narrower
nested-helper regression failed and was repaired by retaining exact ancestral parameter bindings
in independent child maps. Review also reproduced a literal-key lookup regression introduced by
finite candidate modeling; preserve the prior exact direct helper identity for a proven literal
key in an immutable table. Mutable fixed-key aliases still fail closed.

Rendered-test destination audit: the selected real-HUB test reads the configured real source and
only saves captures/downloads beneath test.info().outputPath. Its source/hash check, scratch
workspace synchronization, helper capture and export paths were reread. Its reference fixture
requires an owned x4forge-e2e-state-*/data/reference-manifest/index.db and rejects standing/foreign
paths. No new writer was added; the existing capture helper records the new section-selection
checkpoint. Use run.mjs browser-section with isolated3200/3201, one worker,50protected artifacts,
4real sources,19live files, source/config membership/hash guards, and final tree-gone verification.
The rendered selector test is intermediate proof only: body captions/placement and source editing
with active preview selections remain unresolved and are not waived by clearing the selection
before the existing heading edit journey.

### 1. Retain a bounded red baseline

Create F:/DEV_ENV/X4_Forge/test-results/b119-protected-tab-body-20260914/diagnose.mjs. Read the configured original source without writes; assert exact hash and current HEAD. Capture the six declaration identities and unsupported call. Include generic renamed direct-local-pcall and finite-table fixtures so the failure is not explained by HUB naming. Verify hashes/status after the diagnostic. Command: bundled node --import tsx test-results/b119-protected-tab-body-20260914/diagnose.mjs.

### 2. Specify and test exact dispatch provenance

Modify F:/DEV_ENV/X4_Forge/src/lib/x4UiCallModel.ts and x4UiCallModel.selftest.ts only after step 1. Add red tests for direct named pcall, immutable finite function tables, fallback and renamed functions. Carry exact source identity, candidate declaration, lookup key and invocation boundary; unknown selectors require explicit preview choice. Distinguish protected return values from the helper return. Reject local/global pcall rebinding, environment escapes, mutable/escaped tables, dynamic keys in constructors, non-local or rebound callees, unsupported arity/varargs, and unbounded candidate counts. Later/closure mutations must not be mistaken for immutable source. Do not grant arbitrary opaque calls permission to preserve object authority.

### 3. Wire one existing selection/expansion owner

Modify F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts and selftests, plus the coupled schema/consumer files named above as required. Catalog candidates without expanding all bodies; expand only the explicit selected candidate. Preserve depth/count/cycle budgets and unknown pcall failure state. Require new schema roundtrip, exact issuance, stale source/selection rejection, and scenario save/load/invalidation tests. Do not weaken equality checks, raise model-size limits or add a parallel scene owner.

### 4. Recover and edit one meaningful real body region

Probe unchanged real HUB at 1080p/scale1 and 1440p/scale1.4. Reconcile remaining numeric-return, text transformation and parameter-source dependencies from the existing owners before extending them. Never silently sample a value that source analysis claims is automatic. A deliberately supplied runtime sample is visibly preview-only. At least one body caption/property must have an honest source-owned edit target; if a helper literal affects multiple instances, expose that scope rather than editing one instance as if independent.

### 5. User-visible controls and rendered proof

Modify F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx and its selftest, plus F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts. Use friendly source-derived tab labels; source IDs/ranges stay behind Inspect. Select a tab, see its body below the existing tabs, edit a supported body field, undo/redo, export and reopen. Preserve original Lua and unrelated source bytes. Retain actual screenshots and inspect them. Run one worker on isolated 3200/3201 only after destination and machine-state audits. Keep existing header/six-tab tests.

## ACCEPTANCE / VALIDATE

- Parser/layout/source/session/scenario/pipeline/scene/component selftests as affected; npm run typecheck and npm run lint; exact commands, terminal verdicts and input hashes retained.
- Negative coverage: unknown/no selection; invalid candidate; mutated/escaped function table and callee; shadowed/rebound pcall; pcall error branch not inferred; stale imported source/scenario; recursion/arity/budget; source-edit shared-instance scope and byte-local inverse.
- Real source: six choices derived without a HUB-specific implementation; one meaningful body region and supported edit at two profiles. No fabricated live faction/state data.
- Rendered: actual source-colored body text pixels plus region/geometry assertions, screenshot inspection, one source edit with undo/redo/export/reopen. DOM text alone does not pass visible acceptance. Check authoring remains usable; existing performance warnings are not waived.
- Safety: audit every direct screenshot/writeFile/copyFile/download destination; freeze all relevant inputs; original mod/corpus/live-workspace protection; fresh scratch outputs; no X4/port collisions; terminal cleanup/tree-gone and guards after every run. Retain failed attempts.
- Full current integration and normal precommit required before VERIFIED local close. Packaged/installed/native proof remains a separate full-goal obligation; currently not run or authorized by this plan. gameVerified=false until native proof.

## 2026-09-14 implementation checkpoint

- Exact named global pcall and immutable finite local function tables now reuse the local invocation owner. Source-derived dispatch labels and bounded indices are explicit across layout, session, scene and source-edit schemas. No imported Lua executes; pcall success remains unknown.
- Independent child binding maps retain exact ancestral parameters, repairing nested-helper arithmetic without inventing a new evaluator. Literal-key table lookup retains its prior exact callee identity; review reproduced and repaired that regression.
- Primary Preview section selector offers the six real HUB names plus the source fallback. It changes preview state only, with a clear reset. Inspect retains technical path details.
- Parser reviewed160/160; layout reviewed1063/1063; typecheck passed. Component first pass is retained but predates the final parser review correction; remaining coupled tests and normal precommit are pending at this record's checkpoint preparation.
- Rendered browser-section passed1/1,0failed/flaky/report errors at18:38:03–18:41:51Z. It selects DOSSIER, verifies increased hierarchy and unchanged Lua/history, clears the choice, then passes the existing heading edit/export/reopen journey. Captured dossier-preview was visually inspected: header/tabs render, body is still blank. This is NOT body pixel or body edit proof.
- Two-profile nested-projection resolves body widths559/1287 and746/1714. y-projection reproduces the first section's unavailable Y: numeric expression at real source695 rejected because its structure does not match the exact source AST. Later section Y values depend on helper returns; transformed captions remain unresolved. Do not remove the source validator or active-path source-edit lock to pass this.
- Safety receipts: original4Lua/live19files/protected50artifacts unchanged; browser stack treeGone=true and only pre-existing Deckwright3100 remains. Current runner has823 path pins, with slash aliases causing duplicate physical files; this is not823 unique inputs. No native proof; gameVerified=false.
- Acceptance is unchanged. This is a local PARTIAL development checkpoint, not a VERIFIED feature close or public release. Full current integration, actual body pixels/edit/history/export/reopen and full-goal obligations remain. No ROADMAP promotion, external capability-map/GitHub change, push, package or install.
- AAR triggers: expected red tests, missing corpus environment in the first layout run, coupled invocation identity failure, a corrected direct-parameter hypothesis, review-found literal-key regression, and two late inspection mistakes (oversized output and malformed search). Sustain exact negative tests, unchanged source guards and independent screenshot inspection. Improve by stopping implementation at the degradation checkpoint and using bounded projections. Highest evidenced weakness remains a green selector test alongside a blank body; retain the explicit body pixel/edit gate. reviewctl/BlastRadius were unavailable; manual complete-diff review was used. No memory/external-ledger writes.

### Final checkpoint reconciliation, 19:04Z

- Source174/174 plus causal families, session, scenarios, pipeline127/127, component and project lint passed. types-after-snapshot passed with unchanged50/4/19 guards. No product inputs changed after the rendered test.
- Required scene gate is FAILED194/196. Portable HUB expects operations7/gaps3 but observes9/gaps6; configured MENU expects52 preview inputs but observes54. An independent416-file snapshot substitutes all10 changed executable/test paths with parent eda059f blobs and reproduces both exact failure messages and194/196. See scene-head-baseline-receipt.json. These are pre-existing failures, not evidence of a passing scene gate. Tests/oracles are unchanged; full integration remains pending.
- Standalone precommit failed at typecheck because the assistant-created snapshot under test-results was included by root tsconfig. This is an assistant diagnostic isolation error, not a product regression. It was moved to the existing excluded temp_import/b119-protected-tab-body-head-scene-20260914 directory; all416 snapshot hashes verified, original source files unchanged. snapshot-relocation.json records the recoverable move; the failed precommit log is retained. No tsconfig change or missing-import workaround was made.
- Additional AAR risk: Git ignore and the custom src/scripts input inventory do not establish the TypeScript compilation boundary. Future source snapshots must be placed outside the compiler's input set before validation starts. The corrected typecheck proves recovery, not a passing full precommit.
- Reconciled close is a PARTIAL development checkpoint only. No acceptance criterion was removed. Its commit harness requires exact parent-baseline parity for the two retained scene failures, all other focused gates, unchanged unrelated files, and the unchanged normal precommit hook. That hook reruns the full precommit command before commit creation. No bypass; checkpoint/commit-exit.json and checkpoint/post-commit.json are the final commit authority. If absent or failed, no successful checkpoint is claimed.
- Suggested local checkpoint title: feat(ui): checkpoint source-bound protected preview choices. The eventual body-authoring feature title remains unachieved. No capability-map delta or ROADMAP promotion; issue41 remains open and no external issue/write is made.

## Prior reconciliation record / AAR

### Body Y continuation — SPECIFIED, parent f688820

Bounded step within the unchanged body-authoring contract: reproduce and repair exact numeric
alias evaluation order at the existing numericExpressionStructureError owner. Lua5.1 section2.4.3
evaluates RHS expressions before assignments (https://www.lua.org/manual/5.1/manual.html#2.4.3).
Hypothesis, not diagnosis: exactNumericExpressionAliasBinding and numericExpressionAliasHasWriteBetween
mistake the target of the current self-assignment for a completed intervening write. Generic red
fixtures must prove the error before code changes. No arbitrary Lua evaluation or validator bypass.

Files: x4UiLayoutProgram.ts and its selftest; parser owner only if a reproduced producer defect
requires it. Existing source AST, declaration/scope, lineage and descriptor equality owners remain.
Negative gates: prior unknown/conditional writes, sibling scopes, stale captured descriptors,
simultaneous assignment semantics and deferred closures must not gain invented authority.
Use unchanged real HUB SHA from the prior receipt at two profiles; require exact first-section Y,
then inspect remaining captions/helper-return geometry rather than calling numeric proof full UX.
Run full layout regressions, typecheck, targeted lint and real-source probe with current input hashes.
No source/corpus/live changes during tests; keep source snapshots only in excluded temp_import.
Evidence:test-results/b119-body-y-20260914/. Baseline current HEAD f688820;93unrelated paths retained.
Rollback is the exact owned diff from that commit, never reset/clean. Source-edit active-path lock,
the two pre-existing scene failures, full integration and all rendered/native obligations remain.
No capability-map delta yet. No publish/push/install/game/config/external-ledger writes.

Body Y red/green: generic repeated self-assignment failed1063/1064, then existing assignment
availability/intervening-write checks were corrected to respect complete RHS evaluation. Full
layout1066/1066, including simultaneous old-value bindings and unknown-write rejection; typecheck
PASS. Real unchanged HUB first sectionY now98/135 at the two profiles; laterY/captions/edit lock
remain unresolved. Add explicit source-hash-bound Y assertions to the existing probe.
Rendered follow-through reuses the byte-unchanged real-HUB test and previously audited outputPath
capture/download helpers; no new external writer. Recheck X4 and3200/3201, run one worker and verify
50protected/4realLua/19live-file guards and treeGone. Capture is intermediate body-geometry evidence,
not full body text/edit acceptance. Review used graphify's existing validator ownership (no semantic
extraction/token spend) and complete diff; reviewctl/BlastRadius remain unavailable.

### Body Y evidence and next caption dependency, 19:33Z — PARTIAL

### Caption implementation batch — SPECIFIED, 2026-09-14

20:23Z close: first-caption rendered acceptance evidenced; overall body/builder PARTIAL.

Checkpoint preflight correction: compact console summary has verdict.treeGone, but persisted
receipt has verdict.lifecycle.termination.treeGone/complete. Initial verifier stopped before
baseline directory creation or staging (index empty confirmed). Read persisted schema, corrected
the assertion without weakening cleanup, then retry the same unstarted checkpoint. No product,
test, receipt or hook change. AAR: inspect persisted receipt shape, not console projection.
caption-bounded1092/1092,caption-bounded-lint,caption-types-close,caption-real-close,source-caption
174/174 PASS on current product inputs. scene-caption194/196 has byte-identical failure/summary
lines to source-rhs baseline at f688820; no count/oracle edit. All runners terminal, guards unchanged.
Six-path local checkpoint via checkpoint.mjs, mandatory unchanged normal precommit hook; final
checkpoint/post-commit.json is authority. No new release, push, install, external ledger or native.
Current3executable/test paths plus BACKLOG/plan/handoff only; preserve unrelated93paths.
Review: caption visible/source-derived, property editing deliberately still locked, later positions
partial. No full journey promotion. No capability-map delta beyond this local evidence record.
AAR sustain: original-source two-profile assertions, pixel mask plus manual screenshot, independent
source/scene regressions, exact path/hash checkpoint. Improve: initial fixture lacked expansion;
function identity must use invocation owner, not numeric variable scope. Mixed diagnostic logs need
line-filtered reads; initial combined skill read was too large. Lint/depth-test corrections retained.
Highest evidenced risk: visible caption mistaken for editable body. Keep explicit locked-state and
full-objective acceptance gates. Cold million-file manifest scan explains this run's preparation
delay; do not change timeouts or redirect shared state to hide it. No memory writes.

20:19Z implemented/visually evidenced intermediate slice, full goal PARTIAL:
- Existing resolver recognizes bounded literal/parameter/concat/ASCII-upper and complete
  alpha-renamed printable-byte helper structure; invocation owner is CallModel, not numeric aliases.
  Whole-file library/function escape checks, parameter-write guards, 4096-byte/16-depth resolution
  and2048-node/40-depth structural matching. No schema, renderer, edit authority or Lua execution.
- caption-bounded1092/1092 and caption-bounded-lint PASS. Types passed before the final structural
  matcher bound; refresh current types plus coupled source/scene before checkpoint.
- caption-real-asserted verified unchanged sourceSHA, first caption and Y98/135 at two profiles;
  this preceded only the added structural matcher bound. Refresh its exact current receipt.
- browser-caption PASS1/1,0failed/flaky/bad/reporterrors,20:11:24–20:19:26Z. Current final inputs,
  treeGone=true,50protected/4realLua/19livefiles unchanged, only Deckwright3100 before/after, X4 absent.
  Actual screenshot inspected: FACTIONS text and blue first-section bar ARE VISIBLE. Inspector
  properties remain unavailable/locked; later helper-return sections remain unresolved. The test
  verifies source-colored glyph pixels, unchanged source/history and existing heading edit/reopen.
  This is NOT full-body edit acceptance, smooth UX, full integration, installed or native proof.
- Run duration included cold manifest scan of1,028,384 files; service scanning->ready observed.
  UI test itself~1.6min. No timeout change or harness bypass. Existing external output audit reused;
  selected test writes only test.info().outputPath captures/downloads and established scratch state.
- Review reread all3changed executable/test diffs. reviewctl/BlastRadius unavailable. Temporary
  debug output removed; no new spend/network/delete surface. Full objective stays unchanged.

Implementation review corrections: numeric local-variable lookup is not function binding authority;
use CallModel's source-issued invocation/declaration identity for every helper reference. Parameter
identity points to declarationId, not functionSource. Initial generic test lacked explicit local
expansion, so its first red was not a precise caption oracle; corrected fixture preserves that
opt-in. A later all-literal depth case was already folded by CallModel; use a dynamic parameter
leaf to exercise the new resolver depth limit, preserving existing static literal behavior.
Lint no-control-regex is retained; ASCII check uses character codes. Temporary scalar debug logs
were removed before final tests. Baseline/failed receipts retained; do not call these clean runs.

Reuse LayoutProgram's source AST/index and private string resolver. No source-schema change.
Compared approaches: samples do not solve source-owned authoring; arbitrary Lua execution violates
the objective; a closed source recognizer preserves the existing proof boundary. Use the last.
Recognize exact literal/parameter/concat/ASCII uppercase expressions, and alpha-renamed versions
of the complete printable-byte helper body. Compare parsed structure including operators/literals,
not helper names. Keep standard-library mutation, alias escape, reflection and parameter writes
fail-closed; bound recursion/output. UTF8 bytes must match the real source algorithm.
Files: F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts and its .selftest.ts; existing body-probe.mjs
and real-HUB browser test for validation. Baseline f688820 plus already-tested numeric RHS diff.
Rollback only the new exact diff; preserve existing numeric repair and unrelated93paths.
First red generic renamed-helper case, then positive/negative families, full layout/type/lint,
unchanged-source two-profile probe and actual rendered inspection. Update current evidence under
test-results/b119-body-y-20260914 with fresh caption labels, never overwrite old receipts.
No external writes/release/install/native or path-edit lock change. Caption pixels are intermediate
acceptance, not full body editing; all9journeys/3menus/12references remain. No capability-map delta.

- Close diagnostic,19:44–19:45Z: caption-original-scoped and caption-counterfactual both terminal0
  with guards unchanged. Exact createText starts127;128 is options. In-memory-only literal caption
  produces first-section text rect(32,98,85.875,19.5) at1080/1 and(43,135,171.75,39) at1440/1.4;
  outerHeight20/39. Original has no body text. This isolates caption resolution,NOT implemented
  automatic support,rendered pixels or editing. Unknown tabOrder does not suppress this geometry.
- Final review:complete two-file product/test diff reread;exact-path diff check passed. Repair
  uncommitted,normal precommit pending. No product changes after tested inputs. PARTIAL;
  full-objective obligations unchanged,no capability-map delta.
- Triggered AAR:oversized nested serialization recurred;initial diagnostic used options line128
  instead of createText127 and text instead of scene content. Corrected scoped receipts retained.
  Called degradation territory and stopped new feature implementation. A duplicate-target handoff
  replacement patch was rejected atomically; recovered with one whole-file Update patch.
  Sustain original/scratch hashes and independent rendered checks. Improve tools using scalar,
  source-filtered summaries before serialization. Highest risk:equating geometry with usable
  authoring;caption pixels and real body edits remain required. No memory/external-ledger writes.

- Coupled refresh terminal: source-rhs PASS174/174; scene-rhs FAILED194/196 with the exact same
  portable HUB9/6 versus7/3 and MENU54 versus52 assertions as the independently reproduced baseline.
  Both guards passed; no new scene failure. Current suite is not green.
- Before caption implementation, run a scratch-only counterfactual through the existing body probe:
  replace the single source128 caption expression in memory with a literal, compare original and
  altered-source receipts at both profiles, and inspect text/height/scene facts. Never write the real
  mod or call this evidence of automatic original-source caption support. This diagnostic checks
  whether caption resolution is sufficient or further geometry blocks meaningful body pixels.

- Applied only existing-validator assignment timing plus three regression cases. No source-format,
  renderer, sample, path-edit, game or deployment owner was replaced. The seven-line logic delta
  remains uncommitted above f688820; do not rerun old checkpoint.mjs against changed inputs.
- layout-rhs-first1066/1066; types-rhs and lint-rhs passed. real-y-asserted proves source-owned
  first-sectionY98/135 and retains the active-path edit lock at both profiles. Original4Lua,
  live19files and protected50artifacts unchanged across every run.
- browser-y passed1/1,0failed/flaky/report errors,19:26:35–19:32:18Z; treeGone=true. The actual
  DOSSIER capture was inspected and STILL HAS NO VISIBLE BODY. Numeric recovery is not body pixel
  acceptance. Header/six-tabs, source/history preservation, heading edit/export/reopen still pass.
- Remaining current validation: coupled source/session/scene regression refresh and normal precommit
  before a subsequent commit; existing scene194/196 baseline failures remain open. No new full
  integration, installed or native claim. Full objective/all9journeys/3menus/12references unchanged.
- Next bounded dependency SPECIFIED: existing resolveProjectedString -> resolveString only accepts
  a static string or supplied sample. The real source128 caption is concat + string.upper(ascii(text));
  first caller supplies literal "factions" at201. The source helper65–73 converts to bytes, retains
  ASCII32..126, substitutes spaces and trims trailing whitespace. Keep names irrelevant and source
  canonical. Reuse existing AST/index, exact local invocation/declaration, parameter bindings,
  source/evidence issuance and string resolution; no new competing expression model or Lua runtime.
- Before implementing captions, red-test a generic renamed nested helper and exact original source.
  Prove the complete helper body and standard-library identity before deriving text. Preserve UTF-8
  byte semantics, output/depth bounds, unknown inputs, local shadowing, reassigned/escaped libraries,
  reflective access and altered helper bodies as fail-closed cases. Do not infer "ascii" by name or
  hardcode the HUB caption. Require actual body text pixels and retain the larger body-edit gate.
- Scene follow-up localization (read-only): portable HUB fixture source includes three direct button
  calls plus an ipairs loop over three items. Reconcile its operation/gap ledger, not merely7->9.
  Configured MENU failure is a52-input total assertion after its source-owned geometry checks; identify
  the exact two extra source expressions before changing any oracle. No scene test changed this turn.
- AAR: red fixture confirmed assignment timing; review kept declaration/source equality and stale
  writes intact. Two initial oversized documentation reads were corrected to bounded reads; no data
  writes resulted. Sustain independent screenshot review: green numeric/test results still coexist
  with a blank body. Highest risk remains premature body-completion claims; next gate is source-owned
  caption pixels and then actual editing. No memory/external-ledger writes.

- Initial reconciliation status was SPECIFIED; the implementation checkpoint above supersedes that state without claiming body completion.
- Baseline diagnostic ran terminal0 at HEAD eda059f; F:/DEV_ENV/X4_Forge/test-results/b119-protected-tab-body-20260914/baseline.json records actual six-function HUB and two renamed cases, with original/input/status guards unchanged. Existing test-results report was queued in Codex. No new browser test was run.
- Review each requirement against source, rendered artifacts and exact diff. Suggested eventual local title: feat(ui): preview and edit source-bound protected tab bodies. Do not commit or claim this title as achieved from infrastructure alone.
- Full B119 remains PARTIAL: all nine journeys, three real menus/twelve reference obligations, current full integration, packaged/installed/native fidelity remain.
- Reconciliation AAR trigger: initial dispatch-only framing was insufficient; malformed inspection queries and an oversized output were corrected. No product files were changed by those attempts. Sustain bounded parser output and original-source protection. Improve work by proving body dependencies before implementation; improve tools by using literal rg patterns/existing file inventories and bounded output. Highest evidenced risk: equating recognized dispatch with usable/editable body content. Countermeasure is the explicit rendered body-edit/export/reopen gate above. No memory or external-ledger writes.
