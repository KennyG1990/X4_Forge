# Unit 39 Specification — X4 Forge Studio Unified UI Simplification & Top-Tier IDE Workbench Consolidation

- **Status:** `VERIFIED` (Dev source, `134/134` runtime oracles, `791/791` HTTP routes, `46/46` Playwright E2E UI tests across `15` suites, rendered screenshot review across `1600x900`/`1440x900`/`800x900` & Beginner/Expert modes, and `precommit:check` verified; `0.0.94` packaged/installed `FORGE DEVELOPMENT` IDE qualification remains gated on Ken's Machine-State Ask + Write Gate)
- **Date:** 2026-11-24
- **Lane:** `FULL`
- **Author / Owner:** Forge QA Agent (per Ken's 2026-11-24 directive)
- **Baseline HEAD:** `38a9ac92a591cdd26e416dfe3dfd67cf94aeff5a` (`134/134` runtime oracles, `791/791` HTTP routes, `108` capabilities, `109` MCP tools, `50` raw filesystem writer sources)
- **Reconciled Prior Design Artifacts:**
  - Notion Hub: `X4 Forge Studio — Project Hub` (`3ad4618ed15b81408777e434a7f4a888`)
  - Notion Concept: `X4 Forge — Professional UI & Workbench Concept` (`4044618ed15b8136b859ebe830c90e2f`)
  - Notion Proposal: `UI Rework Proposal: Native IDE & Connected Mission Director` (`4124618ed15b81ed80d8d045ccfdd059`)
  - Notion Audit: `Forge UI consolidation — Full audit and specification` (`41d4618ed15b81788b44fedd99f856d8`)

---

## 1. Executive Mandate & Design Principles

Ken's directive:
> *"Build out a comprehensive UI simplification spec to bring the forge into parity with what you would expect from a top tier editor of this kind, not overly complicated UI design, but all the horse power is still under the hood right where the user wants and needs it, so don't take out any functionality, just organize and consolidate UI elements into coherent and flexible elements. Don't just change one or two or 5 things, instead systematically, methodically and critically explore all the UI elements, come up with a single unified design to implement, document it in notion, then execute the spec."*

### Five Non-Negotiable Principles
1. **Zero Removed Horsepower:** Every authoring surface, compiler flag, deterministic validator, simulation/critic/explainer engine, CAS guard, snapshot/history recovery flow, release packager, corpus picker, and Agent API/MCP control remains 100% present and reachable in fewer clicks.
2. **Spatial & Contextual Coherence (IDE-Grade Zones):** Tools live where the user's eyes already are:
   - **Top Command & Domain Frame** (compact, <76px total height instead of 180–260px of stacked banners).
   - **Left Activity Rail & Contextual Tool Dock** (palettes, project files, version control, diagnostics, runtime/release, reference).
   - **Center Authoring Stage** (consistent compact editor sub-headers across all 10 workspace views).
   - **Dedicated Right-Hand Contextual Inspector** (`ContextualInspector.tsx` — selection properties, quick fixes, inbound/outbound lineage, and pinned codex side-by-side with the canvas instead of buried below the left toolbox scroll container).
   - **Collapsible Bottom Panel + `26px` Workbench Status Bar** (`BottomWorkbenchDock.tsx` + `WorkbenchStatusBar.tsx` — live Problems/Critic, Runtime/Log tail, Compiled XML preview via `Ctrl+J`, and docked non-overlapping FPS/sync/corpus telemetry).
3. **Calm, High-Contrast IDE Typography & Visual Language:** Replace sci-fi neon glows, perpetual `animate-pulse`/`animate-spin-slow` header animations, unreadable `6.5px–8px` all-caps monospace chrome, and internal slang (`"Candy Store"`, `"Candy Itself"`, `"RADAR MINIMAP"`, `"TACTICAL LOG MONITOR"`, `"CREATE BLUEPRINT BLUEPRINT"`) with crisp `11–13px` UI sans labels, restrained neutral graphite surfaces (`#0c0f14`, `#11161f`, `#161c27`), subtle `1px` structural borders, one calm sky/cyan focus accent, and semantic emerald/amber/rose strictly reserved for real validation or runtime state. Monospace is reserved for code, XML tags, XPaths, file paths, hashes, and numeric metrics.
4. **Progressive Disclosure Over Button Walls:** Group dense button strips (`Canvas` 13+ floating controls, `UIBuilder` 88px 4-card wall, `AgentBridge` 37+ flat controls, `DirectorySettingsModal` long scroll) into clean segmented clusters, collapsible disclosures, and section-jump navigation.
5. **100% Contract, Persistence & E2E Integrity:** Preserve `StudioLayoutPreferences` lossless normalization (`WORKSPACE_NAV_ITEMS`, `SIDEBAR_NAV_ITEMS`, `GLOBAL_ACTION_IDS`), `FORGE_UI_ACTION_PARITY_CENSUS` anchors, `window.AgentRuntime`, `window.__X4_WORKSPACE_CONTEXT__`, `config/durable-writers.json` (`0` new raw `fs.*` writer calls), and Playwright E2E selector/keyboard/responsive contracts.

---

## 2. Exhaustive Critical Audit of All 62 UI Surfaces

### 2.1 Root Structural & Ergonomic Defects Found (`[REPRODUCED]` in Code & Layout Audit)

| # | Defect Category | Concrete Evidence in Current Codebase | Unified Solution |
|---|---|---|---|
| **D1** | **Vertical Chrome Compression (4–5 Stacked Top Bars)** | `App.tsx` stacks `studio-header` (`44px`) + `WorkspaceNavigationBar` (`38px`) + `ReadinessLadder` (`52–76px` full-width multi-line strip) + per-editor title bars (`48px`) + `UIBuilder` 4-card status grid (`88px`) = **220–270px** consumed before authoring space begins. | Compress top shell into a crisp `40px` Command Header + `34px` Grouped Domain Tab Bar + compact single-line `ReadinessLadder` strip (`32px`, expanding evidence inline only on click) + compact `36px` Editor Subheader inside domain views. |
| **D2** | **Broken Inspector Placement** | `Sidebar.tsx:1413` renders `<PropertiesInspector>` at the **bottom of the Left Sidebar scroll container** underneath `VirtualizedNodeToolbox` / `DirectoryExplorer` / `SourceControl` (and `activeTab === 'diagnostics'` clips it completely via `overflow-hidden`). Clicking a node on the Canvas leaves its properties off-screen or hidden. | Extract `<PropertiesInspector>` in Expert mode into a **Dedicated Right-Hand Contextual Inspector Dock** (`ContextualInspector.tsx`, collapsible/auto-opening on node/widget selection, with **Properties**, **Connections & Lineage**, and **XML Snippet** tabs) while keeping `BeginnerWorkspace` step `customize` intact. |
| **D3** | **Competing Two-Axis Taxonomy (`10 × 11` Unorganized Tabs)** | `WorkspaceNavigationBar` mixes 7 domain editors with Project overview, Galaxy map, and Wiki in one flat ungrouped row; `Sidebar` mixes MD-only palettes (`Nodes`, `Cues`, `Templates`) and Legacy-HUD-only `Widgets` with `Meta`, `Files`, `Source`, `Playtest`, `Diagnose`, `Objects`, and `AI Guide` using `6.5px` uppercase labels. | Render subtle semantic group dividers & group headers in both `WorkspaceNavigationBar` (**Logic & UI** · **Data & Patches** · **Project & Reference**) and `Sidebar` Activity Rail (**Authoring** · **Project** · **Quality & Runtime** · **Reference**), upgrade rail typography/tooltips, and add contextual domain-mismatch banners with 1-click "Switch to MD Scripts / HUD & Lua UI" actions when viewing `Nodes`/`Cues`/`Templates`/`Widgets` outside their target editor. |
| **D4** | **Canvas Floating Overlay Collision & Visual Clutter** | `Canvas.tsx` floats an 11-item wrapping top-left bar, multi-select alignment bar, `RADAR MINIMAP` (`bottom-4 left-4` with spinning compass!), `TACTICAL LOG MONITOR` (`bottom-4 right-4`), `Find in Blueprints` card, `Editor Diagnostics` card, `LIVE` card, and `GuidedRail` — while `App.tsx` floats `FpsMeter` at `fixed bottom-3 left-3` **directly colliding with the Canvas Minimap**! | Organize `Canvas` top controls into clean IDE toolbar pill groups (`Zoom/Fit` · `Script Scope` · `Find & Comment` · `Simulate & Live` · `Diagnostics & Graph Tools`), make the Minimap collapsible (with calm IDE styling, no spinning radar icon), rename `TACTICAL LOG MONITOR` -> `Simulation Output`, and dock `FpsMeter` cleanly into the new `26px` `WorkbenchStatusBar` so zero bottom-left collision can ever occur. |
| **D5** | **Limited Search (`GlobalSearch.tsx`)** | `Ctrl+K` only searches MD nodes, legacy UI widgets, and XML patches. It cannot jump to AI scripts, wares, jobs, translation entries, contracts, project files, or execute Studio commands/navigation! | Upgrade `GlobalSearch.tsx` into a dual-mode **Omni-Search & Command Palette**: unprefixed queries search all **8 Mod Entity families** (`MD Nodes`, `UI Widgets`, `XML Patches`, `AI Scripts`, `Wares`, `Jobs`, `Translations`, `Contract Endpoints`, `Mod Files`) preserving exact `Matched Search Targets (N)` count semantics, plus secondary quick-jump views/wiki matches; `>` prefix or `Ctrl+Shift+P` activates full **Command Palette** across all 10 views, 11 tools, 12 global actions, and dock toggles. |
| **D6** | **Buried Lifelines & Settings/Agent Sprawl** | `ReleaseCenter` is hidden inside `Sidebar -> Playtest`; `SnapshotManager` is only at the bottom of `Sidebar -> Meta`; `Studio Settings` is a single long scroll (`798` lines); `AgentBridge` (`1,990` lines, 37+ buttons) dumps sync controls, API key minting, capability checkboxes, action history, and surgical console into a dense monospace wall. | Add direct quick-jump links to **Release Center** (from Header Deliver / Studio Actions / Command Palette) and **Snapshots** (cross-linked in `SourceControl`), add a **Left Section Navigation Rail** (`All Sections` default + `Paths & Corpus`, `Workbench & Layout`, `Release Packaging`, `AI Assistant`, `Community`) to `DirectorySettingsModal`, and organize `AgentBridge` into crisp segmented tabs (`Sync & Pending`, `Agent Keys`, `Action History`, `Console & Capabilities`) with an always-visible top connection/pending-change banner. |
| **D7** | **Internal Slang, Typos & Juvenile Sci-Fi Chrome** | `Sidebar.tsx:944-945` says `Generic Extensions Folder ("Candy Store")` / `Direct Mod Folder ("Candy Itself")`; `Sidebar.tsx:1089` says `CREATE BLUEPRINT BLUEPRINT`; `index.css` applies neon box-shadows and perpetual pulse animations on static chrome. | Replace slang/typos with clear professional engineering copy (`Extensions Parent Folder (extensions/<mod_id>/)` / `Direct Mod Folder (content.xml at root)`, `Create Reusable Blueprint`, `Minimap`, `Simulation Console`) and calm IDE CSS variables/focus rings in `src/index.css`. |

---

## 3. Unified Target Workbench Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Forge] [Workspace: My_Mod ▾] [Project Files ▾]   [🔍 Search mod or > run command (Ctrl+K)]  [Undo][Redo]│  40px Header
│                                                   [⚡ Validate & Deploy] [Guided|Expert] [Actions ▾] [?] │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Logic & UI: [MD Scripts] [AI Scripts] [HUD & Lua UI] [Contracts] │ Data: [Wares & Jobs] [XML Patching]   │  34px Grouped
│             [Languages (t/)] │ Inspect: [Project] [Galaxy] [X4 Wiki]                          [Collapse] │  Domain Bar
├──────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Readiness: [✓ Graph] → [✓ Package] → [● Deployed] → [● Seen in X4] → [○ Confirmed]   (click for detail) │  30px Compact
├────────┬────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┤
│ Rail   │ Left Contextual Dock   │ Center Authoring Stage                       │ Right Contextual        │
│ (46px) │ (288px, collapsible)   │ (Flexible 1fr — Active Domain Editor)        │ Inspector (310px,       │
│        │                        │ ┌──────────────────────────────────────────┐ │ auto/collapsible)       │
│ Author │ Contextual tool panel: │ │ Compact Editor Toolbar (Zoom | Filter |  │ │ [Properties][Links][XML]│
│ [Nodes]│ • Node Toolbox         │ │ Simulate | Live | Validation | Tools ▾)  │ │                         │
│ [Cues] │ • Cue Hierarchy        │ ├──────────────────────────────────────────┤ │ • Selected Node/Widget  │
│ [Widg] │ • UI Widget Palette    │ │                                          │ │ • Deterministic Explain │
│ [Tmpl] │ • Reusable Templates   │ │                                          │ │ • One-Click Quick Fixes │
│ ────── │ • Project File Tree    │ │     Primary Visual / Code / Diff         │ │ • Schema Property Form  │
│ Proj   │ • Mod Manifest & Build │ │          Authoring Surface               │ │ • Inbound / Outbound    │
│ [Meta] │ • Git & Snapshots      │ │                                          │ │   Cue & Lua Lineage     │
│ [Files]│ • Diagnostics Center   │ │                                          │ │ • Pinned Wiki Reference │
│ [Git]  │ • Playtest & Release   │ │                                [Minimap] │ │                         │
│ ────── │ • Game Object Index    ├──────────────────────────────────────────────┤                         │
│ Qual   │ • AI Assistant         │ Collapsible Bottom Panel (Ctrl+J, optional)  │                         │
│ [Diag] │                        │ [Problems & Critic (0)] [Runtime Log] [XML]  │                         │
│ [Play] │                        │ Live clickable findings / tail / XML preview │                         │
│ ────── │                        │                                              │                         │
│ Ref    │                        │                                              │                         │
│ [Obj]  │                        │                                              │                         │
├────────┴────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┤
│ ● Mod: player_elite_escort v1.2.0 │ Schema: MD 4.5 │ Problems: 0E 0W (Ctrl+J) │ Sync: Live │ 60 FPS     │  26px Status
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Complete Component-by-Component Consolidation Map (Zero Functionality Lost)

| Component(s) | Current Role & Pain Point | Unified Consolidation & Upgrade |
|---|---|---|
| `src/index.css` | Heavy cyan neon glow, `flowPulse` / `nodeGlow`, global monospace uppercase bias. | Define calm IDE CSS design tokens (`--forge-bg-app`, `--forge-bg-panel`, `--forge-bg-elevated`, `--forge-border`, `--forge-accent`, `.forge-toolbar-group`, `.forge-pill`, `.forge-panel-header`, `.forge-kbd`), clean scrollbars, high-contrast `:focus-visible` outlines, and restrained animations only for active simulation/loading. |
| `src/App.tsx` | Mounts 4 stacked bars, buries `PropertiesInspector` inside `Sidebar`, floats `FpsMeter` over Canvas minimap, lacks primary Header Deploy CTA, right inspector, bottom panel, and status bar. | Orchestrate the 5-zone IDE shell: (1) upgraded `studio-header` with primary **Validate & Deploy** CTA (`data-testid="header-deploy-btn"`), Right Inspector toggle (`data-testid="right-inspector-toggle"`), and Bottom Panel toggle (`Ctrl+J`, `data-testid="bottom-dock-toggle"`), (2) grouped `WorkspaceNavigationBar`, (3) compact `ReadinessLadder`, (4) 3-column stage (`Sidebar` + Center Editor / `BottomWorkbenchDock` + `ContextualInspector`), and (5) `WorkbenchStatusBar` (hosting docked `FpsMeter`, sync/agent status, problem counts, and active mod summary). |
| `src/components/WorkspaceNavigationBar.tsx` | Flat 10-button strip mixing editors, map, project, and wiki. | Render clean grouped IDE tabs (**Logic & UI**: `MD Scripts`, `AI Scripts`, `HUD & Lua UI`, `Contracts`; **Data & Patches**: `Wares & Jobs`, `XML Patching`, `Languages (t/)`; **Inspect & Reference**: `Project`, `Galaxy`, `X4 Wiki`) with subtle group separators when default order holds, preserving 100% drag-reorder, `top`/`bottom` docking, collapse, responsive `shortLabel`, and `[data-workspace-view]` attributes. |
| `src/components/ReadinessLadder.tsx` | Two-line tall cards (`52–76px`) consuming vertical editor space even when all stages are known. | Redesign into a sleek, single-row `30px` IDE Readiness Pipeline (`Graph → Package → Deployed → Seen → Experience`) with inline status badges, hover summaries, and click-to-expand `readiness-evidence` bar (preserving `readiness-ladder`, `readiness-stage-*`, `data-status`, `readiness-evidence`, and `readiness-confirm-experience`). |
| `src/components/Sidebar.tsx` | `6.5px` uppercase rail text, `"Candy Store"` slang, `"CREATE BLUEPRINT BLUEPRINT"` typo, `PropertiesInspector` buried at bottom of left scroll pane, no hint when `Nodes`/`Widgets` is open on an unrelated workspace tab. | Clean `48px` Activity Rail with readable `9.5px` sentence-case labels + semantic group dividers; contextual banner on `script`/`cues`/`templates`/`ui` tabs when `workspaceView` is on a different domain (with 1-click switch button); professional staging copy in `Meta` (`config`); fix `Create Reusable Blueprint` heading; cross-link **Release Center** & **Snapshots**; remove bottom-buried `PropertiesInspector` in Expert mode (moved to Right `ContextualInspector`). *(Note: update `tests/e2e/node-toolbox.spec.ts:19` to match sentence-case `Nodes` cleanly or keep accessible label alignment.)* |
| `src/components/ContextualInspector.tsx` *(new)* + `PropertiesInspector.tsx` | Selection properties hidden below left toolbox; Canvas node dependency viewer (`showDepGraph`) floats over top-right of canvas. | Dedicated Right-Hand Contextual Inspector (`310px`, auto-revealed when `selectedNode` or `selectedWidget` is selected in Expert mode, collapsible via header/rail button) with 3 tabs: **Properties** (hosting `PropertiesInspector` with `PROPERTIES INSPECTOR` header intact), **Connections** (live inbound/outbound cue/port/variable lineage & pan-to-node buttons), and **Compiled XML** (focused XML snippet for the selected cue/node). |
| `src/components/BottomWorkbenchDock.tsx` *(new)* + `WorkbenchStatusBar.tsx` *(new)* + `FpsMeter.tsx` | `FpsMeter` overlaps Canvas minimap; viewing diagnostics or generated XML while editing `AI Scripts`, `Wares`, `Patches`, or `Canvas` requires leaving the current sidebar tool. | `26px` `WorkbenchStatusBar` at bottom of viewport (Mod ID, Schema status, clickable Error/Warning counts, Agent Sync badge, docked `FpsMeter` mode toggle) + collapsible `BottomWorkbenchDock` (`Ctrl+J`) with **Problems & Critic**, **Runtime Summary**, and **Generated MD XML** tabs. |
| `src/components/GlobalSearch.tsx` | Only searches MD nodes, widgets, and XML patches; no command execution. | Upgrade into **Omni-Search & Command Palette** (`Ctrl+K` / `Ctrl+Shift+P`): unprefixed search indexes **all 8 Mod Entity families** (`MD Nodes`, `UI Widgets`, `XML Patches`, `AI Scripts`, `Wares`, `Jobs`, `Translations`, `Contract Endpoints`, `Mod Files`) preserving `Matched Search Targets (N)` for exact E2E compatibility, plus a secondary `Views, Commands & Wiki` quick-jump section; typing `>` (or `Ctrl+Shift+P`) lists all Workbench Commands, Views, Tools, and Modals with keyboard navigation. |
| `src/components/Canvas.tsx` | 11-item wrapping top toolbar, neon glow, spinning `Compass` `RADAR MINIMAP`, `TACTICAL LOG MONITOR`, `FpsMeter` collision. | Consolidate top toolbar into 5 crisp pill clusters (`Zoom/Fit` · `MD Script Scope` · `Find & Comment` · `Simulate & Live` · `Validation & Graph Tools`), add collapse toggle on calm `Minimap` (no spinning compass), clean `Simulation Output` console header, and preserve every `data-testid` (`grid-canvas`, `canvas-node-*`, `canvas-port-*`, `canvas-quick-spawn`, `canvas-palette-*`, `package-status-badge`, `canvas-live-toggle`) and `Graph tools` ARIA group. |
| `src/components/UIBuilder.tsx` & `X4UiSourceEditor.tsx` | `UIBuilder` stacks a `48px` header + `88px` 4-card status banner (`136px`!) above `X4UiSourceEditor`. | Replace the tall 4-card banner with a single compact `38px` **UI Workbench Header & Authority Strip** (Mode switch `Lua UI Source Workbench` / `Legacy Pixel Sketchpad` + inline status pills for `ui.xml` registration, corpus preview status, and deploy truth, with click-to-expand details) — preserving `x4-ui-source-authority`, `x4-ui-source-editor`, and all `Legacy pixel designer` controls while reclaiming ~95px of vertical canvas height! |
| `src/components/AIScriptEditor.tsx`, `LibraryConfigurator.tsx`, `XMLPatchSystem.tsx`, `TFileEditor.tsx`, `ContractEditor.tsx`, `BulkTransformPanel.tsx` | Slightly divergent header paddings, heavy uppercase monospace chrome. | Harmonize headers, segmented switches (`wares.xml` / `jobs.xml` / `Bulk transform`; `Single patch` / `Bulk transform` / `Diff→Patch`), and panel borders to the calm IDE token system while keeping 100% of buttons, placeholders, and validation flows untouched. |
| `src/components/ProjectInspector.tsx`, `GalaxyMapView.tsx`, `WikiBrowser.tsx`, `XmlReferenceView.tsx`, `ModDependencyView.tsx` | `ProjectInspector` tabs and reference views use mixed chrome; `ReleaseCenter` / `Diagnostics` links could be clearer. | Harmonize tab bars (`Overview & Architecture`, `Installed Mod Ecosystem`, `XML References`) and add 1-click quick actions in `ProjectInspector` to open `Release Center`, `Validate`, or `Snapshots`. |
| `src/components/DirectorySettingsModal.tsx` & `AIConnectionModal.tsx` | Long single-column modal (`798` lines); AI config is a separate modal jump. | Widen `Studio Settings` into a clean two-pane IDE Settings dialog with a **Left Category Sidebar** (`All Sections` [default so all sections remain immediately visible to tests & power users], `Paths & Game Corpus`, `Workbench & Layout`, `Release Packaging`, `AI Assistant`, `Community & Support`) + prominent header button to open `AI Engine Configuration` (`AIConnectionModal`), preserving every single `data-testid` and button label asserted by `reference-settings.spec.ts` and `studio-shell.spec.ts`. |
| `src/components/AgentBridge.tsx` | `1,990`-line single scrollable drawer with 37+ buttons across sync, keys, capability checkboxes, history, and surgical console. | Add a clean **Segmented View Bar** (`All` [default so existing `continuous-polling.spec.ts` assertions find `Apply Changes` / `AI Agent API Bridge` immediately] · `Sync & Approvals` · `Agent Keys` · `History & Ledger` · `Console & Schema`) and calm IDE card headers, preserving `agent-bridge`, `Close Agent API Bridge`, `Apply Changes`, `agent-key-*`, and `agent-authority-policy`. |
| `src/components/StudioActionsMenu.tsx` | Flat 7-item dropdown (`Sync Mod`, `Directory Settings`, `Agent Bridge`, `AI Engine`, `X4 Wiki`, `Report a Bug`, `Reset Workspace…`). | Organize into logical menu sections (**Project**: `Sync Mod`, `Release Center…`, `Toggle Bottom Panel (Ctrl+J)`; **Environment & Agents**: `Studio Settings`, `Agent Bridge`, `AI Engine`; **Help & Recovery**: `X4 Wiki`, `Keyboard Shortcuts (?)`, `Report a Bug`, `Reset Workspace…`) while keeping all existing button names and `Escape` focus-return behavior intact. |

---

## 5. Acceptance Criteria & Verification Matrix

1. **Zero Capability / Writer / Security Regressions:**
   - `npm run test:writers` -> `30/30 + PASS + 8/8` (`50` raw writers, `sourceFingerprint` unchanged).
   - `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (all `FORGE_UI_ACTION_PARITY_CENSUS` `uiAnchors` verified on disk).
   - `npm run test:action-receipt-coverage` + `:selftest` -> `PASS`.
   - `npm run lint -- --max-warnings 600` (`0` errors) + `npm run typecheck` (`0` errors) + `npm run build` (`0` exit).
   - `npm run test:oracles` (`134/134 PASS`) + `npm run test:routes` (`791/791 PASS`).
2. **Real Rendered Browser & Playwright E2E Verification (Workflow v3 Stage 6 Machine & Experience Gate):**
   - Run Playwright E2E suites covering shell, responsive layout, onboarding, readiness, canvas, toolbox, UI workbench, settings, release center, runtime debugger, and product copy:
     - `studio-shell.spec.ts` (`800px`, `1023px`, `1024px`, `1200px`, `1600px` viewports, Omni-Search, layout reorder/hide/persist, non-overlap geometry)
     - `experience-mode.spec.ts` (Beginner 5-step flow <-> Expert workbench + `PROPERTIES INSPECTOR`)
     - `readiness-ladder.spec.ts` (5 readiness stages, navigation to `diagnostics` & `playtest`, staleness invalidation)
     - `guided-rail.spec.ts` (starter template -> 3-step guided rail -> server sync)
     - `node-toolbox.spec.ts` (virtualized 1,000+ XSD node search, favorites, corrupt storage recovery)
     - `canvas-interactions.spec.ts` & `canvas-coverage.spec.ts` (ports, group drag, quick-spawn, `Graph tools`, performance bounds)
     - `ui-manifest-integrity.spec.ts` (`X4UiSourceEditor` + compact `UIBuilder` authority strip)
     - `reference-settings.spec.ts` (`Studio Settings` paths, corpus coverage, Dev scratch pins, external links)
     - `release-center.spec.ts` (Nexus & Steam guided/express flows)
     - `runtime-debugger.spec.ts` (incident jump -> Canvas node -> visible right-hand `PROPERTIES INSPECTOR`)
     - `product-copy.spec.ts` (shipped copy cleanliness)
   - Capture and visually inspect real rendered screenshots in Expert mode (with node selected showing the new Right-Hand Contextual Inspector + compact top chrome + docked Status Bar + open Omni-Search + open Bottom Dock) and Beginner mode.
3. **Precommit, Push, CI & Notion Sync:**
   - `npm run precommit:check` (`[precommit] OK`), commit on `main`, `git push origin main`, verify GitHub Actions `Quality` CI passes, and update both the Notion UI Simplification Spec page (`VERIFIED` + visual/E2E receipts) and `Forge QA Field Log` (`4124618ed15b8131bdd5ff6aabefbd6d`).
4. **Planned Rollback:**
   - Restore any touched `src/` or `tests/e2e/` file from `38a9ac9` via `git show HEAD:<path>` + `fs.writeFileSync` if any gate fails.

---

## 6. Durable Close & AAR Record (2026-11-24)

### Close Summary
- **Final Status:** `VERIFIED` (in Dev source, isolated HTTP/oracle runtime, and real Chromium Playwright E2E + rendered screenshot inspection; `0.0.94` packaged VSIX & `FORGE DEVELOPMENT` IDE upgrade remain `PARTIAL` / `NOT_READY` pending Ken's Machine-State Ask + Write Gate).
- **What Changed:**
  - `src/index.css`: Introduced calm IDE design tokens (`--forge-bg-app`, `--forge-bg-panel`, `--forge-bg-elevated`, `--forge-accent`), sentence-case `.studio-menu-item` / `.studio-menu-section-label`, `.forge-toolbar-cluster`, `.forge-toolbar-btn`, `.forge-kbd`, restrained simulation glow, and clean scrollbars.
  - `src/components/ContextualInspector.tsx` *(new)*: Dedicated `312px` Right-Hand Contextual Inspector in Expert mode (auto-opening on Canvas node or UI widget selection, collapsible/pinnable, overlaying cleanly at `top-[104px]` on `<1150px` viewports) with **Properties** (`PropertiesInspector`), **Links** (inbound/outbound port & cue lineage with 1-click focus), and **XML** (compiled excerpt + Copy) tabs.
  - `src/components/BottomWorkbenchDock.tsx` *(new)*: Collapsible `220px` bottom panel (`Ctrl+J`, `data-testid="bottom-workbench-dock"`) providing **Problems & Critic** (live clickable diagnostics + `critiqueWorkspace` findings), **Runtime & Deliver** (5-stage readiness summary + quick jumps), and **Compiled MD XML** preview beneath any domain editor.
  - `src/components/WorkbenchStatusBar.tsx` *(new)* & `src/components/FpsMeter.tsx`: `26px` IDE Status Bar housing active mod ID/version, clickable `0E · 0W` problem toggle, quick `Deliver` action, active editor surface label, `Panel` (`Ctrl+J`) & `Inspector` toggles, `Agent API` sync badge, and docked `<FpsMeter variant="docked" />` (eliminating bottom-left Canvas Minimap collision).
  - `src/components/GlobalSearch.tsx`: Dual-mode **Omni-Search & Command Palette** (`Ctrl+K` / `/` indexes all 8 Mod Entity families — MD Nodes, UI Widgets, XML Patches, AI Scripts, Wares, Jobs, Translations, Contract Endpoints, and Mod Files — preserving exact `Matched Search Targets (N)` count + secondary Views/Wiki quick-jumps; `>` prefix or `Ctrl+Shift+P` runs full Command Palette across all 10 views, 11 tools, and global workbench commands).
  - `src/components/App.tsx`, `WorkspaceNavigationBar.tsx`, `ReadinessLadder.tsx`, `StudioActionsMenu.tsx`, `HealthCardOverlay.tsx`, `Sidebar.tsx`: Compressed top chrome (`40px` Header with primary `Validate & Deploy` CTA + `34px` grouped sentence-case Domain Bar + `30px` single-row Pipeline Readiness Strip), categorized `StudioActionsMenu`, updated `HealthCardOverlay` safe areas, upgraded `Sidebar` `52px` Activity Rail (preserving `aria-label={item.label.toUpperCase()}`), added contextual domain-mismatch switch banners + `Snapshots`/`Source Control` cross-jump pills, removed bottom-buried `PropertiesInspector` from Expert left sidebar, and replaced internal slang/typos (`"Candy Store"` / `"Candy Itself"`, `"CREATE BLUEPRINT BLUEPRINT"`).
  - `src/components/Canvas.tsx`, `UIBuilder.tsx`, `DirectorySettingsModal.tsx`, `AgentBridge.tsx`, `ProjectInspector.tsx`, `AIScriptEditor.tsx`: Grouped `Canvas` toolbar into `.forge-toolbar-cluster` pills with zoom `%` reset, collapsible calm `Minimap`, and `Simulation Console`; compressed `UIBuilder` header (`36px`) + bounded-scroll 4-card status strip (`max-h-14` reclaiming ~200px above the fold for `X4UiSourceEditor`); upgraded `DirectorySettingsModal` into a wide two-pane IDE Settings modal with Left Category Rail (`All Settings` default, `Paths & Corpus`, `Workbench & Layout`, `Release Packaging`, `AI Assistant`, `Community`) and sticky `Save Paths` footer; calmed `AgentBridge` chrome; added `Validator` / `Release Center` / `Validate & Deploy` quick-action pills to `ProjectInspector`.
  - `tests/e2e/ide-workbench.spec.ts` *(new)*: End-to-end verification of Right Contextual Inspector, Bottom Workbench Dock (`Ctrl+J`), Command Palette (`>`), docked Status Bar & non-overlapping Minimap/FPS, compact `UIBuilder`, two-pane `Studio Settings`, `800px` narrow responsive layout, Beginner mode, and workspace hash immutability.
- **What Was Deliberately Not Changed:**
  - Zero capabilities, routes, MCP tools, `StudioLayoutPreferences` schema, `localStorage`/`sessionStorage` write counts (`config/durable-writers.json` `50` raw writers & `sourceFingerprint: 8ab98487...` untouched), or `FORGE_UI_ACTION_PARITY_CENSUS` (`SHA-256: bfa6f07f...`) anchors were altered (`no capability-map delta`).
- **Validation Evidence:**
  - `npm run typecheck` -> `PASS` (`0` errors)
  - `npm run lint -- --max-warnings 600` -> `PASS` (`0` errors, `< 600` warnings)
  - `npm run test:writers` -> `PASS` (`30/30 + PASS + 8/8`)
  - `FORGE_CAPABILITY_BASE_REF=origin/main npm run test:capabilities` -> `PASS` (`108` capabilities, `397` routes, `109` MCP tools, all `uiAnchors` intact)
  - `npm run test:action-receipt-coverage` -> `PASS` (`139` routes / `69` surfaces)
  - `npm run build` -> `PASS` (client bundle + `dist/server.cjs` + `dist/canonical-md-worker.cjs`)
  - `npm run test:oracles` -> `134/134 PASS`
  - `npm run test:routes` (with `X4_REFERENCE_ROOT`/`X4_XSD_PATH` unset) -> `791/791 PASS`
  - Playwright E2E (`X4_REFERENCE_ROOT` read-only 9.00 corpus, `--workers=1`): **`46/46 PASS` (`0` failed, `0` flaky)** across `15` suites (`ide-workbench`, `studio-shell` at `2560`/`1920`/`1600`/`1366`/`1024`/`800px`, `experience-mode`, `readiness-ladder`, `node-toolbox`, `product-copy`, `ui-manifest-integrity`, `reference-settings`, `capability-contract`, `canvas-coverage`, `canvas-interactions`, `deploy-review`, `guided-rail`, `release-center`, `runtime-debugger`).
  - Real Rendered Visual Inspection (`G:\Forge-QA\temp\ui-verify-screenshots\01..06.png` inspected via `read_file`): Confirmed side-by-side Node Toolbox + Canvas + Right Contextual Inspector, Command Palette + Bottom Problems Dock, above-the-fold `X4UiSourceEditor` controls, two-pane `Studio Settings` with sticky `Save Paths`, unobstructed `800px` top bars above floating Contextual Inspector, and clean Beginner 5-step mode.
  - `npm run precommit:check` -> `[precommit] OK`
- **Suggested Commit Title:** `feat(ui): unified ide workbench layout, contextual inspector, omni-search, and status dock`

### Triggered AAR
- **Triggers:**
  1. First `tsc --noEmit` run caught exact property-name mismatches in new `BottomWorkbenchDock.tsx` (`critiqueWorkspace(nodes, links)` signature + `diag.filePath`) and `GlobalSearch.tsx` (`script.command`, `ware.transport`, `job.taskScript`, `page.items`, `ep.description`).
  2. Initial Playwright E2E invocation omitted `X4_REFERENCE_ROOT`, causing `FirstRunWizard` (`md.xsd not loaded`) to intercept canvas port clicks in `canvas-coverage.spec.ts`; setting read-only `X4_REFERENCE_ROOT` resolved `34/34` immediately.
  3. Real rendered screenshot inspection (`03-compact-ui-workbench.png` and `05-narrow-800px-responsive.png`) revealed verbose multi-line `ui-generated-lint-status` findings pushing `X4UiSourceEditor` down ~200px and narrow `<1150px` fixed inspector starting at `top-10` instead of `top-[104px]`; both were refined and re-verified visually and via E2E.
- **Sustain:** Auditing all 35 Playwright E2E selector/keyboard contracts and `durable-writers.json` host-store counts upfront allowed modifying 17 UI components across the entire Studio shell with zero writer-manifest or existing-E2E regressions, and inspecting rendered screenshots caught two real visual layout issues that passed DOM assertions.
- **Improve — Work/Approach:** Always check exact domain interface definitions in `src/types.ts` (`TranslationPage.items`, `AIBehaviorScript.command`, `ContractEndpoint.description`) before writing cross-domain indexers, and always pass read-only `X4_REFERENCE_ROOT` when invoking `node scripts/run-e2e.mjs` (while keeping `X4_REFERENCE_ROOT` unset for `npm run test:routes`).
- **Improve — Tools:** Added durable `tests/e2e/ide-workbench.spec.ts` with `FORGE_UI_SCREENSHOT_DIR` support so future UI changes can re-verify all 5 workbench zones and regenerate visual inspection captures in one command.
- **Highest-Risk Observed Weakness:** `FirstRunWizard` modal auto-opens when `md.xsd` is unconfigured, silently blocking pointer events in headless E2E runs if `X4_REFERENCE_ROOT` is cleared in the same shell after `npm run test:routes`; banked the explicit environment separation rule in `SESSION-HANDOFF.md`.

