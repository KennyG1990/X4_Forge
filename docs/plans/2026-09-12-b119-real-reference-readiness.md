# B119 real reference readiness for Lua browser journey

Lane FULL. Status PARTIAL. Direct Astra, no workers. Full canvas-first goal stays ACTIVE/PARTIAL.

## Plan and baseline

Bounded unit: prepare genuine reference metadata in the existing owned ephemeral stack before the
Lua download/import browser journey. Modify only tests/e2e/x4-ui-source-editor.spec.ts; no product,
config, renderer, loader, indexer, schema, history, game or mod change. Reuse normal corpus API.
Baseline:test-results/b119-manifest-ready-20260912/baseline.json and exact spec snapshot. HEAD unchanged,
pre-existing dirty files protected. Prior real browser failed after New menu because manifest was idle;
receipt and unmodified HTTP response are in b119-import-guards-20260912. No speculative product diagnosis.
Authoritative sources: full goal/original brief, canvas-first contract, ADR-F5 shared reference ownership,
capability-map visual-authoring obligations, actual referenceRoutes/referenceManifest/CorpusAssets code.

Reconcile: graph direct referenceRoutes->referenceManifest import. /api/reference/status is observational;
/manifest?limit=1 schedules an idle index via scheduleReferenceManifest. Existing generations are reused;
no force refresh is needed. Directory Settings normally schedules the index; env-only ephemeral setup
does not perform that flow. Integration script already uses coverage to start/wait a genuine scan.
Search tests/e2e found simulated metadata fixtures, not a reusable real-index readiness helper.
No capability-map delta. No new service/index/loader required. Actual assets remain read-only.

Implementation: a fixture derived from existing Playwright test, used ONLY by the Lua file journey.
Before initiating a scan, use validated E2E_API_ORIGIN and assert status.database is an absolute path
under os.tmpdir()/x4forge-e2e-state-<pid>/data/reference-manifest/index.db. Negative pure selfchecks
must reject live/foreign/traversal/missing database paths. Preserve ephemeral server reuseExisting=false.
Poll existing manifest endpoint until available+ready with matching nonempty completed generation,
positive file count and same root/database. Error/unavailable states must fail, not become success.
Refresh only the lightweight corpus status to consume that completed generation; attach real initial,
ready and consumed responses. No mocked status/manifest/file responses and no copied live database.
Use a90-second preparation deadline in a120-second fixture budget (existing API startup budget is120s);
the actual interaction test remains60s and retry1/zero-flake policy is unchanged. On failure attach
diagnostics, fail the fixture and let existing runner lifecycle own cleanup. No independent process owner.

Acceptance: genuine manifest preparation completes or fails explicitly; same current generation/root
used by actual loader; real browser reaches canvas and full original journey assertions. If another gate
fails, preserve evidence and remain PARTIAL. All prior source/byte/history/collision/workspace checks stay.
Validation: module-load negative selfchecks via matched runner discovery; whole tsc + strict touched lint;
full unchanged Lua browser journey with serial3200/3201; visually inspect screenshots/trace; verify38input
pins,19persistent guards and additions/deletions, lifecycle complete and owned ports/processes gone.
Review full exact delta. Refresh code graph. Evidence:test-results/b119-manifest-ready-20260912.
Rollback only exact owned patch against snapshot; never restore entire dirty files. No Git/push/release.

Risks: disk/CPU load from indexing actual corpus; bound wait and preserve existing128-file/4096-row
batching and scan progress. Failure never weakens canvas assertion. No spend/external network/delete
surface; only existing loopback API and its isolated DB writes. Live Forge/Deckwright/config are protected.
Missing native/installed/3menus/12reference/scenarios/numeric gates remain required outside this unit.
Previous turn PROGRESS. AAR/close pending; do not turn preparation into a substitute authoring success.

