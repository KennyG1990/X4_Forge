import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from './request-transport';
import { E2E_API_ORIGIN } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, readServerWorkspace, seedServerWorkspace } from './ephemeral';

const MOD_ID = 'additive_lab';

const CONTENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<content id="${MOD_ID}" name="Additive Lab" description="Additive-only guard E2E fixture" author="QA" version="100" date="2026-11-28" save="0" enabled="1">
  <text language="44" name="Additive Lab" description="Additive-only guard E2E fixture" author="QA" />
</content>
`;

const RULES_ADDITIVE_TRUE = JSON.stringify({
  version: 1,
  additiveOnly: true,
  suppressions: [],
  contracts: { knownChains: [], wireKeys: [], expectedRegisters: [] },
}, null, 2);

const CLEAN_DIFF_MOVE_FLEE = `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <add sel="/aiscript/init">
    <set_value name="$qa_additive_hook" exact="1"/>
  </add>
</diff>
`;

const CUSTOM_AISCRIPT = `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="qa.additive.custom.patrol" version="1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="aiscripts.xsd">
  <attention min="unknown">
    <actions>
      <wait exact="5s"/>
    </actions>
  </attention>
</aiscript>
`;

const CUSTOM_T_FILE = `<?xml version="1.0" encoding="utf-8"?>
<language id="44">
  <page id="998877" title="Additive Lab" voice="no">
    <t id="1">Custom Additive Entry</t>
  </page>
