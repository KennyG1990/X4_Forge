import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from './request-transport';
import { openStudioAction } from './studio-actions';
import { buildHealthCard } from '../../src/lib/healthCard';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { workspaceContentHash } from '../../src/lib/workspaceIdentity';
import { sanitizeWorkspace } from '../../src/types';
import {
  GLOBAL_ACTION_IDS,
  DEFAULT_STUDIO_LAYOUT,
  SIDEBAR_NAV_ITEMS,
  STUDIO_LAYOUT_KEY,
  WORKSPACE_NAV_ITEMS,
} from '../../src/lib/studioLayout';
import { readServerLayout, seedServerLayout, seedServerWorkspace } from './ephemeral';

type E2EWindow = Window & {
  AgentRuntime?: { getCurrentWorkspace: () => ReturnType<typeof buildTemplateWorkspace> };
};

async function liveWorkspaceHash(page: Page): Promise<string> {
  const value = await page.evaluate(() => (window as E2EWindow).AgentRuntime!.getCurrentWorkspace());
  return workspaceContentHash(sanitizeWorkspace(value));
}

async function bootExpert(page: Page, layout?: unknown) {
  const seededWorkspace = buildTemplateWorkspace('welcome');
  const seededHash = workspaceContentHash(sanitizeWorkspace(seededWorkspace));
  await seedServerWorkspace(seededWorkspace);
  await seedServerLayout(layout === undefined ? DEFAULT_STUDIO_LAYOUT : layout);
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    if (sessionStorage.getItem('__x4_studio_shell_initialized') !== '1') {
      localStorage.removeItem(key);
      if (value !== undefined) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      sessionStorage.setItem('__x4_studio_shell_initialized', '1');
    }
  }, { key: STUDIO_LAYOUT_KEY, value: layout });
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  // Rendering the shell is not proof that its asynchronous boot read has adopted the
  // seeded server workspace. Wait for that authoritative content before measuring
  // navigation immutability, otherwise a legitimate late boot adoption looks like a
  // shell action changed project data and flakes under a busy full-suite run.
  await expect.poll(
    () => liveWorkspaceHash(page),
    { timeout: 15_000 },
  ).toBe(seededHash);
  const health = page.getByTestId('health-card');
  await health.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await health.isVisible()) await page.getByTestId('health-card-dismiss').click();
}

