# Validation trust and game-proof repair programme

Status: PARTIAL programme; batch1 source/API and batch2a policy/store core VERIFIED.
Batch2b deploy/API integration implemented; focused API/UI6/6 and routes498/498 PASS.
Final precommit/checkpoint pending. Not installed or release-verified.
Lane: FULL. Authorized by Ken on 2026-10-23 to fix Claude's critical review.
Goal: make every verdict identify its subject, distinguish mod defects from incomplete checks,
and carry accepted uncertainty through deployment into session-bound game evidence.
Architecture: extend shared project validation, validationDelta hashes, existing action/history
receipts, ADR-F5 workspace authority, and runtimeDebugSession; no alternate deployer or bridge.
Tech stack: TypeScript/Express, existing XML/Lua engines, Playwright ephemeral stack.

## PLAN / acceptance
- Batch 1 (this checkpoint): shared validation evidence envelope, strict inline validation
  input, explicit missing-schema/analysis coverage, deterministic finding identity; no gate weakening.
- Batch 2: exact per-finding acceptance with authenticated actor/reason, bound source/rule identity,
  durable deploy record, expected mod/source identity and write-boundary recheck. Never override
  authorization, path containment, wrong-target, stale source, or transaction integrity.
- Batch 3: reproduce current listener/property/reference/aiscript false positives against complete
  disk sources and the configured game corpus. Preserve genuine negative detections.
- Batch 4: game/save epoch and build/probe correlation on existing log transport; old-save and
  pre-deploy evidence cannot certify current execution. Reload control requires separate ADR and
  approval before any real game/helper installation; capability feasibility remains unproven.
- Batch 5: strict import payloads/dependency health, workspace client isolation proof, stable node
  identities, Lua coverage and helper-grounded traps, dependency-aware incremental validation.
- Existing owners: Forge #20 safety/receipts, #10 rule correctness, #14 runtime evidence, #41 UI
  analysis. Do not create duplicate programme issues. User's explicit repair request resumes only
  these necessary slices of previously parked #20, not the whole unrelated W3 programme.
- References: local AGENTS.md; rescued StarForge ADR-F3/F4/F5 and capability-map; actual game
  XSD/scriptproperties/helper sources for rule claims; previous ui-manifest-integrity plan.
- Boundary: source-only first batch; no installed replacement, mod/game/config write, release or
  push. Preserve unrelated B119 and access changes. No blanket suppression of engine errors.
- Risks: inconsistent legacy consumers, hash scope mistaken for full artifact, unknown source
  treated as empty, invalid request coerced into a valid project, missing dependency called clean.
- Recovery: task-local patches from HEAD302d301; no reset/checkout of unrelated work.
- Required batch-1 proof: failing-before focused fixtures, shared-engine/API integration, tsc,
  focused lint, source diff review; ephemeral e2e serial only after machine confirmation.
- Negative paths: same ID/different bytes; reordered files; omitted content; malformed payload;
  duplicate/case-colliding paths; parser unavailable versus real Lua syntax error; missing schema;
  no 'verified' label from empty/partial coverage. Identity explicitly covers validation inputs,
  not all packaged bytes; batch2 must bind the full artifact separately.
- Evidence: test-results/validation-trust/; commands/results and close recorded here.
- Broad full-suite, installed/native and live-game proof are later gates, not inferred from tests.

## BASELINE / RECONCILE
- HEAD302d301: installed ui.xml hotfix already verified; 18 current listener findings unresolved.
- Existing dirty tree captured via git status; no task edits overlap dirty executable files.
- runProjectValidation composes real schema/property engines but exposes one boolean; silent
  unavailable schema paths can leave it true. validationProjectContentHash already exists.
- deploy-verify already requires explicit path/workspace and emits modId on success, but lacks
  caller expectedModId/source hash enforcement. Not a singleton-only deployer.
- Workspace registry/CAS and structured FORGE-STATE probes already exist. Log segments distinguish
  deploy/rotation/profile boundaries, not explicit in-process save loads.
- Extend rather than replace: shared engine has recurring gaps, but replacing it would duplicate
  every consumer; repair its result contract and prove consumers in successive bounded batches.
