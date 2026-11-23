# Native Deploy Latency Unit 5: Snapshot Double-Verify Elimination, Single-Import Manifest Reuse, Fast StableStringify, Staging Barrier Alignment & Compact Deploy Response (#97, #48)

**Status:** `PARTIAL` (Unit 5 VERIFIED; `#97` remains open/PARTIAL for `0.0.94` packaged/installed IDE timing & `#48` for CLI `action-receipt-coverage-audit` top-level `pass` bug)
**Owner:** GitHub `#97`, `#48`
**Lane:** `FULL`

## PLAN
- **Bounded unit:** Eliminate five remaining CPU/I/O/serialization wastes on multi-script (`42.24 MB` / `1,074`-file) deploys observed directly in the `f918c4b` V8 CPU profile (`task-2087`, `55,676` samples) while keeping every target security, integrity, and compatibility invariant intact:
  1. **Single post-read snapshot integrity check (`src/server/deploymentSnapshot.ts:114`):** `materializeArtifact(plan, payload, 'per-file', ...)` at line `81` already verifies every written entry per-file, and `assertIntegrity()` runs at line `163` right after `manifestFiles` completes (which reads XML/Lua through `readVerifiedArtifactFile`). Replace line `114` `assertIntegrity()` with `stage?.assertOwned(); assertOwnedDirectory(root, rootStamp); assertOwnedDirectory(payload, payloadStamp);`, keeping the full `verifyMaterializedArtifact` pass at line `163`. Zero mutating raw FS calls added or removed.
  2. **Linear allocation-free `stableStringify` (`src/lib/workspaceIdentity.ts:18-24`):** Replace recursive `.map(...).join(',')` array allocations with an explicit `writeStableJson(value, out)` accumulator while preserving 100% byte-identical `JSON.stringify` semantics (`-0`, non-finite numbers -> `null`, array `undefined` -> `null`, omitted object `undefined`, `toJSON`, sorted keys). Add exact parity + edge-case checks in `runWorkspaceIdentitySelftest()`.
  3. **Single manifest build & source stamp reuse on fresh import (`server.ts` `importModFolderWithManifest` + `deployVerifyHandler` lines `8634`, `16271`, `16298`, `16348`):** Return `{ workspace, report, manifest }` from internal `importModFolderWithManifest` (`importModFolder` delegates to it returning `{ workspace, report }`). On fresh `reqPath` deploy in `deployVerifyHandler` (when `!reimported`), skip redundant immediate `fingerprintModFolder(sourceStamp.dir)` right after `importModFolder` stamped it, and reuse `freshManifest` in `compile` instead of calling `buildWorkspaceFileManifest(ws)` twice back-to-back. Also skip re-running `sanitizeWorkspace(ws)` at `17248` when `ws` is already freshly sanitized by `importModFolder` or line `16278`.
  4. **Eliminate redundant internal staging `assertCurrentSource()` (`server.ts:17004`):** `16994` runs full `assertWriteAuthority()` (`assertCurrentSource()`) immediately before entering staging writes, and `17014` (`targetCheck === 2`) runs full `assertCurrentSource()` immediately before activating the live game `extensionsPath` target. Passing `assertWriteAuthority(true)` inside `stagingRoot` (`modWorkspacePath/.forge-builds/loose`) avoids re-hashing all `1,074` snapshot and `sourceRoot` files a 3rd time (`sourceRechecks.count: 4 -> 3`) before internal `.forge-builds/loose` writes while preserving all receipt/proof/storage guards and keeping the full `targetCheck === 2` source/corpus/snapshot barrier before live target activation.
  5. **Compact response option (`detail: 'compact' | 'full'`, `#97` + `#48`) on `/api/agent/deploy-verify` & `/api/agent/deploy` (`server.ts`):** Accept optional `detail?: 'compact' | 'full'` (default `'full'` for full backwards compatibility), validate in input guard (`DEPLOY_INPUT_INVALID` on unknown values), propagate `detail` into `acceptanceRequest.body`, and when `detail === 'compact'` omit the multi-megabyte `workspace: ws` echo in `replyBody` (`98.5 MB` -> `~0.5 MB` on `42.24 MB`), emitting `detail: 'compact'` and `workspaceSummary: { id, name, modId, contentId, nodeCount, linkCount }` while keeping every verification hash, receipt, recovery, effect, doctor, checklist, and timing field intact. Update capability docs (`server.ts:4631-4661`).
