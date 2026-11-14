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
// BEGIN BATCH3 mounted native imports
import type { ForgeNativePerformanceOperation, ForgeNativePerformanceReport } from '../../src/server/forgePerformance';
import { createForgePerformanceCollector } from '../../shared/forgePerformance';
import { isNativePerformanceSnapshot, isNativePerformanceStatus } from '../../shared/nativePerformanceProtocol';
// END BATCH3 mounted native imports

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

async function withWorkspace(page: Page, request: APIRequestContext, info: TestInfo, name: string, run: (fixture: Fixture) => Promise<void>,
  beforeBoot?: (fixture: Fixture) => Promise<void | (() => Promise<void>)>) {
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
  // BEGIN BATCH3 mounted native before-boot owner
  let beforeBootCleanup: void | (() => Promise<void>) = undefined;
  // END BATCH3 mounted native before-boot owner
  try {
    // BEGIN BATCH3 mounted native before-boot setup
    beforeBootCleanup = await beforeBoot?.({ headers, evidence, counts });
    // END BATCH3 mounted native before-boot setup
    await boot(page, before.workspace);
    await run({ headers, evidence, counts });
  } catch (error) {
    primaryFailed = true; throw error;
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
    await cleanupPreservingPrimary(primaryFailed, evidence, [
    // BEGIN BATCH3 mounted native before-boot cleanup
    ...(beforeBootCleanup ? [beforeBootCleanup] : []),
    // END BATCH3 mounted native before-boot cleanup
    async () => {
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
// BEGIN BATCH3 mounted native fixture owners
const nativeReadPath = `${reportPath}/native`;
const nativeStartPath = `${nativeReadPath}/collection`;
const nativeStopPath = `${nativeReadPath}/stop`;
const nativePaths = [nativeReadPath, nativeStartPath, nativeStopPath] as const;
type NativeReply = { body: unknown; status: number };
type NativeReceipt = { operation: ForgeNativePerformanceOperation; sequence: number; workspaceId: string | undefined; body: unknown; request: Request };
interface NativeReplyPlan {
  reply: NativeReply; receipt?: NativeReceipt; completed: boolean; release(): void; finished: Promise<void>; finish(): void;
}
interface NativeUiFixture {
  backendInstanceId: string;
  receipts: NativeReceipt[];
  heldReads: NativeReplyPlan[];
  setRead(body: unknown, status?: number): void;
  freezeReads(): void;
  queue(operation: ForgeNativePerformanceOperation, body: unknown, status?: number): NativeReplyPlan;
  ownCleanup(cleanup: () => Promise<void>): void;
  dispose(): Promise<void>;
}
type NativeFixture = Fixture & { native: NativeUiFixture };
const nativeClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function nativeFixtureRead(backendInstanceId: string, options: {
  instanceId?: string; captureId?: string | null; active?: boolean; ownership?: ForgeNativePerformanceReport['ownership']; rssBytes?: number | null;
} = {}): ForgeNativePerformanceReport {
  const instanceId = options.instanceId ?? 'native_browser_instance_A', active = options.active ?? false;
  const captureId = options.captureId ?? (active ? 'native_browser_capture_A' : null);
  const collector = createForgePerformanceCollector({ component: 'extension-host', scope: 'shared-process', pid: 4242,
    instanceId, enabled: true, now: () => 0, wallNow: () => 1000 });
  let snapshot: ForgePerformanceReport['backend'];
  try {
    collector.recordResource({ rssBytes: options.rssBytes === undefined ? 0 : options.rssBytes, cpuOneCorePercent: 0, cpuHostPercent: null });
    snapshot = nativeClone(collector.snapshot()); snapshot.enabled = active;
  } finally { collector.dispose(); }
  const native: NonNullable<NonNullable<ForgeNativePerformanceReport['status']>['native']> = {
    schemaVersion: 'forge.native-performance.status.v1', producer: { component: 'extension-host', scope: 'shared-process', pid: 4242, instanceId },
    disposed: false, collectionActive: active, captureId, collectionStartedAtUnixMs: captureId ? 1000 : null,
    collectionExpiresAtUnixMs: active ? 61_000 : null, intervalMs: 2000, eventLoopDelayMonitoring: false,
    resourceSamples: 1, resourceErrors: 0, throttledSamples: 0, counterResets: 0, sampleOverheadMs: 0,
    lastResourceError: null, collectionStopDelayMs: active ? null : 0, collectionCleanupUnconfirmed: false,
    ownedTimerCount: active ? 2 : 0, failedTimerCount: 0, lastStopReason: active || !captureId ? null : 'requested',
  };
  expect(isNativePerformanceSnapshot(snapshot), 'injected native browser snapshot satisfies actual shared protocol').toBe(true);
  expect(isNativePerformanceStatus(native), 'injected native browser status satisfies actual shared protocol').toBe(true);
  return { schemaVersion: 'forge.native-performance.report.v1', operation: 'read', ok: true, availability: 'ready', unavailableReason: null,
    ownership: options.ownership ?? (captureId ? 'operator' : 'none'), status: { schemaVersion: 'forge.native-performance.broker.v1', backendInstanceId,
      availability: 'ready', unavailableReason: null, native, pending: null, cancellation: 'none', cleanupUnconfirmed: false,
      orphaned: false, captureOwned: active, readSubscribers: 0, snapshot, snapshotAgeMs: 25, lastRefreshOutcome: 'ok',
      rejectedMessages: 0, lateResults: 0, droppedSnapshots: 0, timerCleanupUnconfirmed: false } };
}
function nativeFixtureAck(read: ForgeNativePerformanceReport, operation: 'start' | 'stop'): ForgeNativePerformanceReport {
  const result = nativeClone(read); result.operation = operation;
  result.status = { ...result.status!, snapshot: null, snapshotAgeMs: null }; return result;
}
function nativeFixtureBusy(read: ForgeNativePerformanceReport, operation: 'start' | 'stop'): ForgeNativePerformanceReport {
  const result = nativeClone(read); result.ok = false; result.code = 'NATIVE_PERFORMANCE_BUSY'; result.status = { ...result.status!, pending: operation }; return result;
}
function nativeAbsent(): ForgeNativePerformanceReport {
  return { schemaVersion: 'forge.native-performance.report.v1', operation: 'read', ok: true, availability: 'unavailable',
    unavailableReason: 'transport-absent', ownership: 'none', status: null };
}
async function nativeResources(page: Page): Promise<PollResource[]> {
  return page.evaluate(() => (window as StudioWindow).__X4_CONTINUOUS_POLLING__!.snapshot().resources
    .filter(resource => resource.resourceKey.startsWith('forge-native-performance:')));
}
async function nativePlanReceived(plan: NativeReplyPlan): Promise<NativeReceipt> {
  await expect.poll(() => !!plan.receipt, { timeout: 10_000 }).toBe(true); return plan.receipt!;
}
async function installNativeUiFixture(page: Page, backendInstanceId: string, evidence: unknown[]): Promise<NativeUiFixture> {
  let read: NativeReply = { body: nativeFixtureRead(backendInstanceId), status: 200 }, freezeReads = false, disposing = false;
  const receipts: NativeReceipt[] = [], heldReads: NativeReplyPlan[] = [], errors: unknown[] = [];
  const additionalCleanup: Array<() => Promise<void>> = [];
  const queue = new Map<ForgeNativePerformanceOperation, NativeReplyPlan[]>();
  const plans: NativeReplyPlan[] = [], owners: Array<{ route: Route; settled: boolean; work?: Promise<void> }> = [];
  const alreadySettled = (error: unknown) => /already handled|aborted|Target.*closed|Request.*intercept|Invalid InterceptionId/i.test(String(error));
  const plan = (reply: NativeReply) => {
    let release!: () => void, finish!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const item: NativeReplyPlan = { reply: nativeClone(reply), completed: false, release,
      finished: new Promise<void>(resolve => { finish = resolve; }), finish: () => { item.completed = true; finish(); } };
    plans.push(item); return { item, gate };
  };
  const gates = new Map<NativeReplyPlan, Promise<void>>();
  const enqueue = (operation: ForgeNativePerformanceOperation, body: unknown, status = 200) => {
    const created = plan({ body, status }); gates.set(created.item, created.gate);
    const pending = queue.get(operation) ?? []; pending.push(created.item); queue.set(operation, pending); return created.item;
  };
  const abort = async (owner: typeof owners[number]) => {
    if (owner.settled) return;
    try { await owner.route.abort('failed'); owner.settled = true; }
    catch (error) { if (alreadySettled(error)) owner.settled = true; else errors.push(error); }
  };
  const handler = (route: Route) => {
    const owner: typeof owners[number] = { route, settled: false }; owners.push(owner);
    owner.work = (async () => {
      let selected: NativeReplyPlan | undefined;
      try {
        if (disposing) { await abort(owner); return; }
        const request = route.request(), pathname = new URL(request.url()).pathname;
        const operation: ForgeNativePerformanceOperation = pathname === nativeReadPath ? 'read' : pathname === nativeStartPath ? 'start' : 'stop';
        expect(request.method()).toBe(operation === 'read' ? 'GET' : 'POST');
        const receipt: NativeReceipt = { operation, sequence: receipts.length + 1, workspaceId: request.headers()['x-workspace-id'],
          body: operation === 'read' ? null : request.postDataJSON(), request };
        receipts.push(receipt);
        selected = queue.get(operation)?.shift();
        if (!selected && operation === 'read' && freezeReads) {
          const created = plan(read); selected = created.item; gates.set(selected, created.gate); heldReads.push(selected);
        }
        if (!selected && operation !== 'read') throw new Error(`Unexpected injected native ${operation}; no explicit fixture response was queued.`);
        if (operation !== 'read') {
          // Default browser-fixture reads reflect the admitted control. Explicitly
          // queued pre-control reads below can still model network overtaking it.
          read = { body: nativeFixtureBusy(read.body as ForgeNativePerformanceReport, operation), status: 409 };
        }
        if (selected) { selected.receipt = receipt; await gates.get(selected); }
        if (disposing || owner.settled) { await abort(owner); return; }
        const reply = selected?.reply ?? read;
        try { await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) }); owner.settled = true; }
        catch (error) { if (!alreadySettled(error)) throw error; owner.settled = true; }
      } catch (error) { errors.push(error); await abort(owner); }
      finally { selected?.finish(); }
    })();
    return owner.work;
  };
  for (const pathname of nativePaths) await page.route(`**${pathname}`, handler);
  return { backendInstanceId, receipts, heldReads, setRead: (body, status = 200) => { read = { body: nativeClone(body), status }; },
    freezeReads: () => { freezeReads = true; }, queue: enqueue, ownCleanup: cleanup => { additionalCleanup.push(cleanup); },
    dispose: async () => {
      disposing = true;
      for (const owner of owners) await abort(owner);
      for (const item of plans) item.release();
      await Promise.all(owners.map(owner => owner.work));
      for (const item of plans) item.finish();
      if (owners.some(owner => !owner.settled)) throw new Error('Injected native route ownership did not settle; handlers remain for page teardown.');
      for (const pathname of nativePaths) await page.unroute(`**${pathname}`, handler);
      for (const cleanup of additionalCleanup) { try { await cleanup(); } catch (error) { errors.push(error); } }
      evidence.push({ nativeMountedFixture: { scope: 'injected public DTOs; not native IPC, installed sampling or game proof',
        receipts: receipts.map(({ operation, sequence, workspaceId, body }) => ({ operation, sequence, workspaceId, body })),
        lateFinallyLimit: 'Page.route delays before headers; late response/abort fencing does not force a delayed body-phase Promise.finally after a replacement request.',
        cleanupErrors: errors.map(error => String(error).slice(0, 2000)), noAdditionalServerOrRuntime: true } });
      if (errors.length) throw errors[0];
    } };
}
async function withNativeWorkspace(page: Page, request: APIRequestContext, info: TestInfo, name: string,
  run: (fixture: NativeFixture) => Promise<void>, configure?: (native: NativeUiFixture) => void) {
  let native: NativeUiFixture;
  await withWorkspace(page, request, info, name, async fixture => {
    await expect(page.getByTestId('forge-native-performance-status')).toBeVisible(); await settlePaint(page);
    await run({ ...fixture, native });
    expect(fixture.counts.collections, 'native mounted controls must not fall back to backend collection').toBe(0);
    expect(fixture.counts.profiles, 'native mounted controls must not start backend profiling').toBe(0);
    await renderedRuntime(page, fixture.evidence);
    await page.screenshot({ path: info.outputPath('native-performance.png'), fullPage: true });
  }, async fixture => {
    const backend = await readReport(request, fixture.headers);
    expect(typeof backend.backend.producer.instanceId).toBe('string');
    native = await installNativeUiFixture(page, backend.backend.producer.instanceId!, fixture.evidence);
    try { configure?.(native); }
    catch (error) { await cleanupPreservingPrimary(true, fixture.evidence, [() => native.dispose()]); throw error; }
    return async () => {
      await cleanupPreservingPrimary(false, fixture.evidence, [async () => {
        if (!page.isClosed() && await page.getByTestId('forge-performance-panel').isVisible()) await page.getByTestId('diagnostics-scope-scripts').click();
      }, () => native.dispose()]);
    };
  });
}
// END BATCH3 mounted native fixture owners

// BEGIN BATCH3 mounted native behavior cases
async function releaseNativeRead(native: NativeUiFixture, matches: (body: ForgeNativePerformanceReport) => boolean, issuedAfter = -Infinity) {
  let selected: NativeReplyPlan | undefined;
  await expect.poll(() => {
    selected = [...native.heldReads].reverse().find(plan => !!plan.receipt && !plan.completed && !plan.receipt.request.failure()
      && plan.receipt.request.timing().startTime >= issuedAfter
      && matches(plan.reply.body as ForgeNativePerformanceReport));
    return !!selected;
  }, { timeout: 10_000 }).toBe(true);
  selected!.release(); await selected!.finished; return selected!;
}

test('Native performance opens read-only and separates exact control ACKs from fresh resource reads', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Controls', async fixture => {
    const panel = page.getByTestId('forge-native-performance'), native = fixture.native;
    await expect(panel).toContainText('shared process'); await expect(panel).toContainText('other extensions');
    await expect(panel.getByRole('region', { name: 'Shared native extension host', exact: true })).toContainText('0 MiB');
    await expect(panel).toContainText('Unknown');
    await expect.poll(async () => (await nativeResources(page)).map(row => row.subscribers)).toEqual([1]);
    expect(native.receipts.filter(row => row.operation !== 'read')).toHaveLength(0);
    await page.getByLabel('Native performance collection duration seconds', { exact: true }).fill('5');
    await page.getByLabel('Native performance resource interval seconds', { exact: true }).fill('1');
    const active = nativeFixtureRead(native.backendInstanceId, { active: true });
    const start = native.queue('start', nativeFixtureAck(active, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click();
    const started = await nativePlanReceived(start);
    expect(started.body).toEqual({ expectedBackendInstanceId: native.backendInstanceId, expectedNativeInstanceId: 'native_browser_instance_A',
      durationMs: 5000, intervalMs: 1000, eventLoopDelay: false });
    await expect(panel).toContainText('Starting native collection'); await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeDisabled();
    native.freezeReads(); native.setRead(active); start.release(); await start.finished;
    await expect(panel).toContainText('Control acknowledgement only');
    await expect(panel.getByRole('region', { name: 'Shared native extension host', exact: true })).toHaveCount(0);
    await releaseNativeRead(native, value => value.status?.native?.collectionActive === true);
    await expect(panel.getByRole('region', { name: 'Shared native extension host', exact: true })).toBeVisible();
    await expect(panel).toContainText('native_browser_capture_A');
    const stopped = nativeFixtureRead(native.backendInstanceId, { captureId: 'native_browser_capture_A', active: false });
    const stop = native.queue('stop', nativeFixtureAck(stopped, 'stop'));
    await panel.getByRole('button', { name: 'Stop this native capture', exact: true }).click();
    const target = await nativePlanReceived(stop);
    expect(target.body).toEqual({ expectedBackendInstanceId: native.backendInstanceId, expectedNativeInstanceId: 'native_browser_instance_A', captureId: 'native_browser_capture_A' });
    await expect(panel).toContainText('Stopping native collection');
    native.setRead(stopped); stop.release(); await stop.finished;
    await expect(panel).toContainText('Native cleanup for capture native_browser_capture_A was acknowledged');
    await releaseNativeRead(native, value => value.status?.native?.collectionActive === false && value.status.native.captureId === 'native_browser_capture_A');
    await expect(panel).toContainText('Native collection: inactive');
    fixture.evidence.push({ nativeControls: { start: started.body, stop: target.body,
      startAckSnapshot: (start.reply.body as ForgeNativePerformanceReport).status!.snapshot,
      stopAckSnapshot: (stop.reply.body as ForgeNativePerformanceReport).status!.snapshot, nativeResourceProof: 'injected browser DTO only' } });
    const posts = native.receipts.filter(row => row.operation !== 'read').length;
    await page.getByTestId('diagnostics-scope-scripts').click();
    await expect.poll(async () => (await nativeResources(page)).length).toBe(0);
    await page.waitForTimeout(2250);
    expect(native.receipts.filter(row => row.operation !== 'read')).toHaveLength(posts);
    await page.getByTestId('diagnostics-scope-performance').click();
    await releaseNativeRead(native, value => value.status?.native?.collectionActive === false);
    await expect(page.getByTestId('forge-native-performance')).toContainText('Native collection: inactive');
  });
});

test('Native performance renders unavailable shared ownership cleanup and denied malformed packets honestly', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Packet Guard', async fixture => {
    const native = fixture.native, panel = page.getByTestId('forge-native-performance');
    await expect(panel).toContainText('Native coverage unavailable'); await expect(panel).toContainText('Unknown');
    await expect(panel).not.toContainText('0 MiB');
    await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeDisabled();
    const other = nativeFixtureRead(native.backendInstanceId, { active: true, ownership: 'other' });
    native.setRead(other); await panel.getByRole('button', { name: 'Refresh native performance report', exact: true }).click();
    await expect(panel).toContainText('Another owner'); await expect(panel.getByRole('button', { name: 'Stop this native capture', exact: true })).toHaveCount(0);
    const unknown = nativeClone(other); unknown.ownership = 'none'; unknown.availability = 'retired'; unknown.unavailableReason = 'retired';
    Object.assign(unknown.status!, { availability: 'retired', unavailableReason: 'retired', cancellation: 'unknown', cleanupUnconfirmed: true, captureOwned: false, lastRefreshOutcome: 'retired' });
    native.setRead(unknown); await panel.getByRole('button', { name: 'Refresh native performance report', exact: true }).click();
    await expect(panel).toContainText('Native collection: active'); await expect(panel).toContainText('Cleanup is unconfirmed');
    await expect(panel).toContainText('cancellation outcome is unknown'); await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeDisabled();
    for (const code of ['NATIVE_PERFORMANCE_AUTHORITY_REVOKED', 'NATIVE_PERFORMANCE_NOT_OWNER'] as const) {
      const denied: ForgeNativePerformanceReport = { ...nativeAbsent(), ok: false, code, unavailableReason: 'authority-revoked' };
      native.setRead(denied, 403); await panel.getByRole('button', { name: 'Refresh native performance report', exact: true }).click();
      await expect(panel).toContainText('Native metrics: Unknown'); await expect(panel.getByRole('region', { name: 'Shared native extension host', exact: true })).toHaveCount(0);
      await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeDisabled();
      const leaked = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: `denied_packet_${code}` }); leaked.ok = false; leaked.code = code;
      native.setRead(leaked, 403); await panel.getByRole('button', { name: 'Refresh native performance report', exact: true }).click();
      await expect(panel).toContainText('unsupported report'); await expect(panel).not.toContainText(`denied_packet_${code}`);
    }
    const malformed = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'malformed_must_not_render' });
    Object.assign(malformed.status!.native!.producer, { component: 'backend', scope: 'owned-process' });
    native.setRead(malformed); await panel.getByRole('button', { name: 'Refresh native performance report', exact: true }).click();
    await expect(panel).toContainText('unsupported report'); await expect(panel).not.toContainText('malformed_must_not_render');
    await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeDisabled();
    expect(native.receipts.filter(row => row.operation !== 'read')).toHaveLength(0);
  }, native => native.setRead(nativeAbsent()));
});

