# B119 bounded array-validation performance repair

Task: reduce synchronous canvas validation cost during ordinary authoring/history.
Lane: FULL. Status: VERIFIED (bounded repair only; full B119 remains PARTIAL).

## Plan / acceptance contract

- Baseline checkpoint: `5b730a67774516d44b9fff4f4b640b4113ade9ac`. Preserve all93 unrelated
  dirty paths. Full integration remains FAILED (129 passed,2 failed,1 flaky of132).
- Observed CPU evidence: the actual history profile attributes6.004s self time to
  `isDenseArray`; source calls `names.includes(key)` for every index. This is a
  repeated linear membership scan, not a diagnosis of all remaining authoring latency.
- Change only the existing private helper in `src/lib/x4UiCanvasRenderer.ts` and
  its existing `src/lib/x4UiCanvasRenderer.selftest.ts`. Reuse public render/refusal
  fixtures; no public test-only export or new renderer/validator owner.
- Options considered: one temporary Set preserves unordered own-key membership with
  linear expected work; deleting membership and relying on descriptors can miss a
  proxy whose ownKeys substitutes an out-of-range key. Choose the Set, retaining
  every existing length, maximum, prototype, symbol, descriptor and key-format guard.
- Risk: temporary O(n) additional lookup storage, bounded by the existing array limit.
  Do not cache mutable corpus-byte checks, relax limits, change Lua or render geometry,
  remove validation, change test timeouts, or claim native verification.
- Acceptance: original renderer checks remain; new public-boundary cases preserve
  dense/frozen/reordered-proxy acceptance up to command validation, reject sparse,
  accessor, hidden-index, symbol, extra-key, wrong-prototype, deceptive/throwing-proxy,
  and over-limit arrays before allocation. Indexed getters must not execute.
- Causal regression: a4096-entry dense command array must reach the independently
  invalid-command marker after array validation, without quadratic name-search work.
  Instrument only the synchronous render call and restore all instrumented builtins
  in finally. Fail first on the committed helper; pass after the bounded change.
- Required validation: baseline/red/green full renderer selftest, TypeScript, exact
  lint/diff and guard checks; then the unchanged real New-menu history E2E/profile,
  original rendered screenshot inspection and baseline CPU comparison. No full-suite
  rerun until this causal repair is verified. Browser work requires current machine-state
  confirmation; request sent while source-only work proceeds.
- Evidence: `test-results/b119-dense-array-20260914/`, including frozen inputs, original
  owner bytes, logs, receipts and profile analysis. Recovery is the exact owner snapshot
  or committed file bytes; never reset/discard unrelated work.
- No publication/push/install, external ledger/global-memory, game/mod/save or machine
  configuration writes. `gameVerified=false`; all nine journeys, three menus, broader
  reference census and packaged/native gates remain required for the full goal.

## Reconciliation

- Existing renderer owns dense checks for commands, selection, font maps/glyph records,
  font header/trailing bytes, diagnostics and keep-outs. Its existing172-check suite
  supplies public render, zero-allocation refusal and post-validation mutation fixtures.
- Source/CAS/history and corpus-byte integrity owners remain unchanged. ADR-F1/F2 and
  the canvas-first capability records retain source authority and the usability priority.
- Agent-Brain returned an older deployment/ledger conversation, not evidence for this
  array hotspot; the current committed source and actual CPU artifacts govern.
- No capability-map delta; no repeated risky-component replacement is warranted for
  this local algorithm correction.

## Implementation / validation / review / close / AAR

Implemented only a temporary property-name Set and indexed membership in the existing
private helper. All other production guards remain unchanged. Added15 public-boundary
checks to the existing172; no test-only export or competing validator.

Evidence root: `test-results/b119-dense-array-20260914/`. Commands run through its
`checkpoint.mjs run <label>` wrapper with the bundled Node runtime:

