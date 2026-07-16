# UI Compiler Truth and Preview Parity Implementation Plan

> **For Agent:** Follow the Universal AI Task Workflow and the X4 Forge project adapter.

**Goal:** Replace the scaffolded visual-UI package output with one evidence-grounded X4 standalone-menu
generator shared by package and preview, and make the Canvas status reflect the existing package compiler.

**Architecture:** `generateUILuaScript()` remains the sole package emitter. It will emit the deferred
registration/open/frame lifecycle already proven by the AI Influence menu and construct fTable rows with
only APIs present in the unpacked X4 9.00 UI corpus. UIBuilder will display that exact function result.
Canvas will combine its graph-connectivity findings with the package diagnostics App already polls.

**Tech stack:** React, TypeScript, Express compile API, deterministic selftests, Playwright.

## Task record

Task: B34 UI compiler truth/parity repair
Lane: FULL

### PLAN

- Bounded unit: repair visual UI compilation and compiler-status truth; no unrelated UX/refactor work.
- Assumptions: the unpacked 9.00 corpus and the in-game-proven AI Influence menu are authoritative for
  Helper/menu lifecycle; actual in-game appearance remains a separate game gate.
- In scope: `generateUILuaScript`, its diagnostics/oracle, UIBuilder standard preview, Canvas package status,
  the beginner UI template's one-time visibility behavior, and focused/e2e coverage.
- Out of scope: a persistent non-modal HUD overlay, new widget model fields, game-directory writes, deploy,
  installer work, or broad component extraction.
- Risks and authorization boundaries: malformed Lua could break generated UI; automatic opening could be
  intrusive, so it is opt-in on the template only. No real mod/game/config write is authorized or needed.
- Rollback/checkpoint: HEAD `8050e03`; preserve pre-existing edits to BACKLOG/ROADMAP/SESSION-HANDOFF and
  untracked CODEX-ONBOARDING. Revert only B34 hunks manually if validation fails; no mutating git.
- Acceptance criteria:
  1. Packaged Lua builds/displays fTable content for all nine designer widget types using corpus-backed APIs.
  2. Lua uses lazy Helper lookup, deferred idempotent registration, `OpenMenu`, `onShowMenu`, frame display,
     a namespaced `RegisterEvent` opening path, and no known fictional UI API.
  3. `includeInBuild=false` widgets are absent and Lua strings are safely escaped.
  4. UIBuilder's Standard preview is exactly `generateUILuaScript(workspace, safeModId)`.
  5. Mod Doctor no longer reports `ui.lua_scaffold`; invalid widget size remains blocking.
  6. Canvas status uses App's actual compile diagnostics and visibly distinguishes checking/local fallback.
- Required validation: focused new selftest; `npm run typecheck`; `node scripts/oracle-sweep.mjs`;
  `npm run test:e2e`; authenticated compile API against `Player_Elite_Escort`; real rendered browser preview
  and Canvas status; confirm live workspace identity is unchanged after e2e.
- Negative/failure path: excluded widget absent; invalid size still errors; compile failure/fallback cannot
  display a false package-OK state; generated Lua contains no scaffold marker or fictional API.
- Evidence: command output in task close; browser screenshot/DOM observation; ROADMAP and SESSION-HANDOFF.

### BASELINE

- Revision/version: HEAD `8050e03`; main tracks origin/main.
- Existing changes/failures/runtime state: BACKLOG.md, ROADMAP.md, SESSION-HANDOFF.md modified and
  CODEX-ONBOARDING.md untracked before B34. Server answers on :3000 with authentication; active workspace
  is `Player_Elite_Escort` (3 nodes, 2 links, 3 UI widgets). Unauthenticated workspace GET correctly 401s.

### RECONCILE

- Resources searched: graphify graph; generator/package callers; UIBuilder preview; App compile-diagnostic
  poll; Canvas badge; Mod Doctor; Lua static analysis contract; template rail; unpacked X4 9.00 Helper/menu
  corpus; installed/source AI Influence menu.
- Existing capability reused: `generateUILuaScript`, `/api/agent/compile`, App package-diagnostic polling,
  `X4_STANDALONE_MENU_SCHEMA`, Helper fTable APIs, template rail.
- Couplings checked: preview/package, active/excluded widgets, compile/doctor, template promise/open behavior,
  App diagnostics/Canvas badge.
- Capability-map delta: visual UI was previously mapped only indirectly; close must add the corrected
  compile capability and retain the in-game-certification boundary.
- Plan changes: second pass found the template's absent open path; added a namespaced event and opt-in
  template auto-open to the original parity/status scope.

### IMPLEMENT

- Replaced scaffolded Lua with a full shared standalone-menu emitter covering all nine widget types.
- Added namespaced open event, early-open retry, and template-only one-shot auto-open.
- UIBuilder Standard preview/copy now use the package emitter; removed the duplicate template emitter.
- Retired `ui.lua_scaffold`; renamed template copy from HUD to Standalone Menu.
- Wired App package diagnostics through Canvas; added pure status summarizer so checking/offline are amber.
- Added `ui-compiler-selftest` to the runtime registry and oracle sweep.

### VALIDATE

- `npm run typecheck` -> PASS (final run).
- `GET /api/agent/ui-compiler-selftest` -> 11/11.
- `node scripts/oracle-sweep.mjs` -> 77/77 via runtime index.
- `npm run test:e2e` -> 12/12, verdict PASS.
- `npm run build` -> PASS; known >500KB chunk warning remains.
- Authenticated `/api/agent/compile`, `Player_Elite_Escort` -> 5 files, 4,031-byte Lua, 0 errors/warnings;
  frame/display/statusbar/open-event/retry present; scaffold absent.
- Browser -> `PACKAGE: OK`; rendered Standard preview 4,031 bytes with the same markers; no console errors.
- Negative -> excluded widget absent; invalid size remains error; checking/offline never green; early open retries.
- Live workspace after e2e -> unchanged `Player_Elite_Escort`, 3 nodes / 2 links / 3 widgets.

### REVIEW

- Requirement -> done/evidenced: shared emitter, real API construction, preview parity, diagnostic truth,
  negative paths, full gates, browser-visible proof.
- Partial: X4 in-game menu appearance and button event remain untested; player-visible experience cannot be
  inferred from static/corpus evidence.
- Fresh-eyes correction: the first event could arrive before Helper; added and revalidated queued retry.
- Deferred/out of scope: persistent non-modal HUD overlay semantics and real-mod deployment.

### CLOSE

- Status: PARTIAL — Forge-side implementation verified; scratch in-game EXPERIENCE gate remains.
- Suggested commit title: `B34: make visual UI compile match preview and package diagnostics`

### AAR

- Triggered: prior review recommendation initially missed the existing App package-diagnostic poll; second
  pass corrected the plan before implementation.
- Sustain: require explicit source/runtime reproduction before converting review findings into work.
- Improve work/approach: trace consumers before proposing new validation infrastructure.
- Improve tools: graphify's natural-language start-node match was weak for this path; direct symbol/caller
  inspection remained necessary.
- Highest-risk evidenced weakness: product previews and template copy can outrun packaged behavior when
  they are generated independently; bounded fix is a single shared emitter plus parity tests.
- Global/project lessons banked: project AAR + capability-map delta on 2026-07-14.
