import { expect, test } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { buildMergedGalaxyMap } from '../../src/lib/galaxyMap';
import { readServerWorkspace, seedServerWorkspace } from './ephemeral';

test('Docs & Pattern Library renders Markdown/code cleanly and unconfigured Galaxy shows actionable copy without route leaks (UI-P6A)', async ({ page }) => {
  test.setTimeout(120_000);
  const initial = buildTemplateWorkspace('welcome');
  const initialNodeIds = initial.nodes.map(n => n.id);
  await seedServerWorkspace(initial as unknown as Record<string, unknown>);

  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('x4_mod_studio_')) localStorage.removeItem(key);
    }
  });

  await page.goto('/');
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) {
    await page.getByTestId('health-card-dismiss').click();
  }

  // 1. Guides & Reference: rendered Markdown (<strong>, <code>), zero literal ** tokens, and negative search fallback.
  await page.locator('[data-workspace-view="wiki"]').click();
  const docs = page.getByTestId('docs-pattern-library');
  await expect(docs).toBeVisible({ timeout: 15_000 });
  await expect(docs.locator('article strong')).not.toHaveCount(0);
  await expect(docs.locator('article code')).not.toHaveCount(0);
  const guidesText = await page.locator('#wiki-browser-panel').innerText();
  expect(guidesText).not.toContain('**cues**');
  expect(guidesText).not.toContain('**instantiate**');

  const search = page.getByTestId('docs-search-input');
  await search.fill('zzz_no_such_x4_topic_999');
  await expect(page.getByTestId('docs-empty-state')).toBeVisible();
  await search.fill('');
  await expect(page.getByTestId('docs-guide-item-mdscript_basics')).toBeVisible();

  // 2. MD Patterns: provenance, compiled XML preview, and additive stamping into workspace.
  await page.getByTestId('docs-tab-patterns').click();
  await expect(docs).toContainText('DeadAir');
  await expect(docs.locator('pre')).toContainText('<cue');
  await page.getByTestId('docs-stamp-pattern-btn').click();
  await expect.poll(async () => {
    const ws = await readServerWorkspace();
    const ids = (ws?.nodes || []).map((n: { id: string }) => n.id);
    return ids.length > initialNodeIds.length && initialNodeIds.every(id => ids.includes(id));
  }, { timeout: 10_000 }).toBe(true);

  // 3. Lua Snippets: live placeholder substitution + append to customLua.
  await page.getByTestId('docs-tab-lua').click();
  await page.getByTestId('docs-lua-placeholder-NS').fill('qa_mod');
  await page.getByTestId('docs-lua-placeholder-EVENT').fill('ping');
  await expect(docs).toContainText('qa_mod.ping');
  await page.getByTestId('docs-append-lua-btn').click();
  await expect.poll(async () => {
    const ws = await readServerWorkspace();
    return String(ws?.customLua || '').includes('qa_mod.ping');
  }, { timeout: 10_000 }).toBe(true);

  // 4. Starter Recipes: live parameterized XML preview + 2-step confirmation guard.
  await page.getByTestId('docs-tab-recipes').click();
  await page.getByTestId('docs-recipe-input-faction').fill('khaak');
  await expect(docs.locator('pre')).toContainText('faction.khaak');
  await page.getByTestId('docs-load-recipe-btn').click();
  await expect(page.getByTestId('docs-confirm-recipe-btn')).toBeVisible();

  // 5. Galaxy Map (live unconfigured server): fail-closed error surface with zero internal API path leak.
  await page.locator('[data-workspace-view="galaxy"]').click();
  const galaxy = page.getByTestId('galaxy-map-view');
  await expect(galaxy).toBeVisible();
  await expect(galaxy).toContainText('Galaxy map unavailable', { timeout: 10_000 });
  await expect(galaxy).toContainText('X4 game path not set.');
  expect(await galaxy.innerText()).not.toContain('/api/agent/galaxy-map');
});

test('Galaxy Map renders cluster and sector SVG map without route leaks (UI-P6A)', async ({ page }) => {
  const galaxyXml = `<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="XU_EP2_universe_macro" class="galaxy">
    <component ref="standardgalaxy" />
    <connections>
      <connection name="Cluster_01_connection" ref="clusters">
        <macro ref="Cluster_01_macro" connection="galaxy" />
      </connection>
      <connection name="Cluster_02_connection" ref="clusters">
        <offset><position x="15000000" y="0" z="25980000" /></offset>
        <macro ref="Cluster_02_macro" connection="galaxy" />
      </connection>
    </connections>
  </macro>
</macros>`;
  const clustersXml = `<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="Cluster_01_macro" class="cluster">
    <connections>
      <connection name="C01_Sector001_connection" ref="sectors">
        <macro ref="Cluster_01_Sector001_macro" connection="cluster" />
      </connection>
      <connection name="C01_Sector002_connection" ref="sectors">
        <offset><position x="1000" y="0" z="2000" /></offset>
        <macro ref="Cluster_01_Sector002_macro" connection="cluster" />
      </connection>
    </connections>
  </macro>
  <macro name="Cluster_02_macro" class="cluster">
    <connections>
      <connection name="C02_Sector001_connection" ref="sectors">
        <offset><position x="-3000" y="0" z="4000" /></offset>
        <macro ref="Cluster_02_Sector001_macro" connection="cluster" />
      </connection>
    </connections>
  </macro>
</macros>`;
  const map = buildMergedGalaxyMap(galaxyXml, clustersXml, []);

  await seedServerWorkspace(buildTemplateWorkspace('welcome') as unknown as Record<string, unknown>);
  await page.addInitScript(() => {
    localStorage.setItem('x4_forge_experience_mode', 'expert');
  });
  await page.route('**/api/agent/galaxy-map', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, ...map }),
  }));

  await page.goto('/');
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) {
    await page.getByTestId('health-card-dismiss').click();
  }

  await page.locator('[data-workspace-view="galaxy"]').click();
  const galaxy = page.getByTestId('galaxy-map-view');
  await expect(galaxy).toBeVisible();
  await expect(page.getByTestId('galaxy-map-svg')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('galaxy-map-counts')).toContainText('2 clusters');
  await expect(page.getByTestId('galaxy-map-counts')).toContainText('3 sectors');
  await expect(page.getByTestId('galaxy-map-selection')).toContainText('Cluster_01_Sector001_macro');
  expect(await galaxy.innerText()).not.toContain('/api/agent/galaxy-map');

  await page.getByPlaceholder('Filter sectors or clusters').fill('Cluster_02');
  await expect(galaxy).toContainText('Sectors (1)');
});
