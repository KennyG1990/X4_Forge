import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator, SOURCE_COORDINATION_FILENAME, processLiveness, resolveSourceCoordinationDirectory, type RegistryDatabase } from '../src/server/sharedSourceCoordinator';

const checks: string[] = [];
const check = (name: string, test: () => unknown) => { test(); checks.push(name); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-c06c-coordinator-'));
const instances: SharedSourceCoordinator[] = [];
const children: ChildProcess[] = [];
const releases: (() => void)[] = [];
const pending: Promise<unknown>[] = [];
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const coordinator = (name: string, extra: Partial<ConstructorParameters<typeof SharedSourceCoordinator>[0]> = {}) => {
  const instance = new SharedSourceCoordinator({ directory: path.join(root, name), waitMs: 3_000, pollMs: 5, ...extra });
  instances.push(instance);
  return instance;
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
const track = <T>(promise: Promise<T>): Promise<T> => { pending.push(promise); void promise.catch(() => {}); return promise; };
const hold = (q: SharedSourceCoordinator, keys: string[], actor: string) => {
  const entered = deferred(); const released = deferred(); releases.push(released.resolve);
  const done = track(q.run(keys, { actor, operation: 'hold', workspaceId: `ws_${actor}` }, async () => {
    entered.resolve(); await released.promise;
  }));
  return { entered: entered.promise, release: released.resolve, done };
};
async function until<T>(read: () => T, predicate: (value: T) => boolean, label: string, timeout = 5_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (true) {
    const value = read(); if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for observed state: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
function startWorker(directory: string, key: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./c06c-coordination-worker.ts', import.meta.url)), directory, key], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.push(child);
  let stderr = '';
  child.stderr!.on('data', data => { stderr += String(data); });
  const entered = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Worker entry timed out: ${stderr}`)), 10_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.on('message', message => {
      const value = message as { type?: string; pid?: number; message?: string };
      if (value.type === 'entered') { clearTimeout(timer); resolve(value.pid!); }
      if (value.type === 'error') { clearTimeout(timer); reject(new Error(value.message)); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Worker exited ${code}: ${stderr}`)); });
  });
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
  return { child, entered, exited };
}