Implementation checkpoint08:19Z: one spec changed. Scoped auto fixture reuses APIRequestContext and
E2E_API_ORIGIN; absolute scratch-path positives plus7invalid path selfchecks. Genuine index response
must be ready/nonempty/same root/database/generation; lightweight status refresh consumes that generation.
Preparation evidence is attached even on failure. No existing test-body checks changed; only that test
uses the extended fixture. Matched runner discovery08:17:38..08:17:40PASS0, same14tests, pure guards pass.
Whole tsc08:18:10..08:19:05PASS0; strict spec lint08:18:10..08:18:24PASS0; whitespace check0.
Review skill applied: owner/isolation/failure/deadline checks re-read; reviewctl unavailable on PATH,
manual full-diff review plus actual gates is fallback. Rendered baseline08:19:33:38inputs/19guards,
3200/3201free,Deckwright3100pid30164,no X4/Conan. No source edits during the run.

Budget amendment after measurement: first run08:20:02..08:23:16FAILED0/1,0flakes entirely in preparation.
Trace proves same real generation progressed340160files at08:21:44 to748578files at08:23:13; no error
state or frozen scan.90seconds was an unsupported estimate for this million-file corpus. Raise ONLY
preparation poll deadline to600seconds and fixture budget630seconds; actual UI test stays60seconds.
This is a measured environment-bootstrap budget correction, not relaxed authoring behavior or an oracle.
All assertions/metadata provenance remain. Last live status query raced completed teardown and refused
connection; terminal wrapper and structured lifecycle confirm completion, not a reason to restart early.
After08:24:49:38inputs/19guards unchanged,no additions/deletions;3200/3201gone,3100still30164,
ownership complete,treeGone,no remaining/terminated PIDs. Evidence:after-1.json,e2e-verdict-1.json,traces.

Second run08:28:40..08:32:59FAILED0/1,0flakes, but genuine preparation succeeds:1,028,384files, current
generation1789201726522-f21cb8c5e3. Actual New menu canvas/source/XML/hierarchy checkpoint passes and PNG
was visually inspected. UI later times out on Add Text: trace explicitly shows health-card intercepting
pointer events. Screenshot confirms startup diagnostics covering right-side controls. This is a distinct
reproduced obstruction, not a rendering stall. HealthCardOverlay.tsx already provides normal dismiss.
Amend fixture scope to use that real button via page.addLocatorHandler when the card appears, including
reload; assert it disappears. No fake health response, force-click, DOM removal or product overlay change.
This is ordinary dismissible startup UI preparation, not skipping a required authoring action.
After08:35:10:38inputs/19guards unchanged,no added/deleted files;3200/3201closed,3100still30164; clean
lifecycle/treeGone. Preserve both failed runs and all original interaction deadlines/oracles.

## Final validation and review — 2026-09-12 08:48Z

Third run terminal at08:40:44.313Z: FAILED0passed/1failed/0flakes; both attempts timed out at the
unchanged60s interaction budget. Exact wrapper launch/completion JSON was lost to tool-output
compaction; the structured terminal verdict and trace, not a guessed launch time, are authoritative.
No live runner was restarted. e2e-3-verdict.json records complete report/ownership/lifecycle/treeGone,
zero remaining PIDs and no termination commands. There are no active validators at close.

Genuine preparation PASS:08:37:55.569..08:38:29.861Z idle->ready,1,028,384files,
generation1789202275637-8b1fb8a9e9, actual configured corpus and scratch state67244.
Unmodified attached response extracted to real-reference-readiness-3.json. Normal health-card
dismissal succeeds. Exact New-menu source/XML and Add-widget local/server workspace checks pass;
the real canvas is current and nonempty. Property edit is visibly reflected in hierarchy, inspector,
and canvas, but final persistence/fresh-canvas checkpoint is NOT proven. Download/reload/import/
history/collision/workspace-switch checkpoints remain unreached.

