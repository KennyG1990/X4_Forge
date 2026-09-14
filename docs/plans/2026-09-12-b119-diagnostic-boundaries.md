# B119 diagnostic boundary preservation
Goal: keep source-derived text readable while retaining truthful unavailable-region boundaries.
Lane: FULL
Status: PARTIAL (rendering/browser proven; required PaintPlan regression baseline-red)
Owners: existing B119 #41; full canvas-first goal and original three-menu/twelve-reference obligations unchanged.

PLAN
- Bounded unit: source-composition diagnostic strokes in x4UiCanvasRenderer.ts and its .selftest.ts.
- Observed: clean real Lua roundtrip screenshot has red internal lines around letters.
- Hypothesis: subtractRectangles(unknown region, known glyph/fill coverage) yields clipped fragments,
  and stroking each fragment invents internal edges that are not the unknown region's boundary.
- Design alternatives: remove diagnostics (loses uncertainty); new separate UI overlay (broader redesign);
  clip the original issued region outline to existing uncovered fragments (chosen, existing ownership).
- Acceptance: strokes remain original diagnostic geometry, clipped around known source coverage;
  no newly created fragment edges; some real unknown boundary remains. Diagnostic-map unchanged.
  No source/Scene/Paint/corpus authority, tints, layout metrics, glyph quads or known-output gate changes.
- Non-goals: hiding unsupported content, new geometry/font renderer, native-fidelity claim, changing
  numeric oracles, six remaining interaction fixtures, scenarios, installation/config/release.
- Required validation: fail-first public renderer trace using existing canonical producer fixture,
  complete CanvasRenderer selftest, PaintPlan regression, whole tsc, strict2file lint, exact diff review,
  real unchanged Lua browser journey with retained trace and actual final image inspection.
  Verify existing source-tinted fill/glyph preservation, no-source-output refusal, forged input and
  diagnostic-map tests retained. All source/test inputs frozen during final browser validation.
- Risks: removing meaningful diagnostic boundaries or drawing over known content; retained clips and
  exact original geometry must govern. No network/spend/deletion/persistent-config surface introduced.
