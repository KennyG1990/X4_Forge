import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { E2E_API_ORIGIN, E2E_TOKEN, E2E_STATE_DIR, E2E_RUNTIME, E2E_WEB_ORIGIN } from '../../playwright.config';
import { ActionReceiptStore } from '../../src/lib/actionReceiptStore';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';

test.use({ extraHTTPHeaders: { Authorization: `Bearer ${E2E_TOKEN}` } });

const project = { id: 'folder_alias', name: 'Validation trust', files: [
  { path: 'content.xml', kind: 'content', content: '<content id="trust_fixture" name="Fixture" version="100"/>' },
  { path: 'ui/main.lua', kind: 'lua', content: 'local valid = true' },
] };

test('validation API binds exact source and distinguishes unavailable coverage from mod errors', async ({ request }, testInfo) => {
  const validate = async (subject: typeof project) => {
    const response = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data: { project: subject, detail: 'full' } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const valid = await validate(project);
  expect(valid.modId).toBe('trust_fixture');
  expect(valid.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(valid.evidence.hashScope).toBe('project-validation-inputs-v1');
  const changed = await validate({ ...project, files: project.files.map(f => ({ ...f, content: f.content + '\n' })) });
  expect(changed.sourceHash).not.toBe(valid.sourceHash);
  const broken = await validate({ ...project, files: [project.files[0], { path: 'ui/bad.lua', kind: 'lua', content: 'local x = )' }] });
  expect(broken.ok).toBe(false);
  expect(broken.evidence.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'lua.syntax_error', category: 'mod-finding', findingId: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    expect.objectContaining({ code: 'validation.lua_ast_unavailable', category: 'check-unavailable' }),
  ]));
  expect(broken.evidence.coverage.complete).toBe(false);
  await testInfo.attach('validation-evidence', { body: JSON.stringify({ valid, broken }, null, 2), contentType: 'application/json' });
});

test('malformed or ambiguous validation subjects never return a successful empty result', async ({ request }) => {
  for (const data of [
    { project: null }, { project: { ...project, files: [null] } },
    { project, path: 'different_mod' }, { project, fromPath: 12 },
    { project: { ...project, files: [{ path: 'ui/a.lua', content: 10 }] } },
    { project: { ...project, files: [{ path: 'ui/a.lua' }, { path: 'UI/A.LUA' }] } },
  ]) {
    const response = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data });
    expect(response.status(), await response.text()).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code: 'PROJECT_INPUT_INVALID', category: 'request-invalid', modId: null, sourceHash: null, sourceHashScope: 'unresolved' });
  }
});

