# Native Deploy Latency Unit 2: Bound-Apply Preview Validation Reuse & Coalesced Write Barriers (#97)

Status: SPECIFIED

## Task Record

Task: Eliminate redundant Bound-Apply re-validation (`validate`) and duplicate immediate `sourceRecheck` barriers (`7 -> 5`) inside `deployVerifyHandler` without weakening identity binding, acceptance evaluation, receipt checks, or write-boundary TOCTOU protection.
Lane: FULL

### PLAN
- Bounded unit:
  1. Reuse verified Preview (`dryRun === true`) static validation results (`emittedMalformed`, `runModDoctor` compile/readiness checks, `buildDeployProjectValidation`, `preflightContentHash`, `preflightDiagnostics`, `pfWarnings`, and `staticEvidence`) on matching Bound Apply (`dryRun !== true` with `expectedModId`, `expectedSourceHash`, `expectedArtifactHash`, `expectedBindingHash`, `expectedTargetFingerprint`) whenever all authoritative inputs remain identical.
  2. Coalesce two immediate redundant `assertCurrentSource()` calls inside `deployVerifyHandler` where zero slow source/target I/O occurs between adjacent checks (`16565` immediately after `16498` pre-record recheck; first `beforeActivate` entry of `.forge-builds/loose` staging mirror immediately after `16584` post-prepare recheck), reducing `sourceRechecks.count` from `7` to `5` while preserving full `assertCurrentSource()`, `assertCurrentTarget()`, and receipt checks before every write barrier (`prepare`/approval record, staging swap, incumbent target move-to-backup, and target swap promotion).
- Authoritative references:
  - [docs/plans/2026-11-10-deploy-preview-validation-reuse.md](2026-11-10-deploy-preview-validation-reuse.md)
  - [docs/plans/2026-11-10-deploy-source-observation-reuse.md](2026-11-10-deploy-source-observation-reuse.md)
  - `server.ts` (`deployVerifyHandler`, `buildDeployProjectValidation`, `bindDeploymentCorpus`, `validationDeltaFor`, `evaluateFindingAcceptances`)
- Assumptions:
  - Static validation (`emittedMalformed`, `runModDoctor`, `buildDeployProjectValidation`, `staticEvidence`) is deterministic given `(modId, artifactHash, snapshot.manifest.hash, deployFormat, wsDoctorModelHash, baseCorpus.hash, corpusHash, live references/jobs/wares Sets, targetRoot, canonicalReviewSource, selectedSource, previousBuildStateKey)` and no patch diagnostics (`xmlPatches` empty or checked fresh).
  - Live mutable state (`receiptHistory`, `validationBaselineStore`, `acceptances`, `nativeCheckProof`, `targetFingerprint`, `deploymentManifestConflict`, `previewDeploymentEffect`, `assertCurrentSource`, `assertCurrentTarget`) continues to evaluate fresh on every Bound Apply.
- In scope:
  - `server.ts`: bounded FIFO/LRU cache (max 4 entries) for verified Preview static validation state, helper checks for `wsDoctorModelHash` and vocabulary identity equivalence, Bound-Apply reuse guard in `deployVerifyHandler`, and `assertWriteAuthority(skipSourceRecheck)` barrier coalescing at `16565` + staging entry.
  - Tests in `scripts/route-integration.mjs` (or focused selftest wired cleanly into validation) covering Bound-Apply preview validation cache hit parity plus negative paths (stale binding hash, edited source/workspace model, changed corpus, intervening deploy receipt changing `previousBuild`, changed `acceptances`, target change).
- Out of scope:
  - Dual `compileWorkspaceToFolder` (`stagingRoot` + `extensionsPath`) materialization or `.snapshots` copy changes (deferred to `#97` Unit 3).
  - Changes to `runProjectValidation` internals (`src/server/projectValidation.ts`) or `replaceValidatedDeployment` `guards === 2` contract (`runCompileArtifactSelftest`).
  - Packaging / releasing VSIX (`FORGE DEVELOPMENT` IDE untouched).
- Risks and authorization boundaries:
  - Stale validation reuse risk: mitigated by checking 12 exact preconditions (`modId`, `artifactHash`, `snapshot.manifest.hash`, `deployFormat`, `wsDoctorModelHash`, `baseCorpus.hash`, `bindDeploymentCorpus(baseCorpus, canonicalMd) === corpusHash`, live reference/jobs/wares Set/Map pointers, `targetRoot`, `canonicalReviewSource`, `selectedSource`, and `previousBuildStateKey`) before accepting cached evidence, and running `runPatchDiagnostics` / `validationBaselineStore` / `evaluateFindingAcceptances` / `expectedIdentity` fresh.
  - Missing TOCTOU check risk: approval/receipt checks still run at every `assertWriteAuthority` call; `assertCurrentSource()` remains immediately before `prepare`/preview (`16498`), immediately before `admitDeploymentWrite`/staging (`16584`), immediately before staging swap, immediately before moving `extensions/<modId>` incumbent backup, and immediately before promoting `extensions/<modId>` `next`.
