# SESSION HANDOFF — X4 Forge (worktree branch `claude/x4-forge-vscode-poc-806ef5`)

> ## ⛔ COMMIT POINT (2026-07-17, late) — B58 community patch BUILT; Ken commits
> **HEAD = `dafeed7`** (B57 committed). **UNCOMMITTED (Ken owns commits):** B58 —
> src/lib/modTemplates.ts (3 new starters) · server.ts (proof save-impact facts) ·
> src/server/projectValidation.ts (flat dedupe) · vscode-extension: extension.ts
> (checkModConflicts) + mcp/x4forge-mcp.cjs (check_conflicts) + package.json (1 command) ·
> docs/research/ + docs/plans/2026-07-17-community-patch.md · records.
> **Suggested title:** "feat(community): B58 patch — story-arc + war-reactive +
> custom-gamestart starters, conflict projection, save-impact facts"
> **PUBLISH DONE: stable 0.0.16 live on Open VSX** (staged probe: templates 33/33 +
> routing 24/24 + agent-loop 12/12 + md-audit 0 IN the bundle; registry-confirmed indexed).
> The uncommitted diff now includes the 0.0.16 bump.
>
> ## 👁 B58 EYEBALL ADDITIONS (append to the B56+B57 batch below)
> 8. **Starters:** RESET → picker shows Story Arc (3 stages) / War-Reactive Bounty /
>    Custom Game Start → pick Custom Game Start → XML PATCHING tab holds the gamestart
>    patch; LANGUAGES tab holds {10099,200-202}.
> 9. **Conflicts:** "X4 Forge: Check Mod Conflicts" (with your real game path set) →
>    status line + any real collisions/dep issues in Problems (source: x4forge-conflicts).
> 10. **Proof facts:** "Generate Proof Artifact" → PROOF.md now ends with "Save-impact
>    facts" (cues, patched files, overrides, the modified-flag truth).
>
> ## 👁 EYEBALL QUEUE (B56+B57 combined — your Antigravity after the 0.0.15 publish)
> 1. **Problems panel:** "X4 Forge: Validate Mod Folder" → findings in Ctrl+Shift+M,
>    click→file:line; break+save → refresh; TYPE without saving → squiggles update (~1s).
> 2. **Mod folder:** "Open Mod Folder in Workspace" → explorer shows the mod; AGENTS.md +
>    X4_NOTES.md + .vscode/extensions.json appeared; read AGENTS.md — THE RULE + your mod's
>    real cues/domains in it.
> 3. **IntelliSense:** in md/*.xml: `<` inside `<actions>` → census-ranked completions;
>    hover set_value → "Set Variable" card; F12 on a cue name in `cue="md.X.Y"` → jumps to
>    the defining `<cue>`; Shift+F12 → all references.
> 4. **MCP:** "Copy MCP Server Config" → paste into your agent's MCP settings + a write-scope
>    key → ask the agent to "stage_and_validate <mod>" then "readiness" — it should refuse to
>    claim done while stages fail (AGENTS.md tells it so).
> 5. **Proof:** "Generate Proof Artifact" with the mod folder open → PROOF.md opens: ladder
>    table + folder verdict + watcher line.
> 6. **(Opt-in) two-way:** set `x4forge.twoWayEditing: true` → edit an md file on disk →
>    adopt prompt → "Adopt into canvas" → open the studio: canvas shows your edit. (Counters
>    log to Output → X4 Forge.)
> 7. **(Opt-in) associations:** `x4forge.writeXmlAssociations: true` + Red Hat XML — plain
>    factions.xml validates against the game XSD; diff-patch files stay quiet.
>
> ## ✅ THIS RUN (B57 s1–s5; full record in ROADMAP)
> Machine: agentBrief 12/12 · langNav 10/10 · 8-tool stdio MCP drill (author_check broken
> draft → capsules; capsule-code parity; readiness honest) · proof markdown live · import→CAS
> adopt + 409 stale negative · sweep 86/89 · e2e 19/19 · tsc 0 ×2 · lint 0 · precommit OK.
> EYES (Ken-ordered): ?panel=diagnostics + ?panel=playtest land correctly; the s5-adopted
> "B56 Test" workspace visible on canvas (bogusattr preserved byte-faithfully as Custom XML
> node); readiness header honestly PACKAGE: WARN (4 warnings). Plan change recorded:
> CodeActions rescoped out (canvas-level fixes ≠ file-level apply).
>
> ## 🎯 NEXT UNITS
> 1. Ken: commit → 0.0.15 publish → combined eyeball batch above.
> 2. **B55 Phase 2** corpus retrieval into prompts · **B46 Phase 3** reference sets (SHARED
>    corpus index — build once; also unlocks t-file {page,id} hover + reportUnknownElements).
> 3. **B57 residuals:** s6 bucket (EmmyLua stubs · lemminx proof · formatter-drift guard ·
>    precise-children) · two-way default-on decision (needs its telemetry).
> 4. B55 residual (repair live-fire self-reports) · in-game Ken pair (B19 rail · B24s2 probe).
>
> ## ⚠ LIVE HAZARDS / GOTCHAS (carry forward)
> - Restart scratch after EVERY server edit (plain tsx doesn't reload) — applied mechanically
>   this run; the class still bites when forgotten.
> - Scratch tsx instances hold Vite HMR port 24678 → kill before e2e. Kills by port-PID only.
> - Never pipe gate output through tail/head — full log to file, tail the file.
> - SchemaIndex children sets are over-inclusive BY DESIGN — completions ride them; the
>   precise mode is a residual, never an in-place "fix".
> - lang providers never spawn a sidecar; live-buffer diagnostics are best-effort (save/
>   command paths stay authoritative).
> - Two-way adopt: import returns the workspace; the CAS commit is a SECOND call — always
>   read version first; 409 = canvas moved, re-run.
> - Sweep env reds on scratch: expression-suggest 0/0 + reference-selftest + selftest 7/10.
>
> ## 🚀 STORE STATE — Open VSX `x4forge.x4-forge-studio` **v0.0.16 STABLE** (2026-07-17)
> Registry-confirmed indexed. Carries B58 community patch + B57 + B56 + B55P1 + B46P2.
