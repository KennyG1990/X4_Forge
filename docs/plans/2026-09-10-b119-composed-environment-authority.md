# B119 composed environment authority correction

Task: Close the reproduced self-reference assignment/escape hole in the uncommitted protected-callback patch.
Lane: FULL
Status: PARTIAL — implementation and focused checks complete; required broad/installed/live gates remain pending. Overall B119 remains IN_PROGRESS / PARTIAL / Not verified in game.

## PLAN

- Bounded unit: make the existing environment-identity analysis compositional for supported `_G` self-reference expressions and use it consistently for assignment/function-declaration receivers. This is a correctness prerequisite to the existing stable `0.0.78` acceptance plan, not a new feature or alternate parser.
- References: the original FORGE-UI-EDITOR-BRIEF.md; the protected-callback and stable `0.0.78` sections of `docs/plans/2026-09-05-b119-ai-influence-visual-dogfood.md`; `src/lib/x4UiCallModel.ts` and its selftest; the current capability-map protected-callback delta. Preview must never imply verified callback identity after a known rebind.
- Owned implementation paths: `src/lib/x4UiCallModel.ts` and `src/lib/x4UiCallModel.selftest.ts`, written by exact native GPT-5.6 Luna only. Astra owns planning/review/records. Preserve all inherited changes in both files and all other dirty paths.
- In scope: recursively recognize canonical member/index/static-rawget self references and logical combinations; check composed receivers for protected global writes/declarations; add independent positive/negative fixtures, bounded recursion, deterministic/source-located rejection, and unchanged source text.
- Out of scope: arbitrary Lua evaluation, new callback machinery, layout/rendering changes, broader scope/closure analysis, metadata/version changes, package/install/publish, Git mutations, external projections, live Forge/X4/mod/corpus/config/save changes.
- Design decision: reuse and correct the existing identity helper rather than add more spelling-specific checks or reject every global-field read. Repeated prior hardening entries document alias, deferred-flow, and self-reference misses; the common mechanism is inconsistent identity recognition. Replacing the parser is not justified by this bounded finding; replacing the duplicate receiver predicate with the shared recognition path is.
- Risks: false negatives could preview a body that the rebound function would not execute; overbroad matching could suppress legitimate previews. No network, spending, deletion, permission, migration, or persistent-state contract change is introduced.
- Rollback: reverse only this new worker's identified hunks after preserving results; never restore either source file to HEAD because it contains the inherited uncommitted patch.
- Acceptance: each reproduced bad form yields zero protected body calls/invocations and a source-bound authority gap; direct-global and harmless-field controls remain correct. Test variants independently so an earlier hazard cannot mask a later miss. Cover one-hop and nested member/index/rawget combinations, aliases, logical receivers, assignments and declarations; ordinary Helper/formatter reads stay admitted. Preserve existing callback limits, source text, deterministic output, and existing selftests.
- Validation: first retain the red portable parser matrix, then add a fail-first matrix to the existing CallModel selftest, implement, rerun the bounded matrix and complete CallModel aggregate with producer-side summary filtering, exact two-file lint and diff hygiene, and parent diff review. Whole-repository typecheck, cross-layer suites, Graphify refresh, precommit, full isolated E2E/build and all release/install/rendered/native checks remain required before release, but are deferred until the fresh machine-state gate is answered. No new full-suite/host-runtime run is authorized by this plan.
- Evidence: this record holds the red/green command summaries, source hashes, review, close and AAR; tool outputs hold exact command/exit evidence. No historical green receipt may establish current-patch acceptance.

## BASELINE

