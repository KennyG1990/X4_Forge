import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../src/lib/workspaceState';
import { createAgentKeyStore } from '../src/lib/agentKeys';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { writeXsdConfig } from '../src/lib/xsdParser';
import { SharedSourceCoordinator } from '../src/server/sharedSourceCoordinator';
import { configurationProfileIdentity, createConfigurationOperations, ConfigurationOperationError,
  type ConfigurationActor } from '../src/server/configurationOperations';

const parent = fs.realpathSync.native(os.tmpdir());
const root = fs.mkdtempSync(path.join(parent, 'forge-config-operations-'));
const rootInfo = fs.statSync(root, { bigint: true });
const configDir = path.join(root, 'profile');
const dataDir = path.join(root, 'data');
const allowed = path.join(root, 'allowed');
for (const dir of [configDir, dataDir, allowed, 'corpus', 'schema', 'mods', 'browse', 'game'].map(dir => path.isAbsolute(dir) ? dir : path.join(allowed, dir))) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(allowed, 'game', 'X4.exe'), 'synthetic marker; never executable');
const previousConfigEnv = process.env.X4_CONFIG_DIR;
const previousReferenceEnv = process.env.X4_REFERENCE_ROOT;
const previousGameEnv = process.env.X4_GAME_PATH;
const previousSchemaEnv = process.env.X4_XSD_PATH;
process.env.X4_CONFIG_DIR = configDir;
delete process.env.X4_REFERENCE_ROOT; delete process.env.X4_GAME_PATH; delete process.env.X4_XSD_PATH;
const checks: Array<{ name: string; pass: boolean; error?: string }> = [];
async function check(name: string, test: () => unknown | Promise<unknown>) {
  try { await test(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, error: error instanceof Error ? error.stack : String(error) }); }
}
const rejects = (run: () => Promise<unknown>, code: string) => assert.rejects(run,
  error => error instanceof ConfigurationOperationError && error.code === code);
let clock = Date.parse('2026-11-11T01:00:00.000Z');
const instance = { profileId: configurationProfileIdentity(configDir, dataDir), pid: process.pid, startedAt: '2026-11-11T00:00:00.000Z' };
const owner: ConfigurationActor = { kind: 'studio', id: 'client_configuration_owner' };
const keys = createAgentKeyStore({ file: path.join(dataDir, 'agent-keys.json'), now: () => clock, configurationInstance: () => instance });
const issued = keys.create('configuration test', 'write', 3_600_000, 'ws_' + 'a'.repeat(24));
const actor: ConfigurationActor = { kind: 'agent', id: issued.record.id };
const receipts = new ActionReceiptStore({ root: path.join(dataDir, 'receipts'), now: () => clock });
let followupFails = false;
let deny = false;
let locked = false;
let followupCalls = 0;
// Own and close the actual SQLite coordinator, including on CI with no Forge
// environment. Never let a fixture fall back to the operator's shared registry.
const coordinator = new SharedSourceCoordinator({ directory: path.join(root, 'coordination') });
const options = { journalFile: path.join(dataDir, 'configuration-operations.json'), instance, keys, receipts,
  coordinate: coordinator.run.bind(coordinator),
  authorize: () => !deny, ownerRootsLocked: () => locked, now: () => clock,
  followup() { followupCalls++; if (followupFails) throw new Error('fixture reload failed'); } };
const service = createConfigurationOperations(options);
const configFile = path.join(configDir, 'config.json');
writeXsdConfig({ x4ReferenceRoot: path.join(allowed, 'corpus'), xsdSchemaPath: path.join(allowed, 'schema'),
  x4GamePath: path.join(allowed, 'game'), modWorkspacePath: path.join(allowed, 'mods'), filesystemPath: path.join(allowed, 'browse'),
  x4LogPath: 'preserve-unrelated-log' });
const accessBody = { instance, operationId: 'access-session-0001', fields: ['deployFormat', 'modWorkspacePath'],
  roots: { modWorkspacePath: [allowed] }, durationMs: 600_000, restartPolicy: 'same-profile' };
