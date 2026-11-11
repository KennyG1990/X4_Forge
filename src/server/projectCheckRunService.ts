import { createHash } from 'node:crypto';
import { isValidActionOperationId } from '../../shared/actionOperationId';
import {
  actionReceiptIdFor, actionReceiptIdForOperation, canonicalJson, hashActionReceiptAuthority,
  type ActionReceipt, type ActionReceiptOperationIdentity, type ActionReceiptPrepareInput,
} from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import { projectCheckSuiteReceiptId, readProjectCheckSuiteReport, type ProjectCheckSuiteReport } from './projectCheckSuite';
import { canonicalSourceKey } from './resourceCoordinator';
import { projectCheckStageLease, type ProjectCheckStageLease, type ProjectCheckSourceLease, type SharedSourceCoordinator } from './sharedSourceCoordinator';

const CAPABILITY = 'project-check.run';
const VERSION = '1';
const RUN_ROOT = 'project-check-runs';
const SUITE_ROOT = 'project-check-suite-receipts';
const PASSED = 'PROJECT_CHECK_RUN_PASSED';
const UNCONFIRMED = 'PROJECT_CHECK_RUN_UNCONFIRMED';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^ar_[a-f0-9]{64}$/;
const ACTOR = /^[A-Za-z0-9_.:@-]{1,128}$/;
const WORKSPACE = /^ws_[a-f0-9]{24}$/;
const MOD = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const operationPattern = /^project-check-run:([a-f0-9]{32})$/;
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const refusal = (code: string, message: string, status: number) => Object.assign(new Error(message), { code, status });
const notFound = () => refusal('PROJECT_CHECK_RUN_NOT_FOUND', 'Project check run was not found.', 404);
const conflict = () => refusal('PROJECT_CHECK_RUN_CONFLICT', 'This operation ID already identifies a different check run.', 409);
const unavailable = () => refusal('PROJECT_CHECK_RUN_UNAVAILABLE', 'Project check run storage or coordination is unavailable.', 503);

export interface ProjectCheckRunInput {
  actorId: string;
  workspaceId: string;
  operationId: string;
  modId: string;
  artifactHash: string;
  requestHash: string;
  sourceKey: string;
}

export interface ProjectCheckRunStatus {
  id: string;
  state: 'queued' | 'running' | 'passed' | 'failed' | 'incomplete' | 'pending-recovery';
  modId: string;
  artifactHash: string;
  createdAt: string;
  finishedAt?: string;
  code?: string;
  suiteReceipt?: { id: string; hash: string };
  suiteReport?: ProjectCheckSuiteReport;
}

type RunRefusalCode = 'PROJECT_CHECK_RUN_AUTHORITY_CHANGED' | 'PROJECT_CHECK_RUN_ARTIFACT_CHANGED'
  | 'PROJECT_CHECK_RUN_BUDGET_EXCEEDED' | 'PROJECT_CHECK_RUN_QUEUE_TIMEOUT';

/** For an addressed request conclusively refused before a worker could launch. */
export class ProjectCheckRunRefusal extends Error {
  constructor(readonly code: RunRefusalCode) {
    super('The project check run no longer matches its admitted request.');
  }
}

type SuiteCompletion = { suite: ActionReceipt; logicalArtifactHash: string };
type Execute = (lease: ProjectCheckSourceLease, runId: string) => Promise<SuiteCompletion>;
type Recover = (runId: string, stages: Readonly<ProjectCheckStageLease>) => Promise<SuiteCompletion | undefined>;
type Completion = SuiteCompletion | { refused: RunRefusalCode } | { unknown: true };
type ActiveRun = {
  id: string;
  authorityHash: string;
  owned: boolean;
  state: 'queued' | 'running';
  admission: Promise<ProjectCheckRunStatus>;
};

function operationIdentity(actorId: string, workspaceId: string, runId: string): ActionReceiptOperationIdentity {
  return {
    actor: { kind: 'agent', id: actorId },
    client: { channel: 'api', id: 'forge-project-check-runs', version: VERSION },
    capability: { id: CAPABILITY, version: VERSION },
    authority: { scope: 'workspace', workspaceId, requestScope: CAPABILITY, operationId: 'project-check-run:' + runId },
  };
}

