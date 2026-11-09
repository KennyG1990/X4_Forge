# Retain verified native deploy postchecks across a backend interruption

**VERIFIED in isolated Dev · Full lane.** [Owner issue #53](https://github.com/KennyG1990/X4_Forge/issues/53) · [Prior commit readback proof](2026-11-09-forge-deploy-commit-readback.md) · [Earlier activation cutpoint](2026-11-09-forge-interrupted-deploy-target-evidence.md).

## Baseline and reconciliation

Isolated Dev starts clean at `2e8404710ac2e9a3bc6b6cd1dab0ff62ee0c1c79`. The native handler confirms the exact staged tree, manifest ID and Doctor blockers before finalizing recovery and publishing the canonical action receipt. A process stop between the last two writes leaves a prepared receipt and ready recovery. Ready is also used before rollback on failed Doctor checks and when output changed. Current status discards ready recovery, and existing staged bytes prove only a physical comparison. Agent-Brain returned older project context without this exact cutpoint. Reuse the existing recovery record, staged evidence, owner-retirement check and receipt readback.

## Acceptance

- Stamp a bounded successful-postcheck attestation in the existing recovery finalization. Use the success path after exact physical, manifest and Doctor gates. Bind to the exact staged record, original receipt hash, fingerprint and timestamp. Verify owner and preparation, reopen the finalized record and keep existing failure/rollback finalization separate.
- After the same local owner exits, the original caller can see the exact historical passed-check fact in status and optional fresh preview comparison. The canonical outcome remains unknown until a committed receipt is present. A second canonical read prefers a terminal receipt that became durable before owner exit. History is independent of whether later bytes match. Status and comparison remain read-only.
- Hard-stop the baseline and candidate after ready recovery is written and before canonical publication. Compare exact receipt and target bytes across restart. A failed-Doctor ready recovery with matching staged bytes must provide no passed-check evidence. Wrong key, corrupted evidence, missing or old ready records and live owner stay unconfirmed. Same-operation retry remains a no-write refusal. A fresh later deployment retains its own receipt and does not alter historical attribution.
- Run focused recovery/snapshot checks, serial scratch HTTP proof, receipt and writer audits, TypeScript, diff and normal precommit. Keep rollback checkpoint `2e84047`. Full release qualification and installed evidence have separate gates. Batch 480's legacy receipt remains governed by the historical evidence it actually has.

## Results and close

The success path now writes the postcheck timestamp and digest in the existing ready recovery record. It reopens the exact prepared stage and finalized recovery. The attestation belongs to the original prepared receipt and exact staged fingerprint. Status waits for the same local owner to retire, reconstructs and verifies the original preparation, and rereads the canonical action receipt. If the receipt is still prepared, `postchecks.status` can be `passed` while `outcome` stays `unknown`. Fresh preview includes `historicalPostchecks` alongside the observed target comparison.

The baseline stopped at the ready-recovery rename with exact v101 installed. The cold successor saw the original prepared receipt and an unknown outcome with no way to identify the successful checks. The candidate projects the timestamped passed checks after the same interruption without altering receipt, recovery, installed bytes or staging. A corrupted digest withholds the proof. A different same-workspace deploy key cannot read it, and either alias refuses to apply the old operation again.

The failed-Doctor control planted a duplicate after activation. The exact v101 installed bytes still matched the staged fingerprint and its recovery still became ready. The successor confirmed the duplicate and withheld the passed-check fact. A separate fresh operation committed exact v102 and reopened its own receipt. The earlier receipt and postcheck evidence stayed intact, and fresh comparison reported different current bytes.

| Run | Checks | Private verdict |
| --- | --- | --- |
| Baseline `1fb5cd858ef769ab8b8848b22163b32e057d81cb57e6ab533c67e209d931bb91` | 37 | `c53-p5_pgish/verdict.json` |
| Candidate, successful postchecks | 44 | `c53-lhegj82_/verdict.json` |
| Same candidate, failed Doctor with exact staged bytes | 32 | `c53-1wqvqg2n/verdict.json` |

Candidate bundle SHA-256 `591b24560652b08f7d1636898038661f0fc1da736e2fc15b69572b1855b3144b`. Private runner `forge-53-postcheck-final.py` SHA-256 `60e92c155dca86b3938df8354e8937aca12f6cc8a6a4da4140c86278ca5719d0`. Both the original owned backend and its successors retired and cleared loopback listeners and discovery records. Deployment snapshot 60/60 and destructive recovery 22/22 passed. TypeScript, writer inventory, receipt coverage, capability and diff checks passed. Normal precommit evidence is `forge-53-postcheck-commit.log`. The existing recovery capability gains a historical fact without a new route or writer.

This is process-interruption proof within the existing recovery retention window. Installed validation, power-loss behavior, and automatic cross-host recovery are separate. Batch 480 remains unknown. The selected 0.0.82 tree remains frozen.

## AAR

Use the failed-Doctor control with identical staged bytes, because a changed-output control alone cannot distinguish two ready records. The first baseline assertion counted stage-only snapshot metadata as extra mod files. The corrected harness compares the exact three artifact hashes and separately checks the two expected metadata files. Host loopback approval was needed after the sandbox refused preflight. The candidate path regex and direct oracle result wrapper were corrected before accepting their results. Retain the canonical receipt as commit authority and use the historical fact within the existing recovery lifetime.