- Brain recall CLI failed on Windows cp1252 output and returned weak path/title matches; no past
  solution inferred. Current code/ADRs govern. Capability-map delta pending actual proof.
- Machine confirmed: X4 running, quiet. No native interaction needed for batch1.

## Batch2a reconciled plan — recorded SPECIFIED before implementation (2026-10-23)

Ken's explicit decision: agents with deploy permission may approve individual findings;
record authenticated identity and reason. Read/write-only agents may not approve. Identity,
authorization, path safety, stale-source and transaction-integrity failures are not findings
that can be accepted. No caller-provided actor name grants authority.

Reconciliation changed batch sequencing: the existing AgentHistoryStore intentionally writes
after the response and tolerates failures. It cannot authorize an exception. Reuse the existing
atomic, hash-checked ActionReceiptStore instead; no shadow ledger. Deployment also has multiple
UI callers and disk-backed artifact bytes outside the validation hash. Therefore batch2a proves
the policy/storage/hash core before batch2b wires all callers and the write boundary together.
No deploy gate is weakened or override route enabled in 2a.

- Baseline: HEAD45078fd; preserve all unrelated dirty paths. Prior source evidence is committed;
  installed hotfix remains separate. Graph query located readiness/verification relationships;
  current code owns the receipt decisions. Brain recall returned weak title/path matches only.
- Extend-versus-replace: extend existing action receipts, artifact provenance planner and
  validation evidence. The best-effort history contract remains unchanged.
- Files: src/server/findingAcceptance.ts (new bounded service), src/lib/actionReceipt.ts
  (narrow approval metadata keys), src/lib/artifactPipeline.ts (deterministic full-plan hash),
  scripts/finding-acceptance.selftest.ts; source inventory if required by the audit.
- Steps: red policy/storage tests; implement authenticated-context decision plus exact source,
  artifact, rule/corpus and finding binding; persist through the existing receipt store and
  reject replay/corruption/storage failures. Add full artifact identity over planner entries.
- Negative contract: no actor/read/write/denied capability, forged request fields, blank reason,
  unknown/duplicate/stale findings, changed source/artifact/rules/corpus/target, safety failures,
  corrupt/missing/prepared-only receipt, persistence failure. Internal-check gaps alone do not
  become mod errors. Accepted findings and incomplete checks never promote clean validation.
- Proof: focused real-store temporary-directory integration, existing receipt/artifact tests,
  typecheck, focused lint and diff review. Evidence: test-results/validation-trust/ and this record.
- No new endpoint, network/spend/delete surface or live filesystem writer. Store test roots are
  disposable task fixtures. No UI changes, installed update, real mod/game/config writes.
- Rollback: remove only task patches from45078fd; no broad reset. Integration/API/rendered/
  installed/game proof remains required in later units and is not inferred from helper tests.
- Overall batch2 acceptance remains unchanged: authenticated route, full artifact expected identity,
  write-boundary recheck, durable deploy linkage, honest status, migrated callers. Until then PARTIAL.

## IMPLEMENT / VALIDATE / REVIEW / CLOSE
Reconciliation delta: incomplete-input API test reproduced an existing cross-file crash at
projectCrossFileValidation.ts's cue/library scanner (`f.content!.match` on absent content).
Batch1 includes two source-presence guards there; missing source remains an explicit coverage gap,
never fabricated empty bytes. This is necessary to deliver the planned incomplete-input contract.
Initial focused evidence absent test failed before implementation. Initial E2E fixture omitted the
ephemeral token (401, correct refusal); fixed fixture auth. Second E2E exposed the source crash.
Programme is not complete until all requested gaps are either proven fixed or explicitly
dispositioned with evidence. Batch checkpoints do not close the programme.

### Batch1 implementation and evidence (2026-10-23)
- Added src/lib/validationEvidence.ts: manifest-derived modId/version, explicit unresolved identity,
  SHA-256 over exact supplied validation inputs (including absent-content and kind distinction),
  source-bound finding IDs and mod-finding/check-unavailable categories. Hash scope is explicitly
  NOT full deploy artifact identity. No outcome claims VERIFIED or game execution.
