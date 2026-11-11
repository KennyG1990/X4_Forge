import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgentKeyStore, runAgentKeysSelftest, scopeAllows } from '../src/lib/agentKeys';
import { atomicWriteJson } from '../src/lib/workspaceState';
import {
  CONFIGURATION_GRANT_MAX_MS, CONFIGURATION_GRANT_MAX_KEYS,
  CONFIGURATION_GRANT_FIELDS,
  createConfigurationGrant, evaluateConfigurationGrantRestrictions, isConfigurationGrant,
  type ConfigurationGrantInstance, type ConfigurationGrant,
} from '../src/lib/configurationGrant';

const parent = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(parent, 'forge-config-grant-'));
const identity = fs.statSync(root, { bigint: true });
const base = path.join(root, 'allowed');
const other = path.join(root, 'other');
fs.mkdirSync(base); fs.mkdirSync(other);
const now = Date.parse('2026-11-11T00:00:00.000Z');
const instance: ConfigurationGrantInstance = { profileId: 'profile_' + 'a'.repeat(64), pid: 12345,
  startedAt: '2026-11-10T23:59:00.000Z' };
const context = { instance, now, keyExpiresAt: now + CONFIGURATION_GRANT_MAX_MS };
const request = () => ({ instance: structuredClone(instance), expiresAt: now + 60_000,
  fields: ['modWorkspacePath', 'schemaDir', 'deployFormat'],
  roots: { modWorkspacePath: [base], schemaDir: [base] } });
const checks: Array<{ name: string; pass: boolean; error?: string }> = [];
let legacyOracleCount = 0;
const links: string[] = [];
function check(name: string, test: () => void) {
  try { test(); checks.push({ name, pass: true }); }
  catch (e) { checks.push({ name, pass: false, error: e instanceof Error ? e.message : String(e) }); }
}
const evaluate = (grant: unknown, fields = ['modWorkspacePath'], effectiveValues: Record<string, unknown> = {
  modWorkspacePath: path.join(base, 'future-child'),
}, override: Partial<Parameters<typeof evaluateConfigurationGrantRestrictions>[1]> = {}) =>
  evaluateConfigurationGrantRestrictions(grant, { instance, now, fields, effectiveValues, ...override });

