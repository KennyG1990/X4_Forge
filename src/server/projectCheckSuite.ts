import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { actionReceiptIdFor, actionReceiptIdForOperation, canonicalJson, hashActionReceiptAuthority, type ActionReceipt,
  type ActionReceiptOperationIdentity,
  type ActionReceiptAfter, type ActionReceiptPrepareInput, type ActionReceiptResourceAuthority } from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import type { ProjectCheckVerification } from '../lib/validationEvidence';
import { bindProjectCheckCommands } from './projectCheckCommand';
import { executeProjectCheck, isProjectCheckSuccessExcerpt, projectCheckCommandReceiptInput, type ProjectCheckWorkerEvidence } from './projectCheckExecution';
import { PROJECT_CHECK_WORKER_GRACE_MS, type ProjectCheckWorkerResult, type TrustedProjectCheckWorker } from './projectCheckWorker';
import { PROJECT_CHECK_MAX_PARALLEL, type ProjectCheckSourceLease } from './sharedSourceCoordinator';

const CAPABILITY = 'project-check.suite';
const COMMAND_CAPABILITY = 'project-check.command';
const VERSION = '1';
const PASSED = 'PROJECT_CHECK_SUITE_PASSED';
const FAILED = 'PROJECT_CHECK_SUITE_FAILED';
const BINDING_CHANGED = 'PROJECT_CHECK_SUITE_BINDING_CHANGED';
const UNCONFIRMED = 'PROJECT_CHECK_SUITE_UNCONFIRMED';
const CHILD_ROOT = 'project-check-command-receipts';
const SUITE_ROOT = 'project-check-suites';
// Historical windows-python-job-v1 receipts use these fixed worker bounds.
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const MAX_COMMAND_DURATION_MS = 300_000 + PROJECT_CHECK_WORKER_GRACE_MS;
const HASH = /^[a-f0-9]{64}$/;
const CHECK_ID = /^[a-z][a-z0-9._-]{0,63}$/;
const CHILD_PATH = /^(ar_[a-f0-9]{64})\.json$/;
const workerCodes = {
  passed: 'PROJECT_CHECK_PASSED',
  failed: 'PROJECT_CHECK_EXIT_NONZERO',
  'timed-out': 'PROJECT_CHECK_TIMED_OUT',
  'output-limit': 'PROJECT_CHECK_OUTPUT_LIMIT',
  canceled: 'PROJECT_CHECK_CANCELED',
  'infrastructure-error': 'PROJECT_CHECK_INFRASTRUCTURE_FAILED',
} satisfies Record<ProjectCheckWorkerResult['status'], string>;
const mismatch = () => Object.assign(new Error('The project check suite does not prove every exact required command.'),
  { code: 'PROJECT_CHECK_SUITE_MISMATCH' });
const duplicate = () => Object.assign(new Error('This project check suite attempt already has a receipt.'),
  { code: 'PROJECT_CHECK_SUITE_EXISTS' });

