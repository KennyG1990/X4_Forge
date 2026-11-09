# Forge deploy commit readback

Status `VERIFIED` for the isolated native deploy checkpoint. [Issue #53](https://github.com/KennyG1990/X4_Forge/issues/53) remains open for earlier interruption recovery, installed validation and delivery.

## Baseline and acceptance

Dev is clean at `4b9ce48874d68b6978108097ba75f4e7b59154e9`. The earlier activation cutpoint left a prepared receipt and exact proposed bytes but stopped before postchecks. Source inspection identifies a separate later fault. The action receipt can be atomically promoted to `committed` after passing physical and doctor checks, then the following read can fail. The deploy catch currently restores the target even when that committed receipt is durable. Establish the failure on a private fixture.

Reuse the canonical action receipt transition, its exact lifecycle hash, and the existing recovery/guarded rollback. Derive the exact expected committed receipt before publication. On a failure, read the durable receipt. Return success only on an exact matching committed receipt. Keep the existing exact rollback when the exact prepared receipt is still authoritative. An unreadable, absent, or changed receipt leaves the result unknown and preserves the target and recovery for later inspection. Neither matching target bytes nor recovery `ready` establishes success. No new persistence, endpoint, or target-side markers. No capability-map delta.

The unit covers one-time readback failure, refused publication with a durable prepared receipt, and ambiguous readback. Preserve both native aliases, read-only status, same-ID refusal, rollback CAS, and the normal successful receipt contract. A process that exits before any committed receipt is durable remains a separate case. No changes to the installed product, live configuration, mod, or game. Rollback checkpoint is `4b9ce48`.

Run the snapshot oracle with the expected failure first, then its corrected run and serial loopback proof with real scratch files. Confirm exact deployed bytes, durable receipt and recovery state, both aliases' same-ID refusal, and exact original bytes when commit publication fails. Run typecheck and the required precommit gate before the local commit. Keep the exact bundle and verdicts in private QA, and update GitHub and the Forge QA field log with the scoped result. Installed release validation is separate.

## Implementation and evidence

`commitDeployRecord` computes the exact expected committed lifecycle hash using the timestamp passed to the existing store. A normal canonical readback succeeds as before. A failed readback gets one further durable read. An exact committed record completes the successful apply. An exact prepared record permits the existing guarded rollback. An unreadable, absent or changed record returns `DEPLOY_COMMIT_OUTCOME_UNKNOWN`, preserves target and recovery, and suppresses automatic failure terminalization. Status still reads the canonical receipt. No capability-map delta.

On 2026-11-09 UTC, the focused snapshot oracle reproduced the baseline exception in `ActionReceiptStore.transition` after a committed rename. The same oracle passed 31/31 after the fix. The private HTTP runner `forge-53-receipt-readback.py` used new owned loopback backends and the same v100-to-v101 fixture for each case. It verified exact physical bytes, recovery disposition, restart status, no-write duplicate refusal through both aliases and owned process retirement. Baseline server SHA-256 `213a86124afafdb502ee73d05cbc9ca2d43b4ff5852c0a5d154a55b2fa0db454`. Candidate server SHA-256 `74224e871453a511a76b335b8a626d46f707e1da84a38a0fcbb04cd1ea8c8b48` from `4b9ce48` plus this server diff.

| Case | Observed result | Private verdict | SHA-256 |
|---|---|---|---|
| Baseline, one post-publication read fails | 22/22, HTTP 507 claimed rollback, v100 restored, recovery abandoned, durable status still committed | `r53-hkxcandj/verdict.json` | `13e17ca7dfe3510e7d36b86ed28314d7a8c099c6cc4de4de69de00d310371857` |
| Candidate, one post-publication read fails | 24/24, HTTP 200, exact v101 retained and receipt committed | `r53-wybeeni1/verdict.json` | `f02a54809a875017130d9810f42fae5c67e106f5b7dba4521c6c5eb0c0af05a1` |
| Candidate, terminal rename fails | 20/20, HTTP 507 with exact rollback to v100 and `rolled_back` receipt | `r53-47ejg9o1/verdict.json` | `0611d065bdb00e015134c3c2b65f6379406c406cef48d2fe37de560632d99ea5` |
| Candidate, committed receipt stays unreadable in the original process | 23/23, HTTP 507 unknown, exact v101 and recovery retained, successor sees committed | `r53-5yxq6b8m/verdict.json` | `6dfad4c689835c94d1e17ec1c7f325203dbb76c846ead83b23597682976bc697` |

Typecheck, receipt and durable writer audits, and required headless precommit passed. Independent source review established the ordered physical, manifest, doctor and recovery predicates and the previously unsafe readback/rollback sequence. A crash before canonical publication still requires separate reconciliation. Rollback source checkpoint `4b9ce48`.

## Third-unit release readiness review

GitHub main is still `f76775f02dbd8c61a100233e9d11d659f7a5d39b`. [GitHub](https://github.com/KennyG1990/X4_Forge/releases/tag/v0.0.81) and [Open VSX](https://open-vsx.org/api/x4forge/x4-forge-studio/latest) still serve 0.0.81. The previously frozen 902-file 0.0.82 source archive `forge-082-source-f76775f-b49f1ab.zip` (SHA-256 `512d48277a4f7c7f125dc81332f8ca98b53859a34b9226676b372a0068096393`) remains a fallback. No source gate or qualified VSIX exists for that candidate.

Select both receipt fixes for the next 0.0.82 candidate before qualification. The frozen deploy path has no native-check lease parameter, so narrowly port the hunks in `server.ts` and `deploymentTrust.ts` instead of carrying over unrelated A15 code. Repin the exact tree, release notes, archive and validation receipt. Explicit Start is independently portable and awaits the installed command and panel proof. The free deploy lock records a pending X4 live test and does not provide a Forge quiet window. Private short-root extraction, dependency hydration, full release gates, installed VSIX validation and publication remain pending. [Agent Board](https://app.notion.com/p/40e4618ed15b81b1b5fdc92a60d5d834)

## AAR

Sustain validating a real post-publication read failure and its corresponding pre-publication failure, rather than treating every exception as a failed write. The failed baseline oracle and HTTP comparator exposed the same mechanism at different layers. The first combined source patch used a stale documentation anchor and made no changes. The highest-risk remaining gap is a process interruption before canonical publication. Recovery `ready` is shared by several outcomes and current bytes cannot establish which historical operation wrote them.