</language>
`;

test('additive-only guard enforces all 4 vanilla checks across validate, deploy-verify, and Project UI (#142)', async ({ request, page }) => {
  test.setTimeout(120_000);
  const headers = await ephemeralWorkspaceHeaders(true);
  const runRoot = path.resolve('test-results/additive-only-guard', `run-${randomUUID()}`);
  const modsDir = path.join(runRoot, 'mods');
  const modDir = path.join(modsDir, MOD_ID);
  const gameDir = path.join(runRoot, 'game');
  fs.mkdirSync(path.join(modDir, 'aiscripts'), { recursive: true });
  fs.mkdirSync(path.join(modDir, 't'), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'extensions'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'X4.exe'), 'Inert scratch marker; never executed.');

  const resetCleanModFiles = () => {
    fs.rmSync(modDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(modDir, 'aiscripts'), { recursive: true });
    fs.mkdirSync(path.join(modDir, 't'), { recursive: true });
    fs.writeFileSync(path.join(modDir, 'content.xml'), CONTENT_XML, 'utf8');
    fs.writeFileSync(path.join(modDir, 'forge.rules.json'), RULES_ADDITIVE_TRUE, 'utf8');
    fs.writeFileSync(path.join(modDir, 'aiscripts', 'move.flee.xml'), CLEAN_DIFF_MOVE_FLEE, 'utf8');
    fs.writeFileSync(path.join(modDir, 'aiscripts', 'qa_custom_patrol.xml'), CUSTOM_AISCRIPT, 'utf8');
    fs.writeFileSync(path.join(modDir, 't', '0001-l044.xml'), CUSTOM_T_FILE, 'utf8');
  };

  resetCleanModFiles();

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

    const validateDisk = async () => {
      const res = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, {
        headers,
        data: { fromPath: MOD_ID, detail: 'full' },
      });
      expect(res.status()).toBe(200);
      return await res.json();
    };

    // 1. Clean additive mod -> passes with vanilla diff hook reported.
    const clean = await validateDisk();
    expect(clean.ok, JSON.stringify(clean.flat)).toBe(true);
    expect(clean.summary.additiveErrors).toBe(0);
    expect(clean.additiveGuard.enabled).toBe(true);
    expect(clean.additiveGuard.available).toBe(true);
    expect(clean.additiveGuard.hooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: 'aiscripts/move.flee.xml',
          vanillaTarget: 'aiscripts/move.flee.xml',
          isVanillaTarget: true,
          op: 'add',
          sel: '/aiscript/init',
          additive: true,
        }),
      ]),
    );

    // 2. Check 1: Shadowed vanilla files across aiscripts/ & libraries/ are refused.
    fs.mkdirSync(path.join(modDir, 'libraries'), { recursive: true });
    fs.writeFileSync(path.join(modDir, 'aiscripts', 'move.flee.xml'), '<aiscript name="other.custom.flee"><actions><wait/></actions></aiscript>', 'utf8');
    fs.writeFileSync(path.join(modDir, 'libraries', 'wares.xml'), '<wares><ware id="qa_custom_ware" name="Custom" group="energy" transport="container" volume="1"/></wares>', 'utf8');
    const shadowed = await validateDisk();
    expect(shadowed.ok).toBe(false);
    expect(shadowed.summary.additiveErrors).toBeGreaterThanOrEqual(2);
    expect(shadowed.flat).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', code: 'additive.shadowed_vanilla_file', filePath: 'aiscripts/move.flee.xml' }),
        expect.objectContaining({ severity: 'error', code: 'additive.shadowed_vanilla_file', filePath: 'libraries/wares.xml' }),
      ]),
    );

    // 2b. Deploy preview (dryRun) refuses shadowed vanilla file under additiveOnly: true.
    const blockedDeployRes = await request.post(`${E2E_API_ORIGIN}/api/agent/deploy-verify`, {
      headers,
      data: { path: MOD_ID, dryRun: true, deployFormat: 'loose' },
    });
    const blockedDeploy = await blockedDeployRes.json();
    expect(blockedDeploy.ok).toBe(false);
    expect(blockedDeploy.stage).toBe('preflight');
    expect(blockedDeploy.validation?.additiveGuard?.enabled).toBe(true);
    expect(blockedDeploy.validationReceipt?.deployAllowed).toBe(false);
    expect(blockedDeploy.blockingFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'additive.shadowed_vanilla_file', filePath: 'aiscripts/move.flee.xml' }),
      ]),
    );

    // 3. Check 2: Destructive <replace>, <remove>, and <add type="@chance"> diffs on vanilla are refused with sel.
    resetCleanModFiles();
    fs.writeFileSync(
      path.join(modDir, 'aiscripts', 'move.flee.xml'),
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<diff>',
        '  <replace sel="/aiscript/order/@category">navigation</replace>',
        '  <remove sel="/aiscript/interrupts/handler[@ref=\'TideHandler\']"/>',
        '  <add sel="/aiscript/init/set_value[1]" type="@chance">50</add>',
        '</diff>',
      ].join('\n'),
      'utf8',
    );
    const destructiveDiff = await validateDisk();
    expect(destructiveDiff.ok).toBe(false);
    expect(destructiveDiff.flat).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', code: 'additive.diff_replace_forbidden', filePath: 'aiscripts/move.flee.xml', sourceRef: '/aiscript/order/@category' }),
        expect.objectContaining({ severity: 'error', code: 'additive.diff_remove_forbidden', filePath: 'aiscripts/move.flee.xml', sourceRef: '/aiscript/interrupts/handler[@ref=\'TideHandler\']' }),
        expect.objectContaining({ severity: 'error', code: 'additive.diff_attribute_add_forbidden', filePath: 'aiscripts/move.flee.xml', sourceRef: '@chance' }),
      ]),
    );

    // 4. Check 3: Reused vanilla aiscript name & mdscript name are refused even on renamed files.
    resetCleanModFiles();
    fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
    fs.writeFileSync(path.join(modDir, 'aiscripts', 'qa_custom_patrol.xml'), CUSTOM_AISCRIPT.replace('qa.additive.custom.patrol', 'move.flee'), 'utf8');
    fs.writeFileSync(path.join(modDir, 'md', 'qa_custom_md.xml'), '<mdscript name="Setup"><cues><cue name="QA_Init"/></cues></mdscript>', 'utf8');
    const reusedScripts = await validateDisk();
    expect(reusedScripts.ok).toBe(false);
    expect(reusedScripts.flat).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', code: 'additive.reused_vanilla_aiscript_name', filePath: 'aiscripts/qa_custom_patrol.xml' }),
        expect.objectContaining({ severity: 'error', code: 'additive.reused_vanilla_mdscript_name', filePath: 'md/qa_custom_md.xml' }),
      ]),
    );

    // 5. Check 4: Language file reusing vanilla page ID (1001) is refused.
    resetCleanModFiles();
    fs.writeFileSync(
      path.join(modDir, 't', '0001-l044.xml'),
      '<language id="44"><page id="1001"><t id="1">Shadowed</t></page></language>',
      'utf8',
    );
    const reusedPage = await validateDisk();
    expect(reusedPage.ok).toBe(false);
    expect(reusedPage.flat).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', code: 'additive.reused_vanilla_page_id', filePath: 't/0001-l044.xml', sourceRef: 'page:1001' }),
      ]),
    );

    // 6. Studio Project UI: displays Vanilla Diff Hooks report and toggles additiveOnly in forge.rules.json.
    resetCleanModFiles();
    const importRes = await request.post(`${E2E_API_ORIGIN}/api/agent/mod-folder/import`, {
      headers,
      data: { root: 'workspace', path: MOD_ID },
    });
    expect(importRes.status()).toBe(200);
    const importData = await importRes.json();
    await seedServerWorkspace(importData.workspace);

    await page.addInitScript(() => {
      localStorage.setItem('x4_forge_experience_mode', 'expert');
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('x4_mod_studio_')) localStorage.removeItem(key);
      }
    });

    await page.goto('/');
    await page.locator('[data-workspace-view="project"]').click();
    await expect(page.getByTestId('project-additive-guard')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('project-additive-guard-status')).toContainText('Enforced (additiveOnly: true)');
    await expect(page.getByTestId('project-vanilla-hooks-report')).toContainText('aiscripts/move.flee.xml');
    await expect(page.getByTestId('project-vanilla-hooks-report')).toContainText('/aiscript/init');

    await page.getByTestId('project-additive-only-toggle').click();
    await expect(page.getByTestId('project-additive-guard-status')).toContainText('Advisory only');
    await expect.poll(async () => {
      const ws = await readServerWorkspace();
      const pf = (ws?.passthroughFiles || []).find((f: { path: string }) => f.path === 'forge.rules.json');
      return pf?.content ? JSON.parse(pf.content).additiveOnly : null;
    }, { timeout: 10_000 }).toBe(false);

    await page.getByTestId('project-additive-only-toggle').click();
    await expect(page.getByTestId('project-additive-guard-status')).toContainText('Enforced (additiveOnly: true)');
    await expect.poll(async () => {
      const ws = await readServerWorkspace();
      const pf = (ws?.passthroughFiles || []).find((f: { path: string }) => f.path === 'forge.rules.json');
      return pf?.content ? JSON.parse(pf.content).additiveOnly : null;
    }, { timeout: 10_000 }).toBe(true);
  } finally {
    await request.post(`${E2E_API_ORIGIN}/api/schema/config`, {
      headers,
      data: {
        modWorkspacePath: priorConfig.modWorkspacePath || '',
        filesystemPath: priorConfig.filesystemPath || '',
        x4GamePath: priorConfig.x4GamePath || '',
      },
    }).catch(() => {});
    fs.rmSync(runRoot, { recursive: true, force: true });
  }
});
