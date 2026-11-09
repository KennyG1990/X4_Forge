# Forge interrupted deploy target evidence

Status `VERIFIED` for the isolated forward recovery checkpoint under [issue #53](https://github.com/KennyG1990/X4_Forge/issues/53).

## Plan and baseline

The clean Dev base is `787e0fffbc1ce593ddd749a3e86d88899e287c53`. The real activated cutpoint leaves the proposed target and prior transaction backup on disk, with a durable `prepared` receipt. It precedes final file verification, backup retirement, Extension Doctor and canonical receipt publication. Current matching bytes do not identify a historical writer. A ready recovery record is shared by multiple outcomes.

Keep the canonical action receipt authoritative and retain the existing write admission barrier. Persist the full physical staged fingerprint immediately before native activation for caller-addressed deploys. Bind it to the exact prepared receipt and the original recovery facts. On read-only status after a same-host owner exit, expose the durable before and staged fingerprints and the target binding hash. The existing fresh native preview supplies the current fingerprint and target binding. The operator compares those values, then chooses whether to apply with the fresh identities and a new operation ID. The original operation stays `unknown` and duplicate apply remains a no-write refusal. No new API endpoint or additional target scan. No capability-map delta.

Recovery record writes stay inside the existing store. Untracked callers retain the existing path. Any marker mismatch, unproven owner exit, expired recovery, or legacy receipt yields the original outcome without staged evidence. Verification compares exact receipt and recovery identity. A failed evidence write refuses before target activation. Rollback is `787e0ff` in the isolated Dev worktree. Keep live Forge, Antigravity, AiLive and X4 outside this unit.

## Acceptance

- Prove before-write behavior remains unchanged. Reproduce the activated cutpoint with an unchanged prepared receipt and a durable staged fingerprint that matches a fresh preview's physical target. Preserve the original recovery and refuse same-ID replay through both aliases. Then apply through the normal native preview and exact identities under a fresh operation ID. Verify committed bytes, a single valid installed extension and zero owned process residue.
- Prove a mismatched recovery or receipt cannot supply evidence. Confirm a stale destination is refused when changed after the fresh preview. Run the focused receipt oracle and normal headless precommit. Keep source and runtime evidence distinct from installed VSIX proof.

## Implementation and evidence

The existing write admission remains the first barrier. The staged fingerprint hook now records the final regular-tree fingerprint, including preserved paths, before target activation. The recovery store checks and rereads both transitions. After same-host owner exit, status rereads the durable record, verifies the original prepared digest, and checks that the staged fingerprint's checksum and prepared receipt hash match. The response returns the target binding hash with the two physical fingerprints. The client obtains the current target fingerprint through the existing native preview. No capability-map delta.

The pinned Dev server SHA-256 `1e105293b07e07edd48827385623ba2f8e06bbaa0307d007111b8806585b0b4b` is the `787e0ff` base plus this server diff. The private runner `forge-53-target-reconciliation.py` used the existing disposable v100-to-v101 mod with fresh original and successor backends. The terminal verdicts prove listener and discovery cleanup.

| Case | Result | Private verdict | SHA-256 |
|---|---|---|---|
| Interrupted immediately after receipt preparation | 29/29. `not-applied`, identical prepared receipt, no staged projection | `c53-edhixbmg/verdict.json` | `64d147001104857e317ee45107dfff68ced545fe367c266f249a7b81a0ad1158` |
| Interrupted immediately after target activation | 47/47. `unknown` with exact preview comparison, stale and duplicate refusals, and a fresh committed operation | `c53-6o1e1bfh/verdict.json` | `c98730ba078939d6457b3b1f9ff4fe5ff5ee05e83ffece15a6347eb34c8be486` |

The activated run verified two distinct negatives. A changed fingerprint with the original checksum was withheld. A correctly checksummed marker tied to another prepared receipt was also withheld. Restoring the exact recovery bytes restored the previous status. A new operation with the old destination fingerprint returned 409 `DEPLOY_TARGET_CHANGED`, with no receipt or target write. The fresh operation committed exact v101 files and removed the leftover transaction sibling. The old prepared receipt and its recovery stayed byte-identical. The focused receipt oracle passed 36/36. Fresh-eyes review confirmed the barrier precedes both target rename and locked-root fallback.

This proves safe continuation through a new native operation. Typecheck, writer and receipt coverage audits, and required headless precommit passed. The interrupted operation still lacks a historical completion verdict. Installed VSIX verification and 0.0.82 qualification are separate. The frozen 0.0.82 tree pins the two earlier receipt fixes. Rollback checkpoint `787e0ff`.

## AAR

Sustain checking before and after byte identity, corrupt evidence and wrong-receipt evidence independently, and following the interrupted operation with a real new apply. The first precommit caught that the negative test accessed a union member as if every result had it. The test now checks whether the field is present. The remaining evidence gap is the original process's final checks and commit when it exits during activation. The new operation can establish current deploy success while the original outcome remains unknown.
