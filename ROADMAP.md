# X4 Mod Studio — Prototype Validation Roadmap

**Status:** Draft v1 · **Goal:** Validate the core loop · **Sequencing:** Foundation-first · **Team:** Small (humans + AI agents, parallel tracks)

---

## North Star

> A non-trivial mod, built **entirely inside the studio**, compiles to XML, installs into X4 Foundations, and **runs in-game with zero hand-editing.**

The prototype is "validated" the day that sentence is true and repeatable. Nothing on this roadmap exists for its own sake — every item makes one link in that chain trustworthy.

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

### Changelog — 2026-06-11 (browser-verified against `http://localhost:3000`)

Four correctness engines landed and were verified live through the agent API on the real configured X4 install (`G:\…\X4 Foundations`) and schemas (`F:\…\X4Mods\Schemas`):

1. **Packed `.cat/.dat` decoder** (`src/lib/x4CatDat.ts`). New X4 archive reader (parses `.cat` manifests, positioned reads into `.dat`, additive-catalog merge across base + DLC). Wired into the object index and the patch base-file loader. *Verified:* the object index went from **0 ships / 0 stations / 0 factions / 0 sounds** (loose-only) to **694 ships, 932 stations, 33 real factions (argon, boron, paranid, split, teladi, terran, xenon, khaak…), 3783 sounds, 1950 wares** across **64 archives**. `/api/patch/base-content` now resolves packed targets (e.g. `libraries/factions.xml` → 52 KB of real base-game content) instead of returning a "packed/unavailable" 404. This closes the P3 and P5 "packed cat/dat" gaps.
2. **Real XSD validation engine** (`src/lib/xsdValidate.ts`). Builds an element→attribute index from the actual `md.xsd`/`common.xsd` (**1478 elements**, with named-complexType and base-extension resolution), then validates generated MD/AI XML for **enum violations (error), missing required attributes (warning), unknown attributes (warning), and unknown elements (info)** with line numbers. Wired into `/api/agent/compile` and `/api/agent/package`. *Verified:* on a controlled bad sample it produced exactly the 3 intended findings with **zero false positives**; on the real default mod it surfaced genuine issues confirmed against `md.xsd` — e.g. `create_ship` does not accept a `faction` attribute (X4 uses a nested `<owner>`), and `<space>` is not a declared MD element. This is true schema-backed validation beneath the existing heuristics.
3. **X4-correct UI packaging.** The non-standard `md_ui_layouts/<id>_ui.xml` `<ui_menu>` output (which X4 ignores) is no longer packaged. The compiler now emits an extension-root `ui.xml` `<addon><environment type="menus">` index (format verified against the kuertee `x4-mod-ui-extensions` reference mod) plus a packaged `ui/<modId>.lua` entry point that registers via X4's real `Menus`/`Helper` pattern instead of the previous invented `RegisterLayout`/`RemoveAllUITriggers`. *Verified:* compiling a workspace with UI widgets now yields `ui.xml` + `ui/<modId>.lua` and no `md_ui_layouts`.
4. **Round-trip passthrough preservation** (`ModWorkspace.passthroughFiles`). Imported files the studio cannot model are preserved verbatim and re-emitted on export (generated output wins path collisions). New `/api/agent/mod-folder/import` (with a lossiness report) and `/api/agent/round-trip-check` + `round-trip-selftest` harness. *Verified:* the self-test imports a synthetic mod with unmodeled files (`libraries/god.xml`, a hand-authored `.lua`, an unknown top-level XML), exports, and confirms **lossless = true** — every unmodeled file survives byte-identical; previously they were dropped entirely.

**Newly surfaced (follow-up):** the XSD engine flags real non-schema output from the studio's own MD node templates — confirmed examples include `create_ship@faction` (X4 uses a nested `<owner>`), `<space>` (not a declared element), `set_object_shield@percent`, and `reward_player@notification`. The exact count varies by workspace (the default mod shows ~2); the point is that the studio's MD generator emits attribute/element names that don't match `md.xsd`. Fixing the node templates to match the schema is the natural next step now that detection exists.

Diagnostic endpoints added for agents/devs: `/api/agent/catdat-debug`, `/api/agent/xsd-debug`, `/api/agent/round-trip-selftest`.

### Next priorities (ranked, post 2026-06-11)

The four engines that landed are *detection and plumbing*. The highest-value remaining work turns that detection into correct, visible output. Ranked by leverage toward the North Star ("a studio-built mod runs in X4 with zero hand-editing"):