test('lossless registries keep every destination and utility recoverable', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  let inventoryReads = 0;
  await page.route('**/api/agent/project/files', route => {
    inventoryReads += 1;
    return route.fulfill({ json: { ok: true, sourceAvailable: true, excludedCount: 0, entries: [
      { path: 'md/welcome.xml', state: 'source', size: 90, text: true, openable: true, materializable: false },
      { path: 'md/other.xml', state: 'conflict', size: 110, text: true, openable: true, materializable: true },
    ] } });
  });
  await bootExpert(page);
  const initialHash = await liveWorkspaceHash(page);

  const expectedExtVersion = String(
    JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vscode-extension/package.json'), 'utf8')).version,
  ).trim();
  const headerVersionBadge = page.getByTestId('studio-header').locator('span[title]').first();
  await expect(headerVersionBadge).toHaveText(`v${expectedExtVersion}`);
  await expect(headerVersionBadge).toHaveAttribute('title', /^build \d{3,} · [0-9a-f]{7,} · \d{4}-\d{2}-\d{2}(?: · uncommitted)?$/);

  await expect(page.locator('[data-workspace-view]')).toHaveCount(WORKSPACE_NAV_ITEMS.length);
  for (const item of WORKSPACE_NAV_ITEMS) {
    await page.locator(`[data-workspace-view="${item.id}"]`).click();
    await expect(page.locator(`[data-workspace-view="${item.id}"]`)).toHaveAttribute('aria-current', 'page');
  }

  const visibleTools = SIDEBAR_NAV_ITEMS.filter(item => item.id !== 'ai');
  await expect(page.locator('[data-sidebar-tab]')).toHaveCount(visibleTools.length);
  for (const item of visibleTools) {
    await page.locator(`[data-sidebar-tab="${item.id}"]`).click();
    await expect(page.locator(`[data-sidebar-tab="${item.id}"]`)).toHaveAttribute('aria-current', 'page');
  }

  const trigger = page.getByTestId('studio-menu-button');
  const menu = page.getByTestId('studio-menu');
  const picker = page.getByTestId('native-project-files');
  const projectFiles = picker.getByRole('combobox', { name: 'Project Files' });
  await expect(picker).toHaveCount(1);
  await projectFiles.selectOption('md/other.xml');
  const initialInventoryReads = inventoryReads;
  const consolidated = ['sync-mod', 'agent-api', 'report-bug', 'settings', 'reset-workspace'];
  for (const action of consolidated) {
    await expect(page.locator(`[data-global-action="${action}"]`)).toHaveCount(0);
  }

  await trigger.press('Enter');
  await expect(trigger).toHaveAccessibleName('Studio actions');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(projectFiles).toBeFocused();
  await expect(menu.getByTestId('native-project-files')).toHaveCount(0);
  for (const action of GLOBAL_ACTION_IDS.filter(id => ![
    'undo', 'redo', 'shortcuts', 'workspace-switcher', 'native-project-files', 'experience-mode', 'ai-settings',
  ].includes(id))) {
    await expect(menu.locator(`[data-global-action="${action}"]`)).toBeVisible();
  }
  for (const action of consolidated) {
    await expect(page.locator(`[data-global-action="${action}"]`)).toHaveCount(1);
  }
  await expect(menu.locator('[data-global-action="ai-settings"]')).toHaveCount(0);
  await expect(menu.getByTestId('report-bug-button')).toBeVisible();

  await menu.getByRole('button', { name: 'Sync Mod' }).press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(picker).toBeHidden();
  await trigger.press('Space');
  await expect(picker).toHaveCount(1);
  await expect(projectFiles).toBeVisible();
  await expect(projectFiles).toHaveValue('md/other.xml');
  await expect(picker.getByTitle('Compare workspace source with Forge-generated md/other.xml')).toBeVisible();
  await expect(picker.getByTitle('Generated and source bytes differ; review instead of overwriting')).toBeDisabled();
  await trigger.press('Escape');
  await expect(picker).toBeHidden();
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(projectFiles).toHaveValue('md/other.xml');
  expect(inventoryReads).toBe(initialInventoryReads);

  await trigger.press('Enter');
  await page.keyboard.press('?');
  await expect(page.getByTestId('shortcuts-overlay')).toBeVisible();
  await trigger.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('shortcuts-overlay')).toHaveCount(0);

  await trigger.press('Space');
  await expect(page.getByText('CREATE NODE HERE', { exact: true })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Reset Workspace…' }).press('Enter');
  await expect(menu).toHaveCount(0);
  const keepWorkspace = page.getByRole('button', { name: 'Keep workspace' });
  await expect(keepWorkspace).toBeVisible();
  await keepWorkspace.click();
  await expect(trigger).toBeFocused();
  await expect(page.locator('[data-global-action="undo"]')).toBeVisible();
  await expect(page.locator('[data-global-action="redo"]')).toBeVisible();
  await expect(page.locator('[data-global-action="shortcuts"]')).toBeVisible();
  await expect(page.locator('[data-global-action="workspace-switcher"]')).toBeVisible();
  await expect(page.getByTestId('experience-mode-switch')).toBeVisible();

  const searchLauncher = page.getByRole('button', { name: 'Search workspace', exact: true });
  const searchPanel = page.getByTestId('workspace-search-panel');
  const searchInput = searchPanel.locator('input');
  await expect(searchLauncher).toBeHidden();
  await expect(searchInput).toHaveCount(1);
  await expect(searchInput).toBeVisible();
  await page.setViewportSize({ width: 1023, height: 900 });
  await expect(searchLauncher).toBeVisible();
  await expect(searchInput).toBeHidden();
  await page.keyboard.press('Control+k');
  await expect(searchInput).toBeFocused();
  await searchInput.fill('show_help');
  await expect(searchPanel.getByText('Matched Search Targets (1)')).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(searchLauncher).toBeHidden();
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveValue('show_help');
  await page.setViewportSize({ width: 800, height: 900 });
  await searchInput.press('Escape');
  await expect(searchLauncher).toBeFocused();
  await expect(searchInput).toBeHidden();
  await searchLauncher.click();
  await expect(searchInput).toBeFocused();
  await expect(searchInput).toHaveValue('show_help');
  await searchInput.press('Enter');
  await expect(page.locator('[data-workspace-view="blueprint"]')).toHaveAttribute('aria-current', 'page');
  await expect(searchInput).toBeHidden();
  await expect(searchLauncher).toBeFocused();
  expect(await liveWorkspaceHash(page)).toBe(initialHash);
});