function deterministicRunId(actorId: string, workspaceId: string, operationId: string): string {
  return digest([CAPABILITY, actorId, workspaceId, operationId]).slice(0, 32);
}

function prepare(input: ProjectCheckRunInput) {
  const { actorId, workspaceId, operationId, modId, artifactHash, requestHash, sourceKey } = input;
  if (!ACTOR.test(actorId) || !WORKSPACE.test(workspaceId) || !isValidActionOperationId(operationId)
    || !MOD.test(modId) || !HASH.test(artifactHash) || !HASH.test(requestHash)
    || !sourceKey.startsWith('source:') || sourceKey.length <= 7 || sourceKey.length > 32768 || sourceKey.includes('\0')) {
    throw refusal('PROJECT_CHECK_RUN_INVALID', 'An exact addressed project check request is required.', 400);
  }
  const runId = deterministicRunId(actorId, workspaceId, operationId);
  const suiteId = projectCheckSuiteReceiptId(actorId, workspaceId, runId);
  const intentHash = digest({ artifactHash, modId, requestHash, sourceKey });
  const resource = { role: 'data', root: RUN_ROOT, relativePath: runId, beforeHash: intentHash } as const;
  const suite = { role: 'data', root: SUITE_ROOT, relativePath: suiteId + '.json' } as const;
  const identity = operationIdentity(actorId, workspaceId, runId);
  const prepared: ActionReceiptPrepareInput = {
    ...identity,
    authority: { ...identity.authority, resources: [resource, suite] },
    effects: { declared: [{ id: 'run-attempt', operation: 'execute', resource, reversible: false }] },
    input: { requestHash, beforeHash: artifactHash },
    validation: { validator: CAPABILITY, ruleHash: intentHash },
    rollback: { required: false, mode: 'none' },
    metadata: { modId, artifactHash },
  };
  return { runId, suiteId, prepared, authorityHash: hashActionReceiptAuthority(prepared) };
}

function links(receipt: ActionReceipt, actorId: string, workspaceId: string) {
  const runId = operationPattern.exec(receipt.authority.operationId)?.[1];
  const { modId, artifactHash } = receipt.metadata ?? {};
  if (!runId || receipt.actor.id !== actorId || receipt.authority.scope !== 'workspace'
    || receipt.authority.workspaceId !== workspaceId || receipt.id !== actionReceiptIdForOperation(operationIdentity(actorId, workspaceId, runId))
    || typeof modId !== 'string' || !MOD.test(modId) || typeof artifactHash !== 'string' || !HASH.test(artifactHash)
    || receipt.input.beforeHash !== artifactHash) throw notFound();
  const suiteId = projectCheckSuiteReceiptId(actorId, workspaceId, runId);
  const run = receipt.authority.resources.find(resource => resource.role === 'data' && resource.root === RUN_ROOT
    && resource.relativePath === runId && resource.beforeHash === receipt.validation.ruleHash);
  const suite = receipt.authority.resources.find(resource => resource.role === 'data' && resource.root === SUITE_ROOT
    && resource.relativePath === suiteId + '.json' && resource.beforeHash === undefined);
  if (!run?.beforeHash || !suite || receipt.authority.resources.length !== 2) throw unavailable();
  return { runId, suiteId, modId, artifactHash };
}

function outcomes(receipt: ActionReceipt, state: 'passed' | 'incomplete', suite?: ActionReceipt) {
  const resultHash = digest([state, receipt.authorityHash, suite?.id ?? null, suite?.hash ?? null]);
  return receipt.authority.resources.map(({ role, root, relativePath }) => ({
    role, root, relativePath, hash: root === SUITE_ROOT && suite ? suite.hash : resultHash,
  }));
}

/** One in-process admission slot backed by create-once run intent and exact suite receipts. */
export class ProjectCheckRunService {
  private active?: ActiveRun;

  constructor(private readonly store: ActionReceiptStore, private readonly coordinator: Pick<SharedSourceCoordinator, 'run'>) {}

