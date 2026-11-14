import React from 'react';
import { Activity, Play, RefreshCw, Square } from 'lucide-react';
import type { ForgeCpuProfileReport, ForgePerformanceResourceSample, ForgePerformanceSnapshot } from '../lib/forgePerformance';
import type { ForgeBackendPerformanceStatus, ForgeNativePerformanceReport, ForgeNativePerformanceOperation, ForgeNativePerformanceFailureCode } from '../server/forgePerformance';
import type { getProjectValidationCacheStats } from '../server/projectValidation';
import { readWebviewPerformance, startWebviewPerformanceCollection, stopWebviewPerformanceCollection, type WebviewPerformanceView } from '../lib/webviewPerformance';
import { useContinuousPolling } from '../lib/useContinuousPolling';
import { fetchPollingJson, pollingResourceKey } from '../lib/continuousPolling';
import { isNativeInstanceId, isNativePerformanceSnapshot, isNativePerformanceStatus, normalizeNativeCollectionOptions } from '../../shared/nativePerformanceProtocol';
import { NATIVE_PERFORMANCE_TRANSPORT_LIMITS } from '../../shared/nativePerformanceChannel';

export interface ForgePerformanceReport {
  ok: true; schemaVersion: 'forge.performance.report.v1';
  backend: ForgePerformanceSnapshot; control: ForgeBackendPerformanceStatus;
  caches: { projectValidation: ReturnType<typeof getProjectValidationCacheStats> };
  coverage: { native: 'unavailable-not-wired'; webview: 'local-current-panel-only'; profiling: 'backend-only-explicit-control'; cacheBytes: 'accounted-not-exact-heap'; operations: 'instrumented-boundaries-only' };
}
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const nullable = (value: unknown) => value === null || number(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const fields = (value: unknown, names: readonly string[], test: (item: unknown) => boolean) => object(value) && names.every(name => test(value[name]));
const outcomes = ['ok', 'error', 'cancelled', 'aborted', 'superseded'] as const;
const resourceFields = ['atUnixMs', 'elapsedMs', 'cpuUserMicros', 'cpuSystemMicros', 'cpuOneCorePercent', 'cpuHostPercent', 'logicalCpuCount', 'rssBytes', 'heapUsedBytes', 'heapTotalBytes', 'externalBytes', 'arrayBuffersBytes', 'uptimeSeconds', 'eventLoopUtilization', 'eventLoopDelayP50Ms', 'eventLoopDelayP95Ms', 'eventLoopDelayMaxMs', 'fps', 'frameIntervalMs', 'longTaskDurationMs', 'jsHeapUsedBytes'] as const;
const cacheFields = ['hits', 'misses', 'bypasses', 'evictions', 'entries', 'accountedBytes'] as const;
const boundedName = (value: unknown, max = 160) => typeof value === 'string' && value.length <= max;
function hasC0OrDel(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
function snapshotShape(value: unknown, component: 'backend' | 'webview'): value is ForgePerformanceSnapshot {
  if (!object(value) || value.schemaVersion !== 'forge.performance.v1' || !object(value.producer)) return false;
  return value.producer.component === component && value.producer.scope === (component === 'backend' ? 'owned-process' : 'webview')
    && nullable(value.producer.pid) && (value.producer.instanceId === null || boundedName(value.producer.instanceId))
    && typeof value.enabled === 'boolean' && typeof value.disposed === 'boolean' && nullable(value.startedAtUnixMs) && nullable(value.capturedAtUnixMs)
    && Array.isArray(value.operations) && value.operations.length <= 128 && value.operations.every(row => object(row)
      && boundedName(row.name) && fields(row, ['count', 'totalMs', 'minMs', 'maxMs', 'meanMs'], number)
      && fields(row, ['p50Ms', 'p95Ms', 'p99Ms'], nullable) && fields(row.outcomes, outcomes, number)
      && row.quantileMethod === 'fixed-histogram-upper-bound' && object(row.histogram)
      && Array.isArray(row.histogram.upperBoundsMs) && row.histogram.upperBoundsMs.length <= 64 && row.histogram.upperBoundsMs.every(number)
      && Array.isArray(row.histogram.counts) && row.histogram.counts.length === row.histogram.upperBoundsMs.length && row.histogram.counts.every(number))
    && Array.isArray(value.recentSlowOperations) && value.recentSlowOperations.length <= 64 && value.recentSlowOperations.every(row => object(row)
      && boundedName(row.name) && number(row.durationMs) && nullable(row.atUnixMs) && outcomes.includes(row.outcome as typeof outcomes[number])
      && (row.correlationId === undefined || boundedName(row.correlationId, 80)))
    && Array.isArray(value.resources) && value.resources.length <= 120 && value.resources.every(row => fields(row, resourceFields, nullable))
    && fields(value.drops, ['disabled', 'disposed', 'invalidOperations', 'invalidResources', 'operationCapacity', 'slowOverwrites', 'resourceOverwrites', 'duplicateFinishes', 'recorderErrors', 'snapshotOmissions', 'staleFinishes'], number)
    && fields(value.limits, ['maxOperations', 'maxSlowOperations', 'maxResources', 'maxSnapshotBytes', 'maxNameChars', 'maxCorrelationChars', 'slowOperationMs'], number)
    && fields(value.selfOverhead, ['recordCalls', 'snapshotCalls', 'clockFailures'], number)
    && fields(value.selfOverhead, ['recordMs', 'snapshotMs'], nullable) && object(value.selfOverhead)
    && value.selfOverhead.snapshotScope === 'completed-prior-snapshots-including-serialization-and-freeze'
    && object(value.coverage) && value.coverage.operations === 'instrumented-boundaries-only' && value.coverage.quantiles === 'histogram-estimates'
    && value.coverage.resourceFields === 'null-means-unavailable-or-unsampled'
    && value.coverage.cpuAttribution === 'process-interval-not-exclusive-operation'
    && value.coverage.memoryAttribution === 'process-or-host-estimates-not-function-allocations'
    && value.coverage.functionProfiles === 'separate-bounded-producer' && value.coverage.limitsAre === 'retained-state-not-os-quota';
}
export function isForgePerformanceReport(value: unknown): value is ForgePerformanceReport {
  if (!object(value) || value.ok !== true || value.schemaVersion !== 'forge.performance.report.v1' || !snapshotShape(value.backend, 'backend')) return false;
  const control = value.control;
  return fields(control, ['disposed', 'collectionActive', 'profilingEnabled', 'profileActive', 'eventLoopDelayMonitoring', 'profileCleanupUnconfirmed', 'collectionCleanupUnconfirmed', 'abortListenerCleanupUnconfirmed'], item => typeof item === 'boolean')
    && fields(control, ['collectionStartedAtUnixMs', 'collectionExpiresAtUnixMs', 'collectionStopDelayMs', 'profileCooldownRemainingMs'], nullable)
    && fields(control, ['intervalMs', 'resourceSamples', 'resourceErrors', 'throttledSamples', 'counterResets', 'sampleOverheadMs', 'profileCapturesStarted', 'profileCapturesSucceeded', 'profileCapturesFailed', 'profileRateLimited', 'ownedTimerCount', 'failedTimerCount'], number)
    && object(control) && [null, 'unavailable', 'producer-identity-changed', 'clock-unavailable'].includes(control.lastResourceError as string | null)
    && object(control.coverage) && number(control.coverage.backendPid) && control.coverage.backendPid > 0 && control.coverage.backendPid === value.backend.producer.pid
    && control.coverage.extensionHost === 'not-this-producer' && control.coverage.webview === 'not-this-producer'
    && control.coverage.childProcesses === 'excluded' && control.coverage.memory === 'process-not-function' && control.coverage.cpu === 'process-interval'
    && object(value.caches) && fields(value.caches.projectValidation, cacheFields, number)
    && object(value.caches.projectValidation) && fields(value.caches.projectValidation.lua, cacheFields, number) && fields(value.caches.projectValidation.effectiveSchema, cacheFields, number)
    && object(value.coverage) && value.coverage.native === 'unavailable-not-wired' && value.coverage.webview === 'local-current-panel-only'
    && value.coverage.profiling === 'backend-only-explicit-control' && value.coverage.cacheBytes === 'accounted-not-exact-heap'
    && value.coverage.operations === 'instrumented-boundaries-only';
}
export function isForgeCpuProfile(value: unknown): value is ForgeCpuProfileReport {
  return object(value) && value.ok === true && value.schemaVersion === 'forge.cpu-profile.v1'
    && object(value.producer) && value.producer.component === 'backend' && value.producer.scope === 'owned-process' && nullable(value.producer.pid)
    && (value.producer.instanceId === null || boundedName(value.producer.instanceId))
    && number(value.requestedDurationMs) && number(value.samplingIntervalMicros) && number(value.scannedSampleCount)
    && fields(value, ['observedDurationMs', 'delayedStopMs', 'profileDurationMicros', 'sampleCount'], nullable)
    && Array.isArray(value.functions) && value.functions.length <= 64 && value.functions.every(row => object(row)
      && boundedName(row.name, 128) && boundedName(row.module) && !/^(?:[A-Za-z]:[\\/]|[\\/])|:\/\/|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(String(row.module)) && !hasC0OrDel(row.module)
      && fields(row, ['line', 'column', 'selfSampleMicros'], nullable) && number(row.selfSamples))
    && fields(value.omitted, ['nodes', 'samples', 'functions', 'unknownNodeSamples', 'invalidNodes', 'invalidDeltas', 'redactedLabels'], number)
    && object(value.coverage) && value.coverage.process === 'current-backend-only' && value.coverage.attribution === 'sampled-self-time-not-exact-operation-cpu'
    && value.coverage.rawProfile === 'not-returned-or-persisted' && value.coverage.timer === 'event-loop-blockage-can-delay-stop'
    && value.coverage.resourceLimit === 'no-os-heap-quota' && ['available', 'unavailable'].includes(String(value.coverage.samples));
}
const nativeFailures: Readonly<Record<ForgeNativePerformanceFailureCode, { status: number; message: string }>> = {
  NATIVE_PERFORMANCE_INPUT_INVALID: { status: 400, message: 'The native capture inputs are invalid.' },
  NATIVE_PERFORMANCE_BUSY: { status: 409, message: 'Another native operation is pending. Refresh status.' },
  NATIVE_PERFORMANCE_CAPTURE_MISMATCH: { status: 409, message: 'The selected native capture changed. Refresh before targeting another capture.' },
  NATIVE_PERFORMANCE_IDENTITY_MISMATCH: { status: 409, message: 'The backend or native instance changed. Refresh its identity.' },
  NATIVE_PERFORMANCE_PREEMPTED: { status: 409, message: 'Another operation replaced this request. Refresh status.' },
  NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED: { status: 409, message: 'Native cleanup is unconfirmed. Refresh status before retrying cleanup.' },
  NATIVE_PERFORMANCE_DISPOSED: { status: 503, message: 'The native producer was disposed.' },
  NATIVE_PERFORMANCE_UNAVAILABLE: { status: 503, message: 'The native producer is unavailable.' },
  NATIVE_PERFORMANCE_RETIRED: { status: 503, message: 'This native channel retired. Its previous status cannot confirm cleanup.' },
  NATIVE_PERFORMANCE_AUTHORITY_REVOKED: { status: 403, message: 'Native telemetry access is no longer authorized.' },
  NATIVE_PERFORMANCE_NOT_OWNER: { status: 403, message: 'This caller does not own the selected native capture.' },
  NATIVE_PERFORMANCE_CONTROL_TIMEOUT: { status: 408, message: 'The native request timed out. Its execution and cleanup outcome are unknown; refresh status.' },
  NATIVE_PERFORMANCE_ABORTED: { status: 408, message: 'Native cancellation was requested. Refresh status to establish execution and cleanup.' },
  NATIVE_PERFORMANCE_PROTOCOL_ERROR: { status: 502, message: 'The native producer returned an invalid protocol result.' },
  NATIVE_PERFORMANCE_READER_LIMIT: { status: 429, message: 'The native read limit was reached. Wait for the current read to settle.' },
  NATIVE_PERFORMANCE_START_FAILED: { status: 500, message: 'The native producer could not start collection. Refresh status.' },
  NATIVE_PERFORMANCE_REQUEST_FAILED: { status: 500, message: 'The native request failed. Refresh status; no execution result is claimed.' },
};
const nativeAvailability = ['unavailable', 'waiting', 'ready', 'retired'] as const;
const nativeReasons = ['transport-absent', 'contract-invalid', 'waiting', 'ready-timeout', 'producer-disposed', 'retired', 'authority-revoked', null] as const;
const nativeRefreshOutcomes = ['never', 'pending', 'ok', 'timeout', 'aborted', 'preempted', 'rejected', 'invalidated', 'retired'] as const;
const nativeInteger = (value: unknown) => number(value) && Number.isSafeInteger(value);
function nativeRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  return object(value) && required.every(key => Object.hasOwn(value, key)) && Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string' || (!required.includes(key) && !optional.includes(key))) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
  });
}
/** Native DTOs have their own strict producer and control contract; backend v1 stays unchanged. */
export function isForgeNativePerformanceReport(value: unknown, operation?: ForgeNativePerformanceOperation): value is ForgeNativePerformanceReport {
  try {
    if (!nativeRecord(value, ['schemaVersion', 'operation', 'ok', 'availability', 'unavailableReason', 'ownership', 'status'], ['code'])
      || value.schemaVersion !== 'forge.native-performance.report.v1' || typeof value.operation !== 'string' || !['read', 'start', 'stop'].includes(value.operation)
      || (operation !== undefined && value.operation !== operation) || typeof value.ok !== 'boolean'
      || !nativeAvailability.some(item => item === value.availability) || !nativeReasons.some(item => item === value.unavailableReason)
      || typeof value.ownership !== 'string' || !['none', 'self', 'other', 'operator'].includes(value.ownership)) return false;
    if (value.ok ? Object.hasOwn(value, 'code') : typeof value.code !== 'string' || !Object.hasOwn(nativeFailures, value.code)) return false;
    if (value.status === null) return value.availability === 'unavailable' && value.ownership === 'none'
      && (value.ok ? value.operation === 'read' && value.unavailableReason === 'transport-absent'
        : ['transport-absent', 'contract-invalid', 'authority-revoked'].includes(String(value.unavailableReason)));
    const status = value.status;
    if (!nativeRecord(status, ['schemaVersion', 'backendInstanceId', 'availability', 'unavailableReason', 'native', 'pending', 'cancellation',
      'cleanupUnconfirmed', 'orphaned', 'captureOwned', 'readSubscribers', 'snapshot', 'snapshotAgeMs', 'lastRefreshOutcome',
      'rejectedMessages', 'lateResults', 'droppedSnapshots', 'timerCleanupUnconfirmed'])
      || status.schemaVersion !== 'forge.native-performance.broker.v1' || !isNativeInstanceId(status.backendInstanceId)
      || status.availability !== value.availability || status.unavailableReason !== value.unavailableReason
      || ![null, 'read', 'start', 'stop'].some(item => item === status.pending)
      || typeof status.cancellation !== 'string' || !['none', 'pending', 'unknown'].includes(status.cancellation)
      || !fields(status, ['cleanupUnconfirmed', 'orphaned', 'captureOwned', 'timerCleanupUnconfirmed'], item => typeof item === 'boolean')
      || !fields(status, ['readSubscribers', 'rejectedMessages', 'lateResults', 'droppedSnapshots'], nativeInteger)
      || Number(status.readSubscribers) > NATIVE_PERFORMANCE_TRANSPORT_LIMITS.readers || !nullable(status.snapshotAgeMs)
      || !nativeRefreshOutcomes.some(item => item === status.lastRefreshOutcome)
      || !(status.native === null || isNativePerformanceStatus(status.native))) return false;
    if (status.availability === 'ready' && (status.native === null || (isNativePerformanceStatus(status.native) && status.native.disposed) || status.unavailableReason !== null)) return false;
    if ((status.availability === 'waiting' && status.unavailableReason !== 'waiting') || (status.availability === 'retired' && status.unavailableReason !== 'retired')) return false;
    if (!value.ok && (value.code === 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED' || value.code === 'NATIVE_PERFORMANCE_NOT_OWNER')
      && (status.snapshot !== null || status.snapshotAgeMs !== null)) return false;
    if (value.operation !== 'read' && (status.snapshot !== null || status.snapshotAgeMs !== null)) return false;
    if (status.snapshot === null) return status.snapshotAgeMs === null;
    return status.native !== null && isNativePerformanceStatus(status.native) && isNativePerformanceSnapshot(status.snapshot)
      && status.snapshot.producer.instanceId === status.native.producer.instanceId
      && status.snapshot.producer.pid === status.native.producer.pid;
  } catch { return false; }
}
export const performanceNumber = (value: number | null | undefined, suffix = '', digits = 1) => number(value) ? `${value.toLocaleString(undefined, { maximumFractionDigits: digits })}${suffix}` : 'Unknown';
const bytes = (value: number | null | undefined) => number(value) ? performanceNumber(value / 1024 / 1024, ' MiB') : 'Unknown';
const time = (value: number | null | undefined) => number(value) && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleTimeString() : 'Unknown';
const producerKey = (value: ForgePerformanceSnapshot['producer']) => JSON.stringify([value.component, value.scope, value.pid, value.instanceId]);
const latest = (snapshot: ForgePerformanceSnapshot, field: keyof ForgePerformanceResourceSample) => [...snapshot.resources].reverse().find(row => row[field] !== null);

export function SnapshotView({ title, snapshot }: { title: string; snapshot: ForgePerformanceSnapshot }) {
  const [history, setHistory] = React.useState(false);
  const [allOperations, setAllOperations] = React.useState(false);
  const rows = [...snapshot.operations].sort((a, b) => b.totalMs - a.totalMs);
  const shown = allOperations ? rows : rows.slice(0, 12);
  const backend = snapshot.producer.component === 'backend';
  const native = snapshot.producer.component === 'extension-host';
  const metrics: Array<[string, keyof ForgePerformanceResourceSample, (value: number | null | undefined) => string]> = backend || native
    ? [['CPU / one core', 'cpuOneCorePercent', value => performanceNumber(value, '%')], ['CPU / host', 'cpuHostPercent', value => performanceNumber(value, '%')],
      ['RSS', 'rssBytes', bytes], ['Heap used', 'heapUsedBytes', bytes], ['Event-loop delay p95', 'eventLoopDelayP95Ms', value => performanceNumber(value, ' ms')]]
    : [['Frame cadence', 'fps', value => performanceNumber(value, ' FPS')], ['Frame interval', 'frameIntervalMs', value => performanceNumber(value, ' ms')],
      ['JS heap estimate', 'jsHeapUsedBytes', bytes], ['Last observed longtask', 'longTaskDurationMs', value => performanceNumber(value, ' ms')]];
  return <section className="min-w-0 rounded border border-white/10 bg-black/20 p-3" aria-label={title}>
    <h3 className="text-sm font-semibold text-slate-200">{title} <span className="text-[10px] font-normal text-slate-400">{snapshot.enabled ? 'Collecting' : 'Collection off'}</span></h3>
    <p className="mt-1 break-all text-[10px] text-slate-500">{snapshot.producer.scope} · PID {snapshot.producer.pid ?? 'Unknown'} · instance {snapshot.producer.instanceId ?? 'Unknown'} · snapshot {time(snapshot.capturedAtUnixMs)}</p>
    <dl className="mt-3 grid grid-cols-2 gap-2">{metrics.map(([label, field, format]) => {
      const sample = latest(snapshot, field);
      return <div key={field} className="rounded bg-white/[0.03] p-2"><dt className="text-[10px] text-slate-400">{label}</dt><dd className="font-mono text-sm text-cyan-200">{format(sample?.[field])}</dd><dd className="text-[9px] text-slate-500">Last sample: {time(sample?.atUnixMs)}</dd></div>;
    })}</dl>
    <p className="mt-2 text-[10px] text-slate-400">{backend ? 'CPU covers the whole backend interval, including overlapping work. Memory is process memory, not function allocations.'
      : native ? 'CPU and memory cover the shared extension-host process, including other extensions. They are not exclusive Forge or per-function costs.'
        : 'Frames describe visible paint cadence. HTTP spans end at headers, before body parsing or rendering. Heap is an optional browser estimate.'}</p>
    <h4 className="mt-3 text-xs font-semibold">Operations · {rows.length} retained</h4>
    <p className="mb-1 text-[10px] text-slate-500">Elapsed spans can overlap; their sum is not exclusive CPU. p95 is a histogram upper-bound estimate.</p>
    {shown.length ? <div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead className="text-slate-400"><tr><th className="pr-3">Operation</th><th className="pr-3">Count</th><th className="pr-3">Total ms</th><th className="pr-3">Mean ms</th><th className="pr-3">p95 ≈ ms</th><th>Outcomes</th></tr></thead><tbody>{shown.map(row => <tr key={row.name} className="border-t border-white/5"><td className="max-w-64 break-all py-1 pr-3 font-mono">{row.name}</td><td className="pr-3">{performanceNumber(row.count)}</td><td className="pr-3">{performanceNumber(row.totalMs)}</td><td className="pr-3">{performanceNumber(row.meanMs)}</td><td className="pr-3">{performanceNumber(row.p95Ms)}</td><td>{outcomes.filter(outcome => row.outcomes[outcome] > 0).map(outcome => `${outcome} ${row.outcomes[outcome]}`).join(' · ')}</td></tr>)}</tbody></table></div>
      : <p className="mt-2 text-xs text-slate-400">No instrumented operation samples. This does not establish zero cost.</p>}
    {rows.length > 12 && <button type="button" onClick={() => setAllOperations(value => !value)} className="mt-2 text-[10px] text-cyan-300 underline">{allOperations ? 'Show top 12' : `Show all ${rows.length} operations`}</button>}
    <details className="mt-3 text-[10px]" onToggle={event => setHistory(event.currentTarget.open)}><summary className="cursor-pointer text-slate-300">Retained history and measurement limits</summary>{history && <div className="mt-2 space-y-2">
      <p>Resources {snapshot.resources.length}/{snapshot.limits.maxResources}; recent slow/error spans {snapshot.recentSlowOperations.length}/{snapshot.limits.maxSlowOperations}. Limits bound retained state, not OS memory.</p>
      <div className="max-h-52 overflow-auto"><table className="w-full text-left"><thead><tr><th>Time</th><th>CPU / core %</th><th>RSS</th>{!native && <><th>FPS</th><th>Longtask ms</th></>}</tr></thead><tbody>{snapshot.resources.map((row, index) => <tr key={index} className="border-t border-white/5"><td>{time(row.atUnixMs)}</td><td>{performanceNumber(row.cpuOneCorePercent)}</td><td>{bytes(row.rssBytes)}</td>{!native && <><td>{performanceNumber(row.fps)}</td><td>{performanceNumber(row.longTaskDurationMs)}</td></>}</tr>)}</tbody></table></div>
      <ul className="max-h-44 overflow-auto space-y-1">{snapshot.recentSlowOperations.map((row, index) => <li key={index} className="break-all font-mono">{time(row.atUnixMs)} · {row.name} · {performanceNumber(row.durationMs, ' ms')} · {row.outcome}{row.correlationId ? ` · ${row.correlationId}` : ''}</li>)}</ul>
      <p>Overwrites/drops: {Object.entries(snapshot.drops).map(([name, value]) => `${name} ${performanceNumber(value)}`).join(' · ')}</p>
      <p>Recorder work {performanceNumber(snapshot.selfOverhead.recordMs, ' ms')} / {snapshot.selfOverhead.recordCalls} calls; prior completed snapshot work {performanceNumber(snapshot.selfOverhead.snapshotMs, ' ms')}, including serialization/freezing; clock failures {snapshot.selfOverhead.clockFailures}. These counters do not measure the tracker’s entire overhead.</p>
    </div>}</details>
  </section>;
}

const nativeProducerKey = (report: ForgeNativePerformanceReport) => report.status?.native
  ? JSON.stringify([report.status.backendInstanceId, report.status.native.producer.instanceId, report.status.native.producer.pid]) : null;
const nativeCleanupPending = (report: ForgeNativePerformanceReport) => !!report.status && (report.status.cleanupUnconfirmed
  || report.status.timerCleanupUnconfirmed || report.status.cancellation !== 'none' || report.status.orphaned
  || !!report.status.native?.collectionCleanupUnconfirmed || (report.status.native?.failedTimerCount ?? 0) > 0
  || (!report.status.native?.collectionActive && ((report.status.native?.ownedTimerCount ?? 0) > 0 || !!report.status.native?.eventLoopDelayMonitoring)));
/** Rendering only. The mounted section owns authority, exact targets and request cancellation. */
export function NativePerformanceStatusView({ report, pending, onStop }: {
  report: ForgeNativePerformanceReport; pending?: 'start' | 'stop' | null; onStop: () => void;
}) {
  const status = report.status, native = status?.native;
  const cleanup = nativeCleanupPending(report);
  const stale = !!status?.snapshot && (report.operation !== 'read' || !report.ok || report.availability !== 'ready' || status.lastRefreshOutcome !== 'ok');
  const owner = report.ownership === 'operator' ? 'Studio operator' : report.ownership === 'self' ? 'This caller (self)'
    : report.ownership === 'other' ? 'Another owner' : 'No current control authority';
  const stoppable = !!native?.captureId && report.availability === 'ready' && (report.ownership === 'self' || report.ownership === 'operator')
    && (native.collectionActive || cleanup);
  return <div data-testid="forge-native-performance-status" className="space-y-2 text-[11px] text-slate-400">
    <h3 className="text-xs font-semibold text-slate-200">{native ? 'Native extension host · shared process' : 'Native coverage unavailable'}</h3>
    <p>Process totals include other extensions, including CodeSense when it shares this host. They do not measure X4 or attribute all cost to Forge. Native function profiles are unavailable.</p>
    <p>Availability: {report.availability}{report.unavailableReason ? ` · ${report.unavailableReason}` : ''}. Current control owner: {owner}.</p>
    {pending && <p role="status" className="text-cyan-200">{pending === 'start' ? 'Starting native collection' : 'Stopping native collection'} — pending execution and cleanup acknowledgement.</p>}
    {!native && <p>Native metrics: Unknown. No current producer or capture is confirmed.</p>}
    {native && <>
      <p className="break-all">Backend instance {status!.backendInstanceId} · native instance {native.producer.instanceId} · shared PID {native.producer.pid} · capture {native.captureId ?? 'none'}.</p>
      <p>Native collection: {native.collectionActive ? `active until ${time(native.collectionExpiresAtUnixMs)}` : 'inactive'} · owned timers {native.ownedTimerCount}; failed timer cleanup {native.failedTimerCount}; event-loop monitor {native.eventLoopDelayMonitoring ? 'active' : 'inactive'}.</p>
      <p>Samples {native.resourceSamples}; resource errors {native.resourceErrors}; sample overhead {performanceNumber(native.sampleOverheadMs, ' ms')}.</p>
    </>}
    {cleanup && <p className="text-amber-200">Cleanup is unconfirmed{status?.cancellation === 'unknown' ? '; cancellation outcome is unknown' : ''}. Inactive recording or absent control ownership does not confirm cleanup. Another collection is refused.</p>}
    {stoppable && <button type="button" onClick={onStop} disabled={!!pending} className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-slate-300 disabled:opacity-40"><Square className="h-3 w-3" />{cleanup ? 'Retry native capture cleanup' : 'Stop this native capture'}</button>}
    {report.status?.snapshot && <>
      <p className={stale ? 'text-amber-200' : 'text-slate-500'}>{stale ? 'Stale retained snapshot' : 'Last native read'} · last refresh {status!.lastRefreshOutcome} · snapshot age {performanceNumber(status!.snapshotAgeMs, ' ms')}. Retained samples are historical observations.</p>
      <SnapshotView title="Shared native extension host" snapshot={report.status.snapshot} />
    </>}
    {report.operation !== 'read' && <p>Control acknowledgement only. A fresh native read is required before resource samples are shown.</p>}
  </div>;
}

interface NativeReadState { scope: string; report?: ForgeNativePerformanceReport; error?: string; fresh: boolean }
interface NativeActionState { scope: string; kind?: 'start' | 'stop'; notice?: string; error?: string }
interface NativeRequestOwner {
  controller: AbortController; scope: string; lifecycle: number; epoch: number; producer: string; operation: 'start' | 'stop';
  expectedBackendInstanceId: string; expectedNativeInstanceId: string; captureId: string | null; readVersion: number;
}
function NativePerformanceSection({ authority, backendInstanceId, parentRefresh }: {
  authority: string; backendInstanceId: string | null; parentRefresh: number;
}) {
  const scope = JSON.stringify([authority, backendInstanceId]);
  const [readState, setReadState] = React.useState<NativeReadState>({ scope, fresh: false });
  const [action, setAction] = React.useState<NativeActionState>({ scope });
  const [refresh, setRefresh] = React.useState(0);
  const [duration, setDuration] = React.useState('60'), [interval, setInterval] = React.useState('2');
  const [eventLoopDelay, setEventLoopDelay] = React.useState(false);
  const mounted = React.useRef({ scope, authority, active: false, lifecycle: 0 });
  const pending = React.useRef<NativeRequestOwner | null>(null);
  const controlEpoch = React.useRef(0), readEpoch = React.useRef(0);
  const producer = React.useRef<string | null>(null);
  const latestReport = React.useRef<ForgeNativePerformanceReport | null>(null);
  const controlReady = React.useRef(false);
  const readVersion = React.useRef(0);
  const readOwner = React.useRef<{ scope: string; lifecycle: number; epoch: number; runId: number } | null>(null);
  const current = readState.scope === scope ? readState : undefined;
  const currentAction = action.scope === scope ? action : undefined;
  const report = current?.report, busy = !!currentAction?.kind;
  const accepts = (captured: { scope: string; lifecycle: number }) => mounted.current.active && mounted.current.scope === captured.scope
    && mounted.current.lifecycle === captured.lifecycle
    && `${window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || ''}|${window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision() || 0}` === mounted.current.authority;
  React.useLayoutEffect(() => {
    const lifecycle = mounted.current.lifecycle + 1;
    // Keep the ref objects so cleanup invalidates their latest counter values.
    const lifecycleControlEpoch = controlEpoch, lifecycleReadEpoch = readEpoch;
    mounted.current = { scope, authority, active: true, lifecycle };
    controlEpoch.current++; readEpoch.current++; producer.current = null; readOwner.current = null; latestReport.current = null; controlReady.current = false;
    setReadState({ scope, fresh: false }); setAction({ scope });
    return () => {
      if (mounted.current.lifecycle !== lifecycle) return;
      mounted.current.active = false; lifecycleControlEpoch.current++; lifecycleReadEpoch.current++; readOwner.current = null; latestReport.current = null; controlReady.current = false;
      const owner = pending.current; pending.current = null; owner?.controller.abort();
      // Releasing this panel never stops a completed native capture. Its lease owns expiry.
    };
  }, [scope, authority]);
  React.useLayoutEffect(() => {
    readEpoch.current++; controlReady.current = false;
    setReadState(previous => previous.scope === scope ? { ...previous, fresh: false } : { scope, fresh: false });
  }, [parentRefresh, scope]);
  const refreshRead = () => {
    readEpoch.current++; controlReady.current = false;
    setReadState(previous => previous.scope === scope ? { ...previous, fresh: false } : { scope, fresh: false });
    setRefresh(value => value + 1);
  };
  useContinuousPolling<{ value: ForgeNativePerformanceReport; owner: NonNullable<typeof readOwner.current> }>({
    resourceKey: pollingResourceKey('forge-native-performance', `${scope}|${parentRefresh}|${refresh}`),
    contract: 'GET /api/agent/performance/native', intervalMs: 2000, timeoutMs: 10_000,
    run: async (signal, meta) => {
      const owner = { scope, lifecycle: mounted.current.lifecycle, epoch: readEpoch.current, runId: meta.runId };
      readOwner.current = owner;
      const response = await fetch('/api/agent/performance/native', { signal });
      const value: unknown = await response.json();
      if (!isForgeNativePerformanceReport(value, 'read')) throw new Error(`The native read was refused (${response.status}) or returned an unsupported report.`);
      if (response.status !== (value.ok ? 200 : nativeFailures[value.code!].status)) throw new Error('The native read returned a contradictory HTTP result.');
      return { value, owner };
    },
    onResult: ({ value, owner }) => {
      if (!accepts(owner) || owner.epoch !== readEpoch.current) return;
      if (backendInstanceId !== null && value.status !== null && value.status.backendInstanceId !== backendInstanceId) {
        const previous = pending.current; pending.current = null; controlEpoch.current++; readEpoch.current++; previous?.controller.abort();
        producer.current = null; latestReport.current = null; controlReady.current = false;
        setReadState({ scope, fresh: false, error: 'The backend instance changed. Refresh the backend and native reports.' });
        setAction({ scope, notice: 'Earlier native controls were fenced; their execution and cleanup outcome requires a current read.' }); return;
      }
      const next = nativeProducerKey(value);
      const targetReplaced = pending.current?.operation === 'stop' && value.status?.native?.captureId !== pending.current.captureId;
      if ((producer.current !== null && (producer.current !== next || (!!pending.current && value.availability !== 'ready'))) || targetReplaced) {
        const previous = pending.current; pending.current = null; controlEpoch.current++; readEpoch.current++; previous?.controller.abort();
        setAction({ scope, notice: 'The native producer changed. Earlier capture data and control targets were discarded.' });
      }
      // A read may report the existing control as busy; it must neither preempt
      // that owner nor replace its pending acknowledgement with stale samples.
      if (pending.current && !value.ok && value.code === 'NATIVE_PERFORMANCE_BUSY' && producer.current === next) return;
      producer.current = next;
      const fresh = value.ok && (value.status === null || value.status.lastRefreshOutcome === 'ok');
      if (fresh) readVersion.current++;
      latestReport.current = value; controlReady.current = fresh;
      setReadState({ scope, report: value, fresh, ...(value.ok ? {} : { error: nativeFailures[value.code!].message }) });
    },
    onError: (error, meta) => {
      const owner = readOwner.current;
      if (!owner || owner.runId !== meta.runId || !accepts(owner) || owner.epoch !== readEpoch.current) return;
      controlReady.current = false;
      setReadState(previous => ({ scope, report: previous.scope === scope ? previous.report : undefined, fresh: false, error: error.message }));
    },
  });
  const ownsRequest = (owner: NativeRequestOwner) => pending.current === owner && accepts(owner) && owner.epoch === controlEpoch.current;
  const controlNativeCapture = async (operation: 'start' | 'stop', selected: ForgeNativePerformanceReport) => {
    const status = selected.status, native = status?.native, identity = nativeProducerKey(selected);
    if (pending.current || !controlReady.current || latestReport.current !== selected || !status || !native || !identity
      || producer.current !== identity || status.availability !== 'ready') return;
    if (operation === 'start' && (!current?.fresh || selected.operation !== 'read' || !selected.ok || native.collectionActive || nativeCleanupPending(selected))) return;
    if (operation === 'stop' && (!native.captureId || !(selected.ownership === 'self' || selected.ownership === 'operator'))) return;
    const normalized = normalizeNativeCollectionOptions({ durationMs: Number(duration) * 1000, intervalMs: Number(interval) * 1000, eventLoopDelay });
    if (operation === 'start' && !normalized.ok) { setAction({ scope, error: 'Use a native duration of 1–900 seconds and a resource interval of 1–60 seconds.' }); return; }
    const owner: NativeRequestOwner = { controller: new AbortController(), scope, lifecycle: mounted.current.lifecycle, operation,
      epoch: ++controlEpoch.current, producer: identity, expectedBackendInstanceId: status.backendInstanceId,
      expectedNativeInstanceId: native.producer.instanceId, captureId: native.captureId, readVersion: readVersion.current };
    if (!accepts(owner)) return;
    pending.current = owner; readEpoch.current++; controlReady.current = false;
    setReadState(previous => previous.scope === scope ? { ...previous, fresh: false } : { scope, fresh: false });
    setAction({ scope, kind: operation });
    try {
      const identityBody = { expectedBackendInstanceId: owner.expectedBackendInstanceId, expectedNativeInstanceId: owner.expectedNativeInstanceId };
      const body = operation === 'start' ? { ...identityBody, ...(normalized.ok ? normalized.options : {}) } : { ...identityBody, captureId: owner.captureId };
      const response = operation === 'start' ? await fetch('/api/agent/performance/native/collection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: owner.controller.signal,
      }) : await fetch('/api/agent/performance/native/stop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: owner.controller.signal,
      });
      const value: unknown = await response.json();
      if (!ownsRequest(owner) || owner.controller.signal.aborted) return;
      if (!isForgeNativePerformanceReport(value, operation)) throw new Error(`The native control was refused (${response.status}) or returned an unsupported acknowledgement.`);
      if (response.status !== (value.ok ? 200 : nativeFailures[value.code!].status)) throw new Error('The native control returned a contradictory HTTP result.');
      if (!value.ok) {
        latestReport.current = value; controlReady.current = false;
        setReadState({ scope, report: value, fresh: false, error: nativeFailures[value.code!].message });
        setAction({ scope, error: nativeFailures[value.code!].message }); return;
      }
      if (producer.current !== owner.producer || nativeProducerKey(value) !== owner.producer) throw new Error('The native instance changed while the control was pending. This response is not attributed to the selected producer.');
      const accepted = value.status!.native!;
      if (operation === 'start' && (!accepted.collectionActive || !accepted.captureId || accepted.disposed || nativeCleanupPending(value))) throw new Error('The native host did not confirm active collection with clean timer ownership.');
      if (operation === 'stop' && (accepted.collectionActive || nativeCleanupPending(value)
        || (accepted.captureId !== null && accepted.captureId !== owner.captureId))) throw new Error('The native host did not confirm cleanup of the exact selected capture.');
      const laterRead = readVersion.current > owner.readVersion && controlReady.current && latestReport.current?.operation === 'read'
        ? latestReport.current : null;
      const acknowledgedCapture = operation === 'start' ? accepted.captureId : owner.captureId;
      if (laterRead?.status?.native?.captureId && laterRead.status.native.captureId !== acknowledgedCapture) {
        throw new Error('The native capture changed while the acknowledgement was pending. Earlier control status cannot replace the current capture.');
      }
      if (!laterRead) {
        latestReport.current = value; controlReady.current = true;
        setReadState({ scope, report: value, fresh: false });
      }
      setAction({ scope, notice: laterRead
        ? `Native ${operation} acknowledgement received for capture ${acknowledgedCapture}. Showing the newer native read for current status.`
        : operation === 'start'
          ? `Native capture ${accepted.captureId} was acknowledged. Resource samples await a fresh read; the capture has automatic expiry.`
          : `Native cleanup for capture ${owner.captureId} was acknowledged. A fresh read will confirm the current status.` });
    } catch (error) {
      if (ownsRequest(owner)) setAction({ scope, error: owner.controller.signal.aborted
        ? 'Native request cancelled. Execution and cleanup are unknown locally; refresh status. An acknowledged capture keeps its bounded lease.'
        : error instanceof Error ? error.message : 'Native control outcome is unknown. Refresh status.' });
    } finally {
      // A late completion cannot release a replacement request or refresh another authority.
      if (ownsRequest(owner)) {
        pending.current = null; readEpoch.current++;
        setAction(previous => previous.scope === scope && previous.kind ? { scope, notice: 'Native request ended without a confirmed result. Refresh status; cleanup is not established.' } : previous);
        setRefresh(value => value + 1);
      }
    }
  };
  const canStart = !!report && current?.fresh && report.operation === 'read' && report.ok && report.availability === 'ready'
    && !!report.status?.native && !report.status.native.collectionActive && !report.status.native.disposed && !nativeCleanupPending(report);
  const controlsStale = !!current?.error || (!!report && report.operation === 'read' && !current?.fresh)
    || (!!report && nativeProducerKey(report) !== producer.current);
  const inputClass = 'w-full rounded border border-white/15 bg-[#101722] px-2 py-1 text-xs text-slate-200';
  return <section className="rounded border border-white/10 p-3" aria-label="Native performance coverage" data-testid="forge-native-performance">
    <div className="mb-2 flex items-center gap-2"><h3 className="mr-auto text-xs font-semibold">Native performance</h3><button type="button" disabled={busy} onClick={refreshRead} aria-label="Refresh native performance report" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /></button></div>
    {current?.error && <p role="alert" className="mb-2 text-xs text-amber-200">{current.error}{report ? ' Retained native data is stale; controls wait for a current read.' : ''}</p>}
    {report && !current?.fresh && report.operation === 'read' && !current?.error && <p role="status" className="mb-2 text-[10px] text-amber-200">Retained native data is stale until a current read is confirmed.</p>}
    {report ? <fieldset disabled={controlsStale || busy}><NativePerformanceStatusView report={report} pending={currentAction?.kind} onStop={() => void controlNativeCapture('stop', report)} /></fieldset>
      : <p role="status" className="text-[11px] text-slate-400">Native metrics: Unknown. Reading native status…</p>}
    <fieldset disabled={busy} className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Native duration (seconds)<input aria-label="Native performance collection duration seconds" type="number" min="1" max="900" value={duration} onChange={event => setDuration(event.target.value)} className={inputClass} /></label><label className="text-[10px] text-slate-400">Native interval (seconds)<input aria-label="Native performance resource interval seconds" type="number" min="1" max="60" value={interval} onChange={event => setInterval(event.target.value)} className={inputClass} /></label></div>
      <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={eventLoopDelay} onChange={event => setEventLoopDelay(event.target.checked)} /> Include native event-loop delay monitoring</label>
      <button type="button" disabled={!canStart || busy} onClick={() => { if (report) void controlNativeCapture('start', report); }} className="inline-flex items-center gap-1 rounded border border-cyan-500/30 px-2 py-1.5 text-xs text-cyan-200 disabled:opacity-40"><Play className="h-3.5 w-3.5" />Start native collection</button>
    </fieldset>
    {currentAction?.notice && <p role="status" className="mt-2 text-xs text-cyan-200">{currentAction.notice}</p>}
    {currentAction?.error && <p role="alert" className="mt-2 text-xs text-amber-200">{currentAction.error}</p>}
    {busy && <button type="button" onClick={() => pending.current?.controller.abort()} className="mt-2 text-xs text-slate-300 underline">Cancel native request</button>}
  </section>;
}

