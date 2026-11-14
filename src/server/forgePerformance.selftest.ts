/** Deterministic injected producer/Inspector tests: no real profiling, ports or files. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createForgeBackendPerformance, summarizeForgeCpuProfile, forgePerformanceApiOperationName, forgePerformanceHasNegativeDataResult, FORGE_BACKEND_PERFORMANCE_LIMITS, type ForgePerformanceTimer, type ForgePerformanceTimers, type ForgePerformanceInspectorSession, type ForgeBackendPerformanceOptions, type ForgePerformanceCollectionOptions } from './forgePerformance';
import { createForgePerformanceCollector, FORGE_CPU_PROFILE_LIMITS, type ForgeCpuProfileOptions } from '../lib/forgePerformance';
import * as nativePerformanceApi from './forgePerformance';
import type { NativeBrokerActor, NativeBrokerReadRequest, NativeBrokerStartRequest, NativeBrokerStopRequest, NativeBrokerResult, NativeBrokerView, NativePerformanceBroker } from './nativePerformanceBroker';

class FakeTimers implements ForgePerformanceTimers {
  now = 1000; private sequence = 0;
  readonly entries = new Map<number, { id: number; due: number; callback: () => void; unrefCalled: boolean }>();
  set = (callback: () => void, delayMs: number): ForgePerformanceTimer => {
    const row = { id: ++this.sequence, due: this.now + delayMs, callback, unrefCalled: false };
    this.entries.set(row.id, row);
    return { id: row.id, unref: () => { row.unrefCalled = true; } } as ForgePerformanceTimer;
  };
  clear = (timer: ForgePerformanceTimer) => { this.entries.delete((timer as { id: number }).id); };
  advance(ms: number) {
    const target = this.now + ms;
    for (let guard = 0; guard < 1000; guard++) {
      const next = [...this.entries.values()].filter(row => row.due <= target).sort((a, b) => a.due - b.due)[0];
      if (!next) { this.now = target; return; }
      this.entries.delete(next.id); this.now = next.due; next.callback();
    }
    throw new Error('Fake timer bound exceeded.');
  }
  delayed(ms: number) { this.now += ms; const due = [...this.entries.values()].filter(row => row.due <= this.now); for (const row of due) if (this.entries.delete(row.id)) row.callback(); }
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const appRoot = path.resolve('owned-performance-fixture');
const rawProfile = () => ({ startTime: 1000, endTime: 6000,
  nodes: [
    { id: 1, callFrame: { functionName: 'validate', url: path.join(appRoot, 'src', 'validate.ts'), lineNumber: 4, columnNumber: 2 } },
    { id: 2, callFrame: { functionName: 'parse', url: path.resolve('private-outside-a.ts'), lineNumber: 1, columnNumber: 0 } },
    { id: 3, callFrame: { functionName: 'parse', url: path.resolve('private-outside-b.ts'), lineNumber: 1, columnNumber: 0 } },
  ], samples: [1, 1, 2, 3], timeDeltas: [1000, 2000, 1000, 1000] });
interface FakeSession extends ForgePerformanceInspectorSession { calls: string[]; disconnected: boolean }
function fixture(extra: Partial<ForgeBackendPerformanceOptions> = {}, failMethod?: string) {
  const clock = new FakeTimers(); let pid = 123; let cpu = { user: 1_000_000, system: 200_000 }; let loop = { idle: 100, active: 20 }; let reads = 0;
  const sessions: FakeSession[] = [];
  const makeSession = () => {
    const session: FakeSession = { calls: [], disconnected: false,
      connect() { this.calls.push('connect'); },
      post(method, _params, callback) { this.calls.push(method); if (method === failMethod) callback(new Error('injected private-path failure')); else callback(null, method === 'Profiler.stop' ? { profile: rawProfile() } : {}); },
      disconnect() { this.calls.push('disconnect'); this.disconnected = true; },
    }; sessions.push(session); return session;
  };
  const producer = createForgeBackendPerformance({ now: () => clock.now, wallNow: () => 100_000 + clock.now, timers: clock,
    resources: { pid: () => pid, cpuUsage: () => ({ ...cpu }), memoryUsage: () => { reads++; return { rss: 1000, heapUsed: 400, heapTotal: 700, external: 30, arrayBuffers: 10 }; }, uptime: () => 10, logicalCpuCount: () => 4, eventLoopUtilization: () => ({ ...loop }) },
    inspectorSession: makeSession, sourceRoot: appRoot, ...extra });
  return { producer, clock, sessions, reads: () => reads, setPid: (value: number) => { pid = value; }, setCpu: (value: typeof cpu) => { cpu = value; }, setLoop: (value: typeof loop) => { loop = value; } };
}

export async function runForgeBackendPerformanceSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = async (name: string, work: () => unknown | Promise<unknown>) => { try { await work(); checks.push({ name, pass: true }); } catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) }); } };
  await check('pre-route rejection buckets survive the actual collector grammar without raw request data', () => {
    const collector = createForgePerformanceCollector({ component: 'backend', scope: 'owned-process', enabled: true });
    const rejected = forgePerformanceApiOperationName('GET', undefined); assert.equal(rejected, 'api.GET unmatched');
    collector.recordOperation({ name: rejected, outcome: 'error', durationMs: 5 });
    assert.equal(collector.snapshot().operations[0].outcomes.error, 1);
    assert.equal(forgePerformanceApiOperationName('POST', '/api/workspaces/:id'), 'api.POST /api/workspaces/:id');
    assert.equal(forgePerformanceApiOperationName('caller_secret', '/api/../private'), 'api.OTHER unmatched');
    assert.equal(forgePerformanceApiOperationName('GET', '/api/read?token=fixture_secret'), 'api.GET unmatched');
    for (const [method, template] of [['caller_secret', '/api/../private'], ['GET', '/api/read?token=fixture_secret'], ['GET', '/api/read//fixture_secret'], ['GET', '/api/read/fixture_secret\n']]) collector.recordOperation({ name: forgePerformanceApiOperationName(method, template), outcome: 'error', durationMs: 5 });
    const snapshot = collector.snapshot(); assert.equal(snapshot.drops.invalidOperations, 0);
    assert.equal(JSON.stringify(snapshot).includes('fixture_secret'), false);
    assert.equal(JSON.stringify(snapshot).includes('caller_secret'), false);
  });
  await check('negative-result metadata never invokes response accessors or changes serialization', () => {
    const body = () => { let reads = 0; return { value: { get ok() { reads++; return reads === 1; }, get success() { reads++; return true; } }, reads: () => reads }; };
    const baseline = body(); const expected = JSON.stringify(baseline.value);
    for (const enabled of [false, true]) {
      const observed = body();
      if (enabled) assert.equal(forgePerformanceHasNegativeDataResult(observed.value), false);
      assert.equal(observed.reads(), 0); assert.equal(JSON.stringify(observed.value), expected); assert.equal(observed.reads(), baseline.reads());
    }
    assert.equal(forgePerformanceHasNegativeDataResult({ ok: false }), true); assert.equal(forgePerformanceHasNegativeDataResult({ success: false }), true);
    assert.equal(forgePerformanceHasNegativeDataResult(Object.create({ ok: false })), false);
    let descriptorTraps = 0;
    assert.equal(forgePerformanceHasNegativeDataResult(new Proxy({ ok: false }, { getOwnPropertyDescriptor() { descriptorTraps++; return { value: false, configurable: true }; } })), false);
    assert.equal(descriptorTraps, 0, 'telemetry must not invoke Proxy descriptor traps');
    assert.equal(forgePerformanceHasNegativeDataResult(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('descriptor unavailable'); } })), false);
    const revoked = Proxy.revocable({}, {}); revoked.revoke(); assert.equal(forgePerformanceHasNegativeDataResult(revoked.proxy), false);
  });
  await check('defaults create no sampler, memory read or Inspector session', async () => {
    const f = fixture(); assert.equal(f.clock.entries.size, 0); assert.equal(f.reads(), 0); assert.equal(f.producer.sampleResources(), false); assert.equal((await f.producer.captureCpuProfile()).ok, false); assert.equal(f.sessions.length, 0); assert.equal(f.producer.snapshot().producer.pid, 123); await f.producer.dispose();
  });
  await check('collection measures actual process intervals with both CPU normalizations', async () => {
    const f = fixture(); assert.equal(f.producer.startCollection({ durationMs: 5000 }).ok, true); assert.equal(f.producer.snapshot().resources[0].cpuOneCorePercent, null);
    f.clock.advance(1000); f.setCpu({ user: 2_200_000, system: 500_000 }); f.setLoop({ idle: 400, active: 120 }); assert.equal(f.producer.sampleResources(), true);
    const sample = f.producer.snapshot().resources.at(-1)!; assert.equal(sample.cpuOneCorePercent, 150); assert.equal(sample.cpuHostPercent, 37.5); assert.equal(sample.eventLoopUtilization, .25); assert.equal(sample.rssBytes, 1000); assert.equal(sample.jsHeapUsedBytes, null); assert.equal(f.producer.status().coverage.childProcesses, 'excluded'); await f.producer.dispose();
  });
  await check('resource sampling is hard throttled and failed samples stay unknown', async () => {
    const f = fixture(); f.producer.startCollection(); for (let i = 0; i < 100; i++) f.producer.sampleResources(); assert.equal(f.reads(), 1); assert.equal(f.producer.status().throttledSamples, 100);
    f.clock.advance(1000); f.setCpu({ user: 1, system: 1 }); f.producer.sampleResources(); assert.equal(f.producer.snapshot().resources.at(-1)!.cpuOneCorePercent, null); assert.equal(f.producer.status().counterResets, 1); await f.producer.dispose();
  });
  await check('replacement PID is refused rather than relabeled as the original backend', async () => {
    const f = fixture(); f.producer.startCollection(); f.setPid(999); f.clock.advance(1000); assert.equal(f.producer.sampleResources(), false); assert.equal(f.producer.status().lastResourceError, 'producer-identity-changed'); assert.equal(f.producer.snapshot().producer.pid, 123); assert.equal(f.producer.snapshot().resources.length, 1); await f.producer.dispose();
  });
  await check('bounded lease stops sampling, stale callbacks cannot stop a new lease', async () => {
    const f = fixture(); f.producer.startCollection({ durationMs: 1000 }); const staleLease = [...f.clock.entries.values()].find(row => row.due === f.clock.now + 1000)!.callback;
    f.producer.startCollection({ durationMs: 3000 }); staleLease(); assert.equal(f.producer.status().collectionActive, true); assert.ok([...f.clock.entries.values()].every(row => row.unrefCalled));
    f.clock.advance(3000); assert.equal(f.producer.status().collectionActive, false); assert.equal(f.clock.entries.size, 0); assert.equal(f.producer.snapshot().enabled, false); await f.producer.dispose();
  });
  await check('long workload collection retains fixed rings and the full observation window', async () => {
    const f = fixture(); assert.equal(f.producer.startCollection({ durationMs: 900_000, intervalMs: 1000 }).ok, true); f.clock.advance(899_000); assert.equal(f.producer.status().collectionActive, true); assert.equal(f.producer.snapshot().resources.length, 120); assert.ok(f.producer.snapshot().drops.resourceOverwrites > 0); f.clock.advance(1000); assert.equal(f.producer.status().collectionActive, false); await f.producer.dispose();
  });
  await check('delayed collection stop and optional delay monitoring are explicit', async () => {
    let enabled = 0; let disabled = 0; const f = fixture({ delayHistogram: () => ({ enable: () => { enabled++; }, disable: () => { disabled++; }, reset() {}, percentile: () => 2_000_000, max: 3_000_000, count: 1 }) });
    f.producer.startCollection({ durationMs: 1000, eventLoopDelay: true }); assert.equal(enabled, 1); assert.equal(f.producer.snapshot().resources[0].eventLoopDelayP95Ms, 2); f.clock.delayed(1500); assert.equal(f.producer.status().collectionStopDelayMs, 500); assert.equal(disabled, 1); await f.producer.dispose();
  });
  await check('invalid collection bounds and monitoring errors cannot alter observed work', async () => {
    const f = fixture({ delayHistogram: () => { throw new Error('unavailable'); } });
    for (const options of [{ durationMs: 900_001 }, { intervalMs: 999 }, { intervalMs: Infinity }, { durationMs: 0 }, { extra: true }]) assert.equal(f.producer.startCollection(options as unknown as ForgePerformanceCollectionOptions).ok, false);
    assert.equal(f.producer.startCollection({ eventLoopDelay: true }).ok, false); assert.equal(f.clock.entries.size, 0); const result = {}; assert.equal(f.producer.collector.measureSync('work', () => result), result); await f.producer.dispose();
  });
  await check('failed collection cleanup retains ownership and refuses accumulating restarts', async () => {
    const clock = new FakeTimers(); let failClear = true;
    const f = fixture({ now: () => clock.now, timers: { set: clock.set, clear(handle) { if (failClear) throw new Error('clear failed'); clock.clear(handle); } } });
    assert.equal(f.producer.startCollection().ok, true); assert.equal(f.producer.status().ownedTimerCount, 2); f.producer.stopCollection();
    assert.equal(f.producer.status().collectionCleanupUnconfirmed, true); assert.equal(f.producer.status().failedTimerCount, 2);
    assert.equal(f.producer.startCollection().ok, false); assert.equal(f.producer.status().ownedTimerCount, 2); assert.equal(clock.entries.size, 2);
    failClear = false; await f.producer.dispose(); assert.equal(f.producer.status().ownedTimerCount, 0); assert.equal(f.producer.status().collectionCleanupUnconfirmed, false); assert.equal(clock.entries.size, 0);
  });
  await check('failed histogram disable remains visible and owned until confirmed cleanup', async () => {
    let failDisable = true; let enables = 0;
    const f = fixture({ delayHistogram: () => ({ enable() { enables++; }, disable() { if (failDisable) throw new Error('disable failed'); }, reset() {}, percentile: () => 1, max: 1, count: 1 }) });
    f.producer.startCollection({ eventLoopDelay: true }); f.producer.stopCollection();
    assert.equal(f.producer.status().eventLoopDelayMonitoring, true); assert.equal(f.producer.status().collectionCleanupUnconfirmed, true); assert.equal(f.producer.startCollection({ eventLoopDelay: true }).ok, false); assert.equal(enables, 1);
    failDisable = false; await f.producer.dispose(); assert.equal(f.producer.status().eventLoopDelayMonitoring, false); assert.equal(f.producer.status().collectionCleanupUnconfirmed, false);
  });
  await check('profile options fail closed before creating an Inspector', async () => {
    const f = fixture({ profilingEnabled: true });
    for (const options of [{ durationMs: 99 }, { durationMs: 5001 }, { samplingIntervalMicros: 999 }, { maxFunctions: 65 }, { arbitrary: true }]) assert.equal((await f.producer.captureCpuProfile(options as unknown as ForgeCpuProfileOptions)).ok, false);
    const abort = new AbortController(); abort.abort(); const cancelled = await f.producer.captureCpuProfile({ signal: abort.signal }); assert.equal(cancelled.ok, false); assert.equal(f.sessions.length, 0); await f.producer.dispose();
  });
  await check('bounded current-backend profile emits sampled functions without raw private URLs', async () => {
    const f = fixture({ profilingEnabled: true }); const pending = f.producer.captureCpuProfile({ durationMs: 100 }); await flush(); assert.equal(f.producer.status().profileActive, true); f.clock.advance(100); const result = await pending;
    assert.equal(result.ok, true); if (result.ok === true) { assert.equal(result.producer.pid, 123); assert.equal(result.functions[0].selfSamples, 2); assert.equal(result.functions[0].selfSampleMicros, 3000); assert.equal(result.functions[0].module, 'src/validate.ts'); assert.equal(result.functions[0].line, 5); assert.equal(result.functions.length, 3); assert.equal(JSON.stringify(result).includes('private-outside'), false); assert.equal(result.sampleCount, 4); assert.equal(result.observedDurationMs, 100); }
    assert.deepEqual(f.sessions[0].calls, ['connect', 'Profiler.enable', 'Profiler.setSamplingInterval', 'Profiler.start', 'Profiler.stop', 'Profiler.disable', 'disconnect']); assert.equal(f.clock.entries.size, 0); assert.equal(f.producer.status().profileCapturesSucceeded, 1); await f.producer.dispose();
  });
  await check('overlap and cancellation clean the same session exactly once', async () => {
    const f = fixture({ profilingEnabled: true }); const abort = new AbortController(); const pending = f.producer.captureCpuProfile({ durationMs: 100, signal: abort.signal }); await flush();
    const overlap = await f.producer.captureCpuProfile({ durationMs: 100 }); assert.equal(overlap.ok, false); if (overlap.ok === false) assert.equal(overlap.code, 'PROFILE_BUSY');
    abort.abort(); const result = await pending; assert.equal(result.ok, false); if (result.ok === false) assert.equal(result.code, 'PROFILE_ABORTED'); assert.equal(f.sessions[0].calls.filter(call => call === 'Profiler.stop').length, 1); assert.equal(f.sessions[0].disconnected, true); assert.equal(f.clock.entries.size, 0); await f.producer.dispose();
  });
  await check('signal admission and listener failures cannot strand an active capture', async () => {
    const f = fixture({ profilingEnabled: true }); const incomplete = await f.producer.captureCpuProfile({ durationMs: 100, signal: { aborted: false, addEventListener() {} } as unknown as AbortSignal });
    assert.equal(incomplete.ok, false); if (incomplete.ok === false) assert.equal(incomplete.code, 'PROFILE_INPUT_INVALID'); assert.equal(f.sessions.length, 0);
    let removed = 0;
    const registration = await f.producer.captureCpuProfile({ durationMs: 100, signal: { aborted: false, addEventListener() { throw new Error('listener registration failed'); }, removeEventListener() { removed++; } } as unknown as AbortSignal });
    assert.equal(registration.ok, false); assert.equal(removed, 1); assert.equal(f.producer.status().profileActive, false); assert.equal(f.sessions.length, 0); await f.producer.dispose();
  });
  await check('throwing signal removal cannot skip Inspector cleanup or be forgotten', async () => {
    const f = fixture({ profilingEnabled: true }); let removalFails = true;
    const signal = { aborted: false, addEventListener() {}, removeEventListener() { if (removalFails) throw new Error('listener removal failed'); } } as unknown as AbortSignal;
    const pending = f.producer.captureCpuProfile({ durationMs: 100, signal }); await flush(); f.clock.advance(100); const result = await pending;
    assert.equal(result.ok, false); if (result.ok === false) assert.equal(result.code, 'PROFILE_CLEANUP_UNCONFIRMED');
    assert.ok(f.sessions[0].calls.includes('Profiler.stop') && f.sessions[0].calls.includes('Profiler.disable')); assert.equal(f.sessions[0].disconnected, true); assert.equal(f.producer.status().profileActive, false); assert.equal(f.producer.status().abortListenerCleanupUnconfirmed, true);
    await f.producer.dispose(); assert.equal(f.producer.status().abortListenerCleanupUnconfirmed, true); removalFails = false; await f.producer.dispose(); assert.equal(f.producer.status().abortListenerCleanupUnconfirmed, false);
  });
  await check('profile meter enforces cooldown even after reset', async () => {
    const f = fixture({ profilingEnabled: true }); const pending = f.producer.captureCpuProfile({ durationMs: 100 }); await flush(); f.clock.advance(100); await pending;
    f.producer.reset(); const limited = await f.producer.captureCpuProfile({ durationMs: 100 }); assert.equal(limited.ok, false); if (limited.ok === false) assert.equal(limited.code, 'PROFILE_RATE_LIMITED'); assert.equal(f.sessions.length, 1); assert.equal(f.producer.status().profileRateLimited, 1);
    f.clock.advance(FORGE_BACKEND_PERFORMANCE_LIMITS.profileCooldownMs); const second = f.producer.captureCpuProfile({ durationMs: 100 }); await flush(); f.clock.advance(100); assert.equal((await second).ok, true); assert.equal(f.sessions.length, 2); await f.producer.dispose();
  });
  await check('protocol failure disables and disconnects without returning private failure text', async () => {
    const f = fixture({ profilingEnabled: true }, 'Profiler.setSamplingInterval'); const result = await f.producer.captureCpuProfile({ durationMs: 100 }); assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes('private-path'), false); assert.equal(f.sessions[0].disconnected, true); assert.ok(f.sessions[0].calls.includes('Profiler.disable')); assert.equal(f.clock.entries.size, 0); await f.producer.dispose();
  });
  await check('a missing Inspector callback has a bounded failure and cleanup path', async () => {
    const clock = new FakeTimers(); const calls: string[] = [];
    const f = fixture({ timers: clock, now: () => clock.now, profilingEnabled: true, inspectorSession: () => ({ connect() { calls.push('connect'); }, post(method, _params, callback) { calls.push(method); if (method !== 'Profiler.enable') callback(null, {}); }, disconnect() { calls.push('disconnect'); } }) });
    const pending = f.producer.captureCpuProfile({ durationMs: 100 }); await flush(); clock.advance(FORGE_BACKEND_PERFORMANCE_LIMITS.inspectorCommandTimeoutMs); const result = await pending;
    assert.equal(result.ok, false); assert.ok(calls.includes('Profiler.disable')); assert.ok(calls.includes('disconnect')); assert.equal(clock.entries.size, 0); await f.producer.dispose();
  });
  await check('unconfirmed cleanup blocks another profile while observed work remains usable', async () => {
    const f = fixture({ profilingEnabled: true }, 'Profiler.disable'); const pending = f.producer.captureCpuProfile({ durationMs: 100 }); await flush(); f.clock.advance(100); const result = await pending; assert.equal(result.ok, false); if (result.ok === false) assert.equal(result.code, 'PROFILE_CLEANUP_UNCONFIRMED');
    assert.equal(f.producer.status().profileCleanupUnconfirmed, true); assert.equal(f.sessions[0].disconnected, true); const again = await f.producer.captureCpuProfile({ durationMs: 100 }); assert.equal(again.ok, false); if (again.ok === false) assert.equal(again.code, 'PROFILE_CLEANUP_UNCONFIRMED');
    const value = {}; assert.equal(f.producer.collector.measureSync('work', () => value), value); await f.producer.dispose();
  });
  await check('disposal and policy disable cancel captures and leave no timers', async () => {
    const f = fixture({ profilingEnabled: true }); f.producer.startCollection(); const pending = f.producer.captureCpuProfile({ durationMs: 100 }); await flush(); await f.producer.dispose(); await f.producer.dispose(); assert.equal((await pending).ok, false); assert.equal(f.producer.status().disposed, true); assert.equal(f.clock.entries.size, 0); assert.equal(f.sessions[0].disconnected, true); assert.equal((await f.producer.captureCpuProfile()).ok, false);
    const g = fixture({ profilingEnabled: true }); const other = g.producer.captureCpuProfile({ durationMs: 100 }); await flush(); g.producer.setProfilingEnabled(false); assert.equal((await other).ok, false); assert.equal(g.sessions[0].disconnected, true); await g.producer.dispose();
  });
  await check('summary bounds disclose omitted samples/functions and unknown timing', () => {
    const profile = rawProfile(); profile.samples = Array.from({ length: FORGE_CPU_PROFILE_LIMITS.maxSamples + 7 }, () => 1); profile.timeDeltas = [];
    const result = summarizeForgeCpuProfile(profile, { producer: { component: 'backend', scope: 'owned-process', pid: 123, instanceId: null }, sourceRoot: appRoot, durationMs: 100, observedDurationMs: 200, samplingIntervalMicros: 1000, maxFunctions: 1 });
    assert.equal(result.omitted.samples, 7); assert.equal(result.scannedSampleCount, FORGE_CPU_PROFILE_LIMITS.maxSamples); assert.equal(result.functions[0].selfSampleMicros, null); assert.equal(result.omitted.invalidDeltas, FORGE_CPU_PROFILE_LIMITS.maxSamples); assert.equal(result.delayedStopMs, 100); assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') <= FORGE_CPU_PROFILE_LIMITS.maxOutputBytes);
    assert.throws(() => summarizeForgeCpuProfile({ nodes: [], samples: {} }, { producer: result.producer, sourceRoot: appRoot, durationMs: 100, observedDurationMs: null, samplingIntervalMicros: 1000, maxFunctions: 1 }));
  });
  checks.push(...(await runForgeNativePerformanceAdapterSelftest()).checks);
  return { pass: checks.every(row => row.pass), passed: checks.filter(row => row.pass).length, total: checks.length, checks };
}

/** Public adapter contract only. Real HTTP and same-capture replay remain separate required gates. */
export async function runForgeNativePerformanceAdapterSelftest() {
  type Operation = 'read' | 'start' | 'stop';
  type Ownership = 'none' | 'self' | 'other' | 'operator';
  type Report = { schemaVersion: string; operation: Operation; ok: boolean; code?: string;
    availability: NativeBrokerView['availability']; unavailableReason: NativeBrokerView['unavailableReason'];
    ownership: Ownership; status: Readonly<NativeBrokerView> | null };
  type Response = { httpStatus: number; body: Report };
  type Adapter = { read(request: NativeBrokerReadRequest): Promise<Response>; start(request: NativeBrokerStartRequest): Promise<Response>; stop(request: NativeBrokerStopRequest): Promise<Response> };
  type ProjectedBroker = NativePerformanceBroker & { ownership(actor: NativeBrokerActor): Ownership };
  type Factory = (options: { broker?: ProjectedBroker }) => Adapter;
  const factory = (nativePerformanceApi as unknown as { createForgeNativePerformanceAdapter?: Factory }).createForgeNativePerformanceAdapter;
  const checks: Array<{ name: string; pass: boolean; detail?: string; blocked?: boolean }> = [];
  const check = async (name: string, work: () => void | Promise<void>, prerequisite = true) => {
    if (prerequisite && typeof factory !== 'function') {
      checks.push({ name, pass: false, blocked: true, detail: 'BLOCKED: native public adapter export absent; behavior not exercised.' }); return;
    }
    try { await work(); checks.push({ name, pass: true }); }
    catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) }); }
  };
  const actor: NativeBrokerActor = { kind: 'agent', id: 'private_adapter_actor_A', isCurrent: () => true };
  const backendInstanceId = 'backend_instance_adapter_01', nativeInstanceId = 'native_instance_adapter_01', captureId = 'capture_instance_adapter_01';
  const request = { actor, expectedBackendInstanceId: backendInstanceId, expectedNativeInstanceId: nativeInstanceId };
  const snapshot = createForgePerformanceCollector({ component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: nativeInstanceId }).snapshot();
  const native: NonNullable<NativeBrokerView['native']> = { schemaVersion: 'forge.native-performance.status.v1',
    producer: { component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: nativeInstanceId },
    disposed: false, collectionActive: true, captureId, collectionStartedAtUnixMs: 1000, collectionExpiresAtUnixMs: 61000,
    intervalMs: 2000, eventLoopDelayMonitoring: false, resourceSamples: 0, resourceErrors: 0, throttledSamples: 0,
    counterResets: 0, sampleOverheadMs: 0, lastResourceError: null, collectionStopDelayMs: null,
    collectionCleanupUnconfirmed: false, ownedTimerCount: 2, failedTimerCount: 0, lastStopReason: null };
  const status: Readonly<NativeBrokerView> = Object.freeze({ schemaVersion: 'forge.native-performance.broker.v1', backendInstanceId,
    availability: 'ready', unavailableReason: null, native, pending: null, cancellation: 'none', cleanupUnconfirmed: false,
    orphaned: false, captureOwned: true, readSubscribers: 0, snapshot, snapshotAgeMs: 17, lastRefreshOutcome: 'ok',
    rejectedMessages: 0, lateResults: 0, droppedSnapshots: 0, timerCleanupUnconfirmed: false });
  const fixture = (result: NativeBrokerResult = { ok: true, status }, ownership: Ownership = 'self') => {
    const calls: Array<{ operation: Operation; request: NativeBrokerReadRequest }> = [];
    const broker: ProjectedBroker = { status: () => status, ownership: () => ownership,
      read: async value => { calls.push({ operation: 'read', request: value }); return result; },
      start: async value => { calls.push({ operation: 'start', request: value }); return result; },
      stop: async value => { calls.push({ operation: 'stop', request: value }); return result; }, retire: () => undefined };
    return { broker, calls, api: () => factory!({ broker }) };
  };
  const report = (response: Response, operation: Operation, expectedStatus = 200) => {
    assert.equal(response.httpStatus, expectedStatus); assert.equal(response.body.schemaVersion, 'forge.native-performance.report.v1');
    assert.equal(response.body.operation, operation);
    assert.deepEqual(Object.keys(response.body).sort(), ['schemaVersion', 'operation', 'ok', 'availability', 'unavailableReason', 'ownership', 'status',
      ...(Object.hasOwn(response.body, 'code') ? ['code'] : [])].sort());
    if (Object.hasOwn(response.body, 'code')) assert.equal(typeof response.body.code, 'string');
  };
  await check('native public adapter prerequisite exists (absence is not a runtime defect)', () => assert.equal(typeof factory, 'function'), false);
  await check('native absent transport read is truthful unavailable with null status and no identity', async () => {
    const response = await factory!({}).read({ actor }); report(response, 'read');
    assert.equal(response.body.ok, true); assert.equal(response.body.availability, 'unavailable');
    assert.equal(response.body.unavailableReason, 'transport-absent'); assert.equal(response.body.ownership, 'none'); assert.equal(response.body.status, null);
    assert.equal(Object.hasOwn(response.body, 'code'), false);
    assert(!JSON.stringify(response.body).includes(backendInstanceId)); assert(!JSON.stringify(response.body).includes(nativeInstanceId));
  });
  await check('native transport-absent broker read remains unavailable discovery rather than a failed refresh or fabricated identity', async () => {
    const unavailable: Readonly<NativeBrokerView> = { ...status, availability: 'unavailable', unavailableReason: 'transport-absent',
      native: null, snapshot: null, snapshotAgeMs: null, captureOwned: false };
    const f = fixture({ ok: false, code: 'NATIVE_PERFORMANCE_UNAVAILABLE', status: unavailable }, 'none');
    f.broker.status = () => unavailable;
    const response = await f.api().read({ actor }); report(response, 'read');
    assert.equal(response.body.ok, true); assert.equal(response.body.status, null); assert.equal(response.body.ownership, 'none');
    assert.equal(response.body.availability, 'unavailable'); assert.equal(response.body.unavailableReason, 'transport-absent');
    assert.equal(Object.hasOwn(response.body, 'code'), false); assert(!JSON.stringify(response.body).includes(backendInstanceId));
  });
  for (const operation of ['start', 'stop'] as const) await check(`native absent transport ${operation} is unavailable failure, never accepted`, async () => {
    const api = factory!({}); const response = operation === 'start' ? await api.start(request) : await api.stop({ ...request, captureId });
    report(response, operation, 503); assert.equal(response.body.ok, false); assert.equal(response.body.code, 'NATIVE_PERFORMANCE_UNAVAILABLE');
    assert.equal(response.body.status, null); assert.equal(response.body.ownership, 'none');
  });
  await check('native read preserves same capture, snapshot, freshness, unknown values and shared-process coverage', async () => {
    const f = fixture(); const response = await f.api().read({ actor }); report(response, 'read');
    assert.equal(response.body.ok, true); assert.equal(response.body.status?.native?.captureId, captureId);
    assert.deepEqual(response.body.status?.snapshot, snapshot); assert.equal(response.body.status?.snapshotAgeMs, 17);
    assert.equal(response.body.status?.snapshot?.producer.scope, 'shared-process');
    assert.equal(response.body.status?.snapshot?.coverage.cpuAttribution, 'process-interval-not-exclusive-operation');
    assert.equal(response.body.status?.native?.lastResourceError, null); assert.equal(response.body.ownership, 'self');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].operation, 'read'); assert.equal(f.calls[0].request.actor, actor);
  });
  for (const operation of ['start', 'stop'] as const) await check(`native ${operation} masks retained snapshot and preserves exact ACK identity`, async () => {
    const f = fixture(); const abort = new AbortController();
    const response = operation === 'start' ? await f.api().start({ ...request, signal: abort.signal, options: { durationMs: 1000, intervalMs: 1000, eventLoopDelay: false } })
      : await f.api().stop({ ...request, captureId, signal: abort.signal });
    report(response, operation); assert.equal(response.body.ok, true); assert.equal(response.body.status?.native?.captureId, captureId);
    assert.equal(response.body.status?.snapshot, null); assert.equal(response.body.status?.snapshotAgeMs, null);
    assert.equal(status.snapshot, snapshot, 'projection must not mutate the broker read cache');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].operation, operation); assert.equal(f.calls[0].request.signal, abort.signal);
    assert.equal((f.calls[0].request as NativeBrokerStartRequest).expectedBackendInstanceId, backendInstanceId);
    assert.equal((f.calls[0].request as NativeBrokerStartRequest).expectedNativeInstanceId, nativeInstanceId);
    if (operation === 'stop') assert.equal((f.calls[0].request as NativeBrokerStopRequest).captureId, captureId);
  });
  for (const ownership of ['none', 'self', 'other', 'operator'] as const) await check(`native report takes relative ${ownership} from trusted broker projection, never captureOwned`, async () => {
    const f = fixture({ ok: true, status }, ownership); const response = await f.api().read({ actor });
    report(response, 'read');
    assert.equal(status.captureOwned, true); assert.equal(response.body.ownership, ownership);
  });
  for (const [suffix, httpStatus] of [
    ['INPUT_INVALID', 400], ['BUSY', 409], ['CAPTURE_MISMATCH', 409], ['IDENTITY_MISMATCH', 409], ['PREEMPTED', 409], ['CLEANUP_UNCONFIRMED', 409],
    ['DISPOSED', 503], ['UNAVAILABLE', 503], ['RETIRED', 503], ['AUTHORITY_REVOKED', 403], ['NOT_OWNER', 403], ['CONTROL_TIMEOUT', 408],
    ['ABORTED', 408], ['PROTOCOL_ERROR', 502], ['READER_LIMIT', 429], ['START_FAILED', 500],
  ] as const) await check(`native closed ${suffix} result maps to HTTP ${httpStatus} without false success`, async () => {
    const code = `NATIVE_PERFORMANCE_${suffix}` as Exclude<NativeBrokerResult, { ok: true }>['code'];
    const f = fixture({ ok: false, code, status }); const response = await f.api().start(request);
    report(response, 'start', httpStatus); assert.equal(response.body.ok, false); assert.equal(response.body.code, code);
    if (suffix === 'AUTHORITY_REVOKED') {
      assert.equal(response.body.status, null); assert.equal(response.body.ownership, 'none');
      assert.equal(response.body.availability, 'unavailable'); assert.equal(response.body.unavailableReason, 'authority-revoked');
    } else {
      assert.notEqual(response.body.status, null);
      assert.equal(response.body.status?.snapshot, null); assert.equal(response.body.status?.snapshotAgeMs, null);
    }
  });
  for (const suffix of ['AUTHORITY_REVOKED', 'NOT_OWNER'] as const) await check(`native denied ${suffix} read cannot disclose retained snapshots`, async () => {
    const f = fixture({ ok: false, code: `NATIVE_PERFORMANCE_${suffix}`, status }); const response = await f.api().read({ actor });
    report(response, 'read', 403); assert.equal(response.body.ok, false); assert.equal(response.body.status?.snapshot ?? null, null);
    assert.equal(response.body.status?.snapshotAgeMs ?? null, null); assert(!JSON.stringify(response.body).includes('native.backend.ensure'));
  });
  // BEGIN native authority-ordering regression.
  await check('native ownership-triggered revocation is checked before any read snapshot can serialize', async () => {
    let actorCurrent = true, ownershipObserved = false;
    const raceActor: NativeBrokerActor = { ...actor, isCurrent: () => actorCurrent };
    const collector = createForgePerformanceCollector({ component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: nativeInstanceId, enabled: true });
    collector.recordOperation({ name: 'native.backend.ensure', durationMs: 5, outcome: 'ok' });
    const retained = collector.snapshot(); assert.equal(retained.operations.length, 1);
    const f = fixture({ ok: true, status: { ...status, snapshot: retained } });
    f.broker.ownership = observedActor => {
      assert.equal(observedActor, raceActor); ownershipObserved = true; actorCurrent = false; return 'none';
    };
    const response = await f.api().read({ actor: raceActor }); report(response, 'read', 403);
    assert.equal(ownershipObserved, true); assert.equal(response.body.ok, false); assert.equal(response.body.code, 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    assert.equal(response.body.status, null); assert.equal(response.body.ownership, 'none');
    assert.equal(response.body.availability, 'unavailable'); assert.equal(response.body.unavailableReason, 'authority-revoked');
    const serialized = JSON.stringify(response.body);
    for (const privateValue of ['native.backend.ensure', backendInstanceId, nativeInstanceId, captureId, raceActor.id]) assert(!serialized.includes(privateValue));
  });
  // END native authority-ordering regression.
  await check('native adapter never ACKs before broker execution or cleanup promise settles', async () => {
    const f = fixture(); let release: (value: NativeBrokerResult) => void = () => assert.fail('FIXTURE_RELEASE_MISSING');
    f.broker.start = () => new Promise(resolve => { release = resolve; });
    let settled = false; const pending = f.api().start(request).then(value => { settled = true; return value; }); await flush();
    assert.equal(settled, false); release({ ok: false, code: 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED', status });
    const response = await pending; report(response, 'start', 409); assert.equal(response.body.ok, false);
  });
  await check('native stop does not report cleanup success before its matching broker result settles', async () => {
    const f = fixture(); let release: (value: NativeBrokerResult) => void = () => assert.fail('FIXTURE_RELEASE_MISSING');
    f.broker.stop = () => new Promise(resolve => { release = resolve; });
    let settled = false; const pending = f.api().stop({ ...request, captureId }).then(value => { settled = true; return value; }); await flush();
    assert.equal(settled, false); release({ ok: false, code: 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT', status });
    const response = await pending; report(response, 'stop', 408); assert.equal(response.body.ok, false);
    assert.equal(response.body.code, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT'); assert.equal(response.body.status?.snapshot, null);
  });
  await check('native unexpected adapter failure is closed REQUEST_FAILED with no extra fields or private data', async () => {
    const f = fixture(); f.broker.read = async () => { throw new Error('PRIVATE_ADAPTER_FAILURE_BEARER_PATH'); };
    const response = await f.api().read({ actor }); report(response, 'read', 500);
    assert.equal(response.body.ok, false); assert.equal(response.body.code, 'NATIVE_PERFORMANCE_REQUEST_FAILED');
    assert.equal(response.body.status, null); assert.equal(response.body.ownership, 'none');
    assert(!JSON.stringify(response.body).includes('PRIVATE_ADAPTER_FAILURE_BEARER_PATH'));
  });
  await check('native public report never serializes trusted actor identity or private channel binding', async () => {
    const f = fixture(); const response = await f.api().start(request); const serialized = JSON.stringify(response.body);
    report(response, 'start');
    for (const secret of [actor.id, 'private_nonce_broker_01', 'epoch_broker_01', 'isCurrent']) assert(!serialized.includes(secret));
  });
  return { pass: checks.every(row => row.pass), passed: checks.filter(row => row.pass).length, total: checks.length, checks };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void (process.argv.includes('--native-performance-selftest') ? runForgeNativePerformanceAdapterSelftest() : runForgeBackendPerformanceSelftest()).then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.pass) process.exitCode = 1; }).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
