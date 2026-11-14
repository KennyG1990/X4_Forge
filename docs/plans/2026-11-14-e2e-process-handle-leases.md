# E2E process HANDLE lifetime — #112 under #20

Status: IN_PROGRESS / PARTIAL. Plan recorded SPECIFIED before implementation. Date: 2026-11-14. Baseline: 084e64c5df6d49cfc174e686413f098c1e7c4394.
Prerequisite for #109 rendered qualification. #104 namespace identity and #70 MD purpose are separate owners.

## PLAN — Full lane

Bounded program: retain original Windows process identity through dependency cleanup, extending the existing lifecycle/runner owners. No borrowed Playwright/Koffi edits, cleanup suppression, test/retry changes, new executable file, runner, runtime, or profile family.

Unit1: INACTIVE synchronous HANDLE-retention primitive in scripts/e2e-runner-lifecycle.mjs, permanent cases in its existing selftest, actual isolated Windows proof. Preload/runner integration remains a required later unit. Unit1 alone cannot admit mounted tests or close #112/#109.

References: installed Playwright1.61.0; upstream stable1.65.1 packages/utils/processLauncher.ts; exact Node24.22.1 internal child_process and bundled Windows libuv; Microsoft process HANDLE/PID lifetime docs. Explicit-C-cwd escalated native reads govern; demonstrated stale sandbox reads do not.

In scope: original call/this/arguments/return/throw preservation, synchronous acquisition before caller yields, ordinary no-PID failure preservation, exact-child retirement on acquisition refusal, deterministic latched failure callback, capacity refusal BEFORE spawning, per-child idempotence, immutable counters, and retention until actual owning process destruction. No early close API. Later integration must prove the actual ChildProcess.prototype.spawn chokepoint covers spawn/fork/internal launches.

Out of unit1: automatic hooks/preloads, native loading on import, product APIs/config/schema/dependencies, process scans, arbitrary-PID kills, source UI/installed/compiled/game/release claims. No live/default Forge/AiLive/game/save/config/credential writes.

Resource/risk contract: at most4096 retained HANDLEs per owner; report retained count, refuse before another launch, no timers/polling. Native rights query-only, inheritance false. If acquisition fails after creation, retire that exact child using its still-valid original ownership before throwing. Mandatory failure callback is NOT yet the runner verdict channel. OS retires HANDLEs at owner destruction; do not release in an early exit listener.

Rollback: inverse only this unit's exact two source deltas to baseline3b05099e/153f05cd. Preserve pre-existing dirty documents and protected Collection11 BATCH230a. Never broad reset/clean/stage or modify borrowed files.

Acceptance / validation:

1. Ordinary import remains inert: no prototype/process/config/filesystem mutation or Koffi loading.
2. All original lifecycle tests remain and pass. Added behavioral negatives cover acquisition-before-return, exited/closed child retention, same-child idempotence, no-PID/original throw, cap-before-spawn, native null/throw, exact retirement, retirement/report failure, permanent failure latch. No unleased success.
3. Actual serial Windows Job proof: owned root exits while descendant holds its streams; retained query HANDLE identifies the original exited root before and after close. No PID-reuse stress/taskkill experiment.
4. Actual acquisition refusal retires exactly the newly-created fixture; explicit failure state, EOF and owned tree retirement proven.
5. Frozen source/dependency/private-Dev/standing-Git guards pass except the two declared source deltas. Use existing oneCPU/BelowNormal/512MiB90s focused and1536MiB300s normal owner. No fixed RAM/CPU admission gate. Finite flat QA JSON/recipe only, no helper/runtime copies.
6. Current normal precommit, unchanged mandatory hook, scoped commit/push parity and exact-head CI before VERIFIED commit close. Internal unit has no publish step.

Later REQUIRED integration: exact owned CLI/loader/worker preload roles, selected runtime/dependency/run-state identity, explicit activation and late-failure truth consumed by existing strict runner (raw nonzero exit alone is insufficient), original CLI/report/receipt/tree/state/cleanup negatives, actual preload inheritance and native teardown. Causal2/native10/full-file13 source-rendered tests and full unfiltered/compiled/installed/overhead qualification remain distinct and open.

Evidence: existing QA root C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2. Record exact commands, timestamps, hashes, results and bounded footprint below.

## BASELINE

HEAD084e/index empty. Existing dirty BACKLOG/ROADMAP/HANDOFF/native-performance plan preserved. BATCH230a excluded.
Lifecycle SHA3b05099ede0ff02df0be01b359967d96dc3af4cd962ee15e2a6fd06f3ed6b1a3; selftest153f05cd75c50e546651b2670acde32bb44e404d8addcb6e756a2e967a357dc7.
Runner143a916dbb8b1e5d25a353121fa103431e09b08754909ba100da33f022caaa65 and integrationa995d31c654118075d43c4a954856ee706f858618ff8f0758ab295a7d442b921 untouched by unit1.
Latest user state X4 idle/closed, serial headless authorized; no new activity observed. No test currently running.

## RECONCILE

Resource searches and exact #20 comments plus GitHub Playwright/HANDLE/taskkill searches found #20/#109 but no dedicated executable lease owner; created #112.
Normal active-root HANDLE protection is real. The exited-root/held-stream window is SOURCE-SUPPORTED, not reproduced PID reuse or foreign termination.
API owner transfer alone misses Chromium; stable upstream1.65.1 still has the same guard. Worker artifact cleanup can outlast child close. Therefore retain through actual owner destruction, not merely close.
Extend-versus-replace: EXTEND existing lifecycle/runner/state fail-closed owners despite historical incidents; preserve original gates. No replacement cleanup engine.
No capability-map delta yet: inactive internal primitive. No new product spending/network/delete/credential surface.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE

