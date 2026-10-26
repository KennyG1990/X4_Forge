# C06c — shared source coordination

Status: VERIFIED for bounded local source/API behavior; checkpoint commit requires the mandatory hook. Owner: GitHub #20 / existing Claude completion Notion task. Full Claude program remains PARTIAL. Kimi remains paused.

## PLAN

- Lane: FULL. Bounded unit: serialize Forge-mediated source-folder operations across participating processes on one machine. Preserve workspace receipt scheduling, source-hash checks, and all existing source/output resource keys.
- Assumptions: the shared registry is a local per-user file, not a network share. Older Forge versions and unrelated editors do not participate. Locks are cooperative, not access control or protection against deliberate registry deletion/tampering.
- In scope: dedicated SQLite registry using the existing native dependency; atomic all-resource claims; FIFO among conflicting requests; bounded queues; authenticated owner/workspace/operation/timing status; fail-closed dependency/schema/storage handling; confirmed-dead-process recovery; explicit test registry isolation; production HTTP proof with two owned servers.
- Out of scope: live Forge/Dev installation, real mod/game/config writes, publication/push, arbitrary editor locking, distributed/network filesystem coordination, Kimi, C07 game transport.
- Existing infrastructure: `ResourceCoordinator` remains the process-local workspace scheduler. Extend source-operation wiring through a separate shared coordinator, reusing canonical realpath keys and post-grant key checks. Do not reuse the disposable fail-open cache database as a safety authority.
- Risks: a stalled/live or PID-reused owner conservatively blocks conflicting requests; SQLite unavailable must refuse protected writes while diagnostics remain readable. No active claim expires by age. Explicitly isolated tests must never open the real registry. Adding a native dependency requirement affects release packaging and must be proven with the compiled server before closing.
- Rollback: exact unit diff/local commit; baseline `d245526060093866366e30248677fee82d52ebb9`. Scratch registries and sources are disposable; no production state migration occurs in this task.
- Acceptance: simultaneous participating processes never enter overlapping source handlers; unrelated resources proceed; parent/child/junction aliases conflict; multi-key requests are atomic; conflicting FIFO holds; active work retains its claim through timeout/disconnect; exceptions release; confirmed-dead owners recover; uncertain liveness retains; changed aliases and external source edits refuse before mutation; dependency/corrupt/future-schema failures never fall back to process-only writes. Status exposes participant scope and owner/timing, without claiming authority over editors or older versions.
- Required validation: focused coordinator tests with deterministic barriers and real child processes; pre-fix independent-process overlap reproduction; two compiled HTTP servers against the regression test mod and private registry; stale SHA refusal and unchanged bytes; typecheck/lint/build; existing C06 API E2E and runtime-discovered oracle regression; capability/receipt/writer audits; full precommit and mandatory commit hook. No rendered controls change; no native UI/game proof claimed. Exact VSIX/installed-host proof remains the later release gate.
- Evidence: private raw runs under `C:/Users/Moshi/.x4forge-dev-build/lab/evidence/claude-program/C06c`; tracked summary `docs/testing/claude-C06c-coordination.json`; plan, route inventory, complaint ledger, backlog, roadmap and handoff. Preserve failed attempts.

## BASELINE

- Clean release worktree at `d245526060093866366e30248677fee82d52ebb9`; unrelated main checkout preserved.
- `baseline.json` records protected live/Dev discovery and installed bundle hashes. No ephemeral 3100/3101 listeners at capture.
- User confirmed X4 running, Claude using live Forge normally, machine otherwise quiet before integration/hooks.

## RECONCILE

- `src/server/resourceCoordinator.ts` owns the existing process-local queue and canonical path resolution. Root `server.ts` owns source key selection, handler wrapping and `/api/agent/status` projection. `src/lib/db.ts` is a fail-open, rebuildable cache and unsuitable for safety claims. `instanceDiscovery.pidAlive` treats errors other than EPERM as death; shared claims require ESRCH-only confirmed death.
- Existing staged app includes better-sqlite3; loading, not mere file presence, must be tested. Playwright, production integration and staged-probe launchers need explicit scratch registry overrides.
- Independent read-only review confirms atomic SQLite transactions are appropriate; transactions must end before handler execution. Authorities: https://www.sqlite.org/lang_transaction.html and https://nodejs.org/api/process.html#processkillpid-signal .
- Capability delta planned: cooperative source coordination across participating same-user local processes, with honest unavailable status. Source hashes still guard external edits.
- Brain recall produced weak title/file matches, no established solution relied upon. Graph query was generic; direct owners/callers provide reconciliation evidence.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE / AAR

