# B119 actual authoring CPU profile

Lane FULL. Status PARTIAL. Previous and current goal turns PROGRESS; full goal remains ACTIVE/PARTIAL.

## Plan / baseline / reconciliation

Bounded unit: identify the actual main-thread owner of repeated~6s Add Text/property Apply stalls in
the genuine-corpus Lua file journey. First add opt-in Chromium CPU sampling to that existing test's
fixture only, run unchanged journey, inspect actual stacks, then document a repair plan if justified.
No speculative production change, mock corpus, new renderer/history/deployer or UI timeout increase.
Files: tests/e2e/x4-ui-source-editor.spec.ts; this plan, BACKLOG.md, SESSION-HANDOFF.md; ignored evidence
under test-results/b119-authoring-cpu-20260912/. Reuse existing matched Playwright/CDP and run-e2e.
CPU capture is process-local opt-in X4_FORGE_B119_CPU_PROFILE=1; default test behavior stays unchanged.
Fixture owns CDP enable/start/stop/detach and attaches profile before page teardown, including red test.
No new dependencies, endpoint, remote service, spend, installed config or real game/mod writes.

Baseline: baseline.json contains HEAD, pre-existing dirty status,38source/harness hashes,19persistent
file hashes, guard roots and port owners.3200/3201free,3100Deckwright30164,no games or live test runner.
Snapshot exact spec before instrumentation. Preserve all unrelated edits/deletions. Rollback only
owned instrumentation against snapshot, never reset/restore a dirty file wholesale.

Reconcile: graph extracted direct SourceEditor->EditorSession import; actual production memo/session
owners exist. Search tests/e2e,scripts,SourceEditor/EditorSession found longtask instrumentation and
newCDPSession in continuous-polling.spec.ts, but no CPU profiler start/stop capture helper. Use standard
CDP Profiler API supported by installed protocol types, not another browser/process owner. History
recall returned weak unrelated matches; current actual traces govern. ADR-F1/F2 and existing capability
map require preserving CAS/source truth and usable first success. No capability-map delta.
Original brief and approved canvas-first contract re-read; bitmap/corpus corrections supersede old
TTF/12-column guesses. All9journeys/3menus/12reference obligations remain intact.

Acceptance: real .cpuprofile with samples/time deltas and source function locations, diagnostic run
retains original60s interaction deadline, retry1/zero-flake policy, all source/workspace/history checks.
Profile is diagnostic and may add overhead; do not use it alone as a latency acceptance result.
Negative paths: flag absent starts no profiler; failed/timed-out test still captures or explicitly fails
capture, never claims success without profile; CDP teardown always attempted before page disposal.
Validation: whole tsc, strict touched lint, matched14-test discovery; actual single Lua journey via
run-e2e3200/3201 serial with real corpus and opt-in profile. Inspect samples and screenshot/trace; pin
inputs throughout run; afterwards verify persistent hashes plus additions/deletions, owned process
tree and ports gone, protected3100 unchanged. Exact diff review and graph refresh at close.
Native/installed/full parity gates remain unavailable in this bounded diagnostic unit, not waived.

Execution: write instrumentation, static gates, frozen actual run, evidence-based hot-stack analysis.
If profile identifies a required product repair, amend this plan with exact owner/negative/rollback
criteria before code changes or create the next bounded plan; no guessed optimization.
Current record and AAR will distinguish diagnostic evidence from completed authoring proof.

## Measured finding and repair amendment — 09:00Z

