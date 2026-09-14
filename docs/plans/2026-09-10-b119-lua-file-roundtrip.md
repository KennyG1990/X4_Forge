# B119 Lua file open/export implementation plan

Date: 2026-09-10 EDT / 2026-09-11 03:45Z
Lane: FULL. Status: PARTIAL / A source checkpoint reviewed; B static-reviewed; C test authoring active.
Full goal remains ACTIVE/PARTIAL; owner is existing B119 issue41.
For Agent: use planning/brainstorming when context is missing. Astra owns design, review and acceptance;
native GPT-5.6 Luna/max implements bounded code/tests. No duplicate source, renderer or history owner.

## PLAN / approved intent

Goal: a modder can open a real Lua menu, visually edit it, export exact accepted Lua, and reopen it.
This executes goal items6/7 and the original brief's explicit two-way *.lua workflow. It does not
replace full-project save/import, dependency packaging, three-menu/twelve-reference or native proof.
The source-first canvas plan already authorizes this direction; ordinary implementation details need
no further permission. Material product/authority changes still require the user.

Three approaches reconciled:
- Native project inventory alone reuses open/materialize but assumes an installed host and configured
  Mod Workspace; it does not open a user-selected loose Lua file onto the canvas.
- A complete project/archive flow preserves dependencies but belongs to existing SyncModal/ReleaseCenter
  and artifact owners. It does not replace the brief's direct Lua-file workflow.
- SELECTED: Open Lua and Export Lua beside New menu, over existing WorkspaceSource/SourceBundle and
  UIBuilder/App acknowledgement/history. Keep project import/export available through current owners.
  No new archive format, compiler, parser, endpoint, native-host message protocol or dependency.

Open Lua uses an explicit local file picker. Preserve exact valid UTF-8 (BOM, CRLF, comments, Unicode)
and never execute the imported code. Register one contained ui/**/*.lua path using the existing byte-local
ui.xml insertion. Do not overwrite a collision, repair locked registration silently, change a sibling,
rewrite Lua, or silently migrate legacy generated widgets. A collision explains how to select the existing
file or choose another name. Valid runtime-dependent/unsupported Lua may open with existing honest gaps;
malformed input refuses without mutation. Multiple discovered targets require a clear menu choice.

Export Lua exports the selected whole source file, not a reconstructed layout or a complete mod. Reuse
the canonical source projection and existing lintX4UiCallModel result. Known error-severity rules block
export (including literal addTable(24)); warnings/gaps remain explicit and are not game acceptance.
Opening a parseable file with a known lint error remains possible for repair. Keep Not verified in game.
Do not call a browser download request a verified disk save; actual downloaded/reopened bytes must prove it.
Existing App scoped cache/server sync remains workspace persistence, not a new Save implementation.

## BASELINE / rollback

- HEADmain93c9af111d63ca77c99dee11f21882c4073bcda6; unrelated dirty/deleted/untracked work preserved.
- Inert six-file baseline directory:
  F:/DEV_ENV/X4_Forge/test-results/b119-lua-file-roundtrip-baseline-20260911T0345Z/.
- WorkspaceSource.ts72D69CACF90A2F6BB8468B3A38C725D7683755C3D202C7CA29A9A10A137F7878;
  selftestF01CAA9BC8F7F700195772D1C653A49624EBE484C1CAFF060675F24196E2FB74.
- SourceEditorE822FB63, test3AB48AC4, UIBuilder189DB721, E2E8F71D085 snapshots also retained;
  each copy verified before/copy/after. Existing row/history/browser receipts stay historical checkpoints.
- Parent baseline WorkspaceSource selftestPASS0 and SourceBundle selftestPASS0. Logs:
  test-results/b119-lua-file-roundtrip-baseline-x4UiWorkspaceSource.log and -x4UiSourceBundle.log.
- Rollback is exact task-owned delta against inert snapshots after review, never broad checkout/reset.

## RECONCILE / authority and boundaries

- Read original FORGE-UI-EDITOR-BRIEF.md and approved canvas-first contract. Read ADR-F1/F2/F4/F5:
  immutable scoped workspace CAS, first success, source/artifact separation. Relevant capability-map
  B100 native authoring, B109 release and B119 visual contract entries reviewed. No ADR contradiction.
- Graph exact nativeEditor.ts node shows NativeProjectFiles/ReleaseCenter/App consumers and native
  open/materialize/diff owners. Exact modCompiler.ts node shows existing consumers. Broad vocabulary
  query [materialize,native,project,source] over-weighted source test nodes and was weak navigation.
- NativeProjectFiles/nativeEditor own inventory, native open, explicit validated materialization/diff.
  Materialization can write Mod Workspace. SyncModal owns round-trip preview and mod-folder import.
  ReleaseCenter exports prepared, hash-verified artifacts; not ordinary loose Lua save.
- server.ts buildWorkspaceFileManifest and /api/agent/compile own manifest/full validation. Existing
  Compile UI enters deploy-verify; do not use it as harmless Save. No route has been executed here.
- Search boundary src/lib/x4Ui*.ts, current SourceEditor/UIBuilder/App, nativeEditor, NativeProjectFiles,
  SyncModal, modCompiler and named server routes found no direct selected Lua-file open/export control.
- Reuse createX4UiWorkspaceMenu registration/passthrough/CAS/projection machinery, factoring only shared
  internals needed for import. Reuse addX4UiSourceBundleRegistration unchanged. Existing new-menu public
  API/descriptor/behavior must remain intact. Do not copy its entire transaction into a parallel owner.
- Current server import uses4MiB per UI text file and6MiB aggregate inline allowance (server.ts7639-7641).
  New local file boundary uses explicit matching4MiB file/6MiB inline limits, measured as UTF-8 bytes;
  reject before parsing/allocation where possible, not silent truncation. Export/import caps and transport
  checks are visible, tested and centralized for the new controls. This is not a disk-packaging limit.
- No capability-map delta yet; this is SPECIFIED. Old recall hit is a June typing/audit assessment,
  not evidence that this Lua workflow already works.

## Acceptance / negative paths / risk

1. Pure import of generated and real-shape supplied Lua yields one registered source, exact text and
   byte-local ui.xml delta; all siblings, record metadata and other workspace fields preserved.
2. Existing New menu behavior remains unchanged. Import/export operate only on the exact issued
   workspace/source pair with current passthrough and compile inputs; copied/forged/stale/mutated inputs
   refuse. No history or mutation on export/refusal. Accepted import uses existing single history owner.
3. Pure export yields exact currently authoritative whole-file UTF-8 text with existing lint findings;
   fatal24-column source refuses export, warnings/dynamic gaps remain truthful. Never export shadowed,
   missing, omitted, ambiguous or stale source. No alternate source format.
4. File boundary rejects invalid UTF-8/lone surrogates, binary/NUL, wrong extension, invalid/unsafe paths,
   Windows device names, traversal/absolute paths, collisions including case/slash aliases, and exceeded
   file/aggregate limits. Source owner rechecks its applicable boundaries, not UI-only guarding.
5. UI remains canvas-first. Open/export controls respect staged edits and pending commits; user can
   apply/discard explicitly. Late file reads, superseded workspace/source/selection, cancellation,
   double actions, refusal, read failures and unmount never overwrite state or produce false success.
6. Import selects only fresh issued source/target after exact parent acknowledgement/readback, not a
   guessed operation ID; single-target menu opens, multiple/absent targets get honest actionable UI.
   Export selection must still match the current source at handoff. Download status never asserts disk
   completion without proof. Ordinary operation does not require Lua/source offsets/compiler jargon.
7. Actual browser journey: visually create/edit -> download Lua -> verify exact file bytes -> open into
   eligible fresh workspace -> compare structure and native RGBA at same profile -> edit -> undo/redo.
   Also reopen a saved workspace via existing persistence. Preserve all11 prior E2E tests and assertions.
8. Real menu import/visual edit/export preserves unrelated source, no fake dynamic geometry. Complete
   project dependencies and full native fidelity remain separate required acceptance, not waived.

Risk: imported file is untrusted; never eval/load it. Source collision/async stale actions can destroy
user work if guards fail. Downloads can be requested without reaching disk; report stage truth. Existing
source/artifact/live-workspace limits remain. No new network/spend/delete/credential/permission service.
Local file read is user-selected and bounded; output is only explicit user-requested download. Runtime
tests use scratch fixtures; real mod/game/save/config/install changes keep paragraph-and-go gates.

## Batches / exact ownership

### A — existing source owner (first dispatch, source-only)

Files owned ONLY:
- F:/DEV_ENV/X4_Forge/src/lib/x4UiWorkspaceSource.ts
- F:/DEV_ENV/X4_Forge/src/lib/x4UiWorkspaceSource.selftest.ts
- bounded test-results/b119-lua-file-roundtrip-source-worker-* logs

Step1: add failing tests for import/export accepted preservation and named negative matrix.
Step2: extend existing source owner with importX4UiWorkspaceLua(workspace,source,{path,text}) and
exportX4UiWorkspaceLua(workspace,source,path), typed accepted/refused results and public input limits.
Import accepted result returns fresh workspace/source plus imported file path; it must not pretend every
imported menu has targetName menu.createFrame. Export returns selected path/text and existing lint result.
Reuse/factor current registration transaction and identity guards; do not modify the source bundle,
renderer, parser, linter, App/history, UI, server, harness or global configs in this batch.
Step3: run owner and SourceBundle regressions, project-option target types, strict exact lint, whitespace;
report exact hashes and logs. Parent independently reviews/reruns at freeze before UI consumes APIs.
Main independent work during Luna coding: reconcile current UI file-picker/readback/selection seams and
write the exact B acceptance integration amendment. Do not duplicate source implementation.

### B — ordinary file controls (after A interface is reviewed; separate dispatch)

Likely owned files: F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx and .selftest.tsx.
UIBuilder.tsx only if reconciliation proves an existing callback cannot be reused; amend before write.
No App/history-owner change expected. Byte-preserving File.arrayBuffer/TextDecoder with fatal UTF-8 and
ignoreBOM true, caps checked before reading and after encoding; derive contained default ui/<filename>.
Use existing submit/classify acknowledgement and history, mounted/live-ref guards, existing source/target
selectors and ordinary compact controls. Exact implementation seams/negative tests must be recorded
before this worker starts. No source owner overlap with A.

