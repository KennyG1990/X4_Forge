# B119 output-isolation repair implementation plan

Lane FULL. Initially SPECIFIED; current Status FAILED (complete integration gate red;
repair implemented and isolation checks passed). Astra direct/local, no agents.
User resumed2026-09-13: "okay good" / Qt Designer reference / "Keep building it out".
This clears the prior scoped artifact/cache repair and full-rerun pause, not protected
game/mod/install/release writes. Qt Designer is the visual interaction reference:
https://doc.qt.io/qt-6/designer-to-know.html . Preserve X4 layout/Lua authority, not Qt APIs.

## PLAN / RECONCILE

- Unit: repair the three identified test artifact writers and isolate the E2E studio
  cache; pass focused/static gates and rerun the complete current integration suite.
- References: full goal; approved canvas-first contract; original brief; output audit
  `2026-09-13-b119-e2e-output-audit.md`; existing full-integration failed receipt.
- Selected approach: existing `test.info().outputPath` / attachments, and existing
  `openStudioDb(cacheDir)` boundary with an optional explicit environment override.
  Rejected: changing all live cache defaults (unneeded migration); replacing/patching the
  runner or suppressing marketing (does not preserve full coverage).
- Six executable owners: `tests/e2e/marketing-showcase.spec.ts`,
  `tests/e2e/capability-contract.spec.ts`, `tests/e2e/continuous-polling.spec.ts`,
  `src/lib/db.ts`, `playwright.config.ts`, `scripts/e2e-ephemeral-environment.selftest.ts`.
- No user-facing widget/renderer/source/history change in this safety prerequisite.
  Ordinary keep-out controls and layout-property authoring remain the next product work.
- No shared cache/image writes or restoration. Existing external/evidence/media images,
  fixed capability/B116 artifacts and live protected files are hash/membership guards.
- No Git mutations/publish/install/config/mod/game/save/external wiki/GitHub/memory writes.
  New code/docs/evidence remain inside this checkout; ordinary owned temporary test
  fixtures and a new per-run cache are authorized by this repair/rerun scope.
- Risk: artifact consumer breakage or cache fallback to shared state. Preserve named
  attachments and README/media assets. Invalid explicit cache overrides must reject,
  never fall back silently to shared storage. Optional driver behavior remains unchanged.
- Baseline/rollback: exact six-owner byte backups and prior408 input census in
  `test-results/b119-output-isolation-20260913/baseline.json`; rollback only reviewed
  task deltas, never restore a whole dirty file over later work.

## ACCEPTANCE / STEPS

1. Capture baseline, protected destinations and current process/ports; no X4 or conflicting
   test listener. Preserve earlier failed evidence and all unrelated dirty source.
2. Extend existing environment selftest fail-first: API cache path inside unique state;
   explicit cache argument wins, absent override preserves old default, invalid/blank/
   relative override refuses; actual scratch SQLite path and optional-driver behavior;
   source-coupling checks for all three known artifact writers, with unsafe examples.
3. Repair only destinations/imports in the three specs; preserve assertions, interaction
   order, deadlines, retry/zero-flake policy and discovery. Configure cache override under
   E2E_STATE_DIR; consume it in db.ts, so no server owner needs editing.
4. Run environment selftest with defaults and3200/3201, full dbSelfTest, tsc, owned lint,
   whitespace/diff review and exact baseline protections. Capture logs/exit codes.
5. Run existing `scripts/run-e2e.mjs --project=chromium --workers=1 --trace=on --output <new>`
   with3200/3201 and configured read-only corpus; no spec/grep filter. Freeze current
   executable inputs for the run, verify complete structured verdict and owned teardown.
6. Require log evidence of the new studio cache path; verify old cache/image bytes and
   directory membership untouched, per-test artifact placement, source hashes unchanged.
   Inspect real final-run builder screenshots separately from marketing images.

Full gate may expose an existing product failure: retain it and investigate the first
causal failure without weakening the oracle. This unit cannot close the full builder,
three-menu/twelve-reference/numerical/native/package/release obligations. gameVerified=false.

## CLOSE / AAR

Current result: FAILED full integration gate; six-owner isolation repair implemented and
contained in the completed run. See final close below; earlier checkpoints are historical.
No capability-map delta from this repair.
Brainstorming/planning/executing-plans used with the already approved product direction;
no repeated design-approval loop or premature commit. Prior wrong-path rg arguments and
oversized reads are inspection friction, not product evidence; use exact paths/bounded output.

