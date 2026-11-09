import { createHash, randomBytes } from 'node:crypto';
import { canonicalJson, type ActionReceipt } from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import { ProjectCheckApprovalLedger, projectCheckApprovalCoordinationKey, type OwnerDecision } from './projectCheckApproval';
import { ProjectCheckOwnerProof } from './projectCheckOwnerProof';
import { captureProjectCheckSetup, type ProjectCheckSetupInput } from './projectCheckSetup';
import type { TrustedProjectCheckWorker } from './projectCheckWorker';
import { canonicalSourceKey } from './resourceCoordinator';
import type { SharedSourceCoordinator } from './sharedSourceCoordinator';

export type ProjectCheckOwnerAction = OwnerDecision['action'];

export interface ProjectCheckOwnerContext {
  ownerId: string;
  policyHash: string;
  origin: string;
  credential: ConstructorParameters<typeof ProjectCheckOwnerProof>[0];
  workspaceId: string;
  actorId: string;
  modId: string;
  sourceRoot: string;
  setupInput: ProjectCheckSetupInput;
  runtime: TrustedProjectCheckWorker;
  activeApprovalId?: string;
  activate(approvalId: string): void;
}

export type ProjectCheckOwnerResolver = (action: ProjectCheckOwnerAction) => ProjectCheckOwnerContext;

const failures = {
  INPUT_INVALID: [400, 'An exact project check owner request is required.'],
  REVIEW_UNAVAILABLE: [409, 'The project check owner review is unavailable.'],
  REVIEW_CHANGED: [409, 'The reviewed project check authority changed. Open a fresh review.'],
  CONFIRMATION_REQUIRED: [403, 'The pinned owner must confirm the exact project check review.'],
  CAPACITY: [429, 'Too many project check owner reviews are pending.'],
  UNAVAILABLE: [503, 'The project check owner decision could not be recorded or activated.'],
} as const;

export class ProjectCheckOwnerEnrollmentError extends Error {
  readonly status: number;
  readonly code: `PROJECT_CHECK_OWNER_${keyof typeof failures}`;

  constructor(reason: keyof typeof failures) {
    const [status, message] = failures[reason];
    super(message);
    this.status = status;
    this.code = `PROJECT_CHECK_OWNER_${reason}`;
  }
}

const MAX_PENDING_REVIEWS = 16;
const REVIEW_ID = /^[A-Za-z0-9_-]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;

interface PendingReview {
  binding: string;
  ownerId: string;
  workspaceId: string;
  sourceKey?: string;
  decision: OwnerDecision;
  challenge: string;
  expiresAt: number;
  proof: ProjectCheckOwnerProof;
  confirming: boolean;
}

function ownerBindings(context: ProjectCheckOwnerContext) {
  const { policyHash, ownerId, workspaceId, actorId, modId, sourceRoot, origin, credential, setupInput, runtime } = context;
  if (!SHA256.test(policyHash) || ownerId !== credential.ownerId || origin !== credential.origin
    || modId !== setupInput.modId || sourceRoot !== setupInput.sourceRoot) {
    throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE');
  }
  const policy = createHash('sha256').update(canonicalJson({ policyHash, ownerId, workspaceId, actorId, modId, sourceRoot, origin,
    credentialId: credential.credentialId, userHandle: credential.userHandle,
    publicKey: credential.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    interpreterPath: setupInput.interpreterPath, interpreterDependencies: setupInput.interpreterDependencies ?? [], runtime,
  })).digest('hex');
  const review = createHash('sha256').update(canonicalJson([policy, context.activeApprovalId ?? null])).digest('hex');
  return { policy, review };
}

/** The verifier binds the decision. Also bind the challenge to this review, including equivalent revoke decisions. */
function assertionMatchesChallenge(assertion: unknown, challenge: string): boolean {
  if (!assertion || typeof assertion !== 'object' || !('clientDataJSON' in assertion)) return false;
  const encoded = assertion.clientDataJSON;
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(4096 * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(encoded)) return false;
  try {
    const client = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return client?.challenge === challenge;
  } catch { return false; }
}

