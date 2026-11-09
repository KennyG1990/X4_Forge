import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/lib/actionReceipt';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import {
  processLiveness, SharedSourceCoordinator, SOURCE_COORDINATION_FILENAME,
} from '../src/server/sharedSourceCoordinator';

const scenarios = ['backend-death', 'no-frame', 'helper-death', 'mutated-command', 'replaced-registry'] as const;
type Scenario = typeof scenarios[number];
type Command = ReturnType<typeof fixtureCommand>;
type LaunchFrame = {
  registry: string; claimId: string; instanceId: string; backendPid: number; guardJson: string; command: Command;
};
type BackendMessage =
  | { type: 'helper-started'; helperPid: number }
  | { type: 'armed'; helperPid: number; frame: LaunchFrame }
  | { type: 'returned'; code?: string }
  | { type: 'failure'; message: string };
type GuardRow = { guard_json: string; guard_phase: 'armed' | 'running' | 'drained'; handler_finished: number };

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const executable = process.env.FORGE_QA_PYTHON;
const scratchParent = process.env.FORGE_QA_TMP;
const systemRoot = process.env.SystemRoot;
assert(process.platform === 'win32' && executable && scratchParent && systemRoot, 'An explicit private Windows fixture is required.');
assert(path.isAbsolute(executable) && path.isAbsolute(scratchParent));
const python = fs.realpathSync.native(executable);
const scratch = fs.realpathSync.native(scratchParent);
const worker = fileURLToPath(new URL('../src/server/projectCheckLeaseWorker.py', import.meta.url));
const launcherHash = createHash('sha256').update(fs.readFileSync(
  fileURLToPath(new URL('../src/server/projectCheckWindowsJob.py', import.meta.url)),
)).digest('hex');
const script = fileURLToPath(import.meta.url);
const repository = fileURLToPath(new URL('..', import.meta.url));

function fixtureCommand(directory: string) {
  const runId = randomBytes(16).toString('hex');
  const checkId = 'lease-fixture';
  const jobId = createHash('sha256').update(canonicalJson([runId, checkId])).digest('hex').slice(0, 32);
  return {
    runner: 'windows-python-job-v1',
    runId,
    checkId,
    jobName: `Local\\X4ForgeProjectCheck-${jobId}`,
    executable: python,
    args: ['-I', '-S', '-B', path.join(directory, 'probe.py')],
    cwd: directory,
    environment: { SystemRoot: systemRoot!, FORGE_ARTIFACT_ROOT: path.join(directory, 'artifact') },
    timeoutSeconds: 12,
    retainedOutputBytes: 64 * 1024,
    maxOutputBytes: 1024 * 1024,
  };
}

function registryDirectory(directory: string) {
  return path.join(directory, 'registry');
}

function fixtureKey(directory: string) {
  return canonicalSourceKey(path.join(directory, 'source'));
}

function observeChild(child: ChildProcess) {
  let output = '';
  let error = '';
  let ended = false;
  child.stdout?.setEncoding('utf8').on('data', data => { output = (output + String(data)).slice(-128 * 1024); });
  child.stderr?.setEncoding('utf8').on('data', data => { error = (error + String(data)).slice(-128 * 1024); });
  child.on('error', problem => { error = String(problem); });
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string; error: string }>(resolve => {
    child.once('close', (code, signal) => {
      ended = true;
      resolve({ code, signal, output, error });
    });
  });
  return { child, done, ended: () => ended, diagnostic: () => error || output };
}

