import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { canonicalJson } from '../src/lib/actionReceipt';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator, SOURCE_COORDINATION_FILENAME, SOURCE_COORDINATION_SCHEMA_VERSION,
  type ProjectCheckSourceLease, type RegistryDatabase } from '../src/server/sharedSourceCoordinator';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as new (file: string) => RegistryDatabase;
const scratchInput = process.env.FORGE_QA_TMP;
assert(process.platform === 'win32' && scratchInput && path.isAbsolute(scratchInput), 'Explicit private Windows FORGE_QA_TMP required.');
const parent = fs.realpathSync.native(scratchInput);
const root = fs.mkdtempSync(path.join(parent, 'x4-multiworker-'));
const stamp = fs.lstatSync(root, { bigint: true });
fs.writeFileSync(path.join(root, 'owner.json'), JSON.stringify({ owner: 'forge-multiworker-test', version: 1 }));
const checks: { name: string; pass: boolean; error?: string }[] = [];
const footprintLimit = { bytes: 8 * 1024 * 1024, entries: 512 };
const peakFootprint = { bytes: 0, entries: 0 };
const instances: SharedSourceCoordinator[] = [];
const owner = { actor: 'multiworker-fixture', workspaceId: 'ws_0123456789abcdef01234567', operation: 'project-check-test' };
const key = canonicalSourceKey(path.join(root, 'mod'));
const live = new Map<number, 'alive' | 'dead' | 'unknown'>();
let safeToRetire = true;
let actualCommandsWitnessed = false;
const options = (name: string) => ({ directory: path.join(root, name), waitMs: 250, pollMs: 5,
  liveness: (pid: number) => live.get(pid) ?? 'unknown' as const });
const coordinator = (name: string) => { const q = new SharedSourceCoordinator(options(name)); instances.push(q); return q; };
type Guard = Parameters<ProjectCheckSourceLease['armProjectCheck']>[0];
const guard = (index: number, runId = 'a'.repeat(32)): Guard => ({ bindingHash: index.toString(16).padStart(64, '0'),
  commandHash: (index + 100).toString(16).padStart(64, '0'), helperPid: 0x7fff0000 + index,
  jobName: `Local\\X4ForgeProjectCheck-${index.toString(16).padStart(32, '0')}`, launcherHash: 'b'.repeat(64), runId });
