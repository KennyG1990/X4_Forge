import { expect, test, type Page } from '@playwright/test';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { workspaceContentHash, workspaceSnapshotHash } from '../../src/lib/workspaceIdentity';
import { sanitizeWorkspace } from '../../src/types';
import { seedServerWorkspace } from './ephemeral';

async function boot(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.waitForFunction((expected: string) => (window as any).__X4_E2E__?.getWorkspace().name === expected, name);
  const health = page.getByTestId('health-card');
  await health.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
  if (await health.isVisible()) await page.getByTestId('health-card-dismiss').click();
}

async function selectedWorkspaceId(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || '');
}

async function serverWorkspace(page: Page): Promise<any> {
  return page.evaluate(async () => {
    const response = await fetch('/api/agent/workspace');
    if (!response.ok) throw new Error(`workspace read failed: ${response.status}`);
    return (await response.json()).workspace;
  });
}

test('name-only independent workspace creation is blank, replayable, and preserves explicit projects', async ({ page }) => {
  const explicitWorkspace = sanitizeWorkspace({
    ...buildTemplateWorkspace('welcome'),
    id: 'b119_explicit_project',
    name: 'B119 explicit project preservation',
    customLua: '-- Explicit project content must survive creation.\nreturn {}\n',
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __X4_E2E__?: unknown }).__X4_E2E__));
  const proof = await page.evaluate(async explicit => {
    const context = (window as unknown as {
      __X4_WORKSPACE_CONTEXT__: { clientId: string; getWorkspaceId(): string };
    }).__X4_WORKSPACE_CONTEXT__;
    const read = async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json();
    };
    const create = async (body: Record<string, unknown>, operationId: string) => {
      const response = await fetch('/api/agent/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forge-operation-id': operationId },
        body: JSON.stringify({ clientId: context.clientId, ...body }),
      });
      return { status: response.status, data: await response.json() };
    };
    const initial = await read('/api/agent/workspace');
    const initialSelection = context.getWorkspaceId();
    const before = await read('/api/agent/workspaces');
    const operationId = `forge_op_b119_blank_${crypto.randomUUID().replaceAll('-', '')}`;
    const body = { name: initial.workspace.name };
    const created = await create(body, operationId);
    const afterCreate = await read('/api/agent/workspaces');
    const replayed = await create(body, operationId);
    const afterReplay = await read('/api/agent/workspaces');
    const changed = await create({ name: `${body.name} changed` }, operationId);
    const malformed = await create(body, 'forge/op/invalid');
    const afterRejected = await read('/api/agent/workspaces');
    const supplied = await create({ workspace: explicit }, `${operationId}_explicit`);
    const afterExplicit = await read('/api/agent/workspaces');
    const final = await read('/api/agent/workspace');
    return {
      initial, initialSelection, created, replayed, changed, malformed, supplied, final,
      finalSelection: context.getWorkspaceId(),
      counts: [before, afterCreate, afterReplay, afterRejected, afterExplicit].map(row => row.workspaces.length),
    };
  }, explicitWorkspace);
  await test.info().attach('b119-name-only-workspace-creation', {
    body: Buffer.from(JSON.stringify(proof, null, 2)), contentType: 'application/json',
  });
  expect(proof.created.status).toBe(201);
  expect(proof.created.data.receipt.status).toBe('committed');
  expect(proof.created.data.workspaceId).toMatch(/^ws_[a-f0-9]{24}$/);
  expect(proof.created.data.workspaceId).not.toBe(proof.initial.workspaceId);
  expect(proof.created.data.workspace.name).toBe(proof.initial.workspace.name);
  for (const field of ['nodes', 'links', 'uiWidgets', 'originalFiles', 'passthroughFiles', 'aiScripts', 'wares', 'jobs', 'xmlPatches', 'tFiles', 'templates']) {
    expect(proof.created.data.workspace[field], `name-only workspace ${field} must be empty`).toEqual([]);
  }
  expect(proof.created.data.workspace.customLua).toBeUndefined();
  expect(proof.created.data.workspace.sourceFolder).toBeUndefined();
  expect(proof.created.data.workspace.contentOriginal).toBeUndefined();
  expect(proof.replayed.status).toBe(200);
  expect(proof.replayed.data.replayed).toBe(true);
  expect(proof.replayed.data.workspaceId).toBe(proof.created.data.workspaceId);
  expect(proof.replayed.data.workspace).toEqual(proof.created.data.workspace);
  expect(proof.replayed.data.receipt).toEqual(proof.created.data.receipt);
  expect(proof.changed.status).toBe(409);
  expect(proof.malformed.status).toBe(400);
  expect(proof.malformed.data.code).toBe('ACTION_RECEIPT_OPERATION_ID_INVALID');
  expect(proof.supplied.status).toBe(201);
  expect(proof.supplied.data.workspace).toEqual(explicitWorkspace);
  expect(proof.counts).toEqual([proof.counts[0], proof.counts[0] + 1, proof.counts[0] + 1, proof.counts[0] + 1, proof.counts[0] + 2]);
  expect(proof.final).toEqual(proof.initial);
  expect(proof.finalSelection).toBe(proof.initialSelection);
});

