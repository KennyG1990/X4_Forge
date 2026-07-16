# SESSION HANDOFF — X4 Forge (worktree branch `claude/x4-forge-vscode-poc-806ef5`)

> ## ⛔ COMMIT POINT (2026-07-16) — stable 0.0.9 PUBLISHED; Ken commits next
> **HEAD = `ea87f37`** (docs: PUBLISHING.md). **UNCOMMITTED on the branch (Ken owns commits — his
> standing rule "leave the commits to me"):** the B48P2 + B53 + B52 code, the 0.0.9 version bump,
> and this session's records (BACKLOG/ROADMAP/handoff/plan docs/AAR appends). Suggested title:
> "B48P2+B53: collapse-default code pane (canvas real estate) + lazy CodeMirror chunk +
> X4_DATA_DIR seam; publish stable 0.0.9; close B50+B37 Ken eyeball gates"
>
> ## 🚀 STORE STATE — Open VSX `x4forge.x4-forge-studio` **v0.0.9 STABLE** (2026-07-16)
> Registry-API-confirmed live: `0.0.9 · preRelease=False · download=True`. **STANDING RULE: ALL
> releases are STABLE — never `--pre-release`** (Ken's decree; see vscode-extension/PUBLISHING.md
> for the exact publish loop; OVSX_PAT in `F:\DEV_ENV\X4_Forge\.env.local` — main checkout root,
> NOT the worktree, gitignored, never in chat). Store installs auto-update; Ken's own copy may be
> a SIDELOAD (Source: VSIX) which does NOT auto-update — reinstall from store or push the VSIX.
> Ken has announce-copy for SWI/Egosoft Discord (drafted this session).
>
> ## ⚠ POST-0.0.9 FIX ON DISK (uncommitted): B53 coupling bug found during the B18 eyeball —
> `proposal.xsdSchemaPath` was cwd-based while harvest writes to dataPath → extension first-run
> auto-setup pointed config at an empty, update-wiped dir. Fixed in gameDetectRoutes.ts,
> live-proven on a scratch instance. **0.0.9 on the store HAS this bug (extension wizard
> auto-setup only; standalone unaffected) → recommend 0.0.10 publish after Ken commits.**
>
> ## ✅ CLOSED THIS SESSION (all in ROADMAP with evidence)
> - **B18** — first-run wizard: visuals SEEN (Claude-in-Chrome) + fresh-boot zero-typing
>   acceptance proven end-to-end on an isolated scratch instance (~15s; schema 1507 elems loaded
>   from the wizard's own harvest). GOG branch = only residual.
> - **B48 Phase 2** — collapse-default code pane (canvas +164px live-measured), localStorage
>   persistence, lazy `React.lazy` CodeMirror chunk (not fetched until pane opens). e2e 19/19.
>   Found+fixed live: flex min-content defeated the aside width (`min-w-0` + `overflow-x-hidden`).
> - **B53** — X4_DATA_DIR seam: data/ (agent keys, AI keys, spend meter, api-registry, harvested
>   schemas) now survives extension updates. `src/lib/dataDir.ts`, 8 call sites, oracle 4/4,
>   live-proven (sidecar wrote agent-keys.json into X4_DATA_DIR).
> - **B52** — in-app bug reporter → prefilled GitHub Issues (KennyG1990/X4_Forge), secret-free by
>   construction, oracle 10/10, live drill green. Ships in 0.0.9.
> - **B50** — Activity Bar launcher: Ken EYEBALL CONFIRMED (icon renders, launcher works).
> - **B37** — Beginner/Expert shell: Ken EYEBALL CONFIRMED both shells — closes the item that sat
>   PARTIAL two sessions on the screenshot-transport timeout alone.
>
> ## 🎯 NEXT UNITS (Ken picks; fresh session each)
> 1. **B46 full-corpus validation** (`docs/plans/2026-07-15-full-corpus-validation.md`) — THE big
>    core-engine unit (loader/routing/corpus-refs, 3 phases). NEVER in the same session as editor
>    work. Highest blast radius; cry-wolf false positives are the historical failure mode.
> 2. **Remaining Ken-gated eyeballs:** B18 wizard visuals (⚠ LOOK ONLY — apply rewrites his real
>    config, ~1min). Game-needed: B19 rail-to-game TTFM proof · B24s2 probe deploy (write gate).
> 3. **Beta/market:** BETA-TEST-SCRIPT.md cohorts; Discord announce; MS Marketplace still blocked
>    on Azure subscription (deferred).
> 4. The spoop mod (fighters hold travel drive till weapon range) = easy AISCRIPT patch, good
>    Forge proof piece once aiscripts validation is exercised.
>
> ## ⚠ LIVE HAZARDS / GOTCHAS (carry forward)
> - `.env.local` (OVSX_PAT) lives at the MAIN checkout root `F:\DEV_ENV\X4_Forge\.env.local`, not
>   in this worktree — a publish script run from the worktree must read it from there.
> - Open VSX indexes a publish ASYNCHRONOUSLY (~40s–minutes): `ovsx publish` exit 0 is
>   authoritative; the `/api/.../latest` endpoint lags. Poll the version-specific endpoint.
> - configPath must NEVER fall back to X4_STATE_DIR (e2e sets it; broke validate once — fixed,
>   lesson banked). X4_CONFIG_DIR + X4_DATA_DIR are the extension-persistence seams.
> - e2e is verdict-parsed (`npm run test:e2e`) — raw Playwright exit codes lie (libuv teardown).
> - One `grid-canvas` e2e flake observed this session (clean rerun 19/19) — watch for recurrence.