- Shared projectValidation emits the evidence; unavailable schema/reference/property/vocabulary,
  patch simulation and bounded Lua gaps are retained. Warning suppression cannot erase coverage gaps.
- Validation API returns top-level modId/sourceHash, rejects malformed/ambiguous subjects, retains
  known identity on internal failures, and refuses incomplete last-green baseline promotion.
- Disk loader explicitly reports enumeration/stat failures and every file beyond its 500-file cap.
- Cue/library scanner no longer throws on omitted MD content; evidence retains the missing source.
- New focused selftest:30/30 (red-before absent-envelope fixture recorded in session output).
- Existing shared validator selftest:7/7; cross-file:33/33; UI manifest integrity:16/16.
- Real authenticated API E2E:3/3, zero flaky, treeGone=true (repeated green after final source changes).
  Receipt copied to test-results/validation-trust/e2e-verdict.json. Red runs retained by harness archives.
- Typecheck passed; final mandatory checkpoint hook also required. Focused lint passes with one
  pre-existing any warning in projectValidation. diff --check passes on task code.
- No new routes, permissions, network/spend/delete capability or durable store. Existing source
  inventory candidate adds only validationEvidence.ts; exact-hash reviewed promotion PASS
  (e124290535ff161bbaa7d3aafe48106f81734fa9cf805e51460f2f031ccc4323).
- Installed server still SHA256103336b060744cbdf2b0d3232bbb0a1d92ad7c059bb8bb564bc4c35e5522ef08,
  process34680 on60019. Ephemeral3200/3201 stopped. No installed/mod/game/config writes.
- Fresh-eyes review: legacy ok and existing deployment gates deliberately remain unchanged;
  category/identity projection is not an acceptance/bypass mechanism. Batch2 must wire authenticated
  per-finding acceptance, validator/corpus fingerprints, full artifact identity and durable receipts
  together. Existing #20/#10/#14 remain open. No installed/native/full-suite claim.
- Capability-map delta: source-only validation evidence capability, not yet published/installed;
  durable plan records this boundary rather than upgrading the installed capability map.
- Suggested commit: feat(validation): expose subject identity and incomplete-check evidence.
- Final manual npm run precommit:check PASS: capability12/297/1/11, action receipt82/57,
  writer inventory42/11/3/47, typecheck and remaining mandatory gates green. Full task-file
  ESLint --quiet PASS. Source capability inventory promoted after exact diff review.
- CLOSE: bounded source/API batch VERIFIED; overall requested repair programme PARTIAL.
  Installed/native proof intentionally unavailable for this batch because no installed update
  was performed. No full-suite, real-mod deployment, current-listener correction, override flow,
  expected deploy-hash enforcement or save-load epoch claim. These remain subsequent batches.
  executing-plans checkpoint pause applies before the next batch; degradation call reinforces it.

## AAR
Triggered: recall output encoding failure; retry with Python UTF-8 mode if recall needed.
Sustain existing ownership/reuse. Improve tool output bounds and exact path discovery.
Improve tests: authenticated API fixtures must supply E2E_TOKEN explicitly; 401 failures were
fixture defects, not product validation failures. Lint caught a control-character regex; use
character-code inspection without disabling the lint. Missing-source fixture exposed a genuine
crash and is now pinned. Degradation call made; stop at this checkpoint before another batch.
Highest-risk observed weakness: incomplete validation can be mistaken for a complete clean result;
batch1 adds explicit coverage without changing deployment permission.

### Batch2a implementation / review checkpoint (2026-10-23)

- Implemented the explicit deploy-authorized-agent policy in a server-only core. The principal
  parameter is trusted server context, NOT authentication; route construction remains batch2b.
  Request objects cannot supply actor/capability fields. Read/write-only and constrained deploy
  actors fail. Each acceptance requires the current binding hash, exact finding ID and reason.
- Binding covers manifest identity/version, validation source, full artifact, validator, corpus,
  target and current evidence/coverage. Changed facts expire the acceptance. Unavailable checks
  alone are not mod errors; safety failures are never approvable. No baseline promotion occurs.
