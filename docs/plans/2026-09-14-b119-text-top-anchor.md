# B119 plain-text row-top anchor repair

Status: VERIFIED for bounded source/browser repair; full B119 PARTIAL. Lane: FULL. Parent: B119 / #41.
Goal: changing one cell's font must not vertically move and clip an unchanged sibling.
Architecture: correct the existing Scene plain-text coordinate conversion; retain canonical
Lua, layout/kernel height ownership, Zekton assets and all clipping/paint/history owners.
Tech: TypeScript, source-issued Scene tests, isolated Chromium.

## PLAN / RECONCILE

- Observed: missing-property browser screenshots show a normal sibling before fontsize20,
  then almost no sibling at24. Source bytes of that sibling are identical.
- Existing Scene buildTextNode2594 centers plain text in final parentRect.height, while
  widgetOuterRect2259 uses cell top + own offset/height. No new renderer is needed.
- Authority: shipped ui/widget/lua/widget_fullscreen.lua6243 passes curRowHeight/2 relative
  to the centered cell (row TOP in native Y-up). setUpFontString13140-13174 subtracts y
  from that parent top; updateFontString17733-17784 does not add a row-height dependency.
  Helper text descriptor5494-5561 owns size/offset. Browser Y-down is row top + offset.
- Read graph orientation, source owners, original brief, approved canvas-first plan,
  capability map and ADR-F1/F5. No source/corpus/authority relaxation is proposed.
- Alternatives: enlarge/remove clips (reject: masks geometry and weakens containment);
  center in own descriptor height (reject: still invents a height-dependent anchor);
  convert native row-top anchor (selected: matches setup call chain).
- Existing wrapped-text test explicitly expects centered span300.9375..413.0625 in114px.
  This is an internal oracle, contradicted by the source call chain, not native proof.
  Reconcile it BEFORE implementation to exact top300..412.125 while retaining112.125px
  span, all clipping, overflow, source pins, viewport-only and negative assertions.
- Native raster origin/Anark behavior remains provisional; no game-verified claim.
- Product owners: src/lib/x4UiScene.ts and src/lib/x4UiScene.selftest.ts only.
  Browser test owner tests/e2e/x4-ui-source-editor.spec.ts may add sibling invariance checks.
  Reuse latest five-owner missing-property work unchanged except this test strengthening.
- Out: buttons/icons/editboxes, font metrics, parser, clip removal, public release, Git,
  install/reload, real mod/game/config/save, external wiki/issues/global memory.
- Risk: plain-text placement changes other menus and old surrogate oracles. Full Scene,
  paint, renderer, types and focused browser proof required; larger fidelity gates stay open.
- Rollback: exact new baseline owner byte snapshots; never reset dirty files to HEAD.

## BASELINE / ACCEPTANCE / TASKS

Evidence: test-results/b119-text-top-anchor-20260914/. New checkpoint copied mechanically
from prior guarded harness, seeded from rendered-visual receipt; preserve410input pins,
50older artifacts,4real Lua,19live membership and HEAD93c9af1. Capture before mutations.

1. Add fail-first Scene regression: mixed-height siblings retain exact own text/glyph
   positions at row top; positive Y moves down; multiline starts at top. Existing clips
   remain effective. Use current source-issued fixture owner; do not forge authority.
2. Correct only plain-text yBase. Other widget branches unchanged. Update only documented
   contradictory centered-span oracle with source-backed exact top values.
3. Run full Scene, paint-plan, canvas-renderer selftests, typecheck and scoped lint through
   guarded wrapper. Retain failures, do not skip or change unrelated oracles.
4. Canonical real-corpus probe records before/after mixed-font Scene coordinates. Browser
   rerun missing-property + existing layout/recovery journeys3200/3201 workers1; all
   writers audited to outputPath, stacks gone, live state unchanged. Inspect screenshots.
5. Review complete baseline-relative diff; update this record, parent record, backlog and
   handoff. No external ledger mutation or Git operation. Full goal remains PARTIAL.

Required failure paths: explicit too-small text height still reports overflow; viewport
clipping still constrains glyphs; unsupported/forged Scene evidence still refused by full
suite. Native/installed/full9journeys/3menus/12references/full integration unavailable in
this bounded gate, NOT waived. No published capability-map delta until broader validation.

## CLOSE / AAR

Pending implementation and evidence. Discovery changed the plan: new bounded correctness
repair required before calling the missing-property visual result clean. Read-only lookup
used one wrong widget path and a Windows wildcard path; corrected by rg --files and -g.
Banked locally: always test unchanged sibling geometry, not only edited-cell pixel changes.

## Implementation checkpoint

Baseline06:10:30Z captured all410pins and original3owner bytes; protected guards PASS.
scene-red full suite exited1 with the NEW row-top assertion failing; no unrelated failing
case reported. geometry-before PASS uses the existing recorded transport plus physically
contained actual corpus bytes and canonical loader/hash validation (no fake hashes/fonts).
At neighboring fontsize9/20/24, unchanged sibling lineY0.6875/9.1875/12.1875;
clip remainsY0/height16; first glyph height14.625 but visible14.625/6.8125/3.8125.
[REPRODUCED] row-height-dependent plain-text anchoring causes the lost sibling glyph area.

