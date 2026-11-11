# Validation and debuglog documentation review

Task: answer Ken's request to review Forge validation/debuglog and identify existing documented issues. Lane: LIGHT (read-only system review with this durable record). Status: VERIFIED for documentation/source reconciliation only; no new defect reproduction or game test.

Plan/baseline: inspect current source and the existing GitHub owners/comments without changing either system. HEAD cb5cf7d, public0.0.83. Preserve the in-progress #96 source diff and plan. No service/game/GUI launched for this review. Rollback is this documentation-only delta.

## Existing layers

`src/server/projectValidation.ts::runProjectValidation` combines project structure, cross-file/cue rules, game schemas, expression/property/reference rules, Lua/UI analysis and declared project-check inspection. `src/lib/validationEvidence.ts::buildValidationEvidence` distinguishes mod errors from unavailable checks and computes coverage independently. Approved project execution is a separate owner and receives explicitly labelled project-verified credit for the exact files/checks. Passing syntax cannot establish arbitrary UI behavior or X4 execution.

Runtime is another evidence layer. The addressed Runtime Debugger and compatibility watcher/game-log views have separate projections; they share classification/evidence helpers but their returned verdicts are not interchangeable. `gameLogLoadEvidence.ts` owns bounded load-history continuity; the server distinguishes recent activity, an observed load, post-deploy freshness and incomplete/unknown coverage. No error in the observed log is not proof that silent code ran.

## Documented validation issues

