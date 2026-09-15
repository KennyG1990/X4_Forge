# Session handoff — B119 helper-return checkpoint

## Project and current unit

X4 Forge visual UI builder. Full goal ACTIVE/PARTIAL; gameVerified=false.
Read the entire goal before continuing:
C:/Users/Moshi/.codex/attachments/d06dfea8-8256-48a5-97f5-b524fac87153/goal-objective.md

Latest work: preserved successful traces, measured real-HUB action spans, visually inspected
recovery and reopen captures, reread candidate diff, prepared exact local checkpoint.
No new product implementation this continuation. Prior status-only turn was NO PROGRESS;
this continuation produced archival/review evidence and checkpoint work.
Normal precommit PASSED06:46:31.066–06:57:17.567Z, exit0; session48770 terminal.
All823/50/4/19guards passed. Checkpoint staging/normal-hook commit is the next operation.
Before checkpoint HEAD/main9eb3561b891d094454451e8351787951b6baa12c,109dirty/index empty.
Check test-results/b119-drawing-helper-returns-20260915/checkpoint/post-commit.json for a
verified checkpoint hash. If absent, inspect commit-exit.json and the live commit handle;
neither a prepared script nor a lock file proves that a commit completed.

## First commands / checkpoint state

Evidence root: test-results/b119-drawing-helper-returns-20260915/.
Normal gate: authority-scan-precommit-receipt.json and.log, PASS on this candidate.
Prepared ignored checkpoint.mjs supports stage -> inspect staged diff -> commit -> verify.
Commit uses the installed normal precommit hook (runs the gate again). No bypass, no push.
It records exact staged patch hash, worktree bytes, exclusions,823inputs,57archived artifacts,
50protected artifacts,4original Lua and19live files. It refuses unrelated staging.
Title: fix(ui): preserve source-proven drawing-helper returns.
Once HEAD changes, old run.mjs intentionally refuses: baseline a new runner/receipt series,
do not rewrite old receipts or pretend they belong to the new revision.

Owned14paths: CallModel+selftest, LayoutProgram+selftest, SourceBundle,
SourceEdits+selftest, Scene.selftest, SELECTED E2E hunks, BACKLOG, HANDOFF, three09-15plans.
Exclude the FINAL E2E hunk around5239: older countB119BrowserAction real-menu Apply wrapper.
Four earlier E2E hunks are owned. Never stage the entire E2E file.
Preserve95other paths plus that one overlapping hunk (96earlier exclusions).
No new eyeball request: source/rendered issues are actionable without asking Ken.

## Verified scoped evidence

- Layout1200/1200, parser162/162, SourceEdits175/175, pipeline127/127, Scene196/196;
  actual MENU/HUB/COMM3/3 executed. SourceBundle/session/scenarios/types/focused lint pass.
  authority-scan-freshness has all10terminal serial steps, all823/50/4/19guards pass.
- authority-scan-rendered06:13:26–06:26:00Z:7/7firstattempt,0flaky,complete verdict,
  treeGone=true. Scenarios/history, contextual Text/Button/Input/helper-alias, real-HUB pass.
- authority-scan-traced06:34:55.812–06:40:35.418Z:3/3firstattempt,0flaky,complete verdict,
  treeGone=true. Primary input edit/clear, helper-return recovery, real-HUB edit/history/export/reopen.
  Passing traces retained by CLI --trace on. Original120s/request limits unchanged.
- Exact source/selector/callId trace comparison passes4negative controls:
  Apply22341.118→17652.205ms; Undo16323.952→13713.847ms; Redo16346.005→13349.267ms.
  Following workspace checks1053.610/1020.169/1041.534ms, separate from clicks.
  These are API spans, not CPU-only times/stable speedup/instant feedback.
- authority-scan-rendered-evidence:37files; authority-scan-traced-evidence:20files.
  Both archives exclusively copied/hash verified, with manifests. Latest has3traces/2Lua exports.
  Both save scripts must NOT rerun over existing destinations. archive guard checks all57files.
- Fresh helper-recovered/cleared and HUB-edited/reopened screenshots inspected:
  input40 reveals dependent text; clearing retains heading only. HUB title/six tabs/FACTIONS
  survive reopen; much body remains unresolved. Inspect closed. Chromium, not native X4.

## Product boundaries and next real work

Helper-return facts remain parser-owned, independently source-matched and evaluated by
existing bounded arithmetic/scale owners with caller/sibling ancestry. Opaque calls use
source-bound preview inputs; no arbitrary Lua. Structural edits preserve numeric trees
and refuse forged/missing/stale/accessor metadata. Cache parser facts only, not verdicts.
Authority scan index contains original-order Assignment/Local/Function/Call nodes only.
Scene count changes have exact loop/consumer/text/glyph ownership and hostile controls.

Main remaining blockers:13–18second actions, incomplete real-menu body, full9journeys/
3menus/12references, full integration and packaged/installed/native proof. Checkpoint is
not completion. Next implementation must improve measured authoring or source-supported
body coverage, not substitute more green fixture counts. Prior CPU profile timing is
invalid (one negative delta); raw mapped frames are NOT CPU percentages. Descriptor-copy
experiment was slower; do not resurrect it or full-projection/authority caches.
Earlier cold-manifest GET timeout cause remains unproven; latest passes do not diagnose it.

## Safety / continuity

Astra directly; no Luna/other delegation. Stay local. Push PUBLIC RELEASES ONLY.
Never republish0.0.78. Real mod/game/save/install/config writes need paragraph and explicit go.
Quiet/rendered authorization stands; recheck X4/ports before heavy work. Last browser checks:
X4absent; only Deckwright3100PID61604. E2E3200/3201,workers1,isolated fixtures only.
Audit direct writers before rerun; don't edit pinned inputs during a run.
Keep Antigravity foreground during CUA; stop Escape/tool stop. No live canvas replacement.
No memory/global-ledger/external issue writes. Use apply_patch; exact-path/hunk staging.
Degradation called after repeated oversized reads and one Windows wildcard error.
Use one bounded owner or parsed receipt per call; rg --files/-g instead of path wildcards.
reviewctl/BlastRadius unavailable; manual diff review and repository gates used.
Recall found a different Forge-agent project; weak evidence, not a B119 solution.

Plans: docs/plans/2026-09-15-b119-authority-scan-index.md (latest),
2026-09-15-b119-drawing-helper-returns.md,2026-09-15-b119-scene-loop-census.md.
RESULTS.md contains current screenshots/timings; opening it in Codex was queued.
Bundled Node:C:/Users/Moshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
