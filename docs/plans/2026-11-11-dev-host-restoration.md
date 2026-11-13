# Restore and update FORGE DEVELOPMENT

Task: restore the isolated native Dev environment, then qualify and install its complete current payload.
Lane: FULL. Owner: existing #20, linked #64.
Status: PARTIAL overall. Internal staging and candidate qualification are VERIFIED; current native backend/CodeSense and bounded saved-state reads pass. Native pixels/game, full schema-body inspection and a complete post-start tree recheck remain deferred.

Resource-policy reconciliation, 2026-11-12: numeric RAM/CPU admission envelopes below are HISTORICAL and superseded. Current policy has no fixed free-memory minimum or total-CPU percentage gate; observed numbers and failures remain evidence.

## PLAN — specified before implementation

Reuse the existing private launcher, profile, standalone Workbench, CodeSense and corpus. Preserve live Forge, default editor profiles, AiLive, other checkouts, game/saves and credentials. Restore the Dev workspace source pointer without replacing saved graphs. Qualify a complete app/controller/supervisor/MCP payload before native cutover; a dist-only replacement is insufficient when runtime dependencies differ.

Acceptance: exact private roots and source/payload identities; guarded runtime staging; fresh root/controller builds; staged probe and package inspection; full frozen real-Lua/native replay; every runtime-indexed oracle; all six permanent ware tests with actual packaged dependencies and real headless rendering; exact-owner native startup; unchanged cold saved workspace/config/mod data; bounded native API and fresh CodeSense initialization evidence. Negative controls must reject bad runtime inputs, stale source/target identities and false-success/ownership failures.

Risks/rollback: default npm staging still re-resolves ranges. Supplied-runtime staging is not transactional rollback after target replacement. Keep incomplete stages inactive. Native cutover moves only owned physical payload siblings and retains one displaced payload; guarded inverse moves restore it. Never copy a profile/cache/reference index or force a prompt. The user's standing authorization covers this private restore/update; real-mod/game/credential writes remain outside scope.

Evidence: finite local QA packets named below; this repository plan/hand-off, existing #20 and private Notion field log. Exact private process/profile/config/client identities belong in local QA, not public issue updates. No public version bump or publication in this unit.

## BASELINE / RECONCILE

Baseline source was53a1e1b. Native Dev restored successfully but still ran an older manifest79/backend53c960 while the editor source was newer. Existing saved canvas and disk Workbench were distinct and preserved. Native activation did not prove installed current fixes.

Reused owners: stage-app.mjs, root/extension builds, staged probe, VSIX inspector, existing provisioning isolation transformations, frozen315/native-oracle drivers, permanent validation-trust.spec.ts and the existing native launcher. The sealed historical dist-only installer pins obsolete assumptions and rightly refuses the new runtime dependency; it was not bypassed or modified.

The qualified immutable public83 runtime closure supplies matching dependencies including the Windows binding. Optional --runtime-from extends the existing stage owner: absolute physical roots, exact dependency/lock specs, no overlap/aliases/links/hardlinks,128MiB/10000-entry input limits, byte hashes and before/after-copy drift checks. Initial input validation precedes stage replacement; copied drift is not automatic recovery. Default staging remains unchanged; supplied-runtime mode makes no npm/network call.

Capability delta: internal staging supports explicit matching-runtime reuse. No product route/grant/writer change;89routes/64surfaces unchanged. The local input meter/refusal bounds were reviewed; no new spend/network/delete target was introduced.

## IMPLEMENT / VALIDATE

| Method | Observed result |
| --- | --- |
| Runtime selftests, focused lint/type and full manual precommit | PASS; actual old-runtime refusal preserves an existing stage; accepted repeated staging is byte-identical |
| Fresh root and controller/supervisor builds | PASS |
| Staged production probe |19/19PASS with its builtin hermetic fixture |
| Normal commit and exact required CI |33b30a55ffb5e6aae89320e7464f551d60603926; normal hook exit0; non-force remote parity; Quality43141948064SUCCESS |
| Internal base package / inspector |2202entries,79,103,490unpacked/30,015,968archive bytes; unpublished |
| Complete private candidate |2200files/79,100,745B;2198archive-identical, only existing Dev manifest/controller isolation deltas |
| Full frozen native real-Lua/project-check/deploy replay |315/315PASS,0false, owned runtime retired |
| Native deploy controls / runtime-indexed oracles |18/18and134/134PASS; actual producer handles terminal and listener closed |
| Six unchanged permanent ware tests against candidate runtime |6/6PASS,0flaky/failed/bad; ownershipComplete/treeGone;16observations/0failures |
| Actual candidate boot / worker projection | Correct cwd, server/lock hashes and all10declared dependencies inside packaged node_modules; actual child captured |
| Headless rendered production UI | Inspected both PNGs:0false table-field warnings,1genuine bad ware warning; all five candidate/root dist files match |
| Native cold cutover / fresh initialization | Complete payload rehashed after sibling move; actual private main/extension host/backend/discovery/CodeSense agree; fresh CodeSense init/index logs |
| Bounded native API / saved-state reads | Schema headers200; config/workspace/status bodies200 and within cap; actual backend/private roots and saved graph agree; all9cold essential byte hashes unchanged |

