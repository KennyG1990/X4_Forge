import { expect, test, withClosingApiRequest, fetchRouteWithClosingConnection, type APIRequestContext, type Page, type Request, type Response as PlaywrightResponse, type Route, type TestInfo } from './request-transport';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { E2E_API_ORIGIN, E2E_RUNTIME, E2E_TOKEN } from '../../playwright.config';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { stableStringify, workspaceSnapshotHash } from '../../src/lib/workspaceIdentity';
import type { ForgePerformanceReport } from '../../src/components/PerformancePanel';
import type { ForgeCpuProfileReport } from '../../src/lib/forgePerformance';
import type { ModWorkspace } from '../../src/types';
import { ephemeralWorkspaceHeaders, readServerWorkspaceEnvelope, seedServerWorkspace } from './ephemeral';

test.use({ extraHTTPHeaders: { Authorization: `Bearer ${E2E_TOKEN}` }, viewport: { width: 1440, height: 1000 } });
test.setTimeout(120_000);

const reportPath = '/api/agent/performance';
const collectionPath = `${reportPath}/collection`;
const profilePath = `${reportPath}/profile`;
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
type PollResource = { resourceKey: string; subscribers: number; running: boolean };
type StudioWindow = Window & {
  __X4_E2E__?: { getWorkspace: () => ModWorkspace };
  __X4_WORKSPACE_CONTEXT__?: { getWorkspaceId: () => string; getSelectionRevision: () => number };
  __X4_CONTINUOUS_POLLING__?: { snapshot: () => { resources: PollResource[] } };
};
interface Fixture {
  headers: Record<string, string>;
  evidence: unknown[];
  counts: { reports: number; collections: number; profiles: number; collectionResponses: number };
}

async function cleanupPreservingPrimary(primaryFailed: boolean, evidence: unknown[], cleanups: Array<() => void | Promise<void>>) {
  const errors: unknown[] = [];
  for (const cleanup of cleanups) {
    try { await cleanup(); }
    catch (error) { errors.push(error); evidence.push({ cleanupFailure: String(error).slice(0, 2000) }); }
  }
  if (!primaryFailed && errors.length) throw errors[0];
}

function requireReservationWindow(fixture: Fixture, label: string, issuedAt: number, durationMs: number, phase: string) {
  const elapsedMs = performance.now() - issuedAt;
  fixture.evidence.push({ reservationWindow: { label, phase, elapsedMs, durationMs, remainingConservativeMs: durationMs - elapsedMs } });
  expect(elapsedMs, `[fixture timing] ${label} reservation expired ${phase}; this does not establish a product busy-refusal defect.`).toBeLessThan(durationMs);
}

function reportEvidence(value: ForgePerformanceReport) {
  return { schemaVersion: value.schemaVersion, producer: value.backend.producer, enabled: value.backend.enabled,
    capturedAtUnixMs: value.backend.capturedAtUnixMs, control: value.control, caches: value.caches, coverage: value.coverage,
    operationNames: value.backend.operations.map(row => row.name), resourceCount: value.backend.resources.length,
    limits: value.backend.limits, drops: value.backend.drops, selfOverhead: value.backend.selfOverhead };
}

async function readReport(request: APIRequestContext, headers: Record<string, string>): Promise<ForgePerformanceReport> {
  const response = await request.get(E2E_API_ORIGIN + reportPath, { headers });
  expect(response.status(), await response.text()).toBe(200);
  const value = await response.json() as ForgePerformanceReport;
  expect(value).toMatchObject({ ok: true, schemaVersion: 'forge.performance.report.v1',
    backend: { schemaVersion: 'forge.performance.v1', producer: { component: 'backend', scope: 'owned-process' } } });
  expect(value.control.coverage.backendPid).toBe(value.backend.producer.pid);
  return value;
}

async function performanceResources(page: Page): Promise<PollResource[]> {
  return page.evaluate(() => (window as StudioWindow).__X4_CONTINUOUS_POLLING__!.snapshot().resources
    .filter(resource => resource.resourceKey.startsWith('forge-performance:')));
}