### C — actual acceptance (after source/UI frozen and machine confirmation)

Existing F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts receives a dedicated end-to-end file
journey with genuine downloads/uploads; actual bytes, full workspaces, hierarchy, current native RGBA,
source locality and screenshots recorded. No ready-made hidden source/history/pixel injection.
Existing serial3200/3201 harness, workers1, new14-file live baseline/teardown; preserve all earlier tests.
Full E2E/precommit/build/package/installed/native obligations remain; no acceptance from --list alone.

## Commands / evidence / close rules

Bundled Node: C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe.
From F:/DEV_ENV/X4_Forge: node --import tsx src/lib/x4UiWorkspaceSource.selftest.ts;
node --import tsx src/lib/x4UiSourceBundle.selftest.ts; target types use current tsconfig options;
node node_modules/eslint/bin/eslint.js <exact owned paths> --max-warnings=0; git diff --check exact paths.
After UI: SourceEditor selftest, source-edit/history regressions, full-project tsc; actual browser via
X4_FORGE_E2E_WEB_PORT=3200 X4_FORGE_E2E_API_PORT=3201 npm run test:e2e -- tests/e2e/x4-ui-source-editor.spec.ts.
Use correct PowerShell env syntax. No heavy browser/desktop run until fresh machine answer.
CORRECTION 2026-09-11: SourceEditor selftest itself includes unconditional headless Chromium layout
fixtures. Further full invocations are also held pending explicit clearance; no skip flag, extracted
suite or removed browser assertion is authorized. Type/lint and bounded code review may continue.
Evidence prefix:test-results/b119-lua-file-roundtrip-*; append every acceptance result, scope change,
review correction and AAR here. Static/implemented/rendered/installed/native statuses stay separate.
No commit/push/release/issue mutation in the development checkpoint. Future title:
feat(ui): add source-preserving Lua file open and export.

## AAR at specification

Non-clean: one rg command used an unexpanded Windows wildcard; corrected to rg -g before making any
absence claim. Broad graph query was weak and replaced by exact known-owner nodes. Sustain source/artifact
separation and observed-path discovery. No new product failure reproduced. Highest evidenced risk remains
claiming authored/static work as usable file round-trip; actual interface/download/native proof is required.
No Codex memory or external wiki changes.

## Batch A dispatch and parent UI reconciliation — 03:49Z

- Lovelace01a08e93-de90-79a2-8b79-6d7119179bbe, native gpt-5.6-luna/max, is the sole worker.
  Turn01a08e93-dfef-7460-b837-ca437b116b81 confirmed active by wait_threads; no code acceptance yet.
  Owns only WorkspaceSource.ts/selftest plus bounded source-worker logs. No other worker, overlap,
  browser/service launch or protected write. Source pair remained at the baseline hashes at last check.
- Parent local byte-transport preflightPASS0: BOM+CRLF+Unicode and LF text survive decode/encode exactly;
  invalid UTF-8 throws with TextDecoder(fatal:true,ignoreBOM:true). This is Node runtime evidence only,
  NOT browser file-picker/download or product proof. Exact log:
  test-results/b119-lua-file-roundtrip-parent-transport-preflight.log.
- UI ownership is now concrete: SourceEditor owns projection.source, selection.candidates/source,
  workspaceScope, visibleSourceEditStaged/Receipt, selectSource and targetSelector. New-menu control
  is mounted at the ordinary header and already uses submitX4UiSourceEditWorkspaceCommit plus exact
  acknowledgement/readback. UIBuilder/App remain the sole commit/history bridge, unchanged for B.

### B integration amendment — SPECIFIED, not dispatched until A review

- Keep code/test ownership inside SourceEditor.tsx and SourceEditor.selftest.tsx; no App/UIBuilder change
  currently needed. Add a compact file-controls component in the same module beside New menu. Its props
  carry actual workspace/scope/source, selected source path, current candidates, shared edit callback,
  current staged/pending state, and the existing source/target selection callback.
- Import starts with exactly one explicit .lua File. File.size check precedes arrayBuffer(); decode fatal
  UTF-8 with BOM retained, compare encoded bytes/length, then call the A owner with contained default
  ui/<filename>. Refuse unsafe/wrong-extension names rather than silently renaming user code/dependencies.
  Collision feedback must not overwrite: explain choosing the existing source or another filename.
- Capture exact workspace, immutable scope, source authority, selected-menu intent and attempt token when
  file reading starts. Mounted/live refs must invalidate on unmount, new attempt, switched workspace or
  intervening source edit. Check again after read and before commit. A cancelled/late/failed file read
  never invokes the writer or mutates history. Clear file-input value to allow retry of the same file.
- Apply/Discard stays the existing source-edit owner. Block starting file actions for current staged
  changes or a pending source commit, with a readable explanation. The handler must recheck live state;
  a disabled DOM button alone is insufficient. Never silently discard a property draft.
- Install the exact import attempt before calling the parent, as New menu already does. Use existing
  submission/acknowledgement classifiers; wait for both accepted receipt and exact current workspace
  readback. No guessed IDs or success from one signal alone. On success select the uniquely reissued
  source path; select the sole target if exactly one exists. Multiple targets prompt Menu selection;
  no target reports that the file opened but no supported menu was found. Do not say the import failed
  after it actually committed just because preview is unavailable. Reject crossed/late receipts and
  avoid overriding a later deliberate menu selection. Reuse existing selector reset behavior.
- Export asks the A owner for exact current selected Lua and lint findings; no stage/apply or history
  mutation. Build a Blob from exact UTF-8 bytes, not platform-normalized newlines or regenerated Lua.
  Use bounded object-URL/anchor creation, cleanup on failure, and current-owner/selection checks at host
  handoff. There is no need to refactor PNG export's independent paint authority for this feature.
  Status: download requested; final file save unverified. Explain Lua-only/dependencies not included.
  Error severity blocks with existing finding/recovery; warnings/gaps stay readable and do not masquerade
  as game acceptance. Keep all diagnostics accessible via Inspect without requiring it for normal use.
- Tests: actual Session/New-menu source fixture, successful exact import with complete workspace equality,
  delayed and synchronous parent ack/readback orderings, rejection/crossed acknowledgements, intervening
  edit/workspace switch/unmount/double action, File read failure, wrong extension/UTF-8/BOM/cap checks,
  collision, staged/pending blocks plus direct-handler negatives, sole/multiple/absent targets, exact
  exported Blob bytes, fatal24 refusal, URL/download failure cleanup, no fake disk-save claim, and no
  history mutation for export/refusal. Preserve previous test fixtures/assertions and PNG behavior.
- The A API shape must be read from the frozen implementation before B coding. This amendment describes
  consumers and behavior, not fabricated final type names. Actual B/C proof remains missing.

This continuation is PROGRESS (bounded source-owner baseline evidence, reconciled specified file journey,
actual dispatched worker, and independent byte-transport evidence). Machine gate only blocks browser,
not the safe source work. Full goal remains ACTIVE/PARTIAL; no blocked/complete goal update applies.

## Parent continuation review and real-source baseline — 2026-09-11 04:05Z

- Previous status turn was a VERIFIED WAIT: the same Lovelace handle was authoritatively active, with
  no accepted implementation. This continuation produced new test-review feedback and real-source
  baseline evidence. Lovelace remains the sole source writer; no replacement or UI worker was started.
- Initial source-test delta was reviewed, not accepted as final. Parent requested complete passthrough
  and exact ui.xml byte-local assertions, BOM/CRLF import-to-export equality, same-object in-place
  passthrough/compile-input mutation negatives, export authority negatives, exact/multibyte file and
  aggregate boundaries, and a valid nested path. Initial array identity assertion also needs deep equality.
  Retained fail-first log: test-results/b119-lua-file-roundtrip-source-worker-fail-first.log.
  It fails on the not-yet-exported public constant; this is expected test-first evidence, not an app defect.
- Independent read-only preflight PASS0 at04:05Z on the configured MENU/HUB/COMM source bytes, matching
  the current strict Scene census hashes: MENU8390F0B0/90060bytes, HUB657476EA/42000bytes,
  COMM5526B6F9/27617bytes. Fatal UTF-8 decode plus retained BOM re-encodes byte-exactly. Existing
  CallModel/Lint parses all three with zero error findings; all retain warnings and not-statically-verified
  status (173/189/161 verification gaps respectively). Source hashes match again after the read-only probe.
  Log: test-results/b119-lua-file-roundtrip-parent-real-source-preflight.log. This establishes suitable
  real inputs for the later source-owner/UI round-trip, NOT successful import/export or visual/game proof.
- B test integration checked against actual mounted fixtures: New-menu regression owns accepted/refused,
  synchronous/delayed ack/readback, stale workspace and shared-history patterns. The local MountedDomElement
  has no files property and its canvas is deliberately a no-op. Extend only the file-event test surface as
  needed, use genuine Blob byte reads for transport assertions, restore all overridden globals, and never
  count mounted canvas output as actual pixels. Browser upload/download and native RGBA remain required.
- No real mod/game/config/install/network/Git writes. Full goal and this file unit remain PARTIAL/SPECIFIED
  pending accepted implementation. No capability-map delta. AAR: sustain reviewing exact-byte preservation
  before wiring consumers; initial count-only registration assertion was weaker than its acceptance claim.
  Highest evidenced risk remains mistaking source/headless checks for the complete authoring experience.

### Parent acceptance amendment — shared New-menu caller regression

