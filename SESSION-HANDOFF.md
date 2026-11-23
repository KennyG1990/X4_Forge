# Session Handoff

## Project & Baseline
- **Active repo:** `G:\Forge-QA\forge-development` (`main`, after `0.0.93` `e9c12e17`, local commits `1405c14`, `14b5795`, + Unit 2)
- **Role:** Forge QA agent owning `X4_Forge` development continuously across the backlog.
- **Untouched boundaries:** `G:\F-rescue-2026-09-26\DEV_ENV\X4_Forge`, live Forge (`C:\Users\Moshi\.antigravity-ide`), live profile, `AiLive`/`x4_ai_influence`, X4 install/saves, and `FORGE DEVELOPMENT` IDE (`PID 34076` running `0.0.89`) until Machine-State Ask authorizes IDE upgrade/verification.
- **Read-only corpus:** `G:\F-rescue-2026-09-26\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`.

## Completed Since `0.0.93`
1. **`fix(mcp): retire cleanly on stdin EOF without Windows libuv async abort`** (`1405c14`, VERIFIED at source/selftest/precommit/route/oracle layers).
2. **`perf(deploy): reuse read buffers, recovery walk bytes, and corpus static digest (#97)`** (`14b5795`, Unit 1 VERIFIED; `bench97` `apply2`: `36.1 -> 31.7 s`).
3. **`perf(deploy): reuse preview static validation and coalesce apply barriers (#97)`** (Unit 2 VERIFIED; `#97` remains OPEN/PARTIAL for Unit 3 `write` / `.snapshots` / `#53`!):
   - `server.ts`: Bounded 4-entry FIFO cache (`deployPreviewValidationCache`) populated by Preview (`dryRun === true`) and reused on matching Bound Apply after verifying 12 exact static/corpus/vocab/workspace-model/receipt guards; still runs `projectChecks`, `targetFingerprint`, `receiptHistory`, `validationDelta`, `evaluateFindingAcceptances`, `expectedIdentity`, `deploymentManifestConflict`, `previewDeploymentEffect`, `assertCurrentSource`, and `assertCurrentTarget` fresh. Coalesced `sourceRechecks.count` (`7 -> 5`) at `assertWriteAuthority(true)` and `.forge-builds/loose` staging entry.
   - `config/durable-writers.json`: Refreshed `sourceFingerprint` (`6adbfbe8...`, verified zero call-count/contract change).
   - `scripts/route-integration.mjs`: Added 5 parity/invalidation/acceptance-gate tests (`621/621 PASS`).
   - `bench97.mjs` (`1,000` files + X4 `9.00`): `apply1` `30.8 -> 25.8 s` (`-16.4%`, `-31.1%` vs `0.0.93`), `apply2` `31.7 -> 26.4 s` (`-16.8%`, `-26.9%` vs `0.0.93`), `validate` `3.35 -> 1.53 s` (`readiness=0`, `project=0`), `sourceRecheck` `10.65 -> 7.55 s`.
   - Verified: `typecheck`, `lint`, `test:writers` (`30/30` + `8/8`), `precommit:check`, `test:oracles` (`134/134`), `test:routes` (`621/621`).

## Live Hazards & Dead Theories
- `ws.description` modifies emitted `README.md` (`artifactHash`); workspace-model-only cache invalidation fixtures must mutate model-only fields (e.g. `nodes` with `compileSettings.md = false`).
- Referencing external MD cues (`md.Other.Cue`) emits warnings, whereas `this.Missing` emits `project.unresolved_cue_ref` (`severity: 'error'`) reliably for acceptance tests without `md.xsd` dependency.
- Notion Releases DB (`0.0.93`+) still blocked on `notion-create-pages` MCP argument serialization (`"pages": [true]`).

## Hot Files (Next Units: `#97` Unit 3 Dual-Write / `.snapshots` & `#53` Non-Blocking `/api/reference/status`)
- `G:\Forge-QA\forge-development\server.ts` (`compileWorkspaceToFolder`, `replaceValidatedDeployment`, `.forge-builds/loose` + `extensionsPath` dual write `7.0 s` in `bench97`, `69.6 s` in `deploy751.log`)
- `G:\Forge-QA\forge-development\src\server\referenceRoutes.ts:207-224` (`#53` `GET /api/reference/status` blocking cold load)
- `G:\Forge-QA\temp\bench97.mjs` (`bench97-baseline.json`, `bench97-unit1-after.json`, `bench97-unit2-after.json`)

## Next Unit First Command
- Profile `.snapshots/` & preserved-file / dual `compileWorkspaceToFolder` (`write = 7.0 s` in `bench97`, `69.6 s` in `deploy751.log`, `prepare = 2.7 s / 31.1 s`) for `#97` Unit 3, AND inspect `#53` (`src/server/referenceRoutes.ts:207-224` + commit `4bf0306` context).
- Note: after committing Unit 2, we have 3 local verified commits (`1405c14`, `14b5795`, Unit 2); consider `#97` Unit 3 + `#53` before qualifying `0.0.94` public release and upgrading `FORGE DEVELOPMENT` IDE (`Machine-State Ask` first).
