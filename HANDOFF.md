# X4 Mod Studio — Handoff Notes

Context for the next coding agent. This captures a review pass + a compiler/directory refactor done on the `main` branch working tree. Pair this with `ROADMAP.md` (strategy) — this file is the "what changed and what's left" companion.

---

## SESSION HANDOFF — 2026-06-12 → FOR FABLE (UI bridge shipped; Tier 4 scoped & ready to build)

**Read `ROADMAP.md` → "Tier 4 — ecosystem levers" + "T4 — concrete increments" first.** That section is your work queue. This block is the orientation. Everything below is on the working tree, live-verified at `http://localhost:3000`, **nothing committed — review and commit.**

### What shipped this session (verified live, all green)
- **UI Layout: merged the duplicate, then bridged it.** A parallel grid UI canvas had been built alongside the existing free-form Layout GUI Designer — that was the wrong call. It's now one pipeline: the free-form designer is the authoring surface, and the **engine-correct grid descriptor is the compile model**. `src/lib/uiLayout.ts` holds the grid model + `pixelLayoutToGrid` (quantizes free-form `x/y/w/h` widgets → validated row/col/span grid; X4 UI is fTable-native, so absolute pixels clip across resolutions). `src/lib/modCompiler.ts` now emits a responsive `ui/<id>_layout.lua` derived from the designer's widgets. `src/components/UIBuilder.tsx` shows a `→ responsive grid R×C` badge + live pixel validation (`src/lib/uiWidgetValidate.ts`).
- **Selftest state at session end — ALL GREEN:** main `/api/agent/selftest` 10/10, `ui-layout-selftest` 19/19, `ui-widget-validate-selftest` 9/9, `contract-selftest` 19/19, `cue-lineage-selftest` 17/17, `log-telemetry-selftest` 17/17, `extension-doctor-selftest` pass, round-trip lossless. No Vite error.
- **Tier 4 scoped into ROADMAP** (4 levers + per-lever increments + build order). Not built — that's your job.

### Your queue (ranked — full detail in ROADMAP "T4 — concrete increments")
1. **T4.4 Override Visualizer — START HERE.** Cheapest, highest infra-reuse: it extends the existing `runExtensionDoctor` in `server.ts` (already does shared-path collision + load-order sim) with a per-element "who rewrites what, who wins" drill-down. Real test data is already on disk: the mounted 34-mod `extensions/` folder. Inc 1 = `src/lib/overrideMap.ts` engine + `run*Selftest()` + public GET; Inc 2 = drill-down panel in `PackageModDoctor.tsx`.
2. **T4.1 Zero-extraction VFS — keystone, SPIKE FIRST.** Node `.cat`/`.dat` reader (+ PCK/zlib decompress) → SQLite cache (`src/lib/db.ts`) → VFS-backed pickers. **Do Inc 0 only** (parse one cat, extract+decompress one entry against a tiny committed synthetic fixture, public GET selftest) and **stop to confirm the round-trip before any UI.** The game root with the real `.cat` files is one level above the mounted `extensions/` folder (`G:\SteamLibrary\steamapps\common\X4 Foundations`). Format is community-documented, not an Egosoft contract — version the reader defensively.
3. **T4.2 Diff-to-Patch — needs T4.1.** `src/lib/xpathSynth.ts`: tree-diff → minimal `<diff>` ops, prefer id/name selectors over positional `[n]`; selftest must re-apply the generated patch to vanilla and reproduce the edit. Then a twin-pane UI on the existing XML Patching domain.
4. **T4.3 Lua↔MD connector — independent, extends `contractGlue`.** Add a `ui_event` endpoint kind to `src/lib/contractGlue.ts` (raise-event Lua + `event_ui_triggered` listener-cue scaffold). **Do NOT build a third glue system** — point the existing contract generator at the UI-widget→cue case.

