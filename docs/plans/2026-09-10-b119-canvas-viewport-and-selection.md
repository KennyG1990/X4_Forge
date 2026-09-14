# B119 readable canvas and continuous selection

Date: 2026-09-10
Lane: FULL
Status: PARTIAL — implementation and automated/browser gates pass; usable authoring experience remains incomplete
Parent: docs/plans/2026-09-10-b119-canvas-first-builder.md; GitHub41 remains open.

## PLAN / acceptance contract

Bounded unit: make the existing source canvas readable with preview-only Fit menu, Fit screen,
100%, Zoom in/out controls, and keep the selected element available for repeated literal-property edits
after exact acknowledged commits. This implements the approved fit/zoom design; no new product choice
or protected-write authority is needed. It does not complete palette/history/native requirements.

Authoritative inputs: active goal attachment d06dfea8-8256-48a5-97f5-b524fac87153; original UI brief;
approved canvas-first plan; ADR-F1/F2/F5; current issued Scene rectangles, SourceEdits local-splice result,
workspace acknowledgement and source-bound selection owners. The current canonical bitmap stays truth.

Options considered:
- Enlarge generated frames/fonts or lower the game profile: rejected; changes real authored geometry.
- Permanently crop/redraw a second bitmap: rejected; competing paint/export path and hidden screen context.
- Selected: one native canvas plus its existing overlay, scaled together in a scrollable viewport.
  Fit menu uses only known issued bounds; Fit screen restores full drawable context; manual zoom permits
  closer inspection. Existing native-coordinate picking reads the transformed canvas rectangle.

In scope:
- Default Fit menu for current known geometry, with honest Fit screen fallback when no bounded geometry.
- Fit screen,100%, bounded +/- zoom; effective percentage clearly labelled as preview zoom, separate
  from X4 user scale. Keep view center through manual zoom; menu fit must bring offset menus into view.
- Resize handling, scroll, aligned selection overlays, disabled/unavailable states, keyboard buttons.
- Element continuation only for actual accepted literal edits, installed before parent flushSync.
  Map exact prior node/source span through the one proven splice to a unique fresh node of the same kind;
  create a NEW selection with NEW workspace/source/target/profile identity. No label matching or reuse of
  old catalog, draft, receipt, geometry or authority. Ambiguity/overlap/missing identity means clear.
- Retain existing stale/current export and hit-test guards. Changed workspace/profile/target/manual
  selection, forged/late acknowledgement, unmount or unrelated transition cancels pending continuation.

Out of scope for this unit (still required later): contextual palette and outer sidebar integration,
structural edits/history/save-reopen, source generation/namespacing, font recovery, renderer changes,
installed/native verification. No dependency, endpoint, persistence, spend, config or game/mod writer.

Risks: incorrect scroll/zoom picking, stale element revival, oversized CSS work, inaccessible controls,
resize loops, redundant canvas allocation, weakening existing negative tests. Recovery is exact inverse
of this worker's bounded patch over the captured dirty-file baseline; never broad Git restore/reset.

Required acceptance:
1. Actual new-menu browser journey opens with readable menu-sized preview at1280x720; title's displayed
   issued text box at least10CSSpx high, plus parent screenshot inspection (numeric threshold alone is
   not a readability verdict). Controls remain reachable with inspector open and at1024x768.
2. Fit screen shows full native drawable; Fit menu includes only known in-bounds menu extent with margin.
   Manual zoom handles offset geometry, scroll and narrow/tall/wide profiles without stretching axes.
3. Preview zoom does not change source bytes, X4 profile, native canvas dimensions, paint identity,
   renderer execution or exported PNG bytes. One mounted bitmap; overlay shares its transform.
4. Click a visible text element after zoom/scroll and obtain its exact same hierarchy/inspector selection.
   Empty/stale/unknown geometry cannot be picked into a fabricated selection.
5. Edit title -> current fresh canvas -> SAME logical element selected in fresh identity -> edit again
   without reselecting. Test both named-function new menu and unnamed-chunk fixture, real sanitizer,
   deep-frozen SourceEdits result and synchronous parent acknowledgement.
6. Different selected element or workspace/profile/source/target during a pending edit cannot be stolen
   back. Forged, late, ambiguous, missing-node and unmount cases clear/refuse; no authority weakening.
7. All existing mapper/UI/current PNG/export/source-edit tests, TypeScript, exact lint and diff hygiene.
   Extend browser tests, preserving previous assertions and durable outputPath screenshots/Lua/XML.