test('Native refresh and producer replacement fence a held old read without automatic controls', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Old Read', async fixture => {
    const native = fixture.native, panel = page.getByTestId('forge-native-performance');
    const oldResources = await nativeResources(page);
    const old = native.queue('read', nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'old_read_capture_must_not_render', rssBytes: 1024 * 1024 }));
    await panel.getByRole('button', { name: 'Refresh native performance report', exact: true }).click();
    const stale = await nativePlanReceived(old);
    native.setRead(nativeFixtureRead(native.backendInstanceId, { instanceId: 'native_browser_instance_B', active: true, captureId: 'current_read_capture_B', rssBytes: 2 * 1024 * 1024 }));
    await panel.getByRole('button', { name: 'Refresh native performance report', exact: true }).click();
    await expect(panel).toContainText('current_read_capture_B'); await expect(panel).toContainText('2 MiB');
    await expect.poll(() => stale.request.failure()?.errorText ?? '').toBe('net::ERR_ABORTED');
    old.release(); await old.finished; await settlePaint(page);
    await expect(panel).not.toContainText('old_read_capture_must_not_render'); await expect(panel).toContainText('current_read_capture_B');
    const currentResources = await nativeResources(page);
    expect(currentResources.every(row => oldResources.every(before => before.resourceKey !== row.resourceKey))).toBe(true);
    expect(native.receipts.filter(row => row.operation !== 'read')).toHaveLength(0);
    fixture.evidence.push({ nativeOldRead: { browserAbort: stale.request.failure()?.errorText, oldResources, currentResources, noControlPosts: true } });
  });
});