type JournalEntry = { guard: Guard; phase: string };
function journal(q: SharedSourceCoordinator): JournalEntry[] {
  const db = new Database(q.filename);
  try { const row = db.prepare('SELECT guards_json FROM claims').get() as { guards_json: string } | undefined;
    return row ? JSON.parse(row.guards_json) as JournalEntry[] : []; } finally { db.close(); }
}
function phase(q: SharedSourceCoordinator, frame: { guardJson: string }, next: string) {
  const db = new Database(q.filename);
  try {
    const rows = journal(q);
    const entry = rows.find(item => JSON.stringify(item.guard) === frame.guardJson);
    assert(entry); entry.phase = next;
    db.prepare('UPDATE claims SET guards_json = ?').run(JSON.stringify(rows));
  } finally { db.close(); }
}
function meterFixture() {
  let bytes = 0; let entries = 0;
  const visit = (directory: string) => {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name); const stat = fs.lstatSync(file);
      assert(!stat.isSymbolicLink(), 'Fixture must not contain aliases.'); entries++;
      if (stat.isDirectory()) visit(file); else { assert(stat.isFile()); bytes += stat.size; }
    }
  };
  visit(root); peakFootprint.bytes = Math.max(peakFootprint.bytes, bytes); peakFootprint.entries = Math.max(peakFootprint.entries, entries);
  assert(bytes <= footprintLimit.bytes && entries <= footprintLimit.entries, 'Protocol fixture footprint exceeded its cap.');
}
async function check(name: string, test: () => void | Promise<void>) {
  try { await test(); meterFixture(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, error: error instanceof Error ? error.message : String(error) }); }
}
function seedLegacy(name: string, version = 2, occupied = false) {
  const dir = options(name).directory; fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, SOURCE_COORDINATION_FILENAME));
  db.exec(`CREATE TABLE claims (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    instance_id TEXT NOT NULL, pid INTEGER NOT NULL, keys_json TEXT NOT NULL, owner_json TEXT NOT NULL,
    queued_at TEXT NOT NULL, started_at TEXT, state TEXT NOT NULL
    ${version === 2 ? ', guard_json TEXT, guard_phase TEXT, handler_finished INTEGER NOT NULL DEFAULT 0' : ''});
    PRAGMA application_id = ${0x58345343}; PRAGMA user_version = ${version};`);
  if (occupied) db.prepare("INSERT INTO claims (id,instance_id,pid,keys_json,owner_json,queued_at,state) VALUES (?,?,?,?,?,?,'waiting')")
    .run(randomUUID(), randomUUID(), 0x7ffe0001, JSON.stringify([key]), JSON.stringify(owner), new Date().toISOString());
  db.close(); return dir;
}
async function realJobsWitness() {
  const python = process.env.FORGE_QA_PYTHON;
  assert(python && path.isAbsolute(python));
  const directory = path.join(root, 'real-jobs'); fs.mkdirSync(directory);
  fs.mkdirSync(path.join(directory, 'artifact'));
  const probe = path.join(directory, 'probe.py');
  fs.writeFileSync(probe, 'import os,sys,time\nname=sys.argv[1]\nopen(name+".started","w").write(str(os.getpid()))\nwhile not os.path.exists(name+".release"):\n time.sleep(0.01)\nprint(name)\n', 'utf8');
  const worker = path.resolve('src/server/projectCheckLeaseWorker.py');
  const launcher = path.resolve('src/server/projectCheckWindowsJob.py');
  const launcherHash = createHash('sha256').update(fs.readFileSync(launcher)).digest('hex');
  const q = new SharedSourceCoordinator({ directory: path.join(directory, 'registry'), waitMs: 100, pollMs: 5 }); instances.push(q);
  const runId = 'c'.repeat(32);
  type TestHelper = { name: string; child: ReturnType<typeof spawn>; done: Promise<{ code: number | null; output: string }>; closed: boolean };
  const helpers: TestHelper[] = [];
  const release = (name: string) => fs.writeFileSync(path.join(directory, `${name}.release`), 'release');
  const start = async (lease: ProjectCheckSourceLease, name: string) => {
    const child = spawn(python, ['-I', '-S', '-B', worker], { cwd: directory, env: { SystemRoot: process.env.SystemRoot! }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; child.stdout!.on('data', chunk => { output = (output + String(chunk)).slice(-64 * 1024); });
    child.stderr!.on('data', chunk => { output = (output + String(chunk)).slice(-64 * 1024); });
    const helper: TestHelper = { name, child, closed: false, done: new Promise<{ code: number | null; output: string }>(resolve => {
      child.once('close', code => { helper.closed = true; resolve({ code, output }); });
    }) }; helpers.push(helper);
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    assert(child.pid);
    const command = { runner: 'windows-python-job-v1', runId, checkId: name,
      jobName: 'Local\\X4ForgeProjectCheck-' + createHash('sha256').update(JSON.stringify([runId, name])).digest('hex').slice(0, 32),
      executable: python, args: ['-I', '-S', '-B', probe, name], cwd: directory,
      environment: { SystemRoot: process.env.SystemRoot!, FORGE_ARTIFACT_ROOT: path.join(directory, 'artifact') },
      timeoutSeconds: 6, retainedOutputBytes: 64 * 1024, maxOutputBytes: 1024 * 1024 };
    const exactHash = createHash('sha256').update(canonicalJson(command)).digest('hex');
    const frame = lease.armProjectCheck({ bindingHash: createHash('sha256').update(exactHash).digest('hex'), commandHash: exactHash,
      helperPid: child.pid, jobName: command.jobName, launcherHash, runId }, 2);
    child.stdin!.end(JSON.stringify({ ...frame, command }) + '\n');
    return { helper, frame };
  };
  const entered = async (names: string[]) => {
    const until = performance.now() + 5_000;
    while (!names.every(name => fs.existsSync(path.join(directory, `${name}.started`)))) {
      const ended = helpers.filter(helper => names.includes(helper.name) && helper.closed);
      if (ended.length) throw new Error('A guarded helper ended before the overlap witness: ' + JSON.stringify(await Promise.all(ended.map(h => h.done))));
      assert(performance.now() < until, 'Real guarded commands did not enter before their deadline.');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  const completed = async (helper: typeof helpers[number]) => {
    const result = await helper.done; assert.equal(result.code, 0, result.output);
    const protocol = JSON.parse(result.output) as { status: string; treeEmpty: boolean; cleanupPersisted: boolean };
    assert.equal(protocol.status, 'passed'); assert.equal(protocol.treeEmpty, true); assert.equal(protocol.cleanupPersisted, true);
  };
  let cleanupUnconfirmed = false;
  try {
    await assert.rejects(q.run([key], owner, async lease => {
      const first = await start(lease, 'first'); const second = await start(lease, 'second');
      await entered(['first', 'second']);
      assert.equal(journal(q).filter(entry => entry.phase === 'running').length, 2);
      release('first'); await completed(first.helper); lease.assertProjectCheckDrained(first.frame);
      assert.equal(journal(q)[0].phase, 'confirmed'); assert.equal(journal(q)[1].phase, 'running');
      const third = await start(lease, 'third'); await entered(['second', 'third']);
      assert.equal(journal(q).filter(entry => entry.phase === 'running').length, 2);
      assert(third.frame.guardJson !== second.frame.guardJson);
      // End the handler while two independently guarded Jobs are still running.
    }), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    assert.equal(q.status([key]).active.length, 1);
    release('third'); await completed(helpers[2]);
    assert.equal(q.status([key]).active.length, 1, 'The other running Job must retain ownership.');
    release('second'); await completed(helpers[1]);
    assert.equal(q.status([key]).active.length, 0);
  } finally {
    for (const name of ['first', 'second', 'third']) release(name);
    for (const helper of helpers) {
      if (!helper.child.stdin!.writableEnded) helper.child.stdin!.end();
      await helper.done;
    }
    const status = q.status([key]);
    if (!status.available || status.active.length) { safeToRetire = false; cleanupUnconfirmed = true; }
  }
  if (cleanupUnconfirmed) throw new Error('Retaining fixture: actual guarded cleanup remains unconfirmed.');
  actualCommandsWitnessed = true;
}

try {
  await check('new_registry_uses_version3', async () => {
    const q = coordinator('fresh'); assert.equal(q.status([key]).available, true);
    assert.equal(SOURCE_COORDINATION_SCHEMA_VERSION, 3);
    const db = new Database(q.filename); try { assert.equal(db.pragma('user_version', { simple: true }), 3); } finally { db.close(); }
  });
  await check('default_budget_stays_serial', async () => {
    const q = coordinator('serial'); live.set(guard(1).helperPid, 'alive');
    await q.run([key], owner, lease => {
      lease.armProjectCheck(guard(1));
      assert.throws(() => lease.armProjectCheck(guard(2)), { code: 'PROJECT_CHECK_REARM_UNCONFIRMED' });
    });
    assert.equal(q.status([key]).active.length, 0);
  });
  await check('budget_two_preserves_sibling_and_releases_only_confirmed_slot', async () => {
    const q = coordinator('capacity'); for (const n of [3, 4, 5]) live.set(guard(n).helperPid, 'alive');
    await q.run([key], owner, lease => {
      const first = lease.armProjectCheck(guard(3), 2); const second = lease.armProjectCheck(guard(4), 2);
      assert.equal(journal(q).length, 2);
      assert.throws(() => lease.armProjectCheck(guard(5), 2), { code: 'PROJECT_CHECK_GUARD_CAPACITY' });
      phase(q, first, 'drained');
      assert.throws(() => lease.assertProjectCheckDrained(first), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      live.set(guard(3).helperPid, 'dead'); lease.assertProjectCheckDrained(first);
      assert.equal(journal(q)[1].phase, 'armed');
      const third = lease.armProjectCheck(guard(5), 2);
      assert.equal(journal(q)[0].phase, 'confirmed');
      assert.throws(() => lease.armProjectCheck(guard(3), 2), { code: 'PROJECT_CHECK_GUARD_REPLAY' });
      assert.throws(() => lease.armProjectCheck({ ...guard(6), runId: 'c'.repeat(32) }, 2), { code: 'PROJECT_CHECK_GUARD_INVALID' });
      assert.throws(() => lease.armProjectCheck(guard(6), 3), { code: 'PROJECT_CHECK_GUARD_INVALID' });
      for (const [frame, n] of [[second, 4], [third, 5]] as const) { phase(q, frame, 'drained'); live.set(guard(n).helperPid, 'dead'); lease.assertProjectCheckDrained(frame); }
    });
    assert.equal(q.status([key]).active.length, 0);
  });
  await check('invalid_budgets_do_not_arm', async () => {
    const q = coordinator('invalid');
    await q.run([key], owner, lease => {
      for (const value of [0, -1, 5, 1.5, NaN, Infinity, null, '2', true])
        assert.throws(() => lease.armProjectCheck(guard(7), value as number), { code: 'PROJECT_CHECK_GUARD_INVALID' });
      assert.equal(journal(q).length, 0);
    });
  });
  await check('budget_four_and_lifetime_limit_keep_exact_replay_history', async () => {
    const q = coordinator('lifetime');
    await q.run([key], owner, lease => {
      lease.assertProjectCheckAuthority(key, owner.workspaceId, owner.actor);
      assert.throws(() => lease.assertProjectCheckAuthority(key, 'foreign', owner.actor), { code: 'PROJECT_CHECK_SCOPE_MISMATCH' });
      const frames = [];
      for (let n = 20; n < 24; n++) { live.set(guard(n).helperPid, 'alive'); frames.push([lease.armProjectCheck(guard(n), 4), n] as const); }
      assert.equal(journal(q).filter(entry => entry.phase === 'armed').length, 4);
      assert.throws(() => lease.armProjectCheck(guard(24), 4), { code: 'PROJECT_CHECK_GUARD_CAPACITY' });
      for (const [frame, n] of frames) { phase(q, frame, 'drained'); live.set(guard(n).helperPid, 'dead'); lease.assertProjectCheckDrained(frame); }
      for (let n = 24; n < 52; n++) {
        live.set(guard(n).helperPid, 'alive'); const frame = lease.armProjectCheck(guard(n), 4);
        phase(q, frame, 'drained'); live.set(guard(n).helperPid, 'dead'); lease.assertProjectCheckDrained(frame);
      }
      assert.equal(journal(q).length, 32);
      assert.throws(() => lease.armProjectCheck(guard(52), 4), { code: 'PROJECT_CHECK_GUARD_LIMIT' });
      assert.throws(() => lease.armProjectCheck(guard(20), 4), { code: 'PROJECT_CHECK_GUARD_REPLAY' });
    });
  });
  await check('unknown_helper_exit_cannot_release_a_slot_or_claim', async () => {
    const q = coordinator('unknown'); live.set(guard(10).helperPid, 'alive');
    await q.run([key], owner, lease => {
      const frame = lease.armProjectCheck(guard(10)); phase(q, frame, 'drained'); live.set(guard(10).helperPid, 'unknown');
      assert.throws(() => lease.assertProjectCheckDrained(frame), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      assert.throws(() => lease.armProjectCheck(guard(11)), { code: 'PROJECT_CHECK_REARM_UNCONFIRMED' });
      assert.throws(() => lease.assertProjectCheckDrained({ ...frame }), { code: 'SOURCE_COORDINATION_LOST' });
      live.set(guard(10).helperPid, 'dead'); lease.assertProjectCheckDrained(frame);
      assert.throws(() => lease.assertProjectCheckDrained(frame), { code: 'SOURCE_COORDINATION_LOST' });
    });
  });
  await check('malformed_journal_never_grants_new_admission', async () => {
    const q = coordinator('malformed'); live.set(guard(12).helperPid, 'alive');
    await q.run([key], owner, lease => {
      lease.armProjectCheck(guard(12), 2); const original = journal(q); const db = new Database(q.filename);
      try {
        for (const bad of [[{ ...original[0], phase: 'lost' }], [...original, ...original], [{ ...original[0], extra: true }]]) {
          db.prepare('UPDATE claims SET guards_json = ?').run(JSON.stringify(bad));
          assert.equal(q.status([key]).available, false);
          assert.throws(() => lease.armProjectCheck(guard(13), 2), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
        }
        db.prepare('UPDATE claims SET guards_json = ?').run(JSON.stringify(original));
      } finally { db.close(); }
    });
  });
  await check('drain_ack_storage_failure_does_not_free_capacity', async () => {
    let denyAcknowledgement = true;
    const q = new SharedSourceCoordinator({ ...options('storage'), driverFactory: file => {
      const db = new Database(file);
      return { exec: sql => db.exec(sql), pragma: (sql, options) => db.pragma(sql, options),
        transaction: callback => db.transaction(callback), close: () => db.close(),
        prepare: sql => {
          const statement = db.prepare(sql);
          return { all: (...args) => statement.all(...args), get: (...args) => statement.get(...args), run: (...args) => {
            if (denyAcknowledgement && sql.startsWith('UPDATE claims SET guards_json = ? WHERE')) throw new Error('Injected acknowledgement storage failure');
            return statement.run(...args);
          } };
        } };
    } }); instances.push(q); live.set(guard(14).helperPid, 'alive');
    await q.run([key], owner, lease => {
      const frame = lease.armProjectCheck(guard(14)); phase(q, frame, 'drained'); live.set(guard(14).helperPid, 'dead');
      assert.throws(() => lease.assertProjectCheckDrained(frame), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
      assert.equal(journal(q)[0].phase, 'drained');
      assert.throws(() => lease.armProjectCheck(guard(15)), { code: 'PROJECT_CHECK_REARM_UNCONFIRMED' });
      denyAcknowledgement = false; lease.assertProjectCheckDrained(frame);
      assert.equal(journal(q)[0].phase, 'confirmed');
    });
  });
  await check('every_guard_must_drain_before_finished_claim_reclaims', async () => {
    const q = coordinator('retain'); for (const n of [8, 9]) live.set(guard(n).helperPid, 'alive');
    let second!: ReturnType<ProjectCheckSourceLease['armProjectCheck']>;
    await assert.rejects(q.run([key], owner, lease => {
      const first = lease.armProjectCheck(guard(8), 2); second = lease.armProjectCheck(guard(9), 2);
      phase(q, first, 'drained'); live.set(guard(8).helperPid, 'dead'); lease.assertProjectCheckDrained(first);
      phase(q, second, 'running');
    }), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    assert.equal(q.status([key]).active.length, 1);
    live.set(guard(9).helperPid, 'dead');
    assert.equal(q.status([key]).active.length, 1, 'Helper death alone is not durable drain.');
    phase(q, second, 'drained'); assert.equal(q.status([key]).active.length, 0);
  });
  await check('dead_remote_backend_still_requires_every_guard_drain_and_exit', async () => {
    const q = coordinator('orphan'); const remote = 0x7ffe0007;
    live.set(remote, 'dead'); for (const n of [60, 61]) live.set(guard(n).helperPid, 'alive');
    let remaining!: ReturnType<ProjectCheckSourceLease['armProjectCheck']>;
    await q.run([key], owner, lease => {
      const first = lease.armProjectCheck(guard(60), 2); remaining = lease.armProjectCheck(guard(61), 2);
      phase(q, first, 'drained'); phase(q, remaining, 'running'); live.set(guard(60).helperPid, 'dead');
      const db = new Database(q.filename); try { db.prepare('UPDATE claims SET pid = ?').run(remote); } finally { db.close(); }
    });
    assert.equal(q.status([key]).active.length, 1);
    live.set(guard(61).helperPid, 'dead'); assert.equal(q.status([key]).active.length, 1);
    phase(q, remaining, 'drained'); live.set(guard(61).helperPid, 'unknown');
    assert.equal(q.status([key]).active.length, 1);
    live.set(guard(61).helperPid, 'dead'); assert.equal(q.status([key]).active.length, 0);
  });
  for (const version of [1, 2]) await check(`empty_schema${version}_migrates_and_old_columns_refuse`, () => {
    seedLegacy(`legacy${version}`, version); const q = coordinator(`legacy${version}`);
    assert.equal(q.status([key]).available, true);
    const db = new Database(q.filename); try {
      assert.equal(db.pragma('user_version', { simple: true }), 3);
      assert.throws(() => db.prepare('SELECT guard_json, guard_phase FROM claims').all());
      assert.throws(() => db.prepare("INSERT INTO claims (id,instance_id,pid,keys_json,owner_json,queued_at,started_at,state) VALUES (?,?,?,?,?,?,NULL,'waiting')")
        .run(randomUUID(), randomUUID(), process.pid, JSON.stringify([key]), JSON.stringify(owner), new Date().toISOString()));
    } finally { db.close(); }
  });
  await check('nonempty_legacy_refuses_without_changing_database', () => {
    const dir = seedLegacy('nonempty', 2, true); const file = path.join(dir, SOURCE_COORDINATION_FILENAME);
    const before = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const q = coordinator('nonempty'); assert.equal(q.status([key]).available, false);
    assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), before);
  });
  await check('triggered_or_misstamped_legacy_registry_refuses_without_reset', () => {
    for (const name of ['triggered', 'misstamped']) {
      const dir = seedLegacy(name); const file = path.join(dir, SOURCE_COORDINATION_FILENAME); const db = new Database(file);
      try {
        if (name === 'triggered') db.exec('CREATE TRIGGER legacy_trigger AFTER INSERT ON claims BEGIN SELECT 1; END;');
        else db.pragma('user_version = 3');
      } finally { db.close(); }
      const before = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const q = coordinator(name); assert.equal(q.status([key]).available, false);
      assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), before);
    }
  });
  await check('already_open_real_legacy_client_refuses_after_upgrade', async () => {
    const old = spawnSync('git', ['show', '5cc4753:src/server/sharedSourceCoordinator.ts'], { encoding: 'utf8', windowsHide: true });
    assert.equal(old.status, 0, old.stderr);
    const filename = path.resolve('src/server/sharedSourceCoordinator.ts'); const exports: Record<string, unknown> = {};
    const js = ts.transpileModule(old.stdout, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
      .outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
    const load = vm.runInThisContext(`(function(exports,require,module,__filename,__dirname){${js}\n})`) as
      (exports: object, require: NodeJS.Require, module: object, filename: string, directory: string) => void;
    load(exports, createRequire(filename), { exports }, filename, path.dirname(filename));
    const Old = exports.SharedSourceCoordinator as new (options: ConstructorParameters<typeof SharedSourceCoordinator>[0]) => SharedSourceCoordinator;
    const oldClient = new Old(options('cached')); instances.push(oldClient);
    assert.equal(oldClient.status([key]).available, true);
    const q = coordinator('cached'); assert.equal(q.status([key]).available, true);
    assert.equal(oldClient.status([key]).available, false);
    let entered = false;
    await assert.rejects(oldClient.run([key], owner, () => { entered = true; }), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
    assert.equal(entered, false); assert.equal(q.status([key]).active.length, 0);
  });
  if (checks.every(value => value.pass)) await check('real_two_job_overlap_and_last_worker_drain', realJobsWitness);
} finally {
  for (const q of instances) q.close();
  meterFixture();
  const current = fs.lstatSync(root, { bigint: true });
  assert(current.dev === stamp.dev && current.ino === stamp.ino && fs.realpathSync.native(root) === root && path.dirname(root) === parent);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'owner.json'), 'utf8')).owner, 'forge-multiworker-test');
  if (safeToRetire) { fs.rmSync(root, { recursive: true, force: false }); assert(!fs.existsSync(root)); }
}
console.log(JSON.stringify({ allPassed: checks.every(c => c.pass), passed: checks.filter(c => c.pass).length,
  total: checks.length, checks, realSQLite: true, syntheticLivenessOnly: !actualCommandsWitnessed, actualCommandsWitnessed,
  fixtureRetired: safeToRetire, peakFootprint, footprintLimit, ...(safeToRetire ? {} : { retainedFixture: root }) }));
if (checks.some(c => !c.pass)) process.exitCode = 1;
