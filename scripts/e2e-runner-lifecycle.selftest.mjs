import familyFs from 'node:fs';
import familyPath from 'node:path';
import { createE2eRunStateOwner, E2E_RUN_STATE_ENV } from './e2e-runtime-bootstrap.mjs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createE2eProcessHandleLeaseOwner, createE2eProcessHandleLeaseFamily, activateE2eProcessHandleLeaseRole, E2E_PROCESS_HANDLE_ACTOR_ENV, superviseSpawnedE2eProcess } from './e2e-runner-lifecycle.mjs';
import { sampleSpawnedProcessOwnership } from './e2e-process-ownership-sampler.mjs';

const ROOT_PID = 7401;
const ROOT_TOKEN = '20260804000000.000000-SELFTEST';
const TERMINATION_FAILURE = 'termination-executor-pass-limit';

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

const WATCHDOG_MS = 1000;
const OWNERSHIP_FAILURE_KEYS = [
  'complete',
  'errors',
  'rootIdentity',
  'rootPresent',
  'captured',
  'newlyCaptured',
  'reusedPids',
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

function makeRootIdentity(pid = ROOT_PID, creationToken = ROOT_TOKEN) {
  return {
    pid,
    creationToken,
  };
}

function cloneIdentity(identity) {
  return {
    pid: identity.pid,
    creationToken: identity.creationToken,
  };
}

function makeOwnershipFailureEnvelope() {
  const envelope = {
    complete: false,
    errors: ['spawned-ownership-snapshot-failed'],
    rootIdentity: null,
    rootPresent: false,
    captured: [],
    newlyCaptured: [],
    reusedPids: [],
  };
  assertExactRecordKeys(envelope, OWNERSHIP_FAILURE_KEYS);
  return envelope;
}

function makeCompleteInitialOwnership(rootIdentity) {
  return {
    complete: true,
    errors: [],
    rootIdentity: cloneIdentity(rootIdentity),
    rootPresent: true,
    captured: [cloneIdentity(rootIdentity)],
    newlyCaptured: [cloneIdentity(rootIdentity)],
    reusedPids: [],
  };
}

function makeCompleteSampleOwnership(rootIdentity) {
  return {
    complete: true,
    errors: [],
    rootIdentity: cloneIdentity(rootIdentity),
    rootPresent: true,
    captured: [cloneIdentity(rootIdentity)],
    newlyCaptured: [],
    reusedPids: [],
  };
}

function makeCompleteTermination(rootIdentity) {
  return {
    complete: true,
    errors: [],
    treeGone: true,
    passes: 1,
    captured: [cloneIdentity(rootIdentity)],
    commanded: [cloneIdentity(rootIdentity)],
    reusedPids: [],
  };
}

function makeValidFailureTermination(rootIdentity) {
  return {
    complete: false,
    errors: [TERMINATION_FAILURE],
    treeGone: false,
    passes: 1,
    captured: [cloneIdentity(rootIdentity)],
    commanded: [cloneIdentity(rootIdentity)],
    reusedPids: [],
  };
}

function makeFakeEventEmitterChild(pid) {
  const child = new EventEmitter();
  Object.defineProperty(child, 'pid', {
    value: pid,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  return child;
}

function makeFakeTimerScheduler() {
  let nextHandle = 1;
  let setTimeoutCallCount = 0;
  let clearTimeoutCallCount = 0;
  const records = [];

  const setTimeoutImpl = (callback, delay) => {
    setTimeoutCallCount += 1;
    assert.equal(typeof callback, 'function');
    assert.ok(Number.isFinite(delay));
    const handle = nextHandle;
    nextHandle += 1;
    assert.ok(Number.isSafeInteger(handle));
    records.push({
      handle,
      delay,
      callback,
      active: true,
      cleared: false,
      fired: false,
    });
    return handle;
  };

  const clearTimeoutImpl = (handle) => {
    clearTimeoutCallCount += 1;
    const record = records.find((candidate) => candidate.handle === handle);
    assert.notEqual(record, undefined, `unknown fake timer handle ${String(handle)}`);
    if (record.active) {
      record.active = false;
      record.cleared = true;
    }
  };

  const findLiveTimer = (handle) => {
    const record = records.find((candidate) => candidate.handle === handle);
    assert.notEqual(record, undefined, `unknown fake timer handle ${String(handle)}`);
    assert.equal(record.active, true, `fake timer ${String(handle)} is not live`);
    return record;
  };

  const fire = (handle) => {
    const record = findLiveTimer(handle);
    record.active = false;
    record.fired = true;
    record.callback();
  };

  const snapshot = () => records.map((record) => ({
    handle: record.handle,
    delay: record.delay,
    active: record.active,
    cleared: record.cleared,
    fired: record.fired,
  }));

  return {
    setTimeoutImpl,
    clearTimeoutImpl,
    setTimeoutCalls: () => setTimeoutCallCount,
    clearTimeoutCalls: () => clearTimeoutCallCount,
    fire,
    records: snapshot,
    activeTimers: () => snapshot().filter((record) => record.active),
    clearedTimers: () => snapshot().filter((record) => record.cleared),
    callbacksFired: () => snapshot().filter((record) => record.fired),
  };
}

async function waitForFakeTimerRecord(fixture, description, predicate, maxMicrotasks = 100) {
  assert.equal(typeof predicate, 'function');
  assert.ok(Number.isSafeInteger(maxMicrotasks));
  assert.ok(maxMicrotasks > 0);

  for (let attempt = 0; attempt < maxMicrotasks; attempt += 1) {
    const record = fixture.scheduler.records().find((candidate) => (
      candidate.active && predicate(candidate)
    ));
    if (record !== undefined) {
      return record;
    }
    await Promise.resolve();
  }

  assert.fail(`${description} fake timer was not armed within ${maxMicrotasks} microtask turns`);
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

function makeLifecycleInput({
  rootPid = ROOT_PID,
  childPid = rootPid,
  terminationFactory,
}) {
  assert.equal(typeof terminationFactory, 'function');

  const rootIdentity = makeRootIdentity(rootPid);
  const child = makeFakeEventEmitterChild(childPid);
  const scheduler = makeFakeTimerScheduler();
  const calls = {
    initialize: 0,
    sample: 0,
    probe: 0,
    terminate: 0,
    snapshotExecFile: 0,
    commandExecFile: 0,
    closeListenerCounts: [],
    terminationInput: null,
  };

  const input = {
    child,
    rootPid,
    snapshotOptions: {
      platform: 'win32',
      timeoutMs: 100,
      execFileImpl() {
        calls.snapshotExecFile += 1;
        throw new Error('snapshot process access is forbidden in this selftest');
      },
    },
    commandOptions: {
      platform: 'win32',
      timeoutMs: 100,
      execFileImpl() {
        calls.commandExecFile += 1;
        throw new Error('termination process access is forbidden in this selftest');
      },
    },
    probeTerminalReport() {
      calls.probe += 1;
      return false;
    },
    overallDeadlineMs: 100,
    terminalGraceMs: 100,
    sampleIntervalMs: 100,
    maxTerminationPasses: 1,
    terminationPollIntervalMs: 0,
    initializeOwnershipImpl() {
      calls.initialize += 1;
      queueMicrotask(() => {
        calls.closeListenerCounts.push({
          close: child.listenerCount('close'),
          error: child.listenerCount('error'),
        });
        child.emit('close', 0, null);
      });
      return makeCompleteInitialOwnership(rootIdentity);
    },
    sampleOwnershipImpl() {
      calls.sample += 1;
      return makeCompleteSampleOwnership(rootIdentity);
    },
    terminateImpl(terminationInput) {
      calls.terminate += 1;
      calls.terminationInput = terminationInput;
      return terminationFactory(rootIdentity);
    },
    setTimeoutImpl: scheduler.setTimeoutImpl,
    clearTimeoutImpl: scheduler.clearTimeoutImpl,
  };

  return {
    input,
    rootIdentity,
    child,
    scheduler,
    calls,
    expectedTermination: terminationFactory(rootIdentity),
  };
}

async function captureLifecycleDiagnostics(operation) {
  const lines = [];
  const originalError = console.error;
  console.error = (...args) => lines.push(args);
  try {
    return { result: await operation(), lines };
  } finally {
    console.error = originalError;
  }
}

function makeComposedOwnershipFixture(responses) {
  const fixture = makeLifecycleInput({ terminationFactory: makeCompleteTermination });
  fixture.rootIdentity = makeRootIdentity(ROOT_PID, '20261109000000.000000+000');
  fixture.input.overallDeadlineMs = 300;
  delete fixture.input.initializeOwnershipImpl;
  delete fixture.input.sampleOwnershipImpl;
  delete fixture.input.terminateImpl;
  fixture.input.snapshotOptions.execFileImpl = (command, args, options, callback) => {
    fixture.calls.snapshotExecFile += 1;
    assert.equal(command, 'powershell.exe');
    assert.equal(Array.isArray(args), true);
    assert.equal(options.windowsHide, true);
    assert.equal(typeof callback, 'function');
    const index = fixture.calls.snapshotExecFile - 1;
    const response = responses[Math.min(index, responses.length - 1)];
    if (response instanceof Error) callback(response, '', 'SELFTEST_PRIVATE_STDERR');
    else callback(null, response, '');
    if (fixture.calls.snapshotExecFile === responses.length) {
      queueMicrotask(() => fixture.child.emit('close', 0, null));
    }
    return { kill() { assert.fail('composed controls must not time out a helper'); } };
  };
  return fixture;
}

function composedCsv(...rows) {
  return ['Node,CreationDate,ParentProcessId,ProcessId', ...rows].join('\n');
}

function composedRow(identity, parentPid = 0) {
  return `SELFTEST,${identity.creationToken},${parentPid},${identity.pid}`;
}

async function finishComposedOwnership(fixture, sampleCount) {
  return withWatchdog('composed ownership diagnostics', async () => {
    const lifecyclePromise = superviseSpawnedE2eProcess(fixture.input);
    for (let index = 0; index < sampleCount; index += 1) {
      const delay = await waitForFakeTimerRecord(
        fixture,
        'composed ownership sample delay',
        (record) => record.delay === fixture.input.sampleIntervalMs,
      );
      fixture.scheduler.fire(delay.handle);
    }
    return lifecyclePromise;
  });
}

function assertComposedOwnershipCleanup(fixture, sampleCount) {
  assertLifecycleCleanup(fixture, [
    { handle: 1, delay: 300, active: false, cleared: true, fired: false },
    ...Array.from({ length: sampleCount }, (_, index) => ({
      handle: index + 2, delay: 100, active: false, cleared: false, fired: true,
    })),
  ]);
}

function assertNoProcessCalls(fixture) {
  assert.equal(fixture.calls.snapshotExecFile, 0);
  assert.equal(fixture.calls.commandExecFile, 0);
}

function assertInvalidInputResult(result) {
  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: false,
    errors: ['e2e-lifecycle-invalid-input'],
    trigger: null,
    childExit: null,
    ownershipComplete: false,
    rootIdentity: null,
    captured: [],
    reusedPids: [],
    termination: null,
  });
}

function assertNoLifecycleSideEffects(fixture) {
  assert.equal(fixture.calls.initialize, 0);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 0);
  assert.equal(fixture.calls.terminate, 0);
  assertNoProcessCalls(fixture);
  assert.equal(fixture.scheduler.setTimeoutCalls(), 0);
  assert.equal(fixture.scheduler.clearTimeoutCalls(), 0);
  assert.deepEqual(fixture.scheduler.records(), []);
  assert.deepEqual(fixture.calls.closeListenerCounts, []);
  assert.equal(fixture.child.listenerCount('close'), 0);
  assert.equal(fixture.child.listenerCount('error'), 0);
}

function assertLifecycleCleanup(fixture, expectedTimerRecords = [{
  handle: 1,
  delay: 100,
  active: false,
  cleared: true,
  fired: false,
}]) {
  assert.equal(fixture.child.listenerCount('close'), 0);
  assert.equal(fixture.child.listenerCount('error'), 0);
  assert.deepEqual(fixture.scheduler.activeTimers(), []);
  assert.equal(fixture.scheduler.records().every((record) => (
    Number.isSafeInteger(record.handle) && Number.isFinite(record.delay)
  )), true);
  assert.deepEqual(fixture.scheduler.records(), expectedTimerRecords);
  assert.deepEqual(
    fixture.scheduler.callbacksFired(),
    expectedTimerRecords.filter((record) => record.fired),
  );
  assert.deepEqual(
    fixture.scheduler.clearedTimers(),
    expectedTimerRecords.filter((record) => record.cleared),
  );
}

function assertWatchdogClearedWithoutFiring(watchdogsBefore) {
  assert.equal(watchdogState.armed, watchdogsBefore.armed + 1);
  assert.equal(watchdogState.cleared, watchdogsBefore.cleared + 1);
  assert.equal(watchdogState.fired, watchdogsBefore.fired);
}

function overrideStrictInitialOwnership(fixture, afterInitialization) {
  assert.ok(afterInitialization === undefined || typeof afterInitialization === 'function');
  fixture.input.initializeOwnershipImpl = () => {
    fixture.calls.initialize += 1;
    if (afterInitialization !== undefined) {
      queueMicrotask(afterInitialization);
    }
    return makeCompleteInitialOwnership(fixture.rootIdentity);
  };
}

function assertTerminationInput(fixture) {
  assertExactRecordKeys(fixture.calls.terminationInput, [
    'rootIdentity',
    'previousCaptured',
    'snapshotOptions',
    'commandOptions',
    'maxPasses',
    'pollIntervalMs',
  ]);
  assert.deepEqual(fixture.calls.terminationInput, {
    rootIdentity: fixture.rootIdentity,
    previousCaptured: [fixture.rootIdentity],
    snapshotOptions: fixture.input.snapshotOptions,
    commandOptions: fixture.input.commandOptions,
    maxPasses: 1,
    pollIntervalMs: 0,
  });
  assert.notStrictEqual(fixture.calls.terminationInput.rootIdentity, fixture.rootIdentity);
  assert.notStrictEqual(fixture.calls.terminationInput.previousCaptured[0], fixture.rootIdentity);
}

async function runInvalidInputCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    rootPid: 0,
    childPid: ROOT_PID,
    terminationFactory: makeCompleteTermination,
  });
  const result = await withWatchdog('invalid input', () => (
    superviseSpawnedE2eProcess(fixture.input)
  ));

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: false,
    errors: ['e2e-lifecycle-invalid-input'],
    trigger: null,
    childExit: null,
    ownershipComplete: false,
    rootIdentity: null,
    captured: [],
    reusedPids: [],
    termination: null,
  });
  assert.equal(fixture.calls.initialize, 0);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 0);
  assert.equal(fixture.calls.terminate, 0);
  assertNoProcessCalls(fixture);
  assert.equal(fixture.scheduler.records().length, 0);
  assert.equal(fixture.child.listenerCount('close'), 0);
  assert.equal(fixture.child.listenerCount('error'), 0);
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runNormalChildCloseCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  const result = await withWatchdog('normal child close/tree gone', () => (
    superviseSpawnedE2eProcess(fixture.input)
  ));

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: true,
    errors: [],
    trigger: 'child-close',
    childExit: { code: 0, signal: null },
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 1);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  assertLifecycleCleanup(fixture);
  assert.notStrictEqual(result.rootIdentity, result.captured[0]);
  assert.notStrictEqual(result.captured[0], result.termination.captured[0]);
  result.rootIdentity.creationToken = 'mutated-result-root';
  result.captured[0].creationToken = 'mutated-result-captured';
  result.termination.captured[0].creationToken = 'mutated-result-termination';
  assert.deepEqual(fixture.rootIdentity, makeRootIdentity());
  assert.deepEqual(fixture.expectedTermination, makeCompleteTermination(fixture.rootIdentity));
  assert.equal(watchdogState.armed, watchdogsBefore.armed + 1);
  assert.equal(watchdogState.cleared, watchdogsBefore.cleared + 1);
  assert.equal(watchdogState.fired, watchdogsBefore.fired);
}

