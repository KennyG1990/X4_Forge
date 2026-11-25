import * as path from 'node:path';
import { expect, test, type Page, type TestInfo } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { workspaceContentHash } from '../../src/lib/workspaceIdentity';
import { sanitizeWorkspace } from '../../src/types';
import { DEFAULT_STUDIO_LAYOUT, STUDIO_LAYOUT_KEY } from '../../src/lib/studioLayout';
import { seedServerLayout, seedServerWorkspace } from './ephemeral';

type E2EWindow = Window & {
  AgentRuntime?: { getCurrentWorkspace: () => ReturnType<typeof buildTemplateWorkspace> };
};

async function liveWorkspaceHash(page: Page): Promise<string> {
  const value = await page.evaluate(() => (window as E2EWindow).AgentRuntime!.getCurrentWorkspace());
  return workspaceContentHash(sanitizeWorkspace(value));
}

function screenshotTarget(testInfo: TestInfo, fileName: string): string {
  const customDir = process.env.FORGE_UI_SCREENSHOT_DIR?.trim();
  return customDir ? path.join(customDir, fileName) : testInfo.outputPath(fileName);
}

async function bootWorkbench(page: Page) {
  const seeded = buildTemplateWorkspace('welcome');
  const expectedHash = workspaceContentHash(sanitizeWorkspace(seeded));
  await seedServerWorkspace(seeded);
  await seedServerLayout(DEFAULT_STUDIO_LAYOUT);
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    if (sessionStorage.getItem('__x4_ide_workbench_init') !== '1') {
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem('__x4_ide_workbench_init', '1');
    }
  }, { key: STUDIO_LAYOUT_KEY, value: DEFAULT_STUDIO_LAYOUT });

  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await expect.poll(() => liveWorkspaceHash(page), { timeout: 15_000 }).toBe(expectedHash);
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) await page.getByTestId('health-card-dismiss').click();
}