try {
  check('existing key and route-authority oracle remains green', () => {
    const result = runAgentKeysSelftest();
    assert(result.pass, JSON.stringify(result.checks.filter(row => !row.pass)));
    assert(result.checks.length > 0 && result.checks.every(row => row.pass));
    legacyOracleCount = result.checks.length;
  });
  check('canonical grant binds fields, physical root leases and exact instance', () => {
    const grant = createConfigurationGrant(request(), context);
    assert(isConfigurationGrant(grant));
    assert.deepEqual(grant.fields, ['deployFormat', 'modWorkspacePath', 'schemaDir']);
    assert.equal(grant.roots.modWorkspacePath![0].path, base);
    assert.equal(grant.roots.modWorkspacePath![0].inode, fs.statSync(base, { bigint: true }).ino.toString());
    assert(evaluate(grant).withinRestrictions);
    assert(evaluate(grant, ['deployFormat'], { deployFormat: 'catalog' }).withinRestrictions);
    assert(evaluate(grant, ['schemaDir'], { schemaDir: '' }).withinRestrictions);
  });
  check('format-only grant needs no directory root', () => {
    const grant = createConfigurationGrant({ instance, expiresAt: now + 1, fields: ['deployFormat'], roots: {} }, context);
    assert(evaluate(grant, ['deployFormat'], { deployFormat: 'loose' }).withinRestrictions);
    assert.equal(evaluate(grant, ['schemaDir'], { schemaDir: base }).code, 'CONFIGURATION_FIELD_DENIED');
  });
  check('all six fields and the exact maximum duration are supported', () => {
    const fields = [...CONFIGURATION_GRANT_FIELDS];
    const roots = Object.fromEntries(fields.filter(field => field !== 'deployFormat').map(field => [field, [base]]));
    const grant = createConfigurationGrant({ instance, expiresAt: context.keyExpiresAt, fields, roots }, context);
    const values = Object.fromEntries(fields.map(field => [field, field === 'deployFormat' ? 'catalog' : path.join(base, field)]));
    assert(evaluate(grant, fields, values).withinRestrictions);
    assert.equal(grant.expiresAt - grant.notBefore, CONFIGURATION_GRANT_MAX_MS);
  });
  check('eight distinct physical roots work and preserve deterministic order', () => {
    const roots = Array.from({ length: 8 }, (_, index) => path.join(base, 'root-' + index));
    for (const directory of roots) fs.mkdirSync(directory);
    const grant = createConfigurationGrant({ instance, expiresAt: now + 60_000,
      fields: ['modWorkspacePath'], roots: { modWorkspacePath: [...roots].reverse() } }, context);
    assert.deepEqual(grant.roots.modWorkspacePath!.map(root => root.path), roots);
    assert(evaluate(grant, ['modWorkspacePath'], { modWorkspacePath: path.join(roots[7], 'future-child') }).withinRestrictions);
  });
  check('64KiB bound rejects an otherwise valid-shaped ingress and durable payload', () => {
    const fields = CONFIGURATION_GRANT_FIELDS.filter(field => field !== 'deployFormat');
    const paths = Array.from({ length: 8 }, (_, index) => path.join(base, 'x'.repeat(1900), String(index)));
    const oversized = { instance, expiresAt: now + 60_000, fields,
      roots: Object.fromEntries(fields.map(field => [field, paths])) };
    assert(Buffer.byteLength(JSON.stringify(oversized), 'utf8') > 65536);
    assert.throws(() => createConfigurationGrant(oversized, context), /request, instance or lifetime is invalid/);
    const lease = createConfigurationGrant(request(), context).roots.schemaDir![0];
    const durable = { version: 1, instance, notBefore: now, expiresAt: now + 60_000, fields: [...fields].sort(),
      roots: Object.fromEntries(fields.map(field => [field, paths.map(p => ({ ...lease, path: p }))])) };
    assert.equal(isConfigurationGrant(durable), false);
  });
  const invalidRequests: Array<[string, (value: ReturnType<typeof request>) => unknown]> = [
    ['missing grant', () => undefined], ['null grant', () => null], ['array grant', () => []],
    ['unknown request field', r => ({ ...r, arbitraryAuthority: true })],
    ['caller-supplied notBefore', r => ({ ...r, notBefore: now - 1 })],
    ['wrong instance PID', r => ({ ...r, instance: { ...instance, pid: 2 } })],
    ['wrong instance start', r => ({ ...r, instance: { ...instance, startedAt: '2026-11-10T00:00:00.000Z' } })],
    ['wrong profile', r => ({ ...r, instance: { ...instance, profileId: 'profile_' + 'b'.repeat(64) } })],
    ['surplus instance authority', r => ({ ...r, instance: { ...instance, allProfiles: true } })],
    ['noncanonical start date', r => ({ ...r, instance: { ...instance, startedAt: '2026-11-10T23:59:00Z' } })],
    ['negative PID', r => ({ ...r, instance: { ...instance, pid: -1 } })],
    ['expired grant', r => ({ ...r, expiresAt: now })],
    ['noninteger expiry', r => ({ ...r, expiresAt: now + 0.5 })],
    ['overlong duration', r => ({ ...r, expiresAt: now + CONFIGURATION_GRANT_MAX_MS + 1 })],
    ['unknown field', r => ({ ...r, fields: ['x4LogPath'], roots: { x4LogPath: [base] } })],
    ['duplicate field', r => ({ ...r, fields: ['deployFormat', 'deployFormat'], roots: {} })],
    ['empty fields', r => ({ ...r, fields: [], roots: {} })],
    ['missing root field', r => ({ ...r, roots: { modWorkspacePath: [base] } })],
    ['extra root field', r => ({ ...r, roots: { ...r.roots, filesystemPath: [base] } })],
    ['empty root list', r => ({ ...r, roots: { ...r.roots, schemaDir: [] } })],
    ['duplicate canonical root', r => ({ ...r, roots: { ...r.roots, schemaDir: [base, path.join(base, '.')] } })],
    ['too many roots', r => ({ ...r, roots: { ...r.roots, schemaDir: Array(9).fill(base) } })],
    ['relative root', r => ({ ...r, roots: { ...r.roots, schemaDir: ['relative'] } })],
    ['missing lease root', r => ({ ...r, roots: { ...r.roots, schemaDir: [path.join(base, 'absent')] } })],
    ['UNC root', r => ({ ...r, roots: { ...r.roots, schemaDir: ['\\\\server\\share'] } })],
    ['control character path', r => ({ ...r, roots: { ...r.roots, schemaDir: [base + '\n'] } })],
    ['overlong root path', r => ({ ...r, roots: { ...r.roots, schemaDir: [base + 'x'.repeat(4097)] } })],
    ['oversize request', r => ({ ...r, surplus: 'x'.repeat(65_537) })],
  ];
  for (const [name, mutate] of invalidRequests) check('creation refuses ' + name, () => {
    assert.throws(() => createConfigurationGrant(mutate(request()), context));
  });
  check('grant cannot outlive key or use an invalid trusted context', () => {
    assert.throws(() => createConfigurationGrant(request(), { ...context, keyExpiresAt: now + 59_999 }));
    assert.throws(() => createConfigurationGrant(request(), { ...context, instance: { ...instance, pid: 0 } }));
    assert.throws(() => createConfigurationGrant(request(), { ...context, now: Number.NaN }));
  });
  check('restriction evaluation refuses absent, malformed and foreign grants', () => {
    assert.equal(evaluate(undefined).code, 'CONFIGURATION_GRANT_REQUIRED');
    assert.equal(evaluate({}).code, 'CONFIGURATION_GRANT_INVALID');
    const grant = createConfigurationGrant(request(), context);
    assert.equal(evaluate(grant, undefined, undefined, { instance: { ...instance, pid: 4 } }).code, 'CONFIGURATION_INSTANCE_MISMATCH');
    assert.equal(evaluate(grant, undefined, undefined, { instance: { ...instance, profileId: 'profile_' + 'b'.repeat(64) } }).code, 'CONFIGURATION_INSTANCE_MISMATCH');
    assert.equal(evaluate(grant, undefined, undefined, { now: grant.expiresAt }).code, 'CONFIGURATION_GRANT_EXPIRED');
    assert.equal(evaluate(grant, undefined, undefined, { now: now - 1 }).code, 'CONFIGURATION_GRANT_EXPIRED');
  });
  check('ungranted fields, sibling prefixes and invalid effective values refuse', () => {
    const grant = createConfigurationGrant(request(), context);
    assert.equal(evaluate(grant, ['filesystemPath'], { filesystemPath: base }).code, 'CONFIGURATION_FIELD_DENIED');
    assert.equal(evaluate(grant, ['modWorkspacePath'], { modWorkspacePath: other }).code, 'CONFIGURATION_ROOT_DENIED');
    assert.equal(evaluate(grant, ['modWorkspacePath'], { modWorkspacePath: base + '-lookalike' }).code, 'CONFIGURATION_ROOT_DENIED');
    for (const bad of [undefined, null, false, 'relative', base + '\n']) {
      assert.equal(evaluate(grant, ['modWorkspacePath'], { modWorkspacePath: bad }).code, 'CONFIGURATION_VALUE_INVALID');
    }
    for (const bad of [' CATALOG ', 'invalid', null, undefined]) {
      assert.equal(evaluate(grant, ['deployFormat'], { deployFormat: bad }).code, 'CONFIGURATION_VALUE_INVALID');
    }
    assert.equal(evaluate(grant, []).code, 'CONFIGURATION_GRANT_INVALID');
    assert.equal(evaluate(grant, ['deployFormat', 'deployFormat']).code, 'CONFIGURATION_GRANT_INVALID');
  });
  check('a regular file is neither a root nor a directory target', () => {
    const file = path.join(base, 'regular.txt'); fs.writeFileSync(file, 'fixture');
    assert.throws(() => createConfigurationGrant({ ...request(), roots: { modWorkspacePath: [base], schemaDir: [file] } }, context));
    assert.equal(evaluate(createConfigurationGrant(request(), context), ['modWorkspacePath'], { modWorkspacePath: file }).code, 'CONFIGURATION_VALUE_INVALID');
  });
  check('effective path work is bounded by directory ancestry', () => {
    const deep = path.join(base, ...Array<string>(129).fill('child'));
    assert.equal(evaluate(createConfigurationGrant(request(), context), ['modWorkspacePath'], { modWorkspacePath: deep }).code, 'CONFIGURATION_VALUE_INVALID');
  });
  check('an inaccessible physical lookup fails closed without lexical permission', () => {
    const grant = createConfigurationGrant(request(), context);
    const original = fs.realpathSync.native;
    fs.realpathSync.native = ((input: fs.PathLike, ...args: unknown[]) => {
      if (String(input) === base) throw Object.assign(new Error('fixture access denied'), { code: 'EACCES' });
      return Reflect.apply(original, fs.realpathSync, [input, ...args]);
    }) as typeof original;
    try {
      assert.throws(() => createConfigurationGrant(request(), context), /access denied/);
      assert.equal(evaluate(grant).withinRestrictions, false);
    } finally { fs.realpathSync.native = original; }
    assert(evaluate(grant).withinRestrictions);
  });
  check('a later realpath refusal cannot be converted into lexical permission', () => {
    const grant = createConfigurationGrant(request(), context);
    const original = fs.realpathSync.native; let rootLookups = 0;
    fs.realpathSync.native = ((input: fs.PathLike, ...args: unknown[]) => {
      if (String(input) === base && ++rootLookups >= 3) {
        throw Object.assign(new Error('fixture late access denied'), { code: 'EACCES' });
      }
      return Reflect.apply(original, fs.realpathSync, [input, ...args]);
    }) as typeof original;
    try {
      assert.equal(evaluate(grant).withinRestrictions, false);
      assert(rootLookups >= 3, 'The late refusal must actually have been exercised.');
    } finally { fs.realpathSync.native = original; }
    assert(evaluate(grant).withinRestrictions);
  });
  check('replacement of a leased root refuses even at the same path', () => {
    const grant = createConfigurationGrant(request(), context);
    const previous = path.join(root, 'previous-allowed');
    fs.renameSync(base, previous); fs.mkdirSync(base);
    try { assert.equal(evaluate(grant).code, 'CONFIGURATION_ROOT_CHANGED'); }
    finally { fs.rmdirSync(base); fs.renameSync(previous, base); }
    assert(evaluate(grant).withinRestrictions);
  });
  check('a root without a usable inode identity cannot become a lease', () => {
    const original = fs.lstatSync;
    const patched = ((input: fs.PathLike, ...args: unknown[]) => {
      const info = Reflect.apply(original, fs, [input, ...args]);
      return String(input) === base && info
        ? Object.assign(Object.create(Object.getPrototypeOf(info)), info, { ino: 0n }) : info;
    }) as typeof original;
    assert(Reflect.set(fs, 'lstatSync', patched));
    try { assert.throws(() => createConfigurationGrant(request(), context), /identity/); }
    finally { assert(Reflect.set(fs, 'lstatSync', original)); }
    const grant = createConfigurationGrant(request(), context);
    assert(isConfigurationGrant(grant));
    grant.roots.modWorkspacePath![0].inode = '0';
    assert.equal(isConfigurationGrant(grant), false);
  });
  check('junction roots, ancestor aliases and escaped target values refuse', () => {
    const alias = path.join(root, 'alias');
    const escape = path.join(base, 'escape');
    fs.symlinkSync(base, alias, process.platform === 'win32' ? 'junction' : 'dir'); links.push(alias);
    fs.symlinkSync(other, escape, process.platform === 'win32' ? 'junction' : 'dir'); links.push(escape);
    assert.throws(() => createConfigurationGrant({ ...request(), roots: { modWorkspacePath: [base], schemaDir: [alias] } }, context));
    assert.throws(() => createConfigurationGrant({ ...request(), roots: { modWorkspacePath: [base], schemaDir: [path.join(alias, 'missing')] } }, context));
    assert.equal(evaluate(createConfigurationGrant(request(), context), ['modWorkspacePath'], { modWorkspacePath: path.join(escape, 'child') }).code, 'CONFIGURATION_VALUE_INVALID');
  });

  let seed = 0;
  const options = { file: path.join(root, 'keys.json'), now: () => now,
    randomHex: (bytes: number) => (++seed).toString(16).padStart(bytes * 2, '0'), configurationInstance: () => instance };
  const store = createAgentKeyStore(options);
  let issued: ReturnType<typeof store.create>;
  check('real key store persists restrictions without plaintext token', () => {
    const input = request();
    issued = store.create('restricted configuration', 'write', 3_600_000, undefined, undefined, input);
    input.fields.push('filesystemPath'); input.roots.modWorkspacePath[0] = other;
    input.instance.pid = 9;
    assert(isConfigurationGrant(issued.record.configurationGrant));
    assert.deepEqual(store.verify(issued.token).configurationGrant, issued.record.configurationGrant);
    const raw = fs.readFileSync(options.file, 'utf8');
    assert(!raw.includes(issued.token));
    assert.equal(JSON.parse(raw).version, 3);
    assert.deepEqual(createAgentKeyStore(options).verify(issued.token).configurationGrant, issued.record.configurationGrant);
  });
  check('loading durable keys does not probe transient root availability', () => {
    const previous = path.join(root, 'temporarily-unavailable');
    fs.renameSync(base, previous);
    try {
      const reopened = createAgentKeyStore(options).verify(issued.token);
      assert(reopened.ok);
      assert.equal(evaluate(reopened.configurationGrant).code, 'CONFIGURATION_ROOT_CHANGED');
    } finally { fs.renameSync(previous, base); }
  });
  check('returned create/verify/list objects cannot change stored restrictions', () => {
    assert(issued!);
    const expected = store.verify(issued.token).configurationGrant!;
    const mutate = (grant: ConfigurationGrant) => {
      grant.instance.profileId = 'profile_' + 'f'.repeat(64); grant.fields.push('filesystemPath');
      grant.roots.modWorkspacePath![0].path = other; grant.expiresAt += 1;
    };
    mutate(issued.record.configurationGrant!);
    mutate(store.verify(issued.token).configurationGrant!);
    mutate(store.list().find(row => row.id === issued.record.id)!.configurationGrant!);
    assert.deepEqual(store.verify(issued.token).configurationGrant, expected);
    assert.deepEqual(createAgentKeyStore(options).verify(issued.token).configurationGrant, expected);
  });
  check('grant creation without trusted context or over key lifetime publishes no record', () => {
    const empty = createAgentKeyStore({ ...options, file: '', configurationInstance: undefined });
    assert.throws(() => empty.create('no context', 'write', null, undefined, undefined, request()));
    assert.deepEqual(empty.list(), []);
    const before = JSON.stringify(store.list());
    assert.throws(() => store.create('too long', 'write', 60_000, undefined, undefined, { ...request(), expiresAt: now + 60_001 }));
    assert.equal(JSON.stringify(store.list()), before);
  });
  check('real pre-rename failure preserves disk and in-memory authority', () => {
    const before = fs.readFileSync(options.file);
    const broken = createAgentKeyStore({ ...options, writeJson(file, value, opts) {
      atomicWriteJson(file, value, { ...opts, beforeRename() { throw new Error('injected pre-promotion failure'); } });
    } });
    const beforeRows = broken.list();
    assert.throws(() => broken.create('not committed', 'write', null, undefined, undefined, request()), /pre-promotion/);
    assert.deepEqual(broken.list(), beforeRows);
    assert.deepEqual(fs.readFileSync(options.file), before);
    assert.equal(fs.readdirSync(root).filter(name => name.includes('.tmp')).length, 0);
  });
  check('key expiry and revocation remain authoritative over a grant', () => {
    const key = store.create('revoke', 'write', 60_000, undefined, undefined, request());
    assert.equal(store.verify(key.token, now + 60_000).reason, 'expired');
    assert(store.revoke(key.record.id));
    assert.equal(store.verify(key.token).reason, 'revoked');
    assert.equal(createAgentKeyStore(options).verify(key.token).reason, 'revoked');
  });
  check('only an explicit finite same-profile grant survives process restart', () => {
    const restarted = { ...instance, pid: instance.pid + 1, startedAt: '2026-11-11T00:00:01.000Z' };
    assert.equal(evaluate(createConfigurationGrant(request(), context), undefined, undefined, { instance: restarted }).code,
      'CONFIGURATION_INSTANCE_MISMATCH');
    const grant = createConfigurationGrant({ ...request(), restartPolicy: 'same-profile' }, context);
    assert(evaluate(grant, undefined, undefined, { instance: restarted }).withinRestrictions);
    assert.equal(evaluate(grant, undefined, undefined, { instance: { ...restarted, profileId: 'profile_' + 'b'.repeat(64) } }).code,
      'CONFIGURATION_INSTANCE_MISMATCH');
    assert.equal(evaluate(grant, undefined, undefined, { now: grant.expiresAt }).code, 'CONFIGURATION_GRANT_EXPIRED');
    assert.throws(() => createConfigurationGrant({ ...request(), restartPolicy: 'any-profile' }, context));
    assert(!isConfigurationGrant({ ...grant, restartPolicy: undefined }));
  });
  check('owner approval attaches restrictions without changing base key authority', () => {
    let clock = now;
    const ownerOptions = { ...options, file: path.join(root, 'owner-keys.json'), now: () => clock };
    const first = createAgentKeyStore(ownerOptions);
    const key = first.create('approve existing', 'write', 3_600_000, 'ws_' + 'a'.repeat(24));
    const before = first.list()[0];
    const authority = first.configurationAuthorityRevision(key.record.id);
    first.touch(key.record.id); // usage metadata is deliberately outside the approval CAS.
    assert.equal(first.configurationAuthorityRevision(key.record.id), authority);
    clock += 1000;
    const grant = first.approveConfigurationGrant(key.record.id, authority, { ...request(), restartPolicy: 'same-profile' });
    assert.equal(grant.notBefore, clock);
    const after = first.list()[0];
    for (const field of ['id', 'scope', 'workspaceId', 'capabilityConstraint', 'expiresAt', 'createdAt', 'hashPrefix'] as const) {
      assert.deepEqual(after[field], before[field]);
    }
    assert.notEqual(first.configurationAuthorityRevision(key.record.id), authority);
    assert.throws(() => first.approveConfigurationGrant(key.record.id, authority, request()), /changed/);
    const reopened = createAgentKeyStore(ownerOptions);
    assert.deepEqual(reopened.verify(key.token).configurationGrant, grant);
    grant.fields.push('filesystemPath');
    assert(!first.verify(key.token).configurationGrant!.fields.includes('filesystemPath'));
  });
  check('a second store observes revocation and never resurrects a cached key', () => {
    const file = path.join(root, 'shared-keys.json');
    const first = createAgentKeyStore({ ...options, file });
    const key = first.create('shared', 'write', null);
    const second = createAgentKeyStore({ ...options, file });
    assert(second.verify(key.token).ok);
    first.revoke(key.record.id);
    assert.equal(second.verify(key.token).reason, 'revoked');
    second.create('new unrelated', 'read', null);
    assert.equal(first.verify(key.token).reason, 'revoked');
    assert.equal(first.list().length, 2);
    assert.throws(() => second.approveConfigurationGrant(key.record.id, second.configurationAuthorityRevision(key.record.id), request()), /changed or expired/);
  });
  check('pre-promotion key CAS preserves an intervening revocation', () => {
    const file = path.join(root, 'key-cas.json');
    const owner = createAgentKeyStore({ ...options, file });
    const key = owner.create('intervened', 'write', null);
    const competing = createAgentKeyStore({ ...options, file, writeJson(target, value, opts) {
      owner.revoke(key.record.id);
      atomicWriteJson(target, value, opts);
    } });
    const authority = competing.configurationAuthorityRevision(key.record.id);
    assert.throws(() => competing.approveConfigurationGrant(key.record.id, authority, request()), /changed/);
    assert.equal(owner.verify(key.token).reason, 'revoked');
    assert.equal(competing.verify(key.token).reason, 'revoked');
    assert.equal(competing.list()[0].configurationGrant, undefined);
    assert(!fs.readdirSync(root).some(name => name.endsWith('.tmp')));
  });
  check('an open store fails closed after corruption and reloads a repaired durable file', () => {
    const file = path.join(root, 'repair-keys.json');
    const owner = createAgentKeyStore({ ...options, file });
    const key = owner.create('repair', 'write', null);
    const bytes = fs.readFileSync(file);
    fs.writeFileSync(file, '{');
    assert.equal(owner.verify(key.token).reason, 'unknown');
    assert.throws(() => owner.create('must not overwrite', 'read', null), /unreadable/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{');
    fs.writeFileSync(file, bytes);
    assert(owner.verify(key.token).ok);
  });
  check('legacy preset keys gain neither metadata nor configuration route permission', () => {
    for (const scope of ['read', 'write', 'deploy', 'all'] as const) {
      const key = store.create('legacy ' + scope, scope, null);
      assert.equal(store.verify(key.token).configurationGrant, undefined);
      assert(!Object.hasOwn(key.record, 'configurationGrant'));
      assert.equal(evaluate(store.verify(key.token).configurationGrant).code, 'CONFIGURATION_GRANT_REQUIRED');
      for (const method of ['GET', 'POST']) assert.equal(scopeAllows(scope, method, '/api/schema/config'), false);
    }
  });
  check('retained configuration-key meter bounds inactive metadata until existing prune', () => {
    let clock = now;
    const limited = createAgentKeyStore({ ...options, file: '', now: () => clock });
    for (let i = 0; i < CONFIGURATION_GRANT_MAX_KEYS; i++) limited.create('grant', 'write', 60_000, undefined, undefined, request());
    const before = JSON.stringify(limited.list());
    assert.throws(() => limited.create('overflow', 'write', null, undefined, undefined, request()), /limit/);
    assert.equal(JSON.stringify(limited.list()), before);
    assert(limited.revoke(limited.list()[0].id));
    assert.throws(() => limited.create('revocation is not retirement', 'write', null, undefined, undefined, request()), /limit/);
    clock += 60_000;
    assert.equal(limited.prune(clock, 0), CONFIGURATION_GRANT_MAX_KEYS);
    assert(limited.create('after prune', 'write', 60_000, undefined, undefined, { ...request(), expiresAt: clock + 60_000 }));
  });
  check('malformed durable restriction fails closed without overwrite', () => {
    const malformed = path.join(root, 'malformed-keys.json');
    const body = JSON.parse(fs.readFileSync(options.file, 'utf8'));
    body.keys[0].configurationGrant.roots.modWorkspacePath[0].inode = '-1';
    fs.writeFileSync(malformed, JSON.stringify(body));
    const before = fs.readFileSync(malformed);
    const bad = createAgentKeyStore({ ...options, file: malformed });
    assert.equal(bad.verify(issued.token).ok, false);
    assert.throws(() => bad.create('do not overwrite', 'read', null), /unreadable/);
    assert.deepEqual(fs.readFileSync(malformed), before);
  });
} finally {
  // Remove only the known fixture links, then prove the exact owned root and
  // physical inventory before recursive retirement. Never traverse a junction.
  for (const link of links.reverse()) {
    assert(fs.lstatSync(link).isSymbolicLink()); fs.unlinkSync(link);
  }
  assert.equal(path.dirname(root), parent);
  assert.equal(fs.realpathSync.native(root), root);
  const current = fs.statSync(root, { bigint: true });
  assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
  const pending = [root]; let bytes = 0; let entries = 0;
  while (pending.length) {
    const item = pending.pop()!; const info = fs.lstatSync(item);
    assert(!info.isSymbolicLink()); entries++;
    if (info.isDirectory()) pending.push(...fs.readdirSync(item).map(name => path.join(item, name)));
    else { assert(info.isFile() && info.nlink === 1); bytes += info.size; }
  }
  assert(bytes < 1024 * 1024 && entries < 100);
  fs.rmSync(root, { recursive: true });
  assert(!fs.existsSync(root));
}
const failed = checks.filter(check => !check.pass);
console.log(JSON.stringify({ status: failed.length ? 'FAIL' : 'PASS', passed: checks.length - failed.length,
  total: checks.length, legacyOracleCount, fixtureRetired: !fs.existsSync(root), checks }, null, 2));
if (failed.length) process.exitCode = 1;