- HEAD: `93c9af111d63ca77c99dee11f21882c4073bcda6`. Six inherited source/test files have 2,558 additions and 41 deletions. Release owners are untouched by this unit.
- Pre-edit SHA-256: CallModel `B9F4C931EB164A5AF92BA7C1A4260FC6184CEB68BA57EDA7EEA912B0C450582D`; CallModel selftest `F273D4808768A8B0E8F1D38C90DDFB6F35F5E9464E8D5427756024D799DD3E24`.
- [REPRODUCED] Parent in-memory parser fixture on Node `v24.15.0`: seven cases, five failures, exit 1, approximately 0.31 seconds. This parsed synthetic Lua strings only; it did not execute Lua, open an app, or write files.
- Bad forms each parsed successfully but emitted one protected `addTable` and zero authority gaps: `_G._G.pcall = function(...) return true end`; `_G["_G"]["pcall"] = function(...) return true end`; `_ENV._G.pcall = function(...) return true end`; `function _G._G.pcall(...) return true end`; `unknownSink(_G._G._G)`.
- Controls passed: direct `_G.pcall = function(...) return true end` emitted zero protected calls and a rebind gap; `_G.other = true` retained one protected call. Every prefix was followed by the same `menu.display` fixture containing `pcall(function() frame:addTable(1,{}) end)`.
- Old precommit handle `51744` is missing; no final result is asserted. Process-tree inspection returned `Access denied`; no permission workaround or process restart was attempted. A fresh user machine-state answer remains absent.

## RECONCILE

- Graphify explains `x4UiCallModel.ts` as the existing shared owner consumed by Layout, SourceBundle, source edits, linter and tests; graph locations are navigation only, not current-line proof.
- The current escape checker recognizes `_G._G` only when its base is directly recognized. The assignment checker uses the narrower identifier/alias helper even when the receiver is an already-supported self-reference expression.
- The existing canonical-self-reference test groups multiple statements in one source and asserts only the first authority gap. It does not independently prove every listed spelling or composition.
- Parent review also found that the inherited probe uses the first `pcall(` substring: a `function _G._G.pcall(...)` prefix can be mistaken for the protected call. New regressions must identify the actual anonymous-callback call and assert that exact rejection location, not merely an empty incorrectly selected call list.
- Capability-map delta: no verified capability delta yet; the prior broad fail-closed claim is under correction. External capability/AAR ledgers require a later authorized write; this repository record preserves the finding now.
- Plan change: release acceptance pauses for this reproduced correctness repair. The existing `0.0.78` acceptance criteria and full product goal are unchanged.

## IMPLEMENT

- Native Luna worker `01a08a24-41cf-7ed0-8021-c045b7ba466a` changed only the two owned source/test paths and is now closed. The evidence worker is also closed. No worker remains assigned to this unit.
- CallModel now recursively recognizes supported canonical self-reference bases through the existing identity helper, and assignment/declaration receivers use that same helper. The depth limit is 16; exhaustion records an explicit authority hazard instead of implying that environment flow is absent. Ordinary member/index properties are excluded before recursion.
- The existing selftest now has independent exact-call probes, 14 composed-negative cases, four ordinary-read controls, nine depth-boundary cases (16/17/20 across escape/assignment/declaration), and four deep ordinary-field controls. Source text, deterministic output, and exact file/range provenance are asserted.
- Inherited changes were retained. No layout, Scene, Paint, public EditorSession, release-owner, config, game/mod/save/corpus, Git, or external projection was changed by this worker. Parent records changed this plan, the primary B119 plan, BACKLOG, and SESSION-HANDOFF.

## VALIDATE

