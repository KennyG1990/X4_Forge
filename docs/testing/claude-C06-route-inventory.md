# C06 route reconciliation — bounded C06a/C06b/C06c checkpoints

The source authority is `server.ts`, the reviewed route-disposition manifest and each existing domain owner. This is an inventory and explicit disposition, not a claim that every route below has new exhaustive E2E coverage.

| Family / routes under `/api` | Existing owner and C06a delta | Proof / remaining boundary |
|---|---|---|
| `agent/project/create`, `file/create`, `generate`, `content-xml` | Existing orchestration/content builders; strict object/metadata/file contracts; returned-file identity | Focused malformed cases; actual create/file/generate HTTP. Content-only identity is explicitly scoped to its generated file. |
| `agent/mod-folder/import` | Existing strict import parser, path resolver and importer; identity from actual loaded project; canonical source lock | Actual scratch import, bad payload rejection, import/validation identity equality. Import does not change addressed workspace. |
| `agent/project/validate`, `validate/check`, `validate-crossfile` | Existing full validator/evidence and cross-file validator; strict selector/root/flag contracts; evidence identity | Actual inline/disk validation, warm-result equality, schema/edit/recovery and existing capability tests. `/validate/check` retains its capability-fixed fields. |
| `agent/compile`, `agent/package`, `agent/artifact/build`, `agent/project/files` | Existing manifest/validation/inventory owners; reject malformed workspace envelope; exact compiled text identity | Actual test-mod calls. Artifact byte identity remains separate from semantic input identity. Build may materialize an invalid artifact but must report failed validation. |
| `agent/deploy`, `agent/deploy-verify` | Existing immutable snapshot, expected identities, acceptance records, recovery and activation; source/output serialization; full blocker details and acceptance template; ASCII skipped stage text | Actual refusal, reason-required acceptance, durable receipts, exact bytes and stale refusal. No current-deployment fidelity assertion on a prewrite refusal. |
| `fs/write`, `fs/create` | Existing guarded writer/validation/CAS; strict body, canonical source serialization with owner/timing projection | Actual two-client same-revision race: one write, one 409; malformed content does not overwrite. CAS remains optional for legacy callers, so a caller omitting the precondition does not gain protection against arbitrary editor writes. |
| `fs/snapshot`, `fs/delete-snapshot`, `fs/restore-snapshot`, `fs/delete-dir`, `agent/history/:id/revert` | Existing snapshot/history/recovery policies retained; source serialization wraps full operation and cleanup | Existing receipt/oracle/policy tests; dedicated concurrent route tests beyond fs/write remain open. |
| `agent/project-rules/suppress` | Existing exact scope, rules writer and receipt; source lock surrounds operation | Existing rules/receipt regression evidence retained; no approval widening. |
| `agent/release/nexus/prepare`, `agent/package/release`, `agent/release/steam/prepare`, `agent/release/steam/adopt` | Existing artifact/release guards retained; source/output lock surrounds operation | C06b adds strict prepare/download/export/verify/adopt inputs; recorded validatedSource and preparedSource scopes, content identity separate from legacy folder selector, binary provenance headers, unresolved legacy reports. Actual scratch report/download/export/stale-source/metadata-adoption and rendered release tests pass. No publisher, WorkshopTool, native invocation or upload proof. |
| `agent/workspace` read/replace/merge/create/restore and bulk transform | Existing immutable workspace authority, CAS and transaction receipt owner retained; queue primitive reused | Existing transaction service tests and policy audits. Workspace response hashes are explicitly workspace-content/head, not validated artifact hashes. C06b covers list/bootstrap/create/read/replace/merge/parked/restore, diagnostics/readiness, invalid refusal receipts, preview/current identities and stale CAS. Collections have per-item subjects; runtime/source hashes remain distinct. Bulk/snapshot owners retain existing policy/receipt coverage, not a new exhaustive route test claim. |
| `agent/runtime-control`, `/preview`, `/reload`; `agent/runtime-debugger`, `agent/debug-watcher/brief`, log/probe routes | Existing optional runtime protocol; control responses carry addressed workspace/mod subject; existing strict runtime request validation | No game invocation. C06b covers runtime-debugger/legacy brief/control and pasted-log diagnosis: workspace-head versus caller-supplied log bytes, existing selector protocol and display alias compatibility. Paired game proof and broader log/probe census remain C07 OPEN; these hashes do not prove game-loaded bytes. |
| `agent/status`, `agent/health-card`, `agent/game-log/status` | Existing state/dependency health; explicit process/environment scope and current-source coordination status | Status tested against scratch workspace. Global health does not invent validated mod identity. |

