# B37 — Beginner and Expert workspace shell

The full program and slice order were documented before implementation in
`2026-07-14-product-loop-next-level-implementation.md`. This record captures B37's reconciled execution.

## PLAN

- **Lane:** FULL.
- **Bounded unit:** add a persistent Beginner/Expert experience preference. Beginner exposes one five-step
  shipping path — Choose idea → Customize → Validate → Deploy → Confirm in game — over the existing editors,
  readiness evidence, and compile confirmation flow. Expert preserves the current studio.
- **Assumptions/unresolved:** Beginner is the default when no valid preference exists; switching modes is a
  presentation change only and must not replace the workspace, selected node/widget, undo state, or parked
  workspaces. A user-confirmed game experience remains gated by the existing readiness model.
- **In scope:** pure mode/step/routing helpers, an accessible Beginner left rail, contextual property inspector,
  readiness evidence, safe compile-modal entry, exact-deploy confirmation, obvious reversible mode switch,
  hiding expert navigation and raw XML/code surfaces in Beginner, selftest and e2e.
- **Out of scope:** duplicating any editor/compiler/validator/deploy implementation; direct game/config/mod writes;
  redesigning the first-run wizard, templates, or readiness ladder; B38 orchestration; AI changes; packaging; Git.
- **Risks/authorization:** false-green validation and destructive mode switches are primary risks. The user
  authorized disposable workspace changes for validation; e2e uses the isolated server. No real deploy is run.
- **Rollback/checkpoint:** HEAD `8050e03` plus the captured mixed B34-B36 dirty tree. Remove the two B37 source
  files and App adapter; the preference is a single fail-soft localStorage key and needs no migration.
- **Acceptance:** invalid/absent preference falls back to Beginner; Beginner renders exactly five task steps,
  hides expert view tabs/sidebar/raw code, reuses the real center editor, routes Customize to the workspace's
  populated domain, exposes selected node/widget properties, shows blocking/unavailable readiness honestly,
  opens the existing compile confirmation rather than writing directly, permits experience confirmation only
  under the existing exact-deploy gate, and preserves workspace plus selection through both mode switches.
- **Required validation:** typecheck; focused mode selftest; oracle sweep; focused and full e2e; live rendered
  browser interaction at desktop and 1280 widths; production build; precommit; graph refresh; live workspace
  identity check. Negative paths: corrupt preference, package error/offline, no current deploy, and switch round-trip.
- **Evidence:** selftest output, Playwright report, browser screenshot/DOM measurements, ROADMAP/handoff/AAR.

## BASELINE

- **Revision:** `8050e03`; B34-B36 and documentation changes are uncommitted and preserved.
- **Runtime:** `:3000/:3001` live; `Player_Elite_Escort` has 3 nodes, 2 links, and 3 widgets.
- **Existing state:** App owns workspace view, Sidebar, selections, readiness, compile modal, and raw CodePreview.
  Sidebar owns the extracted PropertiesInspector. Templates, diagnostics, deploy metadata, watcher evidence, and
  experience confirmation already exist. There is no experience preference or task-focused shell.

## RECONCILE

- **Resources/readers/writers:** App view and selection state; Sidebar and PropertiesInspector; Canvas onboarding;
  all domain editors; ReadinessLadder/readiness model; compile confirmation; localStorage conventions; e2e fixtures;
  capability map and ADRs.
- **Existing capability reused:** every authoring editor, template loader, property editor, deterministic validator,
  readiness source, compile confirmation, and experience confirmation. B37 adds navigation/composition only.
- **Couplings:** Beginner step ↔ App workspace view; selected object ↔ PropertiesInspector; readiness status ↔
  Validate/Deploy/Confirm affordances; preference ↔ first render; mode switch ↔ unchanged workspace/selection.
- **Presence/absence:** hiding only top tabs would not provide a coherent task loop, while a separate Beginner page
  would duplicate editors and break continuity. A mode-filtered shell over the same App state is the bounded seam.
- **Capability-map delta:** pending close.
- **Plan change:** none; the program's shell approach is retained and made concrete as a presentation-only adapter.

## IMPLEMENT

- Added `experienceMode.ts`: fail-soft Beginner/Expert preference, fixed five-step vocabulary, domain-aware
  editor routing, workspace-content detection, validation-status aggregation, and 12-check selftest.
- Added `BeginnerWorkspace`: one task rail over the real canvas/domain editors, extracted property inspector,
  shared B36 evidence, guarded compile wizard, and exact-deploy experience confirmation.
- App now keeps one workspace/selection model across modes. Beginner hides full view tabs, raw CodePreview,
  Global Search, Sync/Git, AI engine, Agent API, and floating AI; Expert retains all existing surfaces.
- The readiness ladder routes to the visible Beginner task instead of hidden Expert tabs. Required validation
  failures/offline/checking disable Beginner deploy; the existing compile wizard remains the only deploy entry.
