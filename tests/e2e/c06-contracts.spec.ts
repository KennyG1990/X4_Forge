import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { E2E_API_ORIGIN } from '../../playwright.config';
import { ACTION_OPERATION_ID_HEADER, createActionOperationId } from '../../shared/actionOperationId';
import { canonicalWorkspaceContentString } from '../../src/lib/workspaceIdentity';
import { toSafeModId } from '../../src/lib/modCompiler';
import { inspectWorkshopPreview } from '../../src/lib/platformRelease';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';

test.describe.configure({ mode: 'serial' });

test('C06b addressed workspace, diagnostic and release contracts use truthful identities', async ({ request, page }) => {
  test.setTimeout(600_000);
  const out = path.resolve('test-results/claude-C06b', `run-${randomUUID()}`);
  fs.mkdirSync(out, { recursive: true });
  const headers = await ephemeralWorkspaceHeaders(true);
  const checks: string[] = [];
  const calls: any[] = [];
  const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
  const fileSha = (filename: string) => sha(fs.readFileSync(filename));
  const record = (route: string, status: number, data: any) => {
    const item = { route, status, data };
    calls.push(item);
    fs.writeFileSync(path.join(out, `${String(calls.length).padStart(3, '0')}-${route.split('?')[0].split('/').pop()}.json`), JSON.stringify(item, null, 2));
    return item;
  };
  const post = async (route: string, body: unknown, customHeaders = headers) => {
    const response = await request.post(E2E_API_ORIGIN + route, {
      headers: { ...customHeaders, [ACTION_OPERATION_ID_HEADER]: createActionOperationId(randomBytes), Connection: 'close' },
      data: body,
    });
    return record(route, response.status(), await response.json());
  };
  const get = async (route: string, customHeaders = headers) => {
    const response = await request.get(E2E_API_ORIGIN + route, { headers: { ...customHeaders, Connection: 'close' } });
    return record(route, response.status(), await response.json());
  };
  const assertHead = (data: any, modId: string, head?: string) => {
    expect(data.modId).toBe(modId);
    expect(data.sourceHashScope).toBe('workspace-head');
    expect(data.sourceHash).toBe(head ?? data.workspaceHash ?? data.head);
    expect(data.sourceHash).toMatch(/^[a-f0-9]{16}$/);
  };
  const assertUnresolved = (data: any) => {
    expect(data.sourceHash).toBeNull();
    expect(data.sourceHashScope).toBe('unresolved');
  };
  const workspaceState = (data: any) => ({ workspaceId: data.workspaceId, workspace: data.workspace, version: data.version, workspaceHash: data.workspaceHash, snapshotHash: data.snapshotHash });
  const inventory = (root: string): Record<string, string> => {
    if (!fs.existsSync(root)) return {};
    const found: Record<string, string> = {};
    const walk = (folder: string) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const filename = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(filename);
        else if (entry.isFile()) found[path.relative(root, filename).replace(/\\/g, '/')] = fileSha(filename);
        else throw new Error(`Unexpected non-regular scratch entry: ${filename}`);
      }
    };
    walk(root);
    return found;
  };

  // Every filesystem mutation belongs to this run. X4.exe is an inert marker, never executed.
  const project = JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json', 'utf8'));
  const modId = project.id as string;
  const otherId = 'forge_c06_other';
  const copyFolder = 'forge_c06_copy';
  const mods = path.join(out, 'mods');
  const source = path.join(mods, modId);
  const game = path.join(out, 'game');
  const logPath = path.join(out, 'fixture-debuglog.txt');
  fs.writeFileSync(logPath, '[C06b] Isolated log fixture. No running game evidence.\n');
  fs.mkdirSync(path.join(game, 'extensions'), { recursive: true });
  fs.writeFileSync(path.join(game, 'X4.exe'), 'Inert C06b fixture. Never execute.');
  project.files.find((file: any) => file.path === 'content.xml').content =
    `<?xml version="1.0"?><content id="${modId}" name="C06 Contract Display" author="Codex" description="C06b isolated regression fixture" version="100" save="0"/>`;
  project.files.find((file: any) => file.path.startsWith('md/')).content =
    '<mdscript name="Lab"><cues><cue name="Init"><actions><debug_text text="0"/></actions></cue></cues></mdscript>';
  for (const [folder, id] of [[modId, modId], [otherId, otherId], [copyFolder, modId]]) {
    for (const file of project.files) {
      const filename = path.join(mods, folder, file.path);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, file.path === 'content.xml' ? file.content.replace(`id="${modId}"`, `id="${id}"`) : file.content);
    }
    // Reuse scripts/route-integration.mjs's CRC-verified PNG; dimensions may warn.
    const previewPath = path.join(mods, folder, 'preview.png');
    fs.writeFileSync(previewPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    expect(inspectWorkshopPreview(previewPath)).toMatchObject({ ok: true, format: 'png', width: 1, height: 1, errors: [] });
  }
  expect((await post('/api/schema/config', { modWorkspacePath: mods, filesystemPath: path.join(game, 'extensions'), x4GamePath: game, x4LogPath: logPath })).status).toBe(200);
  const imported = await post('/api/agent/mod-folder/import', { root: 'workspace', path: modId });
  expect(imported.status, JSON.stringify(imported)).toBe(200);
  const importedOther = await post('/api/agent/mod-folder/import', { root: 'workspace', path: otherId });
  expect(importedOther.status, JSON.stringify(importedOther)).toBe(200);
  await seedServerWorkspace(imported.data.workspace);
  const originalSource = inventory(source);
  const created = await post('/api/agent/workspaces', { workspace: importedOther.data.workspace });
  expect(created.status, JSON.stringify(created)).toBe(201);
  expect(created.data.receipt.status).toBe('committed');
  const otherHeaders = { ...headers, 'x-workspace-id': created.data.workspaceId };
  let current = await get('/api/agent/workspace');
  const second = await get('/api/agent/workspace', otherHeaders);
  assertHead(current.data, modId);
  assertHead(created.data, otherId, second.data.workspaceHash);
  assertHead(second.data, otherId);

  await test.step('workspace collection, bootstrap, restore and preview preserve addressed identity', async () => {
    const list = await get('/api/agent/workspaces');
    expect(list.data.modId).toBeNull();
    expect(list.data.sourceHash).toBeNull();
    expect(list.data.environment.scope).toBe('workspace-collection');
    for (const [workspace, id] of [[current, modId], [second, otherId]] as const) {
      const row = list.data.workspaces.find((item: any) => item.workspaceId === workspace.data.workspaceId);
      assertHead(row, id, workspace.data.workspaceHash);
    }
    const conflictingBootstrap = await post('/api/agent/workspaces/bootstrap', { workspaceId: second.data.workspaceId });
    expect(conflictingBootstrap.status, JSON.stringify(conflictingBootstrap)).toBe(400);
    expect(conflictingBootstrap.data.code).toBe('WORKSPACE_ID_CONFLICT');
    const bootstrap = await post('/api/agent/workspaces/bootstrap', { workspaceId: second.data.workspaceId }, otherHeaders);
    expect(bootstrap.status, JSON.stringify(bootstrap)).toBe(200);
    assertHead(bootstrap.data, otherId, second.data.workspaceHash);
    const parked = await get('/api/agent/workspace/parked');
    expect(parked.data.environment.scope).toBe('workspace-collection');
    assertHead(parked.data.parked.find((row: any) => row.workspaceId === second.data.workspaceId), otherId, second.data.workspaceHash);
    const restored = await post('/api/agent/workspace/restore-parked', { targetWorkspaceId: second.data.workspaceId });
    expect(restored.status, JSON.stringify(restored)).toBe(200);
    assertHead(restored.data, otherId, second.data.workspaceHash);
    expect(workspaceState((await get('/api/agent/workspace')).data)).toEqual(workspaceState(current.data));

    const preview = await post('/api/agent/workspace/merge', {
      changes: { description: 'Preview only C06b' }, expectedHead: current.data.workspaceHash,
      expectedSnapshotHash: current.data.snapshotHash, dryRun: true,
    });
    expect(preview.status, JSON.stringify(preview)).toBe(200);
    expect(preview.data.applied).toBe(false);
    expect(preview.data.modId).toBe(modId);
    expect(preview.data.sourceHashScope).toBe('workspace-content-sha256-v1');
    expect(preview.data.sourceHash).toBe(sha(canonicalWorkspaceContentString(preview.data.previewWorkspace)));
    expect(preview.data.sourceHash).not.toBe(sha(canonicalWorkspaceContentString(current.data.workspace)));
    assertHead(preview.data.currentSource, modId, current.data.workspaceHash);
    expect(workspaceState((await get('/api/agent/workspace')).data)).toEqual(workspaceState(current.data));
    checks.push('collection-per-row-bootstrap-restore-two-mod-preview-identities');
  });

  await test.step('malformed workspace writes retain failed receipts and change no state', async () => {
    for (const [route, body] of [
      ['/api/agent/workspace', {}],
      ['/api/agent/workspace', { workspace: [], force: true }],
      ['/api/agent/workspace', { workspace: current.data.workspace, force: 'true' }],
      ['/api/agent/workspace', { workspace: current.data.workspace, force: true, unexpected: true }],
      ['/api/agent/workspace/merge', { changes: [], force: true }],
      ['/api/agent/workspace/merge', { changes: { description: 42 }, force: true }],
      ['/api/agent/workspace/merge', { changes: { description: 'bad' }, expectedVersion: '1' }],
    ] as const) {
      const result = await post(route, body);
      expect(result.status, JSON.stringify(result)).toBe(400);
      expect(result.data.receipt?.status, JSON.stringify(result)).toBe('failed');
      if (route === '/api/agent/workspace' && Object.keys(body).length === 0) expect(result.data.error).toBe("Missing required 'workspace' body parameter.");
      expect(workspaceState((await get('/api/agent/workspace')).data)).toEqual(workspaceState(current.data));
    }
    const beforeRows = (await get('/api/agent/workspaces')).data.workspaces;
    for (const [route, body] of [
      ['/api/agent/workspaces', { name: 42 }], ['/api/agent/workspaces', { name: 'bad', ignored: true }],
      ['/api/agent/workspaces/bootstrap', { workspaceId: [current.data.workspaceId] }],
      ['/api/agent/workspaces/bootstrap', { workspaceId: current.data.workspaceId, ignored: true }],
      ['/api/agent/workspace/restore-parked', { targetWorkspaceId: [second.data.workspaceId] }],
      ['/api/agent/workspace/restore-parked', { targetWorkspaceId: second.data.workspaceId, ignored: true }],
    ] as const) expect((await post(route, body)).status).toBe(400);
    expect((await get('/api/agent/workspaces')).data.workspaces).toEqual(beforeRows);
    for (const route of ['/api/agent/workspaces', '/api/agent/workspace', '/api/agent/workspace/parked', '/api/agent/diagnostics']) {
      expect((await get(`${route}?ignored=true`)).status).toBe(400);
    }
    const changed = await post('/api/agent/workspace/merge', {
      changes: { description: 'C06b committed scratch description' }, expectedHead: current.data.workspaceHash,
      expectedSnapshotHash: current.data.snapshotHash,
    });
    expect(changed.status, JSON.stringify(changed)).toBe(200);
    const next = await get('/api/agent/workspace');
    assertHead(changed.data, modId, next.data.workspaceHash);
    expect(next.data.workspaceHash).not.toBe(current.data.workspaceHash);
    const stale = await post('/api/agent/workspace/merge', {
      changes: { description: 'Must not win' }, expectedHead: current.data.workspaceHash,
      expectedSnapshotHash: current.data.snapshotHash,
    });
    expect(stale.status).toBe(409);
    expect(stale.data.receipt.status).toBe('failed');
    assertHead(stale.data, modId, next.data.workspaceHash);
    expect(workspaceState((await get('/api/agent/workspace')).data)).toEqual(workspaceState(next.data));
    const replaced = await post('/api/agent/workspace', {
      workspace: imported.data.workspace, expectedHead: next.data.workspaceHash, expectedSnapshotHash: next.data.snapshotHash,
    });
    expect(replaced.status, JSON.stringify(replaced)).toBe(200);
    current = await get('/api/agent/workspace');
    assertHead(replaced.data, modId, current.data.workspaceHash);
    expect(workspaceState((await get('/api/agent/workspace', otherHeaders)).data)).toEqual(workspaceState(second.data));
    expect(inventory(source)).toEqual(originalSource);
    checks.push('strict-workspace-inputs-failed-receipts-cas-refusal-recovery-no-source-write');
  });

  await test.step('runtime diagnostics and pasted traces state their distinct evidence scope', async () => {
    for (const route of ['/api/agent/runtime-debugger', '/api/agent/debug-watcher/brief', '/api/agent/diagnostics', '/api/agent/readiness']) {
      const result = await get(route);
      expect(result.status, JSON.stringify(result)).toBe(200);
      assertHead(result.data, modId, current.data.workspaceHash);
      const other = await get(route, otherHeaders);
      assertHead(other.data, otherId, second.data.workspaceHash);
    }
    const legacy = await get(`/api/agent/debug-watcher/brief?modId=${modId}&expect=Init`);
    expect(legacy.status).toBe(200);
    assertHead(legacy.data, modId, current.data.workspaceHash);
    const displayAlias = toSafeModId(current.data.workspace.name);
    expect(displayAlias).not.toBe(modId);
    const legacyDisplay = await get(`/api/agent/debug-watcher/brief?modId=${encodeURIComponent(displayAlias)}`);
    expect(legacyDisplay.status, JSON.stringify(legacyDisplay)).toBe(200);
    assertHead(legacyDisplay.data, modId, current.data.workspaceHash);
    const mismatch = await get(`/api/agent/debug-watcher/brief?modId=${otherId}`);
    expect(mismatch.status).toBeGreaterThanOrEqual(400);
    expect(mismatch.data.modId).not.toBe(otherId);
    for (const route of ['/api/agent/runtime-debugger', '/api/agent/debug-watcher/brief']) {
      for (const query of ['ignored=true', 'expect=Init&expect=Other', `expect=${'a'.repeat(257)}`]) {
        expect((await get(`${route}?${query}`)).status).toBe(400);
      }
    }
    expect((await get(`/api/agent/runtime-debugger?modId=${modId}`)).status).toBe(400);
    for (const result of [await get('/api/agent/runtime-control'), await post('/api/agent/runtime-control/preview', {})]) {
      expect(result.status, JSON.stringify(result)).toBe(200);
      assertHead(result.data, modId, current.data.workspaceHash);
    }
    expect((await get('/api/agent/runtime-control?ignored=true')).status).toBe(400);
    const copyImport = await post('/api/agent/mod-folder/import', { root: 'workspace', path: copyFolder });
    expect(copyImport.status, JSON.stringify(copyImport)).toBe(200);
    const copyCreated = await post('/api/agent/workspaces', { workspace: copyImport.data.workspace });
    expect(copyCreated.status, JSON.stringify(copyCreated)).toBe(201);
    const copyHeaders = { ...headers, 'x-workspace-id': copyCreated.data.workspaceId };
    const copyCurrent = await get('/api/agent/workspace', copyHeaders);
    expect(copyCurrent.status, JSON.stringify(copyCurrent)).toBe(200);
    assertHead(copyCurrent.data, modId);
    for (const result of [await get('/api/agent/runtime-control', copyHeaders), await post('/api/agent/runtime-control/preview', {}, copyHeaders)]) {
      expect(result.status, JSON.stringify(result)).toBe(200);
      expect(result.data.modId).toBe(copyFolder);
      expect(result.data.modIdScope).toBe('artifact-folder');
      expect(result.data.sourceHash).toBe(copyCurrent.data.workspaceHash);
      assertHead(result.data.sourceIdentity, modId, copyCurrent.data.workspaceHash);
    }
    expect(workspaceState((await get('/api/agent/workspace')).data)).toEqual(workspaceState(current.data));
    for (const [route, body] of [
      ['/api/agent/runtime-control/preview', { ignored: true }],
      ['/api/agent/log-diagnose', { tail: 123, modId }],
      ['/api/agent/log-diagnose', { tail: '', modId: [modId] }],
      ['/api/agent/log-diagnose', { tail: '', modId, ignored: true }],
    ] as const) expect((await post(route, body)).status).toBe(400);
    const tail = `[C06b fixture] ${modId}: isolated pasted trace\n`;
    const pasted = await post('/api/agent/log-diagnose', { tail, modId });
    expect(pasted.status).toBe(200);
    expect(pasted.data).toMatchObject({ modId, sourceHash: sha(tail), sourceHashScope: 'pasted-log-utf8-sha256-v1', sourceIdentityProvenance: 'caller-supplied-log' });
    const empty = await post('/api/agent/log-diagnose', { tail: '', modId: otherId });
    expect(empty.status).toBe(200);
    expect(empty.data).toMatchObject({ modId: otherId, sourceHash: sha(''), sourceHashScope: 'pasted-log-utf8-sha256-v1' });
    checks.push('addressed-runtime-strict-query-legacy-display-alias-distinct-folder-protocol-pasted-log-provenance');
  });

  const assertRelease = (data: any, id = modId, artifactId = id) => {
    expect(data.validatedSource).toMatchObject({ modId: id, sourceHashScope: 'project-validation-inputs-v1' });
    expect(data.validatedSource.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.preparedSource).toMatchObject({ modId: id, sourceHashScope: 'release-artifact-inputs-v1' });
    expect(data.preparedSource.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.modId).toBe(artifactId);
    expect(data.modIdScope).toBe('artifact-folder');
    expect(data.sourceIdentity).toMatchObject({ modId: id, sourceHash: data.validatedSource.sourceHash, sourceHashScope: 'project-validation-inputs-v1' });
    expect(data.sourceHash).toBe(data.validatedSource.sourceHash);
    expect(data.sourceHashScope).toBe('project-validation-inputs-v1');
  };
  const download = async (platform: 'nexus' | 'steam', artifactPath: string, id = modId) => {
    const response = await request.post(E2E_API_ORIGIN + '/api/agent/release/artifact/download', {
      headers: { ...headers, Connection: 'close' }, data: { platform, modId: id, artifactPath },
    });
    if (!response.ok()) record('/api/agent/release/artifact/download', response.status(), await response.json());
    return response;
  };
  let nexus: any;
  let steam: any;
  await test.step('release preparation records validated bytes separately from prepared bytes', async () => {
    const baseline = inventory(mods);
    for (const [route, body] of [
      ['/api/agent/release/nexus/prepare', { workspace: imported.data.workspace, bump: 'major' }],
      ['/api/agent/package/release', { workspace: imported.data.workspace, ignored: true }],
      ['/api/agent/release/steam/prepare', { workspace: imported.data.workspace, minorUpdate: 'false' }],
      ['/api/agent/release/steam/prepare', { workspace: imported.data.workspace, previewPath: [] }],
      ['/api/agent/release/artifact/download', { platform: 'nexus', modId, artifactPath: [] }],
      ['/api/agent/release/steam/verify', { modId, ignored: true }],
      ['/api/agent/release/steam/adopt', { modId, apply: 'false' }],
    ] as const) expect((await post(route, body)).status).toBe(400);
    expect(inventory(mods)).toEqual(baseline);

    nexus = await post('/api/agent/release/nexus/prepare', { workspace: imported.data.workspace, bump: 'patch' });
    expect(nexus.status, JSON.stringify(nexus)).toBe(200);
    expect(nexus.data.status).toBe('VERIFIED');
    assertRelease(nexus.data);
    expect(nexus.data.validatedSource.sourceHash).not.toBe(nexus.data.preparedSource.sourceHash);
    const report = JSON.parse(fs.readFileSync(nexus.data.reportPath, 'utf8'));
    expect(report.validatedSource).toEqual(nexus.data.validatedSource);
    expect(report.preparedSource).toEqual(nexus.data.preparedSource);
    const binary = await download('nexus', nexus.data.zipPath);
    expect(binary.status()).toBe(200);
    expect(binary.headers()['x-x4-forge-mod-id']).toBe(modId);
    expect(binary.headers()['x-x4-forge-source-hash']).toBe(nexus.data.validatedSource.sourceHash);
    expect(binary.headers()['x-x4-forge-source-scope']).toBe('project-validation-inputs-v1');
    expect(binary.headers()['x-x4-forge-source-provenance']).toBe('recorded-release-report');
    expect(sha(await binary.body())).toBe(nexus.data.sha256);
    const receiptBody = { platform: 'nexus', modId, method: 'browser-save', destination: path.basename(nexus.data.zipPath), artifactPath: nexus.data.zipPath, sha256: nexus.data.sha256, sizeBytes: nexus.data.sizeBytes };
    const exported = await post('/api/agent/release/export/receipt', receiptBody);
    expect(exported.status).toBe(200);
    expect(exported.data.sourceHash).toBe(nexus.data.validatedSource.sourceHash);
    expect(exported.data.sourceHashScope).toBe('project-validation-inputs-v1');
    expect((await post('/api/agent/release/export/receipt', { ...receiptBody, sizeBytes: String(nexus.data.sizeBytes) })).status).toBe(400);
    expect((await post('/api/agent/release/export/receipt', { ...receiptBody, sha256: 'f'.repeat(64) })).status).toBe(409);
    expect((await download('nexus', nexus.data.zipPath, otherId)).status()).toBe(409);

    const copyImport = await post('/api/agent/mod-folder/import', { root: 'workspace', path: copyFolder });
    expect(copyImport.status).toBe(200);
    const copy = await post('/api/agent/package/release', { workspace: copyImport.data.workspace });
    expect(copy.status, JSON.stringify(copy)).toBe(200);
    assertRelease(copy.data, modId, copyFolder);
    const copyDownload = await download('nexus', copy.data.zipPath, copyFolder);
    expect(copyDownload.status()).toBe(200);
    expect(copyDownload.headers()['x-x4-forge-mod-id']).toBe(modId);
    expect(copyDownload.headers()['x-x4-forge-source-hash']).toBe(copy.data.validatedSource.sourceHash);
    expect(copyDownload.headers()['x-x4-forge-source-provenance']).toBe('recorded-release-report');

    steam = await post('/api/agent/release/steam/prepare', { workspace: imported.data.workspace, bump: 'none', minorUpdate: false, previewPath: '', toolPath: '', changeNote: '' });
    expect(steam.status, JSON.stringify(steam)).toBe(200);
    expect(steam.data.status).toBe('PARTIAL');
    expect(steam.data.readyForUpload).toBe(false);
    expect(steam.data.command).toBeNull();
    assertRelease(steam.data);
    const steamReport = JSON.parse(fs.readFileSync(steam.data.reportPath, 'utf8'));
    expect(steamReport.validatedSource).toEqual(steam.data.validatedSource);
    expect(steamReport.preparedSource).toEqual(steam.data.preparedSource);
    const backup = await download('steam', steam.data.backupPath);
    expect(backup.status()).toBe(200);
    expect(backup.headers()['x-x4-forge-source-hash']).toBe(steam.data.validatedSource.sourceHash);
    expect(backup.headers()['x-x4-forge-source-provenance']).toBe('recorded-release-report');
    expect(sha(await backup.body())).toBe(steam.data.backupHash);
    expect(inventory(source)).toEqual(originalSource);
    checks.push('release-prepare-distinct-subjects-persisted-report-binary-export-two-mod-isolation');
  });

  await test.step('stale sources, corrupted artifacts and legacy reports never invent validation proof', async () => {
    const sourceManifest = path.join(source, 'content.xml');
    const manifestBytes = fs.readFileSync(sourceManifest);
    try {
      fs.appendFileSync(sourceManifest, '\n<!-- external scratch edit -->');
      const stale = await post('/api/agent/release/nexus/prepare', { workspace: imported.data.workspace });
      expect(stale.status).toBe(409);
      expect(stale.data.code).toBe('RELEASE_SOURCE_STALE');
    } finally { fs.writeFileSync(sourceManifest, manifestBytes); }

    const zipBytes = fs.readFileSync(nexus.data.zipPath);
    try {
      fs.appendFileSync(nexus.data.zipPath, 'corrupt');
      expect((await download('nexus', nexus.data.zipPath)).status()).toBe(409);
    } finally { fs.writeFileSync(nexus.data.zipPath, zipBytes); }
    const reportBytes = fs.readFileSync(nexus.data.reportPath);
    try {
      const legacy = JSON.parse(reportBytes.toString('utf8'));
      delete legacy.validatedSource;
      delete legacy.preparedSource;
      fs.writeFileSync(nexus.data.reportPath, JSON.stringify(legacy));
      const binary = await download('nexus', nexus.data.zipPath);
      expect(binary.status()).toBe(200);
      expect(binary.headers()['x-x4-forge-source-hash']).toBe('');
      expect(binary.headers()['x-x4-forge-source-scope']).toBe('unresolved');
      const exported = await post('/api/agent/release/export/receipt', { platform: 'nexus', modId, method: 'browser-save', destination: 'legacy.zip', artifactPath: nexus.data.zipPath, sha256: nexus.data.sha256, sizeBytes: nexus.data.sizeBytes });
      expect(exported.status).toBe(200);
      assertUnresolved(exported.data);
      for (const subjectPatch of [{ sourceHash: 'invalid' }, { sourceHashScope: 'not-validation' }, { modId: otherId }]) {
        const malformed = JSON.parse(reportBytes.toString('utf8'));
        Object.assign(malformed.validatedSource, subjectPatch);
        fs.writeFileSync(nexus.data.reportPath, JSON.stringify(malformed));
        const response = await download('nexus', nexus.data.zipPath);
        expect(response.status()).toBe(200);
        expect(response.headers()['x-x4-forge-source-hash']).toBe('');
        expect(response.headers()['x-x4-forge-source-scope']).toBe('unresolved');
      }
      fs.writeFileSync(nexus.data.reportPath, '{broken');
      expect((await download('nexus', nexus.data.zipPath)).status()).toBe(409);
    } finally { fs.writeFileSync(nexus.data.reportPath, reportBytes); }
    expect((await download('nexus', nexus.data.zipPath)).status()).toBe(200);
    const noReport = await post('/api/agent/release/steam/verify', { modId: otherId });
    expect(noReport.status).toBe(404);
    assertUnresolved(noReport.data);
    checks.push('stale-source-artifact-drift-malformed-legacy-missing-report-refusal-and-recovery');
  });

  await test.step('scratch staged metadata verifies and adopts with provenance and source CAS', async () => {
    // This models only Workshop-managed bytes. It does not run WorkshopTool or prove an upload.
    const stagedManifest = path.join(steam.data.targetPath, 'content.xml');
    const sourceManifest = path.join(source, 'content.xml');
    const originalManifest = fs.readFileSync(sourceManifest);
    const originalReport = fs.readFileSync(steam.data.reportPath);
    try {
      const legacy = JSON.parse(originalReport.toString('utf8'));
      delete legacy.validatedSource;
      delete legacy.preparedSource;
      fs.writeFileSync(steam.data.reportPath, JSON.stringify(legacy));
      const legacyVerify = await post('/api/agent/release/steam/verify', { modId });
      expect(legacyVerify.status).toBe(409);
      assertUnresolved(legacyVerify.data);
    } finally { fs.writeFileSync(steam.data.reportPath, originalReport); }
    const missingId = await post('/api/agent/release/steam/verify', { modId });
    expect(missingId.status).toBe(409);
    expect(missingId.data.code).toBe('STEAM_WORKSHOP_ID_MISSING');
    expect(missingId.data.sourceHash).toBe(steam.data.validatedSource.sourceHash);
    const staged = fs.readFileSync(stagedManifest, 'utf8');
    fs.writeFileSync(stagedManifest, staged.replace(/(<content\b[^>]*\bid=")[^"]+"/, '$1ws_123456789"'));
    const verified = await post('/api/agent/release/steam/verify', { modId });
    expect(verified.status, JSON.stringify(verified)).toBe(200);
    expect(verified.data.status).toBe('VERIFIED_AFTER_WORKSHOP_TOOL');
    expect(verified.data.sourceHash).toBe(steam.data.validatedSource.sourceHash);
    const preview = await post('/api/agent/release/steam/adopt', { modId, apply: false });
    expect(preview.status, JSON.stringify(preview)).toBe(200);
    expect(preview.data.sourceWritePerformed).toBe(false);
    expect(preview.data.sourceHash).toBe(steam.data.validatedSource.sourceHash);
    const confirmation = { modId, apply: true, expectedSourceSha256: preview.data.beforeSha256, expectedWorkshopId: preview.data.workshopId };
    try {
      fs.appendFileSync(sourceManifest, '\n<!-- editor mutation after preview -->');
      const staleBytes = fs.readFileSync(sourceManifest);
      const refused = await post('/api/agent/release/steam/adopt', confirmation);
      expect(refused.status).toBe(409);
      expect(refused.data.code).toBe('STEAM_ADOPTION_SOURCE_CHANGED');
      expect(fs.readFileSync(sourceManifest)).toEqual(staleBytes);
    } finally { fs.writeFileSync(sourceManifest, originalManifest); }
    const wrongId = await post('/api/agent/release/steam/adopt', { ...confirmation, expectedWorkshopId: 'ws_987654321' });
    expect(wrongId.status).toBe(409);
    expect(fileSha(sourceManifest)).toBe(sha(originalManifest));
    const adopted = await post('/api/agent/release/steam/adopt', confirmation);
    expect(adopted.status, JSON.stringify(adopted)).toBe(200);
    expect(adopted.data.sourceWritePerformed).toBe(true);
    expect(adopted.data.sourceHash).toBe(steam.data.validatedSource.sourceHash);
    expect(fileSha(sourceManifest)).toBe(fileSha(stagedManifest));
    fs.writeFileSync(sourceManifest, originalManifest);
    expect(inventory(source)).toEqual(originalSource);
    checks.push('simulated-workshop-metadata-verify-adopt-source-cas-and-restoration-no-tool-or-upload');
  });

  await test.step('existing rendered release controls consume real preparation responses', async () => {
    await page.addInitScript(() => {
      localStorage.setItem('x4_forge_experience_mode', 'expert');
      localStorage.removeItem('x4_mod_studio_workspace');
      localStorage.removeItem('x4_mod_studio_version');
    });
    await page.goto('/');
    await page.waitForFunction(({ workspaceId, name }) =>
      (window as any).__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() === workspaceId
      && (window as any).__X4_E2E__?.getWorkspace().name === name,
    { workspaceId: current.data.workspaceId, name: current.data.workspace.name });
    const health = page.getByTestId('health-card');
    await health.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined);
    if (await health.isVisible()) await page.getByTestId('health-card-dismiss').click();
    await page.locator('[data-sidebar-tab="playtest"]').click();
    await expect(page.getByTestId('release-center')).toBeVisible();
    await page.getByTestId('package-nexus-btn').click();
    await expect(page.getByTestId('nexus-release-guide')).toBeVisible();
    const prepared = page.waitForResponse(response => response.url().endsWith('/api/agent/release/nexus/prepare') && response.request().method() === 'POST');
    await page.getByTestId('prepare-nexus-btn').click();
    const response = await prepared;
    const payload = await response.json();
    record('/browser/release/nexus/prepare', response.status(), payload);
    expect(response.status(), JSON.stringify(payload)).toBe(200);
    assertRelease(payload);
    await expect(page.getByTestId('release-result')).toContainText('VERIFIED');
    await expect(page.getByTestId('export-release-artifact')).toBeVisible();
    await page.screenshot({ path: path.join(out, 'release-controls.png'), fullPage: true });
    expect(inventory(source)).toEqual(originalSource);
    expect(fs.readdirSync(path.join(game, 'extensions'))).toEqual([]);
    checks.push('real-rendered-release-controls-no-network-publication-no-game-writes');
  });
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ status: 'VERIFIED', checks, callCount: calls.length,
    boundaries: { actualApi: true, actualBrowser: true, game: false, workshopTool: false, publication: false, liveForge: false },
  }, null, 2));
});