Profile run08:54:49..08:57:32: FAILED0/1,0flakes, clean structured lifecycle/treeGone. Both attempts
captured actual profiles despite timeout. First capture has9061samples/13.887s; navigation resets
the CDP recording, so these are final-document segments, NOT complete60s traces. Both segments show
authorityPayloadsUnchanged's per-byte callback as hottest application self time (2982/3046ms).
Actual source src/lib/x4UiCorpusAssets.ts512 uses Uint8Array.every with one JS callback per byte.
isX4UiCorpusCanonicalSuccess repeatedly invokes this guard through SourceEditor/Session/Pipeline.
This identifies a concrete expensive owner, not yet a proven speedup or the only remaining bottleneck.
Correctness checkpoints now include authored/save/export and first-attempt original reload; timeout
occurs at independent-workspace creation. No product code changed to achieve these diagnostic checkpoints.
after-profile.json preserves38input/19guard stability and cleanup; two new repair-owner hashes added.

Amend bounded scope to src/lib/x4UiCorpusAssets.ts and its selftest. Replace only payload comparison
with an indexed loop over the private snapshot's full byte length. Check current length first; compare
every byte on every call; stop on first difference. Keep private WeakMap registration, frozen graph,
hash/loader provenance, color graph checks and every caller unchanged. No authority cache or hash shortcut.
Extend existing mutation tests with first/middle/last-byte mutation/restoration across all8payloads,
and a caller-overridden every method cannot hide a changed byte. The latter is a fail-first regression
for the old callback-dispatch implementation, not a replacement source/geometry oracle.
Risk: accidentally skipping bytes or accepting changed buffers. Negative matrix and old-vs-new test
control govern; use private snapshot length for the loop bound. Rollback exact owned function only.
Validation additions: original full CorpusAssets selftest baseline; added guard tests red on old owner,
then full suite green; whole tsc and strict3owner lint; full SourceEditor/session/pipeline suites;
normal unprofiled Lua browser journey with same deadline and full original assertions, actual screenshot
inspection, refreshed40pins and persistent/cleanup guards. If another failure remains, report PARTIAL.
Profile recording is retained opt-in only; instrumentation-disabled normal run must not attach a profile.
All numeric/native/full-goal obligations remain open. No capability-map delta; no external/standing writes.

Repair static/focused results: old CorpusAssets39/39, added matrix40/41 on original production owner
(only overridden-every forgery fails), indexed loop41/41. Session and full SourceEditor pass; whole
tsc/strict3lint pass. Pipeline123/124 fails the existing exact deployed fixture six-creator geometry
case. Amend baseline validation: with all validators terminal, temporarily restore only the original
comparison function, verify full-file baseline hash, rerun pipeline, compare its failed case/detail,
then restore indexed-loop bytes and rerun. This tests causality; do not remove or weaken geometry checks.

## Final validation / review / close — 2026-09-12 09:12Z

Implemented: opt-in CDP profile in existing single Lua fixture; one production comparison loop and
two guard test cases. No other product owner changed. Exact source snapshots and before/after hashes
are in the evidence directory. Corpus source final SHA256:
67B88B37E141AE8052DB0A730A98D0EF4A5B1D379A697FFAFDDA932DF000A592.

- Corpus baseline39/39 PASS0 at09:00:31. Added tests on old production40/41 FAILED at09:01:10,
  solely the replaced-every forgery. Indexed loop41/41 PASS0 at09:01:45 and09:04:44.
- Full EditorSession PASS0 at09:01:57; full SourceEditor PASS0 at09:02:41 (all async9/9,
  selection/ack9/9,input6/6,export6/6,New-menu25/25,history/other regressions reached).
- Whole tsc09:02:58..09:03:30 PASS0; strict3owner lint09:03:09..09:03:11 PASS0.
  Matched14-test discovery and existing path negatives PASS0. Initial lint mistook fixture use()
  for React use inside try/finally; renamed callback runTest, no rule suppressed.
- Pipeline123/124 FAILED on new owner, then identical123/124 on exact restored original hash
  FFC90BE312FFC3ACA728C039A00F6FE410F291EFBC49C3DF6D9775E24606D818 at09:04:09, then same result on
  byte-restored repair at09:04:44. Failed case/detail JSON exactly equal in all three runs:
  B119 fail-first exact deployed fixture source-proven geometry reaches six Scene/Paint creators
  at both profiles. This is a reproduced pre-existing gate, not a reason to weaken it or claim green.
