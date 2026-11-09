# X4 Forge Dev handoff — 0.0.82 qualification failed; bounded test repair next

Project: isolated X4 Forge development, never the live AiLive/Forge/X4 setup.0.0.82 delivery is first; do not add another backlog feature before this milestone. Dev is detached and contains more than the curated release; never push this entire history as the release source.

## Current state

- Last committed checkpoint0ab3a1a272e2ca1c34fc9a8dae03b160fd508aca recorded storage guard/cleanup; its normal precommit passed. This checkpoint records actual qualification failure and the next SPECIFIED repair in docs/plans/2026-11-09-forge-082-capacity-recovery.md.
- Current product checkpoint f9977c5271798a422df173f3c23a6993c64a8a1f preserves explicit translation filenames. Dev also includes ff9d289 Lua text checks (#93), which remain excluded from0.0.82.
- No known backend/build/test tool handle is active; the ownership evidence gap remains. Provision16344 passed; full source-gates15524 failed; cleanup73137 and prior commit64215 are terminal. Do not poll or restart them as live jobs.
- Source5ad377cea253d048eda18ed4ea22dede4f1d8cbf remains902 files/37 release-delta paths. It is unqualified, not publishable. No0.0.82 VSIX/package attempt or success source-gate receipt exists.

## Reproduced failures and next unit

Full isolated source run passed precommit,509/509 route checks,134/134 runtime oracles. Production server SHA a4e4b02941394671237b56a290dc272e90a4a04b6568e2b16cae851d664fddbf. Full E2E119 passed/1 failed/0 flaky,120 total in19.3minutes.

1. C03 tests/e2e/warning-review-reuse.spec.ts sends an operation header with a minted agent key but its identity helper still sends only four preview fields. Forge correctly refuses missing expectedTargetFingerprint before target writes. Add the real preview fingerprint and a negative test that omission still refuses without persisting approval. Preserve all existing reuse/provenance/invalidation/rendered-revocation assertions and any applicable preview-supplied project-check proof. Do not port the unrelated Dev-only UI-confirmation hunk into the selected release.
2. Lifecycle ownershipComplete:false is an independent failure. Termination says complete/treeGone true,commandedPids empty,remainingPids empty.14 reused PIDs were observed, but source review proves valid reuse is already supported. The actual sticky sampler/control failure reason was discarded. First add bounded phase/code/counters to the existing monitor/log; keep all fail-closed behavior. Do not simply ignore reused PIDs, clear errors, increase timeouts or loosen the gate. Existing taskkill rechecks are not an atomic retained-handle guarantee.
3. Python's cp1252 stdout failed to print Unicode failure details. Set PYTHONUTF8=1 in the next launcher process; do not create another wrapper/helper family.

The complete next acceptance contract and read-only findings are in the capacity recovery record. No implementation yet. Investigators: capacity_guard (C03 contract, complete) and release_reconcile (lifecycle missing diagnostics, complete). Use a fresh bounded unit after this degradation checkpoint: root made two avoidable lookup errors; no code write resulted. First command: git -C this Dev root status --short, then read the plan's Full-source result and next bounded repair section.

## Exact owned paths/evidence

DEV = C:/Users/Moshi/.codex/worktrees/forge-a15-native-proof/X4_Forge
QA = C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2
Current candidate = C:/fqa-r82-5ad377c (preserve its physical dependencies; no new full copy)
Failed source evidence = QA/r82g-5ad3-95ed4wda
Compact failed verdict = that directory/e2e-verdict-failed.json,5614bytes,SHA c64dbea1ac589517adaa33a2afedb84e62905f365429d1287ecd4ea792cbaecd.

Four designated ports43232/43235/43236/43237 independently bind after shutdown. Source gate lock and combined success receipt are absent. This does not repair the incomplete lifecycle proof. Retain the current failure's useful trace/log until fixed; clean disposable state afterward.

Actual provisioning passed: QA/forge-082-5ad377c-provision-v2-zhrqfzot/verdict.json SHA0c55fd184176e3647da76fd863281f112e2c0ae253829b2b444c126bec4881f3. F: compact terminal SHA3bd120d44893ad4feb5dbd0b483c4ef991969319434690714d731ccbeae32fd0. Source902 verified; donor before/after both d0319ef7...; exact required packages present;29994 terminal capacity checks/minimum25041866752bytes free. No native/package code ran in preparation. Guard ab3b723f... controls19/19. The old unguarded a523 provisioner must not be rerun.

Current archive QA/forge-082-5ad377c-source.zip SHA6eb52e585be3b382ac00576c89b8e7d52f68d12b0aacf55ca272f97394a97d6b; manifest64bf0f561c4e4f98f8ed24bd7b300601197df22d3164646d1dbe77713614a019. Existing source-gates and qualification-v2 preserve every source/package/byte/runtime-lock/receipt/Steam/rollback/physical-target/filename gate. Reconcile one current repin after the combined test/harness correction; no new backup tree/helper family. Never label the old failed source as green.

## Authorization and isolation

The user's explicit Yes, run the full headless release checks persists. No extra quiet-window approval is required. Latest board state HELD520 at2026-11-09T21:47:14UTC means live work is active, not quiet. All root tests remain headless/serial/private; no computer use, live install/restart, game input, save or live config writes. Machine-state-confirmed records that known state plus existing permission. Public last verified0.0.81/main f76775f02dbd8c61a100233e9d11d659f7a5d39b; recheck before publication. Qualified Open VSX/GitHub releases are authorized, with store verification before release commit/push. Only this Dev worktree is attached; use create_worktree if a fresh curated release checkout is necessary, then retire it after use.

## Storage and cleanup

Ken made footprint a priority. Audited cleanup exit0 reduced QA7.346GB/373457files to2.039GB/49472files and removed two obsolete C: roots totaling1.962GB. Combined observed footprint9.308GB became2.398GB including a growing current359MB copy at21:38:50UTC; do not equate all drive changes with deleted bytes. Thirteen historical/result files stayed hash-identical. No cleanup backup/archive/helper was created. Old expanded sources/ZIPs are gone: do not recreate them just because historical paths appear in old receipts.

Keep one current release candidate and compact results, then retire its disposable stage/install/profile state after consumers finish. Preserve three required historical files under QA/forge-operation-recovery-source/sidecar-discovery-audit/vscode-extension (out/sidecar-supervisor.js,app/dist/server.cjs,app/package-lock.json), the three-file71feb4b oracle mod and steam-adopt baseline report. Current manual source backend QA/lua86-integrated/dist/server-5ad377c-filename.cjs48a9... is historical source proof, not the newly built a4e4... package. Its older dependency copies were removed deliberately; do not restore full installations merely for historical replay. Review remaining generated binaries/caches after qualification. No live/user/other-agent cleanup.

## Claude/experience queue

Existing #53 standalone nested-transaction payload is QA/forge-x4-nested-transaction-oracle-1109. Manifest eddcccfd858c2be07b304a3c15a8c3799149b58dab1a8a9c1a0385725d24af77 and all4 source hashes were reverified. READY discussion comment4134618e-d15b-8163-b744-001dd1a0648b; fresh reminder4134618e-d15b-81ce-89e2-001d5e1acab5. Board has15 rows, so no duplicate row was added. Claude alone cold-starts a disposable session, records direct control marker/no nested activation, exact hashes/build/fresh logs, then cleans up. Pending, not verified.

#93/#94 Windows X4 engine witnesses are already VERIFIED with explicit language/platform/campaign-load limits; see their plans and GitHub comments6749647913/6749648490. No rerun requested; #93 excluded. Remaining installed/experience checks stay PARTIAL: #81 finding/location/count presentation, #53 actual IDE restart/client adoption and nested X4 discovery, AgentBridge/#92 rendered cleanup/adoption states, #94 installed translation regression. Follow their recorded click-by-click scripts only when an exact qualified VSIX is available; none is ready now. Do not close full feature issues from source/package evidence. PUBLISHING and the latest selected release contracts distinguish qualified headless delivery from these remaining full-feature gates; the older transaction selection wording is reconciled in the current plan.

Notion QOL and GitHub#53 contain the storage results; update with actual qualification failure. Canonical AAR ledgers already record storage admission/retention; bank this new gate/diagnostic failure at this checkpoint. No capability-map delta. Normal commit hook remains mandatory; no detached Dev history push.