| Existing owner | Documented problem | Current reconciled position |
| --- | --- | --- |
| [#60](https://github.com/KennyG1990/X4_Forge/issues/60) | Nested keyed property chains emitted false warnings and prevented last-green. | Open. [Verified bounded Dev fix](https://github.com/KennyG1990/X4_Forge/issues/60#issuecomment-6736363453):48native checks; valid expressions clear, typo controls remain. Last issue update retains installed/public qualification limits. The original seven/eight warning counts are historical reports, not a measurement of current0.0.83. |
| [#54](https://github.com/KennyG1990/X4_Forge/issues/54) | Studio critic and native/API validation disagreed about legal onfail cue gates. | Open. Shared-rule correction has120native assertions plus separate stale refusal and an exact X4 fixture witness. Exact instantiation/one-shot and installed presentation gates remain named in the [checkpoint](https://github.com/KennyG1990/X4_Forge/issues/54#issuecomment-6735574666). |
| [#59](https://github.com/KennyG1990/X4_Forge/issues/59), [#61](https://github.com/KennyG1990/X4_Forge/issues/61), [#86](https://github.com/KennyG1990/X4_Forge/issues/86) | Unverified hand-written UI; external project checks outside one verdict; engine globals/non-runtime tools/load-order scope noise. | Open/PARTIAL. The claim that Forge cannot do Lua/project checks is now outdated: [0.0.83 delivery](https://github.com/KennyG1990/X4_Forge/issues/61#issuecomment-6803027338) includes positioned syntax/registration/scope/order analysis and approved project-check evidence. Installed compiled-server replay315/315 includes29real external LuaJIT cases. Synthetic owner policy/external helpers do not prove real device enrollment, X4 compiler flags, full UI behavior or safe retirement of AiLive gates. |
| [#64](https://github.com/KennyG1990/X4_Forge/issues/64) | Lua strings/table fields mistaken for faction or ware IDs. | Open. Faction consumer fix has bounded Dev proof; [later ware-table report](https://github.com/KennyG1990/X4_Forge/issues/64#issuecomment-6748670368) is separate remaining scope. |
| [#97](https://github.com/KennyG1990/X4_Forge/issues/97) | Repeated deploy validation cost and consumer reporting standalone validation STALE each run. | Open. Timings/reuse/indexing have measured Dev improvements; consumer timing and consistent sub-minute apply remain open. The stale-validation complaint is documented in this issue, not independently diagnosed by this review. |

## Documented debuglog/runtime issues

| Existing owner | Documented problem | Current reconciled position |
| --- | --- | --- |
| [#52](https://github.com/KennyG1990/X4_Forge/issues/52) | Actual widget/UI reload crashes unattributed or absent while ordinary debug text/signature notices counted as faults. | Open. [Contiguous and cross-poll synthetic crash fixes](https://github.com/KennyG1990/X4_Forge/issues/52#issuecomment-6741241830) include94HTTP checks and restart/rotation controls. Exact game replay, menu-only ownership and installed verification remain open. |
| [#57](https://github.com/KennyG1990/X4_Forge/issues/57) | seenByX4/loadedCleanly decayed after load lines left the tail. | Open. [Bounded historical-load correction](https://github.com/KennyG1990/X4_Forge/issues/57#issuecomment-6739215791) has40isolated checks,12MiB append, deploy EOF/truncation/rotation controls. Current code returns null for unknown clean load. The later #53 companion found no dedicated engine load line; it did not validate an assumed format. |
| [#55](https://github.com/KennyG1990/X4_Forge/issues/55) | Registered Lua that never executes is invisible without boot evidence. | Open. Registration-change advisories and opt-in per-file boot evidence have [bounded native proof](https://github.com/KennyG1990/X4_Forge/issues/55#issuecomment-6739777160). Warm/cold game behavior and installed qualification remain separate. Silent/uninstrumented execution cannot be inferred. |
| [#56](https://github.com/KennyG1990/X4_Forge/issues/56) | Runtime panel advertised15modeled MD files as all19source files. | Open. Dev rendering now distinguishes modeled/source inventories; [recorded fixture proof](https://github.com/KennyG1990/X4_Forge/issues/56#issuecomment-6721850550) is bounded and retains installed/full-gate limits. |
| [#14](https://github.com/KennyG1990/X4_Forge/issues/14), [#35](https://github.com/KennyG1990/X4_Forge/issues/35) | Full static-to-engine precision loop and real LIVE cue/badge/error/stop experience. | Open. Deterministic debugger and API/MCP foundation are delivered. Controlled engine-vs-static scorecards and current-session rendered LIVE certification are broader remaining work. |

## Documentation discrepancy / QOL observation

BACKLOG B95 still says the watcher treats authored `[=ERROR=]` text as runtime failure. Current `server.ts::computeGameStates` explicitly requires an engine signature and excludes authored diagnostics; errorEvidence explains matches. The B95 original report is retained historical evidence, but the open/spec'd wording is stale. B96's statement that runtime is untouched likewise predates the delivered Runtime Debugger foundation in #14. Source counters/issue state alone do not settle installed or game acceptance.

Observed cost: getting current truth required reading issue comments and source beyond the backlog/original issue bodies. Opinion: the layers themselves are useful; their status presentation is cumbersome because historical failure, bounded repair and remaining acceptance live in different places. This is a documentation reconciliation finding, not another new defect or duplicate owner issue. No capability-map delta.

## Validation / close / AAR

- Read current source for validation coverage, project credit, authored/engine classification and load-state unknown handling; checked live GitHub issue state/body/latest substantive comments for14,35,52,54,55,56,57,59,60,61,64,86,97. Every listed owner is open.
- Documentation/source presence VERIFIED; continuing live failures are not asserted. No new tests or X4 actions were necessary for the documentation question. The already-running #96 typecheck finished0; its53existing restriction tests passed, without claiming new integration coverage.
- AAR non-clean: first rg used a Windows wildcard in a literal path and failed; subsequent search used `-g`. Broad connector output exceeded the useful output budget; structured result summaries and bounded source selections were used thereafter. Sustain original-report versus later-fix versus remaining-proof separation. Highest evidenced weakness: stale backlog wording can make a delivered partial capability appear absent, or an open ticket appear entirely unfixed. Bank this on existing status/QOL records; no additional implementation/recommendation is requested here.