The existing graph's reverse callers of createX4UiWorkspaceMenu include SourceEditor, SourceEdits tests,
workspaceUndoHistory tests and, transitively, UIBuilder/App. Evidence: graphify affected completed0;
test-results/b119-lua-file-roundtrip-parent-registration-impact.log. The graph is the prior frozen row
checkpoint, not a claim to contain the in-flight new APIs. Do not rebuild while the source writer is active.
Because A factors this existing transaction, parent acceptance before B now also runs SourceEdits,
workspaceUndoHistory and mounted SourceEditor selftests against the frozen A pair, with before/after
dependency hashes. This strengthens the original owner/SourceBundle/type/lint checks without expanding
implementation ownership or claiming real browser pixels. Log prefix remains b119-lua-file-roundtrip-parent-.
The review skill's reviewctl command, .reviewctl/rules.yaml and referenced BlastRadius script are absent;
that scan is unavailable, not passed. Existing graph, manual exact-diff review and deterministic repo checks
are the available replacement. AAR non-clean: acceptance expanded from observed shared-helper callers.

## Independent API observations and required corrections — 2026-09-11 04:17Z

- Parent observational real-source API probe PASS0 at04:15Z on source66157604, with five dependency
  hashes stable during the run. All exact MENU/HUB/COMM files sequentially import/export and reopen
  into fresh in-memory workspaces with exact UTF-8 bytes. Complete workspace equality uses independent
  expected records and literal ui.xml insertion, not the registration helper as its expected output.
  Sibling binary/text metadata and existing Lua remain exact; real source files are unchanged.
  Log:test-results/b119-lua-file-roundtrip-parent-real-api-observation.log. Pre-freeze observation only;
  rerun against final accepted source. No UI/download/disk/native acceptance.
- [REPRODUCED] source66157604 accepts and exports four Windows-reserved paths: ui/COM¹.lua,
  ui/LPT².lua, ui/nested/com³.lua and ui/COM¹/safe.lua. Parent pure in-memory negative probe exit1,
  four unexpected acceptances, stable owner hash, no real path writes. Log:
  test-results/b119-lua-file-roundtrip-parent-device-names-negative.log. Existing declared device-name
  rejection requires repair and regression coverage before A can be accepted. Microsoft documents the
  superscript¹²³ variants as reserved in every directory, also with extensions:
  https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file.
- Parent review also rejected mapping every SourceBundle resulting-source-invalid to malformed-lua.
  The upstream reason includes thrown rebuilds and registration/count/resolution mismatches as well as
  parse failure. Preserve a generic honest reason unless the existing parser supplies specific evidence.
- Four initial worker post-implementation failures are retained as explicitly tool-output-only excerpts,
  not original redirected runs. Parent read all four: NUL-device test-name collision, wrong aggregate
  assertion target, malformed-Lua refusal mapping and generated-shadow fixture expectation. Worker now
  reports focused source PASS; parent final frozen checks remain outstanding. Do not overwrite failures.
- AAR non-clean: independent negative found a real acceptance defect; broad upstream error mapping
  overstated diagnostic certainty. Direct web open timed out; official Microsoft search result supplied
  the rule. Same Luna owns both corrections. No new source/UI/helper owner or external state mutation.

## Batch A parent source checkpoint — 2026-09-11 04:34Z

- Lovelace COMPLETED and CLOSED. Frozen source1AC890618947ACAC2B0B150E308F6312F88AF61526EDA02F043DB14E201FAD91;
  testFC04BF466EBA665B7D9B86C6DA80A526CA7486E282C61F1D05307A6F95368A80. Inert before/copy/after-equal
  snapshots are in test-results/b119-lua-file-roundtrip-source-parent-reviewed-20260911T0434Z/.
- Parent reviewed the full baseline-relative source and test diffs plus final increments. New-menu's
  public signature, descriptor and refusal wording remain intact over the shared registration transaction.
  Generic resulting-source-invalid is deliberately retained without a fabricated parser diagnosis.
  Empty source export now returns source-unavailable; aggregate export and Unicode-byte boundaries are tested.
- Parent independent results, all terminal: WorkspaceSource selftest0; SourceBundle selftest0;
  SourceEdits156/156exit0; workspaceUndoHistory selftest0; SourceEditor selftest0 including Newmenu25/25,
  both UIBuilder title/row history journeys and callback/Discard12/12; whole-project tsc --noEmit0;
  exact-two-file ESLint --max-warnings 0 passed; tracked whitespace0. Logs under
  test-results/b119-lua-file-roundtrip-parent-{workspace-source,source-bundle,source-edits,history,
  source-editor,types,lint,whitespace}.log. Sixteen named source/UI/history/dependency hashes were identical
  before/after the parent checks and match the worker's final pair. Baseline-relative diff-checks return1
  for the expected differences, with only LF/CRLF notices and no whitespace errors; not mislabeled exit0.
- The shared-caller tests began against the current candidate while the worker finished read-only checks;
  their sixteen hashes remained unchanged and match the final frozen pair. This evidence is accepted at
  that exact pair, not generalized to later changes. All later source edits require renewed checks.
- Frozen real-API rerunPASS0 at04:33Z: three exact configured MENU/HUB/COMM files import/export/reopen
  byte-exactly, with complete independent expected workspace and literal XML insertion comparisons.
  Seven reserved device variants refuse import and existing-source export. Ordinary Unicode and COM10
  filenames remain accepted and preserve BOM/CRLF/Unicode text. Source pair and real files unchanged.
  Log:test-results/b119-lua-file-roundtrip-parent-frozen-real-api.log. This supersedes earlier
  observational source-hash probes for source-only acceptance; it does not prove browser file transfer.
- [REPRODUCED] superscript device-name admission is corrected and independently green, following the
  Microsoft filename rule linked above. Five worker tool-output-only failure excerpts remain marked as
  such; the fifth was a PowerShell hash-log pipe syntax error, not a product failure. The original
  fail-first and negative logs remain. No false-success or acceptance criterion was waived.
- Graph update completed0 after worker closure:11293nodes/28514edges/345communities/463files.
  graph.json and GRAPH_REPORT.md refreshed; HTML was skipped by the existing5000-node guard and is not
  current evidence. Log:test-results/b119-lua-file-roundtrip-parent-graph-update.log.
- Product status remains PARTIAL: visible file controls, browser file picker/download/reopen, saved-workspace
  reopen, real imported-menu editing, full E2E/precommit/package/native and broader fidelity remain required.
  Source APIs are ready for B; there is no user-facing capability-map close, Git, issue or release change.
- AAR: sustain independent literal XML/full-workspace byte oracles and real-input tests. Improve: verify
  platform path rules before freezing guards; preserve umbrella errors instead of guessing their causes;
  redirect validation output at execution time. Highest evidenced weakness was a path guard recognizing
  only ASCII device suffixes; the bounded repair and independent regression now pass. One parent close
  patch missed its exact context and made no changes; current text was reread before the successful retry.
  No Codex memory or external wiki write. Future title: feat(ui): add source-preserving Lua file open and
  export. Source checkpoint only; no commit or full product completion is claimed.

## Batch B dispatched after source review — 2026-09-11

ONE fresh native GPT-5.6 Luna/max worker: Nash01a08ec4-8ce4-7d62-9837-51e131257cf1.
Owns only SourceEditor.tsx/selftest.tsx and bounded ui-worker logs; no descendants. Baselines E822FB63
and3AB48AC4 verified immediately before dispatch. Full B integration amendment and exact frozen APIs
were supplied; SourceBundle/WorkspaceSource/UIBuilder/App/history/E2E and protected state stay outside
ownership. Source receipt JSON/snapshots and all16 input hashes were verified before dispatch.
Parent non-overlap work is actual browser file-journey preparation and read-only failed-gate evidence,
not duplicate UI implementation. B UI behavior is not yet accepted, C is not dispatched, and actual
browser/machine clearance remains unanswered. Full goal remains ACTIVE/PARTIAL.

## Parent C reconciliation and prior browser evidence — 2026-09-11

Status: C implementation-ready specification, NOT dispatched or browser-verified. B remains Nash's
exclusive UI/test ownership until freeze and independent review. No implementation scope is added to B.

### Existing owners and one important assertion boundary

- Graph explain of persistWorkspaceCache() locates src/lib/localWorkspaceCache.ts:17 and its extracted
  App.tsx import. Nested App callbacks persistScopedWorkspaceSnapshot/restoreParkedWorkspace are absent
  from graph labels; those two no-match queries are not absence claims about code. Direct App reads
  locate the callbacks at1611/2231, the switcher at2627, and createWorkspace at2330. Reuse them unchanged.
- App persists the complete scoped body before its paired version, preserves failed caches, serializes
  dirty sync, and checks immutable ID/version/content/snapshot hashes when restoring a parked workspace.
  This inspection is architecture evidence, NOT proof that saving/reopening the new menu works.
- tests/e2e/ephemeral.ts readServerWorkspace() binds its reads to the cached fixtureWorkspaceId(), not
  whichever independent workspace the UI later selects. Do not use it to assert the post-switch workspace.
  tests/e2e/workspace-isolation.spec.ts:15-25 supplies the existing READ-ONLY pattern: getWorkspaceId()
  from __X4_WORKSPACE_CONTEXT__, then page.evaluate fetch('/api/agent/workspace') through normal addressing.
  Reuse that pattern locally in the source-editor spec; verify response workspaceId equals selected ID.
  Do NOT copy that older test's setWorkspace or localStorage draft injection into this authoring journey.
- Actual workspace switching already uses workspace-switcher -> __new -> dialog-input/dialog-ok, and
  workspace:<immutable ID> -> confirmation -> restore-parked. No new persistence/helper/endpoint owner.
- The installed Playwright types document real Download.saveAs/suggestedFilename/failure and
  locator.setInputFiles. Use the actual downloaded disk file as the reopen input, not a reconstructed
  buffer containing the expected source. Save only inside the unique test output directory.
- Frozen E2E8F71D085 and source1AC89061/testFC04BF46 rechecked unchanged. Baseline snapshots already
  exist in the0345Z directory; capture fresh B/current dependency hashes before implementation/validation.

### C exact implementation contract after B freeze

Own ONLY F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts plus bounded
test-results/b119-lua-file-roundtrip-browser-worker-* logs. Preserve all11 existing tests, their complete
assertions, and existing pure oracle selfchecks. No production/UI/source/history/harness/config edits.
Read frozen B's actual accessible names/test IDs before writing locators; do not invent the UI contract.

