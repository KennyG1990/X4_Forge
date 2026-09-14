# Explicit zero text height — producer/Scene consistency

Status: VERIFIED source-level repair; full B119 remains PARTIAL, with actual-interface/native gates open.
Lane: FULL. Parent: B119 canvas-first goal, GitHub owner issue41 (read-only in this checkpoint).

## PLAN / RECONCILE

- Bounded unit: make supported text with explicit height=0 use the same automatic-height result as
  omitted height, preserving original Lua and the existing guarded Layout -> Scene -> Paint chain.
- Product requirement: an ordinary supported text widget must not blank the preview merely because
  imported Lua spells out the default height. This is not the full numeric-dependency/scenario work.
- Source hypothesis: Layout12962 currently prefers any explicit heightValue (including0) over the
  resolved finalTextHeightFact; finalized cell height13719 can then differ from the creator fact.
  Scene4481-4505 intentionally requires the zero-height creator/cell/candidate facts to agree.
  Do not weaken that equality to accept inconsistent evidence.
- Corpus authority: configured 9.00 helper.lua5390-5401 uses getMinTextHeight whenever scaled text
  height is0;5482-5497 defines the text metric/floor maximum. The existing Layout kernel is reused.
- Diagnostic record: docs/plans/2026-09-11-b119-numeric-alias-dependencies.md and
  test-results/b119-numeric-dependencies-reconcile-*; four explicit-zero controls return projected
  Layout but refused Scene, including all-literal input. Parent omitted-height replay passed below.
- Existing current capability-map UI deltas and ADR ledger were read. Canonical source, existing
  renderer/Scene/undo/deployer ownership remains unchanged. No alternate format or capability claim.

## BASELINE / OWNERSHIP / ROLLBACK

- HEAD93c9af111d63ca77c99dee11f21882c4073bcda6. Parent24input comparison at15:23:02Z has no delta from
  test-results/b119-census-reconciliation-parent-stage2-20260911T143357603Z/receipt.json.
- Before a code worker starts, capture fresh24inputs and inert byte-identical snapshots of exact owners.
  Existing worktree changes belong to prior work/user; no broad staging, restore, cleanup or Git mutation.
- Candidate implementation ownership: src/lib/x4UiLayoutProgram.ts, its .selftest.ts, and
  src/lib/x4UiScene.selftest.ts ONLY. All other source/selftest files read-only. If another production
  owner is necessary, stop for parent reconciliation before expanding ownership.
- Rollback: exact task-owned diff against these snapshots; never revert the pre-existing dirty worktree.
- One fresh native Luna/max, no descendants. Astra reviews/integrates. Never overlap the probe worker
  or parent Node checks with the new worker's test execution.

## ACCEPTANCE / IMPLEMENTATION BATCH

1. Add fail-first public parse/Layout/Scene regression coverage for an otherwise identical text menu:
   explicit literal0 versus omitted height, fixed literal minRowHeight/y, and independently issued
   sampled minRowHeight/y (40/5 and50/9). Preserve all prior checks and all diagnostic attempts.
2. Correct the existing producer fact choice, not user Lua or the Scene acceptance guard. Keep
   metadata/source properties recording the original explicit0. Nonzero text heights and non-text
   widget behavior must retain their existing semantics. Known zero aliases should follow resolved
   zero semantics if already supported; no new alias grammar in this unit.
3. The equivalent variants must produce accepted Scene/Paint, nonempty text/glyph geometry and equal
   corresponding geometry at scale1 and an existing supported alternate scale. Compare semantic nodes
   rather than source-dependent IDs. Row height is not the minRowHeightFloor subtraction result.
4. Preserve missing text-metric/input refusal: unavailable automatic height must not become invented
   geometry. Retain stale/copy/source/profile/issuer guards and finite-number rejection. Include explicit
   nonzero height control, unrelated Lua-byte equality and no fixture skipping.
5. Numeric multi-dependency provenance remains a separate required B unit. This repair must not pretend
   one sampleId is a complete dependency graph or implement scenario rebinding with incomplete evidence.

## VALIDATE / REVIEW / CLOSE

- Serialized worker fail-first and final tests; parent independently reviews complete snapshot-relative
  diff and replays the frozen public comparison. Record actual times, exit codes and before/after hashes.
