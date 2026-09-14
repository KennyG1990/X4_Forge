# B119 placeholder Paint diagnosis and repair

Lane FULL. Status VERIFIED (bounded test-fixture repair). Goal ACTIVE/PARTIAL; turn PROGRESS.
Objective: close the exact P5 placeholder glyph/tint failure while preserving real text, geometry,
clipping and authority. Source-first canvas builder remains the full goal, not a test-total target.

PLAN / RECONCILE
- Reuse colorSourceFixture -> Layout -> Scene -> Paint. Graph confirms Paint imports Scene (EXTRACTED).
  Scene already selects defaultContent for source-initial-inactive empty Input; Paint issues glyphs
  only after accepted clip intersection. No parallel renderer or guessed fallback is justified.
- References: full goal, approved canvas-first plan and original brief already reviewed in predecessor,
  previous source-consumer plan, live source/corpus; capability map and ADR-F1/F2 read. Recall's older
  general UI accessibility audit is not a matching placeholder solution. No capability-map delta yet.
- First add diagnostics to the existing failing Paint check without weakening it. Capture selected
  content, font, available width, layout, Scene glyphs and source-bound gaps/clip diagnostics.
- Initial editable code owner: src/lib/x4UiPaintPlan.selftest.ts only. A production defect requires
  a documented evidence-based scope amendment before implementation. All live mod/config/Git writes,
  unrelated dirty files, publication and broader feature work are out of scope.
- Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, prior47inputs/4sources unchanged at
  2026-09-13T00:05:13Z; X4 and validators stopped, no tracked local ports listening. This differs from
  last checkpoint's Deckwright process. Machine-state question sent; only isolated pure tests until
  rendered-test state is confirmed. Preserve existing source/config guards and exact test snapshot.
- Evidence: test-results/b119-placeholder-paint-20260913T0005Z/. Rollback only this unit's new hunks
  against captured .before file; no whole-file restoration over earlier uncommitted work.
- Acceptance: reproduced causal explanation, minimal correct fix (fixture or production per proof),
  complete Paint suite green with original checks retained; source-bound positive and relevant
  zero-width/clip/unknown/refusal negative control; whole tsc and owned strict lint; full diff review;
  unchanged unrelated input/source/guard hashes. Pipeline rerun if shared production behavior changes.
- If production visuals change, actual rendered host validation and source/canvas preservation are
  required before VERIFIED. Test-only repair has no new visual/native claim. Installed/native and all
  six-suite/schema/proxy/replay/two-scenario/9journey/3menu/12reference/release obligations remain open.

CLOSE / AAR pending.

Reconciled fixture repair: diagnostic212/213 reproduced at00:07 and00:09Z. All three unresolved
text facts point to source13:39..62, the fixture's `affectRowHeight = false`. Helper editbox properties
3234..3246 and cell getHeight5390..5401 do not declare that button/icon-only property. The current
CallModel editbox property list likewise excludes it. The fixture also writes `bgcolor`, while the
declared Helper name is `bgColor`; use canonical spelling, but this is not the cause of missing glyphs.
The exact constructor-key guard rejects unrecognized options instead of inventing nested defaults.
Existing Layout tests explicitly retain
partial-setter uncertainty. No production defect is established and those guards must remain intact.

Repair only the color fixture's two Input constructors: remove unsupported affectRowHeight and use
canonical bgColor. Retain all original tint/geometry/content checks. Add separate controlled fixture
variants reintroducing affectRowHeight or unsupported nested text to prove omitted font/size/alignment remain unavailable,
zero glyphs remain honest, and independently known Input geometry remains identical. Require the
supported variant to positively issue placeholder glyphs with their original exact parent tint.
No new production surface or visual change. Machine-state reply still pending; no rendered test run.

Counterfactual correction: repaired214/215 with original P5 tint check green. The independent
affectRowHeight negative passes; lowercase-color negative fails because this analyzer accepts the
source spelling (normalizes matching). Therefore capitalization is not a demonstrated blocker and
must not be reported as one. Replace that mistaken negative with the existing explicitly unsupported
nested text option, and keep the new lowercase-control failure evidence. No production normalization
change in this unit. Full tsc/lint0 on that intermediate version.

VALIDATE / REVIEW / CLOSE — 2026-09-13 00:16Z (local2026-09-12)
- Only PaintPlan.selftest changed. Original P5 glyph/parent-tint/slot/geometry/refusal checks retained.
  New affectRowHeight and nested-text controls preserve3 unknown text facts and0glyphs while keeping
  the same20x8 Input at(0,15). Production constructor defaults/partial-setter guards are unchanged.
- Full Paint215/2150 (00:13:34..50Z). Original212/213 red and214/215 mistaken-color-negative retained.
  Positive selects PLACEHOLDER,Zekton9,left,6px budget,displayed ellipsis3glyphs with exact parent tint.
  This is not readable full placeholder text or actual rendered/native proof.
- Final full tsc0 (00:13:50..14:21Z), strict owned ESLint0 (00:14:21..23Z), whitespace0. Full exact
  before/current diff reviewed using code-review skill; reviewctl/config absent.
- verify-final.mjs0 at00:15:42Z. All122 old check call expressions/order retained;123after with one
  new template/two cases. verified-proof.json freezes47inputs,4sources,19guards and1snapshot.
- Graphify AST-only0 at00:16:10Z,11523nodes/29038edges/343communities; HTML5000node guard retained.
- final-safety.json00:16:24Z:47pins stable,19guards no additions/deletions/changes,X4stopped,no validators.
  Port3100 became live under23364; read-only check identifies Deckwright,not Forge. No agent service
  launch. Rendered machine-state question pending; no state-touching UI work.
- No capability-map delta. No mod/game/config/install/release/Git/issue/wiki/global-memory write.
  Original six-suite/schema/proxy/replay/two-scenario/authoring/native/release obligations retained.
  Pipeline125/125 is earlier unchanged-code evidence,not rerun in this test-only unit.
- Commit point:test(ui): ground placeholder Paint fixture in supported Input options (not committed).

AAR (triggered)
- Sustain: source diagnostics and counterfactuals isolated the unsupported constructor option without
  relaxing unknown-text guards or removing the original failed glyph assertion.
- Improve approach: color-case conformity initially conflated with cause; failed negative disproved
  it. Cause corrected, evidence retained. Positive fixtures must use supported constructor options.
- Improve tools: rg wildcard path failed; corrected via -g. Close patch context mismatch corrected
  without partial edits. Keep summaries bounded by fields/characters. Degradation checkpoint called.
- Highest-risk observed weakness: unsupported positive fixtures can make honest refusal look like a
  rendering regression; two explicit counterfactuals now guard this. Larger fixture-isolation issue
  remains in predecessor plan, not expanded here. Project lessons banked locally; external ledgers untouched.
