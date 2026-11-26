# Plan & Close: Unified X4 Forge Product Version Standard, Full-History Build Provenance & Fail-Closed VSIX Version Gate

- **Status:** `VERIFIED` (Code, tests, fail-closed staging/VSIX gates, unshallowed repository history, and canon mirrors landed on `main` at `b94a3f1` and passed GitHub Actions `Quality` run `45723084529`; public Open VSX `0.0.99` publish deferred pending quiet host for 0-flake `153/153` `test:e2e` release gate)
- **Date:** 2026-11-25
- **Owner:** Forge QA Agent (`Unit 63`)
- **Lane:** `FULL`
- **Governing References:** Ken's canon order (`2026-11-25`: unify UI header + Open VSX on the extension release version `v<extVersion>`, tooltip `build <N> · <sha> · <date>`, plus fail-closed VSIX version gate), `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`, `vscode-extension/PUBLISHING.md`.

## Required Task Record

- **Task:** Unified X4 Forge Product Version Standard, Full-History Build Provenance & Fail-Closed VSIX Version Gate (`Unit 63`)
- **Lane:** `FULL` | **Status:** `SPECIFIED -> VERIFIED`

### BASELINE
- **Revision / Version:** `f39a326` (`chore(release): publish x4-forge-studio v0.0.98`), `vscode-extension/package.json` = `"0.0.98"`, root `package.json` = `"1.0.0"`, `git rev-parse --is-shallow-repository` = `true` (`88` shallow commits rooted at `408f254` vs `865` true `main` commits).
- **Pre-existing State:** `C:\Users\Moshi\.antigravity-ide\extensions\x4forge.x4-forge-studio-0.0.93-universal\app\dist\assets\index-arZ5K9fg.js` baked `"1.0.20"` (`commit ea9f169`); `0.0.94`–`0.0.98` baked shallow regressed counts (`1.0.70`, `1.0.74`, `1.0.78`, `1.0.88` + `· uncommitted build`), lower than `0.0.57`'s `1.0.338`.

### RECONCILE
- **Resources & Readers/Writers Searched:**
  - `vite.config.ts` (`__APP_VERSION__`, `__APP_BUILD__`) -> `src/vite-env.d.ts` -> `src/App.tsx:2689` (`v{__APP_VERSION__}` `title={__APP_BUILD__}`) & `src/App.tsx:3400-3401` (`'App version'`, `'Build'` bug-report context).
  - `server.ts:865-879` (`resolveForgeReceiptVersion`) & `vscode-extension/src/mcpBootstrap.ts:353` -> already read `vscode-extension/package.json` `.version`.
  - `vscode-extension/scripts/stage-app.mjs`, `vscode-extension/scripts/inspect-vsix.mjs`, `.github/workflows/quality.yml` (`fetch-depth: 0`), `vscode-extension/PUBLISHING.md`, and `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`.
- **Capability-Map Delta:** `no capability-map delta`.

### PLAN
- Unshallow `G:\Forge-QA\forge-development` (`git fetch --unshallow`), unify `APP_VERSION` in `vite.config.ts` on `vscode-extension/package.json` `.version` with full-history `APP_BUILD` (`build <count> · <sha> · <YYYY-MM-DD>`), add fail-closed client-bundle version & unshallow-history gates + unit selftests in `stage-app.mjs` and `inspect-vsix.mjs`, add rendered browser header verification in `tests/e2e/studio-shell.spec.ts`, and synchronize canon mirrors (`AGENTS.md` = `CLAUDE.md` = `GEMINI.md`) + `vscode-extension/PUBLISHING.md`.