async function runTerminationFailureCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeValidFailureTermination,
  });
  const result = await withWatchdog('valid termination failure/tree remains', () => (
    superviseSpawnedE2eProcess(fixture.input)
  ));

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: false,
    errors: ['e2e-lifecycle-termination-failed'],
    trigger: 'child-close',
    childExit: { code: 0, signal: null },
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.deepEqual(result.errors, ['e2e-lifecycle-termination-failed']);
  assert.deepEqual(result.termination, {
    complete: false,
    errors: [TERMINATION_FAILURE],
    treeGone: false,
    passes: 1,
    captured: [fixture.rootIdentity],
    commanded: [fixture.rootIdentity],
    reusedPids: [],
  });
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 1);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  assertLifecycleCleanup(fixture);
  assert.notStrictEqual(result.termination, fixture.expectedTermination);
  assert.equal(watchdogState.armed, watchdogsBefore.armed + 1);
  assert.equal(watchdogState.cleared, watchdogsBefore.cleared + 1);
  assert.equal(watchdogState.fired, watchdogsBefore.fired);
}

async function runTerminalReportGraceCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  fixture.input.overallDeadlineMs = 300;
  fixture.input.terminalGraceMs = 200;
  fixture.input.sampleIntervalMs = 100;
  overrideStrictInitialOwnership(fixture);
  fixture.input.probeTerminalReport = () => {
    fixture.calls.probe += 1;
    return true;
  };

  const result = await withWatchdog('terminal report grace expiry', async () => {
    const lifecyclePromise = superviseSpawnedE2eProcess(fixture.input);
    const outerDeadlineTimer = await waitForFakeTimerRecord(
      fixture,
      'terminal report outer deadline',
      (record) => record.delay === fixture.input.overallDeadlineMs,
    );
    const graceTimer = await waitForFakeTimerRecord(
      fixture,
      'terminal report grace',
      (record) => (
        record.delay === fixture.input.terminalGraceMs
        && record.handle !== outerDeadlineTimer.handle
      ),
    );
    assert.equal(outerDeadlineTimer.active, true);
    assert.equal(graceTimer.active, true);
    fixture.scheduler.fire(graceTimer.handle);
    return lifecyclePromise;
  });

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: true,
    errors: [],
    trigger: 'terminal-report-grace-expired',
    childExit: null,
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.probe, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  assertLifecycleCleanup(fixture, [
    {
      handle: 1,
      delay: 300,
      active: false,
      cleared: true,
      fired: false,
    },
    {
      handle: 2,
      delay: 200,
      active: false,
      cleared: false,
      fired: true,
    },
    {
      handle: 3,
      delay: 100,
      active: false,
      cleared: true,
      fired: false,
    },
  ]);
  assert.equal(fixture.calls.closeListenerCounts.length, 0);
  assert.equal(fixture.calls.terminationInput.rootIdentity.pid, ROOT_PID);
  assert.deepEqual(fixture.expectedTermination, makeCompleteTermination(fixture.rootIdentity));
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runOuterDeadlineCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  fixture.input.overallDeadlineMs = 200;
  fixture.input.sampleIntervalMs = 100;
  overrideStrictInitialOwnership(fixture);
  fixture.input.probeTerminalReport = () => {
    fixture.calls.probe += 1;
    return false;
  };

  const result = await withWatchdog('outer deadline lifecycle cleanup', async () => {
    const lifecyclePromise = superviseSpawnedE2eProcess(fixture.input);
    const outerDeadlineTimer = await waitForFakeTimerRecord(
      fixture,
      'outer deadline',
      (record) => record.delay === fixture.input.overallDeadlineMs,
    );
    const sampleDelayTimer = await waitForFakeTimerRecord(
      fixture,
      'sample delay',
      (record) => (
        record.delay === fixture.input.sampleIntervalMs
        && record.handle !== outerDeadlineTimer.handle
      ),
    );
    assert.equal(outerDeadlineTimer.active, true);
    assert.equal(sampleDelayTimer.active, true);
    fixture.scheduler.fire(outerDeadlineTimer.handle);
    return lifecyclePromise;
  });

  // This is lifecycle cleanup completion only; the later runner verdict must make outer-deadline red.
  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: true,
    errors: [],
    trigger: 'outer-deadline',
    childExit: null,
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.probe, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  assertLifecycleCleanup(fixture, [
    {
      handle: 1,
      delay: 200,
      active: false,
      cleared: false,
      fired: true,
    },
    {
      handle: 2,
      delay: 100,
      active: false,
      cleared: true,
      fired: false,
    },
  ]);
  assert.equal(fixture.calls.closeListenerCounts.length, 0);
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runChildErrorCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  overrideStrictInitialOwnership(fixture, () => {
    fixture.calls.closeListenerCounts.push({
      close: fixture.child.listenerCount('close'),
      error: fixture.child.listenerCount('error'),
    });
    fixture.child.emit('error', new Error('do-not-leak-secret'));
  });

  const result = await withWatchdog('child error', () => (
    superviseSpawnedE2eProcess(fixture.input)
  ));

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: false,
    errors: ['e2e-lifecycle-child-error'],
    trigger: 'child-error',
    childExit: null,
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  const serializedResult = JSON.stringify(result);
  assert.equal(serializedResult.includes('do-not-leak-secret'), false);
  assert.equal(serializedResult.includes('Error: do-not-leak-secret'), false);
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  assertLifecycleCleanup(fixture);
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runInitializationOwnershipFailureRecoveryCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  fixture.input.overallDeadlineMs = 300;
  fixture.input.sampleIntervalMs = 100;
  fixture.input.initializeOwnershipImpl = () => {
    fixture.calls.initialize += 1;
    if (fixture.calls.initialize === 1) {
      return makeOwnershipFailureEnvelope();
    }

    queueMicrotask(() => {
      fixture.calls.closeListenerCounts.push({
        close: fixture.child.listenerCount('close'),
        error: fixture.child.listenerCount('error'),
      });
      fixture.child.emit('close', 0, null);
    });
    return makeCompleteInitialOwnership(fixture.rootIdentity);
  };

  const result = await withWatchdog('initialization ownership failure then recovery', async () => {
    const lifecyclePromise = superviseSpawnedE2eProcess(fixture.input);
    const outerDeadlineTimer = await waitForFakeTimerRecord(
      fixture,
      'initialization failure outer deadline',
      (record) => record.delay === fixture.input.overallDeadlineMs,
    );
    const firstSampleDelayTimer = await waitForFakeTimerRecord(
      fixture,
      'initialization failure retry sample delay',
      (record) => (
        record.delay === fixture.input.sampleIntervalMs
        && record.handle !== outerDeadlineTimer.handle
      ),
    );
    fixture.scheduler.fire(firstSampleDelayTimer.handle);
    return lifecyclePromise;
  });

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: false,
    errors: ['e2e-lifecycle-ownership-incomplete'],
    trigger: 'child-close',
    childExit: { code: 0, signal: null },
    ownershipComplete: false,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.calls.initialize, 2);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 2);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  assertLifecycleCleanup(fixture, [
    {
      handle: 1,
      delay: 300,
      active: false,
      cleared: true,
      fired: false,
    },
    {
      handle: 2,
      delay: 100,
      active: false,
      cleared: false,
      fired: true,
    },
  ]);
  assert.deepEqual(fixture.expectedTermination, makeCompleteTermination(fixture.rootIdentity));
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runSampleOwnershipFailureAfterInitializationCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  fixture.input.overallDeadlineMs = 300;
  fixture.input.sampleIntervalMs = 100;
  fixture.input.initializeOwnershipImpl = () => {
    fixture.calls.initialize += 1;
    return makeCompleteInitialOwnership(fixture.rootIdentity);
  };
  fixture.input.sampleOwnershipImpl = () => {
    fixture.calls.sample += 1;
    queueMicrotask(() => {
      fixture.calls.closeListenerCounts.push({
        close: fixture.child.listenerCount('close'),
        error: fixture.child.listenerCount('error'),
      });
      fixture.child.emit('close', 0, null);
    });
    return makeOwnershipFailureEnvelope();
  };

  const result = await withWatchdog('sample ownership failure after initialization', async () => {
    const lifecyclePromise = superviseSpawnedE2eProcess(fixture.input);
    const outerDeadlineTimer = await waitForFakeTimerRecord(
      fixture,
      'sample failure outer deadline',
      (record) => record.delay === fixture.input.overallDeadlineMs,
    );
    const sampleDelayTimer = await waitForFakeTimerRecord(
      fixture,
      'sample failure sample delay',
      (record) => (
        record.delay === fixture.input.sampleIntervalMs
        && record.handle !== outerDeadlineTimer.handle
      ),
    );
    fixture.scheduler.fire(sampleDelayTimer.handle);
    return lifecyclePromise;
  });

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: false,
    errors: ['e2e-lifecycle-ownership-incomplete'],
    trigger: 'child-close',
    childExit: { code: 0, signal: null },
    ownershipComplete: false,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.sample, 1);
  assert.equal(fixture.calls.probe, 2);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  assertLifecycleCleanup(fixture, [
    {
      handle: 1,
      delay: 300,
      active: false,
      cleared: true,
      fired: false,
    },
    {
      handle: 2,
      delay: 100,
      active: false,
      cleared: false,
      fired: true,
    },
  ]);
  assert.deepEqual(fixture.expectedTermination, makeCompleteTermination(fixture.rootIdentity));
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runOuterTimerSetupFailureCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  let timerSetupCalls = 0;
  fixture.input.setTimeoutImpl = () => {
    timerSetupCalls += 1;
    throw new Error('timer-secret');
  };

  const result = await withWatchdog('outer timer setup failure', () => (
    superviseSpawnedE2eProcess(fixture.input)
  ));

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: false,
    errors: ['e2e-lifecycle-timer-failed'],
    trigger: 'outer-deadline',
    childExit: null,
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.equal(timerSetupCalls, 1);
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 1);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  const serializedResult = JSON.stringify(result);
  assert.equal(serializedResult.includes('timer-secret'), false);
  assert.equal(serializedResult.includes('Error: timer-secret'), false);
  assert.deepEqual(fixture.scheduler.records(), []);
  assert.deepEqual(fixture.scheduler.activeTimers(), []);
  assert.deepEqual(fixture.scheduler.clearedTimers(), []);
  assert.deepEqual(fixture.scheduler.callbacksFired(), []);
  assert.equal(fixture.child.listenerCount('close'), 0);
  assert.equal(fixture.child.listenerCount('error'), 0);
  assert.equal(result.termination.treeGone, true);
  assert.deepEqual(fixture.expectedTermination, makeCompleteTermination(fixture.rootIdentity));
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runDuplicateAndLateChildCallbacksCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  let capturedCloseListener;
  let capturedErrorListener;
  fixture.input.initializeOwnershipImpl = () => {
    fixture.calls.initialize += 1;
    const closeListeners = fixture.child.listeners('close');
    const errorListeners = fixture.child.listeners('error');
    assert.equal(closeListeners.length, 1);
    assert.equal(errorListeners.length, 1);
    capturedCloseListener = closeListeners[0];
    capturedErrorListener = errorListeners[0];
    queueMicrotask(() => {
      fixture.calls.closeListenerCounts.push({
        close: fixture.child.listenerCount('close'),
        error: fixture.child.listenerCount('error'),
      });
      fixture.child.emit('close', 0, null);
      fixture.child.emit('error', new Error('duplicate-secret'));
    });
    return makeCompleteInitialOwnership(fixture.rootIdentity);
  };

  const result = await withWatchdog('duplicate and late child callbacks', () => (
    superviseSpawnedE2eProcess(fixture.input)
  ));

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: true,
    errors: [],
    trigger: 'child-close',
    childExit: { code: 0, signal: null },
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.equal(typeof capturedCloseListener, 'function');
  assert.equal(typeof capturedErrorListener, 'function');
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 1);
  assert.equal(fixture.calls.terminate, 1);
  assertNoProcessCalls(fixture);
  assertTerminationInput(fixture);
  const resultBeforeLateCallbacks = JSON.parse(JSON.stringify(result));
  const timerRecordsBeforeLateCallbacks = fixture.scheduler.records();
  assert.equal(fixture.child.listenerCount('close'), 0);
  assert.equal(fixture.child.listenerCount('error'), 0);
  assert.deepEqual(fixture.scheduler.activeTimers(), []);
  assert.doesNotThrow(() => {
    capturedCloseListener(0, null);
    capturedErrorListener(new Error('duplicate-secret'));
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(result, resultBeforeLateCallbacks);
  assert.equal(JSON.stringify(result).includes('duplicate-secret'), false);
  assert.equal(fixture.calls.terminate, 1);
  assert.deepEqual(fixture.scheduler.records(), timerRecordsBeforeLateCallbacks);
  assertLifecycleCleanup(fixture);
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runHostileInputRejectionCase() {
  const watchdogsBefore = { ...watchdogState };
  await withWatchdog('hostile input rejection', async () => {
    const variants = [
      () => {
        const fixture = makeLifecycleInput({
          terminationFactory: makeCompleteTermination,
        });
        return {
          fixture,
          input: new Proxy(fixture.input, {}),
          assertVariant: () => {},
        };
      },
      () => {
        const fixture = makeLifecycleInput({
          terminationFactory: makeCompleteTermination,
        });
        let rootPidGetterCalls = 0;
        Object.defineProperty(fixture.input, 'rootPid', {
          configurable: true,
          enumerable: true,
          get() {
            rootPidGetterCalls += 1;
            return ROOT_PID;
          },
        });
        return {
          fixture,
          input: fixture.input,
          assertVariant: () => assert.equal(rootPidGetterCalls, 0),
        };
      },
      () => {
        const fixture = makeLifecycleInput({
          terminationFactory: makeCompleteTermination,
        });
        fixture.input[Symbol('unknown-lifecycle-key')] = true;
        return {
          fixture,
          input: fixture.input,
          assertVariant: () => {},
        };
      },
      () => {
        const fixture = makeLifecycleInput({
          terminationFactory: makeCompleteTermination,
        });
        fixture.input.snapshotOptions = new Proxy(fixture.input.snapshotOptions, {});
        return {
          fixture,
          input: fixture.input,
          assertVariant: () => {},
        };
      },
      () => {
        const fixture = makeLifecycleInput({
          terminationFactory: makeCompleteTermination,
        });
        fixture.input.child = new Proxy(fixture.child, {});
        return {
          fixture,
          input: fixture.input,
          assertVariant: () => {},
        };
      },
      () => {
        const fixture = makeLifecycleInput({
          terminationFactory: makeCompleteTermination,
        });
        fixture.input.unknownLifecycleKey = true;
        return {
          fixture,
          input: fixture.input,
          assertVariant: () => {},
        };
      },
    ];

    for (const makeVariant of variants) {
      const variant = makeVariant();
      const result = await superviseSpawnedE2eProcess(variant.input);
      assertInvalidInputResult(result);
      assertNoLifecycleSideEffects(variant.fixture);
      variant.assertVariant();
    }
  });
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runBidirectionalMutationIsolationCase() {
  const watchdogsBefore = { ...watchdogState };
  const fixture = makeLifecycleInput({
    terminationFactory: makeCompleteTermination,
  });
  fixture.input.overallDeadlineMs = 321;
  fixture.input.terminalGraceMs = 322;
  fixture.input.sampleIntervalMs = 323;
  fixture.input.maxTerminationPasses = 1;
  fixture.input.terminationPollIntervalMs = 0;

  const originalRootPid = fixture.input.rootPid;
  const originalRootIdentity = makeRootIdentity(originalRootPid);
  const originalSnapshotOptions = { ...fixture.input.snapshotOptions };
  const originalCommandOptions = { ...fixture.input.commandOptions };
  const originalBounds = {
    overallDeadlineMs: fixture.input.overallDeadlineMs,
    terminalGraceMs: fixture.input.terminalGraceMs,
    sampleIntervalMs: fixture.input.sampleIntervalMs,
    maxTerminationPasses: fixture.input.maxTerminationPasses,
    terminationPollIntervalMs: fixture.input.terminationPollIntervalMs,
  };
  let initializationRequest = null;
  let initializationPristine = null;
  let terminationPristine = null;
  let terminationReturn = null;
  let callerProbeCalls = 0;
  let callerSnapshotExecCalls = 0;
  let callerCommandExecCalls = 0;

  const cloneTerminationInput = (terminationInput) => ({
    rootIdentity: cloneIdentity(terminationInput.rootIdentity),
    previousCaptured: terminationInput.previousCaptured.map(cloneIdentity),
    snapshotOptions: { ...terminationInput.snapshotOptions },
    commandOptions: { ...terminationInput.commandOptions },
    maxPasses: terminationInput.maxPasses,
    pollIntervalMs: terminationInput.pollIntervalMs,
  });

  fixture.input.initializeOwnershipImpl = (request) => {
    fixture.calls.initialize += 1;
    initializationRequest = request;
    initializationPristine = {
      rootPid: request.rootPid,
      snapshotOptions: { ...request.snapshotOptions },
    };
    request.rootPid = originalRootPid + 11;
    request.snapshotOptions.platform = 'linux';
    request.snapshotOptions.timeoutMs = 101;
    request.snapshotOptions.execFileImpl = () => {};
    queueMicrotask(() => {
      fixture.calls.closeListenerCounts.push({
        close: fixture.child.listenerCount('close'),
        error: fixture.child.listenerCount('error'),
      });
      fixture.child.emit('close', 0, null);
    });
    return makeCompleteInitialOwnership(fixture.rootIdentity);
  };

  fixture.input.terminateImpl = (terminationInput) => {
    fixture.calls.terminate += 1;
    fixture.calls.terminationInput = terminationInput;
    terminationPristine = cloneTerminationInput(terminationInput);
    terminationInput.rootIdentity.pid = originalRootPid + 22;
    terminationInput.rootIdentity.creationToken = '20260804000000.000022-SELFTEST';
    terminationInput.previousCaptured[0].pid = originalRootPid + 23;
    terminationInput.previousCaptured[0].creationToken = '20260804000000.000023-SELFTEST';
    terminationInput.previousCaptured.push(makeRootIdentity(originalRootPid + 24));
    terminationInput.snapshotOptions.platform = 'linux';
    terminationInput.snapshotOptions.timeoutMs = 102;
    terminationInput.snapshotOptions.execFileImpl = () => {};
    terminationInput.commandOptions.platform = 'darwin';
    terminationInput.commandOptions.timeoutMs = 103;
    terminationInput.commandOptions.execFileImpl = () => {};
    terminationInput.maxPasses = 99;
    terminationInput.pollIntervalMs = 99;
    terminationReturn = makeCompleteTermination(fixture.rootIdentity);
    assertExactRecordKeys(terminationReturn, [
      'complete',
      'errors',
      'treeGone',
      'passes',
      'captured',
      'commanded',
      'reusedPids',
    ]);
    return terminationReturn;
  };

  const result = await withWatchdog('bidirectional mutation isolation', async () => {
    const lifecyclePromise = superviseSpawnedE2eProcess(fixture.input);
    fixture.input.rootPid = originalRootPid + 31;
    fixture.input.overallDeadlineMs = 901;
    fixture.input.terminalGraceMs = 902;
    fixture.input.sampleIntervalMs = 903;
    fixture.input.maxTerminationPasses = 9;
    fixture.input.terminationPollIntervalMs = 9;
    fixture.input.probeTerminalReport = () => {
      callerProbeCalls += 1;
      return true;
    };
    fixture.input.snapshotOptions.platform = 'linux';
    fixture.input.snapshotOptions.timeoutMs = 104;
    fixture.input.snapshotOptions.execFileImpl = () => {
      callerSnapshotExecCalls += 1;
    };
    fixture.input.commandOptions.platform = 'darwin';
    fixture.input.commandOptions.timeoutMs = 105;
    fixture.input.commandOptions.execFileImpl = () => {
      callerCommandExecCalls += 1;
    };
    return lifecyclePromise;
  });

  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.deepEqual(result, {
    complete: true,
    errors: [],
    trigger: 'child-close',
    childExit: { code: 0, signal: null },
    ownershipComplete: true,
    rootIdentity: fixture.rootIdentity,
    captured: [fixture.rootIdentity],
    reusedPids: [],
    termination: fixture.expectedTermination,
  });
  assert.equal(initializationRequest === null, false);
  assert.equal(initializationPristine === null, false);
  assert.equal(terminationPristine === null, false);
  assert.equal(terminationReturn === null, false);
  assert.notStrictEqual(initializationRequest, fixture.input);
  assert.notStrictEqual(initializationRequest.snapshotOptions, fixture.input.snapshotOptions);
  assert.notStrictEqual(initializationRequest.snapshotOptions, originalSnapshotOptions);
  assert.equal(initializationRequest.rootPid, originalRootPid + 11);
  assert.equal(initializationRequest.snapshotOptions.platform, 'linux');
  assert.deepEqual(initializationPristine, {
    rootPid: originalRootPid,
    snapshotOptions: originalSnapshotOptions,
  });
  assert.deepEqual(terminationPristine, {
    rootIdentity: originalRootIdentity,
    previousCaptured: [originalRootIdentity],
    snapshotOptions: originalSnapshotOptions,
    commandOptions: originalCommandOptions,
    maxPasses: originalBounds.maxTerminationPasses,
    pollIntervalMs: originalBounds.terminationPollIntervalMs,
  });
  assert.notStrictEqual(terminationPristine.rootIdentity, fixture.rootIdentity);
  assert.notStrictEqual(terminationPristine.previousCaptured[0], fixture.rootIdentity);
  assert.notStrictEqual(terminationReturn, fixture.expectedTermination);
  assert.deepEqual(terminationReturn, makeCompleteTermination(fixture.rootIdentity));
  assert.equal(fixture.calls.initialize, 1);
  assert.equal(fixture.calls.sample, 0);
  assert.equal(fixture.calls.probe, 1);
  assert.equal(fixture.calls.terminate, 1);
  assert.equal(callerProbeCalls, 0);
  assert.equal(callerSnapshotExecCalls, 0);
  assert.equal(callerCommandExecCalls, 0);
  assertNoProcessCalls(fixture);
  assert.deepEqual(fixture.calls.closeListenerCounts, [{ close: 1, error: 1 }]);
  assert.equal(fixture.scheduler.setTimeoutCalls(), 1);
  assert.equal(fixture.scheduler.clearTimeoutCalls(), 1);
  assert.equal(fixture.scheduler.records()[0].delay, originalBounds.overallDeadlineMs);
  assertLifecycleCleanup(fixture, [{
    handle: 1,
    delay: originalBounds.overallDeadlineMs,
    active: false,
    cleared: true,
    fired: false,
  }]);
  assert.deepEqual(fixture.rootIdentity, originalRootIdentity);
  assert.deepEqual(fixture.expectedTermination, makeCompleteTermination(fixture.rootIdentity));
  assert.equal(result.rootIdentity === fixture.rootIdentity, false);
  assert.equal(result.captured[0] === fixture.rootIdentity, false);
  assert.equal(result.termination === terminationReturn, false);

  const fixtureRootBeforeResultMutation = cloneIdentity(fixture.rootIdentity);
  const expectedTerminationBeforeResultMutation = makeCompleteTermination(fixture.rootIdentity);
  const initializationPristineBeforeResultMutation = {
    rootPid: initializationPristine.rootPid,
    snapshotOptions: { ...initializationPristine.snapshotOptions },
  };
  const terminationPristineBeforeResultMutation = cloneTerminationInput(terminationPristine);
  result.rootIdentity.pid = originalRootPid + 41;
  result.captured[0].pid = originalRootPid + 42;
  result.captured.push(makeRootIdentity(originalRootPid + 43));
  result.termination.errors.length = 0;
  result.termination.treeGone = false;
  result.termination.captured[0].pid = originalRootPid + 44;
  result.termination.commanded[0].pid = originalRootPid + 45;
  assert.deepEqual(fixture.rootIdentity, fixtureRootBeforeResultMutation);
  assert.deepEqual(fixture.expectedTermination, expectedTerminationBeforeResultMutation);
  assert.deepEqual(initializationPristine, initializationPristineBeforeResultMutation);
  assert.deepEqual(terminationPristine, terminationPristineBeforeResultMutation);
  assertWatchdogClearedWithoutFiring(watchdogsBefore);
}

async function runComposedFailedSampleThenCleanTreeCase() {
  const root = makeRootIdentity(ROOT_PID, '20261109000000.000000+000');
  const other = makeRootIdentity(ROOT_PID + 90, '20261109000001.000000+000');
  const timeout = new Error('SELFTEST_PRIVATE_TIMEOUT');
  timeout.code = 'ETIMEDOUT';
  const fixture = makeComposedOwnershipFixture([
    composedCsv(composedRow(root)),
    timeout,
    composedCsv(composedRow(root), composedRow(root)),
    composedCsv(composedRow(other)),
  ]);
  const { result, lines } = await captureLifecycleDiagnostics(() => finishComposedOwnership(fixture, 3));
  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.equal(result.complete, false);
  assert.equal(result.ownershipComplete, false);
  assert.deepEqual(result.errors, ['e2e-lifecycle-ownership-incomplete']);
  assert.equal(result.termination.complete, true);
  assert.equal(result.termination.treeGone, true);
  assert.deepEqual(result.termination.commanded, []);
  assert.equal(fixture.calls.commandExecFile, 0);
  assert.equal(fixture.calls.snapshotExecFile, 5);
  assert.deepEqual(lines, [
    ['[e2e-runner-lifecycle] ownership-first-failure phase=sample code=snapshot-command-timeout'],
    ['[e2e-runner-lifecycle] ownership-summary initializationAttempts=1 sampleAttempts=3 failures=2 firstPhase=sample firstCode=snapshot-command-timeout ownershipComplete=false'],
  ]);
  assertComposedOwnershipCleanup(fixture, 3);
}

async function runComposedReuseAndLiveIdentityCase() {
  const root = makeRootIdentity(ROOT_PID, '20261109000000.000000+000');
  const child = makeRootIdentity(ROOT_PID + 1, '20261109000001.000000+000');
  const ownedGrandchild = makeRootIdentity(ROOT_PID + 2, '20261109000002.000000+000');
  const replacementRoot = makeRootIdentity(ROOT_PID, '20261109000003.000000+000');
  const replacementChild = makeRootIdentity(ROOT_PID + 1, '20261109000004.000000+000');
  const replacementDescendant = makeRootIdentity(ROOT_PID + 3, '20261109000005.000000+000');
  const fixture = makeComposedOwnershipFixture([
    composedCsv(composedRow(root), composedRow(child, root.pid)),
    composedCsv(composedRow(root), composedRow(child, root.pid), composedRow(ownedGrandchild, child.pid)),
    composedCsv(composedRow(replacementRoot), composedRow(replacementChild, root.pid), composedRow(replacementDescendant, child.pid)),
  ]);
  const samples = [];
  fixture.input.sampleOwnershipImpl = async (input) => {
    const sample = await sampleSpawnedProcessOwnership(input);
    samples.push(sample);
    return sample;
  };
  const { result, lines } = await captureLifecycleDiagnostics(() => finishComposedOwnership(fixture, 2));
  assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
  assert.equal(result.complete, true);
  assert.equal(result.ownershipComplete, true);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].rootPresent, true);
  assert.deepEqual(samples[0].newlyCaptured, [ownedGrandchild]);
  assert.equal(samples[1].rootPresent, false);
  assert.deepEqual(samples[1].reusedPids, [root.pid, child.pid]);
  assert.deepEqual(result.captured, [root, child, ownedGrandchild]);
  assert.deepEqual(result.reusedPids, [root.pid, child.pid]);
  assert.equal(result.termination.treeGone, true);
  assert.deepEqual(result.termination.commanded, []);
  assert.equal(fixture.calls.commandExecFile, 0);
  assert.deepEqual(lines, [
    ['[e2e-runner-lifecycle] ownership-summary initializationAttempts=1 sampleAttempts=2 failures=0 firstPhase=none firstCode=none ownershipComplete=true'],
  ]);
  assertComposedOwnershipCleanup(fixture, 2);
}

async function runComposedMissingAndAmbiguousIdentityCase() {
  const root = makeRootIdentity(ROOT_PID, '20261109000000.000000+000');
  const other = makeRootIdentity(ROOT_PID + 90, '20261109000001.000000+000');
  for (const [badTable, code] of [
    [composedCsv(`SELFTEST,,0,${root.pid}`), 'snapshot-parse-invalid-creation-token'],
    [composedCsv(composedRow(root), composedRow(root)), 'snapshot-parse-duplicate-pid'],
  ]) {
    const fixture = makeComposedOwnershipFixture([
      composedCsv(composedRow(root)), badTable, composedCsv(composedRow(other)),
    ]);
    const { result, lines } = await captureLifecycleDiagnostics(() => finishComposedOwnership(fixture, 2));
    assertExactRecordKeys(result, LIFECYCLE_RESULT_KEYS);
    assert.equal(result.complete, false);
    assert.equal(result.ownershipComplete, false);
    assert.deepEqual(result.errors, ['e2e-lifecycle-ownership-incomplete']);
    assert.equal(result.termination.complete, true);
    assert.equal(result.termination.treeGone, true);
    assert.deepEqual(result.termination.commanded, []);
    assert.equal(fixture.calls.commandExecFile, 0);
    assert.deepEqual(lines, [
      [`[e2e-runner-lifecycle] ownership-first-failure phase=sample code=${code}`],
      [`[e2e-runner-lifecycle] ownership-summary initializationAttempts=1 sampleAttempts=2 failures=1 firstPhase=sample firstCode=${code} ownershipComplete=false`],
    ]);
    assertComposedOwnershipCleanup(fixture, 2);
  }
}

async function runDiagnosticFallbackAndLoggerFailureCase() {
  const fixture = makeLifecycleInput({ terminationFactory: makeCompleteTermination });
  fixture.input.initializeOwnershipImpl = () => {
    queueMicrotask(() => fixture.child.emit('close', 0, null));
    const result = makeOwnershipFailureEnvelope();
    result.errors = ['SELFTEST_PRIVATE_FOREIGN_ERROR'];
    return result;
  };
  const { result, lines } = await captureLifecycleDiagnostics(() => superviseSpawnedE2eProcess(fixture.input));
  assert.equal(result.complete, false);
  assert.equal(result.ownershipComplete, false);
  assert.deepEqual(lines, [
    ['[e2e-runner-lifecycle] ownership-first-failure phase=initialize code=ownership-envelope-invalid'],
    ['[e2e-runner-lifecycle] ownership-summary initializationAttempts=1 sampleAttempts=0 failures=1 firstPhase=initialize firstCode=ownership-envelope-invalid ownershipComplete=false'],
  ]);
  assertLifecycleCleanup(fixture);

  const throwingFixture = makeLifecycleInput({ terminationFactory: makeCompleteTermination });
  throwingFixture.input.initializeOwnershipImpl = () => {
    queueMicrotask(() => throwingFixture.child.emit('close', 0, null));
    throw new Error('SELFTEST_PRIVATE_SAMPLER_EXCEPTION');
  };
  const thrown = await captureLifecycleDiagnostics(() => superviseSpawnedE2eProcess(throwingFixture.input));
  assert.equal(thrown.result.ownershipComplete, false);
  assert.match(thrown.lines[0][0], /phase=initialize code=sampler-exception$/);
  assert.equal(JSON.stringify(thrown.lines).includes('SELFTEST_PRIVATE'), false);
  // A synchronous throw reaches the delay before the queued close; that close clears both timers.
  const synchronousThrowTimers = [
    { handle: 1, delay: 100, active: false, cleared: true, fired: false },
    { handle: 2, delay: 100, active: false, cleared: true, fired: false },
  ];
  assertLifecycleCleanup(throwingFixture, synchronousThrowTimers);

  const makeLoggerComparisonFixture = (mode) => {
    const comparisonFixture = makeLifecycleInput({ terminationFactory: makeCompleteTermination });
    if (mode !== 'success') {
      comparisonFixture.input.initializeOwnershipImpl = () => {
        queueMicrotask(() => comparisonFixture.child.emit('close', 0, null));
        if (mode === 'throw') throw new Error('SELFTEST_PRIVATE_SAMPLER_EXCEPTION');
        return makeOwnershipFailureEnvelope();
      };
    }
    return comparisonFixture;
  };
  for (const mode of ['success', 'failure', 'throw']) {
    const baselineFixture = makeLoggerComparisonFixture(mode);
    const baseline = await captureLifecycleDiagnostics(() => superviseSpawnedE2eProcess(baselineFixture.input));
    const loggingFixture = makeLoggerComparisonFixture(mode);
    const originalError = console.error;
    let loggerCalls = 0;
    console.error = () => { loggerCalls += 1; throw new Error('SELFTEST_PRIVATE_LOGGER_EXCEPTION'); };
    try {
      const logged = await superviseSpawnedE2eProcess(loggingFixture.input);
      assert.deepEqual(logged, baseline.result);
      assert.equal(logged.complete, mode === 'success');
      assert.equal(logged.ownershipComplete, mode === 'success');
      assert.equal(loggerCalls, baseline.lines.length);
      assert.equal(loggerCalls, mode === 'success' ? 1 : 2);
      const expectedTimers = mode === 'throw' ? synchronousThrowTimers : undefined;
      assertLifecycleCleanup(baselineFixture, expectedTimers);
      assertLifecycleCleanup(loggingFixture, expectedTimers);
      assertNoProcessCalls(baselineFixture);
      assertNoProcessCalls(loggingFixture);
    } finally {
      console.error = originalError;
    }
  }
}

async function runControlFailureDiagnosticsCase() {
  const fixture = makeLifecycleInput({ terminationFactory: makeCompleteTermination });
  fixture.input.setTimeoutImpl = () => { throw new Error('SELFTEST_PRIVATE_TIMER_EXCEPTION'); };
  const { result, lines } = await captureLifecycleDiagnostics(() => superviseSpawnedE2eProcess(fixture.input));
  assert.equal(result.complete, false);
  assert.deepEqual(result.errors, ['e2e-lifecycle-timer-failed']);
  assert.equal(result.ownershipComplete, true);
  assert.deepEqual(lines, [
    ['[e2e-runner-lifecycle] ownership-first-failure phase=control-outer-timer code=timer-exception'],
    ['[e2e-runner-lifecycle] ownership-summary initializationAttempts=1 sampleAttempts=0 failures=1 firstPhase=control-outer-timer firstCode=timer-exception ownershipComplete=true'],
  ]);
  assertLifecycleCleanup(fixture, []);
}

function makeHandleLeaseFixture(overrides = {}) {
  const actions = [];
  const handles = [];
  const owner = createE2eProcessHandleLeaseOwner({
    openProcess(pid) {
      actions.push(['open', pid]);
      const handle = { pid, close() { actions.push(['unexpected-close']); } };
      handles.push(handle);
      return handle;
    },
    retireChild(child, code) { actions.push(['retire', child, code]); },
    onFailure(code) { actions.push(['failure', code]); },
    ...overrides,
  });
  return { owner, actions, handles };
}

function runHandleLeaseConfigurationCase() {
  for (const key of ['openProcess', 'retireChild', 'onFailure']) {
    assert.throws(() => makeHandleLeaseFixture({ [key]: null }), TypeError);
  }
  for (const limit of [0, -1, 4097, 1.5, NaN, Infinity, '1']) {
    assert.throws(() => makeHandleLeaseFixture({ limit }), TypeError);
  }
  const fixture = makeHandleLeaseFixture();
  assertExactRecordKeys(fixture.owner, ['spawn', 'snapshot']);
  assert.equal(Object.isFrozen(fixture.owner), true);
  const snapshot = fixture.owner.snapshot();
  assertExactRecordKeys(snapshot, ['limit', 'retained', 'inFlight', 'spawnCalls', 'spawnThrows',
    'acquisitionAttempts', 'noPidCalls', 'idempotentReuses', 'failed', 'failureCode',
    'retirementAttempts', 'retirementFailed', 'reportingFailed', 'refusedCalls']);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.limit, 4096);
  assert.equal(snapshot.retained, 0);
  assert.equal(snapshot.failed, false);
  assert.equal(snapshot.failureCode, null);
  assert.throws(() => { snapshot.retained = 100; }, TypeError);
  assert.deepEqual(fixture.actions, []);
}

