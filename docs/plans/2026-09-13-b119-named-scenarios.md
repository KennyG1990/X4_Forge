# Computer-local named preview scenarios

Lane: FULL. Status: PARTIAL program; checkpoint1 VERIFIED bounded. Owner: B119 / issue #41 (no external writes).
Goal: name, save and switch realistic preview scenarios without Lua, then preserve the selected
scenario across supported source edits and undo/redo. Astra implements directly, no workers.

## Reconciled design and checkpoints

Reuse SourceEditor's primary Preview inputs, existing Session catalog issuers and sample/path/loop
update functions. No second renderer, source writer, source history, endpoint or dependency.
ADR-F5 requires immutable workspaceScope, never mutable mod name or an unbound fallback.
Rejected storage: ModWorkspace (would travel with Lua/export and undo B back to A); existing
localWorkspaceCache (quota handling evicts unrelated recovery data). Selected: bounded browser-local
data under a dedicated workspace key. Browser profiles/origins on this computer are distinct stores.
Persist data/hints only; source/profile/selection bindings and opaque authority are always freshly issued.

Checkpoint 1: save/switch/delete through Preview inputs, per-workspace local storage, exact source/menu
binding, profile and applied path->loop->sample replay. Names are unique per exact menu/source,
maximum 20 records and 240 Ki UTF-16 code units per workspace; no eviction/retry on quota failure.
Unapplied draft must be applied/discarded before switching or saving. Changed source is rejected,
not fuzzy-rebound. This is a usable bounded slice, NOT completion of the scenario contract.

Checkpoint 2 (still required): exact accepted source-splice lineage reissue through existing parent
acknowledgement and guarded history. Scenario B chosen after source edit A survives Undo/Redo,
including pre-App-ack render. Map exact source/loop/consumer identities, never display labels.
Keep all nine journeys, numeric issued/replay matrix, Scene counterfactual, three-menu/twelve-reference,
full E2E/precommit/package/install/native/release gates. No numeric oracle is changed by this unit.

## Baseline and boundaries

HEAD/main 93c9af111d63ca77c99dee11f21882c4073bcda6; broad dirty work predates this slice.
SourceEditor already has primary six-input Apply/Discard/Clear and exact source selection transfer.
History uses full source snapshots and delayed App acknowledgement. No scenario persistence owner
was found in SourceEditor/session; reuse of workspace-cache/layout-preferences is inappropriate.
Capability delta is proposed local scenario save/switch only; external wiki/issue updates deferred.
Authorized: repository edits and isolated rendered tests. No real mod/game/config/install/Git/push.
Rollback: exact per-unit before copies; reverse only owned additions after reviewing overlap.
Evidence: test-results/b119-named-scenarios-20260913/ (baseline, logs, verdict, screenshots, readbacks).

## Files and implementation sequence

1. Add fail-first store/replay selftests in src/lib/x4UiPreviewScenarios.selftest.ts.
2. Add src/lib/x4UiPreviewScenarios.ts for bounded storage and fresh catalog replay.
3. Extend src/components/X4UiSourceEditor.tsx in the existing Preview inputs disclosure.
4. Extend tests/e2e/x4-ui-source-editor.spec.ts for actual Save A/Save B/switch/reload and failure UI.
5. Review full delta, document checkpoint and next source/history continuation. No Git mutation.

## Acceptance and validation

Checkpoint 1: two named scenarios reproduce distinct applied values and canvas pixels; reload retains
names; duplicate names, malformed/oversize data, quota/security read/write failure, stale source/menu,
missing workspace scope fail explicitly. Same expression at two source ranges remains independent.
Only dedicated storage key changes; no source/workspace/history mutation and gameVerified=false.
Fresh paths then loops then samples are checked against current catalogs and authority; all-or-nothing
apply preserves current preview on refusal. No serialized authority accepted as permission.
Required: focused storage/replay and SourceEditor tests, tsc, exact lint/diff, serialized rendered
scenario and existing primary-input/persistent-canvas cases on3200/3201; inspect actual screenshots.
Before/after protected hashes and test-stack cleanup. Full native/package proof unavailable in this
isolated checkpoint and must remain open. Source/history criteria above remain required checkpoint2.

## Review-driven acceptance clarification

Quota recovery must include saved scenarios from older menu revisions: hiding stale entries from the
apply selector must not make them impossible to remove. Add a workspace-local management list using
the existing exact-ID remove owner. It can remove stale data without ever applying it. This is required
for the declared bounded-store recovery, not a source-lineage implementation.

Visual review invalidated the first pixel-only long-message positive: the known table remained visible
but the sampled long-message table was unresolved. Require issued geometry plus screenshots for two
supported text scenarios; retain long-text failure artifacts and its full-goal obligation, not a claim
that long wrapping works. Native/package/source-history continuation remain open.

## Implementation and checkpoint1 close

New src/lib/x4UiPreviewScenarios.ts and its selftest own local bounded data and fresh exact replay.
New src/components/X4UiPreviewScenarios.tsx supplies Save/Select/Remove plus stale-record management.
SourceEditor only imports/mounts it and feeds successful replay into existing profile/path/loop/sample
state setters. Existing Apply/Discard/Clear, source edits, history, Session, renderer and game owners
were not replaced or modified. The existing E2E spec gains one actual named-scenario journey.