test('A late native start ACK cannot overwrite a newer capture or retarget its explicit stop', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Capture Replacement', async fixture => {
    const native = fixture.native, panel = page.getByTestId('forge-native-performance');
    const oldCapture = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'old_start_capture_A' });
    const old = native.queue('start', nativeFixtureAck(oldCapture, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); await nativePlanReceived(old);
    const replacement = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'replacement_capture_B', rssBytes: 3 * 1024 * 1024 });
    native.setRead(replacement);
    await expect(panel).toContainText('replacement_capture_B'); await expect(panel).toContainText('Starting native collection');
    old.release(); await old.finished;
    await expect(panel).toContainText('capture changed while the acknowledgement was pending');
    await expect(panel).toContainText('replacement_capture_B'); await expect(panel).not.toContainText('old_start_capture_A');
    await expect(panel.getByRole('button', { name: 'Cancel native request', exact: true })).toHaveCount(0);
    const stopped = nativeFixtureRead(native.backendInstanceId, { captureId: 'replacement_capture_B', active: false });
    const stop = native.queue('stop', nativeFixtureAck(stopped, 'stop'));
    await panel.getByRole('button', { name: 'Stop this native capture', exact: true }).click();
    expect((await nativePlanReceived(stop)).body).toEqual({ expectedBackendInstanceId: native.backendInstanceId,
      expectedNativeInstanceId: 'native_browser_instance_A', captureId: 'replacement_capture_B' });
    native.freezeReads(); native.setRead(stopped); stop.release(); await stop.finished;
    await expect(panel).toContainText('Native cleanup for capture replacement_capture_B was acknowledged');
    expect(native.receipts.filter(row => row.operation === 'stop')).toHaveLength(1);
  });
});

