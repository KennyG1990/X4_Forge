# B119 local recovery checkpoint

Task: checkpoint accumulated UI-builder work at the user's explicit request.
Lane: FULL (Git state); inventory repair VERIFIED; Git checkpoint prepared for the normal hook.
Final commit/exclusion status is recorded in `test-results/b119-local-checkpoint-20260914/post-commit.json`;
absence of that receipt is not a verified Git close.

## Resumed acceptance contract

User approved "okay do it" after clarification that this is repository audit metadata,
not an operating-system/browser security setting. The earlier permission pause was
overcautious; correcting reviewed repository metadata was already within development
scope. No guard bypass or permission-policy relaxation follows from that correction.

- Add only `config/durable-writers.json` to the proposed checkpoint (138 selected paths).
- Change the existing editor browser-output count from 1 to 2, register the existing
  Lua export owner and its actual failure contract alongside PNG, and refresh the
  source fingerprint after confirming the current scan still matches the reproduced result.
- Do not change audit implementation, export implementation, tests, deadlines, or other
  inventory entries. Verify exactly that metadata delta and retain failing old-manifest evidence.
- Run the unchanged normal precommit; its count/fingerprint rejection selftests are the
  negative checks. Any further failed gate must be investigated, not bypassed.
- Before staging and after committing, verify exact path membership, excluded-path hashes,
  unchanged product bytes, and the commit parent. Preserve the known full-suite failures.
- Local-only commit remains the requested deliverable, not a public release. No push.

### Necessary coupled-metadata correction

The resumed normal precommit (session48697) passed bootstrap, verdict, Vite, product-copy,
durable-write and capability/MCP checks, then FAILED at action-receipt coverage. Its
validator reports exactly `$.surfaces[2].owner`: the reviewed coverage manifest still
has the PNG-only owner, while the corrected writer inventory names PNG and Lua.
The canonical candidate differs at that single owner field; all82 route entries,
57 surfaces, receipt requirements, effects, and integration batches are unchanged.

Extend this unit by the two required consumers: `config/action-receipt-coverage.json`
and its pinned SHA256 in `src/lib/actionReceiptPolicyBundle.ts` (140 checkpoint paths).
Apply only that exact generated owner-label delta and corresponding checksum, not
a receipt-policy relaxation. Validate exact candidate bytes, old-owner rejection,
bundle and candidate/promotion selftests. The last full gate will run normally via
the installed Git precommit hook: a failed hook must prevent commit creation.
No `--no-verify`, hook replacement, test skip, or audit code changes.

## Plan and acceptance

- Preserve the current B119 source, tests, and implementation records in one local recovery commit on the existing `main` branch. This is not a release or a fresh approval of every accumulated feature.
- Baseline: HEAD `93c9af111d63ca77c99dee11f21882c4073bcda6`; index empty; 229 changed paths (53 modified, 8 deleted, 168 untracked). The screenshot's 977 badge is broader than this repository's 229-path group.
- Reuse existing Git ownership, task records, and `scripts/precommit-check.mjs`. No implementation, test-oracle, timeout, or runtime changes in this unit.
- Include exact inventoried B119 source/test paths, B119 plans, BACKLOG/ROADMAP/KNOWN-BUGS/handoff, and the three identical operator-policy mirrors. Include the existing reference-query and output-isolation harness repairs required by these B119 tests.
- Exclude unrelated Discord deletions, W3B1 records, onboarding changes, release metadata, build packages/backups, screenshots, exported documents, agent logs, dependency scratch files, and tracked test-results state. Preserve their bytes and Git status.
- Risk: an accumulated checkpoint includes known incomplete behavior. Full integration is FAILED: 129 passed, 2 failed, 1 flaky of 132, with no skipped tests. A passing precommit does not supersede that result or packaged/native gates.
- Rollback/reference: retain parent HEAD and the exact pre-stage path/hash manifest locally. No reset, clean, discard, branch change, push, publication, or installation.
- Required validation: normal `npm run precommit:check` with no bypass; exact index membership and staged/worktree content checks; `git diff --cached --check`; post-commit parent/message/path checks and unchanged excluded paths. Negative check: exclusions must never enter the index. If the gate fails, do not bypass it or claim a commit exists.
- Evidence: `test-results/b119-local-checkpoint-20260914/`; final outcome and AAR below. No full E2E rerun is needed merely to preserve the known failing state. No new rendered/native verification claimed.

## Reconciliation and review boundary

- Live Git inventory, current handoff, full-integration and CPU-profile records, precommit script, small cross-layer diffs and new dependency paths inspected.
- Existing source-canonical authoring, workspace history, scenario, corpus and renderer owners are preserved together; no attempt to split interdependent accumulated source by arbitrary dates.
- No capability-map delta. Existing plan-by-plan evidence remains authoritative; this checkpoint is not a fresh line-by-line approval of approximately 40,000 accumulated changed lines.
- Code-review skill used for scope/dependency/exclusion review. `reviewctl` is not installed; project deterministic guards are used without claiming an automated reviewctl scan.
- Development is paused for this checkpoint. Resume the bounded quadratic array-membership repair only afterward; keep mutable corpus-byte authority checks intact.