- Required pure gates: complete Layout and Scene selftests (zero skips/fixtureNotReady), SourceEdits,
  PreviewPipeline, EditorSession, normal whole-project TypeScript, exact owned-file ESLint/diff hygiene.
- Freshly inspect each command before running; no browser/full SourceEditor/Chromium/E2E/build/package/
  services/native tests until machine clearance. Native/actual-interface acceptance is still missing,
  so any source-level verified repair must be labelled as such; full product remains PARTIAL.
- Evidence prefix: test-results/b119-explicit-zero-text-height-*; update this plan, BACKLOG and handoff
  at the bounded checkpoint. Graph refresh after actual code changes. No external issue/wiki/config/
  mod/game/save/install/release/memory writes. 0.0.78 immutable. No commit/push authorization here.
- Review all requirements against real results before accepting; if the controlled contrast disproves
  this mechanism, revise this SPECIFIED plan instead of implementing a speculative patch.
- AAR: record fail-first/other failures, fixture or contract corrections, review findings and tool friction.
  Current evidenced risk: generic Scene refusal can conceal a producer disagreement even when Layout
  numbers are correct. Scope the repair to proven cause; do not add a new diagnostic framework here.

Suggested eventual commit title: fix(ui): preserve automatic text height for explicit zero.

## Release checkpoint — 2026-09-11 15:38Z

- Parent independently replayed the frozen diagnostic, exit0,24source and8corpus hashes stable:
  test-results/b119-numeric-dependencies-reconcile-parent-20260911T153700294Z-receipt.json.
  Four explicit-zero controls refuse Scene; two omitted-height scenarios produce accepted partial
  Scene/Paint with6glyphs each, floor35/41 and row40/50. No rendered/native claim.
- Existing diagnostic variants use different menu labels/source paths. Mandatory new fail-first tests
  must compare otherwise byte-identical Lua with the SAME menu name and only height property changed.
  Do not claim the diagnostic proved internal causality beyond the observed acceptance difference.
- Fresh baseline24inputs at15:38:46Z unchanged. Three owner snapshots, each before/copy/after hash-equal:
  test-results/b119-explicit-zero-text-height-baseline-20260911T153846248Z/.
  Names are src__lib__x4UiLayoutProgram.ts.snapshot, src__lib__x4UiLayoutProgram.selftest.ts.snapshot,
  src__lib__x4UiScene.selftest.ts.snapshot. Full hashes remain in the referenced24input census.
- Bounded test-first implementation was prepared for ONE fresh Luna/max after the probe worker closed.
  Do not replay the old diagnostic as a green post-fix oracle: it intentionally asserts the old floor
  sample selection and records/refutes explicit-zero status. New acceptance tests must require repaired
  explicit-zero Scene/Paint behavior, preserving all original evidence and existing regression checks.
- RELEASED / IN_PROGRESS: fresh native Luna/max Aristotle01a09122-cf6b-7ae2-8771-68024b1d6208 owns
  the exact3files above, no descendants. Lagrange CLOSED/native not_found; parent replay terminated0.
  Parent will not run concurrent Node checks. Worker must produce fail-first evidence before correction.

## Parent integration review while implementation runs

- Previous goal turn PROGRESS: independently reproduced the public refusal/acceptance contrast,
  preserved evidence and dispatched the fresh worker. Current compact cursor3 confirms same active worker.
- SourceEdits1276-1315 reads original CallModel arguments/semantic properties for editable values, not
  derived outerHeight. Preserve that separation: raw height0 remains0 while calculated height is resolved.
- Layout13112 copies pendingFacts to the operation;13202 copies them to the cell after successful kernel
  specialization. Review the candidate at both points and retain initial unresolved-input early exits.
- Alternate-scale acceptance must include scaling enabled at1.25; changing only the profile while every
  fixture explicitly disables scaling is insufficient coverage. This clarifies the existing scale check.
- No production result accepted yet. Parent read-only review does not authorize more source owners.
- Scoped exposure search: literal height=0 was not found in current aic_menu.lua, aic_comm.lua or
  aic_hub.lua under the configured AI Influence source directory (rg exit1/no matches, not a test failure).
  This is general supported/imported-menu correctness, not a diagnosis of all current three-menu gaps.
  Parent has not searched every equivalent computed/aliased zero form or the whole vanilla corpus.

## Corrected fail-first review — 2026-09-11 16:13Z

