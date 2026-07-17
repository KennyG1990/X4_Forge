# SESSION HANDOFF — X4 Forge (worktree branch `claude/x4-forge-vscode-poc-806ef5`)

> ## ⛔ COMMIT POINT (2026-07-17, early) — B55 Phase 1 PARTIAL-closed; Ken commits
> **HEAD = `83c2369`** (B46P2 + 0.0.12 bump committed). **UNCOMMITTED (Ken owns commits):**
> B55 Phase 1 — src/lib/agentLoop.ts (NEW) · server.ts (phase-4 repair loop + openrouter
> default model fix + oracle registration) · projectValidation.ts (flattenProjectValidation) ·
> selftestRegistry.ts (await async oracles) · vscode-extension/package.json (0.0.12→0.0.13) ·
> records (BACKLOG/ROADMAP/this file).
> **Suggested title:** "feat(agent): B55P1 validation-driven repair loop — composite validator
> drives generate phase 4 (oracle 12/12, spend-capped, honest repair reporting); fix openrouter
> default model + async selftest registry; bump extension to 0.0.13"
>
> ## ✅/◐ CLOSED THIS SESSION (records in ROADMAP)
> 1. **B46 Phase 2 VERIFIED** (earlier tonight, committed): file→schema routing corpus-proven;
>    include-shim loader fix; md_generator_zero_findings green.
> 2. **Stable 0.0.12 PUBLISHED** to Open VSX (registry-confirmed, preRelease=False; staged
>    bundle functionally probed BEFORE publish: md-audit 0 + routing oracle 24/24).
> 3. **B55 Phase 1 ◐ PARTIAL:** the composite validator now DRIVES generate's repair loop
>    (agentLoop oracle 12/12; live test with Ken's openrouter key: 2 generates, clean first
>    pass → 0 repair calls = the no-spend contract proven; spend meter recorded 9 calls; key
>    never read into agent context). Residual: repair-path live-fire not yet observed (both
>    generations were clean); the response `repair` field self-reports when it fires.
>    Live-found+fixed en route: openrouter default model id was invalid (500 without
>    x-ai-model); selftest registry didn't await async oracles ({} → silent sweep FAIL).
>
> ## 🎯 NEXT UNITS (fresh session each)
> 1. **B55 Phase 2 — corpus retrieval into prompts** (plan §phase-2): deterministic
>    vanilla-example retrieval, budgeted, corpus-bytes-only; SHARE B46P3's SQLite index.
> 2. **B46 Phase 3 — full-corpus reference sets** (build the shared index here first).
> 3. **B46P2 residual (small):** palette `loadSchemaLibrary` include-blind (382 vs 402 events
>    on unpacked-ROOT configs) — apply expandIncludeChain, verify 402.
> 4. **B55 residual:** observe a real repair-fire (any dirty generation in normal use flips it
>    via the `repair` response field) → then the old-vs-new A/B drill on that prompt.
> 5. **In-game Ken-gated pair:** B19 rail-to-game TTFM proof · B24s2 probe deploy.
>
> ## ⚠ LIVE HAZARDS / GOTCHAS (carry forward)
> - **NEW (cost 2 red e2e runs): a scratch `tsx server.ts` instance holds Vite's machine-global
>   HMR websocket port 24678** (embedded dev middleware). The ephemeral e2e Vite dies on
>   EADDRINUSE and ALL specs cascade (first: connection-refused storm; the "1 passed then 2.3s
>   failures" shape = mid-run death). KILL scratch instances before `npm run test:e2e`, or run
>   scratch from the prod bundle (server.cjs, no vite).
> - **NEVER pipe a gate command through `tail`/`head` at run time** — the first e2e FAIL's
>   forensics were destroyed by `| tail -3` (output file had 3 lines). Capture full output to a
>   scratch file, tail the FILE.
> - Scratch-instance pattern: X4_STATE/CONFIG/DATA_DIR → scratchpad, X4_XSD_PATH → unpacked
>   root, kill by PORT-PID only. Bash gotcha: `export` before use — env-prefix vars don't
>   expand in redirects.
> - Keys: server-side stored keys resolve ONLY for app-UI-origin requests (`Origin:
>   http://127.0.0.1:<PORT>`); agent tests copy `data/ai-keys.json` (main checkout) into the
>   scratch X4_DATA_DIR WITHOUT reading it, and delete the copy after. Ken's provider =
>   openrouter; default model now `google/gemini-2.5-flash`.
> - Sweep reds on scratch instances: expression-suggest 0/0 + reference-selftest + main
>   selftest 7/10 are ENV (need configured object index) — A/B before blaming a change.
> - In-app Browser pane screenshots unreliable — Claude-in-Chrome for visual gates.
> - All releases STABLE, never --pre-release; `ovsx publish` exit 0 is authoritative
>   (OVSX_PAT in MAIN checkout .env.local). configPath must never fall back to X4_STATE_DIR.
>
> ## 🚀 STORE STATE — Open VSX `x4forge.x4-forge-studio` **v0.0.13 STABLE** (2026-07-17)
> `ovsx publish` exit 0 (🚀 v0.0.13); staged-bundle probe PASSED pre-publish (agent-loop 12/12
> + md-audit 0 + routing 24/24 in the exact shipped server.cjs). Carries B55P1 + B46P2
> (+B53/B54). Ken's Antigravity auto-updates from the store channel.
