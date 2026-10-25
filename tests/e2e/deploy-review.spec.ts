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
  let fixture=fixtures.accepted, delay=0, calls=0;
  await page.route('**/api/agent/deploy-verify',async route=>{
    calls++;
    const body=route.request().postDataJSON();
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    const result=structuredClone(fixture);
    // Workspace adoption is a separate API contract; never write a historical fixture's workspace.
    delete result.workspace;
    if(body.dryRun && result.ok){result.stage='preview';result.dryRun=true;delete result.bytesConfirmed;delete result.deployedPath;}
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
  for(const [name,title,tone] of [
    ['clean','Deployed — validation checks passed','clean'],
    ['warnings','Deployed — outstanding findings','qualified'],
    ['accepted','Deployed — accepted findings','qualified'],
    ['incomplete','Deployed — incomplete checks','qualified'],
  ]){
    fixture=fixtures[name];await page.getByTestId('deploy-verify-btn').click();
    await expect(page.getByTestId('verify-result').getByTestId('deploy-review-title')).toHaveText(title);
    await expect(page.getByTestId('verify-result').getByTestId('deploy-review-summary')).toHaveAttribute('data-tone',tone);
    await expect(page.getByTestId('verify-result')).toContainText('does not verify behavior in X4');
  }
  await page.screenshot({path:path.join(evidence,'playtest-incomplete.png'),fullPage:true});
  fixture={...fixtures.clean,bytesConfirmed:undefined};await page.getByTestId('deploy-verify-btn').click();
  await expect(page.getByTestId('verify-result').getByTestId('deploy-review-title')).toContainText('bytes unconfirmed');
  fixture={ok:false,stage:'preflight',error:'Fixture refusal'};await page.getByTestId('deploy-verify-btn').click();
  await expect(page.getByTestId('verify-result').getByTestId('deploy-review-title')).toHaveText('Deployment failed');
  await expect(page.getByTestId('verify-result')).toContainText('Fixture refusal');
  expect(calls).toBeGreaterThan(10);
});
