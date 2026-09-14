import { expect, test, type Page } from '@playwright/test';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { workspaceContentHash } from '../../src/lib/workspaceIdentity';
import { sanitizeWorkspace } from '../../src/types';
import { DEFAULT_STUDIO_LAYOUT, STUDIO_LAYOUT_KEY } from '../../src/lib/studioLayout';
import {
  readServerLayout,
  readServerWorkspaceEnvelope,
  seedServerLayout,
  seedServerWorkspace,
} from './ephemeral';

type E2EWindow = Window & {
  __X4_E2E__?: { getWorkspaceHash: () => string };
};

const modeWorkspace = () => ({
  ...buildTemplateWorkspace('welcome'),
  id: 'b119-ui-builder-mode-e2e',
  name: 'B119 UI Builder Mode E2E',
  uiWidgets: [],
});

async function bootExpert(page: Page, sidePanelCollapsed: boolean) {
  const workspace = modeWorkspace();
  const seededHash = workspaceContentHash(sanitizeWorkspace(workspace));
  await seedServerWorkspace(workspace);
  await seedServerLayout({ ...DEFAULT_STUDIO_LAYOUT, sidePanelCollapsed });
  await page.addInitScript(({ layoutKey }) => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
    localStorage.removeItem('x4_forge_experience_confirmations');
    localStorage.removeItem(layoutKey);
    sessionStorage.removeItem('__x4_studio_shell_initialized');
  }, { layoutKey: STUDIO_LAYOUT_KEY });
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => (window as E2EWindow).__X4_E2E__!.getWorkspaceHash()),
    { timeout: 15_000 },
  ).toBe(seededHash);
  await expect.poll(
    () => page.evaluate(key => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? '').sidePanelCollapsed === true;
      } catch {
        return null;
      }
    }, STUDIO_LAYOUT_KEY),
    { timeout: 15_000 },
  ).toBe(sidePanelCollapsed);
  const health = page.getByTestId('health-card');
  await health.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await health.isVisible()) await page.getByTestId('health-card-dismiss').click();
  return workspace;
}

async function enterUiDesigner(page: Page) {
  const uiDesigner = page.locator('[data-workspace-view="ui-designer"]');
  await uiDesigner.click();
  await expect(uiDesigner).toHaveAttribute('aria-current', 'page');
  const builder = page.locator('[data-ui-presentation-tab]');
  await expect(builder).toHaveAttribute('data-ui-presentation-tab', 'source');
  await expect(page.getByTestId('x4-ui-source-editor')).toBeVisible();
  await expect(page.locator('#side_panel')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-restore')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-resizer')).toHaveCount(0);
  return builder;
}

function trackModeMutationRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    const pathname = new URL(request.url()).pathname;
    if (/(?:workspace|history|verification|receipt|studio\/layout)/i.test(pathname)) paths.push(pathname);
  });
  return paths;
}

async function assertModeSwitchDidNotWrite(
  page: Page,
  beforeEnvelope: Awaited<ReturnType<typeof readServerWorkspaceEnvelope>>,
  beforeLayout: Awaited<ReturnType<typeof readServerLayout>>,
  beforeLayoutStorage: string | null,
  beforeConfirmations: string | null,
  beforeUndoDisabled: boolean,
  mutationPaths: string[],
) {
  const afterEnvelope = await readServerWorkspaceEnvelope();
  expect({
    version: afterEnvelope.version,
    workspaceHash: afterEnvelope.workspaceHash,
    snapshotHash: afterEnvelope.snapshotHash,
    workspace: afterEnvelope.workspace,
  }).toEqual({
    version: beforeEnvelope.version,
    workspaceHash: beforeEnvelope.workspaceHash,
    snapshotHash: beforeEnvelope.snapshotHash,
    workspace: beforeEnvelope.workspace,
  });
  expect(await readServerLayout()).toEqual(beforeLayout);
  expect(await page.evaluate(key => localStorage.getItem(key), STUDIO_LAYOUT_KEY)).toBe(beforeLayoutStorage);
  expect(await page.evaluate(() => localStorage.getItem('x4_forge_experience_confirmations'))).toBe(beforeConfirmations);
  expect(await page.locator('[data-global-action="undo"]').isDisabled()).toBe(beforeUndoDisabled);
  expect(mutationPaths).toEqual([]);
}

