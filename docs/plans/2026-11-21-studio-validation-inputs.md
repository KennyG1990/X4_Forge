# Show which files Studio validation checked

**Owner** [#48](https://github.com/KennyG1990/X4_Forge/issues/48) under #74. **Lane** Full. **Status** SPECIFIED.

## Objective and baseline

Tell authors and agents what Studio's compile validation checked when workspace and disk versions disagree. Current G source is based on `408f254`. The compile route checks its prepared workspace manifest first, applies explicit file overrides, then fills missing paths from the source folder. It omits this provenance and the established validation-input hash. The panel labels all full checks `FULL PROJECT · LIVE`, including results that used old workspace bytes. The prior AiLive comparison documents the same input ambiguity. X4 is active, so focused checks must use temporary synthetic inputs on G.

## Bounded design

Reuse compile's case-insensitive input map and the existing validation evidence hash/scope. Return an additive `validation.inputs` with exact selected file counts by origin and a count of skipped disk inventory records. Where workspace or override text won over different disk text, include a count and up to eight project-relative paths. Record provenance per request, even on diagnostic cache hits. No extra reads, reimport, automatic overwrite, change to validation severities, added full findings body, or new source/deploy hash. Disk-version disagreement is information about the inputs, never a diagnostic or deploy authorization.

Carry the response through App, Sidebar and DiagnosticsCenter to PackageModDoctor only for the current workspace and diagnostic revision. Replace the current ambiguous badge with one describing the selected input mix. A collapsed detail only appears for different disk versions and names the affected files. Older backends retain a generic project heading. The Studio and native Problems use separate entry points. This unit changes only the Studio compile response and panel, not native Problems selection or passive result retrieval.

## Validation and rollback

- Reproduce the baseline gap from the current route and selection, then pin one fixture with different workspace/disk content for one path, one disk-only caller, one explicit override, identical overlap, and a case collision. Preserve current precedence and selected bytes. Compare the additive hash against the actual validation evidence. Identical selected content via distinct origins must keep the same hash but report different origins.
- Test no disk, skipped disk inventory, bounded mismatch paths, and proof the fixture files remain byte-identical. Test the visible label and details in a focused rendered or component check. Report the actual level of proof if the real host stays unavailable.
- Root types, ordinary route/runtime/precommit tests, and exact installed VSIX remain release requirements. Roll back only the helper, compile response and four UI prop hunks, leaving all existing candidate changes untouched.

Reconciliation found that validation-trust.spec.ts asserts the old LIVE badge. Update its existing cases and the existing route integration assertion without changing the test inventory. The compact MCP adapter already forwards the validation object.

During the actual callback fixture, the disk reader preserved a non-UTF-8 file as a missing-content entry. Keep that entry in validation and its hash, but count only disk files with readable content as contributing bytes to the check. The separate skipped count reports the unavailable input.

## Verification and close

**Status** PARTIAL. The existing compile callback and workspace validation function ran in-process against the real temporary G disk loader and validator. The baseline chose the differing workspace bytes and disk-only supplement while the panel said FULL PROJECT · LIVE and the reply omitted origins. With the repair, the same workspace bytes still win, the disk-only file contributes, the explicit override changes the expected hash, and the unchanged override keeps the hash while reporting a different origin. Case-collision behavior, skipped unreadable placeholders, unavailable or unlinked directories, and the bounded mismatch sample passed. The invalid override continued to return 400. Disk bytes matched before and after.

The actual validation component rendered the mixed and workspace-only labels, a named differing path, the missing-folder state, and the compatible fallback for older backends. Checking and local-only state hid the previous provenance. This was static React markup, without a browser or IDE. Eight scoped TypeScript files passed without emitting files and the normal integration test script syntax check passed. The existing ordinary route and browser cases now expect the new contract and are pending their normal test windows. The fixture was retired.

AAR. The first unapplied patch used the wrong Sidebar anchor. The first AST extractor required a null guard. The callback fixture then showed that skipped disk placeholders are still inputs for coverage and identity, so they were excluded only from the checked-byte count. The final compiler included the repository's ambient declarations. Full rendered delivery remains the highest-risk open evidence. Suggested commit point after required gates is fix(validation): show which inputs Studio checked.

## Compiled HTTP verification

The actual production-mode API listener in an isolated Dev scratch environment passed 16 focused HTTP checks. It preserved workspace and override precedence, bound source hashes to selected input text, disclosed origin changes with identical text, reported the unavailable linked folder, refused unauthenticated and invalid override requests, and left the three on-disk fixture files unchanged. Exact compiler-produced server SHA-256 was 413c0bc3386749cfa691f4cd37bba774dac5846f5fa2b811d4e1a616217b6813. The Windows Job and listener retired, and 14,977,016 bytes of temporary fixture/build output were removed.

The first temporary package layout lacked the validator fingerprint's owner metadata. The normal checked-out compiler output used its existing dependency tree. Windows netstat did not report a known loopback listener and the listener-only native table reported a zero state value. The corrected check uses the listener-only table's address, port and owner PID, with no state-code assumption. The capability audit identified the new module's missing source-boundary entry. Reviewed promotion changed only that entry, with all 315 route dispositions, one registrar and 21 MCP signatures unchanged. The generated candidate was retired after the promotion audit passed.

Full ordinary route and browser suites, installed Studio and VSIX verification, precommit and the release remain pending. Exact evidence is in the existing G receipt under studio_validation_compiled_http.
