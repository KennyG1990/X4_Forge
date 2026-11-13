import assert from 'node:assert/strict';
import {
  createNativePerformance,
  type NativePerformanceHistogram,
  type NativePerformanceOptions,
  type NativePerformanceProducer,
  type NativePerformanceTimer,
} from './nativePerformance';
import {
  NATIVE_PERFORMANCE_OPERATION_IDS,
  isNativeControlResult,
  isNativePerformanceSnapshot,
  isNativePerformanceStatus,
  type NativeCaptureKey,
  type NativeCollectionOptions,
  type NativeControlFailureCode,
  type NativeControlResult,
  type NativeOperationId,
} from '../../shared/nativePerformanceProtocol';

const keyA: NativeCaptureKey = Object.freeze({ epoch: 'epoch_native_01', captureId: 'capture_native_01' });
const keyB: NativeCaptureKey = Object.freeze({ epoch: 'epoch_native_02', captureId: 'capture_native_02' });
interface Task {
  at: number; delay: number; callback: () => void; handle: NativePerformanceTimer;
  cleared: boolean; fired: boolean;
}

class Host {
  nowMs = 0;
  resourcePid = 42;
  cpu = { user: 0, system: 0 };
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers?: number } =
    { rss: 100, heapUsed: 20, heapTotal: 40, external: 3, arrayBuffers: 2 };
  loop = { idle: 100, active: 100 };
  logicalCpuCount = 2;
  resourceReads = 0;
  setCalls = 0;
  clearCalls = 0;
  unrefCalls = 0;
  histogramCalls = 0;
  histogramEnables = 0;
  histogramDisables = 0;
  histogramResets = 0;
  histogramPercentiles = 0;
  histogramCount = 0;
  setFailureAt = 0;
  unrefFailureAt = 0;
  syncAt = 0;
  failClear = false;
  failClock = false;
  failWall = false;
  failResource = false;
  failLoop = false;
  failHistogramFactory = false;
  failHistogramEnable = false;
  failHistogramDisable = false;
  failHistogramReset = false;
  failHistogramPercentile = false;
  numericTimer = false;
  readonly tasks: Task[] = [];
  readonly options: NativePerformanceOptions;
  readonly producer: NativePerformanceProducer;

  constructor() {
    const read = <T>(work: () => T): T => {
      this.resourceReads++;
      if (this.failResource) throw new Error('PRIVATE_RESOURCE_ERROR_MUST_NOT_LEAK');
      return work();
    };
    this.options = {
      pid: 42, instanceId: 'instance_native_01',
      now: () => { if (this.failClock) throw new Error('PRIVATE_CLOCK_ERROR'); return this.nowMs; },
      wallNow: () => { if (this.failWall) throw new Error('PRIVATE_WALL_ERROR'); return 100_000 + this.nowMs; },
      resources: {
        pid: () => read(() => this.resourcePid),
        cpuUsage: () => read(() => this.cpu),
        memoryUsage: () => read(() => this.memory),
        logicalCpuCount: () => read(() => this.logicalCpuCount),
        uptime: () => read(() => this.nowMs / 1000),
        eventLoopUtilization: () => read(() => {
          if (this.failLoop) throw new Error('UNSUPPORTED_LOOP');
          return this.loop;
        }),
      },
      timers: {
        set: (callback, delay) => {
          const ordinal = ++this.setCalls;
          if (this.setFailureAt === ordinal) throw new Error('INJECTED_SET_FAILURE');
          const handle: NativePerformanceTimer = this.numericTimer ? ordinal - 1 : {
            unref: () => {
              this.unrefCalls++;
              if (this.unrefFailureAt === ordinal) throw new Error('INJECTED_UNREF_FAILURE');
            },
          };
          this.tasks.push({ at: this.nowMs + delay, delay, callback, handle, cleared: false, fired: false });
          if (this.syncAt === ordinal) callback();
          return handle;
        },
        clear: handle => {
          this.clearCalls++;
          if (this.failClear) throw new Error('INJECTED_CLEAR_FAILURE');
          const task = this.tasks.find(value => value.handle === handle);
          assert(task, 'Only an exact owned timer handle can be cleared.');
          task.cleared = true;
        },
      },
      delayHistogram: (): NativePerformanceHistogram => {
        this.histogramCalls++;
        if (this.failHistogramFactory) throw new Error('INJECTED_HISTOGRAM_FACTORY_FAILURE');
        const readHistogramCount = () => this.histogramCount;
        return {
          enable: () => { this.histogramEnables++; if (this.failHistogramEnable) throw new Error('INJECTED_ENABLE_FAILURE'); },
          disable: () => { this.histogramDisables++; if (this.failHistogramDisable) throw new Error('INJECTED_DISABLE_FAILURE'); },
          reset: () => { this.histogramResets++; if (this.failHistogramReset) throw new Error('INJECTED_RESET_FAILURE'); this.histogramCount = 0; },
          percentile: percentile => {
            this.histogramPercentiles++;
            if (this.failHistogramPercentile) throw new Error('INJECTED_PERCENTILE_FAILURE');
            return percentile === 50 ? 2_000_000 : 4_000_000;
          },
          get max() { return 8_000_000; },
          get count() { return readHistogramCount(); },
        };
      },
    };
    this.producer = createNativePerformance(this.options);
  }

  elapse(ms: number) { this.nowMs += ms; }
  advance(ms: number) {
    const target = this.nowMs + ms;
    let count = 0;
    for (;;) {
      const next = this.tasks.filter(task => !task.cleared && !task.fired && task.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      assert(++count < 4096, 'Injected scheduling must remain bounded.');
      this.nowMs = Math.max(this.nowMs, next.at);
      next.fired = true;
      next.callback();
    }
    this.nowMs = target;
  }
  sampler() {
    const task = this.tasks.filter(value => !value.cleared && !value.fired && value.delay === 2000).at(-1);
    assert(task, 'Expected an owned pending sampler.');
    return task;
  }
  invoke(task: Task) { task.fired = true; task.callback(); }
  restoreFaults() {
    this.failClear = this.failClock = this.failWall = this.failResource = this.failLoop = false;
    this.failHistogramFactory = this.failHistogramEnable = this.failHistogramDisable = false;
    this.failHistogramReset = this.failHistogramPercentile = false;
  }
}

