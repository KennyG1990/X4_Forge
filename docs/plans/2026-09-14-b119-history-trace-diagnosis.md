# B119 full-run history trace diagnosis

Status: VERIFIED for trace localization; CPU owner/repairs unproven. FULL read-only diagnostic lane; full builder remains PARTIAL.

Scope: correlate both history failure traces with test actions and source owners. Distinguish
browser editing latency, API latency, assertion waits and teardown without summing nested spans.
Use retained full-integration-20260914 traces; no browser rerun or product/test/config edits.
Baseline: completed132-test run129passed/2failed/1flaky; all410pins/403members and protected
files/HEAD rechecked07:50:45Z. Preserve all dirty work and original traces.
References: full objective, full-integration plan, current SourceEditor/test/history owners,
graph source/workspace navigation and existing capability map. No capability-map delta.
Acceptance: exact attempt/time/action evidence, API request timing where available, named
uncertainties and a bounded next measurement. Negative: avoid counting parent+child durations
twice; do not infer CPU ownership from elapsed Playwright actions or an aborted request alone.
Validation: original zip trace read/JSON parsing, source-line readback, protected checkpoint
after investigation. Record findings here and handoff. No source implementation or GUI change,
so no new rendered/package/native gate applies to this diagnosis; all remain open for product.
Rollback: no product mutation. No Git, agents, external state/wiki/issues/memory writes.
Skills: executing-plans keeps the batch bounded; graphify navigates existing graph only.
Graph save-result omitted for read-only scope. Prior recall returned older loosely related
titles rather than a demonstrated solution; no old content used as diagnosis.

Reconciliation extension: compare the adjacent Lua-roundtrip workspace-request cancellation
against its actual navigation/creation timestamps and existing polling owners. This prevents
misattributing network waits/cancellations to rendering or reload. Run existing in-memory
continuous-polling selftest, including final-unsubscribe abort and rejected late completion.
No new product behavior, failure suppression, network call or browser run is authorized here.

## Evidence / review — 2026-09-14 07:58Z

Original artifacts: test-results/b119-full-integration-20260914/browser/
x4-ui-source-editor-Source-5c429-menu-row-and-Text-authoring-chromium{,-retry1}/trace.zip
and x4-ui-source-editor-Source-9228f-ision-and-workspace-journey-chromium{,-retry1}/trace.zip.
Read ZIP entries directly with System.IO.Compression.ZipFile/OpenRead and StreamReader;
parse newline JSON test.trace,2-trace.trace and *.network. No extraction or original writes.

History first/retry test.trace:588/588 and591/591 before/after calls; zero unclosed calls.
Both reach final alternate edit. First alternate Apply starts60602ms, retry59354ms and
takes2747ms. Timeout60000ms is crossed by ongoing work, not an observed failed source/pixel
assertion. Do not treat the post-timeout screenshots/assertions as a passing test.

First Undo source-line3785: browser call@11173 starts1034075.536; input dispatch begins
1034129.714, click done1036106.689, navigation wait ends1036118.602. Thus1976.975ms is inside
click dispatch versus54.178ms before dispatch and11.913ms afterward. Trace cost is elapsed
browser action time, NOT a CPU stack profile or proof of one SourceEditor function.
First test-source expect@217 follows the click and waits3033ms for saved source transition.
Other long source transition waits3379/3237ms. Retry still has1715-3441ms authored action
clicks and roughly2009-2311ms Undo/Redo clicks despite shorter API waits. This contradicts
an explanation based only on one stalled assertion or only on the first attempt's API delay.

Network entries: first138API requests/retry133. First workspace POSTs at07:33:31.258,
07:33:40.380,07:33:50.710 wait3071.371/3376.820/3254.596ms before response, all200.
Concurrent compile/project-files requests wait similarly; do NOT add these overlapping waits.
Other first workspace POSTs mostly638-777ms; retry workspace POSTs shown are subsecond
(largest964.281ms total). Transport receive times are a few milliseconds, not multi-second
body transfer. Causal backend function/IO/queue contribution remains unproven.