- Reused ActionReceiptStore, including atomic writes, reopen/hash validation, strict metadata,
  immutable authority and prepare/commit lifecycle. Stored result says finding-accepted-not-deployed.
  History remains best-effort and cannot grant permission. A preparation/storage/readback failure
  stops the operation; prepared-only receipts do not resume automatically or authorize a deploy.
- Added artifactPlanIdentity over the real plan's entry paths/byte hashes/sizes/loose flags,
  packaging format and ownership rules. Unlike the semantic hash, it includes arbitrary binaries.
  It does NOT independently read current disk bytes: batch2b must rebuild/recheck the plan at the
  write boundary and preserve materializer source-drift rejection.
- Focused test started red because the core did not exist. Final focused40/40, real receipt
  regression119/119, artifact47/47 (suite reports symlink fixture unavailable on host), focused
  lint PASS, typecheck PASS, diff whitespace PASS. Focused evidence:
  test-results/validation-trust/batch2a/focused.log. Existing validation-trust30/30 also green.
  Full manual precommit PASS: capabilities12/297/1/11; receipt coverage82routes/57surfaces;
  durable writers42filesystem/11host/3browser/47SQL; tsc and remaining mandatory gates green.
- Fresh-eyes review reproduced a terminal-receipt gap: committed status/authority alone allowed
  a different terminal result. Tightened verification to require the exact approval code and
  after-resource hashes, then reran40/40. Renamed canDeploy to validationAllowsDeploy to avoid
  presenting a policy-only result as complete deployment authority.
- Inventory candidate byte-identical to reviewed manifest: e124290535ff161bbaa7d3aafe48106f81734fa9cf805e51460f2f031ccc4323.
  No route/capability permission changed. No promotion necessary. No installed capability-map delta.
- Read-only installed baseline reconfirmed: server SHA256103336b060744cbdf2b0d3232bbb0a1d92ad7c059bb8bb564bc4c35e5522ef08,
  sidecar34680 listening60019; X4 process33512 running. No installed, mod, game or config writes.
- Required remaining batch2 integration: authenticate from middleware; derive real version/corpus
  fingerprints; migrate every UI/API caller to expected mod/artifact identity; carry exact approvals
  into the deploy record; recheck source and receipts immediately before writes; qualify baseline,
  readiness and user-facing status; prove actual route negatives in isolated E2E. No part of that
  is claimed from these helper/store tests. Full programme and deploy override feature stay PARTIAL.
- AAR triggered: plan split after discovering best-effort history; read-output truncation and an
  avoidable Windows rg glob mistake; fresh-eyes correction to receipt verification. Sustain existing
  receipt/planner reuse and genuine negative tests. Improve tool reads to one bounded surface and
  rg --files discovery. Highest-risk observed weakness: terminal status alone can be mistaken for
  the intended operation; exact outcome-code/hash checks now pin this core. Project lesson banked
  here. No personal memory update. Degradation call: finish checkpoint, then pause per executing-plans.
- CLOSE: VERIFIED bounded policy/store/hash core; PARTIAL overall feature and programme.
  No API/authentication/installed/deployment claim. This unit adds no visible surface, so rendered
  proof does not apply here; it remains mandatory when batch2b changes actual caller behavior.
  Scope stayed within the reconciled2a plan. Rollback is the six scoped source/test/record files,
  not unrelated B119 work. Commit point: feat(validation): add exact-finding approval receipt core.

### Batch2b deployment/API integration — SPECIFIED (2026-10-23)

Bounded unit: wire the existing exact-finding core into the actual deploy transaction and all
browser deploy callers; prove authenticated scratch HTTP deployment, not only core helpers.
Baseline c829e39; server/routes/core clean; unrelated dirty B119/access/record files preserved.
X4 running and machine quiet explicitly confirmed. No real game/mod/config/installed writes.
Brain recall returned unrelated Bannerlord matches, not evidence of an earlier solution.
Graph navigation identifies server.ts as the shared compiler/transaction owner. Existing
ActionReceiptStore and destructive recovery are reused; no second approval/history store.
ADR-F4/F5 explicit-subject and addressed-state boundaries remain intact. Existing legacy deploy
must converge on the verified handler, not retain a weaker alternate write path.