test('ware reference native aliases preserve findings, guarded writes and committed receipts', async ({ request }, testInfo) => {
  test.setTimeout(180_000);
  const headers = await ephemeralWorkspaceHeaders(true);
  let deployHeaders = headers;
  const evidence: unknown[] = [{ runtime: E2E_RUNTIME }];
  const post = async (route: string, body: unknown, operationId?: string) => {
    const response = await request.post(E2E_API_ORIGIN + route, { headers: {
      ...(route === '/api/agent/deploy' || route === '/api/agent/deploy-verify' ? deployHeaders : headers),
      ...(operationId ? { 'x-forge-operation-id': operationId } : {}),
    }, data: body });
    const data = await response.json();
    evidence.push({ route, status: response.status(), operationId,
      data: route === '/api/schema/config' ? { saved: data.saved, code: data.code }
        : route === '/api/agent/keys' ? { id: data.record?.id, scope: data.record?.scope, code: data.code } : data });
    return { status: response.status(), data };
  };
  const id = 'forge_ware64_native';
  const root = path.join(E2E_STATE_DIR, `ware-reference-native-${testInfo.retry}`);
  const mods = path.join(root, 'mods'), source = path.join(mods, id), game = path.join(root, 'game');
  const target = path.join(game, 'extensions', id);
  expect(fs.existsSync(root)).toBe(false);
  fs.mkdirSync(path.join(source, 'ui'), { recursive: true });
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(path.join(game, 'X4.exe'), 'Inert test marker; never executed.');
  const reported = 'local ware = namedSupplyWare(rows, text)\nif active(c) and (not ware or c.ware == ware.ware) then end\nlocal label = ware.wname';
  const files = {
    'content.xml': `<content id="${id}" name="Ware reference native control" version="100"/>`,
    'ui.xml': `<addon name="${id}"><environment type="menus"><dependency name="ego_detailmonitor"/><file name="ui/ware64.lua"/></environment></addon>`,
    'ui/ware64.lua': reported,
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(source, name), content);
  const lua = path.join(source, 'ui', 'ware64.lua');
  const beforeResponse = await request.get(`${E2E_API_ORIGIN}/api/schema/config`, { headers });
  expect(beforeResponse.status()).toBe(200);
  const before = await beforeResponse.json();
  const restore = Object.fromEntries(['x4GamePath', 'modWorkspacePath', 'filesystemPath', 'deployFormat']
    .map(key => [key, before.config?.[key] || (key === 'deployFormat' ? 'loose' : '')]));
  const routes = ['/api/agent/deploy', '/api/agent/deploy-verify'];
  const subject = { path: id, root: 'workspace', deployFormat: 'loose', autoReimport: true };
  const identity = (value: { modId: string; sourceHash: string; artifactHash: string; bindingHash: string; targetFingerprint: string }) => ({
    expectedModId: value.modId, expectedSourceHash: value.sourceHash, expectedArtifactHash: value.artifactHash,
    expectedBindingHash: value.bindingHash, expectedTargetFingerprint: value.targetFingerprint,
  });
  type Finding = { code: string; filePath: string; line: number; column: number; severity: string };
  const ware = (findings: Finding[]) => findings.filter(finding => finding.code === 'reference.unknown_ware');
  const position = (finding: Finding) => [finding.filePath, finding.line, finding.column, finding.severity];
  const operationId = () => `forge_op_${randomBytes(16).toString('hex')}`;
  const receiptStore = new ActionReceiptStore({ root: path.join(E2E_STATE_DIR, 'data', 'action-receipts') });
  try {
    const configured = await post('/api/schema/config', { modWorkspacePath: mods, filesystemPath: path.join(game, 'extensions'), x4GamePath: game, deployFormat: 'loose' });
    expect(configured.status, JSON.stringify(configured.data)).toBe(200);
    // An inherited game-path override must fail before any deploy request.
    expect(path.resolve(configured.data.resolved.x4GamePath)).toBe(game);
    expect(path.resolve(configured.data.resolved.modWorkspacePath)).toBe(mods);
    const imported = await post('/api/agent/mod-folder/import', { root: 'workspace', path: id });
    expect(imported.status, JSON.stringify(imported.data)).toBe(200);
    expect(imported.data.success).toBe(true);
    await seedServerWorkspace(imported.data.workspace);
    const key = await post('/api/agent/keys', { label: 'Isolated ware native regression', scope: 'deploy', ttl: '1h',
      workspaceId: headers['x-workspace-id'], clientId: headers['x-client-id'] });
    expect(key.status, JSON.stringify({ code: key.data.code, error: key.data.error })).toBe(200);
    expect(typeof key.data.token).toBe('string');
    deployHeaders = { ...headers, Authorization: `Bearer ${key.data.token}` };
    const benignBindings = [];
    for (const variant of [
      { name: 'reported-table-fields', lua: reported, count: 0 },
      { name: 'genuine-unknown-id', lua: 'local name = GetWareData("notaware", "name")', count: 1 },
      { name: 'canonical-id', lua: 'local name = GetWareData("energycells", "name")', count: 0 },
    ]) {
      fs.writeFileSync(lua, variant.lua);
      const full = await post('/api/agent/project/validate', { fromPath: id, root: 'workspace', detail: 'full' });
      expect(full.status).toBe(200);
      expect(full.data.references.available).toBe(true);
      const findings = ware(full.data.references.findings);
      expect(findings, variant.name).toHaveLength(variant.count);
      const problems = await post('/api/agent/project/validate/check', { fromPath: id, root: 'workspace' });
      expect(problems.status).toBe(200);
      expect(ware(problems.data.flat).map(position)).toEqual(findings.map(position));
      for (const route of routes) {
        const preview = await post(route, { ...subject, dryRun: true });
        expect(preview.status, JSON.stringify(preview.data)).toBe(200);
        expect(preview.data.modId).toBe(id);
        expect(preview.data.sourceHash).toBe(full.data.sourceHash);
        expect(ware(preview.data.validation.evidence.findings).map(position)).toEqual(findings.map(position));
        expect(preview.data.validation.evidence.coverage.complete).toBe(false);
        expect(fs.existsSync(target)).toBe(false);
        if (variant.count) expect(findings[0]).toMatchObject({ filePath: 'ui/ware64.lua', line: 1, column: 27, severity: 'warning' });
        if (variant.name === 'reported-table-fields') benignBindings.push({ route, binding: identity(preview.data) });
      }
    }
    fs.writeFileSync(lua, 'local name = GetWareData("notaware", "name")');
    for (const { route, binding } of benignBindings) {
      const operation = operationId();
      const stale = await post(route, { ...subject, ...binding }, operation);
      expect(stale.status, JSON.stringify(stale.data)).toBe(409);
      expect(stale.data).toMatchObject({ code: 'DEPLOY_IDENTITY_MISMATCH', deployment: { writeAttempted: false } });
      expect(stale.data.identityMismatch.mismatched).toContain('expectedSourceHash');
      expect(fs.existsSync(target)).toBe(false);
      const status = await request.get(`${E2E_API_ORIGIN}/api/agent/status?deployOperationId=${operation}`, { headers: deployHeaders });
      const body = await status.json();
      evidence.push({ operation, status: status.status(), data: body });
      expect(status.status()).toBe(404);
      expect(body.code).toBe('DEPLOY_OPERATION_NOT_FOUND');
    }
    fs.writeFileSync(lua, reported);
    const absentPreview = await post(routes[0], { ...subject, dryRun: true });
    expect(absentPreview.data.targetFingerprint).toBe('absent');
    fs.mkdirSync(target, { recursive: true });
    const intruder = path.join(target, 'unreviewed.txt');
    fs.writeFileSync(intruder, 'Preserve external scratch change.');
    try {
      for (const route of routes) {
        const changed = await post(route, { ...subject, ...identity(absentPreview.data) }, operationId());
        expect(changed.status, JSON.stringify(changed.data)).toBe(409);
        expect(changed.data).toMatchObject({ code: 'DEPLOY_TARGET_CHANGED', deployment: { writeAttempted: false } });
        expect(fs.readdirSync(target)).toEqual(['unreviewed.txt']);
        expect(fs.readFileSync(intruder, 'utf8')).toBe('Preserve external scratch change.');
      }
    } finally {
      fs.unlinkSync(intruder);
      fs.rmdirSync(target);
    }
    for (const route of routes) {
      const preview = await post(route, { ...subject, dryRun: true });
      expect(preview.data.ok, JSON.stringify(preview.data)).toBe(true);
      const operation = operationId();
      const body = { ...subject, ...identity(preview.data) };
      const applied = await post(route, body, operation);
      expect(applied.status, JSON.stringify(applied.data)).toBe(200);
      expect(applied.data.ok, JSON.stringify(applied.data)).toBe(true);
      expect(applied.data.validation.clean).toBe(false);
      expect(applied.data.baselinePromotion.recorded).toBe(false);
      for (const [name, content] of Object.entries(files)) expect(fs.readFileSync(path.join(target, name), 'utf8')).toBe(content);
      const receipt = receiptStore.read(applied.data.deployRecord.id);
      expect(receipt.status).toBe('committed');
      expect(receipt.hash).toBe(applied.data.deployRecord.hash);
      expect(receipt.validation.code).toBe('DEPLOYED_BYTES_VERIFIED');
      expect(receipt.metadata?.artifactHash).toBe(preview.data.artifactHash);
      expect(receipt.actor.id).toBe(key.data.record.id);
      const status = await request.get(`${E2E_API_ORIGIN}/api/agent/status?deployOperationId=${operation}`, { headers: deployHeaders });
      const recovered = await status.json();
      evidence.push({ operation, status: status.status(), data: recovered, reopenedReceipt: receipt });
      expect(status.status()).toBe(200);
      expect(recovered).toMatchObject({ outcome: 'committed', receipt: { id: receipt.id, hash: receipt.hash } });
      const replay = await post(route, body, operation);
      expect(replay.status).toBe(409);
      expect(replay.data).toMatchObject({ code: 'DEPLOY_OPERATION_ALREADY_RECORDED', deployment: { writeAttempted: false } });
      for (const [name, content] of Object.entries(files)) expect(fs.readFileSync(path.join(target, name), 'utf8')).toBe(content);
    }
  } finally {
    try { expect((await post('/api/schema/config', restore)).status).toBe(200); }
    finally {
      fs.mkdirSync(testInfo.outputDir, { recursive: true });
      const artifact = testInfo.outputPath('ware-reference-native-evidence.json');
      fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2) + '\n');
      await testInfo.attach('ware-reference-native-evidence', { path: artifact, contentType: 'application/json' });
    }
  }
});

