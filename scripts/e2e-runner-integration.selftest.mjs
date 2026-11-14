import assert from 'node:assert/strict';
import { ChildProcess, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { activeE2eProcessHandleRole, createProtectedE2eSpawner, runE2e, validateE2eVerdictReceipt } from './run-e2e.mjs';
import { createE2eProcessHandleLeaseFamily, E2E_PROCESS_HANDLE_ACTOR_ENV, superviseSpawnedE2eProcess } from './e2e-runner-lifecycle.mjs';
import { initializeSpawnedProcessOwnership } from './e2e-process-ownership-sampler.mjs';
import { createE2eRunStateOwner, readE2eRunState } from './e2e-runtime-bootstrap.mjs';

const CASE_PREFIX = 'x4-e2e-runner-integration-';
const WATCHDOG_MS = 1000;
const RUNNER_ARGS = ['--project=chromium'];
const MANIFEST = { version: 1, entries: [] };
const PRODUCTION_INPUT_KEYS = [
  'child',
  'rootPid',
  'snapshotOptions',
  'commandOptions',
  'probeTerminalReport',
];
const LIFECYCLE_RESULT_KEYS = [
  'complete',
  'errors',
  'trigger',
  'childExit',
  'ownershipComplete',
  'rootIdentity',
  'captured',
  'reusedPids',
  'termination',
];
const TERMINATION_RESULT_KEYS = [
  'complete',
  'errors',
  'treeGone',
  'passes',
  'captured',
  'commanded',
  'reusedPids',
];
const RECEIPT_LIFECYCLE_KEYS = [
  'complete',
  'errors',
  'trigger',
  'childExit',
  'ownershipComplete',
  'rootPid',
  'capturedPids',
  'reusedPids',
  'termination',
];
const RECEIPT_TERMINATION_KEYS = [
  'complete',
  'errors',
  'treeGone',
  'passes',
  'capturedPids',
  'commandedPids',
  'reusedPids',
  'remainingPids',
];

const watchdogState = {
  armed: 0,
  cleared: 0,
  fired: 0,
};

function assertExactRecordKeys(value, keys) {
  assert.deepEqual(Object.keys(value), keys);
  assert.deepEqual(Object.getOwnPropertyNames(value), keys);
  assert.deepEqual(Object.getOwnPropertySymbols(value), []);
}

function makeIdentity(pid, creationToken) {
  return { pid, creationToken };
}

function cloneIdentity(identity) {
  return makeIdentity(identity.pid, identity.creationToken);
}

function makeStrictGreenReport() {
  const report = {
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    errors: [],
    suites: [{
      title: 'runner integration',
      file: 'e2e-runner-integration.spec.mjs',
      specs: [{
        title: 'strict green terminal report',
        id: 'runner-integration-green-01',
        file: 'e2e-runner-integration.spec.mjs',
        tests: [{
          projectName: 'chromium',
          status: 'expected',
          results: [{ status: 'passed' }],
        }],
      }],
    }],
  };
  assertExactRecordKeys(report, ['stats', 'errors', 'suites']);
  assertExactRecordKeys(report.stats, ['expected', 'unexpected', 'flaky', 'skipped']);
  return report;
}

function makeStructurallyIncompleteReport() {
  const report = {
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    errors: [],
    suites: [{
      title: 'runner integration',
      file: 'e2e-runner-integration.spec.mjs',
      specs: [{
        title: 'incomplete terminal report',
        id: 'runner-integration-incomplete-01',
        file: 'e2e-runner-integration.spec.mjs',
        tests: [{
          projectName: 'chromium',
          status: 'expected',
          results: [],
        }],
      }],
    }],
  };
  assertExactRecordKeys(report, ['stats', 'errors', 'suites']);
  assertExactRecordKeys(report.stats, ['expected', 'unexpected', 'flaky', 'skipped']);
  return report;
}

function makeCompleteLifecycle({ rootPid, trigger, childExit, capturedPids, tokenPrefix }) {
  const captured = capturedPids.map((pid, index) => (
    makeIdentity(pid, `${tokenPrefix}-captured-${index}`)
  ));
  const rootIdentity = cloneIdentity(captured[0]);
  const termination = {
    complete: true,
    errors: [],
    treeGone: true,
    passes: 1,
    captured: captured.map(cloneIdentity),
    commanded: captured.map(cloneIdentity),
    reusedPids: [],
  };
  const lifecycle = {
    complete: true,
    errors: [],
    trigger,
    childExit,
    ownershipComplete: true,
    rootIdentity,
    captured: captured.map(cloneIdentity),
    reusedPids: [],
    termination,
  };
  assert.equal(rootIdentity.pid, rootPid);
  assertExactRecordKeys(lifecycle, LIFECYCLE_RESULT_KEYS);
  assertExactRecordKeys(termination, TERMINATION_RESULT_KEYS);
  for (const identity of [rootIdentity, ...captured, ...termination.captured, ...termination.commanded]) {
    assert.equal(typeof identity.creationToken, 'string');
    assert.ok(identity.creationToken.length > 0);
  }
  return lifecycle;
}

function makeMalformedLifecycle({ rootPid, tokenPrefix }) {
  const identity = makeIdentity(rootPid, `${tokenPrefix}-malformed-token`);
  const termination = {
    complete: true,
    errors: [],
    treeGone: true,
    passes: 1,
    captured: [cloneIdentity(identity)],
    commanded: [cloneIdentity(identity)],
    reusedPids: [],
  };
  const lifecycle = {
    complete: 'raw-malformed-complete',
    errors: ['raw-malformed-secret'],
    trigger: 'raw-malformed-trigger',
    childExit: { code: 0, signal: null },
    ownershipComplete: true,
    rootIdentity: identity,
    captured: [cloneIdentity(identity)],
    reusedPids: [],
    termination,
  };
  assertExactRecordKeys(lifecycle, LIFECYCLE_RESULT_KEYS);
  assertExactRecordKeys(termination, TERMINATION_RESULT_KEYS);
  return lifecycle;
}

function makeFailedTerminationLifecycle({ rootPid, capturedPids, tokenPrefix }) {
  const captured = capturedPids.map((pid, index) => (
    makeIdentity(pid, `${tokenPrefix}-failed-captured-${index}`)
  ));
  const identity = cloneIdentity(captured[0]);
  const termination = {
    complete: false,
    errors: ['termination-executor-pass-limit'],
    treeGone: false,
    passes: 100,
    captured: captured.map(cloneIdentity),
    commanded: captured.map(cloneIdentity),
    reusedPids: [],
  };
  const lifecycle = {
    complete: false,
    errors: ['e2e-lifecycle-termination-failed'],
    trigger: 'child-close',
    childExit: { code: 0, signal: null },
    ownershipComplete: true,
    rootIdentity: identity,
    captured: captured.map(cloneIdentity),
    reusedPids: [],
    termination,
  };
  assertExactRecordKeys(lifecycle, LIFECYCLE_RESULT_KEYS);
  assertExactRecordKeys(termination, TERMINATION_RESULT_KEYS);
  return lifecycle;
}

function makeUnavailableLifecycleProjection() {
  const projection = {
    complete: false,
    errors: ['lifecycle-result-invalid'],
    trigger: null,
    childExit: null,
    ownershipComplete: false,
    rootPid: null,
    capturedPids: [],
    reusedPids: [],
    termination: null,
  };
  assertExactRecordKeys(projection, RECEIPT_LIFECYCLE_KEYS);
  return projection;
}

function makeFakeChild(pid, interactionFailure) {
  const child = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  Object.defineProperties(child, {
    pid: {
      value: pid,
      writable: false,
      enumerable: true,
      configurable: false,
    },
    stdout: {
      value: stdout,
      writable: false,
      enumerable: true,
      configurable: false,
    },
    stderr: {
      value: stderr,
      writable: false,
      enumerable: true,
      configurable: false,
    },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(child, 'pid'), true);
  assert.equal(Number.isSafeInteger(child.pid) && child.pid > 0, true);
  assert.equal(child.stdout instanceof PassThrough, true);
  assert.equal(child.stderr instanceof PassThrough, true);
  if (interactionFailure) {
    const originalOn = child.stderr.on.bind(child.stderr);
    child.stderr.on = (eventName, listener) => {
      if (eventName === 'data') throw new Error('stderr-secret');
      return originalOn(eventName, listener);
    };
  }
  return child;
}

async function withWatchdog(name, operation) {
  let watchdogHandle;
  watchdogState.armed += 1;
  try {
    const watchdog = new Promise((_, reject) => {
      watchdogHandle = globalThis.setTimeout(() => {
        watchdogState.fired += 1;
        reject(new Error(`${name} watchdog expired`));
      }, WATCHDOG_MS);
    });
    return await Promise.race([
      Promise.resolve().then(operation),
      watchdog,
    ]);
  } finally {
    if (watchdogHandle !== undefined) {
      globalThis.clearTimeout(watchdogHandle);
      watchdogState.cleared += 1;
    }
  }
}

function makeCaseHarness(spec, caseNumber, receiptPath) {
  const rootPid = 7400 + caseNumber * 10;
  const capturedPids = [rootPid, rootPid + 1];
  const tokenPrefix = `runner-integration-case-${caseNumber}`;
  const report = spec.reportFactory();
  const lifecycle = spec.lifecycleFactory({ rootPid, capturedPids, tokenPrefix });
  const state = {
    spawnCalls: 0,
    superviseCalls: 0,
    probeCalls: 0,
    child: null,
    errorListenerBaseline: null,
    reportPath: null,
    spawnCommand: null,
    spawnArgs: null,
    spawnOptions: null,
    productionProcessCalls: 0,
    lifecycle,
    rootPid,
    capturedPids,
    tokenValues: [
      ...lifecycle.captured.map(identity => identity.creationToken),
      ...lifecycle.termination?.captured.map(identity => identity.creationToken) || [],
      ...lifecycle.termination?.commanded.map(identity => identity.creationToken) || [],
      lifecycle.rootIdentity?.creationToken,
    ].filter(value => typeof value === 'string'),
  };

  const expectedCli = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
  const spawnImpl = (command, args, options) => {
    state.spawnCalls += 1;
    assert.equal(state.spawnCalls, 1);
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [
      expectedCli,
      'test',
      '--retries=1',
      '--fail-on-flaky-tests',
      '--reporter=list,json',
      ...RUNNER_ARGS,
    ]);
    assert.deepEqual(options.shell, false);
    assert.deepEqual(options.stdio, ['inherit', 'pipe', 'pipe']);
    assert.deepEqual(options.env, {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: options.env.PLAYWRIGHT_JSON_OUTPUT_NAME,
    });
    assert.equal(typeof options.env.PLAYWRIGHT_JSON_OUTPUT_NAME, 'string');
    assert.equal(path.dirname(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME), os.tmpdir());
    assert.equal(path.extname(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME), '.json');
    assert.equal(fs.existsSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME), false);
    state.spawnCommand = command;
    state.spawnArgs = [...args];
    state.spawnOptions = options;
    state.reportPath = options.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
    state.child = makeFakeChild(rootPid, spec.interactionFailure === true);
    state.errorListenerBaseline = state.child.listenerCount('error');
    return state.child;
  };

  const superviseImpl = async (input) => {
    state.superviseCalls += 1;
    assert.equal(state.superviseCalls, 1);
    assertExactRecordKeys(input, PRODUCTION_INPUT_KEYS);
    assert.strictEqual(input.child, state.child);
    assert.equal(input.rootPid, rootPid);
    assert.deepEqual(input.snapshotOptions, process.platform === 'win32' ? { timeoutMs: 10000 } : {});
    assert.deepEqual(input.commandOptions, {});
    assert.equal(typeof input.probeTerminalReport, 'function');
    assert.equal(state.productionProcessCalls, 0);
    assert.equal(fs.existsSync(state.reportPath), false);
    assert.equal(input.probeTerminalReport(), false);
    state.probeCalls += 1;

    if (spec.stdout !== undefined) {
      state.child.stdout.write(spec.stdout);
    }
    if (spec.emitChildError === true) {
      assert.equal(state.child.listenerCount('error'), state.errorListenerBaseline + 1);
      state.child.emit('error', new Error('child-secret'));
      assert.equal(state.child.listenerCount('error'), state.errorListenerBaseline + 1);
    }

    fs.writeFileSync(state.reportPath, `${JSON.stringify(report)}\n`, 'utf8');
    assert.equal(fs.existsSync(state.reportPath), true);
    assert.equal(input.probeTerminalReport(), spec.probeAfterWrite);
    state.probeCalls += 1;
    return lifecycle;
  };

  return {
    state,
    spawnImpl,
    superviseImpl,
    receiptPath,
    report,
    lifecycle,
  };
}

