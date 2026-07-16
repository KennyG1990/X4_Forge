# X4 Forge Product-Loop Consolidation Design

**Status:** SPECIFIED  
**Decision basis:** user-approved recommendation set, reconciled against ADR-F1/F2/F3, the current capability map, the live browser, and HEAD/worktree state on 2026-07-14.

**Adjacent-defect authorization (2026-07-14):** the user authorized repair of evidenced defects discovered outside a slice's initial boundary. Before expanding a slice, record the reproduced defect, why it is necessary or materially valuable, changed acceptance criteria, rollback, and validation. This authorization does not override standing gates for real-mod/game-directory/config writes, spending, deletion, credentials, publishing, or git mutations.

## Product outcome

Forge should take a newcomer from an idea to machine-backed in-game proof without making an expert give up raw XML, the complete schema vocabulary, advanced editors, or the agent API. The program is complete only when the rendered application makes that path coherent and the applicable deterministic, browser, packaging, and game gates prove it.

## Chosen approach

Use staged vertical slices over shared product seams.

Rejected alternatives:

1. **Big-bang shell rewrite.** It would create a second navigation architecture before the existing product loops are unified and would collide with the current dirty B34 files.
2. **Readiness-first UI rewrite.** It would place more UI around an editor whose primary NODES sidebar still mounts the complete 1,478-element schema vocabulary.

The staged approach keeps each close independently useful and reversible while preserving the full objective.

## Shared seams

### Catalog seam

One pure catalog/ranking model owns node search, curated ranking, aliases, recents, and favorites. The sidebar and canvas quick-add consume it. The rendered list is windowed, so the complete XSD vocabulary remains available without mounting every row.

### Readiness seam

One deterministic evidence model represents:

`graph valid -> package valid -> deployed -> seen in game -> experience confirmed`

Each stage records state, detail, timestamp/freshness, and a navigation target. Existing compiler diagnostics, deploy metadata, watcher verdicts, and experience confirmations are inputs; UI components do not infer success independently.

### Mutation seam

AI changes target an explicit node, branch, diagnostic, file, or XML region. The proposal contains structured operations and a human-readable diff. Existing deterministic review, undo checkpoint, and content-addressed workspace synchronization remain mandatory. Whole-workspace replacement remains available only for explicit full-workspace generation.

## Recommendation-by-recommendation design

### 1. UI compilation truth

B34 supplies the shared Lua emitter and honest package badge. Finish it with an exact preview/package parity e2e test using a shared mod-id derivation helper, then run the scratch in-game menu interaction. A player-visible menu is not VERIFIED until X4 renders it and its button event is observed.

### 2. Readiness ladder

Extract a pure readiness reducer and a compact clickable ladder. Canvas, guided rail, Diagnose, and Playtest show the same stage values. Clicking a failed or incomplete stage opens its owning surface and evidence. Stale and unavailable evidence never renders green.

### 3. Beginner and Expert workspaces

Beginner mode exposes: choose an idea, customize, validate, deploy, confirm in game. It uses the same workspace and compilers as Expert mode. Expert mode preserves all current tabs and direct editors. The switch is reversible and does not mutate project content.

### 4. Searchable virtualized node catalog

Default to the measured census top-52 plus built-in structural/custom nodes. Search spans the full vocabulary and understands a bounded intent-alias registry. Favorites and recent nodes are local UI preferences. Both curated and full results are windowed; DOM size is bounded independently of schema size.

### 5. Playtest as the primary loop

Consolidate existing deploy-verify, watcher brief, cue liveness, FORGE-WATCH, FORGE-STATE, source navigation, and evidence artifact into one `Deploy and prove` flow. The flow deploys the current workspace as-is only after an exact game-write confirmation. Validation uses a purpose-built scratch workspace; Forge must not silently clone/rename an arbitrary mod as a "scratch extension", because changing only the extension id does not namespace its internal ware, macro, patch, cue, or script identifiers and can collide with the installed original. The flow advances readiness only from server/game evidence and ends with an exportable proof artifact.

### 6. Selection-scoped AI modification

Add an `EditTarget` contract and structured patch operations. Node, branch, diagnostic, and XML-region entry points open Builder with that target. Review shows only affected resources, deterministic verdicts, and the resulting graph/XML diff. Apply records an undo checkpoint and uses existing CAS synchronization.

### 7. Installable packaging

Keep B8/B23 gated by ADR-F2. Unpark only after a real first-success run records TTFM-in-app at or below 15 minutes. The decision package compares Electron and the existing static/server bundle, then validates installation on a clean non-dev path.

### 8. Refactoring

No broad cleanup project. Each slice extracts only the catalog, readiness, playtest orchestration, or mutation service needed for its user-visible milestone. Monolith line-count reduction is evidence of seam extraction, not the acceptance criterion.

## Error and safety behavior

- Missing schema: curated built-ins remain usable; full vocabulary reports unavailable.
- Corrupt local preferences: ignore and reset only the affected preference key.
- Offline compiler/watcher: readiness reports unavailable/stale, never success.
- Deploy or game writes: retain the repository write gate and explicit user approval.
- AI proposal conflict: CAS conflict card wins; no silent overwrite.
- Packaging gate unmet: show the measured missing prerequisite rather than an enabled installer action.

## Verification strategy

Every slice runs its focused selftest plus typecheck, runtime oracle sweep, full e2e, and rendered browser inspection. Build-surface changes also run the production build. Game-visible behavior remains PARTIAL until the applicable X4 interaction is observed. The active workspace identity is checked after automation.
