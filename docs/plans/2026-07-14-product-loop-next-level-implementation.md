# X4 Forge Product-Loop Consolidation Implementation Plan

> **For Agent:** follow `UNIVERSAL_AI_TASK_WORKFLOW.md` independently for every slice. Do not treat this program plan as proof that a slice is complete.

> **Scope expansion:** Ken authorized adjacent defect repair during this program. Reproduce and document the defect before changing the active slice; update its acceptance contract first. External side effects and git operations retain their project-policy gates.

**Goal:** Make Forge's default product loop coherent from idea through in-game proof while retaining the complete expert surface.

**Architecture:** Build three shared seams—catalog, readiness, and targeted mutation—then make existing surfaces consume them. Execute as bounded slices so each user-visible improvement has its own acceptance contract and rollback.

**Tech stack:** React 19, TypeScript, Express, Playwright, existing runtime selftest registry, X4 debug-log/deploy infrastructure.

## Program order and dependency map

1. B34 certification and exact parity rider.
2. B35 node catalog and virtualized toolbox.
3. B36 readiness evidence model and clickable ladder.
4. B37 Beginner/Expert workspace shell.
5. B38 Playtest `Deploy and prove` consolidation.
6. B39 selection-scoped AI modification.
7. B40 installer unpark decision and packaged-install implementation, only after ADR-F2's TTFM gate.

Refactoring is performed inside the owning slice, never as a separate broad rewrite.

## Slice 1: B34 certification and exact parity rider

**Files:**

- Modify `src/lib/workspaceIdentity.ts` or the existing authoritative identity helper.
- Modify `src/components/UIBuilder.tsx`.
- Modify the package manifest builder in `server.ts`/`src/lib/modCompiler.ts` only where reconciliation identifies the authoritative route.
- Add `tests/e2e/ui-compiler-parity.spec.ts`.

**Steps:**

1. Reconcile every caller deriving the UI mod id; select one existing helper or extract one pure helper.
2. Add a focused failing test proving UIBuilder preview text and the packaged `ui/<id>.lua` text differ for an imported/name-edge fixture if they currently do.
3. Make preview and package call the same identity helper and emitter.
4. Add e2e proof that the rendered preview and compile API Lua are byte-for-byte equal for the same workspace.
5. Run typecheck, UI compiler selftest, oracle sweep, full e2e, live browser comparison, and production build.
6. With explicit game-write approval, deploy only the scratch Standalone Menu; verify render, button event, and clean debug log.

**Close condition:** VERIFIED only after the X4 experience gate. Otherwise retain PARTIAL with the exact missing evidence.

## Slice 2: B35 searchable virtualized node catalog

**Close:** VERIFIED 2026-07-14. See `2026-07-14-node-toolbox.md` and ROADMAP B35.

**Files:**

- Create `src/lib/nodeToolbox.ts`.
- Create `src/components/VirtualizedNodeToolbox.tsx`.
- Modify `src/components/Sidebar.tsx`.
- Modify `src/components/Canvas.tsx` to consume the shared catalog in a follow-up within the same slice if no behavior regression is introduced.
- Modify `server.ts` to register the focused selftest.
- Add `tests/e2e/node-toolbox.spec.ts`.

**Steps:**

1. Add a pure catalog function accepting templates, type filter, query, mode, favorites, and recents.
2. Encode the measured 2026-07-14 census top-52 ordering and bounded intent aliases. Exclude the eight semantics-confirmed non-standalone child tags (`param`, `text`, `owner`, `position`, `rotation`, `safepos`, `match`, `replace`) from Curated mode while retaining them in All/search.
3. Add pure tests for ranking, aliases, favorites, recents, type filters, no-result behavior, and corrupt preference degradation.
4. Build a fixed-row windowed list with overscan and a bounded mounted-row count.
5. Add search, Curated/All mode, favorite controls, and recent-node tracking to the NODES sidebar.
6. Reuse the catalog ranking/search in Canvas quick-add without changing its port-compatibility filter.
7. Add e2e assertions that 1,478 loaded schema entries produce a bounded DOM, intent search finds the expected node, All mode remains bounded, and a selected node still inserts correctly.
8. Run typecheck, focused selftest, oracle sweep, full e2e, browser DOM-count and interaction checks, production build if bundle behavior changes, and verify the active workspace is unchanged except for explicitly reverted fixture edits.

**Negative path:** empty results, malformed local preference JSON, missing schema, a structural child leaking into Curated mode, and a full-list scroll to the last item must not crash or present false availability.

**Rollback:** remove the new component/helper and restore Sidebar's prior list block; no workspace/schema migration exists.

**Suggested commit:** `B35: replace eager schema toolbox with ranked virtualized catalog`

## Slice 3: B36 readiness evidence model and ladder

**Close:** VERIFIED 2026-07-14. See `2026-07-14-readiness-ladder.md` and ROADMAP B36.