1. First add read-only selected-workspace/envelope helpers and a test-local observation recorder. Record
   selected immutable IDs, complete local/server workspace snapshots, actual source bytes, hierarchy,
   native canvas dimensions/RGBA signature, profile controls and screenshots at meaningful checkpoints.
   No source, history, pixel, response, cache-version or acknowledgement injection. Existing fixture
   seeding is allowed only for the initial isolated empty workspace and unrelated preservation records.
2. Through actual New menu/Add widget/property controls, create and edit a small menu. Wait for current
   rendering and exact server synchronization; capture whole workspace, selected source, hierarchy and
   native RGBA. Use existing literal-delta oracles to prove unrelated source/workspace preservation.
3. Export using B's actual button; await the genuine download, check suggested contained basename and
   failure()===null, saveAs a unique test-output path, then read and compare disk bytes with the exact
   current Lua. Assert export did not alter workspace/history and UI never claims verified disk/game save.
4. Reload the same page WITHOUT re-seeding or rewriting scoped cache. Reopen the UI-designer surface and
   select the saved source/menu through actual selectors if needed. Require same immutable workspace ID,
   exact complete local/server workspace and Lua, same hierarchy and native RGBA at identical profile.
   This is the saved-workspace reopen checkpoint, distinct from loose Lua transport.
5. Create an independent empty workspace THROUGH the existing switcher/dialog. Verify a different
   immutable ID and absence of the authored Lua, and capture its complete baseline. Open the ACTUAL
   downloaded file via B's file picker/input, then require authentic product adoption and current canvas.
   Expected import workspace must be independently constructed from this new baseline, exact downloaded
   bytes and literal ui.xml registration; do not call the implementation owner to generate expectations.
   Compare complete workspace, canonical source, semantic hierarchy and native RGBA to the exported menu
   at the same selected resolution/user scale/scenario. Persist source/download/screenshot observations.
6. Visually edit reopened text; prove exactly one literal delta, immediate changed native pixels, and
   unchanged unrelated files/metadata. Undo and redo through actual controls; require full workspace/Lua
   and native RGBA restoration. Download again and verify the new exact bytes. Export/refusal adds no
   history entry. Import is owned by App's existing history, not a parallel test/product history.
7. Exercise same-file collision through the actual input and staged-edit export blocking with visible
   Apply/Discard recovery. Assert no overwrite, extra history or download. If B's semantics prevent a
   required recovery, report a concrete acceptance failure rather than weakening tests or bypassing UI.
8. Through workspace switcher/confirmation, reopen the original saved workspace and prove its ID, whole
   source/workspace and appearance are unchanged by editing the independent import. Read current-scoped
   server data, never the fixed original-fixture reader as a surrogate for the active workspace.

Use the existing test timeout conventions as the initial budget. Do not add fixed sleeps, retries,
timeout inflation, console filters or easier source/pixel expectations to force acceptance. If the
coherent journey exceeds the established budget, preserve the failed evidence and bring the measured
dependency to parent review before changing applicability. Keep request diagnostics read-only and
sanitized (method/URL/failure/time; no headers/credentials); all console/page errors remain unfiltered.

Pre-browser checks: whole-project tsc; strict exact-spec ESLint; tracked and baseline-relative whitespace;
Playwright --list discovery with all11 prior tests and the new journey; preserve/selftest independent
literal/full-workspace oracles with a sibling mutation, byte normalization and wrong-workspace negative.
Discovery proves only that the test is authored/loadable. Parent independently reviews full delta and
reruns checks on stable hashes. Actual run stays serial3200/3201/workers1 with a fresh14-file live-state
baseline and teardown proof. Full E2E/precommit/package/installed/native/fidelity obligations stay open.

### Prior failed-gate diagnosis, without a waiver

Read-only ZIP inspection of the fifth run's2-trace.network finds227 resource snapshots and exactly one
recorded failed resource: GET http://127.0.0.1:3200/api/agent/workspaces at2026-09-10T20:07:32.405Z,
trace status-1, net::ERR_NO_BUFFER_SPACE, duration5.013ms. Six other workspace-list requests in the same
trace returned200, including one2.558s later. The test reached its final unfiltered console assertion
after its layout/scale assertions. Structured verdict remains FAIL9passed/1flaky; retry is not acceptance.
Evidence:test-results/b119-lua-file-roundtrip-parent-prior-browser-trace.json, with original trace/verdict
paths. [REPRODUCED] recorded request/console failure. Underlying network/OS cause remains UNPROVEN; no
polling, transport, timeout or test policy change is justified by this trace alone. The next journey must
attach failed-request details so a recurrence is attributable without reopening a large ZIP manually.

### Close / AAR for this parent preparation checkpoint

Full goal remains ACTIVE/PARTIAL. C specified, not implemented; B worker remains authoritatively live.
No capability-map delta, Git/release/issue/external-wiki/Codex-memory/protected-state mutation.
Progress: exact historical failure isolated and preserved; C now uses actual selected-workspace authority
and genuine downloaded bytes, removing an identified false-proof path before test implementation.
AAR non-clean: large combined inspection output was truncated and one rg call again used a literal
Windows wildcard. Corrected to bounded reads and rg -g; no absence or code acceptance was based on the
failed calls. Degradation called explicitly; finish this parent unit at a durable checkpoint, retain the
same live worker rather than restart it. Sustain separate source/browser/native proof and scoped readers.
Highest-risk evidenced weakness: a fixed-fixture reader could accidentally validate the wrong workspace
after a UI switch. This C specification requires independent selected-ID/envelope checks. The older
reader is still valid for its original single-workspace tests and is not changed here.

Validation readback04:55:25Z: independent JSON-to-original-ZIP resource count/failed URL/method/status/
failure/time comparison and original structured-verdict comparisonPASS0 (227 resources,1failure,
original FAIL9passed/1flaky). This validates the derived historical evidence, not a new product run.
Same Nash authoritative poll remains ACTIVE/inProgress at cursor:5. First SSR test-first failure log
now exists and opens with missing x4-ui-lua-files markup assertion; no UI implementation accepted.
The raw log includes a huge one-line markup dump; even a first-lines read overflowed the output budget.
Use filtered bounded strings in subsequent review. Handoff and backlog updated for this checkpoint.

## Batch B early test review — 2026-09-11 05:03Z

Same Nash remains ACTIVE/inProgress (authoritative cursor:7); three bounded native waits timed out
without a terminal result. Timeouts are not worker failure. No duplicate/descendant/C writer started.
Parent reviewed the initial baseline-relative imports/SSR/file-input test support, then the new mounted
roundtrip and guard tests as they landed. Production implementation is still in flight; no tests are
claimed green against this candidate and no final UI review/freeze has occurred.

Three specific coverage gaps were sent to the SAME worker (submission01a08ed7-2b72-7d10-a3fd-5929ae28ddcb):
1. Both initial roundtrip variants deliver readback before acknowledgement. Add genuinely ack-first,
   and prove neither signal alone adopts selection or reports opened.
2. Exact imported text plus a changed whole-workspace serialization is weaker than preservation.
   Assert a completely independent expected workspace and exact byte-local ui.xml insertion.
3. Clicking a disabled Export button can be suppressed by React before its callback runs. Exercise the
   actual retained/direct callback (existing mountedReactClickCallback at the mounted fixture seam) to
   prove live staged/pending/identity rechecks, rather than calling disabled-click behavior that proof.
These enforce the existing B acceptance matrix; they are not additional scope or confirmed product bugs.
SourceEditor stageSourceEdit is called directly by property onChange, so the existing staged map is the
correct live draft boundary. No new draft/history owner is needed.

Nash confirmed intended accessible seam: Open Lua.../x4-ui-lua-open, single-file input
x4-ui-lua-file-input with label Select one Lua file to open, Export Lua/x4-ui-lua-export and live
status/Inspect. This is a worker contract report, not proof of completed rendered controls. C still
awaits B freeze/review. Whole-project tsconfig includes tests, so concurrent C edits would also change
B's required whole-project typecheck input; maintain the existing sequential validation boundary.

AAR non-clean: the first baseline diff used a guessed encoded snapshot filename and failed to access it.
rg --files found actual basenames (X4UiSourceEditor.tsx.snapshot and X4UiSourceEditor.selftest.tsx.snapshot)
inside the0345Z directory; corrected no-index diff returned1 for differences and was read successfully.
Recall hit an older June graph-setup conversation, not direct Lua import/export evidence; no current
capability claim was drawn from it. Its large response was truncated; no need to reconstruct it for B.
Sustain actionable early oracle review and keeping live workers intact. Highest evidenced risk is test
coverage implying stronger state-preservation/async safety than it actually exercises. Corrections are
pending in the existing worker; full goal and B remain PARTIAL. No capability-map/Git/release/native close.

## Batch B independent file-input defect and correction — 2026-09-11 05:11Z

- Parent read the full initial production-control delta (+595 lines plus imports, later header wiring)
  and new mounted test increments. This is in-flight review, not a final freeze or B acceptance.
- [REPRODUCED, source-handler fixture] handleFileChange reset input.value before reading input.files.
  The HTML Standard's filename value setter empties selected files when assigned the empty string:
  https://html.spec.whatwg.org/multipage/input.html#dom-input-value-filename (rule read directly).
  The local MountedDomElement value field did not model that behavior and could hide the real defect.
- Parent independently extracted the ACTUAL current handler prefix through File capture with the
  TypeScript AST and executed it against a standard-consistent reset setter. Stable component
  DEBAC501B715BEFDA5FB0D216B8B042048EF96817894F14A91676EB28E555800 at05:08:05.817Z loses the
  selected File and reports cancelled; negative expectation fails with exit1. Preserved exact evidence:
  test-results/b119-lua-file-roundtrip-parent-file-reset-negative.log. This executes source code with a
  semantic fixture; it is NOT a real-browser/file-picker test or complete component acceptance.
