# Claude engine witnesses — bounded report and retained-source reconciliation

Status: VERIFIED — bounded source/report reconciliation only. Lane: FULL. Baseline HEAD `7df20c86f7664443e7c11302360697bef49bcd20`, clean before this unit. This plan is recorded before source-hash verification and final close. Existing owners: #53, #73, #77, #78 and #82; no duplicate issue or test packet.

## PLAN

Bounded unit: reconcile the five actual Claude engine reports with the current dedicated Forge board and independently hash the retained source payloads against their previously pinned manifests. Write only this plan/close and `QA/forge-1110-claude-engine-witnesses.json`. Root owns BACKLOG, SESSION-HANDOFF, ROADMAP, capability/AAR projections, source changes, normal Git gates and issue/Notion updates.

In scope: exact report URLs/IDs/timestamps, board IDs/status/verdicts, all five manifest hashes and 22 source payload hashes, original marker/diagnostic and continuation semantics, delegated installed/run/cleanup claims, and evidence limits. The reports may establish the queued engine observations without establishing whole-issue completion or release readiness.

Out of scope: product edits; new rules, severity or deploy-policy changes; new fixtures/copies/helpers; raw-debuglog retrieval; game-installed files, process/game/GUI actions; tests/build/package/install/publish/push; external posts or row mutations; trust/configuration changes. No approval for those operations is inferred.

