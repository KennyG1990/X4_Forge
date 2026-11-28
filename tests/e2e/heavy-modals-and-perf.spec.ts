import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { seedServerWorkspace } from './ephemeral';

test('Heavy modals (Settings, AIConnection, SyncModal, AgentBridge) follow Concept A with Escape and negative guards', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const shotDir = process.env.FORGE_UIP7B_SHOT_DIR || '';
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

  const initial = buildTemplateWorkspace('welcome');
  await seedServerWorkspace(initial as unknown as Record<string, unknown>);

  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.setItem('x4_ai_tier', 'assist');
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('x4_mod_studio_')) localStorage.removeItem(key);
    }
  });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('400')) consoleErrors.push(text);
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { AgentRuntime?: { getCurrentWorkspace: () => unknown } }).AgentRuntime?.getCurrentWorkspace()));
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) {
    await page.getByTestId('health-card-dismiss').click();
  }

  // 1. DirectorySettingsModal: category navigation, advanced toggle, and Escape close.
  await page.getByTestId('studio-menu-button').click();
  await page.getByTestId('studio-menu').locator('[data-global-action="settings"]').click();
  const settingsDialog = page.getByTestId('studio-settings-dialog');
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByText('Studio Settings', { exact: true })).toBeVisible();
  await settingsDialog.getByTestId('settings-category-paths').click();
  await expect(settingsDialog.getByTestId('game-install-settings')).toBeVisible();
  await settingsDialog.getByRole('button', { name: /Advanced fallback: manual XSD schema folder/ }).click();
  await expect(settingsDialog.getByTestId('manual-xsd-settings')).toBeVisible();
  await settingsDialog.getByTestId('settings-category-all').click();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-directory-settings.png') });
  await page.keyboard.press('Escape');
  await expect(settingsDialog).toHaveCount(0);

  // 2. AIConnectionModal: ModalShell, accurate local-server credential copy, provider switch, and Escape close.
  await page.getByTestId('studio-menu-button').click();
  await page.getByTestId('studio-menu').locator('[data-global-action="ai-settings"]').click();
  const aiModal = page.getByTestId('ai-connection-modal');
  await expect(aiModal).toBeVisible();
  await expect(aiModal.getByText('AI Provider & OAuth', { exact: true })).toBeVisible();
  await expect(aiModal).toContainText('write-only local Forge server');
  await aiModal.getByRole('button', { name: /Claude/i }).first().click();
  await expect(aiModal.getByText('Provider: claude')).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-ai-connection-modal.png') });
  await page.keyboard.press('Escape');
  await expect(aiModal).toHaveCount(0);

  // 3. SyncModal: Load Project disabled when empty + malformed XML parse refusal + Escape close.
  await page.getByTestId('studio-menu-button').click();
  await page.getByTestId('studio-menu').locator('[data-global-action="sync-mod"]').click();
  const syncDialog = page.getByTestId('sync-modal-dialog');
  await expect(syncDialog).toBeVisible();
  await expect(syncDialog.getByText('Load Mod Project', { exact: true })).toBeVisible();
  await expect(syncDialog.getByRole('button', { name: 'Load Project', exact: true })).toBeDisabled();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-sync-modal.png') });
  await syncDialog.getByRole('button', { name: 'Single File Parser', exact: true }).click();
  await syncDialog.getByPlaceholder('Paste workspace JSON or standard X4 MD script XML here...').fill('<broken><unclosed');
  await syncDialog.getByRole('button', { name: 'Parse XML', exact: true }).click();
  await expect(syncDialog).toContainText('Parse error:');
  await page.keyboard.press('Escape');
  await expect(syncDialog).toHaveCount(0);

  // 4. AgentBridge: Docs, Live State JSON, Execute negative refusal, Keys empty-label guard, History, Escape close.
  await page.getByTestId('studio-menu-button').click();
  await page.getByTestId('studio-menu').locator('[data-global-action="agent-api"]').click();
  const bridge = page.getByTestId('agent-bridge');
  await expect(bridge).toBeVisible();
  await expect(bridge.getByText('Available API routes', { exact: true })).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-agent-bridge-docs.png') });

  await bridge.getByRole('button', { name: 'Live State JSON' }).click();
  await expect(bridge.getByText('Current active blueprint schema', { exact: true })).toBeVisible();
  await expect(bridge.getByRole('button', { name: 'Save JSON File', exact: true })).toBeVisible();

  await bridge.getByRole('button', { name: 'Surgical Execute' }).click();
  const cmdInput = bridge.getByPlaceholder('e.g., set includeInBuild to false on widget win_threat_monitor');
  await cmdInput.fill('not_a_valid_command foo bar');
  await cmdInput.press('Enter');
  await expect(bridge).toContainText('Error: Command pattern not recognized.');

  await bridge.getByTestId('agent-keys-tab').click();
  const createKeyBtn = bridge.getByTestId('agent-key-create');
  await expect(createKeyBtn).toBeDisabled();
  await bridge.getByTestId('agent-key-label').fill('qa-check-key');
  await expect(createKeyBtn).toBeEnabled();
  await bridge.getByTestId('agent-key-label').fill('');
  await expect(createKeyBtn).toBeDisabled();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-agent-bridge-keys.png') });

  await bridge.getByTestId('agent-history-tab').click();
  await expect(bridge.getByTestId('agent-history-panel')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(bridge).toHaveCount(0);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('Lazy-split workspace views mount sequentially and blueprint stays responsive within frame budget', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });

  const initial = buildTemplateWorkspace('welcome');
  await seedServerWorkspace(initial as unknown as Record<string, unknown>);

  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
  });

  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { AgentRuntime?: { getCurrentWorkspace: () => unknown } }).AgentRuntime?.getCurrentWorkspace()));
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) {
    await page.getByTestId('health-card-dismiss').click();
  }

  const checks: Array<{ view: string; assertReady: () => Promise<void> }> = [
    { view: 'ui-designer', assertReady: () => expect(page.getByTestId('ui-game-verification-status')).toBeVisible() },
    { view: 'aiscripts', assertReady: () => expect(page.getByTestId('ai-new-script-btn')).toBeVisible() },
    { view: 'libraries', assertReady: () => expect(page.getByTestId('library-xml-preview-toggle')).toBeVisible() },
    { view: 'xmlpatch', assertReady: () => expect(page.getByTestId('xmlpatch-compact-tabs')).toBeVisible() },
    { view: 'project', assertReady: () => expect(page.getByTestId('project-inspector')).toBeVisible() },
    { view: 'galaxy', assertReady: () => expect(page.getByTestId('galaxy-map-view')).toBeVisible() },
    { view: 'contracts', assertReady: () => expect(page.getByText('External HTTP Integration Contract', { exact: true })).toBeVisible() },
    { view: 'translation', assertReady: () => expect(page.getByTestId('tfile-search-input')).toBeVisible() },
    { view: 'wiki', assertReady: () => expect(page.getByTestId('docs-pattern-library')).toBeVisible() },
    { view: 'blueprint', assertReady: () => expect(page.getByTestId('studio-menu-button')).toBeVisible() },
  ];

  for (const check of checks) {
    await page.locator(`[data-workspace-view="${check.view}"]`).click();
    await expect(page.getByText('Loading Workbench Module…')).toHaveCount(0);
    await check.assertReady();
  }

  // Sample idle requestAnimationFrame intervals on the Blueprint canvas.
  const medianDeltaMs = await page.evaluate(() => new Promise<number>(resolve => {
    const stamps: number[] = [];
    const step = (ts: number) => {
      stamps.push(ts);
      if (stamps.length >= 20) {
        const deltas = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
        resolve(deltas[Math.floor(deltas.length / 2)]);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));
  expect(medianDeltaMs).toBeLessThan(50);

  expect(pageErrors).toEqual([]);
});