Contract and implementation:
- Preview returns manifest modId, semantic sourceHash, complete artifactHash, bindingHash,
  categorized findings and coverage. Applying requires all expected identities; no auto-accept.
- Authenticated middleware identity and effective deploy route authority alone approve findings.
  Body identities are rejected. Approval receipts precede writes; a prepared deploy receipt links
  their immutable hashes. Final receipt records verified deployed bytes and qualified outcome.
- Freeze the artifact plan; replan/hash and reread approval records before each target activation.
  Recheck validator implementation, effective corpus/schema inputs and resolved target binding.
  Failed final record persistence rolls back through existing recovery; never report success.
- Legacy /deploy delegates to the same gates. Five browser callers use shared preview/apply helper.
  Existing checklist exposes qualified validation; readiness metadata preserves that qualification.
- Approval/incomplete validation never promotes the clean baseline. No new approval-editor UI,
  game reload helper, broad rule repairs, public release or installed update in this unit.

Acceptance: real authenticated API scratch tests prove no-approval refusal, exact approval actor
and reason, actual output bytes and durable linked deploy record; wrong mod/source/binary/target
or stale binding refuses before writes; read/write/constrained actors cannot approve; malformed
approvals refuse; receipt persistence failure cannot produce deploy success. Legacy parity and
browser preview/apply behavior covered. Source/receipt negative tests exercise write-boundary
guards. Typecheck/lint, focused regressions, isolated E2E and precommit required. Inspect actual
rendered caller outcome when browser behavior changes. Installed/game runtime explicitly excluded.
Evidence: test-results/validation-trust/batch2b/ plus canonical E2E verdict/attachments.
Rollback: scoped source changes only; scratch fixtures own cleanup and config restoration.
Risks: compatibility break for clients applying without preview (intentional fail-closed, documented
migration), receipt storage failures, large artifacts/rules fingerprint cost, stale parsed caches.
Fresh-eyes review must check these and ensure no alternate writer bypass remains.
Capability-map delta pending actual proof; repository plan is authoritative until then.

#### Batch2b integration checkpoint and API migration

Implemented shared deploy/deploy-verify handler, middleware-only principals, full byte planning,
mandatory preview identities, durable linked approval/deploy receipts, activation-time source and
receipt rechecks, qualified baseline/readiness records and all five browser callers. Legacy deploy
is now the same guarded writer, not a parallel weaker implementation. Existing route integration
callers now pass expected identities explicitly; negative requests remain negative tests.

API clients first POST `/api/agent/deploy-verify` with `{path, dryRun:true}` (or an explicit workspace).
Even a mod-finding refusal returns `modId`, `modVersion`, `sourceHash`, `artifactHash`, `bindingHash`
and `validation.evidence.findings`. Apply requires `expectedModId`, `expectedSourceHash`,
`expectedArtifactHash`, `expectedBindingHash` copied from that preview. `sourceHash` is explicitly
the semantic validation-input identity; `artifactHash` binds full emitted bytes PLUS included disk
inputs and packaging/ownership rules, including binaries outside semantic coverage. A stale
approval binding or expected identity is HTTP409. No successful preview means no browser write.
Optional `acceptances` is an array (maximum127) of `{findingId,bindingHash,reason}`. No actor field
is accepted. An authenticated deploy/all agent must also pass effective capability constraints.
Successful responses include `deployRecord` and `acceptanceRecords`; durable deployment resources
link each approval receipt ID and hash, retaining exact actor/reason in those approval records.
Accepted/incomplete means deployed bytes verified, NOT validation clean and NOT game verification.
Safety/integrity gates (auth, paths, malformed XML, compile integrity, stale source, duplicate ID,
target identity, transaction/receipt storage) remain non-overridable. No approval editor UI added.

Reconciliation changes required for correctness:
- Inline artifacts previously resolved an empty source root toward cwd. Added explicit memoryOnly
  planning (no disk walk or cwd rules), with positive/negative regression checks.