- Previous user-status turn was a VERIFIED WAIT: the exact Aristotle task was confirmed active;
  it did not constitute new product completion. Full goal remains ACTIVE/PARTIAL, about45% judgment.
- Parent requested changes to the initial test draft before accepting any production edit: both Lua
  builders omitted the minRowHeight property name; the omitted-height control incorrectly required
  explicit metadata; createText was incorrectly assumed to expose descriptorFacts.height.
  Same worker/context corrected these fixtures. Initial failing logs are preserved, not treated as
  production-causal evidence. Glyph quad geometry fields were checked against the actual Scene type.
- Corrected raw evidence: test-results/b119-explicit-zero-text-height-20260911T160022545Z/
  fail-first-corrected-layout.log. Parent independently inspected selected details without running Node.
  Literal40/5, sampled40/5 and50/9, and enabled-scale1.25 omitted controls all satisfy their assertions.
  Explicit creator.outerHeight remains0 while cell/minTextHeight resolves35/35/41/20 respectively.
  Nonzero12 and both consumed-sample checks pass. Known-zero alias and unavailable-height negatives
  still need individual reconciliation; do not silently alter raw alias metadata or widen grammar.
- Layout production SHA remains2C8B2FB6297B37A853560423D21E1534557A9A8082272B79FA0DDA783E2D6B42
  at this review. No accepted source fix or rendered/native proof yet. Worker remains sole test runner.
- AAR triggers: invalid test fixtures, review-forced test corrections and repeated oversized tool output.
  Sustain the same-source positive control and independent review. Improve by checking emitted Lua,
  public type fields and compact evidence extraction before starting full selftests. Highest evidenced
  risk: a failing regression can test an invalid fixture rather than the claimed production behavior.
  Corrective practice is now applied to this bounded unit; no global memory or skill write is authorized.

### Alias-path reconciliation — 2026-09-11 16:18Z

- The direct raw-model literal-alias fixture returns refused/malformed-profile. This observation alone
  does NOT establish a product parser defect: PreviewPipeline1173 already calls the existing
  canonicalizeX4UiLayoutModel owner before projection. Layout1130-1178 removes detached sourceLiteral
  only from static identifier aliases in the Layout view while raw source-edit evidence stays separate.
- Parent instructed worker to compare the normal EditorSession route and reuse that canonicalization
  in direct Layout fixtures where required. Preserve original raw-route failure evidence. Do not use
  Helper.scaleY(0) as a silent replacement for literal-alias acceptance or build another sanitizer.
  Whether a separate product defect remains is pending the public-route executable result.

## Implementation / worker validation checkpoint — 2026-09-11 16:28Z

- Producer correction implemented in the one approved pendingFacts.outerHeight branch: text whose
  already-resolved height.value is0 now uses finalTextHeightFact before the explicit-height branch.
  Parent read the complete production delta. Other widget/nonzero branches and all Scene/schema guards
  are unchanged. Original Lua and editable metadata are not rewritten by this correction.
- Parent24-input census reports changes only in the three authorized source/test owners; other21 match
  the pre-unit census. Production hash at16:25Z:
  DB2BC9232C079B8D10C5A2F7838BF19A08BD68F22341B40440040B6749AF878D.
- Worker Layout run16:24:43.539Z..16:25:11.180Z exited0; parent inspected810/810, zero skipped and all10
  new B119 checks green, including canonicalized literal alias, helper-scale alias and missing metric.
- Worker Scene run16:26:08.844Z..16:27:11.423Z exited0; parent inspected193/193 and all four controls
  accepted partial Scene/Paint with4/4glyphs. The regression requires explicit/omitted semantic geometry
  equality; accepted partial is not complete-menu or native rendering proof.
- Evidence: test-results/b119-explicit-zero-text-height-20260911T162430083Z/final-{layout,scene}.log
  and corresponding -run.json records. Initial failures remain in the earlier160022545Z directory.
  Exact3-owner whitespace check passes. Remaining composition/static checks, frozen public probe,
  complete final test diff review, parent independent execution and graph refresh are still pending.
- Alias conclusion corrected: the raw direct projection bypasses existing Layout canonicalization.
  The normalized literal-alias regression now passes after the same producer repair. The earlier probe
  without canonical corpus cannot establish positive public Scene acceptance; final public probe must
  use the real loaded corpus. No separate parser/schema repair is authorized or justified here.
