# B119 ordinary authoring workspace

Date: 2026-09-10
Lane: FULL
Status: VERIFIED bounded workspace pass / full B119 goal IN_PROGRESS / PARTIAL
Owner: existing GitHub #41; whole goal remains PARTIAL.

## PLAN

- Bounded unit: reclaim usable canvas height and put selected-element inputs within immediate reach.
  This is a usability prerequisite, not completion of contextual widget insertion or the nine journeys.
- Approved design: canvas primary; source-canonical hierarchy/inspector; technical authority behind Inspect.
  References: original FORGE-UI-EDITOR-BRIEF.md, canvas-first-builder plan, current handoff, ADR-F1/F2/F5.
- In scope: compact file/menu toolbar; accessible Preview settings disclosure for existing dimensions,
  scale and their exact owners; concise canvas zoom/status bar; selected properties without redundant
  instructional bands; preserve advanced diagnostics/export and explicit Not verified in game.
- Out of scope: source writer, projection/renderer/camera algorithms, registration, App-wide layout,
  insertion semantics, new history, deployment, install/publish/game/config mutations.
- Options reconciled: cosmetic color changes do not fix the measured space loss; global App-shell
  redesign expands unrelated scope; compact existing SourceEditor presentation directly fixes it.
- Risks: hidden diagnostics, inaccessible controls, focus/scroll regressions, camera remounts, tests that
  mistake pixel changes for usable authoring. Existing stale/CAS/export guards remain unchanged.
- Rollback: exact existing eight-file browser-green .snapshot checkpoint, plus current hashes; reverse
  only this unit's hunks. Preserve all pre-existing and unrelated work. No Git reset/restore/clean.

## BASELINE

- HEAD main 93c9af111d63ca77c99dee11f21882c4073bcda6; index empty; many pre-existing dirty files.
- Prior full E2E111/111 and focused7/7 are green; source hashes are rechecked before worker dispatch.
  Prior checkpoint: test-results/b119-canvas-viewport-browser-green-checkpoint/receipt.json.
- Actual1280x720 screenshots show only about150-175px of canvas height and text input below the fold.
  Reproduce this as a before/after rendered measurement; don't alter native game geometry to fit.
- Ken authorized quiet-machine tests; current X4 absent and3200/3201 unbound. Protect live state.

## RECONCILE

- Existing X4UiSourceEditor owns toolbar, source/target selection, native canvas, inspector, Inspect,
  profile state and exact Apply path. SourceEdits already accepts a friendly presentation flag.
- Existing insertion discovery only issues first-row/fallback-display/frame-display anchors and
  whole new-table/row blocks. No selected-cell/row insertion exists in searched structural owner.
  Do not disguise that block textbox as a widget palette; extend the owner in a separate bounded batch.
- Reuse all selection/acknowledgement/geometry owners. No capability-map delta before validation.
- Agent-Brain result was old general Forge history, not evidence of a prior contextual palette solution.
- Graph vocabulary/traversal used existing source/structural/insert/block/anchor terms; source-level
  inspection is authoritative for insertion absence. No graph rebuild/install needed at baseline.

## IMPLEMENTATION TASKS

1. Native Luna owns ONLY src/components/X4UiSourceEditor.tsx,
   src/components/X4UiSourceEditor.selftest.tsx, tests/e2e/x4-ui-source-editor.spec.ts.
   Parent owns records, source-writer reconnaissance, integration review, serialized browser tests.
2. Add failing presentation/geometry acceptance checks, then compact the existing UI. Keep exact
   selection values and handlers. Settings disclosure may overlay but must not push the canvas out.
3. Preserve expert controls and existing automated assertions by adapting navigation, not deleting
   safety/export/profile/stale tests. No new raw Lua burden in ordinary properties.
4. Worker runs focused selftest and compiler; parent reviews complete delta against checkpoint and
   runs final focused/static/browser verification before accepting.

## ACCEPTANCE / VALIDATION

- At1280x720, normal authoring canvas viewport >=280px high and >=50% of SourceEditor available height;
  title's Text input and Apply visible without scrolling the inspector after selection.
- Create named menu, canvas-select title, two edits including escaped/shorter text, fresh pixel/source
  evidence and unrelated-byte preservation continue passing. Fit/100%/manual camera and native PNG
  invariance remain correct; no remount just from opening/closing settings.
- File/menu selectors, Preview settings dimensions/user/custom scale, Inspect diagnostics and PNG export
  remain keyboard/reasonably labelled accessible. Invalid profile still refuses and recovers honestly.
- Negative: changing source/profile while a draft exists cannot apply stale authority; existing negatives
  remain. Open settings/Inspect must not mutate canonical workspace, native dimensions or PNG by itself.
