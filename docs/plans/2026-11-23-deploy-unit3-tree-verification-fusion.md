# Native Deploy Latency Unit 3: Fused Tree Verification & Pre-Backup Barrier Coalescing (#97)

Status: SPECIFIED

## Task Record

Task: Fuse duplicate directory tree walks + SHA-256 file reads in `replaceRegularTreeExact` and `replaceValidatedDeployment`, deduplicate `artifactStage.fingerprint` reuse, and coalesce the pre-backup `targetCheck === 1` `assertCurrentSource()` call cleanly into the pre-swap `targetCheck === 2` TOCTOU barrier (`4` total barriers) inside `deployVerifyHandler`.
Lane: FULL

### PLAN
- Bounded unit:
  1. Add `regularTreeExpectedAndFingerprint(rootPath)` and `verifyExpectedFilesAndFingerprint(targetRoot, expected, expectedFingerprint)` in `server.ts`, preserving the exact SHA-256 format of `regularTreeFingerprint` (`D\0`/`F\0` + normalized path + `\0` + `size` + `\0` + `hashArtifactFile` + `\0`) and every error thrown by `verifyExpectedFiles`.
  2. Use `regularTreeExpectedAndFingerprint` and `verifyExpectedFilesAndFingerprint` in `replaceRegularTreeExact` (`12845`, `12868`) to eliminate 2 duplicate full-tree file walks per recovery/undo swap.
  3. In `replaceValidatedDeployment` (`13644-13693`), reuse `artifactStage.fingerprint` for `stagedFingerprint` when `artifactRetry` already computed it, and verify `targetPath` in one pass with `verifyExpectedFilesAndFingerprint` when `!artifactRetry` (preserving exact `requireArtifactTree` retry checks and post-activation `verifyExpectedFiles` failures).
  4. In `deployVerifyHandler` (`16866`), coalesce `beforeActivate` on `extensionsPath` (`let targetCheck = 0; beforeActivate: () => { targetCheck++; assertWriteAuthority(targetCheck === 1); ... }`) so receipt/proof/prior-build verification still executes on entry (`targetCheck === 1`), while the full `assertCurrentSource()` walk fires right before `rename(targetPath, backup)` and `rename(stage, targetPath)` (`targetCheck === 2`), cutting `sourceRechecks.count` from `5` to `4`.
- Authoritative references:
  - `server.ts` (`regularTreeFingerprintAndBytes`, `expectedRegularFiles`, `verifyExpectedFiles`, `replaceRegularTreeExact`, `replaceValidatedDeployment`, `deployVerifyHandler`, `runCompileArtifactSelftest`)
  - [docs/plans/2026-11-23-deploy-unit2-validation-reuse-and-barriers.md](2026-11-23-deploy-unit2-validation-reuse-and-barriers.md)
- Assumptions:
  - No production path modifies `targetPath` between `replaceValidatedDeployment` entry (`13558`) and `beforeActivate` swap (`13648`), because `rename(targetPath, backup)` executes after `13648`.
- In scope:
  - `server.ts` helpers (`regularTreeExpectedAndFingerprint`, `verifyExpectedFilesAndFingerprint`), `replaceRegularTreeExact`, `replaceValidatedDeployment`, `deployVerifyHandler` (`targetCheck`), plus parity & tamper negative assertions in `runCompileArtifactSelftest`.
  - `config/durable-writers.json` refresh only if non-writer context slices shift, after `git show HEAD:server.ts` diff verification confirms 0 raw call count or contract changes.
- Out of scope:
  - Altering `artifactBuildPromotionRetry` (`#105`), `verifyMaterializedArtifact` EOF growth hook (`artifactPipeline.ts`), or `.forge-builds/loose` dual materialization strategy.
- Risks and authorization boundaries:
  - Missing file or hash mismatch in `verifyExpectedFilesAndFingerprint`: must still throw the exact `'Deployed artifact is missing ...'` and `'Deployed artifact verification failed for ...'` errors before checking tree fingerprint equality so callers and selftests observe unchanged failure semantics.
  - TOCTOU gap risk: keeping `targetCheck === 2` immediately before `rename(targetPath, backup)` preserves source/snapshot/corpus verification before any target mutation.
