# SESSION HANDOFF — X4 Forge (worktree branch `claude/x4-forge-vscode-poc-806ef5`)

> ## ⛔ COMMIT POINT (2026-07-16, night) — B54 watchdog VERIFIED; Ken commits
> **HEAD = `5850884`** (Ken committed B46 Phase 1). **UNCOMMITTED (Ken owns commits):** B54
> (vscode-extension/src/extension.ts watchdog + panel re-point), version bump 0.0.11, records.
> Suggested title: "feat(extension): B54 sidecar auto-restart watchdog (capped respawn + panel
> re-point), drilled live; publish stable 0.0.11"
> **B54 root cause banked:** the 20:56 sidecar death was the AGENT'S broad Stop-Process sweep
> (command line `node dist\server.cjs` carries no 'extension' marker — that's in the CWD).
> KILLS ARE PORT-PID ONLY from now on. Watchdog drilled live in Antigravity: killed :55430 →
> respawned :53143 in seconds, open panel re-pointed itself, workspace intact. Ken's
> Antigravity now runs 0.0.11 (header v1.0.222).
>
> ## 🚀 STORE STATE — Open VSX `x4forge.x4-forge-studio` **v0.0.11 STABLE** (2026-07-16)
> Registry-API-confirmed indexed (preRelease=False, downloadable). Carries the B18 wizard fix
> (B53 coupling bug: proposal.xsdSchemaPath was cwd-based while harvest writes to dataPath —
> extension auto-setup pointed at an empty dir; fix FUNCTIONALLY verified in the exact shipped
> staged bundle). STANDING RULE: all releases STABLE, never `--pre-release`
> (vscode-extension/PUBLISHING.md; OVSX_PAT in `F:\DEV_ENV\X4_Forge\.env.local` — MAIN checkout
> root, not the worktree).
>
> ## ✅ CLOSED THIS SESSION (all in ROADMAP with evidence)
> B48P2 (collapse-default canvas + lazy CodeMirror) · B53 (X4_DATA_DIR seam) · B52 (bug
> reporter) · 0.0.9 + 0.0.10 published stable · B50 + B37 (Ken eyeballs) · B18 (wizard visuals
> SEEN via Claude-in-Chrome + fresh-boot zero-typing acceptance ~15s on isolated scratch; found
> +fixed the B53 coupling bug) · **B46 Phase 1** (multi-schema registry: 40 domains live vs the
> unpacked 9.00, 0 unresolved includes, oracle 11/11, e2e 19/19, sweep 82/85 w/ 3 A/B-proven
> env reds).
>
> ## 🎯 NEXT UNITS (fresh session each)
> 1. **B46 Phase 2 — file→schema routing** (THE cry-wolf-risk phase; plan §phase-2):
>    path→domain map (factions.xml→factions.xsd, gamestarts, wares/jobs via libraries.xsd,
>    t-files, ui→addon/coreaddon, EMITTED PATCHES→diff.xsd) wired into runSchemaValidation +
>    project/validate; negative-path acceptance (malformed file FAILS, vanilla-shaped passes);
>    every new domain corpus-proven zero-false-positive before shipping (WARNING severity
>    until proven). **First job: investigate the P2 hand-off note — unpacked md.xsd flags 2
>    findings on the generator's synthetic MD (md_generator_zero_findings red on
>    XSD-configured scratch instances; A/B evidence in ROADMAP).**
> 2. **B46 Phase 3** — full-corpus reference sets (9,884 files, SQLite-cached).
> 3. **In-game Ken-gated pair:** B19 rail-to-game TTFM proof · B24s2 probe deploy.
> 4. Beta cohorts (BETA-TEST-SCRIPT.md) · Discord announce (copy drafted) · spoop mod
>    (AISCRIPT travel-drive patch — good aiscripts-validation proof piece).
>
> ## ⚠ LIVE HAZARDS / GOTCHAS (carry forward)
> - Scratch-instance pattern for gate validation: boot dist/server.cjs with
>   X4_STATE_DIR/X4_CONFIG_DIR/X4_DATA_DIR → scratchpad + X4_XSD_PATH → unpacked root; kill by
>   port PID (`Get-NetTCPConnection -LocalPort`). `Remove-Item Env:X` is sandbox-blocked — use
>   `$env:X=''` (empty string is falsy server-side).
> - Registry discovery cold walk over the unpacked tree = up to ~25s first-touch (FS-cold);
>   TTL-cached thereafter (14ms). ?refresh=1 busts it.
> - Sweep reds on scratch instances: expression-suggest 0/0 + reference-selftest + main
>   selftest 6/10 are ENV (need configured object index) — A/B before blaming a change.
> - In-app Browser pane screenshot transport is UNRELIABLE (timeouts; B37/B18) — use
>   Claude-in-Chrome for visual gates (adapter layer 6); DOM reads in the pane still work.
> - Open VSX indexes asynchronously (40–80s observed) — `ovsx publish` exit 0 is authoritative;
>   poll the version-specific endpoint, not /latest.
> - configPath must NEVER fall back to X4_STATE_DIR (e2e sets it). e2e is verdict-parsed only.
