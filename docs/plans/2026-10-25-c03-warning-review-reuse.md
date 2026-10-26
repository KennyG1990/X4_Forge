# C03 — remembered warning reviews

Lane FULL. SPECIFIED. Owner GitHub #20 and existing Notion safety task.

## Plan / acceptance
Extend exact finding acceptances and ActionReceiptStore, not a second approval database.
Existing forge.rules.json suppressions are author declarations, not authenticated acceptance
receipts; preserve them and include their bytes in validation identity. Existing legacy
acceptances without the new evidence/scope metadata never become reusable automatically.

Reuse only mod warnings with identical diagnostic context, validation source hash, validator,
corpus and coverage. Scope to canonical source folder, declared mod and resolved target.
Conservative dependency boundary: until C05 proves narrower dependencies, ALL validation
inputs are relevant; a source edit invalidates reviews even if a diagnostic looks identical.
Do not imply unchanged-file reuse across arbitrary source edits. New warnings require review;
errors and check-unavailable/safety failures never inherit approval. Retain raw findings.
Preserve original approver/reason/receipt and add a current-actor reuse receipt in each deploy
record. Revocation must be durable, authenticated, scoped and reread at the write boundary.
Expose list/revoke controls and new/known/resolved/invalidated/revoked distinctions.

Baseline: clean codex/forge-fixes-release at 3d257834; C01/C02 already committed. Private
lab/evidence/claude-program/C03/baseline.json captures protected live/Dev bundle/discovery hashes.
Rollback: scoped task diff only before commit, follow-up commit afterward; no broad Git reset.
No installed bundle, real mod, game or standing configuration writes. Kimi paused.

Affected: findingAcceptance, deploymentTrust integration in server, receipt metadata/store,
deploy review UI/client types, route/receipt inventories, focused and ephemeral HTTP/UI tests.
Reconciliation: graph points to existing exact acceptances, review projection and deployment
receipts; projectRules is a separate warning suppression mechanism. Extend rather than replace.
Risks: stale authority, forged actors, storage corruption, unbounded receipt scans, UI false clean.
Bound receipt enumeration, reject corruption/overflow, retain server-authenticated actors and
fail closed when revocation or provenance cannot be verified. No new network/spend surface;
new revoke endpoint is deploy-authorized and receipt-backed, with strict input limits.

Required proof: reproduce no automatic reuse on baseline; focused positive/negative tests for
scope, changed source/validator/corpus/coverage, new/error findings, revocation, tampering and
recovery; actual scratch-mod HTTP approval/reuse/deploy records and stale refusal; inspect
rendered list/revoke controls with headless browser; types, lint, build, relevant policy/receipt
audits and full precommit. Check ephemeral teardown and protected hashes. Evidence private C03
directory plus sanitized docs/testing/claude-C03-warning-reviews.json. Native/game proof is
out of scope and remains C07/release. Update GitHub/Notion and read back before close.

## Baseline / implementation / validation / review / close / AAR
Pending. No C03 completion claimed. Discovery command glob syntax on PowerShell was corrected
by searching directories with rg -g filters; no mutation resulted. Agent-brain unavailable.

### Source checkpoint — PARTIAL, not committed
Baseline reproduced with the existing acceptance/store APIs: approval recorded, then zero
accepted warnings on the next unchanged evaluation. Source now adds verified bounded receipt
enumeration (10000 entries/64 MiB), scoped original approvals, current-actor reuse receipts,
revocation and preview/write-boundary invalidation. Existing raw findings and qualified outcomes
remain. Latest original review controls; revoking it cannot resurrect an older superseded review.
Absent warnings under incomplete coverage are unverified, not resolved. Legacy unscoped receipts
never gain automatic authority. Deploy-bound agents may revoke only their addressed source/mod.
Rendered history/revoke controls and an actual API/browser/scratch-deploy test are authored.

Focused reviewed run:27/27 cases passed in `focused-reviewed.log`. Existing acceptance40/40
and review11/11 passed. Parser smoke passed. `git diff --check` passed. Four protected live/Dev
hashes unchanged. No desktop input, installed changes, game calls, or deployment test executed.
Typecheck/lint/build, route candidate generation/promotion, receipt coverage generation/promotion,
full precommit, actual API/UI/scratch deploy and screenshot inspection remain REQUIRED/NOT RUN.
The new route authority and receipt classifier are draft edits; do not package/install this tree.
Machine-state question is pending before heavy validation. No C03 commit/push/release yet.

