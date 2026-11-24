# Canonical Validation Surface Authority & Hash-Bound Validation Receipt (#138)

**Status:** `VERIFIED` (Dev source, `134/134` oracles, `641/641` HTTP route checks & `precommit:check`; `#138` remains `in_progress` pending `0.0.94` installed/release qualification)
**Owner:** GitHub `#138` (related `#131`, `#83`, `#48`, `#61`)
**Lane:** `FULL`

## PLAN
- **Bounded unit:** Resolve all three asks (`A`, `B`, `C`) of Claude's P0 deploy/validation friction report `#138`:
  1. **Ask A & C (Canonical surface declaration):** Explicitly declare `POST /api/agent/deploy-verify` (`dryRun: true` and apply) as the canonical deployment-candidate validation surface, and have `POST /api/agent/project/validate` return both a structured `authority` block (`role: 'source-static-only'`, `canonicalDeploySurface: 'POST /api/agent/deploy-verify'`, `supersededForDeployGate: true`, `omitsDeployStages: [...]`) and HTTP header `X-Forge-Validation-Role: source-static-only; canonical-deploy="POST /api/agent/deploy-verify"`.
  2. **Ask B (Compact hash-bound validation receipt + retrieval + deterministic freshness):** Emit and persist a tamper-checked `ValidationVerdictReceipt` (`{ schemaVersion, receiptHash, surface, canonicalForDeploy, modId, verdict, deployAllowed, outcome, sourceHash, artifactPlanHash, artifactHash, bindingHash, forgeVersion, validatedAt, errors, warnings, acceptedWarnings, unreviewedWarnings, coverageGaps, unavailableChecks }`) on `POST /api/agent/deploy-verify` (dry-run pass, apply pass, and candidate validation refusals `wellformed`, `compile`, `UNACCEPTED_MOD_FINDINGS`) and `POST /api/agent/project/validate` (in an isolated non-canonical `sourceValidation` slot so `project/validate` can never spoof a `deploy-verify` verdict). Expose retrieval via `GET /api/agent/validation/last?modId=<id>` (computing zero-copy candidate `currentSourceHash` + `currentArtifactPlanHash` on disk to report `freshness.status: 'current' | 'superseded' | 'unknown'` and a human-readable banner without timestamp heuristics) and passively via `lastValidation` on `GET /api/agent/status`.
- **Assumptions & Empirical Findings:**
  - Verified against exact AiLive build 813 bytes (`5748205b:md/ai_influence_galaxynews.xml`): `runProjectValidation` (`POST /api/agent/project/validate`) already reports all `6 × expression-null-safe-exists` errors (`line 137` columns `315, 487, 683`; `line 223` columns `196, 368, 564`) plus `#131` (`assets|maps|index/*.xml`) and `#83` (`md.cue_duplicate_name`).
  - Verified on full `x4_ai_influence`: `loadProjectFromDisk` intentionally scopes Lua to menu-registered/top-level runtime files (`266` files, `sourceHash: 258668f0...`), whereas `deploy-verify`'s `captureDeploymentSnapshot` validates the full deployed artifact plan (`271` files including `lua3p/*.lua`, `native/**/*.lua`, `tools/cjson_card_*.lua`, `sourceHash: de5bfd77...`, `431 ms` zero-copy computation) plus workspace compile/patch synthesis, emitted XML well-formedness, target `content.version_stale`, and finding-acceptance deploy policy.
- **In scope:**
  - `src/lib/validationDelta.ts`: add `ValidationVerdictReceipt`, `createValidationVerdictReceipt`, `ValidationReceiptStore` (backed by `atomicWriteJson` in `validation-receipts.json`, `0` raw FS call delta), and selftests in `runValidationDeltaSelftest()`.
  - `server.ts`: wire `validationReceiptStore`, `authority` + `X-Forge-Validation-Role` + `validationReceipt` on `POST /api/agent/project/validate`, `validationReceipt` recording/response on `POST /api/agent/deploy-verify`, `GET /api/agent/validation/last`, and `lastValidation` on `GET /api/agent/status`.
  - `config/forge-route-dispositions.json` (& `config/durable-writers.json` `sourceFingerprint` if `server.ts` offsets shift): register `GET /api/agent/validation/last`.
  - `scripts/route-integration.mjs`: add end-to-end HTTP checks for `project/validate` authority/isolation, failed & passing `deploy-verify` dry-run receipts, edit-induced `current -> superseded` hash freshness, `/api/agent/status` `lastValidation`, and corrupt-store fail-closed behavior.