/** Compose a host-owned review with the existing exact owner assertion and approval ledger. */
export class ProjectCheckOwnerEnrollment {
  private readonly reviews = new Map<string, PendingReview>();
  private verifier?: { binding: string; proof: ProjectCheckOwnerProof };

  constructor(
    private readonly store: ActionReceiptStore,
    private readonly coordinator: Pick<SharedSourceCoordinator, 'run'>,
    private readonly now = () => performance.now(),
  ) {}

  review(action: ProjectCheckOwnerAction, resolve: ProjectCheckOwnerResolver) {
    if (action !== 'approve' && action !== 'revoke') throw new ProjectCheckOwnerEnrollmentError('INPUT_INVALID');
    const context = this.resolveContext(action, resolve);
    const { ownerId, origin, workspaceId, actorId, modId, sourceRoot, runtime } = context;
    const binding = this.bindContext(context, 'REVIEW_UNAVAILABLE');
    // Keep one verifier while the pinned launch policy is unchanged, including across activation changes.
    if (this.verifier?.binding !== binding.policy) {
      try {
        this.verifier = { binding: binding.policy, proof: new ProjectCheckOwnerProof(context.credential, this.now) };
      } catch { throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE'); }
    }
    const proof = this.verifier.proof;
    const now = this.now();
    for (const [id, pending] of this.reviews) {
      if (!pending.confirming && (pending.expiresAt <= now || pending.proof !== proof)) this.discardReview(id, pending);
    }
    if (this.reviews.size >= MAX_PENDING_REVIEWS) throw new ProjectCheckOwnerEnrollmentError('CAPACITY');

    const reviewId = randomBytes(24).toString('base64url');
    const facts = this.reviewFacts(action, context, reviewId);
    let publicKey: ReturnType<ProjectCheckOwnerProof['issue']>;
    try { publicKey = proof.issue(facts.decision); }
    catch { throw new ProjectCheckOwnerEnrollmentError('CAPACITY'); }
    this.reviews.set(reviewId, { binding: binding.review, ownerId, workspaceId, sourceKey: facts.sourceKey,
      decision: facts.decision, challenge: publicKey.challenge, expiresAt: this.now() + publicKey.timeout, proof, confirming: false });
    return { reviewId, action, origin, ownerId, workspaceId, actorId, modId, sourceRoot, runtime: { ...runtime },
      setup: facts.setup, approval: facts.approval, publicKey };
  }

  async confirm(reviewId: string, assertion: unknown, resolve: ProjectCheckOwnerResolver) {
    if (typeof reviewId !== 'string' || !REVIEW_ID.test(reviewId)) {
      throw new ProjectCheckOwnerEnrollmentError('INPUT_INVALID');
    }
    const review = this.reviews.get(reviewId);
    if (!review || review.confirming) throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE');
    review.confirming = true;

    const { decision, sourceKey, ownerId, workspaceId } = review;
    const action = decision.action;
    try {
      if (review.expiresAt <= this.now()) throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE');
      if (!assertionMatchesChallenge(assertion, review.challenge)) {
        throw new ProjectCheckOwnerEnrollmentError('CONFIRMATION_REQUIRED');
      }
      const approvalKey = projectCheckApprovalCoordinationKey(this.store);
      return await this.coordinator.run(sourceKey ? [sourceKey, approvalKey] : [approvalKey], {
        actor: ownerId, workspaceId, operation: `project-check-owner-${action}`,
      }, lease => {
        if (review.expiresAt <= this.now() || review.proof !== this.verifier?.proof) {
          throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE');
        }
        const current = this.resolveContext(action, resolve, 'REVIEW_CHANGED');
        if (review.binding !== this.bindContext(current, 'REVIEW_CHANGED').review) {
          throw new ProjectCheckOwnerEnrollmentError('REVIEW_CHANGED');
        }
        lease.assertProjectCheckAuthority(approvalKey, workspaceId, ownerId);
        if (sourceKey) {
          if (canonicalSourceKey(current.sourceRoot) !== sourceKey) throw new ProjectCheckOwnerEnrollmentError('REVIEW_CHANGED');
          lease.assertProjectCheckAuthority(sourceKey, workspaceId, ownerId);
        }
        return { action, receipt: this.recordDecision(current, review, assertion) };
      });
    } catch (error) {
      if (error instanceof ProjectCheckOwnerEnrollmentError) throw error;
      throw new ProjectCheckOwnerEnrollmentError('UNAVAILABLE');
    } finally {
      this.discardReview(reviewId, review);
    }
  }

  private discardReview(id: string, review: PendingReview): void {
    review.proof.discard(review.challenge);
    this.reviews.delete(id);
  }

  private resolveContext(action: ProjectCheckOwnerAction, resolve: ProjectCheckOwnerResolver,
    reason: 'REVIEW_UNAVAILABLE' | 'REVIEW_CHANGED' = 'REVIEW_UNAVAILABLE') {
    try { return resolve(action); }
    catch (error) {
      if (error instanceof ProjectCheckOwnerEnrollmentError) throw error;
      throw new ProjectCheckOwnerEnrollmentError(reason);
    }
  }

  private bindContext(context: ProjectCheckOwnerContext, reason: 'REVIEW_UNAVAILABLE' | 'REVIEW_CHANGED') {
    try { return ownerBindings(context); }
    catch { throw new ProjectCheckOwnerEnrollmentError(reason); }
  }

  private reviewFacts(action: ProjectCheckOwnerAction, context: ProjectCheckOwnerContext, reviewId: string): {
    decision: OwnerDecision;
    sourceKey?: string;
    setup?: ReturnType<typeof captureProjectCheckSetup>;
    approval?: { id: string; hash: string; setupHash: string };
  } {
    try {
      if (action === 'approve') {
        const setup = captureProjectCheckSetup(context.setupInput);
        return { setup, sourceKey: canonicalSourceKey(context.sourceRoot), decision: { action, reviewId, setupHash: setup.setupHash } };
      }
      if (!context.activeApprovalId) throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE');
      const receipt = this.store.read(context.activeApprovalId);
      if (receipt.actor.kind !== 'human' || receipt.actor.id !== context.ownerId
        || !('id' in receipt.capability) || receipt.capability.id !== 'project-check.setup-approval'
        || receipt.capability.version !== '1' || receipt.authority.requestScope !== 'project-check.setup-approval.approve'
        || receipt.status !== 'committed' || receipt.validation.status !== 'passed'
        || receipt.validation.code !== 'PROJECT_CHECK_SETUP_APPROVED' || !receipt.input.beforeHash) {
        throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE');
      }
      return { decision: { action, approvalId: receipt.id, approvalHash: receipt.hash },
        approval: { id: receipt.id, hash: receipt.hash, setupHash: receipt.input.beforeHash } };
    } catch { throw new ProjectCheckOwnerEnrollmentError('REVIEW_UNAVAILABLE'); }
  }

  private recordDecision(current: ProjectCheckOwnerContext, review: PendingReview, assertion: unknown): ActionReceipt {
    const { decision, proof } = review;
    if (decision.action === 'approve') {
      try {
        if (captureProjectCheckSetup(current.setupInput).setupHash !== decision.setupHash) {
          throw new ProjectCheckOwnerEnrollmentError('REVIEW_CHANGED');
        }
      } catch { throw new ProjectCheckOwnerEnrollmentError('REVIEW_CHANGED'); }
    } else {
      const found = this.store.tryRead(decision.approvalId);
      if (found.ok !== true || found.receipt.hash !== decision.approvalHash) {
        throw new ProjectCheckOwnerEnrollmentError('REVIEW_CHANGED');
      }
    }

    let verified = false;
    const ledger = new ProjectCheckApprovalLedger(this.store, current.ownerId, (ownerId, exactDecision, assertionValue) => {
      verified = assertion === assertionValue && canonicalJson(decision) === canonicalJson(exactDecision)
        && proof.verify(ownerId, exactDecision, assertionValue);
      return verified;
    });
    try {
      if (decision.action === 'revoke') return ledger.revoke(decision.approvalId, assertion);
      const receipt = ledger.approve(current.setupInput, decision.setupHash, decision.reviewId, assertion);
      current.activate(receipt.id);
      return receipt;
    } catch {
      throw new ProjectCheckOwnerEnrollmentError(verified ? 'UNAVAILABLE' : 'CONFIRMATION_REQUIRED');
    }
  }
}
