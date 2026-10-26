# Bounded Claude fixes release 0.0.80 — 2026-10-26

Task: verify current Dev health and release completed Claude fixes on GitHub/Open VSX.
Lane: FULL. Status: PARTIAL at precommit capture — source/package/installed/Open VSX gates VERIFIED;
final Git delivery and CI are checked after this commit. Existing owner: GitHub #20; Notion safety task
3ae4618ed15b8169985ff065ec98a747. Claude program remains PARTIAL; Kimi remains paused.

## PLAN

- User now authorizes a bounded incremental public release before the remaining Claude
  complaints are complete, then return to Dev work. This supersedes the earlier
  all-complaints-first publication order, not the required quality gates.
- Work only in the existing release worktree. Preserve main checkout, running Dev,
  Claude's live Forge, active mod and X4. No automatic live installation/restart.
- Ship reviewed C01-C06c/D0 work plus necessary release-gate repairs. Exclude A15,
  corrupt-save detection and unproven game-loop capabilities from completion claims.
- Existing build/stage/probe/VSIX inspector and ephemeral test harness are reused.
  Exact stable VSIX must be tested in an isolated host, not assumed equivalent to Dev.
- Baseline is 7d3d850; remote main and current Open VSX stable are f274a7c / 0.0.79.
  Release worktree has only the previously policy-blocked untracked Python cache.
  Preserve it and explicitly stage reviewed paths only. No force push or history rewrite.
- Current Dev status is responsive, exact tested backend hash53c960..., correct lab
  workspace/private roots and available coordination. Enumerated live baseline matches D0.
- Reconciliation found required CI lint threshold600 versus618 actual warnings and
  dependency audit failures (root9high/1critical; extension7high). Resolve these without
  disabling rules, raising thresholds, forcing incompatible upgrades or hiding findings.
- Bound release repairs to reviewed types/unused code and compatible dependency updates
  in the release worktree. Audit lockfile deltas and staged dependency differences.
- Risks: dependency compatibility, native SQLite ABI, packaging private configuration,
  immutable published version, accidental live attachment, source/package drift.
- Rollback: preserve baseline commit and exact pre-edit files; scoped corrective changes
  only. Isolated host has private profile/state/discovery/coordination/game directory.
  Before publication discard only owned candidate artifacts if invalid; published packages
  are immutable and require a corrective version. Live remains on its current installation.

## Acceptance / validation

1. Current Dev health and source/app identity; preserve live protected files/process.
2. Root/extension high-severity audits; CI lint<=600; typecheck, focused regressions,
   full serial verdict-parsed E2E, runtime-discovered oracles, route/capability/MCP/receipt
   audits, precommit and extension build. No required failure or flaky result is waived.
3. Build/stage/package next unused stable version, no pre-release flag. Inspect secrets,
   Dev identity/config leaks, native module and exact extracted package dependencies.
4. Exact package API and isolated Antigravity proof: manifest preservation, invalid Lua,
   warning approval/receipt, stale identity/source refusal without writes, recovery,
   exact scratch deployment, private SQLite/coordination and honest runtime capabilities.
   Inspect native rendered shell; game behavior is not claimed.
5. Publish exact tested VSIX to Open VSX, read public metadata and download/hash-match.
   Then final release commit and non-force push to public main, verify remote SHA,
   create matching GitHub release, inspect required CI. Do not mutate dirty main checkout.
6. Update/read back existing GitHub/Notion owner, repo plans/backlog/roadmap/handoff.
   Distinguish publicly available from installed. Resume A15 in Dev after release checkpoint.

Evidence: test-results/release-0.0.80 and private lab/evidence/releases/0.0.80;
sanitized durable summary docs/releases/0.0.80-proof.json. Failed baseline runs retained.
Machine state confirmed by user: X4 running, Claude's live Forge healthy, otherwise quiet.
Agent-brain recall tool unavailable; current handoff and verified records used instead.

Exact-package reconciliation: the unchanged staging workflow resolves permitted dependency
ranges, so its lock contains SQLite12.11.1, fast-xml-parser5.11.2 and GenAI2.31.0 rather
than the root lock's12.10.0/5.8.0/2.8.0. Staged audit is clean and the extracted VSIX passed
80 HTTP/MCP, native/storage, byte, refusal and receipt checks. These do not make the root
120-test run proof of the different dependency bytes. Add a runtime-discovered oracle sweep
against the exact private installed host, with explicit owned URL, runtime discovery (no
source fallback), package hashes and before/after protected-state checks. Reuse the existing
sweep implementation; do not change production dependencies or touch live Forge for this proof.

