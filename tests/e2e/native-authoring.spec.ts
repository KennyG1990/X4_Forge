import { expect, test, fetchRouteWithClosingConnection, type APIRequestContext, type Page } from './request-transport';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { needsManifestMaterialization, openOrMaterializeInNativeEditor } from '../../src/lib/nativeEditor';
import { E2E_API_ORIGIN, E2E_TOKEN, E2E_WEB_ORIGIN, E2E_STATE_DIR } from '../../playwright.config';
import { parseXMLToWorkspace } from '../../src/lib/xmlParser';
import { mdStemFingerprint } from '../../src/lib/mdFileIdentity';
import { applyNodeSelectionDocument, buildNodeSelectionDocument, isNodeSelectionFailure } from '../../src/lib/nodeSelectionDocument';
import { ephemeralWorkspaceHeaders, readServerWorkspaceEnvelope, seedServerWorkspace } from './ephemeral';
import { validatePackageReadiness } from '../../src/lib/modCompiler';
import { generateMDXML, sanitizeWorkspace } from '../../src/types';

const API = E2E_API_ORIGIN;
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

test('package readiness distinguishes data-only, inert legacy MD, empty, and real MD projects', () => {
  const patchOnly = {
    ...buildTemplateWorkspace('welcome'),
    nodes: [], links: [], uiWidgets: [], aiScripts: [], wares: [], jobs: [], tFiles: [],
    xmlPatches: [{
      id: 'data-only-patch', action: 'replace' as const, targetFile: 'libraries/wares.xml',
      sel: "/wares/ware[@id='energycells']/price/@average", content: '12', note: 'data-only', includeInBuild: true,
    }],
  };
  expect(validatePackageReadiness(patchOnly).some(finding => finding.code === 'package.md_missing_entrypoint')).toBe(false);
  expect(validatePackageReadiness({
    ...patchOnly,
    mdOriginal: { path: 'md/legacy.xml', content: '<?xml version="1.0"?><mdscript name="Legacy"><cues/></mdscript>' },
  })).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'package.md_inert_source', severity: 'warning', message: expect.stringContaining('do not need a cue') }),
  ]));

  const empty = { ...patchOnly, xmlPatches: [] };
  expect(validatePackageReadiness(empty)).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'package.empty_extension', severity: 'error' }),
  ]));

  const realMdWithoutCue = {
    ...empty,
    nodes: [{
      id: 'orphan', type: 'action' as const, xmlTag: 'debug_text', label: 'Orphan action',
      x: 0, y: 0, properties: { text: 'x' }, propertiesSchema: [], inputs: [], outputs: [], includeInBuild: true,
    }],
  };
  expect(validatePackageReadiness(realMdWithoutCue)).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'package.md_missing_entrypoint', severity: 'error' }),
  ]));
});

