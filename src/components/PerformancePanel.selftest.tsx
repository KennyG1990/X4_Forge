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
  const passed = checks.filter(row => row.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runPerformancePanelSelftest().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result.allPassed) process.exitCode = 1; }).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
