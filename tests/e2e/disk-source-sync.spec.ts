import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, test } from './request-transport';
import { E2E_API_ORIGIN } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, readServerWorkspace, seedServerWorkspace } from './ephemeral';

const VALID_MD = (tag = 'ok') => `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="Disk_Sync_Lab" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <cues>
    <cue name="Sync_Init_${tag}">
      <conditions>
        <event_game_started/>
      </conditions>
      <actions>
        <debug_text text="'${tag}'"/>
      </actions>
    </cue>
  </cues>
</mdscript>
`;

const CONTENT_XML = (version: string) => `<?xml version="1.0" encoding="utf-8"?>
<content id="disk_sync_lab" name="Disk Sync Lab" description="Disk authority test mod" author="QA" version="${version}" date="2026-11-28" save="0" enabled="1">
  <text language="44" name="Disk Sync Lab" description="Disk authority test mod" author="QA" />
</content>
`;

const VALID_AISCRIPT = `<?xml version="1.0" encoding="utf-8"?>
<aiscript name="test_auto_sync" version="1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="aiscripts.xsd">
  <attention min="unknown">
    <actions>
      <wait exact="5s"/>
    </actions>
  </attention>
</aiscript>
`;

test('disk-authoritative workspace sync covers clean auto-reload, local-edit guard, legacy migration, and validation reload (#140)', async ({ request, page }) => {
  test.setTimeout(120_000);
  const headers = await ephemeralWorkspaceHeaders(true);
  const runRoot = path.resolve('test-results/disk-source-sync', `run-${randomUUID()}`);
  const modsDir = path.join(runRoot, 'mods');
  const modDir = path.join(modsDir, 'disk_sync_lab');
  const gameDir = path.join(runRoot, 'game');
  fs.mkdirSync(path.join(modDir, 'md'), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'extensions'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'X4.exe'), 'Inert scratch marker; never executed.');
  fs.writeFileSync(path.join(modDir, 'content.xml'), CONTENT_XML('201'), 'utf8');
  fs.writeFileSync(path.join(modDir, 'md', 'disk_sync_lab.xml'), VALID_MD('v201'), 'utf8');

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

    // 1. Auto-sync clean folder-backed workspace: disk content.xml 201 -> 330 + new aiscript file.
    const importRes = await request.post(`${E2E_API_ORIGIN}/api/agent/mod-folder/import`, {
      headers,
      data: { root: 'workspace', path: 'disk_sync_lab' },
    });
    expect(importRes.status()).toBe(200);
    const importData = await importRes.json();
    expect(importData.success).toBe(true);
    expect(typeof importData.workspace?.sourceStamp?.importedWorkspaceHash).toBe('string');
    expect(importData.workspace.sourceStamp.importedWorkspaceHash.length).toBeGreaterThan(0);

    await seedServerWorkspace(importData.workspace);

    await page.addInitScript(() => {
      localStorage.setItem('x4_forge_experience_mode', 'expert');
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('x4_mod_studio_')) localStorage.removeItem(key);
      }
    });

    await page.goto('/');
    await page.locator('[data-sidebar-tab="config"]').click();
    const versionInput = page.getByPlaceholder('e.g. 1.0.0 or 100');
    await expect(versionInput).toHaveValue('201');
    await expect(page.getByTestId('x4-version-preview')).not.toContainText('330');
    await expect(page.getByTestId('x4-version-preview')).toContainText('v2.01');
    await expect(page.getByTestId('disk-version-synced-badge')).toBeVisible({ timeout: 15_000 });

    // Simulate external edit (Claude / Codex / CLI deploy) on disk.
    fs.mkdirSync(path.join(modDir, 'aiscripts'), { recursive: true });
    fs.writeFileSync(path.join(modDir, 'content.xml'), CONTENT_XML('330'), 'utf8');
    fs.writeFileSync(path.join(modDir, 'aiscripts', 'test_auto_sync.xml'), VALID_AISCRIPT, 'utf8');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await expect(versionInput).toHaveValue('330', { timeout: 15_000 });
    await expect(page.getByTestId('x4-version-preview')).toContainText('v3.30');
    await expect(page.getByTestId('disk-source-drift-banner')).toHaveCount(0);
    await expect.poll(async () => (await readServerWorkspace()).version).toBe('330');

    // 2. Negative guard: local edit (331) must NOT be overwritten when disk changes to 340.
    await versionInput.fill('331');
    await expect.poll(async () => (await readServerWorkspace()).version, { timeout: 10_000 }).toBe('331');

    fs.writeFileSync(path.join(modDir, 'content.xml'), CONTENT_XML('340'), 'utf8');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await expect(page.getByTestId('disk-source-drift-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('disk-source-drift-banner')).toContainText('Local edits present');
    await expect(page.getByTestId('disk-version-drift-notice')).toContainText('340');
    await expect(versionInput).toHaveValue('331');

    await page.getByTestId('disk-source-reload-btn').click();
    await expect(versionInput).toHaveValue('340', { timeout: 15_000 });
    await expect(page.getByTestId('x4-version-preview')).toContainText('v3.40');
    await expect(page.getByTestId('disk-source-drift-banner')).toHaveCount(0);

    // 3. Negative guard: legacy workspace without importedWorkspaceHash refuses silent overwrite, then upgrades on reload.
    const legacyWorkspace = structuredClone(importData.workspace);
    legacyWorkspace.version = '201';
    legacyWorkspace.sourceStamp = {
      dir: modDir,
      hash: 'legacy_hash_before_sync',
      at: new Date().toISOString(),
    };
    await seedServerWorkspace(legacyWorkspace);
    await page.reload();
    await page.locator('[data-sidebar-tab="config"]').click();
    await expect(versionInput).toHaveValue('201');
    await expect(page.getByTestId('disk-source-drift-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('disk-source-drift-banner')).toContainText('Legacy snapshot');
    await expect(page.getByTestId('manifest-reload-from-disk-btn')).toBeVisible();
    await expect(versionInput).toHaveValue('201');

    await page.getByTestId('manifest-reload-from-disk-btn').click();
    await expect(versionInput).toHaveValue('340', { timeout: 15_000 });
    await expect(page.getByTestId('disk-source-drift-banner')).toHaveCount(0);
    await expect.poll(async () => {
      const ws = await readServerWorkspace();
      return Boolean(ws?.sourceStamp?.importedWorkspaceHash);
    }).toBe(true);

    // Now that reload stamped importedWorkspaceHash, a subsequent disk edit auto-syncs cleanly.
    fs.writeFileSync(path.join(modDir, 'content.xml'), CONTENT_XML('350'), 'utf8');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(versionInput).toHaveValue('350', { timeout: 15_000 });
    await expect(page.getByTestId('disk-source-drift-banner')).toHaveCount(0);

    // 4. Stale validation honesty: local draft differing from disk surfaces reload CTA in PackageModDoctor.
    await page.evaluate(() => {
      const api = (window as any).__X4_E2E__;
      const current = api.getWorkspace();
      const broken = structuredClone(current);
      broken.version = '351';
      broken.xmlPatches = [
        ...(broken.xmlPatches || []),
        {
          id: 'bad_patch_local',
          targetFile: 'libraries/wares.xml',
          action: 'replace',
          sel: '',
          content: '',
          includeInBuild: true,
        },
      ];
      api.setWorkspace(broken);
    });
    await page.locator('[data-sidebar-tab="diagnostics"]').click();
    await page.getByTestId('diagnostics-scope-package').click();
    const diffSummary = page.locator('summary', { hasText: 'files that differ' }).or(page.locator('summary', { hasText: 'file that differs' }));
    await expect(diffSummary).toBeVisible({ timeout: 15_000 });
    await diffSummary.click();
    const valReloadBtn = page.getByTestId('validation-reload-from-disk-btn');
    await expect(valReloadBtn).toBeVisible();
    await valReloadBtn.click();
    await expect.poll(async () => (await readServerWorkspace()).version, { timeout: 10_000 }).toBe('350');
  } finally {
    await request.post(`${E2E_API_ORIGIN}/api/schema/config`, {
      headers,
      data: {
        modWorkspacePath: priorConfig.modWorkspacePath ?? '',
        filesystemPath: priorConfig.filesystemPath ?? '',
        x4GamePath: priorConfig.x4GamePath ?? '',
      },
    }).catch(() => undefined);
    fs.rmSync(runRoot, { recursive: true, force: true });
  }
});
