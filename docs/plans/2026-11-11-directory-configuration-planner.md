# Shared directory-configuration planner (#96 prerequisite)

Task: extract the existing configuration POST's deterministic planning from persistence.
Lane: FULL. Status: VERIFIED bounded internal prerequisite; parent PARTIAL. Unit31; parent [#96](https://github.com/KennyG1990/X4_Forge/issues/96), under #19.

## PLAN

- Bounded unit: one read-only planner for legacy normalization, owner/scratch locks, merge, effective resolution, role validation, schema warning and reference-root invalidation. Wire the existing Studio POST through it; share the existing deploy-format normalizer without changing its semantics.
- Assumptions: baseline83ac1b1 is clean. Existing routes already support Studio settings and per-request format. Scoped instance grants, CAS/proposals, receipts, new API/MCP projections and agent configuration permission do not yet exist and are not claimed here.
- References: the parity specification, current server/config/path-role owners, ADR-F4/F5, capability map. July Agent-Brain reference-data discussion is a weak historical match, not an implementation specification for this task.
- In scope: source-only service extraction and focused handler compatibility proof. Preserve absence-versus-clear coercion, unknown format rejection, effective environment resolution, schema-independent saves, A15 and launcher pins, and follow-up ordering.
- Out of scope: standing config writes, actual directories/mod/game/IDE/credentials, UI changes, new authority/routes/receipt or persistence contracts, full HTTP qualification, installed/rendered/game claims, publication.
- Likely files: server.ts; src/server/directoryConfiguration.ts; shared deploy-format module; one focused selftest; existing ledgers/metadata only where the reviewed source-owner delta requires it.
- Risks: precedence or legacy response drift during extraction; failure after persistence must retain the current behavior without implying newly transactional apply. No new spending/network/deletion surface. Existing writer and authority stay unchanged.
- Rollback: revert only this unit's source/record delta to83ac1b1; no migration or live state to undo.
- Acceptance: existing handler uses the shared planner before its sole writer; matching baseline/new handler responses and ordered effects for positive and refusal cases; rejected requests perform no write/reload/manifest work. Planner itself has no write/host-launch effect. Legacy keys remain Studio-denied.
- Required checks: focused planner and actual source-extracted handler tests, in-memory exact baseline-handler parity, negative locks/format/overlap/missing-game/writer/follow-up failures, path-role/schema selftests, current typecheck/lint and normal precommit/hook; source/route/receipt/writer/policy audits. No build, listener, browser or full replay.
- Evidence: Forge QA flatroot/forge-1111-directory-configuration-planner.json, this record and targeted #96/QOL updates. Keep compact verdicts; no backup/runtime/helper copy family.
- Unavailable validation: full HTTP/router/auth, package/installed host and rendered UI gates remain held by the current live-work/lightweight-only instruction. This internal prerequisite cannot close #96 or qualify a release.

## BASELINE / RECONCILE

- Revision83ac1b1af4d5ef9c52d69d042f53bcc600931366, manifest0.0.82, clean tree, managed detached baseline. Existing private tooling/profile only; protected original Dev source/artifact/discovery pins remain the checkpoint.
- Graph shows config readers/resolver are shared consumers; config writes remain xsdParser.writeXsdConfig. Existing POST alone contains normalization/locks/merge/planning. validateDirectoryRoles already owns physical overlap/game-marker policy. Reuse these, not another settings engine.
- Current POST requires Studio before owner lock and read; keep owner-lock precedence before config read. Format normalization already serves deploy and settings; move that exact scalar policy to one shared module. GET/status/UI remain unchanged.
- Existing write then schema reload/manifest follow-up is not a transaction. This unit preserves and fault-tests that boundary; #96 still owns distinct persisted-but-follow-up-failed outcomes and durable CAS/receipts later.
- No capability-map delta yet: no new agent operation or broader authority. Exact source-owner metadata changes must be reviewed, not blanket regenerated.
- Preparation commands used nonexistent guessed test paths and a Windows literal glob. They made no writes/tests; subsequent lookup used actual file enumeration. This triggers AAR. Do not repeat those commands or expand into heavy gates.

## IMPLEMENT

Existing POST now calls planDirectoryConfigurationChange before its unchanged write/reload/manifest/success-response owners. The read-only service reuses xsdParser resolution and pathRoles validation; the exact existing loose/catalog normalizer moved to one shared module used by deployment and config. No writer, API route, key, grant, receipt schema or MCP projection was added. Existing owner guard still precedes config reads; Studio still precedes planning. Legacy coercion is explicitly labeled unsuitable as future agent input validation.

## VALIDATE / REVIEW

- Exact baseline83ac1b1 callback loaded in memory from Git stdin and compared against the current actual AST-extracted callback:52/52 matching status/response/saved-values/ordered-effects cases. No backend/listener/fixture files. Omitted/null/empty requests, format-only changes, explicit clears, legacy coercions, unrelated fields, environment precedence, schema incompleteness, owner locks, all four scratch pins, overlap/missing game, and read/resolve/storage/write/reload/manifest failures covered. Rejected calls perform zero writes/follow-ups. Reload/manifest failures deliberately still show persisted bytes in the harness, proving that transactional follow-up handling remains a #96 gap rather than inventing rollback.
- Path roles26/26 (including physical junctions and marker checks) and schema discovery14/14 passed using their existing private temporary fixtures; terminal cleanup completed. Policy bundle18/18 (89routes/64surfaces), changed production lint0errors/233existing server warnings, normal precommit/typecheck passed. The first standalone typecheck caught a missing test-only scenario label, corrected before the passing normal gate.
- Exact metadata candidate26fdff08d183b2ec36526b187e33bfeaaa5084cd90bc49e8cf586a1e7a72bd62 changes ONLY the two new source registrations. All route/dynamic/capability/MCP/signature fields compare equal. Promoted through the existing full audit. Writer fingerprint and receipt seal unchanged. Hook/graph/final retention and exact commit are recorded in the QA packet.
- Fresh review: no config persistence moved into the planner; no implicit authority; existing format precedence/fallback consumers reuse the unchanged normalizer. Success schema copy is the legacy post-save message, not a new public preview result. Cross-transport CAS/grants/receipts and persisted-but-follow-up-failed reporting remain required. No capability-map delta: there is no newly usable agent operation.

## CLOSE

VERIFIED source/handler prerequisite31; #96/#19 remain PARTIAL and release unqualified. Rollback is the exact scoped diff to83ac1b1, no runtime migration. Counter31, release review30 NOT_READY, next33. Commit point: refactor(config): share directory change planning.

Machine-state change: after the focused checks Ken said "You can run live testing now." This lifts the prior headless-heavy-test hold for the next current-source qualification. Preserve live Forge/X4, no computer use; finish this checkpoint before the full serial native/release harness. Old release-review hold text is historical, not the latest instruction.

## AAR

Non-clean: guessed nonexistent test/module filenames and literal Windows globs made read-only lookup failures; standalone typecheck found a missing test scenario label. Sustain exact old/new source callback and ordered-effect comparison, zero fixture copies and shared role/format ownership. Improve tool usage by enumerating actual paths and printing bounded fields; retain handles until terminal. Operator degradation checkpoint called: finish this coherent commit/handoff, next unit starts from refreshed records. Highest evidenced product weakness remains write-before-reload: injected reload/manifest failures save config then return500. This unit preserves that boundary; #96 must add distinguishable persisted/follow-up outcomes with CAS/receipts before agent apply. Project/global AAR banked; no memory edit or new skill claim.
