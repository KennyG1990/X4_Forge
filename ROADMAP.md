# X4 Mod Studio — Prototype Validation Roadmap

**Status:** Draft v2 · **Goal:** Post-MVP mandatory-tool roadmap · **Sequencing:** Foundation-first · **Team:** Small (humans + AI agents, parallel tracks)

---

## North Star

> A non-trivial mod, built **entirely inside the studio**, compiles to XML, installs into X4 Foundations, and **runs in-game with zero hand-editing.**

The prototype was user-confirmed as MVP-valid on 2026-06-10: generated/deployed mods load and function in-game. Nothing on this roadmap exists for its own sake — every item makes one link in that chain more trustworthy or turns the studio into a better workflow than hand-editing XML.

## Product Positioning

The studio should become the strongest X4 tool for **all text-editing forms of modding**: Mission Director XML, AI scripts, library diffs, wares, jobs, t-files, UI Lua/XML scaffolds, content metadata, and arbitrary XML patch work. The target is not merely "a generator"; it is the default text-mod IDE for X4.

Mod folder management is still required, but its role is situational awareness and safety: users need to see the package tree, know what files are generated vs preserved, inspect imported content, and understand deployment state. It is infrastructure that supports text-mod authoring, not the primary value proposition by itself.

## The core loop (the chain we're validating)

```
Author → Compile → Validate → Package → Run in X4 → (Round-trip back)
 graph    XML       checks      mod dir   in-game      import w/o drift
```

Foundation-first means: before adding polish, every link above has to be *correct and honest*. A tool whose pitch is "we keep your mod valid" cannot itself produce invalid output or claim false success.

---

## Tracks (parallelizable)

