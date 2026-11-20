import { expect, test, type Page, type Route } from './request-transport';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { readServerWorkspace, seedServerWorkspace } from './ephemeral';

const baseXml = `<?xml version="1.0" encoding="utf-8"?>
<wares>
  <ware id="energycells" volume="1" />
</wares>`;

const editedXml = `<?xml version="1.0" encoding="utf-8"?>
<wares>
  <ware id="energycells" volume="2" tags="energy &amp; economy" />
</wares>`;

test('diff-to-patch three-pane merge synthesizes and adopts a patch block', async ({ page }) => {
  const workspace = { ...buildTemplateWorkspace('welcome'), xmlPatches: [] };
  await seedServerWorkspace(workspace);
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });

  let synthPayload: { vanillaXml?: string; editedXml?: string; targetFile?: string } | null = null;

  await page.route('**/api/reference/effective-file**', async (route) => {
    await route.fulfill({
      json: {
        available: true,
        relativePath: 'libraries/wares.xml',
        signature: 'e2e-effective-wares',
        sources: [{ source: 'base', path: 'libraries/wares.xml', mode: 'base' }],
        findings: [],
        content: baseXml,
      },
    });
  });

  await page.route('**/api/agent/xpath-synth', async (route) => {
    synthPayload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        success: true,
        targetFile: 'libraries/wares.xml',
        sourceSignature: 'e2e-effective-wares',
        ops: [
          {
            type: 'replace',
            sel: "/wares/ware[@id='energycells']/@volume",
            content: '2',
          },
          {
            type: 'add',
            sel: "/wares/ware[@id='energycells']",
            attrType: '@tags',
            content: 'energy & economy',
          },
        ],
        diffXml: `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <replace sel="/wares/ware[@id='energycells']/@volume">2</replace>
  <add sel="/wares/ware[@id='energycells']" type="@tags">energy &amp; economy</add>
</diff>`,
        warnings: [],
      },
    });
  });

  await page.goto('/');
  await page.waitForFunction((name: string) => {
    const api = (window as Window & { AgentRuntime?: { getCurrentWorkspace: () => { name?: string } } }).AgentRuntime;
    return api?.getCurrentWorkspace().name === name;
  }, workspace.name);
  await page.getByRole('button', { name: 'XML Patching' }).click();
  await page.getByRole('button', { name: 'Diff→Patch', exact: true }).click();

  const workbench = page.locator('main');
  await expect(workbench.getByText('Three-pane merge:', { exact: false })).toBeVisible();
  await expect(workbench.getByText('Base XML')).toBeVisible();
  await expect(workbench.getByText('Edited XML')).toBeVisible();
  await expect(workbench.locator('span').filter({ hasText: 'Patch XML' })).toBeVisible();

  // Target the Edited XML pane directly (the three panes are already asserted by their labels
  // above). The prior `page.locator('textarea')` global count coupled this test to unrelated
  // editors elsewhere on the page — native authoring removed the old embedded editor, which
  // legitimately changed that count. A stable testid keeps the test on the actual pane.
  const editedPane = page.getByTestId('diff-patch-edited-xml');
  await expect(editedPane).toBeVisible();
  await editedPane.fill(editedXml);
  await page.getByRole('button', { name: 'Synthesize Patch' }).click();

  await expect(workbench.getByText('2 op(s)')).toBeVisible();
  await expect(workbench.getByText("/wares/ware[@id='energycells']/@volume")).toBeVisible();
  expect(synthPayload).toMatchObject({
    targetFile: 'libraries/wares.xml',
    sourceSignature: 'e2e-effective-wares',
    vanillaXml: baseXml,
    editedXml,
  });

  const saveResponsePromise = page.waitForResponse(response =>
    response.url().endsWith('/api/agent/workspace')
      && response.request().method() === 'POST'
      && response.status() === 200,
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Add to Workspace' }).click();
  await expect(workbench.getByText("/wares/ware[@id='energycells']/@volume")).toBeVisible();
  const saveResponse = await saveResponsePromise;
  const saveBody = await saveResponse.json();
  const adoptedBlocks = [
    expect.objectContaining({ note: 'Diff→Patch synthesized', sel: "/wares/ware[@id='energycells']/@volume" }),
    expect.objectContaining({
      note: 'Diff→Patch synthesized',
      sel: "/wares/ware[@id='energycells']",
      attrType: '@tags',
      content: 'energy & economy',
    }),
  ];
  expect(saveBody.workspace.xmlPatches).toEqual(adoptedBlocks);
  const saved = await readServerWorkspace();
  expect(saved.xmlPatches).toEqual(adoptedBlocks);

  const previewPane = page.locator('[data-xmlpatch-pane="preview"]');
  await page.getByRole('button', { name: 'Patch XML', exact: true }).click();
  await expect(previewPane.locator('pre')).toContainText('type="@tags">energy &amp; economy</add>');
  await page.getByRole('button', { name: 'Applied Preview', exact: true }).first().click();
  await expect(previewPane.getByText('<ware id="energycells" volume="2" tags="energy &amp; economy"/>', { exact: true })).toBeVisible();
});