Authority: actual GitHub comments 6771224945 (#53), 6771225501 (#73), 6771224323 (#77), 6771223870 (#78), 6771223421 (#82); dedicated board `collection://eed16838-ce3d-4599-89f4-5b7bbb50402d` via saved view `view://6f327ad1-57a3-4399-a891-41e286e843d2`; existing retained SHA256.json manifests and WITNESS/README instructions. Earlier pending snapshots are historical after the received reports.

Risks/boundaries: conflating delegated operator reports with independently inspected raw game evidence; inferring broad semantics from one combined run; treating -901 as an engine default; claiming a dedicated #57 load line from an unsigned-file notice; treating existing-entry TextDB lookup as missing-entry fallback; promoting a source/report close to installed Forge or public delivery. No runtime/data/security behavior changes.

Rollback/checkpoint: only these two new records can be corrected or withdrawn; retained fixtures and all unrelated files remain untouched. No broad Git operation or restoration is needed.

Acceptance:
1. Fetch and read all five exact reports, their creation/update timestamps, and a complete current saved view; each owner row must be unique and corroborate its report.
2. Verify each original manifest SHA-256 against its frozen pin, compare the exact source inventory and every payload hash (4+3+4+4+7=22), reject traversal/reparse/extra/missing/mismatched payloads. Read #82's wrapped `files` map correctly.
3. Inspect retained instructions and relevant XML expressions/markers; preserve per-fixture semantics and distinguish observed errors from whether execution continues.
4. Separate QA retained-source verification from Claude-reported installed hashes, launch/log/markers and cleanup. No raw debuglog or game filesystem verification is claimed.
5. Record #77/#78 release engine prerequisites as received, and the exact #73 queued library witness as received, while retaining missing-entry, other-context, platform and installed/rendered/curated-release limits.
6. Review the two-record diff/readback, confirm only the authorized new files were written, and rehash retained sources after writing. No tests or runtime validation are applicable to this metadata-only unit.

Evidence: `C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2/forge-1110-claude-engine-witnesses.json`; this file links the primary records and summarizes the bounded close.

## BASELINE / RECONCILE

HEAD and clean status were read before mutation; both target records were absent. Actual reports were fetched again at 2026-11-10 15:59:23 UTC. The complete current board has 10/20 rows (`has_more:false`); all five owner rows are VERIFIED with populated Integrated. Their report links and frozen manifest pins agree. Board status is correspondence, not an observed live process. No fixture or artifact regeneration is needed. Existing source and report infrastructure is reused; no code capability-map delta.

The shared delegated run is X4 9.00 (611726), Windows, November 10 10:13–10:19 local / 15:13–15:19 UTC. It used a fresh log and a new disposable game, all five fixtures together, no campaign/save and reported owned cleanup. This unit must preserve that combined-run scope.

## Original pre-verification checkpoint

At initial specification these stages were pending; the completed bounded results follow below. Overall issues, installed product and release remain separately open.

## IMPLEMENT

Only this record and `QA/forge-1110-claude-engine-witnesses.json` were written. The JSON binds the five primary comment IDs/URLs/timestamps, unique current board rows, all five original manifest digests, all 22 actual source-file hashes/byte counts, and distinct direct/delegated proof classes. Frozen WITNESS/README preparation-time pending language was not rewritten; this received-evidence record supersedes it for current status without changing the artifacts.

Independent retained-source verification: **22/22 payload files, five/five pinned manifests, 12,081 payload bytes**, exact inventories with traversal/reparse/extra/missing-file guards. Counts are #53 4, #73 3, #77 4, #78 4, #82 7. No source or game-install files were written.

## Received engine observations

Claude's common report is one combined Windows X4 9.00 (611726) run on November 10, 2026, 10:13–10:19 America/New_York / 15:13–15:19 UTC. Fresh boundary: `Logfile started, time Tue Nov 10 10:13:03 2026`. Options: `-scriptlogfiles -allowextensionupdates -logfile debuglog.txt -debug all`, no `-usefallbacktext`. X4 was closed first and destinations were absent. A new disposable Young Gun game was started (log: `x4ep1_gamestart_tutorial`), no campaign loaded and nothing saved. All five fixtures were installed together. Claude reports matching source/installed hashes and exiting unsaved, closing X4, removing only fixture folders and confirming absence. These installed/log/cleanup facts are **delegated operator reports**; QA did not retrieve the raw debuglog, inspect game-installed bytes or drive the game.

| Owner and primary report | Reported engine result and important boundary |
| --- | --- |
| [#53 / 6771224945](https://github.com/KennyG1990/X4_Forge/issues/53#issuecomment-6771224945), posted 2026-11-10T15:19:54Z | Cold visible control logs `phase=game-start`; zero nested markers or dot-folder/backup log mentions. Exact backup nesting preserved; all three guarded paths absent afterward. #57 explicitly has **no dedicated control load/discovery line**: only unsigned-file FileIO error14 names the MD file. The result is the tested manifest-free nested layout, not every discovery layout. |
| [#73 / 6771225501](https://github.com/KennyG1990/X4_Forge/issues/73#issuecomment-6771225501), 15:19:55Z | Positive: `result-before → run-enter → result-after value=73 → discard-before → run-enter → discard-after`; no `run-after-return`. Independent include library: line7 return-context load error; `include-caller-before → include-before-return → include-after-return → include-caller-after`. **Only return is dropped; remaining library actions and caller continue.** The queued library witness is received, not pending. Other purpose/caller/AI/patch-created engine contexts are not proved by this fixture. |
| [#77 / 6771224323](https://github.com/KennyG1990/X4_Forge/issues/77#issuecomment-6771224323), 15:19:52Z | Control7. Short arguments and unsupported `%d` cause load errors plus expression parse warnings at line7, but actions execute: `7/%s` and literal `%d`; both before/after marker pairs fire. Do not equate diagnostics with cue-stopping rejection or infer a Forge severity-policy change. |
| [#78 / 6771223870](https://github.com/KennyG1990/X4_Forge/issues/78#issuecomment-6771223870), 15:19:51Z | Literal, dynamic and fallback syntax yield Hull for existing page1001/id1 with fallback flag unset. Arithmetic shorthand gives a load parse Error (comma expected), no invalid-value output; before/after actions still run. **Missing-entry fallback behavior remains untested.** |
| [#82 / 6771223421](https://github.com/KennyG1990/X4_Forge/issues/82#issuecomment-6771223421), 15:19:50Z | DEFAULT11/42; MISSING-901/63; OPTIONAL-CASE41/42; REQUIRED-CASE-901/73; TYPO21/42. All sentinels fire. Four negative calls log parameter errors **and still execute the library**; names are case-sensitive. -901/-902 are the fixture's explicit absent-value expressions;42 is its declared optional default. Prior direct cue-instance evidence is separate. |

## Current correspondence and release delta

The fresh complete saved view at 2026-11-10 15:59:23 UTC contains **10/20 rows**, not the earlier nine. All five unique owner rows are VERIFIED with matching populated Integrated/report links and frozen manifest pins; current edits are 15:38:38.406–15:38:41.932 UTC. GitHub reports remain unchanged at their original posted timestamps. Existing QA Details and immutable fixture instructions can still contain preparation-time pending language; it is historical, not a competing current verdict.

A new [Claude fixture-batch CONTRACT](https://app.notion.com/p/4144618ed15b812eae6edbdfeed403c6), edited 2026-11-10T15:38:19.765Z, reports Ken approved future independent-fixture batches with one BATCH.json and one READY row, plus per-issue GitHub verdicts. Its ACK request is **not acted on by this slice**. Root owns response/adoption; no BATCH.json, fixture rename, regeneration or new row was created. Existing frozen packet layout is preserved. Root subsequently reports a successful ACK on this contract: comment4144618e-d15b-8195-b27c-001de0d9f306, discussion4144618e-d15b-8147-8cd0-001cf830a13f. The acknowledged future contract uses BATCH.json, root-relative SHA256 manifests, listed forge_ folders, independent markers, one READY row and per-issue GitHub verdicts, with Claude alone operating the game. No new fixture, game action or requeue follows. This ACK receipt is root-reported, not independently fetched by this slice; no duplicate ACK was posted.

The specific **#77/#78 release engine prerequisites are received**, and the exact **#73 library-return controls are received**. This does not close their whole issues, qualify newly invented contexts, prove installed Forge authoring/deployment, or clear source-selection, dependency-closure, full build/E2E/oracle/VSIX/installed/rendered/delivery gates. Release remains **NOT_READY** on those independent requirements. No new heavy-window, trust/restart or publishing permission follows from a verdict.

## VALIDATE / REVIEW

- Baseline: exact HEAD7df20c86f7664443e7c11302360697bef49bcd20, clean status and both target paths absent before mutation.
- Primary/report acceptance: actual complete bodies of all five exact comments read; unique matching VERIFIED rows, report links and manifest pins corroborated in a complete saved view.
- Source acceptance: five frozen manifest digests and exact22 payload hashes match; 12,081bytes; #82 wrapped files map interpreted correctly. Retained instructions and relevant XML controls inspected.
- Negative guards: no mismatched/extra/missing file, unsafe path, reparse escape, missing/duplicate owner row or unmatched report/pin was accepted. No synthetic failure fixture or runtime test was executed.
- Readback/preservation: final JSON and Markdown read back; source payloads, manifests and retained instruction hashes rechecked after record creation. Exact execution timestamps/results reside in the JSON.
- Proof boundary: QA source verification is direct; installed hashes, engine logs/behavior and cleanup are explicitly delegated to Claude. Raw debuglog and game filesystem were not retrieved. Combined-run, tested-build/platform, missing-entry and other-context limits remain.
- Requirement review: acceptance1–6 done at this bounded metadata/source layer. Product/native tests, UI, installed Forge and release work are out of scope, not marked green. No code capability-map delta; root owns other record projections.

## CLOSE

**VERIFIED — bounded retained-source and delegated-report reconciliation only.** Five actual operator witnesses are received and bound to unchanged exact source artifacts. Overall issues and release remain separately open. No product rule/severity/policy change, game action, source copy, external post or Git mutation occurred. Commit point: `docs: reconcile Claude's five engine witnesses` (root owns the normal commit gate).

## AAR

TRIGGERED: reconciliation corrected the prior nine-row assumption to ten after the new future batch contract appeared. Sustain actual per-fixture report reading, frozen source hashes and explicit direct/delegated evidence boundaries. Improve the work by retiring stale pending claims when current operator verdicts arrive, without duplicating fixtures or extrapolating from a shared install. Saved-view mode avoids exhausted SQL quota; no owned product/tool defect was diagnosed in this metadata slice. Highest evidenced weakness is conflating engine errors with total rejection: these fixtures demonstrate four distinct continuation outcomes. The bounded response is to record their exact scope before any future rule change. Final readback also corrected Windows text-mode doubled CRLF and relabelled the original pending placeholder as historical; the failed exact-match attempt changed no file. Final writes use binary UTF-8/LF and both records are read back. Lessons are recorded only here and in the authorized QA JSON; root owns other durable projections. No Codex memory write.