Current server identity is460a2aecc3ae2ae6ce71d0b829187782c79a341c9c1b28c198da3337cde8dd7d. Current HTML isfe79cbfdcdfa0ed063990cc9fa5245c643b4a43c7817c49418f1cdccaa016c5b; the older8355pin is stale. Qualified runtime lock remainsa5dd40d3820ba2a51fc26d68bc7c11b1bfa332405301af1390de12672196af6b. Test Node24.22.1 and actual native Node24.15.0 are separate evidence; native reads do not claim the full suite ran under the latter.

The existing staged app was moved into the sole candidate rather than copied again. The temporary E2E config was retired. One displaced native payload is the rollback route; no additional installer/helper/profile family was created. Public0.0.83 and its retained installation/archive remain unchanged. The internal Dev identity/version is not a new marketplace release.

## Reconciliation changes and retained failures

- Initial focused lint failed on Node globals; explicit imports corrected it without weakening rules.
- The first staged probe used a review corpus in a branch expecting its builtin fixture and failed18/19; correct hermetic input passed19/19.
- The first candidate E2E adapter used node-e/require without a real CLI script argument. The product correctly refused its validator fingerprint before tests. Node--import preflight plus the actual server CLI entry corrected the adapter; no product/test assertion changed.
- A fresh cutover preflight found the historical private owner absent and another distinct editor active. Cause is unknown. A reused PID was not acted on. Warm restart became guarded cold restore; the other editor stayed untouched.
- Formatted CPU telemetry disagreed with aligned direct kernel/PDH readings. Raw ticks/timestamps are retained privately; the25percent threshold stayed unchanged. The reliable primary meter was reconciled before bounded reads, rather than selecting a favorable counter.
- HISTORICAL admission, superseded 2026-11-12: 8GiB was swap/start/heavy admission. After the admitted application starts, bounded lifecycle GETs alone use no fixed free-memory minimum, one client,5s timeout and1MiB/body; no scan/validation/check/deploy execution. Heavy work stays held. The schema catalog declared3,419,058B, so only its200headers were accepted; compact status proved actual owner/private roots.
- Restricted process visibility produced an incorrect disappearance annotation; elevated exact-handle checks corrected it without another restart.
- Implicit Windows Python decoding corrupted32human-text fields in a copied proof archive. Pristine originals and attachments remained byte-identical. Explicit UTF8 recapture repaired the archive; both frozen drivers were ASCII/token/AST-identical under either decoding, so actual test semantics stayed valid. Failed cleanup refused before removing that output.
- Automatic review rejected an issue update containing private operational identifiers. A sanitized public code/test summary succeeded; no indirect bypass was used.

These are declared non-clean changes to methods/evidence, not silent acceptance reductions. No source fallback, suppression, flake budget, ownership timeout, unsafe process kill or live/game write was introduced.

## REVIEW / CLOSE

Fresh-eyes source review found no blocking staging issue and explicitly limited old-stage preservation to initial refusal. Existing behavior owners and every declared negative control were reused. Source code is committed/pushed/CIgreen. Current native activation and private saved-state reads are machine proof; headless Chromium rendering is not native webview/pixel or game proof.

Remaining: full post-start payload-tree reread when resources permit; full schema-body parsing under an appropriate catalog budget; native presentation/interaction; actual X4/compiler/device behavior; consumer check retirement; qualified public release. Keep #20/#64/#61/program open. No new feature-count or public-delivery credit.

## 2026-11-13 private-liveness reassessment - SPECIFIED

Bounded FULL diagnostic unit, no source install or restart inferred. Native census used the wrong executable name Antigravity.exe and therefore could not confirm the Dev IDE; exact PID+creation/native path now confirms original19712 Antigravity IDE.exe, its private profile and original ancestry19712->42156->42356->42464, plus CodeSense43480. This corrects uncertainty, not an observed crash. Existing backend42464 command points to private app; discovery50438/start07:02:21 is consistent with process creation07:02:18 but remains historical. Native Get-NetTCPConnection and netstat currently show no listener at that owner/port, so process existence alone does not clear backend health.