async function checkNativeMaterializationWorkspaceSwitch() {
  const workspace = buildTemplateWorkspace('welcome');
  const selectedFile = 'md/welcome.xml';
  const manifest = '<content id="fixture"/>';
  const workspaceRootId = 'a'.repeat(64);
  const firstWorkspaceId = 'ws_000000000000000000000000';
  const nextWorkspaceId = 'ws_111111111111111111111111';
  let selectedWorkspaceId = firstWorkspaceId;
  let revision = 0;
  const requests: string[] = [];
  const nativeMessages: unknown[] = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      parent: { postMessage: (message: unknown) => nativeMessages.push(message) },
      __X4_WORKSPACE_CONTEXT__: {
        getWorkspaceId: () => selectedWorkspaceId,
        getSelectionRevision: () => revision,
      },
    },
  });
  try {
    globalThis.fetch = async (url, init) => {
      const endpoint = String(url);
      requests.push(`${endpoint} ${selectedWorkspaceId}`);
      if (endpoint === '/api/agent/project/files') {
        return Response.json({ sourceAvailable: false, sourceFolder: 'fixture', workspaceRootId,
          entries: [{ path: selectedFile, state: 'generated-only', text: true, openable: false, materializable: true }],
        });
      }
      if (endpoint === '/api/agent/compile') {
        return Response.json({ files: { 'content.xml': manifest, [selectedFile]: '<mdscript name="Welcome"/>' } });
      }
      const request = JSON.parse(String(init?.body));
      expect(endpoint).toBe('/api/fs/write');
      expect(request).toEqual({
        path: 'fixture/content.xml', content: manifest, strict: true, expectedSha256: null,
        expectedWorkspaceRootId: workspaceRootId,
      });
      const reply = Response.json({ success: true, workspaceRootId, written: {
        bytes: Buffer.byteLength(manifest), sha256: createHash('sha256').update(manifest).digest('hex'),
        root: 'workspace', byteExact: true, absolutePath: path.resolve('fixture', 'content.xml'),
      } });
      const read = reply.json.bind(reply);
      reply.json = async () => {
        const body = await read();
        selectedWorkspaceId = nextWorkspaceId;
        revision += 1;
        return body;
      };
      return reply;
    };

    const result = await openOrMaterializeInNativeEditor(workspace, selectedFile);
    expect(requests).toEqual(['/api/agent/project/files', '/api/agent/compile', '/api/fs/write']
      .map(endpoint => `${endpoint} ${firstWorkspaceId}`));
    expect(nativeMessages).toEqual([]);
    expect(result).toMatchObject({ ok: false, materialized: false });
    expect(result.message).toContain('Forge created content.xml in the original workspace');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('patch-only projects emit no fake MD and materialization refuses stale overwrite', async ({ request }) => {
  await test.step('workspace change stops after the acknowledged manifest write', checkNativeMaterializationWorkspaceSwitch);
  expect(needsManifestMaterialization('libraries/wares.xml', true)).toBe(false);
  expect(needsManifestMaterialization('libraries/wares.xml', false)).toBe(true);
  expect(needsManifestMaterialization('content.xml', false)).toBe(false);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-native-authoring-'));
  const staging = path.join(temp, 'staging');
  const deployment = path.join(temp, 'deployment');
  const source = path.join(staging, 'patch_only_fixture');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(deployment, { recursive: true });
  fs.writeFileSync(path.join(source, 'content.xml'), '<content id="patch_only_fixture" name="Patch Only Fixture" version="1"/>', 'utf8');

  const originalResponse = await request.get(`${API}/api/schema/config`, { headers: auth });
  expect(originalResponse.ok(), await originalResponse.text()).toBeTruthy();
  const original = (await originalResponse.json()) as { config?: Record<string, unknown> };
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

    const workspace = {
      ...buildTemplateWorkspace('welcome'),
      id: 'patch_only_fixture',
      name: 'patch_only_fixture',
      nodes: [],
      links: [],
      uiWidgets: [],
      aiScripts: [],
      wares: [],
      jobs: [],
      tFiles: [],
      sourceFolder: source,
      compileSettings: { md: true, ui: false, ai: false, library: true, translations: false, patches: true },
      xmlPatches: [{
        id: 'patch-ware-price',
        action: 'replace',
        sel: "/wares/ware[@id='energycells']/price/@average",
        content: '12',
        note: 'Patch-only fixture',
        targetFile: 'libraries/wares.xml',
        includeInBuild: true,
      }],
    };

    const compiledResponse = await request.post(`${API}/api/agent/compile`, { headers: auth, data: { workspace } });
    expect(compiledResponse.ok(), await compiledResponse.text()).toBeTruthy();
    const compiled = await compiledResponse.json() as { files: Record<string, string>; diagnostics?: Array<{ code?: string }> };
    expect(Object.keys(compiled.files).some(file => file.startsWith('md/'))).toBeFalsy();
    expect(compiled.files['libraries/wares.xml']).toContain('<replace');
    expect(compiled.diagnostics?.some(finding => /md.*no.*cue/i.test(String(finding.code || '')))).toBeFalsy();

    const inventoryResponse = await request.post(`${API}/api/agent/project/files`, { headers: auth, data: { workspace } });
    expect(inventoryResponse.ok(), await inventoryResponse.text()).toBeTruthy();
    const inventory = await inventoryResponse.json() as {
      workspaceRootId: string;
      entries: Array<{ path: string; state: string; materializable: boolean }>;
    };
    expect(inventory.workspaceRootId).toMatch(/^[a-f0-9]{64}$/);
    expect(inventory.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'libraries/wares.xml', state: 'generated-only', materializable: true }),
    ]));

    const derivedInventoryResponse = await request.post(`${API}/api/agent/project/files`, {
      headers: auth,
      data: { workspace: { ...workspace, sourceFolder: undefined } },
    });
    expect(derivedInventoryResponse.ok(), await derivedInventoryResponse.text()).toBeTruthy();
    const derivedInventory = await derivedInventoryResponse.json() as {
      sourceAvailable: boolean;
      sourceFolder: string | null;
      entries: Array<{ path: string; openable: boolean }>;
    };
    expect(derivedInventory.sourceAvailable).toBe(true);
    expect(derivedInventory.sourceFolder).toBe('patch_only_fixture');
    expect(derivedInventory.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'content.xml', openable: true }),
    ]));

    const relative = 'patch_only_fixture/libraries/wares.xml';
    const first = await request.post(`${API}/api/fs/write`, {
      headers: auth,
      data: { path: relative, content: compiled.files['libraries/wares.xml'], strict: true, expectedSha256: null },
    });
    expect(first.ok(), await first.text()).toBeTruthy();
    const refused = await request.post(`${API}/api/fs/write`, {
      headers: auth,
      data: { path: relative, content: '<diff><remove sel="/wares"/></diff>', strict: true, expectedSha256: null },
    });
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'FILE_CHANGED' });

    const readBack = await request.get(`${API}/api/fs/read?root=workspace&path=${encodeURIComponent(relative)}`, { headers: auth });
    expect(readBack.ok(), await readBack.text()).toBeTruthy();
    expect((await readBack.json()).content).toBe(compiled.files['libraries/wares.xml']);

    await test.step('changed Mod Workspace folder refuses bound file operations', async () => {
      const nextStaging = path.join(temp, 'next-staging');
      fs.mkdirSync(nextStaging);
      const changed = await request.post(`${API}/api/schema/config`, {
        headers: auth,
        data: { modWorkspacePath: nextStaging, filesystemPath: deployment },
      });
      expect(changed.ok(), await changed.text()).toBeTruthy();
      const expectedWorkspaceRootId = inventory.workspaceRootId;
      const staleRead = await request.get(`${API}/api/fs/read`, {
        headers: auth, params: { root: 'workspace', path: relative, expectedWorkspaceRootId },
      });
      expect(staleRead.status()).toBe(409);
      expect(await staleRead.json()).toMatchObject({ code: 'WORKSPACE_ROOT_CHANGED' });

      const stalePath = 'patch_only_fixture/libraries/late.xml';
      const staleWrite = await request.post(`${API}/api/fs/write`, {
        headers: auth,
        data: { path: stalePath, content: compiled.files['libraries/wares.xml'], strict: true,
          expectedSha256: null, expectedWorkspaceRootId },
      });
      expect(staleWrite.status()).toBe(409);
      expect(await staleWrite.json()).toMatchObject({ code: 'WORKSPACE_ROOT_CHANGED' });
      expect(fs.existsSync(path.join(staging, stalePath))).toBe(false);
      expect(fs.existsSync(path.join(nextStaging, stalePath))).toBe(false);
    });
  } finally {
    const restored = await request.post(`${API}/api/schema/config`, { headers: auth, data: restore });
    expect(restored.ok(), await restored.text()).toBeTruthy();
    const verified = await request.get(`${API}/api/schema/config`, { headers: auth });
    expect(verified.ok(), await verified.text()).toBeTruthy();
    const verifiedBody = await verified.json() as { config?: Record<string, unknown> };
    expect(verifiedBody.config?.modWorkspacePath).toBe(restore.modWorkspacePath);
    expect(verifiedBody.config?.filesystemPath).toBe(restore.filesystemPath);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

const filesDigest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const diskPath = (value: string) => path.resolve(value).replaceAll('\\', '/');

function filesInventory(root: string): Record<string, string> {
  return Object.fromEntries(fs.readdirSync(root).sort().flatMap(name => {
    const absolute = path.join(root, name);
    const stat = fs.lstatSync(absolute);
    expect(stat.isSymbolicLink(), 'Files fixtures must not redirect outside the owned root').toBe(false);
    if (stat.isDirectory()) {
      return Object.entries(filesInventory(absolute)).map(([relative, hash]) => [`${name}/${relative}`, hash]);
    }
    expect(stat.isFile() && stat.nlink === 1, 'Files fixtures must be owned regular files').toBe(true);
    return [[name, filesDigest(fs.readFileSync(absolute))]];
  }));
}

async function withFilesPanel(
  page: Page,
  request: APIRequestContext,
  exercise: (fixture: {
    source: string; installed: string; workspace: ReturnType<typeof sanitizeWorkspace>;
    writes: Array<Record<string, unknown>>; creates: string[];
  }) => Promise<void>,
) {
  expect(new URL(API).hostname).toBe('127.0.0.1');
  expect(new URL(API).port).not.toBe('3001');
  const stateRoot = path.resolve(E2E_STATE_DIR);
  expect(fs.lstatSync(stateRoot).isDirectory() && !fs.lstatSync(stateRoot).isSymbolicLink()).toBe(true);
  expect(diskPath(fs.realpathSync(stateRoot))).toBe(diskPath(stateRoot));
  const headers = await ephemeralWorkspaceHeaders(true);
  const priorConfigResponse = await request.get(`${API}/api/schema/config`, { headers });
  expect(priorConfigResponse.status(), await priorConfigResponse.text()).toBe(200);
  const priorConfig = await priorConfigResponse.json();
  const restore = {
    modWorkspacePath: priorConfig.config?.modWorkspacePath || '',
    filesystemPath: priorConfig.config?.filesystemPath || '',
  };
  const priorWorkspace = await readServerWorkspaceEnvelope();
  const scratch = fs.mkdtempSync(path.join(stateRoot, 'files-authority-'));
  const source = path.join(scratch, 'source');
  const installed = path.join(scratch, 'installed');
  fs.mkdirSync(source);
  fs.mkdirSync(installed);
  fs.writeFileSync(path.join(installed, 'inspect.lua'), '-- installed bytes must never change\r\n');
  fs.writeFileSync(path.join(installed, 'blueprint.json'), '{"installed":true}\r\n');
  const installedBefore = filesInventory(installed);
  const workspace = sanitizeWorkspace({ ...buildTemplateWorkspace('welcome'),
    id: 'files_authority_fixture', name: 'Files_Authority_Fixture', sourceFolder: source });
  const writes: Array<Record<string, unknown>> = [];
  const creates: string[] = [];
  page.on('request', incoming => {
    const url = new URL(incoming.url());
    if (incoming.method() === 'POST' && url.pathname === '/api/fs/write') writes.push(incoming.postDataJSON());
    if (incoming.method() === 'POST' && url.pathname === '/api/fs/create') creates.push(incoming.url());
  });
  try {
    const configured = await request.post(`${API}/api/schema/config`, {
      headers, data: { modWorkspacePath: source, filesystemPath: installed },
    });
    expect(configured.status(), await configured.text()).toBe(200);
    await seedServerWorkspace(workspace);
    // All reads and writes below go to the actual ephemeral filesystem routes.
    await exercise({ source, installed, workspace, writes, creates });
    expect(filesInventory(installed)).toEqual(installedBefore);
    expect(creates, 'Files creation must not create an intermediate placeholder').toEqual([]);
  } finally {
    // Retire the browser before restoring shared settings, including any in-flight autosave.
    await page.close();
    const restored = await request.post(`${API}/api/schema/config`, { headers, data: restore });
    expect(restored.status(), await restored.text()).toBe(200);
    const verified = await request.get(`${API}/api/schema/config`, { headers });
    expect(verified.status(), await verified.text()).toBe(200);
    expect((await verified.json()).config).toMatchObject(restore);
    await seedServerWorkspace(priorWorkspace.workspace);
    expect(filesInventory(installed)).toEqual(installedBefore);
    const relative = path.relative(stateRoot, scratch);
    expect(relative !== '' && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..').toBe(true);
    expect(diskPath(fs.realpathSync(scratch))).toBe(diskPath(scratch));
    fs.rmSync(scratch, { recursive: true });
    expect(fs.existsSync(scratch)).toBe(false);
  }
}

async function openFilesPanel(page: Page, sourceSentinel: string) {
  await page.goto('/');
  const expert = page.getByTestId('mode-expert');
  if (await expert.getAttribute('aria-pressed') !== 'true') await expert.click();
  await page.locator('[data-sidebar-tab="filesystem"]').click();
  await expect(page.getByPlaceholder('Search Files...')).toBeVisible();
  await expect(page.getByRole('button', { name: sourceSentinel, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTitle('Create new script or workspace')).toBeEnabled();
}

async function readFilesSelection(page: Page, filename: string, source: string) {
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/api/fs/read'
      && url.searchParams.get('root') === 'workspace' && url.searchParams.get('path') === filename;
  });
  await page.getByRole('button', { name: filename, exact: true }).click();
  const response = await pending;
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ root: 'workspace', content: fs.readFileSync(path.join(source, filename), 'utf8'),
    sha256: filesDigest(fs.readFileSync(path.join(source, filename))) });
  expect(diskPath(body.absolutePath)).toBe(diskPath(path.join(source, filename)));
  return body as { content: string; absolutePath: string; sha256: string };
}

