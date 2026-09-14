# B119 browser action invocation counts

Lane FULL. Status PARTIAL. Full builder goal remains PARTIAL.
Goal: measure per-action work behind slow immediate visual feedback, without changing
product code or weakening admission. Direct/local, no agents/Git/release/external writes.
Architecture: opt-in CDP precise function coverage around existing scenario-history
Apply/Undo/Redo; existing Playwright test, single-worker isolated3200/3201 harness.

Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6. Preserve current dirty work and
410input pins; only tests/e2e/x4-ui-source-editor.spec.ts owned. Exclusive snapshot of
owned bytes in test-results/b119-action-counts-20260914/baseline.json permits exact delta
rollback, not a whole-worktree restore. Protect previous50artifacts/4realLua/19live files
and memberships before/after. X4/ports reobserved before rendered work.

Reconcile: previous census ruled out shared-reference duplication as primary fix in its
unsampled realMENU graph. Issuer/Scene/SourceEdits independently validate. Current main.tsx
mounts StrictMode; harness is Vite development. Counts here do NOT prove production counts
or realMENU counts. Existing CPU fixture samples whole real-menu test; it cannot supply
precise per-action invocation counts. Extend the same test file with an opt-in helper;
reuse testInfo.outputPath/attach; no new external artifact destinations. ADR-F1/F5 workspace
CAS/identity and canonical Lua unchanged. No capability-map delta.

Plan/acceptance:
1. Add helper with default pass-through (same action once, no CDP); enabled only by diagnostic
environment flag. CDP Profiler.enable/startPreciseCoverage(callCount:true,detailed:false),
existing browser action plus settled workspace/rendered assertions, takePreciseCoverage,
always stop/disable/detach. Three-call browser control must report exactly3, fail otherwise.
2. Record only same-origin /src/ function coverage, source offsets/counts, action boundaries
and control result to per-test output. Preserve every original scenario/history/source/pixel
assertion. Do not increase timeouts/retries or turn diagnostic counts into a passing UX gate.
3. Run typecheck/lint, isolated selected test with flag on and off; compare all original test
bytes modulo helper/action wrappers independently. Inspect generated current screenshots.
Report named projection/validation/model-check counts with exact files/offsets and no timing
claim. CDP prevents optimized code, so diagnostic duration is not normal responsiveness.

Authority: installed playwright-core/types/protocol.d.ts Profiler types and official
https://chromedevtools.github.io/devtools-protocol/tot/Profiler/ . Counts enabled reset
counters; take resets counters too. Do not use best-effort coverage for exact calls.
Negative: missing/mismatched three-call control is a hard diagnostic failure. Disabled
run proves ordinary path unchanged. Failure evidence retained, no oracle relaxation.
Evidence: test-results/b119-action-counts-20260914/ receipts/logs/browser attachments.
No installed/native/production/full130 verdict from this bounded small-fixture diagnostic.
Review and close/AAR update this plan, handoff/backlog. No independent new infrastructure.

## CLOSE / VALIDATION / REVIEW

Baseline03:39:28Z:410pins, only test file owned, X4absent, Deckwright3100/PID69604 only.
Implementation: optional countB119BrowserAction helper plus Apply/Undo/Redo wrappers in
existing scenario-history test. Off by default; no product edits. Existing expectedAfter
pure object construction moved before Apply to permit the settled-state wrapper. All
original test lines retained; prefix and all later tests byte-identical. No timeout/retry
change, no runtime export monkey-patching, no validator changes, no external writers.

Checks via checkpoint.mjs (all receipts terminal, guards unchanged):
- types: tsc --noEmit PASS0.
- lint: eslint . FAILED1,16166findings because the command incorrectly included artifacts
  and unrelated non-gated files. Not a product regression diagnosis; raw log retained.
- lint-scoped: eslint src server.ts tests/e2e/x4-ui-source-editor.spec.ts PASS0.
- review: independent baseline comparison PASS0; all original test lines preserved,
  unrelated prefix/suffix exact, default pass-through, no timeout/retry relaxation.
- rendered-counts03:43:40Z: FAILED1,0passed/1failed/0flaky, complete terminal verdict;
  original60s limit exceeded including retry. Two valid Apply reports; no Undo/Redo reports.
  Instrumentation deliberately prevents optimized execution. Do not call the timeout a
  reproduced ordinary-product regression or call it proof that instrumentation is sole cause.
- summary PASS0 explicitly asserts failed diagnostic receipt and PARTIAL coverage. Three-call
  control counted exactly3 in both reports; all recorded functions have one function-level range.
- rendered-default03:46:54Z: PASS1/1first attempt,0flake/0skip/0globalerrors, case41.4s,
  suite54.9s. All original source/history/scenario/pixel assertions passed. Current screenshot
  browser-default/x4-ui-source-editor-Source-8229a-hrough-source-Undo-and-Redo-chromium/
  scenario-B-redo.png visually inspected: Title after edit A selected; Scenario B and
  Independent B remain painted; canvas/hierarchy/inspector visible, not verified in game.

Observed Apply counts, identical in first attempt and retry (summary.json retains paths,
transformed-script offsets, exact control and source counts):
- projectX4UiLayoutProgram14; validateX4UiLayoutEvidencePair32.
- x4UiEditorSession.project22; x4UiCallModel.project35 (these include cache probes).
- transferPreviewScenario4/replayPreviewScenario4.
- discoverX4UiSourceEditorCatalog8; discoverX4UiSourceEdits5; validateIssuedEvidencePair6;
  isIssuedX4UiLayoutEvidencePairForModel6.
- closedJsonDomain1,137,975 recursive calls; jsonEqual15,262.
These are invocation counts, NOT unique objects, independent operations, milliseconds or
normal/production counts. Window includes click through workspace and rendered-state assertions.
Instrumentation may affect scheduling/polling; never divide counts by two to infer production.

Requirement review: optional measurements/default preservation and Apply control evidenced;
Undo/Redo call counts missed because diagnostic run timed out. Ordinary Undo/Redo behavior
passed with diagnostic off. Production/realMENU/full130/installed/native claims out of scope.
No acceptance relaxation: retain PARTIAL measurement status and FAILED diagnostic gate.
Next: reconcile existing session project cache and SourceEditor projection/scenario replay
owners against this concrete per-action repetition, then repair redundant work with ordinary
rendered before/after proof. Do not add global validation caches or remove admission checks.
Entire nine-journey builder and three-menu/fidelity/release obligations remain open.

Both E2E receipts prove owned tree gone and live workspace/protected artifacts unchanged.
No mod/config/install/Git/issue/wiki/global-memory writes. No capability-map delta.
Suggested checkpoint: test(ui): measure browser authoring call counts (not committed).

## AAR

Non-clean: diagnostic timeout and retry, overbroad lint, oversized combined read, guessed
nonexistent source/script names, and a PowerShell curly-apostrophe parse error in an attempted
owned-lint stop. Lint had already terminated; no process was stopped by that command.
Degradation call made to user; finish this bounded checkpoint before another implementation.
Sustain: immutable input guards, exact control3 rather than approximate coverage, failed
verdict retained, original green behavior independently rerun with counting disabled.
Improve work: measure one action per bounded diagnostic setup rather than instrument three
actions inside an ordinary60s regression budget. Do not increase the ordinary test timeout.
Improve tools: use existing package lint scope; rg --files before guessed filenames; avoid
smart punctuation in shell strings; bound each returned line and each read independently.
Highest evidenced weakness: substantial repeated projection/admission work during an
instrumented tiny-menu edit. Counts narrow the owner-level repair; they do not establish
which calls are safely redundant. Banked here only; no external/global ledger write.