test('incomplete source cannot become a last-green baseline', async ({ request }) => {
  const data = { project: { ...project, files: [...project.files, { path: 'md/missing.xml', kind: 'md' }] }, recordBaseline: true };
  const response = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data });
  expect(response.status(), await response.text()).toBe(409);
  const body = await response.json();
  expect(body.evidence.coverage.complete).toBe(false);
  expect(body.baselinePromotion.recorded).toBe(false);
  expect(body.code).toBe('VALIDATION_BASELINE_RECORD_FAILED');
});

test('ware diagnostics render actual validation results in the selected product mode', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const evidence: unknown[] = [{ runtime: E2E_RUNTIME }];
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  try {
    for (const variant of [
      { name: 'table-fields', lua: 'local ware = {}\nlocal a, b = ware.ware, ware.wname', count: 0 },
      { name: 'genuine-id', lua: 'local name = GetWareData("notaware", "name")', count: 1 },
    ]) {
      const workspace = buildTemplateWorkspace('welcome');
      workspace.passthroughFiles = [
        { path: 'ui.xml', content: '<addon name="ware_rendered"><environment type="menus"><file name="ui/ware64.lua"/></environment></addon>' },
        { path: 'ui/ware64.lua', content: variant.lua },
      ];
      await seedServerWorkspace(workspace);
      // Close each previous client before the next server-side seed: an open
      // client is allowed to retain its own draft rather than adopt that seed.
      const context = await browser.newContext({ baseURL: E2E_WEB_ORIGIN, viewport: { width: 1440, height: 1000 },
        extraHTTPHeaders: { Authorization: `Bearer ${E2E_TOKEN}` } });
      try {
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('x4_forge_experience_mode', 'expert'));
      const compiled = page.waitForResponse(response => {
        if (!response.url().endsWith('/api/agent/compile') || response.request().method() !== 'POST') return false;
        const body = response.request().postDataJSON();
        return body?.workspace?.passthroughFiles?.some((file: { path: string; content: string }) =>
          file.path === 'ui/ware64.lua' && file.content === variant.lua) === true;
      });
      await page.goto('/');
      await expect(page.getByTestId('readiness-ladder')).toBeVisible();
      const response = await compiled;
      expect(response.status()).toBe(200);
      const validation = await response.json();
      evidence.push({ name: variant.name, validation });
      expect(validation.files['ui/ware64.lua']).toBe(variant.lua);
      expect(validation.validation.scope).toBe('full-project');
      expect(validation.validation.availability.references).toBe(true);
      const findings = validation.diagnostics.filter((finding: { code: string }) => finding.code === 'reference.unknown_ware');
      expect(findings).toHaveLength(variant.count);
      await page.locator('[data-sidebar-tab="diagnostics"]').click();
      await page.getByTestId('diagnostics-scope-package').click();
      await expect(page.getByText('FULL PROJECT · LIVE', { exact: true })).toBeVisible();
      const why = page.getByTestId('diagnostic-why-reference.unknown_ware');
      await expect(why).toHaveCount(variant.count);
      if (variant.count) {
        expect(findings[0]).toMatchObject({ filePath: 'ui/ware64.lua', line: 1, column: 27, severity: 'warning' });
        const message = page.getByText(findings[0].message, { exact: true });
        await message.scrollIntoViewIfNeeded();
        await expect(message).toBeVisible();
        await expect(message.locator('xpath=..').getByText('ui/ware64.lua', { exact: true })).toBeVisible();
      }
      if (E2E_RUNTIME.mode === 'compiled') {
        const src = await page.locator('script[type="module"][src]').first().getAttribute('src');
        expect(src).toMatch(/^\/assets\/[a-zA-Z0-9_-]+\.js$/);
        const asset = await page.request.get(src!);
        expect(asset.status()).toBe(200);
        expect(await asset.body()).toEqual(fs.readFileSync(path.join(process.cwd(), 'dist', src!.slice(1))));
        expect(await page.content()).not.toContain('/@vite/client');
        evidence.push({ name: variant.name, compiledAsset: src });
      }
      await page.screenshot({ path: testInfo.outputPath(`ware-diagnostics-${variant.name}.png`), fullPage: true });
      } finally { await context.close(); }
    }
  } finally {
    const artifact = testInfo.outputPath('ware-reference-rendered-evidence.json');
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2) + '\n');
    await testInfo.attach('ware-reference-rendered-evidence', { path: artifact, contentType: 'application/json' });
  }
});

