import { expect, test, type Page } from '@playwright/test';

type E2EWorkspace = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  nodes: Array<{
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
  }>;
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
  id: 'e2e_canvas',
  name: 'E2E_Canvas',
  version: '1.0.0',
  author: 'Playwright',
  description: 'Canvas interaction harness fixture',
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

async function seedWorkspace(page: Page): Promise<E2EWorkspace> {
  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.removeItem('x4_mod_studio_version');
  });
  await page.goto('/');
  await expect(page.getByTestId('grid-canvas')).toBeVisible();
  await page.waitForFunction(() => !!(window as E2EWindow).__X4_E2E__);
  const original = await page.evaluate(async () => {
    const response = await fetch('/api/agent/workspace');
    if (!response.ok) throw new Error(`workspace fetch failed: ${response.status}`);
    const data = await response.json();
    return data.workspace as E2EWorkspace;
  });
  await page.evaluate((workspace) => {
    (window as E2EWindow).__X4_E2E__!.setWorkspace(workspace);
  }, controlledWorkspace);
  await expect(page.getByTestId('canvas-node-cue_e2e')).toBeVisible();
  await expect(page.getByTestId('canvas-node-action_e2e')).toBeVisible();
  return original;
}

async function workspace(page: Page): Promise<E2EWorkspace> {
  return page.evaluate(() => (window as E2EWindow).__X4_E2E__!.getWorkspace());
}

test('real canvas interactions create oriented links, move groups, add from palette, and avoid per-frame compile requests', async ({ page }) => {
  let compileRequests = 0;
  await page.route('**/api/agent/compile', async (route) => {
    compileRequests += 1;
    await route.fulfill({ json: { diagnostics: [] } });
  });

  const originalWorkspace = await seedWorkspace(page);

  try {
    await page.waitForTimeout(650);
    compileRequests = 0;

    const cue = page.getByTestId('canvas-node-cue_e2e');
    const event = page.getByTestId('canvas-node-event_e2e');

    await page.getByTestId('canvas-port-cue_e2e-out_act').click();
    await page.getByTestId('canvas-port-action_e2e-in_act').click();
    const afterLink = await workspace(page);
    expect(afterLink.links).toContainEqual(expect.objectContaining({
      sourceNodeId: 'cue_e2e',
      sourcePortId: 'out_act',
      targetNodeId: 'action_e2e',
      targetPortId: 'in_act',
    }));
    await page.waitForTimeout(700);
    compileRequests = 0;

    const beforeDrag = await workspace(page);
    const cueBefore = beforeDrag.nodes.find((node) => node.id === 'cue_e2e')!;
    const eventBefore = beforeDrag.nodes.find((node) => node.id === 'event_e2e')!;

    await cue.click({ modifiers: ['Shift'] });
    await event.click({ modifiers: ['Shift'] });
    await cue.dragTo(cue, {
      sourcePosition: { x: 30, y: 20 },
      targetPosition: { x: 110, y: 90 },
      steps: 18,
    });

    const afterGroupDrag = await workspace(page);
    const cueAfter = afterGroupDrag.nodes.find((node) => node.id === 'cue_e2e')!;
    const eventAfter = afterGroupDrag.nodes.find((node) => node.id === 'event_e2e')!;
    expect(cueAfter.x).toBeGreaterThan(cueBefore.x);
    expect(cueAfter.y).toBeGreaterThan(cueBefore.y);
    expect(eventAfter.x - eventBefore.x).toBe(cueAfter.x - cueBefore.x);
    expect(eventAfter.y - eventBefore.y).toBe(cueAfter.y - cueBefore.y);

    await page.waitForTimeout(700);
    expect(compileRequests).toBeLessThanOrEqual(2);

    await page.getByTestId('grid-canvas').click({
      button: 'right',
      position: { x: 720, y: 180 },
    });
    await expect(page.getByTestId('canvas-quick-spawn')).toBeVisible();
    await page.getByPlaceholder('Search egosoft logic parameters...').fill('reward_player');
    await page.getByTestId('canvas-palette-reward_player').click();
    const afterPaletteAdd = await workspace(page);
    expect(afterPaletteAdd.nodes.some((node) => node.xmlTag === 'reward_player')).toBe(true);
  } finally {
    await page.evaluate(async (workspace) => {
      (window as E2EWindow).__X4_E2E__!.setWorkspace(workspace);
      const response = await fetch('/api/agent/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace }),
      });
      if (!response.ok) throw new Error(`workspace restore failed: ${response.status}`);
    }, originalWorkspace);
    await page.waitForTimeout(800);
  }
});
