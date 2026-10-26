# C05 — measured incremental validation

Lane FULL. VERIFIED local integration (close below supersedes intermediate pending records). GitHub owner #47 (parent #20), Notion task
https://app.notion.com/p/4054618ed15b81749116e21f47c9ac09.

## Plan / acceptance contract
Bounded unit: profile the complete validation path, then extend existing file-local reuse to
unchanged XML/schema/reference facts. Do not cache project approval or deployment verdicts.
Keep all C01-C04 safety/coverage results and unsupported semantics intact. A03 warning identity,
new C04 complaint cases, C06 additional routes/project gates, C07 and release/game work are out
of scope. Kimi paused. User confirms X4/Claude active in live Forge, otherwise quiet.

Reuse runProjectValidation, schema index/registry, referenceCorpus/referenceLanguage,
script-property/symbol and Lua analysis owners. Existing Lua UI cache already stores bounded
file-local facts; schema indexes already cache by source versions. Graph query traced these
dependencies before source reads. No agent-brain recall tool is available in this session.
No new permission, network, standing configuration or persistent cache surface is intended.

Profile before choosing the optimization. Record all timing, including reference/schema loading,
whole-project layers and HTTP overhead. Compare original baseline and final uncached/incremental
execution on the test mod and an immutable representative workload copied from the read-only
vanilla corpus (not the active mod). No benchmark overlaps other owned validation processes.
Measure cold, unchanged and single-edit runs. Require at least50% warm single-edit improvement
when baseline exceeds2s, otherwise no material regression. Report actual timings; do not claim
the reported minute-scale delay was reproduced/fixed if it was not.

Cache acceptance: findings/order/severity/coverage/verdict exactly equal fresh execution after
source changes, file add/remove/rename, sibling references/listeners/registrations, rules, corpus
or schemas, availability and invalid-input/recovery changes. Dependencies must reflect actual
inputs; no line-number-only or path-only key. Fresh whole-project aggregation must see each edit.
Retained data bounded; oversized input still fully analyzed; exceptions not cached; mutations of
returned results cannot poison reuse; same-process failure/recovery proven. No cache can promote
unverified analysis to clean. Expose deterministic test observability without a new public API.
Resource cache freshness guarantees must be declared, tested and not silently overstated.

Required proof: baseline CPU/timing profile; focused cache and dependency parity tests; existing
Lua/XML/schema/reference/project regression suites; real isolated HTTP/test-mod validation,
scratch deploy and stale refusal; typecheck, lint, build and precommit. Existing UI results must
remain semantically identical; inspect the rendered test-mod result if any visible output changes.
Native installed host/game proof is excluded by the user's boundary. Test stack3100/3101 owns
isolated state/config/discovery; verify cleanup and protected bundle/discovery observations.

Risk: stale dependency facts hide errors; retained cache memory; misleading benchmark scope.
Rollback: exact task diff from the complaint-doc checkpoint, then a scoped corrective commit.
No live/installed Dev/game/real-mod writes, push or publication. Preserve main checkout edits.
Evidence: private lab/evidence/claude-program/C05 and sanitized docs/testing/claude-C05-incremental.json.
Update/read back #47, parent complaint checklist and corresponding Notion records in same delivery.

## Baseline / reconciliation
C04 source89b1d86057886826b87a0420a71a85da75add14a. Five pending complaint-document files
are being committed first; exact next baseline recorded after that commit. Four protected paths
captured in C05/baseline-before-doc-commit.json. C04's live discovery changed via the installed
supervisor during its hook; do not treat old discovery hashes as current liveness evidence or
restore them. Fresh instance facts are observation only, not permission to restart live services.
Source review found existing TTL/mtime resource caches. Establish what fresh comparison means
and preserve honest dependency/version evidence. No capability delta until implementation proof.

## Implement / validate / review / close
Docs baseline committed2abc6aa8eaa1a2924e45db81430083c1fa66232e; both precommit runs passed.
CPU profile complete: regression36files/614826bytes warm95-123ms and single-edit99ms;
frozen representative52files/5397907bytes warm43s and single-edit38s. Reference acquisition1.6s.
Hot functions: script-property state transitions/normalization, then schema particle state and
reference literal checking. Unprofiled baseline completed before source mutation: regression
cold903.95ms, unchanged139.42/135.12ms, single-edit146.58ms; representative cold50.59s,
unchanged48.21/47.93s, single-edit47.73s. Corpus acquisition1.15s. Original complete-result hashes
match both profiled/unprofiled baseline runs and final incremental/full runs.