- Rollback/checkpoint: Local commit `2fe05cf` in `G:\Forge-QA\forge-development`.
- Acceptance criteria:
  - Parity tests confirm `regularTreeExpectedAndFingerprint` matches `{ expectedRegularFiles, regularTreeFingerprint }` and `verifyExpectedFilesAndFingerprint` throws on missing/tampered files and mismatched extra files.
  - `bench97.mjs` (`bench97-unit3-after.json`) shows further reduction in `apply1`/`apply2` `sourceRecheck` (`count: 4`) and `write` / total wall time vs `bench97-unit2-after.json` (`26,376.7 ms`).
  - `npm run typecheck`, `npm run lint`, `npm run test:writers`, `npm run precommit:check`, `npm run test:oracles`, and `npm run test:routes` all pass.
- Validation methods & negative paths:
  - Same suite (`typecheck`, `lint`, `writers`, `precommit:check`, `oracles`, `routes`), `bench97.mjs` (`bench97-unit3-after.json`), plus `runCompileArtifactSelftest` checks verifying `regularTreeExpectedAndFingerprint` and `verifyExpectedFilesAndFingerprint` negative paths (missing file, tampered file, extra foreign file).

### BASELINE
- Commit `2fe05cf`: `apply1 = 25,767.3 ms`, `apply2 = 26,376.7 ms`, `write = 7,006.1 ms`, `sourceRecheck = 7,551.9 ms (count: 5)`.


### IMPLEMENT
- `server.ts`:
  - Added `regularTreeExpectedAndFingerprint` and `verifyExpectedFilesAndFingerprint` to compute exact normalized byte sizes/hashes and verify the installed regular file tree against an expected file map + tree fingerprint in a single pass rather than walking the written destination separately for exactness and fingerprinting.
  - Wired `replaceRegularTreeExact` and `replaceValidatedDeployment` to use `regularTreeExpectedAndFingerprint` / `verifyExpectedFilesAndFingerprint`, and reused `artifactStage?.fingerprint` when recording `stagedFingerprint` instead of rehashing the staged directory.
  - Coalesced the `extensionsPath` destination entry source-recheck barrier (`beforeActivate` at `targetCheck === 1` skips the duplicate `assertCurrentSource()` rewalk when the prior barrier just proved source freshness, while `targetCheck === 2` runs full `assertCurrentSource()` right before `rename` backup+promotion), reducing `sourceRechecks.count` on bound `apply` from `5` to `4` (down from `7` at baseline).
  - Extended `runCompileArtifactSelftest` via existing `fixtureWrite` helper (`0` net new raw fs calls in `server.ts`) with positive verification and negative-path rejections (extra file, tampered bytes, missing file) for `regularTreeExpectedAndFingerprint` / `verifyExpectedFilesAndFingerprint`.
- `scripts/route-integration.mjs`: Updated `deploy_preview_validation_reused_on_bound_apply_with_coalesced_barriers` barrier expectation from `sourceRechecks.count === 5` to `=== 4`.
- `config/durable-writers.json`: Verified `headCount=191 curCount=191` (`0` new raw fs writer calls) and refreshed `server.ts` `sourceFingerprint` to `b643581f18a8332532a3091486f2ee00f68780d7af862d448898e32c0cf4161f`.