- **Out of scope:** Modifying `AiLive` (`tools/deploy.py` / `tools/validate_ws.py`), changing `LOADABLE_RE` runtime-scope boundaries, restarting `FORGE DEVELOPMENT` IDE (`PID 34076`), or pushing/publishing without Ken's gate.
- **Risks & Rollback:**
  - Risk 1: `project/validate` overwriting canonical `deploy-verify` receipts -> prevented by storing `deployVerify` and `projectValidate` in separate typed slots; `receipt` on `GET /api/agent/validation/last` is strictly `deployVerify`.
  - Risk 2: `server.ts` line shift altering `config/durable-writers.json` `sourceFingerprint` or `config/forge-route-dispositions.json` -> verified via `npm run test:writers`, `npm run test:capabilities`, and `npm run precommit:check`.
  - Rollback: Revert single commit on `G:\Forge-QA\forge-development` (`main`) back to `50285fc`.
- **Acceptance Criteria:**
  1. `POST /api/agent/project/validate` returns `authority` (`supersededForDeployGate: true`, `canonicalDeploySurface: 'POST /api/agent/deploy-verify'`), `X-Forge-Validation-Role` header, and a non-canonical `validationReceipt` (`canonicalForDeploy: false`) that never populates the canonical `receipt` slot.
  2. `POST /api/agent/deploy-verify` (`dryRun: true` and apply, plus candidate validation failures `wellformed` / `compile` / `UNACCEPTED_MOD_FINDINGS`) returns and persists a canonical `validationReceipt` with `{ sourceHash, forgeVersion, validatedAt, errors, warnings, unreviewedWarnings, coverageGaps, verdict, deployAllowed, ... }`.
  3. `GET /api/agent/validation/last?modId=<id>` returns the canonical `deploy-verify` receipt, computes `freshness.status` (`'current'` when disk candidate `sourceHash` matches, `'superseded'` as soon as a file changes on disk), and fails closed (`503 VALIDATION_RECEIPT_UNAVAILABLE`) if `validation-receipts.json` is corrupt.
  4. All required validation gates pass (`typecheck`, `eslint`, `test:writers`, `test:capabilities`, `test:action-receipt-coverage`, `test:oracles`, `test:routes`, `build`, `precommit:check`).

## BASELINE
- Commit `50285fc` on `main` (`16` commits ahead of `0.0.93` `e9c12e1`), clean working tree.
- Baseline: `GET /api/agent/validation/last` does not exist (`404`); `deploy-verify` leaves no standalone retrievable validation receipt on dry-run or refusal; `project/validate` carries no `authority` field or header distinguishing it from `deploy-verify`.

## RECONCILE
- Searched `src/lib/validationDelta.ts`, `src/lib/validationEvidence.ts`, `shared/projectValidationInput.ts`, `src/server/deploymentSnapshot.ts`, `server.ts`, `config/forge-route-dispositions.json`, and `config/durable-writers.json`.
- Reusing `src/lib/validationDelta.ts` (`atomicWriteJson`) avoids adding any new `.ts` module to `server.ts`'s import closure and adds zero raw `fs.*Sync` calls to `config/durable-writers.json`.
- Reusing `buildArtifactPlan` + `artifactPlanIdentity` + `validationSubjectSourceHash` reproduces `captureDeploymentSnapshot`'s exact `sourceHash` (`de5bfd77...` on `x4_ai_influence`) without staging temporary files.
- Capability-map delta: adds legacy read-only Agent API route `GET /api/agent/validation/last` in `config/forge-route-dispositions.json` (no mutating action-receipt surface delta).

## IMPLEMENT
- `src/lib/validationDelta.ts`:
  - Added `ValidationVerdictReceipt` (`forge.validation-receipt.v1`), `createValidationVerdictReceipt`, `formatValidationVerdictBanner`, and `ValidationReceiptStore` (`validation-receipts.json` via `atomicWriteJson`, zero raw FS call delta), keeping `deployVerify` (`canonicalForDeploy: true`) and `projectValidate` (`canonicalForDeploy: false`, `deployAllowed: null`) in strictly isolated slots per normalized `modId` with SHA-256 `receiptHash` verification on read/write.
  - Added 4 selftest suites in `runValidationDeltaSelftest()`.
- `src/server/deploymentSnapshot.ts`:
  - Added `computeDeployCandidateIdentity(sourceRoot, format)` computing zero-copy `sourceHash` and `artifactPlanHash` (`diskIdentity`) directly from `buildArtifactPlan`.
