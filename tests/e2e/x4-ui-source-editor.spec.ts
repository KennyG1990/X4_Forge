import { expect, test, type APIRequestContext, type Download, type ElementHandle, type Locator, type Page } from '@playwright/test';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { E2E_API_ORIGIN } from '../../playwright.config';
import type { ReferenceManifestStatus } from '../../src/lib/referenceManifest';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { resolveXsdConfig } from '../../src/lib/xsdParser';
import type { ModWorkspace } from '../../src/types';
import { HELPER_SOURCE_SHA256, WIDGET_SOURCE_SHA256, X4_LAYOUT_PROVENANCE } from '../../src/lib/x4UiLayoutKernel';
import { createX4UiLayoutTargetCatalog, projectX4UiLayoutProgram } from '../../src/lib/x4UiLayoutProgram';
import { normalizeX4UiSourceEditLayoutModel } from '../../src/lib/x4UiSourceEdits';
import { buildX4UiWorkspaceSource } from '../../src/lib/x4UiWorkspaceSource';
import { readServerWorkspace, seedServerWorkspace } from './ephemeral';

type Settlement = 'late' | 'abort';

type Deferred<T> = {
  readonly promise: Promise<T>;
  resolve(value: T): void;
};

type PendingStatusRequest = {
  readonly generation: number;
  readonly url: string;
  readonly settle: (mode: Settlement) => void;
  readonly completed: Promise<void>;
};

type StatusFetchObservation = {
  readonly generation: number;
  readonly signalId: number | null;
  readonly cache: RequestCache | null;
  readonly aborted: boolean;
  readonly abortEvents: number;
};

type CreationWorkspace = { passthroughFiles: { path: string; content: string }[] };

type NeutralLightMaskObservation = {
  readonly count: number;
  readonly maskSignature: string;
  readonly cropRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
};

/** Default: neutral input ink excluding chrome. Caption callers supply their exact source tint and zero inset. */
async function sampleNeutralLightMask(page: Page, caption?: { readonly rgb: readonly [number, number, number] }): Promise<NeutralLightMaskObservation> {
  return page.evaluate((captionColor) => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    const selection = document.querySelector('[data-testid="x4-ui-canvas-selection"]');
    if (!(canvas instanceof HTMLCanvasElement) || !(selection instanceof HTMLElement)) {
      throw new Error('Input native canvas or selection disappeared before mask sampling');
    }
    const canvasBox = canvas.getBoundingClientRect();
    const selectionBox = selection.getBoundingClientRect();
    const geometry = [canvasBox.left, canvasBox.top, canvasBox.width, canvasBox.height,
      selectionBox.left, selectionBox.top, selectionBox.width, selectionBox.height];
    if (!geometry.every(Number.isFinite) || canvas.width <= 0 || canvas.height <= 0
      || canvasBox.width <= 0 || canvasBox.height <= 0 || selectionBox.width <= 0 || selectionBox.height <= 0) {
      throw new Error('Input native canvas or selection has invalid pixel geometry');
    }
    const scaleX = canvas.width / canvasBox.width;
    const scaleY = canvas.height / canvasBox.height;
    const selectedX = (selectionBox.left - canvasBox.left) * scaleX;
    const selectedY = (selectionBox.top - canvasBox.top) * scaleY;
    const selectedWidth = selectionBox.width * scaleX;
    const selectedHeight = selectionBox.height * scaleY;
    // Read only canvas pixels, never CSS selection overlays. Inset in native pixels
    // past the edit-box chrome: 1px config border + 2px inner inset + 2px text border.
    const frameChromeInset = captionColor ? 0 : 5;
    const cropLeft = Math.max(0, Math.ceil(selectedX + frameChromeInset));
    const cropTop = Math.max(0, Math.ceil(selectedY + frameChromeInset));
    const cropRight = Math.min(canvas.width, Math.floor(selectedX + selectedWidth - frameChromeInset));
    const cropBottom = Math.min(canvas.height, Math.floor(selectedY + selectedHeight - frameChromeInset));
    const cropWidth = cropRight - cropLeft;
    const cropHeight = cropBottom - cropTop;
    if (![cropLeft, cropTop, cropWidth, cropHeight].every(Number.isFinite) || cropWidth <= 0 || cropHeight <= 0) {
      throw new Error('Input native content crop is empty or invalid');
    }
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Input native canvas has no 2D context');
    const pixels = context.getImageData(cropLeft, cropTop, cropWidth, cropHeight).data;
    let count = 0;
    let maskHash = 2166136261;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      const maxRgb = Math.max(red, green, blue);
      const minRgb = Math.min(red, green, blue);
      const isNeutralLight = alpha >= 64 && (captionColor
        ? Math.abs(red - captionColor[0]) <= 4 && Math.abs(green - captionColor[1]) <= 4 && Math.abs(blue - captionColor[2]) <= 4
        : maxRgb >= 64 && maxRgb - minRgb <= 4);
      if (isNeutralLight) count += 1;
      // FNV-1a over row-major mask bits; colored diagnostics cannot contribute.
      maskHash ^= isNeutralLight ? 1 : 0;
      maskHash = Math.imul(maskHash, 16777619) >>> 0;
    }
    return {
      count,
      maskSignature: `neutral-light-v1:${cropWidth}x${cropHeight}:${maskHash.toString(16).padStart(8, '0')}`,
      cropRect: { x: cropLeft, y: cropTop, width: cropWidth, height: cropHeight },
    };
  }, caption?.rgb);
}

type NativeCanvasSignature = {
  readonly width: number;
  readonly height: number;
  readonly pixelSignature: string;
  readonly nonTransparentPixels: number;
};

/** Reads the mounted native canvas pixels without changing page or authoring state. */
async function readNativeCanvasSignature(page: Page, region?: { x: number; y: number; width: number; height: number }): Promise<NativeCanvasSignature> {
  return page.evaluate((region) => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor history canvas disappeared before native signature capture');
    if (canvas.width <= 0 || canvas.height <= 0) throw new Error('SourceEditor history canvas has invalid native dimensions');
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('SourceEditor history canvas has no 2D context');
    const pixels = region
      ? context.getImageData(region.x, region.y, region.width, region.height).data
      : context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    let nonTransparentPixels = 0;
    for (let index = 0; index < pixels.length; index += 1) {
      const channel = pixels[index] ?? 0;
      hash ^= channel;
      hash = Math.imul(hash, 16777619) >>> 0;
      if (index % 4 === 3 && channel > 0) nonTransparentPixels += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      pixelSignature: `rgba-fnv1a-v1:${canvas.width}x${canvas.height}:${hash.toString(16).padStart(8, '0')}`,
      nonTransparentPixels,
    };
  }, region);
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

const sourceEditorWorkspace = {
  ...buildTemplateWorkspace('welcome'),
  id: 'x4-ui-source-editor-p7-e2e',
  name: 'X4 UI Source Editor P7 E2E',
  passthroughFiles: [
    {
      path: 'ui.xml',
      content: [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<addon name="x4-ui-source-editor-p7-e2e">',
        '  <environment type="menus">',
        '    <file name="ui/x4-ui-source-editor-p7-e2e.lua" />',
        '  </environment>',
        '</addon>',
        '',
      ].join('\n'),
    },
    {
      path: 'ui/x4-ui-source-editor-p7-e2e.lua',
      content: [
        'local menu = { name = "X4UiSourceEditorP7E2E", layer = 1 }',
        'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
        'local table = frame:addTable(1, { width = 100, reserveScrollBar = false, scaling = false })',
        'local row = table:addRow(false, {})',
        'row[1]:createText("P7 E2E source")',
        'frame:display()',
        '',
        'function menu.previewLoop()',
        '  local loopFrame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
        '  for i = 1, 2 do',
        '    loopFrame:addTable(1, { width = 100 })',
        '  end',
        '  loopFrame:display()',
        'end',
        '',
      ].join('\n'),
    },
  ],
};

const b119PropertyRecoveryWorkspace = {
  ...buildTemplateWorkspace('welcome'),
  id: 'x4-ui-source-editor-b119-property-recovery-e2e',
  name: 'X4 UI Source Editor B119 property recovery E2E',
  passthroughFiles: [
    {
      path: 'ui.xml',
      content: [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<addon name="x4-ui-source-editor-b119-property-recovery-e2e">',
        '  <environment type="menus">',
        '    <file name="ui/x4-ui-source-editor-b119-property-recovery-e2e.lua" />',
        '  </environment>',
        '</addon>',
        '',
      ].join('\n'),
    },
    {
      path: 'ui/x4-ui-source-editor-b119-property-recovery-e2e.lua',
      content: [
        'local menu = { name = "X4UiSourceEditorB119PropertyRecoveryE2E", layer = 1 }',
        'function menu.createFrame()',
        '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80, layer = 2, standardButtons = true, blurBackground = true })',
        '  local table = frame:addTable(3, { width = 80, scaling = false })',
        '  local row = table:addRow(false, { height = 20, interactive = true })',
        '  local text = row[1]:createText("Title", { width = 20, height = 10, fontsize = 12, font = "Zekton", halign = "center", wordwrap = true, scaling = true, x = 1, y = 2 })',
        '  local button = row[2]:createButton({ width = 30, height = 20, active = true, scaling = false, affectRowHeight = true })',
        '  button:setText("Press", { fontsize = 11, ["mystery-key"] = 3 })',
        '  button:setText2("Secondary", { font = "Zekton" })',
        '  local input = row[3]:createEditBox({ width = 40, height = 18, defaultText = "Type here", description = "Description", maxChars = 32, selectTextOnActivation = true, active = true, scaling = true })',
        '  local dynamicRow = table:addRow(false, {})',
        '  local dynamicWidth = getWidth()',
        '  dynamicRow[1]:createButton({ width = dynamicWidth, height = 20 })',
        '  local calculatedRow = table:addRow(false, {})',
        '  local calculatedHeight = 10 + 5',
        '  calculatedRow[1]:createButton({ width = 20, height = calculatedHeight })',
        '  frame:display()',
        'end',
        '',
      ].join('\n'),
    },
  ],
};

const buildB119SourceIssuedWidgetSelectors = (workspace: Parameters<typeof buildX4UiWorkspaceSource>[0] = b119PropertyRecoveryWorkspace) => {
  const source = buildX4UiWorkspaceSource(workspace);
  if (!source.bundle) throw new Error('B119 E2E source-issued selector proof did not build a workspace bundle');
  const sourceFile = source.bundle.sourceFiles.find(file => file.path === 'ui/x4-ui-source-editor-b119-property-recovery-e2e.lua');
  if (!sourceFile) throw new Error('B119 E2E source-issued selector proof did not find its Lua source');
  const model = normalizeX4UiSourceEditLayoutModel(sourceFile.callModel);
  const targetCatalog = createX4UiLayoutTargetCatalog(model);
  const target = targetCatalog.targets.find(candidate => candidate.kind === 'function' && candidate.name === 'menu.createFrame');
  if (!target) throw new Error('B119 E2E source-issued selector proof did not issue menu.createFrame');
  const pin = (value: number, lineStart: number, lineEnd = lineStart) => ({
    value,
    source: { sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath, lineStart, lineEnd },
  });
  const profile = {
    id: 'b119-property-recovery-e2e-selector-profile',
    provenance: 'B119 E2E source-issued selector proof',
    truthGrade: 'captured' as const,
    source: target.sourceIdentity,
    frame: { width: 2560, height: 1440 },
    metrics: { uiScale: 1.4, borderSize: 1, scrollbarWidth: 12, standardContainerOffset: 2 },
    helper: {
      sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath,
      sha256: HELPER_SOURCE_SHA256,
      constants: {
        standardTextHeight: pin(16, 533),
        standardButtonHeight: pin(25, 522),
        viewWidth: pin(2560, 707),
        viewHeight: pin(1440, 708),
        borderSize: pin(1, 709),
      },
    },
    widget: { sourcePath: X4_LAYOUT_PROVENANCE.widgetSourcePath, sha256: WIDGET_SOURCE_SHA256 },
    defaults: { standardButtonHeight: pin(25, 522), minTextHeight: 7 },
  };
  const result = projectX4UiLayoutProgram(model, target, profile);
  if ('refusal' in result) {
    throw new Error(`B119 E2E source-issued selector proof refused the exact function target: ${result.refusal.message}`);
  }
  if (result.program === undefined) {
    throw new Error('B119 E2E source-issued selector proof did not issue a program for the exact function target');
  }
  const creator = (
    kind: 'createText' | 'createButton' | 'createEditBox',
    sourceLine: number,
    widgetKind: 'text' | 'button' | 'editbox',
  ) => {
    const matches = result.program.operations.filter(operation => operation.kind === kind && operation.source.start.line === sourceLine);
    if (matches.length !== 1 || matches[0].cellId === undefined) {
      throw new Error(`B119 E2E source-issued selector proof expected one ${kind} at line ${sourceLine}, got ${matches.length}`);
    }
    const operation = matches[0];
    const widgetTestId = `x4-ui-builder-node-scene:widget:${operation.cellId}:${widgetKind}`;
    return {
      testId: widgetKind === 'text'
        ? `x4-ui-builder-node-scene:text:${operation.cellId}:primary`
        : widgetTestId,
      widgetTestId,
      operationId: operation.id,
      sourceLine,
      widgetKind,
    };
  };
  return {
    title: creator('createText', 6, 'text'),
    button: creator('createButton', 7, 'button'),
    input: creator('createEditBox', 10, 'editbox'),
    dynamic: creator('createButton', 13, 'button'),
    calculated: creator('createButton', 16, 'button'),
  };
};
const b119SourceIssuedWidgetSelectors = buildB119SourceIssuedWidgetSelectors();

function unavailableBody(marker: string): Record<string, unknown> {
  return {
    available: false,
    state: 'offline',
    root: marker,
    manifest: { available: false, state: 'offline' },
    error: { code: 'status-unavailable', message: marker },
  };
}

const nonSuccessResponseDetail = 'The configured-corpus status endpoint returned a non-success response.';

async function setupB119PropertyRecoveryFixture(page: Page, request: APIRequestContext, workspace = b119PropertyRecoveryWorkspace): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.route('**/api/agent/health-card**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ verdict: 'ready', summary: 'B119 property recovery fixture ready.', rows: [] }),
  }));
  const referenceRoot = 'source-editor-b119-property-recovery-e2e-root';
  const referenceGeneration = 'source-editor-b119-property-recovery-e2e-generation';
  const referenceGeneratedAt = '2026-09-12T00:00:00.000Z';
  const manifestStatus = {
    available: true,
    state: 'ready',
    root: referenceRoot,
    current: { generation: referenceGeneration, root: referenceRoot, generatedAt: referenceGeneratedAt },
  };
  await page.route('**/api/reference/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      available: true,
      root: referenceRoot,
      generatedAt: referenceGeneratedAt,
      manifestGeneration: referenceGeneration,
      manifest: manifestStatus,
    }),
  }));
  await page.route('**/api/reference/manifest**', async route => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('q');
    let bytes: number | undefined;
    if (path !== null) {
      const fileUrl = new URL('/api/reference/file', url.origin);
      fileUrl.searchParams.set('path', path);
      const response = await request.get(fileUrl.toString());
      if (!response.ok()) throw new Error(`B119 property recovery fixture file request failed: ${response.status()}`);
      bytes = (await response.body()).byteLength;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: manifestStatus,
        generation: referenceGeneration,
        total: path === null ? 0 : 1,
        limit: 500,
        offset: 0,
        files: path === null || bytes === undefined ? [] : [{ path, bytes }],
      }),
    });
  });
  await seedServerWorkspace(workspace);
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await page.locator('[data-workspace-view="ui-designer"]').click();
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  const sourceOption = sourceSelector.locator('option').filter({ hasText: 'ui/x4-ui-source-editor-b119-property-recovery-e2e.lua' }).first();
  await expect(sourceOption).toHaveCount(1);
  const sourceValue = await sourceOption.getAttribute('value');
  if (sourceValue === null) throw new Error('B119 property recovery fixture source option has no value');
  await sourceSelector.selectOption(sourceValue);
  const targetOption = targetSelector.locator('option').filter({ hasText: 'menu.createFrame' }).first();
  await expect(targetOption).toHaveCount(1);
  const targetValue = await targetOption.getAttribute('value');
  if (targetValue === null) throw new Error('B119 property recovery fixture target option has no value');
  await targetSelector.selectOption(targetValue);
  await expect(targetSelector.locator('option:checked')).toHaveText('menu.createFrame');
  await expect(page.getByTestId('x4-ui-builder-workspace')).toBeVisible();
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
}

test('SourceEditor reload and unmount ignore late or aborted corpus generations', async ({ page }) => {
  const pendingByGeneration = new Map<number, PendingStatusRequest[]>();
  const routeOutcomes: string[] = [];
  let activeGeneration = 1;
  let generation2StatusRequests = 0;

  const pendingFor = (generation: number): PendingStatusRequest[] => {
    const existing = pendingByGeneration.get(generation);
    if (existing !== undefined) return existing;
    const created: PendingStatusRequest[] = [];
    pendingByGeneration.set(generation, created);
    return created;
  };

  await page.route('**/api/reference/status', async route => {
    const generation = activeGeneration;
    const url = route.request().url();
    if (generation === 2) {
      generation2StatusRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify(unavailableBody('CURRENT_GENERATION_2_UNAVAILABLE')),
      });
      return;
    }

    const decision = deferred<Settlement>();
    const completion = deferred<void>();
    const pending: PendingStatusRequest = {
      generation,
      url,
      settle: decision.resolve,
      completed: completion.promise,
    };
    pendingFor(generation).push(pending);
    try {
      const mode = await decision.promise;
      if (mode === 'late') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(unavailableBody(`FIRST_GENERATION_${generation}_LATE`)),
        });
        routeOutcomes.push(`${generation}:late`);
      } else {
        await route.abort('failed');
        routeOutcomes.push(`${generation}:abort`);
      }
    } catch {
      // Navigation/reload may have already aborted the intercepted request. The
      // completion still settles so the test can prove the component stayed quiet.
      routeOutcomes.push(`${generation}:route-rejected`);
    } finally {
      completion.resolve();
    }
  });

  async function settleGeneration(generation: number, modes: readonly Settlement[]): Promise<void> {
    const pending = pendingFor(generation);
    pending.forEach((request, index) => request.settle(modes[index % modes.length]));
    await Promise.all(pending.map(request => request.completed));
  }

  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');

    const originalFetch = window.fetch.bind(window);
    const signalIds = new WeakMap<AbortSignal, number>();
    let nextSignalId = 1;
    const harness = {
      generation: 1,
      statusRequests: [] as Array<{
        generation: number;
        signalId: number | null;
        cache: RequestCache | null;
        aborted: boolean;
        abortEvents: number;
      }>,
    };
    Object.defineProperty(window, '__x4UiSourceEditorP7FetchHarness', {
      configurable: true,
      value: harness,
    });
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : input.toString();
      if (new URL(requestUrl, window.location.href).pathname !== '/api/reference/status') {
        return originalFetch(input, init);
      }

      const requestSignal = input instanceof Request ? input.signal : undefined;
      const signal = init?.signal ?? requestSignal;
      let signalId: number | null = null;
      if (signal !== undefined) {
        signalId = signalIds.get(signal) ?? null;
        if (signalId === null) {
          signalId = nextSignalId;
          nextSignalId += 1;
          signalIds.set(signal, signalId);
        }
      }
      const observation = {
        generation: harness.generation,
        signalId,
        cache: init?.cache ?? null,
        aborted: signal?.aborted ?? false,
        abortEvents: 0,
      };
      if (signal !== undefined) {
        signal.addEventListener('abort', () => {
          observation.aborted = true;
          observation.abortEvents += 1;
        }, { once: true });
      }
      harness.statusRequests.push(observation);
      return originalFetch(input, init);
    }) as typeof window.fetch;
  });
  await page.route('**/api/agent/health-card**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ verdict: 'ready', summary: 'E2E fixture ready.', rows: [] }),
  }));
  await seedServerWorkspace(sourceEditorWorkspace);

  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();

  const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
  await expect(uiDesigner).toBeVisible();
  await uiDesigner.click();
  await expect(uiDesigner).toHaveAttribute('aria-current', 'page');

  const editor = page.getByTestId('x4-ui-source-editor');
  await page.getByTestId('x4-ui-inspect-toggle').click();
  const corpusStatus = page.getByTestId('x4-ui-corpus-status');
  const corpusDetail = page.getByTestId('x4-ui-corpus-detail');
  const gameTruth = page.getByTestId('x4-ui-game-truth');
  const colorStatus = page.getByTestId('x4-ui-corpus-color-status');
  const colorDetail = page.getByTestId('x4-ui-corpus-color-detail');
  await expect(editor).toBeVisible();
  await expect(corpusStatus).toBeVisible();
  await expect(corpusDetail).toBeVisible();
  await expect(gameTruth).toHaveText(/^Not verified in game$/);
  await expect(colorStatus).toHaveCount(1);
  await expect(colorDetail).toHaveCount(1);
  await expect(colorStatus).toBeVisible();
  await expect(colorDetail).toBeVisible();
  await expect.poll(() => pendingFor(1).length).toBeGreaterThanOrEqual(2);
  expect(new Set(pendingFor(1).map(request => new URL(request.url).pathname))).toEqual(new Set(['/api/reference/status']));
  await expect(page.getByTestId('health-card')).toHaveCount(0);

  activeGeneration = 2;
  await page.evaluate(() => {
    const harness = (window as unknown as {
      __x4UiSourceEditorP7FetchHarness?: { generation: number };
    }).__x4UiSourceEditorP7FetchHarness;
    if (harness === undefined) throw new Error('SourceEditor fetch harness was not installed');
    harness.generation = 2;
  });
  await page.getByTestId('x4-ui-corpus-reload').click();
  await expect.poll(() => generation2StatusRequests).toBeGreaterThanOrEqual(2);
  await expect(corpusStatus).toHaveText(/^\s*unavailable\s*$/i);
  await expect(corpusDetail).toHaveText(nonSuccessResponseDetail);
  await expect(colorStatus).toHaveText(/^\s*unavailable\s*$/i);
  await expect(colorDetail).toHaveText(nonSuccessResponseDetail);
  const currentStatus = (await corpusStatus.textContent()) ?? '';
  const currentDetail = (await corpusDetail.textContent()) ?? '';
  const currentColorStatus = (await colorStatus.textContent()) ?? '';
  const currentColorDetail = (await colorDetail.textContent()) ?? '';
  await expect(gameTruth).toHaveText(/^Not verified in game$/);
  expect(currentStatus).not.toContain('FIRST_GENERATION');
  expect(currentDetail).not.toContain('FIRST_GENERATION');
  expect(currentColorStatus).not.toContain('FIRST_GENERATION');
  expect(currentColorDetail).not.toContain('FIRST_GENERATION');

  await settleGeneration(1, ['late', 'abort']);
  await expect(corpusStatus).toHaveText(currentStatus);
  await expect(corpusDetail).toHaveText(currentDetail);
  await expect(gameTruth).toHaveText(/^Not verified in game$/);
  await expect(colorStatus).toHaveText(currentColorStatus);
  await expect(colorDetail).toHaveText(currentColorDetail);
  expect(routeOutcomes.filter(outcome => outcome.startsWith('1:')).length).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);

  activeGeneration = 3;
  const generation3ObservationStart = await page.evaluate(() => {
    const harness = (window as unknown as {
      __x4UiSourceEditorP7FetchHarness?: { statusRequests: StatusFetchObservation[] };
    }).__x4UiSourceEditorP7FetchHarness;
    if (harness === undefined) throw new Error('SourceEditor fetch harness was not installed');
    return harness.statusRequests.length;
  });
  await page.evaluate(() => {
    const harness = (window as unknown as {
      __x4UiSourceEditorP7FetchHarness?: { generation: number };
    }).__x4UiSourceEditorP7FetchHarness;
    if (harness === undefined) throw new Error('SourceEditor fetch harness was not installed');
    harness.generation = 3;
  });
  await page.getByTestId('x4-ui-corpus-reload').click();
  await expect.poll(() => pendingFor(3).length).toBeGreaterThanOrEqual(2);
  const readGeneration3StatusCohort = async (): Promise<StatusFetchObservation[]> =>
    page.evaluate((observationStart: number) => {
      const harness = (window as unknown as {
        __x4UiSourceEditorP7FetchHarness?: { statusRequests: StatusFetchObservation[] };
      }).__x4UiSourceEditorP7FetchHarness;
      if (harness === undefined) throw new Error('SourceEditor fetch harness was not installed');
      return harness.statusRequests.slice(observationStart);
    }, generation3ObservationStart);

  // Static SourceEditor coverage owns the shared upstream lifecycle-signal
  // identity. At this mounted boundary customFetch owns one deadline-derived
  // signal per request, so this exact core/colour cohort must have two distinct
  // live identities that both receive the upstream cleanup abort.
  await expect.poll(async () => {
    const observations = await readGeneration3StatusCohort();
    return {
      requestCount: observations.length,
      generation3Count: observations.filter(request => request.generation === 3).length,
      signaledCount: observations.filter(request => request.signalId !== null).length,
    };
  }, { message: 'wait for the exact generation-three core/colour request cohort' }).toEqual({
    requestCount: 2,
    generation3Count: 2,
    signaledCount: 2,
  });

  const generation3StatusCohort = await readGeneration3StatusCohort();
  expect(generation3StatusCohort).toHaveLength(2);
  expect(generation3StatusCohort.every(request => request.generation === 3)).toBe(true);
  expect(generation3StatusCohort.map(request => request.cache)).toEqual(['no-store', 'no-store']);
  expect(generation3StatusCohort.every(request => !request.aborted && request.abortEvents === 0)).toBe(true);
  expect(pendingFor(3), 'the held route cohort must contain exactly core and colour').toHaveLength(2);
  const cohortSignalIds = new Set(generation3StatusCohort.map(request => request.signalId));
  expect(cohortSignalIds.has(null)).toBe(false);
  expect(cohortSignalIds.size, 'customFetch must derive one deadline signal per request').toBe(2);
  const selectedSignalIds = Object.freeze(
    Array.from(cohortSignalIds).filter((signalId): signalId is number => signalId !== null),
  );
  expect(selectedSignalIds).toHaveLength(2);

  await page.locator('[data-workspace-view="blueprint"]').click();
  await expect(page.locator('[data-workspace-view="blueprint"]')).toHaveAttribute('aria-current', 'page');
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => {
    const observations = await readGeneration3StatusCohort();
    const selectedSignals = new Set(selectedSignalIds);
    const selectedObservations = observations.filter(
      request => request.signalId !== null && selectedSignals.has(request.signalId),
    );
    return {
      requestCount: observations.length,
      generation3Count: observations.filter(request => request.generation === 3).length,
      selectedCount: selectedObservations.length,
      selectedSignalCount: new Set(selectedObservations.map(request => request.signalId)).size,
      abortedCount: selectedObservations.filter(request => request.aborted).length,
      abortEventCount: selectedObservations.filter(request => request.abortEvents > 0).length,
    };
  }, { message: 'wait for both selected deadline signals to abort before route settlement' }).toEqual({
    requestCount: 2,
    generation3Count: 2,
    selectedCount: 2,
    selectedSignalCount: 2,
    abortedCount: 2,
    abortEventCount: 2,
  });
  const abortedGeneration3StatusCohort = await readGeneration3StatusCohort();
  expect(abortedGeneration3StatusCohort).toHaveLength(2);
  expect(new Set(abortedGeneration3StatusCohort.map(request => request.signalId))).toEqual(new Set(selectedSignalIds));
  expect(abortedGeneration3StatusCohort.every(request => request.aborted && request.abortEvents > 0)).toBe(true);
  expect(pendingFor(3), 'route settlement must follow both derived-signal aborts').toHaveLength(2);
  await settleGeneration(3, ['abort', 'late']);
  await expect(editor).toHaveCount(0);
  expect(routeOutcomes.filter(outcome => outcome.startsWith('3:')).length).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test('SourceEditor keeps the canvas-first surface persistent and edits the exact selected source locally', async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.route('**/api/agent/health-card**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ verdict: 'ready', summary: 'X4 UI builder fixture ready.', rows: [] }),
  }));
  const referenceRoot = 'source-editor-p7-e2e-builder-root';
  const referenceGeneration = 'source-editor-p7-e2e-builder-generation';
  const referenceGeneratedAt = '2026-09-02T00:00:00.000Z';
  await page.route('**/api/reference/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      available: true,
      root: referenceRoot,
      generatedAt: referenceGeneratedAt,
      manifestGeneration: referenceGeneration,
      manifest: {
        available: true,
        state: 'ready',
        root: referenceRoot,
        current: { generation: referenceGeneration, root: referenceRoot, generatedAt: referenceGeneratedAt },
      },
    }),
  }));
  await page.route('**/api/reference/manifest**', async route => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.searchParams.get('q');
    const fileBytes = path === null ? undefined : await (async () => {
      const fileUrl = new URL('/api/reference/file', requestUrl.origin);
      fileUrl.searchParams.set('path', path);
      const fileResponse = await request.get(fileUrl.toString());
      if (!fileResponse.ok()) throw new Error(`SourceEditor builder fixture file request failed: ${fileResponse.status()}`);
      const fileBody = await fileResponse.body();
      const contentLength = Number(fileResponse.headers()['content-length']);
      return Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : fileBody.byteLength;
    })();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: {
          available: true,
          state: 'ready',
          root: referenceRoot,
          current: { generation: referenceGeneration, root: referenceRoot, generatedAt: referenceGeneratedAt },
        },
        generation: referenceGeneration,
        total: path === null ? 0 : 1,
        limit: 500,
        offset: 0,
        files: path === null || fileBytes === undefined ? [] : [{ path, bytes: fileBytes }],
      }),
    });
  });
  await seedServerWorkspace(sourceEditorWorkspace);
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
  await uiDesigner.click();
  await expect(uiDesigner).toHaveAttribute('aria-current', 'page');

  const editor = page.getByTestId('x4-ui-source-editor');
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  await expect(editor).toBeVisible();
  const sourceOption = sourceSelector.locator('option').filter({ hasText: 'ui/x4-ui-source-editor-p7-e2e.lua' }).first();
  await expect(sourceOption).toHaveCount(1);
  const sourceValue = await sourceOption.getAttribute('value');
  if (sourceValue === null) throw new Error('SourceEditor builder fixture source option has no value');
  await sourceSelector.selectOption(sourceValue);
  const targetOption = targetSelector.locator('option').nth(1);
  await expect(targetOption).toHaveCount(1);
  const targetValue = await targetOption.getAttribute('value');
  if (targetValue === null) throw new Error('SourceEditor builder fixture target option has no value');
  await targetSelector.selectOption(targetValue);

  await expect(page.getByTestId('x4-ui-builder-workspace')).toBeVisible();
  await expect(page.getByTestId('x4-ui-builder-canvas-column')).toBeVisible();
  await expect(page.getByTestId('x4-ui-builder-hierarchy')).toBeVisible();
  await expect(page.getByTestId('x4-ui-builder-inspector')).toBeVisible();
  await expect(page.getByTestId('x4-ui-canvas-host')).toBeVisible();
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('x4-ui-canvas-export-compact')).toBeVisible();
  await expect(page.getByTestId('x4-ui-canvas-export')).not.toBeVisible();
  await expect(page.getByTestId('x4-ui-canvas-export-metadata')).not.toBeVisible();
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  await expect(hierarchy.getByRole('treeitem').first()).toBeVisible();
  const textNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Text · P7 E2E source/ });
  await expect(textNode).toHaveCount(1);
  await textNode.click();

  const selection = page.getByTestId('x4-ui-builder-selection');
  const friendlyProperties = selection.getByTestId('x4-ui-source-edits');
  await expect(selection).toBeVisible();
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toBeInViewport();
  const textSelection = page.getByTestId('x4-ui-canvas-selection');
  await expect(textSelection).toBeVisible();
  const textSelectionBox = await textSelection.boundingBox();
  if (textSelectionBox === null) throw new Error('SourceEditor builder fixture text selection has no rendered bounds');
  const textCenter = {
    x: textSelectionBox.x + textSelectionBox.width / 2,
    y: textSelectionBox.y + textSelectionBox.height / 2,
  };
  const frameNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Frame 1/ });
  await expect(frameNode).toHaveCount(1);
  await frameNode.click();
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText('Frame 1');
  await page.mouse.click(textCenter.x, textCenter.y);
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText(/^Text · P7 E2E source$/);
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toBeInViewport();
  await expect(friendlyProperties.getByText('Text', { exact: true }).first()).toBeVisible();
  const zoomMode = page.getByTestId('x4-ui-canvas-zoom-mode');
  await expect(zoomMode).toHaveValue('fit-menu');
  await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText(/^\d+(?:\.\d)?% preview$/);
  const fitSelectionBox = await textSelection.boundingBox();
  if (fitSelectionBox === null || fitSelectionBox.height < 10) throw new Error('Fit-menu preview did not render a readable issued title box');
  const fitMenuScreenshotPath = test.info().outputPath('builder-fit-menu.png');
  await page.screenshot({ path: fitMenuScreenshotPath });
  await test.info().attach('builder-fit-menu', { path: fitMenuScreenshotPath, contentType: 'image/png' });
  const textInput = friendlyProperties.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]').first();
  await expect(textInput).toHaveValue('P7 E2E source');
  const inputTestId = await textInput.getAttribute('data-testid');
  if (inputTestId === null) throw new Error('SourceEditor builder fixture text input has no exact entry id');
  const entryId = inputTestId.replace('x4-ui-source-edit-input-', '');
  const apply = friendlyProperties.getByTestId(`x4-ui-source-edit-apply-${entryId}`);
  await expect(apply).toBeDisabled();

  const previewSettings = page.getByTestId('x4-ui-preview-settings');
  const previewSettingsToggle = page.getByTestId('x4-ui-preview-settings-toggle');
  const profileRegion = page.getByTestId('x4-ui-profile-region');
  await expect(previewSettingsToggle).toBeVisible();
  await expect.poll(() => previewSettings.evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
  await expect(profileRegion).not.toBeVisible();
  const settingsWorkspaceBefore = await readServerWorkspace();
  const settingsCanvasBefore = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared before settings check');
    (window as unknown as { __x4UiSettingsCanvasBefore?: HTMLCanvasElement }).__x4UiSettingsCanvasBefore = canvas;
    return { width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png') };
  });
  await previewSettingsToggle.focus();
  await previewSettingsToggle.press('Enter');
  await expect.poll(() => previewSettings.evaluate(element => (element as HTMLDetailsElement).open)).toBe(true);
  await expect(profileRegion).toBeVisible();
  const profileGeometry = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="x4-ui-source-editor"]');
    const profile = document.querySelector('[data-testid="x4-ui-profile-region"]');
    if (!(editor instanceof HTMLElement) || !(profile instanceof HTMLElement)) throw new Error('SourceEditor profile popover is not measurable');
    const editorBox = editor.getBoundingClientRect();
    const profileBox = profile.getBoundingClientRect();
    const viewportBox = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const controls = Array.from(profile.querySelectorAll('input, select'));
    const within = (child: DOMRect, parent: { left: number; top: number; right: number; bottom: number }): boolean => (
      child.left >= parent.left && child.top >= parent.top && child.right <= parent.right && child.bottom <= parent.bottom
    );
    return {
      controlCount: controls.length,
      profileWithinEditor: within(profileBox, editorBox),
      profileWithinViewport: within(profileBox, viewportBox),
      controlsWithinEditor: controls.every(control => within(control.getBoundingClientRect(), editorBox)),
      controlsWithinViewport: controls.every(control => within(control.getBoundingClientRect(), viewportBox)),
    };
  });
  expect(profileGeometry.controlCount).toBe(5);
  expect(profileGeometry.profileWithinEditor).toBe(true);
  expect(profileGeometry.profileWithinViewport).toBe(true);
  expect(profileGeometry.controlsWithinEditor).toBe(true);
  expect(profileGeometry.controlsWithinViewport).toBe(true);
  await previewSettingsToggle.press('Enter');
  await expect.poll(() => previewSettings.evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
  await expect(profileRegion).not.toBeVisible();
  const settingsCanvasAfter = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    const before = (window as unknown as { __x4UiSettingsCanvasBefore?: HTMLCanvasElement }).__x4UiSettingsCanvasBefore;
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared after settings check');
    return { sameNode: canvas === before, width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png') };
  });
  expect(settingsCanvasAfter.sameNode).toBe(true);
  expect(settingsCanvasAfter.width).toBe(settingsCanvasBefore.width);
  expect(settingsCanvasAfter.height).toBe(settingsCanvasBefore.height);
  expect(settingsCanvasAfter.png).toBe(settingsCanvasBefore.png);
  expect(await readServerWorkspace()).toEqual(settingsWorkspaceBefore);

  const viewport = page.viewportSize();
  expect(viewport).toEqual({ width: 1280, height: 720 });
  const inspectorScrollTopBeforeGeometry = await page.getByTestId('x4-ui-builder-inspector').evaluate(element => (element as HTMLElement).scrollTop);
  expect(inspectorScrollTopBeforeGeometry).toBe(0);
  const editorGeometry = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="x4-ui-source-editor"]');
    const canvasViewport = document.querySelector('[data-testid="x4-ui-canvas-scroll"]');
    const inspector = document.querySelector('[data-testid="x4-ui-builder-inspector"]');
    const input = document.querySelector('[data-testid="x4-ui-builder-selection"] input[type="text"][data-testid^="x4-ui-source-edit-input-"]');
    const applyButton = input?.closest('article')?.querySelector('button[data-testid^="x4-ui-source-edit-apply-"]');
    if (!(editor instanceof HTMLElement) || !(canvasViewport instanceof HTMLElement) || !(inspector instanceof HTMLElement) || !(input instanceof HTMLElement) || !(applyButton instanceof HTMLElement)) {
      throw new Error('SourceEditor selected title control geometry is not measurable');
    }
    const editorBox = editor.getBoundingClientRect();
    const inspectorBox = inspector.getBoundingClientRect();
    const within = (child: DOMRect, parent: DOMRect): boolean => (
      child.left >= parent.left && child.top >= parent.top && child.right <= parent.right && child.bottom <= parent.bottom
    );
    return {
      editorHeight: editorBox.height,
      canvasViewportHeight: canvasViewport.clientHeight,
      canvasViewportWidth: canvasViewport.clientWidth,
      canvasHeightRatio: canvasViewport.clientHeight / editorBox.height,
      titleInputVisibleInInspector: within(input.getBoundingClientRect(), inspectorBox),
      applyVisibleInInspector: within(applyButton.getBoundingClientRect(), inspectorBox),
    };
  });
  expect(editorGeometry.canvasViewportWidth).toBeGreaterThanOrEqual(280);
  expect(editorGeometry.canvasViewportHeight).toBeGreaterThanOrEqual(280);
  expect(editorGeometry.canvasHeightRatio).toBeGreaterThanOrEqual(0.5);
  expect(editorGeometry.titleInputVisibleInInspector).toBe(true);
  expect(editorGeometry.applyVisibleInInspector).toBe(true);
  const compactGeometryArtifactPath = test.info().outputPath('builder-compact-geometry.json');
  await writeFile(compactGeometryArtifactPath, JSON.stringify({ viewport, profileGeometry, editorGeometry: { ...editorGeometry, inspectorScrollTop: inspectorScrollTopBeforeGeometry } }, null, 2), 'utf8');
  await test.info().attach('builder-compact-geometry', { path: compactGeometryArtifactPath, contentType: 'application/json' });

  const beforeWorkspace = await readServerWorkspace() as {
    passthroughFiles?: readonly { path?: unknown; content?: unknown }[];
  };
  const contentAt = (candidate: typeof beforeWorkspace, path: string): string => {
    const file = candidate.passthroughFiles?.find(value => value.path === path);
    if (file === undefined || typeof file.content !== 'string') throw new Error(`missing source-editor fixture file ${path}`);
    return file.content;
  };
  const sourcePath = 'ui/x4-ui-source-editor-p7-e2e.lua';
  const xmlPath = 'ui.xml';
  const sourceBefore = contentAt(beforeWorkspace, sourcePath);
  const xmlBefore = contentAt(beforeWorkspace, xmlPath);
  expect(sourceBefore).toContain('"P7 E2E source"');
  const bitmapBefore = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared before edit');
    return canvas.toDataURL('image/png');
  });
  const canvasGeometryBeforeZoom = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared before zoom');
    (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore = canvas;
    const selection = document.querySelector('[data-testid="x4-ui-canvas-selection"]');
    if (!(selection instanceof HTMLElement)) throw new Error('SourceEditor builder fixture selection disappeared before zoom');
    const canvasBox = canvas.getBoundingClientRect();
    const selectionBox = selection.getBoundingClientRect();
    return {
      width: canvas.width,
      height: canvas.height,
      png: canvas.toDataURL('image/png'),
      nativeCenter: {
        x: (selectionBox.left + selectionBox.width / 2 - canvasBox.left) * canvas.width / canvasBox.width,
        y: (selectionBox.top + selectionBox.height / 2 - canvasBox.top) * canvas.height / canvasBox.height,
      },
    };
  });
  const focusSelection = page.getByRole('button', { name: 'Focus selection', exact: true });
  const focusHistoryBefore = await readB119LuaRoundtripHistory(page);
  const focusProfileBefore = await page.getByTestId('x4-ui-canvas-export-profile').textContent();
  await focusSelection.click();
  await expect(zoomMode).toHaveValue('manual');
  await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText('100% preview');
  const selectionFullyInsideCanvasViewport = async (): Promise<boolean> => page.evaluate(() => {
    const selection = document.querySelector('[data-testid="x4-ui-canvas-selection"]')?.getBoundingClientRect();
    const scroll = document.querySelector('[data-testid="x4-ui-canvas-scroll"]')?.getBoundingClientRect();
    return !!selection && !!scroll && selection.left >= scroll.left && selection.right <= scroll.right
      && selection.top >= scroll.top && selection.bottom <= scroll.bottom;
  });
  await expect.poll(selectionFullyInsideCanvasViewport).toBe(true);
  const focusScroll = page.getByTestId('x4-ui-canvas-scroll');
  const focusedScrollTop = await focusScroll.evaluate(element => element.scrollTop);
  await focusScroll.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => focusScroll.evaluate(element => element.scrollTop)).not.toBe(focusedScrollTop);
  await focusSelection.click();
  await expect.poll(selectionFullyInsideCanvasViewport).toBe(true);
  await page.screenshot({ path: test.info().outputPath('builder-focused.png') });
  const focusViewportBefore = page.viewportSize();
  expect(focusViewportBefore).not.toBeNull();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(focusSelection).toBeInViewport();
  await focusSelection.click();
  await expect.poll(selectionFullyInsideCanvasViewport).toBe(true);
  const focusedBox = await textSelection.boundingBox();
  expect(focusedBox).not.toBeNull();
  expect(focusedBox!.height).toBeGreaterThanOrEqual(10);
  await page.mouse.click(focusedBox!.x + focusedBox!.width / 2, focusedBox!.y + focusedBox!.height / 2);
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText(/^Text · P7 E2E source$/);
  await page.screenshot({ path: test.info().outputPath('builder-focused-1024.png') });
  await page.setViewportSize(focusViewportBefore!);
  expect(await readServerWorkspace()).toEqual(beforeWorkspace);
  expect(await readB119LuaRoundtripHistory(page)).toEqual(focusHistoryBefore);
  expect(await page.getByTestId('x4-ui-canvas-export-profile').textContent()).toEqual(focusProfileBefore);
  const focusedCanvas = await page.getByTestId('x4-ui-canvas-host').locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return { sameNode: canvas === (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore,
      width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png') };
  });
  expect(focusedCanvas).toEqual({ sameNode: true, width: canvasGeometryBeforeZoom.width, height: canvasGeometryBeforeZoom.height, png: canvasGeometryBeforeZoom.png });
  await zoomMode.selectOption('one-to-one');
  await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText(/100% preview/);
  const oneToOneScreenshotPath = test.info().outputPath('builder-one-to-one.png');
  await page.screenshot({ path: oneToOneScreenshotPath });
  await test.info().attach('builder-one-to-one', { path: oneToOneScreenshotPath, contentType: 'image/png' });
  const canvasAfterOneToOne = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared at 100%');
    const before = (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore;
    return { sameNode: canvas === before, width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png') };
  });
  expect(canvasAfterOneToOne.sameNode).toBe(true);
  expect(canvasAfterOneToOne.width).toBe(canvasGeometryBeforeZoom.width);
  expect(canvasAfterOneToOne.height).toBe(canvasGeometryBeforeZoom.height);
  expect(canvasAfterOneToOne.png).toBe(canvasGeometryBeforeZoom.png);
  await page.getByTestId('x4-ui-canvas-zoom-in').click();
  await expect(page.getByTestId('x4-ui-canvas-zoom-mode')).toHaveValue('manual');
  const canvasAfterManualZoom = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared after manual zoom');
    const before = (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore;
    return { sameNode: canvas === before, width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png') };
  });
  expect(canvasAfterManualZoom.sameNode).toBe(true);
  expect(canvasAfterManualZoom.width).toBe(canvasGeometryBeforeZoom.width);
  expect(canvasAfterManualZoom.height).toBe(canvasGeometryBeforeZoom.height);
  expect(canvasAfterManualZoom.png).toBe(canvasGeometryBeforeZoom.png);
  const canvasScroll = page.getByTestId('x4-ui-canvas-scroll');
  const manualScrollPosition = await canvasScroll.evaluate((element, center) => {
    const scroll = element as HTMLElement;
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared while centering the manual zoom click');
    const canvasBox = canvas.getBoundingClientRect();
    const scrollBox = scroll.getBoundingClientRect();
    const scaleX = canvasBox.width / canvas.width;
    const scaleY = canvasBox.height / canvas.height;
    const targetContentX = canvasBox.left - scrollBox.left + scroll.scrollLeft + center.x * scaleX;
    const targetContentY = canvasBox.top - scrollBox.top + scroll.scrollTop + center.y * scaleY;
    const maxLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const panWithinTarget = (target: number, viewport: number, maximum: number, current: number): number => {
      const lower = Math.max(0, target - viewport + 1);
      const upper = Math.min(maximum, target - 1);
      const positiveLower = Math.max(1, lower);
      return upper >= positiveLower ? positiveLower + (upper - positiveLower) / 2 : current;
    };
    scroll.scrollLeft = panWithinTarget(targetContentX, scroll.clientWidth, maxLeft, scroll.scrollLeft);
    scroll.scrollTop = panWithinTarget(targetContentY, scroll.clientHeight, maxTop, scroll.scrollTop);
    return {
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
      maxLeft,
      maxTop,
      targetX: targetContentX - scroll.scrollLeft,
      targetY: targetContentY - scroll.scrollTop,
      targetVisible: targetContentX - scroll.scrollLeft >= 1
        && targetContentX - scroll.scrollLeft <= scroll.clientWidth - 1
        && targetContentY - scroll.scrollTop >= 1
        && targetContentY - scroll.scrollTop <= scroll.clientHeight - 1,
    };
  }, canvasGeometryBeforeZoom.nativeCenter);
  expect(manualScrollPosition.left > 0 || manualScrollPosition.top > 0).toBe(true);
  expect(manualScrollPosition.targetVisible).toBe(true);
  const manualCanvasBox = await page.getByTestId('x4-ui-canvas-host').locator('canvas').boundingBox();
  if (manualCanvasBox === null) throw new Error('SourceEditor builder fixture manual canvas is not measurable after scroll');
  await page.mouse.click(
    manualCanvasBox.x + canvasGeometryBeforeZoom.nativeCenter.x * manualCanvasBox.width / canvasGeometryBeforeZoom.width,
    manualCanvasBox.y + canvasGeometryBeforeZoom.nativeCenter.y * manualCanvasBox.height / canvasGeometryBeforeZoom.height,
  );
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText(/^Text · P7 E2E source$/);
  const manualSelectionBox = await textSelection.boundingBox();
  if (manualSelectionBox === null || manualSelectionBox.height < 10) throw new Error('manual zoom scroll/click did not retain a readable title selection');
  const resizeViewport = page.viewportSize();
  if (resizeViewport !== null) {
    const cameraBeforeResize = await page.evaluate(() => {
      const scroll = document.querySelector('[data-testid="x4-ui-canvas-scroll"]');
      const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
      const zoom = document.querySelector('[data-testid="x4-ui-canvas-zoom-value"]');
      const profile = document.querySelector('[data-testid="x4-ui-canvas-export-profile"]');
      if (!(scroll instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture camera cannot be measured before resize');
      const canvasBox = canvas.getBoundingClientRect();
      const cssScale = { x: canvasBox.width / canvas.width, y: canvasBox.height / canvas.height };
      return {
        viewport: { width: scroll.clientWidth, height: scroll.clientHeight },
        scroll: { left: scroll.scrollLeft, top: scroll.scrollTop },
        cssScale,
        nativeCanvas: { width: canvas.width, height: canvas.height },
        nativeCenter: {
          x: (scroll.scrollLeft + scroll.clientWidth / 2) / cssScale.x,
          y: (scroll.scrollTop + scroll.clientHeight / 2) / cssScale.y,
        },
        zoom: zoom?.textContent ?? '',
        profile: profile?.textContent ?? '',
      };
    });
    await page.setViewportSize({ width: Math.max(900, resizeViewport.width - 120), height: Math.max(640, resizeViewport.height - 80) });
    await expect(zoomMode).toHaveValue('manual');
    const measureCameraAfterResize = async () => page.evaluate(before => {
      const scroll = document.querySelector('[data-testid="x4-ui-canvas-scroll"]');
      const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
      const zoom = document.querySelector('[data-testid="x4-ui-canvas-zoom-value"]');
      const profile = document.querySelector('[data-testid="x4-ui-canvas-export-profile"]');
      if (!(scroll instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture camera cannot be measured after resize');
      const canvasBox = canvas.getBoundingClientRect();
      const cssScale = { x: canvasBox.width / canvas.width, y: canvasBox.height / canvas.height };
      const maxScroll = {
        left: Math.max(0, scroll.scrollWidth - scroll.clientWidth),
        top: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
      };
      const expectedScroll = {
        left: Math.min(maxScroll.left, Math.max(0, before.nativeCenter.x * before.cssScale.x - scroll.clientWidth / 2)),
        top: Math.min(maxScroll.top, Math.max(0, before.nativeCenter.y * before.cssScale.y - scroll.clientHeight / 2)),
      };
      const nativeCenter = {
        x: (scroll.scrollLeft + scroll.clientWidth / 2) / cssScale.x,
        y: (scroll.scrollTop + scroll.clientHeight / 2) / cssScale.y,
      };
      return {
        viewport: { width: scroll.clientWidth, height: scroll.clientHeight },
        scroll: { left: scroll.scrollLeft, top: scroll.scrollTop },
        maxScroll,
        cssScale,
        nativeCanvas: { width: canvas.width, height: canvas.height },
        nativeCenter,
        expectedScroll,
        expectedNativeCenter: {
          x: (expectedScroll.left + scroll.clientWidth / 2) / cssScale.x,
          y: (expectedScroll.top + scroll.clientHeight / 2) / cssScale.y,
        },
        scrollErrorCss: {
          left: Math.abs(scroll.scrollLeft - expectedScroll.left),
          top: Math.abs(scroll.scrollTop - expectedScroll.top),
        },
        zoom: zoom?.textContent ?? '',
        profile: profile?.textContent ?? '',
      };
    }, cameraBeforeResize);
    await expect.poll(async () => {
      const camera = await measureCameraAfterResize();
      return Math.max(camera.scrollErrorCss.left, camera.scrollErrorCss.top);
    }, { timeout: 5_000, message: 'manual resize must preserve the previous native camera center with edge clamping' }).toBeLessThanOrEqual(1);
    const cameraAfterResize = await measureCameraAfterResize();
    const cameraArtifactPath = test.info().outputPath('builder-resize-camera.json');
    await writeFile(cameraArtifactPath, JSON.stringify({ before: cameraBeforeResize, after: cameraAfterResize }), 'utf8');
    await test.info().attach('builder-resize-camera', { path: cameraArtifactPath, contentType: 'application/json' });
    expect(cameraAfterResize.nativeCanvas).toEqual(cameraBeforeResize.nativeCanvas);
    expect(cameraAfterResize.cssScale.x).toBeCloseTo(cameraBeforeResize.cssScale.x, 6);
    expect(cameraAfterResize.cssScale.y).toBeCloseTo(cameraBeforeResize.cssScale.y, 6);
    expect(cameraAfterResize.zoom).toBe(cameraBeforeResize.zoom);
    expect(cameraAfterResize.profile).toBe(cameraBeforeResize.profile);
    expect(Math.abs(cameraAfterResize.nativeCenter.x - cameraAfterResize.expectedNativeCenter.x) * cameraAfterResize.cssScale.x).toBeLessThanOrEqual(1);
    expect(Math.abs(cameraAfterResize.nativeCenter.y - cameraAfterResize.expectedNativeCenter.y) * cameraAfterResize.cssScale.y).toBeLessThanOrEqual(1);
    const canvasAfterResize = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
      const before = (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore;
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared after resize');
      return { sameNode: canvas === before, width: canvas.width, height: canvas.height, png: canvas.toDataURL('image/png') };
    });
    expect(canvasAfterResize.sameNode).toBe(true);
    expect(canvasAfterResize.width).toBe(canvasGeometryBeforeZoom.width);
    expect(canvasAfterResize.height).toBe(canvasGeometryBeforeZoom.height);
    expect(canvasAfterResize.png).toBe(canvasGeometryBeforeZoom.png);
    await page.setViewportSize(resizeViewport);
  }
  await zoomMode.selectOption('fit-menu');
  await expect(textSelection).toBeInViewport();
  const firstEditedTitle = 'P7 E2E edited "quoted" \\ path';
  await textInput.fill(firstEditedTitle);
  await expect(apply).toBeEnabled();
  await apply.click();

  const expectedSource = sourceBefore.replace(JSON.stringify('P7 E2E source'), JSON.stringify(firstEditedTitle));
  expect(expectedSource).not.toBe(sourceBefore);
  await expect.poll(async () => {
    const currentWorkspace = await readServerWorkspace() as typeof beforeWorkspace;
    return contentAt(currentWorkspace, sourcePath);
  }, { timeout: 30_000, message: 'wait for the exact owner-path source edit to reach the ephemeral workspace' }).toBe(expectedSource);
  const afterWorkspace = await readServerWorkspace() as typeof beforeWorkspace;
  expect(contentAt(afterWorkspace, sourcePath)).toBe(expectedSource);
  expect(contentAt(afterWorkspace, xmlPath)).toBe(xmlBefore);
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText(/rendered\/current/);
  const editedTextNode = hierarchy.getByRole('treeitem').filter({ hasText: new RegExp(`^Text · ${firstEditedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  await expect(editedTextNode).toHaveCount(1);
  await expect(page.getByTestId('x4-ui-builder-selection')).toBeVisible();
  const retainedTextInput = page.getByTestId('x4-ui-builder-selection').locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]').first();
  await expect(retainedTextInput).toHaveValue(firstEditedTitle);
  const secondEntryId = await retainedTextInput.getAttribute('data-testid');
  if (secondEntryId === null) throw new Error('retained SourceEditor builder selection has no second exact entry id');
  const secondApply = page.getByTestId('x4-ui-builder-selection').getByTestId(secondEntryId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
  await retainedTextInput.fill('x');
  await expect(secondApply).toBeEnabled();
  await secondApply.click();
  const expectedSecondSource = expectedSource.replace(JSON.stringify(firstEditedTitle), JSON.stringify('x'));
  await expect.poll(async () => {
    const currentWorkspace = await readServerWorkspace() as typeof beforeWorkspace;
    return contentAt(currentWorkspace, sourcePath);
  }, { timeout: 30_000, message: 'wait for the repeated exact owner-path source edit' }).toBe(expectedSecondSource);
  expect(contentAt(await readServerWorkspace() as typeof beforeWorkspace, sourcePath)).toBe(expectedSecondSource);
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText('Text · x');
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toHaveCount(1);
  const bitmapAfter = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('SourceEditor builder fixture canvas disappeared after edit');
    return canvas.toDataURL('image/png');
  });
  expect(bitmapAfter).not.toBe(bitmapBefore);
  const replacedMountedCanvas = await page.evaluate(() => {
    const current = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    const before = (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore;
    return current instanceof HTMLCanvasElement && before !== undefined && current !== before;
  });
  expect(replacedMountedCanvas).toBe(true);
  await expect(page.getByTestId('x4-ui-builder-selection')).toBeVisible();
});

test('SourceEditor edits and clears primary preview inputs without changing Lua or opening Inspect', async ({ page, request }) => {
  // Extend the producer fixture with source-bound Y/tab-order inputs. Known
  // content remains renderable while the second table lacks preview values.
  const previewInputLua = [
    'local menu = { name = "B119PreviewInputs" }',
    'function menu.createFrame()',
    '  local frame = Helper.createFrameHandle(menu, { width = 200, height = 120 })',
    '  local knownTable = frame:addTable(1, { width = 100, scaling = false })',
    '  local knownRow = knownTable:addRow(false, {})',
    '  knownRow[1]:createText("Always visible", {})',
    '  local table = frame:addTable(1, { width = previewWidth, y = previewY, tabOrder = previewTab, scaling = previewScaling })',
    '  local row = table:addRow(false, {})',
    '  row[1]:createText(previewText, {})',
    '  local row2 = table:addRow(false, {})',
    '  row2[1]:createText(previewText, {})',
    '  frame:display()',
    'end',
  ].join('\n');
  const fixture = {
    ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: previewInputLua } : file),
  };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  const sourceBefore = await readServerWorkspace();
  const historyBefore = await readB119LuaRoundtripHistory(page);
  const inspect = page.getByTestId('x4-ui-inspect-panel');
  await expect(inspect).not.toHaveAttribute('open');
  const canvas = page.getByTestId('x4-ui-canvas-host').locator('canvas');
  const initialCanvas = await canvas.elementHandle();
  if (initialCanvas === null) throw new Error('Primary preview fixture has no initial canvas');
  const initialPixels = await readNativeCanvasSignature(page);
  await page.screenshot({ path: test.info().outputPath('b119-primary-preview-inputs-before.png') });
  const toggle = page.getByTestId('x4-ui-preview-inputs-toggle');
  await toggle.focus();
  await toggle.press('Enter');
  const inputs = page.getByTestId('x4-ui-preview-inputs-region');
  await expect(inputs).toBeVisible();
  await expect(inputs).not.toContainText(/previewWidth|previewText|previewScaling|previewY|previewTab|source identity/);
  await expect(canvas).toBeInViewport();
  const width = inputs.getByRole('spinbutton', { name: 'Width', exact: true });
  const positionY = inputs.getByRole('spinbutton', { name: 'Position Y', exact: true });
  const tabOrder = inputs.getByRole('spinbutton', { name: 'Tab order', exact: true });
  const scaling = inputs.getByRole('combobox', { name: 'Scale with UI', exact: true });
  const firstText = inputs.getByRole('textbox', { name: 'Text 1', exact: true });
  const secondText = inputs.getByRole('textbox', { name: 'Text 2', exact: true });
  const apply = inputs.getByRole('button', { name: 'Apply to preview', exact: true });
  const discard = inputs.getByRole('button', { name: 'Discard edits', exact: true });
  const clear = inputs.getByRole('button', { name: 'Clear preview values', exact: true });
  await expect(clear).toBeDisabled();
  await width.fill('100');
  await positionY.fill('30');
  await tabOrder.fill('1');
  await scaling.selectOption('false');
  const longText = 'A realistic long menu message that exercises wrapping.\nA second line for preview.';
  await firstText.fill(longText);
  await secondText.fill('Independent second text');
  await expect(toggle).toContainText('unapplied edits');
  expect(await readNativeCanvasSignature(page)).toEqual(initialPixels);
  expect(await initialCanvas.evaluate(node => node === document.querySelector('[data-testid="x4-ui-canvas-host"] canvas'))).toBe(true);
  await apply.click();
  await expect(inputs.getByTestId('x4-ui-preview-inputs-staged')).toHaveText('No unapplied edits');
  await expect(inputs.getByTestId('x4-ui-preview-inputs-applied')).toContainText('6 values applied');
  await expect(clear).toBeEnabled();
  await expect(discard).toBeDisabled();
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(initialPixels);
  const appliedPixels = await readNativeCanvasSignature(page);
  expect(appliedPixels).not.toEqual(initialPixels);
  await toggle.click();
  await expect(inputs).not.toBeVisible();
  expect(await readNativeCanvasSignature(page)).toEqual(appliedPixels);
  await page.screenshot({ path: test.info().outputPath('b119-primary-preview-inputs-applied.png') });
  await toggle.click();
  await expect(inputs).toBeVisible();
  await firstText.fill('Unapplied replacement');
  await discard.click();
  await expect(firstText).toHaveValue(longText);
  expect(await readNativeCanvasSignature(page)).toEqual(appliedPixels);
  await expect(clear).toBeEnabled(); // No draft: clearing is not draft discard.
  await clear.click();
  await expect(width).toHaveValue('');
  await expect(positionY).toHaveValue('');
  await expect(tabOrder).toHaveValue('');
  await expect(scaling).toHaveValue('');
  await expect(firstText).toHaveValue('');
  await expect(secondText).toHaveValue('');
  await expect(inputs.getByTestId('x4-ui-preview-inputs-applied')).toContainText('0 values applied');
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(initialPixels);
  expect(await readNativeCanvasSignature(page)).toEqual(initialPixels);
  expect(await readServerWorkspace()).toEqual(sourceBefore);
  expect(await readB119LuaRoundtripHistory(page)).toEqual(historyBefore);
  await expect(inspect).not.toHaveAttribute('open');
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
  const screenshotPath = test.info().outputPath('b119-primary-preview-inputs.png');
  await toggle.click();
  await expect(inputs).not.toBeVisible();
  expect(await readNativeCanvasSignature(page)).toEqual(initialPixels);
  await page.screenshot({ path: screenshotPath });
  await test.info().attach('b119-primary-preview-inputs', { path: screenshotPath, contentType: 'image/png' });
});

/** Diagnostic only: precise coverage disables optimization; these are counts, not a latency benchmark. */
async function countB119BrowserAction(page: Page, label: string, action: () => Promise<void>): Promise<void> {
  if (process.env.X4_FORGE_B119_ACTION_COUNTS !== '1') {
    await action();
    return;
  }
  const session = await page.context().newCDPSession(page);
  let coverageStarted = false;
  try {
    await session.send('Profiler.enable');
    const start = await session.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    coverageStarted = true;
    await page.evaluate(() => {
      function b119ExactCallCountControl(value: number): number { return value + 1; }
      let value = 0;
      for (let index = 0; index < 3; index += 1) value = b119ExactCallCountControl(value);
      if (value !== 3) throw new Error('B119 browser call-count control failed');
    });
    try {
      await action();
    } finally {
      const coverage = await session.send('Profiler.takePreciseCoverage');
      const controls = coverage.result.flatMap(script => script.functions)
        .filter(fn => fn.functionName === 'b119ExactCallCountControl');
      const source = coverage.result.filter(script => {
        try {
          const url = new URL(script.url);
          return url.origin === new URL(page.url()).origin && url.pathname.startsWith('/src/');
        } catch { return false; }
      }).map(script => ({ ...script, url: new URL(script.url).pathname }));
      const outputPath = test.info().outputPath(`b119-action-counts-${label}.json`);
      await writeFile(outputPath, JSON.stringify({
        label, runtime: 'Vite development / StrictMode; not production',
        instrumentedNotBenchmark: true, startTimestamp: start.timestamp,
        endTimestamp: coverage.timestamp, controls, source,
      }));
      await test.info().attach(`b119-action-counts-${label}`, { path: outputPath, contentType: 'application/json' });
      expect(controls, 'precise coverage must retain exactly one named control').toHaveLength(1);
      expect(controls[0].ranges, 'three calls must be counted, not merely marked covered').toHaveLength(1);
      expect(controls[0].ranges[0].count).toBe(3);
      expect(source.length, 'same-origin application coverage must not be empty').toBeGreaterThan(0);
    }
  } finally {
    try {
      if (coverageStarted) await session.send('Profiler.stopPreciseCoverage');
      await session.send('Profiler.disable');
    } finally {
      await session.detach();
    }
  }
}

test('SourceEditor keeps scenario B chosen after edit A through source Undo and Redo', async ({ page, request }) => {
  const lua = [
    'local menu = { name = "B119ScenarioHistory" }',
    'function menu.createFrame()',
    ' local frame = Helper.createFrameHandle(menu, { width = 220, height = 140 })',
    ' local knownTable = frame:addTable(1, { width = 200, scaling = false })',
    ' local known = knownTable:addRow(false, {})',
    ' known[1]:createText("Title before", {})',
    ' local t = frame:addTable(1, { width = 200, y = 30, scaling = false })',
    ' local a = t:addRow(false, {})',
    ' a[1]:createText(previewText, {})',
    ' local b = t:addRow(false, {})',
    ' b[1]:createText(previewText, {})',
    ' frame:display()',
    'end',
  ].join('\n');
  const fixture = { ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: lua } : file) };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  const before = await readServerWorkspace() as CreationWorkspace;
  const historyBefore = await readB119LuaRoundtripHistory(page);
  const toggle = page.getByTestId('x4-ui-preview-inputs-toggle');
  await toggle.click();
  const inputs = page.getByTestId('x4-ui-preview-inputs-region');
  const scenarios = page.getByTestId('x4-ui-scenarios');
  const saved = scenarios.getByRole('combobox', { name: 'Saved scenario', exact: true });
  const first = inputs.getByRole('textbox', { name: 'Text 1', exact: true });
  const second = inputs.getByRole('textbox', { name: 'Text 2', exact: true });
  for (const [name, text, other] of [['A', 'Scenario A', 'Independent A'], ['B', 'Scenario B', 'Independent B']]) {
    await first.fill(text); await second.fill(other);
    await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
    await scenarios.getByRole('textbox', { name: 'New scenario name', exact: true }).fill(name);
    await scenarios.getByRole('button', { name: 'Save scenario', exact: true }).click();
    await expect(saved.locator('option:checked')).toHaveText(name);
  }
  await saved.selectOption({ label: 'A' });
  expect(await readB119LuaRoundtripHistory(page)).toEqual(historyBefore);
  await toggle.click();
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  await hierarchy.getByRole('treeitem', { name: /^Text · Title before/ }).click();
  const properties = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  const title = properties.locator('input[aria-label="Text"]').first();
  const titleTestId = await title.getAttribute('data-testid');
  if (titleTestId === null) throw new Error('Scenario history: exact title edit input is missing');
  await title.fill('Title after edit A');
  const expectedAfter = { ...before, passthroughFiles: before.passthroughFiles.map(file => file.content === lua
    ? { ...file, content: lua.replace('"Title before"', '"Title after edit A"') } : file) };
  await countB119BrowserAction(page, 'apply', async () => {
    await properties.getByTestId(titleTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-')).click();
    await expect.poll(() => readServerWorkspace()).toEqual(expectedAfter);
    await expect(hierarchy.getByRole('treeitem', { name: /^Text · Title after edit A/ })).toHaveCount(1);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  });
  await toggle.click();
  await expect(first).toHaveValue('Scenario A');
  await expect(second).toHaveValue('Independent A');
  await expect(saved.locator('option:checked')).toHaveText('A');
  await saved.selectOption({ label: 'B' }); // Choice occurs AFTER source edit A.
  await expect(first).toHaveValue('Scenario B');
  const historyAfter = await readB119LuaRoundtripHistory(page);
  await toggle.click();
  const sampledTable = page.getByRole('treeitem').filter({ has: page.getByText('Table 2', { exact: true }) });
  await expect(sampledTable).toContainText('geometry issued');
  await page.screenshot({ path: test.info().outputPath('scenario-B-after-edit-A.png') });
  const afterPixels = await readNativeCanvasSignature(page);
  for (const [direction, expected, titleText] of [
    ['undo', before, 'Title before'], ['redo', expectedAfter, 'Title after edit A'],
  ] as const) {
    await countB119BrowserAction(page, direction, async () => {
      await page.locator(`[data-global-action="${direction}"]`).click();
      await expect.poll(() => readServerWorkspace()).toEqual(expected);
      await expect(hierarchy.getByRole('treeitem', { name: new RegExp(`^Text · ${titleText}`) })).toHaveCount(1);
      await expect(page.getByTestId('x4-ui-builder-selection').locator('input[aria-label="Text"]').first()).toHaveValue(titleText);
      await expect(sampledTable).toContainText('geometry issued');
      await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    });
    await toggle.click();
    await expect(first).toHaveValue('Scenario B');
    await expect(second).toHaveValue('Independent B');
    await expect(saved.locator('option:checked')).toHaveText('B');
    await toggle.click();
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await page.screenshot({ path: test.info().outputPath(`scenario-B-${direction}.png`) });
  }
  expect(await readNativeCanvasSignature(page)).toEqual(afterPixels);
  expect(await readB119LuaRoundtripHistory(page)).toEqual(historyAfter);
  expect(JSON.stringify(await readServerWorkspace())).not.toContain('Scenario B');
  await toggle.click();
  await saved.selectOption({ label: 'A' });
  await expect(first).toHaveValue('Scenario A'); // Consumed notices cannot keep overwriting a later choice.
  await saved.selectOption({ label: 'B' });
  await expect(first).toHaveValue('Scenario B');
  const scenarioBytes = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
    .filter(key => key.startsWith('x4forge:ui-preview-scenarios:')).map(key => [key, localStorage.getItem(key)])));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreScenarioStorage: () => void }).restoreScenarioStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('x4forge:ui-preview-scenarios:')) throw new DOMException('Test migration quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.locator('[data-global-action="undo"]').click();
  await expect.poll(() => readServerWorkspace()).toEqual(before);
  await expect(first).toHaveValue('Scenario B');
  await expect(second).toHaveValue('Independent B');
  await expect(scenarios.getByRole('alert')).toContainText('Preview retained. Saved scenarios were not updated');
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
    .filter(key => key.startsWith('x4forge:ui-preview-scenarios:')).map(key => [key, localStorage.getItem(key)])))).toEqual(scenarioBytes);
  await scenarios.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('scenario-history-quota.png') });
  await page.evaluate(() => (window as unknown as { restoreScenarioStorage: () => void }).restoreScenarioStorage());
  await page.locator('[data-global-action="redo"]').click();
  await expect.poll(() => readServerWorkspace()).toEqual(expectedAfter);
  await expect(first).toHaveValue('Scenario B');
  await expect(saved.locator('option:checked')).toHaveText('B');
  expect(await readB119LuaRoundtripHistory(page)).toEqual(historyAfter);
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
});

test('SourceEditor moves and inserts rows with independent preview samples', async ({ page, request }) => {
  const upper = ' local title = t:addRow(false, {})\n title[1]:createText("Before", {})\n';
  const lower = ' local other = t:addRow(false, {})\n other[1]:createText("Other known row", {})\n';
  const lua = 'local menu = { name = "StructuralScenario" }\nfunction menu.createFrame()\n'
    + ' local frame = Helper.createFrameHandle(menu, { width = 220, height = 140 })\n'
    + ' local t = frame:addTable(1, { width = 200, scaling = false })\n' + upper + lower
    + ' local last = t:addRow(false, {})\n last[1]:createText("Last known row", {})\n'
    + ' local sampled = frame:addTable(1, { width = 200, y = 70, scaling = false })\n'
    + ' local a = sampled:addRow(false, {})\n a[1]:createText(previewText, {})\n'
    + ' local b = sampled:addRow(false, {})\n b[1]:createText(previewText, {})\n frame:display()\nend';
  const fixture = { ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: lua } : file) };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  const before = await readServerWorkspace() as CreationWorkspace;
  const history = await readB119LuaRoundtripHistory(page);
  const toggle = page.getByTestId('x4-ui-preview-inputs-toggle');
  await toggle.click();
  const inputs = page.getByTestId('x4-ui-preview-inputs-region');
  await inputs.getByRole('textbox', { name: 'Text 1', exact: true }).fill('Scenario B');
  await inputs.getByRole('textbox', { name: 'Text 2', exact: true }).fill('Independent B');
  await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
  await toggle.click();
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  await hierarchy.getByRole('treeitem', { name: /^Row 1/ }).first().click();
  await expect(page.getByTestId('x4-ui-row-controls-move-down')).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('structural-samples-before.png') });
  await page.getByTestId('x4-ui-row-controls-move-down').click();
  const movedLua = lua.replace(upper + lower, lower + upper);
  const expected = { ...before, passthroughFiles: before.passthroughFiles.map(file => file.content === lua ? { ...file, content: movedLua } : file) };
  await expect.poll(() => readServerWorkspace()).toEqual(expected);
  await expect(hierarchy.getByRole('treeitem', { name: /^Text · Scenario B/ })).toHaveCount(1);
  await expect(hierarchy.getByRole('treeitem', { name: /^Text · Independent B/ })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('structural-samples-moved.png') });
  await hierarchy.getByRole('treeitem', { name: /^Row 1/ }).first().click();
  await page.getByTestId('x4-ui-contextual-palette-add-row').click();
  await expect(hierarchy.getByRole('treeitem', { name: /^Row 4/ })).toHaveCount(1);
  await expect(hierarchy.getByRole('treeitem', { name: /^Text · Scenario B/ })).toHaveCount(1);
  await expect(hierarchy.getByRole('treeitem', { name: /^Text · Independent B/ })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('structural-samples-inserted.png') });
  for (const restored of [expected, before]) {
    await page.locator('[data-global-action="undo"]').click();
    await expect.poll(() => readServerWorkspace()).toEqual(restored);
    await expect(hierarchy.getByRole('treeitem', { name: /^Text · Scenario B/ })).toHaveCount(1);
    await expect(hierarchy.getByRole('treeitem', { name: /^Text · Independent B/ })).toHaveCount(1);
  }
  expect((await readB119LuaRoundtripHistory(page)).undo).toEqual(history.undo);
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
});

test('SourceEditor keeps each sampled row bound while moving and adding content', async ({ page, request }) => {
  const upper = ' local a = t:addRow(false, {})\n a[1]:createText(previewText, {})\n';
  const lower = ' local b = t:addRow(false, {})\n b[1]:createText(previewText, {})\n';
  const lua = 'local menu = { name = "SampledRowAuthoring" }\nfunction menu.createFrame()\n'
    + ' local frame = Helper.createFrameHandle(menu, { width = 260, height = 180 })\n'
    + ' local known = frame:addTable(1, { width = 240, scaling = false })\n'
    + ' local title = known:addRow(false, {})\n title[1]:createText("Stable heading", {})\n'
    + ' local t = frame:addTable(1, { width = 240, y = 30, scaling = false })\n'
    + upper + lower + ' frame:display()\nend';
  const fixture = { ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: lua } : file) };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  const original = await readServerWorkspace() as CreationWorkspace;
  const sourcePath = original.passthroughFiles.find(file => file.content === lua)!.path;
  const readLua = async () => (await readServerWorkspace() as CreationWorkspace).passthroughFiles.find(file => file.path === sourcePath)!.content;
  const expectedWorkspace = (content: string) => ({ ...original, passthroughFiles: original.passthroughFiles.map(file => file.path === sourcePath ? { ...file, content } : file) });
  const initialHistory = await readB119LuaRoundtripHistory(page);
  const toggle = page.getByTestId('x4-ui-preview-inputs-toggle');
  const inputs = page.getByTestId('x4-ui-preview-inputs-region');
  const saved = page.getByRole('combobox', { name: 'Saved scenario', exact: true });
  await toggle.click();
  await inputs.getByRole('textbox', { name: 'Text 1', exact: true }).fill('First consumer');
  await inputs.getByRole('textbox', { name: 'Text 2', exact: true }).fill('Second consumer');
  await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
  await page.getByRole('textbox', { name: 'New scenario name', exact: true }).fill('Distinct consumers');
  await page.getByRole('button', { name: 'Save scenario', exact: true }).click();
  await expect(saved.locator('option:checked')).toHaveText('Distinct consumers');
  expect(await readB119LuaRoundtripHistory(page)).toEqual(initialHistory);
  await toggle.click();
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  const order = async () => (await hierarchy.getByRole('treeitem', { name: /^Text · (First|Second) consumer/ }).allTextContents())
    .map(text => text.includes('First consumer') ? 'First consumer' : 'Second consumer');
  const expectPreview = async (values: string[]) => {
    await expect.poll(order).toEqual(values);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await toggle.click();
    await expect(inputs.getByRole('textbox', { name: 'Text 1', exact: true })).toHaveValue(values[0]!);
    await expect(inputs.getByRole('textbox', { name: 'Text 2', exact: true })).toHaveValue(values[1]!);
    await expect(saved.locator('option:checked')).toHaveText('Distinct consumers');
    await toggle.click();
  };
  await expectPreview(['First consumer', 'Second consumer']);
  await hierarchy.getByRole('treeitem', { name: /^Row 1/ }).last().click();
  await expect(page.getByTestId('x4-ui-row-controls-move-down')).toBeEnabled();
  await page.getByTestId('x4-ui-row-controls-move-down').click();
  const movedLua = lua.replace(upper + lower, lower + upper);
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(movedLua));
  await page.screenshot({ path: test.info().outputPath('sampled-rows-move-readback.png') });
  await expectPreview(['Second consumer', 'First consumer']);
  const movedPixels = await readNativeCanvasSignature(page);
  await page.getByTestId('x4-ui-contextual-palette-add-row').click();
  await expect.poll(readLua).not.toBe(movedLua);
  const rowAddedLua = await readLua();
  assertSingleInsertedSourceDelta(movedLua, rowAddedLua, rowInsertionOraclePattern, 'sampled row Add row exact source insertion');
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(rowAddedLua));
  await expectPreview(['Second consumer', 'First consumer']);
  await page.getByTestId('x4-ui-contextual-palette-text').fill('Added visually');
  await page.getByTestId('x4-ui-contextual-palette-add-text').click();
  await expect.poll(readLua).not.toBe(rowAddedLua);
  const withText = await readLua();
  const statement = assertSingleInsertedSourceDelta(rowAddedLua, withText, /:createText\(/, 'sampled row Add text exact source insertion');
  expect(statement).toContain(JSON.stringify('Added visually'));
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(withText));
  await expectPreview(['Second consumer', 'First consumer']);
  await expect(hierarchy.getByRole('treeitem', { name: /^Text · Added visually/ })).toHaveCount(1);
  await expect(page.getByTestId('x4-ui-builder-selection').locator('input[aria-label="Text"]').first()).toHaveValue('Added visually');
  await page.screenshot({ path: test.info().outputPath('sampled-rows-added-text.png') });
  const withTextPixels = await readNativeCanvasSignature(page);
  expect(withTextPixels).not.toEqual(movedPixels);
  const authoredHistory = await readB119LuaRoundtripHistory(page);
  const count = (value: string) => Number(/^\((\d+)\)/.exec(value)![1]);
  expect(count(authoredHistory.undo) - count(initialHistory.undo)).toBe(3);
  for (const [action, content, values] of [
    ['undo', rowAddedLua, ['Second consumer', 'First consumer']],
    ['undo', movedLua, ['Second consumer', 'First consumer']],
    ['undo', lua, ['First consumer', 'Second consumer']],
    ['redo', movedLua, ['Second consumer', 'First consumer']],
    ['redo', rowAddedLua, ['Second consumer', 'First consumer']],
    ['redo', withText, ['Second consumer', 'First consumer']],
  ] as const) {
    await page.locator(`[data-global-action="${action}"]`).click();
    await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(content));
    await expectPreview([...values]);
  }
  expect(await readB119LuaRoundtripHistory(page)).toEqual(authoredHistory);
  expect(await readNativeCanvasSignature(page)).toEqual(withTextPixels);
  await page.screenshot({ path: test.info().outputPath('sampled-rows-redo.png') });
  expect(JSON.stringify(await readServerWorkspace())).not.toMatch(/First consumer|Second consumer|Distinct consumers/);
  const restoredText = page.getByTestId('x4-ui-builder-selection').locator('input[aria-label="Text"]').first();
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText('Text · Added visually');
  await expect(restoredText).toHaveValue('Added visually');
  const restoredInputId = await restoredText.getAttribute('data-testid');
  if (restoredInputId === null) throw new Error('Restored text has no current source entry');
  await restoredText.fill('Continued after Redo');
  await page.getByTestId('x4-ui-builder-selection')
    .getByTestId(restoredInputId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-')).click();
  const continued = withText.replace(JSON.stringify('Added visually'), JSON.stringify('Continued after Redo'));
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(continued));
  await expectPreview(['Second consumer', 'First consumer']);
  await expect(restoredText).toHaveValue('Continued after Redo');
  expect(count((await readB119LuaRoundtripHistory(page)).undo) - count(authoredHistory.undo)).toBe(1);
  expect(await readNativeCanvasSignature(page)).not.toEqual(withTextPixels);
  await page.screenshot({ path: test.info().outputPath('sampled-rows-continued-after-redo.png') });
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
});

test('SourceEditor recovers long multiline preview text and tests wrapping scale and keepouts', async ({ page, request }) => {
  test.setTimeout(120_000);
  const long = 'The station has approved your docking request. Approach the marked landing area and wait for clearance.';
  const message = long + '\n\nReady';
  const lua = 'local menu = { name = "LongMessagePreview" }\nfunction menu.createFrame()\n'
    + ' local frame = Helper.createFrameHandle(menu, { width = 320, height = 260 })\n'
    + ' local known = frame:addTable(1, { width = 280, scaling = false })\n'
    + ' local title = known:addRow(false, {})\n title[1]:createText("Message preview", {})\n'
    + ' local t = frame:addTable(1, { width = 280, y = 30, scaling = false })\n'
    + ' local row = t:addRow(false, {})\n row[1]:createText(previewText, { wordwrap = false })\n'
    + ' frame:display()\nend';
  const fixture = { ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: lua } : file) };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  const before = await readServerWorkspace() as CreationWorkspace;
  const history = await readB119LuaRoundtripHistory(page);
  const toggle = page.getByTestId('x4-ui-preview-inputs-toggle');
  const inputs = page.getByTestId('x4-ui-preview-inputs-region');
  const text = inputs.getByRole('textbox', { name: 'Text', exact: true });
  const table = page.getByRole('treeitem').filter({ has: page.getByText('Table 2', { exact: true }) });
  await expect(table).toContainText('geometry unresolved');
  await toggle.click();
  await text.fill(message);
  await expect(text).toHaveValue(message);
  await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
  await toggle.click();
  await page.screenshot({ path: test.info().outputPath('long-text-no-wrap.png') });
  await expect(table).toContainText('geometry issued');
  await expect(page.getByTestId('x4-ui-builder-hierarchy-list').getByRole('treeitem', { name: /^Text · The station/ })).toHaveCount(1);
  expect(await readServerWorkspace()).toEqual(before);
  expect(await readB119LuaRoundtripHistory(page)).toEqual(history);
  const noWrapPixels = await readNativeCanvasSignature(page);
  await page.getByTestId('x4-ui-builder-hierarchy-list').getByRole('treeitem', { name: /^Text · The station/ }).click();
  const wrapping = page.getByTestId('x4-ui-builder-selection').getByRole('checkbox', { name: 'Wrapping', exact: true });
  await expect(wrapping).toBeEnabled();
  const wrappingId = (await wrapping.getAttribute('data-testid'))!.replace('x4-ui-source-edit-input-', '');
  await wrapping.check();
  await page.getByTestId('x4-ui-builder-selection').getByTestId(`x4-ui-source-edit-apply-${wrappingId}`).click();
  const wrappedWorkspace = { ...before, passthroughFiles: before.passthroughFiles.map(file => file.content === lua
    ? { ...file, content: lua.replace('wordwrap = false', 'wordwrap = true') } : file) };
  await expect.poll(() => readServerWorkspace()).toEqual(wrappedWorkspace);
  await expect(table).toContainText('geometry issued');
  await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(noWrapPixels);
  await page.screenshot({ path: test.info().outputPath('long-text-wrapped.png') });
  const wrappedPixels = await readNativeCanvasSignature(page);
  const wrappedHistory = await readB119LuaRoundtripHistory(page);
  const settings = page.getByTestId('x4-ui-preview-settings-toggle');
  await toggle.click();
  await text.fill('Unapplied\nmessage');
  await toggle.click();
  await settings.click();
  const oldWidth = await page.getByTestId('x4-ui-profile-width').inputValue();
  const oldHeight = await page.getByTestId('x4-ui-profile-height').inputValue();
  const oldScale = await page.getByTestId('x4-ui-profile-user-scale').inputValue();
  await page.getByTestId('x4-ui-profile-width').fill('1920');
  await expect(page.getByTestId('x4-ui-profile-width')).toHaveValue(oldWidth);
  await expect(page.getByTestId('x4-ui-profile-error')).toHaveText('Apply or discard your preview input edits before changing the profile.');
  await page.screenshot({ path: test.info().outputPath('long-text-draft-refusal.png') });
  await settings.click();
  await toggle.click();
  await expect(text).toHaveValue('Unapplied\nmessage');
  await inputs.getByRole('button', { name: 'Discard edits', exact: true }).click();
  await expect(text).toHaveValue(message);
  await toggle.click();
  await settings.click();
  await page.getByTestId('x4-ui-profile-width').fill('1920');
  await page.getByTestId('x4-ui-profile-height').fill('1080');
  await page.getByTestId('x4-ui-profile-user-scale').fill('1');
  await expect(page.getByTestId('x4-ui-profile-width')).toHaveValue('1920');
  await expect(page.getByTestId('x4-ui-profile-height')).toHaveValue('1080');
  await expect(page.getByTestId('x4-ui-profile-user-scale')).toHaveValue('1');
  await expect(page.getByTestId('x4-ui-profile-error')).toHaveCount(0);
  await settings.click();
  await expect(table).toContainText('geometry issued');
  await toggle.click();
  await expect(text).toHaveValue(message);
  await toggle.click();
  await expect.poll(async () => { const pixels = await readNativeCanvasSignature(page); return [pixels.width, pixels.height]; }).toEqual([1920, 1080]);
  await page.screenshot({ path: test.info().outputPath('long-text-1080-scale1.png') });
  const scaledPixels = await readNativeCanvasSignature(page);
  const inspect = page.getByTestId('x4-ui-inspect-toggle');
  const overlayToggle = page.getByTestId('x4-ui-overlay-toggle');
  const overlayPanel = page.getByTestId('x4-ui-overlay-panel');
  await expect(inspect.locator('..')).toHaveJSProperty('open', false);
  await page.getByTestId('x4-ui-canvas-zoom-mode').selectOption('fit-screen');
  let unavailableGuides = 0;
  for (const preset of ['cockpit-conversation', 'map-open', 'fullscreen-menu', 'first-person']) {
    await overlayToggle.click();
    await expect(overlayPanel).toBeVisible();
    await expect(page.getByTestId('x4-ui-overlay-truth')).toHaveText('Advisory only · Not verified in game');
    await page.getByTestId(`x4-ui-keepout-preset-${preset}`).click();
    await expect(page.getByTestId(`x4-ui-keepout-preset-${preset}`)).toHaveAttribute('aria-pressed', 'true');
    unavailableGuides += await overlayPanel.locator('input[type="checkbox"]:disabled').count();
    if (preset === 'cockpit-conversation') {
      await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
      await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(scaledPixels);
      await page.screenshot({ path: test.info().outputPath('game-overlays-toolbar.png') });
      const guide = overlayPanel.locator('input[type="checkbox"]:enabled').first();
      await expect(guide).toBeChecked();
      const withGuides = await readNativeCanvasSignature(page);
      await guide.uncheck();
      await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(withGuides);
      await guide.check();
      await expect.poll(() => readNativeCanvasSignature(page)).toEqual(withGuides);
    }
    await overlayToggle.click();
    await expect(inspect.locator('..')).toHaveJSProperty('open', false);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(scaledPixels);
    await page.screenshot({ path: test.info().outputPath(`long-text-context-${preset}.png`) });
  }
  expect(unavailableGuides, 'unmapped context guides remain unavailable instead of invented').toBeGreaterThan(0);
  await overlayToggle.click(); await page.getByTestId('x4-ui-keepout-off').click(); await overlayToggle.click();
  await expect(overlayToggle).toHaveText('Game overlays · Off');
  await expect(inspect.locator('..')).toHaveJSProperty('open', false);
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(scaledPixels);
  await settings.click();
  await page.getByTestId('x4-ui-profile-width').fill(oldWidth);
  await page.getByTestId('x4-ui-profile-height').fill(oldHeight);
  await page.getByTestId('x4-ui-profile-user-scale').fill(oldScale);
  await settings.click();
  await page.getByTestId('x4-ui-canvas-zoom-mode').selectOption('fit-menu');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(wrappedPixels);
  await toggle.click();
  await inputs.getByRole('button', { name: 'Clear preview values', exact: true }).click();
  await expect(table).toContainText('geometry unresolved');
  await text.fill(message);
  await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
  await toggle.click();
  await expect(table).toContainText('geometry issued');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(wrappedPixels);
  await page.screenshot({ path: test.info().outputPath('long-text-recovered.png') });
  expect(await readServerWorkspace()).toEqual(wrappedWorkspace);
  expect(await readB119LuaRoundtripHistory(page)).toEqual(wrappedHistory);
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
});

test('SourceEditor saves and switches computer-local named preview scenarios', async ({ page, request }) => {
  const lua = [
    'local menu = { name = "B119NamedScenarios" }',
    'function menu.createFrame()',
    ' local frame = Helper.createFrameHandle(menu, { width = 200, height = 120 })',
    ' local knownTable = frame:addTable(1, { width = 180, scaling = false })',
    ' local known = knownTable:addRow(false, {})',
    ' known[1]:createText("Always visible", {})',
    ' local t = frame:addTable(1, { width = 180, y = 30, scaling = false })',
    ' local a = t:addRow(false, {})',
    ' a[1]:createText(previewText, {})',
    ' local b = t:addRow(false, {})',
    ' b[1]:createText(previewText, {})',
    ' frame:display()',
    'end',
  ].join('\n');
  const fixture = { ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: lua } : file) };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  const before = await readServerWorkspace();
  const history = await readB119LuaRoundtripHistory(page);
  const toggle = page.getByTestId('x4-ui-preview-inputs-toggle');
  await toggle.click();
  const inputs = page.getByTestId('x4-ui-preview-inputs-region');
  const scenarios = page.getByTestId('x4-ui-scenarios');
  const name = scenarios.getByRole('textbox', { name: 'New scenario name', exact: true });
  const saved = scenarios.getByRole('combobox', { name: 'Saved scenario', exact: true });
  const save = scenarios.getByRole('button', { name: 'Save scenario', exact: true });
  const first = inputs.getByRole('textbox', { name: 'Text 1', exact: true });
  const second = inputs.getByRole('textbox', { name: 'Text 2', exact: true });
  await first.fill('Short message');
  await second.fill('Independent A');
  await name.fill('Short');
  await expect(save).toBeDisabled();
  await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
  await save.click();
  await expect(scenarios.getByRole('status')).toHaveText('Saved “Short” on this computer.');
  await expect(saved.locator('option:checked')).toHaveText('Short');
  const shortPixels = await readNativeCanvasSignature(page);
  await first.fill('A different message');
  await second.fill('Independent B');
  await expect(saved).toBeDisabled();
  await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
  await name.fill('Alternate');
  await save.click();
  await expect(saved.locator('option:checked')).toHaveText('Alternate');
  await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(shortPixels);
  const alternatePixels = await readNativeCanvasSignature(page);
  const sampledTable = page.getByRole('treeitem').filter({ has: page.getByText('Table 2', { exact: true }) });
  await expect(sampledTable).toHaveCount(1);
  await expect(sampledTable).toContainText('geometry issued');
  await name.fill('alternate');
  await save.click();
  await expect(scenarios.getByRole('alert')).toContainText('already exists');
  await saved.selectOption({ label: 'Short' });
  await expect(first).toHaveValue('Short message');
  await expect(second).toHaveValue('Independent A');
  await expect(sampledTable).toContainText('geometry issued');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(shortPixels);
  await saved.selectOption({ label: 'Alternate' });
  await expect(first).toHaveValue('A different message');
  await expect(second).toHaveValue('Independent B');
  await expect(sampledTable).toContainText('geometry issued');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(alternatePixels);
  await scenarios.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('b119-named-scenarios-alternate.png') });
  await toggle.click();
  await page.screenshot({ path: test.info().outputPath('b119-named-scenarios-alternate-canvas.png') });
  await toggle.click();
  const storedBefore = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('x4forge:ui-preview-scenarios:')).map(key => [key, localStorage.getItem(key)])));
  expect(Object.keys(storedBefore)).toHaveLength(1);
  expect(JSON.stringify(storedBefore)).not.toContain('catalog-authority');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreScenarioStorage: () => void }).restoreScenarioStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('x4forge:ui-preview-scenarios:')) throw new DOMException('Test quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await name.fill('Not saved');
  await save.click();
  await expect(scenarios.getByRole('alert')).toContainText('Not saved: local storage is full or unavailable');
  expect(await readNativeCanvasSignature(page)).toEqual(alternatePixels);
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('x4forge:ui-preview-scenarios:')).map(key => [key, localStorage.getItem(key)])))).toEqual(storedBefore);
  await page.screenshot({ path: test.info().outputPath('b119-named-scenarios-quota.png') });
  await page.evaluate(() => (window as unknown as { restoreScenarioStorage: () => void }).restoreScenarioStorage());
  expect(await readServerWorkspace()).toEqual(before);
  expect(await readB119LuaRoundtripHistory(page)).toEqual(history);
  await page.reload();
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await page.locator('[data-workspace-view="ui-designer"]').click();
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const sourceValue = await sourceSelector.locator('option').filter({ hasText: 'ui/x4-ui-source-editor-b119-property-recovery-e2e.lua' }).first().getAttribute('value');
  if (!sourceValue) throw new Error('Named scenario reload source unavailable');
  await sourceSelector.selectOption(sourceValue);
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  await targetSelector.selectOption({ label: 'menu.createFrame' });
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await toggle.click();
  await expect(saved.locator('option')).toHaveCount(3);
  await saved.selectOption({ label: 'Short' });
  await expect(first).toHaveValue('Short message');
  await expect(second).toHaveValue('Independent A');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(shortPixels);
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
  await scenarios.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('b119-named-scenarios-reloaded.png') });
  await scenarios.getByRole('button', { name: 'Remove saved scenario', exact: true }).click();
  await expect(saved.locator('option')).toHaveCount(2);
  await expect(first).toHaveValue('Short message');
  // A prior source revision is unavailable for apply, but must remain removable
  // so bounded storage can recover without clearing unrelated browser data.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(value => value.startsWith('x4forge:ui-preview-scenarios:'));
    if (!key) throw new Error('Scenario fixture storage disappeared');
    const value = JSON.parse(localStorage.getItem(key)!);
    value.scenarios[0].sourceKey += '-older-revision';
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
  });
  await expect(saved.locator('option')).toHaveCount(1);
  await scenarios.getByText('Manage saved scenarios (1/20)', { exact: true }).click();
  await expect(scenarios).toContainText('Other menu or older revision — cannot apply here');
  await scenarios.getByRole('button', { name: 'Remove Alternate', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('b119-named-scenarios-stale-management.png') });
  await scenarios.getByRole('button', { name: 'Remove Alternate', exact: true }).click();
  await expect(scenarios.getByText('Manage saved scenarios (1/20)', { exact: true })).toHaveCount(0);
  await expect(first).toHaveValue('Short message');
  expect(await readServerWorkspace()).toEqual(before);
});

test('SourceEditor adds missing text properties through the canvas builder and undo redo', async ({ page, request }) => {
  const lua = ['-- Preserve this file and unrelated sibling bytes.', 'local menu = { name = "B119MissingProperties" }',
    'function menu.createFrame()',
    ' local frame = Helper.createFrameHandle(menu, { width = 400, height = 180 })',
    ' local t = frame:addTable(2, { width = 340, scaling = false })',
    ' local row = t:addRow(false, {})', ' row[1]:createText("Unchanged sibling", {})',
    ' frame:display()', 'end'].join('\n');
  const fixture = { ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: lua } : file) };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  const before = await readServerWorkspace() as CreationWorkspace;
  const expectedWorkspace = (source: string) => ({ ...before, passthroughFiles: before.passthroughFiles.map(file => file.content === lua ? { ...file, content: source } : file) });
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  await hierarchy.getByRole('treeitem').filter({ hasText: /^Cell 2/ }).click();
  await page.getByTestId('x4-ui-contextual-palette-text').fill('Property sample');
  await page.getByTestId('x4-ui-contextual-palette-add-text').click();
  const plain = lua.replace(' frame:display()', ' row[2]:createText("Property sample", {})\n frame:display()');
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(plain));
  // Selection continuity must work from the actual Add Text flow; do not reselect it for the test.
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toContainText('Property sample');
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await page.screenshot({ path: test.info().outputPath('text-properties-plain.png') });
  // Interior of the unchanged first cell in this 340px/two-column fixture.
  // Excludes row/column borders, whose extents legitimately change with row height.
  const siblingRegion = { x: 2, y: 1, width: 160, height: 14 };
  const siblingPixels = await readNativeCanvasSignature(page, siblingRegion);
  expect(siblingPixels.nonTransparentPixels).toBeGreaterThan(0);
  const selection = page.getByTestId('x4-ui-builder-selection');
  const additions = selection.getByTestId('x4-ui-add-text-property');
  const properties = selection.getByTestId('x4-ui-source-edits');
  const inspect = page.getByTestId('x4-ui-inspect-panel');
  const snapshots = [plain];
  const pixels = [await readNativeCanvasSignature(page)];
  let current = plain;
  for (const step of [
    { label: 'Alignment', value: 'right', literal: 'halign = "right"', select: true },
    { label: 'Font size', value: '20', literal: 'fontsize = 20', select: false },
  ]) {
    await expect(inspect).toHaveJSProperty('open', false);
    await additions.getByRole('combobox', { name: 'Property', exact: true }).selectOption({ label: step.label });
    await expect(additions.getByRole('button', { name: 'Add property', exact: true })).toBeDisabled();
    const historyBefore = await readB119LuaRoundtripHistory(page);
    const control = additions.getByRole(step.select ? 'combobox' : 'spinbutton', { name: step.label, exact: true });
    if (step.select) await control.selectOption(step.value); else await control.fill(step.value);
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    expect(await readServerWorkspace()).toEqual(expectedWorkspace(current));
    expect(await readB119LuaRoundtripHistory(page)).toEqual(historyBefore);
    await page.screenshot({ path: test.info().outputPath(`text-properties-adding-${step.label.toLowerCase().replaceAll(' ', '-')}.png`) });
    const addButton = additions.getByRole('button', { name: 'Add property', exact: true });
    await addButton.scrollIntoViewIfNeeded();
    const inspector = page.getByTestId('x4-ui-builder-inspector');
    const scrollBeforeAdd = await inspector.evaluate(element => element.scrollTop);
    expect(scrollBeforeAdd).toBeGreaterThan(0);
    await addButton.click();
    current = current.replace('row[2]:createText("Property sample", {', `row[2]:createText("Property sample", { ${step.literal}, `);
    await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(current));
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect(properties.getByRole(step.select ? 'combobox' : 'spinbutton', { name: step.label, exact: true })).toHaveValue(step.value);
    await expect(additions.getByRole('combobox', { name: 'Property', exact: true }).locator('option').filter({ hasText: new RegExp(`^${step.label}$`) })).toHaveCount(0);
    await expect.poll(() => inspector.evaluate((element, previous) => element.scrollTop
      - Math.min(previous, Math.max(0, element.scrollHeight - element.clientHeight)), scrollBeforeAdd)).toBe(0);
    console.log('B119_ADDED_PROPERTY_SCROLL', JSON.stringify({ property: step.label, before: scrollBeforeAdd,
      after: await inspector.evaluate(element => element.scrollTop) }));
    await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(pixels[pixels.length - 1]);
    snapshots.push(current); pixels.push(await readNativeCanvasSignature(page));
    expect(await readNativeCanvasSignature(page, siblingRegion)).toEqual(siblingPixels);
    await page.screenshot({ path: test.info().outputPath(`text-properties-after-${step.label.toLowerCase().replaceAll(' ', '-')}.png`) });
  }
  const fontSize = properties.getByRole('spinbutton', { name: 'Font size', exact: true });
  await fontSize.fill('24');
  const inputId = await fontSize.getAttribute('data-testid');
  if (!inputId) throw new Error('Added font size has no existing scalar control');
  await properties.getByTestId(inputId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-')).click();
  current = current.replace('fontsize = 20', 'fontsize = 24');
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(current));
  await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(pixels[pixels.length - 1]);
  snapshots.push(current); pixels.push(await readNativeCanvasSignature(page));
  expect(await readNativeCanvasSignature(page, siblingRegion)).toEqual(siblingPixels);
  const afterHistory = await readB119LuaRoundtripHistory(page);
  for (const index of [2, 1, 0]) {
    await page.locator('[data-global-action="undo"]').click();
    await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(snapshots[index]));
    await expect.poll(() => readNativeCanvasSignature(page)).toEqual(pixels[index]);
    await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toContainText('Property sample');
  }
  for (const index of [1, 2, 3]) {
    await page.locator('[data-global-action="redo"]').click();
    await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(snapshots[index]));
    await expect.poll(() => readNativeCanvasSignature(page)).toEqual(pixels[index]);
  }
  expect(await readB119LuaRoundtripHistory(page)).toEqual(afterHistory);
  await expect(inspect).toHaveJSProperty('open', false);
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
  await fontSize.scrollIntoViewIfNeeded();
  await expect(fontSize).toBeInViewport();
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('added-text-properties-redo.png') });
});

test('SourceEditor edits existing width spacing and alignment without Lua or Inspect', async ({ page, request }) => {
  const lua = [
    '-- Keep this unrelated comment and function byte-for-byte.',
    'local menu = { name = "B119LayoutControls" }',
    'local function untouched() return "alignment is not source code input" end',
    'function menu.createFrame()',
    ' local frame = Helper.createFrameHandle(menu, { width = 260, height = 140 })',
    ' local t = frame:addTable(1, { width = 180, scaling = false })',
    ' local row = t:addRow(false, { paddingTop = 0, paddingBottom = 0, scaling = false })',
    ' row[1]:createText("Layout sample", { halign = "left", fontsize = 14, scaling = false })',
    ' local other = t:addRow(false, {})',
    ' other[1]:createText("Unchanged sibling", {})',
    ' frame:display()',
    'end',
  ].join('\n');
  const fixture = { ...b119PropertyRecoveryWorkspace,
    passthroughFiles: b119PropertyRecoveryWorkspace.passthroughFiles.map(file => file.path.endsWith('.lua') ? { ...file, content: lua } : file) };
  await setupB119PropertyRecoveryFixture(page, request, fixture);
  const before = await readServerWorkspace() as CreationWorkspace;
  const expectedWorkspace = (source: string) => ({ ...before, passthroughFiles: before.passthroughFiles.map(file => file.content === lua
    ? { ...file, content: source } : file) });
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  const properties = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  const inspect = page.getByTestId('x4-ui-inspect-panel');
  let expectedLua = lua;
  let spacingPixels: Awaited<ReturnType<typeof readNativeCanvasSignature>> | undefined;
  for (const step of [
    { node: 'Table 1', label: 'Width', value: '220', old: 'width = 180', next: 'width = 220', select: false },
    { node: 'Row 1', label: 'Top padding', value: '12', old: 'paddingTop = 0', next: 'paddingTop = 12', select: false },
    { node: 'Text · Layout sample', label: 'Alignment', value: 'right', old: 'halign = "left"', next: 'halign = "right"', select: true },
  ]) {
    await hierarchy.getByRole('treeitem').filter({ has: page.getByText(step.node, { exact: true }) }).click();
    await expect(inspect).toHaveJSProperty('open', false);
    const control = properties.getByRole(step.select ? 'combobox' : 'spinbutton', { name: step.label, exact: true });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    const entryTestId = await control.getAttribute('data-testid');
    if (entryTestId === null) throw new Error(`Missing issued ${step.label} control`);
    const historyBefore = await readB119LuaRoundtripHistory(page);
    const pixelsBefore = await readNativeCanvasSignature(page);
    if (step.select) {
      await expect(control.locator('option')).toHaveText(['Left', 'Center', 'Right']);
      await control.selectOption({ label: 'Right' });
    } else await control.fill(step.value);
    expect(await readServerWorkspace()).toEqual(expectedWorkspace(expectedLua));
    expect(await readB119LuaRoundtripHistory(page)).toEqual(historyBefore);
    const inspector = page.getByTestId('x4-ui-builder-inspector');
    const applyButton = properties.getByTestId(entryTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
    await applyButton.scrollIntoViewIfNeeded();
    const scrollBeforeApply = await inspector.evaluate(element => element.scrollTop);
    await applyButton.click();
    expect(expectedLua).toContain(step.old);
    expectedLua = expectedLua.replace(step.old, step.next);
    await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(expectedLua));
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect(control).toHaveValue(step.value);
    console.log('B119_LAYOUT_PROPERTY_SCROLL', JSON.stringify({ property: step.label, before: scrollBeforeApply, after: await inspector.evaluate(element => element.scrollTop) }));
    if (step.label === 'Alignment') expect(scrollBeforeApply).toBeGreaterThan(100);
    await expect.poll(() => inspector.evaluate(element => element.scrollTop)).toBe(scrollBeforeApply);
    await expect(control).toBeInViewport();
    await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(pixelsBefore);
    await expect(inspect).toHaveJSProperty('open', false);
    await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`layout-${step.label.toLowerCase().replaceAll(' ', '-')}.png`) });
    if (step.label === 'Top padding') spacingPixels = await readNativeCanvasSignature(page);
  }
  expect(spacingPixels).toBeDefined();
  const alignedPixels = await readNativeCanvasSignature(page);
  const afterHistory = await readB119LuaRoundtripHistory(page);
  await page.locator('[data-global-action="undo"]').click();
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(expectedLua.replace('halign = "right"', 'halign = "left"')));
  await expect(properties.getByRole('combobox', { name: 'Alignment', exact: true })).toHaveValue('left');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(spacingPixels);
  await page.locator('[data-global-action="redo"]').click();
  await expect.poll(() => readServerWorkspace()).toEqual(expectedWorkspace(expectedLua));
  await expect(properties.getByRole('combobox', { name: 'Alignment', exact: true })).toHaveValue('right');
  await expect.poll(() => readNativeCanvasSignature(page)).toEqual(alignedPixels);
  expect(await readB119LuaRoundtripHistory(page)).toEqual(afterHistory);
  await expect(inspect).toHaveJSProperty('open', false);
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
  const alignment = properties.getByRole('combobox', { name: 'Alignment', exact: true });
  await alignment.scrollIntoViewIfNeeded();
  await expect(alignment).toBeInViewport();
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('layout-alignment-redo.png') });
});

test('SourceEditor presents source-issued selected properties and routes locked recovery to scoped Inspect', async ({ page, request }) => {
  await setupB119PropertyRecoveryFixture(page, request);
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });

  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  const selection = page.getByTestId('x4-ui-builder-selection');
  const selectedNodeLabel = page.getByTestId('x4-ui-builder-selected-node-label');
  const canvas = page.getByTestId('x4-ui-canvas-host').locator('canvas');
  await expect(canvas).toBeVisible();

  // These selectors are derived from the exact producer-issued function target,
  // cell owner, and widget kind above; hierarchy order and display text are not
  // used as source identity.
  const buttonNode = hierarchy.getByTestId(b119SourceIssuedWidgetSelectors.button.testId);
  await expect(buttonNode).toHaveCount(1);
  await buttonNode.click();
  await expect(selectedNodeLabel).toHaveText('Widget · Press');
  const selectedNodeText = await selectedNodeLabel.textContent();
  if (selectedNodeText === null) throw new Error('B119 property recovery selection label was not rendered');

  const friendly = selection.getByTestId('x4-ui-source-edits');
  await expect(friendly).toBeVisible();
  await expect(friendly).toContainText('Secondary text');
  await expect(friendly).toContainText('Technical source bindings remain available under Inspect.');
  await expect(friendly).toContainText('1 source setting is not modeled by the preview; the original record remains under Inspect.');

  const joinedFontSizeCard = friendly.locator('article').filter({
    hasText: 'Font size belongs to a source operation the preview did not apply; inspect the exact details.',
  }).first();
  await expect(joinedFontSizeCard).toHaveCount(1);
  await joinedFontSizeCard.getByText('Technical source details', { exact: true }).click();
  await expect(joinedFontSizeCard).toContainText('semantics.fontsize,semantics.properties.fontsize');

  const unknownCard = friendly.locator('article').filter({
    hasText: 'Source property · mystery-key belongs to a source operation the preview did not apply; inspect the exact details.',
  }).first();
  await expect(unknownCard).toHaveCount(1);
  const unknownLockReason = unknownCard.locator('[data-testid^="x4-ui-source-edit-lock-reason-"]');
  await expect(unknownLockReason).toContainText('Source property · mystery-key belongs to a source operation the preview did not apply; inspect the exact details.');
  await expect(unknownLockReason).not.toContainText(/owner|source authority|call-site literal/i);
  await expect(unknownCard.locator('input')).toHaveCount(0);
  await unknownCard.getByText('Technical source details', { exact: true }).click();
  await expect(unknownCard).toContainText('semantics.unsupportedProperties.mystery-key');

  const inspectPanel = page.getByTestId('x4-ui-inspect-panel');
  const inspectTargetId = await inspectPanel.getAttribute('id');
  if (inspectTargetId === null || !/^x4-ui-inspect-panel-[A-Za-z0-9_-]+$/.test(inspectTargetId)) {
    throw new Error(`B119 property recovery Inspect target is not a unique scoped id: ${String(inspectTargetId)}`);
  }
  const openInspect = friendly.getByTestId('x4-ui-builder-open-inspect-properties');
  await expect(openInspect).toHaveCount(1);
  await expect(openInspect).toHaveAttribute('aria-controls', inspectTargetId);

  const sourceBeforeInspect = await readServerWorkspace();
  const canvasBeforeInspectHandle = await canvas.elementHandle();
  if (canvasBeforeInspectHandle === null) throw new Error('B119 property recovery canvas has no mounted element before Inspect');
  const canvasBoxBeforeInspect = await canvas.boundingBox();
  if (canvasBoxBeforeInspect === null || canvasBoxBeforeInspect.width <= 0 || canvasBoxBeforeInspect.height <= 0) {
    throw new Error('B119 property recovery canvas has no visible box before Inspect');
  }
  await expect(canvas).toBeInViewport();
  const canvasBeforeInspect = await readNativeCanvasSignature(page);
  const selectedSourceBeforeInspect = await sourceSelector.inputValue();
  const selectedTargetBeforeInspect = await targetSelector.inputValue();
  const inspectorPane = page.getByTestId('x4-ui-builder-inspector');
  await inspectorPane.evaluate(element => {
    const pane = element as HTMLElement;
    pane.scrollTop = Math.min(24, Math.max(0, pane.scrollHeight - pane.clientHeight));
  });

  await openInspect.focus();
  await page.keyboard.press('Tab');
  const tabFocusTestId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  expect(tabFocusTestId).not.toBeNull();
  expect(tabFocusTestId).not.toBe('x4-ui-builder-open-inspect-properties');
  await page.keyboard.press('Shift+Tab');
  await expect(openInspect).toBeFocused();
  const paneScrollBeforeInspect = await inspectorPane.evaluate(element => {
    const pane = element as HTMLElement;
    return { top: pane.scrollTop, left: pane.scrollLeft };
  });

  await openInspect.press('Enter');
  await expect(inspectPanel).toHaveAttribute('open', '');
  await expect(page.getByTestId('x4-ui-inspect-toggle')).toBeFocused();
  const paneScrollAfterInspect = await inspectorPane.evaluate(element => {
    const pane = element as HTMLElement;
    return { top: pane.scrollTop, left: pane.scrollLeft };
  });
  expect(paneScrollAfterInspect).toEqual(paneScrollBeforeInspect);
  const inspectJoinedFontSizeRecord = inspectPanel.locator('article').filter({
    hasText: 'semantics.fontsize,semantics.properties.fontsize',
  }).first();
  await expect(inspectJoinedFontSizeRecord).toHaveCount(1);
  const inspectJoinedFontSizeTechnical = inspectJoinedFontSizeRecord.locator('details[data-testid^="x4-ui-source-edit-technical-"]');
  await inspectJoinedFontSizeTechnical.getByText('Technical source details', { exact: true }).click();
  await expect(inspectJoinedFontSizeTechnical).toHaveAttribute('open', '');
  await expect(inspectJoinedFontSizeTechnical.locator('span').filter({ hasText: 'setText · semantics.fontsize,semantics.properties.fontsize · operation' }).first()).toBeVisible();
  await expect(inspectJoinedFontSizeTechnical.getByText(/operation-not-applied/).first()).toBeVisible();
  await expect(inspectJoinedFontSizeTechnical).toContainText('semantics.fontsize,semantics.properties.fontsize');
  await expect(inspectJoinedFontSizeTechnical).toContainText('operation-not-applied');
  const inspectUnknownRecord = inspectPanel.locator('article').filter({
    hasText: 'semantics.unsupportedProperties.mystery-key',
  }).first();
  await expect(inspectUnknownRecord).toHaveCount(1);
  const inspectUnknownTechnical = inspectUnknownRecord.locator('details[data-testid^="x4-ui-source-edit-technical-"]');
  await inspectUnknownTechnical.getByText('Technical source details', { exact: true }).click();
  await expect(inspectUnknownTechnical).toHaveAttribute('open', '');
  await expect(inspectUnknownTechnical.locator('span').filter({ hasText: 'setText · semantics.unsupportedProperties.mystery-key · operation' }).first()).toBeVisible();
  await expect(inspectUnknownTechnical.getByText(/operation-not-applied/).first()).toBeVisible();
  await expect(inspectUnknownTechnical).toContainText('semantics.unsupportedProperties.mystery-key');
  await expect(inspectUnknownTechnical).toContainText('operation-not-applied');
  const recoveryScreenshotPath = test.info().outputPath('b119-property-recovery-inspect.png');
  await page.screenshot({ path: recoveryScreenshotPath });
  await test.info().attach('b119-property-recovery-inspect', { path: recoveryScreenshotPath, contentType: 'image/png' });
  const canvasAfterInspectHandle = await canvas.elementHandle();
  if (canvasAfterInspectHandle === null) throw new Error('B119 property recovery canvas disappeared after Inspect');
  const sameMountedCanvas = await canvasAfterInspectHandle.evaluate((current, previous) => current === previous, canvasBeforeInspectHandle);
  expect(sameMountedCanvas).toBe(true);
  const canvasBoxAfterInspect = await canvas.boundingBox();
  if (canvasBoxAfterInspect === null || canvasBoxAfterInspect.width <= 0 || canvasBoxAfterInspect.height <= 0) {
    throw new Error('B119 property recovery canvas has no visible box after Inspect');
  }
  expect(canvasBoxAfterInspect).toEqual(canvasBoxBeforeInspect);
  await expect(canvas).toBeInViewport();
  expect(await readNativeCanvasSignature(page)).toEqual(canvasBeforeInspect);
  expect(await readServerWorkspace()).toEqual(sourceBeforeInspect);
  await expect(sourceSelector).toHaveValue(selectedSourceBeforeInspect);
  await expect(targetSelector).toHaveValue(selectedTargetBeforeInspect);
  await expect(selectedNodeLabel).toHaveText(selectedNodeText);

  const titleWidgetNode = hierarchy.getByTestId(b119SourceIssuedWidgetSelectors.title.widgetTestId);
  await expect(titleWidgetNode).toHaveCount(1);
  const titleNode = hierarchy.getByTestId(b119SourceIssuedWidgetSelectors.title.testId);
  await expect(titleNode).toHaveCount(1);
  await titleNode.click();
  const titleFriendly = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  const titleInput = titleFriendly.locator('input[aria-label="Text"]').first();
  await expect(titleInput).toHaveValue('Title');
  const titleInputTestId = await titleInput.getAttribute('data-testid');
  if (titleInputTestId === null) throw new Error('B119 title property lost its exact source entry identity');
  const titleApply = titleFriendly.getByTestId(titleInputTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
  await expect(titleApply).toBeDisabled();

  const sourcePathText = await sourceSelector.locator('option:checked').textContent();
  if (sourcePathText === null || sourcePathText.trim().length === 0) throw new Error('B119 property recovery source selection has no path text');
  const sourcePath = sourcePathText.trim();
  const sourceContentAt = (workspace: CreationWorkspace): string => {
    const file = workspace.passthroughFiles.find(candidate => candidate.path === sourcePath);
    if (file === undefined) throw new Error(`B119 property recovery source ${sourcePath} disappeared from the workspace`);
    return file.content;
  };
  const editedTitle = 'B119 recovered title';
  const beforeTitleEditWorkspace = await readServerWorkspace() as CreationWorkspace;
  const beforeTitleEditSource = sourceContentAt(beforeTitleEditWorkspace);
  const expectedEditedSource = beforeTitleEditSource.replace(JSON.stringify('Title'), JSON.stringify(editedTitle));
  assertSingleLiteralSourceReplacement(
    beforeTitleEditSource,
    expectedEditedSource,
    'Title',
    editedTitle,
    'B119 recovered title edit must replace one exact source literal',
  );
  const unrelatedBeforeTitleEdit = beforeTitleEditWorkspace.passthroughFiles.filter(file => file.path !== sourcePath);
  await titleInput.fill(editedTitle);
  await expect(titleApply).toBeEnabled();
  await titleApply.click();
  await expect.poll(async () => sourceContentAt(await readServerWorkspace() as CreationWorkspace), {
    timeout: 30_000,
    message: 'wait for the acknowledged B119 recovered editable property change',
  }).toBe(expectedEditedSource);
  const afterTitleEditWorkspace = await readServerWorkspace() as CreationWorkspace;
  expect(afterTitleEditWorkspace.passthroughFiles.filter(file => file.path !== sourcePath)).toEqual(unrelatedBeforeTitleEdit);
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await expect(selectedNodeLabel).toHaveText(`Text · ${editedTitle}`);
  await expect(titleInput).toHaveValue(editedTitle);

  const undoButton = page.locator('[data-global-action="undo"]');
  const redoButton = page.locator('[data-global-action="redo"]');
  const canvasBeforeUndo = await canvas.elementHandle();
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect.poll(async () => sourceContentAt(await readServerWorkspace() as CreationWorkspace), {
    timeout: 30_000,
    message: 'wait for B119 recovered property undo',
  }).toBe(beforeTitleEditSource);
  if (canvasBeforeUndo === null) throw new Error('B119 recovered property undo has no prior canvas handle');
  await assertFreshNativeCanvas(page, canvasBeforeUndo, 'B119 recovered property undo');
  const afterUndoWorkspace = await readServerWorkspace() as CreationWorkspace;
  expect(afterUndoWorkspace.passthroughFiles.filter(file => file.path !== sourcePath)).toEqual(unrelatedBeforeTitleEdit);
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText('Text · Title');

  const canvasBeforeRedo = await canvas.elementHandle();
  await expect(redoButton).toBeEnabled();
  await redoButton.click();
  await expect.poll(async () => sourceContentAt(await readServerWorkspace() as CreationWorkspace), {
    timeout: 30_000,
    message: 'wait for B119 recovered property redo',
  }).toBe(expectedEditedSource);
  if (canvasBeforeRedo === null) throw new Error('B119 recovered property redo has no prior canvas handle');
  await assertFreshNativeCanvas(page, canvasBeforeRedo, 'B119 recovered property redo');
  const afterRedoWorkspace = await readServerWorkspace() as ModWorkspace;
  expect(afterRedoWorkspace.passthroughFiles.filter(file => file.path !== sourcePath)).toEqual(unrelatedBeforeTitleEdit);
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText(`Text · ${editedTitle}`);

  // Source offsets changed with the title literal. Reissue exact node selectors
  // from the actual restored bytes, never from pre-edit IDs or hierarchy order.
  const restoredSelectors = buildB119SourceIssuedWidgetSelectors(afterRedoWorkspace);
  expect(restoredSelectors.dynamic.testId).not.toBe(b119SourceIssuedWidgetSelectors.dynamic.testId);
  await inspectorPane.evaluate(element => { element.scrollTop = 0; });
  const restoredScreenshotPath = test.info().outputPath('b119-history-restored-inspector.png');
  await page.screenshot({ path: restoredScreenshotPath });
  await test.info().attach('b119-history-restored-inspector', { path: restoredScreenshotPath, contentType: 'image/png' });

  const inputNode = hierarchy.getByTestId(restoredSelectors.input.testId);
  await expect(inputNode).toHaveCount(1);
  await inputNode.click();
  const inputFriendly = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  await expect(inputFriendly).toContainText('Default text');
  await expect(inputFriendly).toContainText('Description');
  await expect(inputFriendly).toContainText('Maximum characters');

  const tableNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Table 1/ }).first();
  await expect(tableNode).toHaveCount(1);
  await tableNode.click();
  const tableFriendly = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  await expect(tableFriendly).toContainText('Columns');
  await expect(tableFriendly).toContainText('Width');

  const rowNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Row 1/ }).first();
  await expect(rowNode).toHaveCount(1);
  await rowNode.click();
  const rowFriendly = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  await expect(rowFriendly).toContainText('Row height');
  await expect(rowFriendly).toContainText('Interactive');

  const dynamicWidget = hierarchy.getByTestId(restoredSelectors.dynamic.testId);
  await expect(dynamicWidget).toHaveCount(1);
  await dynamicWidget.click();
  const dynamicFriendly = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  await expect(dynamicFriendly).toContainText('Width is controlled by menu logic or a runtime value; it cannot be changed with this control.');

  const calculatedWidget = hierarchy.getByTestId(restoredSelectors.calculated.testId);
  await expect(calculatedWidget).toHaveCount(1);
  await calculatedWidget.click();
  const calculatedFriendly = page.getByTestId('x4-ui-builder-selection').getByTestId('x4-ui-source-edits');
  await expect(calculatedFriendly).toContainText('Height is calculated by the menu; it cannot be changed with this control.');
});

test('SourceEditor creates a menu without source selection and edits its title on the canvas', async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.route('**/api/agent/health-card**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ verdict: 'ready', summary: 'Visual menu creation fixture.', rows: [] }),
  }));
  const referenceRoot = 'source-editor-new-menu-e2e-root';
  const generation = 'source-editor-new-menu-e2e-generation';
  const generatedAt = '2026-09-10T00:00:00.000Z';
  const manifestStatus = {
    available: true, state: 'ready', root: referenceRoot,
    current: { generation, root: referenceRoot, generatedAt },
  };
  await page.route('**/api/reference/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ available: true, root: referenceRoot, generatedAt, manifestGeneration: generation, manifest: manifestStatus }),
  }));
  await page.route('**/api/reference/manifest**', async route => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('q');
    let bytes: number | undefined;
    if (path !== null) {
      const fileUrl = new URL('/api/reference/file', url.origin);
      fileUrl.searchParams.set('path', path);
      const response = await request.get(fileUrl.toString());
      expect(response.ok(), `configured corpus file ${path}`).toBe(true);
      bytes = (await response.body()).byteLength;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        status: manifestStatus, generation, total: path === null ? 0 : 1, limit: 500, offset: 0,
        files: path === null || bytes === undefined ? [] : [{ path, bytes }],
      }),
    });
  });
  const unrelated = { path: 'content.xml', content: '<content id="visual_creation_fixture" />\r\n', reason: 'unknown_domain' as const };
  await seedServerWorkspace({
    ...buildTemplateWorkspace('welcome'), id: 'b119-new-menu-e2e',
    uiWidgets: [], customLua: '', compileSettings: { ui: false }, passthroughFiles: [unrelated],
  });
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await page.locator('[data-workspace-view="ui-designer"]').click();
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  await expect(sourceSelector).toHaveValue('');
  await expect(targetSelector).toHaveValue('');
  const before = await readServerWorkspace();
  await page.getByTestId('x4-ui-new-menu-open').click();
  await page.getByTestId('x4-ui-new-menu-name').fill('Cancelled draft');
  await page.getByTestId('x4-ui-new-menu-cancel').click();
  expect(await readServerWorkspace()).toEqual(before);
  await page.getByTestId('x4-ui-new-menu-open').click();
  const menuName = 'B119 Visual menu';
  await page.getByTestId('x4-ui-new-menu-name').fill(menuName);
  await page.getByTestId('x4-ui-new-menu-create').click();
  await expect(page.getByTestId('x4-ui-new-menu-status')).toHaveText(`Created ${menuName}.`);
  await expect(targetSelector.locator('option:checked')).toHaveText('menu.createFrame');
  await expect(sourceSelector).not.toHaveValue('');
  const canvas = page.getByTestId('x4-ui-canvas-host').locator('canvas');
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await expect(canvas).toBeInViewport();
  const created = await readServerWorkspace() as CreationWorkspace;
  expect(created.passthroughFiles.find(file => file.path === unrelated.path)).toMatchObject(unrelated);
  const luaFiles = created.passthroughFiles.filter(file => file.path.endsWith('.lua'));
  expect(luaFiles).toHaveLength(1);
  const lua = luaFiles[0];
  const xml = created.passthroughFiles.find(file => file.path === 'ui.xml');
  expect(xml).toBeDefined();
  expect(xml!.content).toContain(lua.path);
  const persistSourceArtifact = async (name: string, filename: string, content: string, contentType: string): Promise<void> => {
    const artifactPath = test.info().outputPath(filename);
    await writeFile(artifactPath, content, 'utf8');
    await test.info().attach(name, { path: artifactPath, contentType });
  };
  await persistSourceArtifact('created-source', 'created-source.lua', lua.content, 'text/plain');
  await persistSourceArtifact('registration', 'registration.xml', xml!.content, 'text/xml');
  await expect(sourceSelector.locator('option:checked')).toHaveText(lua.path);
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  const titleNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Text · B119 Visual menu/ });
  await expect(titleNode).toHaveCount(1);
  await titleNode.click();
  const inspector = page.getByTestId('x4-ui-builder-selection');
  const titleInput = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]').first();
  await expect(titleInput).toHaveValue(menuName);
  const entryTestId = await titleInput.getAttribute('data-testid');
  if (entryTestId === null) throw new Error('created title has no source edit control');
  const apply = inspector.getByTestId(entryTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
  await expect(apply).toBeDisabled();
  const createdViewport = page.viewportSize();
  expect(createdViewport).toEqual({ width: 1280, height: 720 });
  const createdInspectorScrollTop = await page.getByTestId('x4-ui-builder-inspector').evaluate(element => (element as HTMLElement).scrollTop);
  expect(createdInspectorScrollTop).toBe(0);
  const createdEditorGeometry = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="x4-ui-source-editor"]');
    const canvasViewport = document.querySelector('[data-testid="x4-ui-canvas-scroll"]');
    const inspector = document.querySelector('[data-testid="x4-ui-builder-inspector"]');
    const input = document.querySelector('[data-testid="x4-ui-builder-selection"] input[type="text"][data-testid^="x4-ui-source-edit-input-"]');
    const applyButton = input?.closest('article')?.querySelector('button[data-testid^="x4-ui-source-edit-apply-"]');
    if (!(editor instanceof HTMLElement) || !(canvasViewport instanceof HTMLElement) || !(inspector instanceof HTMLElement) || !(input instanceof HTMLElement) || !(applyButton instanceof HTMLElement)) {
      throw new Error('created SourceEditor title control geometry is not measurable');
    }
    const editorBox = editor.getBoundingClientRect();
    const inspectorBox = inspector.getBoundingClientRect();
    const within = (child: DOMRect, parent: DOMRect): boolean => (
      child.left >= parent.left && child.top >= parent.top && child.right <= parent.right && child.bottom <= parent.bottom
    );
    return {
      editorHeight: editorBox.height,
      canvasViewportHeight: canvasViewport.clientHeight,
      canvasViewportWidth: canvasViewport.clientWidth,
      canvasHeightRatio: canvasViewport.clientHeight / editorBox.height,
      titleInputVisibleInInspector: within(input.getBoundingClientRect(), inspectorBox),
      applyVisibleInInspector: within(applyButton.getBoundingClientRect(), inspectorBox),
    };
  });
  expect(createdEditorGeometry.canvasViewportWidth).toBeGreaterThanOrEqual(280);
  expect(createdEditorGeometry.canvasViewportHeight).toBeGreaterThanOrEqual(280);
  expect(createdEditorGeometry.canvasHeightRatio).toBeGreaterThanOrEqual(0.5);
  expect(createdEditorGeometry.titleInputVisibleInInspector).toBe(true);
  expect(createdEditorGeometry.applyVisibleInInspector).toBe(true);
  const createdGeometryArtifactPath = test.info().outputPath('created-menu-compact-geometry.json');
  await writeFile(createdGeometryArtifactPath, JSON.stringify({ viewport: createdViewport, editorGeometry: { ...createdEditorGeometry, inspectorScrollTop: createdInspectorScrollTop } }, null, 2), 'utf8');
  await test.info().attach('created-menu-compact-geometry', { path: createdGeometryArtifactPath, contentType: 'application/json' });
  const zoomMode = page.getByTestId('x4-ui-canvas-zoom-mode');
  await expect(zoomMode).toHaveValue('fit-menu');
  await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText(/^\d+(?:\.\d)?% preview$/);
  const titleSelection = page.getByTestId('x4-ui-canvas-selection');
  const fitTitleBox = await titleSelection.boundingBox();
  if (fitTitleBox === null || fitTitleBox.height < 10) throw new Error('Fit-menu creation preview did not render a readable title box');
  const bitmapBefore = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL('image/png'));
  const nativeBeforeZoom = await canvas.evaluate(element => {
    const current = element as HTMLCanvasElement;
    (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore = current;
    return { width: current.width, height: current.height, png: current.toDataURL('image/png') };
  });
  const createdScreenshotPath = test.info().outputPath('created-menu.png');
  await page.screenshot({ path: createdScreenshotPath });
  await test.info().attach('created-menu', { path: createdScreenshotPath, contentType: 'image/png' });
  const titleNativeCenter = await page.evaluate(() => {
    const selection = document.querySelector('[data-testid="x4-ui-canvas-selection"]');
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(selection instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) throw new Error('created title selection disappeared before zoom');
    const selectionBox = selection.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    return {
      x: (selectionBox.left + selectionBox.width / 2 - canvasBox.left) * canvas.width / canvasBox.width,
      y: (selectionBox.top + selectionBox.height / 2 - canvasBox.top) * canvas.height / canvasBox.height,
    };
  });
  await zoomMode.selectOption('one-to-one');
  await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText(/100% preview/);
  const oneToOneScreenshotPath = test.info().outputPath('created-menu-one-to-one.png');
  await page.screenshot({ path: oneToOneScreenshotPath });
  await test.info().attach('created-menu-one-to-one', { path: oneToOneScreenshotPath, contentType: 'image/png' });
  const nativeAtOneToOne = await canvas.evaluate(element => {
    const current = element as HTMLCanvasElement;
    const before = (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore;
    return { sameNode: current === before, width: current.width, height: current.height, png: current.toDataURL('image/png') };
  });
  expect(nativeAtOneToOne.sameNode).toBe(true);
  expect(nativeAtOneToOne.width).toBe(nativeBeforeZoom.width);
  expect(nativeAtOneToOne.height).toBe(nativeBeforeZoom.height);
  expect(nativeAtOneToOne.png).toBe(nativeBeforeZoom.png);
  await page.getByTestId('x4-ui-canvas-scroll').evaluate((element, center) => {
    const scroll = element as HTMLElement;
    scroll.scrollLeft = center.x - scroll.clientWidth / 2;
    scroll.scrollTop = center.y - scroll.clientHeight / 2;
  }, titleNativeCenter);
  const frameNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Frame 1/ });
  await frameNode.click();
  await page.getByTestId('x4-ui-canvas-scroll').evaluate((element, center) => {
    const scroll = element as HTMLElement;
    const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('created canvas disappeared while preparing a scrolled click');
    const canvasBox = canvas.getBoundingClientRect();
    const point = { x: canvasBox.left + center.x, y: canvasBox.top + center.y };
    scroll.scrollLeft += point.x - (scroll.getBoundingClientRect().left + scroll.clientWidth / 2);
    scroll.scrollTop += point.y - (scroll.getBoundingClientRect().top + scroll.clientHeight / 2);
  }, titleNativeCenter);
  const canvasBoxAtOneToOne = await canvas.boundingBox();
  if (canvasBoxAtOneToOne === null) throw new Error('100% canvas is not measurable after scroll');
  await page.mouse.click(canvasBoxAtOneToOne.x + titleNativeCenter.x, canvasBoxAtOneToOne.y + titleNativeCenter.y);
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText(`Text · ${menuName}`);
  const oneToOneTitleBox = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
  if (oneToOneTitleBox === null || oneToOneTitleBox.height < 10) throw new Error('100% scrolled click did not leave a readable selected title box');
  await page.getByTestId('x4-ui-canvas-zoom-in').click();
  await expect(zoomMode).toHaveValue('manual');
  const manualCanvasIdentity = await canvas.evaluate(element => {
    const current = element as HTMLCanvasElement;
    const before = (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore;
    return { sameNode: current === before, width: current.width, height: current.height, png: current.toDataURL('image/png') };
  });
  expect(manualCanvasIdentity.sameNode).toBe(true);
  expect(manualCanvasIdentity.width).toBe(nativeBeforeZoom.width);
  expect(manualCanvasIdentity.height).toBe(nativeBeforeZoom.height);
  expect(manualCanvasIdentity.png).toBe(nativeBeforeZoom.png);
  const manualScroll = await page.getByTestId('x4-ui-canvas-scroll').evaluate((element, center) => {
    const scroll = element as HTMLElement;
    const current = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
    if (!(current instanceof HTMLCanvasElement)) throw new Error('created canvas disappeared while preparing the manual zoom click');
    const canvasBox = current.getBoundingClientRect();
    const scrollBox = scroll.getBoundingClientRect();
    const scaleX = canvasBox.width / current.width;
    const scaleY = canvasBox.height / current.height;
    const targetContentX = canvasBox.left - scrollBox.left + scroll.scrollLeft + center.x * scaleX;
    const targetContentY = canvasBox.top - scrollBox.top + scroll.scrollTop + center.y * scaleY;
    const maxLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const panWithinTarget = (target: number, viewport: number, maximum: number, current: number): number => {
      const lower = Math.max(0, target - viewport + 1);
      const upper = Math.min(maximum, target - 1);
      const positiveLower = Math.max(1, lower);
      return upper >= positiveLower ? positiveLower + (upper - positiveLower) / 2 : current;
    };
    scroll.scrollLeft = panWithinTarget(targetContentX, scroll.clientWidth, maxLeft, scroll.scrollLeft);
    scroll.scrollTop = panWithinTarget(targetContentY, scroll.clientHeight, maxTop, scroll.scrollTop);
    return {
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
      maxLeft,
      maxTop,
      targetX: targetContentX - scroll.scrollLeft,
      targetY: targetContentY - scroll.scrollTop,
      targetVisible: targetContentX - scroll.scrollLeft >= 1
        && targetContentX - scroll.scrollLeft <= scroll.clientWidth - 1
        && targetContentY - scroll.scrollTop >= 1
        && targetContentY - scroll.scrollTop <= scroll.clientHeight - 1,
    };
  }, titleNativeCenter);
  expect(manualScroll.left > 0 || manualScroll.top > 0).toBe(true);
  expect(manualScroll.targetVisible).toBe(true);
  const manualCreatedCanvasBox = await canvas.boundingBox();
  if (manualCreatedCanvasBox === null) throw new Error('manual created canvas is not measurable after scroll');
  await page.mouse.click(
    manualCreatedCanvasBox.x + titleNativeCenter.x * manualCreatedCanvasBox.width / nativeBeforeZoom.width,
    manualCreatedCanvasBox.y + titleNativeCenter.y * manualCreatedCanvasBox.height / nativeBeforeZoom.height,
  );
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText(`Text · ${menuName}`);
  const manualTitleBox = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
  if (manualTitleBox === null || manualTitleBox.height < 10) throw new Error('manual scrolled click did not leave a readable selected title box');
  const creationResizeViewport = page.viewportSize();
  if (creationResizeViewport !== null) {
    await page.setViewportSize({ width: creationResizeViewport.width + 120, height: creationResizeViewport.height + 80 });
    await expect(zoomMode).toHaveValue('manual');
    const resizedCanvas = await canvas.evaluate(element => {
      const current = element as HTMLCanvasElement;
      const before = (window as unknown as { __x4UiBuilderCanvasBefore?: HTMLCanvasElement }).__x4UiBuilderCanvasBefore;
      return { sameNode: current === before, width: current.width, height: current.height, png: current.toDataURL('image/png') };
    });
    expect(resizedCanvas.sameNode).toBe(true);
    expect(resizedCanvas.width).toBe(nativeBeforeZoom.width);
    expect(resizedCanvas.height).toBe(nativeBeforeZoom.height);
    expect(resizedCanvas.png).toBe(nativeBeforeZoom.png);
    await expect(page.getByTestId('x4-ui-canvas-selection')).toBeInViewport();
    await page.setViewportSize(creationResizeViewport);
  }
  await zoomMode.selectOption('fit-menu');
  const nativeAfterFitReset = await canvas.evaluate(element => {
    const current = element as HTMLCanvasElement;
    return { width: current.width, height: current.height, png: current.toDataURL('image/png') };
  });
  expect(nativeAfterFitReset).toEqual(nativeBeforeZoom);
  const firstEditedTitle = 'B119 Edited "title" \\ path';
  await titleInput.fill(firstEditedTitle);
  await expect(canvas).toBeInViewport();
  await apply.click();
  expect(lua.content.split(JSON.stringify(menuName))).toHaveLength(2);
  const expectedLua = lua.content.replace(JSON.stringify(menuName), JSON.stringify(firstEditedTitle));
  await expect.poll(async () => {
    const current = await readServerWorkspace() as CreationWorkspace;
    return current.passthroughFiles.find(file => file.path === lua.path)?.content;
  }).toBe(expectedLua);
  const edited = await readServerWorkspace() as CreationWorkspace;
  const editedLua = edited.passthroughFiles.find(file => file.path === lua.path);
  expect(editedLua?.content).toBe(expectedLua);
  await persistSourceArtifact('edited-source', 'edited-source.lua', editedLua!.content, 'text/plain');
  expect(edited.passthroughFiles.find(file => file.path === 'ui.xml')?.content).toBe(xml!.content);
  expect(edited.passthroughFiles.find(file => file.path === unrelated.path)).toMatchObject(unrelated);
  await expect(hierarchy.getByRole('treeitem').filter({ hasText: new RegExp(`^Text · ${firstEditedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toHaveCount(1);
  const retainedTitleInput = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]').first();
  await expect(retainedTitleInput).toHaveValue(firstEditedTitle);
  const retainedEntryTestId = await retainedTitleInput.getAttribute('data-testid');
  if (retainedEntryTestId === null) throw new Error('created menu retained title has no second exact entry id');
  const retainedApply = inspector.getByTestId(retainedEntryTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
  await retainedTitleInput.fill('x');
  await expect(retainedApply).toBeEnabled();
  await retainedApply.click();
  const expectedSecondLua = expectedLua.replace(JSON.stringify(firstEditedTitle), JSON.stringify('x'));
  await expect.poll(async () => {
    const current = await readServerWorkspace() as CreationWorkspace;
    return current.passthroughFiles.find(file => file.path === lua.path)?.content;
  }, { timeout: 30_000, message: 'wait for the repeated exact created-menu title edit' }).toBe(expectedSecondLua);
  const repeatedEdited = await readServerWorkspace() as CreationWorkspace;
  expect(repeatedEdited.passthroughFiles.find(file => file.path === lua.path)?.content).toBe(expectedSecondLua);
  await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText('Text · x');
  await expect(hierarchy.getByRole('treeitem').filter({ hasText: /^Text · x/ })).toHaveCount(1);
  await persistSourceArtifact('edited-source-repeat', 'edited-source-repeat.lua', expectedSecondLua, 'text/plain');
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await expect.poll(() => canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL('image/png'))).not.toBe(bitmapBefore);
  await expect(canvas).toBeInViewport();
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
  const editedScreenshotPath = test.info().outputPath('edited-menu.png');
  await page.screenshot({ path: editedScreenshotPath });
  await test.info().attach('edited-menu', { path: editedScreenshotPath, contentType: 'image/png' });

});

async function setupContextualInsertionFixture(page: Page, request: APIRequestContext) {
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.route('**/api/agent/health-card**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ verdict: 'ready', summary: 'Visual menu creation fixture.', rows: [] }),
  }));
  const referenceRoot = 'source-editor-new-menu-e2e-root';
  const generation = 'source-editor-new-menu-e2e-generation';
  const generatedAt = '2026-09-10T00:00:00.000Z';
  const manifestStatus = {
    available: true, state: 'ready', root: referenceRoot,
    current: { generation, root: referenceRoot, generatedAt },
  };
  await page.route('**/api/reference/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ available: true, root: referenceRoot, generatedAt, manifestGeneration: generation, manifest: manifestStatus }),
  }));
  await page.route('**/api/reference/manifest**', async route => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('q');
    let bytes: number | undefined;
    if (path !== null) {
      const fileUrl = new URL('/api/reference/file', url.origin);
      fileUrl.searchParams.set('path', path);
      const response = await request.get(fileUrl.toString());
      expect(response.ok(), `configured corpus file ${path}`).toBe(true);
      bytes = (await response.body()).byteLength;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        status: manifestStatus, generation, total: path === null ? 0 : 1, limit: 500, offset: 0,
        files: path === null || bytes === undefined ? [] : [{ path, bytes }],
      }),
    });
  });
  const unrelated = { path: 'content.xml', content: '<content id="visual_creation_fixture" />\r\n', reason: 'unknown_domain' as const };
  await seedServerWorkspace({
    ...buildTemplateWorkspace('welcome'), id: 'b119-new-menu-e2e',
    uiWidgets: [], customLua: '', compileSettings: { ui: false }, passthroughFiles: [unrelated],
  });
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await page.locator('[data-workspace-view="ui-designer"]').click();
  await expect(page.getByTestId('x4-ui-source-selector')).toHaveValue('');
  await expect(page.getByTestId('x4-ui-target-selector')).toHaveValue('');
  return { unrelated };
}

async function createActualNewMenu(page: Page, menuName: string): Promise<CreationWorkspace> {
  await page.getByTestId('x4-ui-new-menu-open').click();
  await page.getByTestId('x4-ui-new-menu-name').fill(menuName);
  await page.getByTestId('x4-ui-new-menu-create').click();
  await expect(page.getByTestId('x4-ui-new-menu-status')).toHaveText(`Created ${menuName}.`);
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toBeInViewport();
  return await readServerWorkspace() as CreationWorkspace;
}

function assertContextualLuaSiblings(
  current: CreationWorkspace,
  currentPath: string,
  currentContent: string,
  uiXmlContent: string,
  unrelated: { path: string; content: string; reason: 'unknown_domain' },
  knownLuaContents: ReadonlyMap<string, string>,
): void {
  expect(current.passthroughFiles.find(file => file.path === 'ui.xml')?.content).toBe(uiXmlContent);
  expect(current.passthroughFiles.find(file => file.path === unrelated.path)).toMatchObject(unrelated);
  for (const [path, content] of knownLuaContents) {
    expect(current.passthroughFiles.find(file => file.path === path)?.content).toBe(content);
  }
  expect(current.passthroughFiles.find(file => file.path === currentPath)?.content).toBe(currentContent);
}

function sourceLineSpans(source: string): readonly { readonly start: number; readonly end: number; readonly text: string }[] {
  const spans: { start: number; end: number; text: string }[] = [];
  for (let start = 0; start < source.length;) {
    const newline = source.indexOf('\n', start);
    const end = newline === -1 ? source.length : newline + 1;
    spans.push({ start, end, text: source.slice(start, end) });
    start = end;
  }
  return spans;
}

/** Prove one source insertion by removing one whole candidate line and matching the complete prior bytes. */
function assertSingleInsertedSourceDelta(
  before: string,
  after: string,
  insertedPattern: RegExp,
  message: string,
): string {
  const candidates = sourceLineSpans(after).filter(span => {
    insertedPattern.lastIndex = 0;
    return insertedPattern.test(span.text)
      && after.slice(0, span.start) + after.slice(span.end) === before;
  });
  if (candidates.length !== 1) {
    throw new Error(`${message}: expected one whole-line candidate, found ${candidates.length}`);
  }
  return candidates[0].text;
}

/** Prove one source edit is exactly one literal replacement across the complete file. */
function assertSingleLiteralSourceReplacement(
  before: string,
  after: string,
  oldValue: string,
  newValue: string,
  message: string,
): void {
  const oldLiteral = JSON.stringify(oldValue);
  const newLiteral = JSON.stringify(newValue);
  expect(before.split(oldLiteral), message).toHaveLength(2);
  expect(after, message).toBe(before.replace(oldLiteral, newLiteral));
  expect(after.split(newLiteral), message).toHaveLength(2);
}

async function assertFreshNativeCanvas(
  page: Page,
  previousCanvas: ElementHandle<HTMLElement | SVGElement> | null,
  transition: string,
): Promise<void> {
  if (previousCanvas === null) throw new Error(`${transition} has no prior native canvas handle`);
  const freshCanvas = await page.getByTestId('x4-ui-canvas-host').locator('canvas').elementHandle();
  if (freshCanvas === null) throw new Error(`${transition} has no current native canvas handle`);
  const previousIsCanvas = await previousCanvas.evaluate(node => node instanceof HTMLCanvasElement);
  const freshIsCanvas = await freshCanvas.evaluate(node => node instanceof HTMLCanvasElement);
  expect(previousIsCanvas, `${transition} prior handle is not an HTMLCanvasElement`).toBe(true);
  expect(freshIsCanvas, `${transition} current handle is not an HTMLCanvasElement`).toBe(true);
  const replaced = await freshCanvas.evaluate((current, previous) => current !== previous, previousCanvas);
  expect(replaced, `${transition} must mount a fresh native canvas after history restoration`).toBe(true);
}

const rowInsertionOraclePattern = /^[ \t]*local [A-Za-z_][A-Za-z0-9_]* = [A-Za-z_][A-Za-z0-9_]*:addRow\(false, \{\}\)[ \t]*(?:\r?\n)?$/;
const runSourceDeltaOracleSelfCheck = (): void => {
  const rowStatement = '  local row2 = ftable:addRow(false, {})\n';
  const cases = [
    {
      name: 'generated menu display',
      before: '  frame:display()\n',
      after: `${rowStatement}  frame:display()\n`,
    },
    {
      name: 'equally indented middle row',
      before: [
        '  local row = ftable:addRow(false, {})',
        '  row[1]:createText("Anchor", {})',
        '  frame:display()',
        '',
      ].join('\n'),
      after: [
        '  local row = ftable:addRow(false, {})',
        '  row[1]:createText("Anchor", {})',
        rowStatement.trimEnd(),
        '  frame:display()',
        '',
      ].join('\n'),
    },
    {
      name: 'shared local-row prefix',
      before: '  local row = ftable:addRow(false, {})\n  frame:display()\n',
      after: `${rowStatement}  local row = ftable:addRow(false, {})\n  frame:display()\n`,
    },
  ] as const;
  for (const candidate of cases) {
    const inserted = assertSingleInsertedSourceDelta(candidate.before, candidate.after, rowInsertionOraclePattern, candidate.name);
    if (inserted !== rowStatement) throw new Error(`${candidate.name}: candidate line was not preserved exactly`);
  }
};
runSourceDeltaOracleSelfCheck();

const contextualInsertionFixtures = [
  { kind: 'text' as const, menuName: 'B119 Text palette menu', internalName: 'b119_text_palette_menu_menu', text: 'B119 text widget', editedText: 'B119 edited text widget' },
  { kind: 'button' as const, menuName: 'B119 Button palette menu', internalName: 'b119_button_palette_menu_menu', text: 'B119 button widget', editedText: 'B119 edited button widget' },
  { kind: 'input' as const, menuName: 'B119 Input palette menu', internalName: 'b119_input_palette_menu_menu', text: 'B119 input widget', editedText: 'B119 edited input widget' },
] as const;

for (const insertionFixture of contextualInsertionFixtures) {
  test(`SourceEditor contextually inserts and edits a ${insertionFixture.kind} widget`, async ({ page, request }) => {
    const { unrelated } = await setupContextualInsertionFixture(page, request);
    const sourceSelector = page.getByTestId('x4-ui-source-selector');
    const targetSelector = page.getByTestId('x4-ui-target-selector');
    const canvas = page.getByTestId('x4-ui-canvas-host').locator('canvas');
    const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
    const inspector = page.getByTestId('x4-ui-builder-selection');

    const producerMenuName = 'B119 Visual menu';
    const producerCreated = await createActualNewMenu(page, producerMenuName);
    await expect(targetSelector.locator('option:checked')).toHaveText('menu.createFrame');
    await expect(sourceSelector).not.toHaveValue('');
    expect(producerCreated.passthroughFiles.find(file => file.path === unrelated.path)).toMatchObject(unrelated);
    const producerLuaFiles = producerCreated.passthroughFiles.filter(file => file.path.endsWith('.lua'));
    expect(producerLuaFiles).toHaveLength(1);
    const producerLua = producerLuaFiles[0];
    expect(producerLua).toBeDefined();
    const producerXml = producerCreated.passthroughFiles.find(file => file.path === 'ui.xml');
    expect(producerXml).toBeDefined();
    expect(producerXml!.content).toContain(producerLua.path);

    const producerTitleNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Text · B119 Visual menu/ });
    await expect(producerTitleNode).toHaveCount(1);
    await producerTitleNode.click();
    const producerTitleInput = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]').first();
    await expect(producerTitleInput).toHaveValue(producerMenuName);
    const producerEntryTestId = await producerTitleInput.getAttribute('data-testid');
    if (producerEntryTestId === null) throw new Error('contextual producer title has no source edit control');
    const producerApply = inspector.getByTestId(producerEntryTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
    await expect(producerApply).toBeDisabled();
    const producerEditedTitle = 'B119 Producer edited "title" \\ path';
    await producerTitleInput.fill(producerEditedTitle);
    await expect(producerApply).toBeEnabled();
    await producerApply.click();
    expect(producerLua.content.split(JSON.stringify(producerMenuName))).toHaveLength(2);
    const expectedProducerLua = producerLua.content.replace(JSON.stringify(producerMenuName), JSON.stringify(producerEditedTitle));
    await expect.poll(async () => {
      const current = await readServerWorkspace() as CreationWorkspace;
      return current.passthroughFiles.find(file => file.path === producerLua.path)?.content;
    }).toBe(expectedProducerLua);
    const editedProducer = await readServerWorkspace() as CreationWorkspace;
    expect(editedProducer.passthroughFiles.find(file => file.path === producerLua.path)?.content).toBe(expectedProducerLua);
    expect(editedProducer.passthroughFiles.find(file => file.path === 'ui.xml')?.content).toBe(producerXml!.content);
    expect(editedProducer.passthroughFiles.find(file => file.path === unrelated.path)).toMatchObject(unrelated);
    await expect(producerTitleInput).toHaveValue(producerEditedTitle);
    const knownLuaContents = new Map(
      editedProducer.passthroughFiles
        .filter(file => file.path.endsWith('.lua'))
        .map(file => [file.path, file.content] as const),
    );

    // This is intentionally a second real New-menu creation after an acknowledged source edit.
    const fresh = await createActualNewMenu(page, insertionFixture.menuName);
    await expect(canvas).toBeInViewport();
    const freshLua = fresh.passthroughFiles.filter(file => file.path.endsWith('.lua') && !knownLuaContents.has(file.path));
    expect(freshLua).toHaveLength(1);
    const insertionLua = freshLua[0];
    expect(insertionLua).toBeDefined();
    expect(insertionLua.content).toContain(`name = "${insertionFixture.internalName}"`);
    expect(insertionLua.content).toMatch(/addTable\(2,/);
    expect(insertionLua.content).toContain('row[1]:createText(');
    expect(insertionLua.content).toContain(`row[1]:createText(${JSON.stringify(insertionFixture.menuName)},`);
    expect(insertionLua.content).not.toContain('row[2]:create');
    const insertionUiXml = fresh.passthroughFiles.find(file => file.path === 'ui.xml');
    expect(insertionUiXml).toBeDefined();
    expect(insertionUiXml!.content).toContain(insertionLua.path);
    assertContextualLuaSiblings(fresh, insertionLua.path, insertionLua.content, insertionUiXml!.content, unrelated, knownLuaContents);

    await expect(hierarchy.getByRole('treeitem').filter({ hasText: `Text · ${insertionFixture.menuName}` })).toHaveCount(1);
    await hierarchy.getByRole('treeitem').filter({ hasText: `Text · ${insertionFixture.menuName}` }).click();
    const insertionCanvasGeometry = await page.getByTestId('x4-ui-canvas-scroll').evaluate(element => ({
      width: (element as HTMLElement).clientWidth,
      height: (element as HTMLElement).clientHeight,
    }));
    expect(insertionCanvasGeometry.width).toBeGreaterThanOrEqual(280);
    expect(insertionCanvasGeometry.height).toBeGreaterThanOrEqual(280);
    const titleSelectionBox = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
    if (titleSelectionBox === null || titleSelectionBox.width <= 0 || titleSelectionBox.height <= 0) {
      throw new Error(`${insertionFixture.kind} producer menu title selection has no canvas geometry`);
    }

    const insertionCell = hierarchy.getByRole('treeitem').filter({ hasText: /^Cell 2/ });
    await expect(insertionCell).toHaveCount(1);
    await insertionCell.click();
    const insertionPalette = page.getByTestId('x4-ui-contextual-palette');
    await expect(insertionPalette).toContainText('Choose text, button, or input.');
    const insertionText = page.getByTestId('x4-ui-contextual-palette-text');
    await expect(insertionText).toHaveValue('New text');
    await insertionText.fill(insertionFixture.text);
    const addButton = page.getByTestId(`x4-ui-contextual-palette-add-${insertionFixture.kind}`);
    await expect(addButton).toBeEnabled();
    const inputMaskEmpty = insertionFixture.kind === 'input' ? await sampleNeutralLightMask(page) : undefined;
    if (inputMaskEmpty !== undefined) expect(inputMaskEmpty.count).toBe(0);
    await addButton.click();

    const insertionStatement = insertionFixture.kind === 'text'
      ? `  row[2]:createText(${JSON.stringify(insertionFixture.text)}, {})`
      : insertionFixture.kind === 'button'
        ? `  row[2]:createButton({}):setText(${JSON.stringify(insertionFixture.text)}, {})`
        : `  row[2]:createEditBox({ defaultText = ${JSON.stringify(insertionFixture.text)}, height = 25 })`;
    const expectedInsertedLua = insertionLua.content.replace(
      '  menu.frame:display()',
      `${insertionStatement}\n  menu.frame:display()`,
    );
    await expect.poll(async () => {
      const current = await readServerWorkspace() as CreationWorkspace;
      return current.passthroughFiles.find(file => file.path === insertionLua.path)?.content;
    }, { timeout: 30_000, message: `wait for ${insertionFixture.kind} source insertion` }).toBe(expectedInsertedLua);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    const selectedNodeLabel = page.getByTestId('x4-ui-builder-selected-node-label');
    if (insertionFixture.kind === 'text') {
      await expect(selectedNodeLabel).toHaveText(`Text · ${insertionFixture.text}`);
    } else {
      await expect(selectedNodeLabel).toHaveText(new RegExp(`^Widget(?: · ${insertionFixture.text})?$`));
      await expect(selectedNodeLabel).not.toHaveText(/^Text/);
    }
    const insertedSelectionBox = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
    if (insertedSelectionBox === null || insertedSelectionBox.width <= 0 || insertedSelectionBox.height <= 0) {
      throw new Error(`${insertionFixture.kind} insertion did not produce a real selected canvas rectangle`);
    }
    const inputMaskInserted = insertionFixture.kind === 'input' ? await sampleNeutralLightMask(page) : undefined;
    if (inputMaskInserted !== undefined) expect(inputMaskInserted.count).toBeGreaterThan(10);
    const inserted = await readServerWorkspace() as CreationWorkspace;
    assertContextualLuaSiblings(inserted, insertionLua.path, expectedInsertedLua, insertionUiXml!.content, unrelated, knownLuaContents);

    const selectedPropertyInputs = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]');
    const selectedPropertyInputCount = await selectedPropertyInputs.count();
    let selectedPropertyInput = selectedPropertyInputs.first();
    for (let index = 0; index < selectedPropertyInputCount; index += 1) {
      const candidate = selectedPropertyInputs.nth(index);
      if (await candidate.inputValue() === insertionFixture.text) {
        selectedPropertyInput = candidate;
        break;
      }
    }
    if (await selectedPropertyInput.inputValue() !== insertionFixture.text) {
      throw new Error(`${insertionFixture.kind} insertion did not expose its selected ordinary text property`);
    }
    const selectedPropertyTestId = await selectedPropertyInput.getAttribute('data-testid');
    if (selectedPropertyTestId === null) throw new Error(`${insertionFixture.kind} selected property has no source entry identity`);
    const selectedPropertyApply = inspector.getByTestId(selectedPropertyTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
    await selectedPropertyInput.fill(insertionFixture.editedText);
    await expect(selectedPropertyApply).toBeEnabled();
    await selectedPropertyApply.click();
    const expectedEditedLua = expectedInsertedLua.replace(JSON.stringify(insertionFixture.text), JSON.stringify(insertionFixture.editedText));
    await expect.poll(async () => {
      const current = await readServerWorkspace() as CreationWorkspace;
      return current.passthroughFiles.find(file => file.path === insertionLua.path)?.content;
    }, { timeout: 30_000, message: `wait for ${insertionFixture.kind} ordinary property edit` }).toBe(expectedEditedLua);
    await expect(selectedPropertyInput).toHaveValue(insertionFixture.editedText);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    const editedInsertion = await readServerWorkspace() as CreationWorkspace;
    assertContextualLuaSiblings(editedInsertion, insertionLua.path, expectedEditedLua, insertionUiXml!.content, unrelated, knownLuaContents);
    if (insertionFixture.kind === 'input') {
      if (inputMaskEmpty === undefined || inputMaskInserted === undefined) {
        throw new Error('Input native mask observations are missing the empty or inserted state');
      }
      const inputMaskEdited = await sampleNeutralLightMask(page);
      const inputMaskObservationsPath = test.info().outputPath('contextual-input-native-mask-observations.json');
      await writeFile(
        inputMaskObservationsPath,
        JSON.stringify({ empty: inputMaskEmpty, inserted: inputMaskInserted, edited: inputMaskEdited }, null, 2),
        'utf8',
      );
      await test.info().attach('contextual-input-native-mask-observations', {
        path: inputMaskObservationsPath,
        contentType: 'application/json',
      });
      expect(inputMaskEdited.count).toBeGreaterThan(10);
      expect(inputMaskEdited.cropRect).toEqual(inputMaskInserted.cropRect);
      expect(inputMaskEdited.maskSignature).not.toBe(inputMaskInserted.maskSignature);
    }
    const insertionScreenshotPath = test.info().outputPath(`contextual-${insertionFixture.kind}.png`);
    await page.screenshot({ path: insertionScreenshotPath });
    await test.info().attach(`contextual-${insertionFixture.kind}`, { path: insertionScreenshotPath, contentType: 'image/png' });

    await insertionCell.click();
    await expect(insertionPalette).toContainText('No eligible cell is available for adding content right now. Add another row below this row.');
    for (const kind of ['text', 'button', 'input']) {
      await expect(page.getByTestId(`x4-ui-contextual-palette-add-${kind}`)).toHaveCount(0);
    }
    const occupiedWorkspace = await readServerWorkspace() as CreationWorkspace;
    expect(occupiedWorkspace).toEqual(editedInsertion);
    const addRecoveryRow = page.getByTestId('x4-ui-contextual-palette-add-row');
    await expect(addRecoveryRow).toBeEnabled();
    await addRecoveryRow.click();
    await expect.poll(async () => {
      const current = await readServerWorkspace() as CreationWorkspace;
      return (current.passthroughFiles.find(file => file.path === insertionLua.path)?.content.match(/addRow\(false, \{\}\)/g) ?? []).length;
    }, { timeout: 30_000, message: `wait for ${insertionFixture.kind} occupied-cell row recovery` }).toBe(2);
    const recoveredWorkspace = await readServerWorkspace() as CreationWorkspace;
    const recoveredSource = recoveredWorkspace.passthroughFiles.find(file => file.path === insertionLua.path)?.content;
    if (recoveredSource === undefined) throw new Error('Occupied-cell recovery lost the menu source');
    assertSingleInsertedSourceDelta(expectedEditedLua, recoveredSource, rowInsertionOraclePattern,
      `${insertionFixture.kind} occupied-cell recovery must insert only one canonical row`);
    assertContextualLuaSiblings(recoveredWorkspace, insertionLua.path, recoveredSource, insertionUiXml!.content, unrelated, knownLuaContents);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect(hierarchy.locator('button[aria-pressed="true"]')).toContainText('Cell 1');
    await expect(insertionText).toHaveValue('New text');
    for (const kind of ['text', 'button', 'input']) {
      await expect(page.getByTestId(`x4-ui-contextual-palette-add-${kind}`)).toBeEnabled();
    }
    await writeFile(test.info().outputPath(`contextual-${insertionFixture.kind}-row-recovery.json`),
      JSON.stringify({ before: occupiedWorkspace, after: recoveredWorkspace, sourcePath: insertionLua.path }, null, 2), 'utf8');
    await page.screenshot({ path: test.info().outputPath(`contextual-${insertionFixture.kind}-row-recovery.png`) });
  });
}

test('SourceEditor adds and edits Text, Button, and Input across fresh same-menu rows', async ({ page, request }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const { unrelated } = await setupContextualInsertionFixture(page, request);
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  const inspector = page.getByTestId('x4-ui-builder-selection');
  const sibling = await createActualNewMenu(page, 'B119 Add row sibling');
  const siblingLua = sibling.passthroughFiles.find(file => file.path.endsWith('.lua'));
  expect(siblingLua).toBeDefined();
  const menuName = 'B119 Add row menu';
  const created = await createActualNewMenu(page, menuName);
  const luaFiles = created.passthroughFiles.filter(file => file.path.endsWith('.lua') && file.path !== siblingLua!.path);
  expect(luaFiles).toHaveLength(1);
  const menuLua = luaFiles[0];
  expect(menuLua).toBeDefined();
  const uiXml = created.passthroughFiles.find(file => file.path === 'ui.xml');
  expect(uiXml).toBeDefined();
  const unchangedLuaContents = new Map(
    created.passthroughFiles
      .filter(file => file.path.endsWith('.lua') && file.path !== menuLua.path)
      .map(file => [file.path, file.content] as const),
  );
  const readMenuSource = async (): Promise<string> => {
    const current = await readServerWorkspace() as CreationWorkspace;
    const source = current.passthroughFiles.find(file => file.path === menuLua.path);
    if (source === undefined) throw new Error('Add-row menu source disappeared from the workspace');
    return source.content;
  };
  const assertCurrentLocal = async (expectedContent: string): Promise<void> => {
    const current = await readServerWorkspace() as CreationWorkspace;
    expect(current.passthroughFiles.find(file => file.path === menuLua.path)?.content).toBe(expectedContent);
    assertContextualLuaSiblings(current, menuLua.path, expectedContent, uiXml!.content, unrelated, unchangedLuaContents);
  };
  const assertExactLiteralReplacement = (
    before: string,
    after: string,
    oldValue: string,
    newValue: string,
    message: string,
  ): void => {
    const oldLiteral = JSON.stringify(oldValue);
    const newLiteral = JSON.stringify(newValue);
    expect(before.split(oldLiteral), message).toHaveLength(2);
    expect(after, message).toBe(before.replace(oldLiteral, newLiteral));
  };
  const persistSourceArtifact = async (name: string, filename: string, content: string): Promise<void> => {
    const artifactPath = test.info().outputPath(filename);
    await writeFile(artifactPath, content, 'utf8');
    await test.info().attach(name, { path: artifactPath, contentType: 'text/plain' });
  };
  const rowCount = (content: string): number => (content.match(/addRow\(false, \{\}\)/g) ?? []).length;
  const initialSource = menuLua.content;
  const initialRowCount = rowCount(initialSource);
  expect(initialRowCount).toBe(1);
  expect(siblingLua!.content).not.toBe(initialSource);
  await assertCurrentLocal(initialSource);

  const firstRow = hierarchy.getByRole('treeitem').filter({ hasText: /^Row 1/ });
  await expect(firstRow).toHaveCount(1);
  await firstRow.click();
  await expect(page.getByTestId('x4-ui-contextual-palette-status')).toContainText('Select an empty cell to add text, button, or input.');

  const addRowFromSelection = async (expectedRows: number): Promise<string> => {
    const beforeSource = await readMenuSource();
    const addRow = page.getByTestId('x4-ui-contextual-palette-add-row');
    await expect(addRow).toBeEnabled();
    await addRow.click();
    await expect.poll(async () => rowCount(await readMenuSource()), { timeout: 30_000, message: 'wait for the acknowledged Add row source update' }).toBe(expectedRows);
    const afterSource = await readMenuSource();
    assertSingleInsertedSourceDelta(
      beforeSource,
      afterSource,
      rowInsertionOraclePattern,
      'Add row must be exactly one local canonical row insertion',
    );
    await assertCurrentLocal(afterSource);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    const selectedHierarchyNode = hierarchy.locator('button[aria-pressed="true"]');
    await expect(selectedHierarchyNode).toHaveCount(1);
    await expect(selectedHierarchyNode).toContainText('Cell 1');
    return afterSource;
  };

  const addAndEditWidget = async (
    widget: 'text' | 'button' | 'input',
    value: string,
    editedValue: string,
  ): Promise<string> => {
    const beforeWidgetSource = await readMenuSource();
    const paletteText = page.getByTestId('x4-ui-contextual-palette-text');
    await expect(paletteText).toHaveValue('New text');
    await paletteText.fill(value);
    await page.getByTestId(`x4-ui-contextual-palette-add-${widget}`).click();
    await expect.poll(readMenuSource, { timeout: 30_000, message: `wait for same-menu ${widget} insertion` }).toContain(value);
    const insertedSource = await readMenuSource();
    const creatorPattern = widget === 'text'
      ? /:createText\(/
      : widget === 'button'
        ? /:createButton\(\{\}\):setText\(/
        : /:createEditBox\(\{ defaultText = /;
    const insertedWidgetSource = assertSingleInsertedSourceDelta(
      beforeWidgetSource,
      insertedSource,
      creatorPattern,
      `same-menu ${widget} insertion must be one local source insertion`,
    );
    expect(insertedWidgetSource).toContain(JSON.stringify(value));
    expect((insertedWidgetSource.match(/:(?:createText|createButton|createEditBox)\(/g) ?? [])).toHaveLength(1);
    await assertCurrentLocal(insertedSource);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    if (widget === 'input') {
      await page.screenshot({ path: test.info().outputPath('same-menu-input-inserted.png') });
    }
    const insertedInputMask = widget === 'input' ? await sampleNeutralLightMask(page) : undefined;
    if (insertedInputMask !== undefined) expect(insertedInputMask.count, 'fresh-row Input must draw actual text inside its own control').toBeGreaterThan(10);
    const propertyInputs = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]');
    const propertyInputCount = await propertyInputs.count();
    let propertyInput = propertyInputs.first();
    for (let index = 0; index < propertyInputCount; index += 1) {
      const candidate = propertyInputs.nth(index);
      if (await candidate.inputValue() === value) {
        propertyInput = candidate;
        break;
      }
    }
    if (await propertyInput.inputValue() !== value) {
      throw new Error(`same-menu ${widget} insertion did not expose its selected ordinary text property`);
    }
    const propertyTestId = await propertyInput.getAttribute('data-testid');
    if (propertyTestId === null) throw new Error(`same-menu ${widget} property has no source entry identity`);
    const propertyApply = inspector.getByTestId(propertyTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
    await propertyInput.fill(editedValue);
    await expect(propertyApply).toBeEnabled();
    const beforePropertySource = await readMenuSource();
    await propertyApply.click();
    await expect.poll(readMenuSource, { timeout: 30_000, message: `wait for same-menu ${widget} property edit` }).toContain(editedValue);
    const editedSource = await readMenuSource();
    assertExactLiteralReplacement(
      beforePropertySource,
      editedSource,
      value,
      editedValue,
      `same-menu ${widget} property edit must replace exactly its selected literal`,
    );
    await expect(propertyInput).toHaveValue(editedValue);
    await assertCurrentLocal(editedSource);
    if (insertedInputMask !== undefined) {
      await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
      const editedInputMask = await sampleNeutralLightMask(page);
      expect(editedInputMask.count, 'edited fresh-row Input must remain visibly readable').toBeGreaterThan(10);
      expect(editedInputMask.maskSignature, 'ordinary Input text Apply must change actual glyph pixels').not.toBe(insertedInputMask.maskSignature);
      const proofPath = test.info().outputPath('same-menu-input-mask.json');
      await writeFile(proofPath, JSON.stringify({ inserted: insertedInputMask, edited: editedInputMask }, null, 2), 'utf8');
      await test.info().attach('same-menu-input-mask', { path: proofPath, contentType: 'application/json' });
    }
    return editedSource;
  };

  let currentSource = await addRowFromSelection(initialRowCount + 1);
  currentSource = await addAndEditWidget('text', 'B119 added-row text', 'B119 edited added-row text');

  await addRowFromSelection(initialRowCount + 2);
  currentSource = await addAndEditWidget('button', 'B119 added-row button', 'B119 edited added-row button');

  await addRowFromSelection(initialRowCount + 3);
  currentSource = await addAndEditWidget('input', 'B119 added-row input', 'B119 edited added-row input');

  expect(rowCount(currentSource)).toBe(initialRowCount + 3);
  expect(currentSource).toContain('B119 edited added-row text');
  expect(currentSource).toContain('B119 edited added-row button');
  expect(currentSource).toContain('B119 edited added-row input');
  await expect(hierarchy.getByRole('treeitem').filter({ hasText: /^Text · B119 edited added-row text/ })).toHaveCount(1);
  await expect(hierarchy.getByRole('treeitem').filter({ has: page.getByText('Text · B119 edited added-row button', { exact: true }) })).toHaveCount(1);
  await expect(hierarchy.getByRole('treeitem').filter({ hasText: /B119 edited added-row input/ })).toHaveCount(1);
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
  await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
  await assertCurrentLocal(currentSource);
  await persistSourceArtifact('same-menu-add-row-source', 'same-menu-add-row-source.lua', currentSource);
  const screenshotPath = test.info().outputPath('same-menu-add-row-widgets.png');
  await page.screenshot({ path: screenshotPath });
  await test.info().attach('same-menu-add-row-widgets', { path: screenshotPath, contentType: 'image/png' });
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

type B119LuaRoundtripFile = {
  readonly path: string;
  readonly content?: string;
  readonly [key: string]: unknown;
};

type B119LuaRoundtripWorkspace = Record<string, unknown> & {
  readonly passthroughFiles: readonly B119LuaRoundtripFile[];
};

type B119LuaRoundtripSelectedWorkspace = {
  readonly workspaceId: string;
  readonly envelope: Record<string, unknown>;
  readonly localWorkspace: B119LuaRoundtripWorkspace;
  readonly serverWorkspace: B119LuaRoundtripWorkspace;
};

type B119LuaRoundtripHierarchyNode = {
  readonly label: string;
  readonly id: string;
  readonly level: number;
  readonly selected: boolean;
};

type B119LuaRoundtripObservation = {
  readonly label: string;
  readonly workspaceId: string;
  readonly localWorkspace: B119LuaRoundtripWorkspace;
  readonly serverWorkspace: B119LuaRoundtripWorkspace;
  readonly sourcePath: string | null;
  readonly targetLabel: string | null;
  readonly sourceText: string | null;
  readonly sourceBytesHex: string | null;
  readonly hierarchy: readonly B119LuaRoundtripHierarchyNode[];
  readonly nativeCanvas: NativeCanvasSignature | null;
  readonly profile: readonly string[];
  readonly history: { readonly undo: string; readonly redo: string };
  readonly screenshotPath?: string;
};

type B119LuaRoundtripDownloadEvent = {
  suggestedFilename: string;
  failure: string | null;
  savedPath?: string;
};

function b119LuaRoundtripWorkspace(value: unknown, label: string): B119LuaRoundtripWorkspace {
  if (value === null || typeof value !== 'object') throw new Error(`${label} is not an object`);
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.passthroughFiles)) throw new Error(`${label} has no complete passthroughFiles array`);
  return {
    ...record,
    passthroughFiles: record.passthroughFiles.map((file, index) => b119LuaRoundtripFile(file, `${label}.passthroughFiles[${index}]`)),
  };
}

function b119LuaRoundtripFile(value: unknown, label: string): B119LuaRoundtripFile {
  if (value === null || typeof value !== 'object') throw new Error(`${label} is not an object`);
  const file = value as Record<string, unknown>;
  if (typeof file.path !== 'string' || file.path.length === 0) throw new Error(`${label} has no path`);
  return file as B119LuaRoundtripFile;
}

function b119LuaRoundtripFiles(workspace: B119LuaRoundtripWorkspace): readonly B119LuaRoundtripFile[] {
  return workspace.passthroughFiles;
}

function b119LuaRoundtripFileAt(workspace: B119LuaRoundtripWorkspace, path: string): B119LuaRoundtripFile | undefined {
  return b119LuaRoundtripFiles(workspace).find(file => file.path === path);
}

function b119LuaRoundtripSourceText(workspace: B119LuaRoundtripWorkspace, path: string): string {
  const file = b119LuaRoundtripFileAt(workspace, path);
  if (file === undefined || typeof file.content !== 'string') throw new Error(`Source ${path} has no exact text content`);
  return file.content;
}

function b119LuaRoundtripByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function b119LuaRoundtripBytesHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), value => value.toString(16).padStart(2, '0')).join('');
}

function b119LuaRoundtripBytesEqual(actual: Uint8Array, expectedText: string): boolean {
  const expected = new TextEncoder().encode(expectedText);
  return actual.byteLength === expected.byteLength && actual.every((value, index) => value === expected[index]);
}

function b119LuaRoundtripReplaceSource(
  workspace: B119LuaRoundtripWorkspace,
  path: string,
  text: string,
): B119LuaRoundtripWorkspace {
  let replaced = false;
  const passthroughFiles = b119LuaRoundtripFiles(workspace).map(file => {
    if (file.path !== path) return file;
    replaced = true;
    const next: B119LuaRoundtripFile = {
      ...file,
      content: text,
      ...(Object.prototype.hasOwnProperty.call(file, 'bytes') ? { bytes: b119LuaRoundtripByteLength(text) } : {}),
    };
    return next;
  });
  if (!replaced) throw new Error(`Source ${path} was not present for exact workspace replacement`);
  return { ...workspace, passthroughFiles };
}

function b119LuaRoundtripHierarchyIdentity(
  nodes: readonly B119LuaRoundtripHierarchyNode[],
): readonly Pick<B119LuaRoundtripHierarchyNode, 'label' | 'id' | 'level'>[] {
  return nodes.map(({ label, id, level }) => ({ label, id, level }));
}

function b119LuaRoundtripMatchesExpected(
  snapshot: B119LuaRoundtripSelectedWorkspace,
  workspaceId: string,
  expectedWorkspace: B119LuaRoundtripWorkspace,
): boolean {
  const expected = JSON.stringify(expectedWorkspace);
  return snapshot.workspaceId === workspaceId
    && JSON.stringify(snapshot.localWorkspace) === expected
    && JSON.stringify(snapshot.serverWorkspace) === expected;
}

function b119LuaRoundtripSafeModId(value: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || 'x4_md_studio_mod';
}

function b119LuaRoundtripArtifactId(workspace: B119LuaRoundtripWorkspace): string {
  const sourceFolder = workspace.sourceFolder;
  if (typeof sourceFolder === 'string' && sourceFolder.length > 0) {
    const base = sourceFolder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
    return b119LuaRoundtripSafeModId(base);
  }
  const contentId = workspace.contentId;
  if (typeof contentId === 'string' && /^[A-Za-z][\w.-]*$/.test(contentId)) return contentId;
  return b119LuaRoundtripSafeModId(typeof workspace.name === 'string' ? workspace.name : '');
}

function b119LuaRoundtripEscapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;');
}

function b119LuaRoundtripExpectedUiXml(workspace: B119LuaRoundtripWorkspace, sourcePath: string): string {
  const addonName = b119LuaRoundtripEscapeXml(b119LuaRoundtripArtifactId(workspace));
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<addon name="${addonName}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="../../ui/core/addon.xsd">`,
    `  <environment type="menus"><file name="${b119LuaRoundtripEscapeXml(sourcePath)}" /></environment>`,
    '</addon>',
    '',
  ].join('\n');
}

function b119LuaRoundtripExpectedImportedWorkspace(
  baseline: B119LuaRoundtripWorkspace,
  sourcePath: string,
  sourceText: string,
): B119LuaRoundtripWorkspace {
  if (b119LuaRoundtripFileAt(baseline, 'ui.xml') !== undefined) throw new Error('Independent workspace unexpectedly already has ui.xml; source-less literal import expectation is not applicable');
  if (b119LuaRoundtripFiles(baseline).some(file => /\.lua$/i.test(file.path))) throw new Error('Independent workspace unexpectedly already has Lua source files');
  const uiXml = b119LuaRoundtripExpectedUiXml(baseline, sourcePath);
  return {
    ...baseline,
    passthroughFiles: [
      ...b119LuaRoundtripFiles(baseline),
      { path: 'ui.xml', content: uiXml, reason: 'partial', bytes: b119LuaRoundtripByteLength(uiXml) },
      { path: sourcePath, content: sourceText, reason: 'partial', bytes: b119LuaRoundtripByteLength(sourceText) },
    ],
  };
}

async function readB119LuaRoundtripSelectedWorkspace(page: Page): Promise<B119LuaRoundtripSelectedWorkspace> {
  const snapshot = await page.evaluate(async () => {
    const windowState = window as unknown as {
      __X4_WORKSPACE_CONTEXT__?: { getWorkspaceId?: () => unknown };
      __X4_E2E__?: { getWorkspace?: () => unknown };
    };
    const workspaceId = windowState.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId?.();
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) throw new Error('Selected workspace context did not expose an immutable workspaceId');
    const localWorkspace = windowState.__X4_E2E__?.getWorkspace?.();
    if (localWorkspace === null || typeof localWorkspace !== 'object') throw new Error('Selected workspace local state is unavailable');
    const response = await fetch('/api/agent/workspace');
    if (!response.ok) throw new Error(`Selected workspace read failed: ${response.status}`);
    const envelope = await response.json() as { readonly workspaceId?: unknown; readonly workspace?: unknown; readonly [key: string]: unknown };
    if (envelope.workspaceId !== workspaceId) throw new Error(`Selected workspace read addressed ${String(envelope.workspaceId)} instead of ${workspaceId}`);
    if (envelope.workspace === null || typeof envelope.workspace !== 'object') throw new Error('Selected workspace server state is unavailable');
    return {
      workspaceId,
      envelope,
      localWorkspace: localWorkspace as B119LuaRoundtripWorkspace,
      serverWorkspace: envelope.workspace as B119LuaRoundtripWorkspace,
    };
  });
  return {
    ...snapshot,
    localWorkspace: b119LuaRoundtripWorkspace(snapshot.localWorkspace, 'Selected workspace local state'),
    serverWorkspace: b119LuaRoundtripWorkspace(snapshot.serverWorkspace, 'Selected workspace server state'),
  };
}

async function waitB119LuaRoundtripWorkspaceSync(page: Page, message: string): Promise<B119LuaRoundtripSelectedWorkspace> {
  await expect.poll(async () => {
    const snapshot = await readB119LuaRoundtripSelectedWorkspace(page);
    return JSON.stringify(snapshot.localWorkspace) === JSON.stringify(snapshot.serverWorkspace);
  }, { timeout: 30_000, message }).toBe(true);
  return readB119LuaRoundtripSelectedWorkspace(page);
}

async function readB119LuaRoundtripHierarchy(page: Page): Promise<readonly B119LuaRoundtripHierarchyNode[]> {
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  if (await hierarchy.count() === 0) return [];
  return hierarchy.getByRole('treeitem').evaluateAll(elements => elements.map(element => {
    const label = element.querySelector('span.font-bold')?.textContent;
    const id = element.getAttribute('data-testid');
    const level = Number(element.getAttribute('aria-level'));
    if (label === null || label.length === 0 || id === null || id.length === 0 || !Number.isInteger(level) || level < 1) {
      throw new Error('Incomplete semantic hierarchy identity in Lua roundtrip observation');
    }
    return { label, id, level, selected: element.getAttribute('aria-pressed') === 'true' };
  }));
}

async function readB119LuaRoundtripProfile(page: Page, allowInitialEmpty = false): Promise<readonly string[]> {
  const ids = ['x4-ui-profile-width', 'x4-ui-profile-height', 'x4-ui-profile-scale-mode', 'x4-ui-profile-user-scale', 'x4-ui-profile-scale'];
  const values: string[] = [];
  for (const id of ids) {
    const control = page.getByTestId(id);
    if (await control.count() === 0) {
      if (allowInitialEmpty) return [];
      throw new Error(`Lua roundtrip profile control ${id} is absent outside the initial empty checkpoint`);
    }
    const value = await control.inputValue();
    if (value.length === 0) {
      if (allowInitialEmpty) return [];
      throw new Error(`Lua roundtrip profile control ${id} has an empty saved value`);
    }
    values.push(value);
  }
  return values;
}

async function selectB119LuaRoundtripSourceAndTarget(page: Page, sourcePath: string, targetLabel: string): Promise<void> {
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  const sourceValue = await sourceSelector.locator('option').evaluateAll((options, path) => {
    const match = options.find(option => option.textContent === path);
    if (!(match instanceof HTMLOptionElement)) throw new Error(`Lua roundtrip source option ${String(path)} was not exposed`);
    return match.value;
  }, sourcePath);
  await sourceSelector.selectOption(sourceValue);
  await expect(sourceSelector.locator('option:checked')).toHaveText(sourcePath);
  const targetValue = await targetSelector.locator('option').evaluateAll((options, label) => {
    const match = options.find(option => option.textContent === label);
    if (!(match instanceof HTMLOptionElement)) throw new Error(`Lua roundtrip target option ${String(label)} was not exposed`);
    return match.value;
  }, targetLabel);
  await targetSelector.selectOption(targetValue);
  await expect(targetSelector.locator('option:checked')).toHaveText(targetLabel);
}

async function findB119LuaRoundtripTextProperty(inspector: Locator, value: string): Promise<Locator> {
  const inputs = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]');
  const candidates: Locator[] = [];
  for (let index = 0; index < await inputs.count(); index += 1) {
    const candidate = inputs.nth(index);
    if (await candidate.inputValue() === value) candidates.push(candidate);
  }
  if (candidates.length !== 1) throw new Error(`Lua roundtrip expected one selected text property for ${value}, found ${candidates.length}`);
  return candidates[0];
}

async function readB119LuaRoundtripHistory(page: Page): Promise<{ readonly undo: string; readonly redo: string }> {
  const read = async (action: 'undo' | 'redo'): Promise<string> => {
    const control = page.locator(`[data-global-action="${action}"]`);
    await expect(control).toHaveCount(1);
    const count = await control.locator('span').textContent();
    if (!/^\(\d+\)$/.test(count ?? '')) throw new Error(`Lua roundtrip ${action} history count is not readable`);
    return `${count}|disabled=${await control.isDisabled()}`;
  };
  return { undo: await read('undo'), redo: await read('redo') };
}

type B119LuaRoundtripHistoryState = {
  readonly count: number;
  readonly disabled: boolean;
};

function b119LuaRoundtripHistoryState(value: string, label: string): B119LuaRoundtripHistoryState {
  const match = /^\((\d+)\)\|disabled=(true|false)$/.exec(value);
  if (match === null) throw new Error(`${label} history state is not readable: ${value}`);
  return { count: Number(match[1]), disabled: match[2] === 'true' };
}

function assertB119LuaRoundtripHistory(
  history: { readonly undo: string; readonly redo: string },
  expectedUndoCount: number,
  expectedRedoCount: number,
  label: string,
): void {
  expect(b119LuaRoundtripHistoryState(history.undo, `${label} undo`)).toEqual({
    count: expectedUndoCount,
    disabled: expectedUndoCount === 0,
  });
  expect(b119LuaRoundtripHistoryState(history.redo, `${label} redo`)).toEqual({
    count: expectedRedoCount,
    disabled: expectedRedoCount === 0,
  });
}

function runB119LuaRoundtripOracleSelfCheck(): void {
  const source = 'local menu = {}\r\nreturn menu\r\n';
  const baseline: B119LuaRoundtripWorkspace = {
    id: 'b119-oracle-workspace',
    name: 'B119 oracle workspace',
    passthroughFiles: [
      { path: 'content.xml', content: 'keep sibling', reason: 'unknown_domain' },
      { path: 'ui/oracle.lua', content: source, reason: 'partial', bytes: b119LuaRoundtripByteLength(source) },
    ],
  };
  const expected = b119LuaRoundtripReplaceSource(baseline, 'ui/oracle.lua', 'local menu = {}\nreturn menu\n');
  const snapshot: B119LuaRoundtripSelectedWorkspace = {
    workspaceId: 'b119-oracle-id',
    envelope: {},
    localWorkspace: expected,
    serverWorkspace: expected,
  };
  expect(b119LuaRoundtripMatchesExpected(snapshot, 'b119-oracle-id', expected)).toBe(true);
  expect(b119LuaRoundtripMatchesExpected(snapshot, 'b119-oracle-id-wrong', expected)).toBe(false);
  const siblingMutation = b119LuaRoundtripWorkspace({
    ...expected,
    passthroughFiles: expected.passthroughFiles.map(file => file.path === 'content.xml'
      ? { ...file, content: 'mutated sibling' }
      : file),
  }, 'B119 oracle sibling mutation');
  expect(b119LuaRoundtripMatchesExpected(snapshot, 'b119-oracle-id', siblingMutation)).toBe(false);
  expect(b119LuaRoundtripBytesEqual(new TextEncoder().encode('a\r\nb\n'), 'a\r\nb\n')).toBe(true);
  expect(b119LuaRoundtripBytesEqual(new TextEncoder().encode('a\nb\n'), 'a\r\nb\n')).toBe(false);
}

runB119LuaRoundtripOracleSelfCheck();

async function setupB119LuaRoundtripFixture(page: Page): Promise<readonly B119LuaRoundtripFile[]> {
  const startupCard = page.getByTestId('health-card');
  await page.addLocatorHandler(startupCard, async () => {
    // Exercise the normal dismiss control; do not fake a healthy installed game or force clicks through it.
    await page.getByTestId('health-card-dismiss').click();
    await expect(startupCard).toBeHidden();
  });
  const unrelatedFiles = [
    { path: 'content.xml', content: '<content id="b119_lua_roundtrip_unrelated" />\r\n', reason: 'unknown_domain' as const },
    { path: 'libraries/b119-unrelated.xml', content: '<library id="b119_lua_roundtrip_unrelated" />\n', reason: 'unknown_domain' as const },
  ];
  await seedServerWorkspace({
    ...buildTemplateWorkspace('blank'),
    id: 'b119-lua-file-roundtrip-browser-worker',
    name: 'B119 Lua file roundtrip starting workspace',
    description: 'Initial empty UI source fixture with unrelated preservation records.',
    uiWidgets: [],
    customLua: '',
    compileSettings: { ui: false },
    passthroughFiles: unrelatedFiles,
  });
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  const expert = page.getByTestId('mode-expert');
  await expect(expert).toBeVisible();
  await expert.click();
  await expect(expert).toHaveAttribute('aria-pressed', 'true');
  const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
  await expect(uiDesigner).toBeVisible();
  await uiDesigner.click();
  await expect(uiDesigner).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('x4-ui-builder-canvas-column')).toHaveCount(1);
  // The mounted Session refuses rendering without a source; "empty" is only the pre-effect state.
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('refused');
  await expect(page.getByTestId('x4-ui-canvas-detail')).toContainText('Session is not renderable:');
  await expect(page.getByRole('button', { name: 'Open Lua file' })).toBeEnabled();
  await expect(page.getByTestId('x4-ui-canvas-host').locator('canvas')).toHaveCount(0);
  await expect(page.getByTestId('x4-ui-builder-hierarchy-empty')).toHaveText(
    'Select an exact source and target with a projected Session before using the hierarchy.',
  );
  await expect(page.getByTestId('x4-ui-source-selector')).toHaveValue('');
  await expect(page.getByTestId('x4-ui-target-selector')).toHaveValue('');
  return unrelatedFiles;
}

const b119ProfiledTest = test.extend<{ authoringCpuProfile: void; workspaceAbortTrace: void }>({
  workspaceAbortTrace: [async ({ page }, runTest, testInfo) => {
    if (process.env.X4_FORGE_B119_WORKSPACE_TRACE !== '1') {
      await runTest();
      return;
    }
    const events: Record<string, unknown>[] = [];
    let overflow = 0;
    const record = (event: Record<string, unknown>) => {
      if (events.length < 4096) events.push(event);
      else overflow += 1;
    };
    const requestIds = new WeakMap<object, number>();
    let nextRequestId = 0;
    await page.exposeBinding('__b119WorkspaceTrace', (_source, event: Record<string, unknown>) => record(event));
    page.on('request', request => {
      if (!/^\/api\/agent\/workspaces?$/.test(new URL(request.url()).pathname)) return;
      const id = ++nextRequestId;
      requestIds.set(request, id);
      record({ kind: 'network-start', id, time: Date.now(), method: request.method(),
        url: request.url(), workspace: request.headers()['x-workspace-id'] ?? null });
    });
    page.on('response', response => {
      const id = requestIds.get(response.request());
      if (id !== undefined) record({ kind: 'network-response', id, time: Date.now(), status: response.status() });
    });
    page.on('requestfailed', request => {
      const id = requestIds.get(request);
      if (id !== undefined) record({ kind: 'network-failed', id, time: Date.now(),
        startTime: request.timing().startTime, failure: request.failure()?.errorText ?? null });
    });
    await page.addInitScript(() => {
      const observedWindow = window as typeof window & {
        __b119WorkspaceTrace: (event: Record<string, unknown>) => Promise<void>;
        __b119WorkspaceTraceFlush?: () => Promise<{ deliveryFailures: number }>;
      };
      const documentId = crypto.randomUUID();
      const pending = new Set<Promise<void>>();
      let deliveryFailures = 0;
      let nextId = 0;
      const emit = (event: Record<string, unknown>) => {
        const delivery = observedWindow.__b119WorkspaceTrace({ documentId, time: Date.now(),
          clock: performance.timeOrigin + performance.now(), ...event }).catch(() => { deliveryFailures += 1; });
        pending.add(delivery);
        void delivery.then(() => pending.delete(delivery));
      };
      observedWindow.__b119WorkspaceTraceFlush = async () => {
        await Promise.all([...pending]);
        return { deliveryFailures };
      };
      const selected = () => window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() ?? null;
      const originalFetch = window.fetch;
      window.fetch = function (input, init) {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin !== location.origin || !/^\/api\/agent\/workspaces?$/.test(url.pathname)) {
          return originalFetch.call(this, input, init);
        }
        const id = ++nextId;
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        emit({ kind: 'fetch-start', id, url: url.href, method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
          workspace: headers.get('x-workspace-id'), selected: selected(), hasSignal: Boolean(signal),
          aborted: signal?.aborted ?? false, stack: new Error('workspace fetch observation').stack });
        const aborted = () => emit({ kind: 'signal-abort', id, selected: selected(),
          reason: signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason),
          stack: signal?.reason instanceof Error ? signal.reason.stack : null });
        if (signal?.aborted) aborted();
        else signal?.addEventListener('abort', aborted, { once: true });
        // Keep the original promise and body reader. An abort after headers still matters.
        const promise = originalFetch.call(this, input, init);
        void promise.then(response => emit({ kind: 'fetch-response', id, status: response.status, selected: selected() }),
          error => emit({ kind: 'fetch-rejected', id, selected: selected(),
            error: error instanceof Error ? error.message : String(error) }));
        return promise;
      };
      emit({ kind: 'document-start' });
    });
    try {
      await runTest();
    } finally {
      if (!page.isClosed()) {
        const flushed = await page.evaluate(async () => {
          const target = window as typeof window & { __b119WorkspaceTraceFlush?: () => Promise<{ deliveryFailures: number }> };
          return target.__b119WorkspaceTraceFlush?.() ?? null;
        });
        record({ kind: 'flush', result: flushed });
      }
      const outputPath = testInfo.outputPath('b119-workspace-abort-trace.json');
      await writeFile(outputPath, JSON.stringify({ events, overflow }, null, 2));
      await testInfo.attach('b119-workspace-abort-trace', { path: outputPath, contentType: 'application/json' });
      expect(overflow, 'workspace trace must not silently truncate').toBe(0);
    }
  }, { auto: true, timeout: 30_000 }],
  authoringCpuProfile: [async ({ page }, runTest, testInfo) => {
    if (process.env.X4_FORGE_B119_CPU_PROFILE !== '1') {
      await runTest();
      return;
    }
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Profiler.enable');
      await session.send('Profiler.setSamplingInterval', { interval: 1000 });
      await session.send('Profiler.start');
      try {
        await runTest();
      } finally {
        const { profile } = await session.send('Profiler.stop');
        const profilePath = testInfo.outputPath('b119-authoring.cpuprofile');
        await writeFile(profilePath, JSON.stringify(profile));
        await testInfo.attach('b119-authoring-cpu-profile', {
          path: profilePath, contentType: 'application/json',
        });
      }
    } finally {
      await session.detach();
    }
  }, { auto: true, timeout: 30_000 }],
});

b119ProfiledTest('SourceEditor preserves actual browser history for New-menu row and Text authoring', async ({ page, request }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const { unrelated } = await setupContextualInsertionFixture(page, request);
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  const canvas = page.getByTestId('x4-ui-canvas-host').locator('canvas');
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  const inspector = page.getByTestId('x4-ui-builder-selection');
  const selectedNodeLabel = page.getByTestId('x4-ui-builder-selected-node-label');
  const selectionEmpty = page.getByTestId('x4-ui-builder-selection-empty');
  const undoButton = page.locator('[data-global-action="undo"]');
  const redoButton = page.locator('[data-global-action="redo"]');
  const uiDesignerButton = page.locator('[data-workspace-view="ui-designer"]');
  await uiDesignerButton.focus();
  await expect(uiDesignerButton).toBeFocused();
  const normalizeBoundaryPassthroughFiles = (workspace: CreationWorkspace): readonly (readonly [string, string])[] => workspace.passthroughFiles
    .map(file => [file.path, file.content] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  const boundaryBefore: Record<string, unknown> = await readServerWorkspace();
  const boundaryBeforePassthrough = normalizeBoundaryPassthroughFiles(boundaryBefore as CreationWorkspace);
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('Control+z');
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
  }
  const boundaryAfter: Record<string, unknown> = await readServerWorkspace();
  expect(boundaryAfter).toEqual(boundaryBefore);
  expect(normalizeBoundaryPassthroughFiles(boundaryAfter as CreationWorkspace)).toEqual(boundaryBeforePassthrough);

  const sibling = await createActualNewMenu(page, 'B119 History sibling');
  const siblingLua = sibling.passthroughFiles.find(file => file.path.endsWith('.lua'));
  expect(siblingLua).toBeDefined();
  if (siblingLua === undefined) throw new Error('history sibling New-menu source was not created');

  const menuName = 'B119 History menu';
  const created = await createActualNewMenu(page, menuName);
  const menuLuaCandidates = created.passthroughFiles.filter(file => file.path.endsWith('.lua') && file.path !== siblingLua.path);
  expect(menuLuaCandidates).toHaveLength(1);
  const menuLua = menuLuaCandidates[0];
  if (menuLua === undefined) throw new Error('history menu source was not created');
  const uiXml = created.passthroughFiles.find(file => file.path === 'ui.xml');
  expect(uiXml).toBeDefined();
  if (uiXml === undefined) throw new Error('history fixture ui.xml disappeared after New-menu creation');
  const unchangedLuaContents = new Map(
    created.passthroughFiles
      .filter(file => file.path.endsWith('.lua') && file.path !== menuLua.path)
      .map(file => [file.path, file.content] as const),
  );
  const initialPassthroughEntries = created.passthroughFiles.map(file => [file.path, file.content] as const);
  expect(new Set(initialPassthroughEntries.map(([path]) => path)).size).toBe(initialPassthroughEntries.length);

  const readMenuSource = async (): Promise<string> => {
    const current = await readServerWorkspace() as CreationWorkspace;
    const source = current.passthroughFiles.find(file => file.path === menuLua.path);
    if (source === undefined) throw new Error('history menu source disappeared from the workspace');
    return source.content;
  };
  const expectedPassthroughFor = (expectedSource: string): readonly (readonly [string, string])[] => {
    const expected = new Map(initialPassthroughEntries);
    expected.set(menuLua.path, expectedSource);
    return [...expected.entries()].sort(([left], [right]) => left.localeCompare(right));
  };
  const assertHistoryWorkspace = async (expectedSource: string): Promise<void> => {
    const current = await readServerWorkspace() as CreationWorkspace;
    const actual = current.passthroughFiles
      .map(file => [file.path, file.content] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    expect(actual).toEqual(expectedPassthroughFor(expectedSource));
    assertContextualLuaSiblings(current, menuLua.path, expectedSource, uiXml.content, unrelated, unchangedLuaContents);
  };
  const assertRowHierarchy = async (expectedRowCount: number): Promise<void> => {
    const rowNodes = hierarchy.getByRole('treeitem').filter({ has: page.getByText(/^Row \d+$/, { exact: true }) });
    await expect(rowNodes).toHaveCount(expectedRowCount);
    for (let index = 0; index < expectedRowCount; index += 1) {
      await expect(rowNodes.nth(index)).toContainText(`Row ${index + 1}`);
    }
  };

  const historySnapshots: Array<{
    readonly state: string;
    readonly source: string;
    readonly nativeCanvas: NativeCanvasSignature;
  }> = [];
  const historySnapshotsPath = test.info().outputPath('b119-source-history-lua-snapshots.json');
  const screenshotStates = new Set(['initial', 'widget-inserted', 'text-edited', 'alternate-edit']);
  const captureHistoryState = async (state: string, expectedSource: string): Promise<NativeCanvasSignature> => {
    await assertHistoryWorkspace(expectedSource);
    const expectedRowCount = (expectedSource.match(/addRow\(false, \{\}\)/g) ?? []).length;
    await assertRowHierarchy(expectedRowCount);
    await expect(sourceSelector.locator('option:checked')).toHaveText(menuLua.path);
    await expect(targetSelector.locator('option:checked')).toHaveText('menu.createFrame');
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toBeInViewport();
    await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
    const nativeCanvas = await readNativeCanvasSignature(page);
    expect(nativeCanvas.width).toBeGreaterThan(0);
    expect(nativeCanvas.height).toBeGreaterThan(0);
    expect(nativeCanvas.nonTransparentPixels).toBeGreaterThan(0);
    if (screenshotStates.has(state)) {
      const screenshotPath = test.info().outputPath(`b119-source-history-${state}.png`);
      await page.screenshot({ path: screenshotPath });
      await test.info().attach(`b119-source-history-${state}`, { path: screenshotPath, contentType: 'image/png' });
    }
    historySnapshots.push({ state, source: expectedSource, nativeCanvas });
    await writeFile(historySnapshotsPath, JSON.stringify(historySnapshots, null, 2), 'utf8');
    return nativeCanvas;
  };

  const reselectFreshHierarchyNode = async (label: string, retained: boolean, survivingLabel?: string): Promise<void> => {
    if (retained || survivingLabel !== undefined) await expect(selectionEmpty).toHaveCount(0);
    else await expect(selectionEmpty).toBeVisible();
    if (survivingLabel !== undefined) {
      const survivingNode = hierarchy.getByRole('treeitem').filter({ has: page.getByText(survivingLabel, { exact: true }) });
      await expect(survivingNode).toHaveCount(1);
      await expect(survivingNode).toHaveAttribute('aria-pressed', 'true');
      await expect(selectedNodeLabel).toHaveText(survivingLabel);
    }
    const currentNode = hierarchy.getByRole('treeitem').filter({ has: page.getByText(label, { exact: true }) });
    await expect(currentNode).toHaveCount(1);
    if (!retained) await currentNode.click();
    await expect(selectedNodeLabel).toHaveText(label);
    await expect(currentNode).toHaveAttribute('aria-pressed', 'true');
    const selectionBox = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
    if (label.startsWith('Text · ')) {
      if (selectionBox === null || selectionBox.width <= 0 || selectionBox.height <= 0) {
        throw new Error(`${label} fresh Text selection has no positive rendered canvas geometry`);
      }
    } else if (/^Row \d+$/.test(label)) {
      if (selectionBox === null || selectionBox.width <= 0 || selectionBox.height <= 0) {
        throw new Error(`${label} fresh row selection has no positive rendered canvas geometry`);
      }
    }
  };

  const transitionHistory = async (
    direction: 'undo' | 'redo',
    expectedSource: string,
    freshSelectionLabel: string,
    state: string,
    retainedSelection = false,
    survivingSelectionLabel?: string,
  ): Promise<NativeCanvasSignature> => {
    const button = direction === 'undo' ? undoButton : redoButton;
    const previousCanvas = await canvas.elementHandle();
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(readMenuSource, { timeout: 30_000, message: `${direction} ${state} source transition` }).toBe(expectedSource);
    await reselectFreshHierarchyNode(freshSelectionLabel, retainedSelection, survivingSelectionLabel);
    await assertFreshNativeCanvas(page, previousCanvas, state);
    return captureHistoryState(state, expectedSource);
  };

  const initialSource = menuLua.content;
  const initialCanvas = await captureHistoryState('initial', initialSource);
  const firstRow = hierarchy.getByRole('treeitem').filter({ hasText: /^Row 1/ });
  await expect(firstRow).toHaveCount(1);
  await firstRow.click();
  await expect(page.getByTestId('x4-ui-contextual-palette-status')).toContainText('Select an empty cell to add text, button, or input.');

  const beforeRowSource = await readMenuSource();
  expect(beforeRowSource).toBe(initialSource);
  const addRow = page.getByTestId('x4-ui-contextual-palette-add-row');
  await expect(addRow).toBeEnabled();
  await addRow.click();
  await expect.poll(readMenuSource, { timeout: 30_000, message: 'history Add row source transition' }).not.toBe(beforeRowSource);
  const rowAddedSource = await readMenuSource();
  assertSingleInsertedSourceDelta(
    beforeRowSource,
    rowAddedSource,
    rowInsertionOraclePattern,
    'history Add row must be exactly one local canonical row insertion',
  );
  const selectedHierarchyNode = hierarchy.locator('button[aria-pressed="true"]');
  await expect(selectedHierarchyNode).toHaveCount(1);
  await expect(selectedHierarchyNode).toContainText('Cell 1');
  const rowAddedCanvas = await captureHistoryState('row-added', rowAddedSource);

  const insertedText = 'B119 history inserted text';
  const beforeWidgetSource = await readMenuSource();
  expect(beforeWidgetSource).toBe(rowAddedSource);
  const paletteText = page.getByTestId('x4-ui-contextual-palette-text');
  await expect(paletteText).toHaveValue('New text');
  await paletteText.fill(insertedText);
  const addText = page.getByTestId('x4-ui-contextual-palette-add-text');
  await expect(addText).toBeEnabled();
  await addText.click();
  await expect.poll(readMenuSource, { timeout: 30_000, message: 'history Text insertion source transition' }).not.toBe(beforeWidgetSource);
  const widgetInsertedSource = await readMenuSource();
  const insertedWidgetLine = assertSingleInsertedSourceDelta(
    beforeWidgetSource,
    widgetInsertedSource,
    /:createText\(/,
    'history Text insertion must be exactly one local source insertion',
  );
  expect(insertedWidgetLine).toContain(JSON.stringify(insertedText));
  await expect(selectedNodeLabel).toHaveText(`Text · ${insertedText}`);
  const insertedSelectionBox = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
  if (insertedSelectionBox === null || insertedSelectionBox.width <= 0 || insertedSelectionBox.height <= 0) {
    throw new Error('history Text insertion did not produce a rendered selected canvas rectangle');
  }
  const widgetInsertedCanvas = await captureHistoryState('widget-inserted', widgetInsertedSource);
  expect(widgetInsertedCanvas.pixelSignature).not.toBe(rowAddedCanvas.pixelSignature);

  const findTextPropertyInput = async (value: string) => {
    const propertyInputs = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]');
    const propertyInputCount = await propertyInputs.count();
    let propertyInput = propertyInputs.first();
    for (let index = 0; index < propertyInputCount; index += 1) {
      const candidate = propertyInputs.nth(index);
      if (await candidate.inputValue() === value) {
        propertyInput = candidate;
        break;
      }
    }
    if (await propertyInput.inputValue() !== value) throw new Error(`history source editor did not expose the ${value} Text property`);
    return propertyInput;
  };

  const editedText = 'B119 history edited text';
  const propertyInput = await findTextPropertyInput(insertedText);
  const propertyTestId = await propertyInput.getAttribute('data-testid');
  if (propertyTestId === null) throw new Error('history Text property has no source entry identity');
  const propertyApply = inspector.getByTestId(propertyTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
  await propertyInput.fill(editedText);
  await expect(propertyApply).toBeEnabled();
  const beforeEditSource = await readMenuSource();
  expect(beforeEditSource).toBe(widgetInsertedSource);
  await propertyApply.click();
  await expect.poll(readMenuSource, { timeout: 30_000, message: 'history Text edit source transition' }).not.toBe(beforeEditSource);
  const editedSource = await readMenuSource();
  assertSingleLiteralSourceReplacement(
    beforeEditSource,
    editedSource,
    insertedText,
    editedText,
    'history Text edit must be exactly one whole-file literal replacement',
  );
  await expect(propertyInput).toHaveValue(editedText);
  await expect(selectedNodeLabel).toHaveText(`Text · ${editedText}`);
  const editedCanvas = await captureHistoryState('text-edited', editedSource);
  expect(editedCanvas.pixelSignature).not.toBe(widgetInsertedCanvas.pixelSignature);

  const undoTextCanvas = await transitionHistory('undo', widgetInsertedSource, `Text · ${insertedText}`, 'undo-text-edit', true);
  expect(undoTextCanvas).toEqual(widgetInsertedCanvas);
  const redoTextCanvas = await transitionHistory('redo', editedSource, `Text · ${editedText}`, 'redo-text-edit', true);
  expect(redoTextCanvas).toEqual(editedCanvas);

  const undoForWidgetRemovalCanvas = await transitionHistory('undo', widgetInsertedSource, `Text · ${insertedText}`, 'undo-before-widget-removal', true);
  expect(undoForWidgetRemovalCanvas).toEqual(widgetInsertedCanvas);
  const undoWidgetCanvas = await transitionHistory('undo', rowAddedSource, 'Row 2', 'undo-widget-insertion');
  expect(undoWidgetCanvas).toEqual(rowAddedCanvas);
  const undoRowCanvas = await transitionHistory('undo', initialSource, 'Row 1', 'undo-row-insertion');
  expect(undoRowCanvas).toEqual(initialCanvas);

  const redoRowCanvas = await transitionHistory('redo', rowAddedSource, 'Row 2', 'redo-row-insertion', false, 'Row 1');
  expect(redoRowCanvas).toEqual(rowAddedCanvas);
  const redoWidgetCanvas = await transitionHistory('redo', widgetInsertedSource, `Text · ${insertedText}`, 'redo-widget-insertion', false, 'Row 2');
  expect(redoWidgetCanvas).toEqual(widgetInsertedCanvas);
  const redoEditedCanvas = await transitionHistory('redo', editedSource, `Text · ${editedText}`, 'redo-text-edit-after-widget', true);
  expect(redoEditedCanvas).toEqual(editedCanvas);

  const alternateBaseCanvas = await transitionHistory('undo', widgetInsertedSource, `Text · ${insertedText}`, 'undo-before-alternate-edit', true);
  expect(alternateBaseCanvas).toEqual(widgetInsertedCanvas);
  const alternateText = 'B119 history alternate edit';
  const alternateInput = await findTextPropertyInput(insertedText);
  const alternateInputTestId = await alternateInput.getAttribute('data-testid');
  if (alternateInputTestId === null) throw new Error('alternate history Text property has no source entry identity');
  const alternateApply = inspector.getByTestId(alternateInputTestId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
  await alternateInput.fill(alternateText);
  await expect(alternateApply).toBeEnabled();
  const beforeAlternateSource = await readMenuSource();
  expect(beforeAlternateSource).toBe(widgetInsertedSource);
  await alternateApply.click();
  await expect.poll(readMenuSource, { timeout: 30_000, message: 'history alternate Text edit source transition' }).not.toBe(beforeAlternateSource);
  const alternateSource = await readMenuSource();
  assertSingleLiteralSourceReplacement(
    beforeAlternateSource,
    alternateSource,
    insertedText,
    alternateText,
    'alternate history Text edit must be exactly one whole-file literal replacement',
  );
  await expect(alternateInput).toHaveValue(alternateText);
  await expect(selectedNodeLabel).toHaveText(`Text · ${alternateText}`);
  const alternateCanvas = await captureHistoryState('alternate-edit', alternateSource);
  expect(alternateCanvas.pixelSignature).not.toBe(widgetInsertedCanvas.pixelSignature);
  await expect(redoButton).toBeDisabled();
  expect(await readMenuSource()).toBe(alternateSource);
  await assertHistoryWorkspace(alternateSource);
  await test.info().attach('b119-source-history-lua-snapshots', { path: historySnapshotsPath, contentType: 'application/json' });
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('SourceEditor exports only the current mounted PNG evidence', async ({ page, request }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const downloads: unknown[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('download', download => downloads.push(download));
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.route('**/api/agent/health-card**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ verdict: 'ready', summary: 'E2E export fixture ready.', rows: [] }),
  }));
  const referenceRoot = 'source-editor-p7-e2e-canonical-root';
  const referenceGeneration = 'source-editor-p7-e2e-generation';
  const referenceGeneratedAt = '2026-09-02T00:00:00.000Z';
  await page.route('**/api/reference/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      available: true,
      root: referenceRoot,
      generatedAt: referenceGeneratedAt,
      manifestGeneration: referenceGeneration,
      manifest: {
        available: true,
        state: 'ready',
        root: referenceRoot,
        current: { generation: referenceGeneration, root: referenceRoot, generatedAt: referenceGeneratedAt },
      },
    }),
  }));
  await page.route('**/api/reference/manifest**', async route => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.searchParams.get('q');
    const fileBytes = path === null ? undefined : await (async () => {
      const fileUrl = new URL('/api/reference/file', requestUrl.origin);
      fileUrl.searchParams.set('path', path);
      const fileResponse = await request.get(fileUrl.toString());
      if (!fileResponse.ok()) throw new Error(`SourceEditor export fixture file request failed: ${fileResponse.status()}`);
      const fileBody = await fileResponse.body();
      const contentLength = Number(fileResponse.headers()['content-length']);
      return Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : fileBody.byteLength;
    })();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: {
          available: true,
          state: 'ready',
          root: referenceRoot,
          current: {
            generation: referenceGeneration,
            root: referenceRoot,
            generatedAt: referenceGeneratedAt,
          },
        },
        generation: referenceGeneration,
        total: path === null ? 0 : 1,
        limit: 500,
        offset: 0,
        files: path === null || fileBytes === undefined ? [] : [{ path, bytes: fileBytes }],
      }),
    });
  });
  await seedServerWorkspace(sourceEditorWorkspace);
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();

  const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
  await uiDesigner.click();
  await expect(uiDesigner).toHaveAttribute('aria-current', 'page');
  const editor = page.getByTestId('x4-ui-source-editor');
  await expect(editor).toBeVisible();
  await page.getByTestId('x4-ui-inspect-toggle').click();
  await page.getByTestId('x4-ui-preview-settings-toggle').click();

  const exportButton = page.getByTestId('x4-ui-canvas-export');
  const exportStatus = page.getByTestId('x4-ui-canvas-export-status');
  const canvasHost = page.getByTestId('x4-ui-canvas-host');
  const canvas = canvasHost.locator('canvas');
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  const scaleMode = page.getByTestId('x4-ui-profile-scale-mode');
  const userScale = page.getByTestId('x4-ui-profile-user-scale');
  const effectiveScale = page.getByTestId('x4-ui-profile-scale');
  const gameTruth = page.getByTestId('x4-ui-game-truth');
  const expectedSuccessfulDownloadStatus = /^PNG serialization succeeded; a save\/download request was handed to the host\/browser · final Save As\/file completion is not verified; please confirm the file · Not verified in game$/;
  await expect(page.getByTestId('x4-ui-canvas-export-target')).toContainText('Target: unavailable');
  await expect(page.getByTestId('x4-ui-canvas-export-target')).not.toContainText('Top-level menu');
  await expect(exportButton).toBeDisabled();
  await expect(canvas).toHaveCount(0);
  await expect(gameTruth).toHaveText(/^Not verified in game$/);
  await expect(scaleMode).toHaveValue('derived-from-x4-user-scale');
  await expect(userScale).toHaveValue('1.05');
  await expect(effectiveScale).toHaveValue('1.4');
  await expect(effectiveScale).toBeDisabled();
  await expect(page.getByTestId('x4-ui-profile-scale-derivation')).toContainText('drawable height');
  await expect(page.getByTestId('x4-ui-profile-scale-derivation')).toContainText('1080');
  await expect(page.getByTestId('x4-ui-profile-scale-derivation')).toContainText('Drawable width does not affect');
  await expect(page.getByTestId('x4-ui-corpus-status')).toHaveText(/^canonical$/i);

  const sourceOption = sourceSelector.locator('option').filter({ hasText: 'ui/x4-ui-source-editor-p7-e2e.lua' }).first();
  await expect(sourceOption).toHaveCount(1);
  const sourceValue = await sourceOption.getAttribute('value');
  if (sourceValue === null) throw new Error('SourceEditor export fixture source option has no value');
  await sourceSelector.selectOption(sourceValue);
  const targetOption = targetSelector.locator('option').nth(1);
  await expect(targetOption).toHaveCount(1);
  const targetLabel = (await targetOption.textContent())?.trim();
  if (targetLabel === undefined || targetLabel.length === 0) throw new Error('SourceEditor export fixture target option has no label');
  const targetValue = await targetOption.getAttribute('value');
  if (targetValue === null) throw new Error('SourceEditor export fixture target option has no value');
  await targetSelector.selectOption(targetValue);

  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('width', '2560');
  await expect(canvas).toHaveAttribute('height', '1440');
  await expect(exportButton).toBeEnabled();
  await expect(page.getByTestId('x4-ui-canvas-export-source')).toContainText('ui/x4-ui-source-editor-p7-e2e.lua');
  await expect(page.getByTestId('x4-ui-canvas-export-target')).toContainText(targetLabel);
  await expect(page.getByTestId('x4-ui-canvas-export-target')).toContainText('kind top-level');
  await page.getByTestId('x4-ui-canvas-export-target').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('b119-export-friendly-target.png') });
  await expect(page.getByTestId('x4-ui-canvas-export-profile')).toContainText('2560 × 1440');
  await expect(page.getByTestId('x4-ui-canvas-export-profile')).toContainText('Effective Helper scale 1.4');
  await expect(page.getByTestId('x4-ui-canvas-export-native-width')).toHaveText('2560');
  await expect(page.getByTestId('x4-ui-canvas-export-native-height')).toHaveText('1440');
  await expect(page.getByTestId('x4-ui-canvas-export-boundary')).toHaveText(/^Preview evidence only · Not verified in game$/);

  const previewPathsRegion = page.getByTestId('x4-ui-preview-paths-region');
  const previewLoopsRegion = page.getByTestId('x4-ui-preview-loops-region');
  const previewSamplesRegion = page.getByTestId('x4-ui-samples-region');
  await expect(previewPathsRegion).toBeVisible();
  await expect(previewLoopsRegion).toBeVisible();
  await expect(previewSamplesRegion).toBeVisible();
  await expect(previewLoopsRegion.getByTestId('x4-ui-preview-loops-preview-only')).toHaveText('Preview only');
  await expect(previewLoopsRegion.getByTestId('x4-ui-preview-loops-truth')).toHaveText('Not verified in game');
  const previewPanelOrder = await page.evaluate(() => {
    const ids = ['x4-ui-preview-paths-region', 'x4-ui-preview-loops-region', 'x4-ui-samples-region'];
    const positions = ids.map(id => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element === null ? -1 : Array.from(document.querySelectorAll('[data-testid]')).indexOf(element);
    });
    return positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1]!));
  });
  expect(previewPanelOrder).toBe(true);

  const loopTargetOption = targetSelector.locator('option').filter({ hasText: 'menu.previewLoop' }).first();
  await expect(loopTargetOption).toHaveCount(1);
  const loopTargetValue = await loopTargetOption.getAttribute('value');
  if (loopTargetValue === null) throw new Error('SourceEditor loop fixture target option has no value');
  await targetSelector.selectOption(loopTargetValue);
  await expect(page.getByTestId('x4-ui-canvas-export-target')).toContainText('menu.previewLoop');
  await expect(page.getByTestId('x4-ui-canvas-export-target')).not.toContainText('Top-level menu');
  const loopControl = previewLoopsRegion.locator('input[data-testid^="x4-ui-preview-loop-control-"]').first();
  const workspaceBeforeLoopOverrides = await readServerWorkspace();
  const loopStatus = previewLoopsRegion.locator('[data-testid^="x4-ui-preview-loop-status-"]').first();
  await expect(loopControl).toHaveCount(1);
  await expect(loopControl).toHaveValue('');
  await expect(loopControl).toHaveAttribute('placeholder', 'Automatic: 2');
  await expect(loopStatus).toHaveText('Automatic from source: 2 iterations');
  await expect(previewLoopsRegion.getByTestId('x4-ui-preview-loops-reset')).toBeDisabled();
  const loopSourceDetails = previewLoopsRegion.locator('[data-testid^="x4-ui-preview-loop-source-"]').first();
  const loopDisclosure = previewLoopsRegion.getByText('Source details', { exact: true }).first();
  await expect(loopSourceDetails).toBeHidden();
  await loopDisclosure.click();
  await expect(loopSourceDetails).toBeVisible();
  await loopDisclosure.click();
  await expect(loopSourceDetails).toBeHidden();
  await expect(loopControl).toHaveAccessibleName('Loop 1 preview override');
  await loopControl.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('b119-loop-automatic.png') });
  await expect(loopControl).toHaveAttribute('min', '1');
  await expect(loopControl).toHaveAttribute('max', '16');
  await expect(loopControl).toHaveAttribute('step', '1');
  await loopControl.fill('4');
  await expect(loopControl).toHaveValue('4');
  await expect(loopStatus).toHaveText('Manual preview: 4 iterations');
  await loopControl.fill('');
  await expect(loopControl).toHaveValue('');
  await expect(loopStatus).toHaveText('Automatic from source: 2 iterations');
  await loopControl.fill('4');
  await expect(loopStatus).toHaveText('Manual preview: 4 iterations');
  await page.screenshot({ path: test.info().outputPath('b119-loop-manual.png') });
  await expect(previewLoopsRegion.getByTestId('x4-ui-preview-loops-truth')).toHaveText('Not verified in game');
  await previewLoopsRegion.getByTestId('x4-ui-preview-loops-reset').click();
  await expect(loopControl).toHaveValue('');
  await expect(loopStatus).toHaveText('Automatic from source: 2 iterations');
  await expect(loopControl).toHaveAttribute('placeholder', 'Automatic: 2');
  await page.screenshot({ path: test.info().outputPath('b119-loop-reset.png') });
  expect(await readServerWorkspace()).toEqual(workspaceBeforeLoopOverrides);
  await expect(previewLoopsRegion.getByTestId('x4-ui-preview-loops-truth')).toHaveText('Not verified in game');
  await targetSelector.selectOption(targetValue);
  await expect(canvas).toHaveCount(1);

  await page.evaluate(() => {
    const host = document.querySelector('[data-testid="x4-ui-canvas-host"]');
    const current = host?.firstElementChild;
    if (!(current instanceof HTMLCanvasElement)) throw new Error('SourceEditor export fixture did not mount an HTMLCanvasElement');
    (window as unknown as { __x4UiExportCanvasBefore?: Element }).__x4UiExportCanvasBefore = current;
  });
  const firstDownloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const firstDownload = await firstDownloadPromise;
  await expect.poll(() => downloads.length).toBe(1);
  const firstFilename = firstDownload.suggestedFilename();
  expect(firstFilename).toMatch(/^x4-ui-[A-Za-z0-9._-]+-[A-Za-z0-9._-]+-2560x1440-effective-scale-1\.4\.png$/);
  await expect(exportStatus).toHaveText(expectedSuccessfulDownloadStatus);
  await expect(exportStatus).toContainText('Not verified in game');
  const sameMountedCanvasAfterExport = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="x4-ui-canvas-host"]');
    const before = (window as unknown as { __x4UiExportCanvasBefore?: Element }).__x4UiExportCanvasBefore;
    return host?.firstElementChild === before;
  });
  expect(sameMountedCanvasAfterExport).toBe(true);
  await expect(gameTruth).toHaveText(/^Not verified in game$/);

  await sourceSelector.selectOption('');
  await expect(exportButton).toBeDisabled();
  await expect(targetSelector).toHaveValue('');
  await expect(canvas).toHaveCount(1);
  await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText(/stale|refused/);
  await expect(gameTruth).toHaveText(/^Not verified in game$/);

  await sourceSelector.selectOption(sourceValue);
  await targetSelector.selectOption(targetValue);
  await expect(canvas).toHaveAttribute('width', '2560');
  await expect(canvas).toHaveAttribute('height', '1440');
  await expect(exportButton).toBeEnabled();

  await page.getByTestId('x4-ui-profile-width').fill('1800');
  await expect(canvas).toHaveAttribute('width', '1800');
  await expect(canvas).toHaveAttribute('height', '1440');
  await expect(exportButton).toBeEnabled();
  await page.getByTestId('x4-ui-profile-height').fill('900');
  await expect(canvas).toHaveAttribute('width', '1800');
  await expect(canvas).toHaveAttribute('height', '900');
  await expect(exportButton).toBeEnabled();
  await expect(page.getByTestId('x4-ui-canvas-export-profile')).toContainText('1800 × 900');
  await expect(page.getByTestId('x4-ui-canvas-export-profile')).toContainText('Effective Helper scale 0.875');
  await expect(page.getByTestId('x4-ui-canvas-export-native-width')).toHaveText('1800');
  await expect(page.getByTestId('x4-ui-canvas-export-native-height')).toHaveText('900');
  await expect(effectiveScale).toHaveValue('0.875');
  const secondDownloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const secondDownload = await secondDownloadPromise;
  await expect.poll(() => downloads.length).toBe(2);
  expect(secondDownload.suggestedFilename()).toMatch(/-1800x900-effective-scale-0\.875\.png$/);
  await expect(exportStatus).toHaveText(expectedSuccessfulDownloadStatus);

  const downloadCountBeforeSerializationNegatives = downloads.length;
  const serializationNegative = async (mode: 'missing' | 'throw' | 'empty', expected: RegExp): Promise<void> => {
    await page.evaluate((selectedMode: 'missing' | 'throw' | 'empty') => {
      const host = document.querySelector('[data-testid="x4-ui-canvas-host"]');
      const current = host?.firstElementChild;
      if (!(current instanceof HTMLCanvasElement)) throw new Error('SourceEditor export fixture canvas disappeared');
      Object.defineProperty(current, 'toBlob', {
        configurable: true,
        value: selectedMode === 'missing'
          ? undefined
          : selectedMode === 'throw'
            ? () => { throw new Error('fixture serialization throw'); }
            : (callback: BlobCallback) => callback(new Blob([], { type: 'image/png' })),
      });
    }, mode);
    await exportButton.click();
    await expect(exportStatus).toHaveText(expected);
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="x4-ui-canvas-host"]');
      const current = host?.firstElementChild;
      if (current instanceof HTMLCanvasElement) delete (current as unknown as { toBlob?: unknown }).toBlob;
    });
    await expect.poll(() => downloads.length).toBe(downloadCountBeforeSerializationNegatives);
  };
  await serializationNegative('missing', /refused: native PNG serialization is unavailable/);
  await serializationNegative('throw', /refused: native PNG serialization threw before producing a blob/);
  await serializationNegative('empty', /refused: native PNG serialization returned an empty or non-PNG blob/);

  await expect(gameTruth).toHaveText(/^Not verified in game$/);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('SourceEditor scale mode causally tracks drawable height and custom retention', async ({ page, request }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.route('**/api/agent/health-card**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ verdict: 'ready', summary: 'E2E scale fixture ready.', rows: [] }),
  }));
  const referenceRoot = 'source-editor-p7-e2e-canonical-root';
  const referenceGeneration = 'source-editor-p7-e2e-generation';
  const referenceGeneratedAt = '2026-09-02T00:00:00.000Z';
  await page.route('**/api/reference/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      available: true,
      root: referenceRoot,
      generatedAt: referenceGeneratedAt,
      manifestGeneration: referenceGeneration,
      manifest: {
        available: true,
        state: 'ready',
        root: referenceRoot,
        current: { generation: referenceGeneration, root: referenceRoot, generatedAt: referenceGeneratedAt },
      },
    }),
  }));
  await page.route('**/api/reference/manifest**', async route => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.searchParams.get('q');
    const fileBytes = path === null ? undefined : await (async () => {
      const fileUrl = new URL('/api/reference/file', requestUrl.origin);
      fileUrl.searchParams.set('path', path);
      const fileResponse = await request.get(fileUrl.toString());
      if (!fileResponse.ok()) throw new Error(`SourceEditor scale fixture file request failed: ${fileResponse.status()}`);
      const fileBody = await fileResponse.body();
      const contentLength = Number(fileResponse.headers()['content-length']);
      return Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : fileBody.byteLength;
    })();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: {
          available: true,
          state: 'ready',
          root: referenceRoot,
          current: {
            generation: referenceGeneration,
            root: referenceRoot,
            generatedAt: referenceGeneratedAt,
          },
        },
        generation: referenceGeneration,
        total: path === null ? 0 : 1,
        limit: 500,
        offset: 0,
        files: path === null || fileBytes === undefined ? [] : [{ path, bytes: fileBytes }],
      }),
    });
  });
  await seedServerWorkspace(sourceEditorWorkspace);
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();

  const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
  await uiDesigner.click();
  await expect(uiDesigner).toHaveAttribute('aria-current', 'page');
  const editor = page.getByTestId('x4-ui-source-editor');
  await expect(editor).toBeVisible();

  const canvasHost = page.getByTestId('x4-ui-canvas-host');
  const canvas = canvasHost.locator('canvas');
  const sourceSelector = page.getByTestId('x4-ui-source-selector');
  const targetSelector = page.getByTestId('x4-ui-target-selector');
  const scaleMode = page.getByTestId('x4-ui-profile-scale-mode');
  const userScale = page.getByTestId('x4-ui-profile-user-scale');
  const effectiveScale = page.getByTestId('x4-ui-profile-scale');
  const width = page.getByTestId('x4-ui-profile-width');
  const height = page.getByTestId('x4-ui-profile-height');
  const canvasStatus = page.getByTestId('x4-ui-canvas-status');
  const gameTruth = page.getByTestId('x4-ui-game-truth');

  await page.getByTestId('x4-ui-preview-settings-toggle').click();
  await expect(scaleMode).toHaveValue('derived-from-x4-user-scale');
  await expect(effectiveScale).toBeDisabled();
  await width.fill('320');
  await height.fill('360');
  await userScale.fill('1.2');
  await expect(width).toHaveValue('320');
  await expect(height).toHaveValue('360');
  await expect(userScale).toHaveValue('1.2');
  await expect(effectiveScale).toHaveValue('0.4');
  await expect(canvas).toHaveCount(0);

  const sourceOption = sourceSelector.locator('option').filter({ hasText: 'ui/x4-ui-source-editor-p7-e2e.lua' }).first();
  await expect(sourceOption).toHaveCount(1);
  const sourceValue = await sourceOption.getAttribute('value');
  if (sourceValue === null) throw new Error('SourceEditor scale fixture source option has no value');
  await sourceSelector.selectOption(sourceValue);
  const targetOption = targetSelector.locator('option').nth(1);
  await expect(targetOption).toHaveCount(1);
  const targetValue = await targetOption.getAttribute('value');
  if (targetValue === null) throw new Error('SourceEditor scale fixture target option has no value');
  await targetSelector.selectOption(targetValue);

  const expectDerivedScale = async (drawableHeight: number, expected: string): Promise<void> => {
    await expect(effectiveScale).toHaveValue(expected);
    expect(Number(await effectiveScale.inputValue())).toBeCloseTo(
      Number(await userScale.inputValue()) * drawableHeight / 1080,
      6,
    );
    await expect(canvasStatus).toHaveText(/rendered\/current/);
    await expect(gameTruth).toHaveText(/^Not verified in game$/);
  };
  const expectCurrentCanvas = async (): Promise<void> => {
    await expect(canvasStatus).toHaveText(/rendered\/current/);
    await expect(gameTruth).toHaveText(/^Not verified in game$/);
  };

  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('width', '320');
  await expect(canvas).toHaveAttribute('height', '360');
  await expect(scaleMode).toHaveValue('derived-from-x4-user-scale');
  await expectDerivedScale(360, '0.4');

  await height.fill('540');
  await expect(canvas).toHaveAttribute('width', '320');
  await expect(canvas).toHaveAttribute('height', '540');
  await expectDerivedScale(540, '0.6');

  await width.fill('480');
  await expect(canvas).toHaveAttribute('width', '480');
  await expect(canvas).toHaveAttribute('height', '540');
  await expect(effectiveScale).toHaveValue('0.6');
  await expectCurrentCanvas();

  await scaleMode.selectOption('custom-effective-helper-scale');
  await expect(scaleMode).toHaveValue('custom-effective-helper-scale');
  await expect(effectiveScale).toBeEnabled();
  await expectCurrentCanvas();
  await effectiveScale.fill('0.75');
  await expect(effectiveScale).toHaveValue('0.75');
  await expectCurrentCanvas();

  await height.fill('360');
  await expect(canvas).toHaveAttribute('width', '480');
  await expect(canvas).toHaveAttribute('height', '360');
  await expect(effectiveScale).toHaveValue('0.75');
  await expect(userScale).toHaveValue('1.2');
  await expectCurrentCanvas();

  await width.fill('640');
  await expect(canvas).toHaveAttribute('width', '640');
  await expect(canvas).toHaveAttribute('height', '360');
  await expect(effectiveScale).toHaveValue('0.75');
  await expect(userScale).toHaveValue('1.2');
  await expectCurrentCanvas();

  await scaleMode.selectOption('derived-from-x4-user-scale');
  await expect(scaleMode).toHaveValue('derived-from-x4-user-scale');
  await expect(effectiveScale).toBeDisabled();
  await expect(canvas).toHaveAttribute('width', '640');
  await expect(canvas).toHaveAttribute('height', '360');
  await expectDerivedScale(360, '0.4');
  await expect(userScale).toHaveValue('1.2');
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

/** Independent oracle for this fixture's three generated, single-widget row blocks only. */
function expectedGeneratedRowSwap(source: string, upperRowNumber: 1 | 2): string {
  const lines = sourceLineSpans(source);
  const rows = lines.flatMap(line => {
    const match = /^ {2}local ([A-Za-z_][A-Za-z0-9_]*) = ([A-Za-z_][A-Za-z0-9_]*):addRow\(false, \{\}\)\r?\n$/.exec(line.text);
    return match === null ? [] : [{ ...line, binding: match[1], table: match[2] }];
  });
  const displays = lines.filter(line => /^ {2}menu\.frame:display\(\)\r?\n$/.test(line.text));
  if (rows.length !== 3 || displays.length !== 1
    || new Set(rows.map(row => row.binding)).size !== 3
    || new Set(rows.map(row => row.table)).size !== 1
    || (source.match(/:addRow\(/g) ?? []).length !== 3
    || rows[2].end >= displays[0].start) {
    throw new Error('Row-swap oracle requires three unique generated rows and one trailing display');
  }
  const literal = '"(?:[^"\\\\\r\n]|\\\\.)*"';
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const end = rows[index + 1]?.start ?? displays[0].start;
    const widget = source.slice(row.end, end);
    const textOptions = '\\{(?: font = "Zekton", fontsize = 9, y = 2, halign = "center", wordwrap = false )?\\}';
    const widgetPattern = new RegExp(`^  ${row.binding}\\[1\\]:(?:createText\\(${literal}, ${textOptions}\\)|createButton\\(\\{\\}\\):setText\\(${literal}, \\{\\}\\))\\r?\\n$`);
    if (!widgetPattern.test(widget)) throw new Error(`Row-swap oracle cannot prove ${row.binding}'s one generated widget`);
  }
  const upper = rows[upperRowNumber - 1];
  const lower = rows[upperRowNumber];
  const end = rows[upperRowNumber + 1]?.start ?? displays[0].start;
  return source.slice(0, upper.start)
    + source.slice(lower.start, end)
    + source.slice(upper.start, lower.start)
    + source.slice(end);
}

function assertGeneratedRowSwap(before: string, after: string, upperRowNumber: 1 | 2): void {
  expect(after, 'movement must equal the independent complete-file adjacent row permutation')
    .toBe(expectedGeneratedRowSwap(before, upperRowNumber));
}

// Executed by Playwright discovery too: accepted output never supplies its own expectation.
function runGeneratedRowSwapOracleSelfCheck(): void {
  for (const newline of ['\n', '\r\n']) {
    const prefix = '-- untouched prefix\nfunction menu.createFrame()\n'.replaceAll('\n', newline);
    const suffix = '  menu.frame:display()\nend\n-- untouched suffix\n'.replaceAll('\n', newline);
    const row = (binding: string, call: string) => `  local ${binding} = ftable:addRow(false, {})${newline}  ${binding}[1]:${call}${newline}`;
    const first = row('row', 'createText("Title", { font = "Zekton", fontsize = 9, y = 2, halign = "center", wordwrap = false })');
    const second = row('row2', 'createText("Middle", {})');
    const third = row('row3', 'createButton({}):setText("Last", {})');
    const before = prefix + first + second + third + suffix;
    const swapped = prefix + first + third + second + suffix;
    assertGeneratedRowSwap(before, swapped, 2);
    assertGeneratedRowSwap(swapped, before, 2);
    assertGeneratedRowSwap(before, prefix + second + first + third + suffix, 1);
    for (const [name, invalid] of [
      ['unchanged', before],
      ['dropped widget', swapped.replace(`  row2[1]:createText("Middle", {})${newline}`, '')],
      ['wrong row order', prefix + second + first + third + suffix],
      ['unrelated prefix mutation', swapped.replace('-- untouched prefix', '-- changed prefix')],
      ['unrelated suffix mutation', swapped.replace('-- untouched suffix', '-- changed suffix')],
    ]) {
      expect(() => assertGeneratedRowSwap(before, invalid, 2), `${name} must fail the row-swap oracle`).toThrow();
    }
    expect(() => expectedGeneratedRowSwap(before.replace('local row3 =', 'local row2 ='), 2)).toThrow();
    expect(() => expectedGeneratedRowSwap(before.replace('  menu.frame:display()', '  unknownEffect()\n  menu.frame:display()'), 2)).toThrow();
  }
}
runGeneratedRowSwapOracleSelfCheck();

type RowMovementWorkspace = Record<string, unknown> & {
  passthroughFiles: Array<{ path: string; content: string; bytes?: number; [key: string]: unknown }>;
};

test('SourceEditor moves three populated rows with exact inverse, history, and continued editing', async ({ page, request }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const { unrelated } = await setupContextualInsertionFixture(page, request);
  const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
  const inspector = page.getByTestId('x4-ui-builder-selection');
  const selectedLabel = page.getByTestId('x4-ui-builder-selected-node-label');
  const canvas = page.getByTestId('x4-ui-canvas-host').locator('canvas');
  const moveUp = page.getByTestId('x4-ui-row-controls-move-up');
  const moveDown = page.getByTestId('x4-ui-row-controls-move-down');
  const undo = page.locator('[data-global-action="undo"]');
  const redo = page.locator('[data-global-action="redo"]');
  const readWorkspace = async (): Promise<RowMovementWorkspace> => readServerWorkspace();
  const sibling = await createActualNewMenu(page, 'B119 Move sibling');
  const siblingLua = sibling.passthroughFiles.find(file => file.path.endsWith('.lua'));
  if (siblingLua === undefined) throw new Error('Movement sibling menu has no Lua source');
  const title = 'B119 Move title';
  const middleText = 'B119 Middle Text';
  const lastText = 'B119 Last Button';
  await createActualNewMenu(page, title);
  // Saved readback already includes the owner's normal normalization, including file reasons.
  const created = await readWorkspace();
  const targets = created.passthroughFiles.filter(file => file.path.endsWith('.lua') && file.path !== siblingLua.path);
  expect(targets).toHaveLength(1);
  const target = targets[0];
  const uiXml = created.passthroughFiles.find(file => file.path === 'ui.xml');
  if (target === undefined || uiXml === undefined) throw new Error('Movement target or registration is missing');
  expect(created.passthroughFiles.find(file => file.path === siblingLua.path)).toEqual(siblingLua);
  const siblings = new Map(created.passthroughFiles.filter(file => file.path !== target.path && file.path.endsWith('.lua'))
    .map(file => [file.path, file.content] as const));
  const expectedWorkspace = (source: string): RowMovementWorkspace => ({
    ...created,
    passthroughFiles: created.passthroughFiles.map(file => file.path !== target.path ? file : {
      ...file, content: source,
      // The existing source splice updates this optional byte count, and no other file metadata.
      ...(Object.prototype.hasOwnProperty.call(file, 'bytes') ? { bytes: Buffer.byteLength(source, 'utf8') } : {}),
    }),
  });
  const sourceOf = (workspace: RowMovementWorkspace): string => {
    const matches = workspace.passthroughFiles.filter(file => file.path === target.path);
    expect(matches).toHaveLength(1);
    return matches[0].content;
  };
  const assertWorkspace = async (source: string): Promise<RowMovementWorkspace> => {
    const workspace = await readWorkspace();
    expect(workspace).toEqual(expectedWorkspace(source));
    assertContextualLuaSiblings(workspace, target.path, source, uiXml.content, unrelated, siblings);
    return workspace;
  };
  const waitForSource = async (source: string): Promise<void> => {
    await expect.poll(async () => sourceOf(await readWorkspace()), { timeout: 30_000 }).toBe(source);
  };
  const nodeFor = (label: string) => hierarchy.getByRole('treeitem').filter({
    has: page.locator('span.font-bold').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
  });
  const selectNode = async (label: string): Promise<void> => {
    const node = nodeFor(label);
    await expect(node).toHaveCount(1);
    await node.click();
    await expect(selectedLabel).toHaveText(label);
    await expect(node).toHaveAttribute('aria-pressed', 'true');
  };
  const assertCounts = async (past: number, future: number): Promise<void> => {
    await expect(undo.locator('span')).toHaveText(`(${past})`);
    await expect(redo.locator('span')).toHaveText(`(${future})`);
    if (past === 0) await expect(undo).toBeDisabled(); else await expect(undo).toBeEnabled();
    if (future === 0) await expect(redo).toBeDisabled(); else await expect(redo).toBeEnabled();
  };
  let source = target.content;
  await assertWorkspace(source);
  await selectNode('Row 1');
  for (const [kind, text] of [['text', middleText], ['button', lastText]] as const) {
    const beforeRow = source;
    await expect(page.getByTestId('x4-ui-contextual-palette-add-row')).toBeEnabled();
    await page.getByTestId('x4-ui-contextual-palette-add-row').click();
    await expect.poll(async () => sourceOf(await readWorkspace()), { timeout: 30_000 }).not.toBe(beforeRow);
    source = sourceOf(await readWorkspace());
    assertSingleInsertedSourceDelta(beforeRow, source, rowInsertionOraclePattern, 'Movement setup Add row locality');
    await assertWorkspace(source);
    await expect(selectedLabel).toHaveText('Cell 1');
    await expect(page.getByTestId('x4-ui-contextual-palette-text')).toHaveValue('New text');
    await page.getByTestId('x4-ui-contextual-palette-text').fill(text);
    const beforeWidget = source;
    await expect(page.getByTestId(`x4-ui-contextual-palette-add-${kind}`)).toBeEnabled();
    await page.getByTestId(`x4-ui-contextual-palette-add-${kind}`).click();
    await expect.poll(async () => sourceOf(await readWorkspace()), { timeout: 30_000 }).not.toBe(beforeWidget);
    source = sourceOf(await readWorkspace());
    const inserted = assertSingleInsertedSourceDelta(beforeWidget, source,
      kind === 'text' ? /:createText\(/ : /:createButton\(\{\}\):setText\(/, 'Movement setup widget locality');
    expect(inserted).toContain(JSON.stringify(text));
    await assertWorkspace(source);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect(page.getByTestId('x4-ui-row-controls-status')).toHaveText('Use the row controls to move this row one position.');
  }
  const beforeMoveSource = source;
  const movedSource = expectedGeneratedRowSwap(beforeMoveSource, 2);
  expect(expectedGeneratedRowSwap(movedSource, 2)).toBe(beforeMoveSource);
  const countText = await undo.locator('span').textContent();
  const countMatch = /^\((\d+)\)$/.exec(countText ?? '');
  if (countMatch === null) throw new Error('Global Undo has no readable history count');
  const initialPast = Number(countMatch[1]);
  expect(initialPast).toBeGreaterThan(0);
  await assertCounts(initialPast, 0);
  const profileIds = ['x4-ui-profile-width', 'x4-ui-profile-height', 'x4-ui-profile-scale-mode', 'x4-ui-profile-user-scale', 'x4-ui-profile-scale'];
  const profile = await Promise.all(profileIds.map(id => page.getByTestId(id).inputValue()));
  const originalOrder = [title, middleText, lastText];
  const movedOrder = [title, lastText, middleText];
  const screenshotStates = new Set(['populated', 'moved-down', 'inverse-up', 'alternate-edit']);
  const capture = async (state: string, expectedSource: string, order: readonly string[], selected: string) => {
    const workspace = await assertWorkspace(expectedSource);
    await expect(page.getByTestId('x4-ui-source-selector').locator('option:checked')).toHaveText(target.path);
    await expect(page.getByTestId('x4-ui-target-selector').locator('option:checked')).toHaveText('menu.createFrame');
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toBeInViewport();
    expect(await Promise.all(profileIds.map(id => page.getByTestId(id).inputValue()))).toEqual(profile);
    const nodes = await hierarchy.getByRole('treeitem').evaluateAll(elements => elements.map(element => {
      const label = element.querySelector('span.font-bold')?.textContent;
      const id = element.getAttribute('data-testid');
      const level = Number(element.getAttribute('aria-level'));
      if (!label || !id || !Number.isInteger(level) || level < 1) throw new Error('Incomplete rendered hierarchy identity');
      return { label, id, level, selected: element.getAttribute('aria-pressed') === 'true' };
    }));
    expect(new Set(nodes.map(node => node.id)).size).toBe(nodes.length);
    expect(nodes.filter(node => node.level === 1).map(node => node.label)).toEqual(['Frame 1']);
    expect(nodes.filter(node => node.level === 2).map(node => node.label)).toEqual(['Table 1']);
    expect(nodes.filter(node => node.level === 3).map(node => node.label)).toEqual(['Row 1', 'Row 2', 'Row 3']);
    const ancestors: typeof nodes = [];
    const textOwners: Array<{ label: string; row: string | undefined; cell: string | undefined }> = [];
    for (const node of nodes) {
      while (ancestors.length && ancestors[ancestors.length - 1].level >= node.level) ancestors.pop();
      if (node.level === 3) expect(ancestors.map(parent => parent.label)).toEqual(['Frame 1', 'Table 1']);
      if (node.label.startsWith('Text · ')) {
        expect(node.level).toBe(6);
        textOwners.push({ label: node.label, row: ancestors.find(parent => parent.level === 3)?.label,
          cell: ancestors.find(parent => parent.level === 4)?.label });
      }
      ancestors.push(node);
    }
    expect(textOwners).toEqual(order.map((text, index) => ({ label: `Text · ${text}`, row: `Row ${index + 1}`, cell: 'Cell 1' })));
    await expect(selectedLabel).toHaveText(selected);
    const selectedNodes = nodes.filter(node => node.selected);
    expect(selectedNodes.map(node => node.label)).toEqual([selected]);
    const selectionBox = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
    if (selectionBox === null || selectionBox.width <= 0 || selectionBox.height <= 0) throw new Error(`${state}: selected populated row/widget has no positive canvas geometry`);
    const nativeCanvas = await readNativeCanvasSignature(page);
    expect(nativeCanvas.nonTransparentPixels).toBeGreaterThan(0);
    const historyCounts = { undo: await undo.locator('span').textContent(), redo: await redo.locator('span').textContent() };
    const artifact = { state, source: expectedSource, workspace, profile, nativeCanvas, hierarchy: nodes, selectionBox, historyCounts };
    const path = test.info().outputPath(`b119-row-movement-${state}.json`);
    await writeFile(path, JSON.stringify(artifact, null, 2), 'utf8');
    await test.info().attach(`b119-row-movement-${state}`, { path, contentType: 'application/json' });
    if (screenshotStates.has(state)) {
      const screenshotPath = test.info().outputPath(`b119-row-movement-${state}.png`);
      await page.screenshot({ path: screenshotPath });
      await test.info().attach(`b119-row-movement-${state}-screenshot`, { path: screenshotPath, contentType: 'image/png' });
    }
    return { nativeCanvas, selectedId: selectedNodes[0].id };
  };
  await selectNode(`Text · ${middleText}`);
  const original = await capture('populated', beforeMoveSource, originalOrder, `Text · ${middleText}`);
  for (const [row, direction, reason] of [[1, 'up', 'first'], [3, 'down', 'last']] as const) {
    await selectNode(`Row ${row}`);
    const boundary = direction === 'up' ? moveUp : moveDown;
    await expect(boundary).toBeDisabled();
    await expect(direction === 'up' ? moveDown : moveUp).toBeEnabled();
    await expect(boundary).toHaveAttribute('title', `This is already the ${reason} row.`);
    await boundary.scrollIntoViewIfNeeded();
    const box = await boundary.boundingBox();
    if (box === null || box.width <= 0 || box.height <= 0) throw new Error('Disabled row boundary has no pointer target');
    // Real pointer input reaches the disabled button; no forced DOM dispatch or callback invocation.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await assertCounts(initialPast, 0);
    const unchanged = await capture(`boundary-${reason}`, beforeMoveSource, originalOrder, `Row ${row}`);
    expect(unchanged.nativeCanvas).toEqual(original.nativeCanvas);
  }
  await selectNode(`Text · ${middleText}`);
  await expect(moveUp).toBeEnabled();
  await expect(moveDown).toBeEnabled();
  const move = async (direction: 'up' | 'down', before: string, expected: string, row: number, state: string, past: number) => {
    expect(sourceOf(await readWorkspace())).toBe(before);
    const previousCanvas = await canvas.elementHandle();
    const previousSelection = await hierarchy.locator('button[aria-pressed="true"]').getAttribute('data-testid');
    const control = direction === 'down' ? moveDown : moveUp;
    await expect(control).toBeEnabled();
    await control.click();
    await waitForSource(expected);
    assertGeneratedRowSwap(before, sourceOf(await readWorkspace()), 2);
    await expect(selectedLabel).toHaveText(`Row ${row}`);
    await assertFreshNativeCanvas(page, previousCanvas, state);
    await assertCounts(past, 0);
    const captured = await capture(state, expected, row === 3 ? movedOrder : originalOrder, `Row ${row}`);
    expect(captured.selectedId).not.toBe(previousSelection);
    return captured;
  };
  const moved = await move('down', beforeMoveSource, movedSource, 3, 'moved-down', initialPast + 1);
  expect(moved.nativeCanvas.pixelSignature).not.toBe(original.nativeCanvas.pixelSignature);
  const inverse = await move('up', movedSource, beforeMoveSource, 2, 'inverse-up', initialPast + 2);
  expect(inverse.nativeCanvas).toEqual(original.nativeCanvas);
  const movedAgain = await move('down', beforeMoveSource, movedSource, 3, 'moved-down-again', initialPast + 3);
  expect(movedAgain.nativeCanvas).toEqual(moved.nativeCanvas);
  const history = async (direction: 'undo' | 'redo', expected: string, order: readonly string[], state: string, past: number, future: number) => {
    const previousCanvas = await canvas.elementHandle();
    const control = direction === 'undo' ? undo : redo;
    await expect(control).toBeEnabled();
    await control.click();
    await waitForSource(expected);
    await expect(selectedLabel).toHaveText(state === 'undo-move' ? 'Row 2' : `Text · ${middleText}`);
    await selectNode(`Text · ${middleText}`);
    await assertFreshNativeCanvas(page, previousCanvas, state);
    await assertCounts(past, future);
    return capture(state, expected, order, `Text · ${middleText}`);
  };
  const undone = await history('undo', beforeMoveSource, originalOrder, 'undo-move', initialPast + 2, 1);
  expect(undone.nativeCanvas).toEqual(original.nativeCanvas);
  const redone = await history('redo', movedSource, movedOrder, 'redo-move', initialPast + 3, 0);
  expect(redone.nativeCanvas).toEqual(moved.nativeCanvas);
  const restored = await history('undo', beforeMoveSource, originalOrder, 'undo-for-alternate-edit', initialPast + 2, 1);
  expect(restored.nativeCanvas).toEqual(original.nativeCanvas);
  const inputs = inspector.locator('input[type="text"][data-testid^="x4-ui-source-edit-input-"]');
  const candidates = [];
  for (let index = 0; index < await inputs.count(); index += 1) {
    if (await inputs.nth(index).inputValue() === middleText) candidates.push(inputs.nth(index));
  }
  expect(candidates).toHaveLength(1);
  const input = candidates[0];
  const inputId = await input.getAttribute('data-testid');
  if (inputId === null) throw new Error('Restored widget has no current source property identity');
  const alternateText = 'B119 Restored Text edited';
  const alternateSource = beforeMoveSource.replace(JSON.stringify(middleText), JSON.stringify(alternateText));
  assertSingleLiteralSourceReplacement(beforeMoveSource, alternateSource, middleText, alternateText, 'Continued edit expectation locality');
  await input.fill(alternateText);
  const apply = inspector.getByTestId(inputId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
  await expect(apply).toBeEnabled();
  const beforeEditCanvas = await canvas.elementHandle();
  await apply.click();
  await waitForSource(alternateSource);
  assertSingleLiteralSourceReplacement(beforeMoveSource, sourceOf(await readWorkspace()), middleText, alternateText, 'Continued edit must replace exactly its restored literal');
  await expect(selectedLabel).toHaveText(`Text · ${alternateText}`);
  await assertFreshNativeCanvas(page, beforeEditCanvas, 'alternate-edit');
  // Source property IDs include both literal offsets, so a length change replaces the old entry.
  await expect(inspector.getByTestId(inputId)).toHaveCount(0);
  const currentCandidates = [];
  for (let index = 0; index < await inputs.count(); index += 1) {
    if (await inputs.nth(index).inputValue() === alternateText) currentCandidates.push(inputs.nth(index));
  }
  expect(currentCandidates).toHaveLength(1);
  const currentInputId = await currentCandidates[0].getAttribute('data-testid');
  if (currentInputId === null) throw new Error('Edited widget has no current source property identity');
  expect(currentInputId).not.toBe(inputId);
  const currentInput = inspector.getByTestId(currentInputId);
  await expect(currentInput).toHaveCount(1);
  await expect(currentInput).toHaveValue(alternateText);
  await assertCounts(initialPast + 3, 0);
  const alternateOrder = [title, alternateText, lastText];
  const alternate = await capture('alternate-edit', alternateSource, alternateOrder, `Text · ${alternateText}`);
  expect(alternate.nativeCanvas.pixelSignature).not.toBe(original.nativeCanvas.pixelSignature);
  expect(alternate.nativeCanvas.pixelSignature).not.toBe(moved.nativeCanvas.pixelSignature);
  const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
  await uiDesigner.focus();
  await expect(uiDesigner).toBeFocused();
  // App's established redo branch accepts Ctrl+y outside input/textarea/select controls.
  await page.keyboard.press('Control+y');
  await assertCounts(initialPast + 3, 0);
  const staleRedo = await capture('stale-redo-no-op', alternateSource, alternateOrder, `Text · ${alternateText}`);
  expect(staleRedo.nativeCanvas).toEqual(alternate.nativeCanvas);
  expect(staleRedo.selectedId).toBe(alternate.selectedId);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

function b119OwnedManifestDatabase(status: unknown): string {
  const database = (status as Partial<ReferenceManifestStatus> | null)?.database;
  if (typeof database !== 'string' || !isAbsolute(database)) {
    throw new Error('Reference preparation requires an absolute ephemeral manifest database path.');
  }
  const resolved = resolve(database);
  const insideTemp = relative(tmpdir(), resolved).replace(/\\/g, '/');
  if (!/^x4forge-e2e-state-\d+\/data\/reference-manifest\/index\.db$/.test(insideTemp)) {
    throw new Error('Reference preparation refuses a database outside the owned ephemeral state layout.');
  }
  return resolved;
}

const b119ScratchDatabase = join(tmpdir(), 'x4forge-e2e-state-4242', 'data', 'reference-manifest', 'index.db');
expect(b119OwnedManifestDatabase({ database: b119ScratchDatabase })).toBe(resolve(b119ScratchDatabase));
for (const database of [undefined, '', 'data/reference-manifest/index.db',
  join(tmpdir(), 'foreign-state', 'data', 'reference-manifest', 'index.db'),
  join(tmpdir(), 'x4forge-e2e-state-4242', '..', 'live-state', 'data', 'reference-manifest', 'index.db'),
  join(tmpdir(), 'x4forge-e2e-state-4242', 'data', 'reference-manifest', 'other.db'),
  resolve('.studio-state', 'data', 'reference-manifest', 'index.db')]) {
  expect(() => b119OwnedManifestDatabase({ database })).toThrow(/ephemeral/);
}

const b119LuaFileTest = b119ProfiledTest.extend<{ readyReferenceManifest: void }>({
  readyReferenceManifest: [async ({ request }, use, testInfo) => {
    const evidence: Record<string, unknown> = { apiOrigin: E2E_API_ORIGIN, startedAt: new Date().toISOString() };
    try {
      const response = await request.get(`${E2E_API_ORIGIN}/api/reference/status`, { timeout: 10_000 });
      expect(response.ok(), 'the isolated reference service must be available').toBe(true);
      const initial = await response.json() as {
        available: boolean; root: string; manifestGeneration: string | null; manifest: ReferenceManifestStatus;
      };
      evidence.initial = initial;
      expect(initial.available).toBe(true);
      const database = b119OwnedManifestDatabase(initial.manifest);
      let generation = '';
      // The existing endpoint lazily schedules an idle index and reuses completed generations.
      // Preparation gets its own fixture budget; the interaction test remains at60seconds.
      await expect.poll(async () => {
        const manifestResponse = await request.get(`${E2E_API_ORIGIN}/api/reference/manifest?limit=1`, { timeout: 10_000 });
        const manifest = await manifestResponse.json() as {
          status: ReferenceManifestStatus; generation?: string; total?: number;
        };
        evidence.latest = manifest;
        expect([200, 202]).toContain(manifestResponse.status());
        expect(b119OwnedManifestDatabase(manifest.status)).toBe(database);
        expect(manifest.status.root).toBe(initial.root);
        if (manifest.status.state === 'error' || manifest.status.state === 'unavailable') {
          throw new Error(`Ephemeral manifest failed: ${JSON.stringify(manifest.status)}`);
        }
        if (manifest.status.state !== 'ready') return false;
        expect(manifest.status.available).toBe(true);
        expect(manifest.total).toBeGreaterThan(0);
        expect(manifest.generation).toEqual(expect.any(String));
        expect(manifest.generation).toBeTruthy();
        expect(manifest.status.current?.generation).toBe(manifest.generation);
        generation = manifest.generation as string;
        return true;
      }, { timeout: 600_000, intervals: [250, 500, 1000], message: 'Real ephemeral reference manifest must finish before UI authoring' }).toBe(true);
      // Refresh the lightweight corpus view, not the completed manifest scan.
      const consumedResponse = await request.get(`${E2E_API_ORIGIN}/api/reference/status?refresh=1`, { timeout: 10_000 });
      expect(consumedResponse.ok()).toBe(true);
      const consumed = await consumedResponse.json() as typeof initial;
      evidence.consumed = consumed;
      expect(consumed.manifestGeneration).toBe(generation);
      expect(consumed.manifest.state).toBe('ready');
      expect(consumed.manifest.current?.generation).toBe(generation);
      expect(consumed.root).toBe(initial.root);
      expect(b119OwnedManifestDatabase(consumed.manifest)).toBe(database);
    } finally {
      evidence.finishedAt = new Date().toISOString();
      await testInfo.attach('b119-real-reference-readiness', {
        body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json',
      });
    }
    await use();
  }, { auto: true, timeout: 630_000 }],
});

for (const realMenu of [
  { label: 'MENU', filename: 'aic_menu.lua', target: 'menu.display', caption: 'SEND', edited: 'TRANSMIT', call: ':setText(',
    sha256: '8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD' },
  { label: 'HUB', filename: 'aic_hub.lua', target: 'hub.display', caption: 'AI INFLUENCE', edited: 'AI INFLUENCE HUB', call: ':createText(',
    sha256: '657476EAD08229977E1F2A69079FFDCAB56D908B72AF5C87BD4F4734DCCB8C4F' },
  { label: 'COMM', filename: 'aic_comm.lua', target: 'comm.display', caption: 'DOSSIER', edited: 'DOSSIER +', call: ':setText(',
    sha256: '5526B6F954859322E3BE266361F4DFC6F3061E1A399897148CB3BB251693483E' },
] as const) {
  b119LuaFileTest(`SourceEditor visually edits and reopens real ${realMenu.label} Lua`, async ({ page }) => {
    test.setTimeout(120_000);
    const configuredRoot = resolveXsdConfig().modWorkspacePath;
    expect(configuredRoot, 'real mod workspace must be configured').toBeTruthy();
    const physicalRoot = await realpath(configuredRoot!);
    const sourceFile = await realpath(join(physicalRoot, 'x4_ai_influence', 'ui', 'addons', 'ai_influence_chat', realMenu.filename));
    const within = relative(physicalRoot, sourceFile);
    expect(within !== '' && within !== '..' && !within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
      && !isAbsolute(within), 'source must be physically inside the configured mod workspace').toBe(true);
    const originalBytes = await readFile(sourceFile);
    expect(createHash('sha256').update(originalBytes).digest('hex').toUpperCase()).toBe(realMenu.sha256);
    const originalText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(originalBytes);
    expect(Buffer.from(originalText, 'utf8')).toEqual(originalBytes);
    const sourcePath = `ui/${realMenu.filename}`;
    const checkpoints: unknown[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const capture = async (label: string): Promise<void> => {
      checkpoints.push({ label, utc: new Date().toISOString(),
        state: await readB119LuaRoundtripSelectedWorkspace(page),
        hierarchy: await readB119LuaRoundtripHierarchy(page),
        editor: (await page.getByTestId('x4-ui-source-editor').innerText()).slice(0, 12000) });
      await page.screenshot({ path: test.info().outputPath(`real-${realMenu.label}-${label}.png`) });
    };
    try {
      await setupB119LuaRoundtripFixture(page);
      // A ready server index is not a ready browser corpus. Do not import a large
      // real menu during the independent asset/hash bootstrap and call it a render failure.
      await expect(page.getByTestId('x4-ui-corpus-status')).toHaveText('canonical', { timeout: 60_000 });
      await expect(page.getByTestId('x4-ui-corpus-color-status')).toHaveText('canonical', { timeout: 60_000 });
      const empty = await waitB119LuaRoundtripWorkspaceSync(page, 'real-menu empty scratch baseline');
      const fileInput = page.getByLabel('Select one Lua file to open');
      const status = page.getByTestId('x4-ui-lua-status');
      await fileInput.setInputFiles(sourceFile);
      await expect(status).toContainText(`Opened ${sourcePath}`);
      const expectedImport = b119LuaRoundtripExpectedImportedWorkspace(empty.serverWorkspace, sourcePath, originalText);
      await expect.poll(async () => b119LuaRoundtripMatchesExpected(
        await readB119LuaRoundtripSelectedWorkspace(page), empty.workspaceId, expectedImport)).toBe(true);
      await selectB119LuaRoundtripSourceAndTarget(page, sourcePath, realMenu.target);
      await capture('imported');
      if (realMenu.label === 'MENU') await expect(page.getByRole('button', { name: 'Focus selection', exact: true })).toBeDisabled();
      const exportLua = async (folder: string, expected: string): Promise<string> => {
        const before = await readB119LuaRoundtripSelectedWorkspace(page);
        const history = await readB119LuaRoundtripHistory(page);
        const pending = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export current Lua file' }).click();
        const download = await pending;
        expect(await download.failure()).toBeNull();
        expect(download.suggestedFilename()).toBe(realMenu.filename);
        const directory = test.info().outputPath(folder);
        await mkdir(directory, { recursive: true });
        const destination = join(directory, realMenu.filename);
        await download.saveAs(destination);
        expect(await readFile(destination)).toEqual(Buffer.from(expected, 'utf8'));
        expect(await readB119LuaRoundtripSelectedWorkspace(page)).toEqual(before);
        expect(await readB119LuaRoundtripHistory(page)).toEqual(history);
        return destination;
      };
      await exportLua('untouched-export', originalText);
      const applyRealPreviewScenario = async (): Promise<void> => {
        if (realMenu.label === 'HUB') return;
        const sourceBefore = await readB119LuaRoundtripSelectedWorkspace(page);
        const historyBefore = await readB119LuaRoundtripHistory(page);
        await page.getByTestId('x4-ui-preview-inputs-toggle').click();
        const inputs = page.getByTestId('x4-ui-preview-inputs-region');
        if (realMenu.label === 'MENU') {
          // Explicit ordinary/no-pending-agreement scenario. The source changes this
          // anchor conditionally; do not present its sampled value as runtime truth.
          expect(originalText).toContain('local _choiceY = math.floor(vh * 0.68)');
          expect(originalText).toContain('if menu._pendingAction then _choiceY = _choiceY - Helper.scaleY(150) end');
          const height = Number(await page.getByTestId('x4-ui-profile-height').inputValue());
          expect(height).toBe(1440);
          const anchor = inputs.getByRole('spinbutton', { name: 'Position Y 4', exact: true });
          await expect(anchor.locator('..')).toContainText('Used by Table 6');
          await anchor.fill(String(Math.floor(height * 0.68)));
        } else {
          // Explicit sample of the dynamic channel heading, never source/game truth.
          await inputs.getByRole('textbox', { name: 'Text', exact: true }).fill('COMM CHANNEL    encrypted - sampled sector');
        }
        await inputs.getByRole('button', { name: 'Apply to preview', exact: true }).click();
        await expect(inputs.getByTestId('x4-ui-preview-inputs-applied')).toContainText('1 values applied');
        await page.getByTestId('x4-ui-preview-inputs-toggle').click();
        expect(await readB119LuaRoundtripSelectedWorkspace(page)).toEqual(sourceBefore);
        expect(await readB119LuaRoundtripHistory(page)).toEqual(historyBefore);
      };
      await applyRealPreviewScenario();
      await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
      if (realMenu.label === 'MENU') await capture('preview-scenario');
      const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
      const node = hierarchy.getByRole('treeitem').filter({ has: page.getByText(`Text · ${realMenu.caption}`, { exact: true }) });
      await expect(node).toHaveCount(1);
      await node.click();
      if (realMenu.label === 'MENU') {
        const originalPixels = await readNativeCanvasSignature(page);
        await page.getByRole('button', { name: 'Focus selection', exact: true }).click();
        await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText('100% preview');
        const focused = page.getByTestId('x4-ui-canvas-selection');
        await expect(focused).toBeInViewport();
        const focusBox = await focused.boundingBox();
        const viewportBox = await page.getByTestId('x4-ui-canvas-scroll').boundingBox();
        expect(focusBox).not.toBeNull(); expect(viewportBox).not.toBeNull();
        expect(focusBox!.height, 'real SEND caption must be readable at working zoom').toBeGreaterThanOrEqual(16);
        expect(focusBox!.x).toBeGreaterThanOrEqual(viewportBox!.x);
        expect(focusBox!.y).toBeGreaterThanOrEqual(viewportBox!.y);
        expect(focusBox!.x + focusBox!.width).toBeLessThanOrEqual(viewportBox!.x + viewportBox!.width);
        expect(focusBox!.y + focusBox!.height).toBeLessThanOrEqual(viewportBox!.y + viewportBox!.height);
        await page.mouse.click(focusBox!.x + focusBox!.width / 2, focusBox!.y + focusBox!.height / 2);
        await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText('Text · SEND');
        expect(await readNativeCanvasSignature(page)).toEqual(originalPixels);
        await page.screenshot({ path: test.info().outputPath('real-MENU-focused.png') });
      }
      // HUB's literal heading tint is source-bound, not neutral input text.
      // The other two setText captions use the canonical white button default.
      const captionColor = { rgb: realMenu.label === 'HUB' ? [207, 230, 251] as const : [255, 255, 255] as const };
      if (realMenu.label === 'HUB') expect(originalText).toMatch(/heading\s*=\s*\{ r = 207, g = 230, b = 251, a = 100 \}/);
      const oldMask = await sampleNeutralLightMask(page, captionColor);
      expect(oldMask.count, 'the selected real caption must contain actual readable ink').toBeGreaterThan(0);
      const beforePixels = await readNativeCanvasSignature(page);
      const property = await findB119LuaRoundtripTextProperty(page.getByTestId('x4-ui-builder-selection'), realMenu.caption);
      const propertyId = (await property.getAttribute('data-testid'))!;
      // Bind the literal's consumer: COMM also uses DOSSIER in h.open(), which
      // must remain byte-identical. Do not relax the older globally-unique helper.
      const oldCall = `${realMenu.call}${JSON.stringify(realMenu.caption)}`;
      expect(originalText.split(oldCall)).toHaveLength(2);
      const literalStart = originalText.indexOf(oldCall) + realMenu.call.length;
      const editedText = originalText.slice(0, literalStart) + JSON.stringify(realMenu.edited)
        + originalText.slice(literalStart + JSON.stringify(realMenu.caption).length);
      expect(editedText.split(`${realMenu.call}${JSON.stringify(realMenu.edited)}`)).toHaveLength(2);
      const editedWorkspace = b119LuaRoundtripReplaceSource(expectedImport, sourcePath, editedText);
      const beforeHistory = await readB119LuaRoundtripHistory(page);
      await property.fill(realMenu.edited);
      await page.getByTestId('x4-ui-builder-selection').getByTestId(propertyId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-')).click();
      await expect.poll(async () => b119LuaRoundtripMatchesExpected(
        await readB119LuaRoundtripSelectedWorkspace(page), empty.workspaceId, editedWorkspace)).toBe(true);
      await expect.poll(() => readNativeCanvasSignature(page)).not.toEqual(beforePixels);
      await expect.poll(async () => (await sampleNeutralLightMask(page, captionColor)).maskSignature).not.toBe(oldMask.maskSignature);
      expect((await sampleNeutralLightMask(page, captionColor)).count).toBeGreaterThan(0);
      const editedPixels = await readNativeCanvasSignature(page);
      const editedHierarchy = b119LuaRoundtripHierarchyIdentity(await readB119LuaRoundtripHierarchy(page));
      const editedCaptionNativeRect = (await sampleNeutralLightMask(page, captionColor)).cropRect;
      if (realMenu.label === 'MENU') await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText('100% preview');
      const editedHistory = await readB119LuaRoundtripHistory(page);
      assertB119LuaRoundtripHistory(editedHistory, b119LuaRoundtripHistoryState(beforeHistory.undo, 'before edit').count + 1, 0, 'real visual edit');
      await capture('edited');
      await page.locator('[data-global-action="undo"]').click();
      await expect.poll(async () => (await readB119LuaRoundtripSelectedWorkspace(page)).serverWorkspace).toEqual(expectedImport);
      await expect.poll(() => readNativeCanvasSignature(page)).toEqual(beforePixels);
      await page.locator('[data-global-action="redo"]').click();
      await expect.poll(async () => (await readB119LuaRoundtripSelectedWorkspace(page)).serverWorkspace).toEqual(editedWorkspace);
      await expect.poll(() => readNativeCanvasSignature(page)).toEqual(editedPixels);
      const exportedPath = await exportLua('edited-export', editedText);
      await page.getByTestId('workspace-switcher').selectOption('__new');
      const dialog = page.getByTestId('dialog-modal');
      await expect(dialog).toBeVisible();
      await dialog.getByTestId('dialog-input').fill(`Reopen real ${realMenu.label}`);
      await dialog.getByTestId('dialog-ok').click();
      await expect.poll(async () => (await readB119LuaRoundtripSelectedWorkspace(page)).workspaceId).not.toBe(empty.workspaceId);
      const independent = await waitB119LuaRoundtripWorkspaceSync(page, 'independent reopening workspace');
      expect(b119LuaRoundtripFiles(independent.serverWorkspace)).toEqual([]);
      await fileInput.setInputFiles(exportedPath);
      await expect(status).toContainText(`Opened ${sourcePath}`);
      const expectedReopen = b119LuaRoundtripExpectedImportedWorkspace(independent.serverWorkspace, sourcePath, editedText);
      await expect.poll(async () => b119LuaRoundtripMatchesExpected(
        await readB119LuaRoundtripSelectedWorkspace(page), independent.workspaceId, expectedReopen)).toBe(true);
      await selectB119LuaRoundtripSourceAndTarget(page, sourcePath, realMenu.target);
      await applyRealPreviewScenario();
      await expect.poll(() => readNativeCanvasSignature(page)).toEqual(editedPixels);
      expect(b119LuaRoundtripHierarchyIdentity(await readB119LuaRoundtripHierarchy(page))).toEqual(editedHierarchy);
      if (realMenu.label === 'MENU') {
        // Native pixel equality does not prove that those pixels are in the user's viewport.
        // Check before selecting or refocusing: neither action may conceal a blank reopen.
        const readReopenedCaptionView = async () => page.evaluate(rect => {
          const canvas = document.querySelector('[data-testid="x4-ui-canvas-host"] canvas');
          const scroll = document.querySelector('[data-testid="x4-ui-canvas-scroll"]');
          if (!(canvas instanceof HTMLCanvasElement) || !(scroll instanceof HTMLElement)) return { visible: false };
          const box = canvas.getBoundingClientRect();
          const viewport = scroll.getBoundingClientRect();
          const caption = { left: box.left + rect.x * box.width / canvas.width,
            top: box.top + rect.y * box.height / canvas.height,
            right: box.left + (rect.x + rect.width) * box.width / canvas.width,
            bottom: box.top + (rect.y + rect.height) * box.height / canvas.height };
          const clip = { left: Math.max(0, viewport.left), top: Math.max(0, viewport.top),
            right: Math.min(innerWidth, viewport.right), bottom: Math.min(innerHeight, viewport.bottom) };
          return { visible: caption.right > caption.left && caption.bottom > caption.top
            && caption.left >= clip.left && caption.top >= clip.top && caption.right <= clip.right && caption.bottom <= clip.bottom,
          caption, clip, scrollLeft: scroll.scrollLeft, scrollTop: scroll.scrollTop,
          zoom: document.querySelector('[data-testid="x4-ui-canvas-zoom-value"]')?.textContent };
        }, editedCaptionNativeRect);
        const reopenedCamera = JSON.stringify(await readReopenedCaptionView());
        await writeFile(test.info().outputPath('real-MENU-reopened-camera.json'), reopenedCamera);
        await test.info().attach('real-MENU-reopened-camera', { body: reopenedCamera, contentType: 'application/json' });
        await expect.poll(readReopenedCaptionView, { message: 'reopened caption must be visible without reselecting or refocusing' }).toMatchObject({ visible: true });
      }
      await capture('reopened');
      const reopenedHistory = await readB119LuaRoundtripHistory(page);
      if (realMenu.label === 'MENU') {
        await hierarchy.getByRole('treeitem').filter({ has: page.getByText('Text · TRANSMIT', { exact: true }) }).click();
        await page.getByRole('button', { name: 'Focus selection', exact: true }).click();
        await expect(page.getByTestId('x4-ui-canvas-selection')).toBeInViewport();
        await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText('100% preview');
        const reopenedFocus = await page.getByTestId('x4-ui-canvas-selection').boundingBox();
        expect(reopenedFocus!.height).toBeGreaterThanOrEqual(16);
        expect(await readB119LuaRoundtripHistory(page)).toEqual(reopenedHistory);
        expect(await readNativeCanvasSignature(page)).toEqual(editedPixels);
        await page.screenshot({ path: test.info().outputPath('real-MENU-reopened-focused.png') });
      }
      await fileInput.setInputFiles(exportedPath);
      await expect(status).toContainText('That filename is already used');
      expect((await readB119LuaRoundtripSelectedWorkspace(page)).serverWorkspace).toEqual(expectedReopen);
      expect(await readB119LuaRoundtripHistory(page)).toEqual(reopenedHistory);
      await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
      expect(pageErrors).toEqual([]);
    } finally {
      expect(await readFile(sourceFile), 'real source bytes must never change').toEqual(originalBytes);
      if (await page.getByTestId('x4-ui-source-editor').count()) await capture('final');
      await test.info().attach(`real-${realMenu.label}-observations`, {
        body: Buffer.from(JSON.stringify({ sourceFile, sourceSha256: realMenu.sha256, pageErrors, checkpoints }, null, 2)),
        contentType: 'application/json',
      });
    }
  });
}

b119LuaFileTest('SourceEditor recovers real MENU preview inputs beside the selected container', async ({ page }) => {
  test.setTimeout(120_000);
  const physicalRoot = await realpath(resolveXsdConfig().modWorkspacePath!);
  const sourceFile = await realpath(join(physicalRoot, 'x4_ai_influence', 'ui', 'addons', 'ai_influence_chat', 'aic_menu.lua'));
  const within = relative(physicalRoot, sourceFile);
  expect(within !== '' && within !== '..' && !within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(within)).toBe(true);
  const originalBytes = await readFile(sourceFile);
  expect(createHash('sha256').update(originalBytes).digest('hex').toUpperCase())
    .toBe('8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD');
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const observations: unknown[] = [];
  const capture = async (label: string) => {
    const initialRefusal = label === 'unsupplied-narrow';
    const current = label === 'applied-focused-narrow' || label === 'recovered-focused-narrow';
    const expectedStatus = initialRefusal ? 'refused' : current ? 'rendered/current' : 'stale';
    await expect(page.locator('[data-testid="x4-ui-canvas-host"] canvas')).toHaveCount(initialRefusal ? 0 : 1);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText(expectedStatus);
    await expect(page.getByTestId('x4-ui-canvas-stale-notice')).toHaveCount(expectedStatus === 'stale' ? 1 : 0);
    observations.push({ label, utc: new Date().toISOString(), hierarchy: await readB119LuaRoundtripHierarchy(page),
      workspace: await readB119LuaRoundtripSelectedWorkspace(page), history: await readB119LuaRoundtripHistory(page),
      canvasStatus: expectedStatus, canvas: initialRefusal ? null : await readNativeCanvasSignature(page),
      context: await page.getByTestId('x4-ui-context-inputs-region').count()
        ? await page.getByTestId('x4-ui-context-inputs-region').innerText() : null });
    await page.screenshot({ path: test.info().outputPath(`context-MENU-${label}.png`) });
  };
  try {
    await setupB119LuaRoundtripFixture(page);
    const textareaContract = await page.evaluate(() => {
      const field = document.createElement('textarea');
      field.defaultValue = 'initial';
      const pristine = { value: field.value, text: field.textContent, defaultValue: field.defaultValue };
      field.value = 'edited'; field.defaultValue = 'new default';
      return { pristine, dirty: { value: field.value, text: field.textContent, defaultValue: field.defaultValue } };
    });
    expect(textareaContract).toEqual({ pristine: { value: 'initial', text: 'initial', defaultValue: 'initial' },
      dirty: { value: 'edited', text: 'new default', defaultValue: 'new default' } });
    await test.info().attach('chromium-textarea-contract', { body: JSON.stringify(textareaContract), contentType: 'application/json' });
    await expect(page.getByTestId('x4-ui-corpus-status')).toHaveText('canonical', { timeout: 60_000 });
    await expect(page.getByTestId('x4-ui-corpus-color-status')).toHaveText('canonical', { timeout: 60_000 });
    await page.getByLabel('Select one Lua file to open').setInputFiles(sourceFile);
    await expect(page.getByTestId('x4-ui-lua-status')).toContainText('Opened ui/aic_menu.lua');
    await selectB119LuaRoundtripSourceAndTarget(page, 'ui/aic_menu.lua', 'menu.display');
    await waitB119LuaRoundtripWorkspaceSync(page, 'context recovery imported source');
    const before = await readB119LuaRoundtripSelectedWorkspace(page);
    const history = await readB119LuaRoundtripHistory(page);
    const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
    const node = (label: string) => hierarchy.getByRole('treeitem').filter({ has: page.getByText(label, { exact: true }) });
    const context = page.getByTestId('x4-ui-context-inputs-region');
    // Find the actual control by its source caption before its Y can render.
    await expect(node('Text · SEND')).toHaveCount(1);
    await node('Text · SEND').click();
    await expect(node('Text · SEND')).toContainText('geometry unresolved');
    await expect(page.getByTestId('x4-ui-builder-selection-unresolved')).toContainText('position is unresolved');
    await expect(page.getByTestId('x4-ui-canvas-selection')).toHaveCount(0);
    await expect(page.getByTestId('x4-ui-canvas-focus-selection')).toBeDisabled();
    await expect(context).toBeVisible();
    const contextualControls = context.locator('input, textarea, select');
    expect(await contextualControls.count()).toBe(2);
    await expect(context.getByTestId('x4-ui-context-inputs-applied')).toHaveText('0 of 2 related values applied; 2 not supplied.');
    const anchor = context.getByRole('spinbutton', { name: 'Position Y', exact: true });
    await expect(anchor.locator('..')).toContainText('Used by Table 6');
    await expect(anchor).toHaveValue('');
    await expect(context.getByTestId('x4-ui-context-inputs-apply')).toBeDisabled();
    await expect(context.getByTestId('x4-ui-context-inputs-clear')).toHaveCount(0);
    await page.setViewportSize({ width: 1024, height: 900 });
    await node('Text · SEND').scrollIntoViewIfNeeded();
    const captionLabel = node('Text · SEND').getByText('Text · SEND', { exact: true });
    await expect(captionLabel).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('context-MENU-discovery-label.png') });
    expect(await captionLabel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await anchor.scrollIntoViewIfNeeded();
    await expect(anchor).toBeInViewport();
    await expect(page.getByTestId('x4-ui-canvas-scroll')).toBeInViewport();
    const anchorBox = await anchor.boundingBox();
    const canvasBox = await page.getByTestId('x4-ui-canvas-scroll').boundingBox();
    expect(anchorBox!.x).toBeGreaterThanOrEqual(canvasBox!.x + canvasBox!.width);
    expect(anchorBox!.x + anchorBox!.width).toBeLessThanOrEqual(1024);
    await capture('unsupplied-narrow');
    const height = Number(await page.getByTestId('x4-ui-profile-height').inputValue());
    expect(height).toBe(1440);
    expect(originalBytes.toString('utf8')).toContain('local _choiceY = math.floor(vh * 0.68)');
    expect(originalBytes.toString('utf8')).toContain('if menu._pendingAction then _choiceY = _choiceY - Helper.scaleY(150) end');
    const explicitSample = String(Math.floor(height * 0.68));
    await anchor.fill(explicitSample);
    await page.getByTestId('x4-ui-preview-inputs-toggle').click();
    const allInputs = page.getByTestId('x4-ui-preview-inputs-region');
    expect(await allInputs.locator('input, textarea, select').count()).toBe(52);
    await expect(allInputs.getByRole('spinbutton', { name: 'Position Y 4', exact: true })).toHaveValue(explicitSample);
    await page.getByTestId('x4-ui-preview-inputs-toggle').click();
    await context.getByTestId('x4-ui-context-inputs-reset').click();
    await expect(anchor).toHaveValue('');
    await expect(node('Text · SEND')).toContainText('geometry unresolved');
    await expect(page.getByTestId('x4-ui-canvas-selection')).toHaveCount(0);
    await anchor.fill(explicitSample);
    await context.getByTestId('x4-ui-context-inputs-apply').click();
    await expect(node('Text · SEND')).toHaveCount(1);
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    expect(await readB119LuaRoundtripSelectedWorkspace(page)).toEqual(before);
    expect(await readB119LuaRoundtripHistory(page)).toEqual(history);
    await node('Text · SEND').click();
    await page.getByTestId('x4-ui-canvas-focus-selection').click();
    await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText('100% preview');
    const selection = page.getByTestId('x4-ui-canvas-selection');
    await expect(selection).toBeInViewport();
    expect((await selection.boundingBox())!.height).toBeGreaterThanOrEqual(16);
    await page.getByTestId('x4-ui-context-inputs-panel').locator('summary').click();
    await expect(context.getByRole('spinbutton', { name: 'Position Y', exact: true })).toHaveValue(explicitSample);
    expect(await contextualControls.count()).toBe(2);
    await expect(page.getByTestId('x4-ui-builder-hierarchy-status')).toHaveText('partial');
    await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
    await capture('applied-focused-narrow');
    const nativeCanvas = page.locator('[data-testid="x4-ui-canvas-host"] canvas');
    const appliedCanvas = await nativeCanvas.elementHandle();
    expect(appliedCanvas).not.toBeNull();
    const appliedPng = await nativeCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL('image/png'));
    const appliedPixels = await readNativeCanvasSignature(page);
    const assertHistoricalPreview = async () => {
      await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('stale');
      await expect(page.getByTestId('x4-ui-canvas-stale-notice')).toBeVisible();
      await expect(page.getByTestId('x4-ui-canvas-stale-notice')).toContainText('Previous preview — not current');
      await expect(page.getByTestId('x4-ui-canvas-stale-notice')).toContainText('cannot be selected or exported');
      expect(await nativeCanvas.evaluate((canvas, previous) => canvas === previous, appliedCanvas)).toBe(true);
      expect(await nativeCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL('image/png'))).toBe(appliedPng);
      expect(await readNativeCanvasSignature(page)).toEqual(appliedPixels);
      await expect(page.getByTestId('x4-ui-canvas-export')).toBeDisabled();
      await expect(page.getByTestId('x4-ui-canvas-focus-selection')).toBeDisabled();
      await expect(page.getByTestId('x4-ui-canvas-selection')).toHaveCount(0);
      await expect(page.getByTestId('x4-ui-game-truth')).toHaveText('Not verified in game');
    };
    await page.getByTestId('x4-ui-preview-inputs-toggle').click();
    await allInputs.getByTestId('x4-ui-preview-inputs-clear').click();
    await page.getByTestId('x4-ui-preview-inputs-toggle').click();
    await expect(node('Text · SEND')).toContainText('geometry unresolved');
    await expect(page.getByTestId('x4-ui-builder-selected-node-label')).toHaveText('Text · SEND');
    await assertHistoricalPreview();
    await page.getByTestId('x4-ui-canvas-scroll').click();
    await expect(page.getByTestId('x4-ui-builder-selection-empty')).toBeVisible();
    await assertHistoricalPreview();
    expect(await readB119LuaRoundtripSelectedWorkspace(page)).toEqual(before);
    expect(await readB119LuaRoundtripHistory(page)).toEqual(history);
    await capture('cleared');
    await node('Text · SEND').click();
    await expect(anchor).toHaveValue('');
    await page.getByTestId('x4-ui-source-selector').selectOption('');
    await expect(context).toHaveCount(0);
    await expect(page.getByTestId('x4-ui-canvas-stale-notice')).toContainText('Choose a file and menu above');
    await expect(page.getByTestId('x4-ui-canvas-stale-inputs')).toHaveCount(0);
    await selectB119LuaRoundtripSourceAndTarget(page, 'ui/aic_menu.lua', 'menu.display');
    await node('Text · SEND').click();
    await expect(anchor).toHaveValue('');
    await assertHistoricalPreview();
    await capture('cleared-reselected');
    expect(await readB119LuaRoundtripSelectedWorkspace(page)).toEqual(before);
    expect(await readB119LuaRoundtripHistory(page)).toEqual(history);
    await page.getByTestId('x4-ui-canvas-stale-inputs').click();
    await expect(allInputs).toBeVisible();
    await expect(page.getByTestId('x4-ui-preview-inputs-toggle')).toBeFocused();
    await allInputs.getByRole('spinbutton', { name: 'Position Y 4', exact: true }).fill(explicitSample);
    await allInputs.getByTestId('x4-ui-preview-inputs-apply').click();
    await page.getByTestId('x4-ui-preview-inputs-toggle').click();
    await expect(page.getByTestId('x4-ui-canvas-status')).toHaveText('rendered/current');
    await expect(page.getByTestId('x4-ui-canvas-stale-notice')).toHaveCount(0);
    expect(await nativeCanvas.evaluate((canvas, previous) => canvas === previous, appliedCanvas)).toBe(false);
    expect(await nativeCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL('image/png'))).toBe(appliedPng);
    expect(await readNativeCanvasSignature(page)).toEqual(appliedPixels);
    await expect(page.getByTestId('x4-ui-canvas-export')).toBeEnabled();
    await node('Text · SEND').click();
    await page.getByTestId('x4-ui-canvas-focus-selection').click();
    await expect(selection).toBeInViewport();
    await expect(page.getByTestId('x4-ui-canvas-zoom-value')).toHaveText('100% preview');
    await capture('recovered-focused-narrow');
    expect(await readB119LuaRoundtripSelectedWorkspace(page)).toEqual(before);
    expect(await readB119LuaRoundtripHistory(page)).toEqual(history);
    await appliedCanvas!.dispose();
    expect(pageErrors).toEqual([]);
  } finally {
    expect(await readFile(sourceFile)).toEqual(originalBytes);
    await test.info().attach('context-MENU-observations', { body: JSON.stringify({ observations, pageErrors, gameVerified: false }), contentType: 'application/json' });
  }
});

b119LuaFileTest('SourceEditor completes the B119 Lua file download, reload, import, history, collision, and workspace journey', async ({ page }) => {
  // Full multi-workspace journey, not one interaction. Retain each bounded save/action check.
  // Trace evidence: 60s reached byte-exact Undo but cut off Redo and the remaining refusal checks.
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleMessages: Array<{ readonly type: string; readonly text: string }> = [];
  const requestFailures: Array<{ readonly method: string; readonly url: string; readonly failure: string | null; readonly time: string }> = [];
  const downloadEvents: B119LuaRoundtripDownloadEvent[] = [];
  const observedDownloads = new Map<Download, B119LuaRoundtripDownloadEvent>();
  const observations: B119LuaRoundtripObservation[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on('requestfailed', request => requestFailures.push({
    method: request.method(),
    url: request.url(),
    failure: request.failure()?.errorText ?? null,
    time: new Date().toISOString(),
  }));
  page.on('download', download => {
    const event: B119LuaRoundtripDownloadEvent = {
      suggestedFilename: download.suggestedFilename(),
      failure: null,
    };
    downloadEvents.push(event);
    observedDownloads.set(download, event);
  });

  const boundedText = (value: string, limit = 4000): string => (
    value.length <= limit ? value : `${value.slice(0, limit)}…[truncated ${value.length - limit} chars]`
  );

  try {
    const unrelatedFiles = await setupB119LuaRoundtripFixture(page);
    const sourceSelector = page.getByTestId('x4-ui-source-selector');
    const targetSelector = page.getByTestId('x4-ui-target-selector');
    const canvasColumn = page.getByTestId('x4-ui-builder-canvas-column');
    const canvas = page.getByTestId('x4-ui-canvas-host').locator('canvas');
    const canvasStatus = page.getByTestId('x4-ui-canvas-status');
    const gameTruth = page.getByTestId('x4-ui-game-truth');
    const hierarchy = page.getByTestId('x4-ui-builder-hierarchy-list');
    const inspector = page.getByTestId('x4-ui-builder-selection');
    const status = page.getByTestId('x4-ui-lua-status');
    const technical = page.getByTestId('x4-ui-lua-technical');
    const openButton = page.getByRole('button', { name: 'Open Lua file' });
    const fileInput = page.getByLabel('Select one Lua file to open');
    const exportButton = page.getByRole('button', { name: 'Export current Lua file' });
    const undoButton = page.locator('[data-global-action="undo"]');
    const redoButton = page.locator('[data-global-action="redo"]');
    const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
    const workspaceSwitcher = page.getByTestId('workspace-switcher');

    const capture = async (
      label: string,
      requirePositiveWorkspace: boolean,
      screenshotName?: string,
    ): Promise<B119LuaRoundtripObservation> => {
      const snapshot = await waitB119LuaRoundtripWorkspaceSync(page, `${label}: local/server workspace synchronization`);
      const sourceValue = await sourceSelector.inputValue();
      const selectedSourceText = sourceValue === ''
        ? null
        : await sourceSelector.locator('option:checked').textContent();
      const sourcePath = selectedSourceText === null ? null : selectedSourceText.trim();
      if (sourcePath === '') throw new Error(`${label}: selected source option has no path text`);
      const targetValue = await targetSelector.inputValue();
      const selectedTargetText = targetValue === ''
        ? null
        : await targetSelector.locator('option:checked').textContent();
      const targetLabel = selectedTargetText === null ? null : selectedTargetText.trim();
      if (targetLabel === '') throw new Error(`${label}: selected target option has no label text`);
      const sourceText = sourcePath === null ? null : b119LuaRoundtripSourceText(snapshot.serverWorkspace, sourcePath);
      const sourceBytesHex = sourceText === null ? null : b119LuaRoundtripBytesHex(sourceText);
      if (requirePositiveWorkspace) {
        await expect(canvasColumn, `${label}: canvas must remain the primary workspace`).toHaveCount(1);
        await expect(canvasColumn).toBeVisible();
        await expect(canvas).toHaveCount(1);
        await expect(canvas).toBeInViewport();
        await expect(canvasStatus).toHaveText('rendered/current');
        await expect(gameTruth).toHaveText('Not verified in game');
      }
      const canvasCount = await canvas.count();
      if (canvasCount > 1) throw new Error(`${label}: more than one native canvas was mounted`);
      const hierarchyNodes = await readB119LuaRoundtripHierarchy(page);
      const profile = await readB119LuaRoundtripProfile(page, !requirePositiveWorkspace);
      const nativeCanvas = canvasCount === 1 ? await readNativeCanvasSignature(page) : null;
      if (requirePositiveWorkspace) {
        if (hierarchyNodes.length === 0) throw new Error(`${label}: positive workspace checkpoint has an empty hierarchy`);
        if (nativeCanvas === null || nativeCanvas.width <= 0 || nativeCanvas.height <= 0 || nativeCanvas.nonTransparentPixels <= 0) {
          throw new Error(`${label}: positive workspace checkpoint has no nonempty native RGBA observation`);
        }
        if (profile.length !== 5 || profile.some(value => value.length === 0)) {
          throw new Error(`${label}: positive workspace checkpoint does not expose all five nonempty profile fields`);
        }
      }
      const history = await readB119LuaRoundtripHistory(page);
      const screenshotPath = screenshotName === undefined
        ? undefined
        : test.info().outputPath(`b119-lua-file-roundtrip-browser-worker-${screenshotName}.png`);
      if (screenshotPath !== undefined) {
        await page.screenshot({ path: screenshotPath });
        await test.info().attach(`b119-lua-file-roundtrip-${screenshotName}`, { path: screenshotPath, contentType: 'image/png' });
      }
      const observation: B119LuaRoundtripObservation = {
        label,
        workspaceId: snapshot.workspaceId,
        localWorkspace: snapshot.localWorkspace,
        serverWorkspace: snapshot.serverWorkspace,
        sourcePath,
        targetLabel,
        sourceText,
        sourceBytesHex,
        hierarchy: hierarchyNodes,
        nativeCanvas,
        profile,
        history,
        ...(screenshotPath === undefined ? {} : { screenshotPath }),
      };
      observations.push(observation);
      return observation;
    };

    const settleExpectedWorkspace = async (
      workspaceId: string,
      expectedWorkspace: B119LuaRoundtripWorkspace,
      message: string,
    ): Promise<B119LuaRoundtripSelectedWorkspace> => {
      await expect.poll(async () => {
        const snapshot = await readB119LuaRoundtripSelectedWorkspace(page);
        return b119LuaRoundtripMatchesExpected(snapshot, workspaceId, expectedWorkspace);
      }, { timeout: 30_000, message }).toBe(true);
      const settled = await waitB119LuaRoundtripWorkspaceSync(page, `${message}: final synchronization`);
      expect(settled.workspaceId).toBe(workspaceId);
      expect(settled.localWorkspace).toEqual(expectedWorkspace);
      expect(settled.serverWorkspace).toEqual(expectedWorkspace);
      return settled;
    };

    const initial = await capture('initial-empty', false);
    expect(initial.workspaceId.length).toBeGreaterThan(0);
    expect(initial.sourcePath).toBeNull();
    expect(initial.targetLabel).toBeNull();
    expect(initial.sourceText).toBeNull();
    expect(initial.sourceBytesHex).toBeNull();
    expect(initial.hierarchy).toHaveLength(0);
    expect(initial.nativeCanvas).toBeNull();
    expect(initial.history).toEqual({ undo: '(0)|disabled=true', redo: '(0)|disabled=true' });
    for (const unrelated of unrelatedFiles) {
      expect(b119LuaRoundtripFileAt(initial.serverWorkspace, unrelated.path)).toMatchObject(unrelated);
    }
    const originalWorkspaceId = initial.workspaceId;

    const menuName = 'B119 Lua roundtrip menu';
    await expect(page.getByTestId('x4-ui-new-menu-open')).toBeEnabled();
    await page.getByTestId('x4-ui-new-menu-open').click();
    await page.getByTestId('x4-ui-new-menu-name').fill(menuName);
    await page.getByTestId('x4-ui-new-menu-create').click();
    await expect(page.getByTestId('x4-ui-new-menu-status')).toHaveText(`Created ${menuName}.`);
    const afterNewWorkspace = (await waitB119LuaRoundtripWorkspaceSync(page, 'New menu workspace save')).serverWorkspace;
    const newLuaFiles = b119LuaRoundtripFiles(afterNewWorkspace).filter(file => file.path.toLowerCase().endsWith('.lua'));
    expect(newLuaFiles).toHaveLength(1);
    const newLua = newLuaFiles[0];
    if (newLua === undefined || typeof newLua.content !== 'string') throw new Error('New menu did not produce one complete Lua source file');
    const newUiXml = b119LuaRoundtripFileAt(afterNewWorkspace, 'ui.xml');
    if (newUiXml === undefined || typeof newUiXml.content !== 'string') throw new Error('New menu did not produce a complete ui.xml registration');
    expect(newUiXml.content).toBe(b119LuaRoundtripExpectedUiXml(afterNewWorkspace, newLua.path));
    for (const unrelated of unrelatedFiles) {
      expect(b119LuaRoundtripFileAt(afterNewWorkspace, unrelated.path)).toMatchObject(unrelated);
    }
    await selectB119LuaRoundtripSourceAndTarget(page, newLua.path, 'menu.createFrame');
    const afterNew = await capture('after-new-menu', true, 'new-menu');
    expect(afterNew.workspaceId).toBe(originalWorkspaceId);
    expect(afterNew.sourcePath).toBe(newLua.path);
    expect(afterNew.targetLabel).toBe('menu.createFrame');
    expect(afterNew.sourceText).toBe(newLua.content);
    expect(afterNew.serverWorkspace).toEqual(afterNewWorkspace);
    const sourcePath = newLua.path;
    const sourceBeforeAdd = newLua.content;

    const cellTwo = hierarchy.getByRole('treeitem').filter({ hasText: /^Cell 2/ });
    await expect(cellTwo).toHaveCount(1);
    await cellTwo.click();
    const palette = page.getByTestId('x4-ui-contextual-palette');
    await expect(palette).toContainText('Choose text, button, or input.');
    const addedText = 'B119 Lua roundtrip initial widget';
    const paletteText = page.getByTestId('x4-ui-contextual-palette-text');
    await expect(paletteText).toHaveValue('New text');
    await paletteText.fill(addedText);
    const addText = page.getByTestId('x4-ui-contextual-palette-add-text');
    await expect(addText).toBeEnabled();
    const beforeAddCanvas = await canvas.elementHandle();
    if (beforeAddCanvas === null) throw new Error('Add widget did not expose a native canvas before the mutation');
    await addText.click();
    const insertedLine = `  row[2]:createText(${JSON.stringify(addedText)}, {})\n`;
    expect(sourceBeforeAdd.split('  menu.frame:display()')).toHaveLength(2);
    const sourceAfterAdd = sourceBeforeAdd.replace('  menu.frame:display()', `${insertedLine}  menu.frame:display()`);
    const workspaceAfterAdd = b119LuaRoundtripReplaceSource(afterNewWorkspace, sourcePath, sourceAfterAdd);
    const afterAddSettled = await settleExpectedWorkspace(originalWorkspaceId, workspaceAfterAdd, 'Add widget workspace save');
    expect(afterAddSettled.serverWorkspace).toEqual(workspaceAfterAdd);
    const observedInsertedLine = assertSingleInsertedSourceDelta(sourceBeforeAdd, sourceAfterAdd, /row\[2\]:createText\(/, 'New-menu Add widget source delta');
    expect(observedInsertedLine).toBe(insertedLine);
    await assertFreshNativeCanvas(page, beforeAddCanvas, 'Add widget mutation');
    const afterAdd = await capture('after-add-widget', true);
    expect(afterAdd.serverWorkspace).toEqual(workspaceAfterAdd);
    expect(afterAdd.sourceText).toBe(sourceAfterAdd);
    expect(afterAdd.nativeCanvas).not.toEqual(afterNew.nativeCanvas);

    const addedNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Text · B119 Lua roundtrip initial widget/ });
    await expect(addedNode).toHaveCount(1);
    await addedNode.click();
    const addedPropertyInput = await findB119LuaRoundtripTextProperty(inspector, addedText);
    const addedPropertyInputId = await addedPropertyInput.getAttribute('data-testid');
    if (addedPropertyInputId === null) throw new Error('Added text property has no source edit identity');
    const addedPropertyApply = inspector.getByTestId(addedPropertyInputId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
    const editedText = 'B119 Lua roundtrip authored edit';
    const sourceAfterAddBeforeProperty = afterAdd.sourceText;
    if (sourceAfterAddBeforeProperty === null) throw new Error('Added widget observation has no source text');
    const sourceAfterProperty = sourceAfterAddBeforeProperty.replace(JSON.stringify(addedText), JSON.stringify(editedText));
    assertSingleLiteralSourceReplacement(sourceAfterAddBeforeProperty, sourceAfterProperty, addedText, editedText, 'New-menu property edit source delta');
    await addedPropertyInput.fill(editedText);
    await expect(addedPropertyApply).toBeEnabled();
    const beforePropertyCanvas = await canvas.elementHandle();
    if (beforePropertyCanvas === null) throw new Error('Property edit did not expose a native canvas before the mutation');
    await addedPropertyApply.click();
    const workspaceAfterProperty = b119LuaRoundtripReplaceSource(workspaceAfterAdd, sourcePath, sourceAfterProperty);
    const afterPropertySettled = await settleExpectedWorkspace(originalWorkspaceId, workspaceAfterProperty, 'Property edit workspace save');
    expect(afterPropertySettled.serverWorkspace).toEqual(workspaceAfterProperty);
    await assertFreshNativeCanvas(page, beforePropertyCanvas, 'Property edit mutation');
    const afterProperty = await capture('authored-menu', true);
    expect(afterProperty.workspaceId).toBe(originalWorkspaceId);
    expect(afterProperty.serverWorkspace).toEqual(workspaceAfterProperty);
    expect(afterProperty.sourceText).toBe(sourceAfterProperty);
    expect(afterProperty.nativeCanvas).not.toEqual(afterAdd.nativeCanvas);
    expect(b119LuaRoundtripHierarchyIdentity(afterProperty.hierarchy)).not.toEqual(b119LuaRoundtripHierarchyIdentity(afterAdd.hierarchy));
    if (afterProperty.nativeCanvas === null || afterProperty.sourceText === null) throw new Error('Authored positive checkpoint is incomplete');
    const originalWorkspace = afterProperty.serverWorkspace;
    const originalSource = afterProperty.sourceText;
    const originalHierarchy = afterProperty.hierarchy;
    const originalNativeCanvas = afterProperty.nativeCanvas;
    const originalProfile = afterProperty.profile;

    const exportExact = async (
      observationLabel: string,
      workspaceId: string,
      expectedWorkspace: B119LuaRoundtripWorkspace,
      expectedSource: string,
      outputName: string,
      screenshotName: string,
    ): Promise<{ readonly path: string; readonly observation: B119LuaRoundtripObservation }> => {
      const before = await settleExpectedWorkspace(workspaceId, expectedWorkspace, `${observationLabel}: pre-export workspace`);
      expect(
        b119LuaRoundtripMatchesExpected(before, `${workspaceId}-wrong`, expectedWorkspace),
        `${observationLabel}: wrong workspace identity must not satisfy the full-workspace comparison`,
      ).toBe(false);
      const beforeHistory = await readB119LuaRoundtripHistory(page);
      const beforeDownloadCount = downloadEvents.length;
      const downloadPromise = page.waitForEvent('download');
      await expect(exportButton).toBeEnabled();
      await exportButton.click();
      const download = await downloadPromise;
      const observedDownload = observedDownloads.get(download);
      if (observedDownload === undefined) throw new Error(`${observationLabel}: expected download was not captured by the independent download listener`);
      const suggestedFilename = observedDownload.suggestedFilename;
      observedDownload.failure = await download.failure();
      expect(observedDownload.failure, `${observationLabel}: browser download failure`).toBeNull();
      expect(suggestedFilename).toBe(sourcePath.slice(sourcePath.lastIndexOf('/') + 1));
      const outputDirectory = test.info().outputPath(`b119-lua-file-roundtrip-browser-worker-${outputName}`);
      await mkdir(outputDirectory, { recursive: true });
      const outputPath = join(outputDirectory, suggestedFilename);
      await download.saveAs(outputPath);
      const diskBytes = await readFile(outputPath);
      const expectedBytes = new TextEncoder().encode(expectedSource);
      expect(diskBytes.byteLength).toBe(expectedBytes.byteLength);
      expect(Array.from(diskBytes)).toEqual(Array.from(expectedBytes));
      expect(b119LuaRoundtripBytesEqual(diskBytes, expectedSource)).toBe(true);
      expect(diskBytes.toString('utf8')).toBe(expectedSource);
      observedDownload.savedPath = outputPath;
      await expect(status).toContainText(`Download requested for ${sourcePath}; final file save is not verified.`);
      await expect(status).toContainText('Lua source only; dependencies are not included.');
      await expect(status).toContainText('Not verified in game');
      await expect(technical).toHaveCount(1);
      await expect(canvasColumn).toBeVisible();
      await expect(canvas).toBeInViewport();
      const after = await settleExpectedWorkspace(workspaceId, expectedWorkspace, `${observationLabel}: post-export workspace`);
      expect(after.localWorkspace).toEqual(before.localWorkspace);
      expect(after.serverWorkspace).toEqual(before.serverWorkspace);
      expect(await readB119LuaRoundtripHistory(page)).toEqual(beforeHistory);
      expect(downloadEvents).toHaveLength(beforeDownloadCount + 1);
      const observation = await capture(observationLabel, true, screenshotName);
      expect(observation.serverWorkspace).toEqual(expectedWorkspace);
      expect(observation.sourceText).toBe(expectedSource);
      return { path: outputPath, observation };
    };

    const firstExport = await exportExact('after-export-first', originalWorkspaceId, originalWorkspace, originalSource, 'first-download.lua', 'export-first-status');
    expect(firstExport.observation.workspaceId).toBe(originalWorkspaceId);
    expect(b119LuaRoundtripHierarchyIdentity(firstExport.observation.hierarchy)).toEqual(b119LuaRoundtripHierarchyIdentity(originalHierarchy));
    expect(firstExport.observation.nativeCanvas).toEqual(originalNativeCanvas);
    expect(firstExport.observation.profile).toEqual(originalProfile);

    await page.reload();
    await expect(page.getByTestId('studio-workspace')).toBeVisible();
    await uiDesigner.click();
    await expect(uiDesigner).toHaveAttribute('aria-current', 'page');
    await selectB119LuaRoundtripSourceAndTarget(page, sourcePath, 'menu.createFrame');
    const reloaded = await capture('reloaded-original', true);
    expect(reloaded.workspaceId).toBe(originalWorkspaceId);
    expect(reloaded.serverWorkspace).toEqual(originalWorkspace);
    expect(reloaded.localWorkspace).toEqual(originalWorkspace);
    expect(reloaded.sourceText).toBe(originalSource);
    expect(reloaded.sourceBytesHex).toBe(b119LuaRoundtripBytesHex(originalSource));
    expect(b119LuaRoundtripHierarchyIdentity(reloaded.hierarchy)).toEqual(b119LuaRoundtripHierarchyIdentity(originalHierarchy));
    expect(reloaded.nativeCanvas).toEqual(originalNativeCanvas);
    expect(reloaded.profile).toEqual(originalProfile);
    expect(reloaded.targetLabel).toBe('menu.createFrame');

    await workspaceSwitcher.focus();
    await expect(workspaceSwitcher).toBeFocused();
    await workspaceSwitcher.selectOption('__new');
    const newWorkspaceDialog = page.getByTestId('dialog-modal');
    await expect(newWorkspaceDialog).toBeVisible();
    await expect(newWorkspaceDialog).toContainText('Name the new independent workspace.');
    const independentName = 'B119 Lua roundtrip independent';
    await newWorkspaceDialog.getByTestId('dialog-input').fill(independentName);
    await newWorkspaceDialog.getByTestId('dialog-ok').click();
    await expect(page.getByTestId('toast').filter({ hasText: `Created independent workspace "${independentName}".` })).toBeVisible();
    const independent = await capture('independent-empty', false);
    expect(independent.workspaceId).not.toBe(originalWorkspaceId);
    expect(independent.sourcePath).toBeNull();
    expect(independent.sourceText).toBeNull();
    expect(independent.hierarchy).toHaveLength(0);
    expect(independent.nativeCanvas).toBeNull();
    for (const field of ['nodes', 'links', 'uiWidgets', 'originalFiles', 'passthroughFiles', 'aiScripts', 'wares', 'jobs', 'xmlPatches', 'tFiles', 'templates']) {
      expect(independent.serverWorkspace[field], `Independent workspace ${field} must be empty`).toEqual([]);
    }
    expect(independent.serverWorkspace.customLua).toBeUndefined();
    assertB119LuaRoundtripHistory(independent.history, 0, 0, 'Independent empty workspace');
    const independentUndoCount = b119LuaRoundtripHistoryState(independent.history.undo, 'Independent empty workspace undo').count;
    const expectedImportedUndoCount = independentUndoCount + 1;
    expect(b119LuaRoundtripFileAt(independent.serverWorkspace, sourcePath)).toBeUndefined();
    expect(b119LuaRoundtripFiles(independent.serverWorkspace).some(file => /\.lua$/i.test(file.path))).toBe(false);
    const expectedImportedWorkspace = b119LuaRoundtripExpectedImportedWorkspace(independent.serverWorkspace, sourcePath, originalSource);

    await expect(openButton).toBeEnabled();
    await expect(fileInput).toBeEnabled();
    await fileInput.setInputFiles(firstExport.path);
    await expect(status).toContainText(`Opened ${sourcePath} and selected its menu target`);
    await expect(status).toContainText('Not verified in game');
    const importedSettled = await settleExpectedWorkspace(independent.workspaceId, expectedImportedWorkspace, 'Downloaded Lua import workspace save');
    expect(importedSettled.serverWorkspace).toEqual(expectedImportedWorkspace);
    const importedUiXml = b119LuaRoundtripFileAt(expectedImportedWorkspace, 'ui.xml');
    if (importedUiXml === undefined || typeof importedUiXml.content !== 'string') throw new Error('Imported workspace is missing its literal ui.xml registration');
    expect(importedUiXml.content).toBe(b119LuaRoundtripExpectedUiXml(independent.serverWorkspace, sourcePath));
    await expect(sourceSelector.locator('option:checked')).toHaveText(sourcePath);
    await expect(targetSelector.locator('option:checked')).toHaveText('menu.createFrame');
    const imported = await capture('after-import-status', true, 'import-status');
    await expect(targetSelector.locator('option')).toHaveText(['Select menu…', 'menu.createFrame']);
    await expect(page.getByTestId('x4-ui-inspect-target-selector').locator('option')).toHaveCount(7);
    for (const helper of ['refreshHelper', 'menu.open', 'menu.onShowMenu', 'menu.cleanup']) {
      await expect(page.getByTestId('x4-ui-inspect-target-selector').locator('option').filter({ hasText: helper })).toHaveCount(1);
    }
    expect(imported.workspaceId).toBe(independent.workspaceId);
    expect(imported.serverWorkspace).toEqual(expectedImportedWorkspace);
    expect(imported.localWorkspace).toEqual(expectedImportedWorkspace);
    expect(imported.sourceText).toBe(originalSource);
    expect(imported.sourceBytesHex).toBe(b119LuaRoundtripBytesHex(originalSource));
    expect(b119LuaRoundtripHierarchyIdentity(imported.hierarchy)).toEqual(b119LuaRoundtripHierarchyIdentity(originalHierarchy));
    expect(imported.nativeCanvas).toEqual(originalNativeCanvas);
    expect(imported.profile).toEqual(originalProfile);
    expect(imported.targetLabel).toBe('menu.createFrame');

    const importedSource = imported.sourceText;
    if (importedSource === null || imported.nativeCanvas === null) throw new Error('Imported positive checkpoint is incomplete');
    const importedWorkspace = imported.serverWorkspace;
    const importedHistory = imported.history;
    assertB119LuaRoundtripHistory(importedHistory, expectedImportedUndoCount, 0, 'After-import');
    const importedTextNode = hierarchy.getByRole('treeitem').filter({ hasText: /^Text · B119 Lua roundtrip authored edit/ });
    await expect(importedTextNode).toHaveCount(1);
    await importedTextNode.click();
    const importedPropertyInput = await findB119LuaRoundtripTextProperty(inspector, editedText);
    const importedPropertyInputId = await importedPropertyInput.getAttribute('data-testid');
    if (importedPropertyInputId === null) throw new Error('Imported text property has no source edit identity');
    const importedPropertyApply = inspector.getByTestId(importedPropertyInputId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
    const finalText = 'B119 Lua roundtrip final edit';
    const sourceAfterVisualEdit = importedSource.replace(JSON.stringify(editedText), JSON.stringify(finalText));
    assertSingleLiteralSourceReplacement(importedSource, sourceAfterVisualEdit, editedText, finalText, 'Visual edit source delta');
    await importedPropertyInput.fill(finalText);
    await expect(importedPropertyApply).toBeEnabled();
    const beforeVisualEditCanvas = await canvas.elementHandle();
    if (beforeVisualEditCanvas === null) throw new Error('Visual edit did not expose a native canvas before the mutation');
    await importedPropertyApply.click();
    const workspaceAfterVisualEdit = b119LuaRoundtripReplaceSource(importedWorkspace, sourcePath, sourceAfterVisualEdit);
    const afterVisualSettled = await settleExpectedWorkspace(independent.workspaceId, workspaceAfterVisualEdit, 'Visual edit workspace save');
    expect(afterVisualSettled.serverWorkspace).toEqual(workspaceAfterVisualEdit);
    await assertFreshNativeCanvas(page, beforeVisualEditCanvas, 'Visual edit mutation');
    const afterVisual = await capture('after-visual-edit', true);
    expect(afterVisual.serverWorkspace).toEqual(workspaceAfterVisualEdit);
    expect(afterVisual.sourceText).toBe(sourceAfterVisualEdit);
    expect(afterVisual.nativeCanvas).not.toEqual(imported.nativeCanvas);
    expect(b119LuaRoundtripHierarchyIdentity(afterVisual.hierarchy)).not.toEqual(b119LuaRoundtripHierarchyIdentity(imported.hierarchy));
    expect(afterVisual.hierarchy.some(node => node.label === `Text · ${finalText}`)).toBe(true);
    assertB119LuaRoundtripHistory(afterVisual.history, expectedImportedUndoCount + 1, 0, 'After visual edit');

    const undoCanvas = await canvas.elementHandle();
    if (undoCanvas === null) throw new Error('Visual edit did not expose a native canvas before Undo');
    await expect(undoButton).toBeEnabled();
    await undoButton.click();
    await settleExpectedWorkspace(independent.workspaceId, importedWorkspace, 'Undo workspace restoration');
    await selectB119LuaRoundtripSourceAndTarget(page, sourcePath, 'menu.createFrame');
    await assertFreshNativeCanvas(page, undoCanvas, 'Undo restoration');
    const undone = await capture('undo-imported', true);
    expect(undone.serverWorkspace).toEqual(importedWorkspace);
    expect(undone.sourceText).toBe(importedSource);
    expect(b119LuaRoundtripHierarchyIdentity(undone.hierarchy)).toEqual(b119LuaRoundtripHierarchyIdentity(imported.hierarchy));
    expect(undone.nativeCanvas).toEqual(imported.nativeCanvas);
    expect(undone.profile).toEqual(imported.profile);
    assertB119LuaRoundtripHistory(undone.history, expectedImportedUndoCount, 1, 'Undo after visual edit');

    const redoCanvas = await canvas.elementHandle();
    if (redoCanvas === null) throw new Error('Undo did not expose a native canvas before Redo');
    await expect(redoButton).toBeEnabled();
    await redoButton.click();
    await settleExpectedWorkspace(independent.workspaceId, workspaceAfterVisualEdit, 'Redo workspace restoration');
    await selectB119LuaRoundtripSourceAndTarget(page, sourcePath, 'menu.createFrame');
    await assertFreshNativeCanvas(page, redoCanvas, 'Redo restoration');
    const redone = await capture('redo-visual-edit', true);
    expect(redone.serverWorkspace).toEqual(workspaceAfterVisualEdit);
    expect(redone.sourceText).toBe(sourceAfterVisualEdit);
    expect(b119LuaRoundtripHierarchyIdentity(redone.hierarchy)).toEqual(b119LuaRoundtripHierarchyIdentity(afterVisual.hierarchy));
    expect(redone.nativeCanvas).toEqual(afterVisual.nativeCanvas);
    expect(redone.profile).toEqual(afterVisual.profile);
    assertB119LuaRoundtripHistory(redone.history, expectedImportedUndoCount + 1, 0, 'Redo after visual edit');

    const secondExport = await exportExact('after-export-second', independent.workspaceId, workspaceAfterVisualEdit, sourceAfterVisualEdit, 'second-download.lua', 'export-second-status');
    expect(secondExport.observation.sourceBytesHex).toBe(b119LuaRoundtripBytesHex(sourceAfterVisualEdit));
    expect(downloadEvents).toHaveLength(2);

    const collisionBefore = await settleExpectedWorkspace(independent.workspaceId, workspaceAfterVisualEdit, 'Collision pre-attempt workspace');
    const collisionHistory = await readB119LuaRoundtripHistory(page);
    const collisionDownloadCount = downloadEvents.length;
    const collisionNativeCanvas = await readNativeCanvasSignature(page);
    await fileInput.setInputFiles(firstExport.path);
    await expect(status).toHaveText('That filename is already used by the workspace. Choose a different filename; existing files are never overwritten.');
    await expect(technical).toContainText('path-collision');
    const collisionAfter = await settleExpectedWorkspace(independent.workspaceId, workspaceAfterVisualEdit, 'Collision refusal workspace preservation');
    expect(collisionAfter.localWorkspace).toEqual(collisionBefore.localWorkspace);
    expect(collisionAfter.serverWorkspace).toEqual(collisionBefore.serverWorkspace);
    expect(await readB119LuaRoundtripHistory(page)).toEqual(collisionHistory);
    expect(downloadEvents).toHaveLength(collisionDownloadCount);
    const collisionObservation = await capture('collision-refused', true);
    expect(collisionObservation.serverWorkspace).toEqual(workspaceAfterVisualEdit);
    expect(collisionObservation.nativeCanvas).toEqual(collisionNativeCanvas);

    await selectB119LuaRoundtripSourceAndTarget(page, sourcePath, 'menu.createFrame');
    const stagedBefore = await capture('before-staged-edit', true);
    const stagedHistory = stagedBefore.history;
    const stagedDownloadCount = downloadEvents.length;
    const stagedNativeCanvas = stagedBefore.nativeCanvas;
    if (stagedNativeCanvas === null) throw new Error('Staged-edit checkpoint is missing native canvas pixels');
    const stagedTextNode = hierarchy.getByRole('treeitem').filter({ hasText: `Text · ${finalText}` });
    await expect(stagedTextNode).toHaveCount(1);
    await stagedTextNode.click();
    const stagedInput = await findB119LuaRoundtripTextProperty(inspector, finalText);
    const stagedInputId = await stagedInput.getAttribute('data-testid');
    if (stagedInputId === null) throw new Error('Staged property has no source edit identity');
    const stagedApply = inspector.getByTestId(stagedInputId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-'));
    const stagedDiscard = page.getByTestId('x4-ui-builder-source-edit-discard');
    const stagedDraftBlock = page.getByTestId('x4-ui-lua-draft-block');
    await stagedInput.fill('B119 Lua roundtrip uncommitted draft');
    await expect(stagedApply).toBeEnabled();
    await expect(stagedDiscard).toBeVisible();
    await expect(stagedDiscard).toHaveText('Discard property changes');
    await expect(stagedDiscard).toBeEnabled();
    await expect(stagedDraftBlock).toBeVisible();
    await expect(stagedDraftBlock).toHaveText('Apply or Discard the current source edit before file actions.');
    await expect(exportButton).toBeDisabled();
    await expect(exportButton).toHaveAttribute('title', 'Apply or Discard the current source edit before exporting Lua.');
    await expect(openButton).toBeDisabled();
    await expect(fileInput).toBeDisabled();
    const stagedAttempt = await settleExpectedWorkspace(independent.workspaceId, workspaceAfterVisualEdit, 'Staged export refusal workspace preservation');
    expect(stagedAttempt.localWorkspace).toEqual(stagedBefore.localWorkspace);
    expect(stagedAttempt.serverWorkspace).toEqual(stagedBefore.serverWorkspace);
    expect(await readB119LuaRoundtripHistory(page)).toEqual(stagedHistory);
    expect(downloadEvents).toHaveLength(stagedDownloadCount);
    expect(await readNativeCanvasSignature(page)).toEqual(stagedNativeCanvas);
    await stagedDiscard.click();
    await expect(stagedDraftBlock).toHaveCount(0);
    await expect(exportButton).toBeEnabled();
    await expect(openButton).toBeEnabled();
    await expect(fileInput).toBeEnabled();
    await expect(stagedInput).toHaveValue(finalText);
    const recovered = await settleExpectedWorkspace(independent.workspaceId, workspaceAfterVisualEdit, 'Staged discard recovery workspace');
    expect(recovered.serverWorkspace).toEqual(stagedBefore.serverWorkspace);
    expect(await readB119LuaRoundtripHistory(page)).toEqual(stagedHistory);
    expect(downloadEvents).toHaveLength(stagedDownloadCount);
    const recoveredObservation = await capture('staged-discard-recovered', true);
    expect(recoveredObservation.serverWorkspace).toEqual(workspaceAfterVisualEdit);
    expect(recoveredObservation.nativeCanvas).toEqual(stagedNativeCanvas);
    expect(b119LuaRoundtripHierarchyIdentity(recoveredObservation.hierarchy)).toEqual(b119LuaRoundtripHierarchyIdentity(stagedBefore.hierarchy));

    await workspaceSwitcher.focus();
    await expect.poll(async () => workspaceSwitcher.locator('option').evaluateAll((options, workspaceId) => (
      options.some(option => option instanceof HTMLOptionElement && option.value === `workspace:${String(workspaceId)}`)
    ), originalWorkspaceId), { timeout: 30_000, message: 'Original workspace must be available through the actual switcher' }).toBe(true);
    await workspaceSwitcher.selectOption({ value: `workspace:${originalWorkspaceId}` });
    const restoreDialog = page.getByTestId('dialog-modal');
    await expect(restoreDialog).toBeVisible();
    await expect(restoreDialog).toContainText(`current workspace remains saved under ${independent.workspaceId}`);
    await restoreDialog.getByTestId('dialog-ok').click();
    const restored = await capture('restored-original-workspace', true);
    expect(restored.workspaceId).toBe(originalWorkspaceId);
    expect(restored.serverWorkspace).toEqual(originalWorkspace);
    expect(restored.localWorkspace).toEqual(originalWorkspace);
    expect(restored.sourcePath).toBe(sourcePath);
    expect(restored.targetLabel).toBe('menu.createFrame');
    expect(restored.sourceText).toBe(originalSource);
    expect(restored.sourceBytesHex).toBe(b119LuaRoundtripBytesHex(originalSource));
    expect(b119LuaRoundtripHierarchyIdentity(restored.hierarchy)).toEqual(b119LuaRoundtripHierarchyIdentity(originalHierarchy));
    expect(restored.nativeCanvas).toEqual(originalNativeCanvas);
    expect(restored.profile).toEqual(originalProfile);
    expect(downloadEvents).toHaveLength(2);

    expect(pageErrors, pageErrors.map(error => boundedText(error)).join('\n')).toEqual([]);
    const consoleErrors = consoleMessages.filter(message => message.type === 'error').map(message => message.text);
    expect(consoleErrors, consoleErrors.map(error => boundedText(error)).join('\n')).toEqual([]);
    expect(requestFailures, JSON.stringify(requestFailures)).toEqual([]);
  } finally {
    const artifactPath = test.info().outputPath('b119-lua-file-roundtrip-browser-worker-observations.json');
    await writeFile(artifactPath, JSON.stringify({
      observations,
      downloads: downloadEvents,
      pageErrors: pageErrors.map(error => boundedText(error)),
      consoleMessages: consoleMessages.map(message => ({ type: message.type, text: boundedText(message.text) })),
      requestFailures,
    }, null, 2), 'utf8');
    await test.info().attach('b119-lua-file-roundtrip-browser-worker-observations', { path: artifactPath, contentType: 'application/json' });
  }
});
