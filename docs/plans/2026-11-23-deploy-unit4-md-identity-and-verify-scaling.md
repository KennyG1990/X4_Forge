# Native Deploy Latency Unit 4: Linear MD Stem Identity & Verify Batch Hashing (#97)

**Status:** `PARTIAL` (Unit 4 VERIFIED; `#97` remains open/PARTIAL for `.forge-builds/loose` dual-write evaluation and `0.0.94` packaged/installed IDE timing)
**Owner:** GitHub `#97`
**Lane:** `FULL`

## PLAN
- **Bounded unit:** Eliminate three superlinear CPU/hashing bottlenecks exposed by profiling a realistic `42.2 MB` / `1,074`-file `x4_ai_influence`-scale mod (`p1 = 39.6s`, `a1 = 66.3s`, `totalHits = 105,612` in `bench97-42mb`):
  1. **`src/lib/mdFileIdentity.ts` (`36.1%` of total CPU hits):** Replace the nested `O(V * E)` `workspace.links` linear scan and `queue.shift()` inside `mdNodeIdsForStem` with a single `O(V + E)` adjacency `Map` and cursor loop, precompute `stableStringify` sort keys once per link in `mdStemFingerprint` while keeping `.localeCompare()` sort semantics byte-identical, and export `createMdStemIdentityIndex(workspace)` so batch callers (`importModFolder`, `applyOriginalModeledFiles`, `buildWorkspaceFileManifest`) hash all `F` stems in `O(V + E)` total instead of `O(F * V * E)`.
  2. **`server.ts` (`buildWorkspaceFileManifest` + `applyOriginalModeledFiles`):** Reuse `createMdStemIdentityIndex(ws)` in `buildWorkspaceFileManifest` / `applyOriginalModeledFiles` and reuse preserved `original.content` (or fail closed if `graphRegenerable === false` on fingerprint mismatch) before invoking redundant `generateMDXML` passes across unchanged imported MD scripts.
  3. **`server.ts:17026-17031` (`inspectOutput` inside `verify`):** Skip `buildValidationEvidence` completely when `acceptedIds.size === 0`, and when `acceptedIds.size > 0` evaluate matching `modFindings` diagnostics in one single `buildValidationEvidence` batch call instead of re-hashing `deployValidation.validationFiles` (`O(M * bytes)`) once per finding (`8+ seconds` wasted hashing `2.4 GB` in `bench97-42mb`).
- **Assumptions & References:**
  - `src/lib/mdFileIdentity.ts` (`mdNodeIdsForStem`, `canvasCueOwners`, `mdStemFingerprint`, `runMdFileIdentitySelftest`), `server.ts` (`buildWorkspaceFileManifest`, `applyOriginalModeledFiles`, `importModFolder`, `deployVerifyHandler` `inspectOutput`).
  - `mdStemFingerprint` output MUST remain bit-for-bit identical to the previous implementation across multi-script workspaces so saved `originalFiles[].fingerprint` hashes remain compatible.
  - Same-size / graph-only edit detection (`Refused lossy MD regeneration`) MUST remain exact.
- **In scope:**
  - `src/lib/mdFileIdentity.ts`: linear adjacency `mdNodeIdsForStem`, key-precomputed `mdStemFingerprint`, `createMdStemIdentityIndex(workspace)`, and parity + negative selftests inside `runMdFileIdentitySelftest()` (checking multi-stem isolation, diamond/cycle links, subcue cross-stem boundary, property/link edit invalidation, and exact `indexed vs unindexed` fingerprint equality).
  - `server.ts`: wire `createMdStemIdentityIndex` into `importModFolder`, `buildWorkspaceFileManifest`, and `applyOriginalModeledFiles`; batch/short-circuit `doctorAccepted` computation inside `inspectOutput()`.
  - `config/durable-writers.json`: verify `0` raw fs call changes and refresh `sourceFingerprint` if raw context slices shift.
  - `scripts/route-integration.mjs`: verify existing Doctor acceptance tests (`deploy_preview_reuse_preserves_acceptance_gate_and_applies_on_approval` & `doctor` acceptance gate) pass alongside a negative check that `doctorAccepted` still matches approved `validationDiagnostic` findings while non-accepted errors block.
