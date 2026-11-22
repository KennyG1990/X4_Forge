import type { StudioMenuAction } from '../../src/components/StudioActionsMenu';
import type { Page } from './request-transport';

export async function openStudioAction(page: Pick<Page, 'getByTestId'>, action: StudioMenuAction): Promise<void> {
  const menu = page.getByTestId('studio-menu');
  if (!await menu.isVisible()) await page.getByTestId('studio-menu-button').click();
  await menu.locator('[data-global-action="' + action + '"]').click();
}
