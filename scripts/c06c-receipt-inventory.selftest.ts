import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDiscoveredActionReceiptCoverageInventory, getActionReceiptCoverageBuildAuthority } from '../src/lib/actionReceiptCoverageInventory';
import { FORGE_CAPABILITIES } from '../src/lib/forgeCapabilities';
import { LEDGER_QUIET_ROUTES } from '../src/lib/agentHistory';
import { buildActionReceiptCoverageCandidate } from './action-receipt-coverage-audit';

const checks: string[] = [];
const check = (name: string, task: () => void) => { task(); checks.push(name); };
const entry = (file: string) => ({ file, owners: ['fixture-owner'], categories: ['fixture-only'] });
const database = { file: 'cache.ts', owners: ['cache-owner'], category: 'sqlite-transaction' };
const additionalDatabase = { file: 'coordination.ts', owners: ['claim', 'release'], category: 'sqlite-transaction' };
const durable = { version: 1, writers: [entry('writer.ts')], hostStores: [entry('host.ts')], browserOutputs: [entry('browser.ts')], database };
const routeAuthority = { schemaVersion: 'forge.route-dispositions.v4', routes: {
  'POST /api/fixture': { owner: 'fixture', resourceClass: 'stateless-analysis', agentScopes: ['read'], disposition: 'stateless-read', workspaceMode: 'none' },
} };
const build = (authority: unknown) => buildDiscoveredActionReceiptCoverageInventory({
  routeAuthority, durableWriterAuthority: authority, capabilities: [], quietRoutes: [],
});

check('legacy database keeps count, identity and reviewed pointer', () => {
  const result = build(durable);
  assert.equal(result.surfaceCounts.sqlite, 1);
  assert.deepEqual(result.inventory.surfaces.find(surface => surface.kind === 'sqlite'), {
    id: 'sqlite:cache.ts', kind: 'sqlite', owner: 'cache-owner', sourceRef: 'config/durable-writers.json#/database',
  });
});
check('additional database is included with exact pointer and owner metadata', () => {
  const result = build({ ...durable, additionalDatabases: [additionalDatabase] });
  assert.equal(result.surfaceCounts.sqlite, 2);
  assert.equal(result.inventory.surfaces.length, 5);
  assert.deepEqual(result.inventory.surfaces.find(surface => surface.id === 'sqlite:coordination.ts'), {
    id: 'sqlite:coordination.ts', kind: 'sqlite', owner: 'claim | release', sourceRef: 'config/durable-writers.json#/additionalDatabases/0',
  });
  assert.deepEqual(getActionReceiptCoverageBuildAuthority(result)?.surfaces.get('sqlite:coordination.ts'), {
    categories: ['sqlite-transaction'], owners: ['claim', 'release'],
  });
  assert.equal(result.inventory.surfaces.find(surface => surface.id === 'sqlite:cache.ts')?.sourceRef, 'config/durable-writers.json#/database');
});
check('multiple additional owners retain array pointers under deterministic sorting', () => {
  const result = build({ ...durable, additionalDatabases: [{ ...additionalDatabase, file: 'z.ts' }, { ...additionalDatabase, file: 'a.ts' }] });
  const surfaces = result.inventory.surfaces.filter(surface => surface.kind === 'sqlite');
  assert.deepEqual(surfaces.map(surface => surface.id), ['sqlite:a.ts', 'sqlite:cache.ts', 'sqlite:z.ts']);
  assert.equal(surfaces[0].sourceRef, 'config/durable-writers.json#/additionalDatabases/1');
  assert.equal(surfaces[2].sourceRef, 'config/durable-writers.json#/additionalDatabases/0');
});
check('explicit empty additional list remains compatible with legacy authority', () => {
  assert.deepEqual(build({ ...durable, additionalDatabases: [] }).inventory, build(durable).inventory);
});
for (const value of [null, {}, 'not-an-array', 1]) {
  check(`malformed additional database container refuses: ${JSON.stringify(value)}`, () => {
    assert.throws(() => build({ ...durable, additionalDatabases: value }), /ACTION_RECEIPT_COVERAGE_AUTHORITY_INVALID.*additionalDatabases:array-required/);
  });
}
for (const value of [null, [], 'not-an-object', {}, { ...additionalDatabase, file: '' }, { ...additionalDatabase, file: ' trailing ' },
  { ...additionalDatabase, owners: [] }, { ...additionalDatabase, owners: [''] }, { ...additionalDatabase, owners: 'owner' },
  { ...additionalDatabase, category: '' }, { ...additionalDatabase, category: [] }]) {
  check(`malformed additional database record refuses: ${JSON.stringify(value)}`, () => {
    assert.throws(() => build({ ...durable, additionalDatabases: [value] }), /ACTION_RECEIPT_COVERAGE_AUTHORITY_INVALID/);
  });
}
check('duplicate additional database owner names refuse', () => {
  assert.throws(() => build({ ...durable, additionalDatabases: [{ ...additionalDatabase, owners: ['claim', 'claim'] }] }), /ACTION_RECEIPT_COVERAGE_SURFACE_OWNER_DUPLICATE/);
});
check('duplicate additional database identity refuses', () => {
  assert.throws(() => build({ ...durable, additionalDatabases: [additionalDatabase, additionalDatabase] }), /ACTION_RECEIPT_COVERAGE_SURFACE_ID_DUPLICATE/);
});
check('additional database cannot duplicate legacy database identity', () => {
  assert.throws(() => build({ ...durable, additionalDatabases: [database] }), /ACTION_RECEIPT_COVERAGE_SURFACE_ID_DUPLICATE/);
});
check('inventory discovery does not mutate source authority', () => {
  const authority = { ...durable, additionalDatabases: [additionalDatabase] };
  const before = JSON.stringify(authority);
  build(authority);
  assert.equal(JSON.stringify(authority), before);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readAuthority = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(root, 'config', name), 'utf8'));