- Degradation checkpoint called after repeated fixture/reporting mistakes. Same worker finishes only
  this bounded repair/verification, then closes; next implementation unit receives fresh context.
  Full goal remains ACTIVE/PARTIAL. No commit/release/live-workspace action is authorized at this point.

## Parent rejection / real-corpus replay contract — 2026-09-11 16:42Z

Status: source repair remains PARTIAL pending independent real-corpus evidence. Next proof stage SPECIFIED.

- Parent read the entire final-public-session-comparison-probe.mjs (26037bytes). It fabricates ABC/DDS
  assets and replaces global crypto.subtle.digest with the contract's expected hashes. This is synthetic
  fixture evidence, NOT actual configured-corpus validation, despite its canonical-loader-issued label.
  The v2 run also has6failed assertions: five nonexistent raw metadata lookups and one helper-alias value
  assumption. The empty first wrapper invocation is not a successful test. Preserve all original files.
- Parent interrupted Aristotle for freeze/read-only finalization only. No more implementation in that
  context; confirm terminal/owned handles before cleanup. Production and the two regression files remain
  intact. Their pure unit results remain valid at their actual scope, not real-asset or visible proof.
- Reuse the VERIFIED real-byte loader at the start of
  test-results/b119-numeric-dependencies-reconcile-source-only.probe.txt: process-local exact reference
  root,8pinned files, independent createHash verification, path containment, local transport over real
  bytes, normal corpus/color loading and before/after corpus hashes. Never reuse its stale pre-fix source
  hashes or old explicit-zero refusal assertions. No synthetic fonts, mocked digests or private guards.
- One fresh Luna/max owns ONLY a new inert
  test-results/b119-explicit-zero-text-height-real-corpus.probe.txt and explicitly named new evidence.
  Stage1 writes/reviews that probe only, with no Node/npm/test execution while parent owns serial gates.
  All production, selftests, previous artifacts, docs, graph, corpus and mod files are read-only to it.
  Parent independently reviews and runs the saved probe after its freeze. No descendant/parallel test.
- Acceptance unchanged: otherwise-identical same-name/same-path pairs for literal40/5, sampled40/5,
  sampled50/9, enabled1.25 scaling, literal alias and helper-scale alias; nonempty accepted corresponding
  Scene/Paint geometry, exact semantic equality and original metadata/workspace/file bytes preserved.
  Do not expect dynamic helper-alias raw metadata to carry numeric value0: prove resolved0 from the
  existing kernel input, while comparing the raw property object unchanged. Use actual records and
  semantics.properties, not invented callModel.calls or semantics.height fields.
- Include nonzero-height and unavailable-metric controls without inventing height. Preserve existing
  stale/copy/issuer/profile/finite guards; no new grammar or production owner. Compact output must include
  the actual8asset hashes and24source/test before/after hashes, checks, exit status and source snapshots.
- Parent will independently run the required pure/static gates serially during artifact-only authoring.
  Graph refresh and durable close follow accepted unchanged-code execution, not this rejected probe.
  Full nine-journey, installed/native and three-menu/twelve-reference obligations remain unchanged.
- AAR correction: evidence fidelity, not the two-line producer change, is now the blocking weakness.
  Fixture hash overrides are legitimate only for explicitly labelled synthetic unit tests; they cannot
  be promoted into real-asset acceptance. Review source and actual bytes before trusting a green label.
  Local plan is the authorized ledger; no global memory/skill/external ledger write.

### Independent pure validation checkpoint — 2026-09-11 16:52Z

- Aristotle CLOSED/native not_found; all owned handles drained. Fresh Luna/max Lorentz
  01a0915b-1ab4-7351-8c3b-157d51699a98 owns only the real-corpus .probe.txt, STAGE1 authoring/UNRUN.
- Parent complete production + both test diffs reviewed against the3before snapshots. No additional
  production change required. Canonicalized literal alias and existing direct-helper alias are both
  covered; raw model/source metadata remains distinct from derived height.
- Parent independently ran all7pure/static gates16:46:06.345Z..16:50:35.557Z, exec10008 terminal0.
  Layout810/810/skips0, Scene193/193, SourceEdits164/164, Pipeline124/124, Session PASS,
  whole-project tsc0, exact3owner ESLint --max-warnings0; exact whitespace0. All24inputs unchanged.
  Machine baseline/run receipt and full logs:
  test-results/b119-explicit-zero-text-height-parent-20260911T164500483Z/{baseline,pure-gates-receipt}.json.
