# Conan Exiles UE5 Update + AI Agent Modding Landscape (2026-06-18)

**Status:** Research findings + revised verdict. This is NOT an implementation plan — it's a feasibility/strategy doc that revises the earlier "Conan Exiles = hard no" assessment in light of the UE5 update and the discovered UE5-MCP ecosystem.

## TL;DR (revised verdict)

My earlier "Conan Exiles = not Forge-able" was **wrong**, and I should have caught it. The Conan Enhanced UE5 update doesn't just bump an engine version — it moves Conan Exiles modding into a domain where **AI agents can now drive the editor directly via MCP**, which is a fundamentally different problem than the "binary asset, no agent surface" wall I described. There are 172+ UE5 MCP repos, including `flopperam/unreal-engine-mcp` (1k stars, **50+ tools**, hosted + local) and `chongdashu/unreal-mcp` (2k stars). Agents can already create Blueprints, wire nodes, build worlds, author materials, and verify via PIE — through natural language. The question is no longer "can an AI agent mod a UE5 game" (answer: yes, today) but "what does Forge become relative to that existing capability."

## What I got wrong and why

Earlier I framed Conan Exiles modding as: DevKit = modified UE4 editor, mods = cooked `.pak` of binary assets, no text schema, no agent surface → hard no for the Forge model.

What I missed (and should have researched before asserting):
1. **The UE5 update** — Conan Enhanced moved to UE5, which is the version the entire UE5-MCP ecosystem targets (5.5+). The DevKit being UE5 means the MCP tooling applies to it, not just stock UE5.
2. **MCP exists for UE5** — I asserted "no equivalent things" implicitly by calling Conan a hard no. There are 172+ repos. The top ones (`flopperam`, `chongdashu`) are mature: 50+ tools spanning Blueprint authoring, materials, VFX, animation, AI/BT, landscape, cinematics, PCG, runtime PIE verification.
3. **The architecture is already solved** — agent (Claude/Cursor/Windsurf) → MCP server (stdio or HTTP) → C++ plugin inside UE5 editor → native UE API. This is the exact "agent drives an editor" pattern, just for UE5 instead of for X4's MD/Lua.