## BASELINE / RECONCILE

- HEADmain93c9af111d63ca77c99dee11f21882c4073bcda6; index empty;17 reviewed source hashes unchanged from
  preceding checkpoint. Snapshot: test-results/b119-canvas-viewport-starting-baseline.json.
- Prior SourceEditor browser spec5/5,0flaky,14 live hashes unchanged and clean teardown; final TypeScript,
  mapper/UI/source-edit focused checks passed. Prior proof remains narrower than usable authoring.
- Parent-viewed prior screenshots show native2560x1440 fit into a narrow viewport;530-wide menu becomes
  unreadable. SourceEditor uses one fixed CSS fit size; no viewport camera/zoom implementation exists.
- Graphify: hitTestX4UiBuilderCanvas has SourceEditor/selftest consumers only; existing hit handler maps
  from actual mounted canvas bounds. useX4UiSourceEditSelectionTransfer already guards named/unnamed
  menu continuity, but onSelect clears builderSelection. reconcileX4UiBuilderSelection must remain exact.
- Existing x4UiBuilderPresentation supplies issued bounds, source spans and exact operation ownership.
  Reuse it for disposable geometry/selection helpers; do not add another source model or renderer.
- Outer Sidebar.tsx owns the still-visible legacy library, calling onAddUIWidget; UIBuilder owns its own
  source/canvas/lua subtab. Proper shared-mode/palette integration is separately required, not silently
  replaced here. Agent-Brain recall was weak: general reference-API note had no zoom/continuity match.
- No spending/network/delete/security surface changes. No capability-map delta until tested behavior.

## IMPLEMENT / worker boundaries

One fresh native GPT-5.6 Luna worker owns ONLY:
- F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.selftest.ts
- F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx
- F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.selftest.tsx
- F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts

Astra owns records, independent reference/negative-path review and all serialized E2E/services. No other
worker writes these files. Do not touch App, Sidebar, UIBuilder, SourceEdits, Session or layout/paint owners.
1. Capture worker file baseline, add failing pure viewport/bounds tests; implement one coordinate model.
2. Wire compact controls and current bitmap/overlay sizing; mounted resize/scroll/export invariants.
3. Add exact acknowledged element-continuation tests before wiring repeated-edit UI behavior.
4. Extend existing real browser creation and import-fixture journeys with zoom/click/repeated edits and
   persisted screenshots. Run focused tests and exact lint; parent reviews final diff and TypeScript.

## VALIDATE / REVIEW / CLOSE

Bundled Node: C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.
Focused commands: node --import tsx src/lib/x4UiBuilderPresentation.selftest.ts;
node --import tsx src/components/X4UiSourceEditor.selftest.tsx;
node --import tsx src/lib/x4UiSourceEdits.selftest.ts (unchanged owner regression);
node node_modules/typescript/bin/tsc --noEmit; node node_modules/eslint/bin/eslint.js <five exact paths>;
git diff --check -- <five exact paths>.

Parent E2E: X4_FORGE_E2E_WEB_PORT=3200, X4_FORGE_E2E_API_PORT=3201,
X4_REFERENCE_ROOT=F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00; node scripts/run-e2e.mjs
tests/e2e/x4-ui-source-editor.spec.ts. Machine permission remains cleared; verify no live game/input
conflict before heavy work. Parse structured verdict, teardown and14-file before/after hash guard.
Parent alone owns this one-worker stack. Current installed Forge must stay untouched/visible.

Evidence: test-results/b119-canvas-viewport-*; preserve earlier batch2 green/red receipts. Visually inspect
new-menu and repeatedly edited screenshots; inspect exact Lua locality. Packaged/installed/native and
full-repository E2E remain broader goal gates, unavailable to claim from this checkout-only unit.
Review every criterion, update handoff/backlog/capability delta/AAR, explicit honest status. No premature
commit or release; suggested later title: feat(ui): add readable source canvas zoom and continuous selection.

## AAR (open)

Prior turn classified PROGRESS: actual code corrections and browser evidence changed the next action.
This unit is non-clean from reconciliation: earlier pixel-change assertions missed visible usability.
Sustain one-canvas/source fidelity and exact acknowledgement; highest evidenced risk is mistaking green
surrogate tests for readable continuous editing. Record actual outcomes here before closing.

## Execution checkpoint