const cases: Array<{ name: string; run: () => void }> = [];
const owned = new Set<Host>();
const host = () => { const value = new Host(); owned.add(value); return value; };
const check = (name: string, run: () => void) => cases.push({ name, run });
function failure(value: NativeControlResult, code: NativeControlFailureCode) {
  assert(isNativeControlResult(value), 'Failure must retain the closed public contract.');
  assert.equal(value.ok, false);
  if (value.ok) throw new Error('Expected a refusal.');
  assert.equal(value.code, code);
}
function start(value: Host, key = keyA, options?: NativeCollectionOptions) {
  const result = value.producer.startCollection(key, options);
  assert(isNativeControlResult(result));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status.collectionActive, true);
  return result.status;
}
function stop(value: Host, key = keyA) {
  const result = value.producer.stopCollection(key, 'requested');
  assert(isNativeControlResult(result));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status.collectionActive, false);
  assert.equal(result.status.collectionCleanupUnconfirmed, false);
  assert.equal(result.status.ownedTimerCount, 0);
  return result.status;
}

check('default off does not read resources, construct histograms or schedule work', () => {
  const h = host();
  const finish = h.producer.beginOperation('native.command');
  finish(); finish('error');
  assert(isNativePerformanceStatus(h.producer.status()));
  assert(isNativePerformanceSnapshot(h.producer.snapshot()));
  assert.equal(h.resourceReads, 0); assert.equal(h.setCalls, 0); assert.equal(h.histogramCalls, 0);
  assert.equal(h.producer.snapshot().operations.length, 0);
});

