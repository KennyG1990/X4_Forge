# C06 — API identity, source coordination and deployment diagnostics

Lane FULL. C06a bounded checkpoint VERIFIED locally. Full C06 remains PARTIAL. Owner GitHub #20 / existing Notion safety task.

## PLAN / acceptance
- Continue the approved C06 contract in the isolated release worktree. Baseline `2caca03`, clean; preserve main checkout, installed Dev/live bundles, configuration and X4. Kimi paused. User reconfirmed the running-game/live-Claude setup.
- Inventory author/import/validate/compile/package/deploy/runtime route owners; reject malformed subject selectors before coercion, report the actual resolved mod/source identity (with explicit hash scope), and distinguish request, subject, mod and Forge failures. Environment-only responses identify process/environment instead of inventing a mod.
- Extend the existing receipt serialization mechanism to a bounded observable resource coordinator. Source-facing handlers hold canonical folder resources through completion, including error/rollback. Same-source workspaces serialize; independent sources proceed. Status names actor, request, queued/start time and scope. This process-local cooperative lock cannot control other sidecars or external editors; hashes remain authoritative at writes. Explicitly expose that limit rather than claiming a machine-wide lock.
- Prove inline and disk identity, malformed requests, wrong/stale identities, aliases, concurrent clients, failed/aborted queue recovery, bounds and lock status with focused tests and actual scratch-mod HTTP/MCP/deploy tests. Inspect existing rendered deployment controls after diagnostic changes.
- A01: return all blocking findings and exact acceptance request templates, bound to preview identity, never a bypass. A05: ASCII skipped-stage text. Reconcile A04 output ownership before closing it. A07 reload behavior requires C07 game proof. A15 trusted project-command execution is a separate security boundary within C06; inventory/plan it explicitly before implementation, never execute commands from imported text.
- Relevant typecheck/lint/build, runtime-discovered oracles, serial isolated E2E, policy/receipt and full precommit gates must pass before commit. No push/install/game action. Rollback is exact task-file diff only, no broad reset.
- Evidence: private `lab/evidence/claude-program/C06`, repository `test-results/claude-C06`, sanitized `docs/testing/claude-C06-api.json`. Failed runs retained. No native-host/game claim from headless proof.

## BASELINE / RECONCILE
- Read handoff/backlog/completion/additional-case ledgers, capability map and ADR-F5. Graphify query navigated artifact/source ownership; existing graph is orientation only. Agent-brain recall is not available.
- Existing owners: `WorkspaceReceiptService.withSerializationKey`, `writeWorkspaceFileGuarded`, workspace CAS registry, `parseValidationProject`, import parser, `buildValidationEvidence`, failure-envelope middleware, exact snapshot/deploy acceptance/receipt pipeline, runtime-control subject.
- Confirmed by source inspection: several project/compile/package responses omit source hash; permissive author routes coerce inputs; current queue keys are workspace-only; deploy refusal truncates selected findings and summarizes count; skipped stages contain an em dash.
- Protected four-file SHA baseline and empty test ports captured in private `C06/baseline.json`. No live mutation. Preserve the prior session's independent live-host update observations.
- Extend versus replace: preserve current authoritative writers/CAS/receipt system; extract only its queue primitive and reuse existing validation identity. No parallel deployment or runtime subsystem.

## Reconciled checkpoint boundary
The route inventory is `../testing/claude-C06-route-inventory.md`. Reconciliation splits this delivery into C06a: strict project input/subject contracts, cooperative source coordination, and deployment diagnostics. Full C06 is not closed: broader runtime/release/author route contracts, cross-process coordination and A15's trusted project command boundary remain independently executable work. A07 needs the C07 game window. This is a non-clean scope clarification, not a declaration that the original acceptance was met.