let requestId = '';
async function preview(operationId: string, change: Record<string, string>) {
  const view = await service.read(actor);
  return service.preview(actor, { instance: service.instance(), revision: view.revision, operationId, patch: change });
}
try {
  await check('stable profile derives physical directories, not replaceable configuration bytes', () => {
    assert.equal(configurationProfileIdentity(configDir, dataDir), instance.profileId);
    writeXsdConfig(JSON.parse(fs.readFileSync(configFile, 'utf8')));
    assert.equal(configurationProfileIdentity(configDir, dataDir), instance.profileId);
    assert.notEqual(configurationProfileIdentity(configDir, allowed), instance.profileId);
  });
  await check('ordinary key cannot read/change settings before a committed owner grant', async () => {
    const before = fs.readFileSync(configFile);
    await rejects(() => service.read(actor), 'CONFIGURATION_GRANT_REQUIRED');
    assert.deepEqual(fs.readFileSync(configFile), before);
  });
  await check('agent requests bounded access and can poll; it cannot approve itself', async () => {
    const request = await service.requestAccess(actor, accessBody);
    requestId = request.requestId;
    assert.equal(request.state, 'pending');
    assert.deepEqual(await service.requestAccess(actor, accessBody), request);
    assert.equal((await service.accessStatus(actor, accessBody.operationId)).state, 'pending');
    await rejects(() => service.decideAccess(actor, { requestId, instance, approve: true }), 'STUDIO_SESSION_REQUIRED');
    await rejects(() => service.requestAccess(actor, { ...accessBody, durationMs: 86_400_001 }), 'CONFIGURATION_ACCESS_INPUT_INVALID');
  });
  await check('owner decision persists a restriction and real committed receipt before access', async () => {
    const result = await service.decideAccess(owner, { requestId, instance, approve: true });
    assert.equal(result.success, true);
    assert.equal((await service.accessStatus(actor, accessBody.operationId)).state, 'approved');
    const view = await service.read(actor);
    assert.deepEqual(Object.keys(view.effective).sort(), ['deployFormat', 'modWorkspacePath']);
    assert.equal(view.effective.deployFormat, 'loose');
    assert.equal(view.saved.deployFormat, '');
    const rows = receipts.listVerified(); assert.equal(rows.length, 1); assert.equal(rows[0].status, 'committed');
    assert(!JSON.stringify(view).includes('preserve-unrelated-log'));
  });
  await check('preview is no config write and apply preserves unrelated settings with durable receipt', async () => {
    const before = fs.readFileSync(configFile);
    const prepared = await preview('change-format-0001', { deployFormat: 'catalog' });
    assert.deepEqual(fs.readFileSync(configFile), before);
    const result = await service.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId });
    assert.equal(result.saved, true); assert.equal(result.success, true); assert.equal(result.receipt?.status, 'committed');
    const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(stored.deployFormat, 'catalog'); assert.equal(stored.x4LogPath, 'preserve-unrelated-log');
    assert.equal((await service.read(actor)).effective.deployFormat, 'catalog');
    const calls = followupCalls;
    const replay = await service.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId });
    assert('replayed' in replay && replay.replayed === true); assert.equal(replay.receipt?.id, result.receipt?.id); assert.equal(followupCalls, calls);
  });
  await check('stale revision, wrong instance, denied field and conflicting operation refuse', async () => {
    const view = await service.read(actor);
    const body = { instance, revision: view.revision, operationId: 'negative-config-0001', patch: { deployFormat: 'loose' } };
    const prepared = await service.preview(actor, body);
    await rejects(() => service.preview(actor, { ...body, patch: { deployFormat: 'catalog' } }), 'CONFIGURATION_OPERATION_CONFLICT');
    await rejects(() => service.preview(actor, { ...body, instance: { ...instance, pid: instance.pid + 1 } }), 'CONFIGURATION_INSTANCE_MISMATCH');
    await rejects(() => service.preview(actor, { ...body, patch: { filesystemPath: path.join(allowed, 'browse') } }), 'CONFIGURATION_FIELD_DENIED');
    writeXsdConfig({ ...JSON.parse(fs.readFileSync(configFile, 'utf8')), schemaFiles: ['intervening.xsd'] });
    await rejects(() => service.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId }), 'CONFIGURATION_REVISION_STALE');
  });
  await check('effective destination obeys granted roots and owner locks', async () => {
    await rejects(() => preview('negative-root-0001', { modWorkspacePath: configDir }), 'CONFIGURATION_ROOT_DENIED');
    locked = true;
    await rejects(() => preview('negative-lock-0001', { modWorkspacePath: path.join(allowed, 'new-mods') }), 'PROJECT_CHECK_OWNER_ROOTS_LOCKED');
    locked = false;
    await rejects(() => preview('negative-path-0001', { modWorkspacePath: 'relative' }), 'CONFIGURATION_PATH_NOT_ABSOLUTE');
    const prepared = await preview('positive-root-0001', { modWorkspacePath: path.join(allowed, 'new-mods') });
    const result = await service.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId });
    assert.equal(result.saved, true); assert.equal((await service.read(actor)).effective.modWorkspacePath, path.join(allowed, 'new-mods'));
    assert(!fs.existsSync(path.join(allowed, 'new-mods')), 'Saving does not create/migrate a project.');
  });
  await check('saved settings remain saved when cache follow-up fails', async () => {
    followupFails = true;
    const prepared = await preview('followup-fails-0001', { deployFormat: 'loose' });
    const result = await service.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId });
    assert.equal(result.success, false); assert.equal(result.saved, true); assert.equal(result.code, 'CONFIGURATION_SAVED_FOLLOWUP_FAILED');
    assert.equal(result.receipt?.status, 'committed'); assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).deployFormat, 'loose');
    assert.equal((await service.status(actor, prepared.operationId)).code, result.code);
    followupFails = false;
  });
  await check('same-profile session reads persisted values after backend reconstruction; old proposal is process-bound', async () => {
    const prepared = await preview('restart-stale-0001', { deployFormat: 'catalog' });
    const restartedInstance = { ...instance, pid: instance.pid + 100, startedAt: '2026-11-11T01:00:01.000Z' };
    const restarted = createConfigurationOperations({ ...options, instance: restartedInstance });
    assert.equal((await restarted.read(actor)).effective.deployFormat, 'loose');
    await rejects(() => restarted.apply(actor, { instance: restartedInstance, proposalId: prepared.proposalId, operationId: prepared.operationId }), 'CONFIGURATION_PROPOSAL_MISMATCH');
  });
  await check('final promotion CAS preserves intervening settings and never runs follow-up', async () => {
    const current = createConfigurationOperations({ ...options, writeConfig(config, guard) {
      atomicWriteFile(configFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(configFile, 'utf8')), x4LogPath: 'intervening-owner' }));
      writeXsdConfig(config, guard);
    } });
    const view = await current.read(actor);
    const prepared = await current.preview(actor, { instance, revision: view.revision, operationId: 'promotion-cas-0001', patch: { deployFormat: 'catalog' } });
    const calls = followupCalls;
    const result = await current.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId });
    assert.equal(result.saved, false); assert.equal(result.code, 'CONFIGURATION_REVISION_STALE');
    assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).x4LogPath, 'intervening-owner'); assert.equal(followupCalls, calls);
  });
  await check('receipt finalization failure preserves known save and refuses a second mutation', async () => {
    let writes = 0;
    const faulty = createConfigurationOperations({ ...options, receipts: {
      prepareWithDisposition: input => receipts.prepareWithDisposition(input), read: id => receipts.read(id),
      transition() { throw new Error('injected receipt finalization failure'); },
    }, writeConfig(config, guard) { writes++; writeXsdConfig(config, guard); } });
    const view = await faulty.read(actor);
    const prepared = await faulty.preview(actor, { instance, revision: view.revision, operationId: 'receipt-failure-0001', patch: { deployFormat: 'catalog' } });
    const body = { instance, proposalId: prepared.proposalId, operationId: prepared.operationId };
    const result = await faulty.apply(actor, body);
    assert.equal(result.success, false); assert.equal(result.saved, true); assert.equal(result.code, 'CONFIGURATION_SAVED_RECEIPT_INCOMPLETE');
    assert.equal(result.receipt?.status, 'prepared'); assert.equal((await faulty.status(actor, prepared.operationId)).saved, true);
    await faulty.apply(actor, body); assert.equal(writes, 1);
  });
  await check('a writer exception after actual promotion never reports an unsaved result', async () => {
    const faulty = createConfigurationOperations({ ...options, writeConfig(config, guard) {
      writeXsdConfig(config, guard); throw new Error('injected post-promotion transport failure');
    } });
    const view = await faulty.read(actor);
    const prepared = await faulty.preview(actor, { instance, revision: view.revision, operationId: 'after-write-failure-0001', patch: { deployFormat: 'loose' } });
    const result = await faulty.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId });
    assert.equal(result.saved, true); assert.equal(result.success, false);
    assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).deployFormat, 'loose');
  });
  await check('64 retained requests have an explicit cap and failed admission changes no journal bytes', async () => {
    const journalFile = path.join(dataDir, 'bounded-requests.json');
    const bounded = createConfigurationOperations({ ...options, journalFile });
    for (let index = 0; index < 64; index++) {
      await bounded.requestAccess(actor, { ...accessBody, operationId: 'bounded-request-' + String(index).padStart(4, '0') });
    }
    const before = fs.readFileSync(journalFile);
    await rejects(() => bounded.requestAccess(actor, { ...accessBody, operationId: 'bounded-request-0064' }), 'CONFIGURATION_JOURNAL_FULL');
    assert.deepEqual(fs.readFileSync(journalFile), before);
  });
  await check('malformed journal/configuration fails closed without overwriting either', async () => {
    const journalFile = path.join(dataDir, 'corrupt-journal.json');
    const corrupted = createConfigurationOperations({ ...options, journalFile });
    fs.writeFileSync(journalFile, '{');
    await rejects(() => corrupted.requestAccess(actor, accessBody), 'CONFIGURATION_JOURNAL_INVALID');
    assert.equal(fs.readFileSync(journalFile, 'utf8'), '{');
    const before = fs.readFileSync(configFile);
    try {
      fs.writeFileSync(configFile, '{');
      await rejects(() => service.read(owner), 'CONFIGURATION_FILE_INVALID');
      assert.equal(fs.readFileSync(configFile, 'utf8'), '{');
    } finally { fs.writeFileSync(configFile, before); }
  });
  await check('an unrelated committed receipt cannot authorize a configuration grant', async () => {
    const original = fs.readFileSync(options.journalFile);
    const journal = JSON.parse(original.toString('utf8'));
    const request = journal.entries.find((entry: { kind: string; state: string }) => entry.kind === 'access' && entry.state === 'approved');
    const unrelated = receipts.listVerified().find(receipt => 'id' in receipt.capability && receipt.capability.id === 'configuration.apply' && receipt.status === 'committed');
    assert(request && unrelated);
    try {
      request.receiptId = unrelated.id;
      fs.writeFileSync(options.journalFile, JSON.stringify(journal));
      await rejects(() => service.read(actor), 'CONFIGURATION_GRANT_REQUIRED');
    } finally { fs.writeFileSync(options.journalFile, original); }
  });
  await check('revocation/expiry/effect denial are rechecked, not cached by preview', async () => {
    const prepared = await preview('revoke-before-0001', { deployFormat: 'catalog' });
    deny = true;
    await rejects(() => service.apply(actor, { instance, proposalId: prepared.proposalId, operationId: prepared.operationId }), 'CONFIGURATION_AUTHORITY_DENIED');
    deny = false;
    clock += 600_001;
    await rejects(() => service.read(actor), 'CONFIGURATION_GRANT_EXPIRED');
    keys.revoke(actor.id);
    await rejects(() => service.accessStatus(actor, accessBody.operationId), 'CONFIGURATION_AUTHORITY_DENIED');
  });
} finally {
  coordinator.close();
  for (const [key, previous] of [['X4_CONFIG_DIR', previousConfigEnv], ['X4_REFERENCE_ROOT', previousReferenceEnv],
    ['X4_GAME_PATH', previousGameEnv], ['X4_XSD_PATH', previousSchemaEnv]]) {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
  const current = fs.lstatSync(root, { bigint: true });
  assert(!current.isSymbolicLink() && current.dev === rootInfo.dev && current.ino === rootInfo.ino);
  let bytes = 0; let entries = 0;
  const inspect = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, item.name); const info = fs.lstatSync(child);
      assert(!info.isSymbolicLink()); entries++;
      if (info.isDirectory()) inspect(child); else { assert(info.isFile() && info.nlink === 1); bytes += info.size; }
    }
  };
  inspect(root); assert(bytes < 8 * 1024 * 1024 && entries < 256);
  fs.rmSync(root, { recursive: true });
}
console.log(JSON.stringify({ status: checks.every(row => row.pass) ? 'PASS' : 'FAIL', total: checks.length,
  passed: checks.filter(row => row.pass).length, fixtureRetired: !fs.existsSync(root), checks }, null, 2));
if (checks.some(row => !row.pass)) process.exitCode = 1;
