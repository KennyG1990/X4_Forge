# B41 · VS Code / Antigravity extension proof-of-concept — SPECIFIED (2026-07-15)

Status: `SPECIFIED` → implementation follows in this same session (worktree branch
`claude/x4-forge-vscode-poc-806ef5`; main checkout is NEVER written).
Lane: **FULL**. Market-validation spike, NOT a product conversion.

## Bounded unit

A locally packageable VSIX that renders the existing Forge React app in a VS Code webview,
backed by the existing Express server run as a managed loopback sidecar (or attached to an
already-running Forge), completing the representative open → edit → validate → compile/package
workflow. One product core, two shells.

## Assumptions / unresolved facts

- The live Forge (`:3000/:3001`) runs the MAIN checkout's dirty tree (B34–B37 uncommitted).
  To keep the fork faithful, that 33-file delta was **copied byte-identically** into this
  worktree (verified: 0/33 MD5 mismatches). Main checkout untouched.
- Host: Node v24.15.0 on PATH; VS Code 1.120.0 (`code` CLI); Antigravity IDE installed
  (no CLI on PATH — binary under `%LOCALAPPDATA%\Programs\Antigravity IDE`).
- better-sqlite3 prebuilt binding matches system Node ABI, NOT necessarily the IDE's Electron
  ABI → sidecar must spawn under **system node**, never blindly ELECTRON_RUN_AS_NODE.
- Prompt claim "e2e swaps the server workspace" is STALE — B31s2 gave e2e its own ephemeral
  stack (ports 3100/3101, temp X4_STATE_DIR); no machine-state ask needed (records + config
  header confirm). The remaining Ken gates are the VSIX **install** tests.

## Reconcile findings (what exists — reuse, don't rebuild)

| Need | Existing seam (verified in source) |
|---|---|
| Dynamic port | `PORT` env → `app.listen(PORT, "127.0.0.1")` (server.ts:157/7709). Loopback-only bind already. |
| Per-session token | `STUDIO_API_TOKEN` env short-circuits file generation (server.ts:161); server injects it into served HTML (`injectStudioToken`, :184). |
| Isolated/real state | `X4_STATE_DIR` env (B31s1, server.ts:1536) — default `<cwd>/.studio-state`. |
| Frontend bundle serving | prod branch: `express.static(cwd/dist)` + `dist/index.html` with token injection (server.ts:7626-7633). **cwd-resolved** → extension must spawn with correct cwd. |
| Frontend transport | ALL API calls are same-origin relative `/api/*` via `src/lib/apiHelper.ts` (fetchJson) + `window.__STUDIO_API_TOKEN__` — zero transport adaptation needed if the page is served by its own backend. |
| Security in prod | `run_command` route NOT registered under NODE_ENV=production (server.ts:7642). No server AI keys shipped (no `.env` in staging). |
| e2e-style ephemeral stack | playwright.config.ts B31s2 — the exact pattern the sidecar reuses. |
| Native dep hazard | `src/server/liveBridge.ts:12` **statically** imports better-sqlite3 → bundle crashes at require-time if the native binding can't load. Must be proven from the installed VSIX under the spawned node. |

Capability-map delta: extension shell + sidecar manager are NEW (no prior VS Code/webview
capability exists anywhere in the repo — searched `vscode`, `webview`, `extension.ts`,
`acquireVsCodeApi`; absence proven at repo root and src/).

## Architecture (smallest viable adapter)

`vscode-extension/` (new, isolated — zero imports from core; core has zero knowledge of it):

- `package.json` — manifest: command `x4forge.openStudio` ("X4 Forge: Open Studio"),
  `x4forge.stopSidecar`, `x4forge.showLogs`; configuration `x4forge.attachUrl`,
  `x4forge.forgeRoot`, `x4forge.stateDir`, `x4forge.nodePath`;
  `capabilities.untrustedWorkspaces.supported: false` (extension disabled when untrusted —
  Forge executes compiles/deploys, so the clear restriction is OFF).
