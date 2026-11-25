# Unit 52 — Post-Update Discovery Pruning, Schema Instance Identity & Headless CLI/MCP Cold Sidecar Bootstrap (`#53`, `FF-14`)

Task: Eliminate post-update stale `~/.x4forge/latest.json` records on IDE activation, expose public instance identity on `GET /api/agent/schema`, stop offline Studio webview badges from naming dead ports, and add a pure-stdlib headless CLI/MCP cold sidecar bootstrap wrapper (`out/mcp-bootstrap.js`) that discovers live IDE sidecars, refuses `lab`/`release-host` impostors, and cold-starts an owned supervised sidecar when the IDE has not been opened (`#53`, `FF-14`)
Lane: FULL | Status: VERIFIED

## PLAN
- **Bounded unit:** Close all remaining `#53` (`FF-14`) and `SESSION-HANDOFF.md` (`Unit 52`) items:
  1. **Zero-I/O Public Instance Identity on `GET /api/agent/schema` (`server.ts`):** Include `instance: publicForgeIdentity()` (`{ mode, pid, port, startedAt, version? }`) on `GET /api/agent/schema` so fast public schema probes (`probeForge`, `mcpBootstrap`, CLI/agent discovery) immediately observe exact server `pid`, `port`, `startedAt`, `mode`, and `version` without triggering reference-corpus I/O or altering `publicForgeIdentity()`'s key set (`mode,pid,port,startedAt,version`).
  2. **IDE Activation Stale Discovery Pruning & Offline Studio Badge (`vscode-extension/src/extension.ts`):** Call `pruneDeadInstances()` (`src/lib/instanceDiscovery.ts`) on extension activation when `allowsDiscoveryForMode(process.env.X4_FORGE_MODE)` holds so dead pre-update `latest.json` and `instances/<pid>.json` records never outlive IDE startup even before Studio is opened; update `webviewHtml` `#forge-badge` on `backend-offline` so stopped Studio panels never keep naming a dead port.
  3. **Headless CLI & Cold MCP Sidecar Bootstrap (`vscode-extension/src/mcpBootstrap.ts` -> `vscode-extension/out/mcp-bootstrap.js`):**
     - Keep `vscode-extension/mcp/x4forge-mcp.cjs` 100% untouched (`const BASE = ...` immutable, zero `MCP_MODULE_AUDIT_VERSION` churn, zero `durable-writers.json` write additions).
     - Implement `discoverLiveForgeInstance` & `resolveOrBootstrapForgeEndpoint` in `vscode-extension/src/mcpBootstrap.ts` (zero `fs.*` writes — read-only discovery + supervised child spawn):
       - Discovers live `latest.json` / `instances/*.json` records, probes `GET /api/agent/schema` (falling back to `GET /api/reference/status?observe=1`), verifies `instance.pid === record.pid` & `instance.port === record.port`, and **refuses** `instance.mode` in `['lab', 'release-host', 'dev-build']` unless `X4FORGE_DISCOVERY_DIR` was explicitly pointed outside `~/.x4forge` (or `X4FORGE_ALLOW_ISOLATED_HOST === '1'`).
       - When `X4FORGE_URL` is omitted, empty, or `'auto'` and no eligible live instance answers (e.g. IDE has not been opened), cold-bootstraps an owned supervised local sidecar (`out/sidecar-supervisor.js` + `app/dist/server.cjs` or `X4FORGE_FORGE_ROOT/dist/server.cjs`) on `127.0.0.1:<freePort>` with `X4_FORGE_PARENT_MODE=pipe-v1` and optional `X4FORGE_STORAGE_DIR` (`state`/`config`/`data` parity with `extension.ts:695-705`), tearing down the owned sidecar cleanly on MCP `stdin` EOF or `--exec` exit (`0` orphan processes).
       - Supports MCP stdio forwarding (default), `--resolve-json` (read-only discovery check), and `--exec <cmd> [args...]` (bounded CLI execution against a discovered or cold-bootstrapped sidecar).
  4. **Packaging, Manual MCP Config Fallback & CI Gate:**
     - Bundle `src/mcpBootstrap.ts -> out/mcp-bootstrap.js` in `vscode-extension/scripts/build-ext.mjs`, whitelist `!out/mcp-bootstrap.js` in `vscode-extension/.vscodeignore`, and enforce `'extension/out/mcp-bootstrap.js'` in `vscode-extension/scripts/inspect-vsix.mjs` (`19/19` selftest).
     - Add optional `bootstrapPath`, `storageDir`, and `forgeRoot` support to `buildManualMcpConfigFallback` (`vscode-extension/src/mcpRegistrationLifecycle.ts`) and wire them in `copyMcpConfig` (`vscode-extension/src/extension.ts`) while keeping existing `shimPath`-only callers byte-identical.
     - Add `scripts/mcp-cold-bootstrap.selftest.ts` (`npm run test:mcp-cold-bootstrap`) and wire it into `.github/workflows/quality.yml`.
