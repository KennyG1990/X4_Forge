# Reconcile the next Forge release candidate

FULL lane, SPECIFIED under GitHub #20's bounded release projection. Starting Dev ddc011208e2083b41b051991d154c4af4f0fc22f and public main 01d508dd916ac7370dadc0a9f39610135c3cd1e6 share base 42283e7ca795f93e63003bffaaaebaabf6d37085. Both the Git remote and Open VSX were refreshed. Public latest is 0.0.82. Dev has 248 changed paths from the base, main 52, with 28 overlapping differing paths and six main-only paths. The legacy read-only merge preview reports 86 conflict markers.

One managed candidate at C:/Users/Moshi/.codex/worktrees/forge-release-reconcile/X4_Forge starts at Dev HEAD. The tested Dev checkout and its running private IDE remain the baseline. The tracked candidate source is 1,025 files and 61,441,436 Git bytes. Reuse exact existing dependencies through recorded links, with generated products and test configuration in private candidate/scratch locations. This avoids another dependency-tree copy. Rollback is archiving the managed candidate after preserving its evidence.

Merge the five public commits into the candidate, retaining both histories. Reconcile conflicting code by behavior and regression coverage. Preserve published release/Discord records, the latest manifest version and all verified Dev fixes. Keep new versioning and publication for the qualified-release step. The installed/live Forge, game, AiLive and other agent checkouts remain outside this operation's write scope. Claude is paused and the current test authorization is serial, headless and lightweight.

Authoritative references are the existing release runbook, current code and tests, public main's release proof, ADR-F4/F5, capability map, and repository task records. Existing md/literal expression and diff-only prerequisites require reconciliation before packaging. Agent-Brain supplied an older general bug-review conversation, which supplies no current candidate-resolution result.

Acceptance requires public main ancestry, all six main-only files reconciled, no conflict markers or unmerged paths, a path-by-path resolution record, exact retained Dev regression outcomes, and a clean normal precommit/typecheck. Run focused deployment snapshot, recovery, warning-review, writer and graph checks for changed owners. Reuse full native 313 and exact 992-file artifacts on the integrated source with an explicitly addressed candidate launcher. Negative checks retain stale/source-change refusal and exact receipt replay. The original Dev revision/discovery identity must stay exact. New public APIs, credentials and game writes are outside this source integration.

Release qualification after source integration still needs routes, isolated E2E, runtime oracles, production build, exact VSIX, isolated installation and required CI per PUBLISHING.md and current machine-state gates. This source reconciliation alone cannot authorize publication. Review counter 18 is due, with 17 substantive units closed. Evidence goes in QA/forge-1110-release-reconciliation.json and this plan, followed by issue/field-log/handoff updates.

No capability-map delta is claimed before behavioral reconciliation. AAR is already non-clean because the web reader could not open the API endpoints. Host read-only API/Git requests refreshed both sources successfully. The managed candidate is the only new checkout for this integration and will be archived when it is no longer needed.

## Reconciled dependency and validation prerequisites

The first deployment snapshot check passed 71 assertions. Warning-review passed its 25 metadata guards, then stopped at the real source/built smoke input because the candidate has no production bundle yet. That complete check remains pending the headless build window.

The candidate's top-level dependency junction also reproduced a real source fingerprint refusal. Validator parser packages must stay physically inside their owner. Keep that product guard. Replace the root junction with a physical directory holding only the exact validator closure and tsx loader, and link the remaining existing tools individually. The measured ten-package closure is 184 regular files, 14,550,341 bytes, with inventory SHA-256 0705cde161b9b5a4588d80bf3e38452f3b5cdd3104f378de6159d9b1c68456fa. Source dependency bytes will be checked before and after, and every copy must match. The extension's build-tool link can remain shared. This is a required correction to the original dependency-reuse plan.

The public metadata merge is exact for all six main-only paths. Candidate source content is otherwise identical to tested Dev, apart from the version metadata. Automatic merging duplicated 99 lines in expressionAst. Review removed that insertion and required equality with the tested Dev blob. The restricted shell could not resolve linked Git worktree state, while the host-native check succeeded. Use host-native commands for this candidate.

A current machine-state question is pending for build, single-worker E2E and release qualification. Source-only checks and bounded dependency preparation can continue.


## Path-by-path reconciliation