- Independent PowerShell Get-FileHash verified all8actual corpus files against the earlier pinned-byte
  census at16:52:10Z; real-asset-preflight.json in the same directory. Public projection over those
  actual bytes is still UNRUN. Do not count the rejected synthetic probe as that remaining gate.
- Agent-brain recall returned older July reference-API work, not this UI proof. Read conversation
  excerpts distinguish synthetic reference tests from real-corpus checks, but provide no current B119
  acceptance evidence. Current source, actual bytes and this task's executable output are authority.
- No graph refresh or source-unit close yet; wait for reviewed real-corpus probe execution. Goal remains
  ACTIVE/PARTIAL, all actual-interface, package/native and broader fidelity obligations unchanged.

- Parent reporting AAR: SourceEdits emits labelled text, not a whole JSON document. The first counts
  extraction produced a PowerShell parse error despite shell exit0; preserved as
  counts-extraction-attempt1.log beside the parent receipt. Corrected anchored terminal-summary parsing
  and explicit assertions verify164/164, Scene193/193, Layout810/810/skips0, six zero-valued Layout
  fixture/validator counters, Pipeline124/124 and Session PASS. See pure-gate-counts.json. No source
  edit or test rerun was needed. A shell exit alone is not sufficient evidence for report extraction.
- A final handoff patch used out-of-order hunks and was rejected before changes applied. Parent checked
  exact file content, reapplied ordered hunks and reran whitespace validation. No executable files changed.

### Real-corpus probe parent review — 2026-09-11

- Previous goal turn was a user-requested status report: NO PROGRESS toward acceptance. Continuation
  re-read the complete objective and this plan; product scope and all nine journeys remain unchanged.
- Lorentz completed artifact-only STAGE1, explicitly UNRUN. Parent preserved its 41760-byte draft as
  real-corpus-probe-stage1.snapshot in the164500483Z parent evidence directory; both SHA256 values
  FE8DC8252762D236D1AE1A27BD66ED33E07522A85BB44029BBE9400E5A75A2EB.
- Static review requests corrections before execution: capture raw source metadata before subsequent
  projections; actually compare original/projected ui.xml bytes; assert absent helper-alias raw value
  instead of merely nonzero inequality; bound receipt-listed reads to the repository; remove an
  unperformed parent-hash-check claim; distinguish runtime execution from authoring-agent UNRUN.
- Same Lorentz context owns only the probe correction, still no Node/tests or production edits. Parent
  executes the frozen result serially after reviewing its delta. Existing seven green source/static
  gates do not need another run unless their24inputs change. Real-corpus projection remains UNRUN.
- Triggered AAR: review found evidence assertions narrower than their labels. Original draft retained;
  source/workspace snapshots must precede the operations they are intended to audit. No new source
  defect or capability-map delta is established by these probe-only corrections.

## REVIEW / CLOSE — 2026-09-11 17:18Z

- VERIFIED at the explicitly declared source-level scope. Full goal ACTIVE/PARTIAL; no increase to the
  approximately45% product estimate is justified by this repair alone. All nine actual-interface
  journeys and packaged/installed/native/three-menu/twelve-reference obligations remain required.
- Actual bounded production delta: only the existing text outerHeight fact selection when resolved
  height is0. Reused the automatic-height kernel; no Lua rewriting, new grammar, renderer, history,
  deployer, Scene/schema guard relaxation, nonzero-height or other-widget behavior change.
- Acceptance1-2: corrected fail-first controls and complete snapshot-relative production/two-test
  reviews passed. Frozen source hashes match the16:52Z checkpoint; all prior regressions retained.
- Acceptance3: parent ran the corrected real-corpus public EditorSession probe17:14:53.897Z through
 17:15:06.691Z, exit0. Frozen43136-byte probe SHA256
 78A5A30EBA1CC067AFEFB0F285E7026CB834EC1CBAB87C9AE5B97E66F0F0F48B before/after.
 174/174 assertions,9cases:6same-source explicit-zero/omitted pairs, nonzero12,2negatives.
 All pairs produce accepted PARTIAL Scene/Paint with4glyphs per side, positive geometry and exact
 semantic geometry equality. Automatic heights35/35/41/20/35/35 include enabled1.25 scaling and
 literal/helper aliases. PARTIAL Scene/Paint is not a complete-menu or native rendering claim.
