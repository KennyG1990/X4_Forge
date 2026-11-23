/** Deployment identity and durable audit records; authentication remains in the route middleware. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { actionReceiptIdForOperation, transitionActionReceipt, type ActionReceipt, type ActionReceiptOperationIdentity } from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import { hashArtifactFile } from '../lib/artifactPipeline';
import { LEDGER_MAX_BYTES, type AgentHistoryStore } from '../lib/agentHistoryStore';
import type { DeploymentRecoveryRecord, DestructiveRecoveryStore } from '../lib/destructiveRecovery';
import { readContentManifestIdentity } from '../lib/validationEvidence';
import { readCanonicalMdCompiledWorkerIdentity, type CanonicalMdCompiledWorkerIdentity } from './canonicalMdProviderPreparation';
import type { DeploymentSnapshot } from './deploymentSnapshot';
import type { AcceptanceDecision, AcceptancePrincipal, AcceptanceSubject } from './findingAcceptance';
import { processLiveness } from './sharedSourceCoordinator';

export function trustHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_key, item) => {
    if (item instanceof Set) return [...item].sort();
    if (item instanceof Map) return [...item].sort(([a], [b]) => String(a).localeCompare(String(b)));
    return item;
  })).digest('hex');
}

export function deploymentBuildIdentity(snapshot: DeploymentSnapshot, canonicalTarget: string) {
  const manifests = snapshot.files.filter(file => file.path.toLowerCase() === 'content.xml');
  const manifest = manifests.length === 1 ? readContentManifestIdentity(manifests[0].content) : null;
  if (!manifest) return undefined;
  const files = snapshot.manifest.files.map(({ path, size, sha256 }) => [path, size, sha256] as const)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return { ...manifest, destinationHash: trustHash(canonicalTarget), logicalPayloadHash: trustHash(files) };
}

type DeploymentBuild = NonNullable<ReturnType<typeof deploymentBuildIdentity>>;
const BUILD_SUMMARY_PREFIX = 'X4 deployment build v1 ';
const digest = /^[a-f0-9]{64}$/;
const DEPLOY_EFFECT_REF = 'deploy-effect-v1:';

export function prepareDeployEffect(effect: object) {
  const content = JSON.stringify(effect, null, 2);
  if (Buffer.byteLength(content, 'utf8') > LEDGER_MAX_BYTES) {
    return { reference: DEPLOY_EFFECT_REF + 'unavailable', bytes: null };
  }
  const bytes = Buffer.from(content, 'utf8');
  return { reference: DEPLOY_EFFECT_REF + createHash('sha256').update(bytes).digest('hex'), bytes };
}

export function deployEffectReference(receipt: ActionReceipt | undefined): string | undefined {
  const trace = receipt?.metadata?.traceId;
  return receipt?.metadata?.operation === 'deploy' && typeof trace === 'string' && trace.startsWith(DEPLOY_EFFECT_REF)
    ? trace.slice(DEPLOY_EFFECT_REF.length) : undefined;
}

export function readDeployEffect(history: AgentHistoryStore, receipt: ActionReceipt) {
  if (receipt.status !== 'committed') return { report: { status: 'not-committed' as const }, raw: null };
  const hash = deployEffectReference(receipt);
  if (hash === undefined) return { report: { status: 'legacy' as const }, raw: null };
  const raw = digest.test(hash) ? history.readVerifiedDeployEffect(hash) : null;
  if (raw) {
    try {
      const effect = JSON.parse(raw.toString('utf8')) as Record<string, unknown> | null;
      if (effect && Array.isArray(effect.added) && Array.isArray(effect.overwritten) && Array.isArray(effect.deleted)
        && Array.isArray(effect.preserved) && Number.isSafeInteger(effect.totalBytes)
        && (effect.format === 'catalog' || effect.format === 'loose')) {
        return { report: { status: 'available' as const, hash, effect }, raw };
      }
    } catch { /* Unavailable evidence leaves the committed outcome intact. */ }
  }
  return { report: { status: 'unavailable' as const }, raw: null };
}

const numericVersion = (input: unknown) =>
  typeof input === 'string' && /^\d{1,32}$/.test(input.trim()) ? BigInt(input.trim()) : null;