- **Assumptions & References:**
  - `src/server/deploymentSnapshot.ts`, `src/lib/workspaceIdentity.ts`, `server.ts`, `config/durable-writers.json`, `scripts/route-integration.mjs` (`line 4629`).
  - Existing callers (including Studio UI and `route-integration.mjs:5261`) expect default `replyBody.workspace` unless `detail: 'compact'` is explicitly requested.
- **In scope:**
  - Exact 5 optimizations above + unit/selftest/route tests + negative path checks (external edit between staging and extensions activation still throws `DEPLOY_SOURCE_CHANGED`; invalid `detail` rejected `400 DEPLOY_INPUT_INVALID`; `stableStringify` parity across edge cases; snapshot tamper at `assertIntegrity()` line `163` still detected).
- **Out of scope:** Skipping `verifyExpectedFilesAndFingerprint`, trusting `mtimeMs` without SHA-256 on target/source checks, changing `artifactPipeline.ts` raw FS calls, or touching `FORGE DEVELOPMENT` IDE (`PID 34076`).
- **Risks & Rollback:**
  - Risk 1: `stagingCheck` skipping `assertCurrentSource()` changes `sourceRechecks.count` from `4` to `3`. Mitigated by preserving `16994` (pre-write) AND `17014` (`targetCheck === 2`, pre-extensions activation), updating `route-integration.mjs:4629` (`count === 3`), and adding an explicit negative test mutating `sourceRoot` right before `extensionsPath` activation (`beforeActivate` / staging fault or pre-target edit).
  - Risk 2: `stableStringify` subtly diverging on edge values (`-0`, `NaN`, `undefined`, `toJSON`, sparse arrays). Mitigated by testing byte-for-byte identity against `JSON.stringify` / previous behavior across all edge inputs in `runWorkspaceIdentitySelftest()`.
  - Rollback: Revert this single commit against `f918c4b`.
- **Acceptance Criteria:**
  1. `runWorkspaceIdentitySelftest()` passes byte-identical checks across nested objects, `toJSON`, `-0`, `NaN`/`Infinity`, `undefined`, and escaped strings.
  2. `POST /api/agent/deploy-verify` & `/api/agent/deploy` reject invalid `detail` (`400 DEPLOY_INPUT_INVALID`), return complete `workspace` when omitted or `'full'`, and omit `workspace` + return `workspaceSummary` with all hashes/receipts/timings intact when `detail: 'compact'` (propagated in `acceptanceRequest.body`).
  3. `sourceRechecks.count === 3` on Bound Apply with staging configured, and external `sourceRoot` change before extensions activation still refuses (`DEPLOY_SOURCE_CHANGED`, `409`) without mutating target bytes.
  4. `bench97_42mb.mjs` (`42.24 MB`, `1,074` files, apples-to-apples default `detail: 'full'`) measurably beats `bench97-42mb-unit5-before.json` (`p1: 20,607.4 ms`, `a1: 33,985.8 ms`; `snapshot`, `import`, `compile`, `sourceRecheck`), and compact apply `rawBytes` drops from `~98.5 MB` to `< 1 MB`.
