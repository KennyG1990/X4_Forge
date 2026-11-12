/** One opt-in webview collector. Existing producers push facts; no sampler is started here. */
import { createForgePerformanceCollector, type ForgePerformanceCollector, type ForgePerformanceOutcome, type ForgePerformanceSnapshot } from './forgePerformance';

export const WEBVIEW_PERFORMANCE_MAX_DURATION_MS = 900_000;
export const WEBVIEW_PERFORMANCE_DEFAULT_DURATION_MS = 60_000;
type Visibility = 'visible' | 'hidden' | 'unknown';
type LongTaskSupport = 'not-attached' | 'supported' | 'unsupported';
type HeapSupport = 'not-sampled' | 'supported' | 'unavailable';
type StopReason = 'not-started' | 'manual' | 'expired' | 'clock-unavailable' | 'timer-unavailable' | 'disposed' | null;
export interface WebviewPerformanceEnvironment {
  now(): number;
  wallNow(): number;
  origin(): string | null;
  setTimer(callback: () => void, durationMs: number): unknown;
  clearTimer(handle: unknown): void;
}
export interface WebviewPerformanceView {
  snapshot: ForgePerformanceSnapshot;
  collection: { active: boolean; durationMs: number | null; startedAtUnixMs: number | null; expiresAtUnixMs: number | null; stopReason: StopReason;
    cleanupUnconfirmed: boolean; ownedTimerCount: number; failedTimerCount: number };
  coverage: {
    fetch: 'logical-request-response-headers-only'; responseBodies: 'not-observed'; rendering: 'not-profiled';
    frameProducer: 'existing-fps-meter-only'; frames: 'not-attached' | 'observing' | 'paused';
    longTasks: LongTaskSupport; heap: HeapSupport; visibility: Visibility;
    resourceMeaning: 'cadence-or-observed-longtask-not-exclusive-cpu';
    adapterErrors: number; ignoredCompletions: number;
  };
}
export type WebviewPerformanceStartResult = { ok: true; durationMs: number; expiresAtUnixMs: number | null }
  | { ok: false; code: 'invalid-duration' | 'collection-active' | 'cleanup-unconfirmed' | 'disposed' | 'clock-unavailable' | 'timer-unavailable' };
export interface WebviewPerformanceFrame {
  fps: number | null; frameIntervalMs: number | null; jsHeapUsedBytes?: number | null; visibility: Visibility;
}
export interface WebviewPerformanceRequestObservation {
  headers(response: Response): void;
  failure(error: unknown): void;
  observeOwnedPromise<T extends Promise<Response>>(promise: T): T;
}
export interface WebviewPerformanceController {
  start(durationMs?: number): WebviewPerformanceStartResult;
  stop(): void;
  isCollecting(): boolean;
  read(): WebviewPerformanceView;
  beginRequest(input: RequestInfo | URL, init?: RequestInit): WebviewPerformanceRequestObservation;
  recordFrame(sample: WebviewPerformanceFrame): void;
  recordLongTask(durationMs: number, visible: boolean): void;
  setSupport(support: Partial<Pick<WebviewPerformanceView['coverage'], 'frames' | 'longTasks' | 'heap' | 'visibility'>>): void;
  dispose(): void;
}

