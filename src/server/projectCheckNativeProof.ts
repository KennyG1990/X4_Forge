import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import { canonicalDirectoryPath, isSameOrDescendant, pathsOverlap } from '../lib/pathRoles';
import { atomicWriteJson } from '../lib/workspaceState';
import type { DeploymentSnapshot } from './deploymentSnapshot';
import { ProjectCheckApprovalLedger } from './projectCheckApproval';
import { assertProjectCheckOwnerCredential } from './projectCheckOwnerProof';
import { isProjectCheckRelativeFile } from './projectCheckProposal';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from './projectCheckSetup';
import { requirePassedProjectCheckSuite } from './projectCheckSuite';
import { openProjectCheckStageContext, type ProjectCheckStageContext, type ProjectCheckStageCoordinator } from './projectCheckStaging';
import { canonicalSourceKey } from './resourceCoordinator';
import { forgeSourceCoordinator, type ProjectCheckStageLease } from './sharedSourceCoordinator';
import { PROJECT_CHECK_WORKER_GRACE_MS, verifyProjectCheckWorkerRuntime, type TrustedProjectCheckWorker } from './projectCheckWorker';

const MAX_AUTHORITY_BYTES = 64 * 1024;
const receiptIdPattern = /^ar_[a-f0-9]{64}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const local = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value)
  // eslint-disable-next-line no-control-regex -- Reject colon, C0 and DEL after the drive prefix in local proof paths.
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
  filesystemRoot?: string;
  addressedSourceRoot: string;
  targetRoot: string;
  stagingRoot: string;
  snapshot: DeploymentSnapshot;
  stageContext: Readonly<ProjectCheckStageContext>;
}
export type NativeProofScope = Omit<NativeProofInput, 'receiptId' | 'snapshot' | 'stageContext'>;

export function projectCheckOwnerProfileEnabled(env = process.env): boolean {
  return env.X4_FORGE_PROJECT_CHECK_OWNER_POLICY !== undefined;
}

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

function parseAuthority(bytes: Buffer): unknown {
  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) throw authorityRefused();
  return JSON.parse(decoded);
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

function runtimePin(worker: unknown): TrustedProjectCheckWorker {
  if (!object(worker) || !exact(worker, ['pythonPath', 'pythonSha256', 'workerPath', 'workerSha256', 'launcherSha256', 'systemRoot'])
    || ![worker.pythonPath, worker.workerPath, worker.systemRoot].every(local)
    || ![worker.pythonSha256, worker.workerSha256, worker.launcherSha256].every(hash => typeof hash === 'string' && hashPattern.test(hash))) {
    throw authorityRefused();
  }
  return worker as unknown as TrustedProjectCheckWorker;
}

function interpreterPin(config: Record<string, unknown>) {
  const { interpreterPath, interpreterDependencies } = config;
  const root = process.env.X4_FORGE_DEV_ROOT;
  if (!local(root) || !local(interpreterPath) || !isSameOrDescendant(interpreterPath, root)
    || !Array.isArray(interpreterDependencies) || interpreterDependencies.length > 128
    || !interpreterDependencies.every(isProjectCheckRelativeFile)) throw authorityRefused();
  return { interpreterPath, interpreterDependencies };
}

