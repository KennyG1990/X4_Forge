# B119 remaining visual authoring journeys
Goal: prove ordinary widget/row creation and source history through the actual interface.
Lane: FULL
Status: PARTIAL — six browser cases green; fresh-row Input visibly absent
Owner: existing B119 #41; all nine journeys and three-menu/twelve-reference obligations retained.

PLAN
- Bounded unit: tests/e2e/x4-ui-source-editor.spec.ts only; six remaining authoring cases.
  No production change unless an actual failure requires a separately documented amendment.
- Reuse current contextual palette, exact SourceEdits transactions, App history, real corpus fixture,
  existing serial browser harness and single-source-delta/sibling-preservation oracles.
- Three standalone widget cases must retain insert/select/edit/pixels/locality, then verify occupied
  cells expose NO Text/Button/Input insert action, leave source unchanged, and offer Add row below.
  Actually click Add row; require exactly one local canonical row declaration, preserved sibling/XML
  bytes and prior widgets, fresh selected Cell1 with all three insertion actions enabled, real screenshot.
- History row-count helper must match the exact visible child label, not concatenated row+subtitle text.
  Preserve row counts/order, source inverses, pixel equality, keyboard/history boundaries and negatives.
- Run all six cases: standalone Text/Button/Input; same-menu all three widgets; New-menu row/Text
  history; three populated rows with inverse/history/continued editing. Unchanged60s case budgets,
  individual polls, workers1, retry1, zero-flake oracle. No skipped/substituted cases.
- Required validation: exact TypeScript/strict test-file lint, source-delta oracle selfchecks on module
  discovery, six-case real browser run with trace retained and actual screenshots inspected, independent
  artifact/source/history checks, complete diff review and deterministic Graphify refresh.
- Negative: occupied insertion absent/all three kinds; source unchanged before recovery; one row only;
  unchanged sibling/XML/source bytes; all existing history/no-false-success checks retained.
- Native/package/full E2E remain required for full goal, not applicable to claiming six-case acceptance.
  Existing numeric Scene/Pipeline/Paint reds are retained; no numeric oracle edits in this unit.
- Risks: replacing stale copy checks with weaker tests; selecting wrong hierarchy row; claiming old
  performance fixes solve longer journeys without running them. Exact source/render evidence governs.
- No new network/spend/delete/config/install/game/mod/release/Git surface; no live workspace mutation.
- Rollback: reverse only this unit's test hunks against exact test-results/b119-authoring-journeys-20260912/
  x4-ui-source-editor.spec.ts.before. Preserve all unrelated dirty/deleted/untracked work.

BASELINE / RECONCILE
- HEAD93c9af111d63ca77c99dee11f21882c4073bcda6; previous46pins/19guards unchanged at11:40:04Z;
  X4 stopped,3200/3201free,no runner,Deckwright3100PID30164 unchanged. No fresh machine question needed.
- Previous goal turn PROGRESS: diagnostic boundary repair and clean real Lua journey. Whole goal PARTIAL.
- Old actual16case receipt at test-results/b119-rendered-20260912T064340Z/final-receipt.json retains8fails.
  Property recovery/Lua later passed; these six remain. Do not report16green from separate narrow runs.
- Graph confirms SourceEditor imports existing applyX4UiSourceStructuralEdit; no second writer needed.
  Agent-Brain recall/read yielded only unrelated June Forge history, no contextual-insertion discussion.
- Current palette3791/3811/3834 distinguishes unavailable cells from valid row recovery. Once both cells
  are occupied, it deliberately offers another row; old standalone test final copy is obsolete.
- [REPRODUCED] Saved history trace BUTTON contains adjacent child spans "Row 1" and "row · geometry
  issued". DOM text concatenates to "Row 1row..."; /^Row \d+\b/ misses it. Exact visible label descendant
  matching avoids subtitle coupling while preserving counts. Actual source has same span structure.
- Two long cases last failed with old~6s actions; current full-byte comparison optimization proven in
  prior unit. Re-run originals now, do not silently raise their budgets or presume success.
- Canon: full objective/original brief/approved canvas-first plan; ADR-F1/F5 and capability map read.
  No production/capability-map delta yet. External issue/wiki unchanged; local evidence authoritative.

BATCH
1. Preserve baseline; amend exact stale assertions and row-label matching, add recovery locality proof.
2. Static checks/fresh diff review; freeze inputs; serial six-case browser gate and artifact inspection.
3. Record precise close/AAR/next unit. Stay PARTIAL for any failed/unreached required case.

CLOSE / AAR
- Final checkpoint 2026-09-12 12:04Z: PARTIAL. Actual six-case gate PASS6/6,0flakes, but required visual
  inspection found fresh-row Input absent. Do not close this authoring experience from green tests.
- Receipt: test-results/b119-authoring-journeys-20260912/receipt.json. First failed run remains retained.
- Triggered AAR: stale assumptions, first4/2failed run, product scope amendment, authentic fail-first,
  and visible Input coverage gap. Sustain source/workspace/bitmap inverse oracles and image inspection.
- Improve work: exact child labels and useful recovery, plus actual ink/height for each added widget.
  Improve tools: bound output and emit one image per call; completed graph handle already consumed,
  so use retained completion log instead of rerunning. No automated reviewctl claim (not installed).
- Highest evidenced weakness: same-menu automation accepts an Input absent from the actual preview.
  Next bounded fix must diagnose actual issued row/widget/text geometry and add a visible-ink assertion.
- AAR banked locally in this plan/receipt. No global memory, external issue or wiki changes.

