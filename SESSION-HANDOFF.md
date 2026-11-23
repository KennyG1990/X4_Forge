# Session Handoff — X4_Forge (`G:\Forge-QA\forge-development`)

- **Updated:** 2026-11-23
- **Branch / HEAD:** `main` (ready for local commit of `#97` Unit 5 on top of `f918c4b`)
- **Active Project:** `X4_Forge` (Forge QA / Dev ownership; NOT `X4_AiLive`, NOT `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`)
- **Isolated IDE State:** `FORGE DEVELOPMENT` (`PID 34076`, `G:\Forge-QA\development-ide`) still running `0.0.89` with `X4CodeSense 1.2.0` side-by-side. Do NOT restart/upgrade until Machine-State Ask authorizes `0.0.94` build/qualification.

## Completed Units Since `0.0.93` (`e9c12e1`)

1. **`1405c14` — MCP stdio EOF Windows teardown crash:** Natural stream drain via `discoveryController` abort + `process.stdin.destroy()` in `vscode-extension/mcp/x4forge-mcp.cjs`.
2. **`14b5795` — `#97` Unit 1:** Buffer reuse in `src/lib/artifactPipeline.ts`, recovery walk reuse in `src/server/deploymentTrust.ts`, static corpus digest in `server.ts`.
3. **`2fe05cf` — `#97` Unit 2:** Bound-Apply preview validation cache + entry barrier coalescing (`sourceRechecks` `7 -> 5`) + 5 route tests.
4. **`fb92bce` — `#97` Unit 3:** Single-pass `regularTreeExpectedAndFingerprint` / `verifyExpectedFilesAndFingerprint`, `artifactStage?.fingerprint` reuse, `targetCheck === 1` coalescing (`sourceRechecks` `5 -> 4`).
5. **`c76c62a` — `#53` (FF-14) Discovery Isolation & Manifest Corpus Path Cache:** Selected manifest path reuse across `REFERENCE_SIGNATURE_CHECK_MS` expirations, `?observe=1` on `/api/reference/status`, `'lab'` public mode, and default `~/.x4forge` discovery isolation.
6. **`6938e2a` — `test:reference-api` `93/93` fix:** Matched `'quoted MD order ID'` `<create_order id="'Att|ack'"/>` to `'Attack'` in `scripts/reference-api-integration.mjs`.
7. **`f918c4b` — `#97` Unit 4:** Linear $O(V + E)$ `createMdStemIdentityIndex` in `src/lib/mdFileIdentity.ts`, preserved MD reuse before `generateMDXML` in `server.ts`, batched `doctorAccepted` hashing, and `doctor_evidence_batch_*` route tests (`42.24 MB` Apply `62.24s -> 35.94s`).
8. **`#97` Unit 5 (`docs/plans/2026-11-23-deploy-unit5-snapshot-recheck-and-compact-response.md`):**
   - `src/server/deploymentSnapshot.ts`: removed duplicate pre-read `verifyMaterializedArtifact` at `114` while keeping ownership checks + full `assertIntegrity()` at `163`.
   - `src/lib/workspaceIdentity.ts`: fast allocation-free `writeStableJson` in `stableStringify` (exact parity + `stable_stringify_edge_values`).
   - `server.ts` & `config/durable-writers.json` (`sourceFingerprint: 97bb4caec9be084b54a49358f96bd7831add0f6b96cd621b6ac390a472b15050`): `importModFolderWithIndex` single `MdStemIdentityIndex` + fresh source stamp reuse, internal staging `beforeActivate` `assertWriteAuthority(true)` (`sourceRechecks.count: 4 -> 3` preserving `targetCheck === 2` before live `extensions/` activation), and `detail: 'compact' | 'full'` (`#97`/`#48`) omitting `workspace` echo in favor of `workspaceSummary`.
   - `bench97_42mb` (`42.24 MB`, default `full`): `preview1` `18.15s`, `apply1` `29.86s` (`-52.0%` vs `62.24s`), `apply2` `29.87s`; `bench97` (`1,000` files): `apply1` `20.99s` (`-43.9%` vs `0.0.93`).
   - Verified: `typecheck` (`0`), `lint` (`0` err), `test:writers` (`30/30` + `8/8`), `test:capabilities`, `deployment-snapshot.selftest.ts` (`141`), `test:routes` (`624/624 PASS`), `test:oracles` (`134/134`), `test:reference-manifest-api` (`21/21`), `test:reference-api` (`93/93`), `precommit:check` (`OK`).

## Live Hazards & Environment Rules

- Shell starts in `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`: ALWAYS `Set-Location 'G:\Forge-QA\forge-development'` first and set `TEMP`, `TMP`, `npm_config_cache` to `G:\Forge-QA\temp...`.
- Always pass `X4_REFERENCE_ROOT='G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00'` when running `npm run test:reference-api`.
- `config/durable-writers.json` `sourceFingerprint` is `97bb4caec9be084b54a49358f96bd7831add0f6b96cd621b6ac390a472b15050`.

## Immediate Next Queue

1. **`#48` CLI compact verdict bug (`scripts/action-receipt-coverage-audit.ts --candidate-selftest`):** Fold `policyBundle` into top-level `pass`/`passed`/`total`/`failures` + negative test (Tier 1/2 open item).
2. **Tier 2 Headless Source Queue (while awaiting Machine-State Ask on `0.0.94` IDE/E2E):** `#101` / `#71` remaining 26 keys / health-hook & emitter wrappers in `player_orders`; `#129` MD unset variable read accuracy; `#80` quote-aware property positions; `#77`/`#78`/`#79`/`#64`.
3. **`0.0.94` Release Gate (Machine-State Ask + Write Gate pending Ken go-ahead):** Tier 1 items `#95`, `#105`, `#118`, `#131`, `#132` + `#53` + `#97` Units 1–5 + `#48` awaiting E2E / `FORGE DEVELOPMENT` upgrade & release.
