/** #96 shared settings owner. Transports must separately authenticate actors and
 * enforce exact capability/effect authority; a field/root grant is only narrowing. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  CONFIGURATION_GRANT_FIELDS, evaluateConfigurationGrantRestrictions, inspectConfigurationDirectory,
  isConfigurationGrantInstance, type ConfigurationGrant, type ConfigurationGrantField,
  type ConfigurationGrantInstance,
} from '../lib/configurationGrant';
import { canonicalJson, type ActionReceipt } from '../lib/actionReceipt';
import type { ActionReceiptStore } from '../lib/actionReceiptStore';
import type { AgentKeyStore } from '../lib/agentKeys';
import { atomicWriteJson } from '../lib/workspaceState';
import { normalizeDeployFormat } from '../lib/deployFormat';
import { configPath, resolveXsdConfig, writeXsdConfig,
  type XsdConfig, type ResolvedXsdConfig } from '../lib/xsdParser';
import { canonicalSourceKey } from './resourceCoordinator';
import { forgeSourceCoordinator } from './sharedSourceCoordinator';
import { planDirectoryConfigurationChange, type DirectoryConfigurationPlan } from './directoryConfiguration';

export const CONFIGURATION_OPERATION_LIMIT = 64;
export const CONFIGURATION_JOURNAL_MAX_BYTES = 1024 * 1024;
const LIFETIME = 15 * 60_000;
type Values = Partial<Record<ConfigurationGrantField, string>>;
export interface ConfigurationActor { kind: 'studio' | 'agent'; id: string; channel?: 'api' | 'mcp' }
type KeyRow = ReturnType<AgentKeyStore['list']>[number];
interface Proposal {
  kind: 'change'; id: string; actorId: string; operationId: string; requestHash: string;
  instance: ConfigurationGrantInstance; expiresAt: number; revision: string; patch: Values;
  previous: Values; planHash: string; state: 'preview' | 'applying' | 'saved' | 'failed' | 'incomplete';
  receiptId?: string; afterRevision?: string; followup?: 'complete' | 'failed';
  writeState?: 'not-written' | 'saved' | 'unconfirmed';
}
interface AccessRequest {
  kind: 'access'; id: string; actorId: string; operationId: string; requestHash: string;
  instance: ConfigurationGrantInstance; expiresAt: number; authorityRevision: string;
  request: { fields: ConfigurationGrantField[]; roots: Partial<Record<ConfigurationGrantField, string[]>>;
    durationMs: number; restartPolicy?: 'same-profile' };
  state: 'pending' | 'approved' | 'denied'; receiptId?: string; grantHash?: string;
}
type Entry = Proposal | AccessRequest;
type Plan = Extract<DirectoryConfigurationPlan, { ok: true }>;
interface Journal { version: 1; entries: Entry[] }
export interface ConfigurationOperationOptions {
  journalFile: string;
  instance: ConfigurationGrantInstance;
  keys: AgentKeyStore;
  receipts: Pick<ActionReceiptStore, 'prepareWithDisposition' | 'read' | 'transition'>;
  /** Must inspect CURRENT key authority, including exact capability/effect restrictions. */
  authorize(key: KeyRow, operation: 'read' | 'preview' | 'apply' | 'status' | 'request' | 'request-status'): boolean;
  ownerRootsLocked(): boolean;
  followup(plan: Plan): unknown;
  validateScratch?(): void;
  now?: () => number;
  // Dependency seams exercise the actual atomic writer and receipt store in tests.
  file?: string;
  writeConfig?: typeof writeXsdConfig;
  coordinate?: typeof forgeSourceCoordinator.run;
}
export class ConfigurationOperationError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}
const fail = (code: string, status = 409): never => { throw new ConfigurationOperationError(code, status); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const byteHash = (value: string | null) => hash(value === null ? ['absent'] : ['present', value]);
const exact = (body: Record<string, unknown>, allowed: string[], required = allowed) => {
  if (Object.keys(body).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(body, key))) fail('CONFIGURATION_INPUT_INVALID', 400);
};
const op = (value: unknown): string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/.test(value)
  ? value : fail('CONFIGURATION_OPERATION_ID_INVALID', 400);
