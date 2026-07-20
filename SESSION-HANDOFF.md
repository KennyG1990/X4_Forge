# SESSION-HANDOFF — X4 Forge (overwrite at every commit point)

**Project:** X4 Forge (the visual X4 modding studio + its VS Code/Antigravity extension). NOT the
x4_ai_influence mod, NOT the neural-link bridge. Branch `claude/x4-forge-vscode-poc-806ef5`.

## Where we are (2026-07-17)
Ken's **/goal** (build the B59 community-patch menu a→b→c→d, workflow-religious, publish-before-commit)
is **COMPLETE** — all four units shipped, published, committed, pushed.

- **B59a ✅** Patch-day readiness check — published **0.0.18**, `629a70b`.
- **B59b ✅** Galaxy reconcile (viewer; sector-edit deferred #64 P2) + `custom_patrol_job` jobs
  starter — published **0.0.19**, `12f3e35`.
- **B59c ✅** UI-Extensions (kuertee) compat wiki guide (codegen deferred, no raw-Lua carrier) —
  published **0.0.20**, `9f1a14a`.
- **B59d ✅** Anti-hallucination positioning copy, Ken-approved verbatim, grounded in the real Phase-4
  repair loop → README section + store blurb + new **Reference** wiki tab
  (`reference_ai_anti_hallucination`). e2e 19/19, EYES-seen, staged-probe ROOT 200. Published
  **0.0.21**, committed **`<this commit>`**. ← last commit point.

## Commit question
B59d is committed AND pushed (this session's final commit) and published (0.0.21). All of B59 a–d
are on the store and in git. Nothing uncommitted.

## CURRENT STATE (2026-07-20) — B-INGAME North-Star PROVEN live; degradation checkpoint
This was an ENORMOUS session. Banked + pushed (origin==HEAD `739620f`): the whole B64 audit-hardening batch
(SEC1-4, P1/P2/P4, T2, T1, A1, U-trio), **B65 cold-start onboarding SHIPPED as 0.0.30 on Open VSX**, and
**B-INGAME CLOSED** — the Forge-built two-extension mod (x4_ai_influence + x4_neural_link + Python bridge +
roleRAG + Player2) runs live in-game, EXECUTION gate verified via the Forge's OWN debug-log watcher
(LOADED_CLEAN off a live tail) + the AI loop firing (chat_*.json status:ok/player2/error:null/~2s). The
North Star is met. See ROADMAP for all closes.
**DEGRADATION CALLED — RE-RAISED with a 2nd data point (2026-07-20).** Ken confirmed the branch↔main divergence
is intentional (this IDE-extension branch is the live line; `main` is the deprecated browser-server app; do NOT
merge). Then, continuing the queue: **B67-2 became the SECOND recalled-symptom phantom this session** — like B67-1
(bridge-health), the claimed "validator over-warns on imported cues" is contradicted by the code (xmlParser.ts:163
defaults namespace to "this" on every import → namespace lint can't fire; OnAccepted is a `<library>` with wired
`<actions>`; Registry has event_game_loaded+action+namespace="this" → neither lint can fire). Retracted read-only,
NO fix (committed cc419fe). Two phantoms from unreliable recall = clear degradation signature.
**The entire remaining queue is fatigue-exposed** — either recall-dependent (B67-3: "Failed to fetch", also needs
the pre-0.0.30 install to repro, likely already fixed by P1) or eyeball/computer-use-gated (B64-U2 deploy-fail
color; B56/B57 IDE batches — need Ken's screen). B65-2..5 onboarding follow-ons are the only NON-recall CODE work
left, but they're UI so they'd close PARTIAL pending Ken's eyeball. **Recommendation: commit point now, fresh
session for the eyeball/IDE work.** If continuing, safest pick = a B65-2..5 onboarding code follow-on (no recall
dependency), closed PARTIAL pending eyeball. **Commit question:** all committed+pushed, origin==HEAD `cc419fe`,
nothing uncommitted.

## PRIOR STATE (2026-07-19) — B65 cold-start onboarding SHIPPED + VERIFIED LIVE
Real Discord user hit "md.xsd/common.xsd not found" and couldn't recover. Planned TWICE + reality-checked (both plans
wrongly assumed a first-party XRCatTool; the live install has none). Ken: no in-app unpacker (B66 rejected) — awareness
+ guidance + the harvest doing its whole job. **SHIPPED + VERIFIED LIVE:** (1b) harvest now extracts ALL 40 packed XSDs
tree-preserving (was 3 — packed users were silently degraded to a 3-domain validator); visual validation CAUGHT a shim
regression (packed md/md.xsd's `../../../` include overshoots the harvest tree → 382 events; fixed by skipping shim
duplicates → md→real libraries/md.xsd → **402 events / 40 domains**). (1) DirectorySettingsModal schema row is
self-rescuing: in-place "Extract schemas from my game install" button + always-available teach panel (how validation
works · harvest · unpack fallback → community tool SOURCES, tool-agnostic). Live: amber→Extract→green + banner, e2e 19/19.
Files: gameDetectRoutes.ts, DirectorySettingsModal.tsx. → ROADMAP. **Deferred B65-2..5** (wizard parity, re-entry gap,
raw-error deep-link, shared component). **Possible follow-up (AAR): add a synthetic-cat/dat oracle for the harvest shim-skip.**
Plan: `docs/plans/2026-07-19-onboarding-schema-coldstart.md`. **Commit point below.**

## PRIOR STATE (2026-07-18) — ACTIVE FOCUS: B64 audit-hardening batch (SPECIFIED, security-first)
Ken commissioned a full four-sweep read-only audit (security · data/perf · UI/a11y · tests/config/arch) and
ordered it planned out systematically, **security first, then agent's choice**, workflow-religious, disciplined
docs, "not from memory." DONE (this turn): reconciled against ADRs + capability-map, wrote the full SPECIFIED
plan → **`docs/plans/2026-07-18-audit-hardening.md`** + compact umbrella **BACKLOG B64**. NO code yet — each
unit ships a Ken-approval brief BEFORE implementation. **SEC1/2/3 ✅ VERIFIED (2026-07-18, headless, e2e 19/19, → ROADMAP):** SEC1 run_command scope fix (agentKeys.ts
`EXEC_PREFIX` denies exec to all agent-key scopes; oracle 20/20 + **live 403 drill** read→403 / session→200 /
benign→200) · SEC2 `.env.example` security/spend/dir vars · SEC3 `readXsdConfig` parse-safe degrade (oracle 12/12).
**SEC4 ✅ VERIFIED (headless, additive/default-off, oracle 13/13, e2e 19/19):** dollar-aware spend attribution
extending B25 — `estimateCallUsd` per-model pricing, per-provider USD rollup in ai-usage.json, optional
`AI_DAILY_USD_CAP` (0=off=legacy). Files: aiSpendMeter.ts, server.ts (chokepoint+import), .env.example. **Ken-review
the pricing table before treating as shipped spend policy.** **SEC5 (Origin-spoof) VERIFIED-as-real-gap by code,
DEFERRED to Ken** (isAppUiRequest trusts a client-settable header; the fix changes the deliberate isolation model →
needs Ken's mechanism choice). SEC6/SEC7 deferred. **SECURITY BLOCK DONE.**

**P1 ✅ VERIFIED (headless, e2e 19/19):** object-index stale-while-revalidate — `getObjectIndex` now serves the
stale index + schedules a deduped background refresh past the 60s TTL instead of blocking; build extracted to
`rebuildObjectIndexNow`. Deterministic generatedAt drill proved stale-serve (T1 post-TTL, T2 after bg). **NEW P1b
deferred:** truly non-blocking build (worker/chunked-async) — single thread still freezes during the bg refresh +
first cold build (honest acceptance revision). Files: server.ts (getObjectIndex + helper + ResolvedXsdConfig import).

**P2 + P4 ✅ VERIFIED (2026-07-19, headless, e2e 19/19 ×2):** P2 memoized getReferenceSets by index generatedAt
(consumers proven non-mutating); P4 added a bounded loose-XML digest per user root so nested edits flip a cold-boot
stamp. **P3 DEFERRED** (workspace-write debounce risks lost-write in the ADR-F1/SPEC-#66 path; safe dirty-check
doesn't address the rapid-distinct-edit symptom). P1b/P2b also deferred. **PERF BLOCK DONE.**

**T2 ✅ VERIFIED (2026-07-19, headless):** e2e verdict now from Playwright JSON report (immune to the libuv crash +
wording drift), stdout regex kept as fallback, `--selftest` 10/10 guarded in precommit. Files: scripts/run-e2e.mjs,
scripts/precommit-check.mjs.

**T1 ✅ VERIFIED (slice, 2026-07-19, headless):** `scripts/route-integration.mjs` (`npm run test:routes`, 13/13) —
external HTTP harness over the security surface (auth/scope/run_command-negatives/path-containment); SEC1 now a
PERMANENT regression guard; clean taskkill /T teardown. **T1b deferred** (deploy dry-run + validate-with-fixture +
ext smoke). Files: scripts/route-integration.mjs, package.json.

**U1/U2/U3 ◐ PARTIAL (BUILT, tsc/vite/e2e 19/19; EYEBALL-gated — scripts above):** persistent assertive error toasts,
red deploy-failure, shape-cued severity markers. Files: uiDialogs.tsx, GuidedRail.tsx, CodePreview.tsx.

**⚠️ HAZARD (banked 2×, 2026-07-19):** the graphify post-commit hook's BACKGROUND rebuild contends with e2e — caused
a transient 16-fail run AND a 0/0-no-report run this session, both non-reproducing on clean re-run. If e2e comes back
0/0 or mass-fail right after a commit, RE-RUN it (don't chase a phantom regression); confirm the code with `npx vite
build` + tsc first. T2's fallback correctly FAILs a no-report run (no false-green).

**A1 ◐ PARTIAL (BUILT, tsc/vite/e2e 19/19; EYEBALL-gated — script above):** accessible confirm/prompt dialog
(uiDialogs.tsx). RECONCILE: no shared modal shell exists → re-scoped to the DialogHost dialog; the ~10 bespoke feature
modals are **A1b** (shared `<Modal>` primitive + per-modal migration, eyeball-gated).

**ARCH1 RECONCILE-DEFERRED (2026-07-19):** pattern proven (`registerXxxRoutes(app, deps)`); ready candidate = AI
keys/usage trio (server.ts:1935/1945/8184 → `src/server/aiRoutes.ts`, deps setStoredAiKey/aiKeyStatus + spendMeter
snapshot). Not cut 14-units-deep: marginal value per extraction + security-relevant candidate → deserves a DEDICATED
extraction session (several groups, tsc+sweep+e2e per). **B64 BATCH: every clean bounded headless unit is now DONE.**
Remaining = eyeball-gated (A1/U1/U2/U3 built-PARTIAL awaiting Ken's screen; A1b/A2/U4 unbuilt) · Ken decisions (SEC5
Origin-spoof, X1 OAuth) · deferred-with-rationale (ARCH1, P1b/P2b/P3, T1b, A3, SEC6/7). No clean headless unit left to grind.
**Alternatively** the EYEBALL-
GATED (build headless, PARTIAL until Ken's screen — textinputhost blocks remote):** U1 error-toast assertive+persist
(uiDialogs.tsx), U2 deploy-failure color (GuidedRail.tsx:153), U3 severity icon (CodePreview.tsx:1185), A1 shared-modal
a11y. **KEN DECISIONS:** SEC5 Origin-spoof mechanism, X1 Google OAuth finish-or-remove. Full plan: docs/plans/2026-07-18-audit-hardening.md.

**COMMITTED + PUSHED — 4 clean commits this session (all origin==HEAD verified, on-branch, nothing published — headless):**
`b7466d5` SEC1-4 + P1 + B64 plan + canon · `82b837d` P2 + P4 · `ec62c5d` T2 · `b72a295` T1. **CANON CHANGE (Ken
2026-07-19):** KLIO commit flow RETIRED — the agent commits+pushes directly (git-ownership line in CLAUDE/AGENTS/GEMINI
+ commit-policy memory updated). Publish-before-commit now applies ONLY to user-facing releases. StarForge
capability-map.md updated per unit (separate repo, not in these commits).
**B64 BATCH STATUS:** headless high-value work DONE — SEC1-4 ✅, P1/P2/P4 ✅, T2 ✅, T1 ✅ (slice). Remaining is
NOT cleanly headless-closeable: ARCH1 (open-ended god-file extraction — fresh context) · U1-3 + A1 (EYEBALL-gated —
build then Ken's screen) · SEC5 + X1 (Ken decisions) · T1b/P1b/P2b/P3/A2/A3/SEC6/SEC7 (deferred w/ rationale in BACKLOG).

## PRIOR STATE (2026-07-18) — B63 god.xml thread COMPLETE; round-4 A3/B1/C1 remain
Latest published = **0.0.29**, HEAD on origin. The B63 thread (all origin-verified): registry refactor
(golden-identical, no publish) → A1 factions.xml lint (0.0.27) → index-fix (object index scans maps/ sector
macros; god.xml 133→0; 0.0.28) → A2 god.xml macro lint (0.0.29, one registry entry). The index-fix
root-caused a cry-wolf that bit twice (B62e + A2). **ROUND-4 REMAINING (reconcile-first):** **A3** loadout
slot-fit (needs ship-macro slot data — LIKELY another index gap) · **B1 bulk-transform PILLAR** (Ken
decision — new capability class, X4_Customizer's domain, multi-unit) · **C1** computed balance stats.
Adding a per-basename lint now = one `basenameLints` entry + its field/summary/flatten (response contract).
Session so far: 0.0.18→0.0.29 (13 versions) + the refactor. In-game proof still BLOCKED (desktop/textinputhost).
**Commit question:** 0.0.29 (`b903b33`) + handoff (`b087c23`) committed+pushed, origin==HEAD. B64 planning
docs (this turn: plan + BACKLOG + handoff) are UNCOMMITTED — commit point: "docs(B64): audit-hardening plan".

## B63 refactor ✅ content-lint registry (behavior-identical, no publish) 2026-07-18
The 3 per-basename lint loops (jobs/wares/factions) now share ONE `basenameLints` registry loop in
projectValidation.ts — GOLDEN behavior-preservation test proved byte-identical output across all 6 lints;
all oracles green, e2e 19/19. Committed `<this commit>`. NO publish (internal, behavior-identical).
Reconcile finding: the validate route serializes the full result (`res.json({...result})`), so the per-lint
FIELDS are an external contract — the registry DRYs the LOOP only, not the fields. **A2 (god.xml) is now the
clean next lint** (add a basenameLints entry + its field/summary/flatten). B1 transform pillar still Ken-decision.

## (shipped) B63/A1 ✅ FACTIONS.XML RELATIONS LINT SHIPPED 0.0.27 (round-4)
Round-4 research (PRE-CULLED, 2 agents triangulated): `docs/research/2026-07-18-community-gap-map-round4.md`.
A1 shipped: `src/lib/factionsLint.ts` — relation value bounds [-1,1] (always) + unknown-target-faction
(vs reference-set factions ∪ own defs; empty refset → skip). Oracle 11/11, corpus-clean 232 relations,
live proof caught+fixed a cry-wolf (empty-refset flagged real argon → now skips). e2e 19/19, published 0.0.27,
committed `<this commit>`. **ROUND-4 REMAINDER:** **A2 god.xml station-placement lint** (matchextension="false"
gotcha + macro resolution; uncovered; STRONG next) · **B1 BULK-TRANSFORM PILLAR** (Ken decision — the 3rd
pillar, X4_Customizer's domain, multi-unit; needs a spec + go) · A3 loadout slot-fit · C1 computed stats.
**⚠️ DO THE DOMAIN-REGISTRY REFACTOR BEFORE A2** — 6 near-identical content-lint wirings now
(jobs/wares/migration/tfile-ref/tfile-coverage/factions); extract domain→{fileMatch,lint,injectData} so A2
is a table entry not a 7th copy (hazard banked 3×, now overdue).

## (shipped) B62b phase 2 ✅ TRANSLATION COVERAGE MATRIX SHIPPED 0.0.26
Extends tfile lint: flags a page the mod defines in 2+ languages where one has fewer entries (real gap).
Corpus-verified cry-wolf-safe (477 vanilla multi-lang pages → 0 gaps). Oracle 18/18 (caught+fixed a
filename-vs-attr language-id normalization bug). Low-noise (one summary per page-language; single-lang
mods never nagged). Wired, e2e 19/19, published 0.0.26, committed `<this commit>`. **B62b phase 3 deferred:**
free-page-ID allocator + reserved-page-registry collision (needs community reserved-page data; own reconcile).

## (below) B62 round-3 RECONCILE-EXHAUSTED — b/c shipped; a/d/e falsified-or-covered; f/g need Ken
The clean buildable-now backend-lint work of round 3 is DONE. Reconcile rejected/culled the rest:
**e REJECTED** (corpus-falsified — 345 vanilla macros defined-but-NOT-indexed, so a macro-orphan lint
cry-wolfs; a class-restricted version is speculative + deferred). **f DEFERRED** (version encoding already
done; the new part = Steam Workshop cat/dat build + upload needs Egosoft's WorkshopTool.exe + is a publish
side-effect → Ken decision). **g DEFERRED** (UI-heavy + textinputhost-blocked). Next real content work =
a NEW research sweep (round 4) OR the deferred keystones (in-game proof [needs desktop], B62b phase 2,
B55 P2-3, B46 P3). See BACKLOG B62 for the full disposition.

## (shipped) B62b ✅ T-FILE reference integrity SHIPPED 0.0.25 (localization)
`src/lib/tFileLint.ts`: flags a `{page,id}` ref targeting a page the MOD OWNS but whose entry id is
missing (modder's own typo). Cry-wolf-safe (only mod-owned pages; no vanilla index). Oracle 13/13,
corpus-clean 12930 refs (caught + fixed a comment=-attribute false-positive class), wired into
projectValidation, e2e 19/19, published 0.0.25, committed `<this commit>`. **B62 status:** b ✅ + c ✅
shipped; a/d rejected-by-reconcile; **e/f/g OPEN (reconcile-first):** e index-coupling orphan lint · f
Workshop publish helper · g sel builder (UI-heavy). B62b phase 2 (coverage matrix/page-ID allocator) deferred.
HAZARD banked: 4 near-identical content-lint wirings now (jobs/wares/migration/tfile) — extract a domain
registry before a 5th; and the IDE eyeball remains blocked by textinputhost (needs a machine-side touch).

## (superseded) B61 phase 3 ✅ WARES linter SHIPPED 0.0.24 + IDE-eyeball BLOCKED (input-host)
Wares content linter shipped (`src/lib/waresContentLint.ts`, oracle 14/14, corpus-clean 1397/1397, wired
into projectValidation like jobs, e2e 19/19, published 0.0.24, committed `<this commit>`). jobs+wares both
close the no-content-XSD gap. **IDE EYEBALL (B56/B57) BLOCKED:** `textinputhost.exe` (Windows IME/input
host) keeps grabbing frontmost focus and blocking computer-use input to Antigravity (reproduced — key AND
click both failed); it's an un-grantable system process. Native-IDE eyeball needs Ken at the machine (dismiss
the input host) OR is genuinely un-drivable remotely this session. Nothing was disrupted in Ken's workspace.
HAZARD banked (AAR): 3 near-identical content-lint wirings (jobs/wares/migration) — extract a domain registry
before a 4th (god/ships).

## (superseded) B62 round-3 community features (auto mode, "build these out") — c ✅ SHIPPED 0.0.23; a/d rejected-by-reconcile
Research menu: `docs/research/2026-07-17-community-gap-map-round3.md`. Reconcile-first culled hard:
**B62a REJECTED** — content.xml language-completeness "won't launch" is a CORPUS MYTH (real mods incl.
x4_ai_influence ship 1 language, load fine). **B62d REJECTED** — auto-deps already built (externalApiRegistry
+ generateContentXML). **B62c ✅ SHIPPED** — version-migration/deprecation linter (`src/lib/migrationLint.ts`,
oracle 11/11, CORPUS-CLEAN 399/399, DOM-comment-safe, wired into projectValidation, e2e 19/19, published
0.0.23, committed `<this commit>`). **NEXT (round-3 remainder, EACH reconcile-first — a & d fell to reconcile):**
b t-file integrity/page-ID · e index-coupling orphan lint · f Workshop publish helper · g sel builder (UI-heavy).
KEY LESSON THIS ROUND: a research agent's secondary-source claim is a HYPOTHESIS — verify against the corpus
BEFORE building; expect a real fraction of "community-requested" ideas to be already-built or falsified.

## (superseded) B61 increment 1+2 ✅ VERIFIED 2026-07-17 (auto mode) — jobs content linter, WIRED + published 0.0.22
Ken cleared the parallel-agent blocker ("codex/Gemini not active") + "stick to the workflow", so
increment 2 wired the engine into the live validator. `jobsLint` layer in projectValidation.ts (advisory
WARNING, `ok` formula excludes it → never blocks), `getJobsVocabulary()` in server.ts (base + ego_dlc_*
merged, cached, reference-set factions) threaded into all 4 runProjectValidation call sites; findings hit
the validate response + capsules + IDE Problems panel. tsc/lint 0 · oracle 18/18 · LIVE endpoint proof
(jobs.* warnings from a corpus-configured server) · sweep 88/91 · **e2e 19/19**. Published **0.0.22**,
committed `<this commit>`. **NEXT — B61 phase 3 (SPECIFIED):** wares.xml content lint, same pattern
(jobs is the proven template). Full detail: ROADMAP B61 inc2 + BACKLOG.

## (superseded) B61 increment 1 — engine + oracle + corpus proof
Ken authorized the build ("auto mode, you're doing great"). Shipped `src/lib/jobsContentLint.ts` (pure
vocabulary-injected linter, mirrors patchReadiness) + oracle `jobs-content-lint-selftest` 14/14. CRY-WOLF
BAR MET: all **604 real vanilla jobs lint clean, 0 false positives** (learned 11 classes/13 orders/5
sizes); negative path exact; sweep 88/91 (new oracle green, 3 pre-existing env reds unchanged); tsc/lint 0.
Committed `<this commit>`. **UNWIRED on purpose** (off the live validator → no user-facing change, no
publish, avoids e2e/collision with the parallel codex + Antigravity-Gemini agents).

**NEXT — B61 increment 2 (SPECIFIED):** wire the linter into the validator — route jobs.xml (the null
route, schemaRouting.ts:70) → linter; learn from the **MERGED base+DLC jobs** (not just base — else DLC
orders/classes cry wolf; use the same extension-merge the galaxy-map/reference-sets use); thread
reference-set factions; surface as WARNING capsules; add `/api/agent/jobs-lint` GET + MCP tool if
warranted; re-run the 604+DLC-clean proof server-side BEFORE promoting jobs to CORPUS_PROVEN_DOMAINS; then
e2e (clean machine window — NOT while parallel agents run) + publish (user-facing → changelog). Phase 3 =
wares.xml. Full spec: `docs/plans/2026-07-17-b61-content-lint-unschemad.md` + BACKLOG B61.

## (superseded) B61 RECONCILE + SPEC — done 2026-07-17
Off B59d's honest limit, Ken said: "if you've identified un-schema'd work it sounds like we need a
schema for that." **Reconcile + spec are DONE** (read-only, while Ken away) — full plan committed at
`docs/plans/2026-07-17-b61-content-lint-unschemad.md` (`913156a`). Do NOT re-run the reconcile.
Finding: corpus ships no jobs.xsd/wares.xsd; `schemaRouting.ts:70-71` already maps jobs.xml/wares.xml
→ null (CORPUS-FALSIFIED 2026-07-16) so job/ware CONTENT is unchecked (only the diff wrapper is).
"A schema for that" = a NEW corpus-grounded content LINTER (no XSD to extend), plugging into the
existing null-route hook + CORPUS_PROVEN_DOMAINS cry-wolf gate + reference sets. Proposed shape:
`src/lib/jobsContentLint.ts` pure lib + `jobs-content-lint-selftest` oracle, learns legal vocabulary
from vanilla jobs.xml (606 jobs), checks a mod's jobs against it, WARNING-capped; **zero-false-positive
bar = all 606 vanilla jobs lint clean** (cry-wolf is the #1 risk on this surface). wares.xml = phase 2.
**BUILD IS KEN-GATED** — authoring validation Egosoft doesn't ship is a product-direction call, not a
presence one. When Ken gives the go: implement per the spec, corpus-prove, gate, publish decision his.

## BLOCKED (2026-07-17) — in-game validation of deployed x4_ai_influence (needs Ken AT the machine)
Ken cleared game-eyes via computer-use while away, but two machine-reality walls block it headless
(both [REPRODUCED] this session):
1. **computer-use `request_access` needs Ken to click the on-screen approval dialog** for Steam/X4 —
   only Antigravity was pre-granted; can't self-grant remotely.
2. **X4 won't launch headless:** direct `X4.exe -debug scripts -logfile debuglog.txt` → Steam DRM
   blocks; `steam://run/392160//-debug scripts -logfile debuglog.txt/` → Steam up (steamwebhelper)
   but NO X4 process + debuglog untouched (08:34) = a masked/unclickable Steam launcher/mod-warning
   dialog with no operator to clear it.
3. Antigravity is running a live Gemini agent + idle codex session (collision risk); its installed
   Forge ext is stale **0.0.16** (this session shipped 0.0.21) so IDE-eyeball there wouldn't validate
   current work anyway.

**RECON DONE (all verified, so the resume is ~5 min when Ken is at the keyboard):**
- Game: `G:\SteamLibrary\steamapps\common\X4 Foundations\X4.exe` (Steam appid 392160).
- Deployed mods incl. **x4_ai_influence** (+ x4_neural_link + kuertee x4-mod-ui-extensions) in
  `G:\SteamLibrary\steamapps\common\X4 Foundations\extensions\`.
- Save present: `C:\Users\Moshi\Documents\Egosoft\X4\20076855\` — debuglog writes there.
- Debug launch string (from healthCard.ts): **`-debug scripts -logfile debuglog.txt`**.
- Baseline debuglog "errors" are BENIGN modded-X4 noise: unsigned-mod signature fails (error 14/13),
  offline/venture-DLC patcher errors, the vanilla `OnlineGetVersionIncompatibilityState` abort. The
  x4_ai_influence proving slice: walk to an NPC → "Speak to AI" → wheel → chat → `[TEST] Declare war on me`.

**RESUME SCRIPT (Ken at the machine):**
1. Launch X4 from Steam (or with the debug launch options set on the game's Steam launch options), let
   the main menu load; if a "modified game" mod-warning appears, click through it.
2. Click **Continue** (loads last save) → wait for the game to load in.
3. Agent (or Ken) reads the fresh log: `C:\Users\Moshi\Documents\Egosoft\X4\20076855\debuglog.txt` —
   EXECUTION gate = x4_ai_influence cues init with zero `[=ERROR=]` beyond the benign baseline above.
4. EXPERIENCE gate (Ken's screen): drive to an NPC, "Speak to AI", run the `[TEST] Declare war on me`
   slice, confirm the response. Screenshot for the record.
Alternatively an agent CAN drive it once Ken approves the computer-use grant dialog for Steam + X4 and
clears the initial launch dialog — after that, menu→Continue is 2D nav (feasible), NPC-walk is 3D (hard).

## Eyeball queue (Ken 30-sec checks)
- **B64-A1** ✅ CLOSED VERIFIED via computer-use 2026-07-19 (live DOM: role=dialog/aria-modal/Escape/Tab-trap all proven). No Ken check needed.
- **B64-U1** ◐ — RECONCILE FOUND the app raises no error-kind toasts (all `toast()` are info); code future-proofs the error path but no live trigger. Ken decision: route `window.alert`→error-kind? (small, judgment call). No quick eyeball possible until an error toast exists.
- **B64-U2** ◐ — deploy failure color (amber→rose); NOT driven (deploy = filesystem side effect). Eyeball only if you deploy a broken mod: failure line should be RED not amber.
- **B64-U3** ✗ NO-OP ON LIVE (visual validation caught it) — the markers I edited are in the OLD renderer, but `CODEMIRROR_EDITOR=true` (CodePreview.tsx:29) makes CodeMirror the default; that renderer is DEAD CODE (live: `.cm-editor` active, 0 markers) and CodeMirror shows no per-line severity markers. Audit C-A11Y-4 FALSIFIED for the live app; U3 = harmless dead-path polish. **LESSON: the audit's UI/a11y findings are static — re-ground A1b/A2/U-items against the LIVE render path (CodeMirror + real components) before building.**
- B59c: X4 WIKI → HUD & LUA → "UI Extensions Framework Compatibility (kuertee)".
- B59d: X4 WIKI → **Reference** tab → "Is this just another AI mod generator?" (confirm the mechanism
  paragraphs + honest-limit paragraph read right). Also the store page / README "Is this just another
  AI mod generator?" section on Open VSX once 0.0.21 propagates.

## Hot facts / hazards
- **⚠️ DETACHED-HEAD HAZARD (lived 2026-07-17):** something in the build/e2e/scratch flow ran a bare
  `git checkout HEAD` and DETACHED HEAD mid-session; the next commit stranded on the detached HEAD and
  `git push` silently NO-OP'd (exit 0, remote didn't move). ALWAYS after a push assert
  `git rev-parse origin/<branch>` == `git rev-parse HEAD` and that `git status -sb` shows the branch, not
  "## HEAD (no branch)". Recovery if detached: `git branch -f <branch> HEAD && git checkout <branch> && git push`.
- **Publish flow:** bump package.json → `npm run changelog` → `npm run stage-app` → (repo root)
  `npm run build` → (vscode-extension) `npm run package` → staged probe
  (**`cd vscode-extension/app && PORT=xxxx node dist/server.cjs`** — cwd MUST be app/ so `cwd/dist` resolves; the
  old note said `cd app/dist` which double-nests to app/dist/dist/index.html → ROOT 500. assert ROOT 200; health 401 by design)
  → `npx ovsx publish x4-forge-studio-<v>.vsix -p $OVSX_PAT` (token in `F:\DEV_ENV\X4_Forge\.env.local`)
  → THEN git commit+push. **Publish-before-commit is firm; commit mechanism is flexible (git shell OK).**
- **release-notes.json** (vscode-extension/): add ONE plain-English block per version (audience = users)
  before `npm run changelog`. Humanized-subject fallback covers a missed block.
- Staged bundle entry is **app/dist/server.cjs** (NOT app/server.cjs).
- Fresh scratch boots in **Beginner** mode (no top nav) — click **EXPERT** (top-right toggle) to reach
  the X4 WIKI / AGENT API / GALAXY top-nav tabs for eyeballs.
- e2e swaps the LIVE workspace — MACHINE-STATE ASK before running; workers=1; verify guard restore.
- Host-truth: run gates on the host; sandbox mirrors LIE.
- Env-red sweep items (3): known, not regressions.

## First command for the next session
Active work = **B64 audit-hardening**. First unit = **B64-SEC1** (run_command scope fix). First command:
read `docs/plans/2026-07-18-audit-hardening.md` (B64-SEC1 section) + `src/lib/agentKeys.ts:203` (scopeAllows
blanket-GET grant) + `server.ts:8188` (run_command exec) — then give Ken the approval brief before editing.
(Prior thread's next command, if B64 is paused: inspect `F:\Downskies\...\X4 unpacked 9.00\libraries` for
round-4 A3 loadout slot-fit reconcile.)
