# B59 · Community gap map, round 2 — demand-side + author-workflow angles
Researched 2026-07-17 (second web sweep: Nexus rankings, patch-cycle threads, framework
ecosystems, AI-modding sentiment). Complements round 1
(`2026-07-17-community-gap-map.md`). DECISION MENU at the end — nothing scheduled.

## Finding 1 — What the audience actually downloads (demand-side)
Nexus top/all-time is dominated by: total conversions (Star Wars Interworlds), galaxy
overhauls (Reemergence: ~75 new sectors, ship variants, new jobs/faction), VRO, and the
kuertee/DeadAir AI-tweak family; then QoL. Implications:
- 3D-asset conversions are OUT of Forge scope (no model pipeline) — never promise them.
- BUT the galaxy/sector/jobs layer of overhauls is pure XML (maps/, libraries/jobs.xml —
  domains our registry already discovers). The app HAS a GALAXY top tab — its actual
  capability must be RECONCILED before any galaxy-flavored promise (unknown at research time).
- AI-tweak mods are aiscripts+libraries diffs — inside our validation lane today.

## Finding 2 — The patch-day breakage cycle is structural (and tooling-free)
Every major game update (7.5, 8.0 discussions; game now at 9.x) "breaks a lot of mods —
normal for a major release"; modders manually discover which vanilla files changed and
whether their patches still apply. NOBODY tools this.
**Forge fit: STRONG, realistic, differentiated — "Patch-day readiness check":** given the
previous and current vanilla data (two unpacked roots or cat/dat sets), report per mod:
which of its diff SELECTORS no longer match, which target files changed at all, and which
schema domains changed shape. CARRIERS EXIST: multi-root schemaRegistry, overrideMap's
selector evaluation, cat/dat readers, per-mod patch-target lists. Seasonal killer feature
(every Egosoft update makes it trend).

## Finding 3 — The UI ecosystem runs through kuertee's UI Extensions framework
"Commonly required by other mods"; provides UI hooks/callbacks; fully compatible with 9.x;
its author now recommends KEEPING Protected UI Mode on (contrary to older folklore). Mods
target ITS hook API rather than raw ui diffs.
**Forge fit:** a "UI Extensions-compatible mod" starter — declares the dependency in
content.xml (dependency machinery exists) and scaffolds the callback registration pattern
(ground from the framework's GitHub readme before authoring — never invent its API). Makes
Forge mods first-class citizens of the real UI ecosystem instead of parallel to it.

## Finding 4 — "AI-made mods" is a community failure meme — and our exact counter-story
Steam verdict on ChatGPT modding: "one large LLM hallucination" — invented functions
(CreateShip), wrong language entirely. The failure mode is UNGROUNDED generation.
**Forge fit: already built, needs telling.** The B55 validator-driven loop, census-grounded
IntelliSense, author_check, AGENTS.md THE-RULE, and readiness-as-done are precisely the
anti-hallucination machinery. Product positioning asset: "the AI can propose; the game's own
schema decides." Copy needs Ken's voice — flagged as a Ken-item, not agent-shipped.

## DECISION MENU (round 2 candidates)
- **B59a · Patch-day readiness check** — two-corpus selector/target drift per mod; report in
  Diagnostics + PROOF + MCP. [effort M-L · impact HIGH, seasonal spikes · carriers exist]
- **B59b · Galaxy-tab reconcile → sector/jobs SKU decision** — reconcile what the GALAXY tab
  already does FIRST (unknown); then decide whether sector-add/jobs-variant starters are an
  extend or a build. [effort: reconcile S, then TBD]
- **B59c · UI-Extensions-compatible starter** — dependency-declaring UI mod skeleton over
  kuertee's documented hooks. [effort S-M · impact M · grounding required from his repo]
- **B59d · Anti-hallucination positioning copy** — store/README narrative (KEN-VOICED;
  agent drafts, Ken approves). [effort XS · impact M, adoption]

Recommended default order: **a → b(reconcile) → c → d.**

## Sources
- https://www.nexusmods.com/x4foundations/mods/popularalltime (+ /top, /categories, Nov-2025
  roundup https://www.nexusmods.com/x4foundations/news/15412)
- https://steamcommunity.com/app/392160/discussions/0/564786150742480727/ (which mods need
  updates) · /1630790506919109999/ (beta & mods) · /598539106885419219/ (8.0 breakage)
- https://github.com/kuertee/x4-mod-ui-extensions (+ Nexus 552, Steam Workshop 3477279743)
- https://steamcommunity.com/app/392160/discussions/0/4522261847573325888/ ("Chat gpt made a
  mod" — the hallucination verdict)
