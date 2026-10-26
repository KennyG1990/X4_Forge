# C06b — remaining workspace, runtime and release API contracts

Lane FULL. Status VERIFIED for bounded C06b local integration. Parent GitHub #20 / existing Notion safety task. Full Claude program remains PARTIAL; Kimi paused.

## PLAN
- Bounded unit: finish the remaining API input/subject census identified by C06a for workspace list/bootstrap/create/read/replace/merge/parked/restore, diagnostics, runtime-debugger/legacy brief/control, pasted-log diagnosis, and release prepare/download/export/verify/adopt.
- References: existing workspace registry/CAS/receipt adapters, capability descriptors and their additive-output/version policy, current Studio/extension/MCP callers, release artifact/report owners and validation evidence. No independent identity or receipt subsystem.
- Strict inputs reject arrays, scalar coercion, unknown options/fields and invalid flags before mutation. Preserve valid defaults and optional empty release fields used by the UI. Workspace replacement/merge malformed requests retain their existing failed-receipt preflight path and exact legacy missing-body error.
- Every mod-specific JSON result has actual scoped identity or explicit unresolved identity. Collections identify each item and carry collection/environment scope, not one fabricated mod. Workspace previews identify preview content; current-workspace head is distinct. Runtime source identity does not prove game-loaded bytes. Pasted logs identify supplied log bytes, not validated mod source. Binary artifacts carry equivalent identity headers.
- Release responses and persisted reports retain the validated input identity separately from prepared logical-artifact input identity (existing output ZIP hashes separately identify packaged bytes). Old reports lacking source evidence stay unresolved. No upload, WorkshopTool execution, metadata adoption into real sources or publication.
- Files: src/server/projectApiContract.ts, server.ts, focused test script and isolated API/browser tests; policy inventory only after reviewed delta. Documentation/evidence/trackers updated at close. Agent helper edits and root server/E2E edits have separate ownership.
- Risks: client compatibility, receipt/refusal truth, confusing hash scopes and stale report identity. Preserve permission, capability and write guards; no newly privileged endpoint. Rollback is this unit's exact task diff/local checkpoint, never other edits.
- Acceptance: real test-mod positive/negative/stale/recovery cases; malformed requests change no workspace/source/release bytes; failed workspace requests retain canonical refusal receipts; preview/current and two-mod identities do not cross; prepared report/download/export identities match the correct release; malformed/mismatched/missing/legacy metadata yields unresolved validation identity; artifact byte drift is refused; existing valid UI/MCP callers still work.
- Required gates: focused baseline/recovery tests; typecheck before heavier suites; lint/build; actual isolated compiled HTTP/MCP and rendered existing controls; selected serial E2E plus existing C06a regressions/runtime oracles; capability/receipt/writer audits and full precommit before local commit. No interim push. No native/game/package proof claimed for this backend batch.
- Evidence: private lab/evidence/claude-program/C06b, test-results/claude-C06b, sanitized docs/testing/claude-C06b-contracts.json. Preserve failed runs. No live or installed Dev mutation.
- Cross-process source coordination, A15 trusted project command execution, active-mod formatter A01/A04, A07 and C07 are separate outstanding units, not silently closed by this census.

## BASELINE
- Clean release worktree at a34ea676b7c87bfbfb5774ea4cbf618275b87a8a. Four protected discovery/server hashes and empty test ports captured in private C06b/baseline.json. Main checkout remains untouched.
- Prior live-host recreation is historical; no current liveness assumption. User reconfirmed X4 running, Claude using normally working live Forge, otherwise quiet before heavy/runtime validation.

## RECONCILE
- Graph query used for ownership orientation. Brain CLI recall returned weak file/topic matches; no prior implementation adopted from those results.
- Independent read-only review found workspace coercions, plural collection envelope gap, ignored release bump values and absent runtime/release subject coverage. Existing runtime-control strict schema, expected mod/head/session and receipt ownership already work and must be retained.
- Compatibility: runtime.debug.read@1 allows additional output properties. No descriptor/signature change is planned; any necessary contract change must follow the version guard. Legacy brief modId is used by current UI callers; validate it without silently selecting another workspace.
- Existing malformed workspace request regression explicitly requires a FAILED receipt. Do not move this rejection into a generic early middleware.
- Extend versus replace: extend C06a projectApiContract and current route owners; no replacement pipeline. Capability-map delta limited to added proven API coverage. No new spend/network/credential/delete/command surface.

