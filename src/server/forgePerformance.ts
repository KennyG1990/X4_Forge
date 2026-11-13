/** Owned-backend performance producer. No port, filesystem export, worker or external process. */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, type Profiler } from 'node:inspector';
import { types as utilTypes } from 'node:util';
import { performance as nodePerformance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createForgePerformanceCollector, isForgePerformanceOperationName, FORGE_CPU_PROFILE_LIMITS, type ForgePerformanceCollector, type ForgePerformanceSnapshot, type ForgePerformanceResourceSample, type ForgeCpuProfileOptions, type ForgeCpuProfileResult, type ForgeCpuProfileReport, type ForgeCpuProfileFunction, type ForgeCpuProfileFailure } from '../lib/forgePerformance';
import { calculateForgeProcessResourceDelta } from '../../shared/forgePerformanceResources';

const PERFORMANCE_HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']);
function hasControlOrQueryFragment(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127 || code === 35 || code === 63) return true;
  }
  return false;
}
/** Pass a trusted Express route template, never req.path, URL, query or file data. */
export function forgePerformanceApiOperationName(method: unknown, routeTemplate: unknown): string {
  const verb = typeof method === 'string' && PERFORMANCE_HTTP_METHODS.has(method) ? method : 'OTHER';
  const fallback = `api.${verb} unmatched`;
  if (typeof routeTemplate !== 'string' || !routeTemplate.startsWith('/api/') || hasControlOrQueryFragment(routeTemplate) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(routeTemplate)) return fallback;
  const candidate = `api.${verb} ${routeTemplate}`;
  return isForgePerformanceOperationName(candidate) ? candidate : fallback;
}
/** Only own JSON data booleans are evidence; accessors/inherited values stay uninspected. */
export function forgePerformanceHasNegativeDataResult(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  try {
    if (utilTypes.isProxy(value) || Array.isArray(value)) return false;
    for (const field of ['ok', 'success']) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === false) return true;
    }
  } catch { /* Proxy/descriptor failure is diagnostic absence, never a request failure. */ }
  return false;
}

