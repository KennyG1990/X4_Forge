import { defineConfig, devices } from '@playwright/test';
import * as os from 'os';
import * as path from 'path';

/**
 * B31s2 (2026-07-12): e2e runs against an EPHEMERAL Forge stack — its own Vite (3100),
 * its own API (3101), its own bearer token, and a per-run temp state dir. The user's
 * live dev stack (3000/3001) and workspace are untouched BY CONSTRUCTION, which retires
 * the workspace-guard snapshot/restore and every page.route isolation harness the old
 * shared-server model required (the half-isolation behind incident classes B15, #70,
 * and the 07-12 suppression interplay).
 */
export const E2E_WEB_PORT = 3100;
export const E2E_API_PORT = 3101;
export const E2E_TOKEN = 'x4forge-e2e-ephemeral-token';
// Per-run state dir: unique-ish per process start; OS temp cleanup owns the leftovers.
const E2E_STATE_DIR = path.join(os.tmpdir(), `x4forge-e2e-state-${process.pid}`);

const ephemeralEnv = {
  STUDIO_API_TOKEN: E2E_TOKEN,
  API_PORT: String(E2E_API_PORT),
  X4_STATE_DIR: E2E_STATE_DIR,
  // Deterministic pages: no HMR socket, no watcher-triggered reloads mid-spec.
  DISABLE_HMR: 'true',
};

export default defineConfig({
  testDir: './tests/e2e',
  // ONE worker still: specs share the ONE ephemeral server's active workspace.
  // (Per-worker servers would allow parallelism later — ports would need to shard.)
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${E2E_WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx server.ts',
      url: `http://localhost:${E2E_API_PORT}/api/agent/schema`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...ephemeralEnv, PORT: String(E2E_API_PORT) },
    },
    {
      command: `npx vite --port ${E2E_WEB_PORT} --strictPort`,
      url: `http://localhost:${E2E_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: ephemeralEnv,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