function deploymentBuildSummary(build: DeploymentBuild): string {
  return BUILD_SUMMARY_PREFIX + JSON.stringify({
    destinationHash: build.destinationHash,
    logicalPayloadHash: build.logicalPayloadHash,
    version: numericVersion(build.modVersion) === null ? null : build.modVersion!.trim(),
    date: build.modDate && /^\d{4}-\d{2}-\d{2}$/.test(build.modDate) ? build.modDate : null,
  });
}

function readDeploymentBuildSummary(summary: unknown) {
  if (typeof summary !== 'string' || !summary.startsWith(BUILD_SUMMARY_PREFIX)) return undefined;
  try {
    const facts: unknown = JSON.parse(summary.slice(BUILD_SUMMARY_PREFIX.length));
    if (!jsonObject(facts) || typeof facts.destinationHash !== 'string' || !digest.test(facts.destinationHash)
      || typeof facts.logicalPayloadHash !== 'string' || !digest.test(facts.logicalPayloadHash)) return undefined;
    return { destinationHash: facts.destinationHash, logicalPayloadHash: facts.logicalPayloadHash, version: numericVersion(facts.version) };
  } catch { return undefined; }
}

export function findUnchangedDeploymentVersion(
  build: DeploymentBuild, receipts: readonly ActionReceipt[],
  target: { folder: string; fingerprint: string; legacyHashes: readonly string[] },
): ActionReceipt | undefined {
  const version = numericVersion(build.modVersion);
  if (version === null || target.fingerprint === 'absent') return undefined;
  let previous: { receipt: ActionReceipt; at: string; facts: ReturnType<typeof readDeploymentBuildSummary> } | undefined;
  let ambiguous = false;
  for (const receipt of receipts) {
    const at = receipt.times.committedAt;
    if (receipt.status !== 'committed' || !at || receipt.metadata?.operation !== 'deploy'
      || receipt.validation.status !== 'passed' || receipt.validation.code !== 'DEPLOYED_BYTES_VERIFIED'
      || receipt.after?.outcome !== 'applied') continue;
    const facts = readDeploymentBuildSummary(receipt.metadata.summary);
    const legacyHash = receipt.metadata.targetHash;
    if (facts ? facts.destinationHash !== build.destinationHash
      : typeof legacyHash !== 'string' || !target.legacyHashes.includes(legacyHash)) continue;
    if (!previous || at > previous.at) {
      previous = { receipt, at, facts };
      ambiguous = false;
    } else if (at === previous.at) ambiguous = true;
  }
  // A newer deployment supersedes older facts even when it lacks a build summary.
  // Prove that the selected physical folder still contains the committed output.
  if (!previous || ambiguous || previous.receipt.metadata?.modId !== build.modId
    || previous.facts?.version !== version || previous.facts.logicalPayloadHash === build.logicalPayloadHash) return undefined;
  const folder = process.platform === 'win32' ? target.folder.toLowerCase() : target.folder;
  const output = previous.receipt.after?.resources.find(resource =>
    resource.role === 'deploy' && resource.root === 'extensions'
    && (process.platform === 'win32' ? resource.relativePath.toLowerCase() : resource.relativePath) === folder);
  return output?.hash === target.fingerprint ? previous.receipt : undefined;
}

const VALIDATION_PACKAGES = ['@xmldom/xmldom', 'fast-xml-parser', 'luaparse', 'xpath'];
const jsonObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** Hash once at startup, including installed parser metadata in a conventional npm layout.
 * The lock binds the dependency graph; installed metadata must agree, rather than silently
 * blessing a stale node_modules directory. This does not resolve conditional exports, support
 * custom loaders/PnP, or audit same-version package tampering.
 */
export function deploymentImplementationHash(entry: string, compiledWorker?: CanonicalMdCompiledWorkerIdentity): string {
  try {
    return implementationHash(entry, compiledWorker);
  } catch (cause) {
    throw Object.assign(new Error(`Validator fingerprint unavailable: ${cause instanceof Error ? cause.message : String(cause)}`),
      { code: 'VALIDATOR_FINGERPRINT_UNAVAILABLE', cause });
  }
}

