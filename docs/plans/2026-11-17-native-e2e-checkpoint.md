# Native E2E compiler teardown checkpoint

Task: qualify and commit the existing internal #112 harness repair independently of the pending product release.
Lane: FULL. Status: PARTIAL — exact executable qualification VERIFIED; actual commit hook and push pending.

## PLAN

- Bounded unit: only failure diagnostics in `scripts/e2e-runner-lifecycle.mjs` and the owned compiler stop in `tests/e2e/global-setup.ts`, projected onto HEAD772bdaf. No version, product source, package, release or unrelated test change.
- Authority: AGENTS.md delegates commit/push and explicitly limits publish-before-commit to user-facing releases. This internal test checkpoint has no publish step. Existing #112 plan and matched red5d6d5d7a/green8f9a4469 support the cause; they do not replace this smaller projection's gates.
- Baseline: detached HEAD and origin/main772bdafca2d8740b399a5eb7f2729ab700fc24c1; real index empty. Preserve every mixed working file. No branch creation, merge, reset, clean or history rewrite.
- Reconciliation: both selected executable diffs contain only reviewed harness changes. HEAD already owns the native runner and normal six-case reference-settings workload. Reader-only #119 checkpoint was rejected because its19-case workload depends on uncommitted product fixes. Reuse existing isolation/dependency/runner helpers. No capability-map delta.
- Risks: losing unrelated dirty bytes or staging a snapshot that differs from tested source; a successful compiler-stop call alone is not native terminal proof; source and production require their own bundle. Compare exact blobs and native results. Detached HEAD needs an explicit fast-forward push target and remote-head check.
- Rollback: reverse only the two selected source hunks and retire verified owned scratch; preserve failure artifacts. Before commit, withdrawing the selected index entries must restore the original empty index. After an authorized commit, preserve its history and all unrelated working bytes.
- Acceptance: exact two-file HEAD projection passes ordinary precommit; all six original `reference-settings.spec.ts` cases pass in source and production; fresh stock build belongs to that projection; both modes have complete structured reports, CLI0, native family/tree/state/port retirement and exact source inverses/protected-state checks. No skipped or weakened assertions, extra timeout or synthetic test body.
- Negative checks: original native ownership/late-spawn/query/active-child/seal/persist/refused-writer controls from mandatory precommit; duplicate patch refusal and exact inverse; ordinary malformed settings controls in the unchanged six-case spec.
- Evidence: existing QA root C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2. Reuse the existing headless producer after its current14-case run ends. One compact two-file admission/patch and final receipt. No second concurrent producer.
- Commit: stage only exact qualified source blobs plus this narrow evidence record and current handoff. Review cached diff, run the mandatory gate on intended source, commit and push explicitly to the existing main target only after fresh remote fast-forward verification. Assert origin/main==HEAD and preserve unrelated raw working bytes/index semantics.

## BASELINE / RECONCILE

Selected canonical LF source identities:

| Path | Before SHA256 | After SHA256 |
| --- | --- | --- |
| scripts/e2e-runner-lifecycle.mjs | f17e070c42e15a9829771a6bc72659dd622868e690f30e442b1cf3cab15588fb | 533b3f6ab03d991c9cbfc45959389f3f4088048f2a97dca0ad9cbc94872521c4 |
| tests/e2e/global-setup.ts | 4600b1adc40aa79df1d1449c6a6d79a60029deca9ad43025a8cc01828b1c2d8c | 17f590042668fc2aeb16e7d2158e588b92d290b8147b505f285cbecf220ca80f |

The actual lifecycle file has CRLF, raw SHA b454c7c467a89f63983435aef609eb2a8f1952971758c5faa855e5a87453c8fc. Preserve its raw bytes. Frozen projection uses Git's canonical LF. Same physical root/Vite esbuild module0d124181 is a required preflight.

## Reconciled recovery and actual hook contract — SPECIFIED 2026-11-17

