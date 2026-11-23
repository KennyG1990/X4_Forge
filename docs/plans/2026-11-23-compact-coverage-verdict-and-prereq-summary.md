# `#48` CLI Candidate-Selftest Compact Verdict, Prerequisite Failure Summary & Policy-Bundle Oracle Sync (`#48`, `#74`)

**Status:** `VERIFIED` (`#48` CLI compact verdict, prerequisite diagnostics, & policy-bundle count oracle sync)
**Owner:** GitHub `#48` (parent `#74`)
**Lane:** `FULL`
**Date:** 2026-11-23

## 1. Plan And Acceptance Contract

- **Bounded unit of work:** Fix the remaining `#48` CLI compact-verdict and prerequisite-diagnostics follow-up in `scripts/action-receipt-coverage-audit.ts` alongside its directly coupled pre-existing stale surface-count assertion (`67 -> 69` left behind by commit `a03fb13`) in `src/lib/actionReceiptPolicyBundle.selftest.ts`.
- **Assumptions & unresolved facts:**
  - `POST /api/agent/project/validate` compact verdict and `#97` `detail: 'compact'` deploy response are already implemented; this unit closes the separate CLI/audit bug documented in `#48` comment 3 (`scripts/action-receipt-coverage-audit.ts --candidate-selftest` & `runPrerequisiteAudit`).
  - `runActionReceiptPolicyBundleSelftest()` currently fails `17/19` (`bundled_policy_positive_counts`, `later_load_is_not_poisoned`) solely because `a03fb13` added 2 reviewed surfaces (`67 -> 69`) to `config/action-receipt-coverage.json` and bumped `ACTION_RECEIPT_COVERAGE_REVIEWED_MANIFEST_SHA256` without updating the 3 hardcoded `67` checks in `src/lib/actionReceiptPolicyBundle.selftest.ts`.
