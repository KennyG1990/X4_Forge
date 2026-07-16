import { expect, test, type Page } from '@playwright/test';
import { seedServerWorkspace } from './ephemeral';

const workspace = {
  id: 'e2e_node_toolbox',
  name: 'E2E_Node_Toolbox',
  version: '1.0.0',
  author: 'Playwright',
  description: 'Virtualized node toolbox fixture',
  nodes: [],
  links: [],
  uiWidgets: [],
  uiTheme: { backgroundColor: '#111827', borderColor: '#06b6d4', accentColor: '#0891b2', opacity: 0.9, showIcons: true },
  compileSettings: { md: true, ui: false, ai: false, library: false, translations: false, patches: false },
};

async function openNodes(page: Page) {
  await page.goto('/');
  const nodes = page.getByRole('button', { name: 'NODES', exact: true });
  await expect(nodes).toHaveCount(1);
  await nodes.click();
  await expect(page.getByTestId('node-toolbox')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await seedServerWorkspace(workspace);
  await page.addInitScript(() => {
    localStorage.removeItem('x4_forge_node_toolbox_favorites');
    localStorage.removeItem('x4_forge_node_toolbox_recents');
  });
});

test('node toolbox keeps the full schema searchable while the mounted DOM stays bounded', async ({ page }) => {
  await openNodes(page);

  const rows = page.getByTestId('node-toolbox-row');
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(9);

  const search = page.getByTestId('node-toolbox-search');
  await search.fill('money');
  const reward = page.getByTestId('node-toolbox-add-reward_player');
  await expect(reward).toBeVisible();
  await reward.click();
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __X4_E2E__?: { getWorkspace: () => { nodes: Array<{ xmlTag: string }> } } }
  ).__X4_E2E__?.getWorkspace().nodes.some(node => node.xmlTag === 'reward_player') || false)).toBe(true);

  await search.fill('');
  await page.getByTestId('node-toolbox-mode').click();
  await expect.poll(async () => {
    const text = await page.getByTestId('node-toolbox-count').innerText();
    return Number.parseInt(text, 10);
  }).toBeGreaterThan(1000);
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(9);

  // Real long-tail tag from the loaded X4 schema (not a synthetic friendly-name fixture).
  await search.fill('create_god_factory');
  const favorite = page.getByTestId('node-toolbox-favorite-create_god_factory');
  await expect(favorite).toBeVisible();
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await search.fill('');
  await page.getByTestId('node-toolbox-mode').click();
  await expect(page.getByTestId('node-toolbox-add-create_god_factory')).toBeVisible();

  await search.fill('definitely no such x4 node');
  await expect(page.getByTestId('node-toolbox-empty')).toBeVisible();
});

test('corrupt toolbox preferences fail soft', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_node_toolbox_favorites', '{broken json');
    localStorage.setItem('x4_forge_node_toolbox_recents', 'not-json');
  });
  await openNodes(page);
  await expect(page.getByTestId('node-toolbox-search')).toBeVisible();
  await expect.poll(() => page.getByTestId('node-toolbox-row').count()).toBeGreaterThan(0);
});