test('diff-to-patch keeps base, candidate, and late responses isolated by target', async ({ page }) => {
  const workspace = { ...buildTemplateWorkspace('welcome'), xmlPatches: [] };
  await seedServerWorkspace(workspace);
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });

  const documents: Record<string, string> = {
    'libraries/wares.xml': '<?xml version="1.0"?><wares><ware id="energycells" /></wares>',
    'libraries/jobs.xml': '<?xml version="1.0"?><jobs><job id="late_job" /></jobs>',
    'libraries/factions.xml': '<?xml version="1.0"?><factions><faction id="argon" /></factions>',
  };
  let releaseLateJobs: (() => void) | undefined;

  await page.route('**/api/reference/effective-file**', async route => {
    const target = new URL(route.request().url()).searchParams.get('path') || '';
    if (target === 'libraries/jobs.xml') {
      await new Promise<void>(resolve => { releaseLateJobs = resolve; });
    }
    const content = documents[target];
    if (!content) return route.fulfill({ status: 404, json: { error: `No fixture for ${target}` } });
    return route.fulfill({
      json: {
        available: true,
        relativePath: target,
        signature: `signature:${target}`,
        sources: [{ source: 'base', path: target, mode: 'base' }],
        findings: [],
        content,
      },
    });
  });

  await page.goto('/');
  await page.waitForFunction((name: string) => {
    const api = (window as Window & { AgentRuntime?: { getCurrentWorkspace: () => { name?: string } } }).AgentRuntime;
    return api?.getCurrentWorkspace().name === name;
  }, workspace.name);
  await page.getByRole('button', { name: 'XML Patching' }).click();
  await page.getByRole('button', { name: 'Diff→Patch', exact: true }).click();

  const targetInput = page.getByPlaceholder(/Search real base-game files/i);
  const editedPane = page.getByTestId('diff-patch-edited-xml');
  await expect(editedPane).toHaveValue(documents['libraries/wares.xml']);
  const dirtyWares = documents['libraries/wares.xml'].replace('energycells', 'edited_energycells');
  await editedPane.fill(dirtyWares);

  await targetInput.fill('libraries/jobs.xml');
  await expect(editedPane).toBeDisabled();
  await expect.poll(() => Boolean(releaseLateJobs)).toBe(true);
  await targetInput.fill('libraries/factions.xml');
  await expect(editedPane).toHaveValue(documents['libraries/factions.xml']);
  await expect(page.getByRole('button', { name: 'Synthesize Patch' })).toBeEnabled();

  releaseLateJobs?.();
  await page.waitForTimeout(100);
  await expect(editedPane).toHaveValue(documents['libraries/factions.xml']);

  await targetInput.fill('libraries/wares.xml');
  await expect(editedPane).toHaveValue(dirtyWares);
});

type DiffPatchWindow = Window & {
  AgentRuntime?: { getCurrentWorkspace: () => ReturnType<typeof buildTemplateWorkspace> };
  __X4_WORKSPACE_CONTEXT__?: { getWorkspaceId: () => string };
  __diffSynthSettled?: number[];
};
type SynthesisPayload = { vanillaXml: string; editedXml: string; targetFile: string; sourceSignature: string };
type SynthesisReply = NonNullable<Parameters<Route['fulfill']>[0]>;
type HeldSynthesis = {
  payload: SynthesisPayload;
  release: (reply: SynthesisReply) => void;
  done: Promise<{ error?: unknown }>;
};

function volumeXml(volume: string): string {
  return baseXml.replace('volume="1"', `volume="${volume}"`);
}

function synthesizedVolume(payload: SynthesisPayload, volume: string): SynthesisReply {
  return { json: {
    success: true, targetFile: payload.targetFile, sourceSignature: payload.sourceSignature,
    ops: [{ type: 'replace', sel: "/wares/ware[@id='energycells']/@volume", content: volume }],
    diffXml: `<diff><replace sel="/wares/ware[@id='energycells']/@volume">${volume}</replace></diff>`,
    warnings: [],
  } };
}