- Reconciliation correction: release modId historically selects the artifact folder, which can legitimately differ from content.xml id. Preserve that public selector and label modIdScope:artifact-folder; sourceIdentity/validatedSource carry the actual content identity. Do not reject this legitimate difference or silently break release consumers. Same-user mutable report metadata is recorded provenance, not authenticated validation proof.
- Include existing GET /readiness in addressed identity coverage; preserve legacy workspaceId/clientId transport selectors. Hash preview content independently using the emitted manifest identity, never a stale imported manifest.

- Fresh-eyes correction: runtime-control also uses artifact-folder IDs for expectedModId/session pairing. Retain that operational selector with sourceIdentity rather than migrate the protocol. Legacy brief callers pass a sanitized display name; accept that alias only as an assertion against the addressed workspace.

## IMPLEMENT
- Reused the existing subject envelope, validators, registry/receipt flows and release owners. No endpoint or permission added.
- Workspace collections report each record separately. Reads, creation, updates, restoration and diagnostics carry the addressed head and actual content ID. Dry-run previews hash their own content, with currentSource kept separate. Invalid mutations retain failed receipts; defaults and legacy addressing remain valid.
- Canonical runtime payload and expectedModId pairing remain compatible. Runtime control exposes operational folder ID separately from sourceIdentity; legacy display-name filters cannot select another workspace. Pasted logs carry caller-supplied log-byte provenance.
- Release preparation records pre-bump validation evidence separately from prepared logical artifact inputs. Download/export/Steam verification/adoption report recorded evidence or explicit unresolved identity; ZIP hashes still identify output bytes. Persisted reports are not authenticated against a same-user local editor. No publisher/tool invocation added.

## VALIDATE
- Focused baseline: 17/98 before helper changes. Final reviewed helper checks: 119/119; C06a regression 35/35.
- Typecheck passed before heavy tests and after review. Lint: 0 errors, 618 warnings. Production build passed, including rebuilt backend after final provenance header.
- Final C06b + C06a E2E: 2 passed, 0 failed, 0 flaky; 108 C06b recorded HTTP calls across 7 scenario groups. Rendered existing release controls inspected. Owned process tree stopped; four protected live/Dev hashes matched after run.
- Actual compiled HTTP/MCP proof: 65/65 passed; own server/MCP children stopped. 134/134 runtime-discovered oracles pass in the existing incremental validation/scratch-deploy E2E (1 passed, 0 failed/flaky; owned tree stopped). Full standalone precommit PASS: 12 capabilities/301 literal routes/11 MCP aliases; receipts 85 routes/59 surfaces; typecheck and writer guards. Mandatory commit hook must also pass.
- Retained first failed E2E (test supplied conflicting header/body workspace IDs) and second failed E2E (corrupt fixture PNG refused by existing validator). Fixed fixtures, retained negative cases, did not weaken checks. Corrected PNG passed the existing pure image inspector before rerun.

## REVIEW
- Fresh-eyes review corrected folder/content ID collisions in release and runtime selectors, legacy UI display-name polling compatibility, exact prepared hash scope, explicit empty-workspace coercion and recorded download provenance.
- Test fixture uses isolated log/game/mod roots; scratch Steam metadata is simulated bytes, not a WorkshopTool or upload proof. No native-host, package-install or game acceptance claimed.
- Full C06 remains PARTIAL: cross-process source coordination, A15 trusted project gates and separately documented client/helper cases remain open. C07 and Kimi stay gated.

## CLOSE
VERIFIED bounded local C06b. Exact evidence: `../testing/claude-C06b-contracts.json`. No public, installed-host or game completion. Rollback: this unit's exact diff against a34ea676b7c87bfbfb5774ea4cbf618275b87a8a; no persistent schema migration.

## AAR — triggered
- Sustain: disjoint agent edit ownership, existing receipt/identity/artifact owners, isolated scratch writes, retained failure evidence and protected live hashes.
- Improve approach: reconcile operational folder selectors and current UI aliases before changing shared envelopes. Validate test assets with the production pure helper before integration.
- Improve tools: several reads used guessed paths/Windows wildcard arguments; prefer rg --files followed by exact paths and -g filters. Some output was oversized; use bounded reads and stored tool responses. Degradation called; finish this bounded checkpoint and hand off before another unit.
- Highest-risk observed weakness: a truthful content ID can still break a safety protocol when it overwrites a folder selector. Preserve explicit selector scopes and assert the distinct-ID case across real API calls.
- General/project AAR ledgers updated by this close; no global memory write.


Commit point: fix(api): complete workspace runtime and release subject contracts.
