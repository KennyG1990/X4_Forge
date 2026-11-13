/** Private IPC data contract only. Decoding is neither channel authentication nor a control ACK. */
import {
  FORGE_PERFORMANCE_SCHEMA_VERSION, FORGE_PERFORMANCE_LIMITS, FORGE_PERFORMANCE_HISTOGRAM_MS,
  FORGE_PERFORMANCE_OUTCOMES, type ForgePerformanceSnapshot,
} from './forgePerformance';

export const NATIVE_PERFORMANCE_OPERATION_IDS = Object.freeze([
  'native.activate', 'native.backend.ensure', 'native.backend.spawn', 'native.backend.stop',
  'native.backend.restart', 'native.panel.open', 'native.command', 'native.provider.read',
  'native.provider.write', 'native.validation.queue', 'native.validation.scan',
  'native.validation.overlay', 'native.validation.serialize', 'native.validation.http',
  'native.validation.map', 'native.validation.apply',
] as const);
export const NATIVE_OPERATION_IDS = NATIVE_PERFORMANCE_OPERATION_IDS;
export type NativeOperationId = typeof NATIVE_PERFORMANCE_OPERATION_IDS[number];
const operationIds = new Set<string>(NATIVE_PERFORMANCE_OPERATION_IDS);
export const isNativeOperationId = (value: unknown): value is NativeOperationId => typeof value === 'string' && operationIds.has(value);
export const isNativeInstanceId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);

export const NATIVE_PERFORMANCE_LIMITS = Object.freeze({
  minDurationMs: 1000, maxDurationMs: 900_000, defaultDurationMs: 60_000,
  minIntervalMs: 1000, maxIntervalMs: 60_000, defaultIntervalMs: 2000,
  maxOwnedTimers: 16,
  maxControlBytes: 4096, maxFrameBytes: FORGE_PERFORMANCE_LIMITS.maxSnapshotBytes + 2048,
  maxDepth: 12, maxNodes: 30_000, maxFields: 48, maxArrayLength: 128, maxStringChars: 256,
});
export interface NativeCaptureKey { epoch: string; captureId: string }
export interface NativeCollectionOptions { durationMs?: number; intervalMs?: number; eventLoopDelay?: boolean }
export type NativeStopReason = 'requested' | 'expired' | 'cancelled' | 'retired' | 'disposed';
export interface NativePerformanceStatus {
  schemaVersion: 'forge.native-performance.status.v1';
  producer: { component: 'extension-host'; scope: 'shared-process'; pid: number; instanceId: string };
  disposed: boolean; collectionActive: boolean; captureId: string | null;
  collectionStartedAtUnixMs: number | null; collectionExpiresAtUnixMs: number | null;
  intervalMs: number; eventLoopDelayMonitoring: boolean;
  resourceSamples: number; resourceErrors: number; throttledSamples: number; counterResets: number;
  sampleOverheadMs: number;
  lastResourceError: null | 'unavailable' | 'producer-identity-changed' | 'clock-unavailable';
  collectionStopDelayMs: number | null; collectionCleanupUnconfirmed: boolean;
  ownedTimerCount: number; failedTimerCount: number; lastStopReason: NativeStopReason | null;
}
export type NativeControlFailureCode =
  | 'NATIVE_PERFORMANCE_INPUT_INVALID' | 'NATIVE_PERFORMANCE_BUSY'
  | 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH' | 'NATIVE_PERFORMANCE_DISPOSED'
  | 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED' | 'NATIVE_PERFORMANCE_START_FAILED';
export type NativeControlResult =
  | { ok: true; status: NativePerformanceStatus }
  | { ok: false; code: NativeControlFailureCode; status: NativePerformanceStatus };

