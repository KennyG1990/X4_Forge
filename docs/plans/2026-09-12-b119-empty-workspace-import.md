# B119 genuinely empty independent workspace and Lua import

Lane FULL. Status PARTIAL; blank creation implemented and validated, full Lua journey still red.
Full goal ACTIVE/PARTIAL. Current goal turn PROGRESS: actual creation/import now succeeds.

## PLAN / ACCEPTANCE

Bounded repair: a name-only New independent workspace request must create a genuinely blank authoring
workspace, not silently seed the Escort starter project's compiled content. Preserve the initial boot
demo and explicit supplied workspace creation. Reuse sanitizeWorkspace, the existing POST creation
route, registry/receipt transaction, current App switcher, and source importer. Do not relax source
ownership, generated-path collision, compile fingerprints, CAS or asynchronous file-read guards.

Likely owners: server.ts POST /api/agent/workspaces default input; existing workspace-creation route/
receipt selftests and tests/e2e/workspace-isolation.spec.ts; tests/e2e/x4-ui-source-editor.spec.ts for an
explicit truly-empty precondition before import. Reconcile actual sanitizer defaults and existing
test entrypoints before implementing. Do not add a competing workspace factory if one already exists.
No direct UI deletion/migration of existing widgets, bootstrap default rewrite, registry migration,
new endpoint, source renderer/history change, or test-side clearing of hidden demo widgets.

Acceptance:
- Name-only creation returns independent immutable ID and sanitized requested name with no authored
  nodes, links, legacy UI widgets, custom Lua, passthrough/source files, AI scripts, wares, jobs or
  patches accidentally copied from a demo/current project. Other schema defaults remain valid.
- Existing bootstrap demo and explicit user-supplied workspace bytes retain their existing behavior.
- Existing same-name isolation, operation receipt idempotency, request rejection, size/record limits
  and old-workspace preservation remain unchanged. Failed creation must not change current selection.
- Actual Open Lua into the newly created workspace succeeds without clearing hidden content, preserves
  exact downloaded Lua and unrelated workspace data, and restores source/target/hierarchy/render.
- The original complete Lua journey remains the browser acceptance gate, with 60s UI budget,
  retry1/zero-flake policy and every export/reload/import/history/collision/workspace assertion intact.
- Existing generated-widget/shadowing import negative must still refuse and leave its workspace intact.

Validation: fail-first name-only route/default-input test plus explicit-workspace/boot preservation;
existing creation receipt/isolation tests (determine exact runner in reconciliation); full WorkspaceSource
selftest and SourceEditor; whole tsc, strict touched lint, diff review. Serial actual Lua E2E3200/3201
with real corpus and CPU profiler absent; inspect real rendered import and downstream checkpoints.
Check all frozen inputs, persistent hashes plus additions/deletions, owned stack cleanup and protected
3100. Deterministic graph refresh. Installed/native/full numeric/fidelity gates stay required separately.

Risk: changing common creation defaults can affect non-UI authoring callers. The contract applies only
to name-only requests; explicit workspace and boot/migration paths must have positive preservation
tests. No new persistence format or authority boundary. Rollback exact owned hunks against captured
snapshots; no broad restore of dirty files. No Git/push/release/real mod/game/save/install/config writes.
Evidence: test-results/b119-lua-import-origin-20260912/; later browser results use a separate run folder.

## BASELINE / RECONCILE

HEAD/main93c9af111d63ca77c99dee11f21882c4073bcda6. Prior39input/19guard set rechecked; full dirty status
and hashes in baseline.json. No test runner/game;3200/3201free,protected3100PID30164. Prior canvas
owner/test hashes match the latest checkpoint. No code edits in this diagnostic turn.
Original objective and brief read; approved canvas-first product contract, ADR-F5 and capability
ownership checked. Older recall is reference API work, not evidence of this import problem.
Graph confirms SourceEditor imports WorkspaceSource; direct resource/caller searches govern findings.
No capability-map delta.

[REPRODUCED] Exact previous browser observations contain three legacy UI demo widgets with ui:true,
despite no Lua/hierarchy/native canvas. Replay through buildX4UiWorkspaceSource + importX4UiWorkspaceLua
returns generated-shadowing-source, detail "Generated UI output currently claims the source workspace."
Source status is unavailable (no root UI XML), which does NOT mean absence of generated UI ownership.
An isolated control changes only uiWidgets to [] and the exact same downloaded Lua imports successfully;
original/control objects remain unchanged and unrelated nodes/links survive. No live workspace edited.
Reproducer: reproduce-import.mjs, executed with bundled Node --import tsx; result.json contains output.

Root caller chain observed in current code:
- App.tsx2331..2340 prompts a name and sends only clientId/name to POST /api/agent/workspaces.
- server.ts5768..5771 falls back to {...DEFAULT_WORKSPACE,name:...} when workspace is not supplied.
- DEFAULT_WORKSPACE2892 includes Escort mission nodes, links and three active legacy UI widgets.
- registerX4UiWorkspaceSourceFile1334..1350 correctly rejects currentCompileShadowed before registering
  imported Lua. The friendly refusal text groups five reasons, so the prior screenshot alone did not
  diagnose the guard. Existing technical details surface is already available; no new logging API needed.