async function runHandleLeaseTimingAndCallCase() {
  const child = { pid: undefined };
  const argument = { original: true };
  const result = { rawResult: true };
  const order = [];
  let yielded = false;
  const fixture = makeHandleLeaseFixture({ openProcess(pid) {
    order.push('open');
    assert.equal(pid, 8101);
    assert.equal(yielded, false);
    assert.equal(fixture.owner.snapshot().inFlight, 1);
    return { native: true };
  } });
  const actual = fixture.owner.spawn(function (...args) {
    order.push('raw');
    assert.strictEqual(this, child);
    assert.strictEqual(args[0], argument);
    assert.equal(args[1], undefined);
    assert.equal(args[2], 'literal');
    assert.equal(args.length, 3);
    this.pid = 8101;
    queueMicrotask(() => { yielded = true; });
    return result;
  }, child, [argument, undefined, 'literal']);
  order.push('returned');
  assert.strictEqual(actual, result);
  assert.deepEqual(order, ['raw', 'open', 'returned']);
  assert.equal(yielded, false);
  assert.equal(fixture.owner.snapshot().retained, 1);
  assert.equal(fixture.owner.snapshot().inFlight, 0);
  await Promise.resolve();
  assert.equal(yielded, true);
}

function runHandleLeaseOriginalFailureCase() {
  const fixture = makeHandleLeaseFixture({ limit: 1 });
  const original = new Error('CONTROLLED_ORIGINAL_SPAWN_ERROR');
  assert.throws(() => fixture.owner.spawn(function () { throw original; }, {}, []), error => error === original);
  assert.equal(fixture.owner.snapshot().spawnThrows, 1);
  assert.equal(fixture.owner.snapshot().failed, false);
  assert.equal(fixture.owner.snapshot().inFlight, 0);
  for (const pid of [undefined, null]) {
    const child = { pid };
    const result = { noPid: pid };
    assert.strictEqual(fixture.owner.spawn(function () { return result; }, child, []), result);
  }
  assert.deepEqual(fixture.actions, []);
  assert.equal(fixture.owner.snapshot().noPidCalls, 2);
  assert.equal(fixture.owner.snapshot().acquisitionAttempts, 0);
  assert.equal(fixture.owner.spawn(function () { this.pid = 8102; return 0; }, {}, []), 0);
  assert.equal(fixture.owner.snapshot().retained, 1);
}

