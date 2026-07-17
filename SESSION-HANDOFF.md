# SESSION HANDOFF — X4 Forge (worktree branch `claude/x4-forge-vscode-poc-806ef5`)

> ## ⛔ COMMIT POINT (2026-07-16, night session 2) — B46 Phase 2 VERIFIED + 0.0.12 PUBLISHED; Ken commits
> **HEAD = `46d5b86`** (B54 committed). **UNCOMMITTED (Ken owns commits):** B46 Phase 2 —
> src/lib/schemaRouting.ts (NEW) · schemaRegistry.ts (+expandIncludeChain) ·
> projectValidation.ts (loader fix + routing + LOADABLE_RE) · validationRoutes.ts (ai loader
> fix) · server.ts (emitted-files routing + oracle registration) · xsdValidate.ts
> (INDEX_CACHE_MAX 8→24) · vscode-extension/package.json (0.0.11→0.0.12) · records
> (BACKLOG/ROADMAP/plan doc/this file).
> **Suggested title:** "feat(schema): B46 Phase 2 — file→schema routing (corpus-proven
> factions/gamestarts/addon/diff, warning-capped unproven), include-chain loader fix kills the
> md-audit false positives; bump extension to 0.0.12"
>
> ## ✅ CLOSED THIS SESSION
> **B46 Phase 2 (VERIFIED, full record in ROADMAP):** the P1 hand-off note resolved — the 2
> md-audit findings were include-blind-loader false positives (md/md.xsd + aiscripts.xsd in the
> unpacked tree are ZERO-DECLARATION include shims; buildSchemaIndex never followed xs:include).
> `expandIncludeChain` fix: md index 1339→1507, `md_generator_zero_findings` GREEN. Routing
> shipped corpus-proven: 124 vanilla files (base+21 DLC roots) → 0 findings; proven set
> factions/gamestarts/addon/diff; coreaddon warning-capped (zero corpus instances). TWO PLAN
> ASSUMPTIONS CORPUS-FALSIFIED and corrected in-flight: wares/jobs→libraries.xsd is WRONG
> (26,835 vanilla findings; now diff-wrapper-only) and the drafted `<language id>` t-check was
> invented (26/74 vanilla omit it; removed). Gates: tsc 0 · touched-files lint 0 · precommit OK
> · sweep 83/86 (same 3 documented env reds, md flip green, new routing oracle 24/24) ·
> e2e 19/19 PASS. Negative path live via project/validate on the :3777 scratch.
>
> ## 🎯 NEXT UNITS (fresh session each)
> 1. **B55 Phase 1 — validation-driven repair loop** (Ken's active priority, from the
>    Forge-Agent/Codex conversation 2026-07-16): plan SPECIFIED at
>    `docs/plans/2026-07-16-validation-driven-agent-loop.md` — reconciled against code (the
>    phase-4 self-heal is one-shot vs validateModWorkspace only; runProjectValidation never in
>    the loop; no corpus retrieval). Phase 1 = composite-validator repair loop + signature halt
>    + B25 cap negative path. Real-key A/B drills are Ken-authorized per run.
> 2. **B46 Phase 3 — full-corpus reference sets** (plan §phase-3; B55 Phase 2's retrieval
>    should SHARE its SQLite corpus index — build once).
> 3. **B46P2 residual (small):** palette `loadSchemaLibrary` include-blind — 382 vs 402 events
>    on unpacked-ROOT configs. Apply expandIncludeChain; verify palette 402.
> 4. **In-game Ken-gated pair:** B19 rail-to-game TTFM proof · B24s2 probe deploy.
> 5. Beta cohorts (BETA-TEST-SCRIPT.md) · Discord announce (copy drafted) · spoop mod.
>
> ## ⚠ LIVE HAZARDS / GOTCHAS (carry forward)
> - Scratch-instance pattern: boot `npx tsx server.ts` with X4_STATE_DIR/X4_CONFIG_DIR/
>   X4_DATA_DIR → scratchpad + X4_XSD_PATH → unpacked root + PORT. Kill by port PID ONLY
>   (`Get-NetTCPConnection -LocalPort`). Bash gotcha: env-prefix assignments don't expand in
>   redirects — `export` first, then run (a boot attempt failed on `$SP/server.log` → `/`).
> - **Probe the real seam:** a verification probe must call the exported production function
>   (getSchemaIndex), not a hand-assembled replica (buildSchemaIndex direct) — the replica
>   reproduced the old behavior and nearly mis-verified the Unit A fix.
> - **Schema-by-name is a trap:** libraries.xsd does NOT govern wares/jobs content; t files have
>   NO schema. Every new routed domain ships WARNING-capped until a recorded zero-finding corpus
>   run promotes it (`CORPUS_PROVEN_DOMAINS` in schemaRouting.ts — evidence cited in comment).
> - Registry discovery on unpacked-root configs: ~25s FS-cold first touch, ~1-2s warm, 14ms
>   TTL-cached (5 min). runProjectValidation now touches it — first validate after boot/idle on
>   such configs pays the walk. Watch; don't fix yet.
> - Sweep reds on scratch instances: expression-suggest 0/0 + reference-selftest + main
>   selftest 7/10 (was 6/10 pre-fix) are ENV (need configured object index) — A/B before blaming.
> - In-app Browser pane screenshot transport UNRELIABLE — Claude-in-Chrome for visual gates.
> - Open VSX: `ovsx publish` exit 0 is authoritative; poll version-specific endpoint. All
>   releases STABLE, never --pre-release (PUBLISHING.md; OVSX_PAT in MAIN checkout .env.local).
> - configPath must NEVER fall back to X4_STATE_DIR (e2e sets it). e2e is verdict-parsed only.
>
> ## 🚀 STORE STATE — Open VSX `x4forge.x4-forge-studio` **v0.0.12 STABLE** (2026-07-16)
> `ovsx publish` exit 0 (🚀 v0.0.12); staged-bundle probe PASSED pre-publish (md-audit 0 +
> routing oracle 24/24 in the exact shipped server.cjs). Carries B46 Phase 2 (+ B53/B54 from
> 0.0.11). Ken's Antigravity auto-updates from the store channel.
