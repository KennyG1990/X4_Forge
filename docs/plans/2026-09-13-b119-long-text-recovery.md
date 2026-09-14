# B119 long-text preview and recovery

Lane: FULL. Status: VERIFIED bounded journey. Full goal ACTIVE/PARTIAL. This turn PROGRESS.
Goal: ordinary realistic messages remain visible, wrap when selected, and recover from
missing inputs without manual Lua; exercise resolution/scale/context overlays in the real UI.
Existing issue41; no Git/external/protected writes in this unit. Astra directly, no agents.

## Reconciliation / design

Read full objective, original brief, approved canvas-first design, latest handoff/backlog,
named-scenario plan, capability-map and ADR-F5. AgentBrain returned weak unrelated matches,
not a previous solution. Graph: projectX4UiLayoutProgram calls deriveCanonicalTextHeightCandidate.
Reuse canonical corpus loader, text layout, Session/preview samples, current friendly properties,
profile/context UI, existing source edit/history. No new renderer, source format or interpreter.

Historical screenshot shows only Always visible while sampled Table2 is unresolved. Exact
cause not yet established. Current code only tolerates no-wrap overflow when EVERY line
overflows and has glyph quads. Helper source ui/addons/ego_detailmonitorhelper/helper.lua
getTextHeight (~5482) passes width0 when wordwrap=false; an ordinary overflowing line must
not invalidate measured height of a neighboring short/blank line. Hypothesis until tested.
Unknown glyphs/nonfinite layout still must refuse height inference. Wrap/truncation remains
provisional until native parity; never silently enable wrap or replace missing glyphs.

Options: force fixed height (hides failure/breaks content sizing); silently wrap all text
(changes source semantics); classify finite expected overflow correctly and retain genuine
gaps. Prefer existing-owner repair only if causal tests prove it. Actual rendered journey
must independently show the sampled table, not just different canvas pixels.

## Baseline / boundaries

HEAD93c9af111d63ca77c99dee11f21882c4073bcda6; extensive dirty work preserved. X4 stopped,
3000/3001/3100/3200/3201 absent. Prior source-state receipts available; protected guard check0.
Evidence:test-results/b119-long-text-recovery-20260913/; exact .before/hash/status files.
In scope: LayoutProgram implementation/selftest and existing browser spec; TextLayout and
SourceEditor only if a necessary new failure is reconciled before changes. Baseline TextLayout
copies reserved but no rewrite planned. No mod/game/save/config/install/deploy/network/spend.
Recovery: reverse only new hunks against exact before copies, never whole prior dirty files.

## Steps / acceptance

1. Add source/corpus-bound fail-first cases for short, long ASCII, wrapped text, mixed hard
   newlines/blank lines, and unsupported glyph. Record exact layout gaps and height/status.
   No synthetic fallback minTextHeight; reuse existing actual-byte corpus and profile helper.
2. Actual browser fixture: missing sample -> long message -> wrapping/property or scenario
   recovery; inspect issued sampled-table geometry and readable screenshot. Preserve red.
3. Repair only reproduced owner defect; keep all original oracle/source/consumer checks.
4. Exercise another drawable resolution and UI scale, context overlays and return path;
   assert expected source/history changes only, not samples/settings leaking to Lua.
5. Full LayoutProgram and TextLayout tests, mounted SourceEditor if UI changed, selected
   existing browser regressions plus new journey, tsc/exact lint, old-assertion diff review,
   protected hashes/membership and owned process teardown. Inspect real PNGs. Retain any
   required failed layer as PARTIAL; do not turn an infrastructure test into UX completion.

Evidence records exact commands/exits and source identities. Isolated E2E3200/3201, workers1;
serialize browser runners. Native/package/3menus/12refs/fullE2E/precommit/release unavailable
in this fixture and still mandatory for full goal. Existing numeric downstream contract intact.
No full-goal completion from this bounded slice. Document close/AAR/handoff before final.

## Reproduced boundary / clarified checks

height-red.log: ordinary one-line and wrapped ASCII pass; long+short, short+long and
long+blank+short fail canonical height. Missing glyph correctly fails. No fake minimum.
browser-red failed only a locator (single sample label Text, not Text1); browser-causal
reproduces accepted multiline input with sampled Table2 still unresolved. Retain both.
Primary preview input ALREADY uses a textarea; an initial single-line-control claim was
corrected from current source before any UI change. No duplicate control or new UI owner.
Repair only expected no-wrap overflow classification; retain finite geometry and genuine
gap checks. Then extend the real journey through existing Wrapping property, resolution/
scale and context controls. Preview samples must survive those ordinary setting changes,
not require retyping; workspace/history must reflect only the explicit wrapping edit.

### Necessary scalar edit continuation

Browser-first now renders/truncates the multiline message with its blank line and Ready,
but Wrapping Apply refuses without changing Lua. SourceEdits scalar reparse does not pass
the exact source splice to the existing issued-preview reprojector, unlike structural
reparse. This drops sampled text needed for the same call's automatic height, so edited
call/value authority cannot be re-established. Add SourceEdits implementation/selftest to
scope (new before copies captured). Prove direct owner failure and exact retained input,
inverse/stale/foreign negatives; reuse existing source mapping, do not change success gates.
Height is a shared downstream dependency: include full Scene/Paint/Preview regressions in
final validation, not only the narrower LayoutProgram/TextLayout tests. Old oracles remain.

### Necessary profile-input continuity

