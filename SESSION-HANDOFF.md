# Session Handoff — X4_Forge (`G:\Forge-QA\forge-development`)

- **Updated:** 2026-11-23
- **Branch / HEAD (before Unit 3 commit):** `main` (`2fe05cf` + local `#97` Unit 3 close/commit next)
- **Active Project:** `X4_Forge` (Forge QA / Dev ownership; NOT `X4_AiLive`, NOT `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`)
- **Isolated IDE State:** `FORGE DEVELOPMENT` (`PID 34076`, `G:\Forge-QA\development-ide`) still running `0.0.89` with `X4CodeSense 1.2.0` side-by-side. Do NOT restart/upgrade until Machine-State Ask authorizes release/IDE qualification.

## Completed Units Since `0.0.93` (`e9c12e1`)

1. **`1405c14` — MCP stdio EOF Windows teardown crash:** Natural stream drain via `discoveryController` abort + `process.stdin.destroy()` in `vscode-extension/mcp/x4forge-mcp.cjs`; capability audit bumped `MCP_MODULE_AUDIT_VERSION` `22 -> 23`.
2. **`14b5795` — `#97` Unit 1:** Buffer reuse in `src/lib/artifactPipeline.ts`, recovery walk reuse in `src/server/deploymentTrust.ts`, static corpus digest in `server.ts`. (`apply1` `37.39s -> 30.82s`, `apply2` `36.10s -> 31.70s`.)
3. **`2fe05cf` — `#97` Unit 2:** Bound-Apply preview validation cache (`deployPreviewValidationCache`) + `assertWriteAuthority(true)` / staging entry barrier coalescing (`sourceRechecks` `7 -> 5`), plus 5 route tests in `scripts/route-integration.mjs`. (`apply1` `30.82s -> 25.77s`, `apply2` `31.70s -> 26.38s`.)
4. **Unit 3 (`docs/plans/2026-11-23-deploy-unit3-tree-verification-fusion.md`) — `#97` Unit 3:** Single-pass `regularTreeExpectedAndFingerprint` / `verifyExpectedFilesAndFingerprint`, `artifactStage?.fingerprint` reuse, `targetCheck === 1` entry barrier coalescing (`sourceRechecks` `5 -> 4`), and positive+negative checks in `runCompileArtifactSelftest`. `bench97` (`1,000` files + X4 9.00): `apply1` `23.36s (-37.5%)`, `apply2` `25.19s (-30.2%)`. Verified: `lint`, `test:writers` (`30/30` + `8/8`), `test:oracles` (`134/134`), `test:routes` (`621/621`), `precommit:check`.

## Live Hazards & Environment Rules

- Shell starts in `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`: ALWAYS `Set-Location 'G:\Forge-QA\forge-development'` first and set `TEMP`, `TMP`, `npm_config_cache` to `G:\Forge-QA\temp...`.
- Node `v24.15.0` at `C:\Program Files\nodejs\node.exe`. Never use `$ErrorActionPreference = 'Stop'` around native `node`/`npm` piped to `2>&1`, never use `< NUL` in `pwsh`, and avoid piping long validation suites into `Select-Object -Last N` (buffers all live output).
- `X4_REFERENCE_ROOT`: `G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`.
- `server.ts` raw fs audit (`config/durable-writers.json`): `191` raw fs calls (`headCount=191`); reuse `fixtureWrite` in selftests to avoid changing writer counts, and refresh `sourceFingerprint` after inspecting diff slices when lines near a raw fs call change.
- Benchmark artifacts live in `G:\Forge-QA\temp\`: `bench97-baseline.json`, `bench97-unit1-after.json`, `bench97-unit2-after.json`, `bench97-unit3-after.json`.

## Immediate Next Queue

1. Commit `#97` Unit 3 cleanly (`perf(deploy): fuse tree verification walks and coalesce target entry barrier (#97)`).
2. Reconcile & implement remaining `#53` (FF-14) gap — check `GET /api/reference/status` synchronous `load(req)` blocking behavior during cold/busy corpus indexing and public `instance` identity (`discoveryDir`, `hostKind`/mode semantics) against remaining `#53` acceptance items post-`4bf0306` (`0.0.91`/`0.0.93`).
3. Audit open Tier 1 issues (`#131`, `#132`, `#95`, `#105`, `#118`, `#85`) + benchmark `#97` on a realistic `44 MB` multi-asset fixture matching `x4_ai_influence` before qualifying `0.0.94` VSIX/IDE upgrade (with Machine-State Ask) and moving to Tier 2 & `#74`.
