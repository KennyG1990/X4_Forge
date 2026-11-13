import {
  createForgePerformanceCollector,
  type ForgePerformanceOutcome,
  type ForgePerformanceResourceSample,
  type ForgePerformanceSnapshot,
} from '../../shared/forgePerformance';
import {
  calculateForgeProcessResourceDelta,
  type ForgeProcessResourceBaseline,
} from '../../shared/forgePerformanceResources';
import {
  NATIVE_PERFORMANCE_LIMITS,
  isNativeCaptureKey,
  isNativeInstanceId,
  isNativeOperationId,
  normalizeNativeCollectionOptions,
  type NativeCaptureKey,
  type NativeCollectionOptions,
  type NativeControlFailureCode,
  type NativeControlResult,
  type NativeOperationId,
  type NativePerformanceStatus,
  type NativeStopReason,
} from '../../shared/nativePerformanceProtocol';

export interface NativePerformanceResources {
  pid(): number;
  cpuUsage(): { user: number; system: number };
  memoryUsage(): { rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers?: number };
  uptime(): number;
  logicalCpuCount(): number;
  eventLoopUtilization?(): { idle: number; active: number; utilization?: number };
}

export type NativePerformanceTimer = number | { unref?(): unknown };
export interface NativePerformanceTimers {
  /** A throwing setter must not retain scheduled work without returning its handle. */
  set(callback: () => void, delayMs: number): NativePerformanceTimer;
  clear(timer: NativePerformanceTimer): void;
}
export interface NativePerformanceHistogram {
  enable(): unknown;
  disable(): unknown;
  reset(): unknown;
  percentile(percentile: number): number;
  readonly max: number;
  readonly count?: number;
}
export interface NativePerformanceOptions {
  pid: number;
  instanceId: string;
  now(): number;
  wallNow(): number;
  resources: NativePerformanceResources;
  timers: NativePerformanceTimers;
  delayHistogram?(): NativePerformanceHistogram;
}
export interface NativePerformanceProducer {
  startCollection(key: NativeCaptureKey, options?: NativeCollectionOptions): NativeControlResult;
  stopCollection(key: NativeCaptureKey, reason: NativeStopReason): NativeControlResult;
  beginOperation(id: NativeOperationId): (outcome?: ForgePerformanceOutcome) => void;
  snapshot(): ForgePerformanceSnapshot;
  status(): NativePerformanceStatus;
  dispose(): NativeControlResult;
}