- Moved the mode switch into the readiness row after a live 1280px drill proved the header overflowed. Reduced
  compact-width utility gaps to keep the pre-existing B29 header invariant without changing wide layout.
- Playwright defaults legacy/full-studio specs to Expert; the focused B37 spec explicitly proves absent/corrupt
  preference falls back to Beginner.

## VALIDATE

- `npm run typecheck` -> PASS after correcting four selftest fixtures to the actual domain types.
- experience-mode selftest -> PASS 12/12; `node scripts/oracle-sweep.mjs` -> PASS 80/80 via runtime index.
- Focused e2e -> PASS 3/3. Earlier runs caught a startup-health overlay fixture, an ambiguous Cancel locator,
  and the initially misplaced advanced-action condition; all were corrected and the final run is green.
- Full `npm run test:e2e` -> PASS 19/19 twice after final changes; wrapper verdict PASS, zero failed/flaky.
- Live in-app browser -> behavioral/geometry PASS on `Player_Elite_Escort`: exactly five steps; Validate shows
  current Graph/Package evidence; selected-node inspector survives Beginner→Expert→Beginner; no Expert tabs,
  Sidebar, raw code, Sync/Git, Agent API, or no-op AI in Beginner; Expert restores them; zero console errors.
  At 1280×800, both header and readiness row finish `clientWidth=scrollWidth=1280`; Beginner editor is 320px
  rail + 956px real editor. Initial Expert measurement reproduced 1455/1280 overflow, then 1324/1280 after
  moving the switch; compact utility spacing closed it to 1280/1280.
- Browser screenshot artifact -> UNAVAILABLE: the in-app browser's `Page.captureScreenshot` timed out four times
  across two sessions, including bounded 1280×800 and 400×300 captures. The fresh session's DOM snapshot remained
  responsive, measured 778×856 with no document overflow, and reported zero console errors; the tiny crop failed
  identically, ruling out image size and isolating the failure to the in-app tab's screenshot channel. The only
  connected browser is the in-app browser, and Windows visual automation is prohibited for Codex's own UI. Per the
  project adapter, DOM/geometry remains weaker than screenshot proof, so this gate is not upgraded.
- `npm run build` -> PASS (1,797 modules; existing >500 kB chunk warning only).
- `npm run precommit:check` and `git diff --check` -> PASS.
- `graphify update .` -> PASS: 1,579 nodes / 3,670 edges / 84 communities.
- Authenticated live workspace after isolated e2e -> unchanged `Player_Elite_Escort`, 3 nodes / 2 links /
  3 widgets, hash `dac6d106bd45f2bd`.
- Automated `reviewctl` -> UNAVAILABLE: the skill's documented tool path is absent, it is not on PATH, and this
  repo has no `.reviewctl` rules. Manual fresh-eyes review plus project-native gates were used; no substitute
  scanner result is claimed.

## REVIEW

- Preference/default, five-step shell, domain routing, real editor reuse, selected property editing -> done/evidenced.
- Expert/raw/advanced surface isolation -> done/evidenced after second pass removed three leaked header controls
  and the no-op AI action.
- Blocking/unavailable validation and no-false-success deploy/confirmation -> done/evidenced.
- Workspace and selection preservation -> done/evidenced; live workspace identity unchanged.
- Fresh-eyes corrections: readiness clicks originally targeted hidden Expert tabs in Beginner; advanced header
  controls leaked; AI action was wired to a no-op; the mode switch reopened B29 header overflow. All corrected.
- Partial evidence: no live screenshot image could be captured. No real deploy/game/config/mod/Git action ran.

## CLOSE

- **Status:** PARTIAL — implementation and behavior pass; required real-host screenshot artifact unavailable.
- **Capability-map delta:** Beginner/Expert shell is a new capability, but the canonical map is outside the named
  workspace and was not written without the separate external-write authorization.
- **Remaining risk:** screenshot transport failure prevents the adapter's strongest visual evidence artifact.
- **Suggested commit:** `B37: add beginner and expert workspace modes`.

## AAR

- **Triggers:** initial typecheck failure; authenticated-probe misuse; focused e2e fixture/selector/condition
  failures; reviewctl path drift; live screenshot failure; live review forced a responsive-header repair.
- **Sustain:** one presentation adapter over the existing editors/readiness/deploy contracts kept behavior unified;
  live width measurement caught what headless behavior tests could not.
- **Improve work/approach:** inspect every reused component's advanced actions before passing a no-op callback;
  responsive header budgets must be measured immediately when adding any persistent control.
- **Improve tools:** the in-app screenshot transport fails independently of capture size and needs upstream
  maintenance; stale devgov skill paths also remain an upstream issue.
- **Highest-risk evidenced weakness:** the dense Expert header regressed with one new 115px control; without the
  real 1280 drill, critical controls would clip again. The switch now lives in readiness and header compact gaps
  are measured clean.
- **Lessons banked:** recorded here and in `SESSION-HANDOFF.md`; external StarForge AAR/capability ledgers were
  not written because this task authorized in-workspace changes, not external canon writes.
