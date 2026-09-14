# B119 canvas-first visual builder

Date: 2026-09-10
Lane: FULL
Status: PARTIAL; Batches1/1A implemented with focused proof; mounted and full product gates remain open.
Owner: existing GitHub issue #41 (full B119 remains open).

## Goal and approval

Ken approved Astra's product review and explicitly rejected a Lua scripting interface with extra steps.
The active goal is the complete objective in
`C:/Users/Moshi/.codex/attachments/d06dfea8-8256-48a5-97f5-b524fac87153/goal-objective.md`.
The original `FORGE-UI-EDITOR-BRIEF.md` remains the rendering/fidelity contract; this plan adds the missing
visual-authoring acceptance contract. It does not replace native proof with browser proof.

The governing question is: **Does this make building a real X4 interface materially easier than writing its Lua by hand?**

User reaffirmation2026-09-13: Qt Widgets Designer is the intended interaction reference
(https://doc.qt.io/qt-6/designer-to-know.html): visual widget palette, editable form/canvas,
selection/properties and understandable layout actions. This is not a request to replace
X4's layout rules or canonical Lua with Qt layouts or a separate source format. Keep
ordinary authoring on the canvas and technical source details behind Inspect.

## Product contract (all required for the full goal)

1. Create a small menu without typing Lua.
2. Add and select supported widgets visually.
3. Edit text and layout properties with immediate visual feedback.
4. Rearrange supported structures and undo/redo source changes.
5. Exercise long text, another resolution/UI scale, and context keep-out overlays.
6. Save/export real Lua and reopen it with intended structure and appearance preserved.
7. Visually edit an existing real menu without altering unrelated source.
8. Recover clearly from missing samples, unsupported constructs, and stale edits.
9. Pass applicable automated, packaged-host, and authorized native-X4 fidelity checks.

Maintain a code path for experts; it must not be required for ordinary supported authoring. Do not claim
completion from tests, publication, diagnostic counts, or an empty preview. New-menu and imported-menu
acceptance are separate journeys. The prior three-menu/native and broader B119 proof obligations remain
open rather than being silently replaced by an easier new fixture.

## Reconciled design

Selected: **one source-canonical visual workspace over the existing owners**. Rejected: cosmetic restyling
of the diagnostic form (does not implement authoring); reviving the legacy pixel model as authority
(breaks source fidelity); replacing the proven parser/renderer/deployer (unnecessary new failure surface).

- Center: persistent fit/zoom canvas, selection outline, and contextual empty/partial recovery.
- Left: source-derived frame/table/row/cell/widget hierarchy and context-aware insertion palette.
- Right: selected element's human-readable properties, with exact-source details on demand.
- Toolbar: menu/source, drawable resolution, X4 user scale, context overlays, preview scenario.
- Secondary inspect area: Lua, diagnostics, corpus/provenance, branch/loop internals, and evidence export.
- Use X4 table semantics: row insertion, cells/spans, column widths, table placement; no fake freeform
  widget geometry. Preview-only selection overlays never alter the painted game bitmap or its evidence.
- Samples are reusable design-time scenarios, with relevant inputs and affected-element explanations.
  Resolve already-proven profile/constants through existing owners, never fabricated fallback geometry.
- Preserve independently renderable known content; expose uncertainty on affected regions only when
  the existing scene/paint owners can actually prove that independence.
- Separate new authoring (tested direct-call scaffold) from bounded import editing without splitting
  either onto an unrelated deployed representation. Unsupported imported expressions remain locked.

## Baseline

- Host checkout F:/DEV_ENV/X4_Forge, main/HEAD 93c9af111d63ca77c99dee11f21882c4073bcda6; index empty.
- Six prior B119 source/test modifications plus release metadata are pre-existing, protected work.
  Numerous unrelated dirty/deleted/untracked files also pre-exist. No broad staging or restoration.
- Published/installed 0.0.78 is immutable and MUST NOT be republished. Its runtime/payload checks passed;
  its current MENU/HUB/COMM rendered acceptance did not close. No redesign code is installed yet.
- Actual Source Editor use showed a long diagnostic page, sample controls far from the canvas, and an
  incomplete MENU preview after seven applied samples. This is reproduced usability evidence, not a
  diagnosis that the renderer is broken. No user stop is currently in effect; Computer Use must keep
  Antigravity foreground and honor Escape/explicit stop.
- Existing source-edit and scene infrastructure exists; source view lacks a connected visual selection
  inspector. Legacy UIBuilder has a hierarchy/manipulation model, but writes uiWidgets rather than
  imported canonical Lua. Do not reuse those writes for this builder.
- ADR-F2 explicitly prioritizes first success and preserves the expert code path; this design aligns.
  ADR-F1/F5 workspace CAS and immutable identity remain mandatory.
- Initial clean owner hashes:
  - X4UiSourceEditor.tsx: E80BB96E7A6B0215E8E3341F3B4FFE1F2E79BEAD100CFA29E9A7E128BC01781F
  - X4UiSourceEditor.selftest.tsx: 945BD2B8D44EDBC1B1141EE2100D1F1C443273CB43883AC2CB6FED5066C3BC71
  - UIBuilder.tsx: 6F00F675FAA5E8568A36F9612B5025C325C4D3B8290DA15548A0EFEF814FDD36
  - x4UiSourceEdits.ts: 789676446FBACA0D05C29C0B4C091C6C0F9F0F3D6A5423B2959D6B512BEC3B5D

## Resources and couplings

- F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx owns selected session, corpus/profile inputs,
  canvas lifetime/export, exact source edit drafts, and parent acknowledgement.
- F:/DEV_ENV/X4_Forge/src/components/UIBuilder.tsx owns the existing workspace commit bridge and old tabs.
- F:/DEV_ENV/X4_Forge/src/lib/x4UiEditorSession.ts owns the source-issued projection and binding validity.
- F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceEdits.ts owns literal and structural CAS edits; reuse it.
- F:/DEV_ENV/X4_Forge/src/lib/x4UiScene.ts and x4UiPaintPlan.ts own geometry, source provenance, and paint.
- F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceBundle.ts and x4UiWorkspaceSource.ts own canonical source identity.
- App workspace history/undo, existing compile/export, and template materialization need exact coupling
  review before their batches; do not introduce a parallel history or source writer.
- Graphify confirmed SourceEditor already imports applyX4UiSourceStructuralEdit. Code-only graph cannot
  establish usability. Current component rendering and native screenshots are the interface evidence.

## Authorization, risk, rollback

Authorized: bounded repo code/tests/docs for the approved direction and isolated fixture validation.
User update2026-09-12: Astra implements and tests directly as well as planning/reviewing. Stop using Luna execution agents. This supersedes historical worker-routing instructions in this plan; source, validation and protected-write gates remain unchanged.
No new dependency, server endpoint, AI spend, credential, permission, deployment format, or game writer.
Do not edit the live AI Influence workspace, real mod/game/save files, installed extension, or standing
config during development. Scratch validation is not permission to overwrite Ken's selected canvas.
Publishing/install/reload and native game writes retain their explicit paragraph-and-go gates.

Risks: mismapped property edits, stale selection writing the wrong source, hidden critical diagnostics,
canvas overlay scaling disagreement, invalid source insertions, accidental legacy uiWidgets mutation,
and a superficially attractive interface that still requires Lua for normal tasks.
Rollback: preserve initial exact files/patch boundaries, then reverse only task-owned changes with review.
Do not reset/check out broad files or discard the six pre-existing B119 implementation changes.
Git/public projections follow project gates; no premature commit/publish just to close a batch.

## Batch 1: persistent canvas, hierarchy, selected-element editing

This is the first implementation batch, NOT the full definition of done. Its concrete user journey is:
open a supported existing menu -> select a visible element or hierarchy row -> edit one exposed literal
property -> observe new source-derived pixels without navigating a diagnostic catalog.

### Owned files

- F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx
- F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.selftest.tsx
- F:/DEV_ENV/X4_Forge/src/components/UIBuilder.tsx (only source-mode presentation, if necessary)
- F:/DEV_ENV/X4_Forge/src/components/X4UiBuilderSurface.tsx (new presentation owner, if needed)
- F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.ts (new disposable presentation mapping, if needed)
- F:/DEV_ENV/X4_Forge/src/lib/x4UiBuilderPresentation.selftest.ts (new focused tests, if needed)
- F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts (targeted existing test updates)

### Steps and acceptance

1. Record current SourceEditor selftest baseline; add failing tests for canvas-first layout, source-bound
   hierarchy/property mapping, and invalidated selection. No engine correctness oracle may be weakened.
2. Compose existing panels into a bounded-height workspace. Canvas stays mounted/visible while ordinary
   inspector/scenario controls scroll separately. Retain all diagnostic information in explicit Inspect
   controls, not as the default wall of text. Main controls use readable labels and appropriately sized text.
3. Build disposable hierarchy from current issued program/scene identities. Selection is preview-only.
   Use exact source operation identity to expose only the selected element's existing editable/locked
   catalog entries. No fuzzy expression/name lookup may authorize an edit.
4. Clicking known scene geometry selects the same node as the hierarchy, with keyboard-accessible rows.
   Account for canvas CSS scale/scroll, keep selection adornments out of native PNG export, and do not
   add geometry where the owner has none. Source/profile/workspace change reconciles or clears selection.
5. Reuse the existing stage/apply source-edit and parent acknowledgement path; present friendly controls.
   A failed/stale/pending edit must not show false success or adopt new source. Expert technical details
   remain available. Do not expose a fake working palette before visual insertion is implemented.
6. Run focused tests/typecheck/exact lint, then inspect the isolated rendered surface. Exercise one
   static literal edit and a stale/locked negative. Record screenshots and source before/after locality.

### Validation commands/evidence

Use existing bundled Node24 at
C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.
Run from F:/DEV_ENV/X4_Forge:

- node --import tsx src/components/X4UiSourceEditor.selftest.tsx
- node --import tsx src/lib/x4UiBuilderPresentation.selftest.ts (if introduced)
- node --import tsx src/lib/x4UiSourceEdits.selftest.ts (regression, unchanged owner)
- npm run typecheck
- node node_modules/eslint/bin/eslint.js <exact changed source/test paths>
- git diff --check -- <exact changed paths>
- X4_FORGE_E2E_WEB_PORT=3200 X4_FORGE_E2E_API_PORT=3201 npm run test:e2e -- tests/e2e/x4-ui-source-editor.spec.ts
  (Use PowerShell env syntax; these names were verified in playwright.config.ts.)

Parent owns serialized E2E/build/live inspection; worker must not start a second stack. No full E2E claim
from the focused spec. Preserve existing tests by adapting navigation when controls move under Inspect,
not deleting assertions for hidden safety controls. Real-corpus rendered evidence is separate from mocked
E2E transport evidence. Native Antigravity installed proof remains unavailable until the replacement
package/install gate is explicitly authorized. Evidence: test-results/b119-canvas-first-* and
dev-docs/b119-canvas-first/ (screenshots/fixtures); results appended to this record.

## Following batches (remain required; reconcile exact owners before implementation)

2. New-menu scaffold and visual palette through the existing source bundle/structural-edit owners.
   Add text/button/editbox and table/row controls with valid X4 placement. Creation cannot overwrite a
   registered file or silently migrate the legacy designer. No user-authored Lua needed for the journey.
3. Structural rearrangement and existing workspace undo/redo, including stale/external-change negatives;
   source-preserving save/export/reopen through existing owners. No parallel authoritative layout/history.
4. Named preview scenarios and concise unresolved-input recovery, source/profile invalidation, long-text,
   scale/context testing, and real imported-menu editing with unrelated-byte checks.
5. Full acceptance: automated/full isolated E2E, build/package/installed host, exact deploy hashes and
   separately authorized native-X4 comparisons. Complete all nine product requirements before goal close.

### Creation and history reconciliation — 2026-09-10 10:28Z

These are confirmed integration boundaries, not implemented capabilities. They refine batches 2/3;
Batch 1 remains with its existing Luna worker and exact write set.

- `F:/DEV_ENV/X4_Forge/src/lib/x4UiWorkspaceSource.ts` owns immutable passthrough projection and cloning.
  Its `spliceX4UiWorkspaceSource` explicitly refuses changed ui.xml or changed Lua-file count. Therefore
  new-menu creation cannot be passed off as an existing splice. Extend this existing owner with a bounded
  creation transaction after its own plan/baseline: add a uniquely named Lua record and source-local XML
  registration, validate the resulting bundle, preserve existing bytes/records, and reject collisions,
  stale workspace identity, malformed/ambiguous registration, and generated-output shadowing.
- `F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceBundle.ts` remains the XML/Lua registration interpreter.
  Search boundary: x4Ui*.ts exports and registration/materialization callers, SourceEditor, UIBuilder,
  App, and projectOrchestration's file-create path. No existing source-owned new-menu transaction found.
  `createProjectFile` uses the separate ExtensionProject model; it is not the live ModWorkspace writer.
- `F:/DEV_ENV/X4_Forge/src/types.ts` contains the legacy generated-menu lifecycle in generateUILuaScript.
  It is a lifecycle reference, not permission to revive uiWidgets as canonical source. New authoring must
  use a tested direct-call scaffold with real registration/open/close behavior, then edit its Lua locally.
  Reconcile it against the corpus and already game-tested fixture before selecting the exact scaffold.
- `F:/DEV_ENV/X4_Forge/src/App.tsx` owns pastStates/futureStates, saveCheckpoint, handleUndo/handleRedo,
  toolbar actions and keyboard shortcuts. The current UIBuilder mount does not receive saveCheckpoint.
  `F:/DEV_ENV/X4_Forge/src/components/UIBuilder.tsx` commits source edits through exact-object CAS and
  post-React acknowledgement but does not record history. Wire accepted edits into the existing history
  once per acknowledged transaction; refused, stale and no-op edits must add no checkpoint. Preserve
  workspace switching/reset history isolation and do not put side effects in replayable React updaters.
- Required history proof: edit -> undo -> byte-exact prior Lua -> redo -> byte-exact edited Lua, with
  source-derived canvas updates each time; refusal/no-op leaves history unchanged; stale/external-change
  and workspace-switch cases never restore another workspace or erase newer unrelated changes.
- Required creation proof: blank eligible workspace -> named menu -> visible selectable widget without
  Lua typing; compile/export includes both registration and exact Lua; save/reopen remains source-owned.
  Collision and invalid-registration fixtures refuse without mutation. Existing imported menu files and
  unrelated passthrough records remain byte-identical. Creation/undo UI tests use the isolated E2E stack.

The revised goal attachment strengthens continuity and no-scope-shrink language without removing any
acceptance item. Its escaped workspace spelling resolves to the actual host checkout F:/DEV_ENV/X4_Forge.
No goal completion, new visual verification, or additional release authorization is inferred.

## Review, close, and AAR

Each batch records changed paths, positive/negative commands and results, rendered evidence, missing gates,
capability delta, and exact next step. Full goal status stays IN_PROGRESS/PARTIAL until all requirements pass.
Current AAR trigger: product reconciliation changed the acceptance contract. Sustain the engine/source
safety foundation. Improve the prior acceptance gap: successful pipeline tests did not require a successful
visual-authoring journey. Highest evidenced risk is mistaking another diagnostic/presentation rearrangement
for the completed builder; the full nine-item contract and early hands-on journey are the countermeasure.
No Codex memory or skill files are changed.

## Execution checkpoint — 2026-09-10 10:25Z

- Initial SourceEditor selftest finished exit 0 before worker edits. Existing authority/CAS/SSR suites
  and canonical-color matrix 19/19 passed; log test-results/b119-canvas-first-baseline-source-editor.log.
- Native Luna Epicurus (01a08ad2-da2c-7973-aa9c-ee75c767bb36) owns Batch 1's exact code/test paths.
  Parent owns records, independent review, E2E, and rendered inspection. No second worker or UI writer.
- Reconciliation corrected the provisional E2E environment spelling before execution; use the verified
  X4_FORGE_E2E_WEB_PORT/X4_FORGE_E2E_API_PORT names. No E2E stack was launched with incorrect names.
- Baseline process/port reads found no X4 process and no 3200/3201 listener; no live state was changed.
  Existing user machine authorization covers continued development; recheck state before heavy validation.

## Resume checkpoint — 2026-09-10 10:34Z

- Updated objective read in full; current attachment is the ee7a2a0a path above. All nine requirements
  remain unchanged. The preceding prompt-only/interrupted goal turns made no implementation progress.
- Parent reran `node --import tsx src/lib/x4UiSourceEdits.selftest.ts` using bundled Node24: exit 0,
  PASS 95/95 with every printed causal matrix green (including 48/48). Full output is retained at
  test-results/b119-canvas-first-source-edits-regression.log. This proves the unchanged guarded-edit
  regression baseline, not the new visual authoring flow.
- The native worker handle is live: app read_thread reports active/inProgress, with completed source
  inspection commands and a current layout/mapper implementation checkpoint. Observation timeouts did
  not justify a restart. Same worker/write set retained; no duplicate worker or source ownership change.
- Machine state changed: read-only window inventory includes Conan Exiles and the attempted Forge
  snapshot visibly shows Conan gameplay covering Forge. No activation, resize, minimize, click, typing,
  or workspace switch was performed. This is NOT Forge rendered evidence. An asynchronous machine-state
  question is pending; hold heavy E2E and desktop input while operator activity is unresolved. Continue
  bounded coding/review/focused checks. No heavy E2E/build/service was started in this resume.
- Documentation diff hygiene passes; no capability-map delta from these integration findings or tests.
- AAR trigger: current window capture did not show the requested product. Sustain target-window/no-input
  checks and fail-closed evidence classification. Improve tooling: a returned window identifier alone
  does not establish screenshot content under occlusion. Require visible target verification before UI
  acceptance; do not activate over an active game to manufacture that proof. No global memory mutation.

## Batch 1 early parent review — implementation in progress

- New x4UiBuilderPresentation.ts and its focused selftest are in the worktree; SourceEditor wiring is
  being implemented by the same Luna. Parent review is REQUEST CHANGES pending completed implementation.
- [REPRODUCED] A filesystem-free real Session fixture with ui.xml and a direct frame/table/row/createText
  menu, no corpus, and profile 800x600/scale1 produces a partial program, refused Scene, and an empty
  builder hierarchy. The mapper early-return discards known source structure when geometry is refused.
  Retain source-known hierarchy without fabricated rectangles; expose the missing-render-input reason.
- Source inspection confirms LayoutProgram rowIndex and cell column are one-based. The initial mapper
  adds one again while its synthetic test uses zero-based rows/cells. Correct the display and test data.
- Further review requests: prove actual text-node selection exposes the text literal (Scene content-fact
  source can be narrower than operation source); keep widget/text children reachable from cells; honor
  clipping and paint ordering for hit testing. These are unverified hypotheses until the runtime fixture
  or rendered host confirms them. Parent sent exact owner pointers and requested focused regressions.
- This is early corrective review, not completed/new UI acceptance. No source-owner safety gate is weakened,
  no engine write-set expansion is authorized, and no full-goal requirement is dropped.

## Independent selection/edit review — 2026-09-10 11:00Z

- PASS: real Session program without corpus now retains frame/table/row/cell hierarchy with no fabricated
  rectangles. Loader-issued canonical corpus/color projection confirms text/caption hits and exact
  table/row property ownership. Logs: test-results/b119-canvas-first-parent-selection-edit-review.log and
  test-results/b119-canvas-first-parent-selection-edit-diagnostic.log.
- [REPRODUCED] The initial type-grouped node list was not a usable parent-first hierarchy for two rows.
  Luna corrected traversal and removed internal IDs from empty secondary-text labels. The later explicit
  height control reports identical flat/preorder ordering; rendered grouping remains unverified.
- [REPRODUCED] A valid canonical-corpus menu with automatic-height text exposes an editable button caption,
  but applyX4UiSourceEdit refuses with reparse-provenance-drift. Reconstructing the same guarded splice and
  reprojecting through the public owner shows createText operations change from applied to unresolved and
  the reissued catalog locks. The current helper retains color authority only, omitting canonical corpus
  authority supplied by PreviewPipeline. No source edit was accepted in the failing case.
- Control: adding explicit text heights makes caption edit/locality/stale rejection pass. This is causal
  isolation, NOT a workaround or a reduced acceptance fixture. Automatic-height authoring stays required.
- Evidence: test-results/b119-canvas-first-parent-reparse-diagnostic.log,
  test-results/b119-canvas-first-parent-reparse-operations.log, and
  test-results/b119-canvas-first-parent-explicit-height-control.log. These are in-memory workspace probes
  using read-only configured corpus APIs, not mounted UI or native-game acceptance.
- Optional reviewctl, repo .reviewctl/rules.yaml and the skill's external BlastRadius script are unavailable.
  No installation/configuration change attempted; manual diff review, Graphify and existing gates remain.

## Batch 1A: preserve canonical corpus authority across guarded reparse

Status: PARTIAL / implementing and validating. Necessary correctness repair discovered by Batch1
acceptance, not a new product scope. The SPECIFIED contract below preceded the two-file implementation.

- Bounded unit: extend the existing layout evidence issuance/reprojection owner so source edits reproject
  with the exact loader-issued canonical corpus that governed the original program. Recompute text/layout
  facts from edited source; never copy old geometry, heights, runtime samples, branch paths or loop state.
- Extend-versus-replace: extend the existing private issuance WeakMap and existing reprojection helper.
  No replacement parser, catalog, editor transaction, or new authority format is justified.
- Exact worker write set: F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts and
  F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceEdits.selftest.ts. No edits to the already-dirty LayoutProgram selftest
  or other six protected files. X4UiSourceEdits.ts is read-only unless reconciliation proves it necessary
  and the parent records an expanded contract first.
- Baseline SHA256: LayoutProgram.ts 50D1A1C6069B3B1B257EAD9EF9BD2CAB8BC73A7E39D3A236AC91F09E30F4C888;
  SourceEdits.selftest.ts 4AD0E5BDE3BF9D7C96F173234D4FEE53CB51B1DBE70A7095803A0DA321649BD2;
  read-only SourceEdits.ts 789676446FBACA0D05C29C0B4C091C6C0F9F0F3D6A5423B2959D6B512BEC3B5D.
  All three have no pre-existing Git diff. SourceEdits baseline95/95 and causal matrices passed before this repair.
- Couplings: PreviewPipeline supplies canonical corpus as projectX4UiLayoutProgram argument7; issuance
  currently retains only colorEvidence; reprojectX4UiLayoutProgramWithIssuedColorAuthority serves scalar
  and structural source reparse. Keep its existing callers/API compatible and all issuance checks intact.
- Acceptance: the unchanged automatic-height real Session fixture supports caption and createText literal
  changes, byte-local preservation, complete reparse and fresh catalog; repeated edits work. No-corpus
  unsupported geometry stays unresolved. Forged/cloned program/evidence and stale workspace still refuse.
  Color-authority regression stays green; do not satisfy acceptance with explicit heights or fake corpus.
- Risks: stale/forged corpus retention, altered no-corpus behavior, or accidental reusing source-bound
  preview state. Use exact loader identity and the existing pinned-corpus validation on every reproject.
- Validation: focused SourceEdits selftest, existing LayoutProgram selftest, exact lint, typecheck, diff
  hygiene, and independent original-fixture/control/negative probes. Parent serializes broad validation.
  Full E2E/build/rendered/package/native gates remain required and held by current machine/write gates.
- Evidence: test-results/b119-canvas-first-reparse-* and this plan. Rollback only the named new repair
  hunks; preserve unrelated/pre-existing changes. No dependencies/endpoints/config/game/mod/release writes.
- Parallel ownership: one additional native Luna may implement this isolated core repair while Epicurus
  completes presentation/tests. Disjoint files; no duplicate UI worker, no shared services, no recursive
  delegation. Parent continues UI review and then independently integrates/verifies both results.

### AAR delta

- Trigger: acceptance probe failed and required a bounded plan expansion.
- Sustain: real producer-backed interaction mapping and negative/locality checks exposed a contract gap
  hidden by synthetic presentation tests and explicit-height source-edit fixtures.
- Improve approach/tools: preserve source-independent loader authority across reparse and cover automatic
  text height in the source-edit regression. Keep diagnostic output focused on statuses/reasons, not full
  operation metadata. Optional scanner absence is not permission to claim it ran.
- Highest evidenced risk: a visually editable literal can be impossible to apply because preview and edit
  revalidation use different input authority. Repair the existing owner and prove the unchanged fixture.
- All nine product criteria remain open. No new mounted UI, installed or native proof, no goal completion.
- Parent checkpoint11:04Z: two avoidable path-query errors triggered the operator degradation call;
  no source mutation resulted. Preserve current workers and use a fresh integration context next.
  Reduce speculative path lookups and full metadata output. Commit remains gated, not requested/executed.

## Integration checkpoint — 2026-09-10 11:13Z

- Prior goal turn classified PROGRESS: real failing automatic-height edit evidence changed the repair
  scope; presentation corrections landed; Batch1A was documented and assigned. Full goal remains active.
- Parent independent mapper selftest PASS28/28, exit0; SourceEditor SSR/state/authority selftest exit0,
  including canonical-color19/19. Logs: test-results/b119-canvas-first-parent-mapper-review.log and
  test-results/b119-canvas-first-parent-ui-review.log. These do not prove a mounted authoring journey.
- All six protected pre-existing B119 source/test hashes still match the recorded baseline.
- App read_thread confirms BOTH existing workers inProgress. Dirac independently reproduced the intended
  reparse-provenance-drift regression before implementing its two-file fix; no restart or duplicate worker.
- Review of the new E2E test found ambiguous widget/text selection and missing direct-canvas/fresh-pixel
  assertions. Epicurus is correcting these before handoff. Existing generation/export checks must remain.
- [HYPOTHESIS, pending mounted proof] canvas hit testing needs the same exact-current mounted identity
  gate as export: a retained stale bitmap must not be hit-tested against new source/profile geometry.
  Requested reuse of existing classifyX4UiCanvasExport with current refs, plus negative coverage; no new
  authority system or expanded write set. Actual E2E/rendered validation is still machine-state gated.

### Next-batch insertion reconciliation (not implementation authorization)

- Current SourceEdits insertion anchors are first-row, fallback-display and frame-display. The block
  form requires a new table/row block under a frame. There is no row/cell-specific insertion anchor in
  the searched SourceEdits structural types/discovery. The palette cannot be completed merely by hiding
  a raw block textbox or adding a separate overlapping table for every widget.
- Batch2 must reconcile and extend the existing exact structural owner for insertion into the selected
  supported table/row/cell, preserving parent ownership and call-ledger/CAS checks. Record its exact
  write set before implementation; SourceEdits.selftest.ts currently belongs to Dirac until handoff.
- New-menu lifecycle reference is the existing types.ts generateUILuaScript and saved pipeline_test.lua;
  ui.xml registration format is generateUIIndexXML. Reuse their verified lifecycle semantics, not legacy
  uiWidgets as canonical state. SourceBundle currently parses registrations but does not issue XML edit
  offsets; byte-local registration insertion needs its own exact source-owner contract and negatives.

## Batch1A independent green probe — 2026-09-10 11:14Z

- Dirac's bounded LayoutProgram change retains the exact canonical corpus in the existing private
  issuance record, checks the existing pinned-corpus guard, and forwards it through the existing
  reprojection helper. No source-bound samples, paths, loops or old geometry are carried forward.
- Parent reran the ORIGINAL automatic-height top-level fixture (no explicit-height substitution) with
  loader-issued canonical corpus and color: caption hit maps correctly; first caption edit is accepted;
  only the intended literal changes; original workspace, ui.xml and unrelated.txt remain unchanged.
- A second createText edit uses the newly returned catalog, accepts and reparses. A fresh Session
  recomputes text width from84 to150.375 at800x600/scale1. Stale workspace/source reuse still refuses
  workspace-source-mismatch. Parent probe exits0; all hierarchy nodes retain proper preorder.
- Evidence: test-results/b119-canvas-first-reparse-parent-green.log. This is source/geometry contract
  proof only. Worker focused tests/negatives, parent shared type/Layout/lint and mounted/E2E gates remain.
- Epicurus added the requested exact-current canvas identity guard using classifyX4UiCanvasExport and
  existing refs. Its updated interaction/negative tests and full diff remain under review.

## Integration review checkpoint — 2026-09-10 11:24Z

- User replaced the active goal attachment; read the new file in full. It preserves all nine journeys,
  existing fidelity obligations, native Luna ownership and protected-write gates. No scope reduction.
- Epicurus handed back six owned presentation/test files. Parent reviewed the final SourceEditor,
  UIBuilder and E2E diff and independently reran mapper28/28, exit0. Native UI/E2E remain unrun.
- [REPRODUCED] A bounded offscreen Chromium layout probe found that the new canvas host's min-height96px
  can make its overlay taller than the bitmap: native800x100 in a500px viewport gives canvas500x62.5 but
  stage/overlay500x96. Native400x1080 is constrained to a400x504 CSS box by max-height70vh at viewport720,
  causing object-fit containment rather than a matching native aspect ratio. Normal1920x1080 passes.
- This is a Batch1 step4 correctness defect, not new product scope. Same worker is correcting host/stage
  sizing within existing ownership: bounded scrolling belongs to the outer viewport; the mounted bitmap,
  stage and selection overlay must agree in size/aspect. Empty-state sizing must not distort live geometry.
  Require normal, short/wide and tall canvas regressions; preserve native PNG dimensions/bytes.
- The probe used a separate headless browser and static fixture only: no service, live workspace,
  Antigravity input, game, installation or configuration mutation. It is not full rendered-host proof.
- Dirac remains responsible for the two-file canonical reparse repair and new test type errors. Parent
  final combined checks follow worker handoffs. Keep both existing handles; no duplicate implementation.
- AAR triggered by review-forced correction: backend hit-test math alone did not cover CSS sizing.
  Highest new evidenced weakness is disagreement between bitmap and selection-overlay coordinate spaces.
  Add actual browser geometry checks; do not weaken source identity/export guards to mask it.

## Independent integration results — 2026-09-10 11:39Z

- Parent SourceEdits selftest PASS100/100 and all printed causal matrices; log
  test-results/b119-canvas-first-reparse-parent-focused.log, exit0.
- Parent LayoutProgram selftest PASS751/751, skipped0 with verified configured X4_REFERENCE_ROOT;
  log test-results/b119-canvas-first-reparse-parent-layout.log, exit0.
- Original real-corpus automatic-height producer probe rerun11:30:16Z: exact caption hit, local edits,
  repeated text edit/new catalog, stale refusal and geometry84->150.375 all pass; parent-green.log exit0.
- Parent mapper28/28 and final SourceEditor SSR/CAS plus color19/19 pass. Browser sizing correction
  passes normal16:9, tall and short/wide3/3 with identical bitmap/stage/overlay boxes, scrolling,
  CSS/native mapping and unchanged PNG bytes. Logs parent-mapper-final.log and parent-ui-final.log.
- CSS correction changes only the SourceEditor and its test. Actual pixels are fitted through a single
  aspect-ratio box; mounted hosts no longer impose independent minimum/maximum heights. The outer
  viewport owns scrolling. Browser fixtures are component-sizing evidence, not actual Forge journey proof.
- NEW RED after the final test addition: string-based page.evaluate has an unknown result type, producing
  36 TS2339 errors in SourceEditor.selftest.tsx. The earlier type pass does not cover this final diff.
  Same Epicurus handle resumed for accurate test-result typing ONLY; no production-code repair required.
  Parent final type/lint/UI recheck and exact diff remain required before this checkpoint can be green.
- Dirac closed after full diff review and parent focused proof. Epicurus was closed then reopened for
  the type-only correction; no duplicate worker. All six protected hashes and SourceEdits.ts stay unchanged.
- AAR triggers: review-forced CSS repair; browser-test serialization(__name), viewport expectation and
  result-typing failures; parent repeated path/output mistakes. Sustain actual browser geometry checks
  and independent final compiler run. Improve by checking type after every test addition and closing
  workers only after that final result. Highest evidenced risk remains visible coordinate-space drift;
  mounted E2E is still required even after the isolated sizing cases pass. Fresh context next unit.
- Full B119 and Batch1 remain PARTIAL. No full E2E/build/installed/native/commit/publication claim.

## Batches1/1A focused checkpoint close — 2026-09-10

Status: PARTIAL. Implemented and focused tests passed; required mounted/full gates remain unavailable.
The complete nine-journey goal remains active. This is not a completed product or release.

### Final validation and review

- Final type-only correction adds an accurate browser layout result type and page.evaluate generic;
  no production behavior, runtime assertion, guard, or fixture acceptance was weakened. Parent reviewed it.
- Parent final serialized command: tsc --noEmit -> full SourceEditor selftest -> exact eight-file ESLint,
  all exit0. Evidence: test-results/b119-canvas-first-parent-typecheck-final.log,
  parent-ui-final.log and parent-lint-final.log with the same prefix. CSS3/3 and color19/19 remain green.
- Previously completed independent SourceEdits100/100, Layout751/751(skipped0), mapper28/28 and original
  automatic-height positive/locality/stale/repeated-edit probe remain applicable; only test types changed.
- All six pre-existing protected file hashes remain byte-identical to the recorded baseline. The
  x4UiSourceEdits.ts production writer is unchanged. Exact diff check passes; index is empty.
- Both native Luna workers are CLOSED, including the resumed Epicurus one-file type correction.
- Final deterministic Graphify refresh after the test-type delta passes exit0:10854nodes/27296edges/
  332communities. Evidence: test-results/b119-canvas-first-parent-graph-final.log. No semantic extraction,
  network call or HTML generation; the existing5000node visualization guard remained enforced.
- Required acceptance review: journeys1 and insertion portion2 deferred to Batch2; selection2 and edits3
  implemented/tested but actual Forge walkthrough pending; rearrangement/history4 deferred to Batch3;
  resolution/keepouts5 retained with sizing tests only; save/reopen6 and real import journey7 not newly
  demonstrated; recovery8 has focused negatives but mounted proof pending; full gate9 remains open.
- Remaining UX review includes default technical wording and selection continuity after an edit. These
  must be judged through actual interaction; current source controls are not a claim of finished UX.
- No E2E/build/new package/install/native/game/mod/save/config/commit/push/publication ran. Installed0.0.78
  remains immutable. Existing GitHub41 goal projection stays open; no new external acceptance projection.
- Suggested eventual commit title, AFTER required gates: feat(ui): add source-bound canvas selection and inspector.

### Final code/test SHA256

- src/components/X4UiSourceEditor.tsx: CEE1EB9E95263F28CC0010EA08D2A7B72455FABBD5E533A4BEF44A56910F3F4B
- src/components/X4UiSourceEditor.selftest.tsx: 271772C7DC87201D64E9C05501F7814D75275D4D834251BEC119D5AAB054C95E
- src/components/UIBuilder.tsx: 762D29AB4DF60983E6790607580FAF88BDAE8E44830F2D2D4DAACA095A5985A1
- src/lib/x4UiBuilderPresentation.ts: BD1FEE6FB160708A3B6D5D0A9AC78BE82E90F4E96691A36DE39CDDC514C8F0E9
- src/lib/x4UiBuilderPresentation.selftest.ts: 33F67A2C61A03AE4BDA2501BA9DBD172E0B8A3FD649923D90D2803E9D880CC17
- src/lib/x4UiLayoutProgram.ts: 562CCD676380B4BF16E3D8F9F2CD383E7AFE30ED4438695502523262C68BD7E5
- src/lib/x4UiSourceEdits.selftest.ts: 507B1BCAD2082254CF8B5E111451052356403F44D346232DF10C59C0D54478D5
- tests/e2e/x4-ui-source-editor.spec.ts: 70C4F57BE3A83B241355894DC554BCE1CE1BEF01305EFDAA8632D578F04DA98C

### AAR close

- Triggered, not clean: reproduced edit-authority and CSS sizing defects; review-forced repairs; browser
  test serialization/viewport/type failures; repeated parent query/output mistakes; worker resumed after
  premature close before final compiler result. No new reusable skill or Codex memory write.
- Sustain: source-faithful existing owners, actual producer-backed probes, unchanged-fixture controls,
  exact byte locality/stale negatives, disjoint Luna ownership and independent final compile/runtime checks.
- Improve approach: keep a worker through its final compiler result; include CSS/native coordinate checks
  and realistic automatic-height edits. Keep every product journey open until its actual experience passes.
- Improve tools: string-based browser evaluation avoids tsx __name serialization but requires an explicit
  result type. Keep output summaries bounded; use rg --files before path queries. Graphify skipped HTML
  above5000nodes and emitted an existing skill/package-version warning; no upgrade or semantic run attempted.
- Highest evidenced risk: correct source/engine math can coexist with wrong visible selection when CSS
  scales the canvas and overlay differently. The isolated correction is green, but actual mounted-host
  click/edit/fresh-pixel evidence is the next essential check. Full product status remains PARTIAL.
- Project lesson recorded in F:/StarForge/wiki/x4-forge/aar-log.md; capability delta below/at the existing
  capability map is limited to implemented and focused-tested behavior, not native or end-to-end acceptance.

## Save/export/reopen resource preflight — read-only, not acceptance

2026-09-10 EDT / 2026-09-11 after00:37Z, while row/history workers execute disjoint scopes.

- Existing graph explain(x4UiWorkspaceSource.ts) has extracted SourceEditor/SourceEdits/Session/SourceBundle
  and modCompiler connections. Live reads confirm source bytes are existing passthrough records, not a
  missing second editor format. No new source format or persistence owner is needed merely to reopen.
- App.tsx persistScopedWorkspaceSnapshot and existing300ms sync/cache path serialize the full workspace;
  restoreParkedWorkspace validates immutable workspace ID plus content/snapshot hashes before adoption.
  These are code-presence findings, not newly executed save/reopen proof for visually created Lua.
- IMPORTANT AUTHORIZATION BOUNDARY: App.executeCompileModProject calls /api/agent/deploy-verify.
  The UI Compile action is a deployment path, NOT a harmless in-memory export button. Do not click it
  during ordinary save/reopen testing without the declared scratch/write authority.
- Separate POST /api/agent/compile takes an inline workspace, builds its manifest and validates it. The
  buildWorkspaceFileManifest owner in server.ts retains loaded passthrough bytes when not shadowed by
  generated output. Full selected Lua/ui.xml equality and collision-negative coverage are needed for
  the actual new-menu roundtrip, not merely a generated file count.
- ReleaseCenter.exportArtifact already handles a verified prepared ZIP, checks downloaded bytes against
  its receipt, uses native/browser save paths with reread verification where available, and labels a
  download-manager handoff as not final-save proof. Preparing that artifact uses the existing platform
  release flow and configured staging root; this is not automatic authority to prepare/publish a release.
- Next roundtrip unit must reconcile a coherent ordinary UI route over these existing owners, using
  isolated workspace/artifact state. Browser reload/restore, actual Lua artifact bytes, and genuine
  import/reopen appearance are separate acceptance observations. Do not substitute PNG export.
- No route, save/export, package, browser, configuration, realmod or filesystem-artifact mutation ran in
  this preflight. Full goal journey6 remains open; no capability-map delta. Scope here is discovery only.

## Scenario and source-history persistence coupling — 2026-09-11 18:50Z

Read-only parent reconciliation while Mendel owns the numeric slice; no new implementation released.

- workspaceUndoHistory.ts records complete before/after snapshots and transitionWorkspaceHistory
 compares the CURRENT complete snapshot with the expected source-history snapshot before Undo/Redo.
 workspaceIdentity.ts67-68 defines canonicalWorkspaceSnapshotString as stableStringify(ws), including
 every persisted field, not only Lua or the narrower deployable-content field list.
- SourceEditor currently keeps applied samples and drafts in component state. Its source-history notice
 contains only direction/scope/beforeWorkspace/afterWorkspace; App1546-1571 issues that notice after the
 target workspace readback. SourceEditor4703-4706 explicitly handles the second-render notice.
- HYPOTHESIS for a proposed design, not an executed defect: naively persisting a named scenario as a
 ModWorkspace field after an accepted source edit would change that complete snapshot and cause the
 existing source Undo guard to refuse. Adding scenario snapshots to source history would instead risk
 restoring scenarioA after the user deliberately switched toB. Neither satisfies the approved experience.
- Following scenario planning must reconcile the existing persistence/preferences owners before choosing
 storage. Do not weaken complete-workspace CAS, invent a parallel source history, or silently treat
 transient component state as durable saved scenarios. Persistence scope remains to be resolved.
- Required later acceptance: edit Lua with scenarioA -> select/saveB without another source edit ->
 Undo -> original Lua withB -> Redo -> edited Lua withB; real source edits alone determine source history.
 Verify both current-session behavior and explicitly promised save/reload behavior. First-render source
 invalidation, later acknowledgement, external workspace changes and scope switches remain required.
- SourceEdits7132/8045 enforce the current mixed-stream preview-input refusal at BOTH catalog creation
 and apply. Future support must provide fresh source-bound reissue at both boundaries, not hide one guard.
- AAR: source reconciliation identifies a real persistence/history coupling before implementation.
 Two parent queries used a nonexistent guessed filename and a Windows shell wildcard; corrected with
 rg --files and exact known owners. No commands mutated code or ran Node. No capability-map delta.

### Scenario persistence owner preflight — 2026-09-11 19:38Z

Read-only discovery for the required next unit; no storage implementation/endpoint released.

- Graph StudioLayoutPreferences points to App/server/studioLayout and navigation consumers. Actual
 studioLayout.ts70-139 is global shell order/density/docking only; its normalizer emits a closed field
 list. App436-559 persists that global record through localStorage plus /api/studio/layout. It is not
 an existing workspace/menu scenario store. Do not append samples that its normalizer would discard.
- App172 workspaceLocalKey accepts only workspace/version; it names content caches, not arbitrary
 preferences. SourceEditor has no localStorage/sessionStorage owner in the inspected source. No reusable
 saved-preview-scenario owner was found in src/lib non-selftest files or SourceEditor/UIBuilder/App.
 This is the stated search boundary, not a claim about every external host or uninspected plugin.
- WorkspaceRegistry owns content snapshots/head/version and immutable IDs, not an already separate
 scenario preference envelope. App881-882/3015 passes that immutable workspace ID as workspaceScope
 through UIBuilder to SourceEditor; do not scope future saved scenarios by editable mod name or an
 empty/unbound fallback. Source changes still require exact menu/input lineage and fresh reissue.
- IMPORTANT existing helper boundary: localWorkspaceCache.persistWorkspaceCache17-51 can evict Git
 history and baseline caches to recover quota. It is not safe generic optional-scenario persistence.
 Future quota-failure acceptance must preserve existing workspace/history caches and prior scenarios,
 report save failure honestly, and avoid interpreting transient component state as durable storage.
- Persistence scope/design remains to be selected in the next reconciled implementation plan. This
 preflight does not weaken full-snapshot Undo CAS or authorize a second source history. No capability
 delta or source/UI/standing-config write; no Node/browser execution by parent.

### Saved rendered-host inspection — 2026-09-11 21:44Z

Parent viewed the existing fifth targeted-run created-menu.png and edited-menu.png, both under
test-results/b119-contextual-insertion-targeted-fifth-artifacts/e2e/
x4-ui-source-editor-Source-f33b5-its-its-title-on-the-canvas-chromium/.
These are genuine saved browser captures, not new captures, installed-host or native-X4 proof.
Hashes: created323457D247B52219787778D3BAC11249A5BD4B92C38A9F0647E98B19A925A19C;
editedC1E880F24339A381024D9D168A404F244E1A00634118C447B7ECB0FDAAFB19D3.

[REPRODUCED in saved rendering; current source mechanism confirmed] The selected text inspector shows
repeated "Read-only property · Read-only property; open Inspect for details" cards with no property name.
Current X4UiSourceEditor.tsx3316 returns that fallback for unmapped locked fields, and3912 appends the
same generic phrase. Its source hash is99334D7D2CF7CF131E808CDE74C0C839A0FA3D6F89FD7897992E9858F25D3621.
The locked-entry contract retains field, callName, reason and detail; source authority need not be loosened
to improve the message. This gives concrete evidence for the already-open default-wording/recovery item,
not a reason to rebuild the inspector or claim the current app has been visually revalidated.

2026-09-12 source-mechanism refinement (read-only): SourceEdits.callValues emits both arguments[n] and
semantic roles for the same value; candidateFor merges them by source location, and lockedEntry joins
the fields with commas. SourceEditor.sourceEditFriendlyLabel handles editable field arrays but wraps a
locked field in a single-element array, so combined roles cannot match its normalizer. Its existing
locked rendering test uses synthetic field `width`, not the actual joined catalog shape. The next UI
repair must test genuine source-issued joined fields, nested editBox/scale roles, and distinguish actual
properties from technical container/receiver entries. Preserve all entries and lock reasons in Inspect;
do not relabel internal bindings as editable settings or merely replace anonymous warning cards with
named technical clutter. Existing property controls and source authority remain the implementation path.
No new UI worker, code change, scenario-storage decision or visual pass was released for this finding.

Required later UX acceptance: meaningful labels for supported selected-element properties, a concise
reason/recovery for locked properties, no repeated unnamed warning cards, and raw source IDs/ranges/Lua
kept under Inspect. Preserve genuine lock reasons and never imply unsupported source is editable.
Test exact fallback/locked entries and inspect the actual rendered host after the approved UI change.
The fifth targeted run still has9pass/1flaky and a FAIL verdict; offline image inspection does not waive it.
No code/UI mutation, new browser, Node test or machine-state assumption was made. No capability-map delta.
AAR: saved rendered artifacts expose a user-visible defect that source-pipeline test counts do not measure.
Sustain offline artifact review when live UI testing is gated; record artifact age and verify current code.

### Current actual-interface acceptance index — 2026-09-11 22:18:59Z

This index reconciles the full goal with the saved run and current authored tests; it is not new browser
verification. Original nine journeys and three-menu/twelve-reference fidelity remain the definition of done.

| Goal journey | Evidence available | Still required |
| --- | --- | --- |
| 1 Create without Lua | September10 fifth run passed New-menu/title-edit case; genuine saved PNGs | Current integrated and installed-host replay |
| 2 Add/select widgets | Same run passed separate Text/Button/Input insertion cases | Current same-menu multi-row journey and meaningful labels |
| 3 Edit properties/live feedback | Same run passed selected-source local edit | Broader supported controls, current pixels and locked-property recovery |
| 4 Rearrange/undo/redo | Production owners and two later browser journeys authored/static-reviewed | Actual New-menu history and three-populated-row movement journeys |
| 5 Long text/resolution/scale/overlays | Prior scale case retried successfully but made the gate FAIL | Clean current scale run, long-text and keep-out experience coverage |
| 6 Save/export/reopen Lua | Source/file controls and complete browser file journey authored/static-reviewed | Actual download/reload/independent import/history/collision/workspace journey |
| 7 Edit real imported menu | Bounded real-source tests; original-input handling currently in implementation | Actual imported-menu editing, unrelated-byte preservation and full real-menu coverage |
| 8 Recover from missing/unsupported/stale | Bounded refusal/recovery tests; named scenarios not implemented | Friendly primary controls, source-bound scenario reissue and clear visible recovery |
| 9 Automated/packaged/native fidelity | Historical partial gates only | Current full E2E/precommit/package/installed/native and full fidelity census |

Parent read the actual fifth-run log/verdict: generated2026-09-10T20:08:07.907Z,10tests,9pass/1flaky,
FAIL. It includes8 SourceEditor cases plus2 builder-mode cases, not the subsequently added journeys.
Current tests/e2e/x4-ui-source-editor.spec.ts SHA remains
9E244B15955DC7E9F992A903B3EE079EFE383126B652F56ABEAF0242D6F5ADCF, matching the07:05:34Z static receipt
in test-results/b119-lua-file-roundtrip-browser-parent-reviewed-20260911T070534Z/receipt.json.
That receipt proves12 SourceEditor cases discovered: all11 prior plus the complete Lua file journey.
Current exact-file search found no process.env/test.skip/test.fixme/test.describe conditional gate.
The next two-spec browser gate must discover and run those12 plus the2 builder-mode cases, currently14;
assert the four new journey titles are present, not merely a green total from the older10-case selection.
Use the existing run-e2e.mjs runner (it selects the matching @playwright/test CLI); no runner repair needed.
This targeted gate does not replace full E2E or native acceptance. Do not run until fresh machine clearance
and exclusive serialized execution are available. No browser or Node process was launched for this review.

No capability-map delta. AAR: older green individual tests cannot establish later authored journeys;
sustain explicit test-name inclusion and dated evidence. No new failure diagnosis or product pass claimed.
Parent review checkpoint: repeated oversized read outputs and an initially mistimed heading required
correction. Heading now uses the observed UTC clock, not an estimated future minute. Stop broader parent
exploration here; preserve the same live implementation worker and inspect its next actual result.

### Scenario and recovery affordance preflight — 2026-09-12

Read-only parent reconciliation alongside Beauvoir's seven-owner numeric integration. No SourceEditor,
EditorSession, workspace/history or browser mutation, and no new visual verification. This specifies
the already-required next product behavior, not a competing scenario store or authorization to code it.

Current source observations:
- SourceEditor4193+ renders the existing sample catalog with expression/type/ID and source hash/ranges;
  the only mounted sample region6361+ is inside Inspect6255+. Friendly primary controls are still absent.
- updateSample5303 uses the exact current catalog, opaque authority and binding, preserving currently
  applied values while staging. applySampleDraft5331 revalidates that identity before using the existing
  EditorSession applyX4UiEditorSampleDraft. Reuse this path, not a parallel preview-values authority.
- resetSampleDraft5364 clears only the staged draft and error. It does NOT clear sampleInput. Therefore
  relabeling that button as a general reset would be misleading; clearing applied values is a distinct
  missing user action, not a renderer failure.
- EditorSession1938+ validates own-data draft entries, typed values and exact catalog membership. Its
  existing all-empty draft path produces an undefined sample state through reconcileX4UiEditorSampleState.
  A future Clear action can reuse that validated transaction; no raw state/policy bypass is needed.
- SourceEditor5005+ clears stale applied state on projection reconciliation, and5020 clears a stale draft.
  Binding/catalog identity includes source/program, selection and profile. A saved scenario is reusable
  data, not an opaque authority that may be serialized and replayed after these identities change.
- SourceEditor3316/3912 still produces the generic unnamed locked-property fallback previously seen in
  genuine saved screenshots. The entry retains field/call/reason/detail; meaningful labels and concise
  recovery can be derived without pretending locked source is editable.

Required next interface contract:
1. A compact Preview scenario control beside existing preview settings opens relevant typed inputs
   without Inspect. Keep the canvas visible and permit long text. Explain affected elements from actual
   catalog consumers; technical expressions, IDs, ranges and hashes stay in Inspect. Presentation labels
   never become lookup/authorization keys, and identical labels from distinct source reads remain distinct.
2. Distinguish Apply to preview (adopts a valid staged draft), Discard edits (restores displayed applied
   values), and Clear preview values (explicitly clears applied values and staged input, not saved presets).
   Clearing must use current catalog/authority validation and leave Lua, workspace, history, export,
   profile and game-verification state unchanged. Refusal retains the previous accepted preview.
3. Show named scenario state and whether it has unapplied edits; selecting/saving scenario B after source
   edit A and then Undo/Redo must retain B, through exact source-splice and fresh paths/loops/catalog reissue.
   Do not serialize opaque authority or place scenario snapshots into the source undo stack. First source
   render before App's later acknowledgement is part of the acceptance sequence, not an incidental detail.
4. Missing input identifies the relevant field and affected element with a direct route to its input.
   Unsupported source gives a truthful short limitation and optional Inspect details. Locked properties
   have meaningful names/reasons rather than repeated anonymous Read-only cards. No guessed geometry.

Required acceptance additions: draft/apply/discard/clear are distinct; Clear is usable with applied values
and no draft; stale authority refuses without changing source or claiming success; a changed scenario
survives supported scalar/structural/history transitions; same-name different-workspace/source inputs do
not cross-apply; named scenario storage cannot rewrite Lua or the source-history snapshot. Actual 1280x720
rendered inspection, long-text/scale/keep-outs and existing nine journeys remain required after clearance.

Not yet reconciled/released: durable named-scenario storage and its readers/writers, the complete exact
source-splice reissue transaction and affected-element presentation mapping. The inspected ModWorkspace
header and SourceEditor props do not themselves establish a suitable storage owner. Do not invent a
generic metadata bucket, global dock/density preference, eviction-prone cache or source format to skip
that check. Continue in existing owners after the numeric worker freeze; no second worker is released.

No capability-map delta or VERIFIED capability claimed. AAR NON-CLEAN: repeated parent output limits
required bounded rereads and a degradation checkpoint. Sustain read-only UX reconciliation while the
coding worker runs. Highest observed UX gap here is conflating draft discard with applied-value reset;
the explicit three-action contract above prevents that ambiguity without weakening sample authority.

### Scenario storage/history owner findings — 2026-09-12

Read-only source review, no new worker or storage implementation. Search boundary: all src TypeScript/
TSX direct localStorage/sessionStorage/indexedDB users; ModWorkspace declaration; App/UIBuilder props;
localWorkspaceCache, workspaceUndoHistory, EditorSession reconciliation and SourceEditor commit flow.

- ModWorkspace194-275 has no preview-scenario field. App436/474/1005 uses global Studio layout
  preferences; server2973/2983 and4400+ persist that presentation domain. Do not reuse those preferences
  for source-bound scenario data merely because they already persist.
- localWorkspaceCache.persistWorkspaceCache23-52 can shed Git-history and Git-baseline cache entries
  while recovering quota. A scenario save must not call this eviction policy; quota failure must preserve
  existing saved scenarios and unrelated state and be reported without a false Saved indication.
- workspaceUndoHistory SourceWorkspaceHistoryEntry18-27 holds complete before/after ModWorkspace
  snapshots. Putting scenarios inside those snapshots would restore scenario A after the user selected
  B, violating the approved EditA -> select/saveB -> Undo/Redo keepsB contract. No snapshot/CAS weakening.
- SourceEditor5600+ already obtains the exact accepted source splice (path/start/end/replacement) and
  submits it with current/next workspace references. This is the existing scalar/insertion/row-move
  continuation seam; a name-based diff or new source writer is unnecessary.
- EditorSession3374+ clears samples when selected program/paths/loops/profile binding changes. SourceEditor
  creates its projection before receiving App's second-render history acknowledgement. Preserve latest
  scenario data separately, but do not apply it until exact transition proof and fresh paths -> loops ->
  sample catalog issuance succeed. A saved scenario cannot grant itself authority from stored IDs.

Remaining storage decision: a bounded, workspace-scoped preview-data persistence contract with explicit
save failure and source reissue rules. No suitable existing writer was established by the searched
surfaces; this is a specific reconciliation gap, not permission to hide state in unrelated settings or
to call session-only names durable saved scenarios. No new endpoint/schema/store is released here.
No capability-map delta. AAR trigger: the first file search included nonexistent src/hooks/src/contexts;
the corrected search used the actual src tree. No files or application state changed during inspection.

## User decisions — 2026-09-12

Saved preview scenarios stay on this computer, not portable project state. Keep them outside Lua,
source undo snapshots and public release artifacts. This chooses persistence scope, not a new storage
owner: exact source-bound reissue, quotas, failed-save preservation and existing-owner reconciliation
remain required. No opaque saved authority becomes trusted. No implementation or configuration write
is implied by this note.

Push only public releases; no interim development/test pushes. The Git policy is mirrored in
AGENTS.md, CLAUDE.md and GEMINI.md. UI builder completion remains first; X4 AiLive mod work follows.
Ken explicitly authorized rendered tests. Run the existing isolated3200/3201 authoring batch, protect
the installed/development workspace/config/discovery files and Deckwright3100, then inspect rendered
artifacts. This does not authorize native game/mod/install/config writes or republishing0.0.78.