Acceptance before any control: exact profile/creation/parent chain and private discovery/config roots; current installed server/controller/runtime hashes, private workspace/config essentials unchanged; one unauthenticated public identity GET at the recorded private address,5s timeout/1MiB response maximum/no proxy, followed by native owner recheck. No token is sent until current listener/identity authority is established. Refusal/timeout/foreign identity stays failed/incomplete; do not restart solely after an observation timeout. Existing startup logs may establish historical activation only. No live/default-profile API request or write, game/mod/save action, computer use, corpus scan/build/package/install or dependency mutation. Record finite sanitized results in existing QA and this plan/handoff. Rollback is ending only the bounded read; no standing state changes. If recovery is actually needed, document exact owned-handle/child retirement and preserved roots before invoking an existing launcher; no parallel launch while the private owner remains.

### Actual private-liveness close - VERIFIED bounded scope, whole restoration PARTIAL

Original Dev main19712/creation07:02:13.835115Z remains Antigravity IDE.exe with the exact private profile, extension and Workbench/source workspace. Extension host42156, supervisor42356, backend42464 and CodeSense43480 retain original ancestry/creation. Installed server460a2aec/controller53cda748/supervisoraa30c793/runtime-locka5dd40d3 are distinct from dirty source and unchanged. Workspace title override remains FORGE DEVELOPMENT; scratch game/extensions/mods and configured9.00 corpus remain private/read-only as designed. Current-instance logs record Forge and CodeSense activation at07:02:18/19; this is activation/process proof, not fresh native pixels or CodeSense result parity.

Initial public urllib identity read3cd911ad21230510d76d0ccdf47daf490fe0a92f4f8659c07bea875e9436af17 timed out at5.015s; retain UNAVAILABLE_OR_INCOMPLETE. Re-observation found the SAME backend alive, not terminal. The initial filtered network query was misleading: its State projection is null/CIM0, while the unfiltered entry binds exact backend42464 to127.0.0.1:50438. A staged connect/request/response-header diagnostic then returned200/4461bytes in1.500s, connect15ms, before the5s bound: b18692e11a87433f717adf6b76d86ac101a1309668e02f45f374a20d397906d2. Native owner/address recheck agrees afterward. No restart was justified or performed. Availability observed now does not retroactively upgrade the first timeout.

Both actual reads pin the same9private essentials before/after: discovery, launcher, workspace, settings, config, installed server/controller/supervisor/runtime lock. All hashes unchanged. Token not read/sent; only unauthenticated private /api/reference/status requested, no live endpoint. Two finite data records7004bytes/no source/helper/runtime/backup copy. Full body schema, private authenticated API state, complete payload-tree, native rendering, newest source installation and game behavior deliberately NOT claimed. These were not required for this narrowed liveness diagnostic. Existing restoration remainsPARTIAL.

Review/AAR NON_CLEAN: exact PID+creation/executable/profile and ancestry recover the actual current Dev owner; a guessed executable-name filter cannot prove absence. Keep poll timeouts inconclusive and re-observe the same owner instead of restarting. Missing installed supervisor.cjs preflight refused before HTTP; actual directory owner is sidecar-supervisor.js, now pinned. A guessed build script path in a parallel read also failed before mutation; no build ran. Network State projection and one HTTP timeout changed the observation method, not ownership or acceptance. Highest evidenced weakness is misleading liveness instrumentation; use unfiltered owner/address plus bounded actual response and preserved first failure. No crash cause, performance improvement, public feature-count, source commit or release claim. Canonical project AAR and existing Notion/GitHub projection receive this correction; no Codex memory/skill write.

Native eyeball queue, unavailable without desktop use: select the taskbar window named FORGE DEVELOPMENT; confirm the preserved graph is visible, the Workbench/current source folders remain in Explorer, and Output/X4CodeSense shows the fresh initialized/indexed messages. Do not deploy, switch graphs or open the workspace through a default-profile file association for this check.

## Evidence / AAR

Local QA owners: forge-1111-dev-host-restoration.json; current-package/current-payload.json.gz; current-native/current-oracles/current-cutover.json; current-e2e-proof.json(.gz) and current-e2e-encoding-repair.json; two canonical ware PNGs. Exact commands, original failures, private identities, receipts, admissions and rollback bytes are retained there. Canonical project/workflow AAR ledgers and private Notion QOL were updated.

Sustain: existing stage/lifecycle/test owners, matching immutable runtime closure, exact bytes and actual process handles, preserved saved contexts, one rollback and explicit proof layers.
Improve approach: source-folder identity must not be confused with installed payload; read real contracts/paths, use explicit UTF8 and preserve the real CLI entry. At clustered invocation mistakes, source was committed and native cutover handed to fresh context.
Improve tools: public updates need public evidence summaries; startup/large catalogs need resource-aware compact observations. A reopened archive must also match pristine inputs, not merely itself.
Highest evidenced weakness: source-green or self-consistent evidence can misrepresent the installed product. Full candidate/runtime identity, original-input comparison and actual native ownership reduce that risk; native pixels/game stay explicitly partial.