- **Assumptions & authoritative references:**
  - GitHub Issue `#53` (`FF-14`: `https://github.com/KennyG1990/X4_Forge/issues/53`).
  - `src/lib/instanceDiscovery.ts`, `vscode-extension/src/sidecarSupervisor.ts`, `vscode-extension/scripts/probe-staged-app.mjs:623`, `scripts/capability-contract-audit.ts:4286`.
  - `no capability-map delta`; `0` new raw `fs.*` writer calls (`config/durable-writers.json` `50` raw writers preserved, `sourceFingerprint` updated in place for `extension.ts`).
- **Out of scope:** Modifying `vscode-extension/mcp/x4forge-mcp.cjs` or changing `publicForgeIdentity()`'s key set.
- **Risks & rollback:** Cold-bootstrapped sidecars must never outlive their owning MCP/CLI process; `sidecar-supervisor.js` (`pipe-v1`) + explicit `stdin` EOF teardown guarantees deterministic reaper cleanup. Rollback target: `e788d141b12b07cf5fdf0a874d18bd71c8a3fd26`.
- **Acceptance criteria & validation:**
  1. `GET /api/agent/schema` includes `instance` matching `publicForgeIdentity()` (`route-integration.mjs` + `mcp-cold-bootstrap.selftest.ts`).
  2. Dead `latest.json` and `instances/<pid>.json` records are pruned by `pruneDeadInstances()`, and `mcpBootstrap` refuses `lab` / `release-host` hosts on default discovery (`LAB_HOST_REFUSED`) and PID-mismatched impostors (`PID_MISMATCH`).
  3. Cold MCP stdio session via `out/mcp-bootstrap.js` (with zero pre-running Forge servers and an `x4fk_` `write` key in `X4FORGE_STORAGE_DIR/data/agent-keys.json`) boots an owned supervised sidecar, advertises all `73` `write`-preset MCP tools, executes `get_driver_lease` & `get_workspace`, and on `stdin` EOF exits `0`, reaps the sidecar PID, and removes `latest.json`.
  4. CLI `node out/mcp-bootstrap.js --exec ...` runs a command against a cold-bootstrapped sidecar and tears down the sidecar on exit.
  5. `inspect-vsix.mjs --selftest` (`19/19`), `probe-staged-app.mjs` (`33/33`), `test:extension-mcp-lifecycle` (`5/5`), `test:writers`, `test:capabilities`, `test:oracles` (`134/134`), `test:routes`, and `precommit:check` pass.

## BASELINE
- **Revision:** `e788d141b12b07cf5fdf0a874d18bd71c8a3fd26` (`main == origin/main`, `v0.0.95`), clean working tree.

