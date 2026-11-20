import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DeployValidationSummary from '../src/components/DeployValidationSummary';
import { deployReviewView, deployValidationLabel, prepareDeployReview, type DeployReviewData } from '../src/lib/deployClient';
import { parseCatManifest } from '../src/lib/x4CatDat';
import { readX4MenuLuaPaths } from '../src/lib/x4UiSourceBundle';

const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/forge-regression/deploy-responses.json','utf8'));
const checks:string[]=[];
function check(name:string,fn:()=>void){fn();checks.push(name);}
check('actual-clean-green',()=>{const v=deployReviewView(fixtures.clean);assert.equal(v.tone,'clean');assert.equal(v.clean,true);assert.equal(v.confirmed,true);});
check('actual-warning-amber',()=>{const v=deployReviewView(fixtures.warnings);assert.equal(v.tone,'qualified');assert.equal(v.counts!.unacceptedWarnings,1);assert.match(v.title,/outstanding findings/);});
check('actual-accepted-still-qualified',()=>{const v=deployReviewView(fixtures.accepted);assert.equal(v.clean,false);assert.equal(v.counts!.acceptedWarnings,1);assert.match(v.title,/accepted findings/);assert.match(v.countText,/Accepted: 0 errors, 1 warnings/);});
check('new-warning-stands-out',()=>{const v=deployReviewView(fixtures.mixed);assert.equal(v.counts!.acceptedWarnings,1);assert.equal(v.counts!.unacceptedWarnings,1);assert.match(v.title,/outstanding findings/);});
check('actual-incomplete-qualified',()=>{const v=deployReviewView(fixtures.incomplete);assert.equal(v.tone,'qualified');assert.ok(v.counts!.unavailableChecks>0);assert.match(v.title,/incomplete checks/);});
check('preview-is-not-deployment',()=>{const v=deployReviewView(fixtures.proposed);assert.equal(v.confirmed,false);assert.equal(v.preview,true);assert.match(v.title,/not deployed/);assert.match(v.countText,/Proposed acceptance/);});
check('missing-bytes-not-verified',()=>{const v=deployReviewView({...fixtures.clean,bytesConfirmed:undefined});assert.equal(v.tone,'qualified');assert.match(v.title,/bytes unconfirmed/);});
check('failed-cannot-be-green',()=>{const v=deployReviewView({...fixtures.clean,ok:false});assert.equal(v.tone,'error');assert.equal(v.confirmed,false);});
check('missing-validation-not-clean',()=>{const v=deployReviewView({...fixtures.clean,validation:undefined});assert.equal(v.clean,false);assert.equal(v.counts,null);assert.match(v.validationText,/unavailable/);});
check('missing-counts-not-zero',()=>{const p=structuredClone(fixtures.clean);delete p.validation.review.counts;const v=deployReviewView(p);assert.equal(v.clean,false);assert.equal(v.counts,null);assert.match(v.countText,/unavailable/);});
check('contradictory-clean-counts-not-green',()=>{const p=structuredClone(fixtures.clean);p.validation.review.counts.unacceptedWarnings=1;assert.equal(deployReviewView(p).clean,false);});
for(const invalid of [-1,0.5,NaN,Infinity,'0',null])check('invalid-count-'+String(invalid),()=>{const p=structuredClone(fixtures.clean);p.validation.review.counts.unacceptedWarnings=invalid;assert.equal(deployReviewView(p).counts,null);assert.equal(deployReviewView(p).clean,false);});
check('proposed-approval-not-recorded',()=>{const p=structuredClone(fixtures.accepted);p.validation.review.status='proposed';assert.match(deployReviewView(p).title,/approvals unconfirmed/);assert.match(deployReviewView(p).countText,/Proposed/);});
check('unknown-approval-status-not-recorded',()=>{const p=structuredClone(fixtures.accepted);delete p.validation.review.status;assert.match(deployReviewView(p).title,/approvals unconfirmed/);assert.match(deployReviewView(p).countText,/Acceptance reported/);});
check('readable-shared-labels',()=>{for(const p of Object.values(fixtures) as DeployReviewData[]){const s=deployValidationLabel(p);assert.ok(!s.includes('accepted-findings'));assert.ok(!s.includes('incomplete-checks'));}});
check('lua-registration-notice-shows-paths-and-qualified-restart', () => {
  const html = renderToStaticMarkup(createElement(DeployValidationSummary, { result: {
    ...fixtures.clean, effect: { luaRegistration: {
      status: 'added', addedCount: 2, addedPaths: ['ui/late.lua'], restartMayBeRequired: true,
    } },
  } }));
  assert.match(html, /may require a full X4 restart/);
  assert.match(html, /ui\/late\.lua/);
  assert.match(html, /Plus 1 more\./);
});
check('unavailable-registration-comparison-stays-neutral', () => {
  const html = renderToStaticMarkup(createElement(DeployValidationSummary, { result: {
    ...fixtures.proposed, effect: { luaRegistration: { status: 'unavailable', detail: 'Comparison unavailable.' } },
  } }));
  assert.match(html, /Comparison unavailable\./);
  assert.doesNotMatch(html, /may require a full X4 restart/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(DeployValidationSummary, { result: fixtures.clean })), /deploy-lua-registration-notice/);
});
check('registration-comparison-distinguishes-empty-and-invalid', () => {
  const menu = (children: string, environment = 'menus') =>
    `<addon name="qa"><environment type="${environment}">${children}</environment></addon>`;
  assert.deepEqual([...readX4MenuLuaPaths(menu('<dependency name="helper"/><savedvariable name="state" storage="savegame"/>'), true)!], []);
  assert.deepEqual([...readX4MenuLuaPaths(menu('<file name="ui/late.lua"/>'), true)!], ['ui/late.lua']);
  assert.equal(readX4MenuLuaPaths(menu('<file name="../bad.lua"/>'), true), null);
  assert.equal(readX4MenuLuaPaths(menu('<file name="ui/late.lua"/>', 'savegame'), true), null);
  assert.equal(readX4MenuLuaPaths(menu('<dependency name="helper"><file name="ui/nested.lua"/></dependency>'), true), null);
});
check('strict-catalog-comparison-refuses-unparseable-index-rows', () => {
  const index = `ui.xml 12 0 ${'a'.repeat(32)}\ncorrupt row\n`;
  assert.equal(parseCatManifest(index).length, 1);
  assert.throws(() => parseCatManifest(index, { strict: true }), /malformed entry/);
  for (const name of ['../ui.xml', './ui.xml', '/ui.xml', 'C:ui.xml']) {
    assert.throws(() => parseCatManifest(`${name} 12 0 ${'a'.repeat(32)}`, { strict: true }), /unsafe entry path/);
  }
});
check('review-freezes-serialized-body-and-destination', () => {
  const request = { workspace: { name: 'Reviewed workspace', description: 'Exact draft' },
    allowStaleOverwrite: true, allowErrors: ['reviewed-error'], allowWarnings: ['reviewed-warning'], dryRun: true };
  const preview = { dryRun: true, targetRoot: 'C:/owned-scratch/game/extensions/reviewed', modId: 'reviewed',
    sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), bindingHash: 'c'.repeat(64), targetFingerprint: 'd'.repeat(64) };
  const body = JSON.stringify(request);
  const review = prepareDeployReview(body, preview);
  const expected = { ...JSON.parse(body), dryRun: false, expectedModId: 'reviewed', expectedSourceHash: 'a'.repeat(64),
    expectedArtifactHash: 'b'.repeat(64), expectedBindingHash: 'c'.repeat(64), expectedTargetFingerprint: 'd'.repeat(64) };
  assert.equal(review.destination, preview.targetRoot);
  assert.equal(review.applyBody, JSON.stringify(expected));
  assert.deepEqual(JSON.parse(review.applyBody), expected);
  request.workspace.description = 'Later unreviewed draft';
  request.allowErrors.push('later-error');
  preview.targetRoot = 'C:/different-destination';
  preview.bindingHash = 'e'.repeat(64);
  assert.equal(review.destination, 'C:/owned-scratch/game/extensions/reviewed');
  assert.equal(review.applyBody, JSON.stringify(expected));
});
check('review-refuses-invalid-preview-or-destination', () => {
  const preview = { dryRun: true, targetRoot: 'C:/owned-scratch/game/extensions/reviewed', modId: 'reviewed',
    sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), bindingHash: 'c'.repeat(64), targetFingerprint: 'absent' };
  for (const dryRun of [undefined, false, 'true', 1]) {
    assert.throws(() => prepareDeployReview('{}', { ...preview, dryRun }), /exact X4 install destination/);
  }
  for (const targetRoot of [undefined, null, '', ' \t ', 42]) {
    assert.throws(() => prepareDeployReview('{}', { ...preview, targetRoot }), /exact X4 install destination/);
  }
  assert.equal(JSON.parse(prepareDeployReview('{}', preview).applyBody).expectedTargetFingerprint, 'absent');
});
check('review-refuses-missing-or-invalid-binding-identities', () => {
  const preview = { dryRun: true, targetRoot: 'C:/owned-scratch/game/extensions/reviewed', modId: 'reviewed',
    sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), bindingHash: 'c'.repeat(64), targetFingerprint: 'd'.repeat(64) };
  for (const key of ['modId', 'sourceHash', 'artifactHash', 'bindingHash', 'targetFingerprint']) {
    for (const value of [undefined, '', 7]) {
      assert.throws(() => prepareDeployReview('{}', { ...preview, [key]: value }), /deploy identity/);
    }
  }
  for (const key of ['sourceHash', 'artifactHash', 'bindingHash', 'targetFingerprint']) {
    for (const value of ['a'.repeat(63), 'g'.repeat(64)]) {
      assert.throws(() => prepareDeployReview('{}', { ...preview, [key]: value }), /deploy identity/);
    }
  }
  assert.throws(() => prepareDeployReview('{broken', preview), SyntaxError);
});
check('failed-response-with-committed-receipt-stays-qualified', () => {
  const result: DeployReviewData = { ...fixtures.clean, ok: false,
    deployRecord: { id: 'receipt-committed-before-response-failure', status: 'committed' } };
  const view = deployReviewView(result);
  assert.equal(view.title, 'Deployment committed — verify receipt');
  assert.equal(view.tone, 'qualified');
  assert.equal(view.confirmed, false);
  assert.equal(view.preview, false);
  const html = renderToStaticMarkup(createElement(DeployValidationSummary, { result }));
  assert.match(html, /Deployment committed — verify receipt/);
  assert.doesNotMatch(html, /Deployment failed/);
  assert.equal(deployReviewView({ ...result, deployRecord: { status: 'prepared' } }).tone, 'error');
  const preview = deployReviewView({ ...result, dryRun: true });
  assert.equal(preview.title, 'Preview — not deployed');
  assert.equal(preview.confirmed, false);
});
console.log(JSON.stringify({pass:true,total:checks.length,checks}));
