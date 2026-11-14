/** Contract/render controls only; these do not establish a mounted browser/native UI. */
import React from 'react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createForgeBackendPerformance } from '../server/forgePerformance';
import { getProjectValidationCacheStats } from '../server/projectValidation';
import { createForgePerformanceCollector, type ForgeCpuProfileReport } from '../lib/forgePerformance';
import type { WebviewPerformanceView } from '../lib/webviewPerformance';
import { isForgeCpuProfile, isForgePerformanceReport, performanceNumber, SnapshotView, WebviewCollectionStatus, webviewCollectionStartRefusal, type ForgePerformanceReport } from './PerformancePanel';
// BEGIN BATCH3 native panel test imports
import * as PerformancePanelModule from './PerformancePanel';
import type { NativeBrokerView } from '../server/nativePerformanceBroker';
import { isNativePerformanceSnapshot, isNativePerformanceStatus } from '../../shared/nativePerformanceProtocol';
// END BATCH3 native panel test imports

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export async function runPerformancePanelSelftest() {
  const checks: Array<{ name: string; pass: boolean }> = [];
  const check = (name: string, pass: boolean) => checks.push({ name, pass });
  // Actual producer DTO with injected fixed resources. It remains disabled and
  // never starts a timer, inspector session, process sampler or filesystem read.
  const backend = createForgeBackendPerformance({ now: () => 0, wallNow: () => 1000, resources: {
    pid: () => 77, cpuUsage: () => ({ user: 0, system: 0 }), uptime: () => 0, logicalCpuCount: () => 1,
    memoryUsage: () => ({ rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 }),
  } });
  try {
    const report: ForgePerformanceReport = { ok: true, schemaVersion: 'forge.performance.report.v1', backend: backend.snapshot(), control: backend.status(),
      caches: { projectValidation: getProjectValidationCacheStats() },
      coverage: { native: 'unavailable-not-wired', webview: 'local-current-panel-only', profiling: 'backend-only-explicit-control', cacheBytes: 'accounted-not-exact-heap', operations: 'instrumented-boundaries-only' } };
    check('accepts the actual disabled backend DTO and exact coverage', isForgePerformanceReport(report));
    const unavailableClock = clone(report); unavailableClock.backend.selfOverhead.recordMs = null; unavailableClock.backend.selfOverhead.snapshotMs = null;
    check('unavailable overhead is valid null rather than fabricated zero', isForgePerformanceReport(unavailableClock));
    const missing = clone(report) as unknown as { backend: { selfOverhead: Record<string, unknown> } };
    delete missing.backend.selfOverhead.snapshotScope;
    check('rejects missing snapshot accounting scope', !isForgePerformanceReport(missing));
    const missingDrops = clone(report) as unknown as { backend: { drops: Record<string, unknown> } };
    delete missingDrops.backend.drops.staleFinishes;
    check('rejects missing stale-completion counter', !isForgePerformanceReport(missingDrops));
    const otherProducer = clone(report); otherProducer.control.coverage.backendPid = 78;
    check('rejects mixed backend process attribution', !isForgePerformanceReport(otherProducer));
    const badCounter = clone(report) as unknown as { caches: { projectValidation: Record<string, unknown> } };
    delete badCounter.caches.projectValidation.accountedBytes;
    check('rejects missing cache accounting rather than showing zero', !isForgePerformanceReport(badCounter));
    const badCoverage = clone(report) as unknown as { coverage: { native: string } }; badCoverage.coverage.native = 'fully-profiled';
    check('rejects an unsupported native coverage claim', !isForgePerformanceReport(badCoverage));
    const profile: ForgeCpuProfileReport = { ok: true, schemaVersion: 'forge.cpu-profile.v1', producer: report.backend.producer,
      requestedDurationMs: 1000, observedDurationMs: null, delayedStopMs: null, samplingIntervalMicros: 1000,
      profileDurationMicros: null, sampleCount: null, scannedSampleCount: 0, functions: [],
      omitted: { nodes: 0, samples: 0, functions: 0, unknownNodeSamples: 0, invalidNodes: 0, invalidDeltas: 0, redactedLabels: 0 },
      coverage: { process: 'current-backend-only', attribution: 'sampled-self-time-not-exact-operation-cpu', rawProfile: 'not-returned-or-persisted', timer: 'event-loop-blockage-can-delay-stop', resourceLimit: 'no-os-heap-quota', samples: 'unavailable' } };
    check('accepts explicitly unavailable function sample evidence', isForgeCpuProfile(profile));
    check('refusal cannot masquerade as a successful profile', !isForgeCpuProfile({ ...profile, ok: false, code: 'PROFILE_BUSY' }));
    for (const module of ['C:\\private\\source.ts', '/private/source.ts', '../private/source.ts', 'https://private.test/source.ts']) {
      check(`rejects nonrelative profile module ${module}`, !isForgeCpuProfile({ ...profile,
        functions: [{ name: 'work', module, line: 1, column: 1, selfSamples: 1, selfSampleMicros: 1000 }] }));
    }
    const missingInstance = clone(profile) as unknown as { producer: Record<string, unknown> }; delete missingInstance.producer.instanceId;
    check('profile cannot omit its producer identity field', !isForgeCpuProfile(missingInstance));
    const collector = createForgePerformanceCollector({ component: 'backend', scope: 'owned-process', pid: 77, enabled: true, now: () => 0, wallNow: () => 1000 });
    collector.recordResource({ rssBytes: 0 });
    const markup = renderToStaticMarkup(<SnapshotView title="Backend fixture" snapshot={collector.snapshot()} />);
    check('render distinguishes measured zero RSS from unknown CPU', markup.includes('0 MiB') && markup.includes('Unknown') && markup.includes('CPU / one core'));
    check('render does not promote empty operation history to zero-cost proof', markup.includes('No instrumented operation samples') && markup.includes('does not establish zero cost'));
    check('render labels operation timing and quantiles honestly', markup.includes('not exclusive CPU') && markup.includes('histogram upper-bound estimate'));
    check('number formatting keeps zero and unknown distinct', performanceNumber(0, '%') === '0%' && performanceNumber(null, '%') === 'Unknown' && performanceNumber(undefined) === 'Unknown');
    const idleCollection: WebviewPerformanceView['collection'] = { active: false, durationMs: null, startedAtUnixMs: null, expiresAtUnixMs: null, stopReason: null, cleanupUnconfirmed: false, ownedTimerCount: 0, failedTimerCount: 0 };
    check('local idle collection with no retained timer permits the start preflight', webviewCollectionStartRefusal(idleCollection) === null);
    check('active local collection refuses another backend-first start', webviewCollectionStartRefusal({ ...idleCollection, active: true, ownedTimerCount: 1 }) !== null);
    check('inactive unconfirmed local cleanup refuses a start', webviewCollectionStartRefusal({ ...idleCollection, cleanupUnconfirmed: true }) !== null);
    check('retained failed timer refuses a start even if cleanup flag is absent', webviewCollectionStartRefusal({ ...idleCollection, ownedTimerCount: 1, failedTimerCount: 1 }) !== null);
    check('inactive retained timer alone refuses a start', webviewCollectionStartRefusal({ ...idleCollection, ownedTimerCount: 1 }) !== null);
    const cleanupMarkup = renderToStaticMarkup(<WebviewCollectionStatus collection={{ ...idleCollection, cleanupUnconfirmed: true, ownedTimerCount: 1, failedTimerCount: 1 }} onStop={() => undefined} />);
    check('inactive retained cleanup exposes timer counts and remains retryable', cleanupMarkup.includes('inactive') && cleanupMarkup.includes('owned timers 1') && cleanupMarkup.includes('failed timer cleanup 1') && cleanupMarkup.includes('Retry webview timer cleanup'));
    check('inactive display does not claim failed cleanup completed', cleanupMarkup.includes('Inactive recording does not confirm cleanup') && cleanupMarkup.includes('another collection is refused'));
    collector.dispose();
  } finally { await backend.dispose(); }
  // BEGIN BATCH3 native panel default coverage
  checks.push(...(await runNativePerformancePanelSelftest()).checks);
  // END BATCH3 native panel default coverage
  const passed = checks.filter(row => row.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
// BEGIN BATCH3 native panel contract tests
type NativePanelOperation = 'read' | 'start' | 'stop';
type NativePanelReport = {
  schemaVersion: 'forge.native-performance.report.v1'; operation: NativePanelOperation; ok: boolean;
  availability: NativeBrokerView['availability']; unavailableReason: NativeBrokerView['unavailableReason'];
  ownership: 'none' | 'self' | 'other' | 'operator'; status: NativeBrokerView | null; code?: string;
};
type NativePanelCheck = { name: string; pass: boolean; outcome: 'PASS' | 'FAIL' | 'BLOCKED'; detail?: string };

/** DTO/static-render evidence only. Mounted authority/race controls remain browser gates. */
export async function runNativePerformancePanelSelftest() {
  const checks: NativePanelCheck[] = [];
  const check = (name: string, pass: boolean) => checks.push({ name, pass, outcome: pass ? 'PASS' : 'FAIL' });
  const attempt = (name: string, present: boolean, work: () => boolean) => {
    if (!present) { checks.push({ name, pass: false, outcome: 'BLOCKED', detail: 'native panel export prerequisite is absent' }); return; }
    try { check(name, work()); } catch (error) { checks.push({ name, pass: false, outcome: 'FAIL', detail: error instanceof Error ? error.message : String(error) }); }
  };
  const exports = PerformancePanelModule as unknown as Record<string, unknown>;
  const guard = exports.isForgeNativePerformanceReport as ((value: unknown, operation?: NativePanelOperation) => boolean) | undefined;
  const StatusView = exports.NativePerformanceStatusView as React.ComponentType<{
    report: NativePanelReport; pending?: 'start' | 'stop' | null; onStop: () => void;
  }> | undefined;
  const hasGuard = typeof guard === 'function', hasStatusView = typeof StatusView === 'function';
  check('native report guard export prerequisite', hasGuard);
  check('native status view export prerequisite', hasStatusView);
  const collector = createForgePerformanceCollector({ component: 'extension-host', scope: 'shared-process', pid: 42,
    instanceId: 'native_panel_instance_01', enabled: true, now: () => 0, wallNow: () => 1000 });
  try {
    collector.recordResource({ rssBytes: 0, cpuOneCorePercent: 0, cpuHostPercent: null });
    const snapshot = collector.snapshot();
    const native: NonNullable<NativeBrokerView['native']> = {
      schemaVersion: 'forge.native-performance.status.v1', producer: { component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: 'native_panel_instance_01' },
      disposed: false, collectionActive: true, captureId: 'native_panel_capture_01', collectionStartedAtUnixMs: 1000, collectionExpiresAtUnixMs: 61000,
      intervalMs: 2000, eventLoopDelayMonitoring: false, resourceSamples: 1, resourceErrors: 0, throttledSamples: 0, counterResets: 0,
      sampleOverheadMs: 0, lastResourceError: null, collectionStopDelayMs: null, collectionCleanupUnconfirmed: false,
      ownedTimerCount: 2, failedTimerCount: 0, lastStopReason: null,
    };
    const status: NativeBrokerView = { schemaVersion: 'forge.native-performance.broker.v1', backendInstanceId: 'backend_panel_instance_01',
      availability: 'ready', unavailableReason: null, native, pending: null, cancellation: 'none', cleanupUnconfirmed: false,
      orphaned: false, captureOwned: true, readSubscribers: 0, snapshot, snapshotAgeMs: 25, lastRefreshOutcome: 'ok',
      rejectedMessages: 0, lateResults: 0, droppedSnapshots: 0, timerCleanupUnconfirmed: false };
    const read: NativePanelReport = { schemaVersion: 'forge.native-performance.report.v1', operation: 'read', ok: true,
      availability: 'ready', unavailableReason: null, ownership: 'self', status };
    const absent: NativePanelReport = { schemaVersion: 'forge.native-performance.report.v1', operation: 'read', ok: true,
      availability: 'unavailable', unavailableReason: 'transport-absent', ownership: 'none', status: null };
    const control = (operation: 'start' | 'stop'): NativePanelReport => {
      const result = clone(read); result.operation = operation; result.status!.snapshot = null; result.status!.snapshotAgeMs = null;
      if (operation === 'stop') Object.assign(result.status!.native!, { collectionActive: false, collectionExpiresAtUnixMs: null,
        collectionStopDelayMs: 0, ownedTimerCount: 0, lastStopReason: 'requested' });
      if (operation === 'stop') result.status!.captureOwned = false;
      return result;
    };
    check('native panel fixture uses valid actual native protocol snapshot and status', isNativePerformanceSnapshot(snapshot) && isNativePerformanceStatus(native));
    attempt('native read accepts exact shared-process report and bounded retained snapshot', hasGuard, () => guard!(read, 'read'));
    attempt('native no-transport read accepts null status without invented identities', hasGuard, () => guard!(absent, 'read'));
    attempt('native start accepts ACK-only status without granting snapshot read', hasGuard, () => guard!(control('start'), 'start'));
    attempt('native stopped history retains self and operator control ownership', hasGuard, () => guard!(control('stop'), 'stop') && guard!({ ...control('stop'), ownership: 'operator' }, 'stop'));
    attempt('native missing required wrapper keys are rejected', hasGuard, () => ['schemaVersion', 'operation', 'ok', 'availability', 'unavailableReason', 'ownership', 'status'].every(key => {
      const value = clone(read) as unknown as Record<string, unknown>; delete value[key]; return !guard!(value);
    }));
    attempt('native wrapper rejects undeclared private and free-text fields', hasGuard, () => ['owner', 'keyId', 'nonce', 'epoch', 'error', 'message'].every(key => !guard!({ ...read, [key]: 'not-public' })));
    attempt('native wrapper rejects backend and foreign schemas or operation confusion', hasGuard, () => !guard!({ ...read, schemaVersion: 'forge.performance.report.v1' }) && !guard!(read, 'start') && !guard!({ ...read, operation: 'profile' }));
    attempt('native wrapper rejects absent unknown or contradictory failure codes', hasGuard, () => !guard!({ ...read, ok: false }) && !guard!({ ...read, ok: false, code: 'UNKNOWN' }) && !guard!({ ...read, code: 'NATIVE_PERFORMANCE_BUSY' }));
    attempt('native wrapper accepts each closed server failure code', hasGuard, () => [
      'INPUT_INVALID', 'BUSY', 'CAPTURE_MISMATCH', 'IDENTITY_MISMATCH', 'PREEMPTED', 'CLEANUP_UNCONFIRMED', 'DISPOSED', 'UNAVAILABLE',
      'RETIRED', 'AUTHORITY_REVOKED', 'NOT_OWNER', 'CONTROL_TIMEOUT', 'ABORTED', 'PROTOCOL_ERROR', 'READER_LIMIT', 'START_FAILED', 'REQUEST_FAILED',
    ].every(code => guard!({ ...control('stop'), ok: false, code: `NATIVE_PERFORMANCE_${code}` }, 'stop')));
    attempt('native wrapper rejects unrecognized ownership and duplicated availability disagreement', hasGuard, () => !guard!({ ...read, ownership: 'authorized' }) && !guard!({ ...read, availability: 'waiting' }) && !guard!({ ...read, unavailableReason: 'waiting' }));
    attempt('native null status is only truthful unavailable no-transport read', hasGuard, () => !guard!({ ...read, status: null }) && !guard!({ ...absent, operation: 'start' }) && !guard!({ ...absent, ownership: 'self' }));
    attempt('native controls reject retained snapshot and nonnull snapshot age', hasGuard, () => !guard!({ ...read, operation: 'start' }) && !guard!({ ...read, operation: 'stop' })
      && !guard!({ ...control('start'), status: { ...control('start').status, snapshotAgeMs: 0 } }));
    attempt('native report rejects malformed backend/native/capture identities', hasGuard, () => {
      const values = [clone(read), clone(read), clone(read)]; values[0].status!.backendInstanceId = 'bad'; values[1].status!.native!.producer.instanceId = 'bad'; values[2].status!.native!.captureId = 'bad';
      return values.every(value => !guard!(value));
    });
    attempt('native snapshot must match the status producer identity and PID', hasGuard, () => {
      const instance = clone(read), pid = clone(read); instance.status!.snapshot!.producer.instanceId = 'different_native_instance'; pid.status!.snapshot!.producer.pid = 43;
      return !guard!(instance) && !guard!(pid);
    });
    attempt('native report rejects backend or webview producer substitution', hasGuard, () => {
      const value = clone(read); Object.assign(value.status!.native!.producer, { component: 'backend', scope: 'owned-process' });
      const other = clone(read); other.status!.snapshot!.producer.component = 'webview'; return !guard!(value) && !guard!(other);
    });
    attempt('native report rejects browser metric leakage and excessive retained snapshot arrays', hasGuard, () => {
      const browser = clone(read); browser.status!.snapshot!.resources[0].fps = 60;
      const tooMany = clone(read); tooMany.status!.snapshot!.resources = Array.from({ length: 121 }, () => clone(snapshot.resources[0]));
      return !guard!(browser) && !guard!(tooMany);
    });
    attempt('native report rejects negative nonfinite and fractional broker counters', hasGuard, () => [-1, NaN, Infinity, 1.5].every(number => !guard!({ ...read, status: { ...status, lateResults: number } })));
    attempt('native broker and native status reject undeclared private fields', hasGuard, () => !guard!({ ...read, status: { ...status, keyId: 'private-owner' } }) && !guard!({ ...read, status: { ...status, native: { ...native, nonce: 'private-nonce' } } }));
    // BEGIN BATCH3 denied-read snapshot regressions
    attempt('native revoked-authority read rejects a retained snapshot', hasGuard, () => {
      const denied = clone(read); denied.ok = false; denied.code = 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED';
      return denied.status?.snapshot !== null && isNativePerformanceSnapshot(denied.status?.snapshot) && !guard!(denied, 'read');
    });
    attempt('native non-owner read rejects a retained snapshot', hasGuard, () => {
      const denied = clone(read); denied.ok = false; denied.code = 'NATIVE_PERFORMANCE_NOT_OWNER';
      return denied.status?.snapshot !== null && isNativePerformanceSnapshot(denied.status?.snapshot) && !guard!(denied, 'read');
    });
    // END BATCH3 denied-read snapshot regressions
    attempt('native ownership none preserves active cleanup uncertainty', hasGuard, () => {
      const value = clone(read); value.ownership = 'none'; Object.assign(value.status!, { availability: 'retired', unavailableReason: 'retired', cleanupUnconfirmed: true, cancellation: 'unknown', captureOwned: false });
      value.availability = 'retired'; value.unavailableReason = 'retired'; return guard!(value, 'read');
    });
    const nativeMarkup = renderToStaticMarkup(<SnapshotView title="Native fixture" snapshot={snapshot} />);
    check('native snapshot renders process CPU RSS zero and unknown independently', nativeMarkup.includes('CPU / one core') && nativeMarkup.includes('CPU / host') && nativeMarkup.includes('0 MiB') && nativeMarkup.includes('0%') && nativeMarkup.includes('Unknown'));
    check('native snapshot does not attribute browser frame cadence FPS or longtasks', !nativeMarkup.includes('Frame cadence') && !nativeMarkup.includes('Frame interval') && !nativeMarkup.includes('Last observed longtask') && !nativeMarkup.includes('Frames describe visible paint cadence'));
    const render = (report: NativePanelReport, pending?: 'start' | 'stop') => renderToStaticMarkup(React.createElement(StatusView!, { report, pending, onStop: () => undefined }));
    attempt('native status view names shared process attribution and exact capture', hasStatusView, () => {
      const markup = render(read); return /shared.process/i.test(markup) && /other extensions/i.test(markup) && markup.includes(native.captureId!);
    });
    attempt('native status view preserves no-transport Unknown instead of zero-cost claim', hasStatusView, () => {
      const markup = render(absent); return /unavailable/i.test(markup) && /unknown/i.test(markup) && !/0 MiB|0%/.test(markup);
    });
    attempt('native status view distinguishes another owner from self and operator', hasStatusView, () => /another|other owner|owned by other/i.test(render({ ...read, ownership: 'other' })) && /operator/i.test(render({ ...read, ownership: 'operator' })));
    attempt('native status view shows pending and cleanup uncertainty without claiming stopped', hasStatusView, () => {
      const value = control('stop'); Object.assign(value.status!, { cleanupUnconfirmed: true, cancellation: 'unknown', timerCleanupUnconfirmed: true });
      Object.assign(value.status!.native!, { collectionCleanupUnconfirmed: true, ownedTimerCount: 1, failedTimerCount: 1 });
      const markup = render(value); return /cleanup/i.test(markup) && /unknown|unconfirmed/i.test(markup) && /pending|starting/i.test(render(read, 'start')) && /pending|stopping/i.test(render(read, 'stop'));
    });
    attempt('native status view exposes stale snapshot freshness without asserting fresh data', hasStatusView, () => {
      const value = clone(read); value.status!.lastRefreshOutcome = 'timeout'; value.status!.snapshotAgeMs = 30_000;
      return /stale|last.refresh.*timeout|refresh.*failed/i.test(render(value));
    });
  } finally { collector.dispose(); }
  const passed = checks.filter(row => row.pass).length, failed = checks.filter(row => row.outcome === 'FAIL').length, blocked = checks.filter(row => row.outcome === 'BLOCKED').length;
  return { allPassed: passed === checks.length, passed, failed, blocked, total: checks.length, checks };
}
// END BATCH3 native panel contract tests
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // BEGIN BATCH3 native panel CLI selection
  const run = process.argv.includes('--native-performance-selftest') ? runNativePerformancePanelSelftest : runPerformancePanelSelftest;
  // END BATCH3 native panel CLI selection
  void run().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.allPassed) process.exitCode = 1; }).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
