# Plan & Close: Extension First-Class Sidecar Restart & Live `forgeRoot` Dev-Reload Trigger

- **Status:** `VERIFIED`
- **Date:** 2026-11-24
- **Owner:** Forge QA Agent (`Unit 44`)
- **Lane:** `FULL`
- **Related Issues:** `#53` (extension/sidecar lifecycle), `#19` (UI/extension parity inventory), live `FORGE DEVELOPMENT` IDE workflow

## 1. Bounded Scope & Non-Goals

### In Scope
1. Add first-class IDE command `x4forge.restartSidecar` (`"X4 Forge: Restart Local Backend"`) in `vscode-extension/package.json` and `vscode-extension/src/extension.ts` (`viewsWelcome` + Command Palette) that gracefully stops the owned sidecar (`stoppingDeliberately = true`), clears `restartTimestamps`, awaits sidecar retirement, restarts via `ensureBackend(context, savedWorkspaceId)`, and re-binds all open Studio webview panels.
2. Add `vscode-extension/src/devReloadTrigger.ts` (`createDevReloadWatcher`, `parseDevReloadSignal`, `DEV_RELOAD_SENTINEL_RELPATH = 'test-results/.forge-dev-reload'`) activated only when `x4forge.forgeRoot` points to a valid directory. Placing the gitignored sentinel under `test-results/` keeps `dist/` strictly clean for staging and survives `vite build --emptyOutDir`.
3. Update `src/lib/forgeCapabilities.ts` (`extension.sidecar.lifecycle` parity anchors/commands; UI-action parity SHA-256 `1adfc8fa896fcdada95427955cc944a406d556f5a1a107cb4b9c659ea4823974`).
4. Add deterministic tests in `scripts/extension-dev-reload.selftest.ts` (`npm run test:extension-dev-reload`, wired in `.github/workflows/quality.yml`).

### Out of Scope
- Headless agent/MCP bootstrap of the IDE extension host itself (`#53` broader scope).
- Watching raw `src/` TypeScript files inside the extension host (compilation belongs to `npm run build` / `Reload-FORGE-DEVELOPMENT.ps1`; the sentinel triggers atomically *after* both Vite UI and `dist/server.cjs` builds complete so mid-build partial writes are never loaded).

## 2. Existing Infrastructure Reused
- `stopOwnedSidecar`, `awaitManagedSidecarRetirement`, `ensureBackend`, `panelBinding.track`, and `restartTimestamps` in `vscode-extension/src/extension.ts`.
- `UI_SURFACE_PARITY_INVENTORY` (`extension.sidecar.lifecycle`) in `src/lib/forgeCapabilities.ts`.

## 3. Close & Validation Evidence (`VERIFIED`)

- **Baseline:** `74c1a6b1265319faeb19222a276e4d9194689b9e` (`main == origin/main`), clean worktree.
- **Capability-Map Delta:** `extension.sidecar.lifecycle` in `FORGE_UI_ACTION_PARITY_CENSUS` updated to include `x4forge.restartSidecar` (`UI-action parity SHA-256: 1adfc8fa896fcdada95427955cc944a406d556f5a1a107cb4b9c659ea4823974`; `109` canonical capabilities and Contract SHA-256 `d3e41cb6bde50e421f64fe1c534654b4d913481583f7b307ad0d012f93df8367` unchanged; `50` raw writers and `config/action-receipt-coverage.json` `139/69` unchanged).
- **Validation Gates:**
  - `npm run build --prefix vscode-extension` -> `0` (`extension.js + sidecar-supervisor.js written from a fresh out/`).
  - `npm run test:extension-dev-reload` (`scripts/extension-dev-reload.selftest.ts`) -> `6/6 PASS` (empty `forgeRoot` inactive, startup pre-existing sentinel ignored, `5x` consecutive reloads across sentinel directory deletion+recreation, serialized overlapping reload queue, negative-path malformed/missing inputs refused, manifest `x4forge.restartSidecar` contract).
  - `npm run test:extension-capabilities` -> `8/8 PASS`.
  - `npm run test:extension-backend-recovery` -> `39/39 PASS`.
  - `npm run test:writers` -> `30/30 + PASS + 8/8`.
  - `npm run test:capabilities` -> `PASS` (`109` capabilities, `398` routes, `110` MCP aliases, `51` UI-action parity rows).
  - `npm run test:action-receipt-coverage` -> `PASS` (`139` routes, `69` surfaces).
  - `npm run build` + `npm run typecheck` + `npm run lint -- --max-warnings 600` -> `0` errors.
  - `npm run test:oracles` -> `134/134 PASS`.
  - `npm run precommit:check` -> `[precommit] OK`.
  - **Live Installed `FORGE DEVELOPMENT` IDE Proof (`G:\Forge-QA\development-ide`, `Antigravity IDE 1.107.0` PID `2908`):**
    - Verified `[dev-reload] watcher active on G:\Forge-QA\forge-development\test-results\.forge-dev-reload` in `3-X4 Forge.log`.
    - Executed `4` consecutive live reloads in `19s` (`PID 39180 -> 38408 -> 48520 -> 48088 -> 46568`; ports `51012 -> 49538 -> 56098 -> 56891 -> 59274`), exceeding `RESTART_MAX = 3` with `code=0` graceful shutdowns, automatic Studio webview panel re-binding (`studio panel bound to http://127.0.0.1:59274`), preserved workspace authority (`ws_28c39084ba66bfa23c698dd3`), and `0` crash-watchdog notifications.

## 4. AAR (Triggered — Environment Isolation Discovery During Live IDE Bring-Up)

1. **Points to sustain:** Catching `[REPRODUCED]` `autoRestartSidecar` `RESTART_MAX = 3` / `5m` crash-loop cap and `vite build --emptyOutDir` directory-recreation behavior before finishing the live-reload workflow turned a fragile `Stop-Process` hack into a first-class, unlimited, zero-crash-popup IDE capability (`x4forge.restartSidecar` + `test-results/.forge-dev-reload`).
2. **Points to improve — work/approach:** On the initial `Launch-FORGE-DEVELOPMENT.ps1` attempt, launching `Antigravity IDE.exe` from an agent subshell inherited `ELECTRON_RUN_AS_NODE=1` + `VSCODE_IPC_HOOK` and left `USERPROFILE` pointing at `C:\Users\Moshi`, causing `agy.exe --hub` in the child IDE to touch the shared `~/.gemini/antigravity` directory once.
3. **Points to improve — tools:** Hardened `G:\Forge-QA\development-ide\Launch-FORGE-DEVELOPMENT.ps1` to scrub `ELECTRON_*`, `VSCODE_*`, `ANTIGRAVITY_*`, and `CHROME_CRASHPAD_*` and isolate `USERPROFILE`, `HOME`, `APPDATA`, `LOCALAPPDATA`, and `ANTIGRAVITY_APP_DATA_DIR` under `G:\Forge-QA\development-ide\home`, plus documented `IsDaemon: true` + `-HoldOpen` for persistent agent-launched GUI sessions.
4. **Highest-risk observed weakness:** Cross-instance `USERPROFILE` sharing on Windows (`os.homedir()` in Go/Node reads `USERPROFILE`, not `HOME`), which let a second Antigravity IDE instance contend with the primary IDE's `~/.gemini/antigravity` hub and OAuth refresh token (`notion_notion` `invalid_grant`). Mitigated permanently in `Launch-FORGE-DEVELOPMENT.ps1` by isolating `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`.