interface TimerOwner {
  handle: NativePerformanceTimer;
  ready: boolean;
  fired: boolean;
}
const stopReasons: readonly NativeStopReason[] = ['requested', 'expired', 'cancelled', 'retired', 'disposed'];
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** Activation-owned state only. Callers supply all clocks, resources and scheduling. */
export function createNativePerformance(options: NativePerformanceOptions): NativePerformanceProducer {
  if (!options || !positiveInteger(options.pid) || !isNativeInstanceId(options.instanceId)
    || typeof options.now !== 'function' || typeof options.wallNow !== 'function'
    || !options.resources || !options.timers || typeof options.timers.set !== 'function'
    || typeof options.timers.clear !== 'function') throw new TypeError('Invalid native performance dependencies.');
  const pid = options.pid;
  const instanceId = options.instanceId;
  const collector = createForgePerformanceCollector({
    component: 'extension-host', scope: 'shared-process', pid, instanceId,
    enabled: false, now: options.now, wallNow: options.wallNow,
  });
  const producer = Object.freeze({ component: 'extension-host' as const, scope: 'shared-process' as const, pid, instanceId });
  const ownedTimers = new Set<TimerOwner>();
  const failedTimers = new Set<TimerOwner>();
  let disposed = false;
  let active = false;
  let generation = 0;
  let capture: Readonly<NativeCaptureKey> | undefined;
  let histogram: NativePerformanceHistogram | undefined;
  let histogramCleanupUnconfirmed = false;
  let allocationCleanupUnconfirmed = false;
  let started: number | null = null;
  let expires: number | null = null;
  let expiryMonotonic: number | null = null;
  let intervalMs: number = NATIVE_PERFORMANCE_LIMITS.defaultIntervalMs;
  let previous: ForgeProcessResourceBaseline | undefined;
  let lastSample: number | null = null;
  let resourceSamples = 0;
  let resourceErrors = 0;
  let throttledSamples = 0;
  let counterResets = 0;
  let sampleOverheadMs = 0;
  let lastResourceError: NativePerformanceStatus['lastResourceError'] = null;
  let collectionStopDelayMs: number | null = null;
  let lastStopReason: NativeStopReason | null = null;

  const stamp = () => { try { const value = options.now(); return nonnegative(value) ? value : null; } catch { return null; } };
  const wall = () => { try { const value = options.wallNow(); return nonnegative(value) ? value : null; } catch { return null; } };
  const cleanupUnconfirmed = () => allocationCleanupUnconfirmed || histogramCleanupUnconfirmed || failedTimers.size > 0;
  const status = (): NativePerformanceStatus => Object.freeze({
    schemaVersion: 'forge.native-performance.status.v1',
    producer, disposed, collectionActive: active, captureId: capture?.captureId ?? null,
    collectionStartedAtUnixMs: started, collectionExpiresAtUnixMs: expires, intervalMs,
    eventLoopDelayMonitoring: histogram !== undefined,
    resourceSamples, resourceErrors, throttledSamples, counterResets, sampleOverheadMs,
    lastResourceError, collectionStopDelayMs, collectionCleanupUnconfirmed: cleanupUnconfirmed(),
    ownedTimerCount: ownedTimers.size, failedTimerCount: failedTimers.size, lastStopReason,
  });
  const result = (code?: NativeControlFailureCode): NativeControlResult => code
    ? Object.freeze({ ok: false as const, code, status: status() })
    : Object.freeze({ ok: true as const, status: status() });
  const keyCopy = (value: unknown): Readonly<NativeCaptureKey> | undefined => {
    try {
      if (!isNativeCaptureKey(value)) return undefined;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const copied = { epoch: descriptors.epoch?.value, captureId: descriptors.captureId?.value };
      return isNativeCaptureKey(copied) ? Object.freeze(copied) : undefined;
    } catch { return undefined; }
  };
  const sameKey = (key: NativeCaptureKey) => capture?.epoch === key.epoch && capture.captureId === key.captureId;

  const clear = (owner: TimerOwner): boolean => {
    if (!ownedTimers.has(owner)) return true;
    try {
      options.timers.clear(owner.handle);
      ownedTimers.delete(owner); failedTimers.delete(owner);
      return true;
    } catch {
      failedTimers.add(owner); resourceErrors++; lastResourceError = 'unavailable';
      return false;
    }
  };
  const stop = (reason: NativeStopReason | null) => {
    generation++;
    active = false;
    collector.setEnabled(false);
    if (reason !== null) lastStopReason = reason;
    for (const owner of [...ownedTimers]) clear(owner);
    if (histogram) {
      try { histogram.disable(); histogram = undefined; histogramCleanupUnconfirmed = false; }
      catch { resourceErrors++; lastResourceError = 'unavailable'; histogramCleanupUnconfirmed = true; }
    }
    previous = undefined; lastSample = null;
  };
  const schedule = (callback: () => void, delayMs: number) => {
    if (ownedTimers.size >= NATIVE_PERFORMANCE_LIMITS.maxOwnedTimers) throw new Error('Native timer ownership limit.');
    const owner: TimerOwner = { handle: 0, ready: false, fired: false };
    const fire = () => {
      if (owner.fired) return;
      owner.fired = true;
      if (!owner.ready) return;
      ownedTimers.delete(owner); failedTimers.delete(owner);
      try { callback(); }
      catch { resourceErrors++; lastResourceError = 'unavailable'; stop(null); }
    };
    const handle = options.timers.set(fire, delayMs);
    if (handle === null || handle === undefined
      || typeof handle === 'number' && (!Number.isSafeInteger(handle) || handle < 0)
      || typeof handle !== 'number' && typeof handle !== 'object') {
      allocationCleanupUnconfirmed = true;
      throw new Error('Native timer ownership unavailable.');
    }
    if ([...ownedTimers].some(existing => existing.handle === handle)) {
      allocationCleanupUnconfirmed = true;
      throw new Error('Aliased native timer ownership.');
    }
    owner.handle = handle;
    owner.ready = true;
    ownedTimers.add(owner);
    if (owner.fired) throw new Error('Synchronous native timer callback.');
    if (typeof handle === 'object') {
      const unref = handle.unref;
      if (unref !== undefined) {
        if (typeof unref !== 'function') throw new Error('Invalid native timer reference.');
        unref.call(handle);
      }
    }
  };
  const sample = () => {
    if (!active || disposed) return;
    const start = stamp();
    if (start === null) { resourceErrors++; lastResourceError = 'clock-unavailable'; previous = undefined; return; }
    if (lastSample !== null && start < lastSample) {
      counterResets++; previous = undefined; lastSample = start; lastResourceError = 'clock-unavailable'; return;
    }
    if (lastSample !== null && start - lastSample < NATIVE_PERFORMANCE_LIMITS.minIntervalMs) { throttledSamples++; return; }
    lastSample = start;
    try {
      if (options.resources.pid() !== pid) {
        resourceErrors++; lastResourceError = 'producer-identity-changed'; stop('retired'); return;
      }
      const cpu = options.resources.cpuUsage();
      const memory = options.resources.memoryUsage();
      const logicalCpuCount = options.resources.logicalCpuCount();
      const uptimeSeconds = options.resources.uptime();
      if (!cpu || !nonnegative(cpu.user) || !nonnegative(cpu.system) || !memory
        || ![memory.rss, memory.heapUsed, memory.heapTotal, memory.external].every(nonnegative)
        || memory.arrayBuffers !== undefined && !nonnegative(memory.arrayBuffers)
        || !positiveInteger(logicalCpuCount) || !nonnegative(uptimeSeconds)) throw new Error('Invalid native resources.');
      let loop: ForgeProcessResourceBaseline['loop'];
      try {
        const value = options.resources.eventLoopUtilization?.();
        if (value && nonnegative(value.idle) && nonnegative(value.active)) loop = { ...value };
      } catch { /* Unsupported event-loop metrics stay null. */ }
      const current: ForgeProcessResourceBaseline = { now: start, cpu: { ...cpu }, ...(loop ? { loop } : {}) };
      const delta = calculateForgeProcessResourceDelta(current, previous, logicalCpuCount);
      if (delta.counterReset) counterResets++;
      const value: Partial<ForgePerformanceResourceSample> = {
        atUnixMs: wall(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal, externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers ?? null, logicalCpuCount, uptimeSeconds,
        ...delta.fields,
      };
      previous = current;
      if (histogram && histogram.count !== undefined && histogram.count > 0) {
        const p50 = histogram.percentile(50) / 1e6;
        const p95 = histogram.percentile(95) / 1e6;
        const maximum = histogram.max / 1e6;
        value.eventLoopDelayP50Ms = nonnegative(p50) ? p50 : null;
        value.eventLoopDelayP95Ms = nonnegative(p95) ? p95 : null;
        value.eventLoopDelayMaxMs = nonnegative(maximum) ? maximum : null;
      }
      histogram?.reset();
      collector.recordResource(value);
      resourceSamples++;
      lastResourceError = null;
    } catch {
      resourceErrors++; lastResourceError = 'unavailable'; previous = undefined;
    } finally {
      const end = stamp();
      if (end !== null && end >= start) sampleOverheadMs += end - start;
    }
  };

  const startCollection = (key: NativeCaptureKey, input?: NativeCollectionOptions): NativeControlResult => {
    if (disposed) return result('NATIVE_PERFORMANCE_DISPOSED');
    const nextKey = keyCopy(key);
    let normalized: ReturnType<typeof normalizeNativeCollectionOptions>;
    try { normalized = normalizeNativeCollectionOptions(input); }
    catch { return result('NATIVE_PERFORMANCE_INPUT_INVALID'); }
    if (!nextKey || !normalized.ok) return result('NATIVE_PERFORMANCE_INPUT_INVALID');
    if (active) return result('NATIVE_PERFORMANCE_BUSY');
    if (cleanupUnconfirmed()) return result('NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');

    // Admission precedes data reset. Failed allocation belongs to this attempt, never old data.
    capture = nextKey;
    collector.reset();
    previous = undefined; lastSample = null;
    resourceSamples = resourceErrors = throttledSamples = counterResets = sampleOverheadMs = 0;
    lastResourceError = null; lastStopReason = null; collectionStopDelayMs = null;
    intervalMs = normalized.options.intervalMs;
    started = wall(); expires = started === null ? null : started + normalized.options.durationMs;
    const monotonicStart = stamp();
    expiryMonotonic = monotonicStart === null ? null : monotonicStart + normalized.options.durationMs;
    const thisGeneration = ++generation;
    active = true; collector.setEnabled(true);
    try {
      if (normalized.options.eventLoopDelay) {
        if (!options.delayHistogram) throw new Error('Native event-loop histogram unavailable.');
        histogram = options.delayHistogram();
        histogram.enable();
        histogram.reset();
      }
      schedule(() => {
        if (!active || disposed || generation !== thisGeneration) return;
        const ended = stamp();
        collectionStopDelayMs = ended !== null && expiryMonotonic !== null ? Math.max(0, ended - expiryMonotonic) : null;
        stop('expired');
      }, normalized.options.durationMs);
      const tick = () => {
        if (!active || disposed || generation !== thisGeneration) return;
        sample();
        if (!active || disposed || generation !== thisGeneration) return;
        try { schedule(tick, intervalMs); }
        catch { resourceErrors++; lastResourceError = 'unavailable'; stop(null); }
      };
      schedule(tick, intervalMs);
      sample();
      return active ? result() : result('NATIVE_PERFORMANCE_START_FAILED');
    } catch {
      resourceErrors++; lastResourceError = 'unavailable'; stop(null);
      return result('NATIVE_PERFORMANCE_START_FAILED');
    }
  };
  const stopCollection = (key: NativeCaptureKey, reason: NativeStopReason): NativeControlResult => {
    const selected = keyCopy(key);
    if (!selected || !stopReasons.includes(reason)) return result('NATIVE_PERFORMANCE_INPUT_INVALID');
    if (!sameKey(selected)) return result('NATIVE_PERFORMANCE_CAPTURE_MISMATCH');
    if (!active && !cleanupUnconfirmed()) return result();
    stop(reason);
    return cleanupUnconfirmed() ? result('NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED') : result();
  };

  return {
    startCollection, stopCollection, status,
    snapshot: () => collector.snapshot(),
    beginOperation(id) {
      try { return collector.startOperation(isNativeOperationId(id) ? id : ''); }
      catch { return () => undefined; }
    },
    dispose() {
      if (!disposed) { disposed = true; stop('disposed'); collector.dispose(); }
      else stop('disposed');
      return cleanupUnconfirmed() ? result('NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED') : result();
    },
  };
}