## AAR / close

### Release artifact close, precommit capture

The private commit guard's first preflight refused its already hash-pinned D0 isolation
helper because that exact file was missing from the proof-owner list. HEAD and the absence
of a commit intent proved no commit attempt occurred. The guard now permits that single
hash-checked file, not its parent directory; failed evidence/before-copy are retained under
commit-owner-repair-1. Hooks and staged boundaries remain unchanged.

VERIFIED for source, exact artifact, isolated installed host and Open VSX delivery. All13
source/build/stage gates passed, including120 source E2E tests without flakes,134 source
oracles and500 route assertions. The exact VSIX passed80 extracted checks,62 installed API
checks and134 installed runtime-discovered oracles against the actual shipped dependencies.
The coordinated native check confirmed manual path retention after rescan, a current36-file
preview with35 editable sources and3 graph nodes, then closed the dialog. No game proof.

One Open VSX upload was accepted. Initial visibility was delayed, with UNKNOWN evidence
retained; read-only recovery verified public0.0.80/latest metadata and both downloaded
artifacts against97d6aebac9deea3b2d7bfadd31d1822b91384a419d09d7cc9bd564e8675bd3d3.
190 evidence references were hash-checked. No second upload or live installation occurred.
Source/extension high-severity gates pass; four moderate packaging-tool findings remain;
staged runtime audit is zero. Preserve the narrow-view modal layout limitation for UI triage.

REVIEW: all prepublication requirements are done and evidenced. Final commit/push, GitHub
release and required CI are still required after this snapshot; record their actual SHA,
URLs and outcome in the matching release plus existing GitHub/Notion owner. This avoids
claiming postcommit facts inside their own precommit artifact. Overall task remains PARTIAL
until those operations complete; remaining Claude capabilities and Kimi are not closed.

AAR — Sustain: private profiles/roots, exact artifact and dependency-byte comparisons,
explicit negative controls, preserved failures and a single upload with read-only recovery.
Improve approach: settle/unobstruct native controls and coordinate foreground use before
desktop tests; reconcile standard IDE/VSCE metadata transformations before publication.
Improve tools: private guards now report the precise refused comparison; actual format and
issue-link rewrites are bounded and tested. Highest-risk observed weakness is shared desktop
capture/input collision; use a short user-coordinated window. No public Forge runtime or
active mod was changed to clear a gate. Detailed failed runs above remain authoritative.

### Publication preflight documentation rewrite

The local-only publisher preflight refused a raw changelog hash mismatch. The extension
manifest bytes match source. VSCE's installed `out/package.js` lines600-627 linkifies
whitespace-prefixed GitHub issue references by default; the only packaged changelog changes
are #63/#36/#38/#39 converted to this repository's exact issue URLs. Repair only the private
publisher to require those four transformations, byte-identical remainder and matching
current release notes. Bind the packager implementation hash and transformation evidence.
No archive/runtime change or arbitrary documentation-drift allowance. Preserve both failed
local preflights; no credential read or publication occurred. The first diagnostic diff's
Windows console encoding failed; escaped JSON then exposed the actual four-line delta.

### Shared desktop coordination after onboarding

The user completed onboarding. Uninstrumented installed API62 checks and runtime-discovered
134 oracles passed. Native shell and import dialog rendered; the manual path was entered in
the addressed private field. Subsequent screenshots returned Claude's foreground although
accessibility still described private Forge; a read-only reacquisition reproduced the mismatch.
Claude's concurrent capture also contained the private release window. Desktop input stopped;
a one-minute coordinated pause in Claude's mouse/keyboard validation was requested before
finishing import/rescan visual proof. Do not claim simultaneous desktop work was nondisruptive
from protected-file hashes. Highest-risk evidenced tool weakness is foreground capture/input
coordination; use an explicit short native window. An obscured Expert control initially opened
the menu's Report Bug dialog; it was closed without submission. Observe settled, unobstructed
controls before input. These are workflow/tool failures, not reproduced mod or Forge failures.

### Installed archive metadata reconciliation

