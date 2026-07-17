# B59a · Patch-day readiness check — SPECIFIED 2026-07-17

Lane: **FULL** (new validation-adjacent capability; user-facing finding surface).
Source: `docs/research/2026-07-17-community-gap-map-round2.md` Finding 2. Goal-driven build
(Ken, 2026-07-17): the B59 menu, unit a first.

## Bounded goal
When Egosoft ships a game update, a mod's `<diff>` patch **selectors** may no longer match the
changed vanilla files — the patch then silently fails to apply, and modders currently hand-hunt
this. This tool diffs a mod's patch selectors against OLD vs NEW vanilla data and reports which
patches will silently miss after the update.

## Reconcile (verified 2026-07-17 — carriers all exist; this is COMPOSITION, not new analysis)
- **Selector evaluation** — `overrideMap.ts` already evaluates a selector against parsed base
  content via `xpathLib.select(sel, doc)` (element nodeType 1 / attribute nodeType 2, bounded by
  MAX_SELECTOR_EVALS/MAX_MATCHES). Reuse the same idea: "does this selector still match" =
  `xpathLib.select(sel, parse(content)).length > 0`.
- **Reading vanilla per version** — `x4CatDat.extractBaseGameFile(gameRoot, relPath)` reads a
  vanilla file (loose or packed) from a GIVEN game root. Call it with two different roots →
  old vs new content for the same file. (The Extension Doctor already uses this pattern.)
- **The mod's selectors** — `PatchBlock.sel` on emitted patches; the Doctor/overrideMap collect
  `OverrideRecord.selectors` from installed mods' diff files; `loadProjectFromDisk` + routing
  identify `<diff>` files in a mod folder.
- **Absence proven** (src/lib + server.ts): no existing old-vs-new / version-diff / patch-breakage
  capability. `readiness.ts` is the B36 UX ladder (unrelated); `overrideMap` is cross-mod
  conflict (same version). Capability-map delta = NEW.

## Design (house pattern: pure engine + oracle + endpoint + MCP tool)
**`src/lib/patchReadiness.ts`** — pure, resolver-injected (testable without a game install):
```
analyzePatchReadiness({
  patches: [{ targetFile, selectors: string[] }],
  resolveOld: (targetFile) => string | null,   // vanilla content in the OLD version
  resolveNew: (targetFile) => string | null,   // vanilla content in the NEW version
}) => { findings: PatchReadinessFinding[], summary: {...} }
```
Per selector verdict (via `xpathLib.select` against each version's parsed doc):
- `matchedOld && matchedNew` → **ok** (still applies).
- `matchedOld && !matchedNew` → **BROKEN** (headline: patch will silently miss post-update).
- `!matchedOld && !matchedNew` → **unresolved** (targets another mod's addition / bad selector —
  NOT a patch-day break; info).
- `!matchedOld && matchedNew` → **now_matches** (info; targets something new).
- targetFile absent in NEW root → **target_file_removed** (severe; every selector broken).
- targetFile bytes differ old→new → `fileChanged: true` context flag on the file group.
Bounds mirror overrideMap. A malformed selector (`xpathLib.select` throws) → `unresolved`, never
a crash. WARNING-severity by default (advisory), like the cry-wolf discipline — never blocks.

**`GET /api/agent/patch-readiness`** (authed; add to PUBLIC or auth per pattern) —
`?fromPath=<mod>&oldRoot=<path>&newRoot=<path>` (newRoot defaults to the configured game path).
Loads the mod's diff patches, wires `extractBaseGameFile(oldRoot,…)` / `(newRoot,…)` as the
resolvers, returns findings. Degrades honestly if a root is missing.

**MCP tool `check_patch_readiness {fromPath, oldRoot, newRoot?}`** — surfaces BROKEN selectors to
IDE-resident agents (same one-currency finding shape).

Oracle `runPatchReadinessSelftest()` (synthetic two-version fixtures, no game install):
still-valid selector → ok · old-only selector (structure changed) → BROKEN · removed target file
→ target_file_removed · unresolved selector → info · malformed xpath → unresolved-not-crash ·
fileChanged flag set when content differs.

## Acceptance contract
- Oracle green (auto-discovered by sweep).
- **Two-corpus live proof:** build a fixture mod whose patch selector matches a vanilla file in
  the real unpacked 9.00, then a synthetic "new" root where that file's structure changed →
  endpoint reports exactly one BROKEN finding; a control selector that still matches stays `ok`.
- **Negative path:** a still-valid selector never flagged; a mod with no diffs → empty, no crash;
  missing oldRoot → honest "old reference unavailable", not a false green.
- tsc/lint/precommit green · sweep · e2e 19/19.
- Evidence in the ROADMAP close.

## Risks & boundaries
- Cry-wolf: findings are advisory WARNING; a selector that legitimately targets another mod's
  content resolves to `unresolved`, never BROKEN. Never blocks a build.
- Perf: bounded selector evals + cat/dat reads; only the mod's own patch target files are read.
- Out of scope: auto-FIXING broken selectors (report only); snapshotting vanilla per version
  (v1 takes two explicit roots — matches Ken's unpacked-corpus setup); non-selector breakage
  (renamed macros/wares referenced in content — that's B46 Phase 3 reference-set territory).
- Rollback: single-commit revert; new file + additive endpoint/tool only.

## Publish/commit (per standing flow)
Publish-before-commit if the extension bundle changes (the MCP tool ships in the VSIX → yes):
bump → changelog → stage → build → package → staged probe → ovsx publish → then git commit+push.