- Methods: SourceEditor selftest; TypeScript; exact-path ESLint/diff; targeted SourceEditor+mode E2E;
  screenshot inspection and DOM box measurement; fresh14file isolation baseline and teardown receipt.
  Build required after presentation edits. Full repository suite follows integrated palette/history work;
  previous full111/111 is baseline only, not proof of this delta. No packaged/native proof in this unit.
- Evidence prefix test-results/b119-authoring-workspace-; archive every failed attempt separately.

## REVIEW / CLOSE / AAR

Pending implementation and actual browser evidence. Optional reviewctl/rules and external BlastRadius
were absent in prior checks; do not install or claim execution. Use manual delta review plus current gates.

## Execution / independent insertion reconciliation

- Native Luna Leibniz01a08be9-f9c4-75a1-b00e-82a05ea59138 owns the three declared files. Parent rechecked
  all eight prior tested hashes unchanged and SourceEdits SHA789676446FBACA0D05C29C0B4C091C6C0F9F0F3D6A5423B2959D6B512BEC3B5D.
- Parent viewed the actual baseline created-menu.png. Text input is below the inspector fold; ordinary
  mode still says Stage string literal. Removing those default bands is necessary, not merely cosmetic.
- Optional reviewctl, .reviewctl/rules.yaml and external BlastRadius are currently absent, confirmed
  read-only; manual review and existing compiler/lint/browser gates are the applicable substitute.
- For NEXT insertion batch: structuralEntriesFor/structuralOwnerLedger/structuralRowOwnerFacts and
  reparseStructuralAndProve remain the owners. Replacement already proves row/table/frame; insertion
  proves only table/frame anchors. Extend exact cell/row authority; do not reuse a frame anchor by label.
- The actual corpus path is ui/addons/ego_detailmonitorhelper/helper.lua (original brief's ui/core/lib
  shorthand was not a current filesystem path). Read lines4895 onward: addRow finalizes column widths,
  appends one row, creates one cell per column and applies spans. Lines5270/5432 onward: covered cells
  cannot receive widgets, and occupied cells refuse overwrite. Palette must show only proven empty,
  uncovered cells, preserve source receiver scope and reject ambiguous aliases/branches/loops.
- Next source-owner acceptance must include exact inserted-call ledger, fresh reissued catalog, new
  source/selection adoption, sequential inserts, occupied/covered/stale negatives, BOM/CRLF/comments/
  unrelated bytes, and actual create -> Add widget -> select/edit. No new insertion code in this unit.
- AAR triggers so far: overlarge tool outputs required bounded rereads; original corpus shorthand lookup
  failed before rg --files resolved it. No source mutation or authorization workaround resulted.

## In-progress review checkpoint

- Parent reviewed first friendly-inspector delta: existing stage/apply/disabled guards preserved.
  Requested correction: pending/refused receipt must remain above a long property list, and exact lock
  details must remain accessible. Worker still implementing toolbar/tests; not final acceptance.
- No parent tests/build/E2E ran for this delta. Previous greens are baseline only.
- CLOSE: PARTIAL/IN_PROGRESS; live Luna retained for integration in fresh context. No capability-map
  delta, release/install/native claim, Git or external projection. Handoff overwritten; prior copy is
  hash-verified test-results/b119-authoring-workspace-prior-handoff.md.snapshot.
- AAR: sustain owner preservation and screenshot-derived acceptance. Improve oversized reads and
  speculative filesystem paths; they delayed implementation. One delete-plus-add samepath handoff
  patch was rejected atomically; corrected using Update File, without deleting the handoff.
  Highest evidenced weakness remains ordinary controls buried despite prior green tests; new browser
  height/visible-input gates address it. No Codex memory update or reusable skill banked.
Record final status, exact validation, remaining insertion/product gates and AAR here and in handoff.

## Final integration checkpoint — 2026-09-10

### IMPLEMENT / REVIEW

- Three-file Luna delta only: compact File/Menu/New menu toolbar; initially closed, keyboard-operated
  Preview settings; wider/taller canvas; immediate labelled property inputs and Apply; native PNG
  export retained in Inspect. SourceEdits, Session, renderer, camera and parent acknowledgement owners
  are unchanged. Seven protected and five other prior tested source files retain their exact hashes.
- Parent delta review against browser-green snapshots caught/corrected off-left settings anchoring,
  hidden pending/refused feedback and truncated refusal text. Failed/pending receipts stay above
  controls; exact locked-property details remain accessible. Existing disabled/stale/CAS handlers remain.
