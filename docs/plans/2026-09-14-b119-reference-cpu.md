# B119 isolated reference-refresh CPU measurement

Status: PARTIAL. Direct loader CPU measurement VERIFIED; HTTP CPU target missed;
rendered run FAILED/non-clean (1flaky). Lane FULL. Full B119 remains PARTIAL.
Goal: measure the existing real-MENU reference refresh without changing its implementation,
corpus, fixture, request deadline or assertions. This supports the complete canvas-first goal.
Architecture: reuse the process-local inspector recorder and guarded E2E checkpoint wrapper;
do not add a production endpoint, inspector port or alternative runner.
Tech stack: Node inspector/perf_hooks, existing Playwright and isolated Forge API on3201.

## Baseline / reconcile / acceptance

HEAD5b730a67774516d44b9fff4f4b640b4113ade9ac. Preserve all existing dirty work.
References: full goal and original brief, approved canvas-first product contract, current
handoff/backlog, reference-status diagnosis, Graphify getReferenceCorpus call edges and
current source imports. Older recall returned an unrelated performance conversation and
is not causal evidence. No capability-map delta. No product implementation is authorized
by the historical timeout alone.

Existing recorder: F:/DEV_ENV/X4_Forge/test-results/b119-validation-latency-20260913/api-profile.mjs.
Existing wrapper: F:/DEV_ENV/X4_Forge/test-results/b119-workspace-abort-20260914/checkpoint.mjs.
Recorder uses a local inspector session, not a listening port. Its24x15s window would end
before cold reference indexing completes. Its request list currently drops still-pending
requests at each interval; retain those until finish so a long request is not lost.
Selected sampling approach identifies actual function stacks without adding phase wrappers
to application code. Alternative: production timing hooks (more source impact); client-only
timing (already insufficient). No claim of request admission delay before server receipt.

Owned files: new api-profile.mjs, probe-selftest.mjs and checkpoint.mjs under
F:/DEV_ENV/X4_Forge/test-results/b119-reference-cpu-20260914/; this plan and handoff/backlog.
Post-run analysis also owns analyze.mjs in that evidence directory, reading completed CPU
and request slices and writing a new summary. It does not run in or modify the tested stack.
No existing executable file edits. Fresh evidence only; no overwrite of earlier artifacts.
Reused wrapper freezes all410 source/config inputs plus new recorder/selftest/wrapper,
source membership,50 protected artifacts,4 real Lua sources and19 live/config/install files.
It requires X4 absent and3200/3201 free, retains existing3100, and verifies owned tree cleanup.
No external mod/game/config/cache reuse, Git commit/push, publication/install or wiki writes.
Rollback: remove only newly owned evidence scripts after review if rejected; preserve prior work.

## Batch steps / verification

1. Retarget recorder into fresh cpu/ evidence; require explicit opt-in as well as original
   API_ONLY/3201/ephemeral-state/server.ts gates. Extend64x15s window. Record refresh boolean
   (not query/header/body); retain unfinished request records across slices.
2. Test the actual recorder body with injected dependencies: default/wrong gate causes no
   writes or interception; original emit receiver/arguments/return/error preserved; completed
   and pending request timing retained; output rooted in fresh evidence with wx;64-slice
   bound; no inspector network opening. Run native inspector enable/start/stop smoke too.
3. Copy wrapper by exact mechanical adaptation: fresh root, no mutable source owners,
   new evidence-script pins, all old guards retained; opt-in only for profile label.
4. Run node --check on all3 scripts; probe-selftest; guarded baseline/check.
5. Audit selected E2E test and all direct writer destinations; run unchanged real MENU
   journey once with standard retry policy, trace on,3200/3201/workers1. Machine quiet was
   explicitly authorized; recheck game/ports before launch. No desktop input.
6. Inspect verdict/guards/cleanup, actual CPU/request records and rendered screenshots.
   Report inclusive versus self sample cost, GC/idle and profiler overhead limitations.
   If original timeout does not recur, this is measured present-run cost, not repaired cause.

Command from F:/DEV_ENV/X4_Forge with bundled Node:
checkpoint.mjs run profile scripts/run-e2e.mjs tests/e2e/x4-ui-source-editor.spec.ts
--project=chromium --workers=1 --grep <exact real-MENU journey title> --trace=on
--output test-results/b119-reference-cpu-20260914/browser

