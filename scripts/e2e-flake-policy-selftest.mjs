#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runE2e, createProtectedE2eSpawner, validateE2eVerdictReceipt } from './run-e2e.mjs';
import { bootstrapE2eRuntime, createE2eRunStateOwner } from './e2e-runtime-bootstrap.mjs';
import { createE2eProcessHandleLeaseFamily } from './e2e-runner-lifecycle.mjs';

const root = process.cwd();
const runtime = bootstrapE2eRuntime({
  scriptPath: fileURLToPath(import.meta.url), args: process.argv.slice(2), cwd: root,
  env: process.env, receiptMutationPolicy: 'preserve',
});
if (runtime.action !== 'run') process.exit(runtime.exitCode ?? 1);
const policyEnvironment = runtime.environment ?? process.env;
const runStates = [];
const evidenceDir = path.join(root, 'test-results');
const discoveryReceipt = path.join(evidenceDir, 'e2e-flake-policy-discovery.json');
const matchingReceipt = path.join(evidenceDir, 'e2e-flake-policy-matching.json');
const summaryPath = path.join(evidenceDir, 'e2e-flake-policy-selftest.json');
const fixtureArgs = ['--config=tests/fixtures/e2e-flake-policy/playwright.config.ts'];
const emptyManifest = { version: 1, entries: [] };

function addUtcDays(isoDay, days) {
  const date = new Date(`${isoDay}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

async function runOwnedPolicyFixture(manifest, receiptPath) {
  let stateOwner;
  let family = null;
  let inspection;
  try {
    stateOwner = createE2eRunStateOwner({ env: policyEnvironment });
    if (process.platform === 'win32') {
      family = createE2eProcessHandleLeaseFamily({ env: stateOwner.environment, cwd: root,
        preloadPath: path.join(root, 'scripts', 'run-e2e.mjs'), runtimePath: process.execPath });
    }
    return await runE2e({ args: fixtureArgs, manifest, receiptPath, env: stateOwner.environment,
      ...(family ? { spawnImpl: createProtectedE2eSpawner(family), inspectProcessLeases() {
        inspection = family.inspect();
        return inspection;
      } } : {}),
      finalizeRunState: () => stateOwner.retire(),
    });
  } finally {
    if (stateOwner) {
      stateOwner.retire();
      runStates.push(Object.freeze({ stateDir: stateOwner.stateDir, runId: stateOwner.runId,
        retired: true, familyComplete: family === null ? null : inspection?.complete === true }));
    }
  }
}

function policyReceiptHealthy(receipt) {
  return validateE2eVerdictReceipt(receipt)
    && receipt.runnerInteractionFailed === false
    && receipt.source === 'json-report' && receipt.reportCode === 'structured-report-inspected'
    && receipt.policy.errors.length === 0
    && receipt.reportInspection.complete === true && receipt.reportInspection.errors.length === 0
    && receipt.lifecycle.complete === true && receipt.lifecycle.errors.length === 0
    && receipt.lifecycle.ownershipComplete === true
    && receipt.lifecycle.termination?.complete === true && receipt.lifecycle.termination.treeGone === true
    && receipt.lifecycle.termination.errors.length === 0 && receipt.lifecycle.termination.remainingPids.length === 0;
}

const discoveryExit = await runOwnedPolicyFixture(emptyManifest, discoveryReceipt);
const discovery = readJson(discoveryReceipt);
const testId = discovery.verdict?.issues?.[0]?.testId || '';
const today = new Date().toISOString().slice(0, 10);
const matchingManifest = {
  version: 1,
  entries: [{
    testId,
    owner: '@quality',
    reason: 'Deliberate retry-flake policy fixture',
    issue: 'B110-R20',
    createdOn: today,
    expiresOn: addUtcDays(today, 7),
  }],
};
const matchingExit = await runOwnedPolicyFixture(matchingManifest, matchingReceipt);
const matching = readJson(matchingReceipt);

function rejectsActualReceiptMutations(mutate, expectedSchemaValidity) {
  return [discovery, matching].every(actual => {
    if (!policyReceiptHealthy(actual)) return false;
    const changed = structuredClone(actual);
    mutate(changed);
    return validateE2eVerdictReceipt(changed) === expectedSchemaValidity && !policyReceiptHealthy(changed);
  });
}

const checks = [
  ['discovery_wrapper_returns_red', discoveryExit === 1],
  ['discovery_is_one_flaky_test', discovery.verdict?.flaky === 1 && discovery.verdict?.totalTests === 1],
  ['stable_test_id_discovered', /^[a-zA-Z0-9_-]{8,128}$/.test(testId)],
  ['matching_policy_is_valid', matching.policy?.errors?.length === 0],
  ['matching_wrapper_returns_red', matchingExit === 1],
  ['matching_is_one_flaky_test', matching.verdict?.flaky === 1 && matching.verdict?.totalTests === 1],
  ['matching_quarantine_is_reported', matching.verdict?.quarantinedIssues === 1 && matching.verdict?.issues?.[0]?.quarantine?.owner === '@quality'],
  ['quarantine_cannot_hide_failure', matching.verdict?.green === false],
  ['discovery_receipt_and_owner_are_healthy', policyReceiptHealthy(discovery)],
  ['matching_receipt_and_owner_are_healthy', policyReceiptHealthy(matching)],
  ['expected_red_rejects_inspection_or_retirement_failure', rejectsActualReceiptMutations(receipt => {
    receipt.runnerInteractionFailed = true;
  }, true)],
  ['expected_red_rejects_incomplete_ownership', rejectsActualReceiptMutations(receipt => {
    receipt.lifecycle.complete = false;
    receipt.lifecycle.ownershipComplete = false;
    receipt.lifecycle.errors = ['e2e-lifecycle-ownership-incomplete'];
  }, true)],
  ['expected_red_rejects_malformed_receipt', rejectsActualReceiptMutations(receipt => {
    receipt.schemaVersion = 0;
  }, false)],
];
const passed = checks.filter(([, pass]) => pass).length;
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  passed,
  total: checks.length,
  checks: checks.map(([name, pass]) => ({ name, pass })),
  testId,
  discoveryExit,
  matchingExit,
  matchingVerdict: matching.verdict,
  runStates,
};
writeJsonAtomic(summaryPath, summary);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`[e2e-flake-policy selftest] ${passed}/${checks.length} ${passed === checks.length ? 'PASS' : 'FAIL'}`);
console.log(`[e2e-flake-policy selftest] ${summaryPath}`);
process.exit(passed === checks.length ? 0 : 1);