Plan was recorded as SPECIFIED before implementation. Final evidence and close follow below.

Reconciliation amendment: the existing durable-writer audit inventories SQL calls only in
`src/lib/db.ts`. Registering the new module's directory creation alone would leave its SQL
authority uncounted. Extend that audit to an additional explicitly registered database owner,
with missing-owner and changed-count negative tests, before accepting its green result. This
is required evidence coverage for C06c, not a general audit rewrite. Earlier read/search retries
and the initial production fixture setup failure are retained for the triggered AAR.

The receipt inventory also previously recognized only the disposable cache database.
Its additional-database discovery now includes the coordinator with strict shape/duplicate
checks. Both new coordinator surfaces are classified `durable-local-mutation` /
`receipt-required`, not cache/exempt. This declares the broader W3B1 receipt obligation;
an independent ActionReceipt adapter for internal claim rows is **UNWIRED**. This unit
proves coordination and existing route receipt compatibility, not universal receipt coverage.
No existing route authority or disposable-cache classification is changed.

### Implementation

- Dedicated lazy `SharedSourceCoordinator`; atomic SQLite decision transactions, all-key
  claims, intersecting FIFO, independent-source progress, 256 default pending requests,
  120-second queue deadline, bounded keys/owners and authenticated owner projection.
- Existing canonical path/parent-child matching and post-grant key re-resolution retained.
  Workspace receipt scheduling remains process-local and unchanged. Only source wrappers
  and status use the shared registry.
- Registry schema/application/row checks refuse uncertain ownership. Only confirmed-dead
  remote PIDs are reclaimed; active claims never expire by age. Unknown/reused PIDs retain
  their claims. Exact request/instance/PID cleanup preserves both errors if cleanup fails.
- Local per-user default independent of per-sidecar state. Explicit absolute scratch
  overrides in every existing isolated harness; recognized test modes refuse missing
  overrides. UNC paths are rejected; mapped-drive locality remains an operating assumption.
- Missing/incompatible native binding, corrupt storage and future schema expose infrastructure
  unavailability and refuse protected writes; no process-only fallback. SQLite is an existing
  packaged dependency. No HTTP test route, credential, desktop input or game helper added.

### Final validation evidence

- Baseline: deterministic compiled two-server race reproduced; both old-hash writers succeeded
  and the paused writer overwrote the other. `http/baseline-6e933abcf7/verdict.json`.
- Focused coordinator:72 passing checks, including real child processes, malformed rows,
  timeout, ownership and truthful single/dual cleanup failures; `focused-final-outcome.log`.
  Existing C06a35 and C06b119 pass; compiled HTTP/MCP regression65 passes.
- Final compiled two-server proof:52 passing checks; `http/fixed-11faa7506f/verdict.json`.
  Production bundle SHA256: `37d9839946906586ff287006fe0112bfbb63a5b10a779b7452b8fbb4b5d70bff`.
  Exact-target rename barrier is harness-only instrumentation, not a product test endpoint.
  Ten owned children across the matrix stopped; at most two ran concurrently; ports closed.
- Serial C06a/C06b/incremental E2E3 passed/0 failed/0 flaky; after correcting the cache-path
  assertion to the actual GET oracle loop, the affected spec reran1/0/0 with a reached flag.
  All134 runtime-discovered oracles passed. Actual db-selftest path is contained under the
  ephemeral instance data directory. Evidence: `e2e-three-pass-verdict.json`,
  `e2e-containment-final-verdict.json`, `oracles-final.json`, `studio-cache-containment.json`.
- Typecheck, production build and full lint pass (0 errors/618 existing warnings).
  Full standalone precommit passes; mandatory commit hook repeats it and gates the checkpoint.
  Receipt candidate57 and policy bundle18 pass; reviewed routes301, receipt routes85/surfaces61.
- Writer audit30 and receipt-inventory25 checks pass. Capability candidate adds only the
  shared coordinator source; routes, permissions and capabilities are unchanged.
