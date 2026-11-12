import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createForgePerformanceCollector, FORGE_PERFORMANCE_LIMITS, type ForgePerformanceOperationInput } from './forgePerformance';

export async function runForgePerformanceSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = async (name: string, work: () => unknown | Promise<unknown>) => { try { await work(); checks.push({ name, pass: true }); } catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) }); } };
  let time = 100;
  const create = (extra: Parameters<typeof createForgePerformanceCollector>[0]['limits'] = {}) => createForgePerformanceCollector({ component: 'backend', scope: 'owned-process', pid: 123, instanceId: 'fixture', enabled: true, now: () => time, wallNow: () => 1000 + time, limits: extra });
  await check('disabled producer does not record or measure observed work', () => {
    const c = createForgePerformanceCollector({ component: 'webview', scope: 'webview', now: () => { throw new Error('clock must not be called for disabled work'); }, wallNow: () => 1 });
    const value = {}; assert.equal(c.measureSync('ui.work', () => value), value); c.recordOperation({ name: 'ui.work', durationMs: 1, outcome: 'ok' });
    const s = c.snapshot(); assert.equal(s.enabled, false); assert.equal(s.operations.length, 0); assert.equal(s.selfOverhead.recordCalls, 0); assert.equal(s.drops.disabled, 1);
  });
  await check('sync result and exact thrown error identity are preserved', () => {
    const c = create(); const value = {}; const failure = new Error('observed');
    assert.equal(c.measureSync('sync.good', () => { time += 7; return value; }), value);
    assert.throws(() => c.measureSync('sync.bad', () => { time += 4; throw failure; }), error => error === failure);
    const s = c.snapshot(); assert.equal(s.operations.find(row => row.name === 'sync.good')?.totalMs, 7); assert.equal(s.operations.find(row => row.name === 'sync.bad')?.outcomes.error, 1);
  });
  await check('async settlement, rejection and response identity are preserved', async () => {
    const c = create(); const response = {}; const failure = new Error('async observed');
    assert.equal(await c.measureAsync('fetch.headers', async () => { await Promise.resolve(); time += 11; return response; }), response);
    await assert.rejects(c.measureAsync('fetch.error', async () => { await Promise.resolve(); time += 3; throw failure; }), error => error === failure);
    assert.equal(c.snapshot().operations.find(row => row.name === 'fetch.headers')?.totalMs, 11);
  });
  await check('operation completion is recorded once across repeated callbacks', () => {
    const c = create(); const finish = c.startOperation('request.finish', 'fixture_1'); time += 2; finish('aborted'); finish('ok');
    const s = c.snapshot(); assert.equal(s.operations[0].count, 1); assert.equal(s.operations[0].outcomes.aborted, 1); assert.equal(s.drops.duplicateFinishes, 1);
  });
  await check('pending completions cannot cross reset or disable/re-enable windows', () => {
    const c = create(); let deferredNames = 0;
    const resetSpan = c.startOperation(() => { deferredNames++; return 'old.reset'; }); c.reset(); time += 3; resetSpan();
    const disabledSpan = c.startOperation(() => { deferredNames++; return 'old.disabled'; }); c.setEnabled(false); c.setEnabled(true); time += 3; disabledSpan();
    const s = c.snapshot(); assert.equal(s.operations.length, 0); assert.equal(s.drops.staleFinishes, 2); assert.equal(deferredNames, 0);
  });
  await check('deferred names resolve at completion only and cannot break observed work', () => {
    const c = create(); let nameCalls = 0; let route = 'request.pending';
    const span = c.startOperation(() => { nameCalls++; return route; }); assert.equal(nameCalls, 0); route = 'http.GET /api/example/:id'; time += 2; span();
    assert.equal(c.snapshot().operations[0].name, route); assert.equal(nameCalls, 1);
    const broken = c.startOperation(() => { throw new Error('deferred getter failure'); }); assert.doesNotThrow(() => broken()); assert.equal(c.snapshot().drops.recorderErrors, 1);
    c.setEnabled(false); c.startOperation(() => { throw new Error('must not run disabled'); })(); assert.equal(c.isEnabled(), false); c.setEnabled(true); assert.equal(c.isEnabled(), true);
  });
  await check('invalid durations, names, outcome and private query strings are dropped', () => {
    const c = create();
    for (const input of [
      { name: 'http.GET /api/read?token=fixture_secret', durationMs: 1, outcome: 'ok' },
      { name: 'bad', durationMs: NaN, outcome: 'ok' }, { name: 'bad', durationMs: -1, outcome: 'ok' },
      { name: 'bad', durationMs: Infinity, outcome: 'ok' }, { name: 'bad', durationMs: 86_400_001, outcome: 'ok' },
      { name: 'bad', durationMs: 1, outcome: 'success' }, { name: 'bad', durationMs: 1, outcome: 'ok', correlationId: 'secret?key=x' },
    ]) c.recordOperation(input as ForgePerformanceOperationInput);
    const s = c.snapshot(); assert.equal(s.operations.length, 0); assert.equal(s.drops.invalidOperations, 7); assert.equal(JSON.stringify(s).includes('fixture_secret'), false);
  });
  await check('throwing record accessors are isolated from observed return/error', () => {
    const c = create(); const input = { get name(): string { throw new Error('recorder failure'); } } as ForgePerformanceOperationInput;
    assert.doesNotThrow(() => c.recordOperation(input)); assert.equal(c.snapshot().drops.recorderErrors, 1);
    const broken = createForgePerformanceCollector({ component: 'backend', scope: 'owned-process', enabled: true, now: () => { throw new Error('broken clock'); }, wallNow: () => NaN });
    const value = {}; assert.equal(broken.measureSync('work', () => value), value); const s = broken.snapshot(); assert.equal(s.capturedAtUnixMs, null); assert.equal(s.operations.length, 0); assert.ok(s.selfOverhead.clockFailures > 0);
  });
  await check('validated fields are captured once and invalid pending names are not retained', () => {
    const c = create(); let reads = 0;
    c.recordOperation({ get name() { reads++; return reads === 1 ? 'work' : 'secret?token=fixture_secret'; }, durationMs: 1, outcome: 'ok' });
    assert.equal(reads, 1); assert.equal(c.snapshot().operations[0].name, 'work');
    c.startOperation('x'.repeat(10_000))('ok'); assert.equal(c.snapshot().drops.invalidOperations, 1); assert.equal(JSON.stringify(c.snapshot()).includes('fixture_secret'), false);
  });
  await check('operation cardinality has one fixed hard ceiling', () => {
    const c = create(); for (let i = 0; i < 500; i++) c.recordOperation({ name: `operation.${i}`, durationMs: 1, outcome: 'ok' });
    const s = c.snapshot(); assert.equal(s.operations.length, FORGE_PERFORMANCE_LIMITS.maxOperations); assert.equal(s.drops.operationCapacity, 500 - FORGE_PERFORMANCE_LIMITS.maxOperations);
  });
  await check('slow and resource rings drop oldest with explicit overwrite counts', () => {
    const c = create({ maxSlowOperations: 2, maxResources: 2, slowOperationMs: 0 });
    for (let i = 0; i < 5; i++) { c.recordOperation({ name: 'work', durationMs: i, outcome: 'ok' }); c.recordResource({ rssBytes: i }); }
    const s = c.snapshot(); assert.deepEqual(s.recentSlowOperations.map(row => row.durationMs), [3, 4]); assert.deepEqual(s.resources.map(row => row.rssBytes), [3, 4]); assert.equal(s.drops.resourceOverwrites, 3); assert.equal(s.drops.slowOverwrites, 3);
  });
  await check('resources retain measured zero and distinguish unsupported fields as null', () => {
    const c = create(); c.recordResource({ atUnixMs: null, rssBytes: 0, fps: 60 }); const s = c.snapshot(); assert.equal(s.resources[0].rssBytes, 0); assert.equal(s.resources[0].heapUsedBytes, null); assert.equal(s.resources[0].cpuHostPercent, null); assert.equal(s.resources[0].atUnixMs, null);
    for (const bad of [{ rssBytes: -1 }, { cpuHostPercent: 101 }, { eventLoopUtilization: 1.1 }, { logicalCpuCount: 0 }, { fps: NaN }]) c.recordResource(bad);
    assert.equal(c.snapshot().drops.invalidResources, 5);
  });
  await check('histogram summaries retain exact counts and label quantile estimates', () => {
    const c = create(); for (const n of [1, 5, 20]) c.recordOperation({ name: 'work', durationMs: n, outcome: 'ok' });
    const row = c.snapshot().operations[0]; assert.equal(row.totalMs, 26); assert.equal(row.meanMs, 26 / 3); assert.equal(row.minMs, 1); assert.equal(row.maxMs, 20); assert.equal(row.p50Ms, 8); assert.equal(row.p95Ms, 20); assert.equal(row.histogram.counts.reduce((sum, n) => sum + n, 0), 3); assert.equal(row.quantileMethod, 'fixed-histogram-upper-bound');
  });
  await check('snapshot is deeply immutable and detached from retained state', () => {
    const c = create(); c.recordOperation({ name: 'work', durationMs: 1, outcome: 'ok' }); c.recordResource({ rssBytes: 10 }); const s = c.snapshot();
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.operations[0].histogram.counts) && Object.isFrozen(s.resources[0]));
    assert.throws(() => s.operations.push(s.operations[0])); assert.throws(() => { s.resources[0].rssBytes = 99; }); assert.equal(c.snapshot().resources[0].rssBytes, 10);
  });
  await check('snapshot overhead reports completed prior snapshots rather than partial current cost', () => {
    let tick = 0; const c = createForgePerformanceCollector({ component: 'webview', scope: 'webview', now: () => ++tick, wallNow: () => 1 });
    const first = c.snapshot(); assert.equal(first.selfOverhead.snapshotCalls, 0); assert.equal(first.selfOverhead.snapshotMs, 0);
    const second = c.snapshot(); assert.equal(second.selfOverhead.snapshotCalls, 1); assert.equal(second.selfOverhead.snapshotMs, 1); assert.equal(second.selfOverhead.snapshotScope, 'completed-prior-snapshots-including-serialization-and-freeze'); assert.ok(Object.isFrozen(second));
  });
  await check('serialized snapshot hard cap discloses omitted view records', () => {
    const c = create({ maxSnapshotBytes: 8192, slowOperationMs: 0 });
    for (let i = 0; i < 128; i++) { c.recordOperation({ name: `operation.${i}.${'x'.repeat(130)}`, durationMs: i + 1, outcome: 'error' }); c.recordResource({ rssBytes: i, fps: 60 }); }
    const s = c.snapshot(); assert.ok(Buffer.byteLength(JSON.stringify(s), 'utf8') <= 8192); assert.ok(s.drops.snapshotOmissions > 0); assert.equal(s.limits.maxSnapshotBytes, 8192);
  });
  await check('reset and repeated disposal release state without re-enabling work', () => {
    const c = create(); c.recordOperation({ name: 'work', durationMs: 1, outcome: 'ok' }); c.reset(); assert.equal(c.snapshot().operations.length, 0); c.dispose(); c.dispose(); c.setEnabled(true); c.recordOperation({ name: 'ignored', durationMs: 1, outcome: 'ok' }); const s = c.snapshot(); assert.equal(s.disposed, true); assert.equal(s.enabled, false); assert.equal(s.operations.length, 0); assert.equal(s.drops.disposed, 1);
  });
  await check('unsafe configuration and false attribution fail setup explicitly', () => {
    assert.throws(() => create({ maxOperations: 129 })); assert.throws(() => create({ maxSnapshotBytes: 1 }));
    assert.throws(() => createForgePerformanceCollector({ component: 'extension-host', scope: 'owned-process' }));
    assert.throws(() => createForgePerformanceCollector({ component: 'backend', scope: 'owned-process', instanceId: 'C:/private' }));
  });
  return { pass: checks.every(row => row.pass), passed: checks.filter(row => row.pass).length, total: checks.length, checks };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runForgePerformanceSelftest().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.pass) process.exitCode = 1; }).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
