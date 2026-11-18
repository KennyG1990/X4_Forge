# Lua active-local limit development checkpoint

Task: commit the already-reproduced #61 parser repair independently of release preparation.
Lane: FULL. Status: VERIFIED source/compiler; PARTIAL delivery (2026-11-18).

## PLAN

- Bounded unit: shared parser rejects more than 200 simultaneously active Lua locals; retain lexical lifetimes, independent function slots, parameters, implicit method `self`, loop control slots, caller options, AST/cdata callbacks and source positions.
- Reuse the existing shared parser and grammar/compiler test. Apply only the previously reviewed two-file patch `710c0953c9e5a44f6bdb2f644647c96f09ddb348013366b9b95a161e56d8a5d9`; do not stage later Unicode/BOM/surrogate or cross-file work from the mixed working files.
- Authoritative references: existing #61 plan `2026-11-13-ailive-codesense-comparison.md`, LuaJIT parser/limits linked there, original archived compiler fixtures, and the November17 compile-only game report. This unit does not establish full compiler or project-gate equivalence.
- Scope: `src/lib/x4LuaParser.ts`, `scripts/lua-grammar.selftest.ts`, this checkpoint record. No dependency, endpoint, UI, schema, version, package, configuration or live mod/game change.
- Risks: incorrect lexical counts/coordinates or partial staging of unrelated work. Recovery: exact inverse in the owned qualification tree; before commit unstage only this reviewed unit if necessary, preserving every working byte. After commit use a separately reviewed revert rather than rewriting history.
- Acceptance: fresh exact HEAD-plus-patch grammar/compiler suite passes all48 original selected checks; scoped strict parser TypeScript passes; the actual unchanged ordinary commit hook passes on that selected tree; index blobs equal the qualified postimages; unrelated working, donor/private files and native Dev identities hold. Commit and nonforce-push this development checkpoint, then verify remote main, origin/main and HEAD equality.
- Negative paths: 201 locals, shadowed slots, loop controls, parameters and implicit self are refused; 200 locals, released sibling scopes and independent functions remain accepted. Preserve deferred-options and earlier-position controls. Verify exact patch inverse and owned scratch retirement.
- Validation applicability: source/static, compiler fixture, ordinary precommit and actual Git hook. Historical native route proof remains historical; installed/rendered/package/public-release/current-AiLive proof is explicitly deferred. These are not prerequisites for this internal source checkpoint. No computer use, visible browser, in-game action or service launch.
- Evidence: one finite qualification receipt under the existing November08 QA directory, ordinary-hook/commit/push results, this close. Reuse existing dependency provisioning and Windows Job helpers; do not install into donors or retain duplicate trees/helpers.

## BASELINE

- HEAD and origin/main: `d84d39a4389e16417c52c1fd54476546827e4e06`; detached checkout, empty real index. The working tree already contains substantial unrelated unfinished work.
- Exact HEAD parser SHA256 `78e1c2c50d49cf7377d55ce44284a35bf1abd177845762650221d3011c8875ca`; grammar `c21bd02c1e6ae44a4af24e72e815c82744500af4e2594705a825e0bdc105e0ca`. Selected postimages: parser `0f14440f53ceb0e3869a9f8630a4a304e8a55b3203d26372502b8109da9316ca`, grammar `4a678ba9cb75f38245b1a6e0784dfce9becec47437eeb486a48c0872b01aa984`.
- Historical baseline32/48 -> candidate48/48 and eight compiled native requests are recorded in the existing #61 plan. Fresh qualification remains required for this current-head source composition.
- Required CI at d84 is red on the unchanged dependency audit, owner #120. It blocks release readiness, not honest source checkpointing. No waiver or completed whole-feature claim.
- User authorizes serial isolated headless checks during live development. Private Dev IDE/backend and CodeSense remain protected, no live Forge/X4 interaction. On this machine Windows passive listener listings can omit a row or report owner0 while the same backend/established connection remains. For this no-service source/hook run, retain native creation identities, exact private membership and file pins; log passive socket observations without treating an incomplete listing as proof of a changed owner. Refuse a positively observed different nonzero owner.