- **Out of scope:** `.forge-builds/loose` dual-write architecture changes, skipping `observeDeploymentFingerprint`, or `FORGE DEVELOPMENT` IDE restart/upgrade.
- **Risks & Rollback:**
  - Risk: Divergence between fast `buildWorkspaceFileManifest` path when `original.fingerprint === index.fingerprint(stem)` and `applyOriginalModeledFiles` (`Refused lossy MD regeneration` / `passthroughFiles`). Mitigated by checking identical `(original.fingerprint, mdStemFingerprint)` guard and keeping `generatedFiles` vs `passthroughFiles` separation invariant verified by existing compile/round-trip/route suites.
  - Rollback: Revert only this unit's diff against local HEAD `6938e2a`.
- **Acceptance Criteria:**
  1. `mdStemFingerprint` with `createMdStemIdentityIndex` produces byte-identical output to `mdStemFingerprint` on single-file and multi-file workspaces (with cycles, diamond DAGs, and subcue transitions), and fails/changes on any node property or link mutation.
  2. `bench97_42mb.mjs` (`42.2 MB`, `1,074` files, `37` MD scripts, `22,792` nodes) reduces `import`, `compile`, and `verify` wall-clock latencies sharply vs `bench97-42mb-prof.json` baseline (`p1: 39.6s`, `a1: 66.3s`; `import: 15.9s/18.1s`, `verify: 8.8s`).
  3. All Doctor acceptance/rejection route checks pass (`acceptedIds.size === 0` rejects errors, `acceptedIds.size > 0` matches exact accepted `validationDiagnostic` `findingId` and still blocks unaccepted errors).
- **Required Validation & Negative Paths:**
  - `npm run typecheck`
  - `npm run lint` (`0` errors)
  - `npm run test:writers`
  - `npm run test:oracles` (`134/134`, including `/agent/md-file-identity-selftest`, `/agent/compile-selftest`, `/agent/compile-fidelity-selftest`, `/agent/round-trip-selftest`, `/agent/node-selection-document-selftest`)
  - `npm run test:routes` (`621/621`)
  - `npm run precommit:check`
  - `npm run build` + `bench97_42mb.mjs` (`G:\Forge-QA\temp\bench97-42mb-unit4-after.json`) & `bench97.mjs` (`G:\Forge-QA\temp\bench97-unit4-after.json`)
- **Evidence Locations:** `docs/plans/2026-11-23-deploy-unit4-md-identity-and-verify-scaling.md`, `G:\Forge-QA\temp\bench97-42mb-unit4-after.json`, `G:\Forge-QA\temp\bench97-unit4-after.json`.

## BASELINE
- Commit: `6938e2a` on `main` in `G:\Forge-QA\forge-development`, clean working tree.
- `42 MB` (`bench97-42mb-prof.json` + `bench97-42mb.json`):
  - `p1`: `39,608.5 ms` (`import: 15,852.3`, `compile: 7,228.4`, `snapshot: 5,296.5`, `validate: 9,434.7`, `sourceRecheck: 1,735.0`)
  - `a1`: `66,302.0 ms` (`import: 18,132.7`, `compile: 8,657.6`, `snapshot: 4,345.4`, `validate: 2,745.3`, `sourceRecheck: 7,823.4`, `prepare: 3,498.2`, `write: 8,434.2`, `verify: 8,817.3`, `doctor: 882.4`, `finalize: 1,817.1`)
  - CPU profile (`totalHits=105,612`): `mdNodeIdsForStem` `26,954` (`25.5%`), `mdStemFingerprint` `6,848` (`6.5%`), `stableStringify` `2,972 + 1,377` (`4.1%`), `update@hash` `9,634` (`9.1%`), `validationProjectContentHash` `2,035` (`1.9%`).

