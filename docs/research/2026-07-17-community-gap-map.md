# B58 · Community gap map — what X4 modders complain about / wish for, vs what the Forge can deliver
Researched 2026-07-17 (web sweep: Egosoft wiki/forums, Steam discussions, Nexus, community blogs/GitHub).
Purpose: bridge "what people want" ↔ "what we can realistically ship." Candidates at the end are a
DECISION MENU for Ken — nothing below is scheduled until picked.

## Finding 1 — The newcomer wall is real, and it is OUR exact lane
- "Getting into X4 Foundations modding is a painful experience for a newcomer" — community blog
  (beko.famkos.net). Steam consensus: "not well documented… not hard to mod, just lotta research";
  knowledge lives in a Discord and scattered wiki pages; classic gotchas (md/ filenames must be
  lowercase) burn beginners.
- A long-running Steam thread ("Anyone else wish the modding SDK made it easy to create stories?")
  asks for EXACTLY the Forge: accessible narrative/mission creation without programming; sharing
  stories with other players; a visual approach (debated, but wished). Users frame it as a large
  untapped audience.
**Forge fit: DIRECT.** Templates/recipes/rail/Beginner mode + the census-curated palette ARE this
product. Gap to close: mission-ARC depth (multi-step story skeletons, not single cues) and a
"share it" packaging story (zip engine exists).

## Finding 2 — Debug/iteration pain: the community built partial tools; we already exceed them
- Enabling logs at all requires Steam launch-arg folklore (`-debug all -logfile debug.log`).
- Community tooling exists BECAUSE the loop hurts: X4CodeDebug (VS Code log-driven pseudo-debugger),
  X4 Log Watcher (GUI log filter), GS Debug (surfaces errors in-game).
**Forge fit: mostly SHIPPED** (debug-watcher brief, verdicts, LIVE cue lighting, FORGE-STATE) —
the gap is onboarding: nothing tells a user their game isn't even logging. A walkaround check
("debug logging not enabled — here's the exact launch string") is trivial and high-touch.

## Finding 3 — Mod conflicts & diff patches: best practice exists, verification doesn't
- Steam/wiki: two mods touching the same lines "won't load either"; guidance is "use diff files"
  for compatibility; standalone XML diff/patch helper tools exist on Nexus.
- Nobody offers CONFLICT DETECTION across an install: which of my 30 extensions patch the same
  nodes, and in what order?
**Forge fit: STRONG, mostly unbuilt.** We already parse diff docs, validate them (B46P2), and have
Extension Doctor + cat/dat readers over the extensions folder. A cross-mod diff-collision analyzer
(same-file same-target patches, load-order sensitivity) is a realistic, differentiating feature.

## Finding 4 — Save-game anxiety is the #1 user-side fear
- Steam threads: the permanent "modified" flag; mods that "won't uninstall correctly and then your
  save gamefiles have bugs"; venture lockout; manual save-editing folklore.
**Forge fit: PARTIAL, honest scope.** We cannot unflag saves (engine-side). We CAN lint mods for
uninstall-unsafe/save-breaking PATTERNS (cue/script renames — boundary already encoded; leaked
instantiate state; removing referenced wares) and stamp an honest "save-impact" section into the
mod's docs/PROOF. Every rule must be corpus/documented-behavior grounded (cry-wolf discipline).

## Finding 5 — What players wish mods DID (content demand = template demand)
From Steam mod-idea threads: epic per-faction mission arcs · war-reactive dynamic missions/guilds ·
patrol/policing behaviors · QoL order tweaks ("dock and don't wait") · custom gamestarts (ships/
relations/location) · diplomacy actions. Nearly all MD/jobs-scriptable — no new assets needed.
**Forge fit: DIRECT.** These are template/recipe SKUs. Gamestarts are already a routed, validated
domain (B46P2); a guided custom-gamestart recipe is cheap and popular.

## Finding 6 — Ecosystem: X4CodeComplete/X4CodeDebug overlap (be friendly, stay differentiated)
X4CodeComplete does scriptproperties completions + label defs/refs/rename (AIScript-strong),
needs user-configured extracted files. Ours is server-truth (registry/census/semantics), validation-
integrated, zero-config. Action: none required; optionally recommend theirs for AIScript labels
until our parity; never disparage.

## DECISION MENU (candidates, each a bounded unit; Ken picks)
- **B58a · Mission-arc & behavior template packs + share flow** — 3–5 recipe skeletons grounded in
  DeadAir/census (epic arc, war-reactive mission, patrol behavior, escort QoL), each rail-guided;
  package-to-zip share path already exists. [Findings 1+5 · effort M · impact HIGH]
- **B58b · Cross-mod conflict analyzer** — scan extensions folder, parse all diff targets,
  report same-target collisions + order sensitivity in Diagnostics INSTALL + IDE Problems.
  [Finding 3 · effort M · impact HIGH, differentiating]
- **B58c · Save-safety lint + honest save-impact stamp** — corpus/doc-grounded uninstall-risk
  rules; PROOF/content-docs section; never claims to fix the modified flag. [Finding 4 · effort
  S–M · impact M, trust-building]
- **B58d · Custom gamestart wizard/recipe** — guided gamestart over the validated gamestarts
  domain. [Finding 5 · effort S · impact M-H, popular]
- **B58e · Debug-logging onboarding check** — walkaround card detects logging-off and hands the
  exact launch string + doc link. [Finding 2 · effort XS · impact M for newcomers]
- **B58f · "The missing docs" export** — the in-app X4 WIKI tab enriched from schema+census+
  semantics (the X4_NOTES generator generalized): a browsable MD reference the community lacks.
  [Finding 1 · effort S · impact M, goodwill/AUDIENCE]

Recommended order if Ken wants a default: **e (trivial) → d → b → a → c → f.**

## Sources
- https://beko.famkos.net/2021/05/01/getting-into-x4-foundations-modding-on-linux/
- https://steamcommunity.com/app/392160/discussions/0/676200171205307466/ (story-SDK wish thread)
- https://steamcommunity.com/app/392160/discussions/0/598539452432975660/ (how hard is modding)
- https://steamcommunity.com/app/392160/discussions/0/5188757896260701747/ (mod ideas thread)
- https://steamcommunity.com/app/392160/discussions/0/1743355067080023375/ + /1743355067129280725/
  + /3104642254772637540/ (save-modified/uninstall threads)
- https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/ (+ h2odragon HOWTO)
- https://www.nexusmods.com/x4foundations/mods/1848 (X4 Code Debug) · /1669 (Log Watcher) ·
  /2167 (GS Debug) · /1578 (XML diff & patch tool) · /1721 (X4CodeComplete) · /1420 (ioTools)
- https://github.com/bvbohnen/X4_Customizer · https://github.com/archenovalis/X4CodeComplete