test('Native producer replacement fences an old pending control before a new request owns the panel', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Producer Replacement', async fixture => {
    const native = fixture.native, panel = page.getByTestId('forge-native-performance');
    const activeA = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'replaced_native_capture_A' });
    const old = native.queue('start', nativeFixtureAck(activeA, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const before = await nativePlanReceived(old);
    const idleB = nativeFixtureRead(native.backendInstanceId, { instanceId: 'native_browser_instance_B' });
    native.setRead(idleB); await expect(panel).toContainText('native_browser_instance_B');
    await expect.poll(() => before.request.failure()?.errorText ?? '').toBe('net::ERR_ABORTED');
    await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeEnabled();
    const activeB = nativeFixtureRead(native.backendInstanceId, { instanceId: 'native_browser_instance_B', active: true, captureId: 'new_native_capture_B' });
    const current = native.queue('start', nativeFixtureAck(activeB, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const after = await nativePlanReceived(current);
    old.release(); await old.finished; await settlePaint(page);
    await expect(panel).toContainText('Starting native collection'); await expect(panel.getByRole('button', { name: 'Cancel native request', exact: true })).toBeVisible();
    await expect(panel).not.toContainText('replaced_native_capture_A');
    expect(after.body).toMatchObject({ expectedNativeInstanceId: 'native_browser_instance_B' });
    native.freezeReads(); native.setRead(activeB); current.release(); await current.finished;
    await expect(panel).toContainText('new_native_capture_B'); await expect(panel.getByRole('button', { name: 'Cancel native request', exact: true })).toHaveCount(0);
    expect(native.receipts.filter(row => row.operation === 'stop')).toHaveLength(0);
    fixture.evidence.push({ nativeReplacement: { old: before.body, current: after.body, lateRouteReleaseDidNotClearCurrentRequest: true,
      finallyScope: 'Observable canceled-response fencing; no artificial delayed body-phase finally was injected.' } });
  });
});

