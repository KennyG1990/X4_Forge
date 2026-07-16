# X4 Forge Studio — VS Code extension (proof-of-concept)

Runs the existing X4 Forge visual modding studio inside VS Code (and VS Code forks such as
Antigravity). This is a **market-validation spike** (B41): one product core, two shells —
the standalone Forge is unchanged and remains the primary product.

## What it does

- **`X4 Forge: Open Studio`** — opens the real Forge UI in a webview.
- **Attach-first:** if a Forge is already running at `x4forge.attachUrl`
  (default `http://127.0.0.1:3000`), the extension attaches to it and never manages it.
- Otherwise it starts a **managed sidecar**: the bundled production Forge backend
  (`app/dist/server.cjs`) under your system Node, on a **dynamically selected loopback
  port**, with a **per-session bearer token** (generated fresh each start, passed via env,
  never written to disk) and its own state directory.
- **`X4 Forge: Stop Backend Sidecar`** stops only a backend the extension itself started.
- **`X4 Forge: Show Backend Logs`** opens the sidecar's output channel.

## Requirements

- Windows/macOS/Linux desktop VS Code ≥ 1.85 (no vscode.dev / web support).
- **Node.js on PATH** (or set `x4forge.nodePath`). The sidecar's native module
  (better-sqlite3) is ABI-matched to a real Node install; the extension refuses to run it
  under anything else and says so.
- A **trusted** workspace. The Forge compiles/validates/packages mod projects, so the
  extension is disabled entirely in untrusted workspaces.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `x4forge.attachUrl` | `http://127.0.0.1:3000` | Probe-and-attach target before spawning. |
| `x4forge.forgeRoot` | (empty) | Use a built Forge checkout (`dist/server.cjs` + `node_modules`) instead of the bundled app. |
| `x4forge.stateDir` | (empty → extension global storage) | Sidecar `X4_STATE_DIR`. Point at a checkout's `.studio-state` to open that real workspace **only when that checkout's own server is not running**. |
| `x4forge.nodePath` | (empty → `node` on PATH) | Node executable for the sidecar. |

## Build & package (from a repo checkout)

```powershell
# 1. Build the product (repo root)
npm run build
# 2. Stage it into the extension + install its runtime deps
cd vscode-extension
npm install
npm run stage-app
# 3. Compile the controller (fresh out/) and package
npm run build
npm run package     # → x4-forge-studio-0.0.1.vsix
```

Install: `code --install-extension x4-forge-studio-0.0.1.vsix`
Uninstall: `code --uninstall-extension x4forge-local.x4-forge-studio`

## Debugging (VS Code and Antigravity)

Gold-standard Node debugging — breakpoints, stepping, variable inspection — attaches to the
managed backend sidecar. Both VS Code and Antigravity bundle the JS debugger, so this works
identically in either.

1. Set **`x4forge.debug`** to `inspect` (or `inspect-brk` to pause at startup).
2. Open the studio. The extension launches the backend with `--inspect` and **auto-attaches
   the debugger** — a session named "X4 Forge Sidecar" appears in Run & Debug, and the inspect
   port is printed in the "X4 Forge" output channel.
3. For **source-level (TypeScript) breakpoints**, also set **`x4forge.forgeRoot`** to a built
   repo checkout (its `dist/server.cjs.map` lets the debugger map to the original `.ts`).
   Against the bundled app you still debug, at the bundled-JS level.

If the auto-attach ever doesn't start, the inspector is still open — attach manually from
`chrome://inspect` at the printed `127.0.0.1:<port>`.

To debug the **extension controller** itself (`extension.ts`), open `vscode-extension/` and
press F5 (the committed `.vscode/launch.json` provides an Extension-Host config). You can debug
the controller and the sidecar at the same time.

## Honest limitations (spike scope)

- The webview hosts the Forge over loopback HTTP in an iframe; a few IDE-side keyboard
  shortcuts may shadow in-app shortcuts.
- The bundled app starts unconfigured (first-run wizard) until game paths are set; its
  state lives in the extension's global storage unless `x4forge.stateDir` says otherwise.
- AI features require the user's own keys (nothing is bundled; no server keys ship).
- Not published to any marketplace; local install only.
