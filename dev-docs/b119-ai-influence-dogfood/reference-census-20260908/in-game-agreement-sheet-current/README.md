# B119 `1e` agreement-sheet current native receipt

Date: `2026-09-08`

Status: `VERIFIED` for the bounded `1e` agreement-sheet correction unit. Overall B119 remains
`IN_PROGRESS / PARTIAL`.

This receipt records the source-backed correction of the current `aic_sheet.lua -> sheet.display` route. It does not
close the twelve-reference AI Influence census, claim full B119 completion, claim pixel-perfect parity, or establish
universal arbitrary-Lua/Helper/widget/C++ acceptance.

## Source correction and deployment identity

- Forge HEAD and `origin/main` before this unit: `859e81fbad829242ddd5e13232617b0269099e28`.
- AI repo HEAD and `origin/master` before its pending source commit: `4c0a422b7e3d0f492b572b9da8d2d7ea19a2b453`.
- Current AI source and deployed Lua: `12,655` bytes, LF-only, SHA-256
  `CD687E78F4D957DF95DBF1F645692CF9DFF105A9680F68547C68223D392F7695`.
- Exact source changes: headings `PROPOSED AGREEMENT` and `WHAT CHANGES IN YOUR SAVE`; transaction wording
  `tx ... - idempotent`; footer `addTable(10)` with spans `4/4/2`. The prior four
  `reserveScrollBar=false` changes remain retained.
- Forge project validation: `ok: true`, `29` files, `7` Lua files, `0` errors, `5` direct warnings,
  `10` full-context warnings, and `0` new warnings versus baseline.
- AI dry-run: `0` add, `124` overwrite, `0` delete, `6` preserve; only the managed source sheet changed.
- Real deploy: all `11` checks passed. Recovery was `deploy-mtssjb13-d04d986bcca06e24`; resulting fingerprint:
  `3dd16a6ed40cefb222649ac7834c2b128c764cddf9e34ac10b4ad5eb81c55edd`. Source, staging, and deployed Lua matched
  exactly at the `CD687...F7695` identity. Independent whole-tree comparison: `124` common files, `0` mismatches.

## Native X4 evidence

### Durable artifacts

- Screenshot: `x4-native-agreement-sheet-current-2560x1392.png`, `1,535,566` bytes, SHA-256
  `2AEE12CC76F02E75C44FA11747485014A849C1FB9FEAB5051AD41BC008C8ACC3`.
- Current-session log: `debuglog-current-session.txt`, `16,859` bytes, SHA-256
  `EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826`.

Both files are in this directory. Their bytes were not changed by this documentation close.

## Evidence-integrity / Git staging boundary

Check any staged or committed evidence artifact from the Git index/blob, not by inference from the working file.
Before the pending evidence commit, exact-path `git add -f` applied the repository `text: auto` filter to the native
log: the working/native artifact remained `16,859` bytes / SHA-256
`EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826` with `230` CR and `230` LF bytes, but the
filtered staged blob became `16,629` bytes / SHA-256
`5E2BE22E13150BDB0338AA7F5D0F242C82BDFBF1827A3126DCE808AC8FF6B3C9` with CR bytes removed. Hashing the staged
blob caught the mismatch before commit. The parent corrected only that staged path with an exact no-filter raw blob;
the corrected staged identity is again `16,859` bytes / SHA-256
`EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826`, with `230` CR and `230` LF bytes. This is a
Git/evidence-packaging hazard, not an X4-engine or Forge-rendering failure.

The durable repository fix is the narrow `.gitattributes` rule `dev-docs/**/debuglog*.txt binary`, using Git's built-in
binary macro so text, diff, and merge remain unset for native debug-log evidence. It supersedes reliance on the one-off
no-filter raw-index workaround for future staging. The failed filtered identity (`16,629` bytes /
`5E2BE22E13150BDB0338AA7F5D0F242C82BDFBF1827A3126DCE808AC8FF6B3C9`) and the corrected native identity (`16,859`
bytes / `EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826`) remain retained above as incident
evidence.