export const FORGE_BACKEND_PERFORMANCE_LIMITS = Object.freeze({ minIntervalMs: 1000, maxIntervalMs: 60_000, defaultIntervalMs: 2000, maxCollectionDurationMs: 900_000, defaultCollectionDurationMs: 60_000, inspectorCommandTimeoutMs: 1000, profileCooldownMs: 30_000, maxOwnedTimers: 16 });
interface CpuUsage { user: number; system: number }
interface EventLoopUsage { idle: number; active: number; utilization?: number }
export interface ForgePerformanceResourceAdapter {
  pid(): number; cpuUsage(): CpuUsage; memoryUsage(): { rss: number; heapUsed: number; heapTotal: number; external: number; arrayBuffers?: number };
  uptime(): number; logicalCpuCount(): number; eventLoopUtilization?(): EventLoopUsage;
}
export interface ForgePerformanceDelayHistogram { enable(): unknown; disable(): unknown; reset(): unknown; percentile(percentile: number): number; readonly max: number; readonly count?: number }
export interface ForgePerformanceInspectorSession { connect(): void; post(method: string, params: Record<string, unknown>, callback: (error: Error | null, result?: unknown) => void): void; disconnect(): void }
export interface ForgePerformanceTimer { unref?(): unknown }
export interface ForgePerformanceTimers { set(callback: () => void, delayMs: number): ForgePerformanceTimer; clear(timer: ForgePerformanceTimer): void }
export interface ForgeBackendPerformanceOptions {
  enabled?: boolean; profilingEnabled?: boolean; instanceId?: string; sourceRoot?: string;
  now?: () => number; wallNow?: () => number; resources?: ForgePerformanceResourceAdapter;
  timers?: ForgePerformanceTimers; inspectorSession?: () => ForgePerformanceInspectorSession;
  delayHistogram?: () => ForgePerformanceDelayHistogram;
}
export interface ForgePerformanceCollectionOptions { durationMs?: number; intervalMs?: number; eventLoopDelay?: boolean }
export interface ForgeBackendPerformanceStatus {
  disposed: boolean; collectionActive: boolean; profilingEnabled: boolean; profileActive: boolean;
  collectionStartedAtUnixMs: number | null; collectionExpiresAtUnixMs: number | null; intervalMs: number;
  resourceSamples: number; resourceErrors: number; throttledSamples: number; counterResets: number;
  sampleOverheadMs: number; lastResourceError: 'unavailable' | 'producer-identity-changed' | 'clock-unavailable' | null;
  eventLoopDelayMonitoring: boolean; profileCleanupUnconfirmed: boolean; collectionStopDelayMs: number | null;
  collectionCleanupUnconfirmed: boolean; abortListenerCleanupUnconfirmed: boolean; ownedTimerCount: number; failedTimerCount: number;
  profileCapturesStarted: number; profileCapturesSucceeded: number; profileCapturesFailed: number; profileRateLimited: number; profileCooldownRemainingMs: number | null;
  coverage: { backendPid: number; extensionHost: 'not-this-producer'; webview: 'not-this-producer'; childProcesses: 'excluded'; memory: 'process-not-function'; cpu: 'process-interval' };
}
export interface ForgeBackendPerformance {
  collector: ForgePerformanceCollector;
  snapshot(): ForgePerformanceSnapshot; status(): ForgeBackendPerformanceStatus;
  startCollection(options?: ForgePerformanceCollectionOptions): { ok: boolean; error?: string };
  stopCollection(): void; sampleResources(): boolean; reset(): void;
  setProfilingEnabled(enabled: boolean): void;
  captureCpuProfile(options?: ForgeCpuProfileOptions): Promise<ForgeCpuProfileResult>;
  cancelCpuProfile(): void; dispose(): Promise<void>;
}
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const failedProfile = (code: ForgeCpuProfileFailure['code']): ForgeCpuProfileFailure => ({ ok: false, code, error: ({ PROFILE_DISABLED: 'Backend function profiling is disabled.', PROFILE_BUSY: 'A backend function capture is already active.', PROFILE_RATE_LIMITED: 'Backend function captures require a 30-second cooldown after completion.', PROFILE_DISPOSED: 'The backend performance producer is disposed.', PROFILE_INPUT_INVALID: 'Invalid bounded CPU profile options.', PROFILE_ABORTED: 'The backend function capture was cancelled.', PROFILE_FAILED: 'The backend function capture failed; no valid profile is claimed.', PROFILE_CLEANUP_UNCONFIRMED: 'Profiler cleanup could not be confirmed; another capture is refused.' })[code] });