- Composed-matrix fail-first aggregate: `124/125`, exit 1; the new independent composed-negative aggregate failed before its production correction.
- Depth-matrix fail-first aggregate: `126/127`, exit 1; only the new depth-boundary assertion failed before the explicit-exhaustion correction.
- Complete CallModel aggregate: `127/127`, allPassed=true, failedChecks=[], exit 0. Parent read the actual worker command/result, not only the completion summary. Command from repository root: `node --import tsx --input-type=module -e "const emit = console.log.bind(console); console.log = value => { try { const result = JSON.parse(String(value)); emit(JSON.stringify({ passed: result.passed, total: result.total, allPassed: result.allPassed, failedChecks: result.checks.filter(check => !check.pass).map(check => check.name) })); } catch {} }; await import('./src/lib/x4UiCallModel.selftest.ts');"`.
- Worker in-memory seven-case reproduction: `7/7`, exit 0. Exact no-space depth probe: `9/9`, exit 0, with explicit recursion-exhaustion reasons at 17 and 20 for escape/assignment/declaration. Both actual command outputs were read by the parent.
- `node_modules/.bin/eslint.cmd src/lib/x4UiCallModel.ts src/lib/x4UiCallModel.selftest.ts`: exit 0 (2.529 seconds); actual command result read by parent.
- `git diff --check -- src/lib/x4UiCallModel.ts src/lib/x4UiCallModel.selftest.ts`: exit 0; parent additionally checked inherited integration and current record diffs.
- Independent parent in-memory matrix: `12/12`, exit 0, Node `v24.15.0`, `2026-09-10T07:23:50.988Z`, approximately 0.254 seconds. Covers the original seven cases, depths 16/17/20, and deep ordinary read/write controls; checks exact protected-call rejection spans, source retention, and repeated-model determinism. No app or Lua runtime executed.
- Final SHA-256, independently reread by parent: CallModel `8C44CB538BDCF6AD8C97BA537D8A29D1B0CBECC1BB9B730907D7F8CAFAD7A0F7`; selftest `8349308DD5246552A2122184AF736FB81E68991E71E7DF92F4F395719AD8FE2F`. Parent matrix used that exact CallModel hash.
- Required but NOT RUN here: whole-repository typecheck, cross-layer focused tests/corpus census, Graphify refresh, precommit, full isolated E2E, production/package builds, public/package/install parity, installed/rendered acceptance, native Pair B and full experience proof. The fresh machine-state response remains absent. Historical results above cannot satisfy these current-patch gates.

## REVIEW

- Parent read the inherited six-file implementation/test diff and the new composition/depth changes. The shared recognition path, early ordinary-property exclusion, explicit exhaustion hazard, correct protected-call locator, and independent positive/negative tests now match this bounded contract.
- Correctness fix: done with focused evidence. Source preservation and exact rejection provenance: done. Broad type/cross-layer/graph/release proof: pending, not waived. Installed/native visual equivalence and external close: out of this corrective unit but still required by the unchanged product goal.
- Fresh-eyes review rejected the first depth guard and required reimplementation; this is a triggered AAR, not a clean first-pass close.

## CLOSE

- Status: PARTIAL. The source correction and focused checks are complete; required broader gates remain unrun. No release, full B119, or in-game completion is claimed.
- Reconciliation/capability delta: the bounded composed-identity defect is corrected in source; no broader validated capability claim or external capability-map update is made.
- Current checkpoint remains `93c9af111d63ca77c99dee11f21882c4073bcda6`; all current patch/record work is uncommitted. No staging, commit, push, install, publish, protected-state write or external projection occurred.
- Next action: obtain fresh Antigravity/X4/machine-quiet state, resolve process-inspection permission if needed, then run required serialized broad/cross-layer gates and Graphify refresh before resuming the existing `0.0.78` release/install contract. The native Pair B write gate remains separate.
- Suggested future commit title after required release gates: `feat(b119): wire protected callbacks through the X4 UI editor`.
- Global/project AAR and capability-ledger writes outside the workspace remain pending authorized access; the exact failure, correction and evidence are banked here. GitHub #41/Notion/Drive readback remains at the existing post-release/commit boundary; no stale external success claim was written.

### Parent review return — recursion-limit rejection

- Luna added 14 independent negative sources and four positive controls; initial aggregate was `124/125`, exit 1. Thirteen composed-negative sources exposed the baseline hole; the already-covered logical case and controls passed. These fixtures identify the exact protected-call expression, including when a prefix declares `pcall`.
- [REPRODUCED] Review of the first candidate found a new depth cap of 16 returning `undefined` on exhaustion. Parent synthetic `unknownSink(_G` plus repeated `._G` plus `)` fixtures rejected at depth 16 but still emitted one protected `addTable` with no authority gap at depths 17 and 20; exit 1, approximately 0.28 seconds.
- The candidate is not accepted. Parent returned the same two-file unit to Luna for an explicit source-located authority-uncertainty rejection on exhaustion, independent boundary/over-boundary/deep tests, and harmless deep-field controls. Raising/removing the cap is not the fix. Do not recurse into ordinary member fields just to establish canonical `_G` self-reference identity.
- This is required correctness work under the existing bounded/fail-closed acceptance contract, not a new feature. Retain the successful shallow repairs and all inherited changes; no broad/runtime/release gate has run.

