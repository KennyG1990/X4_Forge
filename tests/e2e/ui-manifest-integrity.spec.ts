import { expect, test } from '@playwright/test';
import { E2E_API_ORIGIN } from '../../playwright.config';
import { seedServerWorkspace } from './ephemeral';

test('UI manifest actual import compile reopen and collision refusal', async ({ request }, testInfo) => {
  test.setTimeout(120000);
  const response = await request.get(`${E2E_API_ORIGIN}/api/agent/artifact-pipeline-selftest`, { timeout: 110000 });
  expect(response.ok(), await response.text()).toBeTruthy();
  const result = await response.json();
  await testInfo.attach('artifact-pipeline-result', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.pass ?? result.allPassed, JSON.stringify(result)).toBe(true);
  const checks = result.checks as { name: string; pass: boolean }[];
  expect(checks.filter(c => c.name.startsWith('UI ')).length).toBeGreaterThanOrEqual(6);
  expect(checks.filter(c => !c.pass)).toEqual([]);
});

test('UI source conflict visibly explains preservation refusal', async ({ page }, testInfo) => {
  await seedServerWorkspace({
    id: 'ui_integrity', name: 'UI integrity conflict', version: '1.0', nodes: [], links: [],
    uiWidgets: [], customLua: 'local generated = true', compileSettings: { ui: true },
    passthroughFiles: [
      { path: 'ui.xml', reason: 'partial', content: '<addon name="integrity"><environment type="menus"><file name="ui/first.lua"/></environment></addon>' },
      { path: 'ui/first.lua', reason: 'partial', content: 'local first = 1' },
    ],
  });
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await expect(page.getByTestId('health-card')).toBeVisible();
  await page.getByTestId('health-card-dismiss').click();
  await page.locator('[data-workspace-view="ui-designer"]').click();
  await expect(page.getByTestId('x4-ui-source-editor')).toBeVisible();
  // The released editor exposes this in Source authority without an Inspect
  // toggle. Use that visible panel, not the shell's screen-reader-only status.
  const authority = page.getByTestId('x4-ui-source-authority');
  await authority.scrollIntoViewIfNeeded();
  const refusal = authority.getByText('Generated ui.xml conflicts with the imported manifest; packaging is blocked to preserve its registrations.', { exact: true });
  await expect(refusal).toBeVisible();
  await expect(authority).toContainText('Shippable: false');
  await refusal.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('ui-source-conflict.png'), fullPage: true });
});
