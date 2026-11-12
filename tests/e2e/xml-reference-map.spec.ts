import { expect, test, type APIRequestContext, type Page, type Request as BrowserRequest, type Response as BrowserResponse, type Route, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { E2E_API_ORIGIN, E2E_RUNTIME, E2E_STATE_DIR, E2E_TOKEN } from '../../playwright.config';
import type { ModWorkspace } from '../../src/types';
import type { XmlReferenceFocus, XmlReferenceMapResult } from '../../src/lib/xmlReferenceGraph';
import { stableStringify, workspaceSnapshotHash } from '../../src/lib/workspaceIdentity';
import { ephemeralWorkspaceHeaders, readServerWorkspaceEnvelope, seedServerWorkspace } from './ephemeral';

test.use({ extraHTTPHeaders: { Authorization: `Bearer ${E2E_TOKEN}` }, viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const endpoint = '/api/agent/project/xml-references';
const routePattern = '**/api/agent/project/xml-references';
const shipPath = 'assets/units/macros/ship_reference_fixture_macro.xml';
const weaponPath = 'assets/weapons/macros/weapon_reference_fixture_macro.xml';
const bulletPath = 'assets/weapons/macros/bullet_reference_fixture_macro.xml';
const realWeapon = 'weapon_arg_l_destroyer_01_mk1_macro';
const realWeaponPath = 'assets/props/weaponsystems/capital/macros/weapon_arg_l_destroyer_01_mk1_macro.xml';
const sha = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

function hashes(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (folder: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else {
        expect(entry.isFile(), 'Only owned regular fixture files are expected.').toBe(true);
        result[path.relative(root, absolute).replace(/\\/g, '/')] = sha(fs.readFileSync(absolute));
      }
    }
  };
  visit(root);
  return result;
}

function mapEvidence(result: XmlReferenceMapResult) {
  return { ok: result.ok, schemaVersion: result.schemaVersion, signature: result.signature,
    files: result.files.map(file => ({ id: file.id, origin: file.origin, path: file.path, sha256: file.sha256 })),
    edges: result.edges, coverage: result.coverage, context: result.context,
    preview: result.preview ? { ...result.preview, content: undefined, previewSha256: sha(result.preview.content) } : undefined };
}

interface Fixture {
  workspace: ModWorkspace;
  headers: Record<string, string>;
  files: Record<string, string>;
  originalEnvelope: Awaited<ReturnType<typeof readServerWorkspaceEnvelope>>;
  realSource: Buffer;
  realWareSource: Buffer;
  evidence: unknown[];
}

// Only Mod Workspace and comparison paths change, through the existing config API.
// The configured canonical corpus/schema are read-only inputs, as in other corpus
// E2E specs. Synthetic base/DLC and schema mutation belong to the service selftests.
async function withFixture(request: APIRequestContext, info: TestInfo, run: (fixture: Fixture) => Promise<void>, workspaceHeaders = ephemeralWorkspaceHeaders) {
  const evidence: unknown[] = [{ runtime: E2E_RUNTIME }];
  expect(process.env.X4_GAME_PATH ?? '', 'The worker launch must leave the game-path override empty.').toBe('');
  // This Studio-only GET needs no workspace bootstrap. All preflight refusals
  // must precede even the POST that the workspace-header helper may perform.
  const configResponse = await request.get(`${E2E_API_ORIGIN}/api/schema/config`, { headers: { Authorization: `Bearer ${E2E_TOKEN}` } });
  expect(configResponse.status()).toBe(200);
  const before = await configResponse.json();
  const savedGamePath = before.config?.x4GamePath ?? '';
  const effectiveGamePath = before.resolved?.x4GamePath;
  expect(typeof savedGamePath).toBe('string');
  expect(typeof effectiveGamePath).toBe('string');
  expect(effectiveGamePath, 'A launch/profile override must not replace the saved private game setting.').toBe(savedGamePath);
  expect(before.directorySafety?.safe, 'The prior private configuration must pass native directory-role validation.').toBe(true);
  expect(before.directorySafety?.issues).toEqual([]);
  if (savedGamePath) {
    expect(path.isAbsolute(savedGamePath), 'A prior scratch game must use an absolute path.').toBe(true);
    const priorGame = path.resolve(savedGamePath);
    const ownedRoot = [path.resolve('test-results'), path.resolve(E2E_STATE_DIR)].find(candidate => {
      const relative = path.relative(candidate, priorGame);
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
    expect(ownedRoot, 'A prior game setting must remain beneath an owned test root.').toBeTruthy();
    const gameStat = fs.lstatSync(priorGame);
    expect(gameStat.isDirectory() && !gameStat.isSymbolicLink(), 'The prior game must be a physical directory.').toBe(true);
    const physicalRoot = fs.realpathSync(ownedRoot!);
    expect(path.relative(ownedRoot!, physicalRoot), 'The owned test root must not redirect outside its declared path.').toBe('');
    const physicalRelative = path.relative(physicalRoot, fs.realpathSync(priorGame));
    expect(physicalRelative && !physicalRelative.startsWith('..') && !path.isAbsolute(physicalRelative), 'The prior game must remain physically inside its owned test root.').toBeTruthy();
    const marker = fs.lstatSync(path.join(priorGame, 'X4.exe'));
    expect(marker.isFile() && !marker.isSymbolicLink(), 'The existing private game marker must be a regular file; XML tests never create one.').toBe(true);
  }
  evidence.push({ configurationPreflight: { launchGameOverride: '', savedGamePath, effectiveGamePath, directorySafety: before.directorySafety } });
  const headers = await workspaceHeaders(true);
  const restore = { modWorkspacePath: before.config?.modWorkspacePath || '', filesystemPath: before.config?.filesystemPath || '',
    x4GamePath: before.config?.x4GamePath || '', x4ReferenceRoot: before.config?.x4ReferenceRoot || '', schemaDir: before.config?.xsdSchemaPath || '' };
  const referenceRoot = String(before.resolved?.x4ReferenceRoot || '');
  expect(referenceRoot, 'The existing corpus-backed E2E prerequisite must be configured.').not.toBe('');
  const realFile = path.join(referenceRoot, ...realWeaponPath.split('/'));
  expect(fs.lstatSync(realFile).isFile(), 'The known 9.00 weapon definition must be a real canonical input.').toBe(true);
  const realSource = fs.readFileSync(realFile);
  const realWareFile = path.join(referenceRoot, 'libraries', 'wares.xml');
  expect(fs.lstatSync(realWareFile).isFile(), 'Canonical ware navigation must use the existing actual wares source.').toBe(true);
  const realWareSource = fs.readFileSync(realWareFile);
  const root = fs.mkdtempSync(path.join(E2E_STATE_DIR, 'xml-reference-map-'));
  evidence.push({ privateFixtureSetup: { requestedRoot: root, stateRoot: path.resolve(E2E_STATE_DIR) } });
  let configured = false;
  let primaryFailed = false;
  const cleanupErrors: unknown[] = [];
  try {
    const inside = path.relative(path.resolve(E2E_STATE_DIR), fs.realpathSync(root));
    expect(inside && !inside.startsWith('..') && !path.isAbsolute(inside)).toBeTruthy();
    const owner = { schemaVersion: 1, kind: 'xml-reference-map-e2e-fixture', ownerId: randomUUID(),
      root: fs.realpathSync(root), stateRoot: path.resolve(E2E_STATE_DIR), workerPid: process.pid,
      testId: info.testId, project: info.project.name, workerIndex: info.workerIndex,
      parallelIndex: info.parallelIndex, retry: info.retry };
    const ownerMarker = '.xml-reference-map-owner.json';
    const ownerBytes = stableStringify(owner);
    fs.writeFileSync(path.join(root, ownerMarker), ownerBytes, 'utf8');
    evidence.push({ privateFixtureOwner: { ...owner, marker: ownerMarker, markerSha256: sha(ownerBytes) } });
    evidence.push({ preflightRefusals: await assertPreflightRefusals(before, root, info) });
    const mods = path.join(root, 'mods'); const source = path.join(mods, 'xml_reference_fixture');
    const deployed = path.join(root, 'deployed');
    fs.mkdirSync(source, { recursive: true }); fs.mkdirSync(deployed);
    const files: Record<string, string> = {
      'content.xml': '<content id="xml_reference_fixture" name="XML reference fixture" version="100"/>',
      [shipPath]: '\uFEFF<macros>\r\n  <macro name="ship_reference_fixture_macro" class="ship">\r\n    <component ref="ship_reference_fixture_component"/>\r\n    <connections>\r\n      <connection ref="local_socket" note="🛰️"><macro ref="weapon_reference_fixture_macro"/></connection>\r\n'
        + `      <connection ref="local_socket"><macro ref="${realWeapon}"/></connection>\r\n`
        + '      <connection ref="local_socket"><macro ref="duplicate_reference_macro"/></connection>\r\n'
        + '      <connection ref="local_socket"><macro ref="$chosen_macro"/></connection>\r\n    </connections>\r\n  </macro>\r\n</macros>',
      [weaponPath]: '<macros><macro name="weapon_reference_fixture_macro" class="weapon"><component ref="weapon_reference_fixture_component"/><properties><bullet class="bullet_reference_fixture_macro"/></properties></macro></macros>',
      [bulletPath]: '<macros><macro name="bullet_reference_fixture_macro" class="bullet"/></macros>',
      'assets/units/ship_reference_fixture_component.xml': '<components><component name="ship_reference_fixture_component"><connections><connection name="local_socket"/></connections></component></components>',
      'assets/weapons/weapon_reference_fixture_component.xml': '<components><component name="weapon_reference_fixture_component"/></components>',
      'assets/duplicate_a.xml': '<macros><macro name="duplicate_reference_macro"/></macros>',
      'assets/duplicate_b.xml': '<macros><macro name="duplicate_reference_macro" class="weapon"/></macros>',
      // A matching GLOBAL name must never turn a component-local socket into an edge.
      'assets/local_socket.xml': '<macros><macro name="local_socket"/></macros>',
      'index/macros.xml': '<index><entry name="absent_reference_macro" value="assets/absent_reference_macro"/><entry name="ship_reference_fixture_macro" value="assets/units/macros/ship_reference_fixture_macro"/></index>',
      'libraries/wares.xml': '<wares><ware id="ware_reference_fixture"><component ref="ship_reference_fixture_macro"/><production><primary><ware ware="energycells" amount="1"/></primary></production></ware></wares>',
    };
    for (const [relative, content] of Object.entries(files)) {
      const absolute = path.join(source, ...relative.split('/'));
      fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, content, 'utf8');
    }
    const binary = path.join(source, 'assets', 'unchanged-payload.bin');
    fs.writeFileSync(binary, Buffer.from([0, 255, 64, 0, 91, 12]));
    const baseline = hashes(root);
    // The server may write before the client loses its response. Restore every
    // attempted configuration change, including an ambiguous transport failure.
    configured = true;
    const settings = await request.post(`${E2E_API_ORIGIN}/api/schema/config`, { headers, data: { modWorkspacePath: mods, filesystemPath: deployed } });
    expect(settings.status(), await settings.text()).toBe(200);
    const actualSettings = await settings.json();
    expect(path.resolve(actualSettings.resolved.modWorkspacePath)).toBe(mods);
    expect(path.resolve(actualSettings.resolved.x4ReferenceRoot)).toBe(path.resolve(referenceRoot));
    const importedResponse = await request.post(`${E2E_API_ORIGIN}/api/agent/mod-folder/import`, { headers, data: { root: 'workspace', path: 'xml_reference_fixture' } });
    expect(importedResponse.status(), await importedResponse.text()).toBe(200);
    const imported = await importedResponse.json();
    expect(imported.success).toBe(true);
    await seedServerWorkspace(imported.workspace);
    const originalEnvelope = await readServerWorkspaceEnvelope();
    evidence.push({ fixture: { files: baseline, canonicalWeaponSha256: sha(realSource), workspaceHash: originalEnvelope.workspaceHash, snapshotHash: originalEnvelope.snapshotHash } });
    await run({ workspace: originalEnvelope.workspace, headers, files, originalEnvelope, realSource, realWareSource, evidence });
    expect(hashes(root)).toEqual(baseline);
    expect(sha(fs.readFileSync(realFile))).toBe(sha(realSource));
    expect(sha(fs.readFileSync(realWareFile))).toBe(sha(realWareSource));
    const after = await readServerWorkspaceEnvelope();
    expect(after.workspaceHash).toBe(originalEnvelope.workspaceHash);
    expect(after.snapshotHash).toBe(originalEnvelope.snapshotHash);
    expect(stableStringify(after.workspace)).toBe(stableStringify(originalEnvelope.workspace));
    evidence.push({ readOnly: { fixtureHashesUnchanged: true, canonicalWeaponUnchanged: true, workspaceHash: after.workspaceHash, snapshotHash: after.snapshotHash } });
  } catch (error) {
    primaryFailed = true;
    evidence.push({ primaryFailure: String(error).slice(0, 2000) });
    throw error;
  } finally {
    const attemptCleanup = async (phase: string, cleanup: () => void | Promise<void>) => {
      try { await cleanup(); }
      catch (error) {
        cleanupErrors.push(error);
        const description = `${phase}: ${String(error).slice(0, 2000)}`;
        evidence.push({ cleanupFailure: { phase, error: description } });
        info.annotations.push({ type: 'xml-fixture-cleanup-failure', description });
      }
    };
    await attemptCleanup('config-restore', async () => {
      if (!configured) return;
      const restored = await request.post(`${E2E_API_ORIGIN}/api/schema/config`, { headers, data: restore });
      evidence.push({ restoreStatus: restored.status() });
      expect(restored.status(), await restored.text()).toBe(200);
      const restoredConfig = await request.get(`${E2E_API_ORIGIN}/api/schema/config`, { headers });
      expect(restoredConfig.status(), await restoredConfig.text()).toBe(200);
      const restoredBody = await restoredConfig.json();
      expect(restoredBody.config?.modWorkspacePath).toBe(restore.modWorkspacePath);
      expect(restoredBody.config?.filesystemPath).toBe(restore.filesystemPath);
      expect(restoredBody.config?.x4GamePath || '').toBe(restore.x4GamePath);
      expect(restoredBody.config?.x4ReferenceRoot || '').toBe(restore.x4ReferenceRoot);
      expect(restoredBody.config?.xsdSchemaPath || '').toBe(restore.schemaDir);
      expect(restoredBody.resolved?.x4GamePath).toBe(effectiveGamePath);
      expect(path.resolve(restoredBody.resolved.x4ReferenceRoot)).toBe(path.resolve(referenceRoot));
      evidence.push({ configRestored: true });
    });
    await attemptCleanup('evidence-output', () => {
      // Retain the owned fixture and its canonical evidence. The runner does not
      // recursively retire E2E_STATE_DIR. After backend/browser termination, bounded
      // cleanup can verify this exact private root/owner marker and recorded hashes
      // before retiring only this fixture; result/evidence files remain retained.
      fs.mkdirSync(info.outputDir, { recursive: true });
      fs.writeFileSync(info.outputPath('xml-reference-map-evidence.json'), JSON.stringify(JSON.parse(stableStringify(evidence)), null, 2), 'utf8');
    });
  }
  if (!primaryFailed && cleanupErrors.length) throw cleanupErrors[0];
}

async function assertPreflightRefusals(before: {
  config?: Record<string, unknown>; resolved?: Record<string, unknown>;
  directorySafety?: { safe?: boolean; issues?: unknown[] };
}, ownedRoot: string, info: TestInfo) {
  const marker = path.join(ownedRoot, 'X4.exe');
  expect(fs.existsSync(marker), 'The existing owned XML fixture must have no game marker.').toBe(false);
  const gameSetting = (gamePath: string) => ({ ...before,
    config: { ...before.config, x4GamePath: gamePath }, resolved: { ...before.resolved, x4GamePath: gamePath },
    directorySafety: { safe: true, issues: [] } });
  const controls = [
    { name: 'launch-override', override: ownedRoot, config: before, gets: 0,
      refusal: /The worker launch must leave the game-path override empty/u },
    { name: 'unsafe-directory-role', override: '', config: { ...before, directorySafety: { safe: false, issues: ['controlled unsafe role'] } }, gets: 1,
      refusal: /The prior private configuration must pass native directory-role validation/u },
    { name: 'outside-owned-roots', override: '', config: gameSetting(path.parse(ownedRoot).root), gets: 1,
      refusal: /A prior game setting must remain beneath an owned test root/u },
    { name: 'missing-game-marker', override: '', config: gameSetting(ownedRoot), gets: 1, refusal: /ENOENT/u },
  ];
  const originalOverride = process.env.X4_GAME_PATH;
  const results: Array<{ name: string; gets: number; posts: number; bootstrap: number; body: number; markerAbsent: boolean }> = [];
  try {
    for (const control of controls) {
      const calls = { gets: 0, posts: 0, bootstrap: 0, body: 0 };
      const request = {
        async get(url: string) {
          calls.gets += 1;
          expect(url).toBe(`${E2E_API_ORIGIN}/api/schema/config`);
          return { status: () => 200, json: async () => control.config };
        },
        async post() { calls.posts += 1; throw new Error('A refused preflight reached a POST.'); },
      };
      process.env.X4_GAME_PATH = control.override;
      await expect(withFixture(request as unknown as APIRequestContext, info,
        async () => { calls.body += 1; throw new Error('A refused preflight reached the XML workflow.'); },
        async () => { calls.bootstrap += 1; throw new Error('A refused preflight reached workspace bootstrap.'); },
      ), control.name).rejects.toThrow(control.refusal);
      expect(calls, `${control.name}: refusals must precede every mutation-capable entry`).toEqual({ gets: control.gets, posts: 0, bootstrap: 0, body: 0 });
      expect(fs.existsSync(marker), `${control.name}: XML preflight must not repair a missing marker`).toBe(false);
      results.push({ name: control.name, ...calls, markerAbsent: true });
    }
  } finally {
    if (originalOverride === undefined) delete process.env.X4_GAME_PATH;
    else process.env.X4_GAME_PATH = originalOverride;
  }
  return results;
}

async function boot(page: Page, fixture: Fixture) {
  await page.goto('/');
  await expect.poll(async () => {
    // The production app persists its complete clean snapshot under the selected
    // immutable ID. Development-only workspace access is absent from compiled UI.
    const current = await page.evaluate(() => {
      const workspaceId = (window as Window & { __X4_WORKSPACE_CONTEXT__?: { getWorkspaceId: () => string } }).__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || '';
      const stored = workspaceId ? localStorage.getItem(`x4_mod_studio_workspace:${workspaceId}`) : null;
      return { workspaceId, workspace: stored ? JSON.parse(stored) as ModWorkspace : null };
    });
    return { workspaceId: current.workspaceId, snapshot: current.workspace ? stableStringify(current.workspace) : '',
      snapshotHash: current.workspace ? workspaceSnapshotHash(current.workspace) : '' };
  }).toEqual({ workspaceId: fixture.originalEnvelope.workspaceId, snapshot: stableStringify(fixture.workspace),
    snapshotHash: workspaceSnapshotHash(fixture.workspace) });
  await expect(page.getByTestId('workspace-switcher').locator('option:checked'))
    .toHaveText(`${fixture.workspace.name} · ${fixture.originalEnvelope.workspaceId.slice(-6)}`);
  fixture.evidence.push({ browserWorkspaceBoot: { workspaceId: fixture.originalEnvelope.workspaceId,
    snapshotHash: workspaceSnapshotHash(fixture.workspace), fullSnapshotMatched: true, renderedSelectionMatched: true } });
  const health = page.getByTestId('health-card');
  await health.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined);
  if (await health.isVisible()) await page.getByTestId('health-card-dismiss').click();
  await page.locator('[data-workspace-view="project"]').click();
  await expect(page.getByTestId('project-status')).toBeVisible();
  const initial = waitForMap(page);
  await page.getByRole('tab', { name: 'XML References', exact: true }).click();
  fixture.evidence.push({ initial: mapEvidence(await initial) });
  await expect(page.getByTestId('xml-reference-file-picker')).toBeVisible();
}

function waitForMap(page: Page, focus?: XmlReferenceFocus): Promise<XmlReferenceMapResult> {
  return page.waitForResponse(response => {
    if (new URL(response.url()).pathname !== endpoint || response.request().method() !== 'POST') return false;
    const body = response.request().postDataJSON();
    return !focus || body?.focus?.origin === focus.origin && body?.focus?.path === focus.path
      && (focus.line === undefined || body.focus.line === focus.line);
  }).then(async response => {
    expect(response.status(), await response.text()).toBe(200);
    const result = await response.json() as XmlReferenceMapResult;
    expect(result.schemaVersion).toBe('forge.xml-reference-map.v1');
    expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
    return result;
  });
}

async function selectFile(page: Page, focus: XmlReferenceFocus) {
  const response = waitForMap(page, focus);
  await page.getByTestId('xml-reference-file-picker').selectOption({ label: `${focus.origin === 'project' ? 'Mod' : 'Game / DLC'}: ${focus.path}` });
  return response;
}

async function renderedRuntime(page: Page, evidence: unknown[]) {
  const sources = await page.locator('script[type="module"][src]').evaluateAll(scripts => scripts.map(script => script.getAttribute('src')!));
  const origin = new URL(page.url()).origin;
  const entries = sources.map(src => ({ src, url: new URL(src, page.url()) })).filter(entry => E2E_RUNTIME.mode === 'compiled'
    ? /^\/assets\/[A-Za-z0-9_-]+\.js$/.test(entry.url.pathname) : entry.url.pathname === '/src/main.tsx');
  expect(entries, 'Exactly one real application module must be served.').toHaveLength(1);
  const { src, url } = entries[0];
  expect(url.origin).toBe(origin);
  expect(url.username).toBe(''); expect(url.password).toBe('');
  expect(url.search).toBe(''); expect(url.hash).toBe('');
  const response = await page.request.get(url.href);
  expect(response.status()).toBe(200);
  expect(response.url()).toBe(url.href);
  const bytes = await response.body();
  if (E2E_RUNTIME.mode === 'compiled') {
    expect(src).toMatch(/^\/assets\/[A-Za-z0-9_-]+\.js$/);
    expect(bytes).toEqual(fs.readFileSync(path.join(process.cwd(), 'dist', src!.slice(1))));
    expect(await page.content()).not.toContain('/@vite/client');
  }
  evidence.push({ renderedRuntime: { mode: E2E_RUNTIME.mode, asset: src, servedUrl: url.href, sha256: sha(bytes) } });
}

test('XML References follows actual file edges, source anchors, ambiguity and bounded canonical links without writing', async ({ page, request }, info) => {
  await withFixture(request, info, async fixture => {
    const project = { id: 'xml_reference_fixture', name: fixture.workspace.name,
      files: Object.entries(fixture.files).map(([filePath, content]) => ({ path: filePath, content })) };
    const response = await request.post(E2E_API_ORIGIN + endpoint, { headers: fixture.headers,
      data: { project, focus: { origin: 'project', path: shipPath }, maxDepth: 4, maxNodes: 60, maxEdges: 180, includeSource: true } });
    expect(response.status(), await response.text()).toBe(200);
    const actual = await response.json() as XmlReferenceMapResult;
    const local = actual.edges.filter(edge => edge.kind === 'local-connection');
    expect(local.length).toBeGreaterThan(0);
    expect(local.every(edge => edge.status === 'unsupported' && edge.targetIds.length === 0)).toBe(true);
    expect(actual.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'duplicate_reference_macro', status: 'ambiguous', targetIds: expect.any(Array) }),
      expect.objectContaining({ symbol: '$chosen_macro', status: 'dynamic' }),
      expect.objectContaining({ symbol: 'ship_reference_fixture_component', kind: 'component', status: 'resolved' }),
      expect.objectContaining({ symbol: 'bullet_reference_fixture_macro', kind: 'bullet', status: 'resolved' }),
    ]));
    expect(actual.edges.find(edge => edge.symbol === 'duplicate_reference_macro')?.targetIds).toHaveLength(2);
    expect(actual.files).toEqual(expect.arrayContaining([expect.objectContaining({ origin: 'reference', path: realWeaponPath })]));
    fixture.evidence.push({ apiChain: mapEvidence(actual) });
    const inlineBaseline = await request.post(E2E_API_ORIGIN + endpoint, { headers: fixture.headers,
      data: { workspace: fixture.workspace, focus: { origin: 'project', path: 'index/macros.xml' }, maxDepth: 1 } });
    expect(inlineBaseline.status(), await inlineBaseline.text()).toBe(200);
    const inline = await inlineBaseline.json() as XmlReferenceMapResult;
    const omittedPath = 'assets/absent_reference_macro.xml';
    const omitted = await request.post(E2E_API_ORIGIN + endpoint, { headers: fixture.headers,
      data: { workspace: { ...fixture.workspace, passthroughFiles: [...(fixture.workspace.passthroughFiles || []),
        { path: omittedPath, reason: 'too_large', omitted: true, bytes: 3 * 1024 * 1024 }] },
      focus: { origin: 'project', path: 'index/macros.xml' }, maxDepth: 1 } });
    expect(omitted.status(), await omitted.text()).toBe(200);
    const omittedMap = await omitted.json() as XmlReferenceMapResult;
    expect(omittedMap.coverage.knownProjectFiles).toBe(inline.coverage.knownProjectFiles + 1);
    expect(omittedMap.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'index-file', symbol: 'absent_reference_macro', status: 'incomplete' }),
    ]));
    expect(omittedMap.edges.some(edge => edge.symbol === 'absent_reference_macro' && edge.status === 'missing')).toBe(false);
    expect(omittedMap.coverage.reasons.join(' ')).toContain(omittedPath);
    fixture.evidence.push({ omittedXml: mapEvidence(omittedMap) });
    const capped = await request.post(E2E_API_ORIGIN + endpoint, { headers: fixture.headers,
      data: { project, focus: { origin: 'project', path: shipPath }, maxDepth: 0, maxNodes: 1, maxEdges: 1 } });
    expect(capped.status()).toBe(200);
    const bounded = await capped.json() as XmlReferenceMapResult;
    expect(bounded.coverage.truncated).toBe(true); expect(bounded.nodes.length).toBeLessThanOrEqual(1);
    expect(bounded.edges.length).toBeLessThanOrEqual(1); fixture.evidence.push({ capped: mapEvidence(bounded) });
    const postedPayloads: unknown[] = [];
    page.on('request', event => { if (new URL(event.url()).pathname === endpoint) postedPayloads.push(event.postDataJSON()); });
    await boot(page, fixture);
    const ship = await selectFile(page, { origin: 'project', path: shipPath });
    const uses = page.getByRole('region', { name: 'Uses', exact: true });
    await expect(uses.locator('[data-reference-status="ambiguous"]')).toHaveCount(1);
    await expect(uses.locator('[data-reference-status="dynamic"]')).toHaveCount(1);
    await expect(page.getByTestId('xml-reference-coverage')).toContainText('Results reached a limit');
    const sourceEdge = ship.edges.find(edge => edge.sourceId === ship.preview?.fileId && edge.symbol === 'weapon_reference_fixture_macro')!;
    expect(sourceEdge.location.kind).toBe('authored'); expect(sourceEdge.location.line).toBe(5);
    const authoredLine = fixture.files[shipPath].split(/\r\n/)[sourceEdge.location.line! - 1];
    expect(authoredLine.slice(sourceEdge.location.column! - 1)).toMatch(/^weapon_reference_fixture_macro/);
    const anchored = waitForMap(page, sourceEdge.location);
    await uses.getByRole('button', { name: `Inspect reference source: ${shipPath}:${sourceEdge.location.line}:${sourceEdge.location.column}`, exact: true }).click();
    const source = await anchored;
    expect(source.preview?.sha256).toBe(sha(fixture.files[shipPath]));
    await expect(page.locator('[data-source-highlight="true"]')).toContainText('weapon_reference_fixture_macro');
    await page.screenshot({ path: info.outputPath('xml-references-mod.png'), fullPage: true });
    const weapon = waitForMap(page, { origin: 'project', path: weaponPath });
    await page.getByRole('button', { name: `Inspect Mod: ${weaponPath}`, exact: true }).click();
    fixture.evidence.push({ weapon: mapEvidence(await weapon) });
    await expect(page.getByRole('region', { name: 'Used by', exact: true })).toContainText(shipPath);
    const bullet = waitForMap(page, { origin: 'project', path: bulletPath });
    await page.getByRole('region', { name: 'Uses', exact: true }).getByRole('button', { name: `Inspect file: Mod: ${bulletPath}`, exact: true }).click();
    fixture.evidence.push({ bullet: mapEvidence(await bullet) });
    await expect(page.getByRole('region', { name: 'Used by', exact: true })).toContainText(weaponPath);
    await selectFile(page, { origin: 'project', path: 'index/macros.xml' });
    await expect(page.getByRole('region', { name: 'Uses', exact: true }).locator('[data-reference-status="missing"]')).toHaveCount(1);
    const wareMap = await selectFile(page, { origin: 'project', path: 'libraries/wares.xml' });
    await expect(page.getByRole('region', { name: 'Uses', exact: true })).toContainText('ware: energycells');
    const energycells = wareMap.edges.find(edge => edge.kind === 'ware' && edge.symbol === 'energycells');
    expect(energycells).toBeTruthy();
    expect(['resolved', 'incomplete']).toContain(energycells!.status);
    expect(energycells!.targetIds).toContain('reference:libraries/wares.xml');
    if (energycells!.status === 'incomplete') expect(energycells!.reason).toMatch(/incomplete|candidate|canonical/i);
    const canonicalWares = waitForMap(page, { origin: 'reference', path: 'libraries/wares.xml' });
    await page.getByRole('region', { name: 'Uses', exact: true }).getByRole('button', { name: 'Inspect file: Game / DLC: libraries/wares.xml', exact: true }).click();
    const wareSource = await canonicalWares;
    expect(wareSource.preview?.sha256).toBe(sha(fixture.realWareSource));
    expect(wareSource.preview?.content).toBe(fixture.realWareSource.toString('utf8').replace(/\r\n?|\n/g, '\n').slice(0, wareSource.coverage.limits.maxPreviewChars));
    fixture.evidence.push({ canonicalWare: mapEvidence(wareMap), canonicalWareSource: mapEvidence(wareSource) });
    await selectFile(page, { origin: 'project', path: shipPath });
    const canonical = waitForMap(page, { origin: 'reference', path: realWeaponPath });
    await page.getByRole('button', { name: `Inspect Game / DLC: ${realWeaponPath}`, exact: true }).click();
    const canonicalMap = await canonical;
    expect(canonicalMap.preview?.sha256).toBe(sha(fixture.realSource));
    expect(canonicalMap.preview?.content).toBe(fixture.realSource.toString('utf8').replace(/\r\n?|\n/g, '\n').slice(0, canonicalMap.coverage.limits.maxPreviewChars));
    await expect(page.getByTestId('xml-reference-source')).toContainText('Game and DLC source is inspected here as read-only XML.');
    await expect(page.getByRole('button', { name: 'Request native editor', exact: true })).toBeDisabled();
    await expect(page.getByTestId('xml-reference-source')).toContainText(realWeapon);
    await renderedRuntime(page, fixture.evidence);
    await page.screenshot({ path: info.outputPath('xml-references-canonical.png'), fullPage: true });
    expect(postedPayloads.length).toBeGreaterThan(0);
    for (const payload of postedPayloads as Array<{ workspace?: ModWorkspace }>) {
      expect(payload.workspace?.passthroughFiles?.some(file => file.path.endsWith('.bin'))).toBeFalsy();
      expect(payload.workspace?.passthroughFiles?.some(file => file.contentEncoding === 'base64')).toBeFalsy();
    }
    fixture.evidence.push({ authoredAnchor: sourceEdge.location, canonical: mapEvidence(canonicalMap), postedXmlOnlyBodies: postedPayloads.length });
    await page.close();
  });
});