- Rollback/checkpoint: Local commit `14b5795` (`perf(deploy): reuse read buffers...`) in `G:\Forge-QA\forge-development`; reversible via `git checkout -- server.ts ...` before committing Unit 2.
- Acceptance criteria:
  - Bound Apply (`preview -> apply`) produces byte/field-equivalent response (`modId`, `sourceHash`, `artifactHash`, `bindingHash`, `validation`, `effect`, `doctor`, `deployRecord`, `checklist`) on valid preview hit and refuses every tampered/stale negative path with exact error codes (`409 DEPLOY_IDENTITY_MISMATCH`, `409 DEPLOY_TARGET_CHANGED`, `409 DEPLOY_SOURCE_CHANGED`).
  - `bench97.mjs` (`1,000`-file mod + X4 `9.00` corpus) measures `apply2` `stagesMs.validate` dropping from `~3,346 ms` to `< 350 ms`, `sourceRechecks.count` dropping from `7` to `5`, and overall `apply2` wall dropping further below Unit 1's `31,697.3 ms`.
- Validation methods & negative paths:
  - `npm run typecheck`
  - `npm run lint` (0 errors)
  - `npm run test:writers`
  - `npm run precommit:check`
  - `npm run test:routes` (plus new Bound-Apply reuse parity + invalidation tests in `scripts/route-integration.mjs` covering stale binding, modified workspace node, modified source disk file, changed corpus/provider, changed `acceptances`)
  - `npm run test:oracles` (`134/134`)
  - `bench97.mjs` A/B measurement (`G:\Forge-QA\temp\bench97-unit2-after.json` vs `bench97-unit1-after.json`).
- Evidence locations:
  - `G:\Forge-QA\temp\bench97-unit2-after.json`
  - Updated close + AAR in this file, `BACKLOG.md`, and `SESSION-HANDOFF.md`.

### BASELINE
- Commit: `14b5795` in `G:\Forge-QA\forge-development` (`clean` working tree).
- `bench97-unit1-after.json` (`apply2`, 1,000 files): `wallMs: 31,697.3`, `totalMs: 31,251.3`, `validate: 3,346.3` (`readiness: 289.2`, `project: 1,604.3`, `effect: 95.4`), `sourceRecheck: 10,650.9` (`count: 7`, `snapshotMs: 4,841.7`, `diskMs: 4,564.6`, `corpusMs: 1,181.4`).

### IMPLEMENT
- [server.ts](server.ts):
  - Added bounded FIFO preview-validation cache (`MAX_DEPLOY_PREVIEW_VALIDATION_CACHE = 4`, `deployPreviewValidationCache`) populated by verified `dryRun === true` previews (without active `xmlPatches`) after `staticEvidence` succeeds, storing immutable static outputs (`emittedXmlCount`, `compileDiagnosticsCount`, `preflight`, `canonicalMd`, `readinessUnavailable`, `preflightDiagnostics`, `preflightContentHash`, `pfWarnings`, `staticEvidence`, `luaValidation`, `versionChangesPerRelease`).
  - On Bound Apply (`dryRun !== true` with matching `expectedModId`, `expectedArtifactHash`, `expectedBindingHash`), verifies all 12 static and live guards (`modId`, `artifactHash`, `snapshot.manifest.hash`, `deployFormat`, `configSignature`, `wsDoctorHash`, `baseCorpus.hash`, `bindDeploymentCorpus(baseCorpus, canonicalMd) === corpusHash`, live reference/jobs/wares Set/Map pointers, `targetRoot`, `selectedSourceKey`, `canonicalReviewSource`, and `previousBuildStateKey`) before reusing static validation, while always running `projectChecks`/`openNativeProjectCheckProof`, `targetFingerprint`, `receiptHistory`/`previousBuild`, `compareValidationWarnings` (`validationDelta`), `evaluateFindingAcceptances`, `expectedIdentity`, `deploymentManifestConflict`, `previewDeploymentEffect`, `assertCurrentSource`, and `assertCurrentTarget` fresh.
  - Coalesced immediate redundant `assertCurrentSource()` calls at `assertWriteAuthority(true)` (2 ms after pre-preview recheck) and on initial entry of `.forge-builds/loose` staging (`stagingCheck === 1`), cutting `sourceRechecks.count` from `7` to `5` while retaining every durable barrier check (`16498`, post-`prepare`, staging swap, incumbent `extensions/<modId>` backup move, and `extensions/<modId>` swap promotion).