- **Authoritative references:**
  - [Issue #48 comment 3](https://github.com/KennyG1990/X4_Forge/issues/48)
  - `scripts/capability-contract-audit.ts` (`hasPrecommitCapabilityGate`, lines `660-807`) — strict AST invariants on `runPrerequisiteAudit`, `runActionReceiptCoveragePrerequisiteAudits`, `--audit`, and `main`.
  - `scripts/precommit-check.mjs` (`runPrecommitOrchestrationSelftest`, lines `286-312`) — exact precommit subprocess contract.
  - `docs/plans/2026-08-10-b119-x4-ui-editor-linter-first.md` (lines `8388-8435`) — why `--write-candidate` / `--promote-candidate` / `--audit` run `runActionReceiptCoverageCandidateSelftests` without coupling the pre-promotion bundled policy hash inside candidate selftests.
- **In scope:**
  1. Update `compactCandidateSelftest(result, policyBundle)` in `scripts/action-receipt-coverage-audit.ts` so `--candidate-selftest` computes top-level `pass`, `passed`, `total`, and `failures` across **all 4 required child families** (`path`, `envelope`, `semantic`, `policyBundle`), retaining per-family counts, failures, and exit code `1` whenever any required child fails (even if `failures` array is unexpectedly empty or `passed !== total`).
  2. Keep `runActionReceiptCoverageCandidateSelftests(suppliedBuildResult)` decoupled from `runActionReceiptPolicyBundleSelftest()` so candidate-generation (`--write-candidate`) and promotion flows before bundle pin updates are preserved.
  3. Add deterministic pure helpers `summarizePrerequisiteFailureOutput` and `formatPrerequisiteFailureDetail` in `scripts/action-receipt-coverage-audit.ts`, wired into `runPrerequisiteAudit` (preserving every AST shape checked by `hasPrecommitCapabilityGate` in `scripts/capability-contract-audit.ts`) so non-zero / timed-out prerequisite child runs (`durable-writer-audit`, `capability-contract-audit`) include a bounded code/path summary (`maxItems = 3`, `maxChars = 280`, hash-abbreviated, repo-root stripped, JSON dumps suppressed) instead of bare `durable-writer-audit:exit=1`.
  4. Update `src/lib/actionReceiptPolicyBundle.selftest.ts` lines `95`, `97`, and `185` from `67` -> `69` to match the reviewed `config/action-receipt-coverage.json` (`aa4c18ab...`, `98` routes / `69` surfaces from `a03fb13`) — applied **after** capturing the live negative `--candidate-selftest` CLI proof against the failing `17/19` bundle.
  5. Add permanent positive & negative checks inside `runActionReceiptCoverageCandidateInvariantSelftest` proving:
     - failing `policyBundle` (or any candidate family, or mismatched `passed !== total` / `pass: false` with empty `failures`) cannot produce overall `pass: true`;
     - `formatPrerequisiteFailureDetail` / `summarizePrerequisiteFailureOutput` formats concise bounded code/path summaries on realistic `durable-writer-audit` / `capability-contract-audit` failures, caps large multi-line outputs, and keeps bare `${label}:${status}` on empty output.
- **Out of scope:**
  - Changing `scripts/precommit-check.mjs` or `scripts/capability-contract-audit.ts` AST contracts (`precommit` command list or `--audit` body shape).
  - Modifying `config/action-receipt-coverage.json`, `config/durable-writers.json`, or `src/lib/actionReceiptPolicyBundle.ts`.
  - Relaxing any audit or hiding any failure count.
- **Risks & rollback:**
  - Risk: altering `runPrerequisiteAudit` AST statements or `execFile` callback arity (`1` parameter) would break `hasPrecommitCapabilityGate` in `scripts/capability-contract-audit.ts`. Mitigation: keep exact 1-param `(error)` callback and exact top-level statements, passing `execError` into helper expression inside `reject(stableError(...))`.
  - Rollback: `git checkout -- scripts/action-receipt-coverage-audit.ts src/lib/actionReceiptPolicyBundle.selftest.ts`.
- **Acceptance criteria & required validations:**
  1. Negative live CLI proof BEFORE `67 -> 69` sync: `npm run test:action-receipt-coverage:selftest` exits `1` AND `--candidate-selftest` JSON emits top-level `"pass":false`, `"passed":75`, `"total":77`, prefixed `"failures":["policyBundle:bundled_policy_positive_counts","policyBundle:later_load_is_not_poisoned"]`, and per-family counts (`9`, `5`, `44`, `17/19`).
  2. Negative real-subprocess proof for `runPrerequisiteAudit`: temporary script exiting `1` with realistic stderr rejected with `ACTION_RECEIPT_COVERAGE_PREREQUISITE_NONZERO` containing bounded error summary without full manifest dump.
  3. After `67 -> 69` oracle sync:
     - `npx tsx src/lib/actionReceiptPolicyBundle.selftest.ts` -> `19/19` `allPassed: true`, exit `0`.
     - `npm run test:action-receipt-coverage:selftest` -> `--candidate-selftest` (`pass: true`, `81/81` incl. new checks or exact observed count) + `--promotion-selftest` (`23/23`), exit `0`.
     - `npm run test:action-receipt-coverage` -> `PASS` (`98` routes, `69` surfaces).
     - `npm run test:capabilities` -> `PASS` (`hasPrecommitCapabilityGate` intact).
     - `npm run typecheck` -> exit `0`.
     - `npm run precommit:check` -> `[precommit] OK`.
- **Evidence locations:** `docs/plans/2026-11-23-compact-coverage-verdict-and-prereq-summary.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`.

## 2. Baseline

- **Revision:** `b334c400a330cfa13f9ed8ae54ce56a59a91b500` (`main`), clean working tree.
- **Baseline observed outputs:**
  - `npm run test:action-receipt-coverage:selftest`: `--candidate-selftest` exited `1` while emitting misleading top-level `{"pass":true,"passed":58,"total":58,"failures":[],...,"policyBundle":{"pass":false,"passed":17,"total":19,"failures":["bundled_policy_positive_counts","later_load_is_not_poisoned"]}}`.
  - `npx tsx src/lib/actionReceiptPolicyBundle.selftest.ts`: `17/19` failed on `bundled_policy_positive_counts` (`routes=98 surfaces=69` vs expected `67`) and `later_load_is_not_poisoned`.
  - `npm run test:action-receipt-coverage`: `{"status":"PASS","path":"config/action-receipt-coverage.json","manifestSha256":"aa4c18ab9a83b27ff088fa1fa6018e4334e20aa3edb81796a3234fc6d653eac7","routeCount":98,"surfaceCount":69}`.

## 3. Reconcile

- **Resources & callers searched:** `compactCandidateSelftest`, `runActionReceiptCoverageCandidateSelftests`, `runActionReceiptCoveragePrerequisiteAudits`, `requireCoverageSelftests`, `--candidate-selftest`, `ACTION_RECEIPT_COVERAGE_PREREQUISITE`, `actionReceiptPolicyBundle.selftest.ts` across `scripts/*`, `src/**`, `vscode-extension/src/*`, `package.json`.
- **Couplings verified:**
  - `scripts/capability-contract-audit.ts:665-807` strictly checks the AST of `runActionReceiptCoveragePrerequisiteAudits`, `runPrerequisiteAudit` (exact 1-param callback `(error)`, exact top-level statements inside `callback.body`), `main()` prefix `if`s, `--audit` 7-statement body, and module entrypoint.
  - `scripts/precommit-check.mjs:291-312` asserts the exact list of precommit commands.
  - `config/action-receipt-coverage.json` + `src/lib/actionReceiptPolicyBundle.ts` (`aa4c18ab...`) were updated to `69` surfaces in `a03fb13` while `src/lib/actionReceiptPolicyBundle.selftest.ts` was omitted because `precommit:check` runs `--audit` rather than `--candidate-selftest`.
- **Capability-map delta:** `no capability-map delta` (internal CLI audit reporting & selftest oracle sync).
- **Plan refinements:** Split validation into pre-sync (live negative `--candidate-selftest` failing on real `17/19` bundle) and post-sync (all green) steps; discovered via real Node `v24.15.0` subprocess probe that callback-mode `execFile` leaves `error.stderr === undefined` and appends stderr onto `error.message` after `"Command failed: ..."`, so `extractMessageStderrLines` extracts stderr cleanly while preserving the single-parameter `error => ...` AST invariant checked by `capability-contract-audit.ts`.

## 4. Implement

- **`scripts/action-receipt-coverage-audit.ts`:**
  - Exported `compactCandidateSelftest(result, policyBundle)` returning `CompactCandidateSelftestReport`, aggregating `pass`, `passed`, `total`, and prefixed `failures` across all 4 required child families (`path`, `envelope`, `semantic`, `policyBundle`), synthesizing explicit `:failed` entries if a child reports `pass: false` (or `allPassed: false` or `passed < total`) with an empty `failures` list, and wired `--candidate-selftest` to write that unified report and set `process.exitCode = 1` when `!report.pass`. Kept `runActionReceiptCoverageCandidateSelftests` decoupled for `--write-candidate` / `--promote-candidate` / `--audit`.
  - Added `summarizePrerequisiteFailureOutput` and `formatPrerequisiteFailureDetail` (with `ANSI_ESCAPE_PATTERN`, relative-path stripping, long-hex abbreviation, redundant header-banner suppression, single-line JSON dump filtering, `maxItems = 3`, `maxChars = 280`, `+N more` suffix, and Node `execFile` `error.message` stderr extraction) and wired them into `runPrerequisiteAudit` timeout and non-zero rejections while preserving exact `hasPrecommitCapabilityGate` AST compliance.
  - Added permanent checks `compact_selftest_verdict_requires_every_child_family` and `prerequisite_failure_summary_is_bounded_and_preserves_codes_and_paths` inside `runActionReceiptCoverageCandidateInvariantSelftest`.
- **`src/lib/actionReceiptPolicyBundle.selftest.ts`:**
  - Synced the three hardcoded `surfaceCount` assertions in `bundled_policy_positive_counts` (`lines 95, 97`) and `later_load_is_not_poisoned` (`line 185`) from `67 -> 69` to match `a03fb13`'s reviewed `config/action-receipt-coverage.json` (`aa4c18ab...`, `98` routes / `69` surfaces).

## 5. Validate

1. **Live negative CLI proof (before `67 -> 69` sync, `task-2300`):** `npx tsx scripts/action-receipt-coverage-audit.ts --candidate-selftest` exited `1` (`CANDIDATE_EXIT=1`) with `"pass":false,"passed":77,"total":79,"failures":["policyBundle:bundled_policy_positive_counts","policyBundle:later_load_is_not_poisoned"]` alongside `path` (`9/9`), `envelope` (`5/5`), `semantic` (`46/46`), `policyBundle` (`17/19`).
2. **Real `execFile` subprocess negative probe (`task-2333`, post-final edit):** `node --import tsx --input-type=module -e ...` running real `execFile(process.execPath, ['-e', ...])` exiting `1` printed `PREREQ_NEG_DETAIL=durable-writer-audit:exit=1 (writer source fingerprint changed; declared=aaaaaaaaaaaa... actual=bbbbbbbbbbbb...; server.ts: raw call counts changed; declared={"writeFileSync":1} actual={"writeFileSync":2})` and exited `0`.
3. **Standalone policy-bundle selftest (`task-2333`):** `npx tsx src/lib/actionReceiptPolicyBundle.selftest.ts` -> `allPassed: true`, `19/19` checks (`routes=98 surfaces=69`, hash `aa4c18ab...`).
4. **Action-receipt coverage selftests (`task-2333`):** `npm run test:action-receipt-coverage:selftest` -> `--candidate-selftest` (`pass: true, 79/79` = `9 + 5 + 46 + 19`) and `--promotion-selftest` (`pass: true, 23/23`), exit `0`.
5. **ESLint on changed files (`task-2333`):** `npx eslint scripts/action-receipt-coverage-audit.ts src/lib/actionReceiptPolicyBundle.selftest.ts` -> exit `0`, zero warnings/errors.
6. **Full `npm run precommit:check` (`task-2333`):** `[precommit] OK` (incl. `precommit --selftest` `29/29`, `e2e-runtime-bootstrap` `108/108`, `e2e-verdict`, `durable-writer-audit --selftest` & `durableWrite.ts`, `test:mcp-capabilities`, `test:configuration-grant`, `test:configuration-operations`, `test:native-performance` `76/76`, `test:action-receipt-coverage` (`--audit` incl. `runActionReceiptCoveragePrerequisiteAudits()` calling `capability-contract-audit.ts` + `durable-writer-audit.mjs` & `PASS` on `98` routes / `69` surfaces), `typecheck` exit `0`, large-file guards).

## 6. Review

- `compactCandidateSelftest` overall verdict incorporates all 4 required child families and fails closed on any failing family or mismatched count: **Done and evidenced**.
- Candidate-generation / `--audit` separation preserved (`hasPrecommitCapabilityGate` green): **Done and evidenced**.
- Prerequisite failures surface bounded code/path/fingerprint summary without raw manifest dumps: **Done and evidenced** (via both unit checks & real Windows `execFile` subprocess probe).
- Stale `67 -> 69` oracle in `src/lib/actionReceiptPolicyBundle.selftest.ts` repaired so `test:action-receipt-coverage:selftest` genuinely passes: **Done and evidenced**.
- Note: `precommit:check`'s static `expectedCommands` contract still checks `--audit` rather than `--candidate-selftest` (left unchanged per plan scope). Fresh-eyes `git diff` review clean.

## 7. Close

- **Status:** `VERIFIED` (for this bounded CLI/selftest unit under `#48`; keep `#48` issue note honest regarding any separate `0.0.94` public/installed qualification).
- **Capability-map delta:** `no capability-map delta`.
- **Suggested commit title:** `fix(audit): fold policyBundle into compact selftest verdict and summarize prerequisite failures`

## 8. AAR

- **Triggered AAR (non-clean — 3 triggers fired):**
  1. Baseline discovered `src/lib/actionReceiptPolicyBundle.selftest.ts` was already failing `17/19` (`67` vs `69`) on clean `main` from commit `a03fb13` (`precommit:check` ran `--audit`, missing `--candidate-selftest`).
  2. Real Windows Node `v24.15.0` `execFile` subprocess negative probe disproved the assumption that callback-mode `execFile` populates `error.stderr` (`ERR_STDERR=undefined`), catching that stderr is instead appended onto `error.message` after `"Command failed: ..."`.
  3. ESLint rejected `/\u001b.../` (`no-control-regex`), resolved cleanly via `new RegExp(String.fromCharCode(27) + ...)`.
- **Points to sustain:**
  - Always run real-subprocess negative probes rather than relying only on synthetic `{ stderr: '...' }` mocks — it caught the Node `execFile` `error.stderr` vs `error.message` behavior before close.
  - Check AST contracts (`scripts/capability-contract-audit.ts`) before modifying scripts guarded by `hasPrecommitCapabilityGate`.
- **Points to improve — work/approach:** Run `npm run test:action-receipt-coverage:selftest` routinely alongside `--audit` after any `config/action-receipt-coverage.json` change.
- **Points to improve — tools:** When running inline Node/TSX checks from `pwsh` on Windows, invoke `node --import tsx --input-type=module -e ...` instead of multi-line `npx` args so `cmd.exe` does not truncate at newlines.
- **Highest-risk evidenced weakness:** `npm run precommit:check` runs `--audit` (`test:action-receipt-coverage`) without running `test:action-receipt-coverage:selftest`, allowing stale `actionReceiptPolicyBundle.selftest.ts` surface-count drifts (`a03fb13`) to land undetected until explicit selftest execution. Bounded fix: keep `--candidate-selftest` in release/PR checklists or later extend `precommit-check.mjs` + `capability-contract-audit.ts` AST contract cleanly.