## RECONCILE
- Verified `mdNodeIdsForStem` (`src/lib/mdFileIdentity.ts:5-27`) performs an `O(V * E)` scan across `workspace.links` + `queue.shift()`, while `canvasCueOwners` on line `33` already uses an adjacency `Map`.
- Verified `inspectOutput()` (`server.ts:17026-17031`) invokes `buildValidationEvidence({ id: modId, name: modId, files: deployValidation.validationFiles }, [f.validationDiagnostic])` inside `modFindings.filter(...)`, hashing all `validationFiles` once per finding even when `acceptedIds.size === 0`.
- Capability-map delta: `no capability-map delta`.

## IMPLEMENT
- **`src/lib/mdFileIdentity.ts`:** Replaced nested $O(V \times E)$ `workspace.links` linear scan and `queue.shift()` in `mdNodeIdsForStem` with `createMdStemIdentityIndex(workspace)` (single-pass $O(V + E)$ `byId` / `cuesByStem` / `linksBySource` maps, cursor BFS, memoized per-stem node sets and fingerprints), precomputed `stableStringify` sort keys before `.localeCompare()` inside `stemFingerprint` to preserve byte-identical digests, and expanded `runMdFileIdentitySelftest()` from 3 to 7 checks (cross-stem cue boundary isolation, indexed vs unindexed equality, link-order invariance, multi-stem mutation isolation).
- **`server.ts`:** Wired `createMdStemIdentityIndex` across `importModFolder`, `applyOriginalModeledFiles`, and `buildWorkspaceFileManifest` (reusing verified `original.content` when `preservedOriginal.fingerprint` is absent or matches `mdIdentityIndex.stemFingerprint(stem)` before `generateMDXML`, keeping `graphRegenerable === false` fail-closed guards intact), and updated `inspectOutput()` (`deployVerifyHandler`) to short-circuit `doctorEvidence` when `acceptedIds.size === 0` and batch all matching `modFindings` diagnostics into one `buildValidationEvidence(...)` call when `acceptedIds.size > 0`.
- **`scripts/route-integration.mjs`:** Added `doctor_evidence_batch_accepts_exact_lua_syntax_finding` and `doctor_evidence_batch_refuses_unapproved_second_finding_and_duplicate_id` covering exact `lua.syntax_error` approval (`ui/addons/doctor_accept/main.lua` + `ui.xml`), multi-file partial approval refusal (`UNACCEPTED_MOD_FINDINGS`, `writeAttempted: false`, target hash unchanged), batched 2-file `doctor.accepted` pass, and sibling `DEPLOY_DUPLICATE_EXTENSION_ID` refusal (`409`, `writeAttempted: false`).

## VALIDATE
- `bench97_42mb.mjs` (`42.24 MB`, `1,074` files, `37` MD scripts; `G:\Forge-QA\temp\bench97-42mb-unit4-after.json` vs `bench97-42mb.json`):
  - `preview1`: `35,731.3 -> 22,499.1 ms` (`-37.0%`; `import: 13,778.4 -> 3,615.1 ms` [`-73.8%`], `compile: 6,912.9 -> 1,252.6 ms` [`-81.9%`])
  - `apply1`: `62,240.7 -> 35,935.3 ms` (`-42.3%`; `import: 16,045.9 -> 3,577.5 ms` [`-77.7%`], `compile: 7,973.6 -> 1,159.8 ms` [`-85.5%`], `verify: 8,539.7 -> 826.9 ms` [`-90.3%`])
  - `preview2`: `34,606.2 -> 18,392.0 ms` (`-46.9%`; `import: 15,675.4 -> 4,022.1 ms`, `compile: 7,372.1 -> 1,483.8 ms`)
  - `apply2`: `62,717.2 -> 36,926.0 ms` (`-41.1%`; `import: 14,591.7 -> 3,647.6 ms`, `compile: 6,280.1 -> 1,214.4 ms`, `verify: 10,313.5 -> 804.9 ms` [`-92.2%`])