## Source coordination contract

Extend the old workspace receipt queue with a bounded, failure-safe resource scheduler. Resolve canonical filesystem owners using the nearest existing real path; compare canonical keys again after waiting. Reject changed aliases/configuration before invoking a queued handler. Acquire overlapping resources together; serialize intersecting parents/children; permit unrelated resources. Release only when the handler settles, including rejection/rollback, not when a socket closes. A queued request whose response has ended performs no later work. Status is a copied snapshot of owner, operation, workspace, queue time and start time, with no credential.

C06a's scheduler was process-local. C06c retains that scheduler for workspace receipts and
routes source operations through a dedicated shared SQLite registry. Scope is **participating
Forge processes using the same local registry**. Status exposes instance/PID, actor, operation,
workspace and queue/start times. It does not control older Forge versions, arbitrary run-command
operations, manual WorkshopTool, external editors or the operating system. Output-root locks
remain conservative and may serialize otherwise independent deployments. Existing source,
corpus and target hashes remain independent refusal boundaries.

The default registry is per-user local state, independent of sidecar `X4_STATE_DIR`.
`X4_SOURCE_COORDINATION_DIR` selects an absolute local namespace; all isolated test launchers
provide their own. Different registry directories do not coordinate. Recognized test modes
without an explicit override fail closed. UNC paths are rejected; mapped-drive locality is an
operating assumption. No real registry was opened during C06c proof.

The existing disposable studio index cache is now opened beneath `X4_DATA_DIR/studio-cache`,
as the reference-manifest cache already was. The first broad oracle run exposed an older
shared `%TEMP%/x4-studio-cache` open; its shared-memory timestamp changed, while observed DB/WAL
timestamps predated the run. Runtime testing paused and Ken confirmed live Forge healthy.
Subsequent proof requires the db-selftest to return the actual scratch cache path. No old
cache migration, reset or cleanup is performed, and continuous all-live-state invariance
is not claimed for the earlier run.

Claims acquire all overlapping resources atomically, preserve FIFO among conflicts and allow
unrelated sources to proceed. Queue timeout never expires active work. Only confirmed-dead
processes are reclaimed; unknown or reused PIDs conservatively retain claims. Missing/incompatible
native bindings, schema/corruption and storage failures are Forge infrastructure failures with
no process-only fallback. A cleanup failure after work completes explicitly warns that writes
may already exist and ownership may remain; it does not claim refusal or rollback.

Both new storage surfaces are inventoried as `receipt-required` authoritative state. Their
internal ActionReceipt adapter remains UNWIRED under W3B1/#20. This is not universal receipt
coverage; existing API/workspace receipts retain their own bounded proof.

## Claude follow-up ownership

- A01: Forge API/Playtest improvements belong here. The active mod's `tools/deploy.py` truncates stage detail to 90 characters, so its complete console integration remains OPEN; do not claim that client now prints every finding.
- A04: read-only inspection found the exact mismatch string in that mod's `tools/deploy.py` at its unconditional post-request fidelity block. Forge prewrite refusal now labels `not-deployed` / `fidelityScope:none`; the mod formatter remains OPEN and untouched.
- A05: exact reported skipped-stage string now uses ASCII. Preserve Windows stdout/redirected proof before resolving this bounded case; no claim that all Unicode in mod content is forbidden.
- A07: new-file reload guidance needs the existing deploy diff plus C07 authoritative game proof; OPEN.
- A15: project behavior gates require an explicit trusted command registry, actor/command/input hashes, bounded process/output/time limits, cancellation/cleanup and snapshot-bound deployment receipts. No shell/command execution from imported source is added in C06a. OPEN as the next independently executable security unit.

The complete C06 program remains PARTIAL. No C07 or Kimi implementation, public release, installed upgrade or game mutation follows from this checkpoint.

## C06b evidence and limitations

Plan/review/AAR: `../plans/2026-10-26-c06b-api-contract-completion.md`; evidence: `claude-C06b-contracts.json`. The named API census is bounded. C06c now supplies the participating-process lock described above; final evidence is `claude-C06c-coordination.json`. Trusted project commands A15, client helper A01/A04 and game-loop work remain open. Release metadata is recorded provenance, not authenticated against same-user file editing. Runtime and release operational folder IDs remain labelled separately from content.xml identities. No capability route, permission, public release or installed-host claim is added.
