# B119 Lua-file workspace cancellation trace

Lane: FULL. Status: PARTIAL for cancellation diagnosis. Corrected probe/current rendered
Lua-file journey VERIFIED; original cancellation did not recur and remains unproven.

## Plan / reconcile

Goal: identify the actual cancelled request in the existing download/reload/import/
history/collision/workspace journey. Existing full-suite failure is GET workspaces
ERR_ABORTED on both attempts; the nearby successful workspace creation makes final-
subscriber cancellation likely, but previous traces do not prove its signal reason.
Reuse src/lib/workspacePolling.ts, continuousPolling.ts, useContinuousPolling.ts and
src/main.tsx ownership. ADR-F1 source/CAS authority and all B119 product gates remain.
Graphify resolves WorkspacePollingClient to workspacePolling.ts; Agent-Brain returned
an unrelated research conversation, not a demonstrated solution. No capability-map delta.

Options: weaken the request-failure assertion (rejected: hides faults); change production
polling (premature); opt-in browser fetch/signal observation (selected). Brainstorming and
planning used to bound the choice; user continuation authorizes this diagnostic batch.

Only executable owner: F:/DEV_ENV/X4_Forge/tests/e2e/x4-ui-source-editor.spec.ts, adding
an off-by-default fixture to its existing b119ProfiledTest. Record same-origin workspace
fetches, exact supplied signal reason, workspace header/current identity, and Playwright
request/response/failure identities. Never record credentials, bodies or arbitrary URLs.
No injected headers, routes, retries, swallowed request failures, changed timeouts,
new polling owner, cache changes or production edits. Original promises/signals/body
consumers remain unchanged. Bounded logs and explicit overflow refusal. Reload starts a
new document identity; server-side collection preserves previous document observations.

Baseline: HEAD5b730a6, preserve verified uncommitted dense-array source/selftest and all
unrelated dirty files. New evidence root:test-results/b119-workspace-abort-20260914/.
Reuse reviewed checkpoint runner with a new baseline and sole test-file owner;410 inputs,
403 source members,50 protected artifacts/four real Lua/19 live files. Alternate3200/3201,
one worker, machine quiet/X4 stopped authorized by user. No external/native/Git writes.
Rollback: original owner bytes in baseline.json, never discard unrelated files.

## Acceptance / validation

- Final production diff empty relative to baseline; only diagnostic fixture changed.
- Types and exact-file lint pass; original test bodies/assertions preserved structurally.
- One unchanged targeted journey with diagnostic flag enabled; retain failed verdict if
  it remains red. New trace output only under testInfo.outputPath; all source/input/
  protected-file and isolated process cleanup guards pass. Inspect actual screenshots.
- Match abort event to request by document, method/URL, workspace identity and timestamps;
  admit ambiguity if multiple candidates. Reason must originate from actual AbortSignal.
- Negative: retain original requestFailures=[] assertion; no pass from unexplained aborts.
  No oracle correction until same-scope/timeout/HTTP-failure negatives are separately proven.
- Diagnostic may not reproduce timing; that is PARTIAL, not proof of cancellation cause.
- Full E2E/native/packaged acceptance remains open; no full suite in this unit.

## Implementation / close / AAR

Pending. Two failed source lookups corrected using actual graph/file discovery; explicit
degradation call made. Finish this diagnostic before a repair. No external/global memory
or ledger writes. Evidence and lessons recorded here and SESSION-HANDOFF.md.

## Reconciled diagnostic failure / acceptance addition

First trace run FAILED and terminal (session3219), with clean protected guards and
treeGone=true. The injected browser callback called native Response.status as a method,
creating page errors. This is an agent-authored diagnostic defect, not a Forge diagnosis.
First attempt completed16 observations through restored-original-workspace but recorded
no request failure/signal abort; the original cancellation was not reproduced there.
Do not use that run as a clean product verdict. Retain both attempts and their exact errors.

Repository typecheck and lint passed but did not catch the injected callback error; those
checks are insufficient proof for this surface. Before another browser run, extract the
actual callback from the test source and exercise it with native Request/Response/Headers/
AbortController in memory. Require red on the current status-method bug, then green for
original promise/input/init identity, untouched body,200/500 response observation, rejected
fetch propagation, abort after headers and changed-workspace reason/identity, and unrelated
URL passthrough. No generated substitute callback or full-suite rerun. Extend evidence only
under this unit's test-results directory. Fix the probe, not any product/oracle behavior.

## Close / evidence — 2026-09-14 11:01Z

- Only executable owner changed: opt-in workspaceAbortTrace fixture in the existing
  b119ProfiledTest; default off. No production changes in this unit. Prior dense-array
  repair preserved. AST comparison retains all21 original static test call bodies exactly.
- Initial repo types/lint PASS, but insufficient for the browser-probe runtime contract.
- Actual run `checkpoint.mjs run trace scripts/run-e2e.mjs tests/e2e/x4-ui-source-editor.spec.ts
  --project=chromium --workers=1 --grep "completes the B119 Lua file download, reload, import,
  history, collision, and workspace journey" --trace=on --output
  test-results/b119-workspace-abort-20260914/browser`:
  10:44:47.492Z–10:55:57.666Z, exit1,1 failed/0passed/0flaky/0skipped, complete terminal
  report, treeGone=true. Session3219 terminal; do not restart it.
- New isolated manifest scanned1,028,384 files/33,206,154,495 bytes, generation
  1789382714743-64d7ed8a2e,10:45:14.744Z–10:52:33.126Z (~438s). This is setup time,
  not Lua export latency. Database remained under the owned per-run60956 state directory.