### Hard rules (cost us time this session — heed them)
- **One module per capability.** Before writing a new `src/lib/*.ts`, state in the changelog *which existing module it extends*. The UI Layout duplication (build → tear down → re-bridge) was the avoidable cost of skipping this.
- **House pattern, no exceptions:** pure engine module + `run*Selftest()` oracle + public GET endpoint in `server.ts` (`PUBLIC_READONLY_GETS` allowlist), THEN UI, verified in the browser. Selftests are the fast oracle.
- **Large CRLF files truncate under Edit/Write.** `server.ts` (~4.7k lines), `types.ts` (~1.5k), `UIBuilder.tsx` (~900). Edit these via Node bash-heredoc exact-string splices, auto-detect `CR = s.includes('\r\n') ? '\r\n' : '\n'`, parse-check after each write (`ts.createSourceFile` syntactic diags), line-count guard. Deleting a file needs the `mcp__cowork__allow_cowork_file_delete` flow (rm hits EPERM on the mount).
- **The bash sandbox is a STALE mirror** and can't run the Windows-native `node_modules` — **verify in the browser + selftest endpoints, not bash `tsc`/node.** Host Read/Edit/Write are live; the sandbox is fine for parse-checks via the mirrored `node_modules/typescript` only.

### Environment (unchanged)
Split dev servers: Vite **3000** (UI/HMR) + API **3001** (`tsx watch`, `API_ONLY=true`). Editing `server.ts`/`src/lib/*` restarts only the API (~2-3s `/api` 503 gap), the page does not reload; frontend edits are pure HMR. Re-verify in-browser right after any large component edit.

---

## SESSION HANDOFF — 2026-06-11 (8th pass, Claude/Fable: pickup list cleared) → CURRENT

**Read ROADMAP.md changelog "8th pass" for full detail.** Everything on the working tree, live-verified in the browser. Nothing committed — review and commit. Summary:

- **All items from the previous handoff's pickup list are DONE** except the npm-blocked slivers:
  1. Extension Doctor click-through UI ✅ (chips + read-only modal in `PackageModDoctor.tsx`)
  2. SQLite layer ✅ code-complete (`src/lib/db.ts` + mirror-write + `/api/agent/db-selftest`) — **needs `npm install better-sqlite3` + restart-studio.bat**, then re-check db-selftest (`pass:true` expected)
  3. Extension Doctor backlog ✅ folder/id mismatch + load-order winner simulation (XPath overlap still open — needs an XPath lib)
  4. Security Track B remnant ✅ env provider keys now gated to app-UI-origin requests; external agents must send `x-custom-api-key` (**breaking** for env-key-reliant agent scripts — intentional)