Reconciled implementation: bounded file-fact reuse in existing projectValidation owner for XML
wellformedness, dedicated/routed schemas, file-local symbol/property, literal-reference and
pitfall facts. Whole-project cue/event/manifest/rules aggregation remains fresh. Dependencies
include file bytes/path/kind, schema/property generation and complete project reference sets;
property facts also depend on the file's inferred symbols. No approval reuse relaxation.
Exact readback copies and bounded retained entries/payload; oversized facts bypass storage.
Fresh comparison bypasses these new fact caches; existing resource owners must detect declared
resource changes, with their freshness limitations explicitly recorded and negative-tested.
No-material-regression threshold for sub2s workload: median single-edit no more than baseline
plus max(20ms,10%). Larger workload retains the approved50% reduction target.
No new UI control or result field: exact-result equality is the visible-output contract; existing
rendered deployment result is checked through isolated E2E. Still not verified or resolved.

Measured final core: regression cold936.70ms, unchanged median114.10ms, three unique single-edit
median121.73ms (acceptance166.58ms). Representative cold49.65s, unchanged median3.113s,
three unique single-edit median3.127s,93.45% improvement against original47.729s baseline.
Fresh full runs of those exact edits take48.38/48.31/49.87s and match every result field.
Representative has52files/5,397,907 source bytes; regression36files/33Lua/614,826bytes.
Frozen vanilla source is private; public evidence records selection/hashes, not game source.
This is a measured representative improvement, not reproduction of Claude's active mod latency.

Focused26/26 pass, including cache bypass/copies/bounds/recovery, duplicate paths, sibling
registrations, rules, source/path/kind identity, reference sets, schema removal/edit and explicit
property-corpus refresh. Existing Lua, C04, noise and manifest regression scripts pass. Typecheck
and production build pass. Lint0errors614warnings (unchanged). HTTP/rendered/precommit pending.

Resource freshness boundary: new fact keys resolve owned indexes before reuse. Existing schema
indexes use path-set/mtime; registry discovery is signature/TTL based; unpacked corpus checks its
size/mtime/ctime signature at most once per second. Explicit corpus refresh replaces indexes and
invalidates dependent facts. Packed-game fallback caches by game path and requires service reload
for archive replacement. C05 does not add filesystem watchers or promise same-metadata content
change detection. Full comparison bypasses new file facts, not existing resource-owner caches.
Conservative warning approvals still depend on all validation inputs; this performance work does
not narrow approval authority. Finer approval dependencies and A03 warning identity remain open.

## AAR
Discovery correction: guessed server config paths and PowerShell glob reads failed without
mutation. Use enumerated files and bounded output. Record subsequent measurement/review failures
and retain failed runs; never weaken parity/performance acceptance to manufacture a green result.
Focused first run24/26 exposed two incorrect test assumptions: manifest dependency enforcement
belongs to the deployment/manifest guard, and common.xsd declares debug_text twice. Replaced the
first with a file-set coverage assertion; renamed both schema definitions for actual invalidation.
Benchmark first run correctly refused comparing different edited source identities. Each unique
edit now compares against its own fresh full run; no identity fields are stripped. Failures retained.
Review preserved original ordered symbol behavior for duplicate paths and a separate full-run
symbol oracle. Operator degradation checkpoint declared after repeated discovery/test mistakes;
finish only C05, then fresh context. No further unit starts in this session.

## Required validation correction and runtime safety pause
The actual API/deploy/rendered scenario passed, but the expanded runtime-index sweep failed2/134
oracles (both initial and diagnostic retry). Saved trace responses identify stale oracle fixtures:
agentKeys requests workspace.compile@1 although the baseline catalogue already exposes@2;
artifact-pipeline mutates Lua in passthroughFiles although C01 import owns it in uiSourceFiles.
Extend this unit only to correcting those two existing oracle fixtures and preserving full failure
details in the integration receipt. No permission/production semantic change or weakened byte
assertion. Re-run all134 before closure; failed runs remain evidence.

At01:03:22 local the installed Antigravity supervisor started a new live sidecar (PID61684,
parent73520), refreshing stable discovery. Installed live/Dev bundles and Dev discovery unchanged;
isolated test ports closed and treeGone=true. No task-issued live restart; cause unknown. Further
runtime/heavy tests paused; user asked whether they/Claude restarted the host and whether live
Forge is healthy. Do not restore live discovery or terminate its processes. C05 cannot close or be
committed as verified until required tests pass after the environment is reconciled.