const sameInstance = (a: unknown, b: ConfigurationGrantInstance) => isConfigurationGrantInstance(a) && canonicalJson(a) === canonicalJson(b);

/** Stable across file replacement/backend restart; changing either physical storage
 * directory changes the profile. Caller provisions its own storage directories. */
export function configurationProfileIdentity(configDirectory: string, dataDirectory: string): string {
  return 'profile_' + hash([inspectConfigurationDirectory(path.resolve(configDirectory), true),
    inspectConfigurationDirectory(path.resolve(dataDirectory), true)]);
}

function strictFile(file: string, limit = CONFIGURATION_JOURNAL_MAX_BYTES): string | null {
  inspectConfigurationDirectory(path.dirname(file), true);
  const info = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > limit
    || path.relative(file, fs.realpathSync.native(file))) return fail('CONFIGURATION_STORAGE_UNSAFE');
  const raw = fs.readFileSync(file, 'utf8');
  const after = fs.lstatSync(file);
  inspectConfigurationDirectory(path.dirname(file), true);
  if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
    || info.dev !== after.dev || info.ino !== after.ino || info.size !== after.size || info.mtimeMs !== after.mtimeMs
    || Buffer.byteLength(raw) > limit) return fail('CONFIGURATION_STORAGE_CHANGED');
  return raw;
}
function patch(value: unknown): Values {
  if (!object(value) || !Object.keys(value).length || Object.keys(value).length > 6) return fail('CONFIGURATION_PATCH_INVALID', 400);
  const result: Values = {};
  for (const [field, item] of Object.entries(value)) {
    if (!(CONFIGURATION_GRANT_FIELDS as readonly string[]).includes(field) || typeof item !== 'string'
      || item.length > 4096 || [...item].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return fail('CONFIGURATION_PATCH_INVALID', 400);
    if (field === 'deployFormat' && (item !== 'loose' && item !== 'catalog')) return fail('UNKNOWN_DEPLOY_FORMAT', 400);
    if (field !== 'deployFormat' && item.trim() && !path.isAbsolute(item.trim())) return fail('CONFIGURATION_PATH_NOT_ABSOLUTE', 400);
    result[field as ConfigurationGrantField] = item.trim();
  }
  return result;
}
function values(config: XsdConfig, resolved?: ResolvedXsdConfig): Values {
  const source = resolved || config;
  return Object.fromEntries(CONFIGURATION_GRANT_FIELDS.map(field => [field, field === 'schemaDir'
    ? resolved?.schemaDir || config.xsdSchemaPath || '' : field === 'deployFormat'
      ? resolved ? normalizeDeployFormat((config as XsdConfig & { deployFormat?: unknown }).deployFormat) || 'loose'
        : (config as XsdConfig & { deployFormat?: string }).deployFormat || ''
      : source[field] || ''])) as Values;
}

export function createConfigurationOperations(options: ConfigurationOperationOptions) {
  const now = options.now || Date.now;
  const file = options.file || configPath();
  const journalFile = path.resolve(options.journalFile);
  const instance = structuredClone(options.instance);
  if (!isConfigurationGrantInstance(instance)) fail('CONFIGURATION_INSTANCE_INVALID');
  const configLease = inspectConfigurationDirectory(path.dirname(file), true)!;
  const journalLease = inspectConfigurationDirectory(path.dirname(journalFile), true)!;
  const checkStorage = () => {
    if (hash(inspectConfigurationDirectory(path.dirname(file), true)) !== hash(configLease)
      || hash(inspectConfigurationDirectory(path.dirname(journalFile), true)) !== hash(journalLease)) fail('CONFIGURATION_PROFILE_CHANGED');
  };
  const coordinate = options.coordinate || forgeSourceCoordinator.run;
  const exclusive = <T>(actor: ConfigurationActor, operation: string, run: () => T | Promise<T>) =>
    coordinate([canonicalSourceKey(file), canonicalSourceKey(journalFile)], { actor: actor.id, operation }, async () => {
      checkStorage(); return run();
    });
  const snapshot = () => {
    checkStorage();
    const raw = strictFile(file);
    let config: XsdConfig & { deployFormat?: unknown } = {};
    if (raw !== null) {
      try { const parsed: unknown = JSON.parse(raw); if (!object(parsed)) fail('CONFIGURATION_FILE_INVALID'); config = parsed; }
      catch { return fail('CONFIGURATION_FILE_INVALID'); }
    }
    const resolved = resolveXsdConfig(config);
    const effective = values(config, resolved);
    const revision = hash({ bytes: byteHash(raw), effective, ownerLocked: options.ownerRootsLocked(), scratch: !!resolved.isolatedScratch });
    return { raw, config, resolved, effective, revision };
  };
  const load = (): { journal: Journal; raw: string | null } => {
    const raw = strictFile(journalFile);
    if (raw === null) return { journal: { version: 1, entries: [] }, raw };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return fail('CONFIGURATION_JOURNAL_INVALID'); }
    if (!object(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)
      || parsed.entries.length > CONFIGURATION_OPERATION_LIMIT) return fail('CONFIGURATION_JOURNAL_INVALID');
    // Every retained row is revalidated before it can carry authority or write input.
    const identifiers = new Set<string>();
    for (const row of parsed.entries) {
      if (!object(row) || !['access', 'change'].includes(String(row.kind)) || typeof row.actorId !== 'string'
        || typeof row.id !== 'string' || !/^cfg_[a-f0-9]{64}$/.test(row.id) || !isConfigurationGrantInstance(row.instance)
        || row.actorId.length > 128 || typeof row.expiresAt !== 'number' || !Number.isSafeInteger(row.expiresAt) || row.expiresAt < 0
        || typeof row.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.requestHash)) return fail('CONFIGURATION_JOURNAL_INVALID');
      op(row.operationId);
      if (identifiers.has(row.id)) fail('CONFIGURATION_JOURNAL_INVALID');
      identifiers.add(row.id);
      if (row.receiptId !== undefined && (typeof row.receiptId !== 'string' || !/^ar_[a-f0-9]{64}$/.test(row.receiptId))) fail('CONFIGURATION_JOURNAL_INVALID');
      if (row.kind === 'change') {
        patch(row.patch); patch(row.previous);
        if (typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision)
          || typeof row.planHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.planHash)
          || (row.writeState !== undefined && !['not-written', 'saved', 'unconfirmed'].includes(String(row.writeState)))
          || !['preview', 'applying', 'saved', 'failed', 'incomplete'].includes(String(row.state))) return fail('CONFIGURATION_JOURNAL_INVALID');
      } else {
        if (!object(row.request) || !['pending', 'approved', 'denied'].includes(String(row.state))
          || typeof row.authorityRevision !== 'string' || !/^[a-f0-9]{64}$/.test(row.authorityRevision)
          || (row.grantHash !== undefined && (typeof row.grantHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.grantHash)))) return fail('CONFIGURATION_JOURNAL_INVALID');
        accessInput({ instance: row.instance, operationId: row.operationId, ...row.request }, row.instance as ConfigurationGrantInstance);
      }
    }
    return { journal: parsed as unknown as Journal, raw };
  };
  const save = (state: ReturnType<typeof load>) => {
    const encoded = JSON.stringify(state.journal);
    if (Buffer.byteLength(encoded) > CONFIGURATION_JOURNAL_MAX_BYTES
      || state.journal.entries.length > CONFIGURATION_OPERATION_LIMIT) fail('CONFIGURATION_JOURNAL_FULL', 429);
    atomicWriteJson(journalFile, state.journal, { mode: 0o600, beforeRename: () => {
      checkStorage(); if (strictFile(journalFile) !== state.raw) fail('CONFIGURATION_JOURNAL_CHANGED');
    } });
    state.raw = strictFile(journalFile);
  };
  const add = (state: ReturnType<typeof load>, entry: Entry) => {
    // Only expired terminal/unused previews are retired. An uncertain mutation is never evicted.
    state.journal.entries = state.journal.entries.filter(row => row.expiresAt > now()
      || (row.kind === 'change' && ['applying', 'incomplete'].includes(row.state)));
    if (state.journal.entries.length >= CONFIGURATION_OPERATION_LIMIT) fail('CONFIGURATION_JOURNAL_FULL', 429);
    state.journal.entries.push(entry); save(state);
  };
  const key = (actor: ConfigurationActor, operation: Parameters<ConfigurationOperationOptions['authorize']>[1]) => {
    if (actor.kind !== 'agent') return undefined;
    const row = options.keys.list().find(row => row.id === actor.id);
    if (!row || row.revokedAt !== null || (row.expiresAt !== null && row.expiresAt <= now()) || !options.authorize(row, operation)) fail('CONFIGURATION_AUTHORITY_DENIED', 403);
    return row!;
  };
  const approved = (row: KeyRow, journal: Journal): ConfigurationGrant => {
    const grant = row.configurationGrant;
    if (!grant) return fail('CONFIGURATION_GRANT_REQUIRED', 403);
    const proof = journal.entries.find(entry => entry.kind === 'access' && entry.actorId === row.id
      && entry.state === 'approved' && entry.grantHash === hash(grant) && entry.receiptId) as AccessRequest | undefined;
    if (!proof?.receiptId) return fail('CONFIGURATION_GRANT_REQUIRED', 403);
    const receipt = options.receipts.read(proof.receiptId);
    if (receipt.status !== 'committed' || receipt.actor.kind !== 'human'
      || !('id' in receipt.capability) || receipt.capability.id !== 'configuration.access.approve'
      || receipt.authority.scope !== 'profile' || receipt.authority.profileId !== instance.profileId.slice(-64)
      || receipt.authority.operationId !== proof.operationId || receipt.input.requestHash !== proof.requestHash
      || receipt.after?.resources[0]?.hash !== options.keys.configurationAuthorityRevision(row.id)) return fail('CONFIGURATION_GRANT_REQUIRED', 403);
    return grant;
  };
  const checkGrant = (actor: ConfigurationActor, operation: 'preview' | 'apply', effective: Values, fields: string[], journal: Journal) => {
    const row = key(actor, operation);
    if (!row) return;
    const decision = evaluateConfigurationGrantRestrictions(approved(row, journal), { instance, now: now(), fields, effectiveValues: effective });
    if (!decision.withinRestrictions) fail(decision.code, 403);
  };
  const plan = (change: Values, before: ReturnType<typeof snapshot>): Plan => {
    const result = planDirectoryConfigurationChange(change, options.ownerRootsLocked(), {
      readConfig: () => before.config, resolveConfig: resolveXsdConfig,
    });
    if (result.ok === false) return fail(result.body.code || 'CONFIGURATION_ROLE_INVALID', result.status);
    if (result.scratch) options.validateScratch?.();
    return result;
  };
  const prepare = (actor: ConfigurationActor, entry: Entry, beforeHash: string, approval = false) => {
    const resource = { role: 'config' as const, root: 'configuration', relativePath: approval ? 'agent-grant' : 'config.json', beforeHash };
    return options.receipts.prepareWithDisposition({
      actor: { kind: actor.kind === 'studio' ? 'human' : 'agent', id: actor.id },
      client: { channel: actor.kind === 'studio' ? 'studio' : actor.channel || 'api', id: actor.id, version: '1' },
      capability: { id: approval ? 'configuration.access.approve' : 'configuration.apply', version: '1' },
      authority: { scope: 'profile', profileId: instance.profileId.slice(-64), operationId: entry.operationId,
        requestScope: approval ? 'configuration.access.approve' : 'configuration.apply', resources: [resource] },
      effects: { declared: [{ id: approval ? 'credential' : 'filesystem-write', operation: approval ? 'approve' : 'replace', resource, reversible: true }] },
      input: { requestHash: entry.requestHash, beforeHash }, validation: { validator: 'configuration.v1' },
      rollback: { required: true, mode: 'recovery', reference: `configuration:${entry.id}` },
    });
  };
  const commitReceipt = (receipt: ActionReceipt, afterHash: string, code: string) => options.receipts.transition(receipt.id, {
    to: 'committed', at: new Date(now()).toISOString(), validation: { status: 'passed', validator: 'configuration.v1', code },
    rollbackStatus: 'available', after: { outcome: afterHash === receipt.input.beforeHash ? 'no_change' : 'applied',
      resources: receipt.authority.resources.map(({ beforeHash: _before, ...resource }) => ({ ...resource, hash: afterHash })) },
  });
  const statusResult = (entry: Proposal) => {
    let receipt: ActionReceipt | undefined;
    try { if (entry.receiptId) receipt = options.receipts.read(entry.receiptId); } catch { /* explicit unconfirmed receipt below */ }
    return { success: entry.state === 'saved' && entry.followup === 'complete' && receipt?.status === 'committed',
    saved: entry.state === 'saved' || entry.writeState === 'saved' ? true
      : entry.writeState === 'not-written' || entry.state === 'preview' || entry.state === 'failed' ? false : null,
    code: entry.state === 'saved' ? entry.followup === 'complete' ? 'CONFIGURATION_SAVED' : 'CONFIGURATION_SAVED_FOLLOWUP_FAILED'
      : entry.state === 'incomplete' ? 'CONFIGURATION_OUTCOME_UNCONFIRMED' : `CONFIGURATION_${entry.state.toUpperCase()}`,
    operationId: entry.operationId, proposalId: entry.id, revision: entry.afterRevision, followup: entry.followup,
    receipt, receiptStatus: receipt?.status || 'unavailable' };
  };
  const accessInput = (body: Record<string, unknown>, expectedInstance = instance) => {
    exact(body, ['instance', 'operationId', 'fields', 'roots', 'durationMs', 'restartPolicy'],
      ['instance', 'operationId', 'fields', 'roots', 'durationMs']);
    if (!sameInstance(body.instance, expectedInstance)) fail('CONFIGURATION_INSTANCE_MISMATCH');
    if (!Array.isArray(body.fields) || !body.fields.length || body.fields.length > 6
      || !body.fields.every(field => typeof field === 'string' && (CONFIGURATION_GRANT_FIELDS as readonly string[]).includes(field))
      || new Set(body.fields).size !== body.fields.length || !object(body.roots)
      || !Number.isSafeInteger(body.durationMs) || Number(body.durationMs) < 60_000 || Number(body.durationMs) > 86_400_000
      || (Object.hasOwn(body, 'restartPolicy') && body.restartPolicy !== 'same-profile')) fail('CONFIGURATION_ACCESS_INPUT_INVALID', 400);
    const fields = [...body.fields as ConfigurationGrantField[]].sort();
    const roots = body.roots as Record<string, unknown>;
    exact(roots, fields.filter(field => field !== 'deployFormat'));
    for (const list of Object.values(roots)) {
      if (!Array.isArray(list) || !list.length || list.length > 8
        || list.some(item => typeof item !== 'string' || item.length > 4096 || !path.isAbsolute(item)
          || item !== item.trim() || [...item].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) fail('CONFIGURATION_ACCESS_INPUT_INVALID', 400);
    }
    if (Buffer.byteLength(JSON.stringify(body)) > 64 * 1024) fail('CONFIGURATION_ACCESS_INPUT_INVALID', 413);
    return { fields, roots: structuredClone(roots) as AccessRequest['request']['roots'], durationMs: Number(body.durationMs),
      ...(body.restartPolicy === 'same-profile' ? { restartPolicy: 'same-profile' as const } : {}) };
  };
  const accessResult = (entry: AccessRequest) => ({ success: true, requestId: entry.id,
    operationId: entry.operationId, state: entry.state, instance: structuredClone(instance),
    expiresAt: entry.expiresAt, requested: structuredClone(entry.request), receiptId: entry.receiptId });

  return {
    instance: () => structuredClone(instance),
    async requestAccess(actor: ConfigurationActor, input: unknown) {
      if (actor.kind !== 'agent') fail('CONFIGURATION_AGENT_REQUIRED', 400);
      if (!object(input)) fail('CONFIGURATION_INPUT_INVALID', 400);
      const body = input as Record<string, unknown>;
      const request = accessInput(body);
      const operationId = op(body.operationId);
      const requestHash = hash(body);
      return exclusive(actor, 'configuration.access.request', () => {
        key(actor, 'request');
        const state = load();
        const id = 'cfg_' + hash(['access', actor.id, operationId]);
        const prior = state.journal.entries.find(row => row.id === id);
        if (prior) {
          if (prior.kind !== 'access' || prior.requestHash !== requestHash) fail('CONFIGURATION_OPERATION_CONFLICT');
          return accessResult(prior as AccessRequest);
        }
        const entry: AccessRequest = { kind: 'access', id, actorId: actor.id, operationId, requestHash,
          instance, expiresAt: now() + LIFETIME, authorityRevision: options.keys.configurationAuthorityRevision(actor.id), request, state: 'pending' };
        add(state, entry);
        return accessResult(entry);
      });
    },
    async accessStatus(actor: ConfigurationActor, operationId: unknown) {
      const id = op(operationId);
      return exclusive(actor, 'configuration.access.status', () => {
        key(actor, 'request-status');
        const entry = load().journal.entries.find(row => row.kind === 'access' && row.actorId === actor.id && row.operationId === id);
        if (!entry || entry.kind !== 'access') return fail('CONFIGURATION_ACCESS_NOT_FOUND', 404);
        return accessResult(entry);
      });
    },
    async accessRequests(actor: ConfigurationActor) {
      if (actor.kind !== 'studio') fail('STUDIO_SESSION_REQUIRED', 403);
      return exclusive(actor, 'configuration.access.list', () => ({ success: true, instance: structuredClone(instance),
        requests: load().journal.entries.filter((row): row is AccessRequest => row.kind === 'access').map(row => ({ ...accessResult(row), keyId: row.actorId })) }));
    },
    async decideAccess(actor: ConfigurationActor, input: unknown) {
      if (actor.kind !== 'studio') fail('STUDIO_SESSION_REQUIRED', 403);
      if (!object(input)) fail('CONFIGURATION_INPUT_INVALID', 400);
      const body = input as Record<string, unknown>;
      exact(body, ['requestId', 'approve', 'instance']);
      if (typeof body.approve !== 'boolean' || !sameInstance(body.instance, instance)) fail('CONFIGURATION_ACCESS_INPUT_INVALID', 400);
      return exclusive(actor, 'configuration.access.approve', () => {
        const state = load();
        const entry = state.journal.entries.find(row => row.id === body.requestId);
        if (!entry || entry.kind !== 'access' || !sameInstance(entry.instance, instance)) return fail('CONFIGURATION_ACCESS_NOT_FOUND', 404);
        if (entry.state !== 'pending') return accessResult(entry);
        if (entry.expiresAt <= now()) fail('CONFIGURATION_ACCESS_EXPIRED');
        if (!body.approve) { entry.state = 'denied'; save(state); return accessResult(entry); }
        // Revalidate the journal's retained request, then let the existing grant
        // creator capture physical directory leases only after this owner decision.
        accessInput({ instance, operationId: entry.operationId, ...entry.request });
        const target: ConfigurationActor = { kind: 'agent', id: entry.actorId };
        const current = key(target, 'request')!;
        if (options.keys.configurationAuthorityRevision(current.id) !== entry.authorityRevision) fail('CONFIGURATION_KEY_CHANGED');
        const expiresAt = Math.min(now() + entry.request.durationMs, current.expiresAt ?? Number.MAX_SAFE_INTEGER);
        const prepared = prepare(actor, entry, entry.authorityRevision, true);
        if (!prepared.created) return fail('CONFIGURATION_RECEIPT_REQUIRES_RECONCILIATION');
        entry.receiptId = prepared.receipt.id; save(state);
        try {
          const grant = options.keys.approveConfigurationGrant(current.id, entry.authorityRevision,
            { instance, expiresAt, fields: entry.request.fields, roots: entry.request.roots,
              ...(entry.request.restartPolicy ? { restartPolicy: entry.request.restartPolicy } : {}) });
          entry.grantHash = hash(grant); entry.expiresAt = grant.expiresAt; save(state);
          const after = options.keys.configurationAuthorityRevision(current.id);
          commitReceipt(prepared.receipt, after, 'configuration.access_approved');
          entry.state = 'approved'; save(state);
          return accessResult(entry);
        } catch {
          // A stored restriction has no usable access until BOTH the matching
          // approval record and its exact committed receipt are observable.
          return { success: false, code: 'CONFIGURATION_APPROVAL_INCOMPLETE', requestId: entry.id, receiptId: entry.receiptId };
        }
      });
    },
    async read(actor: ConfigurationActor) {
      return exclusive(actor, 'configuration.read', () => {
        const row = key(actor, 'read');
        const state = load();
        const grant = row ? approved(row, state.journal) : undefined;
        const current = snapshot();
        const fields = grant?.fields || [...CONFIGURATION_GRANT_FIELDS];
        if (row) {
          const result = evaluateConfigurationGrantRestrictions(grant, { instance, now: now(), fields: [fields[0]],
            effectiveValues: { ...current.effective, [fields[0]]: fields[0] === 'deployFormat' ? current.effective.deployFormat : '' } });
          if (!result.withinRestrictions) fail(result.code, 403);
        }
        const saved = values(current.config);
        const pick = (source: Values) => Object.fromEntries(fields.map(field => [field, source[field]]));
        const locks = Object.fromEntries(fields.map(field => [field, field !== 'deployFormat' && options.ownerRootsLocked()
          ? 'PROJECT_CHECK_OWNER_ROOTS_LOCKED' : current.resolved.isolatedScratch && ['x4GamePath', 'modWorkspacePath', 'filesystemPath'].includes(field)
            ? 'DEV_SCRATCH_PATH_LOCKED' : null]));
        return { success: true, instance: structuredClone(instance), revision: current.revision,
          saved: pick(saved), effective: pick(current.effective), locks,
          provenance: Object.fromEntries(fields.map(field => [field, locks[field] ? 'launcher'
            : saved[field] === current.effective[field] && saved[field] ? 'saved' : 'default-or-environment'])),
          deployFormats: ['loose', 'catalog'], grantExpiresAt: grant?.expiresAt };
      });
    },
    async preview(actor: ConfigurationActor, input: unknown) {
      if (!object(input)) fail('CONFIGURATION_INPUT_INVALID', 400);
      const body = input as Record<string, unknown>;
      exact(body, ['instance', 'revision', 'operationId', 'patch']);
      const operationId = op(body.operationId);
      if (!sameInstance(body.instance, instance)) fail('CONFIGURATION_INSTANCE_MISMATCH');
      const change = patch(body.patch);
      const requestHash = hash(body);
      return exclusive(actor, 'configuration.preview', () => {
        const state = load();
        const before = snapshot();
        if (body.revision !== before.revision) fail('CONFIGURATION_REVISION_STALE');
        const result = plan(change, before);
        const effective = values(result.nextConfig, result.resolved);
        checkGrant(actor, 'preview', effective, Object.keys(change), state.journal);
        const id = 'cfg_' + hash([actor.kind, actor.id, operationId]);
        const existing = state.journal.entries.find(row => row.id === id);
        if (existing) {
          if (existing.kind !== 'change' || existing.requestHash !== requestHash) fail('CONFIGURATION_OPERATION_CONFLICT');
          if (existing.expiresAt <= now()) fail('CONFIGURATION_PROPOSAL_EXPIRED');
          return { success: true, proposalId: existing.id, operationId, expiresAt: existing.expiresAt, replayed: true };
        }
        const entry: Proposal = { kind: 'change', id, actorId: actor.id, operationId, requestHash, instance,
          expiresAt: now() + LIFETIME, revision: before.revision, patch: change,
          // Restore the prior effective values through a NEW preview, never a raw
          // historical config overwrite. An absent format's prior behavior is loose.
          previous: Object.fromEntries(Object.keys(change).map(field => [field, before.effective[field as ConfigurationGrantField]])),
          planHash: hash({ next: result.nextConfig, effective }), state: 'preview' };
        add(state, entry);
        return { success: true, proposalId: id, operationId, instance: structuredClone(instance), revision: before.revision,
          expiresAt: entry.expiresAt, changes: change, effective: Object.fromEntries(Object.keys(change).map(field => [field, effective[field as ConfigurationGrantField]])),
          schemaComplete: result.schemaComplete, schemaWarning: result.schemaWarning, restartRequired: false,
          impact: 'Saves profile settings and refreshes schema/reference caches. Does not move projects or deploy files.' };
      });
    },
    async apply(actor: ConfigurationActor, input: unknown) {
      if (!object(input)) fail('CONFIGURATION_INPUT_INVALID', 400);
      const body = input as Record<string, unknown>;
      exact(body, ['instance', 'proposalId', 'operationId']);
      const operationId = op(body.operationId);
      if (!sameInstance(body.instance, instance)) fail('CONFIGURATION_INSTANCE_MISMATCH');
      return exclusive(actor, 'configuration.apply', async () => {
        const state = load();
        const entry = state.journal.entries.find(row => row.id === body.proposalId);
        if (!entry || entry.kind !== 'change' || entry.actorId !== actor.id || entry.operationId !== operationId
          || !sameInstance(entry.instance, instance)) return fail('CONFIGURATION_PROPOSAL_MISMATCH');
        key(actor, 'apply');
        if (entry.state !== 'preview') return { ...statusResult(entry), replayed: true };
        if (entry.expiresAt <= now()) fail('CONFIGURATION_PROPOSAL_EXPIRED');
        const before = snapshot();
        if (before.revision !== entry.revision) fail('CONFIGURATION_REVISION_STALE');
        const result = plan(entry.patch, before);
        const effective = values(result.nextConfig, result.resolved);
        checkGrant(actor, 'apply', effective, Object.keys(entry.patch), state.journal);
        if (hash({ next: result.nextConfig, effective }) !== entry.planHash) fail('CONFIGURATION_PROPOSAL_CHANGED');
        const prepared = prepare(actor, entry, byteHash(before.raw));
        if (!prepared.created) return fail('CONFIGURATION_RECEIPT_REQUIRES_RECONCILIATION');
        entry.state = 'applying'; entry.writeState = 'unconfirmed'; entry.receiptId = prepared.receipt.id; save(state);
        let persisted = false;
        let promotionAdmitted = false;
        try {
          (options.writeConfig || writeXsdConfig)(result.nextConfig, { beforeRename: () => {
            checkStorage();
            if (snapshot().revision !== before.revision) fail('CONFIGURATION_REVISION_STALE');
            checkGrant(actor, 'apply', effective, Object.keys(entry.patch), load().journal);
            promotionAdmitted = true;
          } });
          persisted = true;
          entry.writeState = 'saved';
          const after = snapshot();
          if (canonicalJson(after.config) !== canonicalJson(result.nextConfig)) fail('CONFIGURATION_READBACK_MISMATCH');
          entry.afterRevision = after.revision;
          try { await options.followup(result); entry.followup = 'complete'; }
          catch { entry.followup = 'failed'; }
          commitReceipt(prepared.receipt, byteHash(after.raw), entry.followup === 'complete' ? 'configuration.saved' : 'configuration.followup_failed');
          entry.state = 'saved'; save(state);
          return { ...statusResult(entry), saved: true, schemaComplete: result.schemaComplete, schemaWarning: result.schemaWarning };
        } catch (error) {
          if (!persisted && promotionAdmitted) {
            try { persisted = strictFile(file) === `${JSON.stringify(result.nextConfig, null, 2)}\n`; } catch { /* unknown */ }
          }
          entry.writeState = persisted ? 'saved' : promotionAdmitted ? 'unconfirmed' : 'not-written';
          entry.state = entry.writeState === 'not-written' ? 'failed' : 'incomplete';
          if (entry.state === 'failed') {
            try { options.receipts.transition(prepared.receipt.id, { to: 'failed', at: new Date(now()).toISOString(),
              validation: { status: 'failed', validator: 'configuration.v1', code: 'configuration.write_refused' },
              failure: { code: 'configuration.write_refused' } }); } catch { /* receipt remains explicitly unconfirmed */ }
          }
          // Preserve known writes. A receipt/journal failure never authorizes a blind restore.
          try { save(state); } catch { /* durable applying record still prohibits re-mutation */ }
          return { ...statusResult(entry), success: false,
            code: persisted ? 'CONFIGURATION_SAVED_RECEIPT_INCOMPLETE' : promotionAdmitted ? 'CONFIGURATION_OUTCOME_UNCONFIRMED'
              : error instanceof ConfigurationOperationError ? error.code : 'CONFIGURATION_WRITE_FAILED' };
        }
      });
    },
    async status(actor: ConfigurationActor, operationId: unknown) {
      const id = op(operationId);
      return exclusive(actor, 'configuration.status', () => {
        key(actor, 'status');
        const entry = load().journal.entries.find(row => row.kind === 'change' && row.actorId === actor.id && row.operationId === id);
        if (!entry || entry.kind !== 'change') return fail('CONFIGURATION_OPERATION_NOT_FOUND', 404);
        return { ...statusResult(entry), instance: structuredClone(instance), recoveryPatch: entry.previous };
      });
    },
  };
}