## RECONCILE

- HEAD already has one shared `parseX4Lua` adapter and the original grammar/compiler suite; no duplicate parser is introduced. The selected patch applies and reverses exactly on current HEAD, independent of later #101/Unicode changes.
- Seven existing consumers continue to use the same parser contract. Caller callbacks, cdata raw meaning, deferred parsing and source coordinates are preserved by the selected controls.
- Capability map already records this bounded source/native capability (November17); no capability-map delta for committing it.
- Cadence correction: publish-before-commit applies to a versioned user-facing release. A verified development source unit can be committed/pushed without a store bump, while overall #61 and release delivery stay PARTIAL.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE

The exact two-file patch is independently qualified on d84, without staging later working-file hunks. Qualification context `forge-1118-local200-product-6c4afef812/qualified-context.json` SHA256 `8e53a8ae6f984b7f4d8f3f645e69a35fd811021809925c6c7a33efee85b40a26` retains full commands, outputs, byte inventories and protected-state pins. The single final QA receipt is `forge-1118-local200-product-retirement.json`; Git hook/commit/push results are separate facts to inspect there and in the owning issue.

- Actual shared grammar/compiler fixture: baseline32/48 (expected16 failures) in1.984s; identical candidate48/48 in1.688s. Both Jobs emptied. This includes nine archived real sources, existing cdata/callback/AST checks and the local-limit negative paths.
- Strict parser typing: the existing `src/types/luaparse.d.ts` plus the selected parser, strict/noEmit/NodeNext, passed in0.797s; Job emptied.
- Exact source inventory, duplicate-application refusal, patch forward/inverse, real working/index/ref, donor/compiler and private Dev native/file guards passed. Private Git metadata is parked before any real hook.
- Independent source review found no blocking defect in lexical slot accounting, coordinates, deferred options or exact two-file independence.
- Final commit is admitted only through the unchanged ordinary real-index precommit hook on this selected source tree. The hook result and commit identity are recorded by the actual commit, final QA receipt and owner#61; no bypass, alternate index or release bump is used.

All bounded parser requirements are evidenced. Source checkpointing does not close whole#61, install a candidate, retire a project check or satisfy the required dependency audit. Those delivery/release items remain PARTIAL. No capability-map delta. Commit point: `fix(validation): enforce Lua active-local limits`.

## AAR

NON_CLEAN: source checkpointing was incorrectly coupled to release readiness, leaving qualified product work uncommitted. Sustain isolated, exact-patch qualification; improve cadence by committing each coherent verified source unit and tracking release delivery separately. Highest evidenced risk is the mixed uncommitted tree; the bounded response is selected patch staging with raw working-byte preservation, not a broad commit or weakened release gates.

The first scoped type command omitted the repository's existing luaparse declaration and failed TS7016; the corrected command passed without changing types or source. First owned cleanup encountered a read-only private Git object; the guarded original removal behavior completed cleanup. Failed receipt `forge-1118-local200-first-attempt.json` SHA256 `262376a496863350a107353c15d165bd7f5c43961e9f69632930e9f6fb7c0476` preserves these failures. The temporary runner was recovered byte-exactly from its recorded output, corrected and kept only for this unit; no product working file or real index changed during recovery. Record failure state before cleanup and reuse the existing type/cleanup contracts. Degradation was called; the next unit belongs in a fresh context after this commit point.

The final private Git index serialization differed after its diff, so the first commit admission stopped before staging. Read-only reconciliation verified all1,116 stage-zero paths, modes and blob IDs equal HEAD plus exactly the two selected files; complete source inventory and the real index/HEAD were unchanged. Only that independently verified private-index pin was refreshed, with the old/new hashes and full mapping digest retained in the qualification context. This is a non-clean QA metadata admission, not another parser repair or a waived tree guard.