function implementationHash(entry: string, compiledWorker?: CanonicalMdCompiledWorkerIdentity): string {
  const entryPath = fs.realpathSync.native(path.resolve(entry));
  const source = /\.ts$/.test(entryPath);
  if (!source && path.basename(path.dirname(entryPath)) !== 'dist') throw new Error('Unsupported validator entry layout.');
  const owner = source ? path.dirname(entryPath) : path.dirname(path.dirname(entryPath));
  const modules = path.join(owner, 'node_modules');
  const hashes = new Map<string, string>();
  const readObject = (file: string, limit = 1024 * 1024): Record<string, unknown> => {
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > limit) throw new Error(`Invalid fingerprint input: ${file}`);
    const bytes = fs.readFileSync(file);
    if (bytes.length > limit) throw new Error(`Fingerprint input exceeds limit: ${file}`);
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!jsonObject(value)) throw new Error(`Expected metadata object: ${file}`);
    hashes.set(file, createHash('sha256').update(bytes).digest('hex'));
    return value;
  };
  const manifest = readObject(path.join(owner, 'package.json'));
  const lock = readObject(path.join(owner, 'package-lock.json'), 16 * 1024 * 1024);
  if (!jsonObject(lock.packages) || ![2, 3].includes(Number(lock.lockfileVersion))) throw new Error('Unsupported dependency lock.');
  const lockedPackages = lock.packages;
  if (!jsonObject(manifest.dependencies)) throw new Error('Validator dependencies are not declared.');
  const declaredDependencies = manifest.dependencies;
  const pending = VALIDATION_PACKAGES.map(name => {
    if (typeof declaredDependencies[name] !== 'string') throw new Error(`Undeclared validator dependency: ${name}`);
    return { name, from: entryPath };
  });
  const visited = new Set<string>();
  // Follow only Node's documented node_modules ancestor hierarchy to locate metadata:
  // https://nodejs.org/api/modules.html#loading-from-node_modules-folders
  // Do not resolve/execute entries: valid packages may have import-only exports. The first
  // existing package is authoritative; corrupt nested metadata cannot fall back to a hoist.
  const locateMetadata = (name: string, from: string): { directory: string; file: string } => {
    let directory = path.dirname(from);
    for (let depth = 0; depth < 64; depth++, directory = path.dirname(directory)) {
      if (directory !== owner && !inside(owner, directory)) throw new Error(`Dependency importer is outside its owner: ${name}`);
      if (path.basename(directory) !== 'node_modules') {
        const candidate = path.join(directory, 'node_modules', name);
        let exists = false;
        try { fs.lstatSync(candidate); exists = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (exists) {
          const packageRoot = fs.realpathSync.native(candidate);
          if (!inside(modules, packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
            throw new Error(`Validator package is outside its owner or is not a directory: ${name}`);
          }
          const file = fs.realpathSync.native(path.join(packageRoot, 'package.json'));
          if (!inside(modules, file) || !inside(packageRoot, file)) throw new Error(`Validator metadata is outside its package: ${name}`);
          return { directory: packageRoot, file };
        }
      }
      if (directory === owner) throw new Error(`Missing validator package metadata: ${name}`);
    }
    throw new Error('Validator metadata ancestor traversal exceeds limit.');
  };
  let resolutions = 0;
  while (pending.length) {
    if (++resolutions > 256) throw new Error('Validator dependency traversal exceeds limit.');
    const { name, from } = pending.shift()!;
    const { directory, file: metadataFile } = locateMetadata(name, from);
    const metadata = readObject(metadataFile);
    if (metadata.name !== name || typeof metadata.version !== 'string') throw new Error(`Invalid validator package identity: ${name}`);
    const lockPath = path.relative(owner, directory).replace(/\\/g, '/');
    const locked = lockedPackages[lockPath];
    if (!jsonObject(locked) || locked.version !== metadata.version || locked.link === true) {
      throw new Error(`Installed validator dependency does not match its lock: ${name}`);
    }
    if (visited.has(metadataFile)) continue;
    visited.add(metadataFile);
    if (visited.size > 64) throw new Error('Validator dependency package count exceeds limit.');
    if (metadata.dependencies !== undefined && !jsonObject(metadata.dependencies)) throw new Error(`Invalid dependency metadata: ${name}`);
    for (const [dependency, range] of Object.entries(metadata.dependencies || {})) {
      if (typeof range !== 'string' || !/^(@[a-z\d._-]+\/)?[a-z\d._-]+$/i.test(dependency)) throw new Error(`Invalid dependency declaration: ${name}`);
      pending.push({ name: dependency, from: metadataFile });
    }
  }
  const files = [entryPath];
  if (source) {
    const visit = (dir: string) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) visit(full);
        else if (item.isFile() && /\.(ts|json)$/.test(item.name)) files.push(full);
      }
    };
    visit(path.join(owner, 'src'));
  } else {
    const worker = compiledWorker ?? readCanonicalMdCompiledWorkerIdentity(entryPath);
    if (path.relative(path.join(path.dirname(entryPath), 'canonical-md-worker.cjs'), worker.path)
      || createHash('sha256').update(worker.source, 'utf8').digest('hex') !== worker.sha256) {
      throw new Error('Compiled canonical MD worker identity does not match its captured source.');
    }
    hashes.set(worker.path, worker.sha256);
  }
  for (const file of files) hashes.set(file, createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  return trustHash([...hashes].sort(([a], [b]) => a.localeCompare(b)));
}

