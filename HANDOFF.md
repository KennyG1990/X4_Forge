# X4 Forge — Handoff Notes

Context for the next coding agent. This captures a review pass + a compiler/directory refactor done on the `main` branch working tree. Pair this with `ROADMAP.md` (strategy) — this file is the "what changed and what's left" companion.

---

## ⚠ STANDING RULE — close EVERY task with `x4-forge-confirm` (2026-06-18)

**Before marking ANY task done, run the `x4-forge-confirm` skill:** open the exact UI you
just changed in Claude in Chrome, click/use it like a user, **screenshot and SEE it does
exactly what you intended**, confirm the back-end effect (read the file/endpoint via
`/api/run_command`), run the cheap host gate (`typecheck` + the relevant `*-selftest`;
`test:canvas` if you touched the canvas), then update `ROADMAP.md` with the verification
line. A green badge / passing oracle is a claim; the visual confirmation is the proof. This
is the mandatory close-out — not optional, every task. (Whole-app adversarial pass =
`x4-forge-calibrate`; full release discipline = `x4-forge-validate`.)

## ⚠ VALIDATION DISCIPLINE — CORRECTED 2026-06-18 (supersedes the "verify in the browser, not tsc / sandbox can't run node_modules" lines in every older entry below)

**"Validate through the browser" means VISUALLY verify with Claude in Chrome — actually SEE it.** For any UI change: navigate the running app, **click through the real control, and take a screenshot and look at it.** Reading DOM text / `data-testid` via `javascript_tool` is a weak proxy, not the bar. If a user would see it, you look at it.

**The agent CAN run the full host toolchain — do NOT punt gates to the operator.** The Forge server runs on the Windows host and exposes `GET /api/run_command?cmd=...` (Node `child_process.exec`, cwd = repo root). Through Chrome in-page `fetch` the agent runs the REAL Windows toolchain and reads results (response `error` === null ⇒ exit 0):
- `npm run typecheck`, `npm run lint`, `npm run precommit:check`, `npm run test:canvas`, `node scripts/oracle-sweep.mjs`.
Run them yourself after every code change and self-correct. This is also the truncation safety net (typecheck after each write catches a truncated file immediately). The sandbox `bash` is a stale Linux mirror that can't run the Windows `node_modules` — quick reads only; host `run_command` + the browser are the source of truth. (NOTE: editing the `x4-forge-validate` skill prompt doesn't persist from a session — update it via Settings → Capabilities; this entry is the persistent record.)

---

## SESSION HANDOFF — 2026-06-12 (43rd pass: Load Mod Project + import integrity)

**What shipped this session (all browser-verified on `localhost:3000`):**

1. **Load Mod Project UI** — `SyncModal.tsx` rebuilt as a two-tab modal. Primary tab: searchable mod-candidate browser from configured workspace, Ego/DLC hide toggle, selected-project summary (file count + subdirectories), import-contract preview. Secondary tab: legacy single-file JSON/XML parser.
2. **Auto-save global lift** — `autoSaveEnabled` state moved from component-local `useState(true)` in `CodePreview` to shared App-level `useState(false)`. Passed through `Sidebar` → `DiagnosticsHub` (Playtest toggle) and `CodePreview` (auto-compile guard). `SyncModal` calls `setAutoSaveEnabled(false)` on every load event.
3. **Binary passthrough preservation** — `importModFolder` (`server.ts`) reads non-text files as `base64` into `passthroughFiles`; `compileWorkspaceToFolder` writes them back (generated files win path collisions).
4. **Node.js DOMParser polyfill (critical fix)** — `src/lib/xmlParser.ts` conditionally imports `@xmldom/xmldom` when native `DOMParser` is unavailable (Node.js). This was the root cause of imported mod-folders rendering as empty graphs — `parseXMLToWorkspace` threw a silent `ReferenceError` server-side.

### Files changed
- `src/components/SyncModal.tsx` — full rebuild
- `src/App.tsx` — `autoSaveEnabled` state + props passed to Sidebar/CodePreview
- `src/components/Sidebar.tsx` — accept + pass `autoSaveEnabled`/`setAutoSaveEnabled` to DiagnosticsHub
- `src/components/DiagnosticsHub.tsx` — accept optional external `autoSaveEnabled`/`setAutoSaveEnabled` props
- `src/components/CodePreview.tsx` — accept external `autoSaveEnabled`/`setAutoSaveEnabled`, remove local default
- `src/lib/xmlParser.ts` — environment-aware DOMParser/XMLSerializer polyfill
- `server.ts` — binary file reading in `importModFolder`, passthrough write-back in `compileWorkspaceToFolder`