// Reviewed constant names, never a URL-derived bucket. Unlisted/dynamic routes
// share one bucket; query strings, origins, file paths and payloads are not kept.
const ROUTE_NAMES = new Map([
  ['/api/agent/workspace', 'workspace'], ['/api/agent/workspaces', 'workspaces'],
  ['/api/agent/workspaces/bootstrap', 'workspace.bootstrap'], ['/api/agent/compile', 'compile'],
  ['/api/agent/project/validate', 'project.validate'], ['/api/agent/project/validate/check', 'project.validate'],
  ['/api/agent/project/xml-references', 'project.xml-references'], ['/api/agent/project/files', 'project.files'],
  ['/api/agent/deploy', 'deploy'], ['/api/agent/deploy-verify', 'deploy.verify'],
  ['/api/schema/config', 'schema.config'], ['/api/agent/schema', 'schema'],
  ['/api/reference/status', 'reference.status'], ['/api/reference/coverage', 'reference.coverage'],
  ['/api/reference/manifest', 'reference.manifest'], ['/api/reference/effective-file', 'reference.file'],
  ['/api/reference/file', 'reference.file'], ['/api/reference/suggest', 'reference.suggest'],
  ['/api/agent/object-index', 'object-index'], ['/api/agent/performance', 'performance.snapshot'],
  ['/api/agent/performance/snapshot', 'performance.snapshot'], ['/api/agent/performance/profile', 'performance.profile'],
]);
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
function requestName(input: RequestInfo | URL, init: RequestInit | undefined, origin: string | null): string | null {
  try {
    if (!origin) return null;
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : request?.url;
    if (!raw) return null;
    const url = new URL(raw, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return null;
    const proposed = String(init?.method || request?.method || 'GET').toUpperCase();
    const method = METHODS.has(proposed) ? proposed : 'OTHER';
    return `http.${method}.${ROUTE_NAMES.get(url.pathname) || 'api.other'}.headers`;
  } catch { return null; }
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function rejectionOutcome(error: unknown): ForgePerformanceOutcome {
  try { return error && typeof error === 'object' && 'name' in error && error.name === 'AbortError' ? 'aborted' : 'error'; }
  catch { return 'error'; }
}
/** Only observe a Promise already awaited/adopted by its async transport owner.
 * Observing the owner's returned Promise would suppress its unhandled rejection.
 * This helper adds no replacement Promise and never lets recorder errors escape. */
export function observeOwnedFetchPromise<T extends Promise<Response>>(
  promise: T, onHeaders: (response: Response) => void, onFailure: (error: unknown) => void,
): T {
  try {
    void promise.then(response => { try { onHeaders(response); } catch { /* diagnostic only */ } },
      error => { try { onFailure(error); } catch { /* diagnostic only */ } });
  } catch { /* malformed/unsupported observer attachment cannot change the owner */ }
  return promise;
}
const NO_REQUEST_OBSERVATION: WebviewPerformanceRequestObservation = Object.freeze({
  headers() {}, failure() {},
  observeOwnedPromise<T extends Promise<Response>>(promise: T): T { return promise; },
});

export function createWebviewPerformanceController(options: {
  environment?: Partial<WebviewPerformanceEnvironment>; collector?: ForgePerformanceCollector;
} = {}): WebviewPerformanceController {
  const environment: WebviewPerformanceEnvironment = {
    now: () => performance.now(), wallNow: Date.now,
    origin: () => typeof location === 'undefined' ? null : location.origin,
    setTimer: (callback, durationMs) => setTimeout(callback, durationMs),
    clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    ...options.environment,
  };
  const collector = options.collector || createForgePerformanceCollector({ component: 'webview', scope: 'webview',
    enabled: false, now: environment.now, wallNow: environment.wallNow });
  let active = false; let disposed = false; let generation = 0;
  // Keep one owner slot even when an adapter throws without returning a handle.
  // A delivered one-shot callback proves settlement; a failed clear does not.
  type LeaseTimer = { handle?: unknown; hasHandle: boolean; setting: boolean; fired: boolean; failed: boolean };
  let timer: LeaseTimer | null = null; let expiresAt: number | null = null;
  let duration: number | null = null; let startedAtUnixMs: number | null = null; let expiresAtUnixMs: number | null = null;
  let stopReason: StopReason = 'not-started';
  let adapterErrors = 0; let ignoredCompletions = 0;
  const support = { frames: 'not-attached' as WebviewPerformanceView['coverage']['frames'],
    longTasks: 'not-attached' as LongTaskSupport, heap: 'not-sampled' as HeapSupport, visibility: 'unknown' as Visibility };
  const safe = (work: () => void) => { try { work(); } catch { adapterErrors++; } };
  const clock = (read: () => number): number | null => { try { const value = read(); if (finite(value)) return value; } catch { /* unavailable */ } return null; };
  const cleanupTimer = () => {
    const owned = timer;
    if (!owned) return;
    if (owned.fired) { if (timer === owned) timer = null; return; }
    if (!owned.hasHandle) { if (!owned.setting) owned.failed = true; return; }
    try {
      environment.clearTimer(owned.handle);
      if (timer === owned) timer = null;
    } catch { owned.failed = true; adapterErrors++; }
  };
  const end = (reason: StopReason) => {
    active = false; generation++; expiresAt = null; stopReason = reason;
    cleanupTimer();
    safe(() => collector.setEnabled(false));
  };
  const collecting = () => {
    if (!active || disposed) return false;
    const now = clock(environment.now);
    if (now === null) { end('clock-unavailable'); return false; }
    if (expiresAt === null || now >= expiresAt) { end('expired'); return false; }
    return true;
  };
  const record = (name: string, start: number, lease: number, outcome: ForgePerformanceOutcome) => safe(() => {
    if (lease !== generation || !collecting()) { ignoredCompletions++; return; }
    const now = clock(environment.now);
    if (now === null || now < start) { adapterErrors++; return; }
    collector.recordOperation({ name, durationMs: now - start, outcome });
  });
  const beginFetch = (input: RequestInfo | URL, init?: RequestInit): { name: string; start: number; lease: number } | null => {
    try {
      if (!collecting()) return null;
      const name = requestName(input, init, environment.origin()); const start = clock(environment.now);
      return name && start !== null ? { name, start, lease: generation } : null;
    } catch { adapterErrors++; return null; }
  };
  return {
    start(durationMs = WEBVIEW_PERFORMANCE_DEFAULT_DURATION_MS) {
      if (!Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > WEBVIEW_PERFORMANCE_MAX_DURATION_MS) return { ok: false, code: 'invalid-duration' };
      if (disposed) return { ok: false, code: 'disposed' };
      if (collecting()) return { ok: false, code: 'collection-active' };
      if (timer !== null) return { ok: false, code: 'cleanup-unconfirmed' };
      const now = clock(environment.now);
      if (now === null) { stopReason = 'clock-unavailable'; return { ok: false, code: 'clock-unavailable' }; }
      let owned: LeaseTimer | null = null;
      try {
        collector.setEnabled(false); collector.reset();
        generation++; duration = durationMs; startedAtUnixMs = clock(environment.wallNow);
        expiresAtUnixMs = startedAtUnixMs === null ? null : startedAtUnixMs + durationMs;
        expiresAt = now + durationMs; active = true; stopReason = null;
        const lease = generation;
        owned = { hasHandle: false, setting: true, fired: false, failed: false };
        timer = owned;
        const leaseTimer = owned;
        const handle = environment.setTimer(() => {
          if (leaseTimer.fired) return;
          leaseTimer.fired = true;
          if (timer === leaseTimer) timer = null;
          if (active && lease === generation) end('expired');
        }, durationMs);
        owned.setting = false; owned.handle = handle; owned.hasHandle = true;
        if (owned.fired || !active || lease !== generation) {
          end('timer-unavailable');
          return { ok: false, code: 'timer-unavailable' };
        }
        collector.setEnabled(true);
        return { ok: true, durationMs, expiresAtUnixMs };
      } catch {
        if (owned) owned.setting = false;
        adapterErrors++; end('timer-unavailable'); return { ok: false, code: 'timer-unavailable' };
      }
    },
    stop() { if (active || timer !== null) end(disposed ? 'disposed' : 'manual'); },
    isCollecting: collecting,
    read() {
      collecting();
      return Object.freeze({ snapshot: collector.snapshot(), collection: Object.freeze({ active, durationMs: duration, startedAtUnixMs, expiresAtUnixMs, stopReason,
        cleanupUnconfirmed: timer?.failed === true, ownedTimerCount: timer === null ? 0 : 1, failedTimerCount: timer?.failed === true ? 1 : 0 }),
        coverage: Object.freeze({ ...support, fetch: 'logical-request-response-headers-only' as const, responseBodies: 'not-observed' as const, rendering: 'not-profiled' as const,
          frameProducer: 'existing-fps-meter-only' as const, resourceMeaning: 'cadence-or-observed-longtask-not-exclusive-cpu' as const, adapterErrors, ignoredCompletions }) });
    },
    beginRequest(input, init) {
      const measurement = beginFetch(input, init);
      if (!measurement) return NO_REQUEST_OBSERVATION;
      let finished = false;
      const finish = (outcome: ForgePerformanceOutcome) => {
        if (finished) return; finished = true;
        record(measurement.name, measurement.start, measurement.lease, outcome);
      };
      const observation: WebviewPerformanceRequestObservation = {
        headers(response) { safe(() => finish(response.ok ? 'ok' : 'error')); },
        failure(error) { safe(() => finish(rejectionOutcome(error))); },
        observeOwnedPromise(promise) { return observeOwnedFetchPromise(promise, observation.headers, observation.failure); },
      };
      return observation;
    },
    recordFrame(sample) { safe(() => {
      if (!collecting()) return;
      support.visibility = ['visible', 'hidden', 'unknown'].includes(sample.visibility) ? sample.visibility : 'unknown';
      const visible = support.visibility === 'visible';
      support.heap = finite(sample.jsHeapUsedBytes) ? 'supported' : 'unavailable';
      collector.recordResource({ fps: visible ? sample.fps : null, frameIntervalMs: visible ? sample.frameIntervalMs : null,
        jsHeapUsedBytes: sample.jsHeapUsedBytes ?? null });
    }); },
    recordLongTask(durationMs, visible) { safe(() => {
      if (!collecting() || visible !== true || support.visibility !== 'visible' || support.longTasks !== 'supported') return;
      if (!finite(durationMs) || durationMs < 50) { adapterErrors++; return; }
      collector.recordOperation({ name: 'ui.longtask', durationMs, outcome: 'ok' });
      // An observation event, not a persistent zero/no-stall assertion or a
      // second sampling window. Other unavailable resource fields remain null.
      collector.recordResource({ longTaskDurationMs: durationMs });
    }); },
    setSupport(next) { safe(() => {
      if (['not-attached', 'observing', 'paused'].includes(next.frames || '')) support.frames = next.frames!;
      if (['not-attached', 'supported', 'unsupported'].includes(next.longTasks || '')) support.longTasks = next.longTasks!;
      if (['not-sampled', 'supported', 'unavailable'].includes(next.heap || '')) support.heap = next.heap!;
      if (['visible', 'hidden', 'unknown'].includes(next.visibility || '')) support.visibility = next.visibility!;
    }); },
    dispose() { if (disposed) { cleanupTimer(); return; } end('disposed'); disposed = true; safe(() => collector.dispose()); },
  };
}

const webviewPerformance = createWebviewPerformanceController();
export const startWebviewPerformanceCollection = (durationMs?: number) => webviewPerformance.start(durationMs);
export const stopWebviewPerformanceCollection = () => webviewPerformance.stop();
export const readWebviewPerformance = () => webviewPerformance.read();
export const isWebviewPerformanceCollecting = () => webviewPerformance.isCollecting();
export const beginWebviewPerformanceRequest = (input: RequestInfo | URL, init?: RequestInit) => webviewPerformance.beginRequest(input, init);
export const recordWebviewFrame = (sample: WebviewPerformanceFrame) => webviewPerformance.recordFrame(sample);
export const recordWebviewLongTask = (durationMs: number, visible: boolean) => webviewPerformance.recordLongTask(durationMs, visible);
export const setWebviewPerformanceSupport: WebviewPerformanceController['setSupport'] = support => webviewPerformance.setSupport(support);