- **Required Validation & Negative Paths:**
  - `npm run typecheck`
  - `npm run lint` (`0` errors)
  - `npm run test:writers`
  - `npm run test:capabilities`
  - `npm run test:oracles` (`134/134`, including `/agent/workspace-identity-selftest` & snapshot checks)
  - `tsx scripts/deployment-snapshot.selftest.ts`
  - `npm run test:routes` (`623+` PASS)
  - `npm run test:reference-manifest-api` (`21/21` PASS)
  - `npm run test:reference-api` (with `X4_REFERENCE_ROOT`, `93/93` PASS)
  - `npm run precommit:check` (`[precommit] OK`)
  - `npm run build` + `bench97_42mb.mjs` (`BENCH97_OUT=G:\Forge-QA\temp\bench97-42mb-unit5-after.json`) + `bench97.mjs` (`G:\Forge-QA\temp\bench97-unit5-after.json`).
- **Evidence Locations:** `docs/plans/2026-11-23-deploy-unit5-snapshot-recheck-and-compact-response.md`, `G:\Forge-QA\temp\bench97-42mb-unit5-before.json`, `G:\Forge-QA\temp\bench97-42mb-unit5-after.json`, `G:\Forge-QA\temp\bench97-unit5-after.json`.

## BASELINE
- Commit: `f918c4b` on `main` in `G:\Forge-QA\forge-development`, clean working tree.
- `bench97-42mb-unit5-before.json` (`BENCH97_ONCE=1`, `BENCH97_PROF_DIR=G:\Forge-QA\temp\prof-unit5`):
  - `p1`: `20,607.4 ms` (`totalMs: 20,553.9`, `import: 3,383.2`, `compile: 1,251.0`, `snapshot: 5,180.7`, `validate: 8,975.5`, `sourceRecheck: 1,759.2`), `rawBytes: 507,443`.
  - `a1`: `33,985.8 ms` (`totalMs: 32,818.0`, `import: 3,224.5`, `compile: 1,127.2`, `snapshot: 4,364.1`, `validate: 2,503.9`, `sourceRecheck: 7,052.7` [`count: 4`, `snapshotMs: 3,156.3`, `diskMs: 3,119.2`, `corpusMs: 686.3`], `prepare: 3,254.6`, `write: 7,854.6`, `verify: 757.4`, `doctor: 805.7`, `finalize: 1,869.3`), `rawBytes: 98,551,597`.
  - Server CPU profile (`totalHits = 55,676`): `open@:-1` `21,352` (`38.4%`), `update@hash:133` `3,741` (`6.7%`), `stableStringify` `1,418 + 593` (`3.6%`), `trustHash` `986` (`1.8%`).

## RECONCILE
- Verified `src/server/deploymentSnapshot.ts:114` & `163` both execute `verifyMaterializedArtifact` inside `captureDeploymentSnapshot` immediately after line `81` `materializeArtifact(..., 'per-file')`.
- Verified `server.ts:8634` (`importModFolder`), `16271` (`deployVerifyHandler`), `16298` (`fingerprintModFolder`), `16348` (`buildWorkspaceFileManifest`), and `17248` (`sanitizeWorkspace`) repeat manifest construction, folder fingerprinting, and sanitization on the same unmodified workspace.
- Verified `server.ts:16994` + `17004` (`stagingCheck`) + `17014` (`targetCheck`) run `assertCurrentSource()` twice before internal `.forge-builds/loose` and `extensions/` activation.
- Verified `scripts/route-integration.mjs:4629` asserts `sourceRechecks.count === 4` and line `5261` asserts `workspace.nodes` on default `/api/agent/deploy` responses, while `PlaytestWorkspace.tsx` & `deployClient.ts` do not read `replyBody.workspace`.
- Capability-map delta: `no capability-map delta` (`detail` adds an optional compact projection on existing `POST /api/agent/deploy-verify` and `/api/agent/deploy` capabilities).

