# SESSION HANDOFF — X4 Forge (worktree branch `claude/x4-forge-vscode-poc-806ef5`)

> ## 🚀 SHIPPED (2026-07-16): X4 Forge Studio is LIVE on Open VSX
> **https://open-vsx.org/extension/x4forge/x4-forge-studio** — `x4forge.x4-forge-studio v0.0.4`,
> MIT, pre-release, auto-updates in Antigravity/Cursor/Windsurf/VSCodium. Namespace `x4forge` owned;
> `OVSX_PAT` in `F:\DEV_ENV\X4_Forge\.env.local` (main checkout, gitignored — NEVER in chat/worktree).
> **UPDATE LOOP:** commit → bump `vscode-extension/package.json` version → `npm run package` (vsce
> `--pre-release`) → `cd vscode-extension; npx ovsx publish <vsix> -p $OVSX_PAT` (read token from
> .env.local; each publish is Ken-authorized). Flip beta→stable = same but WITHOUT `--pre-release`.
> MS Marketplace still gated on Azure-subscription requirement (deferred, not blocking).
> Marketplace-prep changes (B49) are PRODUCT+extension source, uncommitted on the branch — commit them.
>
> ## ⛔ COMMIT POINT (2026-07-15, degradation call RATIFIED by Ken)
> **CORRECTION: Ken already committed B41+B42 on this branch as `379255c` ("feat(forge): Launch
> VS Code Extension PoC, Agent Key Manager, and new workspace modes") — the header's v1.0.213 IS
> that commit.** Remaining uncommitted = **B43+B44+B45+B47 + records** (15-ish files, junk-checked
> clean: no secrets/config/data/VSIX). Suggested title:
> "feat(forge): sidecar debugging (both IDEs), git-derived live version, save-gate fix,
> bridge-row de-escalation — B43–B45, B47"
> (or individually: the B43/B44/B45/B47 titles in their ROADMAP entries.)
> **NEXT UNITS (fresh sessions, one each — Ken picks order):** ① **B48 phase 1** (Monaco core swap
> inside CodePreview's shell — `docs/plans/2026-07-15-editor-replacement.md`; reconcile done: ONE
> component, ONE mount, ~20-prop contract) ② **B46 phase 1** (multi-schema loader —
> `docs/plans/2026-07-15-full-corpus-validation.md`) ③ **B49** (marketplace readiness —
> `docs/plans/2026-07-15-marketplace-readiness.md`; VERIFIED: Antigravity = Open VSX registry;
> publisher accounts + every publish are Ken's). Never B48+B46 in the same session. Ken-gated queue also: port B41–B45 to
> main (B44/B45 are PRODUCT source), beta cohorts, two live debug sessions may still be attached
> (disconnect at leisure).

> ## ◐ AUTHORITATIVE CURRENT STATE — 2026-07-15 (this WORKTREE; the main checkout's own
> ## SESSION-HANDOFF.md at F:\DEV_ENV\X4_Forge governs main — it was NOT touched)
>
> **This branch = the B41 VS Code / Antigravity extension PoC fork.** Base 8050e03 + the
> main checkout's 33-file uncommitted B34–B37 delta copied byte-identically (0/33 MD5
> mismatch) + B41 work. **Main checkout: never written this session** (verified at close:
> same 33 dirty files, 0 stashes; live :3000 workspace hash `dac6d106bd45f2bd` byte-identical
> to its pre-session record).
>
> - **B45 status: ✅ VERIFIED** (2026-07-15, PRODUCT source) — directory paths save independently of
>   schema validity. `POST /api/schema/config` no longer 400-gates the whole save on md.xsd+common.xsd;
>   paths save + schema is reported (amber "saved, schema pending"). server.ts + DirectorySettingsModal.
>   Live-proven; e2e 19/19.
> - **B46 status: SPECIFIED, NOT started** — full-corpus schema/reference validation, MODDING-RELEVANT
>   SUBSET scope (Ken chose, not exhaustive). Load all XSDs from the schema folder + route each mod
>   file type to its real schema + full-corpus reference sets from the 9,884-file unpacked game
>   (`F:\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`). 3 phases (loader/routing/corpus-refs). Plan:
>   `docs/plans/2026-07-15-full-corpus-validation.md`. **This is a core validation-engine change (highest
>   blast radius; cry-wolf-false-positive is the historical failure mode) — deliberately deferred to a
>   FRESH session per the degradation call at the end of this long run.**
> - **B44 status: ✅ VERIFIED** (2026-07-15) — header version tracks git. `__APP_VERSION__` =
>   `major.minor.<git-commit-count>` baked at build time (moves with commits, updates when users
>   update the extension); new `__APP_BUILD__` tooltip = short SHA + date + dirty flag. vite.config.ts
>   + vite-env.d.ts + one App.tsx attribute. Live-proven header "v1.0.213". **This is PRODUCT source**
>   (unlike B41–B43 which were extension-only) — so the header version change is ALSO in the standalone
>   app and rides to main whenever the product is next built. Port with the rest.
> - **B43 status: ✅ VERIFIED live in BOTH IDEs** (2026-07-15) — gold-standard sidecar debugging.
>   `x4forge.debug` (off/inspect/inspect-brk) spawns the sidecar under `--inspect` + auto-attaches
>   the IDE Node debugger (both bundle js-debug — verified). Source-level TS via `x4forge.forgeRoot`
>   (repo build keeps the map); committed `vscode-extension/.vscode/launch.json` for the controller.
>   Proven live: Antigravity Call Stack "X4 Forge Sidecar RUNNING" + VS Code debug toolbar/"Debugger
>   listening on ws://". Default off = zero behavior change; touched ONLY `vscode-extension/` (repo
>   gates unaffected). **VSIX is now `x4-forge-studio-0.0.3.vsix`** (both IDEs). Plan:
>   `docs/plans/2026-07-15-gold-standard-debug.md`. Two debug sessions may still be running on the
>   scratch workspace (Ken can disconnect).
> - **B42 status: ✅ VERIFIED live in Antigravity** (2026-07-15) — agent key manager: named,
>   scoped (read/write/deploy), EXPIRING (1h/24h/7d/30d/never) keys, sha256-at-rest, one-time
>   reveal, revoke, audit. AgentBridge AGENT KEYS tab + extension command `x4forge.createAgentKey`.
>   Full lifecycle proven in the Antigravity webview (create w/ lifetime picker → terminal use →
>   scope 403 → revoke → terminal 401). Oracle 18/18, e2e 19/19, sweep 79/81, security matrix all
>   correct. Extension icon shipped; **VSIX is now `x4-forge-studio-0.0.2.vsix`** (installed in both
>   IDEs). Parity passes: 19/19 surface engines 200 + visual panel sweep. Auth chokepoint changed
>   (server.ts authMiddleware) — session token = unchanged fast path; **port this to main with the
>   B41 fixes.** Plan: `docs/plans/2026-07-15-agent-key-manager.md`.
> - **B41 status: ✅ VERIFIED in BOTH IDEs** (Ken authorized both installs, 2026-07-15). Installed
>   + launched + built a full mod (template→rename→compile→validate ok:true→package) in desktop
>   VS Code (sidecar :62647) AND Antigravity (sidecar :52030, Workspace Trust gate proven). Added
>   `x4forge.autoOpen` + `onStartupFinished`. Standalone :3000 untouched (hash dac6d106bd45f2bd).
>   ONLY remaining: the human private-beta market experiment (`vscode-extension/BETA-TEST-SCRIPT.md`)
>   + the commit-of-this-branch decision. Evidence `vscode-extension/evidence/VALIDATION.md`.
>   **NOTE:** Ken committed the main B34–B37 delta mid-session as `ff38642` (main is now clean);
>   this fork is an independent worktree branch and was never touched by that.
> - **Artifact:** `vscode-extension/x4-forge-studio-0.0.1.vsix` (2092 files / 16.77 MB,
>   contents inspected clean). Install: `code --install-extension <path>` → command
>   "X4 Forge: Open Studio". Uninstall: `code --uninstall-extension x4forge-local.x4-forge-studio`.
> - **Product fixes ON THIS BRANCH (port to main when Ken merges/commits):**
>   ① server.ts prod static `{index:false}` (packaged UI was 401-dead without it)
>   ② db.ts createRequire `__filename` fallback (better-sqlite3 never loaded from dist)
>   ③ playwright.config.ts + tests/e2e/ephemeral.ts pinned to 127.0.0.1 (localhost family
>   race — ECONNREFUSED ::1 killed whole suites nondeterministically).
> - **Worktree runtime env note:** e2e/oracles here needed `config.json` + `md.xsd`/`common.xsd`
>   copied read-only from main (gitignored files; a fresh worktree lacks them — remember this
>   for any future worktree fork).
> - **Gates at close (this branch):** tsc 0 · lint 0 · precommit 0 · e2e **19/19** (45s,
>   verdict-parsed) · sweep **78/80** vs staged prod sidecar (2 reds = reference oracles
>   needing a configured game install; mechanism in evidence file) · project/validate ok:true ·
>   graphify updated (code graph includes vscode-extension/).
> - **Live hazard observed (NOT caused here):** the standalone dev stack :3000/:3001 FLAPPED
>   (up→refused→up→refused→up) during the session; same symptom class as the 2026-07-13
>   outage in CODEX-ONBOARDING §6. Workspace survived byte-intact (hash match at close).
>   Worth a look at the watchdog respawn cadence.
> - **Ken-gated queue (this branch):** ① write-gate approval → install VSIX in desktop
>   VS Code → run "X4 Forge: Open Studio" → walk the Beginner flow → close/reopen → uninstall/
>   reinstall ② separately, same in Antigravity ③ commit decision for this branch (title in
>   ROADMAP entry) ④ beta-cohort decision (script ready). Main's own Ken queue (commit
>   B34–B37, in-game batch, etc.) is unchanged and lives in main's SESSION-HANDOFF.
> - **Next unit's first command (after Ken's install approval):**
>   `code --install-extension F:\DEV_ENV\X4_Forge\.claude\worktrees\x4-forge-vscode-poc-806ef5\vscode-extension\x4-forge-studio-0.0.1.vsix`
