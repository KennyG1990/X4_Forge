# Session handoff — B119 `0.0.75` installed agreement sheet verified; current X4 `1e` proof open

Date: `2026-09-07`
Project: `F:\DEV_ENV\X4_Forge`
Status: bounded canonical frame-table repair, public/installed `0.0.75`, and installed nonzero agreement-sheet replay
`VERIFIED`; overall B119 `IN_PROGRESS / PARTIAL / Not verified in game`

## Session-start brief

- **Project identity:** X4 Forge B119, the linter-first source-faithful X4 Lua UI editor; GitHub owner #41.
- **Eyeball queue:**
  1. Current X4 agreement sheet: launch X4 -> load the proving save -> `Speak to AI` -> seed a proposal -> invoke the
     agreement sheet through a valid native control or registered debug path -> capture it -> close normally -> exit X4
     -> inspect the scoped debuglog. Do not infer success from Forge, deployment, or absence of a Lua error.
  2. Full AI Influence benchmark: in Antigravity -> X4 Forge Studio -> workspace `x4 AiLive` -> `HUD & Lua UI` ->
     `X4 SOURCE PREVIEW`; reproduce each exact source/target and owner-issued path/loop/sample authority for the compact
     direction, expanded COMM, proposal/sheet, and hub tabs; compare each visible result with the original-detail
     supplied references. Keep runtime-built or unresolved content absent rather than guessed.
- **Commit question:** the prior close `1fb1bd784f60b19a3abc5deba91510b8228d86f2` is pushed. The `0.0.75` source and
  release checkpoint is published and installed but not yet committed at this handoff snapshot. Run final exact-path
  precommit, stage only the owned paths below, commit/push, then write and read back GitHub/Notion/Drive projections.

## Current bounded repair

- Exact source: `F:\DEV_ENV\projects\Mods\X4Mods\x4_ai_influence\ui\addons\ai_influence_chat\aic_sheet.lua`.
  SHA-256: `A0D38877D74A4F196B78A3B70ECFAF08956BDEA4C9287FD110665A3F3DCE9A37`; target `sheet.display`; selected
  data-present path `98-101`, note-present path `158-169`, clause and save-diff loops both `4/4`, all `55/55` issued
  scenario samples.
- **[REPRODUCED]** `scene-frame-tables` falsely refused the authority-complete source because runtime loop execution
  interleaved clause/note tables while Scene emitted tables in stable source order. Both ledgers contained the same
  valid tables in different order.
- `src/lib/x4UiScene.ts` now sorts each frame's referenced table IDs by the same source-offset/ID contract used for the
  emitted Scene table ledger before strict comparison. No weaker set comparison or missing-table tolerance was added.
- `src/lib/x4UiPaintPlan.selftest.ts` embeds the exact portable source fixture, asserts its SHA and complete authority,
  and proves the repaired source reaches one partial Scene (`1` frame, `17` tables, `16` rows, `40` cells, `31`
  widgets, `34` texts, `276` glyphs, `240` gaps) and partial Paint (`767` commands, nonzero geometry) with exact
  `Not verified in game` / `gameVerified:false` truth.

## Validation and release evidence

- Focused gates: Scene `179/179`; Paint `212/212`; hostile Paint Phase 6C `51/51`; TypeScript, scoped ESLint, and
  exact-path diff hygiene green.
- Full gates: installed runtime oracles `134/134`; accepted serial E2E rerun `106/106` in `8.7m`, zero
  failed/flaky/bad/quarantined, JSON verdict, `treeGone=true`; production build `1,848` modules; Graphify refreshed to
  `10,586` nodes / `26,687` edges / `332` communities; complete precommit green. The first E2E attempt ended after 62
  tests with child exit `0xC0000409`; it was rejected, lifecycle cleanup was verified, and the unchanged rerun is the
  accepted evidence.
- Public/local VSIX: `F:\DEV_ENV\X4_Forge\vscode-extension\x4-forge-studio-0.0.75.vsix`, `26,316,960` bytes,
  SHA-256 `F3662F134C4023B156DAD2F264AFDC8330B758D529E9DCD13CE19ED3EA4FF36`. OpenVSX direct/latest and the independent
  download at `C:\Users\Moshi\AppData\Local\Temp\x4forge-openvsx-parity-20260907-1837\x4forge.x4-forge-studio-0.0.75.vsix`
  match exactly. Version `0.0.75` was published once; do not republish.