- Parent reviewed the final production and test deltas. Export moved into Inspect; tests now navigate
  the actual nested scroller to its button, preserving hit-testability and PNG/authority assertions.
  No safety test, type assertion or compiler setting was weakened to obtain a green result.

### VALIDATE

- Parent SourceEditor selftest: PASS, exit0. Includes existing authority/CAS/stale matrices, color19/19,
  selection transfer32/32, actual markup/Tailwind layout2/2, native canvas/overlay/PNG3/3, New menu20/20
  and actual Session/frozen sanitizer/repeated-selection flow. Evidence: parent-ui-second.log.
- Parent full normal TypeScript: PASS, exit0; exact three-file ESLint: PASS, exit0; exact-path diffcheck:
  PASS. Evidence: parent-type-second.log and parent-lint-second.log. First parent TypeScript failed on
  missing fixture-result fields; parent-type-first.log is preserved. Explicit boolean fields corrected it.
- Isolated browser two-spec gate: PASS7/7,0failed,0flaky, complete JSON report, treeGone:true,2.2min.
  Fresh preflight14file baseline and after-run14/14 unchanged,3200/3201 closed. Actual X4 remained stopped.
  Evidence: targeted-first-verdict.json, targeted-first-baseline.json, targeted-first-isolation.json;
  full screenshot/JSON/source/report archive: targeted-first-artifacts/e2e/.
- Rendered1280x720 geometry for both created menu and import fixture: SourceEditor503.671875px high;
  canvas714x322px, ratio0.639305; Text and Apply inside the inspector with scrollTop0. All five Preview
  settings controls and the popover remain in editor/viewport bounds. Keyboard open/close preserves
  canonical workspace, native bitmap dimensions/PNG and the same mounted canvas node.
- Parent inspected actual created-menu.png and builder-fit-menu.png. Inputs are visible and canvas
  space is materially larger than the prior150-175px view. Ordinary UI still contains technical/read-only
  clutter and this does not establish the whole builder's usability. Synthetic import-fixture validation
  is not a real-mod/native receipt. Native-font/overlay fidelity is not re-certified by these screenshots.
- Create/select/repeated escaped-shorter edits, exact source locality, fresh paint, fit/manual/pan/resize,
  current-only PNG export, invalid-profile refusal/recovery, and mode-write isolation all pass.
- Production Vite and server esbuild: PASS, exits0. Existing chunk-size warning retained, not suppressed.
  Evidence: parent-build-first.log and parent-server-build-first.log. No package/install/reload performed.
- Graphify code-only refresh: PASS, exit0,10971nodes/27598edges/330communities; no LLM/install/network
  configuration. Existing skill/package version warning and >5000node HTML skip remain explicit.
  Evidence: parent-graph-first.log. New hash-verified eight-file inert recovery checkpoint:
  browser-green-checkpoint/receipt.json. The graph is navigation, not a validation oracle.
- All paths above use test-results/b119-authoring-workspace- prefix. Exact final code/protection receipt:
  final-source-state.json. Previous full111/111 is baseline only; full suite follows integrated insertion/
  history work. Installed and native X4 acceptance are deliberately outside this bounded contract.

### CLOSE / AAR

- VERIFIED bounded pass; full B119/GitHub41 stays IN_PROGRESS / PARTIAL / Not verified in game.
  Luna Leibniz01a08be9-f9c4-75a1-b00e-82a05ea59138 closed after independent static/browser/build gates.
- Capability-map delta: measured ordinary authoring space and immediate controls, not contextual palette.
  Next required unit is contextual insertion through the existing source owner; do not substitute more
  cosmetic passes. Structure/history/scenarios/save-reopen/real imports/recovery/namespacing and all
  three-menu/twelve-reference/packaged/native obligations remain open.
- No sourcewriter/renderer/history/registration/global-shell change, real mod/game/save/config write,
  release/publication/installation, Git mutation or GitHub projection. Existing installed0.0.78 immutable.
- Suggested commit point: B119 reclaim canvas authoring space and expose immediate property controls.
- Triggered AAR: review corrections; worker stale class/export navigation failures; parent compiler red;
  oversized diff output and an incorrect root-level graph marker lookup. Correct marker lives under
  graphify-out. Sustain independent rendered geometry, source hashes and preserving failed-run evidence.
  Improve fixture result-type synchronization and read only bounded diff sections/discovered paths.
- Highest evidenced remaining weakness: absent contextual Add widget still prevents ordinary visual
  construction beyond the starter menu; empty/uncovered cell authority must be extended in SourceEdits.
  Existing source-owner/corpus reconciliation above defines the next bounded experiment. Project AAR
  records this; no Codex memory edit or reusable procedural skill banked.
