import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { seedServerWorkspace } from './ephemeral';

test('Sidebar drawers render cleanly under Concept A styling and preserve core workflows & negative paths (UI-P6B)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const shotDir = process.env.FORGE_UIP6B_SHOT_DIR || '';
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  const initial = buildTemplateWorkspace('welcome');
  await seedServerWorkspace(initial as unknown as Record<string, unknown>);

  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    localStorage.setItem('x4_ai_tier', 'cobuild');
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
      // Unconfigured x4GamePath in ephemeral E2E triggers expected 400 on object-index/mod-dependency-graph.
      if (!txt.includes('400')) consoleErrors.push(txt);
    }
  });

  await page.goto('/');
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) {
    await page.getByTestId('health-card-dismiss').click();
  }

  // Ensure blueprint view is active so sidebar drawers have full context.
  await page.locator('[data-workspace-view="blueprint"]').click();

  // 1. Script / Node Toolbox (`script`) + negative search check.
  await page.locator('[data-sidebar-tab="script"]').click();
  await expect(page.getByTestId('node-toolbox')).toBeVisible({ timeout: 15_000 });
  const toolboxSearch = page.getByTestId('node-toolbox-search');
  await toolboxSearch.fill('zzz_nonexistent_node_999');
  await expect(page.getByTestId('node-toolbox-empty')).toBeVisible();
  await toolboxSearch.fill('');
  await expect.poll(() => page.getByTestId('node-toolbox-row').count()).toBeGreaterThan(0);

  // 2. Cues (`cues`): visible tree controls + SHOW ALL / CLEAR ALL preserved.
  await page.locator('[data-sidebar-tab="cues"]').click();
  await expect(page.getByPlaceholder('Search Cues...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'SHOW ALL', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CLEAR ALL', exact: true })).toBeVisible();

  // 3. Files (`filesystem`): DirectoryExplorer search & New File control visible.
  await page.locator('[data-sidebar-tab="filesystem"]').click();
  await expect(page.getByPlaceholder('Search Files...')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New File', exact: true })).toBeVisible();

  // 4. Source Control (`git`): Diff / Remotes / Graph Log tabs + disabled empty commit negative gate.
  await page.locator('[data-sidebar-tab="git"]').click();
  const sc = page.locator('#source_control_system');
  await expect(sc).toBeVisible();
  const commitBtn = sc.getByRole('button', { name: 'Commit files', exact: true });
  await expect(commitBtn).toBeDisabled();
  await sc.getByRole('button', { name: 'Remotes', exact: true }).click();
  await expect(sc.getByRole('button', { name: 'Connect with GitHub', exact: true })).toBeVisible();
  await sc.getByRole('button', { name: 'Graph Log', exact: true }).click();
  await expect(sc.getByRole('button', { name: 'Pull', exact: true })).toBeVisible();

  // 5. Config / Manifest + Snapshots (`config`): SnapshotManager visible.
  await page.locator('[data-sidebar-tab="config"]').click();
  const snapMgr = page.getByTestId('snapshot-manager');
  await snapMgr.scrollIntoViewIfNeeded();
  await expect(snapMgr).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-snapshot-manager.png') });

  // 6. Objects (`reference`): ObjectBrowser negative search, restore, and category switch.
  await page.locator('[data-sidebar-tab="reference"]').click();
  const obj = page.getByTestId('object-browser');
  await expect(obj).toBeVisible();
  const objSearch = obj.getByPlaceholder('Search entries...');
  await objSearch.fill('zzz_nonexistent_macro_999');
  await expect(obj.getByText('No objects fit this filter.', { exact: true })).toBeVisible();
  await objSearch.fill('');
  await obj.locator('select').selectOption('faction');
  await expect(obj).toContainText('faction.argon');

  // 7. AI Helper + Architect Blueprint (`ai`): Chat view, Architect tabs & Scratchpad negative/positive note checks.
  await page.locator('[data-sidebar-tab="ai"]').click();
  const aiPanel = page.getByTestId('ai-helper-panel');
  await expect(aiPanel).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-ai-chat.png') });
  await aiPanel.getByRole('button', { name: 'Architect', exact: true }).click();
  const bpPanel = page.getByTestId('architect-blueprint-panel');
  await expect(bpPanel).toBeVisible();
  if (shotDir) await page.screenshot({ path: path.join(shotDir, '1280x800-ai-architect.png') });
  await bpPanel.getByRole('button', { name: 'Scratchpad', exact: true }).click();

  const scratchInput = bpPanel.getByPlaceholder('Add a note to the scratchpad…');
  const addNoteBtn = bpPanel.getByRole('button', { name: 'Add', exact: true });
  await scratchInput.fill('   ');
  await addNoteBtn.click();
  await expect(bpPanel).not.toContainText('ui_p6b_scratch_sentinel');

  await scratchInput.fill('ui_p6b_scratch_sentinel');
  await addNoteBtn.click();
  await expect(bpPanel).toContainText('ui_p6b_scratch_sentinel');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
