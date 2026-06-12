# X4 Mod Studio — Prototype Validation Roadmap

**Status:** Active · **Phase:** correctness done → ergonomics + in-game capstone · **Read [Current State](#current-state) first.** Everything below the *Archive* divider is append-only history kept for the audit trail; where it conflicts with Current State, Current State wins.

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

## Current State

*Authoritative snapshot — updated 2026-06-11 (9th pass). This is the one place to read for where the project is and where it's going. The dated changelogs in the Archive below are the verification record; where they conflict with this section, this section is correct.*

**Where we are.** The correctness backend is built and proven. The project has moved from *"can it work / is it correct?"* to *"is it ergonomic, and can a **new** non-trivial mod be built start-to-finish and proven in-game?"*

**Milestones**
- **M0 — Foundation gate: CLEARED.** API binds `127.0.0.1`, CORS locked, per-session token auth, env provider-keys gated to app-origin requests, honest success messages (real post-validation counts + surfaced self-heal errors).
- **M1 — Loop closes once: DONE** (user-confirmed in-game). Author → compile → package → deploy to `extensions/` → loads and runs.
- **M2 — Loop trustworthy: LARGELY DONE.** Round-trip lossless, `md-audit` 0 findings, XSD + semantic reference validation (macros/wares/factions/time-format), patch diagnostics. Residual: round-trip *editability* breadth (wares/jobs/aiscripts are preserved passthrough, not yet editable graphs).
- **M3 — Prototype validated: OPEN — the capstone.** Gated on **C2**: a new non-trivial mod built entirely in-studio, run in X4, documented. Human-in-the-loop.

**Done & verified** (selftest oracles all green at last check: `/api/agent/selftest` 10/10 · `extension-doctor-selftest` 11 checks · `round-trip-selftest` lossless · `md-audit` 0 · `db-selftest` pass + live parity). Highlights: deadair-scale mods (1,294 nodes) load without freezing; Extension Doctor complete (missing deps, duplicate ids, full-file + diff-selector + XPath-level overlap, load-order winner simulation, click-through UI); SQLite cache live (cold boot **230 ms** vs **2,156 ms** full decode); aiscript-naming collision fixed at the compiler; dev-server split (backend edits don't reload the page); repo hygiene committed (`a5e070e`).

**Forward plan** (ranked by leverage toward the North Star — next code move is Tier 1):
1. **Ergonomics — object-index-backed editor dropdowns — DELIVERED** (11th–14th passes; only the SQLite read-flip remains, deferred/low-value). Free-text reference fields are now searchable typed pickers backed by the live index, so an invalid reference *can't be typed*: `create_ship`/`create_station` macro + faction, `reward_player` faction, Wares & Jobs job faction, ware production inputs, and the XML-patch target file. Highest leverage — makes the trustworthy backend *felt* on every node. (Report pains #1/#2.)
2. **Distribution & update safety — P-B → P-C → P-D.** content.xml `<dependency>` metadata + resolve-check (P-B, the prerequisite) → mod profiles / modset switching (P-C) → update-audit scan, "re-validate my mod against the current game version" (P-D). (Pains #8/#3.)
3. **IDE breadth — round-trip parsers + reference layer.** Editable wares/jobs/aiscripts parsing; flip reference-validation / Extension-Doctor reads to SQLite; P-E in-app searchable scriptproperties/MD-action reference + hover docs + quickstart gallery. (Pains #1/#2/#4.)
4. **Capstone — C2 in-game verification (human).** Build a new non-trivial mod in-studio, deploy, confirm it runs in X4 with zero hand-editing, document it → validates M3.

Smaller carried items: demote/collapse the chatty `ext.folder_id_mismatch` infos in the UI. (Analyze-latency UX is already handled: 120s timeout + Cancel.)

**Environment (still true — read before editing).** Split dev servers: Vite on **3000** (UI/HMR, browser-facing), API on **3001** (`tsx watch`, `API_ONLY=true`). Editing `server.ts`/`src/lib/*` restarts only the API (~2-3s `/api` 503 gap); the page does **not** reload; frontend edits are pure HMR. **Verify in the browser + selftest endpoints, not bash `tsc`/node** — the bash sandbox is a stale mirror and can't run the Windows-native `node_modules`; host Read/Edit/Write are live. The AI-editing pipeline has truncated component files before — re-verify in-browser right after any large component edit.

---

## Capability gaps & upgrade levers (studio authoring coverage)

*Added 2026-06-11. Generalized from a deep stress-test of the studio against ambitious mod classes (full MD logic, rich custom UI, and mods that integrate with an external local process). This is about where the studio's **authoring coverage** ends and what closes it — it is mod-agnostic.*

**Scope line.** The studio's job is the **X4 extension** — `content.xml`, MD, aiscripts, wares/jobs, t-files, XML patches, and the HUD/Lua UI. External processes, apps, and runtimes (of any language) are a different product and stay outside the studio. Within the X4-extension surface, coverage is already high; the gaps below are the studio-side levers that close the rest.

**Lever 1 — MD vocabulary breadth (highest leverage, lowest risk).** The MD node palette exposes a curated ~15 `NODE_TEMPLATES`, but `md.xsd` has **1,478 elements**. Most advanced MD — game-state reads, faction-relation get/set/modify, money, logbook entries, `raise_lua_event` / `signal_cue`, blackboard ops, comm/notification, world-state conditions — is **not a node today** and falls to the custom-XML escape hatch (the studio acts as a validating XML editor, not a visual builder, for those). *Lever:* auto-generate **schema-driven nodes/forms for the full `md.xsd` vocabulary**, wired to the reference pickers already shipped (macro/faction/ware/patch-target). The schema index (`xsdValidate.ts`, 1,478 elements with attributes/types/enums/required) already has everything needed to drive this — it's "expose more of the schema we already parse as editable, validated forms." This converts "raw XML for most MD" into "every MD element is an editable node with validation + pickers," and it benefits **every** MD mod. Natural successor to the object-index pickers.

**Lever 2 — external-integration / contract seam.** A class of advanced mods talks to an **external local process over HTTP** (via a Lua HTTP library running inside X4). The studio doesn't model that integration today. *Lever:* treat the **X4 ↔ external HTTP/JSON contract** as a first-class artifact — endpoints + request/response shapes, validated so both ends can't drift — and **generate the glue Lua** (call the HTTP library, handle the async callback, route results to/from MD via Lua events). The studio never authors the external process itself; it owns the X4 side and the contract. General to any external-integration mod. *(Increments 1–3 delivered & live-verified: contract model + validator + glue-Lua generator (18th), interactive Contracts editor + persistence + `ui/<id>_http.lua` packaging (19th), and the matching MD cue scaffold generator + `md/<id>_http.xml` packaging + Lua/MD preview toggle with an 18-check self-test (21st). The seam is end-to-end.)*

**Lever 3 — Lua/UI editor edge-hardening (mostly verify + templatize).** **Correction to earlier docs:** the appendix's "UI is scaffolded, widget construction is the next step" note is stale and misleading — it describes only the *auto-packaged* `ui/<id>.lua` stub path. The interactive **HUD & LUA UI** tab already provides a real widget library (window frames, data tables, macro buttons, progress bars, labels, selectors, text inputs, dialogue/chat logs), a **Layout GUI Designer**, a **Lua Script Event Manager**, and a **syntax-validated Lua editor**, and these produce working in-game Lua/UI (user-confirmed). So the UI gap is much smaller than previously documented. *Lever:* harden/templatize the harder Lua patterns (async HTTP callbacks; UI-extension comm/menu hooks) and verify the editor's coverage of them, rather than building UI authoring from scratch. *(Increments 1–2 delivered & live-verified: editor coverage verified + a vetted `luaSnippets` library with a 15-check self-test and public endpoint (20th pass), and the patterns wired into the HUD & LUA UI Lua view as selectable/viewable/copyable entries (22nd pass). Lever 3 verify+templatize is complete.)*

**Net.** With Lever 1 the studio covers essentially the **entire X4-extension authoring surface**; Levers 2–3 make external-integration mods first-class. **Ranked: Lever 1 first** (highest leverage, lowest risk, extends the schema index + pickers, benefits every mod), then Lever 2, then Lever 3 (largely verification/templatizing). The hard boundary — external processes/runtimes themselves — stays out by design; the studio owns the X4 extension and the integration contract.

## Future direction — Tier 2: visual depth & live debugging (proposed 2026-06-11)

*Beyond the three levers (now delivered), the next frontier raises the studio from "authors every X4-extension artifact correctly" to "author + analyze + debug visually." Three proposals, with honest feasibility. None breaks the scope boundary (the studio owns the X4 extension; it reads X4's own outputs but never authors an external runtime). Suggested order: T2 → T3(increment 1) → T1, by tractability-vs-leverage.*

**T1 — Drag-and-drop WYSIWYG Lua UI canvas builder.** *Build on:* the existing UI Widgets Library + Layout GUI Designer + `UIWidget` model + `generateUILuaScript`. *The addition:* a responsive snap-grid canvas where the user drags widgets (windows, tables, buttons, sidebars, progress bars, labels, logs) into a blueprint frame and the studio compiles the layout to coordinate/row-cell tables and the widget-construction Lua. *Honest hard part:* X4 builds UI at runtime through the `Helper`/widgetSystem/ftable API, not static coordinate tables — today's `generateUILuaScript` deliberately stubs widget construction rather than fabricate calls. So the real work is a **layout-descriptor → working-in-game-Lua compiler**, which needs C2-style in-game verification to trust. *First increment:* a grid/snap canvas that emits a **validated layout descriptor** (widget types, grid positions, bindings) decoupled from codegen — get the descriptor + its self-test solid before the runtime-Lua emit. *Risk:* medium-high (the codegen half); the canvas half is low-risk and immediately useful as a layout planner.

  *Scoped increments (T1):*
  - **T1.1 — layout-descriptor engine + oracle.** A pure `src/lib/uiLayout.ts`: a grid `UILayoutDescriptor` (rows/cols + widgets with id/type/row/col/span/label/binding), `validateUILayout` (unique ids, valid widget types, in-bounds positions, **no overlaps** via a grid-occupancy check), and `generateLayoutLua` that emits a Lua **descriptor table** the menu's createMenu hook consumes (honest — it does not fabricate Helper/widgetSystem calls; X4 builds the widgets from the table). `runUILayoutSelftest()` + a public `GET /api/agent/ui-layout-selftest`.
  - **T1.2 — snap-grid WYSIWYG canvas.** A drag/drop grid surface (reusing the existing UI Widgets Library) where widgets snap to cells; live overlap/bounds highlighting from the validator; the descriptor persists on the workspace and previews its generated Lua.
  - **T1.3 — working in-game widget Lua.** Grow the descriptor-table emit into real `Helper`/ftable row-cell construction, gated behind C2-style in-game verification (this is the genuinely hard, fabrication-prone half).

**T2 — Visual cue-dependency tree + broken-lineage analysis** (most tractable, highest near-term leverage). *Build on:* the MD node canvas, `nodeToCueMap`, the existing Dependency Graph panel (relies-on / required-by), and the reference-validation engine. *The addition:* a renderable cue-dependency tree (parent cue → child cues; `signal_cue` / `event_cue_signalled` edges) that highlights **broken lineage in red** — a cue whose parent/trigger can't be satisfied structurally. *Honest limit:* "a parent condition is *never met*" in the general case is runtime/satisfiability-dependent and statically undecidable; scope to **structural** lineage — missing or duplicate parent cues, dangling event/signal references, cues with no reachable trigger path, references to cues that don't exist — which covers the large majority of real MD logic bugs and is fully detectable from data the studio already has. Flag heuristic (non-structural) cases distinctly rather than over-claiming proof. *First increment:* the tree view + structural lineage diagnostics surfaced as red edges, reusing `nodeToCueMap` + reference validation; add a `cue-lineage-selftest` oracle. *Risk:* low — static analysis over existing in-memory data, additive UI.

  *Scoped increments (T2):*
  - **T2.1 — Lineage engine + oracle (this pass).** A pure `src/lib/cueLineage.ts` over `{nodes, links}`: builds the cue tree (cue `properties.name`; root = not targeted by an `out_sub` link; parent→child via `out_sub`→`in_flow`; trigger events via the cue's `out_cond` links; cross-cue *listens* from `event_cue_signalled.properties.cue`; cross-cue *signals* parsed from `custom_xml` `properties.rawXml` `signal_cue`/`reset_cue`/`cancel_cue` `cue="…"`). Structural findings: duplicate cue name, unnamed cue, dangling **local** cue reference (conservative — only bare single-identifier refs, `this.`-stripped, that match no local cue; dotted/`md.`-qualified refs are treated as external and never flagged to avoid false positives), orphan/unreachable cue (no trigger event, no parent, not signalled by anyone), and dangling links (source/target node id missing). Plus `runCueLineageSelftest()` and a public `GET /api/agent/cue-lineage-selftest`.
  - **T2.2 — Tree UI + red broken-lineage.** Render the cue tree (parent→child + listen/signal edges) in the Diagnostics Hub (or an MD-tab panel); colour broken-lineage edges/nodes red with click-to-focus the offending node, reusing the existing Dependency-Graph focus + reference-validation patterns.
  - **T2.3 — Promote signal/reset/cancel to first-class nodes (optional).** Today they live only in `custom_xml` rawXml; adding curated templates (with a cue reference picker) would let the analyzer read structured props instead of parsing rawXml, tightening both authoring and analysis.

**T3 — Real-time log diagnostic binding & telemetry socket** (highest debugging value; biggest, most fragile; depends on T2). *Build on:* the Diagnostics Hub, the studio's filesystem access, and the Lever 2 bridge pattern. *The addition:* bind the Diagnostics Hub to live game execution — read X4's running log dynamically and **illuminate the corresponding cue node** in the T2 tree as triggers fire, giving a real-time visual debug stream. *Two feeds:* (a) tail X4's debug-log file and parse cue-execution / `debug_text` lines, or (b) push telemetry over the existing HTTP bridge / UI-triggered-event path. *Honest risks:* X4's log format is not a stable public contract (version-fragile parsing); log volume/perf; and correlating a log line back to a specific cue node requires identifiable markers. *Key synergy:* the studio controls its **own** generated MD/cues, so it can inject deterministic correlation tags into what it emits — meaning T3 can start reliably on the studio's own output before attempting to parse arbitrary third-party logs. *First increment:* a log-tail reader + parser for the studio's own emitted debug markers, lighting up the matching node in the T2 tree. *Risk:* medium-high (format fragility); gate the parser behind the studio's own tagging first. *Dependency:* needs T2's tree to illuminate.

  *Scoped increments (T3):*
  - **T3.1 — log-telemetry parser engine + oracle.** A pure `src/lib/logTelemetry.ts`: parse raw X4 debug-log text into structured entries (timestamp, category, severity ERROR/WARNING/INFO, message), and **correlate** each entry to workspace cue names (substring match against the cue list) plus a deterministic `[MDStudio] cue=<Name>` marker convention for unambiguous correlation. Returns entries + a per-cue summary (fired? error count). `runLogTelemetrySelftest()` over synthetic log text + a public `GET /api/agent/log-telemetry-selftest`. Pure, testable, no game required.
  - **T3.2 — bind to the cue-lineage tree.** A 'paste / load log' input (in the Scanner or Playtest panel) feeds the parser; cues that appear in the log glow (fired), error-correlated cues turn red in the T2 tree — the real-time visual debug stream, driven by static log text first.
  - **T3.3 — live file tail (later, human-in-loop).** Watch a running game's debug-log file via the studio's filesystem access and stream entries into T3.2 as they arrive. Gated behind the studio's own deterministic markers first (format fragility); needs the game actually running.

**Net.** T2 is the clear first move (static analysis on data already in memory, low risk, high leverage for MD debugging). T3's first increment naturally follows (it lights up T2's tree from the studio's own deterministically-tagged cues). T1 is high-value but carries the heaviest codegen and is best sequenced last or in parallel as a layout planner that grows into a Lua compiler. All three remain inside the scope boundary: the studio authors and analyzes the X4 extension and reads X4's own outputs; it never authors an external runtime.

---

# Archive — historical context (append-only; Current State above wins)

*Everything below predates or feeds the Current State section: the original Tracks/Milestones framing, the per-pass dated changelogs (the verification record), and the design rationale. Kept for the audit trail. Where any of it reads as "to-do" but Current State says done, Current State is correct.*

---

## Tracks (parallelizable)

> **[SUPERSEDED]** Tracks A and B are largely complete (see Current State / M0–M2); C2 remains the open capstone. Retained for original framing.

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

> **[STATUS]** M0 cleared · M1 done (in-game confirmed) · M2 largely done · M3 open (C2 capstone). See Current State for detail.

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

### Changelog — 2026-06-11 (2nd pass: drive every backend item toward 95%)

All verified live in the browser against the running studio (most via public read-only self-test endpoints navigated directly in the browser; UI surfaces confirmed by screenshot — Object Browser showing **Ships (694)** from packed decode, Mod Doctor showing **API-INTEGRATED** schema diagnostics with file+line+sourceRef).

- **MD generator → schema-valid (Mod Doctor 95%).** Audited every node template + curated branch via `/api/agent/md-audit` and fixed all 12 violations against `md.xsd`; verified **0 findings**. AI scripts now validate against `aiscripts.xsd` (or skip) instead of the wrong MD schema. Added child-element resolution to the XSD index. (`/api/agent/md-audit`, `/api/agent/xsd-lookup`.)
- **Patch builder (97%).** Replaced the non-existent default target `libraries/ship_macros.xml`; added server-side `runPatchDiagnostics` (target resolution loose→packed, selector-root sanity). Verified via `/api/agent/patch-audit` (resolved / unresolved / root-mismatch).
- **Agent API (95%).** Added `expectedVersion` optimistic concurrency (409), `dryRun` mutations, `/api/agent/workspace/merge` (JSON-merge-patch), and `/api/agent/diagnostics`. Verified via `/api/agent/api-selftest`.
- **Round-trip + folder awareness (90% / 95%).** Importer now classifies every file (generated/editable/partial/passthrough/binary) and **gates regeneration to only parsed domains**, so unparsed files survive byte-identical. Verified via `/api/agent/round-trip-selftest` (lossless incl. content).
- **Live game feedback (90%).** Added pipeline state model (Deployed → Seen-by-X4 → Loaded-cleanly → Runtime-errors), deterministic error→sourceRef mapping, and configurable `x4LogPath`. Verified via `/api/agent/log-selftest`. The final "X4 saw it" proof is the irreducible human in-game step.

- **Reference + runtime-format validation (from a real in-game playtest).** A deployed mod produced runtime errors the static checks missed. Added: (1) `runReferenceDiagnostics` cross-checks `create_ship`/`create_station` macros against the real object index — `ship_xen_i_destroyer_01_macro` (invalid: `_i_` is not an X4 size class) is now flagged as an **error before deploy** ("694 ship macros known"); (2) the generator now emits X4 time literals with units (`show_help duration="8s"`, not `"8"`, which X4 rejects as "not of type time"). Verified via `/api/agent/reference-selftest`. This is the live-feedback loop paying off: in-game errors → caught and prevented statically next time. (A third runtime error, "null is not a string", was a cascade from the missing ship — fixing the macro resolves it.)

### Changelog — 2026-06-11 (3rd pass: semantic validation, from playtest learnings)

Driven by a real in-game playtest that exposed runtime errors static checks missed. Verified via `/api/agent/{reference-selftest,type-probe,md-audit}`.

- **Schema-type probe finding:** X4 types ~10k MD attributes as permissive `expression`/`booleanexpression`, so the XSD alone can't catch runtime value errors — but reference attributes carry semantic types (`macroname`, `cuename`, `warename`, `faction`). Built validation on top of those.
- **Reference validation (schema-type-driven):** any `macroname`/`warename` attribute and any `faction.<id>` literal is now checked against the real game index (8616 macros / 1950 wares / 33 factions). Covers *every* element automatically, not a hardcoded list. Catches the exact class of error from the playtest (`create_ship macro="ship_xen_i_destroyer_01_macro"` → no such macro). Zero false positives on valid ids.
- **Time-format validation:** bare numbers on time attributes (`duration`/`timeout`/`delay`/`interval`) are flagged (X4 needs `8s`, not `8`).
- **Caught real template bugs:** the studio's own `create_station` default macro was `station_arg_defense_01_macro` (wrong: American spelling + wrong prefix; real is `defence_arg_tube_01_macro`) and `show_notification timeout="5"` lacked a unit — both fixed; `md-audit` returns **0**.

**Roadmap additions (this session):** value-type/runtime-format validation ✅, reference-validation breadth (macros/wares/factions) ✅, round-trip editability breadth — t-files now editable + byte-identical ✅ (wares/jobs deferred), and a consolidated **`/api/agent/selftest`** that runs all engines: **10/10 passing** (md generator 0 findings, macro/time/faction reference checks, agent concurrency, live-feedback logic, round-trip lossless, patch diagnostics).

**Honest residuals (not yet at 95%):** round-trip *editability breadth* (parsing t-files/wares/jobs/aiscripts into editable graphs — a parser effort) and the two **UI-wiring** slivers (diagnostic click-to-navigate; object-index-backed editor dropdowns) which live in React component files currently being edited by the Antigravity IDE agent — deferred to avoid clobbering concurrent work.

### Changelog — 2026-06-11 (4th pass: client stability + UI relocation, browser-verified)

Focus shifted from backend correctness engines to **client-side robustness** of the surfaces that consume them. All verified live in the browser against `http://localhost:3000`.

- **AI provider path fixed and verified.** The MD Scanner / AI-guide `/api/gemini/analyze` had been failing with OpenRouter `"User not found"` (an instant 401 from a bad key path) across every model (gemini, kimi, deepseek). Now returns **HTTP 200** with real structured analysis — confirmed twice in the live network log (model: `deepseek/deepseek-v4-pro` via OpenRouter). The multi-provider proxy (`callMultiProviderAI`) reaches the model and returns coherent flow/entity/insight output.
- **MD Scanner result-render white-screen fixed (`src/components/MDScanner.tsx`).** A successful analyze (200) was white-screening the *entire* app: deepseek occasionally returns a field as a string/object where the renderer expected an array (or `summary`/`triggerCondition` as a non-string), so a `.map()` threw or React hit "Objects are not valid as a React child" — and it escaped to a full unmount. Added an `asText()` coercion helper and `Array.isArray()` guards around `flowSteps`, `entityRegistry`, `tacticalInsights`, plus coerced `summary`/`triggerCondition` and every per-row field. *Verified:* analyze → 200 → full result renders (Summary, Activation Trigger, Logical Execution Flowchart with per-node plain-English steps), `#root` populated, no boundary error, no white screen.
- **MD Scanner + Playtest relocated to the left sidebar (`DiagnosticsHub.tsx`).** New self-contained hub owns its own analyze/log/sync state and lives in the left icon strip (SCANNER / PLAYTEST / DOCTOR tabs, each wrapped in `ErrorBoundary`); the right panel is now a clean code/diff viewer. SECTION 2 of `CodePreview` hidden.
- **Code-viewer error highlighting + dark theme.** Per-line diagnostic highlighting in the code block, an Antigravity-style error-tick gutter overlay, app-wide dark webkit scrollbars, and an "Ask AI" button that pipes diagnostics to the assistant. `highlightXML` attribute/tag regex order fixed (was leaking `class="…"` as visible text).
- **Dev-server reload churn diagnosed and fixed (split architecture).** Root cause of the constant full-page reloads: the app ran as a **single process** (`tsx watch server.ts` hosting Vite in *middleware mode* on port 3000), so any edit to `server.ts` or a shared `src/lib/*`/`src/types.ts` module restarted the whole process — tearing down Vite and force-reloading the browser (with a brief window of `Failed to fetch` 401s and a blank `#root`). Since the active correctness work lives in `src/lib`, this fired constantly. Two fixes: (1) **scoped both watchers** — `vite.config.ts` `watch.ignored` + `tsx watch --ignore` globs so app/doc/tooling writes (`.studio-api-token`, `.snapshots/`, `*.log`, `config.json`, `dist/`, `temp_import/`, `*.md`) stop triggering reloads; (2) **split the dev servers** — Vite now runs standalone on **port 3000** (UI + HMR, browser-facing, never restarts on backend edits) and proxies `/api` → a separate **API server on 3001** (`tsx watch server.ts` with `API_ONLY=true`, which skips the Vite middleware). A small dev-only Vite plugin injects the shared `.studio-api-token` into `index.html` so auth still works (guarded against double-inject in the combined fallback path). `restart-studio.bat` now launches both servers (kills 3000+3001 first) in their own windows. **Critical detail:** Vite's own watcher must *ignore the pure-backend entry files* (`server.ts`, `install_mod.ts`, `use_agent_api.py`) — the client never imports them, so Vite can't HMR them and would otherwise do a **full page reload** on every backend edit even in split mode. With those ignored, the API server (tsx watch) restarts on its own and the page is untouched. *Status: **live-verified** on the Windows host. Confirmed in-browser: Vite serves on 3000, token injected by the dev plugin (`tokenInjected: true`), `/api/schema/config` proxied to the 3001 API returns 200 with real config, and a page sentinel **survived** a `server.ts` edit (API restarted → 200, page did not reload) — the exact decoupling we were after.*

**Honest residuals (this pass):**
- **Analyze latency.** The structured-JSON analyze takes ~60–90s; the server's OpenRouter `fetch` has **no timeout**, so a slow/hung model leaves the panel spinning indefinitely. Add a server-side timeout + a client abort/cancel.
- **ErrorBoundary reliability.** The full-app unmount suggests the modified `ErrorBoundary` (`extends (React.Component as any)` with redundant `props`/`state` field declarations — fragile under esbuild `useDefineForClassFields`) may not always catch. The MDScanner fix held without touching it, but the boundary should be made provably catch-all (convert to a clean class-field `state` initializer) so the next bad model response degrades to a panel-level error card, not a blank app.
- **File-truncation hazard persists.** The concurrent AI editing pipeline has truncated component files (CodePreview twice) mid-session; treat every component edit as needing an immediate live re-verify.

### Changelog — 2026-06-11 (5th pass: large-mod performance — the deadair stress case)

**Motivation (from Ken):** the studio is *for* enabling ambitious mods like DeadAir's Dynamic Universe with fewer failure points — but it chokes loading mods at that scale. Stress case: `deadair_scripts/md/deadairdynamicuniverse.xml` = **868 KB / 12,632 lines / 162 cues + 52 libraries**, ~8,200 XML elements (2,108 `set_value`, 1,747 `do_if`), plus a second 536 KB MD file and a 372 KB jobs.xml.

Diagnosed the freeze as **pure frontend render/compute** (not a front↔back data-coupling problem — the file is trivial to move and fits in memory; the browser just can't paint thousands of nodes/lines at once, and two algorithms were super-linear). Three contained fixes, all HMR-applied with no console errors:

1. **`nodeToCueMap` rewritten O(cues × links × nodes) → O(nodes + links)** (`Canvas.tsx`). The old version ran a per-cue BFS that did a full `workspace.links.forEach` per visited node and a linear `workspace.nodes.find` per neighbor — recomputed on every node/link change (i.e., every drag). Now prebuilds a node-id `Map` + an undirected adjacency list (excluding parent→sub-cue boundary links) and BFSes with an index-pointer queue (no O(n) `Array.shift`). Same semantics, dramatically cheaper.
2. **Radar minimap capped** (`Canvas.tsx`). It painted one DOM dot per node (2,000+ divs recreated on every pan/zoom). Now `minimapNodes` keeps all cues (structural anchors) and samples the rest to ≤500 dots.
3. **Code-viewer large-file guard** (`CodePreview.tsx`). `highlightXML`/`highlightCode` ran three global regex passes over the *entire* file on every render. Above 100 KB they now return escaped-but-uncolored text (standard large-file IDE behavior) — the 868 KB MD stays readable/editable instead of freezing. (Minimap was already capped at 160 lines; line-number gutter already capped at 4,000.)

**The main node render was already viewport-culled** (`visibleNodes`), so that part was fine — the costs were the two algorithms above plus the whole-file highlight.

**Verification status: LIVE-VERIFIED.** Imported `deadair_scripts/md/deadairdynamicuniverse.xml` (867 KB) through the real frontend path (SYNC MOD → file import → `parseXMLToWorkspace` → `setWorkspace`). It reconstructed into **1,294 nodes / 1,293 links** and rendered **without freezing** — canvas interactive (scroll/pan moved the graph), code viewer showing the 7,455-line generated MD in monochrome (large-file guard confirmed active), minimap sampled, and **zero console errors**. This is the exact scale that previously killed the studio. (Separate follow-up surfaced: `/api/agent/workspace` takes ~seconds to serialize a 1,294-node workspace — backend serialization/polling cost, not the render freeze; candidate for the SQLite/persistence work.)

**Follow-up perf backlog (not yet done):** memoize the whole-file highlight + `computeLineDiagMap` with `useMemo` keyed on text; consider true line-windowing in the code viewer; profile the frontend `parseMDXML` itself on the 868 KB file; and (architectural) move the **object index / Extension Doctor / cat-dat decode** to a persistent **SQLite** store on the backend (it's a query-over-tens-of-thousands-of-records problem — the right place for a DB; the mod-being-edited stays in frontend memory).

### Changelog — 2026-06-11 (6th pass: Extension Doctor P-A — v1, in progress)

Starting the report's #1 near-term recommendation (cross-mod conflict scanning) now that the studio survives deadair-scale mods. Grounded against the real install: **34 extensions** in `G:\…\X4 Foundations\extensions` (deadair_scripts, the DLCs, sn_mod_support_apis, x4-mod-ui-extensions, etc.), with dependencies that cross-reference other mods by content id (e.g. `ws_2042901274` = sn_mod_support_apis) and at least one real catch visible by inspection: **deadair_scripts requires `DeadAir_Eco`, which is not installed.**

**v1 backend scope** — a single read-only endpoint `/api/agent/extension-doctor` that scans the whole `extensions/` folder and returns `{extensionsScanned, enabledCount, counts, findings[]}` using the existing diagnostic shape. Three checks:
1. **Dependency resolution.** Parse each `content.xml` `id` + `<dependency>` list; flag non-optional deps whose id resolves to neither another installed extension nor a DLC (error), optional ones as info. Reuses the cross-mod id map.
2. **Duplicate extension ids.** Two folders declaring the same `content id` → error (X4 loads only one).
3. **Cross-mod patch overlap.** Collect every `<diff>` `sel=` per mod keyed by the patched base path (e.g. `libraries/jobs.xml`); when ≥2 enabled mods patch the same target, report it — escalating to a warning ("load order decides the winner") when they share identical selectors. This is the "why this file won" insight the report asks for.

Builds entirely on existing helpers (`resolveXsdConfig`, `walkFilesRelative`, content/dependency parsing). v1 is backend + live verification against the real 34-mod folder; the Mod Doctor UI surface (grouping + click-through) follows once the scan is proven. Deliberately out of v1: full load-order simulation, XPath-level match overlap (needs an XPath lib), and DLC-content gating.

**Status: backend LIVE-VERIFIED** against the real install (`/api/agent/extension-doctor`, GET, read-only). Scanned **33 extensions (all enabled)**; result `{error:0, warning:0, info:1}`. The one finding is correct and non-trivial: *"DeadAir Scripts optionally depends on DeadAir_Eco (DeadAir Economy Overhaul), which is not installed"* — graded **info** because deadair marks it `optional="true"` (the dependency parser reads the optional flag, so it didn't false-alarm as an error). Duplicate-id and patch-overlap checks correctly returned nothing, cross-checked against the raw files: every `<diff>` base path (deadair's `libraries/jobs.xml`, `wares.xml`, `maps/*`, etc.) appears exactly once across all mods, so there are genuinely no cross-mod patch conflicts in this set — the zero is real, not a missed detection. The scan is accurate; the next step is surfacing it in the Mod Doctor UI (grouped findings + click-through) and adding a positive patch-conflict fixture to regression-test check #3.

**v1.1 scope (in progress) — hardening + UI:**
1. **Shared-path collision detection** (extends check #3). Beyond `<diff>` selector overlap, also flag when ≥2 enabled mods ship the *same base-game rel path* (e.g. two mods both providing `libraries/wares.xml`), which is a full-file override collision X4 resolves purely by load order. Diff-vs-diff stays a warning on identical selectors; full-file path collisions are a warning ("last loaded wins").
2. **`/api/agent/extension-doctor-selftest`** — synthesizes a temp extensions folder with deliberate faults (a required missing dependency, a duplicate id, and two mods patching the same `libraries/jobs.xml` with an identical selector) and asserts each check fires with the right severity. Positive regression test for all three checks, since the real folder happens to be conflict-clean. Mirrors the existing `round-trip-selftest` pattern (os.tmpdir).
3. **UI surface** — an "Extensions" view in the left-sidebar DOCTOR hub (`DiagnosticsHub`): a "Scan installed extensions" button calling `/api/agent/extension-doctor`, rendering grouped findings by severity with counts and per-finding file/message, matching the existing Mod Doctor styling.

Each piece is verified live before being marked done (selftest asserts the positive cases; the UI is confirmed in-browser against the real 33-mod scan).

**v1.1 backend status: LIVE-VERIFIED.**
- `/api/agent/extension-doctor-selftest` synthesizes a temp folder (missing required dep + duplicate id + two mods patching `libraries/jobs.xml` with identical selector + both shipping `t/0001.xml` and root `ui.xml`) and asserts **5 checks — 3 positive, 2 negative — all pass**: `dep.missing_required`, `ext.duplicate_id`, `patch.selector_collision` fire; `t/` translations and `ui.xml` manifests are correctly **not** flagged.
- **False-positive tuning (found via the real scan, then guarded by the selftest):** the full-file collision check initially flagged `t/0001.xml` (translations merge additively in X4, not override) and `ui.xml`/`content.xml` (per-extension root manifests, not base overrides). Both are now excluded; `index/` too (merged name→path maps).
- **Real 33-mod scan result:** `{error:0, warning:4, info:1}`, **zero false positives**. The 1 info is the optional `DeadAir_Eco` dep. The 4 warnings are genuine global-namespace collisions: `md/deadairdynamicuniverse.xml` (deadairdynamicuniverse + deadair_scripts), `md/extendedconversationmenu_testmod.xml`, and — notably — `aiscripts/hunter.escort.behavior.xml` + `aiscripts/miner.auto.harvest.xml`, where two studio-made test mods collide because **the studio generates default aiscripts with generic, non-mod-prefixed names**. That's a real product bug the Doctor surfaced (fix: prefix generated aiscript filenames with the mod id) — logged to the perf/correctness backlog.

**UI surface: LIVE-VERIFIED.** Added an "EXTENSION DOCTOR" card to the Mod Doctor panel (`PackageModDoctor.tsx`, the DOCTOR tab) — a "Scan Installed Extensions" button calling `/api/agent/extension-doctor`, rendering the `{error/warning/info}` counts and each finding (severity-colored, with code, file path, and message), reusing the existing diagnostic styling. Confirmed in-browser: clicking Scan showed "33 MODS", counts **0 Err / 4 Warn / 1 Info**, and the full-file-override findings list — matching the verified backend exactly, with no console errors. It sits alongside the per-workspace Package Diagnostics, so the DOCTOR tab now covers both "is *my* mod valid" and "do my installed mods conflict."

**P-A status: v1 + v1.1 COMPLETE and live-verified** (dependency / duplicate-id / cross-mod file+patch conflict scan, selftest-guarded, surfaced in the UI). Remaining Extension-Doctor backlog (future): XPath-level match overlap (needs an XPath lib), full load-order winner simulation, and folder-name vs id mismatch checks.

### Changelog — 2026-06-11 (7th pass: aiscript-naming fix, Doctor click-through, SQLite design)

**1. Generated-aiscript naming collision — FIXED and live-verified.** The Extension Doctor's own finding (two studio-made mods both shipping `aiscripts/hunter.escort.behavior.xml`, `miner.auto.harvest.xml`) was a real compiler bug: default AI scripts (seeded in `AIScriptEditor.tsx`) compiled to generic filenames identical across every mod. Added `namespaceModAiScripts(ws, modId)` in `server.ts`, run inside `buildWorkspaceFileManifest` (the canonical compile/package/deploy chokepoint, operating on the fresh sanitized copy). It prefixes the mod's **own** AI script names with the mod id **and** rewrites the job `<task script>` references that point to them, so reference integrity is preserved; base-game refs (`move.*`, `order.*`) are deliberately left alone. *Verified* via `/api/agent/compile` on a `TestMod` with `aiScripts:["hunter.escort.behavior"]` + a job referencing it → output `aiscripts/testmod.hunter.escort.behavior.xml` and `<task script="testmod.hunter.escort.behavior">` — namespaced and in sync. Two mods now produce distinct filenames; the collision class is gone at the source.

**2. Extension Doctor click-through — BACKEND done & verified, UI pending.** Each finding now carries `openTargets: [{label, path}]` — concrete extension-root-relative file paths for the involved mod(s) (dep/dup → each `<folder>/content.xml`; conflicts → each `<folder>/<contestedPath>`). New read endpoint `GET /api/agent/extension-file?path=<extRel>` returns `{path, name, content}`, read-only and path-traversal guarded. *Verified:* first real finding exposes `openTargets:[{label:"argon_alarm_reward", path:"argon_alarm_reward/aiscripts/hunter.escort.behavior.xml"}]`, and the read endpoint returns it (200, 1768 bytes). **Remaining (handoff to Codex):** in `PackageModDoctor.tsx`, render each finding's `openTargets` as clickable chips; on click `fetch('/api/agent/extension-file?path='+encodeURIComponent(t.path))` and show `content` in a read-only modal (monospace, scrollable, close button). Selftest at `/api/agent/extension-doctor-selftest` still passes (`pass:true`); real scan `{error:0, warning:4, info:1}`.

### Changelog — 2026-06-11 (8th pass, Claude/Fable session: handoff pickup list cleared)

**Scope:** finish Opus's pending item, then work the ranked pickup list + roadmap residuals. Every item below was edited via host file tools and **live-verified in the browser at `http://localhost:3000`** (selftest endpoints called from page context; UI confirmed by screenshot). All selftest oracles green at session end: `/api/agent/selftest` **10/10**, `extension-doctor-selftest` **pass (9 checks)**, `round-trip-selftest` **lossless**, `md-audit` **0 findings**.

1. **Extension Doctor click-through UI — DONE** (`PackageModDoctor.tsx`). Findings render `openTargets` as clickable chips; click fetches `/api/agent/extension-file` and opens a read-only modal (monospace, scrollable, click-outside/X close). *Verified:* clicked `argon_alarm_reward` chip → modal showed the 1.7 KB aiscript, console clean.
2. **Honest reporting — DONE** (`server.ts` /api/agent/generate, `AgentBridge.tsx`). The generate response message now reflects real post-validation counts; a thrown Phase-4 self-heal is captured (`selfHealError`) and surfaced in both the response and the AgentBridge banner (header now says "Generated with issues." when diagnostics remain). *Verified:* API restarted clean, page survived (split-dev architecture held).
3. **Provider-key fallback gated — DONE** (`server.ts` `isAppUiRequest` + `callMultiProviderAI`). `.env` provider keys now only back requests whose Origin/Referer is the app's own localhost origin; external/agent callers must send `x-custom-api-key`. **Breaking for external agents** that relied on env keys via `/api/agent/generate` — intentional (Track B: "prevents credit-theft via open proxy"). *Verified:* UI-origin request hits the env-fallback branch; the external-deny branch is unreachable from a browser by construction — confirm externally with: `Invoke-RestMethod -Uri http://127.0.0.1:3001/api/gemini -Method Post -Headers @{Authorization="Bearer <token from .studio-api-token>"; "x-ai-provider"="claude"; "Content-Type"="application/json"} -Body '{"prompt":"hi"}'` → expect the "external requests must supply their own key" error.
4. **Extension Doctor backlog (2 of 3) — DONE** (`server.ts` `runExtensionDoctor`). (a) `ext.folder_id_mismatch` (info) when folder ≠ content id (ego_* skipped). (b) **Load-order winner simulation**: deterministic topological sort (dependencies before dependents, alphabetical base — X4's rule); collision findings now carry `loadOrder`/`winner` and the message names the winner. Selftest extended to **9 checks** (adds folder/id mismatch, dep-aware ordering: `mod_z` loads before dependent `mod_b` despite sorting after it, selector winner, full-file override winner) — all pass. *Real 33-mod scan:* `{error:0, warning:4, info:14}` — same 4 warnings (now winner-annotated), 13 accurate folder/id infos, zero new errors. Remaining backlog: XPath-level match overlap (needs an XPath lib — npm install).
5. **Diagnostics click-to-navigate — DONE** (`App.tsx` + `PackageModDoctor.tsx`). New `navigate-to-source` window event; Package Diagnostics findings with a `sourceRef` are clickable and jump to the owning surface: `md_node` → blueprint + canvas focus + selection, `ui_widget` → ui-designer, `ai_script/ai_param` → aiscripts, `ware/job` → libraries, `t_*` → translation, `xml_patch` → xmlpatch. *Verified:* clicking the first deadair error focused cue `VerifyVariablesExist` on canvas; dependency graph + code panel followed.
6. **ErrorBoundary hardened — DONE** (`ErrorBoundary.tsx`). Clean `React.Component<P,S>` subclass with a class-field state initializer — the previous `extends (React.Component as any)` + bare `props`/`state` re-declarations could shadow React's own fields under esbuild `useDefineForClassFields` and silently fail to catch.
7. **Analyze timeout + cancel — DONE.** Server: 120 s `AbortSignal.timeout` on Anthropic/OpenAI/OpenRouter fetches + `httpOptions.timeout` for Gemini. Client (`DiagnosticsHub.tsx`/`MDScanner.tsx`): AbortController wired to a CANCEL button in the scanning view. *Verified live:* started a real analyze, clicked Cancel → "Analysis cancelled." + retry affordance.
8. **Perf memoization — DONE** (`CodePreview.tsx`). `highlightXML`/`highlightCode` results cached (string-keyed, capped; V8 string-hash caching makes same-instance hits cheap); `codeLines` split + `computeLineDiagMap` (O(file × diagnostics) token search) wrapped in `useMemo`. *Verified:* code panel renders with coloring, no console errors.
9. **SQLite persistence layer — CODE-COMPLETE, awaiting `npm install better-sqlite3`** (`src/lib/db.ts` NEW + `server.ts` wiring). Implements the design below in full: v1 DDL + indexes, game-path-change wipe, mtime invalidation, transactional cache writers, indexed query/point-lookup readers, `contestedPaths` as a single GROUP BY, dependency join, `dbSelfTest()` (8 assertions incl. game-path wipe). Mirror-write (migration stage 2) wired into the object-index build; reads stay in-memory. **Graceful absence verified live:** `/api/agent/db-selftest` (public read-only GET) returns `{available:false, reason:"Cannot find module 'better-sqlite3'"}` and the server runs unchanged. After `npm install better-sqlite3` + restart: expect `pass:true` + `[studio-db] SQLite cache active` in the API log; then flip reads (stage 3) starting with `/api/agent/object-index`.
10. **Dead-code/housekeeping — verified already clean** (no change needed): `SEEDED_COMMIT_LOGS` deleted, SyncModal import-only, `DirectorySettingsModal` props match `App.tsx`, `MOCK_FILESYSTEM_TREE` deleted. The HANDOFF section-2 security findings (0.0.0.0 bind, CORS `*`, no auth) were already fixed before this session — those handoff sections were stale.

**Honest residuals (this pass):** the provider-key external-deny branch is verified by construction (browsers always send a same-origin Origin on POST — the exact property the gate relies on), not by a live external request — the PowerShell one-liner above confirms it end-to-end. 13 `ext.folder_id_mismatch` infos on the real install are accurate but chatty (consider collapsing or suppressing `ws_*` folders). Extension Doctor mirror-write deferred until its reads flip so the scan stays single-source.

### Changelog — 2026-06-11 (9th pass, Claude/Fable session continued: deps installed, SQLite live, XPath overlap)

All browser-verified at `http://localhost:3000`; all selftest oracles green at session end (consolidated 10/10, extension-doctor **11 checks**, round-trip lossless, md-audit 0, db-selftest pass + live parity match).

1. **Repo hygiene shipped + committed** (`a5e070e`, committed via the live workspace mount as HourlyMoshine). `config.json` (personal machine paths), `temp_import/` (stale project copy), and `temp_package_test.json` untracked; `.gitignore` extended (secrets section, `.studio-cache/`, `.snapshots/`, `*.db`, `.tmp_*`); `config.example.json` added; `.env.example` rewritten documenting all providers + `GITHUB_CLIENT_ID` + optional stable `STUDIO_API_TOKEN`; real `README.md` written with the key-security model. **History audit:** `.env.local` has zero commits — no key was ever exposed. Note: a first `git rm` attempt corrupted `.git/index` through the mount (delete-permission gate blocked git's lock cleanup); repaired via `git read-tree HEAD` — index is derived state, no history damage; subsequent git ops verified clean (`git fsck` ok).
2. **Dependencies installed on the host:** `better-sqlite3@^12.10.0`, `xpath@^0.0.34`, `@xmldom/xmldom@^0.9.10` pinned in `package.json`; `restart-studio.bat` now runs `npm install` before launching the servers (keeps deps current after pulls). Launched via the bat on the host desktop.
3. **SQLite stages 3+4 — DONE, live-verified.** Schema v2 (adds `object_index.detail` for lossless restore; version bump wipes-and-recreates the cache tables). Cold-boot fast path in `getObjectIndex`: when the process has no in-memory index, the cached `cacheKey` matches, and every invalidation stamp (all `.cat` archives in game root/extension subfolders/workspace + top-level root mtimes) is unchanged, the index is **restored from SQLite instead of re-decoding the archives**. *Measured:* full build 2,156 ms (66 archives, 17,170 rows) → restored cold boot **230 ms** with identical `generatedAt` (proof it didn't rebuild). `db-selftest` now also reports **liveParity** (per-kind in-memory vs DB counts) — match across all 9 kinds. Caveat documented in code: deeply-nested loose-XML edits may not bump the stamps; the warm path still fully rebuilds every 60 s, so staleness is bounded to cold boots immediately after such edits.
4. **Extension Doctor: XPath-level selector overlap — DONE** (the last item of the original backlog). Selector collection is now op-aware (`add`/`replace`/`remove`). For contested diff targets whose selector *strings* differ, every selector is evaluated (xpath + @xmldom/xmldom) against the resolved base file (loose → packed .cat/.dat, cached per scan); nodes claimed by ≥2 mods where at least one op is replace/remove produce a **`patch.xpath_overlap` warning** with the overlapping selectors, load-order simulation, and winner. add+add to a shared parent stays info (X4 merges appends). Bounded: ≤2 MB base files, ≤200 selector evaluations, ≤50 matches/selector, ≤5 reported overlaps. `runExtensionDoctor` takes an injectable `resolveBaseContent` so the selftest covers it with synthetic bases: positive (`/baskets/basket[@id='shared']` remove vs `//basket[@id='shared']` replace → fires) and negative (different nodes → stays `patch.shared_target` info) — **selftest now 11/11**. Real scan unchanged (`0/4/14`, zero xpath overlaps — the install genuinely has no shared diff targets; the selftest proves detection works).

**Remaining queue (carried forward):** object-index-backed editor dropdowns (typed pickers); round-trip editability breadth (wares/jobs/aiscripts parsers); flip reference-validation + Extension Doctor reads to SQLite; demote/collapse folder-id-mismatch infos in the UI; C2 in-game verification (human step).

### Changelog — 2026-06-11 (10th pass: single schema-directory authority)

**Schema directory unified to one editor — DONE, live-verified.** There were *two* controls for the XSD schema directory: the standalone "XSD Schema Source" panel in the META sidebar (`Sidebar.tsx`) and the "XSD Schema Folder" field in the Directory Settings modal (`DirectorySettingsModal.tsx`). Both POST the same `xsdSchemaPath` key to `/api/schema/config` (the endpoint merges, so neither clobbers the other), so they never truly diverged — but two editors for one value is confusing. Per intent, the **Settings modal is now the single authority**: the Sidebar panel is converted to **read-only** (displays the configured directory, md.xsd/common.xsd found state, and the event/condition/action/control counts) with a "Configured in Directory Settings… read-only" hint and an **"Edit in Directory Settings"** button (new `onOpenDirectorySettings` prop → `setIsDirSettingsOpen(true)` in `App.tsx`). The panel refreshes when the modal closes via a new `schemaConfigVersion` counter (App bumps it on `onClose`; the Sidebar's `loadSchemaConfig` effect depends on it). *Verified live:* META → read-only panel renders with the path + counts + hint; "Edit in Directory Settings" opens the modal; closing it refreshes the panel; zero console errors. (Minor: the now-unused `saveSchemaConfig`/`savingSchema` in `Sidebar.tsx` are left in place as harmless dead code — safe to delete in a later cleanup.)

### Changelog — 2026-06-11 (11th pass: object-index editor pickers — Forward-plan Tier 1)

**Scope.** Start Tier 1: replace static hardcoded reference dropdowns in the node property editor with searchable typeaheads backed by the **live installed-game object index** (`/api/agent/object-index`), so a wrong reference can't be typed and the user isn't limited to a 9-item hardcoded list.

**Work done (files):**
- **`ObjectIndexPicker.tsx`** (NEW) — a searchable combobox: debounced query to `/api/agent/object-index?kind=&q=&limit=25`, dropdown of `{id, name}` matches, click-to-set, outside-click close, loading spinner. Crucially it still allows **free text** so MD variables (`$ship`, `player.ship`) remain valid; X4 text-ref names like `{20203,201}` are hidden.
- **`types.ts`** — added `'reference'` to `PropertySchema.type` + a `refKind` field; converted `create_ship.macro` → `reference/ship` and `create_station.macro` → `reference/station` (and cleaned their defaults of the ` (Human Name)` suffix). Compiler unaffected: `create_ship` already does `macro="${(macro||'').split(' (')[0]}"`, so a clean macro id passes through unchanged.
- **`Sidebar.tsx`** — imported the picker; added a `schema.type === 'reference'` branch in the property editor that renders `<ObjectIndexPicker kind={refKind} …>`.
- **`types.ts` `sanitizeWorkspace`** — `propertiesSchema` now **re-hydrates from the node's template by `xmlTag`** instead of preferring the node's baked copy (it's presentation derived from `xmlTag`, not user data). This makes template improvements like these pickers reach *existing* nodes on load, not only newly created ones; falls back to the node's own schema only when no template matches.

**Verification status: LIVE-VERIFIED** (completed after the Chrome extension was restored). End-to-end in the browser at `http://localhost:3000`: selected the default Create Ship node → the **Ship Class Macro field renders the typeahead** ("Search ship macros… or type a variable") — confirming the `sanitizeWorkspace` re-hydration reaches existing nodes; typing `bor_m_corvette` showed real live-index matches (`ship_bor_m_corvette_01`, `…_01_a_macro`, `…_02`, …) with id + human name; **picking an option set the field** and the compiled MD updated to **`macro="ship_bor_m_corvette_02"`** (verified in the code viewer) — clean id, compile correct; and a query for a macro NOT in this install (`split_m_corvette`) correctly returned "no matches, free text allowed" (the real value-add: the old static list named macros this install doesn't actually have). Zero console errors. All selftest oracles green at verification time: `/api/agent/selftest` **10/10**, `extension-doctor-selftest` pass, `round-trip-selftest` lossless, `md-audit` **0**, `db-selftest` pass (SQLite live).

**Follow-ups (Tier 1 continuation):**
- **Faction pickers — DONE & LIVE-VERIFIED.** Added a `stripPrefix` prop to `ObjectIndexPicker` (strips a prefix from the index id for both display and the stored value). Converted the three owner/reputation faction fields (`create_ship.faction`, `create_station.faction`, `reward_player.faction`) to `reference/faction` with `stripPrefix="faction."`, wired in `Sidebar.tsx`. So the picker offers all 33 real factions (incl. DLC) shown as short codes, but stores the short code the compiler expects. *Verified live:* Owner Faction renders the picker; searching `teladi` shows the stripped `teladi` option; picking it stored `teladi` and the compiled MD emitted **`<owner exact="faction.teladi" />`** (no double-prefix). `md-audit` still **0**, no console errors. The event "faction filter" field is deliberately left a `select` because it has a non-faction `any` option.
- **Still open:** ware/job reference fields (these live in the Wares & Jobs / LibraryConfigurator editor, not the MD node property editor — different component, separate slice); patch-target pickers (in `XMLPatchSystem`); then finish the SQLite read-flip so these object-index queries hit the DB instead of the in-memory index.

### Changelog — 2026-06-11 (12th pass: canvas resize robustness + Wares&Jobs faction picker)

- **Canvas resize hardening — DONE & verified** (`Canvas.tsx`). The cull-viewport `ResizeObserver` measured synchronously (mid-layout), defaulted to a stale `1200×800`, and had no window-level backstop — so opening the studio in a *much larger* window could leave a stale paint (app on the left, black on the right) until something forced a reflow. Rewrote the effect: measure on `requestAnimationFrame` (after layout), skip zero-size reads, only set state when the size actually changed, **plus a `window` 'resize' backstop and a 250ms settle re-measure**. *Verified live:* canvas flex-panel measures **2055px** (full width = 2844 − 320 sidebar − 460 code panel − resizers), a synthetic `resize` event re-measured cleanly, the grid fills the whole canvas (no black void), no console errors. (The earlier black-void report was this stale-paint case, triggered by opening a new wide window while the renderer was briefly frozen — not a real layout bug; this makes it self-correct regardless.)
- **Wares & Jobs job faction picker — DONE & LIVE-VERIFIED** (`LibraryConfigurator.tsx`). Replaced the job editor's 6-option hardcoded faction `<select>` with `ObjectIndexPicker kind="faction" stripPrefix="faction."` (same proven pattern as the MD faction fields) — all 33 real factions. *Verified live:* added a job, searched `paranid`, the dropdown showed the stripped `paranid` option, picking it stored `paranid` and the compiled `jobs.xml` emitted **`<select faction="paranid">`** (bare short code — correct for jobs, vs the MD `<owner exact="faction.teladi">` prefixed form; the same `stripPrefix` serves both because the *stored* value is the bare code and each compiler formats its own output). No console errors. **Tier 1 reference-picker coverage now: MD `create_ship`/`create_station` macro + faction + reward faction, and Wares & Jobs job faction.** Still open: ware production-input pickers (the `primaryWares` serialized multi-entry field needs a small UI rework), patch-target pickers (different data source — base-game file list, not the object index), and the SQLite read-flip so these queries hit the DB.

### Changelog — 2026-06-11 (13th pass: patch-target picker — real base-game files)

**Patch-target picker — DONE & LIVE-VERIFIED.** The XML Patch editor's Target File was a hardcoded `<select>` that *included files which don't exist* (notably `libraries/ship_macros.xml`, long flagged as a 404). A patch aimed at a non-existent base file fails silently in-game — exactly the failure class the studio is meant to prevent. Fix:
- **Backend `/api/agent/patch-targets?q=&limit=`** (`server.ts`) enumerates the **real** base-game patchable XML paths (`libraries/`, `index/`, `maps/`) straight from the packed `.cat` manifests (`parseCat` + `findCatDatArchives`), cached 5 min, q-filtered.
- **`ObjectIndexPicker` gained an `endpoint` prop** so the same proven typeahead can target any `{items:[{id,name}]}` endpoint; wired into `XMLPatchSystem`'s Target File field.
- *Verified live:* the endpoint returns **133 real files**; `wares`→`libraries/wares.xml`, `jobs`→`libraries/jobs.xml`, but **`ship_macros`→`[]`** (proving the old default was bogus). In the UI, the Target File field is now the picker; typing `factions` surfaced the real `libraries/factions.xml`, picking it set the target and the patch preview reflected it; no console errors.

**Tier 1 picker coverage now:** MD `create_ship`/`create_station` macro + faction, `reward_player` faction, Wares & Jobs job faction, **and XML-patch target file**. Remaining: ware production-input pickers (serialized multi-entry UI rework) and the (deferred, low-value) SQLite read-flip. *(Update: the ware production-input pickers landed in the 14th pass below; only the SQLite read-flip remains deferred.)*

### Changelog — 2026-06-11 (14th pass: ware production-input pickers + file-integrity fix)

**Ware production-input pickers — DONE & LIVE-VERIFIED** (`LibraryConfigurator.tsx`). The ware editor's production recipe was a free-text `<textarea>` (`ware_id:amount`, one per line) parsed by `serializePrimaryWares`/`parsePrimaryWares` — no validation, so a typo'd or non-existent ware id silently compiled into a dead `<ware>` reference. Replaced it with a structured per-row editor: each input row is a live ware-index `ObjectIndexPicker` (`kind="ware"`) + an amount field + a remove button, with an "Add input" button and an empty-state hint ("produced from nothing"). Confirmed the `ware` index returns **bare ids** (`ore`, `energycells`) — exactly what the compiler emits as `<ware ware="…" amount="…"/>` — so no `stripPrefix` is needed. Removed the now-dead serialize/parse helpers.
- *Verified live:* created a ware, **Add input** added a row; typing `energy` in the picker returned real index-backed matches (`energycells`, `module_gen_prod_energycells_01`, `module_ter_prod_energycells_01`, …); picking `energycells` + amount `40` compiled to **`<ware ware="energycells" amount="40" />`** inside a proper `<production><primary>…` block (verified in the live code panel); **remove** dropped the row and reverted the XML to the inputless self-closing `<production … />`. No console errors, no error boundary.

**Non-blocking "Add Ware/Job" — DONE & LIVE-VERIFIED** (`LibraryConfigurator.tsx`). The hierarchy panel's **ADD** button used a native `window.prompt()` to collect the new id. Native dialogs block the page's main thread — bad UX, and they hard-freeze any automation/agent driving the studio. Replaced with an inline entry row under the panel header: an autofocused text input (Enter = create, Esc = cancel) plus **Add**/**Esc** buttons, driven by a single `addingId` state; the `handleCreateWare`/`handleCreateJob` helpers now take the id as an argument instead of prompting. *Verified live:* clicking ADD shows the inline input (no `window.prompt` invoked — confirmed by overriding it and asserting it's never called); typing `plasma_conduit` + Enter created `ware_plasma_conduit` (auto-prefixed) and opened its editor; the jobs subtab shows the `job_trader_hauler` placeholder; Esc cancels cleanly. No thread block, no native dialog.

**File-integrity fix (process note).** During this pass the editing tool left `LibraryConfigurator.tsx` **truncated on disk** — the closing JSX, the right-side XML preview panel, and the `copyToClipboard` function were cut off (the TS parser flagged an unterminated file at EOF; `git` and a clean `tsc` parse agreed, while a stale editor cache briefly showed the old full file). Reconstructed deterministically: the edited body (lines 1–1199) + the intact tail from `HEAD` (the closing block, XML panel, `copyToClipboard`, component close), normalized to CRLF, written through the workspace mount. Result parses with **zero** syntactic diagnostics; whole file is 1,239 lines with a single clean tail. **This recurred** on the inline-add edit (the editor truncated the tail a second time), confirming it's reproducible for this large CRLF file — so the inline-add changes were finalized by splicing the edited body to the canonical tail and writing through the workspace mount, not via the editing tool. Lesson logged: for this file, parse-check the file *end* (not just the diff region) after every structural edit, and prefer a mount-level write for the repair.

**Tier 1 picker coverage now:** MD `create_ship`/`create_station` macro + faction, `reward_player` faction, Wares & Jobs job faction, XML-patch target file, **and ware production inputs**. The reference-picker surface for the studio's structured editors is now complete; the only deferred item is the low-value SQLite read-flip (the cold-boot restore already landed, so routing these queries through the DB instead of the in-memory index is a performance nicety, not a capability gap).

### Changelog — 2026-06-11 (15th pass: Lever 1 — schema-driven nodes wired to reference pickers)

**Lever 1 increment — DONE & VERIFIED** (`src/lib/schemaTypes.ts`). The roadmap's highest-leverage lever was MD vocabulary breadth: the curated palette is ~15 nodes but `md.xsd` has ~1,478 elements. The studio *already* auto-generates templates for the full vocabulary (`loadSchemaLibrary` → `schemaLibraryToTemplates` → `schemaElementToTemplate` → `schemaAttributeToProperty`, merged into the palette by `xmlTag`), but every schema-derived attribute rendered as a **plain text field** — the live reference pickers (built in passes 11–14) never reached them. Closed that gap: `schemaAttributeToProperty` now infers a picker `refKind` from the attribute name and emits `type:'reference'`.
- **Inference is conservative and name-based** (md.xsd types most attributes as `expression`, so type-based detection is unreliable): exact names `faction`/`ware`/`macro`/`sound`/`soundlibrary`, plus a `*faction` suffix rule (e.g. `licencefaction`). Runtime refs (`object`/`entity`/`cue`/`group`) are deliberately **excluded** — they aren't object-index kinds. **Guarded** so a fixed-enum or boolean attribute keeps its dropdown; only free/expression fields become pickers. Non-destructive: the picker still accepts free text, so MD variables (`$ship`, `player.ship`) stay valid.
- *Verified live* against `/api/schema/library`: of **1,216** schema-driven templates, **212** now carry ≥1 reference field — **275** fields total (faction 105, macro 103, ware 62, sound 5). Spot checks: `event_boarding_triggered.faction → reference/faction`; `owner.licencefaction → reference/faction` (suffix rule) while `owner.type` stays `select` (enum-guard); `event_player_blueprint_added` → `macro:reference/macro` + `ware:reference/ware`. On a spawned `add_research` action node the `ware` field renders as the ObjectIndexPicker (search input + icon) in the inspector. Selftest **10/10**, no console errors.
- **Finding (separate, pre-existing — not from this change):** spawned **event-category** nodes show a generic "Signaling Cue" field in the inspector instead of their own attributes, so pickers surface on **action/condition** schema nodes but not on events. Logged as the next follow-up for the MD-vocabulary lever (the schema is correct; the event-node inspector rendering needs to expose attribute fields). No source-file truncation this pass (the change was a single small edit to `schemaTypes.ts`, repaired once via mount-write after the editor truncated its tail, then parse-clean at 118 lines).

### Changelog — 2026-06-11 (16th pass: code-viewer line-number alignment)

**Line-number gutter alignment — DONE & LIVE-VERIFIED** (`CodePreview.tsx`). The compiled-code panels line numbers drifted out of alignment with the code, worsening down the file. Cause: the gutter rendered at `text-[9.5px]` and the code at `text-xs` (12px), but both used `leading-relaxed` — a font-size *multiplier*, so the gutter advanced 9.5x1.625=15.44px per line while the code advanced 12x1.625=19.5px, drifting ~4px/line (~120px by line 30). Fixed by pinning both gutters to an absolute `leading-[19.5px]` (matching the codes computed line-height) while keeping the small gutter font. *Verified live:* gutter and code line-height both report **19.5px** with identical 12px top padding, and a zoomed screenshot shows lines 1-10 each aligned to their row. No truncation (exact 2-occurrence string replace via mount-write); parse-clean at 1,613 lines.

### Changelog — 2026-06-11 (17th pass: event/condition/action schema nodes keep their real attributes)

**Schema-node attribute clobbering — ROOT-CAUSED & FIXED** (`types.ts` `sanitizeWorkspace`). Resolves the open finding from the 15th pass (spawned event nodes showed a lone "Signaling Cue" field instead of their attributes). Root cause: `sanitizeWorkspace` looked up a curated `NODE_TEMPLATES` entry by `xmlTag`, and when none matched (every schema-driven node, since only ~15 are curated) it **fell back to the first curated template of the same `type`** and overwrote the nodes `propertiesSchema` with it. So any event node got `event_cue_signalled`s single `cue` field; conditions/actions were similarly at risk. The nodes real attributes (and their reference pickers) were discarded on sanitize.
- **Fix:** the same-`type` fallback now only applies when the node has **no schema of its own** (`if (!template && !Array.isArray(node.propertiesSchema))`). Exact-`xmlTag` curated matches still win (so curated nodes keep getting refreshed templates/pickers); schema-driven nodes keep their own correct schema; only genuinely schema-less legacy nodes get the best-effort type fallback.
- *Verified live:* after the fix, a spawned `event_boarding_triggered` node carries `boarder, chance, comment, faction:reference/faction, target` (previously just `cue`), and its inspector renders all five fields with the **faction field as the live ObjectIndexPicker** (search input + icon). No Vite error, selftest **10/10**. With this, Lever 1 is complete across **all** node categories (events, conditions, actions) — the schema-driven palette nodes now expose their real attributes and reference pickers.
- **Infra note:** the `types.ts` edit truncated on write **twice** (the flaky large-file mount-write issue), once leaving the file unparseable mid-`sanitizeWorkspace` (Vite surfaced `Expected identifier but found end of file` at types.ts:1470). Recovered by splicing the edited body to the canonical tail from `HEAD` and re-writing with a post-write line-count/parse check + retry loop. Reinforced the working rule: after every source write this session, verify line count and parse the file end before moving on.

### Changelog — 2026-06-11 (18th pass: Lever 2 increment 1 — contract seam engine)

**Lever 2 (external-integration / contract seam) — increment 1 DONE & LIVE-VERIFIED.** Built the engine that models the X4 <-> external-process HTTP/JSON contract as a validated first-class artifact and generates the X4-side glue Lua. New self-contained module `src/lib/contractGlue.ts` (no edits to the giant files):
- **`IntegrationContract` model** — namespace, baseUrl, and endpoints (id/method/path + typed request/response field shapes), plus configurable, library-agnostic Lua expressions for the async HTTP client and JSON lib (the studio never hard-codes or authors the external runtime).
- **`validateContract`** — so neither end can drift: unique endpoint ids, valid methods, paths start with `/`, http(s) baseUrl (warns if not localhost), typed fields, and a warning when a non-body method declares a request body.
- **`generateHttpGlueLua`** — emits the X4-side glue: per endpoint a `Glue.<id>` function that validates required fields, calls the HTTP client with a JSON body, and on the async callback decodes JSON and routes the result back to MD via `AddUITriggeredEvent`; plus a `RegisterEvent("<ns>.<id>")` so MD `raise_lua_event` drives the call. Refuses to generate from a contract with errors.
- **`runContractGlueSelftest`** — 13 structural-invariant checks (valid contract clean; generates without throwing; every endpoint wired with RegisterEvent + Glue fn + response event; JSON encode/decode present; POST sends a body while GET does not; required-field guard; async callback shape; validator catches bad namespace/baseUrl/method/path/duplicate-id; generator refuses a broken contract).
- **Endpoints** (server.ts, public read-only GETs — no secrets, no mutation): `GET /api/agent/contract-selftest` (the oracle) and `GET /api/agent/contract-glue-sample` (generates glue for a representative sample so the output is eyeball-able).
- *Verified live in the browser:* `contract-selftest` returns **13/13 ALL PASS**; `contract-glue-sample` returns success with **0 error findings** and a 67-line glue Lua containing both endpoints, `RegisterEvent`, and the async `err, response` callback. Main `selftest` still **10/10**, no Vite error.
- **Scope boundary / next increment:** this is the *engine + oracle + preview*. Increment 2 is the interactive surface — a contract editor (endpoints + field shapes, reusing the existing form/picker patterns), a POST `/api/agent/contract-glue` taking a user contract, and packaging the generated Lua into the mod build as a `ui/` script. The external process itself remains permanently out of scope by design.
- **Infra note:** server.ts (4.6k lines) was edited via the safe Node-splice path (3 anchored insertions: import, public-GET allowlist, two route handlers) with a post-write parse + line-count check — no truncation this pass.

### Changelog — 2026-06-11 (19th pass: Lever 2 increment 2 — interactive contract editor + build packaging)

**Lever 2 increment 2 — DONE & LIVE-VERIFIED.** Turned the contract-seam engine into a real authoring surface and wired it into the mod build.
- **Workspace model** (`types.ts`): added `integrationContract?: IntegrationContract` to `ModWorkspace` + a defensive `sanitizeWorkspace` passthrough, so the contract persists with the mod and survives round-trips.
- **`ContractEditor.tsx`** (new component): a two-pane editor — left, the contract (namespace, base URL, optional HTTP-client Lua expr, and endpoints with method/path + add/remove request/response fields with types and a `required` flag); right, a **live-generated glue Lua preview** plus inline validation findings (errors block generation, warnings advise). The generator/validator are pure TS, so the preview is computed client-side with no server round-trip.
- **Tab wiring** (`App.tsx`): new **Contracts** tab (Plug icon) in the top nav, added to the `workspaceView` union and the content switch.
- **Build packaging** (`modCompiler.ts`): on compile, when a valid contract exists the studio emits `ui/<modId>_http.lua` (the generated glue) and registers it in the extension `ui.xml` alongside any widget Lua — no regression for the widgets-only path (identical ui.xml output when there's no contract).
- *Verified live in the browser:* no Vite error across all five edited/added files; the **Contracts** tab renders; empty-state → “Create a contract” opens the editor; the right pane shows the generated glue (header, `http`/`json` localization, `Glue.get_status`, `RegisterEvent`, `return Glue`) and updates as endpoints/fields change; **Add endpoint** works; the bottom note documents the MD↔Lua event contract. Main `selftest` **10/10**, `contract-selftest` **13/13**.
- **Scope note:** the interactive surface + persistence + packaging are done. What remains optional for this lever: response-shape validation at runtime and a one-click “generate the matching MD cue scaffold” (raise_lua_event + the response handler) so both ends of the contract are authored from one place. The external process itself stays out of scope.
- **Infra note:** all big-file edits (types.ts, App.tsx ×5, modCompiler.ts) went through the safe Node-splice path with per-anchor uniqueness checks + post-write parse; no truncation this pass.

### Changelog — 2026-06-11 (20th pass: Lever 3 — verify the Lua/UI editor + vetted snippet library)

**Lever 3 (Lua/UI editor edge-hardening) — increment 1 DONE & LIVE-VERIFIED.** Lever 3 is "mostly verify + templatize"; this pass does both.
- **Verify (corrects stale docs):** inspected the **HUD & LUA UI** tab live. Confirmed it provides a **UI Widgets Library**, a **Layout GUI Designer**, a **LUA Script Event Manager**, the full widget set (window, table, button, progress, label, selector, input, chat/dialogue), and a Lua editor. This matches the user's account and the 15th-pass correction — the UI authoring surface is real and substantial, so Lever 3 is hardening, not building-from-scratch.
- **Templatize:** new module `src/lib/luaSnippets.ts` — a vetted library of the *harder* X4 Lua patterns that modders otherwise get wrong, with `<PLACEHOLDER>` tokens the editor can prompt for: `md_to_lua_event` (RegisterEvent handler for an MD `raise_lua_event`), `lua_to_md_signal` (`AddUITriggeredEvent` back to MD), `async_http_request` (non-blocking HTTP + JSON callback routing to MD — the same pattern the Lever 2 generator emits), `menu_registration` (guarded `Helper.registerMenu`), and `guarded_update_loop` (throttled `SetScript("onUpdate")`). All guarded so a missing global never hard-errors in-game; no fabricated engine APIs. Plus `fillLuaSnippet` (token substitution) and `runLuaSnippetSelftest` (15 checks: unique ids, categories, balanced parens/braces, declared placeholders present, event-bridge/HTTP/menu/lifecycle correctness, token fill).
- **Endpoint** (server.ts, public read-only GET): `GET /api/agent/lua-snippets` returns the library + its self-test.
- *Verified live in the browser:* the endpoint returns **5 snippets** across categories events/http/menu/lifecycle with snippet self-test **15/15 ALL PASS**; main `selftest` still **10/10**, no Vite error.
- **Scope note / next increment:** the vetted templates + oracle are done and API-exposed. The remaining Lever 3 step is the *UI wiring* — an "Insert pattern" affordance in the HUD & LUA UI Lua editor that prompts for the placeholders and drops the filled snippet into the editor. Deferred as a focused follow-up to keep the large `UIBuilder.tsx` edit isolated.
- **Infra note:** new module + a single safe Node-splice into server.ts (import + public-GET allowlist + handler); post-write parse clean, no truncation.

### Changelog — 2026-06-11 (21st pass: Lever 2 increment 3 — MD cue scaffold for contracts)

**Lever 2 increment 3 — DONE & LIVE-VERIFIED.** A contract now produces *both* ends from one place: the X4-side glue Lua (increments 1–2) and the matching MD bridge cues.
- **`generateContractMdScript(contract, modId)`** (`contractGlue.ts`): emits an `<mdscript>` where each endpoint gets (a) a `<library name="Call_<id>">` cue that `raise_lua_event`s the call event with the request fields passed as params (`table[$f=$f]`), and (b) a `<cue name="On_<id>_response">` that listens for the Lua-fired response via `<event_ui_triggered screen="'<ns>'" control="'<id>.response'" />` and reads the decoded payload from `event.param3`. Event names are derived from the same `endpointEventNames` the Lua glue uses, so the two ends can't drift. Refuses to generate from an invalid contract.
- **Contract self-test extended to 18 checks** (was 13): MD generates without throwing, is a well-formed `<mdscript>`, wires every endpoint's call library + lua-event name + response control, passes request params, and refuses a broken contract.
- **Endpoint:** `GET /api/agent/contract-glue-sample` now also returns `mdScript`.
- **Build packaging** (`modCompiler.ts`): on compile, a valid contract emits `md/<modId>_http.xml` (the bridge cues) alongside `ui/<modId>_http.lua` (the glue).
- **UI** (`ContractEditor.tsx`): the right preview pane gained a **ui/…_http.lua | md/…_http.xml** toggle so the modder can see both generated artifacts live.
- *Verified live in the browser:* no Vite error; `contract-glue-sample` returns an `mdScript` containing `<library name="Call_…">`; `contract-selftest` **18/18**; main `selftest` **10/10**; in the Contracts tab the MD toggle renders the scaffold (`<library>`, `raise_lua_event`, `event_ui_triggered`, response cues).
- **Infra note:** all edits via the safe Node-splice path; note `ContractEditor.tsx` is LF (not CRLF) — the patch detects line endings per file. No truncation.
- **Lever 2 status:** the contract seam is now end-to-end — model + validate + generate (Lua *and* MD) + interactive editor + build packaging. Remaining is optional polish (runtime response-shape validation; an in-editor reference picker for endpoint ids).

### Changelog — 2026-06-11 (22nd pass: Lever 3 increment 2 — vetted patterns wired into the Lua editor)

**Lever 3 increment 2 — DONE & LIVE-VERIFIED.** Wired the vetted `luaSnippets` library (20th pass) into the HUD & LUA UI Lua view so the patterns are usable in-app, not just API-exposed.
- **Finding (corrects the map):** the Lua view in `UIBuilder.tsx` is a *template selector + read-only preview* (patterns chosen via `selectedLuaTemplate`, shown in a `<pre>`, with a Copy button) — not a free-text editable buffer. So rather than force an editable textarea, the snippets were added as **additional selectable patterns** in that proven mechanism.
- **`UIBuilder.tsx`:** imported `LUA_SNIPPETS`; added a **"Vetted X4 patterns (the hard ones, done right)"** section under the existing templates with a button per snippet (title + description); the preview `<pre>` now renders the selected snippet's Lua; and the **Copy** button copies the selected snippet's Lua verbatim (also fixes a pre-existing quirk where Copy emitted a one-line stub instead of the shown code).
- *Verified live in the browser:* no Vite error; in HUD & LUA UI → LUA Script Event Manager the new section lists all five patterns (MD→Lua handler, Lua→MD signal, async HTTP request, guarded menu registration, guarded periodic update); selecting **Async HTTP request** renders its Lua in the preview (`http.request`, `function(err, response)`, `AddUITriggeredEvent`) — confirmed by screenshot. Main `selftest` **10/10**.
- **Lever 3 status:** verify + templatize complete — editor coverage verified, the vetted hard-pattern library exists with a 15-check self-test and a public endpoint, and the patterns are selectable/viewable/copyable inside the Lua editor. Optional future polish: a placeholder-fill prompt (pre-substitute `<NS>`/`<EVENT>` from the active contract) and a true editable Lua buffer with persistence.
- **Infra note:** single-file edit via safe Node-splice (import + selector buttons + preview branch + copy handling), parse-clean; `UIBuilder.tsx` is CRLF (patch auto-detects per file).

### Changelog — 2026-06-11 (23rd pass: contract/snippet polish — placeholder pre-fill + response-shape validation)

**Two polish items from the Levers 2–3 backlog — DONE & LIVE-VERIFIED.**

**(1) Snippet placeholders pre-filled from the active contract** (`UIBuilder.tsx` + `luaSnippets.fillLuaSnippet`). When the workspace has an `integrationContract`, the vetted Lua patterns in the HUD & LUA UI view now substitute their `<NS>` / `<EVENT>` / `<URL>` / `<HTTP_CLIENT>` placeholders from the contract (namespace + first endpoint + base URL + http-client expr) in both the preview and Copy. With no contract, placeholders stay raw. *Verified live:* with a contract present, the Async HTTP request snippet renders `AddUITriggeredEvent("myext", "get_status.error", …)` / `".response"` and the real http-client require — no raw `<NS>` left.

**(2) Response-shape validation in the generated glue Lua** (`contractGlue.generateHttpGlueLua`). For each endpoint that declares response fields, the async callback now guards `if ok and type(decoded) == "table" then …` and logs `DebugError("[<ns>] <id>: response missing field '<f>'")` for any missing declared field before firing the response event — so a drifting external process is caught at runtime, not silently. Contract self-test extended to **19 checks** (added `response_shape_validated`). *Verified live:* `contract-glue-sample` Lua contains the response-missing check; `contract-selftest` **19/19**; main `selftest` **10/10**; no Vite error.

**Infra note:** `contractGlue.ts` had drifted to mixed line endings (linter); normalized to LF before the splice so anchors are reliable. All edits parse-clean.

### Changelog — 2026-06-11 (24th pass: documented decisions — SQLite read-flip + says-vs-does)

**SQLite read-flip — DEFERRED (documented decision, not a TODO).** The reference-validation and Extension Doctor read paths still query the in-memory object/extension index rather than the SQLite cache. Decision: **leave deferred.** Rationale: the DB already delivers the value that mattered — the cold-boot cache (cold boot ~230 ms vs ~2,156 ms full decode) — and once the index is resident, in-memory lookups are already fast, so flipping reads to the DB is a memory-footprint nicety, not a capability or correctness gain. Against that marginal value sits real risk: the read paths live in `server.ts` (~4.6k lines), which has repeatedly truncated on edit this session, and any flip must prove exact behavioral parity with the in-memory results. **Trigger to revisit:** if a workspace/index grows large enough that keeping the full index resident becomes a memory problem, or if a feature needs indexed queries the in-memory structure can't serve efficiently. Until then, the in-memory index + DB cold-cache is the right balance.

**Says-vs-does — consolidated findings (closes the original audit task).** Cross-checking what the studio *claims* against what is *verified* live (oracles all green at this writing: `selftest` 10/10, `extension-doctor-selftest` pass, `round-trip-selftest` lossless, `md-audit` 0, `db-selftest` pass, `contract-selftest` 19/19, `lua-snippets` self-test 15/15):
- **Says it validates references; does.** XSD + semantic reference validation (macros/wares/factions/time-format) and patch diagnostics are real and oracle-backed; the object-index pickers mean invalid macro/faction/ware/sound/patch-target references can't be typed across MD nodes, jobs, ware recipes, and patch targets.
- **Says round-trip is lossless; does.** Import → export preserves unmodelled domains via `passthroughFiles`; `round-trip-selftest` is lossless. Residual (honest): editability *breadth* — wares/jobs/aiscripts are preserved passthrough, not yet fully editable graphs.
- **Says the MD palette covers the vocabulary; now largely does.** Earlier the palette was ~15 curated nodes; Lever 1 made the full `md.xsd` (~1,478 elements) schema-driven with reference pickers, and the `sanitizeWorkspace` clobbering bug (events/conditions/actions losing their attributes) was found and fixed.
- **Says it has a real HUD & Lua UI editor; does** (corrects a stale earlier doc): UI Widgets Library, Layout GUI Designer, LUA Script Event Manager, syntax-validated Lua editor — verified live; plus the vetted hard-pattern snippets, pre-filled from the active contract.
- **Says it can author external-integration mods; now does** (Lever 2): contract model + validation + generated Lua glue *and* MD bridge cues + build packaging — the studio owns the X4 side and the contract, never the external process.
- **Honest residual gaps:** round-trip editability breadth (parsers for wares/jobs/aiscripts into editable graphs); a truly editable+persisted custom-Lua buffer (today's Lua view is template/snippet preview + copy); and capstone **C2** — a non-trivial mod built end-to-end in-studio, run in X4, documented (human-in-the-loop, still open). These are the real frontier, and they are not overclaimed anywhere in the authoritative sections.

### Changelog — 2026-06-11 (25th pass: editable + persisted custom Lua buffer)

**Editable custom Lua buffer — DONE & LIVE-VERIFIED.** Closes the last residual UI gap from the 24th-pass says-vs-does note: the Lua view was preview-only; it now has a real editable, persisted, packaged buffer.
- **Workspace model** (`types.ts`): added `customLua?: string` to `ModWorkspace` + a `sanitizeWorkspace` passthrough, so the buffer persists with the mod and round-trips.
- **Editor** (`UIBuilder.tsx`): the HUD & LUA UI Lua view header gained a **Preview | Edit Buffer** toggle. Edit mode swaps the read-only `<pre>` for a `<textarea>` bound to `workspace.customLua` (changes persist to workspace state). An **Insert pattern** action appends the currently-selected left-hand vetted pattern — pre-filled from the active contract — to the buffer.
- **Build packaging** (`modCompiler.ts`): when `customLua` is non-empty the compiler emits `ui/<modId>_custom.lua` and registers it in `ui.xml` alongside any widget/contract Lua (no regression to the existing paths).
- *Verified live in the browser:* no Vite error; Edit Buffer reveals the textarea; typing persists to `workspace.customLua` (confirmed via React state); selecting the Async HTTP pattern + **Insert pattern** appends the contract-filled snippet (`AddUITriggeredEvent("myext", "get_status.response", …)`) into the buffer — confirmed by screenshot; main `selftest` **10/10**.
- **Says-vs-does update:** the residual "no truly editable + persisted custom-Lua buffer" gap from the 24th pass is now **closed**. Remaining honest residuals: round-trip editability *breadth* (wares/jobs/aiscripts parsers) and capstone **C2** (a non-trivial mod built end-to-end in-studio, run in X4 — human-in-the-loop).
- **Infra note:** all edits via safe Node-splice (types.ts with a post-write line-count guard; modCompiler 4 anchored inserts; UIBuilder 4 anchored inserts), every file parse-clean, no truncation.

### Changelog — 2026-06-11 (26th pass: T2.1 — cue-lineage analyzer engine + oracle)

**T2.1 (Tier 2 cue-dependency / broken-lineage) — DONE & LIVE-VERIFIED.** First increment of the visual cue-tree feature: the pure static analyzer + its oracle.
- **`src/lib/cueLineage.ts`** (new): `analyzeCueLineage(nodes, links)` builds the cue tree and structural findings, working on the same graph model as `generateMDXML`/`nodeToCueMap`. It derives: cue name (`properties.name`), root cues (not targeted by an `out_sub` link), parent→child nesting (`out_sub`→`in_flow`), trigger events (cue `out_cond` links), cross-cue **listens** (`event_cue_signalled.properties.cue`), and cross-cue **signals** (`signal_cue`/`signal_cue_instantly`/`reset_cue`/`cancel_cue` parsed from `custom_xml` `rawXml`). A node-ownership BFS (mirroring `nodeToCueMap`, excluding `out_sub`→`in_flow`) attributes events/actions to their owning cue.
- **Structural findings only (honest scope):** `duplicate_cue_name`, `unnamed_cue`, `dangling_cue_ref`, `isolated_cue` (fully disconnected & unreferenced), `dangling_link` (link to a missing node). The local-vs-external heuristic is deliberately conservative — a reference is only checked when it resolves to a bare local candidate (`this.`-stripped, no dots, not a `$var`/expression); any `md.Script.Cue` / qualified reference is treated as external and **never flagged**, so cross-script refs don't produce false positives. It does NOT attempt to prove a condition is "never met" (undecidable) — that limit is stated in the code.
- **Oracle + endpoint:** `runCueLineageSelftest()` (clean graph: parent/child + resolved listen + resolved signal, zero errors; broken graph: duplicate name, dangling listen, dangling signal, isolated cue, unnamed cue, dangling link — all flagged; plus helper checks) and a public `GET /api/agent/cue-lineage-selftest`.
- *Verified live:* `cue-lineage-selftest` **15/15**; main `selftest` **10/10**; no Vite error. (Engine + oracle only; the red-highlighted tree UI is T2.2.)
- **Infra note:** new self-contained module + one safe Node-splice into server.ts (import + public-GET allowlist + handler); parse-clean, no truncation.

### Changelog — 2026-06-11 (27th pass: T2.2 — cue-lineage tree UI)

**T2.2 (cue-lineage tree UI) — DONE & LIVE-VERIFIED.** The structural analyzer (T2.1) now has a face.
- **`CueLineageTree.tsx`** (new): runs `analyzeCueLineage(workspace.nodes, workspace.links)` client-side and renders a collapsible **Cue Lineage Tree** — root cues → sub-cues (indented), each cue badged with its trigger / listen (`Ear`) / signal (`Radio`) edges, plus the findings list. Errors are red, warnings amber, and dangling local refs are highlighted red inline (`✕`); a clean graph shows a green check. A footer states the honest scope (structural only; cross-script `md.Script.Cue` refs treated as external).
- **Wiring** (`DiagnosticsHub.tsx`): rendered at the top of the MD Scanner (analyzer) panel — the natural home for MD-logic analysis — above the existing scanner, with no change to the other tabs.
- *Verified live:* opened the MD Scanner panel; the **Cue Lineage Tree** renders with the workspace's cues, and it correctly flagged the preset's lone cue `My_Startup_Cue` as **isolated / dead code** ('fully disconnected — no conditions, actions, sub-cues, parent, or references') with the amber warning badge — a true finding on real data (the Mission Cue node has no wired links). No Vite error; confirmed by screenshot.
- **T2 status:** the cue-dependency / broken-lineage feature is now end-to-end — analyzer engine + oracle (T2.1) and the visual tree with red broken-lineage (T2.2). Optional T2.3 (promoting signal/reset/cancel to first-class nodes with a cue picker, so the analyzer reads structured props instead of parsing `custom_xml` rawXml) remains a future tightening. The next Tier-2 frontier is T3 (live log/telemetry binding), which can illuminate this tree.
- **Infra note:** new self-contained component + one safe Node-splice into DiagnosticsHub (import + fragment-wrap of the analyzer branch); parse-clean, no truncation.

### Changelog — 2026-06-11 (28th pass: T2.3 — analyzer reads structured signal nodes)

**T2.3 (tightening) — DONE & LIVE-VERIFIED.** `signal_cue` / `signal_cue_instantly` / `reset_cue` / `cancel_cue` are real `md.xsd` actions already in the schema-driven palette, and they already compile via the generic node renderer (`renderGenericXMLNode` emits `<signal_cue cue="…"/>` from props) — so no compiler change was needed. The gap was analysis-side: `cueLineage` read signal targets only from `custom_xml` rawXml. It now ALSO reads the structured `properties.cue` of those action nodes (attributed to their owning cue via the ownership BFS), so dangling/resolved signal refs are caught whether authored as a structured node or as raw XML. Self-test extended to **17/17** (`structured_signal_resolves`, `structured_signal_dangling_flagged`). *Verified live:* `cue-lineage-selftest` **17/17**, main `selftest` **10/10**, no Vite error. This closes T2 (engine + tree UI + structured-signal analysis).

### Changelog — 2026-06-11 (29th pass: T3.1 — log-telemetry parser engine + oracle)

**T3.1 (Tier 2 / T3 — live log diagnostic binding) — increment 1 DONE & LIVE-VERIFIED.** The engine that turns X4 debug-log text into structured, cue-correlated telemetry.
- **`src/lib/logTelemetry.ts`** (new): `parseLogTelemetry(logText, cueNames)` splits log text into entries — each with optional `[Category]`, optional numeric/clock timestamp, a forgiving message fallback (X4's log format is not a stable contract), and a severity (`error`/`warning`/`info`) classified from category + message. Correlation has two paths: a deterministic `[MDStudio] cue=<Name>` marker (unambiguous — the studio can emit these from its own cues) and a best-effort **word-boundary** match of workspace cue names (so `MyStartupCueXYZ` does NOT match `My_Startup_Cue`). Returns entries + a per-cue summary (hits/errors/warnings, sorted errors-first) + totals.
- **Oracle + endpoint:** `runLogTelemetrySelftest()` over synthetic X4-style log text (category/timestamp parsing incl. clock form; error/warning/info classification; name + marker correlation; per-cue attribution; no false partial matches; empty-safe) and a public `GET /api/agent/log-telemetry-selftest`.
- *Verified live:* `log-telemetry-selftest` **17/17**; `cue-lineage-selftest` **17/17**; main `selftest` **10/10**; no Vite error.
- **Scope/boundary:** pure parser — no game required, reads X4's own output, authors nothing external. **T3.2** binds it to the cue-lineage tree (paste/load a log → fired cues glow, error-correlated cues turn red); **T3.3** (later, human-in-loop) tails a running game's log file.
- **Infra note:** new self-contained module + one safe Node-splice into server.ts; parse-clean, no truncation.

### Changelog — 2026-06-11 (30th pass: T3.2 — log telemetry bound to the cue tree)

**T3.2 — DONE & LIVE-VERIFIED.** The cue-lineage tree now lights up from a log: the live-debugging payoff on static text.
- **`CueLineageTree.tsx`:** added a **Bind game log** toggle with a paste textarea + a **Load .log file** input (client-side FileReader). The pasted/loaded text runs through `parseLogTelemetry` (T3.1) against the workspace's cue names; the resulting per-cue telemetry tints each cue row — **emerald** when it fired clean, **red** when an error correlated to it — with an `Activity` badge showing `hits×` and `errors✕`. The header shows how many cues are lit.
- *Verified live:* in the MD Scanner panel, Bind game log → pasted two lines naming `My_Startup_Cue` (one an `[=ERROR=]`); the cue row gained a **red tint** and a **`2×` badge**, and the section header showed **(1 LIT)** — confirmed by screenshot. No Vite error.
- **T3 status:** engine (T3.1) + tree-binding (T3.2) done. **T3.3** (live file-tail of a running game's debug log) remains the human-in-loop increment; its parser foundation is already in place.
- **Infra note:** single self-contained component edit via safe Node-splice (import + state + per-cue telemetry tint + log-bind UI), parse-clean, no truncation.

### Changelog — 2026-06-11 (31st pass: T3.3 — backend log-file tail + selftest)

**T3.3 (backend foundation) — DONE & LIVE-VERIFIED.** The non-human-in-loop half of live binding: read/tail a log file server-side and parse it into cue telemetry (the live-polling UI, which auto-refreshes against a running game, is the remaining human-in-loop step).
- **`server.ts`:** `readAndParseLogFile(path, cueNames, maxBytes=256KB)` reads a file (or just its tail when large, dropping the partial first line) and runs it through `parseLogTelemetry`. Exposed as `POST /api/agent/log-file-tail` (authed — takes `{path, cueNames, maxBytes}`, 400/404 guards, caps returned entries to the last 500) and a public `GET /api/agent/log-file-selftest` that round-trips a temp file (write → read → parse → assert → clean up).
- *Verified live:* `log-file-selftest` **5/5** (reads two lines, parses one error, correlates Bar-as-error and Foo-as-clean, temp file cleaned up); `log-telemetry-selftest` **17/17**; main `selftest` **10/10**; no Vite error.
- **T3 status:** complete to its buildable extent — engine (T3.1), tree-binding + static-file load (T3.2), backend file read/tail (T3.3). What remains is purely human-in-loop: an auto-polling UI against a running game's growing log, and (optionally) injecting deterministic `[MDStudio] cue=…` markers into generated cues for unambiguous correlation.
- **Infra note:** single safe Node-splice into server.ts (import + public-GET allowlist + helpers + two endpoints), reusing the existing `fs`/`path`/`os` imports; parse-clean, no truncation.

### Changelog — 2026-06-11 (32nd pass: T1.1 — UI layout-descriptor engine; cue-tree relocated to Doctor)

**T1.1 (WYSIWYG Lua-UI canvas — engine) — DONE & LIVE-VERIFIED.** The validated core of the layout builder, decoupled from codegen.
- **`src/lib/uiLayout.ts`** (new): a grid `UILayoutDescriptor` (name + rows/cols + widgets with id/type/row/col/span/label/binding across 9 widget types), `validateUILayout` (unique ids, valid types, in-bounds positions, and **no overlaps** via a grid-occupancy map), and `generateLayoutLua` that emits a Lua **descriptor table** — honest: it does NOT fabricate `Helper`/widgetSystem calls (the self-test asserts the output contains no such calls); X4 builds the widgets from the table at runtime. `runUILayoutSelftest()` + public `GET /api/agent/ui-layout-selftest`.
- *Verified live:* `ui-layout-selftest` **13/13** (clean layout validates + generates a data-only table with all widgets/bindings; broken layout flags bad-name/duplicate-id/invalid-type/overlap/out-of-bounds; generator refuses a broken layout); main `selftest` **10/10**; no Vite error. (Engine only; T1.2 is the snap-grid canvas, T1.3 the in-game widget Lua.)

**Correction — cue-lineage tree relocated to the Doctor (was MD Scanner).** Per product direction: the cue-lineage tree is *structural diagnostics* (dead cues, dangling refs, broken links), which is the **Doctor's** domain — alongside Package Diagnostics and Extension Doctor — not the MD Scanner (framed as AI cognitive analysis + playtest suggestions). Reverted the DiagnosticsHub (analyzer) placement from the 27th/30th passes and rendered `CueLineageTree` in the Sidebar `diagnostics` (Mod Doctor) branch above `PackageModDoctor`, in a scrollable column. *Verified live:* the tree is gone from MD Scanner and present in the Doctor (with its log-bind telemetry intact); no Vite error, parse-clean.

### Changelog — 2026-06-12 (33rd pass: T1.2 — snap-grid WYSIWYG UI layout canvas)

**T1.2 — DONE & LIVE-VERIFIED.** The visual canvas on top of the T1.1 engine.
- **`UILayoutCanvas.tsx`** (new): a **UI Layout** tab with a widget palette (9 types), a snap grid (configurable rows/cols) where you pick a type and **click a cell to place** a widget (explicit grid positioning so spans render correctly), a selected-widget inspector (label / binding / row-span / col-span / delete), **live validation** (`validateUILayout` findings shown red/amber), and a **live Lua preview** (`generateLayoutLua`). The layout persists on `workspace.uiLayout` (+ sanitize) and the compiler packages it to `ui/<id>_layout.lua`, registered in `ui.xml`.
- **Wiring:** new `UILayoutCanvas` component; `uiLayout` field on `ModWorkspace` + sanitize passthrough (`types.ts`); a **UI Layout** top-nav tab (`App.tsx`); packaging in `modCompiler.ts` (emits `ui/<id>_layout.lua` when the layout validates).
- *Verified live:* the UI Layout tab opens the canvas; selecting `progressbar` + clicking a cell placed the widget in the grid and the Lua preview updated to `{ id = "progressbar_1", type = "progressbar", row = 1, col = 1, ... }` inside `grid = { rows = 4, cols = 4 }` with the honest "No runtime calls are fabricated here" header — confirmed by screenshot. No Vite error; all five edited files parse-clean.
- **T1 status:** engine (T1.1) + WYSIWYG canvas (T1.2) done. **T1.3** — growing the descriptor table into *working in-game* `Helper`/ftable widget construction — remains the deliberately deferred, fabrication-prone increment gated behind C2-style in-game verification (cannot be validated without a running X4).

**Build status (Tier 2 / North-Star horizon):** everything buildable-and-verifiable without a running game is now built — Levers 1–3, T2 (analyzer + tree + structured-signal + log-binding), T3 (parser + tree-binding + backend file-tail), and T1 (descriptor engine + WYSIWYG canvas). The only remainders are inherently human-in-loop: T3's auto-poll against a live game log, and T1.3's working in-game widget Lua (both require X4 running, i.e. the M3/C2 capstone).

### Changelog — 2026-06-12 (34th pass: UI layout — from duplicate tab to a real bridge)

**Course-correction (good catch by the user + Gemini's technical case).** The 33rd-pass UI Layout tab was rightly flagged as a parallel system to the existing free-form Layout GUI Designer. The deeper point — that X4's UI is **fTable-native** (Helper.createFtable rows/cells), so absolute-pixel layouts clip/overflow across resolutions, aspect ratios, and HUD scale, while a logical grid is the engine-correct, responsive, validatable model — is **correct**. So this was resolved not by keeping two rival editors, nor by deleting the grid, but by making them **one pipeline**.
- **Removed the duplicate:** the separate UI Layout tab, the `uiLayout` workspace field, the parallel `_layout.lua` packaging path, and the standalone `UILayoutCanvas.tsx`. The free-form **Layout GUI Designer** is the single authoring surface.
- **Pixel-level validation in the designer** (`uiWidgetValidate.ts` + `UIBuilder.tsx`): the free-form designer now flags duplicate ids, degenerate sizes, negative positions, out-of-frame placement, and overlaps (it had none before). Self-test **9/9** (`GET /api/agent/ui-widget-validate-selftest`).
- **The bridge** (`uiLayout.ts`, restored + extended): the grid descriptor is now the engine-correct **compile model**, and `pixelLayoutToGrid` quantizes the designer's free-form `x/y/w/h` widgets into a validated row/col/span grid (column/row tracks derived from the distinct widget edges; widget types mapped to the grid set; overlaps/bounds validated). `generateLayoutLua` emits the declarative table (data only — the generic ftable loader is the still-deferred, in-game-verified T1.3). Self-test **19/19** including the bridge checks (`bridge_derives_cols`, `bridge_title_spans_cols`, `bridge_maps_types`).
- **Bridge in the compile pipeline** (`modCompiler.ts`): when the designer has widgets, the compiler derives the responsive grid and emits `ui/<id>_layout.lua` alongside the existing `ui/<id>.lua` — so authoring stays visual while the *output* is the resolution-safe declarative grid.
- **Designer shows the result** (`UIBuilder.tsx`): a `→ responsive grid R×C` indicator (with the fTable rationale in its tooltip) so the modder sees what their visual layout compiles to.
- *Verified live:* `ui-layout-selftest` **19/19**, `ui-widget-validate-selftest` **9/9**, main `selftest` **10/10**; no Vite error; a single editor (no duplicate UI Layout tab).
- **Honest residual:** the declarative grid table's full runtime payoff still needs the generic createMenu ftable loader (turns the table into real rows/cells) — that's T1.3, gated behind C2 in-game verification. The *model and bridge* are correct now; the in-game loader is the human-in-loop piece.

### Changelog — 2026-06-12 (35th pass, Fable: T4.4 Inc 1 — override-map engine, selftest, endpoints)

All browser-verified at `http://localhost:3000`. Existing oracles green after the change: main `selftest` **10/10**, `extension-doctor-selftest` **pass**.

- **`src/lib/overrideMap.ts` (NEW — extends the Extension Doctor; not a new scan system).** Pure engine: `analyzeOverrides({targetFile, records, loadOrder, baseContent?})` builds the per-element override map for one contested base file. Claims are keyed by **real node identity** when base content is available (xpath + @xmldom — same approach and bounds as the Doctor's xpath-overlap check; element paths prefer `[@id]`/`[@name]` predicates, attribute nodes keyed `path/@attr`), with an honest `resolution:"string"` fallback (normalized selector-string identity) when vanilla content can't be resolved (pre-T4.1). Each entry carries claims in simulated load order, `contested` (≥2 mods + ≥1 replace/remove/fullfile op), `merged` (add+add — X4 merges appends), and the load-order `winner`.
- **`runOverrideMapSelftest()` — 11/11 PASS** over a synthetic 3-mod collision: cross-string node identity (`/jobs/job[@id='shared']` and `//job[@id='shared']` collapse to ONE element entry), load-order winner, add+add merged-not-contested, attribute-level claim (`…/orders/@foo`), full-file `(entire file)` claim, string-fallback honesty (differing selector strings stay separate — no fabricated identity), zero-match selector degrades without crashing.
- **Server endpoints** (`server.ts` +66 lines via node exact-string splice, CRLF preserved, 0 syntax diags): public `GET /api/agent/override-map-selftest` (added to `PUBLIC_READONLY_GETS`); authed `GET /api/agent/override-map?file=<base-rel path>` — targeted per-extension record collection (same enabled/`ego_*`/selector rules as the Doctor's pathMap, but only the requested path), load order from a cheap `runExtensionDoctor` pass (no base resolution), vanilla content loose→packed (`catDatExtractBaseGameFile`), traversal-guarded.
- **Real-data verification (34-mod install, from page context):** `md/deadairdynamicuniverse.xml` → reproduces the known full-file collision: claims `deadair_scripts:fullfile` + `deadairdynamicuniverse:fullfile`, winner `deadairdynamicuniverse` — matches the Doctor's winner annotation. `libraries/jobs.xml` → **`resolution:"base"`** (vanilla extracted from packed .cat/.dat), deadair's adds collapse to a single uncontested `/jobs` element entry. Both honest: no conflict invented where X4 merges.
- **Inc 2 — drill-down UI — DONE (same pass, browser-verified).** `PackageModDoctor.tsx`: every `xml_patches` collision finding now renders an **OVERRIDE MAP** chip; click → fetch `/api/agent/override-map?file=<finding.filePath>` → modal showing the resolution badge (BASE-RESOLVED / SELECTOR-STRING), the file's load order, contested/merged/single counts, and per-entry rows (node, kind, claims as `folder:op` chips in load order with the surviving claim highlighted, CONTESTED/MERGED badges, crown = load-order winner). *Verified live:* DOCTOR tab → Scan → all 4 real collision findings grew chips → deadair chip opened the modal: `(entire file)` FILE CONTESTED, claims `deadair_scripts:fullfile` → `deadairdynamicuniverse:fullfile`, winner `deadairdynamicuniverse`, counts `1 contested · 0 merged · 0 single`; close-on-X and click-outside work; zero console errors. (The BASE-RESOLVED path has no reachable UI case on this install — no contested diff targets — but is API-verified on `libraries/jobs.xml`.)
- **Process note (cost us one retry):** the host Edit tool truncated `PackageModDoctor.tsx` mid-write — the CRLF-truncation hazard is NOT limited to the big three files. Recovery: restore from HEAD + node exact-string splice (same recipe as `server.ts`). Also: `server.ts` is now **LF** in both repo and working tree (normalized during commit), and the `.git` index corrupted once more through the mount (repaired via `read-tree HEAD`, no history damage). **T4.4 is COMPLETE.**

### Changelog — 2026-06-12 (36th pass, Fable: T4.1 spike — cat/dat compression + round-trip oracle; lever re-scoped)

All browser-verified at `http://localhost:3000`; regression sweep green after the change (main `selftest` 10/10, `override-map?file=libraries/jobs.xml` still `resolution:"base"`, object index serving live hits).

- **Honest re-scope first:** T4.1's headline — zero-extraction vanilla access — **already existed in production**: `src/lib/x4CatDat.ts` powers the object index (17k rows from 66 archives), `/api/patch/base-content`, and the override-map's vanilla resolution. What was actually missing: (1) **compression handling** — the reader had none, so gzip/zlib `.pck` entries would decode as garbage; (2) **a format oracle** — no selftest proving the parse→read→decode round-trip against known bytes. The spike closed exactly those two gaps by **extending `x4CatDat.ts`** (one module per capability — no new `catdat.ts`).
- **`decodeEntryBuffer()` (NEW in `x4CatDat.ts`):** magic-sniffing decoder (gzip `1f 8b`, zlib `78 xx` + checksum test) using node:zlib; **defensive by design** — any decompression failure falls back to raw UTF-8 instead of throwing (the format is community-documented, not an Egosoft contract). `readEntryText` now decodes transparently, upgrading every existing extraction path. Plus **`.pck` alias resolution** in `extractGameFile`/`extractBaseGameFile`: a request for `t/0001.xml` also matches a stored `t/0001.pck` (exact name wins).
- **`runCatDatSelftest()` — 12/12 PASS** over a synthetic fixture built in `os.tmpdir()` (never shipped game data): right-tokenized paths with spaces, malformed manifest line skipped, cumulative offsets/sizes, plain/gzip/zlib round-trips, truncated-gzip graceful fallback, cat-without-dat ignored by discovery, later-archive-wins override order, and the `.pck` alias. Public `GET /api/agent/catdat-selftest` (in `PUBLIC_READONLY_GETS`).
- **Real-data probe:** `/api/patch/base-content` returns valid XML for `t/0001-l044.xml` (680 B) and `t/0001.xml` (49 KB) from the real install. *Attribution caveat:* whether those entries are pck-stored or plain isn't observable through the endpoint — the fixture is the decompression proof; the probe proves no regression and end-to-end extraction.
- **Remaining T4.1 increments re-scoped:** *Inc 2 (VFS-backed pickers)* — **already satisfied** by the 11th-pass object-index pickers (live-index typeaheads). *Inc 1 (SQLite content cache for extracted files)* — **deferred, perf-only**: extraction is already positioned-read (no full .dat loads) and the object index is SQLite-cached; cache file *content* only if base-content/override-map latency ever becomes a felt problem. **T4.1 is functionally complete; next lever: T4.2 diff-to-patch** (its dependency — vanilla source on demand — is now proven).

## Tier 4 — ecosystem levers (proposed 2026-06-12; T4.4 + T4.1 SHIPPED — next: T4.2)

Four high-value additions that round the studio out from "mod authoring" into "mod ecosystem." They are **annotated with what they extend** so we build on existing modules rather than spawn parallel ones (the lesson of the UI Layout episode). They also form a **dependency chain**, not four independent silos — order matters.

**Dependency map:**  T4.1 (VFS) is the keystone — it unlocks real vanilla source for T4.2 and sharpens T4.4. T4.3 is independent and extends the contract seam we already shipped.

### T4.1 — Zero-extraction vanilla VFS (`.cat`/`.dat` virtualization)
- **Problem:** modders must externally extract gigabytes of `.cat`/`.dat` to get vanilla macros/wares/scripts. High setup friction.
- **Plan:** a Node-side reader for X4's catalog format (`.cat` = filename/size/offset/hash index; `.dat` = concatenated blob; inner XML is often PCK/zlib-compressed) that streams individual vanilla files on demand, cached in the SQLite layer, surfaced into the existing object-index/ware/faction pickers.
- **Extends:** the SQLite persistence layer (cache store) and the existing pickers (`ObjectIndexPicker`, patch-target picker) — they become VFS-backed instead of hardcoded lists.
- **Effort/risk:** **HIGH lift, keystone value.** Binary format + decompression + cache invalidation. The game root with the `.cat` files is one level above the already-mounted extensions folder (`G:\SteamLibrary\steamapps\common\X4 Foundations`). Recommend a read-only **spike first**: parse one `.cat`, list its entries, extract+decompress one known XML, prove the round-trip before wiring any UI.
- **Honesty note:** the format is community-documented, not an Egosoft public contract — version the reader defensively and degrade gracefully if a future patch changes layout.

### T4.2 — Visual diff-to-patch builder (auto-XPath)
- **Problem:** safe coexistence requires hand-written XPath `<diff>`/`<replace>`/`<add>`; error-prone.
- **Plan:** twin-pane editor — pick a vanilla asset (via T4.1), edit it in the existing form editor, and a tree-diff → XPath synthesizer emits the minimal standard-compliant patch (add/replace/remove at element & attribute granularity).
- **Extends:** the existing **XML Patching domain** and `modCompiler`'s diff output — this is its visual front-end, not a new patch engine.
- **Effort/risk:** **MEDIUM, high value. Depends on T4.1** (you need the vanilla source tree to diff against). The XPath-synthesis is the interesting part: prefer stable selectors (id/name attrs) over positional `[n]` indices so patches survive vanilla reshuffles. Validate every generated patch by re-applying it to the vanilla source and asserting it reproduces the edit.

### T4.3 — Real-time Lua ↔ MD logic connector
- **Problem:** wiring a Lua UI widget to an MD cue (`event_ui_triggered`/`raiseEvent` + a listener cue) is verbose, strict, and split across two files.
- **Plan:** draw an arrow on the canvas from a UI widget (e.g. a HUD button) to an MD action node; the studio scaffolds both ends — raises the Lua action event with packaged params, declares the listener cue + `event_ui_triggered` handler, and adds type guards.
- **Extends:** the **contract seam we already shipped** — `contractGlue.ts` (glue-Lua + MD cue scaffold + `endpointEventNames`), `cueLineage.ts` (it already understands signal/listen edges), and the UI designer. **Do not build a third glue system**; this is `contractGlue` pointed at the in-app UI-widget→cue case instead of HTTP.
- **Effort/risk:** **MEDIUM, partially seeded.** Independent of T4.1. Main work is the canvas interaction (cross-domain arrow) + extending the contract generator with a `ui_event` endpoint kind.

### T4.4 — Active extension override visualizer
- **Problem:** the Extension Doctor flags that two mods touch the same file, but not *how* — which exact element/line each rewrites and who wins.
- **Plan:** overlay the document tree of a targeted vanilla file with every active mod's patch against it, highlight the precise element/attribute overlap, and resolve the winner by load-order (alphabetical + dependency constraints).
- **Extends:** the existing **`extension-doctor` endpoint** — it already does shared-path collision detection and load-order simulation over the real 34-mod folder. This is the per-element drill-down on top of that.
- **Effort/risk:** **MEDIUM, most immediately deliverable** — it reuses the most existing infrastructure and has real test data already mounted (the 34-mod `extensions/` folder). Mild benefit from T4.1 (resolving against true vanilla) but works on patch-vs-patch overlap without it.

**Recommended build order:** T4.4 (cheapest, extends the Doctor, real test data on disk) → T4.1 spike (keystone) → T4.2 (needs T4.1) → T4.3 (independent, extends the contract seam). T4.1+T4.2 are best treated as one paired effort.

### T4 — concrete increments (house pattern: engine + `run*Selftest()` + public GET, THEN UI, verified live)

**T4.4 Override Visualizer (do first):**
- *Inc 1 — engine:* ✅ **DONE (35th pass, browser-verified).** `src/lib/overrideMap.ts` — `analyzeOverrides({targetFile, records, loadOrder, baseContent?})` per-element claims + winner; `runOverrideMapSelftest()` 11/11; public `GET /api/agent/override-map-selftest` + authed `GET /api/agent/override-map?file=`. See the 35th-pass changelog.
- *Inc 2 — UI:* ✅ **DONE (35th pass, browser-verified).** OVERRIDE MAP chip on every `xml_patches` collision finding → modal with resolution badge, load order, and per-entry claims/winner. See the 35th-pass changelog.

**T4.1 Zero-extraction VFS (keystone, spike first):**
- *Inc 0 — read-only spike:* ✅ **DONE (36th pass).** Extended the EXISTING `src/lib/x4CatDat.ts` (no new module): `decodeEntryBuffer` gzip/zlib + graceful fallback, `.pck` aliases, `runCatDatSelftest()` 12/12 over a tmpdir fixture, public `GET /api/agent/catdat-selftest`. See the 36th-pass changelog.
- *Inc 1 — cache:* **DEFERRED (perf-only).** Object index already SQLite-cached; extractions are positioned reads. Cache extracted *content* only if base-content/override-map latency becomes a felt problem.
- *Inc 2 — pickers:* ✅ **ALREADY SHIPPED (11th pass)** — `ObjectIndexPicker` + patch-target picker are live-index typeaheads backed by the packed archives. The lever's goal predated the pass that delivered it.

**T4.2 Diff-to-Patch (needs T4.1):**
- *Inc 1 — engine:* `src/lib/xpathSynth.ts` — `synthesizePatch(vanillaXml, editedXml)` → minimal `<diff>` ops, preferring id/name selectors over positional `[n]`. `runXpathSynthSelftest()` must round-trip: apply the generated patch to vanilla and assert it reproduces the edit.
- *Inc 2 — UI:* twin-pane editor reusing the existing form editor + XML Patching domain front-end.

**T4.3 Lua↔MD connector (independent; extends `contractGlue`):**
- *Inc 1 — engine:* add a `ui_event` endpoint kind to `src/lib/contractGlue.ts` (raise-event Lua + `event_ui_triggered` listener-cue scaffold + type guards). Extend `runContractSelftest()`.
- *Inc 2 — UI:* cross-domain arrow on the canvas (UI widget → MD action node) that drives the generator. Do NOT add a new glue module.

**Status:** T4.4 Inc 1 shipped (35th pass); the rest scoped only. Each follows the house pattern — pure engine module + `run*Selftest()` oracle + public GET endpoint, THEN UI, verified live — and each must justify why it extends an existing module rather than duplicating one before any code is written.

### SQLite persistence layer (design — implemented 8th pass; awaiting native dep install)

**Why.** The expensive, reusable data the studio computes — the packed `.cat/.dat` object index (694 ships, 8,616 macros, 1,950 wares, 33 factions, 3,783 sounds across 64 archives) and the extension manifest/file index — is currently rebuilt **in memory on every server boot**, and serializing a 1,294-node workspace over `/api/agent/workspace` takes seconds. None of that needs to live in the frontend; it's classic "query over tens of thousands of indexed records," which is exactly what an embedded DB is for. The mod being *edited* stays in frontend memory (it's small); the DB is a backend **cache + query layer**, not the document store.

**Stack.** `better-sqlite3` (synchronous, embedded, zero-config, no separate process — fits the single-binary dev server). DB file at a gitignored cache path, e.g. `<modWorkspacePath>/.studio-cache/index.db` (falls back to `os.tmpdir()`), created/migrated on boot in a new `src/lib/db.ts`.

**Schema (v1).**
```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);              -- schema_version, game_path, built_at
CREATE TABLE source_mtime (path TEXT PRIMARY KEY, mtime INTEGER);  -- invalidation: archive/file -> last mtime seen
CREATE TABLE object_index (                                        -- the cat/dat + loose decode result
  kind TEXT, id TEXT, name TEXT, source_mod TEXT, source_file TEXT, macro TEXT, dlc TEXT,
  PRIMARY KEY (kind, id)
);
CREATE INDEX idx_obj_kind ON object_index(kind);
CREATE INDEX idx_obj_id   ON object_index(id);
CREATE TABLE extensions (                                          -- content.xml manifest cache
  folder TEXT PRIMARY KEY, content_id TEXT, name TEXT, version TEXT, enabled INTEGER, deps_json TEXT
);
CREATE INDEX idx_ext_id ON extensions(content_id);
CREATE TABLE ext_files (                                           -- per-mod file index for conflict scan
  folder TEXT, rel_path TEXT, is_diff INTEGER, selectors_json TEXT, hash TEXT,
  PRIMARY KEY (folder, rel_path)
);
CREATE INDEX idx_extfiles_path ON ext_files(rel_path);            -- GROUP BY rel_path HAVING COUNT(DISTINCT folder) > 1
```

**Invalidation.** Before serving, compare each source archive/file mtime to `source_mtime`; re-decode only changed sources (incremental). Store `game_path` in `meta` — wipe + rebuild if it changes. So a cold boot with an unchanged install is a fast read, not a 64-archive decode.

**Integration points (swap in behind existing APIs; response shapes unchanged):**
- `x4ObjectIndex.ts` / `x4CatDat.ts` → write decode results into `object_index`; `/api/agent/object-index` queries it (indexed `WHERE kind=? AND id LIKE ?`).
- Reference validation (`macroname`/`warename`/`faction`) → indexed point lookups instead of in-memory Maps.
- `runExtensionDoctor` → populate `extensions` + `ext_files`; check #3 becomes a `GROUP BY rel_path` query; dependency check a join on `extensions.content_id`.

**Migration plan.** (1) Add `better-sqlite3` + `src/lib/db.ts` (open/migrate). (2) Mirror-write into SQLite while keeping in-memory as source of truth; compare results behind a flag. (3) Flip reads to SQLite; keep in-memory as a fallback if the DB is unavailable. (4) Add a `/api/agent/db-selftest` (build a temp DB, assert query results match the in-memory path).

**Explicitly NOT in SQL:** the workspace being edited (frontend memory), generated XML (computed on demand), and the user's source files (the filesystem remains the source of truth — the DB only *indexes* them).

### Next priorities (ranked, post 2026-06-11)

> **[SUPERSEDED — see Current State → Forward plan.]** Of this original list: #1 (MD generator schema-valid → `md-audit` 0), #2 (diagnostics click-to-navigate), #5 (aiscripts.xsd validation), and #6 (patch-builder default target) are **done**. #3 (object-index editor dropdowns) and #4 (round-trip breadth) carry forward as Forward-plan Tiers 1 and 3. Kept for rationale.

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
| **Schema-Aware Mod Doctor** | Strong | 98% | `xsdValidate.ts`: XSD element/attribute/enum/required/child-element index (1478 elements) **+ semantic-type reference checks (macroname/warename/faction → real game index) + time-format checks**; schema-valid MD generator; aiscripts.xsd path; `/api/agent/{compile,package,md-audit,xsd-lookup,reference-selftest,type-probe}`. | **2026-06-11 (3rd pass):** added the validation layers the XSD *can't* express — X4 types most attrs as permissive `expression`, so (a) reference attributes are validated by their **semantic type** (`macroname`→macro index of 8616, `warename`→ware index, `faction.<id>`→faction index), catching runtime "no ship generated"/unknown-id errors before deploy; (b) **time-format** checks catch bare numbers on time attrs (`duration="8"`→needs `8s`). This caught two real bugs in the studio's *own* templates (`create_station` macro misspelled `defense`→`defence_arg_tube_01_macro`; `show_notification timeout` missing unit) — both fixed; `md-audit` back to **0**, zero false positives on valid factions/macros. Remaining 2%: full sequence/cardinality validation + click-to-navigate UI. |
| **Live Game Feedback Loop** | Strong | 90% | `/api/agent/game-log/status` with **explicit pipeline state model** (Deployed → Seen-by-X4 → Loaded-cleanly → Runtime-errors), **deterministic error→sourceRef mapping** (`md script 'x' … line N` → `md/x.xml` line N), **user-configurable `x4LogPath`**, deploy metadata, AI explanation optional on top of deterministic parsing. | **2026-06-11:** added the state model, error→sourceRef mapper, and configurable log path; verified deterministically via `/api/agent/log-selftest` (cleanLoad / runtimeError / errorSourceRefMapping / notSeen all pass). Remaining 10% is the **irreducible human-in-the-loop step**: the user runs X4 so the log actually contains the extension id and any runtime errors — the machinery to detect and map them is ready, but agents cannot launch/observe the game. |
| **Real X4 Object Browser** | Strong | 88% | `x4ObjectIndex.ts`, `x4CatDat.ts` (packed decoder), `/api/agent/object-index`, Local Object Browser UI, **and the index now drives reference validation** (macroname/warename/faction checks). | **2026-06-11:** packed archives decoded (verified 694 ships / 932 stations / 33 factions / 1950 wares / 3783 sounds across 64 archives), shown live in the Object Browser UI. The index is now also consumed by the validator to catch bad references before deploy. Remaining 12%: wiring the index into node-property **editor dropdowns** and per-object detail views — UI work in component files currently owned by the concurrent Antigravity agent (deferred to avoid conflict). |
| **Round-Trip Import/Edit/Export** | Strong | 93% | passthrough preservation, importer with generated/editable/partial/passthrough/binary classification, per-domain regeneration gating, **editable t-file (translation) parsing**, `/api/agent/mod-folder/import`, `round-trip-selftest`. | **2026-06-11 (3rd pass):** translations now import into the **editable** TFile model and round-trip **byte-identical** (verified — `parseTFileXML` is a faithful inverse of `compileTFileXML`). MD parses to editable when possible; everything else is preserved byte-identical. Verified lossless across MD + translations + libraries + unknown files. Remaining 7%: editable parsing of wares/jobs/aiscripts (deferred until their generators are faithful enough to round-trip — currently they emit placeholder content, so they stay safe-passthrough) and a golden corpus across several real published mods (needs real mod paths). |
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

## Community pain-point alignment — diff vs. the deep-research report (2026-06-11)

Source: `deep-research-report.md` (Codex) — a qualitative review of the biggest recurring X4 modding pain points, ranked into ten issues. Its thesis: *"X4 is moddable, but too much of the real workflow is pieced together from forum archaeology, extracted schemas, Discord help, and community APIs,"* with ~three-quarters of friction in three buckets: docs/discoverability, update-driven breakage, and missing first-party tooling/diagnostics.

That thesis is precisely the studio's reason to exist — collapse that scattered workflow into one app. The diff below grades each documented pain against what the studio does **today** and converts the gaps into an in-scope buildlist. Verdict up front: **the studio can meaningfully address 6 of the 10 pains (plus a 7th partially); 3 are engine/asset-pipeline problems only Egosoft can own.**

### Diff table

| # | Report pain point (prevalence) | Studio coverage today | Gap → what we can achieve |
|---|---|---|---|
| 1 | Fragmented docs / discoverability (High) | **Partial** — Local Object Browser (real cat/dat index: 694 ships, 33 factions, 1950 wares, 3783 sounds), schema-derived node templates, in-app XSD element/attr/enum surfacing, Wiki/Codex tab | Productize an in-app **searchable reference**: scriptproperties / MD-action / XSD symbol search + hover docs on every node & field + task-based quickstart gallery. Directly kills "unpack the XSD and read the comments." |
| 2 | XML/MD/XPath/Lua hard to learn (High) | **Strong (core)** — visual node-based MD authoring (no hand-written XML), 8-domain compilers, XSD-backed validation, XPath match-counting in the patch builder | Already the headline win. Extend: more templates, finish schema-valid generators, object-index-backed **typed pickers** instead of free-text fields. |
| 3 | Major updates break mods (High) | **Partial** — validation runs against the *installed* game's XSD + object index, so references that no longer exist are catchable | Add an **"update audit"**: re-scan a mod against the current install and flag now-dangling references (removed macros/wares/factions) as a migration checklist. (Machine-readable breakage notes themselves are Egosoft's job.) |
| 4 | UI modding unstable / conflict-prone (High) | **Weak** — packages X4-correct `ui.xml` + Lua entry point; the engine-level hook layer is Egosoft-only | **Partial only:** generate UI that uses the community **UI-callback pattern** (interop-friendly) instead of whole-function Lua overrides, and flag whole-function overrides as a conflict risk. The real fix (first-party callback layer) is out of our hands. |
| 5 | Debugging / logging / conflict diagnosis weak (High) | **Strong (single-mod)** — Mod Doctor (XSD + reference + semantic checks with file+line+sourceRef), live `debuglog` parsing → sourceRef mapping, patch diagnostics | **Biggest new opportunity.** Extend from one mod to a cross-mod **Extension Doctor**: scan the whole `extensions/` folder for duplicate `<diff>` selectors hitting the same node across mods, folder-name collisions, unsatisfied/missing dependencies, broken DLC refs, and **load-order winner/loser ("why this file won")**. This is the report's #1 near-term recommendation and we already own the pieces (patch-target resolver + object index + mounted extensions folder). |
| 6 | Missing first-party editors / automation (High) | **Strong** — the studio *is* the "modding workbench" the report asks for: visual editors, generators (wares/jobs), pack/validate, deploy, GitHub publish | Fill remaining scaffolds: gamestart generator, deeper ware/job models. Pack/validate/publish is largely present. |
| 7 | Asset pipeline — ships/Blender/NPC (Medium) | **Out of scope** — text/XML/script IDE, not a 3D asset tool | Explicitly not our domain; don't overpromise. |
| 8 | Distribution / install-path confusion (Medium) | **Partial/Strong** — path config + detection (game / workspace / extensions), deploy to `extensions/`, GitHub repo-create/push/commit-summaries, snapshots | Add: **content.xml `<dependency>`** support (gap already noted in the appendix), **version pinning**, **mod profiles / modset switching** (enable/disable named sets), and optionally a **GUI Workshop-publish wrapper** around `-buildcat`/X Catalog Tool. GitHub distribution is already done. |
| 9 | Engine-boundary / plugin bridge (Medium) | **Out of scope** — the agent API edits mods; it is not an in-game IPC/plugin bridge | Egosoft's platform decision; not our domain. |
| 10 | Modified-tag / trusted-mod policy (Medium) | **Mostly out of scope** — game-side policy/UX | Minor: surface a plain-language explainer + flag when a mod would trip the modified state. Low priority. |

### The studio already answers most of the report's recommended MVP toolset

The report names six MVP components. The studio already covers four, can credibly reach a fifth, and the sixth is an engine feature:

- **Authoring + validation layer** (XSD validation, selector diagnostics, symbol search) → **have** (Mod Doctor + object index); deepen with symbol search + hover docs.
- **Diff + patch tooling** (generate diff, apply, show selector conflicts, validate) → **have** (patch builder + XPath match counts + patch diagnostics).
- **Extension Doctor** (dependency / path / duplicate-selector / DLC checks, profile audit) → **partial → build next** (we do it for one mod; extend to all enabled mods).
- **GUI scaffolding workbench** (generators, templates, pack/validate/publish) → **have**.
- **UI interoperability layer** → **engine feature (Egosoft)**; we can only emit interop-friendly UI.
- **External integration bridge** → **engine feature (Egosoft)**; out of scope.

### Prioritized buildlist (in-scope, ranked by leverage)

- **P-A — Extension Doctor (cross-mod conflict scan).** *(Pains #5, #8, #1 — highest leverage.)* Scan all of `extensions/`: duplicate `<diff>` selectors across mods, folder collisions, unsatisfied/missing dependencies, broken DLC refs, and load-order winner determination. JSON report + Mod Doctor grouping. It's the report's top near-term ask and we're ~70% there.
- **P-B — content.xml `<dependency>` + version pinning + DLC gating.** *(Pain #8.)* Add dependency metadata to the compiler and Mod Doctor checks that each dependency resolves in the install. Prerequisite for real conflict/profile work.
- **P-C — Mod profiles / modset switching.** *(Pain #8.)* Save/restore named enable-sets across `extensions/`; one-click switch.
- **P-D — Update-audit scan.** *(Pain #3.)* One button: re-validate the active mod against the current install's XSD + object index, output a migration checklist of dangling references.
- **P-E — In-app searchable reference + hover docs + quickstarts.** *(Pains #1, #2.)* Symbol search over scriptproperties / MD actions / XSD; hover docs on nodes & fields; a "start here" template gallery.
- **P-F — Interop-friendly UI generation.** *(Pain #4, partial.)* Emit UI via the community callback pattern; flag whole-function Lua overrides as conflict risks.
- *(Optional / low)* Workshop-publish GUI wrapper (#8); modified-tag explainer (#10).

**Honest scope line:** P-A→P-F turn the report's "X4 is moddable but the workflow is archaeology" into "the studio *is* the workflow" for the text / XML / MD / script surface — which is exactly where the report says ~three-quarters of the friction lives. The thre