function assertNoLifecycleTokenOrSecretLeak(receiptText, tokenValues, extraSecrets = []) {
  assert.equal(receiptText.includes('creationToken'), false);
  for (const token of tokenValues) assert.equal(receiptText.includes(token), false);
  for (const secret of extraSecrets) assert.equal(receiptText.includes(secret), false);
}

function assertReceiptLifecycleShape(receipt) {
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(validateE2eVerdictReceipt(receipt), true);
  assertExactRecordKeys(receipt.lifecycle, RECEIPT_LIFECYCLE_KEYS);
  if (receipt.lifecycle.termination !== null) {
    assertExactRecordKeys(receipt.lifecycle.termination, RECEIPT_TERMINATION_KEYS);
  }
}

function cleanupCaseDirectory(caseRoot) {
  const target = path.resolve(caseRoot);
  const tempRoot = path.resolve(os.tmpdir());
  assert.equal(path.dirname(target), tempRoot);
  assert.equal(path.basename(target).startsWith(CASE_PREFIX), true);
  assert.equal(fs.lstatSync(target).isDirectory(), true);
  fs.rmSync(target, { recursive: true, force: false });
  assert.equal(fs.existsSync(target), false);
}

function corruptReceiptWriter(mode) {
  return (receiptPath, receipt) => {
    if (mode === 'malformed-json') {
      fs.writeFileSync(receiptPath, '{"schemaVersion":2,', 'utf8');
      return;
    }
    const corrupted = JSON.parse(JSON.stringify(receipt));
    if (mode === 'extra-key') corrupted.unexpected = true;
    if (mode === 'content-mismatch') corrupted.generatedAt = '2026-08-04T00:00:00.000Z';
    fs.writeFileSync(receiptPath, `${JSON.stringify(corrupted, null, 2)}\n`, 'utf8');
  };
}

