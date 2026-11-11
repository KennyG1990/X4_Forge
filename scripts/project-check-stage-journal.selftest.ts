import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator, PROJECT_CHECK_STAGE_LIMITS, type RegistryDatabase, type ProjectCheckSourceLease,
  type ProjectCheckStageHandle, type ProjectCheckStageRecord } from '../src/server/sharedSourceCoordinator';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as new (file: string) => RegistryDatabase;
const input = process.env.FORGE_QA_TMP;
assert(input && path.isAbsolute(input), 'Explicit private FORGE_QA_TMP required.');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(input), 'x4-stage-journal-'));
const rootStamp = fs.lstatSync(root, { bigint: true });
const stages = path.join(root, 'stages'); fs.mkdirSync(stages);
const sentinel = path.join(root, 'unrelated.txt'); fs.writeFileSync(sentinel, 'unrelated-owned-test-sentinel');
const owner = { actor: 'stage-fixture', workspaceId: 'ws_stage_fixture', operation: 'stage-journal-test' };
const sourceKey = canonicalSourceKey(path.join(root, 'mod'));
const runId = 'a'.repeat(32);
const instances: SharedSourceCoordinator[] = [];
const observations: { name: string; pass: boolean; error?: string }[] = [];
const live = new Map<number, 'alive' | 'dead' | 'unknown'>();
const peak = { bytes: 0, entries: 0 };
function coordinator(name: string) {
  const value = new SharedSourceCoordinator({ directory: path.join(root, name), waitMs: 1000, pollMs: 5,
    liveness: pid => live.get(pid) ?? 'unknown' });
  instances.push(value); return value;
}
function meter() {
  let bytes = 0; let entries = 0;
  const walk = (directory: string) => {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name); const stat = fs.lstatSync(file);
      assert(!stat.isSymbolicLink(), 'Fixture alias was not removed.'); entries++;
      if (stat.isDirectory()) walk(file); else { assert(stat.isFile()); bytes += stat.size; }
    }
  };
  walk(root); peak.bytes = Math.max(bytes, peak.bytes); peak.entries = Math.max(entries, peak.entries);
  assert(bytes <= 8 * 1024 * 1024 && entries <= 1000, 'Journal fixture exceeds its bounded footprint.');
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unrelated-owned-test-sentinel');
}
async function check(name: string, test: () => unknown | Promise<unknown>) {
  try { await test(); meter(); observations.push({ name, pass: true }); }
  catch (error) { observations.push({ name, pass: false, error: String(error) }); }
}
// Keep direct access restricted to controlled corruption/liveness fixtures.
function database(q: SharedSourceCoordinator, task: (db: RegistryDatabase) => void) {
  const db = new Database(q.filename); try { task(db); } finally { db.close(); }
}
type Lease = ProjectCheckSourceLease;
const scope = { sourceKey, workspaceId: owner.workspaceId, actorId: owner.actor, runId };
const reservation = { ...scope, parent: stages, kind: 'setup' as const, bytes: 64, entries: 4 };
const created = (directory: string) => {
  const value = fs.lstatSync(directory, { bigint: true }); return { device: value.dev.toString(), file: value.ino.toString() };
};
function adopt(lease: Lease, stage = lease.reserveProjectCheckStage(reservation)) {
  fs.mkdirSync(stage.root); lease.adoptProjectCheckStage(stage, created(stage.root)); return stage;
}
const remove = (stage: Readonly<ProjectCheckStageRecord>, assertOwned: () => void) => {
  assertOwned(); fs.rmSync(stage.root, { recursive: true }); return undefined;
};
function mutate(q: SharedSourceCoordinator, change: (record: ProjectCheckStageRecord) => unknown) {
  database(q, db => {
    const rows = db.prepare('SELECT id,record_json FROM project_check_stages').all() as { id: string; record_json: string }[];
    assert.equal(rows.length, 1);
    const record = JSON.parse(rows[0].record_json) as ProjectCheckStageRecord; change(record);
    db.prepare('UPDATE project_check_stages SET record_json = ? WHERE id = ?').run(JSON.stringify(record), rows[0].id);
  });
}

