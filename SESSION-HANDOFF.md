# SESSION HANDOFF — X4 Forge

> **⛔ STOP — `main` IS DEPRECATED (Ken, 2026-07-20).** This branch is the old browser-server app;
> everything below is stale 2026-07-15 Vision-v2-era state. **Live development is the VS Code
> extension line**: worktree `.claude/worktrees/x4-forge-vscode-poc-806ef5` (branch
> `claude/x4-forge-vscode-poc-806ef5`) — read THAT copy of SESSION-HANDOFF.md. Do NOT merge the
> two lines (intentional divergence, Ken-gated). `main` only matters as the GitHub default branch
> (README, community-health files).

> **⛳ STANDING GOAL (Ken, 2026-07-11): build out the ENTIRE Vision v2 scope** — all phases of
> `docs/plans/2026-07-11-vision-v2-ue5-editor.md` (Phase 0 closes + B18–B24 + promoted B10), task
> by task through THE workflow, until built or Ken-gated. Session grants (2026-07-11, per-session —
> re-ask each new session): machine quiet, standing e2e/browser clearance; EXPERIENCE gates batched
> per phase boundary. Ken-gated always: eyeballs, commits, B23/B8 unpark.

> ## ◐ AUTHORITATIVE CURRENT STATE — 2026-07-15 (supersedes every dated "remaining buildable" line below)
> **HEAD remains `8050e03`; working tree is intentionally dirty and UNCOMMITTED.** Pre-existing changes at
> session start: BACKLOG.md, ROADMAP.md, SESSION-HANDOFF.md modified; CODEX-ONBOARDING.md untracked. B34 then
> added its UI compiler repair across server/App/Canvas/UIBuilder/modDoctor/templates/types plus new helper,
> oracle, and plan files. B35 overlaps server/Canvas and adds Sidebar/catalog/toolbox/e2e/docs. Preserve and
> attribute the mixed diff honestly; no Git mutation was authorized.
> - **B34:** PARTIAL only because the scratch in-game Standalone Menu EXPERIENCE gate is open. Forge-side
>   compiler parity/package truth remains green (oracle now part of sweep 78/78).
> - **B35:** VERIFIED and moved to ROADMAP. One shared Sidebar/Canvas node catalog; Curated 66 / All 1,217;
>   rendered DOM bounded to 8 rows; aliases/favorites/recents/search/type filters proven. Gates: toolbox
>   14/14, typecheck, sweep 78/78, focused e2e 2/2, full e2e 14/14, browser, build, precommit, diff check.
>   Graphify 1,533 nodes/3,549 edges/85 communities. First focused e2e failure was a synthetic non-schema
>   fixture (`teleport_object`), corrected to real `create_god_factory`; AAR banked.
> - **B36:** VERIFIED and moved to ROADMAP. Global five-stage readiness ladder uses current graph/package,
>   successful deploy workspace hash, server watcher verdict, and exact-deploy user confirmation. Later edits
>   stale downstream proof; failed deploy attempts do not write evidence; Seen requires matching Deploy.
>   Gates: oracle 21/21, typecheck, sweep 79/79, focused e2e 2/2, full e2e 16/16, browser, build,
>   precommit/diff check. Graphify 1,559/3,610/94. Live ladder honestly shows Graph/Package green, Deploy
>   not deployed, In game deploy first, Experience waiting. E2E failures/worker crash and corrections banked.
> - **B37:** PARTIAL only on the adapter's screenshot artifact. Beginner/Expert mode is implemented: absent or
>   corrupt preference defaults Beginner; exactly five steps reuse the real editors/property inspector/B36
>   evidence/guarded compile wizard/exact-deploy confirmation; Expert retains the full studio; workspace and
>   selection survive switches. Second pass caught and fixed leaked Sync/Git + Agent API controls, readiness
>   clicks targeting hidden Expert tabs, a no-op AI action, and a live 1280 header overflow. Final gates:
>   experience 12/12, typecheck, sweep 80/80, focused e2e 3/3, full e2e 19/19 twice, build, precommit, diff
>   check, zero live console errors, header/readiness 1280/1280. `Page.captureScreenshot` has now timed out four
>   times across two sessions, including a fresh 400×300 crop while DOM reads stayed responsive and console errors
>   stayed at zero; capture size is ruled out and the in-app screenshot channel is isolated as the failure. The
>   implementation is green but the required strongest visual artifact is not claimed. Graphify 1579/3670/84.
> - **Active program:** `docs/plans/2026-07-14-product-loop-next-level-{design,implementation}.md`. Next
>   bounded slice is **B38 Deploy and prove**, now reconciled and `SPECIFIED` in
>   `docs/plans/2026-07-15-deploy-and-prove.md`; implementation remains behind this commit point. Reconciliation
>   rejected automatic scratch cloning as unsafe (internal X4 ids are not renamed), reproduced Playtest's blank-
>   path stale-workspace deploy, the hard-coded AI Influence expected chain, and the watcher false-negative for
>   data-only mods whose file-load evidence is already present. The corrected design confirms/deploys the visible
>   workspace unchanged and uses a purpose-built scratch workspace for live validation. B39 scoped AI and B40
>   installer follow in that written order. User explicitly authorized workspace
>   add/remove/change for validation and adjacent in-workspace fixes; real mod/game/config writes, Git,
>   spending, publishing, credentials, permissions, and deletion retain their separate gates.
> - **Ken/game-gated queue:** commit B34+B35 only after reviewing the mixed dirty diff; scratch-only in-game
>   Standalone Menu test; welcome-template/B19 rail walk; B24s2 probe deploy+confirm; B18 fresh boot; B20
>   real funnel; B8/B23 installer decision; B14 XPath/mod-profile decisions; B17 Node bump.
> - **Known residual:** upstream xsdParser still classifies structural children as actions. B35 keeps the
>   eight reproduced tags out of Curated but available via All/search; B10 structural-category rider remains
>   the root fix. B24s2 heartbeat also remains game-gated.
> - **Live state:** :3000/:3001 up; authenticated workspace re-verified `Player_Elite_Escort` (3 nodes /
>   2 links / 3 widgets; hash `dac6d106bd45f2bd`) after isolated e2e. Browser deliverable is Beginner mode;
>   no deploy, experience confirmation, game/config/mod write, or Git mutation was performed.
> - **DEGRADATION CALL:** this stretch accumulated multiple caught failures (fixture types, auth probe, three
>   focused-test corrections, stale reviewctl path, four screenshot timeouts, responsive regression). Commit
>   point now; use a fresh session for B38 rather than carrying this error density forward.
>
> Written by the outgoing agent at every commit point / session close. The incoming agent reads
> BACKLOG.md + THIS FILE before anything else — it transfers the WORKING STATE the Agent Brain
> and ROADMAP can't: hot files, live hazards, dead theories, the next unit's first command.
> Overwrite it each close; history lives in ROADMAP, not here.
> **Full onboarding (no-history agents): read HANDOFF.md — the comprehensive 28-section AI-to-AI
> handoff (rewritten 2026-07-11, corrected same day).**