- Both attempts reached16 observations ending restored-original-workspace; no raw request
  failures or signal-abort events. Trace342/333 events respectively, overflow0, final
  document deliveryFailures0. Native response status-method error polluted pageErrors
  (retry110 instances), so neither is a clean product run or original-cause diagnosis.
- Inspected/showed actual first-export screenshot. Canvas and authored text visible;
  download notice correctly does not claim final disk save or native verification. It
  does not override the failed test verdict.
- `probe-selftest.mjs` extracts the actual addInitScript callback through TypeScript AST,
  not a substitute implementation. `probe-red` exit1 reproduced the exact unhandled
  response.status error. Replacing status() with native status property only:
  `probe-green` exit0 proves promise/input/init/receiver identity, body not consumed,
  200/500 statuses, rejected fetch propagation, late abort and exact reason/workspace,
  unrelated URL passthrough, and no unhandled/delivery errors.
- Final repo types and exact-file lint PASS after the correction; sessions46973/40406
  terminal. Diff check and original test-call AST comparison PASS. All410 inputs frozen
  per run,409 nonowner inputs preserved,50 protected artifacts/four Lua/19 live files and
  membership unchanged. Isolated3200/3201 gone; existing3100/PID54964 retained, no X4.
- Final corrected probe has NOT been exercised in a fresh rendered run yet. No full-suite,
  package/install/native/publication/Git/issue/wiki/global-memory writes or success claims.
  No capability-map delta. Full B119 remains PARTIAL with original129pass/2fail/1flake.

Next exact unit: same runner with label `trace-fixed` (explicitly enables diagnostic),
same spec/grep/oracles, fresh `test-results/b119-workspace-abort-20260914/browser-fixed`
output. Do not overwrite trace/receipts or reuse prior temporary state. If no cancellation
recurs, record unproven; do not suppress unexplained failures or redesign polling from
timing correlation. Source hashes and exact input guards must remain current.

AAR triggered: bad source-path lookups; agent-authored diagnostic runtime error despite
static checks; failed rendered run and required repair. Sustain raw failed evidence,
source-frozen runs and callback-extracted regression. Improve: validate injected browser
code against native response/promise/signal semantics before an expensive corpus run;
Playwright Response and native Response have different status APIs. Highest evidenced
weakness: a faulty observer can create the page errors it claims to diagnose and waste a
full cold setup. Bounded countermeasure now green in memory; clean browser confirmation
still required. Degradation call honored: checkpoint after repairing the probe, no
product/polling/oracle repair begun. Lessons recorded here only.

## Corrected rendered attempt — 2026-09-14 11:17Z

Executed the documented trace-fixed command unchanged, with a fresh browser-fixed output
and per-run71248 state directory; no source edits during the run. All410 inputs matched
the final types/lint/probe receipts before execution and match the rendered receipt now.
Skill: executing-plans used to finish the declared batch; no additional repair scope.

- Session24941 terminal exit0;11:04:33.114Z–11:13:49.854Z. Standard verdict1 passed first
  attempt,0failed/flaky/skipped/report errors,1 discovered/terminal, treeGone=true.
  Log reports1.1m test duration versus9.1m total including cold reference preparation.
-16 checkpoints reached, ending restored-original-workspace. Both exports, reload/import,
  visual edit, exact Undo/Redo, collision refusal, staged-edit discard/recovery, unrelated
  source preservation and original workspace restoration passed their original assertions.
-431 observer events,0signal aborts/failed network requests/fetch rejections,0overflow,
  final-document deliveryFailures0. No page/console errors. The original cancellation was
  NOT reproduced; this pass does not identify its cause or justify an oracle exception.
- Inspected import, first-export and second-export captures; import was also opened in
  Codex for the user. Real canvas/source/selection surfaces visible, legitimate text
  ellipsis retained. Download status remains honest about final disk save/native proof.
  Long-frame HUD observations remain; this is not a universal responsiveness claim.
- `verify-fixed.mjs` independently verifies current410 inputs, the passing complete
  receipt/cleanup,16 checkpoints, error/overflow state, two actual downloaded byte buffers
  versus captured sourceBytesHex, and all16 output-file realpaths within browser-fixed.
  `fixed-verification.json` PASS at11:17:10.321Z records exact paths and hashes:
  first2818bytes SHA25631de099a4ff2cee7111c47eeab055c96f174c4b59cc4267a8bd6acabd0364987;
  second2815bytes SHA256d784fbd80f14e0bd24d0cd901a17ef2765ecdee5fedd7009e0aaad94f32a197a.
- Guard recheck11:15:45.106Z PASS:409 nonowner inputs and source membership preserved,
  50 protected artifacts/four real Lua/19 live files unchanged. No X4;3200/3201 stopped,
  existing3100/PID54964 retained. All jobs terminal; no pending run to restart.

Review: probe runtime repair and current Lua-file journey done/evidenced. Cancellation
cause remains PARTIAL/unproven. Prior failed runs remain FAILED; full132-run result is
still129pass/2fail/1flake, not arithmetically upgraded using this separate focused pass.
No application or original test-assertion changes in this turn. No capability-map delta,
Git/publication/install/native/external ledger writes. Full B119 remains PARTIAL.
Next: investigate the independent corpus-status timeout from its existing failed trace
and current owner; retain this probe for a cancellation recurrence. Do not ignore aborts
or keep repeating the same passing journey as a substitute for causal evidence.
AAR: original observer failure remains banked above; corrected batch had no failing gate.
Sustain independent disk-byte verification and original negative checks; remaining weakness
is cold full-reference setup dominating focused authoring-test runtime, now measured and
kept separate. Any fixture/index change needs its own reconciled plan, not a quiet bypass.
Commit point: `test(ui): verify Lua-file journey with corrected request probe` (not committed).