/** The local launcher provisions one public credential and subject outside Forge HTTP. */
export function readNativeProjectCheckOwnerPolicy() {
  const raw = process.env.X4_FORGE_PROJECT_CHECK_OWNER_POLICY;
  if (!raw || Buffer.byteLength(raw) > MAX_AUTHORITY_BYTES) throw authorityRefused();
  const config: unknown = JSON.parse(raw);
  if (!object(config) || !exact(config, ['version', 'workspaceId', 'actorId', 'modId', 'sourceRoot',
    'interpreterPath', 'interpreterDependencies', 'runtime', 'credential']) || config.version !== 1
    || typeof config.workspaceId !== 'string' || !/^ws_[a-f0-9]{24}$/.test(config.workspaceId)
    || typeof config.actorId !== 'string' || !/^key_[a-z0-9]+_[a-f0-9]{8}$/.test(config.actorId)
    || typeof config.modId !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(config.modId) || !local(config.sourceRoot)) {
    throw authorityRefused();
  }
  const pin = config.credential;
  if (!object(pin) || !exact(pin, ['ownerId', 'origin', 'credentialId', 'userHandle', 'publicKeySpki'])
    || typeof pin.ownerId !== 'string' || typeof pin.origin !== 'string' || typeof pin.credentialId !== 'string'
    || typeof pin.userHandle !== 'string' || typeof pin.publicKeySpki !== 'string'
    || !/^[A-Za-z0-9_-]{1,256}$/.test(pin.publicKeySpki)) throw authorityRefused();
  const origin = new URL(pin.origin);
  if (origin.hostname !== 'localhost' || origin.protocol !== 'http:' || origin.origin !== pin.origin || !origin.port) throw authorityRefused();
  const spki = Buffer.from(pin.publicKeySpki, 'base64url');
  if (spki.toString('base64url') !== pin.publicKeySpki) throw authorityRefused();
  const publicKey = createPublicKey({ key: spki, type: 'spki', format: 'der' });
  if (!publicKey.export({ type: 'spki', format: 'der' }).equals(spki)) throw authorityRefused();
  const credential = { ownerId: pin.ownerId, origin: pin.origin, credentialId: pin.credentialId, userHandle: pin.userHandle, publicKey };
  assertProjectCheckOwnerCredential(credential);
  return { workspaceId: config.workspaceId, actorId: config.actorId, modId: config.modId, sourceRoot: config.sourceRoot,
    ...interpreterPin(config), runtime: runtimePin(config.runtime), ownerId: pin.ownerId, origin: pin.origin, port: Number(origin.port),
    credential, policyHash: createHash('sha256').update(raw).digest('hex') };
}

type OwnerPolicy = ReturnType<typeof readNativeProjectCheckOwnerPolicy>;

function ownerActivation(input: NativeProofScope, policy: OwnerPolicy, file: string, scratch: string) {
  const root = process.env.X4_FORGE_DEV_ROOT!;
  const gameRoot = path.dirname(path.dirname(input.targetRoot));
  const dataRoot = path.dirname(input.store.root);
  const protectedRoots = [dataRoot, process.env.X4_SOURCE_COORDINATION_DIR!, process.env.X4_STATE_DIR!,
    process.env.X4_CONFIG_DIR!, process.env.X4_STUDIO_CACHE_DIR!, scratch,
    path.dirname(policy.interpreterPath), path.dirname(policy.runtime.workerPath)];
  if (input.workspaceId !== policy.workspaceId || input.actorId !== policy.actorId || input.modId !== policy.modId
    || !sameLocalPath(input.sourceRoot, policy.sourceRoot) || (input.filesystemRoot && !sameLocalPath(input.filesystemRoot, path.join(gameRoot, 'extensions')))
    || protectedRoots.some((candidate, index) => !local(candidate) || !isSameOrDescendant(candidate, root) || sameLocalPath(candidate, root)
      || !sameLocalPath(candidate, canonicalDirectoryPath(candidate))
      || pathsOverlap(candidate, input.workspaceRoot) || pathsOverlap(candidate, gameRoot)
      || protectedRoots.slice(index + 1).some(other => pathsOverlap(candidate, other)))
    || [input.workspaceRoot, gameRoot].some(candidate => pathsOverlap(candidate, process.cwd()))
    || [input.workspaceRoot, gameRoot, ...protectedRoots].some(candidate => pathsOverlap(candidate, path.dirname(policy.runtime.pythonPath)))) {
    throw authorityRefused();
  }
  const read = () => {
    if (!fs.lstatSync(file, { throwIfNoEntry: false })) return;
    const original = authorityBytes(file);
    const value = parseAuthority(original);
    if (!object(value) || !exact(value, ['version', 'ownerPolicyHash', 'approvalId']) || value.version !== 2
      || typeof value.ownerPolicyHash !== 'string' || !hashPattern.test(value.ownerPolicyHash)
      || typeof value.approvalId !== 'string' || !receiptIdPattern.test(value.approvalId)) {
      throw authorityRefused();
    }
    return { approvalId: value.approvalId, policyHash: value.ownerPolicyHash, original };
  };
  return { read, activate(approvalId: string, expected?: Buffer) {
    assertDevScope(input, file);
    if (!receiptIdPattern.test(approvalId) || readNativeProjectCheckOwnerPolicy().policyHash !== policy.policyHash) throw authorityRefused();
    const current = read()?.original;
    if (current ? !expected?.equals(current) : expected !== undefined) throw authorityRefused();
    atomicWriteJson(file, { version: 2, ownerPolicyHash: policy.policyHash, approvalId }, { mode: 0o600 });
  } };
}