| Path | Resolution |
| --- | --- |
| AGENT-USING-THE-FORGE.md | Retain Dev's current coordination, target identity, recovery and log guidance. |
| BACKLOG.md | Retain all open Dev work and add the pending release checkpoint. |
| ROADMAP.md | Preserve both Dev history and the 39 incoming public-release lines. |
| SESSION-HANDOFF.md | Replace with the current candidate state and retain the published close through its exact proof file. |
| config/durable-writers.json | Keep Dev's audited two-append inventory and fingerprint. |
| scripts/deployment-snapshot.selftest.ts | Keep the current status, build identity and staged/postcheck recovery contracts. |
| scripts/durable-writer-audit.mjs | Automatic result equals tested Dev. |
| scripts/route-integration.mjs | Keep Dev's foreign-target identity regression. |
| scripts/warning-review-reuse.selftest.ts | Automatic result equals tested Dev. Its compiled smoke gate remains pending. |
| server.ts | Keep current source coordination, project-check authority, physical target binding, native receipts and timings. Exact Dev Git blob. |
| src/lib/artifactPipeline.ts | Automatic result equals tested Dev, including selected frozen staging. |
| src/lib/cueLineage.ts | Keep current trigger analysis, reference signatures and depth guards. |
| src/lib/destructiveRecovery.ts | Keep current staged and postcheck evidence and write admission. |
| src/lib/expressionAst.ts | Remove the automatically duplicated 99-line earlier implementation. Exact Dev Git blob required. |
| src/lib/mdPitfallLints.ts | Keep shared direct/effective expression and return-context rules. |
| src/lib/modCompiler.ts | Automatic result equals tested Dev, including artifact-backed readiness. |
| src/lib/modDoctor.ts | Keep current artifact readiness and positioned duplicate handling. |
| src/lib/projectCrossFileValidation.ts | Keep current effective library/signature and Lua contracts. |
| src/lib/validationEvidence.ts | Automatic result equals tested Dev. |
| src/server/deploymentTrust.ts | Keep current operation status, target/build identity and suite receipts. |
| src/server/projectApiContract.ts | Automatic result equals tested Dev. |
| src/server/projectValidation.ts | Keep current exact caches, Lua scope/order and effective MD validation. |
| src/server/referenceRoutes.ts | Automatic result equals tested Dev. |
| src/types.ts | Keep tested trigger and indexed graph traversal behavior. |
| tests/e2e/deployment-trust.spec.ts | Automatic result equals tested Dev. Real E2E is pending. |
| tests/e2e/warning-review-reuse.spec.ts | Automatic result equals tested Dev. Real E2E is pending. |
| vscode-extension/package.json | Preserve public version 0.0.82 and Dev's Start Local Backend command. |
| vscode-extension/src/extension.ts | Automatic result equals tested Dev. |
| .github/workflows/discord-sync.yml | Exact public-main blob, including skip-discord handling. |
| docs/releases/0.0.80-delivery.json | Exact public-main historical delivery record. |
| docs/releases/0.0.82-proof.json | Exact public-main qualification and delivery proof. |
| vscode-extension/CHANGELOG.md | Exact public-main release history. |
| vscode-extension/package-lock.json | Exact public-main lock/version metadata. |
| vscode-extension/release-notes.json | Exact public-main release notes. |

## Source replay and current close

### Code-graph bootstrap checkpoint — VERIFIED

Light lane: rebuild the ignored candidate code graph using the installed `graphify update .` code-only path, one worker and deterministic clustering, then verify that an ordinary documentation commit preserves it. This changes local generated navigation artifacts and this task's records; it changes no product behavior, global hook, dependency, live service or release version. Existing source and the published release ledger remain authoritative. Heavy release qualification stays held by the user's live-work/lightweight-only answer.

Baseline is clean candidate b83b61734e9f972b903d36bdd6f600d46884cb23. Its graph is 184 bytes with zero nodes/edges (SHA-256 e1a40576866a6744f3b3c4e370e6eeae4a4151a461566fdd307e273896ad3fc0). The original Dev graph has 12,189 nodes/30,787 edges and SHA-256 e5726aa051341605a2143da101b82e77abebc45e1871b2c112cf50b4188c118d. The candidate's postcommit log reports a zero-node rebuild after the metadata merge. Installed tool inspection distinguishes the hook's explicit incremental change list from the CLI's full code-corpus update. A bootstrap omission is the leading explanation; an independent full update and subsequent normal hook are the checks, not an assumed diagnosis.

