# Open VSX showcase image repair

Task: Capture the installed Forge in Antigravity and repair the public description images.
Lane: FULL. Status: SPECIFIED.

## PLAN
- Bounded unit: real beginner/expert showcase captures and delivery of the ten images already referenced by Open VSX 0.0.78.
- Authority: user request, live listing DOM/image state, installed Antigravity extension; existing README, packaging policy, capability map and ADR veteran-floor invariant.
- In scope: screenshots, image hosting paths, concise truthful captions if needed, listing verification, durable evidence.
- Out of scope: B119 repairs, game/mod/config writes, deployment, AI calls, extension runtime changes or republishing 0.0.78.
- Risks: accidentally publishing unrelated local work or capturing private content. Review every selected image; isolate publication from the dirty checkout and its fifteen unpushed commits.
- Rollback: retain original assets and listing baseline; a follow-up asset-only commit can restore prior public media.
- Acceptance: beginner guided workflow and expert authoring tools shown in real installed-host captures; all ten description images decode with nonzero dimensions in the public listing on two fresh loads; screenshots visibly inspected.
- Validation: native screenshots, exact image-source audit, public HTTP/image decoding, two rendered listing loads, full-page screenshots. Negative: zero broken description images; unrelated source, game/config and local workspace content preserved.
- Evidence: vscode-extension/evidence/showcase/2026-10-19/ and this record.
- No runtime build/e2e required for an image-only publication; no executable behavior changes planned.

## BASELINE
- Local HEAD e20be67583c6d30aa37537227bb6d71e47099825, main ahead of origin/main by 15 commits; substantial pre-existing dirty work preserved.
- Live listing 0.0.78: all ten description images complete with naturalWidth=0; icon/avatar load.
- Listing rewrites README relative links to github.com/KennyG1990/X4_Forge/raw/HEAD/media/showcase/*.png. Root media/ is untracked locally; extension media/showcase/ is tracked.
- Installed Antigravity Studio visible, build v1.0.521, Player_Elite_Escort workspace. User confirms Antigravity ready, X4 closed, machine quiet.

## RECONCILE
- Existing gallery, screenshot assets and README reused; no new feature infrastructure.
- The public URLs target repository-root media, not vscode-extension/media. Publication must repair the actual resource paths.
- Agent-Brain recall returned an older branch-unification/harness conversation, not evidence that this gallery failure was solved.
- No capability-map delta: hosting repair does not add product capabilities.
- Reconciled plan: prefer an isolated asset-only publication against current public main, avoiding the unrelated unpublished B119 commits and a runtime release.

## IMPLEMENT
- Captured ten genuine installed-host screens; retained complete native captures privately in the local evidence directory and published crops exclude unrelated IDE tabs/status chrome.
- Added the ten exact missing repository-root media paths. Refreshed the ten corresponding packaged media files with byte-identical crops; README and runtime code unchanged.
- Beginner capture shows guided steps, editable Spawn Ship properties, and deterministic node explanation. Expert captures show zero-match patch diagnostics; a read-only bulk dry run (80 candidates, 43 matches, 37 no-match, 0 over cap); bounded UI canvas with unverified warning; typed contract/generated Lua; real galaxy map (126 clusters, 151 sectors, 125 placed); ware production/pricing; read-only AI template; localization/XML; project dependencies.
- Created independent `Forge_Showcase_20261019` workspace for examples, then restored `Player_Elite_Escort`. No deploy, compile-to-mod-folder, game write, provider call or config edit was performed.
- GitHub owner: #46; related completed marketplace story #38 is not duplicated.

## VALIDATE
- Native rendering inspected for all ten captures; contact sheet reviewed. PNGs decode at 1158-2518 px wide. All ten root/packaged mirrors match capture SHA-256 values (`capture-manifest.json`).
- Negative baseline: `listing-before.json` records all ten broken description images; extension icon/avatar load.
- Initial precommit passed bootstrap 59/59, verdict 55/55, Vite lifecycle, product copy, writer inventory, capability audit (12 capabilities/297 literal routes), MCP capability checks and action receipts (82 routes/57 surfaces), then failed typechecking because the isolated checkout lacked `vscode-extension/node_modules/@types/vscode`. The existing extension dependency tree is linked separately for recovery; no source or configuration fix is required. Public publication and two fresh listing loads remain pending.
- Scope review: only image assets and task records, no source/manifest/version/config delta. Existing fifteen unpublished commits and dirty files remain in the active checkout.

## CLOSE
- Status: PARTIAL pending publication and live description verification.
- Public asset commit title: `docs(marketplace): restore all ten Forge showcase images`.
- The active local branch must remain untouched. An isolated public image commit will advance origin/main independently of its fifteen unpublished local commits; no merge/rebase/reset is authorized in this task.

## AAR
- NON-CLEAN: corrected screenshot dependency loading (ESM package.json import incompatibility; resolved with the bundled CommonJS sharp path); attempted resize beyond observed window bounds was refused, then recovered with a fresh observation and supported maximize/restore.
- Gate recovery: isolated checkouts require both root and extension dependency trees; linking only root dependencies leaves the VS Code declarations absent. Retained failed gate log; focused typecheck and normal commit-hook gate must pass after adding the extension link.
- Sustain: verify actual listing image URLs and decoding before changing assets; isolate publication from unpublished product work; capture the installed host with limits visible.
- Improve work/tools: use the available bundled dependency path immediately and use only supported window geometry actions.
- Highest-risk evidenced weakness: relative marketplace images silently depend on repository-root public paths even when matching assets are packaged elsewhere. Bounded repair is the explicit public mirror plus decoded-image verification; no runtime capability delta.
- Final public results and AAR outcome will be recorded locally after publication.