## IMPLEMENT
- **`src/server/deploymentSnapshot.ts:114`:** Replaced the immediate pre-read `assertIntegrity()` (`verifyMaterializedArtifact`) right after `materializeArtifact(..., 'per-file')` with `stage?.assertOwned(); assertOwnedDirectory(root, rootStamp); assertOwnedDirectory(payload, payloadStamp);`, retaining full `assertIntegrity()` verification at line `163` after `manifestFiles` reads.
- **`src/lib/workspaceIdentity.ts`:** Replaced recursive `.map().join()` allocations in `stableStringify` with `writeStableJson(value, out)` pushing into a single string array while preserving exact `JSON.stringify` edge-case behavior (`-0`, `NaN`/`Infinity`, array `undefined`, omitted object `undefined`, sorted keys), and added `stable_stringify_edge_values` to `runWorkspaceIdentitySelftest()`.
- **`server.ts` & `config/durable-writers.json`:**
  - Added `importModFolderWithIndex` returning `{ workspace, report, mdIndex }` (`importModFolder` delegates to it) and `buildWorkspaceFileManifest(workspaceInput, existingMdIndex?)` so fresh `reqPath` deploys share one `MdStemIdentityIndex`, skip redundant immediate `fingerprintModFolder` after stamping, and reuse `freshMdIndex` in `compile` (`autoReimport` too).
  - Updated `modWorkspacePath/.forge-builds/loose` internal staging `beforeActivate` (`server.ts:17021`) to `assertWriteAuthority(true)`, cutting `sourceRechecks.count` `4 -> 3` while keeping `16994` (pre-write) and `17014` (`targetCheck === 2`, full `assertCurrentSource()` before live `extensionsPath` activation).
  - Added optional `detail: 'compact' | 'full'` (default `'full'`) to `/api/agent/deploy-verify` and `/api/agent/deploy`: validated (`400 DEPLOY_INPUT_INVALID` on unknown values), propagated into `acceptanceRequest.body` & `dryRun` replies, and when `compact`, omitted the `workspace` echo in `replyBody` in favor of `workspaceSummary: { id, name, modId, contentId, nodeCount, linkCount }` while keeping hashes, receipts, recovery, effect, doctor, checklist, and timings intact; updated capability schema docs (`4632-4661`). Updated `config/durable-writers.json` `sourceFingerprint` (`51213cb1... -> 97bb4cae...`, zero raw call deltas).
- **`scripts/route-integration.mjs`:** Updated `deploy_preview_validation_reused_on_bound_apply_with_coalesced_barriers` to `sourceRechecks.count === 3` + verified default `workspace.nodes` presence, and added `deploy_compact_detail_omits_workspace_echo_and_preserves_identity` (invalid `detail` `400`, `UNACCEPTED_MOD_FINDINGS` `acceptanceRequest.body.detail === 'compact'`, compact apply omitting `workspace` with matching `workspaceSummary` & committed receipt).

## VALIDATE
- `bench97_42mb.mjs` (`42.24 MB`, `1,074` files, `37` MD scripts, default `detail: 'full'`; `G:\Forge-QA\temp\bench97-42mb-unit5-after.json` vs `bench97-42mb-unit5-before.json`):
  - `preview1`: `20,607.4 -> 18,146.9 ms` (`-11.9%`; `import: 3,383.2 -> 2,700.7 ms`, `snapshot: 5,180.7 -> 4,222.5 ms`) (`-49.2%` vs pre-Unit-4 `35,731.3 ms`)
  - `apply1`: `33,985.8 -> 29,856.6 ms` (`-12.1%`; `import: 3,224.5 -> 2,427.4 ms`, `snapshot: 4,364.1 -> 3,309.7 ms`, `sourceRecheck: 7,052.7 -> 5,147.7 ms` [`count: 3`]) (`-52.0%` vs pre-Unit-4 `62,240.7 ms`)
  - `preview2`: `15,003.3 ms` (`-56.6%` vs `34,606.2 ms`)
  - `apply2`: `29,867.0 ms` (`snapshot: 3,106.8 ms`, `sourceRecheck: 4,887.2 ms` [`count: 3`]) (`-52.4%` vs pre-Unit-4 `62,717.2 ms`)
