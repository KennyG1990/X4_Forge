# Plan & Close — Configurable Temporary Deploy-Snapshot Root (`#96` / `#123`) & Bounded `aiscripts` Generation Digest (`#63`)

- **Date:** 2026-11-25
- **Unit:** 49
- **Lane:** FULL
- **Status:** VERIFIED

## PLAN

- **Bounded unit:**
  1. Complete the remaining `#96` (`#123`) slice: allow operators and explicitly granted agents to configure an optional Forge-owned temporary directory (`snapshotTempPath`) for native deploy snapshots across the shared directory planner, Studio Settings (`Paths & Corpus`), Agent Configuration API, and curated stdio MCP tools, showing effective directory and provenance (`saved` | `default` | `launcher`), supporting explicit clear back to process-temp default, binding the reviewed temporary root across native deploy preview/apply, refusing stale/inaccessible/aliased/overlapping/out-of-grant roots before writes, retiring temporary snapshot directories deterministically before HTTP replies flush, and reporting the configured root on `DEPLOY_SNAPSHOT_NO_SPACE` without falling back to another drive while preserving `projectCheckStaging` ownership.
  2. Fix the `[REPRODUCED]` Forge QA Field Log defect in `GET /api/agent/reference/aiscripts` (`src/server/referenceRoutes.ts:315`) where `generation` fell back to the 15.4 KB multi-line `corpus.signature` string when `manifestGeneration` was null, hashing it to a 64-hex SHA-256 digest matching `listOverrideOrderIssuers`.
- **Assumptions:**
  - Existing profiles without `snapshotTempPath` continue using `fs.realpathSync.native(os.tmpdir())` with provenance `'default'` (and launch-only `TEMP`/`TMP` remains honored through `os.tmpdir()`).
  - Under `projectCheckOwnerProfileEnabled()` (`X4_FORGE_PROJECT_CHECK_OWNER_POLICY`), `snapshotTempPath` is locked (`PROJECT_CHECK_OWNER_ROOTS_LOCKED`, provenance `'launcher'`). Under Dev scratch (`isolatedScratch` without owner-check policy), `snapshotTempPath` remains mutable so isolated profiles can target an independent temporary volume/root.
- **Authoritative references:**
  - GitHub Issue `#96` (2026-11-21 specification comment for `#123` temporary snapshot root) & Issue `#123`
  - GitHub Issue `#63` & `0.0.94` installed MCP QA Field Log finding (`list_reference_aiscripts`)
  - `src/lib/configurationGrant.ts`, `src/server/configurationOperations.ts`, `src/server/directoryConfiguration.ts`, `src/lib/pathRoles.ts`, `src/lib/xsdParser.ts`, `src/server/deploymentSnapshot.ts`, `src/server/projectCheckStaging.ts`, `src/server/projectCheckNativeProof.ts`, `src/server/findingAcceptance.ts`