Environment reconciled: user reports updating an extension inside the live build. Observed live
extension-host PID36436 was recreated at01:03:05 before its new supervisor/sidecar. Dev host47608
and backend71180 have remained running since October24/25; its last logged backend restart was
October25 at04:23:58 local, not this C05 run. Screenshot's Dev notification is therefore historical
for the current observed instance. User's update is consistent with the live host restart; no task
restart or installed-bundle mutation. Record fresh baseline and resume isolated validation only.

## Final review (precommit pending)
- Bounded file facts: DONE with26/26 focused checks, actual hits, exact full-output equality,
  exceptions/copies/budget/duplicate-path/recovery controls. Final verdict/approvals are not cached.
- Measured performance: DONE. Representative small edit93.45% faster; extra largest657747-byte
  XML edit87.36% faster (6.117s incremental vs48.383s full), with full-result equality. Original
  hashes retained. Cold validation not improved materially; no actual Claude-mod timing claim.
- Actual API/rendered/deploy: DONE. Seven groups include warm response equality, schema errors
  and repair, sibling registration removal,36 exact file hashes,409 stale refusal without writes,
  fresh preview identity and amber incomplete-check outcome. HTTP cold1.31s/warm0.14s/edit0.13s
  in first run; final receipt preserves exact second-run timings. Browser image inspected.
- Runtime regression: DONE after fixture correction.134/134 runtime-index oracles; selected E2E
  1passed/0failed/0flaky, process tree stopped. First failed run and diagnostic retry retained.
- Static/build: lint0errors614warnings; production build passes after oracle corrections. Full
  precommit/type/receipt/capability gates still running; do not close from these earlier greens.
- Isolation: no task calls to live API or game. User's live-host extension update reconciled;
  fresh post-E2E four protected hashes match, ports3100/3101 closed. No native/game/package proof.
- Fresh-eyes review: actual cache consumers return plain cloneable facts; keys bind path/kind,
  exact content, current schema/property identity and project reference sets. Duplicate paths use
  old ordered symbol logic. Returned data cannot mutate retained facts. Existing corpus TTL,
  mtime and packed-game fallback freshness limits remain explicit rather than overstated.
- Deferred: approval narrowing/A03, additional A01-A17, C06-C07, coordinated game/release/install.

AAR supplement: the expanded oracle sweep exposed stale test fixtures at two migrated ownership
boundaries. Fix the fixture to exercise the current owner, retain the original permission/byte
assertions, and rerun all discovered oracles. Capturing only pass/status omitted useful failure
context; recovered exact responses from Playwright trace resources and now persist every oracle
response. Highest evidenced weakness: narrow green tests can miss stale integration oracles after
contract/source-domain changes. The134-oracle isolated run now covers those boundaries. No new
production credential/network/delete surface. C05 is the fifth substantial unit since C01; no
permission-policy change is hidden in the oracle fixture version update.

## 2026-10-26 — C05 incremental validation — VERIFIED local integration

Existing bounded analysis reuse now covers XML/schema/reference/symbol/property/pitfall facts,
with exact source and resource dependencies. Full project verdicts, cross-file checks and approval
policy remain fresh.26 focused parity/invalidation/recovery groups, existing Lua/C04/noise/manifest
regressions,134 runtime-discovered oracles and7 actual HTTP/browser/scratch-deploy groups pass.
E2E1passed/0failed/0flaky; owned tree stopped; rendered incomplete-check result inspected. Final
lint0errors614warnings, production build and full precommit/type/policy/receipt audits pass.
Two migrated oracle fixtures corrected without weakening permission/byte assertions; failures kept.

Frozen52-file/5.4MB workload: warm single-edit47.73s ->3.13s median (93.45% reduction); largest
658KB XML edit6.12s vs48.38s full (87.36%). Regression mod146.58ms ->121.73ms. Complete outputs
match fresh full runs and original baseline hashes. Cold representative validation remains~50s;
no actual active-mod latency or universal validation claim. Evidence: docs/testing/claude-C05-incremental.json.
Acceptance/review/AAR: docs/plans/2026-10-26-c05-incremental-validation.md. Rollback baseline2abc6aa;
a scoped corrective commit reverses the task if necessary. Resource TTL/mtime/packed-cache limits
remain explicit. Approval authority is not narrowed; A03 and other additional complaints stay open.

User's live-host extension update explains the contemporaneous host replacement consistently with
process logs; no task restart or installed bundle write. Fresh post-E2E protected hashes match and
ports3100/3101 stopped. No game/native/package/public proof or push. C06-C07, additional requests
and coordinated game/release/install windows remain open. Kimi paused. C05 is local only.
Commit point: perf(validation): reuse unchanged project validation facts.