### Verification
- `npm run typecheck` ✅, `npm run build` ✅
- Browser subagent verified: file-explorer click → graph populates; Load Mod Project → graph populates; Playtest auto-save unchecked after load.

### Next
Continue with the existing forward plan in ROADMAP.md (Packed Extension Doctor Inc 2, ESLint, public-release prep, C2 capstone).

---

## SESSION HANDOFF — 2026-06-12 (Tier 4 COMPLETE) → NEXT: code review + lint/quality pass [SUPERSEDED by 43rd pass above]

**All four Tier 4 levers are shipped, browser-verified, and COMMITTED** (35th–37th passes; see ROADMAP changelogs). Ken's directive for the next session: **code review and linting/quality review** over the Tier 4 surface before any new capability work.

### ⚠ PENDING HOST-SIDE COMMIT (do this first, from Windows — NOT the sandbox)
The sandbox mount's git object database broke mid-session (mkstemp/create fails in .git/objects; a commit attempt was safely rolled back — repo verified healthy at 5ebf5b2, fsck clean, reflogs scrubbed). The 38th-pass hygiene changes are ON DISK but uncommitted. From a host terminal in the repo root run:

    git add .gitignore package.json tsconfig.json
    git rm --cached HANDOFF.md ROADMAP.md PUSH_DIFF_REPORT.md use_agent_api.py
    git commit -m "chore(review): tsconfig exclude + @types/react pins + move working docs to git-ignored dev-docs/"
    npm install   # or run restart-studio.bat — installs the pinned @types/react, clearing the 6 ErrorBoundary tsc errors

**New hard rule:** do NOT attempt git commits from the sandbox mount anymore — object-DB writes are broken (ref, index, and log writes still work; the GIT_INDEX_FILE recipe is no longer sufficient). Commit from the host or via the IDE.

### Code-review queue — STATUS AFTER THE 38th-PASS REVIEW (see ROADMAP changelog)
Items 1–3 and 6's editor half are **DONE** (compilers unified, selector builders unified, simulateLoadOrder extracted + endpoint no longer re-scans, kind-flip clears method/path). Item 4 (ESLint) and the @types/react install are **pinned but blocked on one host `npm install`** (run `restart-studio.bat`). Item 5 (CRLF/.gitattributes) still needs Ken's decision. NOTE: docs now live in git-ignored `dev-docs/` per Ken's directive.

### Original queue (carry-forward findings from the build sessions)
1. **Duplicate diff compilers** — `modCompiler.compileDiffDocument` AND a component-local copy in `XMLPatchSystem.tsx` (~line 724). Both now emit `attrType` correctly, but the duplication already caused one real bug this session (the local copy silently dropped `type=`). Unify: component should import the modCompiler version (it lacks escaping too — `b.sel` is interpolated raw).
2. **ui_event editor rough edge** — `addEndpoint` seeds `method`/`path`; flipping kind to ui_event leaves them set, triggering the (correct) advisory warning. Clear method/path on kind change.
3. **`overrideMap.ts` / `xpathSynth.ts` shared helpers** — both build element paths with id/name predicates (`describeElementPath` vs `selectorFor`). Near-duplicates; consider one shared module.
4. **Lint pass** — no ESLint config in the repo; `any` is pervasive in endpoint glue; the new engines are typed but the server endpoints aren't.
5. **CRLF hygiene** — repo HEAD is now mixed (server.ts/contractGlue/ContractEditor/xpathSynth/overrideMap/x4CatDat = LF; the three T4.2 component files committed as CRLF; ~35 other files still CRLF-on-disk vs LF-in-HEAD noise). A `.gitattributes` (`* -text`) + one renormalize commit would end the churn — get Ken's sign-off first.
6. **T4.3 canvas arrow (deferred feature, not a defect)** — alternate entry point to the ui_event generator from the UI designer canvas.

### Session-learned hard rules (ADDITIONS to the ones below)
- **The Edit-tool truncation hazard applies to ANY sizeable file** (it truncated 410-line `PackageModDoctor.tsx` mid-write). Default to node exact-string splices (read → detect EOL → unique-anchor replace → line-count guard → write → `ts.createSourceFile` parse-check) for ALL code edits.
- **Git through the mount:** `git update-index --really-refresh` corrupts `.git/index` (NUL signature), and eventually plain `git add` did too. Reliable recipe: `rm -f .git/index` → stage/commit with `GIT_INDEX_FILE=/tmp/<x>` → afterwards `rm -f .git/index && git read-tree HEAD`. Locks/temp objects (`*.lock`, `tmp_obj_*`) need manual cleanup after every git op (EPERM on unlink through the mount; the cowork delete-permission flow enables `rm`).
- **The Antigravity IDE auto-commits concurrently.** It committed this session's code out from under two of my commits (`322b407`, `c4991c4`, `609fe34`). Always `git log` BEFORE committing and verify HEAD content AFTER (`git show HEAD:<file> | grep <marker>`) rather than trusting the staged diffstat.