## Close and AAR

### Resumed repair validation and checkpoint preparation

- Exactly three newly edited tracked files: writer inventory, copied coverage owner label,
  and its policy-bundle SHA256. No export, parser, renderer, test, or guard implementation edits.
- Writer contexts compared across all29 changed tracked source paths: the added Lua download
  and the existing isolated-cache directory resolver are the only changed writer contexts.
  Both were reviewed; the cache repair remains as previously tested. Diagnostic Git reads
  initially hit Node's 1MiB buffer; rerun with a bounded32MiB buffer completed successfully.
- Exact JSON counterfactual checks PASS: no other writer entries changed; copied coverage
  differs only at the editor owner; canonical generated coverage matches byte-for-byte.
- Old writer inventory rejected, undeclared third download rejected, changed fingerprint
  rejected, and old copied owner rejected. Receipt policy remains `receipt-required`, W3B2.
- Coverage audit in-process PASS,82routes/57surfaces; policy bundle18/18, candidate57/57,
  promotion23/23 controls PASS. This focused validation does not replace normal precommit.
- Updated coverage SHA256: `f7d1cc14beca8d589952096535a59a56331e3886d151fa4fc3dfe31936c1c57d`.
- The normal failed precommit session48697 is terminal; it was not restarted or bypassed.
  Git's installed precommit hook will perform the final full gate before making this commit.
- Exact checkpoint set is140 paths; all93 exclusions and pre-existing source bytes must
  remain unchanged. Final pre-stage and post-commit manifests are in the evidence directory.
- Commit preparation is not a product close: full integration remains129passed/2failed/1flaky;
  all nine authoring journeys, three-menu/broader parity, packaged and native obligations remain.
- No capability-map delta, public release, push, installation, external issue/wiki edits,
  or global-memory writes. The existing local deterministic post-commit graph hook is retained.
- AAR correction: treating ordinary reviewed repository metadata as a new user-permission
  gate was unnecessary. Reconcile its consumers in the same unit; preserve actual permissions
  and all failure checks. Do not mistake a copied owner-label checksum for a policy change.

### Historical first attempt (superseded by resumed validation above)

- Exact candidate inventory: `test-results/b119-local-checkpoint-20260914/inventory.json`, 137 selected paths and 93 excluded paths, including this new plan (230 total). Index empty and HEAD unchanged. Selection is proposed only; nothing staged or committed.
- `npm run precommit:check`, bundled Node on process-local PATH, session 10656: terminal exit 1. Bootstrap 59/59; verdict 55/55; Vite lifecycle PASS; product-copy PASS; durable-writer audit controls 15/15. Actual durable-writer inventory FAILED with two findings: source fingerprint mismatch and Source Editor browser-download count declared 1, actual 2. Downstream capability/action-receipt/typecheck/size stages were not reached by this precommit run.
- Declared fingerprint: `4793e64410149f3de5762188ba3f0d0168a6c2fc16a1225d2b254329600c5ef2`; observed: `3cd9debeb30b1f13b9bd5e3f71bd7d2df92845194cf5c315267b6ac2cc7be0a0`.
- [REPRODUCED] `config/durable-writers.json` records only the native-preview PNG owner. Current `X4UiSourceEditorLuaFiles.handleExport` also performs a user-initiated, byte-limited Lua Blob download with source/selection identity checks and URL/anchor cleanup. The original PNG path remains present. Both handlers inspected; inventory has not been edited or refreshed.
- Required next authority: approve the bounded safety-inventory reconciliation in `config/durable-writers.json`, then rerun the normal unchanged precommit guard. No bypass, forced commit, broad staging, release, or push authorized by this failure.
- Suggested eventual title: `chore(b119): checkpoint canvas-first builder with known integration failures`.
- Final status: BLOCKED for the requested commit, not for the overall goal. The builder remains PARTIAL and full integration remains FAILED (129 passed / 2 failed / 1 flaky).
- No executable changes, configuration changes, Git mutations, external writes, or runtime-user-data changes were made by this checkpoint unit. Only this plan, handoff, and local inventory were written. Final staged/exclusion checks remain pending because there was no commit.

### AAR

- Non-clean: precommit failed; bounded inspection commands also encountered unavailable reviewctl and unsupported PowerShell glob arguments. No failed guard was weakened.
- Sustain: independent repository count, exact path selection, preserved unrelated deletions/artifacts, honest recovery-checkpoint versus release distinction.
- Improve approach: approximately 40,000 accumulated changed lines exceeded sensible commit cadence; checkpoint at bounded verified units instead of accumulating more feature work.
- Improve tools: pass literal paths or rg -g filters on Windows; keep inventory output structured and bounded. Automated reviewctl scan unavailable, not claimed.
- Highest-risk observed weakness: a second browser download path reached the working tree without its durable-writer inventory being updated. The precommit guard caught it. Review and register its owner/failure contract before committing; retain all rejection checks.
- Lesson retained in this local plan/handoff; no global-memory or external-wiki writes.