test('layout customization docks, hides, reorders, collapses, restores, and persists', async ({ page, browser }) => {
  const lateHealthCard = buildHealthCard({ mdSchema: { loaded: true, elements: 1 } });
  expect(lateHealthCard.verdict).toBe('attention');
  let showHealthCard!: () => void;
  const healthCardHeld = new Promise<void>(resolve => { showHealthCard = resolve; });
  await page.route('**/api/agent/health-card', async route => {
    await healthCardHeld;
    await route.fulfill({ json: lateHealthCard });
  });
  let initialHash: string;
  try {
    await bootExpert(page);
    initialHash = await liveWorkspaceHash(page);

    const aiScriptsTab = page.locator('[data-workspace-view="aiscripts"]');
    const aiScriptsBox = await aiScriptsTab.boundingBox();
    expect(aiScriptsBox).not.toBeNull();
    await page.locator('[data-workspace-view="blueprint"]').dragTo(aiScriptsTab, {
      targetPosition: { x: aiScriptsBox!.width - 2, y: aiScriptsBox!.height / 2 },
    });
    await expect(page.locator('[data-workspace-view]').first()).toHaveAttribute('data-workspace-view', 'aiscripts');

    const cuesTool = page.locator('[data-sidebar-tab="cues"]');
    const cuesBox = await cuesTool.boundingBox();
    expect(cuesBox).not.toBeNull();
    await page.locator('[data-sidebar-tab="script"]').dragTo(cuesTool, {
      targetPosition: { x: cuesBox!.width / 2, y: cuesBox!.height - 2 },
    });
    await expect(page.locator('[data-sidebar-tab]').first()).toHaveAttribute('data-sidebar-tab', 'cues');
    await page.getByTestId('workspace-nav-collapse').click();
    await expect(page.getByTestId('workspace-bar-collapsed')).toBeVisible();
    await page.getByTestId('workspace-bar-collapsed').getByRole('button').click();
    await expect(page.getByTestId('workspace-navigation')).toBeVisible();

    await page.getByTestId('studio-settings-tool').click();
    const layoutSettings = page.getByTestId('studio-layout-settings');
    await expect(layoutSettings).toBeVisible();
    await layoutSettings.getByTestId('workspace-dock-select').selectOption('bottom');
    await layoutSettings.getByTestId('tool-dock-select').selectOption('right');
    await layoutSettings.getByRole('button', { name: 'Move MD Scripts down' }).click();
    await layoutSettings.getByRole('button', { name: 'Move MD Scripts down' }).click();
    await layoutSettings.getByRole('button', { name: 'Hide AI Scripts' }).click();
    await layoutSettings.getByRole('button', { name: 'Hide Files' }).click();
    await layoutSettings.getByRole('button', { name: 'Hide panel', exact: true }).click();
    await page.getByRole('button', { name: 'Close settings' }).click();

    await expect(page.getByTestId('workspace-navigation')).toHaveAttribute('data-dock', 'bottom');
    await expect(page.locator('[data-workspace-view="aiscripts"]')).toHaveCount(0);
    await expect(page.getByTestId('side-panel-restore')).toBeVisible();
    await page.getByTestId('side-panel-restore').click();
    await expect(page.locator('#side_panel')).toHaveAttribute('data-tool-dock', 'right');
    await expect(page.locator('[data-sidebar-tab="filesystem"]')).toHaveCount(0);
  } finally {
    showHealthCard();
  }

  const healthCard = page.getByTestId('health-card');
  await expect(healthCard).toBeVisible();
  await expect(healthCard).toContainText(lateHealthCard.summary);
  const healthCardBox = await healthCard.boundingBox();
  const toolRailCollapseBox = await page.getByTestId('tool-rail-collapse').boundingBox();
  const workspaceNavigationBox = await page.getByTestId('workspace-navigation').boundingBox();
  expect(healthCardBox).not.toBeNull();
  expect(toolRailCollapseBox).not.toBeNull();
  expect(workspaceNavigationBox).not.toBeNull();
  const boxesOverlap = (first: NonNullable<typeof healthCardBox>, second: NonNullable<typeof toolRailCollapseBox>) =>
    first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
  expect(boxesOverlap(healthCardBox!, toolRailCollapseBox!)).toBe(false);
  expect(healthCardBox!.y + healthCardBox!.height).toBeLessThanOrEqual(workspaceNavigationBox!.y);
  await page.getByTestId('tool-rail-collapse').click();
  await expect(page.getByTestId('tool-rail-restore')).toBeVisible();
  await page.getByTestId('tool-rail-restore').click();

  const firstWorkspace = await page.locator('[data-workspace-view]').first().getAttribute('data-workspace-view');
  expect(firstWorkspace).toBe('libraries');
  await expect.poll(async () => {
    const saved = await readServerLayout();
    return `${saved?.workspaceDock}:${saved?.toolDock}:${saved?.hiddenWorkspaceViews?.includes('aiscripts')}`;
  }).toBe('bottom:right:true');
  // Extension sidecar restarts change localhost port/origin. A fresh browser context has
  // no layout localStorage, so only the durable server preference can restore the shell.
  const restartedContext = await browser.newContext();
  await restartedContext.addInitScript(() => localStorage.setItem('x4_forge_experience_mode', 'expert'));
  const restartedPage = await restartedContext.newPage();
  await restartedPage.goto(new URL('/', page.url()).toString());
  await expect(restartedPage.getByTestId('workspace-navigation')).toHaveAttribute('data-dock', 'bottom');
  await expect(restartedPage.locator('#side_panel')).toHaveAttribute('data-tool-dock', 'right');
  await expect(restartedPage.locator('[data-workspace-view="aiscripts"]')).toHaveCount(0);
  await openStudioAction(restartedPage, 'settings');
  const restoredSettings = restartedPage.getByTestId('studio-layout-settings');
  await restoredSettings.getByRole('button', { name: 'Show AI Scripts' }).click();
  await restoredSettings.getByRole('button', { name: 'Show Files' }).click();
  await restartedPage.getByRole('button', { name: 'Close settings' }).click();
  await restartedPage.locator('[data-workspace-view="aiscripts"]').click();
  await expect(restartedPage.locator('[data-workspace-view="aiscripts"]')).toHaveAttribute('aria-current', 'page');
  await restartedPage.locator('[data-sidebar-tab="filesystem"]').click();
  await expect(restartedPage.locator('[data-sidebar-tab="filesystem"]')).toHaveAttribute('aria-current', 'page');
  expect(await liveWorkspaceHash(restartedPage)).toBe(initialHash);
  await restartedContext.close();
});