function startHelper(directory: string) {
  const child = spawn(python, ['-I', '-S', '-B', worker], {
    cwd: directory, windowsHide: true, detached: true,
    env: { SystemRoot: systemRoot }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.on('error', () => { /* A closed helper pipe is diagnosed through the process result. */ });
  const owned = observeChild(child);
  assert(child.pid, 'The fixture helper did not spawn.');
  return owned;
}

function launchFrame(child: ChildProcess, frame: LaunchFrame) {
  assert(child.stdin, 'The fixture helper requires a private launch pipe.');
  child.stdin.end(JSON.stringify(frame) + '\n');
}

async function bounded<T>(promise: Promise<T>, message: string, timeout = 8_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeout);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function until<T>(read: () => T | undefined, label: string, timeout = 8_000): Promise<T> {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function ownedBackend(directory: string, scenario: Scenario, parentHelperPid?: number) {
  const resolved = fs.realpathSync.native(directory);
  assert.equal(path.dirname(path.dirname(resolved)), scratch);
  assert.match(path.basename(path.dirname(resolved)), /^x4-check-lease-/);
  assert.equal(path.basename(resolved), scenario);
  assert(process.send);
  const send = (message: BackendMessage) => new Promise<void>((resolve, reject) => {
    process.send!(message, error => error ? reject(error) : resolve());
  });
  const coordinator = new SharedSourceCoordinator({ directory: registryDirectory(resolved), waitMs: 1_000, pollMs: 10 });
  let helper: ReturnType<typeof startHelper> | undefined;
  const exitControl = new Promise<void>(resolve => process.once('disconnect', resolve));
  process.on('message', message => {
    if (message === 'kill-owned-helper' && helper && !helper.ended()) helper.child.kill();
  });
  try {
    let code: string | undefined;
    try {
      await coordinator.run([fixtureKey(resolved)], { actor: 'fixture-backend', operation: 'check' }, async lease => {
        if (parentHelperPid === undefined) helper = startHelper(resolved);
        const helperPid = helper?.child.pid ?? parentHelperPid;
        assert(helperPid);
        await send({ type: 'helper-started', helperPid });
        const command = fixtureCommand(resolved);
        const commandHash = createHash('sha256').update(canonicalJson(command)).digest('hex');
        const bindingHash = createHash('sha256').update(canonicalJson({ commandHash })).digest('hex');
        const armed = lease.armProjectCheck({ bindingHash, commandHash, helperPid, jobName: command.jobName,
          launcherHash, runId: command.runId });
        const frame = { ...armed, command };
        await send({ type: 'armed', helperPid, frame });
        if (parentHelperPid !== undefined) {
          await exitControl;
          return;
        }
        assert(helper);
        launchFrame(helper.child, frame);
        const result = await helper.done;
        if (scenario === 'helper-death') assert.notEqual(result.code, 0, 'The helper should be interrupted.');
        else assert.equal(result.code, 0, result.error || result.output);
      });
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'PROJECT_CHECK_CLEANUP_UNCONFIRMED') throw error;
      code = error.code;
    }
    await send({ type: 'returned', code });
    if (scenario === 'helper-death') await exitControl;
  } catch (error) {
    if (process.connected) await send({ type: 'failure', message: String(error) });
    process.exitCode = 1;
  } finally {
    if (helper && !helper.ended()) {
      helper.child.kill();
      await bounded(helper.done, 'Owned helper did not exit during backend cleanup.');
    }
    coordinator.close();
    if (process.connected) process.disconnect?.();
  }
}

function readGuard(frame: LaunchFrame): GuardRow | undefined {
  const database = new Database(frame.registry, { readonly: true, fileMustExist: true, timeout: 100 });
  try {
    return database.prepare('SELECT guard_json, guard_phase, handler_finished FROM claims WHERE id = ? AND instance_id = ? AND pid = ?')
      .get(frame.claimId, frame.instanceId, frame.backendPid) as GuardRow | undefined;
  } finally {
    database.close();
  }
}

const probe = String.raw`
import os, pathlib, time
root = pathlib.Path.cwd()
temporary = root / "starting"
temporary.write_text(str(os.getpid()), encoding="ascii")
temporary.replace(root / "started")
while not (root / "release").exists():
    time.sleep(0.02)
(root / "finished").write_text("released", encoding="ascii")
`;

async function runSelftest() {
  const root = fs.mkdtempSync(path.join(scratch, 'x4-check-lease-'));
  const children: ReturnType<typeof observeChild>[] = [];
  const helperPids = new Set<number>();
  const probePids = new Set<number>();
  const directories: string[] = [];
  const observers: SharedSourceCoordinator[] = [];
  const checks: string[] = [];
  const check = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
  const parentOwner = { actor: 'fixture-observer', operation: 'write' };

  function createScenario(scenario: Scenario) {
    const directory = path.join(root, scenario);
    fs.mkdirSync(directory);
    directories.push(directory);
    for (const folder of ['source', 'artifact']) fs.mkdirSync(path.join(directory, folder));
    fs.writeFileSync(path.join(directory, 'probe.py'), probe, 'utf8');
    const observer = new SharedSourceCoordinator({ directory: registryDirectory(directory), waitMs: 450, pollMs: 10 });
    observers.push(observer);
    return { directory, observer, key: fixtureKey(directory) };
  }

  function startBackend(directory: string, scenario: Scenario, idleHelperPid?: number) {
    const child = spawn(process.execPath, ['--import', 'tsx', script, '--owned-backend', directory, scenario,
      ...(idleHelperPid === undefined ? [] : [String(idleHelperPid)])], {
      cwd: repository, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { SystemRoot: systemRoot, TEMP: directory, TMP: directory, FORGE_QA_TMP: scratch, FORGE_QA_PYTHON: python },
    });
    const owned = observeChild(child);
    children.push(owned);
    assert(child.pid, 'The fixture backend did not spawn.');
    const messages: BackendMessage[] = [];
    child.on('message', value => {
      const message = value as BackendMessage;
      if ((message.type === 'helper-started' || message.type === 'armed') && Number.isSafeInteger(message.helperPid)) {
        helperPids.add(message.helperPid);
      }
      messages.push(message);
    });
    const message = <T extends BackendMessage['type']>(type: T) => until(() => {
      const failed = messages.find(item => item.type === 'failure');
      if (failed) throw new Error(failed.message);
      if (owned.ended()) throw new Error(`Fixture backend exited before ${type}: ${owned.diagnostic()}`);
      return messages.find((item): item is Extract<BackendMessage, { type: T }> => item.type === type);
    }, `backend ${type}`);
    return { ...owned, message };
  }

  async function killOwned(owned: ReturnType<typeof observeChild>) {
    assert(!owned.ended(), 'The fixture process must be live before testing its death.');
    assert(owned.child.kill(), 'Could not terminate the exact fixture process.');
    const result = await bounded(owned.done, 'The owned fixture process did not exit.');
    assert.notEqual(result.code, 0, result.error || result.output);
  }

  async function started(directory: string, frame: LaunchFrame) {
    const startedPath = path.join(directory, 'started');
    const pid = await until(() => fs.existsSync(startedPath)
      ? Number(fs.readFileSync(startedPath, 'ascii')) : undefined, 'project probe marker');
    assert(Number.isSafeInteger(pid) && pid > 0 && pid !== frame.backendPid && pid !== process.pid);
    probePids.add(pid);
    assert.equal(processLiveness(pid), 'alive');
    assert.deepEqual(readGuard(frame), { guard_json: frame.guardJson, guard_phase: 'running', handler_finished: 0 });
    return pid;
  }

  async function mustBlock(observer: SharedSourceCoordinator, key: string) {
    await assert.rejects(observer.run([key], parentOwner, () => assert.fail('An overlapping writer ran early.')),
      { code: 'RESOURCE_QUEUE_TIMEOUT' });
  }

  async function mustRejectFrame(helper: ReturnType<typeof startHelper>, frame: LaunchFrame, status: string) {
    launchFrame(helper.child, frame);
    const result = await bounded(helper.done, 'The fixture helper did not reject its launch frame.');
    assert.equal(result.code, 1, result.error || result.output);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.status, status);
    assert.equal(parsed.cleanupPersisted, false);
    assert.equal(parsed.treeEmpty, false);
  }

  try {
    const active = createScenario('backend-death');
    const backend = startBackend(active.directory, 'backend-death');
    const running = await backend.message('armed');
    assert.equal(running.frame.backendPid, backend.child.pid);
    assert.equal(running.frame.registry, path.join(registryDirectory(active.directory), SOURCE_COORDINATION_FILENAME));
    const activePid = await started(active.directory, running.frame);
    await killOwned(backend);
    assert.equal(processLiveness(running.helperPid), 'alive');
    assert.equal(processLiveness(activePid), 'alive');
    await mustBlock(active.observer, active.key);
    await active.observer.run([canonicalSourceKey(path.join(active.directory, 'disjoint'))], parentOwner, () => {});
    check('backend death preserves the running lease while disjoint work proceeds');
    const blocker = new Database(running.frame.registry);
    try {
      blocker.exec('BEGIN IMMEDIATE');
      fs.writeFileSync(path.join(active.directory, 'release'), 'release');
      await until(() => processLiveness(activePid) === 'dead' ? true : undefined, 'the contained check to exit');
      // Exceed the worker's individual SQLite busy timeout while drain is pending.
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.equal(processLiveness(running.helperPid), 'alive', 'Worker lost durable drain on transient SQLite contention.');
      assert.equal(readGuard(running.frame)?.guard_phase, 'running');
    } finally {
      if (blocker.inTransaction) blocker.exec('ROLLBACK');
      blocker.close();
    }
    await until(() => readGuard(running.frame)?.guard_phase === 'drained' ? true : undefined, 'durable drained phase');
    check('drain survives a competing SQLite write held past one busy timeout');
    assert.equal(fs.readFileSync(path.join(active.directory, 'finished'), 'ascii'), 'released');
    await until(() => processLiveness(running.helperPid) === 'dead' && processLiveness(activePid) === 'dead'
      ? true : undefined, 'owned helper and project probe exit');
    const uncertainObserver = new SharedSourceCoordinator({ directory: registryDirectory(active.directory),
      waitMs: 450, pollMs: 10, liveness: pid => pid === running.helperPid ? 'unknown' : processLiveness(pid) });
    observers.push(uncertainObserver);
    await mustBlock(uncertainObserver, active.key);
    assert.equal(readGuard(running.frame)?.guard_phase, 'drained');
    check('unknown helper liveness retains even a durably drained claim');
    await active.observer.run([active.key], parentOwner, () => {});
    assert.equal(readGuard(running.frame), undefined);
    check('durable drain and helper exit permit overlapping work after backend death');

    const unstarted = createScenario('no-frame');
    // Keep this idle helper's pipe in the test parent so it can receive the
    // exact delayed frame after the owning backend has already died.
    const lateHelper = startHelper(unstarted.directory);
    children.push(lateHelper);
    const unstartedBackend = startBackend(unstarted.directory, 'no-frame', lateHelper.child.pid);
    const pending = await unstartedBackend.message('armed');
    assert.deepEqual(readGuard(pending.frame), { guard_json: pending.frame.guardJson, guard_phase: 'armed', handler_finished: 0 });
    assert(!fs.existsSync(path.join(unstarted.directory, 'started')));
    await killOwned(unstartedBackend);
    assert.equal(processLiveness(pending.helperPid), 'alive');
    await unstarted.observer.run([unstarted.key], parentOwner, () => {});
    assert.equal(readGuard(pending.frame), undefined);
    await mustRejectFrame(lateHelper, pending.frame, 'claim-mismatch');
    assert(!fs.existsSync(path.join(unstarted.directory, 'started')));
    assert.equal(readGuard(pending.frame), undefined);
    check('backend death before launch lets ordinary work reap the armed claim and rejects the exact delayed frame');

    const mutated = createScenario('mutated-command');
    const mutationHelper = startHelper(mutated.directory);
    children.push(mutationHelper);
    const mutationBackend = startBackend(mutated.directory, 'mutated-command', mutationHelper.child.pid);
    const exact = await mutationBackend.message('armed');
    await mustRejectFrame(mutationHelper, {
      ...exact.frame,
      command: { ...exact.frame.command, args: [...exact.frame.command.args, 'mutated'] },
    }, 'invalid-frame');
    assert.deepEqual(readGuard(exact.frame), { guard_json: exact.frame.guardJson, guard_phase: 'armed', handler_finished: 0 });
    assert(!fs.existsSync(path.join(mutated.directory, 'started')));
    await killOwned(mutationBackend);
    await mutated.observer.run([mutated.key], parentOwner, () => {});
    assert.equal(readGuard(exact.frame), undefined);
    check('a changed command under the exact live guard never starts or advances the armed claim');

    const replaced = createScenario('replaced-registry');
    const replacementHelper = startHelper(replaced.directory);
    children.push(replacementHelper);
    const replacementBackend = startBackend(replaced.directory, 'replaced-registry', replacementHelper.child.pid);
    const original = await replacementBackend.message('armed');
    const alternate = path.join(replaced.directory, 'alternate');
    fs.mkdirSync(alternate);
    const copiedRegistry = path.join(alternate, SOURCE_COORDINATION_FILENAME);
    fs.copyFileSync(original.frame.registry, copiedRegistry);
    const forgedRegistry = { ...original.frame, registry: copiedRegistry };
    assert.deepEqual(readGuard(forgedRegistry), readGuard(original.frame));
    await mustRejectFrame(replacementHelper, forgedRegistry, 'registry-unavailable');
    assert.equal(readGuard(forgedRegistry)?.guard_phase, 'armed');
    assert.equal(readGuard(original.frame)?.guard_phase, 'armed');
    assert(!fs.existsSync(path.join(replaced.directory, 'started')));
    await killOwned(replacementBackend);
    check('a byte-identical registry copy cannot admit the exact armed frame');

    const interrupted = createScenario('helper-death');
    const interruptedBackend = startBackend(interrupted.directory, 'helper-death');
    const doomed = await interruptedBackend.message('armed');
    const interruptedPid = await started(interrupted.directory, doomed.frame);
    assert(interruptedBackend.child.connected);
    interruptedBackend.child.send('kill-owned-helper');
    const returned = await interruptedBackend.message('returned');
    assert.equal(returned.code, 'PROJECT_CHECK_CLEANUP_UNCONFIRMED');
    await until(() => processLiveness(doomed.helperPid) === 'dead' && processLiveness(interruptedPid) === 'dead'
      ? true : undefined, 'terminated helper and contained probe');
    assert.deepEqual(readGuard(doomed.frame), { guard_json: doomed.frame.guardJson, guard_phase: 'running', handler_finished: 1 });
    await mustBlock(interrupted.observer, interrupted.key);
    await killOwned(interruptedBackend);
    await mustBlock(interrupted.observer, interrupted.key);
    await interrupted.observer.run([canonicalSourceKey(path.join(interrupted.directory, 'disjoint'))], parentOwner, () => {});
    assert.deepEqual(readGuard(doomed.frame), { guard_json: doomed.frame.guardJson, guard_phase: 'running', handler_finished: 1 });
    assert(!fs.existsSync(path.join(interrupted.directory, 'finished')));
    check('helper death retains unresolved running ownership after handler exit and backend death');

    console.log(JSON.stringify({ status: 'passed', realWindowsProcesses: true, checks }));
  } finally {
    for (const observer of observers) observer.close();
    // Release owned fixture commands first, even if an assertion failed
    // before the normal release, then await or terminate owned handles.
    for (const directory of directories) fs.writeFileSync(path.join(directory, 'release'), 'cleanup');
    for (const owned of children) {
      if (!owned.ended()) owned.child.kill();
      await bounded(owned.done, 'A test-owned child did not exit during cleanup.');
    }
    await until(() => [...helperPids, ...probePids].every(pid => processLiveness(pid) === 'dead')
      ? true : undefined, 'all observed fixture descendants to exit', 15_000);
    assert.equal(path.dirname(fs.realpathSync.native(root)), scratch);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const [mode, directory, scenario, pid] = process.argv.slice(2);
if (mode === '--owned-backend') {
  assert(scenarios.some(item => item === scenario));
  await ownedBackend(directory, scenario as Scenario, pid ? Number(pid) : undefined);
} else {
  assert.equal(mode, undefined);
  await runSelftest();
}
