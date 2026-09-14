# B119 workspace-scoped File/Menu selection
> For Agent: use planning/executing-plans; approved canvas-first design and goal objective govern.

Goal: returning to an unchanged workspace restores its selected File/Menu without another click.
Architecture: retain only selector strings in a component-lifetime Map keyed by immutable workspaceScope.
Reuse reconcileX4UiEditorSelections and current owner-issued source/target catalog. No persistence,
source snapshots, canvas receipts, edit authority, draft/history, or scenario storage in this Map.
Tech stack: React/TypeScript; existing mounted selftest and real serial Chromium harness.

Task: B119 workspace view selection
Lane: FULL
Status: VERIFIED (bounded selection repair and clean browser acceptance); full B119 PARTIAL

PLAN
- Bounded unit: selection lifetime across workspace switches while the source editor stays mounted.
- Assumptions: App restore/create update workspace and immutable scope together; UIBuilder source mount
  stays mounted on this switch. Reconciled from App restoreParkedWorkspace/createWorkspace and UIBuilder.
- In scope: per-scope File/Menu intent; exact catalog reconciliation; intentional empty selection;
  no cross-scope selection even for byte-identical workspaces.
- Out of scope: persistence across page reload/editor unmount, saved named scenarios, hierarchy selection
  persistence, numeric reconciliation, global preferences, history/ack/CAS changes, native X4 or release.
- Files: F:/DEV_ENV/X4_Forge/src/components/X4UiSourceEditor.tsx and its .selftest.tsx;
  existing tests/e2e/x4-ui-source-editor.spec.ts remains the unchanged browser acceptance oracle.
- Risk: cross-scope view leakage, stale selectors reviving authority, pending export from old workspace,
  deliberate empty choices overridden. No new network/spend/delete/security boundary.