1. **Make the MD generator schema-valid (close the loop on the XSD engine).** *Highest leverage.* The validator now proves the studio emits non-schema MD (`create_ship@faction`, `<space>`, `set_object_shield@percent`, `reward_player@notification`, …). These are exactly the silent in-game failures the tool promises to prevent — and the studio is *generating* them. Audit `NODE_TEMPLATES`/`generateMDXML` against `md.xsd`, fix attribute/element names, and re-run validation until the default and fixture mods report **zero** schema errors. Tight verify loop (the engine is the test). This is the difference between "we detect invalid mods" and "we can't produce one."
2. **Surface diagnostics in the UI with click-to-navigate.** The `{severity, domain, filePath, sourceRef, line}` diagnostics exist via `/api/agent/compile` but the Mod Doctor panel still needs grouping-by-file and a click that jumps to the owning node/widget/patch. Without navigation, findings are noise; with it, #1 becomes self-service.
3. **Feed the object index into editor dropdowns.** The index now has real ships/stations/factions/wares/sounds, but node-property fields are still free-text. Wire `create_ship.macro`, owner/faction, ware/job ids, and patch targets to searchable pickers backed by `/api/agent/object-index`. Converts the indexing win into visible user value and kills a whole class of typo bugs.
4. **Round-trip breadth + golden corpus.** Passthrough makes import lossless, but t-files/diffs/aiscripts are only partially parsed into editable form. Parse more domains, add generated/editable/partial/passthrough badges in the file tree, and run `/api/agent/round-trip-check` across 3+ real published mods as a standing regression.
5. **AI-script validation against `aiscripts.xsd`.** The XSD engine currently validates AI scripts using the MD/common index (wrong schema). Add `aiscripts.xsd` to the schema config and validate AI output against it specifically.
6. **Fix the patch-builder default target.** `libraries/ship_macros.xml` is a guess that doesn't exist in X4 (verified 404). Change the default to a real file (e.g. `libraries/wares.xml`) and surface XPath match-count diagnostics into Mod Doctor.

**Recommendation:** do #1 then #2 as a pair — fix the generator and make the proof visible — before adding more surface area. Everything else (3–6) is valuable but secondary to closing the validity loop the studio's whole pitch depends on.

- **Completed:** Sidebar Resizing and Visual Refactoring. The left sidebar and right code-preview aside are now fully resizable with drag-to-resize handles. The sidebar navigation was overhauled into a vertical icon strip, and all panels (MD Nodes, Cues, Widgets, Mod Meta, Filesystem, Source Control, Templates) were visually modernized to be compact and premium.

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

### Verification snapshot — current app feature match

Checked against the running browser app at `http://127.0.0.1:3000/` and current source code on 2026-06-10. This is a product-surface assessment, not a claim that each feature is complete.

