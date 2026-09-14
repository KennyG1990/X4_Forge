# B119 Batch2A: visual new-menu creation

Date: 2026-09-10
Lane: FULL
Status: PARTIAL — implementation in progress; rendered acceptance remains open.
Parent: docs/plans/2026-09-10-b119-canvas-first-builder.md; existing GitHub41 remains open.

## PLAN

- Bounded unit: an ordinary New menu action creates real registered X4 Lua and opens it on the existing
  canvas without Lua typing or manual source/target selection. This is Batch2A, not completion of Batch2
  or the nine-part goal. Contextual widget/row/table insertion remains the next required Batch2B unit.
- Product design is already approved. Extend one source-canonical workspace; do not revive uiWidgets
  as authority or build a separate designer. New-file generation is allowed only at creation; ordinary
  edits continue to use guarded local source splices.
- In scope: pure workspace creation transaction, source-local ui.xml registration, runnable direct-call
  menu scaffold, plain-language creation controls, exact parent acknowledgement, source/target adoption,
  focused/negative tests and an isolated rendered creation journey when the machine gate clears.
- Out of scope: palette/structural insertion implementation, App history wiring, source regeneration,
  live workspace/game/mod/save/config writes, package/install/publish, dependencies, endpoints, Git changes.
- Risks: overwriting a file or registration, stale/forged source acceptance, generated-output shadowing,
  invalid Lua/XML, duplicate runtime names, false success before parent commit, late acknowledgement
  affecting another workspace, and an accurate scaffold that still requires manual technical navigation.
- Recovery: reverse only this unit's named hunks after review. Four core files start clean; preserve all
  Batch1 changes in the UI/test files and all unrelated/pre-existing changes. No reset/checkout/clean.
- Evidence: test-results/b119-canvas-first-batch2-* and this plan. Native/installed/full gates remain
  required for the full goal and are not replaced by the portable fixture.

## BASELINE

- Checkout F:/DEV_ENV/X4_Forge at HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, index empty.
- WorkspaceSource and SourceBundle selftests pass before mutation, exit0:
  test-results/b119-canvas-first-batch2-workspace-baseline.log and batch2-bundle-baseline.log.
- Core clean SHA256:
  - src/lib/x4UiWorkspaceSource.ts: B56B7A1ADD1AFD52EAFDBC077AF747DD93148CA9A62DAEDFC89CAD096D0F813E
  - src/lib/x4UiWorkspaceSource.selftest.ts: 358F0C7837C42B13097EB0D053C0100F8AFEBF1595C19FC855619E5E2D311CFE
  - src/lib/x4UiSourceBundle.ts: D939C541BE91CDD49E832BEFA150CDEFCC17428640FBCBD086D266405D0F9045
  - src/lib/x4UiSourceBundle.selftest.ts: F76EB5C1D603A15AC03DBEA9FB17900A03132ADD6C51EABFC63B32D93F38C57D
- Batch1 UI/test hashes are recorded in the parent plan's final checkpoint. Six earlier protected
  B119 files and SourceEdits.ts remain untouched by this unit. Both old workers are closed initially.
- Last actual desktop evidence was Conan gameplay covering Forge. Heavy E2E/build and desktop input
  remain held pending the existing unanswered machine-state question; code and focused tests may proceed.

## RECONCILE

- SourceBundle owns DOMParser XML interpretation, safe registration lookup, Lua parsing and bundle
  projection. WorkspaceSource owns issued workspace/source identity, immutable record snapshots,
  compiler-shadow checks, passthrough cloning and UTF-8 byte metadata.
- spliceX4UiWorkspaceSource explicitly rejects changes to ui.xml and Lua-file count; no new-menu writer
  exists in the searched source owners/exports. Do not weaken this existing splice contract.
- src/lib/xmlSourceSpans.ts already provides indexXmlElementSpans. Reuse it for exact raw XML spans,
  validated against SourceBundle's DOM interpretation. It is a location index, not validation authority.
  Keep XML parsing/registration in SourceBundle, not in the React component or a parallel parser.
- Authoritative XML reference read: F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00/ui/core/addon.xsd.
  Root addon requires name and must not use reserved ego_ prefix. Environment type is menus; file name
  is a relative Lua path. Multiple direct environments are legal. Append to the last direct menus
  environment so existing registration order is preserved; a malformed/ambiguous target still refuses.