- Installed rollback: `C:\Users\Moshi\AppData\Local\Temp\x4forge-installed-0.0.75-20260907-140525-f6d5f95e9eef4b5094e51e719005dfaf\x4forge.x4-forge-studio-0.0.74`.
  Installed `0.0.75` package parity is exact apart from expected IDE `.vsixmanifest`; installed runtime oracles are
  `134/134`.

## Installed visual result and honest boundary

- The installed editor selected workspace `x4 AiLive · 806765`, exact source/target above, both selected paths, both
  loops at `4/4`, and all `55/55` sample values. One current/export-eligible `2560x1440` Canvas visibly rendered the
  complete source-authored agreement sheet with clauses, notes, four cost rows, and three footer actions. Permanent
  truth copy remained `Preview evidence only · Not verified in game`.
- Original-detail comparison against
  `C:\Users\Moshi\Desktop\# AI Influence mod UI design\design_handoff_ai_influence\screenshots\1e-gate-agreement-sheet.png`
  is `VISUALLY DIVERGENT`: current source says `TERMS OFFERED` and `WHAT THIS COSTS YOU`; the reference says
  `PROPOSED AGREEMENT` and `WHAT CHANGES IN YOUR SAVE`; source buttons are equal thirds while the reference uses
  unequal widths; synthetic `CLAUSE-*` values clip in the source's 8% gutter; dynamic `toneColor(d.tone)` samples do
  not visibly paint every right-side value.
- Export eligibility was visible, but the browser download-event wait timed out and reset the CUA session before a
  Save As/file receipt. Do not claim exported-file proof from this run. A stale CUA trusted worker had also grown to
  roughly 3 GB and was removed by resetting the CUA runtime; keep future browser automation bounded.
- No current X4 `1e` capture was produced. The normal source path still depends on the extra non-rendering `REVIEW`
  control, and this runtime exposed no native-app CUA surface. The installed Forge result proves this bounded
  source-to-preview pipeline, not X4 C++ frame acceptance, player-visible parity, or universal 1:1 behavior.

## Owned paths and preservation boundary

- Tracked source/release paths for the pending source commit:
  `src/lib/x4UiScene.ts`, `src/lib/x4UiPaintPlan.selftest.ts`,
  `vscode-extension/package.json`, `vscode-extension/release-notes.json`,
  `vscode-extension/CHANGELOG.md`, `docs/plans/2026-09-05-b119-ai-influence-visual-dogfood.md`, `BACKLOG.md`, and this
  file.
- Ignored evidence intentionally remains outside Git:
  `dev-docs/b119-ai-influence-dogfood/visual-release-20260905/CENSUS.md`, installed/package/download artifacts, and the
  external UI quick-reference card 59.
- Preserve every other modified, deleted, or untracked repository path. In particular, do not stage the unrelated
  onboarding/bugs/data/docs/scripts changes, `test-results/.last-run.json`, existing evidence PNGs, `media/`, package
  workspace files, or the untracked marketing showcase spec.

## Close, projections, and next unit

- Project AAR now records the failed-first E2E, corrected release-worker cwd, missing inspector argument, null install
  exit-code wrapper, browser-field concurrency, export timeout, stale CUA worker, and untracked E2E inventory hazard.
  UI quick-reference card 59 records canonical child-ledger ordering. No capability-map delta and no cross-project AAR.
- After the exact source commit/push, update and read back GitHub #41, Notion page
  `3b84618e-d15b-8190-821e-c0eb96f43d5a`, and Google Current Status document
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, with the source hash, package hash, installed visual
  result, and the same overall `PARTIAL / Not verified in game` boundary. Then record those receipts in a docs-close
  commit and assert local/upstream/direct-remote equality.
- The next bounded B119 unit is a valid current native X4 invocation and capture for `sheet.display`, followed by only
  source-backed corrections toward the `1e` reference and the remaining twelve-image census. Do not rebuild the
  renderer, republish `0.0.75`, or mark GitHub #41 complete.
- Security action remains: rotate/revoke the OpenVSX PAT exposed during the earlier `0.0.73` token-bearing terminal
  title. The `0.0.75` publication did not expose the PAT in an argument or output.
