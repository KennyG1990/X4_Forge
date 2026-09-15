# B119 checked model normalization

Lane FULL. Status PARTIAL: implemented and scoped checks pass; responsiveness unresolved.
Full visual-builder goal ACTIVE/PARTIAL.
Goal: reduce measured real-menu projection work while preserving exact source authority.
Architecture: replace repeated walks only inside canonicalizeX4UiLayoutModel with one
descriptor-checked copy that removes undefined record values and static alias sourceLiteral.
Existing parser, source matching, evidence validation, edit/history and UI owners remain.

## Baseline / reconcile / acceptance

HEAD bec7f3e; src/lib/x4UiLayoutProgram.ts and its selftest clean before this unit.
97existing dirty paths (including return-cost plan) are not owned. Prior source and live
guards and exact current HEAD remain baseline. Return-cost comparison.json proves complete
two-profile result equality and34canonicalizations/6.342s inclusive in one instrumented
diagnostic. This is not browser time or a stable benchmark. Canonicalizer is shared by
projection, session, return-source proof and source editing; preserve those contracts.
ADR/capability ledger inspected: native verification remains external, no capability delta.

Alternatives: whole-result/authority caching (not selected; prior scenario failures),
descriptor micro-rewrite (prior experiment slower), checked traversal fusion (selected).
Extend-versus-replace: retain the current owner and public signature. Prior replay-cache
failures concern lifetime/authority sharing, not a need for a second renderer or validator.

In scope: src/lib/x4UiLayoutProgram.ts, src/lib/x4UiLayoutProgram.selftest.ts,
this plan and concise BACKLOG/SESSION-HANDOFF close. Ignored diagnostic scripts/evidence in
test-results/b119-return-cost-20260915/. No other product surfaces or dependencies change.
Out: arbitrary Lua execution, projection/authority cache, layout changes, timeout relaxation,
menu coverage claim, release/install/game/mod/config writes, public push.

Risks: changed JSON admission, accidental getter calls, alias source loss, stale reuse,
prototype pollution. No new network/spend/deletion surface. Recovery: restore only this
unit's exact hunks from bec7f3e after checking no overlap, using apply_patch.

## Steps

1. Preserve the current canonicalizer and its exact helper bodies as an ignored independent
   baseline oracle before mutation. Capture source hash. Exercise accepted trees, explicit
   undefined records, aliases, null prototypes, shared DAGs and malformed/cyclic/accessor/
   symbol/nonfinite/sparse/custom-prototype values. Verify no source mutation, fresh copies,
   no accessor execution, and changed inputs re-evaluated. Add durable selftest assertions.
2. Implement one checked copy in the existing canonicalizer. Validate own data descriptors,
   prototype, symbols, dense arrays, enumerability and finite primitives; reject cycles.
   Never hide malformed sourceLiteral before validating it. Keep legacy handling for the
   exceptional own __proto__ key by falling back to the old exact pipeline; do not silently
   alter that unrelated compatibility boundary. No shared persistent cache.
3. Compare old/new outputs and rejection across deterministic cases and parser models.
   Run guarded actual-HUB diagnostic twice; require complete two-profile program/authority
   pair hashes and summary equality to native baseline, plus lower whole-diagnostic cost.
   If no useful reduction, revert candidate, retain evidence and select a measured owner.
4. Run Layout, SourceEdits, session/scenarios, Scene, pipeline, typecheck and focused lint.
   Audit E2E writers before unchanged-timeout serial3200/3201 rendered history/scenario/HUB
   check with traces. Inspect real edited/reopened screenshots. Guard50/4/19/57/source pins.
   Required browser evidence may span the next batch; without it status is PARTIAL, not
   a verified responsiveness repair. Full E2E/installed/native remain full-goal gates.
5. Review exact diff against objective, admission tests and old/new comparisons; record
   close/AAR. Normal precommit before any exact-path local commit. Never push this unit.

## Close / AAR

## Implementation / validation / review — 2026-09-15

Changed only canonicalizeX4UiLayoutModel and25durable selftest checks. The checked copy
uses no persistent cache, admits descriptors before values, checks cycles/dense arrays/
prototype/symbol/enumerability/finite values, validates dropped alias provenance, and
retains the old exceptional __proto__ path. Raw source and downstream evidence checks
remain unchanged. No capability-map delta. Recall returned an unrelated Agent_Harness
note/header, not a solved B119 design; graph traversal was too generic to prove cause.

- Immutable bec7f3e oracle versus candidate:185differential cases, no getter calls,
  five mutation/copy controls PASS. Transparent-input key scans3→2 (output traversals
  excluded). Parser fixtures now explicitly require actual calls and correct rel/sourcePath.
- Actual HUB two-profile complete program/authority hashes and summary JSON identical:
  native baseline20.281s, candidate15.146s and13.987s. These include several projections,
  are two samples rather than a stable percentage, and are NOT browser action timings.
- Layout1225/1225 PASS, including reviewed stronger null-prototype assertion; SourceEdits
  175/175, session, scenarios, Scene196/196(real3menu census), pipeline127/127 PASS.
  Types and two-file lint PASS, both rerun after the test-only review correction.
- Rendered4/4firstattempt/0flaky PASS07:43:10.795–07:52:17.455Z. Unchanged test deadlines,
  workers1,3200/3201. Complete verdict, treeGone=true. X4absent, Deckwright3100PID61604
  unchanged. All823inputs/50protected/4realLua/19live/57oldarchive guards PASS.