test('Backend identity replacement fences a pending native control and requires new exact backend IDs', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Backend Replacement', async fixture => {
    const native = fixture.native, panel = page.getByTestId('forge-native-performance');
    const oldActive = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'old_backend_capture_A' });
    const old = native.queue('start', nativeFixtureAck(oldActive, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const before = await nativePlanReceived(old);
    const replacementBackend = 'backend_browser_replacement_B';
    const backend = nativeClone(await readReport(request, fixture.headers)); backend.backend.producer.instanceId = replacementBackend;
    const backendHandler = async (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(backend) });
    await page.route(`**${reportPath}`, backendHandler); native.ownCleanup(() => page.unroute(`**${reportPath}`, backendHandler));
    const replacementIdle = nativeFixtureRead(replacementBackend); native.setRead(replacementIdle);
    await expect(page.getByRole('region', { name: 'Owned backend', exact: true })).toContainText(replacementBackend);
    await expect(panel).toContainText(replacementBackend); await expect.poll(() => before.request.failure()?.errorText ?? '').toBe('net::ERR_ABORTED');
    await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeEnabled();
    const replacementActive = nativeFixtureRead(replacementBackend, { active: true, captureId: 'current_backend_capture_B' });
    const current = native.queue('start', nativeFixtureAck(replacementActive, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const after = await nativePlanReceived(current);
    expect(after.body).toMatchObject({ expectedBackendInstanceId: replacementBackend });
    old.release(); await old.finished; await settlePaint(page); await expect(panel).toContainText('Starting native collection');
    await expect(panel).not.toContainText('old_backend_capture_A');
    native.freezeReads(); native.setRead(replacementActive); current.release(); await current.finished;
    await expect(panel).toContainText('current_backend_capture_B');
    fixture.evidence.push({ backendReplacement: { scope: 'injected backend/native public identities, not a real process restart', old: before.body, current: after.body } });
  });
});

