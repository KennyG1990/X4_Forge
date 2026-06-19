import { expect, test, type Page } from '@playwright/test';

/**
 * G14 — additional canvas interaction coverage (#24).
 *
 * Complements canvas-interactions.spec.ts (link-create / group-drag / perf / palette-spawn)
 * with three more real interactions, each grounded in verified Canvas.tsx behavior:
 *   A. single-node drag moves ONLY the dragged node (no accidental group move).
 *   B. deleting a node via its "Delete Node" button cascades removal of its links
 *      (deleteNode filters links where source/target === nodeId — Canvas.tsx ~504).
 *   C. a link on the second flow orientation (cue.conditions -> event.condition) is created.
 *
 * Uses the same isolation/seed/restore harness shape as canvas-interactions.spec.ts so a
 * run never mutates shared server workspace state.
 */

type E2ENode = {
  id: string;
  type: 'cue' | 'event' | 'condition' | 'action' | 'variable' | 'comment';
  label: string;
  xmlTag: string;
  x: number;
  y: number;
  properties: Record<string, unknown>;
  propertiesSchema: unknown[];
  inputs: Array<{ id: string; name: string; type: string }>;
  outputs: Array<{ id: string; name: string; type: string }>;
  includeInBuild?: boolean;
};

type E2EWorkspace = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  nodes: E2ENode[];
  links: Array<{
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  }>;
  uiWidgets: unknown[];
  uiTheme: {
    backgroundColor: string;
    borderColor: string;
    accentColor: string;
    opacity: number;
    showIcons: boolean;
  };
  compileSettings: {
    md: boolean;
    ui: boolean;
    ai: boolean;
    library: boolean;
    translations: boolean;
    patches: boolean;
  };
};

type E2EWindow = Window & {
  __X4_E2E__?: {
    getWorkspace: () => E2EWorkspace;
    setWorkspace: (workspace: E2EWorkspace) => void;
    getMdCode: () => string;
  };
};

const controlledWorkspace: E2EWorkspace = {
  id: 'e2e_canvas_cov',
  name: 'E2E_Canvas_Coverage',
  version: '1.0.0',
  author: 'Playwright',
  description: 'Canvas coverage harness fixture',
  nodes: [
    {
      id: 'cue_e2e',
      type: 'cue',
      label: 'E2E Cue',
      xmlTag: 'cue',
      x: 140,
      y: 120,
      properties: { name: 'E2E_Cue', namespace: 'this', state: 'active' },
      propertiesSchema: [],
      inputs: [],
      outputs: [
        { id: 'out_cond', name: 'conditions', type: 'flow' },
        { id: 'out_act', name: 'actions', type: 'flow' },
      ],
      includeInBuild: true,
    },
    {
      id: 'event_e2e',
      type: 'event',
      label: 'E2E Event',
      xmlTag: 'event_game_started',
      x: 470,
      y: 110,
      properties: {},
      propertiesSchema: [],
      inputs: [{ id: 'in_cond', name: 'condition', type: 'flow' }],
      outputs: [],
      includeInBuild: true,
    },
    {
      id: 'action_e2e',
      type: 'action',
      label: 'E2E Action',
      xmlTag: 'show_help',
      x: 470,
      y: 340,
      properties: { custom: "'hello'", duration: '5s' },
      propertiesSchema: [],
      inputs: [{ id: 'in_act', name: 'action', type: 'flow' }],
      outputs: [],
      includeInBuild: true,
    },
  ],
  links: [],
  uiWidgets: [],
  uiTheme: {
    backgroundColor: '#111827',
    borderColor: '#06b6d4',
    accentColor: '#0891b2',
    opacity: 0.9,
    showIcons: true,
  },
  compileSettings: { md: true, ui: false, ai: false, library: false, translations: false, patches: false },
};

const fallbackRestoreWorkspace: E2EWorkspace = {
  ...controlledWorkspace,
  id: 'e2e_cov_restore_baseline',
  name: 'E2E_Cov_Restore_Baseline',
  description: 'Neutral baseline used only when a prior run already leaked the fixture.',
  nodes: [],
  links: [],
};

async function isolateControlledWorkspacePosts(page: Page): Promise<{ count: () => number }> {
  let blocked = 0;
  await page.route('**/api/agent/workspace', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      let payload: { workspace?: { name?: string } } = {};
      try {
        payload = JSON.parse(request.postData() || '{}') as { workspace?: { name?: string } };
      } catch {
        payload = {};
      }
      if (payload.workspace?.name === controlledWorkspace.name) {
        blocked += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            applied: false,
            version: 900001,
            message: 'E2E fixture workspace sync isolated from shared server state.',
          }),
        });
        return;
      }
    }
    await route.continue();
  });
  return { count: () => blocked };
}

async function seedWorkspace(page: Page): Promise<E2EWorkspace> {
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.goto('/');
  await expect(page.getByTestId('grid-canvas')).toBeVisible();
  await page.waitForFunction(() => !!(window as E2EWindow).__X4_E2E__);
  const original = await page.evaluate(async ({ controlledName, fallback }) => {
    const response = await fetch('/api/agent/workspace');
    if (!response.ok) throw new Error(`workspace fetch failed: ${response.status}`);
    const data = await response.json();
    const serverWorkspace = data.workspace as E2EWorkspace;
    return serverWorkspace.name === controlledName ? fallback : serverWorkspace;
  }, { controlledName: controlledWorkspace.name, fallback: fallbackRestoreWorkspace });
  await page.evaluate((workspace) => {
    (window as E2EWindow).__X4_E2E__!.setWorkspace(workspace);
  }, controlledWorkspace);
  await expect(page.getByTestId('canvas-node-cue_e2e')).toBeVisible();
  await expect(page.getByTestId('canvas-node-event_e2e')).toBeVisible();
  await expect(page.getByTestId('canvas-node-action_e2e')).toBeVisible();
  return original;
}