- `src/extension.ts` → esbuild → `out/extension.js` (no runtime deps).
  Flow on `openStudio`:
  1. **Attach-first**: probe `attachUrl` (default `http://127.0.0.1:3000`) via public
     `GET /api/agent/schema`, verify the JSON self-identifies as the Forge agent API.
     Success → attach (never owns/kills it). This also kills the "second Forge instance
     silent false-green" class: mode is surfaced explicitly in the UI (status bar + logs).
  2. Else **spawn sidecar**: free loopback port via `net.listen(0)`; token via
     `crypto.randomBytes(32)`; app root = `x4forge.forgeRoot` (uses its `dist/` +
     `node_modules/`) else the **bundled `app/` inside the extension** (resolved via
     `context.extensionUri`, never cwd); state dir = `x4forge.stateDir` else
     `context.globalStorageUri/state` (never inside the installed extension — updates wipe it).
     Spawn `<node> dist/server.cjs`, cwd=appRoot, env `{NODE_ENV:production, PORT,
     STUDIO_API_TOKEN, X4_STATE_DIR}`. Node = `x4forge.nodePath` else `node` on PATH else
     honest unsupported-host error (Electron-as-node NOT silently attempted — ABI risk).
  3. Readiness: poll `/api/agent/schema` ≤30s; stdout/stderr → OutputChannel "X4 Forge";
     failure/timeout/crash → visible error notification with "Show Logs".
  4. Webview panel: CSP-locked HTML hosting a full-bleed `<iframe src=http://127.0.0.1:<port>/>`.
     The served page carries its own token; all app fetches stay same-origin inside the frame.
     `retainContextWhenHidden: true`.
  5. Lifecycle: sidecar is killed on `deactivate`/stop-command ONLY if we spawned it
     (ownership flag). Attach mode never kills. Panel close keeps the sidecar warm for reopen.
- `scripts/stage-app.mjs` — staging: copy worktree `dist/` → `app/dist/`, write pruned
  runtime `package.json` (vite, express, dotenv, better-sqlite3, @xmldom/xmldom,
  fast-xml-parser, luaparse, xpath, @google/genai), `npm install --omit=dev` in `app/`.
  Staged app is **boot-proven standalone** before packaging.
- `.vscodeignore` — ship only `out/`, `app/`, manifest, README. VSIX inspected for
  secrets/abs-paths/dev-only files before any install.

## In scope / out of scope

In: everything under "Bounded deliverable" of the request, up to the write gates.
Out (per request): backend rewrite to VS Code APIs · React fork · vscode.dev · UI redesign ·
marketplace/production · game-dir/real-mod writes · HTTP→postMessage rewrite · server.ts
cleanup · unrelated features · any mutating git.

## Risks & authorization boundaries

- **Install write gate (Ken):** VSIX install into VS Code / Antigravity changes local app
  state → one-paragraph write gate + explicit go, per install. Everything before that is
  file-writes inside this worktree + OS temp only.
- Dual-writer hazard: sidecar pointed at the real `.studio-state` while the standalone dev
  stack runs → attach-first prevents it; default state dir is the extension's own.
- Native ABI: proven by booting the staged app and the installed VSIX under system node.
- No secrets: staging ships no `.env`, no `.studio-api-token`; token is per-session env.

## Rollback

Worktree branch only; main untouched. VSIX uninstall = `code --uninstall-extension <id>`;
sidecar state dir deletable; no standing config written by the extension.

## Acceptance contract

Technical VERIFIED requires (each named, evidenced under `vscode-extension/evidence/`):
1. Standalone Forge unaffected (live `:3000` workspace hash unchanged at close; no main-tree writes).
2. Repo gates on this worktree: typecheck · lint · oracle sweep (against a worktree-owned
   ephemeral instance) · `npm run test:e2e` (verdict-parsed) · `npm run build` ·
   `precommit:check` · `POST /api/agent/project/validate` ok:true/0 errors · `graphify update .`.
3. Staged app boots standalone from `app/` (prod mode, dynamic port, env token, isolated
   state dir); better-sqlite3 loads (no require-crash; `/api/agent/workspace` 200 with Bearer).
4. Extension builds clean from a fresh `out/`; VSIX packages; VSIX contents inspected
   (bundles present, native module present, no secrets/dev-paths/repo junk).
5. Representative workflow against the sidecar-served UI (real rendered host):
   open workspace → inspect/edit canvas item → deterministic validate → compile/preview →
   package artifact (scratch), with screenshots.
6. Failure paths: port-in-use → reselect; backend crash mid-session → visible error;
   backend startup failure (bad node path) → actionable error; attach-vs-spawn mode surfaced.
7. Ken-gated (BLOCKED until approval): install test in desktop VS Code; command launch;
   webview render; workflow; close/reopen; uninstall/reinstall; THEN separately Antigravity.
Negative path (required): startup-failure and port-conflict checks above (6).
Unavailable validation, declared now: the install-tests (7) cannot run without Ken's
write-gate approval → the technical close this session is at best PARTIAL/BLOCKED on those,
honestly separated. Antigravity result is reported separately from VS Code.

## Evidence locations

`vscode-extension/evidence/` (logs, VSIX listing, screenshots) · this plan · ROADMAP close
entry · worktree BACKLOG B41 entry.