### Selftest battery at session end (all green, browser-verified)
main `selftest` 10/10 · `override-map-selftest` 11/11 · `catdat-selftest` 12/12 · `xpath-synth-selftest` 12/12 · `contract-selftest` 24/24 · `extension-doctor-selftest` pass · `round-trip-selftest` lossless · `ui-layout-selftest` 19/19 · `cue-lineage-selftest` 17/17 · `md-audit` 0.

---

## SESSION HANDOFF — 2026-06-12 → FOR FABLE (UI bridge shipped; Tier 4 scoped & ready to build) [SUPERSEDED — Tier 4 is now built; kept for the audit trail]

**Read `ROADMAP.md` → "Tier 4 — ecosystem levers" + "T4 — concrete increments" first.** That section is your work queue. This block is the orientation. Everything below is on the working tree, live-verified at `http://localhost:3000`, **nothing committed — review and commit.**

### What shipped this session (verified live, all green)
- **UI Layout: merged the duplicate, then bridged it.** A parallel grid UI canvas had been built alongside the existing free-form Layout GUI Designer — that was the wrong call. It's now one pipeline: the free-form designer is the authoring surface, and the **engine-correct grid descriptor is the compile model**. `src/lib/uiLayout.ts` holds the grid model + `pixelLayoutToGrid` (quantizes free-form `x/y/w/h` widgets → validated row/col/span grid; X4 UI is fTable-native, so absolute pixels clip across resolutions). `src/lib/modCompiler.ts` now emits a responsive `ui/<id>_layout.lua` derived from the designer's widgets. `src/components/UIBuilder.tsx` shows a `→ responsive grid R×C` badge + live pixel validation (`src/lib/uiWidgetValidate.ts`).
- **Selftest state at session end — ALL GREEN:** main `/api/agent/selftest` 10/10, `ui-layout-selftest` 19/19, `ui-widget-validate-selftest` 9/9, `contract-selftest` 19/19, `cue-lineage-selftest` 17/17, `log-telemetry-selftest` 17/17, `extension-doctor-selftest` pass, round-trip lossless. No Vite error.
- **Tier 4 scoped into ROADMAP** (4 levers + per-lever increments + build order). Not built — that's your job.

### Your queue (ranked — full detail in ROADMAP "T4 — concrete increments")
1. **T4.4 Override Visualizer — COMPLETE (35th pass, both increments browser-verified).** Engine: `src/lib/overrideMap.ts` (per-element claims + load-order winner, base resolution via xpath/@xmldom, honest string fallback), selftest 11/11, public `GET /api/agent/override-map-selftest`, authed `GET /api/agent/override-map?file=`. UI: OVERRIDE MAP chip on `xml_patches` collision findings in `PackageModDoctor.tsx` → modal (resolution badge, load order, claims, contested/merged, crown winner). Verified on the real 34-mod install. **Next: T4.1 VFS spike (Inc 0 only — stop after the cat/dat round-trip proof).** NOTE: the Edit-truncation hazard hit `PackageModDoctor.tsx` (410 lines) — treat the node-splice recipe as the default for ANY .tsx/.ts edit, not just the big three. `server.ts` is now LF on disk and in the repo.
2. **T4.1 Zero-extraction VFS — COMPLETE (36th pass, re-scoped honestly).** The reader already existed (`x4CatDat.ts`, production-proven); the spike added the missing halves by EXTENDING it: `decodeEntryBuffer` (gzip/zlib magic-sniff, graceful raw fallback), `.pck` alias resolution, `runCatDatSelftest()` **12/12** (synthetic tmpdir fixture), public `GET /api/agent/catdat-selftest`. Inc 1 (SQLite content cache) deferred as perf-only; Inc 2 (VFS pickers) was already shipped in the 11th pass. **Next: T4.2 diff-to-patch** — its T4.1 dependency is now proven.
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
- **Custom XML nodes are NOT validated**: hand-typed `set_object_shieldlevel` → 404 in loaded schema, yet app compiled "0 errors / 0 