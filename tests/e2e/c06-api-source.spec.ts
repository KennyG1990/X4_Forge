import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { E2E_API_ORIGIN } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';

test('C06 API identity, strict requests, source coordination and deploy refusal diagnostics', async ({ request, page }) => {
  test.setTimeout(600_000);
  const out = path.resolve('test-results/claude-C06', `run-${randomUUID()}`); fs.mkdirSync(out, { recursive: true });
  const headers = await ephemeralWorkspaceHeaders(true);
  const calls: any[] = []; const checks: string[] = [];
  const post = async (route: string, body: unknown, customHeaders = headers) => {
    const response = await request.post(E2E_API_ORIGIN + route, { headers: { ...customHeaders, Connection: 'close' }, data: body });
    const data = await response.json(); const item = { route, status: response.status(), data };
    calls.push(item); fs.writeFileSync(path.join(out, `${calls.length}-${route.split('/').pop()}.json`), JSON.stringify(item, null, 2));
    return item;
  };
  const identity = (data: any) => { expect(data.modId).toBe('forge_regression_lab'); expect(data.sourceHash).toMatch(/^[a-f0-9]{64}$/); expect(data.sourceHashScope).not.toBe('unresolved'); };
  const project = JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/project.json', 'utf8'));
  const created = await post('/api/agent/project/create', { meta: { id: project.id, name: project.name } });
  expect(created.status).toBe(200); identity(created.data);
  const added = await post('/api/agent/project/file/create', { project: created.data.project, file: { path: 'ui/test.lua', content: 'return {}' } });
  identity(added.data); expect(added.data.sourceHash).not.toBe(created.data.sourceHash);
  const packaged = await post('/api/agent/project/package', { project: added.data.project }); identity(packaged.data);
  const cross = await post('/api/agent/project/validate-crossfile', { project: added.data.project }); identity(cross.data);
  const generated = await post('/api/agent/project/generate', { spec: { id: project.id } }); identity(generated.data);
  expect(generated.data.success).toBe(generated.data.validation.ok);
  checks.push('author-create-file-generate-package-crossfile-identities');
  for (const [route, body] of [
    ['/api/agent/project/create', { meta: { id: 1 } }], ['/api/agent/project/create', { meta: { id: project.id }, ignored: true }],
    ['/api/agent/project/generate', { spec: { id: project.id, kind: 'nonsense' } }], ['/api/agent/project/file/create', { project, file: { path: '../outside.lua' } }],
    ['/api/agent/project/validate', { project, path: 'different' }], ['/api/agent/project/validate', { project, recordBaseline: 'true' }],
    ['/api/agent/package', { workspace: {} }], ['/api/agent/artifact/build', { workspace: [] }],
    ['/api/agent/mod-folder/import', { folder: project.id }], ['/api/agent/project/package', { project, extra: true }],
  ]) {
    const r = await post(route as string, body); expect(r.status, JSON.stringify(r)).toBe(400); expect(r.data.category).toBe('request-invalid');
    expect(r.data.modId).toBeNull(); expect(r.data.sourceHash).toBeNull();
  }
  checks.push('malformed-subjects-refuse-without-inventing-identity');
  const mods = path.join(out, 'mods'), source = path.join(mods, project.id), game = path.join(out, 'game');
  fs.mkdirSync(path.join(game, 'extensions'), { recursive: true }); fs.writeFileSync(path.join(game, 'X4.exe'), 'Inert marker, never executed.');
  const md = project.files.find((f: any) => f.path.startsWith('md/'));
  md.content = '<mdscript name="Lab"><cues><cue name="Init"><actions><debug_text text="0"/></actions></cue></cues></mdscript>';
  for (const f of project.files) { const filename = path.join(source, f.path); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, f.content); }
  expect((await post('/api/schema/config', { modWorkspacePath: mods, filesystemPath: path.join(game, 'extensions'), x4GamePath: game })).status).toBe(200);
  const imported = await post('/api/agent/mod-folder/import', { root: 'workspace', path: project.id }); identity(imported.data);
  await seedServerWorkspace(imported.data.workspace);
  const disk = await post('/api/agent/project/validate', { fromPath: project.id }); identity(disk.data);
  expect(disk.data.sourceHash).toBe(imported.data.sourceHash);
  for (const route of ['/api/agent/compile', '/api/agent/package', '/api/agent/artifact/build', '/api/agent/project/files']) {
    const r = await post(route, { workspace: imported.data.workspace }); expect(r.status).toBe(200); identity(r.data);
  }
  checks.push('import-validation-compile-package-artifact-inventory-identities');
  const hash = (filename: string) => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  const file = 'ui/c06_concurrent.lua', filename = path.join(source, file); fs.writeFileSync(filename, 'return 0');
  const before = hash(filename);
  // Two real clients race the same source revision. Exactly one may write; the next observes CAS failure.
  const raced = await Promise.all(['return 1', 'return 2'].map((content, i) => post('/api/fs/write', {
    path: `${project.id}/${file}`, content, expectedSha256: before,
  }, { ...headers, 'x-client-id': `client_c06_fixture_000${i}` })));
  expect(raced.map(r => r.status).sort()).toEqual([200, 409]);
  expect(raced.find(r => r.status === 200)!.data.sourceOperation.scope).toBe('server-process');
  expect(raced.find(r => r.status === 200)!.data.sourceOperation.active[0].owner.operation).toBe('/api/fs/write');
  const malformed = await post('/api/fs/write', { path: `${project.id}/${file}`, content: { corrupted: true } }); expect(malformed.status).toBe(400);
  expect(hash(filename)).not.toBe(before); expect(fs.readFileSync(filename, 'utf8')).toMatch(/^return [12]$/);
  checks.push('actual-two-client-source-CAS-and-coordination-owner');
  const status = await request.get(E2E_API_ORIGIN + '/api/agent/status', { headers }); const state = await status.json();
  expect(state.sourceCoordination.active).toEqual([]); expect(state.sourceCoordination.waiting).toEqual([]); expect(state.sourceCoordination.controlsOtherProcesses).toBe(false);
  checks.push('queried-source-owner-status-empty-after-completion');
  const mdPath = path.join(source, md.path); const goodMd = fs.readFileSync(mdPath, 'utf8');
  fs.writeFileSync(mdPath, goodMd.replace('<debug_text text="0"/>', '<raise_lua_event name="&apos;C06.missing_listener&apos;"/>'));
  const blocked = await post('/api/agent/deploy-verify', { path: project.id, dryRun: true });
  expect(blocked.data.ok).toBe(false); expect(blocked.data.blockingFindings.length).toBeGreaterThan(0);
  for (const f of blocked.data.blockingFindings) {
    expect(f.findingId).toMatch(/^[a-f0-9]{64}$/); expect(f.message).toBeTruthy(); expect(f.filePath).toBeTruthy();
    expect(blocked.data.checklist.find((c: any) => c.id === 'preflight').detail).toContain(f.code);
  }
  expect(blocked.data.deployment).toMatchObject({ state: 'not-deployed', writeAttempted: false, fidelityScope: 'none' });
  expect(fs.existsSync(path.join(game, 'extensions', project.id))).toBe(false);
  for (const stage of blocked.data.checklist.filter((c: any) => c.status === 'skipped')) expect(stage.detail).toBe('Not reached - fix the failure above first.');
  const template = blocked.data.acceptanceRequest; expect(template.path).toBe('/api/agent/deploy-verify');
  const missingReason = await post(template.path, template.body); expect(missingReason.data.ok).toBe(false);
  template.body.acceptances.forEach((a: any) => { a.reason = 'Synthetic missing event accepted only for C06 isolated receipt proof.'; });
  const accepted = await post(template.path, template.body); expect(accepted.data.ok, JSON.stringify(accepted.data)).toBe(true);
  expect(accepted.data.deployRecord.status).toBe('committed'); expect(accepted.data.acceptanceRecords.length).toBeGreaterThan(0);
  const installedHash = hash(path.join(game, 'extensions', project.id, md.path));
  fs.writeFileSync(mdPath, goodMd);
  const stale = await post(template.path, template.body); expect(stale.status).toBe(409);
  expect(hash(path.join(game, 'extensions', project.id, md.path))).toBe(installedHash);
  checks.push('all-blockers-exact-acceptance-reason-receipt-stale-refusal');
  await page.addInitScript(() => { localStorage.setItem('x4_forge_experience_mode', 'expert'); localStorage.removeItem('x4_mod_studio_workspace'); localStorage.removeItem('x4_mod_studio_version'); });
  // A new missing event has no accepted review, so the actual Playtest UI must show refusal.
  fs.writeFileSync(mdPath, goodMd.replace('<debug_text text="0"/>', '<raise_lua_event name="&apos;C06.another_missing_listener&apos;"/>'));
  await page.goto('/'); await page.locator('[data-sidebar-tab="playtest"]').click();
  await page.getByTestId('verify-path-input').fill(project.id); await page.getByTestId('deploy-verify-btn').click();
  const result = page.getByTestId('verify-result'); await expect(result).toContainText('md_lua.missing_register', { timeout: 90_000 });
  await page.getByText('md_lua.missing_register', { exact: false }).last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'blocked-findings.png'), fullPage: true });
  checks.push('rendered-blocking-finding-in-deploy-result');
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify({ pass: true, checks, requests: calls.length, commitBaseline: '2caca03', limitations: ['process-local source coordination', 'no native/game/installed-host proof'] }, null, 2));
});