Acceptance: trustworthy server profiles tied to request timing and exact frozen input set;
unchanged original test result reported honestly; no new native/package/full-suite claim.
Negative paths: inactive gate, thrown underlying emit, pending request across slice,
write collision, cleanup or guard failure must not become a green evidence claim.
Required evidence: probe result, baseline/receipt/log, cpu slices and analysis, original
rendered artifacts. If the process ends before the last15s flush, name missing tail coverage.
AAR/close populated after execution. No source-behavior fix in this batch.

## Reconciled recovery measurement — SPECIFIED 11:56Z

Profile run terminal exit1 at11:53:50.235Z, complete1-test verdict0pass/0fail/1flaky;
first attempt failed600000ms manifest preparation, retry completed the visual journey.
All413pins/guardsPASS, treeGone=true; API35016 and wrapper child32616 absent;3200/3201 free.
64 CPU slices/no recorder errors, but cutoff11:51:39Z preceded forced refresh. The targeted
CPU acceptance is FAILED/missing, not satisfied by startup getReferenceCorpus samples.

Reconciliation changes the measurement, not product scope: directly call unchanged
getReferenceCorpus(root,true) with a copy of this completed run's owned temporary index.
No second full scan, server, HTTP route or browser run. This gives loader-phase CPU evidence,
NOT HTTP admission/queueing proof or a reproduction of the original timeout.

New owned script: F:/DEV_ENV/X4_Forge/test-results/b119-reference-cpu-20260914/direct-profile.mjs.
Source snapshot is specifically C:/Users/Moshi/AppData/Local/Temp/x4forge-e2e-state-72048/data/reference-manifest/
index.db (155033600bytes), index.db-wal (5562032bytes). Both processes are confirmed gone.
Copy DB+WAL, not SHM, with exclusive creation into a newly created repository-local direct-state/
data/reference-manifest. Read/hash source DB/WAL/SHM before and after; never open source DB
through SQLite or write it. Own copy may recover its WAL/create SHM normally. Pin exact generation
1789385765401-dcfb2acdcb, ready state/root and1,028,384files before measuring. No stale cross-run seed.
All state/config/data/cache environment paths target fresh direct-state before dynamic import.
Use existing manifestDb/openStudioDb schema and actual corpus loader; no query/parser substitute.
Take native CPU profiles around two forced loads, compare semantic corpus fingerprints ignoring
generatedAt, and fail on mismatch. First/second are observations, not a benchmark or HTTP gate.
Afterward verify source DB/WAL/SHM bytes and all prior protected pins; write exclusive direct.json.
No application code/fixture/deadline change, no new external writes. This is an evidence-only
repair of the recorder-window failure. Preserve original failed artifacts and limits.

## Results / review / close — 2026-09-14 11:59Z

- Recorder actual-body checks22/22 and native inspector smoke PASS; syntax checks PASS.
  Probe session46599 terminal0. Original recorder adaptation independently reread; only
  opt-in gate, fresh output root, refresh boolean, pending retention and64-slice limit changed.
- Profile run session45430 terminal1:11:34:51.747Z–11:53:50.235Z. One discovered/terminal
  real-MENU case,0passed/0failed/1flaky,0global report errors. First attempt setup predicate
  exceeded600000ms; retry passed. The whole invocation remains FAILED, not green.
- Manifest generation1789385765401-dcfb2acdcb:11:36:05.401Z–11:52:10.991Z,
  1,028,384files/33,206,154,495bytes (~966s versus prior unprofiled~438s).
  Attribution of slowdown to profiling, filesystem cache, contention or other effects is
  unproven. Do not call a regression from these uncontrolled runs.
- Retry trace0-trace.trace: initial status2753.203ms HTTP200; forced refresh3610.708ms
  HTTP200. CPU recorder final slice35016-063.json at11:51:39.070Z preceded that request.
  analysis.json validates64 slices/no recorder errors/zero captured refreshes. HTTP CPU
  target is missing; do not substitute startup samples. Analyzer runtime lines are transformed.
