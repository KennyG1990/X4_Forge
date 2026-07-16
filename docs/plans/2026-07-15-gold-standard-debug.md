# B43 · Gold-standard sidecar debugging (VS Code + Antigravity) — SPECIFIED 2026-07-15

Lane: **FULL** (extension behavior + build/launch config). Branch `claude/x4-forge-vscode-poc-806ef5`.

## Bounded unit
Let a developer attach a real Node debugger (breakpoints, stepping, variable inspection) to
the extension's managed sidecar, working identically in VS Code and Antigravity.

## Reconcile (verified 2026-07-15)
- BOTH IDEs bundle `ms-vscode.js-debug` (+ companion + debug-auto-launch) →
  `vscode.debug.startDebugging({type:'node',request:'attach'})` works in both. No fork
  workaround needed.
- `--inspect` is a portable Node flag (IDE-independent); the CDP endpoint is also reachable
  from `chrome://inspect` as a no-single-point-of-failure fallback.
- **Sourcemaps:** `stage-app.mjs` strips `*.map` from the shipped app (deliberate — no source
  shipped). BUT the extension already has `x4forge.forgeRoot`, and the repo's `npm run build`
  emits `dist/server.cjs.map`. So source-level (TS) breakpoints need NO new build: point
  `x4forge.forgeRoot` at the repo checkout (map-preserving bundle) + `x4forge.debug`. Against
  the bundled/stripped app you still get gold-standard debugging at the bundle-JS level.
- `x4forge.forgeRoot` is checked first in `resolveAppRoot`, so the repo bundle+map is used
  verbatim when set. No change to stage-app.

## Design
- Setting `x4forge.debug`: `"off" | "inspect" | "inspect-brk"` (default off).
- spawnSidecar: when on, pick a free `debugPort`, prepend `--<mode>=127.0.0.1:<debugPort>` to
  the node args; record `debugPort` on the handle; auto-attach via `startDebugging` right
  after spawn (`continueOnAttach = mode !== 'inspect-brk'` so brk stays paused at entry).
- Readiness: `inspect-brk` intentionally pauses the server until the dev continues → don't
  hard-fail/kill on readiness timeout in brk mode (log a "paused in debugger — continue to
  start the server" note and return the handle). Plain `inspect` boots normally, attaches,
  breakpoints hit on the next request — unchanged readiness.
- Attach once per sidecar (guard flag); surface the inspect endpoint in the log + status.
- Committed `vscode-extension/.vscode/launch.json`: an Extension-Host config (F5 debugs
  `extension.ts` — the controller half) + an attach config (manual attach to a running
  sidecar). Both debug types exist in both IDEs.
- Version → 0.0.3; README "Debugging" section.

## Acceptance contract
1. `npm run build` (tsc+esbuild) + `npm run package` clean; VSIX ships launch.json.
2. `--inspect` endpoint proven up: the staged sidecar launched with `--inspect` exposes the
   CDP `/json/version` on the debug port.
3. Live in an IDE (Antigravity, both-IDE parity argued from the shared js-debug): with
   `x4forge.debug=inspect` a debug session named "X4 Forge Sidecar" attaches when the studio
   opens (Call Stack shows it).
4. Regression: with `x4forge.debug=off` (default) behavior is byte-identical to today
   (no --inspect arg, no attach) — repo e2e stays green.
5. No secrets/source shipped by default (stripped app unchanged; maps only via forgeRoot).

## Risks / rollback
Debug attach is opt-in and default-off, so the common path is untouched (mitigates the
"auth-path" style blast radius). Rollback = revert branch commits. No new network/spend/delete
surface. Worktree-only; main untouched; no git mutation.
