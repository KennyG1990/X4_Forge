import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { seedServerWorkspace } from './ephemeral';

// Actual scratch-deployment responses, replayed only to prove UI rendering.
const evidence=path.resolve('test-results/deploy-review-ui');
fs.mkdirSync(evidence,{recursive:true});
const fixtures=JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/forge-regression/deploy-responses.json'),'utf8'));
const workspace=buildTemplateWorkspace('welcome');
workspace.name='Forge Regression Lab';

test('wizard and Playtest distinguish actual test-mod deployment outcomes',async({page})=>{
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  await seedServerWorkspace(workspace);
  await page.addInitScript(()=>{
    if(!sessionStorage.getItem('deploy_review_mode_set')){
      localStorage.removeItem('x4_forge_experience_mode');
      sessionStorage.setItem('deploy_review_mode_set','1');
    }
  });
  await page.route('**/api/schema/config',route=>route.fulfill({json:{loaded:true,config:{modWorkspacePath:path.join(evidence,'ui-only-staging')},resolved:{mdExists:true},deployFormat:{format:'loose'}}}));
  await page.route('**/api/agent/compile',route=>route.fulfill({json:{success:true,diagnostics:[],validation:{scope:'full-project',ok:true}}}));
  let fixture=fixtures.accepted, delay=0, omitTargetFingerprint=false, omitTargetRoot=false;
  const requests: Array<Record<string, unknown>> = [];
  const applyIdentities: unknown[] = [];
  const modeledTargetFingerprint = 'absent';
  const modeledTargetRoot = path.join(evidence, 'modeled-game', 'extensions', 'forge_regression_lab');
  await page.route('**/api/agent/deploy-verify',async route=>{
    const body=route.request().postDataJSON();
    requests.push(body);
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    const result=structuredClone(fixture);
    // Workspace adoption is a separate API contract; never write a historical fixture's workspace.
    delete result.workspace;
    if(body.dryRun && result.ok){
      result.stage='preview';result.dryRun=true;delete result.bytesConfirmed;delete result.deployedPath;
      // These historical apply responses do not contain a preview destination identity.
      if(omitTargetFingerprint) delete result.targetFingerprint;
      else result.targetFingerprint=modeledTargetFingerprint;
      if(omitTargetRoot) delete result.targetRoot;
      else result.targetRoot=modeledTargetRoot;
    }
    if(body.dryRun === false){
      applyIdentities.push({
        modId: body.expectedModId, sourceHash: body.expectedSourceHash,
        artifactHash: body.expectedArtifactHash, bindingHash: body.expectedBindingHash,
        targetFingerprint: body.expectedTargetFingerprint,
      });
    }
    await route.fulfill({json:result});
  });
  await page.goto('/');
  await page.waitForFunction(()=>Boolean((window as any).__X4_E2E__?.getWorkspace()));
  const dismiss=page.getByTestId('health-card-dismiss');if(await dismiss.isVisible())await dismiss.click();
  await page.getByTestId('beginner-step-deploy').click();
  await page.getByTestId('beginner-open-deploy').click();
  await expect(page.getByText('Compile & Deploy Wizard',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Build & Staging',exact:true}).click();
  const card=page.getByTestId('wizard-preflight-card');
  await expect(card.getByTestId('deploy-review-title')).toHaveText('Deployed — accepted findings');
  await expect(card.getByTestId('deploy-review-summary')).toHaveAttribute('data-tone','qualified');
  await expect(card.getByTestId('deploy-review-counts')).toContainText('Accepted: 0 errors, 1 warnings');
  await card.getByText('Recorded approvals (1)',{exact:true}).click();
  const approval=fixtures.accepted.validation.review.approvals[0];
  await expect(card).toContainText(approval.reason);await expect(card).toContainText(approval.actor.id);await expect(card).toContainText(approval.receiptId);
  await card.evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({path:path.join(evidence,'wizard-accepted.png'),fullPage:true});
  await card.getByText(`Actor: ${approval.actor.label} (${approval.actor.id})`,{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,'wizard-approval-detail.png'),fullPage:true});
  fixture=fixtures.mixed;delay=150;
  await page.getByRole('button',{name:'Build Again',exact:true}).click();
  await expect(card.getByTestId('deploy-review-summary')).toHaveCount(0);
  await expect(card.getByTestId('deploy-review-title')).toHaveText('Deployed — outstanding findings');
  await expect(card).toContainText('Outstanding: 0 errors, 1 warnings. Accepted: 0 errors, 1 warnings.');
  delay=0;
  await page.screenshot({path:path.join(evidence,'wizard-mixed.png'),fullPage:true});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByTestId('beginner-open-deploy').click();
  await expect(page.getByTestId('wizard-preflight-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  // Expert navigation exposes the existing Playtest surface; no new product hook.
  await page.evaluate(()=>localStorage.setItem('x4_forge_experience_mode','expert'));
  await page.reload();
  await page.locator('[data-sidebar-tab="playtest"]').click();
  await page.getByTestId('verify-path-input').fill('forge_regression_lab');
  const previewButton = page.getByTestId('deploy-verify-btn');
  const applyButton = page.getByTestId('deploy-apply-btn');
  const destination = page.getByTestId('playtest-deploy-destination');
  const playtestResult = page.getByTestId('verify-result');
  const playtestTitle = playtestResult.getByTestId('deploy-review-title');
  async function confirmPlaytest() {
    const previousCalls = requests.length;
    const source = { path: 'forge_regression_lab', root: 'workspace' };
    await previewButton.click();
    await expect(destination).toContainText(modeledTargetRoot);
    await expect(playtestTitle).toHaveText('Preview — not deployed');
    expect(requests.slice(previousCalls)).toEqual([{ ...source, dryRun: true }]);
    await applyButton.click();
    await expect.poll(() => requests.length).toBe(previousCalls + 2);
    expect(requests[previousCalls + 1]).toEqual({
      ...source,
      dryRun: false,
      expectedModId: fixture.modId,
      expectedSourceHash: fixture.sourceHash,
      expectedArtifactHash: fixture.artifactHash,
      expectedBindingHash: fixture.bindingHash,
      expectedTargetFingerprint: modeledTargetFingerprint,
    });
  }
  for(const [name,title,tone] of [
    ['clean','Deployed — validation checks passed','clean'],
    ['warnings','Deployed — outstanding findings','qualified'],
    ['accepted','Deployed — accepted findings','qualified'],
    ['incomplete','Deployed — incomplete checks','qualified'],
  ]){
    fixture=fixtures[name];await confirmPlaytest();
    await expect(playtestTitle).toHaveText(title);
    await expect(playtestResult.getByTestId('deploy-review-summary')).toHaveAttribute('data-tone',tone);
    await expect(playtestResult).toContainText('does not verify behavior in X4');
  }
  await page.screenshot({path:path.join(evidence,'playtest-incomplete.png'),fullPage:true});
  fixture={...fixtures.clean,bytesConfirmed:undefined};await confirmPlaytest();
  await expect(playtestTitle).toContainText('bytes unconfirmed');
  const beforeRefusal = requests.length;
  fixture={ok:false,stage:'preflight',error:'Fixture refusal'};await previewButton.click();
  await expect(playtestTitle).toHaveText('Deployment failed');
  await expect(playtestResult).toContainText('Fixture refusal');
  await expect(applyButton).toHaveCount(0);
  expect(requests).toHaveLength(beforeRefusal + 1);
  expect(applyIdentities).toEqual(
    [fixtures.accepted, fixtures.mixed, fixtures.clean, fixtures.warnings, fixtures.accepted, fixtures.incomplete, fixtures.clean]
      .map(({modId, sourceHash, artifactHash, bindingHash}) => ({
        modId, sourceHash, artifactHash, bindingHash, targetFingerprint: modeledTargetFingerprint,
      })),
  );
  const beforeMissingIdentity = requests.length;
  fixture=fixtures.clean;omitTargetFingerprint=true;
  await previewButton.click();
  await expect(playtestResult).toContainText('Forge did not provide a deploy identity. No deployment was attempted.');
  await expect(applyButton).toHaveCount(0);
  expect(requests).toHaveLength(beforeMissingIdentity + 1);
  const beforeMissingDestination = requests.length;
  omitTargetFingerprint=false;omitTargetRoot=true;
  await previewButton.click();
  await expect(playtestResult).toContainText('exact X4 install destination');
  await expect(playtestTitle).toHaveText('Deployment failed');
  await expect(destination).toHaveCount(0);
  await expect(applyButton).toHaveCount(0);
  expect(requests).toHaveLength(beforeMissingDestination + 1);

  omitTargetRoot=false;
  const beforeSelectionChange = requests.length;
  await previewButton.click();
  await expect(destination).toContainText(modeledTargetRoot);
  await page.evaluate(() => {
    const context = window.__X4_WORKSPACE_CONTEXT__!;
    const original = context.getWorkspaceId();
    const alternate = original === 'ws_000000000000000000000000' ? 'ws_111111111111111111111111' : 'ws_000000000000000000000000';
    context.selectWorkspace(alternate);
    context.selectWorkspace(original);
  });
  await applyButton.click();
  await expect(applyButton).toHaveCount(0);
  expect(requests).toHaveLength(beforeSelectionChange + 1);
  expect(applyIdentities).toHaveLength(7);
});