## IMPLEMENT / REVIEW
- Extracted the receipt queue primitive into a bounded resource coordinator, retaining existing writers, receipt policies and CAS. Canonical existing/missing paths and aliases share resources; owners/timing are observable, unrelated sources proceed. Expiry/full-queue failures execute no callback. Exceptions release resources. Queued operations re-resolve aliases/configuration before executing. Coordination cannot control other processes or editors; deadlines do not cancel already-running mutations.
- Added strict body and identity envelopes to the scoped project routes. Actual manifest identity and scoped source hashes are used; unresolved identities stay null. Workspace-head hashes are explicitly distinct from validated-file hashes. Generated/package success now reflects its actual bounded package checks.
- A01 backend returns all blocking findings, locations and exact reason-required acceptance templates. A05 skipped-stage text is ASCII. Prewrite refusals identify `not-deployed` and fidelity scope `none`.
- A04's exact alarm is reproduced in the active mod's `tools/deploy.py` source (unconditional comparison after refusal); A01's helper truncates stage detail to90 characters. Read-only inspection only, no helper edits/execution. These end-to-end client cases remain OPEN. Exception/partial-write fidelity classifications require further coverage.
- Fresh-eyes review corrected hash precondition coercion and queued path/config retargeting. No permission or route registration was added. Resource queue bounds are new explicit refusal behavior, covered by negative tests. The receipt-service regression remains required.
- Surface sweep: no new spending, network, deletion, credential or execution surface. Existing authenticated scopes and raw writers are unchanged. The queue is bounded at256 pending/active entries and a120-second wait; full/expired requests refuse before work. Anonymous input middleware was rejected by policy; a named local middleware now uses the existing declaration, provenance and forwarding audit checks. Candidate promotion changed only the two source inventory entries; it did not relax route permissions.

## VALIDATE / CLOSE
Final acceptance and exact evidence are recorded in `../testing/claude-C06-api.json` after gates finish. No installed-host/package/game proof; browser evidence is the isolated rendered web app. The public and installed builds are unchanged. Rollback: revert this checkpoint's explicit task files; no data migration.

## AAR — triggered
Triggered: first E2E exposed a missing explicit generated validation verdict; second had an invalid fixture client ID. Both failures are retained, then corrected and rerun. Writer audit correctly rejected changed source fingerprints; initial comparison incorrectly used array order, then dictionary comparison confirmed no raw writer additions. Capability inventory must be reviewed/promoted for the new source modules. Review corrected hash coercion and path-retarget handling.
- Sustain: isolated scratch roots, real corpus, actual HTTP/deploy/browser proof, retained failures and protected-file hashes.
- Improve approach: reconcile client formatter ownership before treating all deployment output as Forge; use valid client fixtures and explicit result contracts.
- Improve tools: Windows `rg` does not expand wildcard path arguments; use `-g` with an existing directory. Policy inventories compare keyed records rather than incidental ordering. Preserve rejected runs rather than overwrite evidence.
- Highest-risk observed weakness: the real mod's deployment formatter can contradict a refusal by comparing previous bytes. Keep A04 open for a coordinated helper fix and refusal regression. Process-local source coordination is explicitly not a machine-wide lock; no claim otherwise.
- Degradation call made after repeated fixture/discovery errors: close this bounded checkpoint, then use fresh context for remaining C06. Kimi stays paused.
- Environment change after runtime proofs: live discovery changed to a sidecar started06:37:01Z, parented by a newly created Antigravity host at02:36:47 local. Both installed bundles and Dev discovery still match baseline. No task-issued host launch/reload/restart; cause is unconfirmed. Further runtime integration paused; only read-only observation, documentation and static commit gates continued. Continuous live-state invariance is NOT claimed.

## CLOSE - C06a VERIFIED; full C06 PARTIAL
35 focused and25 receipt-service checks;65 compiled HTTP/MCP checks;134 runtime oracles;
final C06+C05 E2E2/0/0, owned tree stopped. Rendered blocker inspected. Windows output encoding
checks pass. Build, lint0errors620warnings, capability/MCP/receipt gates and final typecheck pass.
Standalone precommit failed on three test-only unknown-value accesses; explicit object assertions
fixed them and focused/type checks reran green. The mandatory commit hook runs the entire gate
again and must pass before this checkpoint is created. Exact evidence: docs/testing/claude-C06-api.json.
A05 exact stage case resolved locally. A01/A04 helper integration, wider C06 contracts,
cross-process coordination, A07 and A15 remain OPEN. No real-mod/game/installed writes or push.
Capability delta: bounded strict API subject contracts and observable source coordination.
Additional AAR: documentation script hit Windows cp1252 default reading UTF-8; use explicit
UTF-8 reads/writes. Partial execution boundary was inspected before retry; no duplicate append.
Commit point: fix(api): bind project responses and coordinate source operations.