function runHandleLeaseCreatedThenThrowCase() {
  for (const unreadablePid of [false, true]) {
    const child = {};
    const original = new Error('CONTROLLED_CREATED_CHILD_THROW');
    let retired;
    let reported;
    const fixture = makeHandleLeaseFixture({
      retireChild(actual) { retired = actual; }, onFailure(code) { reported = code; },
    });
    assert.throws(() => fixture.owner.spawn(function () {
      if (unreadablePid) Object.defineProperty(this, 'pid', { get() { throw new Error('CONTROLLED_PID_READ'); } });
      else this.pid = 8111;
      throw original;
    }, child, []), error => error === original);
    assert.strictEqual(retired, child);
    assert.equal(reported, 'e2e-handle-lease-spawn-threw');
    assert.equal(fixture.owner.snapshot().failed, true);
    assert.equal(fixture.owner.snapshot().retirementAttempts, 1);
    assert.equal(fixture.owner.snapshot().retained, 0);
    assert.equal(fixture.owner.snapshot().acquisitionAttempts, 0);
    assert.equal(fixture.owner.snapshot().inFlight, 0);
  }
  const fixture = makeHandleLeaseFixture({ limit: 1 });
  const child = { pid: 8112 };
  fixture.owner.spawn(() => 0, child, []);
  const original = new Error('CONTROLLED_ALREADY_LEASED_THROW');
  assert.throws(() => fixture.owner.spawn(() => { throw original; }, child, []), error => error === original);
  assert.equal(fixture.owner.snapshot().failed, false);
  assert.equal(fixture.owner.snapshot().retained, 1);
  assert.equal(fixture.owner.snapshot().retirementAttempts, 0);
  assert.deepEqual(fixture.actions, [['open', 8112]]);
}