- `bench97` (`1,000`-file mod + X4 9.00; `G:\Forge-QA\temp\bench97-unit4-after.json`):
  - `preview1`: `12,678.0 ms` (`import: 561.5`, `compile: 815.6`), `apply1`: `24,306.9 ms` (`verify: 677.3`, `sourceRechecks.count: 4`)
  - `preview2`: `9,541.4 ms` (`import: 502.7`, `compile: 697.6`), `apply2`: `24,430.8 ms` (`verify: 671.5`, `sourceRechecks.count: 4`)
- Full validation suite after final edit:
  - `npm run test:routes` (`task-1936`): `623/623 PASS` (including both new `doctor_evidence_batch_*` tests)
  - `npm run test:oracles` (`task-1936`): `134/134 green`
  - `npm run test:reference-manifest-api` (`task-1936`): `21/21 PASS`
  - `npm run test:reference-api` (`X4_REFERENCE_ROOT` set, `task-1956`): `93/93 PASS`
  - `npm run precommit:check` (`task-1956`): `[precommit] OK` (`test:writers` `30/30` + `8/8`, `action-receipt-coverage-audit` `98` routes / `69` surfaces, `typecheck` `0` errors)
  - `npm run lint` (`task-1964`): `0 errors` (`604 warnings`)

## REVIEW & CLOSE
- Unit 4 requirements: all `Done and evidenced` in dev source & isolated runtime (`VERIFIED` for Unit 4 scope; `#97` remains `PARTIAL` pending `.forge-builds/loose` dual-write assessment and `0.0.94` packaged/installed IDE timing).
- Fresh-eyes diff check confirmed `buildWorkspaceFileManifest` + `applyOriginalModeledFiles` keep identical `preservedOriginal.fingerprint` matching and fail-closed `graphRegenerable === false` enforcement.
- Suggested commit title: `perf(deploy): linearize md stem fingerprinting and batch verify hashing (#97)`

## AAR
- **Triggers:** First run of `doctor_evidence_batch_refuses_unapproved_second_finding_and_duplicate_id` used `status === 400` instead of `200` (`ok: false`, `code: UNACCEPTED_MOD_FINDINGS`) for preflight missing acceptance; second run checked `regularTreeHash(reuseTarget)` after `fullLuaApply2` had already mutated the target; first run of `test:reference-api` omitted `$env:X4_REFERENCE_ROOT`, hitting `503` on `/api/reference/status` during server readiness polling.
- **Sustain:** CPU profiling `bench97_42mb` (`prof-hook.mjs`) pinpointed two exact $O(N^2)$ loops (`mdNodeIdsForStem` `36.1%`, `inspectOutput` `buildValidationEvidence` `11.0%`) that static micro-benchmarks (`1,000`-file mod without `md/` scripts) missed.
- **Improve work/approach:** Snapshot pre-action directory hashes strictly before the subsequent mutating action in route tests; always pass `X4_REFERENCE_ROOT` when invoking `test:reference-api`.
- **Improve tools:** None; `test:routes` + `precommit:check` caught ordering mistakes immediately.
- **Highest-risk evidenced weakness:** Adding `x4_ai_influence`-scale multi-script `md/` fixtures was necessary to expose quadratic graph/evidence paths; `0.0.94` packaged VSIX + installed `FORGE DEVELOPMENT` IDE timing still lacks live measurement.
- **Lessons banked:** Large-mod profiling (`42.2 MB`, `37` MD scripts) must accompany synthetic single-script `1,000`-file benchmarks when qualifying deploy bottlenecks.