Acceptance: a nonempty graph reflecting current candidate code, valid local source references and representative validation/deploy symbols; no dependency-tree traversal; no original Dev graph/source/discovery changes; no tracked product diff; a normal precommit pass and documentation commit whose asynchronous postcommit hook preserves graph topology. Run code extraction serially with GRAPHIFY_MAX_WORKERS=1, PYTHONHASHSEED=0 and no LLM/semantic extraction or network calls. The negative control is the held release state and unchanged original Dev identities. Record command/results, graph counts/hashes, hook completion and bounded artifact footprint in QA/forge-1110-release-reconciliation.json. Rollback for record changes is the pre-task Git revision; ignored graph outputs are reproducible from source and need no backup tree. No product capability-map delta is expected. Close status remains SPECIFIED until those checks run; release status remains PARTIAL/NOT_READY independently.

The corrected dependency layout has 263 linked tool directories and 185 physical files totaling 14,725,021 bytes, including the installed package metadata. Copied bytes match the original Dev tree. The extension tools remain one explicit link. Validator ownership now passes normally, with no product or replay guard bypass. The original Dev HEAD, source bytes and discovery identity remain exact.

The pinned native driver ran with only its APP/seed locations explicitly addressed to this candidate. All 313 checks passed. Independent verification rehashed all 91 stored/decompressed captures, checked the actual candidate launch path and compared full Lua/effect/refusal results with the preceding Dev run. All observed workers and the runtime retired.

The same 992-file native fixture passed all 18 checks. Preview took 34.73 s and bound apply 52.86 s. All 993 output hashes, seven source barriers and reopened receipt matched. Incomplete coverage and no-last-green behavior stayed explicit. This is a synthetic measurement and does not establish actual AiLive latency or a consistent time bound.

Status is PARTIAL. The user confirmed live work is active and kept the window lightweight. The production build, complete warning-review compiled smoke, routes/E2E/oracles, exact package, install and CI qualification remain pending. The original warning-review command failed at the missing built input after passing 25 metadata controls. Its gate is preserved. Current source/native outcomes and the normal precommit gate support a local integration checkpoint, with release readiness NOT_READY. No capability-map delta because product source is identical to the tested Dev blobs. Review 18 is performed, with 17 substantive units fully closed and this reconciliation still in progress.

The full local graph update completed successfully with one worker: 12,189 nodes, 30,680 edges and 363 communities. Structural verification passed for all 544 referenced source files, edge endpoints, source line locations and representative deploy/validation symbols. Those source files match Dev after line-ending normalization; Dev's graph, server and discovery hashes remain unchanged. `graphify explain 'runProjectValidation()'` returned the current L262 definition and 62 connections. The generated footprint was 17 files/15,338,121 bytes; HTML visualization was skipped at the tool's 5,000-node limit. No product source changed and no capability-map delta applies. Topology SHA-256 before the documentation commit is a29e82c029235c70a967655f61c483920fe39d786242bb44960c98a9084a2dc1. Final normal precommit and postcommit preservation are the remaining checkpoint checks.

Graph-check AAR is triggered: the first verification wrongly required exact node IDs from the older incremental graph; four IDs and 107 net edges differ after full extraction, so that graph is comparison evidence rather than an accuracy oracle. A follow-up source comparison initially treated one synthetic node's empty source field as a file path. The corrected check passed using actual nonempty source paths and current line locations. A guarded stale-HTML cleanup attempt then found no HTML file and wrote nothing; the tool had already removed it. A record patch also needed an exact whole-line context correction. Sustain serial code-only extraction and identity checks. Improve verification by distinguishing graph identity from structural validity and checking file existence before cleanup. This is a navigation artifact, not proof of every inferred call relationship. The highest evidenced weakness is that incremental hooks can leave a new worktree with an empty graph; bootstrap explicitly once and verify later hook preservation. The clustered assumptions triggered an operator degradation checkpoint: commit this bounded result and leave the next unit for a fresh session.

## AAR update

