import { expect, test, type APIRequestContext, type Page } from './request-transport';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';
import { E2E_API_ORIGIN, E2E_TOKEN } from '../../playwright.config';
import type { ForgePerformanceReport } from '../../src/components/PerformancePanel';

test.use({ extraHTTPHeaders: { Authorization: `Bearer ${E2E_TOKEN}` } });

const reportPath = '/api/agent/performance';
const collectionSeconds = 10;
const lawOperations = ['canvas.law.generate', 'canvas.law.validate'];


/**
 * B31s2: this spec runs against the EPHEMERAL e2e stack (playwright.config.ts) — the
 * fixture is seeded straight into the ephemeral server and the app adopts it on boot.
 * The old page.route isolation harness + restore teardown (the half-isolation behind
 * incident classes B15/#70) is gone by construction: there is no shared state to guard.
 */

type E2EWorkspace = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  nodes: Array<{
    id: string;
    type: 'cue' | 'event' | 'condition' | 'action' | 'variable' | 'comment';
    label: string;
    xmlTag: string;
    x: number;
    y: number;
    properties: Record<string, unknown>;
    propertiesSchema: unknown[];
    inputs: Array<{ id: string; name: string; type: string }>;
    outputs: Array<{ id: string; name: string; type: string }>;
    includeInBuild?: boolean;
  }>;
  links: Array<{
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  }>;
  uiWidgets: unknown[];
  uiTheme: {
    backgroundColor: string;
    borderColor: string;
    accentColor: string;
    opacity: number;
    showIcons: boolean;
  };
  compileSettings: {
    md: boolean;
    ui: boolean;
    ai: boolean;
    library: boolean;
    translations: boolean;
    patches: boolean;
  };
};

type LawSample = {
  counts: number[];
  totalMs: number[];
  collecting: boolean;
  startedAt: number;
  sampledAt: number;
  releasedAt: number | null;
  history: string;
  adapter: string;
};

const controlledWorkspace: E2EWorkspace = {
  id: 'e2e_canvas',
  name: 'E2E_Canvas',
  version: '1.0.0',
  author: 'Playwright',
  description: 'Canvas interaction harness fixture',
  nodes: [
    {
      id: 'cue_e2e',
      type: 'cue',
      label: 'E2E Cue',
      xmlTag: 'cue',
      x: 140,
      y: 120,
      properties: { name: 'E2E_Cue', namespace: 'this', state: 'active' },
      propertiesSchema: [],
      inputs: [],
      outputs: [
        { id: 'out_cond', name: 'conditions', type: 'flow' },
        { id: 'out_act', name: 'actions', type: 'flow' },
      ],
      includeInBuild: true,
    },
    {
      id: 'event_e2e',
      type: 'event',
      label: 'E2E Event',
      xmlTag: 'event_game_started',
      x: 470,
      y: 110,
      properties: {},
      propertiesSchema: [],
      inputs: [{ id: 'in_cond', name: 'condition', type: 'flow' }],
      outputs: [],
      includeInBuild: true,
    },
    {
      id: 'action_e2e',
      type: 'action',
      label: 'E2E Action',
      xmlTag: 'show_help',
      x: 470,
      y: 340,
      properties: { custom: "'hello'", duration: '5s' },
      propertiesSchema: [],
      inputs: [{ id: 'in_act', name: 'action', type: 'flow' }],
      outputs: [],
      includeInBuild: true,
    },
  ],
  links: [],
  uiWidgets: [],
  uiTheme: {
    backgroundColor: '#111827',
    borderColor: '#06b6d4',
    accentColor: '#0891b2',
    opacity: 0.9,
    showIcons: true,
  },
  compileSettings: { md: true, ui: false, ai: false, library: false, translations: false, patches: false },
};

/** Seed the ephemeral server, boot the app fresh, and wait for natural adoption. */
async function seedWorkspace(page: Page): Promise<void> {
  await seedServerWorkspace(controlledWorkspace);
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.AgentRuntime);
  await expect(page.getByTestId('grid-canvas')).toBeVisible();
  // The boot poll adopts the seeded server copy (version beats the cleared local state).
  await expect(page.getByTestId('canvas-node-cue_e2e')).toBeVisible();
  await expect(page.getByTestId('canvas-node-action_e2e')).toBeVisible();
}