- Existing lifecycle references: src/types.ts generateUILuaScript/generateUIIndexXML and saved
  dev-docs/b119-x4-ui-pipeline-smoke/package/pipeline_test/ui/pipeline_test.lua. Reuse lazy Helper,
  deferred registration, onShowMenu/createFrame, close/cleanup and named open-event behavior. Do not
  include the old widgets table/IR, automatic opening, preview sample fallbacks or inferred geometry.
- SourceEditor already exports submitX4UiSourceEditWorkspaceCommit and exact acknowledgement classifiers;
  UIBuilder already processes immutable expected-workspace CAS. Reuse these, including pending status.
- Graphify connects buildX4UiWorkspaceSource to SourceEdits, Session, PreviewPipeline and their tests.
  ADR-F1/F5 workspace CAS/identity and ADR-F2 first-success/expert-access constraints remain authoritative.
- Extend-versus-replace: add bounded creation to these owners; no new source representation, registry,
  compiler, renderer, history or deploy path. No implemented capability delta before evidence.

## Core/UI contract

WorkspaceSource will export a pure synchronous function:

`createX4UiWorkspaceMenu(workspace: ModWorkspace, source: X4UiWorkspaceSource, name: string)`

The discriminated result has accepted/changed, workspace/source and verification. Accepted:true always
has changed:true and menu:{name:string,path:string,menuName:string,targetName:'menu.createFrame'}.
Refused:false has changed:false, reason:string and detail:string, and returns the original workspace and
source without partial mutation. No filesystem or parent/UI mutation occurs in this function.

- Require the exact loader/owner-issued workspace-source pair and unchanged passthrough/compile inputs.
  Source cloning, stale in-place source-file edits, crossed workspaces and generated shadows refuse.
- Accept a blank source-less workspace or a supported valid source-owned registration. A well-formed
  empty addon/menus environment may receive its first file. Malformed, duplicate, omitted, ambiguous,
  unsafe or missing registered inputs stay refused. Never repair existing unrelated malformed source.
  Source-less means no existing UI registration, not an empty project: unrelated content.xml/MD/assets
  remain intact and must not prevent first-menu creation. An existing omitted/unknown ui.xml is not absent.
- Name is a nonempty bounded single-line display name(max80 characters; reject controls). Derive safe
  non-reserved runtime/relative-file identifiers; explain collisions instead of overwriting/silently
  renaming. Compare canonical path spellings case-insensitively on this Windows-owned workspace,
  including slash/dot aliases, and preserve all existing raw path spellings and file order.
- Create ui.xml only when genuinely absent; otherwise splice the exact owned insertion/closing token.
  Preserve BOM, CRLF/LF, comments, quoted attribute text and unrelated bytes. Support self-closing addon
  or menus environment through a local closing-token expansion. Reject uncertain XML span binding;
  no regex-only authority, DOM reserialization, DTD/entity expansion, or whole-document regeneration.
- New Lua is a standalone direct-call menu with one frame, one two-column table and one visible text
  cell containing the menu name; the second cell is free for the forthcoming contextual palette.
  Use normal automatic text height, real Helper calls and literal editable properties. Escape display
  text as Lua, not XML/HTML or an intermediate layout format. New-menu creation must never execute Lua.
- Parse/project the resulting bundle through existing owners; accept only source-owned/shippable output
  with exactly one new registered file, all pre-existing Lua strings unchanged, and valid new call model.
  Return the precise new file/target for UI adoption. Reuse clone/byte-count helpers; preserve unrelated
  workspace metadata and compile settings. No customLua/uiWidgets migration or mutation.

## IMPLEMENTATION tasks

### Active ownership checkpoint

- 2026-09-10 resumption: the immediately preceding prompt-drafting turn was NO PROGRESS toward
  implementation. Revalidated the current goal, plan, HEAD/index and live worker handle before continuing.
- Euclid `01a08b2b-a5eb-7fe2-9caf-a2cc86f00fce` is confirmed live on Task1's four core files; no duplicate
  worker was created after the earlier truncated spawn result. The app inventory omits this native child;
  its recorded child ID was resolved and then checked through the live task reader.