Evidence root: test-results/b119-named-scenarios-20260913/.
- store-red.log: expected missing-module fail-first. Storage tests then PASS.
- scenarios-close-final.log: actual public Session path->loop->3 independent iteration samples reissued
  under fresh owner/opaque authority; restored display profile; source and saved data unchanged.
  Foreign source/menu/consumer, actual changed-source catalog, excessive loops and contradictory
  branch selections refused. Explicitly corpus-free binding proof, NOT paint proof.
- source-editor-close.log: existing mounted/SSR/source edit/history/selection negative matrices PASS,
  process exit0; existing exact source-owner boundaries retained.
- e2e-close-verdict.json generated2026-09-13T01:39:23Z: wrapper/child0,3passed,0failed,0flaky,0skipped,
  complete3/3 terminal records,0global errors; ownership complete and termination.treeGone=true.
  Persistent canvas/local edit8.6s; existing six-input Apply/Discard/Clear5.9s; named scenarios13.5s.
  New journey proves two visibly rendered text scenarios, save/switch/reload, duplicate-name refusal,
  no switch/save over draft, quota failure with byte-identical stored data/current pixels, immutable
  Lua/workspace/source history, and stale-record removal without applying it.
- browser-close screenshots are real rendered host captures with real configured corpus assets under
  the existing synthetic readiness envelope. Not installed/native or genuine reference-readiness proof.
- typecheck-close.log and prior typecheck-green.log exit0; final-source tsc/lint receipt recorded after
  final extra changed-source regression. lint-close.log exit0. Exact whitespace check passed.
- guards-close.json:45 unchanged other regression inputs,4 unchanged real source files,19 protected
  state/config files and exact guard-root membership. Final safety/receipt records follow cleanup.

Review: all checkpoint1 requirements done/evidenced. Checkpoint2 source-splice/history continuation is
NOT implemented. Saved scenarios intentionally refuse a changed source revision. Keepouts/manual
calibrations are not saved by this slice. No claim of completed long-text wrapping, full UX polish,
full numeric matrix, full E2E/precommit, installed/package/native fidelity or release readiness.
Capability delta: computer-local named scenario save/switch/remove on an exact source revision.
External capability map/GitHub/AAR projections deferred by current no-external-write boundary.
No new network/spend/credential surface. Dedicated deletion is explicit, exact-ID/workspace bounded;
20-record/240Ki-code-unit meter and quota/refusal paths verified, unrelated keys never evicted.
No commit, push, publish, install, real mod/game/config write. Before copies preserve prior dirty bytes.
Suggested commit point: feat(ui): add computer-local named preview scenarios (not committed).

## Triggered AAR

- Sustain: actual browser actions, exact Session reissue, independent byte guards and screenshot review.
- Improve work: splitting persistence from history was necessary to keep this checkpoint reviewable,
  but does not reduce the original B-survives-A/UndoRedo contract. Fixture code initially mixed known
  content into an unresolved table; a second fixture used supported independent known content.
  Public replay fixture initially guessed branch arm `if` instead of source-owned `then`; corrected
  from the existing type/fixture. Initial tsc exposed non-strict union narrowing and incomplete test
  workspace metadata; fixed without changing any runtime oracle.
- Improve tools: repeated broad setup/help outputs and guessed helper paths wasted effort; read
  bounded semantic fields and verified files. Preserve first/second/final/reviewed/close logs rather
  than overwriting red evidence. Reviewctl unavailable in this environment; manual diff and exact lint.
- Highest evidenced weakness: pixel inequality alone accepted loss of sampled content as success.
  Screenshot review showed the long-message table unresolved while its known anchor survived. Added
  positive issued-table geometry plus reviewed readable captures for both supported scenarios. The
  original long-text failing artifacts remain under browser-first/browser-final; diagnosis/repair is
  a separate required long-text recovery/fidelity unit, not silently treated as fixed here.
- Additional review fix: stale records counted against quota but could not be selected for removal;
  management list now removes their exact IDs without applying or clearing unrelated state.
- Close receipts:receipt.json/finalize.mjs verifier0; final management-only capture1/1,0flake/skip,
  treeGone=true; expanded management and readable Alternate screenshots actually inspected. All prior
  E2E bytes/order preserved. Final-source tsc/lint0; screenshot-only follow-up lint0; diff whitespace0.
  Final safety01:50:10Z X4stopped,3000/3001/3200/3201absent; external3100PID35884 untouched. All handles
  terminal. Graph update0 (11571nodes/29154edges/348communities), HTML threshold skip expected.
- Tool close: attempted delete+add same handoff path was rejected by apply_patch before any mutation;
  used an exact Update patch instead. Prior handoff retained as .before evidence. No data was lost.
- Project lessons banked here; no global memory or external ledger edits. Degradation checkpoint called
  after clustered test assumptions/output mistakes. Fresh continuation for source/history work.
