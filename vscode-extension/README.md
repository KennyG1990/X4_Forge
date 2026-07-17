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

**Built to be the opposite of a hallucinated mod.** AI output goes through the same real-schema
validation as hand-built mods — invented tags, bad attributes, and dangling cue references get
caught by Egosoft's own schemas, not by the AI grading itself. If it can't make a mod validate,
it tells you — it doesn't hand you a broken mod that looks finished. ([How that works](#is-this-just-another-ai-mod-generator).)

## Is this just another AI mod generator?

**Straight answer: no — and here's the mechanism.**

The knock on AI-made mods is fair: a language model will happily invent a command that doesn't
exist, an attribute the schema never had, or a cue reference that points at nothing — and you
don't find out until the game silently ignores it or refuses to load.

X4 Forge doesn't trust the AI's output. It **runs it through the exact same validators a
hand-built mod faces** — Egosoft's own XML schemas, cross-file cue resolution, script-property
checks, and a set of known-pitfall rules pulled from real mods. Not a sanity check the AI grades
itself on. The same wall your own hand-written XML would hit.

If the generated mod passes on the first try, you're done — the AI is never asked to "fix"
anything. If it doesn't, the **validator** — not the model — drives the repair: it hands the
model the exact failing findings and asks for a correction, then re-validates. That loop is
bounded (a few attempts, then it stops), and if the same problem survives two rounds, it gives
up instead of spinning. When it still can't make a mod validate, **it tells you that plainly** —
you get the findings, not a broken mod dressed up as finished.

**What this does and doesn't buy you.** It catches the structural lies — invented tags, wrong
attributes, dangling references, script properties that don't exist. It does **not** promise the
mod does what you pictured; no validator can read your mind, and the game is still the final
judge. What it promises is narrower and more useful: what the AI hands you is a mod that's
actually *shaped like a real X4 mod*, not a plausible-looking hallucination you debug in-game.

(And AI is off by default. The studio is a full deterministic editor without ever calling a
model — the validation above runs on everything, AI-authored or not.)

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