Implementation changes only plain-text yBase to rowTop + ownY - lineBoxMinY. Other widget
anchors, line-local metrics, clips, paint, source ownership and authority remain unchanged.
New Scene regression checks actual row growth, exact unchanged sibling lines/glyph clips,
positiveY downward. Existing contradictory114px center oracle updated exactly as planned;
same112.125px span, strict overflow and viewport assertions retained. scene-green running.

scene-green completed194/195: the new mixed-sibling test and114px overflow test pass.
One further old test at Scene.selftest5363 hardcodes no-wrapY3.75 and a centered wrapped
block. Same source contradiction, not a new renderer defect. Reconcile that oracle too:
no-wrap top0, glyphY0.84375 with identical widths/heights/X; wrapped top0, same shared
line/glyph origin and full issued extent. Keep exact snapshots and all rejection tests.
geometry-after PASS real canonical corpus; before/after artifacts retained separately.

Fresh-eyes review: only plain-text coordinate branch changes; all clip intersections,
horizontal anchors, font metrics and other widget formulas remain intact. Browser helper's
optional rectangle read keeps default full-canvas hashing unchanged. Interior2,1,160,14
captures unchanged first-cell pixels without the movable row border in the340px fixture.
Types and scoped lint PASS. Baseline-relative full3owner diff read; git diff --check PASS.
Extend browser validation to existing long multiline/wrapping/scale/keep-outs journey because
wrapped plain text shares the corrected anchor. Read the whole test: every screenshot goes
to test.info().outputPath; only isolated workspace API and browser-local state mutate.
No new writers or deadline changes. Four serialized browser cases planned, not three.

Scene-final PASS195/195; paint PASS215/215. Canvas FAILED6 trace comparisons, all sharing
CANONICAL_COMPOSITE_TRACE (rendered status and445operation counts remain correct). Add
src/lib/x4UiCanvasRenderer.selftest.ts as a fourth TEST-ONLY owner, captured to a separate
owner-extension.json from its original410pin (do not rewrite baseline). No Canvas product
change. Reconcile literal golden from fixture: secondary row top0 -> line0/glyph0.84375
(was1.75/2.59375); regular row top1 -> line1/glyph1.84375 (was4.75/5.59375). Only those
two labels' Y fields may change; regular button text atX46+ and all other trace fields
remain exact. Do not generate expectations from the actual renderer or remove comparisons.

canvas-final PASS170/172: remaining two comparisons use a second literal copy of the same
fixture with polygon overlays (CANONICAL_POLYGON_COMPOSITE_TRACE). Apply identical34
plain-text Y corrections there; preserve every polygon point and trace order. Initial
golden reconciliation missed this duplicate; retain failed receipt and bank in AAR.

## Rendered result and final review

rendered receipt06:27:06Z: PASS4/4first,0failed/0flaky/0skipped/0globalerrors; longtext57.0s,
newproperties42.2s,existinglayout19.8s,lockedrecovery27.5s. TreeGone=true; X4absent; only
3100/Deckwright54964 remains. All410run-inputs stable,50olderartifacts/4realLua/19live-file
membership/HEAD preserved. Actual browser source/history/pixel and unchanged-sibling
assertions passed. Plain/font20/font24Redo/wrapped/layoutRedo/recovery screenshots inspected.
Neighbor text is readable and stays in place. Wrapped text begins at top and preserves
line breaks. Existing right-edge last-glyph clipping appearance remains a separate unresolved
fidelity concern; not claimed fixed by this vertical repair. Inspector scroll286->0 reproduced.

golden-review.json PASS: exact expected source-based34Yentry changes in each independent
literal golden +3comment lines; EVERY other byte of renderer selftest unchanged. No trace
assertion removed, no renderer-generated snapshot replacement. All other3owner diffs reread.
Required final types/lint after golden reconciliation running as types-final/lint-final.

AAR triggered: reproduced bug; acceptance expanded for coupled trace owners; duplicate
golden initially missed; lookup/output-budget mistakes. Sustain: screenshots exposed a green
test's blind spot; real-font before/after geometry and sibling-invariance now independently
cover it; immutable baselines and additive owner snapshot kept dirty work intact. Improve:
enumerate every literal oracle consumer before editing and bound each log line, not just
number of lines. Highest-risk observed weakness: goldens can preserve a mistaken internal
coordinate assumption across tests. Bounded countermeasure here is the native setup call
chain plus changed-sibling negative regression; native game screenshot remains outstanding.
Project lessons banked here; no external/global ledger writes. No capability-map delta:
repair of existing renderer behavior, not a new subsystem or published fidelity claim.

## CLOSE

Final types-final/lint-final PASS0 with current4owners; all handles terminal. Scene195/195,
Paint215/215,Canvas172/172,real-corpus geometry before/after,exact golden byte review,
diff-check and rendered4/4first PASS. Every bounded requirement done and evidenced.
Full integration/installed/native/3menu visual census/12references and overall9journeys
remain deferred to the parent, not waived or satisfied by these focused checks. No native
verification, package, install or release occurred. No external writes, agents or Git mutation.
Rollback remains baseline3owner bytes + additive original Canvas selftest owner snapshot.
Commit point: fix(ui): anchor plain text to native row tops (not committed; scoped no-Git).
Degradation checkpoint called for lookup errors and missed duplicate golden; next unit
should start from this evidence, not repeat passed suites or redesign the repair.
