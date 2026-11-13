# AiLive: CodeSense and Forge validation comparison

Owner: existing GitHub #74; related #48/#61/#70. Lane FULL. Status SPECIFIED before execution.

## Plan and acceptance

Run the installed Dev X4CodeSense1.2.0 documented checker as a black box, then Forge's existing standalone validation engine, against the same unchanged authoring files and unpacked9.00 corpus root. Compare diagnostic families, locations and actual overlapping coverage. The live UI report is separate evidence because its exact generated input/hash was not captured. A clean result from a tool lacking a check is not agreement or proof.

CodeSense command: qualified Node, installed Dev extension dist/x4-script-check.js, --unpacked <existing corpus>, --format json --fail-on error <configured AiLive authoring root>. Public installed README/manifest/help were inspected; no implementation read/copied. No --fix, installer, download, MCP listener or IDE configuration change.

Forge command: qualified Node --import tsx scripts/x4validate.ts <same root> --format json --fail-on error. This is the shared project-validation engine, not the changed server entrypoint; game-object index checks are explicitly unavailable in the standalone CLI. Set process-only X4_REFERENCE_ROOT to the same corpus with existing private config/data/state/cache/temp. No registered external project-check scripts or live compile/deploy request.

Acceptance: actual terminal processes, valid complete JSON with explicit coverage/counts; source manifest unchanged before/between/after both runs; checker/runtime/Forge revision and relevant source hashes recorded. Group common XML/schema/cue references separately from Lua/MD bridges and unsupported checks. Retain all findings, including the historical30scriptname baseline; never blanket-ignore them. Nonzero exit1 with valid findings is a completed failing validation, not an infrastructure crash. Exit2, malformed JSON, timeout, changed inputs or output limit are incomplete/failed comparisons.

Bounds: one process at a time, one processor, Node1536MiB old space,300s per engine, stdout16MiB/stderr2MiB; exact owned process/tree cleanup. These are per-run envelopes, no CPU/RAM admission thresholds. Reuse existing QA/runtime/profile and installed CodeSense. Only finite JSON/log/manifest data, no source/mod/runtime/backup/helper copies. Both tools read authoring/corpus files; never touch installed game, saves, live Forge/workspace/profile or other agents. Rollback means ending exact owned children, not resetting files/config.

## Baseline and reconciliation

Source HEAD64545e1 and exactQuality43385017178 green. Native IPC work is independently IN_PROGRESS/uncommitted: core channel46+relay34+host34 controls PASS114; broker60 authored/frozen but unrun; root lifecycle wiring partial, no instrument/real-child/full gates yet. Those source edits are not the comparison's validation-core changes and must be preserved. Source CLI dependency files are pinned. No new test service or duplicate feature owner.

User's Desktop report SHA873d581a62fcf38aa7f07325096d3ef5a08ec9624257229f67ae8b59ddf8a318 contains668findings:150error/39warning/479info. The same43cue references are wrapped twice as cue.unresolved and project.unresolved_cue_ref (identical source tuples), plus64missing-listener findings for56events. Removing exact duplicates predicts107reported errors, not a clean mod.

Read-only configured authoring lookup across35stable MD files found ALL43targets (17distinct) and ALL64literal listeners (56distinct). Source cohort unchanged, no parse failures. Lookup raw69f475be... is not a validation/game run or proof of exact live UI inputs. Hypothesis~90%: incomplete/generated/overridden project context; stale editor snapshot or installed-engine difference remain alternatives.

Source-confirmed separate issues: flat aggregation wraps the same cueIndex facts twice; UI LIVE means last compile scope full-project, not game proof; normal UI compile diagnostics are not persisted by the history flat-only compactor. Do not mutate the mod or suppress diagnostics based on these observations.

## Required close

Record actual commands/runtime hashes/input manifest/source stability/counts/codes/file coverage and limited conclusions in existing QA and this plan. Update #74 and existing Notion QOL/performance records only from measured results. Keep real game, complete #74 parity, other unfinished issues and native tracker qualification separate. Final status remains PARTIAL if any declared method cannot run.

AAR already NON_CLEAN from earlier guessed-path/glob/tool-string failures before mutation; preserve those and bank exact fixes. No Codex memory/skill writes.