Graph checkpoint close: VERIFIED. The normal `npm run precommit:check` and commit hook passed, including typecheck and all mandatory audits. Documentation checkpoint e8a88d7fb395ff1d64f954117c9b7f34993ed38a triggered the unchanged normal postcommit hook, which reported `No code-graph topology changes detected; outputs left untouched.` Independent revalidation confirmed the exact graph SHA-256 c3b1275807dfd8e77b8597035c3b5008baf419422b2961cab52276bf615f8710 and topology digest above, with all source/negative checks still passing. The graph's built_at_commit correctly remains b83b617 because this was a no-op. Only this plan and SESSION-HANDOFF.md changed. The finite QA release packet holds the receipt. No generated graph copy was committed and no product capability-map delta applies. Release reconciliation remains PARTIAL/NOT_READY; this environment repair is not another substantive product unit. Commit point: docs(dev): record verified candidate graph bootstrap.

The initial dependency plan needed correction because a root junction crosses the validator's owner boundary. Copy only its exact parser closure and loader, while linking other tools. The first read-only dependency audit unexpectedly followed Windows junctions despite os.walk(followlinks=False). Its exact process and parent command were identified and the owned scan was stopped. The corrected audit prunes reparse directories from dirs before descent and checked only the 185 physical files. Preserve every execution handle when an exec call yields. Both failures and the correction are tooling evidence, with no source or game mutation from the scan.

The operator degradation checkpoint applies after the coherent local merge checkpoint. Source reconciliation, the duplicate-code review and corrected dependency audit should be sustained. Repeated broad tool assumptions should improve. The highest-risk observed weakness is following a junction during recursive inventory or cleanup. Before archiving this candidate, verify and remove its owned tool links with nonrecursive literal-path operations, then use the managed archive operation. Keep this single candidate for the pending release gates.

The first cached-diff gate caught a trailing blank line before commit creation. Trimmed the task records and reran the unchanged scoped commit gate.

## Release readiness review21 — 2026-11-11

NOT_READY after source close21. Candidate0.0.82 has no dist/server.cjs or exact new VSIX. Public0.0.82 is its older sealed source; current diagnostics/redaction/watchdog/BOM deltas are unqualified as a release. Re-read PUBLISHING: current native replay/build/compiled warning-review/routes/serial E2E/oracles/exact package/private install/host checks/CI remain required. Latest live/lightweight answer holds heavy gates; no bump/install/publish/push. Focused source checks/precommit are not release proof. Next review24; reuse one candidate/profile. Plan docs/plans/2026-11-11-lua-bom-analysis.md; finite QA forge-1111-lua-bom-analysis.json.

## Release readiness review24 — 2026-11-11

NOT_READY; next review27. This is a read-only readiness audit under the current live-work/lightweight-only instruction, not a heavy gate run. Actual candidate manifest0.0.82, production dist/server.cjs absent, candidate vscode-extension/*.vsix count0. Current head98224c3 plus the explicit coverage unit has focused source/backend proof, but old313/native/package evidence does not qualify it. Full current native replay, production build, route integration, isolated single-worker E2E, runtime oracle sweep, exact stage/build/package/probe, private installation/installed checks and required CI remain pending. Real owner/device/rendered recovery and consumer/game proof stay separate. Normal precommit/typecheck is green for source; final internal commit uses the normal hook. No version bump, new artifact copy, push, Open VSX/GitHub release, Discord announcement or live mutation. Exact resulting commit and final meter live in QA forge-1111-project-check-explicit-coverage.json.

## Release readiness review30 — 2026-11-11

NOT_READY; next33. Current candidate baseline dd7f082 plus verified backend unit30 keeps manifest0.0.82; dist/server.cjs absent, candidate VSIX count0. Read current PUBLISHING artifact chain and gates. Source execution22/suite28/receipt137/policy18/finding-review/lint/normal precommit are green; historical313/native/public0.0.82 evidence is not qualification of this current source. Current full native HTTP/router/auth replay, production build/compiled warning-review, routes, isolated single-worker E2E, runtime-discovered oracle sweep, exact stage/build/package/probe, private install/installed checks and required CI remain pending under live-work/lightweight-only. Actual owner/device/rendered recovery and X4 compiler flags/consumer/game proof remain separate. Use only the isolated harness, never historical production port/workspace defaults. No version bump, packaging/install/push/publish or Discord action; no new quiet-window inference/request. Exact resulting internal commit, current graph and retention are in QA forge-1111-project-check-success-excerpts.json. This read-only audit does not grant release credit.
