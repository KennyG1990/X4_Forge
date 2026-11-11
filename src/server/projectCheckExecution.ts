import { createHash } from 'node:crypto';
import path from 'node:path';
import { ActionReceiptValidationError, canonicalJson, redactReceiptText, type ActionReceipt, type ActionReceiptPrepareInput } from '../lib/actionReceipt';
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

/** Diagnostic only: the exact worker-output hash remains in validation.summary. */
export function projectCheckFailureMessage(result: Pick<ProjectCheckWorkerResult, 'outputTailBase64'>,
  privatePaths: readonly string[]): string | undefined {
  try {
    // The trusted worker has already bounded and checked this retained byte tail.
    let text = Buffer.from(result.outputTailBase64, 'base64').toString('utf8')
      // eslint-disable-next-line no-control-regex -- Strip terminal controls before credential matching.
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      // eslint-disable-next-line no-control-regex -- These characters must not survive in receipt text.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '');
    // Redact before clipping, including an opening private-key block whose end was not retained.
    text = text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gi, '[redacted-private-key]');
    text = redactReceiptText(text);
    for (const privatePath of [...privatePaths].filter(Boolean).sort((a, b) => b.length - a.length)) {
      const pattern = privatePath.split(/[\\/]/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]');
      text = text.replace(new RegExp(pattern, 'gi'), '[private-path]');
    }
    text = text
      .replace(/(["'])(?:[a-z]:[\\/]|\\\\)[^\r\n]*?\1/gi, '[private-path]')
      .replace(/(?:[a-z]:[\\/]|\\\\)[^\s"'<>|]*/gi, '[private-path]')
      .replace(/\s+/g, ' ').trim();
    if (!text) return;
    const prefix = 'Check output (excerpt): ';
    return prefix + (text.length <= 512 - prefix.length ? text : `…${text.slice(-(511 - prefix.length))}`);
  } catch {
    // Presentation failure must not discard the confirmed terminal worker result.
    return;
  }
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
    const command = bound.binding.command;
    const message = projectCheckFailureMessage(result, [command.cwd, command.executable, path.dirname(command.executable),
      command.environment.FORGE_ARTIFACT_ROOT, runtime.pythonPath, runtime.workerPath,
      path.dirname(runtime.pythonPath), path.dirname(runtime.workerPath),
      bound.sourceKey.slice('source:'.length)]);
    const validation = { ...validator, status: 'failed', code, summary } as const;
    try {
      return store.fail(receipt.id, { validation, failure: { code, ...(message ? { message } : {}) } });
    } catch (error) {
      // This narrow shape rejection happens before persistence. Never retry a storage error.
      if (!message || !(error instanceof ActionReceiptValidationError) || error.errors.length !== 1
        || !error.errors[0].startsWith('failure.message ')) throw error;
      return store.fail(receipt.id, { validation,
        failure: { code, message: 'Check failed; its diagnostic excerpt was unavailable.' } });
    }
  }
  return store.commit(receipt.id, {
    validation: { ...validator, status: 'passed', code: 'PROJECT_CHECK_PASSED', summary },
    after: { outcome: 'applied', resources: [{ ...target, hash: digest({ requestHash, evidence }) }] },
  });
}
