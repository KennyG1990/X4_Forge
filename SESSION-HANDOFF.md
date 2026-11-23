# Session Handoff — X4 Forge QA (`G:\Forge-QA\forge-development`)

## Active Project & Isolation Boundaries

- **Repo / Branch:** `G:\Forge-QA\forge-development` (`main`, releasing **`X4 Forge Studio 0.0.93`** from base `ea9f1697f63d0fbe19b912c2707b8b152e942cf5`).
- **Dev Environment:** Isolated Antigravity IDE **`FORGE DEVELOPMENT`** (`G:\Forge-QA\development-ide`, `x4forge.x4-forge-studio` currently `0.0.89` alongside `X4DevTools.x4codesense` `1.2.0`, mod `G:\Forge-QA\development-ide\mods\forge_deploy_workbench`, scratch game `G:\Forge-QA\development-ide\scratch-game`).
- **Untouched:** Live Forge (`C:\Users\Moshi\.antigravity-ide`), live Antigravity profile (`C:\Users\Moshi\AppData\Roaming\Antigravity IDE`), `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`, `AiLive`, X4 game install, and saves.

## `0.0.93` Release Status

- **Packaged VSIX:** `G:\Forge-QA\checkpoints\release-0.0.93-20261122\x4-forge-studio-0.0.93.vsix` (`27,743,512` bytes, SHA-256 `4e87d456c109ce89adc2ea0514a3cb68f98ad8a168314130fda893a13636d28d`, bundled `dist/server.cjs` SHA-256 `a2bdcaf948e21fbe4006d3e09897cfa8bf9ebc84b9598d6d827afbcc0ec3e22d`).
- **Gates Verified at `ea9f169` + `0.0.93` VSIX:**
  - Source E2E `150/150` (`source-e2e-corpus.json`), route integration `616/616` (`windows-build-routes.json`).
  - Compiled oracle sweep `134/134` (`0` red, negative controls `401`/`404`/`404`, `compiled-oracle-sweep.json`).
  - Compiled E2E `150/150`, `0` failed, `0` flaky, `ownershipComplete=true`, `treeGone=true`, ports `3100`/`3101` `VACANT_EXCLUSIVE` (`compiled-e2e.json`).
  - Staged app probe `33/33`, `npm audit --prefix app --omit=dev --audit-level=high` exit `0`, VSIX inspection `2,173` entries (`78,224,419` unpacked bytes).
  - Installed off-screen Antigravity `0.0.93` Lua witness (`installed-lua-witness-093.json`): `2,172` files installed (`treeEmpty=true`), exact file/process hashes verified, `md_lua.payload_writer_unverified` (`Information`) observed on `md/orders_witness.xml` when `AddUITriggeredEvent = decorate(AddUITriggeredEvent)` is present, cleared on unsaved buffer edit (`doc.isDirty === true`), restored on `undo`, all 4 disk files byte-identical, `x4forge.stopSidecar` cleaned `discovery/latest.json`, `phaseRetired=true`.
- **Remaining Open Scope on Included Issues:** `#71`, `#101`, and `#137` stay open for dynamic wrapper tracing, consumer confirmation, and long workspace-stall attribution.

## Next Actionable Worklist (Post-`0.0.93` Release)

1. **Tier 1 — Native Deploy Cutover & Blockers (`#85`, `#97`, `#53`, `#131`, `#132`, `#95`, `#105`, `#118`):**
   - Check/update `FORGE DEVELOPMENT` IDE (`0.0.89` -> released `0.0.93`) and verify `#85` native deploy flow on `forge_deploy_workbench` alongside X4CodeSense `1.2.0`, recording candid friction in the Notion **Forge QA Field Log**.
   - **Next top blocker (`#97`):** `deployVerifyHandler` (`server.ts:16156-16547`) still re-runs full `buildDeployProjectValidation` before identity verification and runs `runExtensionDoctor` (`server.ts:9092-9250`) across enabled installed mods even on preview-bound Apply (`dryRun: false`). Reproduce double-validation / Apply latency on a multi-file mod fixture and reuse verified preview validation safely when source/artifact/binding/corpus/rules hashes match.
   - **`#53`:** `GET /api/reference/status` (`src/server/referenceRoutes.ts:207-224`) synchronously calls `load(req)` and `getReferenceManifestStatus(...)`; add/verify non-blocking liveness/host-kind status so external clients do not misdiagnose busy corpus loading as a dead sidecar.
   - Note from source reconciliation: `#106` (`destructiveRecovery.ts:205` hex clock) and `#132` (`ReleaseCenter.tsx:244-249` `STEAM_WORKSHOP_ID_MISSING` Verify retention) are present in `main` and need installed verification rather than re-implementation.
2. **Tier 2 & Tier 3 — Validation Coverage & `#74` X4CodeSense Parity:**
   - Reconcile and close remaining gaps on `#61` (registered checks + UI Lua checks), `#101`/`#71`, `#129` (`md.variable_initial_state` review noise), `#107`/`#55` installed checks, and `#74` P0–P3 outcomes (`#125`, `#126`, `#127`, `#130` installed parity; `#77`, `#78`, `#80`, `#81`, `#82`, `#83`, `#84`, `#70`, `#72`, `#73`, `#64`, `#66`, `#93`).
   - Track Claude's `READY` batches on X4 Forge Agent Board (`#122`, `#111/#114/#130`, `#74 layout A`, `#102`, `#85` wrapper `a5cd0ecd` ACK) without polling or exceeding the 20-row cap.

## Live Hazards & Lessons

- Always set `PATH=C:\Users\Moshi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:PATH`, `X4_FORGE_E2E_NODE_PATH` (`v24.22.1`, `libuv 1.52.1`), `X4_REFERENCE_ROOT=G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`, and `TEMP`/`TMP`/`npm_config_cache` on `G:\Forge-QA` when running E2E.
- Never set `$ErrorActionPreference = "Stop"` around native `npm` / Playwright invocations piped with `2>&1`.
- Never cite `netstat` `PID 0` rows as occupied ports; verify vacancy via Node exclusive loopback bind.