[REPRODUCED] First-attempt trace: Add Text click6111ms, property Apply6121ms. Property Apply starts
at93911ms and ends100032ms on the trace clock; overall timeout begins at100087ms, leaving about55ms
for the following save assertion. Last workspace POST at99991.758ms and GET at100050.964ms have
no terminal response before teardown. Earlier three workspace GETs take4.917/5.202/5.099ms.
This proves an exhausted interaction budget, not a persistent save mismatch. Browser's final frame
shows a6007ms main-thread long task. Root hot function is still unprofiled; no production diagnosis
or speculative fix made. Next bounded unit is actual CPU/interaction profiling, with deadlines and
source/byte/history oracles preserved. Do not increase the60s budget to conceal the stalls.

Visually inspected browser-property-edit-final.jpeg extracted unchanged from first-attempt trace.
Popup is gone, selected authored text and canvas are visible. Text clipping and red diagnostic boxes
remain visible; this is rendered interaction evidence, NOT polished/native/three-menu fidelity proof.
Trace observations contain initial-empty, after-new-menu and after-add-widget; pageErrors and
requestFailures empty only through timeout. No full journey or native validation claim.

Final whole tsc08:36:10.724..08:36:55.178Z PASS0 and strict spec lint08:36:11.115..08:36:12.978Z PASS0.
Matched discovery PASS0 with14tests and path-guard selfchecks; unchanged by six-line dismiss handler.
Final exact snapshot-to-spec diff reviewed: only imports, scoped readiness fixture and ordinary popup
dismissal. No existing interaction assertion, retry policy or actual UI deadline weakened.
Whitespace check PASS0. Graph refresh08:43:46.362..08:44:39.517Z PASS0:11519nodes/29027edges/
351communities, deterministic AST, no LLM workers, built-in HTML limit retained.

after-3.json at08:42:50.134Z:38input pins/19persistent guards unchanged, no added/deleted guard files,
only intended spec differs from unit baseline; HEAD unchanged.3200/3201closed;3100still30164;
no X4/Conan. Graph/doc updates occur after source freeze and do not touch these guarded inputs.
No capability-map delta. No product/config/real mod/game/save/installed release/Git/push/issue/wiki/
global memory writes. Temp DB directory lifecycle remains the existing harness/OS policy; only
process/port cleanup is claimed, not deletion of all scratch database directories.

## Close and AAR

PARTIAL: real-index and popup preparation repaired; required original browser journey remains FAILED.
No verified feature close, commit, release or native proof. Suggested eventual checkpoint title:
test(b119): prepare genuine corpus metadata for Lua authoring journey.
Evidence receipt:test-results/b119-manifest-ready-20260912/receipt.json.
All9goal journeys,3real menus,12reference fidelity, computer-local scenarios, numeric COMM,
full suites/E2E/precommit/package/install/native requirements stay open.

Triggered AAR: prep budget changed after measured million-file scan, three red browser runs, normal
startup popup discovered, oversized diagnostic output, observer racing teardown, diagnostic typo.
Sustain: use actual corpus metadata and immutable source/workspace assertions; let structured runner
verdict own terminal/cleanup truth; ordinary popup dismissal rather than synthetic product health.
Improve approach: separate environment preparation from interaction latency before another long run;
do not diagnose a save defect from the assertion at which the global timeout happens.
Improve tools: select trace fields only, omit HTTP headers, keep outputs bounded, and store long-run
handles immediately. One misspelled PowerShell trace projection was corrected; it changed no inputs.
Highest-risk evidenced weakness: repeated~6s main-thread authoring stalls make a basic visual editing
journey miss its budget. Bounded next experiment: profile the real browser pipeline to identify the
hot owner, then plan the smallest repair with unchanged authoring and negative-path oracles.
Project lesson banked in this plan and handoff; no external/global ledger write authorized here.
Degradation called explicitly after clustered diagnostic mistakes; checkpoint now, fresh continuation
for the profiling unit. Current goal turn classification:PROGRESS; full goal remains ACTIVE/PARTIAL.