  private read(id: string) {
    const found = this.store.tryRead(id);
    if (found.ok === true) return found.receipt;
    if (found.code !== 'RECEIPT_NOT_FOUND') throw unavailable();
  }

  private suiteFor(receipt: ActionReceipt, suiteId: string, hash: string, expectedLogicalHash?: string) {
    if (!HASH.test(hash)) return;
    const found = this.store.tryRead(suiteId);
    if (found.ok !== true) return;
    const suite = found.receipt;
    const runId = operationPattern.exec(receipt.authority.operationId)?.[1];
    if (suite.hash !== hash || suite.actor.kind !== 'service' || suite.actor.id !== receipt.actor.id
      || receipt.authority.scope !== 'workspace' || suite.authority.scope !== 'workspace'
      || suite.authority.workspaceId !== receipt.authority.workspaceId || suite.authority.operationId !== 'project-check-suite:' + runId
      || !HASH.test(suite.input.beforeHash) || suite.metadata?.artifactHash !== suite.input.beforeHash
      || (expectedLogicalHash !== undefined && suite.input.beforeHash !== expectedLogicalHash)
      || suite.metadata?.modId !== receipt.metadata?.modId) return;
    return suite;
  }

  private suiteReport(suite: ActionReceipt) {
    try { return readProjectCheckSuiteReport(this.store, suite); }
    catch { return undefined; }
  }

  status(actorId: string, workspaceId: string, id: string): ProjectCheckRunStatus {
    if (!ACTOR.test(actorId) || !WORKSPACE.test(workspaceId) || !ID.test(id)) throw notFound();
    const receipt = this.read(id);
    if (!receipt) throw notFound();
    const { modId, artifactHash, suiteId } = links(receipt, actorId, workspaceId);
    const base = { id, modId, artifactHash, createdAt: receipt.times.preparedAt };
    const incomplete = { ...base, state: 'incomplete' as const,
      finishedAt: receipt.times.incompleteAt ?? receipt.times.committedAt ?? receipt.times.failedAt, code: UNCONFIRMED };
    if (receipt.status === 'prepared') {
      if (this.active?.id === id && this.active.owned) return { ...base, state: this.active.state };
      return { ...base, state: 'pending-recovery', code: UNCONFIRMED };
    }
    if (receipt.status === 'failed') {
      const failed = { ...base, state: 'failed' as const, finishedAt: receipt.times.failedAt, code: receipt.validation.code };
      const suiteHash = receipt.validation.summary;
      if (receipt.validation.code !== 'PROJECT_CHECK_RUN_SUITE_FAILED' || suiteHash === undefined) return failed;
      const suite = this.suiteFor(receipt, suiteId, suiteHash);
      const suiteReport = suite?.status === 'failed' ? this.suiteReport(suite) : undefined;
      return suiteReport?.state === 'failed' ? { ...failed, suiteReport } : incomplete;
    }
    if (receipt.status === 'committed' && receipt.validation.code === PASSED && receipt.after?.outcome === 'applied') {
      const hash = receipt.after.resources.find(resource => resource.root === SUITE_ROOT)?.hash;
      const suite = hash && this.suiteFor(receipt, suiteId, hash);
      if (suite && suite.status === 'committed' && suite.validation.status === 'passed'
        && suite.validation.code === 'PROJECT_CHECK_SUITE_PASSED' && suite.after?.outcome === 'applied'
        && canonicalJson(receipt.after.resources) === canonicalJson(outcomes(receipt, 'passed', suite))) {
        const suiteReport = this.suiteReport(suite);
        if (suiteReport?.state === 'passed') return { ...base, state: 'passed', finishedAt: receipt.times.committedAt,
          suiteReceipt: suiteReport.suite, suiteReport };
      }
    }
    if (receipt.status === 'incomplete' && receipt.after?.outcome === 'partial') {
      const hash = receipt.after.resources.find(resource => resource.root === SUITE_ROOT)?.hash;
      const suite = hash && this.suiteFor(receipt, suiteId, hash);
      if (suite && suite.status === 'incomplete'
        && canonicalJson(receipt.after.resources) === canonicalJson(outcomes(receipt, 'incomplete', suite))) {
        const suiteReport = this.suiteReport(suite);
        if (suiteReport?.state === 'incomplete') return { ...incomplete, suiteReport };
      }
    }
    return incomplete;
  }

