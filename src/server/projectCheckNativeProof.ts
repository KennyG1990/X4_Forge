import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import { canonicalDirectoryPath, isSameOrDescendant, pathsOverlap } from '../lib/pathRoles';
import type { DeploymentSnapshot } from './deploymentSnapshot';
import { ProjectCheckApprovalLedger } from './projectCheckApproval';
import { isProjectCheckRelativeFile } from './projectCheckProposal';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from './projectCheckSetup';
import { requirePassedProjectCheckSuite } from './projectCheckSuite';
import { PROJECT_CHECK_WORKER_GRACE_MS, type TrustedProjectCheckWorker } from './projectCheckWorker';

const MAX_AUTHORITY_BYTES = 64 * 1024;
const receiptIdPattern = /^ar_[a-f0-9]{64}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const local = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value)
  && !/[:\u0000-\u001f\u007f]/.test(value.slice(2));
const authorityRefused = () => Object.assign(new Error('The approved project check proof is unavailable for this Dev workspace and target.'),
  { code: 'PROJECT_CHECK_PROOF_MISMATCH' });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

interface NativeProofInput {
  store: ActionReceiptStore;
  receiptId: string;
  workspaceId: string;
  actorId: string;
  modId: string;
  sourceRoot: string;
  workspaceRoot: string;
  addressedSourceRoot: string;
  targetRoot: string;
  stagingRoot: string;
  snapshot: DeploymentSnapshot;
}
type NativeProofScope = Omit<NativeProofInput, 'receiptId' | 'snapshot'>;

function authorityBytes(file: string): Buffer {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(MAX_AUTHORITY_BYTES)) throw authorityRefused();
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(MAX_AUTHORITY_BYTES + 1);
    const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const after = fs.fstatSync(fd, { bigint: true });
    if (BigInt(size) !== before.size || after.size !== before.size || after.ino !== before.ino || after.dev !== before.dev
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) throw authorityRefused();
    return buffer.subarray(0, size);
  } finally { fs.closeSync(fd); }
}

function assertDevScope(input: NativeProofScope, file: string, payloadRoot?: string) {
  const root = process.env.X4_FORGE_DEV_ROOT;
  const coordination = process.env.X4_SOURCE_COORDINATION_DIR;
  const state = process.env.X4_STATE_DIR;
  const config = process.env.X4_CONFIG_DIR;
  const cache = process.env.X4_STUDIO_CACHE_DIR;
  const scratch = os.tmpdir();
  const game = path.dirname(path.dirname(input.targetRoot));
  const roles = [input.sourceRoot, game, path.dirname(input.stagingRoot), input.store.root, coordination, state, config, cache, scratch];
  const paths = [...roles, input.workspaceRoot, input.addressedSourceRoot, input.targetRoot, path.dirname(input.targetRoot), input.stagingRoot,
    path.join(input.stagingRoot, path.basename(input.targetRoot)),
    file, ...(payloadRoot ? [payloadRoot] : [])];
  if (process.platform !== 'win32' || process.env.X4_FORGE_MODE !== 'dev-build' || !local(root)
    || path.parse(root).root === path.resolve(root) || !fs.lstatSync(root).isDirectory()
    || fs.existsSync(path.join(game, 'X4.exe'))
    || paths.some(candidate => !local(candidate) || !isSameOrDescendant(candidate, root)
      || canonicalDirectoryPath(candidate).toLowerCase() !== path.resolve(candidate).toLowerCase()
      || path.resolve(candidate).toLowerCase() === path.resolve(root).toLowerCase())
    || !isSameOrDescendant(input.sourceRoot, input.workspaceRoot)
    || path.resolve(input.sourceRoot).toLowerCase() === path.resolve(input.workspaceRoot).toLowerCase()
    || canonicalDirectoryPath(input.sourceRoot).toLowerCase() !== canonicalDirectoryPath(input.addressedSourceRoot).toLowerCase()) {
    throw authorityRefused();
  }
  const writable = roles.filter(local);
  if (writable.some((candidate, index) => writable.slice(index + 1).some(other => pathsOverlap(candidate, other)))) throw authorityRefused();
  return scratch;
}

