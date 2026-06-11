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

**Honest scope line:** P-A→P-F turn the report's "X4 is moddable but the workflow is archaeology" into "the studio *is* the workflow" for the text / XML / MD / script surface — which is exactly where the report says ~three-quarters of the friction lives. The three pains we can't touch (3D/character assets, an in-game plugin/IPC bridge, the engine-level UI hook layer) are Egosoft-platform features, and the roadmap should keep saying so rather than pretend otherwise.

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