### VALIDATE
- `bench97` (`1,000`-file mod + X4 9.00, `G:\Forge-QA\temp\bench97-unit3-after.json` vs `bench97-unit2-after.json` & `bench97-baseline.json`):
  - `preview1`: `12996.4 -> 12958.3 -> 12064.5 ms` (`-7.2%` vs baseline, `-6.9%` vs Unit 2; `rechecks=1`, `validate=4987.0 ms`, `snapshot=3886.3 ms`)
  - `apply1`: `37390.8 -> 25767.3 -> 23360.4 ms` (`-37.5%` vs baseline, `-9.3%` vs Unit 2; `rechecks=4` [`5644.6 ms`], `validate=1456.4 ms`, `write=6146.8 ms`, `verify=891.4 ms`, `finalize=682.9 ms`, `snapshot=2783.5 ms`)
  - `preview2`: `11015.6 -> 10148.7 -> 9588.3 ms` (`-13.0%` vs baseline, `-5.5%` vs Unit 2; `rechecks=1`, `validate=3645.0 ms`, `snapshot=2934.0 ms`)
  - `apply2`: `36103.5 -> 26376.7 -> 25185.6 ms` (`-30.2%` vs baseline, `-4.5%` vs Unit 2; `rechecks=4` [`6222.7 ms`], `validate=1428.3 ms`, `write=7355.6 ms`, `verify=941.0 ms`, `finalize=741.3 ms`, `snapshot=2759.0 ms`)
- `npm run lint`: PASS (`0` errors, `601` warnings).
- `npm run test:writers`: PASS (`30/30` selftest, durable-writer audit PASS across 50 raw FS / 12 host-store / 4 browser-output / 3 SQLite owners, `durableWrite selftest: 8/8`).
- `npm run test:oracles`: PASS (`134/134 green`, including `/agent/artifact-pipeline-selftest`, `/agent/compile-selftest 23/23`, `/agent/compile-fidelity-selftest 14/14`).
- `npm run test:routes`: PASS (`621/621 PASS`, including `sourceRechecks.count === 4` bound-apply barrier assertion and production bundle checks).
- `npm run precommit:check`: PASS (`[precommit] OK`, including `test:native-performance`, `test:action-receipt-coverage` `98` routes / `69` surfaces, `tsc --noEmit`).

### REVIEW & CLOSE
- **Status:** `PARTIAL` overall for GitHub `#97` (`Unit 3 VERIFIED` in Dev source & isolated runtime; installed VSIX + 44 MB realistic `x4_ai_influence`-scale timing & remaining `#97` `.forge-builds/loose` dual-write evaluation remain open).
- **What changed:** Single-pass regular-tree byte+fingerprint verification, staged fingerprint reuse, and `targetCheck === 1` entry barrier coalescing (`sourceRechecks.count`: `7 -> 5 -> 4`), plus selftest positive/negative coverage and updated route assertion.
- **What stayed unchanged:** `.forge-builds/loose/<modId>` dual compilation / `.snapshots` staging architecture and installed IDE binary (`FORGE DEVELOPMENT` still on `0.0.89`).
- **Capability-map delta:** `no capability-map delta` (internal deploy optimization preserving external contracts).
- **Suggested commit title:** `perf(deploy): fuse tree verification walks and coalesce target entry barrier (#97)`

### AAR
- **Triggers:** Benchmark timing/route updates ran across background validation (`task-1334`), and durable-writer fingerprint refresh was required after `server.ts` changes around raw fs call sites.
- **Sustain:** Keeping `runCompileArtifactSelftest` on the existing `fixtureWrite` helper avoided adding raw fs call sites in `server.ts`, preserving `headCount=191 === curCount=191`.
- **Improve work/approach:** Avoid piping long-running validation suites through `Select-Object -Last N`, which buffers stdout until process exit and obscures live progress during background checks.
- **Improve tools:** `bench97` (`G:\Forge-QA\temp\bench97.mjs`) with explicit `BENCH97_OUT` JSON output cleanly isolated baseline / Unit 1 / Unit 2 / Unit 3 stage deltas.
- **Highest-risk evidenced weakness:** Dual-write (`write = 7.36 s`) and remaining `4x` full source walks (`sourceRecheck = 6.22 s`) still dominate bound `apply` (~54% of `25.19 s` on `1,000` files); measuring a realistic `44 MB` `x4_ai_influence`-scale fixture will show whether another unit is warranted before closing `#97`.