/** Read the exact server-owned authority shared by suite execution and native apply. */
export function loadNativeProjectCheckAuthority(input: NativeProofScope, payloadRoot?: string) {
  const file = path.join(path.dirname(input.store.root), 'project-check-deploy-authority.json');
  try {
    const scratch = assertDevScope(input, file, payloadRoot);
    const original = authorityBytes(file);
    const decoded = original.toString('utf8');
    if (!Buffer.from(decoded, 'utf8').equals(original)) throw authorityRefused();
    const config: unknown = JSON.parse(decoded);
    if (!object(config) || !exact(config, ['version', 'workspaceId', 'actorId', 'modId', 'sourceRoot', 'ownerId',
      'approvalId', 'interpreterPath', 'interpreterDependencies', 'runtime'])
      || config.version !== 1 || config.workspaceId !== input.workspaceId || config.actorId !== input.actorId
      || config.modId !== input.modId || !local(config.sourceRoot)
      || canonicalDirectoryPath(config.sourceRoot).toLowerCase() !== canonicalDirectoryPath(input.sourceRoot).toLowerCase()
      || typeof config.ownerId !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/.test(config.ownerId)
      || typeof config.approvalId !== 'string' || !receiptIdPattern.test(config.approvalId)
      || !local(config.interpreterPath) || !isSameOrDescendant(config.interpreterPath, process.env.X4_FORGE_DEV_ROOT!)
      || !Array.isArray(config.interpreterDependencies) || config.interpreterDependencies.length > 128
      || !config.interpreterDependencies.every(isProjectCheckRelativeFile)) throw authorityRefused();
    const worker = config.runtime;
    if (!object(worker) || !exact(worker, ['pythonPath', 'pythonSha256', 'workerPath', 'workerSha256', 'launcherSha256', 'systemRoot'])
      || ![worker.pythonPath, worker.workerPath, worker.systemRoot].every(local)
      || ![worker.pythonSha256, worker.workerSha256, worker.launcherSha256].every(hash => typeof hash === 'string' && hashPattern.test(hash))) {
      throw authorityRefused();
    }
    const runtime = worker as unknown as TrustedProjectCheckWorker;
    const setupInput = { modId: input.modId, sourceRoot: input.sourceRoot,
      interpreterPath: config.interpreterPath, interpreterDependencies: config.interpreterDependencies };
    const approvals = new ProjectCheckApprovalLedger(input.store, config.ownerId, () => false);
    const setup = captureProjectCheckSetup(setupInput);
    const approvalId = config.approvalId;
    const approval = approvals.requireUsable(approvalId, setup);
    const configurationHash = createHash('sha256').update(original).digest('hex');
    const assertCurrent = () => {
      assertDevScope(input, file, payloadRoot);
      if (createHash('sha256').update(authorityBytes(file)).digest('hex') !== configurationHash) throw authorityRefused();
    };
    const workerBudgetMs = setup.checks.reduce((budget, check) => budget + check.timeoutSeconds * 1000 + PROJECT_CHECK_WORKER_GRACE_MS, 0);
    return { scratch, runtime, setupInput, setupHash: setup.setupHash, approvals, approvalId, approvalHash: approval.hash,
      configurationHash, workerBudgetMs, assertCurrent };
  } catch { throw authorityRefused(); }
}

/** Consume an existing suite inside the existing native deployment authority claim. */
export function openNativeProjectCheckProof(input: NativeProofInput) {
  try {
    const authority = loadNativeProjectCheckAuthority(input, input.snapshot.payloadRoot);
    const { scratch, runtime, setupInput, setupHash, approvals, approvalId } = authority;
    const receipt = input.store.read(input.receiptId);
    const runId = /^project-check-suite:([a-f0-9]{32})$/.exec(receipt.authority.operationId)?.[1];
    if (!runId) throw authorityRefused();
    const frozen = freezeProjectCheckSetup(setupInput, setupHash, scratch);
    try {
      const verify = () => {
        try {
          authority.assertCurrent();
          const proof = requirePassedProjectCheckSuite({ setupInput, frozen, artifact: { modId: input.modId, snapshot: input.snapshot },
            approvals, approvalId, runId, systemRoot: runtime.systemRoot, runtime, store: input.store,
            workspaceId: input.workspaceId, actorId: input.actorId }, input.receiptId);
          if (proof.receipt.hash !== receipt.hash) throw authorityRefused();
          return { id: proof.receipt.id, hash: proof.receipt.hash, reviewBasisHash: proof.reviewBasisHash };
        } catch { throw authorityRefused(); }
      };
      return { proof: verify(), verify, dispose: frozen.dispose };
    } catch (error) {
      frozen.dispose();
      throw error;
    }
  } catch { throw authorityRefused(); }
}