async function runCase(spec, caseNumber) {
  let caseRoot;
  try {
    caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), CASE_PREFIX));
    assert.equal(path.dirname(path.resolve(caseRoot)), path.resolve(os.tmpdir()));
    assert.equal(path.basename(caseRoot).startsWith(CASE_PREFIX), true);
    const receiptPath = path.join(caseRoot, 'receipt.json');
    const harness = makeCaseHarness(spec, caseNumber, receiptPath);
    const runOptions = typeof spec.runOptions === 'function' ? spec.runOptions(harness) : {};

    const exitCode = await withWatchdog(spec.name, () => runE2e({
      args: RUNNER_ARGS,
      manifest: MANIFEST,
      receiptPath,
      spawnImpl: harness.spawnImpl,
      superviseImpl: harness.superviseImpl,
      ...runOptions,
    }));

    assert.equal(harness.state.spawnCalls, 1);
    assert.equal(harness.state.superviseCalls, 1);
    assert.equal(harness.state.probeCalls, 2);
    assert.equal(harness.state.productionProcessCalls, 0);
    assert.equal(harness.state.child.listenerCount('error'), harness.state.errorListenerBaseline);
    assert.equal(fs.existsSync(harness.state.reportPath), false);
    if (spec.expectReceiptMissing === true) {
      assert.equal(fs.existsSync(receiptPath), false);
      assert.deepEqual(fs.readdirSync(caseRoot), []);
      assert.equal(exitCode, 1);
      spec.assertResult({ exitCode, receipt: null, receiptText: '', harness });
      return;
    }
    assert.deepEqual(fs.readdirSync(caseRoot), ['receipt.json']);
    assert.equal(fs.existsSync(receiptPath), true);
    const receiptText = fs.readFileSync(receiptPath, 'utf8');
    assert.ok(receiptText.length > 0);
    let receipt = null;
    try { receipt = JSON.parse(receiptText); } catch { /* parse-failure fixtures assert red below */ }
    if (spec.expectReceiptVerificationFailure === true) {
      assert.equal(exitCode, 1);
      assertNoLifecycleTokenOrSecretLeak(
        receiptText,
        harness.state.tokenValues,
        ['child-secret', 'stderr-secret', 'raw-malformed-secret', 'raw-malformed-trigger', 'raw-malformed-complete'],
      );
      if (spec.expectValidReceipt === true) assert.equal(validateE2eVerdictReceipt(receipt), true);
      if (spec.expectValidReceipt === false) assert.equal(validateE2eVerdictReceipt(receipt), false);
      spec.assertResult({ exitCode, receipt, receiptText, harness });
      return;
    }
    assertReceiptLifecycleShape(receipt);
    assertNoLifecycleTokenOrSecretLeak(
      receiptText,
      harness.state.tokenValues,
      ['child-secret', 'stderr-secret', 'raw-malformed-secret', 'raw-malformed-trigger', 'raw-malformed-complete'],
    );
    assert.equal(receipt.receiptPath, undefined);
    assert.equal(receipt.runnerInteractionFailed, spec.expectedInteractionFailure);
    assert.equal(receipt.source, 'json-report');
    assert.equal(receipt.reportCode, 'structured-report-inspected');
    spec.assertResult({ exitCode, receipt, receiptText, harness });
  } finally {
    if (caseRoot !== undefined) cleanupCaseDirectory(caseRoot);
  }
}

// Synthetic terminal reports below qualify the runner's final decision boundary;
// they do not stand in for executing Playwright, native IPC, or the game.
function makeLeaseInspectionReport() {
  return {
    complete: true, errors: [], actorCount: 1, recordFiles: 4, recordBytes: 128, cliExitCode: 0,
    owner: {
      limit: 4096, retained: 1, inFlight: 0, spawnCalls: 1, spawnThrows: 0,
      acquisitionAttempts: 1, noPidCalls: 0, idempotentReuses: 0, failed: false,
      failureCode: null, retirementAttempts: 0, retirementFailed: false,
      reportingFailed: false, refusedCalls: 0,
    },
  };
}

function makeLeaseInspectionCase({ name, result, green = false, childExitCode = 0, retirementThrows = false }) {
  return {
    name: `process lease inspection: ${name}`,
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid, trigger: 'child-close', childExit: { code: childExitCode, signal: null }, capturedPids, tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: !green || retirementThrows,
    runOptions(harness) {
      const events = [];
      harness.state.leaseInspectionEvents = events;
      harness.state.leaseAccessorReads = 0;
      return {
        inspectProcessLeases(...args) {
          assert.equal(args.length, 0);
          assert.deepEqual(events, []);
          assert.equal(harness.state.superviseCalls, 1);
          assert.equal(harness.state.probeCalls, 2);
          assert.equal(harness.state.child.listenerCount('error'), harness.state.errorListenerBaseline);
          assert.deepEqual(JSON.parse(fs.readFileSync(harness.state.reportPath, 'utf8')), makeStrictGreenReport());
          assert.equal(fs.existsSync(harness.receiptPath), false, 'inspection precedes the typed receipt');
          events.push('inspect');
          return result(harness);
        },
        finalizeRunState() {
          assert.deepEqual(events, ['inspect'], 'inspection finishes before retirement, including refusal paths');
          events.push('retire');
          if (retirementThrows) throw new Error('private-lease-retirement-secret');
        },
        writeJsonAtomicImpl(receiptPath, receipt) {
          assert.deepEqual(events, ['inspect', 'retire'], 'retirement is attempted even when inspection fails');
          assert.equal(receipt.runnerInteractionFailed, !green || retirementThrows);
          assert.equal(validateE2eVerdictReceipt(receipt), true);
          events.push('receipt');
          fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
        },
      };
    },
    assertResult({ exitCode, receipt, receiptText, harness }) {
      assert.equal(exitCode, green && !retirementThrows ? 0 : 1);
      assert.equal(receipt.verdict.green, true, 'synthetic Playwright JSON remains independently green');
      assert.equal(receipt.reportInspection.complete, true);
      assert.equal(receipt.lifecycle.complete, true);
      assert.equal(receipt.lifecycle.termination.treeGone, true);
      assert.equal(receipt.childExit, childExitCode);
      assert.deepEqual(harness.state.leaseInspectionEvents, ['inspect', 'retire', 'receipt']);
      assert.equal(harness.state.leaseAccessorReads, 0, 'untrusted inspection accessors/proxies are not evaluated');
      assertNoLifecycleTokenOrSecretLeak(receiptText, [], ['private-lease-inspection-secret', 'private-lease-retirement-secret']);
    },
  };
}