### Existing broad-evidence reconciliation

- Native evidence worker `01a08a20-481c-7e41-8330-350bfc370d94` completed a read-only census and changed no files. Its exact model was requested as `gpt-5.6-luna`/`max` by the native spawn tool; the inspected app/artifact output did not independently expose runtime model metadata.
- No persisted session `51744` terminal receipt was found among text-bearing files under `dev-docs/b119-ai-influence-dogfood`, `test-results`, or `artifacts`. This is a bounded absence finding, not evidence of success or failure.
- `test-results/e2e-verdict.json` is the historical complete `106/106`, child exit 0, treeGone/green receipt with SHA-256 `9CBA11CE26DF2B23E098F185EAF9F21A1265ADBA891AFD7681C3F02357A80BD6`. It contains no current source/test hashes or revision and cannot cover this later correction.
- `test-results/b119-gate13-precommit.log` ends in `[precommit] OK`, but has no session-51744/source-identity/exit binding and predates the current gate ordering. `test-results/b119-gate14-build.log` is likewise historical, not current-patch build proof.
- The retained UI verification-gap census is bounded corpus evidence, not the full oracle sweep. Passed `.last-run.json` markers are not full-suite receipts. No current-patch broad-gate or `0.0.78` release/install acceptance was found in that search boundary.

## AAR

- Triggered: inherited negative-path acceptance was falsified by independent composed-expression fixtures; the release path changed back to bounded implementation.
- Triggered again: parent review forced reimplementation of a fail-open recursion-limit candidate. The first CallModel aggregate wrapper also failed before tests with `ERR_MODULE_NOT_FOUND` for an extensionless import; that was runner selection, not a product result.
- Sustain: preserve inherited work, use independent controls, retain exact hashes, and separate tiny parser checks from heavy/live validation.
- Improve approach: test equivalent authority spellings independently and check compositions at every consuming context, not just value escapes.
- Improve tools: bound tool output at the producer; a missing process handle is not success. Process inspection permission failure remains explicit.
- Optional code-review tooling is unavailable: `reviewctl`, `.reviewctl/rules.yaml`, and the skill's named BlastRadius script were absent in current read-only checks. No tool was installed; maintained repository tests/lint and direct graph/diff review remain the acceptance methods.
- Highest-risk evidenced weakness: two identity predicates disagree, allowing a known global callback rebind to be previewed as if the callback still had builtin identity. Bounded fix: shared compositional recognition plus independent regression cases.
- Boundary lesson: budget/depth exhaustion must not share the same return meaning as a proved absence of authority flow. An explicit uncertainty rejection is required before admitting the protected body.
- Lessons banked: this task record only; no global memory or external ledger was edited.

## 2026-09-10 resumed broad-validation checkpoint

Status: SPECIFIED, execution authorized; overall B119 remains IN_PROGRESS / PARTIAL / Not verified in game.

- Fresh user confirmation: Forge open, X4 stopped, YouTube playback ongoing, authorized to continue.
  Run one heavy validation chain at a time. Game/mod/save/standing-config/install writes remain separately gated.
- Current read-only process inspection succeeds. Antigravity IDE.exe is present; X4.exe is absent;
  ports 3000/3001/3100/3101/3200/3201 had no listeners at baseline. Do not infer that the installed sidecar
  is running merely because the editor is open. No prior validator is being resumed or restarted.
- Bounded batch: full precommit, current cross-layer checks and repository lint/oracles, isolated full E2E,
  production build, and deterministic code-graph refresh, serialized. Stop at a red required gate, retain
  its evidence, reconcile its cause, and use a bounded native Luna repair if necessary.
- Reuse existing commands and the stable 0.0.78 acceptance contract. No release-owner mutation in this batch.
  Preserve all inherited dirty source/test/document paths and unrelated changes. No capability-map delta yet.