test('Native pending requests cannot cross workspace A to B to A selection revisions', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Authority A', async fixture => {
    const native = fixture.native, panel = page.getByTestId('forge-native-performance');
    const selection = () => page.evaluate(() => ({ id: (window as StudioWindow).__X4_WORKSPACE_CONTEXT__!.getWorkspaceId(), revision: (window as StudioWindow).__X4_WORKSPACE_CONTEXT__!.getSelectionRevision() }));
    const before = await selection(), idle = nativeFixtureRead(native.backendInstanceId);
    const oldA = native.queue('start', nativeFixtureAck(nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'obsolete_workspace_A_capture' }), 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const receiptA = await nativePlanReceived(oldA);
    native.setRead(idle); await page.getByTestId('workspace-switcher').selectOption('__new');
    await page.getByTestId('dialog-input').fill('Native Authority B'); await page.getByTestId('dialog-ok').click();
    await expect(page.getByTestId('toast')).toContainText('Created independent workspace');
    await expect.poll(async () => (await selection()).id).not.toBe(before.id);
    const between = await selection(); expect(between.revision).toBeGreaterThan(before.revision);
    await expect.poll(() => receiptA.request.failure()?.errorText ?? '').toBe('net::ERR_ABORTED');
    await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeEnabled();
    const oldB = native.queue('start', nativeFixtureAck(nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'obsolete_workspace_B_capture' }), 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const receiptB = await nativePlanReceived(oldB);
    native.setRead(idle); await page.getByTestId('workspace-switcher').focus();
    await expect(page.getByTestId('workspace-switcher').locator(`option[value="workspace:${before.id}"]`)).toHaveCount(1);
    await page.getByTestId('workspace-switcher').selectOption(`workspace:${before.id}`); await page.getByTestId('dialog-ok').click();
    await expect.poll(async () => (await selection()).id).toBe(before.id);
    const after = await selection(); expect(after.revision).toBeGreaterThan(between.revision);
    await expect.poll(() => receiptB.request.failure()?.errorText ?? '').toBe('net::ERR_ABORTED');
    await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeEnabled();
    const finalRead = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'current_workspace_A_capture' });
    const current = native.queue('start', nativeFixtureAck(finalRead, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const receiptCurrent = await nativePlanReceived(current);
    oldA.release(); oldB.release(); await Promise.all([oldA.finished, oldB.finished]); await settlePaint(page);
    await expect(panel).toContainText('Starting native collection'); await expect(panel).not.toContainText('obsolete_workspace_A_capture'); await expect(panel).not.toContainText('obsolete_workspace_B_capture');
    expect([receiptA.workspaceId, receiptB.workspaceId, receiptCurrent.workspaceId]).toEqual([before.id, between.id, before.id]);
    native.freezeReads(); native.setRead(finalRead); current.release(); await current.finished;
    await expect(panel).toContainText('current_workspace_A_capture'); expect(native.receipts.filter(row => row.operation === 'stop')).toHaveLength(0);
    fixture.evidence.push({ nativeWorkspaceAuthority: { before, between, after, noGlobalStop: true, lateFinallyScope: 'HTTP abort/late-response fencing only' } });
  });
});

