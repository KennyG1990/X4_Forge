# Unit 37 Plan & Close — `#19` P4 Slice 14: Reference-Manifest File Pagination, Live Bridge State, Cue/FORGE-WATCH Telemetry, Game-Log Status/Lua-Staleness & Runtime-Control Status over MCP

- **Status:** `VERIFIED` (isolated Dev source, governance manifests, `134/134` oracles, `785/785` HTTP routes, and real stdio MCP; `#19` remains `PARTIAL` pending remaining census slices & `0.0.94` installed IDE/E2E qualification)
- **Date:** 2026-11-24
- **Lane:** `FULL`
- **Owning Issues:** `#19` (UI-Action Parity Census P4 Slice 14: `reference.corpus.browse_and_search`, `runtime.logs_and_probes.diagnose`)
- **Baseline HEAD:** `8379ef2d7c969879a33204b63c39d0df9e8de46a` (`134/134` oracles, `779/779` routes, `98` capabilities, `99` MCP tools, `50` raw filesystem writer sources)

## 1. Scope, Non-Goals & Acceptance Contract

- **Bounded unit:**
  1. Project `reference.manifest.list@1` (`list_reference_manifest_files` -> `GET /api/agent/reference/manifest`), paginating the SQLite reference manifest by `q`, `extension`, `source`, `domain`, `role`, `authority`, `consumer`, `limit` (`1..500`, default `100`), `offset` (`0..1000000`, default `0`), `refresh` (`'0' | '1'`), and `observe` (`'0' | '1'`) while redacting `status.root`, `status.database`, and `status.current.root`.
  2. Project `runtime.bridge.read@1` (`get_live_bridge_state` -> `GET /api/agent/runtime/bridge-state`), returning normalized external runtime `/health` + SQLite `bridge_events` activity (`bridgeUp`, `gameActive`, `lastEventAgoMs`, `lastEventKind`, `eventsLastHour`, `errorsLastHour`, `summary`) with zero host paths.
  3. Project `runtime.control.read@1` (`get_runtime_control_status` -> `GET /api/agent/runtime/control-status`), returning addressed-workspace runtime reload companion status (`enabled`, `modId`, `workspaceId`, `workspaceHash`, `sessionId`, `helperAvailable`, `logRead`, `supportedCommands`, `request`, `gameVerified`, `note`) with zero host paths.
  4. Project `runtime.cue.telemetry@1` (`analyze_cue_telemetry` -> `POST /api/agent/runtime/cue-telemetry`, `LEDGER_QUIET_ROUTES`), reading per-cue fire/error counts + `FORGE-WATCH` values + `bridge` liveness from the active X4 debug log tail for explicit `cueNames` (`1..500`) or the addressed workspace's cue nodes, redacting `logPath`.
  5. Project `runtime.gamelog.read@1` (`get_game_log_status` -> `GET /api/agent/runtime/game-log`), wrapping `getGameLogStatus` with host-path redaction (`selectedLogPath`, `checkedPaths`, `lastDeploy.deployedPath` omitted; recursive `scrubHostPathsDeep` applied to prose/lines) to surface live X4 log classification, `cueLiveness`, `luaStaleness` (`#7`), `states`, `loadEvidence`, `diagnosis`, and bounded `issues`/`tailLines`.
- **Out of scope:** Arbitrary host-path `POST /api/agent/log-file-tail`, legacy removed-UI `npc-identity-probe` routes, disk-mutating `POST /api/agent/lua-staleness/instrument`, `POST /api/agent/runtime-control/reload`, Open VSX publishing, and restarting `FORGE DEVELOPMENT` IDE (`PID 34076`).
- **Risks & authorization boundaries:**
  - Zero new raw `fs.*` writer calls (`config/durable-writers.json` stays at `50` raw writers and identical `sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c`).
  - Redact all host paths (`root`, `database`, `logPath`, `selectedLogPath`, `checkedPaths`, `deployedPath`) and never include `'timestamp'` or `'generatedAt'` in `FORGE_CAPABILITIES`.
- **Planned rollback:** Restore touched source/manifest files from `8379ef2` via `git show HEAD:<path>` + `fs.writeFileSync` and remove this plan file if needed before commit.

## 2. Reconciled Infrastructure Reused

- `queryReferenceManifest`, `getReferenceManifestStatus`, `scheduleReferenceManifest`, and `redactReferenceManifestForAgent` in `src/server/referenceRoutes.ts` + `src/lib/referenceManifest.ts`.
- `getBridgeLiveState` in `src/server/liveBridge.ts`.
- `RuntimeControl.status` in `src/server/runtimeControl.ts` + `server.ts` (note: `RuntimeControl.preview` embeds host `this.channel(subject.workspaceId)` inside generated Lua, so only host-path-free `RuntimeControl.status` is projected).
- `parseLogTelemetry`, `parseForgeWatches`, `getGameLogStatus`, and `scrubBugReportValue` (`scrubHostPathsDeep`) in `server.ts` + `src/lib/forgeKnowledge.ts`.
- Capability-map delta: `98 -> 103` canonical capabilities (`100` non-native), `99 -> 104` stdio MCP tools (`MCP_MODULE_AUDIT_VERSION = 40`), `387 -> 392` disposed literal routes (`SHA-256: 0b55373ef30436e3fd4d29294b3bdf2c7e03ce1ddeaef7ca37238fa8fb262a47`), `134 -> 135` action-receipt-coverage routes (`69` surfaces, `manifestSha256: 7ef7327de8ab0f9e22911188e69a7b45f656d93575f819f3a45ab14021a08e9d`, `envelopeSha256: cde2964d813d2dc1872183bb4290ead15abb2a50e092b9ef89d0a3a5b297cd63`), Contract SHA-256 `31724907e748011008c53a2aa783eaddce6fd3fc42158cb2e8c6ce65056b853f`, UI-action parity SHA-256 `d34139443cf4a180350d66c86603b24f08ca2e796f1414976b0b7db0b44e5173`.

