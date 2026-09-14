# B119 protected tab body implementation plan

> For Agent: use planning or brainstorming if context is missing. Astra implements directly; no delegation.

Goal: show meaningful, source-owned imported HUB body content through a friendly preview tab choice, then edit and reopen a supported body control without writing Lua.
Architecture: extend the existing call model, local invocation expansion, preview-path/scenario selection, source-edit/CAS, and history owners. Never execute imported Lua or introduce another interpreter/renderer. A selected tab is a preview scenario, not a claim about running-game state or successful pcall execution.
Tech stack: TypeScript, existing Lua AST analysis, React, source-bound projection/evidence, isolated Playwright.

Task: protected finite dispatch and first real body authoring slice.
Lane: FULL. Status: PARTIAL; dispatch/selector infrastructure implemented, body authoring acceptance not met.

## PLAN

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
