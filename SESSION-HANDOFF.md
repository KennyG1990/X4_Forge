# Session Handoff — X4_Forge (`G:\Forge-QA\forge-development`)

- **Updated:** 2026-11-23
- **Branch / HEAD (before `#53` commit):** `main` (`fb92bce` + local `#53` discovery/manifest close next)
- **Active Project:** `X4_Forge` (Forge QA / Dev ownership; NOT `X4_AiLive`, NOT `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`)
- **Isolated IDE State:** `FORGE DEVELOPMENT` (`PID 34076`, `G:\Forge-QA\development-ide`) still running `0.0.89` with `X4CodeSense 1.2.0` side-by-side. Do NOT restart/upgrade until Machine-State Ask authorizes release/IDE qualification.

## Completed Units Since `0.0.93` (`e9c12e1`)

1. **`1405c14` — MCP stdio EOF Windows teardown crash:** Natural stream drain via `discoveryController` abort + `process.stdin.destroy()` in `vscode-extension/mcp/x4forge-mcp.cjs`; capability audit bumped `MCP_MODULE_AUDIT_VERSION` `22 -> 23`.
2. **`14b5795` — `#97` Unit 1:** Buffer reuse in `src/lib/artifactPipeline.ts`, recovery walk reuse in `src/server/deploymentTrust.ts`, static corpus digest in `server.ts`. (`apply1` `37.39s -> 30.82s`, `apply2` `36.10s -> 31.70s`.)
3. **`2fe05cf` — `#97` Unit 2:** Bound-Apply preview validation cache (`deployPreviewValidationCache`) + `assertWriteAuthority(true)` / staging entry barrier coalescing (`sourceRechecks` `7 -> 5`), plus 5 route tests in `scripts/route-integration.mjs`. (`apply1` `30.82s -> 25.77s`, `apply2` `31.70s -> 26.38s`.)
4. **`fb92bce` — `#97` Unit 3:** Single-pass `regularTreeExpectedAndFingerprint` / `verifyExpectedFilesAndFingerprint`, `artifactStage?.fingerprint` reuse, `targetCheck === 1` entry barrier coalescing (`sourceRechecks` `5 -> 4`), and positive+negative checks in `runCompileArtifactSelftest`. (`apply1` `23.36s [-37.5%]`, `apply2` `25.19s [-30.2%]`.)
5. **`#53` Discovery Isolation & Manifest Corpus Cache (`docs/plans/2026-11-23-discovery-isolation-and-reference-status.md`):**
   - `src/lib/referenceManifest.ts` & `src/lib/referenceCorpus.ts`: retained `manifestSelection` across 1s `REFERENCE_SIGNATURE_CHECK_MS` expirations for unchanged completed generations, skipping 3 paginated SQLite scans while still re-statting physical files, detecting edits/force/generation rollover.
   - `src/server/referenceRoutes.ts`: added `?observe=1` non-blocking mode on `GET /api/reference/status`.
   - `src/lib/instanceDiscovery.ts` & `server.ts`: prevented `dev-build`/`release-host`/`lab` without isolated `X4FORGE_DISCOVERY_DIR` (including aliases/nested defaults) from writing or pruning `~/.x4forge`, added `'lab'` mode, and emitted `discoveryFile: null` when unpublished.
   - Verified: `test:writers` (`30/30` + `8/8`), `typecheck` + `vscode-extension` `tsc`, `lint` (`0` errors), `test:capabilities`, `reference-manifest-check.ts` (`13/13`), `test:reference-manifest-api` (`21/21`), `test:oracles` (`134/134`), `test:routes` (`621/621`), `precommit:check` (`OK`).

## Pre-Existing Baseline Finding (Not `#53` Regression)

- `npm run test:reference-api` (`scripts/reference-api-integration.mjs:204`) fails `92/93` since `0.0.90` (`b2d3f0b7`): `quotedCalls[0]` tests `<create_order id="'Att|ack'" .../>` expecting `Attack`, while line 204 searches `candidate.label === aiScript` (`'order.player.attack'`, whose order ID is `PlayerAttack`). Queue a clean isolated fix before `0.0.94`.

## Live Hazards & Environment Rules

- Shell starts in `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`: ALWAYS `Set-Location 'G:\Forge-QA\forge-development'` first and set `TEMP`, `TMP`, `npm_config_cache` to `G:\Forge-QA\temp...`.
- Node `v24.15.0` at `C:\Program Files\nodejs\node.exe`. Never use `$ErrorActionPreference = 'Stop'` around native `node`/`npm` piped to `2>&1`, never use `< NUL` in `pwsh`, and avoid piping long validation suites into `Select-Object -Last N`.
- `X4_REFERENCE_ROOT`: `G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`.
- `config/durable-writers.json` `sourceFingerprint` is `51213cb1c4a0f2ca1fb7cc6bf373da96d86b926f12448f59d64e5b9163cb6012`.

## Immediate Next Queue

1. Commit `#53` (`fix(discovery): isolate lab/release discovery and cache manifest corpus selection (#53)`).
2. Fix pre-existing `scripts/reference-api-integration.mjs:196-208` `quoted MD order ID` target label bug (`'Attack'` vs `aiScript`), verify `test:reference-api` `93/93`, and commit.
3. Run a realistic `44 MB` `x4_ai_influence`-scale fixture deploy benchmark (`G:\Forge-QA\temp\`) using `bench97` pattern to verify `#97` bound Apply latency and determine if `.forge-builds/loose` dual-write Unit 4 is needed.
4. Confirm Tier 1 release readiness (`#95`, `#105`, `#118`, `#131`, `#132` already have code+tests on `main` awaiting `0.0.94` packaged/IDE qualification) -> ask Machine-State Ask before building/upgrading `FORGE DEVELOPMENT` IDE (`G:\Forge-QA\development-ide`), updating Notion **Forge QA Field Log**, and proceeding to Tier 2 (`#61`, `#101`/`#71`, `#129`/`#114`, `#107`, `#55`, `#102`, `#64`) & Tier 3 (`#74`).
