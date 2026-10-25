import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { E2E_API_ORIGIN } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, seedServerWorkspace, readServerWorkspace } from './ephemeral';
import { mdStemFingerprint } from '../../src/lib/mdFileIdentity';

// Real ephemeral API + rendered canvas. No route interception, installed sidecar or game.
test('C02 import identities, legacy layout, ambiguity and byte fidelity', async ({ page, request }) => {
  test.setTimeout(240_000);
  const out = path.resolve('test-results/claude-C02', `run-${randomUUID()}`);
  const mods = path.join(out, 'mods'), source = path.join(mods, 'forge_regression_lab');
  const game = path.join(out, 'game'), extensions = path.join(game, 'extensions');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(extensions, { recursive: true });
  fs.writeFileSync(path.join(game, 'X4.exe'), 'Synthetic path marker only; never executable.');
  const checks: string[] = [];
  let callNumber = 0;
  const headers = await ephemeralWorkspaceHeaders(true);
  const post = async (route: string, body: unknown, authority = headers) => {
    const response = await request.post(E2E_API_ORIGIN + route, { headers: { ...authority, Connection: 'close', 'x-forge-operation-id': `forge_op_${randomUUID().replaceAll('-', '')}` }, data: body });
    const data = await response.json();
    fs.writeFileSync(path.join(out, `${++callNumber}-${route.split('/').pop()}.json`), JSON.stringify({ status: response.status(), data }, null, 2));
    return { status: response.status(), data };
  };
  const content = '<?xml version="1.0"?><content id="forge_regression_lab" name="Forge Regression Lab" author="Codex" version="100" save="0"/>';
  const xml = '<mdscript name="Stable"><cues><cue name="A"><conditions><event_game_started/></conditions><actions><set_value name="$a" exact="1"/></actions></cue><cue name="B"><actions><set_value name="$b" exact="2"/></actions></cue></cues></mdscript>';
  const write = (relative: string, text: string, folder = source) => { const p = path.join(folder, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  write('content.xml', content); write('md/stable.xml', xml);
  write('md/other.xml', xml); // Same script/cue names must still be file scoped.
  const regression = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/forge-regression/project.json'), 'utf8'));
  write('ui.xml', regression.files.find((f: any) => f.path === 'ui.xml').content);
  write('ui/lab.lua', 'return {}\n');
  write('ui/large.lua', regression.files.find((f: any) => f.path === 'ui/large.lua').content);
  const config = await post('/api/schema/config', { modWorkspacePath: mods, filesystemPath: extensions, x4GamePath: game });
  expect(config.status).toBe(200);
  const importMod = async (folder = 'forge_regression_lab', authority = headers) => {
    const r = await post('/api/agent/mod-folder/import', { root: 'workspace', path: folder }, authority);
    expect(r.status, JSON.stringify(r.data)).toBe(200); expect(r.data.success).toBe(true);
    return r.data;
  };
  let first = await importMod(); const repeated = await importMod();
  expect(repeated.workspace.nodes.map((n: any) => n.id)).toEqual(first.workspace.nodes.map((n: any) => n.id));
  expect(repeated.workspace.links).toEqual(first.workspace.links);
  expect(new Set(first.workspace.nodes.map((n: any) => n.id)).size).toBe(first.workspace.nodes.length);
  checks.push('identical-imports', 'file-scoped-nodes-and-links');
  // Same-named scripts above exercise navigation namespaces, not game validity.
  // The compile-success fixture uses distinct script names and the grounded UI manifest.
  write('md/other.xml', xml.replace('name="Stable"', 'name="Other"'));
  first = await importMod();
  const legacy = structuredClone(first.workspace);
  const remap = new Map<string, string>(legacy.nodes.map((n: any, i: number) => [n.id, `legacy_C02_${i}`]));
  legacy.nodes.forEach((n: any, i: number) => { n.id = remap.get(n.id); n.x = 220 + (i % 3) * 300; n.y = 200 + Math.floor(i / 3) * 280; n.width = 240; delete n.source.identity; });
  legacy.links.forEach((l: any, i: number) => { l.id = `legacy_C02_link_${i}`; l.sourceNodeId = remap.get(l.sourceNodeId); l.targetNodeId = remap.get(l.targetNodeId); l.waypoints = [{ x: 400 + i, y: 120 + i }]; });
  // A legacy import stored its fingerprint against those same legacy IDs.
  // Renaming fixture IDs without this would simulate a graph edit, not a legacy import.
  for (const original of legacy.originalFiles) if (original.kind === 'md') original.fingerprint = mdStemFingerprint(legacy, original.stem);
  await seedServerWorkspace(legacy);
  await page.addInitScript(() => { localStorage.setItem('x4_forge_experience_mode', 'expert'); localStorage.removeItem('x4_mod_studio_workspace'); localStorage.removeItem('x4_mod_studio_version'); });
  await page.goto('/');
  const target = legacy.nodes[0];
  const rendered = page.getByTestId(`canvas-node-${target.id}`);
  await expect(rendered).toBeVisible();
  await page.getByTitle('Reset Graph Zoom').click();
  await expect.poll(async () => Math.round((await rendered.boundingBox())!.width)).toBe(240);
  const beforeBox = await rendered.boundingBox(); expect(beforeBox).not.toBeNull();
  await page.screenshot({ path: path.join(out, 'before.png'), fullPage: true });
  const edited = xml.replace('<cues>', '<cues><cue name="Inserted"><actions><set_value name="$new" exact="0"/></actions></cue>').replace('name="$a" exact="1"', 'name="$a" exact="7"');
  write('md/stable.xml', edited);
  write('md/added.xml', '<mdscript name="Added"><cues><cue name="NewFile"/></cues></mdscript>');
  const updated = await importMod();
  expect(updated.report.importedIdentity.reusedNodes).toBe(legacy.nodes.length);
  for (const n of legacy.nodes) {
    const found = updated.workspace.nodes.find((v: any) => v.id === n.id);
    expect(found).toBeDefined(); expect([found.x, found.y, found.width]).toEqual([n.x, n.y, n.width]);
  }
  expect(updated.workspace.nodes.some((n: any) => n.source?.path === 'md/stable.xml' && n.properties.name === '$a' && n.properties.exact === '7')).toBe(true);
  const retainedLink = legacy.links.find((l: any) => updated.workspace.links.some((v: any) => v.id === l.id));
  expect(retainedLink).toBeDefined();
  expect(updated.workspace.links.find((l: any) => l.id === retainedLink.id)).toEqual(retainedLink);
  checks.push('legacy-node-layout-and-link-waypoints', 'unrelated-file-cue-insertion', 'new-source-properties-win');
  // Exercise the real caller that adopts the import response, rather than a server
  // replacement followed by a browser reload with an intentionally stale local draft.
  await page.getByTitle('Load existing mods or push updates to GitHub').click();
  await page.getByPlaceholder('Relative folder path, e.g. sn_mod_support_apis').fill('forge_regression_lab');
  await page.getByRole('button', { name: 'Load Project', exact: true }).click();
  await page.waitForFunction((count: number) => (window as any).__X4_E2E__?.getWorkspace().nodes.length === count, updated.workspace.nodes.length, { timeout: 15_000 });
  await expect(rendered).toBeVisible();
  // Import intentionally refits the camera. Compare geometry at the same zoom/pan.
  await page.getByTitle('Reset Graph Zoom').click();
  await expect.poll(async () => Math.round((await rendered.boundingBox())!.width)).toBe(240);
  await expect(rendered).toHaveCSS('left', `${target.x}px`);
  await expect(rendered).toHaveCSS('top', `${target.y}px`);
  const afterBox = await rendered.boundingBox();
  // Content-driven card height is not a stored layout coordinate (fonts/diagnostics
  // can resize it). Prove the retained position and width at equal camera settings.
  expect({ x: afterBox!.x, y: afterBox!.y, width: afterBox!.width }).toEqual({ x: beforeBox!.x, y: beforeBox!.y, width: beforeBox!.width });
  await page.screenshot({ path: path.join(out, 'after.png'), fullPage: true });
  checks.push('rendered-node-position-retained');
  await expect.poll(async () => (await readServerWorkspace()).nodes.length).toBe(updated.workspace.nodes.length);
  const persisted = await readServerWorkspace();
  expect(persisted.nodes.map((n: any) => n.source)).toEqual(updated.workspace.nodes.map((n: any) => n.source));
  checks.push('identity-metadata-persisted');
  const compiled = await post('/api/agent/compile', { workspace: updated.workspace });
  expect(compiled.status, JSON.stringify(compiled.data.diagnostics)).toBe(200);
  expect(compiled.data.success, JSON.stringify(compiled.data.diagnostics)).toBe(true);
  for (const file of ['content.xml', 'md/stable.xml', 'md/other.xml', 'md/added.xml', 'ui.xml', 'ui/lab.lua', 'ui/large.lua']) expect(compiled.data.files[file]).toBe(fs.readFileSync(path.join(source, file), 'utf8'));
  checks.push('compiled-import-exact-source-bytes');
  const foreign = path.join(mods, 'foreign'); fs.cpSync(source, foreign, { recursive: true });
  expect((await importMod('foreign')).report.importedIdentity.reusedNodes).toBe(0);
  write('content.xml', content.replace('id="forge_regression_lab"', 'id="different_mod"'));
  expect((await importMod()).report.importedIdentity.reusedNodes).toBe(0);
  write('content.xml', content.replace('id="forge_regression_lab"', "id='different_mod'"));
  expect((await importMod()).report.importedIdentity.reusedNodes).toBe(0);
  write('content.xml', content);
  const invalidAuthority = await post('/api/agent/mod-folder/import', { path: 'forge_regression_lab' }, { ...headers, 'x-workspace-id': 'invalid' });
  expect(invalidAuthority.status).toBe(400);
  expect((await readServerWorkspace()).nodes).toEqual(persisted.nodes);
  checks.push('foreign-folder-no-transfer', 'different-mod-no-transfer', 'invalid-workspace-refused-without-state-change');
  const duplicates = edited.replace('<set_value name="$a" exact="7"/>', '<set_value name="$a" exact="7"/><set_value name="$a" exact="7"/>');
  write('md/stable.xml', duplicates);
  const dup = await importMod();
  const ambiguous = dup.workspace.nodes.filter((n: any) => n.source?.identity?.ambiguous);
  expect(ambiguous).toHaveLength(2);
  ambiguous.forEach((n: any) => { n.x = 8888; n.y = 9999; });
  await seedServerWorkspace(dup.workspace);
  write('md/stable.xml', duplicates.replace('exact="2"', 'exact="3"'));
  const changedDup = await importMod();
  for (const n of changedDup.workspace.nodes.filter((n: any) => n.source?.identity?.ambiguous)) { expect(ambiguous.some((v: any) => v.id === n.id)).toBe(false); expect(n.x).not.toBe(8888); }
  checks.push('changed-duplicates-no-identity-or-layout-transfer');
  // Recovery: removing ambiguity restores deterministic unique matching on the next import.
  write('md/stable.xml', edited);
  const recovered = await importMod(); await seedServerWorkspace(recovered.workspace);
  const again = await importMod();
  expect(again.report.importedIdentity.reusedNodes).toBe(recovered.workspace.nodes.length);
  checks.push('recovery-after-duplicate-removal');
  write('md/stable.xml', edited.replace('exact="7"', 'exact="8"'));
  const stale = await post('/api/agent/deploy-verify', { workspace: recovered.workspace, dryRun: true, deployFormat: 'loose' });
  expect(stale.status).toBe(409); expect(fs.readdirSync(extensions)).toEqual([]);
  const preview = await post('/api/agent/deploy-verify', { workspace: recovered.workspace, autoReimport: true, dryRun: true, deployFormat: 'loose' });
  expect(preview.data.ok, JSON.stringify(preview.data)).toBe(true); expect(fs.readdirSync(extensions)).toEqual([]);
  const identity = Object.fromEntries(['modId', 'sourceHash', 'artifactHash', 'bindingHash'].map(k => [`expected${k[0].toUpperCase()}${k.slice(1)}`, preview.data[k]]));
  const deployed = await post('/api/agent/deploy-verify', { workspace: recovered.workspace, autoReimport: true, deployFormat: 'loose', ...identity });
  expect(deployed.data.ok, JSON.stringify(deployed.data)).toBe(true);
  expect(path.resolve(deployed.data.deployedPath)).toBe(path.join(extensions, 'forge_regression_lab'));
  for (const n of recovered.workspace.nodes) {
    const found = deployed.data.workspace.nodes.find((v: any) => v.id === n.id);
    expect(found).toBeDefined(); expect([found.x, found.y]).toEqual([n.x, n.y]);
  }
  expect(fs.readFileSync(path.join(deployed.data.deployedPath, 'md/stable.xml'), 'utf8')).toBe(fs.readFileSync(path.join(source, 'md/stable.xml'), 'utf8'));
  checks.push('stale-preview-no-write', 'auto-reimport-scratch-deploy-preserves-layout-and-fresh-bytes');
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify({ pass: true, checks, beforeBox, afterBox, modId: compiled.data.modId, compiledHashes: Object.fromEntries(Object.entries(compiled.data.files).map(([p, s]) => [p, createHash('sha256').update(String(s)).digest('hex')])) }, null, 2));
});
