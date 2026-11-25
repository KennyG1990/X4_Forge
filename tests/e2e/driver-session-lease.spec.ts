import { E2E_API_ORIGIN } from '../../playwright.config';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { ephemeralWorkspaceHeaders, seedServerWorkspace } from './ephemeral';
import { expect, fetchFixtureResponse, test } from './request-transport';

async function bootStudio(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as {
    AgentRuntime?: { getCurrentWorkspace: () => { name?: string } };
  }).AgentRuntime?.getCurrentWorkspace().name);
  const healthCard = page.getByTestId('health-card');
  await healthCard.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined);
  if (await healthCard.isVisible()) await page.getByTestId('health-card-dismiss').click();
}

test('Studio UI coordinates TTL-bounded driver session leases and owner force-release (#49)', async ({ page }) => {
  await seedServerWorkspace(buildTemplateWorkspace('welcome'));
  const studioHeaders = await ephemeralWorkspaceHeaders(true);
  const workspaceId = studioHeaders['x-workspace-id'];

  // Ensure idle baseline before booting the page.
  await fetchFixtureResponse(`${E2E_API_ORIGIN}/api/agent/lease`, {
    method: 'POST',
    headers: studioHeaders,
    body: JSON.stringify({ action: 'release', force: true }),
  });

  // Mint an isolated write-scoped agent key bound to this workspace.
  const mintRes = await fetchFixtureResponse(`${E2E_API_ORIGIN}/api/agent/keys`, {
    method: 'POST',
    headers: studioHeaders,
    body: JSON.stringify({ label: 'e2e-codex-driver', scope: 'write', ttl: '1h', workspaceId }),
  });
  const mintJson = await mintRes.json();
  expect(mintRes.status).toBe(200);
  const agentToken = String(mintJson.token);
  const agentKeyId = String(mintJson.record.id);

  try {
    await bootStudio(page);

    // Idle state: zero banner rendered (no layout clutter when unused).
    await expect(page.getByTestId('studio-driver-lease-banner')).toHaveCount(0);

    // 1. Human takes UI Driver Lease from Studio Actions menu.
    await page.getByTestId('studio-menu-button').click();
    await page.getByTestId('driver-lease-menu-btn').click();

    const banner = page.getByTestId('studio-driver-lease-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-lease-owner', 'studio');
    await expect(page.getByTestId('studio-driver-lease-summary')).toContainText('UI Driver Lease active');

    // External agent attempting to acquire or mutate while UI holds lease gets 409 DRIVER_LEASE_HELD.
    const blockedAgentAcquire = await fetchFixtureResponse(`${E2E_API_ORIGIN}/api/agent/lease`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${agentToken}`,
        'Content-Type': 'application/json',
        'x-workspace-id': workspaceId,
      },
      body: JSON.stringify({ action: 'acquire', driver: 'codex-ui', purpose: 'Automated modal pass' }),
    });
    expect(blockedAgentAcquire.status).toBe(409);
    const blockedAgentJson = await blockedAgentAcquire.json();
    expect(blockedAgentJson.code).toBe('DRIVER_LEASE_HELD');

    // Extend and release from the Studio banner.
    await page.getByTestId('driver-lease-renew-btn').click();
    await expect(banner).toBeVisible();
    await page.getByTestId('driver-lease-release-btn').click();
    await expect(page.getByTestId('studio-driver-lease-banner')).toHaveCount(0);

    // 2. External agent acquires a driver lease; Studio detects it on focus/poll and offers Force Release (Owner).
    const agentAcquire = await fetchFixtureResponse(`${E2E_API_ORIGIN}/api/agent/lease`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${agentToken}`,
        'Content-Type': 'application/json',
        'x-workspace-id': workspaceId,
      },
      body: JSON.stringify({ action: 'acquire', driver: 'codex-ui', purpose: 'E2E modal walkthrough', ttlMs: 120_000 }),
    });
    expect(agentAcquire.status).toBe(200);

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-lease-owner', 'agent');
    await expect(page.getByTestId('studio-driver-lease-summary')).toContainText('Forge is currently in use by codex-ui');
    await expect(page.getByTestId('studio-driver-lease-summary')).toContainText('E2E modal walkthrough');

    await page.screenshot({ path: 'test-results/driver-session-lease-agent-held.png', fullPage: true });

    // Owner clicks Force Release (Owner) and clears the external agent's lease immediately.
    await page.getByTestId('driver-lease-force-release-btn').click();
    await expect(page.getByTestId('studio-driver-lease-banner')).toHaveCount(0);

    const afterForce = await fetchFixtureResponse(`${E2E_API_ORIGIN}/api/agent/lease`, {
      method: 'GET',
      headers: studioHeaders,
    });
    const afterForceJson = await afterForce.json();
    expect(afterForceJson.driverLease.held).toBe(false);
  } finally {
    await fetchFixtureResponse(`${E2E_API_ORIGIN}/api/agent/lease`, {
      method: 'POST',
      headers: studioHeaders,
      body: JSON.stringify({ action: 'release', force: true }),
    }).catch(() => undefined);
    await fetchFixtureResponse(`${E2E_API_ORIGIN}/api/agent/keys/revoke`, {
      method: 'POST',
      headers: studioHeaders,
      body: JSON.stringify({ id: agentKeyId }),
    }).catch(() => undefined);
  }
});
