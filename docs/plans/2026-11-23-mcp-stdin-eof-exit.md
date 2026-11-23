# MCP Stdin EOF Clean Teardown on Windows Node 24

Status: VERIFIED (bounded MCP client teardown unit; isolated compiled and precommit checks pass; installed IDE VSIX repack remains open for next release build)

## Task Record

Task: Fix intermittent/reproducible Windows `0xC0000409` (`3221226505`) crash in `vscode-extension/mcp/x4forge-mcp.cjs` on stdin EOF during `test:mcp-capabilities` / `precommit:check`.
Lane: FULL

### PLAN
- Bounded unit: Retire pending discovery requests and let `x4forge-mcp.cjs` exit naturally on `stdin` EOF instead of invoking synchronous `process.exit(0)` inside `rl.on("close")` on Windows libuv (`Node v24.15.0`, `uv 1.51.0`).
- Assumptions: Active handles on `stdin` EOF are limited to `recoveryTimer` (`unref`), `nativeRequests` timers/controllers, legacy `discoveryController`, and `process.stdin`; idle keep-alive sockets created by `fetch()` do not hold Node's event loop open after requests settle or abort.
- In scope: `vscode-extension/mcp/x4forge-mcp.cjs` EOF close handler and `discoveryController` abort tracking, plus the required reviewed capability-audit manifest version bump (`scripts/capability-contract-audit.ts`, `config/forge-route-dispositions.json`).
- Out of scope: Changing MCP tool names, schemas, scopes, discovery state machine semantics, or repackaging VSIX (`FORGE DEVELOPMENT` IDE untouched).
- Risks and authorization boundaries: Modifying `x4forge-mcp.cjs` changes the reviewed MCP module signature in `config/forge-route-dispositions.json` and requires `--generate-candidate`, diff inspection confirming no route/tool/scope drift, and `--promote-candidate <sha256>`.
- Rollback/checkpoint: Revert commits touching `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/capability-contract-audit.ts`, and `config/forge-route-dispositions.json` in `G:\Forge-QA\forge-development` (`git checkout` / reverse patch; base `e9c12e17a3c543d709de5df7749b00403ca49801`).
- Acceptance criteria:
  - Child stderr capture no longer hits `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`.
  - `npm run test:mcp-capabilities` passes all suites (`legacy`, `md-navigation-mcp`, `ai-navigation-mcp`, `native-performance-mcp` `30/30`).
  - Hung legacy discovery (`tools/list` without headers/response) exits `0` promptly on `stdin` EOF and aborts the server HTTP request.
  - `npm run test:capabilities` passes with only `mcpModuleSignature` (`22 -> 23`) changed in `config/forge-route-dispositions.json`.
  - `npm run precommit:check` exits `0`.