check('invalid construction identity rejects before any adapter work', () => {
  const h = host();
  assert.throws(() => createNativePerformance({ ...h.options, pid: 0 }), TypeError);
  assert.throws(() => createNativePerformance({ ...h.options, instanceId: 'invalid/identity' }), TypeError);
  assert.equal(h.resourceReads, 0); assert.equal(h.setCalls, 0);
});

check('malformed keys and closed option refusals preserve all idle state', () => {
  const h = host(); const before = h.producer.status();
  for (const input of [null, [], { durationMs: 999 }, { intervalMs: 999 }, { durationMs: 900_001 }, { owner: 'forged' }]) {
    failure(h.producer.startCollection(keyA, input as unknown as NativeCollectionOptions), 'NATIVE_PERFORMANCE_INPUT_INVALID');
    assert.deepEqual(h.producer.status(), before);
  }
  failure(h.producer.startCollection({ ...keyA, epoch: 'bad' }), 'NATIVE_PERFORMANCE_INPUT_INVALID');
  assert.deepEqual(h.producer.status(), before);
  assert.equal(h.resourceReads, 0); assert.equal(h.setCalls, 0);
});

check('accepted defaults use fixed shared host identity and two owned timers', () => {
  const h = host(); const state = start(h);
  assert.deepEqual(state.producer, { component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: 'instance_native_01' });
  assert.equal(state.intervalMs, 2000);
  assert.equal(state.collectionExpiresAtUnixMs! - state.collectionStartedAtUnixMs!, 60_000);
  assert.equal(state.ownedTimerCount, 2); assert.equal(h.unrefCalls, 2);
  assert.equal(state.resourceSamples, 1); assert.equal(h.histogramCalls, 0);
  const sample = h.producer.snapshot().resources[0];
  assert.equal(sample.elapsedMs, null); assert.equal(sample.cpuOneCorePercent, null);
  assert.equal(sample.rssBytes, 100);
});

check('busy start leaves capture data, identity and resource ownership unchanged', () => {
  const h = host(); start(h);
  const finish = h.producer.beginOperation('native.command'); h.elapse(1); finish();
  const before = h.producer.status(); const sets = h.setCalls; const reads = h.resourceReads;
  failure(h.producer.startCollection(keyB), 'NATIVE_PERFORMANCE_BUSY');
  assert.deepEqual(h.producer.status(), before);
  assert.equal(h.setCalls, sets); assert.equal(h.resourceReads, reads);
  assert.equal(h.producer.snapshot().operations[0].count, 1);
});

