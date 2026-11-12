# Forge deployment transaction manifest containment

Status `VERIFIED` for isolated Forge. The originally pending X4 witness is now received under [issue #53](https://github.com/KennyG1990/X4_Forge/issues/53#issuecomment-6771224945), bounded to the tested manifest-free nested backup layout. The [November10 reconciliation](2026-11-10-claude-engine-witnesses.md) supersedes pending-witness statements below; broader discovery/recovery and presentation/delivery gates stay separate. This plan's original test instructions remain historical.

Clean Dev base `c0e1067e8311b44e2753db59e96e48498b3f41df`. The prior owned activation interruption left a direct backup sibling containing a full manifest and the new target. Forge's installed manifest scanner sees a direct child with `content.xml` as another extension. The native transaction currently keeps both stage and backup in that visible layout. Exact recovery replacement and first-deploy recovery restore have the same exposure.

Allocate a unique manifest-free container under the existing target parent. Keep `next` and `backup` inside it on the same volume. Use the current exact staged hash, Windows locked-root fallback, file verification and rollback flow. Clean empty owned containers after ordinary exits. Preserve legacy and nested backups when the canonical target is absent. Retire a stopped owner's nested apply backup only after a new native receipt commits and the physical target still matches that receipt. The prior recovery payload and receipts remain the independent rollback authority. Existing staging and backup paths stay under the configured target parent. No capability-map delta.

Reproduce a direct-backup interruption on the prior pinned bundle and prove Extension Doctor reports duplicate fixture IDs. Repeat on the candidate after activation, inspect exact retained backup and target bytes, and prove Doctor sees one fixture. A fresh guarded apply must still commit the selected files and clear the recognized prior container when the target exists. Exercise the existing compile artifact oracle for staging, exact rollback, locked-root behavior, and deployment recovery. Update the existing late duplicate fault fixture to identify the new physical stage. Run the writer audit and headless precommit. Preserve the frozen 0.0.82 inputs and source/installed/X4 evidence boundaries.

The official extension layout establishes a root manifest within an installed extension folder. Actual nested-folder handling requires a standalone X4 witness through Claude. Prepare the direct control and manifest-free transaction container with nested controls, exact install/cleanup and log evidence. The Dev code checkpoint proves Forge behavior while the X4 verdict remains separate. Rollback is `c0e1067` in the isolated Dev source. [Egosoft extension layout](https://wiki.egosoft.com/X%20Rebirth%20Wiki/Modding%20support/Steam%20Workshop%20for%20X%20Rebirth%20and%20X4/)

## Implementation and evidence

Native deploy, exact deployment undo and first-deploy recovery restore use unique manifest-free same-parent containers. The existing locked-root fallback receives the same nested child paths and preserves the backup when local rollback cannot be verified. Empty owned containers use empty-only removal. A stopped owner's nested apply backup is eligible for cleanup after a new canonical receipt and a matching current fingerprint. Pre-apply keeps nested backup evidence and preserves direct legacy backups when the target is absent. Legacy direct layouts use exact Forge name shapes and a stopped local owner. Recovery-specific abandoned containers remain available for inspection. No capability-map delta.

The owned `forge-53-nested-transaction.py` replay ran against the actual Extension Doctor route on two pinned servers:

| Case | Result | Private verdict | SHA-256 |
|---|---|---|---|
| Direct layout, `c1c5f6be…` | 68/68. Doctor saw the target and direct backup as duplicate IDs after interruption | `c53-2an6tqky/verdict.json` | `f30b71426730acbb0adbf3011b7972ac0f012feae4195034c51f14c94d972ccb` |
| Nested layout, `5c14bdfa…` | 71/71. Doctor saw one fixture. The nested backup held exact v100 and the fresh native operation committed exact v101 and retired the old container | `c53-7vjxz4q1/verdict.json` | `d1dd68dd74673cb67126175c05662de5f7b1977f9a55375256bc7c2b6e88c2ad` |

Final server SHA-256 `5c14bdfa76adde381adc329e9522c4c881e5b4e16d8099f698560d0e35fa05a5`, built from `c0e1067` plus this server diff. The same owned successor ran the artifact-pipeline oracle 108/108. This covered EBUSY and EPERM containment, exact undo and rollback, missing-target backups in both layouts, a changed-target cleanup refusal and active-owner protection. Both owned listeners and discovery records retired. The late duplicate preload passed its syntax check and retains its exact native stage trigger in the new layout. Typecheck, writer inventory, receipt coverage and required headless precommit passed. Full route integration is an additional release gate.

Claude's [READY handoff](https://app.notion.com/p/40e4618ed15b81b1b5fdc92a60d5d834?d=4114618ed15b81759f20001ce5d10d78) is comment `4134618e-d15b-8163-b744-001dd1a0648b`. The standalone fixture manifest SHA-256 is `eddcccfd858c2be07b304a3c15a8c3799149b58dab1a8a9c1a0385725d24af77`. All four payload hashes and both X4 9.00 MD schema checks passed. The engine witness is for the direct positive control and nested backup layout on the actual tested build. Await Claude's verdict and cleanup.

## Three-unit release readiness review

GitHub main remains `f76775f02dbd8c61a100233e9d11d659f7a5d39b`. [GitHub](https://github.com/KennyG1990/X4_Forge/releases/tag/v0.0.81) and [Open VSX](https://open-vsx.org/api/x4forge/x4-forge-studio/latest) still serve 0.0.81. Keep 0.0.82 pinned to source tree `c4d390da543184dc97281e156bac6d0eb88141eb` and the two previously selected receipt fixes. Its focused source evidence and pinned qualification recipe are ready. Short source, work, and full source-gate receipt paths were absent at this review. Machine-state confirmation remains pending. The three newer Dev checkpoints have separate source evidence, and the transaction layout awaits the game witness before release selection.

## AAR

Sustain reproducing the duplicate through the actual Doctor endpoint and testing rollback ownership separately from an ordinary successful activation. The first nested replay exposed two oracle assertions using the folder name instead of the manifest ID. Its other failure came from placing the artifact oracle's temp under the process working directory. The corrected run used the known manifest ID and a separate private temp. Fresh-eyes review moved nested cleanup behind committed physical verification and preserved both absent-target backup layouts. The writer audit now counts empty-directory removal explicitly, including the existing X4 fixture owner. The first commit command stopped before staging. The rerun uses ASCII quoting in PowerShell. The main remaining risk is assuming Forge's discovery scan predicts the X4 engine. The queued cold-start fixture tests that boundary.

## Current queue routing — 2026-11-10

The same pending packet is now on the [dedicated Forge board READY row](https://app.notion.com/p/4144618ed15b811d9c80dd0f86c011a3), superseding old AiLive comment 4134618e-d15b-8163-b744-001dd1a0648b for routing. Fresh read-only manifest and payload verification matched4/4; artifact/test semantics unchanged, no new static/runtime/game claim. Claude owns the X4-closed/lock-free install, exact logs, verdict and cleanup. No engine verdict was found in the complete currentboard or inspected issue/discussion evidence. See [reconciliation](2026-11-10-forge-coordination-evidence-reconcile.md).

The existing #57 log-dialect companion from comment4134618e-d15b-81d6-afb7-001d10b2b149 is separately identified in the new row: same startup, capture engine-written control load/discovery line or explicitly none. It changes no payload, game action or#53pass condition.

## Artifact publication retry - 2026-11-12 (#105)

Task: bounded Windows artifact stage-promotion reliability. Lane: FULL. Status: SPECIFIED.
Owner: [#105](https://github.com/KennyG1990/X4_Forge/issues/105), under #20. This is separate from
#68 filesystem-write diagnostics, #98 project-check staging, #104 bootstrap freshness and #100 XML
fixtures. Root owns every Node, QA, type/lint, browser, build and Git execution. This author may edit
only this plan, `server.ts`, and `scripts/route-integration.mjs` before the frozen diff is reviewed.

PLAN
- Bounded unit: opt in only `/api/agent/artifact/build` to guarded retries of the existing
  `replaceValidatedDeployment` stage-to-target rename. Reuse its transaction, exact fingerprints,
  held source coordinator, byte verification and rollback; no second publisher or staging journal.
- Observed failure: retained normal full-source C06 trace, 2026-11-12T18:08:49.391Z, HTTP 500
  `API_INTERNAL_ERROR`, 658.09 ms; EPERM renamed the nested `.x4forge-next-.../next` stage to the
  catalog artifact target. The second test attempt passed but the strict flaky verdict remains RED.
  Failure-time source/destination existence and the locking actor were not captured. Transient
  Windows access/sharing refusal is a hypothesis; neither Defender nor a PID collector is attributed.
- In scope: four promotion attempts maximum, with only three 25/50/100 ms waits for EPERM/EBUSY;
  unchanged physical parent/container/stage, exact staged bytes and an empty destination before
  retries; exact verification before a successful report; ownership-safe cleanup and prior-good
  rollback. Requested waits total 175 ms; actual elapsed/attempt times must be measured. That delay
  has not been established sufficient for the historical lock.
- Out of scope: native deploy/recovery behavior, the existing locked-root in-place fallback,
  source editing, response/authority schemas, public inputs, new environment variables/endpoints,
  another helper/runtime/controller family, whole-route/compiler replay, and the separate unexplained
  round-trip ECONNRESET. Native beforeActivate checks the old target and must not be blindly recalled
  after that target has moved into backup.
- Risks: the compiler is synchronous; bounded waits can block the backend event loop and require
  measured evidence. Guard failures must preserve foreign/changed evidence instead of entering the
  old unconditional recursive stage removal. The coordinator excludes participating writers, not
  outside filesystem actors. No hostile-race or kernel atomic no-replace guarantee is claimed.
- Rollback/checkpoint: retain the starting file hashes and exact bounded patch; reverse only this
  unit's hunks if rejected, preserving all pre-existing changes. No live Forge/X4/config/mod writes.
- Acceptance: a transient promotion refusal recovers to exact artifact bytes; persistent/non-lock
  failures remain failures; occupied/changed paths refuse without deleting foreign trees; normal
  persistent failure restores exact incumbent bytes; rollback/partial cleanup faults remain errors
  with retained evidence; no successful artifact report follows a failed/unknown write. Native and
  locked-root controls remain green and the C06 test/assertions/retry policy remain unchanged.
- Required validation: add named cases first to existing runCompileArtifactSelftest and require them
  in route-integration; root runs the actual existing artifact-selftest endpoint against the unchanged
  publisher and retains RED before production editing. Then root runs positive endpoint/materializer
  regressions, typecheck/lint, writer/receipt/capability audits, unchanged focused C06/UI-manifest
  source e2e, required full qualification and normal precommit serially. test:routes includes a build
  and therefore needs root's corresponding execution grant. No execution is granted by this plan.
- Evidence: existing QA root
  `C:/Users/Moshi/.codex/visualizations/2026/11/08/01a1b9d0-e607-7061-bb85-ae5fafcec5a2/`,
  existing performance packet and retained `test-results/e2e-source-full-four-core/.../trace.zip`;
  root assigns the exact new evidence field/path and preserves every historical receipt/value.

BASELINE
- Revision: bbb994de51ef5313d7a43421b3949e233270598a; existing unrelated dirty source/records retained.
- Before this unit: server.ts SHA256 dbb47534b697b7a02003555d95135386ee34b38fc38112caf34ea82f306bb4ab;
  route-integration.mjs 081186abb6231184c1693f407cc35336167b35ec3d8bbcd29d67f0b424f1c4f8;
  this plan 5f993c8e5bd025114e6a4f21594248f2724ee8eab293021558f9e64ae3c1bffe.
- No new baseline execution: root's full-source four-core outcome is RED with two XML fixture
  failures and two API flakes; ownership 854 observations/0 misses/tree gone and live protection
  unchanged. Other authors own the separate XML/bootstrap corrections.

RECONCILE
- Exact owner is artifact/build -> compileWorkspaceToFolder(catalog) -> replaceValidatedDeployment.
  The existing EPERM/EBUSY in-place fallback covers target-to-backup only, returns or throws, and
  cannot fall through to the failed stage promotion. Copy/catalog/hash descriptors close
  synchronously; no missing producer-stream await was found.
- Existing tests: runCompileArtifactSelftest, DeploymentTransactionHooks.rename and the registered
  artifact-pipeline-selftest endpoint; route-integration requires named rows and UI-manifest e2e
  calls the same endpoint. artifact-pipeline-check covers materializers, not this publisher.
- The default artifact caller lacks native deploy's optional ownership hooks. Enable only a private
  artifact hook; guard current paths and bytes within the existing owner without changing native
  hook calls. Fingerprint the incumbent before preservation reads and recheck before backup.
- No capability-map delta: reliability repair of an existing artifact publication resource.
- Test-first staging may use a local intersection type for future private options; it must leave
  the production interface/publisher/route unchanged until root captures the negative endpoint.

IMPLEMENT / VALIDATE / REVIEW / CLOSE
- Pending. First deliverable is a frozen test-only diff and expected RED names; root must release it
  before production implementation. No green or completed feature claim is made by this SPEC.

AAR
- Triggered: a real Windows promotion failed and later passed only on retry. Sustain retaining the
  exact trace and distinguishing the normal promotion from the older locked-root fallback. Improve
  failure-path coverage at the actual rename seam. Highest-risk evidenced weakness is one-shot
  promotion plus optional cleanup ownership; this bounded unit tests both without attributing an actor.

### #105 captured negative and implementation checkpoint

Status: PARTIAL, production source implemented; positive execution and final root review are pending.
The SPEC above preceded the test-only stage and production edits. Root's explicit production GO
followed the actual negative endpoint result; no green result is inferred from this source checkpoint.

VALIDATE - captured negative (root-owned)
- Existing private source backend on8973, existing GET artifact-pipeline-selftest, frozen old-publisher
  source SHA256 d8b8ef6d80cb94488d628ef8f714f9bd4a18fc36ceddbdbecebef0edbd26b00c:
  HTTP200, pass:false,126/140. All123 original controls passed; new17 had3PASS/14FAIL, with no other
  failures. Retained receipt: existing QA root/forge-1112-artifact105-negative.json.
- Root recorded child-tree closure, private8973 gone, protected3hashes and live listener identities
  unchanged. No production retry existed during that negative; removing the test insertion exactly
  reconstructed pre-unit server hash dbb47534b697b7a02003555d95135386ee34b38fc38112caf34ea82f306bb4ab.

IMPLEMENT
- Added private artifactBuildPromotionRetry and a private interrupted-stage-cleanup test seam to
  the existing transaction hooks. Only artifact/build opts in; no request/schema/env/route added.
- The existing owner captures physical parent/container/stage and incumbent identities plus exact
  tree digests. It reads incumbent identity before preservation and rechecks before backup. Stage
  promotion gets four calls maximum and EPERM/EBUSY-only25/50/100ms waits; every attempt rechecks
  exact stage/parents and the absent destination. No compiler/route replay occurs.
- Intentional moves compare the original directory identity against its expected NEW physical path;
  dev/ino/birthtimeNs distinguish physical generations and stable configured aliases remain bounded
  by captured physical parents. Changed/occupied output
  refuses, changed stages/parents remain retained, and ordinary owned failure restores and verifies
  the incumbent. Interrupted cleanup remains an error while rollback still runs. Unknown output is
  preserved rather than recursively removed. The native branch and in-place fallback are retained.
- The synchronous API thread can wait up to175ms in requested Atomics.wait calls, plus hashing,
  filesystem work and scheduling delay. Existing oracle detail records actual promotion gaps and
  whole transaction elapsed; these are measurements to obtain, not proof of universal event-loop
  overhead or the historical actor's lock duration. No added collector/public telemetry surface.
- Retained the same17 test controls and route-required names. No writer/receipt/capability manifest
  was hand-edited; root must generate/review any actual metadata delta before promotion.

REVIEW / CLOSE
- Source review caught an initial relocation-path comparison and corrected it before execution:
  dev/ino continuity survives rename, while the expected physical pathname changes. Real positive
  endpoint, type/lint/audits, unchanged C06/UI-manifest and required broader gates remain pending.
- Root review also required directory-generation continuity: the guard includes bigint birthtimeNs
  alongside dev/ino and physical path, matching the existing bootstrap's inode-reuse defense.
- Successful-promotion backup disposal retains the existing ownership/cleanup boundary: exact target
  and backup are verified first, then backup is retired, then target is reverified. A disposal failure
  returns an error with the verified new target in place; a partially retired backup must not become
  rollback authority. This does not promise original-tree rollback after backup retirement has begun.
- No Node, type/lint, browser, build, QA producer, Git mutation, live Forge/X4 or config/mod write was
  run by this author. Root owns subsequent serial validation and the final close; no commit now.
- No capability-map delta. Rollback remains the bounded #105 hunks over the preserved dirty baseline.

AAR checkpoint
- Sustain: actual old-publisher RED at the existing filesystem seam before production repair;
  all123 original controls stayed green and the unexplained second API flake remains separate.
- Improve work: distinguish physical directory identity from its pathname across intended moves;
  source review corrected that mismatch before a producer was launched.
- Improve tools: retain named-row results and real timing details; no new runtime/helper family.
- Highest-risk evidenced weakness remains synchronous bounded waiting and cleanup ownership after
  path changes. Root's actual positive controls/timing and unchanged native regressions decide the
  bounded result. Installed/native experience, general lock elimination and full-program completion
  are not established by this checkpoint.

### #105 bounded positive proof and PARTIAL close

Current status: PARTIAL. The actual source artifact oracle and writer audit are green; normal C06
POST/router qualification, required full-source/compiled gates, fresh precommit and commit remain
pending. This entry supersedes the earlier pending-positive checkpoint, without upgrading #105 or
its parent #20 to complete. The historic C06 flake and separate round-trip ECONNRESET stay recorded.

VALIDATE
- Root's actual private existing GET artifact-pipeline-selftest returned HTTP200, pass:true,140/140,
  with all17 new rows and all123 legacy rows green and zero non-promotion failures. Source SHA256
  remained0e9575e687bc7663806e6b5383e5cc4c675a5e92988f3791593ed5369f86debd. The endpoint exercises
  the actual compiler/transaction owner and private fault seams; it does not replace the pending
  authenticated C06 artifact/build POST and normal source-e2e verdict.
- Independently read finite receipt: QA root/forge-1112-artifact105-positive.json, SHA256
  8f54f96a873af494c5a61c1e9dc4ef6cf0eaa04128e8a40c3d92e1121b6205af. Receipt window
  2026-11-12T19:34:42.2148105Z to19:35:16.7603954Z; childExited/privatePortGone/protectedUnchanged/
  livePortIdentitiesUnchanged all true, with three protected hashes. No live Forge/X4 action.
- Real persistent-refusal attempt gaps were48.2186/68.2077/121.8338ms and the failed transaction
  took344.4691ms. Successful transient EPERM/EBUSY transactions took280.1026/134.5986ms, each with
  two promotion attempts. These include compiler/filesystem/guard work and requested synchronous
  waits; they do not isolate the wait's event-loop cost, establish the historical lock duration,
  prove175ms sufficient for all locks, or quantify all-workload performance. Requested waits remain
  exactly25/50/100ms,175ms maximum. The complete140-control endpoint took18342.3379ms; this is a
  combined test-oracle duration, not a user workload measurement or performance baseline.
- Root generated the real durable-writer candidate, independently reviewed CLEAN before promotion:
  QA root/forge-1112-artifact105-writer-candidate.json, SHA256
  773868f9a9f59c5bab369a77b1241c5f87db04921e946865ad1a941a764631fc. Its source fingerprint is
  431e1c28b2808f92ec9106851d86c4b3d8fc32437f1d2aadd1b36215c5b85241; current manifest matches it.
  Root promoted only the server call counts, source fingerprint and corresponding server policy;
  current config/durable-writers.json SHA256
  5180ec7ef9f91d993d932a12a5b67b399f4afb2751876e386c48f681453a8795. Root recorded the actual
  strict audit PASS for48filesystem/11host/3browser/3SQLite owners. No new writer family was added.
- Root recorded typecheck PASS before the separate XML-spec hoists and full/changed lint PASS with
  0errors/605warnings after those hoists. A fresh normal precommit remains required; no claim that
  the earlier typecheck validates every later source edit. Normal XML runtime qualification is
  separately root-owned and does not qualify C06 or the full suite by itself.

REVIEW
- Independent source review was CLEAN at the frozen server, route and plan hashes. It checked the
  artifact-only opt-in, dev/ino/birthtimeNs continuity at expected moved paths, finite lock-only
  retry, changed/foreign evidence retention, previous-good rollback, unchanged native/in-place
  branches, and success cleanup's documented post-retirement rollback limit. That review ran no
  runtime or tests; the positive receipt above supplies the separate actual oracle evidence.
- Acceptance now evidenced: both transient lock codes, finite persistent refusal and real gaps,
  immediate non-lock refusal, foreign/identical-byte collision retention, changed stage and physical
  parent/container/stage refusal, incumbent drift, exact rollback, rollback failure retention,
  partial-cleanup failure, no false success and opt-out behavior. Broader normal C06/full-source/
  compiled/precommit/commit requirements remain pending, not deliberately dropped.

CLOSE / AAR
- Status PARTIAL; no issue closure, release, installed/native experience or general deploy-reliability
  claim. No capability-map delta. Suggested eventual commit title: fix: guard and retry artifact
  stage promotion on Windows. Root owns qualification, metadata promotion and any eventual commit.
- Sustain: test-first actual old-publisher RED followed by140/140 at the same existing owner, exact
  source pins, preservation of every legacy control, real timing observations and clean private
  lifecycle/protection evidence. Preserve both receipts rather than overwriting the failure history.
- Improve work: the initial source review corrected intentional-move physical path comparison;
  root/fresh review added birthtimeNs generation continuity before execution. The result is bounded
  source proof with actual failure-path coverage, rather than an attributed Windows-lock diagnosis.
- Improve tools: the actual writer candidate and strict audit exposed the precise count/fingerprint
  delta before root promoted it. Keep generation/review separate from hand-filled metadata, and
  distinguish combined oracle duration from user workload/performance evidence.
- Highest-risk remaining evidenced weakness: synchronous wait plus guard/filesystem work occupied
  one persistent transaction for344.4691ms in this fixture; exact event-loop impact and larger-artifact
  cost remain unmeasured. Success backup-retirement failure can also leave the verified new target
  with partial old backup evidence; it remains an error and cannot authorize restoring that partial
  backup. These limits are explicit; no new collector/backup mechanism or unrelated work is added.
- This author made only the requested plan reconciliation after root's positive run. All executable,
  config and test sources stayed frozen while root's separate normal XML runtime was active.

## Recovery-reference credential-pattern collision - 2026-11-12 (#106)

Task: make newly generated recovery IDs compatible with the unchanged strict receipt identity policy.
Lane: FULL. Status: SPECIFIED; planning only. Owner: [#106](https://github.com/KennyG1990/X4_Forge/issues/106),
under #20; root reconciled three issue searches before creation. Separate from #105 artifact rename
retries. All source/config/tests remain frozen while root's full-source130 session71247 is active.
No code/test/config/QA/Git/runtime mutation is authorized until that job terminates AND root explicitly
releases the next stage. This SPEC changes only the existing planning record.

PLAN
- Bounded production change after release: in the existing DestructiveRecoveryStore.newId only,
  change clock radix36 to16. Preserve kind namespace, separators, eight random bytes represented
  as16hex characters, recovery schema/paths/retention, receipt authority and secret rejection.
- Observed failure: closed first-attempt deployment-trust trace/error-context/evidence show HTTP507,
  ACTION_RECEIPT_INVALID and the exact error `rollback.reference contains a policy-covered
  credential-like value.` on POST deploy-verify at2026-11-12T20:48:40.440Z, followed by the failed
  expectation at deployment-trust.spec.ts300. The earlier legacy deploy at line225 passed; it is not
  this failing call. Failed response says not-deployed/writeAttempted:false/fidelity:none and unused
  pre-state recovery removed. No EPERM is involved. Root's full-suite verdict remains pending.
- Inference, about99%: a generated base36 clock suffix crosses its '-' delimiter into the16hex
  nonce and looks like a short provider-key prefix to the unanchored credential pattern. This is
  a clock-content collision, not evidence that a credential entered the request or a random nonce
  collision. Exact failed ID bytes were not retained in the permitted closed artifacts; the snapshot
  was abandoned. Three retained recovery IDs belong to earlier successes. Never print possible
  credential-like references, response/request secrets or authorization headers.
- In scope: generator-only radix correction, actual producer-to-receipt-store regression controls,
  unchanged credential-shaped negatives, historical safe ID read/retention, no-write refusal and
  owned fixture cleanup. No public method/env/route/schema, policy exemption, regex weakening,
  alternate identity owner or new persistent helper/runtime/profile/script is needed.
- Risks: generated timestamp length changes from8base36 to11hex characters at current epoch,
  making deploy IDs35characters rather than32 (workspace IDs38rather than35). Existing bounds
  permit this; readers must be proved not to parse the old clock. Existing external user-owned IDs
  and older policy-invalid strings do not gain exemptions. Preserve all unrelated dirty work.
- Rollback: reverse only the scoped generator/test/record hunks; retained safe legacy records remain
  readable. No live Forge/X4, real mod/game, standing config or credential write.

BASELINE / RECONCILE
- Current generator source at destructiveRecovery.ts215-216 is
  `${kind}-${this.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`. The existing
  constructor binds this.now from options.now at212. This injection already controls actual ID
  generation, record dates AND retention; no Date.now override or new seam is necessary.
- Existing producer test owner is runDestructiveRecoverySelftest in destructiveRecovery.ts499,
  with three existing temporary roots and injected mutable now. Its controls already cover replay,
  before/after bytes, restart, abandonment, bounds, expiry, pruning and malformed records.
- Existing cross-contract test owner is runActionReceiptSelftest in actionReceipt.selftest.ts144:
  actual ActionReceiptStore at149, reusable fixture authority, strict writer/reader/canonical-byte
  checks, temporary-root finalizers and direct source invocation. Add the focused producer/store
  controls there, importing the existing recovery store; no new production dependency in the
  recovery module is needed merely to test receipts. Preserve all existing controls/assertions.
- Exact production chain: prepareDeploymentRecoveryReceipt -> DestructiveRecoveryStore.prepareDeployment
  (generated id) -> server15824 prepareDeployRecord -> deploymentTrust.ts355 rollback.reference ->
  actionReceipt.ts578 requirePattern -> unanchored SECRET_VALUE_RE at240/294. Failure precedes
  startStage(write), staging/extension writes and the #105 helper's execution.
- Reader boundaries: recovery validId at151-152 accepts bounded alphanumeric/underscore/hyphen IDs;
  read at332 checks the record schema/kind/status/dates, not an encoded clock. prune at479 uses
  record.createdAt/expiresAt. Receipt LOGICAL_ID_RE at232 accepts the new shape within128characters.
  ActionReceiptStore.prepareWithDisposition302 validates before ensuring/writing its root, then
  atomically writes and reopens through readChecked244; read revalidates schema/hash/canonical bytes.
  Searches of producer/receipt/deployment owners plus src/scripts/tests found no recovery-ID clock
  parser. Historical compatibility and retention still require actual controls after release.
- Frozen SHA256: destructiveRecovery.ts
  cfcacb5af3dde1df3df60d2380f6de41fc97eff074b8387a8e013a5b3db7f04b;
  actionReceipt.selftest.ts91b760cb1202731a65c0e15fc52a7fb70c64f748a9a0abcaedcbaeb6e5741a66;
  actionReceipt.ts1bb47355f4f5396785e81a873f8953354480e9fa8e225563a933ed61807903dd;
  actionReceiptStore.ts7148424025aaaab8cccd80aba9c1175bf698041d9ad032ded48194f07eabdfd2;
  deploymentTrust.tsa45dd2d15bca632dd5dc25f595cb8287a8c68f077d60a699a6fcbe890a656f89;
  deployment-trust.spec.ts806fa99d214fea55782ba2cff2033b27c1de80128e7a8ac886d47cf64f52367d.
- No capability-map delta. Existing receipt-policy/redaction ownership is documented under #20;
  the November10 redaction plan explicitly preserved rollback identity rejection. The reviewed
  policy bundle supplies authority pins, not the credential regex. No new authority exception.

NEGATIVE-FIRST ACCEPTANCE / EXACT VALIDATION STRATEGY
1. After terminal plus explicit root tests-only GO, add focused controls to the existing receipt
   selftest while retaining radix36. Derive fixed valid epoch clocks using a1296ms-aligned base
   plus parseInt of each suffix sk/pk/rk in radix36, inject them through existing options.now, and
   obtain actual store-generated IDs (not hand-built values or a regex-only surrogate).
2. Feed each actual generated deployment ID into the actual ActionReceiptStore prepare/tryPrepare
   path using unique existing fixture authority operation IDs. Root must capture intended-positive
   rows RED specifically with ACTION_RECEIPT_INVALID/policy rejection from the generated reference,
   while no receipt file/temp/root write occurs, target sentinel bytes stay unchanged, and the
   unused recovery entry is abandoned. Record only phase/class/result, never raw references.
3. Only after that captured negative and explicit root production GO, change the one generator
   radix. The same fixed-clock controls must prepare, serialize, recreate ActionReceiptStore and
   reopen identical canonical receipt bytes/hash/reference, while the generated recovery reopens.
   Cover the shared workspace generator as well without introducing a public test method.
4. Keep the existing rollback_credential_identity_still_rejected control at receipt selftest865-867
   and every authority/secret negative unchanged. A separate safe old-format recovery fixture must
   reopen unchanged through the actual reader after store recreation and survive/prune by its
   stored timestamps under the existing policy. Preserve schema, namespace, nonce length, explicit
   caller IDs, outside sentinel and rollback/no-write/fixture cleanup behavior.
5. Root-owned source command: qualified Node24.22.1 with
   `--max-old-space-size=512 --import tsx src/lib/actionReceipt.selftest.ts` (its existing direct-run
   guard executes the real oracle). Existing private source endpoint GET
   `/api/agent/destructive-recovery-selftest` runs the producer's current oracle; optional private
   GET `/api/agent/action-receipt-selftest` exercises the same receipt oracle through its registry.
   Both are existing registered selftest routes; owned private backend only, no live listener.
6. Run root's serial typecheck/lint, actual durable candidate/audit as required by the real diff,
   current receipt/capability authority audits, unchanged focused deployment-trust e2e and normal
   qualification/precommit/compiled gates. Existing runner invocation after explicit root grant:
   qualified Node with `--max-old-space-size=3072 scripts/run-e2e.mjs --config=playwright.config.ts
   --workers=1 --project=chromium tests/e2e/deployment-trust.spec.ts --output=<root-assigned-unused-output>`.
   Keep normal timeout/retry/zero-flake/ownership/lifecycle/live-protection policy; never replace
   the current full-source RED/flake history with a successful later replay.
- Evidence belongs in the existing QA root and this plan, with exact paths/fields assigned by root
  before execution. No new test/QA run or evidence file is authorized by this planning-only task.

REVIEW / CLOSE / AAR
- SPECIFIED only. Implementation, negative/positive controls, validation and final fresh-eyes review
  are pending; root retains all execution/Git ownership. No #106/#20 closure or source fix claim.
- Triggered AAR: a generated logical identity collided with the existing credential classifier;
  source review also corrected the initially reported failing call to the actual later apply.
  Sustain exact closed-artifact parsing with values withheld. Improve cross-owner tests so real
  producer output traverses strict store serialization/reopen. Highest-risk observed weakness is
  identifier/validator incompatibility dependent on clock phase; the bounded experiment above
  tests it without weakening secret policy or claiming the missing historical bytes were observed.

### #106 test-only stage authorization

Root reported the unfiltered full-source130 terminal FAILED:128PASS/1FAIL (project-browser repeated
ECONNRESET)/1FLAKY (deployment-trust policy collision),0skips/all terminal; ownership/lifecycle/
retirement/treeGone/private ports and source/protected pins passed. Those failures remain evidence.
No Node job is active. Root released only actionReceipt.selftest.ts and this plan for the tests-first
stage; destructiveRecovery.ts remains the original radix36 at cfcacb5a..., and production changes
still require a separately captured actual negative and explicit root GO.

The fixed-phase producer/consumer controls use the existing injected clock and actual deployment
and workspace recovery generation. Three intended-positive receipt prepare/canonical-reopen rows
must be RED on the old generator, with details reporting only phase, failure class and no-write/
cleanup facts. Distinct operation identities end in the phase label so their own text cannot
accidentally become the credential-like field under test. All existing receipt/secret negatives
remain unchanged. A safe old-format recovery fixture separately exercises actual reader restart,
unchanged bytes, strict receipt reopen and timestamp-based retention/expiry. Only temporary children
of the existing oracle-owned root are used; the original target sentinel must remain unchanged.

Validation and final close are pending. Root owns the declared512MiB/single-core direct receipt
oracle execution and its negative capture. This author will freeze the test-only hash and perform
no Node/tests/QA/Git/network or other source/config mutation.

### #106 frozen negative-first fixture contract

Tests are added but NOT EXECUTED by this author. Production remains the unchanged radix36 generator.
The existing receipt oracle now has ten additional controls: three intended-positive phase rows,
three refusal-boundary/cleanup rows, safe legacy read and retention rows, and fixture completion and
cleanup rows. Each phase creates BOTH actual deployment and workspace IDs using options.now, then
passes each exact ID to ActionReceiptStore.tryPrepare. Intended-positive row names are:

- generated_recovery_reference_sk_prepares_and_reopens
- generated_recovery_reference_pk_prepares_and_reopens
- generated_recovery_reference_rk_prepares_and_reopens

Root should see those three RED against the old generator with generatedCount2/reopenedCount0/
rejectedCount2/policyRejections2 and legacyClockMatches:true, rather than a mere format mismatch.
No-write controls compare receipt-root existence, filenames and file bytes around a refusal; unused
recoveries are abandoned and an independent target sentinel remains unchanged. On the future radix16
candidate, those same rows require actual prepare, serialization, store recreation, canonical bytes,
strict read validation and exact recovery-reference linkage for both kinds. Details contain no raw
references, paths, headers or credentials. Existing true-credential/authority assertions are untouched.

The safe legacy fixture moves only its own freshly created recovery entry inside the unique oracle
root, installs an old-format record, then proves reader restart, exact retained bytes, strict receipt
reopen and expiry/pruning by stored dates. Its contents and all phase outputs are retired by the
existing owner before the original receipt tests proceed. The direct entrypoint remains
`<qualified-node> --max-old-space-size=512 --import tsx src/lib/actionReceipt.selftest.ts`, under root's
declared single-core/private-TMP envelope. No new file, method, controller, runtime or invocation script.

Source review and actual negative capture are still required. A test-only hash is not the negative
execution result. No generator, validator, reader, production route, authority or metadata file changed.

### #106 actual RED and generator-only implementation

Status: PARTIAL; the negative-first contract is reproduced and the bounded correction is implemented,
but actual GREEN and remaining qualification are pending. Root explicitly authorized this one
production change only after capturing the old-generator negative. No policy exemption is introduced.

VALIDATE - root-owned actual negative
- Existing direct receipt oracle at frozen test SHA256
  430fb8002a309fb25023a7adda92f33085e8337a520d2185ef362c0af0bacadc and unchanged radix36 generator
  cfcacb5af3dde1df3df60d2380f6de41fc97eff074b8387a8e013a5b3db7f04b exited1,144/147.
- Exactly the three generated_recovery_reference_sk/pk/rk_prepares_and_reopens rows failed. Each
  used two actual generated IDs, reopened0/rejected2/policyRejections2/legacyClockMatches:true/
  hexClockMatches:false. All144 other controls passed, including the seven new boundary/legacy/
  cleanup controls and every137 original control. This proves the generated-ID/strict-receipt
  incompatibility, not merely a failed encoding assertion or an ignored clock injection.
- Retained QA receipt: forge-1112-recovery106-negative.json, SHA256
  8ff33c8389ef3946083f4a52ed3368411d964b200911e4a100b6b4122c8a4fd1. Root recorded unchanged
  source pins. Raw generated credential-like strings were not printed. The exact earlier full-suite
  failed ID is still unavailable; its attribution remains an inference backed by this reproduction.

IMPLEMENT / REVIEW / CLOSE
- Production diff is ONLY newId's timestamp toString(36) -> toString(16). Existing this.now injection,
  kind prefix, separators, eight random bytes/16hex nonce, namespaces and explicit caller-owned IDs
  remain unchanged. No helper, method, regex, secret-policy exception, receipt authority, schema,
  read/prune/retention logic, native deployment, root configuration or metadata file changed.
- Existing validId/logical-reference bounds accept the new length. Historical safe IDs remain
  subject to the unchanged actual reader and date-based retention controls already green in RED.
  They will be rerun with the identical tests on the candidate; source reasoning is not that GREEN.
- Root owns the positive direct oracle, producer oracle, type/lint/audits, unchanged deployment-trust
  runtime and required precommit/compiled/full-source/commit qualification. No #106/#20 closure,
  published artifact, installed/native experience or full-suite success is claimed here.
- No Node/tests/QA producer/Git/network operation was run by this author. Production source and
  this record will remain frozen after the requested read-only review and hash handoff.

AAR checkpoint
- Sustain: three fixed clock phases drove SIX actual old producer IDs through the authoritative
  receipt store and reproduced the precise field/class rejection;137 existing controls stayed green.
- Improve: exercise generated producer identities against strict downstream writers/readers rather
  than relying on independent format tests. Distinguish the reproduced class from missing historical
  bytes, and preserve both full-suite and focused RED evidence after eventual success.
- Tools: existing clock injection and direct selftest entrypoint were sufficient; no new seam or
  helper family was needed. The highest-risk current gap is pending positive/runtime qualification;
  the secret filter and old-record reader must remain untouched while that evidence is obtained.

### #106 scoped GREEN and compatibility review

Current status: PARTIAL. Root's actual unchanged direct receipt oracle progressed from144/147 RED
on the old producer to147/147 GREEN, exit0, on the one-line radix16 candidate. All ten new controls
and every137 original control now pass. This supplies the scoped positive missing above; it does
not close #106 or #20, establish full-suite success or replace remaining product/runtime gates.

VALIDATE / REVIEW
- Root captured forge-1112-recovery106-positive.json, SHA256
  e4a57453a27a25cb179c84344435a043c405a018aa8a2f993baf69f9ed3ff2d1. Source pins were unchanged:
  producer5a818444f466106d89d5399c6f5029df49c847909f29505a0a831adba3c21796 and test
  430fb8002a309fb25023a7adda92f33085e8337a520d2185ef362c0af0bacadc. Preserve the old negative
  receipt8ff33c83... and the full-suite failure history alongside this positive.
- The same three fixed clock phases now pass actual producer-ID -> receipt prepare -> serialization
  -> store recreation -> canonical reopen for deployment and workspace references. Refusal/no-write
  and owned cleanup controls, safe old-format read/reopen and date-based expiry/pruning controls,
  and all original credential/authority negatives are green. The secret filter was not weakened.
- Root independently reviewed the one changed generator line, validId, actual store.read and
  createdAt/expiresAt-based prune logic; result CLEAN. The original file is reconstructed exactly
  by reversing only16to36. Prefixes/separators, random nonce, constructor clock, explicit caller IDs,
  record/receipt schemas, readers and retention remain unchanged. No new public seam or policy.
- Required remaining evidence: current typecheck/lint, compiled current native-alias/deployment-trust
  qualification, normal precommit, required full gate and eventual commit. Earlier compiled/source
  greens cannot substitute for those current-candidate layers. Root owns serial execution and all
  metadata/commit decisions. The exact original full-suite failed ID remains uncaptured; its
  attribution stays an inference supported by the reproduced class, not observed historical bytes.

CLOSE / AAR
- PARTIAL source correction with actual147/147 receipt proof and independent source review;
  no issue closure, release, live/native experience or whole deploy-reliability claim. No
  capability-map delta. No runtime/tests/QA producer/Git/network action was run by this author.
- Sustain: identical tests established RED144/147 -> GREEN147/147 at the actual producer/strict-store
  boundary, while retaining all137 pre-existing controls and sensitive-value rejection.
- Improve tools: the attempted separate reviewer follow-up hit the collaboration agent thread limit;
  root supplied the independent changed-line/compatibility review rather than omitting it. No new
  helper or validation bypass was introduced to work around that tool limit.
- Highest-risk remaining gap is current compiled/runtime/full-gate qualification; scoped module
  evidence cannot establish caller integration or full normal-suite stability. Keep the separate
  project-browser transport failure and historical flaky verdict visible until independently closed.

### #106 durable-writer fixture metadata - SPECIFIED

Root's current normal precommit closed FAILED only on strict durable-writer metadata drift, with
source pins unchanged. This is a required metadata gate failure, not a reproduced product-behavior
failure or a reason to weaken the audit. Preserve its failed raw record
`forge-1112-native-replay-precommit.json`; a later green must not overwrite that evidence.

PLAN / BASELINE / RECONCILE
- Bounded unit: after root generates and reviews the existing --print-current candidate, reconcile
  only the already registered actionReceipt.selftest.ts call counts, its fixture rationale/failure
  wording, and the actual global source fingerprint. No production source, audit rule, category,
  owner, inventory cardinality or other writer contract changes are authorized by this SPEC.
- Current pins: test430fb800..., producer5a818444..., manifest5180ec7ef9f91d993d932a12a5b67b399f4afb2751876e386c48f681453a8795;
  declared source fingerprint431e1c28b2808f92ec9106851d86c4b3d8fc32437f1d2aadd1b36215c5b85241.
  The failed strict gate reported actual fingerprint
  ab92ad1b0d1fb206272d17ada249d468f45fbd6fde466964598c3b5cd23707ae. Root's generated candidate,
  not this narration, must be the source of any promoted fingerprint/count values.
- Existing inventory is48filesystem/11host/3browser/3SQLite owners. The existing entry remains
  categories:[fixture-only], owners:[runActionReceiptSelftest]; it already owns the receipt oracle.
  The producer's one radix change added no filesystem call. No new writer owner or production
  writer call is introduced by the test fixture delta.
- Source review identifies exactly five added raw calls, all within the existing oracle's unique
  `outside` mkdtemp root: mkdirSync(referenceRoot) at169; writeFileSync(target sentinel) at171;
  renameSync(actual legacy template entry -> legacyDirectory) at241; writeFileSync(legacy record)
  at243; and rmSync(referenceRoot) at273. Both rename endpoints and the legacy record are below
  referenceRoot/legacy-recoveries; no selected project/mod/game/configured root is involved.
- Counts therefore change only within that existing fixture entry: writeFileSync5->7,
  mkdirSync1->2, rmSync2->3, renameSync absent->1; mkdtempSync2 and symlinkSync2 stay unchanged.
  Calls made by the actual recovery/receipt stores retain those modules' existing production
  owners; they are not reclassified as new raw calls in this test file.
- Cleanup contract: each unused generated recovery is abandoned, refusal compares receipt-root
  existence/names/bytes and preserves the target sentinel, and the legacy fixture is tested through
  restart/read/expiry/prune. The added child removal is explicitly checked and records a failing
  oracle row if incomplete; the existing outer temporary-root owner retries cleanup. No cleanup
  failure is silently promoted to a passing test. Current scoped receipt proof remains147/147.

PROPOSED ENTRY WORDING / AUTHORIZATION BOUNDARY
- Retain the existing rationale verbatim, then append: "Recovery-reference clock-phase and
  canonical legacy-read fixtures add an owned child, a target sentinel and a legacy record; the
  rename stays within that child's recovery root."
- Retain the existing failureContract verbatim, then append: "Recovery-reference policy refusal
  must preserve receipt inventory and the target sentinel; unused recoveries are abandoned. Child
  cleanup is explicitly checked, and failure records a failing oracle result while the existing
  outer fixture owner retries removal."
- No manifest edit is authorized yet. Root must first compare the actual generated candidate
  against the current manifest: only these five fixture-call deltas and the measured fingerprint
  may differ; all other writer/host/browser/database call maps and cardinalities must remain equal.
  Preserve existing categories/owners and their order. Stop on any unexpected delta.
- After explicit root manifest GO, promote that exact reviewed candidate data and wording only,
  run the unchanged strict audit and normal precommit serially, and preserve their actual records.
  Rollback is this bounded metadata hunk over manifest5180ec7..., without reverting source or tests.

CLOSE / AAR
- SPECIFIED, metadata promotion and repeat gates pending; no issue closure or current precommit
  success claim. This author performed source/manifest reads and this plan append only, with no
  Node/tests/audit/QA producer/Git/network or manifest/source mutation.
- Triggered AAR: the normal hook caught five legitimate but unrecorded fixture mutations after
  the147/147 module proof. Sustain that strict gate and retain the failed raw evidence. Improve
  close sequencing by reviewing the actual generated writer delta before final normal precommit.
  Highest-risk current gap is metadata/source parity until that review and strict audit pass;
  no validator, fixture assertion or owner policy should be weakened to make the hook green.

METADATA CANDIDATE / BUNDLE COUPLING RECONCILIATION
- Root generated the actual existing --print-current candidate, SHA256
  46e268d821aeb7868228da58963d3a09444a76e5860517cedcea8e5a69626ce7, fingerprintab92ad1b...,
  and reports only the five reviewed receipt-fixture call deltas. The source review above is CLEAN
  for those call targets/contracts and the proposed two appended policy sentences. Config remains
  unchanged at5180ec7...; this is readiness for root's manifest decision, not permission to write it.
- Static import readers are actionReceiptPolicyBundle.ts4 and its selftest at2. Updating the writer
  manifest therefore changes a bundled policy input even though the production writer code is
  unchanged. The existing compiled b541... result becomes historical after metadata promotion:
  root must rebuild and run the new compiled134-oracle proof. Do not relabel or upgrade an older
  compiled receipt based on source metadata parity. Root owns any additional frontend import/build
  reconciliation; no direct frontend App caller is established by this bounded review.

### #106 reviewed metadata promotion and current compilation boundary

Root independently promoted the exact generated fixture calls and fingerprint plus the two reviewed
policy appends. Current manifest SHA256 is
3dc9d43cb14b91420545511d31af7eb233b6da1130afbae532351210ea2d8bcf; source fingerprint is
ab92ad1b0d1fb206272d17ada249d468f45fbd6fde466964598c3b5cd23707ae. The existing fixture entry
now declares write7/rename1/mkdir2/rm3/mkdtemp2/symlink2 and retains its fixture-only category and
runActionReceiptSelftest owner. No new writer owner or production mutation was introduced.

This author independently read the actual promoted manifest and reversed only those known fixture
counts, fingerprint and two appended sentences in memory. That reconstructed the previous manifest
5180ec7ef9f91d993d932a12a5b67b399f4afb2751876e386c48f681453a8795 byte-for-byte. Thus all other
JSON bytes,47other filesystem rows, owners/categories, host/browser/database inventories and
cardinalities are preserved; this is stronger than comparing a rewritten JSON representation.

Root recorded the unchanged strict audit PASS:48filesystem/11host/3browser/3SQLite owners. The
failed normal precommit record forge-1112-native-replay-precommit.json remains historical evidence;
the new normal precommit retry is root-owned and its result is pending at this checkpoint. No
precommit success or product failure is inferred from the narrower metadata audit result.

Current status remains PARTIAL. Because the reviewed manifest is a static policy-bundle input,
compiled b541... and its older134-oracle receipt are historical after this promotion. Root must
rebuild the current candidate and obtain its new compiled134-oracle result plus remaining current
native-alias/deployment-trust, precommit/full-gate and commit evidence. Existing module147/147
proof is retained with its exact source pins and is not relabeled as those integration layers.

No capability-map delta or issue closure. This author performed only read-only manifest verification
and this plan append; no config/source, Node/tests/audit producer, QA, Git or network mutation.

Compiled qualification continuation, SPECIFIED before launch: repaired XML production-state fixture now passes the unchanged normal compiled5(C06/UI2/XML2) with complete ownership/retired state/treeGone and zero failures/flakes. Retain the earlier compiled3/5failure separately. Root will reuse the existing one-private-backend owner/port to run actual dist/server.cjs in production mode, inspect all17named promotion rows through the existing artifact oracle, then invoke the existing unfiltered scripts/oracle-sweep.mjs against that same private base. Capture actual runtime-discovered N and strict verdict, exact built-server/source hashes and all output; preserve normal public allowlist/auth semantics and disposable private profile/state/config/data/coordination/discovery. No source fallback, filtered oracle list, provider keys, endpoint/helper/runtime/controller or live-state change. Keep serial one-core1536MiB focused envelope; no utilization threshold. Require all140artifact controls and every discovered oracle PASS, private-child shutdown/port gone/protected samples and listener identities unchanged. Record finite forge-1112-artifact105-compiled-oracles evidence; stop on anyRED. This is a backend compiled gate, not native IDE/game/public delivery or a universal lock-recovery guarantee. Fullsource/precommit/graph/Git gates remain separate.