  retry(actorId: string, workspaceId: string, operationId: string, requestHash: string): ProjectCheckRunStatus | undefined {
    if (!ACTOR.test(actorId) || !WORKSPACE.test(workspaceId) || !isValidActionOperationId(operationId)
      || !HASH.test(requestHash)) throw refusal('PROJECT_CHECK_RUN_INVALID', 'An exact addressed project check request is required.', 400);
    const runId = deterministicRunId(actorId, workspaceId, operationId);
    const id = actionReceiptIdForOperation(operationIdentity(actorId, workspaceId, runId));
    const existing = this.read(id);
    if (!existing) return;
    links(existing, actorId, workspaceId);
    if (existing.input.requestHash !== requestHash) throw conflict();
    return this.status(actorId, workspaceId, id);
  }

  async start(input: ProjectCheckRunInput, execute: Execute, recover?: Recover): Promise<ProjectCheckRunStatus> {
    const { actorId, workspaceId, sourceKey } = input;
    const attempt = prepare(input);
    const id = actionReceiptIdFor(attempt.prepared);
    const existing = this.read(id);
    if (existing) {
      if (existing.authorityHash !== attempt.authorityHash) throw conflict();
      const status = this.status(actorId, workspaceId, id);
      if (!recover || status.state !== 'pending-recovery') return status;
      if (this.active) throw refusal('PROJECT_CHECK_RUN_BUSY', 'A project check run already occupies this Dev host.', 409);
      const slot: ActiveRun = { id, authorityHash: attempt.authorityHash, owned: true, state: 'queued',
        admission: Promise.resolve().then(() => this.status(actorId, workspaceId, id)) };
      this.active = slot;
      const keys: [string, string] = [canonicalSourceKey(this.store.pathFor(id)), sourceKey];
      setImmediate(() => { void this.recover(slot, existing, keys, { actor: actorId, workspaceId, operation: CAPABILITY }, attempt, recover); });
      return slot.admission;
    }
    if (this.active) {
      if (this.active.id !== id) throw refusal('PROJECT_CHECK_RUN_BUSY', 'A project check run already occupies this Dev host.', 409);
      if (this.active.authorityHash !== attempt.authorityHash) throw conflict();
      return this.active.admission;
    }
    const owner = { actor: actorId, workspaceId, operation: CAPABILITY };
    const slot: ActiveRun = { id, authorityHash: attempt.authorityHash, owned: false, state: 'queued',
      admission: Promise.resolve().then(async () => {
        try {
          const receiptPath = this.store.pathFor(id);
          const runKey = canonicalSourceKey(receiptPath);
          // The create-only lock stays separate from the execution lease so retries never wait behind a running suite.
          const admitted = await this.coordinator.run([canonicalSourceKey(receiptPath + '.admission')], owner, () => {
            const current = this.read(id);
            if (current) {
              if (current.authorityHash !== attempt.authorityHash) throw conflict();
              return undefined;
            }
            const { receipt, created } = this.store.prepareWithDisposition(attempt.prepared);
            if (!created || receipt.authorityHash !== attempt.authorityHash) throw conflict();
            slot.owned = true;
            return receipt;
          });
          if (!admitted) this.active = undefined;
          const status = this.status(actorId, workspaceId, id);
          if (admitted) setImmediate(() => { void this.run(slot, admitted, [runKey, sourceKey], owner, attempt, execute); });
          return status;
        } catch (error) {
          this.active = undefined;
          if (error && typeof error === 'object' && 'code' in error && error.code === 'PROJECT_CHECK_RUN_CONFLICT') throw error;
          throw unavailable();
        }
      }) };
    this.active = slot;
    return slot.admission;
  }