- [config/durable-writers.json](config/durable-writers.json): Updated `sourceFingerprint` (`09c09588... -> 6adbfbe8...`) after verifying via diff against `HEAD` that raw call counts (`191` in `server.ts`) and contracts were unchanged (only context slice around `fs.mkdirSync(extensionsPath)` shifted by `let stagingCheck = 0`).
- [scripts/route-integration.mjs](scripts/route-integration.mjs): Added 5 isolated Bound-Apply preview validation reuse parity and negative-path checks (`deploy_preview_validation_cache_populates_on_preview`, `deploy_preview_validation_reused_on_bound_apply_with_coalesced_barriers`, `deploy_preview_reuse_refuses_post_preview_source_edit`, `deploy_preview_reuse_invalidates_when_workspace_model_differs`, and `deploy_preview_reuse_preserves_acceptance_gate_and_applies_on_approval`).

### VALIDATE
- `bench97.mjs` (`1,000`-file mod + X4 `9.00` corpus, compiled `dist/server.cjs`, Node `v24.15.0`, receipt `G:\Forge-QA\temp\bench97-unit2-after.json` vs `bench97-unit1-after.json` & `bench97-baseline.json`):
  - `apply1` wall: `30,821.1 -> 25,767.3 ms` (`-5,053.8 ms`, `-16.4%` vs Unit 1; `-11,623.5 ms`, `-31.1%` vs `0.0.93` baseline `37,390.8 ms`); `validate: 3,075.0 -> 1,510.3 ms` (`readiness: 0`, `project: 0`, `effect: 88.8`); `sourceRecheck: 10,721.2 (n=7) -> 7,452.3 ms (n=5)`.
  - `apply2` wall: `31,697.3 -> 26,376.7 ms` (`-5,320.6 ms`, `-16.8%` vs Unit 1; `-9,726.8 ms`, `-26.9%` vs `0.0.93` baseline `36,103.5 ms`); `validate: 3,346.3 -> 1,531.0 ms` (`readiness: 0`, `project: 0`, `effect: 101.7`); `sourceRecheck: 10,650.9 (n=7) -> 7,551.9 ms (n=5)`.
  - `totalCpuHits`: `150,130 -> 133,931` (`open`: `79,739 -> 70,848`).
- `npm run typecheck`: PASS (`0` errors).
- `npm run lint`: PASS (`0` errors, `601` pre-existing warnings).
- `npm run test:writers`: PASS (`30/30` selftest, audit PASS, `8/8 allPassed=true`).
- `npm run precommit:check`: PASS (`[precommit] OK`).
- `npm run test:oracles`: PASS (`134/134 green`).
- `npm run test:routes`: PASS (`621/621 PASS`).

### REVIEW & CLOSE
- Status: **Unit 2 VERIFIED** (`#97` overall remains **PARTIAL / in_progress** — next Unit 3 targets `.forge-builds/loose` + `extensionsPath` dual `write` stage / `.snapshots` / `prepare` overhead).
- Capability-map delta: `no capability-map delta`.
- Suggested commit title: `perf(deploy): reuse preview static validation and coalesce apply barriers (#97)`

### AAR
- Triggers: First compilation failed `typecheck` on 4 exact type mismatches (`getReferenceSets()` keys `mdScripts`/`scriptProperties` vs `jobs`, `ModDoctorDiagnostic[]` narrowing, destructuring `canonicalMd` & `diskValidationSkipped`); first new `route-integration.mjs` tests hit 2 fixture setup bugs (`ws.description` altered emitted `README.md`, `<set_value bogus_attr>` wasn't a non-XSD error, and `targetBeforeUnaccepted` was initially compared after `acceptedApply`).
- Sustain: Measuring exact sub-stage timings (`validationStagesMs`, `sourceRechecks.count`) immediately proved `readiness: 0`, `project: 0`, and `n=5` in both `bench97.mjs` and `route-integration.mjs`, while revealing the remaining `1.4s` in `validate` is 2x `deploymentTargetFingerprint(targetRoot)` and `write`/`prepare`/`sourceRecheck` (`21.6 s` combined) remain Unit 3 targets.
- Improve work/approach: Check `buildWorkspaceFileManifest` field dependencies (`ws.description` feeds `README.md`) and `runProjectValidation` non-XSD error rules (`this.Missing`) before writing integration fixtures.
- Improve tools: Wait for any running `test:routes` / `test:oracles` command to finish before starting another full suite even when ports are distinct, avoiding overlapping CPU contention.
- Highest-risk evidenced weakness: `bench97` (`apply2 = 26.4 s`) still runs two full `compileWorkspaceToFolder` materializations (`write = 7.0 s`), target copy `prepare` (`2.7 s`), and `5x` full-tree `sourceRecheck` (`7.55 s`). Next Unit 3 (`#97`) should profile and cut dual `compileWorkspaceToFolder` / `write` / `.snapshots` staging overhead so large mods like Claude's (`deploy751.log` `write = 69.6 s`, `prepare = 31.1 s`) also fit safely well under `60 s`.