- Also done: honest reporting (generate message + selfHealError surfaced), diagnostics click-to-navigate (`navigate-to-source` event), ErrorBoundary un-broken (clean class fields), 120s AI timeouts + analyze Cancel button, CodePreview highlight/diag-map memoization.
- **Selftest state at session end: ALL GREEN** — `/api/agent/selftest` 10/10, `extension-doctor-selftest` pass (9 checks), `round-trip-selftest` lossless, `md-audit` 0.
- Real extension scan is now `{error:0, warning:4, info:14}` (was info:1) — the 13 new infos are accurate folder-vs-id mismatches; demote/collapse in UI if too chatty.
- **Stale-section warning:** sections 0–5 below predate two sessions of fixes (e.g. §2's 0.0.0.0/CORS/no-auth findings are long fixed). Trust this section and ROADMAP's late changelogs over the rest of this file.

**UPDATE (9th pass, same session):** deps are INSTALLED (better-sqlite3 / xpath / @xmldom — `restart-studio.bat` now npm-installs first), SQLite stages 3+4 are DONE (cold-boot restore 230 ms vs 2,156 ms full decode, live parity match), XPath-level selector overlap is DONE (selftest 11/11), and repo hygiene is COMMITTED (`a5e070e`: config.json/temp_import untracked, README + .env.example + config.example.json shipped). See ROADMAP "9th pass" changelog.

**Next obvious work:** object-index-backed editor dropdowns; round-trip editability breadth (wares/jobs/aiscripts parsers); flip reference-validation/Extension-Doctor reads to SQLite; collapse folder-id-mismatch infos in the UI; C2 in-game verification (human step). **Full ranked forward plan: `ROADMAP.md` → Current State → Forward plan.**

**Environment (still true — read before editing).** Split dev servers: Vite on **3000** (UI/HMR), API on **3001** (`tsx watch`, `API_ONLY=true`) — editing `server.ts`/`src/lib/*` restarts only the API (~2-3s `/api` 503 gap), the page does **not** reload; frontend edits are pure HMR. **Verify in the browser + selftest endpoints, not bash `tsc`/node** — the sandbox is a stale mirror and can't run the Windows-native `node_modules`; host Read/Edit/Write are live. The AI-editing pipeline has truncated component files before — re-verify in-browser right after any large component edit.

---

# Archive — superseded session notes (historical)

*Everything below is older session handoffs (Codex / earlier passes) and the original numbered sections 0–5. Several items read as "to-do" but are long done — e.g. the "ONE PENDING ITEM" (click-through UI) in the next block is **DONE** (8th pass), and §2's `0.0.0.0`/CORS/no-auth findings are fixed. Trust the CURRENT section above and `ROADMAP.md` → Current State. Kept for the audit trail.*

---

## SESSION HANDOFF — 2026-06-11 (perf + Extension Doctor + dev-server split) → for Codex

**Read `ROADMAP.md` changelogs "4th–7th pass" + "SQLite persistence layer (design)" for full detail.** Everything below is on the working tree, HMR/live-verified in the browser at `http://localhost:3000`. Nothing is committed — review and commit.

### Dev environment changed (IMPORTANT)
- **Split dev servers.** `restart-studio.bat` launches **two** processes: Vite on **3000** (UI + HMR, browser-facing) and the API on **3001** (`tsx watch server.ts` with `API_ONLY=true`; see `package.json` `dev:api`/`dev:web`). Vite proxies `/api` → 3001 (`vite.config.ts`), injects `.studio-api-token` via a dev plugin, and has a proxy error handler returning a soft 503 during the API-restart gap. Pure-backend entry files (`server.ts`, `install_mod.ts`) are in Vite's `watch.ignored` so they don't full-reload the page.
- Net: editing `server.ts`/`src/lib/*` restarts only the API (~2-3s where `/api` 503s); the page does NOT reload. Frontend edits are pure HMR.

### What landed this session (all verified live)
1. **Large-mod performance** (deadair 868 KB / 12.6k-line MD, 1,294 nodes loads without freezing): `Canvas.tsx` — `nodeToCueMap` rewritten O(cues×links×nodes)→O(n+links) (adjacency map + index-pointer BFS); radar minimap capped to ≤500 sampled dots (`minimapNodes`). `CodePreview.tsx` — `highlightXML`/`highlightCode` skip span-coloring above 100 KB (escaped/monochrome) so big files don't freeze.
2. **Extension Doctor (P-A)** — `server.ts` `runExtensionDoctor(extRoot)` + `GET /api/agent/extension-doctor` (read-only scan of `<x4GamePath>/extensions`): missing deps, duplicate ids, cross-mod file/patch collisions (full-file overrides + identical diff selectors; `t/`,`index/`,`content.xml`,`ui.xml` excluded as merge/per-extension). `GET /api/agent/extension-doctor-selftest` asserts 5 checks (3 positive, 2 negative) → `pass:true`. Real scan `{error:0,warning:4,info:1}`. UI: "EXTENSION DOCTOR" card in `PackageModDoctor.tsx` (DOCTOR tab).
3. **Generated aiscript naming collision FIXED** — `namespaceModAiScripts(ws, modId)` in `server.ts`, called in `buildWorkspaceFileManifest`; prefixes the mod's own aiscript names + job `<task script>` refs with the mod id, leaves base-game refs alone. Verified `aiscripts/testmod.hunter.escort.behavior.xml`.

### THE ONE PENDING ITEM (please finish)
**Extension Doctor click-through UI.** Backend DONE: every finding has `openTargets:[{label,path}]` (ext-root-relative paths) and `GET /api/agent/extension-file?path=<extRel>` returns `{path,name,content}` (read-only, traversal-guarded — verified 200, 1768 bytes). **TODO in `PackageModDoctor.tsx`:** in the EXTENSION DOCTOR findings `.map`, render each `f.openTargets` as small clickable chips; on click `fetch('/api/agent/extension-file?path='+encodeURIComponent(t.path))` and show `content` in a read-only modal (monospace, scrollable, close). State is local to the component (mirror the existing `extScan`/`extError` useState pattern). No cross-component wiring needed.

### Codex pickup list (ranked, all in ROADMAP)
1. Finish the click-through UI (above) — small, self-contained.
2. **SQLite persistence layer** — full design in ROADMAP ("SQLite persistence layer (design)"): `better-sqlite3`, `src/lib/db.ts`, schema DDL, mtime invalidation, integration points, 4-step migration. Solves cold-boot cat/dat re-decode + slow large-workspace serialization.
3. Extension Doctor backlog: XPath-level match overlap, load-order winner simulation, folder-name vs id mismatch.
4. Security gate (Track B): lock CORS, stop privileged routes falling back to env provider keys (API already binds 127.0.0.1).

### Verify-as-you-go
- Selftests are the fast oracle: `/api/agent/extension-doctor-selftest` (keep `pass:true`), `/api/agent/selftest`, `/api/agent/round-trip-selftest`.
- The bash sandbox serves a STALE mirror and can't run the Windows-native `node_modules` — **verify in the browser, not via bash `tsc`/node.** Host Read/Edit/Write are live.
- The AI-editing pipeline has truncated component files before — re-verify in-browser right after any large component edit.

---

## 0. CRITICAL environment caveat (read first)

The build/verification loop here is **non-standard**:

- The repo's **committed `main` is healthy** (`tsc --noEmit` = 0 errors on a clean checkout).
- The local **bash/sandbox mount serves a stale, partially-corrupted snapshot** of the working tree. Running `tsc` there reports phantom truncation errors (`server.ts(1332) Unterminated template literal`, JSX "no closing tag" across files). **These are false.** Do not trust bash `tsc` for this project.
- **Host file tools (Read/Edit/Write) ARE live and correct.** Edits land in the real files the dev server reads.
- **Verification was done via the running Vite dev server** (`npm run dev`, http://localhost:3000) + browser HMR + console. If a change breaks compilation, Vite shows an overlay / the page errors. That's the source of truth here, not bash.

If you have a clean local checkout, prefer real `tsc`. Otherwise verify through the running app.

---

## 1. What this session changed (code)

### 1a. Compiler consolidation (the big one)
There were **three** overlapping compile/save implementations. Now there's one.

- **`src/lib/modCompiler.ts`** is the canonical compiler (`compileAndSaveAll(workspace, dirHandle, mode, options)`).
  - Added `options: { snapshot?: boolean }` param.
  - Added `writeSnapshot()`, `listSnapshots()`, `readSnapshot()`. On compile/sync it writes a timestamped JSON of the workspace to `<modid>/.snapshots/snapshot_<ISO>.json`, pruned to `MAX_SNAPSHOTS = 30`.
  - Mode `'store'` → writes `<linkedDir>/<modid>/` (correct). Mode `'candy'` → dumps into linked root (legacy/dangerous; see TODO).
- **`src/components/CodePreview.tsx`**
  - `saveToDirectory()` (the auto-sync "Ingame File Syncer") and `handleCompileModProject()` were **rewired** to call `compileAndSaveAll(workspace, handle, 'store', { snapshot: true })`. Previously `saveToDirectory` wrote **loose `md/`, `aiscripts/`, etc. into the linked root with no `content.xml`** — that was the litter bug (it polluted the real `extensions/` folder).
  - **Deleted ~260 lines** of duplicate in-component compilers (`toSafeModId`, `toContentVersion`, `escapeXmlAttr/Text`, `compileTFileXML`, `generateContentXML`, `compileScriptToXML`, `compileWaresXML`, `compileJobsXML`, `compileDiffDocument`, `writeTextFile(AtPath)`, `validatePackageReadiness`). They now live only in `modCompiler.ts`. A pointer comment marks where they were.
  - Added a **Version History UI**: a `HISTORY` button (next to `SYNC FILES`, shown when a dir is linked) opens a panel listing snapshots with `Restore` buttons (`restoreSnapshot` → `readSnapshot` → `setWorkspace`, pushes an undo checkpoint first). New state: `snapshots`, `showSnapshots`, `snapshotMsg`.

### 1b. Demo filesystem removed
- **`src/components/DirectoryExplorer.tsx`**: stopped using `MOCK_FILESYSTEM_TREE` (the fake `world_generator_plugin` / `md`/`ui`/`aiscripts`/`t`/`libraries` tree). `fileTree` now inits to `[]`, fallback is `[]`, the demo breadcrumb + "DEMO" badge + `active_mod_workspace` favorite were removed, and the empty state now points users to Settings.
  - **NOTE:** the `MOCK_FILESYSTEM_TREE` constant (~lines 58–200) is now **dead code but still present** — delete it.

### 1c. New unified Directory Settings modal
- **`src/components/DirectorySettingsModal.tsx`** (NEW): one modal managing the three directories the app needs, each with an ⓘ hover tooltip:
  1. **Mod Workspace Folder** — browser `dirHandle` (FS Access picker). Client-session only.
  2. **X4 Game Installation** — server config `x4GamePath` (text input).
  3. **XSD Schema Folder** — server config `xsdSchemaPath` (text input) + live `md.xsd`/`common.xsd` existence check.
  - Loads via `GET /api/schema/config`, saves via `POST /api/schema/config`.
- **`server.ts`**: extended `POST /api/schema/config` to also persist `x4GamePath` (previously only saved `xsdSchemaPath`).
- **`src/App.tsx`**: imported the modal, added `isDirSettingsOpen` state, a `SETTINGS` header button (between AGENT API and RESET), the modal render, and a `Settings as SettingsGear` lucide import.

### 1d. Docs
- **`ROADMAP.md`** (NEW): prototype-validation roadmap (Tracks A/B/C, milestones) + an appendix grading each compiler against Egosoft conventions, including an `A4 — Unify the compilers` sub-track.

---

## 2. Review findings (verified, not assumed)

Tested live against the running app + the app's own loaded `md.xsd` (398 events / 33 conditions / 785 actions) and real on-disk output in the user's `extensions/` folder.

**Security (server.ts) — not yet fixed:**
- Binds `0.0.0.0` (should be `127.0.0.1`), `Access-Control-Allow-Origin: *`, no auth on any `/api/*`. `/api/gemini` & `/api/agent/generate` fall back to `process.env` provider keys → any local webpage or LAN device can burn the user's API credits / overwrite the workspace. This is the top trust risk.

**Agent API gap (verified):** `POST /api/agent/compile` returns only `mission_director_xml` + `ui_layout_xml`. Sent a workspace with tFiles/aiScripts/wares/jobs/xmlPatches populated → all 5 dropped. `POST /api/agent/generate` likewise only emits name/version/author/description/nodes/links/uiWidgets/uiTheme and **overwrites** activeWorkspace, erasing the other domains.

**Compiler correctness vs X4 (see ROADMAP appendix for the table):**
- **MD**: curated node tags (`event_object_changed_sector`, `reward_player`, `create_ship`, …) all exist in real `md.xsd`. Good.
- **Custom XML nodes are NOT validated**: hand-typed `set_object_shieldlevel` → 404 in loaded schema, yet app compiled "0 errors / 0 warnings". The validator (`validateModWorkspace`) checks MD "laws", not the XSD.
- **UI**: the packaged artifact is a fabricated `md_ui_layouts/<id>_ui.xml` (`<ui_menu>` schema X4 ignores). There IS a Lua path (`HUD & Lua UI` → Lua Script Event Manager → `/ui/addon_menu.lua`) but (a) the packager never writes it, (b) it calls invented functions (`RegisterLayout`, `RemoveAllUITriggers`) not X4's Helper/widgetSystem, (c) no `ui.xml` index.
- **content.xml**: `version` must be integer = version×100. `toContentVersion` just concatenates digits → `"2.5"` → `"025"` (read as v0.25). Only correct for `X.YY`-shaped strings.
- **Wares/Jobs/Patches**: diff-as-file pattern is correct, but production recipes, job loadouts, and tags are **hardcoded placeholders** regardless of user input.
- **AIScripts**: `<param type=...>` likely invalid for aiscripts; `<interrupts>` placed as sibling of `<attention>` with `event="..."` attr instead of nested `<conditions><event_object_attacked/></conditions>`. App only loads `md.xsd`+`common.xsd`, **not `aiscripts.xsd`**, so AI scripts get zero schema validation.

**Confabulation:** `AgentBridge` flashes green "Success! …synchronised" regardless of remaining validation diagnostics; the generate pipeline's Phase-4 self-heal swallows failures (`server.ts` ~L1140) then still reports success.

---

## 3. Open TODOs (recommended next, file-pointed)

1. **Delete dead `MOCK_FILESYSTEM_TREE`** in `src/components/DirectoryExplorer.tsx` (~L58–200).
2. **Demo-content exclusion** (user-requested, not built): default AI scripts `hunter.escort.behavior` + `miner.auto.harvest` are seeded in `src/components/AIScriptEditor.tsx` (~L51, L73) and compile by default. Add a per-domain/per-item "include in compile" mechanism, or stop seeding demo content. User leaning: a compile manifest with demo items excluded by default.
3. **Retire/rename `candy` mode** (`'candy' | 'store'` in `App.tsx`/`Sidebar.tsx`/`modCompiler.ts`). `candy` dumps into the root (no mod folder) — keep `store` only, or rename for clarity.
4. **Security hardening (Track B):** bind `127.0.0.1`, lock CORS to app origin, add a per-session token on `/api/agent/*` + `/api/github/*`, stop env-key fallback for non-UI requests.
5. **Honest reporting:** make `AgentBridge` success copy reflect post-validation diagnostic count; surface Phase-4 self-heal failures.
6. **UI domain decision:** make it real (`ui/` + Lua scaffold using X4's actual framework + `ui.xml` index, wired into packaging) OR reframe as MD overlay helpers and drop the `md_ui_layouts` `<ui_menu>` output.
7. **content.xml version fix:** `toContentVersion` should parse semver and emit integer = round(major*100 + minor*... ) per Egosoft (×100 convention).
8. **Load `aiscripts.xsd`** into the schema library so AI scripts get validated; fix `<param>`/`<interrupts>` structure.
9. **Agent API completeness:** route `/compile` + `/generate` + a new `/package` endpoint through the shared `modCompiler.ts` so all 7 domains are covered (fixes the drop/omit bugs).
10. **Round-trip + XSD harness (Track A1/A2):** golden-file import→export→diff tests; validate generated XML against real XSDs.
11. **Auto-sync vs validation:** `compileAndSaveAll` calls `validatePackageReadiness` which throws on errors (e.g. no cue / no name). With auto-sync on every edit, this can block snapshots mid-edit. Consider letting snapshots write even when the package isn't fully valid.

---

## 4. Housekeeping
- Pre-fix leftovers in the user's game folder: `extensions/md/` and `extensions/aiscripts/` (loose, no `content.xml`) — safe to delete; they're from the old buggy auto-sync path.
- The real end-to-end on-disk test (link sandbox folder → comp