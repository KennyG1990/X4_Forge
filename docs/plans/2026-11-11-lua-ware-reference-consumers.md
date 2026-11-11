# Lua ware reference consumers (#64 follow-up)

Status: SPECIFIED. Lane: FULL. Existing owner: [#64](https://github.com/KennyG1990/X4_Forge/issues/64#issuecomment-6748670368), first concrete defect in Ken's validation/debuglog execution worklist.

## PLAN

- Bounded unit: stop treating ordinary Lua `ware.<field>` as an MD ware reference while retaining positioned unknown literal ware warnings at proven direct engine consumers.
- Assumptions/references: the actual reference set remains the configured canonical X4 corpus. The existing parsed direct faction-consumer owner, shared LuaJIT parser adapter, source coordinate owner and project/native validator are authoritative; no new regex-only Lua checker or dependency. Forge0.0.83/private installed server stays pinned. CodeSense remains a black-box reference, not a source donor.
- In scope: direct unshadowed/unrebound `GetWareData` literal first arguments; strings/comments/table fields/local shadows/member lookalikes/dynamic arguments excluded from claimed proof. Reuse current conservative whole-file environment/rebinding policy. Preserve MD/XML ware expression/attribute checks, faction behavior and macro behavior.
- Out of scope: arbitrary alias/wrapper/global flow inference, macro consumer repair, new engine semantics, gate retirement, Lua execution, live setup/game/mod/save changes. Dynamic consumers remain outside this bounded warning rather than being called universally checked.
- Couplings/files: `src/lib/referenceLint.ts`, existing embedded oracle, project validator, Problems and both deploy-preview consumers. Shared parser/positions and existing source inventories must agree. No route/key/effect changes intended.
- Risk/recovery: removing the Lua MD-expression heuristic must not remove genuine direct-consumer typos. Rollback is the bounded source diff from the preceding committed checkpoint. Fixture mutations stay in an isolated standalone mod and scratch target. No backup family.
- Acceptance: the exact two reported table-field shapes produce zero ware warnings; a real literal `GetWareData("notaware", "name")` still warns with source coordinates. Known IDs clear. Escaped/long literals, CR/LF/CRLF, leading BOM/non-ASCII prefix preserve original positions. Comments/strings, `object.GetWareData`, local/rebound consumers, dynamic values and malformed syntax never publish speculative ware findings. MD controls and faction regressions remain unchanged.
- Validation: focused reference oracle and Lua/grammar/project/noise regressions; actual project/Problems/native preview parity on identical source bytes, plus stale bound apply refusal and exact positive scratch deployment/receipt where applicable; required type/lint/route/writer/capability/receipt/precommit gates. Exact installed compiled-server qualification and rendered diagnostics before public/full close. Record game proof only if new game behavior requires it and Claude supplies the witness. Negative paths are required, never traded for a green benign fixture.
- Evidence: existing finite QA root `forge-1111-ware-reference-*` files; this plan and parent worklist, existing issue and Notion QA log. Reuse a current harness; retire only exact owned runtime after original producer/listener/physical checks. No live endpoint or computer use.

## BASELINE / RECONCILE

[REPRODUCED] Current source `referenceLint.ts` emits `reference.unknown_ware` at2:46 (`ware`) and3:20 (`wname`) for a local table named ware. The direct bad-consumer control still warns at1:27 (`notaware`). The read-only reproduction used the real exported validator with a controlled canonical set {energycells,water}; it is source evidence, not installed or game proof.

Cause observed in source: the generic `ware.<id>` scan still runs on Lua, and the separate direct-GetWareData scan is regex-based. Faction MD-keyword scanning already excludes Lua and its direct consumers already use parsed lexical bindings and rebinding exclusion. Extend that owner rather than rebuild it.

Graph blast-radius: projectValidation/server, embedded reference oracle, schema intelligence, Lua grammar/cross-file/event/validation-trust/noise/incremental/overlay/UI integration consumers. No capability-map delta yet. Record exact starting commit/source hashes after the preceding #96 internal checkpoint; do not overlap source edits with its frozen precommit.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE / AAR

Pending. Existing #64 remains open, including its earlier faction and installed acceptance scope. This follow-up cannot close all validation or runtime issues.
