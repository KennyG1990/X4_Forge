# Restore and update FORGE DEVELOPMENT

Task: restore the isolated native Dev environment, then qualify and install its complete current payload.
Lane: FULL. Owner: existing #20, linked #64.
Status: PARTIAL overall. Internal staging and candidate qualification are VERIFIED; current native backend/CodeSense and bounded saved-state reads pass. Native pixels/game, full schema-body inspection and a complete post-start tree recheck remain deferred.

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
-8GiB remains swap/start/heavy admission. After the admitted application starts, bounded lifecycle GETs alone use6GiB, one client,5s timeout and1MiB/body; no scan/validation/check/deploy execution. Heavy work stays held. The schema catalog declared3,419,058B, so only its200headers were accepted; compact status proved actual owner/private roots.
- Restricted process visibility produced an incorrect disappearance annotation; elevated exact-handle checks corrected it without another restart.
- Implicit Windows Python decoding corrupted32human-text fields in a copied proof archive. Pristine originals and attachments remained byte-identical. Explicit UTF8 recapture repaired the archive; both frozen drivers were ASCII/token/AST-identical under either decoding, so actual test semantics stayed valid. Failed cleanup refused before removing that output.
- Automatic review rejected an issue update containing private operational identifiers. A sanitized public code/test summary succeeded; no indirect bypass was used.

These are declared non-clean changes to methods/evidence, not silent acceptance reductions. No source fallback, suppression, flake budget, ownership timeout, unsafe process kill or live/game write was introduced.

## REVIEW / CLOSE

Fresh-eyes source review found no blocking staging issue and explicitly limited old-stage preservation to initial refusal. Existing behavior owners and every declared negative control were reused. Source code is committed/pushed/CIgreen. Current native activation and private saved-state reads are machine proof; headless Chromium rendering is not native webview/pixel or game proof.

Remaining: full post-start payload-tree reread when resources permit; full schema-body parsing under an appropriate catalog budget; native presentation/interaction; actual X4/compiler/device behavior; consumer check retirement; qualified public release. Keep #20/#64/#61/program open. No new feature-count or public-delivery credit.

Native eyeball queue, unavailable without desktop use: select the taskbar window named FORGE DEVELOPMENT; confirm the preserved graph is visible, the Workbench/current source folders remain in Explorer, and Output/X4CodeSense shows the fresh initialized/indexed messages. Do not deploy, switch graphs or open the workspace through a default-profile file association for this check.

## Evidence / AAR

Local QA owners: forge-1111-dev-host-restoration.json; current-package/current-payload.json.gz; current-native/current-oracles/current-cutover.json; current-e2e-proof.json(.gz) and current-e2e-encoding-repair.json; two canonical ware PNGs. Exact commands, original failures, private identities, receipts, admissions and rollback bytes are retained there. Canonical project/workflow AAR ledgers and private Notion QOL were updated.

Sustain: existing stage/lifecycle/test owners, matching immutable runtime closure, exact bytes and actual process handles, preserved saved contexts, one rollback and explicit proof layers.
Improve approach: source-folder identity must not be confused with installed payload; read real contracts/paths, use explicit UTF8 and preserve the real CLI entry. At clustered invocation mistakes, source was committed and native cutover handed to fresh context.
Improve tools: public updates need public evidence summaries; startup/large catalogs need resource-aware compact observations. A reopened archive must also match pristine inputs, not merely itself.
Highest evidenced weakness: source-green or self-consistent evidence can misrepresent the installed product. Full candidate/runtime identity, original-input comparison and actual native ownership reduce that risk; native pixels/game stay explicitly partial.
