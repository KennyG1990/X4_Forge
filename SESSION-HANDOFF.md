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

## NEXT UNIT — B61 (SPECIFIED, Ken directive, reconcile-first, NOT yet started)
Off B59d's honest limit, Ken said: "if you've identified un-schema'd work it sounds like we need a
schema for that." REAL gap — X4 ships NO content XSD for some domains (jobs is the known one; B46P2
routed only the `<diff>` WRAPPER, not job CONTENT). A subtly-wrong job compiles clean and fails only
in-game (flagged in the B59b + B59d AARs). **Closing it = AUTHORING validation the game doesn't ship
— real blast radius, Ken-GATED before any build.** First move: **RECONCILE** — enumerate which content
domains lack an XSD (jobs, then check god/regions/sectors/wares/etc.); look for the prior-art idea
already banked (B59b AAR: a corpus-grounded "job content lint" over the vanilla job vocabulary — valid
orders, `class` values, faction/tag combos, macro existence). Likely shape: an advisory
(WARNING-severity, like patch-readiness) corpus-grounded content LINTER, NOT a fake XSD. Ground:
`F:\Downskies\x4unpackersuiteV1\X4 unpacked 9.00` → libraries/jobs.xml (606 jobs) + scriptproperties.xml.
Present the reconcile finding + spec to Ken and get sign-off BEFORE building. Full record: BACKLOG B61.

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