### Observed native UI

The native X4 9.00 screenshot visibly shows both new headings, the ASCII idempotent transaction wording, four
clauses, four save-diff rows, three buttons, and the `40/40/20` footer. No clipping is visible.

The current-session log contains exactly one expected launcher marker and one expected sheet marker. It contains zero
refused/timeout, scrollbar, `DisplayView`, setup-view, `stack traceback`, or `Lua Error` signatures.

This is direct native proof for the tested source/path/profile, not a universal engine or design-parity claim.

## Installed Forge proof and export boundary

Installed Forge `0.0.77` was visually inspected in the real `x4 AiLive` workspace at `Expert -> HUD & Lua UI`. The
exact source identity was `CD687...F7695`; the configured corpus was canonical, and the source was
source-owned/available/editable/shippable. Both data-present branches were selected, both loop counts were `4`, and
all `55/55` exact sample controls were populated.

Readback was `rendered/current`, mounted from the accepted raw paint plan, target `sheet.display`, profile
`x4-ui-editor-default` at `2560x1440`, Helper scale `1.4`, native bitmap `2560x1440`, and export-ready, while
`Not verified in game` remained present. The visible canvas showed both headings, `TX-CAUSAL`, the party line, all
four clause/note rows, all four cost/value rows, and three footer actions with wider/wider/narrower proportions.

The Forge export download timed out. No durable Forge PNG was saved, and no Forge export artifact is claimed here. The
visible installed-app canvas is direct observed proof; the native screenshot and current-session log above are the only
durable image/log artifacts for this receipt.

## Validation and restoration

- Focused tests passed: PaintPlan `213/213`, LayoutKernel `34/34`, Scene `179/179`, CanvasRenderer `171/171`,
  Linter `153/153`, and PreviewPipeline `122/122`.
- The `addTable(24)` refusal remained enforced and `addTable(10)` stayed clean. `npm run typecheck`, scoped ESLint,
  and exact diff hygiene passed.
- The current selftest reconstructs the exact historical `A09...D34` contract and the current `CD687...F7695`
  byte/hash, heading, transaction, and footer assertions. Deep Scene/Paint selftest replay remains the historical
  fixture; current deep replay proof is the live installed Forge canvas.
- Temporary `pipeline_test` launch used the exact AI sheet and passed all `11` checks. The scratch fixture was restored
  and the game target is absent. Restored hashes are:
  - `content.xml`: `367` bytes / `23A7E9A5D789DD31B5BFBFDCF7D9A6B63CB33971170C3C0E64438C77B52A5034`
  - `ext_01.lua`: `5,488` bytes /
    `C1D9CD8580C6175E95C543259A2AB19F8B463282BF48B2229EB6013D6052718E`
  - `README`: `210` bytes / `31B80A5145A9E9EBAF252C91DF24D58DE29B5BED76BAECC6FB6839E4EDF1C871`
  - `ui.xml`: `273` bytes / `655331A4423A550532042B23C8E60141A60DCC0E1C42D4DE6DA653DAAD1C1689`
- A stale CAS produced HTTP `409` with no mutation; the guarded write returned HTTP `200`; restored-fixture
  validation reported `0` errors / `0` warnings.

## Status boundary

The bounded `1e` unit is `VERIFIED`. Full B119 remains `IN_PROGRESS / PARTIAL`: the complete twelve-reference/current-
game visual census and broader arbitrary-Lua/Helper/widget/C++ coverage remain open. This receipt makes no claim of
full B119 completion, pixel-perfect parity, or a saved Forge export. `no capability-map delta`; the existing
capability is strengthened by evidence rather than extended. Parent exact-path commits and GitHub #41, Notion, and
Google Drive updates remain pending after the source commit.