- Failed fixture run retained: missing inert X4.exe marker. Failed broader E2E retained:
  missing durable-owner receipt inventory, correctly refused before fixture mutation.
  Wrong test filenames and Windows search retries were corrected without treating skipped
  tests as passed. Lint found unsafe throws in finally; cleanup was restructured and all55
  then expanded72 focused checks rerun. Degradation called; stop at this bounded validated commit point.

### Fresh-eyes review

Independent reviews covered FIFO/death/PID reuse, native loading, source-key wiring,
isolation, cleanup error preservation and child-writer lifetime. Protected target writes
run in the parent process; packing uses in-process writers and unique scratch stages.
Arbitrary run-command operations, manual WorkshopTool, older Forge and editors do not
participate. Release/storage failure can conservatively retain ownership until process
exit. Registry tampering and an external editor writing inside the final rename window
are outside this cooperative contract; no stronger filesystem CAS claim is made.

Review correction: the touched reference-manifest harness previously omitted scratch
discovery. Added an explicit owned discovery directory before running it; the oracle and
reference-API harnesses now explicitly isolate configuration too. This fixes an existing
isolation omission necessary to keep the updated harness contract honest. No live run of
those harnesses was used to discover it.

Runtime isolation amendment: the first passing C06/C05 oracle run exposed the pre-existing
`getStudioDb()` default `%TEMP%/x4-studio-cache` path, shared with installed0.0.79. The shared
memory file timestamp changed; database and WAL timestamps did not. This is an observed cache
open, not proof of cache-content mutation or user-visible disruption. Runtime tests paused;
Ken confirmed live Forge still working normally. Move this existing disposable server cache
under its `X4_DATA_DIR` owner (`studio-cache`) and require the actual db-selftest response to
prove scratch containment before continuing. No old cache is copied, deleted or repaired.
Do not claim continuous all-live-state invariance for the earlier run; the four protected
bundle/discovery hashes remained unchanged. This is necessary to meet C06c's isolation gate.

## CLOSE

- VERIFIED: bounded source/API coordination and isolated regression contract. Full standalone
  precommit exit0; the mandatory hook must pass before this checkpoint commit exists. Its raw
  result is retained in private `commit-hook.log`, with post-commit identity in `checkpoint.json`.
- Requirement review: atomic overlap/FIFO, independent progress, aliases, stale hashes, queue
  bounds/deadlines, disconnect/throw/death recovery, conservative uncertain liveness, dependency/
  schema/storage refusal, owner status and scratch containment are done and evidenced. Selected
  E2E only; full release suite, exact VSIX/native host and game proof remain later gates.
- Capability delta: shared canonical-source coordination among participating local processes;
  route scopes remain unchanged. Internal registry ActionReceipt adapter remains UNWIRED under
  W3B1; inventory declares the obligation without claiming runtime receipt coverage.
- No installed bundle, real mod/game or standing configuration written; no push/publication.
  Earlier shared-cache open is disclosed above. Old cache remains untouched after diagnosis.
- Existing GitHub#20 and Notion safety task remain open for broader work; update/readback records
  accompany the local checkpoint. No duplicate issue. Kimi remains paused.
- Rollback: revert only this unit's commit/diff onto baseline d245526060093866366e30248677fee82d52ebb9;
  no installed-state migration. Commit point: fix(source): coordinate writes across Forge processes.

## AAR — triggered

- Sustain: reproduce the old race with two compiled servers, deterministic barriers and actual
  source bytes; conservative ownership; separate test namespaces; independent evidence review.
- Improve approach: guessed filenames and an initially unreachable assertion wasted validation.
  Require an assertion-reached signal at the real caller and derive test paths from the tree.
  Lint cleanup failure, missing fixture marker, durable-owner drift, policy pin mismatch and stale
  positive test counts were corrected and rerun; failed evidence remains preserved.
- Improve tools: expanding durable storage needs writer, receipt inventory, reviewed manifest and
  policy pin updates together. Exact manifest deltas were reviewed; no authority or negative
  check was weakened. The shared-cache default is now instance-owned and runtime-path checked.
- Highest-risk observed weakness: an optional cache silently escaped the ephemeral namespace.
  SHM timestamp changed, with no demonstrated content mutation/disruption; user confirmed healthy.
  Bounded fix and actual db-selftest containment proof passed; no continuous live-state claim.
- Degradation was called. Finish this checkpoint and use fresh context for the next bounded unit.
  Project/general AAR deltas banked in rescued StarForge wiki; Codex memory files unchanged.
