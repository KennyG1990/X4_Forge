# B119 table-proof latency — bounded implementation plan

Status: PARTIAL. Full B119 goal remains ACTIVE/PARTIAL. Original acceptance was SPECIFIED before implementation.
Lane: FULL. Parent: c0a173b3c8da327dff241f6f9e891c3ad9fb48ef.

## PLAN / acceptance

- Unit: eliminate proof attempts for identifiers that cannot possibly alias a particular source table. Improve the measured real-HUB edit bottleneck without changing accepted geometry or source-edit authority.
- References: approved canvas-first plan, original Lua, current source proof implementation, prior real-HUB CPU/browser traces. Lua remains canonical; no arbitrary Lua execution.
- Reuse the private source AST index and existing exact alias/declaration/scope/write checks. Derive a conservative name reachability set from LocalStatement/AssignmentStatement initializer pairs: exact table constructors seed names; local identifier initializers add edges. Ignore scope, chronology and hop limits in this prefilter so it only overapproximates. Every surviving candidate still runs the complete existing proof. Cache only private AST-derived structure, never caller metadata or validation results.
- In scope: F:/DEV_ENV/X4_Forge/src/lib/x4UiLayoutProgram.ts and its selftest; this record and SESSION-HANDOFF.md; scratch diagnostics under F:/DEV_ENV/X4_Forge/test-results/b119-table-proof-latency-20260914.
- Out of scope: renderer, history, source format, safety policies, public releases, installed host/game/mod/config writes, existing scene failures, unrelated 93 dirty paths.
- Risk: a false-negative candidate set could hide a write/escape and incorrectly treat a table as immutable. Acceptance requires positive multi-hop aliases and preservation of baseline refusals for reassignment/parallel-binding transfers, plus escaped/mutated/shadowed/cyclic aliases, same-model source replacement and forged metadata after warming. Checkpoint-review correction: the initial wording incorrectly called reassignment/parallel transfers positive cases; baseline-layout proved they were already unsupported. This optimization does not add their support or weaken that refusal.
- Baseline/rollback: inspect HEAD/index; preserve unrelated changes. Revert only this unit's exact hunks if required. No broad Git operations.
- Validation: baseline/current same-runtime original-HUB CPU diagnostic with deep-equal output; complete layout, source-edit, scenario, session and pipeline selftests; typecheck and focused lint; current scene test with exact baseline failure comparison; actual isolated rendered HUB heading edit/undo/redo/export/reopen and trace latency. No raised timeout or weakened test oracle.
- Evidence: unique labels, timestamps, source/input hashes and 50 protected/4 real Lua/19 live-file guards through adapted existing runner. Audit direct E2E writers before running. Keep 3200/3201, workers=1 and protect Deckwright3100.
- Performance gate: report actual timings, do not infer browser responsiveness from CPU speed. If no material browser improvement is measured, retain PARTIAL and investigate rather than claiming UX fixed.
- Full integration, packaged/installed/native gates are not part of this bounded repair and remain unmet.

## BASELINE / RECONCILE

- HEAD c0a173b verified, index empty; prior eleven-file checkpoint verified in its post-commit receipt; 93 unrelated paths remain.
- Last rendered heading edit/undo/redo: 20.464/17.863/15.400 seconds (action wall times, not isolated CPU). Original-HUB diagnostic: 79.644 seconds.
- Source-mapped inclusive CPU: exactTableSequenceAliasSourceBinding 28.748s; immutableSequenceIsReadOnly 30.155s; evidence validator14.027s. Inclusive values overlap, must not be summed.
- Existing graph confirms shared layout proof owner used by source edits and scene projection. Existing AST indexes are invalidated by source-text replacement; caller alias metadata is mutable and must remain checked every time. No capability-map delta yet.
- Agent-brain recall returned an unrelated June bridge conversation, not useful evidence for this latency diagnosis.

## EXECUTION / REVIEW / CLOSE

Implemented 56 lines in the existing layout owner; 41 regression-test lines. No other executable surface changed.