- Acceptance: authoritative terminal exit/results on current source bytes, explicit negative-path results,
  full structured E2E verdict with teardown/live-state protection, and source identity attached to evidence.
  Historical receipts cannot substitute for this run. Package/install/rendered/native proof remains pending.
- Evidence: test-results/b119-20260910-resumed-* command artifacts and this record. Generated output is filtered
  before tool emission, especially Layout selftests. Rollback is limited to exact new task-owned changes;
  never restore inherited source files to HEAD or kill unrelated processes.
- Baseline/review/close/AAR results will be appended from actual command receipts, not projected successes.

### Current resumed gate receipts

- Protected-state and exact six-file source baseline: `test-results/b119-20260910-resumed-baseline.json`.
- Full `npm run precommit:check`: exit 0, 2026-09-10T07:42:42.1998424Z to 07:50:55.6817745Z,
  `[precommit] OK`. Runtime bootstrap 59/59; verdict policy 55/55; writer selftest 15/15; durableWrite 8/8;
  capability audit 12 capabilities/297 routes/11 aliases; MCP checks pass; receipt coverage 82 routes/57 surfaces;
  final TypeScript check passes. Log: `test-results/b119-20260910-resumed-precommit.log`.
- Serialized current cross-layer suite: all six processes exit 0, 07:51:39Z to 07:54:13Z.
  CallModel 127/127; linter 153/153; Layout 751/751, zero skips, including actual configured widget-source hash
  and fallback expressions; EditorSession causal 23/23 and color-owner 7/7; Scene 179/179 with strict configured
  MENU/HUB/COMM execution 3/3; SourceEdits 95/95 and causal 48/48. Log:
  `test-results/b119-20260910-resumed-cross-layer.log`. X4_REFERENCE_ROOT was explicitly the saved X4 9.00 corpus;
  X4_UI_SCENE_SELFTEST_STRICT_CONFIGURED_CENSUS=1. Every real-source projection remains Not verified in game.
- Official `npm run lint`: exit 0, 07:54:29Z to 07:54:51Z, zero errors/600 existing warnings; no suppressions.
  Log: `test-results/b119-20260910-resumed-lint.log`. All six source hashes still match the frozen baseline;
  exact six-file diff hygiene passes.
- Next full E2E scope is the existing canonical tracked-only inventory: all 23 tracked specs, expected 106 tests,
  ports 3200/3201, one worker, runner-owned retries/verdict/teardown. The untracked marketing-showcase spec is
  unrelated screenshot-production work and was already excluded from the canonical gate in the primary plan;
  it is preserved untouched, not deleted or disabled. No tracked spec is excluded or sharded.
- Required route integration/production build, runtime-discovered oracles, graph refresh,
  package/install/rendered/native checks remain pending. No release or product-completion claim follows these greens.
- Full canonical E2E PASSED: 23 tracked specs, 106/106, zero failures/flakes/bad results/quarantined issues/skips;
  one worker, unsharded, 9.4 minutes, terminal exit 0 at 2026-09-10T08:05:24.3700388Z. The existing runtime
  handoff used the configured safe Node 24.19.0; its executable was independently observed in the owned process tree.
  Dated preserved receipt: `test-results/b119-20260910-resumed-e2e-verdict.json`, schema 2, 4938 bytes,
  SHA-256 `1FC0D96D67225B86E677FCD944B526D6BDCB0F2940961D536BC2AE40E7C7F44D`. Independent strict readback
  verifies json-report/structured-report-inspected, complete discovered=terminal=106, lifecycle complete,
  ownership complete, treeGone=true, remainingPids=[], runnerInteractionFailed=false.
- Independent containment check at 08:07:57Z: all three protected tree identities, all four protected file hashes,
  and all six source hashes match `b119-20260910-resumed-baseline.json`. Owned wrapper/runner/API PIDs are absent;
  ports 3200/3201 have no listeners. Installed sidecar remains PID 38224 on 53618 with unchanged discovery.
- Read-only installed baseline: extensions.json selects only 0.0.77 and the active sidecar cwd agrees. The 0.0.57
  directory is explicitly obsolete, and an old failed-directory residue lacks a manifest; neither is an active
  0.0.77 parity failure or a deletion target. Historical 0.0.77 VSIX still has 26321722 bytes and SHA-256
  D1349AC2A3D43FEFD07CAA64BF262FFF4D4F10DEE6E38F453DC0EDAC737486F6.
