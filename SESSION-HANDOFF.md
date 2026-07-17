# SESSION HANDOFF — X4 Forge (worktree branch `claude/x4-forge-vscode-poc-806ef5`)

> ## ⛔ COMMIT POINT (2026-07-17, overnight /goal run complete) — B56 Phase A BUILT; Ken commits
> **HEAD = `cc346be`** (B55P1 committed). **UNCOMMITTED (Ken owns commits — his /goal: commit
> when finished):** B56 Phase A — src/lib/langService.ts (NEW) · src/lib/xsdParser.ts (palette
> include fix) · server.ts (validate `flat` field + 3 lang endpoints + allowlist + oracle reg)
> · vscode-extension: src/extension.ts (validateModFolder / openModFolder / copyMcpConfig /
> lang providers) + src/diagnosticsMap.ts + src/modFolder.ts + src/langContext.ts (all NEW,
> selftest-carrying) + mcp/x4forge-mcp.cjs (NEW) + package.json (3 commands, 2 settings) +
> .vscodeignore (+!mcp/**) · records (BACKLOG/ROADMAP/plan/this file). Plus Ken's untracked
> `.github/` (his sync — untouched).
> **Suggested title:** "feat(ide): B56 Phase A — Problems-panel projection, mod-folder
> workspace, X4 IntelliSense, MCP agent tools, XSD-association interop (+palette include fix);
> bump extension to 0.0.14"
> **PUBLISH DONE (2026-07-17 morning, Ken-authorized): stable 0.0.14 is live on Open VSX**
> (staged-bundle probe passed pre-publish: 402 boot line, agent-loop 12/12, lang-service
> 12/12, routing 24/24, md-audit 0, live lang/complete). The uncommitted diff now includes
> the 0.0.14 bump. BROWSER EYEBALL done: meta panel shows 402/35 live; diagnostics panels
> clean. Remaining ◐ = the four IDE-hosted eyeballs below (your Antigravity auto-updates).
>
> ## 👁 EYEBALL QUEUE (the ◐ on B56 — each is a 1–3 minute check in YOUR Antigravity,
> ## AFTER commit+0.0.14 publish/install or a side-load of a freshly staged vsix)
> 1. **Problems panel:** Ctrl+Shift+P → "X4 Forge: Validate Mod Folder" → type a mod name
>    (e.g. x4_ai_influence) → Problems panel (Ctrl+Shift+M) shows x4forge-sourced findings;
>    click one → jumps to file:line. Then break an attribute in an md file, SAVE → findings
>    refresh (~1s). Fix → clears.
> 2. **Mod folder:** "X4 Forge: Open Mod Folder in Workspace" → pick a mod → explorer shows
>    "X4 Mod: <name>"; `.vscode/extensions.json` appeared in it; IDE offers the recommended
>    extensions (don't have to install).
> 3. **IntelliSense:** open the mod's md/*.xml → inside `<actions>` type `<` → completion list
>    appears, set_value/debug_text/create_ship near the top ("curated"); pick one with
>    required attrs → snippet fills them; hover `set_value` → "Set Variable" card.
> 4. **MCP:** "X4 Forge: Copy MCP Server Config" → paste into your agent's MCP settings →
>    "Create Agent Key" (write scope) → replace placeholder → ask the agent to
>    "validate mod <name> with the x4forge tool" → it gets real findings.
> 5. **(Optional, opt-in)** set `x4forge.writeXmlAssociations: true`, re-run Open Mod Folder
>    on a mod with a PLAIN factions.xml, install Red Hat XML → check it validates against the
>    game XSD and does NOT light up diff-patch files.
>
> ## ✅ BUILT THIS RUN (all machine gates green; full record in ROADMAP)
> unit-0 palette 402-events fix · s1 Problems projection (diagnosticsMap 10/10 + live 4-finding
> drill) · s2 open-mod-folder + recommendations (modFolder 15/15; read-mostly by design;
> tasks.json cut as ceremony) · s3 IntelliSense (langService 12/12 + langContext 10/10 + live:
> 882 census-ranked children, factions routing, honest-empty t) · s4 MCP shim (REAL stdio
> session: 5 tools green, read-scope 403 + bad-key 401 + unknown-tool -32602 all surfaced) ·
> s5 default-off XSD associations (15/15 incl. diff-exclusion + a ui-depth bug the oracle
> caught). Final battery: tsc 0 (root+ext) · lint 0 errors · precommit OK · sweep 85/88 (same
> 3 env reds) · e2e 19/19 ×3 · VSIX integrity (mcp/ ships).
>
> ## 🎯 NEXT UNITS
> 1. Ken: commit → 0.0.14 publish flow (above) → eyeball batch → flip B56 ◐→✅ per item.
> 2. **B55 Phase 2 — corpus retrieval into prompts** (share B46P3's index — build once).
> 3. **B46 Phase 3 — full-corpus reference sets** (also unlocks reportUnknownElements for
>    routed domains + t-file {page,id} hover).
> 4. **B56 residuals:** precise-children completion mode · two-way folder editing decision
>    (needs drift telemetry) · lemminx corpus-proof (IDE) · EmmyLua stubs · s6 bucket.
> 5. **B55 residual:** first real repair-fire self-reports via the `repair` field.
> 6. In-game Ken-gated pair: B19 rail-to-game TTFM · B24s2 probe deploy.
>
> ## ⚠ LIVE HAZARDS / GOTCHAS (carry forward)
> - **Restart scratch after EVERY server edit** — plain `tsx` does not reload; a stale process
>   returned 0 findings on a seeded-defect mod THIS run (second occurrence of the class; spot
>   it by distrusting unexpectedly-clean results).
> - Scratch tsx instances hold Vite HMR port 24678 machine-globally — KILL before e2e.
> - Never pipe gate output through tail/head — full log to a file, tail the file.
> - lang providers: 30s cache; they never spawn a sidecar (keystrokes must not boot servers).
> - SchemaIndex children sets are OVER-INCLUSIVE by design (suppression) — fine for
>   validation, imprecise for completions; do NOT "fix" them in place (B46 regressions) —
>   the residual is a separate precise mode.
> - Sweep env reds on scratch: expression-suggest 0/0 + reference-selftest + selftest 7/10.
> - configPath never falls back to X4_STATE_DIR. e2e verdict-parsed only. Kills by port-PID.
>
> ## 🚀 STORE STATE — Open VSX `x4forge.x4-forge-studio` **v0.0.14 STABLE** (2026-07-17)
> `ovsx publish` exit 0 (🚀 v0.0.14); staged-bundle probe PASSED pre-publish (all B56 oracles
> + endpoints in the exact shipped server.cjs). Carries B56 Phase A + B55P1 + B46P2. Ken's
> Antigravity auto-updates from the store channel.
