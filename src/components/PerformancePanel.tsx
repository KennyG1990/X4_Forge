import React from 'react';
import { Activity, Play, RefreshCw, Square } from 'lucide-react';
import type { ForgeCpuProfileReport, ForgePerformanceResourceSample, ForgePerformanceSnapshot } from '../lib/forgePerformance';
import type { ForgeBackendPerformanceStatus } from '../server/forgePerformance';
import type { getProjectValidationCacheStats } from '../server/projectValidation';
import { readWebviewPerformance, startWebviewPerformanceCollection, stopWebviewPerformanceCollection, type WebviewPerformanceView } from '../lib/webviewPerformance';
import { useContinuousPolling } from '../lib/useContinuousPolling';
import { fetchPollingJson, pollingResourceKey } from '../lib/continuousPolling';

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
  const metrics: Array<[string, keyof ForgePerformanceResourceSample, (value: number | null | undefined) => string]> = backend
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
    <p className="mt-2 text-[10px] text-slate-400">{backend ? 'CPU covers the whole backend interval, including overlapping work. Memory is process memory, not function allocations.' : 'Frames describe visible paint cadence. HTTP spans end at headers, before body parsing or rendering. Heap is an optional browser estimate.'}</p>
    <h4 className="mt-3 text-xs font-semibold">Operations · {rows.length} retained</h4>
    <p className="mb-1 text-[10px] text-slate-500">Elapsed spans can overlap; their sum is not exclusive CPU. p95 is a histogram upper-bound estimate.</p>
    {shown.length ? <div className="overflow-x-auto"><table className="w-full text-left text-[10px]"><thead className="text-slate-400"><tr><th className="pr-3">Operation</th><th className="pr-3">Count</th><th className="pr-3">Total ms</th><th className="pr-3">Mean ms</th><th className="pr-3">p95 ≈ ms</th><th>Outcomes</th></tr></thead><tbody>{shown.map(row => <tr key={row.name} className="border-t border-white/5"><td className="max-w-64 break-all py-1 pr-3 font-mono">{row.name}</td><td className="pr-3">{performanceNumber(row.count)}</td><td className="pr-3">{performanceNumber(row.totalMs)}</td><td className="pr-3">{performanceNumber(row.meanMs)}</td><td className="pr-3">{performanceNumber(row.p95Ms)}</td><td>{outcomes.filter(outcome => row.outcomes[outcome] > 0).map(outcome => `${outcome} ${row.outcomes[outcome]}`).join(' · ')}</td></tr>)}</tbody></table></div>
      : <p className="mt-2 text-xs text-slate-400">No instrumented operation samples. This does not establish zero cost.</p>}
    {rows.length > 12 && <button type="button" onClick={() => setAllOperations(value => !value)} className="mt-2 text-[10px] text-cyan-300 underline">{allOperations ? 'Show top 12' : `Show all ${rows.length} operations`}</button>}
    <details className="mt-3 text-[10px]" onToggle={event => setHistory(event.currentTarget.open)}><summary className="cursor-pointer text-slate-300">Retained history and measurement limits</summary>{history && <div className="mt-2 space-y-2">
      <p>Resources {snapshot.resources.length}/{snapshot.limits.maxResources}; recent slow/error spans {snapshot.recentSlowOperations.length}/{snapshot.limits.maxSlowOperations}. Limits bound retained state, not OS memory.</p>
      <div className="max-h-52 overflow-auto"><table className="w-full text-left"><thead><tr><th>Time</th><th>CPU / core %</th><th>RSS</th><th>FPS</th><th>Longtask ms</th></tr></thead><tbody>{snapshot.resources.map((row, index) => <tr key={index} className="border-t border-white/5"><td>{time(row.atUnixMs)}</td><td>{performanceNumber(row.cpuOneCorePercent)}</td><td>{bytes(row.rssBytes)}</td><td>{performanceNumber(row.fps)}</td><td>{performanceNumber(row.longTaskDurationMs)}</td></tr>)}</tbody></table></div>
      <ul className="max-h-44 overflow-auto space-y-1">{snapshot.recentSlowOperations.map((row, index) => <li key={index} className="break-all font-mono">{time(row.atUnixMs)} · {row.name} · {performanceNumber(row.durationMs, ' ms')} · {row.outcome}{row.correlationId ? ` · ${row.correlationId}` : ''}</li>)}</ul>
      <p>Overwrites/drops: {Object.entries(snapshot.drops).map(([name, value]) => `${name} ${performanceNumber(value)}`).join(' · ')}</p>
      <p>Recorder work {performanceNumber(snapshot.selfOverhead.recordMs, ' ms')} / {snapshot.selfOverhead.recordCalls} calls; prior completed snapshot work {performanceNumber(snapshot.selfOverhead.snapshotMs, ' ms')}, including serialization/freezing; clock failures {snapshot.selfOverhead.clockFailures}. These counters do not measure the tracker’s entire overhead.</p>
    </div>}</details>
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
    <section className="rounded border border-white/10 p-3 text-[11px] text-slate-400" aria-label="Native performance coverage"><h3 className="mb-1 font-semibold text-slate-200">Native coverage unavailable</h3>Extension-host metrics are not wired into this report. X4, CodeSense and unrelated processes are excluded. Backend profiles do not cover native-host or webview functions.</section>
    {report && <section className="rounded border border-white/10 p-3 text-[10px]" aria-label="Validation cache counters"><h3 className="mb-1 text-xs font-semibold">Validation cache counters</h3><p className="mb-2 text-slate-400">Accounted bytes omit exact JavaScript object/Map overhead; they are not total heap use.</p><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Cache</th>{cacheFields.map(field => <th className="px-1" key={field}>{field}</th>)}</tr></thead><tbody>{cacheRows.map(([label, value]) => <tr key={label} className="border-t border-white/5"><td className="py-1">{label}</td>{cacheFields.map(field => <td key={field} className="px-1">{performanceNumber(value[field])}</td>)}</tr>)}</tbody></table></div></section>}
    <section className="rounded border border-white/10 p-3" aria-label="Backend function sampling"><h3 className="text-xs font-semibold">Backend function samples</h3><p className="mt-1 text-[10px] text-slate-400">Explicit capture only. Event-loop blockage can delay stopping. A 30-second cooldown and one-capture limit apply.</p>
      <div className="mt-2 grid grid-cols-3 gap-2"><label className="text-[10px] text-slate-400">Duration ms<input type="number" aria-label="Backend profile duration milliseconds" min="100" max="5000" value={profileDuration} onChange={event => setProfileDuration(event.target.value)} className={inputClass} /></label><label className="text-[10px] text-slate-400">Interval µs<input type="number" aria-label="Backend profile sampling interval microseconds" min="1000" max="100000" value={profileInterval} onChange={event => setProfileInterval(event.target.value)} className={inputClass} /></label><label className="text-[10px] text-slate-400">Functions<input type="number" aria-label="Backend profile function limit" min="1" max="64" value={maxFunctions} onChange={event => setMaxFunctions(event.target.value)} className={inputClass} /></label></div>
      <button type="button" onClick={() => void capture()} disabled={!report || !!readError || busy || report.control.disposed || !report.control.profilingEnabled || report.control.profileActive || report.control.profileCleanupUnconfirmed || report.control.abortListenerCleanupUnconfirmed || (cooldown !== null && cooldown !== undefined && cooldown > 0)} className="mt-2 rounded border border-violet-500/30 px-2 py-1.5 text-xs text-violet-200 disabled:opacity-40">Sample backend functions</button>
      <p className="mt-1 text-[10px] text-slate-400">{!report ? 'Backend profile support: Unknown.' : !report.control.profilingEnabled ? 'Backend profiling is disabled.' : report.control.profileCleanupUnconfirmed || report.control.abortListenerCleanupUnconfirmed ? 'Previous profiler/listener cleanup is unconfirmed; another capture is refused.' : report.control.profileActive ? 'A backend capture is already active.' : `Cooldown remaining: ${performanceNumber(cooldown === null ? null : Math.ceil(cooldown / 1000), ' s')}`}</p>
      {currentProfile && <div data-testid="forge-performance-profile" className="mt-3 space-y-2 text-[10px]"><p>Requested {performanceNumber(currentProfile.requestedDurationMs, ' ms')} · observed {performanceNumber(currentProfile.observedDurationMs, ' ms')} · delayed stop {performanceNumber(currentProfile.delayedStopMs, ' ms')} · samples {performanceNumber(currentProfile.sampleCount)}. Sampled self-time is an estimate, not exact operation CPU.</p><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Function / relative module</th><th>Self samples</th><th>Self ≈ ms</th></tr></thead><tbody>{currentProfile.functions.map((row, index) => <tr key={index} className="border-t border-white/5"><td className="break-all py-1 pr-2 font-mono">{row.name}<br /><span className="text-slate-500">{row.module}{row.line === null ? '' : `:${row.line}${row.column === null ? '' : `:${row.column}`}`}</span></td><td>{performanceNumber(row.selfSamples)}</td><td>{performanceNumber(row.selfSampleMicros === null ? null : row.selfSampleMicros / 1000)}</td></tr>)}</tbody></table></div><p>Omissions/invalid data: {Object.entries(currentProfile.omitted).map(([name, value]) => `${name} ${value}`).join(' · ')}</p>{currentProfile.functions.length === 0 && <p>No function samples were returned; zero cost is not established.</p>}</div>}
    </section>
  </div>;
}