try {
  await check('stage_reservation_is_durable_before_payload_creation', async () => {
    const q = coordinator('durability');
    await q.run([sourceKey], owner, (lease: Lease) => {
      assert.equal(typeof lease.reserveProjectCheckStage, 'function');
      const stage = lease.reserveProjectCheckStage(reservation);
      assert.equal(fs.existsSync(stage.root), false);
      database(q, db => assert.equal(db.prepare('SELECT id FROM project_check_stages').all().length, 1));
    });
    q.close();
    const reopened = coordinator('durability'); const [record] = reopened.projectCheckStages();
    assert.equal(record.identity, null); assert.equal(record.bytes, 64); assert.equal(record.entries, 4);
    let called = false;
    reopened.retireAbandonedProjectCheckStage(record.id, scope, () => { called = true; return undefined; });
    assert.equal(called, false); assert.equal(reopened.projectCheckStages().length, 0);
  });
  await check('adopted_stage_has_creator_identity_and_exact_live_handle', async () => {
    const q = coordinator('adoption'); let old!: Readonly<ProjectCheckStageHandle>;
    await q.run([sourceKey], owner, lease => {
      old = adopt(lease); lease.assertProjectCheckStage(old);
      assert.throws(() => lease.assertProjectCheckStage({ ...old }));
      assert.throws(() => lease.adoptProjectCheckStage(old, created(old.root)));
      fs.writeFileSync(path.join(old.root, 'payload'), 'owned-payload');
      assert.equal(q.projectCheckStages()[0].identity?.file, created(old.root).file);
      assert.throws(() => q.retireAbandonedProjectCheckStage(old.id, scope, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      lease.retireProjectCheckStage(old, remove);
      assert.throws(() => lease.assertProjectCheckStage(old));
      assert.equal(q.projectCheckStages().length, 0);
    });
    await q.run([sourceKey], owner, lease => assert.throws(() => lease.assertProjectCheckStage(old)));
  });
  await check('nonempty_unadopted_stage_is_preserved', async () => {
    const q = coordinator('unadopted'); let stage!: Readonly<ProjectCheckStageHandle>;
    await q.run([sourceKey], owner, lease => {
      stage = lease.reserveProjectCheckStage(reservation); fs.mkdirSync(stage.root);
      fs.writeFileSync(path.join(stage.root, 'foreign'), 'preserve');
      assert.throws(() => lease.adoptProjectCheckStage(stage, created(stage.root)));
      assert.throws(() => lease.retireProjectCheckStage(stage, remove));
    });
    assert.throws(() => q.retireAbandonedProjectCheckStage(stage.id, scope, remove));
    assert.equal(fs.readFileSync(path.join(stage.root, 'foreign'), 'utf8'), 'preserve');
    assert.equal(q.projectCheckStages().length, 1);
  });
  await check('empty_root_replacement_before_adoption_refuses_creator_mismatch', async () => {
    const q = coordinator('before-adopt');
    await q.run([sourceKey], owner, lease => {
      const stage = lease.reserveProjectCheckStage(reservation); fs.mkdirSync(stage.root); const identity = created(stage.root);
      const moved = stage.root + '-held'; fs.renameSync(stage.root, moved); fs.mkdirSync(stage.root);
      try { assert.throws(() => lease.adoptProjectCheckStage(stage, identity)); }
      finally { fs.rmdirSync(stage.root); fs.renameSync(moved, stage.root); }
      lease.adoptProjectCheckStage(stage, identity); lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('wrong_scope_and_closed_lease_cannot_reserve_or_retire', async () => {
    const q = coordinator('scope'); let saved!: Lease; let stage!: Readonly<ProjectCheckStageHandle>;
    await q.run([sourceKey], owner, lease => {
      saved = lease;
      for (const delta of [{ actorId: 'foreign' }, { workspaceId: 'foreign' }, { sourceKey: canonicalSourceKey(path.join(root, 'other-mod')) }])
        assert.throws(() => lease.reserveProjectCheckStage({ ...reservation, ...delta }));
      stage = adopt(lease);
      assert.throws(() => lease.reserveProjectCheckStage({ ...reservation, runId: 'b'.repeat(32) }));
    });
    assert.throws(() => saved.reserveProjectCheckStage(reservation));
    assert.throws(() => saved.adoptProjectCheckStage(stage, created(stage.root)));
    assert.throws(() => saved.retireProjectCheckStage(stage, remove));
    for (const delta of [{ actorId: 'foreign' }, { workspaceId: 'foreign' }, { runId: 'b'.repeat(32) }, { sourceKey: 'source:foreign' }])
      assert.throws(() => q.retireAbandonedProjectCheckStage(stage.id, { ...scope, ...delta }, remove));
    q.retireAbandonedProjectCheckStage(stage.id, scope, remove);
  });
  await check('parent_and_adopted_root_replacement_are_preserved', async () => {
    const q = coordinator('physical');
    await q.run([sourceKey], owner, lease => {
      const stage = adopt(lease);
      const held = stage.root + '-held'; fs.renameSync(stage.root, held); fs.mkdirSync(stage.root);
      try {
        assert.throws(() => lease.assertProjectCheckStage(stage));
        assert.throws(() => lease.retireProjectCheckStage(stage, remove));
        assert(fs.existsSync(stage.root));
      } finally { fs.rmdirSync(stage.root); fs.renameSync(held, stage.root); }
      const heldParent = stages + '-held'; fs.renameSync(stages, heldParent); fs.mkdirSync(stages);
      try { assert.throws(() => lease.assertProjectCheckStage(stage)); assert.throws(() => lease.retireProjectCheckStage(stage, remove)); }
      finally { fs.rmdirSync(stages); fs.renameSync(heldParent, stages); }
      lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('live_handle_pins_the_original_adopted_metadata', async () => {
    const q = coordinator('pinned-handle');
    await q.run([sourceKey], owner, lease => {
      const stage = adopt(lease); const [original] = q.projectCheckStages();
      const held = stage.root + '-held'; fs.renameSync(stage.root, held); fs.mkdirSync(stage.root);
      mutate(q, record => { record.identity = created(stage.root); });
      try { assert.throws(() => lease.assertProjectCheckStage(stage)); assert.throws(() => lease.retireProjectCheckStage(stage, remove)); }
      finally {
        fs.rmdirSync(stage.root); fs.renameSync(held, stage.root);
        database(q, db => db.prepare('UPDATE project_check_stages SET record_json = ?').run(JSON.stringify(original)));
      }
      lease.assertProjectCheckStage(stage); lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('junction_parent_and_root_refuse_without_touching_destination', async () => {
    const q = coordinator('aliases'); const destination = path.join(root, 'alias-destination'); fs.mkdirSync(destination);
    const payload = path.join(destination, 'preserve'); fs.writeFileSync(payload, 'preserve');
    const alias = path.join(root, 'alias-parent'); fs.symlinkSync(destination, alias, 'junction');
    try { await q.run([sourceKey], owner, lease => {
      assert.throws(() => lease.reserveProjectCheckStage({ ...reservation, parent: alias }));
      const stage = lease.reserveProjectCheckStage(reservation); fs.symlinkSync(destination, stage.root, 'junction');
      try {
        assert.throws(() => lease.adoptProjectCheckStage(stage, created(destination)));
        assert.throws(() => lease.retireProjectCheckStage(stage, remove));
        assert.equal(fs.readFileSync(payload, 'utf8'), 'preserve');
      } finally { fs.unlinkSync(stage.root); }
      lease.retireProjectCheckStage(stage, remove);
    }); } finally { fs.unlinkSync(alias); }
  });
  await check('source_and_registry_overlap_refuse', async () => {
    const q = coordinator('overlap');
    await q.run([sourceKey], owner, lease => {
      assert.throws(() => lease.reserveProjectCheckStage({ ...reservation, parent: root }));
      assert.throws(() => lease.reserveProjectCheckStage({ ...reservation, parent: path.dirname(q.filename) }));
      assert.equal(q.projectCheckStages().length, 0);
    });
  });
  for (const dimension of ['bytes', 'entries'] as const) await check(`shared_${dimension}_quota_counts_abandoned_reservations`, async () => {
    const q = coordinator(`quota-${dimension}`); const other = coordinator(`quota-${dimension}`);
    const otherKey = canonicalSourceKey(path.join(root, 'second-mod'));
    await q.run([sourceKey], owner, async lease => {
      const stage = lease.reserveProjectCheckStage({ ...reservation, [dimension]: PROJECT_CHECK_STAGE_LIMITS[dimension] });
      await assert.rejects(other.run([otherKey], owner, second => second.reserveProjectCheckStage({ ...reservation, sourceKey: otherKey })), { code: 'PROJECT_CHECK_STAGE_LIMIT' });
      assert.equal(fs.existsSync(stage.root), false);
    });
    await assert.rejects(other.run([otherKey], owner, second => second.reserveProjectCheckStage({ ...reservation, sourceKey: otherKey })), { code: 'PROJECT_CHECK_STAGE_LIMIT' });
    const [prior] = q.projectCheckStages(); q.retireAbandonedProjectCheckStage(prior.id, scope, remove);
    await other.run([otherKey], owner, second => { second.reserveProjectCheckStage({ ...reservation, sourceKey: otherKey }); });
  });
  await check('shared_root_quota_and_invalid_budgets_create_no_payload', async () => {
    const q = coordinator('root-quota');
    await q.run([sourceKey], owner, lease => {
      for (const delta of [{ bytes: -1 }, { bytes: NaN }, { bytes: Infinity }, { bytes: 1.5 }, { entries: 0 }, { entries: 1.1 }, { entries: NaN }, { kind: 'foreign' }])
        assert.throws(() => lease.reserveProjectCheckStage({ ...reservation, ...delta } as Parameters<Lease['reserveProjectCheckStage']>[0]));
      for (let n = 0; n < PROJECT_CHECK_STAGE_LIMITS.roots; n++) lease.reserveProjectCheckStage(reservation);
      assert.throws(() => lease.reserveProjectCheckStage(reservation), { code: 'PROJECT_CHECK_STAGE_LIMIT' });
      assert.equal(q.projectCheckStages().length, PROJECT_CHECK_STAGE_LIMITS.roots);
    });
  });
  await check('cleanup_failure_retains_reservation_and_blocks_new_arm_until_acknowledged', async () => {
    const q = coordinator('callback-fault');
    await q.run([sourceKey], owner, lease => {
      const stage = adopt(lease);
      assert.throws(() => lease.retireProjectCheckStage(stage, () => { throw new Error('fixture-cleanup-fault'); }), /fixture-cleanup-fault/);
      assert(q.projectCheckStages()[0].retirement); assert(fs.existsSync(stage.root));
      assert.throws(() => lease.assertProjectCheckStage(stage));
      assert.throws(() => lease.reserveProjectCheckStage(reservation));
      lease.retireProjectCheckStage(stage, (record, owned) => {
        assert.throws(() => lease.retireProjectCheckStage(stage, remove), /reentrant/);
        return remove(record, owned);
      });
    });
  });
  await check('live_and_unknown_retirement_owner_blocks_dead_owner_can_resume', async () => {
    const q = coordinator('takeover'); let id = '';
    await q.run([sourceKey], owner, lease => { const stage = adopt(lease); id = stage.id; });
    const foreignPid = 0x7ffe0001;
    mutate(q, record => { record.retirement = { token: randomUUID(), instanceId: randomUUID(), pid: foreignPid }; });
    for (const state of ['alive', 'unknown'] as const) {
      live.set(foreignPid, state);
      assert.throws(() => q.retireAbandonedProjectCheckStage(id, scope, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    }
    live.set(foreignPid, 'dead'); q.retireAbandonedProjectCheckStage(id, scope, remove);
    assert.equal(q.projectCheckStages().length, 0);
  });
  await check('adoption_storage_fault_preserves_unadopted_reservation', async () => {
    const q = coordinator('adoption-fault');
    await q.run([sourceKey], owner, lease => {
      const stage = lease.reserveProjectCheckStage(reservation); fs.mkdirSync(stage.root);
      database(q, db => db.exec("CREATE TRIGGER fail_adopt BEFORE UPDATE ON project_check_stages BEGIN SELECT RAISE(FAIL,'fixture-adoption-fault'); END;"));
      assert.throws(() => lease.adoptProjectCheckStage(stage, created(stage.root)), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
      assert.equal(q.projectCheckStages()[0].identity, null);
      database(q, db => db.exec('DROP TRIGGER fail_adopt'));
      lease.adoptProjectCheckStage(stage, created(stage.root)); lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('delete_acknowledgement_fault_preserves_row_after_physical_cleanup', async () => {
    const q = coordinator('ack-fault');
    await q.run([sourceKey], owner, lease => {
      const stage = adopt(lease);
      database(q, db => db.exec("CREATE TRIGGER fail_ack BEFORE DELETE ON project_check_stages BEGIN SELECT RAISE(FAIL,'fixture-ack-fault'); END;"));
      assert.throws(() => lease.retireProjectCheckStage(stage, remove), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
      assert.equal(fs.existsSync(stage.root), false); assert.equal(q.projectCheckStages().length, 1);
      database(q, db => db.exec('DROP TRIGGER fail_ack'));
      lease.retireProjectCheckStage(stage, () => { assert.fail('Missing stage must not invoke filesystem cleanup.'); });
      assert.equal(q.projectCheckStages().length, 0);
    });
  });
  await check('malformed_or_overbudget_journal_refuses_without_reset', async () => {
    const q = coordinator('corruption');
    await q.run([sourceKey], owner, lease => {
      const stage = lease.reserveProjectCheckStage(reservation);
      const [original] = q.projectCheckStages();
      for (const bad of [{ ...original, root: sentinel }, { ...original, unexpected: true }, { ...original, bytes: PROJECT_CHECK_STAGE_LIMITS.bytes + 1 },
        { ...original, parent: { ...original.parent, file: '0' } }, { ...original, retirement: { token: 'bad' } }]) {
        database(q, db => db.prepare('UPDATE project_check_stages SET record_json = ?').run(JSON.stringify(bad)));
        assert.throws(() => q.projectCheckStages()); assert.throws(() => lease.reserveProjectCheckStage(reservation));
        assert.throws(() => lease.retireProjectCheckStage(stage, remove));
        database(q, db => assert.equal((db.prepare('SELECT record_json FROM project_check_stages').get() as { record_json: string }).record_json, JSON.stringify(bad)));
      }
      database(q, db => db.prepare('UPDATE project_check_stages SET record_json = ?').run(JSON.stringify(original)));
      lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('every_unconfirmed_guard_blocks_owner_and_orphan_retirement', async () => {
    const q = coordinator('guard-drain'); const helperPid = 0x7ffe0002; live.set(helperPid, 'alive');
    let id = ''; let frame!: ReturnType<Lease['armProjectCheck']>;
    const guard = { bindingHash: 'b'.repeat(64), commandHash: 'c'.repeat(64), launcherHash: 'd'.repeat(64),
      helperPid, jobName: `Local\\X4ForgeProjectCheck-${'f'.repeat(32)}`, runId };
    const phase = (next: string) => database(q, db => {
      const row = db.prepare('SELECT guards_json FROM claims').get() as { guards_json: string };
      const journal = JSON.parse(row.guards_json); journal[0].phase = next;
      db.prepare('UPDATE claims SET guards_json = ?').run(JSON.stringify(journal));
    });
    await assert.rejects(q.run([sourceKey], owner, lease => {
      const stage = adopt(lease); id = stage.id; frame = lease.armProjectCheck(guard);
      assert.throws(() => lease.retireProjectCheckStage(stage, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      phase('running');
      assert.throws(() => lease.retireProjectCheckStage(stage, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      assert.throws(() => q.retireAbandonedProjectCheckStage(id, scope, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      phase('drained'); live.set(helperPid, 'unknown');
      assert.throws(() => lease.assertProjectCheckDrained(frame), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      assert.throws(() => lease.retireProjectCheckStage(stage, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    }), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    assert.throws(() => q.retireAbandonedProjectCheckStage(id, scope, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    live.set(helperPid, 'alive');
    assert.throws(() => q.retireAbandonedProjectCheckStage(id, scope, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    live.set(helperPid, 'dead'); q.retireAbandonedProjectCheckStage(id, scope, remove);
    assert.equal(q.projectCheckStages().length, 0);
  });
  await check('retiring_stage_cannot_arm_a_delayed_new_command', async () => {
    const q = coordinator('no-rearm');
    await q.run([sourceKey], owner, lease => {
      const stage = adopt(lease);
      lease.retireProjectCheckStage(stage, (record, owned) => {
        assert.throws(() => lease.armProjectCheck({ bindingHash: 'b'.repeat(64), commandHash: 'c'.repeat(64), launcherHash: 'd'.repeat(64),
          helperPid: 0x7ffe0003, jobName: `Local\\X4ForgeProjectCheck-${'f'.repeat(32)}`, runId }), { code: 'PROJECT_CHECK_GUARD_INVALID' });
        return remove(record, owned);
      });
    });
  });
  await check('exact_confirmed_guard_allows_current_owner_retirement', async () => {
    const q = coordinator('confirmed-drain'); const helperPid = 0x7ffe0004; live.set(helperPid, 'alive');
    await q.run([sourceKey], owner, lease => {
      const stage = adopt(lease);
      const frame = lease.armProjectCheck({ bindingHash: 'b'.repeat(64), commandHash: 'c'.repeat(64), launcherHash: 'd'.repeat(64),
        helperPid, jobName: `Local\\X4ForgeProjectCheck-${'f'.repeat(32)}`, runId });
      database(q, db => {
        const row = db.prepare('SELECT guards_json FROM claims').get() as { guards_json: string };
        const entries = JSON.parse(row.guards_json); entries[0].phase = 'drained';
        db.prepare('UPDATE claims SET guards_json = ?').run(JSON.stringify(entries));
      });
      live.set(helperPid, 'dead'); lease.assertProjectCheckDrained(frame);
      lease.retireProjectCheckStage(stage, remove); assert.equal(q.projectCheckStages().length, 0);
    });
  });
  await check('reservation_and_retirement_admission_storage_faults_keep_exact_state', async () => {
    const q = coordinator('admission-fault');
    await q.run([sourceKey], owner, lease => {
      database(q, db => db.exec("CREATE TRIGGER fail_reserve BEFORE INSERT ON project_check_stages BEGIN SELECT RAISE(FAIL,'fixture-reserve-fault'); END;"));
      assert.throws(() => lease.reserveProjectCheckStage(reservation), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
      assert.equal(q.projectCheckStages().length, 0); database(q, db => db.exec('DROP TRIGGER fail_reserve'));
      const stage = adopt(lease); const before = JSON.stringify(q.projectCheckStages());
      database(q, db => db.exec("CREATE TRIGGER fail_retire BEFORE UPDATE ON project_check_stages BEGIN SELECT RAISE(FAIL,'fixture-retire-fault'); END;"));
      let called = false;
      assert.throws(() => lease.retireProjectCheckStage(stage, () => { called = true; return undefined; }), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
      assert.equal(called, false); assert.equal(JSON.stringify(q.projectCheckStages()), before);
      database(q, db => db.exec('DROP TRIGGER fail_retire')); lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('cross_instance_retirement_cannot_overlap_synchronous_cleanup', async () => {
    const q = coordinator('exclusive-retire'); const other = coordinator('exclusive-retire'); let id = '';
    await q.run([sourceKey], owner, lease => { id = adopt(lease).id; });
    q.retireAbandonedProjectCheckStage(id, scope, (record, owned) => {
      assert.throws(() => other.retireAbandonedProjectCheckStage(id, scope, remove), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
      assert.throws(() => q.close(), { code: 'SOURCE_COORDINATION_BUSY' }); return remove(record, owned);
    });
    assert.equal(other.projectCheckStages().length, 0);
  });
  await check('another_registry_cannot_adopt_or_retire_the_original_handle', async () => {
    const q = coordinator('original-registry'); const other = coordinator('foreign-registry');
    await q.run([sourceKey], owner, async lease => {
      const stage = adopt(lease);
      await other.run([sourceKey], owner, second => {
        assert.throws(() => second.adoptProjectCheckStage(stage, created(stage.root)));
        assert.throws(() => second.retireProjectCheckStage(stage, remove));
        assert.throws(() => other.retireAbandonedProjectCheckStage(stage.id, scope, remove));
      });
      lease.assertProjectCheckStage(stage); lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('hardlinked_registry_refuses_stage_access_and_preserves_rows', async () => {
    const q = coordinator('registry-link');
    await q.run([sourceKey], owner, lease => {
      const stage = adopt(lease); const link = path.join(root, 'registry-hardlink'); fs.linkSync(q.filename, link);
      try {
        assert.throws(() => q.projectCheckStages());
        assert.throws(() => lease.reserveProjectCheckStage(reservation));
        assert.throws(() => lease.retireProjectCheckStage(stage, remove));
        assert(fs.existsSync(stage.root));
      } finally { fs.unlinkSync(link); }
      lease.assertProjectCheckStage(stage); lease.retireProjectCheckStage(stage, remove);
    });
  });
  await check('schema3_worker_refuses_schema4_before_changing_any_guard', () => {
    const q = coordinator('old-worker'); assert(q.status([sourceKey]).available);
    const old = spawnSync('git', ['show', '7b5c2c5:src/server/projectCheckLeaseWorker.py'], { encoding: 'utf8', windowsHide: true });
    assert.equal(old.status, 0, old.stderr); const before = fs.readFileSync(q.filename);
    const python = process.env.FORGE_QA_PYTHON; assert(python);
    const code = `import json,sys,sqlite3,types\nfrom pathlib import Path\nx=json.load(sys.stdin)\nm=types.ModuleType('old_worker_fixture')\nexec(compile(x['source'],'old-worker-fixture.py','exec'),m.__dict__)\np=Path(x['registry'])\ndb=sqlite3.connect(p,isolation_level=None)\ntry:\n m._transition(db,p,m._registry_identity(p),{},'armed','running')\n raise AssertionError('old worker admitted')\nexcept RuntimeError as e:\n assert str(e)=='Unexpected coordination database version.',str(e)\n assert not db.in_transaction\n print('old-worker-refused')\nfinally:\n db.close()\n`;
    const result = spawnSync(python, ['-I', '-S', '-B', '-c', code], { windowsHide: true, encoding: 'utf8',
      input: JSON.stringify({ source: old.stdout, registry: q.filename }), timeout: 5000 });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /old-worker-refused/);
    assert.deepEqual(fs.readFileSync(q.filename), before);
  });
  await check('old_cached_schema3_client_refuses_after_empty_upgrade', async () => {
    const old = spawnSync('git', ['show', '7b5c2c5:src/server/sharedSourceCoordinator.ts'], { encoding: 'utf8', windowsHide: true });
    assert.equal(old.status, 0, old.stderr);
    const filename = path.resolve('src/server/sharedSourceCoordinator.ts'); const exports: Record<string, unknown> = {};
    const code = ts.transpileModule(old.stdout, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
      .outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
    const load = vm.runInThisContext(`(function(exports,require,module,__filename,__dirname){${code}\n})`) as
      (exports: object, require: NodeJS.Require, module: object, file: string, directory: string) => void;
    load(exports, createRequire(filename), { exports }, filename, path.dirname(filename));
    const Old = exports.SharedSourceCoordinator as typeof SharedSourceCoordinator;
    const previous = new Old({ directory: path.join(root, 'cached-schema3') }); instances.push(previous);
    assert.equal(previous.status([sourceKey]).available, true);
    const current = coordinator('cached-schema3'); assert.equal(current.status([sourceKey]).available, true);
    assert.equal(previous.status([sourceKey]).available, false);
    let called = false; await assert.rejects(previous.run([sourceKey], owner, () => { called = true; }), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
    assert.equal(called, false);
  });
  await check('old_schema4_journal_client_cannot_discard_a_new_sealed_stage', async () => {
    const old = spawnSync('git', ['show', '793a446:src/server/sharedSourceCoordinator.ts'], { encoding: 'utf8', windowsHide: true });
    assert.equal(old.status, 0, old.stderr);
    const filename = path.resolve('src/server/sharedSourceCoordinator.ts'); const exports: Record<string, unknown> = {};
    const code = ts.transpileModule(old.stdout, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
      .outputText.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
    const load = vm.runInThisContext(`(function(exports,require,module,__filename,__dirname){${code}\n})`) as
      (exports: object, require: NodeJS.Require, module: object, file: string, directory: string) => void;
    load(exports, createRequire(filename), { exports }, filename, path.dirname(filename));
    const Old = exports.SharedSourceCoordinator as typeof SharedSourceCoordinator;
    const previous = new Old({ directory: path.join(root, 'old-journal4') }); instances.push(previous);
    assert(previous.status([sourceKey]).available);
    const q = coordinator('old-journal4'); let oldCallback = false;
    await q.run([sourceKey], owner, async lease => {
      const stage = lease.reserveProjectCheckStage({ ...reservation, manifest: { bytes: 1, sha256: 'a'.repeat(64) } });
      const before = JSON.stringify(q.projectCheckStages());
      assert.throws(() => previous.projectCheckStages());
      assert.throws(() => previous.retireAbandonedProjectCheckStage(stage.id, scope, () => { oldCallback = true; return undefined; }));
      const otherKey = canonicalSourceKey(path.join(root, 'old-client-other-source'));
      await assert.rejects(previous.run([otherKey], owner, oldLease => oldLease.reserveProjectCheckStage({ ...reservation, sourceKey: otherKey })), { code: 'SOURCE_COORDINATION_UNAVAILABLE' });
      assert.equal(oldCallback, false); assert.equal(JSON.stringify(q.projectCheckStages()), before);
      lease.retireProjectCheckStage(stage, remove);
    });
  });
} finally {
  for (const q of instances) q.close();
  meter();
  const current = fs.lstatSync(root, { bigint: true });
  assert(current.isDirectory() && current.dev === rootStamp.dev && current.ino === rootStamp.ino
    && fs.realpathSync.native(root) === root, 'Retain replaced fixture root.');
  fs.rmSync(root, { recursive: true });
}
console.log(JSON.stringify({ checks: observations, passed: observations.filter(row => row.pass).length,
  total: observations.length, peak, fixtureRetired: !fs.existsSync(root) }));
if (observations.some(row => !row.pass)) process.exitCode = 1;