async function readWorkspace(page: Page): Promise<E2EWorkspace> {
  return page.evaluate(() => (window as E2EWindow).__X4_E2E__!.getWorkspace());
}

/** Runs `body` against a freshly seeded canvas, isolating fixture POSTs and restoring
 *  the original server workspace afterward — mirrors canvas-interactions.spec.ts. */
async function withSeededCanvas(
  page: Page,
  body: (ctx: { original: E2EWorkspace }) => Promise<void>,
): Promise<void> {
  const isolated = await isolateControlledWorkspacePosts(page);
  const original = await seedWorkspace(page);
  try {
    await page.waitForTimeout(650);
    await body({ original });
  } finally {
    await page.evaluate(async (workspace) => {
      (window as E2EWindow).__X4_E2E__!.setWorkspace(workspace);
      const response = await fetch('/api/agent/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace }),
      });
      if (!response.ok) throw new Error(`workspace restore failed: ${response.status}`);
    }, original);
    await page.waitForTimeout(500);
    const restored = await page.evaluate(async () => {
      const response = await fetch('/api/agent/workspace');
      if (!response.ok) throw new Error(`workspace verify failed: ${response.status}`);
      const data = await response.json();
      return data.workspace as E2EWorkspace;
    });
    expect(restored.name).toBe(original.name);
    expect(restored.name).not.toBe(controlledWorkspace.name);
    expect(isolated.count()).toBeGreaterThan(0);
  }
}

test('single-node drag moves only the dragged node', async ({ page }) => {
  await page.route('**/api/agent/compile', async (route) => {
    await route.fulfill({ json: { diagnostics: [] } });
  });

  await withSeededCanvas(page, async () => {
    const before = await readWorkspace(page);
    const cueBefore = before.nodes.find((n) => n.id === 'cue_e2e')!;
    const eventBefore = before.nodes.find((n) => n.id === 'event_e2e')!;
    const actionBefore = before.nodes.find((n) => n.id === 'action_e2e')!;

    const cue = page.getByTestId('canvas-node-cue_e2e');
    // Drag the cue alone (no shift multi-select) — only it should move.
    // Manual mouse drag with a pause after mousedown: the canvas move handler keys off
    // `draggedNodeId`, which is set on mousedown but React rebinds the window mousemove
    // listener asynchronously — so we let it settle before issuing the move steps.
    const box = (await cue.boundingBox())!;
    const startX = box.x + 30;
    const startY = box.y + 18;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(startX + 90, startY + 70, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await readWorkspace(page);
    const cueAfter = after.nodes.find((n) => n.id === 'cue_e2e')!;
    const eventAfter = after.nodes.find((n) => n.id === 'event_e2e')!;
    const actionAfter = after.nodes.find((n) => n.id === 'action_e2e')!;

    // Dragged node moved.
    expect(cueAfter.x).toBeGreaterThan(cueBefore.x);
    expect(cueAfter.y).toBeGreaterThan(cueBefore.y);
    // Other nodes stayed put.
    expect(eventAfter.x).toBe(eventBefore.x);
    expect(eventAfter.y).toBe(eventBefore.y);
    expect(actionAfter.x).toBe(actionBefore.x);
    expect(actionAfter.y).toBe(actionBefore.y);
  });
});

test('deleting a node removes the node and cascades its links', async ({ page }) => {
  await page.route('**/api/agent/compile', async (route) => {
    await route.fulfill({ json: { diagnostics: [] } });
  });

  await withSeededCanvas(page, async () => {
    // Create a link cue.actions -> action.action via the port buttons.
    await page.getByTestId('canvas-port-cue_e2e-out_act').click();
    await page.getByTestId('canvas-port-action_e2e-in_act').click();

    const linked = await readWorkspace(page);
    expect(linked.links).toContainEqual(expect.objectContaining({
      sourceNodeId: 'cue_e2e',
      sourcePortId: 'out_act',
      targetNodeId: 'action_e2e',
      targetPortId: 'in_act',
    }));
    await page.waitForTimeout(300);

    // Delete the cue node via its per-node "Delete Node" button.
    await page.getByTestId('canvas-node-cue_e2e').getByTitle('Delete Node').click();
    await page.waitForTimeout(300);

    const after = await readWorkspace(page);
    // Node gone.
    expect(after.nodes.some((n) => n.id === 'cue_e2e')).toBe(false);
    // Its node element is gone from the DOM.
    await expect(page.getByTestId('canvas-node-cue_e2e')).toHaveCount(0);
    // The other endpoint survives.
    expect(after.nodes.some((n) => n.id === 'action_e2e')).toBe(true);
    // Every link touching the deleted node was cascaded away.
    expect(after.links.some((l) => l.sourceNodeId === 'cue_e2e' || l.targetNodeId === 'cue_e2e')).toBe(false);
  });
});

test('creates a link on the conditions orientation (cue.conditions -> event.condition)', async ({ page }) => {
  await page.route('**/api/agent/compile', async (route) => {
    await route.fulfill({ json: { diagnostics: [] } });
  });

  await withSeededCanvas(page, async () => {
    await page.getByTestId('canvas-port-cue_e2e-out_cond').click();
    await page.getByTestId('canvas-port-event_e2e-in_cond').click();

    const after = await readWorkspace(page);
    expect(after.links).toContainEqual(expect.objectContaining({
      sourceNodeId: 'cue_e2e',
      sourcePortId: 'out_cond',
      targetNodeId: 'event_e2e',
      targetPortId: 'in_cond',
    }));
  });
});