test('corrupt and all-hidden preferences recover to a usable complete shell', async ({ page }) => {
  await bootExpert(page, '{not-json');
  await expect(page.locator('[data-workspace-view]')).toHaveCount(WORKSPACE_NAV_ITEMS.length);
  await expect(page.locator('[data-sidebar-tab]')).toHaveCount(SIDEBAR_NAV_ITEMS.length - 1);

  await page.evaluate(({ key, workspaces, tools }) => localStorage.setItem(key, JSON.stringify({
    workspaceOrder: ['wiki', 'wiki', 'unknown'],
    hiddenWorkspaceViews: workspaces,
    toolOrder: ['reference', 'reference', 'unknown'],
    hiddenTools: tools,
  })), { key: STUDIO_LAYOUT_KEY, workspaces: WORKSPACE_NAV_ITEMS.map(item => item.id), tools: SIDEBAR_NAV_ITEMS.map(item => item.id) });
  await page.reload();
  await expect(page.locator('[data-workspace-view]')).toHaveCount(WORKSPACE_NAV_ITEMS.length);
  await expect(page.locator('[data-sidebar-tab]')).toHaveCount(SIDEBAR_NAV_ITEMS.length - 1);
});

for (const width of [2560, 1920, 1600, 1366, 1024, 800]) {
  test(`shell stays inside the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await bootExpert(page);
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.client);

    const trigger = page.getByTestId('studio-menu-button');
    await trigger.click();
    const menu = page.getByTestId('studio-menu');
    await expect(menu.getByTestId('report-bug-button')).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await trigger.press('Escape');
    await expect(menu).toHaveCount(0);

    await page.locator('[data-workspace-view="xmlpatch"]').click();
    if (width < 1500) {
      await expect(page.getByTestId('xmlpatch-compact-tabs')).toBeVisible();
      for (const pane of ['tree', 'blocks', 'preview']) {
        await page.locator(`[data-compact-pane="${pane}"]`).click();
        await expect(page.locator(`[data-xmlpatch-pane="${pane}"]`)).toBeVisible();
      }
    }
    const after = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(after).toBe(true);
  });
}