/** Summarize only bounded current-backend samples. Raw source URLs never leave this adapter. */
export function summarizeForgeCpuProfile(raw: unknown, options: { producer: ForgePerformanceSnapshot['producer']; sourceRoot: string; durationMs: number; observedDurationMs: number | null; samplingIntervalMicros: number; maxFunctions: number }): ForgeCpuProfileReport {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { nodes?: unknown }).nodes)) throw new TypeError('Invalid CPU profile.');
  const profile = raw as { nodes: Profiler.ProfileNode[]; samples?: unknown[]; timeDeltas?: unknown[]; startTime?: number; endTime?: number };
  if (profile.samples !== undefined && !Array.isArray(profile.samples) || profile.timeDeltas !== undefined && !Array.isArray(profile.timeDeltas) || !positiveInteger(options.maxFunctions) || options.maxFunctions > FORGE_CPU_PROFILE_LIMITS.maxFunctions || options.producer.component !== 'backend' || options.producer.scope !== 'owned-process') throw new TypeError('Invalid bounded backend profile summary.');
  const omitted = { nodes: Math.max(0, profile.nodes.length - FORGE_CPU_PROFILE_LIMITS.maxNodes), samples: Math.max(0, (profile.samples?.length ?? 0) - FORGE_CPU_PROFILE_LIMITS.maxSamples), functions: 0, unknownNodeSamples: 0, invalidNodes: 0, invalidDeltas: 0, redactedLabels: 0 };
  const root = path.resolve(options.sourceRoot);
  const safeName = (value: unknown) => {
    if (typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9_$ .<>()[\]:-]*$/.test(value)) return value || '(anonymous)';
    omitted.redactedLabels++; return '(redacted function label)';
  };
  const safeModule = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 4096) { omitted.redactedLabels++; return '(external-or-runtime)'; }
    if (/^node:[A-Za-z0-9_./-]+$/.test(value)) return value.slice(0, 160);
    try {
      const absolute = value.startsWith('file:') ? fileURLToPath(value) : path.isAbsolute(value) ? value : null;
      if (absolute) {
        const relative = path.relative(root, absolute);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && relative.length <= 160 && !hasControlOrQueryFragment(relative)) return relative.replace(/\\/g, '/');
      }
    } catch { /* malformed URLs stay redacted */ }
    if (value) omitted.redactedLabels++;
    return '(external-or-runtime)';
  };
  const nodes = new Map<number, { frame: Omit<ForgeCpuProfileFunction, 'selfSamples' | 'selfSampleMicros'>; identity: string }>();
  const duplicates = new Set<number>();
  for (const node of profile.nodes.slice(0, FORGE_CPU_PROFILE_LIMITS.maxNodes)) {
    if (!node || !positiveInteger(node.id) || !node.callFrame || typeof node.callFrame !== 'object') { omitted.invalidNodes++; continue; }
    if (nodes.has(node.id) || duplicates.has(node.id)) { nodes.delete(node.id); duplicates.add(node.id); omitted.invalidNodes++; continue; }
    const frame = node.callFrame;
    const display = { name: safeName(frame.functionName), module: safeModule(frame.url), line: Number.isSafeInteger(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber + 1 : null, column: Number.isSafeInteger(frame.columnNumber) && frame.columnNumber >= 0 ? frame.columnNumber + 1 : null };
    // Redaction must not merge unrelated external functions into one invented hotspot.
    const identity = typeof frame.functionName === 'string' && frame.functionName.length <= 128 && typeof frame.url === 'string' && frame.url.length <= 4096
      ? JSON.stringify([frame.functionName, frame.url, display.line, display.column]) : `redacted-node-${node.id}`;
    nodes.set(node.id, { frame: display, identity });
  }
  const functions = new Map<string, ForgeCpuProfileFunction>();
  const samples = Array.isArray(profile.samples) ? profile.samples.slice(0, FORGE_CPU_PROFILE_LIMITS.maxSamples) : [];
  for (let i = 0; i < samples.length; i++) {
    const node = nodes.get(samples[i] as number);
    if (!node) { omitted.unknownNodeSamples++; continue; }
    const key = node.identity;
    let entry = functions.get(key);
    if (!entry) { entry = { ...node.frame, selfSamples: 0, selfSampleMicros: 0 }; functions.set(key, entry); }
    entry.selfSamples++;
    const delta = profile.timeDeltas?.[i];
    if (!nonnegative(delta)) { entry.selfSampleMicros = null; omitted.invalidDeltas++; }
    else if (entry.selfSampleMicros !== null) entry.selfSampleMicros += delta;
  }
  const sorted = [...functions.values()].sort((left, right) => right.selfSamples - left.selfSamples || left.module.localeCompare(right.module) || left.name.localeCompare(right.name));
  omitted.functions = Math.max(0, sorted.length - options.maxFunctions);
  const report: ForgeCpuProfileReport = {
    ok: true, schemaVersion: 'forge.cpu-profile.v1', producer: { ...options.producer }, requestedDurationMs: options.durationMs,
    observedDurationMs: options.observedDurationMs, delayedStopMs: options.observedDurationMs === null ? null : Math.max(0, options.observedDurationMs - options.durationMs), samplingIntervalMicros: options.samplingIntervalMicros,
    profileDurationMicros: nonnegative(profile.startTime) && nonnegative(profile.endTime) && profile.endTime >= profile.startTime ? profile.endTime - profile.startTime : null,
    sampleCount: Array.isArray(profile.samples) ? profile.samples.length : null, scannedSampleCount: samples.length,
    functions: sorted.slice(0, options.maxFunctions), omitted,
    coverage: { process: 'current-backend-only', attribution: 'sampled-self-time-not-exact-operation-cpu', rawProfile: 'not-returned-or-persisted', timer: 'event-loop-blockage-can-delay-stop', resourceLimit: 'no-os-heap-quota', samples: Array.isArray(profile.samples) ? 'available' : 'unavailable' },
  };
  while (Buffer.byteLength(JSON.stringify(report), 'utf8') > FORGE_CPU_PROFILE_LIMITS.maxOutputBytes && report.functions.length) { report.functions.pop(); report.omitted.functions++; }
  return report;
}