- Nash corrected the order to capture Array.from(input.files) before clearing the input and strengthened
  the mounted file-reset fixture. The SAME independent capture oracle passes exit0 at05:10:48.984Z on
  stable component5FB95CCC2E4381D9BC48757FF3B8808B92BA748984B8A9CF33BBCD8C8AF6C92D: the input
  selection is emptied, the original selected File reference survives, and no cancellation is published.
  Evidence:test-results/b119-lua-file-roundtrip-parent-file-reset-rerun.log. Keep both red and green.
  Re-run at final B hashes if that prefix changes; a later component edit is not automatically covered.
- Parent rejected the first attempted preservation oracle because it used addX4UiSourceBundleRegistration
  itself to generate expected XML. Latest candidate now builds original/expected CRLF XML literally and
  independently compares the complete workspace. Review its final test result; no pass inferred here.
- Additional in-flight review: pending readback initially checked replacement workspace identity without
  checking scope. The candidate now checks scope both during readback and settlement and adds a
  scope-crossed mounted scenario. Its test has not yet been independently run. The unproven claim that
  an intervening source draft was kept was removed; file controls do not own that upstream draft state.
- Worker implementation-pass1.log is a FAILED mounted run at its expected-registration assertion, not
  a green "pass1" checkpoint. Its first-lines excerpt was read with per-line clipping. The typecheck-pass1
  file header alone is not an observed terminal pass. Preserve actual terminal exits in the final report.
- At latest poll cursor:10, Nash remains ACTIVE/inProgress, markerexec-b7d99d44-c751-4e80-bf63-dfd6f1418e9b
  completed. Only B owns UI files; source1AC89061/testFC04BF46 and E2E8F71D085 hashes rechecked unchanged.
  Full original B lifecycle/negative matrix, frozen parent selftests/types/lint and actual C remain open.
- AAR non-clean: real input semantics were missing from a synthetic DOM fixture; independent normative
  source review plus a separate source-code probe exposed and verified the bounded correction. A guessed
  x4UiLinter.ts path failed; rg --files/import inspection correctly located x4UiLint.ts. No absence claim
  used the failed path. Sustain independent XML/full-workspace oracles and truthful proof boundaries.
  Highest evidenced weakness: a permissive test double can let an ordinary file-open blocker pass.
  Its scoped countermeasure is now source-probe green; browser transfer proof remains required.
  No memory/skill/wiki changes or game/mod/config/install/Git/issue/release mutation.

## Validation-boundary correction and continued B review — 2026-09-11

- Previous user-status turn was a VERIFIED WAIT: compact polling confirmed the existing Nash handle
  active, not complete or missing. The percentage estimate was a status judgment, not new acceptance.
- [REPRODUCED, source inspection] SourceEditor.selftest.tsx unconditionally invokes
  runX4UiCanvasSurfaceLayoutSelftest(), which calls chromium.launch({headless:true}) and page.setContent
  on isolated SSR/CSS fixtures, closing its browser in finally. The current moving file locates the
  launch at10939 and unconditional invocation at11106. No existing skip/only gate was found. These
  fixtures are layout/synthetic-paint tests, not live Forge authoring or canonical-menu pixel proof.
- Earlier authorization named this selftest while describing allowed work as browser-free. That
  description was inaccurate, including the parent A shared-caller check. Preserve actual command
  results, but do not describe them as no-browser runs or transfer them to actual-app acceptance.
- Parent interrupt01a08eed-b365-7580-8ffc-2661c4069df2 explicitly stopped further full selftest launches.
  Same Nash acknowledged it: last owned session99690 had already terminated exit0; nothing owned was
  left to stop. This session/cleanup statement is worker-reported, not an independent child-process
  census. No broad Chromium/process termination was attempted. No replacement worker was started.
- Current in-progress B may finish code/tests and pure types/lint. Full SourceEditor selftest, B final
  behavioral acceptance and C actual E2E remain required but held pending explicit fresh clearance.
  Do not add a skip flag, extract a runnable substitute or silently alter validation applicability.
- Earlier test-attempt corrections remain honest: independent expected root XML preserves absent bytes
  metadata; crossed-scope rejection copy need not avoid the word confirmation; invalid UTF-8 needs
  actionable normal-view text. Do not count log names containing pass as successful outcomes.
- Observed worker terminal typecheck-pass4 exit0 and exact-pair lint-pass2 exit0; these are not final
  frozen checks because B tests are still being extended. Failed typecheck-pass2 and lint-pass1 logs
  remain. Source1AC89061/testFC04BF46 and E2E8F71D085 remain unchanged at this review checkpoint.
- AAR non-clean: a named selftest's browser side effect was not reconciled with the machine boundary.
  Sustain explicit stop/owned-session handling and preserve every required assertion. Improve command
  classification using actual entrypoint/callee inspection before granting no-browser execution.
  Highest evidenced risk is a test command crossing a stated operational boundary invisibly. The
  bounded countermeasure is a documented hold and explicit clearance, not weaker validation.
  No capability-map delta, Git/issue/release/protected-state or Codex-memory/external-wiki mutation.
  Full goal remains ACTIVE/PARTIAL; safe B review is still available, so no blocked-goal claim applies.

### Parent B in-flight review checkpoint — 2026-09-11 05:36Z

- Full current production delta and the new mounted roundtrip/guard/async/selection/input/export
  matrices reviewed, not frozen or behaviorally accepted. Existing source and E2E frozen hashes remain
  1AC89061/FC04BF46 and8F71D085. Same Nash is ACTIVE at cursor:16, no descendant/C writer.
- Source-inspection finding: the selection/ack test constructed a new sanitized workspace but reused
  the old integration source authority. The exact-pair guard would refuse before its intended parent
  boundary. Worker now projects the precise fixture workspace; keep parent-call/selection expectations.
- Production review corrections now present: one-target import status does not claim automatic selection
  when later deliberate selection prevented it or selection callback threw; Export is visibly disabled
  during import reading/pending; multiple-file recovery explicitly requests exactly one Lua file.
  Candidate source99334D7D/test60B1CF6E inspected. New tests are authored, not run after the browser hold.
- Parent static AST comparisonPASS0 at05:36:37.440Z on stable selftest4e1bdc95: all47 baseline top-level
  function declarations retained,6 new functions, only the expected main runner changed by new calls.
  No imported module, selftest suite or browser executed. This verifies function preservation, not
  semantic test coverage. Exact artifact:test-results/b119-lua-file-roundtrip-parent-test-function-preservation.log.
- AAR non-clean: two combined inspection reads overflowed output budgets; relevant missing plan/code
  sections were reread in bounded chunks. A docs patch had an incorrect final context and made no changes;
  retried using verified current text. Parent degradation/checkpoint called; do not launch another large
  review unit from this partial observation. No acceptance derived from truncated output or log filenames.
- Next: same worker final freeze/report, independent final diff and stable pure types/lint. Required
  full SourceEditor selftest and actual C journey remain held pending explicit machine clearance.
  No capability-map delta, release/Git/issue/native/protected-state change. Full goal ACTIVE/PARTIAL.

## C authoring readiness amendment — 2026-09-11, SPECIFIED

Previous goal continuation made PROGRESS: B source/test corrections and explicit browser-boundary
records changed authoritative state. The browser-clearance question is still unanswered, but safe
test authoring remains available; that is not a global impasse or a reason to waive runtime validation.

Sequencing clarification: after Nash completes/closes, parent reviews the complete final B delta and
obtains stable independent type/lint/whitespace results. That permits C TEST AUTHORING ONLY against
the frozen visible control contract while B's full browser-bearing selftest is held. It does not mean
B behavior is accepted. This is a non-clean plan change from requiring complete B acceptance before
C work, justified by the separate machine gate and the goal's requirement to continue independent work.

C retains the complete eight-step contract above: genuine downloaded disk bytes, saved-workspace
reload, UI-created independent workspace/import/edit/history and original-workspace restoration,
selected-ID/envelope authority, exact complete source/workspace, hierarchy and native RGBA. Preserve
all11 old tests. No production/harness/source/renderer/history/config changes. The test must also retain
screenshots after import/export status messages so toolbar growth cannot pass unnoticed as usable UI.

Only tests/e2e/x4-ui-source-editor.spec.ts, the narrowly scoped B assertion follow-up below, and bounded
browser-worker logs may be assigned to ONE new native Luna after B writer closure. Pure types/lint/diff
and proven non-launching test discovery are
allowed; no actual browser, server, E2E execution, build/package, install or native/game/protected writes.
Parent must inspect discovery's module/setup behavior before granting that command. No skip/extraction
workaround for SourceEditor.selftest.tsx. The full B selftest must run before C actual E2E once cleared.

Acceptance unchanged: neither authored tests nor green static checks prove file transfer, persisted
reopen, real visual editing or native fidelity. Runtime failures return to the appropriate existing
owner with preserved evidence. Full goal remains ACTIVE/PARTIAL; no capability-map or release close.

### B final static review and narrow test follow-up — 2026-09-11 05:50Z

Nash COMPLETED/CLOSED at source99334D7D2CF7CF131E808CDE74C0C839A0FA3D6F89FD7897992E9858F25D3621
and selftest593127F14C11585369BABFC3CF6B4E9CE800A75E371F5E7A38C118F8A80449E8. Parent full-delta
review plus all final increments is complete. Independent whole-project tsc0, exact-pair strict lint0
and tracked whitespace0; all17 recorded dependency hashes unchanged before/after. Logs:
test-results/b119-lua-file-roundtrip-parent-ui-{types,lint,whitespace}-20260911T0548Z.log.
Typecheck began while the worker prepared its read-only report; before/after inputs match its final
hashes. This proves the checked candidate, not future C edits. No browser or selftest module executed.

Final review keeps B PARTIAL: its current behavioral matrices are held/unrun. Two authored assertions
also need strengthening, not an oracle waiver. The next single test worker may edit ONLY the new Lua
file-control sections in src/components/X4UiSourceEditor.selftest.tsx for these corrections:
1. During deferred import reading and parent-ack pending states, count actual URL/download handoffs and
   anchor clicks, invoke retained/direct Export callbacks, and require zero handoffs plus disabled DOM.
   parentCalls===0 proves no workspace write, not no download. Restore every hook in finally.