The honest correction: **"binary-asset modding" is not a wall against AI agents — it's a wall against the Forge text-schema model specifically.** Agents can drive binary-asset editors fine via MCP; they just don't need a text-schema validation layer to do it, because the editor IS the validator (UE5's Blueprint compiler, cook process, PIE).

## How this affects your desire to make mods with AI agents

This splits into three separate questions I previously conflated:

### 1. Can AI agents mod Conan Exiles (UE5)? — YES, via existing UE5-MCP tooling
- `flopperam/unreal-engine-mcp` and `chongdashu/unreal-mcp` already let Claude/Cursor drive a live UE5 editor: create/delete actors, author Blueprint graphs (add nodes, wire, create variables/functions, compile), build materials, spawn worlds, run PIE tests with 30+ assertion types.
- The Conan Enhanced DevKit is UE5-based, so the same MCP plugin approach should work (the plugin loads into any UE5 project; Conan's DevKit is a UE5 project). **Verification needed:** whether the Conan DevKit permits third-party plugins (the old UE4 DevKit blocked some asset operations for licensing reasons — "Under the hood" on the wiki). This is the one host-checkable unknown.
- If the DevKit accepts the UnrealMCP plugin, an agent can mod Conan Exiles today, through the DevKit, without Forge.

### 2. Does that make Forge obsolete for UE5 games? — NO, but it reframes Forge's value
Forge's value is NOT "agents can mod games" (they already can, for UE5). Forge's value is the **deterministic validation + tedium-reduction layer** that sits between the agent and the game's modding surface. The question is whether that layer adds value on top of an MCP-driven UE5 editor.

Honest assessment: **for UE5 games, the MCP-driven editor already provides most of what Forge provides for X4:**
- Schema truth → UE5's Blueprint type system + cook process (stronger than X4's md.xsd in some ways).
- Validation → Blueprint compiler + PIE runtime tests (the Flop MCP ships `pie_test_bp` and `pie_test_scene`).
- Tedium reduction → MCP tools batch Blueprint authoring into single calls (`bp_create`, `bp_nodes`, `bp_wire`, `bp_commit`).
- Object index → Content Browser search + `search_assets` + `asset_references`.

What Forge would ADD that UE5-MCP doesn't have:
- **The Extension Doctor pattern** — cross-mod conflict detection, load-order winner simulation, override drill-down. UE5 modding has load-order issues (the Conan wiki explicitly warns about mod compatibility after patches), but the UE5-MCP tools don't solve cross-mod conflict analysis. Forge's #66 dependency graph + Doctor could apply here.
- **Project-level authoring** (P0) and **cross-file validation** (P5) — these gaps exist in UE5 modding too (multi-file Blueprint references, data-table integrity), and the UE5-MCP tools are editor-command-oriented, not project-model-oriented.
- **The agent-operable multi-file orchestration** (P3) — the UE5-MCP tools are one-shot editor commands; they don't plan a multi-file mod project end-to-end. That's Forge's P3 territory.

So: Forge-for-UE5 would be a **complement to** UE5-MCP, not a replacement — it'd add the project/validation/conflict layer the MCP tools lack. But that's a thinner wedge than Forge-for-X4, because the MCP tools already cover authoring + validation that Forge has to build from scratch for X4.

### 3. Does this change the X4 Forge roadmap? — Mostly no, with one strategic caveat
The X4 roadmap (P0–P6, agent-built AI Influence) is unaffected — X4 has no UE5-MCP equivalent (no X4 editor plugin ecosystem, no MCP for the X4 MD/Lua surface), so Forge remains the only agent-operable path for X4 modding. The gap analysis tiers (project authoring, transport nodes, Lua logic, cross-file validation) stand.

The strategic caveat: **the existence of mature UE5-MCP tooling is evidence that the "agent-operable mod studio" pattern is real and valuable** — Flopperam has 1k stars, a hosted product, a Discord, YouTube demos of Claude building full combat systems. This validates Forge's direction (agent-driven mod authoring is a proven category, not a bet). It also means:
- Forge doesn't need to reinvent the MCP-for-editor pattern for X4 — X4 lacks the editor, so Forge IS the editor. Different problem, same category.
- If you ever generalize Forge to a second game, Space Engineers (text .sbc + C#) is still the cleaner fit than Conan (UE5 binary), because SE maps onto Forge's existing architecture while Conan would require piggybacking on UE5-MCP instead of Forge's own validation.

## The UE5-MCP ecosystem — sourced details

Three tiers of maturity, all real and active:

| Project | Stars | Mechanism | Scope |
|---|---|---|---|
| `flopperam/unreal-engine-mcp` | 1k | Hosted (agent.flopperam.com/mcp) + local Python/C++ plugin | **50+ tools**: BP authoring lifecycle (`bp_create`→`bp_commit`), materials, VFX (Niagara), animation, AI/BT, GAS, landscape, cinematics, PCG, **PIE runtime verification** (`pie_test_bp`, `pie_test_scene`, 30+ assertion types), Python execution, 15k+ API lookups. Supports UE 5.5/5.6/5.7. |
| `chongdashu/unreal-mcp` | 2k | Local Python MCP server → C++ plugin (TCP 55557) | Actor mgmt, Blueprint dev (components, node graph, variables), editor control. UE 5.5+. Experimental. |
| `ChiR24/Unreal_mcp` | 730 | Native C++ Automation Test framework | Uses UE's own automation system rather than a custom TCP bridge. |
| `runreal/unreal-mcp` | 109 | Unreal Python Remote Execution | Uses UE's official Python remote exec API. |
| Others (VibeUE, UnrealClaude, ue-mcp, etc.) | 100–400 each | Various | Mix of Claude Code integrations, UMG-specific, analyzer tools. |

**Architecture pattern (consistent across projects):**
```
AI Client (Claude/Cursor/Windsurf/Cline)
    → MCP server (stdio or streamable HTTP)
    → C++ plugin running inside live UE5 editor
    → native UE5 API (Blueprint graph, asset pipeline, PIE)
```

Key capability evidence (from `flopperam` README): agents can author full Blueprint combat systems (health, armor, stamina, combo), build metropolises (4,000+ objects from one prompt), create mazes + mansions, and verify via PIE with assertions. This is not toy tooling — it's production-grade agent authoring of real game systems.

**What this means for Conan specifically:** if the Conan Enhanced DevKit (UE5) permits loading the UnrealMCP plugin, every one of these capabilities applies to Conan modding directly. The only blocker is the DevKit's plugin policy (the old UE4 DevKit restricted asset operations for licensing — needs verification against the UE5 Enhanced DevKit).

## Strategic implications for you (Ken)

This is a decision-shaping question, not an implementation task. Three honest framings:

### Framing A — "Forge stays X4-only; use UE5-MCP for Conan"
Forge is the agent-operable mod studio for **X4 specifically**, because X4 has no editor plugin ecosystem and no MCP — Forge IS the editor surface. For Conan/UE5 games, the existing UE5-MCP ecosystem already solves agent-driven modding; you'd use Flopperam or chongdashu's tool, not Forge. This keeps Forge focused, avoids scope creep into a domain that's already served, and matches the "X4 is the underserved, data-driven segment" positioning from the GLM review.
**Cost:** none to Forge. **Benefit:** clarity.

### Framing B — "Forge becomes a multi-game layer ON TOP of game-specific agent tools"
Forge generalizes into a **project-management + validation + conflict-detection layer** that sits above game-specific agent surfaces (Forge's own engine for X4/SE; UE5-MCP for UE5 games). For X4: Forge authors + validates. For Conan: UE5-MCP authors, Forge validates (Extension Doctor for UE5 mods — load-order, conflict, dependency). This is a bigger vision but a much larger refactor, and it competes with established UE5-MCP tooling on its home turf.
**Cost:** large refactor, thin wedge against mature competition. **Benefit:** one tool across game families.

### Framing C — "Research only; no action on Forge"
The UE5-MCP discovery is valuable context (it validates the agent-modding category and clarifies Forge's X4-specific value), but it doesn't change the X4 roadmap. Park Conan/UE5 as "solved by existing tooling, not Forge's job." Resume P0 verification with Claude.
**Cost:** none. **Benefit:** no scope creep, preserves focus on the X4 capstone.

## My recommendation (FWIW — you have more info than I do)

**Framing C, with one footnote.** The UE5-MCP discovery doesn't change the X4 roadmap — X4 has no equivalent, Forge remains the agent path for X4, and the gap-analysis tiers (P0–P6) stand. Don't chase Conan/UE5; it's already served by mature tooling and Forge would be a thin complement there, not a leader.

The footnote: this discovery is **evidence that Forge's category is real and proven** (Flopperam's 1k stars + hosted product + YouTube demos of agents building combat systems = the agent-modding market exists and works). That's not an action item — it's a confidence boost that the X4 work is pointed at a validated pattern, not a speculative one. It also reinforces that Forge's X4-specific value (deterministic md.xsd validation, MD/Lua authoring, the tedium patterns in ai_influence_chat.xml) is genuinely X4-unique — UE5-MCP doesn't help an X4 modder at all, because X4 has no UE5 editor.

## What needs verification (host-checkable, I can't do it)

1. **Does the Conan Enhanced UE5 DevKit permit loading third-party plugins** (specifically the UnrealMCP C++ plugin)? The old UE4 DevKit blocked some asset operations for licensing. This is the single gate on whether UE5-MCP applies to Conan directly.
2. **Is the Flopperam hosted MCP usable with the Conan DevKit**, or does it assume a stock UE5 project? (Their docs say "UE 5.5/5.6/5.7" — Conan Enhanced's UE5 version needs confirming.)

Neither of these affects the X4 Forge roadmap; they only affect whether you personally could mod Conan with an agent today via existing tooling.

## Confidence

- **UE5-MCP ecosystem exists and is mature**: ~95% (multiple 1k+ star repos, hosted product, active development, clear READMEs, documented architecture). Sourced.
- **It applies to Conan Enhanced (UE5 DevKit)**: ~70% (the plugin mechanism should work in any UE5 project, but the DevKit's licensing/plugin restrictions are unverified — the old UE4 DevKit had them).
- **It obsoletes a Forge-for-UE5 build**: ~85% (the MCP tools cover authoring + validation + PIE verification that Forge would have to build; Forge's only wedge is conflict/load-order analysis, which is thin).
- **It changes the X4 Forge roadmap**: ~10% (X4 has no UE5 editor; Forge is the only agent path for X4 regardless).

## What I'm NOT recommending

- I'm not recommending you build a Forge-for-UE5. The existing tooling covers it better than Forge would.
- I'm not recommending you abandon the X4 roadmap. X4 is where Forge's architecture is uniquely valuable.
- I'm not recommending you pivot to a multi-game layer (Framing B). The refactor cost is high and the wedge against UE5-MCP is thin.
- I'm not editing the existing X4 gap-analysis plan based on this — this doc is context, not a roadmap change.