- `baseline-test --import tsx src/lib/x4UiCanvasRenderer.selftest.ts`:172/172, exit0.
- `red`:184/186, exit1; intended performance failure plus a new fixture's incorrect
  expectation for the earlier truth guard. Corrected the fixture before product edits.
- `red-corrected`:186/187, exit1; only the intended performance regression failed.
  Original helper:4096 linear searches,8,390,656 estimated membership probes.
- `green`:187/187, exit0 after the product change.
- `types node_modules/typescript/bin/tsc --noEmit`:exit2, readonly test-fixture assignment.
  Corrected by replacing the fixture layer object, not mutating its readonly property.
- `lint node_modules/eslint/bin/eslint.js src/lib/x4UiCanvasRenderer.ts
  src/lib/x4UiCanvasRenderer.selftest.ts --max-warnings 0`:exit0.
- `final-renderer --import tsx src/lib/x4UiCanvasRenderer.selftest.ts`:187/187, exit0;
  zero linear searches,4096 indexed lookups. Instrumented builtins restored in finally.
- `final-types node_modules/typescript/bin/tsc --noEmit`:exit0,
  terminal receipt2026-09-14T09:55:58.633Z. Final typecheck session90292 completed;
  do not restart it because the earlier tool output was truncated.
- All completed run receipts preserve410 frozen inputs per run,50 protected artifacts,
  four real Lua sources,19 live/config/install files and protected membership. No X4
  process; only the existing3100 listener observed. These observations do not substitute
  for the user's requested current machine-state confirmation.
- Complete two-file diff reviewed; all existing assertions retained, including132 static
  assertion call expressions. Product delta is exactly two insertions/one deletion.
  `git diff --check` passed. Source/CAS/history and corpus integrity checks untouched.

Acceptance review: source behavior, causal red/green, negative refusal/accessor cases,
types/lint and preservation guards are done and evidenced. The unchanged rendered
New-menu history journey, screenshot inspection and comparable CPU profile are pending
the machine-state reply. No browser responsiveness improvement or full-suite fix claimed.
The full integration result remains FAILED:129 passed,2 failed,1 flaky of132.
No capability-map delta. Full goal remains PARTIAL; `gameVerified=false`.

Rollback: exact two-owner bytes in `baseline.json` or checkpoint5b730a6; unrelated
changes must remain untouched. No commit/push/release/install or external ledger writes
in this unit. Resume with the existing audited isolated runner, not a broad full rerun.

AAR (triggered): sustain the production-frozen red test and public refusal boundary;
improve fixture construction by inspecting readonly ownership and earlier guard order
before asserting the intended downstream boundary. Two corrected fixture errors caused
an explicit degradation call; finish this unit before expanding scope. Tool improvement:
project only receipt summary fields instead of dumping410 input hashes (truncated output).
Highest evidenced risk is claiming UX improvement from algorithmic work counts; retain
the original rendered/profile acceptance gate. Lessons recorded here only; no global
memory or external ledger mutation authorized.

### Follow-up final review — 2026-09-14T10:02Z

Read-only review using code-review-excellence and the existing Graphify index. The broad
query selected the unrelated Canvas node; exact `graphify explain isDenseArray` resolved
the helper at L408 and its six caller relationships. Direct source inspection confirmed
plan, font/byte, tint and polygon validation consumers; graph output alone is not runtime
proof. reviewctl and BlastRadius were unavailable; no install or scan success claimed.
Temporary Set storage remains the explicitly accepted O(n) tradeoff, not a cache.

Independent TypeScript AST comparison on final bytes retains all132 original assertion
expressions (135 now); exact normalized production delta matches only Set construction
and membership substitution. Rehashed all410 inputs against each final-renderer,
final-types and lint receipt: all match, all exit0, no verificationError. The existing
checkpoint guard passed at10:01:45.102Z with50 artifacts/four Lua/19 live files preserved.
No new source defect found or product edit made. Rendered/profile proof is still pending
the same unanswered machine-state question; no browser/game activity or new test run.
This completes the available offline review, not the product-performance acceptance.