| Recommendation | Current match | Confidence | Existing surfaces | Remaining gap |
|---|---:|---:|---|---|
| **Schema-Aware Mod Doctor** | Strong | 95% | `src/lib/modDoctor.ts`, **`src/lib/xsdValidate.ts` (real XSD element/attribute/enum/required + child-element index, 1478 elements)**, **schema-valid MD generator**, **aiscripts.xsd validation path**, `/api/agent/compile`, `/api/agent/package`, `/api/agent/md-audit`, `/api/agent/xsd-lookup`. | **2026-06-11 (2nd pass):** drove the MD generator to **zero** schema violations — audited every node template + curated branch via `/api/agent/md-audit` and fixed each against md.xsd (`check_value` min/max/exact not operator/value2; `create_ship` `<owner>` child + `sector` attr, no `faction`/`<space>`; `create_station` required `owner` attr; `reward_player` money-only; `show_help custom`; `show_notification timeout`). AI scripts now validate against `aiscripts.xsd` when present (never the wrong MD schema). Remaining 5%: full sequence/cardinality validation and click-to-navigate UI (tracked separately). |
| **Live Game Feedback Loop** | Partial | 58% | `PlaytestWorkspace` debug/reload instructions, `/api/gemini/analyze-log`, `/api/agent/game-log/status`, deploy metadata from `/api/agent/deploy`, configured `x4GamePath`, deterministic `debuglog.txt`/`uidata.log` tail classification. | Needs deploy-session markers visible inside X4 logs, automatic mapping from parsed game errors into Mod Doctor sourceRefs, optional user-configured log path, and proof that X4 has seen the deployed extension after reload. |
| **Real X4 Object Browser** | Strong | 82% | `src/lib/x4ObjectIndex.ts`, **`src/lib/x4CatDat.ts` (packed `.cat/.dat` decoder)**, `/api/agent/object-index`, `WikiBrowser` Local Object Browser, schema-derived MD templates, configured game/mod paths, fallback constants. | **2026-06-11:** packed `.cat/.dat` archives are now decoded (base game + DLC), so ships/stations/factions/wares/sounds index from the real install (verified 694/932/33/1950/3783 across 64 archives) rather than fallback constants. Remaining: node-property dropdowns should consume the index directly in every editor tab, and per-object detail views (DLC source, used-by-workspace links). |
| **Round-Trip Import/Edit/Export** | Strong | 90% | passthrough preservation, importer with **generated/editable/partial/passthrough/binary classification**, **per-domain regeneration gating** (only regenerate what was parsed), `/api/agent/mod-folder/import`, `/api/agent/round-trip-check` + `round-trip-selftest`. | **2026-06-11 (2nd pass):** the importer now classifies every file and, crucially, **disables regeneration of domains it could not parse** so their files are preserved byte-identical instead of being overwritten by empty output. Verified lossless incl. file *content* (unparsed MD, libraries, unknown files all survive byte-identical). Remaining 10%: editability *breadth* — parsing t-files/wares/jobs/aiscripts into editable graphs (a parser effort) and a golden corpus run across several real published mod folders (needs the user to point at real mods). |
| **Diff-Safe Patch Builder** | Strong | 97% | `XMLPatchSystem`, `compileDiffDocument`, `pos` + XPath validation, packed/loose base loaders, **server-side `runPatchDiagnostics`** (target resolution + selector-root sanity), client-side XPath match counting, unified diff previews. | **2026-06-11 (2nd pass):** changed the bogus default target `libraries/ship_macros.xml` (which 404s — that file doesn't exist in X4) to a real one, and added server-side patch diagnostics into `/api/agent/compile`/`package`: each patch's target is resolved against base-game files (loose then packed, preferred over the mod's own output) and the selector root is sanity-checked against the base file's root element. Verified via `/api/agent/patch-audit` (resolved / unresolved / root-mismatch all fire). Remaining 3%: full server-side XPath match counts (needs an XPath lib dependency). |
| **Agent-First Automation API** | Strong | 95% | `/api/agent/schema`, `/api/agent/workspace` (+ `expectedVersion`/`dryRun`), **`/api/agent/workspace/merge`** (JSON-merge-patch), **`/api/agent/diagnostics`**, `/api/agent/compile`, `/api/agent/package`, `/api/agent/deploy`, `/api/agent/generate`, `AgentBridge`. | **2026-06-11:** added optimistic concurrency (`expectedVersion` → 409 `version_conflict`), dry-run mutations (validate + diagnostics without applying), granular JSON-merge-patch edits, and a read-only current-diagnostics endpoint. Verified end-to-end via `/api/agent/api-selftest` (dryRun / versionConflict / mergeApply all pass). Full agent loop — read schema → read workspace → dry-run → merge → diagnostics → deploy — is closed without touching the UI. |
| **Mod folder situational awareness** | Strong | 95% | `SETTINGS`, `FILESYSTEM`, `SOURCE`, `SYNC MOD`, snapshots/history, compile/deploy path configuration, directory explorer, **importer file classification + counts**. | **2026-06-11:** generated/editable/partial/passthrough/binary classification now computed per file in `/api/agent/mod-folder/import` and tied directly to round-trip safety (each class maps to a preservation guarantee). Remaining 5%: surface the class badges in the file-tree UI. |

**Interpretation:** the app already has a credible X4 text-mod IDE shell. The highest-value work is not adding more tabs; it is deepening correctness engines behind the existing surfaces.

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

**2026-06-10 implementation note:**
- Added `src/lib/modDoctor.ts` as the shared package diagnostic pass for manifest metadata, MD, UI preview risk, AI scripts, wares, jobs, t-files, XML patches, compile settings, and `includeInBuild` exclusions.
- `/api/agent/compile` and `/api/agent/package` now return package-wide diagnostics with optional `code`, `domain`, `filePath`, and `sourceRef` metadata.
- `CodePreview` now labels the panel `PACKAGE MOD DOCTOR (DIAGNOSTICS)`, calls the agent compile API, and shows whether diagnostics came from the API or local fallback.

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

**2026-06-10 implementation note:**
- Added `/api/agent/game-log/status?modId=<id>` to locate and tail known `debuglog.txt`/`uidata.log` paths, including the discovered `Documents\Egosoft\X4\<profile>\debuglog.txt` location.
- `/api/agent/deploy` now records last deploy metadata; log status reports `stale` only when the matching mod was deployed after the selected log changed.
- `PlaytestWorkspace` now shows a deterministic Live X4 Log Status card with clean/stale/warning/error/no-log classification, selected log path, active issue count, and a manual refresh button.
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

**2026-06-10 implementation note:**
- Added `src/lib/x4ObjectIndex.ts` to scan loose XML roots from configured X4 paths and mod workspace paths.
- Added `/api/agent/object-index?q=<query>&kind=<kind>&limit=<n>` returning `{roots, scannedFiles, skippedFiles, counts, items}` for ships, stations, wares, factions, sounds, jobs, AI scripts, generic macros, and schema-derived MD elements.
- Updated `/api/agent/schema` to advertise the object-index endpoint and response shape for external agents.
- Updated the Wiki/Codex Reference tab into a Local Object Browser with index counts, searchable rows, source-file display, copy buttons, and fallback constants when the local loose-file index has no rows for a category.
- Verified on the current machine: the loose-file scan indexed 101 XML files from 2 roots, including 78 wares, 357 jobs, 5 AI scripts, 16 generic macros, and 1207 MD schema elements. Ship/station macro rows still rely on fallback constants because this install's ship assets are packed rather than loose XML.

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

**2026-06-10 implementation note:**
- `CodePreview` now treats generated XML as an editable code surface instead of a read-only preview. Full `MD.xml` edits can be applied back into the workspace through the existing parser-backed import path.
- Selected-node preview is hierarchy-aware: selecting a cue renders that cue subtree; selecting an event, condition, or action renders a synthetic preview cue containing the selected node and downstream linked nodes.
- Snapshot/diff mode now uses a split editor model: the reference/snapshot side stays read-only, while the latest working side is editable in-place.
- The live XML editors now render syntax-highlighted XML underneath the editable textarea, giving IDE-style coloring for tags, attributes, string values, and comments while preserving native textarea editing.
- Current safety gate: partial hierarchy edits are editable and copyable, but applying them back into the full workspace is blocked until there is a lossless partial-graph merge. Full MD apply is the verified safe path.
- Browser verification on `http://localhost:3000/`: generated XML editor rendered, parser-backed full MD apply worked and was restored, event/action selection changed the XML preview hierarchy, split diff showed `EDITABLE WORKING STATE`, the right split pane accepted edits, syntax-highlight spans rendered for tags/attributes/strings/comments, and no browser console errors or Vite overlays appeared.

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

**2026-06-10 implementation note:**
- Added `/api/patch/base-content` in `server.ts` to locate and read game base files across the workspace, main game install, and enabled extensions.
- Integrated browser-side `DOMParser` and `document.evaluate` to count XPath matches (reporting 0, 1, or many matches) and report invalid selector syntax in real-time.
- Implemented a client-side RFC 5261 patch application algorithm in the DOM to execute proposed block changes (supporting `add`, `replace`, and `remove` actions).
- Added support for the position (`pos="before|after|prepend|append"`) selector attribute inside both the React UI editor and compiler.
- Created a tabbed sidebar in the right-hand panel, toggling between **Patch XML** (raw compiled diff XML) and **Applied Preview** (unified diff snippet with surrounding lines of context).
- Enabled block-level warning/error messaging to report selector validation and content syntax problems on individual card items.

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
| **content.xml / packaging** | `extensions/<id>/content.xml` | ✅ Correct core | Root attrs, `date=YYYY-MM-DD`, `save`, `enabled`, `<text language="44">`, lowercase `<id>` all good. **Fixed 2026-06-11:** `toContentVersion` now uses numeric `version × 100` conversion (`"2.5"→"250"`, `"0.25"→"25"`), verified through `/api/agent/compile`. Remaining enhancement: no `<dependency>` support yet (other extensions / DLC gating). |
| **MD scripts** | `md/<id>.xml` | ✅ Correct | `noNamespaceSchemaLocation="md.xsd"`, folder, cue tree all valid. Most mature compiler. |
| **UI layouts** | `ui.xml` (extension root) + `ui/<id>.lua` | ✅ Fixed 2026-06-11 | **Reworked to X4-correct packaging.** The packager now writes an extension-root `ui.xml` `<addon><environment type="menus"><file name="ui/<id>.lua"/></environment></addon>` index (format verified against the kuertee `x4-mod-ui-extensions` reference mod) plus a packaged `ui/<id>.lua` entry point that registers through X4's real `Menus` table + `Helper.registerMenu` pattern (guarded so a missing global fails soft). The previous non-standard `md_ui_layouts/<id>_ui.xml` `<ui_menu>` output (which X4 ignored) is no longer packaged — `generateUIXML` is retained only as a design-time descriptor for the in-app preview. The invented `RegisterLayout`/`RemoveAllUITriggers` calls are gone. Remaining enhancement: the Lua's `onShowMenu` widget construction is scaffolded with widget metadata; building actual widgets via `widgetSystem` and in-game verification is the next step (Mod Doctor now emits an info diagnostic saying exactly this). |
| **AI scripts** | `aiscripts/<name>.xml` | ✅ Correct core | `aiscripts.xsd` ref + `<params>/<attention>/<actions>` structure broadly right. **Verified 2026-06-11:** local `aiscripts.xsd` requires `<param type=...>`, so that warning was stale. **Fixed 2026-06-11:** the shared compiler and AIScript preview no longer inject a hidden `<wait exact="5s"/><resume label="start"/>` loop into every script; generated actions now reflect only explicit user-authored behavior. Remaining enhancements: richer order-block support and deeper schema coverage for advanced AI commands. |
| **Wares** | `libraries/wares.xml` (`<diff><add sel="/wares">`) | ✅ Correct core | Diff-as-file pattern is **correct** (X4 detects `<diff>` root and patches base `libraries/wares.xml`). **Fixed 2026-06-11:** the compiler no longer fabricates `ore`+`energycells` or hardcoded `tags="economy equipment"` for every ware. Tags, production method/name, and primary input wares are now explicit editable fields; missing inputs produce Mod Doctor warnings instead of hidden fake data. Remaining enhancement: richer schema-aware ware editor for advanced production methods/effects. |
| **Jobs** | `libraries/jobs.xml` (`<diff><add sel="/jobs">`) | ⚠️ Valid shape, thin | Diff pattern correct. But `<expiration>`, `<loadout><level>`, `<modifiers>` hardcoded; `tags="military <shipClass>"` uses shipClass as a tag (approximate). Real jobs schema is much richer (basket, environment, location, orders). Approximation only. |
| **Translations** | `t/0001-l<lang>.xml` | ✅ Correct core | `<language id><page id><t id>` structure correct. **Fixed 2026-06-11:** translation filenames now normalize to lowercase, zero-padded paths (`0001-l044.xml`, `0001-l049.xml`) across the shared compiler, server package manifest, deploy writer, import paths, Mod Doctor, and UI help text. Remaining enhancement: no guard pushing custom page IDs into a high range to avoid clobbering vanilla strings. |
| **XML diff patches** | `<targetFile>` (`<diff>` w/ `add`/`replace`/`remove sel=`) | ✅ Correct core (updated) | Matches the documented patch convention (XPath `sel`, three ops). **Reconciled 2026-06-11 (was stale vs P5):** `pos="before\|after\|prepend\|append"` on `<add>` is implemented in both the editor and `compileDiffDocument`; client-side XPath validation reports 0/1/many matches and invalid-selector syntax against the resolved base file; and base-file resolution now works for **packed** targets too (`/api/patch/base-content` decodes `.cat/.dat`). Remaining: the default target `libraries/ship_macros.xml` is still a guess (that file does not exist in X4 — verified: `/api/patch/base-content` returns 404 for it), so the default should be changed and per-domain XPath diagnostics surfaced into Mod Doctor. |

**Reading of the table:** the *diff-based* domains (wares, jobs, patches) are structurally on the rails but emit placeholder content; the *UI* domain is split — it already has a Lua path pointed at the right place (`/ui/`) but doesn't package it, while the thing it *does* package (`md_ui_layouts/<ui_menu>`) is non-standard; `content.xml` has a real version bug; MD is solid. So A4 isn't just "move code" — it's "move code **and** fix these per-domain correctness issues as you go," with the round-trip + XSD harness (A1/A2) as the safety net that proves each fix.

---

## Sources
- [Egosoft Wiki — Modding Support](https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/)
- [Egosoft Wiki — h2odragon's HOWTO-hackx4f](https://wiki.egosoft.com/X4%20Foundations%20Wiki/Modding%20Support/ScriptingMD/Community%20Guides/h2odragon's%20HOWTO-hackx4f/)
- [Steam — Workshop for X Rebirth and X4 (content.xml / version)](https://steamcommunity.com/sharedfiles/filedetails/?id=245117855)
- [kuertee/x4-mod-ui-extensions — content.xml example](https://github.com/kuertee/x4-mod-ui-extensions/blob/master/content.xml)