Implementation checkpoint23:04Z: fail-first environment-red exit1 reproduced missing
X4_STUDIO_CACHE_DIR. Six-owner repair implemented. The first post-edit command was stopped
before child launch by the older selection-focus guard, which still pinned playwright.config
as unowned. Reconciled only this unit's wrapper guard to exclude the six authorized owners
from older input pins, retaining all four real Lua sources,19protected files/membership,
the independent408-input non-owner checks and50artifact/cache guards. Old guard unchanged.
The guard failure is retained in thread output; no browser started and no oracle softened.
Tooling friction/degradation acknowledged: finish this validation checkpoint before a new
product unit. Baseline capture completed independently despite lost initial command output;
live process absence and baseline receipt confirmed completion, so it was not restarted.

### Validation and review close —2026-09-13 23:10Z

- environment-red: expected exit1, missing cache override reproduced before repair.
- environment-default-v2 and environment-override: exit0; default3100/3101 and3200/3201
  config, invalid overrides, explicit-directory precedence, real isolated SQLite opens,
  unsafe path examples and all three known artifact-writer source couplings passed.
- db-selftest: exit0, native driver available; all11 database checks passed, including
  replacement/game-path rollback checks. All database tests used new temporary fixtures.
- typecheck: exit0. Owned lint: exit0,0errors/11warnings on unchanged any/unused-import
  lines. Full current precommit/build/package/native/release not run or implied by these.
- verify-diff.mjs: exact byte-transform checks confirm five non-selftest owners differ
  only by approved destination/cache changes. Three spec assertions/interactions remain
  exact; prior dirty reference-query optimization in db.ts remains exact. Additive existing
  environment selftest diff independently reread; no existing negatives removed.
- Final source/artifact guards: all402 non-owner input hashes and408 membership unchanged;
  all50 protected artifacts/cache files and directory membership unchanged;33 older input
  pins,4real Lua sources,19protected files/membership unchanged. Six final hashes recorded.
- Evidence: `test-results/b119-output-isolation-20260913/receipt.json`, named command logs/
  receipts, baseline.json byte backups, checkpoint.mjs and verify-diff.mjs. No browser run
  or production claim; all started validation processes are terminal.
- reviewctl/rules/BlastRadius unavailable (checked); manual full delta review, existing
  selftests, tsc/lint and byte-locality verifier used. No tool installation attempted.
- Required missing evidence: complete standard E2E, actual server log naming per-run cache,
  per-test screenshot/JSON placement, final builder screenshots, owned-tree teardown.
  User machine-state question was sent asynchronously; answer still outstanding at close.
  Rendering approval is NOT revoked; do not ask for the artifact/cache repair approval again.
- Qt Designer interaction reference added to the approved canvas-first plan in the same
  task. No visual builder behavior changed by this safety prerequisite.
- Suggested eventual commit title after required gates: `fix(test): isolate E2E artifacts and studio cache`.
  No commit/staging/push/release/installed/shared-cache/image mutation.

AAR triggered by reproduced fail-first, expanded old-guard ownership, and tool friction.
Sustain exact pre-repair backups and inverse-diff verification; improve early reconciliation
of inherited guard ownership and retain command session metadata. Highest-risk observed
weakness was shared write targets despite isolated ports; repaired in source and focused
tests, but full-suite containment remains unproven until the rendered gate. Local records
only; no global memory/skill bank. Checkpoint here before another product unit.

### Full rendered gate running —2026-09-13 23:58Z

User confirmed X4 stopped/machine quiet. Existing full runner launched23:57:53.176Z on
3200/3201 with130tests/1worker and frozen408 inputs. Tool session39852, runner58036,
state x4forge-e2e-state-14068. No spec/grep filter or policy relaxation. Use the same live
handle until terminal; full-rendered.log/inputs.json preserve invocation. No verdict yet.

### Full rendered gate final close —2026-09-14 00:30Z

User's YES confirmed X4 stopped/machine quiet. Full standard runner ran from
2026-09-13T23:57:53.176Z to2026-09-14T00:27:52.254Z: exit1,126passed/4failed/0flaky/
0skipped/4badResults. All130 discovered tests have terminal structured results, no global
report errors, no quarantine, no spec filter. All four failures also failed their one
configured retry. No inputs, timeouts, assertions, retry policy or discovery changed.
Session39852 is TERMINAL; do not poll/restart it. Full receipt and both attempts retained.

Validation/review:

- Runtime containment PASS: server log names `x4forge-e2e-state-14068/studio-cache/index.db`.
  All10showcasePNGs,3capabilityPNGs,4B116JSONs exist exactly once in per-test output folders.
  Named attachments remain available. No old showcase/media/fixed artifacts overwritten.