async function deferredSynthesis(page: Page) {
  const requests: HeldSynthesis[] = [];
  let closed = false;
  const pattern = '**/api/agent/xpath-synth';
  const handler = async (route: Route) => {
    if (closed) return route.fulfill({ status: 503, json: { error: 'Fixture closed.' } });
    let release!: HeldSynthesis['release'];
    let complete!: (result: { error?: unknown }) => void;
    const reply = new Promise<SynthesisReply>(resolve => { release = resolve; });
    const done = new Promise<{ error?: unknown }>(resolve => { complete = resolve; });
    requests.push({ payload: route.request().postDataJSON(), release, done });
    try { await route.fulfill(await reply); complete({}); }
    catch (error) { complete({ error }); }
  };
  await page.route(pattern, handler);
  await page.addInitScript(() => {
    const state = window as DiffPatchWindow;
    state.__diffSynthSettled = [];
    const originalFetch = window.fetch.bind(window);
    let nextId = 0;
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url, location.href).pathname !== '/api/agent/xpath-synth') return originalFetch(input, init);
      const id = nextId++;
      const consumed = () => queueMicrotask(() => queueMicrotask(() => { state.__diffSynthSettled?.push(id); }));
      try {
        // Let obsolete replies arrive even if cancellation wins: freshness must fence them independently.
        // Every other fetch and all synthesis headers, credentials and body retain their normal values.
        const response = await originalFetch(input, { ...init, signal: null });
        const readJson = response.json.bind(response);
        response.json = async () => {
          try { return await readJson(); }
          finally { consumed(); }
        };
        return response;
      } catch (error) { consumed(); throw error; }
    };
  });
  return {
    requests,
    async waitForRequest(index: number) {
      await expect.poll(() => requests.length).toBeGreaterThan(index);
      return requests[index];
    },
    async reply(index: number, response: SynthesisReply) {
      const request = requests[index];
      expect(request).toBeDefined();
      request.release(response);
      const result = await request.done;
      if (result.error) throw result.error;
      await page.waitForFunction(id => (window as DiffPatchWindow).__diffSynthSettled?.includes(id), index);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    },
    async close() {
      closed = true;
      for (const request of requests) request.release({ status: 503, json: { error: 'Fixture cleanup.' } });
      const results = await Promise.all(requests.map(request => request.done));
      await page.unroute(pattern, handler);
      const failed = results.find(result => result.error !== undefined);
      if (failed) throw failed.error;
    },
  };
}

async function openDiffPatchFixture(page: Page, name: string) {
  const workspace = { ...buildTemplateWorkspace('welcome'), name, xmlPatches: [] };
  await seedServerWorkspace(workspace);
  await page.route('**/api/reference/effective-file**', async route => {
    const target = new URL(route.request().url()).searchParams.get('path') || '';
    await route.fulfill({ json: {
      available: true, relativePath: target, signature: `freshness:${target}`,
      sources: [{ source: 'base', path: target, mode: 'base' }], findings: [],
      content: target === 'libraries/wares.xml' ? baseXml : '<jobs><job id="other_target" /></jobs>',
    } });
  });
  await page.goto('/');
  await page.waitForFunction(expected => (window as DiffPatchWindow).AgentRuntime?.getCurrentWorkspace().name === expected, name);
  const health = page.getByTestId('health-card');
  await health.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await health.isVisible()) await page.getByTestId('health-card-dismiss').click();
  await page.getByRole('button', { name: 'XML Patching' }).click();
  await page.getByRole('button', { name: 'Diff→Patch', exact: true }).click();
  await expect(page.getByTestId('diff-patch-edited-xml')).toHaveValue(baseXml);
}

async function visitOtherTargetAndReturn(page: Page, candidate: string) {
  const target = page.getByPlaceholder(/Search real base-game files/i);
  await target.fill('libraries/jobs.xml');
  await expect(page.getByTestId('diff-patch-edited-xml')).toHaveValue('<jobs><job id="other_target" /></jobs>');
  await target.fill('libraries/wares.xml');
  await expect(page.getByTestId('diff-patch-edited-xml')).toHaveValue(candidate);
}

async function selectedDiffWorkspace(page: Page): Promise<string> {
  return page.evaluate(() => (window as DiffPatchWindow).__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || '');
}

async function restoreDiffWorkspace(page: Page, workspaceId: string) {
  const switcher = page.getByTestId('workspace-switcher');
  await switcher.focus();
  await expect(switcher.locator(`option[value="workspace:${workspaceId}"]`)).toHaveCount(1);
  await switcher.selectOption(`workspace:${workspaceId}`);
  await page.getByTestId('dialog-ok').click();
  await expect.poll(() => selectedDiffWorkspace(page)).toBe(workspaceId);
}