FIRST RENDERED RUN / RECONCILIATION AMENDMENT
- Actual six-case run exit1:4passed,2failed,0flakes; all cases terminal,3.0min. All three occupied-cell
  recovery cases AND complete three-populated-row/inverse/history/continued-edit journey passed.
  Evidence:browser.stdout.txt, browser-artifacts, first-run-safety.json.46pins/19guards unchanged;
  3200/3201gone,Deckwright3100PID30164 unchanged,no runners. Keep this failed receipt/history intact.
- [REPRODUCED] Same-menu journey completes all three inserts/edits; final button text search finds both
  Widget and Text child. Require exact caption kind instead of broad value-only match. Input default
  value currently absent from generic Widget/Text hierarchy labels; retain its meaningful-value check
  to expose this potential product gap, not replace it with a weak generic Widget count.
- [REPRODUCED] History now passes initial row count, authoring and exact scalar Undo source transition;
  fails expecting empty selection. Approved scalar-history continuity now preserves selected Text.
  Amend helper/call sites to REQUIRE automatic selection on scalar inverses (no re-click) while keeping
  clear/reselect assertions on structural row/widget insert/remove. Pixel/source inverse checks remain.
- No production changes yet; no timeout/retry/flake budget changes. Re-run original six cases after
  amended static checks/freeze; status stays PARTIAL while any meaningful authoring check fails.

NECESSARY PRODUCT REPAIR — INPUT HIERARCHY DISPLAY CONTENT
- Actual same-menu screenshot/DOM has generic Widget/Text for the input after its default text edit.
  Source reconciliation: Scene.text.contentSelection='preview-default' selects defaultContent for paint,
  but presentation.labelFor reads only primaryContent/content (empty current input). Existing source
  owner already distinguishes current/default/runtime-unknown; presentation discards that decision.
- Extend scope before implementation: src/lib/x4UiBuilderPresentation.ts and its .selftest.ts, plus
  existing E2E test. No Scene/Paint/Layout/SourceEditor/transaction change. Exact new snapshots required.
- Design alternatives: weaken hierarchy check to generic Widget (does not improve navigation); infer
  placeholder from Lua or always show default (could contradict runtime uncertainty); reuse issued
  Scene contentSelection and defaultContent in Text-child label (chosen). Widget identity unchanged.
- Acceptance: selected preview-default Text child shows its actual displayed default string; current
  content takes precedence when current is selected; unavailable/runtime-choice must not adopt default.
  Missing selected default must not fall back to unrelated current text. Ordinary non-input labels,
  geometry/identity/selection/provenance and canonical Lua unchanged.
- Add fail-first actual producer-backed mapper check plus branch negatives; full mapper and full mounted
  SourceEditor selftests, whole tsc, strict three-file lint, diff review and six actual browser journeys.
  Preserve existing meaningful Input-value hierarchy assertion; do not hide the product gap in tests.

IMPLEMENT / VALIDATE / REVIEW — FINAL
- Only three code/test files changed relative to exact pre-unit .before snapshots. Presentation Text
  child now follows issued preview-default/defaultContent; Widget identity and all geometry/source
  owners unchanged. Authentic original mapper fails only new expected Text vs Text · Type here check;
  final full mapper passes, including current/default/runtime-unknown/missing-default negatives.
- Full mounted SourceEditor exit0; tail includes async9/9,selection9/9,input6/6,export6/6,newMenu25/25,
  direct callback discard12/12,stale retained-cell and unnamed-chunk actual Session probes PASS.
- Whole tsc and strict exact3file lint exit0; complete pre-unit diff reviewed; whitespace check0.
- Graphify completion log:11522nodes,29037edges,349communities,AST only; HTML5000-node guard retained.
- Exact browser command (same60s case budgets,workers1,retry1,zero-flake policy):
  node scripts/run-e2e.mjs tests/e2e/x4-ui-source-editor.spec.ts --project=chromium --workers=1
  --grep 'contextually inserts and edits|across fresh same-menu rows|preserves actual browser history|moves three populated rows'
  --trace=on --output=test-results/b119-authoring-journeys-20260912/browser-final-artifacts
  Final exit0,PASS6/6,0flakes,all terminal,1.9min; case seconds13.8/11.1/11.2/17.5/25.4/26.3.
- independent-proof.json: all3recovery paths add one canonical row, preserve entire other workspace,
  siblings/XML; same-menu4rows/all3edited kinds; history14checkpoints/9exact source+bitmap inverses;
  movement11checkpoints/8exact source+workspace+bitmap inverses. Verifier and syntax check exit0.
- Actual movement moved-down/inverse-up images visibly swap Text and Button back correctly.
  Standalone Input visibly paints in populated row. However same-menu-add-row-widgets.png has no
  visible fresh fourth-row Input: source/property/hierarchy succeed, cyan line under Button only.
  [REPRODUCED] visible absence/test coverage gap. [HYPOTHESIS] height or clipping; cause not diagnosed.
  No arbitrary fixture enlargement or oracle relaxation authorized by this evidence.
- Safety11:58:26Z:46pins unchanged,19guards unchanged/zero added/deleted,HEAD unchanged,treeGone,
  no runners,3200/3201free,Deckwright3100PID30164 retained. No Git/release/install/game/mod/config writes.
- Review: recovery/source locality/history/movement/default label DONE AND EVIDENCED; full same-menu
  visible authoring PARTIAL. Full nine journeys,3native menus,12references,numeric/scenario/release
  obligations remain. No external capability-map delta; local receipt records bounded evidence only.