- Real API proof reproduced a second validator gate: Extension Doctor repeated an accepted Lua
  syntax finding and rolled the deployment back. Doctor now retains its canonical diagnostic;
  only an exact source-bound finding ID already approved can pass. New/unaccepted findings and
  duplicate/folder ID failures still roll back. Tests include the duplicate-ID negative.
- Corpus identity includes effective parsed indices and raw schema/symbol/base/DLC bytes, avoiding
  mtime-only fingerprints; implementation identity captures loaded source/dependency lock or bundle.
- Existing shared writer count decreases by three mkdir sites when the legacy implementation is
  removed. Reviewed durable inventory delta only; capability source-boundary review still pending.

Observed proof so far: authenticated scratch API deployment and real rendered Playtest button PASS,
including actual copied Lua/binary bytes, reopened receipts, wrong mod/source/artifact/binding,
read/write/constrained-deploy denial, forged actor/missing reason, unavailable receipt-store refusal
before staging, stale binary rejection, legacy parity, duplicate-ID exact rollback, changed target,
clean baseline promotion and oversized-source incomplete deploy without approval or green baseline.
Inspected `test-results/validation-trust/batch2b/qualified-real-deploy.png`: qualification is visible;
the existing narrow sidebar clips checklist detail columns (not claimed repaired by this batch).
Regressions: acceptance40/40, artifact49/49 (host symlink fixture unavailable), readiness22/22,
runtime adapter45/45 including qualification persistence. Typecheck and focused lint pass (warnings
remain). Final combined E2E, full route/build, inventory/precommit and checkpoint still pending.

AAR triggered: repeated command quoting/path/output-size mistakes and rejected patch contexts;
fixture lacked workspace authority at first, and a valid small Lua fixture was incorrectly assumed
incomplete. Preserved failed verdicts; corrected fixtures rather than loosening assertions. Real
integration exposed the repeated doctor gate, which core tests could not prove. Sustain actual
authenticated scratch writes and durable readback. Highest evidenced risk: a second validation
owner can contradict an explicit acceptance; canonical finding identity now joins those owners.
No personal memory write. Overall programme and installed-product deployment remain PARTIAL.

Broader route reconciliation: first run493/496. The compiler write-boundary assertion passed;
the failing artifact assertion was the older UI schema check against this harness's intentionally
minimal corpus (no addon.xsd). Its selftest now requires an explicit failed/incomplete result with
only UI_SCHEMA_UNAVAILABLE when that schema is absent; registration/mod failures still fail it.
The actual game-schema success remains required in the separate corpus-backed E2E, not inferred
from this minimal fixture. Two runtime comparisons selected the real, newer X4 debuglog through
discovery. The harness now seeds an explicit scratch-log preference before server startup and
removes that exact fixture config before its initially-unconfigured permission tests. No real log
was written. These validation applicability corrections are non-clean AAR triggers, not waived tests.
Also fixed a duplicate variable declaration in the migrated route fixture caught before execution.

#### Batch2b final review / evidence boundary

Required behavior now evidenced through authenticated scratch HTTP, not helper tests alone:
- Exact approvals: deploy-key identity and reason persist in reopened committed approval records;
  deploy receipt links their IDs/hashes. Read/write and constrained-deploy actors are denied;
  forged actor fields and blank reasons are rejected. Same shared handler protects legacy deploy.
- Identity: wrong mod/source/artifact/binding refused; changing a byte in a5MiB binary, same-size
  schema bytes or configured target expires approval authority. No stale request writes the target.
- Persistence: unusable receipt root returns507 before staging/target creation. Successful records
  are reopened from disk and projected to history. Duplicate-ID post-write failure restores the target.
- Honest outcome: unavailable checks alone can deploy with incomplete-checks, no acceptance and no
  clean baseline. Accepted findings also cannot promote a clean baseline. Clean fixture can promote.
  Qualification and receipt ID survive runtime-adapter reconstruction; real browser preview/apply
  sends the expected identities and renders DEPLOYED BYTES VERIFIED with incomplete qualification.
- Artifact activation guard selftest refuses before target-parent creation; frozen plan is shared
  with preview and materialization. Memory-only plans cannot crawl cwd or combine a disk root.