The first installed-oracle preflight refused before starting its runner because the IDE
adds `.vsixmanifest` beside the installed extension files. Independent byte comparison
proved this is exactly the archive's `extension.vsixmanifest` (SHA00cfc31d73096c6838b5b76d92b6cf5f97d14d46c4aad5690f9c78a7b6e6b49b).
Preserve the failed receipt and private helpers' before-copies. Repair only the private
oracle/publisher comparison: require exactly that added filename, its archive-derived
hash and before/after stability. Keep all other inventory/dependency checks unchanged.
Prove exact metadata accepted, altered/missing metadata and any other extra file refused;
then rerun the real installed oracle suite. No application or package bytes change.

### Private host handoff, 2026-10-26

PARTIAL: all13 source/build/stage gates and exact extracted VSIX80 checks pass. The stable
candidate is installed only in the private release-test profile. Its actual native window
shows workspace-trust and first-run sign-in/onboarding, requiring the user's action under
the computer-use skill. Preserve `native-onboarding-pending/receipt.json` and captured
image; no native success, publication, commit or push is claimed. A first screenshot-save
attempt assumedPNG and refused before writing; the original JPEG was then saved using
its actual MIME type. Use returned media types rather than assuming a capture format.

### Route-contract reconciliation after final-routes-1

SPECIFIED: preserve the required 485/498 failed route run, then repair only
`scripts/route-integration.mjs` where assertions still describe superseded contracts.
Baseline copy/hash: `test-results/release-0.0.80/route-contract-repair-1`.
No production implementation change is authorized by this fixture repair.

Reconcile all thirteen failures: current strict request-invalid envelopes, compile@2,
addressed runtime identity fields, UI source-domain ownership and omission budgets,
and baseline promotion that correctly refuses dynamic-event coverage gaps. Preserve
the dynamic event as an explicit negative test. Use a separately grounded, fully
checked warning for successful warning baseline promotion/resolution. Preserve exact
byte, no-write, authority, size-budget and legacy payload assertions; verify newly
added identity fields separately before comparing the unchanged runtime payload.

Acceptance: every route assertion passes, including new incomplete-coverage refusal;
source lint/syntax pass, exact snapshots and a fresh independent diff review prove
this is test-only. Retain the unchanged 120-test application E2E and 134-oracle proof
with an explicit, hash-bound test-harness compatibility record rather than claiming
identical source trees. Resume all remaining package/host gates only after the route
gate passes. Required commit hooks remain enabled. Any production failure returns to
planning and appropriate full validation; do not weaken a check to clear this gate.

### Preserved first-run outcome

Full E2E baseline full-e2e-1 expired at its 30-minute aggregate deadline after reaching
64 attempts of 119 scheduled tests, with the caller/import failures described below.
No complete report or green verdict was produced. Ownership initialization never
succeeded; the wrapper detected port3101 still listening. Four positively identified
ephemeral processes were stopped using exact command/parent/creation checks, and both
test ports closed. A timezone conversion mistake in the first manual-cleanup guard
refused before any process action; corrected UTC comparisons then passed. Live/Dev
protected state matched. Preserve manual-cleanup.json; do not relabel this run green.

Read-only diagnostics under the same scrubbed environment reproduced two five-second
snapshot timeouts. The unchanged command completed with 1306 rows in25.85 seconds under
a private30-second diagnostic limit, and strict parsing plus initial/repeated ownership
closures passed. Product limits are unchanged. Measure equivalent complete captures
before changing the command; no row filtering or weaker creation/parent checks. Record
the real cause and prove a short owned lifecycle before the next complete E2E run.

Diagnostic5 established a private-wrapper environment defect: explicitly importing the
built-in CIM module and preserving PSModulePath alone still took25-27s; preserving the
seven ordinary Windows OS identity/path variables took1.99s, with the same strict parser
and ownership closures passing. Preserve only those named nonsecret OS variables in the
private wrapper (COMPUTERNAME, USERDOMAIN, USERDOMAIN_ROAMINGPROFILE, USERNAME,
SYSTEMDRIVE, ALLUSERSPROFILE, LOGONSERVER). No product snapshot command, five-second
capture limit or ownership policy changes are needed. Do not attribute this to Forge.

