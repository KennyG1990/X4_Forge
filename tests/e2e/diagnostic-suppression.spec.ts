import { expect, test, type Page } from './request-transport';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import type { ModWorkspace } from '../../src/types';
import { E2E_API_ORIGIN, E2E_TOKEN } from '../../playwright.config';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';

const API = E2E_API_ORIGIN;
const auth = { Authorization: `Bearer ${E2E_TOKEN}`, 'Content-Type': 'application/json' };

test('reviewed exact suppression creates rules, rejects stale/error paths, and removes only the warning', async ({ request }) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-r6-suppression-'));
  const staging = path.join(temp, 'staging');
  const deployment = path.join(temp, 'deployment');
  const source = path.join(staging, 'r6_fixture');
  fs.mkdirSync(path.join(source, 'md'), { recursive: true });
  fs.mkdirSync(deployment, { recursive: true });
  fs.writeFileSync(path.join(source, 'content.xml'), '<content id="r6_fixture" name="R6 Fixture" version="100"/>', 'utf8');
  fs.writeFileSync(
    path.join(source, 'md', 'legacy.xml'),
    '<mdscript name="Legacy"><cues><cue name="Legacy"><actions><get_highest_resource_yield result="$y" sector="$s" ware="$w"/></actions></cue></cues></mdscript>',
    'utf8',
  );

  const originalResponse = await request.get(`${API}/api/schema/config`, { headers: auth });
  expect(originalResponse.ok(), await originalResponse.text()).toBeTruthy();
  const original = await originalResponse.json() as { config?: Record<string, unknown> };
  const restore = {
    modWorkspacePath: original.config?.modWorkspacePath || '',
    filesystemPath: original.config?.filesystemPath || '',
  };
  const workspace = {
    ...buildTemplateWorkspace('welcome'),
    id: 'r6_fixture',
    name: 'R6 Fixture',
    contentId: 'r6_fixture',
    sourceStamp: { dir: source, hash: 'fixture-baseline', at: new Date().toISOString() },
  };
  const rulesPath = path.join(source, 'forge.rules.json');

  try {
    const configured = await request.post(`${API}/api/schema/config`, { headers: auth, data: { modWorkspacePath: staging, filesystemPath: deployment } });
    expect(configured.ok(), await configured.text()).toBeTruthy();

    const compiledResponse = await request.post(`${API}/api/agent/compile`, { headers: auth, data: { workspace } });
    expect(compiledResponse.ok(), await compiledResponse.text()).toBeTruthy();
    const compiled = await compiledResponse.json() as {
      diagnostics: Array<{ severity: string; code: string; filePath: string; sourceRef?: { label?: string }; suppressionScope?: { code: string; file?: string; sourceRef?: string } }>;
    };
    const warning = compiled.diagnostics.find(item => item.code === 'migration.deprecated_element');
    expect(warning).toMatchObject({ severity: 'warning', filePath: 'md/legacy.xml' });
    expect(warning?.suppressionScope).toMatchObject({ code: 'migration.deprecated_element', file: 'md/legacy.xml' });

    const explainResponse = await request.post(`${API}/api/agent/explain`, {
      headers: auth,
      data: { diagnostic: { severity: 'warning', code: warning!.code, filePath: warning!.filePath, message: 'fixture' } },
    });
    expect(explainResponse.ok(), await explainResponse.text()).toBeTruthy();
    expect(await explainResponse.json()).toMatchObject({
      success: true,
      mode: 'diagnostic',
      explanation: {
        deterministic: true,
        code: warning!.code,
        title: 'Version-sensitive pattern detected',
        ruleProvenance: { kind: 'unmatched', input: { code: warning!.code } },
      },
    });

    const xsdExplainResponse = await request.post(`${API}/api/agent/explain`, {
      headers: auth,
      data: { diagnostic: { severity: 'error', code: 'XSD_invalid_element', message: 'fixture' } },
    });
    expect(xsdExplainResponse.ok(), await xsdExplainResponse.text()).toBeTruthy();
    const xsdExplanation = await xsdExplainResponse.json();
    expect(xsdExplanation).toMatchObject({
      success: true,
      mode: 'diagnostic',
      explanation: {
        code: 'XSD_invalid_element',
        title: 'Game schema rejected this structure',
        basis: 'Configured X4 XSD selected by deterministic schema routing.',
        deterministic: true,
        ruleProvenance: {
          kind: 'matched',
          packId: 'x4.core.diagnostics',
          packVersion: '1.0.0',
          packSha256: '351cb0199c815df91861205bf0bce85b22ed98f1bb695dcaa9345f5001e2f9c0',
          ruleId: 'x4.schema.routed_validation',
          ruleVersion: '1.0.0',
          applicability: 'unavailable',
          evidence: {
            grade: 'schema',
            basis: 'Configured X4 XSD selected by deterministic schema routing.',
            digestSha256: 'f5786993e68ba1df76e89fba409a300ccd6e948dc84b9e1542e86e789bc0d847',
          },
        },
      },
    });
    expect(xsdExplanation.explanation.ruleProvenance.scope).toEqual({});

    const prepareResponse = await request.post(`${API}/api/agent/project-rules/prepare-suppression`, {
      headers: auth, data: { workspace, scope: warning!.suppressionScope },
    });
    expect(prepareResponse.ok(), await prepareResponse.text()).toBeTruthy();
    const prepared = await prepareResponse.json() as { expectedSha256: string | null; defaults: Record<string, string>; target: string };
    expect(prepared.expectedSha256).toBeNull();
    expect(prepared.target).toBe('r6_fixture/forge.rules.json');

    const externalBytes = `${JSON.stringify({ version: 1, suppressions: [], contracts: { knownChains: [], wireKeys: [], expectedRegisters: [] } }, null, 2)}\n`;
    fs.writeFileSync(rulesPath, externalBytes, 'utf8');
    const staleResponse = await request.post(`${API}/api/agent/project-rules/suppress`, {
      headers: auth,
      data: { workspace, scope: warning!.suppressionScope, expectedSha256: prepared.expectedSha256, review: { ...prepared.defaults, owner: 'Fixture Maintainer' } },
    });
    expect(staleResponse.status()).toBe(409);
    expect(await staleResponse.json()).toMatchObject({ code: 'RULES_FILE_CHANGED' });
    expect(fs.readFileSync(rulesPath, 'utf8')).toBe(externalBytes);

    const errorFinding = compiled.diagnostics.find(item => item.severity === 'error');
    expect(errorFinding).toBeTruthy();
    const beforeErrorAttempt = fs.readFileSync(rulesPath, 'utf8');
    const errorResponse = await request.post(`${API}/api/agent/project-rules/prepare-suppression`, {
      headers: auth,
      data: { workspace, scope: { code: errorFinding!.code, file: errorFinding!.filePath, ...(errorFinding!.sourceRef?.label ? { sourceRef: errorFinding!.sourceRef.label } : {}) } },
    });
    expect(errorResponse.status()).toBe(409);
    expect(await errorResponse.json()).toMatchObject({ code: 'DIAGNOSTIC_NOT_SUPPRESSIBLE' });
    expect(fs.readFileSync(rulesPath, 'utf8')).toBe(beforeErrorAttempt);


    const priorRule = {
      id: 'existing-rule', owner: 'Fixture Maintainer', reason: 'Previously reviewed %%BYTE%% note.',
      reviewBy: prepared.defaults.reviewBy, code: 'migration.deprecated_element', file: 'md/another.xml',
    };
    const annotatedRules = JSON.stringify({ version: 1, suppressions: [priorRule] });
    const [prefix, suffix] = annotatedRules.split('%%BYTE%%');
    const malformedRules = Buffer.concat([Buffer.from(prefix), Buffer.from([0x80]), Buffer.from(suffix)]);
    fs.writeFileSync(rulesPath, malformedRules);

    const invalidRulesPrepare = await request.post(`${API}/api/agent/project-rules/prepare-suppression`, {
      headers: auth, data: { workspace, scope: warning!.suppressionScope },
    });
    expect(invalidRulesPrepare.status()).toBe(409);
    expect(await invalidRulesPrepare.json()).toMatchObject({
      code: 'RULES_FILE_INVALID',
      details: expect.arrayContaining([expect.objectContaining({ code: 'rules.invalid_encoding', filePath: 'forge.rules.json' })]),
    });
    const invalidRulesApply = await request.post(`${API}/api/agent/project-rules/suppress`, {
      headers: auth,
      data: { workspace, scope: warning!.suppressionScope, expectedSha256: createHash('sha256').update(malformedRules).digest('hex'),
        review: { ...prepared.defaults, owner: 'Fixture Maintainer' } },
    });
    expect(invalidRulesApply.status()).toBe(409);
    expect(await invalidRulesApply.json()).toMatchObject({ code: 'RULES_FILE_INVALID' });
    expect(fs.readFileSync(rulesPath)).toEqual(malformedRules);
    const validRules = annotatedRules.replace('%%BYTE%%', '\uFFFD');
    fs.writeFileSync(rulesPath, validRules, 'utf8');

    const freshPrepareResponse = await request.post(`${API}/api/agent/project-rules/prepare-suppression`, {
      headers: auth, data: { workspace, scope: warning!.suppressionScope },
    });
    expect(freshPrepareResponse.ok(), await freshPrepareResponse.text()).toBeTruthy();
    const fresh = await freshPrepareResponse.json() as { expectedSha256: string; defaults: Record<string, string> };
    const commitResponse = await request.post(`${API}/api/agent/project-rules/suppress`, {
      headers: auth,
      data: { workspace, scope: warning!.suppressionScope, expectedSha256: fresh.expectedSha256, review: { ...fresh.defaults, owner: 'Fixture Maintainer' } },
    });
    expect(commitResponse.ok(), await commitResponse.text()).toBeTruthy();
    expect(await commitResponse.json()).toMatchObject({ success: true, status: 'VERIFIED', rule: { code: warning!.code, file: warning!.filePath } });
    const savedRules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    expect(savedRules.suppressions).toHaveLength(2);
    expect(savedRules.suppressions[0]).toEqual({ ...priorRule, reason: 'Previously reviewed \uFFFD note.' });

    const afterResponse = await request.post(`${API}/api/agent/compile`, { headers: auth, data: { workspace } });
    expect(afterResponse.ok(), await afterResponse.text()).toBeTruthy();
    const after = await afterResponse.json() as { diagnostics: Array<{ code: string }> };
    expect(after.diagnostics.some(item => item.code === 'migration.deprecated_element')).toBe(false);
  } finally {
    const restored = await request.post(`${API}/api/schema/config`, { headers: auth, data: restore });
    expect(restored.ok(), await restored.text()).toBeTruthy();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

async function waitForApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('readiness-ladder')).toBeVisible();
}

