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

## Explicitly deferred (post-validation)

UE5-style UX polish — drag-to-search, comment-group cards, reroute nodes, content-browser drag-drop, the cue-tree/behavior-tree view. All worth doing, none of it proves the loop. Parked until M3. (Note: when we do build the graph model, lean toward MD's *declarative behavior-tree* nature rather than UE5's imperative exec-flow metaphor.)

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