test('Files Save binds admitted blueprint and MD bytes and refuses inspected, stale or superseded selections', async ({ page, request }) => {
  test.setTimeout(120_000);
  await withFilesPanel(page, request, async ({ source, installed, workspace, writes }) => {
    const originals = {
      'blueprint.json': JSON.stringify(workspace, null, 2),
      'inspect.lua': '-- source Lua sentinel\r\nlocal untouched = true\r\n',
      'metadata.json': '{"purpose":"ordinary JSON, not a blueprint"}\r\n',
      'broken.json': '{"nodes":',
      'broken.xml': '<mdscript><cues><cue',
      'unsupported.xml': '<catalog><entry id="untouched"/></catalog>\r\n',
      'generated.xml': generateMDXML(workspace).replace('<mdscript ', '<!-- retain this exact source comment -->\r\n<mdscript '),
    };
    for (const [filename, content] of Object.entries(originals)) fs.writeFileSync(path.join(source, filename), content);
    const sourceBefore = filesInventory(source);
    const installedBefore = filesInventory(installed);
    await openFilesPanel(page, 'blueprint.json');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    const blueprint = await readFilesSelection(page, 'blueprint.json', source);
    await expect(page.getByText('Opened Blueprint: blueprint.json', { exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    for (const filename of ['inspect.lua', 'metadata.json', 'broken.json', 'broken.xml', 'unsupported.xml']) {
      await readFilesSelection(page, filename, source);
      await expect(page.getByText(`Active File: ${filename}`, { exact: true })).toBeVisible();
      await expect(save).toHaveCount(0);
      expect(writes).toEqual([]);
      expect(filesInventory(source)).toEqual(sourceBefore);
      expect(filesInventory(installed)).toEqual(installedBefore);
    }

    await readFilesSelection(page, 'blueprint.json', source);
    await expect(page.getByText('Opened Blueprint: blueprint.json', { exact: true })).toBeVisible();
    const jsonSaved = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/fs/write');
    await save.click();
    const jsonReply = await jsonSaved;
    expect(jsonReply.status(), await jsonReply.text()).toBe(200);
    const jsonWrite = writes[0];
    expect(Object.keys(jsonWrite).sort()).toEqual(['content', 'expectedSha256', 'path', 'strict']);
    expect(jsonWrite).toMatchObject({ expectedSha256: blueprint.sha256, strict: true });
    expect(diskPath(String(jsonWrite.path))).toBe(diskPath(blueprint.absolutePath));
    expect(path.isAbsolute(String(jsonWrite.path))).toBe(true);
    expect(JSON.parse(String(jsonWrite.content))).toMatchObject({ id: workspace.id, name: workspace.name });
    expect(fs.readFileSync(path.join(source, 'blueprint.json'), 'utf8')).toBe(jsonWrite.content);
    expect(await jsonReply.json()).toMatchObject({ success: true, written: { byteExact: true, root: 'workspace',
      sha256: filesDigest(String(jsonWrite.content)) } });
    await expect(page.getByText('Saved file: blueprint.json', { exact: true })).toBeVisible();

    const mdRead = await readFilesSelection(page, 'generated.xml', source);
    await expect(page.getByText('Imported XML Script: generated.xml', { exact: true })).toBeVisible();
    await expect(save).toBeEnabled();
    const mdSaved = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/fs/write');
    await save.click();
    const mdReply = await mdSaved;
    expect(mdReply.status(), await mdReply.text()).toBe(200);
    expect(writes[1]).toEqual({ path: mdRead.absolutePath, content: originals['generated.xml'],
      expectedSha256: mdRead.sha256, strict: true });
    expect(fs.readFileSync(path.join(source, 'generated.xml'), 'utf8')).toBe(originals['generated.xml']);
    expect(await mdReply.json()).toMatchObject({ success: true, written: { byteExact: true, root: 'workspace', sha256: mdRead.sha256 } });
    await expect(page.getByText('Saved file: generated.xml', { exact: true })).toBeVisible();

    const external = '<!-- external writer sentinel; retain on stale Save -->\r\n' + originals['generated.xml'];
    fs.writeFileSync(path.join(source, 'generated.xml'), external);
    const staleSave = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/fs/write');
    await save.click();
    const refusal = await staleSave;
    expect(refusal.status()).toBe(409);
    expect(await refusal.json()).toMatchObject({ success: false, code: 'FILE_CHANGED', expectedSha256: mdRead.sha256 });
    expect(writes[2]).toEqual(writes[1]);
    await expect(page.getByText(/^Save failed:/)).toBeVisible();
    await expect(page.getByText('Saved file: generated.xml', { exact: true })).toHaveCount(0);
    expect(fs.readFileSync(path.join(source, 'generated.xml'), 'utf8')).toBe(external);

    let releaseRead!: () => void;
    const release = new Promise<void>(resolve => { releaseRead = resolve; });
    let held = false;
    const staleRead = page.waitForResponse(response => new URL(response.url()).pathname === '/api/fs/read'
      && new URL(response.url()).searchParams.get('path') === 'blueprint.json');
    await page.route('**/api/fs/read?**', async route => {
      if (new URL(route.request().url()).searchParams.get('path') !== 'blueprint.json') return route.continue();
      const response = await fetchRouteWithClosingConnection(route);
      held = true;
      await release;
      await route.fulfill({ response });
    });
    try {
      await page.getByRole('button', { name: 'blueprint.json', exact: true }).click();
      await expect.poll(() => held).toBe(true);
      await expect(save).toHaveCount(0);
      await readFilesSelection(page, 'inspect.lua', source);
      await expect(page.getByText(/^Inspected text: inspect\.lua/)).toBeVisible();
      releaseRead();
      await (await staleRead).finished();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.getByText('Active File: inspect.lua', { exact: true })).toBeVisible();
      await expect(save).toHaveCount(0);
      await expect(page.getByText('Opened Blueprint: blueprint.json', { exact: true })).toHaveCount(0);
    } finally {
      releaseRead();
      await page.unroute('**/api/fs/read?**');
    }
    await readFilesSelection(page, 'blueprint.json', source);
    await expect(save).toBeEnabled();
    await page.evaluate(() => {
      const context = window.__X4_WORKSPACE_CONTEXT__!;
      const original = context.getWorkspaceId();
      context.selectWorkspace(original === 'ws_000000000000000000000000'
        ? 'ws_111111111111111111111111' : 'ws_000000000000000000000000');
      context.selectWorkspace(original);
      // If React has not rendered the new revision yet, the handler must still refuse synchronously.
      const oldSave = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Save');
      oldSave?.click();
    });
    await expect(save).toHaveCount(0);
    expect(writes).toHaveLength(3);
    expect(filesInventory(source)).toEqual({ ...sourceBefore,
      'blueprint.json': filesDigest(String(jsonWrite.content)), 'generated.xml': filesDigest(external) });
    expect(filesInventory(installed)).toEqual(installedBefore);
  });
});

test('Files New File dismissals write nothing and both types create atomically without replacing duplicates', async ({ page, request }) => {
  test.setTimeout(120_000);
  await withFilesPanel(page, request, async ({ source, installed, workspace, writes, creates }) => {
    fs.writeFileSync(path.join(source, 'existing.lua'), '-- source sentinel\r\n');
    const sourceBefore = filesInventory(source);
    const installedBefore = filesInventory(installed);
    await openFilesPanel(page, 'existing.lua');
    const newFile = page.getByTitle('Create new script or workspace');
    const chooserTitle = 'Create as a Visual JSON Blueprint, or raw Egosoft MD Script XML?';
    const dismiss = async (method: 'Cancel' | 'Escape' | 'backdrop') => {
      if (method === 'Cancel') await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      else if (method === 'Escape') await page.keyboard.press('Escape');
      else await page.getByTestId('dialog-modal').click({ position: { x: 5, y: 5 } });
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(newFile).toBeEnabled();
    };
    const beginChoice = async (filename: string) => {
      await newFile.click();
      await page.getByTestId('dialog-input').fill(filename);
      await page.getByTestId('dialog-ok').click();
      await expect(page.getByRole('dialog', { name: chooserTitle, exact: true })).toBeVisible();
      await expect(page.getByTestId('dialog-ok')).toHaveText('JSON Blueprint');
      await expect(page.getByTestId('dialog-alternative')).toHaveText('MD Script XML');
      await expect(page.getByTestId('dialog-cancel')).toHaveText('Cancel');
    };
    for (const method of ['Cancel', 'Escape', 'backdrop'] as const) {
      await newFile.click();
      await page.getByTestId('dialog-input').fill(`dismiss_name_${method}`);
      await dismiss(method);
      await beginChoice(`dismiss_type_${method}`);
      await dismiss(method);
      expect(writes).toEqual([]);
      expect(creates).toEqual([]);
      expect(filesInventory(source)).toEqual(sourceBefore);
      expect(filesInventory(installed)).toEqual(installedBefore);
    }
    for (const type of ['json', 'xml'] as const) {
      const basename = `atomic_${type}`;
      const filename = `${basename}.${type}`;
      await beginChoice(basename);
      const written = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/fs/write');
      await page.getByTestId(type === 'json' ? 'dialog-ok' : 'dialog-alternative').click();
      const response = await written;
      expect(response.status(), await response.text()).toBe(200);
      const expectedContent = type === 'json' ? JSON.stringify(workspace, null, 2) : generateMDXML(workspace);
      const sent = writes.at(-1)!;
      expect(Object.keys(sent).sort()).toEqual(['content', 'expectedSha256', 'path', 'strict']);
      expect(sent).toMatchObject({ content: expectedContent, expectedSha256: null, strict: true });
      expect(path.isAbsolute(String(sent.path))).toBe(true);
      expect(diskPath(String(sent.path))).toBe(diskPath(path.join(source, filename)));
      const reply = await response.json();
      expect(reply).toMatchObject({ success: true, written: { byteExact: true, root: 'workspace', sha256: filesDigest(expectedContent) } });
      expect(diskPath(reply.written.absolutePath)).toBe(diskPath(path.join(source, filename)));
      expect(fs.readFileSync(path.join(source, filename), 'utf8')).toBe(expectedContent);
      if (type === 'json') expect(JSON.parse(expectedContent)).toMatchObject({ id: workspace.id, name: workspace.name });
      else expect(parseXMLToWorkspace(expectedContent)?.nodes.length).toBeGreaterThan(0);
      await expect(page.getByText(`Created file: ${filename}`, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: filename, exact: true })).toBeVisible();
      expect(writes).toHaveLength(type === 'json' ? 1 : 2);
      expect(creates).toEqual([]);
    }
    const createdBefore = filesInventory(source);
    await beginChoice('atomic_json');
    const duplicate = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/fs/write');
    await page.getByTestId('dialog-ok').click();
    const refusal = await duplicate;
    expect(refusal.status()).toBe(409);
    expect(await refusal.json()).toMatchObject({ success: false, code: 'FILE_CHANGED' });
    expect(writes).toHaveLength(3);
    expect(writes[2]).toEqual(writes[0]);
    await expect(page.getByText(/^Could not create file:/)).toBeVisible();
    await expect(page.getByText('Created file: atomic_json.json', { exact: true })).toHaveCount(0);
    expect(filesInventory(source)).toEqual(createdBefore);
    expect(filesInventory(installed)).toEqual(installedBefore);
    expect(creates).toEqual([]);
  });
});

test('selected node edit compiles from an exact source splice without touching sibling bytes', async ({ request }) => {
  const original = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="NodeEdit"><cues>
  <!-- rationale before cue must survive -->
  <cue name="Start" instantiate="true"><conditions><event_cue_signalled cue="md.Setup.Start" /></conditions><actions>
    <reward_player money="100" />
    <reward_player money="200" />
  </actions></cue>
  <cue name="Start_Long"><actions><reward_player money="300" /></actions></cue>
</cues></mdscript>`;
  const workspace = parseXMLToWorkspace(original, { path: 'md/test.xml' });
  expect(workspace).not.toBeNull();
  const ws = workspace!;
  ws.id = 'node_edit';
  ws.name = 'Node Edit';
  ws.contentId = 'node_edit';
  ws.compileSettings = { md: true, ui: false, ai: false, library: false, translations: false, patches: false };
  for (const node of ws.nodes) if (node.type === 'cue') node.properties = { ...node.properties, mdFileStem: 'test' };
  const editedNode = ws.nodes.filter(node => node.xmlTag === 'reward_player')[1];
  expect(editedNode?.source).toBeTruthy();
  ws.originalFiles = [{ path: 'md/test.xml', content: original, kind: 'md', stem: 'test', fingerprint: mdStemFingerprint(ws, 'test') }];

  const document = buildNodeSelectionDocument(ws, [editedNode.id]);
  expect(isNodeSelectionFailure(document), isNodeSelectionFailure(document) ? document.message : '').toBeFalsy();
  if (isNodeSelectionFailure(document)) return;
  const applied = applyNodeSelectionDocument(ws, [editedNode.id], document.token, document.content.replace('money="200"', 'money="275"'));
  expect(isNodeSelectionFailure(applied), isNodeSelectionFailure(applied) ? applied.message : '').toBeFalsy();
  if (isNodeSelectionFailure(applied)) return;

  const response = await request.post(`${API}/api/agent/compile`, { headers: auth, data: { workspace: applied.workspace } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const compiled = await response.json() as { files: Record<string, string> };
  const output = compiled.files['md/test.xml'];
  expect(output).toBe(applied.workspace.originalFiles![0].content);
  const span = editedNode.source!;
  expect(output.slice(0, span.start)).toBe(original.slice(0, span.start));
  expect(output.endsWith(original.slice(span.end))).toBeTruthy();
  expect(output).toContain('<!-- rationale before cue must survive -->');
  expect(output).toContain('<reward_player money="100" />');
  expect(output).toContain('<cue name="Start_Long"><actions><reward_player money="300" /></actions></cue>');
});

test('rendered modifier selection sends exactly the selected graph snippets to the native host', async ({ page }) => {
  const workspace = buildTemplateWorkspace('welcome');
  workspace.id = 'native_selection_ui';
  workspace.name = 'Native Selection UI';
  workspace.nodes = [
    {
      id: 'cue_native_ui', type: 'cue', label: 'Native Cue', xmlTag: 'cue', x: 130, y: 120,
      properties: { name: 'Native_Cue', namespace: 'this', instantiate: true }, propertiesSchema: [],
      inputs: [], outputs: [{ id: 'out_act', name: 'actions', type: 'flow' }], includeInBuild: true,
    },
    {
      id: 'action_native_ui', type: 'action', label: 'Native Reward', xmlTag: 'reward_player', x: 470, y: 150,
      properties: { money: '250' }, propertiesSchema: [],
      inputs: [{ id: 'in_act', name: 'action', type: 'flow' }], outputs: [], includeInBuild: true,
    },
    {
      id: 'unselected_native_ui', type: 'action', label: 'Unselected Action', xmlTag: 'show_help', x: 470, y: 380,
      properties: { custom: "'not selected'" }, propertiesSchema: [],
      inputs: [{ id: 'in_act', name: 'action', type: 'flow' }], outputs: [], includeInBuild: true,
    },
  ];
  workspace.links = [{
    id: 'native_ui_link', sourceNodeId: 'cue_native_ui', sourcePortId: 'out_act',
    targetNodeId: 'action_native_ui', targetPortId: 'in_act',
  }];
  await seedServerWorkspace(workspace);
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('x4_mod_studio_workspace');
      localStorage.removeItem('x4_mod_studio_version');
    } catch {
      // The top-level about:blank document has no storage; the Forge iframe does.
    }
  });
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <iframe id="forge" src="${E2E_WEB_ORIGIN}/" style="border:0;width:1600px;height:1000px"></iframe>
    <script>
      window.__nativeMessages = [];
      window.addEventListener('message', event => {
        if (event.data && event.data.source === 'x4forge-studio' && event.data.type === 'open-node-selection') {
          window.__nativeMessages.push(event.data);
        }
      });
    </script>
  </body></html>`);

  const forge = page.frameLocator('#forge');
  await expect(forge.getByTestId('canvas-node-cue_native_ui')).toBeVisible({ timeout: 30_000 });
  await expect(forge.getByTestId('canvas-node-action_native_ui')).toBeVisible({ timeout: 30_000 });
  await forge.getByTestId('canvas-node-cue_native_ui').click();
  await expect.poll(() => page.evaluate(() => (window as any).__nativeMessages.at(-1)?.nodeIds))
    .toEqual(['cue_native_ui']);
  await forge.getByTestId('canvas-node-action_native_ui').click({ modifiers: ['Control'] });

  await expect.poll(() => page.evaluate(() => (window as any).__nativeMessages.at(-1)))
    .toMatchObject({ nodeIds: ['cue_native_ui', 'action_native_ui'], readOnly: false });
  const latest = await page.evaluate(() => (window as any).__nativeMessages.at(-1)) as { content: string; nodeIds: string[] };
  expect(latest.content.match(/x4forge-node:/g)).toHaveLength(2);
  expect(latest.content).toContain('x4forge-node:cue_native_ui');
  expect(latest.content).toContain('x4forge-node:action_native_ui');
  expect(latest.content).toContain('<cue name="Native_Cue"');
  expect(latest.content).toContain('<reward_player money="250"');
  expect(latest.content).not.toContain('not selected');
});