Unit1 source frozen: lifecycle3d33b42d801eb324976f38c09db71f061990e720cfb4077aa91cd8f8268a5d2d; selftest9c93817445a3783e78fa783459b4ae9ed2e0aea9c89f3f25470855688b49ee4e. Export createE2eProcessHandleLeaseOwner stays inactive. No loader/prototype/runner activation. Strong failed-child retention, created-PID-then-throw retirement and original exception identity were corrected during independent review. RetirementFailed=false only means the adapter did not throw; actual child exit/EOF/tree proof is separately required.

Actual pure28/28 PASS (original17 plus11 new groups), qualified receipt d81401f7e0d6d6b779713e8c9fd56432607be8245e6473d5d226115981c5a602, Job0.454s. Actual Windows proof17/17 PASS, receipt9dbd99a51352df2d68191ae04c8063df58d9e2c7add306d018f95721beceac1f, Job0.328s: actual spawn/fork prototype chokepoint, noninheritable query HANDLE, original Node handle gone while descendant retains streams, valid identity before/after close, exact native acquisition-refusal child killed and closed, failure latched, hook restored and Job empty. Two healthy retained HANDLEs remained until owner destruction. These timings are test-job cost, NOT extension overhead.

Initial actual probe0a228b89c2da11019232555b68eca7e47335e4a5313a1ffd39dacf0be09f4034 FAILED: its >=250ms arrival-time assumption asserted false; the still-armed fixture watchdog subsequently exited2 at8.156s. That receipt stays FAILED. Replaced timer inference with an explicit one-connection private Windows pipe release barrier: the descendant cannot exit until the owned parent releases it after observing root exit. No fixed port, file, helper or product network surface was introduced. The same original8s watchdog/90s Job/512MiB/oneCPU limits were retained; no policy/test assertion was weakened to accept an uncontrolled fixture.

Every completed Job proved EOF/tree empty and681 source/six borrowed dependencies/nine Dev/standing Git unchanged except the declared source deltas. Protected BATCH230a unchanged. Original runner143a/integrationa995 and panel source untouched. Independent final source/inverse review CLEAN; removing only new blocks restores both entire baselines after EOL normalization, including all original17 test bodies.

First actual normal precommit session91116 is terminal: command passed223.047s, while its verifier wrapper failed as detailed below. Mandatory hook/commit/push/CI remain open. Whole112/109 remain PARTIAL; no local-run admission, rendering/installed/overhead/release claim from unit1 alone.

Reconciliation amendment BEFORE further source mutation: session91116 is now TERMINAL. Actual full normal command PASSED exit0/[precommit]OK/current typecheck in223.047s with all guards/Jobempty, but wrapper82f2a5f9 stays FAILED because its parser wrongly demanded the separately-run lifecycle28 marker. Source inspection shows the current normal E2E gate never invokes this lifecycle file. Unit1 therefore adds scripts/precommit-check.mjs as a THIRD source owner (baselinef46b3f3637ef2250aaeef77e40085fbfaa968dcae7261b1343e6e9486270bb33). Extend its existing checkE2eVerdict command sequence with the existing lifecycle selftest and add the same command to its independently tested orchestration expectation. Preserve every old command/order/failure control; prove new nonzero/spawn-error propagation using the existing real-source VM selftest. No new CI runner, script, dependency, bypass, product policy or receipt change. A new normal gate is warranted by this source change; do not rerun merely to conceal the old wrapper failure. Rollback for this added owner is its exact small inverse. All earlier 'two source' scope language is superseded only by this necessary gate-wiring amendment.

Final third-source freeze8956f79785324018d2cd5f6f7f5c832089305bb683a2f17e92aebb5750b7870e. Existing orchestration20 passedac931812 at intermediate21e93a; final23 (all20 old plus3 explicit lifecycle nonzero/spawn-error/throw controls) PASS3a7d2671 in1.187s. No owned audit/runtime executes in this real-source VM test. Independent final/inverse review CLEAN and all original20 bodies/commands preserved.

Final actual full normal precommit session84991 PASSED56ab3e3942a0867318d89c5faf69f1e7f43f10fb19de5980946b2846575c03c0: exit0/[precommit]OK/current typecheck,215.782s, original300s/1536MiB/oneCPU, all681 source/sixdependencies/nineDev/standingGit stable and Jobempty. Early focused markers are outside its retained tail, so the verifier does not invent missing tests from tail truncation. The actual independent28/23 results and exact default command-sequence checks establish that binding. All failed/intermediate receipts remain unchanged. Current actual mandatory hook, commit/push and exact-head CI are the remaining unit1 gates.

## AAR

NON_CLEAN: reconciliation rejected API-only/upgrade alternatives and discovered worker post-close cleanup. Independent review required strong failed-child retention and created-PID-then-throw retirement, both corrected before qualification. The initial native fixture's time assumption failed; explicit owned release made its lifecycle premise deterministic without raising limits. Read-tool schema/path failures and an unavailable JS encoding helper failed before executable mutation.

Sustain exact native/primary-source tracing, existing ownership infrastructure, capacity reservations, original exception identity, mechanical inverse review and separate actual-Windows proof. Improve work: use causal release barriers instead of elapsed-time guesses for process lifetime tests. Improve tools: clear/terminate the fixture on assertion failure rather than letting an armed watchdog obscure its original assertion; use bounded output and schema-first calls. Highest-risk evidenced remaining weakness is the missing activation/late-failure channel in the production runner; Unit1 deliberately stays inactive until that integration is proven. Project lesson bank pending final gates; no memory writes. No PID reuse/foreign termination observed and no capability-map delta.