interface DelayedResponse {
  result: XmlReferenceMapResult;
  release: () => void;
  finished: Promise<void>;
  delivery: () => { upstreamFetches: number; responses: number; failures: number };
}
interface DelayedMap { response: Promise<DelayedResponse>; dispose: () => Promise<void> }
async function delayNextRealMap(page: Page): Promise<DelayedMap> {
  let captured!: (response: DelayedResponse) => void;
  let failed!: (error: unknown) => void;
  const response = new Promise<DelayedResponse>((resolve, reject) => { captured = resolve; failed = reject; });
  void response.catch(() => undefined); // dispose preserves errors if capture was never awaited.
  let original: BrowserRequest | undefined;
  let active: DelayedResponse | undefined;
  let disposed = false;
  let failure: unknown;
  let cleanupFailure: unknown;
  const counts = { upstreamFetches: 0, responses: 0, failures: 0 };
  const onResponse = (value: BrowserResponse) => { if (value.request() === original) counts.responses++; };
  const onFailed = (value: BrowserRequest) => { if (value === original) counts.failures++; };
  const routes = new Map<Route, { settled: boolean; work?: Promise<void> }>();
  const terminal = (route: Route) => page.isClosed() || route.request().failure() !== null;
  const abort = async (route: Route) => {
    const state = routes.get(route)!;
    if (state.settled) return;
    try { await route.abort('failed'); state.settled = true; }
    catch (error) {
      if (terminal(route)) state.settled = true;
      else if (cleanupFailure === undefined) cleanupFailure = error;
    }
  };
  const handler = (route: Route) => {
    const state: { settled: boolean; work?: Promise<void> } = { settled: false };
    routes.set(route, state);
    state.work = (async () => {
      let complete: (() => void) | undefined;
      try {
        if (disposed) { await abort(route); return; }
        if (original || route.request().method() !== 'POST') {
          await route.continue(); state.settled = true; return;
        }
        original = route.request();
        // Keep this original paused: removing its current handler would send it.
        counts.upstreamFetches++;
        const upstream = await route.fetch({ timeout: 30_000 });
        expect(upstream.status(), await upstream.text()).toBe(200);
        const bytes = await upstream.body();
        const result = JSON.parse(bytes.toString('utf8')) as XmlReferenceMapResult;
        expect(result.schemaVersion).toBe('forge.xml-reference-map.v1');
        if (disposed || state.settled) { await abort(route); return; }
        let release!: () => void; const gate = new Promise<void>(done => { release = done; });
        const finished = new Promise<void>(done => { complete = done; });
        active = { result, release, finished, delivery: () => ({ ...counts }) };
        captured(active);
        await gate;
        if (disposed || state.settled) { await abort(route); return; }
        try { await route.fulfill({ response: upstream, body: bytes }); state.settled = true; }
        catch (error) {
          if (!terminal(route)) throw error;
          state.settled = true;
        }
      } catch (error) {
        if (failure === undefined) failure = error;
        failed(error);
        await abort(route);
      } finally { complete?.(); }
    })();
    return state.work;
  };
  page.on('response', onResponse); page.on('requestfailed', onFailed);
  await page.route(routePattern, handler);
  return { response, dispose: async () => {
    disposed = true;
    if (!active) failed(new Error('XML response delay disposed before capture.'));
    for (const route of routes.keys()) await abort(route);
    active?.release();
    await Promise.all([...routes.values()].map(state => state.work));
    if ([...routes.values()].some(state => !state.settled)) {
      cleanupFailure ??= new Error('XML delayed route settlement is unconfirmed; retain its handler for page teardown.');
    } else {
      try { await page.unroute(routePattern, handler); }
      catch (error) { cleanupFailure ??= error; }
    }
    page.off('response', onResponse); page.off('requestfailed', onFailed);
    if (failure !== undefined) throw failure;
    if (cleanupFailure !== undefined) throw cleanupFailure;
  } };
}