2. Parent refusal/forged/crossed/rejected-ack cases must assert actionable refusal and usable controls
   after settlement, not merely absence of Opened. Test a subsequent valid attempt where applicable,
   using exact owner-issued source/ack/readback, without altering the old workspace or adding spurious
   history/download effects. Keep no-false-success and all existing exact-byte/full-workspace assertions.

No new test framework or production change is authorized. This small dependency-specific test edit and
the C real-file journey share one sequential test writer; all old test functions/calls stay intact.
The worker must report these added checks as AUTHORED/UNRUN until explicit browser clearance.

Discovery preflight: actual installed Playwright runner/index.js6491-6514 makes listMode load/report
tasks only; global setup, web-server setup and execution tasks are in the other branch. Current config
only resolves ports/read-only corpus paths at import time. ephemeral.ts has no top-level API request;
existing spec's immediate source-oracle selfchecks use in-memory strings. The exact allowed discovery
command is bundled Node node_modules/playwright/cli.js test tests/e2e/x4-ui-source-editor.spec.ts
--list --reporter=list, with process-local3200/3201 env. No run-e2e.mjs, full selftest or browser workaround.

AAR non-clean: a guessed x4UiWorkspaceEdit.ts path did not exist; actual import/symbol discovery located
the acknowledgement owner in SourceEditor.tsx. No absence/behavior claim used the failed lookup.
Highest current evidenced test weakness is mistaking no workspace call for no download, or no success
message for recovery. The bounded assertion follow-up addresses those exact gaps. Full B and goal PARTIAL.

### C dispatched / durable checkpoint — 2026-09-11 05:56Z

ONE native Luna/max Franklin01a08f07-d809-7d90-909a-c92aa84ae3bd, fork_context:false, no descendants.
Turn01a08f07-d9d2-7003-833b-1ba7188fea53 confirmed ACTIVE at cursor387b40b1-4a0a-4c74-b0a6-47a13fe2fd25:1;
worker acknowledged exact two-test-file ownership and no-browser hold. No overlap: Nash already CLOSED.
Parent non-overlap work was snapshot/receipt verification, retained failure-log reconciliation, and current
ownership handoff. Static receipt:test-results/b119-lua-file-roundtrip-ui-static-reviewed-20260911T0550Z/receipt.json.
Three inert snapshots read back/hash-equal;17 stable inputs recorded; PARTIAL scope verified. Production B
99334D7D and A1AC89061/FC04BF46 unchanged after dispatch. No new actual UI/browser acceptance.

Retained worker diagnostics reread: typecheck-pass1 block-local result escaping its scope; pass2 wrong
flush callback wrapping; pass5 candidate/target key fields absent; pass6/7 preview candidate raw absent;
lint-pass1 control regex/empty alias/effect dependency. Final parent static checks supersede these for
the frozen candidate; old failures remain. One parent read-only census used an invalid foreach-to-pipe
PowerShell form, failed before reading/writing, then passed after assigning the loop output to a variable.
This is another non-clean tool AAR; no source or validation acceptance was based on the failed command.
Sustain bounded evidence and explicit cleanup; current highest-risk test gaps are assigned, not waived.
Handoff overwritten for Franklin, backlog reconciled. Full goal ACTIVE/PARTIAL, no capability-map delta,
no Git/issue/release/installed/native/protected-state/Codex-memory/external-wiki mutation.

## Parent real-menu readiness observation — 2026-09-11, SPECIFIED

- FULL-lane diagnostic within goal journeys7/8, not a new feature or a substitute for C browser proof.
  Determine what the existing public Session -> BuilderPresentation -> SourceEdits pipeline exposes
  for all targets in the genuine aic_menu.lua, aic_hub.lua and aic_comm.lua files, with no invented
  samples, branch choices or loop data. Do not equate selectable nodes with editable properties.
- Reuse the existing canonical corpus loader and normal platform SHA-256 against actual bytes from
  F:/Downskies/x4unpackersuiteV1/X4 unpacked 9.00. An explicit in-memory read-only transport supplies
  local status/manifest descriptors and those genuine bytes; it does NOT validate the live corpus API.
  No synthetic asset/hash override, no imported Lua execution, no held selftest extraction.
- Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6; existing dirty work preserved. Franklin owns
  only the two tests already assigned. Parent may create a diagnostic output under test-results and
  amend repository records; no product/test implementation or real-mod/corpus/config/browser writes.
- Required observation: core/color loader issuance, per-file exact bytes/hash, candidate target names,
  per-target program/scene/presentation availability, renderability, selectable nodes, editable scalar
  entries mapped to nodes, locked reasons and unresolved-input counts where exposed. Snapshot relevant
  public-module and real input hashes before/after. Missing prerequisites remain explicit evidence.
- Negative: absent corpus must not manufacture valid geometry; one corrupted in-memory pinned asset
  must be refused by the unmodified hash verifier. Neither negative changes disk bytes.
- Acceptance: diagnostic completes or records an exact refusal; all disk input hashes stable; public
  authorities only. Output: test-results/b119-real-menu-readiness-parent-*.log. Actual-interface,
  packaged-host and native fidelity remain unverified by this observation. No capability-map delta
  is asserted before results. No rollback needed for read-only input access; discard only the explicitly
  created diagnostic artifact if necessary. Do not mutate standing records outside this workspace.

### Readiness observation close and C in-flight review — 2026-09-11 06:16Z

Observation status VERIFIED within its explicitly read-only scope; product journeys7/8 remain PARTIAL.
Parent bundled Node --import tsx --input-type=module inline diagnostic (no selftest imports) completed
exit0 at06:13:31.043Z, owned session49658 terminal. Evidence:
test-results/b119-real-menu-readiness-parent-20260911T0615Z.log
SHA2568EF301A9199CACB356D75FFBCE12F01D8DE31DFBC527F29C0C458C26AA436474.
The filename is an artifact label; the log's actual timestamps govern chronology.

- Core and color authorities issued from8 genuine pinned corpus assets with unmodified platform hashes.
  All26 recorded input hashes (15 public modules,8 assets,3 real files) stable before/after; in-memory
  imported workspaces unchanged. No real files, browser, API service or protected state were mutated.
- All76 source targets observed: menu26, hub28, comm22. There are ZERO builder-mapped editable nodes
  across them with the declared1920x1080/uiScale1/default-input profile. There are2 scalar entries in
  hub.notBuilt (scaleY arguments4 and8), but no hierarchy nodes for that target; they are NOT visual edits.
- Main displays: menu.display158 hierarchy nodes, hub.display5, comm.display6; each has1 selectable/
  geometric node and0 mapped editable properties. Sample catalog entry counts57/11/2, path46/4/25,
  loop1/2/0 respectively. These are catalog counts, not a claim that a user must fill every entry.
- [REPRODUCED, public-pipeline diagnostic] each main display's source-edit catalog is locked with
  operation-not-applied. SourceEdits1688-1691/7057-7061 requires EVERY operation applied before scalar
  discovery. Actual source also reads Helper.viewWidth/viewHeight and runtime menu data. Both facts
  need reconciliation before a repair; this does not prove bypassing the safety prerequisite is safe.
- Negative checks: corrupted in-memory Helper bytes refused with hash-mismatch; absent corpus produced
  no geometry and canRender:false for all76 targets. No hash override, invented preview samples, native
  pixel proof, downloaded-file journey, live-corpus-API proof or Lua execution is claimed.
- Next real-menu unit after current C: reuse existing preview/scenario and source authority to establish
  a source-grounded main-display scenario, then distinguish genuinely dependent regions from independent
  literal-edit candidates. Preserve CAS, provenance, unrelated bytes and unknown-geometry honesty.
  Do not lower the all-operations gate without a separate safety contract and negative tests.
- No new capability claimed. Negative readiness evidence is banked here/BACKLOG; external capability map,
  issue, AAR/wiki and memory records are not written outside this checkpoint's authorization.

Franklin remains the same live two-test-file writer. Parent in-flight review found instrumentation in
the wrong adjacent test function and deletion of the old reentrant Export callback; worker acknowledged
and corrected both. Parent also required a detached pre-attempt workspace snapshot (same-object JSON
comparison was circular) and the literal visible retry instruction rather than a permissive noun regex.
Current B follow-up candidate B5588B0A includes these corrections; it is not a final whole-C acceptance.
Full component/browser behavior remains AUTHORED/UNRUN pending machine clearance.

AAR non-clean: review forced test corrections. Sustain separate no-download and no-workspace-write
oracles, exact authentic ack/readback and genuine corpus bytes. Improve approach: do not infer visual
authoring readiness from successful import/export APIs or canRender alone. Improve tools: a repeated
literal Windows wildcard lookup failed; use rg -g/known exact paths. Oversized inspection outputs were
followed by bounded field summaries; no claim relies on omitted content. Highest-risk observed weakness:
all three real main displays are currently non-editable in the declared default scenario despite
partial preview acceptance. The next bounded scenario/edit-authority investigation addresses this gap,
not more fixture-only polish. Parent takes a durable checkpoint after these inspection errors.

Final checkpoint: Franklin explicitly froze SourceEditor.selftest.tsx at
B5588B0AB9E6202BC24A40549284597265A535052BD3770E1F40400001F5CB1C and continues C E2E only.
Parent strict ESLint of that file --max-warnings0 completed exit0, session47178 terminal, same SHA256
before/after. Log:test-results/b119-lua-file-roundtrip-parent-b-followup-lint-20260911T0616Z.log.
No current whole-project typecheck or behavior pass is claimed for this increment. Repository-record
whitespace check passed. A shortened status cursor caused cursorReset:true; authoritative returned
cursor387b40b1-4a0a-4c74-b0a6-47a13fe2fd25:8 confirms SAME worker ACTIVE, not a restart/terminal event.
Parent degradation checkpoint announced. Full goal ACTIVE/PARTIAL; no commit or release close.

## Viewport-only real-menu scenario observation — 2026-09-11, SPECIFIED