## RECONCILE
- **Resources & callers searched:** `src/lib/instanceDiscovery.ts` (`35-218`), `server.ts` (`545-584`, `4997-5015`, `26421-26443`), `src/server/referenceRoutes.ts` (`833-882`), `vscode-extension/src/extension.ts` (`646-755`, `1019-1073`, `1410-1443`, `1555-1695`, `2520-2551`), `vscode-extension/src/mcpRegistrationLifecycle.ts` (`336-372`, `1035-1046`), `vscode-extension/mcp/x4forge-mcp.cjs` (`24-27`, `5078-5305`), `scripts/capability-contract-audit.ts` (`3273-4315`), `vscode-extension/scripts/probe-staged-app.mjs` (`371-638`), `vscode-extension/scripts/inspect-vsix.mjs` (`14-290`).
- **Capability-map delta:** `no capability-map delta`.

## IMPLEMENT
- **Actual bounded changes (`10` files):**
  - `server.ts` (`line 5002`) & `scripts/route-integration.mjs`: Added `instance: publicForgeIdentity()` (`{ mode, pid, port, startedAt, version? }`) to `GET /api/agent/schema` without altering `publicForgeIdentity()`'s key set (`802/802` routes).
  - `vscode-extension/src/extension.ts`: Added non-blocking `import("../../src/lib/instanceDiscovery.js")` activation-time `pruneDeadInstances()` cleanup when `allowsDiscoveryForMode(process.env.X4_FORGE_MODE)` holds, updated `webviewHtml` `#forge-badge` on `backend-offline` to stop naming dead ports (`X4 Forge Studio — backend stopped`), and wired `bootstrapPath`, `storageDir`, and `forgeRoot` into `copyMcpConfig`.
  - `vscode-extension/src/mcpRegistrationLifecycle.ts`: Extended `buildManualMcpConfigFallback` with optional `bootstrapPath`, `storageDir`, and `forgeRoot` while keeping `shimPath`-only callers byte-identical.
  - `vscode-extension/src/mcpBootstrap.ts` [new]: Added pure-stdlib (`0` `fs.*` writes) live discovery (`discoverLiveForgeInstance`, `probeForgeEndpoint`) and cold supervised sidecar bootstrap (`spawnOwnedColdSidecar`, `resolveOrBootstrapForgeEndpoint`), refusing `lab`/`release-host`/`dev-build` hosts on default discovery (`ISOLATED_HOST_REFUSED`) and PID-mismatched impostors (`PID_MISMATCH`), supporting MCP stdio wrapping (default), `--resolve-json`, and `--exec <cmd> [args...]`, stripping `STUDIO_API_TOKEN` from child processes, and reaping cold-bootstrapped sidecars on `stdin` EOF / exit via `sidecar-supervisor.js` (`pipe-v1` + Windows Job Object).
  - `vscode-extension/scripts/build-ext.mjs`, `vscode-extension/.vscodeignore`, & `vscode-extension/scripts/inspect-vsix.mjs`: Bundled `out/mcp-bootstrap.js`, whitelisted `!out/mcp-bootstrap.js`, and enforced `'extension/out/mcp-bootstrap.js'` in `REQUIRED` (`19/19` selftest).
  - `scripts/mcp-cold-bootstrap.selftest.ts` [new], `package.json`, & `.github/workflows/quality.yml`: Added `7/7` end-to-end selftest (`npm run test:mcp-cold-bootstrap`) and wired it into CI `Quality`.
- **Deliberately unchanged:** `vscode-extension/mcp/x4forge-mcp.cjs` (`const BASE` immutable per `capability-contract-audit.ts:4286`) and `config/durable-writers.json` (`50` raw writers, `sourceFingerprint: 74f0a969...` unchanged).