async function settledFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('real delayed XML results cannot survive settings invalidation or an immutable workspace switch', async ({ page, request }, info) => {
  await withFixture(request, info, async fixture => {
    let settingsResponse: DelayedResponse | undefined;
    let oldResponse: DelayedResponse | undefined;
    const delays: DelayedMap[] = [];
    let primaryFailed = false;
    const cleanupErrors: unknown[] = [];
    try {
    await boot(page, fixture);
    await selectFile(page, { origin: 'project', path: shipPath });
    const deliveryControl = await delayNextRealMap(page); delays.push(deliveryControl);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const held = await deliveryControl.response;
    await settledFrames(page);
    expect(held.delivery()).toEqual({ upstreamFetches: 1, responses: 0, failures: 0 });
    held.release(); await held.finished;
    await expect.poll(() => held.delivery().responses).toBe(1);
    expect(held.delivery()).toEqual({ upstreamFetches: 1, responses: 1, failures: 0 });
    fixture.evidence.push({ sameAuthorityHeldDelivery: { signature: held.result.signature, beforeRelease: 0, afterRelease: held.delivery() } });
    await deliveryControl.dispose(); delays.pop();
    const before = await page.evaluate(() => (window as Window & { __X4_WORKSPACE_CONTEXT__?: { getWorkspaceId: () => string } }).__X4_WORKSPACE_CONTEXT__!.getWorkspaceId());
    const delayedSettings = await delayNextRealMap(page); delays.push(delayedSettings);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    settingsResponse = await delayedSettings.response;
    expect(settingsResponse.delivery()).toEqual({ upstreamFetches: 1, responses: 0, failures: 0 });
    const settingsRequested = waitForMap(page);
    await page.getByTitle('Manage all folders the studio uses (Mod Workspace, X4 game path, schema)').click();
    const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/schema/config' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save Paths', exact: true }).click();
    const savedResponse = await saved;
    expect(savedResponse.status()).toBe(200);
    const savedBody = await savedResponse.json();
    expect(savedBody.error, 'HTTP 200 alone must not hide a failed directory save.').toBeFalsy();
    expect(savedBody.resolved).toBeTruthy();
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    const reloaded = await settingsRequested;
    expect(reloaded.preview?.path).not.toBe(shipPath); // old focus was bound to the preceding schema/config version
    await expect(page.getByTestId('xml-reference-file-picker')).toBeVisible();
    expect(settingsResponse.delivery().responses, 'The exact stale settings request must remain undelivered while held.').toBe(0);
    settingsResponse.release(); await settingsResponse.finished; await settledFrames(page);
    await expect.poll(() => settingsResponse!.delivery().responses === 1 || settingsResponse!.delivery().failures === 1).toBe(true);
    expect(settingsResponse.delivery().upstreamFetches).toBe(1);
    expect(settingsResponse.delivery().responses).toBeLessThanOrEqual(1);
    expect(settingsResponse.delivery().failures).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('xml-reference-source')).not.toContainText('note="🛰️"');
    const selected = await selectFile(page, { origin: 'project', path: shipPath });
    const delayedWorkspace = await delayNextRealMap(page); delays.push(delayedWorkspace);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    oldResponse = await delayedWorkspace.response;
    expect(oldResponse.delivery()).toEqual({ upstreamFetches: 1, responses: 0, failures: 0 });
    await page.getByTestId('workspace-switcher').selectOption('__new');
    await page.getByTestId('dialog-input').fill('Independent XML Reference Workspace');
    const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/agent/workspaces' && response.request().method() === 'POST');
    await page.getByTestId('dialog-ok').click();
    const creationResponse = await creation;
    expect(creationResponse.status()).toBe(201);
    const created = await creationResponse.json() as { workspaceId: string; workspace: ModWorkspace; snapshotHash: string };
    expect(created.snapshotHash).toBe(workspaceSnapshotHash(created.workspace));
    await expect(page.getByTestId('toast')).toContainText('Created independent workspace');
    const after = await page.evaluate(() => (window as Window & { __X4_WORKSPACE_CONTEXT__?: { getWorkspaceId: () => string } }).__X4_WORKSPACE_CONTEXT__!.getWorkspaceId());
    expect(after).toBe(created.workspaceId);
    expect(after).not.toBe(before);
    await expect(page.getByTestId('xml-reference-file-picker')).toBeVisible();
    await expect(page.getByTestId('xml-reference-file-picker').locator('option').filter({ hasText: shipPath })).toHaveCount(0);
    expect(oldResponse.delivery().responses, 'The exact stale workspace request must remain undelivered while held.').toBe(0);
    oldResponse.release(); await oldResponse.finished; await settledFrames(page);
    await expect.poll(() => oldResponse!.delivery().responses === 1 || oldResponse!.delivery().failures === 1).toBe(true);
    expect(oldResponse.delivery().upstreamFetches).toBe(1);
    expect(oldResponse.delivery().responses).toBeLessThanOrEqual(1);
    expect(oldResponse.delivery().failures).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('xml-reference-source')).not.toContainText('note="🛰️"');
    await expect(page.getByTestId('xml-reference-file-picker').locator('option').filter({ hasText: shipPath })).toHaveCount(0);
    const finalWorkspace = await page.evaluate(workspaceId => {
      if ((window as Window & { __X4_WORKSPACE_CONTEXT__?: { getWorkspaceId: () => string } }).__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() !== workspaceId) throw new Error('The browser left the created immutable workspace.');
      const stored = localStorage.getItem(`x4_mod_studio_workspace:${workspaceId}`);
      if (!stored) throw new Error('The created browser workspace snapshot was not persisted.');
      return JSON.parse(stored) as ModWorkspace;
    }, after);
    expect(stableStringify(finalWorkspace)).toBe(stableStringify(created.workspace));
    expect(workspaceSnapshotHash(finalWorkspace)).toBe(created.snapshotHash);
    expect(finalWorkspace.name).toBe('Independent XML Reference Workspace');
    await expect(page.getByTestId('workspace-switcher').locator('option:checked'))
      .toHaveText(`${finalWorkspace.name} · ${after.slice(-6)}`);
    fixture.evidence.push({ delayedRealResponses: { settings: mapEvidence(settingsResponse.result), workspace: mapEvidence(oldResponse.result),
      settingsDelivery: settingsResponse.delivery(), workspaceDelivery: oldResponse.delivery(),
      settingsReload: mapEvidence(reloaded), originalSelected: selected.signature, beforeWorkspaceId: before, afterWorkspaceId: after,
      createdWorkspaceSnapshotHash: created.snapshotHash, finalWorkspaceSnapshotHash: workspaceSnapshotHash(finalWorkspace) } });
    await renderedRuntime(page, fixture.evidence);
    await page.screenshot({ path: info.outputPath('xml-references-isolation.png'), fullPage: true });
    } catch (error) {
      primaryFailed = true; throw error;
    } finally {
      for (const delay of delays) {
        try { await delay.dispose(); }
        catch (error) {
          cleanupErrors.push(error);
          const description = `delayed-map-dispose: ${String(error).slice(0, 2000)}`;
          fixture.evidence.push({ cleanupFailure: description });
          info.annotations.push({ type: 'xml-delayed-map-cleanup-failure', description });
        }
      }
      try { await page.close(); }
      catch (error) {
        cleanupErrors.push(error);
        const description = `page-close: ${String(error).slice(0, 2000)}`;
        fixture.evidence.push({ cleanupFailure: description });
        info.annotations.push({ type: 'xml-delayed-map-cleanup-failure', description });
      }
    }
    if (!primaryFailed && cleanupErrors.length) throw cleanupErrors[0];
  });
});