  private async recover(slot: ActiveRun, receipt: ActionReceipt, keys: [string, string],
    owner: { actor: string; workspaceId: string; operation: string }, attempt: ReturnType<typeof prepare>, recover: Recover) {
    try {
      await this.coordinator.run(keys, owner, async lease => {
        const current = this.read(receipt.id);
        if (!current || current.hash !== receipt.hash || current.status !== 'prepared') return;
        lease.assertProjectCheckAuthority(keys[1], owner.workspaceId, owner.actor);
        slot.state = 'running';
        const completion = await recover(attempt.runId, projectCheckStageLease(lease));
        lease.assertProjectCheckAuthority(keys[1], owner.workspaceId, owner.actor);
        if (completion) {
          if (completion.suite.id !== attempt.suiteId) return;
          const suite = this.suiteFor(receipt, attempt.suiteId, completion.suite.hash, completion.logicalArtifactHash);
          const report = suite && this.suiteReport(suite);
          if (!suite || !report || !['passed', 'failed', 'incomplete'].includes(report.state)) return;
        }
        // Only the claimed, currently verified callback may declare a quiescent incomplete attempt.
        this.finish(receipt, attempt.suiteId, completion ?? { unknown: true });
      });
    } catch {
      // Failures before the terminal write leave the parent prepared; never replay a command.
    } finally {
      if (this.active === slot) this.active = undefined;
    }
  }

  private async run(slot: ActiveRun, receipt: ActionReceipt, keys: [string, string],
    owner: { actor: string; workspaceId: string; operation: string }, attempt: ReturnType<typeof prepare>, execute: Execute) {
    try {
      const completion = await this.coordinator.run<Completion>(keys, owner, async lease => {
        const current = this.read(receipt.id);
        if (!current || current.hash !== receipt.hash || current.status !== 'prepared') return { unknown: true };
        lease.assertProjectCheckAuthority(keys[1], owner.workspaceId, owner.actor);
        slot.state = 'running';
        try {
          return await execute(lease, attempt.runId);
        } catch (error) {
          return error instanceof ProjectCheckRunRefusal ? { refused: error.code } : { unknown: true };
        }
      }).catch((error: unknown): Completion => {
        if (slot.state === 'queued' && error instanceof Error && 'code' in error && error.code === 'RESOURCE_QUEUE_TIMEOUT') {
          return { refused: 'PROJECT_CHECK_RUN_QUEUE_TIMEOUT' };
        }
        throw error;
      });
      await this.coordinator.run([keys[0]], owner, () => this.finish(receipt, attempt.suiteId, completion));
    } catch {
      // A prepared record with no locally owned slot is pending recovery. Never replay it or claim unknown cleanup.
    } finally {
      if (this.active === slot) this.active = undefined;
    }
  }

  private finish(receipt: ActionReceipt, suiteId: string, completion: Completion) {
    const current = this.read(receipt.id);
    if (!current || current.hash !== receipt.hash || current.status !== 'prepared') return;
    const suite = 'suite' in completion && completion.suite.id === suiteId && HASH.test(completion.logicalArtifactHash)
      ? this.suiteFor(receipt, suiteId, completion.suite.hash, completion.logicalArtifactHash) : undefined;
    if (suite?.status === 'committed' && suite.validation.status === 'passed'
      && suite.validation.code === 'PROJECT_CHECK_SUITE_PASSED' && suite.after?.outcome === 'applied') {
      this.store.commit(receipt.id, {
        validation: { ...receipt.validation, status: 'passed', code: PASSED },
        after: { outcome: 'applied', resources: outcomes(receipt, 'passed', suite) },
      });
    } else if ('refused' in completion || suite?.status === 'failed') {
      const code = 'refused' in completion ? completion.refused : 'PROJECT_CHECK_RUN_SUITE_FAILED';
      this.store.fail(receipt.id, { validation: { ...receipt.validation, status: 'failed', code,
        ...(suite?.status === 'failed' ? { summary: suite.hash } : {}) }, failure: { code } });
    } else {
      this.store.transition(receipt.id, { to: 'incomplete', at: new Date().toISOString(),
        validation: { ...receipt.validation, status: 'failed', code: UNCONFIRMED }, failure: { code: UNCONFIRMED },
        after: { outcome: 'partial', resources: outcomes(receipt, 'incomplete', suite) },
      });
    }
  }
}
