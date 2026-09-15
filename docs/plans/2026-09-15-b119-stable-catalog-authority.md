# B119 stable sample/path catalog authority

Status VERIFIED (bounded repair). FULL lane. Full builder ACTIVE/PARTIAL.
Goal: prevent later preview projections from invalidating earlier frozen scenario/history projections.

## Reconciliation / evidence / design

- HEAD332e215; production full-projection cache remains reverted. Diagnostic-only browser
  interception reproduced exact rejected factory without writing production files.
- Current evidence root:test-results/b119-scenario-mismatch-20260915. Baseline history
  PASS1/1; rejected factory fails both attempts. Exact snapshots: Undo current and savedA
  use source7D00629E, savedB stays at edited sourceE3E99FB2. B values themselves remain.
- Replay checkpoint6 is the refusal after applyX4UiEditorSampleDraft. Not JSON ordering:
  B is filtered out because its saved source identity failed to migrate.
- Existing rebindSampleCatalogAuthority and rebindPathCatalogAuthority mutate their
  issued WeakMap record's catalog/binding. Old frozen results retain old catalog+samehandle,
  so reference-equality authority admission can reject them after a later equivalent rebind.
- Existing rebindLoopCatalogAuthority already retains an exact catalog handle or issues
  a new handle for an equivalent new catalog. Reuse this model; do not broaden admission,
  accept cloned authority, remove exact binding checks or introduce an authority cache.
- The September 11 partial-scalar-editing plan already documents equivalent-binding
  rebinding and forbids changed-source migration through these helpers. This repair
  preserves that contract; the mutable retargeting defect is newly isolated. It is not
  permission to retry LRU variants. No capability-map delta.

## Bounded work / acceptance

1. In F:/DEV_ENV/X4_Forge/src/lib/x4UiEditorSession.selftest.ts add fail-first tests:
   issue catalog+handle, force equivalent fresh catalog through real owner, verify old
   catalog/handle still accepts its own valid draft/path update, and new pair works.
   Require distinct catalogs to reach the actual rebind seam. Check cross-pair/forged
   handle rejection and existing stale profile/source negatives unchanged.
2. In F:/DEV_ENV/X4_Forge/src/lib/x4UiEditorSession.ts make issued sample/path record
   fields readonly; exact catalog reuse returns originalhandle, equivalent new catalog
   gets newly issued handle exactly as loop implementation already does. No cache change.
3. Full session/scenario tests,typecheck,focused lint; diagnostic baseline/rejected-factory
   actual history tests with original assertion and checkpoint control counts. Rejected
   factory turning green under ONLY this repair is causal evidence, not cache acceptance.
4. Ordinary uninstrumented history/named scenarios/new-menu group must pass firstattempt;
   inspect actual restored scenarioB screenshot. Full integration/scene194of196/realMENU,
   packaged/installed/native/all9journeys/3menus/12references remain separate obligations.

## Risks / validation / rollback

- New handles can expose callers depending on mutable retargeting; include original
  single-entry owner semantics and all existing session authority matrices.
- No change to source binding equality, issued-handle membership, catalog equality,
  profile/source boundaries or stale-refusal tests. No user data/config/mod/game/install writes.
- Reconciliation coupling: path/sample reconciliation currently uses the supplied handle
  after mutating it. With immutable rebinding, retain the successfully rebound handle
  separately and use rebound-or-supplied for populated inputs, exactly like loops. Never
  use a freshly issued fallback to admit a missing/forged supplied handle.
- Reuse guard runner with frozen inputs/HEAD/status/protected50/realLua4/live19 and
  sequential3200/3201 workers1/owned cleanup. Quiet permission retained; machine check eachrun.
- Evidence under test-results/b119-stable-catalog-authority-20260915; earlier diagnostics
  retained. Roll back only new two-file source/test hunks; preserve prior diagnostic helper
  and E2E wrapper plus93unrelated paths. No commit without normal precommit; no push/release.
- Review complete diff and compare with established loop helper. Plan/close/AAR/handoff
  updated with exact results. No public issue/ledger or memory writes in this unit.

## Close / AAR

Completed 2026-09-15 00:26Z. [REPRODUCED] Sample and path regression tests each failed
against mutable rebinding with catalog-authority-required for the earlier frozen pair.
Production now issues a distinct handle for an equivalent new catalog, retaining each
old catalog/handle pair. Successfully rebound handles feed populated-input reconciliation;
missing, forged and cross-catalog handles are still refused. Original loop behavior and
single-entry owner cache remain unchanged. Two source/test files:16/16 production lines,
47 added test lines. No cache, renderer, source-writer, history or Lua format changes.

Validation evidence:test-results/b119-stable-catalog-authority-20260915/.
- red-sample and red-path: expected FAILED1; exact refusals retained in logs/receipts.
- session and scenarios: complete selftests PASS0, 00:15:19Z.
- types/lint and final-types/final-lint after hook removal: PASS0.
- rejected-fixed: exact rejected factory with repaired helpers PASS1/1 first attempt,
  00:20:32–00:21:17Z; observer hits component1/owner1/scenario1; no replay failures.
- diagnostic-fixed: normal factory PASS1/1 first attempt, 00:21:45–00:22:26Z;
  observer hits1/0/1; no replay failures. causal-summary.json records compact snapshots.
- history-browser: ordinary final files, no diagnostic interception, PASS3/3 first attempt,
  00:24:22–00:26:01Z; scenario B Undo/Redo, named scenarios, New-menu row/Text history.
  No flaky/bad results. Redo screenshot inspected: Title after edit A, Scenario B,
  Independent B. Separate shell validation1error remains visible, not cleared by this fix.
- All per-run input hashes (824 final pins), protected50/realLua4/live19, unchanged machine
  and owned process-tree shutdown checks PASS. X4 absent, unrelated Deckwright3100 unchanged.
- Manual complete-diff review and git diff --check PASS. Review skill's optional reviewctl
  and configured BlastRadius tool unavailable; existing pattern, negative matrices, types,
  lint and real browser checks used. No tool installation or network request.

Review: old/new valid pairs, distinct actual catalogs, copied/cross-pair refusal and stale
source/profile tests evidenced. The September11 equivalent-binding restriction is preserved.
Diagnostic hooks removed before final ordinary tests; earlier call-count wrapper untouched.
No capability-map delta. No release/native/full integration claim. No measured speedup.
Normal precommit/local six-path checkpoint is a separate integrity gate; authoritative
result will be checkpoint/post-commit.json. Do not infer commit completion from this plan.

AAR triggered by deliberate red tests and diagnostic cleanup refinement. Sustain proof at
both low-level issuance and original browser assertion. Improve: exact-record capture should
precede cache redesign; standalone evidence fragments must not use compiler-included .ts.
Highest-risk observed weakness was retargetable issuance identity; fixed with existing loop
semantics and permanent old/new/cross-handle regressions. Lessons banked in these two plans;
no global memory writes. Full UI goal stays PARTIAL with performance, real-menu body,
scene194/196, integration, packaged/installed/native and all9journeys/3menus/12references open.

### Final-file validation refinement

The counterfactual and normal-owner diagnostic history runs both passed first attempt.
Before the ordinary three-case run, archive the temporary diagnostic helper as ignored
`.ts.txt` evidence and remove only its import/hooks from the E2E spec. It depends on a
local rejected-factory artifact and is not a portable product test. Preserve the earlier
call-count wrapper unchanged. Re-run types/lint and ordinary history on these final files.
This is cleanup of the declared diagnostic rollback surface, not a changed assertion.