export function createForgeBackendPerformance(options: ForgeBackendPerformanceOptions = {}): ForgeBackendPerformance {
  const now = options.now ?? (() => nodePerformance.now());
  const wallNow = options.wallNow ?? Date.now;
  const resource: ForgePerformanceResourceAdapter = options.resources ?? { pid: () => process.pid, cpuUsage: () => process.cpuUsage(), memoryUsage: () => process.memoryUsage(), uptime: () => process.uptime(), logicalCpuCount: () => os.cpus().length, eventLoopUtilization: () => nodePerformance.eventLoopUtilization() };
  const timers: ForgePerformanceTimers = options.timers ?? { set: (callback, delayMs) => setTimeout(callback, delayMs), clear: timer => clearTimeout(timer as NodeJS.Timeout) };
  const sessionFactory = options.inspectorSession ?? (() => new Session() as ForgePerformanceInspectorSession);
  const backendPid = resource.pid();
  const collector = createForgePerformanceCollector({ component: 'backend', scope: 'owned-process', pid: backendPid, instanceId: options.instanceId, enabled: false, now, wallNow });
  let disposed = false; let active = false; let profilingEnabled = options.profilingEnabled === true;
  let collectionGeneration = 0;
  let sampler: ForgePerformanceTimer | undefined; let lease: ForgePerformanceTimer | undefined;
  let histogram: ForgePerformanceDelayHistogram | undefined;
  let histogramCleanupUnconfirmed = false;
  const ownedTimers = new Set<ForgePerformanceTimer>();
  const failedTimers = new Set<ForgePerformanceTimer>();
  let pendingAbortRemoval: (() => void) | undefined;
  let intervalMs: number = FORGE_BACKEND_PERFORMANCE_LIMITS.defaultIntervalMs;
  let started: number | null = null; let expires: number | null = null; let expiryMonotonic: number | null = null;
  let lastSample: number | null = null;
  let previous: { now: number; cpu: CpuUsage; loop?: EventLoopUsage } | undefined;
  let resourceSamples = 0; let resourceErrors = 0; let throttledSamples = 0; let counterResets = 0; let sampleOverheadMs = 0;
  let lastResourceError: ForgeBackendPerformanceStatus['lastResourceError'] = null;
  let collectionStopDelayMs: number | null = null; let cleanupUnconfirmed = false;
  let nextProfileAllowed = 0; let profileCapturesStarted = 0; let profileCapturesSucceeded = 0; let profileCapturesFailed = 0; let profileRateLimited = 0;
  let activeProfile: { cancel: () => void; promise?: Promise<ForgeCpuProfileResult> } | undefined;
  const stamp = () => { try { const value = now(); return nonnegative(value) ? value : null; } catch { return null; } };
  const wall = () => { try { const value = wallNow(); return nonnegative(value) ? value : null; } catch { return null; } };
  const clear = (handle: ForgePerformanceTimer | undefined): boolean => {
    if (!handle || !ownedTimers.has(handle)) return true;
    try { timers.clear(handle); ownedTimers.delete(handle); failedTimers.delete(handle); return true; }
    catch { resourceErrors++; failedTimers.add(handle); return false; }
  };
  const retryFailedTimers = () => { for (const handle of [...failedTimers]) clear(handle); };
  const collectionCleanupUnconfirmed = () => histogramCleanupUnconfirmed || failedTimers.size > 0;
  const retryAbortRemoval = () => { if (!pendingAbortRemoval) return true; try { pendingAbortRemoval(); pendingAbortRemoval = undefined; return true; } catch { return false; } };
  const timer = (callback: () => void, delayMs: number) => {
    if (ownedTimers.size >= FORGE_BACKEND_PERFORMANCE_LIMITS.maxOwnedTimers) throw new Error('Performance timer ownership limit reached.');
    // The injected timer may call back before set returns; that alias starts empty.
    let handle: ForgePerformanceTimer | undefined = undefined;
    handle = timers.set(() => { if (handle) { ownedTimers.delete(handle); failedTimers.delete(handle); } callback(); }, delayMs);
    ownedTimers.add(handle);
    try { handle.unref?.(); } catch { clear(handle); throw new Error('Performance timer could not be unreferenced.'); }
    return handle;
  };
  const sampleResources = (): boolean => {
    if (disposed || !active) return false;
    const start = stamp();
    if (start === null) { resourceErrors++; lastResourceError = 'clock-unavailable'; return false; }
    if (lastSample !== null && start < lastSample) { counterResets++; previous = undefined; lastSample = start; lastResourceError = 'clock-unavailable'; return false; }
    if (lastSample !== null && start - lastSample < FORGE_BACKEND_PERFORMANCE_LIMITS.minIntervalMs) { throttledSamples++; return false; }
    lastSample = start;
    try {
      if (resource.pid() !== backendPid) { previous = undefined; resourceErrors++; lastResourceError = 'producer-identity-changed'; return false; }
      const cpu = resource.cpuUsage(); const memory = resource.memoryUsage(); const logicalCpuCount = resource.logicalCpuCount(); const uptimeSeconds = resource.uptime();
      if (!nonnegative(cpu.user) || !nonnegative(cpu.system) || !positiveInteger(logicalCpuCount) || !nonnegative(uptimeSeconds) || ![memory.rss, memory.heapUsed, memory.heapTotal, memory.external].every(nonnegative) || memory.arrayBuffers !== undefined && !nonnegative(memory.arrayBuffers)) throw new Error('invalid resources');
      let loop: EventLoopUsage | undefined;
      try { const candidate = resource.eventLoopUtilization?.(); if (candidate && nonnegative(candidate.idle) && nonnegative(candidate.active)) loop = candidate; } catch { /* unsupported loop fields remain null */ }
      const sample: Partial<ForgePerformanceResourceSample> = { atUnixMs: wall(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, externalBytes: memory.external, arrayBuffersBytes: memory.arrayBuffers ?? null, logicalCpuCount, uptimeSeconds };
      const delta = calculateForgeProcessResourceDelta({ now: start, cpu, loop }, previous, logicalCpuCount);
      Object.assign(sample, delta.fields);
      if (delta.counterReset) counterResets++;
      previous = { now: start, cpu: { ...cpu }, loop: loop ? { ...loop } : undefined };
      if (histogram && histogram.count !== undefined && histogram.count > 0) {
        const p50 = histogram.percentile(50) / 1e6; const p95 = histogram.percentile(95) / 1e6; const max = histogram.max / 1e6;
        sample.eventLoopDelayP50Ms = nonnegative(p50) ? p50 : null; sample.eventLoopDelayP95Ms = nonnegative(p95) ? p95 : null; sample.eventLoopDelayMaxMs = nonnegative(max) ? max : null;
      }
      histogram?.reset(); collector.recordResource(sample); resourceSamples++; lastResourceError = null; return true;
    } catch { resourceErrors++; lastResourceError = 'unavailable'; previous = undefined; return false; }
    finally { const end = stamp(); if (end !== null && end >= start) sampleOverheadMs += end - start; }
  };
  const stopCollection = () => {
    collectionGeneration++; active = false; collector.setEnabled(false);
    if (clear(sampler)) sampler = undefined; if (clear(lease)) lease = undefined;
    retryFailedTimers();
    if (histogram) {
      try { histogram.disable(); histogram = undefined; histogramCleanupUnconfirmed = false; }
      catch { resourceErrors++; histogramCleanupUnconfirmed = true; }
    }
    previous = undefined; lastSample = null;
  };
  const startCollection = (input: ForgePerformanceCollectionOptions = {}) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['durationMs', 'intervalMs', 'eventLoopDelay'].includes(key))) return { ok: false, error: 'Invalid bounded collection options.' };
    const durationMs = input.durationMs ?? FORGE_BACKEND_PERFORMANCE_LIMITS.defaultCollectionDurationMs;
    const interval = input.intervalMs ?? FORGE_BACKEND_PERFORMANCE_LIMITS.defaultIntervalMs;
    if (disposed) return { ok: false, error: 'The performance producer is disposed.' };
    if (!positiveInteger(durationMs) || durationMs > FORGE_BACKEND_PERFORMANCE_LIMITS.maxCollectionDurationMs || !positiveInteger(interval) || interval < FORGE_BACKEND_PERFORMANCE_LIMITS.minIntervalMs || interval > FORGE_BACKEND_PERFORMANCE_LIMITS.maxIntervalMs || input.eventLoopDelay !== undefined && typeof input.eventLoopDelay !== 'boolean') return { ok: false, error: 'Invalid bounded collection options.' };
    stopCollection();
    if (collectionCleanupUnconfirmed()) return { ok: false, error: 'Previous performance collection cleanup remains unconfirmed.' };
    const generation = collectionGeneration; active = true; intervalMs = interval; collector.setEnabled(true); started = wall(); expires = started === null ? null : started + durationMs;
    const monotonicStart = stamp(); expiryMonotonic = monotonicStart === null ? null : monotonicStart + durationMs; collectionStopDelayMs = null;
    try {
      if (input.eventLoopDelay === true) { histogram = (options.delayHistogram ?? (() => monitorEventLoopDelay({ resolution: 20 })))(); histogram.enable(); }
      const tick = () => { if (disposed || !active || generation !== collectionGeneration) return; sampleResources(); try { sampler = timer(tick, intervalMs); } catch { stopCollection(); resourceErrors++; } };
      lease = timer(() => { if (!active || generation !== collectionGeneration) return; const actual = stamp(); collectionStopDelayMs = actual !== null && expiryMonotonic !== null ? Math.max(0, actual - expiryMonotonic) : null; stopCollection(); }, durationMs);
      sampleResources(); sampler = timer(tick, intervalMs); return { ok: true };
    } catch { stopCollection(); resourceErrors++; return { ok: false, error: 'Performance collection could not start.' }; }
  };
  const post = (session: ForgePerformanceInspectorSession, method: string, params: Record<string, unknown> = {}) => new Promise<unknown>((resolve, reject) => {
    let settled = false; let timeout: ForgePerformanceTimer | undefined;
    const done = (error: Error | null, result?: unknown) => { if (settled) return; settled = true; clear(timeout); if (error) reject(new Error('Inspector command failed.')); else resolve(result); };
    try { timeout = timer(() => done(new Error('Inspector command timed out.')), FORGE_BACKEND_PERFORMANCE_LIMITS.inspectorCommandTimeoutMs); session.post(method, params, done); } catch { done(new Error('Inspector command failed.')); }
  });
  const captureCpuProfile = (input: ForgeCpuProfileOptions = {}): Promise<ForgeCpuProfileResult> => {
    if (disposed) return Promise.resolve(failedProfile('PROFILE_DISPOSED'));
    if (!profilingEnabled) return Promise.resolve(failedProfile('PROFILE_DISABLED'));
    if (activeProfile) return Promise.resolve(failedProfile('PROFILE_BUSY'));
    retryFailedTimers();
    if (!retryAbortRemoval() || cleanupUnconfirmed || collectionCleanupUnconfirmed()) return Promise.resolve(failedProfile('PROFILE_CLEANUP_UNCONFIRMED'));
    let durationMs: number; let samplingIntervalMicros: number; let maxFunctions: number; let signal: AbortSignal | undefined;
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['durationMs', 'samplingIntervalMicros', 'maxFunctions', 'signal'].includes(key))) return Promise.resolve(failedProfile('PROFILE_INPUT_INVALID'));
      durationMs = input.durationMs === undefined ? FORGE_CPU_PROFILE_LIMITS.defaultDurationMs : input.durationMs;
      samplingIntervalMicros = input.samplingIntervalMicros === undefined ? FORGE_CPU_PROFILE_LIMITS.defaultSamplingIntervalMicros : input.samplingIntervalMicros;
      maxFunctions = input.maxFunctions === undefined ? 32 : input.maxFunctions; signal = input.signal;
      if (!positiveInteger(durationMs) || durationMs < FORGE_CPU_PROFILE_LIMITS.minDurationMs || durationMs > FORGE_CPU_PROFILE_LIMITS.maxDurationMs || !positiveInteger(samplingIntervalMicros) || samplingIntervalMicros < FORGE_CPU_PROFILE_LIMITS.minSamplingIntervalMicros || samplingIntervalMicros > FORGE_CPU_PROFILE_LIMITS.maxSamplingIntervalMicros || !positiveInteger(maxFunctions) || maxFunctions > FORGE_CPU_PROFILE_LIMITS.maxFunctions || signal !== undefined && (!signal || typeof signal !== 'object' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function' || typeof signal.aborted !== 'boolean')) return Promise.resolve(failedProfile('PROFILE_INPUT_INVALID'));
      if (signal?.aborted) return Promise.resolve(failedProfile('PROFILE_ABORTED'));
    } catch { return Promise.resolve(failedProfile('PROFILE_INPUT_INVALID')); }
    const profileNow = stamp();
    if (profileNow === null) return Promise.resolve(failedProfile('PROFILE_FAILED'));
    if (profileNow < nextProfileAllowed) { profileRateLimited++; return Promise.resolve(failedProfile('PROFILE_RATE_LIMITED')); }
    nextProfileAllowed = profileNow + FORGE_BACKEND_PERFORMANCE_LIMITS.profileCooldownMs; profileCapturesStarted++;
    let cancelled = false; let release!: () => void;
    const stopRequested = new Promise<void>(resolve => { release = resolve; });
    const owner = { cancel: () => { cancelled = true; release(); }, promise: undefined as Promise<ForgeCpuProfileResult> | undefined };
    activeProfile = owner;
    const run = async (): Promise<ForgeCpuProfileResult> => {
      let session: ForgePerformanceInspectorSession | undefined; let began = false; let stopAttempted = false; let deadline: ForgePerformanceTimer | undefined;
      let startedProfile: number | null = null; let result: ForgeCpuProfileResult = failedProfile('PROFILE_FAILED');
      const onAbort = () => owner.cancel();
      try {
        if (signal) { pendingAbortRemoval = () => signal!.removeEventListener('abort', onAbort); signal.addEventListener('abort', onAbort, { once: true }); if (signal.aborted) owner.cancel(); }
        session = sessionFactory(); session.connect();
        await post(session, 'Profiler.enable');
        await post(session, 'Profiler.setSamplingInterval', { interval: samplingIntervalMicros });
        if (cancelled || disposed) throw new Error('Capture cancelled before start.');
        began = true; await post(session, 'Profiler.start'); startedProfile = stamp();
        deadline = timer(release, durationMs); await stopRequested;
        stopAttempted = true; const response = await post(session, 'Profiler.stop') as { profile?: unknown };
        const stopped = stamp();
        result = cancelled || disposed ? failedProfile('PROFILE_ABORTED') : summarizeForgeCpuProfile(response?.profile, { producer: { component: 'backend', scope: 'owned-process', pid: backendPid, instanceId: options.instanceId ?? null }, sourceRoot: options.sourceRoot ?? process.cwd(), durationMs, observedDurationMs: stopped !== null && startedProfile !== null && stopped >= startedProfile ? stopped - startedProfile : null, samplingIntervalMicros, maxFunctions });
      } catch { result = cancelled || disposed ? failedProfile('PROFILE_ABORTED') : failedProfile('PROFILE_FAILED'); }
      finally {
        clear(deadline); retryAbortRemoval();
        if (session) {
          if (began && !stopAttempted) { try { await post(session, 'Profiler.stop'); } catch { cleanupUnconfirmed = true; } }
          try { await post(session, 'Profiler.disable'); } catch { cleanupUnconfirmed = true; }
          try { session.disconnect(); } catch { cleanupUnconfirmed = true; }
        }
        if (activeProfile === owner) activeProfile = undefined;
        const endedAt = stamp(); nextProfileAllowed = endedAt === null ? Infinity : endedAt + FORGE_BACKEND_PERFORMANCE_LIMITS.profileCooldownMs;
      }
      const finalResult = cleanupUnconfirmed || pendingAbortRemoval || collectionCleanupUnconfirmed() ? failedProfile('PROFILE_CLEANUP_UNCONFIRMED') : result;
      if (finalResult.ok) profileCapturesSucceeded++; else profileCapturesFailed++;
      return finalResult;
    };
    owner.promise = run(); return owner.promise;
  };
  if (options.enabled === true) startCollection();
  return {
    collector, snapshot: () => collector.snapshot(), sampleResources, startCollection, stopCollection, captureCpuProfile,
    status: () => { const current = stamp(); return { disposed, collectionActive: active, profilingEnabled, profileActive: Boolean(activeProfile), collectionStartedAtUnixMs: started, collectionExpiresAtUnixMs: expires, intervalMs, resourceSamples, resourceErrors, throttledSamples, counterResets, sampleOverheadMs, lastResourceError, eventLoopDelayMonitoring: Boolean(histogram), profileCleanupUnconfirmed: cleanupUnconfirmed || Boolean(pendingAbortRemoval) || collectionCleanupUnconfirmed(), collectionCleanupUnconfirmed: collectionCleanupUnconfirmed(), abortListenerCleanupUnconfirmed: Boolean(pendingAbortRemoval), ownedTimerCount: ownedTimers.size, failedTimerCount: failedTimers.size, collectionStopDelayMs, profileCapturesStarted, profileCapturesSucceeded, profileCapturesFailed, profileRateLimited, profileCooldownRemainingMs: current === null || !Number.isFinite(nextProfileAllowed) ? null : Math.max(0, nextProfileAllowed - current), coverage: { backendPid, extensionHost: 'not-this-producer', webview: 'not-this-producer', childProcesses: 'excluded', memory: 'process-not-function', cpu: 'process-interval' } }; },
    setProfilingEnabled(value: boolean) { if (!disposed && typeof value === 'boolean') { profilingEnabled = value; if (!value) activeProfile?.cancel(); } },
    cancelCpuProfile() { activeProfile?.cancel(); },
    reset() { collector.reset(); previous = undefined; lastSample = null; resourceSamples = resourceErrors = throttledSamples = counterResets = sampleOverheadMs = 0; lastResourceError = null; },
    async dispose() { if (!disposed) { disposed = true; activeProfile?.cancel(); collector.dispose(); } stopCollection(); await activeProfile?.promise; stopCollection(); retryAbortRemoval(); for (const handle of [...ownedTimers]) clear(handle); },
  };
}