- Epicurus `01a08ad2-da2c-7973-aa9c-ee75c767bb36` is resumed for Task2's three UI/test files. Those files
  still matched the final Batch1 hashes before assignment. The fixed public contract below allows
  independent implementation; integration tests wait for the core export. Neither worker owns UIBuilder.
- Astra owns independent review and genuine-corpus projection/negative probes. Heavy E2E/build and
  desktop input remain held; no new release, installed-product, game/mod/save/config or Git mutation.
- Parent read-only baseline: the blank workspace projects an issued source with no-root-ui-xml and zero
  candidates; configured canonical corpus and colors both load successfully, exit0. Evidence:
  test-results/b119-canvas-first-batch2-parent-corpus-baseline.log. All six protected B119 hashes match.
- Refreshed read-only desktop inventory has no X4/Conan window; Forge capture reports a minimized
  window. No activation or input occurred. The refreshed machine-state question is pending, so native
  interaction and heavy checks remain held; do not infer a quiet machine from absent game windows.

### Task1: core creation transaction (native Luna)

Write only these four files:

- F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceBundle.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceBundle.selftest.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiWorkspaceSource.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiWorkspaceSource.selftest.ts

1. Add fail-first creation and registration tests against the exact public contract.
2. Extend SourceBundle with bounded source-local registration addition using DOM plus existing spans.
3. Extend WorkspaceSource with the pure atomic menu creation and valid direct-call lifecycle scaffold.
4. Verify positive creation/repeated creation/import preservation and all negatives below. Report API
   readiness for the UI worker; do not expand write ownership or change SourceEdits/Layout/Session.

### Task2: creation controls and exact adoption (native Luna, separate ownership)

Write only SourceEditor.tsx, SourceEditor.selftest.tsx and tests/e2e/x4-ui-source-editor.spec.ts in their
existing F:/DEV_ENV/X4_Forge/src/components and tests/e2e directories. Preserve all Batch1 changes.

1. Add New menu and a name field/Create/Cancel; expose this while no source is selected or present.
   No raw Lua, source offset, operation identifier or compiler term is needed for this ordinary action.
2. Call the core owner with current workspace/source, then submit its result through the existing parent
   commit seam. Creation stays pending until exact acknowledgement and current-workspace readback agree.
3. After accepted readback, select the returned file and menu.createFrame from the NEW Session catalog.
   Do not use stale source keys or auto-select arbitrary imported menus; explicit creation alone grants
   this selection intent. Show an actionable refusal and preserve the draft on a rejected creation.
4. Block double submission while pending. Workspace switch/unmount/superseded attempt ignores late
   acknowledgement. No false success, receipt inheritance, callback-side mutation or second history.
5. Add tests for no-Lua creation->selected new menu->known text/canvas path; cancelled/refused/stale/
   duplicate/pending/late acknowledgements preserve the original workspace. Add real isolated E2E journey
   (execution held until machine clears), retaining old source-edit and PNG evidence tests.

## VALIDATE / REVIEW / CLOSE requirements

- Core focused selftests: node --import tsx src/lib/x4UiSourceBundle.selftest.ts and WorkspaceSource.selftest.ts.
- SourceEditor selftest and existing SourceEdits regression; source-generated real Session projection,
  known visible text/editable literal and automatic-height checks with genuine configured corpus.
- Negative paths: name/path injection and collisions; BOM/comment/CDATA/quoted closing-token traps;
  multiple legitimate environments; malformed/DTD/ambiguous XML; existing unrelated Lua preservation;
  no-root/empty/self-closing cases; in-place stale/forged/crossed workspace; compile shadow; no partial writes.
- Final shared TypeScript, exact changed-path ESLint and diff check after every final test change. Parent
  owns independent review, full required commands and code-map refresh; do not parallelize broad gates.
- Mounted full journey: isolated fixture -> New menu -> name -> Create -> immediate selected canvas text
  -> edit title -> current new pixels -> export/reopen later Batch3. Screenshots and XML/Lua before/after.
  Neither SSR nor an API return alone proves this journey. Full E2E/package/native remain separate gates.
- Re-read this contract and diff; classify each requirement done/partial/missed/deferred. Keep overall
  PARTIAL until mounted evidence exists. Update handoff/backlog/capability delta/AAR honestly. No commit
  or public release at this interim checkpoint; published0.0.78 is immutable.