Read-only continuation of the76-target diagnostic; previous turn made PROGRESS. Existing Session sample
owner (update/apply draft + exact catalog authority/binding) is the only allowed source of preview input.
Observe ONLY menu.display/hub.display/comm.display at1920x1080/uiScale1. Where the current catalog points
to the exact source expression Helper.viewWidth or1920 / Helper.viewHeight or1080, supply the existing
canonical profile's pinned viewWidth/viewHeight as an explicitly preview-only scenario. If a matching
expression is absent, report that; do not fabricate a sample or substitute another runtime expression.

No branch, loop, menu/game/bridge data, geometry, hash or source-edit-safety injection. Reuse genuine
corpus transport from the prior observation; do not execute Lua or the held selftests. Record exact
selected expressions, source spans and values, the applied sample result, main program operation-status
counts, missing inputs, hierarchy/geometry/editable counts before/after, and unchanged disk/workspace
hashes. Negative: the same authentic sample update with a nonfinite numeric value must be refused.

Acceptance is a completed public-API observation, not browser/installed/native proof or an automatic
sample-setting feature. Evidence:test-results/b119-real-menu-viewport-scenario-parent-*.log. Product
source/test implementation remains Luna-owned and outside this diagnostic; no overlap with Franklin.
The result determines whether viewport setup alone helps or deeper layout/source authority work remains.

### Viewport observation result and bounded sidecar — 2026-09-11 06:29Z

Both pure public-API observations completed exit0; sessions21464/13139 terminal. Evidence:
- test-results/b119-real-menu-viewport-scenario-parent-20260911T0625Z.log
  SHA2560DD0D3E70EFD297DF74D0EF6A8E66D7714E59FD96654669981DD9B00CCF63F8A.
- test-results/b119-real-menu-viewport-consumption-parent-20260911T0628Z.log (binding/frame detail follow-up).
Each retained26 stable input hashes and unchanged imported workspace. Source-grounded vw/vh samples
were accepted AND CONSUMED for MENU/HUB: the frame width/height facts are1920/1080 with preview-sample
provenance. Nonfinite inputs were refused twice with nonfinite-number. COMM has no matching viewport
fallback sample entries; no substitute was invented. This is not a broken sample-control/cache diagnosis.

Despite consumed viewport inputs, hierarchy/geometry/editability counts did not improve. MENU operations
remain29applied/10unresolved/56conditional; HUB5applied/11unresolved/3conditional; COMM baseline
12applied/2unresolved/2conditional. Existing gaps point to downstream table geometry, local values,
runtime/branch inputs, and the all-operations edit prerequisite. Product remains PARTIAL.

SPECIFIED sidecar: ONE additional native Luna/max, READ-ONLY, no descendants, may trace the first HUB
title-table geometry dependency through CallModel -> LayoutProgram -> Session from the exact genuine
source and these logs. Determine why consumed vw/vh does not establish x/my/w, whether closed numeric
expression evidence exists, and identify the smallest correct source-grounded extension/negative tests.
Do not bypass global edit safety, invent a sample scenario, implement a patch, execute Lua or any
selftest/browser/service, rebuild graph, mutate config/Git/docs/test files, or write outside the repo.
Allowed: bounded read-only inspections and pure public-API/AST diagnostics, stdout only. Return exact
source locations, observed versus inferred causes, existing owners to reuse, and proposed acceptance
scope. Parent owns the design decision; this sidecar is not authorized to implement it.

This is independent of Franklin's browser-file-journey test writing because the sidecar has NO write set
and will not run whole-project tests. Parent's immediate work is C diff/oracle review, not duplicating the
sidecar trace. At most2 workers active. Dispatching-parallel-agents skill used for this separation.

### C review / two-worker checkpoint — 2026-09-11 06:36:31 UTC

Ohm01a08f28-ca1b-7093-9325-4073eccd4de4 dispatched native Luna/max, no descendants and NO write set.
Confirmed ACTIVE at cursorc332f726-d791-4616-bb44-12f958ffbeba:3. Parent will review/close its result,
not treat its narration as acceptance. Franklin remains sole writer, Bselftest frozenB5588B0A and C
in-flightF94280DBB6CA2BC38E80F41632E6325C8BC653F91C3BA2B4B9B8229F7B227600 at latest hash read.

Parent C findings: the new setup copied response-route substitutions, contrary to this C contract.
Worker removed all3 NEW health-card/status/manifest routes while preserving old tests/fixtures. Positive
profile observations now require5 nonempty controls. Initial fixture asserted canvas-column count0
while expecting the SourceEditor selectors; SourceEditor6136 renders that persistent column regardless
of empty source. Worker acknowledged and is correcting to column present/native canvas absent/empty
selection. This is a test-contract correction, not permission to change production or weaken product UX.

Parent AST preservation proof (no spec/module execution): all38 old non-import top-level declarations,
oracles, test bodies and parameterized fixture loop retained exactly;8 direct cases plus3 fixture cases
equals the prior11. All53 old B selftest function names retained, with only the2 assigned matrices changed.
PASS0 at06:32:01.242Z with stable C5DA3499A/BselftestB5588B0A/product99334D7D before/after; later C edits
are not covered. Evidence:test-results/b119-lua-file-roundtrip-parent-c-preservation-rerun-20260911T0632Z.log.
Original ...parent-c-preservation-20260911T0630Z.log remains red: parent checker wrongly expected11
direct AST test statements; it saw8 and omitted the existing3-case parameterized loop. Correction verifies
the complete original loop and fixture array, not a reduced test count or altered suite.

Viewport binding-detail artifact SHA2562565DE03859F85D5E2D6FB4DADC60C28ABB0C5E173D019F483B1B16588B47733.
Frames1920/1080 and both bindings CONSUMED are positive evidence; hierarchy counts alone had not proved
consumption. Do not repeat that hypothesis. Both viewport runs retained all26 input hashes and source
bytes. No code capability or live API/browser/native claim added.

AAR non-clean: C review corrected test-contract violations; parent static checker missed parameterized
declarations, and literal Windows wildcard lookups repeated despite the recorded hazard. Sustain:
complete old-statement preservation, independent actual byte/authority observations, disjoint read-only
sidecar. Improve: use exact known paths or rg -g, smaller output projections, and distinguish declared
tests from expanded cases. Highest-risk evidenced weakness remains real-menu downstream geometry and
whole-program edit readiness; scoped sidecar assigned. Parent checkpoint/degradation call made. No
external memory/wiki/issue/Git/config/game/mod/install writes. Full goal ACTIVE/PARTIAL.

### C complete-journey review corrections — 2026-09-11 06:46Z

Previous user-status turn was a VERIFIED WAIT/status inspection: both exact worker handles were
authoritatively active, but no new product acceptance was established. Current continuation read the
unchanged full goal. B production99334D7D and follow-up selftestB5588B0A remain hash-stable; C is moving
and is NOT frozen or accepted. Parent reviewed the complete newly appended journey, not just helpers.

Required C corrections sent to Franklin (test-only; actual browser behavior remains unrun):
1. Export's pre/post workspace checks closed over the original ID even after switching. Pass the
   expected selected ID explicitly and exercise a wrong-ID negative through the same comparison seam.
2. The downloaded file was saved under a prefixed basename, changing the filename received on import.
   Keep the exact suggestedFilename inside a unique per-download output directory; upload that same file.
3. Download counts were manually incremented only by expected exports. Observe every actual page
   download event independently, then associate intended saves with those event objects.
4. Cross-reopen hierarchy equality included transient selected state. Compare semantic label/id/level
   structure across reopen and independently check selection where required; reselect the actual text
   widget before the staged-edit test after history/source-target transitions.
5. Undo was expected to reproduce importedHistory exactly, incorrectly omitting the new Redo entry.
   Assert independent Undo/Redo counts and control enablement through import/edit/undo/redo.
6. Switch-back confirmation expected the original ID as the current workspace. App2642 reports the
   independent workspace being left; verify that real UI contract without changing production.
7. Array.map(boundedText) supplied array indices as truncation limits, erasing the first error. Use an
   explicit one-argument callback for all error assertion/artifact mapping.
8. capture read hierarchy/native pixels before awaiting rendered/current, and history transitions
   captured before their fresh-canvas assertion. Observe only after current rendering; for mutations,
   retain the previous handle and assert the fresh canvas before recording pixels, using the existing
   row-move test's pattern. No sleeps, timeout inflation, pixel injection, or weakened comparisons.

These are source-grounded test-contract findings, not reproduced browser failures or new product defects.
The first seven were dispatched before the current continuation; finding8 was dispatched in this turn.
Required negatives also include sibling-workspace mutation and byte normalization through the same
actual comparison helpers. Preserve all11 prior cases. Worker must freeze and report exact hashes plus
allowed static/list-only results before parent independent reruns. No new production authority granted.

Ohm remains the separate read-only HUB dependency investigator; parent has not duplicated that trace.
Full SourceEditor selftest, actual browser/E2E, services/build, packaged/native/protected-state work remain
held for the existing unanswered machine-clearance question. No capability-map delta or release close.
AAR is non-clean: review found false-positive/false-negative evidence paths. Sustain independent whole-
workspace, disk-byte and pixel observations; improve observation timing and event accounting. Current
highest-risk test weakness is accepting stale or self-counted observations as end-to-end proof; the
bounded corrections above address it without manufacturing a product pass. Full goal ACTIVE/PARTIAL.

### HUB sidecar review and continuation checkpoint — 2026-09-11 06:50Z

Ohm01a08f28-ca1b-7093-9325-4073eccd4de4 completed and was closed promptly. No file writes or Lua,
browser, service, native or test execution reported. Its exact command/output history was inspected;
the stdout-only diagnostic had a PowerShell quoting retry. No worker narration promoted to a UI pass.

Parent independently read genuine HUB653-680, current CallModel1440-1465 and LayoutProgram2785-2823 /
2981-3039. Parent parsed the existing06:28Z artifact by label=viewport-result AND value.target=hub.display,
not the worker's initially empty filter. The row timestamp is06:26:57.525Z; operation counts remain
5applied/11unresolved/3conditional, and its exact alias-root rejection is present. The graph's exact
numericExpressionError node shows resolveNumber as caller (EXTRACTED); broad expanded query was noisy,
so the source/log are the actual diagnostic authority. Graph was not rebuilt or written.