Original71072 is TERMINAL FAILED07cb17c2. Mandatory precommit passed172.031s and stock build11.203s; the carrier failed before E2E because it treated owned precommit evidence leaves as baseline source. All failed evidence stays immutable. No complete inverse/postsource proof was returned, so the same bounded qualification must run again.

Capture precommit output inventory against tracked baseline before the gate. After the gate is terminal and its Windows Job is empty, admit only exact known owned absent-baseline result leaves, retain their inventory/hash evidence, and remove only those leaves. Never overwrite or delete tracked `.last-run.json`. Apply the same output-owner checks after the actual hook.

Keep one qualified source/dependency projection after source+compiled success, while proving the original source inverse and reapplying the exact admitted patch. Use the already proven `forge-a03-clean-commit.ps1` pattern: real Git index and real linked-worktree Git directory, explicit owned work tree, ordinary `git commit` and unchanged shared pre-commit hook. Clear inherited private Git overrides; do not introduce an alternate index, stage unrelated reverts, change hooksPath, or skip hooks. Ensure both npm.cmd and extensionless npm/npx resolve the qualified24.22.1 Node runtime. Root reviews exact staged diff/tree and176-file raw-byte guard before commit. Record actual hook result and exact parent/tree/paths, then nonforce push to main only with current remote-head proof and verify remote/origin/main/HEAD identity. Preserve history on postcommit failure. Retire only this owned projection after all postcommit guards.

The executable unit stays two files. Supporting commit docs are this plan and current handoff, plus a scoped roadmap close only if warranted. Every broader product, full-suite, package and release status remains PARTIAL. No new feature unit follows this checkpoint in the degraded session.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE

VERIFIED exact independent projection: ordinary precommit171.657s (log142b4e30), own stock build10.157s (2817ac30), all6 original reference-settings cases source39.140s and compiled24.156s. Both modes returned CLI0, complete structured reports,0failed/flaky/bad, complete native family/tree/state retirement and free3100/3101 ports. Same physical root/Vite esbuild module was verified before the gates. Source inventory/inverse/reapply,176 actual raw working bytes, donor/private Dev, real index and refs all held. X4's identity was unchanged. No visible host or game experience is claimed.

Exact receipt: `forge-1117-a0bca560-checkpoint3-e2e.json`, SHA c4c1f8d869076aa2cb5fe034b4031e36c2930cf8348bc0e39941fe1ced1f9c36. Controller6dca27b4. Same owned root `forge-release-headless-781a677c9d` is retained only to run the actual unchanged Git hook from the selected projection, after root reviews the four-file staged diff (two executable files, this plan and current handoff). The three generated policy reports were captured and individually retired; tracked45B .last-run.json was preserved. Earlier failed receipts07cb17c2 and2959ffd8 remain retained.

Review: no product/dependency/version/capability/permission/timeout changes, no weakening of original ownership refusal, and no capability-map delta. Native negative paths remain mandatory precommit controls. Whole #112 product/release qualification, full-suite coverage and #119 remain separate PARTIAL work. No checkpoint commit, push, package or publication is claimed at this precommit review point.

Commit point: `fix(e2e): retire the owned compiler before native exit checks`.

## AAR

NON_CLEAN: inherited reproduced compiler-service leak, generated-report carrier failure, sandbox CIM refusal, and corrected MSYS path assumption. Sustain unchanged native terminal authority, exact source selection and baseline-preserving cleanup. Improve work: qualify a coherent internal unit separately from the pending product release. Improve tools: the existing controller now accounts for its original precommit evidence leaves and verifies extensionless hook npm against qualified Node24.22.1. Highest evidenced weakness: a green inner gate is insufficient if its carrier rejects generated evidence before postsource guards; the corrected exact replay completed those guards. Project lesson is recorded here; no memory/skill write. Actual hook and push evidence must be added after those operations, without changing or deleting failure artifacts.
