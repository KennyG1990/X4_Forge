import { expect, test } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { readServerWorkspace, seedServerWorkspace } from './ephemeral';

test.setTimeout(180_000);

async function bootstrapWorkspace(
  page: import('@playwright/test').Page,
  overrides: Partial<ReturnType<typeof buildTemplateWorkspace>>,
) {
  const workspace = {
    ...buildTemplateWorkspace('welcome'),
    wares: [],
    jobs: [],
    xmlPatches: [],
    ...overrides,
  };
  await seedServerWorkspace(workspace);
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });

  await page.route('**/api/reference/suggest**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({
      json: {
        generation: 'e2e',
        kind: url.searchParams.get('kind') || 'ware',
        query: url.searchParams.get('q') || '',
        intent: url.searchParams.get('intent'),
        items: [],
      },
    });
  });

  await page.goto('/');
  await page.waitForFunction((name: string) => {
    const api = (window as Window & { AgentRuntime?: { getCurrentWorkspace: () => { name?: string } } }).AgentRuntime;
    return api?.getCurrentWorkspace().name === name;
  }, workspace.name);

  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) await page.getByTestId('health-card-dismiss').click();
}

test('X4 9.00 Wares, Baskets, Jobs & God authoring with live XML preview and price-ladder negative check', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootstrapWorkspace(page, {
    aiScripts: [
      {
        id: 'ai_custom_patrol',
        name: 'custom.patrol',
        description: 'Custom wing patrol order',
        command: '',
        attentionLevel: 'insector',
        version: 1,
        order: { id: 'CustomPatrolOrder', category: 'combat', infinite: true },
        params: [],
        interrupts: [],
        actions: [{ id: 'a1', command: 'wait', label: 'Wait', properties: { exact: '5s' } }],
        includeInBuild: true,
      },
    ],
  });

  await page.locator('[data-workspace-view="libraries"]').click();

  // 1. Ware creation + X4 9.00 fields (group, factoryname, componentRef, alternate production)
  await page.getByRole('button', { name: 'ADD', exact: true }).click();
  await page.getByPlaceholder('ware_antimatter_capsules').fill('forge_quantum_hull');
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await expect.poll(async () => (await readServerWorkspace()).wares?.length || 0, { timeout: 30_000 }).toBe(1);

  await page.getByTestId('ware-group-input').fill('shiptech');
  await page.getByTestId('ware-factoryname-input').fill('{20201,9904}');
  await page.getByTestId('ware-componentref-input').fill('ship_arg_m_corvette_01_a_macro');
  await page.getByTestId('ware-add-method-btn').click();
  await page.getByTestId('library-xml-preview-toggle').click();

  const xmlPreview = page.getByTestId('library-xml-preview');
  await expect(xmlPreview).toContainText('<component ref="ship_arg_m_corvette_01_a_macro" />');
  await expect(xmlPreview).toContainText('method="teladi"');

  // Negative check: minPrice > maxPrice surfaces inline diagnostic
  await page.getByTestId('ware-min-price-input').fill('900');
  const diagBox = page.getByTestId('economy-inline-diagnostics');
  await expect(diagBox).toBeVisible();
  await expect(diagBox).toContainText('ware.price_order');

  // 2. Baskets tab (libraries/baskets.xml PatchBlock)
  await page.getByRole('button', { name: 'baskets.xml', exact: true }).click();
  await page.getByTestId('create-starter-basket-btn').click();
  await expect(xmlPreview).toContainText('<basket id="mod_trade_basket">');
  await expect.poll(async () => {
    const patches = (await readServerWorkspace()).xmlPatches || [];
    return patches.some(p => p.targetFile === 'libraries/baskets.xml' && p.sel === '/baskets');
  }, { timeout: 30_000 }).toBe(true);

  // 3. Jobs tab (X4 9.00 orders, basket, shipSize, buildatshipyard, subordinates)
  await page.getByRole('button', { name: 'jobs.xml', exact: true }).click();
  await page.getByRole('button', { name: 'ADD', exact: true }).click();
  await page.getByPlaceholder('job_trader_hauler').fill('forge_escort_wing');
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await expect.poll(async () => (await readServerWorkspace()).jobs?.length || 0, { timeout: 30_000 }).toBe(1);

  await page.getByTestId('job-order-id-input').fill('CustomPatrolOrder');
  await page.getByTestId('job-basket-input').fill('mod_trade_basket');
  await page.getByTestId('job-ship-size-select').selectOption('ship_m');
  await page.getByTestId('job-buildatshipyard-checkbox').check();
  await page.getByTestId('job-add-subordinate-btn').click();

  await expect(xmlPreview).toContainText('<order order="CustomPatrolOrder" default="true"');
  await expect(xmlPreview).toContainText('<basket basket="mod_trade_basket" />');
  await expect(xmlPreview).toContainText('<environment buildatshipyard="true" />');
  await expect(xmlPreview).toContainText('<subordinates>');

  // 4. God tab (libraries/god.xml PatchBlock)
  await page.getByRole('button', { name: 'god.xml', exact: true }).click();
  await page.getByTestId('create-starter-god-product-btn').click();
  await expect(xmlPreview).toContainText('<product id="mod_god_product"');
  await expect.poll(async () => {
    const patches = (await readServerWorkspace()).xmlPatches || [];
    return patches.some(p => p.targetFile === 'libraries/god.xml' && p.sel === '/god/products');
  }, { timeout: 30_000 }).toBe(true);
});

test('TFileEditor keeps uncrushed search at 1280x800 and XML-escapes translation entries', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await bootstrapWorkspace(page, {
    tFiles: [
      {
        languageId: '44',
        fileName: '0001-l044.xml',
        pages: [
          {
            id: '20001',
            title: 'Primary Mod Translations',
            items: [
              { id: '1', value: 'Shield Generator', description: 'Default English string' },
            ],
          },
        ],
      },
    ],
  });

  await page.locator('[data-workspace-view="translation"]').click();
  const search = page.getByTestId('tfile-search-input');
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.width || 0) >= 160).toBe(true);

  const noOverflow = await page.evaluate(() => {
    const root = document.getElementById('tfiles_editor_view');
    return Boolean(root && root.scrollWidth <= root.clientWidth + 1);
  });
  expect(noOverflow).toBe(true);

  await page.getByTestId('tfile-item-value-1').fill('Hull & Shield <Mk2>');
  await page.getByTestId('tfile-xml-toggle').click();
  const preview = page.getByTestId('tfile-xml-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Hull &amp; Shield &lt;Mk2&gt;');
});