## AAR (initial)

- Previous goal turn classified PROGRESS: implemented/reviewed repairs plus new independent evidence.
- Current reconciliation reused the existing XML span index and confirmed the actual addon XSD. This
  changes the initial assumption that a new source-location owner would be needed; no new parser planned.
- User updated the goal attachment to d06dfea8-8256-48a5-97f5-b524fac87153/goal-objective.md; product
  scope is unchanged. Both workers were notified, and handoff points to the new full objective.
- Parent review of fail-first tests caught contradictory XML-preservation and crossed-workspace shadow
  assertions before implementation. Correct the tests, not the transaction or identity guards. Clarified
  first-menu acceptance for existing projects containing non-UI assets; this is a non-clean review delta.
- Sustain source ownership and visible first-success acceptance. Highest current evidenced risk is
  accidental XML/source overwrite or false parent acknowledgement during file creation; tests above gate it.

## In-progress review checkpoint (not a completed unit)

- Task2 UI controls are written; parent reviewed the new component and its 16 mounted lifecycle cases
  plus the isolated E2E creation/edit journey. Pending state accepts only the exact acknowledged parent
  transition, then resolves the returned new path/target from the current catalog. Runtime checks await
  Task1's export; source review and worker-reported lint are not end-to-end acceptance.
- Task1 remains with the same live Euclid handle. The new core selftests and result types are written;
  the transaction implementation is not yet ready for independent integration validation. Do not spawn
  a replacement based on elapsed time, missing exports, or wait timeouts.
- Parent [REPRODUCED] XML baseline: valid escaped attribute accepted; literal '<' attribute rejected;
  wrong root and wrong root casing still parse in the existing generic bundle owner. Creation must add
  exact XSD-shape checks without broadening the importer. Evidence:
  test-results/b119-canvas-first-batch2-parent-xml-baseline.log, exit0.
- Next continuation classified the preceding turn PROGRESS (UI implementation and review evidence).
  Parent independently ran the newly implemented Bundle selftest: PASS, exit0, evidence
  test-results/b119-canvas-first-batch2-parent-bundle-first.log. Workspace/UI integration remains pending.
- Parent [REPRODUCED] registration review: non-menu environment, nested wrapper/environment and foreign
  default namespace were accepted by the new helper; formatted insertion consumed the closing indent.
  Evidence: test-results/b119-canvas-first-batch2-parent-registration-review.log. Required correction is
  supported DOM registration topology plus source-local line-start insertion, not a parallel schema
  validator or importer rewrite. Preserve valid multiple direct environments and dependency/savedvariable
  metadata, namespace declarations such as xmlns:xsi, comments/CDATA and unrelated raw attributes.
- Review corrections are being incorporated: XML is the intentional changed existing record; shadow
  fixture uses one exact issued workspace; non-UI assets do not block first-menu creation; refusal
  assertions compare the original bundle rather than themselves. These are test-contract corrections,
  not permission to weaken source ownership or validation.
- No capability-map delta yet: a usable creation flow is not proved. No full goal, published/installed,
  mounted Forge or native X4 acceptance claim. Existing release0.0.78 remains untouched.
- AAR tools: oversized inspection output recurred; use bounded file slices, selected JSON fields and
  rg --max-columns for long embedded fixture lines. Lost output was re-read where needed; do not repeat
  full session metadata or combined long instruction dumps. This is a non-clean inspection checkpoint.
- Next: read the current goal attachment, check the two existing worker handles, then independently
  validate the finished core and UI together through the configured real corpus, source-edit owner,
  focused suites, TypeScript and exact lint.

## Machine-gate and first integration checkpoint

- Ken explicitly cleared the machine gate: "machine is quiet, you are free to start testing".
  Parent restored Antigravity and left x4 AiLive/source selection unchanged. Parent alone owns heavy
  isolated3200/3201 checks; no new install/reload/game/mod/save/config authority follows from testing.
- Parent creation with content.xml and notes accepted without mutating the input. Genuine-corpus
  projection then failed at transport: installed sidecar55835 returned ECONNREFUSED. Preserve the red
  log test-results/b119-canvas-first-batch2-parent-creation-first.log; cached host status is not live proof.