## VALIDATE
- `npm run typecheck` -> `0` errors; `npm run build --prefix vscode-extension` (`tsc --noEmit` + `esbuild`) -> `0` errors
- `npm run lint -- --max-warnings 600` -> `0` errors, `578` warnings
- `npm run test:mcp-cold-bootstrap` -> `7/7 PASS` (`activation_prune_dead_discovery`, `manual_fallback_bootstrap_config`, `schema_exposes_instance_identity`, `lab_host_and_pid_mismatch_refused`, `live_sidecar_discovery_attaches`, `cold_mcp_stdio_bootstrap_and_clean_eof_reap`, `cli_exec_cold_bootstrap_and_reap`)
- `npm run test:extension-mcp-lifecycle` -> `5/5 passed`
- `npm run test:writers` -> `30/30 + PASS (50 raw writers) + 8/8`
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`113` capabilities, `402` routes, `114` MCP aliases)
- `npm run test:action-receipt-coverage` -> `141/69 PASS`
- `npm run test:oracles` -> `134/134 green`
- `npm run test:routes` -> `802/802 PASS` (`schema_exposes_public_instance_identity` green)
- `npm run probe-app --prefix vscode-extension` -> `33/33 PASS`
- `node vscode-extension/scripts/inspect-vsix.mjs --selftest` (`19/19 PASS`) + packaged VSIX inspection (`2,174` entries, `PASS`)
- `npm run precommit:check` -> `[precommit] OK`

## REVIEW
- Activation-time dead discovery pruning -> **Done and evidenced** (`extension.ts:1563`, `mcp-cold-bootstrap.selftest.ts`).
- `GET /api/agent/schema` zero-I/O `instance` identity -> **Done and evidenced** (`server.ts:5002`, `route-integration.mjs`, `probe-app` `33/33`).
- Offline Studio badge stops naming dead port -> **Done and evidenced** (`extension.ts:1062`).
- Cold CLI/MCP sidecar bootstrap + `lab`/`release-host` refusal + clean EOF reaper -> **Done and evidenced** (`mcpBootstrap.ts`, `mcp-cold-bootstrap.selftest.ts` `7/7`).
- Public `0.0.96` VSIX delivery -> **Pending next 3-unit release cycle** (due on Unit 54).

## CLOSE
- **Status:** `VERIFIED` (Dev source, `7/7` cold-bootstrap selftest, `134/134` oracles, `802/802` routes, `33/33` staged-app probe, `19/19 + PASS` VSIX inspector, and `precommit:check` green; keeping `#53` open strictly until `0.0.96` public VSIX delivery).
- **Suggested commit title:** `feat(discovery): add cold CLI/MCP sidecar bootstrap and activation prune (#53)`

## AAR
- **Triggers:** (1) Static `import ... from "../../src/lib/instanceDiscovery"` in CommonJS `extension.ts` triggered `TS1479` / `TS2835` under `module: "Node16"` (fixed via `import("../../src/lib/instanceDiscovery.js")` bundled by `esbuild` with zero new writer sites); (2) `if (require.main === module)` inside `mcpBootstrap.ts` fired when imported via `tsx` from ESM `scripts/mcp-cold-bootstrap.selftest.ts` (caught immediately by checking for explicit `PASS` output rather than trusting exit code `0`, and fixed by checking `process.argv[1]` against `mcp(-b|B)ootstrap`).
- **Sustain:** Checking `scripts/capability-contract-audit.ts:4286` (`const BASE` immutability in `x4forge-mcp.cjs`) and `probe-staged-app.mjs:623` (`Object.keys(instance)`) during `RECONCILE` led directly to the zero-churn `out/mcp-bootstrap.js` wrapper architecture.
- **Improve work/approach:** Never use `if (require.main === module)` in hybrid CJS/TS modules imported by `tsx` selftests; always guard CLI entrypoints by matching `process.argv[1]`.
- **Improve tools:** `mcp-cold-bootstrap.selftest.ts` is now wired into `.github/workflows/quality.yml` to guard cold MCP stdio and `--exec` sidecar reaping on every push.
- **Highest-risk evidenced weakness:** `tsx` sets `require.main === module` on the first required CJS TypeScript module imported from an ESM script, which can silently execute CLI `main()` and call `process.stdin.destroy()` with exit code `0`; mitigated via explicit `process.argv[1]` basename matching and per-check `PASS` logging.
- **Lessons banked:** Recorded `tsx` `require.main === module` hazard and `Unit 52` state in `SESSION-HANDOFF.md`.
