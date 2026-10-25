# C02 — stable imported identities

Lane FULL. Status SPECIFIED. C01 must commit before this unit is integrated.

## Plan / acceptance
Replace time-based MD node/link IDs in the existing XML importer with deterministic,
file-scoped source identities. Reuse the parser, source spans, original-file fidelity,
sanitizer and addressed workspace authority. Preserve prior IDs/layout only when source
identity matches unambiguously in the same mod/source folder; never copy prior code or
properties over new imports. Link IDs/waypoints follow unique endpoint/port matches.
Duplicate siblings and descendants of ambiguous parents do not inherit identity/layout
after any file-content change. Identical imports remain deterministic. IDs are navigation
keys, not authorization or cryptographic source hashes; deploy hashes remain unchanged.

Scope: parser and shared identity/reconciliation helper, source metadata sanitation,
folder import and automatic reimport, direct XML import callers, regression tests.
No deploy policy, game writes, installed bundle replacement or Kimi implementation.
Risk: mistaken matches could move user layout or break graph links; reject collisions,
ambiguous duplicates, duplicate prior IDs and foreign source folders conservatively.
Rollback: backed-up exact task files in the private archive, scoped integration reversal.

## Baseline / reconcile
Reproduced on 2026-10-25: two identical calls to parseXMLToWorkspace produce different
cue/event/action IDs (test-results/claude-C02/before.json in the release worktree).
The original graph query identifies parser, importModFolder, nodeSelectionDocument,
source editing and canvas as consumers. Source spans already retain file and ordinal
semantic paths, which are edit locators but not stable identities. Folder import adds
a stem prefix and resets layout; it must use identity reconciliation before calculating
original-file graph fingerprints. Existing legacy IDs must remain usable when matching
the old source can be established from originalFiles and the stored source locator.

## Required proof
Deterministic duplicate imports, two same-named scripts in different files, unrelated
cue/action/file insertion, attribute ordering/whitespace, legacy ID/layout/waypoint
preservation, nested containers, duplicates, foreign source and malformed XML refusal.
Actual HTTP import/reimport + compile exact-byte parity with the regression mod; rendered
canvas layout retained after reimport; typecheck/lint, focused existing parser/fidelity
tests and required precommit. Evidence: private lab/evidence/claude-program/C02 and
repository test-results/claude-C02. Native packaged-host proof remains the release gate.

## Close / AAR
Pending. No implementation or completion claimed.

## Private implementation checkpoint — PARTIAL
Implemented parser-scoped deterministic identities and conservative unique legacy matches;
source identity survives sanitation, folder import/auto-reimport preserve layout only for the same
canonical source folder and mod. Direct file imports supply a navigation namespace without inventing
source ownership; unsourced paste has deterministic script scope but no inferred layout transfer.
20 focused cases passed (`lab/evidence/claude-program/C02/focused.log`), including named-action value
edits retaining identity while new source wins, duplicates/ambiguous parents, malformed XML, source
namespace isolation and legacy waypoint retention. A rejected multi-file patch changed no files;
reapplied after verifying exact state. Source patch/hash inventory retained beside the proof.
HTTP import/reimport + exact compile, rendered canvas, typecheck/lint and policy gates NOT RUN.
Not integrated into release checkout, built into installed Dev or committed. Stop at this private
checkpoint after the operator degradation call; fresh context must review the prototype first.

## Integration continuation — SPECIFIED
Baseline d3eeb2e, clean release worktree. All six existing source files match private pre-C02 backups after newline normalization; two files are new. Reviewed changes only. The patch check exposed CRLF/context mismatch without changing files; transfer uses verified per-file content instead. Reuse owned-server harness conventions, actual import/reimport and compile API, isolated rendered canvas tests, focused parser/fidelity tests, types/lint/build and precommit. No installed host or game writes. Existing contract remains in force.

Reconciliation delta: actual HTTP proof reproduced sanitizeWorkspace dropping finite node width/height. Preserve valid positive finite dimensions through the existing sanitizer; invalid dimensions stay omitted. This is required for the layout acceptance contract. The first legacy fixture failure was a mismatched graph fingerprint caused by renamed fixture IDs; corrected the fixture to represent a consistent legacy import without relaxing compiler guards. Both failed runs retained.

HTTP negative-path delta: effectiveModId names the artifact folder, not content.xml identity. Changing content.xml id in the same folder incorrectly reused old layout. Reimport now requires both artifact identity and declared content identity to match, alongside the canonical folder. Test retains both foreign-folder and changed-content-id refusal cases.