- **In scope:**
  - `src/lib/pathRoles.ts`, `src/lib/xsdParser.ts`, `src/server/directoryConfiguration.ts`, `src/lib/configurationGrant.ts`, `src/server/configurationOperations.ts`
  - `src/server/deploymentSnapshot.ts`, `src/server/findingAcceptance.ts`, `src/server/projectCheckNativeProof.ts`, `server.ts`
  - `src/components/DirectorySettingsModal.tsx`, `tests/e2e/reference-settings.spec.ts`
  - `src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `src/lib/actionReceiptPolicyBundle.ts`, `config/durable-writers.json`, `config/forge-route-dispositions.json`, `config/action-receipt-coverage.json`
  - `src/server/referenceRoutes.ts`
  - `scripts/directory-configuration.selftest.ts`, `scripts/configuration-operations.selftest.ts`, `scripts/deployment-snapshot.selftest.ts`, `scripts/configuration-transport.selftest.ts`, `scripts/route-integration.mjs`
- **Out of scope:**
  - Moving existing workspaces or deploying mods during settings save.
  - Changing live Forge, live Antigravity profile, X4 installation, or game saves.
- **Rollback/checkpoint:**
  - Baseline `40f7917cd23cee48e524791168b08078f0ddcec8` (`0.0.94`).

## BASELINE

- **Revision/version:** `40f7917cd23cee48e524791168b08078f0ddcec8` (`0.0.94`, clean worktree).
- **Existing changes/failures/runtime state:** Clean working tree; `0.0.94` published on Open VSX and GitHub.

## RECONCILE

- **Resources and readers/writers searched:**
  - `XsdConfig` / `ResolvedXsdConfig` (`src/lib/xsdParser.ts`, `src/server/directoryConfiguration.ts`, `src/server/configurationOperations.ts`, `server.ts`, `src/components/DirectorySettingsModal.tsx`).
  - `CONFIGURATION_GRANT_FIELDS` (`src/lib/configurationGrant.ts`, `src/server/configurationOperations.ts`, `src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`).
  - `captureDeploymentSnapshot` (`src/server/deploymentSnapshot.ts`, `server.ts`, `src/server/projectCheckStaging.ts`, `src/server/projectCheckNativeProof.ts`, `src/server/findingAcceptance.ts`).
  - `respondAgentReferenceAiScripts` (`src/server/referenceRoutes.ts:315`).
- **Existing capability reused:**
  - Extended `configuration.*` capability family (`@1 -> @2` on `configuration.access.request`, `configuration.preview`, `configuration.read`, `configuration.status`; `@1` retained on `configuration.access.status` and `configuration.apply`), `planDirectoryConfigurationChange`, `validateDirectoryRoles`, `captureDeploymentSnapshot`, and `acceptanceBinding`.
- **Capability-map delta:** `configuration.access.request@2`, `configuration.preview@2`, `configuration.read@2`, `configuration.status@2` (`111` capabilities, Contract SHA-256 `c6e2376ffb319197d496d9db56a3db468d291caaa680004c74bec54e2a75bc59`, UI-action parity SHA-256 `34170eafa92bb14a866274238bb4ed6e95065e4854fa87adc280503b7ada7360`, `MCP_MODULE_AUDIT_VERSION = 45`).

## IMPLEMENT

- **Actual bounded changes:**
  1. `src/lib/pathRoles.ts` & `src/lib/xsdParser.ts`: Added `snapshotTempPath`, `defaultSnapshotTempPath()`, `inspectSnapshotTempDirectory()`, role/protected overlap checks (`PROTECTED_ROOT_OVERLAP`, `SNAPSHOT_TEMP_ROLE_OVERLAP`, `SNAPSHOT_TEMP_NOT_FOUND`, `SNAPSHOT_TEMP_NOT_PHYSICAL`), and `ResolvedXsdConfig.{snapshotTempPath, configuredSnapshotTempPath, snapshotTempSource}` without triggering false overlaps on unconfigured `os.tmpdir()` fixtures.
  2. `src/server/directoryConfiguration.ts`, `src/lib/configurationGrant.ts`, & `src/server/configurationOperations.ts`: Wired 7th field `'snapshotTempPath'` through shared planning, `PROJECT_CHECK_OWNER_ROOTS_LOCKED`, physical root leases, `snapshotTempSource` provenance, and explicit clear (`""`).
  3. `src/server/deploymentSnapshot.ts`, `src/server/findingAcceptance.ts`, `src/server/projectCheckNativeProof.ts`, & `server.ts`: Added `DeploymentSnapshotRootError` (`DEPLOY_SNAPSHOT_ROOT_STALE`, `DEPLOY_SNAPSHOT_ROOT_INACCESSIBLE`, `DEPLOY_SNAPSHOT_ROOT_ALIASED`, `DEPLOY_SNAPSHOT_ROOT_INVALID`), `resolveDeploymentSnapshotTempRoot`, parent `(dev, ino)` integrity verification in `assertIntegrity()` and `dispose()`, `snapshotRootHash` binding in `AcceptanceSubject` + `configSignature`, pre-response `retireDeployRequestScratch()` in `deployVerifyHandler`, and configured-root `507 DEPLOY_SNAPSHOT_NO_SPACE` reporting without drive fallback.
  4. `src/components/DirectorySettingsModal.tsx` & `tests/e2e/reference-settings.spec.ts`: Added `Temporary Deploy Snapshot Folder (optional)` row with effective path, provenance badge (`saved` | `process-temp default` | `launcher`), inline validation issue display, clean untouched omission, and `Clear to Default` button.
  5. `src/lib/forgeCapabilities.ts`, `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, `src/lib/actionReceiptPolicyBundle.ts`, & `config/*`: Updated `@2` capability schemas/MCP tools and promoted `durable-writers.json` (`2161db26...`), `forge-route-dispositions.json` (`aa349523...`), and `action-receipt-coverage.json` (`a5a898ba...`).
  6. `src/server/referenceRoutes.ts`: Hashed fallback `corpus.signature` in `respondAgentReferenceAiScripts` to a 64-hex SHA-256 digest.
- **Scope changes and reasons:** Added `retireDeployRequestScratch()` before `res.json(...)` in `deployVerifyHandler` (`server.ts:22408`) after end-to-end cross-volume testing reproduced a post-`res.json()` loopback race where callers inspecting disk immediately after HTTP 200 could observe the owned snapshot directory milliseconds before `finally` completed `fs.rmSync`.

## VALIDATE

