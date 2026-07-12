# Vision v2 — "The UE5 Editor for X4" (2026-07-11)

> **Status: plan, ratified direction.** Ken posed the design brief ("a mod studio like the Unreal 5
> editor: lowest possible barrier to entry, intuitive, powerful, hand-holding, takes nothing from
> veterans") and ratified the agent's independent answer in full (2026-07-11 session). This doc is
> the reconciled way forward. Direction decision recorded as **ADR-F2**
> (`F:\StarForge\wiki\x4-forge\decisions.md`). Open work items live in BACKLOG.md (B18–B24);
> this doc holds the detail and the sequencing rationale.
> **Nothing here overrides the per-task workflow** — every item below ships through
> PLAN → RECONCILE → DOCUMENT → IMPLEMENT → VALIDATE → REVIEW → DOCUMENT → AAR, with cited
> validation and EXPERIENCE gates where a human reads/sees/feels the surface.

## The one metric

**TTFM — Time To First Mod.** From "stranger sits down at the Forge" to "an effect THEY chose is
visibly running in THEIR game." Two scopes:

- **TTFM-in-app** (post-install → in-game effect): target **≤ 15 minutes** for a newcomer following
  only on-screen guidance. This is the metric Phases 1–2 attack.
- **TTFM-total** (download → in-game effect): meaningful only once B8 (installer) unparks; target
  **≤ 30 minutes**.

Today neither number is measured; TTFM-in-app is probably hours for a true stranger (five manual
config paths, blank-page canvas after the starter picker, no deploy guidance). Every Vision-v2
close cites the current TTFM number once B20 lands — the metric is the progress bar.

## Assessment: what the vision needs vs what exists (reconciled 2026-07-11)

| Vision pillar | State | Evidence |
|---|---|---|
| Game data as ground truth (XSDs, scriptproperties, corpus) | ✅ BUILT — the foundation | validation engine, ~35 oracles |
| Visual layer that never lies to veterans (fidelity round-trip, raw XML escape hatch) | ✅ BUILT (expensively) | fidelity-first compiler, passthrough, ADR digest |
| Play-In-Editor loop (deploy→telemetry→canvas badges) | ✅ BUILT (edit half) | Preflight&Deploy, debug-watcher, FORGE-WATCH |
| Errors that teach + one-click fixes | ✅ BUILT | quick-fix engine (incl. graph mutations) |
| Veteran floor (lossless import, CLI, agent API) | ✅ BUILT | agent API, validate:mod CLI |
| Intent-first entry (templates/recipes) | ◐ PARTIAL — **exists, underpowered**: `modTemplates.ts` (selftest-backed canvas starters), `modRecipes.ts` (3 Q&A wizards), `CanvasOnboarding.tsx` picker. No deploy rail after load, no in-game-verified stamp, MD-canvas-only | reconcile 2026-07-11 |
| First-run setup | ❌ MISSING — five manual paths, placeholders only (`DirectorySettingsModal`), no game autodetect. But cat/dat **schema harvesting already exists** (`getAiSchemaIndex`) — the hard part is built | reconcile 2026-07-11 |
| Editor-is-the-docs depth | ◐ 5% FUNDED — engines built (explain/semantics/simulate/critic, wiki browser); ~40/785 actions curated (B10) | ROADMAP |
| In-product pattern browser (proven recipes, stampable) | ❌ MISSING in product — knowledge exists OUTSIDE (x4-reference-mods skill, DeadAir canon) | reconcile |
| Multi-project | ❌ singleton (B2 slice 3 spec'd; B12 rides it) | BACKLOG |
| Installer a non-dev can run | ❌ PARKED (B8, Ken's call) | BACKLOG |
| Live game-state inspection (world-outliner analog) | ❌ MISSING — debug-watcher reads errors/log only; neural-link bridge proves game→HTTP is possible but is a SEPARATE project | reconcile |
| TTFM measurement | ❌ MISSING | — |

## Phases

Each phase is shippable alone; each item is one BACKLOG entry with its own acceptance.
Ordering rationale: **first-success beats depth** (a newcomer who ships in 15 minutes forgives
missing docs; one who can't get paths configured never sees the docs), and the installer (biggest
single barrier) is Ken-gated — so Phase 1 builds the evidence that makes the B8 unpark decision
easy, instead of blocking on it.

### Phase 0 — Close the decks (now; not Vision-v2 work, just honesty)
B13 eyeball flip + Ken's commit · B17 e2e gate hygiene · audit #6 measure-first perf.
The vision must not crowd out closes-in-flight (task-selection rule).

### Phase 1 — The First Five Minutes (TTFM-in-app ≤ 15 min)
- **B18 · First-run setup wizard + game autodetect.** Detect the X4 install (Steam registry key +
  `libraryfolders.vdf` walk; GOG paths secondary), propose ALL five config paths from it,
  auto-harvest XSDs via the EXISTING cat/dat harvest machinery, create the workspace folder.
  One screen, one confirm; manual override always visible (veteran floor).
  *Acceptance:* fresh boot with no config.json reaches a working, validated canvas in < 2 min
  without typing a single path; degrades honestly when no install found.
- **B19 · Template → in-game guided rail** (absorbs audit #7 "Ship a Mod journey"). After a
  template/recipe loads, a dismissible 3-step rail: ① "this is your mod — here's the node to
  tweak" (template-declared highlight), ② Preflight & Deploy (existing one-button chain, checklist
  inline), ③ "reload your save / start a game — watch this badge" (debug-watcher confirmation
  surfaced in the rail). Templates gain an **in-game-verified stamp** — each shipped template is
  proven once by us with EXECUTION-gate evidence (game-emitted debuglog/logbook), recorded in the
  template registry, re-verified when the template changes. Template set grows beyond MD-canvas:
  price-tweak (XML patch), t-file text mod, HUD button — each an intent a newcomer actually has.
  *Acceptance:* a tester who is not Ken ships the welcome-message template to a running game
  following ONLY on-screen guidance; EXPERIENCE gate = that tester's (or Ken's) screen, not ours.
- **B20 · TTFM instrumentation (local-only, no network).** Timestamps at funnel stages: first
  boot → paths configured → first template loaded → first green validate → first deploy → first
  debug-watcher confirmation. Local funnel report surface; numbers cited in every Vision-v2 close.
  *Acceptance:* funnel report renders after a first success run; zero external transmission.

### Phase 2 — The editor IS the documentation
- **B21 · Action-frequency census (measure first, then curate).** Rank all 785 MD actions by
  real-world frequency: vanilla md/ corpus + unpacked DLC + available shipped mods. Output = the
  curation priority list + coverage math ("top N actions = X% of observed usage"). House-pattern
  engine + oracle.
- **B10 (re-scoped by B21, stays its own item).** Curate top-N by census until coverage ≥ ~90% of
  observed usage — plain-language meaning, valid-value hints, one corpus-grounded example each.
  Milestone-sliced (e.g. N=75, N=150), each slice validated by the explain/simulate oracles.
- **B22 · Pattern browser (the DeadAir knowledge moves INTO the product).** Browsable, searchable
  proven patterns (kill-event capture, faction orders, economy reads, war/relations…) as validated
  workspace fragments, stamped onto the canvas via the EXISTING quick-fix graph-mutation ops
  (add_node/add_link). Every pattern carries provenance (which shipping mod/vanilla file proves it).
  *Acceptance:* browse → stamp → validate 0 errors → deployable; provenance link renders.

### Phase 3 — Studio-grade shell
- **B2 slice 3** (already spec'd — per-mod server state; e2e workspace-guard removal is the proof)
  → then **B12** multi-project tabs.
- **B23 · Installer track re-open (KEN GATE — evidence, then his call).** When Phase 1 lands and
  TTFM-in-app is measured ≤ 15 min, present B8 unpark with the funnel numbers: the installer is
  then the LAST barrier, not one of six. Electron vs single-binary gets its own ADR at unpark.
  Until then B8 stays parked; nothing in Phases 1–2 depends on it.

### Phase 4 — Live-game depth (the PIE inspection half)
- **B24 · Live game-state inspector — SPIKE FIRST (output = ADR, not code).** Evaluate data paths
  for a world-outliner analog (factions, ships, running cues, variables): (a) debuglog-protocol
  extensions (FORGE-WATCH style, zero game-side deps), (b) an optional Forge-companion helper mod
  the user opts into, (c) lessons (NOT code) from the neural-link bridge — that project stays
  separate. Constraints: optional, read-only by default, zero impact when absent.
  Trigger-cue-from-editor and any write path = write-gated, later slices, own ADRs.

### Cross-cutting invariants (every phase)
1. **Veteran floor:** no feature may make the visual path mandatory; raw XML + agent API remain
   first-class; fidelity guarantees never weaken. (Extends the determinism doctrine.)
2. **Determinism doctrine unchanged:** AI stays opt-in drafting; validators decide legality.
3. **EXPERIENCE gates:** onboarding surfaces are judged on a human's screen — ideally a human who
   is NOT the person who built them.
4. **Measure before optimizing** applies to content too: B21 before B10 spend.

## Risks / honest notes
- **Content grind risk (B10/B22):** curation is a marathon; milestone slices + census-driven
  ordering keep each unit closable. Do not let it become an unclosable mega-task.
- **Stranger-testing:** true TTFM needs a tester who isn't Ken or an agent; Ken recruits when B19
  is ready. Until then Ken-as-newcomer is the proxy (imperfect, stated honestly in closes).
- **B24 scope creep:** the inspector can eat quarters. The spike-then-ADR structure is the fence.
- **Sequencing pressure:** bridge-verifiable work (B20/B21) is easier to close than EXPERIENCE
  work (B19). The task-selection rule applies — B19 is the keystone; don't let the easy items
  crowd it out.
