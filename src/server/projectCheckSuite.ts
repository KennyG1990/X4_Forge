import { createHash } from 'node:crypto';
import { actionReceiptIdFor, actionReceiptIdForOperation, canonicalJson, hashActionReceiptAuthority, type ActionReceipt,
  type ActionReceiptOperationIdentity,
  type ActionReceiptAfter, type ActionReceiptPrepareInput, type ActionReceiptResourceAuthority } from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import { bindProjectCheckCommands } from './projectCheckCommand';
import { executeProjectCheck, projectCheckCommandReceiptInput } from './projectCheckExecution';
import type { TrustedProjectCheckWorker } from './projectCheckWorker';
import type { ProjectCheckSourceLease } from './sharedSourceCoordinator';

const CAPABILITY = 'project-check.suite';
const VERSION = '1';
const PASSED = 'PROJECT_CHECK_SUITE_PASSED';
const CHILD_ROOT = 'project-check-command-receipts';
const SUITE_ROOT = 'project-check-suites';
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

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function buildSuitePlan(input: ProjectCheckSuiteInput) {
  const runtime = Object.freeze({ ...input.runtime });
  const { workspaceId, actorId, runId, store } = input;
  const commands = bindProjectCheckCommands(input).map(bound => {
    const prepared = projectCheckCommandReceiptInput({ bound, runtime, workspaceId, actorId });
    return { bound, prepared, id: actionReceiptIdFor(prepared) };
  });
  const first = commands[0].bound;
  const { modId, setupHash, approvalId, approvalHash, artifactHash, command } = first.binding;
  const reviewBasisHash = digest({
    version: VERSION, workspaceId, source: first.sourceKey, modId, setupHash, approvalId, approvalHash, artifactHash,
    runner: command.runner, systemRoot: runtime.systemRoot, python: runtime.pythonSha256,
    worker: runtime.workerSha256, launcher: runtime.launcherSha256,
    checks: commands.map(({ bound: { binding } }) => ({
      id: binding.command.checkId, coveredFiles: binding.coveredFiles,
    })),
  });
  return { runtime, workspaceId, actorId, runId, store, commands, first, reviewBasisHash };
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
    metadata: { modId, artifactHash, originalReceiptId: approvalId, reviewContextHash: reviewBasisHash },
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

function readPassingChild(plan: SuitePlan, command: SuitePlan['commands'][number], link: CommandLink): ActionReceipt {
  const child = plan.store.read(link.id);
  // The current attempt may have been reopened with a new private staging path.
  // Compare stable authority against this snapshot, and original exact authority against the parent link.
  const reopenedAuthority = hashActionReceiptAuthority({
    ...command.prepared,
    input: { ...command.prepared.input, requestHash: child.input.requestHash },
    validation: { ...command.prepared.validation, ruleHash: child.validation.ruleHash },
  });
  if (child.id !== command.id || child.authorityHash !== link.authorityHash || child.authorityHash !== reopenedAuthority
    || child.status !== 'committed' || child.validation.status !== 'passed'
    || child.validation.code !== 'PROJECT_CHECK_PASSED' || !child.validation.ruleHash
    || child.after?.outcome !== 'applied') throw mismatch();
  let evidence: Record<string, unknown>;
  try { evidence = JSON.parse(child.validation.summary ?? ''); }
  catch { throw mismatch(); }
  if (!evidence || typeof evidence !== 'object' || Object.keys(evidence).length !== 5
    || evidence.status !== 'passed' || evidence.exitCode !== 0
    || typeof evidence.outputBytes !== 'number' || !Number.isSafeInteger(evidence.outputBytes)
    || evidence.outputBytes < 0 || evidence.outputBytes > command.bound.binding.command.maxOutputBytes
    || typeof evidence.durationMs !== 'number' || !Number.isSafeInteger(evidence.durationMs) || evidence.durationMs < 0
    || typeof evidence.outputTailSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.outputTailSha256)
    || child.after.resources[0]?.hash !== digest({ requestHash: child.input.requestHash, evidence })) throw mismatch();
  return child;
}

function readPassingSuite(plan: SuitePlan, receiptId: string) {
  const receipt = plan.store.read(receiptId);
  if (receipt.status !== 'committed' || receipt.validation.status !== 'passed' || receipt.validation.code !== PASSED
    || receipt.authority.resources.length !== plan.commands.length + 1) throw mismatch();
  const byPath = new Map(receipt.authority.resources.filter(resource => resource.root === CHILD_ROOT)
    .map(resource => [resource.relativePath, resource.beforeHash]));
  const links = plan.commands.map(({ id }) => {
    const authorityHash = byPath.get(`${id}.json`);
    if (!authorityHash) throw mismatch();
    return { id, authorityHash };
  });
  const expected = suiteReceiptInput(plan, links);
  if (receipt.id !== actionReceiptIdFor(expected) || receipt.authorityHash !== hashActionReceiptAuthority(expected)) throw mismatch();
  const commandReceipts = plan.commands.map((command, index) => readPassingChild(plan, command, links[index]));
  if (canonicalJson(receipt.after) !== canonicalJson(outcome(receipt, commandReceipts, 'applied'))) throw mismatch();
  plan.first.assertReady();
  return { receipt, commandReceipts, reviewBasisHash: plan.reviewBasisHash };
}

/** Reopen proof against current authorized setup and exact logical artifact. */
export function requirePassedProjectCheckSuite(input: ProjectCheckSuiteInput, receiptId: string) {
  return readPassingSuite(buildSuitePlan(input), receiptId);
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
  const stop = (code: string, incomplete: boolean) => {
    const validation = { ...prepared.validation, status: 'failed', code } as const;
    const failure = { code, message: 'A required project check did not produce a passing receipt.' };
    return incomplete
      ? store.transition(receipt.id, { to: 'incomplete', at: new Date().toISOString(),
        validation, failure, after: outcome(receipt, children, 'partial') })
      : store.fail(receipt.id, { validation, failure });
  };
  for (const command of plan.commands) {
    let child: ActionReceipt;
    try { child = await executeProjectCheck({ lease, bound: command.bound, runtime, store, actorId, workspaceId }); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'PROJECT_CHECK_BINDING_UNREADY') {
        return stop('PROJECT_CHECK_SUITE_BINDING_CHANGED', false);
      }
      throw error;
    }
    children.push(child);
    if (child.status === 'committed') continue;
    if (child.status === 'incomplete') return stop('PROJECT_CHECK_SUITE_UNCONFIRMED', true);
    return stop('PROJECT_CHECK_SUITE_FAILED', false);
  }

  let reopened: ActionReceipt[];
  try {
    reopened = plan.commands.map((command, index) => readPassingChild(plan, command, links[index]));
    plan.first.assertReady();
  } catch {
    return stop('PROJECT_CHECK_SUITE_UNCONFIRMED', true);
  }
  store.commit(receipt.id, {
    validation: { ...prepared.validation, status: 'passed', code: PASSED },
    after: outcome(receipt, reopened, 'applied'),
  });
  return readPassingSuite(plan, receipt.id).receipt;
}
