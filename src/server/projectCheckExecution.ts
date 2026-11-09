import { createHash } from 'node:crypto';
import { canonicalJson, type ActionReceipt, type ActionReceiptPrepareInput } from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import type { bindProjectCheckCommand } from './projectCheckCommand';
import { runProjectCheckWorker, type ProjectCheckWorkerResult, type TrustedProjectCheckWorker } from './projectCheckWorker';
import type { ProjectCheckSourceLease } from './sharedSourceCoordinator';

const CAPABILITY = 'project-check.command';
const VERSION = '1';
const failureCodes = {
  failed: 'PROJECT_CHECK_EXIT_NONZERO',
  'timed-out': 'PROJECT_CHECK_TIMED_OUT',
  'output-limit': 'PROJECT_CHECK_OUTPUT_LIMIT',
  canceled: 'PROJECT_CHECK_CANCELED',
  'infrastructure-error': 'PROJECT_CHECK_INFRASTRUCTURE_FAILED',
} as const;

interface ProjectCheckExecutionInput {
  lease: ProjectCheckSourceLease;
  bound: ReturnType<typeof bindProjectCheckCommand>;
  runtime: TrustedProjectCheckWorker;
  store: ActionReceiptStore;
  workspaceId: string;
  actorId: string;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function projectCheckCommandReceiptInput(
  input: Pick<ProjectCheckExecutionInput, 'bound' | 'runtime' | 'workspaceId' | 'actorId'>,
): ActionReceiptPrepareInput {
  const { bound, runtime } = input;
  const { binding, bindingHash, commandHash } = bound;
  const { command } = binding;
  const resource = { role: 'data', root: 'project-check-results', relativePath: `${command.runId}/${command.checkId}`,
    beforeHash: binding.artifactHash } as const;
  const requestHash = digest({ bindingHash, python: runtime.pythonSha256,
    worker: runtime.workerSha256, launcher: runtime.launcherSha256 });
  return {
    actor: { kind: 'service', id: input.actorId },
    client: { channel: 'internal', id: 'forge-project-checks', version: VERSION },
    capability: { id: CAPABILITY, version: VERSION },
    authority: {
      scope: 'workspace', workspaceId: input.workspaceId, requestScope: CAPABILITY,
      operationId: `project-check:${command.runId}:${command.checkId}`, resources: [resource],
    },
    effects: { declared: [{ id: 'command-attempt', operation: 'execute', resource, reversible: false }] },
    input: { requestHash, beforeHash: binding.artifactHash },
    validation: { validator: command.runner, ruleHash: commandHash },
    rollback: { required: false, mode: 'none' },
    metadata: { modId: binding.modId, reviewContextHash: binding.setupHash, artifactHash: binding.artifactHash,
      originalReceiptId: binding.approvalId },
  };
}

/** Run one reviewed command while the server still owns the addressed source claim. */
export async function executeProjectCheck(input: ProjectCheckExecutionInput): Promise<ActionReceipt> {
  const { lease, bound, store } = input;
  const runtime = Object.freeze({ ...input.runtime });
  lease.assertProjectCheckAuthority(bound.sourceKey, input.workspaceId, input.actorId);
  try { bound.assertReady(); }
  catch (cause) {
    throw Object.assign(new Error('The reviewed project check is no longer ready.'), {
      code: 'PROJECT_CHECK_BINDING_UNREADY', cause,
    });
  }
  const prepared = projectCheckCommandReceiptInput({ ...input, runtime });
  const { role, root, relativePath } = prepared.authority.resources[0];
  const target = { role, root, relativePath };
  const validator = prepared.validation;
  const { requestHash } = prepared.input;
  const { receipt, created } = store.prepareWithDisposition(prepared);
  if (!created) throw Object.assign(new Error('This exact project check attempt already has a receipt.'), {
    code: 'PROJECT_CHECK_ATTEMPT_EXISTS',
  });

  let result: ProjectCheckWorkerResult;
  try {
    result = await runProjectCheckWorker(lease, bound, runtime);
  } catch {
    const code = 'PROJECT_CHECK_RESULT_UNCONFIRMED';
    return store.transition(receipt.id, {
      to: 'incomplete', at: new Date().toISOString(),
      validation: { ...validator, status: 'failed', code },
      failure: { code, message: 'The helper result or its durable cleanup could not be confirmed.' },
      after: { outcome: 'partial', resources: [{ ...target, hash: digest({ requestHash, code }) }] },
    });
  }

  const evidence = {
    status: result.status,
    exitCode: result.exitCode,
    outputBytes: result.outputBytes,
    outputTailSha256: createHash('sha256').update(Buffer.from(result.outputTailBase64, 'base64')).digest('hex'),
    durationMs: Math.round(result.durationSeconds * 1000),
  };
  const summary = canonicalJson(evidence);
  try { bound.assertReady(); }
  catch {
    const code = 'PROJECT_CHECK_BINDING_CHANGED';
    return store.fail(receipt.id, {
      validation: { ...validator, status: 'failed', code, summary },
      failure: { code, message: 'The reviewed setup, approval or frozen artifact changed during execution.' },
    });
  }
  if (result.status !== 'passed') {
    const code = failureCodes[result.status];
    return store.fail(receipt.id, {
      validation: { ...validator, status: 'failed', code, summary }, failure: { code },
    });
  }
  return store.commit(receipt.id, {
    validation: { ...validator, status: 'passed', code: 'PROJECT_CHECK_PASSED', summary },
    after: { outcome: 'applied', resources: [{ ...target, hash: digest({ requestHash, evidence }) }] },
  });
}
