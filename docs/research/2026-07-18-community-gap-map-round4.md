# Round 4 · Ecosystem-tool + overhaul-mod gap map — PRE-CULLED

Researched 2026-07-18 (2 agents: incumbent-tool capability survey + overhaul-mod XML technique analysis).
**Every candidate below was pre-culled against the capability map + a corpus/code probe BEFORE listing**
(the round-3 lesson: don't present un-reconciled ideas). The two sweeps TRIANGULATED on the same gaps.

## Culled OUT (verified already-covered or falsified — do NOT rebuild)
- **Derive-diff-from-two-files** → COVERED: `src/lib/xpathSynth.ts` `synthesizePatch(vanilla, edited)` already
  synthesizes the minimal `<diff>` (applyPatch(vanilla, synth)≡edited). So the "sel builder" is partly solved too.
- **X4CodeComplete features** (completion/hover/go-to-def/refs/rename/t-file hover) → COVERED (B56/B57 IntelliSense).
- **Sector/galaxy map editor** → the deferred #64 Phase 2 keystone (known, large; not a quick unit).
- **Cat/dat PACK for release** → B62f-adjacent (publish surface, external WorkshopTool); cat/dat UNPACK exists.
- 3D assets / engine / Live Editor / font/DDS → out of scope (no model pipeline).

## SURVIVORS (verified uncovered + in-scope)

### Tier A — clean buildable-now lints (proven content-lint pattern; corpus-groundable 0-bar)
- **A1 · factions.xml relations validation** — `<relations><relation faction= relation= locked=>`. Checks:
  relation value in bounds (vanilla values are exactly **[-1,1]** — grounded), faction-id resolution (against
  reference sets), one-direction/asymmetry awareness, locked-flag awareness. UNCOVERED (existing hits are MD
  *actions* set_faction_relation, not static factions.xml validation). CLEAN — mirrors jobs/wares/tfile.
  [effort S-M · impact HIGH · both agents flagged · cry-wolf-safe: vanilla→0]
- **A2 · god.xml station-placement validation** — `<stations>` + `<location class="sector" macro=>` + `<quotas>`.
  Checks: **`matchextension="false"` presence** (the silent no-spawn gotcha), macro-reference resolution
  (against the object index), quota sanity. COMPLETELY UNCOVERED (0 code hits). New domain.
  [effort M · impact HIGH · overhaul staple · needs the object index for macro resolution]
- **A3 · loadout slot-fit validation** — cross-ref `libraries/loadouts.xml` against the ship macro's mountable
  slot counts (over-fill / connection-tag mismatch). UNCOVERED. [effort M-H · impact MED · needs slot-count
  computation from ship macros — heavier than A1/A2]

### Tier B — the big new PILLAR (highest impact, multi-unit; Ken decision)
- **B1 · Bulk parametric TRANSFORMS** — select-by-rule → multiply/set a property across every matching entity →
  emit a `<diff>` (e.g. "×1.5 damage on all weapons", "×2 all ware prices", "rescale all ship speeds",
  "bump all job counts"). This is X4_Customizer's ENTIRE domain (the most-used programmatic tool) and the
  **third pillar the adapter names (author / validate / TRANSFORM)** — the Forge has the first two, not this.
  BOTH agents' top pick. Composes with existing infra: `synthesizePatch` (emit diff), the content validators
  (verify the result), patch-readiness (survive patch day). But it's a NEW capability class: a rule engine +
  a selection/preview UI + diff emission — a multi-unit surface, not a quick lint. **Deserves its own spec +
  Ken's strategic go.** [effort HIGH (multi-unit) · impact VERY HIGH · the clearest "next big thing"]

### Tier C — analysis value-add
- **C1 · Computed balance stat tables** — compute values the raw XML doesn't hold: weapon DPS, effective range
  (=speed×lifetime), ware production cost/margin, per-ship mountable slot counts — for balancing. "Nobody's
  computing DPS." VALIDATION/analysis, not schema correctness. [effort M · impact HIGH for balance modders]
  Note: the range=speed×lifetime + DPS-bounds *sanity checks* could ride into a weapon-macro lint (adjacent to B1).

## Recommendation
Build **A1 (factions relations)** now — cleanest survivor, corpus-grounded [-1,1] bounds, proven pattern,
keeps momentum. **Spec B1 (transforms)** for Ken's decision — it's the highest-impact next direction but a
new pillar/surface deserving deliberate go, not a default. A2 (god.xml) is the strong second lint. Order:
A1 → A2 → (B1 on Ken's go) → A3/C1.

## Sources
- X4_Customizer transforms: https://github.com/bvbohnen/X4_Customizer/blob/master/Documentation.md
- VRO (weapon/ship balance diffs): https://github.com/Shuul/VRO · https://www.nexusmods.com/x4foundations/mods/305
- DeadAir god/eco: https://github.com/DeadAirRT/deadair_eco · https://www.nexusmods.com/x4foundations/mods/1078
- factions relations: Unlocked Factions https://www.nexusmods.com/x4foundations/mods/933 · Reactive Factions 406
- X4-XMLDiffAndPatch (diff format): https://github.com/chemodun/X4-XMLDiffAndPatch
- constructionplans / blueprint: https://github.com/DanielGRasmussen/x4-blueprint-builder
- X4 Editor (stat tables/slots): https://www.nexusmods.com/x4foundations/mods/388