type Data = Record<string, unknown>;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
function integerFields<K extends string>(value: Data, keys: readonly K[]): value is Data & Record<K, number> {
  return keys.every(key => integer(value[key]));
}
const nullable = (value: unknown) => value === null || finite(value);
const stopReasons: readonly NativeStopReason[] = ['requested', 'expired', 'cancelled', 'retired', 'disposed'];
const failureCodes: readonly NativeControlFailureCode[] = [
  'NATIVE_PERFORMANCE_INPUT_INVALID', 'NATIVE_PERFORMANCE_BUSY', 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH',
  'NATIVE_PERFORMANCE_DISPOSED', 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED', 'NATIVE_PERFORMANCE_START_FAILED',
];
const isStopReason = (value: unknown): value is NativeStopReason => typeof value === 'string' && stopReasons.includes(value as NativeStopReason);
const invalidData = () => new TypeError('NATIVE_WIRE_INVALID');

/** Copy data descriptors, never accessors. Limits also terminate cycles before stringify. */
function copyData(value: unknown, depth = 0, budget = { nodes: 0 }): unknown {
  if (++budget.nodes > NATIVE_PERFORMANCE_LIMITS.maxNodes || depth > NATIVE_PERFORMANCE_LIMITS.maxDepth) throw invalidData();
  if (value === null || value === undefined || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw invalidData(); return value; }
  if (typeof value === 'string') { if (value.length > NATIVE_PERFORMANCE_LIMITS.maxStringChars) throw invalidData(); return value; }
  if (typeof value !== 'object') throw invalidData();
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!integer(length) || length > NATIVE_PERFORMANCE_LIMITS.maxArrayLength) throw invalidData();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1) throw invalidData();
    const result: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalidData();
      result.push(copyData(descriptor.value, depth + 1, budget));
    }
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) throw invalidData();
  const keys = Reflect.ownKeys(value);
  if (keys.length > NATIVE_PERFORMANCE_LIMITS.maxFields) throw invalidData();
  const result: Data = {};
  for (const key of keys) {
    if (typeof key !== 'string') throw invalidData();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalidData();
    Object.defineProperty(result, key, { value: copyData(descriptor.value, depth + 1, budget), enumerable: true, configurable: true, writable: true });
  }
  return result;
}
function record(value: unknown, keys: readonly string[], optional: readonly string[] = []): value is Data {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && keys.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => keys.includes(key) || optional.includes(key));
}
function checked(value: unknown, test: (data: unknown) => boolean): boolean {
  try { return test(copyData(value)); } catch { return false; }
}
export function isNativeCaptureKey(value: unknown): value is NativeCaptureKey {
  return checked(value, data => record(data, ['epoch', 'captureId']) && isNativeInstanceId(data.epoch) && isNativeInstanceId(data.captureId));
}
export function normalizeNativeCollectionOptions(value: unknown = undefined):
  | { ok: true; options: Readonly<Required<NativeCollectionOptions>> }
  | { ok: false; code: 'NATIVE_PERFORMANCE_INPUT_INVALID' } {
  try {
    const data = value === undefined ? {} : copyData(value);
    if (!record(data, [], ['durationMs', 'intervalMs', 'eventLoopDelay'])) throw invalidData();
    const durationMs = data.durationMs === undefined ? NATIVE_PERFORMANCE_LIMITS.defaultDurationMs : data.durationMs;
    const intervalMs = data.intervalMs === undefined ? NATIVE_PERFORMANCE_LIMITS.defaultIntervalMs : data.intervalMs;
    const eventLoopDelay = data.eventLoopDelay === undefined ? false : data.eventLoopDelay;
    if (!integer(durationMs) || durationMs < 1000 || durationMs > 900_000 || !integer(intervalMs) || intervalMs < 1000 || intervalMs > 60_000 || typeof eventLoopDelay !== 'boolean') throw invalidData();
    return { ok: true, options: Object.freeze({ durationMs, intervalMs, eventLoopDelay }) };
  } catch { return { ok: false, code: 'NATIVE_PERFORMANCE_INPUT_INVALID' }; }
}
function producer(value: unknown): value is Data {
  return record(value, ['component', 'scope', 'pid', 'instanceId']) && value.component === 'extension-host'
    && value.scope === 'shared-process' && integer(value.pid) && value.pid > 0 && isNativeInstanceId(value.instanceId);
}
const statusFields = [
  'schemaVersion', 'producer', 'disposed', 'collectionActive', 'captureId', 'collectionStartedAtUnixMs',
  'collectionExpiresAtUnixMs', 'intervalMs', 'eventLoopDelayMonitoring', 'resourceSamples', 'resourceErrors',
  'throttledSamples', 'counterResets', 'sampleOverheadMs', 'lastResourceError', 'collectionStopDelayMs',
  'collectionCleanupUnconfirmed', 'ownedTimerCount', 'failedTimerCount', 'lastStopReason',
] as const;
function status(value: unknown): value is Data {
  if (!record(value, statusFields) || value.schemaVersion !== 'forge.native-performance.status.v1' || !producer(value.producer)) return false;
  return ['disposed', 'collectionActive', 'eventLoopDelayMonitoring', 'collectionCleanupUnconfirmed'].every(key => typeof value[key] === 'boolean')
    && (value.captureId === null || isNativeInstanceId(value.captureId))
    && ['collectionStartedAtUnixMs', 'collectionExpiresAtUnixMs', 'collectionStopDelayMs'].every(key => nullable(value[key]))
    && integer(value.intervalMs) && value.intervalMs >= 1000 && value.intervalMs <= 60_000
    && integerFields(value, ['resourceSamples', 'resourceErrors', 'throttledSamples', 'counterResets', 'ownedTimerCount', 'failedTimerCount'])
    && value.ownedTimerCount <= NATIVE_PERFORMANCE_LIMITS.maxOwnedTimers && value.failedTimerCount <= NATIVE_PERFORMANCE_LIMITS.maxOwnedTimers
    && finite(value.sampleOverheadMs) && [null, 'unavailable', 'producer-identity-changed', 'clock-unavailable'].includes(value.lastResourceError as string | null)
    && (value.lastStopReason === null || isStopReason(value.lastStopReason))
    && (!value.collectionActive || value.captureId !== null && !value.disposed);
}
export function isNativePerformanceStatus(value: unknown): value is NativePerformanceStatus { return checked(value, status); }
function controlResult(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const ok = Object.getOwnPropertyDescriptor(value, 'ok')?.value;
  return ok === true ? record(value, ['ok', 'status']) && status(value.status)
    : ok === false && record(value, ['ok', 'code', 'status']) && typeof value.code === 'string'
      && failureCodes.includes(value.code as NativeControlFailureCode) && status(value.status);
}
export function isNativeControlResult(value: unknown): value is NativeControlResult { return checked(value, controlResult); }
const resourceFields = [
  'atUnixMs', 'elapsedMs', 'cpuUserMicros', 'cpuSystemMicros', 'cpuOneCorePercent', 'cpuHostPercent', 'logicalCpuCount',
  'rssBytes', 'heapUsedBytes', 'heapTotalBytes', 'externalBytes', 'arrayBuffersBytes', 'uptimeSeconds', 'eventLoopUtilization',
  'eventLoopDelayP50Ms', 'eventLoopDelayP95Ms', 'eventLoopDelayMaxMs', 'fps', 'frameIntervalMs', 'longTaskDurationMs', 'jsHeapUsedBytes',
] as const;
const dropFields = ['disabled', 'disposed', 'invalidOperations', 'invalidResources', 'operationCapacity', 'slowOverwrites', 'resourceOverwrites', 'duplicateFinishes', 'recorderErrors', 'snapshotOmissions', 'staleFinishes'] as const;
const coverage = {
  operations: 'instrumented-boundaries-only', cpuAttribution: 'process-interval-not-exclusive-operation',
  memoryAttribution: 'process-or-host-estimates-not-function-allocations', quantiles: 'histogram-estimates',
  resourceFields: 'null-means-unavailable-or-unsampled', functionProfiles: 'separate-bounded-producer', limitsAre: 'retained-state-not-os-quota',
} as const;
function snapshot(value: unknown): value is Data {
  if (!record(value, ['schemaVersion', 'producer', 'enabled', 'disposed', 'startedAtUnixMs', 'capturedAtUnixMs', 'operations', 'recentSlowOperations', 'resources', 'drops', 'limits', 'selfOverhead', 'coverage'])
    || value.schemaVersion !== FORGE_PERFORMANCE_SCHEMA_VERSION || !producer(value.producer)
    || typeof value.enabled !== 'boolean' || typeof value.disposed !== 'boolean' || !nullable(value.startedAtUnixMs) || !nullable(value.capturedAtUnixMs)
    || !Array.isArray(value.operations) || !Array.isArray(value.recentSlowOperations) || !Array.isArray(value.resources)
    || value.operations.length > FORGE_PERFORMANCE_LIMITS.maxOperations || value.recentSlowOperations.length > FORGE_PERFORMANCE_LIMITS.maxSlowOperations || value.resources.length > FORGE_PERFORMANCE_LIMITS.maxResources) return false;
  const names = new Set<string>();
  for (const row of value.operations) {
    if (!record(row, ['name', 'count', 'outcomes', 'totalMs', 'minMs', 'maxMs', 'meanMs', 'p50Ms', 'p95Ms', 'p99Ms', 'quantileMethod', 'histogram'])
      || !isNativeOperationId(row.name) || names.has(row.name) || !integer(row.count) || row.count < 1
      || !['totalMs', 'minMs', 'maxMs', 'meanMs'].every(key => finite(row[key])) || !['p50Ms', 'p95Ms', 'p99Ms'].every(key => nullable(row[key]))
      || row.quantileMethod !== 'fixed-histogram-upper-bound' || !record(row.outcomes, FORGE_PERFORMANCE_OUTCOMES)
      || !FORGE_PERFORMANCE_OUTCOMES.every(key => integer((row.outcomes as Data)[key]))
      || Object.values(row.outcomes).reduce<number>((sum, count) => sum + Number(count), 0) !== row.count
      || !record(row.histogram, ['upperBoundsMs', 'counts']) || !Array.isArray(row.histogram.upperBoundsMs) || !Array.isArray(row.histogram.counts)
      || row.histogram.upperBoundsMs.length !== FORGE_PERFORMANCE_HISTOGRAM_MS.length || row.histogram.counts.length !== FORGE_PERFORMANCE_HISTOGRAM_MS.length
      || !row.histogram.upperBoundsMs.every((bound, index) => bound === FORGE_PERFORMANCE_HISTOGRAM_MS[index])
      || !row.histogram.counts.every(integer) || row.histogram.counts.reduce((sum, count) => sum + count, 0) !== row.count) return false;
    names.add(row.name);
  }
  if (!value.recentSlowOperations.every(row => record(row, ['name', 'durationMs', 'outcome', 'atUnixMs']) && isNativeOperationId(row.name)
    && finite(row.durationMs) && FORGE_PERFORMANCE_OUTCOMES.includes(row.outcome as typeof FORGE_PERFORMANCE_OUTCOMES[number]) && nullable(row.atUnixMs))) return false;
  if (!value.resources.every(row => record(row, resourceFields) && resourceFields.every(key => nullable(row[key]))
    && ['fps', 'frameIntervalMs', 'longTaskDurationMs', 'jsHeapUsedBytes'].every(key => row[key] === null))) return false;
  if (!record(value.drops, dropFields) || !dropFields.every(key => integer((value.drops as Data)[key]))) return false;
  const limits = value.limits;
  if (!record(limits, ['maxOperations', 'maxSlowOperations', 'maxResources', 'maxSnapshotBytes', 'maxNameChars', 'maxCorrelationChars', 'slowOperationMs'])) return false;
  if (!integerFields(limits, ['maxOperations', 'maxSlowOperations', 'maxResources', 'maxSnapshotBytes', 'maxNameChars', 'maxCorrelationChars'])) return false;
  for (const key of ['maxOperations', 'maxSlowOperations', 'maxResources', 'maxSnapshotBytes', 'maxNameChars', 'maxCorrelationChars'] as const) {
    if (!integer(limits[key]) || limits[key] < 1 || limits[key] > FORGE_PERFORMANCE_LIMITS[key]) return false;
  }
  if (!finite(limits.slowOperationMs) || limits.slowOperationMs > 86_400_000 || value.operations.length > limits.maxOperations
    || value.recentSlowOperations.length > limits.maxSlowOperations || value.resources.length > limits.maxResources) return false;
  const overhead = value.selfOverhead;
  if (!record(overhead, ['recordCalls', 'recordMs', 'snapshotCalls', 'snapshotMs', 'clockFailures', 'snapshotScope'])
    || !['recordCalls', 'snapshotCalls', 'clockFailures'].every(key => integer(overhead[key])) || !nullable(overhead.recordMs) || !nullable(overhead.snapshotMs)
    || overhead.snapshotScope !== 'completed-prior-snapshots-including-serialization-and-freeze') return false;
  return record(value.coverage, Object.keys(coverage)) && Object.entries(coverage).every(([key, expected]) => (value.coverage as Data)[key] === expected)
    && utf8Length(JSON.stringify(value)) <= Number(limits.maxSnapshotBytes);
}
export function isNativePerformanceSnapshot(value: unknown): value is ForgePerformanceSnapshot { return checked(value, snapshot); }

