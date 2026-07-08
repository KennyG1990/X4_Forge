import { restoreWorkspace } from './workspace-guard';

export default async function globalTeardown(): Promise<void> {
  await restoreWorkspace();
}