test('Native cancellation and unmount never globally stop an acknowledged capture', async ({ page, request }, info) => {
  await withNativeWorkspace(page, request, info, 'Native Cancel And Unmount', async fixture => {
    const native = fixture.native, panel = page.getByTestId('forge-native-performance'), idle = nativeFixtureRead(native.backendInstanceId);
    const cancelled = native.queue('start', nativeFixtureAck(nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'cancelled_capture_not_acknowledged' }), 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); const before = await nativePlanReceived(cancelled);
    await panel.getByRole('button', { name: 'Cancel native request', exact: true }).click();
    await expect.poll(() => before.request.failure()?.errorText ?? '').toBe('net::ERR_ABORTED');
    native.setRead(idle); await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeEnabled();
    const active = nativeFixtureRead(native.backendInstanceId, { active: true, captureId: 'acknowledged_capture_keeps_lease' });
    const current = native.queue('start', nativeFixtureAck(active, 'start'));
    await panel.getByRole('button', { name: 'Start native collection', exact: true }).click(); await nativePlanReceived(current);
    cancelled.release(); await cancelled.finished; await settlePaint(page); await expect(panel).toContainText('Starting native collection');
    await expect(panel).not.toContainText('cancelled_capture_not_acknowledged');
    native.freezeReads(); native.setRead(active); current.release(); await current.finished;
    await expect(panel).toContainText('acknowledged_capture_keeps_lease');
    const controls = native.receipts.filter(row => row.operation !== 'read').length;
    await page.getByTestId('diagnostics-scope-scripts').click(); await expect.poll(async () => (await nativeResources(page)).length).toBe(0);
    const reads = native.receipts.filter(row => row.operation === 'read').length; await page.waitForTimeout(2250);
    expect(native.receipts.filter(row => row.operation === 'read')).toHaveLength(reads);
    expect(native.receipts.filter(row => row.operation !== 'read')).toHaveLength(controls); expect(native.receipts.filter(row => row.operation === 'stop')).toHaveLength(0);
    await page.getByTestId('diagnostics-scope-performance').click();
    await releaseNativeRead(native, value => value.status?.native?.captureId === 'acknowledged_capture_keeps_lease');
    await expect(page.getByTestId('forge-native-performance')).toContainText('Native collection: active');
    fixture.evidence.push({ cancellationAndUnmount: { acknowledgedCaptureNotStopped: true, stops: 0, automaticControlsAfterUnmount: 0 } });
  });
});

