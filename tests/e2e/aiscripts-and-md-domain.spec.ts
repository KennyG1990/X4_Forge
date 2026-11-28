import { expect, test, type Page } from './request-transport';
import { seedServerLayout, seedServerWorkspace } from './ephemeral';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { DEFAULT_STUDIO_LAYOUT, STUDIO_LAYOUT_KEY } from '../../src/lib/studioLayout';
import { workspaceContentHash } from '../../src/lib/workspaceIdentity';
import { sanitizeWorkspace } from '../../src/types';

type E2EWindow = Window & {
  AgentRuntime?: { getCurrentWorkspace: () => ReturnType<typeof buildTemplateWorkspace> };
};

async function bootExpertWelcome(page: Page) {
  const seededWorkspace = buildTemplateWorkspace('welcome');
  const seededHash = workspaceContentHash(sanitizeWorkspace(seededWorkspace));
  await seedServerWorkspace(seededWorkspace);
  await seedServerLayout(DEFAULT_STUDIO_LAYOUT);
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem('x4_forge_experience_mode', 'expert');
      if (sessionStorage.getItem('__x4_ui_p3_init') !== '1') {
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify(value));
        sessionStorage.setItem('__x4_ui_p3_init', '1');
      }
    },
    { key: STUDIO_LAYOUT_KEY, value: DEFAULT_STUDIO_LAYOUT },
  );
  await page.goto('/');
  await expect(page.getByTestId('studio-workspace')).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const ws = (window as E2EWindow).AgentRuntime?.getCurrentWorkspace?.();
          return ws ? ws.nodes.length : 0;
        }),
      { timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(3);
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as E2EWindow).AgentRuntime!.getCurrentWorkspace()).then(ws =>
          workspaceContentHash(sanitizeWorkspace(ws)),
        ),
      { timeout: 10000 },
    )
    .toBe(seededHash);
}

test('AI Scripts X4 9.00 workbench supports order, attentionlookup, interrupts, RFC 5261 diff, and negative lint', async ({
  page,
}) => {
  await bootExpertWelcome(page);

  await page.locator('[data-workspace-view="aiscripts"]').click();
  await expect(page.locator('#ai_script_editor_view')).toBeVisible();

  await page.getByTestId('ai-clone-preset-ai_order_patrol_sector').click();
  await expect(page.getByTestId('ai-script-lint-badge')).toContainText('XSD & Lint Clean');

  await page.getByTestId('ai-tab-actions').click();
  await page.getByTestId('ai-attention-select').selectOption('nearby');
  await page.getByTestId('ai-add-action-label').click();
  await page.getByTestId('ai-add-action-resume').click();

  await page.getByTestId('ai-tab-xml').click();
  const xmlPreview = page.getByTestId('ai-xml-preview');
  await expect(xmlPreview).toContainText('<order ');
  await expect(xmlPreview).toContainText('<interrupts>');
  await expect(xmlPreview).toContainText('<patch sinceversion="2"');
  await expect(xmlPreview).toContainText('<attention min="nearby">');
  await expect(xmlPreview).toContainText('<label name=');
  await expect(xmlPreview).toContainText('<resume label=');

  await page.getByTestId('ai-mode-diff').click();
  await expect(xmlPreview).toContainText('<diff ');
  await expect(xmlPreview).toContainText('<add sel=');
  await expect(xmlPreview).toContainText('</diff>');

  // Negative check: switching back to full script and clearing text="" on a non-internal <order> param must surface a lint error
  await page.getByTestId('ai-mode-aiscript').click();
  await page.getByTestId('ai-tab-order').click();
  await page.getByTestId('ai-param-text-0').fill('');
  await expect(page.getByTestId('ai-script-lint-badge')).toContainText('error');

  await page.getByTestId('ai-tab-xml').click();
  await expect(page.getByTestId('ai-lint-findings-list')).toContainText('aiscript.order_param_missing_text');
});

test('MD Scripts canvas & CueTree expose <library purpose> and <patch sinceversion> X4 9.00 attributes', async ({
  page,
}) => {
  await bootExpertWelcome(page);

  const cueCard = page.getByTestId('canvas-node-c');
  await expect(cueCard).toBeVisible();
  await cueCard.click();

  const inspector = page.getByTestId('contextual-inspector');
  await expect(inspector).toBeVisible();

  await inspector.locator('label', { hasText: 'Is Library' }).locator('..').locator('select').selectOption('true');
  await inspector
    .locator('label', { hasText: 'Library Purpose' })
    .locator('..')
    .locator('select')
    .selectOption('run_actions');
  await inspector
    .locator('label', { hasText: 'Patch Since Version' })
    .locator('..')
    .getByTestId('expression-input')
    .fill('2');

  await expect(cueCard.getByTestId('cue-library-purpose-badge')).toContainText('library · run_actions');
  await expect(cueCard.getByTestId('cue-patch-version-badge')).toContainText('patch v2');

  await inspector.getByRole('button', { name: 'XML' }).click();
  await expect(inspector).toContainText('<library ');
  await expect(inspector).toContainText('purpose="run_actions"');
  await expect(inspector).toContainText('<patch sinceversion="2"');

  await page.getByTestId('canvas-cue-tree-toggle').click();
  await expect(page.getByTestId('cue-viewer-library-badge')).toContainText('run_actions');
  await expect(page.getByTestId('cue-viewer-patch-badge')).toContainText('p2');
});
