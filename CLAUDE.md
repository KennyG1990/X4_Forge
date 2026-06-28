# Agent Instructions

> Entry point for AI agents working in this repo. Read at session start. (Mirror to CLAUDE.md / GEMINI.md if your harness reads those instead.)

## Building the `x4_ai_influence` mod — agent API allowed (UI-only mandate LIFTED 2026-06-24)

**UPDATE 2026-06-24 (Ken): the old "build the mod ONLY through this Forge's UI" HARD RULE is REVERSED.** It
contradicted `F:\DEV_ENV\CLAUDE.md`, which is authoritative — both now agree. You **may use the Forge agent API
(`/api/agent/*`) to author, validate, and deploy** the `x4_ai_influence` mod (in-game MD/Lua/content), and use
mouse clicks (Claude-in-Chrome / computer-use) for *validation*. Pure-canvas building was too slow. The Forge is
still proven by building a real mod end-to-end — but via the API is fine; a UI gap found while building is worth
fixing in the Forge (log it in ROADMAP) but no longer blocks. (Verification — driving X4, reading the debuglog,
querying the bridge DB — tests results, not the build. The Python bridge is not a Forge artifact, edited normally.)

## Code knowledge graph (graphify)

A precomputed knowledge graph of this codebase lives at `graphify-out/graph.json`
(**1160 nodes · 2649 edges · 51 communities**, AST-extracted, code-only). Use it to
orient and reason about structure **before** grepping the whole tree — it answers
relationship questions that grep/LSP can't cheaply: blast radius, shortest paths,
and what a symbol connects to.

The CLI is `graphify` (installed; package is `graphifyy`). Run from the repo root so
it finds `graphify-out/graph.json` by default:

```bash
graphify query   "How does X work?"        # BFS traversal — broad context for a question
graphify affected "generateMDXML()"        # REVERSE blast-radius: what breaks if I change this
graphify path    "Canvas.tsx" "xsdParser.ts"  # shortest dependency path between two nodes
graphify explain "ModWorkspace"            # a node + its neighbors (degree, community, edges)
```

Core abstractions (god nodes): `ModWorkspace` (67 edges), `MDNode` (38),
`generateMDXML()` (33), `compileAndSaveAll()` (21), `validateModWorkspace()` (15).

**Keep it fresh.** After changing code, rebuild deterministically (no LLM, free, seconds):

```bash
graphify update .
```

**Scope caveat:** the graph is **code-only** — it does NOT include ROADMAP.md, docs/,
schemas, or wares/jobs data (those are stripped by `.graphifyignore`). For mod-authoring
work, the graph of the Forge's own source is the wrong layer — use the Forge agent API
(see the `x4-forge-api` skill). This graph is for navigating/maintaining the Forge codebase.

A human-navigable Obsidian copy is exported to `F:\StarForge\graphify\x4-forge\` (open as a vault).
