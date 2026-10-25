import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deployReviewView, deployValidationLabel, type DeployReviewData } from '../src/lib/deployClient';

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
console.log(JSON.stringify({pass:true,total:checks.length,checks}));