- Rollback: exact pre-unit snapshots in test-results/b119-workspace-selection-20260912/*.before;
  restore only this unit's diff, preserve all preceding dirty work. No Git mutations.
- Acceptance: unchanged A -> B -> A restores A's exact File/Menu and newly rendered canvas;
  unseen/blank/identical B has no inherited selection; B's choices and explicit deselection are independent;
  missing/changed source or stale target never render/authorize from remembered strings.
- Required validation: fail-first mounted regression; complete SourceEditor mounted selftest,
  x4UiEditorSession and x4UiWorkspaceSource suites, whole typecheck, strict changed-file lint,
  exact pre-unit diff review, Graphify deterministic update, unchanged actual Lua browser roundtrip.
  Real screenshot inspection of returned original, exported/reopened preview. Keep all individual
  assertions, 120s aggregate limit and zero-flake policy. No manual reselect on final browser return.
- Safety: isolated ports3200/3201, workers1; freeze input hashes during acceptance, verify 19 persistent
  guarded files plus additions/deletions and Deckwright3100/PID30164 afterward; no native tools workaround.
- Evidence: test-results/b119-workspace-selection-20260912/ (snapshots/logs/receipt/browser artifacts).
- Unavailable: installed/native product gates are not this bounded repair's proof; full goal remains PARTIAL.

BASELINE
- 2026-09-12T10:50:13Z HEAD93c9af111d63ca77c99dee11f21882c4073bcda6, dirty prior work preserved.
- Prior 45 input pins match exactly; 19 persistent files unchanged, zero added/deleted.
- No X4.exe or active E2E runner; ports3200/3201 free; Deckwright3100 PID30164.
- Prior browser failed only at final restored-original canvas; actual original ID/workspace exact readback
  both attempts, empty File/Menu controls. Proof: b119-menu-targets-20260912/returned-workspace-proof.json.
- SourceEditor/session existing selectors unscoped, so imported B replaces A's two strings.
  Existing mounted scope test manually reselects on return and cannot prove actual journey.

RECONCILE
- Graph path selection reconciler -> SourceEditor file -> component (containment only); live code authoritative.
- Scope owner: App immutable workspace ID, not editable domain id/name. UIBuilder passes scope to SourceEditor.
- Existing selection/history/draft/canvas owners inspected. Keep historySelectionCarryRef,
  selectedMenuIntentRef, cancellation epochs, scalar history and workspace canvas clearing unchanged.
- Source key binds exact path/index/source identity/registration/editability/parse/verification status.
  Target key binds issued ID/kind; reconciler permits only unique identical target-body reindex.
- No appropriate scoped File/Menu view owner found in App/UIBuilder or workspace storage search boundary.
- Agent-Brain recall hit is weak: old July onboarding/validation conversation, no menu-selection design.
- Capability-map/ADR read-only: immutable scope and source/verification truth respected. No external map write.
- Existing identical-scope test previously allowed inherited selectors in a new ID. Amend its expectation:
  new scope starts unselected; explicitly select there to continue old-export rejection/fresh-canvas checks.
  Remove manual selection ONLY from return-to-A positive to expose regression.

EXECUTION BATCH
1. Strengthen existing mounted scope probe for automatic return and independent choice; run fail-first.
2. Replace two unscoped selector states with one scoped Map; route existing setters to current scope.
   No catalog fallback/name matching. Validate full mounted/session/source suites and strict static checks.
3. Fresh-eyes review and actual unchanged browser journey; inspect actual images; record close/AAR/handoff.

IMPLEMENT / VALIDATE / REVIEW / CLOSE
- Implemented only the two planned component files. Existing two setter names now route functional
  Map updates to the current scope. New scopes derive empty selections before projection; unchanged
  reconciliation is the only path from strings to current catalog authority. Same-scope unscoped
  compatibility remains. No parent API, history, source mutation, canvas lifetime, or E2E assertion changed.
- Fail-first complete mounted run exit1, P7 19/21: old code inherited selection in a new identical scope.
- First post-implementation run P7 19/21 exposed a fixture mistake: MountedDomElement.select.value
  tracks dispatched input, while React sets option.selected directly. Corrected ONLY new assertions
  to inspect selected options (existing history probe convention); no production relaxation.
- Complete mounted rerun exit0, P7 21/21; later real source/import/ack, history, async refusal,
  actual browser canvas-layout and UIBuilder viewport matrices reached. Logs: mounted-complete.*.txt.
- Session complete exit0 (causal23/23, color7/7); WorkspaceSource complete exit0 (causal5/5).
- Whole typecheck exit0 and strict two-file lint exit0 after final assertion correction.
  Earlier strict lint caught two newly scoped callback dependencies; included in existing effects.
- Fresh-eyes complete pre-unit diffs reviewed: selectors only, no saved state/authority replay;
  tests now require automatic return, independent new IDs, deliberate menu/file deselection,
  changed/missing-source refusal, exact-source recovery, source-byte preservation and old-export rejection.
- reviewctl and its configured BlastRadius file unavailable. No automated review-tool claim.
- Graphify deterministic update exit0: 11520 nodes / 29031 edges / 345 communities, no LLM;
  existing 5000-node HTML guard retained. Exact-diff whitespace check reports no errors
  (git --no-index returns1 for differences; that is not a whitespace failure).
- Actual unchanged browser Lua journey ran on frozen45 inputs and original19 persistent guards.
  frozen-baseline.json confirms only the two intended source/test files drifted from prior baseline.
- Full goal remains PARTIAL regardless of bounded result; no interim push or release.

FINAL VALIDATION / CLOSE — 2026-09-12 11:03Z
- Browser runner exit1, structured gate RED: 0 passed / 0 failed / 1 flaky, zero-flake policy unchanged.
  First attempt reached ALL16 checkpoints including returned-original-workspace and exact bitmap,
  then failed no-console-errors from one POST /api/agent/workspace net::ERR_NO_BUFFER_SPACE at10:57:52Z.
  Retry PASSED the entire test with zero page/console/request failures. A retry pass is NOT a green gate.
- Independent verify-roundtrip.mjs exit0 compares both attempts' exact immutable ID/workspace/source/
  hierarchy/profile/bitmap restoration, independent blank canvas, Undo/Redo/refusal preservation,
  and both actual downloaded Lua files (2818/2815 bytes); roundtrip-proof.json records hashes.
- Visually inspected actual imported-menu PNG and final restored-original screencast JPEG.
  File/Menu populated and current canvas present. Partial red outlines/overlapping text still visible:
  this is selection-lifetime proof, NOT acceptable finished UX or native-game fidelity.
- Screenshot: returned-original-first-attempt.jpeg SHA256
  529213A235D51562BA90DB5B8D95B8EFCB1D2D4A1405F553BDD9B329381EC6B5.
- post-browser-safety.json: frozen45 inputs unchanged,19 persistent files unchanged/zero added/deleted;
  complete structured report/ownership/lifecycle, treeGone, no remaining runner;3200/3201 free;
  Deckwright3100 PID30164 unchanged. HEAD unchanged. All validators terminal.
- Status PARTIAL; turn PROGRESS. Next: fresh continuation, same unchanged serial Lua test for a clean
  zero-flake verdict; retain this failed/flaky receipt. Reconcile repeated network failure before changes.
  Cause of ERR_NO_BUFFER_SPACE unknown;1158 endpoints/838 TimeWait post-run does not prove exhaustion.
- No new authority requested or used; no external wiki/issue changes. No capability-map publication.
- Suggested eventual commit: fix(ui): retain menu selection per workspace.

AAR
- Triggered by reconciliation of formerly inherited identical-scope selection test.
- Tool friction: oversized read batches truncated; missing/glob-invalid rg path failed, corrected to rg globs
  under src. Do not infer absence from failed search. Prefer bounded exact ranges and structured summaries.
- Test improvement: use selected option state for render-driven transitions in the lightweight mounted
  fixture; its input-only value getter is not a browser readback oracle. Real browser gate stays required.
- Sustain: exact original browser test finally reaches16/16 on both attempts; zero-flake policy correctly
  prevents false success from network recovery. No retry suppression/timeout changes or extra source writer.
- Improve tools: another oversized artifact enumeration and wrong ZIP resources prefix were corrected;
  actual screencast file is its full archive entry path. No image bytes edited, exact entry copied once.
- Degradation call made after those two evidence-handling mistakes: close evidence/safety now,
  fresh continuation for next unit. Do not open another implementation batch in this turn.
- Highest-risk new evidence: one failed workspace request can coexist with exact later persistence and
  restored preview. Retain error gating and rerun clean, not optimistic release narration.
- AAR banked in this local plan, receipt and handoff. No global memory/skill or external ledger write.
- Highest risk currently evidenced: mounted return test's manual reselect hid the real user-facing failure.
  Replace that surrogate with automatic restore assertion and retain actual browser acceptance unchanged.

CONTINUATION — 2026-09-12 11:08Z, clean acceptance rerun SPECIFIED
- Re-read full goal, current handoff/backlog and this plan. Previous turn PROGRESS.
- Live baseline45 pins unchanged,19 protected files unchanged/zero added/deleted,HEAD unchanged;
  no X4.exe or E2E runner,3200/3201 free; Deckwright3100 PID30164. Recall returned an old June
  conversation with no exact ERR_NO_BUFFER_SPACE mention; not a diagnosis or solved-work hit.
- Run the unchanged serial Lua journey ONCE in a fresh isolated stack; keep all source/test bytes,
  per-action/120s aggregate limits/retry1/zero-flake policy. --trace=on only preserves successful
  visual evidence; it does not change assertions. All earlier failed/flaky receipts remain.
- Inspect structured verdict,16 checkpoints, actual screenshot and45/19 post-run safety checks.
  If failure recurs, reconcile evidence before changes; no network/process/config workaround.
- Evidence: test-results/b119-workspace-selection-clean-20260912/.

CONTINUATION CLOSE — 2026-09-12 11:12Z
- Same source/test bytes, no implementation changes. Clean browser runner exit0:1passed/0failed/0flaky,
  first attempt, all16 checkpoints. Trace retained; independent actual workspace/bitmap/source/
  hierarchy/profile/UndoRedo/refusal/download comparison exit0, no page/console/request errors.
- Current actual returned screenshot inspected (returned-original.jpeg, SHA256
  40818E6569A9B19CB4A5BDC2EBFBCCEE046AFD2FE4B5EEB0E918E3029CC26D7E). File/Menu restore without clicks;
  current canvas present. Red outlines/overlapping text remain broader fidelity work, not proven usable.
-45frozen inputs unchanged,19guards unchanged/zero added/deleted; complete report/lifecycle/ownership,
  treeGone,3200/3201free,Deckwright3100PID30164 unchanged. No source/Git/config/install/live writes.
- Bounded selection unit VERIFIED from existing mounted/static proof plus clean rendered acceptance.
  Full goal ACTIVE/PARTIAL. Keep prior flaky receipt; its network cause remains unproven.
- AAR: sustain original assertions and immutable evidence; observed visual quality must be addressed
  separately from state/pixel equivalence. Local records only. No general-memory or external publication.
- Commit point: fix(ui): retain menu selection per workspace (not committed/pushed; public release only).