- UI worker finished and was closed: exact three-path lint/diff pass; mounted lifecycle14/20. Six
  positive adoption paths lack authoritative visible geometry/glyph, while rejection/supersession
  cases pass. Core worker remains active; parent is independently diagnosing canonical projection.
- AAR trigger: integration is red, not complete. Sustain visible-canvas assertions; do not weaken
  them to accept a successfully registered but invisible menu. No capability-map delta yet.

## Reconciled integration repair — SPECIFIED

- Actual Chromium first run: 2 passed, 3 failed, 0 flaky; structured verdict and lifecycle complete,
  treeGone=true. All14 monitored live configuration/state/discovery files unchanged;3200/3201 closed.
  Evidence: test-results/b119-canvas-first-batch2-parent-e2e-first-verdict.json and
  b119-canvas-first-batch2-testing-isolation-after.json. Screenshots viewport-failure.jpeg and
  creation-ui-failure.jpeg under the same batch2 prefix were visually inspected.
- [REPRODUCED] toolbar/header consume the available canvas height; opening Inspect intercepts PNG
  export clicks. Task2 must correct bounded editor sizing, not scroll/force-click away the failures.
- [REPRODUCED] App.setWorkspace always applies sanitizeWorkspace, which returns a new object even
  with zero structural changes. The new creation replacement therefore loses exact acknowledgement
  identity. Evidence: b119-canvas-first-batch2-parent-sanitizer-probe.log. The focused raw-React parent
  omitted this actual integration behavior. Do not relax exact source/acknowledgement identity guards.
- Graphify identifies sanitizeWorkspace as a68-connection shared owner. Leave that normalizer and all
  server/import callers unchanged. Extend the existing browser state-update boundary: always normalize,
  then retain the submitted object ONLY if a bounded exact full-value comparison proves normalization
  made no change. Otherwise use the normalized result. Reuse workspaceIdentity for this comparison;
  no abbreviated hash/field subset, permissive clone acknowledgement, skipped sanitation or new registry.
- Additional write scope, assigned only after core checkpoint: src/App.tsx and src/lib/workspaceIdentity.ts
  (including its existing selftest entry). Both were clean before assignment. SHA256 App:
  EC7D9370510240C18C6836DE9F89937788D4B91D4F4B6FA4F467B0C64EE80B79; workspaceIdentity:
  375651344E073F93E76F070476CA5DC56D3DFA82DEB80454C3916C9C00B9CB41.
- Guard comparison against cycles/accessors/non-data or non-plain objects and unsupported values;
  uncertainty must retain the sanitized result, not the candidate. Include exact metadata/array-order
  changes and invalid input/default insertion as negatives. Preserve every existing identity selftest.
- Acceptance: real App creation adopts its exact saved menu, title edits retain source selection,
  normalization corrections still take effect, forged/stale/crossed acknowledgements still refuse,
  and browser creation/edit/export remain visible/clickable with Inspect open and closed.
- Add focused normalizer-boundary checks, mounted lifecycle through the real normalization helper,
  final TypeScript/lint, continuous-polling regression, and the isolated SourceEditor E2E rerun.
  This required integration correction expands the original no-App scope; rollback is its exact named
  hunks. No release, game, config or history scope expansion. Non-clean AAR: test-parent mismatch.

## Parent testing close / AAR checkpoint — PARTIAL

- This parent testing unit made PROGRESS through actual browser interaction, viewed failure screenshots,
  isolated corpus projection, exact title splice and causal normalization diagnostics. The product unit
  remains PARTIAL; required browser journeys failed and both existing workers continue corrections.
- Actual results: SourceEditor E2E2/5 passed,0flaky; TypeScript failed at SourceEditor2179 union narrowing;
  genuine corpus-byte creation/title-edit probe passed (fixture manifest identity explicitly retained);
  old installed sidecar offline; ephemeral manifest idle. No fabricated canonical success or scan claim.
- Second registration probe confirms earlier fixes, but foreign environment namespace, unknown addon
  child and nested file remain falsely accepted. Naming probe accepts CON/aux/NUL/COM1/LPT9 ui paths;
  no materialization attempted. Logs parent-registration-review-second.log and parent-name-review.log
  under the batch2 prefix. Both findings sent to the same core worker, not duplicate workers.
