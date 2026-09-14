# B119 avoid unchanged scenario replay stages

Lane FULL. Status FAILED (required zero-flake rendered gate); implementation retained.
Astra direct/local; no agents or Git mutations.

## PLAN / BASELINE / RECONCILE

Goal: reduce measured22.4s caption Apply and18s Undo/Redo without weakening canonical
source, scenario restoration or validation. Full objective reread; all9journeys,3menus,
12references, numeric/native/package/release and ordinary layout/keep-out UX remain required.
Bounded owners: F:/DEV_ENV/X4_Forge/src/lib/x4UiPreviewScenarios.ts and its .selftest.ts.

Source replay currently invokes owner.project four times: base, paths, loops, samples.
It does so even when no paths/loops are selected. Session owner already caches stage one/
two with exact source/profile/corpus guards. Reuse this owner; do not create a result cache.
Base clears ALL previous path/loop/sample inputs and authority aliases. Each actual selected
dependency must still be applied with freshly issued authority before dependent catalogs.
Final sample application, reconciliation and complete keyed readback remain mandatory.

Selected design: skip only intermediate calls where both saved selections and projected
state are absent. Preserve withPaths/withLoops data construction and final validation.
Conservative guard keeps projection if an owner supplies non-undefined state even when the
saved list is empty. Alternatives: new memoization duplicates existing owner; larger timeout
preserves unacceptable interaction; dropping validators unsafe. No capability-map delta.
References: full objective, original brief (corrected bitmap/column assumptions), approved
canvas-first contract, previous CPU/AST lookup plan, existing complete scenario source/tests,
ADR-F1/F5 and capability map. Recall match is old reference-corpus work, not this repair.

Baseline current HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, pre-existing dirty/untracked
work retained. Exclusive baseline at test-results/b119-scenario-empty-stages-20260914/:
two owner bytes,408input hashes/membership,406nonowners,50protectedartifact/cache files,
4realLua,19livefiles/memberships. Current previous AST/history/export changes are nonowners.
Reuse checkpoint script with new root/owners and previous final receipt; no old receipt edit.
X4/ports observed at baseline and before rendered run. Continuing testing authorization valid.
Rollback only exact unit deltas against snapshots; never restore entire dirty files.

## ACCEPTANCE / IMPLEMENTATION

1. Full existing scenario suite baseline. Extend it using REAL Session owners wrapped only
   to count project calls. Cases: empty, samples only, paths only, loops only, paths+loops.
   Expect2/2/3/3/4 calls respectively (base/final mandatory). Before optimization, count
   assertion must fail while semantic checks pass. Record complete program/evidence/scenario
   semantic digest before/after; no mock geometry or fabricated catalog.
2. Verify current selected inputs are cleared when restoring an empty scenario; exact
   source/profile/consumer identities and dependency order retained. Fresh authorities,
   invalid saved selectors, altered source, duplicates, excess loops, inverse transfer,
   reordered consumers and storage quota negatives stay covered. No test removal.
3. Minimal guarded intermediate projections. Full scenario/session/pipeline and mounted
   SourceEditor suites, whole tsc and two-owner lint. Full layout/source-edit suites already
   green on preserved bytes; run additional ones if reconciliation exposes changed contracts.
4. Unprofiled unchanged existing browser cases: named scenarios, B-after-A Undo/Redo,
   New-menu history, populated-row history, actualMENU.3200/3201,1worker,retry1,existing
   deadlines and zero-flake/report/cleanup guards. No new test output writers; prior audited
   spec inputs unchanged. Inspect actual PNGs and compare action durations, not just totals.
5. Fresh whole task-delta review, whitespace and frozen/protected guards; record status/AAR
   here/backlog/handoff. Full integration remains red until its complete gate passes.

Risk: missing a dependent catalog refresh or retaining old selections. Use explicit
nonempty/state guard plus full final reconciliation and semantic counterfactuals. No new
API/schema/spend/network/deletion/permission surface. No realmod/game/save/install/config/
external wiki/issues/global memory writes. No native/installed claim from this source unit.
User continuation supersedes generic skill feedback/commit pauses, not authority gates.

## CLOSE / AAR

