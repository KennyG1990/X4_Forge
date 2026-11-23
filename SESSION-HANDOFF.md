# Session Handoff

## Project & Baseline
- **Active repo:** `G:\Forge-QA\forge-development` (`main`, branched after `0.0.93` `e9c12e17a3c543d709de5df7749b00403ca49801`)
- **Role:** Forge QA agent owning `X4_Forge` development continuously across the backlog.
- **Untouched boundaries:** `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`, live Forge (`C:\Users\Moshi\.antigravity-ide`), live profile, `AiLive`/`x4_ai_influence`, X4 install/saves, and `FORGE DEVELOPMENT` IDE (`PID 34076` running `0.0.89`) until Machine-State Ask authorizes IDE upgrade/verification.
- **Read-only corpus:** `G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`.

## Completed Since `0.0.93`
1. **`fix(mcp): retire cleanly on stdin EOF without Windows libuv async abort`** (VERIFIED at source/selftest/precommit/route/oracle layers; VSIX repack deferred to next release):
   - Fixed `0xC0000409` (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`) in `vscode-extension/mcp/x4forge-mcp.cjs` caused by calling synchronous `process.exit(0)` in `rl.on("close")`; aborted `discoveryController` on close and retired naturally via `process.stdin.destroy()`. Bumped `MCP_MODULE_AUDIT_VERSION` (`22 -> 23`) and promoted `config/forge-route-dispositions.json` (`c5d7f937...`).
   - Verified: `test:capabilities`, `test:mcp-capabilities` (`md-navigation-mcp`, `ai-navigation-mcp`, `native-performance-mcp` `30/30`), hung legacy EOF (`133 ms`, `code=0`), `precommit:check`, `test:routes` (`616/616`), `test:oracles` (`134/134`).
2. **`perf(deploy): reuse read buffers, recovery walk bytes, and corpus static digest (#97)`** (Unit 1 VERIFIED; `#97` remains OPEN/PARTIAL for Unit 2 & Unit 3):
   - Reused shared 1 MiB chunk read buffer in `src/lib/artifactPipeline.ts`, switched `deploymentCorpusFiles` (`src/server/deploymentTrust.ts`) to `hashArtifactFile`, combined `regularTreeFingerprintAndBytes` in `server.ts` (`prepareDeploymentRecoveryReceipt`), and memoized unchanging static corpus digest in `deploymentCorpusIdentity`.
   - `bench97.mjs` (`1,000`-file mod + X4 `9.00`, compiled `dist/server.cjs`, Node `v24.15.0`): `apply1` `37,390.8 -> 30,821.1 ms` (`-17.6%`), `apply2` `36,103.5 -> 31,697.3 ms` (`-12.2%`), `sourceRechecks.corpusMs` `2,836.2 -> 1,181.4 ms` (`-58.3%`), `prepare` `3,593.5 -> 2,726.4 ms` (`-24.1%`), `trustHash` CPU hits `5,284 -> 0`.
   - Verified: `test:writers` (`30/30` + `8/8`), `typecheck`, `lint` (`0` errors), `test:artifact-pipeline` (`86/86`), `deployment-snapshot.selftest.ts` (`141` assertions), `test:routes` (`616/616`), `test:oracles` (`134/134`), `precommit:check`.

## Live Hazards & Dead Theories
- **Windows `0xC0000409` on Node v24.15.0 stdio shutdown:** Synchronous/deferred `process.exit(0)` on `rl.on("close")` after `fetch()` triggers `src\win\async.c:76` (`UV_HANDLE_CLOSING`); fixed by natural drain (`process.stdin.destroy()` + timer/controller abort).
- **Artifact EOF growth check hook:** `scripts/artifact-pipeline-check.ts:281-303` wraps `fs.statSync` around `verifyMaterializedArtifact`; keep `verifyMaterializedArtifact`'s `fs.statSync` loop intact.
- **Corpus memoization wrapper gotcha:** `getReferenceSets()` and `getJobsVocabulary()` construct wrapper objects on each call; memoize by inner `Set` / index object references, not wrapper identity.
- **Notion Releases DB blocker:** `notion_notion` `notion-create-pages` serialized `"pages": [true]` instead of payloads during `0.0.93` sync; `X4 Forge — Releases` row (`0.0.93`+) still needs manual UI or fixed MCP call later.

## Hot Files (Next Unit: `#97` Unit 2 — Bound-Apply Validation Reuse & Staging `.snapshots`/Write Overhead)
- `G:\Forge-QA\temp\bench97.mjs` & `G:\Forge-QA\temp\bench97-unit1-after.json` (`bench97-baseline.json` / `bench97-unit1-before.json` preserved)
- `G:\Forge-QA\forge-development\server.ts` (`16120-16550` Bound-Apply validate + write + verify + doctor; `13841-13905` `compileWorkspaceToFolder` staging)
- `G:\Forge-QA\forge-development\src\server\deploymentSnapshot.ts`, `src\server\projectValidation.ts:906-908`, `src\lib\modDoctor.ts:107-140` (`generateMDXML`)
- `G:\Forge-QA\forge-development\docs\plans\2026-11-10-deploy-preview-validation-reuse.md` & `2026-11-10-deploy-validation-working-set.md`

## Next Unit First Command
- Extend `G:\Forge-QA\temp\bench97.mjs` (or a separate copy) with 25 accumulated `.snapshots/snapshot_*.json` files to reproduce Claude's `69.6 s` `write` stage bloat (`replaceValidatedDeployment` staging swap copying `.snapshots`), and read `server.ts` lines `16120-16550` in targeted slices to plan `#97` Unit 2 (`SPECIFIED` in `docs/plans/2026-11-10-deploy-preview-validation-reuse.md`).
- After Unit 2 and `#53` non-blocking `/api/reference/status` (`Unit 3`), evaluate `0.0.94` release readiness and upgrade `FORGE DEVELOPMENT` IDE after Machine-State Ask.
- Never cite `netstat` `PID 0` rows as occupied ports; verify vacancy via Node exclusive loopback bind.