## Integration evidence and fresh-eyes review
The real Load Project caller now has an isolated Playwright/API proof with no route mocks.
It verifies deterministic imports, file scoping, legacy IDs/coordinates/waypoints, added files/cues,
fresh source properties, persistence, exact compiled source, foreign folder/content-ID/invalid
workspace refusal, ambiguous duplicates, recovery, stale preview refusal, and autoReimport
scratch deployment preserving fresh bytes and graph layout. Screenshots are inspected, not just DOM.
The final 15-group run before the quote edge passed with zero failures and zero flakes; its receipt
is in private C02/http-ui-receipt.json and test-results/claude-C02/run-0105cc3d-6ab0-4cbc-bac4-f8424eccebc3.
The next run must include the same-folder single-quoted changed-ID case. Reproduced helper evidence:
private C02/content-identity-before.json. Existing manifest attr extraction now supports both XML
quote styles; artifact ID still remains distinct from declared content ID.

Validation so far: 22 focused identity cases; existing compile fidelity14, file identity3,
workspace identity14 and guarded node/source editing15 all pass. Lint0errors/608warnings;
production build passes. Required policy/type gate running. No final close until its pass and
post-review test/build checks. Installed-host/package and game checks remain future release gates.

AAR triggered: preserve failed runs. Corrected a legacy fixture fingerprint inconsistency, missing
corpus environment, a rawXml assumption when real schemas expose attributes, invalid synthetic UI
registration and its missing referenced file. The old browser reload assertion could see a stale
local draft: replaced with actual Load Project plus new-graph adoption wait. The importer intentionally
refits the camera, so screenshots compare at the same reset zoom/pan; asserted position/width and
CSS coordinates rather than content-driven height (the prior height assertion produced a blocking
flake). Connection:close avoids the test client's idle keepalive reset without retrying mutations;
that transport observation is not a claimed server fix. One interrupted stale-draft wait was stopped
and its ephemeral ports verified absent. No failed/flaky run counts as a green gate.

Sustain: source/API/rendered proof separated; negative tests exposed sanitizer dimension loss and
folder-vs-content identity confusion. Improve: reuse complete grounded fixtures and follow the actual
UI import action from the start. Tools: keep bounded waits and per-request response artifacts;
source fingerprint and route response diagnostics must remain inspectable. Highest evidenced risk:
a parser-only identity test missed persistence and real caller contracts; the actual API/UI/deploy
fixture now covers them. Operator degradation call: checkpoint C02 after validation, fresh context
for C03. C03-C07, release/install and Kimi remain untouched.

Policy reconciliation: the first precommit run refused the new module outside the recorded
route-source boundary. Generated candidate SHA-256
69c8d25bcf1221ed019ccc17ecd951eaa0332788927239165204b3f7feec9902 was reviewed:
only sources adds src/lib/importedIdentity.ts; no routes, scopes, owners or permissions change.
Promote through the existing exact-hash audit command, then rerun required gates. This is an
inventory correction, not a weakened gate. Original refusal retained in C02/precommit.log.

## C02 close — VERIFIED (isolated integration only)
22 identity cases and 46 existing fidelity/file/workspace/source-edit regressions passed.
The final real HTTP/Load Project/scratch-deploy test passes 15 scenario groups with 1 E2E pass,
zero failures, zero retries/flakes and owned-tree cleanup. Post-review single-quoted content-ID
refusal is included. Final screenshots inspected: new graph is adopted, old node coordinates
and width retained at equal camera settings. Compiled source and fresh auto-reimport bytes match.
Final lint (0 errors/608 warnings), production build and complete precommit/type/policy gate pass.
Policy inventory changes only by adding importedIdentity.ts; 300 routes/12 capabilities/11 MCP
aliases and 84 receipt routes/59 surfaces audited with no permission expansion.
Proof: docs/testing/claude-C02-identities.json; private C02 logs preserve failed runs.
Protected live/Dev discovery and installed bundles remain byte-identical; no desktop/game inputs.
Fresh-eyes review corrected dimension sanitation, artifact-vs-content identity and XML quote handling.
Rollback: local C01 baseline d3eeb2e plus scoped C02 diff. No unrelated checkout changes.
Capability delta: stable imported MD identities and conservative legacy presentation transfer.
C03-C07, full release/package/native-host/game proof and installation remain open. Kimi paused.
AAR and operator degradation checkpoint above apply; continue C03 in fresh context.
Commit point: fix(import): preserve stable source identities and reimport layout.