Implementation: two conditional intermediate projections; no other product-byte change.
Added five real-owner cases and unknown path/loop/sample refusal checks; all original test
bodies preserved. review.mjs confirms exact product delta and identical semantic digest
be7736489aedf53512755b23e506092e1559f1ec52891394217c63e064a41e5a before/after. Count-only
fail-first4/4/4/4/4 becomes2/2/3/3/4 with base/final and final full readback intact.

Static checkpoint: original scenario baseline, extended scenario after repair, full session,
Pipeline125/125, mounted SourceEditor (including scenario first render, structural history,
profile continuity, contextual inputs and stale mounted controls), whole tsc, two-owner lint,
exact-delta review and whitespace PASS. Per-label logs/receipts in evidence root. Every
completed wrapper guard retained408input hashes,406nonowners,50artifacts,4realLua,19livefiles
and protected memberships. No arbitrary Lua or new external side-effect surface.

Rendered session34380/runner79244 TERMINAL:02:44:15.047Z to02:59:38.264Z. Complete report:
4passed/0failed/1flaky/0skipped,5terminal,0globalerrors, gate FAIL/exit1. Named scenarios15.4s,
New-menu47.8s, populated rows47.3s and actualMENU1.8min PASS first attempt. Scenario B history
first60s timeout then32.1s retry PASS. No deadline, retry, flake-policy or oracle change.
All408frozen inputs/406nonowners and protected guards/memberships unchanged; ownedtreeGone,
X4 absent, only pre-existing Deckwright3100/PID69604 listening. All static handles terminal.

[REPRODUCED] Unprofiled MENU actions: caption Apply19683.3ms vs22411.4ms previously;
Undo15056.2ms vs18312.8ms; Redo14687.0ms vs18203.3ms. This run is12-19percent lower on these
actions, not a universal benchmark guarantee. New-menu AddText2770.5ms, captionApply2776.4ms,
AddRow2388.5ms, Undo2231.2ms, Redo2129.7ms; still slow. Source validation was not bypassed.
MENU corpus preparation565134.6ms is separate from interaction time; completed within its
existing fixture deadline. Scenario B failing attempt Navigate27826.8ms, Apply3910.4ms,
Undo3273.9ms; retryApply3745.3ms. Initial navigation delay observed, underlying cause not
isolated. Do not attribute it to scenario replay or increase deadlines to manufacture green.

Inspected current actual PNGs: scenario-B-redo, New-menu alternate-edit, MENU reopened-focused.
Scenario B survives with edited title selected; alternate edit visible; imported menu shows
TRANSMIT/END at100percent and selected caption inspector. MENU remains a supported region,
not a complete render: unresolved cells and broader validation errors remain visible.
Not verified in game remains displayed. No whole-menu or native fidelity claim.
Read-only trace extraction: trace-timings.ps1. Timing/terminal/guard artifact: timing-review.json;
summarize.mjs plus final-review log/receipt validate five terminal cases/six traces and cleanup.

Review skill used: code-review-excellence. Optional reviewctl/rules/BlastRadius absent;
manual exact-delta, caller/dependency review, typecheck/lint and real-owner tests substituted.
No new source/history/persistence owner. No capability-map delta.

AAR non-clean: expected fail-first test plus rendered timeout; receipt/log
reads twice exceeded output budget. Sustain fail-first semantic control and independent
frozen-input/protected-byte verification. Improve tools: select JSON fields and cap each
log line before returning, never print entire receipts or nested evidence JSON. No global
memory/wiki write. Highest-risk evidenced weakness remains synchronous editor latency;
the repeated15-20s real-menu interactions remain the highest evidenced product risk.

Requirement review: planned two-guard implementation, semantic control, negatives, static,
mounted, unchanged browser execution, screenshots, timing and containment all evidenced.
Required green rendered gate MISSED due one flake; status FAILED, not complete. Full130
integration/precommit/package/install/native/release and9journey/3menu/12reference goal remain
open. Rollback is only the two guards plus appended test/import delta against saved owner
bytes, never wholesale dirty-file restoration. No Git/public issue/external ledger changes.
Next bounded work: isolate cold navigation with existing network trace; use existing CPU
profile to reduce remaining synchronous validation work without weakening authority checks.
Suggested eventual checkpoint title: perf(ui): avoid unchanged preview scenario replay stages.
No commit yet: this unit's no-Git boundary and required non-green gate remain.