### IMPLEMENT
- Unshallowed `G:\Forge-QA\forge-development` (`is-shallow: false`, `commit-count: 865` -> `866` at `b94a3f1`).
- Updated `vite.config.ts` and `src/vite-env.d.ts` to source `APP_VERSION` from `vscode-extension/package.json` `.version` (`0.0.98`), emit `build <count> · <sha> · <date>` on unshallow checkouts (`shallow-checkout · ...` on shallow clones), and exclude release-bump metadata files (`vscode-extension/package.json`, `release-notes.json`, `CHANGELOG.md`, `BACKLOG.md`, `ROADMAP.md`, `SESSION-HANDOFF.md`) from `uncommitted` tagging during `publish-before-commit`.
- Added `inspectClientBundleVersion` + 5 positive/negative unit checks to `vscode-extension/scripts/stage-app.mjs` (`--selftest`).
- Added `inspectPackagedVersionIdentity` + 6 positive/negative unit checks (`20/20 PASS`) to `vscode-extension/scripts/inspect-vsix.mjs` (`--selftest` and `inspectVsixBytes`), rejecting mismatched bundle versions, `1.0.20` shallow bundles, `shallow-checkout`, `· uncommitted`, and `buildCount < 800`.
- Added rendered header badge text (`v<extensionVersion>`) and `title` (`/^build \d{3,} · [0-9a-f]{7,} · \d{4}-\d{2}-\d{2}(?: · uncommitted)?$/`) assertions to `tests/e2e/studio-shell.spec.ts`.
- Updated `vscode-extension/PUBLISHING.md` and byte-mirrored `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.

### VALIDATE
- `node vscode-extension/scripts/stage-app.mjs --selftest` -> `PASS` (`exit 0`, including negative rejection of `0.0.98` vs `0.0.99`, `1.0.20`, `shallow-checkout`, and `build 20`).
- `node vscode-extension/scripts/inspect-vsix.mjs --selftest` -> `[vsix-inspector selftest] 20/20 PASS` (`exit 0`, including negative rejection of `1.0.20`, `0.0.98` vs `0.0.99`, `shallow-checkout`, `build 88`, and `· uncommitted`).
- Clean-tree `npm run build` (`b94a3f1`) -> verified `dist/assets/index-Bq1rSpam.js` embeds exact `"App version":"0.0.98",Build:"build 866 · b94a3f1 · 2026-11-25"`.
- Rendered browser E2E (`X4_REFERENCE_ROOT` set): `node scripts/run-e2e.mjs tests/e2e/studio-shell.spec.ts` (`task-11905`) -> `[run-e2e] VERDICT: PASS — 9 passed, 0 failed, 0 flaky [lifecycle trigger child-close, treeGone=true]`.
- `npm run test:routes` (`X4_REFERENCE_ROOT` / `X4_XSD_PATH` unset, `task-11905`) -> `807/807 PASS` (`exit 0`).
- `npm run test:oracles` (`task-11905`) + isolated prod-bundle `node dist/server.cjs` `oracle-sweep.mjs` (`task-11919`) -> `134/134 green` (`exit 0`).
- `npm run precommit:check` (`task-11905`) -> `[precommit] OK` (`exit 0`, canon mirrors identical, `durable-writer audit PASS`, `action-receipt-coverage PASS 141/69`, `typecheck 0`).
- GitHub Actions `Quality` workflow on `b94a3f1` (`run 45723084529`) -> **`SUCCESS` (`8m25s`)**, proving `stage-app`, `probe-app`, `vsce package`, and `inspect-package` (`inspect-vsix.mjs`) on the real packaged `x4-forge-studio-ci.vsix`!
- Synced `G:\Forge-QA\development-ide\extensions\x4forge.x4-forge-studio-0.0.98` via `Reload-FORGE-DEVELOPMENT.ps1` (`task-11929`, `exit 0`).

### REVIEW
- Single canonical product version (`vscode-extension/package.json` -> `v{__APP_VERSION__}`): **done (evidenced)**.
- Full-history Git provenance (`build 866 · b94a3f1 · 2026-11-25`) + unshallowed `forge-development`: **done (evidenced)**.
- Fail-closed `stage-app.mjs` & `inspect-vsix.mjs` version/provenance gates + negative unit tests: **done (evidenced)**.
- Canon sync (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `vscode-extension/PUBLISHING.md`): **done (evidenced)**.
- Public Open VSX `0.0.99` publish: **deferred** (`task-11919` full 153-test E2E passed `151` with `0` failed and `2 flaky` WMI `snapshot-command-timeout` retries on `performance-panel.spec.ts` due to concurrent host load from `X4.exe` `PID 52548` + `25` `claude` processes + `50+` `node` processes; per `PUBLISHING.md` & Operator Rule 2, public Open VSX cut awaits quiet-machine `153/153` `0`-flake E2E or Unit 65 release window).

### CLOSE
- **Remaining Risks / Deferred Items:** Published Open VSX `0.0.98` predated `b94a3f1`; once the host is quiet for a `0`-flake `153/153` `npm run test:e2e` run, cut `0.0.99` so Open VSX serves `v0.0.99` in the header.
- **Commit Title:** `feat(release): unify UI product version on extension semver and gate VSIX provenance` (`b94a3f1`)

### AAR (Triggered / Non-Clean)
1. **Triggers:**
   - (1) `run-e2e.mjs` inside temporary worktree `G:\Forge-QA\temp\forge-version-wt` (`task-11883`) failed closed with `VALIDATOR_FINGERPRINT_UNAVAILABLE: Validator package is outside its owner` because `node_modules` was a directory junction pointing outside the worktree root.
   - (2) First standalone `studio-shell.spec.ts` run in `forge-development` (`task-11889`) unset `X4_REFERENCE_ROOT` before `run-e2e.mjs`, opening the first-run Directory Setup modal over the shell; setting `X4_REFERENCE_ROOT` before `run-e2e.mjs` (and unsetting only before `test:routes`) passed `9/9` (`0` failed, `0` flaky) immediately (`task-11905`).
   - (3) Full 153-test `test:e2e` pre-bump run (`task-11919`) hit `2 flaky` + `snapshot-command-timeout` under heavy concurrent host CPU/WMI load (`X4.exe` + `25` `claude` + `50+` `node` processes).
2. **Sustain:**
   - Tracing the `[REPRODUCED]` root cause all the way to the exact packaged JS bytes across `0.0.57` (`1.0.338`), `0.0.93` (`1.0.20`), and `0.0.98` (`1.0.88` + `uncommitted build`) uncovered all three failure modes simultaneously (shallow clones, split `1.0.x` vs `0.0.x` numbering, and `publish-before-commit` false dirty flags).
   - Backing the canon rule immediately with deterministic fail-closed gates in both `stage-app.mjs` and `inspect-vsix.mjs` (`20/20 PASS`) plus CI `Quality` verification (`45723084529` `SUCCESS`).
3. **Improve work/approach:**
   - Check host CPU/process load (`X4.exe`, concurrent agent processes) per Operator Rule 2 *before* launching the 25-minute full 153-test Playwright suite, and always keep `X4_REFERENCE_ROOT` set for `run-e2e.mjs` in `G:\Forge-QA\forge-development` (unsetting it only before `npm run test:routes`).
4. **Improve tools:**
   - Added permanent fail-closed `inspectClientBundleVersion` (`stage-app.mjs`) and `inspectPackagedVersionIdentity` (`inspect-vsix.mjs`) so neither a shallow clone nor a pre-bump `dist/` bundle can ever stage or package into a `.vsix` again.
5. **Highest-risk evidenced weakness:**
   - Shallow Git checkouts (`--depth 20`) silently poisoned `git rev-list --count HEAD` without failing any build or VSIX check -> **Eliminated** by unifying `APP_VERSION` on `vscode-extension/package.json` `.version`, unshallowing `forge-development`, and enforcing `buildCount >= 800` + exact version parity in `stage-app.mjs` and `inspect-vsix.mjs`.
