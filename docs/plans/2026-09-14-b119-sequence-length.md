# B119 source-bound sequence length

Lane FULL. Status VERIFIED for bounded source analysis; imported-HUB recovery remains PARTIAL.
Goal: eliminate manual transcription of a proven local tab-list length at numeric consumers.
Architecture: extend existing CallModel numeric descriptors and LayoutProgram's independent
source validator/evaluator. Do not fold an unproven table into a bare numeric literal.

Baseline: HEAD8ceffa6; four intended executable paths clean. Existing93unrelated changes and
imported-HUB diagnosis records preserved. Prior full132/132 is baseline, not post-change proof.
Graph confirms numericExpressionStructureError -> numericExpressionError authority ownership.
Lua5.1 manual2.5.5 governs sequence length: https://www.lua.org/manual/5.1/manual.html#2.5.5.
Only dense implicit literal scalar sequences; holes, calls, mixed/keyed fields and escapes
remain unresolved. Unknown runtime tables are not made authoritative by their apparent size.

Owned executable paths: src/lib/x4UiCallModel.ts and .selftest.ts;
src/lib/x4UiLayoutProgram.ts and .selftest.ts. Existing helpers/index/alias/source matching reused.
No new API/dependency/renderer/history writer, real mod/game/config/install/publish/push or agent.
Local evidence: test-results/b119-sequence-length-20260914/. Rollback: exact owned diff against
8ceffa6, reviewed reversal only; do not reset/restore unrelated dirty files.

Acceptance / steps:
1. Red tests for source-known dense tab-list count, exact descriptor source, arithmetic use;
   reject mutation, alias escape, nil holes, runtime last-call expansion, keyed fields and
   altered declaration/source/value metadata. Existing tests remain intact.
2. Add table-length descriptor with base/declaration/source/value. Public numeric status stays
   deferred until LayoutProgram validates exact AST and read-only use of that source table.
3. Independent validator reparses source, binds exact lexical declaration and sequence length,
   checks every recognized alias use, rejects writes/escapes and unsafe builtin substitution;
   evaluator and closed evidence schema handle only validated descriptors.
4. Run complete CallModel and LayoutProgram selftests, normal types, exact lint and diff checks.
   Run actual original HUB public projection with unchanged corpus/source and compare count
   dependency; retain y, loops and body-dispatch failures. No green full-menu claim.
5. Browser/native acceptance remains required for complete HUB recovery after these prerequisites;
   this source-analysis unit cannot close visible UX or full integration gates by itself.

Numeric/generic loop replay and rowH/body dispatch are required following dependencies, not
removed from the goal. Extending literal-bound loop proof is deferred until the sequence
descriptor is independently validated, to avoid combining two unproven authority changes.
No capability-map delta before validation. AAR and exact results appended at close.

Reconciliation update (13:34Z): real HUB initially failed because the new builtin guard
treated unrelated named global registration as environment escape. Accept only non-reflective
literal sibling fields; keep dynamic keys, environment aliases and builtin substitution refused.
Independent review also found that saved ipairs return values expose the sequence. Automatic
proof therefore permits ipairs only as the sole direct iterator of a generic-for loop.
These are source-safety requirements, not HUB-name exceptions or Lua execution.

Recovery contract strengthened: an exact, structurally valid descriptor whose sequence cannot
be proven immutable must retain the existing preview-only numeric sample. Malformed descriptors
or wrong source/consumer bindings must never gain that fallback. Test both plain length and
arithmetic parents, sample provenance and intact evidence-pair validation. No test deadlines or
existing oracle expectations changed. Current-source HUB now resolves six columns at both
profiles, but loops, y and body dispatch remain unresolved; this is not rendered-menu proof.

## Validation / review / close

Evidence root: test-results/b119-sequence-length-20260914/. Every named run has a log and
*-receipt.json with command, timestamps, exit and all412 current input hashes. No input changed
during a run. Final executable revision is recorded in checkpoint-retry/baseline.json at staging.

- model-final:149/149, exit0; layout-loader-final:965/965,0skipped,exit0.
- types-loader-final: normal tsc --noEmit exit0; lint-loader-final: exact four paths exit0.
- hub-loader-final/loader-final-projection.json: unchanged original HUB hash
  657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F;
 1920x1080/scale1 and2560x1440/scale1.4 both have source-proven6-column tab table,
 no count gap or #TABS manual sample. y/i/name/nextTab and unsupported body dispatch remain.
- Negative coverage: holes/calls/keyed fields, earlier/future mutation, aliases/escapes,
 builtin/environment substitution, saved iterator state and paired malformed evidence.
 Unsafe but structurally valid sequences accept explicitly preview-only samples; malformed
 descriptors do not. Intact pairs validate, source models remain byte-identical in memory.
- Full diff manually reviewed with code-review-excellence; graphify confirmed existing owners.
 reviewctl unavailable on this host; exact lint, types, independent source/evidence tests used.
- Earlier132/132 E2E is PRE-CHANGE baseline only. No fresh rendered, packaged-host or native
 validation for this source-only unit. Complete B119/full imported-menu status stays PARTIAL.
- Local checkpoint uses unmodified installed precommit hook. Gate/commit verdict is recorded
 separately in checkpoint-retry/{commit-exit,post-commit}.json; do not infer it before those exist.

Capability delta: existing numeric owner can now source-prove dense immutable local sequence
lengths; no new renderer/API/source writer. External wiki/issue projection not written this
unit; this repository plan is the durable delta. No real mod/config/install/publish/push.
Commit title: feat(ui): prove immutable source sequence lengths for imported menus.

## AAR (triggered)

Sustain: original real-source probe exposed a missed integration case before acceptance;
 independent AST proof and consumer-bound samples share existing owners. Preserve failed logs.
Improve work: [REPRODUCED] initial guard rejected harmless global registration; readonly
 iterator proof accepted saved table state. Added exact regressions and corrected both.
 [REPRODUCED] two new tests initially inspected the wrong provenance owner / absent stripped
 metadata. Reconciled operation.columnCount and explicitly seeded optional schema descriptors;
 did not lower expected safety behavior. Initial type error corrected with exact node type guard.
Improve tools: oversized output reads recurred. Degradation called; bounded unit/checkpoint,
 compact scalar summaries and no next feature in this stretch. reviewctl unavailable, no install.
Highest-risk observed weakness: a passing small fixture can conceal real-menu refusal or an
 alias escape. Countermeasure proven here: full-source positive probe plus four red-to-green
 iterator escape cases and paired malformed-schema negatives. Full-menu pixels remain required.
Lessons banked locally in this plan/handoff; no global memory or external ledger writes.

Final review addendum: [REPRODUCED] loader-red accepted loadfile while refusing load.
Stopped the first checkpoint before commit (HEAD unchanged); retained its log/exit1.
Verified and stopped the orphaned npm/precommit child tree by command and creation time.
A first timestamp comparison mixed local/UTC; corrected the identity check, not its target.
Added shared reflective-loader names plus direct/reflected loadfile negatives. loader-green
refuses both loaders with preview-only recovery, layout-loader-final965/965 and final types/
lint PASS. Real HUB remains6 columns at both profiles. No hook bypass or assertion change.
Extend-versus-replace decision: retain the existing independent AST validator and numeric
consumer path; these three new-case defects do not justify a parallel source authority.
Iterator behavior reference: https://www.lua.org/manual/5.1/manual.html#pdf-ipairs.
Second checkpoint receipt is checkpoint-retry/post-commit.json; first remains interrupted.