export const NATIVE_PERFORMANCE_WIRE_SCHEMA = 'forge.native-performance.wire.v1' as const;
export type NativeWireDirection = 'backend-to-host' | 'host-to-backend';
export interface NativeWireBinding { nonce: string; epoch: string }
export interface NativeWireExpectation { binding: NativeWireBinding; direction: NativeWireDirection }
export type NativeBackendMessage =
  | { type: 'hello'; backendInstanceId: string }
  | { type: 'start'; controlId: string; captureId: string; options: NativeCollectionOptions }
  | { type: 'stop'; controlId: string; captureId: string; reason: NativeStopReason }
  | { type: 'cancel'; controlId: string; captureId: string }
  | { type: 'read'; controlId: string };
export type NativeHostMessage =
  | { type: 'ready'; backendInstanceId: string; status: NativePerformanceStatus }
  | { type: 'result'; controlId: string; captureId: string; result: NativeControlResult }
  | { type: 'snapshot'; controlId: string | null; status: NativePerformanceStatus; snapshot: ForgePerformanceSnapshot }
  | { type: 'retired'; status: NativePerformanceStatus };
export type NativePerformanceMessage = NativeBackendMessage | NativeHostMessage;
export interface NativeWireHeader { schemaVersion: typeof NATIVE_PERFORMANCE_WIRE_SCHEMA; direction: NativeWireDirection; nonce: string; epoch: string; sequence: number }
export type NativePerformanceFrame = NativeWireHeader & NativePerformanceMessage;
export type NativeWireFailureCode = 'NATIVE_WIRE_INPUT_TYPE' | 'NATIVE_WIRE_TOO_LARGE' | 'NATIVE_WIRE_INVALID'
  | 'NATIVE_WIRE_BINDING_MISMATCH' | 'NATIVE_WIRE_DIRECTION_MISMATCH' | 'NATIVE_WIRE_REPLAY'
  | 'NATIVE_WIRE_RETIRED' | 'NATIVE_WIRE_SEQUENCE_EXHAUSTED' | 'NATIVE_WIRE_BINDING_INVALID';