test('Diagnostics summary waits for current validation and skips unresolvable node errors', async ({ page }) => {
  const workspace = buildTemplateWorkspace('welcome');
  await seedServerWorkspace(workspace as unknown as Record<string, unknown>);
  let completeRecheck!: () => void;
  const recheck = new Promise<void>(resolve => { completeRecheck = resolve; });
  const graphError = {
    severity: 'error', category: 'syntax', code: 'fixture.action_error',
    message: 'Fixture action error.', nodeId: 'msg',
  };
  await page.route('**/api/agent/compile', async route => {
    const submitted = route.request().postDataJSON() as { workspace: ModWorkspace };
    const edited = !submitted.workspace.nodes.some(node => node.id === 'ev');
    if (edited) await recheck;
    await route.fulfill({ json: {
      diagnostics: edited ? [
        { ...graphError, nodeId: 'absent', message: 'No such canvas node.' },
        { ...graphError, nodeId: undefined, sourceRef: { kind: 'node', id: 'msg' } },
      ] : [graphError],
      validation: { scope: 'full-project', ok: false },
    } });
  });

  try {
    await waitForApp(page);
    const packageStage = page.getByTestId('readiness-stage-package');
    await packageStage.click();
    await expect(page.getByRole('button', { name: '1 Errors', exact: true })).toBeEnabled();
    const pendingRequest = page.waitForRequest(request => request.url().endsWith('/api/agent/compile')
      && request.method() === 'POST'
      && !(request.postDataJSON() as { workspace: ModWorkspace }).workspace.nodes.some(node => node.id === 'ev'));
    await page.getByTestId('canvas-node-ev').getByTitle('Delete Node').click();
    await pendingRequest;
    await packageStage.click();
    await expect(page.getByText('CHECKING...', { exact: true })).toBeVisible();
    const staleOrPending = page.getByRole('button', { name: /^(1 Errors|Checking errors…)$/ });
    await expect(staleOrPending).toBeDisabled();
    await expect(staleOrPending).toHaveText('Checking errors…');
    await expect(page.getByText('Checking warnings…', { exact: true })).toBeVisible();

    completeRecheck();
    const fresh = page.getByRole('button', { name: '2 Errors', exact: true });
    await expect(fresh).toBeEnabled();
    const target = page.getByTestId('canvas-node-msg');
    await expect(target).not.toHaveClass(/ring-cyan-500/);
    await fresh.press('Enter');
    await expect(target).toHaveClass(/ring-cyan-500/);
  } finally {
    completeRecheck();
  }
});

