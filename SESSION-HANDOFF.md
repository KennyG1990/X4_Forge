# SESSION-HANDOFF — X4 Forge (degradation checkpoint 2026-07-23)

## 1. Project / bounded unit

- **Project:** X4 Forge extension + Express sidecar in `F:\DEV_ENV\X4_Forge`, `main`.
- **Task:** B73 — expose a configurable loose/unpacked X4 reference corpus through read-only APIs and use canonical IDs in validation.
- **Workflow position:** `CLASSIFY ✅ → PLAN ✅ → BASELINE ✅ → RECONCILE ✅ → DOCUMENT PLAN ✅ → IMPLEMENT ◐ → VALIDATE (paused) → REVIEW → DOCUMENT CLOSE → AAR`.
- **Plan/acceptance contract:** `docs/plans/2026-07-23-reference-corpus-api.md`.

## 2. Baseline / ownership

- Pre-change `HEAD == origin/main == b20687887fe8facfc699c1d6bcfa03291b26d675`.
- `BACKLOG.md` already contained user-owned uncommitted B71/B72 additions; preserve them. B73 was added above them without rewriting their text.
- Pre-change `npm run typecheck` passed (exit 0, 19.6 s).
- No Git mutation, commit, push, publish, game-directory write, mod write, or live-workspace swap was performed.

## 3. Reconciliation facts

- B46 already specified full-corpus reference sets. Existing `getReferenceSets()` came from `getObjectIndex()`, which mixes game install + mod workspace + filesystem roots; it is not a canonical validation source.
- Existing seams reused: `xsdValidate` semantic reference checks, `runProjectValidation`, scriptproperties parser/lint, object-index localization helpers, schema/config API, Directory Settings, public GET allowlist, selftest registry.
- Authoritative 9.00 corpus has exactly 32 unique faction IDs: base 21 plus official DLC additions. Required IDs are present and `riptide` is absent.
- User premise corrected: `libraries/scriptproperties.xml:1821` defines faction property `id` (`result="ID"`, `type="string"`). The API must expose it.
- `category` and `isreal` are not faction XML attributes. B73 documents them as derived authoring fields: player; hidden→system; nodiplomacyselection/aggressive→hostile; otherwise political; `isreal=true` only for political.

## 4. Implementation currently on disk

- `src/lib/xsdParser.ts`: additive `x4ReferenceRoot`; precedence `X4_REFERENCE_ROOT` → config → requested default; resolved existence flag.
- `src/lib/referenceCorpus.ts` (new): base + sorted `ego_dlc_*` faction/ware/map/macro/scriptproperty discovery, localization, first-definition provenance, source-stat signature cache, safe raw-file resolver, DLC add/remove/cache/path oracle.
- `src/server/referenceRoutes.ts` (new): public read-only status/factions/wares/sectors/scriptproperties/file/search/selftest routes; startup loader; canonical validation-set service.
- `src/lib/referenceLint.ts` (new): explicit Lua `GetWareData`/`GetFactionData`/`GetMacroData` literal warnings and suggestions; pure oracle.
- `src/lib/x4ObjectIndex.ts`: localization parser/resolver exported for reuse.
- `src/lib/scriptProperties.ts`: additive full property records (`name`, `result`, `type`) retained in each entry.
- `src/lib/xsdValidate.ts`: unknown faction/macro/ware findings are advisory warnings and include cheap suggestions.
- `src/server/projectValidation.ts`: canonical sets copied per project, project-owned macro/ware/faction definitions unioned, Lua literal findings layered/flattended.
- `server.ts`: route registration/allowlist/startup load, canonical sets replacing mixed-root validation sets, config POST field, selftest registrations, agent schema documentation.
- `src/components/DirectorySettingsModal.tsx`: unpacked-reference field and availability state.
- `scripts/route-integration.mjs`: isolated synthetic reference root + public/raw/traversal checks.
- `BACKLOG.md`: B73 SPECIFIED entry. `docs/plans/2026-07-23-reference-corpus-api.md`: Full-lane task record/contract.

## 5. Evidence already green

- Post-implementation `npm run typecheck`: exit 0 (15.4 s).
- `runReferenceCorpusSelftest`: 9/9 PASS — cache reuse, localization, macro index, faction.id, DLC add invalidation, DLC removal invalidation, safe file, traversal rejection.
- `runReferenceLiteralLintSelftest`: 5/5 PASS — faction/ware suggestions, Lua literal warning, Lua comment exclusion, known macro clean.
- Real configured corpus direct load: 32 factions, 1,902 wares, 170 unique sectors, 194 indexed source files.
- Required provenance: fallensplit→ego_dlc_split; kaori→ego_dlc_timelines; holyorderfanatic→base; loanshark→ego_dlc_pirate; trinity→base; riptide absent.
- Faction datatype first properties observed: id/string, name/string, rawname/string, knownname/string, shortname/string.

## 6. Degradation / AAR trigger

- Three PowerShell inline-command input failures clustered: embedded regex quote parsing twice and `$f` expansion inside a `tsx -e` XML fixture once. These are command-wrapper failures, not code/test failures.
- Rule of Three fired. Strategic Pivot choice: no more inline `tsx -e` or regex-heavy PowerShell validation. Resume only with file-backed selftest endpoints, `npm run test:routes`, and ordinary npm scripts.
- The third attempted validation did not run; it produced no Forge result and changed no files.

## 7. Exact next unit after Ken says `Execute`

1. Run `npm run test:routes` (isolated server/fixture; no live workspace swap).
2. Fix only reproduced failures, then `npm run typecheck`, `npm run lint`, `node scripts/oracle-sweep.mjs`, `npm run precommit:check`, `npm run build`.
3. Use an isolated HTTP server/harness to call the real reference endpoints and POST a project-validation fixture; do not use inline `tsx -e`.
4. MACHINE-STATE GATE still unanswered. Before `npm run test:e2e`, ask/confirm: Forge app state, X4 running, machine quiet. Verify e2e workspace-guard restoration afterward.
5. Fresh-eyes diff review; `graphify update .`; update capability map, B46/B73 records, ROADMAP/BACKLOG, project/global AAR, and overwrite this handoff with the final close.
6. Directory Settings is user-visible: without real rendered-host inspection, final UI proof is `PARTIAL` even if all static/API gates pass.

## 8. Existing unrelated eyeball queue

- B64-U2: scratch failing deploy → GuidedRail deploy step must render rose/red.
- B56/B57: installed VSIX Problems/IntelliSense/go-to-def/MCP/two-way-adopt checks.
- B64 U1/A1, B65 follow-ons, B69 CodeMirror UI checks remain separate from B73.

## 9. Commit question

- No commit was made. The current B73 work is an uncommitted degradation checkpoint.
- Suggested close title if/when VERIFIED: `feat: expose canonical X4 reference corpus through the Forge API`.