The complete suite has grown to120 serial tests. Set the aggregate harness deadline to
60 minutes so the full inventory can finish on this machine; retain all per-test deadlines,
retry settings, zero-flake policy, required terminal-report and cleanup checks. Change only
the existing DEFAULT_OVERALL_DEADLINE_MS in e2e-runner-lifecycle.mjs, run its current
lifecycle/timeout selftests and prove a short real E2E before the full rerun. The first
30-minute run remains FAILED; no failed test is waived by the aggregate allowance.

### Reconciled release integration repairs

The first complete E2E run exposed two obsolete fixture assumptions: the Agent Keys
test still selects workspace.compile@1 although the supported contract is @2, and
deployment-trust attempts trust_fixture deployment while retaining the previous mod's
workspace. Repair those callers after the running suite stops; retain the exact authority,
wrong-identity, receipt, stale-source and no-write assertions. Do not waive failed/retried
tests. Preserve the first run and repeat the complete suite against the corrected source.

C02 additionally reproduced a real import-dialog failure: candidate discovery clears a
manually entered relative path before scanning completes, and also clears partial typing.
Repair SyncModal's input ownership so scanning cannot erase manual input; changing an
input must still invalidate its preview, and unavailable/wrong paths must be refused by
the authoritative import API. Prove delayed scan, partial typing, preview invalidation,
valid reimport and nonexistent-path refusal. Inspect the repaired control in the isolated
native release host. This is a necessary release regression repair, not a new import UI.

Dependency review also found a release coupling: source-mode deployment validator identity
hashes package-lock.json, whereas packaged mode hashes only server.cjs despite external
runtime dependencies. Extend the existing startup fingerprint to bind the packaged app
manifest and lockfile. Missing required fingerprint inputs must fail closed. Prove identical
bundle bytes with changed dependency inputs invalidate stored warning reviews; unchanged
inputs reuse them, and restored inputs recover. Cover source mode and packaged mode,
missing inputs, durable review provenance and receipt binding. Files: deploymentTrust.ts,
the existing warning-review regression and package proof evidence. No parallel registry or
new approval policy. Package/runtime tests remain required after this repair.
Verify the resolved validation dependency closure against the owning lockfile (bounded,
no external ancestor fallback). The first E2E baseline ran with the old installed
dependencies despite the updated lockfile; retain that distinction. Run npm ci after its
cleanup, then repeat required tests with actual lock-matching dependency versions.

Required capability audit rejected the first resolver implementation's arbitrary
createRequire base. Keep that rejection. Use the existing reviewed current-module
conditional base and extend the audit only for a direct, non-optional literal-dot
ownedLoader.resolve(...) call, which resolves a filename without executing it. Resolution
must not add a module to the executable route closure. Method extraction, reassignment,
computed access, call/apply/bind, loader escape, foreign factory bases and subsequent
dynamic module execution remain rejected. Extend the existing audit's positive/negative
probes; file boundary adds scripts/capability-contract-audit.ts. No arbitrary dynamic
loader allowance, inventory bypass or suppression.

### Corrected metadata-only dependency lookup

The short cleanup-smoke-1 failed before tests because xml-naming0.1.0 exposes an
import-only entry. Requiring every declared dependency to have a CommonJS entry was
incorrect. Cleanup now passed with no surviving owned processes and protected state
unchanged. Preserve the failed startup; synthetic fixtures alone missed this coupling.

Replace entry-point resolution with bounded standard npm package-metadata lookup,
following the documented node_modules ancestor order and stopping at the canonical
application owner. Skip node_modules/node_modules; no ancestor, NODE_PATH, PnP or
custom-loader fallback. The first existing candidate is authoritative and missing,
malformed, unreadable, broken-link or escaped metadata fails closed. Retain name,
version and owning-lock checks plus package/edge/read bounds. This fingerprints the
installed declared validation dependency metadata; it does not claim exact execution
resolution. No Node minimum-version increase. Remove only this task's now-unneeded
createRequire and capability-audit allowance/probes, restoring the prior audit.

Add import-only, nested/shadowed package, missing metadata, broken/escaped link,
ancestor refusal and cycle regressions. Prove the actual installed dependency tree
both from source and compiled CommonJS before repeating the short startup/E2E smoke.
Then run full required release gates and independently prove extracted package startup.
Authority: https://nodejs.org/api/modules.html#loading-from-node_modules-folders.

### Release-gate repairs, pending full integration

