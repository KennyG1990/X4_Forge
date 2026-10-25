/**
 * Exact-finding approval core. NOT an authentication boundary or deploy endpoint.
 * Callers must supply server-resolved principal, fingerprints and non-overridable gates.
 * Committed receipts below prove approval persistence, never a clean mod or deployment.
 */
import { createHash } from 'node:crypto';
import {
  createPreparedActionReceipt, redactReceiptMetadata,
  type ActionReceipt, type ActionReceiptPrepareInput,
} from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import type { ValidationEvidence, ValidationEvidenceFinding } from '../lib/validationEvidence';

export interface AcceptanceSubject {
  evidence: ValidationEvidence;
  artifactHash: string;
  validatorHash: string;
  corpusHash: string;
  /** Hash of the resolved deployment target identity, not a caller-provided folder label. */
  targetHash: string;
}
export interface AcceptancePrincipal {
  kind: 'agent' | 'human';
  /** Immutable authenticated key/session identity, never a credential or request-body actor. */
  id: string;
  label: string;
  scope?: 'read' | 'write' | 'deploy';
  /** Effective route/capability decision, not merely the key's broad scope. */
  deployAuthorized: boolean;
}
interface FindingAcceptance { finding: ValidationEvidenceFinding; reason: string }
export interface FindingReviewCounts {
  acceptedErrors: number;
  acceptedWarnings: number;
  unacceptedErrors: number;
  unacceptedWarnings: number;
  unavailableChecks: number;
}
export interface AcceptanceDecision {
  binding: ReturnType<typeof acceptanceBinding>;
  approvals: FindingAcceptance[];
  unacceptedErrorIds: string[];
  unacceptedWarningIds: string[];
  counts: FindingReviewCounts;
  /** This is only the finding-policy decision; durable receipts and all deploy gates still apply. */
  validationAllowsDeploy: boolean;
  validationClean: boolean;
  outcome: 'blocked-mod-findings' | 'accepted-findings-and-incomplete-checks'
    | 'accepted-findings' | 'accepted-findings-with-outstanding-warnings'
    | 'incomplete-checks' | 'warnings-present' | 'validation-clean';
}
export class FindingAcceptanceError extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`); }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function refuse(code: string, message: string): never { throw new FindingAcceptanceError(code, message); }

export function acceptanceBinding(subject: AcceptanceSubject) {
  const { evidence, artifactHash, validatorHash, corpusHash, targetHash } = subject;
  if (!evidence.modId || ![evidence.sourceHash, artifactHash, validatorHash, corpusHash, targetHash].every(value => typeof value === 'string' && sha.test(value))) {
    refuse('ACCEPTANCE_SUBJECT_INVALID', 'Resolved mod identity and source/artifact/validator/corpus/target hashes are required.');
  }
  const facts = {
    version: 1, modId: evidence.modId, modVersion: evidence.modVersion,
    sourceHash: evidence.sourceHash, artifactHash, validatorHash, corpusHash, targetHash,
    evidenceVersion: evidence.version,
    findings: evidence.findings.map(f => [f.findingId, f.category, f.severity]).sort(),
    coverage: { complete: evidence.coverage.complete, gaps: evidence.coverage.gaps.map(gap => JSON.stringify(gap)).sort() },
  };
  return { hash: hash(facts), modId: evidence.modId, sourceHash: evidence.sourceHash,
    artifactHash, validatorHash, corpusHash, targetHash };
}

/** Evaluates validator findings ONLY. Safety/authority/transaction failures cannot be accepted. */
export function evaluateFindingAcceptances(
  subject: AcceptanceSubject, requests: unknown, principal: AcceptancePrincipal | undefined,
  safetyFailures: readonly string[] = [],
): AcceptanceDecision {
  if (!principal || principal.deployAuthorized !== true || !principal.id || !principal.label
    || !['agent', 'human'].includes(principal.kind) || (principal.kind === 'agent' && principal.scope !== 'deploy')) {
    refuse('DEPLOY_APPROVAL_FORBIDDEN', 'An authenticated principal with effective deploy permission is required.');
  }
  if (safetyFailures.length) refuse('NON_OVERRIDABLE_DEPLOY_GATE', safetyFailures.join(', '));
  const binding = acceptanceBinding(subject);
  if (!Array.isArray(requests) || requests.length > 128) refuse('ACCEPTANCE_INPUT_INVALID', 'Acceptances must be an array of at most 128 exact findings.');
  const findings = new Map(subject.evidence.findings.map(finding => [finding.findingId, finding]));
  if (findings.size !== subject.evidence.findings.length) refuse('ACCEPTANCE_SUBJECT_INVALID', 'Ambiguous duplicate finding identities.');
  const seen = new Set<string>();
  const approvals = requests.map((value: unknown) => {
    if (!object(value) || Object.keys(value).some(key => !['findingId', 'bindingHash', 'reason'].includes(key))
      || typeof value.findingId !== 'string' || !sha.test(value.findingId)
      || typeof value.bindingHash !== 'string' || !sha.test(value.bindingHash)
      || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 512
      || [...value.reason].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
      refuse('ACCEPTANCE_INPUT_INVALID', 'Each acceptance requires only findingId, bindingHash and a nonblank, single-line reason of at most 512 characters.');
    }
    const reason = value.reason.trim();
    // Preserve the user's actual reason or reject it; do not silently change an approval.
    if (redactReceiptMetadata({ reason })?.reason !== reason) refuse('ACCEPTANCE_INPUT_INVALID', 'Reason contains credential-like text; remove it before approving.');
    if (seen.has(value.findingId)) refuse('ACCEPTANCE_INPUT_INVALID', 'Duplicate finding acceptance.');
    seen.add(value.findingId);
    if (value.bindingHash !== binding.hash) refuse('ACCEPTANCE_BINDING_STALE', 'Subject, artifact, validator, corpus, target or findings changed. Review fresh evidence.');
    const finding = findings.get(value.findingId);
    if (!finding || finding.severity === 'info') refuse('ACCEPTANCE_FINDING_STALE', 'The exact actionable finding is not present in current evidence.');
    return { finding, reason };
  });
  const unacceptedErrorIds = subject.evidence.findings.filter(finding =>
    finding.category === 'mod-finding' && finding.severity === 'error' && !seen.has(finding.findingId),
  ).map(finding => finding.findingId);
  const unacceptedWarningIds = subject.evidence.findings.filter(finding =>
    finding.category === 'mod-finding' && finding.severity === 'warning' && !seen.has(finding.findingId),
  ).map(finding => finding.findingId);
  const counts: FindingReviewCounts = {
    acceptedErrors: approvals.filter(a => a.finding.category === 'mod-finding' && a.finding.severity === 'error').length,
    acceptedWarnings: approvals.filter(a => a.finding.category === 'mod-finding' && a.finding.severity === 'warning').length,
    unacceptedErrors: unacceptedErrorIds.length,
    unacceptedWarnings: unacceptedWarningIds.length,
    unavailableChecks: Math.max(subject.evidence.checkUnavailableCount, subject.evidence.coverage.gaps.length),
  };
  const incomplete = !subject.evidence.coverage.complete || subject.evidence.coverage.gaps.length > 0
    || subject.evidence.findings.some(finding => finding.category === 'check-unavailable');
  const validationAllowsDeploy = unacceptedErrorIds.length === 0;
  return { binding, approvals, unacceptedErrorIds, unacceptedWarningIds, counts, validationAllowsDeploy,
    validationClean: validationAllowsDeploy && !incomplete && approvals.length === 0 && unacceptedWarningIds.length === 0,
    outcome: !validationAllowsDeploy ? 'blocked-mod-findings' : approvals.length
      ? incomplete ? 'accepted-findings-and-incomplete-checks' : unacceptedWarningIds.length ? 'accepted-findings-with-outstanding-warnings' : 'accepted-findings'
      : incomplete ? 'incomplete-checks' : unacceptedWarningIds.length ? 'warnings-present' : 'validation-clean',
  };
}

/** A review projection supplements raw evidence; an approval never removes a finding. */
export function projectFindingReview(decision: AcceptanceDecision, principal: AcceptancePrincipal, receipts?: readonly ActionReceipt[]) {
  return {
    status: receipts === undefined ? 'proposed' as const : 'recorded' as const,
    counts: decision.counts,
    outstandingFindingIds: [...decision.unacceptedErrorIds, ...decision.unacceptedWarningIds],
    approvals: decision.approvals.map(({ finding, reason }) => ({
      findingId: finding.findingId, code: finding.code, category: finding.category, severity: finding.severity, reason,
      actor: { kind: principal.kind, id: principal.id, label: principal.label },
      ...(receipts === undefined ? {} : { receiptId: receipts.find(r => r.metadata?.findingId === finding.findingId)?.id }),
    })),
  };
}

function receiptInputs(decision: AcceptanceDecision, principal: AcceptancePrincipal): ActionReceiptPrepareInput[] {
  return decision.approvals.map(({ finding, reason }) => {
    const requestHash = hash([decision.binding.hash, finding.findingId, reason, principal.kind, principal.id]);
    const resource = { role: 'data' as const, root: 'finding-acceptances',
      relativePath: `${decision.binding.hash}/${finding.findingId}`, beforeHash: decision.binding.hash };
    return {
      actor: { kind: principal.kind, id: principal.id },
      client: { channel: principal.kind === 'agent' ? 'api' : 'studio', id: principal.id, version: 'finding-acceptance-v1' },
      capability: { legacyRoute: '/api/agent/deploy-verify', method: 'POST', reviewed: true, reviewRef: 'validation-trust-repair-batch2' },
      authority: { scope: 'global', operationId: `accept:${requestHash}`, requestScope: 'deployment.finding-acceptance', resources: [resource] },
      effects: { declared: [{ id: 'accept-finding', operation: 'accept-finding', resource, reversible: false }] },
      input: { requestHash, beforeHash: decision.binding.hash },
      validation: { validator: 'finding-acceptance-v1', ruleHash: hash([decision.binding.validatorHash, decision.binding.corpusHash]) },
      rollback: { required: false, mode: 'none' },
      metadata: { operation: 'accept-finding', ...Object.fromEntries(Object.entries(decision.binding).filter(([key]) => key !== 'hash')),
        findingId: finding.findingId, findingCode: finding.code || 'uncoded', findingCategory: finding.category, findingSeverity: finding.severity,
        reason, actorLabel: principal.label, outcome: 'finding-accepted-not-deployed' },
    };
  });
}

/** Fail-closed persistence. Partial preparation is NOT permission to deploy. */
export function recordFindingAcceptances(
  store: ActionReceiptStore, subject: AcceptanceSubject, requests: unknown, principal: AcceptancePrincipal,
  safetyFailures: readonly string[] = [],
): { decision: AcceptanceDecision; receipts: ActionReceipt[] } {
  const decision = evaluateFindingAcceptances(subject, requests, principal, safetyFailures);
  if (!decision.validationAllowsDeploy) refuse('ACCEPTANCE_MOD_ERRORS_REMAIN', 'Unaccepted mod errors remain. No approval records written.');
  const inputs = receiptInputs(decision, principal);
  // Validate the entire batch before any persistence, including receipt limits and identity shape.
  inputs.forEach(input => createPreparedActionReceipt(input));
  const receipts = inputs.map(input => {
    const prepared = store.prepareWithDisposition(input);
    if (!prepared.created) {
      if (prepared.receipt.status !== 'committed') refuse('ACCEPTANCE_RECEIPT_INCOMPLETE', 'An unfinished approval requires review; it is not deploy authority.');
      return prepared.receipt;
    }
    return store.commit(prepared.receipt.id, {
      validation: { ...input.validation, status: 'passed', code: 'FINDING_ACCEPTED_NOT_DEPLOYED' },
      after: { outcome: 'applied', resources: input.authority.resources.map(resource => ({
        role: resource.role, root: resource.root, relativePath: resource.relativePath, hash: input.input.requestHash,
      })) },
    });
  });
  verifyFindingAcceptanceReceipts(store, receipts.map(receipt => receipt.id), subject, requests, principal, safetyFailures);
  return { decision, receipts };
}

/** Reread durable receipts at the future deployment write boundary, never trust response blobs. */
export function verifyFindingAcceptanceReceipts(
  store: ActionReceiptStore, receiptIds: readonly string[], subject: AcceptanceSubject, requests: unknown,
  principal: AcceptancePrincipal, safetyFailures: readonly string[] = [],
): AcceptanceDecision {
  const decision = evaluateFindingAcceptances(subject, requests, principal, safetyFailures);
  if (!decision.validationAllowsDeploy) refuse('ACCEPTANCE_MOD_ERRORS_REMAIN', 'Current mod errors are not accepted.');
  const expected = receiptInputs(decision, principal).map(input => createPreparedActionReceipt(input));
  if (receiptIds.length !== expected.length || new Set(receiptIds).size !== receiptIds.length) refuse('ACCEPTANCE_RECEIPT_MISMATCH', 'Exactly one durable receipt is required for each acceptance.');
  const actual = new Map(receiptIds.map(id => [id, store.read(id)]));
  for (const candidate of expected) {
    const receipt = actual.get(candidate.id);
    if (!receipt || receipt.status !== 'committed' || receipt.authorityHash !== candidate.authorityHash
      || receipt.validation.code !== 'FINDING_ACCEPTED_NOT_DEPLOYED' || receipt.after?.outcome !== 'applied'
      || receipt.after.resources.some(resource => resource.hash !== candidate.input.requestHash)) {
      refuse('ACCEPTANCE_RECEIPT_MISMATCH', 'Receipt is incomplete or belongs to different approval facts.');
    }
  }
  return decision;
}
