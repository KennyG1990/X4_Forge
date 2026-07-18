# B62 · Community gap map, round 3 — authoring-workflow frictions (unmined)

Researched 2026-07-17 (third sweep: 3 parallel agents — Nexus/demand, Egosoft forum + Steam,
Reddit/tutorials/publishing). Complements rounds 1 (`…gap-map.md`) & 2 (`…round2.md`, fully shipped).
Every round-1/2 theme was excluded from the agents' scope, so everything below is NEW ground.
DECISION MENU at the end — nothing scheduled until Ken picks.

## Triangulation (independent convergence = high confidence)
- **Localization / t-files** surfaced by ALL THREE agents (language-completeness launch-crash, dangling
  `{page,line}` refs, page-ID collisions). Strongest signal of the round.
- **Multi-file coupling** (add-a-ware, index/macros registration, faction scaffolding) surfaced by all
  three — the classic "one logical change = N hand-synced files, one lowercase ID" tedium.
- **Publish/packaging pipeline** (Steam Workshop encodings, content.xml deps) — new, clean, uncovered.

## Findings (grounded; sources at end)

### F1 — content.xml language-placeholder completeness → GAME WON'T LAUNCH (localization)
A `content.xml` missing any of the 12 language-ID placeholder blocks (3,7,33,34,39,44,49,55,81,82,86,88),
or with a stray blank line after `</content>`, can make X4 **fail to launch entirely** for affected
users — process shows, window never opens, no error. Fully mechanical. **Carrier:** content.xml already
validated (B46P2). **Verdict: IN · LOW effort · HIGH impact** (worst UX class, deterministic fix).