function runHandleLeaseRetentionAndIdempotenceCase() {
  const fixture = makeHandleLeaseFixture({ limit: 2 });
  const child = new EventEmitter();
  child.pid = 8103;
  const before = fixture.owner.snapshot();
  const result = {};
  assert.strictEqual(fixture.owner.spawn(() => result, child, []), result);
  child.exitCode = 0;
  child._handle = null;
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
  assert.strictEqual(fixture.owner.spawn(() => undefined, child, []), undefined);
  assert.equal(child.listenerCount('exit'), 0);
  assert.equal(child.listenerCount('close'), 0);
  assert.equal(fixture.owner.snapshot().retained, 1);
  assert.equal(fixture.owner.snapshot().acquisitionAttempts, 1);
  assert.equal(fixture.owner.snapshot().idempotentReuses, 1);
  assert.equal(before.retained, 0, 'old immutable snapshots do not change');
  const distinctChild = { pid: child.pid };
  fixture.owner.spawn(() => null, distinctChild, []);
  assert.equal(fixture.owner.snapshot().retained, 2, 'leases are keyed by actual child, not a reusable PID');
  assert.equal(fixture.handles.length, 2);
  assert.deepEqual(fixture.actions, [['open', 8103], ['open', 8103]]);
}

function runHandleLeaseChangedChildCase() {
  const fixture = makeHandleLeaseFixture({ limit: 1 });
  const child = { pid: 8104 };
  fixture.owner.spawn(() => 0, child, []);
  assert.throws(() => fixture.owner.spawn(function () { this.pid = 8105; return 0; }, child, []),
    { code: 'e2e-handle-lease-child-changed' });
  assert.equal(fixture.owner.snapshot().retained, 1);
  assert.equal(fixture.owner.snapshot().acquisitionAttempts, 1);
  assert.deepEqual(fixture.actions.slice(1), [['retire', child, 'e2e-handle-lease-child-changed'],
    ['failure', 'e2e-handle-lease-child-changed']]);
}

function runHandleLeaseCapacityCase() {
  const fixture = makeHandleLeaseFixture({ limit: 1 });
  const child = { pid: 8106 };
  fixture.owner.spawn(() => 0, child, []);
  fixture.owner.spawn(() => 1, child, []);
  let rawCalls = 0;
  assert.throws(() => fixture.owner.spawn(() => { rawCalls += 1; }, {}, []),
    { code: 'e2e-handle-lease-limit' });
  assert.equal(rawCalls, 0, 'capacity is refused before raw spawn');
  assert.equal(fixture.owner.snapshot().retained, 1);
  assert.equal(fixture.owner.snapshot().spawnCalls, 2);
  assert.equal(fixture.owner.snapshot().retirementAttempts, 0);
  assert.deepEqual(fixture.actions, [['open', 8106], ['failure', 'e2e-handle-lease-limit']]);
}

function runHandleLeaseAcquisitionRefusalCase() {
  const invalidHandles = [null, undefined, false, 0, 0n, -1, -1n, NaN,
    Promise.resolve({ native: true }), { then() {} }, new Proxy({}, {})];
  for (const mode of [...invalidHandles.map(handle => () => handle), () => { throw new Error('PRIVATE_NATIVE_ERROR'); }]) {
    const child = { pid: undefined, originalOwnership: {} };
    const order = [];
    const fixture = makeHandleLeaseFixture({ openProcess(pid) {
      assert.equal(pid, 8107); order.push('open'); return mode();
    }, retireChild(actual, code) {
      assert.strictEqual(actual, child);
      assert.equal(code, 'e2e-handle-lease-acquire-failed');
      assert.ok(actual.originalOwnership); order.push('retire');
    }, onFailure(code) { order.push(code); } });
    assert.throws(() => fixture.owner.spawn(function () { this.pid = 8107; return 'must-not-return'; }, child, []),
      { code: 'e2e-handle-lease-acquire-failed', message: 'e2e-handle-lease-acquire-failed' });
    assert.deepEqual(order, ['open', 'retire', 'e2e-handle-lease-acquire-failed']);
    assert.equal(fixture.owner.snapshot().failed, true);
    assert.equal(fixture.owner.snapshot().retained, 0);
    assert.equal(fixture.owner.snapshot().retirementAttempts, 1);
    assert.equal(fixture.owner.snapshot().inFlight, 0);
  }
}

function runHandleLeaseFailureLatchCase() {
  for (const retirementThrows of [false, true]) for (const reportingThrows of [false, true]) {
    const child = { pid: 8108 };
    let retired = 0;
    let reports = 0;
    let rawCalls = 0;
    const fixture = makeHandleLeaseFixture({ openProcess: () => null,
      retireChild(actual) { assert.strictEqual(actual, child); retired += 1; if (retirementThrows) throw new Error('PRIVATE_RETIRE_ERROR'); },
      onFailure(code) { assert.equal(code, 'e2e-handle-lease-acquire-failed'); reports += 1; if (reportingThrows) throw new Error('PRIVATE_REPORT_ERROR'); } });
    assert.throws(() => fixture.owner.spawn(() => { rawCalls += 1; return 0; }, child, []),
      { code: 'e2e-handle-lease-acquire-failed' });
    assert.throws(() => fixture.owner.spawn(() => { rawCalls += 1; return 0; }, child, []),
      { code: 'e2e-handle-lease-acquire-failed' });
    assert.equal(rawCalls, 1);
    assert.equal(retired, 1);
    assert.equal(reports, 1, 'mandatory failure callback is attempted even after retirement throws');
    assert.equal(fixture.owner.snapshot().failed, true);
    assert.equal(fixture.owner.snapshot().retirementFailed, retirementThrows);
    assert.equal(fixture.owner.snapshot().reportingFailed, reportingThrows);
    assert.equal(fixture.owner.snapshot().refusedCalls, 1);
    assert.equal(fixture.owner.snapshot().inFlight, 0);
  }
}

function runHandleLeaseReentrantCapacityCase() {
  const child = { pid: 8109 };
  const other = { pid: 8110 };
  let otherSpawns = 0;
  let reports = 0;
  const retired = [];
  let owner;
  owner = createE2eProcessHandleLeaseOwner({ limit: 1,
    openProcess() {
      assert.throws(() => owner.spawn(() => { otherSpawns += 1; }, other, []), { code: 'e2e-handle-lease-limit' });
      return { native: true };
    }, retireChild(actual) { retired.push(actual); }, onFailure() { reports += 1; } });
  assert.throws(() => owner.spawn(() => 0, child, []), { code: 'e2e-handle-lease-limit' });
  assert.equal(otherSpawns, 0);
  assert.equal(reports, 1);
  assert.deepEqual(retired, [child]);
  assert.equal(owner.snapshot().retained, 1, 'a returned native HANDLE remains retained even after reentrant failure');
  assert.equal(owner.snapshot().inFlight, 0);
  assert.equal(owner.snapshot().failed, true);
}