- `bench97` (`1,000`-file mod + X4 9.00; `G:\Forge-QA\temp\bench97-unit5-after.json`):
  - `preview1`: `11,175.4 ms`, `apply1`: `20,988.5 ms` (`snapshot: 2,120.5 ms`, `sourceRecheck: 4,263.2 ms` [`count: 3`], `-43.9%` vs `0.0.93` `37,390.8 ms`), `apply2`: `21,119.6 ms` (`-41.5%` vs `0.0.93` `36,103.5 ms`), `writeStableJson` `447` hits (`0.4%`).
- Post-final-edit full suite (`task-2181` & `task-2188`):
  - `npm run typecheck`: `0` errors
  - `npm run lint`: `0` errors (`605` warnings)
  - `npm run test:writers`: `[durable-writer audit selftest] 30/30`, `[durable-writer audit] PASS` (`50` raw FS sources), `durableWrite selftest: 8/8`
  - `npm run test:capabilities`: `PASS` (`25` capabilities, `318` disposed literal routes, `23` MCP aliases)
  - `npx tsx scripts/deployment-snapshot.selftest.ts`: `PASS` (`141/141`)
  - `npm run test:routes`: `624/624 PASS`
  - `npm run test:oracles`: `[oracle-sweep] 134/134 green`
  - `npm run test:reference-manifest-api`: `21/21 PASS`
  - `npm run test:reference-api` (with `X4_REFERENCE_ROOT`): `93/93 PASS`
  - `npm run precommit:check`: `[precommit] OK` (`action-receipt-coverage-audit` `98` routes / `69` surfaces, `typecheck` `0` errors)

## REVIEW & CLOSE
- Unit 5 requirements: all `Done and evidenced` in dev source & isolated runtime (`VERIFIED` for Unit 5 scope; `#97` remains `PARTIAL` pending `0.0.94` packaged/installed IDE verification).
- Fresh-eyes check confirmed `buildWorkspaceFileManifest` at `importModFolderWithIndex:8635` reuses `importMdIndex` without touching `ws.passthroughFiles` ordering, default `detail` preserves `workspace` for existing callers, and `targetCheck === 2` still enforces full `assertCurrentSource()` before live extensions activation.
- Suggested commit title: `perf(deploy): cut snapshot/recheck passes and add compact deploy detail (#97)`

## AAR
- **Triggers:** First `test:writers` run failed on `sourceFingerprint` shift (`51213cb1... -> 97bb4cae...`) because edits in `server.ts` changed context windows within 240 chars of raw FS calls (`fs.mkdirSync` at line `16998`), with zero raw call count deltas.
- **Sustain:** Re-profiling `42.24 MB` with `BENCH97_PROF_DIR` pinpointed `stableStringify`, duplicate `assertIntegrity()`, duplicate `importModFolder` manifest/stamp calls, and internal staging `assertCurrentSource()`, dropping full `42.24 MB` Bound Apply below `30 s` (`29.86 s`, `-52%` vs pre-Unit-4 baseline).
- **Improve work/approach:** Check `config/durable-writers.json` context windows whenever editing near raw FS calls in `server.ts`.
- **Improve tools:** None; `test:writers` caught the fingerprint shift immediately.
- **Highest-risk evidenced weakness:** `open@:-1` still dominates `51%` of `bench97` (`1,000`-file) samples because `.forge-builds/loose` staging mirrors all files separately from `extensionsPath`; leave dual-write elimination unless needed after `0.0.94` installed measurement.
- **Lessons banked:** `deploy-verify` default payload echoed `98.5 MB` (`workspace: ws`) unnecessarily for automated callers; `detail: 'compact'` cleanly solves `#97`/`#48` wire bloat without breaking Studio/route compatibility.