### F2 — t-file reference integrity + page-ID allocation (localization)
Text is referenced three interchangeable ways (`{page,id}`, `readtext.page.id`, `page=/line=`); NOTHING
checks a ref resolves to a real `<t>`, that translations exist across languages, or that your `page id`
doesn't collide with stock voice-lines / another mod (the community's only defense is a hand-maintained
wiki table). **Carrier:** t/*.xml is structural-lint-only today (cap-map L80) → EXTEND. **Verdict: IN ·
LOW-MED effort · HIGH impact.** Sub-features: dangling-ref check · per-language coverage matrix ·
free-page-ID allocator + collision warning vs the known reserved registry. Distinct from cross-mod
conflict analysis (this is within-project localization authoring).

### F3 — version-migration / deprecation linter, 8.x→9.0 (migration)
9.0 renamed/removed real constructs (`<missiletags>`→`<missile>`; removed `<get_highest_resource_yield>`,
`<find_asteroid_in_cluster>`, `<event_area_discovered>`; renamed `ship.isexceedingmadscore`→
`ship.madscore.isexceedingmax`; restructured `region_definitions.xml`/`regionyields.xml`). Mods silently
break; modders hand-hunt the changes. **Grounded in Egosoft's own Breaking Changes wiki** → a maintainable
per-version ruleset. **Distinct** from patch-day selector-drift (constructs DELETED/RENAMED, not a `sel`
that moved). **Carrier:** scan like scriptProperties/mdPitfall lints. **Verdict: IN · MED effort · HIGH
impact, seasonal** (compounds every major bump).

### F4 — content.xml auto-dependency inference (publish/load-order)
If a mod diff-patches another extension, it must hand-declare that extension as a `<dependency>` or the
patch applies against the unpatched base and silently no-ops. **The Forge already parses every patch's
targets** (overrideMap/Doctor) → it can INFER the required dependency set + load order and generate/validate
the content.xml block. **Verdict: IN · LOW-MED effort (reuses existing parsing) · MOD-HIGH impact.**

### F5 — new-ware / index-coupling scaffolding + orphan lint (multi-file)
Adding one ware = 3 new + 7 modified files (`index/macros.xml`, `index/components.xml`, `libraries/{wares,
baskets,modules,modulegroups,icons}.xml`) sharing one lowercase ID; a new ship/station/module macro must
ALSO be registered in `index/macros.xml`+`index/components.xml` or it silently "doesn't show up." WareGen &
others exist solely to automate this. **Verdict: IN · MED effort · HIGH impact.** Two shippable pieces:
(a) an "orphan macro / unindexed component" LINT (cheap, high-value, fits the validator), (b) a "new ware"
multi-file WIZARD (bigger). Note: distinct from the specced B61-phase-3 wares CONTENT LINT (that checks
existing values; this generates/registers coupled files).

### F6 — Steam Workshop publish helper (publish pipeline)
Several silent traps in one flow: version is `version*100` (v2.50 → `250`); Workshop upload accepts ONLY
`.cat/.dat/.cur/.txt/.pdf` (loose XML/Lua must be catalog-built via `-buildcat`); newly published items
stay HIDDEN until the author flips visibility; multi-game-version needs `-buildvcat` + version subfolders.
**Carrier:** stage-app/package + B60 changelog exist → EXTEND with the Workshop encoding layer. **Verdict:
IN · MED effort · HIGH impact** (the packaging surface, currently unowned).

### F7 — visual diff-patch `sel` BUILDER (diff authoring)
Writing the limited-XPath `sel` for `<add|replace|remove>` is THE single most common authoring failure
("couldn't understand collections"). Click a node in loaded vanilla XML → Forge emits the correct `sel`
(with `[@attr='…']` predicates) + op. **Distinct** from patch-day drift (authoring a valid selector, not
detecting a broken one). **Verdict: IN · MED effort · VERY HIGH impact — BUT UI-heavy** (canvas + node
picking), so it needs Ken's-screen eyeball validation; lower priority for autonomous/remote work.

### Lower-priority / more-contested (real, but incumbent tools exist)
- **god.xml station-placement lint/template** (missing `matchextension="false"`, quota plumbing) — IN, LOW-MED.
- **Custom-faction multi-file scaffold** (factions.xml + relations + wares owner + jobs + t) — IN, MED-HIGH, fewer authors.
- **loadouts authoring vs components** (kills the Roguey's-site round-trip) — IN, MED; X4 Editor partly covers.
- **rule-based bulk balance edits** (wares/weapons/engines) — IN, HIGHER effort; X4_Customizer (Python CLI) is the incumbent, Forge's edge = visual + validate + diff.
- **sector/gate creation** (hex-coordinate solver + multi-file) — IN by layer but OVERLAPS the deferred #64 P2 sector authoring; do not scope as a quick unit.

## DECISION MENU (round-3 candidates — each a bounded unit; Ken picks)
- **B62a · content.xml launch-safety + language-completeness** — missing-language-ID lint + full-placeholder
  generator + trailing-junk catch. [F1 · effort XS-S · impact HIGH · carrier exists · no UI/eyeball]
- **B62b · t-file integrity + page-ID allocator** — dangling-ref lint + coverage matrix + free-page-ID +
  collision-vs-reserved-registry. [F2 · effort S-M · impact HIGH · extends t-file lint]
- **B62c · version-migration/deprecation linter** — per-version ruleset from Egosoft Breaking Changes wiki;
  advisory like patch-readiness. [F3 · effort M · impact HIGH, seasonal]
- **B62d · content.xml auto-dependency inference** — infer `<dependency>` set + order from patch targets.
  [F4 · effort S-M · impact MOD-HIGH · reuses patch-target parsing]
- **B62e · index-coupling orphan lint (+ later, new-ware wizard)** — unindexed-macro/component lint first
  (cheap), wizard later. [F5 · effort S then M · impact HIGH]
- **B62f · Steam Workshop publish helper** — version*100, cat/dat build, extension-whitelist, visibility
  reminder. [F6 · effort M · impact HIGH]
- **B62g · visual diff-patch sel builder** — click-node→emit-sel. [F7 · effort M · impact VERY HIGH · UI-heavy,
  Ken-screen-gated]

**Recommended default order (impact-per-effort, buildable-now-first, backend-before-UI):**
**a → d → c → b → e → f → g.** Rationale: a & d are near-mechanical high-impact wins reusing existing
carriers; c is the seasonal differentiator; b is convergent + high-value; e/f are bigger multi-file/pipeline
units; g is the highest-ceiling but UI-heavy (best when Ken can eyeball). The `jobsContentLint` house pattern
(pure lib + oracle + advisory-WARNING wiring) directly transfers to a/b/c/e.

## Sources
- content.xml won't-launch: https://steamcommunity.com/app/392160/discussions/3/2270321250032592139
- Breaking Changes wiki (F3): https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/Breaking%20Changes/
- Text-file pages registry (F2): https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/Text%20File%20Pages%20Being%20Used%20by%20Modders/
- Steam Workshop tool (F6): https://wiki.egosoft.com/X%20Rebirth%20Wiki/Modding%20support/Steam%20Workshop%20for%20X%20Rebirth%20and%20X4/
- add-a-ware file set (F5): https://gist.github.com/MattMcFarland/1282329f83f88f1b98520c5e2ec491a2 · WareGen https://www.nexusmods.com/x4foundations/mods/219
- diff sel / collections (F7): https://forum.egosoft.com/viewtopic.php?t=403538 · X4-XMLDiffAndPatch https://github.com/chemodun/X4-XMLDiffAndPatch
- X4_Customizer (bulk edits / deps): https://github.com/bvbohnen/X4_Customizer · X4CodeComplete: https://www.nexusmods.com/x4foundations/mods/1721
- index/macros coupling (F5): https://github.com/ratilicus/x4 · https://www.nexusmods.com/x4foundations/articles/78
- Custom Faction Tool: https://www.nexusmods.com/x4foundations/mods/1600 · Sector Creator: mods/1641 · X4 Editor: mods/388
