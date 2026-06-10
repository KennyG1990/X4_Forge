# X4 Mod Studio — Handoff Notes

Context for the next coding agent. This captures a review pass + a compiler/directory refactor done on the `main` branch working tree. Pair this with `ROADMAP.md` (strategy) — this file is the "what changed and what's left" companion.

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
- The real end-to-end on-disk test (link sandbox folder → compile → confirm clean `<modid>/`) was **not** run — it needs the user to pick a folder via the OS picker.