async function currentDiffWorkspace(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/agent/workspace');
    if (!response.ok) throw new Error(`Workspace read failed (${response.status}).`);
    return (await response.json()).workspace;
  });
}

test('diff-to-patch retires an edited candidate reply and adopts only a fresh exact candidate', async ({ page }) => {
  const synthesis = await deferredSynthesis(page);
  try {
    await openDiffPatchFixture(page, 'Diff candidate freshness');
    const candidate = page.getByTestId('diff-patch-edited-xml');
    const synthesize = page.getByRole('button', { name: 'Synthesize Patch', exact: true });
    const adopt = page.getByRole('button', { name: 'Add to Workspace', exact: true });
    await candidate.fill(volumeXml('2'));
    await synthesize.click();
    const old = await synthesis.waitForRequest(0);
    expect(old.payload.editedXml).toBe(volumeXml('2'));
    await candidate.fill(volumeXml('3'));
    await synthesis.reply(0, synthesizedVolume(old.payload, '2'));
    await expect(candidate).toHaveValue(volumeXml('3'));
    await expect(adopt).toBeDisabled();
    expect((await readServerWorkspace()).xmlPatches).toEqual([]);

    await synthesize.click();
    const fresh = await synthesis.waitForRequest(1);
    expect(fresh.payload).toEqual({ vanillaXml: baseXml, editedXml: volumeXml('3'), targetFile: 'libraries/wares.xml', sourceSignature: 'freshness:libraries/wares.xml' });
    await synthesis.reply(1, synthesizedVolume(fresh.payload, '3'));
    await expect(adopt).toBeEnabled();
    await adopt.click();
    await expect.poll(async () => (await readServerWorkspace()).xmlPatches).toEqual([
      expect.objectContaining({ note: 'Diff→Patch synthesized', sel: "/wares/ware[@id='energycells']/@volume", content: '3', targetFile: 'libraries/wares.xml', sourceSignature: 'freshness:libraries/wares.xml' }),
    ]);
  } finally { await synthesis.close(); }
});

test('diff-to-patch Reset retires a held reply even when the candidate text is unchanged', async ({ page }) => {
  const synthesis = await deferredSynthesis(page);
  try {
    await openDiffPatchFixture(page, 'Diff same-text Reset');
    await page.getByRole('button', { name: 'Synthesize Patch', exact: true }).click();
    const old = await synthesis.waitForRequest(0);
    expect(old.payload.editedXml).toBe(baseXml);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByTestId('diff-patch-edited-xml')).toHaveValue(baseXml);
    await synthesis.reply(0, { json: {
      success: true, targetFile: old.payload.targetFile, sourceSignature: old.payload.sourceSignature,
      ops: [], diffXml: '<diff/>', warnings: [],
    } });
    await expect(page.locator('main').getByText('not synthesized', { exact: true })).toBeVisible();
    await expect(page.locator('main').getByText('0 op(s)', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add to Workspace', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Synthesize Patch', exact: true })).toBeEnabled();
    expect((await readServerWorkspace()).xmlPatches).toEqual([]);
  } finally { await synthesis.close(); }
});

test('diff-to-patch obsolete rejection and finally cannot settle a newer target session', async ({ page }) => {
  const synthesis = await deferredSynthesis(page);
  try {
    await openDiffPatchFixture(page, 'Diff request completion ownership');
    const candidate = page.getByTestId('diff-patch-edited-xml');
    const synthesize = page.getByRole('button', { name: 'Synthesize Patch', exact: true });
    const adopt = page.getByRole('button', { name: 'Add to Workspace', exact: true });
    await candidate.fill(volumeXml('2'));
    await synthesize.click();
    await synthesis.waitForRequest(0);
    await visitOtherTargetAndReturn(page, volumeXml('2'));
    await candidate.fill(volumeXml('3'));
    await synthesize.click();
    await synthesis.waitForRequest(1);
    await synthesis.reply(0, { status: 409, json: { error: 'OBSOLETE_SYNTHESIS_REJECTION' } });
    await expect(page.getByRole('button', { name: 'Synthesizing...', exact: true })).toBeDisabled();
    await expect(page.getByText('OBSOLETE_SYNTHESIS_REJECTION', { exact: true })).toHaveCount(0);
    await expect(adopt).toBeDisabled();
    await synthesis.reply(1, { status: 409, json: { error: 'CURRENT_SYNTHESIS_REJECTION' } });
    await expect(page.getByText('CURRENT_SYNTHESIS_REJECTION', { exact: true })).toBeVisible();

    await synthesize.click();
    await synthesis.waitForRequest(2);
    await visitOtherTargetAndReturn(page, volumeXml('3'));
    await synthesize.click();
    await synthesis.waitForRequest(3);
    await synthesis.reply(3, { status: 409, json: { error: 'LATEST_SYNTHESIS_REJECTION' } });
    await expect(page.getByText('LATEST_SYNTHESIS_REJECTION', { exact: true })).toBeVisible();
    await synthesis.reply(2, { status: 409, json: { error: 'SECOND_OBSOLETE_REJECTION' } });
    await expect(page.getByText('LATEST_SYNTHESIS_REJECTION', { exact: true })).toBeVisible();
    await expect(page.getByText('SECOND_OBSOLETE_REJECTION', { exact: true })).toHaveCount(0);
    await expect(synthesize).toBeEnabled();
    await expect(adopt).toBeDisabled();
    expect((await readServerWorkspace()).xmlPatches).toEqual([]);
  } finally { await synthesis.close(); }
});

