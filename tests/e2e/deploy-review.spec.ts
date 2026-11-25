import { expect, test } from './request-transport';
import fs from 'node:fs';
import path from 'node:path';
import { buildTemplateWorkspace } from '../../src/lib/modTemplates';
import { seedServerWorkspace } from './ephemeral';

// Actual scratch-deployment responses, replayed only to prove UI rendering.
const evidence=path.resolve('test-results/deploy-review-ui');
const fixtures=JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/forge-regression/deploy-responses.json'),'utf8'));
const workspace=buildTemplateWorkspace('welcome');
workspace.name='Forge Regression Lab';

test('wizard and Playtest distinguish actual test-mod deployment outcomes',async({page})=>{
  fs.mkdirSync(evidence,{recursive:true});
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
  let holdNextPreview=false;
  let releaseHeldPreview: (() => void) | undefined;
  const requests: Array<Record<string, unknown>> = [];
  const applyIdentities: unknown[] = [];
  const modeledTargetFingerprint = 'a'.repeat(64);
  const modeledFileChanges = {
    added: [{ path: 'assets/new.xml', bytes: 5 }],
    overwritten: [
      { path: 'assets/update.xml', wasBytes: 7, bytes: 11 },
      { path: 'assets/catalog/long-ships-and-weapons-deployment-volume-0001.dat', wasBytes: 7_465_341, bytes: 11_654_123 },
    ],
    deleted: [{ path: 'assets/obsolete.xml', bytes: 13 }],
    preserved: ['runtime/local.xml', ...Array.from({ length: 50 }, (_, index) => 'runtime/preserved-' + index + '.xml')],
  };
  const appliedFileChanges = { ...modeledFileChanges, preserved: ['runtime/retained-at-apply.xml'] };
  const modeledTargetRoot = path.join(evidence, 'modeled-game', 'extensions', 'forge_regression_lab');
  await page.route('**/api/agent/deploy-verify',async route=>{
    const body=route.request().postDataJSON();
    requests.push(body);
    if(body.dryRun === true && holdNextPreview){
      holdNextPreview=false;
      await new Promise<void>(resolve=>{releaseHeldPreview=resolve;});
    }
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    const result=structuredClone(fixture);
    // Workspace adoption is a separate API contract; never write a historical fixture's workspace.
    delete result.workspace;
    if(body.dryRun && result.ok){
      result.stage='preview';result.dryRun=true;delete result.bytesConfirmed;delete result.deployedPath;
      result.effect = modeledFileChanges;
      // These historical apply responses do not contain a preview destination identity.
      if(omitTargetFingerprint) delete result.targetFingerprint;
      else result.targetFingerprint=modeledTargetFingerprint;
      if(omitTargetRoot) delete result.targetRoot;
      else result.targetRoot=modeledTargetRoot;
    }
    if(body.dryRun === false){
      if (result.ok) {
        result.deployRecord = { id: 'qa-committed-deploy', status: 'committed' };
        result.effect = appliedFileChanges;
      }
      applyIdentities.push({
        modId: body.expectedModId, sourceHash: body.expectedSourceHash,
        artifactHash: body.expectedArtifactHash, bindingHash: body.expectedBindingHash,
        targetFingerprint: body.expectedTargetFingerprint,
      });
    }
    await route.fulfill({json:result});
  });
  try {
  await page.goto('/');
  await page.waitForFunction(()=>Boolean(window.AgentRuntime?.getCurrentWorkspace()));
  const dismiss=page.getByTestId('health-card-dismiss');if(await dismiss.isVisible())await dismiss.click();
  await page.getByTestId('beginner-step-deploy').click();
  await page.getByTestId('beginner-open-deploy').click();
  await expect(page.getByText('Compile & Deploy Wizard',{exact:true})).toBeVisible();
  const card=page.getByTestId('wizard-preflight-card');
  const wizardPreview=page.getByTestId('wizard-preview-deploy');
  const wizardApply=page.getByTestId('wizard-apply-deploy');
  const wizardDestination=page.getByTestId('wizard-deploy-destination');
  async function reviewFileChanges() {
    const priorRequests = requests.length;
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 760 });
    const disclosure = page.getByTestId('deploy-file-changes');
    const list = disclosure.getByRole('list', { name: 'Files affected by deployment' });
    await expect(disclosure).toContainText('1 added · 2 replaced · 1 removed · 51 preserved');
    await expect(list).toHaveCount(0);
    await disclosure.locator('summary').click();
    const row = (file: string) => list.getByRole('listitem').filter({ hasText: file });
    await expect(row('assets/new.xml')).toContainText('5 bytes');
    await expect(row('assets/update.xml')).toContainText('7 bytes → 11 bytes');
    const catalogPath = row('deployment-volume-0001.dat').locator('code');
    await expect(catalogPath).toBeVisible();
    expect((await catalogPath.boundingBox())?.width ?? 0).toBeGreaterThan(72);
    await expect(row('assets/obsolete.xml')).toContainText('13 bytes');
    await expect(row('runtime/local.xml')).toContainText('Preserved');
    await expect(list.getByRole('listitem')).toHaveCount(50);
    await disclosure.getByRole('button', { name: 'Next files' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(5);
    await expect(row('runtime/preserved-49.xml')).toBeVisible();
    await disclosure.getByRole('button', { name: 'Previous files' }).click();
    await expect(row('assets/obsolete.xml')).toBeVisible();
    await disclosure.getByRole('button', { name: 'Next files' }).click();
    await disclosure.locator('summary').click();
    await expect(list).toHaveCount(0);
    await disclosure.locator('summary').click();
    await expect(row('assets/obsolete.xml')).toBeVisible();
    await disclosure.locator('summary').click();
    await expect(list).toHaveCount(0);
    if (originalViewport) await page.setViewportSize(originalViewport);
    expect(requests).toHaveLength(priorRequests);
  }
  async function readAppliedFileChanges(resultCard: ReturnType<typeof page.getByTestId>) {
    const priorRequests = requests.length;
    const disclosure = resultCard.getByTestId('deploy-file-changes');
    const summary = disclosure.locator('summary');
    const list = disclosure.getByRole('list', { name: 'Files affected by deployment' });
    await expect(summary).toHaveText('Applied file changes · 1 added · 2 replaced · 1 removed · 1 preserved');
    await expect(list).toHaveCount(0);
    await summary.click();
    const row = (file: string) => list.getByRole('listitem').filter({ hasText: file });
    await expect(row('assets/new.xml')).toContainText('5 bytes');
    await expect(row('assets/update.xml')).toContainText('7 bytes → 11 bytes');
    await expect(row('assets/obsolete.xml')).toContainText('13 bytes');
    await expect(row('runtime/retained-at-apply.xml')).toContainText('Preserved');
    await expect(row('runtime/local.xml')).toHaveCount(0);
    await summary.click();
    await expect(list).toHaveCount(0);
    expect(requests).toHaveLength(priorRequests);
  }
  async function previewWizard(checkFileReview = false){
    const previousCalls=requests.length;
    const previousApplies=applyIdentities.length;
    const frozenWorkspace=await page.evaluate(()=>window.AgentRuntime!.getCurrentWorkspace());
    await wizardPreview.click();
    await expect(wizardDestination).toContainText(modeledTargetRoot);
    await expect(card.getByTestId('deploy-review-title')).toHaveText('Preview — not deployed');
    expect(requests.slice(previousCalls)).toEqual([{workspace:frozenWorkspace,dryRun:true}]);
    expect(applyIdentities).toHaveLength(previousApplies);
    await expect(wizardApply).toBeEnabled();
    if (checkFileReview) await reviewFileChanges();
    return {previousCalls,previousApplies,frozenWorkspace};
  }
  async function confirmWizard(review: Awaited<ReturnType<typeof previewWizard>>){
    await wizardApply.click();
    await expect.poll(()=>requests.length).toBe(review.previousCalls+2);
    expect(requests[review.previousCalls+1]).toEqual({
      workspace:review.frozenWorkspace,
      dryRun:false,
      expectedModId:fixture.modId,
      expectedSourceHash:fixture.sourceHash,
      expectedArtifactHash:fixture.artifactHash,
      expectedBindingHash:fixture.bindingHash,
      expectedTargetFingerprint:modeledTargetFingerprint,
    });
    await expect.poll(()=>applyIdentities.length).toBe(review.previousApplies+1);
  }
  async function roundTripWorkspaceSelection(){
    await page.evaluate(()=>{
      const context=window.__X4_WORKSPACE_CONTEXT__!;
      const original=context.getWorkspaceId();
      const alternate=original==='ws_000000000000000000000000'?'ws_111111111111111111111111':'ws_000000000000000000000000';
      context.selectWorkspace(alternate);
      context.selectWorkspace(original);
    });
  }
  async function clickIfStillMounted(target: ReturnType<typeof page.getByTestId>) {
    await target.evaluateAll(elements => {
      const button = elements[0];
      if (button instanceof HTMLElement) button.click();
    });
  }

  const coveragePath = 'md/read_probe.xml';
  const longCoveragePath = 'md/' + 'long_file_name_'.repeat(15) + 'unavailable.xml';
  const coverageGaps = [
    ...Array.from({ length: 41 }, (_, index) => ({
      check: 'md.variable_initial_state', filePath: coveragePath, line: 4 + index, column: 19,
      reason: 'Earlier initialization could not be verified for strict read of $Probe.',
    })),
    { check: 'md.variable_initial_state', filePath: 'md/unavailable.xml', reason: 'MD source content is unavailable.' },
    { check: 'md.variable_initial_state', filePath: longCoveragePath, reason: 'MD source content is unavailable.' },
    { check: 'source.inventory', reason: 'Project discovery was incomplete.' },
  ];
  const incompleteWithCoverage = {
    ...fixtures.incomplete,
    validation: {
      ...fixtures.incomplete.validation,
      review: {
        ...fixtures.incomplete.validation.review,
        counts: { ...fixtures.incomplete.validation.review.counts, unavailableChecks: coverageGaps.length },
      },
      evidence: { coverage: { gaps: coverageGaps } },
    },
  };
  async function reviewCoverage(resultCard: ReturnType<typeof page.getByTestId>) {
    const priorRequests = requests.length;
    const priorApplies = applyIdentities.length;
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 760 });
    const coverage = resultCard.getByTestId('deploy-coverage-details');
    const summary = coverage.locator('summary');
    const files = coverage.getByRole('list', { name: 'Files with coverage gaps' });
    const gaps = coverage.getByRole('list', { name: 'Unavailable validation checks' });
    await expect(coverage.getByRole('list')).toHaveCount(0);
    await summary.press('Space');
    await expect(summary).toHaveText('Coverage gaps (44)');
    await expect(files.getByRole('listitem')).toHaveCount(4);
    expect(await files.evaluate(list => list.scrollWidth)).toBeLessThanOrEqual(await files.evaluate(list => list.clientWidth));
    const projectWide = files.getByRole('button', { name: 'Project-wide (1)', exact: true });
    await expect(projectWide).toBeVisible();
    const readSites = files.getByRole('button', { name: coveragePath + ' (41)', exact: true });
    await readSites.press('Enter');
    await expect(gaps.getByRole('listitem')).toHaveCount(40);
    await expect(gaps.getByText(coveragePath + ':4:19', { exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    const back = coverage.getByRole('button', { name: 'Back to coverage files', exact: true });
    await expect(back).toBeFocused();
    await coverage.getByRole('button', { name: 'Next gaps', exact: true }).click();
    await expect(gaps.getByRole('listitem')).toHaveCount(1);
    await expect(gaps.getByText(coveragePath + ':44:19', { exact: true })).toBeVisible();
    await back.press('Enter');
    await expect(readSites).toBeFocused();
    const unavailable = files.getByRole('button', { name: 'md/unavailable.xml (1)', exact: true });
    await unavailable.press('Space');
    await expect(gaps.getByText('md/unavailable.xml', { exact: true })).toBeVisible();
    await expect(gaps).toContainText('MD source content is unavailable.');
    await summary.press('Space');
    await expect(coverage.getByRole('list')).toHaveCount(0);
    if (originalViewport) await page.setViewportSize(originalViewport);
    expect(requests).toHaveLength(priorRequests);
    expect(applyIdentities).toHaveLength(priorApplies);
  }
  expect(requests).toHaveLength(0);
  await confirmWizard(await previewWizard(true));
  await expect(card.getByTestId('deploy-review-title')).toHaveText('Deployed — accepted findings');
  await readAppliedFileChanges(card);
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
  const retriedPreview=previewWizard();
  await expect(card.getByTestId('deploy-review-summary')).toHaveCount(0);
  await confirmWizard(await retriedPreview);
  await expect(card.getByTestId('deploy-review-title')).toHaveText('Deployed — outstanding findings');
  await expect(card).toContainText('Outstanding: 0 errors, 1 warnings. Accepted: 0 errors, 1 warnings.');
  delay=0;
  await page.screenshot({path:path.join(evidence,'wizard-mixed.png'),fullPage:true});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByTestId('beginner-open-deploy').click();
  await expect(page.getByTestId('wizard-preflight-card')).toHaveCount(0);
  await expect(wizardDestination).toHaveCount(0);
  await expect(wizardApply).toHaveCount(0);
  const staleReview=await previewWizard();
  await roundTripWorkspaceSelection();
  await clickIfStillMounted(wizardApply);
  await expect(wizardApply).toHaveCount(0);
  expect(requests).toHaveLength(staleReview.previousCalls+1);
  expect(applyIdentities).toHaveLength(staleReview.previousApplies);
  await wizardPreview.locator('..').getByRole('button',{name:/^(Cancel|Close)$/}).click();
  await page.getByTestId('beginner-open-deploy').click();
  holdNextPreview=true;
  const beforeCancelledPreview=requests.length;
  const appliesBeforeCancellation=applyIdentities.length;
  const cancelledResponse=page.waitForResponse(response=>
    new URL(response.url()).pathname==='/api/agent/deploy-verify'
      && response.request().postDataJSON().dryRun===true);
  await wizardPreview.click();
  await expect.poll(()=>Boolean(releaseHeldPreview)).toBe(true);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByTestId('beginner-open-deploy').click();
  await expect(card).toHaveCount(0);
  releaseHeldPreview!();
  await (await cancelledResponse).finished();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(card).toHaveCount(0);
  await expect(wizardDestination).toHaveCount(0);
  await expect(wizardApply).toHaveCount(0);
  expect(requests).toHaveLength(beforeCancelledPreview+1);
  expect(applyIdentities).toHaveLength(appliesBeforeCancellation);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByTestId('beginner-open-deploy').click();
  releaseHeldPreview=undefined;
  holdNextPreview=true;
  const beforeLatePreview=requests.length;
  const lateResponse=page.waitForResponse(response=>
    new URL(response.url()).pathname==='/api/agent/deploy-verify'
      && response.request().postDataJSON().dryRun===true);
  await wizardPreview.click();
  await expect.poll(()=>Boolean(releaseHeldPreview)).toBe(true);
  await roundTripWorkspaceSelection();
  releaseHeldPreview!();
  await (await lateResponse).finished();
  await expect(wizardPreview).toBeEnabled();
  await expect(wizardDestination).toHaveCount(0);
  await expect(wizardApply).toHaveCount(0);
  expect(requests).toHaveLength(beforeLatePreview+1);
  expect(applyIdentities).toHaveLength(appliesBeforeCancellation);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  fixture = incompleteWithCoverage;
  await page.getByTestId('beginner-open-deploy').click();
  await previewWizard();
  await reviewCoverage(card);
  await expect(wizardApply).toBeEnabled();
  await wizardPreview.locator('..').getByRole('button', { name: /^(Cancel|Close)$/ }).click();
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
  async function confirmPlaytest(checkFileReview = false, checkCoverage = false) {
    const previousCalls = requests.length;
    const source = { path: 'forge_regression_lab', root: 'workspace' };
    await previewButton.click();
    await expect(destination).toContainText(modeledTargetRoot);
    await expect(playtestTitle).toHaveText('Preview — not deployed');
    expect(requests.slice(previousCalls)).toEqual([{ ...source, dryRun: true }]);
    if (checkFileReview) await reviewFileChanges();
    if (checkCoverage) await reviewCoverage(playtestResult);
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
    fixture = name === 'incomplete' ? incompleteWithCoverage : fixtures[name];
    await confirmPlaytest(name === 'clean', name === 'incomplete');
    await expect(playtestTitle).toHaveText(title);
    await expect(playtestResult.getByTestId('deploy-review-summary')).toHaveAttribute('data-tone',tone);
    await expect(playtestResult).toContainText('does not verify behavior in X4');
    if (name === 'clean') await readAppliedFileChanges(playtestResult);
  }
  await page.screenshot({path:path.join(evidence,'playtest-incomplete.png'),fullPage:true});
  fixture={...fixtures.clean,bytesConfirmed:undefined};await confirmPlaytest();
  await expect(playtestTitle).toContainText('bytes unconfirmed');
  await expect(playtestResult.getByTestId('deploy-file-changes')).toHaveCount(0);
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
  await clickIfStillMounted(applyButton);
  await expect(applyButton).toHaveCount(0);
  expect(requests).toHaveLength(beforeSelectionChange + 1);
  expect(applyIdentities).toHaveLength(7);
  } finally {
    releaseHeldPreview?.();
  }
});
