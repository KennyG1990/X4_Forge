# Forge admitted deploy interruption

Status `VERIFIED` for the isolated API checkpoint. [Issue #53](https://github.com/KennyG1990/X4_Forge/issues/53) remains open for post-activation reconciliation, installed validation and delivery.

## Plan and baseline

On `171ef868`, agent deploys can have a durable `prepared` receipt and a recovery snapshot before Forge stages or replaces the extension. The same receipt state can survive interruption after activation. The live batch 480 receipt lacks phase evidence, so its outcome remains unknown even after a distinct successor deploy committed. The isolated 5b6caac Windows parent-pipe replay reached the real prepared cutpoint, retired the child, preserved both trees, and returned `unknown` with duplicate refusal on both aliases (26/26, private QA verdict `a53-dh2v4jho/verdict.json`).

Reuse the existing caller-scoped operation receipt and recovery record. Bind the exact initial recovery record into the prepared action receipt. Record which local process owns the pending write phase and require an atomically replaced, read-back-verified admission marker before the first extension or staging mutation. After a local process exit, an authenticated status lookup can return the historical `not-applied` outcome only if the same bound prewrite record is still present after confirming its owner is dead. Preserve the durable action receipt and both aliases' duplicate refusal. Lookup does not write or inspect installed bytes. No capability-map delta.

The proof is for an owned backend process interruption on the same local host and state. Missing, expired, invalid, legacy, live-owner, or admitted records stay unknown. The outcome makes no claim about newer writes to the target. There is no automatic retry, restore, live change, or broader storage-crash recovery. Keep commit rollback to the previous Dev revision.

## Acceptance and evidence

- The same deploy key and workspace resolve `not-applied` after a real prewrite interruption and `unknown` after an admitted interruption. The lookup and duplicates leave the target and receipt untouched. Record the exact private cutpoint evidence and candidate identity.
- Verify recovery marker readback, refusal on a missing or changed record, conservative live-owner and legacy handling, and the existing successful receipt lifecycle. Run focused oracles, typecheck, writer audit, and the headless precommit gate.
- Installed IDE and live X4 are outside this API checkpoint. Keep the original batch 480 classification and installed release evidence separate.

## Implementation and close

The agent apply path records the pending phase in the existing recovery record and binds its digest to the prepared action receipt's existing `stage` metadata. It then atomically records and verifies admission before any managed writes. Status checks same-host process liveness, then reads the recovery again so an owner admitting writes just before exit cannot produce a false `not-applied`. Neither status nor a duplicate apply repairs a receipt or mutates the target. Retention can make an earlier proof unavailable. A current target match cannot prove the historical outcome, and a post-activation terminal receipt still requires separate evidence. No capability-map delta.

On 2026-11-09 UTC, the pinned Dev server bundle from `171ef868` plus this code diff (`213a86124afafdb502ee73d05cbc9ca2d43b4ff5852c0a5d154a55b2fa0db454`) ran under the existing private supervisor. The private runner used `--cutpoint prepared` and `--cutpoint activated` serially. It verified retired owned listeners, exact durable receipt readback, and both aliases' 409 no-write response. The prewrite trees were unchanged. The post-activation target contained the exact proposed files and its transaction backup contained the previous files.

| Cutpoint | Result | Private QA verdict | SHA-256 |
|---|---|---|---|
| Prepared receipt published | 27/27, `not-applied` | `c53-_h0pnhmv/verdict.json` | `ac4db103d17041c6fea3c87471a418a2419518d71d858447520c25e12182bb96` |
| Target activated | 29/29, `unknown` | `c53-m903jqf1/verdict.json` | `c43fadcae4845cd980d5eae4de70025139ae09e0b2cdddc0159412a4419a99ef` |

The source snapshot oracle passed 26/26 checks for legacy and live-owner handling, mismatched or missing recovery, failed admission rename, a successful admission marker, and committed receipt readback. Typecheck, durable writer inventory and headless precommit passed. Fresh-eyes review confirmed that the result is scoped to the local backend process and the same running host. The exact old receipt remains unknown. Rollback checkpoint is `171ef868` in the isolated source tree.

## AAR

Sustain testing on each side of a real write boundary and byte-checking both target trees and receipt state. The first baseline harness conflated logical-artifact and binding hashes, then compared a compact duplicate response with a full receipt. Corrected both checks before accepting the replay. The Windows sandbox denied a scratch atomic rename, so the focused test was rerun on the authorized isolated host lane. The candidate preflight rejected an incorrectly transcribed bundle hash before a process started. The first simulated rename error missed the ESM namespace binding. The corrected test synchronizes and restores the Node built-in exports. The unresolved high-risk gap is the loss of evidence between activation and final postchecks. Keep that case `unknown` until durable proof can establish the result.