const productionInventory = buildDiscoveredActionReceiptCoverageInventory({
  routeAuthority: readAuthority('forge-route-dispositions.json'),
  durableWriterAuthority: readAuthority('durable-writers.json'), capabilities: FORGE_CAPABILITIES, quietRoutes: LEDGER_QUIET_ROUTES,
});
check('real durable authority produces both source-coordinator surfaces without claiming receipt policy', () => {
  const result = productionInventory;
  const sql = result.inventory.surfaces.find(surface => surface.id === 'sqlite:src/server/sharedSourceCoordinator.ts');
  assert.ok(sql);
  assert.equal(sql.sourceRef, 'config/durable-writers.json#/additionalDatabases/0');
  assert.equal('policy' in sql, false);
  assert.ok(result.inventory.surfaces.some(surface => surface.id === 'filesystem-writer:src/server/sharedSourceCoordinator.ts'));
  assert.equal(result.surfaceCounts.sqlite, 2);
  assert.equal(result.inventory.surfaces.find(surface => surface.id === 'sqlite:src/lib/db.ts')?.sourceRef, 'config/durable-writers.json#/database');
});
check('candidate classifies authoritative coordination as required durable mutation', () => {
  const candidate = buildActionReceiptCoverageCandidate(productionInventory);
  for (const kind of ['filesystem-writer', 'sqlite']) {
    const surface = candidate.surfaces.find(entry => entry.id === `${kind}:src/server/sharedSourceCoordinator.ts`);
    assert.ok(surface);
    assert.equal(surface.semanticClass, 'durable-local-mutation');
    assert.equal(surface.policy, 'receipt-required');
    assert.deepEqual(surface.effects, ['filesystem-write']);
    assert.equal(surface.integrationBatch, 'W3B1');
  }
  const cache = candidate.surfaces.find(entry => entry.id === 'sqlite:src/lib/db.ts');
  assert.equal(cache?.semanticClass, 'fixture-cache');
  assert.equal(cache?.policy, 'separately-governed');
});

for (const name of checks) console.log(`PASS ${name}`);
console.log(`C06c receipt inventory: ${checks.length}/${checks.length} passed`);