export type NativeFrameDecodeResult = { ok: true; frame: NativePerformanceFrame } | { ok: false; code: NativeWireFailureCode };
export type NativeFrameEncodeResult = { ok: true; text: string } | { ok: false; code: NativeWireFailureCode };
const headerFields = ['schemaVersion', 'direction', 'nonce', 'epoch', 'sequence'] as const;
const direction = (value: unknown): value is NativeWireDirection => value === 'backend-to-host' || value === 'host-to-backend';
const binding = (value: unknown): value is Data => record(value, ['nonce', 'epoch']) && isNativeInstanceId(value.nonce) && isNativeInstanceId(value.epoch);
const utf8Length = (value: string) => new TextEncoder().encode(value).byteLength;
function frame(value: unknown): value is NativePerformanceFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Data;
  if (data.schemaVersion !== NATIVE_PERFORMANCE_WIRE_SCHEMA || !direction(data.direction) || !isNativeInstanceId(data.nonce)
    || !isNativeInstanceId(data.epoch) || !integer(data.sequence) || data.sequence < 1) return false;
  const exact = (keys: string[]) => record(data, [...headerFields, ...keys]);
  const control = () => isNativeInstanceId(data.controlId);
  const capture = () => isNativeInstanceId(data.captureId);
  if (data.direction === 'backend-to-host') {
    switch (data.type) {
      case 'hello': return exact(['type', 'backendInstanceId']) && isNativeInstanceId(data.backendInstanceId);
      case 'start': return exact(['type', 'controlId', 'captureId', 'options']) && control() && capture()
        && record(data.options, [], ['durationMs', 'intervalMs', 'eventLoopDelay']) && normalizeNativeCollectionOptions(data.options).ok;
      case 'stop': return exact(['type', 'controlId', 'captureId', 'reason']) && control() && capture() && isStopReason(data.reason);
      case 'cancel': return exact(['type', 'controlId', 'captureId']) && control() && capture();
      case 'read': return exact(['type', 'controlId']) && control();
      default: return false;
    }
  }
  switch (data.type) {
    case 'ready': return exact(['type', 'backendInstanceId', 'status']) && isNativeInstanceId(data.backendInstanceId) && status(data.status);
    case 'result': return exact(['type', 'controlId', 'captureId', 'result']) && control() && capture() && controlResult(data.result);
    case 'snapshot': return exact(['type', 'controlId', 'status', 'snapshot']) && (data.controlId === null || control()) && status(data.status) && snapshot(data.snapshot)
      && ['component', 'scope', 'pid', 'instanceId'].every(key => (data.status as Data).producer && ((data.status as Data).producer as Data)[key] === ((data.snapshot as Data).producer as Data)[key]);
    case 'retired': return exact(['type', 'status']) && status(data.status) && !data.status.collectionActive;
    default: return false;
  }
}
function freezeData<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeData(child); Object.freeze(value); }
  return value;
}
export function encodeNativePerformanceFrame(value: unknown): NativeFrameEncodeResult {
  try {
    const data = copyData(value);
    if (!frame(data)) return { ok: false, code: 'NATIVE_WIRE_INVALID' };
    const text = JSON.stringify(data);
    if (utf8Length(text) > (data.type === 'snapshot' ? NATIVE_PERFORMANCE_LIMITS.maxFrameBytes : NATIVE_PERFORMANCE_LIMITS.maxControlBytes)) return { ok: false, code: 'NATIVE_WIRE_TOO_LARGE' };
    return { ok: true, text };
  } catch { return { ok: false, code: 'NATIVE_WIRE_INVALID' }; }
}
export function decodeNativePerformanceFrame(raw: unknown, expected: NativeWireExpectation): NativeFrameDecodeResult {
  if (typeof raw !== 'string') return { ok: false, code: 'NATIVE_WIRE_INPUT_TYPE' };
  try {
    if (raw.length > NATIVE_PERFORMANCE_LIMITS.maxFrameBytes || utf8Length(raw) > NATIVE_PERFORMANCE_LIMITS.maxFrameBytes) return { ok: false, code: 'NATIVE_WIRE_TOO_LARGE' };
    const expectation = copyData(expected);
    if (!record(expectation, ['binding', 'direction']) || !binding(expectation.binding) || !direction(expectation.direction)) return { ok: false, code: 'NATIVE_WIRE_BINDING_INVALID' };
    const data = copyData(JSON.parse(raw));
    if (!frame(data)) return { ok: false, code: 'NATIVE_WIRE_INVALID' };
    if (utf8Length(raw) > (data.type === 'snapshot' ? NATIVE_PERFORMANCE_LIMITS.maxFrameBytes : NATIVE_PERFORMANCE_LIMITS.maxControlBytes)) return { ok: false, code: 'NATIVE_WIRE_TOO_LARGE' };
    if (data.direction !== expectation.direction) return { ok: false, code: 'NATIVE_WIRE_DIRECTION_MISMATCH' };
    if (data.nonce !== expectation.binding.nonce || data.epoch !== expectation.binding.epoch) return { ok: false, code: 'NATIVE_WIRE_BINDING_MISMATCH' };
    return { ok: true, frame: freezeData(data) };
  } catch { return { ok: false, code: 'NATIVE_WIRE_INVALID' }; }
}
export interface NativeWireSessionStatus { retired: boolean; lastReceivedSequence: number; lastSentSequence: number; rejectedFrames: number; sequenceGaps: number }
export interface NativePerformanceWireSession {
  encode(message: NativePerformanceMessage): NativeFrameEncodeResult;
  receive(raw: unknown): NativeFrameDecodeResult;
  status(): Readonly<NativeWireSessionStatus>;
  retire(): void;
}
/** Sequence acceptance is not pending-control matching, readiness, delivery or broker success. */
export function createNativePerformanceWireSession(options: { binding: NativeWireBinding; incomingDirection: NativeWireDirection }): NativePerformanceWireSession {
  let data: unknown;
  try { data = copyData(options); } catch { throw new TypeError('NATIVE_WIRE_BINDING_INVALID'); }
  if (!record(data, ['binding', 'incomingDirection']) || !binding(data.binding) || !direction(data.incomingDirection)) throw new TypeError('NATIVE_WIRE_BINDING_INVALID');
  const expected: NativeWireExpectation = { binding: { nonce: String(data.binding.nonce), epoch: String(data.binding.epoch) }, direction: data.incomingDirection };
  const outgoing: NativeWireDirection = expected.direction === 'backend-to-host' ? 'host-to-backend' : 'backend-to-host';
  let retired = false, lastReceivedSequence = 0, lastSentSequence = 0, rejectedFrames = 0, sequenceGaps = 0;
  const add = (count: number, increment = 1) => Math.min(Number.MAX_SAFE_INTEGER, count + increment);
  const rejected = (code: NativeWireFailureCode): NativeFrameDecodeResult => { rejectedFrames = add(rejectedFrames); return { ok: false, code }; };
  return {
    encode(message) {
      if (retired) return { ok: false, code: 'NATIVE_WIRE_RETIRED' };
      if (lastSentSequence === Number.MAX_SAFE_INTEGER) return { ok: false, code: 'NATIVE_WIRE_SEQUENCE_EXHAUSTED' };
      try {
        const payload = copyData(message);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || headerFields.some(key => Object.hasOwn(payload, key))) return { ok: false, code: 'NATIVE_WIRE_INVALID' };
        const result = encodeNativePerformanceFrame({ ...payload, schemaVersion: NATIVE_PERFORMANCE_WIRE_SCHEMA, direction: outgoing, ...expected.binding, sequence: lastSentSequence + 1 });
        if (result.ok === true) lastSentSequence++;
        return result;
      } catch { return { ok: false, code: 'NATIVE_WIRE_INVALID' }; }
    },
    receive(raw) {
      if (retired) return rejected('NATIVE_WIRE_RETIRED');
      const result = decodeNativePerformanceFrame(raw, expected);
      if (result.ok === false) return rejected(result.code);
      if (result.frame.sequence <= lastReceivedSequence) return rejected('NATIVE_WIRE_REPLAY');
      sequenceGaps = add(sequenceGaps, result.frame.sequence - lastReceivedSequence - 1);
      lastReceivedSequence = result.frame.sequence;
      return result;
    },
    status: () => Object.freeze({ retired, lastReceivedSequence, lastSentSequence, rejectedFrames, sequenceGaps }),
    retire() { retired = true; },
  };
}
