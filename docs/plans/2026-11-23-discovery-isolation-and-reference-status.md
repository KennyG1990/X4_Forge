# Discovery Isolation & Non-Blocking Reference Status Cache (#53)

**Status:** `SPECIFIED`
**Owner:** GitHub `#53` (FF-14)
**Lane:** `FULL`

## PLAN
- **Bounded unit:** Close the remaining source/protocol gaps on `#53`:
  1. Reuse retained manifest file paths for unchanged completed SQLite manifest generations in `src/lib/referenceCorpus.ts` & `src/lib/referenceManifest.ts` (`4063cca4` parity from `#53` Comment #54/#55, avoiding repeated paginated `queryReferenceFiles` scans across million-row manifests after every 1s `REFERENCE_SIGNATURE_CHECK_MS` expiry) and support non-blocking `?observe=1` status reads in `GET /api/reference/status` (`src/server/referenceRoutes.ts`).
  2. Enforce default `~/.x4forge` discovery isolation for `dev-build`, `release-host`, and `lab` instances in `src/lib/instanceDiscovery.ts` and `server.ts` so non-production/lab hosts without an isolated `X4FORGE_DISCOVERY_DIR` (or aliased via junction/case to `~/.x4forge`) never write, prune, or advertise `~/.x4forge/latest.json`.
- **Assumptions & References:**
  - `nativePerformanceIpc.selftest.ts:948` (`publicUnavailableCorpusHttpWitness`) strictly checks `data.instance` exact keys (`pid`, `port`, `startedAt`, `mode` + optional `version`). Therefore `publicForgeIdentity()` preserves those exact keys and adds `'lab'` to `PUBLIC_INSTANCE_MODES` while discovery isolation is enforced in `src/lib/instanceDiscovery.ts` + `/api/agent/status` (`discoveryFile: null` when unpublished).
  - Existing helpers reused: `canonicalDirectoryPath` and `isCanonicalSameOrDescendant` in `src/lib/pathRoles.ts`, `latestReferenceGeneration` in `src/lib/db.ts`.
  - References: `#53` body & Comments #46, #54, #55; `src/server/sharedSourceCoordinator.ts:819-843` (`resolveSourceCoordinationDirectory` isolation pattern).
- **In scope:**
  - `src/lib/referenceManifest.ts`: export `getCurrentReferenceManifestGeneration(rootInput, options)`.
  - `src/lib/referenceCorpus.ts`: retain `manifestSelection` (`{ generation, entries }`) in `cache`; skip `listReferenceManifestFiles` scans when `!force` and `getCurrentReferenceManifestGeneration(root)` equals `cache.manifestSelection.generation`, while still `statSync`ing all retained physical files; export `peekReferenceCorpus(rootInput)` and `getReferenceCorpusStats()` / `resetReferenceCorpusStats()` for selftests; add selftest assertions in `src/lib/referenceManifest.ts` (`runReferenceManifestSelftest`) / `src/lib/referenceCorpus.ts` (`runReferenceCorpusSelftest`).
  - `src/server/referenceRoutes.ts`: support `?observe=1` on `GET /api/reference/status` using `peekReferenceCorpus` + `getReferenceManifestStatus(..., { openDatabase: false })` without synchronously scanning or opening SQLite, preserving `503` + `instance` on invalid/missing reference roots and exact existing behavior without `?observe=1`.
  - `src/lib/instanceDiscovery.ts`: add `allowsDiscoveryForMode(mode, override, homeDir)`, guard `publishInstance` and `unpublishInstance` against touching `~/.x4forge` in `dev-build` / `release-host` / `lab` modes when `X4FORGE_DISCOVERY_DIR` is missing or canonicalizes to default `~/.x4forge`, and add positive/negative checks in `runInstanceDiscoverySelftest`.
  - `server.ts`: add `'lab'` to `PUBLIC_INSTANCE_MODES`, track whether discovery published (`discoveryPublished`), pass `SERVER_INSTANCE_MODE` to `unpublishInstance`, and emit `discoveryFile: null` in `/api/agent/status` when unpublished.
  - `scripts/reference-manifest-api-integration.mjs`: add live HTTP regression checks for expired-interval `GET /api/reference/status` reuse, physical disk mutation detection across unchanged manifest generation, `?refresh=1`, `?observe=1` non-blocking status, and `503` missing-root instance identity.
  - `config/durable-writers.json`: keep raw fs call counts identical (`0` new raw fs calls) and refresh `sourceFingerprint` only if slice offsets shift.
- **Out of scope:** Switching `FORGE DEVELOPMENT` IDE (`0.0.89`) before Machine-State Ask, releasing `0.0.94`, modifying `publicForgeIdentity()` key set, or changing `GET /api/reference/manifest` pagination semantics.
- **Risks & Rollback:**
  - Risk: Caching `manifestSelection` when physical files change on disk or a new manifest generation commits. Mitigated by checking `getCurrentReferenceManifestGeneration(root)` AND running `referenceFileStat` on every retained path on cache expiry; physical edit, removal, directory replacement, `clearReferenceCorpusCache()`, or `?refresh=1` still rebuild immediately.
  - Risk: `vscode-extension/src/sidecarSupervisor.ts` dynamically imports `../../src/lib/instanceDiscovery.js` under Node16 TypeScript resolution; verify extension `tsc --noEmit` alongside root `typecheck`.
  - Rollback: Revert only this commit's tracked changes against local HEAD `fb92bce`.
- **Acceptance Criteria:**
  1. When `cache` holds a completed `manifestGeneration`, rechecking corpus after `REFERENCE_SIGNATURE_CHECK_MS` performs `0` `listReferenceManifestFiles` SQLite queries while `manifestGeneration` is unchanged, yet detects physical edit/removal/replacement, `force=true`, and generation rollover.
  2. `GET /api/reference/status?observe=1` never blocks on synchronous corpus load or SQLite opening; returns `200` with cached corpus or `{ available: false, state: 'warming' | 'scanning', observed: true, instance, ... }` on valid cold root, and `503` with `instance` on invalid/unavailable root.
  3. `dev-build`, `release-host`, and `lab` instances without an isolated `X4FORGE_DISCOVERY_DIR` (or pointing at `~/.x4forge` directly or by subdirectory/alias) never write `latest.json` or `instances/<pid>.json` under `~/.x4forge`, and still publish normally when `X4FORGE_DISCOVERY_DIR` points to an isolated directory.
- **Required Validation & Negative Paths:**
  - `npm run test:writers` (`30/30` + audit + `8/8`)
  - `npm run typecheck` AND `npm --prefix vscode-extension run typecheck` (verify extension Node16 import compatibility!)
  - `npm run lint` (`0` errors)
  - `npm run test:reference-manifest-api` (including new status-reuse, physical-change-after-expiry, `?observe=1`, and `503` checks)
  - `npm run test:reference-api`
  - `npx tsx scripts/reference-manifest-check.ts` (if runnable directly; verify `runReferenceManifestSelftest` with decoy rows!)
  - `npm run test:capabilities`
  - `npm run test:oracles` (`instance-discovery-selftest`, `reference-corpus-selftest`, `path-roles-selftest`, all 134 oracles)
  - `npm run test:routes` & `npm run precommit:check`
  - Evidence location: this plan document (`## VALIDATE`, `## REVIEW & CLOSE`, `## AAR`).

## BASELINE
- Local git `HEAD`: `fb92bce` (`perf(deploy): fuse tree verification walks and coalesce target entry barrier (#97)`), clean working tree.
- `FORGE DEVELOPMENT` IDE (`PID 34076`, `0.0.89`) untouched.

## RECONCILE
- Verified `src/lib/referenceCorpus.ts` lacks `manifestSelection` path caching described in `#53` Comment #54/#55 (`ea9f169` only eliminated the second `statSync` per file, while `discoverReferenceFiles` still re-runs 3 paginated SQLite scans including `LIKE '%libraries/jobs.xml%'` every 1,000 ms).
- Verified `src/lib/instanceDiscovery.ts` does not guard `os.homedir()/.x4forge` for `dev-build`, `release-host`, or `lab` modes, unlike `src/server/sharedSourceCoordinator.ts:819-843`.
- Verified `nativePerformanceIpc.selftest.ts:948` checks exact keys on `data.instance`, so `discoveryFile` isolation belongs on discovery write/unpublish + `/api/agent/status` and `'lab'` mode support without breaking `publicForgeIdentity()` key contract.
- Capability-map delta: `no capability-map delta` (preserves registered route contracts and dispositions).

## IMPLEMENT
- `src/lib/referenceManifest.ts`: Exported `getCurrentReferenceManifestGeneration(rootInput, options)` (`latestReferenceGeneration(db, rootKey(root))?.id`) and extended `runReferenceManifestSelftest()` with 5 corpus-selection reuse checks (`1` selection on initial load, `0` extra SQLite scans on expired-interval check, physical file edit detection with unchanged manifest generation, `force` reselection, and rollover invalidation on a new completed manifest generation).
- `src/lib/referenceCorpus.ts`: Added `CachedManifestSelection`, `assertReferenceRootDirectory`, `peekReferenceCorpus`, `getReferenceCorpusStats`, `resetReferenceCorpusStats`, and `expireReferenceCorpusCheckCache`. When `!force` and `getCurrentReferenceManifestGeneration(root)` matches `cache.manifestSelection.generation`, `discoverReferenceFiles` skips the three paginated `listReferenceManifestFiles` SQLite queries and only runs `referenceFileStat` across retained entries.
- `src/server/referenceRoutes.ts`: Updated `GET /api/reference/status` to support `?observe=1` using `assertReferenceRootDirectory`, `getReferenceManifestStatus(root, { openDatabase: false })`, and `peekReferenceCorpus(root)` so cold observation never blocks on synchronous corpus builds or opening SQLite, while missing/invalid roots still return `503` with `instance`.
- `src/lib/instanceDiscovery.ts`: Exported `ISOLATED_DISCOVERY_MODES` (`dev-build`, `release-host`, `lab`), `defaultDiscoveryRoot`, and `allowsDiscoveryForMode`; guarded `publishInstance` and `unpublishInstance` against reading/writing/pruning default `~/.x4forge` (including nested paths and Windows case variants) unless an isolated `X4FORGE_DISCOVERY_DIR` is supplied; extended `runInstanceDiscoverySelftest()` with 20+ positive/negative isolation checks.
- `server.ts`: Added `'lab'` to `PUBLIC_INSTANCE_MODES`, tracked `serverDiscoveryPublished` so `/api/agent/status` emits `discoveryFile: null` when discovery is skipped, and passed `SERVER_INSTANCE_MODE` to `unpublishInstance`.
- `scripts/reference-manifest-api-integration.mjs`: Added HTTP integration checks for `GET /api/reference/status?observe=1`, 1s-expiry corpus reuse, physical edit detection under unchanged manifest generation, and a spawned `release-host` child without `X4FORGE_DISCOVERY_DIR` verifying `~/.x4forge` stays absent while `?observe=1` returns `503` with `instance.mode === 'release-host'`.
- `config/durable-writers.json`: Verified raw fs call counts unchanged (`545`/`23`/`32`/`4`) and updated `sourceFingerprint` to `51213cb1c4a0f2ca1fb7cc6bf373da96d86b926f12448f59d64e5b9163cb6012`.

## VALIDATE
- `npm run test:writers`: PASS (`30/30` selftest, durable-writer audit PASS across `50` raw filesystem / `12` host-store / `4` browser-output / `3` SQLite owners, `durableWrite selftest: 8/8`, exit `0`).
- `npm run typecheck` & `npx --prefix vscode-extension tsc -p vscode-extension/tsconfig.json --noEmit`: PASS (exit `0`; verifies Node16 module resolution for `sidecarSupervisor -> instanceDiscovery -> pathRoles`).
- `npm run lint`: PASS (`0` errors, `601` warnings, exit `0`).
- `npm run test:capabilities`: PASS (`25` capabilities, `318` disposed literal routes, `1` dynamic registrar, `23` MCP aliases, exit `0`).
- `npx tsx scripts/reference-manifest-check.ts`: PASS (`13/13` checks: `manifestSelections=1`, expired reuse `manifestSelectionReuses=1`/`manifestSelections=1`, physical edit `corpusRebuilds=2`/`manifestSelections=1`, `force` `manifestSelections=2`, rollover `manifestSelections=3`, exit `0`).
- `npm run test:reference-manifest-api`: PASS (`21/21` checks including `observe=1`, 1s expiry reuse, physical edit detection, `release-host` missing `X4FORGE_DISCOVERY_DIR` non-publication + `503` `instance`, exit `0`).
- `npm run test:oracles`: PASS (`134/134` green including `/agent/instance-discovery-selftest` and `/agent/reference-corpus-selftest 32/32`, exit `0`).
- `npm run test:routes`: PASS (`621/621 PASS`, exit `0`).
- `npm run precommit:check`: PASS (`[precommit] OK`, exit `0`).

## REVIEW & CLOSE
- **Status:** `PARTIAL` overall for GitHub `#53` (bounded Dev source, isolated SQLite/API runtime, and Node16 extension typecheck **VERIFIED**; packaged VSIX & installed `FORGE DEVELOPMENT` IDE upgrade/verification pending Machine-State Ask & release qualification).
- **What changed:** Manifest path-selection cache for unchanged completed generations, `?observe=1` non-blocking status route, default `~/.x4forge` isolation guard for `dev-build`/`release-host`/`lab`, `'lab'` public instance mode, and regression suites.
- **What stayed unchanged:** Exact 4/5-key `publicForgeIdentity()` payload shape (`pid`, `port`, `startedAt`, `mode`, optional `version`) required by `publicUnavailableCorpusHttpWitness`, plus packaged VSIX / live IDE binary (`0.0.89`).
- **Baseline baseline finding (out of `#53` scope):** Pre-existing `npm run test:reference-api` failed `92/93` on `quoted MD order ID returns an exact quoted replacement` (`scripts/reference-api-integration.mjs:204`) introduced in `b2d3f0b7` (`0.0.90`), because `create_order id="'Att|ack'"` emits order ID label `'Attack'` while line 204 searches for `candidate.label === aiScript` (`'order.player.attack'`). Logged for separate test fix.
- **Suggested commit title:** `fix(discovery): isolate lab/release discovery and cache manifest corpus selection (#53)`

## AAR
- **Triggers:** First `test:oracles` run caught explicit `undefined` overriding JS default parameter `override = process.env.X4FORGE_DISCOVERY_DIR` in `allowsDiscoveryForMode`; durable-writer fingerprint refresh required after adding `allowsDiscoveryForMode` to `src/lib/instanceDiscovery.ts`; running `test:reference-api` exposed the unrelated pre-existing `92/93` `quotedCalls[0]` bug from `b2d3f0b7`.
- **Sustain:** Checking `vscode-extension/tsconfig.json` (`Node16`) before importing `pathRoles.js` and inspecting `publicUnavailableCorpusHttpWitness` before touching `publicForgeIdentity()` avoided breaking packaged extension resolution and exact-key HTTP witnesses.
- **Improve work/approach:** Never rely on JS default parameter fallbacks (`x = env.VAR`) when a test API passes explicit `undefined`; accept an options bag checked with `'override' in options`.
- **Improve tools:** Dynamic `await import('./referenceCorpus')` inside `runReferenceManifestSelftest()` cleanly avoids static circular imports while keeping manifest+corpus selftests executable under isolated SQLite DBs.
- **Highest-risk evidenced weakness:** `npm run test:reference-api` is not part of `precommit:check` and has silently drifted red (`92/93`) since `0.0.90` (`b2d3f0b7`) due to `candidate.label === aiScript`; fix and verify `test:reference-api` independently before cutting `0.0.94`.