async function workspace(page: Page) {
  return page.evaluate(() => window.AgentRuntime!.getCurrentWorkspace());
}

// Read one real local snapshot at its first render, before subsequent UI work can change it.
function armLawSample(page: Page, afterMouseup = false) {
  return page.evaluateHandle(({ afterMouseup, operations }) => {
    const panel = document.querySelector('[data-testid="forge-performance-panel"]');
    const webview = panel?.querySelector('section[aria-label="This webview"]');
    const refresh = webview && Array.from(webview.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Refresh webview snapshot');
    if (!panel || !webview || !refresh) throw new Error('The local Performance controls are missing.');

    const readTime = (label: string) => Date.parse(webview.querySelector<HTMLTimeElement>(`time[aria-label="${label}"]`)?.dateTime ?? '');
    const events = new AbortController();
    let observer: MutationObserver | undefined;
    let task: number | undefined;
    let timeout: number | undefined;
    const cleanup = () => {
      events.abort();
      observer?.disconnect();
      window.clearTimeout(task);
      window.clearTimeout(timeout);
    };
    const sample = new Promise<LawSample>((resolve, reject) => {
      const takeSample = (releasedAt: number | null) => {
        const previous = readTime('Snapshot captured');
        const requestedAt = Date.now();
        if (requestedAt <= previous) {
          task = window.setTimeout(() => takeSample(releasedAt), 1);
          return;
        }
        observer = new MutationObserver(() => {
          const sampledAt = readTime('Snapshot captured');
          if (!(sampledAt >= requestedAt && sampledAt > previous)) return;
          cleanup();
          const rows = Array.from(webview.querySelectorAll('tbody tr'));
          const lawRows = operations.map(name => rows.find(row => row.firstElementChild?.textContent === name));
          const numericCell = (row: Element | undefined, column: number) => {
            const text = row?.children[column]?.textContent;
            return text ? Number(text.replaceAll(',', '')) : Number.NaN;
          };
          resolve({
            counts: lawRows.map(row => numericCell(row, 1)),
            totalMs: lawRows.map(row => numericCell(row, 2)),
            collecting: webview.querySelector('h3 span')?.textContent === 'Collecting',
            startedAt: readTime('Collection started'),
            sampledAt,
            releasedAt,
            history: webview.querySelector<HTMLDetailsElement>('details')?.innerText ?? '',
            adapter: Array.from(panel.querySelectorAll('p')).find(row => row.textContent?.startsWith('Webview: frames '))?.textContent ?? '',
          });
        });
        observer.observe(webview, { subtree: true, childList: true, attributes: true, characterData: true });
        refresh.click();
      };
      timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('The local Performance control did not render a fresh snapshot.'));
      }, 3_000);
      if (afterMouseup) {
        window.addEventListener('mouseup', event => {
          if (!event.isTrusted || event.button !== 0) return;
          const releasedAt = Date.now();
          // Let all real release handlers run before refreshing, in the next browser task.
          task = window.setTimeout(() => takeSample(releasedAt), 0);
        }, { capture: true, once: true, signal: events.signal });
      } else {
        takeSample(null);
      }
    });
    void sample.catch(() => undefined);
    return { sample };
  }, { afterMouseup, operations: lawOperations });
}

async function readLawSample(handle: Awaited<ReturnType<typeof armLawSample>>) {
  try { return await handle.evaluate(value => value.sample); }
  finally { await handle.dispose(); }
}

function expectReliableLawSample(sample: LawSample, startedAt: number) {
  expect(sample.collecting).toBe(true);
  expect(sample.startedAt).toBe(startedAt);
  expect(sample.sampledAt).toBeGreaterThanOrEqual(startedAt);
  for (const key of ['disabled', 'invalidOperations', 'operationCapacity', 'duplicateFinishes', 'recorderErrors', 'snapshotOmissions', 'staleFinishes', 'clock failures']) {
    expect(sample.history).toMatch(new RegExp(`\\b${key} 0\\b`));
  }
  expect(sample.adapter).toContain('Adapter errors 0; ignored old completions 0.');
}