type ProjectCheckSuiteInput = Parameters<typeof bindProjectCheckCommands>[0] & {
  runtime: TrustedProjectCheckWorker;
  store: ActionReceiptStore;
  workspaceId: string;
  actorId: string;
};
type CommandLink = { id: string; authorityHash: string };
type SuitePlan = ReturnType<typeof buildSuitePlan>;
type WorkerEvidence = ProjectCheckWorkerEvidence;
type CommandReport = {
  id: string;
  state: 'passed' | 'failed' | 'incomplete';
  code: string;
  receiptId: string;
  receiptHash: string;
  message?: string;
  worker?: WorkerEvidence & { outputLimitExceeded?: true };
};
export interface ProjectCheckSuiteReport {
  suite: { id: string; hash: string };
  state: 'passed' | 'failed' | 'incomplete';
  plannedCount: number;
  notRunCount: number;
  stoppedBeforeCheckId?: string;
  checks: CommandReport[];
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function attemptSummary(children: readonly ActionReceipt[], stoppedBeforeCheckId?: string, policyVersion = 1) {
  return { version: policyVersion, count: children.length,
    digest: digest(children.map(child => [child.id, child.hash]).sort()),
    ...(stoppedBeforeCheckId === undefined ? {} : { stoppedBeforeCheckId }) };
}

function parseSummary(value: string | undefined) {
  let parsed: unknown;
  try { parsed = JSON.parse(value ?? ''); }
  catch { throw mismatch(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw mismatch();
  const summary = parsed as Record<string, unknown>;
  if (canonicalJson(summary) !== value) throw mismatch();
  return summary;
}

/** Reopen normalized worker facts; the optional diagnostic grants no authority. */
export function readProjectCheckWorkerEvidence(child: ActionReceipt, maxOutputBytes = MAX_COMMAND_OUTPUT_BYTES,
  maxDurationMs = MAX_COMMAND_DURATION_MS): { evidence: WorkerEvidence; message?: string } {
  const summary = parseSummary(child.validation.summary);
  const compact = Object.hasOwn(summary, 'v');
  if (compact && (child.status !== 'committed' || summary.v !== 2 || Object.keys(summary).sort().join(',') !== 'b,d,e,h,m,s,v'
    || summary.s !== 'passed' || typeof summary.b !== 'number' || summary.b < 1
    || !isProjectCheckSuccessExcerpt(summary.m))) throw mismatch();
  const evidence = compact ? { status: summary.s, exitCode: summary.e, durationMs: summary.d,
    outputBytes: summary.b, outputTailSha256: summary.h } : summary;
  const { status, exitCode, durationMs, outputBytes, outputTailSha256 } = evidence;
  if (Object.keys(evidence).length !== 5 || typeof status !== 'string' || !Object.hasOwn(workerCodes, status)
    || typeof outputBytes !== 'number' || !Number.isSafeInteger(outputBytes) || outputBytes < 0
    || (status === 'output-limit' ? outputBytes !== maxOutputBytes + 1 : outputBytes > maxOutputBytes)
    || typeof durationMs !== 'number' || !Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > maxDurationMs
    || typeof outputTailSha256 !== 'string' || !HASH.test(outputTailSha256)) throw mismatch();
  if (status === 'passed' ? exitCode !== 0 : status === 'failed'
    ? typeof exitCode !== 'number' || !Number.isSafeInteger(exitCode) || exitCode < 1 || exitCode > 0xffffffff
    : exitCode !== null) throw mismatch();
  return { evidence: { status: status as WorkerEvidence['status'], exitCode: exitCode as number | null, durationMs, outputBytes, outputTailSha256 },
    ...(compact ? { message: summary.m as string } : {}) };
}

function buildSuitePlan(input: ProjectCheckSuiteInput) {
  const runtime = Object.freeze({ ...input.runtime });
  const { workspaceId, actorId, runId, store } = input;
  const commands = bindProjectCheckCommands(input).map(bound => {
    const prepared = projectCheckCommandReceiptInput({ bound, runtime, workspaceId, actorId });
    return { bound, prepared, id: actionReceiptIdFor(prepared) };
  });
  const first = commands[0].bound;
  const budget = first.binding.maxParallelChecks;
  const policy = budget === undefined ? {} : { projectCheckPolicyVersion: 2, maxParallelChecks: budget };
  const { modId, setupHash, approvalId, approvalHash, artifactHash, command } = first.binding;
  const reviewBasisHash = digest({
    version: VERSION, workspaceId, source: first.sourceKey, modId, setupHash, approvalId, approvalHash, artifactHash,
    runner: command.runner, systemRoot: runtime.systemRoot, python: runtime.pythonSha256,
    worker: runtime.workerSha256, launcher: runtime.launcherSha256,
    checks: commands.map(({ bound: { binding } }) => ({
      id: binding.command.checkId, coveredFiles: binding.coveredFiles,
      ...(binding.coveredChecks === undefined ? {} : { coveredChecks: binding.coveredChecks }),
    })),
    ...policy,
  });
  return { runtime, workspaceId, actorId, runId, store, commands, first, reviewBasisHash, policy,
    maxParallelChecks: budget ?? 1, policyVersion: budget === undefined ? 1 : 2 };
}

function suiteOperationIdentity(actorId: string, workspaceId: string, runId: string): ActionReceiptOperationIdentity {
  return {
    actor: { kind: 'service', id: actorId },
    client: { channel: 'internal', id: 'forge-project-checks', version: VERSION },
    capability: { id: CAPABILITY, version: VERSION },
    authority: { scope: 'workspace', workspaceId, requestScope: CAPABILITY, operationId: `project-check-suite:${runId}` },
  };
}

export function projectCheckSuiteReceiptId(actorId: string, workspaceId: string, runId: string): string {
  return actionReceiptIdForOperation(suiteOperationIdentity(actorId, workspaceId, runId));
}

function suiteReceiptInput(plan: SuitePlan, links: CommandLink[]): ActionReceiptPrepareInput {
  const { workspaceId, actorId, runId, reviewBasisHash } = plan;
  const { modId, artifactHash, approvalId } = plan.first.binding;
  const suite = { role: 'data', root: SUITE_ROOT, relativePath: runId, beforeHash: reviewBasisHash } as const;
  const commands: ActionReceiptResourceAuthority[] = links.map(link => ({
    role: 'data', root: CHILD_ROOT, relativePath: `${link.id}.json`, beforeHash: link.authorityHash,
  }));
  const identity = suiteOperationIdentity(actorId, workspaceId, runId);
  return {
    ...identity,
    authority: { ...identity.authority, resources: [suite, ...commands] },
    effects: { declared: [{ id: 'suite-attempt', operation: 'execute', resource: suite, reversible: false }] },
    input: { requestHash: digest({ reviewBasisHash, links }), beforeHash: artifactHash },
    validation: { validator: CAPABILITY, ruleHash: reviewBasisHash },
    rollback: { required: false, mode: 'none' },
    metadata: { modId, artifactHash, originalReceiptId: approvalId, reviewContextHash: reviewBasisHash, ...plan.policy },
  };
}

function outcome(receipt: ActionReceipt, children: ActionReceipt[], state: 'applied' | 'partial'): ActionReceiptAfter {
  const byPath = new Map(children.map(child => [`${child.id}.json`, child.hash]));
  return {
    outcome: state,
    resources: receipt.authority.resources.map(({ role, root, relativePath, beforeHash }) => ({
      role, root, relativePath,
      hash: root === SUITE_ROOT ? digest({ state, reviewBasisHash: beforeHash, children: children.map(child => child.hash) })
        : byPath.get(relativePath) ?? digest({ state: 'not-run', authorityHash: beforeHash }),
    })),
  };
}

function assertReopenedChildAuthority(command: SuitePlan['commands'][number], link: CommandLink, child: ActionReceipt) {
  // The current attempt may have been reopened with a new private staging path.
  // Compare stable authority against this snapshot, and original exact authority against the parent link.
  const reopenedAuthority = hashActionReceiptAuthority({
    ...command.prepared,
    input: { ...command.prepared.input, requestHash: child.input.requestHash },
    validation: { ...command.prepared.validation, ruleHash: child.validation.ruleHash },
  });
  if (child.id !== command.id || child.authorityHash !== link.authorityHash || child.authorityHash !== reopenedAuthority
    || !child.validation.ruleHash) throw mismatch();
}

function readPassingChild(plan: SuitePlan, command: SuitePlan['commands'][number], link: CommandLink) {
  const child = plan.store.read(link.id);
  assertReopenedChildAuthority(command, link, child);
  if (child.status !== 'committed' || child.validation.status !== 'passed'
    || child.validation.code !== 'PROJECT_CHECK_PASSED' || !child.validation.ruleHash
    || child.after?.outcome !== 'applied') throw mismatch();
  const commandLimits = command.bound.binding.command;
  const { evidence, message } = readProjectCheckWorkerEvidence(child, commandLimits.maxOutputBytes,
    commandLimits.timeoutSeconds * 1000 + PROJECT_CHECK_WORKER_GRACE_MS);
  if (evidence.status !== 'passed'
    || child.after.resources[0]?.hash !== digest({ requestHash: child.input.requestHash, evidence })) throw mismatch();
  const { binding } = command.bound;
  const check: ProjectCheckVerification['checks'][number] = {
    id: binding.command.checkId, receiptId: child.id, receiptHash: child.hash,
    durationMs: evidence.durationMs, outputBytes: evidence.outputBytes, outputTailSha256: evidence.outputTailSha256,
    coveredFiles: binding.coveredFiles,
    ...(message === undefined ? {} : { message }),
    ...(binding.coveredChecks === undefined ? {} : { coveredChecks: binding.coveredChecks }),
  };
  return { child, check };
}

function readReportChild(store: ActionReceiptStore, suite: ActionReceipt, runId: string, link: CommandLink) {
  const result = store.tryRead(link.id);
  if (result.ok !== true) {
    if (result.code === 'RECEIPT_NOT_FOUND' && !fs.lstatSync(store.pathFor(link.id), { throwIfNoEntry: false })) return;
    throw mismatch();
  }
  const child = result.receipt;
  const prefix = `project-check:${runId}:`;
  const checkId = child.authority.operationId.startsWith(prefix) ? child.authority.operationId.slice(prefix.length) : '';
  const resource = child.authority.resources[0];
  if (!CHECK_ID.test(checkId) || child.authorityHash !== link.authorityHash || child.actor.kind !== 'service'
    || child.actor.id !== suite.actor.id || child.client.channel !== suite.client.channel || child.client.id !== suite.client.id
    || child.client.version !== suite.client.version || !('id' in child.capability) || child.capability.id !== COMMAND_CAPABILITY
    || child.capability.version !== VERSION || child.authority.requestScope !== COMMAND_CAPABILITY
    || suite.authority.scope !== 'workspace' || child.authority.scope !== 'workspace'
    || child.authority.workspaceId !== suite.authority.workspaceId || child.input.beforeHash !== suite.input.beforeHash
    || child.metadata?.artifactHash !== suite.input.beforeHash || child.metadata?.modId !== suite.metadata?.modId
    || child.metadata?.originalReceiptId !== suite.metadata?.originalReceiptId || child.validation.validator !== 'windows-python-job-v1'
    || !child.validation.ruleHash || child.authority.resources.length !== 1 || resource.role !== 'data'
    || resource.root !== 'project-check-results' || resource.relativePath !== `${runId}/${checkId}`
    || resource.beforeHash !== suite.input.beforeHash) throw mismatch();
  const code = child.validation.code;
  const report = { id: checkId, receiptId: child.id, receiptHash: child.hash,
    ...(child.status !== 'committed' && child.failure?.message ? { message: child.failure.message } : {}) };
  const requestHash = child.input.requestHash;
  if (child.status === 'incomplete') {
    if (code !== 'PROJECT_CHECK_RESULT_UNCONFIRMED' || child.failure?.code !== code || child.validation.summary !== undefined
      || child.after?.resources[0]?.hash !== digest({ requestHash, code })) throw mismatch();
    return { child, report: { ...report, state: 'incomplete', code } satisfies CommandReport };
  }
  const { evidence: worker, message } = readProjectCheckWorkerEvidence(child);
  if (child.status === 'committed') {
    if (code !== workerCodes.passed || worker.status !== 'passed' || child.after?.outcome !== 'applied'
      || child.after.resources[0]?.hash !== digest({ requestHash, evidence: worker })) throw mismatch();
    return { child, report: { ...report, state: 'passed', code, worker,
      ...(message === undefined ? {} : { message }) } satisfies CommandReport };
  }
  if (child.status !== 'failed' || !code || child.failure?.code !== code
    || (code !== 'PROJECT_CHECK_BINDING_CHANGED' && (worker.status === 'passed' || code !== workerCodes[worker.status]))) throw mismatch();
  // The runner's cap + 1 sentinel means at least this many bytes reached the pipe.
  const output = worker.status === 'output-limit' ? { ...worker, outputLimitExceeded: true as const } : worker;
  return { child, report: { ...report, state: 'failed', code, worker: output } satisfies CommandReport };
}

/** Reopen a terminal suite's historical results without granting deployment proof. */
export function readProjectCheckSuiteReport(store: ActionReceiptStore, receipt: ActionReceipt): ProjectCheckSuiteReport | undefined {
  const suite = store.read(receipt.id);
  const version = suite.metadata?.projectCheckPolicyVersion;
  const budget = suite.metadata?.maxParallelChecks;
  const legacy = version === undefined && budget === undefined;
  if (!legacy && (version !== 2 || typeof budget !== 'number' || !Number.isInteger(budget)
    || budget < 1 || budget > PROJECT_CHECK_MAX_PARALLEL)) throw mismatch();
  const runId = /^project-check-suite:([a-f0-9]{32})$/.exec(suite.authority.operationId)?.[1];
  if (suite.hash !== receipt.hash || !runId || suite.actor.kind !== 'service' || suite.authority.scope !== 'workspace'
    || suite.id !== projectCheckSuiteReceiptId(suite.actor.id, suite.authority.workspaceId, runId)
    || suite.validation.validator !== CAPABILITY || suite.metadata?.artifactHash !== suite.input.beforeHash
    || !suite.validation.ruleHash || suite.metadata?.reviewContextHash !== suite.validation.ruleHash) throw mismatch();
  const code = suite.validation.code;
  const state = suite.status === 'committed' && code === PASSED && suite.after?.outcome === 'applied' ? 'passed'
    : suite.status === 'failed' && (code === FAILED || code === BINDING_CHANGED) ? 'failed'
      : suite.status === 'incomplete' && code === UNCONFIRMED && suite.after?.outcome === 'partial' ? 'incomplete' : undefined;
  if (!state || (state !== 'passed' && suite.failure?.code !== code)) throw mismatch();
  if (state !== 'passed' && suite.validation.summary === undefined) return; // Older terminal receipts expose coarse status only.

  const basis = suite.authority.resources.find(resource => resource.role === 'data' && resource.root === SUITE_ROOT
    && resource.relativePath === runId && resource.beforeHash === suite.validation.ruleHash);
  const links = suite.authority.resources.filter(resource => resource.root === CHILD_ROOT);
  if (!basis || links.length === 0 || links.length > 32 || suite.authority.resources.length !== links.length + 1) throw mismatch();
  const after = new Map(suite.after?.resources.map(resource => [resource.relativePath, resource.hash]));
  const children: ActionReceipt[] = [];
  const checks: CommandReport[] = [];
  const absent = new Set<string>();
  for (const link of links) {
    const id = CHILD_PATH.exec(link.relativePath)?.[1];
    if (!id || link.role !== 'data' || !link.beforeHash) throw mismatch();
    const verified = readReportChild(store, suite, runId, { id, authorityHash: link.beforeHash });
    if (verified) {
      if (suite.after && after.get(link.relativePath) !== verified.child.hash) throw mismatch();
      children.push(verified.child);
      checks.push(verified.report);
    } else {
      const unattempted = digest({ state: 'not-run', authorityHash: link.beforeHash });
      if (state === 'passed' || (suite.after && after.get(link.relativePath) !== unattempted)) throw mismatch();
      absent.add(id);
    }
  }

  let stoppedBeforeCheckId: string | undefined;
  if (state !== 'passed') {
    const summary = parseSummary(suite.validation.summary);
    const stopped = summary.stoppedBeforeCheckId;
    if (code === BINDING_CHANGED) {
      if (typeof stopped !== 'string' || !CHECK_ID.test(stopped)) throw mismatch();
      const id = actionReceiptIdForOperation({
        actor: suite.actor, client: suite.client, capability: { id: COMMAND_CAPABILITY, version: VERSION },
        authority: { scope: 'workspace', workspaceId: suite.authority.workspaceId, requestScope: COMMAND_CAPABILITY,
          operationId: `project-check:${runId}:${stopped}` },
      });
      if (!absent.has(id)) throw mismatch();
      stoppedBeforeCheckId = stopped;
    }
    if (canonicalJson(summary) !== canonicalJson(attemptSummary(children, stoppedBeforeCheckId, legacy ? 1 : 2))) throw mismatch();
  }
  const failed = checks.filter(check => check.state === 'failed').length;
  const incomplete = checks.filter(check => check.state === 'incomplete').length;
  if (legacy) {
    if (failed !== (code === FAILED ? 1 : 0) || incomplete > (state === 'incomplete' ? 1 : 0)
      || (state === 'incomplete' && incomplete === 0 && absent.size !== 0)) throw mismatch();
  } else if (failed + incomplete > (budget as number)
    || (code === FAILED ? failed === 0 || incomplete !== 0
      : code === UNCONFIRMED ? incomplete === 0 && (failed !== 0 || absent.size !== 0)
        : failed !== 0 || incomplete !== 0)) throw mismatch();

  return { suite: { id: suite.id, hash: suite.hash }, state, plannedCount: links.length, notRunCount: absent.size,
    ...(stoppedBeforeCheckId === undefined ? {} : { stoppedBeforeCheckId }),
    checks: checks.sort((a, b) => a.id.localeCompare(b.id, 'en')) };
}

function currentSuiteLinks(plan: SuitePlan, receipt: ActionReceipt) {
  if (receipt.authority.resources.length !== plan.commands.length + 1) throw mismatch();
  const byPath = new Map(receipt.authority.resources.filter(resource => resource.root === CHILD_ROOT)
    .map(resource => [resource.relativePath, resource.beforeHash]));
  const links = plan.commands.map(({ id }) => {
    const authorityHash = byPath.get(`${id}.json`);
    if (!authorityHash) throw mismatch();
    return { id, authorityHash };
  });
  const expected = suiteReceiptInput(plan, links);
  if (receipt.id !== actionReceiptIdFor(expected) || receipt.authorityHash !== hashActionReceiptAuthority(expected)) throw mismatch();
  return links;
}

function readPassingSuite(plan: SuitePlan, receiptId: string) {
  const receipt = plan.store.read(receiptId);
  if (receipt.status !== 'committed' || receipt.validation.status !== 'passed' || receipt.validation.code !== PASSED) throw mismatch();
  const links = currentSuiteLinks(plan, receipt);
  const verifiedCommands = plan.commands.map((command, index) => readPassingChild(plan, command, links[index]));
  const commandReceipts = verifiedCommands.map(({ child }) => child);
  if (canonicalJson(receipt.after) !== canonicalJson(outcome(receipt, commandReceipts, 'applied'))) throw mismatch();
  plan.first.assertReady();
  const verification: ProjectCheckVerification = {
    suite: { id: receipt.id, hash: receipt.hash }, artifactHash: plan.first.binding.artifactHash,
    checks: verifiedCommands.map(({ check }) => check),
  };
  return { receipt, commandReceipts, reviewBasisHash: plan.reviewBasisHash, verification };
}

/** Reopen proof against current authorized setup and exact logical artifact. */
export function requirePassedProjectCheckSuite(input: ProjectCheckSuiteInput, receiptId: string) {
  return readPassingSuite(buildSuitePlan(input), receiptId);
}

/** Reconcile history against current authority without ever running a project command. */
export function readTerminalProjectCheckSuite(input: ProjectCheckSuiteInput, receiptId: string): ActionReceipt | undefined {
  const plan = buildSuitePlan(input);
  const found = plan.store.tryRead(receiptId);
  if (found.ok !== true) {
    if (found.code === 'RECEIPT_NOT_FOUND' && !fs.lstatSync(plan.store.pathFor(receiptId), { throwIfNoEntry: false })) {
      plan.first.assertReady();
      return;
    }
    throw mismatch();
  }
  const receipt = found.receipt;
  const links = currentSuiteLinks(plan, receipt);
  if (receipt.status === 'prepared') {
    for (let index = 0; index < plan.commands.length; index++) {
      const link = links[index];
      const child = plan.store.tryRead(link.id);
      if (child.ok === true) {
        assertReopenedChildAuthority(plan.commands[index], link, child.receipt);
        if (child.receipt.status !== 'prepared') readReportChild(plan.store, receipt, plan.runId, link);
      } else if (child.code !== 'RECEIPT_NOT_FOUND' || fs.lstatSync(plan.store.pathFor(link.id), { throwIfNoEntry: false })) throw mismatch();
    }
    plan.first.assertReady();
    return;
  }
  if (receipt.status === 'committed') return readPassingSuite(plan, receiptId).receipt;
  const report = readProjectCheckSuiteReport(plan.store, receipt);
  if (!report || (report.state !== 'failed' && report.state !== 'incomplete')) throw mismatch();
  for (let index = 0; index < plan.commands.length; index++) {
    const link = links[index];
    const recorded = report.checks.find(check => check.receiptId === link.id);
    if (!recorded) continue;
    const child = plan.store.read(link.id);
    if (child.hash !== recorded.receiptHash) throw mismatch();
    assertReopenedChildAuthority(plan.commands[index], link, child);
  }
  plan.first.assertReady();
  return receipt;
}

/** Execute the entire declaration without releasing the addressed source lease. */
export async function executeProjectCheckSuite(input: ProjectCheckSuiteInput & { lease: ProjectCheckSourceLease }): Promise<ActionReceipt> {
  const plan = buildSuitePlan(input);
  const { lease } = input;
  const { store, runtime, actorId, workspaceId } = plan;
  lease.assertProjectCheckAuthority(plan.first.sourceKey, workspaceId, actorId);
  const links = plan.commands.map(({ id, prepared }) => ({ id, authorityHash: hashActionReceiptAuthority(prepared) }));
  const prepared = suiteReceiptInput(plan, links);
  if (store.tryRead(actionReceiptIdFor(prepared)).ok === true) throw duplicate();
  const { receipt, created } = store.prepareWithDisposition(prepared);
  if (!created) throw duplicate();

  const children: ActionReceipt[] = [];
  const stop = (code: string, incomplete: boolean, stoppedBeforeCheckId?: string) => {
    const validation = { ...prepared.validation, status: 'failed', code,
      summary: canonicalJson(attemptSummary(children, stoppedBeforeCheckId, plan.policyVersion)) } as const;
    const failure = { code, message: 'A required project check did not produce a passing receipt.' };
    return incomplete
      ? store.transition(receipt.id, { to: 'incomplete', at: new Date().toISOString(),
        validation, failure, after: outcome(receipt, children, 'partial') })
      : store.fail(receipt.id, { validation, failure });
  };
  const results = new Map<number, ActionReceipt>();
  const errors = new Map<number, unknown>();
  const unready = new Map<number, string>();
  let next = 0;
  let halted = false;
  const dispatch = async () => {
    while (!halted && next < plan.commands.length) {
      const index = next++;
      const command = plan.commands[index];
      try {
        const child = await executeProjectCheck({ lease, bound: command.bound, runtime, store, actorId, workspaceId });
        results.set(index, child);
        if (child.status !== 'committed') halted = true;
      } catch (error) {
        halted = true;
        if (error && typeof error === 'object' && 'code' in error && error.code === 'PROJECT_CHECK_BINDING_UNREADY') {
          unready.set(index, command.bound.binding.command.checkId);
        } else errors.set(index, error);
      }
    }
  };
  // Every dispatch catches its failure. Never leave an admitted sibling behind on rejection.
  await Promise.all(Array.from({ length: Math.min(plan.maxParallelChecks, plan.commands.length) }, dispatch));
  children.push(...[...results].sort(([a], [b]) => a - b).map(([, child]) => child));
  if (errors.size) throw [...errors].sort(([a], [b]) => a - b)[0][1];
  if (children.some(child => child.status === 'incomplete')) return stop(UNCONFIRMED, true);
  if (children.some(child => child.status !== 'committed')) return stop(FAILED, false);
  if (unready.size) return stop(BINDING_CHANGED, false, [...unready].sort(([a], [b]) => a - b)[0][1]);

  let reopened: ActionReceipt[];
  try {
    reopened = plan.commands.map((command, index) => readPassingChild(plan, command, links[index]).child);
    plan.first.assertReady();
  } catch {
    return stop(UNCONFIRMED, true);
  }
  store.commit(receipt.id, {
    validation: { ...prepared.validation, status: 'passed', code: PASSED },
    after: outcome(receipt, reopened, 'applied'),
  });
  return readPassingSuite(plan, receipt.id).receipt;
}