> **⚠ WORKFLOW v3 ADOPTED 2026-07-12 (Ken's order):** the 8-step v2 workflow is REPLACED by the
> **Universal AI Task Workflow** (CLASSIFY→PLAN→BASELINE→RECONCILE→DOCUMENT PLAN→IMPLEMENT→VALIDATE→
> REVIEW→DOCUMENT CLOSE→AAR; closes are VERIFIED/PARTIAL/FAILED/BLOCKED/REVERTED, ✅=VERIFIED
> ◐=PARTIAL) + the **X4 Forge Project Adapter** — CLAUDE.md/AGENTS.md/GEMINI.md are now identical
> mirrors carrying both; canonical core `UNIVERSAL_AI_TASK_WORKFLOW.md`. "THE workflow" everywhere in
> this file now means v3. **Global copies DONE same day** (Ken granted folder access):
> `F:\DEV_ENV\{CLAUDE,AGENTS,GEMINI}.md` rewritten as identical mirrors (md5-verified; core + GLOBAL
> ADAPTER DEFAULTS + operator protocol) + canonical `F:\DEV_ENV\UNIVERSAL_AI_TASK_WORKFLOW.md`;
> StarForge `wiki\workflow\agent-instructions.md` v3 summary (stale Codex peer-review line removed);
> AAR ledgers banked. NO canon lag remains. Found+flagged: global Karpathy section was pre-truncated
> mid-sentence (preserved, noted in-file for Ken). B30 (mirror-drift precommit gate) spec'd in
> BACKLOG. Commit title: "workflow v3: adopt Universal AI Task Workflow + X4 Forge adapter
> (CLAUDE/AGENTS/GEMINI mirrors, HANDOFF refs)".

## Vision-v2 run progress (2026-07-11 — **PHASE 1 BUILDABLE SET COMPLETE**; commit titles pre-written):
- ✅ **B17** "B17: test:e2e verdict gate — libuv-crash-immune e2e wrapper"
- ✅ **Audit #6** "audit#6: debounce+quota-guard localStorage cache, memoize poll hash (measured; fixes over-quota sync-killer)"
- ◐ **B18** "B18: first-run wizard + game autodetect + schema harvest; oracle-sweep registry blind spot fixed"
- ◐ **B19s1** "B19s1: guided rail — tweak/deploy/see-it steps + RailGuide metadata + guided-rail e2e spec"
- ✅ **B20** "B20: TTFM funnel (local-only) — north-star metric instrumented, oracle 9/9"
- ✅ **VISUAL PASS** (guarded browser-pane; 2 defects found+fixed: rail z-under-minimap, last-item
  library delete impossible; wizard ✕ added) "visual pass: rail z-fix, last-item delete legal, wizard dismiss"
- ✅ **B21** "B21: action census — top-52 actions = 90% of 106k vanilla instances; B10 re-priced to one slice"
- ✅ **B25** "B25: AI spend meter + daily cap at the callMultiProviderAI chokepoint"
- ✅ **B27** "B27: runtime selftest-index; sweep discovers 71 oracles (2 census errors found by equality diff)"
- **Gates as of latest close: tsc 0 · sweep 71/71 (runtime-index discovery) · e2e 12/12 (test:e2e) · leak clean.**
- ◐ **B22s1** "B22s1: pattern browser — 4 provenance-carrying DeadAir patterns, oracle 9/9, DOM-verified"
- ✅ **B24 spike** "B24: inspector data-path decided — ADR-F3 (FORGE-STATE protocol first)"
- ✅ **B10s1** "B10s1: census-ranked curation — 91.5% of real usage explained (oracle 50/50)"
- ⛔ **INCIDENT (handled):** API restart + blank-client race clobbered the live workspace during the
  B10s1 close — CAUGHT by the leak-check reflex, restored from session snapshot, stable. Evidence
  written into B2s3's spec (now requires DISK PERSISTENCE + zero-client restart survival).
- **Final gates: tsc 0 · sweep 72/72 · e2e 12/12 · census 91.5% curated · workspace restored+stable.**
- **DEGRADATION CALL made at session end:** 12 closed units, error cluster in the last stretch (2
  comment-syntax slips, 2 edit-before-read, pane-hygiene contributing to the incident) — commit point
  NOW, fresh session for B2s3 (it deserves clean context; it's sync architecture).
- **GOAL RUN 2026-07-12 (standing): build ALL remaining BACKLOG until Ken-gated-only; commit-point pause
  every ~5 closes.** Close #1: ✅ **B2s3** "B2s3: workspace persistence + legacy-write gate + park-on-switch
  — singleton incident class dead (restart-survival + blank-boot reproduction proven live)". Close #2:
  ✅ **B29** "B29: responsive header (min-2150px label collapse) + unclippable sync-status layer; fix B2s3
  vite watch-ignore gap". Close #3: ✅ **B26** "B26: guard restore self-check (wrapper red on FAIL) +
  gate-matrix selftests + runtime-writes audit (2nd vite gap fixed: data/**)". Close #4: ✅ **B32**
  "B32: precommit tripwires table — jsx-comment-before-root blocked with named message". (Also today,
  pre-goal: "B13 residual visuals close".)
- **Ken committed (53ac590) → run resumed. Closes since commit:** ① ✅ **B24s1** "B24s1: FORGE-STATE
  protocol — parser + oracle 12/12 + live endpoint + Inspector panel (ADR-F3)" ② ✅ **B19s2a** "B19s2a:
  server watcher verdict (no_log/stale/not_seen/errors/clean, oracle 9/9) — rail + Playtest render it,
  TTFM gated on true loaded_clean" ③ ✅ **B19s2b** "B19s2b: beyond-canvas starter templates (price patch
  / t-file / HUD button, oracle 23/23) + onboarding/rail any-domain coupling fixes" — first in-anger use
  of B2s3's park/restore valve during the drill, worked exactly as designed. **B33 spec'd** (RESET never
  returns to template picker — blank preset ships a starter cue).
  ④ ✅ **B33** "B33: RESET returns to the template picker — dead starter cue removed" ⑤ ✅ **B22s2**
  "B22s2: mid-canvas pattern stamping (oracle 16/16, cue-name-collision defect caught+fixed) + sidebar
  stamp cards" ⑥ ◐ **B28** "B28: pane-wedge disposition — ours (Vite gaps) fixed, tool's banked;
  reclassified, no open work" ⑦ ✅ **B13b2** "B13b2: override-map→Diff→Patch pretarget (event+mailbox),
  HUD-button wiki guide, StarterCard unification".
  **⛔ DEGRADATION CALL at close #7 (goal-mandated, 2026-07-12):** error cluster in the last stretch —
  mount-race re-implement (B13b2), wrong oracle expectation (B24s1), 2 false-positive DOM probes, 1 JS
  syntax slip. All caught+fixed, but the trend is real and the remaining units are the biggest left.
  COMMIT POINT NOW; fresh session for B31.
  **All gates green at the call:** tsc 0 · sweep 75/75 · e2e 12/12 (RESTORE-VERIFY OK) · workspace
  byte-clean · pane parked. Commit: the seven quoted titles above, oldest first (or squash:
  "feat(vision-v2): inspector, verdict, beyond-canvas templates, stamping, QoL batch 2 + fixes").
  **RUN COMPLETE (2026-07-12, hook-directed to termination): closes #8–#16 after the degradation call,
  each deliberately small or reconcile-first:** ⑧ ◐ B31s1 (ephemeral-instance mechanism) ⑨ ◐ B14 triage
  ⑩ ✅ **B31** "B31: ephemeral e2e stack — guard + ALL workspace route-mocks DELETED; 12/12 ×2; live
  workspace untouched with no restore ever running; libuv crash gone off the shared server" ⑪ ✅ **B12**
  "B12: workspace switcher over the parked-state map — non-destructive round-trip via the real user
  flow" ⑫ ✅ **B11** "B11: ALREADY EXISTED (stale entry) — #65 import + AIScriptEditor chain live-drilled"
  ⑬ ✅ **B30** "B30: canon mirror-drift precommit gate — divergence drill BLOCKED exit 1" ⑭ ✅ **T4.3/B14
  final** "T4.3: ALREADY RESOLVED by substitution (inspector binding panel, 37th pass) — live-drilled"
  ⑮ B24s2 reclassified KEN-WRITE-GATED (validation inseparable from game-dir deploy) ⑯ phantom-work
  lesson banked globally (two stale 'buildable' entries had shipped under other names).
  **⛳ THE BACKLOG IS GENUINELY KEN-GATED-ONLY.** Remaining, all yours: commits (16 closes today) ·
  decisions (B8/B23 unpark · XPath lib dependency · P-C/P-D keep-or-drop) · write gate (B24s2) ·
  in-game batch (rail walk + 3 template EXPERIENCE checks + T1.3) · optional feel-passes (B18 wizard,
  B19 rail, B22 cards, icon-header at <2150px).
  **Final gates: tsc 0 · sweep 75/75 · e2e 12/12 on the ephemeral stack · precommit (tripwires +
  mirror gate) green · workspace byte-identical to its snapshot · pane parked.**

- **NO-VALIDATION-NEEDED BATCH (2026-07-13, "execute as much as you can without my validation"):** five
  agent-completable units, each backend/oracle-verifiable or housekeeping — backlog stays Ken-gated-only.
  ① ✅ **Standing-hazard sweep** (workflow rule 2e, was overdue): money=single AI chokepoint metered+capped;
  network=GitHub user-driven+auth-gated; delete=all path-jailed — CLEAN + removed one zero-caller
  recursive-wipe foot-gun (`cleanDirectoryExceptMetadata`). ② ✅ **B12 residual**: `contentSummary`
  (domain-aware) replaces "0 nodes" for beyond-canvas parked states (oracle 11/11, live-verified). ③ ◐
  **B24s2** probe generator: `forgeProbe.ts` + oracle 9/9 + read-only `/api/agent/probe/preview` (compiles
  clean, read-only invariant, round-trips) — **also fixed a latent B24s1 `\"`-vs-`&quot;` emit bug** (the
  round-trip oracle had used a hand-written line, never its own output); ◐ residual = deploy + in-game
  (Ken). ④ ✅ **HANDOFF.md refresh** (light lane): currency banner + fixed the load-bearing stale refs
  (workflow v3, ephemeral e2e / deleted guard, B2-fixed, backlog Ken-gated). ⑤ ✅ **fresh-eyes review**
  of the session's new code: emit consumers contained, escaping traced end-to-end — one real bug (the emit
  format) caught+fixed during the build, no new defects; one cosmetic oracle-detail cleaned.
  **Gates after the batch: tsc 0 · sweep 76/76 (probe oracle auto-discovered) · e2e 12/12 · workspace
  byte-identical · pane parked.** Two lessons banked globally (park-drill methodology; round-trip oracles
  must feed real generator output). B24s2's in-game deploy joins the Ken-gated queue.
  **Ken-gated queue (standing):** commits · in-game batch (welcome-template walk + the 3 new template
  EXPERIENCE checks: trader price, {10099,100} text, HUD button) · B23/B8 unpark · B24s2 (write-gated
  deploy of the probe extension) · B18 GOG branch (no GOG install to verify against).
- **MAJOR TOOL-HAZARD REVISION (07-12): most of the B28 "pane" flakiness this session was OUR bug** —
  .studio-state writes triggering Vite full reloads on every workspace commit. Fixed (vite.config ignore).
  Long pane JS evals survive now. B28 stays open for the pre-B2s3 wedge modes only (stale screenshot
  frames / click desync — those predate .studio-state).
- **Remaining buildable:** B26 guard self-check (+B2s3 residuals: RESET audit, first-contact branch,
  guard-removal decision, runtime-writes-under-one-root audit) · **B31 (ephemeral e2e server state)** ·
  B32 (jsx-comment lint tripwire) · B19s2 (brief verdict field + beyond-canvas templates) · B22s2
  (mid-canvas stamping + unified cards) · B24s1 (FORGE-STATE parser+panel) · B28 (residual modes) · B11
  aiscripts visual · B13 batch 2 · B14 leftovers (partly Ken-gated). Ken-gated: commits, in-game batch
  (script below), B23/B8.
- **Live hazard (new):** pane "park" must be VERIFIED (navigate to about:blank, then probe — an unverified
  park left a client CAS-writing through server restarts on 07-12).
- **Note:** HANDOFF.md §3/§20/§28 predate this run — ROADMAP/BACKLOG/this file are current; refresh
  HANDOFF.md next session (light lane).
- **EYEBALL QUEUE CLEARED 2026-07-12** (Ken said he didn't understand the items — agent ran the two
  remaining app visuals itself: wizard ✕ ✅ works; conflict card ✅ produced live via real 409, compact
  collapse works, **defect found: header overflow hides the card <~2300px → B29 spec'd**). Lesson
  banked: every Ken-gated item must ship with a click-by-click script. Ken's feel-pass on B13/B18/B19
  surfaces is now OPTIONAL, not gating.
- **IN-GAME BATCH (game-gated, whenever Ken next plays — THE one remaining Ken item, plain-English
  script):** launch X4 with the mod system enabled → in the Forge, clear canvas → Templates → "Welcome
  Message" → follow the 3 rail steps (tweak the text, click Deploy to X4, watch step 3 confirm from the
  game log) → in-game: load a save, the welcome line should appear in the logbook. That single walk =
  rail-to-game EXPERIENCE gate + first template in-game stamp + first complete TTFM funnel datapoint.
- **Gate note:** cite sweeps as N/68 (35/35 era = legacy subset). THE e2e gate = `npm run test:e2e`
  (12 tests, verdict-parsed exit).
- **Next build units (Phase 2):** B21 census → B10 slices; B22 pattern browser; B25 spend meter;
  B27 selftest-index; B19s2 (beyond-canvas templates + brief verdict field); then B2s3 (Phase 3).

## Handoff 2026-07-11 (second session: B13 e2e GREEN, records closed; ONLY Ken's eyeball + commit left)

**One-line state:** HEAD = 37209c8 (audit #3 AI key store). Uncommitted working set = audit #4
(fetchJson) + audit #5/B13 QoL batch + records (ROADMAP ◐ entry, BACKLOG B13/B17, HANDOFF corrections,
this file, .env.example fix). **All machine gates green 2026-07-11: host tsc exit 0, oracle sweep
35/35, FULL e2e suite 11/11 post-B13** (test:canvas 4/4 + project-validate 6/6 + xml-patch-merge 1/1),
workspace-guard restore confirmed (server holds Player_Elite_Escort, no fixture leak). **Task #60 is ◐
on ONE thing: Ken's eyeball on 4 surfaces** — ① canvas delete toast, ② library delete toast + Undo,
③ empty-state skeletons (empty scratch library), ④ compact badge on a narrow header.

**New findings this session (all banked):**
- `test:canvas` = **4 tests** (2 canvas specs), NOT 11 — "11/11" is the FULL suite. Records corrected;
  B17 spec'd (`test:e2e` script + exit-code wrapper).
- **libuv teardown crash:** Playwright prints "N passed" then dies `!(handle->flags &
  UV_HANDLE_CLOSING)` win/async.c:76, exit 0xC0000409 — reproduced 2/2. Judge by the summary line;
  the exit code lies. HANDOFF §22 row + B17.
- API auth header is `Authorization: Bearer <token>` (NOT `x-studio-token` as HANDOFF claimed —
  fixed). `GET /api/agent/schema` is the public self-documenting endpoint.

**Hot working set (unchanged from batch):** LibraryConfigurator.tsx (skeletons ~559/~593, delete ~484 +
saveCheckpoint prop), Canvas.tsx deleteNode ~553, App.tsx (keydown ~743, header btn, badge/card
~1313-1348), src/components/ShortcutsOverlay.tsx (NEW, untracked — single source of truth for the
shortcut list; add rows when adding bindings).

**Live hazards (unchanged):** e2e swaps the live workspace — MACHINE-STATE ASK first; Ken's canvas is
his; stale sandbox mounts lie (this session ran host-native PowerShell — job API not needed, but keep
it for sandboxed agents: body key `cmd`, output key `tail`).

**Dead theories (unchanged):** lossy compiler; canvas-e2e-is-environment; needs-npm-zip-dep.

**ALSO this session — VISION V2 PLANNED (✅ closed as a planning unit):** ADR-F2 ratified+written
(barrier-to-entry axis, TTFM north-star ≤15min in-app, first-success-before-depth); plan of record
`docs/plans/2026-07-11-vision-v2-ue5-editor.md`; BACKLOG P3.5 = B18–B24 spec'd (B19 absorbs audit
#7; B10 promoted+census-gated); **capability map CREATED** (`F:\StarForge\wiki\x4-forge\
capability-map.md`) — read it before any reconcile. Key reconcile: templates/recipes/onboarding/
schema-harvest ALL exist — B18/B19 are EXTEND items.

**Next unit's first command:** present the 4-item eyeball queue to Ken → on his ✅ flip the B13
ROADMAP ◐ entry to ✅ → commit point. Then Vision v2 Phase 0 finishes (B17, audit #6), then **B18
or B19 starts Phase 1** (B19 is the keystone — don't let easy items crowd it).

**Ken-gated:** commits (suggested: ① "Audit #4+#5: fetchJson helper; B13 QoL — empty-state previews,
delete toasts with undo, shortcuts overlay, badge clip fix" ② "docs(vision): ADR-F2 Vision v2 plan —
TTFM north star, B18–B24 spec'd" — squash if preferred); the eyeball queue; B8 stays parked (B23
carries its unpark decision).
