import { expect, test } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { readServerWorkspace, readServerWorkspaceEnvelope, seedServerWorkspace } from './ephemeral';

const targetFiles = [
  'assets/units/size_xl/macros/ship_test_a.xml',
  'assets/units/size_xl/macros/ship_test_b.xml',
  'assets/units/size_xl/macros/helper_without_hull.xml',
];

test.setTimeout(180_000);
test.use({ viewport: { width: 1920, height: 1080 } });

test('corpus authoring blocks collisions, completes XPath, previews, applies, and undoes atomically', async ({ page }) => {
  const workspace = { ...buildTemplateWorkspace('welcome'), wares: [], jobs: [], xmlPatches: [] };
  await seedServerWorkspace(workspace);
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });

  // Hold both initial lookups until the real commit-time Checking state is inspected.
  let releaseCollisionResponses!: () => void;
  const collisionResponses = new Promise<void>(resolve => { releaseCollisionResponses = resolve; });
  let collisionReleased = false;
  const collisionArrivals = { advisory: 0, commit: 0 };
  const collisionFulfillmentCalls = { advisory: 0, commit: 0 };
  const collisionSettlements: Promise<void>[] = [];
  const collisionFailures: unknown[] = [];

  await page.route('**/api/reference/suggest**', async route => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const kind = url.searchParams.get('kind') || 'ware';
    const limit = url.searchParams.get('limit');
    const collisionLookup = !collisionReleased && route.request().method() === 'GET'
      && url.pathname === '/api/reference/suggest' && url.searchParams.get('kind') === 'ware' && query === 'energycells'
      && url.searchParams.get('intent') === 'new-definition'
      ? limit === '25' ? 'advisory' : limit === '10' ? 'commit' : null : null;
    let settleCollision: (() => void) | undefined;
    try {
      if (collisionLookup) {
        collisionArrivals[collisionLookup] += 1;
        collisionSettlements.push(new Promise<void>(resolve => { settleCollision = resolve; }));
        await collisionResponses;
      }
      const catalog: Record<string, Array<{ id: string; name: string; path: string; selector?: string }>> = {
        ware: [{ id: 'energycells', name: 'Energy Cells', path: 'libraries/wares.xml', selector: "/wares/ware[@id='energycells']" }],
        faction: [{ id: 'argon', name: 'Argon Federation', path: 'libraries/factions.xml', selector: "/factions/faction[@id='argon']" }],
        aiscript: [{ id: 'order.patrol', name: 'Order Patrol', path: 'aiscripts/order.patrol.xml' }],
        macro: [{ id: 'ship_arg_l_destroyer_01_a_macro', name: 'Argon Destroyer', path: 'index/macros.xml' }],
      };
      const items = (catalog[kind] || [])
        .filter(item => query.length > 0 && item.id.toLowerCase().includes(query))
        .map(item => ({
          label: item.id, insertText: item.id, kind, name: item.name,
          detail: `${item.name} · base`, documentation: `${item.id} already exists in base`,
          source: 'base', path: item.path, selector: item.selector, exists: true, score: 0,
        }));
      await route.fulfill({ json: { generation: 'e2e', kind, query, intent: url.searchParams.get('intent'), items } });
      if (collisionLookup) collisionFulfillmentCalls[collisionLookup] += 1;
    } catch (error) {
      if (!collisionLookup) throw error;
      // Surface held-route failures after settlement without replacing a primary assertion.
      collisionFailures.push(error);
    } finally {
      settleCollision?.();
    }
  });

  await page.route('**/api/reference/manifest**', async route => {
    await route.fulfill({
      json: {
        status: { available: true, state: 'ready' }, generation: 'e2e-corpus', total: targetFiles.length,
        limit: 100, offset: 0,
        files: targetFiles.map((file, index) => ({ path: file, source: index ? 'ego_dlc_test' : 'base', extension: '.xml', bytes: 10_000 - index })),
      },
    });
  });

  await page.route('**/api/reference/xpath-complete', async route => {
    const body = route.request().postDataJSON() as { selector: string; cursor: number };
    const partial = body.selector.slice(0, body.cursor).match(/[A-Za-z_][\w.:-]*$/)?.[0] || '';
    await route.fulfill({
      json: {
        path: targetFiles[0], signature: 'e2e-source', sources: [{ source: 'base', mode: 'base' }], findings: [],
        items: partial.toLowerCase().startsWith('h')
          ? [{ label: 'hull', kind: 'Element', detail: 'Child of /macros/macro/properties', insertText: 'hull', replaceStart: body.cursor - partial.length, replaceEnd: body.cursor }]
          : [],
      },
    });
  });

  const planFor = async (rule: Record<string, unknown>) => {
    const envelope = await readServerWorkspaceEnvelope();
    const operations = Array.isArray(rule.operations) && rule.operations.length
      ? rule.operations as Array<{ id: string; selector: string }>
      : [{ id: 'operation-1', selector: String(rule.selector) }];
    const changesFor = (fileIndex: number) => operations.map((operation, operationIndex) => ({
      operationId: operation.id,
      selector: operation.selector,
      oldValue: operationIndex ? String(10 + fileIndex) : (fileIndex ? '210000' : '216000'),
      newValue: operationIndex ? String(15 + fileIndex) : (fileIndex ? '315000' : '324000'),
    }));
    const rows = targetFiles.slice(0, 2).flatMap((targetFile, fileIndex) => changesFor(fileIndex).map((change, operationIndex) => ({
      targetFile, selector: change.selector, oldValue: change.oldValue, newValue: change.newValue,
      sourceSignature: `e2e-source-${fileIndex}`,
      sources: [{ source: fileIndex ? 'ego_dlc_test' : 'base', mode: fileIndex ? 'diff' : 'base' }],
      simulationOk: true, findings: [],
      patch: {
        id: `bulk_e2e_${fileIndex}_${operationIndex}`, sel: change.selector, action: 'replace',
        content: change.newValue, note: 'Bulk bundle transform from canonical value',
        targetFile, includeInBuild: true, generatedRuleId: 'bulk-e2e', generatedPlanHash: 'plan-e2e', sourceSignature: `e2e-source-${fileIndex}`,
      },
    })));
    return {
      ok: true, rule, ruleId: 'bulk-e2e', planHash: 'plan-e2e', corpusGeneration: 'e2e-corpus',
      candidateCount: 3, matchedFiles: 2, skippedFiles: 1, droppedCount: 0,
      rows,
      files: [
        ...targetFiles.slice(0, 2).map((targetFile, fileIndex) => {
          const changes = changesFor(fileIndex);
          return {
            targetFile, status: 'matched', matchCount: changes.length,
            oldValue: changes[0].oldValue, newValue: changes[0].newValue, changes,
            sourceSignature: `e2e-source-${fileIndex}`,
            sources: [{ source: fileIndex ? 'ego_dlc_test' : 'base', mode: fileIndex ? 'diff' : 'base' }],
            simulationOk: true, findings: [],
          };
        }),
        {
          targetFile: targetFiles[2], status: 'skipped', matchCount: 0,
          sourceSignature: 'e2e-source-2', sources: [{ source: 'base', mode: 'base' }], findings: [],
        },
      ],
      conflicts: [], findings: [], workspaceId: envelope.workspaceId,
      workspaceHash: envelope.workspaceHash, snapshotHash: envelope.snapshotHash,
    };
  };

  await page.route('**/api/agent/bulk-transform/preview', async route => {
    const body = route.request().postDataJSON() as { rule: Record<string, unknown> };
    await route.fulfill({ status: 200, json: await planFor(body.rule) });
  });

  await page.route('**/api/agent/bulk-transform/apply', async route => {
    const body = route.request().postDataJSON() as { rule: Record<string, unknown>; expectedPlanHash: string; expectedHead: string; expectedSnapshotHash: string };
    expect(route.request().headers()['x-forge-operation-id']).toEqual(expect.stringMatching(/^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/));
    const before = await readServerWorkspaceEnvelope();
    expect(body.expectedPlanHash).toBe('plan-e2e');
    expect(body.expectedHead).toBe(before.workspaceHash);
    expect(body.expectedSnapshotHash).toBe(before.snapshotHash);
    const plan = await planFor(body.rule);
    const patched = { ...before.workspace, xmlPatches: plan.rows.map(row => row.patch) };
    await seedServerWorkspace(patched);
    const after = await readServerWorkspaceEnvelope();
    await route.fulfill({ status: 200, json: { success: true, applied: true, added: plan.rows.length, plan, ...after } });
  });

  await page.goto('/');
  await page.waitForFunction((name: string) => {
    const api = (window as Window & { AgentRuntime?: { getCurrentWorkspace: () => { name?: string } } }).AgentRuntime;
    return api?.getCurrentWorkspace().name === name;
  }, workspace.name);

  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await healthCard.isVisible()) await page.getByTestId('health-card-dismiss').click();

  await page.locator('button[title="Wares & Jobs"]').click();
  await page.getByRole('button', { name: 'ADD', exact: true }).click();
  const newWare = page.getByPlaceholder('ware_antimatter_capsules');
  try {
    await newWare.fill('energycells');
    await expect.poll(() => collisionArrivals.advisory).toBe(1);
    await page.getByRole('button', { name: 'Add', exact: true }).last().click();
    await expect.poll(() => collisionArrivals.commit).toBe(1);
    await expect(page.getByRole('button', { name: 'Checking…', exact: true })).toBeVisible();
    expect(collisionArrivals).toEqual({ advisory: 1, commit: 1 });
    expect(collisionFulfillmentCalls).toEqual({ advisory: 0, commit: 0 });
  } finally {
    collisionReleased = true;
    releaseCollisionResponses();
    await Promise.all(collisionSettlements);
  }
  if (collisionFailures.length) throw collisionFailures[0];
  expect(collisionArrivals).toEqual({ advisory: 1, commit: 1 });
  expect(collisionFulfillmentCalls).toEqual({ advisory: 1, commit: 1 });
  await expect(page.getByText('"energycells" already exists in the X4 corpus. Patch the existing definition instead.', { exact: true })).toBeVisible();
  await expect(page.getByText('EXISTS', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add', exact: true }).last()).toBeDisabled();
  await page.getByRole('button', { name: 'Patch existing energycells', exact: true }).click();
  await expect(page.getByText("Patch existing: /wares/ware[@id='energycells']", { exact: true })).toBeVisible();
  expect((await readServerWorkspace()).wares).toHaveLength(0);

  // A true reference field has the opposite behavior: partial canonical text completes
  // to the existing ID and stores it. Exercise this separately from the new-definition
  // collision rail so both semantics stay proven.
  await page.locator('button[title="Wares & Jobs"]').click();
  await page.getByRole('button', { name: 'ADD', exact: true }).click();
  await page.getByPlaceholder('ware_antimatter_capsules').fill('forge_test_ware');
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await expect.poll(async () => (await readServerWorkspace()).wares?.length || 0, { timeout: 30_000 }).toBe(1);
  await page.getByRole('button', { name: 'Add input', exact: true }).click();
  const wareReference = page.getByPlaceholder('Search ware…');
  await wareReference.fill('energyc');
  await page.locator('button').filter({ hasText: 'energycells' }).filter({ hasText: 'base' }).click();
  await expect(wareReference).toHaveValue('energycells');
  await expect.poll(async () => (await readServerWorkspace()).wares?.[0]?.primaryWares?.[0]?.ware || '', { timeout: 30_000 }).toBe('energycells');

  await page.getByRole('button', { name: 'jobs.xml', exact: true }).click();
  await page.getByRole('button', { name: 'ADD', exact: true }).click();
  await page.getByPlaceholder('job_trader_hauler').fill('forge_test_job');
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await expect.poll(async () => (await readServerWorkspace()).jobs?.length || 0, { timeout: 30_000 }).toBe(1);
  const factionReference = page.getByPlaceholder('Search factions… (stores the short code)');
  await factionReference.fill('arg');
  await page.locator('button').filter({ hasText: 'argon' }).filter({ hasText: 'base' }).click();
  await expect(factionReference).toHaveValue('argon');
  const scriptReference = page.getByPlaceholder('Search canonical/project AI scripts…');
  await scriptReference.fill('order.pat');
  await page.locator('button').filter({ hasText: 'order.patrol' }).filter({ hasText: 'base' }).click();
  await expect(scriptReference).toHaveValue('order.patrol');
  const macroReference = page.getByPlaceholder('Search canonical ship macros…');
  await macroReference.fill('ship_arg_l_des');
  await page.locator('button').filter({ hasText: 'ship_arg_l_destroyer_01_a_macro' }).filter({ hasText: 'base' }).click();
  await expect(macroReference).toHaveValue('ship_arg_l_destroyer_01_a_macro');
  await expect.poll(async () => {
    const job = (await readServerWorkspace()).jobs?.[0];
    return `${job?.faction}|${job?.taskScript}|${job?.shipMacro}`;
  }, { timeout: 30_000 }).toBe('argon|order.patrol|ship_arg_l_destroyer_01_a_macro');

  await page.locator('button[title="XML Patching"]').click();
  await page.getByRole('button', { name: 'Bulk transform', exact: true }).click();
  await expect(page.getByText(`sample: ${targetFiles[0]}`, { exact: true })).toBeVisible();
  const selector = page.getByTestId('bulk-selector');
  await selector.fill('/macros/macro/properties/h');
  await page.getByRole('button', { name: /hull.*Element/i }).click();
  await expect(selector).toHaveValue('/macros/macro/properties/hull');
  await selector.fill('/macros/macro/properties/hull/@max');
  await page.getByTestId('bulk-rounding').selectOption('ceil');
  await page.getByTestId('bulk-rounding-increment').fill('1000');
  await page.getByTestId('bulk-add-operation').click();
  await page.getByTestId('bulk-selector-1').fill('/macros/macro/properties/recharge/@rate');
  await page.getByTestId('bulk-operation-1').selectOption('add');
  await page.getByLabel('Field 2 operand').fill('5');

  const beforePreview = await readServerWorkspaceEnvelope();
  await page.getByRole('button', { name: 'Preview against corpus', exact: true }).click();
  await expect(page.getByText('2 VALIDATED', { exact: true })).toBeVisible();
  await expect(page.getByText('2 fields').first()).toBeVisible();
  await page.getByText(targetFiles[0], { exact: true }).click();
  await expect(page.getByText('combined atomic preview', { exact: false })).toBeVisible();
  await expect(page.getByText('216000')).toBeVisible();
  await expect(page.getByText('324000')).toBeVisible();
  await expect(page.getByText('0 matches', { exact: true })).toBeVisible();
  await expect(page.getByText('SKIP', { exact: true })).toBeVisible();
  const afterPreview = await readServerWorkspaceEnvelope();
  expect(afterPreview.workspaceHash).toBe(beforePreview.workspaceHash);
  expect(afterPreview.version).toBe(beforePreview.version);

  // The startup walkaround fetch is intentionally independent of this workflow and may
  // resolve after the initial 1.5 s dismissal probe on slower full-suite runs. Exercise
  // its real dismiss control again instead of forcing a click through the visible card.
  if (await healthCard.isVisible()) await page.getByTestId('health-card-dismiss').click();
  await page.getByRole('button', { name: 'Add 4 validated field patches to workspace', exact: true }).click();
  await expect.poll(async () => (await readServerWorkspace()).xmlPatches?.length || 0).toBe(4);
  await expect(page.locator('button[title="Undo last action (Ctrl+Z)"]')).toBeEnabled();
  await page.locator('button[title="Undo last action (Ctrl+Z)"]').click();
  await expect.poll(async () => (await readServerWorkspace()).xmlPatches?.length || 0, { timeout: 20_000 }).toBe(0);
});

