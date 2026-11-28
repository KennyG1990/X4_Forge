import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from './request-transport';
import { E2E_API_ORIGIN } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, readServerWorkspace, seedServerWorkspace } from './ephemeral';

const CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<content id="aic_source_mod" name="AIC Source Mod" description="Hand-written multi-domain mod" author="QA" version="120" date="2026-11-28" save="0" enabled="1">
  <text language="44" name="AIC Source Mod" description="Hand-written multi-domain mod" author="QA" />
</content>
`;

const CUSTOM_PROTECT_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Custom order hand-written outside Forge -->
<aiscript name="order.aic.protect" version="2" priority="5">
  <order id="AicProtectOrder" name="AIC Protect" description="Hold sector defense ring" category="combat" infinite="true">
    <params>
      <param name="destination" type="position" text="{1041,10002}" default="null" required="true" />
      <param name="range" type="length" text="{1041,10003}" default="15km" advanced="true" />
    </params>
  </order>
  <interrupts>
    <handler ref="AttackHandler" />
  </interrupts>
  <patch sinceversion="2" />
  <attention min="insector">
    <actions>
      <label name="start" />
      <wait exact="5s" />
      <resume label="start" />
    </actions>
  </attention>
</aiscript>
`;

const BAD_PARAM_XML = `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="order.aic.badparam" version="1">
  <order id="AicBadOrder" name="Broken Param Order" category="trade">
    <params>
      <param name="broken_note" type="text" text="Bad Type" />
    </params>
  </order>
  <attention min="unknown">
    <actions>
      <wait exact="2s" />
    </actions>
  </attention>
</aiscript>
`;

const DIFF_RESPOND_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Vanilla aiscript hook preserved verbatim -->
<diff>
  <add sel="//aiscript/attention/actions" pos="prepend">
    <debug_text text="'AIC inspected hook'" chance="0" />
  </add>
</diff>
`;

const DIFF_INTERACTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <replace sel="//aiscript/attention/actions/wait/@exact">2s</replace>
</diff>
`;

const WARES_DIFF_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Hand-authored economy ware addition -->
<diff>
  <add sel="/wares">
    <ware id="aic_relay_core" name="AIC Relay Core" transport="container" volume="12" tags="economy">
      <price min="120" average="160" max="210" />
    </ware>
  </add>
  <replace sel="/wares/ware[@id='energycells']/price/@average">18</replace>
</diff>
`;

const BASKETS_XML = `<?xml version="1.0" encoding="utf-8"?>
<baskets>
  <basket id="aic_trade_basket">
    <wares>
      <ware ware="aic_relay_core" />
      <ware ware="energycells" />
    </wares>
  </basket>
</baskets>
`;

const GOD_DIFF_XML = `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <add sel="/god/products">
    <product id="aic_relay_factory" owner="argon" type="factory" ware="aic_relay_core">
      <quota galaxy="4" />
    </product>
  </add>
  <add sel="/god/stations">
    <station id="aic_relay_hub" owner="player" type="tradingstation">
      <quota galaxy="1" />
    </station>
  </add>
