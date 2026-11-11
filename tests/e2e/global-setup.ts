import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { startE2EViteServer } from './e2e-vite-server';
import { E2E_RUNTIME } from '../../playwright.config';

export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  const rootDir = config.configFile ? path.dirname(config.configFile) : process.cwd();
  const vite = await startE2EViteServer({ rootDir, compiled: E2E_RUNTIME.mode === 'compiled' });
  return async () => {
    await vite.close();
  };
}