Review/AAR triggered: first focused run rejected an illegal beforeHash in a revocation after-state;
corrected to the existing receipt schema. Next run reached tamper detection but the test matched
the message instead of the structured error code; fixed the assertion, not the rejection. Both
failed logs retained. Discovery had PowerShell rg path-glob/option errors; use explicit directories
and -g/-e arguments. Sustain exact origin/reuse provenance and negative tests. Highest observed
risk is stale approval authority; revocation changes preview binding and is reread at activation.
This is focused evidence only; no capability-map VERIFIED delta or whole-unit completion.

### Validation resumed after machine confirmation
User confirmed same setup: X4 running, Claude using live Forge, machine otherwise quiet.
Typecheck passed. Lint first found no-control-regex in the new revocation input check; replaced
it with the existing character-code predicate, then lint passed with608 warnings/0errors.
Production build passed. Focused suite expanded to29/29 including invalid-reason no-write and
64MiB history cap. Route candidate reviewed: exactly one deploy-only revoke route, zero existing
permission/source-inventory changes. Promotion and receipt coverage audit are in progress.
Permission surface sweep: new endpoint only appends validated review metadata to existing receipt
store; no source/game/deletion/external-process/spend effect.512-character reason,10000 entries and
64MiB read limit; strict inputs, authenticated effective deploy authority and workspace/source checks.
All required actual runtime/UI/package proof remains pending; no C03 completion/commit yet.

### Final integration evidence and review
29/29 focused cases and existing acceptance40/40 plus review11/11 passed on final source.
Two actual scratch-mod HTTP/browser runs passed, each1/1, zero failures/flakes, owned tree stopped.
The final run proves19 scenarios including cross-agent provenance, per-deploy receipt linkage,
read/write-scope denial, malformed/foreign-scope refusal, actual rendered revocation, rules/source
invalidation, new-warning isolation, stale-preview/source refusal without target writes, restored
evidence/reapproval recovery and resolved history. No route mocks or keyboard/game automation.
Screenshots inspected: known-review.png, qualified-deployment.png and revoked-review.png.
The amber accepted-findings result remains qualified; revocation explicitly labels it historical.

Typecheck and production build passed; lint0errors/608warnings. Official route/receipt candidates
were reviewed and promoted: one new deploy-only revoke route, no existing permission changes.
Reviewed receipt manifest SHA256 a4a9a51790fa1f75ecec43b82b73d6d14ef7f1a313ed8b47a26ce23f2751906b.
Full precommit final gate PASSED, including capability/MCP authority, durable-writer and receipt
coverage audits (85 routes/59 surfaces), E2E harness guards and typecheck.

Fresh-eyes review corrected two presentation/evidence edges: immediately recorded approvals now
project fresh history rather than still claiming needs-review; missing findings under incomplete
coverage are unverified rather than resolved. UI ignores a pending revocation response after a
different deployment result is displayed. Tests cover receipt corruption, interrupted revocation,
latest-original supersession, restart and the64MiB cap. Full changed diff reviewed for authority,
metadata, policy pin, exact source scope and unrelated churn. No outstanding C03 implementation
requirement found within the conservative all-validation-input dependency contract.

AAR triggered by the retained focused/lint failures and review corrections. Sustain actual API,
rendered control and receipt evidence together, keeping private keys out of saved proof. Improve
by testing current-history projections at the first approval as well as later reuse. Tool lesson:
policy candidate generation/promotion is authoritative; inspect the exact one-route delta before
updating the embedded manifest pin. Highest evidenced weakness remains stale review authority;
durable revocation, preview binding, write-boundary reread and fail-closed incomplete history now
have negative/recovery evidence. No general reusable skill or Codex memory update is made.

### Close — VERIFIED (isolated local integration)
All required C03 methods passed. Four protected discovery/bundle hashes remain unchanged;
owned E2E tree stopped and test ports cleared. Public proof: docs/testing/claude-C03-warning-reviews.json.
Capability delta: warning-only exact-input reuse, attributable per-deploy receipts and durable
revocation/listing in source/API/rendered integration. Not published, installed or game-proven.
All source changes invalidate reviews until C05; C04-C07/release/install remain open. Kimi paused.
Commit point: fix(deploy): reuse and revoke exact warning reviews.

Closing AAR: two hook-directory inspections assumed nonexistent paths (.husky/.githooks); neither changed files. Operator degradation threshold invoked: preserve verified C03 in its authorized commit, then fresh session for C04. Use Git-resolved hook paths for future inspection.
