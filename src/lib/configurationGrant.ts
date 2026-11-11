/** Additional restrictions for #96. These never replace route/capability authority.
 * No transport is enabled by storing a restriction. Effective values must come
 * from the shared configuration planner, not directly from an agent request. */
import fs from 'node:fs';
import path from 'node:path';
import { isCanonicalSameOrDescendant } from './pathRoles';
import { normalizeDeployFormat } from './deployFormat';

export const CONFIGURATION_GRANT_FIELDS = [
  'schemaDir', 'x4ReferenceRoot', 'x4GamePath', 'modWorkspacePath', 'filesystemPath', 'deployFormat',
] as const;
export type ConfigurationGrantField = typeof CONFIGURATION_GRANT_FIELDS[number];
type PathField = Exclude<ConfigurationGrantField, 'deployFormat'>;
export const CONFIGURATION_GRANT_MAX_MS = 24 * 60 * 60 * 1000;
export const CONFIGURATION_GRANT_MAX_BYTES = 64 * 1024;
export const CONFIGURATION_GRANT_MAX_KEYS = 64;

export interface ConfigurationGrantInstance {
  profileId: string;
  pid: number;
  startedAt: string;
}
export interface ConfigurationRootLease { path: string; device: string; inode: string }
export interface ConfigurationGrant {
  version: 1;
  instance: ConfigurationGrantInstance;
  notBefore: number;
  expiresAt: number;
  fields: ConfigurationGrantField[];
  roots: Partial<Record<PathField, ConfigurationRootLease[]>>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: readonly string[]) =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...names].sort());
const fieldSet = new Set<string>(CONFIGURATION_GRANT_FIELDS);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const pathKey = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}
function bounded(value: unknown): boolean {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8') <= CONFIGURATION_GRANT_MAX_BYTES; }
  catch { return false; }
}
export function isConfigurationGrantInstance(value: unknown): value is ConfigurationGrantInstance {
  if (!record(value) || !keys(value, ['profileId', 'pid', 'startedAt'])) return false;
  return typeof value.profileId === 'string' && /^profile_[a-f0-9]{64}$/.test(value.profileId)
    && integer(value.pid) && value.pid > 0 && value.pid <= 0xffffffff
    && typeof value.startedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.startedAt)
    && Number.isFinite(Date.parse(value.startedAt)) && new Date(value.startedAt).toISOString() === value.startedAt;
}

/** Missing descendants are allowed for an effective destination, never for a lease root.
 * Check every existing ancestor: realpath failures and junctions cannot degrade to lexical permission. */