release-smoke-2 completed11 tests:8passed/3failed/0flaky, with owned tree gone,
ports closed and live/Dev protected state unchanged. Its failures include test contract
drift: receipt-history reads now fail closed during a simulated broken store, caret
position after clicking Preview was not established, and the complex-import selector
still assumes pre-C02 alpha__cue_ identifiers. Retain failed evidence. Repair test setup
and addressing only: capture clean approval preview before storage fault, assert faulted
preview refusal, retain no-write apply/storage recovery checks, explicitly position the
caret for suffix typing, and derive exact rendered IDs from returned source-owned cue
identities while retaining script-filter/layout/lossless assertions. No safety or product
acceptance weakening. Repeat the short suite before the complete120-test run.

release-smoke-3 retained9passes/2failures/0flakes and successful cleanup. Its real
trace reproduced a regression in the new preview guard: late configuration hydration
starts another directory scan, invalidates the selected path's valid pending preview,
and never replaces it. Repair the existing reload path to request a fresh preview for
the currently selected root/path after invalidation. Keep the old-response guard and
root/config invalidation. Add a deterministic actual-response delayed scan/preview
regression proving the replacement appears and an older result cannot win. Files remain
SyncModal.tsx and project-browser.spec.ts. Separately correct deployment-trust's obsolete
result copy using the current qualified title, unavailable-check count, byte-confirmation
and no-game-proof disclaimer. The retry exceeded240s cumulatively across actual API
calls; the earlier large-Lua/import hypothesis was disproved by its trace. Profile the
cause before changing any per-test limit; no timeout waiver.

Profile reference discovery before optimizing: after its private manifest becomes ready,
getReferenceCorpus may repeat paginated SQLite discovery because its one-second cache
timestamp is taken before the expensive discovery. This is a hypothesis, not a diagnosis.
Use only a private cache and the read-only configured corpus; capture a bounded CPU
profile, individual discovery/corpus durations, generation identity and result equality.
No live cache or active mod inputs. If reproduced, amend the exact repair and acceptance
before changing reference code; retain full source/corpus drift checks and per-test limits.

reference-baseline-1 reproduced the cache-timestamp defect against a fresh private
manifest of1,028,384 files: consecutive unchanged corpus calls took1811.74/1068.11/
1088.41ms and returned the same383-file/9979-symbol corpus. Discovery exceeds its own
one-second interval, so stamping its start prevents the cache from serving consecutive
calls. Correct only the existing checkedAt assignment to record completion in both
successful branches. Keep the interval, force option, signature/generation conditions
and deployment byte fingerprints unchanged. Add focused isolated tests for expensive
discovery, unchanged recheck, elapsed interval, force and changed-source recovery. Repeat
the same actual-corpus benchmark and require identical corpus hash/generation content,
then prove repeated actual deployment/browser calls with unchanged deadlines. Files:
src/lib/referenceCorpus.ts and a standalone focused cache regression. No new cache layer,
SQL migration or broader performance claim. Profile attribution remains evidence, not a
claim that this mechanism alone explains every slow deployment.

Focused cache regression: pre-fix failure retained; fixed11/11 plus child/directory
cleanup pass. Actual-corpus fixed benchmark:2393.96ms cold, then0.0789/0.1464ms;
both runs indexed1,028,384 files and produced identical corpus hash
a18a7abef897398a494933483a2f246badea667ef7c9dcdbefdf3137b6244d50.
This proves consecutive lookup reuse, not a faster cold load. Baseline CPU samples
attribute77.3% to queryReferenceFiles. Both private benchmark wrappers confirm live/Dev
protected state unchanged. Repeated HTTP/browser deployment proof remains pending.
Import-preview-4 now passes5/5 with zero flakes, owned tree gone and protected state
unchanged, including old-two-node/new-three-node response ownership and exact reimport.

Compatible locked updates clear the root dependency audit. Extension tooling now passes
the high-severity gate with four propagated moderate findings through uuid8.3.2. A scoped
`@vscode/vsce` -> `@azure/identity:4.13.0` override stays within vsce's supported range and
avoids MSAL>=5<7.1 affected by GHSA-xcx6-jx8p-x3h5. Current Identity4.14 still requests
affected MSAL6; forcing MSAL7 across its range is not used. Residual uuid advisory
GHSA-w5hq-g745-h8pq concerns v3/v5/v6 caller-buffer APIs; observed MSAL3.8.10 source and
bundle use only v4() without arguments. This is development packaging tooling, not the
VSIX app dependency tree. It is not a claim of zero security risk or zero tooling findings.
Maintenance follow-up: remove this pin once upstream supports patched MSAL within the
packager's dependency range, then rerun both audits and exact package/host proof.