function runHandleLeaseInvalidCallCase() {
  for (const args of [null, {}, 'not-an-array']) {
    const fixture = makeHandleLeaseFixture();
    let called = false;
    assert.throws(() => fixture.owner.spawn(() => { called = true; }, {}, args),
      { code: 'e2e-handle-lease-invalid-spawn' });
    assert.equal(called, false);
    assert.equal(fixture.owner.snapshot().spawnCalls, 0);
    assert.deepEqual(fixture.actions, [['failure', 'e2e-handle-lease-invalid-spawn']]);
  }
  const fixture = makeHandleLeaseFixture();
  const child = {};
  assert.throws(() => fixture.owner.spawn(function () {
    return fixture.owner.spawn(() => 0, child, []);
  }, child, []), { code: 'e2e-handle-lease-reentrant-spawn' });
  assert.equal(fixture.owner.snapshot().failed, true);
  assert.equal(fixture.owner.snapshot().inFlight, 0);
  assert.deepEqual(fixture.actions, [['failure', 'e2e-handle-lease-reentrant-spawn'],
    ['retire', child, 'e2e-handle-lease-reentrant-spawn']]);
}

function controlledFixtureIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}
function controlledFixtureSameIdentity(stat, expected) {
  return Object.entries(controlledFixtureIdentity(stat)).every(([key, value]) => value === expected[key]);
}
function withControlledFixtureCleanup(stateOwner) {
  const originalRetire = stateOwner.retire.bind(stateOwner);
  try {
    const root = familyPath.resolve(stateOwner.stateDir), parent = familyPath.dirname(root);
    const samePath = (a, b) => process.platform === 'win32'
      ? familyPath.resolve(a).toLowerCase() === familyPath.resolve(b).toLowerCase() : familyPath.resolve(a) === familyPath.resolve(b);
    const initialRoot = familyFs.lstatSync(root, { bigint: true });
    const initialParent = familyFs.lstatSync(parent, { bigint: true });
    const rootIdentity = controlledFixtureIdentity(initialRoot), parentIdentity = controlledFixtureIdentity(initialParent);
    const descriptor = JSON.parse(stateOwner.environment[E2E_RUN_STATE_ENV]);
    const marker = familyPath.join(root, '.e2e-run-owner.json');
    const initialMarker = familyFs.lstatSync(marker, { bigint: true });
    const markerIdentity = controlledFixtureIdentity(initialMarker);
    assert.ok(initialRoot.isDirectory() && !initialRoot.isSymbolicLink() && initialParent.isDirectory() && !initialParent.isSymbolicLink());
    assert.ok(samePath(familyFs.realpathSync.native(root), root) && samePath(familyFs.realpathSync.native(parent), parent));
    assert.ok(samePath(descriptor.stateDir, root) && samePath(descriptor.tempDir, parent));
    assert.deepEqual(rootIdentity, descriptor.rootIdentity);
    assert.deepEqual(markerIdentity, descriptor.markerIdentity);
    assert.match(familyPath.basename(root), /^x4forge-e2e-state-[A-Za-z0-9_-]+$/u);
    let cleaned = false;
    function checkRoot() {
      const actualParent = familyFs.lstatSync(parent, { bigint: true });
      const actualRoot = familyFs.lstatSync(root, { bigint: true });
      assert.ok(actualParent.isDirectory() && !actualParent.isSymbolicLink() && controlledFixtureSameIdentity(actualParent, parentIdentity));
      assert.ok(actualRoot.isDirectory() && !actualRoot.isSymbolicLink() && controlledFixtureSameIdentity(actualRoot, rootIdentity));
      assert.ok(samePath(familyPath.dirname(root), parent) && samePath(familyFs.realpathSync.native(parent), parent)
        && samePath(familyFs.realpathSync.native(root), root));
    }
    function checked(entry) {
      checkRoot();
      const relative = familyPath.relative(root, entry.file);
      assert.ok(!familyPath.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${familyPath.sep}`));
      const actual = familyFs.lstatSync(entry.file, { bigint: true });
      assert.ok(!actual.isSymbolicLink() && controlledFixtureSameIdentity(actual, entry.identity)
        && samePath(familyFs.realpathSync.native(entry.file), entry.file));
      if (entry.directory) assert.ok(actual.isDirectory());
      else assert.ok(actual.isFile() && actual.nlink === 1n && actual.size === entry.size && actual.mtimeNs === entry.mtimeNs);
      return actual;
    }
    stateOwner.retire = () => {
      originalRetire(); // Retirement remains mandatory even when cleanup must refuse.
      if (cleaned) return;
      checkRoot();
      const files = [], directories = [];
      let bytes = 0n, directoryCount = 0;
      function scan(folder) {
        checkRoot();
        const stat = familyFs.lstatSync(folder, { bigint: true });
        const entry = { file: folder, identity: controlledFixtureIdentity(stat), directory: true };
        checked(entry);
        directoryCount += 1;
        assert.ok(directoryCount <= 16, 'controlled-fixture-cleanup-directory-limit');
        const directory = familyFs.opendirSync(folder);
        try {
          for (let item = directory.readSync(); item !== null; item = directory.readSync()) {
            const file = familyPath.join(folder, item.name);
            const child = familyFs.lstatSync(file, { bigint: true });
            assert.ok(!child.isSymbolicLink() && samePath(familyFs.realpathSync.native(file), file));
            if (child.isDirectory()) scan(file);
            else {
              assert.ok(child.isFile() && child.nlink === 1n, 'controlled-fixture-cleanup-linked-or-special-file');
              bytes += child.size;
              files.push({ file, identity: controlledFixtureIdentity(child), directory: false, size: child.size, mtimeNs: child.mtimeNs });
              assert.ok(files.length <= 64 && bytes <= 1048576n, 'controlled-fixture-cleanup-file-or-byte-limit');
            }
          }
        } finally { directory.closeSync(); }
        directories.push(entry); // Child directories precede their parents.
      }
      scan(root);
      const markerEntry = files.find(entry => samePath(entry.file, marker));
      assert.ok(markerEntry && markerEntry.size <= 4096n && controlledFixtureSameIdentity(checked(markerEntry), markerIdentity));
      const fd = familyFs.openSync(marker, 'r');
      let record;
      try {
        assert.ok(controlledFixtureSameIdentity(familyFs.fstatSync(fd, { bigint: true }), markerIdentity));
        const buffer = Buffer.alloc(Number(markerEntry.size));
        assert.equal(familyFs.readSync(fd, buffer, 0, buffer.length, 0), buffer.length);
        record = JSON.parse(buffer.toString('utf8'));
        assert.ok(controlledFixtureSameIdentity(familyFs.fstatSync(fd, { bigint: true }), markerIdentity));
      } finally { familyFs.closeSync(fd); }
      assert.deepEqual(record, { schemaVersion: 'forge.e2e-run-state.v1', runId: stateOwner.runId,
        stateDir: root, ownerPid: process.pid, status: 'retired' });
      // Finish the complete preflight before unlinking anything, then recheck
      // every exact snapshot/root/parent immediately before each deletion.
      for (const entry of [...files, ...directories]) checked(entry);
      for (const entry of files) if (!samePath(entry.file, marker)) { checked(entry); familyFs.unlinkSync(entry.file); }
      for (const entry of directories) if (!samePath(entry.file, root)) { checked(entry); familyFs.rmdirSync(entry.file); }
      assert.deepEqual(familyFs.readdirSync(root), ['.e2e-run-owner.json']);
      checked(markerEntry);
      familyFs.unlinkSync(marker); // The retired authority marker is removed LAST.
      checkRoot();
      familyFs.rmdirSync(root);
      assert.equal(familyFs.existsSync(root), false);
      cleaned = true;
    };
    return stateOwner;
  } catch (error) {
    try { originalRetire(); } catch { console.error('[e2e-controlled-cleanup] initial-retirement-failed'); }
    throw error;
  }
}

function makeFamilyControlledFixture({ testProfile = null, beforeFamily } = {}) {
  const stateOwner = withControlledFixtureCleanup(createE2eRunStateOwner());
  try {
  beforeFamily?.(stateOwner);
  const cwd = process.cwd(), runtime = process.execPath;
  const identities = pid => ({ pid, creationToken: pid.toString(16).padStart(16, '0') });
  const handles = [];
  const nativeFor = pid => ({ self: () => identities(pid),
    open(childPid) { const handle = { pid: childPid, exitCode: 0 }; handles.push(handle); return handle; },
    identity: handle => identities(handle.pid), exitCode: handle => handle.exitCode });
  function fakeProcess(pid, ppid) {
    const actor = new EventEmitter();
    actor.pid = pid; actor.ppid = ppid; actor.execPath = runtime; actor.cwd = () => cwd; actor._exiting = false;
    actor.exitCodes = []; actor.reallyExit = code => { actor.exitCodes.push(code); for (const handle of handles) if (handle.pid === pid) handle.exitCode = code; throw new Error('CONTROLLED_NATIVE_EXIT'); };
    return actor;
  }
  function fakeModule(nextPid) {
    class ChildProcess extends EventEmitter {
      spawn(options) { this.rawOptions = options; this.rawCalls = (this.rawCalls || 0) + 1; if (!options.noPid) this.pid = nextPid; return options.rawResult; }
      kill(signal) { this.retired = signal; return true; }
    }
    return { ChildProcess };
  }
  const roles = { cli: familyPath.join(cwd, 'node_modules/@playwright/test/cli.js'),
    loader: familyPath.join(cwd, 'node_modules/playwright/lib/loader/loaderProcessEntry.js'),
    worker: familyPath.join(cwd, 'node_modules/playwright/lib/worker/workerProcessEntry.js') };
  const fp = lexical => ({ lexical, physical: lexical, identity: { dev: '1', ino: '2', birthtimeNs: '3' }, size: '1', sha256: '0'.repeat(64) });
  const extraPreloads = testProfile ? [familyPath.join(cwd, 'scripts/e2e-runner-integration.selftest.mjs')] : [];
  const catalogFactory = ({ preloadPath }) => ({ roles: Object.fromEntries(Object.entries(roles).map(([role, file]) => [role, fp(file)])),
    files: Object.fromEntries(['preload', 'runtime', 'lifecycle', 'koffi', 'koffiLoader', 'koffiPackage', 'koffiNativeEntry', 'koffiNative', 'runner', 'core']
      .map(key => [key, fp(key === 'runtime' ? runtime : preloadPath)])), extraPreloads: extraPreloads.map(fp) });
  const mainModule = fakeModule(9202);
  const family = createE2eProcessHandleLeaseFamily({ env: stateOwner.environment, cwd,
    preloadPath: familyPath.join(cwd, 'scripts/run-e2e.mjs'), runtimePath: runtime,
    extraPreloads, testProfile, nativeFactory: () => nativeFor(9201), catalogFactory,
    processObject: fakeProcess(9201, 9200), childProcessModule: mainModule });
  const ticket = family.prepareProtectedSpawn({ role: 'cli', env: stateOwner.environment });
  const marker = JSON.parse(ticket.environment[E2E_PROCESS_HANDLE_ACTOR_ENV]);
  const options = { file: runtime, args: [runtime, ...ticket.execArgv, roles.cli],
    envPairs: [`UNRELATED=keep`, `${E2E_PROCESS_HANDLE_ACTOR_ENV}=stale`], stdio: [] };
  const child = new mainModule.ChildProcess();
  const cliModule = fakeModule(9203), cliProcess = fakeProcess(9202, 9201);
  const read = (id, type) => JSON.parse(familyFs.readFileSync(familyPath.join(marker.root, `${id}.${type}.json`), 'utf8'));
  const launch = (override = {}) => {
    try {
      const result = ticket.spawn(mainModule.ChildProcess.prototype.spawn, child, [{ ...options, ...override }]);
      ticket.admit();
      return result;
    } catch (error) { ticket.cancel(); throw error; }
  };
  const activate = (override = {}) => activateE2eProcessHandleLeaseRole({ env: ticket.environment,
    argv: [runtime, roles.cli], execArgv: ticket.execArgv, processObject: cliProcess,
    nativeFactory: () => nativeFor(9202), childProcessModule: cliModule,
    verifyFingerprint: value => assert.equal(value.sha256, '0'.repeat(64)), ...override });
  return { stateOwner, family, ticket, marker, options, child, launch, activate, cliModule, cliProcess, read, handles, roles, runtime };
  } catch (error) {
    try { stateOwner.retire(); } catch { console.error('[e2e-controlled-cleanup] setup-cleanup-failed'); }
    throw error; // Never replace the original setup failure with cleanup diagnostics.
  }
}

function runFamilyIntentAndNoPidCase() {
  for (const noPid of [false, true]) {
    const f = makeFamilyControlledFixture();
    try {
      assert.equal(f.read('cli', 'intent').role, 'cli');
      assert.equal(familyFs.existsSync(familyPath.join(f.marker.root, 'cli.binding.json')), false);
      const rawResult = { unchanged: true };
      assert.strictEqual(f.launch({ noPid, rawResult }), rawResult);
      assert.equal(f.read('cli', 'binding').disposition, noPid ? 'not-created' : 'created');
      assert.equal(f.family.snapshot().owner.retained, noPid ? 0 : 1);
      assert.equal(f.family.inspect().complete, false, 'a mandatory CLI without activation/seal cannot pass');
    } finally { f.stateOwner.retire(); }
  }
}

function runFamilyCanonicalPreloadRefusalCase() {
  for (const imports of [[], ['--import', 'file:///wrong.mjs'], ['--import', 'file:///wrong.mjs', '--import', 'file:///wrong.mjs']]) {
    const f = makeFamilyControlledFixture();
    try {
      assert.throws(() => f.launch({ args: [f.runtime, ...imports, f.roles.cli] }), { code: 'e2e-handle-family-preload-mismatch' });
      assert.equal(f.child.rawCalls, undefined);
      assert.equal(f.handles.length, 0);
      assert.equal(f.family.snapshot().failed, true);
    } finally { f.stateOwner.retire(); }
  }
}

async function runFamilyActivationLeafAndSealCase() {
  const f = makeFamilyControlledFixture();
  try {
    f.launch();
    const actor = await f.activate();
    assert.strictEqual(await f.activate(), actor);
    assert.equal(actor.active, true);
    assert.equal(Object.hasOwn(actor, 'testFault'), false);
    assert.equal(f.cliProcess.emit('exit', 0), false, 'manual non-exiting emission preserves raw return');
    assert.equal(f.read('cli', 'phase').phase, 'active');
    const leaf = new f.cliModule.ChildProcess();
    const stdio = [];
    const result = {};
    const options = { file: f.runtime, args: [f.runtime, '--version'], envPairs: ['KEEP=literal', `${E2E_PROCESS_HANDLE_ACTOR_ENV.toLowerCase()}=parent`], stdio, rawResult: result };
    assert.strictEqual(leaf.spawn(options), result);
    assert.strictEqual(leaf.rawOptions.stdio, stdio);
    assert.deepEqual(leaf.rawOptions.envPairs, ['KEEP=literal']);
    assert.deepEqual(options.envPairs, ['KEEP=literal', `${E2E_PROCESS_HANDLE_ACTOR_ENV.toLowerCase()}=parent`]);
    f.cliProcess._exiting = true;
    assert.equal(f.cliProcess.emit('exit', 0), false);
    assert.equal(f.read('cli', 'phase').phase, 'sealed');
    const inspected = f.family.inspect();
    assert.equal(inspected.complete, true);
    assert.equal(inspected.actorCount, 1);
    assert.equal(inspected.recordFiles, 4);
    assert.equal(inspected.cliExitCode, 0);
    assert.equal(Object.isFrozen(inspected.errors), true);
  } finally { f.stateOwner.retire(); }
}

async function runFamilyBindingAdmissionAndStateCase() {
  const f = makeFamilyControlledFixture();
  try {
    let waits = 0, now = 0;
    const actor = await f.activate({ now: () => now, sleep: async () => { waits += 1; now += 5; f.launch(); } });
    assert.equal(waits, 1, 'entry admission waits for the parent-only binding');
    assert.equal(actor.active, true);
    const other = makeFamilyControlledFixture();
    try {
      other.launch();
      other.cliProcess.ppid = 9999;
      await assert.rejects(other.activate(), /CONTROLLED_NATIVE_EXIT/u);
      assert.ok(other.cliProcess.exitCodes.includes(86));
      assert.equal(familyFs.existsSync(familyPath.join(other.marker.root, 'cli.phase.json')), false);
    } finally { other.stateOwner.retire(); }
  } finally { f.stateOwner.retire(); }
}

async function runFamilyExitReentryAndFenceCase() {
  const f = makeFamilyControlledFixture();
  try {
    f.launch(); await f.activate();
    let nested = false, late;
    f.cliProcess.on('exit', () => {
      if (!nested) { nested = true; f.cliProcess.emit('exit', 0); }
      queueMicrotask(() => {
        const child = new f.cliModule.ChildProcess();
        try { child.spawn({ file: f.runtime, args: [f.runtime, '--version'], envPairs: [] }); }
        catch (error) { late = { child, error }; }
      });
    });
    f.cliProcess._exiting = true;
    assert.equal(f.cliProcess.emit('exit', 0), true);
    assert.equal(f.read('cli', 'phase').generation, 2);
    assert.equal(f.read('cli', 'phase').phase, 'sealed');
    await Promise.resolve();
    assert.equal(late.child.rawCalls, undefined);
    assert.ok(f.cliProcess.exitCodes.includes(86));
    assert.equal(f.family.inspect().complete, false);
  } finally { f.stateOwner.retire(); }
}

async function runFamilyExitThrowAndPrivateFaultCase() {
  const f = makeFamilyControlledFixture();
  try {
    f.launch(); await f.activate();
    const original = new Error('CONTROLLED_EXIT_LISTENER_THROW');
    f.cliProcess.on('exit', () => { throw original; });
    f.cliProcess._exiting = true;
    assert.throws(() => f.cliProcess.emit('exit', 0), error => error === original);
    assert.equal(f.read('cli', 'phase').phase, 'failed');
    assert.equal(f.family.inspect().complete, false);
  } finally { f.stateOwner.retire(); }
  const privateFixture = makeFamilyControlledFixture({ testProfile: { handleLimit: 1 } });
  try {
    privateFixture.launch();
    const actor = await privateFixture.activate();
    assert.equal(typeof actor.testFault, 'function');
    actor.testFault('acquire');
    const child = new privateFixture.cliModule.ChildProcess();
    assert.throws(() => child.spawn({ file: privateFixture.runtime, args: [privateFixture.runtime, '--version'], envPairs: [] }),
      { code: 'e2e-handle-lease-acquire-failed' });
    assert.equal(child.retired, 'SIGKILL');
    assert.ok(privateFixture.cliProcess.exitCodes.includes(86));
    assert.equal(actor.snapshot().failed, true);
  } finally { privateFixture.stateOwner.retire(); }
}

async function runFamilyLatePersistenceAndRecordRefusalCase() {
  const f = makeFamilyControlledFixture({ testProfile: { handleLimit: 1 } });
  try {
    f.launch(); const actor = await f.activate();
    f.cliProcess._exiting = true; f.cliProcess.emit('exit', 0);
    assert.equal(f.family.inspect().complete, true);
    actor.testFault('persist');
    assert.throws(() => f.cliProcess.emit('exit', 0), /CONTROLLED_NATIVE_EXIT/u);
    assert.equal(f.read('cli', 'phase').phase, 'sealed', 'persistent IO failure deliberately leaves the old seal untouched');
    const inspected = f.family.inspect();
    assert.equal(inspected.complete, false);
    assert.equal(inspected.cliExitCode, 86, 'original HANDLE status defeats the stale successful seal');
  } finally { f.stateOwner.retire(); }
  const other = makeFamilyControlledFixture();
  try {
    other.launch(); await other.activate();
    other.cliProcess._exiting = true; other.cliProcess.emit('exit', 0);
    familyFs.writeFileSync(familyPath.join(other.marker.root, 'cli.phase.json'), ' '.repeat(65537));
    assert.equal(other.family.inspect().complete, false, 'oversized records are refused before parsing');
  } finally { other.stateOwner.retire(); }
  const replaced = makeFamilyControlledFixture();
  try {
    replaced.launch(); await replaced.activate();
    replaced.cliModule.ChildProcess.prototype.spawn = () => 0;
    replaced.cliProcess._exiting = true;
    assert.throws(() => replaced.cliProcess.emit('exit', 0), /CONTROLLED_NATIVE_EXIT/u);
    assert.ok(replaced.cliProcess.exitCodes.includes(86));
    assert.equal(replaced.family.inspect().complete, false);
  } finally { replaced.stateOwner.retire(); }
}

async function runFamilyPublicSpawnAndMissingAuthorityCase() {
  const f = makeFamilyControlledFixture();
  try {
    const original = new Error('CONTROLLED_PUBLIC_SPAWN_AFTER_NATIVE_THROW');
    assert.throws(() => {
      try {
        f.ticket.spawn(function () { this.pid = 9202; return 0; }, f.child, [f.options]);
        assert.equal(familyFs.existsSync(familyPath.join(f.marker.root, 'cli.binding.json')), false);
        assert.equal(f.family.snapshot().owner.retained, 1);
        throw original; // Models public spawn or temporary-hook restoration failing.
      } catch (error) { f.ticket.cancel(); throw error; }
    }, error => error === original);
    assert.equal(f.child.retired, 'SIGKILL');
    assert.equal(familyFs.existsSync(familyPath.join(f.marker.root, 'cli.binding.json')), false);
    assert.equal(f.family.inspect().complete, false);
  } finally { f.stateOwner.retire(); }
  const other = makeFamilyControlledFixture();
  try {
    for (const value of [undefined, '']) {
      const env = { ...other.ticket.environment };
      if (value === undefined) delete env[E2E_PROCESS_HANDLE_ACTOR_ENV];
      else env[E2E_PROCESS_HANDLE_ACTOR_ENV] = value;
      await assert.rejects(other.activate({ env }), /CONTROLLED_NATIVE_EXIT/u);
    }
    assert.ok(other.cliProcess.exitCodes.includes(86));
    const inert = await other.activate({ env: {}, execArgv: [], argv: [other.runtime, other.roles.cli] });
    assert.deepEqual(inert, { active: false });
    const leaf = await other.activate({ env: {}, argv: [other.runtime, familyPath.join(process.cwd(), 'ordinary-leaf.mjs')] });
    assert.deepEqual(leaf, { active: false });
  } finally { other.stateOwner.retire(); }
}

async function runFamilyReviewedNodePrefixCase() {
  for (const [prefix, expectedCode] of [
    [['--redirect-warnings', 'warnings.log'], 'e2e-handle-family-preload-mismatch'],
    [['--unreviewed-separate-value', 'warnings.log'], 'e2e-handle-family-ambiguous-canonical-target'],
  ]) {
    const f = makeFamilyControlledFixture();
    try {
      assert.throws(() => f.launch({ args: [f.runtime, ...prefix, f.roles.cli] }), { code: expectedCode });
      assert.equal(f.child.rawCalls, undefined);
      assert.equal(f.handles.length, 0, 'concealed canonical targets refuse before process creation');
    } finally { f.stateOwner.retire(); }
  }
  const prefixed = makeFamilyControlledFixture();
  try {
    prefixed.launch({ args: [prefixed.runtime, '--redirect-warnings', 'warnings.log', ...prefixed.ticket.execArgv, prefixed.roles.cli] });
    assert.equal(prefixed.child.rawCalls, 1);
    assert.equal(prefixed.read('cli', 'binding').disposition, 'created');
  } finally { prefixed.stateOwner.retire(); }
  const leaves = makeFamilyControlledFixture();
  try {
    leaves.launch(); const actor = await leaves.activate();
    const dataArguments = [
      ['-', leaves.roles.worker], ['-e', leaves.roles.worker], ['-p', leaves.roles.worker],
      ['ordinary-leaf.mjs', '--unreviewed-separate-value', leaves.roles.worker], ['--version'],
    ];
    for (const data of dataArguments) {
      const child = new leaves.cliModule.ChildProcess();
      const args = [leaves.runtime, ...data];
      child.spawn({ file: leaves.runtime, args, envPairs: [`${E2E_PROCESS_HANDLE_ACTOR_ENV}=parent`] });
      assert.equal(child.rawCalls, 1);
      assert.strictEqual(child.rawOptions.args, args);
      assert.deepEqual(child.rawOptions.envPairs, []);
    }
    assert.equal(actor.snapshot().preparedActors, 0, 'a canonical role used only as leaf data never creates an actor intent');
    assert.equal(actor.snapshot().owner.retained, dataArguments.length);
  } finally { leaves.stateOwner.retire(); }
  const concealed = makeFamilyControlledFixture();
  try {
    await assert.rejects(concealed.activate({ env: {},
      execArgv: ['--unreviewed-separate-value', 'warnings.log', ...concealed.ticket.execArgv] }), /CONTROLLED_NATIVE_EXIT/u);
    assert.ok(concealed.cliProcess.exitCodes.includes(86), 'an owned import behind an unknown prefix cannot lose the missing-authority refusal');
  } finally { concealed.stateOwner.retire(); }
}

async function runFamilyExactFaultConsumptionCase() {
  for (const observerThrows of [false, true]) {
    const f = makeFamilyControlledFixture({ testProfile: { handleLimit: 1 } });
    try {
      f.launch(); const actor = await f.activate();
      assert.throws(() => actor.testFault('acquire', 42), { code: 'e2e-handle-family-test-profile' });
      assert.equal(actor.snapshot().failed, false);
      const child = new f.cliModule.ChildProcess();
      const witnesses = [];
      let timing;
      actor.testFault('acquire', witness => {
        witnesses.push(witness);
        timing = { rawCalls: child.rawCalls, opened: f.handles.length, retirement: child.retired ?? null };
        if (observerThrows) throw new Error('PRIVATE_OBSERVER_ERROR');
      });
      assert.throws(() => child.spawn({ file: f.runtime, args: [f.runtime, '--version'], envPairs: [] }),
        { code: 'e2e-handle-lease-acquire-failed' });
      assert.deepEqual(witnesses, [{ kind: 'acquire', stage: 'native-open', recordName: null }]);
      assert.equal(Object.isFrozen(witnesses[0]), true);
      assert.deepEqual(timing, { rawCalls: 1, opened: 2, retirement: null });
      assert.equal(child.retired, 'SIGKILL');
      assert.equal(actor.snapshot().owner.failureCode, 'e2e-handle-lease-acquire-failed');
      assert.equal(actor.snapshot().owner.retirementAttempts, 1);
      const later = new f.cliModule.ChildProcess();
      assert.throws(() => later.spawn({ file: f.runtime, args: [f.runtime, '--version'], envPairs: [] }), /CONTROLLED_NATIVE_EXIT/u);
      assert.equal(later.rawCalls, undefined);
      assert.equal(witnesses.length, 1);
      assert.ok(f.cliProcess.exitCodes.includes(86));
    } finally { f.stateOwner.retire(); }
    const p = makeFamilyControlledFixture({ testProfile: { handleLimit: 1 } });
    try {
      p.launch(); const actor = await p.activate();
      const child = new p.cliModule.ChildProcess();
      const witnesses = [];
      actor.testFault('persist', witness => {
        witnesses.push(witness);
        if (observerThrows) throw new Error('PRIVATE_OBSERVER_ERROR');
      });
      assert.throws(() => child.spawn({ file: p.runtime, args: [p.runtime, ...p.ticket.execArgv, p.roles.worker], envPairs: [] }),
        /CONTROLLED_NATIVE_EXIT/u);
      assert.deepEqual(witnesses, [{ kind: 'persist', stage: 'publish', recordName: 'child-0001.intent.json' }]);
      assert.equal(Object.isFrozen(witnesses[0]), true);
      assert.equal(child.rawCalls, undefined);
      assert.equal(p.handles.length, 1);
      assert.equal(familyFs.existsSync(familyPath.join(p.marker.root, 'child-0001.intent.json')), false);
      assert.equal(p.read('cli', 'phase').phase, 'active', 'persistence stays refused through the failure-report attempt');
      assert.equal(actor.snapshot().failureCode, 'e2e-handle-family-test-persist');
      assert.throws(() => child.spawn({ file: p.runtime, args: [p.runtime, '--version'], envPairs: [] }), /CONTROLLED_NATIVE_EXIT/u);
      assert.equal(witnesses.length, 1, 'sticky publisher refusal never replays the observer');
      assert.equal(p.family.inspect().cliExitCode, 86);
    } finally { p.stateOwner.retire(); }
  }
}

function runControlledFixtureCleanupCase() {
  let fixture, neighbor, neighborRoot, failure, cleanupFailure;
  try {
    fixture = makeFamilyControlledFixture();
    neighbor = makeFamilyControlledFixture();
    const root = fixture.stateOwner.stateDir;
    neighborRoot = neighbor.stateOwner.stateDir;
    const neighborFile = familyPath.join(neighbor.marker.root, 'family.json');
    const neighborBytes = familyFs.readFileSync(neighborFile);
    fixture.stateOwner.retire();
    assert.equal(familyFs.existsSync(root), false);
    assert.doesNotThrow(() => fixture.stateOwner.retire());
    assert.equal(familyFs.existsSync(neighborRoot), true);
    assert.deepEqual(familyFs.readFileSync(neighborFile), neighborBytes);
    assert.equal(JSON.parse(familyFs.readFileSync(familyPath.join(neighborRoot, '.e2e-run-owner.json'), 'utf8')).status, 'active');
    const original = new Error('CONTROLLED_FIXTURE_SETUP_FAILURE');
    let failedRoot;
    assert.throws(() => makeFamilyControlledFixture({ beforeFamily(owner) {
      failedRoot = owner.stateDir;
      throw original;
    } }), error => error === original);
    assert.equal(familyFs.existsSync(failedRoot), false, 'later setup failure retires and consumes its own root');
  } catch (error) { failure = error; throw error; }
  finally {
    for (const owner of [fixture?.stateOwner, neighbor?.stateOwner]) {
      try { owner?.retire(); } catch (error) { cleanupFailure ??= error; }
    }
    if (cleanupFailure && failure) console.error('[e2e-controlled-cleanup] secondary-cleanup-failed');
  }
  if (cleanupFailure) throw cleanupFailure;
  assert.equal(familyFs.existsSync(neighborRoot), false);
}

function runControlledFixtureCleanupCapCase() {
  const original = new Error('CONTROLLED_FIXTURE_SETUP_WITH_CAP_FAILURE');
  const controls = [];
  let owner, root, rootIdentity, parentIdentity, initialNames, initialMarker;
  const messages = [];
  const originalConsoleError = console.error;
  let failure, cleanupFailure;
  function removeExactControls() {
    if (!root || !familyFs.existsSync(root)) return;
    assert.ok(controlledFixtureSameIdentity(familyFs.lstatSync(root, { bigint: true }), rootIdentity));
    assert.ok(controlledFixtureSameIdentity(familyFs.lstatSync(familyPath.dirname(root), { bigint: true }), parentIdentity));
    assert.equal(familyFs.realpathSync.native(root), root);
    for (const control of controls) if (familyFs.existsSync(control.file)) {
      assert.equal(familyPath.dirname(control.file), root);
      const stat = familyFs.lstatSync(control.file, { bigint: true });
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && controlledFixtureSameIdentity(stat, control.identity));
      familyFs.unlinkSync(control.file);
    }
  }
  try {
    console.error = (...args) => { messages.push(args); };
    try {
      assert.throws(() => makeFamilyControlledFixture({ beforeFamily(actual) {
        owner = actual; root = owner.stateDir;
        rootIdentity = controlledFixtureIdentity(familyFs.lstatSync(root, { bigint: true }));
        parentIdentity = controlledFixtureIdentity(familyFs.lstatSync(familyPath.dirname(root), { bigint: true }));
        initialMarker = JSON.parse(familyFs.readFileSync(familyPath.join(root, '.e2e-run-owner.json'), 'utf8'));
        for (let i = 0; i < 64; i += 1) {
          const file = familyPath.join(root, `cleanup-cap-${String(i).padStart(2, '0')}.txt`);
          const bytes = Buffer.from(`owned cleanup control ${i}\n`);
          familyFs.writeFileSync(file, bytes, { flag: 'wx' });
          controls.push({ file, bytes, identity: controlledFixtureIdentity(familyFs.lstatSync(file, { bigint: true })) });
        }
        initialNames = familyFs.readdirSync(root).sort();
        throw original;
      } }), error => error === original);
    } finally { console.error = originalConsoleError; }
    assert.deepEqual(messages, [['[e2e-controlled-cleanup] setup-cleanup-failed']]);
    assert.equal(initialNames.length, 65, 'the marker counts toward the 64-file cap');
    assert.deepEqual(familyFs.readdirSync(root).sort(), initialNames);
    assert.ok(controlledFixtureSameIdentity(familyFs.lstatSync(root, { bigint: true }), rootIdentity));
    assert.deepEqual(JSON.parse(familyFs.readFileSync(familyPath.join(root, '.e2e-run-owner.json'), 'utf8')),
      { ...initialMarker, status: 'retired' }, 'mandatory retirement writes first; cleanup has deleted nothing');
    for (const control of controls) assert.deepEqual(familyFs.readFileSync(control.file), control.bytes);
    assert.throws(() => owner.retire(), /controlled-fixture-cleanup-file-or-byte-limit/u);
    assert.deepEqual(familyFs.readdirSync(root).sort(), initialNames);
    for (const control of controls) assert.deepEqual(familyFs.readFileSync(control.file), control.bytes);
    removeExactControls();
    owner.retire();
    assert.equal(familyFs.existsSync(root), false);
    assert.doesNotThrow(() => owner.retire());
  } catch (error) { failure = error; throw error; }
  finally {
    console.error = originalConsoleError;
    try { removeExactControls(); owner?.retire(); }
    catch (error) {
      cleanupFailure = error;
      if (failure) console.error('[e2e-controlled-cleanup] secondary-cleanup-failed');
    }
  }
  if (cleanupFailure) throw cleanupFailure;
}

const cases = [
  ['invalid input', runInvalidInputCase],
  ['normal child close/tree gone', runNormalChildCloseCase],
  ['valid termination failure/tree remains', runTerminationFailureCase],
  ['terminal report grace expiry', runTerminalReportGraceCase],
  ['outer deadline lifecycle cleanup', runOuterDeadlineCase],
  ['child error', runChildErrorCase],
  ['initialization ownership failure then recovery', runInitializationOwnershipFailureRecoveryCase],
  ['sample ownership failure after initialization', runSampleOwnershipFailureAfterInitializationCase],
  ['outer timer setup failure', runOuterTimerSetupFailureCase],
  ['duplicate and late child callbacks', runDuplicateAndLateChildCallbacksCase],
  ['hostile input rejection', runHostileInputRejectionCase],
  ['bidirectional mutation isolation', runBidirectionalMutationIsolationCase],
  ['composed failed sample then clean tree', runComposedFailedSampleThenCleanTreeCase],
  ['composed reuse excludes replacements and observes live identities', runComposedReuseAndLiveIdentityCase],
  ['composed missing and ambiguous identity remains incomplete', runComposedMissingAndAmbiguousIdentityCase],
  ['diagnostic fallback and logger failure preserve verdicts', runDiagnosticFallbackAndLoggerFailureCase],
  ['control failure diagnostics preserve timer verdict', runControlFailureDiagnosticsCase],
  ['HANDLE lease configuration and immutable metrics', runHandleLeaseConfigurationCase],
  ['HANDLE lease synchronous acquisition and original call contract', runHandleLeaseTimingAndCallCase],
  ['HANDLE lease ordinary throw and no-PID behavior', runHandleLeaseOriginalFailureCase],
  ['HANDLE lease created-child throws retain exact receiver and original error', runHandleLeaseCreatedThenThrowCase],
  ['HANDLE lease retains exited/closed children and deduplicates actual child', runHandleLeaseRetentionAndIdempotenceCase],
  ['HANDLE lease refuses changed child identity', runHandleLeaseChangedChildCase],
  ['HANDLE lease refuses capacity before spawning', runHandleLeaseCapacityCase],
  ['HANDLE lease acquisition refusal retires exact child', runHandleLeaseAcquisitionRefusalCase],
  ['HANDLE lease retirement/report failures latch permanently', runHandleLeaseFailureLatchCase],
  ['HANDLE lease reserves capacity across synchronous reentry', runHandleLeaseReentrantCapacityCase],
  ['HANDLE lease rejects invalid/reentrant calls before launch', runHandleLeaseInvalidCallCase],
  ['HANDLE family pre-registers intent and records truthful no-PID disposition', runFamilyIntentAndNoPidCase],
  ['HANDLE family rejects canonical roles without the exact preload before creation', runFamilyCanonicalPreloadRefusalCase],
  ['HANDLE family activation, leaf authority stripping and final seal', runFamilyActivationLeafAndSealCase],
  ['HANDLE family binding barrier and parent identity refusal', runFamilyBindingAdmissionAndStateCase],
  ['HANDLE family reentrant exit and post-seal microtask fence', runFamilyExitReentryAndFenceCase],
  ['HANDLE family preserves exit throws and private acquisition refusal', runFamilyExitThrowAndPrivateFaultCase],
  ['HANDLE family rejects stale seals after persistence failure and malformed records', runFamilyLatePersistenceAndRecordRefusalCase],
  ['HANDLE family defers public-spawn admission and rejects missing actor authority', runFamilyPublicSpawnAndMissingAuthorityCase],
  ['HANDLE family reviewed Node prefixes cannot hide roles or reinterpret leaf data', runFamilyReviewedNodePrefixCase],
  ['HANDLE family exact fault consumption is once-only and observer-safe', runFamilyExactFaultConsumptionCase],
  ['controlled fixture cleanup removes only its root and preserves its neighbor', runControlledFixtureCleanupCase],
  ['controlled fixture cleanup cap refuses before deletion and permits exact retry', runControlledFixtureCleanupCapCase],
];

let passed = 0;
for (const [name, runCase] of cases) {
  try {
    await runCase();
    passed += 1;
    console.log(`[e2e-runner-lifecycle selftest] ${name}: PASS`);
  } catch (error) {
    console.error(`[e2e-runner-lifecycle selftest] ${name}: FAIL`);
    console.error(error);
  }
}

console.log(`[e2e-runner-lifecycle selftest] ${passed}/${cases.length}`);
if (passed !== cases.length) {
  process.exitCode = 1;
}