interface ReportState { authority: string; report?: ForgePerformanceReport; error?: string }
interface ActionState { authority: string; kind?: 'collection' | 'profile'; notice?: string; error?: string }
export function webviewCollectionStartRefusal(collection: WebviewPerformanceView['collection']): string | null {
  if (collection.cleanupUnconfirmed || collection.failedTimerCount > 0 || (!collection.active && collection.ownedTimerCount > 0)) {
    return 'Webview timer cleanup is unconfirmed. Retry webview cleanup before starting backend or webview collection.';
  }
  return collection.active ? 'A webview collection is already active.' : null;
}
export function WebviewCollectionStatus({ collection, onStop }: { collection: WebviewPerformanceView['collection']; onStop: () => void }) {
  const cleanupPending = collection.cleanupUnconfirmed || collection.failedTimerCount > 0 || (!collection.active && collection.ownedTimerCount > 0);
  return <div className="mt-1 text-[10px] text-slate-400">
    <p>Webview collection: {collection.active ? `active until ${time(collection.expiresAtUnixMs)}` : 'inactive'} · owned timers {collection.ownedTimerCount}; failed timer cleanup {collection.failedTimerCount}.</p>
    {cleanupPending && <p className="mt-1 text-amber-200">Webview timer cleanup is unconfirmed. Inactive recording does not confirm cleanup; another collection is refused.</p>}
    {(collection.active || cleanupPending) && <button type="button" onClick={onStop} className="mt-1 inline-flex items-center gap-1 text-slate-300 underline"><Square className="h-3 w-3" />{cleanupPending ? 'Retry webview timer cleanup' : 'Stop webview collection only'}</button>}
  </div>;
}
export default function PerformancePanel() {
  const workspaceId = window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || '';
  const selectionRevision = window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision() || 0;
  const authority = `${workspaceId}|${selectionRevision}`;
  const [reportState, setReportState] = React.useState<ReportState>({ authority });
  const [local, setLocal] = React.useState<WebviewPerformanceView>(() => readWebviewPerformance());
  const [action, setAction] = React.useState<ActionState>({ authority });
  const [profile, setProfile] = React.useState<{ authority: string; producer: string; value: ForgeCpuProfileReport } | null>(null);
  const [refresh, setRefresh] = React.useState(0);
  const [duration, setDuration] = React.useState('60');
  const [interval, setInterval] = React.useState('2');
  const [eventLoopDelay, setEventLoopDelay] = React.useState(false);
  const [profileDuration, setProfileDuration] = React.useState('1000');
  const [profileInterval, setProfileInterval] = React.useState('1000');
  const [maxFunctions, setMaxFunctions] = React.useState('32');
  const mounted = React.useRef({ authority, active: false });
  const pending = React.useRef<AbortController | null>(null);
  const epoch = React.useRef(0);
  const pollEpoch = React.useRef(0);
  const producer = React.useRef<string | null>(null);
  const report = reportState.authority === authority ? reportState.report : undefined;
  const readError = reportState.authority === authority ? reportState.error : undefined;
  const currentAction = action.authority === authority ? action : undefined;
  const busy = !!currentAction?.kind;
  React.useLayoutEffect(() => {
    mounted.current = { authority, active: true }; producer.current = null; epoch.current++; setLocal(readWebviewPerformance());
    return () => { mounted.current.active = false; epoch.current++; pending.current?.abort(); pending.current = null; };
  }, [authority]);
  const accepts = (captured: string) => mounted.current.active && mounted.current.authority === captured
    && `${window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || ''}|${window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision() || 0}` === captured;
  useContinuousPolling<{ value: ForgePerformanceReport; authority: string; epoch: number }>({
    resourceKey: pollingResourceKey('forge-performance', `${authority}|${refresh}`), contract: 'GET /api/agent/performance', intervalMs: 2000, timeoutMs: 10_000,
    run: async signal => {
      const capturedEpoch = epoch.current;
      pollEpoch.current = capturedEpoch;
      const value = await fetchPollingJson<unknown>('/api/agent/performance', undefined, signal);
      if (!isForgePerformanceReport(value)) throw new Error('The backend returned an unsupported or malformed performance report.');
      return { value, authority, epoch: capturedEpoch };
    },
    onResult: result => {
      if (!accepts(result.authority) || result.epoch !== epoch.current) return;
      const nextProducer = producerKey(result.value.backend.producer);
      if (producer.current && producer.current !== nextProducer) {
        pending.current?.abort(); setProfile(null);
        setAction(previous => previous.authority === authority && !previous.kind
          ? { authority, notice: 'The backend instance changed. Earlier function captures are hidden.' } : previous);
      }
      producer.current = nextProducer;
      setReportState({ authority, report: result.value }); setLocal(readWebviewPerformance());
    },
    onError: error => {
      if (!accepts(authority) || pollEpoch.current !== epoch.current) return;
      setReportState(previous => ({ authority, report: previous.authority === authority ? previous.report : undefined, error: error.message }));
      setLocal(readWebviewPerformance());
    },
  });
  const startAction = (kind: 'collection' | 'profile') => {
    if (pending.current || !report || !producer.current) return null;
    const controller = new AbortController(); pending.current = controller; epoch.current++;
    setAction({ authority, kind });
    return { controller, authority, producer: producer.current };
  };
  const finishAction = (controller: AbortController) => {
    if (pending.current === controller) pending.current = null;
    if (accepts(authority)) {
      setAction(previous => previous.authority === authority && previous.kind ? { authority,
        notice: controller.signal.aborted ? 'Cancellation requested. Refreshed backend status must confirm the current state.' : 'The request ended without a confirmed result. Refresh backend status.' } : previous);
      epoch.current++; setRefresh(value => value + 1);
    }
  };
  const startCollection = async () => {
    const durationMs = Number(duration) * 1000; const intervalMs = Number(interval) * 1000;
    if (!Number.isSafeInteger(durationMs) || durationMs < 1000 || durationMs > 900_000 || !Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60_000) {
      setAction({ authority, error: 'Use a duration of 1–900 seconds and a resource interval of 1–60 seconds.' }); return;
    }
    const currentLocal = readWebviewPerformance(); setLocal(currentLocal);
    const localRefusal = webviewCollectionStartRefusal(currentLocal.collection);
    if (localRefusal) { setAction({ authority, error: localRefusal }); return; }
    const owner = startAction('collection'); if (!owner) return;
    try {
      const response = await fetch('/api/agent/performance/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs, intervalMs, eventLoopDelay }), signal: owner.controller.signal });
      const value = await response.json() as { ok?: boolean; error?: string; backend?: unknown; control?: ForgeBackendPerformanceStatus };
      if (!response.ok || value.ok !== true) throw new Error(value.error || `Collection request failed (${response.status}).`);
      if (!snapshotShape(value.backend, 'backend') || !value.backend.enabled || value.control?.collectionActive !== true
        || value.control.disposed || value.control.collectionCleanupUnconfirmed || value.control.coverage?.backendPid !== value.backend.producer.pid) throw new Error('The backend did not confirm active collection for this producer.');
      if (!accepts(owner.authority) || owner.controller.signal.aborted) return;
      const actualProducer = producerKey(value.backend.producer);
      if (producer.current !== owner.producer || actualProducer !== owner.producer) throw new Error('The backend changed while collection was starting. Backend acceptance is unknown locally; refresh its status before starting webview collection. Any accepted lease expires automatically.');
      const started = startWebviewPerformanceCollection(durationMs); setLocal(readWebviewPerformance());
      setAction({ authority, notice: started.ok === true ? 'Started bounded collection for the backend and this webview. Each has an automatic time limit.'
        : `Backend collection is active. Webview collection was not started: ${started.code}.` });
    } catch (error) {
      if (accepts(owner.authority)) setAction({ authority, error: owner.controller.signal.aborted
        ? 'Start request was canceled. Backend acceptance is unknown; refresh status. Any accepted lease expires automatically.'
        : error instanceof Error ? error.message : 'Collection start outcome is unavailable. Refresh status.' });
    } finally { finishAction(owner.controller); }
  };
  const capture = async () => {
    const durationMs = Number(profileDuration); const samplingIntervalMicros = Number(profileInterval); const count = Number(maxFunctions);
    if (!Number.isSafeInteger(durationMs) || durationMs < 100 || durationMs > 5000 || !Number.isSafeInteger(samplingIntervalMicros) || samplingIntervalMicros < 1000 || samplingIntervalMicros > 100_000 || !Number.isSafeInteger(count) || count < 1 || count > 64) {
      setAction({ authority, error: 'Use 100–5000 ms, a 1000–100000 µs sampling interval, and 1–64 functions.' }); return;
    }
    const owner = startAction('profile'); if (!owner) return;
    setProfile(null);
    try {
      const response = await fetch('/api/agent/performance/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs, samplingIntervalMicros, maxFunctions: count }), signal: owner.controller.signal });
      const value = await response.json();
      if (!response.ok || value?.ok !== true) throw new Error(`${value?.code ? `${value.code}: ` : ''}${value?.error || `Capture failed (${response.status}).`}`);
      if (!isForgeCpuProfile(value)) throw new Error('The backend returned an unsupported or malformed function capture.');
      if (!accepts(owner.authority) || owner.controller.signal.aborted) return;
      if (producer.current !== owner.producer || producerKey(value.producer) !== owner.producer) throw new Error('The backend instance changed. This capture is not attributed to the current producer.');
      setProfile({ authority, producer: owner.producer, value }); setAction({ authority, notice: 'Backend function samples received. These are sampling estimates, not exact per-operation CPU.' });
    } catch (error) {
      if (accepts(owner.authority)) setAction({ authority, error: owner.controller.signal.aborted ? 'Cancellation requested. Refreshed backend status must confirm profiler cleanup.'
        : error instanceof Error ? error.message : 'Function capture failed; no profile is claimed.' });
    } finally { finishAction(owner.controller); }
  };
  const currentProfile = report && profile?.authority === authority && profile.producer === producerKey(report.backend.producer) ? profile.value : undefined;
  const cooldown = report?.control.profileCooldownRemainingMs;
  const cacheRows: Array<[string, Record<typeof cacheFields[number], number>]> = report ? [['Validation', report.caches.projectValidation], ['Lua', report.caches.projectValidation.lua], ['Effective schema', report.caches.projectValidation.effectiveSchema]] : [];
  const inputClass = 'w-full rounded border border-white/15 bg-[#101722] px-2 py-1 text-xs text-slate-200';
  return <div data-testid="forge-performance-panel" className="h-full min-w-0 overflow-auto p-3 text-slate-200 space-y-3">
    <header className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300" /><h2 className="mr-auto text-sm font-semibold">Forge performance</h2><button type="button" onClick={() => { epoch.current++; setRefresh(value => value + 1); }} aria-label="Refresh performance report" className="rounded p-1.5 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button></header>
    <p className="text-[11px] text-slate-400">Opening this view only reads status. Collection and backend function sampling require the explicit controls below.</p>
    {readError && <p role="alert" className="rounded border border-amber-500/30 p-2 text-xs text-amber-200">{readError}{report ? ' Showing the last successful snapshot.' : ''}</p>}
    {!report && !readError && <p role="status" className="text-xs text-slate-400">Loading performance status…</p>}
    <section className="rounded border border-white/10 p-3" aria-label="Bounded performance collection">
      <h3 className="text-xs font-semibold">Collect a workload</h3><p className="mt-1 text-[10px] text-slate-400">Start the backend first, then this webview. Collection continues while you work elsewhere; at most 120 resource samples are retained per producer.</p>
      <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Duration (seconds)<input aria-label="Performance collection duration seconds" type="number" min="1" max="900" value={duration} onChange={event => setDuration(event.target.value)} className={inputClass} /></label><label className="text-[10px] text-slate-400">Backend interval (seconds)<input aria-label="Performance resource interval seconds" type="number" min="1" max="60" value={interval} onChange={event => setInterval(event.target.value)} className={inputClass} /></label></div>
      <label className="mt-2 flex items-center gap-2 text-[11px]"><input type="checkbox" checked={eventLoopDelay} onChange={event => setEventLoopDelay(event.target.checked)} /> Include event-loop delay monitoring</label>
      <button type="button" onClick={() => void startCollection()} disabled={!report || !!readError || busy || report.control.disposed || report.control.collectionCleanupUnconfirmed || report.control.collectionActive || !!webviewCollectionStartRefusal(local.collection)} className="mt-2 inline-flex items-center gap-1 rounded border border-cyan-500/30 px-2 py-1.5 text-xs text-cyan-200 disabled:opacity-40"><Play className="h-3.5 w-3.5" /> Start bounded collection</button>
      <p className="mt-2 text-[10px] text-slate-400">Backend collection: {report ? report.control.collectionActive ? `active until ${time(report.control.collectionExpiresAtUnixMs)}` : 'inactive' : 'Unknown'}</p>
      {report?.control.collectionCleanupUnconfirmed && <p className="mt-1 text-[10px] text-amber-200">Collection cleanup is unconfirmed; another collection is refused.</p>}
      {report && <p className="mt-1 text-[10px] text-slate-500">Owned backend timers {report.control.ownedTimerCount}; failed timer cleanup {report.control.failedTimerCount}; delay monitor {report.control.eventLoopDelayMonitoring ? 'active' : 'inactive'}; sampling overhead {performanceNumber(report.control.sampleOverheadMs, ' ms')}.</p>}
      <WebviewCollectionStatus collection={local.collection} onStop={() => { stopWebviewPerformanceCollection(); setLocal(readWebviewPerformance()); }} />
    </section>
    {currentAction?.notice && <p role="status" className="rounded border border-cyan-500/20 p-2 text-xs text-cyan-200">{currentAction.notice}</p>}
    {currentAction?.error && <p role="alert" className="rounded border border-amber-500/30 p-2 text-xs text-amber-200">{currentAction.error}</p>}
    {busy && <div className="flex items-center gap-2 text-xs text-slate-300"><span role="status">{currentAction?.kind === 'profile' ? 'Sampling backend functions…' : 'Starting collection…'}</span><button type="button" onClick={() => pending.current?.abort()} className="underline">Cancel request</button></div>}
    {report && <SnapshotView title="Owned backend" snapshot={report.backend} />}
    <SnapshotView title="This webview" snapshot={local.snapshot} />
    <p className="text-[10px] text-slate-400">Webview: frames {local.coverage.frames}; visibility {local.coverage.visibility}; longtasks {local.coverage.longTasks}; heap {local.coverage.heap}. Adapter errors {local.coverage.adapterErrors}; ignored old completions {local.coverage.ignoredCompletions}. Local snapshots stay in this webview’s memory.</p>
    <NativePerformanceSection authority={authority} backendInstanceId={report?.backend.producer.instanceId ?? null} parentRefresh={refresh} />
    {report && <section className="rounded border border-white/10 p-3 text-[10px]" aria-label="Validation cache counters"><h3 className="mb-1 text-xs font-semibold">Validation cache counters</h3><p className="mb-2 text-slate-400">Accounted bytes omit exact JavaScript object/Map overhead; they are not total heap use.</p><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Cache</th>{cacheFields.map(field => <th className="px-1" key={field}>{field}</th>)}</tr></thead><tbody>{cacheRows.map(([label, value]) => <tr key={label} className="border-t border-white/5"><td className="py-1">{label}</td>{cacheFields.map(field => <td key={field} className="px-1">{performanceNumber(value[field])}</td>)}</tr>)}</tbody></table></div></section>}
    <section className="rounded border border-white/10 p-3" aria-label="Backend function sampling"><h3 className="text-xs font-semibold">Backend function samples</h3><p className="mt-1 text-[10px] text-slate-400">Explicit capture only. Event-loop blockage can delay stopping. A 30-second cooldown and one-capture limit apply.</p>
      <div className="mt-2 grid grid-cols-3 gap-2"><label className="text-[10px] text-slate-400">Duration ms<input type="number" aria-label="Backend profile duration milliseconds" min="100" max="5000" value={profileDuration} onChange={event => setProfileDuration(event.target.value)} className={inputClass} /></label><label className="text-[10px] text-slate-400">Interval µs<input type="number" aria-label="Backend profile sampling interval microseconds" min="1000" max="100000" value={profileInterval} onChange={event => setProfileInterval(event.target.value)} className={inputClass} /></label><label className="text-[10px] text-slate-400">Functions<input type="number" aria-label="Backend profile function limit" min="1" max="64" value={maxFunctions} onChange={event => setMaxFunctions(event.target.value)} className={inputClass} /></label></div>
      <button type="button" onClick={() => void capture()} disabled={!report || !!readError || busy || report.control.disposed || !report.control.profilingEnabled || report.control.profileActive || report.control.profileCleanupUnconfirmed || report.control.abortListenerCleanupUnconfirmed || (cooldown !== null && cooldown !== undefined && cooldown > 0)} className="mt-2 rounded border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200 disabled:opacity-40">Sample backend functions</button>
      <p className="mt-1 text-[10px] text-slate-400">{!report ? 'Backend profile support: Unknown.' : !report.control.profilingEnabled ? 'Backend profiling is disabled.' : report.control.profileCleanupUnconfirmed || report.control.abortListenerCleanupUnconfirmed ? 'Previous profiler/listener cleanup is unconfirmed; another capture is refused.' : report.control.profileActive ? 'A backend capture is already active.' : `Cooldown remaining: ${performanceNumber(cooldown === null ? null : Math.ceil(cooldown / 1000), ' s')}`}</p>
      {currentProfile && <div data-testid="forge-performance-profile" className="mt-3 space-y-2 text-[10px]"><p>Requested {performanceNumber(currentProfile.requestedDurationMs, ' ms')} · observed {performanceNumber(currentProfile.observedDurationMs, ' ms')} · delayed stop {performanceNumber(currentProfile.delayedStopMs, ' ms')} · samples {performanceNumber(currentProfile.sampleCount)}. Sampled self-time is an estimate, not exact operation CPU.</p><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Function / relative module</th><th>Self samples</th><th>Self ≈ ms</th></tr></thead><tbody>{currentProfile.functions.map((row, index) => <tr key={index} className="border-t border-white/5"><td className="break-all py-1 pr-2 font-mono">{row.name}<br /><span className="text-slate-500">{row.module}{row.line === null ? '' : `:${row.line}${row.column === null ? '' : `:${row.column}`}`}</span></td><td>{performanceNumber(row.selfSamples)}</td><td>{performanceNumber(row.selfSampleMicros === null ? null : row.selfSampleMicros / 1000)}</td></tr>)}</tbody></table></div><p>Omissions/invalid data: {Object.entries(currentProfile.omitted).map(([name, value]) => `${name} ${value}`).join(' · ')}</p>{currentProfile.functions.length === 0 && <p>No function samples were returned; zero cost is not established.</p>}</div>}
    </section>
  </div>;
}