test('two Studio tabs keep duplicate-name workspaces isolated and switch by immutable id', async ({ context, page }) => {
  test.setTimeout(120_000);
  const initial = buildTemplateWorkspace('welcome');
  initial.name = 'Duplicate Workspace';
  initial.description = 'default record';
  await seedServerWorkspace(initial);

  const other = await context.newPage();
  await boot(page, initial.name);
  await boot(other, initial.name);
  const defaultId = await selectedWorkspaceId(other);
  expect(defaultId).toMatch(/^ws_[a-f0-9]{24}$/);

  await page.getByTestId('workspace-switcher').selectOption('__new');
  await page.getByTestId('dialog-input').fill(initial.name);
  await page.getByTestId('dialog-ok').click();
  await expect(page.getByTestId('toast')).toContainText('Created independent workspace');
  const independentId = await selectedWorkspaceId(page);
  expect(independentId).toMatch(/^ws_[a-f0-9]{24}$/);
  expect(independentId).not.toBe(defaultId);

  await page.evaluate(() => {
    const current = (window as any).__X4_E2E__.getWorkspace();
    (window as any).__X4_E2E__.setWorkspace({ ...current, description: 'owned by first tab' });
  });
  await expect.poll(async () => (await serverWorkspace(page)).description, { timeout: 30_000 }).toBe('owned by first tab');
  await other.evaluate(() => {
    const current = (window as any).__X4_E2E__.getWorkspace();
    (window as any).__X4_E2E__.setWorkspace({ ...current, description: 'owned by second tab' });
  });

  await expect.poll(async () => (await serverWorkspace(other)).description, { timeout: 30_000 }).toBe('owned by second tab');
  await expect.poll(async () => (await serverWorkspace(page)).description, { timeout: 30_000 }).toBe('owned by first tab');
  await expect.poll(async () => page.evaluate(() => (window as any).__X4_E2E__.getWorkspace().description)).toBe('owned by first tab');
  await expect.poll(async () => other.evaluate(() => (window as any).__X4_E2E__.getWorkspace().description)).toBe('owned by second tab');

  await other.getByTestId('workspace-switcher').focus();
  await expect(other.getByTestId('workspace-switcher').locator(`option[value="workspace:${independentId}"]`)).toHaveCount(1);
  await other.getByTestId('workspace-switcher').selectOption(`workspace:${independentId}`);
  await other.getByTestId('dialog-ok').click();
  await expect.poll(() => selectedWorkspaceId(other)).toBe(independentId);
  await expect.poll(async () => other.evaluate(() => (window as any).__X4_E2E__.getWorkspace().description)).toBe('owned by first tab');
  await other.keyboard.press('Control+z');
  await other.waitForTimeout(750);
  expect(await selectedWorkspaceId(other)).toBe(independentId);
  expect(await other.evaluate(() => (window as any).__X4_E2E__.getWorkspace().description)).toBe('owned by first tab');
  expect((await serverWorkspace(other)).description).toBe('owned by first tab');
});

test('restoring a parked workspace retains that target workspace scoped draft', async ({ page }) => {
  test.setTimeout(90_000);
  const initial = sanitizeWorkspace({ ...buildTemplateWorkspace('welcome'), name: 'Draft Target A' });
  await seedServerWorkspace(initial);
  await boot(page, initial.name);
  const targetId = await selectedWorkspaceId(page);
  const targetEnvelope = await page.evaluate(async () => {
    const response = await fetch('/api/agent/workspace');
    if (!response.ok) throw new Error(`workspace read failed: ${response.status}`);
    return response.json();
  });

  await page.getByTestId('workspace-switcher').selectOption('__new');
  await page.getByTestId('dialog-input').fill('Clean Workspace B');
  await page.getByTestId('dialog-ok').click();
  await expect(page.getByTestId('toast')).toContainText('Created independent workspace');
  expect(await selectedWorkspaceId(page)).not.toBe(targetId);

  const draft = sanitizeWorkspace({
    ...initial,
    description: 'Durable target-A draft must survive restore from clean B.',
  });
  const draftHash = workspaceContentHash(draft);
  const draftSnapshotHash = workspaceSnapshotHash(draft);
  await page.evaluate(({ workspaceId, workspace, baseVersion, expectedHead, expectedSnapshotHash, workspaceHash, snapshotHash }) => {
    localStorage.setItem(`x4_mod_studio_workspace:${workspaceId}`, JSON.stringify({
      ...workspace,
      __x4ForgeDraft: {
        schemaVersion: 1,
        baseVersion,
        expectedHead,
        expectedSnapshotHash,
        workspaceHash,
        snapshotHash,
      },
    }));
    localStorage.setItem(`x4_mod_studio_version:${workspaceId}`, String(baseVersion));
  }, {
    workspaceId: targetId,
    workspace: draft,
    baseVersion: Number(targetEnvelope.version),
    expectedHead: String(targetEnvelope.workspaceHash),
    expectedSnapshotHash: String(targetEnvelope.snapshotHash),
    workspaceHash: draftHash,
    snapshotHash: draftSnapshotHash,
  });

  await page.getByTestId('workspace-switcher').focus();
  await expect(page.getByTestId('workspace-switcher').locator(`option[value="workspace:${targetId}"]`)).toHaveCount(1);
  await page.getByTestId('workspace-switcher').selectOption(`workspace:${targetId}`);
  await page.getByTestId('dialog-ok').click();
  await expect.poll(() => selectedWorkspaceId(page)).toBe(targetId);
  await expect.poll(async () => page.evaluate(() => (window as any).__X4_E2E__.getWorkspace().description)).toBe(draft.description);
  await expect.poll(async () => (await serverWorkspace(page)).description, { timeout: 20_000 }).toBe(draft.description);
});