- Four trace-parser negative controls PASS. Browser API spans Apply17.652→16.457s,
  Undo13.714→11.013s, Redo13.349→10.801s. Following workspace checks1.054→5.079s,
  1.020→1.047s,1.042→1.039s respectively. Exact action-start to following-check-end:
  Apply18.706→21.538s (WORSE), Undo14.735→12.062s, Redo14.392→11.840s.
  [REPRODUCED] these are observed timings. Cause of the longer Apply follow-up is not
  diagnosed; no stable overall interaction speedup or immediate-feedback claim.
-26fresh artifacts exclusively copied/hash verified into normalization-rendered-evidence:
  four traces,twoLuaexports. Reopened HUB, helper recovered/cleared, scenario B Redo
  screenshots visually inspected. Title/six tabs/FACTIONS survive; much body still missing.
  Fixture-level banners/partial labels remain visible; not installed/native acceptance.

Evidence root:test-results/b119-return-cost-20260915/. comparison.json is diagnostic
parity; normalization-{differential,hub-one-comparison,hub-two-comparison}.json are old/new
proof; normalization-*-receipt.json/log are exact commands/timestamps/results.
normalization-browser-comparison.log holds source-bound action/callId pairs. RESULTS.md
links screenshots and shows the mixed timing result. Do not rerun exclusive archive writers.

Requirement review: checked normalization/copy/preservation done; differential/static/
coupled/rendered checks done; source/live guards done; full goal NOT done. Actual-HUB
factions-list diagnostic still has refused later tables, unresolved ry after conditional
updates, and a locked mixed-stream edit catalog. Native/installed/fullE2E obligations remain.
No normal precommit on this candidate yet; no commit/push/install/release/mod/config write.
Next checkpoint title: perf(ui): normalize source models in one checked traversal.
Next product work must address measured Apply-to-workspace delay and source-supported
body/editability, not present narrower fixture success as finished authoring.

AAR NON-CLEAN: review tightened a potentially vacuous null-prototype assertion; the
independent parser fixture was corrected to rel/sourcePath with a real-call assertion;
oversized reads required bounded output; one read-only PowerShell timing-report command
failed on foreach piping and was corrected with a dedicated result variable. No product
test failed and no rollback occurred. Sustain immutable differential oracle, whole-pair
hash parity and exact source-bound browser spans. Improve: assess action AND follow-up
workspace completion before claiming UX gains. Highest evidenced risk is apparent Apply
improvement masking a longer workspace check; inspect the retained trace's synchronization
path before changing code or claiming causality. Lessons kept in this repo plan only.

All9journeys/3menus/12references and gameVerified=false remain mandatory.

## Local checkpoint batch

2026-09-15 continuation: prior turn PROGRESS. Revalidated HEADbec7f3e/index empty,
X4absent/only Deckwright3100PID61604. Six owned files only: normalizer+selftest,
BACKLOG,SESSION-HANDOFF,this plan,and return-cost-attribution plan.96other dirty paths
excluded. Normal package precommit:check resolves to scripts/precommit-check.mjs;
run unchanged via checkpoint-run.mjs normalization-precommit, guarding83archived files
(57previous+26current),50/4/19protected/live and current source/config inputs.
After PASS, refresh this close/handoff, stage only six exact paths, reread staged diff,
then commit with normal installed hook. Verify exact staged-versus-committed patch and
excluded bytes/deletions, source inputs and83archives. No push. Retain mixed timing and
full-goal PARTIAL status in the commit message. Apply trace inspection is read-only while
the gate runs; no new product mutation or new E2E run belongs to this checkpoint batch.

Checkpoint gate attempt1 FAILED07:59:24.707–08:00:00.466Z: Vite lifecycle selftest's
unchanged10s readiness HTTP request timed out.824inputs/83archives/50/4/19guards PASS.
No remaining gate/selftest process; original selftest closes Vite in finally. Unchanged
focused normalization-vite-recheck PASS08:01:17.188–08:01:20.669Z with the same guards.
No code/timeout change; cause of first timeout not established. Retry full normal gate
once as normalization-precommit-retry, preserving both receipts. A guessed .mjs inspection
path was wrong; corrected to package-owned scripts/e2e-vite-server.selftest.ts without
mutation. No staging or commit before a complete normal precommit PASS.

Full unchanged precommit retry PASS08:01:49.729–08:13:37.153Z, code0,824inputs and
83archives/50/4/19guards intact. Ready for exact six-file local staging and installed-hook
commit. Final authority:test-results/b119-return-cost-20260915/checkpoint/post-commit.json;
if absent, inspect commit-exit.json and current Git/job state rather than assuming success.

Read-only trace inspection PASS (normalization-workspace-read-inspection receipt/log):
the longer workspace check is one evaluation/one GET, not repeated polling retries.
Browser/test clock offsets differ by0.184/0.299ms. Baseline GET response wait732.670ms;
candidate4591.433ms (total HTTP736.194/4597.123ms). Other API reads overlap the latter.
This is response-wait evidence, not proof of backend CPU, a specific handler bug or a
normalizer-caused regression. Next unit should trace /api/agent/workspace through its
actual request/transport/shared-work owners. No product repair for that delay in this batch.

Degradation called after wrong-extension and shell-quoting inspection mistakes. Scope
held to checkpoint; no further product mutation. Keep a fresh context for the next unit.