function makeLeaseInspectionCases() {
  const altered = mutate => () => { const report = makeLeaseInspectionReport(); mutate(report); return report; };
  return [
    { name: 'complete synchronous inspection preserves green', result: makeLeaseInspectionReport, green: true },
    { name: 'complete bounded maximum report preserves green', green: true, result: altered(report => {
      report.actorCount = 514; report.recordFiles = 1543; report.recordBytes = 101122048;
    }) },
    { name: 'ordinary libuv exit remains governed by green structured report', green: true, childExitCode: 3221226505,
      result: altered(report => { report.cliExitCode = 3221226505; }) },
    { name: 'incomplete family overrides green JSON', result: altered(report => { report.complete = false; }) },
    { name: 'throw after green JSON stays red', result: () => { throw new Error('private-lease-inspection-secret'); } },
    { name: 'false result stays red', result: () => false },
    { name: 'missing required field stays red', result: altered(report => { delete report.recordBytes; }) },
    { name: 'Promise result is not awaited or accepted', result: () => Promise.resolve(makeLeaseInspectionReport()) },
    { name: 'thenable result is not assimilated', result: harness => ({ then() { harness.state.leaseAccessorReads += 1; } }) },
    { name: 'nonempty failure list stays red', result: altered(report => { report.errors = ['private-lease-inspection-secret']; }) },
    { name: 'sparse failure list stays red', result: altered(report => { report.errors = Array(1); }) },
    { name: 'extra report key stays red', result: altered(report => { report.unreviewed = true; }) },
    { name: 'owner in flight stays red', result: altered(report => { report.owner.inFlight = 1; }) },
    { name: 'owner failed latch stays red', result: altered(report => { report.owner.failed = true; }) },
    { name: 'owner failure code stays red', result: altered(report => { report.owner.failureCode = 'private-lease-inspection-secret'; }) },
    { name: 'getter report stays red without evaluation', result: harness => {
      const report = makeLeaseInspectionReport();
      Object.defineProperty(report, 'complete', { enumerable: true, get() { harness.state.leaseAccessorReads += 1; return true; } });
      return report;
    } },
    { name: 'proxy report stays red without traps', result: harness => new Proxy(makeLeaseInspectionReport(), {
      ownKeys(target) { harness.state.leaseAccessorReads += 1; return Reflect.ownKeys(target); },
      get(target, key) { harness.state.leaseAccessorReads += 1; return Reflect.get(target, key); },
    }) },
    { name: 'owner getter stays red without evaluation', result: harness => {
      const report = makeLeaseInspectionReport();
      Object.defineProperty(report.owner, 'failed', { enumerable: true, get() { harness.state.leaseAccessorReads += 1; return false; } });
      return report;
    } },
    { name: 'owner proxy stays red without traps', result: harness => {
      const report = makeLeaseInspectionReport();
      report.owner = new Proxy(report.owner, {
        ownKeys(target) { harness.state.leaseAccessorReads += 1; return Reflect.ownKeys(target); },
        get(target, key) { harness.state.leaseAccessorReads += 1; return Reflect.get(target, key); },
      });
      return report;
    } },
    { name: 'missing owner state stays red', result: altered(report => { report.owner = {}; }) },
    { name: 'missing owner meter stays red', result: altered(report => { delete report.owner.acquisitionAttempts; }) },
    { name: 'extra owner meter stays red', result: altered(report => { report.owner.unreviewed = 0; }) },
    { name: 'reported retirement failure stays red', result: altered(report => { report.owner.retirementFailed = true; }) },
    { name: 'reported notification failure stays red', result: altered(report => { report.owner.reportingFailed = true; }) },
    ...[
      ['limit', 0], ['limit', 4097], ['retained', 0], ['retained', 4097], ['spawnCalls', -1],
      ['spawnThrows', 2], ['acquisitionAttempts', 0], ['acquisitionAttempts', 2],
      ['noPidCalls', 2], ['idempotentReuses', 2], ['retirementAttempts', 1], ['refusedCalls', 1],
    ].map(([field, value]) => ({ name: `invalid owner ${field} ${value} stays red`, result: altered(report => { report.owner[field] = value; }) })),
    ...[
      ['actorCount', 0], ['actorCount', 515], ['recordFiles', 3], ['recordFiles', 1544],
      ['recordBytes', 0], ['recordBytes', 101122049], ['recordBytes', 1.5],
      ['cliExitCode', -1], ['cliExitCode', 4294967296], ['cliExitCode', 86], ['cliExitCode', 259],
    ].map(([field, value]) => ({ name: `invalid ${field} ${value} stays red`, result: altered(report => { report[field] = value; }) })),
    { name: 'reserved actual child exit overrides complete report', childExitCode: 86, result: makeLeaseInspectionReport },
    { name: 'inspection refusal still attempts failing retirement', retirementThrows: true, result: altered(report => { report.complete = false; }) },
    { name: 'retirement failure after complete inspection stays red', retirementThrows: true, green: true, result: makeLeaseInspectionReport },
  ].map(makeLeaseInspectionCase);
}

function assertMainSpawnerWithoutOsLaunch(mode) {
  const prototype = ChildProcess.prototype;
  const originalDescriptor = Object.getOwnPropertyDescriptor(prototype, 'spawn');
  const originalDefineProperty = Object.defineProperty;
  const child = new ChildProcess(); // Inactive receiver: no native spawn is invoked.
  const secondChild = new ChildProcess();
  const original = new Error('private-lease-main-spawner-secret');
  const events = [];
  const rawArguments = Object.freeze({ controlledNormalizedOptions: true });
  const environment = Object.freeze({ CONTROLLED_EXISTING_ENV: 'unchanged' });
  const protectedEnvironment = Object.freeze({ ...environment, CONTROLLED_LEASE: 'private' });
  const argumentsBefore = Object.freeze(['controlled-cli.js', 'test']);
  const stdio = Object.freeze(['ignore', 'pipe', 'pipe']);
  const optionsBefore = Object.freeze({ env: environment, shell: false, stdio });
  let publicReturned = false;
  let ticketCalls = 0;
  const ticket = {
    environment: protectedEnvironment, execArgv: ['--import', 'file:///controlled-preload.mjs'],
    spawn(nativeSpawn, receiver, args) {
      // The supplied native function is observed by identity, never executed.
      assert.strictEqual(nativeSpawn, originalDescriptor.value);
      assert.strictEqual(receiver, child);
      assert.deepEqual(args, [rawArguments]);
      ticketCalls += 1;
      events.push('capture');
      return 0;
    },
    admit() {
      assert.equal(publicReturned, true);
      assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, 'spawn'), originalDescriptor,
        'admission occurs only after the global prototype is restored');
      events.push('admit');
      if (mode === 'admit-throws') throw original;
    },
    cancel() {
      events.push('cancel');
      if (mode === 'cancel-throws') throw new Error('private-cancellation-secret');
    },
  };
  const family = {
    prepareProtectedSpawn(input) {
      assert.deepEqual(input, { role: 'cli', env: environment });
      events.push('prepare');
      return ticket;
    },
  };
  const protectedSpawn = createProtectedE2eSpawner(family, (command, args, options) => {
    events.push('public-call');
    assert.equal(command, 'controlled-node');
    assert.deepEqual(args, [...ticket.execArgv, ...argumentsBefore]);
    assert.strictEqual(options.env, protectedEnvironment);
    assert.strictEqual(options.stdio, stdio);
    assert.equal(options.shell, false);
    if (mode === 'throw-before-capture') throw original;
    assert.equal(Reflect.apply(prototype.spawn, child, [rawArguments]), 0);
    if (mode === 'throw-after-capture' || mode === 'cancel-throws') throw original;
    if (mode === 'multiple-receivers') Reflect.apply(prototype.spawn, secondChild, [rawArguments]);
    publicReturned = true;
    events.push('public-return');
    return mode === 'wrong-receiver' ? secondChild : child;
  });
  try {
    if (mode === 'restore-throws') {
      Object.defineProperty = function (target, key, descriptor) {
        if (target === prototype && key === 'spawn' && descriptor.value === originalDescriptor.value) throw original;
        return Reflect.apply(originalDefineProperty, Object, [target, key, descriptor]);
      };
    }
    if (mode === 'healthy') {
      assert.strictEqual(protectedSpawn('controlled-node', argumentsBefore, optionsBefore), child);
      assert.deepEqual(events, ['prepare', 'public-call', 'capture', 'public-return', 'admit']);
    } else {
      assert.throws(() => protectedSpawn('controlled-node', argumentsBefore, optionsBefore), error => {
        if (mode === 'wrong-receiver') return error.message === 'E2E_PROCESS_HANDLE_MAIN_CHILD_MISMATCH';
        if (mode === 'multiple-receivers') return error.message === 'E2E_PROCESS_HANDLE_MAIN_MULTIPLE_SPAWNS';
        return error === original;
      });
      assert.equal(events.filter(value => value === 'cancel').length, 1);
      assert.equal(events.includes('admit'), mode === 'admit-throws');
    }
    assert.equal(ticketCalls, mode === 'throw-before-capture' ? 0 : 1);
    assert.deepEqual(argumentsBefore, ['controlled-cli.js', 'test']);
    assert.deepEqual(optionsBefore, { env: environment, shell: false, stdio });
  } finally {
    // The restoration-refusal test never makes a property nonconfigurable.
    Object.defineProperty = originalDefineProperty;
    originalDefineProperty(prototype, 'spawn', originalDescriptor);
  }
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, 'spawn'), originalDescriptor);
}