Root/extension npm dependency graphs pass; native SQLite12.10.0 loads under Node24.15.0
ABI137; no native package update. Evidence: test-results/release-0.0.80/dependency-repair.
Type-only AST annotations and unused import cleanup target the18 warnings above CI's
existing600 limit; no rule/threshold suppression. Full release validation remains required.

Full-e2e-2 completed119 passes/1 failure/0 flakes in20.6 minutes, with owned tree gone,
test ports closed and protected live/Dev state unchanged. Both failed traces prove
HTTP400/ok:false for project:null; C06's early contract middleware now returns the exact
PROJECT_INPUT_INVALID code. The legacy test expected VALIDATION_INPUT_INVALID. Repair
only that test expectation, retain strict400/null identity, and add request-invalid
category/unresolved scope assertions. All six malformed cases must pass, followed by
the full suite. Do not change production validation or accept multiple codes loosely.

Full-e2e-3 is VERIFIED120/0/0 with complete owned-process cleanup, closed testports
and unchanged protected live/Dev state. Final lint0errors599warnings and all134 runtime
oracles pass. Source/build/stage gates continue serially. A private-wrapper npm argument
mistake meant public-baseline-1 ran the normal capability audit, not candidate generation;
its result cannot satisfy the public-baseline contract. The original output is retained,
the wrapper now forwards `-- --generate-candidate`, and an explicit corrected run plus
regenerated candidate/hash/source parity is required before packaging/publication.

Release evidence helpers were strengthened before first execution: inspected VSIX hashes
before/after; installed controller/supervisor/MCP/frontend/dependency inventories; current
public-source freeze; and public latest/version/main guards. Independent review found and
closed missing proof bindings and a post-dispatch failure-receipt gap. These are private
test helpers, not shipped product behavior. No successful execution is inferred from review.
Post-E2E source mtimes predate its start; this is timing evidence, not a pre-run hash capture.
Source hashes are captured before/after remaining gates and checked again before publication.

Operator checkpoint: two read-only path-command mistakes triggered a degradation call.
Preserve this release's ongoing evidence/gates; use fresh context before the next A15
implementation unit. No unvalidated release commit or publication is allowed as a shortcut.

final-precommit-1 FAILED at typecheck after its capability/MCP/receipt audits passed.
The new standalone cache test assigns fs.statSync, whose Node type is readonly; the
actual isolated11-case test passed but its TypeScript assignment needs an erased mutable
type assertion at the two patch/restore sites. Prove emitted JavaScript unchanged.
Root tsconfig also includes a byte-preserved, relocated benchmark source under ignored
test-results, producing invalid relative-import diagnostics. Add only test-results to
the existing generated-directory exclusions; preserve the evidence bytes and keep
scripts, tests/e2e and application source in the checked-file inventory. Capture before/
after inventory and require every removed path to be generated test-results evidence.
Run focused cache regression and typecheck first, then complete required precommit and
remaining gates. No runtime product behavior changes; existing full-E2E/runtime results
may be retained only with exact emitted-code and source-boundary evidence. New source
freeze must explicitly record these two nonruntime changes rather than claim unchanged.

Pending. Baseline failures are real release blockers; previous bounded D0 success remains
valid for its stated scope but was not a complete release gate.

## Post-publication CI repair — SPECIFIED

Baseline: release commit c97d5d8515d30029446c97f5c7ec2017c8244ecf is pushed; Open VSX
and GitHub v0.0.80 downloads match the tested 97d6aebac9deea3b2d7bfadd31d1822b91384a419d09d7cc9bd564e8675bd3d3 VSIX.
Quality run40409196050 failed two runtime-discovered oracles: action-receipt12/13 and
runtime-debugger10/46; other132 passed. The aggregate failure dump lost individual
failed-check details. Full release remains PARTIAL; no live installation is authorized.

Bounded unit: reproduce the two failures with isolated filesystem fixtures, identify
whether production code or test-environment setup is responsible, and repair the
smallest correct surface. Hypothesis only: a Windows short-path TEMP alias conflicts
with deliberately strict physical-path containment. Do not relax junction/symlink
rejection or change immutable public0.0.80 bytes. A production fix would require a new
corrective package; a fixture-only repair must prove unchanged application runtime.