- Native GPT-5.6 Luna Meitner01a08b8f-e9ad-7ab1-81c1-0b22b9391bd0 owns the five paths above.
  Previous workers remain closed. Astra concurrently reviews owner couplings and acceptance probes.
- Parent actual corpus/source-edit probe confirms text node source span is the editable literal itself:
  [2159,2182] -> [2159,2180] after a -2 character local splice. New geometry recomputes independently.
  Exact span mapping is viable for this case; sourceOrder-only or label mapping is not authority.
  Evidence: test-results/b119-canvas-viewport-parent-span-probe.log, exit0, locality/stale negatives pass.
- No behavioral write by parent; no game/mod/install/config/service mutation. Repeated skill output was
  re-read completely after initial truncation; no required instructions were skipped.
- Parent unchanged SourceEdits regression PASS100/100 plus all causal matrices; log
  test-results/b119-canvas-viewport-parent-source-edits-regression.log, exit0. No X4 process or3200/3201
  listener on current read-only check. User machine approval remains current; worker focused tests are
  explicitly cleared, while parent retains sole heavy/E2E ownership.
- Sidebar reconciliation confirms its UI-tab buttons call App.handleAddUIWidget, which appends legacy
  uiWidgets and records history; it does not insert into selected real Lua. This is an evidenced
  integration gap for the contextual palette unit, not a source-palette capability. Preserve it as a
  later explicit mode/owner coupling; do not quietly activate these writes as visual source insertion.

## Reconciled scope addition — isolate the legacy writer from source mode

The observed sidebar does more than waste width: its active controls mutate a different representation
while the user is looking at canonical Lua. Correct that exposed mode/owner coupling now. Contextual
source insertion itself remains the later palette unit. This replaces only the earlier outer-sidebar
deferral; no source, history, deployment or legacy widget behavior may be changed.

Second independent Luna write set ONLY:
- F:/DEV_ENV/X4_Forge/src/App.tsx
- F:/DEV_ENV/X4_Forge/src/components/UIBuilder.tsx
- F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-builder-mode.spec.ts (new narrow integration test)

Design: App and UIBuilder agree on the presentation subtab using one controlled mode owner, with
backward-compatible local fallback for standalone UIBuilder consumers. In active source-builder view,
omit the outer legacy sidebar and its collapsed restore strip without changing stored layout preferences.
The SourceEditor already owns its hierarchy/inspector. Switching to legacy canvas restores its existing
library and writer unchanged. Other workspace views, beginner/expert behavior and explicit panel-collapse
preferences stay as before. Preserve default source mode on re-entering the UI view; no persistent state,
workspace commit, checkpoint, source edit or verification invalidation for a presentation-mode switch.

Acceptance: actual browser source -> legacy -> source, with no legacy library/restore target in source,
library available in legacy (unless explicitly collapsed), no source/workspace/history writes merely
from switching, non-UI views unchanged. Cover collapsed preference retention and fresh/default entry.
Use existing harness/fixture APIs, no service ownership, arbitrary transport or broad test rewrites.

Parent review: original App sanitizer/history/receipt hunks must remain byte-identical; inspect only the
new render/mode delta. Two workers are disjoint; no shared service/testing ports. Worker1 receives this
contract so viewport resizing must remain responsive to the reclaimed width. Parent runs final TypeScript,
exact combined lint, focused specs, then full repository E2E and production build after both patches.
Full E2E still uses isolated3200/3201 with14-file hash guard and parsed verdict. No package/install/native
write is authorized by a build or by mode isolation. If unrelated baseline failures appear, preserve them
and report scope honestly; never weaken assertions or widen ownership without reconciliation.

- Shell worker: native Luna Noether01a08b96-142f-7a03-ac76-ff5dab90ecbe; Meitner remains the sole
  presentation/SourceEditor writer. No parallel service or E2E run.
- Lifecycle clarification from SourceEditor3551-3555: its existing unmount publishes null current
  snapshot when UIBuilder switches away from source. Preserve that cleanup exactly. No verification
  mutation in this unit means no NEW invalidation/persisted proof writer from controlled mode state,
  not suppressing existing lifecycle cleanup or keeping a hidden SourceEditor alive.

## Review checkpoint / Git observation hazard

- Meitner added fail-first viewport and selected-element tests; missing computeX4UiBuilderViewport export
  gives the expected initial red. Implementation is still in progress, not complete. Parent review
  corrected a synthetic interval negative: start+1 with the same end is contained, not crossing overlap;
  require positive containment for widget/frame call spans and truly crossing overlap rejection.
