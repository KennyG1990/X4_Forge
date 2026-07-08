import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // ONE worker, no parallelism: the suites share the dev server's SINGLE live workspace
  // (seed → interact → restore). Two workers race each other's seed/restore, so the
  // "original" one worker captures can be another worker's fixture — which is exactly
  // how the user's loaded workspace got clobbered twice on 2026-07-09. Serial is slower
  // but honest until tests get isolated workspace contexts (G14 follow-up).
  fullyParallel: false,
  workers: 1,
  // Snapshot the server's live workspace before the suite and restore it after — the
  // app under test syncs its own (default) workspace to the server on boot, which
  // clobbered the user's loaded workspace before this guard existed.
  globalSetup: './tests/e2e/workspace-guard.ts',
  globalTeardown: './tests/e2e/workspace-guard.teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