- Baseline preservation: six protected older B119 source hashes and SourceEdits.ts still match;
  index remains empty;14/14 monitored live-state/config/discovery files unchanged;3200/3201 shut down.
  Nothing published, installed, committed, pushed, or written to real game/mod/save/config surfaces.
- No capability-map delta: usable creation/ordinary editing still await browser integration green.
  No ROADMAP verified close. The full nine journeys and old native fidelity obligations remain open.
- Sustain: genuine asset bytes, exact source/ack ownership, disjoint Luna ownership, source-local checks,
  actual host-shaped browser testing, preserved red artifacts, teardown and state-hash verification.
- Improve work: the reduced mounted parent omitted App's sanitizer; surface-only CSS tests omitted the
  real bounded editor. Add those exact seams to focused acceptance, while retaining actual E2E proof.
- Improve tools: two invalid inspection-path assumptions and oversized outputs recurred. Degradation
  call issued; checkpoint now and use fresh context. Discover exact paths first and read one bounded
  slice per tool result. No new procedural skill or Codex memory update is claimed.
- Highest evidenced weakness: an isolated selftest can prove ownership/geometry while the real host
  clones its commit and allocates zero canvas space. Bounded fix is the specified normalization seam,
  bounded full-editor layout regression, and actual creation/edit/export E2E rerun.
- Lessons recorded here in the project task record; no unauthorized global ledger mutation.

## Continuing integration review

- The revised literal scaffold exposed a new concrete mismatch: native-valid `Zekton bold` is not
  supported by current canonical preview metrics. The resulting unresolved automatic text height
  causes Scene to refuse malformed structure. This is not a misspelled font or a native-game failure.
  Evidence: parent-scaffold-diagnostic.log and parent-scaffold-structure.log under the batch2 prefix;
  parse only selected fields from the large latter artifact.
- Parent in-memory diagnostic variant using regular `Zekton` and frame x/y20 passes real-byte corpus
  projection at800x600, editable frame/table dimensions and text properties, exact title splice and
  stale refusal. Evidence: parent-scaffold-regular-variant.log. The core worker must apply and validate
  the bounded default change; the diagnostic mutation is not a shipped-code acceptance claim.
- Independent remaining recovery obligation: an unsupported font currently refuses the whole scene.
  Preserve this for the full goal's unsupported-region/known-geometry recovery work; do not silently
  weaken Scene authority or add a font renderer as part of this creation correction.
- Tool AAR: first local real-byte transport used octet-stream for Lua/XML and was correctly refused;
  corrected response MIME types to the existing loader contract. Manifest identity remains explicitly
  fixture-owned while actual corpus bytes/hashes are checked by the unchanged canonical loader.

- Parent now reran the actual updated creator (not the diagnostic variant): real-byte projection,
  editable properties, exact title splice and stale refusal PASS in parent-current-scaffold-green.log.
  Registration/Windows-name review14/14 PASS in parent-registration-names-green.log. Polling baseline
 44/44 PASS in parent-polling-baseline.log. All paths use the batch2 evidence prefix.
- Actual browser export-only journey now PASS1/1,0flaky, clean treeGone teardown and14/14 live hashes
  unchanged. Evidence: parent-export-e2e.log, parent-export-verdict.json and export-isolation-after.json.
  This is a selected journey, not the full suite, creation acceptance or a new native-host proof.
- Epicurus completed and was CLOSED after its three-file correction. Parent independently reran full
  SourceEditor: PASS20/20 creation lifecycle,19/19 color,2/2 bounded viewport and3/3 bitmap CSS, plus all
  older assertions; parent-ui-second.log. Normalization is now exercised by that mounted parent.
- Parent App/helper review: exact real creator identity retention and inline23/23 passed. The initial
  comparator revisited a tiny shared DAG exponentially (18objects/132ms); core worker added bounded
  traversal and completed-pair memoization. New4096visit cap then refused a real2930-node/109-file
  stored workspace that is unchanged by sanitization (63240uniqueobjects/362431keys). Both facts are
  reproduced, not hypothetical. Evidence: parent-identity-cost.log, parent-identity-representative.log
  and parent-identity-size.log. Worker is calibrating the bound against this representative scale;
  do not accept a helper that passes only small fixtures or remove safe fallback on excessive work.

