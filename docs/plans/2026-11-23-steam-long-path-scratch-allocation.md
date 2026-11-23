# Steam Preparation Long Windows Workspace Path Scratch Allocation (#118)

**Status:** `PARTIAL` (Dev source & isolated HTTP/compiled build `VERIFIED`; `#118` remains `PARTIAL` pending `0.0.94` full E2E & installed IDE qualification)
**Owner:** GitHub `#118` (child of Release Center `#37`, related `#20`)
**Lane:** `FULL`

## PLAN
- **Bounded unit:** Apply `path.toNamespacedPath(...)` strictly at the validated `fs.mkdtempSync(...)` syscall boundary for same-volume Steam release scratch allocation in `server.ts:17973`, project the returned directory back to its ordinary logical path under `steamRoot` (`path.join(steamRoot, path.basename(...))`), and guard containment with `isPathWithin(scratchParent, steamRoot)`. Update `config/durable-writers.json` `sourceFingerprint` (zero raw FS call count delta) and add end-to-end HTTP long-path Steam preparation, verification, adoption, cleanup, and refusal tests to `scripts/route-integration.mjs`.
- **Assumptions & References:**
  - Issue `#118`: Node `fs.mkdtempSync` on Windows omits extended-length `\\?\` namespace conversion, throwing `ENOENT` -> HTTP `500 STEAM_RELEASE_FAILED` when `steamRoot` pushes the `.modId.x4forge-steam-next-` scratch prefix past `260` characters (`225`-char parent -> `273`-char target).
  - Node `v24.15.0` empirical probe on `G:\Forge-QA\temp` confirmed: with `realSteamLen: 239` and `prefixLen: 285`, plain `fs.mkdtempSync(prefix)` fails with `ENOENT`, while `fs.mkdtempSync(path.toNamespacedPath(prefix))` followed by `path.join(realSteam, path.basename(created))` yields a `291`-char logical `scratchParent` and `316`-char `scratchArtifact` that succeed cleanly through `materializeCatalogArtifact`, `buildArtifactPlan`, `verifyMaterializedArtifact`, `fs.renameSync` (including replacement backup dir at `308` chars), `createNexusArchive`, `atomicWriteFile`, `atomicWriteJson`, and `fs.rmSync`.
  - On POSIX, `path.toNamespacedPath` is a no-op and `path.join(steamRoot, path.basename(...))` preserves exact ordinary behavior.
- **In scope:**
  - `server.ts`: Steam scratch `mkdtempSync` syscall boundary + `isPathWithin` containment check.
  - `config/durable-writers.json`: `sourceFingerprint` sync (zero call count changes).
  - `scripts/route-integration.mjs`: isolated Windows long-path (`>= 273`-char scratch prefix) Steam prepare, backup ZIP download/hash verification, post-tool verify (`409 STEAM_WORKSHOP_ID_MISSING` -> `200 VERIFIED_AFTER_WORKSHOP_TOOL`), guarded source adoption preview/apply, scratch cleanup verification (zero `.x4forge-steam-next-*` orphans), ordinary non-`\\?\` public paths, plus preserved stale-source (`409 RELEASE_SOURCE_STALE`) and unsafe-root (`409 RELEASE_OUTPUT_ROOT_UNSAFE`) negative controls.
- **Out of scope:** Broadening allowed user paths, modifying `resolveReleaseOutputRoot` symlink/containment policy, replacing `replaceReleaseDirectory`, running Steam/WorkshopTool, touching live Forge / `FORGE DEVELOPMENT` IDE (`PID 34076`) / X4 install / saves, pushing or publishing.
- **Risks & Rollback:**
  - Risk 1: Leaking Windows `\\?\` prefix into returned `targetPath`, `backupPath`, `reportPath`, `command.display`, or `isPathWithin` checks. Mitigated by projecting back to `path.join(steamRoot, path.basename(...))` immediately and explicitly asserting `!path.startsWith('\\\\?\\')` in route tests.
  - Risk 2: `config/durable-writers.json` `sourceFingerprint` drift around `server.ts:17973`. Mitigated by running `npm run test:writers` and syncing only `sourceFingerprint` with zero call-count delta.
  - Rollback: Revert this single bounded commit against `1120ed5`.
- **Acceptance Criteria:**
  1. `POST /api/agent/release/steam/prepare` succeeds (`200`) on a valid long Windows workspace path whose Steam scratch prefix exceeds `260` characters (`>= 273` chars), completing CAT/DAT build, preview staging, target promotion, rollback ZIP export, and scratch cleanup with zero `.x4forge-steam-next-*` directories left behind.
  2. Public paths (`targetPath`, `backupPath`, `reportPath`, `command.display`) remain ordinary logical paths inside `steamRoot` without `\\?\` prefixes.
  3. Existing short-path Steam prepare, backup export, verify (`409` missing ID -> `200` verified), guarded adoption, stale-source refusal (`409 RELEASE_SOURCE_STALE`), and unsafe release-root refusal (`409 RELEASE_OUTPUT_ROOT_UNSAFE`) all continue to pass.
  4. All static, writer, capability, receipt, oracle, route, build, and precommit gates pass post-edit.
- **Required Validation & Negative Paths:**
  - `npm run typecheck`
  - `npx eslint server.ts` (`0` errors)
  - `npm run test:writers` (`30/30` + `PASS` + `8/8`)
  - `npm run test:capabilities` (`PASS`)
  - `npm run test:action-receipt-coverage` (`PASS`)
  - `npm run test:oracles` (`134/134`, `X4_*` unset)
  - `npm run test:routes` (`634/634`, `X4_*` unset, including new long-path Steam prepare/verify/adopt/cleanup + negative controls)
  - `npm run build` (`dist/server.cjs` bundles cleanly)
  - `npm run precommit:check` (`[precommit] OK`, `X4_*` unset)
- **Evidence Locations:** `docs/plans/2026-11-23-steam-long-path-scratch-allocation.md`, `BACKLOG.md`, `SESSION-HANDOFF.md`, Notion **Forge QA Field Log** (`4124618ed15b8131bdd5ff6aabefbd6d`).

## BASELINE
- Commit: `1120ed5` on `main` in `G:\Forge-QA\forge-development`, clean working tree.
- Reproduced baseline failure on Windows Node `v24.15.0`: `realSteamLen: 239`, `prefixLen: 285` -> `fs.mkdtempSync(prefix)` threw `ENOENT`, matching issue `#118` (`server.ts:17973`).