- Rollback: exact pre-unit copies in test-results/b119-diagnostic-boundaries-20260912/*.before;
  reverse only these unit hunks. Preserve existing dirty work; no Git mutation.
- Evidence: same directory (logs, baseline, trace/images, receipt). Existing clean pre-unit actual image:
  test-results/b119-workspace-selection-clean-20260912/returned-original.jpeg.
- Native/installed gates remain unavailable for this repair and required for full goal.

BASELINE / RECONCILE
- HEAD93c9af111d63ca77c99dee11f21882c4073bcda6; pre-unit clean Lua journey1/1,0flakes;
  45pins/19guards unchanged,3200/3201free,Deckwright3100PID30164,game stopped.
- Graph renderer -> CanvasRenderer.ts -> FontMetrics.ts confirms existing link; live source authoritative.
- Current buildOperations strokes every subtractRectangles fragment; sourceCompositionCoverage already
  owns exact known glyph/fill exclusions. Reuse both. No replacement architecture justified.
- Existing makeRasterFactory models fills and glyph blits but NOT stroke pixels; supplement with
  actual stroke-path assertions and actual browser screenshot, not old fill-only preservation claim.
- Capability delta if proven: honest diagnostics no longer introduce fictitious internal boundaries.
  No external issue/wiki or global-memory write; bounded evidence local.

BATCH
1. Add failing original-region stroke assertion to current sourceRasterTrace fixture; preserve >0 strokes.
2. Clip each original boundary stroke to uncovered fragment instead of outlining fragment geometry.
3. Full renderer/Paint/static/strict review then unchanged real browser acceptance/visual comparison.

CLOSE / AAR
- Pending. Full goal PARTIAL. Do not infer glyph/font correctness from this overlay repair.
- Trigger: rendered defect and previously incomplete stroke test oracle; sustain original source masks,
  improve coverage of actual stroke paths/pixels. Other overlapping-text causes remain unproven.
- Reconciliation amendment: first existing tint fixture yielded0 diagnostic strokes (all regions covered),
  so its171/172 red result was NOT defect reproduction. Initial proposed renderer hunk rolled back;
  original hash034E95071D6CA9E3C61504C0A992029B60C6B0B91C7B96FA9C35C690F5FF55B5 verified.
  Replace new assertion fixture with source-issued text over an unknown background; require actual
  diagnostic strokes before judging their paths. Do not count a vacuous fixture as fail-first proof.
- PaintPlan fails10/12 before dependent cases: actual aic_sheet sample count56 vs expected55.
  Same failure rerun with exact ORIGINAL renderer hash restored; keep oracle intact and log separately.
  This baseline red prevents all-PaintPlan/full-goal green claims, not permission for unrelated repair.
- Corrected fixture must use Preview.scene -> projectX4UiPaintPlan with authentic previewAuthority;
  Preview has no top-level .paint. The first new fixture error is preserved in fail-first-corrected logs.
- [REPRODUCED] Correct producer fixture against original renderer:171/172, new assertion alone fails;
  3 issued gap rectangles,10 actual strokes,10 invented fragment boundaries. Evidence:fail-first-producer.*.
- Implemented only original geometry + fragment clip in existing buildOperations. No other branch changed.
  Renderer172/172. Fresh review added non-vacuous known-glyph census and per-stroke clip overlap checks:
  gap clips must exclude every known glyph rectangle. Final renderer172/172; whole tsc and strict2lint exit0.
  Existing callback/forged/no-visible-output/diagnostic-map matrices all reached and retained.
- Complete pre-unit two-file diff reviewed. No unrelated churn or whitespace errors. No new external
  surface, source/Scene/Paint/layout metric change, policy relaxation or acceptance-oracle weakening.
  reviewctl and .reviewctl/rules.yaml absent; no automated review claim. Existing Graphify AST refresh
  exit0,11520nodes/29033edges/349communities, HTML5000-node guard retained. No LLM extraction.
- Final browser inputs frozen at46pins (old45 plus renderer selftest); only expected renderer drift
  against previous unit.19persistent guards unchanged/zero added/deleted; game stopped; no runners;
  3200/3201free,Deckwright3100PID30164. Same full Lua test,workers1,120s budget,zero-flake oracle,trace on.
  Browser acceptance/screenshot comparison and final receipt pending. No claim of PaintPlan green.
- Degradation call: two fixture mistakes in this stretch; finish this bounded verification and hand off
  before next change. Sustain source-issued fail-first proof; improve API reconciliation before coding
  test fixtures. Highest evidenced test weakness: fill-only raster double does not model stroke pixels;
  repaired boundary/clip trace checks plus actual browser image are required, not fill-only success.

FINAL CLOSE — 2026-09-12
- Same unchanged real Lua journey PASS1/1,0flakes,all16checkpoints; case1.3min,total1.9min,exit0.
  Full structured report/lifecycle/ownership complete; treeGone. Independent verifier exit0,zero browser
  errors; exact workspace/source/bitmap/hierarchy/profile return and import/history/refusal preservation.
- Actual before/after screenshots inspected: internal red glyph-fragment barcode removed; source text
  readable, outer diagnostic outlines retained. Both downloaded Lua files2818/2815bytes and SHA256s
  EXACTLY identical to pre-repair run. No source/glyph/layout change inferred from cosmetic improvement.
- Screenshot returned-original.jpeg SHA2569A96319DBA9E419895047F0E7F8236933521B4DF4F2829B0D4A3B7B5B10275D5;
  original trace entry and all deterministic gates in receipt.json; body proof in roundtrip-proof.json.
- Final PaintPlan rerun exit1,10/12,SAME56vs55 fixture failure; dependent matrices not executed.
  Status remains PARTIAL; required red was neither waived nor repaired outside scope.
- Final graph refresh exit0,11520nodes/29034edges/338communities; HTML guard unchanged.
- Final safety11:34:55Z:46pins unchanged,19guards unchanged/zero added/deleted,0runners,3200/3201gone,
  Deckwright3100PID30164 unchanged,HEAD unchanged. All validators terminal. No Git/external/live writes.
- Requirement review: original paths/masks, known-content protection, diagnostic-map/negative paths,
  static checks, genuine browser/unchanged Lua evidence DONE. PaintPlan PARTIAL. Native/installed and
  full nine-journey/three-menu/twelve-reference fidelity remain required for whole goal, not evidenced here.
- AAR: source-issued fail-first and actual visual comparison sustained; two avoidable fixture mistakes
  and incomplete old stroke oracle corrected. Local records bank lesson; no global memory/wiki writes.
- Suggested commit: fix(ui): preserve original diagnostic boundaries (not committed/pushed).
