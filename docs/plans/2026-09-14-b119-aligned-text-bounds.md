# B119 aligned fontstring bounds

Status: VERIFIED (bounded repair). FULL lane. B119/#41/full objective remains PARTIAL.
Goal: render right/center-aligned text inside the same native-anchored bounds used by glyphs.
Architecture: shared plain-text horizontal-anchor helper within existing Scene. Apply it to
declared widget width and measured line width separately. Preserve all ancestor intersections.

PLAN / BASELINE / RECONCILE
- Prior goal turn PROGRESS: six actual-corpus cases prove2.5625px clipped from right-aligned
  e despite fitting both declared width and cell. Read full goal and diagnosis plan.
- Baseline06:59:49.138Z, HEAD93c9af1,410pins/50artifacts/4realLua/19live membership unchanged.
  Evidence:test-results/b119-aligned-text-bounds-20260914/. Exact3owner bytes in baseline.json.
- Owners: src/lib/x4UiScene.ts, src/lib/x4UiScene.selftest.ts,
  tests/e2e/x4-ui-source-editor.spec.ts. No other owner without recorded reconciliation.
- Native widget_fullscreen6243,13140-13173 sets anchor/alignment,17733-17780 boxwidth.
  Reuse width facts and truncation unchanged. Align the widget box as well as its text.
  Unknown alignment emits unavailable widget geometry using existing fallback; no guessing.
- Existing direct-text test assumes left-positioned outer bounds for every alignment:
  correct that source-contradicted expectation explicitly; preserve width/Y checks.
- Alternatives rejected: remove clips (unsafe), change metrics (contradicts actual assets),
  move glyphs left (breaks native right anchor). Shared anchor prevents parallel drift.
- Accept left/center/right, narrow explicit/omitted widths, nonzero offsets, fractional
  center rounding, unknown alignment, ancestor clip preservation, no unrelated source edits.
- Validation: new fail-first Scene regression; fullScene/Paint/Canvas, fulltypes/scopedlint;
  actual-corpus before/after glyph geometry; serialized3200/3201 E2E existing layout,
  missingproperties, longtext, lockedrecovery. Inspect screenshots, exact source/history/
  UndoRedo and existing inspector retention/pixel assertions. No golden regeneration.
- Artifacts only under local evidence/test.info().outputPath; prior output audit unchanged
  and current test delta must be read before run. Wrapper freezes all410pins per child,
  checks no X4 and ports, verifies structured verdict and stack stopped/live bytes unchanged.
- No Git/commit/push/release/install/reload/mod/game/save/config/wiki/issues/global-memory
  writes or agents. Native fidelity stays unverified. Rollback only exact task delta over
  stored dirty baseline, never HEAD. No capability-map delta for an existing renderer repair.
- Execution-plan skill used for checkpoints. Continue-safe-work overrides routine feedback
  pause, not genuine authority gates. Full9journeys/3menus/12references/gates remain.

IMPLEMENT
- Shared plainTextX uses native left/right/center anchor and half-pixel correction. Declared
  widget box uses declared width, glyph lines use measured width. No pen/glyph/UV changes.
- Unknown plain-text alignment uses existing unavailable-widget path. Nontext widgets and
  all cell/row/table clip intersections unchanged. No parser/source/history/authority edits.
- New six-way explicit/omitted/alignment regression plus unknown-alignment rejection. One
  old direct-text outer-X expectation corrected from universal-left to native aligned box;
  its width/Y/line checks retained. E2E file stayed byte-identical (zero delta).

VALIDATE (append-only receipts/logs under evidence directory; exact commands therein)
- scene-red FAIL1: center/false declared box left mismatch, before product implementation.
- scene-green PASS196/196; paint PASS215/215; canvas PASS172/172. Canvas reference traces
  unchanged. Types full tsc --noEmit PASS0, scoped ESLint PASS0.
- geometry-after + geometry-verification PASS0: six actual-corpus cases. Independent
  before/after comparison proves complete line/ancestor objects and all glyph positions,
  UVs, advances/metrics unchanged; widths/heights/Y unchanged. Left scene record unchanged.
  Both right-aligned last e glyphs now retain8.75px vs6.1875px, at same205.8125..214.5625.
- rendered PASS4/4first0flake0skip0reporterrors, worker1/3200+3201: longtext32.3s,
  missingproperties26.6s, layout18.2s, lockedrecovery. Existing exactsource/history/UndoRedo,
  siblingpixels, inspector286->286 and ancestor checks remain green. All screenshot/writer
  destinations re-audited in selected spec: test.info().outputPath, no new writers.
- Actual layout-alignment.png shows complete final e; text-properties-after-font-size.png
  retains legitimate ellipsis for overlong caption and intact sibling. long-text-wrapped.png
  inspected: supported wrapped content and missing-input recovery still visible.
- Structured runner receipt green, complete4/4 and treeGone=true; X4absent, only unchanged
  Deckwright3100/PID54964.410pins/50priorartifacts/4realLua/19live files+membership preserved.
  All handles terminal, including rendered88595. No test rerun or owner write during jobs.

REVIEW / CLOSE
- Entire baseline-relative Scene and selftest diffs read; E2E zero delta. Width, font, source,
  layout, history, nontext anchors and ancestor clipping not weakened. Unknown alignment
  deliberately unavailable. Fullscene/paint negative families and independent source-backed
  realfont probe cover the declared scope; source provenance remains native13140-13173.
- reviewctl unavailable on PATH; manual diff/source review + ESLint used, no installation.
- No capability-map delta; existing renderer correction. No Git/commit/push/release/install/
  config/mod/game/save/wiki/issue/global-memory writes. Rollback exact2changed owner delta
  against baseline.json. No Canvas-golden owner extension needed.
- Scope VERIFIED; fullgoalPARTIAL and gameVerified=false. Four journeys are not fullsuite,
  packaged-host/native or complete3menu/12reference/9journey evidence.
- Next major gate: reconcile previously failed full integration cases against subsequent
  repairs, re-audit ALL full-suite writers/cache paths, then run the complete isolated suite
  on current inputs. Previous full run126/130 remains FAILED until a complete new verdict.
  Do not substitute more polish or micro-optimizations for this integration checkpoint.
- Commit point: fix(ui): align fontstring bounds with native anchors (not committed).

AAR: NON-CLEAN (deliberate fail-first; corrected old source-contradicted oracle; oversized
combined reads). Sustain shared native anchor and realfont before/after comparison; preserve
all failed evidence and fullsuite obligations. Improve work: capture actual bounding data
before changing font/raster assumptions. Improve tools: summary-key/character-bound reads,
not raw long JSON log lines. Highest-risk observed weakness was independently positioned
text and clipping bounds; now one helper and negative/realfont/rendered regressions. Lesson
banked in this project plan; no global or external writes.
