/** Browser-safe, bounded performance facts. Recording never changes observed work. */
export const FORGE_PERFORMANCE_SCHEMA_VERSION = 'forge.performance.v1' as const;
export type ForgePerformanceComponent = 'backend' | 'extension-host' | 'webview';
export type ForgePerformanceScope = 'owned-process' | 'shared-process' | 'webview';
export type ForgePerformanceOutcome = 'ok' | 'error' | 'cancelled' | 'aborted' | 'superseded';
export const FORGE_PERFORMANCE_OUTCOMES: readonly ForgePerformanceOutcome[] = ['ok', 'error', 'cancelled', 'aborted', 'superseded'];
export const FORGE_PERFORMANCE_HISTOGRAM_MS = Object.freeze([1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16_384, 32_768, 60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000, 86_400_000]);
export const FORGE_PERFORMANCE_LIMITS = Object.freeze({ maxOperations: 128, maxSlowOperations: 64, maxResources: 120, maxSnapshotBytes: 1024 * 1024, maxNameChars: 160, maxCorrelationChars: 80, slowOperationMs: 100 });
export interface ForgePerformanceLimits {
  maxOperations: number; maxSlowOperations: number; maxResources: number; maxSnapshotBytes: number;
  maxNameChars: number; maxCorrelationChars: number; slowOperationMs: number;
}
export interface ForgePerformanceProducer {
  component: ForgePerformanceComponent; scope: ForgePerformanceScope; pid: number | null; instanceId: string | null;
}
export interface ForgePerformanceOperationInput {
  name: string; durationMs: number; outcome: ForgePerformanceOutcome; correlationId?: string; atUnixMs?: number | null;
}
export interface ForgePerformanceOperationSummary {
  name: string; count: number; outcomes: Record<ForgePerformanceOutcome, number>;
  totalMs: number; minMs: number; maxMs: number; meanMs: number;
  p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
  quantileMethod: 'fixed-histogram-upper-bound';
  histogram: { upperBoundsMs: number[]; counts: number[] };
}
export interface ForgePerformanceSlowOperation extends ForgePerformanceOperationInput { atUnixMs: number | null }
export interface ForgePerformanceResourceSample {
  atUnixMs: number | null;
  elapsedMs: number | null; cpuUserMicros: number | null; cpuSystemMicros: number | null;
  cpuOneCorePercent: number | null; cpuHostPercent: number | null; logicalCpuCount: number | null;
  rssBytes: number | null; heapUsedBytes: number | null; heapTotalBytes: number | null;
  externalBytes: number | null; arrayBuffersBytes: number | null; uptimeSeconds: number | null;
  eventLoopUtilization: number | null; eventLoopDelayP50Ms: number | null;
  eventLoopDelayP95Ms: number | null; eventLoopDelayMaxMs: number | null;
  fps: number | null; frameIntervalMs: number | null; longTaskDurationMs: number | null; jsHeapUsedBytes: number | null;
}
export interface ForgePerformanceDrops {
  disabled: number; disposed: number; invalidOperations: number; invalidResources: number;
  operationCapacity: number; slowOverwrites: number; resourceOverwrites: number;
  duplicateFinishes: number; recorderErrors: number; snapshotOmissions: number;
  staleFinishes: number;
}
export interface ForgePerformanceSnapshot {
  schemaVersion: typeof FORGE_PERFORMANCE_SCHEMA_VERSION; producer: ForgePerformanceProducer;
  enabled: boolean; disposed: boolean; startedAtUnixMs: number | null; capturedAtUnixMs: number | null;
  operations: ForgePerformanceOperationSummary[]; recentSlowOperations: ForgePerformanceSlowOperation[];
  resources: ForgePerformanceResourceSample[]; drops: ForgePerformanceDrops; limits: ForgePerformanceLimits;
  selfOverhead: { recordCalls: number; recordMs: number | null; snapshotCalls: number; snapshotMs: number | null; clockFailures: number; snapshotScope: 'completed-prior-snapshots-including-serialization-and-freeze' };
  coverage: {
    operations: 'instrumented-boundaries-only'; cpuAttribution: 'process-interval-not-exclusive-operation';
    memoryAttribution: 'process-or-host-estimates-not-function-allocations';
    quantiles: 'histogram-estimates'; resourceFields: 'null-means-unavailable-or-unsampled';
    functionProfiles: 'separate-bounded-producer'; limitsAre: 'retained-state-not-os-quota';
  };
}
export interface ForgePerformanceCollectorOptions {
  component: ForgePerformanceComponent; scope: ForgePerformanceScope; pid?: number; instanceId?: string;
  enabled?: boolean; now?: () => number; wallNow?: () => number;
  limits?: Partial<Pick<ForgePerformanceLimits, 'maxOperations' | 'maxSlowOperations' | 'maxResources' | 'maxSnapshotBytes' | 'slowOperationMs'>>;
}
export interface ForgePerformanceCollector {
  recordOperation(input: ForgePerformanceOperationInput): void;
  recordResource(input: Partial<ForgePerformanceResourceSample>): void;
  startOperation(name: string | (() => string), correlationId?: string): (outcome?: ForgePerformanceOutcome) => void;
  measureSync<T>(name: string, work: () => T, correlationId?: string): T;
  measureAsync<T>(name: string, work: () => PromiseLike<T> | T, correlationId?: string): Promise<T>;
  snapshot(): ForgePerformanceSnapshot;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void; reset(): void; dispose(): void;
}
export const FORGE_CPU_PROFILE_LIMITS = Object.freeze({ maxDurationMs: 5000, minDurationMs: 100, defaultDurationMs: 2000, minSamplingIntervalMicros: 1000, maxSamplingIntervalMicros: 100_000, defaultSamplingIntervalMicros: 1000, maxFunctions: 64, maxNodes: 20_000, maxSamples: 10_000, maxOutputBytes: 128 * 1024 });
export interface ForgeCpuProfileOptions { durationMs?: number; samplingIntervalMicros?: number; maxFunctions?: number; signal?: AbortSignal }
export interface ForgeCpuProfileFunction {
  name: string; module: string; line: number | null; column: number | null; selfSamples: number; selfSampleMicros: number | null;
}
export interface ForgeCpuProfileReport {
  ok: true; schemaVersion: 'forge.cpu-profile.v1'; producer: ForgePerformanceProducer;
  requestedDurationMs: number; observedDurationMs: number | null; delayedStopMs: number | null; samplingIntervalMicros: number;
  profileDurationMicros: number | null; sampleCount: number | null; scannedSampleCount: number;
  functions: ForgeCpuProfileFunction[];
  omitted: { nodes: number; samples: number; functions: number; unknownNodeSamples: number; invalidNodes: number; invalidDeltas: number; redactedLabels: number };
  coverage: { process: 'current-backend-only'; attribution: 'sampled-self-time-not-exact-operation-cpu'; rawProfile: 'not-returned-or-persisted'; timer: 'event-loop-blockage-can-delay-stop'; resourceLimit: 'no-os-heap-quota'; samples: 'available' | 'unavailable' };
}
export interface ForgeCpuProfileFailure {
  ok: false; code: 'PROFILE_DISABLED' | 'PROFILE_BUSY' | 'PROFILE_RATE_LIMITED' | 'PROFILE_DISPOSED' | 'PROFILE_INPUT_INVALID' | 'PROFILE_ABORTED' | 'PROFILE_FAILED' | 'PROFILE_CLEANUP_UNCONFIRMED';
  error: string;
}
export type ForgeCpuProfileResult = ForgeCpuProfileReport | ForgeCpuProfileFailure;
const RESOURCE_FIELDS = Object.freeze(['elapsedMs', 'cpuUserMicros', 'cpuSystemMicros', 'cpuOneCorePercent', 'cpuHostPercent', 'logicalCpuCount', 'rssBytes', 'heapUsedBytes', 'heapTotalBytes', 'externalBytes', 'arrayBuffersBytes', 'uptimeSeconds', 'eventLoopUtilization', 'eventLoopDelayP50Ms', 'eventLoopDelayP95Ms', 'eventLoopDelayMaxMs', 'fps', 'frameIntervalMs', 'longTaskDurationMs', 'jsHeapUsedBytes'] as const);
const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const safeText = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_.:/ -]+$/.test(value) && !value.includes('://') && !value.includes('//');
export const isForgePerformanceOperationName = (value: unknown): value is string => safeText(value, FORGE_PERFORMANCE_LIMITS.maxNameChars) && /^[A-Za-z]/.test(value as string);
const correlation = (value: unknown) => value === undefined || typeof value === 'string' && value.length <= FORGE_PERFORMANCE_LIMITS.maxCorrelationChars && /^[A-Za-z0-9_-]+$/.test(value);
const emptyDrops = (): ForgePerformanceDrops => ({ disabled: 0, disposed: 0, invalidOperations: 0, invalidResources: 0, operationCapacity: 0, slowOverwrites: 0, resourceOverwrites: 0, duplicateFinishes: 0, recorderErrors: 0, snapshotOmissions: 0, staleFinishes: 0 });
const outcomes = (): Record<ForgePerformanceOutcome, number> => ({ ok: 0, error: 0, cancelled: 0, aborted: 0, superseded: 0 });
function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeTree(child); Object.freeze(value); }
  return value;
}
/** Bounds reject configuration mistakes; individual bad records are dropped, never thrown. */
export function createForgePerformanceCollector(options: ForgePerformanceCollectorOptions): ForgePerformanceCollector {
  if (!['backend', 'extension-host', 'webview'].includes(options.component) || !['owned-process', 'shared-process', 'webview'].includes(options.scope)) throw new TypeError('Invalid performance producer.');
  if ({ backend: 'owned-process', 'extension-host': 'shared-process', webview: 'webview' }[options.component] !== options.scope) throw new TypeError('Performance attribution scope does not match its component.');
  if (options.pid !== undefined && (!Number.isSafeInteger(options.pid) || options.pid < 1)) throw new TypeError('Invalid performance PID.');
  if (options.instanceId !== undefined && (!safeText(options.instanceId, 160) || /[/: ]/.test(options.instanceId))) throw new TypeError('Invalid performance instance ID.');
  if (options.limits && Object.keys(options.limits).some(field => !['maxOperations', 'maxSlowOperations', 'maxResources', 'maxSnapshotBytes', 'slowOperationMs'].includes(field))) throw new TypeError('Unknown performance limit.');
  const limits: ForgePerformanceLimits = { ...FORGE_PERFORMANCE_LIMITS, ...options.limits };
  for (const field of ['maxOperations', 'maxSlowOperations', 'maxResources', 'maxSnapshotBytes'] as const) {
    const minimum = field === 'maxSnapshotBytes' ? 8192 : 1;
    if (!Number.isSafeInteger(limits[field]) || limits[field] < minimum || limits[field] > FORGE_PERFORMANCE_LIMITS[field]) throw new RangeError(`Invalid performance ${field}.`);
  }
  if (!finiteNonnegative(limits.slowOperationMs) || limits.slowOperationMs > 86_400_000) throw new RangeError('Invalid slow operation threshold.');
  const producer: ForgePerformanceProducer = { component: options.component, scope: options.scope, pid: options.pid ?? null, instanceId: options.instanceId ?? null };
  const now = options.now ?? (() => performance.now());
  const wallNow = options.wallNow ?? Date.now;
  let enabled = options.enabled === true;
  let disposed = false;
  let generation = 0;
  let drops = emptyDrops();
  const emptyOverhead = (): ForgePerformanceSnapshot['selfOverhead'] => ({ recordCalls: 0, recordMs: 0, snapshotCalls: 0, snapshotMs: 0, clockFailures: 0, snapshotScope: 'completed-prior-snapshots-including-serialization-and-freeze' });
  let overhead = emptyOverhead();
  const monotonic = () => { try { const n = now(); if (finiteNonnegative(n)) return n; } catch { /* diagnostic only */ } overhead.clockFailures++; return null; };
  const wall = () => { try { const n = wallNow(); if (finiteNonnegative(n)) return n; } catch { /* diagnostic only */ } overhead.clockFailures++; return null; };
  let startedAtUnixMs = wall();
  const operations = new Map<string, { count: number; outcomes: Record<ForgePerformanceOutcome, number>; totalMs: number; minMs: number; maxMs: number; counts: number[] }>();
  const slow: ForgePerformanceSlowOperation[] = [];
  const resources: ForgePerformanceResourceSample[] = [];
  const canRecord = () => { if (disposed) { drops.disposed++; return false; } if (!enabled) { drops.disabled++; return false; } return true; };
  const observe = (work: () => void) => {
    if (!canRecord()) return;
    const start = monotonic(); overhead.recordCalls++;
    try { work(); } catch { drops.recorderErrors++; }
    finally { const end = monotonic(); if (start !== null && end !== null && end >= start && overhead.recordMs !== null) overhead.recordMs += end - start; else overhead.recordMs = null; }
  };
  const recordOperation = (input: ForgePerformanceOperationInput) => observe(() => {
    if (!input || typeof input !== 'object') { drops.invalidOperations++; return; }
    const { name, durationMs, outcome, correlationId, atUnixMs } = input;
    if (!isForgePerformanceOperationName(name) || !finiteNonnegative(durationMs) || durationMs > 86_400_000 || !FORGE_PERFORMANCE_OUTCOMES.includes(outcome) || !correlation(correlationId) || atUnixMs !== undefined && atUnixMs !== null && !finiteNonnegative(atUnixMs)) { drops.invalidOperations++; return; }
    let entry = operations.get(name);
    if (!entry) {
      if (operations.size >= limits.maxOperations) { drops.operationCapacity++; return; }
      entry = { count: 0, outcomes: outcomes(), totalMs: 0, minMs: durationMs, maxMs: durationMs, counts: FORGE_PERFORMANCE_HISTOGRAM_MS.map(() => 0) };
      operations.set(name, entry);
    }
    entry.count++; entry.outcomes[outcome]++; entry.totalMs += durationMs;
    entry.minMs = Math.min(entry.minMs, durationMs); entry.maxMs = Math.max(entry.maxMs, durationMs);
    const bucket = FORGE_PERFORMANCE_HISTOGRAM_MS.findIndex(bound => durationMs <= bound);
    entry.counts[bucket]++;
    if (durationMs >= limits.slowOperationMs || outcome !== 'ok') {
      if (slow.length >= limits.maxSlowOperations) { slow.shift(); drops.slowOverwrites++; }
      slow.push({ name, durationMs, outcome, atUnixMs: atUnixMs === undefined ? wall() : atUnixMs, ...(correlationId ? { correlationId } : {}) });
    }
  });
  const recordResource = (input: Partial<ForgePerformanceResourceSample>) => observe(() => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) { drops.invalidResources++; return; }
    const atUnixMs = input.atUnixMs;
    if (atUnixMs !== undefined && atUnixMs !== null && !finiteNonnegative(atUnixMs)) { drops.invalidResources++; return; }
    const sample = { atUnixMs: atUnixMs === undefined ? wall() : atUnixMs } as ForgePerformanceResourceSample;
    for (const field of RESOURCE_FIELDS) {
      const value = input[field];
      if (value !== undefined && value !== null && !finiteNonnegative(value) || field === 'eventLoopUtilization' && typeof value === 'number' && value > 1 || field === 'cpuHostPercent' && typeof value === 'number' && value > 100 || field === 'logicalCpuCount' && value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 1)) { drops.invalidResources++; return; }
      sample[field] = value ?? null;
    }
    if (resources.length >= limits.maxResources) { resources.shift(); drops.resourceOverwrites++; }
    resources.push(sample);
  });
  const startOperation = (name: string | (() => string), correlationId?: string) => {
    if (disposed || !enabled) return () => {};
    if (typeof name !== 'function' && !isForgePerformanceOperationName(name) || !correlation(correlationId)) { drops.invalidOperations++; return () => {}; }
    const start = monotonic(); const originalGeneration = generation; let complete = false;
    return (outcome: ForgePerformanceOutcome = 'ok') => {
      try {
        if (complete) { drops.duplicateFinishes++; return; } complete = true;
        if (originalGeneration !== generation) { drops.staleFinishes++; return; }
        const end = monotonic();
        if (start === null || end === null || end < start) { drops.invalidOperations++; return; }
        const resolvedName = typeof name === 'function' ? name() : name;
        recordOperation({ name: resolvedName, correlationId, durationMs: end - start, outcome });
      } catch { drops.recorderErrors++; }
    };
  };
  const snapshot = (): ForgePerformanceSnapshot => {
    const start = monotonic();
    const summaries = [...operations].map(([name, entry]): ForgePerformanceOperationSummary => {
      const percentile = (p: number) => { let cumulative = 0; const target = Math.ceil(entry.count * p); for (let i = 0; i < entry.counts.length; i++) { cumulative += entry.counts[i]; if (cumulative >= target) return Math.min(FORGE_PERFORMANCE_HISTOGRAM_MS[i], entry.maxMs); } return null; };
      return { name, count: entry.count, outcomes: { ...entry.outcomes }, totalMs: entry.totalMs, minMs: entry.minMs, maxMs: entry.maxMs, meanMs: entry.totalMs / entry.count, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), quantileMethod: 'fixed-histogram-upper-bound', histogram: { upperBoundsMs: [...FORGE_PERFORMANCE_HISTOGRAM_MS], counts: [...entry.counts] } };
    });
    const result: ForgePerformanceSnapshot = {
      schemaVersion: FORGE_PERFORMANCE_SCHEMA_VERSION, producer: { ...producer }, enabled, disposed, startedAtUnixMs, capturedAtUnixMs: wall(),
      operations: summaries, recentSlowOperations: slow.map(row => ({ ...row })), resources: resources.map(row => ({ ...row })),
      drops: { ...drops }, limits: { ...limits }, selfOverhead: { ...overhead },
      coverage: { operations: 'instrumented-boundaries-only', cpuAttribution: 'process-interval-not-exclusive-operation', memoryAttribution: 'process-or-host-estimates-not-function-allocations', quantiles: 'histogram-estimates', resourceFields: 'null-means-unavailable-or-unsampled', functionProfiles: 'separate-bounded-producer', limitsAre: 'retained-state-not-os-quota' },
    };
    const bytes = () => new TextEncoder().encode(JSON.stringify(result)).byteLength;
    while (bytes() > limits.maxSnapshotBytes) {
      if (result.resources.length) result.resources.shift();
      else if (result.recentSlowOperations.length) result.recentSlowOperations.shift();
      else if (result.operations.length) result.operations.pop();
      else break;
      result.drops.snapshotOmissions++; drops.snapshotOmissions++;
    }
    const immutable = freezeTree(result);
    const end = monotonic(); overhead.snapshotCalls++;
    if (start !== null && end !== null && end >= start && overhead.snapshotMs !== null) overhead.snapshotMs += end - start; else overhead.snapshotMs = null;
    return immutable;
  };
  return {
    recordOperation, recordResource, startOperation, snapshot, isEnabled: () => enabled && !disposed,
    measureSync<T>(name: string, work: () => T, correlationId?: string): T {
      const finish = startOperation(name, correlationId);
      try { const result = work(); finish('ok'); return result; } catch (error) { finish('error'); throw error; }
    },
    async measureAsync<T>(name: string, work: () => PromiseLike<T> | T, correlationId?: string): Promise<T> {
      const finish = startOperation(name, correlationId);
      try { const result = await work(); finish('ok'); return result; } catch (error) { finish('error'); throw error; }
    },
    setEnabled(value: boolean) { if (!disposed && typeof value === 'boolean' && value !== enabled) { generation++; enabled = value; } },
    reset() { if (disposed) return; generation++; operations.clear(); slow.length = resources.length = 0; drops = emptyDrops(); overhead = emptyOverhead(); startedAtUnixMs = wall(); },
    dispose() { if (disposed) return; generation++; disposed = true; enabled = false; operations.clear(); slow.length = resources.length = 0; },
  };
}
