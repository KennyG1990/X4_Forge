# Plan: Unified X4 Forge Product Version Standard, Full-History Build Provenance & Fail-Closed VSIX Version Gate

- **Status:** `SPECIFIED`
- **Date:** 2026-11-25
- **Owner:** Forge QA Agent
- **Lane:** `FULL`
- **Governing References:** Ken's canon order (`2026-11-25`: unify UI header + Open VSX on the extension release version `v<extVersion>`, tooltip `build <N> · <sha> · <date>`, plus fail-closed VSIX version gate), `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`, `vscode-extension/PUBLISHING.md`.

## 1. Baseline & Reconciliation

- **Baseline:** `f39a326` (`chore(release): publish x4-forge-studio v0.0.98`), `vscode-extension/package.json` = `"0.0.98"`, root `package.json` = `"1.0.0"`.
- **Reproduced Root Causes (`[REPRODUCED]`):**
  1. `vite.config.ts:19-42` computed `__APP_VERSION__` from `package.json` major.minor (`1.0`) + `git rev-list --count HEAD`. Releases `0.0.90`–`0.0.93` cut from `--depth 20` shallow clones froze `git rev-list --count HEAD` at `20` (`v1.0.20` baked into `0.0.93-universal`'s `index-arZ5K9fg.js`), while `G:\Forge-QA\forge-development` (`git rev-parse --is-shallow-repository === 'true'`, shallow graft at `408f254` missing `776` ancestor commits) baked regressed counts `1.0.70` (`0.0.94`), `1.0.74` (`0.0.95`), `1.0.78` (`0.0.96`), and `1.0.88` (`0.0.98`) — all lower than `0.0.57`'s `1.0.338` and disconnected from Open VSX's `0.0.9x` release numbers.
  2. `vite.config.ts:33` marked `git status --porcelain` dirty during `PUBLISHING.md`'s mandatory `publish-before-commit` step (when `vscode-extension/package.json` and `release-notes.json` are bumped prior to `npm run build`), baking `· uncommitted build` into published Open VSX bundles.
  3. `AGENTS.md:508` listed `bump -> changelog -> stage -> build`, omitting repo-root `npm run build` between `bump` and `stage`, and neither `vscode-extension/scripts/stage-app.mjs` nor `vscode-extension/scripts/inspect-vsix.mjs` checked client-bundle version parity or rejected shallow-checkout builds.
- **Resources & Couplings Checked:**
  - `vite.config.ts` (`__APP_VERSION__`, `__APP_BUILD__`) -> `src/vite-env.d.ts` -> `src/App.tsx:2689` (`v{__APP_VERSION__}` `title={__APP_BUILD__}`) & `src/App.tsx:3400-3401` (`'App version'`, `'Build'` bug-report context).
  - `server.ts:865-879` (`resolveForgeReceiptVersion`) & `vscode-extension/src/mcpBootstrap.ts:353` -> already read `vscode-extension/package.json` `.version` (`0.0.98`).
  - `vscode-extension/scripts/stage-app.mjs` -> stages `dist/` into `vscode-extension/app/dist/`.
  - `vscode-extension/scripts/inspect-vsix.mjs` -> final VSIX byte/metadata gate in both local `PUBLISHING.md` and CI `.github/workflows/quality.yml` (`fetch-depth: 0`).
  - `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` (byte-identical canon mirrors) & `vscode-extension/PUBLISHING.md`.
- **Capability-Map Delta:** `no capability-map delta` (build/release provenance and canon governance).

## 2. Bounded Scope & Non-Goals

### In Scope
1. **Unshallow `G:\Forge-QA\forge-development`:** Run `git fetch --unshallow` so `git rev-parse --is-shallow-repository` is `false` and `git rev-list --count HEAD` reflects true `main` history (`865+` commits).
2. **Canonical Build Identity (`vite.config.ts` & `src/vite-env.d.ts`):**
   - Set `APP_VERSION` from `vscode-extension/package.json` `.version` (falling back to root `package.json` `.version` only if absent), unifying UI header `v{__APP_VERSION__}`, bug reports, Open VSX, discovery, and validation receipts on one canonical semver.
   - Set `APP_BUILD` to `build <count> · <shortSha> · <YYYY-MM-DD>` (appending ` · uncommitted` only when tracked non-release-metadata files are dirty) when `git rev-parse --is-shallow-repository === 'false'`, and `shallow-checkout · <shortSha> · <YYYY-MM-DD>` when `'true'` (never fabricating a shallow commit count).
3. **Fail-Closed Staging & VSIX Inspector Gates (`stage-app.mjs` & `inspect-vsix.mjs`):**
   - Export and enforce `inspectClientBundleVersion` in `vscode-extension/scripts/stage-app.mjs`: verify `dist/assets/*.js` embeds `"App version" === vscode-extension/package.json.version` and a non-shallow `build <N> · <sha> · <date>` string before replacing `vscode-extension/app/`.
   - Export and enforce `inspectPackagedVersionIdentity` in `vscode-extension/scripts/inspect-vsix.mjs`: verify every `.vsix` contains `extension/app/dist/assets/*.js` whose embedded `"App version"` equals `extension/package.json` `.version`, rejects `1.0.20` / mismatched versions, rejects `shallow-checkout`, rejects `· uncommitted`, and requires full-history `build <N>` (`N >= 800`).
   - Add positive and negative unit assertions to both `stage-app.mjs --selftest` and `inspect-vsix.mjs --selftest`, plus a rendered header assertion in Playwright E2E (`tests/e2e/studio-shell.spec.ts`).
4. **Canon Documentation Sync (Operator Rule 5):**
   - Update `vscode-extension/PUBLISHING.md` and byte-mirror `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` with the unified version standard, mandatory unshallow checkout precondition, and exact post-bump root `npm run build` ordering.
5. **Public Release Qualification (`0.0.99`):**
   - Cut and publish `x4-forge-studio` **`0.0.99`** to Open VSX + GitHub (`main`) after all gates pass so Open VSX users and Ken's live IDE immediately receive `v0.0.99` in the header instead of `0.0.98`'s shallow `v1.0.88`.

### Out of Scope
- Changing mod workspace `content.xml` default version (`"1.0.0"`), capability schema versions, or server API wire schemas.

## 3. Acceptance Criteria & Validation Contract

1. `git -C G:\Forge-QA\forge-development rev-parse --is-shallow-repository` returns `false` and `rev-list --count HEAD >= 865`.
2. `node vscode-extension/scripts/stage-app.mjs --selftest` and `node vscode-extension/scripts/inspect-vsix.mjs --selftest` pass (`exit 0`), including negative rejection tests for:
   - Stale pre-bump client bundle (`0.0.98` bundle inside `0.0.99` extension)
   - Legacy `1.0.20` shallow bundle
   - `shallow-checkout` build metadata
   - `· uncommitted` dirty source build in `.vsix`
3. `npm run precommit:check`, `npm run test:writers`, `npm run test:action-receipt-coverage`, `npm run test:routes`, `npm run test:oracles`, and `npm run test:e2e` pass (`VERDICT: PASS`), including rendered UI verification that `[data-testid="studio-header"]` displays `v0.0.98` (pre-bump) / `v0.0.99` (release) with `title` matching `/^build \d{3,} · [0-9a-f]{7,} · \d{4}-\d{2}-\d{2}$/`.
4. Packaged `x4-forge-studio-0.0.99.vsix` passes `inspect-vsix.mjs` (`PASS`), `probe-staged-app.mjs` (`33/33 PASS`), publishes to Open VSX (`preRelease: false`, matching SHA-256), and hot-reloads / installs cleanly in `FORGE DEVELOPMENT`.

## 4. Planned Rollback
- Pre-publish code changes revert cleanly via `git checkout` / `git revert` on `vite.config.ts`, `src/vite-env.d.ts`, `vscode-extension/scripts/stage-app.mjs`, `vscode-extension/scripts/inspect-vsix.mjs`, `tests/e2e/studio-shell.spec.ts`, `vscode-extension/PUBLISHING.md`, and `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`. Post-publish Open VSX artifacts roll forward via patch bump (`0.0.100`).