## 3. Validation Evidence

- `npm run lint -- --max-warnings 600` -> `0` errors, `579` warnings (`<= 600` threshold)
- `npm run typecheck` -> `0` errors
- `npm run test:writers` -> `[durable-writer audit selftest] 30/30`, `[durable-writer audit] PASS — 50 raw filesystem source(s)` (`sourceFingerprint: 8ab984878d555b270660cf5e2a3e43e3ab817e25299e03c0f7503e639a156f9c` unchanged), `durableWrite selftest: 8/8`
- `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`103` capabilities, `392` disposed literal routes, `104` MCP aliases, `51` UI-action parity rows)
- `npm run test:action-receipt-coverage` & `npm run test:action-receipt-coverage:selftest` -> `PASS` (`135` routes / `69` surfaces, `79/79` candidate + `23/23` promotion)
- `npx tsx scripts/c06-contracts.selftest.ts` -> `196/196 PASS`
- `npx tsx scripts/c06-api.selftest.ts` -> `42/42 PASS`
- `npm run test:mcp-capabilities` -> `PASS` (`read=58, write=63, deploy=64`, `md-navigation-mcp` + `ai-navigation-mcp` + `native-performance-mcp 30/30`)
- `npm run test:native-deploy-mcp` -> `6/6 PASS`
- `npm run test:workspace-files-mcp` -> `17/17 PASS` (including `17_reference_manifest_pagination_and_live_runtime_diagnostics_over_mcp` testing SQLite reference-manifest file pagination + domain filtering + `root`/`database` redaction, live `FORGE-LUAV` Lua staleness & game-log diagnosis with host-path scrubbing, `analyze_cue_telemetry` fire/error + `FORGE-WATCH` parsing without Action Ledger noise, `get_live_bridge_state`, `get_runtime_control_status`, and closed-schema negative rejections)
- `npm run build` -> `dist/server.cjs` + `dist/canonical-md-worker.cjs` + Vite bundle built (`0`)
- `npm run test:oracles` -> `134/134 green`
- `npm run test:routes` (with `X4_REFERENCE_ROOT` & `X4_XSD_PATH` unset) -> `785/785 PASS`
- `npm run precommit:check` -> `[precommit] OK`

## 4. Close & Triggered AAR

- **Close status:** `VERIFIED` (suggested commit title: `feat(mcp): reference manifest pagination and live runtime diagnostics (#19)`).
- **Remaining risks / deferred work:** Arbitrary host-path `POST /api/agent/log-file-tail`, in-place `POST /api/agent/lua-staleness/instrument`, `POST /api/agent/runtime-control/reload`, and legacy removed-UI `npc-identity-probe` stay intentionally unprojected over MCP; `0.0.94` packaged VSIX + installed `FORGE DEVELOPMENT` IDE qualification remain gated on Ken's Machine-State Ask + Write Gate (next 3-unit release readiness review due on Unit 38).
- **AAR Triggers:** (1) Initial `typecheck` caught `scrubBugReportValue` accepting `string` rather than arbitrary objects/arrays; (2) running `runForgeCapabilitiesSelftest()` prior to promoting `config/forge-route-dispositions.json` failed `scopeAllows` for the 5 newly registered `/api/agent/*` routes.
  1. **Points to sustain:** Reconciling `npcIdentityProbe.ts` (`"The UI panel was removed by Ken"`) and `RuntimeControl.preview` (which embeds host `this.root` channel paths inside generated Lua) prevented projecting legacy or host-path-leaking endpoints over MCP while delivering complete read/analyze parity for SQLite reference-manifest pagination and live X4 log/Lua-staleness/cue/bridge/runtime-control diagnostics with zero new `fs.*` writer calls.
  2. **Points to improve — work/approach:** Always promote `config/forge-route-dispositions.json` (`--generate-candidate` -> patch `resourceClass`/`workspaceMode`/`agentScopes` -> `--promote-candidate`) *before* invoking `runForgeCapabilitiesSelftest()`, since `validateForgeCapabilities` verifies `scopeAllows` against the live disposition manifest.
  3. **Points to improve — tools:** Added recursive `scrubHostPathsDeep<T>(value: T): T` in `server.ts` so nested diagnostic structures (`diagnosis`, `issues`, `recentGlobalIssues`, `tailLines`) get uniform host-path scrubbing without unsafe type casts.
  4. **Highest-risk observed weakness:** `No evidenced risk delta` beyond the documented pre-promotion `scopeAllows` order above, banked in `SESSION-HANDOFF.md`.
