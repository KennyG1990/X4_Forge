/** Deployment identity and durable audit records; authentication remains in the route middleware. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ActionReceipt } from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import type { AcceptanceDecision, AcceptancePrincipal, AcceptanceSubject } from './findingAcceptance';

export function trustHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_key, item) => {
    if (item instanceof Set) return [...item].sort();
    if (item instanceof Map) return [...item].sort(([a], [b]) => String(a).localeCompare(String(b)));
    return item;
  })).digest('hex');
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
export function deploymentImplementationHash(entry: string): string {
  try {
    return implementationHash(entry);
  } catch (cause) {
    throw Object.assign(new Error(`Validator fingerprint unavailable: ${cause instanceof Error ? cause.message : String(cause)}`),
      { code: 'VALIDATOR_FINGERPRINT_UNAVAILABLE', cause });
  }
}

function implementationHash(entry: string): string {
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
  }
  for (const file of files) hashes.set(file, createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  return trustHash([...hashes].sort(([a], [b]) => a.localeCompare(b)));
}

/** Byte signatures supplement the effective parsed indices, including same-size edits. */
export function deploymentCorpusFiles(files: string[]): Array<[string, string]> {
  return [...new Set(files.map(file => path.resolve(file)))].sort().map(file => {
    try { return [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [file, 'absent'];
      throw error;
    }
  });
}

export function prepareDeployRecord(
  store: ActionReceiptStore, subject: AcceptanceSubject, decision: AcceptanceDecision,
  principal: AcceptancePrincipal, approvals: ActionReceipt[], recoveryId: string,
  beforeFingerprint: string,
  validatedArtifactHash?: string,
): ActionReceipt {
  if (approvals.length > 127) throw new Error('At most 127 finding approvals fit a deployment record.');
  const target = { role: 'deploy' as const, root: 'extensions', relativePath: subject.evidence.modId!,
    beforeHash: trustHash(beforeFingerprint) };
  const resources = [target, ...approvals.map(receipt => ({ role: 'data' as const,
    root: 'action-receipts', relativePath: `${receipt.id}.json`, beforeHash: receipt.hash }))];
  return store.prepare({
    actor: { kind: principal.kind, id: principal.id },
    client: { channel: principal.kind === 'agent' ? 'api' : 'studio', id: principal.id, version: 'deployment-trust-v1' },
    capability: { legacyRoute: '/api/agent/deploy-verify', method: 'POST', reviewed: true, reviewRef: 'validation-trust-repair-batch2' },
    authority: { scope: 'global', operationId: `deploy:${randomUUID()}`, requestScope: 'deployment.verified', resources },
    effects: { declared: [{ id: 'deploy', operation: 'replace', resource: target, reversible: true }] },
    input: { requestHash: trustHash([decision.binding.hash, approvals.map(r => r.hash)]), beforeHash: target.beforeHash },
    validation: { validator: 'deployment-trust-v1', ruleHash: subject.validatorHash },
    rollback: { required: true, mode: 'recovery', reference: recoveryId },
    metadata: { operation: 'deploy', ...Object.fromEntries(Object.entries(decision.binding).filter(([k]) => k !== 'hash')),
      actorLabel: principal.label, outcome: decision.outcome, recoveryId,
      ...decision.counts,
      ...(validatedArtifactHash ? { validatedArtifactHash, validatedArtifactScope: 'logical-artifact-bytes' } : {}) },
  });
}

export function commitDeployRecord(store: ActionReceiptStore, prepared: ActionReceipt, fingerprint: string): ActionReceipt {
  const result = store.commit(prepared.id, {
    validation: { ...prepared.validation, status: 'passed', code: 'DEPLOYED_BYTES_VERIFIED',
      summary: String(prepared.metadata?.outcome) },
    rollbackStatus: 'available',
    after: { outcome: 'applied', resources: prepared.authority.resources.map(resource => ({
      role: resource.role, root: resource.root, relativePath: resource.relativePath,
      hash: resource.role === 'deploy' ? fingerprint : resource.beforeHash!,
    })) },
  });
  const durable = store.read(result.id);
  if (durable.hash !== result.hash || durable.status !== 'committed') throw new Error('Deployment receipt readback mismatch.');
  return durable;
}