[REPRODUCED, public pipeline + source] first title-table x rejection mechanism:
- HUB659/660 define vw/vh;664 defines mx;671 defines x=mx;674 uses x in addTable.
- CallModel retains the numeric descriptor rooted at664 while valueAtUse records the later identifier.
- numericExpressionError only accepts the immediate alias whose expression and location equal the
  retained descriptor root, then applies reassignment guards. The x binding does not meet that root test.
- CORRECTION07:00Z: parent had called this a nonfallback rejection before sample lookup, but the exact
  error string is NUMERIC_EXPRESSION_PREVIEW_FALLBACK_ERROR. resolveNumber tries eligible direct exact-
  source samples before returning this descriptor error. x's transitive binding remains unresolved;
  admitting arbitrary samples or bypassing descriptor guards is not an authorized remedy.

The smallest candidate direction is to extend existing exact numeric alias provenance transitively,
retaining source order/context/reachability/reassignment safety. Nested accepted-sample evaluation and
dependency provenance also need reconciliation: resolving children from pinned profile defaults does not
prove they derive from the consumed vw/vh samples. This is a proposed direction, NOT a SPECIFIED repair
or authorization to change files. Before implementation, the parent must read current capability/ADR
records and document the exact positive/negative contract. Use existing CallModel/LayoutProgram/Session
owners; do not introduce a Lua executor, hardcoded HUB dimensions, or a parallel geometry path.

Expected future checks include real HUB title-table geometry with exact sample dependencies and source
locations, alias reassignment/foreign descriptor/nonfinite rejection, no fabricated unresolved body
geometry, and preserving the independent whole-operation edit lock. A successful alias fix alone would
not establish full real-menu visual editing; nextTab/font/runtime/local-expansion and editability issues
remain separate. No new diagnostic run or capability-map positive claim was made in this review.

Current source fingerprints at parent review:
- CallModel8C44CB538BDCF6AD8C97BA537D8A29D1B0CBECC1BB9B730907D7F8CAFAD7A0F7.
- LayoutProgram511CA88FA8959870E8B593D5D0254D306837260F5E414F0476BE1846AB0610A3.
- EditorSession4AC5D983ACAF7CCD1C6A0AB341E4F399198BCF6D90A78A41E4D22C920390BF99.
Franklin remains ACTIVE cursor387b40b1-4a0a-4c74-b0a6-47a13fe2fd25:17 and reports8 C corrections
implemented, now running permitted static checks. Current parent-read C9002B44FEE56882255AAF2991A7BBBB6C8
EDCAC5E80ECA964D5AF8A9B08377AB is in flight, not frozen or accepted. Next action is review/freeze and
independent allowed checks, not another speculative diagnostic or a replacement worker.

Close: PARTIAL / full goal ACTIVE. Current continuation made PROGRESS through concrete C review and a
source/log-confirmed first real-menu blocker. No browser or fresh behavior pass; no new implementation,
release/Git/config/game/mod/install/native action. AAR non-clean:2 oversized parent inspection outputs
and1 worker-output object/string handling error triggered the operator degradation call. Missing skill
text was subsequently read; exact bounded recovery inspections succeeded. Sustain read-only evidence
and worker cleanup; improve output projection before printing (only selected terminal command records,
never whole item inventories). Take fresh review context before the next new implementation unit.

### Final C freeze / independent-check amendment — 2026-09-11 07:00Z

Previous continuation made PROGRESS. Franklin completed and was closed after freezing BselftestB5588B0A
and C9E244B15955DC7E9F992A903B3EE079EFE383126B652F56ABEAF0242D6F5ADCF. No active workers remain.
Parent independently reviewed all8 corrections, then caught one further circular history oracle:
importedUndoCount was read from the import result and only checked positive. Final source now requires
the independent workspace's zero/zero history, then exactly baseline+1 Undo/0Redo for import, and derives
later edit/Undo/Redo expectations from that baseline. Final download-event count remains exactly2.
Production99334D7D and Source A remain unchanged. Worker reports types/lint/whitespace green; independent
parent reruns and preserved-old-test oracle are next. Actual browser/full SourceEditor selftest held.

Required discovery FAILED in the worker twice before test execution: first existing test registration
at spec188 threw "Playwright Test did not expect test() to be called here";0 tests enumerated. This is
not an established product/test regression just because the stack names that unchanged test. Parent
read current packages: root node_modules/playwright is1.61.0; @playwright/test is1.63.0 and depends on its
own playwright1.63.0. The originally prescribed root playwright/cli.js mixes those runner instances.
Both failed logs remain evidence; no import/dependency/lockfile/node_modules/config change is allowed.

Amended independent discovery command (same list-only scope): bundled Node invokes
node_modules/@playwright/test/cli.js test tests/e2e/x4-ui-source-editor.spec.ts --list --reporter=list,
with process-local X4_FORGE_E2E_WEB_PORT=3200 and X4_FORGE_E2E_API_PORT=3201. Parent inspected that actual
1.63 CLI and runner6931-6963: listMode runs only in-process load and report-begin, NOT global setup,
web-server plugin setup, rebaseline or test tasks. Current config was read in full; module initialization
does only configuration/read-only discovery. List-only selfchecks remain pure in-memory comparisons.
This reconciles the entry point with the imported library; it is not a browser-hold bypass. Source B's
full selftest is still forbidden until fresh clearance. Evidence: parent-static/type/lint/preservation/
discovery logs and a stable-hash receipt will be recorded before close; no discovery success claimed yet.

Numeric-repair preparation read current ADR-F1 throughF5 and capability-map756-810. Existing exact-source
numeric grammar/source-order/reassignment proof is the owner to extend. Capability-map explicitly
forbids samples overriding source-proven geometry. Layout facts currently expose singular sampleId;
mixed nested sample dependencies require an explicit schema/consumer contract before any implementation.
No numeric repair plan or code has been authored/assigned. The brainstorming/planning skills guided this
reconciliation, not a new implementation batch. Prior before-sample-lookup diagnosis was corrected in
this plan, BACKLOG and SESSION-HANDOFF immediately after reading the named fallback constant.

AAR non-clean: discovery runner/library mismatch, circular history expectation, and the parent's missed
fallback constant changed the next action. One guessed tsconfig.app.json read also failed (root
tsconfig.json is the real configuration), and undersized inspection output budgets required bounded
readback. Do not repeat blind root-runner invocation or classify conditional branches without reading
their sentinel constants. Full goal remains ACTIVE/PARTIAL; original acceptance scope unchanged.

### Independent C static close — 2026-09-11 07:05:34 UTC

Status PARTIAL: C authored and statically reviewed; B behavior/C actual browser journey remain unrun.
Franklin completed/closed. No workers remain; no other code or test task was spawned.
Final C9E244B15955DC7E9F992A903B3EE079EFE383126B652F56ABEAF0242D6F5ADCF and BselftestB5588B0A
are frozen; SourceEditor product99334D7D unchanged. Parent reviewed the full original delta and both
correction increments. Exact import baseline+1 history and final2 download-event assertion are present.

Independent evidence:
- Bundled Node node_modules/typescript/bin/tsc --noEmit: PASS0, session94057 terminal.
- Bundled Node node_modules/eslint/bin/eslint.js exact Bselftest/C paths --max-warnings0: PASS0.
- Exact product/Bselftest/C git diff --check: PASS0.
- Pure TypeScript AST preservation (no test module import): PASS0 at07:03:17.873Z. All38 prior non-import
  statements retained byte-for-byte, including8 direct tests plus3 parameterized cases. Current9 direct
  cases plus3 parameterized cases=12. All53 B test functions remain; only2 assigned matrices changed.
- Bundled Node node_modules/@playwright/test/cli.js test tests/e2e/x4-ui-source-editor.spec.ts --list
  --reporter=list, process-local3200/3201: PASS0,12 cases including all11 prior cases and the new journey.
  List-only also evaluates the pure module-load oracle selfchecks; no browser/test fixtures run.
- All25 input fingerprints equal before/after validation.3 snapshots copied with before/copy/after hash
  equality. JSON receipt, all snapshot hashes and current25 inputs independently read back successfully.

Artifacts: test-results/b119-lua-file-roundtrip-parent-c-frozen-20260911T0702Z-
{types,lint,whitespace,preservation,discovery}.log; snapshot/receipt directory
test-results/b119-lua-file-roundtrip-browser-parent-reviewed-20260911T070534Z/.
The types/lint/whitespace commands emitted no output, so Tee-Object created no files for them; their logs
were then created with the actual command, terminal exit0 and tool-result chunk ID, explicitly stating
empty stdout/stderr. No synthetic tool output or behavior result was invented.

[REPRODUCED] Discovery failure was the mixed runner/library invocation: root runner1.61.0 failed at the
first unchanged registration; matched @playwright/test1.63.0 runner lists all12 with the frozen test.
Both original worker failures remain. Dependency installation, lockfiles, test imports and configuration
were NOT changed. Normal scripts/run-e2e.mjs already selects @playwright/test/cli.js at1083, so no harness
repair is needed. reviewctl/project rules/BlastRadius remain unavailable; no automated review scan claimed.

Review outcome: all C authoring/static requirements evidenced; actual full component lifecycle, browser
history/file/workspace/pixel assertions, prior required red browser gate, full E2E/precommit/package/native
and broader three-menu/fidelity acceptance remain open. No capability-map delta or product/release/Git
close. Suggested future commit title: test(ui): prove Lua file roundtrip across independent workspaces.

AAR non-clean: sustain independently derived workspace/history/byte expectations, real event accounting,
fresh-pixel observation order, stable-hash static review and immediate worker cleanup. Improve: align CLI
with the imported runner library; inspect named sentinel values before concluding control flow; use actual
configuration paths and sufficient bounded output budgets. Highest-risk observed acceptance gap remains
real imported-menu editability; its alias/dependency repair is the next scoped product task, not solved by
this static checkpoint. General/project lessons are banked here; external ledgers/memory were not written.
Full goal remains ACTIVE/PARTIAL. Fresh review context before the numeric implementation; no new batch,
graph rebuild, protected write, native run, precommit, commit/push or publication was performed.