const CASES = [
  {
    name: 'normal child-close strict green',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    assertResult({ exitCode, receipt, harness }) {
      assert.equal(exitCode, 0);
      assert.equal(receipt.verdict.green, true);
      assert.equal(receipt.reportInspection.complete, true);
      assert.equal(receipt.runnerInteractionFailed, false);
      assert.equal(receipt.lifecycle.complete, true);
      assert.equal(receipt.lifecycle.trigger, 'child-close');
      assert.equal(receipt.lifecycle.childExit.code, 0);
      assert.equal(receipt.lifecycle.termination.complete, true);
      assert.equal(receipt.lifecycle.termination.treeGone, true);
      assert.deepEqual(receipt.lifecycle.termination.remainingPids, []);
      assert.deepEqual(receipt.lifecycle.capturedPids, harness.state.capturedPids);
      assert.equal(receipt.childExit, 0);
      assert.equal(harness.state.child.listenerCount('error'), harness.state.errorListenerBaseline);
    },
  },
  {
    name: 'terminal-report-grace strict green',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'terminal-report-grace-expired',
      childExit: null,
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    assertResult({ exitCode, receipt, harness }) {
      assert.equal(exitCode, 0);
      assert.equal(receipt.verdict.green, true);
      assert.equal(receipt.lifecycle.trigger, 'terminal-report-grace-expired');
      assert.equal(receipt.lifecycle.childExit, null);
      assert.equal(receipt.childExit, null);
      assert.equal(receipt.lifecycle.termination.complete, true);
      assert.equal(receipt.lifecycle.termination.treeGone, true);
      assert.deepEqual(receipt.lifecycle.termination.remainingPids, []);
      assert.deepEqual(receipt.lifecycle.capturedPids, harness.state.capturedPids);
    },
  },
  {
    name: 'outer-deadline cleanup',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'outer-deadline',
      childExit: null,
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    assertResult({ exitCode, receipt, harness }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.verdict.green, true);
      assert.equal(receipt.lifecycle.complete, true);
      assert.equal(receipt.lifecycle.trigger, 'outer-deadline');
      assert.equal(receipt.lifecycle.childExit, null);
      assert.equal(receipt.lifecycle.termination.complete, true);
      assert.equal(receipt.lifecycle.termination.treeGone, true);
      assert.deepEqual(receipt.lifecycle.termination.remainingPids, []);
      assert.deepEqual(receipt.lifecycle.capturedPids, harness.state.capturedPids);
      assert.deepEqual(receipt.lifecycle.termination.capturedPids, harness.state.capturedPids);
    },
  },
  {
    name: 'structurally incomplete report',
    reportFactory: makeStructurallyIncompleteReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    stdout: '1 passed\n',
    probeAfterWrite: false,
    expectedInteractionFailure: false,
    assertResult({ exitCode, receipt }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.source, 'json-report');
      assert.equal(receipt.reportInspection.complete, false);
      assert.equal(receipt.verdict.green, false);
      assert.equal(receipt.lifecycle.trigger, 'child-close');
      assert.equal(receipt.lifecycle.termination.treeGone, true);
      assert.deepEqual(receipt.lifecycle.termination.remainingPids, []);
    },
  },
  {
    name: 'malformed lifecycle result',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, tokenPrefix }) => makeMalformedLifecycle({ rootPid, tokenPrefix }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    assertResult({ exitCode, receipt }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.verdict.green, true);
      assert.deepEqual(receipt.lifecycle, makeUnavailableLifecycleProjection());
    },
  },
  {
    name: 'unproven termination keeps remaining pids unknown',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeFailedTerminationLifecycle({
      rootPid,
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    assertResult({ exitCode, receipt }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.verdict.green, true);
      assert.equal(receipt.lifecycle.complete, false);
      assert.equal(receipt.lifecycle.termination.complete, false);
      assert.equal(receipt.lifecycle.termination.treeGone, false);
      assert.equal(receipt.lifecycle.termination.remainingPids, null);
    },
  },
  {
    name: 'observed child error',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    emitChildError: true,
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    assertResult({ exitCode, receipt, harness }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.verdict.green, true);
      assert.equal(receipt.runnerInteractionFailed, false);
      assert.equal(receipt.lifecycle.trigger, 'child-close');
      assert.equal(receipt.lifecycle.termination.treeGone, true);
      assert.deepEqual(receipt.lifecycle.termination.remainingPids, []);
      assert.deepEqual(receipt.lifecycle.capturedPids, harness.state.capturedPids);
      assert.equal(harness.state.child.listenerCount('error'), harness.state.errorListenerBaseline);
    },
  },
  {
    name: 'diagnostic interaction failure preserves lifecycle evidence',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    interactionFailure: true,
    probeAfterWrite: true,
    expectedInteractionFailure: true,
    assertResult({ exitCode, receipt, harness }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.verdict.green, true);
      assert.equal(receipt.runnerInteractionFailed, true);
      assert.equal(receipt.lifecycle.complete, true);
      assert.equal(receipt.lifecycle.trigger, 'child-close');
      assert.equal(receipt.lifecycle.termination.complete, true);
      assert.equal(receipt.lifecycle.termination.treeGone, true);
      assert.deepEqual(receipt.lifecycle.capturedPids, harness.state.capturedPids);
      assert.equal(harness.state.child.listenerCount('error'), harness.state.errorListenerBaseline);
    },
  },
  {
    name: 'receipt read failure stays red',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    expectReceiptVerificationFailure: true,
    expectValidReceipt: true,
    runOptions: () => ({
      readReceiptImpl: () => { throw new Error('injected-readback-secret'); },
    }),
    assertResult({ exitCode, receipt }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.schemaVersion, 2);
      assert.deepEqual(receipt.lifecycle.termination.remainingPids, []);
    },
  },
  {
    name: 'receipt parse failure stays red',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    expectReceiptVerificationFailure: true,
    expectValidReceipt: false,
    runOptions: () => ({ writeJsonAtomicImpl: corruptReceiptWriter('malformed-json') }),
    assertResult({ exitCode }) {
      assert.equal(exitCode, 1);
    },
  },
  {
    name: 'receipt schema corruption stays red',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    expectReceiptVerificationFailure: true,
    expectValidReceipt: false,
    runOptions: () => ({ writeJsonAtomicImpl: corruptReceiptWriter('extra-key') }),
    assertResult({ exitCode }) {
      assert.equal(exitCode, 1);
    },
  },
  {
    name: 'receipt content corruption stays red',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    expectReceiptVerificationFailure: true,
    expectValidReceipt: true,
    runOptions: () => ({ writeJsonAtomicImpl: corruptReceiptWriter('content-mismatch') }),
    assertResult({ exitCode, receipt }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt.schemaVersion, 2);
    },
  },
  {
    name: 'receipt write failure stays red',
    reportFactory: makeStrictGreenReport,
    lifecycleFactory: ({ rootPid, capturedPids, tokenPrefix }) => makeCompleteLifecycle({
      rootPid,
      trigger: 'child-close',
      childExit: { code: 0, signal: null },
      capturedPids,
      tokenPrefix,
    }),
    probeAfterWrite: true,
    expectedInteractionFailure: false,
    expectReceiptMissing: true,
    runOptions: () => ({ writeJsonAtomicImpl: () => { throw new Error('injected-writeback-secret'); } }),
    assertResult({ exitCode, receipt }) {
      assert.equal(exitCode, 1);
      assert.equal(receipt, null);
    },
  },
];

