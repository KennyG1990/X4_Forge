# SESSION-HANDOFF — X4 Forge (overwrite at every commit point)

> **Read me first, then `BACKLOG.md`.** This is the working-state transfer for the NEXT session.
> Deep verified history lives in `ROADMAP.md` + `git log`; this file is CURRENT state only.

---

## 1. What project is this / where am I

- **Project:** **X4 Forge** — a visual X4:Foundations modding studio, shipped as a **VS Code / Open VSX
  extension** (`x4forge.x4-forge-studio`) + a bundled Express **sidecar** (`dist/server.cjs`).
  This is the **Forge codebase itself** — NOT the `x4_ai_influence` mod, NOT the `x4_neural_link` bridge.
- **Working tree:** `F:\DEV_ENV\X4_Forge\.claude\worktrees\x4-forge-vscode-poc-806ef5`
- **Branch:** `claude/x4-forge-vscode-poc-806ef5` — **this IS the live development line.**
- **Latest published:** **0.0.30** on Open VSX.

### ⚠️ Branch / main divergence — INTENTIONAL, DO NOT MERGE (Ken confirmed 2026-07-20)
`main` (local `ff38642`, origin `354588a`) is the **deprecated old browser-server app** and has been
undeveloped for days. This branch **forked from `8050e03`** (before `main`'s current tip) and carries ALL
real work (58+ commits: B46→B67, publishes 0.0.14→0.0.30). The two lines have **diverged on purpose** —
Ken does **not** want them merged. Reconciling branch↔main is a **Ken-gated git op**; do not attempt
merge/rebase. Just keep committing to this branch.

## 2. Git / commit question
- **Invariant (don't hard-code a SHA — it goes stale the instant this file is committed):** `git -C <worktree>
  rev-parse HEAD` must equal `git rev-parse origin/claude/x4-forge-vscode-poc-806ef5`, and the tree must be clean.
  That's the whole check — HEAD == origin & nothing uncommitted. (Last written at the commit that added this line.)
- **Git is DELEGATED to the agent** (Ken, 2026-07-19): commit + push directly with `git`; assert
  `origin/<branch>` == `HEAD` after every push (banked detached-HEAD hazard). KLIO/Antigravity commit flow
  is RETIRED. **Publish-before-commit applies ONLY to user-facing releases**; headless/internal changes just
  commit. The repo's **git pre-commit hook auto-runs `npm run precommit:check`** (tripwires + canon-mirror
  identity + e2e **verdict selftest** [NOT live e2e — no workspace swap] + typecheck). A doc-only commit is safe.

## 3. First moves for the fresh session
1. Read this file + `BACKLOG.md` (the open-work queue; B64/B65/B67 live there).
2. Confirm `git -C "<worktree>" rev-parse HEAD` == `git rev-parse origin/claude/x4-forge-vscode-poc-806ef5` (they
   must match — the exact SHA is whatever this file was last committed at; do NOT expect a specific hash).
3. **MACHINE-STATE ASK before anything live** (operator rule 2): "Are you in the app? Game running? Machine
   quiet?" — e2e and mod-import can swap Ken's live workspace / touch his canvas.
4. Pick from the PENDING QUEUE (§6) — recommend a NON-recall, non-eyeball unit, or drive an eyeball item
   WITH Ken on his screen.

---

## 4. What this (very long) session accomplished — all VERIFIED + pushed, see ROADMAP

- **B64 audit-hardening batch** (commissioned as a 4-sweep senior audit; planned security-first in
  `docs/plans/2026-07-18-audit-hardening.md`). **Headless high-value work DONE + VERIFIED:**
  - **SEC1** run_command scope fix (`agentKeys.ts` `EXEC_PREFIX` denies exec to all agent-key scopes; oracle
    20/20 + live 403 drill) · **SEC2** `.env.example` security/spend/dir vars · **SEC3** `readXsdConfig`
    parse-safe degrade (oracle 12/12) · **SEC4** dollar-aware spend attribution + optional `AI_DAILY_USD_CAP`
    (default-off; oracle 13/13) — **Ken should review the `MODEL_PRICING` table before treating as shipped policy.**
  - **P1** object-index stale-while-revalidate · **P2** memoized `getReferenceSets` · **P4** loose-XML digest
    per user root. All headless, e2e 19/19.
  - **T2** e2e verdict from Playwright JSON report (immune to the libuv teardown crash) + `--selftest` 10/10 in
    precommit · **T1** `scripts/route-integration.mjs` (`npm run test:routes` 13/13) — permanent SEC1 regression guard.
  - **Ken decisions (deferred):** SEC5 Origin-spoof mechanism, X1 Google OAuth finish-or-remove.
  - **Deferred-with-rationale:** ARCH1 (god-file route extraction — candidate = AI keys/usage trio →
    `src/server/aiRoutes.ts`; needs a dedicated session), P1b/P2b/P3, T1b, A1b/A2/A3, SEC6/SEC7.
- **B65 cold-start onboarding — SHIPPED 0.0.30, VERIFIED LIVE.** Real Discord user hit "md.xsd/common.xsd not
  found". Fix: DirectorySettingsModal schema row is self-rescuing — in-place **"Extract schemas from my game
  install"** button + always-available teach panel (how validation works · harvest · unpack fallback). The
  harvest now extracts **all 40 packed XSDs tree-preserving → 402 events / 40 domains** (was silently 3).
  Visual validation CAUGHT a shim regression (packed `md/md.xsd`'s `../../../` include overshot the harvest
  tree → 382 events; fixed by skipping shim duplicates). Files: `gameDetectRoutes.ts`, `DirectorySettingsModal.tsx`.
- **B-INGAME North Star — PROVEN LIVE (EXECUTION gate).** The Forge-built two-extension mod (`x4_ai_influence`
  + `x4_neural_link` + Python bridge + roleRAG + **Player2** cloud LLM at `:4315`, NOT ollama) runs live
  in-game: LOADED_CLEAN off the Forge's own debug-log watcher + the AI loop firing (`chat_*.json`
  status:ok / provider:player2 / error:null / ~2s). EXPERIENCE war-trigger was prior-proven + deliberately scrapped.
- **B68 runaway-indent generator fix — VERIFIED 2026-07-20 (headless, no publish).** Dogfood find: raw-passthrough
  XML render (`generateMDXML`/`renderCue`, `src/types.ts`) was non-idempotent → leading whitespace grew unboundedly
  every save (proven on-disk: `ai_influence_contract.xml` `<actions>` ~100 spaces). Fix: `reindentRawXmlBlock` (trim
  each line + re-indent by tag depth → idempotent + self-healing), applied to all 3 passthrough spots. typecheck +
  `runCompileSelftest` 16/16 + e2e 19/19. Harmless in-game (whitespace insignificant). → ROADMAP. Follow-on: **B69**
  (inspector raw-XML box is a plain textarea vs the main CodeMirror editor — swap to `CodeMirrorField`; low-pri, eyeball).

## 5. ⚠️ Degradation status + the recall lesson (now with its resolution)
**A degradation checkpoint was raised (2026-07-20)** after **two recalled-symptom phantoms** — both things I believed
I *saw* live, both disproved by reading code, neither reproduced:
- **B67-1** "bridge-health false-negative" — code shows the check is correct (`bridgeUp = health.ok===true`;
  `:8713/health` returns `{ok:true,...}`). I'd conflated a stale down-state screenshot with a later up curl.
- **B67-2** "validator over-warns on imported cues" — `xmlParser.ts:163` defaults `namespace="this"` on every
  import (namespace lint can't fire); `OnAccepted` is a `<library>` with wired `<actions>`; `Registry` has
  `event_game_loaded`+action+`namespace="this"`. Neither lint can fire. Retracted, no fix.

**...then B68 RESOLVED the thread the right way.** Ken pointed at the raw-XML box ("am I chasing ghosts?"). I nearly
retracted based on the *screenshots* (which looked normal), then checked the **authoritative source** — the actual
on-disk deployed file — and it CONFIRMED a real runaway-indent bug. Fixed + VERIFIED (B68).

**DURABLE LESSON (refined, evidenced 3×):** recalled/observed *surfaces* (screenshots, pasted text, memory) are
unreliable — resolve every "is X real?" against the **deterministic/authoritative source** (the code, the on-disk
artifact, a reproduced run) **before** forming a verdict. The failure mode has two faces: *insisting* on a phantom
(B67-1/-2) and *caving* on a real bug (nearly, B68). The check settles both — don't insist, don't cave. Tag every
explanation **[REPRODUCED]** vs **[HYPOTHESIS]** (operator rule 7).

**Session-continuation guidance:** *grounded/deterministic* work (dogfood bug with an on-disk repro + an oracle, like
B68) is safe to continue and closed cleanly VERIFIED. What the degradation flag warns against is *recall-dependent* or
*eyeball-gated* work (§6) — a tired session manufactures phantoms there. Prefer grounded units; defer the rest.

---

## 6. PENDING QUEUE (from BACKLOG B67 + B64 + B65)

| Item | Type | Next step |
|---|---|---|
| **B67-3** "Failed to fetch" on LOAD MOD PROJECT | recall-dependent + needs pre-0.0.30 install | Likely already fixed by B64-P1's stale-while-revalidate in 0.0.30. **Reproduce on the 0.0.30 install first**; only if it still fails, verify the import dialog's fetch has graceful degrade/retry vs a bare error. Low value — do not chase without a live repro. |
| **B64-U2** deploy-fail rose color | **eyeball-gated** | Built (`GuidedRail.tsx` deploy `fail` phase → `text-rose-300`); code-verified, not live-driven. Needs an **isolated scratch deploy** driven to a FAILING deploy, confirm rose on Ken's screen. |
| **B56 / B57 IDE eyeball batches** | **eyeball-gated** | Install 0.0.30 in Antigravity, drive Problems panel / IntelliSense / cue go-to-def / MCP tools / two-way adopt **in the IDE**. ⚠️ `textinputhost.exe` steals focus and blocks remote computer-use input — **needs Ken at the machine**. |
| **B64 U1 / U3 / A1** UX/a11y | **eyeball-gated** (built PARTIAL) | U1 persistent assertive error toasts, A1 accessible dialog (both A1 VERIFIED-live already), **U3 was FALSIFIED live** (CodeMirror is default; the old per-line severity renderer is dead code — audit finding C-A11Y-4 does not apply to the live app). |
| **B65-2..5** onboarding follow-ons | **CODE (non-recall)** but UI → closes PARTIAL pending eyeball | B65-2 wizard failure-branch parity (teach panel in the `canHarvestSchemas=false`/error branch — reuses B65-1 panel) · B65-3 re-entry gap (`App.tsx:442` + persistent banner) · B65-4 raw-error→settings deep-link · B65-5 shared `<SchemaRecovery>` component. **The safest "keep producing" pick if not stopping.** Plan: `docs/plans/2026-07-19-onboarding-schema-coldstart.md`. |
| **B69** inspector raw-XML box → CodeMirror | **CODE (non-recall)** but UI → PARTIAL pending eyeball | Swap the plain `<textarea>` at `PropertiesInspector.tsx:270` for the existing `CodeMirrorField` (reuse, no new infra) so raw XML gets syntax highlighting + X4 IntelliSense like the main editor. Low-pri; from the B68 dogfood thread. |
| **SEC5** Origin-spoof · **X1** Google OAuth | **Ken decisions** | SEC5: `isAppUiRequest` trusts a client-settable Origin/Referer header — real gap, but the fix changes the deliberate isolation model → needs Ken's mechanism choice. X1: finish or remove the OAuth stub. |
| **ARCH1** god-file route extraction | fresh-context code session | Pattern proven (`registerXxxRoutes(app, deps)`). Candidate: AI keys/usage trio (`server.ts:1935/1945/8184` → `src/server/aiRoutes.ts`). Deserves a dedicated session, tsc+sweep+e2e per group. |

**Possible follow-up (AAR, low priority):** add a synthetic-cat/dat oracle for the B65 harvest shim-skip logic.

## 7. Eyeball queue — click-by-click scripts (operator rule 1)
- **B64-U2 (deploy-fail rose):** open a mod project → point deploy at an intentionally-unwritable / bad target
  (or a folder with a deploy-blocking condition) → run Deploy → watch the GuidedRail deploy step: it must turn
  **rose/red** (not amber). 30-sec check.
- **B56/B57 IDE:** install the 0.0.30 VSIX in Antigravity → Open Mod Folder (x4_ai_influence) → confirm (a)
  Problems panel shows Forge diagnostics, (b) IntelliSense/hover works in an MD file, (c) go-to-def on a cue
  name jumps, (d) the MCP tools appear, (e) two-way adopt round-trips. Needs Ken at the keyboard (textinputhost).

## 8. Durable hazards & gotchas (carry forward)
- **Recalled UI symptoms are unreliable — reproduce before believing** (§5; evidenced B67-1 + B67-2).
- **graphify post-commit hook bg rebuild contends with e2e** → transient 16-fail or 0/0-no-report runs, both
  non-reproducing. If e2e comes back mass-fail/0-0 right after a commit, **RE-RUN** it; confirm code with
  `npx vite build` + `tsc` first. T2's fallback correctly FAILs a no-report run (no false-green).
- **e2e swaps the LIVE server workspace** → MACHINE-STATE ASK first; never parallelize (workers=1 deliberate);
  after any run verify the guard restored the real workspace (leak class #70).
- **Staged-probe cwd:** `cd vscode-extension/app && PORT=xxxx node dist/server.cjs` (NOT `app/dist`) → expect ROOT 200.
- **New public GET routes** must be allowlisted in `PUBLIC_READONLY_GETS` or they 401.
- **Host-truth:** sandbox mirrors are stale — host tools only. (This session is host-native, so moot here.)
- `precommit:check` runs only the e2e **verdict selftest**, not live e2e — committing does not swap the workspace.

## 9. Commands (adapter)
`npm run typecheck` · `npm run lint` · `node scripts/oracle-sweep.mjs` (cite the real N) · `npm run test:e2e`
(THE gate, verdict-parsed) · `npm run test:routes` (13/13) · `npm run precommit:check` ·
`npm run validate:mod -- "<folder>"` · prod build `npm run build` + `START-X4FORGE.cmd`.
**Publish (user-facing only):** bump `vscode-extension/package.json` → `npm run changelog` (edit
`vscode-extension/release-notes.json` first) → root `npm run build` → ext `npm run stage-app` → ext
`npm run build` → ext `npm run package` → staged probe (§8) → `ovsx publish x4-forge-studio-<v>.vsix -p $OVSX_PAT`
(token in `F:\DEV_ENV\X4_Forge\.env.local`) → commit + push + verify origin==HEAD.

## 10. Records map
- `BACKLOG.md` — open work (B64/B65/B67). `ROADMAP.md` — append-only verified history (all closes above).
- Plans: `docs/plans/2026-07-18-audit-hardening.md`, `docs/plans/2026-07-19-onboarding-schema-coldstart.md`.
- Capability map: `F:\StarForge\wiki\x4-forge\capability-map.md` (separate repo). ADRs:
  `F:\StarForge\wiki\x4-forge\decisions.md`. AAR: `F:\StarForge\wiki\x4-forge\aar-log.md` (general →
  `F:\StarForge\wiki\workflow\aar-log.md`). Code graph: `graphify-out/graph.json` (`graphify` CLI; code-only).