Source owners inspected: SourceEditor projectedPreview useMemo5032+ and existing sessionOwner/
previewContinuation; App source-save debounce1869 is300ms, so do not mislabel it as a3s timer.
History test3785 clicks,3786 polls exact source, captures actual pixels and all sibling source.
Tests contain no new artificial sleeps; retain60000ms and every source/history/pixel assertion.

### Adjacent Lua-roundtrip cancellation (scope expansion documented above)

Both traces contradict a reload-based explanation:
- First reload starts1637961.615 monotonic; failed workspace GET starts1645945.328,
  about7.984s later, immediately after POST /api/agent/workspaces at1645941.451.
  POST succeeds201. Old GET receives200 but reports ERR_ABORTED; new GET1646271.802 succeeds200.
- Retry reload1703088.759; failed GET1711186.066, about8.097s later, next to creation POST
 1711138.366 (201). Replacement GET1711478.084 succeeds200. Failure callback recorded07:44:46.621Z.
- Current App2341+ creates workspace, calls selectWorkspace and setCurrentWorkspaceId.
  App2002+ polling resource key includes currentWorkspaceId; useContinuousPolling effect
  cleanup unsubscribes on changed identity. continuousPolling194+ cancels final subscriber,
  cancelRunning252 aborts its controller. WorkspacePollingClient passes that signal to GET
  /api/agent/workspaces. Identity/late-result guards protect against wrong-workspace adoption.
- Existing runContinuousPollingSelftest run through bundled Node+tsx --eval, terminal0,
 44/44. Exact checked negatives: final unsubscribe abort/removal; late completion invokes no
  callback; mismatched full response no cache advance; pre-aborted poll no request; authority
  change blocks transfer and late response/cache advancement. No real HTTP or filesystem writer.
- [HYPOTHESIS,~90%] This one aborted summary GET is intentional old-workspace cancellation,
  not failed Lua persistence. Alternative: unrelated request cancellation during the same
  transition. The trace lacks the runtime abort-reason/request-identity pairing, so no oracle
  change is yet justified. Whole requestFailures=[] must not simply become ignore-all-aborts.

## Close / next unit / AAR

Trace timing and request lifecycle localization done/evidenced; attribution to a CPU owner
and causal browser cancellation classification remain unproven. Full132 gate stays FAILED.
No product or test edits; no capability-map delta. No rollback needed. Full9journeys/3menus/
12references/packaged/native obligations retained. All410pins/protected guards checked after.

Next unit: existing in-browser profiler on the actual New-menu history actions, with source
and oracle frozen apart from explicitly planned opt-in measurement wiring if needed. Attribute
dispatch time to existing owners before repairing; inspect concurrent API path separately.
For roundtrip, capture exact old-scope request/signal cancellation and prove unexpected
same-scope aborts/HTTP failures remain rejected before any scoped test-contract correction.
MENU corpus-status timeout remains a separate open diagnosis; do not silently waive it.

AAR triggered: oversized initial skill read (reread fully), overly broad artifact listing,
and guessed plan/WorkspaceSelector paths that did not exist. All read-only, but repeated lookup
mistakes justify a degradation checkpoint and fresh goal turn before code changes. Use actual
rg-discovered paths, bounded structured fields, and a single confirmed source owner next.
Sustain: retained original traces, explicit non-addition of overlapping spans, separate
network/browser timing, source-grounded cancellation chain and existing44/44 negative tests.
Highest-risk evidenced weakness: mistaking all cancellations for faults could induce removal
of legitimate workspace-identity cleanup; conversely ignoring every abort would hide real
failures. Narrow runtime identity/reason evidence is the next correction boundary.
Lessons banked here only; no global memory/wiki/issue/Git/release/install/game/config changes.
Checkpoint title: test(ui): localize history latency and workspace cancellation (not committed).