check('wrong epoch and wrong capture cannot stop or mutate another lease', () => {
  const h = host(); start(h);
  const before = h.producer.status();
  for (const key of [{ ...keyA, epoch: keyB.epoch }, { ...keyA, captureId: keyB.captureId }]) {
    failure(h.producer.stopCollection(key, 'requested'), 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH');
    assert.deepEqual(h.producer.status(), before);
  }
  assert.equal(h.clearCalls, 0);
});

check('manual stop disables work, confirms owned cleanup and retains capture data', () => {
  const h = host(); start(h);
  const finish = h.producer.beginOperation('native.command'); h.elapse(4); finish();
  const before = h.producer.snapshot();
  const state = stop(h);
  assert.equal(state.captureId, keyA.captureId); assert.equal(state.lastStopReason, 'requested');
  const after = h.producer.snapshot();
  assert.equal(after.enabled, false); assert.deepEqual(after.operations, before.operations);
  assert.deepEqual(after.resources, before.resources);
  const reads = h.resourceReads; h.advance(70_000);
  assert.equal(h.resourceReads, reads); assert.equal(h.setCalls, 2);
});

check('clean exact-key repeated stop is idempotent', () => {
  const h = host(); start(h); stop(h);
  const before = h.producer.status(); const clears = h.clearCalls;
  assert.equal(h.producer.stopCollection(keyA, 'cancelled').ok, true);
  assert.deepEqual(h.producer.status(), before); assert.equal(h.clearCalls, clears);
});

check('only an admitted new capture resets data and establishes a fresh baseline', () => {
  const h = host(); start(h);
  const finish = h.producer.beginOperation('native.command'); h.elapse(2); finish();
  stop(h); h.cpu.user = 1_000_000;
  const state = start(h, keyB);
  assert.equal(state.captureId, keyB.captureId);
  const snapshot = h.producer.snapshot();
  assert.equal(snapshot.operations.length, 0); assert.equal(snapshot.resources.length, 1);
  assert.equal(snapshot.resources[0].cpuUserMicros, null);
});

check('local expiry stops without backend participation', () => {
  const h = host(); start(h); h.advance(65_000);
  const state = h.producer.status();
  assert.equal(state.collectionActive, false); assert.equal(state.lastStopReason, 'expired');
  assert.equal(state.collectionStopDelayMs, 0); assert.equal(state.ownedTimerCount, 0);
  assert.equal(state.collectionCleanupUnconfirmed, false);
});

check('delayed expiry reports actual stop delay instead of nominal success timing', () => {
  const h = host(); start(h);
  const lease = h.tasks.find(task => task.delay === 60_000)!;
  h.elapse(65_000); h.invoke(lease);
  assert.equal(h.producer.status().collectionStopDelayMs, 5000);
  assert.equal(h.producer.status().collectionActive, false);
});

check('shared CPU deltas allow one-core usage above 100 and reject impossible host percentages', () => {
  const h = host(); start(h); h.cpu.user = 8_000_000; h.advance(2000);
  const sample = h.producer.snapshot().resources.at(-1)!;
  assert.equal(sample.elapsedMs, 2000); assert.equal(sample.cpuUserMicros, 8_000_000);
  assert.equal(sample.cpuOneCorePercent, 400); assert.equal(sample.cpuHostPercent, null);
});

check('resource baselines copy mutable adapter CPU and loop objects', () => {
  const h = host(); start(h);
  h.cpu.user += 1_000_000; h.loop.active += 500; h.loop.idle += 500;
  h.advance(2000);
  const sample = h.producer.snapshot().resources.at(-1)!;
  assert.equal(sample.cpuUserMicros, 1_000_000); assert.equal(sample.eventLoopUtilization, 0.5);
});

check('CPU rollback establishes a new baseline and explicit reset count', () => {
  const h = host(); start(h); h.cpu.user = 1_000_000; h.advance(2000);
  h.cpu.user = 1; h.advance(2000);
  const sample = h.producer.snapshot().resources.at(-1)!;
  assert.equal(sample.cpuUserMicros, null); assert.equal(sample.elapsedMs, null);
  assert.equal(h.producer.status().counterResets, 1);
});

check('loop-only rollback omits its delta without inventing a CPU reset', () => {
  const h = host(); start(h);
  h.cpu.user = 1000; h.loop.active = 50; h.loop.idle = 50; h.advance(2000);
  assert.equal(h.producer.snapshot().resources.at(-1)!.eventLoopUtilization, null);
  assert.equal(h.producer.status().counterResets, 0);
});

check('early sampler callbacks throttle without resource reads', () => {
  const h = host(); start(h); const reads = h.resourceReads;
  h.elapse(500); h.invoke(h.sampler());
  assert.equal(h.resourceReads, reads); assert.equal(h.producer.status().throttledSamples, 1);
});

check('backward monotonic clock invalidates baseline without reading resources', () => {
  const h = host(); start(h); h.advance(2000);
  const reads = h.resourceReads; h.nowMs = 1000; h.invoke(h.sampler());
  assert.equal(h.resourceReads, reads); assert.equal(h.producer.status().counterResets, 1);
  assert.equal(h.producer.status().lastResourceError, 'clock-unavailable');
});

check('unavailable clocks cannot escape sampling callbacks', () => {
  const h = host(); start(h); h.failClock = true;
  assert.doesNotThrow(() => h.invoke(h.sampler()));
  assert.equal(h.producer.status().lastResourceError, 'clock-unavailable');
  assert.equal(h.producer.status().resourceErrors, 1);
});

check('changed PID stops sampling without attributing replacement resources', () => {
  const h = host(); start(h); h.resourcePid = 99; h.advance(2000);
  const state = h.producer.status();
  assert.equal(state.producer.pid, 42); assert.equal(state.collectionActive, false);
  assert.equal(state.lastResourceError, 'producer-identity-changed');
  assert.equal(state.lastStopReason, 'retired'); assert.equal(state.ownedTimerCount, 0);
  assert.equal(h.producer.snapshot().resources.length, 1);
});

check('invalid and throwing resources do not create fabricated samples or leak errors', () => {
  const h = host(); start(h); h.memory.heapUsed = NaN; h.advance(2000);
  assert.equal(h.producer.status().resourceErrors, 1); assert.equal(h.producer.snapshot().resources.length, 1);
  h.memory.heapUsed = 20; h.failResource = true; h.advance(2000);
  assert.equal(h.producer.status().resourceErrors, 2);
  assert(!JSON.stringify(h.producer.status()).includes('PRIVATE'));
  assert(!JSON.stringify(h.producer.snapshot()).includes('PRIVATE'));
});

check('unsupported loop and array-buffer fields remain null with valid memory samples', () => {
  const h = host(); h.failLoop = true; h.memory.arrayBuffers = undefined; start(h);
  const sample = h.producer.snapshot().resources[0];
  assert.equal(sample.eventLoopUtilization, null); assert.equal(sample.arrayBuffersBytes, null);
  assert.equal(sample.rssBytes, 100); assert.equal(h.producer.status().resourceErrors, 0);
});

check('event-loop histogram samples convert nanoseconds and reset after capture', () => {
  const h = host(); h.histogramCount = 99; start(h, keyA, { eventLoopDelay: true });
  assert.equal(h.producer.snapshot().resources[0].eventLoopDelayMaxMs, null, 'Old histogram observations must not enter a new capture.');
  h.histogramCount = 2; h.advance(2000);
  const sample = h.producer.snapshot().resources.at(-1)!;
  assert.equal(sample.eventLoopDelayP50Ms, 2); assert.equal(sample.eventLoopDelayP95Ms, 4);
  assert.equal(sample.eventLoopDelayMaxMs, 8); assert.equal(h.histogramResets, 3);
  stop(h); assert.equal(h.histogramDisables, 1);
});

check('empty histograms do not invent delay observations', () => {
  const h = host(); start(h, keyA, { eventLoopDelay: true });
  assert.equal(h.histogramPercentiles, 0);
  assert.equal(h.producer.snapshot().resources[0].eventLoopDelayMaxMs, null);
});

check('histogram factory, enable and initial reset failures report failed inactive attempts', () => {
  for (const fault of ['failHistogramFactory', 'failHistogramEnable', 'failHistogramReset'] as const) {
    const h = host(); h[fault] = true;
    failure(h.producer.startCollection(keyA, { eventLoopDelay: true }), 'NATIVE_PERFORMANCE_START_FAILED');
    const state = h.producer.status();
    assert.equal(state.captureId, keyA.captureId); assert.equal(state.collectionActive, false);
    assert.equal(state.ownedTimerCount, 0); assert.equal(state.collectionCleanupUnconfirmed, false);
    assert.equal(h.producer.snapshot().resources.length, 0);
  }
});

check('uncertain histogram cleanup survives epochs until exact old-key retry succeeds', () => {
  const h = host(); h.failHistogramEnable = h.failHistogramDisable = true;
  failure(h.producer.startCollection(keyA, { eventLoopDelay: true }), 'NATIVE_PERFORMANCE_START_FAILED');
  assert.equal(h.producer.status().collectionCleanupUnconfirmed, true);
  const before = h.producer.status(); const disables = h.histogramDisables;
  failure(h.producer.stopCollection(keyB, 'requested'), 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH');
  assert.deepEqual(h.producer.status(), before); assert.equal(h.histogramDisables, disables);
  failure(h.producer.startCollection(keyB), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
  h.failHistogramEnable = h.failHistogramDisable = false;
  stop(h); start(h, keyB);
});

check('histogram read/reset failures cannot escape into caller work', () => {
  for (const fault of ['failHistogramPercentile', 'failHistogramReset'] as const) {
    const h = host(); start(h, keyA, { eventLoopDelay: true });
    h.histogramCount = 1; h[fault] = true;
    assert.doesNotThrow(() => h.advance(2000));
    assert.equal(h.producer.status().resourceErrors, 1);
    assert.equal(h.producer.snapshot().resources.length, 1);
    stop(h);
  }
});

check('setter failures before or after lease allocation clean every returned timer', () => {
  for (const ordinal of [1, 2]) {
    const h = host(); h.setFailureAt = ordinal;
    failure(h.producer.startCollection(keyA), 'NATIVE_PERFORMANCE_START_FAILED');
    assert.equal(h.producer.status().collectionActive, false);
    assert.equal(h.producer.status().ownedTimerCount, 0); assert.equal(h.resourceReads, 0);
    assert(h.tasks.every(task => task.cleared));
  }
});

check('unref failures retain returned-handle ownership through rollback', () => {
  for (const ordinal of [1, 2]) {
    const h = host(); h.unrefFailureAt = ordinal;
    failure(h.producer.startCollection(keyA), 'NATIVE_PERFORMANCE_START_FAILED');
    assert.equal(h.producer.status().ownedTimerCount, 0);
    assert.equal(h.producer.status().collectionCleanupUnconfirmed, false);
    assert(h.tasks.every(task => task.cleared)); assert.equal(h.resourceReads, 0);
  }
});

check('synchronous timer callbacks fail safely without recursion or sampling', () => {
  for (const ordinal of [1, 2]) {
    const h = host(); h.syncAt = ordinal;
    failure(h.producer.startCollection(keyA), 'NATIVE_PERFORMANCE_START_FAILED');
    assert.equal(h.setCalls, ordinal); assert.equal(h.resourceReads, 0);
    assert.equal(h.producer.status().collectionActive, false);
    assert.equal(h.producer.status().ownedTimerCount, 0); assert(h.tasks.every(task => task.cleared));
  }
});

check('numeric zero timer handles remain owned and are cleared', () => {
  const h = host(); h.numericTimer = true; start(h);
  assert.equal(h.tasks[0].handle, 0); assert.equal(h.producer.status().ownedTimerCount, 2);
  stop(h); assert.equal(h.clearCalls, 2);
});

check('failed clears latch across epochs and mismatched stop cannot perform cleanup', () => {
  const h = host(); start(h); h.failClear = true;
  failure(h.producer.stopCollection(keyA, 'cancelled'), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
  assert.equal(h.producer.status().collectionActive, false);
  assert.equal(h.producer.status().failedTimerCount, 2);
  const before = h.producer.status(); const clears = h.clearCalls;
  failure(h.producer.stopCollection(keyB, 'requested'), 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH');
  assert.deepEqual(h.producer.status(), before); assert.equal(h.clearCalls, clears);
  failure(h.producer.startCollection(keyB), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
  h.failClear = false; stop(h); start(h, keyB);
});

check('queued stale callbacks cannot sample or reschedule after stop and rebind', () => {
  const h = host(); start(h); const old = h.sampler(); stop(h); start(h, keyB);
  const reads = h.resourceReads; const sets = h.setCalls;
  h.invoke(old); h.invoke(old);
  assert.equal(h.resourceReads, reads); assert.equal(h.setCalls, sets);
  assert.equal(h.producer.status().captureId, keyB.captureId);
  assert.equal(h.producer.status().collectionActive, true);
});

check('only fixed operation IDs enter immutable native snapshots', () => {
  const h = host(); start(h);
  for (const id of NATIVE_PERFORMANCE_OPERATION_IDS) { const finish = h.producer.beginOperation(id); h.elapse(1); finish(); }
  h.producer.beginOperation('PRIVATE/path-or-token' as NativeOperationId)();
  const snapshot = h.producer.snapshot();
  assert.equal(snapshot.operations.length, NATIVE_PERFORMANCE_OPERATION_IDS.length);
  assert.equal(snapshot.drops.invalidOperations, 1);
  assert(isNativePerformanceSnapshot(snapshot)); assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.operations)); assert(Object.isFrozen(snapshot.operations[0]));
  assert(!JSON.stringify(snapshot).includes('PRIVATE')); assert(!JSON.stringify(h.producer.status()).includes(keyA.epoch));
});

check('stale and duplicate finish closures cannot label a new capture', () => {
  const h = host(); start(h); const finish = h.producer.beginOperation('native.command');
  stop(h); start(h, keyB); finish(); finish('error');
  const snapshot = h.producer.snapshot();
  assert.equal(snapshot.operations.length, 0);
  assert.equal(snapshot.drops.staleFinishes, 1); assert.equal(snapshot.drops.duplicateFinishes, 1);
});

check('resource retention stays bounded with explicit overwrite counts', () => {
  const h = host(); start(h, keyA, { durationMs: 900_000, intervalMs: 1000 }); h.advance(130_000);
  const snapshot = h.producer.snapshot();
  assert.equal(snapshot.resources.length, 120); assert(snapshot.drops.resourceOverwrites > 0);
  assert(isNativePerformanceSnapshot(snapshot));
  assert(Buffer.byteLength(JSON.stringify(snapshot)) <= 1024 * 1024);
});

check('slow operation retention stays bounded without accepting arbitrary names', () => {
  const h = host(); start(h);
  for (let index = 0; index < 70; index++) { const finish = h.producer.beginOperation('native.command'); h.elapse(101); finish(); }
  const snapshot = h.producer.snapshot();
  assert.equal(snapshot.recentSlowOperations.length, 64);
  assert.equal(snapshot.drops.slowOverwrites, 6); assert.equal(snapshot.operations[0].count, 70);
  assert(isNativePerformanceSnapshot(snapshot));
});

check('dispose is terminal but exact cleanup remains retryable', () => {
  const h = host(); start(h); h.failClear = true;
  failure(h.producer.dispose(), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
  assert.equal(h.producer.status().disposed, true); assert.equal(h.producer.status().collectionActive, false);
  failure(h.producer.startCollection(keyB), 'NATIVE_PERFORMANCE_DISPOSED');
  h.failClear = false;
  assert.equal(h.producer.dispose().ok, true); assert.equal(h.producer.status().ownedTimerCount, 0);
  assert.equal(h.producer.dispose().ok, true);
});

check('operation telemetry faults preserve caller values and thrown errors', () => {
  const h = host(); start(h); h.failClock = true;
  const value = Object.freeze({ original: true });
  const work = () => { const finish = h.producer.beginOperation('native.command'); finish(); return value; };
  assert.equal(work(), value);
  const original = new Error('ORIGINAL_WORK_ERROR');
  assert.throws(() => { const finish = h.producer.beginOperation('native.command'); try { throw original; } catch (error) { finish('error'); throw error; } }, error => error === original);
  assert.equal(h.producer.snapshot().operations.length, 0);
});

check('invalid stop arguments cannot mutate an admitted capture', () => {
  const h = host(); start(h); const before = h.producer.status();
  failure(h.producer.stopCollection(keyA, 'forged' as Parameters<NativePerformanceProducer['stopCollection']>[1]), 'NATIVE_PERFORMANCE_INPUT_INVALID');
  failure(h.producer.stopCollection(null as unknown as NativeCaptureKey, 'requested'), 'NATIVE_PERFORMANCE_INPUT_INVALID');
  assert.deepEqual(h.producer.status(), before); assert.equal(h.clearCalls, 0);
});

check('failed allocation never relabels data from the preceding capture', () => {
  const h = host(); start(h);
  const finish = h.producer.beginOperation('native.command'); h.elapse(5); finish();
  stop(h); h.setFailureAt = h.setCalls + 1;
  failure(h.producer.startCollection(keyB), 'NATIVE_PERFORMANCE_START_FAILED');
  assert.equal(h.producer.status().captureId, keyB.captureId);
  assert.equal(h.producer.status().collectionActive, false);
  assert.equal(h.producer.snapshot().operations.length, 0);
  assert.equal(h.producer.snapshot().resources.length, 0);
});

check('startup rollback retains failed timer cleanup until exact-key retry', () => {
  const h = host(); h.unrefFailureAt = 1; h.failClear = true;
  failure(h.producer.startCollection(keyA), 'NATIVE_PERFORMANCE_START_FAILED');
  assert.equal(h.producer.status().collectionActive, false);
  assert.equal(h.producer.status().collectionCleanupUnconfirmed, true);
  assert.equal(h.producer.status().failedTimerCount, 1);
  assert.equal(h.resourceReads, 0);
  failure(h.producer.startCollection(keyB), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
  h.failClear = false; stop(h); start(h, keyB);
});

check('failed initial histogram reset retains failed-disable cleanup ownership', () => {
  const h = host(); h.failHistogramReset = h.failHistogramDisable = true;
  failure(h.producer.startCollection(keyA, { eventLoopDelay: true }), 'NATIVE_PERFORMANCE_START_FAILED');
  assert.equal(h.producer.status().collectionActive, false);
  assert.equal(h.producer.status().collectionCleanupUnconfirmed, true);
  assert.equal(h.producer.snapshot().resources.length, 0);
  failure(h.producer.startCollection(keyB), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
  h.failHistogramReset = h.failHistogramDisable = false;
  stop(h); start(h, keyB, { eventLoopDelay: true });
});

check('capture-key data is copied without invoking caller getters', () => {
  const h = host(); let reads = 0;
  const selected = new Proxy({ ...keyA }, { get() { reads++; throw new Error('CALLER_GET_MUST_NOT_RUN'); } });
  assert.equal(h.producer.startCollection(selected).ok, true);
  assert.equal(h.producer.status().captureId, keyA.captureId);
  assert.equal(reads, 0);
  stop(h);
});

const checks: Array<{ name: string; pass: boolean }> = [];
for (const test of cases) {
  try { test.run(); checks.push({ name: test.name, pass: true }); }
  catch (error) {
    checks.push({ name: test.name, pass: false });
    const detail = error instanceof Error ? error.message : 'Unknown assertion failure';
    console.error('[native-performance] ' + test.name + ': ' + detail.slice(0, 800));
  } finally {
    for (const value of owned) {
      value.restoreFaults();
      try {
        const ended = value.producer.dispose();
        assert.equal(ended.ok, true, 'Injected fixture cleanup must be confirmed.');
        assert.equal(ended.status.ownedTimerCount, 0);
        assert.equal(ended.status.collectionCleanupUnconfirmed, false);
      } catch (error) {
        checks[checks.length - 1].pass = false;
        console.error('[native-performance] fixture cleanup: ' + (error instanceof Error ? error.message : 'unknown failure'));
      }
    }
    owned.clear();
  }
}
const passed = checks.filter(value => value.pass).length;
console.log(JSON.stringify({ pass: passed === checks.length, passed, total: checks.length, checks }));
if (passed !== checks.length) process.exitCode = 1;