- Final frozen408inputs unchanged;402nonowners and membership remain exact. All50protected
  artifact/cache files and root membership unchanged;33olderinputpins,4realLua originals,
  19protected live/mod/config/install files and membership unchanged. Exact original six-owner
  diff verifier passes. No implementation edits were made during this run/triage.
- Lifecycle complete/ownershipComplete/treeGone all true; zero remaining owned processes.
  X4 absent,3200/3201 stopped; only existing Deckwright3100/PID69604 listening. No game,
  realmod, config, Git, installation, publication, external wiki/issue or memory writes.
- Twelve actual run PNGs inspected individually, with hashes/observations in
  `test-results/b119-output-isolation-20260913/full-verification.json`. New menu, same-menu
  Text/Button/Input, wrapping, scoped refusal, continued edit after Redo and overlay regions
  visible. MENU retry shows reopened TRANSMIT, but remains a FAILED test. HUB/COMM passing
  captures show header fragments, not whole-menu fidelity. Fixture/native gaps stay explicit.
- Static/focused checks in23:10Z close remain valid for these identical executable bytes.
  Full integration FAILED; therefore this unit is not VERIFIED. No full precommit/build/
  package/install/native/release proof added. No capability-map delta.

Four failures / observed versus inferred:

1. [REPRODUCED] New-menu history at3358: both attempts wait for selection-empty at3478
   after undo-row-insertion; next Redo adds Row2 while Row1 remains selected. Captured source
   transitions already reached undo-row-insertion. Approved structural-history plan explicitly
   preserves surviving source-anchored selections. [HYPOTHESIS,~95%] old test oracle was not
   reconciled when that behavior changed. Next unit must assert the exact surviving Row1,
   then explicitly select Row2 where required; do not simply delete the selection check.
2. [REPRODUCED] PNG evidence at3655: export target metadata renders raw targetID instead of
   required `Top-level menu`. Source6062 falls back to ID; normal selector6509 separately
   supplies the friendly top-level label. This is a visible labeling gap; preserve the test's
   friendly-name and provenance assertions when repairing the shared presentation choice.
3. [REPRODUCED] Populated rows at4163: both60s timeouts. First trace has repeated completed
   clicks~2.7–3.8s and reaches alternate-edit/stale-redo evidence; retry terminates at4406
   with selected label empty instead of `Text · B119 Restored Text edited`. [HYPOTHESIS,~70%]
   accumulated interaction cost is primary; a selection timing/continuity defect remains an
   alternative. Profile and compare exact notice/state timing before deciding. Do not raise
   timeout or claim the source edit itself failed merely from the terminal timeout.
4. [REPRODUCED] Actual MENU at4550: both120s timeouts. First attempt's finally capture then
   encounters a closed page. Retry emits reopened TRANSMIT screenshot, still times out.
   Captured main-thread stall indicators~21–25s strengthen a performance hypothesis, not a
   specific root cause. Existing120s bar remains. Finally evidence must not mask the first
   failure; retain trace and exact current source bytes before a bounded follow-up.

Evidence: `full-rendered-receipt.json`, `full-rendered.log`, `full-rendered-inputs.json`,
`full-verification.json`, `verify-full-run.mjs`, and `full-browser/` beneath
`test-results/b119-output-isolation-20260913/`. Original partial `receipt.json`, fail-first
and earlier interrupted full-run evidence remain unchanged. Supplemental verifier exit0
means containment/receipt integrity PASS, not that its recorded FAILED suite became green.

AAR triggered: integration failures and one PowerShell rg wildcard-path mistake (read-only;
corrected to rg directory/-g; no data effect). Sustain whole-suite execution, exact frozen
inputs, independent bytes, honest retry/terminal verdict and real rendered inspection.
Improve work: audit all consumers when changing selection policy; the prior focused batch
missed this old history oracle. Improve tools: use compact trace projections, avoid shell
globs as literal Windows paths, profile cumulative interaction latency in a bounded fixture.
Highest-risk observed weakness is multi-second UI stalls in actual authoring/real-menu
roundtrips; bounded next work must measure the responsible stages without relaxing deadlines.
Local plan/BACKLOG/handoff bank this evidence; no global memory or procedural skill update.

Checkpoint: full gate FAILED, isolation contained. No commit. Next unit is a reconciled
history/export/performance repair with fresh owner backups, followed by the complete gate;
ordinary keep-out controls and real layout-property authoring remain open product work.
