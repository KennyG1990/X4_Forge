import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { seedServerWorkspace } from './ephemeral';

test('Modals (Shortcuts, BugReport, GlobalSearch, Compile) and Sidebar framing render under Concept A (UI-P7A)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const shotDir = process.env.FORGE_UIP7A_SHOT_DIR || '';
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

  const initial = buildTemplateWorkspace('welcome');
  await seedServerWorkspace(initial as unknown as Record<string, unknown>);

  let deployCalls = 0;
  await page.route('**/api/schema/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      loaded: true,
      config: { modWorkspacePath: 'F:/scratch/x4-forge-e2e', x4GamePath: 'G:/X4' },
      resolved: { mdExists: true },
      deployFormat: { format: 'loose' },
    }),
  }));
  await page.route('**/api/agent/deploy-verify', route => {
    deployCalls += 1;
    return route.fulfill({ status: 500, body: '{}' });
  });

  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
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
      const txt = msg.text();
      if (!txt.includes('400')) consoleErrors.push(txt);
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { AgentRuntime?: { getCurrentWorkspace: () => unknown } }).AgentRuntime?.getCurrentWorkspace()));
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) {
    await page.getByTestId('health-card-dismiss').click();
  }

  // 1. ShortcutsOverlay: '?' opens, Escape closes, global action reopens, close button dismisses.
  await page.locator('[data-workspace-view="blueprint"]').click();
  await page.keyboard.press('?');
  const shortcuts = page.getByTestId('shortcuts-overlay');
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.getByText('Keyboard shortcuts', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(shortcuts).toHaveCount(0);

  await page.locator('[data-global-action="shortcuts"]').click();
  await expect(shortcuts).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-shortcuts-overlay.png') });
  await page.getByTestId('shortcuts-close-btn').click();
  await expect(shortcuts).toHaveCount(0);

  // 2. BugReportModal: negative empty-title disables GitHub CTA, title enables it, Escape closes.
  await page.getByTestId('studio-menu-button').click();
  await page.getByTestId('report-bug-button').click();
  const bugModal = page.getByTestId('bug-report-modal');
  await expect(bugModal).toBeVisible();
  await expect(bugModal.getByText('Report a Bug', { exact: true })).toBeVisible();
  const openGithubBtn = bugModal.getByTestId('bug-open-github');
  await expect(openGithubBtn).toBeDisabled();
  await bugModal.getByTestId('bug-title').fill('Reproduction: sidebar shell check');
  await expect(openGithubBtn).toBeEnabled();
  await bugModal.getByLabel('Attach technical details (recommended)').click();
  await bugModal.getByLabel('Attach technical details (recommended)').click();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-bug-report-modal.png') });
  await page.keyboard.press('Escape');
  await expect(bugModal).toHaveCount(0);

  // 3. GlobalSearch: negative no-match state, '>' command palette state, Escape closes.
  const searchPanel = page.getByTestId('workspace-search-panel');
  const searchInput = searchPanel.locator('input');
  await searchInput.click();
  await searchInput.fill('zzz_nonexistent_target_999');
  await expect(searchPanel.getByText('No matching mod elements, commands, or docs found.')).toBeVisible();
  await searchInput.fill('>');
  await expect(searchPanel.getByText('Command Palette active', { exact: true })).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-global-search.png') });
  await searchInput.press('Escape');

  // 4. CompileConfirmationModal: Clear all negative check, Select all re-enables, Escape closes with 0 deploy calls.
  await page.getByTestId('header-deploy-btn').click();
  const compileModal = page.getByTestId('compile-confirmation-modal');
  await expect(compileModal).toBeVisible();
  await expect(compileModal.getByText('Compile & Deploy Wizard', { exact: true })).toBeVisible();
  await compileModal.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(compileModal).toContainText('0 of 6 targets active');
  await expect(compileModal.getByTestId('wizard-preview-deploy')).toBeDisabled();
  await compileModal.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(compileModal).toContainText('6 of 6 targets active');
  await expect(compileModal.getByTestId('wizard-preview-deploy')).toBeEnabled();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-compile-modal.png') });
  await page.keyboard.press('Escape');
  await expect(compileModal).toHaveCount(0);
  expect(deployCalls).toBe(0);

  // 5. Sidebar framing tabs (`script`, `ui`, `config`, `templates`): live version preview, pattern stamp, footer, no overflow.
  await page.locator('[data-workspace-view="blueprint"]').click();
  await page.locator('[data-sidebar-tab="script"]').click();
  await expect(page.getByText('Node types', { exact: true })).toBeVisible();
  await expect(page.getByText('Engine Context: Egosoft MD 4.5', { exact: true })).toBeVisible();

  await page.locator('[data-sidebar-tab="ui"]').click();
  await expect(page.getByText('UI widgets library', { exact: true })).toBeVisible();

  await page.locator('[data-sidebar-tab="config"]').click();
  await expect(page.getByText('Mod script identifier', { exact: true })).toBeVisible();
  await expect(page.getByText('XSD schema source', { exact: true })).toBeVisible();
  await page.getByPlaceholder('e.g. 1.0.0 or 100').fill('1.25');
  await expect(page.getByTestId('x4-version-preview')).toContainText('125');
  await expect(page.getByTestId('x4-version-preview')).toContainText('v1.25');

  await page.locator('[data-sidebar-tab="templates"]').click();
  await expect(page.getByText('Template blueprints', { exact: true })).toBeVisible();
  const initialNodes = await page.evaluate(() => (window as unknown as { AgentRuntime: { getCurrentWorkspace: () => { nodes: unknown[] } } }).AgentRuntime.getCurrentWorkspace().nodes.length);
  await page.locator('[data-testid^="stamp-pattern-"]').first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { AgentRuntime: { getCurrentWorkspace: () => { nodes: unknown[] } } }).AgentRuntime.getCurrentWorkspace().nodes.length)).toBeGreaterThan(initialNodes);

  const sidebarOverflow = await page.locator('#side_panel').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(sidebarOverflow).toBeLessThanOrEqual(2);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('FirstRunWizard renders notfound negative state and found automatic setup state under Concept A (UI-P7A)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const shotDir = process.env.FORGE_UIP7A_SHOT_DIR || '';
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

  const initial = buildTemplateWorkspace('welcome');
  await seedServerWorkspace(initial as unknown as Record<string, unknown>);

  let detectMode: 'notfound' | 'found' = 'notfound';
  await page.route('**/api/agent/detect-game', route => {
    if (detectMode === 'notfound') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: false,
          hint: 'No X4 installation detected on test fixture.',
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        found: true,
        source: 'steam',
        canHarvestSchemas: true,
        proposal: {
          x4GamePath: 'F:/Games/X4 Foundations',
          filesystemPath: 'F:/Games/X4 Foundations/extensions',
          modWorkspacePath: 'F:/Forge/workspace',
          xsdSchemaPath: 'F:/Forge/schemas',
        },
      }),
    });
  });

  // Negative case: notfound shows manual setup fallback + Later dismisses cleanly.
  await page.goto('/?firstrun');
  const wizard = page.getByTestId('first-run-wizard');
  await expect(wizard).toBeVisible();
  await expect(wizard.getByText('No X4 installation detected on test fixture.')).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'Set up manually' })).toBeVisible();
  await wizard.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(wizard).toHaveCount(0);

  // Positive case: found renders proposal card + Set up automatically / Manual setup, Escape closes.
  detectMode = 'found';
  await page.goto('/?firstrun');
  await expect(wizard).toBeVisible();
  await expect(wizard.getByText('Found X4: Foundations (Steam)')).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'Set up automatically', exact: true })).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'Manual setup', exact: true })).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-first-run-wizard.png') });
  await page.keyboard.press('Escape');
  await expect(wizard).toHaveCount(0);
});
