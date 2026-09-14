# B119 bounded owner replay cache

Lane FULL. Status REVERTED. Full builder goal PARTIAL; previous turn PROGRESS because
Apply counters changed the next action. Direct/local, no agents/Git/release/external writes.
Goal: avoid reprojecting recently visited preview states while preserving exact owner admission.
Architecture: extend existing one-entry session projection cache to four-entry LRU; retain
the exact input capture/signature/authority/content boundary comparisons and full miss path.
Tech: TypeScript, existing owner selftests and isolated Playwright3200/3201.

Baseline: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6,410pins. Product owners only
src/lib/x4UiEditorSession.ts and src/lib/x4UiEditorSession.selftest.ts. Baseline copies exact
dirty owner bytes for delta rollback. Keep every other input/protected50artifacts/4realLua/
19live files and memberships unchanged. Current prior receipt: b119-action-counts-20260914/
rendered-default-receipt.json. Recheck X4/ports before E2E. No game/config/install write.

Reconcile/design: owner binds one immutable source; caches previousProjection only. Scenario
replay alternates seed/base/populated states; Apply instrumented count14actual projections,
22owner.project probes,32validations,4replays. Counts from dev/instrumented smallfixture,
not production latency. Existing stage caches/signature protect corpus/color/authority
references and mutable input boundaries. ADR-F1/F5 identity/CAS unchanged. Graph query landed
in unrelated session node; live profiler file paths/source inspection govern this repair.
Agent-brain returned older reference API task, not verified prior solution. No capability-map
delta. Original full objective and approved canvas-first plan remain authoritative.

Alternatives: rewrite replay to share intermediate stages (larger cross-layer contract),
global validator memoization (wrong ownership/risk), or bounded existing owner reuse (chosen).
Risk: up to four retained projections per owner versus one, not unbounded scenario history;
shared immutable source and nested results may share storage but no byte-bound claim. No
extra public API. Do not equate four entries with four times a measured graph's memory.
Existing suspicious-input fallback clears the entire result cache; no changed validators.

Acceptance/steps:
1. Add fail-first owner tests for A/B/A exact identity reuse, four-entry capacity, recency
promotion/eviction, foreign authority miss, mutable profile miss, accessor refusal without
getter execution, and uncacheable input flush. Existing tests unchanged.
2. Replace previousProjection with bounded private entries; capture before lookup every time.
Reuse only sameEditorSessionProjectionCacheSignature match; promote hit, evict least recent
beyond4, clear on refused/null signature. Full projector/stage caches unchanged.
3. Full owner selftest, scenario tests, mounted editor regression, tsc, scoped lint. Run
ordinary selected rendered scenario-history + named-scenarios + New-menu history tests;
inspect actual screenshots and existing trace action timings against prior ordinary runs.
No precise coverage for latency. Retain failed/flaky verdicts; no timeouts/retries changed.
4. Independent diff review: compare all non-cache source bytes to baseline, preserve every
existing test; all410pins/guards checked after commands. Record memory cap/negative paths.
Visible improvement must be observed before claiming responsiveness improved. If no useful
benefit or a safety failure is found, reconsider/rollback only this unit's exact delta.

Evidence: test-results/b119-owner-replay-cache-20260914/ logs/receipts/browser/baseline.
Rollback: restore only owned delta to baseline bytes, never reset unrelated changes.
No full130/production/package/install/native/realMENU completion claim from smallfixture.
Review/close/AAR in this plan and handoff/backlog; full nine journeys/three menus/fidelity
obligations remain. Suggested commit only, no commit/push or public ledger mutation here.

## CLOSE / REVIEW / VALIDATION — REVERTED

Baseline03:53:45Z recorded410pins, exact owner bytes, X4absent/Deckwright3100only.
Implemented four-entry private LRU using unchanged capture/signature/miss path; added owner
identity/capacity/recency/authority/mutation/refusal/uncacheable tests. Then removed both
changes after required rendered regression. Current source AND selftest are byte-identical
to baseline (restoration.json and restoration-receipt.json):
- src/lib/x4UiEditorSession.ts SHA4AC5D983ACAF7CCD1C6A0AB341E4F399198BCF6D90A78A41E4D22C920390BF99.
- src/lib/x4UiEditorSession.selftest.ts SHA12B934658F3475E0C274FE105A12C2771834D13BF362F1E804832DAE84D6FCF3.
No net product or test change in this unit. Previous action-counter helper remains untouched.