test('ware reference API and Problems distinguish table fields from actual ids', async ({ request }, testInfo) => {
  const variants = [
    { name: 'reported-table-fields', lua: 'local ware = namedSupplyWare(rows, text)\nif active(c) and (not ware or c.ware == ware.ware) then end\nlocal label = ware.wname', ids: [] },
    { name: 'genuine-unknown-id', lua: 'local name = GetWareData("notaware", "name")', ids: ['notaware'] },
    { name: 'canonical-id', lua: 'local name = GetWareData("energycells", "name")', ids: [] },
  ];
  const evidence: unknown[] = [];
  try {
  for (const variant of variants) {
    const subject = { id: 'forge_ware64', name: 'Ware reference control', files: [
      { path: 'content.xml', kind: 'content', content: '<content id="forge_ware64" name="Ware reference control" version="100"/>' },
      { path: 'ui.xml', kind: 'ui', content: '<addon name="forge_ware64"><environment type="menus"><dependency name="ego_detailmonitor"/><file name="ui/ware64.lua"/></environment></addon>' },
      { path: 'ui/ware64.lua', kind: 'lua', content: variant.lua },
    ] };
    const fullResponse = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate`, { data: { project: subject, detail: 'full' } });
    expect(fullResponse.status(), await fullResponse.text()).toBe(200);
    const full = await fullResponse.json();
    expect(full.modId).toBe('forge_ware64');
    expect(full.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(full.references.available).toBe(true);
    const findings = full.references.findings.filter((finding: { code: string }) => finding.code === 'reference.unknown_ware');
    expect(findings.map((finding: { id: string }) => finding.id), variant.name).toEqual(variant.ids);
    const problemsResponse = await request.post(`${E2E_API_ORIGIN}/api/agent/project/validate/check`, { data: { project: subject } });
    expect(problemsResponse.status(), await problemsResponse.text()).toBe(200);
    const problems = await problemsResponse.json();
    const flat = problems.flat.filter((finding: { code: string }) => finding.code === 'reference.unknown_ware');
    const position = (finding: { filePath: string; line: number; column: number; severity: string }) =>
      [finding.filePath, finding.line, finding.column, finding.severity];
    expect(flat.map(position), variant.name).toEqual(findings.map(position));
    if (variant.ids.length) expect(findings[0]).toMatchObject({ filePath: 'ui/ware64.lua', line: 1, column: 27, severity: 'warning' });
    // Fixing a reference false positive cannot certify arbitrary UI execution.
    expect(full.evidence.coverage.complete).toBe(false);
    expect(full.evidence.checkUnavailableCount).toBeGreaterThan(0);
    evidence.push({ name: variant.name, subject, full, problems });
  }
  } finally {
    // The runner retires its temporary JSON report, including body-only
    // attachments. Keep one real test artifact for subsequent proof review.
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    const artifact = testInfo.outputPath('ware-reference-api-evidence.json');
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2) + '\n');
    await testInfo.attach('ware-reference-api-evidence', { path: artifact, contentType: 'application/json' });
  }
});