- `npm run typecheck` -> `0` errors
- `npm run lint -- --max-warnings 600` -> `0` errors (`<= 600` warnings)
- `npx tsx src/lib/pathRoles.ts` -> `28/28` PASS
- `npm run test:directory-configuration` -> `PASS` (`writesOnRefusals: 0`, `fixtureFiles: 0`)
- `npm run test:configuration-grant` -> `PASS` (`58/58` + legacy key/route oracle)
- `npm run test:configuration-operations` -> `16/16` PASS (`fixtureRetired: true`)
- `npx tsx scripts/deployment-snapshot.selftest.ts` -> `PASS` (`153` assertions, including configured-root `ENOSPC` no-fallback, sibling preservation, and stale/aliased/invalid pre-write refusals)
- `FORGE_QA_TMP=G:\Forge-QA\temp npx tsx scripts/project-check-staging.selftest.ts` -> `17/17` PASS (`fixtureRetired: true`)
- `npm run test:writers` -> `30/30` + `PASS` + `8/8` (`sourceFingerprint: 2161db26e17fece661fb10c726cdbfe593a806d2d2773f65225500cf8506134d`)
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`111` capabilities, `400` routes, `112` MCP aliases, `51` UI-action parity rows)
- `npm run test:action-receipt-coverage` + `:selftest` -> `PASS` (`140` routes / `69` surfaces, `79/79` + `23/23`)
- `npm run test:mcp-capabilities` -> `PASS` (`read=66, write=71, deploy=72`, `30/30` native-perf)
- `npm run test:native-deploy-mcp` (`6/6`) & `npm run test:workspace-files-mcp` (`18/18`) -> `PASS`
- `npm run test:configuration-transport` -> `8/8` PASS (`crossVolumeExercised: true` across `C:\` and `G:\`, `fixtureRetired: true`)
- `npm run test:oracles` -> `134/134` PASS
- `npm run test:routes` -> `798/798` PASS
- `node scripts/run-e2e.mjs tests/e2e/reference-settings.spec.ts` -> `7/7` PASS (`VERDICT: PASS`, `treeGone: true`)
- `npm run precommit:check` -> `[precommit] OK`

## REVIEW

- Optional `snapshotTempPath` across shared planner, UI, API, and MCP -> **Done and evidenced**
- Effective directory & provenance (`saved` | `default` | `launcher`) + explicit clear -> **Done and evidenced**
- Cross-volume preview/apply isolation, sibling preservation, and `snapshotRootHash` preview->apply binding -> **Done and evidenced**
- Stale, inaccessible, aliased, overlapping, and out-of-grant pre-write refusals -> **Done and evidenced**
- Low-space `DEPLOY_SNAPSHOT_NO_SPACE` reporting configured root without drive fallback -> **Done and evidenced**
- `projectCheckStaging` ownership preservation -> **Done and evidenced**
- `GET /api/agent/reference/aiscripts` compact `generation` digest -> **Done and evidenced**
- Public Open VSX / installed VSIX qualification -> **Deferred to next 3-unit release review (`0.0.95` on Unit 51)**

## CLOSE

- **Status:** `VERIFIED` (Dev repo & rendered Studio E2E; `#96` stays open until `0.0.95` public VSIX delivery)
- **Remaining risks/deferred work:** Installed VSIX qualification in `0.0.95` (Unit 51 release review).
- **Suggested commit title:** `feat(config): add configurable temporary deploy-snapshot root (#96, #123, #63)`

## AAR

- **Triggers:**
  1. `tsc --noEmit` needed `inspected.valid === false` narrowing (`src/lib/pathRoles.ts:415`) under `strictNullChecks: false`.
  2. `test:configuration-transport` reproduced a real post-`res.json()` loopback cleanup race in `deployVerifyHandler`, fixed via `retireDeployRequestScratch()` prior to `res.json(...)`.
  3. `route-integration.mjs` `expectedCapabilityIdentity` needed `@2` for the 4 bumped `configuration.*` capabilities and `gen_...` allowance for `manifestGeneration`.
  4. `tests/e2e/reference-settings.spec.ts:278` required preserving clean omission of `snapshotTempPath` in `DirectorySettingsModal.tsx` when untouched.
- **Sustain:** Writing a real cross-volume (`C:\` vs `G:\`) end-to-end deploy test in `configuration-transport.selftest.ts` caught an actual pre-existing post-`res.json()` snapshot retirement race in `deployVerifyHandler`, and checking `reference-settings.spec.ts` before committing caught untouched-field omission parity.
- **Improve work/approach:** Under `strictNullChecks: false`, always use explicit `=== false` on boolean-discriminated unions (`{ valid: true } | { valid: false; issue }`), and grep `expectedCapabilityIdentity` in `scripts/route-integration.mjs` whenever bumping any capability version to `@2`.
- **Improve tools:** `Reload-FORGE-DEVELOPMENT.ps1` synced `0.0.94` extension assets cleanly; when an interactive `FORGE DEVELOPMENT` window was launched before a CLI VSIX upgrade, pressing `Ctrl+R` once inside that window activates the new sentinel watcher.
- **Highest-risk evidenced weakness:** Post-response `finally` cleanup in Express handlers (`return res.json(...)` inside `try/finally`) races against fast loopback clients inspecting disk state immediately after HTTP completion; wrapping `res.json` to run idempotent scratch disposal before socket flush (with `finally` retained as fallback) eliminates the race cleanly.
- **Global/project lessons banked:** Recorded in `SESSION-HANDOFF.md`.