- Baseline/current CPU (Node24.19.0, same original HUB and exact output parity):89,650.731ms ->48,794.636ms,45.57% reduction. Single paired diagnostic, not browser UX proof.
- Baseline and current layout1098/1098 PASS; current source174/174 plus causal matrices PASS; scenarios/session PASS; pipeline127/127 PASS; typecheck and two-file lint PASS. All guards50protected/4Lua/19live and input/HEAD/status continuity PASS.
- Scene FAILED194/196; complete failure lines equal prior name-index-scene.log. The two old HUB operation/gap and MENU sample-count assertions remain unresolved, not waived. comparison.json validates exact failure and diagnostic output parity.
- Review: the new name set is only a conservative rejection filter. Both seed and edge construction match necessary syntax conditions of numericExpressionAliasSourceBinding/prove. Extra names from shadowed scopes, later assignments, cycles and longer chains only incur the old proof; they cannot grant authority. Private AST source-text invalidation is reused. No caller alias/descriptor or validation result is cached.
- The code-review skill's reviewctl and configured BlastRadius script are absent on this machine. Used complete manual diff review, existing graph dependency inspection, typecheck, lint and negative-path tests instead; no installation/config change.
- E2E output audit: current browser inputs differ from the prior guarded run only in the two intended source/selftest files. Selected test and fixture writers rechecked: captures/downloads/observations/profiles use testInfo.outputPath or in-memory attachments; manifest database is restricted to harness-owned temporary state. Test remains120s with separate630s reference fixture, workers1,3200/3201. No destination changes or external writes authorized.
- Rendered result: PASS1/1 first attempt,22:32:48–22:39:05Z,0failed/flaky/bad/report errors, treeGone=true. Reference fixture265.648s. Actual edit/undo/redo14.372/10.021/10.257s against previous20.464/17.863/15.400s (action wall times, not CPU). Exact source/pixel/hierarchy/history/negative duplicate-import checks passed. Reopened capture inspected: edited heading, six tabs, selectedDOSSIER andFACTIONS header remain; later body is still unresolved. All input and50/4/19guards passed; X4 absent, Deckwright3100/PID61604 unchanged.
- Requirement review: bounded performance improvement and preserved source authority done/evidenced; immediate-feedback UX still unmet. Scene remainsFAILED194/196. Full integration/packaged/installed/native/three-menu obligations remain open. No capability-map delta and no new user-facing functionality claim.
- Local PARTIAL checkpoint candidate: perf(ui): prune impossible source table alias proofs. Five owned paths only (two source/test files, this plan, BACKLOG.md, SESSION-HANDOFF.md). Normal precommit required before committing; no bypass/push/release/install. HEAD remainsc0a173b until a verified commit receipt exists.
- Checkpoint runner:test-results/b119-table-proof-latency-20260914/checkpoint.mjs. Run commit once, observe the same process to terminal, then verify. Actual completion authority is checkpoint/post-commit.json, never the prepared wording in this file. Pin all current tested inputs, exact five staged paths, the unchanged normal precommit hook, and all93excluded paths/50protected/4Lua/19livefiles. The prior eleven-path runner is reused only after adapting parent, path scope and current receipts.

## AAR

Triggered: oversized inspection output during recovery and one nonexistent glob in a read-only search; corrected with bounded exact-path reads, no data mutation. The scene gate reproduced its two prior failures; no assertion changed.
- Checkpoint review corrected an acceptance-description error against baseline behavior: reassignment/parallel table aliases remain refused. No executable or test changes resulted, and no positive capability is claimed.
- First checkpoint attempt FAILED before commit:22:45:35–22:46:19Z, normal precommit Vite lifecycle readiness request timed out at its unchanged10s timeout. HEAD unchanged; five paths remained staged. Preserved checkpoint/commit.log and commit-exit.json. Focused unchanged Vite selftest then PASS22:47:11–22:47:21Z with same315files/43190candidates/CSS SHA and50/4/19/input/status guards. Transient startup contention is HYPOTHESIS, not diagnosed. No code/config/timeout change. Retry full normal hook once using checkpoint-retry.mjs and separate checkpoint-retry receipts; do not overwrite the failed attempt. Retry completion authority:checkpoint-retry/post-commit.json.
- Sustain: source-mapped CPU evidence selected a real bottleneck; before/after tests retained exact behavior; rendered timing measured actual user actions.
- Improve approach: avoid repeatedly scanning unrelated identifiers; source-only conservative candidate sets remove work without caching mutable authority. Further edits remain14s and must not be called immediate.
- Improve tools: use bounded output and discovered exact paths; reviewctl/BlastRadius unavailable, manual graph/diff/type/lint/negative checks substituted.
- Highest evidenced weakness: synchronous validation/model comparison still blocks editing. Current candidate profile retains closedJsonDomain10.398s and jsonEqual6.478s self-time across the whole diagnostic. Investigate repeated validation ownership next; no fast-path authority cache is authorized by this finding alone.
- No memory or external-ledger writes. This plan and the handoff bank the project-specific result and remaining risk.