CASES.push(...makeLeaseInspectionCases());
CASES.push(...['healthy', 'throw-before-capture', 'throw-after-capture', 'cancel-throws', 'admit-throws',
  'restore-throws', 'wrong-receiver', 'multiple-receivers'].map(mode => makeLeaseInspectionCase({
  name: `MAIN protected spawner ${mode} without OS launch`, green: true,
  result() { assertMainSpawnerWithoutOsLaunch(mode); return makeLeaseInspectionReport(); },
})));

const NATIVE_LEASE_MODES = new Set(['healthy', 'acquire', 'cap', 'persist']);
const NATIVE_LEASE_SELECTOR = '__x4_e2e_native_lease_';
const NATIVE_LEASE_DATA = 'native-process-lease-fixture';
const NATIVE_LEASE_ROLE_WAIT_MS = 5000;
// Fixture-only ownership release: keep the real CIM snapshot's 10000ms budget
// plus bounded scheduling margin. Production actor binding still has its own5s.
const NATIVE_LEASE_OWNERSHIP_WAIT_MS = 15000;
const nativeLeaseHash = value => createHash('sha256').update(value).digest('hex');

function readNativeLeaseJson(file, maximum = 65536) {
  const before = fs.lstatSync(file, { bigint: true });
  assert.equal(before.isFile(), true);
  assert.equal(before.isSymbolicLink(), false);
  assert.equal(before.nlink, 1n);
  assert.ok(before.size > 0n && before.size <= BigInt(maximum));
  const fd = fs.openSync(file, 'r');
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    assert.deepEqual([opened.dev, opened.ino, opened.birthtimeNs, opened.size], [before.dev, before.ino, before.birthtimeNs, before.size]);
    const bytes = Buffer.alloc(Number(opened.size));
    assert.equal(fs.readSync(fd, bytes, 0, bytes.length, 0), bytes.length);
    const after = fs.fstatSync(fd, { bigint: true });
    assert.deepEqual([after.dev, after.ino, after.size, after.mtimeNs], [opened.dev, opened.ino, opened.size, opened.mtimeNs]);
    assert.equal(fs.lstatSync(file, { bigint: true }).ino, opened.ino);
    return JSON.parse(bytes.toString('utf8'));
  } finally { fs.closeSync(fd); }
}