## NEXT EXECUTION BATCH

### Reconciled implementation contract — 2026-09-12 continuation

Existing src/lib/modTemplates.ts has buildTemplateWorkspace('blank'); reuse it. src/types.ts
sanitizeWorkspace already initializes every missing collection to [], but gives absent domain IDs
a Date.now value. Name-only receipt retries therefore require an explicit stable domain ID. Preserve
the old name-only domain ID workspace_default (NOT the registry's unique immutable workspaceId).
Change only server.ts's existing modTemplates import and name-only fallback to blank-template fields,
stable id, and requested name. DEFAULT_WORKSPACE boot/migration input and explicit workspace branch
remain byte-for-byte unchanged. No helper, endpoint, factory, sanitizer, registry or receipt owner added.

Actual touched owners: server.ts; tests/e2e/workspace-isolation.spec.ts (new real route positive/negative
case); tests/e2e/x4-ui-source-editor.spec.ts (assert all independent workspace authoring collections are
empty before import). Record snapshots/41 existing plus new relevant input hashes in
test-results/b119-empty-workspace-20260912/. Keep diagnosis evidence separate and immutable.

Fail-first gate: new name-only route browser case against old server, through authenticated current
Studio fetch and existing operation receipts, must fail blank-content assertion. It captures actual
responses before assertions, checks exact replay, same-operation changed-facts rejection, malformed
operation rejection, explicit supplied project preservation, record counts and unchanged original
workspace/selection. New blank assertions in the original Lua journey never clear demo widgets.

Focused commands: bundled Node --import tsx src/server/workspaceCreateReceiptAdapter.selftest.ts,
src/lib/x4UiWorkspaceSource.selftest.ts and src/components/X4UiSourceEditor.selftest.tsx; call existing
runWorkspaceRegistrySelftest and runModTemplatesSelftest exports via a read-only runner with isolated
selftest-owned scratch dirs. Whole tsc and strict touched lint. Serial run-e2e on the new case first
(red), then all workspace-isolation tests (green expected), then original single Lua journey with real
corpus/no profiler. Safeguard/input checks after each run. Core create receipt/selftests already cover
limits, replay, rollback and failure paths; no changes to those owners are planned. Full route-integration
suite is not added to this bounded contract: it exercises many unrelated mutation surfaces. The real
route case plus full existing creation/registry selftests cover this changed default and its contracts.
Required original Lua journey remains a full criterion; any new failure keeps this unit PARTIAL.

Validation amendment: strict touched lint hit257warnings/0errors in server.ts and existing workspace
tests. Compare every diagnostic against exact pre-unit snapshots using the same ESLint filePath/config,
rule/severity/message/nodeType/source-line signatures (line offsets may shift); require zero errors and
zero new diagnostics. Preserve strict-zero-warning failure in the record; no rule suppressed and no
unrelated warning cleanup. The initial combined registry/template wrapper checked allPassed for both,
but registry returns pass. Actual registry33/33 and templates36/36; rerun with their named result fields.

1. Locate the actual sanitizer via src/App.tsx's ./types import using rg --files src (do not guess a
   src/lib/workspace.ts path). Read defaulting behavior, enumerate name-only route readers/writers and
   existing route/receipt test entrypoints. Finalize exact files/validation applicability in this plan.
2. Add the fail-first name-only blank creation case plus explicit/boot preservation and real import
   through that creation output. Then repair only the name-only creation default via existing sanitizer.
3. Run declared focused/static gates, original browser journey, rendered inspection and cleanup. Keep
   all larger UI-builder/numeric/scenario/native obligations intact; do not close B119 from this repair.

## CLOSE / AAR

Earlier diagnostic checkpoint was PARTIAL: diagnosis evidenced and repair specified, implementation then pending. Suggested eventual
commit:fix(workspaces): keep new independent projects free of starter demo content. Work remains local.
Triggered AAR: three path-search mistakes (shell globs/nonexistent server and workspace module paths),
overlarge diagnostic output, and upstream cause differing from an import-guard hypothesis. Explicit
degradation checkpoint; no implementation attempted after it.
Sustain: replay exact captured workspace/source through real owner; counterfactual changes one field;
refusal protection is preserved rather than weakened to make a positive test pass.
Improve approach/tools: enumerate paths once with rg --files; use exact discovered paths and output
selected fields only. Empty source/canvas does not prove the whole workspace has no authored content.
Highest-risk observed weakness: new independent projects silently contain enabled compiled demo UI
and mission content. Repair only the creation default, with explicit-workspace and bootstrap preservation
tests. Lesson banked here/handoff; no global memory or external issue/wiki write.

## IMPLEMENTED / VALIDATED / REVIEWED CLOSE — 2026-09-12 10:08Z