- Retry real-MENU edit/reopen assertions passed unchanged. Main agent inspected real-MENU-edited.png
  and real-MENU-reopened-focused.png: TRANSMIT displayed and selected at100% preview,
  source canvas current, unsupported regions still marked partial and gameVerified=false.
  Visible validation errors/long-frame HUD remain; not full mod validation or smooth-UX proof.
- Completed cleanup: treeGone=true, no remaining owned PIDs, all413pins/50protectedartifacts/
  4realLua/19livefiles/membership preserved; only prior3100/PID54964 retained. No X4.
- Direct snapshot is a separate successful measurement, not a reclassification of that run.
  direct-profile.mjs syntax checked, session19023 terminal0. Copies of exact stopped-run
  DB/WAL inside direct-state matched source bytes before use; original DB/WAL/SHM hashes
  unchanged afterward. State/data/config/cache roots were isolated; ready generation/root/
  file count matched. All413 earlier inputs remained unchanged.
- Two actual getReferenceCorpus(root,true) calls:1142.659/1049.307ms;383source files,
  32factions/1902wares/178AI scripts. Semantic SHA256 identical:
  d3f6b15972b0aa960b09a37aafbed717f9109da876c1bd22d932ae8f17aa956a.
  direct.json records source snapshot hashes and both observations. direct-first/second.cpuprofile
  retain original profiles; direct-analyze.mjs (also owned evidence script) writes direct-analysis.json.
- Sampled inclusive getReferenceCorpus1099.399/1015.950ms. buildCorpus708/650ms,
  discoverReferenceFiles377/354ms, signatureFor12/12ms (rounded). Discovery contains
  SQLite349/338ms; parsing includes nested XML work. Never sum overlapping inclusive rows.
  Samples exclude unattributed/GC intervals and are estimates, not exact wall-clock phase timers.

Review: no evidence supports changing cache correctness, refresh semantics or10000ms deadline.
Direct cost~1.1s and retry HTTP3.61s do not explain the old10s timeout; contention/queueing/
variable IO remains a hypothesis. Keep the original failure and workspace cancellation open.
No new application/test-body changes, full-suite verdict, commit/push/release/install/native
proof, external wiki or memory writes. No capability-map delta.

Next goal unit: return to the unchanged full integration gate with current renderer repair
and retained workspace-abort observation, profiling off. Reconcile all writers/inputs and
machine state first. A clean full run is required; do not substitute another focused pass.
If reference timeout recurs, capture request-triggered server CPU (tested first), not another
startup-bounded recording. The preserved stopped-run snapshot permits direct loader diagnosis
without repeating a million-file scan, but is not an E2E fixture bypass.

AAR triggered: cold-index timeout, insufficient recording window, patch/path/output friction.
Sustain exact probe transparency checks, protected-byte guards and deterministic non-clean
verdict. Improve approach: bound recording around the target event rather than assuming cold
setup duration; build the stopped-snapshot direct experiment before paying repeated scan cost.
Highest-risk observed weakness: the600s index preparation can fail before authoring under
this measurement environment. Keep that failure visible; any preparation/loader repair needs
its own evidence, not wider deadlines or smaller corpus. Optional reviewctl/rules/BlastRadius
unavailable; direct diff review and actual-code/native tests performed instead. No installation.
Commit point: docs(b119): measure reference loader without weakening gates (not committed).

Pre-run2026-09-14 11:34Z: all3 node --check commands exit0; extracted actual-recorder
probe22 checks PASS including native inspector. Baseline413pins,50protectedartifacts,
4realLua/19livefiles and membership guardsPASS; X4 absent, only3100/PID54964 listening.
Selected real-MENU writers reviewed: screenshots, camera JSON, checkpoint JSON and both
download directories use test.info().outputPath; actual mod Lua is read/hash checked only.
Browser CPU/workspace trace disabled; API-only recorder uses fresh cpu/ with exclusive
writes. Existing Vite/global setup and runner remain unchanged. Exact grep:
`SourceEditor visually edits and reopens real MENU Lua`.
Tool AAR: one guessed harness-path read and one rejected patch-context match; corrected
using actual config/imports and readback. Failed patch did not create the selftest; verified
absence before adding it. URL construction uses node:url pathToFileURL, not manual escaping.
