# X4 Forge Studio

**Visual modding studio for X4: Foundations — inside your IDE.**

Build, validate, and deploy X4 mods on a node canvas instead of hand-writing XML. X4 Forge
Studio runs the full X4 Forge app right inside VS Code and compatible editors (Antigravity,
Cursor, VSCodium, Windsurf), backed by a local engine that validates your work against the
game's real schemas at every step.

## What it does

- **Node-graph mod editor** — assemble Mission Director logic (cues, conditions, actions) and
  UI as a visual graph; the studio compiles it to the exact XML/Lua the game loads.
- **Real-schema validation** — every change is checked against X4's own schemas, so you catch
  mistakes before the game does.
- **Compile, preview, package** — turn your graph into a ready-to-install extension folder or
  a shareable package, without touching a text editor.
- **Guided first mod** — a beginner rail walks a newcomer from idea to a working, deployable
  mod; power users get the full studio.
- **Optional AI assist** — off by default; the studio is a fully deterministic editor without it.

## Getting started

1. Install the extension.
2. Run **"X4 Forge: Open Studio"** from the Command Palette (or turn on
   `x4forge.autoOpen` to open it automatically).
3. The first-run setup helps point the studio at your X4 installation, then you're building.

## Requirements

- **Node.js** installed on your machine (the studio runs a small local engine). If it's
  missing, the extension tells you.
- **X4: Foundations** installed (the studio validates and deploys against your game files).
- A **trusted** workspace — the studio writes and compiles mod files, so it stays disabled in
  untrusted folders.

## Settings

| Setting | What it does |
|---|---|
| `x4forge.autoOpen` | Open the studio automatically when a trusted workspace loads. |
| `x4forge.attachUrl` | Attach to an already-running X4 Forge instead of starting one. |
| `x4forge.forgeRoot` | Use your own built X4 Forge checkout instead of the bundled app. |
| `x4forge.debug` | Attach a debugger to the studio backend (for development). |

## Privacy

Everything runs locally on your machine. The studio talks only to a backend on your own
computer (loopback), protected by a per-session token. No mod data leaves your machine, and
AI features are opt-in and use your own API keys.

## Feedback

This is an early release — issues and ideas are welcome.

Licensed under MIT.