function sameLocalPath(left: string, right: string): boolean {
  return local(left) && local(right) && path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function authorityFile(store: ActionReceiptStore): string {
  return path.join(path.dirname(store.root), 'project-check-deploy-authority.json');
}

export function openNativeProjectCheckOwnerAuthority(input: NativeProofScope, policy: OwnerPolicy) {
  const file = authorityFile(input.store);
  const scratch = assertDevScope(input, file);
  const activation = ownerActivation(input, policy, file, scratch);
  return { reviewState() {
    const prior = activation.read();
    return {
      activeApprovalId: prior?.policyHash === policy.policyHash ? prior.approvalId : undefined,
      activationHash: prior && createHash('sha256').update(prior.original).digest('hex'),
      activate: (approvalId: string) => activation.activate(approvalId, prior?.original),
    };
  } };
}

/** Read the exact server-owned authority shared by suite execution and native apply. */
export function loadNativeProjectCheckAuthority(input: NativeProofScope, payloadRoot?: string) {
  const file = authorityFile(input.store);
  try {
    const scratch = assertDevScope(input, file, payloadRoot);
    const policy = projectCheckOwnerProfileEnabled() ? readNativeProjectCheckOwnerPolicy() : undefined;
    if (!policy && process.env.X4_FORGE_PROJECT_CHECK_LEGACY_FIXTURE !== '1') throw authorityRefused();
    const active = policy ? ownerActivation(input, policy, file, scratch).read() : undefined;
    if (policy && active?.policyHash !== policy.policyHash) throw authorityRefused();
    const original = active?.original ?? authorityBytes(file);
    const config = policy && active ? { ...policy, approvalId: active.approvalId } : readFixtureAuthority(input, original);
    const { runtime, approvalId, ownerId, interpreterPath, interpreterDependencies } = config;
    if (policy) verifyProjectCheckWorkerRuntime(runtime);
    const setupInput = { modId: input.modId, sourceRoot: input.sourceRoot, interpreterPath, interpreterDependencies };
    const approvals = new ProjectCheckApprovalLedger(input.store, ownerId, () => false);
    const setup = captureProjectCheckSetup(setupInput);
    const approval = approvals.requireUsable(approvalId, setup);
    const configurationHash = createHash('sha256').update(original).digest('hex');
    const assertCurrent = () => {
      assertDevScope(input, file, payloadRoot);
      if (policy) {
        ownerActivation(input, policy, file, scratch);
        verifyProjectCheckWorkerRuntime(runtime);
      }
      if (createHash('sha256').update(authorityBytes(file)).digest('hex') !== configurationHash
        || (policy && readNativeProjectCheckOwnerPolicy().policyHash !== policy.policyHash)) throw authorityRefused();
    };
    const workerBudgetMs = setup.checks.reduce((budget, check) => budget + check.timeoutSeconds * 1000 + PROJECT_CHECK_WORKER_GRACE_MS, 0);
    return { scratch, runtime, setupInput, setupHash: setup.setupHash, approvals, approvalId, approvalHash: approval.hash,
      configurationHash, workerBudgetMs, assertCurrent };
  } catch { throw authorityRefused(); }
}

function readFixtureAuthority(input: NativeProofScope, original: Buffer) {
  const config = parseAuthority(original);
  if (!object(config) || !exact(config, ['version', 'workspaceId', 'actorId', 'modId', 'sourceRoot', 'ownerId',
    'approvalId', 'interpreterPath', 'interpreterDependencies', 'runtime'])
    || config.version !== 1 || config.workspaceId !== input.workspaceId || config.actorId !== input.actorId
    || config.modId !== input.modId || !local(config.sourceRoot)
    || canonicalDirectoryPath(config.sourceRoot).toLowerCase() !== canonicalDirectoryPath(input.sourceRoot).toLowerCase()
    || typeof config.ownerId !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/.test(config.ownerId)
    || typeof config.approvalId !== 'string' || !receiptIdPattern.test(config.approvalId)) throw authorityRefused();
  return { ownerId: config.ownerId, approvalId: config.approvalId, ...interpreterPin(config), runtime: runtimePin(config.runtime) };
}

function nativeSuiteReceipt(input: NativeProofScope, receiptId: string, expectedHash?: string, artifactHash?: string) {
  if (!receiptIdPattern.test(receiptId) || (expectedHash !== undefined && !hashPattern.test(expectedHash))) throw authorityRefused();
  const receipt = input.store.read(receiptId);
  const runId = /^project-check-suite:([a-f0-9]{32})$/.exec(receipt.authority.operationId)?.[1];
  if (!runId || receipt.status !== 'committed' || receipt.actor.kind !== 'service' || receipt.actor.id !== input.actorId
    || receipt.authority.scope !== 'workspace' || receipt.authority.workspaceId !== input.workspaceId
    || receipt.authority.requestScope !== 'project-check.suite' || !('id' in receipt.capability)
    || receipt.capability.id !== 'project-check.suite' || receipt.capability.version !== '1' || receipt.metadata?.modId !== input.modId
    || (expectedHash !== undefined && receipt.hash !== expectedHash)
    || (artifactHash !== undefined && (!hashPattern.test(artifactHash) || receipt.input.beforeHash !== artifactHash
      || receipt.metadata?.artifactHash !== artifactHash))) throw authorityRefused();
  return { receipt, runId };
}

/** Verify private scope/receipt identity before sweeping or allocating any check bytes. */
export function openNativeProjectCheckStaging(input: NativeProofScope, lease: ProjectCheckStageLease,
  selection?: { receiptId: string; expectedHash?: string; artifactHash: string },
  coordinator: ProjectCheckStageCoordinator = forgeSourceCoordinator) {
  try {
    const scratch = fs.realpathSync.native(assertDevScope(input, authorityFile(input.store)));
    let runId: string;
    if (selection) {
      const authority = loadNativeProjectCheckAuthority(input);
      const selected = nativeSuiteReceipt(input, selection.receiptId, selection.expectedHash, selection.artifactHash);
      if (selected.receipt.metadata?.originalReceiptId !== authority.approvalId) throw authorityRefused();
      authority.assertCurrent(); runId = selected.runId;
    } else { runId = randomBytes(16).toString('hex'); }
    return openProjectCheckStageContext({ sourceKey: canonicalSourceKey(input.sourceRoot), actorId: input.actorId,
      workspaceId: input.workspaceId, runId }, lease, coordinator, [scratch]);
  } catch { throw authorityRefused(); }
}

/** Consume an existing suite inside the existing native deployment authority claim. */
export function openNativeProjectCheckProof(input: NativeProofInput) {
  try {
    const authority = loadNativeProjectCheckAuthority(input, input.snapshot.payloadRoot);
    const { scratch, runtime, setupInput, setupHash, approvals, approvalId } = authority;
    const { receipt, runId } = nativeSuiteReceipt(input, input.receiptId, undefined, input.snapshot.manifest.hash);
    const context = input.stageContext;
    if (!context || context.runId !== runId || context.actorId !== input.actorId || context.workspaceId !== input.workspaceId
      || context.sourceKey !== canonicalSourceKey(input.sourceRoot)) throw authorityRefused();
    context.lease.assertProjectCheckAuthority(context.sourceKey, input.workspaceId, input.actorId);
    input.snapshot.assertProjectCheckStageContext(context);
    const frozen = freezeProjectCheckSetup(setupInput, setupHash, scratch, context);
    try {
      const verifySuite = () => {
        try {
          authority.assertCurrent();
          const proof = requirePassedProjectCheckSuite({ setupInput, frozen, artifact: { modId: input.modId, snapshot: input.snapshot },
            approvals, approvalId, runId, systemRoot: runtime.systemRoot, runtime, store: input.store,
            workspaceId: input.workspaceId, actorId: input.actorId }, input.receiptId);
          if (proof.receipt.hash !== receipt.hash) throw authorityRefused();
          return { proof: { id: proof.receipt.id, hash: proof.receipt.hash, reviewBasisHash: proof.reviewBasisHash },
            verification: proof.verification };
        } catch { throw authorityRefused(); }
      };
      return { ...verifySuite(), verify: () => verifySuite().proof, dispose: frozen.dispose };
    } catch (error) {
      frozen.dispose();
      throw error;
    }
  } catch { throw authorityRefused(); }
}