- [REPRODUCED] Plain git status/diff omitted the changed SourceEditor.selftest.tsx. Parent initially
  inferred lost prior tests and paused worker writes. Direct content/hash inspection disproved the
  inference: all prior transfer/NewMenu/unnamed suites remain, and blob6632ed... differs from HEAD6a7aaa....
  git -c core.fsmonitor=false diff reports971 additions/1 deletion; uncached status correctly reports M.
  No restore/reset/config change was performed. Worker was immediately told to resume authorized work.
- AAR: improve parent evidence discipline; absent cached Git diff is not equal file bytes. Use uncached
  read-only Git and direct hashes for remaining review. A read-only discrepancy must not trigger a
  destructive repair. Record fresh recoverable file snapshots, not hashes alone, at future checkpoints.
- Recoverable WIP snapshot (NOT original baseline): test-results/b119-canvas-viewport-work-in-progress-checkpoint/
  receipt.json plus seven exact file copies. All copies stable during capture. Do not overwrite this snapshot.
- Fresh-eyes review requests before acceptance: Fit menu must include real known frame/table extents,
  including empty authoring space, not crop to leaf text to inflate apparent readability; bounded zoom
  must remain finite even for extreme finite inputs. Custom zoom must not display a false100% selection;
 100% preserves current center, and explicit zoom anchors must survive resize/scrollbar changes.
- Selection lifecycle review hypothesis: resolving element before fresh menu keys reach the projection
  can discard continuation in the transient empty scene. Worker must prove named/unnamed repeated-edit
  cases with actual flushSync and, if reproduced, retain guarded intent until the fresh projection exists.
- Noether's three-file shell patch is implementation-complete: parent source review found the controlled
  mode and sidebar isolation coherent, preserving prior App identity/UIBuilder acknowledgement hunks.
  Worker exact lint/diff pass; integrated TypeScript and browser acceptance remain parent-owned.
- [REPRODUCED] Parent's recovery copies retained .ts/.tsx extensions under test-results, which the
  normal root TypeScript include discovered. Full tsc first run failed on those copied relative imports.
  Renamed only the seven recorded copies with .snapshot suffix, verified every before/after SHA256,
  updated receipt paths, and left source/config/tsconfig unchanged. Original log is preserved in
  test-results/b119-canvas-viewport-parent-typecheck-first.log; rerun uses the unchanged standard gate.
  AAR: recovery artifacts must be inert, not discoverable source. Parent explicitly called degradation
  after this plus the earlier cached-Git false alarm; finish this bounded checkpoint, no next feature here.
- Parent review also requires terminal rejected acknowledgements to clear pending selection attempts,
  and settled missing/unsupported projections not to monopolize future submissions. Keep pending only
  for a genuinely transient accepted readback; prove refusal followed by a valid submission.
- Parent standard TypeScript second run passes exit0 after inert snapshot rename. Noether closed after
  independent shell review/typecheck; only Meitner remains available for concrete correction.
- Parent focused first run: mapper PASS exit0; full SourceEditor selftest FAIL exit1 on all eight
  pre-existing round5 stale-apply updater drift assertions before mounted suites. All four tested file
  hashes remained stable during the run. Logs: test-results/b119-canvas-viewport-parent-mapper-first.log
  and test-results/b119-canvas-viewport-parent-ui-first.log. Worker must reproduce the exact exception
  and repair truthful extracted-handler fixture wiring if needed, without weakening any drift oracle.
- Fourteen-file live baseline captured2026-09-10T14:19:21Z with X4 stopped and3200/3201 free:
  test-results/b119-canvas-viewport-targeted-baseline.json. All seven protected source hashes still match.
- [REPRODUCED] The eight causal failures were ReferenceError: selectedBuilderNode is not defined in
  the extracted Apply fixture, before acknowledgement rejection registration. Worker added only that
  optional local to the fixture environment; callback and eight stale-state assertions unchanged.
  The unnamed repeated-edit fixture also had to query the fresh owner-issued entry ID after the first
  splice, matching actual UI ownership rather than retaining the old test ID.