/** Byte signatures supplement the effective parsed indices, including same-size edits. */
export function deploymentCorpusFiles(files: string[]): Array<[string, string]> {
  return [...new Set(files.map(file => path.resolve(file)))].sort().map(file => {
    try { return [file, hashArtifactFile(file)]; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [file, 'absent'];
      throw error;
    }
  });
}

export function deployReceiptIdentity(
  principal: Pick<AcceptancePrincipal, 'kind' | 'id'>,
  caller?: { workspaceId: string; operationId: string },
): ActionReceiptOperationIdentity {
  const requestScope = 'deployment.verified';
  return {
    actor: { kind: principal.kind, id: principal.id },
    client: { channel: principal.kind === 'agent' ? 'api' : 'studio', id: principal.id, version: 'deployment-trust-v1' },
    capability: { legacyRoute: '/api/agent/deploy-verify', method: 'POST', reviewed: true, reviewRef: 'validation-trust-repair-batch2' },
    authority: caller
      ? { scope: 'workspace', workspaceId: caller.workspaceId, operationId: `deploy:${trustHash(caller.operationId)}`, requestScope }
      : { scope: 'global', operationId: `deploy:${randomUUID()}`, requestScope },
  };
}

export function readDeployOperationReceipt(store: ActionReceiptStore, identity: ActionReceiptOperationIdentity): ActionReceipt | null {
  const id = actionReceiptIdForOperation(identity);
  const result = store.tryRead(id);
  if (result.ok === true) {
    if (result.receipt.id !== id) {
      throw Object.assign(new Error('Deployment receipt identity mismatch.'), { code: 'RECEIPT_CORRUPT' });
    }
    return result.receipt;
  }
  if (result.code === 'RECEIPT_NOT_FOUND') return null;
  throw Object.assign(new Error('Deployment receipt could not be verified.'), { code: result.code });
}

const prewriteStage = (record: DeploymentRecoveryRecord) => `deploy-prewrite-v1:${trustHash(record)}`;

type ObserveDeployTarget = (folder: string, bindingHash: string, recovery?: DeploymentRecoveryRecord) =>
  { targetState: 'unavailable' | 'binding-mismatch' } | { fingerprint: string };

function compareTargetFingerprints(before: string, staged: string, current: string) {
  const matchesBefore = current === before;
  const matchesStaged = current === staged;
  return matchesBefore
    ? (matchesStaged ? 'matches-both' : 'matches-before')
    : (matchesStaged ? 'matches-staged' : 'matches-neither');
}

export function committedDeployTargetEvidence(receipt: ActionReceipt) {
  const bindingHash = receipt.metadata?.targetHash;
  if (receipt.status !== 'committed' || receipt.metadata?.operation !== 'deploy'
    || typeof bindingHash !== 'string' || !digest.test(bindingHash)
    || receipt.validation.status !== 'passed' || receipt.validation.code !== 'DEPLOYED_BYTES_VERIFIED'
    || receipt.after?.outcome !== 'applied') return undefined;

  const targets = receipt.authority.resources.filter(resource => resource.role === 'deploy');
  const outputs = receipt.after.resources.filter(resource => resource.role === 'deploy');
  const target = targets[0];
  const output = outputs[0];
  if (targets.length !== 1 || outputs.length !== 1 || target.root !== 'extensions' || output.root !== target.root
    || output.relativePath !== target.relativePath || !digest.test(output.hash)) return undefined;

  const folder = target.relativePath;
  // eslint-disable-next-line no-control-regex -- Reject NUL in committed deploy receipt folder names.
  if (!folder || folder === '.' || folder === '..' || /[\\/:\x00]/.test(folder)) return undefined;
  return { folder, bindingHash, fingerprint: output.hash };
}