test('Unified IDE Workbench provides right contextual inspector, bottom dock, command palette, status bar, and two-pane settings without mutating workspace data', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await bootWorkbench(page);
  const initialHash = await liveWorkspaceHash(page);

  // 1. Status bar + docked FPS meter + header Validate & Deploy CTA + collapsible minimap
  const statusBar = page.getByTestId('workbench-status-bar');
  await expect(statusBar).toBeVisible();
  await expect(statusBar.getByTestId('fps-meter')).toBeVisible();
  await expect(page.getByTestId('header-deploy-btn')).toBeVisible();
  await expect(page.getByTestId('canvas-minimap')).toBeVisible();

  // Minimap does not collide with docked FPS meter
  const minimapBox = await page.getByTestId('canvas-minimap').boundingBox();
  const fpsBox = await statusBar.getByTestId('fps-meter').boundingBox();
  expect(minimapBox).not.toBeNull();
  expect(fpsBox).not.toBeNull();
  expect(minimapBox!.y + minimapBox!.height).toBeLessThanOrEqual(fpsBox!.y);

  // 2. Selecting a canvas node auto-opens the Right Contextual Inspector with Properties, Links, and XML tabs
  await expect(page.getByTestId('contextual-inspector')).toHaveCount(0);
  const firstNodeId = await page.evaluate(() => (window as E2EWindow).AgentRuntime!.getCurrentWorkspace().nodes[0].id);
  await page.getByTestId(`canvas-node-${firstNodeId}`).click();

  const inspector = page.getByTestId('contextual-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText('PROPERTIES INSPECTOR', { exact: true })).toBeVisible();
  await page.screenshot({ path: screenshotTarget(testInfo, '01-expert-contextual-inspector.png'), fullPage: true });

  await inspector.getByRole('button', { name: /^Links/ }).click();
  await expect(inspector.locator('text=/Inbound|Outbound/').first()).toBeVisible();
  await inspector.getByRole('button', { name: 'XML', exact: true }).click();
  await expect(inspector.locator('pre')).toBeVisible();
  await inspector.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(inspector.getByText('PROPERTIES INSPECTOR', { exact: true })).toBeVisible();

  // Collapsing the inspector hides it cleanly and status-bar toggle restores it
  await page.getByTestId('contextual-inspector-close').click();
  await expect(inspector).toHaveCount(0);
  await page.getByTestId('right-inspector-toggle').click();
  await expect(inspector).toBeVisible();

  // 2b. Compact Grid View toggle (#8) switches #grid-canvas to 16px compact grid, condenses node cards (w-60 -> w-48), and restores cleanly without mutating workspace
  const firstNodeCard = page.getByTestId(`canvas-node-${firstNodeId}`);
  await expect(page.getByTestId('grid-canvas')).toHaveAttribute('data-compact-grid', 'false');
  await expect(firstNodeCard.getByTestId('canvas-node-props-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Graph tools', exact: true }).click();
  await page.getByTestId('canvas-compact-grid-toggle').click();
  await expect(page.getByTestId('grid-canvas')).toHaveAttribute('data-compact-grid', 'true');
  await expect(firstNodeCard).toHaveAttribute('data-compact-node', 'true');
  await expect(firstNodeCard.getByTestId('canvas-node-props-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Graph tools', exact: true }).click();
  await page.getByTitle('Reset Graph Zoom').click();
  await expect(firstNodeCard).toHaveCSS('width', '192px');
  const compactBox = await firstNodeCard.boundingBox();
  await page.screenshot({ path: screenshotTarget(testInfo, '01b-compact-grid-view.png'), fullPage: true });
  await page.getByRole('button', { name: 'Graph tools', exact: true }).click();
  await page.getByTestId('canvas-compact-grid-toggle').click();
  await expect(page.getByTestId('grid-canvas')).toHaveAttribute('data-compact-grid', 'false');
  await expect(firstNodeCard.getByTestId('canvas-node-props-preview')).toBeVisible();
  await expect(firstNodeCard).toHaveCSS('width', '240px');
  const standardBox = await firstNodeCard.boundingBox();
  expect(compactBox!.width).toBeLessThan(standardBox!.width);
  expect(compactBox!.height).toBeLessThan(standardBox!.height);

  // 3. Bottom Workbench Dock toggles via Ctrl+J and switches between Problems, Runtime, and XML
  await expect(page.getByTestId('bottom-workbench-dock')).toHaveCount(0);
  await page.keyboard.press('Control+j');
  const bottomDock = page.getByTestId('bottom-workbench-dock');
  await expect(bottomDock).toBeVisible();
  await bottomDock.getByRole('button', { name: /Runtime & Deliver/ }).click();
  await expect(bottomDock.getByText('Graph')).toBeVisible();
  await bottomDock.getByRole('button', { name: /Compiled MD XML/ }).click();
  await expect(bottomDock.locator('pre')).toContainText('<mdscript');
  await bottomDock.getByRole('button', { name: /Problems & Critic/ }).click();

  // 4. Omni-Search Command Palette ('>' prefix) executes commands without workspace mutation
  const searchInput = page.getByTestId('workspace-search-panel').locator('input');
  await searchInput.click();
  await searchInput.fill('>HUD');
  await expect(page.getByText(/Workbench Commands \(\d+\)/)).toBeVisible();
  await page.screenshot({ path: screenshotTarget(testInfo, '02-command-palette-and-bottom-dock.png'), fullPage: true });

  await searchInput.press('Enter');
  await expect(page.locator('[data-workspace-view="ui-designer"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('ui-game-verification-status')).toBeVisible();
  await expect(page.getByTestId('ui-generated-lint-status')).toBeVisible();
  await expect(page.getByTestId('ui-custom-lint-status')).toBeVisible();
  await expect(page.getByTestId('ui-geometry-status')).toBeVisible();
  await bottomDock.getByTitle('Close bottom panel (Ctrl+J)').click();
  await expect(bottomDock).toHaveCount(0);
  await page.screenshot({ path: screenshotTarget(testInfo, '03-compact-ui-workbench.png'), fullPage: true });

  // 5. Two-pane Studio Settings category filtering keeps Save Paths sticky and filters cleanly
  await page.getByTestId('studio-settings-tool').click();
  await expect(page.getByTestId('settings-category-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('studio-layout-settings')).toBeVisible();
  await expect(page.getByTestId('x4-corpus-settings')).toBeVisible();
  await page.screenshot({ path: screenshotTarget(testInfo, '04-two-pane-studio-settings.png'), fullPage: true });

  await page.getByTestId('settings-category-paths').click();
  await expect(page.getByTestId('x4-corpus-settings')).toBeVisible();
  await expect(page.getByTestId('studio-layout-settings')).toHaveCount(0);
  await page.getByTestId('settings-category-workbench').click();
  await expect(page.getByTestId('studio-layout-settings')).toBeVisible();
  await expect(page.getByTestId('x4-corpus-settings')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close settings' }).click();

  // 6. Narrow 800x900 responsive viewport with open inspector overlays cleanly without overflow
  await page.setViewportSize({ width: 800, height: 900 });
  await page.locator('[data-workspace-view="blueprint"]').click();
  const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(narrowOverflow).toBe(true);
  await page.screenshot({ path: screenshotTarget(testInfo, '05-narrow-800px-responsive.png'), fullPage: true });

  // 7. Beginner mode stays clean and focused (hiding Expert dock controls while keeping status telemetry)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('mode-beginner').click();
  await expect(page.getByTestId('beginner-workspace')).toBeVisible();
  await expect(page.getByTestId('contextual-inspector')).toHaveCount(0);
  await expect(page.getByTestId('right-inspector-toggle')).toHaveCount(0);
  await expect(page.getByTestId('bottom-dock-toggle')).toHaveCount(0);
  await expect(page.getByTestId('workbench-status-bar')).toBeVisible();
  await page.screenshot({ path: screenshotTarget(testInfo, '06-beginner-mode-clean.png'), fullPage: true });

  expect(await liveWorkspaceHash(page)).toBe(initialHash);
});