try {
  check('explicit absolute scratch override selects only its owned directory', () => assert.equal(resolveSourceCoordinationDirectory({ X4_SOURCE_COORDINATION_DIR: path.join(root, 'selected'), NODE_ENV: 'test' }), path.join(root, 'selected')));
  for (const bad of ['', '   ', 'relative-registry', '\\\\server\\share\\registry', '//server/share/registry']) {
    check(`nonlocal or relative registry rejected: ${bad}`, () => assert.throws(() => resolveSourceCoordinationDirectory({ X4_SOURCE_COORDINATION_DIR: bad })));
  }
  for (const env of [
    { NODE_ENV: 'test' }, { FORGE_ROUTE_TEST_MODE: '1' }, { X4_FORGE_E2E_STATE_PID: '123' },
    { X4_FORGE_E2E_API_PORT: '3101' }, { X4_FORGE_E2E_WEB_PORT: '3100' }, { X4_FORGE_MODE: 'claude-integration-test' },
  ]) check(`isolated mode requires explicit registry: ${Object.keys(env)[0]}`, () => assert.throws(() => resolveSourceCoordinationDirectory(env), /explicit scratch/));
  check('production directory ignores per-process X4_STATE_DIR', () => assert.equal(resolveSourceCoordinationDirectory({ X4_STATE_DIR: path.join(root, 'state-A') }), resolveSourceCoordinationDirectory({ X4_STATE_DIR: path.join(root, 'state-B') })));
  check('resolver alone creates no registry', () => assert.deepEqual(fs.readdirSync(root), []));
  check('own process is observably alive', () => assert.equal(processLiveness(process.pid), 'alive'));
  check('invalid PID is unknown', () => { assert.equal(processLiveness(-1), 'unknown'); assert.equal(processLiveness(0), 'unknown'); });
  const actualKill = process.kill;
  try {
    for (const [code, result] of [['ESRCH', 'dead'], ['EPERM', 'unknown'], ['EACCES', 'unknown'], ['unexpected', 'unknown']] as const) {
      process.kill = (() => { throw Object.assign(new Error(code), { code }); }) as typeof process.kill;
      check(`process probe ${code} maps conservatively to ${result}`, () => assert.equal(processLiveness(123), result));
    }
  } finally { process.kill = actualKill; }
  const source = path.join(root, 'mod'); fs.mkdirSync(source);
  const alias = path.join(root, 'alias'); fs.symlinkSync(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const key = canonicalSourceKey(source); const other = canonicalSourceKey(path.join(root, 'other-mod'));
  check('junction aliases have one canonical source identity', () => assert.equal(key, canonicalSourceKey(alias)));
  check('nonexistent descendants resolve through junction parents', () => assert.equal(canonicalSourceKey(path.join(alias, 'new')), canonicalSourceKey(path.join(source, 'new'))));
  if (process.platform === 'win32') check('Windows casing has one canonical source identity', () => assert.equal(key, canonicalSourceKey(source.toUpperCase())));

  const a = coordinator('shared'); const b = coordinator('shared'); const c = coordinator('shared');
  check('construction does not create the registry', () => assert.equal(fs.existsSync(path.join(root, 'shared')), false));
  const first = hold(a, [key], 'A'); await first.entered;
  const events: string[] = [];
  const second = track(b.run([canonicalSourceKey(path.join(alias, 'child'))], { actor: 'B', operation: 'write', workspaceId: 'ws_B' }, () => { events.push('B'); }));
  await until(() => a.status([key]), status => status.waiting.some(e => e.owner.actor === 'B'), 'B queued');
  const third = track(c.run([key], { actor: 'C', operation: 'write' }, () => { events.push('C'); }));
  await until(() => a.status([key]), status => status.waiting.some(e => e.owner.actor === 'C'), 'C queued');
  await b.run([other], { actor: 'independent', operation: 'write' }, () => { events.push('independent'); });
  check('unrelated source proceeds while parent and child aliases wait', () => assert.deepEqual(events, ['independent']));
  const sharedStatus = b.status([key]);
  check('shared status describes participation and external-editor limits honestly', () => {
    assert.equal(sharedStatus.available, true); assert.equal(sharedStatus.scope, 'shared-participating-processes');
    assert.equal(sharedStatus.controlsExternalEditors, false); assert.equal(sharedStatus.controlsOtherProcesses, false);
    assert.equal(sharedStatus.coordinatesParticipatingProcesses, true);
  });
  check('other instances observe owner, instance, PID and timing', () => {
    assert.equal(sharedStatus.active[0].owner.actor, 'A'); assert.equal(sharedStatus.active[0].pid, process.pid);
    assert.ok(sharedStatus.active[0].instanceId); assert.ok(sharedStatus.active[0].queuedAt); assert.ok(sharedStatus.active[0].startedAt);
    assert.equal(sharedStatus.waiting[0].owner.workspaceId, 'ws_B'); assert.equal(sharedStatus.waiting[0].startedAt, null);
  });
  sharedStatus.active[0].owner.actor = 'tampered';
  check('status snapshots cannot mutate authority', () => assert.equal(a.status([key]).active[0].owner.actor, 'A'));
  first.release(); await Promise.all([first.done, second, third]);
  check('overlapping requests retain FIFO order', () => assert.deepEqual(events, ['independent', 'B', 'C']));

  const atomicHolder = hold(a, [key, other], 'atomic'); await atomicHolder.entered;
  const reverse = track(b.run([other, key], { actor: 'reverse', operation: 'write' }, () => { events.push('reverse'); }));
  const atom = await until(() => c.status([key, other]), s => s.waiting.some(e => e.owner.actor === 'reverse'), 'reverse multi-key queued');
  check('multi-key acquisition has one atomic claim and no partial ownership', () => {
    assert.equal(atom.active.length, 1); assert.equal(atom.active[0].resources.length, 2);
    assert.equal(atom.waiting.find(e => e.owner.actor === 'reverse')!.resources.length, 2);
  });
  atomicHolder.release(); await Promise.all([atomicHolder.done, reverse]);
  check('opposite key order completes without deadlock', () => assert.equal(events.at(-1), 'reverse'));

  await assert.rejects(a.run([key], { actor: 'throws', operation: 'write' }, () => { throw new Error('injected failure'); }), /injected failure/);
  await b.run([key], { actor: 'recover', operation: 'write' }, () => checks.push('handler exception releases exact ownership'));

  let failCleanup = false;
  const faultingCleanupDriver = (filename: string): RegistryDatabase => {
    const database = new Database(filename);
    return {
      exec: sql => database.exec(sql), pragma: (sql, options) => database.pragma(sql, options),
      transaction: callback => ({ immediate: () => database.transaction(callback).immediate() }),
      close: () => database.close(),
      prepare: sql => {
        const statement = database.prepare(sql);
        return {
          all: (...parameters) => statement.all(...parameters), get: (...parameters) => statement.get(...parameters),
          run: (...parameters) => {
            if (failCleanup && sql.startsWith('DELETE FROM claims')) throw new Error('injected cleanup storage failure');
            return statement.run(...parameters);
          },
        };
      },
    } as RegistryDatabase;
  };
  const cleanup = coordinator('cleanup-failure', { driverFactory: faultingCleanupDriver });
  const primaryFailure = new Error('injected primary operation failure');
  const writtenBeforeFailure = path.join(root, 'written-before-cleanup-failure.txt');
  await assert.rejects(cleanup.run([key], { actor: 'cleanup-failure', operation: 'write' }, () => {
    fs.writeFileSync(writtenBeforeFailure, 'already written');
    failCleanup = true;
    throw primaryFailure;
  }), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], primaryFailure);
    assert.match(String(error.errors[1]), /injected cleanup storage failure/);
    assert.equal((error as AggregateError & { code: string }).code, 'SOURCE_COORDINATION_UNAVAILABLE');
    assert.equal((error as AggregateError & { status: number }).status, 503);
    assert.equal((error as AggregateError & { category: string }).category, 'forge-infrastructure');
    assert.match(error.message, /Ownership may remain/);
    return true;
  });
  checks.push('primary and cleanup failures are both preserved as infrastructure failure');
  check('cleanup failure retains claim and makes no rollback claim', () => {
    assert.equal(cleanup.status([key]).active[0].owner.actor, 'cleanup-failure');
    assert.equal(fs.readFileSync(writtenBeforeFailure, 'utf8'), 'already written');
  });

  failCleanup = false;
  const completedCleanup = coordinator('completed-cleanup-failure', { driverFactory: faultingCleanupDriver });
  const writtenByCompletedHandler = path.join(root, 'completed-before-cleanup-failure.txt');
  await assert.rejects(completedCleanup.run([key], { actor: 'completed-cleanup', operation: 'write' }, () => {
    fs.writeFileSync(writtenByCompletedHandler, 'completed write');
    failCleanup = true;
    return 'handler completed';
  }), error => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code: string }).code, 'SOURCE_COORDINATION_UNAVAILABLE');
    assert.equal((error as Error & { status: number }).status, 503);
    assert.equal((error as Error & { category: string }).category, 'forge-infrastructure');
    assert.match(error.message, /Source operation completed but coordination cleanup failed/);
    assert.match(error.message, /Writes may already have occurred/);
    assert.match(error.message, /ownership may remain/);
    assert.match(error.message, /injected cleanup storage failure/);
    assert.doesNotMatch(error.message, /work was refused|rolled back|no work was performed/i);
    return true;
  });
  checks.push('completed handler plus cleanup failure reports completed work honestly');
  check('completed handler cleanup failure preserves written bytes and retained claim', () => {
    assert.equal(fs.readFileSync(writtenByCompletedHandler, 'utf8'), 'completed write');
    assert.equal(completedCleanup.status([key]).active[0].owner.actor, 'completed-cleanup');
  });

  const boundedA = coordinator('bounded', { maxPending: 2 }); const boundedB = coordinator('bounded', { maxPending: 2 });
  const bounded = hold(boundedA, [key], 'bounded'); await bounded.entered;
  const queued = track(boundedB.run([key], { actor: 'queued', operation: 'write' }, () => {}));
  await until(() => boundedA.status([key]), s => s.waiting.length === 1, 'bounded queue filled');
  await assert.rejects(boundedB.run([other], { actor: 'overflow', operation: 'write' }, () => assert.fail('must not execute')), { code: 'RESOURCE_QUEUE_FULL' });
  checks.push('pending cap is shared across coordinator instances'); bounded.release(); await Promise.all([bounded.done, queued]);

  const timeoutA = coordinator('timeout'); const timeoutB = coordinator('timeout', { waitMs: 40 });
  const stalled = hold(timeoutA, [key], 'stalled'); await stalled.entered;
  await assert.rejects(timeoutB.run([key], { actor: 'expires', operation: 'write' }, () => assert.fail('must not execute')), { code: 'RESOURCE_QUEUE_TIMEOUT' });
  check('waiter timeout never expires a live active owner', () => { const status = timeoutB.status([key]); assert.equal(status.active[0].owner.actor, 'stalled'); assert.equal(status.waiting.length, 0); });
  stalled.release(); await stalled.done;
  await timeoutB.run([key], { actor: 'timeout-recovery', operation: 'write' }, () => checks.push('queue timeout permits later recovery'));

  const retargetHold = hold(a, [key], 'retarget-hold'); await retargetHold.entered;
  let currentKey = key; let ran = false;
  const retarget = track(b.run([key], { actor: 'retargeted', operation: 'write' }, () => { ran = true; }, () => [currentKey]));
  await until(() => a.status([key]), s => s.waiting.some(e => e.owner.actor === 'retargeted'), 'retarget request queued');
  currentKey = other; retargetHold.release(); await retargetHold.done;
  await assert.rejects(retarget, { code: 'SOURCE_COORDINATION_CHANGED' });
  check('source/config retarget refuses before handler entry', () => assert.equal(ran, false));
  await a.run([key], { actor: 'retarget-recovery', operation: 'write' }, () => checks.push('retarget refusal releases claim'));

  for (const invalid of [[], [''], ['workspace:not-a-source'], [`source:${'x'.repeat(40_000)}`]]) {
    await assert.rejects(a.run(invalid, { actor: 'invalid', operation: 'write' }, () => assert.fail('must not execute')));
  }
  checks.push('invalid, non-source or oversized resource keys refuse before entry');

  const selfLiveness = coordinator('self-liveness', { liveness: () => 'dead' });
  const selfHolder = hold(selfLiveness, [key], 'self-owner'); await selfHolder.entered;
  const selfObserver = coordinator('self-liveness', { waitMs: 40, liveness: () => 'dead' });
  await assert.rejects(selfObserver.run([key], { actor: 'self-observer', operation: 'write' }, () => assert.fail('own process cannot be reaped')), { code: 'RESOURCE_QUEUE_TIMEOUT' });
  checks.push('current-process ownership cannot be reaped by injected remote liveness');
  selfHolder.release(); await selfHolder.done;

  const childDir = path.join(root, 'child-death');
  const worker = startWorker(childDir, key); const childPid = await worker.entered;
  const observer = coordinator('child-death');
  check('real child process ownership is visible', () => { const s = observer.status([key]); assert.equal(s.active[0].pid, childPid); assert.equal(s.active[0].owner.actor, 'child-owner'); });
  const unknown = coordinator('child-death', { waitMs: 40, liveness: () => 'unknown' });
  const aliveReused = coordinator('child-death', { waitMs: 40, liveness: () => 'alive' });
  worker.child.kill(); await worker.exited;
  await assert.rejects(unknown.run([key], { actor: 'unknown-death', operation: 'write' }, () => assert.fail('uncertain owner must retain claim')), { code: 'RESOURCE_QUEUE_TIMEOUT' });
  checks.push('unknown remote liveness never steals a claim');
  await assert.rejects(aliveReused.run([key], { actor: 'reused-pid', operation: 'write' }, () => assert.fail('alive/reused PID must retain claim')), { code: 'RESOURCE_QUEUE_TIMEOUT' });
  checks.push('alive or reused remote PID conservatively retains claim');
  await observer.run([key], { actor: 'death-recovery', operation: 'write' }, () => checks.push('confirmed dead child owner is reclaimed'));
  check('recovery leaves no active or queued claims', () => { const s = observer.status([key]); assert.equal(s.active.length, 0); assert.equal(s.waiting.length, 0); });

  const releasedWorker = startWorker(path.join(root, 'child-release'), key); await releasedWorker.entered;
  const releaseObserver = coordinator('child-release'); let successorEntered = false;
  const successor = track(releaseObserver.run([key], { actor: 'successor', operation: 'write' }, () => { successorEntered = true; }));
  await until(() => releaseObserver.status([key]), s => s.waiting.length === 1, 'real child successor queued');
  check('real child and parent handlers do not overlap', () => assert.equal(successorEntered, false));
  releasedWorker.child.send('release'); await releasedWorker.exited; await successor;
  check('real child releases cleanly for parent successor', () => assert.equal(successorEntered, true));

  const queuedObserver = coordinator('queued-child-death');
  const parentHolder = hold(queuedObserver, [key], 'parent-holder'); await parentHolder.entered;
  const queuedWorker = startWorker(path.join(root, 'queued-child-death'), key);
  void queuedWorker.entered.catch(() => {});
  await until(() => queuedObserver.status([key]), s => s.waiting.some(e => e.pid === queuedWorker.child.pid), 'child queued behind parent');
  queuedWorker.child.kill(); await queuedWorker.exited;
  await assert.rejects(queuedWorker.entered, /Worker exited/);
  check('confirmed dead queued child is removed without releasing active parent', () => {
    const s = queuedObserver.status([key]); assert.equal(s.waiting.length, 0);
    assert.equal(s.active.length, 1); assert.equal(s.active[0].owner.actor, 'parent-holder');
  });
  parentHolder.release(); await parentHolder.done;
  await queuedObserver.run([key], { actor: 'queue-death-recovery', operation: 'write' }, () => checks.push('queued child death permits later progress'));

  const missing = coordinator('missing-driver', { driverFactory: () => { throw new Error('injected missing native module'); } });
  check('missing native dependency stays observable without constructor failure', () => { const s = missing.status([key]); assert.equal(s.available, false); assert.equal(s.code, 'SOURCE_COORDINATION_UNAVAILABLE'); assert.match(s.reason!, /injected missing native module/); });
  await assert.rejects(missing.run([key], { actor: 'missing', operation: 'write' }, () => assert.fail('native dependency failure cannot fall back')), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
  checks.push('missing native dependency refuses writes without process-only fallback');

  fs.mkdirSync(path.join(root, 'corrupt'));
  fs.writeFileSync(path.join(root, 'corrupt', SOURCE_COORDINATION_FILENAME), 'not a SQLite database');
  const corrupt = coordinator('corrupt');
  await assert.rejects(corrupt.run([key], { actor: 'corrupt', operation: 'write' }, () => assert.fail('corrupt registry cannot run')), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
  check('corrupt registry is preserved and unavailable', () => { assert.equal(corrupt.status([key]).available, false); assert.equal(fs.readFileSync(path.join(root, 'corrupt', SOURCE_COORDINATION_FILENAME), 'utf8'), 'not a SQLite database'); });

  for (const [name, ownerJson, keysJson] of [
    ['owner-json-syntax', '{broken', JSON.stringify([key])],
    ['owner-json-shape', JSON.stringify({ actor: '', operation: 'write' }), JSON.stringify([key])],
    ['keys-json-syntax', JSON.stringify({ actor: 'unknown-owner', operation: 'write' }), '[broken'],
    ['keys-json-shape', JSON.stringify({ actor: 'unknown-owner', operation: 'write' }), JSON.stringify([''])],
    ['keys-noncanonical', JSON.stringify({ actor: 'unknown-owner', operation: 'write' }), JSON.stringify([key, key])],
  ]) {
    const malformed = coordinator(`malformed-${name}`);
    assert.equal(malformed.status([key]).available, true);
    const registry = new Database(path.join(root, `malformed-${name}`, SOURCE_COORDINATION_FILENAME));
    try {
      const timestamp = new Date().toISOString();
      registry.prepare('INSERT INTO claims (id,instance_id,pid,keys_json,owner_json,queued_at,started_at,state) VALUES (?,?,?,?,?,?,?,?)')
        .run(randomUUID(), randomUUID(), process.pid, keysJson, ownerJson, timestamp, timestamp, 'active');
      const before = registry.prepare('SELECT * FROM claims').all();
      check(`${name} status reports registry unavailable`, () => {
        const status = malformed.status([key]);
        assert.equal(status.available, false);
        assert.equal(status.code, 'SOURCE_COORDINATION_UNAVAILABLE');
        assert.match(status.reason!, /coordination claim/i);
      });
      let handlerEntered = false;
      await assert.rejects(malformed.run([key], { actor: 'valid-caller', operation: 'write' }, () => { handlerEntered = true; }), {
        code: 'SOURCE_COORDINATION_UNAVAILABLE', status: 503, category: 'forge-infrastructure',
      });
      check(`${name} refuses as infrastructure failure before handler entry`, () => assert.equal(handlerEntered, false));
      check(`${name} preserves unknown ownership instead of discarding it`, () => assert.deepEqual(registry.prepare('SELECT * FROM claims').all(), before));
    } finally { registry.close(); }
  }

  const future = coordinator('future'); assert.equal(future.status([key]).available, true); future.close();
  const database = new Database(path.join(root, 'future', SOURCE_COORDINATION_FILENAME)); database.pragma('user_version = 999'); database.close();
  const unsupported = coordinator('future');
  await assert.rejects(unsupported.run([key], { actor: 'future', operation: 'write' }, () => assert.fail('unsupported registry cannot run')), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
  checks.push('future registry schema refuses without rebuilding authority');

  fs.writeFileSync(path.join(root, 'not-a-directory'), 'preserve');
  const badPath = coordinator('not-a-directory');
  await assert.rejects(badPath.run([key], { actor: 'bad-path', operation: 'write' }, () => assert.fail('unavailable storage cannot run')), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
  check('unavailable registry storage preserves existing file', () => assert.equal(fs.readFileSync(path.join(root, 'not-a-directory'), 'utf8'), 'preserve'));
} finally {
  for (const release of releases) release();
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
  await Promise.allSettled(pending);
  await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>(resolve => child.once('exit', () => resolve()))));
  for (const instance of instances) instance.close();
  const resolvedRoot = path.resolve(root); const resolvedTemp = path.resolve(os.tmpdir());
  assert.ok(resolvedRoot.startsWith(resolvedTemp + path.sep) && path.basename(resolvedRoot).startsWith('forge-c06c-coordinator-'));
  fs.rmSync(resolvedRoot, { recursive: true, force: true });
}
console.log(JSON.stringify({ pass: true, count: checks.length, checks }, null, 2));