function observeCommittedDeployTarget(receipt: ActionReceipt, observeTarget: ObserveDeployTarget) {
  const evidence = committedDeployTargetEvidence(receipt);
  if (!evidence) return undefined;
  const observation = observeTarget(evidence.folder, evidence.bindingHash);
  if (!('fingerprint' in observation)) return observation;
  if (observation.fingerprint === 'absent') return { targetState: 'absent' as const };
  return { targetState: observation.fingerprint === evidence.fingerprint ? 'matches-committed' as const : 'differs-from-committed' as const };
}

export function deployOperationStatus(receipt: ActionReceipt, recovery: DestructiveRecoveryStore, observeTarget?: ObserveDeployTarget) {
  if (receipt.status !== 'prepared') {
    const targetObservation = receipt.status === 'committed' && observeTarget ? observeCommittedDeployTarget(receipt, observeTarget) : undefined;
    return { outcome: receipt.status, ...(targetObservation ? { targetObservation } : {}) };
  }
  const unknown = { outcome: 'unknown' as const };
  const recoveryId = receipt.rollback.reference;
  if (!recoveryId || !String(receipt.metadata?.stage).startsWith('deploy-prewrite-v1:')) return unknown;
  const initial = recovery.read(recoveryId);
  if (!initial.ok || initial.record.kind !== 'deploy' || initial.record.id !== recoveryId
    || initial.record.writeAdmission?.host !== os.hostname()
    || processLiveness(initial.record.writeAdmission.pid) !== 'dead') return unknown;
  // The owner may have advanced recovery between our first read and its exit.
  const retired = recovery.read(recoveryId);
  if (!retired.ok || retired.record.kind !== 'deploy' || retired.record.id !== recoveryId) return unknown;
  const { writeAdmission, stagedEvidence, postcheckEvidence, ...observed } = retired.record;
  const passed = observed.status === 'ready' ? postcheckEvidence : undefined;
  if (!passed && observed.status !== 'preparing') return unknown;
  const preState = passed ? { ...observed, status: 'preparing' as const, expectedCurrentHash: 'pending' } : observed;
  if (!writeAdmission || writeAdmission.pid !== initial.record.writeAdmission.pid || writeAdmission.host !== initial.record.writeAdmission.host
    || prewriteStage({ ...preState, writeAdmission: { ...writeAdmission, phase: 'pending-v1' } }) !== receipt.metadata?.stage) return unknown;
  if (writeAdmission.phase === 'pending-v1') return { outcome: 'not-applied' as const };
  const targetBindingHash = receipt.metadata?.targetHash;
  if (stagedEvidence?.preparedReceiptHash !== receipt.hash || typeof targetBindingHash !== 'string') return unknown;
  const observation = observeTarget?.(retired.record.modId, targetBindingHash, retired.record);
  const targetObservation = observation && ('fingerprint' in observation
    ? { targetState: compareTargetFingerprints(preState.beforeFingerprint, stagedEvidence.fingerprint, observation.fingerprint) }
    : observation);
  return { ...unknown, reconciliation: { targetBindingHash, beforeTargetFingerprint: preState.beforeFingerprint,
    stagedTargetFingerprint: stagedEvidence.fingerprint },
    ...(targetObservation ? { targetObservation } : {}),
    ...(passed ? { postchecks: { status: 'passed' as const, checkedAt: passed.checkedAt } } : {}) };
}