test('guided hull editing binds one canonical attribute, applies its preview, and undoes it', async ({ page }) => {
  const workspace = { ...buildTemplateWorkspace('welcome'), xmlPatches: [] };
  await seedServerWorkspace(workspace);
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });

  const [targetFile, ambiguousFile] = targetFiles;
  const selector = "/macros/macro[@name='ship_test_a_macro']/properties/hull/@max";
  const signature = 'guided-hull-source';
  const baseXml = [
    '<macros><macro name="ship_test_a_macro" class="ship_xl"><properties>',
    '  <hull max="1190000"/>',
    '</properties></macro></macros>',
  ].join('\n');
  const sources = [{ source: 'base', path: targetFile, mode: 'base' }];
  await page.route('**/api/reference/effective-file**', async route => {
    const path = new URL(route.request().url()).searchParams.get('path');
    if (path !== targetFile && path !== ambiguousFile) {
      return route.fulfill({ status: 404, json: { error: 'No effective file in this fixture.' } });
    }
    return route.fulfill({ json: {
      available: true, complete: true, relativePath: path, signature, sources,
      content: path === ambiguousFile ? baseXml.replace('</properties>', '<hull max="2"/></properties>') : baseXml,
    } });
  });

  const patch = {
    id: 'guided-hull-patch', action: 'replace' as const, sel: selector, targetFile, content: '1200000',
    note: 'Guided hull fixture', includeInBuild: true, sourceSignature: signature,
  };
  const planFor = (match: boolean, envelope: { workspaceId: string; workspaceHash: string; snapshotHash: string }) => {
    const row = {
      targetFile, selector, oldValue: '1190000', newValue: '1200000',
      sourceSignature: match ? signature : 'obsolete-source', sources, simulationOk: true, findings: [], patch,
    };
    return {
      ok: true, planHash: 'guided-hull-plan', candidateCount: 1, matchedFiles: 1, skippedFiles: 0,
      droppedCount: 0, rows: [row], conflicts: [], findings: [],
      workspaceId: envelope.workspaceId, workspaceHash: envelope.workspaceHash, snapshotHash: envelope.snapshotHash,
    };
  };

  let previewCount = 0;
  let holdNextApply = false;
  let applySavedBeforeReply = false;
  let releaseApply!: () => void;
  const heldApply = new Promise<void>(resolve => { releaseApply = resolve; });
  await page.route('**/api/agent/bulk-transform/preview', async route => {
    const { rule } = route.request().postDataJSON();
    expect(rule).toMatchObject({
      pathPrefix: targetFile, selector, maxFiles: 1, operation: 'set', operand: 1200000,
      operations: [{ id: 'maximum-hull', selector, operation: 'set', operand: 1200000 }],
    });
    const plan = planFor(++previewCount > 1, await readServerWorkspaceEnvelope());
    return route.fulfill({ json: previewCount === 2 ? { ...plan, workspaceId: 'different-workspace' } : plan });
  });
  await page.route('**/api/agent/bulk-transform/apply', async route => {
    const before = await readServerWorkspaceEnvelope();
    expect(route.request().headers()['x-forge-operation-id']).toBeTruthy();
    expect(route.request().postDataJSON()).toMatchObject({
      expectedPlanHash: 'guided-hull-plan', expectedHead: before.workspaceHash,
      expectedSnapshotHash: before.snapshotHash,
      rule: { pathPrefix: targetFile, selector, maxFiles: 1, operation: 'set', operand: 1200000 },
    });
    await seedServerWorkspace({ ...before.workspace, xmlPatches: [patch] });
    const after = await readServerWorkspaceEnvelope();
    if (holdNextApply) {
      applySavedBeforeReply = true;
      await heldApply;
    }
    return route.fulfill({ json: { success: true, plan: planFor(true, before), ...after } });
  });

  await page.goto('/');
  await page.waitForFunction((name: string) => {
    const api = (window as Window & { AgentRuntime?: { getCurrentWorkspace: () => { name?: string } } }).AgentRuntime;
    return api?.getCurrentWorkspace().name === name;
  }, workspace.name);
  const healthCard = page.getByTestId('health-card');
  if (await healthCard.isVisible()) await page.getByTestId('health-card-dismiss').click();
  await page.getByRole('button', { name: 'XML Patching' }).click();

  const picker = page.getByPlaceholder(/Search real base-game files/i);
  const editHull = page.getByRole('button', { name: 'Edit max hull', exact: true });
  await picker.fill(ambiguousFile);
  await expect(page.getByText('effective: base', { exact: true })).toBeVisible();
  await expect(editHull).toHaveCount(0);

  await picker.fill(targetFile);
  await editHull.click();
  const hullValue = page.getByRole('spinbutton', { name: /maximum hull.*current 1190000/i });
  await expect(hullValue).toHaveValue('1190000');
  const preview = page.getByRole('button', { name: 'Preview against corpus', exact: true });
  await hullValue.fill('');
  await expect(preview).toBeDisabled();
  await hullValue.fill('1200000');

  await preview.click();
  await expect(page.getByText('The hull preview does not match the selected macro and source revision.', { exact: false })).toBeVisible();
  const apply = page.getByRole('button', { name: 'Apply hull change to workspace', exact: true });
  await expect(apply).toHaveCount(0);
  expect((await readServerWorkspace()).xmlPatches).toEqual([]);

  await preview.click();
  await expect(page.getByText('The workspace changed during preview.', { exact: false })).toBeVisible();
  await expect(apply).toHaveCount(0);
  expect((await readServerWorkspace()).xmlPatches).toEqual([]);

  await preview.click();
  await expect(page.getByText('1 VALIDATED', { exact: true })).toBeVisible();
  await expect(page.getByText('1200000', { exact: true })).toBeVisible();
  expect((await readServerWorkspace()).xmlPatches).toEqual([]);
  if (await healthCard.isVisible()) await page.getByTestId('health-card-dismiss').click();
  await apply.click();
  await expect.poll(async () => (await readServerWorkspace()).xmlPatches?.map(({ sel, content }) => ({ sel, content })))
    .toEqual([{ sel: selector, content: '1200000' }]);

  await page.getByRole('button', { name: 'Single patch', exact: true }).click();
  await page.getByRole('button', { name: 'Applied Preview', exact: true }).click();
  const previewPane = page.locator('[data-xmlpatch-pane="preview"]');
  await expect(previewPane.getByText('<hull max="1200000"/>', { exact: true })).toBeVisible();
  await page.locator('button[title="Undo last action (Ctrl+Z)"]').click();
  await expect.poll(async () => (await readServerWorkspace()).xmlPatches).toEqual([]);
  await expect(previewPane.getByText('<hull max="1200000"/>', { exact: true })).toHaveCount(0);

  await editHull.click();
  await hullValue.fill('1200000');
  await preview.click();
  await expect(apply).toBeEnabled();
  const nodeId = workspace.nodes[0].id;
  const newName = 'LocalEditWhileHullReplyWaits';
  const readName = () => page.evaluate(id => window.AgentRuntime!.getCurrentWorkspace().nodes.find(node => node.id === id)?.properties.name, nodeId);
  holdNextApply = true;
  const applyResponse = page.waitForResponse(response => response.url().endsWith('/api/agent/bulk-transform/apply'));
  try {
    await apply.click();
    await expect.poll(() => applySavedBeforeReply).toBe(true);
    await page.evaluate(({ id, name }) => window.AgentRuntime!.updateNodeProperty(id, 'name', name), { id: nodeId, name: newName });
    await expect.poll(readName).toBe(newName);
  } finally {
    releaseApply();
  }
  await applyResponse;
  await expect(hullValue).toBeEnabled();
  expect(await readName()).toBe(newName);
  await expect(page.getByText('The patch was saved on the server', { exact: false })).toBeVisible();
});