- Core worker completed and was closed after calibrating64depth/100000object/500000key limits plus
  completed-pair memoization. Parent read-only representative workspace now retains exact identity in
  105ms; parent-identity-representative-green.log. Complete SourceEditor browser suite is rerunning.
- Evidence-recording reconciliation: run-e2e.mjs deletes its temporary JSON report after verdict, while
  creation screenshots/Lua/XML are currently body-only attachments. Resume Epicurus on ONLY the existing
  E2E spec to persist them to test.info().outputPath and attach by path. No assertion or product change;
  rerun the creation journey if the running suite already loaded the old artifact code. This completes
  the already-required durable evidence contract instead of depending on a temporary reporter file.

## Second browser integration result — PARTIAL

- SourceEditor full spec now3passed/2failed/0flaky, clean treeGone teardown; all14 live hashes unchanged.
  Creation itself now succeeds and opens the generated canvas. Both remaining tests fail AFTER a
  successful source edit: source/target selectors become blank, hierarchy disappears and old paint is stale.
  Parent viewed second-created-edit-stale.jpeg; second verdict and trace artifacts are retained under
  the batch2 evidence prefix. This improves first success but does not satisfy editing feedback yet.
- [REPRODUCED] sourceKeyFor includes the source SHA; reconcileX4UiEditorSelections accepts only an
  exact source key. A valid local edit changes the SHA, so stored selection no longer resolves. Existing
  transient reconciliation retention cannot repair that identity change by itself.
- Re-extend Epicurus to its original3files: record only exact acknowledged edit-transition intent;
  resolve unchanged file path and unique logical target kind/name from the NEW catalog, then select
  the fresh keys. Missing/ambiguous/crossed/stale transitions must not select or revive old paint.
  Add mounted edit-after-create/current-render cases using the real sanitizer boundary and retain all
  stale/workspace-switch tests. No source-owner or renderer weakening; no new history/parallel authority.
- Final TypeScript found test-only generic mismatches in workspaceIdentity327/335. Euclid is resumed
  on ONLY that file to correct typing without changing runtime behavior. Parent will rerun TypeScript
  and exact lint after both final patches. Core representative-size test remains green.
- Creation's default global addon/runtime naming is not yet workspace-namespaced. Record as an explicit
  pre-release/native integration risk, not a solved cross-mod compatibility claim; it remains required
  before new-menu publication/native deployment beyond this isolated authoring slice.

## Frozen source-edit reconciliation — acceptance correction

- [REPRODUCED] SourceEdits deep-freezes its accepted replacement. The normalization identity helper
  compared mutability/extensibility flags against the sanitizer's mutable clone, so even identical
  source-edit data lost the exact acknowledgement identity. Mutable creation-only tests missed this.
- Euclid was resumed on ONLY workspaceIdentity.ts, then closed. The sanitizer still always runs;
  comparison ignores only freeze-related flags, retaining actual keys, values, enumerability,
  prototype, accessor refusal, cycle and resource-budget checks. SourceEdits freezing is unchanged.
- Parent actual SourceEdit -> actual sanitizer -> identity helper now passes with frozenEdit:true,
  normalizedFrozen:false, deepDataEqual:true, retainedExactEdit:true. Source locality, unrelated assets
  and stale refusal also pass. Evidence: test-results/b119-canvas-first-batch2-parent-frozen-source-edit-green.log.
- Inline parent identity regressions34/34 pass, including deep-frozen edited data, changed content and
  metadata, accessor refusal, representative-size and resource-limit negatives. This corrects the
  acceptance fixture; it does not weaken exact acknowledgement or authorize accepting stale drafts.
- Fresh-eyes review also requires unnamed chunk targets in selection transfer: target kind plus optional
  name must uniquely resolve in the new catalog. A mandatory nonempty function name would miss the
  existing-menu browser fixture. Epicurus is correcting this before the third browser run.
- AAR trigger: tests modeled a mutable edit rather than SourceEdits' real immutable result. Sustain the
  real-byte projection and exact identity checks; improve coverage at actual cross-owner boundaries.
  Highest-risk observed weakness remains a green surrogate fixture masking a broken ordinary edit.