test('Diagnostics Center sends the source-bound native position from project validation', async ({ page, request, baseURL }, testInfo) => {
  const temp = testInfo.outputPath('diagnostic-source');
  const source = path.join(temp, 'source_fixture');
  const filePath = 'aiscripts/orders.xml';
  const xmlLines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<aiscript name="FixtureOrders">',
    '  <order id="Fixture" name="{1041, 551}" description="{1041, 552}" category="internal">',
    '    <params>',
    '      <!--🚀--><param name="radius" type="number"/>',
    '    </params>',
    '  </order>',
    '</aiscript>',
  ];
  const sourceBytes = Buffer.from('\uFEFF' + xmlLines.join('\r\n'), 'utf8');
  fs.mkdirSync(path.join(source, 'aiscripts'), { recursive: true });
  fs.writeFileSync(path.join(source, 'content.xml'), '<content id="source_fixture" name="Source Fixture" version="100"/>');
  const mdFiles = ['alpha', 'bravo'].map(stem => {
    const path = `md/${stem}.xml`;
    const value = stem === 'bravo' ? 'ware.forge_diagnostic_missing_fixture' : '1';
    const content = `<mdscript name="${stem}"><cues><cue name="Repeated">
      <conditions><event_game_started/></conditions><actions>
        <set_value name="$anchor" exact="1"/><set_value name="$target" exact="${value}"/>
      </actions></cue></cues></mdscript>`;
    return { path, content };
  });
  fs.mkdirSync(path.join(source, 'md'));
  for (const file of mdFiles) fs.writeFileSync(path.join(source, file.path), file.content);
  let workspace: ModWorkspace;
  const original = await request.get(`${API}/api/schema/config`, { headers: auth });
  expect(original.ok(), await original.text()).toBeTruthy();
  const state = await original.json();
  const configure = (modWorkspacePath: string) =>
    request.post(`${API}/api/schema/config`, { headers: auth, data: { modWorkspacePath } });
  const compile = async (fileOverrides?: Record<string, string>) => {
    const compiled = await request.post(`${API}/api/agent/compile`, { headers: auth, data: { workspace, fileOverrides } });
    expect(compiled.ok(), await compiled.text()).toBeTruthy();
    const result = await compiled.json();
    expect(result.validation.inputs).toMatchObject({
      diskSource: 'read', sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      sourceHashScope: 'project-validation-inputs-v1',
    });
    if (fileOverrides?.[filePath] !== undefined) {
      expect(result.validation.inputs.overrideFiles).toBe(1);
      expect(result.validation.inputs.differentDiskPaths).toContain(filePath);
    } else {
      expect(result.validation.inputs.differentDiskPaths).not.toContain(filePath);
    }
    return result.diagnostics as Array<{ filePath: string; code: string; sourceNavigation?: unknown }>;
  };
  const native = {
    path: filePath, sourceFolder: path.basename(source),
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    line: 4, column: xmlLines[4].indexOf('<param'),
  };
  try {
    const configured = await configure(temp);
    expect(configured.ok(), await configured.text()).toBeTruthy();
    const imported = await request.post(`${API}/api/agent/mod-folder/import`, {
      headers: { ...await ephemeralWorkspaceHeaders(true), 'x-forge-operation-id': `forge_op_${randomUUID().replaceAll('-', '')}` },
      data: { root: 'workspace', path: path.basename(source) },
    });
    expect(imported.ok(), await imported.text()).toBeTruthy();
    workspace = (await imported.json()).workspace;
    const graphTarget = workspace.nodes.find(node => node.source?.path === mdFiles[1].path
      && node.xmlTag === 'set_value' && node.properties.name === '$target');
    if (!graphTarget) throw new Error('The workspace import did not model the target action');
    workspace.nodes = workspace.nodes.map(node => node.properties.name === '$anchor' ? { ...node, x: 6000, y: 6000 } : node);
    // Keep the AI script on disk so the compile route validates its untouched source bytes.
    fs.writeFileSync(path.join(source, filePath), sourceBytes);
    await seedServerWorkspace(workspace as unknown as Record<string, unknown>);
    const aiFinding = (entries: Awaited<ReturnType<typeof compile>>) => entries.find(entry =>
      entry.filePath === filePath && entry.code === 'aiscript.order_param_missing_text');
    const findings = await compile();
    expect(aiFinding(findings)).toMatchObject({ severity: 'error', sourceNavigation: { status: 'ready', ...native } });
    expect(findings.find(entry => entry.filePath === mdFiles[1].path && entry.code === 'reference.unknown_ware')).toMatchObject({
      sourceNavigation: { status: 'ready', nodeId: graphTarget.id },
    });
    expect(aiFinding(await compile({ [filePath]: xmlLines.join('\n') }))).toMatchObject({
      sourceNavigation: { status: 'unavailable', reason: 'source-mismatch' },
    });

    await page.setContent(`<!doctype html><iframe id="forge" width="1200" height="700"></iframe>
      <script>
        const forge = document.querySelector('#forge');
        window.addEventListener('message', event => {
          if (event.source === forge.contentWindow && event.data?.type === 'open-validated-source') {
            document.body.dataset.fileRequest = JSON.stringify(event.data);
          }
        });
        forge.src = ${JSON.stringify(new URL('/', baseURL).href)};
      </script>`);
    const studio = page.frameLocator('#forge');
    await studio.getByTestId('readiness-stage-package').click();
    const action = studio.getByTestId('diagnostic-finding').filter({ hasText: 'aiscript.order_param_missing_text' })
      .getByRole('button', { name: 'Open source at line 5' });
    await action.press('Enter');
    await expect(studio.getByText('Native editor request sent.', { exact: true })).toBeVisible();
    await expect.poll(() => page.locator('body').getAttribute('data-file-request').then(value => value && JSON.parse(value))).toEqual({
      source: 'x4forge-studio', type: 'open-validated-source', path: native.path, sourceFolder: native.sourceFolder,
      line: native.line, column: native.column, expectedSourceSha256: native.sha256,
    });
    const scriptFilter = studio.getByTestId('canvas-md-script-filter');
    await scriptFilter.selectOption('alpha');
    await studio.locator('[data-sidebar-tab="cues"]').click();
    await studio.getByRole('button', { name: 'CLEAR ALL', exact: true }).click();
    const target = studio.getByTestId(`canvas-node-${graphTarget.id}`);
    await expect(target).toHaveCount(0);
    await studio.getByTestId('readiness-stage-package').click();
    const graphFinding = studio.getByTestId('diagnostic-finding').filter({ hasText: 'forge_diagnostic_missing_fixture' })
      .filter({ hasText: 'reference.unknown_ware' });
    await expect(graphFinding.getByRole('button', { name: 'Open source at line', exact: false })).toHaveCount(0);
    await graphFinding.getByRole('button', { name: 'Go to canvas node' }).press('Enter');
    await expect(scriptFilter).toHaveValue('bravo');
    await expect(target).toHaveClass(/ring-cyan-500/);
    // Wait through the deferred file-fit so an immediately centered, then hidden node cannot pass.
    const centered = await target.evaluate(node => new Promise<boolean>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const viewport = node.closest('[data-testid="grid-canvas"]')!.getBoundingClientRect();
        const bounds = node.getBoundingClientRect();
        resolve(Math.abs(bounds.left - viewport.left - viewport.width / 2) < 35
          && Math.abs(bounds.top - viewport.top - viewport.height / 2) < 35);
      }))));
    expect(centered).toBeTruthy();
    expect(fs.readFileSync(path.join(source, filePath)).equals(sourceBytes)).toBeTruthy();
  } finally {
    const restored = await configure(state.config?.modWorkspacePath || '');
    expect(restored.ok(), await restored.text()).toBeTruthy();
    if (path.dirname(path.resolve(temp)) !== path.resolve(testInfo.outputDir)) throw new Error('Unexpected fixture location');
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Diagnostics Center renders deterministic Why guidance and the reviewed suppression dialog', async ({ page }, testInfo) => {
  const workspace = buildTemplateWorkspace('welcome');
  await seedServerWorkspace(workspace as unknown as Record<string, unknown>);
  await page.route('**/api/agent/compile', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      diagnostics: [{
        severity: 'warning', category: 'references', domain: 'md', code: 'scriptproperty.unknown',
        filePath: 'md/example.xml', message: 'Unknown property segment cargo.',
        sourceRef: { kind: 'project', label: '$ship.cargo.unknown' },
        suppressionScope: { code: 'scriptproperty.unknown', file: 'md/example.xml', sourceRef: '$ship.cargo.unknown' },
      }, {
        severity: 'error', category: 'syntax', domain: 'schema', code: 'XSD_invalid_element',
        filePath: 'md/schema-fixture.xml', message: 'Fixture XSD structure finding.',
        sourceRef: { kind: 'project', label: 'XSD_invalid_element' },
      }, ...Array.from({ length: 665 }, (_, index) => index === 600 || index === 601 ? {
        severity: 'warning', category: 'references', code: 'fixture.late_rule',
        filePath: 'md/late-group.xml', message: 'A repeated fixture warning.',
        line: 601, column: index === 600 ? 8 : 29, sourceRef: { kind: 'node', label: 'Show Help', id: 'msg' },
      } : {
        severity: 'info', category: 'references', code: 'fixture.coverage',
        filePath: `md/fixture-batch-${Math.floor(index / 32)}.xml`,
        message: `Coverage fixture ${index + 1}.`, coverageGap: true,
      }), {
        severity: 'info', category: 'references', code: 'x4-ui.truncated-evidence', coverageGap: true,
        filePath: 'ui/addons/ai_influence_chat/aic_account.lua', line: 1, column: 0,
        message: 'X4 UI verification evidence was truncated. Not statically verified.',
      }],
      validation: { scope: 'full-project', ok: false },
      validationDelta: {
        status: 'compared', modId: 'x4_welcome_message', currentContentHash: 'b'.repeat(64),
        baseline: { status: 'available', contentHash: 'a'.repeat(64), recordedAt: '2026-07-30T12:00:00.000Z' },
        counts: { current: 3, baseline: 2, new: 2, resolved: 1, unchanged: 1 },
        newWarnings: [], resolvedWarnings: [],
      },
    }),
  }));
  await page.route('**/api/agent/project-rules/prepare-suppression', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true, target: 'example/forge.rules.json', expectedSha256: null, existingSuppressions: 0,
      scope: { code: 'scriptproperty.unknown', file: 'md/example.xml', sourceRef: '$ship.cargo.unknown' },
      defaults: { id: 'suppress-scriptproperty-unknown', owner: '', reason: 'Reviewed exact fixture warning.', reviewBy: '2026-10-28' },
    }),
  }));
  await page.addInitScript(() => localStorage.setItem('x4_ai_tier', 'off'));
  let releaseFirstSelftest!: () => void;
  const firstSelftestCanFinish = new Promise<void>(resolve => { releaseFirstSelftest = resolve; });
  const coreSelftestPath = '/api/agent/selftest';
  await page.route(/\/api\/agent\/(?:selftest|[\w-]+-selftest|md-audit|lua-snippets|patch-audit)$/, async route => {
    if (new URL(route.request().url()).pathname === coreSelftestPath) await firstSelftestCanFinish;
    await route.fulfill({ json: { pass: true } });
  });
  await waitForApp(page);

  const opening = performance.now();
  await page.getByTestId('readiness-stage-package').click();
  await expect(page.getByTestId('diagnostics-scope-package')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('diagnostic-why-scriptproperty.unknown')).toBeVisible();
  console.log(`FORGE_DIAGNOSTIC_LIST_COUNTS: ${JSON.stringify({
    mounted: await page.locator('button[data-testid^="diagnostic-why-"]').count(),
    openMs: performance.now() - opening,
  })}`);
  const list = page.getByTestId('diagnostic-findings');
  const rows = list.getByTestId('diagnostic-finding');
  const search = list.getByRole('searchbox', { name: 'Search diagnostics' });
  const severity = list.getByRole('combobox', { name: 'Filter diagnostics' });
  const tools = page.getByTestId('diagnostic-tools');
  const toolsSummary = tools.locator('summary');
  const toolsStatus = tools.getByTestId('diagnostic-tools-status');
  const runAllSelftests = tools.getByRole('button', { name: 'Run All Selftests' });
  try {
    await expect(toolsSummary).toContainText('Diagnostic tools');
    await expect(tools).toHaveJSProperty('open', false);
    await expect(runAllSelftests).toBeHidden();
    await expect(rows.filter({ hasText: 'Unknown property segment cargo.' })).toBeVisible();

    await toolsSummary.press('Enter');
    await expect(tools).toHaveJSProperty('open', true);
    await expect(tools.getByText('DETERMINISTIC CRITIC', { exact: true })).toBeVisible();
    await expect(runAllSelftests).toBeVisible();
    await expect(tools.getByRole('button', { name: 'Ask AI Assistant For Fixes', includeHidden: true })).toHaveCount(0);

    const firstSelftest = page.waitForRequest(request => new URL(request.url()).pathname === coreSelftestPath);
    await runAllSelftests.click();
    await firstSelftest;
    await expect(tools.getByRole('button', { name: /Running/ })).toBeDisabled();
    await toolsSummary.press('Enter');
    await expect(tools).toHaveJSProperty('open', false);
    await expect(toolsStatus).toContainText('Selftests running');
  } finally {
    releaseFirstSelftest();
  }
  await expect(toolsStatus).toBeVisible();
  await expect(toolsStatus).toContainText('Selftests: 31/31 passed');
  await expect(tools).toHaveJSProperty('open', false);
  await expect(toolsSummary).toBeFocused();
  await toolsSummary.press('Enter');
  await expect(runAllSelftests).toBeVisible();
  await expect(tools.getByText('31/31 PASS', { exact: true })).toBeVisible();
  await toolsSummary.press('Enter');
  await expect(tools).toHaveJSProperty('open', false);
  await expect(toolsSummary).toBeFocused();
  await expect(rows.filter({ hasText: 'Unknown property segment cargo.' })).toBeVisible();

  await expect(page.getByRole('button', { name: '1 Errors' })).toBeVisible();
  await expect(page.getByText('3 Warnings', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find diagnostics' }).click();
  await expect(search).toBeFocused();
  await expect(search).toBeInViewport();
  await expect(list.getByRole('status')).toHaveText('Showing 1–40 of 668 findings');
  await expect(rows).toHaveCount(40);
  await expect(list.getByText('Source: project / XSD_invalid_element', { exact: true })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Source: project / XSD_invalid_element' })).toHaveCount(0);
  await list.getByTestId('diagnostic-why-scriptproperty.unknown').click();
  await expect(list.getByTestId('diagnostic-why-panel')).toBeVisible();
  await list.getByRole('button', { name: 'Next findings' }).click();
  await expect(list.getByRole('status')).toHaveText('Showing 41–80 of 668 findings');
  await expect(rows).toHaveCount(40);
  await severity.selectOption('coverage');
  await expect(list.getByRole('status')).toHaveText('Showing 1–40 of 664 findings · 668 total');
  await expect(rows).toHaveCount(40);
  await search.fill('ui/addons/ai_influence_chat/aic_account.lua x4-ui.truncated-evidence');
  await expect(rows).toHaveCount(1);
  await rows.getByTestId('diagnostic-why-x4-ui.truncated-evidence').click();
  const coverageWhy = rows.getByTestId('diagnostic-why-panel');
  await expect(coverageWhy).toContainText('Lua UI verification is incomplete');
  await expect(coverageWhy).toContainText('The file remains partly unverified.');
  await expect(coverageWhy).toContainText('Review the retained coverage gaps for this file.');
  await expect(rows.getByRole('button', { name: 'Suppress' })).toHaveCount(0);
  await severity.selectOption('warning');
  await search.fill('md\\late-group.xml fixture.late_rule');
  await expect(list.getByRole('heading', { name: 'md/late-group.xml' })).toBeVisible();
  await expect(list.getByRole('status')).toHaveText('Showing 1–2 of 2 findings · 668 total');
  await expect(rows).toHaveCount(2);
  await expect(list.getByTestId('diagnostic-why-panel')).toHaveCount(0);
  const firstMatch = rows.filter({ hasText: 'line 601:8' });
  const secondMatch = rows.filter({ hasText: 'line 601:29' });
  await expect(firstMatch.getByRole('button', { name: 'Source: node / Show Help / msg' })).toBeVisible();
  await firstMatch.getByTestId('diagnostic-why-fixture.late_rule').click();
  await expect(firstMatch.getByTestId('diagnostic-why-panel')).toBeVisible();
  await search.fill('md\\late-group.xml fixture.late_rule 601:29');
  await expect(rows).toHaveCount(1);
  await expect(secondMatch.getByTestId('diagnostic-why-panel')).toHaveCount(0);
  const target = page.getByTestId('canvas-node-msg');
  await expect(target).not.toHaveClass(/ring-cyan-500/);
  await secondMatch.getByRole('button', { name: 'Source: node / Show Help / msg' }).press('Enter');
  await expect(target).toHaveClass(/ring-cyan-500/);
  await search.fill('no matching fixture name');
  await expect(list.getByRole('status')).toHaveText('No matching diagnostics · 668 total');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('Mod Status Clean', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '1 Errors' })).toBeVisible();
  await list.getByRole('button', { name: 'Clear filters' }).click();
  await expect(list.getByRole('status')).toHaveText('Showing 1–40 of 668 findings');
  await expect(rows).toHaveCount(40);
  await page.getByRole('button', { name: 'Find diagnostics' }).click();
  await expect(severity).toBeInViewport();
  await expect(list.getByRole('button', { name: 'Next findings' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('large-project-diagnostics.png') });
  await expect(page.getByTestId('validation-delta-card')).toContainText('2 new · 1 resolved · 1 unchanged');
  await expect(page.getByTestId('validation-delta-card')).toContainText('Since last green');
  const why = page.getByTestId('diagnostic-why-scriptproperty.unknown');
  await expect(why).toBeVisible();
  await why.scrollIntoViewIfNeeded();
  const geometry = await why.evaluate(element => {
    const footer = [...document.querySelectorAll('div')].find(candidate => candidate.textContent?.trim() === 'Engine Context: Egosoft MD 4.5');
    const button = element.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const ancestors: Array<Record<string, unknown>> = [];
    let cursor: HTMLElement | null = element.parentElement;
    while (cursor && ancestors.length < 8) {
      const rect = cursor.getBoundingClientRect();
      const style = getComputedStyle(cursor);
      ancestors.push({ className: cursor.className, top: rect.top, bottom: rect.bottom, height: rect.height, clientHeight: cursor.clientHeight, scrollHeight: cursor.scrollHeight, overflowY: style.overflowY });
      cursor = cursor.parentElement;
    }
    return { button: { top: button.top, bottom: button.bottom }, footer: footerRect ? { top: footerRect.top, bottom: footerRect.bottom } : null, ancestors };
  });
  expect(geometry.footer, JSON.stringify(geometry)).not.toBeNull();
  expect(geometry.button.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.footer!.top);
  await why.click();
  await expect(page.getByTestId('diagnostic-why-panel')).toContainText('Unknown X4 script properties commonly evaluate to null');
  await expect(page.getByTestId('diagnostic-why-panel')).toContainText('deterministic, no AI');

  const xsdWhy = page.getByTestId('diagnostic-why-XSD_invalid_element');
  await expect(xsdWhy).toBeVisible();
  await xsdWhy.scrollIntoViewIfNeeded();
  await xsdWhy.click();
  const xsdPanel = page.getByTestId('diagnostic-why-panel').filter({ hasText: 'x4.schema.routed_validation' });
  await expect(xsdPanel).toContainText('Rule ID/version: x4.schema.routed_validation / 1.0.0');
  await expect(xsdPanel).toContainText('Evidence grade: schema');
  await expect(xsdPanel).toContainText('Applicability: unavailable');
  await expect(xsdPanel).toContainText('Pack ID/version: x4.core.diagnostics / 1.0.0');
  await expect(xsdPanel).toContainText('Pack SHA-256: 351cb0199c815df91861205bf0bce85b22ed98f1bb695dcaa9345f5001e2f9c0');
  await expect(xsdPanel).toContainText('Evidence basis: Configured X4 XSD selected by deterministic schema routing.');
  await expect(xsdPanel).toContainText('Evidence digest: f5786993e68ba1df76e89fba409a300ccd6e948dc84b9e1542e86e789bc0d847');
  await expect(xsdPanel).toContainText('Game scope: all versions (no explicit bounds)');
  await expect(xsdPanel).toContainText('deterministic, no AI');

  await page.getByTestId('diagnostic-suppress-scriptproperty.unknown').click();
  await expect(page.getByTestId('suppression-review-dialog')).toBeVisible();
  await expect(page.getByTestId('suppression-review-dialog')).toContainText('This acknowledges one warning; it does not fix source code.');
  await expect(page.getByTestId('suppression-owner')).toHaveValue('');
  await expect(page.getByTestId('suppression-confirm')).toBeVisible();
});