Executed checks, all terminal, exact args in *-inputs.json / result in *-receipt.json:
- owner-red FAILED1 as intended: A/B/A did not reuse A (test added before product edit).
- owner-green PASS0, including bounded cache negative tests and existing owner suites.
- scenarios PASS0, original scenario tests unchanged.
- types FAILED2: two foreign-authority test objects lacked required kind marker. Corrected
  to independently allocated forged marker objects (still not issued authority); types-final PASS0.
- lint (eslint src server.ts) PASS0; final test-only lint PASS0.
- mounted PASS0 including first-render scenario history, structural history, contextual
  input/stale-handler and unresolved-caption tests. It did not catch the browser regression.
- owner-final PASS0 with corrected negative fixture shapes.
- review PASS0: all source outside owner byte-identical, complete miss path unchanged,
  all prior tests byte-identical. reviewctl/rules/BlastRadius absent; manual plus exact-diff
  review used, no tool installed. The review did not establish safe cross-transition reuse.
- rendered04:02:07Z FAILED1:2passed/1failed/0flaky,3terminal,0globalerrors, owned treeGone.
  [REPRODUCED] Scenario-history first attempt28.4s/retry25.2s both failed after Undo:
  expected Saved scenario B, received Current custom values (10s assertion timeout).
  Named scenario switching and New-menu history passed; that does not override failure.
  Exact error-context.md and trace.zip retained under browser/ first and retry folders.
- Exact owned-delta rollback04:05Z via apply_patch, independently checked hashes/bytes.
- restored-rendered04:05:22Z PASS3/3first attempts,0flake/0skip/0globalerrors,3terminal;
  case29.5s scenario history,16.7s named scenarios,50.3s new-menu history; suite1.8min.
  No diagnostic coverage, timeout or retry changes. Owned treeGone/live guards unchanged.
- restoration04:07:32Z PASS0 asserts failed candidate verdict AND restored green verdict,
  complete original owner bytes, exact hashes and both owned stacks stopped.
- Visually inspected browser-restored/...Source-8229a.../scenario-B-redo.png: selected
  Title after edit A, Scenario B and Independent B rendered; canvas/hierarchy/properties
  remain visible. Not game proof; shell's separate validation1error remains visible.

No accepted responsiveness improvement. Ordinary before timings varied (Apply3.819s versus
4.391s across prior runs), so do not use shortened incomplete candidate tests as speedup.
The experiment falsifies safe retention of complete projections under this existing UI
lifecycle. [HYPOTHESIS] retained result/authority identity interacts with scenario migration
or restoration; exact internal cause unproven. src/components/X4UiPreviewScenarios.tsx
computes chosen scenario from current capture against saved migrated records; mismatch
must not be hidden by weakening its comparison or changing the test's expected B.

Acceptance review: owner cache behavior/negative paths passed; actual scenario-preserving
Undo failed. Candidate rejected and exact restoration verified. No capability-map delta,
no external ledger/Git/mod/config/install/native writes. Full130/production/realMENU and
all nine builder journeys/three-menu/fidelity/release obligations remain open.
Next: do not reintroduce this four-entry complete-projection cache as a solved optimization.
Investigate the saved/current scenario mismatch only if needed to justify another reuse
strategy; alternatively remove demonstrably redundant caller work without retaining old
complete projections. SourceEditor4906 eagerly projects even when successful scenario
transfer returns another projection; current profile normalization is a required coupling,
not permission to substitute old profile values. Document next bounded plan first.
Suggested checkpoint: docs(ui): record rejected replay-cache optimization (not committed).

## AAR

Non-clean: fail-first test, test-fixture typing correction, required browser failure/retry,
rollback, minor truncated combined reads, and a PowerShell foreach-pipeline parse error
during rollback verification (fixed; actual rollback bytes independently verified).
Sustain: original browser oracle was unchanged and rejected a candidate that static, owner,
scenario and mounted tests all accepted; exact input ownership made rollback inexpensive.
Improve approach: unchanged cache keys/full miss checks do not prove that old complete
projection identities are safe across frontend effects and source-history transitions.
Four-entry memory tradeoff was never justified by an accepted visible improvement; removed.
Improve tools: complete typecheck before long mounted runs to avoid delaying a fixture-only
repair under frozen-input guards. Use bounded reads and assign foreach output before piping.
Highest evidenced weakness: coverage gap between low-level/mounted tests and actual saved
scenario recognition after Undo. Existing real browser test is the required regression;
keep it intact and use exact saved/current scenario captures when diagnosing this mismatch.
Banked failure here only, not as a verified reusable optimization or global memory update.