async function readIdleBackend(request: APIRequestContext) {
  const response = await request.get(E2E_API_ORIGIN + reportPath, { headers: await ephemeralWorkspaceHeaders() });
  try {
    expect(response.status()).toBe(200);
    const { ok, backend, control } = await response.json() as ForgePerformanceReport;
    expect(ok).toBe(true);
    expect(backend.enabled).toBe(false);
    expect(control).toMatchObject({
      disposed: false, collectionActive: false, collectionCleanupUnconfirmed: false,
      profileActive: false, profileCleanupUnconfirmed: false, abortListenerCleanupUnconfirmed: false,
      ownedTimerCount: 0, failedTimerCount: 0, eventLoopDelayMonitoring: false,
    });
    expect(backend.producer.pid).toBe(control.coverage.backendPid);
    return {
      producer: backend.producer,
      retainedResources: backend.resources.length,
      retainedOperations: backend.operations.length,
      resourceSamples: control.resourceSamples,
    };
  } finally {
    await response.dispose();
  }
}

test('real canvas interactions create oriented links, move groups, add from palette, and avoid per-frame canvas diagnostics', async ({ page, request }, info) => {
  let compileRequests = 0;
  // Compile stays mocked: the assertion below is about DEBOUNCE behavior (how often the
  // app compiles), not about the compiler — and mocking keeps the spec fast.
  await page.route('**/api/agent/compile', async (route) => {
    compileRequests += 1;
    await route.fulfill({ json: { diagnostics: [], validation: { scope: 'full-project' } } });
  });

  const backendWrites: string[] = [];
  page.on('request', outgoing => {
    const pathname = new URL(outgoing.url()).pathname;
    const method = outgoing.method();
    if ((pathname === reportPath || pathname.startsWith(reportPath + '/')) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      backendWrites.push(`${method} ${pathname}`);
    }
  });

  let holdReports = false;
  let releaseReports!: () => void;
  const reportsReleased = new Promise<void>(resolve => { releaseReports = resolve; });
  await page.route(`**${reportPath}`, async route => {
    if (holdReports && route.request().method() === 'GET') await reportsReleased;
    await route.continue();
  });

  await seedWorkspace(page);

  await page.waitForTimeout(650);
  compileRequests = 0;

  await page.locator('[data-sidebar-tab="diagnostics"]').click();
  await page.getByTestId('diagnostics-scope-performance').click();
  const panel = page.getByTestId('forge-performance-panel');
  const webview = page.getByRole('region', { name: 'This webview', exact: true });
  const start = panel.getByRole('button', { name: 'Start webview collection only', exact: true });
  await expect(panel).toContainText('Backend collection: inactive');
  await expect(webview).toContainText('Collection off');
  await panel.getByLabel('Performance collection duration seconds', { exact: true }).fill(String(collectionSeconds));

  const backendBefore = await readIdleBackend(request);
  let primaryFailed = false;
  try {
    await start.click();
    await expect(webview).toContainText('Collecting');
    // Stop periodic panel reads from substituting for a direct local sample. Responses are not mocked.
    holdReports = true;

    const cue = page.getByTestId('canvas-node-cue_e2e');
    const event = page.getByTestId('canvas-node-event_e2e');

    await page.getByTestId('canvas-port-cue_e2e-out_act').click();
    await page.getByTestId('canvas-port-action_e2e-in_act').click();
    const afterLink = await workspace(page);
    expect(afterLink.links).toContainEqual(expect.objectContaining({
      sourceNodeId: 'cue_e2e',
      sourcePortId: 'out_act',
      targetNodeId: 'action_e2e',
      targetPortId: 'in_act',
    }));
    await page.waitForTimeout(700);
    compileRequests = 0;

    const beforeDrag = await workspace(page);
    const cueBefore = beforeDrag.nodes.find((node) => node.id === 'cue_e2e')!;
    const eventBefore = beforeDrag.nodes.find((node) => node.id === 'event_e2e')!;
    const refresh = webview.getByRole('button', { name: 'Refresh webview snapshot', exact: true });
    await refresh.click();
    const showAll = webview.getByRole('button', { name: /^Show all [\d,]+ operations$/ });
    if (await showAll.isVisible()) await showAll.click();
    await webview.getByText('Retained history and measurement limits', { exact: true }).click();
    await expect(webview.getByText(/^Overwrites\/drops:/)).toBeVisible();

    const baseline = await readLawSample(await armLawSample(page));
    expect(baseline.startedAt).toBeGreaterThan(0);
    expectReliableLawSample(baseline, baseline.startedAt);
    expect(baseline.counts).toHaveLength(2);
    for (const count of baseline.counts) expect(count).toBeGreaterThan(0);

    await cue.click({ modifiers: ['Shift'] });
    await event.click({ modifiers: ['Shift'] });
    const box = await cue.boundingBox();
    if (!box) throw new Error('The cue is missing from the Canvas.');
    await page.mouse.move(box.x + 30, box.y + 20);
    const releaseSample = await armLawSample(page, true);
    await page.mouse.down();
    let held: LawSample;
    try {
      // As in the other Canvas drag case, allow React to bind the active-drag handler.
      await page.waitForTimeout(80);
      await page.mouse.move(box.x + 110, box.y + 90, { steps: 18 });
      held = await readLawSample(await armLawSample(page));
    } finally {
      await page.mouse.up();
    }
    const released = await readLawSample(releaseSample);
    expectReliableLawSample(held, baseline.startedAt);
    expect(held.counts).toEqual(baseline.counts);
    expectReliableLawSample(released, baseline.startedAt);
    expect(released.releasedAt).not.toBeNull();
    expect(held.sampledAt).toBeLessThanOrEqual(released.releasedAt!);
    const releaseToSampleMs = released.sampledAt - released.releasedAt!;
    expect(releaseToSampleMs).toBeGreaterThanOrEqual(0);
    expect(releaseToSampleMs).toBeLessThan(400);
    expect(released.counts).toEqual(baseline.counts);

    const afterGroupDrag = await workspace(page);
    const cueAfter = afterGroupDrag.nodes.find((node) => node.id === 'cue_e2e')!;
    const eventAfter = afterGroupDrag.nodes.find((node) => node.id === 'event_e2e')!;
    expect(cueAfter.x).toBeGreaterThan(cueBefore.x);
    expect(cueAfter.y).toBeGreaterThan(cueBefore.y);
    expect(eventAfter.x - eventBefore.x).toBe(cueAfter.x - cueBefore.x);
    expect(eventAfter.y - eventBefore.y).toBe(cueAfter.y - cueBefore.y);

    await page.waitForTimeout(700);
    const settled = await readLawSample(await armLawSample(page));
    expectReliableLawSample(settled, baseline.startedAt);
    expect(settled.sampledAt - released.releasedAt!).toBeGreaterThanOrEqual(700);
    expect(settled.counts).toEqual(baseline.counts.map(count => count + 1));
    expect(compileRequests).toBeLessThanOrEqual(2);
    for (const totalMs of settled.totalMs) expect(Number.isFinite(totalMs)).toBe(true);
    console.info(`FORGE_CANVAS_LAW_COUNTS: ${JSON.stringify({
      baseline: baseline.counts,
      held: held.counts,
      released: released.counts,
      settled: settled.counts,
      settledTotalMs: settled.totalMs,
      releaseToSampleMs,
      releaseToSettledMs: settled.sampledAt - released.releasedAt!,
      compileRequests,
    })}`);
    releaseReports();

    // Right-click a spot that is free canvas at the default 1280px viewport: x=720 was
    // UNDER the docked code-editor <aside> (which fills the panel since the G8 width fix),
    // so the click was intercepted and retried until the 60s timeout (found 2026-07-09).
    // (300, 520) sits below the seeded fixture nodes and left of the code panel.
    await page.getByTestId('grid-canvas').click({
      button: 'right',
      position: { x: 300, y: 520 },
    });
    await expect(page.getByTestId('canvas-quick-spawn')).toBeVisible();
    await page.getByPlaceholder('Search egosoft logic parameters...').fill('reward_player');
    await page.getByTestId('canvas-palette-reward_player').click();
    const afterPaletteAdd = await workspace(page);
    expect(afterPaletteAdd.nodes.some((node) => node.xmlTag === 'reward_player')).toBe(true);
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    releaseReports();
    try {
      try {
        const stop = panel.getByRole('button', { name: 'Stop webview collection only', exact: true });
        if (await stop.isVisible()) await stop.click();
        await expect(panel).toContainText('Webview collection: inactive · owned timers 0; failed timer cleanup 0.');
      } finally {
        expect(await readIdleBackend(request)).toEqual(backendBefore);
        expect(backendWrites).toEqual([]);
      }
    } catch (error) {
      if (!primaryFailed) throw error;
      await info.attach('canvas-performance-cleanup-error', { body: String(error), contentType: 'text/plain' });
    }
  }
});