- Deferred capability/project/global AAR findings are now banked by delta in the three named StarForge wiki ledgers;
  no global Codex memory is edited. Their entries explicitly stop short of package/native proof.
- Tooling AAR: a config-owner search guessed two absent paths before locating xsdParser.ts; an install-directory
  census attempted an absent manifest in a retired failed directory. Both were read-only. Corrected owner/index/
  obsolete-map inspection resolved them without touching user state. Existing warnings were not suppressed.

### Resumed batch close — automated validation VERIFIED, product PARTIAL

- `npm run test:routes`: 496/496 PASS, exit 0, 08:09:23Z to 08:10:27Z. Its required `npm run build`
  passed (1848 Vite modules, 19.88 seconds, plus the esbuild server bundle); the existing chunk-size warning
  remains. Log: `test-results/b119-20260910-resumed-routes-build.log`. Route scratch root
  `C:\Users\Moshi\AppData\Local\Temp\x4-route-int-57752` is absent after teardown.
- Existing `scripts/oracle-integration.mjs`: 134/134 green, runtime-index discovery, exit 0, 08:11:43Z to
  08:12:00Z. The invocation additionally set X4_CONFIG_DIR inside the harness-owned temp root, an ephemeral
  session token, and the exact configured X4_REFERENCE_ROOT/X4_XSD_PATH. The harness already isolated state,
  data and discovery. No standing config was written. Log: `test-results/b119-20260910-resumed-oracles.log`.
  Oracle config/state root `x4-oracle-int-8496`, discovery root `x4-oracle-discovery-8496`, and port 8972 are gone.
- `graphify update .`: exit 0 at 08:14:17Z, deterministic code-only extraction, 10755 nodes/27123 edges/347
  communities. HTML was correctly skipped at the 5000-node limit. Log:
  `test-results/b119-20260910-resumed-graphify.log`. No tracked Graphify delta appears in Git status.
- Final independent full protected-tree/source census at 08:15:30Z: all three trees and all six source hashes
  remain baseline-identical. Final config/token/discovery/root test-marker hashes also match. X4 remains absent;
  installed Forge remains PID 38224 on 53618; E2E/oracle ports and owned route/oracle scratch roots are clear.
- REVIEW: this batch proves current source, negative paths, cross-layer/corpus checks, isolated HTTP/runtime,
  full canonical E2E, production bundle, and current code graph. It does not prove a 0.0.78 VSIX, public bytes,
  installed 0.0.78, real rendered installed acceptance, native Pair B, three-menu pixel parity, or full B119.
- What changed: validation artifacts, this plan, the primary plan, BACKLOG, SESSION-HANDOFF and three StarForge
  capability/AAR ledgers; generated production/graph outputs refreshed. No source/test or release metadata changed;
  no Git staging/commit/push, publication, installation, game/mod/save or standing-config mutation occurred.
- Close: automated validation batch VERIFIED; release/correction/product remain PARTIAL / Not verified in game.
  Release metadata remains 0.0.77; stable 0.0.78 packaging/install is the next unit under the existing contract.
  GitHub #41/Notion/Google Drive projections remain at the documented post-release/commit boundary, not updated
  from uncommitted local green counts. The issue must remain open.
- AAR: triggered by the read-probe errors and an overbroad route-log filter matching `error` inside successful
  negative-path payloads. The route tool output truncated at about 23652 tokens, but the complete log and exit-0
  496/496 result were retained and independently reread. Use anchored summary prefixes and a per-line output cap;
  the oracle/graph invocations applied that bound. This is tooling friction, not a product failure.
- Degradation call made: two avoidable read probes plus output-filter recurrence justify finishing this batch,
  saving the checkpoint, and using a fresh session for the release unit. No active worker or gate remains.
- Commit point remains `feat(b119): wire protected callbacks through the X4 UI editor`, gated on the required
  publish/install acceptance and final precommit. Do not stage the unrelated dirty worktree.