export function readDeployOperationStatus(
  store: ActionReceiptStore, recovery: DestructiveRecoveryStore, identity: ActionReceiptOperationIdentity, observeTarget?: ObserveDeployTarget,
) {
  const receipt = readDeployOperationReceipt(store, identity);
  if (!receipt) return null;
  const status = deployOperationStatus(receipt, recovery, observeTarget);
  if (receipt.status !== 'prepared') return { ...status, receipt };
  // Prefer a terminal receipt published before the owner retired.
  const current = readDeployOperationReceipt(store, identity);
  if (!current) return null;
  return { ...(current.hash === receipt.hash ? status : deployOperationStatus(current, recovery, observeTarget)), receipt: current };
}

export function compareDeployPreviewTarget(
  prior: ReturnType<typeof deployOperationStatus> | undefined, targetBindingHash: string, fingerprint: string,
) {
  const historicalOutcome = prior?.outcome ?? 'unknown';
  const historical = {
    historicalOutcome,
    ...(prior && 'postchecks' in prior && prior.postchecks ? { historicalPostchecks: prior.postchecks } : {}),
  };
  if (!prior || !('reconciliation' in prior) || !prior.reconciliation) {
    return { ...historical, targetState: 'unavailable' };
  }
  const evidence = prior.reconciliation;
  if (evidence.targetBindingHash !== targetBindingHash) return { ...historical, targetState: 'binding-mismatch' };
  const targetState = compareTargetFingerprints(evidence.beforeTargetFingerprint, evidence.stagedTargetFingerprint, fingerprint);
  return { ...historical, targetState };
}

export function prepareDeployRecord(
  store: ActionReceiptStore, subject: AcceptanceSubject, decision: AcceptanceDecision,
  principal: AcceptancePrincipal, approvals: ActionReceipt[], recoveryId: string,
  artifactFolder: string, beforeFingerprint: string,
  validatedArtifactHash?: string,
  identity = deployReceiptIdentity(principal),
  projectCheckSuite?: { id: string; hash: string },
  prewriteRecovery?: DeploymentRecoveryRecord,
  build?: DeploymentBuild,
  effectReference?: string,
): ActionReceipt {
  const maxApprovals = projectCheckSuite ? 126 : 127;
  if (approvals.length > maxApprovals) throw new Error(`At most ${maxApprovals} finding approvals fit a deployment record.`);
  const target = { role: 'deploy' as const, root: 'extensions', relativePath: artifactFolder,
    beforeHash: trustHash(beforeFingerprint) };
  const resources = [target, ...approvals.map(receipt => ({ role: 'data' as const,
    root: 'action-receipts', relativePath: `${receipt.id}.json`, beforeHash: receipt.hash }))];
  const requestFacts: unknown[] = [decision.binding.hash, approvals.map(receipt => receipt.hash)];
  if (projectCheckSuite) {
    const mismatch = () => Object.assign(new Error('The passing project check suite receipt does not match this deployment.'), {
      code: 'PROJECT_CHECK_SUITE_MISMATCH',
    });
    if (!/^ar_[a-f0-9]{64}$/.test(projectCheckSuite.id) || !/^[a-f0-9]{64}$/.test(projectCheckSuite.hash)) {
      throw mismatch();
    }
    const suite = store.read(projectCheckSuite.id);
    if (suite.hash !== projectCheckSuite.hash || suite.status !== 'committed'
      || !('id' in suite.capability) || suite.capability.id !== 'project-check.suite' || suite.capability.version !== '1'
      || suite.validation.status !== 'passed' || suite.validation.code !== 'PROJECT_CHECK_SUITE_PASSED'
      || suite.after?.outcome !== 'applied' || suite.metadata?.modId !== artifactFolder
      || !validatedArtifactHash || suite.metadata?.artifactHash !== validatedArtifactHash) {
      throw mismatch();
    }
    resources.push({ role: 'data', root: 'project-check-suite-receipts', relativePath: `${suite.id}.json`, beforeHash: suite.hash });
    requestFacts.push({ id: suite.id, hash: suite.hash });
  }
  const { receipt, created } = store.prepareWithDisposition({
    ...identity,
    authority: { ...identity.authority, resources },
    effects: { declared: [{ id: 'deploy', operation: 'replace', resource: target, reversible: true }] },
    input: { requestHash: trustHash(requestFacts), beforeHash: target.beforeHash },
    validation: { validator: 'deployment-trust-v1', ruleHash: subject.validatorHash },
    rollback: { required: true, mode: 'recovery', reference: recoveryId },
    metadata: { operation: 'deploy', ...Object.fromEntries(Object.entries(decision.binding).filter(([k]) => k !== 'hash')),
      actorLabel: principal.label, outcome: decision.outcome, recoveryId,
      ...decision.counts,
      ...(effectReference !== undefined ? { traceId: effectReference } : {}),
      ...(prewriteRecovery ? { stage: prewriteStage(prewriteRecovery) } : {}),
      ...(build ? { summary: deploymentBuildSummary(build) } : {}),
      ...(validatedArtifactHash ? { validatedArtifactHash, validatedArtifactScope: 'logical-artifact-bytes' } : {}) },
  });
  if (!created) throw Object.assign(new Error('This deployment operation already has a receipt.'), {
    code: 'DEPLOY_OPERATION_ALREADY_RECORDED',
  });
  return receipt;
}