- Parent integrated rerun PASS: full UI selftest (including named/unnamed repeated edits and all old
  causal matrices), normal full TypeScript, exact eight-file ESLint, uncached scoped diff-check. All eight
  source hashes stable during the run. Logs share test-results/b119-canvas-viewport-parent- prefix:
  ui-second.log, typecheck-third.log, lint-first.log, diff-first.log. Lint had five known App warnings and
  one unused new selftest type import; worker instructed to remove only that unused import.
- Targeted browser run now started through scripts/run-e2e.mjs with both source-editor and builder-mode
  specs, isolated3200/3201. Await parsed verdict/screenshots and live hash/teardown checks; no browser
  acceptance claim yet. No installed product, release, game, mod, save or config mutation authorized.
- First targeted browser verdict FAIL5/7,2failed,0flaky, complete report/teardown treeGone:true at
  2026-09-10T14:33:59Z. Both new scroll tests failed because observed offsets remained zero after their
  centering setup; exact failing assertions582/841 preserved. Parent requested measured positive pan
  within actual bounds while retaining target visibility and the strict positive-scroll/click assertions.
  No camera diagnosis from this test failure alone. Mode isolation/collapsed preference and PNG export
  passed. Archive: test-results/b119-canvas-viewport-targeted-first-artifacts/e2e; verdict and isolation
  receipts share test-results/b119-canvas-viewport-targeted-first- prefix. Fourteen live hashes unchanged;
 3200/3201 closed. Red artifacts must not be overwritten by rerun.
- Parent viewed actual builder-fit-menu.png and created-menu.png. Zoom enlarges issued content; numeric
  title-height checks passed before scroll failures. Screenshot reveals unrounded63.888888888888886%
  zoom text; request display-only one-decimal rounding, underlying precision unchanged. Visible glyph
  outlines/very small authoring area remain experience-review concerns; no renderer/fidelity claim from
  these screenshots or numeric height alone. Renderer already uses source-composition, not diagnostic-map.
- Second targeted verdict FAIL6/7,1failed,0flaky at2026-09-10T14:42:23Z; report complete/treeGone:true,
  all14 hashes unchanged and3200/3201 closed. New-menu creation, zoom/scroll/resize and repeated escaped
  then shorter title edits PASS in the actual browser. Imported journey alone stops at the added
  post-resize selected-in-viewport assertion. Second artifacts/verdict/isolation archived separately.
- Oracle reconciliation (non-clean): parent-requested always-visible selection after window shrink is
  broader than the declared viewport-center contract. Imported fixture starts at native screen origin;
  preserving view center can legitimately clip that edge. Trace after1160x640 resize records scroll29/34
  versus setup1/1. This suggests center preservation but is not yet a measured center proof. Replace
  that incorrect surrogate with before/after actual native center, viewport, scale and clamped-scroll
  measurements (one CSS pixel rounding tolerance); persist JSON evidence and keep native node/PNG
  identity assertions. Require Fit-menu recovery to put selected text into view before editing. Keep
  the new-menu visible-selection resize positive case, which passed. No camera change justified yet.
  Direct trace image: test-results/b119-canvas-viewport-second-import-resize.jpeg.
- Production build PASS (unchanged package build commands): Vite12.06s, esbuild86ms, both exit0.
  Evidence: test-results/b119-canvas-viewport-parent-build-first.log. Existing large-chunk warning is not
  resolved here. Build is not package/install/native verification; no release/version/config changes.
- Third targeted verdict FAIL6/7,1failed,0flaky; all14 hashes unchanged, report complete/treeGone:true,
  portsclosed. Imported complete flow now PASS, including measured shrink-center preservation and two
  edits. Camera evidence before center247.6/72.8, after247.6/73.2 at1.25CSS scale:0/0.5CSSpx scroll error,
  unchanged native2560x1440 bitmap/PNG/profile. Persisted builder-resize-camera.json in third archive.
- New-menu's stronger midpoint pan exposed the same overly broad selected-visible shrink assertion.
  Final complementary oracle setup: retain imported shrink plus direct center/clamp measurement;
  grow the new-menu viewport for its visible-selection resize positive case, preserving all native
  identity/PNG/manual-mode assertions and returning to original viewport. No camera source change.
  This corrects geometry-invalid test preconditions; it does not promise selected-edge visibility on
  arbitrary viewport shrink. Parent has repeatedly corrected test-design assumptions: non-clean AAR.
