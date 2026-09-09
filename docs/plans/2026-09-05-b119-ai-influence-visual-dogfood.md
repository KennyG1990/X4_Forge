# B119 AI Influence visual dogfood and release-gap census

Status: `PARTIAL / OVERALL B119 IN_PROGRESS`

Task: Exercise the completed source-first X4 UI editor against the real AI Influence Lua and the twelve supplied visual references, then repair only evidenced editor or layout gaps.

Lane: `FULL`

## PLAN

- **Bounded unit:** establish current-source Forge and X4 captures for the shipping AI Influence surfaces; reconcile each reference image against the same-source output; use Forge-owned source editing, validation, artifact, and deploy paths for any layout-only correction proved necessary; retain exact rollback evidence.
- **Assumptions and unresolved facts:** `1b` is the selected comm-link direction; `1a` and `1c` are alternatives, although `1c` also ships as the expanded long-negotiation view. Existing history says `1b`, `1c`, `1d`, `1e`, and hub tabs `1g`-`1j` have been seen in X4, but current captures must re-establish present behavior. `1f` has no implemented counter-offer menu and no authoritative deterministic price-versus-acceptance model; this must be confirmed before any shipping implementation.
- **Authoritative references:** the supplied handoff README and all twelve images under `C:\Users\Moshi\Desktop\# AI Influence mod UI design\design_handoff_ai_influence`; configured X4 9.00 `helper.lua`, `widget_fullscreen.lua`, and Zekton corpus; shipping `x4_ai_influence` Lua; Forge B119 acceptance records; ADR-F4/F5; the source-first pipeline and linter already verified by the original brief.
- **In scope:** exact current-source import/round-trip; named sample values for dynamic text without executing Lua; Source -> Layout -> Scene -> Paint -> Canvas inspection; all eleven linter families; keep-out overlays; current X4 rendering and interaction; Forge-guarded layout-only corrections when evidence requires them; same-source deployment and post-deploy X4 proof.
- **Out of scope:** replacing the existing renderer/deployer; executing arbitrary Lua in Forge; inventing runtime values; implementing strategic pricing or negotiation economics; presenting `1a` and `1c` as simultaneous compact directions; fake HAIL/reload/refresh controls; changing gameplay mechanics, AI prompts, saves, corpus files, credentials, or public release state. OpenVSX publication remains a later release-acceptance unit.
- **Affected surfaces:** `src/lib/x4Ui*`, `src/components/X4UiSourceEditor*`, `src/components/UIBuilder*`, only if a reproduced editor gap requires repair; Forge evidence and B119 records; the configured `x4 AiLive` workspace; and, only through Forge's guarded writer/deploy chain, layout-only files under `ui/addons/ai_influence_chat/`.
- **Risks and authorization boundaries:** X4 C++ may reject a frame that Forge accepts; dynamic runtime state may make screenshot reproduction non-deterministic; the installed test-only `pipeline_test` extension can hijack the X4 start menu; AI source and deployed bytes must not drift invisibly. User explicitly authorized Forge/game writes, game launch, Computer Use, commits, pushes, and later publishing, but publishing is deliberately excluded until release acceptance passes.
- **Rollback/checkpoint:** Forge `HEAD == origin/main == 1690898eda51c3caf6adb1252ac35b38368b8bc6`; AI source `HEAD == origin/master == 4c0a422b7e3d0f492b572b9da8d2d7ea19a2b453` and clean. Current key AI Lua/source/deployed hashes match. The installed `pipeline_test` directory was moved intact to `dev-docs/b119-ai-influence-dogfood/runtime-isolation/pipeline_test-installed-20260905T1135/`; its four file hashes were equal before and after, and rollback is the exact reverse move while X4 is stopped.
- **Acceptance criteria:**
  1. Every supplied image is classified as selected shipping direction, alternate direction, composite tab reference, implemented-and-current, visually divergent, data-blocked, or deliberately unsupported, with no silent omissions.
  2. Each shipping Lua source imports and re-exports with the same calls and values; every preview carries `Not verified in game` until an exact clean deploy and explicit X4 confirmation.
  3. Forge produces non-zero current canvases for the selected `1b` comm surface, `1c` expanded surface, `1d` pending gate, `1e` agreement sheet, and all six hub tabs using only owner-issued source targets and named samples where runtime text is dynamic.
  4. Any linter-blocking source is refused before export/deploy, including `addTable(24)`; no rule is weakened to admit current source.
  5. Any accepted correction is a bounded Luna source edit. Use Forge's guarded source/CAS path where it represents the edit; if the Source Editor cannot encode a structural deletion, apply that deletion as a bounded direct Luna patch, then import, replay, and read it back through Forge. The correction must survive round-trip, validate as a complete mod, deploy through `deploy-verify`, and be observed in X4 with zero scoped frame/view/Lua failures; do not falsely attribute a direct structural patch to Forge authorship.
  6. `1f` is not shipped with fabricated probabilities. It may be classified or rendered as an explicitly fixture-bound, not-in-game design benchmark only; a functional shipping menu requires a separate deterministic pricing contract.
- **Required validation:** focused owner selftests; whole-repository typecheck and exact-path lint; AI mod Lua/glyph/vocabulary/menu gates; Forge complete mod validation; guarded dry-run and real deploy when bytes change; installed package parity if Forge product code changes; native Forge visual inspection; native X4 capture and interaction; scoped debuglog census; full precommit before commit. Run serial E2E, production build/package/probe, installed oracles, and OpenVSX checks only when their touched surface makes them applicable.
- **Negative/failure paths:** dynamic values without supplied samples remain honestly unavailable rather than guessed; stale source/workspace/deploy identities refuse; a known `>12` table fixture refuses; `1f` refuses promotion to shipping without the deterministic price model; the isolated `pipeline_test` folder must not disappear and must be restored after AI capture unless continued isolation is documented.
- **Evidence locations:** `dev-docs/b119-ai-influence-dogfood/visual-release-20260905/`; this task record; B119 canonical plan close; `BACKLOG.md`; `SESSION-HANDOFF.md`; project capability/AAR ledgers when a delta or lesson exists; GitHub #41, Notion owner, and Google Current Status projection after a verified checkpoint.

## BASELINE

- **Forge revision:** `1690898eda51c3caf6adb1252ac35b38368b8bc6`, equal to `origin/main`. The pre-existing unrelated dirty tree is preserved outside this unit.
- **AI revision:** `4c0a422b7e3d0f492b572b9da8d2d7ea19a2b453`, equal to `origin/master`; worktree clean.
- **Configured runtime:** X4 9.00 build `611726`; configured unpacked corpus `F:\Downskies\x4unpackersuitev1\X4 unpacked 9.00`; selected Forge workspace `x4 AiLive` (`ws_bca860d02b9ea61f6028bfb4`).
- **Source/deploy drift:** content, registration, and the six principal UI Lua files are byte-equal. The only content-tree differences found were `.forgekeep`, source-only local metadata, and deployed-only `.mcp.json`; none is a player-facing Lua/XML drift.
- **Observed runtime baseline:** with `pipeline_test` installed, X4 entered `startmenu`, auto-opened Menu A, and closing it left no usable vanilla navigation. X4 was stopped and the exact fixture was isolated recoverably before relaunch. This is environment contamination, not an AI Influence render finding.

## RECONCILE

- **Existing capability reused:** shipping `aic_menu.lua` implements selected `1b` plus inline `1d`; `aic_comm.lua` implements expanded `1c`; `aic_sheet.lua` implements `1e`; `aic_hub.lua` implements one six-tab `1g`-`1j` hub; `aic_uix.lua` is the shared synchronous state owner. Forge already owns source parsing, scalar/structural CAS edits, named string samples, layout/scene/paint/canvas, linter, artifact compilation, and guarded deployment.
- **Historical X4 evidence:** commit receipts record `1c` and `1e` against a real 24,000 Cr proposal, subsequent live visual repairs, and all six hub tabs. These establish provenance, not current acceptance.
- **`1f` finding:** the current `COUNTER-OFFER` button only closes `aic_sheet` and enables the compact menu's amount-entry mode. Existing D&D approach odds are real but answer a different question; they cannot truthfully populate price acceptance/counter/break-off meters.
- **Couplings checked:** one conversation state and send path across `1b`/`1c`/`1d`/`1e`; one hub accessor surface across `1g`-`1j`; source-folder/workspace CAS; source versus loose staging versus installed target; static gate enrollment in the mod deploy script; preview versus game-verification authority.
- **Capability-map delta:** none at specification time. Record only demonstrated new or invalidated capability at close.
- **Plan changes from reconciliation:** changed from greenfield UI construction to audit/repair/dogfood of existing shipping surfaces; isolated `pipeline_test` before AI runtime capture; explicitly separated the data-blocked `1f` functional surface from visual benchmark work.
- **Current visual census checkpoint:** current-source X4 captures now exist for `1b`, expanded `1c`, the proposal block inside expanded `1c`, and all six hub tabs under `dev-docs/b119-ai-influence-dogfood/`. All rendered in X4 without a frame refusal. The file named `x4-current-source-1d-inline-proposal.jpg` is an expanded `aic_comm.lua -> comm.display` (`1c`) capture, not compact `aic_menu.lua` evidence. Expanded `aic_comm` intentionally owns exactly three choices and no `REVIEW`; this screenshot says nothing about whether compact `aic_menu` paints a `REVIEW` control.
- **`1d` source/reference reconciliation:** the authoritative `1d` mock requires exactly three action buttons (confirm, counter, refuse), no `REVIEW`, and one informational footer on proposal surfaces. The expanded `aic_comm` screenshot already has the intended three-choice ownership. Its observed mismatch is the header, transaction label, five term-row presentation, and footer copy/semantics. Compact `aic_menu` action behavior remains untested by this screenshot. A later compact-source correction may remove `REVIEW`, if present, as an implementation decision supported by the reference and existing route ownership—not as repair of an observed X4 omission. The existing auto-promotion into expanded `1c` remains untouched; the `1e` transition remains unresolved/out of scope.
- **Native ownership/right-edge boundary:** the expanded `aic_comm` screenshot intentionally has `END` in the title bar and only `SEND` in its input row. It proves neither compact `aic_menu` `REVIEW` behavior nor compact `END` behavior. Any compact right-edge diagnosis requires separate compact-surface evidence; no engine omission is inferred from this expanded frame.
- **First exact Forge loss point:** after all 22 source-bound scalar samples were supplied, Forge rendered only the bottom edit box plus `SEND` and `END`. The accepted Layout program recorded 66 operations but applied only 27; 39 remained conditional/unresolved. Twelve valid samples were not consumed because their owner/control-flow contexts were not applied. The existing exact-source regression fixture freezes this reduced result (`3` widgets, `5` text records, `7` glyphs), so the current test proves structural acceptance rather than visual completeness.
- **Existing infrastructure to extend:** `x4UiLayoutProgram` already issues source-hash-bound preview-path catalogs and validates mutually exclusive arm selections for expanded local-function invocations. The editor session and source editor do not expose or reconcile that authority, direct target calls do not consume it, and loop bodies remain intentionally unreplayed. The next unit extends this owner rather than creating a second scenario system.
- **Revised bounded implementation unit:** thread owner-issued preview-path catalogs and selections through Preview Pipeline -> Editor Session -> Source Editor; permit a selected source arm to materialize direct target calls as well as expanded local-helper calls; retain loop bodies as explicit unavailable evidence. Selection is preview-only, mutually exclusive per boundary, source/target/profile-bound, stale-clearing, and never changes source or game-verification state.
- **Revised unit acceptance:** a portable direct-branch fixture and the exact current `aic_menu.lua` pending-action header/footer path must render when their exact arms are selected; unselected sibling arms remain unapplied; conflicting, extra, stale, source-mismatched, malformed, and statically unreachable selections refuse or clear at their owning boundary; no loop is replayed; `Not verified in game` remains invariant. The expanded `aic_comm` header/tx/five-term/footer mismatch is investigated separately from compact `aic_menu` `REVIEW`/`END`, which this screenshot does not test. Preview fidelity to current source and final fidelity to the supplied design remain separate acceptance questions.
- **Installed-candidate interaction finding:** packaged extension `0.0.70` installed with staged-app parity and reopened as Forge `v1.0.501` at the installed sidecar. The new `Preview branch paths` surface is visibly present. Browser Playwright/AX `selectOption` calls reconciled `menu.display` back to `Select target...`, but a native Antigravity dropdown selection retained both exact `aic_menu.lua` and `menu.display` across render cycles. The browser reset is therefore automation-path-specific and is not accepted as a normal-user component failure.
- **Native session authority refusal:** the retained native target did issue a current session, but Source-safe property controls reported `READ-ONLY · PROVENANCE-DRIFT`: `layout evidence pair was not issued for the canonical complete source call model`. The exact issued context ends in `catalog:source:missing`; no owner-issued frame/display insertion authority is available. Evidence: `dev-docs/b119-ai-influence-dogfood/visual-release-20260905/native-forge-menu-display-session-controls.jpg`.
- **Independent native branch/Scene refusal:** after selecting the exact pending-action `then` arms at source lines `711`, `717`, and `721`, and supplying the source-bound geometry/text samples needed by those calls, the installed Forge retained the selections but classified the canvas `stale`. The exact reason is `Session is not renderable: layout program is malformed, incomplete in required structure, or internally mismatched`. This is now the branch-path acceptance blocker; it is independent of the source-edit authority refusal. Evidence: `dev-docs/b119-ai-influence-dogfood/visual-release-20260905/native-forge-menu-display-selected-path-stale-canvas.png`.
- **Causal Scene receipt:** the loader-issued configured-corpus reproduction reached the same public `malformed-structure` refusal with `66` operations / `35` applied and `1/4/9/88` frame/table/row/cell geometry. The first failed invariant was `cell-outer-height` on the selected `REVIEW` button at source line `755`: Helper kernel height `25` had not been finalized to the effective-scale height `35` because unresolved sibling text made the whole row height unavailable. Scene's rejection was correct; the producer finalization boundary was incomplete.
- **Pre-existing P7 gate reconciliation:** `x4UiEditorSession.selftest.ts` is identically red on clean detached `HEAD 1690898` and on the candidate: the fixture records `13` Scene color facts and `30` paint tints, while its oracle expects `31`. Commit `0194d62` changed text layout to the native `horizontalBearing + advance` pen metric; the seven-letter narrow-cell fixture now yields six visible glyphs, but this downstream cardinality oracle was not updated. This is a test-oracle repair only unless a bounded worker finds contradictory lower-layer or native evidence.
- **E2E envelope reconciliation:** the first current-candidate full serial E2E failed the B116 dense pointer-close control twice and later lost its structured report to Windows child exit `3221226505`. Re-running only that control under bundled Node `24.19.0` retained a red zero-flake verdict, but its attached product measurement was green: `1,424` rendered nodes, close `656 ms`, maximum heartbeat gap `212.8 ms`, and worst long task `157 ms`, all below the unchanged `5,000 ms` product limits. The failure was the enclosing case's inherited setup/attachment work crossing its explicit `45,000 ms` wall-clock override; the retry completed in `34.6 s`. An environment-equivalent detached clean-HEAD run passed first-attempt in `40.8 s`. The bounded correction may restore only this case to the suite's existing `60,000 ms` envelope. It must not change the `1,424`-node fixture, any `5,000 ms` interaction/heartbeat/long-task threshold, the one-worker topology, retry count, fail-on-flaky policy, or structured-verdict authority.
- **Revised validation-repair acceptance:** tests first must retain the current red receipt, then the exact dense control must pass first-attempt under bundled Node with a structured `1/1`, zero-flake verdict and `treeGone=true`; the complete serial suite must subsequently pass with zero failed/flaky/bad/quarantined-blocking results. This repair owns only `tests/e2e/continuous-polling.spec.ts`; production polling, Canvas, Agent Bridge, B119 renderer code, and mod/game files are forbidden unless new causal evidence contradicts the green product measurement.
- **Installed zero-pixel false-success reproduction:** a fresh standard Playwright session against the installed `0.0.70` sidecar selected exact current `aic_menu.lua -> menu.display`, retained all `22/22` supplied sample values, and retained exactly the owner-issued `then` arms at source lines `711`, `717`, and `721`. The UI reported `rendered/current`, enabled native PNG export, and showed no sample/path errors, but the mounted `2560x1440` Canvas contained exactly `0` non-transparent and `0` non-black pixels. This is a reproduced presentation false success: a current receipt does not currently prove that source-composition mode emitted a visible pixel.
- **Color-evidence hypothesis, not diagnosis:** a separate cold browser load reproduced both core and canonical-default color loaders as `unavailable` while direct host requests to the same installed reference endpoints immediately returned HTTP `200`. Missing or transient color authority is therefore a leading explanation for a source-composition plan with no active visible tint/glyph command, but causality is not yet proved. The next worker must reproduce the exact accepted-empty boundary in a deterministic component/renderer fixture before changing production.
- **Revised visible-Canvas acceptance:** source-composition output with no visible draw must never be labeled `rendered/current` or export-ready. A canonical-core plus unavailable-color fixture must fail closed with a typed, user-readable state; it must not silently substitute diagnostic-map paint as faithful source composition. The exact selected current MENU fixture must produce a mounted non-zero bitmap when the required canonical evidence is available, or explicitly identify the missing evidence when it is not. Existing stale-surface retention, source/target/profile identity, post-validation mutation refusal, renderer callback defenses, and `Not verified in game` remain mandatory.
- **Reconciled native PNG Save As wording unit:** the existing Source Editor export path proves that the current mounted Canvas serialized to a nonempty `image/png` blob and that an `<a download>` request was dispatched. That browser contract does not report whether the user completed the installed host's native Save As dialog, which destination was chosen, or whether any final file exists. This bounded repair changes only the post-dispatch truth label and its direct test oracle; it does not add a parallel native bridge, alter renderer/export eligibility, or claim filesystem receipt authority.
- **Save As wording acceptance:** after one observed browser download event, the status must say that PNG serialization succeeded and a save/download request was handed to the host, explicitly state that final Save As/file completion is not verified, tell the user to confirm the file, and retain `Not verified in game`. It must not use `exported`, `saved`, `completed`, or equivalent success wording. Existing missing/throwing/empty serialization refusals, current-canvas identity checks, one-download cardinality, and stale/export-disabled behavior remain unchanged. Required evidence is the focused Source Editor E2E plus the existing component selftest, typecheck, scoped ESLint, and diff hygiene. Owned code/test paths are `src/components/X4UiSourceEditor.tsx` and `tests/e2e/x4-ui-source-editor.spec.ts`; all renderer, extension-host, release-center, mod, game, workspace-state, and unrelated dirty paths are forbidden.
- **Release reconciliation:** Open VSX already serves stable `0.0.70` from 2026-08-21 (`26,130,460` bytes; SHA-256 `C8BCA5E1DBB0F5630A546370FD621F5968BFD1151CC0806828F352BDED6479BF`). The current private installed B119 candidate is different (`26,295,864` bytes; SHA-256 `CFBEF17479BB2C72A6AD12E1D88EC997675EDA6EE085077FD654CAD86700129F`), so `0.0.70` is burned and must not be republished or described as the B119 release. If release gates remain green, the next stable version is `0.0.71`. Publish-before-commit remains mandatory: add truthful modder-facing `0.0.71` notes, regenerate the changelog, build/stage/compile/package/inspect, prove installed payload/runtime/UI behavior, publish once, verify the public version and independently downloaded package hash, then commit/push only the explicit B119 and release paths. A missing token, red gate, version collision, package mismatch, or public readback mismatch is a release stop.

## IMPLEMENT

- The branch-path unit now exists across the established Layout Program -> Preview Pipeline -> Editor Session -> Source Editor owners. It exposes owner-issued direct-target and expanded-local branch catalogs, applies only one selected arm per source boundary, keeps sibling arms conditional, never replays loops, and labels the controls `Preview only` / `Not verified in game`.
- The layout-evidence provenance mismatch is repaired through one Layout-owned canonical call-model view shared by Preview Pipeline and Source Edits. The repair preserves the raw call model for literal edit locks and retains issued-pair identity, source/target binding, stale/mutated/forged rejection, and `Not verified in game`.
- The installed-candidate interaction exposed a separate selected-branch Scene structural mismatch. A causal exact-menu or source-faithful nested fixture must reproduce the first failing invariant before production repair. The browser-only select reset is automation-path-specific and is not the production blocker. No AI Influence source or deployed game bytes have changed.
- The exact selected-branch mismatch is repaired at Layout finalization: deterministic button/icon/edit-box outer heights are now retained even when unresolved sibling text leaves the aggregate row height unavailable. Scene validation remains unchanged; loop rows remain conditional; the exact configured path now reaches non-refused Scene and Paint with `canRender=true` and `Not verified in game`.
- Required-gate follow-up is bounded to correcting the stale P7 paint/glyph cardinality oracle against the already-shipped native pen-advance behavior. Production color, text-layout, Scene, and Paint code are out of scope for that follow-up unless its fail-first analysis contradicts the clean-HEAD/corpus receipt.

## VALIDATE

- Current-source native X4 visual baseline captured for `1b`, `1c`, `1d`, and all six hub tabs. Forge scalar-sample replay reproduced the reduced three-widget canvas.
- Continuation safety baseline: X4 is loaded in the current save; the last `1,200` debug-log lines contain no `DisplayView(): Failed to set up` or equivalent view-setup failure. Workspace mod HEAD is `4c0a422`; workspace and installed-game `aic_menu.lua` both remain SHA-256 `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`. Evidence screenshot: `dev-docs/b119-ai-influence-dogfood/visual-release-20260905/x4-runtime-idle-before-branch-repair.png`.
- Branch-path focused results before installed interaction: Layout Program `707/708` with one standing skip; Preview Pipeline `118/118`; Source Editor `13/13`; scoped ESLint and production build passed. Editor Session remained red only at the independently reproduced clean-HEAD P7 oracle (`30` paint tints observed versus `31` expected); that baseline was not normalized or weakened.
- Production build, extension stage/build, `16/16` staged-app probe, VSIX package/inspection, installed-byte parity, and installed sidecar restart passed. The first VSIX installation attempt correctly failed while the old sidecar held the extension directory; stopping the exact backend and retrying installed successfully.
- Source-authority repair focused validation is green: Layout Program `707/708` with one standing skip; Preview Pipeline `118/118`; Source Edits `95/95`; exact six-file ESLint; TypeScript; and owned-path diff hygiene. Installed proof of the repaired authority remains pending a rebuilt package.
- Live installed branch-path acceptance is red after successful native exact-target and path selection: `menu.display` and all three requested pending-action arms remain selected, but Scene refuses the issued program as malformed/internally mismatched and Canvas remains stale. A portable direct-branch fixture is green, demonstrating that the missing regression is the real nested pending structure rather than the basic path-control contract.
- Post-repair configured-source validation is green: Layout Program `707/708` with one standing skip; strict Scene `178/178` plus configured census `3/3`; Preview Pipeline `118/118`; B119 Editor Session causal matrix `8/8`; scoped ESLint; TypeScript; and owned-path diff hygiene. The exact receipt preserves `66/35` operation counts, `1/4/9/88` geometry, selected path/sample authority, conditional loop calls, non-refused Scene/Paint, `canRender=true`, and `Not verified in game`.
- Required Editor Session suite remains red only at the independently reproduced clean-HEAD P7 oracle (`30` paint tints observed versus `31` expected). The stale oracle is now a documented validation repair, not evidence against the selected-branch production fix.

## REVIEW

- The original specification-time review placeholder is superseded by the dated implementation, validation, and
  release-boundary review appended below.

## CLOSE

- Specification-time status was `SPECIFIED`; the current close is `PARTIAL / OVERALL B119 IN_PROGRESS` in the dated
  checkpoint below.
- Suggested commit title when verified: `feat(ui-editor): dogfood AI Influence visual surfaces`.

## AAR

- Trigger already fired: the installed pipeline fixture contaminated the X4 start-menu baseline.
- Trigger: the portable direct-branch acceptance fixture passed while the exact nested pending branch failed at the real Scene boundary. The next repair must add a causal nested Scene/Paint/Canvas regression, not rely on Layout-only materialization counts.
- Trigger: the exact native pen-advance correction changed clipping cardinality without updating a downstream owner-binding oracle. Cross-layer visual/cardinality tests must be re-run whenever glyph advance semantics change, even when the text-layout unit tests themselves are green.
- Sustain: capture source, installed, runtime, and visual identity separately before editing.
- Improve work/approach: do not infer current surface status from old inventory documents when later source history supersedes them.
- Improve tools: test-only UI extensions need an explicit non-autostart/default-off mode so one proof fixture cannot obstruct another mod's validation.
- Highest-risk evidenced weakness: current AI UI can have historical game receipts while Forge still sees only static fragments unless dynamic samples and target authority are supplied exactly. The bounded experiment is to census each current surface before widening parser behavior.
- Lessons banked at close only after current evidence is complete.

## 2026-09-06 CONTINUATION — linter-first release and AI Influence close boundary

### RECONCILE / IMPLEMENT

- The linter-first source editor and the `0.0.71` release candidate were already implemented before this documentation
  close. This continuation records the final evidence without changing source, tests, package files, game files, or
  workspace contents.
- Direct `x4UiLint` selftest is `140/140`, including the clean, warning, blocking `addTable(24)`, whole-frame, and
  conversation-close symptom families. The linter remains source-backed and fail-closed; `13-23` is warning-level,
  `24+` is blocking, and clean output does not imply engine acceptance.
- No capability-map delta: the evidence strengthens the existing linter-first/source-preview capability and does not
  demonstrate universal Helper/widget parity or a new game capability.

### VALIDATE

- Final VSIX is `F:\DEV_ENV\X4_Forge\vscode-extension\x4-forge-studio-0.0.71.vsix`, exactly `26,296,414` bytes,
  SHA-256 `3143296C72B5A8B6A526148CA98048FA340FA534BB41A1D890F930DA69FB054B`. Package inspection passed with `2,107`
  archive entries and `2,105` extension payload files.
- The final install backup is retained at
  `C:\Users\Moshi\AppData\Local\Temp\x4forge-b119-0.0.71-final-install-backup-20260906T024434135Z` (`2,106`
  files / `71,618,336` bytes). Installed package parity passed for all `2,105` packaged files; only the expected IDE
  `.vsixmanifest` extra remained, normalized `package.json` matched, and app JS/CSS/server identities matched. The
  installed sidecar restarted at port `56347`, PID `64300`, from the installed `0.0.71` app.
- Installed runtime oracles passed `134/134` with `X4_FORGE_TIMEOUT_MS=90000`; serial E2E passed `106/106` with zero
  failed/flaky/bad/quarantined results and `treeGone=true`. The ephemeral ports `3100/3101` were closed and the live
  workspace was unchanged. Production build passed `1,848` modules, stage/build and probe passed `16/16`, precommit
  passed, and Graphify refreshed to `10,396` nodes / `26,075` edges / `336` communities (HTML intentionally skipped
  above the size guard).
- The installed final sidecar visibly rendered the Forge workbench and setup modal, so it was not blank or stale. A
  prior installed Pipeline Test Menu A proof has a current `2560x1440` canvas/export, but visible text-row/wrap
  overlap means it is not universal pixel-fidelity evidence.
- The exact installed `x4 AiLive` source path `aic_menu.lua -> menu.display` correctly refused source-composition
  visual diagnostics with: `source-composition has no renderer-issued visible source geometry fill/border or canonical
  tinted glyph; visual diagnostics require an authoritative source operation`. Export was disabled. The source SHA-256
  remained `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`; preview truth remains `Not verified
  in game`.
- Public OpenVSX publication and independent artifact parity are now a bounded `VERIFIED` unit. At
  `2026-09-06T06:59:36Z`, the `0.0.71` version endpoint returned HTTP `200` and `/versions` contained `0.0.71`.
  Independent download from
  `https://open-vsx.org/api/x4forge/x4-forge-studio/0.0.71/file/x4forge.x4-forge-studio-0.0.71.vsix` was exactly
  `26,296,414` bytes with SHA-256
  `3143296C72B5A8B6A526148CA98048FA340FA534BB41A1D890F930DA69FB054B`, matching the local final VSIX exactly. At
  `2026-09-06T07:08:17Z`, the registry `/latest` pointer also returned `0.0.71` with that same download URL. The
  earlier `0.0.70` pointer was transient indexing lag that resolved; public pointer convergence is now verified.

### REVIEW / CLOSE

- **Done and evidenced:** linter-first implementation and focused selftest; final package inspection; installed
  payload/runtime parity; installed rendered-host smoke; runtime oracles; serial E2E; production/build/probe gates;
  exact public `0.0.71` version/download/hash readback; and the fail-closed no-visible-source-geometry rule.
- **Partial:** the AI Influence benchmark remains open. The current `1b`, `1c`, `1d`, and hub surfaces are rendered or
  classified but materially divergent from the supplied references; `1e` is not re-established through a valid current
  path; `1f` remains data-blocked. Exact few-pixel cross-menu game parity, exact scale correlation beyond bounded
  fixtures, and full reference reconstruction/current in-game validation are not proven. No universal Helper/widget
  parity claim is made.
- **Final status:** `PARTIAL / OVERALL B119 IN_PROGRESS`. **Bounded `0.0.71` publish/artifact-parity unit:** `VERIFIED`,
  including the resolved `/latest` pointer readback. X4 is not running for this documentation close; permanent `Not
  verified in game` semantics remain unchanged.
- **Evidence record:** `dev-docs/b119-ai-influence-dogfood/visual-release-20260905/CENSUS.md`, this plan, the final VSIX,
  the retained install backup, and the independent public download described above. External wiki updates are the UI
  quick-reference cards and the X4 Forge AAR entry; `F:\StarForge\wiki\workflow\aar-log.md` and the capability map
  were intentionally not changed because no cross-project lesson or demonstrated capability delta exists.

### AAR

- **Triggers:** the default `20s` oracle timeout produced a false red before the supported `90s` pass; one E2E run
  aborted at test 1 and another Windows child exited at `88/106` before the final `106/106`; the first workspace
  automation missed the required Switch workspace confirmation; a combined parity command was rejected before
  execution by command policy; the first reinstall path relaunched the IDE and same-version replacement later hit
  `EPERM` after `1,104` rename retries; stale-directory move/reinstall recovered safely; and Graphify skipped HTML above
  its size guard.
- **Sustain:** keep package, installed, runtime, public download, and visual evidence as separate authorities; retain
  exact hashes and the permanent game-truth warning; require positive renderer-issued geometry before source-composition
  preview success.
- **Improve work/approach:** do not treat `rendered/current`, enabled export, or clean linter output as visible
  source-composition proof when the mounted Canvas has no pixels. Keep the AI benchmark open until exact cross-menu and
  full reference checks are complete.
- **Improve tools:** use the supported oracle timeout and serial E2E receipt, verify workspace-switch confirmation,
  isolate same-version install locks with a recoverable stale-directory move, and record transient `/latest` indexing
  lag separately from artifact parity. The final whitespace/readback probes needed quoting-safe PowerShell corrections
  before their clean passes.
- **Highest-risk evidenced weakness:** Forge source-composition can report a current receipt while emitting zero
  non-transparent and zero non-black pixels. The positive-geometry/refusal requirement is a Forge preview rule only,
  not a proven X4 engine behavior.

## 2026-09-06 CONTINUATION — finite source-loop preview authority

### PLAN / ACCEPTANCE CONTRACT

- **Bounded unit:** extend the existing Call Model -> Layout Program -> Preview Pipeline -> Editor Session -> Source
  Editor owners with an owner-issued, source/target/profile-bound loop catalog and finite preview iteration selections.
  The first required real-source case is the current `aic_menu.lua -> menu.display` generic loop over
  `pend.rows`: two supplied iterations must produce two distinct source-backed rows, each with independently sampled
  label/value text, after the already-issued pending-action branch arms are selected.
- **Authoritative references:** current AI source SHA-256
  `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`; its `menu.display` loop at source lines
  `733-746`; the call model's exact `loopPath` and reference provenance; the existing owner-issued sample and branch
  catalogs; X4 9.00 `helper.lua`, `widget_fullscreen.lua`, and Zekton corpus authority; and the supplied `1d` reference.
- **Existing capability reused:** the call model already records loop kind, multiplicity, exact source range, enclosing
  branch path, and declaration provenance. Layout already has deterministic instance rebinding for expanded local
  calls, source-hash-bound catalog/input normalization, unique operation evidence, and per-expression preview samples.
  This unit extends those owners; it does not introduce a Lua interpreter or a parallel renderer.
- **In scope:** finite direct-target loop replay; stable per-loop and per-iteration identities; rebinding only references
  whose declaration/source provenance is inside the selected loop; preserving outer frame/table references; distinct
  iteration-scoped sample entries and consumption; deterministic operation ordering and evidence; editor controls
  labeled `Preview only`; stale reconciliation on source/target/profile/catalog changes; and installed Forge proof.
- **Out of scope:** executing loop predicates, iterators, table access, assignments, or Lua calls; inferring iteration
  counts or values; replaying nested loops or loop-owned local-helper invocations in this first unit; sampling color
  objects or using `r.tone` to invent state color; changing AI source/game bytes; claiming C++ frame acceptance,
  universal loop semantics, full transcript/choice reconstruction, exact `1d` pixel parity, or in-game verification.
- **Input limits and failure behavior:** only owner-issued single-depth direct-target loop entries may be selected; each
  selection supplies an integer iteration count from `1` through `16`. Duplicate, extra, malformed, non-integer,
  zero/negative, over-limit, stale, source-mismatched, target-mismatched, or profile-mismatched inputs fail closed.
  Unselected, nested, unsupported, and local-helper-owned loops remain explicit conditional evidence. The renderer must
  never evaluate Lua or silently substitute runtime data.
- **Risks / rollback:** incorrect instance rebinding could collapse rows, detach them from their outer table, or corrupt
  evidence reciprocity. Rollback is the exact B119 source/test diff from HEAD `37a248cd2a84386ddba1d7232800cc83ef350a5f`;
  no mod, corpus, setting, save, installed extension, or game file is touched before package acceptance.
- **Acceptance criteria:** (1) a portable fixture proves one selected generic loop yields ordered distinct rows and
  iteration-scoped samples; (2) the exact current pending loop yields two distinct rows containing four exact supplied
  strings while header/ref/footer/REVIEW/SEND/END remain present; (3) the same source without loop selection retains
  current conditional evidence and geometry; (4) all listed invalid/stale inputs refuse or clear at their owner;
  (5) nested and local-helper loops remain conditional; (6) program/evidence JSON round-trip and reciprocity validate;
  (7) Scene/Paint/Canvas stay non-refused for the selected real-source case and retain `Not verified in game`; (8) no
  source/workspace/export/deploy mutation occurs from preview selection.
- **Required validation:** focused Layout, Preview Pipeline, Editor Session, Source Editor component/E2E, and exact
  configured-source selftests; scoped ESLint and TypeScript; full oracle sweep and serial E2E after integration;
  production build/package/install/runtime parity and installed rendered-host screenshot before any commit. Negative
  tests cover every input rejection above. X4 launch is deferred until installed Forge produces the intended exact
  source-backed loop rows; game evidence remains the separate authority.
- **Evidence locations:** this plan; focused test receipts; installed candidate/package receipts under
  `dev-docs/b119-ai-influence-dogfood/`; and a new installed-editor screenshot beside the `0.0.72` evidence. External
  GitHub #41, Notion, and Google Drive projections update only after the bounded result is validated.

### BASELINE / RECONCILE

- Forge `HEAD == origin/main == 37a248cd2a84386ddba1d7232800cc83ef350a5f`; the existing unrelated dirty and
  untracked files remain outside this unit. X4 is stopped; Antigravity and installed Forge `0.0.72` are open; the
  machine is quiet. No B119 file has changed since the documented `0.0.72` close.
- The exact configured selected-path fixture currently records `66` operations / `35` applied and `1/4/9/88`
  frame/table/row/cell geometry. Its two loop-owned `createText` operations at lines `742` and `744` remain
  conditional. This is the before-state to preserve when no loop authority is supplied.
- Reference provenance proves the loop's outer `ct` table was created before the loop, while `row` and its indexed
  cells are created inside the loop. Per-iteration replay therefore must preserve `ct` and rebind `row`, cell, object,
  operation, and sample identities. `r.tone` affects a runtime assignment to `vc`; the first unit keeps that color
  unavailable rather than fabricating it.
- **No capability-map delta at specification time.** A delta is recorded only after installed runtime proof establishes
  the usable loop-preview capability.

### IMPLEMENT / VALIDATE CHECKPOINT 1 — Layout Program finite-loop owner

- **Status:** `VERIFIED` for the bounded Layout Program owner only; the end-to-end B119 continuation remains in progress.
- `x4UiLayoutProgram.ts` now issues a deterministic finite-loop catalog bound to the exact source identity, target, and
  complete normalized projection profile. Only direct, single-depth target-loop UI calls enter the catalog. Accepted
  selections replay `1..16` preview iterations with distinct operation, row/cell reference, sample, and evidence
  identities; omission preserves conditional behavior.
- The first worker pass exposed two review defects: enabling local expansion bypassed direct-loop replay, and catalog
  authority was bound only to the caller-visible profile ID. The correction composes direct-loop replay with local
  expansion while leaving loop-owned helper invocations looped, and hashes the full normalized profile so reusing a
  human profile ID after geometry/scale changes fails closed.
- **Focused behavior:** `npx tsx src/lib/x4UiLayoutProgram.selftest.ts` -> exit `0`; `730` passed, `1` intentional skip,
  `731` total. New checks cover independent per-iteration geometry/samples, reciprocal evidence, every malformed/stale
  selection class, same-ID profile drift, nested-loop non-replay, and local-expansion coexistence.
- **Static gates:** `npm run typecheck` -> exit `0`; scoped ESLint for the Layout Program and selftest -> exit `0`;
  scoped `git diff --check` -> exit `0`.
- **Negative / truth boundary:** iteration counts `0`, negative, fractional, and `17`, duplicate/extra/malformed IDs,
  stale source, wrong target, wrong exact profile, nested loops, and helper-owned loop bodies are rejected or retained as
  conditional evidence. Every result still carries `Not verified in game` and no mod, game, corpus, source, export,
  deployment, or installed-extension bytes changed.
- **AAR trigger:** review forced correction, and one read-only diagnostic used an incorrect target-catalog access path
  before being rerun against the exported catalog builder. Sustain the fail-first public-path matrix; improve by keeping
  owner-issued catalog access in review fixtures explicit rather than inferred from adjacent model fields.

### IMPLEMENT / VALIDATE CHECKPOINT 2 — Preview Pipeline and Editor Session authority

- **Status:** `VERIFIED` for the bounded Preview Pipeline and Editor Session owners; visible Source Editor controls,
  exact configured-source replay, packaging, installed-host proof, and game validation remain in progress.
- `x4UiPreviewPipeline.ts` now forwards the owner-issued finite-loop input into Layout and projects the exact loop
  catalog, accepted selections, and normalized loop input without weakening the permanent game-truth boundary.
  `x4UiEditorSession.ts` now owns opaque `WeakMap` catalog authority, source/target/full-profile binding, finite control
  updates and reset, stale-state clearing, and the required three-stage projection: issue path/loop catalogs; accept
  path/loop state to derive the iteration-scoped sample catalog; then accept matching samples for final render.
- Canonical session fields are `loops` and `loopCatalogAuthority`. Compatibility aliases remain bounded: duplicate loop
  states are accepted only when they satisfy the exact closed contract and are deterministically equivalent; duplicate
  authorities must be the same session-issued object. Conflicting, copied, accessor-backed, or non-enumerable aliases
  fail closed without invoking getters or forwarding loop state.
- **Focused behavior:** independent `npx tsx src/lib/x4UiPreviewPipeline.selftest.ts` -> exit `0`, `122/122`; independent
  `npx tsx src/lib/x4UiEditorSession.selftest.ts` -> exit `0`, causal matrix `14/14` and P7 owner matrix `7/7`.
  The matrix covers bounds, malformed/stale/forged authorities, path+loop+sample coexistence, deterministic replay,
  dependent-sample clearing, alias conflicts/equivalence, hostile descriptors, and `Not verified in game` invariants.
- **Static gates:** `npm run typecheck` -> exit `0`; scoped ESLint for the Pipeline/Session quartet -> exit `0`; scoped
  `git diff --check` -> exit `0`. Only the four owned Pipeline/Session files changed in this checkpoint.
- **Negative / mutation boundary:** copied catalog authorities cannot be replayed; source, target, exact normalized
  profile, catalog, path, or loop drift clears dependent state; no preview input mutates workspace/source/export/deploy
  bytes; no runtime Lua expression or iterator is executed.
- **AAR trigger:** fresh-eyes review found that the first green implementation silently preferred one of three loop-state
  aliases and one of two authority aliases. The corrective selftest initially ran `12/14`, then passed `14/14` after
  the public session boundary was made explicitly fail closed. Sustain independent post-worker review even after green
  receipts; improve by declaring one canonical public field before adding compatibility aliases.

### IMPLEMENT / VALIDATE CHECKPOINT 3 — visible Source Editor loop controls

- **Status:** `PARTIAL` for the bounded visible-control unit: implementation, component behavior, typecheck, lint, and
  diff validation are green; the authored Playwright interaction remains intentionally unrun until the exact-source
  integration is complete and the full ephemeral E2E gate can run once.
- The existing Source Editor now owns loop state, exact binding, opaque catalog authority, reconciliation errors, and
  public update/reset actions. Its visible order is `Preview branch paths -> Preview Loop Iterations -> Preview-only
  samples`, matching the session dependency that selected paths and loops determine the sample catalog.
- Each owner-issued direct loop exposes its exact source range, kind, multiplicity, ID, depth, and preview provenance;
  its numeric control declares `min=1`, `max=16`, and `step=1`, while the session owner remains the enforcement point.
  The panel and every control remain explicitly `Preview only`, with `Not verified in game` shown beside reset.
- **Focused behavior:** independent `npx tsx src/components/X4UiSourceEditor.selftest.tsx` -> exit `0`, including the
  existing selection/authority matrices and P7 `15/15`. New cases cover SSR non-mutation, catalog/no-entry states,
  finite count acceptance, `0`/`17`/empty refusal, explicit reset, branch+loop+sample ordering, and stale dependent
  sample clearing. `npm run typecheck`, scoped ESLint, and scoped `git diff --check` each exited `0`.
- The E2E fixture now exposes a real `menu.previewLoop` target and asserts visible panel order, count `4`, reset to
  empty, numeric bounds, and unchanged game truth. It is evidence authored, not yet execution evidence.
- **AAR / tooling trigger:** closing the native worker left eight unused Godot/Meshy/Discord/Playwright MCP launcher and
  child processes alive (about `700-800 MB`). Their exact post-worker PIDs were terminated and verified absent before
  the next worker. Sustain serial workers and post-close process census; do not let closed-agent MCP helpers accumulate.

### IMPLEMENT / VALIDATE CHECKPOINT 4 — loop-scoped Layout evidence gaps

- **Status:** `VERIFIED` for the Layout producer/evidence-pair owner. The selected real-source Scene/Paint boundary and
  installed-host proof remain in progress.
- The producer and evidence schemas already issued `previewLoop` on gaps, but the final evidence-pair validator omitted
  that optional key. The repair accepts only the existing deterministic selected-loop instance, requires the program and
  authority gaps to match exactly, and requires a loop-scoped linked gap to match its owning operation's loop identity.
  Ordinary no-loop gaps remain valid.
- **Fail-first receipt:** the focused Layout selftest reported `730` passed, `1` skipped, `1` failed (`732` total); the
  valid loop-scoped gap was rejected as malformed/unknown-key at index `0`.
- **Final receipt:** `pnpm exec tsx src/lib/x4UiLayoutProgram.selftest.ts` -> exit `0`, `738` passed, `1` intentional
  skip, `739` total; B119 matrix `135/135`. TypeScript, scoped ESLint, and scoped diff hygiene each exited `0`.
- **Negative path:** one-sided provenance, mutated entry/loop IDs, iteration/count drift, unknown keys, null values,
  accessor-backed values, and a valid loop instance linked to the wrong operation all fail closed without reading a
  getter.

### IMPLEMENT / VALIDATE CHECKPOINT 5 — exact selected-loop source transition

- **Status:** Layout transition `VERIFIED`; Scene integration `FAILED` at a reproduced closed-schema boundary. This is
  an integration checkpoint, not an end-to-end close.
- Exact source remains `aic_menu.lua` SHA-256
  `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`, loop lines `733-746`. The unselected program
  has `17` external generic sample identities plus the two loop placeholders at lines `742` and `744`. Selecting two
  iterations preserves the same `17` external identities, removes both generic placeholders, and issues four exact
  loop-scoped replacements: `They provide`, `two escort wings`, `You provide`, and `24000 Cr`.
- The exact selected Layout receipt is `21` samples (`13` consumed / `8` not consumed), `71` operations (`41` applied),
  `1` frame, `4` tables, `10` rows, `100` cells, and `128` gaps. Source-offset containment and reciprocal loop authority
  are asserted directly in the real-source Scene selftest.
- Scene currently refuses before geometry with `malformed-structure`, diagnostic stage `arrays-preview`; Paint is not
  issued. The reproduced first cause is that Scene's closed preview-sample validator does not yet admit or validate the
  producer-issued `previewLoop` field. Scene's operation/gap validators and preview serialization expose the same
  contract lag and are the current bounded repair surface.
- **AAR trigger:** extending a producer-owned provenance schema without immediately sweeping every closed downstream
  consumer produced a convincing upstream-green/downstream-red boundary. The correction must validate and preserve the
  issued structure; merely adding an optional-key whitelist would repeat the defect.

### IMPLEMENT / VALIDATE CHECKPOINT 6 — Scene loop provenance and exact geometry boundary

- **Status:** Scene provenance repair `VERIFIED`; exact source rendering remains `PARTIAL`. The prior
  `arrays-preview` malformed-structure refusal is removed without weakening the producer evidence pair.
- Scene now validates `previewLoop` as the producer-issued closed structure, rejects malformed/null/extra/accessor-backed
  or stale fields without executing getters, requires reciprocity across operations, authority snapshots/calls/source
  bindings, gaps, sample catalog entries/consumers, and sample bindings, and serializes the full loop instance into
  Scene gaps and preview bindings. Repeated source offsets are accepted only for distinct issued loop occurrences;
  row order and kernel transitions remain strict by iteration and issued operation order.
- The exact selected source reaches a partial Scene and preserves the four issued bindings in order: `742:1`, `742:2`,
  `744:1`, `744:2`. Direct Scene selftest result is `178/179`; every new provenance and hostile-input assertion passes.
  The sole red assertion remains the required four drawable texts because no fallback geometry is permitted.
- Exact no-geometry receipt: frame rectangle is accepted as `0,0,2560,1440` with no frame geometry gaps. The selected
  `ct` table has no rectangle because gaps `scene-gap:000078`, `000079`, and `000081` retain unavailable table height,
  the caller-supplied `minTextHeight` requirement, and incomplete scrollbar geometry at source
  `693:15:41156-696:59:41418`. Loop text-height gaps `000121/000122/000132/000133` retain exact iteration provenance
  for source lines `742` and `744`; the four issued samples are strings and therefore cannot satisfy the missing numeric
  font/height evidence.
- Deterministic Scene receipt: SHA-256
  `EF2A82064A6D794F310B2FB6CE2B0DDAF35A60DD6E3B66DBD9371BA27B76C165`; census
  `1 frame / 4 tables / 6 rows / 64 cells / 0 widgets / 0 texts / 0 glyphs / 185 gaps`.
  Paint currently refuses with `invalid-scene`; this is a separate downstream closed-consumer lag, not proof that the
  Scene loop evidence is invalid.
- Direct local TypeScript, scoped ESLint, Layout regression (`738 passed, 1 skipped, 739 total`), and diff hygiene pass.
  The exact `pnpm exec` forms fail before execution at `ERR_PNPM_IGNORED_BUILDS`; no dependency approval/install
  mutation was made. No mod, game, corpus, installed extension, or deploy bytes changed.
- **AAR trigger:** one producer extension exposed two independent downstream boundaries: closed-schema consumer lag and
  genuinely unavailable geometry. Keep those distinct. A downstream validator must first accept and preserve the issued
  provenance; geometry may advance only from exact source/corpus evidence, never from a fallback rectangle.

### PLAN / ACCEPTANCE CONTRACT — Paint closed-consumer loop provenance

- **Bounded unit:** extend only the existing Scene-to-Paint validation/serialization boundary so a Scene carrying valid,
  producer-issued closed loop provenance reaches the existing partial diagnostic Paint plan. This unit does not solve the selected
  table's missing height or make its loop text drawable.
- **Existing capability reused:** Scene owns the accepted loop structure and immutable preview receipt; Paint already
  validates issued Scene authority and produces partial diagnostics for unavailable geometry. Extend that validator and
  no other loop language.
- **Reconciled contract correction:** Scene serializes loop provenance independently on gaps and preview sample bindings;
  it does not promise a reciprocal cross-array relation. A valid pre-sample Scene may carry loop gaps with zero bindings,
  while a consumed binding may remain after its related geometry gap is resolved. Paint therefore validates each closed
  record and trusts only the opaque producer-issued Scene authority; it must not invent gap-to-binding existence checks.
- **Acceptance criteria:** (1) the exact Scene receipt above no longer returns `invalid-scene`; (2) Paint returns an
  issued `partial` plan whose deterministic census/hash is pinned; (3) all four loop instances survive any Paint-visible
  diagnostic provenance in issued order where applicable; (4) malformed/null/extra/accessor-backed, stale, missing,
  or mismatched fields within an individual Scene loop record still refuse without getter execution; (5) valid loop gaps
  with zero bindings, valid consumed bindings with no corresponding gap, and no-loop Paint fixtures remain green; (6) the
  strict four-drawable-text assertion remains red until the separate upstream geometry unit is repaired.
- **Negative path / truth boundary:** Paint must reject forged Scene or authority evidence and must not emit geometry,
  text, or glyph commands for nodes without accepted rectangles. `Not verified in game` remains authoritative.
- **Validation:** Paint Plan focused selftest, Scene regression, direct TypeScript and scoped ESLint, and scoped diff
  hygiene. Full oracles/E2E/build/install/game remain deferred until this consumer repair and the separate geometry unit
  converge.
- **Rollback:** scoped Paint source/test diff only; the Scene receipt above is the immutable producer baseline for this
  unit. No capability-map delta yet.

### IMPLEMENT / VALIDATE CHECKPOINT 7 — Paint closed-consumer loop provenance

- **Status:** Paint boundary `VERIFIED`; end-to-end exact source remains `PARTIAL` at the separate upstream geometry
  boundary. Paint no longer rejects the producer-issued selected-loop Scene as `invalid-scene`.
- Paint now validates the exact closed Scene loop record, source range, kind, multiplicity, depth, iteration bounds,
  sample binding type/status, and dense closed arrays without executing accessors. It deliberately does not require a
  cross-array gap/binding pair: the producer contract permits loop gaps before samples are supplied and permits consumed
  bindings after related geometry gaps resolve.
- The exact selected source now reaches an issued partial Paint plan with `canRender: true`. Deterministic Paint receipt:
  SHA-256 `4F8AF6B17C20776FCF08D64500C334C0799D6071984611DB24CB3FF3EFF21FEA`; `4` layers, `335`
  commands, `260` diagnostics, `0` selected node IDs, and `0` keep-outs. Scene remains the checkpoint-6 receipt with
  zero drawable texts; no geometry was fabricated.
- **Focused behavior:** direct Paint selftest `210/210`; direct Layout regression `738` passed plus `1` intentional
  skip; direct Scene regression `178/179`, with only the preserved four-drawable-text assertion red. The Paint matrix
  covers valid loop gaps with zero bindings, valid gapless consumed bindings, exact producer enums, null/extra/missing/
  malformed/custom-prototype/inherited/non-enumerable/accessor loop records, stale IDs, invalid iteration bounds, and
  unsupported sample status; hostile accessor cases record zero getter reads. No-loop fixtures remain green.
- **Static gates:** direct TypeScript, scoped ESLint, and scoped `git diff --check` passed. Corresponding `pnpm exec`
  attempts still fail before execution at `ERR_PNPM_IGNORED_BUILDS`; no dependency install or approval mutation was made.
- **AAR trigger:** the original work order over-specified reciprocal gap/binding provenance. Producer reconciliation
  disproved that contract before close. Sustain downstream validation of the producer's serialized shape; improve by
  deriving cross-object invariants from the issuer itself rather than inferring them from one observed receipt.

### PLAN / ACCEPTANCE CONTRACT — active selected-call `_font` evidence

- **Bounded unit:** extend the existing Layout Program's exact local `_font` wrapper evaluator so wrapper invocations
  already proven active by the selected branch paths and finite loop replay may supply source-backed font values. This
  is the smallest upstream geometry unit capable of resolving the four selected loop text-height gaps; it does not add
  a Lua interpreter or execute source.
- **Authoritative references:** configured X4 9.00 `helper.lua` SHA-256
  `D24A08B8DA9F2C972794B60ACB48AE36F38CB026C991249DAB9F1164272D4DF2`, especially `scaleFont` lines `846-858`,
  row/table finalization lines `4779-4958`, cell height lines `5390-5400`, and text creation/height lines `5475-5497`;
  current `aic_menu.lua` SHA-256 `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`,
  exact `_font` wrapper lines `225-232`, selected paths `711/717/721`, and selected generic loop `733-746`; configured
  2560x1440 profile at UI scale `1.4`; and the configured Zekton regular/bold ABC/DDS corpus assets.
- **Existing capability reused:** Call Model already emits exact local invocation IDs and reachability; selected Layout
  `targetCalls` already represent the active branch arms and finite loop instances; the exact wrapper AST evaluator,
  source hash binding, `Helper.scaleFont` semantics, descriptor scaling, and Zekton metrics owners already exist.
- **In scope:** derive an allow-list of local invocation IDs only from currently active selected `targetCalls`; admit
  those exact IDs to the existing `_font` wrapper evaluator; preserve the exact source behavior where `_font(9)` first
  yields `ceil(9 * 1.4) = 13` and the `createText` descriptor scales that to `ceil(13 * 1.4) = 19`; retain distinct
  operation/loop provenance for both issued iterations even when they reuse the same static wrapper invocation.
- **Out of scope:** globally removing branch/loop guards; evaluating arbitrary helpers, dynamic arguments, predicates,
  iterators, table lookups, assignments, runtime Lua, unselected branch arms, unselected/nested loops, or local-helper
  loops; inventing font, height, table, scrollbar, or widget geometry; claiming C++ acceptance or in-game truth.
- **Risks / rollback:** an over-broad allow-list could make unselected code appear active and fabricate geometry. Bind
  eligibility to exact selected call-model issuance and keep every existing wrapper/source/AST authority check. Rollback
  is the scoped Layout source/test plus exact-source Scene test diff; no mod, corpus, game, installed extension, or
  deployment byte is touched.
- **Acceptance criteria:** (1) a portable selected-branch and selected-loop fixture resolves exact wrapper results and
  source-backed text heights without source execution; (2) unselected branches/loops, nested loops, local-helper loops,
  dynamic arguments, and hostile wrapper mutations remain unavailable or conditional; (3) the exact selected source
  records wrapper value `13`, descriptor font size `19`, an accepted `ct` table rectangle, and four drawable sampled
  texts/glyphs; (4) loop font-height gaps `000121/000122/000132/000133` disappear from the deterministic Scene receipt;
  (5) Layout evidence pairing, loop sample catalog, issued order, and no-loop behavior remain unchanged; (6) Paint
  accepts both valid pre-sample loop gaps and the final consumed-binding Scene; (7) every surface remains permanently
  `Not verified in game` until separate game evidence exists.
- **Required validation / negative path:** focused Layout, Scene, and Paint selftests run serially; exact real-source
  receipt assertions; direct TypeScript, scoped ESLint, and diff hygiene; then full oracles/E2E/build only after focused
  integration is green. Hostile wrapper/source/profile/path/loop cases must remain fail closed. Installed-host visual and
  X4 validation are later layers, not substitutes for this deterministic contract.
- **Evidence / capability map:** focused receipts and final installed evidence remain under this plan and
  `dev-docs/b119-ai-influence-dogfood/`. No capability-map delta until the installed product renders the exact selected
  source and the real game separately confirms any claimed player-visible result.

### IMPLEMENT / VALIDATE CHECKPOINT 8 — active selected-call `_font` evidence

- **Status:** `PARTIAL`. The selected real MENU path crossed the intended geometry boundary, but the required full Scene
  selftest remains red at a separate exact HUB census and therefore this unit is not integration-verified.
- Layout now derives local-wrapper eligibility from local invocation identities present in the accepted issued-call
  stream after branch and finite-loop selection. The exact wrapper evaluator still requires the existing direct
  declaration, result-consumed, literal-argument, source/AST, global `Helper`/`rawget`, positive-result guard, and
  fallback evidence. A reachable target plus dormant local-helper fixture proves that a source-valid wrapper outside
  the issued stream is not admitted.
- The exact selected `aic_menu.lua` source retains SHA-256
  `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`, `21` samples, and the four issued loop values.
  Five static `_font` call sites produce seven issued occurrences. Each loop `_font(9)` yields wrapper value `13`, then
  the source-faithful descriptor scaling yields font size `19`. The four loop text operations remain in issued order,
  own nonzero glyphs, and are distributed exactly two per each of two loop rows.
- Earned geometry is `ct = { x: 600, y: 734, width: 1050, height: 148 }`; the prior four loop font-height gaps are gone.
  Scene receipt SHA-256 is `83BB4960E327FE272B7352CAFBBBEBDD2AC3389B6E2BB14F15A04BB8216DE92B`, with `14` texts and
  `196` glyphs. Paint receipt SHA-256 is `C438F8D5C953BF884AB5CF7F1E060A8A800B8D4B4B350AC4788D95CD9B2DBCD9`, with
  `562` commands and `266` diagnostics; Paint is non-refused and `canRender: true`.
- **Validation:** direct Layout selftest passed `741` checks with `1` intentional corpus-configuration skip; Paint passed
  `210/210`; direct TypeScript, scoped ESLint, and scoped diff hygiene passed. Scene ran `178/179`: all exact MENU
  assertions passed, while unchanged HUB expected `9/7/2` samples, `18/11` operations, and `1/2/2/4/12` geometry but
  observed `4/2/2`, `18/5`, and `1/2/2/0/20`. The expected HUB receipt was not weakened. All requested `pnpm exec`
  wrappers stopped before execution at setup-only `ERR_PNPM_IGNORED_BUILDS`; direct binaries are the execution evidence.
- **AAR triggers:** one Layout process ended without a usable receipt and was rerun; the first exact-source assertion had
  test-only syntax and issued-order defects; TypeScript later found a test-only union-narrowing defect; fresh-eyes review
  strengthened two potentially vacuous exact-source assertions. Sustain exact source-line/iteration/row ownership
  receipts and a separate downstream census. Improve by treating wrapper eligibility as issued-operation authority from
  the first design, rather than adapting a model-global fallback.

### PLAN / ACCEPTANCE CONTRACT — exact HUB census reconciliation

- **Bounded unit:** reproduce and causally repair the exact HUB census regression caused by the active-wrapper change.
  Preserve the now-green MENU geometry and every existing Scene/Paint authority boundary. This is an integration repair,
  not permission to update an expected receipt to the current output.
- **Baseline:** exact HUB expects `9/7/2` supplied/consumed/not-consumed samples, `18/11` total/applied operations, and
  `1 frame / 2 tables / 2 rows / 4 cells / 12 gaps`; current output is `4/2/2`, `18/5`, and
  `1/2/2/0/20`. The four missing geometry expressions are not yet accepted as a legitimate behavior change. MENU and
  Paint receipts above are immutable regression anchors.
- **Reconciliation boundary:** enumerate the exact HUB sample catalog before and after wrapper eligibility, the active
  issued invocation IDs, wrapper-result map keys, and every sample excluded as resolved. Determine whether the defect is
  producer eligibility, sample-catalog filtering, session reconciliation, or test input before editing. A source-valid
  but unissued local helper must remain unavailable.
- **Acceptance criteria:** (1) HUB returns to its existing exact census unless source-backed evidence proves a new receipt;
  (2) exact MENU remains at the checkpoint-8 Layout/Scene/Paint receipts; (3) the portable active/dormant wrapper matrix
  remains green; (4) Layout evidence pairs and Scene/Paint closed consumers remain valid; (5) no Lua execution, invented
  values, fallback geometry, receipt weakening, or real source/mod/game/corpus mutation; (6) all results remain
  `Not verified in game`.
- **Required validation / negative path:** fail-first HUB receipt; focused causal regression for the discovered coupling;
  direct Layout, Scene, and Paint selftests serially; direct TypeScript, scoped ESLint, and diff hygiene. Full oracles,
  E2E, build, release, installed-host proof, and game inspection remain blocked until Scene is fully green.
- **Rollback / evidence:** scoped Layout source/selftest and exact configured-source Scene selftest only. Record the
  causal before/after catalogs and final deterministic receipts here. No capability-map delta yet.

### IMPLEMENT / VALIDATE CHECKPOINT 9 — exact HUB numeric-root sample authority

- **Status:** `PARTIAL`. The exact HUB regression is causally repaired and its immutable receipt is restored, while the
  full Scene owner remains red at a separate configured COMM catalog assertion. This checkpoint does not treat the
  remaining `178/179` Scene result as integration verification.
- **Causal baseline:** HUB issued only `#TABS`, `y`, `i`, and `name` samples (`4/2/2` supplied/consumed/not consumed),
  applied `5/18` operations, materialized `0` cells, and retained `20` gaps. Temporarily removing active-issued local
  wrapper enforcement admitted four dormant font-wrapper results but left the HUB receipt unchanged. That controlled
  comparison rules out wrapper producer eligibility with high confidence; the defect was the sample-catalog handoff.
- `vw`, `vh`, `my`, and `w` carried structurally valid numeric descriptors but were unconditionally excluded from
  preview sampling; `x` also failed exact root binding. Layout now admits a numeric preview input only when the selected
  target owns a structurally valid numeric expression whose exact root binding fails. It keys that fallback by descriptor
  source so repeated consumers reuse one issued sample. Fully source-resolved formulas remain outside preview authority.
- Descriptor validation now precedes sample lookup. A hostile supplied sample cannot bypass a malformed or unsupported
  numeric AST; the forged descriptor remains rejected while an intact sibling fallback may still be consumed. No Lua is
  executed and no filename, source hash, line, variable name, or expected census is special-cased in production.
- **Final exact receipts:** HUB returns to `9/7/2` samples, `18/11` operations, and
  `1 frame / 2 tables / 2 rows / 4 cells / 12 gaps`. Selected MENU remains at Scene SHA-256
  `83BB4960E327FE272B7352CAFBBBEBDD2AC3389B6E2BB14F15A04BB8216DE92B` and Paint SHA-256
  `C438F8D5C953BF884AB5CF7F1E060A8A800B8D4B4B350AC4788D95CD9B2DBCD9`, with five wrapper identities,
  seven issued occurrences, four loop values, and no loop geometry gaps.
- **Portable negative/positive proof:** an unbound-root control issues no numeric catalog; the exact-root-binding-loss
  fixture issues the five definition-scoped inputs `vw`, `vh`, `x`, `my`, and `w`, deduplicates repeated `x` consumers,
  consumes all five supplied bindings, and restores four cells. Hostile descriptor/sample mutations fail closed.
- **Validation:** direct Layout `743` passed plus `1` intentional corpus-configuration skip (`744` total); Paint
  `210/210`; direct TypeScript, scoped ESLint, and scoped diff hygiene passed. Direct Scene is `178/179`: HUB and MENU
  receipts pass, while COMM observes two selected entries where the existing exact-source assertion expects four.
  Strict-versus-prior wrapper comparisons leave the COMM result unchanged, so it is not attributed to this HUB repair.
  Five `pnpm exec` forms stopped before target execution at setup-only `ERR_PNPM_IGNORED_BUILDS`; direct binaries are
  the execution evidence and no dependency approval/install was performed.
- **Baseline attribution / scope:** `pnpm-lock.yaml` was created at `2026-09-06 13:45`, before the HUB worker began at
  approximately `17:47`, and remains unrelated pre-existing untracked state. No configured mod, game, corpus, installed
  extension, deployment, or release byte changed. All surfaces remain `Not verified in game`.
- **AAR triggers:** the naive fallback first over-issued two repeated use-site entries and then changed MENU catalog
  identity; fresh-eyes review caught sample lookup preceding descriptor validation; the hostile regression required
  multiple test-shape/wording corrections; and full Scene exposed the separate COMM red after HUB/MENU advanced.
  Sustain immutable cross-owner receipts and hostile-sample tests. Improve by designing preview authority around the
  descriptor definition and validating the descriptor before consulting any user-supplied value.

### PLAN / ACCEPTANCE CONTRACT — exact COMM selected-sample reconciliation

- **Bounded unit:** reproduce and causally classify the configured `aic_comm.lua` catalog mismatch in the existing
  Layout-to-Session-to-Scene path, then repair only the proven owner if the current four-entry receipt is still the
  source-backed contract. Do not change the expected count merely to clear the full Scene gate.
- **Baseline / authority:** HEAD, upstream, and `origin/main` are
  `37a248cd2a84386ddba1d7232800cc83ef350a5f`. Exact COMM source is
  `F:\DEV_ENV\projects\Mods\X4Mods\x4_ai_influence\ui\addons\ai_influence_chat\aic_comm.lua`, SHA-256
  `88FAB05A79EF33CB28E098081EA6A5E29E8F3B7C4150C39BF38913C51C063511`. The public exact-source test expects four
  selected, consumed samples after excluding the active `font(13)` wrapper, including exactly one opaque title entry;
  current output is two selected entries with the opaque/call-shaped title still present. HUB and MENU checkpoint-9
  receipts are immutable regression anchors.
- **Reconciliation before edit:** enumerate the exact current COMM catalog entries, source ranges, consumers, active
  invocation IDs, wrapper-result keys, and every candidate excluded as exact/resolved/unbound. Run a controlled prior
  eligibility comparison and inspect the current source at `comm.display`, including viewport aliases, `mx`/`my`,
  `vw - mx * 2`, and the opaque title. Classify the mismatch as latent expectation drift, producer eligibility,
  descriptor identity/deduplication, Session filtering, or another proven coupling before mutation.
- **Acceptance criteria:** (1) an exact fail-first receipt explains the missing two entries; (2) a portable synthetic
  regression proves the discovered rule without real-source filenames, hashes, lines, or variable-name branches;
  (3) COMM either returns to the source-backed four-entry/fully consumed receipt and its existing Layout/Scene/Paint
  geometry, or stronger source evidence documents why the immutable expectation itself is invalid before any update;
  (4) HUB `9/7/2` and MENU hashes above remain exact; (5) active-issued local wrapper, numeric-root fallback,
  descriptor-validation-before-sample, loop/path, and hostile evidence matrices remain green; (6) no Lua execution,
  invented values, real source/mod/game/corpus mutation, or game-truth claim.
- **Required validation / negative path:** direct Layout, Scene, Paint, Preview Pipeline, and Editor Session owners run
  serially; direct TypeScript, scoped ESLint, and diff hygiene; explicit hostile descriptor/sample and dormant-wrapper
  controls. Full oracles, E2E, build, release, installed-host visual proof, and game inspection remain deferred until the
  full Scene owner is green.
- **Rollback / evidence:** restrict implementation to existing Layout/Session/Scene owners and focused tests proven by
  reconciliation; preserve every unrelated dirty file. Record before/after catalog entries and deterministic receipts
  here. No capability-map delta yet.

### IMPLEMENT / VALIDATE CHECKPOINT 10 — exact COMM sample-count authority

- **Status:** `PARTIAL`. The stale COMM sample-count contract is corrected from `4/4/0` to `2/2/0` with source-backed
  evidence; the full Scene owner remains `178/179` at a newly exposed, separately scoped unprovided-Scene receipt.
- Exact source remains SHA-256 `88FAB05A79EF33CB28E098081EA6A5E29E8F3B7C4150C39BF38913C51C063511`, target
  range `471:0:21836-550:3:25429`. After excluding the active `font(13)` wrapper, the producer issues exactly two
  preview samples: `comm._tab` at `498:46:23140-498:55:23149` for `addTable.taborder`, and the opaque title expression
  at `505:21:23491-506:90:23600` for `createText.text`. Replaying values `80` and
  `COMM CHANNEL    encrypted - sampled sector` consumes both.
- `vw=1920`, `vh=1080`, `mx=27`, `my=27`, and `vw - mx * 2=1866` are exact source-resolved numeric facts and therefore
  remain outside preview authority. `font(13)` is an active issued direct-wrapper result; `scaleY(44)` and `scaleY(16)`
  are direct-helper-scale results. Session and Preview Pipeline preserve the producer catalog unchanged.
- Restoring the prior unconditional numeric exclusion and the prior global wrapper eligibility each still yields the
  same two entries. A portable COMM-shaped Layout regression proves that exact source-bound numeric formulas resolve as
  source facts while only dynamic tab/title values enter sample authority. Confidence is approximately `98%` that the
  four-entry expectation was latent stale test drift, not a production omission.
- Only exact COMM sample-count constants/assertions were reconciled to `2/2/0` and “two selected.” Operations, geometry,
  source hash, opaque-title, font, MENU, HUB, Scene, and Paint expectations were not changed. No production edit was
  required.
- **Validation:** Layout `744` passed plus `1` intentional skip (`745` total); Editor Session `14/14` plus P7 `7/7`;
  Preview Pipeline `122/122`; Paint `210/210`; direct TypeScript, all-owned-file ESLint, and diff hygiene passed. Strict
  Scene advances past the sample-count assertion but remains `178/179`: the unprovided COMM Scene observes
  `1 row / 3 cells / 24 gaps` where the untouched expectation says `0 / 0 / 23`. MENU and HUB receipts remain exact,
  including selected MENU Scene/Paint hashes `83BB4960...6DE92B` and `C438F8D5...2DBCD9`.
- **AAR triggers:** the initial four-entry failure masked a second stale-or-changed downstream receipt; one filtered
  Scene capture returned no usable count and required a direct-summary rerun. Sustain fail-fast census advancement one
  assertion at a time. Improve by recording the unsampled and sampled receipts independently whenever sample authority
  changes, so a stale pre-sample expectation cannot hide behind a catalog-count assertion.

### PLAN / ACCEPTANCE CONTRACT — exact COMM unprovided Scene receipt

- **Bounded unit:** reproduce and causally reconcile the exact COMM Scene produced before either dynamic sample is
  supplied. Determine whether the observed `1 row / 3 cells / 24 gaps` is the valid consequence of newly proven
  source-resolved geometry or a Scene materialization defect. Change only the proven owner/expectation; do not normalize
  the census merely to reach `179/179`.
- **Baseline / immutable anchors:** exact COMM source/hash and `2/2/0` catalog receipt are checkpoint-10 authority.
  Current unprovided Scene is partial and observes `1` row, `3` cells, and `24` gaps; the existing assertion expects
  `0`, `0`, and `23`. The sampled COMM Layout/Scene/Paint receipts, HUB `9/7/2` receipt, and selected MENU hashes remain
  immutable unless stronger producer evidence proves otherwise.
- **Reconciliation before edit:** capture the complete unprovided Layout and Scene census, node IDs, accepted rectangles,
  widget/text/glyph ownership, and all 24 gaps with categories/source/provenance. Trace the row and three cells to exact
  Layout operation/kernel evidence and identify the additional gap. Compare unsupplied versus supplied receipts and a
  portable COMM-shaped fixture. Determine whether Scene is correctly preserving source-known structure while refusing
  only dynamic content, or materializing a node whose required evidence is absent.
- **Acceptance criteria:** (1) a fail-first receipt explains every `0->1`, `0->3`, and `23->24` delta; (2) a portable
  regression proves the correct pre-sample behavior and a hostile evidence case fails closed; (3) if source-known
  Layout structure legitimately survives without content samples, update only the stale unprovided-Scene expectation;
  if not, repair the existing Scene owner without weakening evidence validation; (4) supplied COMM geometry and title,
  HUB/MENU receipts, Layout/Session/Pipeline/Paint owners, and `Not verified in game` remain exact; (5) full Scene reaches
  `179/179` only from the causal resolution.
- **Required validation / negative path:** direct Layout, Editor Session, Preview Pipeline, Scene, and Paint selftests
  serially; direct TypeScript, scoped ESLint, and diff hygiene; explicit unsupplied/supplied comparison plus malformed,
  missing, stale, and hostile authority controls. Full oracles/E2E/build/release/install/game remain deferred until this
  focused Scene owner is green.
- **Rollback / evidence:** restrict writes to the existing Scene selftest and Scene production owner only if a proven
  production defect exists. Preserve all unrelated dirty state and record the before/after receipt here. No capability-
  map delta yet.

### IMPLEMENT / VALIDATE CHECKPOINT 11 — exact COMM unprovided Scene authority

- **Status:** `VERIFIED` for this bounded receipt. The owner was a stale selftest expectation; no production file changed.
  The full strict Scene owner now passes `179/179`. This does not change the feature's `Not verified in game` boundary.
- Accepted Layout authority already contains the applied `addRow`, one finalized `text/button/button` kernel row, and
  three source-derived cells before either dynamic sample is supplied. Missing title evidence correctly withholds the
  table/row/cell rectangles and every widget, text, and glyph; retaining structural nodes is not drawable geometry.
- The old `23`-gap expectation mixed states. With no samples, `comm._tab` at
  `498:46:23140-498:55:23149` remains one additional `table/unknown` gap, yielding `24`. Supplying only that tab sample
  removes exactly this gap and yields `23` without creating geometry. Supplying the title materializes the row/cell
  rectangles and `3` widgets / `5` texts / `52` glyphs. Supplying both preserves the immutable `27`-gap Scene receipt.
- The unprovided census was reconciled from `0 rows / 0 cells / 23 gaps` to
  `1 row / 3 cells / 24 gaps`. A portable COMM-shaped regression proves source-known structure with zero drawables;
  a hostile missing-owner mutation fails closed in Layout evidence-pair validation before Scene materialization.
- **Immutable receipts:** supplied COMM remains `2/2/0` samples, Layout `14/12` with `1/1/1/3` and `6` gaps, Scene
  `1/1/1/3` with `3/5/52` and `27` gaps, and Paint `104/38`. HUB remains `9/7/2`, Layout `18/11` with `1/2/2/4` and
  `12` gaps. Selected MENU Scene/Paint hashes remain `83BB4960E327FE272B7352CAFBBBEBDD2AC3389B6E2BB14F15A04BB8216DE92B`
  and `C438F8D5C953BF884AB5CF7F1E060A8A800B8D4B4B350AC4788D95CD9B2DBCD9`.
- **Validation:** final-byte strict Scene `179/179`; Layout `744` passed plus `1` intentional skip (`745` total);
  Editor Session `14/14` plus P7 `7/7`; Preview Pipeline `122/122`; Paint `210/210`; direct TypeScript, scoped ESLint,
  and scoped diff hygiene passed. Final Scene selftest SHA-256 is
  `2101C5CCCFD8BEBFFCACC9489FE9C7877FC14DC7226A3FF368DE96CD917251AB`. Pnpm forms stopped before target execution at
  setup-only `ERR_PNPM_IGNORED_BUILDS`; direct binaries are the authoritative executions.
- **Baseline / rollback:** the exact COMM source remained read-only at SHA-256
  `88FAB05A79EF33CB28E098081EA6A5E29E8F3B7C4150C39BF38913C51C063511`; no mod, game, corpus, installed extension,
  deployment, or release byte changed. Temporary evidence instrumentation was removed and the final-byte hash rechecked.
- **AAR triggers:** the first portable fixture placed calls outside the producer helper's top-level scan boundary; the
  corrected fixture then exposed that hostile ownership fails one layer earlier than first assumed. Sustain exact
  transition matrices and final-byte reruns. Improve by constructing portable fixtures on the public producer surface
  and recording unsupplied, one-sample, and fully supplied states separately.

### REVIEW / VALIDATE CHECKPOINT 12 — preview-loop input is inert data

- **Status:** `VERIFIED` for the focused fresh-eyes review. The review reproduced one production trust-boundary defect:
  ordinary reads of preview-loop selection input could execute an enumerable accessor or a Proxy `get` trap, and a
  revoked Proxy could escape as an exception instead of producing a deterministic refusal.
- **Bounded repair:** loop input, source identity, the selections collection, and each selection now require exact own
  enumerable data properties. The selections collection must also be a dense plain data array. Descriptor-safe reads
  refuse accessors and revoked or structurally hostile wrappers without executing their values. No source filename,
  source hash, line, target, profile, or expected census is special-cased.
- **Causal negative proof:** the fail-first regression observed one hostile getter execution and an escaped exception.
  Final-byte tests prove that an enumerable selection accessor is never invoked, a transparent Proxy's `get` trap is
  never invoked, and a revoked Proxy returns `malformed-preview-loop` rather than throwing. Valid owner-issued input
  still produces the immutable MENU/HUB/COMM receipts.
- **Validation:** Layout `745` passed plus `1` intentional corpus-configuration skip (`746` total); Editor Session
  `14/14` plus P7 `7/7`; Preview Pipeline `122/122`; Scene `179/179`; Paint `210/210`; Source Editor cumulative and P7
  `15/15`; direct TypeScript, scoped ESLint across all 13 B119 paths, and scoped diff hygiene all passed. Scene selftest
  remains byte-identical at SHA-256 `2101C5CCCFD8BEBFFCACC9489FE9C7877FC14DC7226A3FF368DE96CD917251AB`.
- **Review result / boundary:** no further focused source-authority, loop/provenance, linter, zero-geometry, serialization,
  or truth-label finding remains open. Full host oracles, E2E, production build, packaging, installed-host rendering, and
  X4 inspection remain the next validation layer. No mod, game, corpus, installed extension, deployment, or release byte
  changed; the product remains `Not verified in game`.
- **AAR triggers:** fresh-eyes review found the accessor crash; the first test edit omitted a required type import and
  TypeScript caught it; a filtered Scene capture required a direct-summary rerun; and the adjacent Proxy/revoked-Proxy
  case expanded the causal regression. Sustain descriptor-first validation at every preview-authority boundary. Improve
  by treating editor-supplied structures as inert data before any iteration or property read.

### PLAN / ACCEPTANCE CONTRACT — full host integration and release-candidate gate

- **Bounded unit:** run the complete host validation stack against the reconciled B119 implementation, repair only a
  causally reproduced B119 regression if a required gate fails, rebuild the code graph after source changes, and create a
  clean B119 checkpoint suitable for release-candidate packaging. Packaging, OpenVSX publication, installed-host proof,
  and X4 inspection are later units and are not authorized by a green local build alone.
- **Baseline:** HEAD, upstream, and `origin/main` are
  `37a248cd2a84386ddba1d7232800cc83ef350a5f`. Antigravity is open with installed Forge `0.0.72`; its sidecar discovery
  record identifies PID `40512`, port `60966`, and installed app path under
  `x4forge.x4-forge-studio-0.0.72`. X4 is absent. Ports `3100/3101` are clear before the run. The B119 source/test/doc
  paths and all unrelated tracked/untracked changes remain attributed to the recorded dirty baseline.
- **Existing infrastructure reused:** `scripts/oracle-sweep.mjs`, the verdict-parsed serial `scripts/run-e2e.mjs`
  harness, Vite/esbuild production build, `scripts/precommit-check.mjs`, and deterministic `graphify update .`. E2E owns
  a per-run temporary state/config/data/discovery directory plus ports `3100/3101`; it must not reuse the installed
  sidecar or live discovery record.
- **Acceptance criteria:** (1) runtime-discovered oracles all pass; (2) full E2E reports its parsed green verdict with no
  retries/flakes; (3) production build completes; (4) precommit passes; (5) `graphify update .` completes and any graph
  delta is reviewed; (6) ports `3100/3101` are clear afterward; (7) the installed `0.0.72` sidecar PID/port and live
  discovery content remain unchanged; (8) no mod, game, corpus, configured workspace, installed extension, deployment,
  publication, or external record is mutated; (9) every failure is classified as pre-existing, B119-caused, harness, or
  environmental before any repair.
- **Required negative/failure path:** retain the hostile preview-loop regression and E2E isolation checks; treat a retry-
  pass, leaked ephemeral listener, changed live discovery record, or red required gate as failure rather than success.
  Do not weaken a test, expected census, linter rule, trust boundary, or truth label to clear the stack.
- **Risks / rollback / evidence:** the heavy suite may leave child processes or generated test artifacts if interrupted.
  Run serially, preserve the user's installed sidecar, and clean only processes proven to descend from the validation
  worker or own ports `3100/3101`. Source rollback is the current explicit B119 diff against HEAD; no broad reset or
  checkout is permitted. Record exact command summaries, hashes, process/discovery receipts, and any scoped repair here.
  No capability-map delta is expected unless validation disproves an existing capability claim.

### RECONCILE / PLAN — local native-binding validation prerequisite

- **Observed failure:** the first isolated current-source sweep reached all `134` runtime-discovered endpoints and passed
  `133`; only `/agent/db-selftest` failed. Its deterministic body reports `available:true`, `pass:false`, and
  `checks.open:false`. A direct root `require('better-sqlite3')` reproduces the missing `better_sqlite3.node` binding.
  This is an environment prerequisite failure, not a B119 code failure (approximately `99%` confidence).
- **Reconciled reusable artifact:** root and staged modules are both `better-sqlite3 12.11.1` under Node `v24.15.0`, ABI
  `137`. The already staged `vscode-extension/app` binary is `1,919,488` bytes, SHA-256
  `E75B8C024A85179D8E0E51203A8B8867916E9A51327CE3953DB5F8483CC9A91E`, and successfully opens/closes an in-memory
  database with this exact Node runtime. The root junction is missing only `build/Release/better_sqlite3.node`.
- **Bounded repair:** create the absent root module `build/Release` directory and copy that exact already validated
  binary into it. Do not run an install, rebuild, download, approval, or lockfile mutation. Do not change source,
  manifests, packages, configuration, installed Forge, or user data.
- **Acceptance / negative path:** copied bytes must retain the exact source hash; root `require` must open/close an
  in-memory database; the isolated `/agent/db-selftest` and full oracle sweep must become green. If version, ABI, hash,
  or load evidence differs, refuse the copy. Rollback is deletion of the one copied file and the two newly created empty
  directories. This environment-only repair is ignored by Git and creates no capability-map delta.

### IMPLEMENT / VALIDATE — local native-binding prerequisite

- **Status:** `VERIFIED`. The staged binary was copied to the otherwise missing root pnpm module
  `build/Release/better_sqlite3.node`; no install, rebuild, download, source, manifest, lockfile, config, installed-host,
  mod, game, corpus, Git, or external-record mutation occurred.
- Pre-copy checks reconfirmed both package versions `12.11.1`, Node `v24.15.0` / ABI `137`, target absence, source size
  `1,919,488`, and source SHA-256 `E75B8C024A85179D8E0E51203A8B8867916E9A51327CE3953DB5F8483CC9A91E`.
  Target bytes retain the exact same size and hash.
- Direct root load, in-memory open, `SELECT 1`, and close all passed with exit `0`. Git porcelain remained exactly `86`
  lines with the same SHA-256 before and after; the ignored environment artifact added no repository status entry.
- **AAR trigger:** a combined copy-and-conditional-rollback command was refused by the command safety wrapper before
  execution. Splitting the validated copy from the separately available exact-path rollback removed the ambiguity. The
  first full oracle sweep must now be rerun from the beginning; prior `133/134` is evidence of the prerequisite failure,
  not acceptance evidence for the repaired environment.

### PLAN / ACCEPTANCE CONTRACT — stable `0.0.73` release and installed-host proof

- **Dependency:** this unit starts only after the complete host integration contract above is green. The user has
  explicitly authorized updating the existing Forge, OpenVSX publication, commit/push, Antigravity Computer Use, and X4
  launch. A green package is still not game truth.
- **Bounded release:** bump only `vscode-extension/package.json` from `0.0.72` to stable `0.0.73`; add concise modder-
  facing `0.0.73` notes for exact source-driven branches/loops, source-known numeric geometry with explicit samples for
  runtime values, same-source MENU/HUB/COMM preview receipts, and inert-data loop authority; regenerate the changelog.
  Reuse the existing root build, `stage-app`, extension build, staged-app probe, stable VSIX packaging, VSIX inspector,
  one OpenVSX publish, public endpoint/download verification, and the installed-extension parity procedure. Never pass
  `--pre-release` and never republish after a successful publish while indexes lag.
- **Publish-before-commit:** build, stage, probe, package, inspect, and publish `0.0.73` before the release commit. Read
  `OVSX_PAT` programmatically from the ignored root `.env.local` without printing it. A successful publish plus the
  direct `0.0.73`/latest endpoint and an independent public download matching local size/SHA-256 authorize the commit;
  GitHub push alone does not update OpenVSX.
- **Installed-host acceptance:** preserve a recoverable exact backup of installed `0.0.72`; install the reviewed public-
  parity `0.0.73`; confirm package-to-install payload parity, one supervisor plus one server, protected unauthenticated
  config, canonical corpus binding, installed runtime oracles, and real Antigravity rendering. In the installed Source
  Editor, use the exact configured `aic_menu.lua` target and immutable sample/loop bindings to produce one current canvas,
  verify replacement rather than accumulation across a profile change, export one native PNG, inspect it visually, and
  keep `Preview evidence only · Not verified in game` adjacent to the result.
- **Negative paths:** stale/refused/missing source authority must not leave a current canvas or export; package inspection
  must reject secrets, state, source maps, machine paths, missing native binding, or malformed ZIP metadata; install
  parity must reject unexplained payload deltas; OpenVSX index lag must be polled rather than republished. Installed-host
  failure rolls back to the retained `0.0.72` copy and verifies restoration.
- **X4 boundary:** after installed proof, a read-only launch may inspect the already deployed byte-identical AI Influence
  source or the previously deployed `pipeline_test`; no new mod/game write is part of this release unit. Current game
  evidence must be labeled by exact source/profile/hash and cannot prove universal Helper/widget/C++ acceptance.
- **Evidence / close:** retain package/public/install receipts and screenshots under
  `dev-docs/b119-ai-influence-dogfood/installed-release-20260906/`; update this plan, `BACKLOG.md`,
  `SESSION-HANDOFF.md`, AAR ledgers, GitHub #41, the Notion owner, and Google Current Status only after stable evidence.
  Stage only explicit B119/release/record paths, run precommit again, commit comprehensively, push `main`, and assert
  local HEAD, upstream, and direct remote `main` parity.

### RECONCILE / PLAN — Playwright browser-runtime prerequisite

- **Observed failure:** after the native-binding repair, the isolated runtime sweep passed `134/134`, but the required
  full E2E gate reported `11 passed / 95 failed / 0 flaky / 95 bad-result`. Every failed attempt was an environment
  launch failure for missing `chromium_headless_shell-1243`; no B119 assertion executed far enough to classify red.
  The harness then proved its ephemeral process tree stopped, ports `3001/3100/3101` were clear, the installed `0.0.72`
  sidecar remained PID `40512` on port `60966`, and the live discovery record retained SHA-256
  `382ADEB2E9123EF3BF265B399C06AAF77455D1AB1CD13F9E375F491DBBEB939F`.
- **Reconciled cause:** the pnpm-resolved `@playwright/test 1.63.0` uses `playwright-core 1.63.0` and requires Chromium
  plus headless-shell revision `1243` (`153.0.8010.12`). The local Playwright cache contains only revision `1228`, which
  belongs to the stale extraneous root `playwright 1.61.0`; it cannot satisfy the active test runner. This is an
  environment prerequisite mismatch, not evidence of a renderer defect.
- **Bounded repair:** use the repository's active Playwright `1.63.0` CLI to install only its Chromium family into the
  standard per-user Playwright cache. Do not alter package manifests, either lockfile, source, test expectations,
  installed Forge, mod/game/corpus files, or standing configuration. Capture the pre/post cache inventory and exact
  executable hashes. Network download is authorized by the user's instruction to update the existing Forge as needed.
- **Acceptance / negative path / rollback:** the CLI must install revision `1243`, the expected headless-shell executable
  must exist and launch, and repository Git status must be unchanged except already generated E2E evidence. Any version
  drift, unrelated browser install, manifest/lockfile mutation, or checksum/launch failure is a refusal. Rollback is
  deletion of only newly created revision-`1243` cache directories after exact-path verification; existing revision
  `1228` remains untouched. Then rerun the entire integration sequence from `134/134` oracles through parsed E2E,
  production build, graph refresh, and precommit; the earlier partial run is not acceptance evidence.

### IMPLEMENT / VALIDATE — Playwright browser-runtime prerequisite

- **Status:** `VERIFIED`. The active Playwright `1.63.0` CLI installed only Chromium revision `1243` and its
  headless-shell under `C:\Users\Moshi\AppData\Local\ms-playwright`; no repository, package, lockfile, installed Forge,
  discovery, mod, game, corpus, Git, or external-record byte changed.
- The Chromium executable is `4,508,160` bytes with SHA-256
  `9B07943F834485B43C9D54CAEA2951C78715F9F07070A80AB6658465EBD3E711`; the headless-shell executable is
  `211,550,720` bytes with SHA-256 `ADDFA79ABB060E1E514E155ED745D4BF96140BCA402735958BB4E223AEA0B98C`.
  The active `@playwright/test` path launched browser `153.0.8010.12`, loaded a deterministic data page, read its exact
  title/body, and closed cleanly with exit `0`.
- Existing revision-`1228`, FFmpeg, and winldd cache inventories remained unchanged. Repository porcelain stayed `58`
  lines with identical SHA-256 `07C78B7C56D13E7583FF3E0E73751FFB4B3E5806B408BF4ECCF21390A5F87EE5` before and after.
- **AAR triggers:** the first dependency-resolution probe invoked pnpm's already-failing dependency-status check, and
  the first launch probe imported the stale extraneous root `playwright 1.61.0`. The corrected proof imports through
  `@playwright/test 1.63.0`. Sustain version-bound executable authority; improve future environment probes by resolving
  the runner-owned module before launching when multiple Playwright versions coexist.

### RECONCILE / PLAN — mounted preview-loop state and profile recomputation repair

- **Observed host-gate result:** the repaired environment passes all `134/134` runtime-discovered oracles. The serial
  full E2E gate reaches product assertions and reports `104/106 passed`, `2 failed`, `0 flaky`, and `2 bad-result`; both
  failures repeat on retry. The failures are confined to `tests/e2e/x4-ui-source-editor.spec.ts`. The loop-export case
  fills the owner-issued loop control with `4`, but the controlled value returns to empty for the full assertion window.
  The scale-mode case reaches real editor interactions but each profile mutation/reprojection consumes approximately
  `11-12` seconds until the `60`-second test budget expires. The E2E process tree stops, ports `3001/3100/3101` are
  clear, X4 remains absent, and installed Forge `0.0.72` plus its live discovery record remain unchanged.
- **Reconciled ownership:** the session currently runs a complete preview projection for catalog discovery, a second
  complete projection for the loop-expanded sample catalog, and a third complete projection for final samples. The
  mounted editor separately projects an unselected/provisional session and the selected/final session, so one profile
  edit can execute up to six full source-to-layout projections before canvas rendering. This is a reproduced product
  performance defect, not a timeout-only harness problem. The loop helper itself is unit-green, but existing component
  coverage renders the isolated control only through server markup and does not prove a mounted React update/reconcile
  transition. The exact mounted value-loss mechanism remains to be established by a fail-first causal test before edit.
- **Bounded unit:** repair only the mounted preview-loop state transition and remove demonstrably redundant full-pipeline
  work from editor-session projection while preserving the three-stage authority semantics: owner-issued path/loop
  catalogs, loop-expanded sample catalog, and final sample-bound render. Reuse existing pipeline/program results and
  authority validators; do not add a parallel renderer, bypass validation, cache stale mutable state, special-case the
  E2E fixture, or increase test timeouts.
- **Owned surfaces:** `src/components/X4UiSourceEditor.tsx`, its focused selftest, `src/lib/x4UiEditorSession.ts`, its
  focused selftest, and only the existing B119 assertions in `tests/e2e/x4-ui-source-editor.spec.ts` if a causal test
  improvement is required. Other production owners, the mod/game/corpus, installed extension, release files, generated
  graph, external records, and every unrelated dirty path are forbidden for this repair.
- **Acceptance criteria:** (1) a mounted fail-first test reproduces the `4 -> empty` transition and proves the repaired
  control retains `4`; (2) reset clears the loop, invalid input refuses without replacing the last accepted value, and a
  source/target/normalized-profile identity change clears stale loop/sample state; (3) a deterministic call-count or
  stage-reuse oracle proves one editor reprojection no longer repeats equivalent full-pipeline work; (4) the tiny E2E
  profile fixture completes every existing mutation on the first attempt without raising its timeout; (5) exact
  MENU/HUB/COMM sample, layout, scene, paint, provenance, hash, and `Not verified in game` receipts remain unchanged;
  (6) no canvas accumulation, stale export, source mutation, or truth-label weakening is introduced.
- **Required validation / negative path:** focused mounted component and editor-session tests first, then Layout, Preview
  Pipeline, Scene, Paint, and TypeScript/scoped ESLint/diff hygiene serially. Rerun the two exact failing E2E cases without
  retry, then rerun the complete oracle and `106`-test E2E gates from zero. Only a first-attempt full green authorizes
  build, graph refresh, precommit, packaging, publication, installation, or game validation.
- **Rollback / evidence:** rollback is the explicit worker diff limited to the owned paths; no broad checkout/reset is
  permitted. Preserve the red `test-results/e2e-verdict.json` and trace timing as baseline evidence, and append the
  causal before/after counts and command receipts here. This repair changes no capability-map claim; it restores the
  documented editor capability to its required mounted and interactive behavior.

### IMPLEMENT / VALIDATE CHECKPOINT 13 — mounted loop repair and first-stage reuse

- **Status:** `PARTIAL`. The causal focused repair is correct but not yet accepted as release-ready. A mounted fail-first
  receipt reproduced `parentReconciliations=6`, immediate value `4`, settled value empty, and matrix `15/16`. The session
  fail-first receipt reproduced `pathCatalogReused=false` and `sampleCatalogReused=false`, matrix `14/15`. Production now
  reads loop updates from latest refs, copies projection loop state back only when reconciliation clears/refuses/changes
  it, reuses identical no-input catalog/final stages, and binds provisional/final projections to one source owner.
- **Focused evidence:** Editor Session `16/16`; mounted Source Editor `16/16`; Layout `745` passed plus one intentional
  skip; Preview Pipeline `122/122`; Scene exit `0`; Paint `210/210`; TypeScript, scoped ESLint, debug-marker grep, and
  diff hygiene pass. Reset, invalid-input retention, stale identity clearing, hostile authority, and `Not verified in
  game` remain green. No E2E expectation or timeout changed.
- **Browser result:** the scale-mode case passes on its first attempt in `50.0s`. The loop/export case first produced a
  rejected retry-pass (`flaky`, first attempt timeout at line 570, retry pass at `57.5s`), then passed a later first
  attempt in `58.9s`. Harness cleanup remained green with no ephemeral listener leak.
- **AAR / review trigger:** the repair removed duplicate source construction and equivalent session stages, but the
  first-attempt browser timings remain too close to the `60s` limit to establish a stable interactive product. A retry-
  green run is not green, and one later pass with `1.1s` margin does not erase the risk. Parent review therefore forces
  one more bounded performance correction before the full host gate.

### REVIEW / REVISED ACCEPTANCE — profile-independent candidate projection

- **Finding:** `X4UiSourceEditor` still computes its unselected candidate projection inside a memo that depends on the
  profile, canonical corpus/color evidence, keep-out selection, and manual calibrations. Those values do not own the
  Lua source/target candidate catalog. Consequently every width, height, or scale edit reruns an unnecessary complete
  provisional editor session before the selected session, even though the new session owner already retains the exact
  source bundle. Confidence is `98%` from the dependency list and call graph; the performance contribution must still
  be measured causally.
- **Bounded correction:** make the workspace-scoped owner retain or expose the immutable source/target candidate catalog
  once, and reconcile source/target selectors from that owner output. Profile, corpus, keep-out, manual-calibration, and
  sample/path/loop changes must not rediscover source candidates. Selected projection, authority reconciliation, Paint,
  and Canvas remain live and must still react to every relevant input. Do not introduce global caching, accept mutable
  workspace drift, or expose a caller-injectable source authority.
- **Revised acceptance:** (1) a fail-first deterministic mounted/call-count receipt proves a profile-only edit currently
  invokes provisional candidate discovery and that the corrected editor does not; (2) changing workspace identity
  rebuilds the owner and candidate catalog exactly once, while parent rerenders with the same immutable workspace do
  not; (3) source/target changes still clear stale loop/path/sample state; (4) every existing focused authority and
  mounted test remains green; (5) each profile mutation in the exact scale E2E reaches its current canvas in less than
  `5s` on this host, and both exact formerly failing tests finish first attempt with at least `10s` margin under their
  unchanged `60s` test timeout; (6) no retry, timeout increase, fixture reduction, or truth-label change is accepted.
- **Owned/forbidden paths and rollback:** retain the checkpoint-13 four production/selftest owners and only the existing
  B119 E2E assertions if timing measurement is needed. All other code, release, graph, docs, mod/game/corpus, installed
  host, and unrelated dirty paths remain forbidden. Rollback is the exact follow-up diff; full oracles/E2E/build/release
  remain locked until this revised contract is green.

### IMPLEMENT / VALIDATE CHECKPOINT 14 — mounted-loop authority and bounded reprojection

- **Bounded status:** `VERIFIED`; overall B119 remains `IN PROGRESS / PARTIAL`. The mounted loop failure was reproduced
  as an accepted local value `4` being overwritten by stale projection synchronization (`15/16`, settled value empty,
  `parentReconciliations=6`). The editor now reads the latest owner-issued loop state, catalog, and authority from refs,
  updates them atomically, and synchronizes projection state only for a meaningful clear, refusal, or changed result.
- Candidate discovery is now workspace-owner scoped and profile-independent. The fail-first mounted receipt was `16/17`:
  a profile-only render rematerialized candidates and invoked the provisional projection once. Final receipt is `17/17`:
  profile-only and same-workspace parent renders perform zero candidate materializations and zero provisional projections;
  a replacement workspace creates exactly one new owner/catalog/materialization.
- React StrictMode also repeated an equivalent selected projection. The fail-first Editor Session receipt was `15/16`
  with `equivalentSelectedProjectionReused=false`. A guarded one-entry owner-local cache now reuses only a freshly
  fingerprinted equivalent input. Mutable ordinary data is fingerprinted again; in-place profile mutation reprojects;
  noncanonical evidence, accessors, custom prototypes, cycles, symbols, sparse arrays, changed issued-authority identity,
  and a replacement workspace cannot reuse the prior projection. Bound source authority remains private and ignores
  in-place workspace drift until the parent supplies a replacement workspace identity.
- **Focused evidence:** Editor Session `16/16` plus canonical color `7/7`; mounted Source Editor `17/17`; Layout
  `745/746` with one intentional skip; Preview Pipeline `122/122`; Scene `179/179`; Paint `210/210`; TypeScript,
  scoped ESLint over all five owned files, debug/timing-marker grep, and diff hygiene all pass. Exact MENU/HUB/COMM source
  hashes remain `4253D9B...47DD7`, `657476E...8C4F`, and `88FAB05...3511`.
- **Browser evidence:** the clean export/loop run passed attempt one in `34.6s` test / `46.8s` total, leaving `13.2s`
  below the unchanged 60-second timeout. The clean scale run passed attempt one in `28.4s` test / `42.3s` total, leaving
  `17.7s`. Instrumented scale transitions were `3119.2`, `2711.3`, `2786.7`, `3113.4`, `2550.3`, and `2631.6ms`;
  maximum `3119.2ms < 5000ms`. Instrumentation was removed before the clean reruns. No timeout, retry, fixture, or
  truth-label change was made.
- **Rejected evidence / AAR trigger:** one earlier export invocation suffered a zero-millisecond Playwright worker exit
  `3221226505` and then passed on retry. It is retained as harness-flake evidence and is not counted as acceptance. The
  subsequent clean attempt-one result above is the accepted receipt. E2E cleanup reports `treeGone=true`; ports
  `3000/3001/3100/3101` are clear; X4 is absent; installed sidecar PID `40512` and discovery SHA-256
  `382ADEB2E9123EF3BF265B399C06AAF77455D1AB1CD13F9E375F491DBBEB939F` remain unchanged.
- **Next gate:** rerun the complete host sequence from zero: runtime-discovered oracles `134/134`, parsed serial E2E
  `106/106` with zero failed/flaky/bad/quarantined results and clean lifecycle containment, production build, deterministic
  graph refresh, and full precommit. Only that complete green sequence may authorize `0.0.73` packaging/publication.

### REVIEW / REVISED ACCEPTANCE — owner-cache capture coherence

- **`[HYPOTHESIS]` fresh-eyes finding, confidence `99%`:** `createX4UiEditorSessionOwner.project()` computes its cache
  signature through property descriptors, then projects `{ ...input, workspace }`. Enumerable accessors therefore run
  while the call argument is being built, outside the projector's fail-closed `try`; a throwing authority accessor can
  escape instead of returning a refused projection. A descriptor-changing proxy can also make the cache signature name
  different values from those copied into the projection, allowing an incoherent result to be stored under that
  signature. This must be reproduced by a causal fail-first test before correction; static JavaScript semantics are not
  accepted as the final defect receipt.
- **Bounded correction:** retain the workspace-owner-local, one-entry cache, but make signature capture and projected
  input coherent without executing authority getters or letting caller workspace/source bytes enter the bound owner.
  Cache-ineligible hostile input must reach the existing fail-closed behavior without an exception escaping. Do not add
  global caching, weaken canonical/issued authority identity, trust a semantic clone, or broaden source execution.
- **Acceptance / negative path:** (1) a throwing enumerable `colorEvidence` accessor reproduces the pre-fix escaped
  exception and the final owner neither invokes the getter nor throws; (2) a one-descriptor/proxy mutation cannot store
  or replay a projection under a signature derived from different values; (3) accessors, custom prototypes, symbols,
  cycles, sparse arrays, noncanonical evidence, and changed authority identity do not receive a cache hit; (4) unchanged
  ordinary equivalent selected input still reuses the exact frozen projection; (5) mutable ordinary profile/sample/path/
  loop changes still reproject; (6) bound source/candidate identity and every checkpoint-14 receipt remain green.
- **Owned paths / gate effect:** only `src/lib/x4UiEditorSession.ts` and its selftest may change unless fail-first evidence
  proves a component coupling. The currently running full E2E is retained only as pre-correction containment evidence;
  even if green it cannot authorize release. After this correction, the complete `134/134` oracle, `106/106` E2E,
  build, graph, and precommit sequence must restart from zero.

### VALIDATE PRE-CORRECTION — full E2E containment and invalid direct-oracle invocation

- The serial full E2E passed `106/106` in `714,349ms` (`11.9m`): zero failed, flaky, bad, quarantined, missing,
  incomplete, or global-report errors; child exit `0`; lifecycle and ownership complete; `treeGone=true`; no remaining
  PIDs. Ports `3001/3100/3101` cleared, X4 remained absent, and installed `0.0.72` discovery/PID/port stayed unchanged.
  This is useful pre-correction product/containment evidence but does not authorize release because the cache-coherence
  review finding remains open.
- **`[REPRODUCED]` AAR trigger:** invoking `node scripts/oracle-sweep.mjs` without its integration server returned
  `0/133` solely because `localhost:3001` was unreachable. This repeats the documented direct-sweep invocation trap; it
  is not evidence of 133 product regressions. The authoritative post-correction run must use the repository's
  server-owning `npm run test:oracles` integration wrapper and require its discovered `134/134` result.
- Build, graph refresh, and precommit were deliberately stopped before execution because the parent review changed the
  acceptance contract. HEAD/upstream remain `37a248cd2a84386ddba1d7232800cc83ef350a5f`; no source, test, release,
  installed-host, mod/game/corpus, external-record, or Git mutation occurred in this validation attempt.

### IMPLEMENT / VALIDATE CHECKPOINT 15 — coherent owner-cache input capture

- **Status:** `VERIFIED` at the bounded two-file contract; overall B119 remains `IN PROGRESS / PARTIAL`. The review
  hypothesis was reproduced. With unchanged production, the causal Session matrix was `16/18`: an enumerable throwing
  `colorEvidence` getter was read once and escaped the owner call, while a transparent descriptor facade produced
  `18` descriptor reads instead of `4`, one spread-time profile `get`, and projected width `125` under a signature whose
  descriptor width was `100`. Added profile-accessor and throwing/reflection cases also degraded into usable default or
  needs-selection projections instead of refusing.
- The owner now performs one detached top-level own-data descriptor capture and uses that same snapshot for both cache
  signature and projection. Its bound workspace replaces caller workspace before projection. The implementation does
  not attempt to detect transparent Proxies; it follows the established P7 boundary by admitting coherent data-
  descriptor facades, refusing unsafe reflection, and never executing accepted-property getters.
- Non-color accessors and revoked/throwing reflection now return a deterministic refused, non-renderable session and
  clear the one-entry owner cache. The established `colorEvidence` accessor boundary remains intentionally different:
  it performs zero getter reads and matches the direct projector's no-color degradation. Equivalent ordinary input still
  reuses the exact frozen projection; mutable ordinary data, changed canonical/issued identity, and replacement owners
  reproject. No global cache or caller source authority was introduced.
- **Focused evidence:** Session causality `20/20`; P7 canonical color `7/7`; TypeScript exit `0`; scoped ESLint exit
  `0`; diff hygiene and debug/timing-marker grep pass. Throwing reflection performs only the unavoidable initial
  `getPrototypeOf` attempt and zero later `ownKeys`, descriptor, or `get` traps. Only
  `src/lib/x4UiEditorSession.ts` and its selftest changed in this correction.
- **Gate reset:** checkpoint-14 performance evidence remains applicable to its unchanged component/output contract, but
  release authorization still requires a fresh complete sequence after this correction. Use `npm run test:oracles`
  (the server-owning wrapper), then full serial `npm run test:e2e`, production build, deterministic Graphify refresh,
  full precommit, and final diff/containment checks.

### VALIDATE ATTEMPT 1 — post-correction E2E runner failure

- **Status:** `FAILED` as a release gate; no product failure was established. The authoritative server-owning oracle
  wrapper passed `134/134` in `31.443s`. The subsequent serial `106`-test E2E invocation terminated after `11` visible
  `ok` results with child exit `3221226505` (`0xC0000409`) and no complete structured report. The parsed verdict is
  therefore red: `structuredReportMissing=true`, `reportInspection.complete=false`, and no `106/106` claim is made.
- **Containment:** lifecycle ownership completed and `treeGone=true`; all captured E2E PIDs are absent, ports
  `3001/3100/3101` are clear, X4 remains absent, and the installed `0.0.72` sidecar remains PID `40512` on port `60966`.
  The worker changed no source, test, documentation, release, config, or graph file; it generated only
  `test-results/e2e-verdict.json` as the failure receipt.
- **Gate effect / AAR:** build, Graphify refresh, precommit, package, publish, and install remain locked. This is another
  observed Windows/libuv runner-crash event, but cleanup is proven and a pre-correction full run already reached
  `106/106`. One independent clean invocation from the now-contained baseline is permitted; it must pass all `106`
  tests on its first Playwright attempt with a complete structured report before the remaining gates may run. This
  failed attempt remains part of the release record and is not superseded or relabeled green.

### VALIDATE ATTEMPT 2 — complete post-correction release gate

- **Status:** `VERIFIED`; stable `0.0.73` packaging/publication is authorized. The independent invocation passed the
  server-owning oracle wrapper `134/134` in `31.822s`, then full serial E2E `106/106` in `633.864s` on its only
  Playwright attempt. The structured report is complete: child exit `0`; zero failed, flaky, bad, quarantined, missing,
  incomplete, or global-report errors; `106` discovered and terminal; lifecycle ownership complete; `treeGone=true`;
  and no remaining PIDs.
- Production build passed in `29.398s` with `1,848` modules transformed. `graphify update .` passed in `62.614s` and
  rebuilt `10,580` nodes, `26,660` edges, and `348` communities with no tracked graph delta. Full
  `npm run precommit:check` passed in `571.573s`, including typecheck and all embedded audits. Scoped diff hygiene
  passed. Final containment kept ports `3001/3100/3101` clear, X4 absent, and installed `0.0.72` sidecar PID `40512`
  on port `60966` unchanged.
- **Reconciled diagnostic oracle:** the worker's first grep treated every `console.log` in the complete selftest files as
  a temporary marker and therefore reported `39` false matches. Parent diff review found only four newly added
  `console.log` lines; all four are deliberate named B119 causal/evidence receipts in `x4UiScene.selftest.ts`. A precise
  added-line scan returned zero debugger statements, timing APIs, TODO/FIXME/HACK/XXX text, temporary markers, or
  non-receipt diagnostics. The acceptance method is clarified to inspect changed lines and distinguish durable selftest
  reporters from production/debug instrumentation; no source or test was changed to make this check pass.
- **AAR triggers:** the first post-correction E2E invocation crashed before a complete report; the accepted independent
  invocation then passed without retry. The second worker's pre-E2E census command had one nonmutating PowerShell typo,
  and the final broad grep was an invalid overinclusive oracle. Both failures remain recorded. No timeout, retry budget,
  fixture, expectation, source, truth label, installed host, mod, game, or corpus byte was weakened or changed.

### IMPLEMENT / VALIDATE — stable `0.0.73` public release

- **Status:** `VERIFIED` for packaging, publication, and independent public-artifact parity; overall B119 remains
  `IN PROGRESS / PARTIAL / Not verified in game`. The release changed only
  `vscode-extension/package.json`, `vscode-extension/release-notes.json`, and
  `vscode-extension/CHANGELOG.md`: stable version `0.0.73` plus four bounded notes covering finite preview loops across
  rerenders, workspace-scoped source discovery, coherent inert-data cache capture, and the source-known-versus-sampled
  preview boundary. The changelog now contains `61` ordered versions with `0.0.73` newest.
- The accepted root production build was reused. Extension staging removed `72` source maps and passed the native-binding
  and secret/machine-path checks; extension compilation passed; the staged-app probe passed `16/16`; the package
  inspector passed `13/13`; and the stable VSIX contains `2,107` entries / `71,704,462` unpacked bytes. The local VSIX is
  `26,314,904` bytes with SHA-256
  `0C3A958B3C29AC4E7B8F821D9DA701A55DCD94EF043FDA895E20277CC91D3761`.
- OpenVSX publication succeeded exactly once. The initial latest/direct reads showed normal index propagation delay at
  `5/10/20/30/45/60` seconds; later `/latest` and the direct `0.0.73` endpoint both returned stable `0.0.73` with HTTP
  `200`. The lagging versions-list projection was not used as a reason to republish. An independent public download is
  exactly `26,314,904` bytes and has the same SHA-256 as the reviewed local VSIX.
- **Boundary:** installed Antigravity remained on `0.0.72` at the end of publication and X4 remained absent. Publication
  does not establish installed payload parity, live sidecar behavior, native Canvas export, or X4 truth; those remain the
  next gates before commit/projection close.
- **AAR / security trigger:** the staging command was rerun once because the first execution wrapper lost its terminal
  completion marker; both accepted outputs were green. More importantly, the publish tool's terminal title exposed the
  presence of the token-bearing `-p` command argument. The token value is not repeated in this record and was never used
  for a second publish. Credential revocation/rotation remains an explicit operator action and is not silently performed
  as part of this release.

### IMPLEMENT / VALIDATE — installed `0.0.73` payload and runtime

- **Bounded status:** `VERIFIED` for installed payload/runtime acceptance; visual Canvas/export acceptance remains the
  next gate and overall B119 remains `IN PROGRESS / PARTIAL / Not verified in game`. The exact public-parity VSIX was
  installed through Antigravity's Electron CLI with exit `0`; installed `package.json` reports `0.0.73`, and the single
  installed `0.0.73` root matches all `2,105` packaged payload files with zero missing files, content mismatches, or
  unexplained extras. The only normalized difference is Antigravity's expected package `__metadata`; the installed-only
  `.vsixmanifest` is expected.
- Before installation, the complete `0.0.72` tree was copied and compared through a deterministic `2,106`-file /
  `71,651,192`-byte manifest. Source and backup manifests are identical at SHA-256
  `D3A63B03D15D4748AFAFA1B64F829EF188EC4BF0306A44C802DA37BC1FB66189`. The retained rollback is
  `C:\Users\Moshi\AppData\Local\Temp\x4forge-installed-release-20260907-53e0be95f0454739b0ebee754734ffc7\rollback-0.0.72\x4forge.x4-forge-studio-0.0.72`.
- Antigravity closed gracefully from main PID `37260` without a forced stop and restarted visibly/responding as main PID
  `73224`. The installed sidecar is exactly one supervisor PID `65056` plus one server PID `60836` on port `59916`.
  Root and reference status returned HTTP `200`; the canonical corpus root is exactly
  `F:\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`; unauthenticated `/api/config/directories` returned `401`; and the
  installed runtime sweep passed `134/134` in `80.822s` with exit `0`.
- **Safety / negative evidence:** X4 remained absent; protected non-discovery config/workspace authority hashes and the
  repository porcelain receipt remained unchanged; the refreshed discovery record is expected runtime state; and
  Antigravity was left open and responsive. No mod, game, corpus, workspace content, source, test, release file, or Git
  state changed in this checkpoint.
- **Reconciled acceptance correction:** the plan expected `latest.json` to report the extension version, but its actual
  schema contains only `port`, `pid`, `startedAt`, `cwd`, and `mode`. The missing field is not a product failure and is
  not invented. Installed `package.json` plus complete payload parity are the version authorities; discovery proves the
  fresh process/port only. The worker conservatively returned `PARTIAL`; parent review classifies the documented
  payload/runtime contract `VERIFIED` under these separate authorities.
- **Evidence:** final receipt
  `C:\Users\Moshi\AppData\Local\Temp\x4forge-installed-release-20260907-53e0be95f0454739b0ebee754734ffc7\checkpoint-final-receipt.json`,
  `8,193` bytes, SHA-256 `E7B4ACEA36B99F475EE8388BF0CB1A502117B7602081698276CD1AEDE3AF24CB`.

### VALIDATE — installed `0.0.73` visual attempt 1

- **Status:** `FAILED` for this validation attempt; installed payload/runtime acceptance above remains `VERIFIED`, while
  the visual/export gate is still open. The exact configured `aic_menu.lua` (`4253D9B...47DD7`) and `menu.display`
  target settled, all `19` visible scalar samples accepted deterministic values, both owner-issued loop controls were
  present, and the source-lines `733:13-746:16` loop retained `4` before profile mutation. Nevertheless the current
  session stayed `stale`, native export stayed disabled, and the retained canvas never became the current result.
- The retained bitmap is not positive evidence for the attempted session. Its `12,725` non-black-visible pixels occupy
  only `600,979-1649,1013` (`1,050 x 35`) and retain PNG SHA-256
  `9F77D5C08549AC3556037F56B5CB05AB46D6B7F694373647283EEE80FC62B2CA`; visual inspection shows the prior compact
  edit/SEND/END strip. The current refusal is explicit: `source-composition has no renderer-issued visible source
  geometry fill/border or canonical tinted glyph; visual diagnostics require an authoritative source operation`.
- Width/height edits did not replace the surface or reach `1800 x 900`. They also produced new profile-bound loop IDs
  with empty selections. The negative no-source/no-target path correctly remained stale/refused, kept export disabled,
  and preserved `Not verified in game`. The original `Player_Elite_Escort` workspace label was restored. Source, config,
  installed package, repository porcelain, sidecar/server identities, and X4-absent state were unchanged.
- **Evidence:**
  `dev-docs/b119-ai-influence-dogfood/installed-release-20260907/installed-0.0.73-aic-menu-display-receipt.json`
  (`694,732` bytes, SHA-256 `9991C8818A3CF680D009CC9A4A255DE886DE0BBC0F6F6088FD33A7DEFF344D41`) and its six retained screenshots.
- **Harness AAR:** the first harness run stopped at its first positive failure, and the initial restoration logic treated
  the contextual `__current` option as a stable workspace ID. The corrected harness retained all later assertions and
  restored the one unique saved-workspace option by visible identity. These harness corrections do not turn the product
  result green.

### RECONCILE / REVISED PLAN — authority-complete installed visual scenario

- **Plan-changing finding:** attempt 1 did not supply any owner-issued preview-path selections. The chosen loop at Lua
  lines `733-746` is nested under unresolved conditions at lines `711`, `717`, and `721`; a finite loop selection cannot
  authorize its enclosing branches. Existing mounted P9 coverage deliberately requires the exact large
  `menu.display` target with no path selection to report the same no-visible-source-geometry refusal. The attempt
  therefore exercised a documented negative state while incorrectly expecting a positive canvas.
- The assertion that loop value `4` must survive a drawable-profile change also contradicted the existing authority
  contract. Preview paths, loops, and samples are bound to the exact normalized profile; checkpoint 13 acceptance
  explicitly requires profile drift to clear stale state. Retaining the old value under a new profile would weaken the
  stale-authority guard. A profile transition must obtain the new owner-issued bindings and then reapply the same
  scenario values.
- **Bounded next unit:** change only the ignored installed-validation harness/evidence first. For each profile, select
  the exact source/target, choose the owner-issued path arms needed for one deterministic pending-action surface, choose
  loop count `4`, then fill the resulting current sample catalog. Require one current non-zero canvas and enabled native
  PNG export at `2560 x 1440`, then repeat the complete authority sequence at `1800 x 900` and prove exactly one
  replacement canvas rather than accumulation. Keep the no-source/no-target refusal as the negative path and restore
  the original workspace.
- **Decision boundary:** if this authority-complete scenario passes against the byte-identical installed `0.0.73`, the
  failed attempt was a validator defect and no production change or `0.0.74` is justified. If it still fails, retain the
  new exact receipt, add a causal mounted regression, repair only the proven production owner through Luna, rerun every
  release gate from zero, and publish a new version rather than attempting to overwrite `0.0.73`.

### VALIDATE ATTEMPT 2 — authority-complete installed `0.0.73` refusal

- **Status:** `FAILED` for installed visual/export acceptance, with a reproduced production boundary. The corrected
  harness selected exact `aic_menu.lua` / `menu.display`, all three required enclosing `then[0]` arms at source lines
  `711-759`, `717-720`, and `721-758`, loop count `4`, and all `25` current scalar samples. It reacquired those
  owner-issued controls after profile drift. Both `2560 x 1440` and `1800 x 1440` then reached the same deterministic
  Canvas refusal: `basePreviewTints fact is reassigned across geometry owners`; each state had zero current canvases and
  export disabled. This is not the earlier no-path negative state.
- The retained authority-complete receipt is
  `dev-docs/b119-ai-influence-dogfood/installed-release-20260907/authority-complete-attempt2/installed-0.0.73-aic-menu-display-receipt.json`,
  `4,753,639` bytes, SHA-256 `361D7C53504301CDEC469F1ABA4113B1D7B2ACC05FBF4115D17418FD62DCA80E`.
  The rendered page screenshot is SHA-256 `0D09A84898E5D357775D20DAE7EAB2575CDAF2461E0D9E85BB80C087928A236B`;
  visual inspection shows the installed Source Preview with the real sample controls populated, not a blank surrogate.
  Source, installed manifest, config, repository porcelain, listener/supervisor identities, and X4-absent state remained
  unchanged. Attempt-1 artifacts also remained byte-identical.
- **Separate harness failures:** the first corrected invocation stopped after `145ms` on a blank startup frame while the
  JS/CSS/bootstrap requests were still in flight; its receipt is preserved as `startup-race-failed-receipt.json`. A
  bounded rendered-control wait corrected that harness race. The accepted causal run later lost its validator-launched
  browser during the third profile replay, after the two identical product refusals were already retained; no
  `1800 x 900`, negative-path, or restoration claim is made from that run.
- **Resource AAR:** eight abandoned exploratory Playwright trees accumulated before the controlled run, totaling about
  `4.2GB` resident memory. A parent safety intervention stopped further probes, and the worker removed only its eight
  identified trees. The accepted run used one browser tree and closed it. Future native validators must own one browser
  in a `finally` block and preserve each failed receipt instead of opening parallel one-off probes.

### RECONCILE / REVISED PLAN — command-bound tint ownership

- **Existing contract and reproduced contradiction:** `projectX4UiPaintPlan()` copies each Scene node's exact color
  facts onto that node's geometry command. Loop expansion creates distinct node IDs from one repeated Lua operation, so
  the same source-range/field/slot fact can legitimately appear on several issued geometry owners. Canvas currently
  keys a tint fact only by source range, field, and slot and rejects the second node globally. Its hostile P6 test proves
  that copying a tint onto an unrelated command must refuse, but it does not prove that legitimate loop instances must
  be unique source facts. The current global one-owner assumption is therefore stronger than the producer contract.
- **Bounded repair:** replace the ambiguous global ownership inference with explicit producer-issued command ownership
  for `basePreviewTints` (or an equivalently closed owner binding). Geometry tints must bind to their issued `nodeId`;
  glyph tints must bind to their parent `textId`. Multiple commands may carry the same source fact only when every tint
  is correctly bound to its own issued owner. Copying a bound tint to another geometry or glyph owner, changing the
  binding, omitting it, or supplying inherited/accessor/sparse/proxy data must still refuse before Canvas allocation.
  Do not weaken source, alpha-domain, canonical-corpus, truth, slot, duplicate-within-command, or allocation guards.
- **Owned implementation surface:** begin with `src/lib/x4UiPaintPlan.ts`, `src/lib/x4UiPaintPlan.selftest.ts`,
  `src/lib/x4UiCanvasRenderer.ts`, and `src/lib/x4UiCanvasRenderer.selftest.ts`. Add another owner only if a fail-first
  test proves a required cross-layer coupling and update this record before editing it. Source Editor, Editor Session,
  Scene, Layout, extension host, mod, game, corpus, settings, and unrelated dirty files remain forbidden.
- **Acceptance contract:** (1) retain a fail-first causal fixture with two legitimate loop-expanded geometry owners
  sharing one source tint fact; (2) producer output binds every geometry/glyph tint to its exact command owner; (3) the
  legitimate fixture reaches Canvas allocation and nonzero source pixels; (4) copied/reassigned geometry-to-geometry,
  geometry-to-glyph, wrong-owner, missing-owner, and hostile-data mutations refuse before allocation; (5) existing color,
  Canvas, Paint, truth, and no-false-render tests remain green; (6) the exact installed-validator scenario is rerun after
  packaging and must produce one current nonzero/exportable canvas at `2560 x 1440` and one replacement canvas at
  `1800 x 900`, plus the stale/refused negative path and original-workspace restoration.
- **Validation / release effect:** require focused Paint and Canvas selftests, TypeScript, scoped ESLint, diff hygiene,
  then the complete oracle/E2E/build/Graphify/precommit sequence from zero. If the production repair is verified, ship a
  new stable `0.0.74` under publish-before-commit; never overwrite `0.0.73`. Package, install, native visual/export,
  negative-path, public-download parity, Git parity, and GitHub/Notion/Drive readback are all required. Preview remains
  `Not verified in game`; no browser result can prove C++ frame acceptance.
- **Rollback:** the new repair remains an explicit four-file diff on top of the retained B119 checkpoint until all gates
  pass. On failure, reverse only that bounded patch with an explicit patch operation, retain the red receipts, and leave
  public/installed `0.0.73` available. No mod, game, save, corpus, or standing-config mutation is authorized by this unit.

### IMPLEMENT / FOCUSED VALIDATE — command-bound tint ownership

- **Bounded status:** `VERIFIED` for the four-file production repair and focused contract; full release, installed visual,
  and X4 truth gates remain open, so overall B119 stays `IN PROGRESS / PARTIAL / Not verified in game`. The retained
  red-first Canvas run passed `163/164`: the one causal loop-expanded fixture was refused with
  `basePreviewTints fact is reassigned across geometry owners`, performed no Canvas allocation/composite work, and
  painted zero source pixels.
- Paint now emits a detached exact owner record on every base preview tint. Geometry tint owners name the issued paint
  command and `nodeId`; glyph tint owners name the issued glyph command and parent `textId`. Canvas validates that
  closed record against the command being consumed. Repeating one source-range/field/slot fact across loop-expanded
  commands is legal only when every copy carries its own exact issued owner.
- The prior hostile-reassignment protection remains fail-closed. New causal cases prove that copied geometry-to-geometry,
  geometry-to-glyph, glyph-to-geometry, wrong-owner, missing-owner, extra-field, custom-prototype, and accessor-backed
  owner records all refuse as `invalid-command` before allocation; the accessor getter is never executed. Existing
  duplicate source-fact and duplicate-slot checks within one command remain intact.
- **Independent validation:** `npx tsx src/lib/x4UiPaintPlan.selftest.ts` passed `211/211`; `npx tsx
  src/lib/x4UiCanvasRenderer.selftest.ts` passed `171/171`, including `77/77` Stage-B causal checks and a current loop
  fixture that reaches composite allocation and paints nonzero source pixels. `npm run typecheck`, scoped ESLint across
  the four owned files, and `git diff --check --` across the same files all exited `0`.
- **Review:** the implementation changes only `src/lib/x4UiPaintPlan.ts`, `src/lib/x4UiPaintPlan.selftest.ts`,
  `src/lib/x4UiCanvasRenderer.ts`, and `src/lib/x4UiCanvasRenderer.selftest.ts`. Source Editor, Editor Session, Scene,
  Layout, extension host, release metadata, installed extension, mod, game, corpus, settings, and unrelated dirty files
  were not changed by this unit. Full oracle/E2E/build/Graphify/precommit, `0.0.74` publication/install, and the exact
  two-profile installed validator remain required before this release checkpoint can close.
- **AAR trigger:** installed validation disproved the old one-source-fact/one-geometry-owner assumption. The sustainable
  rule is to preserve source fact identity separately from issued paint-command ownership; source-loop reuse is expected,
  while any mismatch between a tint and the command carrying it remains a hard pre-allocation refusal.

### VALIDATE — command-bound repair full release gates

- **Status:** `VERIFIED` for the complete pre-release codebase gate. The server-owned oracle integration passed all
  `134/134` discovered runtime oracles. The full serial browser suite passed all `106/106` tests in `12.1m` with child
  exit `0`, zero failed, flaky, bad, skipped, quarantined-blocking, incomplete, or global-report errors, all discovered
  tests terminal, lifecycle ownership complete, and `treeGone=true` with no remaining harness PIDs.
- Source Editor E2E specifically passed current mounted PNG export and causal drawable-height/UI-scale retention. The
  harness used only its ephemeral state root and ports `3100/3101`; both ports were clear afterward. Installed sidecar
  PID `60836` on port `59916` remained the sole relevant listener and X4 remained absent.
- `npm run build` passed with `1,848` Vite modules plus the server bundle. `graphify update .` rebuilt `10,582` nodes,
  `26,672` edges, and `316` communities with no tracked Graphify delta. Full `npm run precommit:check` passed, including
  tripwires, canon mirrors, E2E verdict selftest `55/55`, Vite lifecycle, shipped product copy, durable-writer audit,
  capability/MCP contracts, action-receipt coverage (`82` routes / `57` surfaces), TypeScript, and size audits.
- **Boundary:** these gates authorize the planned `0.0.74` package/release sequence; they do not establish installed
  payload parity, current native Canvas output, exported PNG evidence, or X4 frame acceptance. Publish-before-commit and
  the exact two-profile installed validator remain mandatory.

### IMPLEMENT / VALIDATE — stable `0.0.74` public release

- **Status:** `VERIFIED` for package, exactly-once publication, direct/latest registry visibility, and independent public
  download parity. Release metadata changed only `vscode-extension/package.json`, `vscode-extension/release-notes.json`,
  and generated `vscode-extension/CHANGELOG.md`. The manifest is `0.0.74`; the new notes describe command-bound tint
  ownership and retain `Not verified in game` plus the explicit non-claims for engine acceptance, 1:1 parity, arbitrary
  Lua, and the incomplete twelve-reference benchmark.
- **Release-history correction:** the first canonical generation exposed that already-public `0.0.73` was absent because
  its corrective commit had not yet entered Git history. The existing release schema explicitly covers that exceptional
  state. `release-notes.json` now records `_published["0.0.73"] = "2026-09-07"`; `0.0.74` is not marked there before
  publication. Regeneration produced `62` versions in exact `0.0.74 -> 0.0.73 -> 0.0.72` order with matching note blocks.
- Extension staging copied the five root bundle files, excluded the root source map, stripped `72` vendor source maps,
  retained the native SQLite binding, and found no secret-bearing staged file. Extension compilation passed from a fresh
  output directory. The staged-product probe passed `16/16`, including protected config, canonical corpus access, exact
  supervisor ownership, graceful orphan cleanup, invalid-parent refusal, and forced reap of an owned stubborn child.
- Package inspection passed `2,107` entries / `71,705,527` unpacked bytes. The local stable VSIX is `26,315,067` bytes
  with SHA-256 `63213F694CA72303A6B444B6697402A425DD4F1AE53FF45DDE07F9AD72D9C267`. OpenVSX preflight proved direct
  `0.0.74` absent and latest `0.0.73`; CLI `1.1.1` verified the configured PAT from process environment, with no `-p`
  token argument. Publication succeeded exactly once.
- Immediate public reads showed ordinary propagation lag and were not retried as a publish. Latest then advanced to
  `0.0.74`, the direct `0.0.74` endpoint reached HTTP `200`, and an independent public download from the registry is
  exactly `26,315,067` bytes with the same SHA-256 as the reviewed local VSIX.
- **Security boundary:** this run did not expose the PAT in a process argument or output. The earlier `0.0.73` publish
  incident still requires operator rotation/revocation because its token-bearing command was visible in a terminal title.

### IMPLEMENT / VALIDATE — installed `0.0.74` payload and runtime

- **Bounded status:** `VERIFIED` for installation, payload parity, process ownership, protected routes, canonical corpus,
  and installed runtime oracles. Visual Canvas/export acceptance remains the next gate; overall B119 therefore stays
  `IN PROGRESS / PARTIAL / Not verified in game`.
- Before installation, the complete installed `0.0.73` tree was copied to
  `C:\Users\Moshi\AppData\Local\Temp\x4forge-installed-0.0.74-f4bd49008ad148d29b383876532a8d2b\rollback-0.0.73\x4forge.x4-forge-studio-0.0.73`.
  Source and backup each contain `2,106` files / `71,701,600` bytes and share manifest SHA-256
  `315FB8B2387500323F31657502D4ADF2D754469CBAF58A0EDBBB77A3465973D6`.
- Antigravity's CLI installed the independent public-parity VSIX with exit `0`. Installed `0.0.74` contains all `2,105`
  packaged payload files with zero missing files, unexplained extras, or content mismatches. Normalized installed
  `package.json` is semantically exact; Antigravity's added `__metadata` and `.vsixmanifest` are the only expected host
  additions.
- Main PID `73224` accepted a graceful close; its old supervisor/server PIDs `65056/60836` exited without force.
  Antigravity restarted as main PID `30644`. Installed `0.0.74` owns exactly supervisor PID `62216` and server PID
  `55096` on fresh port `54793`. Root, reference status, and runtime selftest index returned HTTP `200`; unauthenticated
  directory config returned `401`; reference status names the configured corpus
  `F:\Downskies\x4unpackersuiteV1\X4 unpacked 9.00`.
- The full installed-host oracle sweep discovered the runtime index and passed `134/134` with zero red. X4 remained
  absent. These facts prove the installed product is running and internally green; they do not yet prove that the exact
  previously failing source scenario produces a current visible/exportable Canvas.

### VALIDATE ATTEMPT 1 — installed `0.0.74` authority-complete visual scenario

- **Status:** `FAILED` for the complete two-profile validator, but the primary installed-product surface is positive.
  Exact `aic_menu.lua -> menu.display`, the three required pending-action path arms, loop count `4`, and all `25`
  owner-issued samples produced one `rendered/current` and export-enabled `2560 x 1440` Canvas. Its source-visible
  census is `285,600` nontransparent pixels / `261,575` nonblack-visible pixels with bounding box
  `600,979-1649,1250` (`1050 x 272`). Native export is `2560 x 1440`, `80,696` bytes, SHA-256
  `737C4975942E96B0D607D160C8F92614FAAFAA60BECF2A9D7B68F13C0405A9EB`, and matches the mounted Canvas serialization.
  `Not verified in game` remains exact.
- The second profile correctly reacquired the same three source path arms, a new profile-bound loop identity with value
  `4`, and all `25` samples, but remained stale with the positive-geometry refusal. The run stopped before secondary
  export, negative-path proof, final restoration, and workspace restoration; its one Playwright browser/context closed
  in `finally`, the sidecar and protected state remained unchanged, and X4 remained absent. Evidence is retained under
  `dev-docs/b119-ai-influence-dogfood/installed-release-20260907/authority-complete-0.0.74/`.

### RECONCILE / REVISED PLAN — profile-derived scenario samples and absence-preserving evidence

- **`[REPRODUCED]` validator defect:** the sample rule supplied `_choiceY=979` at both `1440`- and `900`-pixel heights.
  The exact source defines `_choiceY = math.floor(vh * 0.68)` and, for the selected pending-action surface, subtracts
  `Helper.scaleY(150)`. Shipped `Helper.scaleY` applies `Helper.round(y * Helper.uiScale)`; the active effective scale
  is `1.4`. The coherent source-state values are therefore `769` at height `1440` and `402` at height `900`. Reusing
  `979` made the observed `272`-pixel block start below the `900`-pixel drawable, so Canvas correctly found no visible
  source geometry. This is scenario-data failure, not evidence of a production profile-replacement defect.
- **`[REPRODUCED]` validator defect:** `evidenceSnapshotsUnchanged()` requires each named artifact to exist. Four files
  were absent both before and after the retained failed `0.0.73` attempt, with identical absence records, yet the
  comparator returned false. Preservation must require equal names and existence state, and compare size/hash only when
  both records exist; stable absence is unchanged evidence, not mutation.
- **Bounded repair:** change only the ignored installed-validation script. Derive the pending `_choiceY` sample from the
  currently mounted exact profile and shipped rounding rule; make evidence comparison symmetric for stable absence; use
  a fresh attempt directory so this failed receipt and every prior artifact remain immutable. Do not change Forge
  production, tests, release metadata, installed extension, source mod, corpus, settings, game files, or Git state.
- **Acceptance:** one installed `0.0.74` run must produce exactly one current/nonzero/exportable Canvas at
  `2560 x 1440`, then exactly one replacement current/nonzero/exportable Canvas at `1800 x 900`; each native PNG must
  match its mounted Canvas serialization. Profile drift must clear old path/loop/sample authority before exact
  reacquisition. Clearing the source must yield zero current canvases and disabled export; restoring source/profile/
  authority must return one current canvas; the original workspace and all safety fingerprints must restore; retained
  `0.0.73` evidence must compare byte-identical including stable absences. If this passes, no production repair or
  `0.0.75` release is justified. Preview remains `Not verified in game` and still cannot prove C++ frame acceptance.

### VALIDATE ATTEMPT 2 — installed `0.0.74` two-profile render/export proof

- **Status:** the positive two-profile installed-product contract is `VERIFIED`; the enclosing validator remains
  `FAILED` only at a contradictory stale-surface negative assertion. At `2560 x 1440`, the mounted profile issued
  effective Helper scale `1.4`, source-derived pending `_choiceY=769`, one current Canvas, `285,600` nontransparent /
  `261,575` nonblack-visible pixels, and bounding box `600,769-1649,1040` (`1050 x 272`). Its native export is
  `80,991` bytes, SHA-256 `FB3DC6A9D6BA3DFB87B1BA301D2F3307B34B6D33D1650DC8E48BA64A62150CCF`, and equals the mounted Canvas PNG.
- After the documented profile-bound clear and complete path/loop/sample reacquisition, `1800 x 900` issued effective
  Helper scale `0.875`, pending `_choiceY=481`, exactly one replacement Canvas with a new identity, `92,988`
  nontransparent / `83,214` nonblack-visible pixels, and bounding box `421,481-1158,606` (`738 x 126`). Its native
  export is `37,140` bytes, SHA-256 `A23B289714EE6A3C87408AF6D7067380D65624B00C8722C80B62E328D5B62803`, and equals that mounted Canvas PNG.
  Both screenshots were visually inspected and contain the same source-derived `REVIEW`, input, `SEND`, and `END`
  geometry at the profile-appropriate size and position; neither is pixel-parity or game evidence.
- The run recorded zero page/console errors and preserved Git status, source, installed package, config, sidecar health/
  listener ownership, X4-absent state, and all retained `0.0.73` evidence including stable absences. Its one browser and
  context closed in `finally`. Receipt:
  `dev-docs/b119-ai-influence-dogfood/installed-release-20260907/authority-complete-0.0.74-attempt2/installed-0.0.74-aic-menu-display-receipt.json`,
  `5,180,768` bytes, SHA-256 `330D56F371A28C26B10D0DA0081A14DB31540F8437D300E96948F87A580CE87B`.
- **`[REPRODUCED]` validator defect:** clearing the source correctly changed Canvas status to stale/refused and disabled
  export, but the validator then required the DOM to contain zero canvases. The established product contract deliberately
  retains the last accepted bitmap as a stale surface; focused mounted coverage requires `staleCanvasRetained=true` and
  export status `unavailable`. The validator confused “no current canvas authority” with “no mounted stale bitmap” and
  stopped before recording the negative state, final-current restoration, and workspace restoration.

### RECONCILE / REVISED PLAN — stale bitmap is visible history, not current authority

- **Bounded repair:** change only the ignored installed validator and write a fresh
  `authority-complete-0.0.74-attempt3` evidence directory. Pass the immediately preceding `1800 x 900` current state
  into the negative check. After source clear, require one retained Canvas with the same identity and serialized PNG
  hash, stale/refused (never `rendered/current`) status, disabled/unavailable export, and exact `Not verified in game`.
  Then restore source, `2560 x 1440` profile, all current owner-issued authority, one newly replaced current Canvas,
  original workspace, and every safety fingerprint. Do not remove the stale surface or weaken current/export authority.
- **Acceptance correction:** “zero current canvases” means zero canvases carrying current authority, established by the
  stale/refused status and disabled export. It does not require deleting the retained DOM bitmap. The final attempt must
  preserve both prior failed receipt directories, repeat both positive profile/export proofs, complete the corrected
  stale negative and final restoration, and close `VERIFIED` with zero product or release edits. Overall B119 remains
  `PARTIAL / Not verified in game` after this bounded installed-preview milestone.

### VALIDATE ATTEMPT 3 / REVIEW / CLOSE — installed `0.0.74` authority lifecycle

- **Bounded status:** `VERIFIED`. The controlled installed-product validator ran from
  `2026-09-07T13:54:07.593Z` through `2026-09-07T14:14:53.925Z`, exited `0`, and passed all `242/242` assertions.
  One fresh Playwright context used one headless browser and closed both context and browser in `finally`; no owned
  Playwright browser process remained. No page, console, request, HTTP, or native-dialog error was recorded.
- **Primary current surface:** exact current `aic_menu.lua -> menu.display` authority at `2560 x 1440` issued Helper
  scale `1.4` and source-derived pending `_choiceY=769`. Canvas identity `1` contains `285,600` nontransparent and
  `261,575` nonblack-visible pixels with bounding box `600,769-1649,1040` (`1050 x 272`). Native export is `80,991`
  bytes, SHA-256 `FB3DC6A9D6BA3DFB87B1BA301D2F3307B34B6D33D1650DC8E48BA64A62150CCF`, and byte-equals the
  mounted Canvas serialization.
- **Replacement current surface:** after profile-bound authority cleared and all three enclosing path arms, loop count
  `4`, and `25` owner-issued samples were reacquired, `1800 x 900` issued Helper scale `0.875` and source-derived
  `_choiceY=481`. Canvas identity `2` contains `92,988` nontransparent and `83,214` nonblack-visible pixels with
  bounding box `421,481-1158,606` (`738 x 126`). Native export is `37,140` bytes, SHA-256
  `A23B289714EE6A3C87408AF6D7067380D65624B00C8722C80B62E328D5B62803`, and byte-equals that mounted Canvas.
- **Corrected negative and restoration:** clearing source and target retained exactly Canvas identity `2`, exact
  `1800 x 900` dimensions, and the exact `A23B...B62803` serialized bitmap as `retained-stale-history` with
  `currentAuthority:false`; status was `stale`, export was disabled with the established unavailable wording, and
  game truth remained exact `Not verified in game`. Restoring source, target, `2560 x 1440`, all path/loop/sample
  authority, and the original workspace created current Canvas identity `3`; its geometry census and
  `FB3D...50CCF` serialization exactly reproduce the primary current surface.
- **Human visual review:** both native exports visibly contain the same source-derived `REVIEW`, input, `SEND`, and
  `END` structure at the profile-appropriate scale and position. The retained negative and restored page captures were
  also inspected. This is installed Forge preview proof, not X4 pixel parity or C++ frame-acceptance evidence.
- **Safety / immutable evidence:** Git porcelain, exact source SHA-256
  `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`, installed `0.0.74`, config,
  sidecar listener/owner PID `55096`, root health, X4-absent state, and both retained `0.0.73` evidence sets were
  unchanged. The accepted receipt is `6,745,911` bytes, SHA-256
  `8B62A1E3385706A234977624020835C7C8FF1CC104ACA318F9043098A383AE61`, at
  `dev-docs/b119-ai-influence-dogfood/installed-release-20260907/authority-complete-0.0.74-attempt3/installed-0.0.74-aic-menu-display-receipt.json`.
- **Requirement review:** command-bound repeated-source tint ownership, profile-derived scenario sampling, current-only
  export authority, stale-history retention, profile replacement, final restoration, installed package/runtime, and
  public `0.0.74` parity are done and evidenced. Universal Helper/widget/C++ acceptance, arbitrary Lua, and the full
  twelve-reference AI Influence reconstruction/current in-game census remain deliberately open. Overall B119 stays
  `IN_PROGRESS / PARTIAL / Not verified in game`; no `0.0.75` production release is warranted by either validator
  correction.
- **Triggered AAR:** the first attempt reused one profile's absolute sample value; the second conflated mounted bitmap
  presence with current authority; one parent helper check initially supplied the wrong pure-function object shape.
  The accepted pattern is to derive sample facts from the currently mounted profile, distinguish visual history from
  authority, preserve every failed receipt, and accept only a final safety-complete receipt. Highest current risk is a
  convincing source-static preview being mistaken for a complete runtime-built AI menu; X4 and the twelve-reference
  census remain the authority for that boundary.

### RECONCILE — post-publication release-history metadata

- Final record review found `_published["0.0.73"]` but no matching `0.0.74` entry even though both versions were
  published before their corrective source commits. The release-notes schema explicitly reserves `_published` for this
  exceptional ordering. Add exact date `2026-09-07` for `0.0.74`, regenerate the canonical changelog, and require the
  resulting version/date/note order to remain exactly `0.0.74 -> 0.0.73 -> 0.0.72`. Do not change package bytes,
  version, notes, publication, installed extension, runtime, or visual evidence; no republish is authorized.

### IMPLEMENT / VALIDATE — post-publication release-history metadata

- **Status:** `VERIFIED`. `_published["0.0.74"] = "2026-09-07"` is now the first exceptional publication record and
  every prior entry remains exact. The existing three-item `0.0.74` note array is byte- and semantic-identical.
  Canonical generation emitted `62` versions and retained exact top order/dates `0.0.74 / 2026-09-07`, `0.0.73 /
  2026-09-07`, and `0.0.72 / 2026-09-06`; the complete generated changelog remained byte-identical. JSON parse,
  deterministic metadata/note/heading assertions, generator, and diff hygiene passed. No package, registry, installed
  product, runtime, evidence, or other file changed and no republish occurred. Two preliminary read-only comparison
  wrappers failed on unsupported `TextEncoder` and an overstrict newline marker before corrected comparisons passed;
  neither failure wrote additional data.

### FINAL VALIDATE / FRESH-EYES REVIEW — commit candidate

- Exact-path `git diff --check` passed. The complete `npm run precommit:check` then exited `0`: tripwires and canon
  mirrors were clean; E2E verdict selftest passed `55/55`; Vite lifecycle and shipped-product copy passed; durable
  writer audit passed `15/15` plus `8/8`; capability audit passed `12` capabilities / `297` literal routes / `1`
  reviewed dynamic registrar / `11` MCP aliases; MCP capability recovery passed; action-receipt coverage passed `82`
  routes / `57` surfaces; TypeScript and size guards passed; final verdict was `OK`.
- Final diff review covers exactly `21` intended tracked paths (`19` feature/release paths plus `BACKLOG.md` and
  `SESSION-HANDOFF.md`). Added-line scanning found no TODO/FIXME, disabled lint/type safety, test-only/skip marker,
  secret/token access, dynamic evaluation, or production debug logging; the four added `console.log` sites are bounded
  causal receipts in selftests. Graphify confirms the highest-blast changed owner is `projectX4UiLayoutProgram` with
  `105` connections and that the chain reaches Preview, Session, Scene, Paint, Canvas, mounted Source Editor, and E2E
  coverage. `reviewctl` is not installed, so no claim is made from that optional scanner.
- **Review verdict:** approved for exact staging and commit. No acceptance criterion was weakened and no unrelated
  dirty path is owned. The commit hook must repeat complete precommit on the final staged state. External GitHub,
  Notion, and Drive projections remain intentionally pending until the exact commit hash exists.

### DOCUMENT CLOSE — source commit and external projections

- **Source commit / push:** `c61a26d8060762a19af35eec9762764cdf3aeb2d` contains exactly the reviewed `21`
  tracked paths and `9,245` insertions / `506` deletions. Its commit hook repeated complete precommit and exited `0`.
  `git push origin main` succeeded; local `HEAD`, configured upstream, and direct `refs/heads/main` read back exactly
  equal to the full source commit.
- **GitHub owner:** issue #41 remains open. Checkpoint comment `5572535524` was created and read back at
  `https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5572535524`; it records `0.0.74`, `242/242`, both
  profile hashes, public package parity, `134/134`, `106/106`, `1,848` modules, original brief `6/6`, and the explicit
  full-benchmark/C++ boundary.
- **Notion owner:** page `3b84618e-d15b-8190-821e-c0eb96f43d5a` was updated in place and read back with Status
  `In Progress`, Evidence Grade `Partial`, source commit, GitHub comment, package/hash, installed lifecycle, and the
  same remaining boundary. No duplicate task was created.
- **Google Current Status:** the file-backed trusted read scanned document
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, at required revision
  `ANLCKQlp81AQ0tuQO9BUj2oi02eqY2-ETqz9bLexRCfrjPh1wi7W3VYlIBbxp6OUPJ5Lc6cYsA773jWZrhpMxd2JFhhlgJUGD-OMNKsehKNO`.
  It found zero protected controls, zero opaque controls, zero dropdowns, and one existing native date element. One
  atomic, tab-scoped, revision-guarded batch updated the top authority fields and executive state and appended a
  `HEADING_2` checkpoint. Narrow readback verified the expected text/style at resulting revision
  `ANLCKQndwLZg7Au5avTjDeR8XAck4SP4PASfvJ4iIEPCCi0CwCmP6Mlq0AZXU3WZ0sXmUZOxHuW3ejLzPfgyY0UV5mmlFtbtsvsxZqAtajNL`.
- **Close status:** the command-bound tint/source-loop/public-installed `0.0.74` unit is `VERIFIED`; overall B119 and
  GitHub #41 remain `IN_PROGRESS / PARTIAL / Not verified in game`. The next bounded unit is the complete twelve-image
  AI Influence reconstruction and current-game census, not another release or preview-only claim.

### BASELINE / RECONCILE — `aic_sheet.lua -> sheet.display` authority-complete refusal

- **Bounded unit:** continue the twelve-reference census with the exact workspace source
  `ui/addons/ai_influence_chat/aic_sheet.lua`, SHA-256
  `A0D38877D74A4F196B78A3B70ECFAF08956BDEA4C9287FD110665A3F3DCE9A37`, target `sheet.display`
  (lines `75-228`). The selected path authority is the data-present arm at `98-101` and the optional-note arm at
  `158-169`; the debug arm at `31`, `sheet.frame` arm at `122`, and unreachable `Helper == nil` arm remain clear.
  Both source loops are owner-issued at exactly `4`: clauses `147-171` and save diffs `183-195`.
- **Complete authority baseline:** the mounted installed `0.0.74` editor reports all `55/55` issued scenario samples
  valid. The profile is `2560 x 1440`, effective Helper scale `1.4`; the source-derived table positions are
  `144`, `192`, clause/note pairs `234/270`, `309/345`, `384/420`, `459/495`, section `545`, diffs
  `587/621/655/689`, and buttons `743`. Source, target, branches, loops, corpus identity, and every sample are current.
- **`[REPRODUCED]` production refusal:** before sample completion, Canvas correctly failed closed for missing
  renderer-issued visible geometry. After all `55` inputs became valid, Scene remained `partial` with `11`
  source-linked width/height diagnostics (the source expresses frame dimensions through `vw`, `vh`, and table width
  `w`), and Paint still refused with `Scene evidence is malformed, stale, cyclic, or carries engine/game paint truth`.
  Canvas export is unavailable. This is not an incomplete-input explanation; the composite `sceneValid()` guard in
  `src/lib/x4UiPaintPlan.ts` rejects a fully authority-complete issued Scene, but its exact failed invariant is not yet
  exposed.
- **Authoritative references and reused owners:** shipped `helper.lua`/corpus profile remain the metric and layout
  authority. Reuse the existing Source -> Layout Program -> Session -> Scene -> Paint Plan -> Canvas chain; do not
  create another renderer, parser, or acceptance path. The relevant current owners are `x4UiScene`,
  `x4UiPaintPlan`, `x4UiLayoutProgram`, and `x4UiPreviewPipeline` plus their existing selftests.
- **Risk / rollback:** the main risk is weakening a defensive Scene boundary and allowing malformed, stale, cyclic,
  cross-profile, or game-truth-bearing evidence to paint. Restrict any repair to the existing owner and its causal
  regressions. Rollback is the exact pre-worker diff against `1fb1bd784f60b19a3abc5deba91510b8228d86f2`; no mod,
  corpus, game, installed extension, release metadata, settings, or external projection may change in this unit.

### REVISED PLAN / ACCEPTANCE — isolate the failed Scene invariant before repair

- First add a causal fail-first regression that reproduces the complete `sheet.display` Scene shape and the current
  `invalid-scene` refusal. The receipt must identify the exact `sceneValid()` predicate that fails; elapsed time,
  zero geometry, and generic error text are not diagnoses.
- Repair only the existing projection/validation owner proven responsible. A valid authority-complete
  `sheet.display` projection must reach one current, nonzero, export-enabled Canvas bound to the exact source hash,
  target, corpus, and profile, while retaining exact `Not verified in game` truth.
- Negative acceptance remains mandatory: malformed shape, stale/cross-profile authority, duplicate/orphan/cyclic
  relationships, invalid preview provenance, and any engine/game paint-truth injection must continue to refuse. No
  fixture may bypass production validation and no acceptance criterion may be weakened to make the source pass.
- Required validation for this bounded repair is the causal regression, the complete focused Scene/Paint/Layout/
  Preview selftests, TypeScript, scoped lint/diff hygiene, and a fresh installed-product replay of the exact
  `aic_sheet.lua -> sheet.display` authority. Release/build/E2E and current X4 proof follow only if production code
  changes and the focused repair is green. Evidence stays under
  `dev-docs/b119-ai-influence-dogfood/installed-release-20260907/`; overall B119 remains `PARTIAL / Not verified in
  game` until the complete reference census and current X4 captures close.

### IMPLEMENT / FOCUSED VALIDATE — loop-issued frame table order

- **`[REPRODUCED]` exact failed invariant:** the authority-complete fixture failed `scene-frame-tables`. Runtime loop
  execution records each frame's table IDs in interleaved clause/note order, while canonical Scene tables are emitted
  in stable source order. Both ledgers contained the same valid tables, but the strict ordered relationship check
  correctly refused their inconsistent serialization.
- **Bounded repair:** `buildFrameNodes()` now receives the authoritative layout-table map and canonicalizes each
  frame's table references with the same `(source offset, id)` ordering used by Scene table emission. No geometry,
  expression, corpus, paint, export, or game-truth policy changed.
- **Causal regression:** the portable exact-source fixture asserts SHA-256
  `A0D38877D74A4F196B78A3B70ECFAF08956BDEA4C9287FD110665A3F3DCE9A37`, target `sheet.display`, both selected
  source paths, both loop counts `4/4`, all `55` samples, exact tab order `1-16`, and exact source-derived y positions.
  It now projects a `partial` Scene with `1` frame, `17` tables, `16` rows, `40` cells, `31` widgets, `34` texts,
  `276` glyphs, and `240` explicit gaps; Paint remains `partial` but emits `767` commands with nonzero geometry and
  exact `Not verified in game / gameVerified:false`.
- **Independent focused evidence:** `x4UiScene.selftest.ts` passed `179/179`; `x4UiPaintPlan.selftest.ts` passed
  `212/212` including `51/51` Phase 6C hostile mutations and all existing malformed/stale/cyclic/ordering/truth
  refusal families; `npm run typecheck`, scoped ESLint, and exact-path `git diff --check` passed. Installed-product,
  package, public-registry, and current-X4 validation remain pending, so this repair is not yet a release close.

### VALIDATE — release, package, install, and installed `sheet.display`

- **Broad gates:** the first full serial E2E attempt terminated after `62` tests with Windows child exit
  `3221226505 / 0xC0000409` and no authoritative structured verdict, so it remains failed evidence. One unchanged,
  independent rerun passed `106/106` in `8.7m` with zero failed, flaky, bad, quarantined, skipped, or incomplete
  results and `treeGone=true`. The ephemeral tree stopped, ports `3100/3101` cleared, and the live workspace receipt
  remained unchanged. Production build passed at `1,848` modules; `graphify update .` completed at
  `10,586` nodes / `26,687` edges / `332` communities with no tracked graph delta; complete precommit passed.
- **Package:** version `0.0.75` stages and builds cleanly, staged-app probe passes `16/16`, and package inspection
  reports `2,107` archive entries / `2,105` payload files. Local VSIX
  `vscode-extension/x4-forge-studio-0.0.75.vsix` is exactly `26,316,960` bytes with SHA-256
  `F3662F134C4023B156DAD2F264AFDC8330B758D529E9DCD13CE19ED3EA4FF36`. The first inspector invocation omitted its
  required VSIX argument and failed without mutation; the corrected exact invocation passed.
- **Public registry:** OpenVSX accepted one publication of `x4forge.x4-forge-studio v0.0.75`; it was not retried while
  indexing lagged. At `2026-09-07T18:36:21Z`, both `/latest` and the direct `0.0.75` endpoint returned `0.0.75` and
  the same download URL. An independent registry download is exactly `26,316,960` bytes with the local SHA-256 above.
  The retained temporary parity copy is
  `C:\Users\Moshi\AppData\Local\Temp\x4forge-openvsx-parity-20260907-1837\x4forge.x4-forge-studio-0.0.75.vsix`.
- **Installed product:** the exact prior `0.0.74` extension was copied before install to
  `C:\Users\Moshi\AppData\Local\Temp\x4forge-installed-0.0.75-20260907-140525-f6d5f95e9eef4b5094e51e719005dfaf\x4forge.x4-forge-studio-0.0.74`
  (`2,106` files; manifest SHA-256 `340F5F95B09553BEE8D4BCAFB423A2394DAE9F8D1C16C03FDF6CAD094C752523`).
  Installed `0.0.75` matches all `2,105` package payload files with only the expected host `.vsixmanifest` extra and
  IDE `__metadata` normalization. The installed sidecar started from the `0.0.75` payload on port `52240`; root health
  returned `200`; installed runtime oracles passed `134/134`. The install wrapper incorrectly interpreted a null
  PowerShell `$LASTEXITCODE` as failure after the IDE had already installed successfully; payload inspection, rather
  than a second install, supplied the authority.
- **Exact installed replay:** the mounted editor selected workspace `x4 AiLive`, exact source
  `ui/addons/ai_influence_chat/aic_sheet.lua` at SHA-256
  `A0D38877D74A4F196B78A3B70ECFAF08956BDEA4C9287FD110665A3F3DCE9A37`, target `sheet.display`, data-present
  `98-101`, note-present `158-169`, both loops `4/4`, and all `55/55` exact values with zero retained mismatches. It
  issued one native `2560x1440` Canvas, status `rendered/current`, enabled `Export current PNG`, and retained
  `Preview evidence only / Not verified in game`. Direct visual inspection shows nonzero source paint: four
  clause/note pairs, four cost rows, the section bar, and `SIGN AND TRANSFER / COUNTER-OFFER / WALK AWAY` buttons.
  A browser download-event probe timed out and did not produce a final-file receipt, so this run proves mounted/export-
  eligible pixels, not completed Save As. The timeout reset only the automation session; the rendered tab remained.

### REVIEW — installed source output versus reference `1e`

- Reference `design_handoff_ai_influence/screenshots/1e-gate-agreement-sheet.png` was reopened and inspected at
  original detail on `2026-09-07`. The installed output matches the authored Lua's high-level table order, centered
  agreement sheet, four clause/note pairs, save/cost section, and three-action footer. This crosses the previously
  blocked Source -> Layout -> Scene -> Paint -> Canvas installed pipeline for a loop-heavy real AI source.
- It does **not** match reference `1e`: current source says `TERMS OFFERED` instead of `PROPOSED AGREEMENT`, says
  `WHAT THIS COSTS YOU` instead of `WHAT CHANGES IN YOUR SAVE`, uses equal-third buttons instead of the reference's
  wider first/second and narrower third proportions, and the fixture uses synthetic labels. `CLAUSE-*` truncates in
  the authored 8% gutter and dynamic `toneColor(d.tone)` leaves the sampled right-side values without complete source-
  proven color paint. These are current-source/reference or still-unresolved dynamic-evidence differences, not proof
  that Forge may invent a prettier result.
- **Requirement disposition:** the causal frame-table-order defect, broad product gates, public package, installed
  package/runtime, and exact authority-complete visible replay are done and evidenced. Current X4 acceptance for this
  exact sheet, complete reference reconstruction, all twelve current-game captures, arbitrary Lua coverage, universal
  C++ frame acceptance, and a product-wide 1:1 claim remain open. Overall B119 therefore remains
  `IN_PROGRESS / PARTIAL / Not verified in game`; no capability-map delta.

### DOCUMENT CLOSE — `0.0.75` source commit and external projections

- **Source commit / push:** `9996299877719b004a1fec1c2adda39f8fded292` contains exactly the reviewed eight paths
  (`658` insertions / `98` deletions). Its commit hook repeated complete precommit and exited `0`. `git push origin
  main` succeeded; local `HEAD`, configured upstream, and direct `refs/heads/main` read back exactly equal to the full
  source commit.
- **GitHub owner:** issue #41 remains open. Checkpoint comment `5574824809` was created and independently read back at
  `https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5574824809`; it records the canonical-order repair,
  exact source authority, focused/broad gates, public package parity, installed visual result, failed-first E2E, and
  the explicit design/X4/full-benchmark boundary.
- **Notion owner:** page `3b84618e-d15b-8190-821e-c0eb96f43d5a` was updated in place and read back with Status
  `In Progress`, Evidence Grade `Partial`, commit `9996299`, GitHub comment `5574824809`, package/source hashes,
  installed nonzero agreement sheet, and the same remaining boundary. No duplicate task was created.
- **Google Current Status:** the checked-in file-backed trusted read scanned document
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, at required revision
  `ANLCKQndwLZg7Au5avTjDeR8XAck4SP4PASfvJ4iIEPCCi0CwCmP6Mlq0AZXU3WZ0sXmUZOxHuW3ejLzPfgyY0UV5mmlFtbtsvsxZqAtajNL`.
  It found zero protected controls, zero opaque controls, zero authoritative dropdowns, and one existing native date
  element. One atomic, tab-scoped, revision-guarded batch preserved that structure, refreshed the six top authority
  paragraphs, and appended a peer `HEADING_2` checkpoint. Narrow readback verified the exact commit, release, comment,
  boundary, paragraph types, and target at resulting revision
  `ANLCKQk7bLVU_Vby6HAOBLoNf8eSTsrczHzKV7elPqQSuTLrr_eA6c6wXM7xgjupE4NQMQ5pvThRbLr5ty_-XUV991UEYD3Ydye9PjanX2KF`.
- **Close status:** the canonical frame-table order/public-installed `0.0.75` unit is `VERIFIED`; overall B119 and
  GitHub #41 remain `IN_PROGRESS / PARTIAL / Not verified in game`. The next bounded unit is a valid current native
  X4 invocation/capture for `sheet.display`, followed by source-backed `1e` corrections and the remaining
  twelve-reference census.

### PLAN / ACCEPTANCE CONTRACT — exact shipping `sheet.display` in native X4

- **Lane / bounded unit:** FULL. Use the existing scratch-only `pipeline_test` extension as a one-run launcher for
  the deployed, byte-identical `x4_ai_influence` implementation of `AIC_Sheet_Menu.open()`. Prove that the exact
  shipping `aic_sheet.lua` accepted by the installed Forge source pipeline is also accepted and visibly rendered by
  the current X4 host. This is an acceptance run, not another renderer implementation.
- **Authoritative references / assumptions:** workspace and deployed `aic_sheet.lua` must retain SHA-256
  `A0D38877D74A4F196B78A3B70ECFAF08956BDEA4C9287FD110665A3F3DCE9A37`; the shipped Helper/corpus remains layout
  authority. A deterministic `_pendingAction` fixture is sufficient because `AI_Influence.AgreementSheet()` consumes
  that table locally. Current X4 C++ frame acceptance and the rendered host are the authority for this gate.
- **In scope:** add a hard `x4_ai_influence` dependency to the scratch launcher; wait for the shipping globals; save,
  inject, and later restore one deterministic pending action; call the shipping `AIC_Sheet_Menu.open()`; run Forge
  import/validation/dry-run/deploy verification; launch X4; capture the visible sheet and post-baseline debug-log
  receipts; then remove the deployed scratch extension and restore its workspace bytes.
- **Out of scope:** no Forge production-code change, no `x4_ai_influence` source change, no duplicate sheet/layout
  implementation, no claim that the production REVIEW transition is proven, no action-button activation, no game
  save or economy mutation, no source-to-reference cosmetic correction, and no product-wide or universal 1:1 claim.
- **Baseline / rollback:** local and upstream Forge revision are both
  `573a577a56f21cbe618cd42061cbf7d5d96423e6`; X4 is stopped; no `pipeline_test` directory is deployed under the game
  extensions folder; the four-file scratch workspace is checkpointed by exact path, size, and SHA-256 before edit.
  Rollback restores those bytes and removes only the exact deployed `pipeline_test` target after X4 stops. Existing
  unrelated Forge worktree changes remain untouched.
- **Risks / authorization boundary:** auto-open may cover the X4 start screen; agreement buttons could cause AI-mod
  side effects if activated. The run will capture only, use close/Escape where safe, never activate sheet actions,
  and stop before any save-discard prompt. User authorization covers Forge deploy, X4 launch/control, evidence
  capture, cleanup, and the already delegated commit/push workflow.
- **Acceptance criteria:** (1) source and deployed sheet hashes remain exact; (2) the scratch mod contains only the
  dependency and deterministic launcher behavior; (3) Forge project validation returns zero errors and its UI linter
  retains the known blocking-rule families; (4) guarded dry-run and real deploy verification succeed; (5) the
  post-baseline X4 log contains launcher armed/opened receipts and `[AICHAT][SHEET] display DONE clauses=<n>` with no
  relevant Lua traceback, `DisplayView`, or view-setup failure; (6) a native X4 screenshot visibly shows the shipping
  agreement sheet and identifies the tested resolution/UI scale; (7) no sheet action is activated; and (8) cleanup
  restores the scratch workspace and leaves the game deployment absent.
- **Negative path:** if the dependency or shipping globals never appear, the launcher must time out with an explicit
  refusal receipt and must not report success, synthesize a substitute UI, or mutate pending state. Any host rejection
  or missing visible result keeps B119 `PARTIAL` and preserves the evidence for diagnosis.
- **Validation / evidence:** record pre/post manifests, Forge API receipts, X4 debug-log slice, native screenshot,
  resolution/profile, cleanup manifest, and review notes under
  `dev-docs/b119-ai-influence-dogfood/in-game-20260907-sheet/`. Update the repository plan, handoff, project AAR/
  knowledge base, capability map only by evidenced delta, GitHub #41, Notion owner page, and Google Current Status at
  the resulting checkpoint.

### IMPLEMENT / VALIDATE — native X4 `sheet.display` invocation

- The scratch launcher changed only `pipeline_test/content.xml` and `ui/pipeline_test.lua`: one hard
  `x4_ai_influence` dependency, an idempotent `SetScript("onUpdate", ...)` waiter, a deterministic four-clause/
  four-diff fixture, exact save/restore of the two process-memory slots it borrowed, and a call to the shipping
  `AIC_Sheet_Menu.open()`. It registered no menu, emitted no table, and invoked no agreement action.
- Installed Forge `0.0.75` imported the four-file folder without adopting it into the live canvas. Canonical
  from-path project validation returned `ok:true`, zero Lua errors/warnings, zero X4 UI errors/warnings, and one
  honest `x4-ui.verification-gap` info result. The rejected first request used the unsupported `path` field; live
  capability reconciliation corrected it to `fromPath` without weakening validation.
- Guarded dry run proved exactly four additions / `8,196` bytes with zero overwrite or deletion. The real loose
  deploy passed all eleven checklist stages and produced fingerprint
  `470e6726feea88ce38fc1727900948209df4fb780af6c1c70988878c5c6248c4`, recovery
  `deploy-mtrp0x4w-c3e41cdf431bcca6`, and history row `mtrp0zh7-671a88f5`.
- Current X4 visibly rendered the shipping agreement sheet at configured profile `2544x1353 / uiscale 1.0`: four
  numbered clauses with notes, four save-delta rows, source-authored colors/panel geometry, and all three native
  buttons. No button was activated. Screenshot
  `dev-docs/b119-ai-influence-dogfood/in-game-20260907-sheet/x4-native-agreement-sheet-2546x1385.jpg` is `436,734`
  bytes, SHA-256 `3DADBA8AB83B34C95A41FD56A65ACF32BC399B058C0EC862B05CA085721AB5B8`.
- The game rotated `debuglog.txt` on launch, invalidating the retained prior byte offset; the complete new
  `20,096`-byte session log is the authority. It records launcher `armed -> dependency-ready -> fixture-ready ->
  open-requested -> opened` around `[AICHAT][SHEET] display DONE clauses=4`, with no `DisplayView`, view-setup
  failure, Lua traceback, or launcher refusal.
- Cleanup is exact: X4 closed normally; Forge consumed the one-use deploy recovery and restored the game target to
  `absent`; all four scratch workspace files read back at their exact pre-run SHA-256 values. No save, economy,
  agreement action, production AI source, neighboring extension, or active Forge canvas changed.

### REVIEW / CLOSE — bounded native proof and reproduced warning

- **Requirement disposition:** all eight acceptance criteria for this bounded invocation are done and evidenced.
  The exact source accepted by the installed preview pipeline also opened and rendered through X4's native Helper/
  widget/C++ path. This is real end-to-end proof for this sheet and profile; it is not universal frame acceptance,
  arbitrary Lua coverage, complete reference parity, or proof for the remaining eleven reference images.
- **`[REPRODUCED]` source diagnostic:** X4 emitted exactly thirteen
  `table column finalization with reserveScrollBar: No column with variable width defined` messages. They map
  one-for-one to the thirteen `aic_sheet.lua` two-column tables whose columns are fully percentage-fixed while the
  shipped `reserveScrollBar=true` default remains active. X4 disabled the reservation and rendered successfully, so
  this is not a frame-rejection result. Forge's folder linter reported zero warnings, making it a demonstrated static
  detection gap.
- **Bounded close:** native `sheet.display` invocation is `VERIFIED`; overall B119 remains `IN_PROGRESS / PARTIAL`.
  Evidence: `dev-docs/b119-ai-influence-dogfood/in-game-20260907-sheet/native-x4-proof.md`.

### RECONCILED NEXT PLAN — surface and remove fixed-column scrollbar diagnostics

- **Bounded unit:** extend the existing source linter—without another parser or layout engine—to report a stable,
  source-located warning when `reserveScrollBar` is true/default and statically proven percentage assignments leave
  no variable-width column at the first `addRow()` freeze boundary. Then add explicit `reserveScrollBar=false` to the
  four affected shipping source call sites (one direct plus three loop bodies, thirteen runtime tables in this fixture)
  and prove the warning disappears in Forge and current X4.
- **Reuse / non-goals:** reuse the existing call model, first-row column-finalization boundary, Helper kernel
  `reserve-scrollbar-no-variable-column` diagnostic, project-validation flattening, and IDE Problems projection. Do
  not duplicate Helper math, change scrollbar layout behavior, infer dynamic column assignments, alter agreement
  actions/data, or claim pixel/reference parity.
- **Acceptance:** a fail-first exact-source check reports four source-located warnings—the one header call and the
  three loop-body call sites whose `4 + 4 + 4` expansion produced the remaining twelve runtime messages, for thirteen in
  X4—without pretending static source contains thirteen separate calls. Explicit false and at least one genuinely
  variable column remain clean; unresolved/dynamic cases stay unverified rather than guessed; existing
  >12-column, colspan, ordering, ASCII, scale-domain, geometry, and provenance rules remain unchanged. The repaired
  shipping source validates with zero instances, deploys through the guarded route, visibly reopens in X4, and emits
  zero current-session copies of this diagnostic while retaining `display DONE clauses=4`.
- **Risks / rollback:** cry-wolf risk is an overbroad static rule; runtime risk is accidental agreement-sheet behavior
  change. Roll back only the bounded linter/test and `aic_sheet.lua` option additions. Use the same disposable launcher,
  no action clicks, exact deployment recovery, and current-session log isolation for the rerun.
- **Required validation:** focused linter/call-model/kernel/project-validation tests; official corpus census and
  zero-regression rule-family checks; TypeScript, scoped ESLint, diff hygiene, full precommit, production build and
  serial E2E if Forge source changes; guarded Forge validate/dry-run/deploy; native screenshot and scoped log; exact
  cleanup; fresh-eyes review; repository/GitHub #41/Notion/Drive/handoff/AAR updates at the checkpoint.

### IMPLEMENT / VALIDATE — fixed-column scrollbar warning and source repair

- The existing linter now emits stable warning `x4-ui.reserve-scrollbar-no-variable-column` only when one compatible
  reachable table context proves all positive literal columns were uniquely fixed by in-range literal
  `setColWidth`/`setColWidthPercent` calls before the first `addRow()` while `reserveScrollBar` is true or omitted.
  Dynamic, branched, duplicate, out-of-range, automatic, and post-freeze cases remain explicit coverage gaps instead
  of guessed diagnostics. The warning quotes X4's native failure mode and directs the author either to leave a
  variable column or set `reserveScrollBar=false`.
- The exact pre-repair `aic_sheet.lua` produced four source-located warnings at lines `111`, `149`, `160`, and `185`,
  matching the one direct table and three loop-body call sites that expanded to thirteen native runtime diagnostics.
  The shipping source now adds only `reserveScrollBar=false` to those four table options. Its current SHA-256 is
  `A09A66B4BF98491B627304FD0F198B3893A21F9EE18BF8AA0979BB82220D4E34`; removing those four exact additions
  reconstructs the deployed baseline byte-for-byte. Lua parsing passes and the repaired sheet reports zero instances
  of the new warning.
- Focused linter tests pass `153/153`; TypeScript, scoped ESLint, exact diff hygiene, production build (`1,848`
  modules), official corpus census (`81/81` read, zero applicable fatal failures), installed-sidecar runtime oracles
  (`134/134`), graph refresh, and complete precommit all pass. The first E2E run ended after two tests with the known
  Windows child teardown code `0xC0000409` and no authoritative verdict; after proving the ephemeral ports clear and
  the live workspace unchanged, one clean serial rerun passed `106/106` with `treeGone=true`. Current native X4
  zero-diagnostic proof is still pending, so this bounded repair is not yet closed.
- Project-wide validation remains valid with zero errors. It also locates three distinct warnings in `aic_comm.lua`,
  `aic_hub.lua`, and `aic_menu.lua`; those are preserved as separate follow-up findings and are not silently folded
  into this exact agreement-sheet repair.

### REVISED PLAN / AUTHORIZATION — stable `0.0.76` and native zero-warning proof

- **Bounded release:** publish and install stable `0.0.76` containing only the reviewed linter/test changes, generated
  release metadata, and the already documented B119 records. Public OpenVSX publication, exact commits, and pushes are
  within the user's standing authorization. No unrelated dirty path, new renderer behavior, or additional AI source
  repair enters this release.
- **Package acceptance:** bump only the established extension version/release-note owners, regenerate the changelog,
  rebuild and stage the current product, pass staged-app and archive inspection, verify no secret or machine-specific
  path is packaged, publish exactly once, and establish local/public-download byte and SHA-256 parity before commit.
  Preserve an exact installed `0.0.75` rollback copy before installing the new package.
- **Installed/native acceptance:** prove the installed `0.0.76` payload and runtime oracles, then use its guarded Forge
  validation/deploy path to deploy only the repaired `aic_sheet.lua`. Reuse the already validated disposable launcher,
  visibly reopen the shipping sheet in current X4 without activating an action, and require `display DONE clauses=4`
  plus zero current-session copies of the reserve-scrollbar diagnostic. Close X4, remove the launcher deployment,
  restore its workspace bytes, and retain the intended verified AI source deployment.
- **Evidence / rollback:** retain package hashes, public endpoints, install parity, Forge deployment receipts, native
  screenshot/log slice, and cleanup manifests under the existing B119 evidence tree. Package rollback is the saved
  `0.0.75` installation; mod rollback is Forge's exact deployment recovery plus the pre-repair source hash. Any red
  package, runtime, linter, deploy, visual, or log gate stops publication/close at its boundary rather than weakening
  the acceptance contract.

### RELEASE CHECKPOINT / FAILED DEPLOY ORACLE — `0.0.76`

- Stable `0.0.76` was built, staged, inspected, published once to OpenVSX, independently downloaded with exact archive
  byte/SHA-256 parity, installed in Antigravity, and exercised through the installed sidecar. The local and downloaded
  VSIX SHA-256 is `0C8E11A8F6FA71B17D013B005448017AD21A7B013BC44E4C879A7162B4DD628D`; the installed runtime passed
  `134/134` oracles and project validation kept the repaired sheet at zero instances of the new warning.
- The installed Forge then dry-ran and applied a loose deployment of `x4_ai_influence`. Its internal checklist and
  artifact verifier returned success, fingerprint
  `ed7914e1bf62c971377d1d2959a73e4a5941d22b6034c334b86b74612581e5c9`, history row
  `mts9z4qw-c5ec7cec`, and recovery `deploy-mts9z1ib-b3afd0910f8c3e0d`.
- **Required external oracle failed:** an independent full-tree byte census found only `83/125` common files still
  identical after deployment. In addition to the intended sheet change and pre-existing `.forgekeep` difference,
  forty `.github`/`tools` passthrough files had changed bytes. Forge's `verified:true` result therefore did not prove
  byte-preserving artifact materialization. X4 was not launched and the deployment was not accepted.

### RECOVERY / REVISED ACCEPTANCE — byte-preserving loose artifacts

- On `2026-09-08`, the one-use hash-guarded recovery completed with `ok:true` and restored fingerprint
  `a9046192c83c8b5c0a1304af96d64a43a203f5ee8ef5e34987583752884eb295`. Independent post-recovery census proved the
  exact pre-deploy shape: source `127` files, deployed `126`, common `125`, identical `123`; differences only
  `.forgekeep` and the intentionally unreleased `aic_sheet.lua`; source-only `.claude/settings.local.json` and
  `.gitignore`; deployed-only `.mcp.json`. The deployed sheet returned to SHA-256
  `A0D38877D74A4F196B78A3B70ECFAF08956BDEA4C9287FD110665A3F3DCE9A37`, no transaction siblings remained, and X4
  stayed stopped. Recovery replay correctly refused with HTTP `409` / `RECOVERY_ALREADY_USED`.
- **Bounded repair:** reproduce the corruption in an isolated artifact fixture, trace the existing plan/materialize/
  verify/replace owners, and make opaque passthrough content byte-preserving end to end. The verifier must compare the
  materialized artifact to its byte-authoritative plan so this mutation class cannot return success. Do not change UI
  rendering, linter semantics, AI behavior, or unrelated deployment policy.
- **Acceptance:** binary and non-UTF-8 passthrough fixtures retain exact bytes, sizes, and SHA-256 through loose staging
  and replacement; a paired mutation fails verification before target promotion; rollback and one-use replay remain
  green; focused tests, typecheck, scoped lint, build, runtime oracles, serial E2E, and precommit pass. Publish a new
  corrective version rather than republishing `0.0.76`, install it, then repeat the real-mod dry run/deploy and require
  a full-tree external byte census before launching X4. Only after exact deployment may the zero-warning native sheet
  rerun proceed.

### IMPLEMENT / FOCUSED VALIDATE — byte-authoritative passthrough repair

- The JSON-safe workspace contract now marks loaded non-text payloads with `contentEncoding: "base64"`; legacy
  `reason: "binary"` entries without the marker remain supported. At the artifact ownership boundary, Forge accepts
  only canonical Base64 and converts it to a raw `Buffer` before planning, hashing, preview, loose deployment, or
  release preparation. Malformed or noncanonical input fails closed before materialization or promotion.
- The causal server fixture failed first at `87/94`: a loaded `.py` file was planned as `64` bytes of Base64 text,
  arbitrary non-UTF-8 bytes were not preserved, legacy markerless decoding failed, and malformed Base64 was promoted.
  After the repair, the same source-level integration receipt passes `94/94`, including exact `.py`, non-UTF-8, and
  empty-file bytes; original size/SHA-256 metadata; one-byte tamper rejection; legacy compatibility; text passthrough;
  omitted disk fallback; precedence; and fail-closed malformed input.
- Independent parent validation on `2026-09-08` passed `npm run test:artifact-pipeline` at `47/47`, `npm run
  typecheck` with exit `0`, scoped ESLint with `0` errors (`267` standing warnings), exact diff hygiene, runtime
  oracles `134/134`, production build at `1,848` modules, built `dist/server.cjs` artifact selftest `94/94`, linter
  selftest `153/153`, and official 9.00 corpus census `81/81` with zero applicable fatal errors. The first corpus
  attempt incorrectly reached unrelated Deckwright on port `3000` and returned HTTP `401`; the accepted rerun used
  the known installed Forge authority at `59838`. An intermediate test-only TypeScript narrowing error was retained
  as a failed attempt, corrected, and rerun green.
- The temporary source and production-proof servers were stopped. Platform policy rejected deletion of the isolated
  `148,690`-byte production-proof root after its exact Temp containment and dead-port checks passed; retain
  `C:\Users\Moshi\AppData\Local\Temp\x4forge-b119-prod-proof-c9cadacac4314431b77ca92df6c380a0` as explicit
  disposable residue rather than bypassing the restriction. Installed Antigravity sidecar PID `4316` remains live
  on `59838` and X4 remains stopped.
- **Checkpoint status at this pre-corrective boundary:** the byte-integrity repair is `VERIFIED` at
  focused/static/integration layers. The serial E2E/precommit, production package/install, corrected real-mod deploy
  plus independent full-tree byte census, and final native zero-warning proof were the next gates at that time; the
  completed corrective close below records them. No capability-map delta had yet been recorded at this boundary.

### DURABLE PROJECTION CHECKPOINT — byte repair remains partial

- **GitHub owner:** issue #41 remains open. Partial checkpoint comment `5580924546` was created and read back with the
  `0.0.76` false-green, exact recovery fingerprint, focused repair evidence, and remaining release/native gates.
- **Notion owner:** page `3b84618e-d15b-8190-821e-c0eb96f43d5a` was updated in place and read back at `In Progress` /
  `Partial`, with both review dates at `2026-09-08`, GitHub comment `5580924546`, and the byte-authoritative repair as
  the newest dated section. No completion or GitHub-close claim was written.
- **Google Current Status:** the checked-in file-backed trusted-read bridge scanned document
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, at revision
  `ANLCKQmKoGurKNtB-GPpsYuOt5vFZWz67zzhB6id8aBb5dZPPjCnjQgM3Ox-lS6Ce7u9iUvtxkBLyXtowzfp1kl8wqe3r8zUqKFozsOWHidl`
  with zero protected or opaque controls. A revision-guarded update changed six unique status paragraphs exactly once
  and appended a peer `HEADING_2` checkpoint. Paragraph/style readback verified the heading and body at final revision
  `ANLCKQn8JuPfEOM2TKFjk9tqPQMefrRtXNOmsqerh7i_KoHgSkw7uF_9U36yEwx239h451QSfZEreiBheKDh8BlTlUSdzr_Rnsfj_DHw7iXw`.
  Trusted-read evidence is retained under
  `artifacts/google-docs-trusted-read-b119-20260908-byte-repair-a3/`.
- **Projection AAR trigger:** two loader-only trusted-read attempts failed before any Google read or write because the
  connector runtime lacked `atob` and `TextDecoder`; the accepted third attempt used an equivalent byte-checked
  decoder. Connector success was not accepted until exact occurrence counts, revision IDs, paragraph text, and heading
  style were independently read back. Repository Markdown remains authoritative.

### REVIEW / CORRECTIVE RELEASE CANDIDATE — `0.0.77`

- Fresh-eyes review found no blocking defect in the repair. Graphify resolves the shared conversion boundary to all
  five relevant consumers: deployment preview, loose/catalog compile, release preparation, the server integration
  selftest, and the release handler. Workspace sanitization preserves the explicit encoding marker; canonical padded
  Base64, empty bytes, legacy markerless binary entries, text passthrough, omitted disk fallback, and malformed/tampered
  negatives are covered. No artifact caller was found still forwarding the JSON representation directly.
- The scrollbar-warning review also remains clean: it emits only after one compatible first-row freeze boundary and
  unique in-range literal coverage of every column; explicit false, an automatic column, dynamic values, duplicate or
  out-of-range indexes, post-freeze assignments, and incompatible branches/contexts do not produce the warning.
  Automated `reviewctl` was unavailable because this repository has neither the command nor `.reviewctl` rules; the
  project-native type/lint/oracle/fixture gates remain the declared automated review surfaces.
- Exact native Luna `01a07fe9-1e2a-76b1-81e3-0d9af34dc594` changed only the three existing release owners and was
  closed after terminal `VERIFIED`. `vscode-extension/package.json` is now `0.0.77`; `release-notes.json` retains
  published `0.0.76` and adds the corrective `0.0.77` date/bullets; the supported generator places both versions in
  newest-first order in `CHANGELOG.md`. Generator and selftest (`17/17`), JSON/changelog assertions, and owned-path
  `git diff --check` pass. Parent selftest also passed `17/17`; its first metadata assertion used an incorrect historical
  changelog title, and the second retry had a PowerShell quoting error. Neither mutated a file. The corrected exact
  assertion passed. The subsequent package, publication, install, E2E, real-mod byte census, and native rerun are
  recorded as completed in the corrective close below; final source commit remains a parent action.

### CONTINUATION / RECONCILED PLAN — relocatable isolated E2E ports (completed)

- **Baseline:** the preceding promotional turn created a Discord card but changed no B119 product or release state.
  Fresh host inspection on `2026-09-08` confirms X4 is stopped, installed Forge `0.0.76` remains live on `59838`,
  source metadata remains `0.0.77`, and the changelog selftest is `17/17` with owned-path `git diff --check` green.
  Unrelated Deckwright servers currently own `3100` (PID `49000`) and `3000` (PID `51192`) and together retain about
  `3.0 GiB`; they are outside this task and must not be stopped, reused, or mutated.
- **Reconcile:** Playwright's isolated stack is otherwise correctly self-owned, but `playwright.config.ts` fixes its
  web/API ports at `3100/3101`, and six specs plus two iframe fixtures embed those origins directly. The existing
  `PLAYWRIGHT_BASE_URL` override changes only browser navigation and therefore cannot relocate the complete API/proxy
  contract. No existing complete-stack alternate-port owner was found.
- **Bounded implementation:** add strict task-specific web/API port overrides while preserving `3100/3101` defaults;
  expose one shared pair of loopback origins; replace only the E2E hardcoded consumers; and extend the existing
  ephemeral-environment selftest. Invalid, duplicate, or live-stack `3000/3001` selections must fail closed. Do not
  change Forge production code, product behavior, package metadata, Deckwright, installed Forge, or any live workspace.
- **Acceptance / negative path:** default imports retain exact `3100/3101`; an override pair such as `3200/3201`
  reaches Playwright navigation, Vite proxying, API webServer, fixture helpers, direct requests, and iframe fixtures
  coherently; malformed/out-of-range/equal/protected selections are rejected deterministically. Focused selftest,
  typecheck, diff hygiene, then the authoritative serial E2E gate on confirmed-free alternate ports must pass with a
  complete green verdict and `treeGone=true`; post-run census must prove Deckwright PIDs/listeners and the installed
  Forge listener/workspace were untouched. This harness repair is required only to unblock the existing B119 gate and
  does not weaken or replace any product acceptance criterion.

### IMPLEMENT / FOCUSED VALIDATE — relocatable isolated E2E ports

- Exact native Luna `01a08001-97cd-7b21-b0bf-e8bcf16c4b26` changed only nine declared harness paths, reached terminal
  `VERIFIED`, and was closed immediately. `playwright.config.ts` now resolves strict own-data decimal overrides
  `X4_FORGE_E2E_WEB_PORT` / `X4_FORGE_E2E_API_PORT`, retains exact `3100/3101` defaults, exports one loopback origin
  pair, and refuses malformed, fractional, zero, out-of-range, equal, inherited, accessor-backed, or protected
  `3000/3001` selections before startup. A conflicting `PLAYWRIGHT_BASE_URL` also fails closed instead of splitting
  browser and server authority.
- All direct request helpers and both native-host iframe fixtures now consume the shared origin exports; no literal
  `http://127.0.0.1:3100` or `:3101` remains in the checked harness boundary. Worker validation passed the default and
  `3200/3201` selftests, all declared negative cases, matching/conflicting base-URL checks, TypeScript, and scoped diff
  hygiene. Independent parent reruns passed both selftest profiles, reproduced the expected base-URL refusal, found
  zero hardcoded origin leftovers, and passed scoped `git diff --check`.
- **Current status:** the bounded harness repair and authoritative full serial E2E are `VERIFIED`; the suite passed
  `106/106` on `3200/3201` with complete `verdict/treeGone`, and the live workspace plus unrelated listeners remained
  unchanged. The worker's first selftest edit had a syntax failure before correction, so this is a triggered AAR:
  retain exact failed-attempt accounting and never treat a blank worker wait as terminal. No product, installed game,
  mod, or remote projection was changed by the harness unit.

## 2026-09-08 CORRECTIVE RELEASE / NATIVE RERUN CLOSE — `0.0.77`

### PLAN

- **Bounded unit:** reconcile the already executed corrective `0.0.77` release, repaired real-mod deployment, native
  X4 rerun for the exact shipping `aic_sheet.lua -> sheet.display` path, and the completed external readbacks into this
  plan, `BACKLOG.md`, and `SESSION-HANDOFF.md`. This is a records-only reconciliation; it does not authorize another
  package, deploy, game launch, evidence rewrite, remote update, commit, or push.
- **Assumptions / authoritative references:** source/release/native close commit
  `bf03ed9e504b530b054db753bc46faf5ea329208` is already pushed and is the exact named evidence commit. GitHub owner
  issue `KennyG1990/X4_Forge #41` remains open; final checkpoint comment is
  `5585124340`, and its body contains current `0.0.77` evidence with two open owner-close boundaries. Notion owner
  page `3b84618e-d15b-8190-821e-c0eb96f43d5a` was updated and read back as `In Progress / Partial`; it contains the
  commit and GitHub comment, and Notion has no revision ID. Google Doc
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, was read back at revision
  `ANLCKQnoHPL-JGrvYPUGVeCg4BaeRsI_kFTcXvKjgR3EfCfMn7eokIvbTYRVy3LouxQ12D1Y8GJeryOQ5mbbvcGQ0nFfuBKJPlnpDgCC6B-S`;
  its top lines and appended `HEADING_2` record the same bounded-verified / overall-partial boundary. The shipped
  X4 9.00 Helper/widget corpus remains layout authority.
- **In scope:** record the exact source commit, GitHub comment/body state, Notion page/status, Google tab/revision
  readback, durable status, remaining gates, and parent next action in the three owned repository records.
- **Out of scope:** production/test code, mod or game directories, retained screenshots/logs, Git metadata, new
  external connector operations, global workflow AAR, new package/deploy/game activity, and any claim of universal C++
  acceptance, arbitrary Lua/Helper/widget parity, or complete twelve-reference reconstruction.
- **Risks / authorization:** documentation can overstate one native surface as a product-wide result, and outdated
  status language can hide the completed gates. The rollback is textual: preserve prior dirty files, inspect the
  three-record diff, and restore only this documentation edit if the parent rejects it. No external side effect is
  performed by this unit.
- **Acceptance contract:** the corrective release/native rerun is `VERIFIED`; the supplied literal brief is `6/6
  VERIFIED`; overall B119 remains `IN_PROGRESS / PARTIAL`; the three records carry the exact source commit and
  external readbacks, preserve the full twelve-reference/current-game census and universal arbitrary-Lua/Helper/widget/
  C++ gates as open, describe the source commit and projections only as completed evidence, and invent no ID, revision,
  or hash.
- **Required validation:** run `git diff --check` on the three repository-owned docs; search all three for the exact
  commit, GitHub comment, Notion page/status, complete Google revision, partial boundary, and remaining gates; verify
  the current sections contain no stale source-commit or external-projection status; compare `git status --short` with
  the captured pre-edit baseline and confirm only the three owned records were added as changes. Do not run precommit,
  E2E, build, game, deploy, package,
  publish, or external connector operations for this reconciliation.
- **Evidence locations:** stable VSIX at
  `F:\DEV_ENV\X4_Forge\vscode-extension\x4-forge-studio-0.0.77.vsix`; retained native evidence under
  `F:\DEV_ENV\X4_Forge\dev-docs\b119-ai-influence-dogfood\in-game-20260908-scrollbar-clean\`; plan, backlog,
  handoff, `F:\StarForge\wiki\x4-forge\capability-map.md`,
  `F:\StarForge\wiki\x4-forge\aar-log.md`, and the UI quick reference are the durable records.

### VALIDATE

- **Source / static:** the repaired deployed and source `aic_sheet.lua` are both `12,626` bytes with SHA-256
  `A09A66B4BF98491B627304FD0F198B3893A21F9EE18BF8AA0979BB82220D4E34`. The real-mod deploy passed all `11` checks.
  Its independent whole-tree census found `124` identical common files and only the intentional `.forgekeep`
  difference. The temporary `pipeline_test` launcher also passed all `11` checks and an exact source/deployed
  four-file census. These are byte-authoritative deployment results, separate from Forge's internal receipt.
- **Package / install:** stable `0.0.77` was built, published exactly once on OpenVSX, independently downloaded
  with exact local/public parity, installed in Antigravity, and passed installed runtime oracles `134/134`. The
  retained local VSIX is `26,321,722` bytes with SHA-256
  `D1349AC2A3D43FEFD07CAA64BF262FFF4D4F10DEE6E38F453DC0EDAC737486F6`.
- **Integration / harness:** full isolated E2E passed `106/106` on `3200/3201` with complete `verdict/treeGone`
  and unchanged live state. Precommit passed before this final documentation close.
- **Native visual / game log:** X4 9.00 visibly rendered the repaired full AI agreement sheet through the native
  Helper/widget/C++ route at drawable `2544x1353` (Steam capture `2544x1354`), UI scale `1.0`. Visible content is
  `TERMS OFFERED`, ref `B119-FIXTURE-0001`, four clauses/notes, `WHAT THIS COSTS YOU`, four delta rows, and three
  native buttons. The retained screenshot
  `F:\DEV_ENV\X4_Forge\dev-docs\b119-ai-influence-dogfood\in-game-20260908-scrollbar-clean\x4-native-agreement-sheet-2544x1354.jpg`
  is `553,321` bytes / SHA-256
  `989C03A39F162F8A42121243797896084EBFBB64650C3A08B8CD9E01FE961C7B`; the retained log is `16,859` bytes / SHA-256
  `5C00FFB818A23BB19B84D67D4373F06EE199329343BB01755217BABF3B14AB2F` at
  `F:\DEV_ENV\X4_Forge\dev-docs\b119-ai-influence-dogfood\in-game-20260908-scrollbar-clean\debuglog-current-session.txt`.
- **Scoped log census:** the current session has exactly one each of launcher armed, dependency-ready,
  fixture-ready `clauses=4 diff=4`, open-requested, `[AICHAT][SHEET] display DONE clauses=4`, and launcher opened.
  It has zero `reserveScrollBar`, `DisplayView`, `Failed to set up the view`, `stack traceback`, `Lua Error`, launcher
  refusal, or timeout diagnostics. This proves the tested source/path/profile, not universal engine acceptance.
- **Cleanup / negative paths:** temporary deployment recovery was consumed; game `pipeline_test` is absent and X4
  process count is `0`. The scratch four-file fixture was restored exactly: `content.xml` `367` bytes /
  `23A7E9...A5034`; README `210` bytes / `31B80A...C871`; `ui.xml` `273` bytes / `655331...1689`; Lua `5,488`
  bytes / `C1D9CD...2718E`. Only two temporary source files changed during proof, and both were restored through
  Forge strict CAS.
- **CAS negative:** strict Forge CAS compares digest strings lexically to its lowercase digest. An uppercase-equivalent
  `expectedSha256` reproduced a false `409 FILE_CHANGED` with no mutation; the lowercase canonical digest succeeded.
  This is a Forge tooling gotcha, not an X4 engine law.

### REVIEW

- **Corrective release / native rerun:** done and evidenced as `VERIFIED` across source/static, package/public,
  installed runtime, independent deployment bytes, isolated E2E, native visual, current-session log, and cleanup.
- **Supplied literal brief:** `6/6 VERIFIED`.
- **Overall B119:** deliberately `IN_PROGRESS / PARTIAL`. The full twelve-reference AI Influence
  reconstruction/current-game visual census remains open, as do universal C++ acceptance and arbitrary
  Lua/Helper/widget coverage. The evidence does not justify a universal 1:1 or all-Lua parity claim.
- **Durable records:** the capability map gains the bounded byte-authoritative/native-sheet delta; the project AAR
  records the triggered lessons; cards 9 and 15 are updated in place and cards 61-62 add only the nonduplicate CAS
  and Steam launch-evidence lessons. BACKLOG and SESSION-HANDOFF now agree with this status.
- **External / source boundary:** GitHub #41 remains open; final checkpoint comment `5585124340` and the current
  `0.0.77` issue-body evidence retain two open owner-close boundaries. Notion owner page
  `3b84618e-d15b-8190-821e-c0eb96f43d5a` reads back `In Progress / Partial` and contains the source commit and
  GitHub comment; Notion has no revision ID. Google Doc
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, reads back at revision
  `ANLCKQnoHPL-JGrvYPUGVeCg4BaeRsI_kFTcXvKjgR3EfCfMn7eokIvbTYRVy3LouxQ12D1Y8GJeryOQ5mbbvcGQ0nFfuBKJPlnpDgCC6B-S`;
  its top lines and appended `HEADING_2` carry the same bounded-verified / overall-partial boundary. Source/release/
  native close commit `bf03ed9e504b530b054db753bc46faf5ea329208` is already pushed and remains the exact named evidence
  commit. These three records form the records-only close; the close uses
  exact staged-path selection and final local/configured-upstream/direct-remote parity. The parent's final report and
  current Git state are the evidence. This record intentionally does not invent or chase its own commit hash.

### CLOSE

- **Status:** `VERIFIED` for the corrective `0.0.77` / native X4 sheet unit; `PARTIAL` for overall B119, which
  remains `IN_PROGRESS / PARTIAL`.
- **What changed:** this plan now records the final release, package/install, independent real-mod census, native
  screenshot/log, cleanup, negative-path, review, AAR evidence, exact source commit, and external readbacks; the
  current B119 checkpoint and handoff are synchronized within the three owned paths.
- **What was not changed:** no implementation source, tests, mod/game files, evidence artifacts, Git metadata, or new
  remote service state. Historical entries and unrelated dirty/showcase artifacts remain preserved.
- **Capability-map delta:** one evidenced delta for byte-authoritative real-mod deployment and the exact repaired
  agreement-sheet native path, with an explicit boundary against universal claims.
- **Remaining concerns:** complete twelve-reference/current-game census and universal arbitrary-Lua/Helper/widget/C++
  acceptance.
- **Suggested records-only close title:** `B119: reconcile 0.0.77 native-X4 close records`.

### AAR

- **Triggers:** stale durable-writer inventory was corrected truthfully; uppercase SHA lexical false conflict was
  reproduced; the first round-trip assertion checked nonexistent `ok` instead of success; Steam displayed a custom-
  launch-arguments modal; browser-only mcp CUA required fallback to native `@oai/sky`; repeated PowerShell
  foreach-pipeline parser mistakes occurred; output was overbroad; the first post-write hash assertion used
  intermediate pre-final-edit values and was rerun with the final values; OpenVSX propagation lag was handled without
  republish; locked SQLite was excluded from the whole-tree hash; unrelated showcase artifacts were preserved.
- **Sustain:** keep source/static, package/public, installed runtime, independent deployment bytes, native visual,
  current-session log, and cleanup as separate authorities. Require an external full-tree census after real-mod
  deploy, exact lower-case CAS digests, current-session log isolation, and explicit scope boundaries before claiming
  a native result.
- **Improve work / approach:** correct stale status claims as part of the same close, record negative-path evidence
  without relabeling it as an engine failure, and close the disposable launcher/fixture only after exact restoration.
  Preserve historical checkpoint details while marking the latest close as authoritative.
- **Improve tools:** reduce read output before parallel inspection; use one quoting-safe PowerShell form at a time;
  treat a launch command's exit/no-log result as incomplete until the native Steam/X4 modal, process, window, and
  current-session log are observed; keep OpenVSX propagation waits read-only and never republish an accepted version.
- **Highest-risk evidenced weakness:** a verified package or native sheet can be overgeneralized into universal X4
  or design-parity truth. The exact tested `aic_sheet.lua -> sheet.display` path at one profile is now real evidence,
  but runtime-built surfaces, the remaining references, and arbitrary Helper/widget/C++ behavior remain unproven.
- **Evidence:** this plan; the retained native screenshot/log directory; stable VSIX size/hash above; source/deployed
  `aic_sheet.lua` size/hash above; E2E `106/106`; installed oracles `134/134`; real-mod `11/11` plus independent
  `124`-common-file census.
- **Durable lesson:** no global workflow AAR delta. The reusable artifact-byte lesson is already promoted in the
  installed `learning-from-failures` skill; this project AAR is the durable project-specific record.
- **Fresh-eyes correction:** removed the self-invalidating pre-commit state claim from the handoff and plan; an initial
  exact-marker check then exposed split/inconsistent invariant wording, which was normalized before final validation.

## 2026-09-08 CONTINUATION — twelve-reference readback and bounded `1e` correction

### PLAN / ACCEPTANCE CONTRACT

- **Bounded unit:** correct only the source-authored `1e` agreement-sheet chrome that the supplied reference specifies
  unambiguously: the two headings, ASCII idempotency wording, and `40/40/20` action proportions. Perform the source
  mutation through the installed Forge Source Editor's issued source/CAS controls, then prove the resulting current
  Canvas, complete-mod validation, exact deploy bytes, and native X4 rendering. This is the first source-backed delta
  after the full reference census; it is not permission to redesign gameplay or rebuild the renderer.
- **Assumptions and unresolved facts:** the compact `1d`/`1e`/`1f` PNGs are cropped panel references. Their README
  dimensions remain authoritative at the declared `2560x1440` design resolution; treating the crop width as the game
  viewport and widening the sheet to roughly 83% would be a false fix. Dynamic party names, clauses, save deltas, and
  tones remain runtime-owned. `1f` still has no deterministic price-reaction contract.
- **Authoritative references:** direct one-image-at-a-time inspection of all twelve supplied files; the handoff README
  (`1e`: centred 1140 px sheet, `PROPOSED AGREEMENT`, `WHAT CHANGES IN YOUR SAVE`, three footer actions); current
  `aic_sheet.lua`; configured X4 9.00 Helper/widget/Zekton corpus; installed Forge `0.0.77`; the retained native X4
  screenshot and current-session log from the corrective close.
- **In scope:** replace `TERMS OFFERED`; replace `WHAT THIS COSTS YOU`; identify the transaction as `tx ... -
  idempotent` using ASCII-safe punctuation; change the footer's equal thirds to an exact ten-column `4/4/2` split;
  update causal exact-source fixtures only when the legitimate source hash/geometry changes require it; validate and
  deploy through existing Forge owners.
- **Out of scope:** `1a`; a second comm renderer; `1f` mechanics or fabricated probabilities; runtime copy/data
  changes; player/faction naming not supplied by current runtime data; hub/comm redesign; arbitrary-Lua coverage;
  universal C++ frame acceptance; weakening any lint or source-authority gate; another OpenVSX release in this unit.
- **Risks and authorization boundaries:** an invalid column/span change can make X4 reject the complete frame; a stale
  source edit can overwrite newer workspace bytes; preview success can be mistaken for game proof. The user has
  already authorized Forge/game writes and native X4 validation. Source and deployed hashes remain separate until the
  guarded real deploy. Rollback is the exact pre-change `aic_sheet.lua` byte identity: `12,626` bytes, SHA-256
  `A09A66B4BF98491B627304FD0F198B3893A21F9EE18BF8AA0979BB82220D4E34`, still present independently in both the
  Forge workspace and installed extension at baseline; reverse the four issued edits and redeploy if any required gate
  fails.
- **Acceptance criteria:**
  1. Forge issues current source-edit authority for exact `aic_sheet.lua -> sheet.display`; each accepted mutation is
     CAS-bound and no unrelated byte changes.
  2. The edited source contains `PROPOSED AGREEMENT`, `WHAT CHANGES IN YOUR SAVE`, ASCII `tx ... - idempotent`,
     `addTable(10)`, footer spans `4/4/2`, and no new linter error or unresolved structural inconsistency.
  3. The exact source replays through Source -> Layout -> Scene -> Paint -> Canvas at `2560x1440`; the mounted Canvas
     is nonzero, visibly shows both headings and the wider/wider/narrower footer, and still says `Not verified in game`.
  4. Complete-mod validation and deploy-verify dry-run pass; real deploy produces byte-identical source/deployed
     `aic_sheet.lua` and leaves every unrelated mod file unchanged.
  5. Native X4 displays the edited sheet with all four clauses, all four save-delta rows, all three usable actions, no
     clipping introduced by the footer split, and zero scoped frame/view/Lua failures in a current-session log.
- **Required validation and negative path:** exact source-edit selftest/fixture updates; layout/scene/paint/canvas/lint
  focused suites implicated by the changed source; TypeScript and scoped lint if Forge tests change; Forge project
  validation; deploy-verify dry-run/apply; source/deployed whole-tree census; installed Forge visual inspection; native
  X4 visual/interaction/log inspection. Re-run the `addTable(24)` whole-frame refusal oracle and verify the edited
  `addTable(10)` stays clean. A stale or mismatched source CAS must refuse without mutation.
- **Evidence locations:** append under
  `dev-docs/b119-ai-influence-dogfood/reference-census-20260908/` and a native-X4 child directory; record exact commands,
  hashes, screenshots, and logs here before any close projection.

### BASELINE / RECONCILE

- **Forge revision:** `859e81fbad829242ddd5e13232617b0269099e28`, equal to configured upstream. Forty-five
  pre-existing unrelated dirty rows remain outside this unit. Installed `0.0.77` sidecar reports port `61534`; X4 is
  stopped and installed `pipeline_test` is absent.
- **Source/deploy identity:** the six principal AI UI Lua files are pairwise byte-identical between
  `F:\DEV_ENV\projects\Mods\X4Mods\x4_ai_influence` and the installed extension. `aic_sheet.lua` is exactly the
  pre-change size/hash above.
- **Direct visual readback:** the earlier multi-image view was discarded because its output truncated. All twelve
  supplied files were reopened individually and visually inspected in this continuation; all ten retained current-X4
  surface captures were then reopened individually. The observed classification is:

| Reference | Direction / owner | Current evidence | Reconciled status and exact gap |
| --- | --- | --- | --- |
| `00-brief` | design-system authority | direct reference inspection | Governs flat chrome, palette, widget-only construction, and honest gated states; not a screen. |
| `00-vanilla-reference` | native-X4 authority | direct reference inspection | Confirms flat blue bars, dense rows, state colour, and live-scene composition; not a screen. |
| `1a` | alternate comm direction | none required | Deliberately unsupported because `1b` is selected; do not render both. |
| `1b` | `aic_menu.lua -> menu.display` | `x4-current-source-1b-main.jpg` | Native accepted. NPC and wheel remain visible; the narrower plate is a deliberate measured keep-out adaptation. Rail/transcript density and some hierarchy remain divergent. |
| `1c` | `aic_comm.lua -> comm.display` | `x4-current-source-1c-expanded.jpg` | Native accepted. Three regions exist, but body fill, populated transcript/leverage hierarchy, spacing, and reference density diverge. Runtime-empty data is not a renderer failure. |
| `1d` | proposal contract across compact `aic_menu` and expanded `aic_comm`; current image owner is `aic_comm.lua -> comm.display` | `x4-current-source-1d-inline-proposal.jpg` | Expanded `aic_comm` is native-accepted and intentionally owns exactly three payment choices with no `REVIEW`. Its mismatch is header/tx/five-term/footer copy and semantics. Compact `aic_menu` `REVIEW`/`END` behavior is untested by this image; auto-promotion remains untouched and sheet-transition ownership remains unresolved. |
| `1e` | `aic_sheet.lua -> sheet.display` | retained installed Forge replay and `in-game-20260908-scrollbar-clean/x4-native-agreement-sheet-2544x1354.jpg` | Source/Forge/X4 path is proven. Headings, idempotency wording, and equal-third footer differ from the reference; this unit corrects only those source-backed deltas. |
| `1f` | no shipping owner | direct reference inspection | Data-blocked and deliberately unimplemented. No authoritative accept/counter/break-off probability contract exists. |
| `1g` | Dossier branch in `aic_hub.lua` | `x4-current-source-hub-dossier.jpg` | Native accepted. Faction/data regions render, but the icon rail, bounded body fill, selected-faction composition, row density, and typography diverge. |
| `1h` | Influence branch in `aic_hub.lua` | `x4-current-source-hub-influence.jpg` | Native accepted with honest empty-state copy. Reference meters/chooser/receipts require populated runtime data; panel fill and hierarchy still diverge independently. |
| `1i` | Intel + News branches in `aic_hub.lua` | `x4-current-source-hub-intel.jpg`; `x4-current-source-hub-news.jpg` | Both native tabs render. Intel lacks reference filters/meters/bounds; News is a compressed ledger rather than headline/body/action rows. |
| `1j` | Fleet + Settings branches in `aic_hub.lua` | `x4-current-source-hub-fleet.jpg`; `x4-current-source-hub-settings.jpg` | Both native tabs render. Honest empty Fleet data is distinct from its missing receipt-table composition; Settings exposes live state but differs in rows/actions and density. |

- **Existing capability reused:** `X4UiSourceEditor`, `x4UiSourceEdits`, `x4UiLayoutProgram`, `x4UiScene`,
  `x4UiPaintPlan`, `x4UiCanvasRenderer`, `x4UiLint`, artifact/deploy owners, and the current game-verification state. No
  parallel parser, renderer, linter, scenario system, or writer is allowed.
- **Couplings checked:** source literal/structural edit authority; exact-source fixture hashes and issued operation IDs;
  ten-column span legality; source/workspace/deploy identity; preview/current-game truth separation; native frame
  acceptance and scoped logs.
- **Capability-map delta:** no delta at plan time. The new census strengthens evidence but does not add a capability.
- **Plan change:** the census did not justify a broad redesign. It identified a small fully authoritative `1e` delta
  that can exercise the complete author/edit/preview/deploy/native loop before larger comm/hub visual work.
- **Reconciliation / scope change (2026-09-08):** the evidence-commit boundary exposed that repository `text: auto`
  can silently rewrite native CRLF debug-log evidence during ordinary exact-path staging, so artifact-byte correctness
  requires a repository-owned `.gitattributes` rule in this continuation. Rollback is to remove only the added
  `dev-docs/**/debuglog*.txt binary` pattern; the parent can then restage the exact log path with the raw-index
  correction if needed. No captured log bytes, screenshot bytes, index, or Git metadata are changed by this scope.

### IMPLEMENT

- The installed Forge Source Editor issued the exact `aic_sheet.lua -> sheet.display` source/CAS authority. The bounded
  source correction changed only the specified agreement-sheet chrome: `TERMS OFFERED` became `PROPOSED AGREEMENT`,
  `WHAT THIS COSTS YOU` became `WHAT CHANGES IN YOUR SAVE`, the transaction line now uses ASCII `tx ... - idempotent`,
  and the footer changed from equal thirds to `addTable(10)` with spans `4/4/2`. The four retained
  `reserveScrollBar=false` changes were preserved. The current source/deployed Lua is LF-only, `12,655` bytes, and
  SHA-256 `CD687E78F4D957DF95DBF1F645692CF9DFF105A9680F68547C68223D392F7695`.
- The exact source was replayed through the existing Source -> Layout -> Scene -> Paint -> Canvas owners. Both
  data-present branches were selected, both loop counts were set to `4`, and all `55/55` exact sample controls were
  populated. No renderer, parser, linter, gameplay, runtime data, mod architecture, or game files were changed by
  this bounded correction.

### VALIDATE

- **Forge project validation:** `ok: true`; `29` files including `7` Lua files; `0` errors; `5` direct warnings and
  `10` full-context warnings; `0` new warnings versus baseline. The AI dry-run planned `0` adds, `124` overwrites,
  `0` deletes, and `6` preserves, with only the managed source sheet changed.
- **Deploy and byte census:** the guarded real deploy passed all `11` checks. Recovery was
  `deploy-mtssjb13-d04d986bcca06e24`, the resulting fingerprint was
  `3dd16a6ed40cefb222649ac7834c2b128c764cddf9e34ac10b4ad5eb81c55edd`, and source, staging, and deployed
  `aic_sheet.lua` were exact `12,655`-byte / `CD687...F7695` matches. The independent whole-tree comparison found
  `124` common files and `0` mismatches.
- **Installed Forge visual proof:** installed Forge `0.0.77` was inspected in the real `x4 AiLive` workspace at
  `Expert -> HUD & Lua UI`. The readback was `rendered/current`, mounted from the accepted raw paint plan, target
  `sheet.display`, profile `x4-ui-editor-default` at `2560x1440`, Helper scale `1.4`, native bitmap `2560x1440`,
  export-ready, and still `Not verified in game`. The visible canvas showed both new headings, `TX-CAUSAL`, the party
  line, all four clause/note rows, all four cost/value rows, and three footer actions with wider/wider/narrower
  proportions. The Forge export download timed out; no durable Forge PNG was saved and none is claimed here.
- **Native X4 proof:** the temporary `pipeline_test` launch used the exact AI sheet and passed all `11` checks, then
  the scratch fixture was restored and the game target was absent. Native X4 9.00 visibly shows both new headings,
  the ASCII idempotent transaction wording, four clauses, four save-diff rows, three buttons, and a `40/40/20` footer
  with no clipping. Durable screenshot evidence is
  `dev-docs/b119-ai-influence-dogfood/reference-census-20260908/in-game-agreement-sheet-current/x4-native-agreement-sheet-current-2560x1392.png`
  (`1,535,566` bytes, SHA-256
  `2AEE12CC76F02E75C44FA11747485014A849C1FB9FEAB5051AD41BC008C8ACC3`). The current-session log is
  `debuglog-current-session.txt` in the same directory (`16,859` bytes, SHA-256
  `EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826`); it has exactly one expected launcher
  marker and one expected sheet marker, with zero refused/timeout, scrollbar, `DisplayView`, setup-view, traceback,
  or Lua Error signatures.
- **Focused and negative validation:** PaintPlan `213/213`, LayoutKernel `34/34`, Scene `179/179`, CanvasRenderer
  `171/171`, Linter `153/153`, and PreviewPipeline `122/122` passed. The linter retained the `addTable(24)` refusal
  and clean `addTable(10)` result. `npm run typecheck`, scoped ESLint, and exact diff hygiene passed. The current
  selftest reconstructs the exact historical `A09...D34` contract and the current `CD687...F7695` byte/hash and
  heading/transaction/footer assertions. Deep Scene/Paint replay remains the historical fixture; current deep replay
  proof is the live installed Forge canvas.
- **Restoration:** scratch `content.xml` is `367` bytes / `23A7E9A5D789DD31B5BFBFDCF7D9A6B63CB33971170C3C0E64438C77B52A5034`,
  `ext_01.lua` is `5,488` bytes /
  `C1D9CD8580C6175E95C543259A2AB19F8B463282BF48B2229EB6013D6052718E`, README is `210` bytes /
  `31B80A5145A9E9EBAF252C91DF24D58DE29B5BED76BAECC6FB6839E4EDF1C871`, and `ui.xml` is `273` bytes /
  `655331A4423A550532042B23C8E60141A60DCC0E1C42D4DE6DA653DAAD1C1689`. A stale CAS produced HTTP `409` with no
  mutation; the guarded write returned HTTP `200`; restored-fixture validation reported `0` errors / `0` warnings.

### REVIEW

- **Requirement 1 — issued authority and bounded mutation:** done and evidenced. The exact source/CAS path was used;
  no unrelated source bytes or files were accepted by the dry-run/deploy census.
- **Requirement 2 — source correction and lint:** done and evidenced. Both headings, ASCII `tx ... - idempotent`,
  `addTable(10)`, and footer spans `4/4/2` are present; the `24`-column refusal remains closed and the current lint
  result has no new error or unresolved structural inconsistency.
- **Requirement 3 — Forge canvas:** done and evidenced by the installed-app visual readback and populated `55/55`
  scenario inputs. It remains Forge preview proof and retains `Not verified in game`; no Forge export PNG exists.
- **Requirement 4 — complete validation and deployment:** done and evidenced by project validation, dry-run, `11/11`
  deploy checks, exact source/staging/deployed bytes, and the independent `124`-common-file / `0`-mismatch census.
- **Requirement 5 — native X4:** done and evidenced for the tested `aic_sheet.lua -> sheet.display` route, one current
  profile, and the retained screenshot/log. This is not universal C++ acceptance or arbitrary Lua/Helper/widget
  coverage.
- **Overall B119 boundary:** deliberately `IN_PROGRESS / PARTIAL`. The full twelve-reference/current-game visual
  census and broader arbitrary-Lua/Helper/widget/C++ coverage remain open. There is no claim of full B119 completion,
  pixel-perfect parity, or saved Forge export.
- **Durable records:** this plan, BACKLOG, the overwritten SESSION-HANDOFF, the new evidence receipt, and the project
  AAR are the records surfaces for this close; no new UI KB card was added. `no capability-map delta`; the existing
  capability is strengthened by evidence rather than extended.
- **Google Docs correction and final projection state:** the first revision-guarded append inserted at index `145585`,
  incorrectly treating `endIndex-1` as the terminal newline; it was the prior paragraph's final period. Readback
  showed that paragraph missing its period and the new final paragraph ending with two periods. A second
  revision-guarded batch inserted the missing period at `145585` and deleted the extra period after shifted indexes.
  The final Google Doc readback is document `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, revision
  `ANLCKQlkjRNrBOBicsiCrOHxl6dbIHou63qo8wwCmaIrSSnTF1QHuPsI-7CRVMlv8mg45yMKzku-WwE02RH0VC_2MfNmQ3JuHiC_XfQ2YXP3`,
  paragraph count `722`, with the new `HEADING_2` at indexes `145587-145635` and a correct final boundary paragraph
  ending with one period. This was an external-document index error, not a product/runtime failure.
- **Completed source and external projections:** AI Influence source commit `a4ff27814bb964f9fefce26cc05b38cccf8f66c1`
  and Forge substantive commit `73a0067ff7068c493de6625fe014a3893d17d7cd` are pushed with local, configured-upstream,
  and direct-remote parity. GitHub #41 remains open with verified checkpoint comment `5589908501`
  (`https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5589908501`). Notion page
  `3b84618e-d15b-8190-821e-c0eb96f43d5a` reads back `Status In Progress` / `Evidence Grade Partial`, with both exact
  commits, the GitHub comment, and the new `1e` section at top; Notion exposed no revision ID. All three external
  projections are complete for this checkpoint.

### CLOSE

- **Status:** `VERIFIED` for the bounded B119 `1e` agreement-sheet correction unit; `IN_PROGRESS / PARTIAL` for the
  overall B119 program.
- **What changed:** repository records now capture the exact current source/deployed identity, Forge editor proof,
  native X4 screenshot/log, byte census, focused validation, negative-path restoration, and the preview/export/game
  truth boundaries.
- **What was not changed:** no TypeScript, Lua, source, test, mod, game, screenshot, log, Git metadata, capability map,
  global workflow AAR, or external service record was modified by this documentation unit.
- **Completed source/projection state:** the AI Influence source commit `a4ff27814bb964f9fefce26cc05b38cccf8f66c1` and
  Forge substantive commit `73a0067ff7068c493de6625fe014a3893d17d7cd` are pushed; local HEAD, configured upstream, and
  direct GitHub remote matched for each. The committed native log at `73a0067` remains `16,859` bytes / SHA-256
  `EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826`, and the committed screenshot remains
  `1,535,566` bytes / SHA-256 `2AEE12CC76F02E75C44FA11747485014A849C1FB9FEAB5051AD41BC008C8ACC3`. Final manual
  precommit and the commit hook passed; Graphify background refresh completed with no pending graph changes.
- **External readback:** GitHub #41 remains open with verified checkpoint comment `5589908501`
  (`https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5589908501`). Notion page
  `3b84618e-d15b-8190-821e-c0eb96f43d5a` reads back `Status In Progress` / `Evidence Grade Partial`, contains both
  exact commits, the GitHub comment, and the new `1e` section at top, and exposes no revision ID. Google Doc
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, reads back at final revision
  `ANLCKQlkjRNrBOBicsiCrOHxl6dbIHou63qo8wwCmaIrSSnTF1QHuPsI-7CRVMlv8mg45yMKzku-WwE02RH0VC_2MfNmQ3JuHiC_XfQ2YXP3`,
  paragraph count `722`; its new `HEADING_2` is at indexes `145587-145635`, and the final boundary paragraph is
  correct with one period. The failed-first/corrected Google append was an external-document index error, not a
  product/runtime failure. All three external projections are complete. The records-only commit remains a parent
  action; this close must not name its future SHA.
- **Rollback/checkpoint:** restore the six owned documentation paths to their pre-edit bytes; the source rollback remains
  the independent pre-change `12,626`-byte `A09A66...D34` identity if the parent elects to reverse the source unit.
- **Suggested close title:** `docs(b119): reconcile agreement-sheet close projections`.

### AAR

- **Triggers:** one bulk browser fill timed out after `120 s` and left `17/55` values; five bounded batches completed
  `55/55`. Nested editor scrolling initially produced blank/misaligned captures until the actual canvas was scrolled
  into view. Two recursive `rg` scans against giant rollout JSONL files consumed about `785 MB` and `1.286 GB`; the
  processes were verified and terminated. A redaction mistake exposed a local Forge bearer token in tool output; no
  token or secret is reproduced in this record.
- **Evidence-integrity trigger:** before the pending evidence commit, exact-path `git add -f` applied the repository
  `text: auto` filter to the native log: the working/native artifact remained `16,859` bytes / SHA-256
  `EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826` with `230` CR and `230` LF bytes, while the
  staged/index blob became `16,629` bytes / SHA-256
  `5E2BE22E13150BDB0338AA7F5D0F242C82BDFBF1827A3126DCE808AC8FF6B3C9` with CR bytes removed. Hashing the staged
  blob caught it before commit; only that staged path was corrected with an exact no-filter raw blob, restoring
  `16,859` bytes / `EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826` with `230` CR and `230` LF.
  Check staged/committed evidence from the index/blob, not the working file; this is a Git/evidence-packaging hazard,
  not an X4-engine or Forge-rendering failure.
- **Durable fix / scope change:** the repository-owned `.gitattributes` rule `dev-docs/**/debuglog*.txt binary` now
  supersedes reliance on the one-off no-filter raw-index workaround for future native-log staging. The failed filtered
  identity (`16,629` bytes / `5E2BE22E13150BDB0338AA7F5D0F242C82BDFBF1827A3126DCE808AC8FF6B3C9`) and corrected
  native identity (`16,859` bytes / `EC759E2279DEC3DAD3C0DA694A51C1A920F04480B3527ED6E7DF94831067B826`)
  remain incident evidence. Rollback is removal of the single pattern; the parent can restage the exact path raw if
  needed.
- **Sustain:** treat `rendered/current` as source/profile identity freshness, not proof that every runtime-dependent
  scenario input is populated. Require exact branch/loop/sample readback, durable native screenshot/log evidence, and
  independent deployment bytes before promoting this path.
- **Improve work / approach:** use bounded browser fill batches, scroll the real canvas before capture, and keep the
  current installed Forge proof distinct from native X4 proof. Preserve the complete-scenario `55/55` census alongside
  the visual receipt.
- **Improve tools:** search exact pointed files and bounded line ranges; never chase abbreviated hashes recursively
  through rollout JSONL. A first post-edit marker probe used PowerShell backtick-escaped needles and falsely reported
  a missing marker; the single-quoted exact readback passed. The first follow-up spawn wrapper also failed before
  spawning because Markdown backticks were embedded in a JavaScript template literal; a joined plain-string retry
  succeeded. Treat redacted tool output as sensitive and keep secrets out of durable records.
- **Highest-risk evidenced weakness:** a `rendered/current` preview can be fresh and visually plausible while still
  lacking runtime-dependent scenario inputs. This is a reproduced Forge-editor gotcha, not an X4-engine rule.
- **Google Docs projection trigger:** the first revision-guarded append inserted at `145585`, incorrectly assuming
  `endIndex-1` was the terminal newline; it was the prior paragraph's final period. Readback showed the prior
  paragraph without its period and the new final paragraph with two periods. A second revision-guarded batch inserted
  the missing period at `145585` and deleted the extra period after shifted indexes. Final readback is document
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, revision
  `ANLCKQlkjRNrBOBicsiCrOHxl6dbIHou63qo8wwCmaIrSSnTF1QHuPsI-7CRVMlv8mg45yMKzku-WwE02RH0VC_2MfNmQ3JuHiC_XfQ2YXP3`,
  paragraph count `722`, `HEADING_2` indexes `145587-145635`, and a correct one-period final boundary. This was an
  external-document index error, not a product/runtime failure.
- **Evidence:** the receipt README under
  `dev-docs/b119-ai-influence-dogfood/reference-census-20260908/in-game-agreement-sheet-current/`, the native
  screenshot/log there, and this plan.
- **Completed projection state:** AI Influence source commit `a4ff27814bb964f9fefce26cc05b38cccf8f66c1` and Forge
  substantive commit `73a0067ff7068c493de6625fe014a3893d17d7cd` are pushed with local/configured-upstream/direct-remote
  parity. GitHub #41 remains open with verified comment `5589908501`; Notion page
  `3b84618e-d15b-8190-821e-c0eb96f43d5a` reads back `Status In Progress` / `Evidence Grade Partial` with both commits,
  the comment, and the new `1e` section; Google tab `t.0` reads back at the final revision above. All three external
  projections are complete. No OpenVSX publication belongs to this unit, no capability-map delta or global AAR delta
  was made, and no new UI KB card was added. The records-only commit remains parent-owned; do not name its future SHA.
- **Durable boundary:** the next source-backed B119 unit is the remaining twelve-reference/current-game visual census
  with corrections only where the source and native evidence justify them; `1f` mechanics remain out of scope.

## 2026-09-08 CONTINUATION — specified `1d` source/reference alignment and right-edge/native proof

### PLAN / ACCEPTANCE CONTRACT

- **Status:** `SPECIFIED`; this is the next bounded unit, before implementation. This planning checkpoint changes
  records only and makes no implementation or acceptance claim.
- **Bounded unit:** reconcile the authoritative `1d` inline-proposal reference with the current `aic_menu.lua`
  source path and the accepted native frame; specify only the unambiguous presentation/source alignment and the
  causal Forge/native proof needed to close it. Keep the existing 1d payment routes and refusal behavior intact.
- **Assumptions and unresolved facts:** the supplied reference is a design contract for labels, row order, action
  count, whitelist presentation, and informational footer; dynamic party, asset, relation, and amount values remain
  runtime-owned. The current auto-promotion into expanded `1c` is an existing user-authored decision. Its transition
  ownership is unresolved and must not be silently removed. The compact `END` omission is a separate right-edge
  symptom; the current image is expanded `1c`, where `END` exists in the title bar and the input intentionally has
  only `SEND`. `1f` has no deterministic price/counter-offer contract.
- **Authoritative references:** the handoff README and
  `C:\Users\Moshi\Desktop\# AI Influence mod UI design\design_handoff_ai_influence\screenshots\1d-gate-inline-proposal.png`
  (SHA-256 `195C20E272EF09AAF00D237C84FD18EB0EF60780EB0F06E39F01EC4F20AC25B9`); the current native evidence
  `dev-docs/b119-ai-influence-dogfood/x4-current-source-1d-inline-proposal.jpg` (SHA-256
  `DB8C29DE3F98C342E36F34BB04999B9CA0E4B1AF7CBAC29E505862E1B1411D79`); the exact current Lua identities below;
  and the existing Forge Source -> Layout -> Scene -> Paint -> Canvas owners and their project gates.
- **In scope:** only unambiguous 1d presentation/source alignment; causal exact-source tests and fixtures; relevant
  branch/loop/sample authority consumption; Forge Source -> Layout -> Scene -> Paint -> Canvas proof; complete-mod
  validation; guarded exact deploy and whole-tree census; installed Forge visual proof; native X4 screenshot,
  interaction, and current-session log; and design/current comparison. Header, term labels, config-key presentation,
  and sample/seed values may change only where source/reference semantics are explicit. The full footer remains
  informational. Preview must retain `Not verified in game`.
- **Out of scope:** runtime/game mechanics, payment dispatch, refusal-as-live-chat behavior, or redesign of the three
  existing action routes; `1f` mechanics or probabilities; invented data; compact-menu `END` repair from the expanded
  screenshot; silent removal of the existing 1c auto-promotion; universal C++/Lua parity; capability-map/AAR-ledger
  edits; external-service changes; OpenVSX unless product/release code changes; and stage/commit/push.
- **Proposal-action rule:** the reference and existing route ownership require exactly three actions and no `REVIEW`
  on both compact and expanded proposal surfaces. Expanded `aic_comm` already owns that shape. If compact `aic_menu`
  contains a fourth `REVIEW`, remove it as a bounded implementation decision supported by the reference and route
  ownership—not as repair of an observed X4 omission. Keep the existing auto-promotion into expanded `1c` untouched
  and record the 1e transition as unresolved/out of scope. Any 1e vocabulary suppression or wording adjustment must
  be separately justified as necessary gate repair and must preserve the 1d reference contract. Do not invent a 1f
  transition or mechanics.
- **Risks and authorization boundaries:** this worker is records-only. A later source edit should use Forge-issued
  source/CAS authority where the Source Editor represents the operation. If it cannot encode a structural deletion,
  the mandated Luna worker may apply a bounded direct source patch, then import, replay, and read back the result
  through Forge and use its source/CAS authority where supported. Record the actual authoring path; do not claim Forge
  authored a direct deletion. Preserve unrelated dirty files. A preview can be fresh without being visible or
  game-verified; native frame acceptance can diverge from reference presentation. No mod, game, deployed, source,
  test, capability-map, AAR, Git, or external-service mutation is authorized by this checkpoint.
- **Rollback/checkpoint:** restore the three owned records to their exact pre-edit bytes: plan
  `244516` bytes / SHA-256 `87E8407E3214869D6429C6FDEEE4FCC2ECDF626BCB7B9FC5C35FACA95E9ACD03`, BACKLOG
  `331217` bytes / SHA-256 `D88654BEBE87749B5FB9C92E84F435BA1E28F54602F36A214CC317F334086B3D`, and SESSION-HANDOFF
  `11568` bytes / SHA-256 `8BC20CC3C9E300E03EB05D02DE945CF4BA68342C148615DC54C5829370601DB6`. The future source rollback
  identity is the exact pre-change bytes/hashes for `aic_menu.lua`, `aic_uix.lua`, and `aic_comm.lua` recorded in
  the baseline below.
- **Acceptance criteria:**
  1. Both compact and expanded proposal surfaces have exactly three actions and no `REVIEW`; existing auto-promotion
     into expanded `1c` is unchanged.
  2. The reference header/tx/term labels are presented, `Whitelist` is always present by its config key, runtime
     values are honest, and green is used only when permitted.
  3. Refusal remains a real NPC-visible chat line, not a silent dismiss.
  4. Exact current source produces a nonzero Forge Canvas with no false-success; relevant branch/loop/sample
     authority is consumed, and the applicable warning remains visible.
  5. The linter retains the `>12` whole-frame refusal and the current legal `<=12` table behavior.
  6. Complete-mod gates and the exact guarded-deploy census pass.
  7. The current X4 session visibly paints the intended proposal block, three actions, and informational footer,
     with zero scoped `DisplayView`, Lua, or traceback failures.
  8. Rollback is demonstrated by the exact pre-change bytes/hashes.
  9. Overall B119 remains `PARTIAL`; `1f` and universal C++ acceptance remain open.
- **Required validation and negative path (planned, not run in this planning checkpoint):** targeted AI
  `commgate`, `commfullgate`, vocabulary, glyph, and Lua gates; relevant Forge LayoutProgram, Scene, Paint, Canvas,
  Linter, and PreviewPipeline tests plus exact-source fixture updates; typecheck and scoped lint; project
  validate/dry-run/apply and an independent whole-tree census; installed Forge visual inspection; native X4
  visual/interaction/current-session log inspection; stale-CAS refusal with no mutation; `>12`-column refusal while
  current legal `<=12` tables remain accepted; and `precommit`. No OpenVSX check is applicable unless product or
  release code changes.
- **Evidence locations:** retain the supplied current image under `dev-docs/b119-ai-influence-dogfood/`; place any
  future 1d Forge/native screenshot, log, fixture receipt, source/deploy census, and comparison record under a
  clearly named `dev-docs/b119-ai-influence-dogfood/1d-inline-proposal-20260908/` child. This plan, BACKLOG, and
  SESSION-HANDOFF are the only records changed by this planning checkpoint.

### BASELINE / RECONCILE

- **Revisions and machine state:** Forge `HEAD == origin/main ==
  835b59d8e8c35e8001526cad8ab90459a703e1a4`; AI Influence `HEAD == origin/master ==
  a4ff27814bb964f9fefce26cc05b38cccf8f66c1`. Both relevant trees are clean in the owned scope; unrelated Forge
  dirty files are user-owned and preserved. X4 is stopped and the machine is quiet.
- **Current source identities:** `aic_menu.lua`
  `4253D9BD9DE4113D4DE0B881DBF5A1E90CAA7B30F735BA925403EBEF7EC47DD7`; `aic_uix.lua`
  `E119ADA60E0BB48A7ACEFC065087A62601A4552389A911238D509F33F570276B`; `aic_comm.lua`
  `88FAB05A79EF33CB28E098081EA6A5E29E8F3B7C4150C39BF38913C51C063511`.
- **[REPRODUCED] Fail-first native evidence:** the current screenshot is expanded `aic_comm.lua -> comm.display`
  (`1c`), which intentionally owns exactly three payment choices and no `REVIEW`. It shows `ON THE TABLE - PAYMENT
  REQUESTED`, `ref AIC-7F31C2`, `Reason given`, `Ships committed`, and `Clearance`. The supplied reference requires
  `PENDING — MILITARY REQUEST` (ASCII-safe equivalent for implementation), `tx aic-7f31c2`, `They provide`, `You
  provide`, `Relation effect`, `Assets used`, `Whitelist`, exactly three actions, and an informational footer. The
  fail-first mismatch is the header, tx, five term rows, and footer copy/semantics—not a missing `REVIEW`. This image
  provides no evidence about compact `aic_menu` `REVIEW` behavior and does not authorize changing auto-promotion.
- **Ownership/right-edge boundary:** the expanded `aic_comm` image intentionally has `END` in the title bar and only
  `SEND` in its input row. Compact `aic_menu` `REVIEW` and `END` behavior remain untested by this screenshot and need
  separate compact-surface evidence; no X4 omission is inferred.
- **Baseline gates (already run, red state retained):** `python tools/commgate.py` is `PASS` with `5` states / `0`
  failures; `python tools/commfullgate.py` is `PASS` with `6` / `0`; `python tools/vocabgate.py` is `FAIL` with two
  pre-existing findings at `aic_sheet.lua:118` for exact reference wording `tx` and `- idempotent`. This planning
  checkpoint does not edit or resolve those findings.

| Surface | Reference contract | Current/native evidence | Disposition for the next unit |
| --- | --- | --- | --- |
| Header and transaction | `PENDING — MILITARY REQUEST`; `tx aic-7f31c2` | `ON THE TABLE - PAYMENT REQUESTED`; `ref AIC-7F31C2` | Align only the explicit header/tx presentation, preserving honest runtime identity. |
| Terms | `They provide`; `You provide`; `Relation effect`; `Assets used`; `Whitelist` | `They provide`; `You provide`; `Reason given`; `Ships committed`; `Clearance` | Use source/reference semantics for labels; preserve dynamic values and do not change mechanics. |
| Whitelist | Always present as `relation_delta_limited`; green when permitted | Current native state exposes an authorized/green clearance | Retain the key and gate colour semantics; no invented permission state. |
| Actions | Confirm, counter, refuse; exactly three; no `REVIEW` | Expanded `aic_comm` intentionally owns exactly three choices and no `REVIEW`; compact `aic_menu` is untested by this image | Require exactly three/no `REVIEW` on both proposal surfaces from the reference and route ownership. If compact removal is needed, treat it as an implementation decision, not an observed X4 omission; leave auto-promotion untouched. |
| Footer and refusal | Informational footer; refusal is conversational | Current footer is informational; refusal must stay NPC-visible | Keep footer informational and preserve live-chat refusal dispatch. |
| Right edge | Compact `END` is a separate concern | Expanded 1c title bar has `END`; input has only `SEND` | Prove/classify separately; do not infer compact omission here. |

- **Existing capability reused:** the current AI Influence source path, Forge Source -> Layout -> Scene -> Paint ->
  Canvas pipeline, exact-source fixtures, linter, complete-mod validator, guarded deployment, installed Forge, and
  native X4/current-session evidence path. No parallel parser, renderer, source editor, fixture system, deployer, or
  mechanics path is in scope.
- **Couplings checked:** source literals and config-key labels; action count and route ownership; refusal dispatch and
  NPC-visible transcript; branch/loop/sample authority and preview warning; source/workspace/deployed byte identity;
  native frame acceptance versus rendered design; expanded 1c versus compact input right-edge behavior; and the
  pre-existing 1e vocabulary gate.
- **Capability-map delta:** none recorded here. The capability map is forbidden to this worker, and this planning
  record claims no new capability.
- **Plan change:** the prior broad twelve-reference continuation is narrowed to the next source-backed `1d`
  presentation alignment and right-edge/native proof unit. The current image is explicitly owned by expanded
  `aic_comm`, so its header/tx/five-term/footer mismatch is separated from untested compact `aic_menu` `REVIEW`/`END`
  behavior. The existing auto-promotion remains untouched and the 1e transition remains unresolved/out of scope.

### IMPLEMENT (planned only; not started)

1. Reconcile exact current ownership across compact `aic_menu.lua -> menu.display` and expanded
   `aic_comm.lua -> comm.display`; read back the relevant header, term, whitelist, action, footer, branch/loop, and
   sample/seed facts through Forge. Use Forge source/CAS editing only for operations it can represent. If compact
   `REVIEW` deletion is structural and unsupported, apply a bounded direct source patch through the mandated Luna
   worker, then import, replay, and read back the exact result through Forge without claiming Forge authored it.
2. Align only labels/config-key presentation and explicit sample/seed semantics. Preserve payment dispatch, the three
   action routes, refusal-as-live-chat, and the full informational footer. If compact `REVIEW` exists, remove it as
   the reference/route-ownership decision; keep auto-promotion unchanged and record the 1e transition as unresolved.
3. Replay the exact source through Layout -> Scene -> Paint -> Canvas with the relevant owner-issued authorities;
   require a nonzero Canvas, retained `Not verified in game`, consumed branch/loop/sample evidence, and no false
   success. Update only causal exact-source fixtures required by the legitimate source/geometry contract.
4. Run complete-mod validation, guarded dry-run/apply, exact source/staging/deployed census, installed Forge visual
   inspection, and a current X4 screenshot/interaction/log session. Restore any disposable fixture exactly.

### VALIDATE (planned only; not started)

- Record every method in the required-validation list above with its exact command/result/evidence path. Do not turn
  the baseline `commgate`/`commfullgate` green state into implementation proof, and do not hide the red vocabulary
  baseline.
- Reject stale or mismatched CAS without mutation; retain the `>12` whole-frame refusal and legal `<=12` table
  acceptance. Confirm no scoped `DisplayView`, Lua, or traceback failure in the current X4 session.
- Keep installed Forge visual proof separate from native X4 proof. The preview warning remains `Not verified in
  game` until exact deploy and current X4 confirmation.

### REVIEW

- **Plan and evidence boundary:** done for this checkpoint; the supplied reference, expanded-`aic_comm` ownership of
  the current native image, current source hashes, header/tx/five-term/footer fail-first mismatch, untested compact
  controls, scope, acceptance, rollback, and required gates are recorded above.
- **Implementation/acceptance:** intentionally not started. All nine acceptance criteria remain open for the next
  implementation worker.
- **Red baseline:** the two `aic_sheet.lua:118` vocabulary findings are pre-existing and remain unmodified; any
  later repair must be separately justified as a necessary gate repair and preserve the 1d contract.
- **Overall B119:** remains `IN_PROGRESS / PARTIAL`; `1f` and universal C++ acceptance remain open.

### CLOSE

- **Status:** `SPECIFIED` for the next bounded `1d` unit; `PARTIAL / IN_PROGRESS` for overall B119.
- **What changed:** only this append-only plan record was extended with the reconciled 1d source/reference contract,
  baseline evidence, future implementation steps, acceptance criteria, negative paths, and validation record.
- **What was not changed:** no implementation/source/test file, AI Influence repository, game/deployed directory,
  capability map, AAR ledger, Git metadata, external service, or runtime state.
- **Rollback/checkpoint:** restore the three pre-edit record hashes listed in the plan contract; future code rollback is
  the exact pre-change Lua bytes/hashes listed above.
- **Suggested records-only title:** `docs(b119): specify 1d source alignment and native proof`.

### AAR

- **Triggers:** review corrected a wrong-surface ownership inference: an expanded `aic_comm` screenshot had been
  attributed to compact `aic_menu`, creating a false X4-omission story. The required baseline vocabulary gate is red
  with two pre-existing findings; the first combined patch was rejected on stale BACKLOG context, the first delete/add
  handoff patch form was invalid, and one read-only final assertion wrapper failed on JavaScript quoting. All were
  corrected or retried without product or scope impact; no implementation command was attempted and no task-caused
  product failure is claimed.
- **Sustain:** keep design/reference, source authority, Forge preview, deploy bytes, native image, and current-session
  log as separate evidence layers; keep the expanded-1c and compact-menu right-edge claims separate.
- **Improve work / approach:** make the action-count and 1e-transition decision explicit before any source mutation;
  use only semantics supported by the reference and current source/runtime.
- **Improve tools:** use exact-source fixtures and Forge import/replay/readback, while distinguishing Forge-authored
  edits from bounded direct Luna structural patches; record the baseline red gate before any future repair; use exact
  local patch context and quoting-safe assertion wrappers; do not use one surface's screenshot as evidence for another.
- **[REPRODUCED] Highest-risk evidenced weakness:** wrong-surface ownership inference. Treating the expanded
  `aic_comm` screenshot as compact `aic_menu` evidence manufactured a false engine-omission claim and could drive the
  wrong structural repair. Every visual claim must name the actual source/target owner before interpreting controls.
- **Durable boundary:** no project AAR ledger, capability map, external projection, implementation, or validation result
  is changed or claimed by this planning checkpoint.

## 2026-09-08 CONTINUATION — installed Forge `1d` false-success and fail-first repair gate

### RECONCILE / REVISED PLAN

- **Status and boundary:** `SPECIFIED` for the next implementation unit; overall B119 remains `PARTIAL / IN_PROGRESS`.
  This append is records-only. The AI source edits and two Forge exact-source selftest edits already uncommitted from
  the active bounded unit are preserved, but are not validated or claimed here.
- **Installed/repository distinction:** the reproduced installed sidecar is Forge `v1.0.509` with extension `0.0.77`.
  It selected exact current `aic_menu.lua -> menu.display`, with `aic_menu.lua` SHA-256
  `6DDA7D81AD7073C405B15DB911AA68777B9DAFA1DE33EE0F56855657C3A3CA07`. This is installed-product evidence only;
  it must not be conflated with current repository source or treated as source/install parity.
- **[REPRODUCED] Installed replay authority:** the UI retained six path choices — `735 then`, `741 then`, `745 then`,
  `807 else`, `827 then`, and `833 then` — plus loops `757=5` and `829=3`; all `29/29` scalar samples were bound.
  The UI still reported `rendered/current`, `session partial`, and `canRender=true`.
- **[REPRODUCED] False-success receipt:** the Program had `91` operations and `13` rows; Scene had `16` widgets and
  `18` texts; Paint had `913` commands and `396` glyph commands, but only `7` tinted glyphs, all from SEND line `858`
  and END line `860`. Scene contained the header, tx, ten five-row label/value strings, footer, SEND, and END, but no
  three proposal action labels.
- **[REPRODUCED] Unavailable color evidence:** header/term/footer `createText` color facts were unavailable. Current
  source and installed runtime both reproduce `TOK.value`/`TOK.label` as source-literal table entries that may have
  been mutated after an opaque local-helper escape; `TOK.header` is actually missing from the `TOK` declaration, and
  loop value color `vc` is unresolved.
- **[REPRODUCED, causal]** Source composition intentionally skips glyph-alpha-blit commands without a tint; this
  explains why proposal text is absent from the bitmap. This is causal evidence, not a hypothesis. The action outer row
  at line `828` applies, but all three expanded line `832/834` operations remain unresolved because the numeric loop
  variable `slot` is not specialized into `(slot - 1) * 4 + 1`, leaving `row[?]` with no applied cell identity. This is
  also causal evidence.
- **Test-gap finding:** prior exact-source tests pinned proposal Scene/glyph counts while explicitly accepting
  unavailable colors; they did not select/assert the action branch, loop, labels, or source-composition pixels.
- **Performance/UX concern:** adding action selections changed sample-catalog identity and cleared prior samples;
  replaying all `29` values through the UI took about `3.5` minutes because every input reran the full pipeline. This is
  not part of the immediate fidelity repair unless acceptance requires it.

### REVISED ACCEPTANCE / IMPLEMENTATION GATE

The following are scoped repair requirements, not completed fixes:

1. Add fail-first exact-current-source tests that reproduce no proposal source-composition pixels and unresolved action
   receivers before repair.
2. Require the existing CallModel owner to retain source-owned literal color evidence through a statically proven
   non-mutating local-helper path; explicit or unknown mutation remains fail-closed. Add the missing `TOK.header` source
   token separately as an actual source defect.
3. Require the existing preview-loop owner to specialize the bounded numeric induction variable so
   `row[(slot - 1) * 4 + 1]` resolves to exact columns `1`, `5`, and `9` for iterations `1`, `2`, and `3`; ownership /
   evidence reciprocity and hostile/stale cases remain strict.
4. Exact `1d` source composition must visibly paint the header, tx, all five term rows, green permitted whitelist,
   informational footer, exactly three action buttons, SEND, and END; it must contain no REVIEW and retain
   `Not verified in game`.
5. Do not fake unknown dynamic colors or paint untinted diagnostic glyphs as source composition.
6. As applicable, require focused CallModel, Layout, Scene, Paint, Canvas, Preview, Session, and SourceEditor tests,
   then typecheck/lint, followed by rebuilt installed-product visual replay before any later deploy/native-X4 step.
   This records-only continuation authorizes neither deploy nor native X4 validation yet.

### CLOSE / ROLLBACK / AAR

- **Validation boundary:** no implementation, deploy, native X4 run, or acceptance validation is run or claimed here;
  `Not verified in game` remains invariant. The next exact action is the fail-first test work above, followed by the
  named focused gates and rebuilt installed replay.
- **Records-only rollback:** restore only the three owned records to their pre-worker bytes captured at this continuation:
  plan `263356` bytes / SHA-256 `23EA493E9DF58EAA48AFB023232B7CE3C45C968FF262DB1E5DD4146C5A5DE4F1`, BACKLOG
  `332731` / `78B2513FDC38E6FD42AB048A4A39E1AA6A8FA2476C7E9025B3611DDBE2D7232E`, and SESSION-HANDOFF `7709` /
  `B297EB9852C54754D8E1519615EBEB256AA8AF0F6A17FA4A3680E5E19DB001F4`. No source, test, product, game, or deploy
  rollback is in scope.
- **AAR trigger:** the installed `rendered/current` receipt was a reproduced false-success and changed the acceptance
  contract. Sustain the source-composition versus diagnostic-paint boundary; improve fail-first exact-source coverage;
  defer the replay-time performance concern unless it blocks acceptance. No completed repair or capability-map delta is
  claimed.

## 2026-09-09 CONTINUATION — SPECIFIED installed sample-edit performance repair

- **Status:** `SPECIFIED`; this addendum records the installed baseline and authorizes a bounded implementation/test
  unit only. It does not claim a repair, source parity, deploy, game validation, or dogfood completion.
- **Installed baseline:** exact `ui/addons/ai_influence_chat/aic_menu.lua`, `90,018` bytes, SHA-256
  `8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD`; the installed Source Editor issued `31`
  sample values across `7` selected paths with `3` loop iterations. One accessibility-tree `setValue` sample edit
  produced FPS `3` and a `13,093 ms` main-thread longtask.
- **Reproduced product defect:** this is observed installed-product jank, not a wall-clock test artifact. The current
  per-control flow commits each sample edit into the accepted session and reruns the full preview pipeline, so the
  observed stall blocks the B119 visual dogfood proof: the editor cannot credibly establish current, interactive
  source-preview evidence while one ordinary sample edit freezes the main thread.
- **Bounded repair / acceptance:** add causal fail-first tests, then make sample controls stage exact typed draft values
  without changing accepted `sampleInput`; an explicit Apply validates and commits the full draft through the existing
  owner-issued catalog/authority, with explicit Reset and fail-closed drift/refusal behavior. Reuse immutable
  source-owner stage-one and reconciled path/loop stage-two previews across sample-only projections; cache keys must
  include every real source, corpus, profile, selection, color, path/loop, binding, and authority dependency. Preserve
  source identity, validators, canvas/export evidence, exact hashes/receipts, `Preview only`, and `Not verified in
  game`; no workspace/source/export/deploy/game writes are in scope.
- **Required proof:** retain the red fail-first receipt here, then run the focused session/component/pipeline/layout/
  paint tests, configured-source Scene test when available, typecheck, scoped ESLint, and owned-path diff hygiene.
- **Fail-first red receipt:** `npx tsx src/lib/x4UiEditorSession.selftest.ts` exited `1` with
  `BATCH_8C1_CORRECTION_SESSION_CAUSAL total=21 passed=20`; the new causal row observed
  `stageOneCatalogReused=false`, `stageTwoSampleCatalogReused=false`, and accepted final sample changes. `npx tsx
  src/components/X4UiSourceEditor.selftest.tsx` exited `1`; the new mounted row issued exactly `31` controls and
  stopped at `mounted sample draft Apply control was not rendered` (the prior `17` rows passed). These are the
  pre-repair red contracts for redundant preview work and per-edit committed sample UI.

## 2026-09-09 CONTINUATION — IMPLEMENTED / VALIDATED bounded sample-edit repair

- **Status:** `VERIFIED` for this bounded source-editor/session unit; overall B119 remains `IN PROGRESS / PARTIAL`.
- **Implementation:** sample controls now retain exact raw strings in an owner-bound draft and do not alter accepted
  `sampleInput` or current preview evidence while typing. Explicit `Apply staged samples` calls the new validated
  full-draft transaction; invalid, missing, stale, or drifted values refuse visibly and retain the last accepted
  state. `Reset staged samples` discards only the draft. Draft visibility requires the exact catalog, binding, and
  authority; source/target/profile/workspace drift therefore clears it fail-closed. `Preview only` and `Not verified
  in game` remain unchanged.
- **Stage reuse:** the existing session owner now holds an owner-local, opaque-token cache for immutable stage-one
  catalog preview and reconciled path/loop stage-two sample-catalog preview. Keys include owner/source identity,
  corpus identity and content boundary, normalized profile, exact selection, color authority/boundary, reconciled
  paths/loops, and their exact binding/authority references. A changed accepted sample reuses those stages and creates
  only the final sample-bound preview; hostile or cache-ineligible data bypasses reuse.
- **Validation:** Session `23/23` causal plus P7 canonical-color `7/7`; mounted Source Editor `18/18`, including
  `31` staged controls, unchanged projection count before Apply, one Apply projection, exact spaced strings, refusal,
  and Reset; Preview Pipeline `122/122`; Layout Program `749` passed / `1` intentional configured-corpus skip
  (`750` total); configured strict Scene `179/179` with MENU/HUB/COMM `3/3`; Paint Plan `213/213`; TypeScript;
  scoped ESLint over the four changed TS/TSX implementation/selftest files; and owned-path `git diff --check` all
  passed. No E2E, build, packaging, install, deploy, game, or external-record operation was run.
- **Invariant review:** exact configured source census continued to report MENU hash
  `8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD`, HUB hash
  `657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F`, and COMM hash
  `5526B6F954859322E3BE266361F4DFC6F3061E1A399897148CB3BB251693483E`; the Scene/ Paint/provenance census and
  permanent game-truth boundary remained green. No capability-map delta. BACKLOG was not changed by this worker.
- **Baseline / rollback:** pre-existing unrelated dirty state was preserved. Rollback is the bounded follow-up diff in
  the two implementation files and their two selftests plus this plan addendum; no source-fixture, workspace, export,
  mod, game, installed, or deploy bytes were written. Only the owned implementation, selftest, and plan paths changed.
- **AAR:** the fail-first red contract was useful and exposed the per-keystroke commit seam. During repair, the
  mounted harness needed browser-like focus/propertychange events and its receipt sanitizer needed explicit fields;
  both were corrected and the final mounted receipt passed. Sustain owner-issued authority checks and deterministic
  projection-count oracles. Highest-risk remaining weakness is that installed visual replay and non-null current-canvas
  proof are intentionally deferred to the parent; this worker's mounted fixture proves evidence identity is unchanged
  while staged, including the valid null-to-null case before accepted samples render. Suggested commit title:
  `B119 batch sample edits through owner-stage reuse`.

## 2026-09-09 CONTINUATION — SPECIFIED MD `cancel_conversation` semantic lint repair

### PLAN / ACCEPTANCE CONTRACT

- **Status:** `SPECIFIED` for this bounded Full-lane unit; overall B119 remains `PARTIAL / IN_PROGRESS`. The
  pre-worker baseline is the existing dirty plan only; the five implementation/test files below were clean.
- **Bounded unit:** extend the existing `mdPitfallLints` -> `runProjectValidation` path with one deterministic,
  blocking semantic rule: every real MD `<cancel_conversation>` must contain `actor` or `template`. Extend the
  existing project-validation summary, flattening, and agent-history summary without creating a parallel validator.
- **Observed authority:** native X4 9.00 reported `[=ERROR=] ... Neither of the attributes 'actor' and 'template' is
  present!` for `md/ai_influence_conversation.xml` line 98, `<cancel_conversation force="true"/>`. X4 9.00
  `common.xsd` routes the element through `conversationactor`, whose two attributes are individually optional; this
  lint is therefore an observed engine semantic disjunction, not an XSD-requiredness claim. Vanilla corpus good shape:
  `<cancel_conversation actor="$Guide"/>`.
- **In scope:** a stable `md_pitfall.*` error code and exact relative file/line finding; actor/template disjunction
  detection with structural source mapping; additive `mdPitfallErrors` summary and corrected warning-only count;
  shared `ok`/flatten/history behavior; focused selftests, API regression coverage, and the named validation gates.
- **Out of scope / non-goals:** runtime debugger/parser changes, XSD edits or claims that XSD enforces the rule,
  context validation beyond the observed actor/template disjunction, warning suppression changes, non-MD lint rules,
  mod/game/live-directory/config/deploy/package/publish/Git changes, and unrelated dirty files.
- **Risks and authorization boundaries:** only the six owned paths may change. XML comments, CDATA/text decoys,
  malformed input, non-mdscript documents, and unrelated tags must remain quiet; no false-success fallback is allowed.
  The unrelated Deckwright process PID 45172 owns TCP 3100; do not kill, reuse, or mutate it.
- **Rollback/checkpoint:** restore each owned file to its pre-edit bytes using these SHA-256 identities: plan
  `F1724E127779D5720C8306FAEA36FFEBC398F66D07809C55E36C14E494A8A334`; `src/lib/mdPitfallLints.ts`
  `8D8B3823E8216CA776599456DDBF789B7295BB3A6F14CEDBC79843C7C00BBA69`; `src/server/projectValidation.ts`
  `C44953CA22B62F0B5E5E586CDE5C7EC2D088945A4F112F4C53423699B59F08B1`; `src/lib/agentHistory.ts`
  `38D1784F80775AA08B4727C13E97C8993E6CA9DB0ECF5CA60A160F46578510D1`; `src/lib/agentHistory.selftest.ts`
  `736E239C773DF1F9F46C6E16A0A621723852562129D1A4649444592B7DE10619`; `tests/e2e/project-validate.spec.ts`
  `4637F2D8FF98FA47201D5C4F7A5EC8A0E0E69D222A7A3813447C4320071E5336`.
- **Acceptance:** real missing-attribute input yields exactly one error with stable code, exact project-relative path,
  exact line, engine-failure explanation, and actor/template examples; actor-only and template-only (with context)
  pass; both absent fail; decoys/malformed/non-MD/unrelated tags do not flag; existing three warnings retain code,
  severity, and behavior; `mdPitfallErrors` and `mdPitfallWarnings` are separate with warnings excluding errors; any
  pitfall error makes `ok=false`; flattening preserves severity/code/filePath/line; history counts and names the first
  pitfall diagnostic; API validation rejects only the bad fixture and accepts the good fixtures.
- **Required validation / negative paths:** first add fail-first tests and capture the causal red receipt; then run
  `runMdPitfallSelftest`, `runProjectValidationSelftest`, `runAgentHistorySelftest`, `npm run typecheck`, scoped
  ESLint for every changed TS/TSX file, and owned-path `git diff --check`. Run focused
  `tests/e2e/project-validate.spec.ts` with workers=1 on the explicitly supported alternate ports 3200/3201 when
  free; preserve the unrelated 3100 owner and verify alternate listeners terminate.
- **Evidence boundary:** record the causal red receipt after fail-first edits, then exact green command results,
  changed-file diff/review, negative-path results, and final status in this plan. This record does not prove real X4
  runtime or player experience; no game or live-mod validation is applicable or authorized.

### BASELINE / RECONCILE

- Existing owner and consumers: `lintMdPitfalls` owns MD pitfall findings; `runProjectValidation` owns shared verdict
  and summary; `flattenProjectValidation` owns flat diagnostics; existing agent-history validation summaries consume
  `summary` plus the first flat diagnostic. `runtimeDebugger.ts` already recognizes the engine signature and is not
  touched. No capability-map delta.
- Current baseline hashes and dirty scope are the rollback checkpoint above. No source/test implementation edits have
  been made at this planning point.

### IMPLEMENT / VALIDATE / REVIEW / CLOSE / AAR

- **State:** not started; fail-first tests are the next action. Do not mark this unit complete until the required
  results are appended below. Preserve overall B119 `PARTIAL / IN_PROGRESS`.

### FAIL-FIRST RECEIPT (pre-repair)

- `npx tsx -e "import { runMdPitfallSelftest } from './src/lib/mdPitfallLints.ts'; const r = runMdPitfallSelftest(); console.log(JSON.stringify(r)); if (!r.allPassed) process.exit(1)"` -> exit `1`; `allPassed=false`, `passed=20`, `total=22`. The two new assertions failed: `cancel_conversation without actor/template is one blocking finding` had detail `[]`, and `cancel_conversation with neither attribute fails` was false. Existing warning and degradation checks passed.
- `npx tsx -e "import { runAgentHistorySelftest } from './src/lib/agentHistory.selftest.ts'; const r = runAgentHistorySelftest(); console.log(JSON.stringify(r)); if (!r.pass) process.exit(1)"` -> exit `1`. The two new assertions failed: current history output was `Validated 1 file — 0 errors, 2 warnings`, so the MD pitfall was neither counted as an error nor named as the first diagnostic.
- The first `runProjectValidationSelftest` invocation did not return within the orchestration window; a second invocation remained responsive while building the configured schema/index path. Its terminal result is recorded below.
- `npx tsx -e "import { runProjectValidationSelftest } from './src/server/projectValidation.ts'; const r = runProjectValidationSelftest(); console.log(JSON.stringify(r)); if (!r.pass) process.exit(1)"` -> exit `1` before the source repair. The new `cancel_conversation_missing_actor_or_template_is_blocking_and_located` and `cancel_conversation_actor_and_template_forms_pass_validation` checks were false; the returned summary had no `mdPitfallErrors` and no semantic finding. The same baseline receipt also reported the pre-existing `literal_13_columns_is_fatal_and_source_located` check false; this unit does not alter that unrelated Lua selftest path.

### FRESH-EYES CORRECTION

- **Runtime wording boundary:** X4 emitted the exact engine `ERROR` for the no-actor/no-template element at startup/load. In the tested session the compact and expanded UI still rendered and `END` closed the conversation. The engine error is non-clean and therefore blocks Forge validation, but this rule does not establish action, whole-file, or whole-frame failure. Finding text and tests use the narrower startup/load diagnostic wording and explicitly avoid rejection claims.

## 2026-09-09 CONTINUATION — IMPLEMENTED / VALIDATED MD `cancel_conversation` semantic lint

### IMPLEMENT

- Added `md_pitfall.cancel_conversation_actor_or_template` to the existing MD pitfall owner. It parses real
  `cancel_conversation` elements and reports the exact opening-tag line and project-relative path. Malformed XML is
  owned by structural/wellformedness validation; when exact source-offset mapping is unavailable, this semantic pass
  skips rather than fabricating a finding. The message cites the observed startup/load engine
  `ERROR`, gives actor/template examples, states the XSD limitation, and does not assert action/file/frame failure.
- Extended the shared validation result with additive `summary.mdPitfallErrors`; warning counts now include only warning
  findings, pitfall errors make `ok` false, and flattened pitfall diagnostics retain `filePath`, severity, code, and
  line. Agent-history validation totals now include `mdPitfallErrors` and name the first flat diagnostic.
- Added fail-first and green coverage for actor/template forms, comments, CDATA/text decoys, non-MD, malformed and
  garbage input, exact source mapping, shared summary/flattening, history wording, and API validation. No runtime
  parser, XSD, mod, game, live directory, config, or unrelated path was changed.

### VALIDATE

- `npx tsx -e "import { runMdPitfallSelftest } from './src/lib/mdPitfallLints.ts'; const r = runMdPitfallSelftest(); console.log(JSON.stringify(r)); if (!r.allPassed) process.exit(1)"` -> exit `0`; `allPassed=true`, `passed=22`, `total=22`.
- `npx tsx -e "import { runAgentHistorySelftest } from './src/lib/agentHistory.selftest.ts'; const r = runAgentHistorySelftest(); console.log(JSON.stringify(r)); if (!r.pass) process.exit(1)"` -> exit `0`; all checks passed, including MD pitfall error counting and
  first-diagnostic naming.
- `npx tsx -e "import { runProjectValidationSelftest } from './src/server/projectValidation.ts'; const r = runProjectValidationSelftest(); console.log(JSON.stringify({pass:r.pass, failed:r.checks.filter(c => !c.pass)})); if (!r.pass) process.exit(1)"` -> exit `1`; the two new MD checks passed, but the pre-existing
  `literal_13_columns_is_fatal_and_source_located` check remains false. The standalone fixture receipt showed the
  existing analyzer output (`x4-ui.add-table-column-limit` warning plus `lua.menu_never_opened` error), confirming this
  is outside the MD unit and was present in the pre-repair fail-first receipt.
- `npm run typecheck` -> exit `0`.
- `npx eslint --no-error-on-unmatched-pattern src/lib/mdPitfallLints.ts src/server/projectValidation.ts src/lib/agentHistory.ts src/lib/agentHistory.selftest.ts tests/e2e/project-validate.spec.ts` -> exit `0`; 0 errors and 8 existing `no-explicit-any` warnings in the two pre-existing implementation files.
- `& { $env:X4_FORGE_E2E_WEB_PORT='3200'; $env:X4_FORGE_E2E_API_PORT='3201'; npx playwright test tests/e2e/project-validate.spec.ts --workers=1 }` -> exit `0`; `7 passed (46.0s)`. Ports 3200/3201 were free before launch and had no listeners afterward. Port 3100 remained owned by the preserved Deckwright PID 45172.
- `git diff --check --` restricted to the six owned paths -> exit `0`. Owned status contains only the plan and five
  implementation/test files; no forbidden path was edited.
- Negative-path result: the MD selftest's comments, CDATA, escaped text, unrelated tag, non-mdscript, malformed, and
  garbage cases produced no new semantic finding. The pre-repair red receipts are recorded above.

### REVIEW

- Missing attributes -> one stable error with exact line/path: done and evidenced by MD, project, and E2E checks.
- Actor and template-with-context -> accepted: done and evidenced by project and E2E checks.
- XSD/runtime wording boundary -> done; no XSD disjunction claim and no action/whole-file/whole-frame failure claim.
- Existing warning rules and warning-only count -> done by the 22-check MD oracle and filtered summary implementation.
- Shared `ok`, flattening, and history -> done and evidenced by project/history/E2E checks.
- Required project selftest -> partial: one unrelated baseline Lua assertion remains red; no scope-expanding repair was made.

### CLOSE

- **Status:** `PARTIAL` for this bounded unit solely because the required project selftest still has the pre-existing
  Lua assertion failure; the new MD behavior and alternate-port API regression are green. Overall B119 remains
  `PARTIAL / IN_PROGRESS`.
- **Capability-map delta:** none.
- **Rollback:** restore the six owned paths to the pre-edit hashes recorded in the SPECIFIED addendum; no mod, game,
  live-directory, config, deployment, package, publish, or Git mutation occurred.
- **Remaining concern:** the stale `literal_13_columns_is_fatal_and_source_located` project selftest needs a separate
  bounded owner decision; it is not evidence against this MD semantic lint.

### AAR

- **Triggers:** fail-first tests were intentionally red; the first combined implementation patch partially applied and
  required a retry; typecheck caught two new selftest typing errors; a fresh-eyes review corrected an overbroad runtime
  failure phrase; and the existing project selftest remained red. All task-caused issues were corrected; the stale
  Lua assertion is explicitly retained as partial.
- **Sustain:** keep the engine diagnostic, Forge blocking verdict, and in-game action/UI outcome as separate evidence
  layers; use structural parsing plus source-preserving offsets for semantic XML rules.
- **Improve work / approach:** include the exact fail-first receipt before implementation and require tests to guard
  against whole-file or action-failure wording when the observed evidence is only an engine startup/load error.
- **Improve tools:** the project selftest has a stale Lua oracle that should be reconciled in its own bounded task; no
  fix was smuggled into this MD lint unit.
- **Highest-risk evidenced weakness:** a stale unrelated oracle can make a correctly scoped validation run look wholly
  red; retain per-check receipts and distinguish baseline failures from the new acceptance contract.

## 2026-09-09 CONTINUATION — SPECIFIED B119 project-validation column-boundary oracle repair

### PLAN / ACCEPTANCE CONTRACT

- **Status:** `SPECIFIED` for this bounded Full-lane unit; overall B119 remains `PARTIAL / IN_PROGRESS`.
- **Bounded unit:** correct only `runProjectValidationSelftest` so its X4 UI `addTable` fixtures prove the calibrated
  12-clean, 13-warning/nonblocking, and 24-error/blocking boundaries; keep the existing MD `cancel_conversation`
  checks intact and do not change the production Lua linter.
- **Baseline / reconciliation:** current revision `835b59d`; both owned paths are pre-existing dirty files from the
  adjacent MD unit and are preserved. The shared project validator already consumes the production X4 UI analyzer;
  this unit repairs only its contradictory selftest oracle. Official X4 9.00 counterexamples recorded by the
  authoritative production contract include `menu_map.lua:13514`, `menu_scenario_selection.lua:290`, and
  `menu_ship_comparison.lua:303`. No capability-map delta.
- **In scope:** separate literal 13-column warning and literal 24-column fatal fixtures/variables, source-location
  assertions, calibrated warning/error severity and summary/verdict assertions, and this plan record.
- **Out of scope:** production severity or threshold, `src/lib/x4UiLint.ts`, any other source/test/doc, mod/game/live
  directories, external records, and Git mutations.
- **Acceptance:** 12 remains clean/ok; 13 yields exactly one line-3 `x4-ui.add-table-column-limit` warning in
  `ui/warning_columns.lua`, no corresponding error, remains ok, and communicates the unbisected 13-23 range plus
  valid 13-column counterexamples without an ENTIRE-frame refusal claim; 24 yields exactly one line-3 error in
  `ui/too_many_columns.lua`, makes validation not ok, and includes `ENTIRE frame` plus `Failure mode:`. Dynamic
  counts remain one info/unverified nonblocking summary; the percentage warning and both existing MD semantic checks
  remain green; `runProjectValidationSelftest` returns `pass: true`; only the two owned paths differ.
- **Rollback / evidence:** restore the pre-subunit owned bytes by SHA-256 (`projectValidation.ts`
  `6F443B599EDF4DEBF9A15BB7D3D3CF2CC769D898343FEED5AD752981BF1D1B90`; this plan
  `BC19646778616BB3253A94993BA81FF332949F1BB14A8BC7AA4CF8B71736834`). Evidence is the exact command receipts,
  focused test output, and owned-path diff/check recorded below.
- **Required validation / negative path:** cite the existing fail-first receipt where the exact project selftest exits
  `1` only on `literal_13_columns_is_fatal_and_source_located`; run the specified project/UI integration/typecheck/
  scoped-lint/diff-check commands, and verify 12/13/24, dynamic, percentage-warning, and both MD checks in the green
  selftest. Do not run full E2E or precommit in this worker.

### IMPLEMENT / VALIDATE / REVIEW / CLOSE / AAR

- **State:** implemented and validated; implementation remained limited to the selftest fixture/assertion correction
  described above.

### IMPLEMENT

- Added separate literal `warningColumnsLua` (`addTable(13)`) and `fatalColumnsLua` (`addTable(24)`) fixtures. The
  13-column assertion now requires one source-located warning, no X4 UI error, `ok: true`, the calibrated
  unbisected/official-counterexample wording, and no `ENTIRE frame` phrase. The 24-column assertion retains the
  source-located blocking error checks and now proves that boundary explicitly. The existing percentage-warning,
  dynamic-count, and both `cancel_conversation` fixtures/checks remain intact. No production linter or threshold changed.

### VALIDATE

- Fail-first receipt already recorded above and reproduced before implementation with the exact requested command:
  `npx tsx -e "import { runProjectValidationSelftest } from './src/server/projectValidation.ts'; const r=runProjectValidationSelftest(); console.log(JSON.stringify(r,null,2)); process.exit(r.pass?0:1)"`
  -> exit `1`; only `literal_13_columns_is_fatal_and_source_located` was false, while the other six checks were true.
- `npx tsx -e "import { runProjectValidationSelftest } from './src/server/projectValidation.ts'; const r=runProjectValidationSelftest(); console.log(JSON.stringify(r,null,2)); process.exit(r.pass?0:1)"`
  -> exit `0`; `pass: true`; all seven checks passed. The 13-column receipt was exactly one line-3 warning at
  `ui/warning_columns.lua` with no ENTIRE-frame phrase; the 24-column receipt was exactly one line-3 error at
  `ui/too_many_columns.lua` containing `ENTIRE frame` and `Failure mode:`.
- `npx tsx src/lib/x4UiLint.selftest.ts` -> exit `0`; `allPassed=true`, `153/153`.
- `npm run test:x4-ui-integration` -> exit `0`; `21/21 allPassed=true`.
- `npm run typecheck` -> exit `0`; `tsc --noEmit` passed.
- `npx eslint src/server/projectValidation.ts` -> exit `0`; 0 errors and 1 existing `no-explicit-any` warning at
  `src/server/projectValidation.ts:238`.
- `git diff --check -- src/server/projectValidation.ts docs/plans/2026-09-05-b119-ai-influence-visual-dogfood.md`
  -> exit `0`; only line-ending normalization warnings were emitted.
- Negative-path result: 12 stayed clean, dynamic count stayed one info/unverified nonblocking summary, the percentage
  warning stayed nonblocking, 13 stayed warning-only, 24 stayed blocking, and both MD semantic checks stayed green.
  Full E2E and precommit were not run per the work order.

### REVIEW

- 12 clean boundary -> done and evidenced.
- 13 warning/nonblocking boundary with exact code/path/line, calibrated wording, and no ENTIRE-frame claim -> done and
  evidenced.
- 24 blocking boundary with exact code/path/line and known failure-mode wording -> done and evidenced.
- Dynamic, percentage-warning, and existing `cancel_conversation` behavior -> retained and green.
- Production linter severity/threshold and forbidden paths -> unchanged; only the two owned paths were written.

### CLOSE

- **Status:** `VERIFIED` for this bounded oracle-repair unit; overall B119 remains `PARTIAL / IN_PROGRESS`.
- **Capability-map delta:** none.
- **Rollback:** restore the two pre-subunit owned bytes using the SHA-256 identities in the plan contract; no mod,
  game, live-directory, external-record, or Git mutation occurred.
- **Remaining concerns:** no task-scoped acceptance concern remains. Full E2E/precommit are intentionally outside this
  worker's required validation.
- **Suggested commit title:** `test(b119): calibrate project validation table boundary oracle`.

### AAR

- **Triggers:** the intentional fail-first project selftest was red; one additional read-only diagnostic probe failed
  once because shell-escaped Lua quotes reached the parser, then a corrected probe produced the expected 13/24
  receipts. No repository mutation resulted from the failed probe.
- **Sustain:** keep separate fixtures for adjacent severity boundaries and assert both finding metadata and verdict
  semantics through the shared project-validation path.
- **Improve work / approach:** use a fixture name that states the calibrated boundary (`warning_columns` versus
  `too_many_columns`) so a later oracle cannot infer severity from a generic `fatal` variable.
- **Improve tools:** inline PowerShell/tsx diagnostic probes are sensitive to nested quoting; prefer the repository
  selftest command or a quoting-safe fixture path for future probes.
- **Highest-risk evidenced weakness:** a stale project-level oracle can reject valid production-contract behavior and
  obscure unrelated regressions; per-boundary receipts now make that mismatch explicit.
- **Global/project lessons banked:** this plan close is the durable project record; no external ledger or capability-map
  update was in scope.

## 2026-09-09 CONTINUATION — SPECIFIED B119 CLI summary and semantic-lint wording coupling repair

### PLAN / ACCEPTANCE CONTRACT

- **Status:** `SPECIFIED` for this bounded Full-lane subunit; overall B119 remains `PARTIAL / IN_PROGRESS`.
- **Bounded unit:** make the standalone human CLI summary expose the existing authoritative Lua, X4 UI, and MD
  pitfall error/warning counts (including X4 UI unverified/truncated counts), and correct only the
  `cancel_conversation` semantic-lint comments/documentation so skipped source mappings and structurally malformed XML
  are described accurately.
- **Baseline:** the supplied read-only real-mod CLI receipt exits `1`, includes the exact
  `md_pitfall.cancel_conversation_actor_or_template` finding at `md/ai_influence_conversation.xml:98`, but omits all
  three semantic-summary families. Existing selftests require malformed/non-MD input to produce no semantic finding.
- **Reconcile:** `scripts/x4validate.ts` already has a JSON branch that serializes the production result unchanged and a
  human branch reading `result.summary`; the supplied production contract already provides
  `luaErrors/luaWarnings`, `x4UiErrors/x4UiWarnings/x4UiUnverified/x4UiTruncated`, and
  `mdPitfallErrors/mdPitfallWarnings`. `src/lib/mdPitfallLints.ts` already skips when exact offsets are unavailable and
  on parse/non-MD input; only its misleading comments and the prior plan wording need correction.
- **In scope:** three owned paths only: aligned human summary lines in `scripts/x4validate.ts`; comments in
  `src/lib/mdPitfallLints.ts`; this subunit's plan wording and close evidence.
- **Out of scope:** JSON shape/text, lint severity/finding text/parser logic/verdict, the calibrated `addTable` contract,
  structural validation, mod/game/corpus/live-directory/config/installed-extension paths, external records, Git metadata,
  E2E, build, deploy, game, and full precommit.
- **Risks and authorization boundaries:** human-only output must use authoritative summary fields directly and must not
  alter JSON or flattening. The semantic-lint edit must remain comment-only; no real mod or game bytes may be written.
- **Rollback/checkpoint:** restore the three pre-subunit owned files to these SHA-256 identities: `scripts/x4validate.ts`
  `E1B5B3CA4B185F4DAA4C0CE5DE1B323D78119DA0E1629FFE42A96C39A8123E7B`, `src/lib/mdPitfallLints.ts`
  `7BF27E63F0E23513BFF1ECBFCBE471CD3FB7BA4EC56AA71DDCCC47E4C02326D3`, and this plan
  `5841103B9D693CDC9A1807CD082182E2CE7A17879130D52F4D3D930B39868078`.
- **Acceptance:** human output has explicit Lua errors/warnings, X4 UI errors/warnings with unverified/truncated counts,
  and MD pitfall errors/warnings; real-mod validation remains exit `1` with MD pitfall `1/0` and the exact source-located
  finding; `--json` retains the summary fields without human labels; `--help` succeeds; both named selftests pass;
  typecheck, scoped ESLint, and owned-path diff check pass; only these three owned paths change.
- **Required validation / negative path:** record the fail-first receipt, rerun the real-mod human and `--json` commands
  without writing the mod, parse/assert the JSON contract, run `--help`, both selftests, typecheck, scoped ESLint, and
  `git diff --check` on the exact owned paths. Confirm no human summary labels enter JSON and no semantic behavior changes.
- **Evidence:** terminal receipts in the worker report and this plan's `FAIL-FIRST`, `VALIDATE`, `REVIEW`, `CLOSE`, and
  `AAR` sections; no external record or capability-map delta.

### FAIL-FIRST RECEIPT (pre-repair)

- `npm run validate:mod -- "G:\SteamLibrary\steamapps\common\X4 Foundations\extensions\x4_ai_influence"` -> exit `1`;
  human summary reported the older categories only, while `Findings (25)` contained the exact
  `[error] md_pitfall.cancel_conversation_actor_or_template` at `md/ai_influence_conversation.xml:98`. Lua, X4 UI,
  and MD pitfall summary lines were absent.

### IMPLEMENT / VALIDATE / REVIEW / CLOSE / AAR

- **State:** implementation complete; close is `PARTIAL` solely because the pre-existing `--help` path exits `2`
  although this subunit's acceptance says help must succeed. Overall B119 remains `PARTIAL / IN_PROGRESS`.

### IMPLEMENT

- Added human-only summary lines that read `result.summary` directly for Lua errors/warnings, X4 UI errors/warnings
  with unverified/truncated counts, and MD pitfall errors/warnings. The `--json` branch and flattened result were not
  changed.
- Corrected only non-executable wording: malformed/non-MD XML is owned by structural/wellformedness validation, and
  unavailable exact source mapping skips the semantic finding rather than fabricating one. The parser, finding text,
  severity, source mapping, and verdict behavior were not changed.

### VALIDATE

- **Fail-first:** `npm run validate:mod -- "G:\SteamLibrary\steamapps\common\X4 Foundations\extensions\x4_ai_influence"`
  -> exit `1`; the pre-repair summary omitted Lua, X4 UI, and MD pitfall families while the exact semantic finding was
  present at `md/ai_influence_conversation.xml:98`.
- **Human CLI:** the same command -> exit `1`; assertions passed for the exact finding and these lines:
  `Lua errors/warnings: 0/3`, `X4 UI errors/warnings: 0/3 (unverified: 6, truncated: 4)`, and
  `MD pitfall errors/warnings: 1/0`. The real mod was read only.
- **JSON CLI:** `npx tsx scripts/x4validate.ts "G:\SteamLibrary\steamapps\common\X4 Foundations\extensions\x4_ai_influence" --json`
  -> process exit `1`; stdout parsed as JSON, `summary.mdPitfallErrors === 1`,
  `summary.mdPitfallWarnings === 0`, and no human summary labels were present.
- **Help:** `npx tsx scripts/x4validate.ts --help` printed help, but the underlying process returned exit `2`
  (`$LASTEXITCODE=2`; the command runner surfaced nonzero as `1`). This is the existing `process.exit(2)` usage path,
  not a change from this subunit.
- **MD selftest:** `npx tsx -e "import { runMdPitfallSelftest } from './src/lib/mdPitfallLints.ts'; const r = runMdPitfallSelftest(); console.log(JSON.stringify(r)); if (!r.allPassed) process.exit(1)"`
  -> exit `0`; `allPassed=true`, `passed=22`, `total=22`.
- **Project selftest:** `npx tsx -e "import { runProjectValidationSelftest } from './src/server/projectValidation.ts'; const r = runProjectValidationSelftest(); console.log(JSON.stringify(r)); if (!r.pass) process.exit(1)"`
  -> exit `0`; `pass=true`, all `7/7` checks passed.
- **Typecheck:** `npm run typecheck` -> exit `0`; `tsc --noEmit` passed.
- **Scoped ESLint:** `npx eslint scripts/x4validate.ts src/lib/mdPitfallLints.ts` -> exit `0`.
- **Diff hygiene:** `git diff --check -- scripts/x4validate.ts src/lib/mdPitfallLints.ts docs/plans/2026-09-05-b119-ai-influence-visual-dogfood.md`
  -> exit `0`; Git emitted only its existing LF-to-CRLF working-copy warning for the plan.
- **Negative/behavior result:** actor-only/template-only forms, malformed/non-MD/garbage inputs, existing warning rules,
  the real-mod semantic error, JSON fields, and verdict behavior remained as required; no mod/game/live path was written.

### REVIEW

- CLI family counts -> done and evidenced in human output; counts come directly from authoritative summary fields.
- JSON contract -> done and evidenced; no human-only labels or shape changes.
- Semantic-lint wording -> done and evidenced; comments/docs only, with MD selftest `22/22` and project selftest `7/7`.
- Help-success criterion -> partial: existing CLI usage branch returns `2`; changing that adjacent behavior was not part of
  the two-gap work order and was not made by this worker.
- Scope -> three owned paths intentionally changed; no forbidden path was written by this worker; no capability-map delta.

### CLOSE

- **Status:** `PARTIAL` for this bounded subunit solely due the pre-existing nonzero `--help` result; all requested summary,
  JSON, real-mod, selftest, typecheck, ESLint, and diff-hygiene implementation checks passed.
- **Rollback:** restore the three pre-subunit owned bytes using the SHA-256 identities recorded in the SPECIFIED contract;
  no mod, game, live-directory, external-record, or Git mutation occurred.
- **Remaining concern:** coordinator decision required on whether the existing help exit-status mismatch may be handled in
  a separate bounded CLI behavior unit. Full E2E, build, deploy, game, and precommit remain intentionally out of scope.

### AAR

- **Triggers:** intentional fail-first receipt; required help gate reproduced red; two initial tool-call syntax retries;
  one documentation-order correction after review; and a Git line-ending warning. This is a non-clean close.
- **Sustain:** use authoritative summary fields and retain focused semantic/project selftests to prove additive CLI output
  did not change lint behavior or JSON output.
- **Improve work / approach:** the first plan insertion matched a prior repeated commit-title anchor and temporarily split
  that unit's AAR; unique section anchors plus an immediate tail review caught and repaired the record ordering.
- **Improve tools:** nested PowerShell/JavaScript quoting caused avoidable command retries, and the command wrapper normalized
  Node nonzero exit codes; capture `$LASTEXITCODE` inside a successful wrapper when exact nonzero distinctions matter.
- **Highest-risk evidenced weakness:** the existing `--help` exit-status contract conflicts with this unit's stated
  acceptance, leaving an otherwise green implementation `PARTIAL` until the coordinator resolves that scope boundary.
- **Global/project lessons banked:** this plan record only; no external ledger or capability-map update was in scope.

## 2026-09-09 CONTINUATION — SPECIFIED B119 standalone CLI help exit-status repair

### PLAN / ACCEPTANCE CONTRACT

- **Status:** `SPECIFIED` for this bounded Full-lane subunit; overall B119 remains `PARTIAL / IN_PROGRESS`.
- **Baseline:** `npx tsx scripts/x4validate.ts --help` prints usage and exits `2`; `npx tsx scripts/x4validate.ts` prints usage and exits `2`. The current branch combines `!positional.length` with `flags.has("--help")` and always calls `process.exit(2)`.
- **Reconcile:** the standalone CLI already has the authoritative human summary lines and JSON/result paths from the immediately prior unit. This repair changes only usage dispatch so explicit help succeeds without loading a mod; missing or invalid positional input remains a usage/load failure. No validation, JSON, finding, severity, or load-failure logic is to be redesigned.
- **In scope:** `scripts/x4validate.ts` help/missing-argument exit handling and, only if needed, spacing-only alignment of the three existing Lua/X4 UI/MD human summary lines; this plan record's close/AAR.
- **Out of scope:** validation engine behavior, JSON shape/content, finding text/severity, mod/game/corpus/live-directory/config/installed-extension paths, external records, Git metadata, E2E, build, precommit, deploy, game, network, and any non-whitespace summary change.
- **Rollback/checkpoint:** restore the two owned files to their pre-subunit SHA-256 identities: `scripts/x4validate.ts` `CD240302DD199B9C7C1B1D52693D94CC0271FB4AF020D7321E5F017A4A95E47A`; this plan `4E0006E68A369E7FE40D3F01CF335074057BF7F9678C92BB9BF90ADB882643E6`.
- **Acceptance:** explicit `--help` prints usage, does not attempt a mod load, and exits `0`; no-argument invocation prints usage and exits `2`; an invalid/nonexistent positional folder prints load failure and exits `2`; real-mod human validation remains read-only, exits `1`, and retains the authoritative Lua, X4 UI, and MD pitfall summary lines including MD `1/0` and the exact source-located finding; real-mod `--json` remains exit `1`, parses with `summary.mdPitfallErrors === 1` and `summary.mdPitfallWarnings === 0`, and contains no human summary labels; both named selftests remain `22/22` and `7/7`; typecheck, scoped ESLint, and owned-path diff check pass; only the two owned paths are written by this worker.
- **Required validation / negative path:** run every command supplied in the work order, including exact nonzero exit capture; verify help does not reach the load path, missing input remains usage failure, invalid input remains load failure, human/JSON behavior is preserved, and no forbidden path is changed by this worker. Do not run E2E, build, precommit, deploy, game, network, external-record, or other write operations.
- **Evidence:** exact command receipts in the worker report and this plan's `VALIDATE`, `REVIEW`, `CLOSE`, and `AAR` sections; no capability-map delta or external record.

### FAIL-FIRST RECEIPT (pre-repair)

- `npx tsx scripts/x4validate.ts --help` -> exit `2`; usage printed before any mod-load attempt.
- `npx tsx scripts/x4validate.ts` -> exit `2`; usage printed for the missing positional argument.

### IMPLEMENT

- Changed only the existing pre-load usage branch's exit selection: `--help` now exits `0`, while the same branch still exits `2` when no positional argument is supplied.
- Aligned the complete human summary count block with whitespace only; all summary labels and authoritative `result.summary` expressions, including the three prior Lua/X4 UI/MD lines, remain unchanged.

### VALIDATE

- `npx tsx scripts/x4validate.ts --help` -> exit `0`; usage printed and no load-failure text appeared.
- `npx tsx scripts/x4validate.ts` -> exit `2`; usage printed.
- `npx tsx scripts/x4validate.ts "F:\\DEV_ENV\\X4_Forge\\__b119_missing_mod_folder__"` -> exit `2`; printed `No loadable mod files found under:` and the expected extension-folder guidance.
- `npm run validate:mod -- "G:\\SteamLibrary\\steamapps\\common\\X4 Foundations\\extensions\\x4_ai_influence"` -> exit `1`; human output retained `Lua errors/warnings: 0/3`, `X4 UI errors/warnings: 0/3 (unverified: 6, truncated: 4)`, `MD pitfall errors/warnings: 1/0`, and the exact `md_pitfall.cancel_conversation_actor_or_template` finding at `md/ai_influence_conversation.xml:98`. The real mod was read only.
- `npx tsx scripts/x4validate.ts "G:\\SteamLibrary\\steamapps\\common\\X4 Foundations\\extensions\\x4_ai_influence" --json` -> exit `1`; stdout parsed as JSON, `summary.mdPitfallErrors === 1`, `summary.mdPitfallWarnings === 0`, and no human summary labels were present.
- `npx tsx -e "import { runMdPitfallSelftest } from './src/lib/mdPitfallLints.ts'; const r = runMdPitfallSelftest(); console.log(JSON.stringify(r)); if (!r.allPassed) process.exit(1)"` -> exit `0`; `allPassed=true`, `22/22`.
- `npx tsx -e "import { runProjectValidationSelftest } from './src/server/projectValidation.ts'; const r = runProjectValidationSelftest(); console.log(JSON.stringify(r)); if (!r.pass) process.exit(1)"` -> exit `0`; `pass=true`, `7/7` checks passed.
- `npm run typecheck` -> exit `0`; `tsc --noEmit` passed.
- `npx eslint scripts/x4validate.ts` -> exit `0`.
- `git diff --check -- scripts/x4validate.ts docs/plans/2026-09-05-b119-ai-influence-visual-dogfood.md` -> exit `0`; only the existing plan LF-to-CRLF warning was emitted.
- Post-edit SHA-256: `scripts/x4validate.ts` `4960DDCABB4296627A56A96619C786949B75CE9D3CE5F774BB4339C599C875DE`; this plan `5285DA6D80BD1CC4775D2B6AC216849B0F812522A365C6724665AE9B62375FD8`.
- Negative-path result: help bypassed loading, missing input remained usage failure, invalid input remained load failure, JSON stayed machine-only, and validation/selftest verdict and severity behavior remained unchanged.

### REVIEW

- Help success and no-load behavior -> done and evidenced.
- Missing-argument and invalid-folder exit `2` behavior -> done and evidenced.
- Real-mod human summary/finding behavior -> done and evidenced.
- Real-mod JSON shape/summary and absence of human labels -> done and evidenced.
- MD `22/22`, project `7/7`, typecheck, scoped ESLint, and owned-path diff hygiene -> done and evidenced.
- Scope -> only `scripts/x4validate.ts` and this plan were written by this worker; no forbidden path or Git metadata was written, and no capability-map delta exists.

### CLOSE

- **Status:** `VERIFIED` for this bounded CLI repair; overall B119 remains `PARTIAL / IN_PROGRESS`.
- **Rollback:** restore the two pre-subunit owned bytes using the SHA-256 identities in the SPECIFIED contract; no mod, game, live-directory, external-record, or Git mutation occurred.
- **Remaining concerns:** no task-scoped acceptance concern remains. E2E, build, precommit, deploy, game, network, and external-record checks were intentionally not run per the work order.
- **Suggested commit title:** `fix(b119): return success for x4validate help`.

### AAR

- **Triggers:** the first smoke assertion wrapper mishandled PowerShell output arrays; a second wrapper assumed a nonexistent project-selftest `total` field; typecheck required a bounded poll; and Git reported its existing line-ending warning. The underlying CLI and tests were then rerun with corrected assertions and passed.
- **Sustain:** keep help dispatch before target resolution, use authoritative summary fields directly, and assert nonzero child-process exits from inside a wrapper while parsing the actual result shape.
- **Improve work / approach:** test wrappers should join captured output before substring assertions and count the selftest's returned checks instead of assuming an undocumented total field.
- **Improve tools:** long-running typecheck needs explicit session capture/polling; the command runner's initial timeout did not itself provide a terminal exit code.
- **Highest-risk evidenced weakness:** wrapper-level assumptions can falsely report a green implementation as failed or obscure the real exit status; the corrected receipts now distinguish harness errors from product behavior.
- **Global/project lessons banked:** this plan record only; no external ledger or capability-map update was in scope.

## 2026-09-09 CONTINUATION — B119 installed-Forge source replay and native compact/expanded evidence close

### PLAN / ACCEPTANCE CONTRACT

- **Status:** PARTIAL for this bounded evidence close; overall B119 remains IN_PROGRESS / PARTIAL.
- **Bounded unit:** make the observed installed-Forge source replay, native X4 compact/expanded interaction, current-session
  log, and fresh read-only real-mod linter result durable in one evidence folder and align the plan, backlog, handoff,
  capability map, project AAR, and UI gotcha record.
- **Baseline:** Forge HEAD and origin/main were both 835b59d8e8c35e8001526cad8ab90459a703e1a4; the repository had
  unrelated dirty source, test, deletion, and untracked paths, including pre-existing edits to this plan, BACKLOG.md,
  and SESSION-HANDOFF.md. The X4 process was not running; Steam remained open. The specified Forge preview filename was
  absent, but an adjacent same-folder file had the expected 190509 bytes and exact expected SHA256.
- **Reconcile:** the existing B119 source-first/linter and native evidence records already provide the authoritative
  route facts, so this close adds a durable evidence package rather than a second renderer, validator, or mod fix.
  The Forge preview is the pending military-request branch; native compact/expanded captures are the ordinary current
  communication-menu state. The real-mod semantic defect remains present and is a separate write-gated correction.
- **In scope:** the new folder under dev-docs/b119-ai-influence-dogfood/in-game-20260909-source-replay and the six
  named records owned by this worker; read-only identity checks for the supplied artifacts and one fresh read-only
  validate:mod run.
- **Out of scope:** all implementation/test/source edits, mod/workspace/game/installed/config/save/external writes,
  deployment, X4 launch, source repair, external projections, Git mutation, same-state pixel comparison, universal C++
  acceptance, arbitrary Lua coverage, and full twelve-reference completion.
- **Acceptance:** destination artifacts have the expected byte counts and SHA256; README and the plain-text receipt
  separate preview, native, linter, and unproven parity; every record keeps the overall IN_PROGRESS / PARTIAL boundary;
  the real-mod finding is recorded without repair; only owned paths change.
- **Required validation / negative path:** verify source and destination identities; capture the real-mod exit 1 and
  exact summary/finding; confirm the log line evidence and absence of view-failure/traceback markers; run exact-path
  diff-check and re-read owned changes. Do not claim that the semantic error rejected the whole file or frame.
- **Evidence:** dev-docs/b119-ai-influence-dogfood/in-game-20260909-source-replay/README.md and
  x4validate-real-mod-receipt.txt, plus the copied binaries and current-session log.

### BASELINE / RECONCILE

- Inputs B-E matched their expected identities. The specified A path was not present; the same .playwright-mcp
  directory contained one 190509-byte file with the expected SHA256, and that exact-hash source was recorded in README.
- The fresh validation command was read-only and returned exit 1 with Lua 0/3, X4 UI 0/3 (unverified 6, truncated 4),
  MD pitfall 1/0, and md_pitfall.cancel_conversation_actor_or_template at md/ai_influence_conversation.xml:98.
- The current log records the engine diagnostic at line 427, onOpenCommLink at 855/858, OpenMenu returned OK at 876,
  display ENTER at 879, reserveScrollBar diagnostics at 882/885 and 1059/1062, and display DONE at 888/1065. No
  Failed to set up the view marker or stack traceback was present.
- The calibrated table rule remains literal 12 clean, literal 13-23 warning/game-check, and literal 24+ blocking
  from the reproduced whole-frame incident. This is not a universal above-12 rejection claim.
- **Capability-map delta:** the shared validator/CLI semantic rule and this exact native source replay strengthen the
  existing linter/native evidence capability; the external capability map is updated in the same close.

### IMPLEMENT

- Created the stable evidence folder and copied only the four images and current-session log after identity checks.
- Added README.md and x4validate-real-mod-receipt.txt with observed-versus-inferred boundaries and exact receipts.
- Appended this close, the backlog checkpoint, the overwritten handoff, the capability-map delta, the project AAR,
  and the nonduplicate UI KB updates. No source, mod, game, installed, external-service, or Git mutation occurred.

### VALIDATE

- Destination hash readback: all five copied artifacts retained the expected byte counts and SHA256.
- Fresh read-only real-mod validation: exit 1; exact summary families and finding are retained in the receipt.
- Native evidence readback: compact showed NPC info/transcript/three choices/editbox/SEND/END plus controls; EXPAND
  opened full-screen COMM with correspondent/leverage blocks and three choices; END closed the overlay/conversation.
- Retained focused milestones are MD 22/22, project validation 7/7, UI linter 153/153, history 21/21, targeted project
  E2E 7/7 on 3200/3201, typecheck green, scoped lint green, and verified CLI help/missing/invalid behavior.
- Exact-path git diff --check passed with exit 0; it emitted only the existing LF-to-CRLF working-copy warnings for
  the three repo records. Final owned-path readback passed. Broad E2E/build/precommit and external projection readback
  remain parent-owned next actions.

### REVIEW

- Evidence folder and hashes -> done for the copied bytes; the specified Forge preview path discrepancy is explicitly
  retained rather than hidden.
- Forge source replay -> done and bounded to aic_menu.lua -> menu.display, 2560x1440, effective scale 1.4, seven
  branch arms, loop count 3, and 31 samples.
- Native rendering -> done for the observed ordinary compact/expanded state; not evidence for the pending preview state.
- Linter/render relationship -> done and honestly separated: the linter blocks clean validation, while native rendering
  and END evidence do not support a whole-file or whole-frame rejection claim.
- Parity and coverage -> not proven: no same-state pixel comparison, full twelve-reference completion, arbitrary Lua/
  Helper/widget coverage, or universal C++ acceptance.
- Real-mod repair -> deliberately deferred until a fresh write-gate paragraph and explicit authorization.

### CLOSE

- **Status:** PARTIAL for this bounded documentation/evidence close; overall B119 remains IN_PROGRESS / PARTIAL.
- **Rollback:** remove only the new evidence folder and restore only these owned record edits using a reviewed patch;
  no source/mod/game/Git/external rollback was needed or performed.
- **Remaining concerns:** the exact specified preview path is absent even though an adjacent exact-hash artifact was
  retained; native and preview states are unlike scenarios; the real MD semantic defect still makes validation red;
  broad validation, exact-path commit/push, external projection/readback, and the separately gated source correction
  remain open.
- **Suggested parent commit title:** docs(b119): retain 2026-09-09 source replay evidence.

### AAR

- **Triggers:** the specified preview filename was missing, the required real-mod command correctly returned nonzero,
  and this close required reconciliation of stale current-action wording. The evidence boundary was preserved.
- **Sustain:** keep linter verdict, native visual/log evidence, and scenario input identity as separate authorities; use
  exact destination hashes and a manually curated small receipt.
- **Improve work / approach:** name the actual source path whenever a provided evidence filename drifts, and state
  unlike-state comparison limits before discussing parity.
- **Improve tools:** keep one worker on this records-only batch, close terminal work promptly, and capture wrapper exit
  status inside the wrapper when a read-only command is expected to return 1.
- **Highest-risk evidenced weakness:** native rendering can coexist with a semantic error and reserve-scrollbar
  diagnostics, so treating either linter status or a plausible frame as a complete engine verdict can produce a false
  boundary.
- **Global/project lessons banked:** this close is mirrored in the project AAR, capability map, and UI gotcha record; no
  external projection or source correction is claimed.

## 2026-09-09 B119 review-repair unit — SPECIFIED

### PLAN / ACCEPTANCE CONTRACT

- **Status:** `SPECIFIED` for this bounded review-repair unit; overall B119 remains `IN_PROGRESS / PARTIAL`.
- **Baseline:** the owned B119 source and selftests are intentionally dirty at HEAD `835b59d8e8c35e8001526cad8ab90459a703e1a4`; projection `useMemo` currently notifies during render, `cancel_conversation` detail repeats its structured path, and history totals omit authoritative validation families.
- **Scope:** repair only the projection observer timing, diagnostic path prose, and validation-history error/warning aggregation; add focused regression coverage in owned selftests, with the named E2E file only if a direct cross-layer assertion is necessary.
- **Out of scope:** renderer redesign, unrelated behavior, mod/game/installed/config/save paths, deployment, launch, external records, Git mutation, and broad E2E/build/precommit.
- **Rollback:** restore only this unit's reviewed hunks in the owned plan/source/test paths; preserve all pre-existing unrelated dirty work.
- **Acceptance:** render-time projection computation is pure and committed projections reach the freshest observer through an effect; `cancel_conversation` preserves error/code/structured `filePath`/exact line while printing the path once; history counts all specified error families once, honors `activeWarnings`, and uses a deterministic non-overlapping legacy fallback; first-diagnostic naming and clean `0/0` behavior remain intact; only owned paths change; B119 remains `PARTIAL`.
- **Negative checks:** fail-first assertions capture each current defect; mounted projection does not update parent state during child render; X4 UI errors/warnings are not added again to Lua totals; the real-mod CLI finding line contains the path exactly once and the expected overall exit remains `1`.
- **Evidence:** this plan's implementation/validation/review/close/AAR append, focused selftest receipts, fresh read-only CLI receipt, typecheck, scoped ESLint, and exact-owned-path diff hygiene output.

### FAIL-FIRST RECEIPTS

- `npx tsx -e ...runMdPitfallSelftest...` -> exit `1`, `22/23`; the new structured-location assertion observed `md/ai_influence_conversation.xml` still appended in `detail`.
- `npx tsx -e ...runAgentHistorySelftest...` -> exit `1`, `75/79`; the new error-family case observed `5` instead of `9`, active warnings observed `99` instead of `4`, flat fallback observed `8` instead of `2`, and family fallback observed `3` instead of `13`.
- `npx tsx src/components/X4UiSourceEditor.selftest.tsx` -> exit `1`; the new source-contract receipt reported the render-phase observer callback and missing committed-projection effect, so the mounted assertion did not run yet.

### IMPLEMENT

- Made `X4UiSourceEditor`'s projection `useMemo` compute only `sessionOwner.project(sessionInput)` and moved observer notification to a `[projection]` `useEffect`, retaining the fresh callback ref.
- Removed only the duplicated `opts.filePath` prose from the `cancel_conversation` finding; structured `filePath`, exact line, engine semantics, and bounded no-whole-frame wording remain.
- Centralized the specified validation error families and warning fallback families in `agentHistory`; `activeWarnings` and flat-warning precedence are honored without adding X4 UI subsets to Lua totals.
- Added focused MD/history/source-contract regressions and a mounted StrictMode parent-state-update probe. No E2E file was changed.

### VALIDATE

- Fail-first receipts: MD exit `1` at `22/23`; history exit `1` at `75/79`; SourceEditor exit `1` on the two missing projection-contract assertions.
- MD pitfall selftest -> exit `0`, `23/23`.
- Agent history selftest -> exit `0`, `79/79`; first-diagnostic naming and clean `0/0` remain passing.
- Project-validation selftest -> exit `0`, `7/7` after the initial nonexistent-path lookup was corrected to the exported selftest in `src/server/projectValidation.ts`.
- X4UiSourceEditor selftest (`npx tsx src/components/X4UiSourceEditor.selftest.tsx`) -> exit `0`; P7 matrix `19/19`, including no render-phase parent state-update warning under StrictMode.
- Fresh read-only real-mod CLI -> expected exit `1`; 29 files loaded, MD pitfall `1/0`, and the `cancel_conversation` finding line contains `md/ai_influence_conversation.xml` exactly once at `:98`. No real-mod mutation occurred.
- `npm run typecheck` -> exit `0`.
- Scoped ESLint on the five changed TS/TSX paths -> exit `0`, 0 errors and 11 existing `no-explicit-any` warnings in `agentHistory.ts`.
- Exact owned-path `git diff --check` -> exit `0`; only the existing plan LF-to-CRLF warning was emitted.
- Broad E2E, build, precommit, deploy, game, and external-record checks were not run per the work order.

### REVIEW

- Projection purity and committed notification -> done and evidenced by source-contract assertions plus the mounted parent-state-update probe.
- Cancel finding authority -> done: severity/code behavior remains, structured path and exact line remain, and CLI prose has one path occurrence.
- Validation history totals -> done: structural/Lua/unresolved/cross-file/schema/aiscript/MD/diff/rules errors are counted once; `activeWarnings`, flat fallback, complete family fallback, and X4 UI non-duplication are covered.
- First diagnostic and clean behavior -> done by the existing and new history checks.
- Scope and repository hygiene -> done for this worker's writes: the plan and five implementation/test files only; the pre-existing dirty E2E file was not edited. No forbidden path was written or used for implementation.
- B119 boundary -> intentionally remains `IN_PROGRESS / PARTIAL`; broader runtime/game and parent-owned stack gates remain outside this unit.

### CLOSE

- **Status:** `VERIFIED` for this bounded B119 review-repair unit; overall B119 remains `IN_PROGRESS / PARTIAL`.
- **Rollback:** restore only this unit's reviewed hunks in the plan, SourceEditor, pitfall, and history files; all unrelated dirty work remains preserved.
- **Capability-map delta:** no capability-map delta; this repairs existing projection, diagnostic, and history infrastructure.
- **Remaining concerns:** the real mod still has its pre-existing semantic `cancel_conversation` error; no mod repair was authorized. Broad E2E/build/precommit and in-game experience proof remain parent-owned.
- **Suggested commit title:** `fix(b119): defer projection observers and complete validation history totals`.

### AAR

- **Triggers:** all three fail-first checks were red before repair; the first project-validation command used a nonexistent path; scoped ESLint initially rejected a literal-space regex before the focused fix.
- **Sustain:** keep the projection computation pure, centralize authoritative validation-family lists, and test structured diagnostic authority separately from human formatting.
- **Improve work / approach:** locate exported selftests by symbol when the expected filename is absent, and record the exact red receipt before changing implementation.
- **Improve tools:** the project selftest naming/path is not discoverable from the requested filename alone; the existing lint rule also requires counted regex spaces to use quantifiers.
- **Highest-risk evidenced weakness:** validation summary schemas can grow new overlapping families; the centralized explicit lists and X4 UI exclusion reduce silent drift, but future fields still need a focused count regression.
- **Global/project lessons banked:** this plan record only; no external ledger, capability-map, Git, mod, or deployment mutation was in scope.

## 2026-09-09 B119 broad validation/review checkpoint — PARTIAL

### PLAN

- **Lane and bounded unit:** Full lane; durably record the parent coordinator's broad validation and fresh-eyes review
  checkpoint, refresh the current backlog and handoff, and append the project AAR. This worker is records-only.
- **Assumptions and authority:** use the current B119 plan, retained source-replay/native evidence, supplied hashes, and
  the project adapter as authority. The repository is heavily dirty; unrelated work remains user-owned.
- **In scope:** this plan append, one current B119 BACKLOG checkpoint, the complete overwrite of SESSION-HANDOFF.md,
  and one project-AAR append.
- **Out of scope:** implementation and test files, evidence binaries, capability map, UI gotcha records, mod/game/
  installed/config/save paths, Git metadata mutation, commit/push, OpenVSX, GitHub, Notion, and Google Drive.
- **Risks and rollback:** preserve unrelated dirty paths and protected live state; rollback is restoration of the four
  pre-write record hashes supplied for this worker. The monolithic E2E crash and the real-mod semantic finding remain
  explicit red/open boundaries.
- **Acceptance:** every broad result below is recorded without converting bounded green batches into a full-suite green;
  the overall B119 state remains IN_PROGRESS / PARTIAL; the handoff is usable by a fresh agent; no forbidden path is
  changed.
- **Required validation and negative path:** re-read all appended/overwritten sections; run exact owned-record
  diff-check; compare post-write hashes and targeted Git status; retain the wrong-target oracle, transient endpoint,
  accidental unrelated E2E inclusion, repeatable 0xC0000409, wildcard/hash correction, and expected non-Git failure
  as negative-path evidence.
- **Evidence locations:** retained seven-artifact folder
  dev-docs/b119-ai-influence-dogfood/in-game-20260909-source-replay/; this plan; BACKLOG.md; SESSION-HANDOFF.md; and
  F:\StarForge\wiki\x4-forge\aar-log.md.
- **Suggested commit title:** feat(b119): checkpoint source-faithful UI replay and linter.

### BASELINE

- Forge HEAD and origin/main were both 835b59d8e8c35e8001526cad8ab90459a703e1a4. The checkout was heavily dirty
  with unrelated user/previous work. Installed Forge was running at port 60836, PID 23764; X4 was closed and the
  machine was quiet. Port 3100 belonged to unrelated Deckwright PID 45172 and was not touched; the B119 E2E stack used
  3200/3201 and was cleaned.
- Pre-write SHA-256 identities were BACKLOG.md
  1717D0E054F5F2DE023DFD974AD67FD98DAAE225680C963F3B0AC1248C6DF4AA, SESSION-HANDOFF.md
  4E487C7E640EE7E3C0C2B72C2E9B2177E703B20B5CF4A0BBE25F878ED3EAE4CE, this plan
  F010E6BFF01D63B471FE34608311920DC1A2FF1C77E8D4BA336FBD1DF557C4B1, and project AAR
  8435BB6261B923B376419375A113F0B14C3A876F28B7C0F90DD1BBBCBB5F1A7D.
- Protected hashes remained unchanged after every E2E: test-results/.last-run.json
  FFF6299EFB51BA9EF550E500ECC967E972C83E86BE387042C360CAEA7FDBAE29, config.json
  3EC65D540E6763D13D6F8F27D9005F80C3C855B00D3DCFDD5E7330726AE37779, and discovery latest
  F4BB5A9470FFF8CD3BEA434CCF45A420E5A26C7394EE67254068F537FCA86B07.

### RECONCILE

- The existing source-first/linter, installed Forge replay, native X4 route, and review-repair records were reused.
  The fresh-eyes review corrected the sample-panel sentence to: currently applied preview values remain active while
  edits are staged; staged edits take effect only after explicit Apply. The mounted regression asserts the full sentence.
- Review found no production-logic regression in identity-bound authority, transactional sample drafts, finite numeric
  specialization, or detached conditional alternate-creator evidence.
- The broad gate is not equivalent to the bounded behavior inventory: later E2E runs overwrote
  test-results/e2e-verdict.json, so it is not a combined full-suite receipt. No capability-map delta was discovered.

### IMPLEMENT

- Appended this checkpoint, added the current open BACKLOG checkpoint, appended the project AAR, and overwrote
  SESSION-HANDOFF.md with the current state transfer.
- No implementation, test, evidence-binary, mod/game, installed, external-record, or Git write was performed by this
  worker.

### VALIDATE

- npm run typecheck -> exit 0. npm run lint -> exit 0 with 0 errors and 600 warnings.
- First node scripts/oracle-sweep.mjs used the default port 3001 and returned 0/133 fetch failures; this was a target
  selection error, not product evidence. X4_FORGE_BASE=http://127.0.0.1:60836 returned 133/134 after a transient
  xml-source-spans fetch failure; its direct endpoint returned HTTP 200 and 4/4, and an unchanged rerun returned
  134/134.
- Focused SourceEditor was 19/19, including the corrected full Apply sentence; the two-path diff check passed.
- E2E was intentionally kept red at the monolithic-gate level. The first invocation accidentally included the unrelated
  untracked tests/e2e/marketing-showcase.spec.ts, expanded inventory to 107, passed the marketing test, then lost the
  ephemeral API near project-browser: 66 passed, 41 failed, treeGone=true, with live hashes unchanged. The first
  project-browser failure passed alone 1/1. The focused B119 project-validate plus x4-ui-source-editor run passed
  10/10 with zero failures/flakes and treeGone=true. The canonical inventory excluding only that marketing spec ran
  tests 1-74 green, crossed the earlier failure point, then terminated with 3221226505 (0xC0000409) without a
  structured final report. A tail batch ran 31/33 green and terminated with the same code after the SourceEditor
  scale test; two XML tests had not run. xml-patch-merge.spec.ts passed separately 2/2. Thus bounded behavior was
  observed green, but the required monolithic full E2E gate is RED; this is not a 106/106 full-suite pass.
- Every E2E run cleaned 3200/3201 and preserved the protected hashes. npm run precommit:check -> exit 0: tripwires
  0/58; canon mirrors identical; E2E verdict selftest 55/55; Vite lifecycle, product-copy, durable-writer
  (42 filesystem, 11 host-store, 3 browser-output, 47 SQLite statements, 7 transactions, 14 runs, 14 execs,
  2 pragmas), capability contract (12 capabilities, 297 routes, 1 dynamic registrar, 11 MCP aliases, SHA
  bb467...2037c), MCP capability, action-receipt coverage (882 routes, 57 surfaces, manifest SHA 396865...23bb),
  typecheck, and size checks all passed; PRECOMMIT OK.
- npm run build -> exit 0: Vite 1848 modules; dist JavaScript 2.82 MB, gzip 775.64 kB; chunk-size warning only;
  server.cjs 3.5 MB and map 6.6 MB.
- All seven supplied evidence identities were rechecked: forge-preview 497D...E768; compact 6A73...D32; expanded
  F4F1...9BAA; design 195C...5B9; debuglog BCDE...0451; README 248998...47BB; CLI receipt B590...36C0E. The
  first read-only hash command incorrectly passed a wildcard to -LiteralPath and failed; the corrected
  Get-ChildItem | Get-FileHash form passed all seven. A read-only git -C F:\StarForge assumption check failed as
  expected because that directory is not a Git repository; it changed no files.

### REVIEW

- Broad static, oracle, precommit, build, evidence-identity, cleanup, and protected-hash requirements -> done and
  evidenced above.
- Monolithic E2E -> partial/red: two independent canonical boundaries terminated with 0xC0000409, so no combined
  suite receipt or 106/106 claim is valid.
- Product/runtime evidence -> done only for the tested installed-Forge source replay and ordinary native compact/
  expanded rendering and interaction routes. Same-state pending-branch Forge-to-X4 parity, all twelve references,
  arbitrary Lua/Helper/widget coverage, and universal C++ acceptance remain unproven.
- Real mod -> deliberately untouched; md/ai_influence_conversation.xml:98 still has cancel_conversation without
  actor/template and remains a separately write-gated correction.
- External projections and Git -> not performed by this worker and not claimed. No OpenVSX action belongs here;
  installed/public 0.0.77 remains current. No capability-map delta.

### CLOSE

- **Status:** PARTIAL for this broad validation/review checkpoint; overall B119 remains IN_PROGRESS / PARTIAL.
- **Rollback/checkpoint:** restore the four owned records to the supplied pre-write hashes with a reviewed patch. No
  rollback, source write, mod/game write, external projection, commit, or push occurred.
- **Remaining concerns:** the monolithic Windows Playwright/Node 0xC0000409 harness failure remains an open gate/
  backlog issue; the real-mod semantic defect, same-state parity, full twelve-reference census, arbitrary coverage,
  and universal C++ acceptance remain open. Parent must perform exact-path commit/push and external readback.
- **Suggested commit title:** feat(b119): checkpoint source-faithful UI replay and linter.

### AAR

- **Triggers:** wrong oracle target, transient oracle endpoint fetch, accidental unrelated E2E inclusion, repeatable
  monolithic 0xC0000409 termination, an initially incorrect wildcard hash command, an expected non-Git assumption
  failure, and two wording-tightening patch attempts that failed before mutation due to a wrong path/stale context;
  all required explicit reconciliation.
- **Sustain:** separate source/static, installed/runtime, native visual/log, bounded behavior, and monolithic-gate
  authorities; retain cleanup and protected-hash readback; never turn bounded green batches into full-suite green.
- **Improve work / approach:** select the installed Forge port explicitly, exclude only the unrelated untracked test
  by exact path, rerun transient endpoint failures unchanged, and record harness termination boundaries rather than
  inferring a final verdict.
- **Improve tools:** use a wildcard-safe file enumeration before hashing and discover repository ownership before
  issuing Git assumptions; do not cite the overwritten e2e-verdict.json as a combined receipt. One final targeted
  diff-name readback initially misspelled the plan path and was rerun with the exact path.
- **Highest-risk evidenced weakness:** the Windows monolithic E2E process can terminate after substantial green
  coverage without a structured report, leaving a red gate even when every bounded behavior route observed is green.
- **Global/project lessons banked:** this plan and the project AAR only; no capability-map delta and no external
  projection.

## 2026-09-09 POST-COMMIT — source replay/native compact-expanded external projection

### DOCUMENT CLOSE — POST-COMMIT EXTERNAL PROJECTION

- **Bounded unit:** record the completed post-commit external projection for the source-faithful replay/native
  compact-expanded checkpoint while keeping overall B119 `IN_PROGRESS / PARTIAL`. This is a records-only close:
  BACKLOG, SESSION-HANDOFF, this plan, and the project AAR are in scope; no implementation, test, evidence-binary,
  mod, game, installed-extension, deploy, config, save, capability-map, UI-gotcha, OpenVSX, or Git mutation belongs
  here.
- **Commit/readback:** checkpoint commit `09926efdb21271a6098bc5bd379b7ed182667909`, titled
  `feat(b119): checkpoint source-faithful UI replay and linter`, contains exactly 25 paths: 18 tracked
  implementation/record files and 7 exact evidence files, with `4639` insertions and `747` deletions. `HEAD`,
  `origin/main`, and the direct remote matched; the staged index was empty after push. Final manual precommit and
  commit-hook precommit both passed.
- **Current validation:** installed oracles `134/134`; focused B119 E2E `10/10`; isolated XML `2/2`; isolated
  project-browser repro `1/1`; typecheck, lint (`0` errors), precommit, and build green. The required monolithic E2E
  remains RED after repeatable Windows child exit `3221226505 / 0xC0000409` without a complete structured receipt.
  There is no current `106/106` claim; the older `0.0.77` `106/106` result is historical only.
- **Evidence:** `dev-docs/b119-ai-influence-dogfood/in-game-20260909-source-replay/README.md` is the retained
  receipt.
- **External projection readback:** GitHub #41 is OPEN, its body was updated, and checkpoint comment `5603257267`
  reads back at `https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5603257267`. Notion page
  `3b84618e-d15b-8190-821e-c0eb96f43d5a` reads back Status `In Progress`, Evidence Grade `Partial`, and the new
  commit/comment/red-gate section at top. Google Doc
  `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, reads back revision
  `ANLCKQk4F14GwWk68VhKaxI0b21sPVd4KiRw763IijA80qwF_NLRxTF1F0uT9m-UXcveRRZFFDbHR7QqybNTMtYATT7_TVvgaX1XYyD9yw44`,
  `731` paragraphs, one `HEADING_2` named `B119 source replay + native compact/expanded checkpoint — 2026-09-09`,
  the updated repository head, and an intact one-period prior boundary.
- **Review/close:** the external projections are complete for this checkpoint, but overall B119 remains
  `IN_PROGRESS / PARTIAL`. Same-state pending-branch parity, the full twelve-reference census, arbitrary
  Lua/Helper/widget coverage, universal C++ acceptance, monolithic E2E process stability, and the separately
  write-gated real-mod `cancel_conversation` defect remain open. No live mod/game write was performed in this
  projection unit; no capability-map delta or UI-gotcha delta was made.
- **Suggested commit title:** `docs(b119): record post-commit external projection readback`.

## 2026-09-09 — SPECIFIED — bounded monolithic E2E Windows runtime bootstrap

Status: `SPECIFIED / OVERALL B119 IN_PROGRESS / PARTIAL`

Task: document the reconciled Full-Lane plan for a bounded Windows runtime bootstrap that lets the existing
unsharded B119 E2E runner select a verified safe Node runtime before Playwright starts. This is a planning-only
unit; no implementation or test code is changed here.

Lane: `FULL`

### PLAN

- **Bounded unit:** extend the existing `scripts/run-e2e.mjs` owner so the canonical runner remains one monolithic,
  one-worker, verdict-authoritative process while selecting a safe runtime only when required. A small dedicated pure
  module/selftest is permitted only if the bootstrap cannot be tested safely in the existing owner.
- **Assumptions and unresolved facts:** the reproduced differential strongly isolates the system Node/libuv runtime
  as the leading cause of the Windows crash, but the exact native stack remains unavailable. Explicit opt-in runtime
  override precedence is an implementation detail; absent that override, the known installed Codex bundled candidate
  is the only permitted fallback. The safe threshold is Node major `24` and libuv `>=1.52.1`, unless evidence justifies
  a different compatible threshold without weakening the gate.
- **Authoritative references:** this B119 plan; `BACKLOG.md`; `SESSION-HANDOFF.md`; the prior same-machine/process-local
  A/B in `docs/plans/2026-08-10-b119-x4-ui-editor-linter-first.md`; existing `scripts/run-e2e.mjs` verdict,
  lifecycle, retry, report, and Playwright-spawn ownership; and `playwright.config.ts`'s literal `node` webServer.
- **In scope for the eventual implementation:** pre-Playwright runtime identity/candidate validation; one guarded
  relaunch with a private recursion marker; process-local child `PATH` ordering; propagation of the verified identity
  to the runner, Playwright child, and literal-`node` webServer; pure/integration negative coverage; and the exact
  focused-to-full validation sequence below.
- **Out of scope:** a parallel runner; dependency updates; replacing or installing system Node; persistent PATH,
  registry, config, or Maglev changes; sharding; retry/reporter/receipt weakening; product behavior changes; real mod,
  game, corpus, installed-extension, live Forge, or protected-root writes; stopping or reusing unrelated Deckwright;
  and any claim that this plan itself repairs the crash.
- **Risks and authorization boundaries:** candidate discovery must not widen authority through PATH search, untrusted
  environment input, accessors, prototypes, malformed metadata, or arbitrary executable selection. Runtime execution
  is process-local and must not mutate persistent host settings. E2E validation must use ephemeral `3200/3201`, never
  occupied `3100`, and must preserve the live Forge on `60836` and the absent-X4 state.
- **Rollback/checkpoint:** revert exactly the bounded runner/bootstrap/test diff and these three records. Do not revert,
  normalize, or delete unrelated dirty/untracked paths. No system runtime replacement or persistent setting requires
  rollback under this plan.

- **Acceptance contract:**
  1. Reuse the existing `scripts/run-e2e.mjs` owner; do not create a parallel test runner. Add a pure module/selftest
     only if needed for deterministic testability.
  2. On an already-safe runtime, continue directly with no relaunch.
  3. On affected Windows runtime(s), resolve an explicit opt-in override first if designed, otherwise the known
     installed Codex bundled candidate; validate existence, exact executable behavior, Node major `24`, and libuv
     `>=1.52.1` (or a justified compatible threshold), then relaunch once with a private recursion marker and the safe
     runtime directory first in the child `PATH`.
  4. Prove that final runner `process.execPath`, the Playwright child, and the config's literal `node` webServer all
     resolve to the same verified safe runtime.
  5. If the candidate is missing, malformed, unsafe, inaccessible, or identity/recursion validation fails, refuse
     before Playwright/browser/server startup, emit bounded actionable diagnostics, and produce no false-green receipt.
  6. Preserve one worker, retry `=1`, zero-flake policy, reporters, structured receipt oracle, lifecycle ownership and
     teardown, port isolation, and all existing runner arguments.
  7. Tests-first negative coverage must include safe-current-runtime no-relaunch; affected-runtime candidate
     selection/relaunch; missing/unsafe candidate refusal; recursion-marker loop/bypass refusal; exact PATH placement;
     and untrusted/accessor/prototype/environment input that must not widen authority as applicable.
  8. After focused checks, run the current tracked-only unsharded E2E on `3200/3201`. It must complete with a
     structured zero-failure/zero-flake/zero-bad-result verdict, child exit `0`, `treeGone=true`, and no owned
     residues; `3200/3201` must be free afterward; live Forge `60836` must be unchanged; Deckwright's `3100` PID
     `58660` must be preserved; X4 must remain absent; and protected live roots/config must be unchanged.
  9. A deliberately unsupported-runtime fixture must refuse before browser or server startup.
  10. The plan remains `SPECIFIED` until those implementation and runtime receipts exist.
  11. Observed and inferred facts stay separate: the differential is reproduced evidence for runtime association,
      not an exact native-stack diagnosis.
  12. Suggested eventual commit title: `fix(e2e): select safe Windows Node runtime`.

- **Required validation for the eventual implementation:** focused pure/integration selftests first; `node --check`;
  whole-repository typecheck; exact ESLint; diff hygiene; precommit; production build; then one current tracked-only
  unsharded E2E using `X4_FORGE_E2E_WEB_PORT=3200` and `X4_FORGE_E2E_API_PORT=3201`. The final run must include the
  containment and protected-state census in the acceptance contract. Do not change the existing retry, reporter,
  structured-receipt, or one-worker gates to make it pass.
- **Evidence locations:** this section; the updated `BACKLOG.md` and `SESSION-HANDOFF.md`; focused bootstrap receipts;
  the final `test-results/e2e-verdict.json`; and the bounded runtime/containment evidence produced by the implementation
  worker. No new evidence artifact is created by this planning unit.

### BASELINE

- **Revision:** `HEAD == origin/main == 8451c061d27300f0859d231bbc3a898723f24d63`.
- **System runtime:** `C:\Program Files\nodejs\node.exe`, Node `v24.15.0`, libuv `1.51.0`, Windows build
  `10.0.26200`.
- **Known safe runtime:** `C:\Users\Moshi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`,
  Node `v24.19.0`, libuv `1.52.1`.
- **Observed gate state:** the canonical unsharded E2E under system Node repeatedly terminates with Windows
  `3221226505 / 0xC0000409` and no complete structured report. The current B119 record therefore remains
  `PARTIAL`; no current full-suite green claim is authorized.
- **Host state:** port `3100` is occupied by unrelated Deckwright PID `58660`; use free alternate `3200/3201` and do
  not stop or reuse Deckwright. Live Forge is on `60836`; X4 is absent.
- **Existing evidence:** the prior A/B failed under Node `24.15.0`/libuv `1.51.0` and passed under the exact safe
  Node `24.19.0`/libuv `1.52.1`. The ignored evidence-only `runtime-shim/node.cmd` was never wired into
  `npm run test:e2e`.
- **Preservation baseline:** unrelated dirty/untracked paths are not owned by this unit and remain untouched.

### RECONCILE

- **Resources and readers/writers searched:** the existing runner's `process.execPath` Playwright spawn, its report /
  receipt / lifecycle / retry owners, the config's literal-`node` webServer, the prior A/B record, and the current B119
  records. No second runner or persistent runtime-selection mechanism is authorized.
- **Existing capability reused:** `scripts/run-e2e.mjs` already owns verdict parsing, structured receipt validation,
  lifecycle supervision/teardown, one retry, reporter arguments, and Playwright child creation. `playwright.config.ts`
  already owns the one-worker ephemeral webServer and `X4_FORGE_E2E_WEB_PORT` / API-port isolation.
- **Couplings checked:** parent runtime identity -> `process.execPath` -> Playwright child -> config webServer's literal
  `node`; child `PATH` ordering; recursion marker; existing arguments; report/receipt authority; and teardown/port
  containment. The safe runtime must cross every one of these boundaries without persistent host mutation.
- **Capability-map delta:** none. The capability map already records the runner and current unsharded negative; this
  planning unit adds no capability claim.
- **Plan changes:** the open crash is now a specified pre-Playwright runtime-selection/bootstrap unit rather than a
  product or test-oracle redesign. Current red evidence and all existing gate semantics remain unchanged.

### DOCUMENT PLAN

- This section is the reconciled plan and is intentionally marked `SPECIFIED`. A later implementation worker may edit
  only the bounded runner/bootstrap/test surface named by this contract; this worker edits records only.
- The unsupported-runtime negative, no-relaunch safe-runtime path, recursion shield, exact PATH proof, and final
  `3200/3201` containment census are mandatory evidence, not optional follow-up.

### IMPLEMENT

- **Actual bounded changes:** this planning record only; no implementation, test, package, config, runtime, game, mod,
  installed-extension, evidence-binary, or external-record mutation.
- **Scope changes:** none.

### VALIDATE

- Required doc-unit check: inspect the exact diff of this plan, `BACKLOG.md`, and `SESSION-HANDOFF.md`.
- Required doc-unit check: verify that only those three owned paths were targeted by this worker.
- E2E and code tests: deliberately not run, as required by this docs-only planning unit.

### REVIEW

- The runner ownership, runtime threshold, single-relaunch boundary, recursion/path identity, fail-closed behavior,
  preserved E2E gates, negative coverage, final containment proof, status, rollback, and commit title are recorded.
- No implementation evidence exists yet; no requirement is promoted beyond `SPECIFIED`, and overall B119 remains
  `IN_PROGRESS / PARTIAL`.

### CLOSE

- **Status:** `SPECIFIED` for this bounded planning unit; overall B119 remains `IN_PROGRESS / PARTIAL`.
- **Remaining concerns:** exact native crash stack is unavailable; implementation must prove candidate precedence and
  all three runtime identities; the final monolithic E2E and its containment census remain unrun.
- **Capability-map delta:** none.
- **Rollback:** exact revert of this records-only diff; later implementation rollback is the exact bounded
  runner/bootstrap/test revert plus these records.
- **Suggested eventual commit title:** `fix(e2e): select safe Windows Node runtime`.

### AAR

- **Outcome:** Full-Lane planning completed. The first combined patch attempt was rejected before mutation because its
  BACKLOG anchor was stale; narrowed exact anchors then applied successfully. No test, scope, or data mutation failure
  occurred in this records-only unit.
- **Sustain:** keep the existing runner and structured receipt as the authority; keep observed crash evidence separate
  from inferred runtime causality; preserve unrelated dirty paths and protected host state.
- **Improve work / approach:** make runtime identity and candidate precedence explicit before implementation, and test
  refusal paths before any browser/server startup.
- **Improve tools:** use exact local anchors for multi-file record patches and verify the rejected attempt changed
  nothing; implementation should retain machine-readable bootstrap and containment receipts.
- **Highest-risk evidenced weakness:** the system runtime can terminate the monolithic child after substantial work
  without a complete report; the bounded fix must fail closed on identity uncertainty and never convert missing report
  truth into green.
- **Global/project lessons banked:** none; no capability-map delta and no new evidence artifact.

## 2026-09-09 — VERIFIED — bounded monolithic E2E Windows runtime bootstrap

Status: `VERIFIED bounded unit / OVERALL B119 IN_PROGRESS / PARTIAL`

This appended close records the implementation and independent validation of the prior `SPECIFIED` runtime-bootstrap
unit. The earlier planning section remains historical and is not rewritten. This close covers only the existing E2E
runner's Windows runtime handoff and monolithic-gate reliability; it does not close B119, renderer/source parity, or
real-game/product scope.

### IMPLEMENT

- **Actual bounded changes:** the existing `scripts/run-e2e.mjs` now performs a process-local, fail-closed Windows
  runtime bootstrap before Playwright starts, reusing its existing one-worker, retry, reporter, structured-receipt,
  lifecycle, teardown, argument, and port-isolation owners. The bounded helper/selftest surface is
  `scripts/e2e-runtime-bootstrap.mjs` and `scripts/e2e-runtime-bootstrap.selftest.mjs`; the precommit policy owner is
  `scripts/precommit-check.mjs`. No parallel runner, dependency, system-Node, persistent PATH, config, Maglev,
  product, mod, game, or protected-state change was made.
- **Runtime behavior:** the safe current runtime proceeds without relaunch. An affected runtime validates the permitted
  candidate, requires Node major `24` and libuv `>=1.52.1`, relaunches once with a private recursion marker and the
  verified runtime directory first in child `PATH`, and preserves the identity through the runner, Playwright, and the
  literal-`node` webServer. Missing, unsafe, inaccessible, malformed, recursion-loop, or identity-invalid candidates
  refuse before browser/server startup.
- **Observed versus inferred:** the system-to-safe handoff proof printed the safe `execPath`, Node version, libuv
  version, `marker=1`, `action exit/0`, and `relaunch-complete`. The repeated system-runtime `0xC0000409` was eliminated
  in the full run under the selected safe runtime. The approximately `98%` runtime association is a same-machine A/B
  inference; the exact native stack remains unavailable.
- **Scope changes:** none. This records close does not edit the implementation files listed above.

### VALIDATE

- **Focused implementation evidence supplied by the parent/implementation worker (not rerun in this records-only
  close):** runtime-bootstrap `59/59`; run-e2e policy `55/55`; runner integration `13/13`; `node --check` passed for
  all four touched/new MJS files; typecheck passed; production build passed with `1,848` modules and the existing chunk
  warning; full precommit passed. Official `npm run lint` passed exit `0` with `0` errors and the existing `600`
  warnings. A supplemental direct `node_modules/.bin/eslint.cmd` invocation against the four touched/new scripts
  returned `85` errors because the repository ESLint configuration does not provide Node globals for scripts and
  applies `no-control-regex` to existing runner patterns; that invocation is outside the official scope
  (`eslint src server.ts`), is a non-authoritative tooling/config diagnostic rather than a product regression, and
  does not justify suppressions or code edits.
- **Current tracked-only monolithic E2E evidence:** `23` tracked specs, `106` tests, one worker, retry `1`, ports
  `3200/3201`, invoked from system Node `24.15.0` / libuv `1.51.0` and automatically relaunched to safe Node
  `24.19.0` / libuv `1.52.1`. The only Playwright attempt passed `106/106` in `15.1m`.
- **Authoritative receipt:**
  `F:\DEV_ENV\X4_Forge\test-results\e2e-verdict.json`, schema `2`, source `json-report`,
  `reportCode=structured-report-inspected`, `4,935` bytes, SHA-256
  `9CBA11CE26DF2B23E098F185EAF9F21A1265ADBA891AFD7681C3F02357A80BD6`. It records `childExit=0`, green verdict,
  `passed=106`, `failed=0`, `flaky=0`, `bad=0`, `quarantined=0`, `total=106`; report complete with
  `discovered=106`, `terminal=106`, `report errors=0`; lifecycle complete with trigger `child-close`, child exit code
  `0`, signal `null`, ownership complete, `treeGone=true`, remaining PIDs empty, and
  `runnerInteractionFailed=false`.
- **Negative path:** the host-level invalid absolute override returned `candidate-file-inaccessible`, exit `1`, before
  browser/server startup; the relevant process PID set was unchanged, ports `3200/3201` had zero listeners, and no
  verdict receipt was produced.
- **Containment and protected-state evidence:** baseline drift was reconciled before the run: Deckwright was PID
  `43112` (not the stale planned PID `58660`) on `3100` and remained unchanged; installed Forge PID `23764` on `60836`
  remained unchanged; X4 was absent; and `3200/3201` were closed afterward. The following identities matched pre/post:

  - `data`: `3,686` files / `475,086,457` bytes / SHA-256
    `63242AB6A3D526BA4498A589DCA4D4833EA3E942F7B11BAEC58962DBCF05C53B`
  - `.studio-state`: `9` files / `12,382,674` bytes / SHA-256
    `34EE865601E144B293A18B44B6EF5413EA7D2C1F99B559C8BF47FC1B07EC0401`
  - `.studio-api-token`: SHA-256 `D20602CE9A8AFA430CF6E1730F3793F45F1BEFF535A7C7004DA7CE2B53027F3B`
  - `config.json`: SHA-256 `3EC65D540E6763D13D6F8F27D9005F80C3C855B00D3DCFDD5E7330726AE37779`
  - `test-results/.last-run.json`: SHA-256
    `FFF6299EFB51BA9EF550E500ECC967E972C83E86BE387042C360CAEA7FDBAE29`
  - `C:\Users\Moshi\.x4forge\latest.json`: SHA-256
    `F4BB5A9470FFF8CD3BEA434CCF45A420E5A26C7394EE67254068F537FCA86B07`
  - `C:\Users\Moshi\.x4forge\instances`: tree identity
    `4735A59572088955D11938EC63D545F8D43C0DBB7AF85300DB790321FDF7EBF2`

- **Final post-record gates:** the parent reviewed the three-record correction and confirmed the obsolete active
  `SPECIFIED` block and stale monolithic-stability-open claim are gone, the ROADMAP verified entry exists, and the
  handoff sequence is present. One exact Luna ran deterministic `graphify update .`: exit `0`, `10,713` nodes,
  `27,009` edges, `334` communities. `graph.json`, `GRAPH_REPORT.md`, `.graphify_labels.json`, `manifest.json`, and
  `.graphify_root` refreshed on disk, while exact Graphify status and diff-stat were empty and diff-check exited `0`;
  HTML was skipped at the `5,000`-node limit, so no tracked graph delta will be staged. Independent explain anchors
  `bootstrapE2eRuntime()` at `scripts/e2e-runtime-bootstrap.mjs:486` with degree `18` and import by `run-e2e.mjs`;
  `runE2e` remains indexed at line `1044` with degree `17`, while Graphify extracts no direct call edge. The final
  post-record `npm run precommit:check` exited `0`: tripwires `0/58`, canon mirrors identical, runtime bootstrap
  `59/59`, run-e2e policy `55/55`, Vite lifecycle and product copy `PASS`, durable writers `15/15` plus inventory
  `42` filesystem / `11` host-store / `3` browser-output / `47` SQLite / `7` transactions / `14` run / `14` exec /
  `2` pragma, capability contract `12` capabilities / `297` routes / `1` registrar / `11` aliases at SHA-256
  `bb467c4b70402b3dd31571dbe10d60ec05653dc6f6600f043037e993f2920337c`, MCP capability `PASS`, action receipts
  `882` routes / `57` surfaces at SHA-256
  `396865ea4e877035d8f8c29607d9b5e22dd5ca891b420855b59efbf8087b23bb`, typecheck `PASS`, size checks
  `server.ts` `15,356` lines / `797,345` bytes and `mdSemantics.ts` `822` lines / `49,010` bytes, final
  `[precommit] OK`.
- **Records-only validation for this close:** the changed sections were re-read; `git diff --check` was required for
  `BACKLOG.md`, `SESSION-HANDOFF.md`, and this plan; exact status was limited to those three repository paths, and the
  two StarForge files were separately verified as changed. No product test, E2E rerun, runtime mutation, or forbidden
  path access was performed by this records worker.
- **UI truth boundary:** Preview for layout; game for truth. No screenshot or native run here promotes universal
  renderer parity, arbitrary Lua support, C++ acceptance, or release readiness.

### REVIEW

- **Done and evidenced:** existing-runner reuse; safe/no-relaunch path; candidate validation and one-time relaunch;
  Node/libuv threshold; recursion shield; exact child-PATH placement; runner/Playwright/literal-`node` identity;
  fail-closed negative behavior; preserved one-worker/retry/reporter/receipt/lifecycle/teardown/ports; focused tests;
  unsupported-runtime/invalid-candidate refusal; complete current `106/106` structured receipt; and containment.
- **Partial / remains open:** exact native crash stack; same-state pending-branch Forge/X4 parity; complete twelve-reference
  AI Influence census; arbitrary Lua/Helper/widget coverage; universal C++ acceptance; and the real-mod
  `cancel_conversation` semantic correction, which remains separately write-gated.
- **Out of scope:** universal renderer parity, arbitrary Lua execution, C++ acceptance proof, release promotion,
  OpenVSX/install work, product/mod/game/config/corpus writes, and external projections.
- **Fresh-eyes finding and repair:** a normal child exit `1` was initially treated as abnormal and could delete the
  authoritative red receipt. Tests-first repair preserved exit `1` and prevented post-delete; stale-green preclear,
  selftest receipt preservation, full control-character rejection, freshness coverage, and bounded diagnostics were
  also corrected. The final focused runtime-bootstrap result is `59/59`.

### CLOSE

- **Status:** `VERIFIED` for the bounded Windows runtime-bootstrap/monolithic-E2E reliability unit; overall B119 remains
  explicitly `IN_PROGRESS / PARTIAL`.
- **Capability-map delta:** append one bounded positive entry for the existing E2E runner's automatic fail-closed
  Windows safe-runtime bootstrap and the current complete monolithic receipt. Do not promote product or renderer claims.
- **Rollback/checkpoint:** the implementation rollback is the exact bounded runner/bootstrap/selftest/precommit diff;
  this records rollback is an exact reviewed revert of these five owned record edits. No live or protected state needs
  restoration because this unit made no persistent runtime/product/mod/game write.
- **Suggested commit title:** `fix(e2e): select safe Windows Node runtime`.

### AAR

- **Outcome / triggers:** non-clean Full-Lane close. The reproduced system-runtime crash, the initial receipt-deletion
  P1, two failed PowerShell hash-composition commands, and the supplemental direct-script ESLint diagnostic were
  corrected or bounded without mutation; the failed commands produced no state change. Official `npm run lint` is
  the authoritative green result; the direct `85`-error diagnostic remains recorded as tooling/config evidence only.
  This AAR is limited to the runtime-bootstrap unit.
- **Sustain:** keep the structured receipt and lifecycle/tree ownership as the authority for E2E truth, and record
  runtime identity across the parent, Playwright, and literal-`node` webServer before interpreting process exit codes.
  Keep observed crash elimination separate from inferred Node/libuv causality.
- **Improve work / approach:** run negative receipt-preservation and unsupported-runtime checks before broad E2E, and
  refuse false-green conversion whenever report completeness, child exit, or ownership is inconsistent.
- **Improve tools:** keep exact, quoting-safe record/status/hash commands; avoid composing large PowerShell pipelines
  for protected-state evidence. A structured runtime handoff marker and bounded receipt make the failure boundary
  inspectable without relying on a native stack.
- **Highest-risk evidenced weakness:** Windows runtime/process termination can still occur outside the observed safe
  runtime, and a missing or stale report can be mistaken for a test result. The bounded fix reduces that risk through
  identity validation and receipt preservation but does not prove a universal native-stack repair.
- **Global/project lessons banked:** project AAR and capability-map deltas are appended for this unit; no global ledger,
  UI gotcha, product, mod, game, release, or external-projection record is changed here.

## 2026-09-09 POST-PUSH — Windows safe-runtime external projection/readback

### DOCUMENT CLOSE — EXTERNAL PROJECTION READBACK

- **Status:** `VERIFIED` for this bounded records/readback unit; overall B119 remains `IN_PROGRESS / PARTIAL`.
- **Scope and authority:** record the completed projection of the already-pushed Windows safe-runtime E2E checkpoint.
  Repository Markdown remains authoritative; GitHub, Notion, and Google Docs are projections. Their projection and
  readback were the bounded external operations for this close. No implementation, test, evidence-binary, Forge, mod,
  game, live-state, OpenVSX, or product-release operation occurred. No product Git mutation occurred; the parent owns
  the exact records-only commit, which remains pending.
- **Checkpoint:** HEAD `5a3c5c7f7b1c7555898fc3c36c2e2b90567f0790` was already pushed with exact local/tracking/direct-remote
  parity.
- **External readback:**
  - GitHub issue `#41` remains `OPEN`; comment ID `5606440239` reads back at
    `https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5606440239`. Comment count is `107`, exactly one
    matching heading is present, and the exact checkpoint commit is present.
  - Notion page `3b84618e-d15b-8190-821e-c0eb96f43d5a` remains `Status=In Progress` and `Evidence Grade=Partial`;
    last edited `2026-09-09T18:02:38.921Z`, exactly one matching heading, and the exact checkpoint commit plus GitHub
    comment are present. URL: `https://app.notion.com/p/3b84618ed15b8190821ec0eb96f43d5a`.
  - Google Doc `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, reads back final revision
    `ANLCKQlbFo35T7rDrrPek2updZZbo4UHHRFdFVnDemE_6Rn9mFxhjtTjfGfGcwXguXbJitakfMAhRFLpl4zHX85aWsZrkQ-nCZqz3dymI58z`,
    `740` paragraphs, exactly one matching `HEADING_2`, the exact checkpoint commit and GitHub comment, and the prior
    last paragraph preserved. Its final paragraph is exactly `Boundary: preview for layout; game for truth.` URL:
    `https://docs.google.com/document/d/17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`.
- **Runtime and E2E evidence:** system Node `24.15.0` / libuv `1.51.0` handed off to safe Node `24.19.0` /
  libuv `1.52.1`; focused checks are `59/59`, `55/55`, and `13/13`; the canonical tracked-only E2E completed its
  first attempt with `23` specs and `106/106` in `15.1m`. Receipt SHA-256 is
  `9CBA11CE26DF2B23E098F185EAF9F21A1265ADBA891AFD7681C3F02357A80BD6`. The invalid override failed closed and
  containment was clean. No OpenVSX release belongs to this checkpoint.
- **Remaining product/proof boundaries:** next product unit is same-state preview/native parity. The twelve reference
  views, broader arbitrary-Lua/Helper/widget coverage, C++ frame acceptance limits, and the separately write-gated
  real-mod MD correction remain open. Do not claim universal fidelity, arbitrary-Lua coverage, C++ acceptance, release
  readiness, or overall-B119 completion; preview is for layout and game is for truth.
- **Capability-map delta:** none for this records-only projection unit.

### AAR

- **Trigger and correction:** the first Google insertion used `endIndex - 1` while assuming the paragraph end included a
  terminal newline; exact readback exposed `truth..`. The coordinator deleted exactly the final extra period under the
  required revision ID, and final readback is clean.
- **Tooling lesson:** inspect the exact returned last paragraph and use a revision-controlled minimal correction; an
  accepted `batchUpdate` is not proof of clean rendered or text output.
- **Close boundary:** this AAR does not alter the `IN_PROGRESS / PARTIAL` overall B119 status and records no capability-map
  delta.

## 2026-09-09 Next bounded call-model verification-gap census — SPECIFIED

### PLAN

- **Lane and bounded unit:** Full lane; status SPECIFIED for an actionable read-only census of call-model
  verification gaps across the existing official X4 UI corpus. Extend the current linter census owner; do not
  implement the unit in this planning checkpoint.
- **Objective:** reuse the existing manifest selection, single filesystem read, analyzeLuaFiles call, and structured
  analysis.x4UiResults output to summarize where source-backed call-model verification is incomplete.
- **Assumptions and unresolved facts:** the current installed Forge sidecar at
  http://127.0.0.1:60836 is the read-only authority for the supplied baseline; the inline analysis describes observed
  records, not support priorities or complete underlying truth. The existing twelve-reference visual census already
  exists and is not duplicated by this unit.
- **Authoritative references:** HEAD and origin/main 1d41ce369241a5335ac47fe96ced16814dcaa960; the existing
  scripts/x4-ui-lint-corpus-check.ts owner; its analyzeLuaFiles and analysis.x4UiResults contract; the installed
  sidecar baseline below; the current B119 plan; and the permanent boundary Preview for layout; game for truth.
- **Existing capability reused:** official base/DLC UI manifest filtering, bounded pagination, contained file reads,
  analyzer invocation, current X4 UI summary, fatal/not-applicable classification, and exit-code behavior. No second
  filesystem scanner, parser, source executor, renderer, or visual-reference census is planned.
- **In scope:** one structured verification-gap census attached to the existing report; category/status aggregation;
  affected-file counts; normalized relative-path examples; deterministic bounded top-file ranking; explicit evidence
  completeness and reasons; selftests and the named read-only live receipt.
- **Out of scope:** changing analyzer rules or severity, converting gaps into fatal findings, changing current
  manifest/read/exit semantics, source text or secret output, arbitrary-Lua or C++ acceptance, source execution,
  twelve-reference reconstruction, Forge/X4 writes or parity validation, live-mod repair, deploy, OpenVSX, GitHub,
  Notion, Drive, and capability-map/AAR-ledger edits. Same-state pending-branch Forge/X4 parity remains a separate
  write-gated product/proof unit.
- **Risks and authorization boundaries:** the current report covers 7.7 MB and takes about 19.6 seconds; emitting
  13,731 individual records would create an output and memory risk. A bounded aggregate can hide per-gap detail,
  and truncation can make a seemingly precise total incomplete. New fields must contain only analyzer-owned category,
  status, counts, and normalized manifest-relative paths; never source text, messages, absolute paths, or secrets.
  This checkpoint authorizes documentation only.
- **Rollback/checkpoint:** no implementation or runtime mutation is made here. Roll back the future implementation
  with the exact reviewed owner-script/test diff and roll back this checkpoint with an exact reviewed revert of the
  three owned records, preserving all unrelated dirty paths.
- **Deterministic schema intent:** add one report object named x4UiVerificationGapCensus with totalGaps,
  affectedFiles, byCategoryStatus, topFiles, evidenceComplete, and incompletenessReasons. The object is present on
  every report, including manifest-unavailable and read-failure outcomes. byCategoryStatus has one row per observed
  normalized category/status pair with gap and affected-file counts plus its own representativePaths sample, capped
  at 3 unique POSIX-normalized relative paths and lexically sorted. There is no separate global representativePaths
  field. Rows sort by category then status. topFiles is capped at 12 files and ranked by gap count descending, then
  path ascending; any category or status lists on a top-file row are sorted. No per-gap array is emitted.
- **Invalid category/status evidence:** category and status are internal typed analyzer fields, but the aggregation
  boundary still validates their runtime shape. A non-string or empty value is counted in a reserved invalid-evidence
  bucket, forces evidenceComplete=false, and adds an invalid-category-status reason. It is never silently coerced to
  the analyzer's legitimate unknown status.
- **Count reconciliation:** totalGaps must equal the sum of every per-file result.verificationGapCount, the count of
  observed structured gap records, and the sum of byCategoryStatus gap counts. Any disagreement forces
  evidenceComplete=false and adds an explicit verification-gap-count-mismatch reason with the compared counts;
  the report retains the observed bounded count rather than silently choosing a supposedly authoritative total.
- **Failure-report shape:** manifest-unavailable reports carry the census object with zero counts, empty rows/top
  files, evidenceComplete=false, and a manifest-unavailable reason. Read-failure reports retain any observed bounded
  aggregates from successfully analyzed files, set evidenceComplete=false, and include read-failure and any count/
  result-coverage reasons. Existing report status and process exit behavior remain unchanged.
- **Completeness rule:** evidenceComplete is true only when the manifest is complete/current, every selected file is
  read and represented in analysis.x4UiResults, truncatedFiles is zero, category/status evidence is valid, and every
  gap-count reconciliation above is exact. Any per-file truncation forces false and records a reason, even when the
  observed aggregate and process exit are otherwise clean.
- **Acceptance criteria:** (1) the existing one-pass census and analysis.x4UiResults are reused; (2) aggregate totals,
  category/status rows, affected-file counts, per-row three-path samples, and top-file ranking are deterministic;
  (3) totalGaps reconciles exactly across per-file counts, observed structured gaps, and aggregate rows, with mismatch
  made explicitly incomplete; (4) the census object is always present and failure reports carry zero or observed
  bounded counts plus explicit reasons; (5) output is bounded to the declared per-row samples/top files and omits
  source text/secrets/absolute paths from the new object; (6) current fatal, warning, not-applicable, status, and exit
  behavior is unchanged; (7) truncation, malformed internal evidence, and other incomplete evidence are explicit;
  (8) the unchanged sidecar/corpus reproduces the observed 13,731 total without treating the six buckets or four
  highest files as support priorities; and (9) no preview result is promoted to game truth.
- **Evidence destination:** future selftest/live receipts belong under
  dev-docs/b119-ai-influence-dogfood/x4-ui-verification-gap-census/. This planning checkpoint writes no evidence
  artifact and claims no implementation or verification.

### BASELINE

- Forge HEAD and origin/main are 1d41ce369241a5335ac47fe96ced16814dcaa960. The worktree has unrelated dirty and
  untracked paths; the three owned records had no worker changes before this patch.
- Installed Forge sidecar baseline: manifest ready; 81 selected/read; 0 failed; 7,669,552 bytes; 81 X4 UI files;
  0 applicable fatal errors; 6 not-applicable findings; 29 warnings; 70 unverified files; 26 truncated files;
  13,731 verification gaps; 19,600 ms; process exit 0. The user reported the machine quiet, X4 stopped, and
  Antigravity/Forge available.
- Same-81-file inline analysis observed exactly 13,731 structured gaps. Largest observed category/status buckets were
  data-flow/unknown 4,227 across 69 files; text/dynamic 2,441 across 39; index/unknown 2,334 across 48;
  text/unknown 980 across 45; fontsize/unknown 629 across 31; and menu/dynamic 570 across 20.
- Highest observed files were menu_map.lua 3,187, menu_playerinfo.lua 1,100, gameoptions.lua 1,075, and helper.lua
  574; all four were marked truncated. These observations are bounded evidence only, not support priorities or proof
  that the underlying per-file counts are complete. Current completeness is false because 26 files are truncated.

### RECONCILE

- The current script already owns the resource path from manifest status through official entry selection, one read
  pass, analyzeLuaFiles, and report construction. The planned census extends that report rather than rebuilding any
  resource reader or parser.
- The existing twelve-reference visual census is already present in the B119 records; this unit reports call-model
  observability only and does not create a second visual census or claim layout/game parity.
- Couplings to preserve are analysis.x4UiResults to x4UiSummary, report status/severity, fatal/not-applicable handling,
  manifest-unavailable behavior, and corpusExitCode. No capability-map delta is made at specification time.
- The first inline diagnostic attempt failed because tsx eval used top-level await under CommonJS; the async-IIFE
  retry passed. This is a tooling/AAR trigger, not corpus or implementation evidence.

### DOCUMENT PLAN

- This section is the durable reconciled plan for the next implementation worker. It remains SPECIFIED until the owner
  script and its tests are changed and every required validation is run. No external projection or issue-owner
  operation is part of this planning checkpoint.

### IMPLEMENT

- Planned implementation is limited to the existing linter owner and its existing selftest surface. It will add the
  bounded aggregation/report schema and fail-first fixtures only; no implementation is performed by this worker.
- **Fail-first gate (2026-09-09T15:46:06.4170852-04:00):** the two causal census-contract checks were added before
  the production aggregation. Safe Node `v24.19.0` ran
  `node_modules/tsx/dist/cli.mjs scripts/x4-ui-lint-corpus-check.ts --selftest` and exited `1`; the exact stdout was:

  ```json
  {
    "pass": false,
    "checks": [
      {
        "name": "verification-gap-census-is-always-present",
        "pass": false,
        "detail": "present=false"
      },
      {
        "name": "verification-gap-census-contract-fields-exist",
        "pass": false,
        "detail": "census=null"
      },
      {
        "name": "official-source-and-domain-filter",
        "pass": true,
        "detail": "selected=[\"subst_lua/a.lua\",\"ui/z.lua\"]"
      },
      {
        "name": "contained-relative-path",
        "pass": true
      },
      {
        "name": "contained-absolute-path",
        "pass": true
      },
      {
        "name": "parent-traversal-rejected",
        "pass": true
      },
      {
        "name": "root-itself-rejected",
        "pass": true
      },
      {
        "name": "loopback-port-validation",
        "pass": true
      },
      {
        "name": "loopback-url-validation",
        "pass": true
      },
      {
        "name": "manifest-page-generation-match",
        "pass": true
      },
      {
        "name": "manifest-page-url-is-bounded",
        "pass": true
      },
      {
        "name": "exact-restricted-online-code-is-the-only-not-applicable-class",
        "pass": true,
        "detail": "notApplicable=[\"lua.restricted_online_call\",\"lua.restricted_online_call\"]"
      },
      {
        "name": "not-applicable-findings-remain-visible-with-exact-reason",
        "pass": true,
        "detail": "reason=Not applicable only for this trusted official base/DLC source census: the lua.restricted_online_call rule is scoped to non-verified sources. The finding remains visible here and is not disabled for mod validation."
      },
      {
        "name": "applicable-fatal-and-exit-behavior-is-preserved",
        "pass": true,
        "detail": "applicableFatal=2"
      }
    ]
  }
  ```

### VALIDATE

- Fail first with synthetic result permutations and truncation/invalid-manifest fixtures; retain the red receipt
  before implementation, then run the script selftest through safe Node:
  C:\Users\Moshi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
  node_modules/tsx/dist/cli.mjs scripts/x4-ui-lint-corpus-check.ts --selftest.
- Run the live read-only corpus command through that same safe Node against
  http://127.0.0.1:60836 with JSON output; compare deterministic counts, bucket rows, bounded samples, top-file
  ordering, exact totalGaps reconciliation, completeness=false, and unchanged exit/severity behavior. Verify the
  sidecar, X4, and protected state remain untouched.
- Run npm run typecheck, scoped ESLint for the owner script and directly added selftest surface, scoped git diff
  --check, reread the exact diff, and later npm run precommit:check. The planning checkpoint does not run any of
  these implementation/live validations.
- Validation currently unavailable: implementation, script selftest, safe-Node live receipt, and later precommit are
  intentionally deferred to the next worker; no result is promoted here.

### NEGATIVE / FAILURE PATHS

- A permutation of identical structured gaps must produce byte-identical category/status rows, per-row examples,
  top files, and completeness reasons.
- Each category/status row's representativePaths must never exceed 3, contain duplicates, include an absolute path,
  or vary under input ordering; topFiles must never exceed 12, and equal counts tie-break by normalized path.
- Synthetic count disagreement must prove totalGaps is checked against both the sum of per-file
  result.verificationGapCount and observed structured gaps; every mismatch must be named and incomplete.
- Any truncated file must force evidenceComplete=false; missing/read-failed or incomplete manifest state must also
  remain explicit rather than being reported as a complete census.
- Gap-only, warning-only, unverified, or truncated results must preserve the current process exit semantics; applicable
  fatal findings and read failures must still return exit 1, while not-applicable findings remain visible and excluded
  as before.
- Invalid or missing manifest/status data must retain manifest-unavailable behavior, avoid a manifest request when
  the existing status gate says it is not ready/current, and still emit the zeroed census object with explicit
  incompleteness reasons. Read failures must emit observed bounded counts when available and remain incomplete.
- Malformed category/status fixtures must enter the reserved invalid-evidence bucket and set the explicit reason;
  they must never be normalized to unknown or accepted as complete.
- Serialized new census fields must reject absolute paths, source text, analyzer messages, and secret-like payloads;
  only normalized relative paths and counts may survive.

### REVIEW

- Re-read the request, this section, the owner diff, and the selftests. Check one-pass reuse, all schema fields,
  per-row sorting/tie-break rules, limits, exact count reconciliation, always-present failure shape, invalid-evidence
  handling, truncation honesty, no-leakage behavior, preserved exit/severity semantics, and the preview/game-truth
  boundary. Any missed acceptance item returns to implementation and validation.

### DOCUMENT CLOSE

- Future close is VERIFIED only if every declared selftest, safe-Node live run, typecheck, scoped lint, diff hygiene,
  and later precommit passes. Otherwise use PARTIAL, FAILED, or BLOCKED with the exact missing evidence. Overall B119
  remains IN_PROGRESS / PARTIAL, and the twelve-reference, same-state pending-branch parity, arbitrary-Lua/Helper/
  widget, C++ acceptance, and real-mod correction boundaries remain open.
- Future evidence must state whether the report is complete; the current baseline must not be described as complete.
- Suggested future commit title: docs(b119): specify call-model verification-gap census.

### AAR

- **Trigger:** the first inline tsx diagnostic used top-level await under CommonJS and failed; the async-IIFE retry
  passed. Preserve both attempts and use an explicit async wrapper for future inline probes.
- **Sustain:** keep one manifest/read/analyze authority, bounded report fields, deterministic ordering, and separate
  preview/layout evidence from game truth.
- **Improve work / approach:** treat truncated per-file analysis as an incomplete census even when the process exits 0;
  do not promote high-count files or buckets into support priorities without complete evidence.
- **Improve tools:** prefer a script selftest or async-IIFE eval over top-level await in the current tsx CommonJS mode,
  and capture bounded JSON instead of printing individual gaps.
- **Highest-risk evidenced weakness:** a clean exit with a large verification-gap count and truncated files can look
  actionable while still lacking complete underlying coverage. The explicit completeness flag and truncation reasons
  are the bounded risk reduction.
- **Global/project lessons banked:** this planning record only; no external AAR ledger, capability map, implementation,
  evidence, mod, game, installed, or service path is changed.

## 2026-09-09 Next bounded call-model verification-gap census — IMPLEMENTED / VALIDATED

### IMPLEMENT

- **Bounded result:** the existing `scripts/x4-ui-lint-corpus-check.ts` now exports typed
  `X4UiVerificationGapCensus` bucket/top-file/report interfaces and one pure
  `aggregateX4UiVerificationGapCensus` boundary. `X4UiCorpusReport` always carries the object, including the existing
  manifest-unavailable base shape; successful and read-failure reports aggregate the existing `analysis.x4UiResults`
  and `analysis.x4UiSummary` after the unchanged single manifest/read/analyze path.
- **Deterministic contract:** category/status rows are sorted and retain at most three safe POSIX-relative examples;
  top files are capped at twelve, sorted by observed gap count descending then path, with sorted category/status lists
  and a typed `truncated` flag. `totalGaps` is the observed structured count and is checked against summed per-file
  counts and aggregate buckets. Truncation, invalid category/status values, unsafe paths, read/coverage failures, and
  manifest incompleteness are explicit; source text, messages, expressions, source paths, and secrets are not copied
  into the new object.
- **Selftest surface:** added causal fail-first contract checks plus deterministic permutation, cap/tie,
  truncation, count mismatch, malformed evidence, unsafe path, manifest/read-failure, no-leakage, and unchanged
  exit-semantics fixtures. No analyzer, parser, scanner, source execution, renderer, visual census, product UI, or
  runtime behavior changed.
- **Scope change:** none. The pre-existing planning hunks and unrelated dirty/untracked paths were preserved. The
  first typecheck attempt exposed a missing `LuaStaticX4UiFileResult` type import; the minimal owner-script import
  repair was required for the declared typed boundary and was validated below.

### VALIDATE

- **Fail-first:** before production aggregation, safe Node `v24.19.0` ran
  `C:\Users\Moshi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules/tsx/dist/cli.mjs scripts/x4-ui-lint-corpus-check.ts --selftest`; exit `1` with exactly the two new census-contract checks false and all pre-existing checks true. Exact stdout is retained above and in
  `dev-docs/b119-ai-influence-dogfood/x4-ui-verification-gap-census/live-readonly-receipt.json` under `failFirst`.
- **Focused selftest:** the same safe Node command after implementation exited `0`; `23/23` checks passed.
- **Live read-only corpus:** safe Node `--json --base-url=http://127.0.0.1:60836` exited `0`. It reproduced
  `ready/current`, `81/81` selected/read, `0` failed, `7,669,552` bytes, `81` X4 UI files, `0` applicable fatal
  errors, `6` not-applicable findings (`6` errors, still visible), `29` warnings, `70` unverified files, `26`
  truncated files, `13,731` verification gaps, status `no-known-fatal-static-gaps`, and report exit `0`.
  The census reports `totalGaps=13,731`, `affectedFiles=70`, `30` deterministic rows, `12` ranked top files, exact
  count reconciliation, and `evidenceComplete=false` only because `truncated-files: 26`. The full bounded object is
  retained in `live-readonly-receipt.json`; the README records the command, version, baseline, and evidence boundary.
- **Typecheck:** first `npm run typecheck` attempt failed with six `TS2304` missing-type-import errors in the owner
  script; after the minimal import repair, `npm run typecheck` exited `0`.
- **Scoped lint:** safe Node `node_modules/eslint/bin/eslint.js scripts/x4-ui-lint-corpus-check.ts` exited `0`.
- **Diff hygiene:** `git diff --check` on exactly the six owned paths exited `0` (only expected LF/CRLF warnings).
- **Repository gate:** `npm run precommit:check` exited `0` with tripwires `0/58`, runtime bootstrap `59/59`, E2E
  verdict selftest `55/55`, Vite/product-copy/durable-writer/capability/MCP/action-receipt audits green, typecheck
  green, and `[precommit] OK`.
- **Protected-state result:** no mod, game, installed Forge, configured corpus, service, config, Git, external record,
  deployment, publication, or runtime state was written. The live command used only the existing read-only authority.

### NEGATIVE / FAILURE PATHS

- The selftest proves permutation-stable rows/top files, three-path and twelve-file bounds, lexical tie ordering,
  exact per-file/observed/aggregate mismatch reporting, truncation incompleteness, reserved
  `invalid-evidence/invalid-evidence` handling, unsafe-path omission, manifest-unavailable zero shape, observed
  read-failure shape, no new-object source/message/secret leakage, and gap-only exit `0` with existing fatal/read
  failure exit behavior unchanged.
- Live output contains no `sourcePath`, source text, messages, expressions, secrets, or absolute paths inside
  `x4UiVerificationGapCensus`; the only absolute path in the receipt is the explicitly recorded safe-Node command.

### REVIEW

- **Requirements:** one-pass manifest/read/analyze reuse — done; typed always-present report object — done; category /
  status aggregation and affected-file counts — done; three-path and twelve-file bounds/order — done; exact count
  reconciliation and observed-total retention — done; invalid evidence and unsafe-path handling — done; truncation /
  manifest / read completeness reasons — done; fatal/warning/not-applicable/status/exit semantics — evidenced
  unchanged; concise text and JSON output — done; no visual/game or arbitrary-Lua/C++ promotion — preserved.
- **Fresh-eyes findings:** the initial missing type import was corrected before final gates. The final owner diff has
  no second `analyzeLuaFiles` call, no new scanner/parser/renderer, no raw gap array, no analyzer message/source
  fields in the new object, and no writes outside the six owned paths. No capability-map delta.

### DOCUMENT CLOSE

- **Status:** `VERIFIED` for this bounded read-only call-model verification-gap census; overall B119 remains
  `IN_PROGRESS / PARTIAL`.
- **Evidence:** `dev-docs/b119-ai-influence-dogfood/x4-ui-verification-gap-census/README.md` and
  `dev-docs/b119-ai-influence-dogfood/x4-ui-verification-gap-census/live-readonly-receipt.json`.
- **Deliberately not changed:** analyzer rules/severity, existing manifest/read/exit semantics, the twelve-reference
  visual census, same-state pending-branch parity, real-mod MD correction, arbitrary-Lua/Helper/widget coverage,
  universal C++ acceptance, Forge/X4 writes, deploy, publish, or external projections.
- **Rollback:** exact reviewed revert of the owner-script implementation/selftests and these owned documentation /
  evidence additions; no protected or live state needs recovery.
- **Remaining concerns:** the live total and buckets are observed bounded call-model evidence and remain incomplete
  while 26 per-file results are truncated. Preview remains for layout and game remains for truth; no universal
  fidelity or product completion claim follows.
- **Suggested commit title:** `feat(b119): add bounded call-model verification-gap census`.

### AAR

- **Triggers:** the parent planning record's earlier top-level-await/CommonJS diagnostic remains prior planning context;
  this unit also had the reproduced first typecheck failure for the missing owner-script type import. Both are retained
  as non-clean evidence; the repair was minimal and final typecheck/precommit passed.
- **Tool trigger:** the first final live-assertion wrapper failed before executing the repository command because the
  orchestration string had malformed PowerShell quoting (`SyntaxError: Unexpected string`). An explicit `String.raw`
  retry executed the exact assertion and passed; no repository or live state was touched by the failed wrapper.
- **Parent-review trigger:** the first README close assertion used a contiguous exact substring and failed only because
  Markdown wrapped the sentence across a newline. The whitespace-normalized retry passed; diff check, receipt, and
  analyzer-call checks were green, and no repository or live state changed.
- **Sustain:** retain one manifest/read/analyze authority, aggregate structured `analysis.x4UiResults`, cap output,
  sort deterministically, and keep preview/layout evidence separate from game truth.
- **Improve work / approach:** add the report contract to the same selftest surface before implementation so a missing
  always-present field fails causally; retain observed totals and make truncated evidence visibly incomplete even when
  the process exits `0`.
- **Improve tools:** typed cross-module additions should be followed immediately by a focused typecheck; the first
  run caught the missing import before the broader precommit gate. The exact red fail-first stdout and bounded live
  JSON receipt are more useful than emitting individual gaps.
- **Highest-risk evidenced weakness:** a clean process exit can still accompany a large, truncated verification-gap
  set that looks actionable. `evidenceComplete=false`, explicit truncation reasons, bounded samples, and the observed-
  total label reduce that false-confidence risk without changing exit semantics.
- **Global/project lessons banked:** repository plan, backlog, handoff, README, and receipt only; no external AAR
  ledger, capability map, mod, game, installed, or service path changed.

## 2026-09-09 POST-PUSH — verification-gap census external projection/readback

### CLOSE

- **Status:** `VERIFIED` for this records-only post-push projection/readback; the bounded implementation remains
  `VERIFIED` and overall B119 remains `IN_PROGRESS / PARTIAL`.
- **Pushed checkpoint:** `HEAD`, tracking, and direct remote matched
  `5d2defa5023dea5ab3cdd6d70feec2945c2c8c08`, titled
  `feat(b119): add bounded X4 UI verification-gap census`, with exactly six paths, `1,269` insertions, and `163`
  deletions. Final manual precommit and commit-hook precommit both ended `[precommit] OK`.
- **Independent validation:** selftest `23/23`; live `81/81` selected/read, `0` failed, `0` fatal, `6` visible
  not-applicable findings, `29` warnings, `70` unverified, `26` truncated, `13,731` observed gaps, `70` affected
  files, `30` rows, `12` top files, row sum `13,731`, and `evidenceComplete=false` only due
  `truncated-files: 26`. Ordering, bounds, no-leakage, typecheck, scoped ESLint, and diff checks passed. Protected
  hashes were unchanged; X4 was absent; sidecar PID `23764`; ports `3200/3201` were clear.
- **GitHub readback:** #41 remains open. Comment `5608587951` at
  `https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5608587951` reads back among `108` comments with
  exactly one matching heading and the exact commit and boundary.
- **Notion readback:** page `3b84618e-d15b-8190-821e-c0eb96f43d5a` at
  `https://app.notion.com/p/3b84618ed15b8190821ec0eb96f43d5a`, last edited
  `2026-09-09T20:54:06.015Z`, has exactly one matching heading, Status `In Progress`, Evidence Grade `Partial`, and
  the exact commit/comment/boundary.
- **Google Drive readback:** Doc `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, final revision
  `ANLCKQnmN-ubG30s8B-ihV7zijc3aS96DsuRrm6GPNUf7Z-eX09SkpTTwzwX_HivuzBpIIAn7C7vD713-pXqiFB1c7KINEODyp2P4-Dbo_wv`
  has `751` paragraphs, exactly one matching `HEADING_2`, the exact commit/comment, final paragraph exactly
  `Boundary: preview for layout; game for truth.`, and zero double-period matches.
- **Google correction trigger:** the first append again used extracted paragraph `endIndex - 1`; readback showed
  final `truth..`. One exact revision-locked `replaceAllText` changed one occurrence and final readback was clean.
  This is a recurrence/process failure. The strengthened global rule forbids extracted `endIndex - 1` as an append
  primitive and requires `endOfSegmentLocation` with explicit `tabId`, a range refetch before styling, and final
  paragraph/style readback.
- **Boundary:** no product, implementation, test, evidence, mod, game, installed, config, runtime, deploy, release,
  capability-map, or OpenVSX change belongs to this records close. Same-state pending-branch parity and the real-mod
  MD correction remain separate; preview is for layout, game is for truth.
- **Suggested commit title:** `docs(b119): close verification-gap census external readbacks`.

## 2026-09-09 CONTINUATION — SPECIFIED same-state pending-branch Forge/X4 parity

Status: `SPECIFIED`

Task: Run the next bounded B119 same-state pending-branch Forge/X4 parity check using the existing visual census and source-replay evidence. Execution has not begun.

Lane: `FULL`

### PLAN

- **Bounded unit:** after the mandatory user write gate, reproduce the `/seedworld` pending branch in Forge and X4 from the supplied same-state baseline, produce the two possible evidence pairs below, and classify parity only when target, source, state, and profile identity match.
- **Control-flow correction:** `/seedworld` synchronously sets `menu._pendingAction` and calls `aic_menu.lua -> menu.display`. With `menu.updateInterval = 0.1` seconds, the next `onUpdate` sees the pending state and opens `aic_comm.lua -> comm.display`. Compact `menu.display` is therefore transient and may be practically uncapturable. An expanded X4 `comm.display` frame is not comparable to a compact Forge `menu.display` preview even though both read the same pending action.
- **Reliable proof path:** first create a separate exact-source Forge preview for `aic_comm.lua -> comm.display` using identical `/seedworld` pending values, choices, transcript/context, profile/drawable/scale, and any required source-bound path/loop/sample selections; compare that preview only with the native expanded `comm.display` capture. The existing `forge-preview.png` is compact `menu.display` and cannot be pixel-compared with expanded native evidence.
- **Evidence-pair shape:** Pair A is the optional compact `menu.display` Forge/native pair, valid only if the transient native compact frame is actually captured. Pair B is the required expanded `comm.display` Forge/native pair and is the reliable same-target pair. If compact native capture is missed, compact parity is `UNPROVEN`; the expanded pair is not a substitute.
- **Assumptions and unresolved facts:** the exact `/seedworld` pending values, choices, transcript/context, profile/drawable/scale, and any required source-bound path/loop/sample selections remain to be captured in both matching targets. No runtime fact is inferred before capture.
- **Authoritative references:** the twelve supplied design/reference images and README; `dev-docs/b119-ai-influence-dogfood/visual-release-20260905/CENSUS.md`; `dev-docs/b119-ai-influence-dogfood/in-game-20260909-source-replay/README.md`; the full workspace authorities and source/deployed SHA-256 parity recorded below; and the full save baseline recorded below.
- **In scope after the mandatory user write gate:** create exact temporary byte backups of `autosave_01`-`autosave_03`; switch Forge only temporarily to `x4 AiLive`; create the exact-source Pair B `aic_comm.lua -> comm.display` preview and, if feasible, Pair A `aic_menu.lua -> menu.display`; launch X4, load `autosave_03`, invoke `/seedworld`, capture the compact transient before promotion if possible and the expanded pending state for Pair B; record pending values, choices, transcript/context, source identity, drawable/profile/scale, source-bound path/loop/sample selections, and log evidence; restore `Player_Elite_Escort` selection; quit without saving; restore any autosave whose hash changes.
- **State boundary:** `/seedworld` writes real AI Influence memories/intel/world-event/relation-cache state in the loaded save memory. Do not use sim reset.
- **Out of scope:** source/mod/deploy edits; confirmation, payment, or refusal actions; manual save; full design correction; arbitrary-Lua/Helper/widget completion; universal C++ acceptance; publication/release; and universal pixel-perfect claims.
- **Risks and authorization boundaries:** autosave persistence of seeded state; Forge selection drift; UI close/crash; transient compact capture loss; and invalid parity from target, source, state, or profile mismatch. The real-mod/game/config write gate remains mandatory and has not yet been crossed. This record authorizes no runtime, protected-state, or external-state operation.
- **Rollback/checkpoint:** exact autosave byte backups plus pre/post hashes; restoration of the original Forge workspace selection; and source/deployed hash verification. No sim reset is permitted.
- **Acceptance criteria:** only this owned plan file changes for the specification append; Pair B produces a nonzero current Forge preview and visible native frame with exact `aic_comm.lua -> comm.display` source identity and matched pending values, choices, transcript/context, drawable/profile/scale, and required source-bound selections; Pair A is optional and its absence is an explicit remaining gap, not a Pair B failure; source/deployed files remain unchanged; saves remain unchanged or are exact-byte restored; no DisplayView/Lua failure; retained screenshots and log receipt; and the parity classification does not overstate fidelity. All existing source/deployed/save/no-failure/rollback/evidence requirements remain in force. Overall B119 remains unproven beyond this bounded run.
- **Required validation and negative path:** validate the exact target/source/state/profile identity, Forge bitmaps, native frames, pending values, choices, transcript/context, drawable/profile/scale/path/loop/sample evidence, source/deployed hashes, and save hashes. Geometry or text comparison across target mismatch is invalid. Ordinary-state native evidence does not count; no auto-confirm and no save; any source/deploy/save drift stops the run and is repaired before close.
- **Evidence locations:** `dev-docs/b119-ai-influence-dogfood/same-state-pending-parity-20260909/`.

### BASELINE

- **Full workspace authorities:** current live selected workspace is `Player_Elite_Escort`, workspace ID `ws_0b867b27e92e63432041872c`. The addressed `x4 AiLive` read is workspace ID `ws_7478dbf3f00d9ec858806765`, version `1788928293145`, workspace hash `d04e3534e010b727`, snapshot hash `e3fbf946799087e6`, `2930` nodes, `1` text file, and `sourceFolder` `F:\DEV_ENV\projects\Mods\X4Mods\x4_ai_influence`. The addressed read did not switch the live selected workspace.
- **Installed baseline:** Forge `0.0.77`, sidecar `http://127.0.0.1:60836`, PID `23764`; X4 absent; installed extension reported `v1.0.513`, commit `835b59d`.
- **Full current source/deployed UI-file parity:** the supplied source and deployed copies match for each listed file: `aic_menu.lua` `8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD`; `aic_comm.lua` `5526B6F954859322E3BE266361F4DFC6F3061E1A399897148CB3BB251693483E`; `aic_sheet.lua` `682ED230C3ECE1C90C44C25DCA63C026B6182C2FCE4227382202B0AF16286101`; `aic_uix.lua` `C2223F4CDE3178B402F6D474B7AE3A82056A31AF0BECE9BEE7CE9E46DF70DB72`; `md/ai_influence_conversation.xml` `2E064D2B270AB19DC6902C30CAE1B76EE88E180A0DC130488D23E5FC89536BD7`; `content.xml` `A44FDA0C8F3550B3B6C507F9C61FFA7BAAAD0D874807162C4101A5FAB3C13AFC`; `ui.xml` `BB26D38B14AC875F020140E9D19A9EA70F14BB18B27CDFBCCBE099872A6603E5`.
- **Full save baseline:** `autosave_01.xml.gz` is `72,272,181` bytes, timestamp `2026-09-05T19:23:19.2317283Z`, SHA-256 `4C8ED45E72B579656493A4BEEAEDCAF31E9664BDDE4237BFFC2459C15C6D1242`; `autosave_02.xml.gz` is `70,805,761` bytes, timestamp `2026-09-05T20:43:28.3049108Z`, SHA-256 `0C300066ED7DC88263195CDA6CF255ACE7D75F8DEA8A3F3204D7514506727C0A`; `autosave_03.xml.gz` is `73,081,241` bytes, timestamp `2026-09-05T22:03:38.9988977Z`, SHA-256 `5D764E9562A7B3F6E6540F96E9150459E67C3D81E81890FC821F896C8C32B956`.
- **Debuglog baseline:** `debuglog.txt` is `308,232` bytes and `2,031` lines, last-write UTC `2026-09-09T09:43:31.8806390Z`, SHA-256 `BCDEE4B4A56E4580DCAFCF95F73FBA4FD066DA4741AE54D2DCB78979D3750451`; X4 remained absent. This is the post-run log delta boundary.
- **Existing record baseline:** the owned file already contains the visual census and source-replay records being reused. No duplicate visual census is being created, and no runtime work has been performed for this continuation.

### RECONCILE

- **Existing capability reused:** the existing visual census, source-replay README, source/deployed parity evidence, Forge preview path, and X4 capture path; this continuation adds only the same-state pending-branch parity record.
- **Resources and couplings checked:** the supplied design/reference evidence; `aic_menu.lua -> menu.display`; `aic_comm.lua -> comm.display`; `/seedworld` pending state; `HubPending`; loaded-save memory; full Forge workspace authorities; source/deployed identity; choices; transcript/context; drawable/profile/scale; source-bound path/loop/sample selections; and log evidence. `HubPending` shares the pending values, but that shared data does not make different layout targets pixel-comparable.
- **Target boundary:** compact `menu.display` and expanded `comm.display` are separate layout targets. The same pending action does not establish geometry/text comparability across them; the source, target, state, and profile must all match.
- **Capability-map delta:** none proposed; no capability map or other path outside this owned record is changed.
- **Plan changes:** the parent read-only reconciliation replaces the prior expanded-state fallback with Pair B as a separate exact-source expanded `comm.display` comparison, keeps Pair A optional, and records compact parity as `UNPROVEN` when the transient native frame is missed.

### IMPLEMENT (PENDING)

- No implementation or runtime execution has begun. The bounded actions listed in PLAN remain pending the mandatory user write gate.

### VALIDATE (PENDING)

- Pair A compact `menu.display` captures, Pair B expanded `comm.display` captures, exact target/source/state/profile checks, pending-value/choice/transcript/context checks, path/loop/sample checks, hashes, no-failure check, and save restoration check remain pending. The only record-level checks for this append are the required owned-file diff checks, with no runtime, game, build, precommit, deploy, or external-record operation permitted.

### NEGATIVE / FAILURE PATHS

- Ordinary-state native evidence is non-qualifying. A target, source, pending-value, choice, transcript/context, save, drawable, profile, path/loop/sample, or scale mismatch invalidates pixel comparison. An expanded native `comm.display` frame cannot substitute for a compact `menu.display` frame; if the compact transient is missed, Pair A is `UNPROVEN`. Confirmation/payment/refusal actions, auto-confirm, manual save, and sim reset are prohibited. Any source/deploy/save drift, DisplayView failure, Lua failure, UI close/crash, or failed restoration stops the run and must be repaired before close; otherwise the close cannot be `VERIFIED`.

### REVIEW (PENDING)

- Re-read the supplied continuation requirements and this record against every scope, baseline, target/source/state/profile boundary, risk, rollback, acceptance, negative-path, evidence, and write-gate item. Confirm Pair B is the required reliable same-target pair, Pair A absence is an explicit remaining gap only, no duplicate visual census or completion claim was introduced, overall B119 remains unproven beyond this bounded run, and only the owned file changed.

### CLOSE (PENDING)

- **Status:** `SPECIFIED`; no completion claim. Close remains pending until the bounded parity run and every applicable acceptance check are actually performed. The real-mod/game/config write gate remains mandatory and is not crossed by this record.
- **Remaining concerns:** compact pending capture may be unavailable and leave Pair A `UNPROVEN`; Pair B still requires a separate exact-source `aic_comm.lua -> comm.display` Forge preview and matching native expanded frame; parity remains invalid unless target, source, state, and profile match; and no runtime evidence exists yet.
- **Suggested commit title:** `docs(b119): specify same-state pending-branch Forge/X4 parity`.

### AAR

- **Already-triggered tooling event:** the first read-only PowerShell hash-table probe failed to parse; a corrected probe passed. Retain this as an AAR/tooling event, not as runtime evidence or permission to re-probe protected state. Final close AAR remains pending.
- **Boundary:** no source/mod/deploy, game, installed Forge, configuration, service, Git, GitHub, Notion, Google Drive, or other external state has been touched by this continuation record.

## 2026-09-09 POST-PUSH — same-state pending-branch parity specification external projection/readback

### CLOSE

- **Status:** `VERIFIED` for this records-only external projection/readback close. The parity execution remains `SPECIFIED` and pending, and overall B119 remains `IN_PROGRESS / PARTIAL`; this is not a runtime, in-game, fidelity, release, or completion claim.
- **Committed checkpoint:** `HEAD`, tracking, and direct remote matched `bf9472aee4b7550e3d5fc8241f699dc424727fc2`, titled `docs(b119): specify same-state pending-branch parity`. The commit contains only the two owned documentation paths; full precommit and the commit-hook precommit both passed.
- **GitHub readback:** issue #41 remains open. Comment `5609649730` at `https://github.com/KennyG1990/X4_Forge/issues/41#issuecomment-5609649730` reads back exactly once.
- **Notion readback:** page `3b84618e-d15b-8190-821e-c0eb96f43d5a` reads back exactly one heading `B119 same-state pending-branch parity specified`, with Status `In Progress`, Evidence Grade `Partial`, and the exact commit/comment/boundary.
- **Google Drive readback:** Doc `17VLaIsT499KHg7zg30hOyLaBXB0-9jlrX3dQ63s3dtE`, tab `t.0`, reads back exactly one matching `HEADING_2` at `153701:153749`, content through `154908`, the exact commit/comment/boundary, and final revision `ANLCKQn_I7mFBERcjhLa-jDvltXL_FUOU0s5-wpz65iVP4RuA3gETEZ_d9-V81LOhqLWxDa1ZoPPHcaSkqifPcpvPkZ2Z5u4MjQZgviB4Epi`.
- **Boundary:** `Boundary: preview for layout; game for truth.` This close is records-only: no game, save, real-mod, deploy, Forge selection, installed product, configuration, runtime, capability-map, or other product state changed. The protected-state gate remains pending; the machine was reported quiet, but the exact `go` authorization has not been supplied. Pair A remains optional compact `menu.display`; missed transient capture remains `UNPROVEN`. Pair B remains the required expanded `aic_comm.lua -> comm.display` pair with matched source/state/profile.
- **Capability-map delta:** none.

### AAR

- **Triggered parent-side tooling AAR:** two trusted-read loader attempts failed locally because `atob` and then `TextEncoder` were unavailable; a Windows `ReadAllText` exact-character-count loader succeeded before any Google write. A metadata-fields probe including an unsupported raw Docs `url` returned `400` and was corrected by omitting `url`. A read-only PowerShell Git probe initially parsed `@{upstream}` as a hash literal and succeeded after quoting. These are tooling events, not product/runtime evidence.
- **Suggested commit title:** `docs(b119): close same-state parity specification readbacks`.