### Authorized rendered close — 2026-09-14T10:08Z

User confirmed `go — X4 stopped; machine quiet`. Used executing-plans to finish the
existing acceptance contract; no new product edits or test-body/timeout/oracle changes.
Exact runner suffix for both runs:
`scripts/run-e2e.mjs tests/e2e/x4-ui-source-editor.spec.ts --project=chromium --workers=1
--grep "preserves actual browser history for New-menu row and Text authoring" --trace=on
--output test-results/b119-dense-array-20260914/<profile-browser|rendered-browser>`.

- Wrapper `run profile`:10:04:50.421Z–10:05:59.258Z, exit0;1/1 first-pass,
  41.1s test duration,0 flaky/skipped/report errors, complete terminal report, treeGone=true.
- Wrapper `run rendered` (profiling off):10:07:13.257Z–10:08:04.219Z, exit0;
  1/1 first-pass,40.7s test duration, same clean verdict/cleanup. Session79197 and5103
  are terminal; no job to restart. Profiling-off output contains zero CPU profiles.
- All410 frozen validation inputs preserved per run;50 protected artifacts, four real
  Lua sources,19 live/config/install files and membership unchanged. X4 absent,3200/3201
  gone, existing3100/PID54964 unchanged.14/12 output files respectively remain inside
  their chosen directories (profile attachment duplicates account for two CPU files).
- Inspected all four profiled screenshots and final unprofiled alternate-edit capture:
  initial title, inserted text, edited text and alternate edit rendered as expected;
  canvas, selection outline and selected-element inspector visible. Game-truth label
  remains Not verified in game. Existing developer performance HUD still reports long
  frames; this is not a claim of universally smooth interaction.
- All14 whole-file Lua/native-canvas snapshots deep-equal the original pre-repair
  profile snapshots; profiling-off snapshots also deep-equal the new profile snapshots.
  This includes row/widget/text undo, redo, sibling preservation and alternate history.
- `compare-profile.mjs` reuses the prior analyzer and its existing controls unchanged,
  substituting only the evidence root. Original and current profile hashes verified;
  `cpu-analysis.json` and `profile-comparison.json` record controls and whole-journey data.
  All-sample target aggregation (same sorted timestamps and actual end boundary) finds
  Canvas isDenseArray self6,003,772us/3822 samples before versus105,099us/78 samples after:
  12.724% ->0.295% of sampled intervals. Interval totals match analyzer47,184ms ->35,669ms.
  Do not infer zero CPU from its absence in the top18 report rows.
- Prior profile/default-off test durations50.2s/51.8s versus41.1s/40.7s now are observations
  from individual runs, not a controlled benchmark. Other costs remain: corpus-byte
  validation5.526s and React development JSX4.409s self time in this profile.

Acceptance review: all declared bounded source/static/negative/rendered/profile and
preservation gates passed. Status VERIFIED for this repair only; full integration still
has the prior FAILED129pass/2fail/1flake result and has not been rerun. Lua workspace
request cancellation and corpus-readiness flake still need causal resolution. Full nine
journeys/three menus/12 references/packaged/native obligations remain; gameVerified=false.
No capability-map delta. No push, publication, install, game/mod/config or external writes.
Source and documentation changes remain uncommitted after local checkpoint5b730a6.
Commit point: `perf(ui): make canvas dense-array validation linear`.

AAR addition: retain profiling-off verification and byte/pixel equality, rather than
using the large algorithmic improvement to claim the whole UI is fast. No new test
failure during this authorized batch; earlier fixture/output triggers remain recorded.
Highest remaining observed weakness: substantial non-array synchronous work and long-frame
HUD readings. Preserve the existing hotspots as evidence for a separately scoped decision;
do not remove mutable-corpus integrity checks or weaken history/network assertions.