- Fourth targeted browser PASS7/7,0failed,0flaky, complete structured report/treeGone:true; all14 live
  hashes unchanged,3200/3201 closed. Durable archive and verdict/isolation receipts use
  test-results/b119-canvas-viewport-targeted-fourth- prefix. Both authoring fixtures complete repeated
  escaped/shorter literal edits with fresh selected-element identity; import shrink-center/fit recovery,
  new-menu growth-visibility, native node/PNG invariants, source-mode no-write isolation, current export
  and scale behavior all pass. This is two focused specs, NOT full-repository E2E or native X4.
- Graphify code-only refresh PASS10965nodes/27593edges/336communities; existing HTML size limit honored.
  Skill/package version mismatch warning noted, no installation/config/semantic extraction undertaken.
  Evidence: test-results/b119-canvas-viewport-parent-graph-first.log. Parent final integrated checks are
  running against frozen worker files before full repository E2E; no next feature starts in this session.
- Parent final compiler/UI/exact lint/diff all PASS with eight stable source hashes; only five known App
  lint warnings remain. Both Luna workers closed. New inert eight-file browser-green checkpoint records
  all hashes at2026-09-10T14:55:43Z. Full repository suite running111tests on isolated3200/3201.
- Visual review limitation remains material: fourth-run created-menu-one-to-one.png shows an apparently
  empty view when the short canvas preserves its center over the blank part of the frame; the subsequent
  explicit pan restores the title and tests pass. Do not call this a completed usable authoring slice.
  Reclaim canvas height/ordinary inspector space next; do not change native geometry or weaken center
  semantics merely to make an evidence screenshot attractive. Renderer/source owners stay untouched.

## CLOSE / requirement review — 2026-09-10

- Full repository E2E PASS111/111,0failed,0flaky,0bad results in9.8minutes. Structured report complete,
  treeGone:true,3200/3201 closed. All14 live-state/config/discovery files unchanged. Full evidence:
  test-results/b119-canvas-viewport-full-first-artifacts/e2e,
  test-results/b119-canvas-viewport-full-first-verdict.json and full-first-isolation.json.
- Final source guard: all eight tested source files unchanged from browser-green snapshot; all seven
  protected owner/test files unchanged from their earlier baselines. HEADmain93c9af111d63ca77c99dee11f21882c4073bcda6,
  index empty, X4 stopped. Evidence: test-results/b119-canvas-viewport-final-source-state.json.
- Done/evidenced: preview-only bounded camera, truthful rounded zoom, actual native-canvas identity and
  PNG invariance, positive pan/click, measured shrink-center/clamps, growth visibility and Fit recovery;
  exact fresh selected-element continuation across repeated named/unnamed scalar edits; source/legacy
  writer isolation without workspace/history/preference writes; existing negative suites preserved.
- Partial: readable, comfortable everyday authoring. Screenshot inspection passed as an evidence method
  but did NOT establish a finished usable slice. The short viewport can show blank frame space at100%,
  while dense technical bands/inspector copy consume usable height. These remain explicit product work.
- Out of this unit, still required by full goal: contextual insertion, structural authoring/history,
  broader scenarios/save-reopen/real-menu imports, namespace/font recovery and three-menu/twelve-reference
  fidelity, installed-host and authorized native X4 checks. No arbitrary Lua execution or invented geometry.
- Review corrections were bounded: real frame/table Fit bounds, finite scale, honest manual display,
  exact two-phase selection, terminal-refusal release, truthful test dependencies and camera oracles.
- Capability-map delta and triggered AAR banked in F:/StarForge/wiki/x4-forge/. GitHub41 stays open;
  no whole-goal completion, new release, commit/push, package/install or game/mod/save/config write.
- Suggested checkpoint title: feat(ui): add source-canvas zoom and continuous selected-element editing.
  Both Luna workers closed; no validation/service process left running. No next feature in this session
  after the explicit degradation call. Fresh context should begin the bounded authoring-space UX pass.

## AAR outcome

NON-CLEAN: cached-Git false alarm, executable recovery-copy suffixes, extracted-handler fixture omission,
stale fixture IDs and overbroad resize-visibility tests required correction. Sustain source ownership,
direct hashes, immutable snapshots, real browser evidence and isolation receipts. Improve parent test
design: decide which geometric invariant is actually required before turning visibility into an oracle.
Highest evidenced weakness is cramped ordinary authoring space, not a reproduced camera-center defect.
Project ledger updated; no Codex-memory write or new skill. Production/static/browser results are distinct
from installed-product/native truth and from overall usability acceptance.