Reconcile: reuse ActionReceiptStore, RuntimeDebugSessionStore and their existing
selftests plus the serial oracle integration/sweep. The stores intentionally require
physical paths. Existing graph navigation and ADR/capability records were checked;
no alternate receipt/session store is being introduced. No capability-map delta yet.

Acceptance: exact failed-check reproduction; ordinary and aliased scratch fixtures;
negative containment controls remain passing; complete runtime-discovered oracle run;
typecheck/lint/precommit and relevant CI gates. If sweep diagnostics change, prove a
failing oracle retains its bounded check name/detail without masking failure. Inspect
the complete diff and distinguish source/test fixes from shipped-artifact evidence.

Evidence: test-results/release-0.0.80/ci-repair-* and existing github-ci-40409196050.
Rollback: reviewed c97 tree; revert only this repair's explicit paths if necessary.
No shared database, live/Dev bundle, game files, credentials or desktop interaction.
Use private environment/data/config/coordination roots for all runtime tests. Preserve
the failed CI and every failed local run. Commit/push only a validated public-release
completion fix, then require green CI and update/read back GitHub/Notion provenance.

Reproduction: real Windows8.3 alias produces receipt12/13 and adapter11/46 failures;
the corresponding physical path passes119/119 and45/45. Exact workflow command
recovers both. The first complete rerun passed both but failed artifact-pipeline:
the reproduction TEMP was inside the repository, so target/source-overlap prevention
correctly refused its fixture. Evidence ci-repair-verified-c982f5c0ca and
ci-repair-oracles-d0920851 is retained. Move only the private test TEMP outside source
for the full rerun; do not change the artifact safety rule. No production-code delta.

Second full rerun:134/134 oracles passed; private-root cleanup failed with EPERM.
No matching test Node process remained at inspection, and Windows DELETE-access
probes later succeeded for the root and all remaining DB files. The original locking
cause is unconfirmed. Retain ci-repair-oracles-023ae4ae. Reuse the harness's bounded
owned-root cleanup, switch to asynchronous removal so child-close/handle-release
events can progress, and extend its existing finite retry budget. Directory absence
remains mandatory; no error is ignored. Require repeated full oracle cleanup proof.


### CI repair review, close and AAR — precommit capture

Local repair VERIFIED: exact workflow command converts a real8.3 TEMP alias to its
physical path and both affected fixtures pass119/119 and45/45. Two complete runtime
sweeps pass134/134 with successful owned-root removal;500 route assertions,8 real
HTTP/CLI reporting controls, lint0errors599warnings and full precommit pass. All
application/shared/controller/dependency files remain equal to c97. ZIP inspection
confirms none of these CI harness scripts is in the published VSIX. Public Git/tag/
Open VSX/GitHub artifact readbacks pass. No republish/version bump is appropriate.

Fresh-eyes review: no containment guard or test expectation was relaxed; failed
details are bounded to10 rows with200/1024-character fields, arbitrary fields omitted.
HTTP errors and invalid JSON still refuse. Cleanup exhaustion still fails. Existing
mandatory hooks remain unchanged. No capability-map delta; rollback is the explicit
CI/documentation delta only. Follow-up remote CI remains REQUIRED after commit/push;
this precommit snapshot cannot certify its future outcome. Read back the matching
GitHub release/#20 and Notion safety task for final delivery provenance.

AAR triggers: remote failure, corrected TEMP location, and local cleanup failure.
Sustain: negative fixtures and immutable package hashes kept production guards intact.
Improve approach: keep artifact-test temporary roots outside source; a valid fixture
for one store is not necessarily valid for a complete deployment suite.
Improve tools: the sweep omitted exact failures; bounded details now travel with the
failing endpoint. Asynchronous deletion permits handle-close progress and proves absence.
Highest-risk observed weakness: remote failure summaries concealed the failed checks,
forcing a locally reproduced inference; repaired by tested per-check reporting. The
original remote cause and Windows cleanup delay are not presented as independently
observed diagnoses. Lessons banked here; full Claude/game claims remain out of scope.
Commit point: ci: resolve Windows temp aliases and retain oracle failure evidence.