## Reconciled execution change — immutable fixture required

First real runs: installedCodeSense completed in16.43s with validJSON/30errors0warnings, exactly invalid mdscript scriptname values,42XML files/36scripts/6patches. Forge sourceCLI completed exit0 in162.03s with0errors40warnings475info, coverage incomplete as declared (no game-object index/registered external gates). Its comparison receipt remains INCOMPLETE because four authoring files changed during the run: md/aic_build.xml and Lua aic_appoint/aic_build/aic_corps_board. Do not upgrade that failed same-input condition or claim a clean complete mod.

Necessary acceptance-method change, SPECIFIED before fixture creation: create exactly ONE temporary validation-input fixture under existing private QA, parent ailive-comparison-fixture, child x4_ai_influence (preserve extension folder name/module identity). Copy only current enumerated XML/Lua/XPL and root rule inputs (~251files/10.2MB), not bridge/runtime/databases/game/corpus/git/backups. Capture current bytes/hashes, verify original cohort stable during capture, then use the SAME immutable fixture and corpus for both tools. Original source may continue changing afterward. No new copy per tool/run. The manifest and reports retain fingerprints, not source bodies.

After terminal reports and post-run fixture checks, verify exact owner/path/tree/hash, then remove ONLY this owned fixture; refuse deletion on unexpected/changed files. Keep finite JSON evidence/reports. This replaces the earlier no-source-copy method because observed concurrent editing prevented identical-input qualification. It is one bounded temporary test input, not a backup/runtime family. User-requested comparison authorizes this reversible isolated fixture; no live writes/permission stall.

Saved-workspace diagnosis strengthened independently: stable08:24 snapshot SHA663088cd6ffcb88475eab9eb2ec52030013b435a212eeb635a556eb2b1f7c2c2 contains17MD files with none of the17targets/56listeners. All43reference callers are in9MDpaths absent from that snapshot; all39Lua files producing64listener rows are absent from its passthrough. Compiler keeps15generated/originalMDpaths then fills only missing diskpaths, mixing old callees/listeners with newer callers. Exact150historical POST body absent; causal confidence~98%, not full runtime/mod proof.

## Actual validation and close — VERIFIED comparison, incomplete mod coverage

Both immutable-fixture runs completed, parsed complete JSON and retained the same manifest, exact file tree, all input hashes, checker/Forge core and relevant corpus-key fingerprints. Full million-file corpus hashing was not claimed. Qualified Node24.22.1, one processor, BelowNormal,1536MiB old space,300s/output bounds; no live HTTP or external project gates. Commands are recorded in the run receipts. The installed Dev CodeSense CLI is the documented checker, not a second product service or an extension-host/UI test.

| Actual method | Result | Evidence in existing private QA root |
| --- | --- | --- |
| CodeSense1.2.0,09:03:59–09:04:15Z | COMPLETED exit1;30errors/0warning/0info;42XML/36scripts/6patches; all30 invalid-attribute-value/mdscript name/scriptname | forge-1113-ailive-codesense-fixture-run.json SHA2487429572592983a058efe30cde16ac4713fe72595dce42bc78393328df2828; stdout0755b5a42c2a38e16901534b181d8320f8035bf1d51a5e7db77ea42da67742e1 |
| Forge CLI,09:07:01–09:08:31Z | COMPLETED exit0;0errors/40warnings/475info; passed/validationOk true, outcome incomplete and coverage.complete false | forge-1113-ailive-forge-fixture-run.json SHAc046cb6f86551c1be8d2b17ff956dd0d94423a474189de77756c51eccc0cd9d3; stdoutd1b20065436fd2ad50c1f0d955d286edfa58dbc1aa85cc882cfe9a2d65ed433b |
| Same-input inverse | First authoring-tree attempt correctly remained INCOMPLETE after4concurrent source edits; no result upgraded | original forge-1113-ailive-forge-run.json and input manifest98de885f... retained |
| Stable fixture |251files/10,166,429bytes, stable original cohort at capture; both post-run exact trees/hashes unchanged | forge-1113-ailive-fixture-manifest.json SHA24e46d070079156ff80d7333f379259b2eea0e41b7f91fa0a9c8caaeaddaeb6f |
| Cleanup | VERIFIED exact absolute containment, ownership, tree and251file hashes; no reparse points; both children terminal; remove only owned fixture, absence confirmed | forge-1113-ailive-fixture-cleanup.json SHA15bd69e86775398bc0913e37eeef90ecfc736eba6cbb1527ff77990fe7ad01b1 |
| Independent read-only review | CLEAN; independently recomputed manifest/stdout hashes, counts/families and evidence boundaries | argument_case_review,2026-11-13; no agent writes or runtime launches |