async function boot(page: Page, workspace: ModWorkspace) {
  await page.goto('/');
  await expect.poll(async () => {
    const current = await page.evaluate(() => (window as StudioWindow).__X4_E2E__?.getWorkspace());
    return current ? workspaceSnapshotHash(current) : '';
  }).toBe(workspaceSnapshotHash(workspace));
  const health = page.getByTestId('health-card');
  await health.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined);
  if (await health.isVisible()) await page.getByTestId('health-card-dismiss').click();
  await page.locator('[data-sidebar-tab="diagnostics"]').click();
  await page.getByTestId('diagnostics-scope-performance').click();
  await expect(page.getByTestId('forge-performance-panel')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Owned backend', exact: true })).toBeVisible();
}

async function renderedRuntime(page: Page, evidence: unknown[]) {
  const sources = await page.locator('script[type="module"][src]').evaluateAll(scripts => scripts.map(script => script.getAttribute('src')!));
  const origin = new URL(page.url()).origin;
  const entries = sources.map(src => ({ src, url: new URL(src, page.url()) })).filter(entry => E2E_RUNTIME.mode === 'compiled'
    ? /^\/assets\/[A-Za-z0-9_-]+\.js$/.test(entry.url.pathname) : entry.url.pathname === '/src/main.tsx');
  expect(entries, 'Exactly one real application module must be served.').toHaveLength(1);
  const { src, url } = entries[0];
  expect(url.origin).toBe(origin);
  expect(url.username).toBe(''); expect(url.password).toBe('');
  expect(url.search).toBe(''); expect(url.hash).toBe('');
  const response = await withClosingApiRequest(page.request).get(url.href);
  expect(response.status()).toBe(200);
  expect(response.url()).toBe(url.href);
  const bytes = await response.body();
  if (E2E_RUNTIME.mode === 'compiled') {
    expect(src).toMatch(/^\/assets\/[A-Za-z0-9_-]+\.js$/);
    expect(bytes).toEqual(fs.readFileSync(path.join(process.cwd(), 'dist', src!.slice(1))));
    expect(await page.content()).not.toContain('/@vite/client');
  }
  evidence.push({ renderedRuntime: { mode: E2E_RUNTIME.mode, asset: src, servedUrl: url.href, sha256: sha(bytes) } });
}