- Unprofiled real Lua journey09:05:20..09:07:32 FAILED0passed/1failed/0flakes, both attempts terminal.
  No CPU attachment in either attempt; full60s/retry1/zero-flake and every source/history oracle kept.
  Actual Add Text1244.170/1100.337ms; Apply1191.724/1030.350ms versus prior unprofiled6111/6121ms.
  About5x faster measured clicks, NOT a claim of whole-app5x or completed instantaneous authoring.
- Both attempts pass New menu/add/edit/exact local+server save/export/original reload, including exact
  source, hierarchy, native RGBA and profile preservation. Both now fail the explicit empty-independent
  workspace canvas-null assertion: source/target/hierarchy empty but prior canvas has8931opaque pixels,
  signature rgba-fnv1a-v1:2560x1440:a4915ab5. Later import/history/collision steps remain unreached.
- Visually inspected normal-independent-workspace-final.jpeg: old menu is still visible at small fit
  scale in the new empty workspace, honestly labelled stale; not falsely rendered/current. SourceEditor
  adopt() classifies refusal against previous canvas state, and EditorSession intentionally retains
  that surface. Workspace identity is not part of this retention decision. Preserve same-workspace
  stale recovery; next bounded unit must clear old surface/receipt/export identity on workspace switch.
- Manual complete3owner diff reviewed; whitespace PASS0. reviewctl and configured BlastRadius path
  unavailable, so no automated review claim. Actual static/negative/runtime gates plus manual review.
- Graph refresh09:10:11..09:11:07 PASS0:11519nodes/29027edges/349communities, deterministic AST/no LLM,
  HTML5000 limit retained. Source pins unchanged after refresh at09:11:37.
- after-normal.json09:10:07:39deduplicated input pins (one additional selftest, not anticipated40),
  19persistent guards unchanged; no added/deleted guard files;3200/3201closed,3100still30164,
  HEAD unchanged. Both runner lifecycles complete/ownership/treeGone/no remaining PIDs/no kills.

PARTIAL: targeted performance and byte-integrity repair evidenced; required complete Lua journey and
full pipeline gate still red. No release/install/native/real mod/config/Git/push/issue/wiki/global
memory writes. No capability-map delta; existing authority semantics retained/strengthened locally.
Suggested eventual commit title:perf(b119): compare corpus payloads without per-byte callbacks.
Receipt:test-results/b119-authoring-cpu-20260912/receipt.json. Next: workspace-scoped canvas lifetime;
pipeline fixture geometry remains separately required. All9journeys/3menus/12reference/numeric/scenarios/
fullE2E/precommit/package/installed/native obligations stay open.

## AAR

Triggered: measured plan amendment, lint false positive, weak history hit, missing nested package path,
oversized diagnostic output, profile reset across navigation, added red regression, existing pipeline
failure and restored-original comparison, rendered failure moved to a newly reached workspace boundary.
Sustain: profile actual code before optimizing; preserve full-byte checks and prove tamper rejection;
use unprofiled rendered measurements and exact original-source counterfactual for regression causality.
Improve approach: CPU recording resets on navigation, so label captured document segment, not full
journey. New test progression is not full completion. Retain failed gate evidence and original assertions.
Improve tools: avoid raw tail of single-line JSON and broad process command dumps; parse named summary
fields only. Missing review utilities recorded as unavailable. Analyzer includes weighted-total/ancestry
positive controls and empty-profile rejection; never treats missing samples as an empty success.
Highest-risk newly exposed weakness: stale canvas retained across independent workspace ownership;
old menu remains visible despite empty current source. Bounded fix must clear only cross-workspace
presentation/receipt state while preserving deliberate same-workspace stale recovery and export guards.
Lessons banked here and in the repo handoff; no global memory or external ledger write.
