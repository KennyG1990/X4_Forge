# B119 right-edge text investigation

Status: VERIFIED diagnosis; implementation pending. Lane: FULL diagnostic; B119/#41 PARTIAL.
Goal: identify why the final glyph in right-aligned Layout sample appears clipped.
Previous goal turn PROGRESS: inspector continuity verified in three rendered journeys.

PLAN / BASELINE / RECONCILE
- Read full objective, current handoff/backlog; preserve9journeys/3menus/12references and
  packaged/native obligations. Canonical Lua and existing owners remain authoritative.
- Baseline06:51:49Z prior inspector checkpoint PASS; HEAD93c9af1,410pins,50olderartifacts,
  4realLua,19live files/membership. No product mutation in this diagnostic unit.
- Graph Scene imports FontMetrics/TextLayout/LayoutKernel and is consumed by PaintPlan,
  PreviewPipeline/BuilderPresentation and tests. Read current capability map and ADR tail.
  Recall hit read: July mod suggestion UTF8 truncation, not this renderer; no prior solution.
- Existing layout-alignment.png shows final e partly absent. Native widget_fullscreen.lua
  6243 and13140-13173 prove parent-cell alignment anchor and width propagation. Current
  Scene follows anchor; determine which geometry/paint/atlas stage first loses coverage.
- Alternatives: alter glyph metrics (requires descriptor evidence), alter clipping (requires
  native parent/width evidence), preserve rendering if source legitimately overflows.
  No preferred code change until probe resolves the cause.
- Reuse canonical corpus replay transport with original-file BOM verification and existing
  EditorSession pipeline, not a parallel layout implementation. Exact fixture and several
  alignments/sizes; record last-glyph versus clip/advance bounds and source-derived geometry.
- Evidence: test-results/b119-right-edge-text-20260914/. Use existing inspector wrapper
  append-only right-edge labels; every child freezes410pins and checks protected bytes.
- Acceptance: reproducible exact stage/local geometry, source reference and bounded next
  action; if implementation needed, revise plan before product edits. Never delete clips or
  change typography to make screenshot attractive. gameVerified=false.
- Negative control: same label left/center/right and a short label; preserve original input
  bytes. Validate probe with assertions, inspect current rendered image, final guard.
- No Git/commit/push/release/install/reload, realmod/game/save/config/wiki/issues/global
  memory writes. No agents. Scratch probe and repository records only; rollback exact new
  diagnostic files, do not restore dirty owners from HEAD. No capability-map delta yet.
- Planning/brainstorming used for scope and alternatives; continue-safe-work instruction
  overrides routine feedback/commit pauses. Original authoring architecture not redesigned.

IMPLEMENT / VALIDATE
- Added geometry.mjs using canonical corpus loader/EditorSession with original BOM-only
  replay reconciliation. Six exact cases: Layout sample/e, left/center/right. The source
  workspace stays byte-identical. No product file edited.
- right-edge-probe receipt06:55Z PASS0, and independent right-edge-verification receipt
 06:57Z PASS0 under prior inspector checkpoint. All410pins/protected files unchanged.
- geometry.json records full scene/widget/cell/glyph data. verification.json binds native
  and Scene reference files by SHA256, with6asserted positive/negative diagnostic cases.
- Both right-aligned labels: declared width207; line widths125.5625 and10.0625 respectively,
  so neither overflows. Last e glyph width8.75, clipwidth6.1875: exactly2.5625px lost.
  Glyphright214.5625 is inside cellright220 but outside widgetclipright212. Left/center
  controls retain full glyphs, no ellipsis. Thus neither atlas, advance nor input length
  explains the clipping; Scene has already lost coverage before Paint/Canvas.
- Native13140-13173 sets anchor215 and horzalign=right;17733-17780 supplies width207 as
  boxwidth. A right-anchored width207 box spans8..215, not current5..212. The same e fully
  fits that box. This anchor/box interpretation is source-backed; native game observation
  remains unperformed and gameVerified=false.
- Viewed existing actual rendered layout-alignment.png: the reproduced clipped final e
  matches these metrics. This unit did not launch new UI or assert a repaired screenshot.

REVIEW / NEXT IMPLEMENTATION CONTRACT
- Reviewed the probe's exact fixture, corpus identity, independent numeric checks and
  negative controls. The intended next repair is alignment-aware plain-text box geometry
  at existing Scene widgetOuterRect/caller, using the SAME native anchor as glyph layout.
  Keep width/truncation/font metrics, row/cell/table clipping, and nontext widgets unchanged.
- Do not merely remove the widget clip, widen it arbitrarily, shrink the font, move the
  glyph anchor, or use the caption's measured width as the declared widget width.
- Before code edits: baseline a new Scene/Scene-selftest/E2E unit from inspector
  types-positioned-receipt. Add failing right/center narrow-explicit and omitted-width
  cases, left/unavailable-alignment controls, and row/cell boundary preservation checks.
  Reconcile unknown alignment explicitly; don't invent a rectangle when the source cannot
  determine its position. Review all widgetOuterRect consumers/geometry authority.
- Required next gates: full Scene/Paint/Canvas tests, fulltypes/scopedlint, serialized
  layout/missingproperties/longtext/lockedrecovery E2E and actual final-glyph screenshots.
  If literal golden expectations change, prove only source-justified fields changed;
  no blind regeneration. Preserve previous inspector scroll and sibling pixel assertions.
- No capability-map delta; no product improvement claimed from diagnosis alone. Full
  authoring and packaged/native obligations remain; this is not builder completion.

CLOSE / AAR
- VERIFIED diagnosis and bounded next action. All diagnostic children terminal, no source
  mutation. No Git/commit/release/mod/config/issue/wiki/global-memory writes.
- AAR non-clean: oversized skill/combined reads needed bounded follow-up; a broad corpus
  filename search was slow. It completed normally (handle40392), never restarted/killed.
- Sustain: exact real-font fixture plus a single-letter negative-control distinguishes
  misplaced clipping from text overflow without weakening the renderer's authority.
- Improve work: inspect the provenance-owned native path directly rather than traversing
  the whole unpacked corpus; select summary receipt keys before printing410pins.
- Highest-risk evidenced weakness: widget rectangle and glyph placement independently
  interpret plain-text x/alignment. Next repair must keep both based on the same native
  anchor and retain all ancestor clips. Project lesson banked here; no global writes.
- Commit title after actual repair/gates: fix(ui): align fontstring bounds with native anchors.