test('source mode isolates the legacy library and keeps mode switches write-free', async ({ page }) => {
  await bootExpert(page, false);
  const mutationPaths = trackModeMutationRequests(page);
  const builder = await enterUiDesigner(page);
  const beforeEnvelope: Awaited<ReturnType<typeof readServerWorkspaceEnvelope>> = await readServerWorkspaceEnvelope();
  const beforeLayout: Awaited<ReturnType<typeof readServerLayout>> = await readServerLayout();
  const beforeLayoutStorage = await page.evaluate(key => localStorage.getItem(key), STUDIO_LAYOUT_KEY);
  const beforeConfirmations = await page.evaluate(() => localStorage.getItem('x4_forge_experience_confirmations'));
  const beforeUndoDisabled = await page.locator('[data-global-action="undo"]').isDisabled();

  await page.getByTestId('ui-builder-subtab-canvas').click();
  await expect(builder).toHaveAttribute('data-ui-presentation-tab', 'canvas');
  await expect(page.getByTestId('x4-ui-source-editor')).toHaveCount(0);
  await expect(page.locator('#side_panel')).toBeVisible();
  await expect(page.getByText('UI Widgets Library', { exact: true })).toBeVisible();
  await expect(page.getByTestId('side-panel-restore')).toHaveCount(0);

  await page.getByTestId('ui-builder-subtab-source').click();
  await expect(builder).toHaveAttribute('data-ui-presentation-tab', 'source');
  await expect(page.getByTestId('x4-ui-source-editor')).toBeVisible();
  await expect(page.locator('#side_panel')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-restore')).toHaveCount(0);

  await page.locator('[data-workspace-view="blueprint"]').click();
  await expect(page.getByTestId('x4-ui-source-editor')).toHaveCount(0);
  await expect(page.locator('#side_panel')).toBeVisible();
  await page.locator('[data-workspace-view="ui-designer"]').click();
  await expect(builder).toHaveAttribute('data-ui-presentation-tab', 'source');
  await expect(page.getByTestId('x4-ui-source-editor')).toBeVisible();
  await expect(page.locator('#side_panel')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-restore')).toHaveCount(0);

  await assertModeSwitchDidNotWrite(
    page,
    beforeEnvelope,
    beforeLayout,
    beforeLayoutStorage,
    beforeConfirmations,
    beforeUndoDisabled,
    mutationPaths,
  );
});

test('source mode preserves a saved collapsed preference without exposing its restore strip', async ({ page }) => {
  await bootExpert(page, true);
  const mutationPaths = trackModeMutationRequests(page);
  const builder = await enterUiDesigner(page);
  const beforeEnvelope: Awaited<ReturnType<typeof readServerWorkspaceEnvelope>> = await readServerWorkspaceEnvelope();
  const beforeLayout: Awaited<ReturnType<typeof readServerLayout>> = await readServerLayout();
  const beforeLayoutStorage = await page.evaluate(key => localStorage.getItem(key), STUDIO_LAYOUT_KEY);
  const beforeConfirmations = await page.evaluate(() => localStorage.getItem('x4_forge_experience_confirmations'));
  const beforeUndoDisabled = await page.locator('[data-global-action="undo"]').isDisabled();

  await expect(page.locator('#side_panel')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-restore')).toHaveCount(0);
  await page.getByTestId('ui-builder-subtab-canvas').click();
  await expect(builder).toHaveAttribute('data-ui-presentation-tab', 'canvas');
  await expect(page.getByTestId('x4-ui-source-editor')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-restore')).toBeVisible();
  await expect(page.getByText('UI Widgets Library', { exact: true })).toHaveCount(0);

  await page.getByTestId('ui-builder-subtab-source').click();
  await expect(builder).toHaveAttribute('data-ui-presentation-tab', 'source');
  await expect(page.getByTestId('x4-ui-source-editor')).toBeVisible();
  await expect(page.locator('#side_panel')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-restore')).toHaveCount(0);

  await page.locator('[data-workspace-view="blueprint"]').click();
  await expect(page.getByTestId('x4-ui-source-editor')).toHaveCount(0);
  await expect(page.getByTestId('side-panel-restore')).toBeVisible();
  await page.locator('[data-workspace-view="ui-designer"]').click();
  await expect(builder).toHaveAttribute('data-ui-presentation-tab', 'source');
  await expect(page.getByTestId('x4-ui-source-editor')).toBeVisible();
  await expect(page.getByTestId('side-panel-restore')).toHaveCount(0);

  await assertModeSwitchDidNotWrite(
    page,
    beforeEnvelope,
    beforeLayout,
    beforeLayoutStorage,
    beforeConfirmations,
    beforeUndoDisabled,
    mutationPaths,
  );
});
