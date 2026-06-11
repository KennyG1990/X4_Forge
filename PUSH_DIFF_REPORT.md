# Push / Diff Report — 2026-06-11

**Repo:** https://github.com/KennyG1990/X4-Foundations-Mod-Studio
**Target branch:** `main`
**Local working copy:** `C:\Users\Moshi\.gemini\antigravity-ide\scratch\X4-Foundations-Mod-Studio`

> ⚠️ **This push must be run from your Windows machine.** The assistant's sandbox
> can run `git` only against a stale snapshot of the repo taken at the start of
> the session, so it cannot commit the real edits. The real, correct files are on
> your disk (the running dev server uses them and all features verified live).
> Run the commands in the "How to push" section below in a terminal.

---

## Summary

Four correctness engines plus supporting plumbing, all verified live against the
real X4 install (`G:\…\X4 Foundations`) and schemas (`F:\…\X4Mods\Schemas`) through
the running studio at `http://localhost:3000`.

| Area | Before | After (verified) |
|---|---|---|
| Object index — ships / stations / factions / sounds | 0 / 0 / 0 / 0 (loose only) | **694 / 932 / 33 / 3783** across 64 packed archives |
| Patch base-file resolution | loose only (packed → 404) | decodes packed `.cat/.dat` base files |
| MD/AI validation | heuristic only | **real XSD** (1478 elements) enum/required/unknown checks |
| UI packaging | non-standard `md_ui_layouts/<ui_menu>` (X4 ignores) | X4-correct `ui.xml` + `ui/<id>.lua` |
| Round-trip import→export | dropped unmodeled files | **lossless** (passthrough preserved byte-identical) |

---

## Files changed

### New files
| File | Purpose |
|---|---|
| `src/lib/x4CatDat.ts` | X4 packed archive reader: parses `.cat` manifests, positioned reads into `.dat`, additive-catalog merge across base + DLC, single-file and base-only extraction, debug scan. |
| `src/lib/xsdValidate.ts` | Schema-backed validation engine. Builds an element→attribute index from `md.xsd`/`common.xsd` (with named-complexType + base-extension resolution) and validates XML for enum violations, missing-required, unknown attributes, and unknown elements with line numbers. |

### Modified files
| File | Change |
|---|---|
| `src/lib/x4ObjectIndex.ts` | Refactored `scanXmlFile`→`scanXmlContent`; added `index/macros.xml` catalog parsing + macro classification; integrated packed `.cat/.dat` scanning (additive, no dedupe) with `packedArchives`/`packedEntriesScanned` stats. |
| `src/types.ts` | Added `generateUIIndexXML()` (X4 `ui.xml` `<addon>` index) and `generateUILuaScript()` (real `Menus`/`Helper` registration, no invented API); added `PassthroughFile` type + `ModWorkspace.passthroughFiles` and its `sanitizeWorkspace` normalization. |
| `src/lib/modCompiler.ts` | Client-side folder writer now emits `ui.xml` + `ui/<id>.lua` instead of `md_ui_layouts/`; imports updated. |
| `src/lib/modDoctor.ts` | UI-domain diagnostics retargeted to `ui/<id>.lua`; replaced "preview schema" warning with an honest `ui.lua_scaffold` info note. |
| `server.ts` | New imports (`os`, x4CatDat helpers, xsdValidate, `parseXMLToWorkspace`); `getObjectIndex` passes cat/dat roots; `getSchemaIndex` + `runSchemaValidation` wired into `/api/agent/compile` and `/api/agent/package`; UI manifest + folder writer emit `ui.xml`+lua; passthrough emission in `buildWorkspaceFileManifest`; `/api/patch/base-content` packed fallback; new endpoints: `mod-folder/import`, `round-trip-check`, `round-trip-selftest`, `catdat-debug`, `xsd-debug`; schema-doc strings updated. |
| `ROADMAP.md` | 2026-06-11 changelog, confidence-score updates, reconciled the stale `pos`/XPath appendix contradiction, added ranked "Next priorities". |

### New / changed API endpoints
- `GET  /api/agent/object-index` — now decodes packed archives (adds `packedArchives`, `packedEntriesScanned`).
- `GET  /api/patch/base-content` — falls back to packed base-game extraction.
- `POST /api/agent/compile` and `/api/agent/package` — now include real XSD diagnostics.
- `POST /api/agent/mod-folder/import` — folder importer with lossiness report.
- `POST /api/agent/round-trip-check` + `GET /api/agent/round-trip-selftest` — round-trip harness.
- `GET  /api/agent/catdat-debug`, `GET /api/agent/xsd-debug` — diagnostics for agents/devs.

---

## Verification evidence (live, browser)
- Object index: ships **694**, stations **932**, factions **33** (argon/boron/paranid/split/teladi/terran/xenon/khaak…), sounds **3783**, wares **1950**, **64** archives.
- Patch base-content: `libraries/factions.xml` → 52 KB real packed content (was 404).
- XSD engine: **1478** elements; controlled bad sample → exactly 3 intended findings, **0 false positives**; confirmed real generator bugs (`create_ship@faction`, `<space>`).
- UI compile: emits `ui.xml` + `ui/<id>.lua`, no `md_ui_layouts`.
- Round-trip self-test: **lossless = true** (unmodeled files byte-identical).
- App loads with **no console errors**.

---

## Suggested commit message

```
feat: packed .cat/.dat decoder, real XSD validation, X4-correct UI packaging, lossless round-trip

- x4CatDat.ts: decode packed X4 archives; object index now reads real
  ships/stations/factions/wares/sounds (0 -> 694/932/33/1950/3783, 64 archives)
- xsdValidate.ts: schema-backed MD/AI validation from md.xsd/common.xsd
  (1478 elements; enum/required/unknown-attr/unknown-element w/ line numbers)
- UI: drop non-standard md_ui_layouts <ui_menu>; emit X4-correct ui.xml addon
  index + ui/<id>.lua using real Menus/Helper registration
- round-trip: ModWorkspace.passthroughFiles preserves unmodeled files
  byte-identical; add mod-folder/import + round-trip harness endpoints
- patch base-content resolves packed base files; compile/package now return
  real XSD diagnostics
- ROADMAP: 2026-06-11 changelog, confidence updates, reconcile stale appendix
```

---

## How to push (run on your Windows machine)

Open a terminal in `C:\Users\Moshi\.gemini\antigravity-ide\scratch\X4-Foundations-Mod-Studio`.

```powershell
# 1. Sanity check
git status

# 2. (ONLY if step 1 prints "fatal: index file corrupt")
#    Rebuild the index from HEAD — this keeps all your working changes:
Remove-Item .git\index
git reset

# 3. Review what will be committed
git status
git diff --stat

# 4. Stage everything and commit
git add -A
git commit -F - <<'MSG'
feat: packed .cat/.dat decoder, real XSD validation, X4-correct UI packaging, lossless round-trip
MSG
# (or: git commit -m "feat: packed cat/dat decoder, real XSD validation, X4-correct UI packaging, lossless round-trip")

# 5. Confirm you're on main, then push
git branch --show-current      # should print: main
git push origin main
```

If `git push` asks for credentials, complete the GitHub sign-in yourself (do not
share tokens here). If `main` has diverged on the remote, run `git pull --rebase
origin main` first, resolve any conflicts, then push again — do **not** force-push.

> Note: there are local branches `main` (current) and `Dev`. The commands above
> push `main`. If you intended `Dev`, swap the branch name in steps 4–5.