## RECONCILE
- Searched every `mkdtempSync` call across `server.ts`, `src/`, and `scripts/`: `server.ts:17973` is the sole production `mkdtempSync` allocating beneath a user-configured workspace directory (`steamRoot`) rather than `os.tmpdir()`.
- Verified `resolveReleaseOutputRoot` (`server.ts:17683-17697`) already validates every path component under `modWorkspacePath` as regular non-symlink directories within `workspaceRoot`.
- Verified downstream calls (`materializeCatalogArtifact`, `buildArtifactPlan`, `verifyMaterializedArtifact`, `replaceReleaseDirectory`, `createNexusArchive`, `atomicWriteFile`, `atomicWriteJson`, `fs.rmSync`) handle `264–316`-char logical Windows paths cleanly on Node `v24.15.0`.
- Capability-map delta: `no capability-map delta`.

## IMPLEMENT
- **`server.ts` (`lines 17973-17977`):** Replaced bare `fs.mkdtempSync(path.join(steamRoot, ...))` with `fs.mkdtempSync(path.toNamespacedPath(scratchPrefix))`, immediately projected back to ordinary logical `path.join(steamRoot, path.basename(...))`, and enforced `isPathWithin(scratchParent, steamRoot)` before staging.
- **`config/durable-writers.json`:** Updated `sourceFingerprint` (`97bb4caec9be084b54a49358f96bd7831add0f6b96cd621b6ac390a472b15050 -> 9090a2becaf3836219e0f70502219542f69d04f2d793e83070967c3ef24a3f28`), with zero raw FS call count delta (`mkdtempSync: 9`).
- **`scripts/route-integration.mjs` (`lines 5561-5657`):** Added 10 real HTTP checks (`prefixLen=281`) covering long-path workspace configuration, disk import, initial `PARTIAL` Steam prepare, repeat `READY_FOR_INTERACTIVE_UPLOAD` Steam prepare (target replacement + scratch/backup cleanup + ordinary non-`\\?\` public paths/commands), rollback ZIP download hash match, missing-ID verify refusal (`409 STEAM_WORKSHOP_ID_MISSING`), post-tool Workshop ID verification (`200 VERIFIED_AFTER_WORKSHOP_TOOL`), guarded source adoption (`409 STEAM_ADOPTION_PREVIEW_CHANGED` without binding -> `200 VERIFIED_AND_ADOPTED`), stale-source refusal (`409 RELEASE_SOURCE_STALE`), and symlink/junction release-root refusal (`409 RELEASE_OUTPUT_ROOT_UNSAFE`), restoring `deployedRolesConfig` in `finally`.

## VALIDATE
All checks executed strictly post-final-edit (`task-3979` & `task-3984`, exit `0`):
- `npm run typecheck` -> exit `0`
- `npx eslint server.ts` -> exit `0` (`0` errors, `241` pre-existing warnings)
- `npm run test:writers` -> `[durable-writer audit selftest] 30/30`, `[durable-writer audit] PASS` (`50` raw FS sources), `durableWrite selftest: 8/8 allPassed=true`
- `npm run test:capabilities` -> `Capability contract audit PASS: 25 capabilities, 318 disposed literal routes, 1 reviewed dynamic registrar(s), 23 MCP aliases.`
- `npm run test:action-receipt-coverage` -> `PASS` (`routeCount: 98, surfaceCount: 69`)
- `npm run test:oracles` (`X4_*` unset) -> `[oracle-sweep] 134/134 green`
- `npm run test:routes` (`X4_*` unset) -> `[route-integration] 634/634 PASS` (`prefixLen=281`, all 10 `steam_long_path_*` checks + all short-path Steam/Nexus checks green)
- `npm run build` -> `dist/server.cjs` (`5.2 MB`) & `dist/canonical-md-worker.cjs` (`107.3 KB`) built cleanly
- `npm run precommit:check` (`X4_*` unset) -> `[precommit] OK` (`server.ts: 19405 lines, 1050102 bytes`, `routeCount: 98, surfaceCount: 69`)

## REVIEW & CLOSE
- **Status:** `PARTIAL` (Dev source, isolated HTTP, and compiled bundle `VERIFIED`; full C06b Playwright E2E, `FORGE DEVELOPMENT` installed IDE check, and `0.0.94` public release remain open under Machine-State Ask).
- **Requirements walkthrough:**
  1. Same-volume Steam scratch allocation on `>260`-char prefix (`prefixLen=281`) with clean staging, promotion, and scratch cleanup: `Done and evidenced` (`route-integration 634/634`).
  2. Ordinary public artifact/report/command paths (no `\\?\` prefix leaked): `Done and evidenced`.
  3. Namespace conversion strictly at the validated `mkdtempSync` syscall boundary with `isPathWithin` containment and preserved root/alias/stale/adoption refusals: `Done and evidenced`.
  4. Full C06b browser E2E & installed `0.0.94` qualification: `Partial` (deferred to `0.0.94` release qualification window).
- **Suggested commit title:** `fix(release): support long Windows workspace paths in Steam staging (#118)`

## AAR
- **Triggers:** Pre-implementation scratch probe (`G:\Forge-QA\temp\probe118.ts`) initially used relative `./src/lib/...` imports from `G:\Forge-QA\temp` and an `npx tsx -e` invocation (`task-3940`) that hung before cancellation; switching to a disposable `.ts` file with absolute repo imports under `node --import tsx` completed in `3 s` and proved every downstream syscall (`materializeCatalogArtifact`, `renameSync`, `rmSync`, `atomicWriteFile`) succeeded at `264–316` chars. Updated `config/durable-writers.json` `sourceFingerprint` after editing the `mkdtempSync` site in `server.ts`. Also `git add graphify-out` exited `1` because `graphify-out` is `.gitignore`d (re-staged without `graphify-out`).
- **Sustain:** Reproducing exact Windows `>260`-char syscall behavior across the entire Steam prepare/replace/cleanup pipeline before touching `server.ts` confirmed that only `mkdtempSync` needed `path.toNamespacedPath`, keeping the fix minimal and surgical (`+5/-1` lines in `server.ts`).
- **Improve work/approach:** Never invoke `npx tsx -e` with multiline PowerShell strings on Windows; always use `node --import tsx <scratch.ts>` with absolute repo imports when probing from `G:\Forge-QA\temp`.
- **Improve tools:** None required beyond existing `route-integration.mjs` (`prefixLen=281`).
- **Highest-risk evidenced weakness:** `os.tmpdir()` `mkdtempSync` sites (`deploymentSnapshot.ts:62`, `artifactPackager.ts:116`) assume `TEMP`/`TMP` itself stays well below `230` characters on Windows; acceptable for standard OS temp roots, noted in case custom deep `TEMP` directories are ever configured.
- **Lessons banked:** Projecting `fs.mkdtempSync(path.toNamespacedPath(prefix))` immediately back via `path.join(parent, path.basename(created))` solves Node's Windows `mkdtemp` 260-char `ENOENT` bug without leaking extended-length `\\?\` prefixes into application state or public receipts.
