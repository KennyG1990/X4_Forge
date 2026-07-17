# B59b · Galaxy-tab reconcile → jobs SKU — RECONCILE + DECISION 2026-07-17

Lane: FULL (reconcile-first per the B59 menu; Ken's B58 lesson: no feature promised before the
reconcile lands). Goal-driven (a→b→c→d).

## Reconcile (verified 2026-07-17 — outcome was genuinely unknown going in)
The GALAXY top tab is a **read-only merged-map VIEWER**, not an editor:
- `src/components/GalaxyMapView.tsx` header: "#64 Phase 1 UI: read-only galaxy/sector map bound to
  /api/agent/galaxy-map. This is a viewer for already-authored game data, **not the deferred
  sector editor**." UI copy: "Phase 2 editing remains **deferred**."
- `src/lib/galaxyMap.ts`: `buildGalaxyMap` + `buildMergedGalaxyMap(base + extensionSources)` read
  galaxy.xml/clusters.xml from cat/dat, apply extension galaxy diffs + cluster macro files, and
  flatten clusters/sectors with absolute positions. `GET /api/agent/galaxy-map` serves the merged
  map (base + installed extensions). `runGalaxyMapSelftest` covers it.
- So: seeing what an overhaul does to the galaxy EXISTS; authoring sectors does NOT (#64 P2 deferred).

## Decision (the SKU)
- **Sector authoring: DEFER.** It is #64 Phase 2 — a large, high-blast-radius subsystem (authoring
  galaxy/cluster/sector macro XML + region_definitions + placement). NOT a bounded starter; if
  pursued it needs its own multi-session spec. Do not force it into a B59 quick unit.
- **Jobs-variant starter: BUILD (shipped).** The tractable half of "sector/jobs" and the real
  overhaul-XML-layer demand (research round-2 F1). `custom_patrol_job` beyond-canvas template:
  a `<diff>`-add of a corpus-grounded `<job>` (vanilla patrol order + `class="galaxy"` location +
  military ship select — all verified in libraries/jobs.xml, 606 jobs / 540 galaxy-class) + the
  t-file entry its name references. jobs has no content XSD (B46P2) so the routed `<diff>` wrapper
  is what validates — same guarantee as any diff starter; content grounded by copying real vanilla.

## Acceptance (met)
- Templates oracle **36/36** (the new starter compiles 0 errors through the real pipeline).
- Emitted files validated LIVE: `libraries/jobs.xml → diff/diff`, `t/0001-l044.xml → tfile/plain`,
  **0 errors / 0 warnings**.
- tsc 0 · lint 0 errors · precommit OK · sweep 87/90 · e2e (pending in this unit's gates).
- Capability-map delta: NO new engine — reused the beyond-canvas template family (B19s2b/B58d);
  the reconcile FINDING (Galaxy = viewer, sector-edit deferred) is the durable capability note.

## Risks & boundaries
- Cry-wolf N/A (a template, not a validator). The jobs content isn't schema-checked (no XSD) —
  mitigated by grounding on real vanilla + the routed diff-wrapper validation; the rail hint tells
  the modder exactly what to tweak.
- Out of scope: sector authoring (deferred, above); job-content schema validation (no XSD exists).
- Rollback: single-commit revert; additive template only.