async function withWorkspace(page: Page, request: APIRequestContext, info: TestInfo, name: string, run: (fixture: Fixture) => Promise<void>) {
  const workspace = buildTemplateWorkspace('welcome'); workspace.name = name;
  await seedServerWorkspace(workspace);
  const before = await readServerWorkspaceEnvelope();
  const headers = await ephemeralWorkspaceHeaders(true);
  const counts = { reports: 0, collections: 0, profiles: 0, collectionResponses: 0 };
  const evidence: unknown[] = [{ runtime: E2E_RUNTIME, originalWorkspace: {
    workspaceHash: before.workspaceHash, snapshotHash: before.snapshotHash, canonicalBytesSha256: sha(stableStringify(before.workspace)) } }];
  const onRequest = (event: Request) => {
    const pathname = new URL(event.url()).pathname;
    if (pathname === reportPath && event.method() === 'GET') counts.reports++;
    if (pathname === collectionPath && event.method() === 'POST') counts.collections++;
    if (pathname === profilePath && event.method() === 'POST') counts.profiles++;
  };
  const onResponse = (event: PlaywrightResponse) => {
    if (new URL(event.url()).pathname === collectionPath && event.request().method() === 'POST') counts.collectionResponses++;
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  let primaryFailed = false;
  try {
    await boot(page, before.workspace);
    await run({ headers, evidence, counts });
  } catch (error) {
    primaryFailed = true; throw error;
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
    await cleanupPreservingPrimary(primaryFailed, evidence, [async () => {
      const after = await readServerWorkspaceEnvelope();
      evidence.push({ finalWorkspace: { workspaceHash: after.workspaceHash, snapshotHash: after.snapshotHash,
        canonicalBytesSha256: sha(stableStringify(after.workspace)) }, pageRequestCounts: counts });
      expect(after.workspaceHash).toBe(before.workspaceHash);
      expect(after.snapshotHash).toBe(before.snapshotHash);
      expect(stableStringify(after.workspace)).toBe(stableStringify(before.workspace));
    }, () => {
      fs.mkdirSync(info.outputDir, { recursive: true });
      fs.writeFileSync(info.outputPath('performance-panel-evidence.json'), JSON.stringify(JSON.parse(stableStringify(evidence)), null, 2), 'utf8');
    }]);
  }
}

async function waitForProfileReady(request: APIRequestContext, headers: Record<string, string>) {
  // Real per-process cooldown is retained. No clock, deadline or policy override.
  await expect.poll(async () => {
    const value = await readReport(request, headers);
    return value.control.profilingEnabled && !value.control.profileActive
      && !value.control.profileCleanupUnconfirmed && !value.control.abortListenerCleanupUnconfirmed
      && value.control.profileCooldownRemainingMs === 0;
  }, { timeout: 35_000, intervals: [250, 500, 1000] }).toBe(true);
}

async function cleanupOwnedWork(page: Page, request: APIRequestContext, fixture: Fixture, owned: { collection: boolean; profile: boolean }) {
  if (!owned.collection && !owned.profile) return;
  let primaryFailed = false;
  try {
    if (owned.profile && !page.isClosed()) {
      const cancel = page.getByRole('button', { name: 'Cancel request', exact: true });
      if (await cancel.isVisible()) await cancel.click();
    }
  } catch (error) {
    primaryFailed = true; throw error;
  } finally {
    await cleanupPreservingPrimary(primaryFailed, fixture.evidence, [async () => {
      // Collection has no early backend-stop endpoint. The test's ten-second lease
      // must expire; cancellation requests alone are not accepted as cleanup proof.
      await expect.poll(async () => {
        const value = await readReport(request, fixture.headers);
        return !value.control.collectionActive && !value.control.profileActive
          && !value.control.collectionCleanupUnconfirmed && !value.control.profileCleanupUnconfirmed
          && !value.control.abortListenerCleanupUnconfirmed && value.control.ownedTimerCount === 0
          && value.control.failedTimerCount === 0 && !value.control.eventLoopDelayMonitoring;
      }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);
      if (owned.collection && !page.isClosed()) {
        const stop = page.getByRole('button', { name: 'Stop webview collection only', exact: true });
        if (await stop.isVisible()) await stop.click();
        await expect(page.getByTestId('forge-performance-panel')).toContainText('Webview collection: inactive · owned timers 0; failed timer cleanup 0.');
      }
      fixture.evidence.push({ cleanupConfirmed: reportEvidence(await readReport(request, fixture.headers)) });
    }]);
  }
}

interface DelayedRealResponse<T> { body: T; requestWorkspaceId: string | undefined; release: () => void; finished: Promise<void> }
interface DelayedController<T> { response: Promise<DelayedRealResponse<T>>; dispose: () => Promise<void> }
type CollectionResponse = { ok: true; backend: ForgePerformanceReport['backend']; control: ForgePerformanceReport['control'] };
async function delayNextRealResponse<T>(page: Page, pathname: string, method: string): Promise<DelayedController<T>> {
  let captured!: (value: DelayedRealResponse<T>) => void;
  let rejected!: (reason: unknown) => void;
  const response = new Promise<DelayedRealResponse<T>>((resolve, reject) => { captured = resolve; rejected = reject; });
  void response.catch(() => undefined); // Await/dispose still surface failure if an earlier assertion exits first.
  let active: DelayedRealResponse<T> | undefined;
  let failure: unknown;
  let cleanupFailure: unknown;
  let disposing = false;
  let claimed = false;
  const intercepted: Array<{ route: Route; settled: boolean; work?: Promise<void> }> = [];
  const pattern = `**${pathname}`;
  const alreadySettled = (error: unknown) => /already handled|aborted|Target.*closed|Request.*intercept|Invalid InterceptionId/i.test(String(error));
  const abort = async (owner: typeof intercepted[number]) => {
    if (owner.settled) return;
    try { await owner.route.abort('failed'); owner.settled = true; }
    catch (error) {
      if (alreadySettled(error)) owner.settled = true;
      else if (cleanupFailure === undefined) cleanupFailure = error;
    }
  };
  const handler = (route: Route) => {
    const owner: typeof intercepted[number] = { route, settled: false };
    intercepted.push(owner);
    owner.work = (async () => {
      let finished: (() => void) | undefined;
      try {
        if (disposing) { await abort(owner); rejected(new Error('Owned response delay disposed before capture.')); return; }
        if (route.request().method() !== method || claimed) { await route.continue(); owner.settled = true; return; }
        claimed = true;
        // Removing this active handler would continue the paused original. Keep
        // it registered through fetch/fulfill; fetch is the one upstream send.
        const upstream = await fetchRouteWithClosingConnection(route, { timeout: 10_000 });
        expect(upstream.status(), await upstream.text()).toBe(200);
        const bytes = await upstream.body();
        const body = JSON.parse(bytes.toString('utf8')) as T;
        if (disposing || owner.settled) { await abort(owner); rejected(new Error('Owned response delay disposed during fetch.')); return; }
        let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
        const completed = new Promise<void>(resolve => { finished = resolve; });
        active = { body, requestWorkspaceId: route.request().headers()['x-workspace-id'], release, finished: completed };
        captured(active);
        await gate;
        if (disposing || owner.settled) { await abort(owner); return; }
        try { await route.fulfill({ response: upstream, body: bytes }); owner.settled = true; }
        catch (error) {
          if (!alreadySettled(error)) throw error;
          owner.settled = true;
        }
      } catch (error) {
        if (failure === undefined) failure = error; // Keep fetch/status/parse failure ahead of abort cleanup errors.
        rejected(error);
        await abort(owner);
      } finally { finished?.(); }
    })();
    return owner.work;
  };
  await page.route(pattern, handler);
  return { response, dispose: async () => {
    disposing = true;
    if (!active) rejected(new Error('Owned response delay disposed before capture.'));
    // Settle first: unroute on an unresolved active handler would send its
    // original request. An abort failure must not turn into a silent continue.
    for (const owner of intercepted) await abort(owner);
    active?.release();
    await Promise.all(intercepted.map(owner => owner.work));
    if (intercepted.some(owner => !owner.settled)) {
      if (cleanupFailure === undefined) cleanupFailure = new Error('Owned delayed route settlement is unconfirmed; handler remains registered for page teardown.');
    } else {
      try { await page.unroute(pattern, handler); }
      catch (error) { if (cleanupFailure === undefined) cleanupFailure = error; }
    }
    if (failure !== undefined) throw failure;
    if (cleanupFailure !== undefined) throw cleanupFailure;
  } };
}

async function settlePaint(page: Page) {
  // A finite paint barrier, following the existing XML spec; no measurement loop
  // or additional RAF/longtask producer is attached to the application.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('Performance opens read-only with default-off producers and one mounted polling subscription', async ({ page, request }, info) => {
  await withWorkspace(page, request, info, 'Performance Read Only', async fixture => {
    const initial = await readReport(request, fixture.headers);
    expect(initial.backend.enabled).toBe(false);
    expect(initial.control).toMatchObject({ collectionActive: false, profileActive: false, ownedTimerCount: 0, failedTimerCount: 0 });
    expect(initial.backend.resources).toHaveLength(0);
    await expect(page.getByRole('region', { name: 'Owned backend', exact: true })).toContainText('Collection off');
    await expect(page.getByRole('region', { name: 'This webview', exact: true })).toContainText('Collection off');
    await expect(page.getByRole('region', { name: 'This webview', exact: true })).toContainText('Unknown');
    await expect(page.getByRole('region', { name: 'Native performance coverage', exact: true })).toContainText('Native coverage unavailable');
    await expect(page.getByRole('region', { name: 'Validation cache counters', exact: true })).toContainText('not total heap use');
    await expect.poll(() => fixture.counts.reports, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(async () => (await performanceResources(page)).map(row => row.subscribers)).toEqual([1]);
    expect(fixture.counts.collections).toBe(0); expect(fixture.counts.profiles).toBe(0);
    fixture.evidence.push({ defaultOff: reportEvidence(initial), mountedResources: await performanceResources(page) });
    await renderedRuntime(page, fixture.evidence);
    await page.screenshot({ path: info.outputPath('performance-default-off.png'), fullPage: true });
    await page.getByTestId('diagnostics-scope-scripts').click();
    await expect(page.getByTestId('forge-performance-panel')).toHaveCount(0);
    await expect.poll(async () => (await performanceResources(page)).length).toBe(0);
    const readsAfterUnmount = fixture.counts.reports;
    await page.waitForTimeout(2250); // Observe one full two-second production polling interval.
    expect(fixture.counts.reports).toBe(readsAfterUnmount);
    expect(fixture.counts.collections).toBe(0); expect(fixture.counts.profiles).toBe(0);
    fixture.evidence.push({ unmountedResources: await performanceResources(page), noAutomaticPerformanceControlPost: true });
  });
});

test('Performance controls use real bounded collection and profiles with input, busy and cooldown refusals', async ({ page, request }, info) => {
  await withWorkspace(page, request, info, 'Performance Explicit Controls', async fixture => {
    const owned = { collection: false, profile: false };
    const collectionDurationMs = 10_000;
    const profileDurationMs = 5000;
    let delayedCollection: DelayedController<CollectionResponse> | undefined;
    let primaryFailed = false;
    try {
      await waitForProfileReady(request, fixture.headers);
      await page.getByRole('button', { name: 'Refresh performance report', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Sample backend functions', exact: true })).toBeEnabled();
      await page.getByLabel('Performance collection duration seconds', { exact: true }).fill('901');
      await page.getByRole('button', { name: 'Start bounded collection', exact: true }).click();
      await expect(page.getByTestId('forge-performance-panel').getByRole('alert')).toContainText('1–900 seconds');
      expect(fixture.counts.collections).toBe(0);
      await page.getByLabel('Performance collection duration seconds', { exact: true }).fill(String(collectionDurationMs / 1000));
      await page.getByLabel('Performance resource interval seconds', { exact: true }).fill('1');
      await page.getByLabel('Backend profile duration milliseconds', { exact: true }).fill('99');
      await page.getByRole('button', { name: 'Sample backend functions', exact: true }).click();
      await expect(page.getByTestId('forge-performance-panel').getByRole('alert')).toContainText('100–5000 ms');
      expect(fixture.counts.profiles).toBe(0);
      await page.getByLabel('Backend profile duration milliseconds', { exact: true }).fill(String(profileDurationMs));
      await page.getByLabel('Backend profile function limit', { exact: true }).fill('8');

      delayedCollection = await delayNextRealResponse<CollectionResponse>(page, collectionPath, 'POST');
      owned.collection = true;
      const collectionIssuedAt = performance.now();
      await page.getByRole('button', { name: 'Start bounded collection', exact: true }).click();
      const accepted = await delayedCollection.response;
      expect(accepted.body.ok).toBe(true); expect(accepted.body.control.collectionActive).toBe(true);
      expect(fixture.counts.collectionResponses, 'The paused original must have no response before confirmation is released.').toBe(0);
      // Probe while the real reservation is held, before UI/paint/screenshot work.
      requireReservationWindow(fixture, 'collection', collectionIssuedAt, collectionDurationMs, 'before busy probe');
      const busyCollection = await request.post(E2E_API_ORIGIN + collectionPath, { headers: fixture.headers,
        data: { durationMs: 1000, intervalMs: 1000, eventLoopDelay: false } });
      fixture.evidence.push({ collectionBusyProbe: { status: busyCollection.status(), ownerControl: accepted.body.control } });
      requireReservationWindow(fixture, 'collection', collectionIssuedAt, collectionDurationMs, 'after busy probe');
      expect(busyCollection.status()).toBe(409);
      expect(await busyCollection.json()).toMatchObject({ ok: false, code: 'PERFORMANCE_COLLECTION_BUSY' });
      // The backend has accepted the real request, but its response has not reached
      // the panel. Refresh also reads the current local collector, preventing a
      // cached inactive label from concealing an optimistic local start.
      const whileHeld = page.waitForResponse(response => new URL(response.url()).pathname === reportPath && response.request().method() === 'GET');
      void whileHeld.catch(() => undefined);
      await page.getByRole('button', { name: 'Refresh performance report', exact: true }).click();
      const heldReport = await (await whileHeld).json() as ForgePerformanceReport;
      requireReservationWindow(fixture, 'collection', collectionIssuedAt, collectionDurationMs, 'after refreshing held confirmation');
      expect(heldReport.control.collectionActive).toBe(true);
      await settlePaint(page);
      await expect(page.getByTestId('forge-performance-panel')).toContainText('Webview collection: inactive');
      const collectionResponsesWhileHeld = fixture.counts.collectionResponses;
      expect(collectionResponsesWhileHeld).toBe(0);
      requireReservationWindow(fixture, 'collection', collectionIssuedAt, collectionDurationMs, 'before releasing backend confirmation');
      accepted.release(); await accepted.finished;
      await expect.poll(() => fixture.counts.collectionResponses).toBe(1);
      await expect(page.getByTestId('forge-performance-panel').getByText('Started bounded collection for the backend and this webview.', { exact: false })).toBeVisible();
      await expect(page.getByRole('region', { name: 'This webview', exact: true })).toContainText('Collecting');
      await page.getByRole('button', { name: 'Stop webview collection only', exact: true }).click();
      await expect(page.getByTestId('forge-performance-panel')).toContainText('Webview collection: inactive · owned timers 0; failed timer cleanup 0.');
      const afterLocalStop = await readReport(request, fixture.headers);
      requireReservationWindow(fixture, 'collection', collectionIssuedAt, collectionDurationMs, 'after local-only stop');
      expect(afterLocalStop.control.collectionActive).toBe(true);
      await renderedRuntime(page, fixture.evidence);
      await page.screenshot({ path: info.outputPath('performance-collection.png'), fullPage: true });
      await cleanupOwnedWork(page, request, fixture, owned);

      await waitForProfileReady(request, fixture.headers);
      const profileResponse = page.waitForResponse(response => new URL(response.url()).pathname === profilePath && response.request().method() === 'POST');
      void profileResponse.catch(() => undefined); // Test failure must not leave an unhandled waiter rejection.
      owned.profile = true;
      const profileIssuedAt = performance.now();
      await page.getByRole('button', { name: 'Sample backend functions', exact: true }).click();
      await expect.poll(async () => (await readReport(request, fixture.headers)).control.profileActive,
        { timeout: 2000, intervals: [25, 50, 100] }).toBe(true);
      requireReservationWindow(fixture, 'profile', profileIssuedAt, profileDurationMs, 'before busy probe');
      const busyProfile = await request.post(E2E_API_ORIGIN + profilePath, { headers: fixture.headers,
        data: { durationMs: 100, samplingIntervalMicros: 1000, maxFunctions: 8 } });
      fixture.evidence.push({ profileBusyProbe: { status: busyProfile.status() } });
      requireReservationWindow(fixture, 'profile', profileIssuedAt, profileDurationMs, 'after busy probe');
      expect(busyProfile.status()).toBe(409);
      expect(await busyProfile.json()).toMatchObject({ ok: false, code: 'PROFILE_BUSY' });
      const response = await profileResponse;
      expect(response.status(), await response.text()).toBe(200);
      const profile = await response.json() as ForgeCpuProfileReport;
      expect(profile).toMatchObject({ ok: true, schemaVersion: 'forge.cpu-profile.v1', requestedDurationMs: profileDurationMs,
        coverage: { process: 'current-backend-only', attribution: 'sampled-self-time-not-exact-operation-cpu' } });
      expect(profile.functions.length).toBeLessThanOrEqual(8);
      expect(profile.functions.every(row => !/^(?:[A-Za-z]:[\\/]|[\\/])|:\/\/|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(row.module))).toBe(true);
      await expect(page.getByTestId('forge-performance-profile')).toContainText('Sampled self-time is an estimate');
      await expect(page.getByTestId('forge-performance-profile').locator('a')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Sample backend functions', exact: true })).toBeDisabled();
      const cooldown = await request.post(E2E_API_ORIGIN + profilePath, { headers: fixture.headers,
        data: { durationMs: 100, samplingIntervalMicros: 1000, maxFunctions: 8 } });
      expect(cooldown.status()).toBe(429);
      expect(await cooldown.json()).toMatchObject({ ok: false, code: 'PROFILE_RATE_LIMITED' });
      expect(fixture.counts.collections).toBe(1); expect(fixture.counts.profiles).toBe(1); expect(fixture.counts.collectionResponses).toBe(1);
      fixture.evidence.push({ collectionAccepted: { backend: accepted.body.backend.producer, control: accepted.body.control },
        collectionBrowserBoundary: { responsesWhileHeld: collectionResponsesWhileHeld, responsesAfterRelease: fixture.counts.collectionResponses },
        busyCollectionStatus: busyCollection.status(), busyProfileStatus: busyProfile.status(), cooldownStatus: cooldown.status(), profile });
      await page.screenshot({ path: info.outputPath('performance-profile.png'), fullPage: true });
    } catch (error) {
      primaryFailed = true; throw error;
    } finally {
      await cleanupPreservingPrimary(primaryFailed, fixture.evidence, [
        async () => { await delayedCollection?.dispose(); },
        async () => { if (!page.isClosed()) await settlePaint(page); },
        async () => { await cleanupOwnedWork(page, request, fixture, owned); },
      ]);
    }
  });
});

test('real delayed performance status and an active profile cannot cross immutable workspace authority', async ({ page, request }, info) => {
  await withWorkspace(page, request, info, 'Performance Authority A', async fixture => {
    const owned = { collection: false, profile: false };
    const profileDurationMs = 5000;
    let delayed: DelayedController<ForgePerformanceReport> | undefined;
    let primaryFailed = false;
    try {
      await waitForProfileReady(request, fixture.headers);
      await page.getByRole('button', { name: 'Refresh performance report', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Sample backend functions', exact: true })).toBeEnabled();
      const before = await page.evaluate(() => ({ id: (window as StudioWindow).__X4_WORKSPACE_CONTEXT__!.getWorkspaceId(),
        revision: (window as StudioWindow).__X4_WORKSPACE_CONTEXT__!.getSelectionRevision() }));
      const beforeCapture = await readReport(request, fixture.headers);
      expect(beforeCapture.control.profileActive).toBe(false);
      fixture.evidence.push({ beforeCancellationCapture: reportEvidence(beforeCapture) });
      await page.getByLabel('Backend profile duration milliseconds', { exact: true }).fill(String(profileDurationMs));
      await page.getByLabel('Backend profile function limit', { exact: true }).fill('8');
      const profileRequest = page.waitForRequest(event => new URL(event.url()).pathname === profilePath && event.method() === 'POST');
      void profileRequest.catch(() => undefined);
      owned.profile = true;
      const profileIssuedAt = performance.now();
      await page.getByRole('button', { name: 'Sample backend functions', exact: true }).click();
      const pendingProfile = await profileRequest;
      await expect.poll(async () => (await readReport(request, fixture.headers)).control.profileActive,
        { timeout: 2000, intervals: [25, 50, 100] }).toBe(true);
      delayed = await delayNextRealResponse<ForgePerformanceReport>(page, reportPath, 'GET');
      await page.getByRole('button', { name: 'Refresh performance report', exact: true }).click();
      const old = await delayed.response;
      expect(old.body.control.profileActive).toBe(true);
      expect(old.body.control.profileCapturesStarted).toBe(beforeCapture.control.profileCapturesStarted + 1);
      expect(old.body.control.profileCapturesSucceeded).toBe(beforeCapture.control.profileCapturesSucceeded);
      expect(old.body.control.profileCapturesFailed).toBe(beforeCapture.control.profileCapturesFailed);
      expect(old.requestWorkspaceId).toBe(before.id);
      const oldResources = await performanceResources(page);
      const switchedReport = page.waitForResponse(response => new URL(response.url()).pathname === reportPath
        && response.request().method() === 'GET' && response.request().headers()['x-workspace-id'] !== before.id);
      void switchedReport.catch(() => undefined);
      requireReservationWindow(fixture, 'profile cancellation', profileIssuedAt, profileDurationMs, 'before workspace switch');
      await page.getByTestId('workspace-switcher').selectOption('__new');
      await page.getByTestId('dialog-input').fill('Performance Authority B');
      await page.getByTestId('dialog-ok').click();
      await expect(page.getByTestId('toast')).toContainText('Created independent workspace');
      const after = await page.evaluate(() => ({ id: (window as StudioWindow).__X4_WORKSPACE_CONTEXT__!.getWorkspaceId(),
        revision: (window as StudioWindow).__X4_WORKSPACE_CONTEXT__!.getSelectionRevision(),
        workspace: (window as StudioWindow).__X4_E2E__!.getWorkspace() }));
      expect(after.id).not.toBe(before.id); expect(after.revision).toBeGreaterThan(before.revision);
      requireReservationWindow(fixture, 'profile cancellation', profileIssuedAt, profileDurationMs, 'after workspace authority changed');
      const currentResponse = await switchedReport;
      expect(currentResponse.status()).toBe(200);
      expect(currentResponse.request().headers()['x-workspace-id']).toBe(after.id);
      // Observe SUT cancellation before the finally fallback is allowed to press
      // Cancel. Natural completion must still fail the counters below.
      await expect.poll(async () => {
        const value = await readReport(request, fixture.headers);
        return !value.control.collectionActive && !value.control.profileActive
          && !value.control.collectionCleanupUnconfirmed && !value.control.profileCleanupUnconfirmed
          && !value.control.abortListenerCleanupUnconfirmed && value.control.ownedTimerCount === 0
          && value.control.failedTimerCount === 0 && !value.control.eventLoopDelayMonitoring;
      }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);
      const afterCancellation = await readReport(request, fixture.headers);
      fixture.evidence.push({ cancellationCounters: {
        before: { started: beforeCapture.control.profileCapturesStarted, failed: beforeCapture.control.profileCapturesFailed, succeeded: beforeCapture.control.profileCapturesSucceeded },
        after: { started: afterCancellation.control.profileCapturesStarted, failed: afterCancellation.control.profileCapturesFailed, succeeded: afterCancellation.control.profileCapturesSucceeded },
        control: afterCancellation.control,
      } });
      expect(afterCancellation.control.profileCapturesStarted).toBe(beforeCapture.control.profileCapturesStarted + 1);
      expect(afterCancellation.control.profileCapturesFailed).toBe(beforeCapture.control.profileCapturesFailed + 1);
      expect(afterCancellation.control.profileCapturesSucceeded).toBe(beforeCapture.control.profileCapturesSucceeded);
      await expect.poll(() => pendingProfile.failure()?.errorText || '', { timeout: 10_000 }).toBe('net::ERR_ABORTED');
      fixture.evidence.push({ sutCancellationWitness: { observedBeforeFallbackCleanup: true,
        started: afterCancellation.control.profileCapturesStarted, failed: afterCancellation.control.profileCapturesFailed,
        succeeded: afterCancellation.control.profileCapturesSucceeded, browserFailure: pendingProfile.failure()?.errorText } });
      // The process is shared across these workspaces. The delayed real report has
      // a distinguishable old active-profile state, not invented workspace metrics.
      const inactiveResponse = page.waitForResponse(response => new URL(response.url()).pathname === reportPath
        && response.request().method() === 'GET' && response.request().headers()['x-workspace-id'] === after.id);
      void inactiveResponse.catch(() => undefined);
      await page.getByRole('button', { name: 'Refresh performance report', exact: true }).click();
      const inactive = await inactiveResponse;
      expect(inactive.status()).toBe(200);
      expect((await inactive.json() as ForgePerformanceReport).control.profileActive).toBe(false);
      await settlePaint(page);
      await expect(page.getByText('A backend capture is already active.', { exact: true })).toHaveCount(0);
      old.release(); await old.finished;
      await settlePaint(page);
      await expect(page.getByTestId('forge-performance-profile')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).toHaveCount(0);
      await expect(page.getByText('A backend capture is already active.', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Backend function samples received.', { exact: false })).toHaveCount(0);
      await expect.poll(async () => (await performanceResources(page)).map(row => row.subscribers)).toEqual([1]);
      const currentResources = await performanceResources(page);
      expect(currentResources.every(row => oldResources.every(oldRow => oldRow.resourceKey !== row.resourceKey))).toBe(true);
      const finalWorkspace = await page.evaluate(() => (window as StudioWindow).__X4_E2E__!.getWorkspace());
      expect(workspaceSnapshotHash(finalWorkspace)).toBe(workspaceSnapshotHash(after.workspace));
      expect(finalWorkspace.name).toBe('Performance Authority B');
      const finalReport = await readReport(request, fixture.headers);
      expect(finalReport.backend.producer).toEqual(old.body.backend.producer);
      fixture.evidence.push({ authorityChange: { before, after: { id: after.id, revision: after.revision,
        snapshotHash: workspaceSnapshotHash(after.workspace) }, delayed: reportEvidence(old.body), current: reportEvidence(finalReport),
        oldResources, currentResources, browserProfileAborted: true, producerReplacement: 'not-tested-same-owned-process' } });
      await renderedRuntime(page, fixture.evidence);
      await page.screenshot({ path: info.outputPath('performance-authority.png'), fullPage: true });
    } catch (error) {
      primaryFailed = true; throw error;
    } finally {
      await cleanupPreservingPrimary(primaryFailed, fixture.evidence, [
        async () => { await delayed?.dispose(); },
        async () => { await cleanupOwnedWork(page, request, fixture, owned); },
      ]);
    }
  });
});