**Files:**

- Create `src/lib/readiness.ts`.
- Create `src/components/ReadinessLadder.tsx`.
- Modify `src/App.tsx`, `src/components/Canvas.tsx`, `src/components/GuidedRail.tsx`, `src/components/DiagnosticsCenter.tsx`, and `src/components/PlaytestWorkspace.tsx` only at their readiness adapters.
- Add focused selftest and `tests/e2e/readiness-ladder.spec.ts`.

**Steps:**

1. Define the five stages and evidence/freshness contract.
2. Adapt existing compile diagnostics, deploy metadata, watcher verdict, and experience confirmation without re-deriving them in components.
3. Render one clickable ladder with truthful unavailable/stale/fail/pass states.
4. Route each stage to its owning surface and exact evidence.
5. Delete or demote contradictory status derivations after parity tests prove the new model.
6. Validate negative states first: offline compiler, stale log, no deploy, loaded with errors, and unconfirmed experience.

**Close condition:** every surface shows identical stage states for the same evidence fixture; browser interactions reach the correct owning surface.

## Slice 4: B37 Beginner and Expert workspace shell

**Files:**

- Create `src/lib/experienceMode.ts` and `src/components/BeginnerWorkspace.tsx`.
- Modify `src/App.tsx` and the top-level navigation/sidebar routing.
- Add focused selftest and `tests/e2e/experience-mode.spec.ts`.

**Steps:**

1. Define a UI-only `beginner | expert` preference with safe fallback.
2. Build Beginner's five-step shell over existing templates, properties, readiness, deploy, and game-confirmation surfaces.
3. Keep Expert mode's current routes and raw editors intact.
4. Add obvious reversible switching and preserve current workspace/selection across switches.
5. Verify Beginner cannot hide a blocking diagnostic or claim success from unavailable evidence.

## Slice 5: B38 Playtest `Deploy and prove`

**Files:**

- Create `src/lib/playtestProof.ts` and `src/components/DeployAndProve.tsx`.
- Modify `src/components/PlaytestWorkspace.tsx`, `src/components/GuidedRail.tsx`, and readiness adapters.
- Extend server endpoints only if the existing deploy/watcher contracts cannot supply an evidence bundle.

**Steps:**

1. Reconcile deploy-verify, watcher brief, cue liveness, FORGE-STATE, and artifact producers.
2. Define one orchestration state machine; no component-side success guesses.
3. Require an exact current-workspace/game-target confirmation before real game writes. Use a purpose-built scratch workspace for validation; do not auto-clone/rename arbitrary mods because their internal identifiers are not safely namespaced by an extension-id change.
4. Stream/refresh proof, light executed cues, expose watched values, and produce a downloadable/copyable artifact.
5. Prove timeout, stale log, partial load, runtime error, and retry paths.
6. Run a real scratch X4 loop before VERIFIED close.

## Slice 6: B39 selection-scoped AI modification

**Files:**

- Create `src/lib/editTarget.ts` and `src/lib/workspacePatch.ts` or extend the existing proposal operation model if reconciliation finds one.
- Modify `src/components/AIHelper.tsx`, contextual node/diagnostic/XML entry points, proposal review UI, and App's apply handler.
- Extend `/api/agent/generate` contract only with backward-compatible target/operation fields.

**Steps:**

1. Enumerate existing proposal/apply operations and reuse them where possible.
2. Define node, branch, diagnostic, file, and XML-range targets.
3. Require structured operations plus before/after diff for targeted mode.
4. Run deterministic validation against the proposed result.
5. Apply only after confirmation, undo checkpoint, and CAS head check.
6. Prove conflict, invalid operation, stale target, and partial-provider-response rejection.

## Slice 7: B40 packaged installer

**Gate:** do not start implementation until a real stranger/clean-profile first-success run records TTFM-in-app <=15 minutes and Ken explicitly unparks B8/B23.

**Steps after unpark:**

1. Write the Electron-versus-static-bundle ADR using measured install size, startup time, update model, and native integration needs.
2. Build one clean-machine artifact with configuration migration and uninstall/rollback behavior.
3. Validate from a non-dev folder with no Node/Vite checkout assumptions.
4. Run first-run setup, create/deploy/prove flow, upgrade, and uninstall tests.

## Program completion audit

The program is not complete until:

- The B34 UI menu is observed in X4.
- The NODES catalog remains complete while the mounted DOM is bounded.
- One readiness model drives every visible proof state.
- Beginner mode completes the idea-to-game flow without exposing expert-only surfaces.
- Expert mode retains current fidelity and APIs.
- Playtest produces a real game-backed proof artifact.
- AI performs a validated target-scoped edit with reversible CAS apply.
- The installer gate is satisfied and a clean non-dev installation passes, or the user explicitly removes that requirement from the objective.