- Acceptance4: nonzero height remains12. Missing runtime inputs produce no invented text/glyph
 geometry; missing corpus refuses Scene. All15session-side workspace/Lua/ui.xml/raw-metadata
 preservation checks pass. Parent independently compared both reported censuses to frozen24source
 and8actual-asset baselines; all match. No synthetic fonts, digest overrides or forged authority.
- Acceptance5: numeric multi-dependency work and scenario rebinding remain explicitly open. This
 correction is not sufficient authority for scenario-preserving edits/history.
- Required pure/static gates already independently passed: Layout810/810/skips0, Scene193/193,
 SourceEdits164/164, Pipeline124/124, EditorSession PASS, whole-project tsc and exact3owner lint0.
 Their24inputs remained unchanged through actual-corpus execution and graph refresh, so no reruns.
- Graph refresh17:16:42.871Z..17:17:34.714Z exit0:11379nodes/28742edges/347communities. Byte-identical
 graph-before.snapshot retained; final graph SHA256
 BE40A70D087833761EE9D6054E4F45F39F25C989659969A114164242FE031EFC.
 CLI intentionally skipped graph.html above its5000-node limit; no browser opened. JSON/report
 refresh succeeded. No semantic extraction or external write was performed.
- Evidence directory:test-results/b119-explicit-zero-text-height-parent-20260911T164500483Z/.
 Real run:real-corpus-run-20260911T171453826Z.log, real-corpus-parent-run-receipt.json,
 real-corpus-parent-audit.json and graph-update-receipt.json. Raw log SHA256
 A90B5A91A29FB2556D2D89BEA8B746A3611B91E32F0DC49AAE72C7B78AF74C48.
- Lorentz CLOSED, native wait returned not_found. Parent processes10008/13462/98319 are terminal0.
 No live worker/test handle remains. No Git/publish/protected/external issue/wiki/config/memory write.
 HEAD remains93c9af111d63ca77c99dee11f21882c4073bcda6 on main; changes remain uncommitted.
- No capability-map delta: bounded correctness repair to an existing supported automatic-height rule.
 Owner issue41 is unchanged because external mutations are outside this checkpoint's authority.
- Commit point: fix(ui): preserve automatic text height for explicit zero. Suggested only; not committed.

### AAR outcome

- NON-CLEAN: review-forced fixture/evidence corrections, rejected synthetic proof, failed report parsing,
 and oversized/truncated parent reads are preserved above. The corrected real-corpus probe passed on
 its first parent execution; do not attribute earlier synthetic/fixture failures to this real run.
- Sustain: same-source pair controls, unchanged strict producer/consumer guards, real pinned assets,
 pre-operation snapshots, independent parent execution and promptly closed bounded Luna workers.
- Improve approach: initial evidence work took disproportionate effort for a small producer correction.
 Review assertion scope and actual field shapes before running expensive suites; avoid revalidating
 unchanged source gates and prefer one consolidated correction message to the same worker.
- Improve tools: reviewctl and referenced BlastRadius remain unavailable on this host; complete manual
 diffs, public-route execution and the existing code graph supplied the applicable review evidence.
 Keep large output parsed/filtered, with sufficient output budget for selected instruction files.
- Highest-risk evidenced weakness: a probe can label fabricated assets or post-operation snapshots
 as proof of real-data behavior/preservation. This unit reduced that risk through actual8file hashes,
 unmodified loader hashing, before-operation snapshots and explicit independent receipt comparisons.
- Lessons banked in this local project plan only; no memory/skill/global ledger write authorized.
- Final reporting correction: the wrapper attempted JSON.parse on mixed Git-warning/JSON command
 output and failed at the initial word warning. This is not a test failure. Preserve the exact
 observed parser error in final-receipt-extraction-attempt1.json, redirect final whitespace diagnostics
 to their own log, then repeat only read-only hashes/receipt extraction. Earlier output truncations
 plus this reporting mistake triggered a parent degradation call: close this checkpoint before a
 fresh-context next unit. No reimplementation or test replay is required by this reporting correction.