for (const operation of ['start', 'stop'] as const) {
  test(`Native ${operation} ACK supersedes a pre-control read before a causally fresh read is delivered`, async ({ page, request }, info) => {
    await withNativeWorkspace(page, request, info, `Native ${operation} Causal Read`, async fixture => {
      const native = fixture.native, panel = page.getByTestId('forge-native-performance');
      const before = nativeFixtureRead(native.backendInstanceId, { active: operation === 'stop', captureId: operation === 'stop' ? 'native_causal_capture_A' : null });
      const after = nativeFixtureRead(native.backendInstanceId, { active: operation === 'start', captureId: 'native_causal_capture_A' });
      const control = native.queue(operation, nativeFixtureAck(after, operation));
      await panel.getByRole('button', { name: operation === 'start' ? 'Start native collection' : 'Stop this native capture', exact: true }).click();
      const issued = await nativePlanReceived(control);
      const preControl = nativeFixtureRead(native.backendInstanceId, { active: operation === 'stop', captureId: operation === 'stop' ? 'native_causal_capture_A' : null, rssBytes: 7 * 1024 * 1024 });
      const oldRead = native.queue('read', preControl); const preControlReceipt = await nativePlanReceived(oldRead);
      expect(preControlReceipt.request.timing().startTime, '[fixture ordering] the distinguished read must be issued after the control click').toBeGreaterThanOrEqual(issued.request.timing().startTime);
      native.freezeReads(); native.setRead(after); oldRead.release(); await oldRead.finished;
      await expect(panel.getByRole('region', { name: 'Shared native extension host', exact: true })).toContainText('7 MiB');
      await expect(panel).toContainText(operation === 'start' ? 'Starting native collection' : 'Stopping native collection');
      const delivered = page.waitForResponse(response => response.request() === issued.request); void delivered.catch(() => undefined);
      control.release(); await control.finished; const ackResponse = await delivered; await ackResponse.finished();
      const ackTiming = issued.request.timing(); expect(ackTiming.responseEnd).toBeGreaterThanOrEqual(0);
      const ackBodyFinishedAt = ackTiming.startTime + ackTiming.responseEnd;
      await expect(panel.getByRole('button', { name: 'Cancel native request', exact: true })).toHaveCount(0);
      // A packet received during the control can precede execution at the host.
      // Arrival/readVersion alone must not make that packet causally newer than ACK.
      await expect(panel).toContainText(`Native collection: ${operation === 'start' ? 'active' : 'inactive'}`);
      await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeDisabled();
      await expect(panel.getByRole('region', { name: 'Shared native extension host', exact: true })).toHaveCount(0);
      const currentRead = await releaseNativeRead(native, value => value.status?.native?.collectionActive === (operation === 'start'), ackBodyFinishedAt);
      await expect(panel.getByRole('region', { name: 'Shared native extension host', exact: true })).toBeVisible();
      if (operation === 'stop') await expect(panel.getByRole('button', { name: 'Start native collection', exact: true })).toBeEnabled();
      fixture.evidence.push({ causalNativeAck: { operation, issued: issued.body, preControlRead: { active: before.status!.native!.collectionActive,
        captureId: before.status!.native!.captureId, distinguishedByRssBytes: 7 * 1024 * 1024 }, ack: control.reply.body,
        freshReadDeliveriesHeldUntilAfterAckStateAssertions: true, ackBodyFinishedAt, freshReadStartedAt: currentRead.receipt!.request.timing().startTime,
        scope: 'controlled browser public-response ordering; not host execution proof' } });
    }, native => native.setRead(nativeFixtureRead(native.backendInstanceId, { active: operation === 'stop', captureId: operation === 'stop' ? 'native_causal_capture_A' : null })));
  });
}
// END BATCH3 mounted native behavior cases

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
