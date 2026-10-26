import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { E2E_API_ORIGIN, E2E_TOKEN } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, readServerWorkspace } from './ephemeral';
import type { ModWorkspace } from '../../src/types';

const workspacePath = 'D:\\X4ForgeMods';
const filesystemPath = 'G:\\Games\\X4 Foundations\\extensions';
const gamePath = 'G:\\Games\\X4 Foundations';
const API = E2E_API_ORIGIN;
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

function modRoot(name: string) {
  return [{
    name,
    kind: 'directory',
    path: name,
    hasChildren: true,
    hasContent: true,
    hasPacked: false,
    childCount: 3,
  }];
}

function modChildren(name: string, marker: string) {
  return [
    { name: 'assets', kind: 'directory', path: `${name}/assets`, hasChildren: true, hasContent: false, hasPacked: false, childCount: 1 },
    { name: 'content.xml', kind: 'file', path: `${name}/content.xml` },
    { name: `${marker}.arbitrary`, kind: 'file', path: `${name}/${marker}.arbitrary` },
  ];
}

test('Load Mod Project browses and imports the explicitly selected source root', async ({ page }) => {
  const activeWorkspace = await readServerWorkspace();
  const previewBodies: any[] = [];
  const importBodies: any[] = [];
  const listRequests: string[] = [];
  await page.addInitScript(() => localStorage.setItem('x4_forge_experience_mode', 'expert'));

  await page.route('**/api/schema/config', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loaded: true,
        config: { x4GamePath: gamePath, modWorkspacePath: workspacePath, filesystemPath },
        resolved: { x4GamePath: gamePath, modWorkspacePath: workspacePath, filesystemPath, mdExists: true, commonExists: true },
        directorySafety: { safe: true, issues: [] },
      }),
    });
  });
  await page.route('**/api/fs/list?**', route => {
    const requestUrl = new URL(route.request().url());
    const root = requestUrl.searchParams.get('root');
    const relativePath = requestUrl.searchParams.get('path') || '';
    const depth = requestUrl.searchParams.get('depth');
    listRequests.push(`${root}:${relativePath}:${depth}`);
    let body: any[] = [];
    if (depth === '1' && relativePath === '' && (root === 'workspace' || root === 'filesystem')) {
      body = modRoot('same_mod');
    } else if (depth === '1' && relativePath === 'same_mod' && (root === 'workspace' || root === 'filesystem')) {
      body = modChildren('same_mod', root);
    } else if (depth === '1' && relativePath === 'same_mod/assets' && (root === 'workspace' || root === 'filesystem')) {
      body = [{ name: `${root}.png`, kind: 'file', path: `same_mod/assets/${root}.png` }];
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/agent/round-trip-check', async route => {
    previewBodies.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ strictLossless: true, importReport: { counts: { passthrough: 1 } } }),
    });
  });
  await page.route('**/api/agent/mod-folder/import', async route => {
    importBodies.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, workspace: activeWorkspace, report: { summary: 'passthrough:1' } }),
    });
  });

  await page.goto('/');
  const startupWalkaround = page.getByTestId('health-card');
  await expect(startupWalkaround).toBeVisible();
  await page.getByTestId('health-card-dismiss').click();
  await expect(startupWalkaround).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dismiss setup' })).toHaveCount(0);
  await page.getByTitle('Load existing mods or push updates to GitHub').click();
  await expect(page.getByText('Load Mod Project', { exact: true })).toBeVisible();

  const workspaceSource = page.getByTestId('project-source-workspace');
  const filesystemSource = page.getByTestId('project-source-filesystem');
  await expect(workspaceSource).toContainText('Mod Workspace');
  await expect(workspaceSource).toContainText(workspacePath);
  await expect(filesystemSource).toContainText('Filesystem');
  await expect(filesystemSource).toContainText(filesystemPath);
  await expect(workspaceSource.getByRole('button', { name: 'Collapse Mod Workspace' })).toHaveAttribute('aria-expanded', 'true');
  await expect(filesystemSource.getByRole('button', { name: 'Collapse Filesystem' })).toHaveAttribute('aria-expanded', 'true');
  await expect(workspaceSource.getByRole('button', { name: 'Select same_mod from Mod Workspace' })).toBeVisible();
  await expect(filesystemSource.getByRole('button', { name: 'Select same_mod from Filesystem' })).toBeVisible();
  expect(listRequests).toEqual(expect.arrayContaining(['workspace::1', 'filesystem::1']));

  await workspaceSource.getByRole('button', { name: 'Collapse Mod Workspace' }).click();
  await expect(workspaceSource.getByRole('button', { name: 'Select same_mod from Mod Workspace' })).toHaveCount(0);
  await workspaceSource.getByRole('button', { name: 'Expand Mod Workspace' }).click();
  await expect(workspaceSource.getByRole('button', { name: 'Select same_mod from Mod Workspace' })).toBeVisible();

  const filesystemMod = filesystemSource.getByTestId('project-tree-node-filesystem-same_mod');
  await filesystemMod.getByRole('button', { name: 'Expand same_mod' }).click();
  await expect(filesystemMod.getByText('content.xml', { exact: true })).toBeVisible();
  await expect(filesystemMod.getByRole('button', { name: 'Expand assets' })).toBeVisible();
  await filesystemMod.getByRole('button', { name: 'Expand assets' }).click();
  await expect(filesystemMod.getByText('filesystem.png', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Filter mod folders...').fill('filesystem.png');
  await expect(filesystemMod.getByText('filesystem.png', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Filter mod folders...').fill('');
  expect(listRequests.filter(request => request === 'filesystem:same_mod:1')).toHaveLength(1);
  await filesystemMod.getByRole('button', { name: 'Collapse same_mod' }).click();
  await filesystemMod.getByRole('button', { name: 'Expand same_mod' }).click();
  expect(listRequests.filter(request => request === 'filesystem:same_mod:1')).toHaveLength(1);

  await filesystemSource.getByRole('button', { name: 'Select same_mod from Filesystem' }).click();
  await expect.poll(() => previewBodies.length).toBe(1);
  expect(previewBodies[0]).toEqual({ root: 'filesystem', path: 'same_mod' });
  await expect(page.getByText('filesystem: same_mod', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Load Project', exact: true }).click();
  await expect.poll(() => importBodies.length).toBe(1);
  expect(importBodies[0]).toEqual({ root: 'filesystem', path: 'same_mod' });
  await expect(page.getByText('Load Mod Project', { exact: true })).toHaveCount(0);
});

test('Load Mod Project keeps a healthy source browsable when the other root fails', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('x4_forge_experience_mode', 'expert'));
  await page.route('**/api/schema/config', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loaded: true,
        config: { x4GamePath: gamePath, modWorkspacePath: workspacePath, filesystemPath },
        resolved: { x4GamePath: gamePath, modWorkspacePath: workspacePath, filesystemPath, mdExists: true, commonExists: true },
        directorySafety: { safe: true, issues: [] },
      }),
    });
  });
  await page.route('**/api/fs/list?**', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get('root') === 'workspace') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Workspace scan unavailable' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(modRoot('filesystem_mod')) });
  });

  await page.goto('/');
  const startupWalkaround = page.getByTestId('health-card');
  await expect(startupWalkaround).toBeVisible();
  await page.getByTestId('health-card-dismiss').click();
  await page.getByTitle('Load existing mods or push updates to GitHub').click();

  const workspaceSource = page.getByTestId('project-source-workspace');
  const filesystemSource = page.getByTestId('project-source-filesystem');
  await expect(workspaceSource).toContainText('Workspace scan unavailable');
  await expect(filesystemSource.getByRole('button', { name: 'Select filesystem_mod from Filesystem' })).toBeVisible();
});