Only server.ts and the two named E2E specs changed. Server reuses buildTemplateWorkspace('blank'),
overrides the timestamp-based template domain ID with the existing stable workspace_default ID, and
applies the requested name. Initial DEFAULT_WORKSPACE and explicit supplied workspace branch unchanged.
No source/renderer/history/registry/receipt/sanitizer owner modified. Actual snapshots/diffs reviewed.

- New real-route case on old server09:54:20..09:54:32 FAILED0/1,0flakes at empty nodes assertion.
  Both attempts returned Escort demo nodes; after-red.json preserves clean lifecycle and guards.
- Repaired full workspace-isolation09:58:25..09:58:41 PASS3/3,0flakes: blank fields, duplicate-name
  distinct ID, exact replay and receipt, changed-facts409, malformed-operation400, exact explicit
  supplied project, original current record/selection unchanged, two-tab isolation, target draft restore.
- Existing creation receipt16/16, registry33/33, templates36/36, full WorkspaceSource and full mounted
  SourceEditor PASS0. SourceEditor P7 scope21/21; async9/9,selection9/9,input6/6,export6/6,New-menu25/25
  and all subsequent mounted cases pass. Whole tsc PASS0. No source guard weakened.
- Strict touched lint FAILED on257pre-existing warnings/0errors. Exact original-versus-current
  ESLint diagnostic signatures match:server245,workspace-isolation12,Lua spec0. No new diagnostics;
  compare-lint.mjs/lint-comparison.json prove the amended baseline-qualified criterion. No rule suppressed.
- Original real-corpus Lua09:59:37..10:02:05 FAILED0/1,0flakes,both attempts. Original60s UI budget,
  retry1/zero-flake and all downstream source/byte/history assertions kept. Added blank precondition
  asserts11collections/customLua; never clears the workspace in the test. All preceding New/add/edit/
  save/export/reload/independent-empty checkpoints pass. Source import now succeeds and reports Opened,
  but asks the user to choose Menu, failing the original10s auto-selection assertion.
- Imported server response extracted unchanged from first attempt trace2 network at81951.409,
  resources/0222aa6ea9749ccb5a05980f730b495cfc79fb8b.json. Full workspace deep comparison against real
  import owner result passes, matching independent workspace ID and exact Lua bytes. See
  last-workspace-response.json and import-byte-verification.json. This is actual browser/server import
  proof; the later imported rendered-canvas/history/export/collision assertions were not reached.
- Visually inspected imported-awaiting-menu.jpeg: source file selected, Opened status, Menu unset,
  hierarchy unavailable and stale canvas. Do not label that a completed reopened rendered menu.
- Exact session candidate-catalog replay exposes6targets:top-level,refreshHelper,menu.open,
  menu.onShowMenu,menu.createFrame,menu.cleanup. Existing settleImport only auto-selects when targets
  length is1. That explains the newly reached behavior, not another import rejection. Next unit must
  reconcile actual menu-building targets versus broad callable/helper targets using source evidence;
  do not guess by name or silently select the first, and preserve genuine multi-menu/manual-choice safety.
- after-isolation and after-lua:45pins/19persistent hashes unchanged,no additions/deletions,
  3200/3201closed,3100PID30164unchanged,HEADsame. All three runner lifecycles complete/ownership/treeGone,
  no remaining or killed PIDs. Final hash recheck10:07:47 has no drift or active runner.
- Manual exact three-owner review/whitespace PASS. reviewctl/BlastRadius unavailable. Graph
  10:03:07..10:04:00 PASS0:11519nodes/29028edges/369communities, deterministic/noLLM, HTML5000cap retained.

PARTIAL: name-only creation and exact Lua import proven; full authoring journey still blocked at target
selection. All original9journeys/3menus/12reference/numeric/scenario/fullE2E/precommit/package/installed/
native/release obligations retained. No capability-map delta. No Git/push/release/install/real mod/save/
game/config/external issue/wiki/global memory writes. Receipt:test-results/b119-empty-workspace-20260912/receipt.json.
Suggested eventual commit:fix(workspaces): keep new independent projects free of starter demo content.

### Implementation-turn AAR

Triggered: fail-first regression; one shell-glob path-search error; strict lint baseline discovery and
documented contract amendment; registry wrapper read allPassed instead of actual pass (underlying
33/33green), corrected wrapper PASS0; diagnostic trace capture used PowerShell automatic Matches
variable, then dependent read ran before extraction success. Corrected task-specific variable and
guarded dependent step; actual response/byte check passed. Explicit checkpoint after clustered tool
mistakes; no additional production scope added.
Sustain: reuse Blank template; stable domain metadata for retries; prove current/explicit workspace
preservation and actual server bytes. Improve tools: exact enumerated paths, exact result schema,
task-specific variables, and stop dependent commands after failures. No product regression was hidden.
Highest-risk remaining observed weakness: helper functions are exposed as ordinary Menu targets,
preventing automatic reopening of this single-menu file. Next bounded source-grounded selection
experiment must distinguish menu builders while preserving genuinely ambiguous imports and user intent.
Lessons banked in this plan/handoff only; no external/global memory edits.