function inspectDirectory(value: string, requireExisting: boolean): ConfigurationRootLease | undefined {
  if (!value || value !== value.trim() || value.length > 4096 || hasControlCharacters(value)
    || !path.isAbsolute(value) || /^(?:\\\\|\/\/)/.test(value)) throw new Error('Invalid local directory.');
  const absolute = path.resolve(value);
  let cursor = absolute;
  let leaf: ConfigurationRootLease | undefined;
  for (let depth = 0; ; depth++) {
    if (depth >= 128) throw new Error('Directory ancestry exceeds its bound.');
    const info = fs.lstatSync(cursor, { bigint: true, throwIfNoEntry: false });
    if (info) {
      if (!info.isDirectory() || info.isSymbolicLink()
        || path.relative(cursor, fs.realpathSync.native(cursor))) throw new Error('Directory is not physical.');
      if (cursor === absolute) leaf = { path: absolute, device: info.dev.toString(), inode: info.ino.toString() };
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (requireExisting && !leaf) throw new Error('Grant root does not exist.');
  return leaf;
}

/** Durable shape only. Do not probe filesystem availability while loading unrelated keys. */
export function isConfigurationGrant(value: unknown): value is ConfigurationGrant {
  if (!record(value) || !bounded(value)
    || !keys(value, ['version', 'instance', 'notBefore', 'expiresAt', 'fields', 'roots'])
    || value.version !== 1 || !isConfigurationGrantInstance(value.instance)
    || !integer(value.notBefore) || !integer(value.expiresAt)
    || value.expiresAt <= value.notBefore || value.expiresAt - value.notBefore > CONFIGURATION_GRANT_MAX_MS
    || !Array.isArray(value.fields) || value.fields.length < 1 || value.fields.length > 6
    || !value.fields.every(field => typeof field === 'string' && fieldSet.has(field))
    || new Set(value.fields).size !== value.fields.length
    || JSON.stringify([...value.fields].sort()) !== JSON.stringify(value.fields)
    || !record(value.roots)) return false;
  const expected = value.fields.filter(field => field !== 'deployFormat');
  if (!keys(value.roots, expected)) return false;
  for (const field of expected) {
    const roots = value.roots[field];
    if (!Array.isArray(roots) || roots.length < 1 || roots.length > 8) return false;
    const paths: string[] = [];
    for (const root of roots) {
      if (!record(root) || !keys(root, ['path', 'device', 'inode'])
        || typeof root.path !== 'string' || root.path.length > 4096 || root.path !== root.path.trim()
        || hasControlCharacters(root.path) || !path.isAbsolute(root.path)
        || /^(?:\\\\|\/\/)/.test(root.path) || root.path !== path.resolve(root.path)
        || typeof root.device !== 'string' || !/^(?:0|[1-9]\d{0,31})$/.test(root.device)
        || typeof root.inode !== 'string' || !/^(?:0|[1-9]\d{0,31})$/.test(root.inode)) return false;
      paths.push(pathKey(root.path));
    }
    if (new Set(paths).size !== paths.length || JSON.stringify([...paths].sort()) !== JSON.stringify(paths)) return false;
  }
  return true;
}

export function cloneConfigurationGrant(grant: ConfigurationGrant): ConfigurationGrant {
  return structuredClone(grant);
}

export function createConfigurationGrant(
  request: unknown,
  context: { instance: ConfigurationGrantInstance; now: number; keyExpiresAt: number | null },
): ConfigurationGrant {
  if (!isConfigurationGrantInstance(context.instance) || !integer(context.now)
    || (context.keyExpiresAt !== null && (!integer(context.keyExpiresAt) || context.keyExpiresAt <= context.now))
    || !record(request) || !bounded(request) || !keys(request, ['instance', 'expiresAt', 'fields', 'roots'])
    || !isConfigurationGrantInstance(request.instance)
    || !sameInstance(request.instance, context.instance)
    || !integer(request.expiresAt) || request.expiresAt <= context.now
    || request.expiresAt - context.now > CONFIGURATION_GRANT_MAX_MS
    || (context.keyExpiresAt !== null && request.expiresAt > context.keyExpiresAt)
    || !Array.isArray(request.fields) || request.fields.length < 1 || request.fields.length > 6
    || !request.fields.every(field => typeof field === 'string' && fieldSet.has(field))
    || new Set(request.fields).size !== request.fields.length || !record(request.roots)) {
    throw new Error('Configuration grant request, instance or lifetime is invalid.');
  }
  const fields = [...request.fields].sort() as ConfigurationGrantField[];
  const pathFields = fields.filter(field => field !== 'deployFormat');
  if (!keys(request.roots, pathFields)) throw new Error('Configuration root fields must exactly match granted path fields.');
  const roots: ConfigurationGrant['roots'] = {};
  for (const field of pathFields) {
    const supplied = request.roots[field];
    if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > 8
      || !supplied.every(root => typeof root === 'string')) throw new Error('Configuration root list is invalid.');
    const leases = supplied.map(root => inspectDirectory(root, true)!);
    // Use the same deterministic code-point order as the durable shape validator.
    leases.sort((a, b) => pathKey(a.path) < pathKey(b.path) ? -1 : pathKey(a.path) > pathKey(b.path) ? 1 : 0);
    if (new Set(leases.map(root => pathKey(root.path))).size !== leases.length) throw new Error('Duplicate configuration root.');
    roots[field] = leases;
  }
  const grant: ConfigurationGrant = { version: 1, instance: { ...context.instance }, notBefore: context.now,
    expiresAt: request.expiresAt, fields, roots };
  if (!isConfigurationGrant(grant)) throw new Error('Configuration grant exceeds its durable contract.');
  return grant;
}

function sameInstance(left: ConfigurationGrantInstance, right: ConfigurationGrantInstance): boolean {
  return left.profileId === right.profileId && left.pid === right.pid && left.startedAt === right.startedAt;
}

export type ConfigurationRestrictionCode = 'WITHIN_CONFIGURATION_RESTRICTIONS' | 'CONFIGURATION_GRANT_REQUIRED'
  | 'CONFIGURATION_GRANT_INVALID' | 'CONFIGURATION_INSTANCE_MISMATCH' | 'CONFIGURATION_GRANT_EXPIRED'
  | 'CONFIGURATION_FIELD_DENIED' | 'CONFIGURATION_VALUE_INVALID' | 'CONFIGURATION_ROOT_DENIED' | 'CONFIGURATION_ROOT_CHANGED';

/** A positive result proves only these additional restrictions. The caller must
 * ALSO verify current key expiry/revocation and exact route/capability/effect authority.
 * No operation may use raw request paths as effectiveValues. */
export function evaluateConfigurationGrantRestrictions(
  grant: unknown,
  input: { instance: ConfigurationGrantInstance; now: number; fields: readonly string[]; effectiveValues: Record<string, unknown> },
): { withinRestrictions: boolean; code: ConfigurationRestrictionCode; field?: string } {
  const deny = (code: ConfigurationRestrictionCode, field?: string) => ({ withinRestrictions: false, code, ...(field ? { field } : {}) });
  if (grant === undefined) return deny('CONFIGURATION_GRANT_REQUIRED');
  if (!isConfigurationGrant(grant) || !integer(input.now) || !isConfigurationGrantInstance(input.instance)) return deny('CONFIGURATION_GRANT_INVALID');
  if (!sameInstance(grant.instance, input.instance)) return deny('CONFIGURATION_INSTANCE_MISMATCH');
  if (input.now < grant.notBefore || input.now >= grant.expiresAt) return deny('CONFIGURATION_GRANT_EXPIRED');
  if (!Array.isArray(input.fields) || !input.fields.length || input.fields.length > 6
    || new Set(input.fields).size !== input.fields.length || !record(input.effectiveValues)) return deny('CONFIGURATION_GRANT_INVALID');
  for (const field of input.fields) {
    if (!grant.fields.includes(field as ConfigurationGrantField)) return deny('CONFIGURATION_FIELD_DENIED', field);
    const value = input.effectiveValues[field];
    if (field === 'deployFormat') {
      if (typeof value !== 'string' || normalizeDeployFormat(value) !== value) return deny('CONFIGURATION_VALUE_INVALID', field);
      continue;
    }
    if (typeof value !== 'string') return deny('CONFIGURATION_VALUE_INVALID', field);
    if (value === '') continue; // Actually unconfigured after resolution; not a raw request clear.
    try { inspectDirectory(value, false); }
    catch { return deny('CONFIGURATION_VALUE_INVALID', field); }
    let changed = false;
    let matched = false;
    for (const root of grant.roots[field as PathField]!) {
      try {
        const current = inspectDirectory(root.path, true)!;
        if (current.device !== root.device || current.inode !== root.inode) { changed = true; continue; }
        if (isCanonicalSameOrDescendant(path.resolve(value), current.path)) {
          const after = inspectDirectory(root.path, true)!;
          if (after.device !== root.device || after.inode !== root.inode) { changed = true; continue; }
          inspectDirectory(value, false);
          matched = true;
        }
      } catch { changed = true; }
    }
    if (!matched) return deny(changed ? 'CONFIGURATION_ROOT_CHANGED' : 'CONFIGURATION_ROOT_DENIED', field);
  }
  return { withinRestrictions: true, code: 'WITHIN_CONFIGURATION_RESTRICTIONS' };
}