</diff>
`;

test('dual-mode domain indexing surfaces hand-written aiscripts, libraries, and XML diffs losslessly (#141)', async ({ request, page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  const headers = await ephemeralWorkspaceHeaders(true);
  const runRoot = path.resolve('test-results/domain-source-indexing', `run-${randomUUID()}`);
  const modsDir = path.join(runRoot, 'mods');
  const modDir = path.join(modsDir, 'aic_source_mod');
  const gameDir = path.join(runRoot, 'game');
  fs.mkdirSync(path.join(modDir, 'aiscripts'), { recursive: true });
  fs.mkdirSync(path.join(modDir, 'libraries'), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'extensions'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'X4.exe'), 'Inert scratch marker; never executed.');
  fs.writeFileSync(path.join(modDir, 'content.xml'), CONTENT_XML, 'utf8');
  fs.writeFileSync(path.join(modDir, 'aiscripts', 'order.aic.protect.xml'), CUSTOM_PROTECT_XML, 'utf8');
  fs.writeFileSync(path.join(modDir, 'aiscripts', 'order.aic.badparam.xml'), BAD_PARAM_XML, 'utf8');
  fs.writeFileSync(path.join(modDir, 'aiscripts', 'lib.respond.inspected.xml'), DIFF_RESPOND_XML, 'utf8');
  fs.writeFileSync(path.join(modDir, 'aiscripts', 'player.interaction.xml'), DIFF_INTERACTION_XML, 'utf8');
  fs.writeFileSync(path.join(modDir, 'libraries', 'wares.xml'), WARES_DIFF_XML, 'utf8');
  fs.writeFileSync(path.join(modDir, 'libraries', 'baskets.xml'), BASKETS_XML, 'utf8');
  fs.writeFileSync(path.join(modDir, 'libraries', 'god.xml'), GOD_DIFF_XML, 'utf8');

  const priorConfigRes = await request.get(`${E2E_API_ORIGIN}/api/schema/config`, { headers });
  expect(priorConfigRes.status()).toBe(200);
  const priorConfig = (await priorConfigRes.json())?.config || {};

  try {
    const cfgRes = await request.post(`${E2E_API_ORIGIN}/api/schema/config`, {
      headers,
      data: {
        modWorkspacePath: modsDir,
        filesystemPath: path.join(gameDir, 'extensions'),
        x4GamePath: gameDir,
      },
    });
    expect(cfgRes.status()).toBe(200);

    const importRes = await request.post(`${E2E_API_ORIGIN}/api/agent/mod-folder/import`, {
      headers,
      data: { root: 'workspace', path: 'aic_source_mod' },
    });
    expect(importRes.status()).toBe(200);
    const importData = await importRes.json();
    expect(importData.success).toBe(true);
    await seedServerWorkspace(importData.workspace);

    const passthroughSnapshotBefore = JSON.stringify((await readServerWorkspace()).passthroughFiles || []);

    await page.addInitScript(() => {
      localStorage.setItem('x4_forge_experience_mode', 'expert');
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('x4_mod_studio_')) localStorage.removeItem(key);
      }
    });

    await page.goto('/');
    await expect(page.getByTestId('studio-workspace')).toBeVisible();

    // 1. AI Scripts workbench must show all 4 passthrough scripts (2 full orders + 2 RFC 5261 diffs)
    await page.locator('[data-workspace-view="aiscripts"]').click();
    await expect(page.locator('#ai_script_editor_view')).toBeVisible();
    await expect(page.getByTestId('ai-workspace-script-count')).toHaveText('4');
    await expect(page.getByTestId('ai-source-scripts-section')).toBeVisible();

    await expect(page.getByTestId('ai-source-script-order.aic.protect')).toBeVisible();
    await expect(page.getByTestId('ai-source-script-order.aic.badparam')).toBeVisible();
    await expect(page.getByTestId('ai-source-script-lib.respond.inspected')).toBeVisible();
    await expect(page.getByTestId('ai-source-script-player.interaction')).toBeVisible();

    await page.getByTestId('ai-source-script-order.aic.protect').click();
    await expect(page.getByTestId('ai-source-backed-banner')).toContainText('aiscripts/order.aic.protect.xml');
    await expect(page.getByTestId('ai-script-lint-badge')).toContainText('XSD & Lint Clean');
    await expect(page.locator('#ai_script_editor_view')).toContainText('AicProtectOrder');
    await page.getByTestId('ai-source-tab-xml').click();
    await expect(page.getByTestId('ai-xml-preview')).toContainText('Custom order hand-written outside Forge');

    // Negative check: hand-written aiscript with illegal type="text" triggers live lint finding
    await page.getByTestId('ai-source-script-order.aic.badparam').click();
    await expect(page.getByTestId('ai-script-lint-badge')).toContainText('error');
    await expect(page.getByTestId('ai-lint-findings-list')).toContainText('aiscript.order_param_illegal_type');

    // RFC 5261 diff aiscript binds vanilla target and shows diff ops
    await page.getByTestId('ai-source-script-lib.respond.inspected').click();
    await expect(page.getByTestId('ai-script-lint-badge')).toContainText('RFC 5261 Diff');
    await expect(page.locator('#ai_script_editor_view')).toContainText('aiscripts/lib.respond.inspected.xml');
    await expect(page.getByTestId('ai-source-diff-op-0')).toContainText('//aiscript/attention/actions');

    const shotDir = process.env.FORGE_DA2_SHOT_DIR;
    if (shotDir) {
      fs.mkdirSync(shotDir, { recursive: true });
      await page.screenshot({ path: path.join(shotDir, '01-aiscripts-source-backed.png') });
    }

    // 2. Libraries workbench indexes source-backed wares, baskets, and god entries
    await page.locator('[data-workspace-view="libraries"]').click();
    await expect(page.locator('#libraries_configurator_view')).toBeVisible();
    await expect(page.getByTestId('library-source-list-wares')).toBeVisible();
    await expect(page.getByTestId('library-source-item-aic_relay_core')).toBeVisible();
    await expect(page.getByTestId('library-source-backed-panel')).toContainText('libraries/wares.xml');
    await page.getByTestId('library-xml-preview-toggle').click();
    await expect(page.getByTestId('library-xml-preview')).toContainText('Hand-authored economy ware addition');

    if (shotDir) {
      await page.screenshot({ path: path.join(shotDir, '02-libraries-source-backed.png') });
    }

    await page.getByRole('button', { name: 'baskets.xml', exact: true }).click();
    await expect(page.getByTestId('library-source-list-baskets')).toBeVisible();
    await expect(page.getByTestId('library-source-item-aic_trade_basket')).toBeVisible();

    await page.getByRole('button', { name: 'god.xml', exact: true }).click();
    await expect(page.getByTestId('library-source-list-god')).toBeVisible();
    await expect(page.getByTestId('library-source-item-aic_relay_factory')).toBeVisible();
    await expect(page.getByTestId('library-source-item-aic_relay_hub')).toBeVisible();

    // 3. XML Diff Workbench surfaces all disk <diff> files across aiscripts + libraries
    await page.locator('[data-workspace-view="xmlpatch"]').click();
    await expect(page.locator('#xml_patch_workbench_view')).toBeVisible();
    const treePaneBtn = page.locator('[data-compact-pane="tree"]');
    if (await treePaneBtn.isVisible()) await treePaneBtn.click();
    await expect(page.getByTestId('xmlpatch-source-diff-tree')).toBeVisible();
    await page.getByTestId('xmlpatch-source-file-aiscripts_lib_respond_inspected_xml').click();
    await expect(page.getByTestId('xmlpatch-source-diff-panel')).toContainText('aiscripts/lib.respond.inspected.xml');
    await expect(page.getByTestId('xmlpatch-source-op-0')).toContainText('//aiscript/attention/actions');
    if (shotDir) {
      await page.screenshot({ path: path.join(shotDir, '03-xmlpatch-source-diff-blocks.png') });
    }
    const previewPaneBtn = page.locator('[data-compact-pane="preview"]');
    if (await previewPaneBtn.isVisible()) await previewPaneBtn.click();
    await expect(page.getByTestId('xmlpatch-source-raw-xml')).toContainText('Vanilla aiscript hook preserved verbatim');

    if (shotDir) {
      await page.screenshot({ path: path.join(shotDir, '04-xmlpatch-source-preview.png') });
    }

    // 4. Lossless compile invariant: compiled manifest preserves exact original bytes & zero passthrough mutation
    const pkgRes = await request.post(`${E2E_API_ORIGIN}/api/agent/package`, { headers, data: {} });
    expect(pkgRes.status()).toBe(200);
    const pkgData = await pkgRes.json();
    expect(pkgData.files['aiscripts/order.aic.protect.xml']).toBe(CUSTOM_PROTECT_XML);
    expect(pkgData.files['aiscripts/order.aic.badparam.xml']).toBe(BAD_PARAM_XML);
    expect(pkgData.files['aiscripts/lib.respond.inspected.xml']).toBe(DIFF_RESPOND_XML);
    expect(pkgData.files['aiscripts/player.interaction.xml']).toBe(DIFF_INTERACTION_XML);
    expect(pkgData.files['libraries/wares.xml']).toBe(WARES_DIFF_XML);
    expect(pkgData.files['libraries/baskets.xml']).toBe(BASKETS_XML);
    expect(pkgData.files['libraries/god.xml']).toBe(GOD_DIFF_XML);

    const passthroughSnapshotAfter = JSON.stringify((await readServerWorkspace()).passthroughFiles || []);
    expect(passthroughSnapshotAfter).toBe(passthroughSnapshotBefore);
  } finally {
    await request
      .post(`${E2E_API_ORIGIN}/api/schema/config`, {
        headers,
        data: {
          modWorkspacePath: String(priorConfig.modWorkspacePath ?? ''),
          filesystemPath: String(priorConfig.filesystemPath ?? ''),
          x4GamePath: String(priorConfig.x4GamePath ?? ''),
        },
      })
      .catch(() => undefined);
    fs.rmSync(runRoot, { recursive: true, force: true });
  }
});