Browser-second passes Wrapping Apply and captures readable wrapped text, then fails after
resolution/scale change because the existing profile handlers change profile while passing
old opaque sample binding. Session correctly invalidates it. Preserve that strict boundary;
use existing capture/projectPreviewScenario to reissue data against the same source/menu and
new profile before committing UI state. Reuse scenario state-adoption setters, not another
Session/history implementation. If data no longer applies, leave profile/preview unchanged
and show a profile error. Block profile changes over unapplied preview drafts with recovery.
Add SourceEditor implementation/mounted selftest to scope; exact before copies captured.
Mounted fail-first: B values through width/height/user-scale on first committed projection,
no source/history mutation, and draft refusal preserving text. Actual browser criterion is
unchanged, including four context overlays/off, profile return, and Clear/refill recovery.

## Implementation / review checkpoint

Extend-versus-replace: retain the existing Session, scenario replay, source-splice mapping,
and canonical height owner. Reproductions show missing caller continuity and an over-broad
overflow rejection, not a need for another renderer/history/authority system. Session's
profile binding rejection is correct and unchanged. Seven implementation/test files owned.
No TextLayout, Scene, PaintPlan, PreviewPipeline, scenario owner, history, or real mod edits.

Actual changes: (1) accept finite short/blank line boxes alongside expected no-wrap overflow;
(2) supply the exact scalar splice to the existing sampled-input reprojector; (3) profile
controls capture current source/menu inputs and replay through fresh profile authority before
committing state. Shared scenario adoption setters reused. Draft/replay refusal leaves old
profile and preview intact with a visible error. No local-storage write on profile changes.

Current evidence: height-red/height-green, wrapping-causal/wrapping-green, profile-red/
profile-green logs give independent fail-first checks. All original test lines are preserved
(new cases inserted only). Full TextLayout13/13, Layout914/914, SourceEdits170/170, mounted
SourceEditor pass. typecheck-current exposed new union narrowing errors; explicit false
branches corrected them, typecheck-final-green exits0. Seven owned files lint0/0warnings.
Final browser6/6,0fail/flake/skip, complete report/owned teardown: e2e-final-verdict.json.
The new journey additionally proves visible unapplied-draft refusal, Discard recovery, exact
profile control readback, no sample/settings source or history mutation, and Not verified
in game. Browser-third's eight PNGs and browser-final draft-refusal PNG visually inspected:
wrapped message/blank line/Ready, four context outlines, recovered exact canvas. Fit screen
makes this small test menu tiny, as expected; Fit menu restores readable content. Existing
fixture global validation1error/hierarchy partial are NOT project readiness proof.

Review: actual corpus helper.lua width=0 no-wrap height semantics govern the small height
change. Missing glyph/finite geometry checks remain. Scalar stale/copied/inverse tests pass.
Profile mounted checks cover width/height/user scale/custom effective/derived mode, actual
control changes and nonempty first-render observations. Source/history untouched. reviewctl
and .reviewctl/rules.yaml unavailable; substitute full exact before-diff review, graph call
path, strict typecheck/lint, existing negative suites and real rendered interaction. Broader
Scene/Paint/Preview validation still running at this checkpoint; final close waits for it.

AAR triggered: reproduced failures; necessary scope changes recorded before owner edits;
incorrect initial multiline-control assumption corrected from source; first browser locator
and first wrapping-test locator wrong; type narrowing error corrected; one missing prior-log
lookup and oversized tool output. Sustain fail-first owner tests plus real sampled-table
rendering and protected byte checks. Improve approach: trace profile-bound input readers
alongside source edits before claiming a text fix complete. Improve tools: character-bound
reads and observed log paths, not guessed paths or huge JSON lines. Highest evidenced risk:
an ordinary view/source edit can discard dependent preview data while another table still
renders. Bounded countermeasure is the exact first-render continuity + full sampled-table
journey added here. Lesson banked here; no external/global ledger or memory write authorized.
Capability delta: multiline measurement and current-input profile continuity strengthened;
external capability-map/GitHub41 projection updates deferred by the current local-only scope.

## Final close — 2026-09-13 04:44Z

VERIFIED for this bounded real-browser long-text/settings/recovery journey, not full B119.
All declared required checks complete: TextLayout13/13, Layout914/914, SourceEdits170/170,
full mounted SourceEditor (plus final current-code focused replay), Scene194/194 with strict
configured MENU/HUB/COMM census3/3, Paint215/215, Preview125/125, scenario/history suites,
typecheck0, owned7-file lint0/0warnings, exact whitespace check0. Final browser6/6 plus the
separate original primary-inputs1/1; both complete verdicts have0flakes/skips/failures and
owned treeGone=true. This is selected coverage, NOT full E2E or precommit/release validation.
Scene's configured menu census is machine evidence, not the native visual menu census.

Evidence: receipt.json + finalize.mjs/log (exit0) in the evidence root. Finalizer asserts
required full-suite markers, both browser receipts, preservation of every old test line,
exact before/current owned hashes, unchanged TextLayout bytes, HEAD93c9af1,36 independent
input files/4real source files/19protected files plus exact membership. final-safety.json:
X4 stopped;3000/3001/3100/3200/3201 absent. All known runner handles terminal. Graph code-only
refresh exit0:11607nodes/29297edges/363communities; HTML intentionally omitted above5000nodes.
No external process action, Git mutation, release, deployment, game/config/mod/install write.

All original acceptance criteria done/evidenced for this unit; full-goal native/packaged/
release/three-menu/twelve-reference obligations and the wider numeric contract remain open.
Keep source/render/native truth separate. No final goal-completion audit or status update is
appropriate while those obligations remain. Next unit should advance the real imported-menu
edit/export/reopen journey, not repeat this now-green fixture. Degradation checkpoint called
for avoidable diagnostic/typing misses in the long turn; fresh bounded continuation next.
Commit point: fix(ui): preserve long-text preview through wrapping and profile changes
(NOT committed; public releases only may be pushed).
