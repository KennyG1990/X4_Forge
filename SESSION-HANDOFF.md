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

## B61 increment 1 ✅ VERIFIED 2026-07-17 (auto mode) — jobs content linter engine + oracle
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

## Eyeball queue (Ken 30-sec checks) — all already EYES-seen by the agent this session
- B59c: X4 WIKI → HUD & LUA → "UI Extensions Framework Compatibility (kuertee)".
- B59d: X4 WIKI → **Reference** tab → "Is this just another AI mod generator?" (confirm the mechanism
  paragraphs + honest-limit paragraph read right). Also the store page / README "Is this just another
  AI mod generator?" section on Open VSX once 0.0.21 propagates.

## Hot facts / hazards
- **Publish flow:** bump package.json → `npm run changelog` → `npm run stage-app` → (repo root)
  `npm run build` → (vscode-extension) `npm run package` → staged probe
  (`cd vscode-extension/app/dist && PORT=xxxx node server.cjs`, assert ROOT 200; health 401 by design)
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
`cd "F:\Downskies\x4unpackersuiteV1\X4 unpacked 9.00\libraries"` and inspect jobs.xml + the sibling
libraries/ for which content files have NO matching XSD — that enumeration IS B61's reconcile step.
