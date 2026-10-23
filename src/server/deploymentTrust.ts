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

/** Hash actual implementation bytes, once at process startup (the code loaded by this process). */
export function deploymentImplementationHash(entry: string): string {
  const files = [path.resolve(entry)];
  if (/\.ts$/.test(entry)) {
    const visit = (dir: string) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) visit(full);
        else if (item.isFile() && /\.(ts|json)$/.test(item.name)) files.push(full);
      }
    };
    visit(path.join(path.dirname(path.resolve(entry)), 'src'));
    files.push(path.join(path.dirname(path.resolve(entry)), 'package-lock.json'));
  }
  return trustHash(files.sort().map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
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
      actorLabel: principal.label, outcome: decision.outcome, recoveryId },
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