## Parent third-browser checkpoint — PARTIAL overall

- 2026-09-10T13:32:38Z: full SourceEditor spec5/5,0failed,0flaky, complete structured report,
  treeGone:true, ports3200/3201 closed, all14 live-state/config/discovery files unchanged. This is the
  five-test SourceEditor spec, NOT the repository's complete E2E suite.
- Created-menu and existing unnamed-menu edit journeys now save the exact literal splice, keep XML and
  unrelated assets unchanged, select fresh source/target keys and paint fresh pixels. Export and scale
  regressions also pass. Original first/second red artifacts remain preserved.
- Parent inspected created-menu.png and edited-menu.png and read edited-source.lua. Durable evidence:
  test-results/b119-canvas-first-batch2-e2e-third-artifacts/e2e/
  x4-ui-source-editor-Source-f33b5-its-its-title-on-the-canvas-chromium/ (join these path lines).
  Verdict: test-results/b119-canvas-first-batch2-parent-e2e-third-verdict.json;
  isolation: test-results/b119-canvas-first-batch2-third-e2e-isolation-after.json.
- Final parent SourceEditor selftest PASS32/32 transfer,20/20 creation, unnamed-chunk real Session /
  frozen sanitizer / flushSync regression, color19/19, viewport2/2, CSS3/3 and existing causal matrices.
  Final TypeScript PASS (parent-typecheck-fifth.log); final correction lint PASS; core lint's five App
  warnings match HEAD. Final UI test log: parent-ui-final.log under the batch2 evidence prefix.
- A new test-only omission (required corpus input) was corrected only in the UI selftest. Parent reran
  full TypeScript and SourceEditor after that correction. Product/E2E code did not change during the
  third browser run. Both native Luna workers are now CLOSED; no new worker or duplicate task.
- Final source hashes: test-results/b119-canvas-first-batch2-parent-final-source-hashes.json. All six
  protected pre-existing owner/test hashes and x4UiSourceEdits.ts remain unchanged. Index is empty;
  no commit, push, install, release, game/mod/save/config write. Graph refresh completed10915nodes /
  27497edges /331communities, code-only, exit0; parent-graph-final.log under the same prefix.

### Visual review and remaining acceptance

- [REPRODUCED] At1280x720 with the default2560x1440 profile, the530-wide new frame occupies only a small
  part of the already narrow canvas; its title is practically unreadable. After Apply, the menu stays
  current but element selection clears, leaving the inspector empty. The outer legacy widget library
  also remains visible and consumes width; its behavior/owner must be reconciled before integration.
- Browser assertions prove source integrity and changed pixels, not readable, continuous authoring.
  This unit remains PARTIAL against the product's early usable-slice requirement. Next bounded unit:
  preview-only fit menu / fit screen / zoom, correct transformed picking and unchanged PNG evidence,
  followed by exact acknowledged element-selection continuity. Do not change game resolution/font
  sizes or native paint to manufacture readability. Do not use fuzzy labels to carry edit authority.
- Contextual palette, structural changes/history, scenarios, save/export/reopen, actual imported menus,
  unsupported-font recovery, namespacing and packaged/native fidelity remain required. All nine full
  goal items and GitHub41 remain open; no full-goal completion or new native proof claimed.

### Close and AAR

- Status PARTIAL: deterministic/browser plumbing verified; usable visual acceptance remains incomplete.
- Suggested future commit title after applicable close gates: fix(ui): preserve canvas authoring across source commits.
  No commit performed while full unit acceptance/precommit remain open.
- Sustain: real bytes and real parent sanitizer/flushSync fixtures, final compiler plus runtime checks,
  durable screenshot/source files, independent browser review and live-state hash verification.
- Improve work: mutable tests missed frozen edits; named-only tests missed chunk menus; final compiler
  caught a missing test input. Model real owner boundaries and keep worker available through final tsc.
- Improve tools: preserve evidence by outputPath rather than temporary JSON body attachments. Parent
  invalid Windows glob queries/oversized reads triggered a degradation checkpoint; use observed exact
  paths and bounded output, with fresh context before the next implementation unit.
- Highest evidenced weakness: green pixel-change assertions can hide an unreadable editor. Next unit
  must evidence legible menu-sized zoom and continued selected-property editing in actual screenshots.