Three tracks. **B is the gate** (do first, it's cheap). **A is the critical path** to validation. **C proves it.** A and B can run fully in parallel; C leans on A.

### Track B — Foundation hardening *(the gate — do first)*
Trust prerequisites. Small, well-scoped, high-confidence changes.

- **B1 — Lock the network surface.** Bind `127.0.0.1` instead of `0.0.0.0` (`server.ts` ~L1331); restrict CORS from `*` to the app origin (`server.ts` ~L58).
- **B2 — Authenticate privileged routes.** Per-session token on `/api/agent/*` and `/api/github/*`; stop falling back to `process.env` provider keys for requests that didn't originate from the app UI (prevents credit-theft via open proxy).
- **B3 — Honest reporting.** Success messages must reflect real post-validation diagnostics. Fix the AgentBridge "Success!" that fires regardless of remaining warnings (`AgentBridge.tsx` ~L168 + the swallowed Phase-4 self-heal failure in `server.ts` ~L1140). Default `autoSync` OFF or gate it.

**Exit:** API not reachable off-host, no unauthenticated secret-backed actions, no success message that can lie.

### Track A — Loop integrity *(critical path)*
Make Compile → Validate → Package → Round-trip provably correct.

- **A1 — Round-trip fidelity harness.** Golden-file tests: real Egosoft MD samples → import → export → structural diff. This is our primary validation instrument. First target: confirm/fix the `check_value` shape — parser reads `min/max/exact/list` (`xmlParser.ts`) but verify `generateMDXML` emits the same form, not legacy `operator`/`value2`.
- **A2 — XSD-backed compile validation.** Validate generated XML against the real `md.xsd`/`common.xsd` programmatically (you already parse them in `xsdParser.ts`) — a machine-checkable layer beneath the heuristic `validateModWorkspace`.
- **A3 — Real mod packaging.** Export to an installable mod folder: correct `content.xml`, `md/`, `ui/`, `t/` layout that drops straight into X4's `extensions/`. This is the link that currently doesn't reach the game.
- **A4 — Unify the compilers.** Today only `generateMDXML` + `generateUIXML` live in shared code (`types.ts`); the other six compilers are trapped client-side in `CodePreview.tsx` and unreachable by the server/agent API. Promote them all into one shared, server-importable module so the UI, the agent `/compile`, `/generate`, and a future `/package` endpoint use the *same* code. Definition of done = the table in the appendix, every domain green. (This also kills the two API bugs: `/generate` dropping content domains and `/compile` omitting them.)

**Exit:** Studio output is XSD-valid, round-trips without drift, and lands in a folder X4 will load.

### Track C — Validation instrumentation *(proves it)*
The evidence that the loop closed.

- **C1 — Known-good fixture mod.** One reference mod exercising the full surface: cue, event, condition, action chain, sub-cue, UI widget, and a `custom_xml` escape hatch. The thing we drive end-to-end.
- **C2 — In-game verification protocol.** Checklist + `debug.log` capture confirming load and behavior. **Human-in-the-loop** — you can run X4; agents can't. This is the irreducible ground-truth step.
- **C3 — Transparency "dry run" (NOT a predictor).** Show generated XML, a cue-reference graph, and surface orphaned/unreferenced cues. Verifiable and useful; deliberately *not* a green/red behavior simulator that could manufacture false confidence.

**Exit:** Documented, repeatable proof that a studio-built mod runs in X4.

---

## Milestones

| Milestone | Definition of done | Tracks |
|---|---|---|
| **M0 — Foundation gate** | API host-locked + authed; no dishonest success states | B1–B3 |
| **M1 — Loop closed once** | One fixture mod: authored → compiled → packaged → loads in X4 | A3, C1, C2 |
| **M2 — Loop trustworthy** | Round-trip harness green on N real samples; XSD validation passing; drift bugs fixed | A1, A2 |
| **M3 — Prototype validated** | A *new*, non-trivial mod built start-to-finish in-studio runs in-game, documented | all |

---

## Post-MVP roadmap — make it mandatory

**Observed status as of 2026-06-10:** the MVP loop has been user-confirmed: the studio can build usable mods, deploy them into the X4 game folder, and the generated mods load and function in-game. The roadmap now shifts from "can it work?" to "is this better, safer, and faster than hand-editing X4 mods?"

**Priority rule:** prioritize features that make text/XML/script editing safer and more complete across every X4 modding domain. File-tree and mod-folder management should be built when it improves awareness, preservation, deployment safety, or round-trip confidence.

### Decision record — highest-value feature bets

These confidence estimates capture current product judgment, not proof. They should guide sequencing until better evidence replaces them.

| Feature | Estimated impact | Why it matters |
|---|---:|---|
| **Schema-Aware Mod Doctor** | **90%** | X4 modding pain is mostly invisible XML/runtime failure. A diagnostics panel that validates every output file, explains issues plainly, and links errors back to editable nodes/items is the strongest mandatory-tool candidate. |
| **Live Game Feedback Loop** | **85%** | Reading `debuglog.txt`, detecting reload/load errors, and mapping those errors back into the Studio closes the gap between "compiled" and "X4 accepted it." Keep it log-first; automate in-game input only after visible proof. |
| **Real X4 Object Browser** | **80%** | The app should stop relying on small hardcoded lists. Ships, wares, factions, macros, sounds, jobs, MD actions, AI commands, and schema elements should come from the installed game/DLC/mod environment. |
| **Round-Trip Import/Edit/Export** | **75%** | Importing existing mods, reconstructing editable domains, preserving unknown XML, and exporting without destroying hand-authored parts turns the app from generator into IDE. |
| **Diff-Safe Patch Builder** | **75%** | X4 XML patching is powerful but brittle. XPath validation, before/after previews, and warnings for zero/many selector matches would save real time and prevent silent in-game failures. |

**Feature bets:**
- Mandatory for serious users: Mod Doctor, object browser, round-trip import, and live log feedback.
- Good but secondary: prettier UI designer, more AI generation, GitHub polish, and templates.
- Risky unless constrained: full automatic in-game reload/control. It is valuable, but prior evidence says focus/input reliability is a separate hard problem.

**Blunt recommendation:** build toward a closed-loop X4 Mod IDE:

1. Author visually.
2. Compile full package.
3. Validate against schemas and game data.
4. Deploy.
5. Read game logs.
6. Map errors back to editable objects.
7. Preserve manual/unknown XML during round trips.

### P1 — Mod Doctor: schema + package + runtime diagnostics

**User value:** a modder should know *before and after deployment* whether the package is valid, what is wrong, and exactly where to fix it in the studio.

**Current code surfaces to build on:**
- `src/types.ts` has `validateModWorkspace(workspace, code)` for heuristic MD graph diagnostics and `XMLDiagnostic`.
- `src/lib/modCompiler.ts` has `validatePackageReadiness(workspace)` plus canonical compile helpers.
- `server.ts` has `loadSchemaLibrary()`, `schemaLibrary`, `/api/schema/library`, `/api/schema/element/:tag`, `/api/agent/compile`, and `/api/agent/package`.
- `src/components/CodePreview.tsx`, `src/components/AIHelper.tsx`, and `src/components/AgentBridge.tsx` already surface diagnostics, but mostly for MD.
- `src/components/PlaytestWorkspace.tsx` already documents debug-log launch/reload workflow text.

**Roadmap detail:**
- Add a `diagnostics/` library that validates the full file manifest from `buildWorkspaceFileManifest()`, not only `generateMDXML()`.
- Run domain-specific checks for `content.xml`, MD, UI output, aiscripts, wares, jobs, t-files, and XML patches.
- Add XSD-backed validation where schema files exist. Current schema load is `md.xsd` + `common.xsd`; extend config and parser flow for `aiscripts.xsd`, libraries where practical, and target-file-aware XML patch checks.
- Normalize diagnostics to `{severity, domain, filePath, message, sourceRef}` where `sourceRef` can point to node id, widget id, t-file/page/item, ai script/action, ware id, job id, or patch id.
- Build a Mod Doctor panel that groups findings by package file and links each finding back to the owning editor tab.

**Definition of done:**
- A generated package with intentionally bad MD, bad AI script, bad XML patch selector, and bad metadata produces actionable diagnostics in the UI and via `/api/agent/compile`.
- The app no longer reports "success" without also showing diagnostic counts by severity.

### P2 — Live Game Feedback Loop

**User value:** the studio should confirm what X4 actually accepted, not just what the compiler emitted.

**Current code surfaces to build on:**
- `src/components/PlaytestWorkspace.tsx` contains the current launch/reload instructions and debug-log workflow.
- `server.ts` has `/api/gemini/analyze-log` and log-analysis schema around X4 reload/debug errors.
- `server.ts` deploys to `x4GamePath/extensions` through `/api/agent/deploy`.
- `src/lib/xsdParser.ts` stores `x4GamePath`, and `DirectorySettingsModal.tsx` lets the user configure it.
- Prior live-harness work outside this repo established that reading `debuglog.txt` and using explicit reload markers is more reliable than pretending input automation is solved.

**Roadmap detail:**
- Add `/api/x4/log/status` to locate and tail the active X4 debug log from configured `x4GamePath` or user-provided log path.
- Add `/api/x4/log/analyze` that extracts recent load errors, extension id mentions, MD cue errors, XML parser failures, and reload markers without requiring AI first.
- Add optional AI explanation on top of deterministic parsing, not instead of it.
- Add deploy-session ids: each deploy writes a unique marker into package metadata or a generated debug cue/log line so the log viewer can connect game feedback to a specific Studio deployment.
- In the UI, show "Compiled", "Deployed", "Seen by X4", "Loaded cleanly", and "Runtime errors detected" as separate states.

**Definition of done:**
- After deploy, the Studio can show whether X4 mentioned the extension in the latest log window.
- A known bad generated XML file produces a captured X4 error that links back to a Studio diagnostic.
- No feature claims automatic `/reloadui` or command injection success until visible game-side evidence proves the input path.

### P3 — Real X4 Object Browser and Game Index

**User value:** text editors should autocomplete and validate against real local game objects instead of forcing users to guess macro ids, ware ids, faction names, sounds, jobs, or library targets.

**Current code surfaces to build on:**
- `src/types.ts` has hardcoded `X4_FACTIONS`, `X4_SHIP_MACROS`, `X4_STATION_MACROS`, and `X4_SOUND_EFFECTS`.
- `server.ts` exposes those constants through `/api/agent/schema`.
- `src/lib/xsdParser.ts` already resolves `x4GamePath` and schema locations.
- `src/components/WikiBrowser.tsx` provides static help content.
- Node/property options flow through `NODE_TEMPLATES` and schema-derived templates.

**Roadmap detail:**
- Add an indexer under `src/lib/gameIndex.ts` or `execution/` that scans the configured X4 install and enabled extensions for macros, wares, factions, sounds, jobs, components, libraries, and MD/AIScript references.
- Cache index output under `.tmp/` or a gitignored local cache, keyed by game path and file mtimes.
- Replace hardcoded select options with indexed values where available, falling back to built-ins when no game path is configured.
- Add object detail views: source file, id/name, DLC/mod source, referenced macro/component, and "used by current workspace" links.
- Expose index data through `/api/x4/index` and summarize it in `/api/agent/schema` for external agents.

**Definition of done:**
- Creating a `create_ship` node can select a real ship macro discovered from the user's install.
- A ware/job/XML patch editor can search real target ids from local game data.
- The API can answer "what valid ship macros/factions/wares are available in this install?"

### P4 — Round-trip Import/Edit/Export

**User value:** the studio becomes an IDE for existing text-based mods, not only a generator for new ones. Folder awareness matters here because import/export must preserve files the studio cannot fully model yet.

**Current code surfaces to build on:**
- `src/lib/xmlParser.ts` imports some MD XML into a `ModWorkspace`.
- `DirectoryExplorer.tsx`, `SyncModal.tsx`, and `SourceControl.tsx` can read/import JSON and XML.
- `src/types.ts` has `sanitizeWorkspace()` for normalizing imported workspaces.
- `SnapshotManager.tsx` compares snapshots at a workspace level.
- `server.ts` has filesystem list/read/write endpoints and snapshot restore endpoints.

**Roadmap detail:**
- Add a mod-folder importer that reads `content.xml`, `md/`, `aiscripts/`, `libraries/`, `t/`, `ui/`, and unknown files, then presents the package tree as context for editing.
- Preserve unknown XML and unparsed files in a `rawFiles` or `passthroughFiles` workspace field so export does not destroy hand-authored content.
- Expand parsers domain by domain: MD first, then t-files, XML diff patches, wares/jobs diffs, aiscripts.
- Add a round-trip harness: import real sample mod -> export package -> compare structural XML and passthrough file hashes.
- Add a "lossiness report" that states what was fully editable, partially understood, and preserved raw.

**Definition of done:**
- Importing and immediately exporting an existing mod does not drop files.
- The UI clearly marks generated, editable, partially parsed, and passthrough files instead of pretending every file is fully modeled.
- At least three real mod folders round-trip with no unintended file loss.

### P5 — Diff-Safe XML Patch Builder

**User value:** XML patching is one of X4's most powerful features, but bad selectors fail silently or patch the wrong thing. The Studio should make patches inspectable before deployment.

**Current code surfaces to build on:**
- `src/components/XMLPatchSystem.tsx` edits `workspace.xmlPatches`.
- `src/lib/modCompiler.ts` and `server.ts` use `compileDiffDocument(patches, targetFile)`.
- `server.ts` file APIs can read configured filesystem roots.
- `src/components/WikiBrowser.tsx` already explains XML diff basics.
- `src/components/GlobalSearch.tsx` indexes XML patches for search.

**Roadmap detail:**
- Add target-file resolution against the local game index: when the target is `libraries/wares.xml`, load the actual base file from the X4 install.
- Add XPath selector checking: zero matches, one match, many matches, and invalid selector syntax.
- Add a before/after preview for `add`, `replace`, and `remove`.
- Support `<add pos="before|after|prepend|append">` and expose it in the editor.
- Warn when a patch targets a generated file in the same mod where normal generation would be clearer.

**Definition of done:**
- Every XML patch can be previewed against a real target file before compile.
- Bad selectors produce warnings in Mod Doctor and `/api/agent/compile`.
- The patch builder can show exactly what nodes will be inserted/replaced/removed.

### P6 — Agent-First Automation API

**User value:** external AI agents should be able to inspect the text-mod project, make safe edits, compile, diagnose, and deploy without scraping the UI.

**Current code surfaces to build on:**
- `server.ts` exposes `/api/agent/schema`, `/api/agent/workspace`, `/api/agent/compile`, `/api/agent/package`, `/api/agent/deploy`, and `/api/agent/generate`.
- `AgentBridge.tsx` documents agent API routes and polls workspace changes.
- `buildWorkspaceFileManifest()` now gives the API a complete package view.

**Roadmap detail:**
- Add granular patch endpoints: `POST /api/agent/workspace/patch` for JSON Patch-style changes instead of full workspace replacement.
- Add read-only project context endpoints: current diagnostics, current package manifest metadata, configured paths, snapshots, and game index summary.
- Add optimistic concurrency with `workspaceVersion` required on mutation endpoints to prevent stale-agent overwrites.
- Add dry-run mutation mode: return proposed workspace + diagnostics without applying.
- Add endpoint examples to `/api/agent/schema` that include Windows PowerShell curl syntax and token handling.

**Definition of done:**
- An external agent can: read schema -> read workspace -> propose patch -> dry-run compile -> apply patch -> deploy -> read diagnostics, without opening the UI.
- Stale writes are rejected with a clear version conflict response.

---

## Lower-priority UX polish

UE5-style UX polish — drag-to-search, comment-group cards, reroute nodes, content-browser drag-drop, the cue-tree/behavior-tree view. All worth doing, but none is as important as Mod Doctor, live game feedback, game-data indexing, round-trip safety, or diff-safe patching. (Note: when we do build the graph model, lean toward MD's *declarative behavior-tree* nature rather than UE5's imperative exec-flow metaphor.)

---

## Open questions to resolve before/early in M1
- X4 install path + mod folder conventions on the target machine (for A3 packaging).
- Which real Egosoft MD scripts become the golden round-trip corpus (for A1).
- Division of labor: which track each agent/person owns.

---

## Appendix — Compiler correctness vs Egosoft conventions

Each of the eight content domains the app can emit, weighed against documented X4 modding conventions (Egosoft wiki + community patch/extension references). "DoD" = what A4 must make true. Status reflects the **current** main-branch output.

| Domain | Output location | Status vs Egosoft | What's wrong / DoD |
|---|---|---|---|
| **content.xml / packaging** | `extensions/<id>/content.xml` | ⚠️ Mostly correct | Root attrs, `date=YYYY-MM-DD`, `save`, `enabled`, `<text language="44">`, lowercase `<id>` all good. **Bug:** `toContentVersion` just concatenates digits (`"2.5"→"025"`, read in-game as v0.25). X4 wants an integer = version×100. Also no `<dependency>` support (other extensions / DLC gating). |
| **MD scripts** | `md/<id>.xml` | ✅ Correct | `noNamespaceSchemaLocation="md.xsd"`, folder, cue tree all valid. Most mature compiler. |
| **UI layouts** | `md_ui_layouts/<id>_ui.xml` (packaged) + Lua console (display only) | ❌ Split / broken | *Tested live in v2.4.* Two sub-tools: **Layout GUI Designer** emits the `<ui_menu><theme><layout>` XML to `md_ui_layouts/` — a non-standard folder + invented schema X4 ignores; this is the **only** UI artifact the packager actually writes. **Lua Script Event Manager** generates Lua aimed at the correct `/ui/addon_menu.lua`, but (a) the compiler never writes it to the mod (it's copy-to-clipboard only), (b) it calls invented functions (`RegisterLayout`, `RemoveAllUITriggers`) instead of X4's real Helper/widgetSystem UI framework, and (c) there's no `ui.xml` index registering the Lua. DoD: wire the Lua into packaging, replace the invented API with X4's real UI framework, emit a `ui.xml` index, and drop/repurpose the `md_ui_layouts` `<ui_menu>` output. The scaffolding for "make it real" already exists. Highest-impact correctness fix. |
| **AI scripts** | `aiscripts/<name>.xml` | ⚠️ Plausible | `aiscripts.xsd` ref + `<params>/<attention>/<actions>` structure broadly right. Verify `<param type=...>` — aiscript params take `name/default/comment`, not `type` (that's MD library params). Hardcoded `<wait exact="5s"/><resume label="start"/>` loop is injected into every script regardless of intent. |
| **Wares** | `libraries/wares.xml` (`<diff><add sel="/wares">`) | ⚠️ Valid shape, fake data | Diff-as-file pattern is **correct** (X4 detects `<diff>` root and patches base `libraries/wares.xml`). But the `<production>` recipe (`ore`+`energycells`, fixed amounts/method) and `tags="economy equipment"` are **hardcoded into every ware** regardless of user input. Structurally valid, semantically fabricated. |
| **Jobs** | `libraries/jobs.xml` (`<diff><add sel="/jobs">`) | ⚠️ Valid shape, thin | Diff pattern correct. But `<expiration>`, `<loadout><level>`, `<modifiers>` hardcoded; `tags="military <shipClass>"` uses shipClass as a tag (approximate). Real jobs schema is much richer (basket, environment, location, orders). Approximation only. |
| **Translations** | `t/0001-L<lang>.xml` | ⚠️ Minor | `<language id><page id><t id>` structure correct. Naming should be lowercase, zero-padded `0001-l044.xml`; current default risks `0001-L44.xml`. No guard pushing custom page IDs into a high range to avoid clobbering vanilla strings. |
| **XML diff patches** | `<targetFile>` (`<diff>` w/ `add`/`replace`/`remove sel=`) | ⚠️ Correct core, gaps | Matches the documented patch convention (XPath `sel`, three ops). Missing: `pos` attribute on `<add>` (before/after/prepend), any XPath validation against the target file (bad selectors fail silently in-game), and the default target `libraries/ship_macros.xml` is a guess. |

**Reading of the table:** the *diff-based* domains (wares, jobs, patches) are structurally on the rails but emit placeholder content; the *UI* domain is split — it already has a Lua path pointed at the right place (`/ui/`) but doesn't package it, while the thing it *does* package (`md_ui_layouts/<ui_menu>`) is non-standard; `content.xml` has a real version bug; MD is solid. So A4 isn't just "move code" — it's "move code **and** fix these per-domain correctness issues as you go," with the round-trip + XSD harness (A1/A2) as the safety net that proves each fix.

---

## Sources
- [Egosoft Wiki — Modding Support](https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/)
- [Egosoft Wiki — h2odragon's HOWTO-hackx4f](https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/ScriptingMD/Community%20Guides/h2odragon's%20HOWTO-hackx4f/)
- [Steam — Workshop for X Rebirth and X4 (content.xml / version)](https://steamcommunity.com/sharedfiles/filedetails/?id=245117855)
- [kuertee/x4-mod-ui-extensions — content.xml example](https://github.com/kuertee/x4-mod-ui-extensions/blob/master/content.xml)