- `server.ts` & `config/forge-route-dispositions.json`:
  - Added `PROJECT_VALIDATE_AUTHORITY` + `X-Forge-Validation-Role` header + non-canonical `validationReceipt` on `POST /api/agent/project/validate` (leaving `POST /api/agent/project/validate/check` capability contract untouched).
  - Recorded and returned canonical `validationReceipt` (carrying both `sourceHash` and `diskSourceHash` = `diskIdentity`) on `POST /api/agent/deploy-verify` across dry-run pass, apply pass, `UNACCEPTED_MOD_FINDINGS`, `compile`, and `wellformed` candidate refusals.
  - Added `GET /api/agent/validation/last` (`?modId=`, `?sourceHash=`, `?checkSource=0|1`) returning `receipt`, `freshness` (`current` vs `superseded` by exact `diskSourceHash` / `sourceHash`, never timestamps), `banner`, and isolated `sourceValidation`, plus passive `lastValidation` on `GET /api/agent/status`.
- `scripts/route-integration.mjs`:
  - Added 7 end-to-end HTTP checks (`project_validate_declares_source_static_authority_*`, `validation_last_*`, `deploy_verify_dry_run_*`).

## VALIDATE
- Exact AiLive build 813 replay (`5748205b:md/ai_influence_galaxynews.xml`): `runProjectValidation` reports all `6 × expression-null-safe-exists` errors (`line 137` cols `315, 487, 683`; `line 223` cols `196, 368, 564`).
- Full `x4_ai_influence` candidate identity replay: `computeDeployCandidateIdentity` matches `captureDeploymentSnapshot` (`de5bfd77...`, `planHash: 62e9a276...`) in `431.1 ms` (`planMs: 305.4 ms`).
- `npm run typecheck` -> exit `0`.
- `npm run test:capabilities` -> `PASS` (`25` capabilities, `319` disposed literal routes).
- `npm run test:action-receipt-coverage` -> `PASS` (`98/69`).
- `npm run test:writers` -> `30/30` + `PASS` + `8/8` (`sourceFingerprint` unchanged).
- `npm run test:oracles` (`task-4412`) -> `134/134 PASS` (including `validation-delta-selftest 14/14`).
- `npm run test:routes` (`task-4412`) -> `641/641 PASS` (all 7 new `#138` HTTP assertions green).
- `npm run build` (`task-4412`) -> exit `0`.
- `npm run precommit:check` (`task-4412`) -> `[precommit] OK`.

## REVIEW
- Ask A (`expression-null-safe-exists` check on AiLive 813 + explicit canonical surface statement) -> **Done & evidenced**.
- Ask B (compact hash-bound `validationReceipt` on `deploy-verify` including dry run + `GET /api/agent/validation/last?modId=` + deterministic hash freshness) -> **Done & evidenced**.
- Ask C (`project/validate` body `authority.supersededForDeployGate: true` + `X-Forge-Validation-Role` header + slot isolation) -> **Done & evidenced**.
- Installed `0.0.94` runtime qualification & `deploy.py` adoption -> **Deferred** to `0.0.94` release gate / Claude cutover.

## CLOSE
- **Status:** `VERIFIED` (Dev source, `134/134` oracles, `641/641` HTTP route checks & `precommit:check`; `#138` stays open in `BACKLOG.md` pending `0.0.94` release delivery & Claude `deploy.py` adoption).
- **Capability-map delta:** `GET /api/agent/validation/last` registered in `config/forge-route-dispositions.json`.
- **Commit title:** `feat(validation): add hash-bound validation receipts and canonical surface authority (#138)`

## AAR
- **Triggers:**
  1. Initial `route-integration.mjs` edit referenced `READ_KEY` instead of `readKey` (`task-4379`).
  2. First `route-integration.mjs` run (`task-4394`, `639/641`) caught a genuine modeled-workspace subtlety: importing `val_receipt_fixture` caused `buildWorkspaceFileManifest` to format `content.xml` / `md/main.xml` in `generatedFiles`, so `snapshot.files` (`evidence.sourceHash`) differed from raw disk XML formatting even when zero files changed on disk! Binding `diskSourceHash: diskIdentity` (`artifactPlanIdentity(diskPlan, deployFormat)`) onto `ValidationVerdictReceipt` fixed modeled-workspace freshness AND automatically detects binary `.dll` changes too (`641/641 PASS`).
- **Points to sustain:** Writing an imported-workspace E2E route test (not just a unit test) caught the `generatedFiles` vs `diskIdentity` formatting difference before commit.
- **Points to improve — work/approach:** Check local harness token variable names (`readKey` vs `SESSION_TOKEN`) before launching full `test:routes`.
- **Points to improve — tools:** None required.
- **Highest-risk observed weakness:** Until `0.0.94` is packaged and installed into the live/Dev Forge host, live `deploy.py` runs against `0.0.89`/`0.0.93` will not yet see `GET /api/agent/validation/last`; documented explicitly on the Agent Board row.