The30CodeSense findings match the category and count of the reviewed scriptname baseline already documented in#74. This run does not adjudicate those names against the game, establish identical old/new finding locations, or prove that Forge is superior. No other CodeSense error family appeared. Forge's40warnings are all md_lua.payload_writer_unverified, existing#101. Its479coverage gaps are204Lua scope,204UI,41truncated UI,17MD context,7Lua-to-MD emit,3MD-to-Lua registration and one each references/jobs/wares vocabulary. The CLI lacks the backend game-object index and did not invoke project-registered gates. Zero errors is not complete mod validation, deploy, installed-product, Lua runtime or game proof.

Aggregate: forge-1113-ailive-comparison.json SHA89ba8250b699bd49100f7deea236014d2ff9142e35f5d91814bfc842c93d8ac0. Retained comparison data12files/1,134,377bytes; temporary10,166,429-byte fixture removed, no helper/runtime/backup copy retained. Original source/live draft/game/config were never written. Measured wall times15.89s/89.19s have different coverage and uncontrolled cache/shared-machine conditions; no speed/FPS/collector-overhead conclusion.

Review: requested same-input comparison done and evidenced. Historical150-input replay deliberately not substituted: its exact POST body is absent. Source-confirmed43duplicate aliases and mixed-age saved-input mechanism are recorded;98% causal inference remains distinct from reproduced source facts. No blanket false-positive claim, draft overwrite or automatic reimport. Duplicate repair/provenance/passive diagnostics retrieval are deferred under existing#74/#48, not implemented in this unit. No capability-map delta; no executable behavior changed by this task.

Public projection: [GitHub#74 comparison](https://github.com/KennyG1990/X4_Forge/issues/74#issuecomment-6849009753). Existing Notion QOL, tracker qualification and#61 board page updated; no new Agent Board row because21already exceed its20-row policy. Existing Awaiting/Claude fixture handoff preserved. Parent#74/#48/#61/#109/#103 remain open. Comparison is VERIFIED; full mod clearance remains INCOMPLETE. Existing native IPC edits remain uncommitted and partially tested, outside this unit. Commit point: docs(validation): record AiLive same-input CodeSense comparison [skip discord]; no claim of a new commit or push.

### AAR — NON_CLEAN

Sustain: public documented black-box checker; explicit scope/coverage; serial bounded processes; source/hash-bound input and exact ownership cleanup; independent output review. Preserve the failed first comparison rather than upgrading it.

Improve work/approach: ongoing authoring invalidated the first same-input contract; revise acceptance before making one bounded temporary snapshot, then remove it. Treat displayed draft validation and current disk validation as distinct inputs. Snapshot age alone was insufficient; actual missing definitions plus compiler composition supplied the causal evidence.

Improve tools: repeated oversized diagnostic/Notion reads wasted context; select only schema/counts/family aggregates, not coverage arrays or duplicate structured/content bodies. Read-only review also retained a PowerShell pipe parse error before correction. No failure changed source or reports. Native implementation must resume from a fresh checkpoint, not from degraded context. Board capacity is already exceeded; this task adds no row or unrequested deletion.

Highest-risk evidenced weakness: LIVE validation lacks clear draft/disk provenance while duplicate wrappers inflate counts. Bounded follow-up: canonicalize only the shared-index alias for the exact occurrence, preserve location/role/other errors, expose passive exact-result identity and draft drift without overwriting work. Existing paired test currently expects both aliases and requires deliberate correction with negative controls. Canonical project AAR records this result; no Codex memory/skill write.
