import { expect, test, type Page } from '@playwright/test';

/**
 * B19 slice 1 — guided rail (Vision v2 Phase 1 keystone).
 *
 * Proves the newcomer flow the old onboarding abandoned: empty canvas → onboarding
 * picker → click a starter template → the guided rail appears and walks steps
 * 1 (tweak) → 2 (deploy) → 3 (see it in game) → dismiss.
 *
 * DELIBERATELY NEVER CLICKS "Deploy to X4" — that would write into the real game
 * extensions folder. Step 2 is asserted present, not executed (deploy-verify has its
 * own coverage; the rail reuses it verbatim).
 *
 * Isolation: same harness shape as canvas-coverage.spec.ts, WIDENED — this spec's
 * flow legitimately syncs template-named workspaces, so POST isolation blocks any
 * name starting with "X4_" or "E2E_", not just the fixture (the boot-blank default
 * starts with "X4_" too). GET isolation starts only AFTER the true server original
 * is captured (B15 capture-first canon).
 */

type E2EWorkspace = { id?: string; name: string; nodes: unknown[]; links: unknown[]; [k: string]: unknown };
type E2EWindow = Window & {
  __X4_E2E__?: {
    getWorkspace: () => E2EWorkspace;
    setWorkspace: (workspace: E2EWorkspace) => void;
  };
};

const emptyFixture: E2EWorkspace = {
  id: 'e2e_rail_empty',
  name: 'E2E_Rail_Empty',
  version: '1.0.0',
  author: 'Playwright',
  description: 'Guided-rail harness fixture (empty → onboarding shows)',
  nodes: [],
  links: [],
  uiWidgets: [],
};

const fallbackRestore: E2EWorkspace = { ...emptyFixture, id: 'e2e_rail_restore_baseline', name: 'E2E_Rail_Restore_Baseline' };

test('template click summons the guided rail and walks all three steps', async ({ page }) => {
  let blocked = 0;
  let isolateGets = false;
  await page.route('**/api/agent/workspace', async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && isolateGets) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workspace: emptyFixture, version: 1, workspaceHash: '', lastUpdated: new Date().toISOString() }),
      });
      return;
    }
    if (request.method() === 'POST') {
      let payload: { workspace?: { name?: string } } = {};
      try { payload = JSON.parse(request.postData() || '{}'); } catch { payload = {}; }
      const name = payload.workspace?.name || '';
      // Block fixture AND template/boot-blank names (all X4_*/E2E_*) from touching
      // the real server; the teardown restore (real mod name) passes through.
      if (/^(X4_|E2E_)/.test(name)) {
        blocked += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, applied: false, version: 900001, message: 'rail spec isolation' }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.addInitScript(() => {
    localStorage.removeItem('x4_mod_studio_workspace');
    localStorage.setItem('x4_mod_studio_version', '9007199254740991');
  });
  await page.goto('/');
  await expect(page.getByTestId('grid-canvas')).toBeVisible();
  await page.waitForFunction(() => !!(window as E2EWindow).__X4_E2E__);

  // Capture the TRUE server original BEFORE GET isolation (B15 capture-first canon).
  const original = await page.evaluate(async ({ fixtureName, fallback }) => {
    const response = await fetch('/api/agent/workspace');
    if (!response.ok) throw new Error(`workspace fetch failed: ${response.status}`);
    const data = await response.json();
    const serverWorkspace = data.workspace as { name: string };
    return serverWorkspace.name === fixtureName ? fallback : serverWorkspace;
  }, { fixtureName: emptyFixture.name, fallback: fallbackRestore });

  try {
    await page.evaluate((ws) => { (window as E2EWindow).__X4_E2E__!.setWorkspace(ws); }, emptyFixture);
    isolateGets = true;
    await page.waitForTimeout(650);

    // Empty canvas → onboarding picker is up.
    await expect(page.getByTestId('template-welcome')).toBeVisible();

    // Load the starter → rail appears on step 1 with the template's tweak hint.
    await page.getByTestId('template-welcome').click();
    await expect(page.getByTestId('guided-rail')).toBeVisible();
    await expect(page.getByTestId('rail-tweak')).toContainText('Welcome Message');
    await expect(page.getByTestId('rail-tweak')).toContainText('show_help');

    // Step 2: deploy button present — NOT clicked (writes to the real game dir).
    await page.getByTestId('rail-next').click();
    await expect(page.getByTestId('rail-deploy')).toBeVisible();

    // Step 3 via the chip: watcher status renders.
    await page.getByTestId('rail-step-3').click();
    await expect(page.getByTestId('rail-game')).toBeVisible();

    // Dismiss → rail gone.
    await page.getByTestId('rail-close').click();
    await expect(page.getByTestId('guided-rail')).toHaveCount(0);

    expect(blocked).toBeGreaterThan(0);
  } finally {
    isolateGets = false;
    await page.evaluate(async (workspace) => {
      (window as E2EWindow).__X4_E2E__!.setWorkspace(workspace as never);
      const response = await fetch('/api/agent/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // B2s3 legacy gate: fixture restore is a deliberate overwrite.
        body: JSON.stringify({ workspace, force: true }),
      });
      if (!response.ok) throw new Error(`workspace restore failed: ${response.status}`);
    }, original);
    await page.waitForTimeout(500);
    const restored = await page.evaluate(async () => {
      const response = await fetch('/api/agent/workspace');
      const data = await response.json();
      return (data.workspace as { name: string }).name;
    });
    expect(restored).toBe((original as { name: string }).name);
    expect(restored).not.toBe(emptyFixture.name);
  }
});