async function waitNativeLeaseBarrier(file) {
  const started = performance.now();
  while (!fs.existsSync(file)) {
    if (performance.now() - started >= NATIVE_LEASE_OWNERSHIP_WAIT_MS) throw new Error('native-lease-fixture-ownership-timeout');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const barrier = readNativeLeaseJson(file, 1024);
  assertExactRecordKeys(barrier, ['schemaVersion', 'rootPid', 'creationTokenSha256']);
  assert.equal(barrier.schemaVersion, 'forge.e2e-native-lease-observed-root.v1');
  assert.equal(barrier.rootPid, process.pid);
  assert.match(barrier.creationTokenSha256, /^[a-f0-9]{64}$/u);
}

function nativeLeaseAdmission(actor, manifest) {
  const role = manifest.roles[actor.role];
  assert.ok(role);
  assert.equal(fs.realpathSync.native(process.argv[1]), role.physical);
  const imports = [manifest.files.preload, ...manifest.extraPreloads].flatMap(file => ['--import', pathToFileURL(file.lexical).href]);
  assert.deepEqual(process.execArgv, imports, 'fork inherits the exact original CLI import arguments');
  const snapshot = actor.snapshot();
  assert.equal(snapshot.failed, false);
  assert.equal(snapshot.owner.failed, false);
  return {
    schemaVersion: 'forge.e2e-native-lease-admission.v1', role: actor.role, actorId: actor.actorId,
    entrySha256: nativeLeaseHash(fs.readFileSync(role.physical)),
    bindingConfirmedBeforeProbe: true, inheritedImportsMatch: true, dependencyBodyExecuted: false,
  };
}

async function forkNativeLeaseAdmission(role, manifest) {
  const child = fork(manifest.roles[role].lexical, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  return await new Promise((resolve, reject) => {
    let admission;
    const timer = setTimeout(() => {
      // Original ChildProcess ownership only; never terminate a looked-up PID.
      child.kill('SIGKILL');
      reject(new Error('native-lease-fixture-role-timeout'));
    }, NATIVE_LEASE_ROLE_WAIT_MS);
    child.on('message', message => {
      try {
        assert.equal(admission, undefined);
        assert.ok(Buffer.byteLength(JSON.stringify(message), 'utf8') <= 2048);
        assertExactRecordKeys(message, ['schemaVersion', 'role', 'actorId', 'entrySha256', 'bindingConfirmedBeforeProbe', 'inheritedImportsMatch', 'dependencyBodyExecuted']);
        assert.equal(message.schemaVersion, 'forge.e2e-native-lease-admission.v1');
        assert.equal(message.role, role);
        assert.match(message.actorId, /^child-\d{4}$/u);
        assert.equal(message.entrySha256, manifest.roles[role].sha256);
        assert.equal(message.bindingConfirmedBeforeProbe, true);
        assert.equal(message.inheritedImportsMatch, true);
        assert.equal(message.dependencyBodyExecuted, false);
        admission = message;
      } catch (error) { reject(error); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      try { assert.equal(code, 0); assert.equal(signal, null); assert.ok(admission); resolve(admission); }
      catch (error) { reject(error); }
    });
  });
}

// This exact, fingerprinted file is an extra preload only in an explicitly
// constructed private native test family. Normal families have no such preload.
async function runNativeLeaseExtraPreload(actor) {
  const marker = JSON.parse(process.env[E2E_PROCESS_HANDLE_ACTOR_ENV]);
  const manifest = readNativeLeaseJson(path.join(marker.root, 'family.json'));
  assert.ok(manifest.testProfile !== null);
  assert.equal(manifest.extraPreloads.length, 1);
  assert.equal(manifest.extraPreloads[0].physical, fs.realpathSync.native(fileURLToPath(import.meta.url)));
  const admission = nativeLeaseAdmission(actor, manifest);
  if (actor.role !== 'cli') {
    assert.ok(['loader', 'worker'].includes(actor.role));
    assert.equal(typeof process.send, 'function');
    await new Promise((resolve, reject) => process.send(admission, error => error ? reject(error) : resolve()));
    process.exit(0); // Intentionally before the installed loader/worker body.
    throw new Error('native-lease-fixture-exit-returned');
  }
  const selector = process.argv[process.argv.indexOf('--grep') + 1];
  assert.ok(selector?.startsWith(NATIVE_LEASE_SELECTOR));
  const scenario = selector.slice(NATIVE_LEASE_SELECTOR.length);
  assert.equal(NATIVE_LEASE_MODES.has(scenario), true);
  const state = readE2eRunState();
  const fixtureRoot = path.join(state.stateDir, NATIVE_LEASE_DATA);
  await waitNativeLeaseBarrier(path.join(fixtureRoot, 'observed-root.json'));
  const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  assert.equal(path.dirname(reportPath), os.tmpdir());
  assert.equal(fs.existsSync(reportPath), false);
  fs.writeFileSync(reportPath, `${JSON.stringify(makeStrictGreenReport())}\n`, { flag: 'wx' });
  // A green synthetic terminal report now exists BEFORE the real owner fault.
  if (scenario === 'healthy') {
    const roles = [admission, await forkNativeLeaseAdmission('loader', manifest), await forkNativeLeaseAdmission('worker', manifest)];
    fs.writeFileSync(path.join(fixtureRoot, 'role-admissions.json'), `${JSON.stringify(roles)}\n`, { flag: 'wx' });
    process.exit(0); // CLI body is deliberately not executed in this fault fixture.
  } else if (scenario === 'cap') {
    assert.equal(actor.snapshot().owner.limit, 1);
    await forkNativeLeaseAdmission('worker', manifest);
    assert.equal(actor.snapshot().owner.retained, 1);
    fork(manifest.roles.worker.lexical, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  } else {
    assert.equal(typeof actor.testFault, 'function');
    actor.testFault(scenario, consumed => {
      assert.equal(Object.isFrozen(consumed), true);
      assertExactRecordKeys(consumed, ['kind', 'stage', 'recordName']);
      assert.equal(consumed.kind, scenario);
      assert.equal(consumed.stage, scenario === 'acquire' ? 'native-open' : 'publish');
      assert.equal(consumed.recordName, scenario === 'acquire' ? null : 'child-0001.intent.json');
      const witness = {
        schemaVersion: 'forge.e2e-native-lease-fault-consumed.v1', kind: consumed.kind,
        stage: consumed.stage, recordName: consumed.recordName, actorId: actor.actorId,
        syntheticReportSha256: nativeLeaseHash(fs.readFileSync(reportPath)),
      };
      const bytes = Buffer.from(`${JSON.stringify(witness)}\n`, 'utf8');
      assert.ok(bytes.length <= 1024);
      const fd = fs.openSync(path.join(fixtureRoot, 'fault-consumed.json'), 'wx', 0o600);
      try { assert.equal(fs.writeSync(fd, bytes), bytes.length); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
    });
    fork(manifest.roles.worker.lexical, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  }
  process.reallyExit(87); // The armed owner failure MUST have terminated with86.
}

function readNativeFaultAttribution(stateOwner, fixtureRoot, scenario, rootPid) {
  const names = fs.readdirSync(stateOwner.stateDir).filter(name => /^process-handle-family-[A-Za-z0-9_-]+$/u.test(name));
  assert.equal(names.length, 1);
  const familyRoot = path.join(stateOwner.stateDir, names[0]);
  const rootStat = fs.lstatSync(familyRoot);
  assert.equal(rootStat.isDirectory(), true);
  assert.equal(rootStat.isSymbolicLink(), false);
  assert.equal(fs.realpathSync.native(familyRoot), familyRoot);
  const manifest = readNativeLeaseJson(path.join(familyRoot, 'family.json'));
  assert.equal(manifest.runId, stateOwner.runId);
  assert.equal(manifest.stateDir, stateOwner.stateDir);
  assert.equal(manifest.creator.pid, process.pid);
  const binding = readNativeLeaseJson(path.join(familyRoot, 'cli.binding.json'));
  const phase = readNativeLeaseJson(path.join(familyRoot, 'cli.phase.json'));
  assert.equal(binding.actorId, 'cli');
  assert.equal(binding.disposition, 'created');
  assert.equal(binding.identity.pid, rootPid);
  assert.equal(phase.actorId, 'cli');
  assert.equal(phase.role, 'cli');
  assert.equal(phase.familyId, manifest.familyId);
  assert.deepEqual(phase.identity, binding.identity);
  assert.equal(phase.bindingHash, nativeLeaseHash(fs.readFileSync(path.join(familyRoot, 'cli.binding.json'))));
  const owner = phase.owner;
  assert.equal(Number.isSafeInteger(owner.inFlight) && owner.inFlight >= 0, true);
  // A failure phase is observed inside the failing stack, before finally unwinds.
  // Its inFlight meter is retained as observed, never rewritten to terminal0.
  let consumed = null;
  const witnessPath = path.join(fixtureRoot, 'fault-consumed.json');
  if (scenario !== 'cap') {
    consumed = readNativeLeaseJson(witnessPath, 1024);
    assertExactRecordKeys(consumed, ['schemaVersion', 'kind', 'stage', 'recordName', 'actorId', 'syntheticReportSha256']);
    assert.equal(consumed.schemaVersion, 'forge.e2e-native-lease-fault-consumed.v1');
    assert.equal(consumed.kind, scenario);
    assert.equal(consumed.actorId, 'cli');
    assert.equal(consumed.stage, scenario === 'acquire' ? 'native-open' : 'publish');
    assert.equal(consumed.recordName, scenario === 'acquire' ? null : 'child-0001.intent.json');
    assert.equal(consumed.syntheticReportSha256, nativeLeaseHash(`${JSON.stringify(makeStrictGreenReport())}\n`));
  } else assert.equal(fs.existsSync(witnessPath), false, 'capacity proof comes from the actual failed owner counters');
  if (scenario === 'persist') {
    assert.equal(phase.phase, 'active', 'sticky refusal retains the historical initial phase');
    assert.equal(phase.generation, 0);
    assert.equal(phase.failed, false);
    assert.equal(phase.failureCode, null);
    assert.equal(owner.failed, false);
    assert.equal(owner.failureCode, null);
    assert.equal(owner.retained, 0);
    assert.equal(owner.spawnCalls, 0);
    assert.equal(owner.acquisitionAttempts, 0);
    assert.deepEqual(phase.children, []);
    assert.equal(fs.existsSync(path.join(familyRoot, 'child-0001.intent.json')), false);
  } else {
    const code = scenario === 'acquire' ? 'e2e-handle-lease-acquire-failed' : 'e2e-handle-lease-limit';
    assert.equal(phase.phase, 'failed');
    assert.equal(phase.failed, true);
    assert.equal(phase.failureCode, code);
    assert.equal(owner.failed, true);
    assert.equal(owner.failureCode, code);
    assert.equal(owner.spawnCalls, 1);
    assert.equal(owner.acquisitionAttempts, 1);
    assert.equal(owner.retained, scenario === 'cap' ? 1 : 0);
    if (scenario === 'cap') assert.equal(owner.limit, 1);
    const id = scenario === 'acquire' ? 'child-0001' : 'child-0002';
    const intent = readNativeLeaseJson(path.join(familyRoot, `${id}.intent.json`));
    assert.equal(intent.actorId, id);
    assert.equal(intent.parentId, 'cli');
    assert.equal(intent.role, 'worker');
    assert.equal(intent.familyId, manifest.familyId);
    assert.equal(fs.existsSync(path.join(familyRoot, `${id}.binding.json`)), false);
    assert.equal(fs.existsSync(path.join(familyRoot, `${id}.phase.json`)), false);
    if (scenario === 'cap') {
      const first = readNativeLeaseJson(path.join(familyRoot, 'child-0001.phase.json'));
      assert.equal(first.role, 'worker');
      assert.equal(first.phase, 'sealed');
      assert.equal(first.failed, false);
    }
  }
  return {
    kind: scenario, stage: consumed?.stage ?? 'pre-spawn-capacity', recordName: consumed?.recordName ?? (scenario === 'cap' ? 'child-0002.intent.json' : null),
    consumed, phase: phase.phase, failureCode: phase.failureCode,
    phaseIsHistorical: scenario === 'persist', intentPersistenceBeforeCreation: scenario === 'persist',
    owner: { limit: owner.limit, retained: owner.retained, inFlight: owner.inFlight,
      spawnCalls: owner.spawnCalls, acquisitionAttempts: owner.acquisitionAttempts, retirementAttempts: owner.retirementAttempts },
  };
}

async function runNativeLeaseQualification(scenario) {
  assert.equal(process.platform, 'win32');
  assert.equal(NATIVE_LEASE_MODES.has(scenario), true);
  const stateOwner = createE2eRunStateOwner();
  const fixtureRoot = path.join(stateOwner.stateDir, NATIVE_LEASE_DATA);
  fs.mkdirSync(fixtureRoot, { mode: 0o700 });
  const barrierPath = path.join(fixtureRoot, 'observed-root.json');
  const receiptPath = path.join(fixtureRoot, 'receipt.json');
  const family = createE2eProcessHandleLeaseFamily({
    env: stateOwner.environment, cwd: process.cwd(), preloadPath: path.join(process.cwd(), 'scripts', 'run-e2e.mjs'),
    extraPreloads: [fileURLToPath(import.meta.url)], testProfile: { handleLimit: scenario === 'cap' ? 1 : 4096 },
  });
  let actualRootObserved = false;
  let inspection;
  let retireCalls = 0;
  const exitCode = await runE2e({
    args: ['--project=chromium', '--grep', `${NATIVE_LEASE_SELECTOR}${scenario}`],
    manifest: MANIFEST, env: stateOwner.environment, receiptPath,
    spawnImpl: createProtectedE2eSpawner(family),
    superviseImpl: input => superviseSpawnedE2eProcess({
      ...input,
      initializeOwnershipImpl: async options => {
        assert.equal(options.rootPid, input.rootPid);
        assert.equal(options.snapshotOptions.timeoutMs, 10000, 'retain the actual Windows snapshot budget');
        const observed = await initializeSpawnedProcessOwnership(options);
        if (observed.complete === true && observed.rootIdentity?.pid === input.rootPid && !actualRootObserved) {
          assert.equal(observed.rootPresent, true);
          assert.ok(observed.captured.some(identity => identity.pid === input.rootPid && identity.creationToken === observed.rootIdentity.creationToken));
          fs.writeFileSync(barrierPath, `${JSON.stringify({ schemaVersion: 'forge.e2e-native-lease-observed-root.v1',
            rootPid: input.rootPid, creationTokenSha256: nativeLeaseHash(observed.rootIdentity.creationToken) })}\n`, { flag: 'wx' });
          actualRootObserved = true;
        }
        return observed; // Unmodified real WMI ownership facts, including failures.
      },
    }),
    inspectProcessLeases() { inspection = family.inspect(); return inspection; },
    finalizeRunState() { retireCalls += 1; stateOwner.retire(); },
  });
  const receipt = readNativeLeaseJson(receiptPath);
  const healthy = scenario === 'healthy';
  assert.equal(actualRootObserved, true);
  assert.equal(retireCalls, 1);
  assert.ok(inspection, 'inspection assertion must never prevent state retirement');
  assert.equal(validateE2eVerdictReceipt(receipt), true);
  assert.equal(receipt.verdict.green, true, 'terminal JSON is synthetic controlled fault input');
  assert.equal(receipt.reportInspection.complete, true);
  assert.equal(receipt.lifecycle.complete, true);
  assert.equal(receipt.lifecycle.termination.treeGone, true);
  assert.equal(receipt.runnerInteractionFailed, !healthy);
  assert.equal(exitCode, healthy ? 0 : 1);
  assert.equal(inspection.complete, healthy);
  assert.equal(inspection.cliExitCode, healthy ? 0 : 86, 'queried through the retained original CLI HANDLE');
  assert.equal(family.snapshot().owner.retained, 1);
  assert.equal(family.snapshot().owner.inFlight, 0);
  if (healthy) {
    const admissions = readNativeLeaseJson(path.join(fixtureRoot, 'role-admissions.json'));
    assert.deepEqual(admissions.map(value => value.role), ['cli', 'loader', 'worker']);
    assert.equal(admissions.every(value => value.dependencyBodyExecuted === false && value.bindingConfirmedBeforeProbe), true);
    assert.equal(inspection.actorCount, 3);
    assert.equal(fs.existsSync(path.join(fixtureRoot, 'fault-consumed.json')), false);
  }
  const attribution = healthy ? null : readNativeFaultAttribution(stateOwner, fixtureRoot, scenario, receipt.lifecycle.rootPid);
  console.log(`[e2e-native-handle-lease] ${JSON.stringify({ scenario, exitCode, originalCliExitCode: inspection.cliExitCode,
    actualRootObserved, receiptValid: true, receiptInteractionFailed: receipt.runnerInteractionFailed,
    lifecycleComplete: receipt.lifecycle.complete, treeGone: receipt.lifecycle.termination.treeGone,
    familyComplete: inspection.complete, actorCount: inspection.actorCount, recordFiles: inspection.recordFiles,
    recordBytes: inspection.recordBytes, stateDir: stateOwner.stateDir, receiptPath, attribution,
    terminalInput: 'synthetic-green', dependencyBodiesExecuted: false, realPlaywrightExecutionProven: false })}`);
}

async function runSelftest() {
  for (let index = 0; index < CASES.length; index += 1) {
    await runCase(CASES[index], index + 1);
  }
  assert.equal(watchdogState.armed, CASES.length);
  assert.equal(watchdogState.cleared, CASES.length);
  assert.equal(watchdogState.fired, 0);
  console.log(`e2e-runner-integration selftest: ${CASES.length}/${CASES.length}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain && activeE2eProcessHandleRole.active === true && typeof activeE2eProcessHandleRole.testFault === 'function') {
  try { await runNativeLeaseExtraPreload(activeE2eProcessHandleRole); }
  catch { process.reallyExit(87); }
}
if (isMain) {
  try {
    const nativeMode = /^--native-process-leases=(healthy|acquire|cap|persist)$/u.exec(process.argv[2] || '');
    if (nativeMode && process.argv.length === 3) await runNativeLeaseQualification(nativeMode[1]);
    else await runSelftest();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}