test('diff-to-patch scopes held results and preserved drafts to the selected workspace', async ({ page }) => {
  const synthesis = await deferredSynthesis(page);
  try {
    await openDiffPatchFixture(page, 'Diff workspace A');
    const workspaceA = await selectedDiffWorkspace(page);
    expect(workspaceA).toMatch(/^ws_[a-f0-9]{24}$/);
    const candidate = page.getByTestId('diff-patch-edited-xml');
    const synthesize = page.getByRole('button', { name: 'Synthesize Patch', exact: true });
    const adopt = page.getByRole('button', { name: 'Add to Workspace', exact: true });
    await candidate.fill(volumeXml('2'));
    await synthesize.click();
    const old = await synthesis.waitForRequest(0);
    await page.getByTestId('workspace-switcher').selectOption('__new');
    await page.getByTestId('dialog-input').fill('Diff workspace B');
    await page.getByTestId('dialog-ok').click();
    await expect.poll(() => selectedDiffWorkspace(page)).not.toBe(workspaceA);
    const workspaceB = await selectedDiffWorkspace(page);
    expect(workspaceB).toMatch(/^ws_[a-f0-9]{24}$/);
    await expect(candidate).toHaveValue(baseXml);
    await synthesis.reply(0, synthesizedVolume(old.payload, '2'));
    await expect(adopt).toBeDisabled();
    expect((await currentDiffWorkspace(page)).xmlPatches || []).toEqual([]);
    expect((await readServerWorkspace()).xmlPatches).toEqual([]);
    await candidate.fill(volumeXml('3'));

    await restoreDiffWorkspace(page, workspaceA);
    await expect(candidate).toHaveValue(volumeXml('2'));
    await expect(adopt).toBeDisabled();
    expect((await currentDiffWorkspace(page)).xmlPatches).toEqual([]);
    await synthesize.click();
    const fresh = await synthesis.waitForRequest(1);
    expect(fresh.payload.editedXml).toBe(volumeXml('2'));
    await synthesis.reply(1, synthesizedVolume(fresh.payload, '2'));
    await expect(adopt).toBeEnabled();

    await page.evaluate(([other, original]) => {
      const context = window.__X4_WORKSPACE_CONTEXT__;
      if (!context) throw new Error('Missing workspace selection context');
      context.selectWorkspace(other);
      context.selectWorkspace(original);
      const add = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Add to Workspace');
      if (!add || add.disabled) throw new Error('Expected a displayed result before attempting stale adoption');
      add.click();
    }, [workspaceB, workspaceA]);
    await expect(adopt).toBeDisabled();
    expect((await currentDiffWorkspace(page)).xmlPatches).toEqual([]);
    await expect(candidate).toHaveValue(volumeXml('2'));
    await synthesize.click();
    const afterReselect = await synthesis.waitForRequest(2);
    await synthesis.reply(2, synthesizedVolume(afterReselect.payload, '2'));
    await expect(adopt).toBeEnabled();

    await restoreDiffWorkspace(page, workspaceB);
    await expect(candidate).toHaveValue(volumeXml('3'));
    await expect(adopt).toBeDisabled();
    expect((await currentDiffWorkspace(page)).xmlPatches || []).toEqual([]);
    expect((await readServerWorkspace()).xmlPatches).toEqual([]);

    await restoreDiffWorkspace(page, workspaceA);
    await expect(candidate).toHaveValue(volumeXml('2'));
    await candidate.fill(baseXml);
    await restoreDiffWorkspace(page, workspaceB);
    await expect(candidate).toHaveValue(volumeXml('3'));
    await restoreDiffWorkspace(page, workspaceA);
    await expect(candidate).toHaveValue(baseXml);
  } finally { await synthesis.close(); }
});
