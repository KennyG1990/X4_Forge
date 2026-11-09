import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { actionReceiptIdFor, canonicalJson, type ActionReceipt, type ActionReceiptPrepareInput } from '../lib/actionReceipt';
import { ActionReceiptStore, ActionReceiptStoreError } from '../lib/actionReceiptStore';
import { captureProjectCheckSetup } from './projectCheckSetup';
import { canonicalSourceKey } from './resourceCoordinator';
import type { SharedSourceCoordinator } from './sharedSourceCoordinator';

const CAPABILITY = 'project-check.setup-approval';
const VERSION = '1';
const APPROVED = 'PROJECT_CHECK_SETUP_APPROVED';
const REVOKED = 'PROJECT_CHECK_SETUP_REVOKED';
const sha256 = /^[a-f0-9]{64}$/;

type SetupInput = Parameters<typeof captureProjectCheckSetup>[0];
export type OwnerDecision =
  | { action: 'approve'; reviewId: string; setupHash: string }
  | { action: 'revoke'; approvalId: string; approvalHash: string };

/** The owner adapter must verify an explicit human decision over these exact fields. */
type VerifyOwnerDecision = (ownerId: string, decision: Readonly<OwnerDecision>, proof: unknown) => boolean;

export function projectCheckApprovalCoordinationKey(store: ActionReceiptStore): string {
  return canonicalSourceKey(path.join(store.root, 'project-check-approval-authority'));
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export class ProjectCheckApprovalLedger {
  constructor(
    private readonly store: ActionReceiptStore,
    private readonly ownerId: string,
    private readonly verifyOwnerDecision: VerifyOwnerDecision,
  ) {}

  approve(input: SetupInput, reviewedHash: string, reviewId: string, proof: unknown): ActionReceipt {
    if (!sha256.test(reviewedHash) || !/^[a-zA-Z0-9_-]{16,64}$/.test(reviewId)) {
      throw new Error('A valid setup hash and unique review ID are required.');
    }
    const decision = { action: 'approve', reviewId, setupHash: reviewedHash } as const;
    this.confirm(decision, proof);
    const current = captureProjectCheckSetup(input);
    if (current.setupHash !== reviewedHash) throw new Error('Project check setup changed since review.');
    const receipt = this.record(this.receiptInput(decision), APPROVED);
    this.requireUsable(receipt.id, current);
    return receipt;
  }

  revoke(approvalId: string, proof: unknown): ActionReceipt {
    const approval = this.readApproval(approvalId);
    const decision = this.revocationDecision(approval);
    this.confirm(decision, proof);
    return this.record(this.receiptInput(decision), REVOKED);
  }

  revokeCoordinated(approvalId: string, proof: unknown, coordinator: Pick<SharedSourceCoordinator, 'run'>): Promise<ActionReceipt> {
    return coordinator.run([projectCheckApprovalCoordinationKey(this.store)], {
      actor: this.ownerId, operation: 'project-check-approval-revoke',
    }, () => this.revoke(approvalId, proof));
  }

  /** The caller supplies a freshly captured setup from its authorized subject. */
  requireUsable(approvalId: string, setup: ReturnType<typeof captureProjectCheckSetup>): ActionReceipt {
    const approval = this.readApproval(approvalId);
    if (approval.input.beforeHash !== setup.setupHash) throw new Error('Project check approval does not match this setup.');
    const revocationId = actionReceiptIdFor(this.receiptInput(this.revocationDecision(approval)));
    const revocation = this.store.tryRead(revocationId);
    if (revocation.ok === true) throw new Error('Project check approval was revoked or revocation is unresolved.');
    if (revocation.code !== 'RECEIPT_NOT_FOUND') throw new ActionReceiptStoreError(revocation.code, revocation.error);
    // Receipt lookup can report a dangling link as missing. An occupied path is never absence.
    if (fs.lstatSync(this.store.pathFor(revocationId), { throwIfNoEntry: false })) {
      throw new Error('Project check approval revocation path is unresolved.');
    }
    return approval;
  }

  private confirm(decision: OwnerDecision, proof: unknown): void {
    if (this.verifyOwnerDecision(this.ownerId, Object.freeze(decision), proof) !== true) {
      throw new Error('An explicit owner confirmation is required.');
    }
  }

  private readApproval(id: string): ActionReceipt {
    const receipt = this.store.read(id);
    if (receipt.actor.kind !== 'human' || receipt.actor.id !== this.ownerId
      || !('id' in receipt.capability) || receipt.capability.id !== CAPABILITY || receipt.capability.version !== VERSION
      || receipt.authority.requestScope !== `${CAPABILITY}.approve`
      || receipt.status !== 'committed' || receipt.validation.status !== 'passed' || receipt.validation.code !== APPROVED) {
      throw new Error('A committed owner setup approval is required.');
    }
    return receipt;
  }

  private revocationDecision(approval: ActionReceipt): Extract<OwnerDecision, { action: 'revoke' }> {
    return { action: 'revoke', approvalId: approval.id, approvalHash: approval.hash };
  }

  private receiptInput(decision: OwnerDecision): ActionReceiptPrepareInput {
    const requestHash = digest(decision);
    const beforeHash = decision.action === 'approve' ? decision.setupHash : decision.approvalHash;
    const resource = {
      role: 'data' as const,
      root: 'action-receipts',
      relativePath: decision.action === 'approve' ? `project-check-setups/${beforeHash}` : `${decision.approvalId}.json`,
      beforeHash,
    };
    return {
      actor: { kind: 'human', id: this.ownerId },
      client: { channel: 'studio', id: 'project-check-owner', version: VERSION },
      capability: { id: CAPABILITY, version: VERSION },
      authority: {
        scope: 'global', operationId: `${decision.action}:${requestHash}`,
        requestScope: `${CAPABILITY}.${decision.action}`, resources: [resource],
      },
      effects: { declared: [{ id: 'owner-decision', operation: decision.action, resource, reversible: false }] },
      input: { requestHash, beforeHash },
      validation: { validator: CAPABILITY },
      rollback: { required: false, mode: 'none' },
    };
  }

  private record(input: ActionReceiptPrepareInput, code: string): ActionReceipt {
    const { receipt, created } = this.store.prepareWithDisposition(input);
    if (!created) {
      if (receipt.status !== 'committed' || receipt.validation.status !== 'passed' || receipt.validation.code !== code) {
        throw new Error('Project check decision has an unresolved receipt.');
      }
      return receipt;
    }
    const [{ role, root, relativePath }] = input.authority.resources;
    return this.store.commit(receipt.id, {
      validation: { ...input.validation, status: 'passed', code },
      after: { outcome: 'applied', resources: [{ role, root, relativePath, hash: input.input.requestHash }] },
    });
  }
}