function deploymentAfterResources(prepared: ActionReceipt, fingerprint: string) {
  return prepared.authority.resources.map(resource => ({
    role: resource.role, root: resource.root, relativePath: resource.relativePath,
    hash: resource.role === 'deploy' ? fingerprint : resource.beforeHash!,
  }));
}

export function recordIncompleteDeployOutput(store: ActionReceiptStore, prepared: ActionReceipt, fingerprint: string): ActionReceipt {
  const code = 'DEPLOY_OUTPUT_CHANGED';
  return store.transition(prepared.id, {
    to: 'incomplete', at: new Date().toISOString(),
    validation: { ...prepared.validation, status: 'failed', code },
    failure: { code, message: 'Forge withheld rollback because the target did not match its staged output.' }, rollbackStatus: 'failed',
    after: { outcome: 'partial', resources: deploymentAfterResources(prepared, fingerprint) },
  });
}

export function recordRolledBackDeploy(store: ActionReceiptStore, prepared: ActionReceipt): ActionReceipt | undefined {
  const code = 'DEPLOY_ROLLED_BACK';
  let expectedHash: string | undefined;
  try {
    const current = store.tryRead(prepared.id);
    if (!current.ok || current.receipt.hash !== prepared.hash) return undefined;
    const rollback = {
      at: new Date(Math.max(Date.now(), Date.parse(prepared.times.preparedAt))).toISOString(),
      validation: { ...prepared.validation, status: 'failed' as const, code },
      failure: { code },
      rollbackStatus: 'performed' as const,
    };
    expectedHash = transitionActionReceipt(prepared, { ...rollback, to: 'rolled_back' }).hash;
    const written = store.rollBack(prepared.id, rollback);
    if (written.hash === expectedHash) return written;
  } catch { /* A failed readback may follow a successful promotion. */ }
  if (!expectedHash) return undefined;
  const durable = store.tryRead(prepared.id);
  return durable.ok && durable.receipt.hash === expectedHash ? durable.receipt : undefined;
}

export function commitDeployRecord(
  store: ActionReceiptStore, prepared: ActionReceipt, fingerprint: string, managedReference?: string,
): ActionReceipt {
  const commit = {
    at: new Date().toISOString(),
    validation: { ...prepared.validation, status: 'passed' as const, code: 'DEPLOYED_BYTES_VERIFIED',
      summary: String(prepared.metadata?.outcome) },
    rollbackStatus: 'available' as const,
    after: { outcome: 'applied' as const, resources: deploymentAfterResources(prepared, fingerprint),
      ...(managedReference ? { code: managedReference } : {}) },
  };
  const expected = transitionActionReceipt(prepared, { ...commit, to: 'committed' });
  try {
    const written = store.commit(prepared.id, commit);
    if (written.hash !== expected.hash) throw new Error('Deployment receipt readback mismatch.');
    return written;
  } catch (error) {
    // The store can throw while reopening an already promoted commit. Only the exact
    // original prepared record gives the caller authority to attempt rollback.
    const durable = store.tryRead(prepared.id);
    if (durable.ok && durable.receipt.hash === expected.hash) return durable.receipt;
    if (durable.ok && durable.receipt.hash === prepared.hash) throw error;
    throw Object.assign(new Error('Forge could not verify the deployment commit outcome.', { cause: error }), {
      code: 'DEPLOY_COMMIT_OUTCOME_UNKNOWN',
    });
  }
}
