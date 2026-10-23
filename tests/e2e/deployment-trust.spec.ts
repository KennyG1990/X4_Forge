import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { E2E_API_ORIGIN as API, E2E_TOKEN, E2E_STATE_DIR } from '../../playwright.config';
import { ActionReceiptStore } from '../../src/lib/actionReceiptStore';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';

test('authenticated deployment binds bytes and persists exact approvals, with fail-closed API negatives', async ({ request, page }, testInfo) => {
  test.setTimeout(240_000);
  const auth = await ephemeralWorkspaceHeaders();
  const post = async (route: string, data: unknown, token = E2E_TOKEN) => {
    const response = await request.post(`${API}${route}`, { headers: { ...auth, Authorization: `Bearer ${token}` }, data });
    return { status: response.status(), body: await response.json() };
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-deploy-trust-'));
  const staging = path.join(root, 'workspace');
  const game = path.join(root, 'game');
  const source = path.join(staging, 'trust_fixture');
  const target = path.join(game, 'extensions', 'trust_fixture');
  fs.mkdirSync(path.join(source, 'md'), { recursive: true });
  fs.mkdirSync(path.join(source, 'ui'), { recursive: true });
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(path.join(game, 'X4.exe'), 'test fixture, never executable');
  fs.writeFileSync(path.join(source, 'content.xml'), '<content id="trust_fixture" name="Trust fixture" version="100"/>');
  fs.writeFileSync(path.join(source, 'md', 'trust.xml'), '<mdscript name="Trust"><cues><cue name="Init"><actions><debug_text text="\'scratch\'"/></actions></cue></cues></mdscript>');
  fs.writeFileSync(path.join(source, 'ui', 'bad.lua'), 'local broken = )');
  fs.writeFileSync(path.join(source, 'payload.bin'), Buffer.alloc(5 * 1024 * 1024, 17));
  const original = await (await request.get(`${API}/api/schema/config`, { headers: auth })).json();
  const restore = Object.fromEntries(['x4GamePath', 'modWorkspacePath', 'filesystemPath', 'deployFormat'].map(k => [k, original.config?.[k] || (k === 'deployFormat' ? 'loose' : '')]));
  restore.schemaDir = original.config?.xsdSchemaPath || '';
  const receiptRoot = path.join(E2E_STATE_DIR, 'data', 'action-receipts');
  const evidence: Record<string, unknown> = {};
  const identities = (body: any) => ({ expectedModId: body.modId, expectedSourceHash: body.sourceHash,
    expectedArtifactHash: body.artifactHash, expectedBindingHash: body.bindingHash });
  const route = '/api/agent/deploy-verify';
  try {
    const configured = await post('/api/schema/config', { x4GamePath: game, modWorkspacePath: staging,
      filesystemPath: source, deployFormat: 'loose' });
    expect(configured.status, JSON.stringify(configured.body)).toBe(200);
    const keys: Record<string, { token: string; id: string }> = {};
    for (const scope of ['read', 'write', 'deploy']) {
      const minted = await post('/api/agent/keys', { label: `trust-${scope}`, scope, ttl: '1h' });
      expect(minted.status, JSON.stringify(minted.body)).toBe(200);
      keys[scope] = { token: minted.body.token || minted.body.key, id: minted.body.record.id };
    }
    const preview = await post(route, { path: 'trust_fixture', dryRun: true }, keys.deploy.token);
    evidence.preview = preview;
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.ok).toBe(false);
    expect(preview.body.modId).toBe('trust_fixture');
    expect(preview.body.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(target)).toBe(false);
    const findings = preview.body.validation.evidence.findings.filter((f: any) => f.category === 'mod-finding' && f.severity === 'error');
    expect(findings.some((f: any) => f.code === 'lua.syntax_error')).toBe(true);
    const reason = 'Scratch API proof: intentionally invalid Lua, never a real game deployment.';
    const acceptances = findings.map((f: any) => ({ findingId: f.findingId, bindingHash: preview.body.bindingHash, reason }));
    const apply = { path: 'trust_fixture', ...identities(preview.body), acceptances };
    const blocked = await post(route, { ...apply, acceptances: [] }, keys.deploy.token);
    expect(blocked.body.ok).toBe(false);
    for (const scope of ['read', 'write']) {
      expect((await post(route, apply, keys[scope].token)).status).toBe(403);
    }
    const constrained = await post('/api/agent/keys', { label: 'trust-constrained-deploy', scope: 'deploy', ttl: '1h',
      authorityMode: 'exact', capabilityIdentities: ['project.validate@1'],
      allowedEffects: ['read', 'analyze', 'audit-write', 'audit-retention-delete'] });
    expect(constrained.status, JSON.stringify(constrained.body)).toBe(200);
    expect((await post(route, apply, constrained.body.token || constrained.body.key)).status).toBe(403);
    expect((await post(route, { ...apply, actor: 'forged' }, keys.deploy.token)).status).toBe(400);
    expect((await post(route, { ...apply, acceptances: [{ ...acceptances[0], reason: '' }] }, keys.deploy.token)).status).toBe(400);
    expect((await post(route, { ...apply, expectedModId: 'other_mod' }, keys.deploy.token)).status).toBe(409);
    for (const field of ['expectedSourceHash', 'expectedArtifactHash', 'expectedBindingHash']) {
      expect((await post(route, { ...apply, [field]: '0'.repeat(64) }, keys.deploy.token)).status).toBe(409);
    }
    expect((await post(route, { ...apply, acceptances: [{ ...acceptances[0], bindingHash: '0'.repeat(64) }] }, keys.deploy.token)).status).toBe(409);
    expect(fs.existsSync(target)).toBe(false);

    // Persistence failure is induced only inside this run's known ephemeral state root.
    fs.mkdirSync(path.dirname(receiptRoot), { recursive: true });
    const parked = `${receiptRoot}.test-backup`;
    const hadReceipts = fs.existsSync(receiptRoot);
    if (hadReceipts) fs.renameSync(receiptRoot, parked);
    fs.writeFileSync(receiptRoot, 'not a directory');
    try {
      const failed = await post(route, apply, keys.deploy.token);
      evidence.storageFailure = failed;
      expect(failed.status, JSON.stringify(failed.body)).toBe(507);
      expect(fs.existsSync(target)).toBe(false);
      expect(fs.existsSync(path.join(staging, '.forge-builds'))).toBe(false);
      // No approvals: deployment-receipt preparation itself must precede even
      // creation of the extensions parent, not only the mod directory.
      fs.writeFileSync(path.join(source, 'ui', 'bad.lua'), 'local valid = true');
      const cleanStoragePreview = await post(route, { path: 'trust_fixture', dryRun: true }, keys.deploy.token);
      expect(cleanStoragePreview.body.ok, JSON.stringify(cleanStoragePreview.body)).toBe(true);
      const cleanStorageFailure = await post(route, { path: 'trust_fixture', ...identities(cleanStoragePreview.body) }, keys.deploy.token);
      evidence.cleanStorageFailure = cleanStorageFailure;
      expect(cleanStorageFailure.status, JSON.stringify(cleanStorageFailure.body)).toBe(507);
      expect(fs.existsSync(path.join(game, 'extensions'))).toBe(false);
      expect(fs.existsSync(path.join(staging, '.forge-builds'))).toBe(false);
    } finally {
      fs.writeFileSync(path.join(source, 'ui', 'bad.lua'), 'local broken = )');
      fs.unlinkSync(receiptRoot);
      if (hadReceipts) fs.renameSync(parked, receiptRoot);
    }

    const deployed = await post(route, apply, keys.deploy.token);
    evidence.deployed = deployed;
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(200);
    expect(deployed.body.ok, JSON.stringify(deployed.body)).toBe(true);
    expect(deployed.body.baselinePromotion.recorded).toBe(false);
    expect(deployed.body.validation.clean).toBe(false);
    expect(fs.readFileSync(path.join(target, 'ui', 'bad.lua'), 'utf8')).toBe('local broken = )');
    expect(fs.readFileSync(path.join(target, 'payload.bin'))).toEqual(fs.readFileSync(path.join(source, 'payload.bin')));
    const reopened = new ActionReceiptStore({ root: receiptRoot });
    const record = reopened.read(deployed.body.deployRecord.id);
    expect(record.status).toBe('committed');
    expect(record.validation.code).toBe('DEPLOYED_BYTES_VERIFIED');
    expect(record.actor.id).toBe(keys.deploy.id);
    expect(record.metadata?.artifactHash).toBe(preview.body.artifactHash);
    for (const approval of deployed.body.acceptanceRecords) {
      const durable = reopened.read(approval.id);
      expect(durable.actor.id).toBe(keys.deploy.id);
      expect(durable.metadata?.reason).toBe(reason);
      expect(record.authority.resources).toContainEqual(expect.objectContaining({ root: 'action-receipts', relativePath: `${approval.id}.json`, beforeHash: durable.hash }));
    }
    // Binary bytes outside the semantic validator must expire the preview as well.
    const payload = fs.openSync(path.join(source, 'payload.bin'), 'r+');
    fs.writeSync(payload, Buffer.from([18]), 0, 1, 0);
    fs.closeSync(payload);
    const stale = await post(route, apply, keys.deploy.token);
    evidence.stale = stale;
    expect(stale.status, JSON.stringify(stale.body)).toBe(409);
    expect(fs.readFileSync(path.join(target, 'payload.bin'))[0]).toBe(17);
    expect((await post('/api/agent/deploy', apply, keys.deploy.token)).status).toBe(409);

    // A fresh review works through the legacy route too: no alternate unchecked writer.
    const refreshed = await post(route, { path: 'trust_fixture', dryRun: true }, keys.deploy.token);
    const updated = { path: 'trust_fixture', ...identities(refreshed.body), acceptances: refreshed.body.validation.evidence.findings
      .filter((f: any) => f.category === 'mod-finding' && f.severity === 'error')
      .map((f: any) => ({ findingId: f.findingId, bindingHash: refreshed.body.bindingHash, reason })) };
    const legacy = await post('/api/agent/deploy', updated, keys.deploy.token);
    evidence.legacy = legacy;
    expect(legacy.body.ok, JSON.stringify(legacy.body)).toBe(true);
    expect(fs.readFileSync(path.join(target, 'payload.bin'))[0]).toBe(18);
    expect(reopened.read(legacy.body.deployRecord.id).status).toBe('committed');
    // Deployment-doctor safety errors are never covered by a Lua finding approval.
    const duplicate = path.join(game, 'extensions', 'duplicate');
    fs.mkdirSync(duplicate);
    fs.writeFileSync(path.join(duplicate, 'content.xml'), '<content id="trust_fixture" name="Duplicate" version="100"/>');
    const failedDoctor = await post(route, updated, keys.deploy.token);
    evidence.nonOverridableDoctor = failedDoctor;
    expect(failedDoctor.body.ok).toBe(false);
    expect(failedDoctor.body.rollback?.applied).toBe(true);
    expect(failedDoctor.body.doctor.blocking.some((f: any) => f.code === 'ext.duplicate_id')).toBe(true);
    fs.rmSync(duplicate, { recursive: true });
    // A different configured target cannot reuse the old approval binding.
    const otherGame = path.join(root, 'other-game');
    fs.mkdirSync(otherGame);
    fs.writeFileSync(path.join(otherGame, 'X4.exe'), 'fixture');
    expect((await post('/api/schema/config', { x4GamePath: otherGame })).status).toBe(200);
    expect((await post(route, updated, keys.deploy.token)).status).toBe(409);
    expect(fs.existsSync(path.join(otherGame, 'extensions', 'trust_fixture'))).toBe(false);
    expect((await post('/api/schema/config', { x4GamePath: game })).status).toBe(200);
    // Same-size corpus bytes expire the binding even when the effective findings do not change.
    const schemaRoot = path.join(root, 'schemas');
    fs.mkdirSync(schemaRoot);
    const schemaFile = path.join(schemaRoot, 'binding-proof.xsd');
    fs.writeFileSync(schemaFile, '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><!-- A --></xs:schema>');
    expect((await post('/api/schema/config', { schemaDir: schemaRoot })).status).toBe(200);
    const rulePreview = await post(route, { path: 'trust_fixture', dryRun: true }, keys.deploy.token);
    const ruleApply = { path: 'trust_fixture', ...identities(rulePreview.body), acceptances: rulePreview.body.validation.evidence.findings
      .filter((f: any) => f.category === 'mod-finding' && f.severity === 'error')
      .map((f: any) => ({ findingId: f.findingId, bindingHash: rulePreview.body.bindingHash, reason })) };
    fs.writeFileSync(schemaFile, '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><!-- B --></xs:schema>');
    const changedCorpus = await post(route, ruleApply, keys.deploy.token);
    evidence.changedCorpus = changedCorpus;
    expect(changedCorpus.status, JSON.stringify(changedCorpus.body)).toBe(409);
    expect((await post('/api/schema/config', { schemaDir: restore.schemaDir })).status).toBe(200);

    // A genuinely complete clean check may promote the baseline.
    fs.writeFileSync(path.join(source, 'ui', 'bad.lua'), 'local valid = true');
    const cleanPreview = await post(route, { path: 'trust_fixture', dryRun: true }, keys.deploy.token);
    const clean = await post(route, { path: 'trust_fixture', ...identities(cleanPreview.body) }, keys.deploy.token);
    evidence.clean = clean;
    expect(clean.body.ok, JSON.stringify(clean.body)).toBe(true);
    expect(clean.body.validation.outcome).toBe('validation-clean');
    expect(clean.body.baselinePromotion.recorded).toBe(true);
    // Unavailable checks alone do not require approval or become a clean result.
    // This valid Lua comment exceeds the actual 4 MiB semantic-loader limit.
    fs.writeFileSync(path.join(source, 'ui', 'bad.lua'), '--' + 'x'.repeat(4 * 1024 * 1024 + 1));
    const incompletePreview = await post(route, { path: 'trust_fixture', dryRun: true }, keys.deploy.token);
    expect(incompletePreview.body.ok, JSON.stringify(incompletePreview.body)).toBe(true);
    const incomplete = await post(route, { path: 'trust_fixture', ...identities(incompletePreview.body) }, keys.deploy.token);
    evidence.incompleteWithoutApproval = incomplete;
    expect(incomplete.body.ok, JSON.stringify(incomplete.body)).toBe(true);
    expect(incomplete.body.validation.outcome).toBe('incomplete-checks');
    expect(incomplete.body.acceptanceRecords).toEqual([]);
    expect(incomplete.body.baselinePromotion.recorded).toBe(false);
    const history = await (await request.get(`${API}/api/agent/history?kind=deploy`, { headers: auth })).json();
    expect(history.rows.some((row: any) => row.receiptId === incomplete.body.deployRecord.id && row.receiptStatus === 'committed')).toBe(true);
    // Real rendered caller, real scratch API: no intercepted deploy responses.
    await seedServerWorkspace(incomplete.body.workspace);
    await page.addInitScript(() => {
      localStorage.removeItem('x4_mod_studio_workspace');
      localStorage.removeItem('x4_mod_studio_version');
      localStorage.setItem('x4_forge_experience_mode', 'expert');
    });
    const browserDeploys: any[] = [];
    page.on('request', req => { if (req.url().endsWith(route) && req.method() === 'POST') browserDeploys.push(req.postDataJSON()); });
    await page.goto('/');
    await expect(page.getByTestId('studio-workspace')).toBeVisible();
    await page.locator('[data-sidebar-tab="playtest"]').click();
    await page.getByTestId('verify-path-input').fill('trust_fixture');
    await page.getByTestId('deploy-verify-btn').click();
    const rendered = page.getByTestId('verify-result');
    await expect(rendered).toContainText('DEPLOYED BYTES VERIFIED', { timeout: 45_000 });
    await expect(rendered).toContainText('Validation qualified: incomplete-checks');
    expect(browserDeploys).toHaveLength(2);
    expect(browserDeploys[0].dryRun).toBe(true);
    expect(browserDeploys[1].expectedModId).toBe('trust_fixture');
    expect(browserDeploys[1].expectedArtifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(browserDeploys[1].acceptances).toBeUndefined();
    await rendered.screenshot({ path: testInfo.outputPath('qualified-real-deploy.png') });
    evidence.browserDeploys = browserDeploys;
  } finally {
    fs.writeFileSync(testInfo.outputPath('deployment-trust-api-evidence.json'), JSON.stringify(evidence, null, 2));
    await testInfo.attach('deployment-trust-api-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    const restored = await post('/api/schema/config', restore);
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    // Exact owned mkdtemp root, never a configured live root.
    fs.rmSync(root, { recursive: true, force: true });
  }
});