test('Load Mod Project preserves manual paths, refreshes previews and rejects stale or missing folders', async ({ page, request }, testInfo) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-manual-project-load-'));
  const staging = path.join(temp, 'staging');
  const deployment = path.join(temp, 'deployment');
  const mod = path.join(staging, 'manual_mod');
  fs.mkdirSync(path.join(mod, 'md'), { recursive: true });
  fs.mkdirSync(deployment, { recursive: true });
  fs.writeFileSync(path.join(mod, 'content.xml'), '<content id="manual_mod" name="Manual import" version="1"/>');
  fs.writeFileSync(path.join(mod, 'md', 'manual.xml'), '<mdscript name="Manual"><cues><cue name="Init"><actions><set_value name="$value" exact="1"/></actions></cue></cues></mdscript>');
  const headers = await ephemeralWorkspaceHeaders(true);
  const originalResponse = await request.get(`${API}/api/schema/config`, { headers });
  expect(originalResponse.ok(), await originalResponse.text()).toBeTruthy();
  const original = await originalResponse.json();
  const restore = { modWorkspacePath: original.config?.modWorkspacePath || '', filesystemPath: original.config?.filesystemPath || '' };
  let releaseScan!: () => void;
  let releasePreview!: () => void;
  let releaseRefreshPreview!: () => void;
  const scanGate = new Promise<void>(resolve => { releaseScan = resolve; });
  const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
  const refreshPreviewGate = new Promise<void>(resolve => { releaseRefreshPreview = resolve; });
  let pendingScans = 0;
  let completedScans = 0;
  let pendingPreviews = 0;
  let completedPreviews = 0;
  let holdNextRefreshPreview = false;
  let heldRefreshNodeCount: number | null = null;
  let completedRefreshPreviews = 0;
  try {
    const configured = await request.post(`${API}/api/schema/config`, { headers, data: { modWorkspacePath: staging, filesystemPath: deployment } });
    expect(configured.ok(), await configured.text()).toBeTruthy();
    await page.addInitScript(() => localStorage.setItem('x4_forge_experience_mode', 'expert'));
    await page.goto('/');
    await expect(page.getByTestId('studio-workspace')).toBeVisible();
    // Delay actual API responses, preserving their bytes and status. No fabricated
    // discovery, preview or import result can satisfy this regression.
    await page.route('**/api/fs/list?**', async route => {
      const response = await route.fetch();
      pendingScans += 1;
      await scanGate;
      await route.fulfill({ response });
      completedScans += 1;
    });
    await page.route('**/api/agent/round-trip-check', async route => {
      const holdForRefresh = holdNextRefreshPreview;
      if (holdForRefresh) holdNextRefreshPreview = false;
      const response = await route.fetch();
      pendingPreviews += 1;
      await previewGate;
      if (holdForRefresh) {
        const body = await response.json() as { importReport?: { graphNodeCount?: number }; graphNodeCount?: number };
        heldRefreshNodeCount = body.importReport?.graphNodeCount ?? body.graphNodeCount ?? null;
        await refreshPreviewGate;
      }
      await route.fulfill({ response });
      completedPreviews += 1;
      if (holdForRefresh) completedRefreshPreviews += 1;
    });
    await page.getByTitle('Load existing mods or push updates to GitHub').click();
    const input = page.getByPlaceholder('Relative folder path, e.g. sn_mod_support_apis');
    await expect.poll(() => pendingScans).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('project-source-workspace')).toContainText(staging);
    await expect(page.getByTestId('project-source-filesystem')).toContainText(deployment);
    await input.pressSequentially('manual');
    await expect(input).toHaveValue('manual');
    releaseScan();
    await expect.poll(() => completedScans).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('button', { name: 'Select manual_mod from Mod Workspace', exact: true })).toBeVisible();
    await expect(input).toHaveValue('manual');
    await input.press('End');
    await input.pressSequentially('_mod');
    await expect(input).toHaveValue('manual_mod');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect.poll(() => pendingPreviews).toBe(1);
    await input.fill('missing_mod');
    releasePreview();
    await expect.poll(() => completedPreviews).toBe(1);
    const beforeRefusal = await readServerWorkspace();
    const refusalPromise = page.waitForResponse(response => response.url().endsWith('/api/agent/mod-folder/import') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Load Project', exact: true }).click();
    const refusal = await refusalPromise;
    expect(refusal.status()).toBe(404);
    const refused = await refusal.json();
    await expect(page.getByText(refused.error, { exact: true })).toBeVisible();
    await expect(input).toHaveValue('missing_mod');
    await expect(page.getByText(/\d+ graph nodes/)).toHaveCount(0);
    await expect(page.getByText('preview pending', { exact: true })).toBeVisible();
    expect((await readServerWorkspace()).nodes).toEqual(beforeRefusal.nodes);
    await page.screenshot({ path: testInfo.outputPath('manual-path-refused.png'), fullPage: true });
    await input.fill('manual_mod');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByText('2 graph nodes', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('manual-path-preview.png'), fullPage: true });

    // Hold a real two-node response, then refresh after the source gains an
    // action. Refresh must request a new preview, and the delayed old result
    // must not replace the new three-node preview when it finally arrives.
    holdNextRefreshPreview = true;
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect.poll(() => heldRefreshNodeCount).toBe(2);
    fs.writeFileSync(path.join(mod, 'md', 'manual.xml'), '<mdscript name="Manual"><cues><cue name="Init"><actions><set_value name="$value" exact="1"/><set_value name="$second" exact="2"/></actions></cue></cues></mdscript>');
    await page.getByTitle('Refresh projects', { exact: true }).click();
    await expect(page.getByText('3 graph nodes', { exact: true })).toBeVisible();
    await expect(input).toHaveValue('manual_mod');
    releaseRefreshPreview();
    await expect.poll(() => completedRefreshPreviews).toBe(1);
    // Give the delivered response its render turn before asserting ownership.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByText('3 graph nodes', { exact: true })).toBeVisible();
    await expect(page.getByText('2 graph nodes', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('manual-path-refreshed-preview.png'), fullPage: true });

    // A completed preview also expires immediately when the input changes.
    await input.press('End');
    await input.pressSequentially('_missing');
    await expect(input).toHaveValue('manual_mod_missing');
    await expect(page.getByText(/\d+ graph nodes/)).toHaveCount(0);
    await expect(page.getByText('preview pending', { exact: true })).toBeVisible();
    await input.fill('manual_mod');
    const importedPromise = page.waitForResponse(response => response.url().endsWith('/api/agent/mod-folder/import') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Load Project', exact: true }).click();
    const importedResponse = await importedPromise;
    expect(importedResponse.status()).toBe(200);
    const imported = await importedResponse.json();
    expect(imported.success).toBe(true);
    expect(imported.modId).toBe('manual_mod');
    await expect(page.getByText('Load Mod Project', { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await readServerWorkspace()).nodes.map((node: { id: string }) => node.id)).toEqual(imported.workspace.nodes.map((node: { id: string }) => node.id));
  } finally {
    releaseScan();
    releasePreview();
    releaseRefreshPreview();
    await page.unrouteAll({ behavior: 'wait' });
    const restored = await request.post(`${API}/api/schema/config`, { headers, data: restore });
    expect(restored.ok(), await restored.text()).toBeTruthy();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Load Mod Project visibly decomposes a complex multi-script project without collapsing or overlapping cues', async ({ page, request }) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-complex-project-load-'));
  const staging = path.join(temp, 'staging');
  const deployment = path.join(temp, 'deployment');
  const mod = path.join(staging, 'complex_mod');
  fs.mkdirSync(path.join(mod, 'md'), { recursive: true });
  fs.mkdirSync(deployment, { recursive: true });
  fs.writeFileSync(path.join(mod, 'content.xml'), '<content id="complex_manifest_id" name="Complex Mod" version="1"/>', 'utf8');
  const lossyMd = (script: string, child: string) => `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="${script}"><cues><cue name="Init"><delay exact="1s"/><actions><set_value name="$first" exact="1"/></actions><delay exact="2s"/><actions><set_value name="$second" exact="2"/></actions>
<cues><cue name="${child}"><actions><set_value name="$x" exact="1"/></actions></cue></cues>
</cue></cues></mdscript>`;
  fs.writeFileSync(path.join(mod, 'md', 'alpha.xml'), lossyMd('Alpha', 'AlphaChild'), 'utf8');
  fs.writeFileSync(path.join(mod, 'md', 'beta.xml'), lossyMd('Beta', 'BetaChild'), 'utf8');

  const originalResponse = await request.get(`${API}/api/schema/config`, { headers: auth });
  expect(originalResponse.ok(), await originalResponse.text()).toBeTruthy();
  const original = await originalResponse.json() as { config?: Record<string, unknown> };
  const restore = {
    modWorkspacePath: original.config?.modWorkspacePath || '',
    filesystemPath: original.config?.filesystemPath || '',
  };

  try {
    const configured = await request.post(`${API}/api/schema/config`, {
      headers: auth,
      data: { modWorkspacePath: staging, filesystemPath: deployment },
    });
    expect(configured.ok(), await configured.text()).toBeTruthy();
    const configuredBody = await configured.json() as {
      manifest?: { state?: unknown; scanning?: unknown; error?: unknown };
    };
    // Fresh per-run data has no cached manifest, so a directory save may report a nonblocking initial scan.
    const manifest = configuredBody.manifest;
    if (!manifest) throw new Error('Directory config response omitted manifest status.');
    expect(manifest).not.toHaveProperty('error');
    expect(['ready', 'scanning', 'stale']).toContain(manifest.state);
    if (manifest.state === 'ready') {
      expect(manifest).not.toHaveProperty('scanning');
    } else {
      const scanning = manifest.scanning;
      const isRecord = (value: unknown): value is Record<string, unknown> => (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
      const isNonemptyString = (value: unknown): value is string => (
        typeof value === 'string' && value.length > 0
      );
      const isFiniteNonnegativeNumber = (value: unknown): value is number => (
        typeof value === 'number' && Number.isFinite(value) && value >= 0
      );
      expect(isRecord(scanning)).toBeTruthy();
      if (!isRecord(scanning)) throw new Error('Manifest scanning status is not an object.');
      expect(isNonemptyString(scanning.generation)).toBeTruthy();
      expect(isNonemptyString(scanning.startedAt)).toBeTruthy();
      expect(isFiniteNonnegativeNumber(scanning.files)).toBeTruthy();
      expect(isFiniteNonnegativeNumber(scanning.bytes)).toBeTruthy();
    }

    await page.goto('/');
    const startupWalkaround = page.getByTestId('health-card');
    if (await startupWalkaround.isVisible().catch(() => false)) await page.getByTestId('health-card-dismiss').click();
    await page.getByTitle('Load existing mods or push updates to GitHub').click();
    const source = page.getByTestId('project-source-workspace');
    await source.getByRole('button', { name: 'Select complex_mod from Mod Workspace' }).click();
    await expect(page.getByText('workspace: complex_mod', { exact: true })).toBeVisible();
    await expect(page.getByText('Mission Director', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Detected in package', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/8 graph nodes/i)).toBeVisible();
    await expect(page.getByText(/0 whole cues collapsed/i)).toBeVisible();

    const importedResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/agent/mod-folder/import') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Load Project', exact: true }).click();
    const importedResponse = await importedResponsePromise;
    expect(importedResponse.status()).toBe(200);
    const imported = await importedResponse.json() as { success: boolean; modId: string; workspace: ModWorkspace };
    expect(imported.success).toBe(true);
    expect(imported.modId).toBe('complex_manifest_id');
    expect(imported.workspace.nodes).toHaveLength(8);
    // C02 identities come from source ownership, not the retired alpha__cue_ prefix.
    // Identify each exact parent cue semantically before using its returned ID in the UI.
    const parentCue = (stem: 'alpha' | 'beta') => {
      const matches = imported.workspace.nodes.filter(node => node.source?.path === `md/${stem}.xml`
        && node.xmlTag === 'cue' && node.properties.name === 'Init');
      expect(matches).toHaveLength(1);
      expect(matches[0].properties.mdFileStem).toBe(stem);
      return matches[0];
    };
    const alphaCue = parentCue('alpha');
    const betaCue = parentCue('beta');
    const betaNodes = imported.workspace.nodes.filter(node => node.source?.path === 'md/beta.xml');
    expect(betaNodes).toHaveLength(4);
    expect(alphaCue.id).not.toBe(betaCue.id);
    const alpha = page.getByTestId(`canvas-node-${alphaCue.id}`);
    const beta = page.getByTestId(`canvas-node-${betaCue.id}`);
    await expect(page.getByText('Load Mod Project', { exact: true })).toHaveCount(0);
    const scriptFilter = page.getByTestId('canvas-md-script-filter');
    await expect(scriptFilter).toBeVisible();
    await scriptFilter.selectOption('alpha');
    await expect(alpha).toBeVisible();
    for (const node of betaNodes) await expect(page.getByTestId(`canvas-node-${node.id}`)).toHaveCount(0);
    await scriptFilter.selectOption('');
    await expect(alpha).toBeVisible();
    await expect(beta).toBeVisible();
    const [alphaBox, betaBox] = await Promise.all([alpha.boundingBox(), beta.boundingBox()]);
    expect(alphaBox).not.toBeNull();
    expect(betaBox).not.toBeNull();
    expect(Math.abs(alphaBox!.x - betaBox!.x) + Math.abs(alphaBox!.y - betaBox!.y)).toBeGreaterThan(40);

    const roundTrip = await request.post(`${API}/api/agent/round-trip-check`, {
      headers: auth,
      data: { root: 'workspace', path: 'complex_mod' },
    });
    expect(roundTrip.ok(), await roundTrip.text()).toBeTruthy();
    expect(await roundTrip.json()).toMatchObject({ lossless: true, strictLossless: true, droppedFiles: [] });
  } finally {
    const restored = await request.post(`${API}/api/schema/config`, { headers: auth, data: restore });
    expect(restored.ok(), await restored.text()).toBeTruthy();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