2026-10-23 methods/evidence (all under test-results/validation-trust/batch2b/):
- npm run typecheck and focused ESLint: PASS,267 lint warnings retained,0 errors.
- Finding acceptance40/40, artifact49/49, readiness22/22, runtime adapter45/45: PASS.
- Serial isolated test:e2e deployment-trust + validation-trust + ui-manifest-integrity:6/6 PASS,
  zero flakes and treeGone=true; final-e2e-verdict.json, deployment-trust-api-evidence.json,
  qualified-real-deploy.png inspected. No intercepted deployment responses.
- npm run test:routes:498/498 PASS including required production build and public compiler101/101;
  route-integration.log. Failed earlier runs retained with their corrected fixture causes.
- Reviewed capability candidate6481fdc64639cab40d0c674410451690e882224581f1a1057e38d02890dcf2c2
  adds only deploymentTrust.ts and findingAcceptance.ts to discovered source boundary. Promotion
  passed full audit. Durable writer delta is only legacy mkdir42->39 plus fingerprint.
- Final full precommit and commit hook: pending; no bypass permitted.

Fresh-eyes review checked all five browser callers, both route owners, actual middleware principal,
frozen artifact/source/raw corpus identity, pre-write receipt reread, non-overridable integrity gates,
post-write doctor exact-ID matching, durable commit/readback and baseline/readiness consumers.
No permissions were added and no new network/spending surface. Existing receipt storage limits and
127-approval request bound apply; unavailable storage refuses. Legacy duplicate writer was removed,
not extended. Source capability delta: both deploy routes now share this binding/receipt contract;
no installed capability claim or wiki release-state promotion. Whole owner #20 remains open.

Explicit limits: no deterministic API injection at the late post-write receipt-finalization instant
or concurrent mid-activation source edit; those branches are guarded in code but not separately
proven by this E2E. The demonstrated storage refusal is pre-write; demonstrated exact rollback is
post-write duplicate-ID refusal. No installed/native Antigravity or in-game proof for this batch,
no whole-repository E2E/oracle sweep claimed. Existing sidebar detail clipping remains out of scope.
Host symlink fixture remains unavailable. All real mod/game/standing configuration/install files
unchanged by task writes; scratch configuration restored and per-run trees cleaned.

AAR: sustain actual HTTP auth matrix, raw-byte stale tests, durable readback and rendered caller.
Improve: syntax-check migrated JS before full suite; bound log output and use verified paths.
Tool improvement: pin explicit log authority in isolated harnesses instead of relying on discovery
timestamps. Banked here as project-specific hazard. Highest observed product weakness was the second
doctor gate contradicting exact approvals; fixed with canonical finding identity and rollback tests.
Remaining evidence limits are named above, not converted into success claims. No personal memory edit.

Final review correction: first-deploy extensions-parent creation was still before deployment receipt
preparation (even though approval persistence was earlier). Moved that existing mkdir behind receipt
prepare/readback. Added actual clean-mod/no-approval store-failure API assertion:507, no extensions
parent and no staging. This is a review-forced ordering correction, not a widened override.
Rerun combined E2E6/6 and final build/routes498/498 PASS after this correction. API discovery now
documents all expected identity fields and exact acceptances on both routes; two new HTTP assertions
prove this public migration contract and absence of implicit active-workspace deployment advice.
Validation ran against the baselined dirty working tree. Unrelated B119/reference/extension changes
were preserved and are not part of this scoped checkpoint; no clean-checkout release build claim.

Commit gate execution: the final full gate runs via the mandatory pre-commit hook (which executes
`npm run precommit:check` before Git creates the commit), rather than duplicating that long command
as a separate manual rerun. No check or hook is skipped. Earlier manual run stopped at receipt audit's
durable-writer prerequisite because the reviewed mkdir move changed its positional fingerprint;
all writer counts remained unchanged. Reviewed final fingerprint:
e585b54c6cd36db01d1b79c60a5bdc39d906b35d86f51ba96ee003aefcb756f7.
Final checkpoint authority: test-results/validation-trust/batch2b/commit-gate.log and checkpoint.json.
The final close status is pending until that full gate passes; no release/installed claim follows.
