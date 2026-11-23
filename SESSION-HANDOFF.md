# Session Handoff — X4_Forge (`G:\Forge-QA\forge-development`)

- **Updated:** 2026-11-23
- **Branch / HEAD:** `main` (ready for local commit of `#97` Unit 4 on top of `6938e2a`)
- **Active Project:** `X4_Forge` (Forge QA / Dev ownership; NOT `X4_AiLive`, NOT `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`)
- **Isolated IDE State:** `FORGE DEVELOPMENT` (`PID 34076`, `G:\Forge-QA\development-ide`) still running `0.0.89` with `X4CodeSense 1.2.0` side-by-side. Do NOT restart/upgrade until Machine-State Ask authorizes `0.0.94` build/qualification.

## Completed Units Since `0.0.93` (`e9c12e1`)

1. **`1405c14` — MCP stdio EOF Windows teardown crash:** Natural stream drain via `discoveryController` abort + `process.stdin.destroy()` in `vscode-extension/mcp/x4forge-mcp.cjs`; `MCP_MODULE_AUDIT_VERSION` `22 -> 23`.
2. **`14b5795` — `#97` Unit 1:** Buffer reuse in `src/lib/artifactPipeline.ts`, recovery walk reuse in `src/server/deploymentTrust.ts`, static corpus digest in `server.ts`. (`apply1` `37.39s -> 30.82s`, `apply2` `36.10s -> 31.70s` on `bench97`.)
3. **`2fe05cf` — `#97` Unit 2:** Bound-Apply preview validation cache (`deployPreviewValidationCache`) + entry barrier coalescing (`sourceRechecks` `7 -> 5`) + 5 route tests. (`apply1` `30.82s -> 25.77s`, `apply2` `31.70s -> 26.38s` on `bench97`.)
4. **`fb92bce` — `#97` Unit 3:** Single-pass `regularTreeExpectedAndFingerprint` / `verifyExpectedFilesAndFingerprint`, `artifactStage?.fingerprint` reuse, `targetCheck === 1` coalescing (`sourceRechecks` `5 -> 4`), and `runCompileArtifactSelftest` positive+negative checks. (`apply1` `23.36s [-37.5%]`, `apply2` `25.19s [-30.2%]` on `bench97`.)
5. **`c76c62a` — `#53` (FF-14) Discovery Isolation & Manifest Corpus Path Cache:** Selected manifest path reuse across `REFERENCE_SIGNATURE_CHECK_MS` expirations, `?observe=1` on `/api/reference/status`, `'lab'` public mode, and default `~/.x4forge` discovery isolation for `dev-build`/`release-host`/`lab`.
6. **`6938e2a` — `test:reference-api` `93/93` fix (`scripts/reference-api-integration.mjs:196-206`):** Matched `'quoted MD order ID'` `<create_order id="'Att|ack'"/>` to `'Attack'` instead of `aiScript`.
7. **`#97` Unit 4 (`docs/plans/2026-11-23-deploy-unit4-md-identity-and-verify-scaling.md`):**
   - Profiled `42.24 MB` / `1,074`-file / `37`-MD-script (`x4_ai_influence`-scale) `bench97_42mb.mjs` fixture (`G:\Forge-QA\temp\`).
   - `src/lib/mdFileIdentity.ts`: replaced $O(V \times E)$ `mdNodeIdsForStem` scan + `queue.shift()` with `createMdStemIdentityIndex(workspace)` (single-pass adjacency maps, cursor BFS, precomputed `stableStringify` sort keys preserving `.localeCompare()` byte order; `7/7` selftests).
   - `server.ts`: wired `createMdStemIdentityIndex` into `importModFolder`, `buildWorkspaceFileManifest` (skipping redundant `generateMDXML` on unchanged verified MD files), and `applyOriginalModeledFiles`; short-circuited / batched `doctorAccepted` `buildValidationEvidence` hashing in `inspectOutput()`.
   - `scripts/route-integration.mjs`: added `doctor_evidence_batch_accepts_exact_lua_syntax_finding` & `doctor_evidence_batch_refuses_unapproved_second_finding_and_duplicate_id`.
   - `bench97_42mb` (`42.24 MB`): `preview1` `35.73 -> 22.50s (-37.0%)`, `apply1` `62.24 -> 35.94s (-42.3%, verify -90.3%)`, `preview2` `34.61 -> 18.39s (-46.9%)`, `apply2` `62.72 -> 36.93s (-41.1%, verify -92.2%)`.
   - Verified: `test:routes` (`623/623 PASS`), `test:oracles` (`134/134`), `test:reference-manifest-api` (`21/21 PASS`), `test:reference-api` (`93/93 PASS` with `X4_REFERENCE_ROOT`), `precommit:check` (`OK`, `writers` `30/30` + `8/8`), `lint` (`0` errors).

## Live Hazards & Environment Rules

- Shell starts in `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`: ALWAYS `Set-Location 'G:\Forge-QA\forge-development'` first and set `TEMP`, `TMP`, `npm_config_cache` to `G:\Forge-QA\temp...`.
- Always pass `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00'` when running `npm run test:reference-api`.
- Node `v24.15.0` at `C:\Program Files\nodejs\node.exe`. Never use `$ErrorActionPreference = 'Stop'` around native `node`/`npm` piped to `2>&1`, never use `< NUL` in `pwsh`, and avoid piping long validation suites into `Select-Object -Last N`.
- `config/durable-writers.json` `sourceFingerprint` is `51213cb1c4a0f2ca1fb7cc6bf373da96d86b926f12448f59d64e5b9163cb6012`.

## Immediate Next Queue

1. **`0.0.94` Release Gate (Machine-State Ask + Write Gate pending Ken go-ahead):** Tier 1 items `#95`, `#105`, `#118`, `#131`, `#132` already have code + tests on `main`; await Ken go-ahead before updating `vscode-extension/release-notes.json` / bumping `0.0.94`, running `npm run stage-app` + `probe-staged-app.mjs` + `test:e2e`, upgrading `FORGE DEVELOPMENT` (`G:\Forge-QA\development-ide`), verifying `#97`/`#53`/`#85`/`#95`/`#105`/`#118`/`#131`/`#132` in installed UI, and publishing/pushing.
2. **Tier 2 / `#74` Headless Development (in parallel while awaiting Ken):** Evaluate `.forge-builds/loose` dual-write optimization under `#97` if needed (`write: 8.3s`), and advance eligible Tier 2 (`#61`, `#101`/`#71`, `#129`/`#114`, `#107`, `#55`, `#102`, `#64`) & Tier 3 (`#74` X4CodeSense parity) items in `G:\Forge-QA\forge-development`.