### BASELINE
- Revision: `e9c12e17a3c543d709de5df7749b00403ca49801` + `#97` Unit 1 working-tree edits (orthogonal to `vscode-extension/mcp/`).
- Failure reproduced under `Node v24.15.0`: `npm run test:mcp-capabilities` failed deterministically at `scripts/mcp-capability-selftest.ts:1979` (`3221226505 !== 0`) and intermittently (`25/30`, shifting failing test cases) in `--native-performance-selftest`.
- Spy hook on `child_process.spawn` captured exact child stderr on failure: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`. Even deferring `process.exit(0)` by `25 ms` still hit `3221226505`, whereas `process.stdin.destroy()` without `process.exit(0)` exited `0` reliably.

### RECONCILE
- Searched `vscode-extension/mcp/x4forge-mcp.cjs`, `scripts/mcp-capability-selftest.ts`, `scripts/capability-contract-audit.ts`, and `src/lib/forgeCapabilities*.ts`.
- Confirmed capability anchors use symbol selectors (`::name: "..."`), not line numbers.
- Confirmed `capability-contract-audit.ts` pins `MCP_MODULE_AUDIT_VERSION` and `mcpModuleSignature` in `config/forge-route-dispositions.json`.

### IMPLEMENT
- `vscode-extension/mcp/x4forge-mcp.cjs`: added module `discoveryController` aborted inside `disposeNativeTransport()`, replaced `rl.on("close", () => process.exit(0))` with `process.stdin.destroy()` inside `rl.once("close")`.
- `scripts/capability-contract-audit.ts`: bumped `MCP_MODULE_AUDIT_VERSION` from `22` to `23`.
- Generated candidate `adacd421d63b3592eed762265a4ae809649d6d28c86b805e8e16302b86c4d13e`, verified via JSON diff that only `mcpModuleSignature` (`version: 22 -> 23`, `hash: a3d430b336cd63a7caa4fffdf8bb5db2b9408e881de7d15885775edb2c430cba -> 92d1f3d465f8edf46dbdc0dd189bc1e2a04d44221a11d65807a9e40825426061`) changed, promoted to `config/forge-route-dispositions.json`, and removed `test-results/forge-route-dispositions.candidate.json`.

### VALIDATE
- `npm run test:capabilities` -> PASS (`25 capabilities, 318 disposed literal routes, 1 reviewed dynamic registrar(s), 23 MCP aliases`, Contract SHA-256 `c5d7f937c4ce9e3f5c3366151c23d83dd0b5f0a90d1c10bfbce95ce3d3453969`, exit `0`).
- `npm run test:mcp-capabilities` -> PASS (`legacy` causal controls + `read=13, write=17, deploy=18`, `md-navigation-mcp` `1.415s`, `ai-navigation-mcp` `1.304s`, `native-performance-mcp` `30/30 PASS`, exit `0`).
- Negative/hung-EOF check: spawned `x4forge-mcp.cjs` with `tools/list` held open on an HTTP server, ended `stdin` after `100 ms` -> `LEGACY_HUNG_EOF: { code: 0, sig: null, ms: 133, aborted: true }`.
- `npm run precommit:check` -> `[precommit] OK` (exit `0`).
- `npm run test:routes` (`616/616 PASS`, exit `0`) and `npm run test:oracles` (`134/134 green`, exit `0`).

### REVIEW & CLOSE
- Status: `VERIFIED` (source/selftest/precommit/route/oracle layers; packaged VSIX & live IDE host remain deferred until next release build).
- Capability-map delta: `mcpModuleSignature` version bumped `22 -> 23` in `config/forge-route-dispositions.json`; no capability behavior or schema change.
- Suggested commit title: `fix(mcp): retire cleanly on stdin EOF without Windows libuv async abort`

### AAR
- Triggers: A required gate (`precommit:check` -> `test:mcp-capabilities`) failed on baseline Windows Node `v24.15.0` due to pre-existing `process.exit(0)` teardown race against closing libuv async handles, and an initial `setTimeout(..., 25)` hypothesis also failed before root-cause isolation (`UV_HANDLE_CLOSING`).
- Sustain: Hooking `child_process.spawn` stderr in `G:\Forge-QA\temp\mcp-spy.cjs` exposed the exact libuv assertion (`async.c:76`) in one run without touching tracked source until root cause was proven.
- Improve work/approach: Test `stdout`/`stderr` capture on child-exit assertions early whenever Windows `0xC0000409` appears rather than assuming `NODE_OPTIONS` or timing tweaks first.
- Improve tools: `scripts/mcp-capability-selftest.ts` assertions on `client.child.exitCode === 0` could include captured `stderr` in assertion messages so fastfail aborts surface diagnostics directly.
- Highest-risk evidenced weakness: `fetch()`/undici keep-alive handles racing `process.exit(0)` on Windows `Node v24`; mechanism is calling `process.exit(0)` synchronously inside `rl.on("close")` before libuv async handles retire; fixed cleanly via natural event-loop exit after `process.stdin.destroy()` + active controller abort.
