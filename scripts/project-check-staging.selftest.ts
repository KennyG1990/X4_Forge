import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { buildArtifactPlan } from '../src/lib/artifactPipeline';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';
import { SharedSourceCoordinator, type ProjectCheckSourceLease, type RegistryDatabase } from '../src/server/sharedSourceCoordinator';
import { createOwnedProjectCheckStage, PROJECT_CHECK_STAGE_MANIFEST, retireAbandonedProjectCheckStages,
  retireProjectCheckStageFiles, type ProjectCheckStageContext } from '../src/server/projectCheckStaging';

const input = process.env.FORGE_QA_TMP;
assert(input && path.isAbsolute(input));
const parent = fs.realpathSync.native(input);
const root = fs.mkdtempSync(path.join(parent, 'x4-owned-staging-')); const stamp = fs.lstatSync(root, { bigint: true });
const scratch = path.join(root, 'scratch'); fs.mkdirSync(scratch);
const sentinel = path.join(root, 'unrelated.txt'); fs.writeFileSync(sentinel, 'preserve');
const sourceKey = canonicalSourceKey(path.join(root, 'source'));
const scope = { sourceKey, actorId: 'fixture-stage', workspaceId: 'ws_stage_fixture', runId: 'a'.repeat(32) };
const owner = { actor: scope.actorId, workspaceId: scope.workspaceId, operation: 'owned-stage-fixture' };
const live = new Map<number, 'alive' | 'dead' | 'unknown'>();
const instances: SharedSourceCoordinator[] = [];
const checks: { name: string; pass: boolean; error?: string }[] = [];
const peak = { bytes: 0, entries: 0 };
const Database = createRequire(import.meta.url)('better-sqlite3') as new (file: string) => RegistryDatabase;
function coordinator(name: string) {
  const q = new SharedSourceCoordinator({ directory: path.join(root, name), liveness: pid => live.get(pid) ?? 'unknown' }); instances.push(q); return q;
}
const files = [{ path: 'nested/payload', size: 7, sha256: createHash('sha256').update('payload').digest('hex') }];
function stage(lease: ProjectCheckSourceLease) {
  const result = createOwnedProjectCheckStage({ ...scope, lease }, scratch, 'setup', files);
  fs.mkdirSync(path.join(result.root, 'nested')); fs.writeFileSync(path.join(result.root, 'nested/payload'), 'payload');
  result.assertComplete(); return result;
}
function meter() {
  let bytes = 0; let entries = 0;
  const visit = (directory: string) => { for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name); const stat = fs.lstatSync(file); assert(!stat.isSymbolicLink()); entries++;
    if (stat.isDirectory()) visit(file); else { assert(stat.isFile()); bytes += stat.size; }
  } };
  visit(root); assert(bytes <= 8 * 1024 * 1024 && entries <= 1000);
  peak.bytes = Math.max(peak.bytes, bytes); peak.entries = Math.max(peak.entries, entries);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
}
async function check(name: string, test: () => unknown | Promise<unknown>) {
  try { await test(); meter(); checks.push({ name, pass: true }); } catch (error) { checks.push({ name, pass: false, error: String(error) }); }
}
function mutateRetirement(q: SharedSourceCoordinator, state: 'alive' | 'unknown' | 'dead') {
  const db = new Database(q.filename);
  try {
    const row = db.prepare('SELECT id,record_json FROM project_check_stages').get() as { id: string; record_json: string };
    const record = JSON.parse(row.record_json); record.retirement = { token: randomUUID(), instanceId: randomUUID(), pid: 0x7ffe0005 };
    live.set(record.retirement.pid, state);
    db.prepare('UPDATE project_check_stages SET record_json = ? WHERE id = ?').run(JSON.stringify(record), row.id);
  } finally { db.close(); }
}
try {
  await check('complete_owned_stage_retires_exact_inventory_and_journal', async () => {
    const q = coordinator('complete');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); assert.equal(q.projectCheckStages().length, 1);
      current.dispose(); current.dispose(); assert.equal(q.projectCheckStages().length, 0);
      assert.equal(fs.existsSync(current.root), false);
    });
  });
  await check('unwritten_planned_files_are_safe_but_partial_bytes_are_preserved', async () => {
    const q = coordinator('partial');
    await q.run([sourceKey], owner, lease => {
      const empty = createOwnedProjectCheckStage({ ...scope, lease }, scratch, 'setup', files); empty.dispose();
      const current = stage(lease); const payload = path.join(current.root, 'nested/payload'); fs.writeFileSync(payload, 'part');
      assert.throws(current.dispose); assert(fs.existsSync(payload));
      fs.writeFileSync(payload, 'payload'); current.dispose();
    });
  });
  await check('unexpected_file_and_directory_preserve_every_unrelated_byte', async () => {
    const q = coordinator('foreign');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); const foreign = path.join(current.root, 'foreign'); fs.writeFileSync(foreign, 'foreign');
      assert.throws(current.dispose); assert.equal(fs.readFileSync(foreign, 'utf8'), 'foreign');
      fs.unlinkSync(foreign); fs.mkdirSync(foreign); assert.throws(current.dispose); assert(fs.existsSync(foreign));
      fs.rmdirSync(foreign); current.dispose();
    });
  });
  await check('altered_missing_and_malformed_inventory_refuse_nonempty_root', async () => {
    const q = coordinator('marker');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); const marker = path.join(current.root, PROJECT_CHECK_STAGE_MANIFEST); const original = fs.readFileSync(marker);
      for (const bytes of [Buffer.from('{broken'), Buffer.from(original.toString().replace('payload', 'foreign'))]) {
        fs.writeFileSync(marker, bytes); assert.throws(current.dispose);
      }
      fs.unlinkSync(marker); assert.throws(current.dispose); fs.writeFileSync(marker, original); current.dispose();
    });
  });
  await check('hardlinked_payload_and_inventory_are_not_deleted', async () => {
    const q = coordinator('links');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); const link = path.join(root, 'held-hardlink');
      for (const file of [path.join(current.root, 'nested/payload'), path.join(current.root, PROJECT_CHECK_STAGE_MANIFEST)]) {
        fs.linkSync(file, link); try { assert.throws(current.dispose); assert(fs.existsSync(file)); } finally { fs.unlinkSync(link); }
      }
      current.dispose();
    });
  });
  await check('marker_and_payload_growth_reads_stay_within_the_pinned_byte_bound', async () => {
    const q = coordinator('bounded-reads');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease);
      for (const file of [path.join(current.root, PROJECT_CHECK_STAGE_MANIFEST), path.join(current.root, 'nested/payload')]) {
        const original = fs.readFileSync(file); const watched = fs.lstatSync(file, { bigint: true });
        const read = fs.readSync; let changed = false; let observedLength = 0;
        fs.readSync = ((fd: number, ...args: unknown[]) => {
          const now = fs.fstatSync(fd, { bigint: true });
          if (now.dev === watched.dev && now.ino === watched.ino) {
            observedLength = Math.max(observedLength, args[2] as number);
            if (!changed) { fs.appendFileSync(file, Buffer.alloc(1024, 120)); changed = true; }
          }
          return Reflect.apply(read, fs, [fd, ...args]);
        }) as typeof fs.readSync;
        try { assert.throws(current.dispose); assert(changed); assert(observedLength <= original.length); }
        finally { fs.readSync = read; fs.writeFileSync(file, original); }
      }
      current.dispose();
    });
  });
  await check('junction_payload_preserves_destination', async () => {
    const q = coordinator('junction');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); const nested = path.join(current.root, 'nested'); const held = path.join(root, 'held-junction-directory');
      fs.renameSync(nested, held); fs.symlinkSync(path.dirname(sentinel), nested, 'junction');
      try { assert.throws(current.dispose); assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve'); }
      finally { fs.unlinkSync(nested); fs.renameSync(held, nested); }
      current.dispose();
    });
  });
  await check('root_replacement_before_quarantine_preserves_foreign_root', async () => {
    const q = coordinator('replaced');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); const held = current.root + '-held'; fs.renameSync(current.root, held); fs.mkdirSync(current.root);
      try { assert.throws(current.dispose); assert(fs.existsSync(held)); } finally { fs.rmdirSync(current.root); fs.renameSync(held, current.root); }
      current.dispose();
    });
  });
  await check('durable_quarantine_survives_interrupted_retirement_and_dead_owner_takeover', async () => {
    const q = coordinator('quarantine'); let original = '';
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); original = current.root; const [record] = q.projectCheckStages(); assert(record.quarantineRoot);
      assert.throws(() => lease.retireProjectCheckStage(record, retireProjectCheckStageFiles)); // copied/forged handle
      const rename = fs.renameSync;
      fs.renameSync = ((from, to) => {
        rename(from, to);
        if (String(from) === current.root) throw new Error('fixture-death-after-rename');
      }) as typeof fs.renameSync;
      try { assert.throws(current.dispose, /fixture-death-after-rename/); } finally { fs.renameSync = rename; }
      assert.equal(fs.existsSync(original), false); assert(fs.existsSync(record.quarantineRoot));
    });
    mutateRetirement(q, 'unknown'); assert.throws(() => retireAbandonedProjectCheckStages(q, scope, [scratch]));
    mutateRetirement(q, 'alive'); assert.throws(() => retireAbandonedProjectCheckStages(q, scope, [scratch]));
    mutateRetirement(q, 'dead'); assert.equal(retireAbandonedProjectCheckStages(q, scope, [scratch]), 1);
    assert.equal(q.projectCheckStages().length, 0); assert.equal(fs.existsSync(original), false);
  });
  await check('simultaneous_original_and_quarantine_paths_refuse', async () => {
    const q = coordinator('two-paths');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); const [record] = q.projectCheckStages(); assert(record.quarantineRoot);
      fs.mkdirSync(record.quarantineRoot); try { assert.throws(current.dispose); assert(fs.existsSync(current.root)); }
      finally { fs.rmdirSync(record.quarantineRoot); } current.dispose();
    });
  });
  await check('replacement_at_the_quarantine_rename_boundary_is_preserved', async () => {
    const q = coordinator('rename-race');
    await q.run([sourceKey], owner, lease => {
      const current = stage(lease); const [record] = q.projectCheckStages(); assert(record.quarantineRoot);
      const held = path.join(root, 'held-race-root'); const rename = fs.renameSync;
      fs.renameSync = ((from, to) => {
        rename(from, to);
        if (String(from) === current.root) {
          rename(to, held); fs.mkdirSync(record.quarantineRoot!); fs.writeFileSync(path.join(record.quarantineRoot!, 'foreign'), 'preserve-race');
        }
      }) as typeof fs.renameSync;
      try { assert.throws(current.dispose); assert.equal(fs.readFileSync(path.join(record.quarantineRoot, 'foreign'), 'utf8'), 'preserve-race'); }
      finally { fs.renameSync = rename; fs.unlinkSync(path.join(record.quarantineRoot, 'foreign')); fs.rmdirSync(record.quarantineRoot); fs.renameSync(held, record.quarantineRoot); }
      current.dispose();
    });
  });
  await check('creator_failure_before_manifest_publication_preserves_ambiguous_bytes', async () => {
    const q = coordinator('marker-write-fault'); let rowRoot = '';
    await q.run([sourceKey], owner, lease => {
      const write = fs.writeFileSync;
      fs.writeFileSync = ((file, ...args: unknown[]) => {
        if (typeof file === 'number') throw new Error('fixture-marker-write-fault');
        return Reflect.apply(write, fs, [file, ...args]);
      }) as typeof fs.writeFileSync;
      try { assert.throws(() => createOwnedProjectCheckStage({ ...scope, lease }, scratch, 'setup', files), AggregateError); }
      finally { fs.writeFileSync = write; }
      const [record] = q.projectCheckStages(); rowRoot = record.root;
      assert(record.identity && record.manifest); assert.equal(fs.lstatSync(path.join(rowRoot, PROJECT_CHECK_STAGE_MANIFEST)).size, 0);
    });
    assert.throws(() => retireAbandonedProjectCheckStages(q, scope, [scratch])); assert(fs.existsSync(rowRoot));
  });
  await check('orphan_sweep_is_exact_scope_and_does_not_scan_legacy_names', async () => {
    const q = coordinator('scope'); let original = '';
    const legacy = path.join(scratch, 'project-check-unowned'); fs.mkdirSync(legacy); fs.writeFileSync(path.join(legacy, 'keep'), 'legacy');
    await q.run([sourceKey], owner, lease => { original = stage(lease).root; });
    for (const delta of [{ actorId: 'foreign' }, { workspaceId: 'foreign' }, { sourceKey: 'source:foreign' }])
      assert.equal(retireAbandonedProjectCheckStages(q, { ...scope, ...delta }, [scratch]), 0);
    assert(fs.existsSync(original)); assert.equal(retireAbandonedProjectCheckStages(q, scope, [root]), 0);
    assert.equal(retireAbandonedProjectCheckStages(q, scope, [scratch]), 1); assert.equal(retireAbandonedProjectCheckStages(q, scope, [scratch]), 0);
    assert.equal(fs.readFileSync(path.join(legacy, 'keep'), 'utf8'), 'legacy');
  });
  await check('snapshot_write_refuses_a_nested_junction_without_overwriting_destination', async () => {
    const q = coordinator('write-alias'); const outside = path.join(root, 'write-alias-destination'); fs.mkdirSync(outside);
    const keep = path.join(outside, 'content.xml'); fs.writeFileSync(keep, 'preserve-write-target');
    const plan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: { 'content.xml': '<content id="fixture"/>' } });
    const previousTemp = process.env.TEMP; const previousTmp = process.env.TMP; process.env.TEMP = scratch; process.env.TMP = scratch;
    try { await q.run([sourceKey], owner, lease => {
      const mkdir = fs.mkdirSync; let injected = false;
      fs.mkdirSync = ((directory, ...args: unknown[]) => {
        const result = Reflect.apply(mkdir, fs, [directory, ...args]);
        if (String(directory).endsWith(path.sep + 'payload')) {
          fs.rmdirSync(directory); fs.symlinkSync(outside, directory, 'junction'); injected = true;
        }
        return result;
      }) as typeof fs.mkdirSync;
      try { assert.throws(() => captureDeploymentSnapshot(plan, 'loose', { ...scope, lease })); }
      finally { fs.mkdirSync = mkdir; }
      assert(injected); assert.equal(fs.readFileSync(keep, 'utf8'), 'preserve-write-target');
      const [record] = q.projectCheckStages(); assert(record); fs.unlinkSync(path.join(record.root, 'payload'));
    });
    assert.equal(retireAbandonedProjectCheckStages(q, scope, [scratch]), 1);
    } finally { if (previousTemp === undefined) delete process.env.TEMP; else process.env.TEMP = previousTemp;
      if (previousTmp === undefined) delete process.env.TMP; else process.env.TMP = previousTmp; }
  });
  await check('actual_snapshot_and_frozen_setup_use_the_same_owned_lifecycle', async () => {
    const source = path.join(root, 'setup-source'); const runtime = path.join(root, 'runtime'); fs.mkdirSync(source); fs.mkdirSync(runtime);
    fs.writeFileSync(path.join(source, 'forge.checks.json'), JSON.stringify({ version: 1, checks: [{ id: 'smoke', script: 'smoke.py', covers: ['md/smoke.xml'] }] }));
    fs.writeFileSync(path.join(source, 'smoke.py'), 'must not execute'); fs.writeFileSync(path.join(runtime, 'python.exe'), 'fake exe; never executed');
    const setupInput = { modId: 'fixture', sourceRoot: source, interpreterPath: path.join(runtime, 'python.exe') };
    const setup = captureProjectCheckSetup(setupInput); const key = canonicalSourceKey(source); const q = coordinator('producers');
    const plan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: { 'content.xml': '<content id="fixture"/>' } });
    const previousTemp = process.env.TEMP; const previousTmp = process.env.TMP; process.env.TEMP = scratch; process.env.TMP = scratch;
    try { await q.run([key], owner, lease => {
      const context: ProjectCheckStageContext = { ...scope, sourceKey: key, lease };
      assert.throws(() => freezeProjectCheckSetup(setupInput, setup.setupHash, scratch, { ...context, sourceKey }));
      const frozen = freezeProjectCheckSetup(setupInput, setup.setupHash, scratch, context);
      const snapshot = captureDeploymentSnapshot(plan, 'loose', context);
      frozen.assertIntegrity(); snapshot.assertIntegrity(); assert.equal(q.projectCheckStages().length, 2);
      snapshot.dispose(); frozen.dispose(); assert.equal(q.projectCheckStages().length, 0);
    }); } finally { if (previousTemp === undefined) delete process.env.TEMP; else process.env.TEMP = previousTemp;
      if (previousTmp === undefined) delete process.env.TMP; else process.env.TMP = previousTmp; }
    assert.equal(fs.realpathSync.native(os.tmpdir()), parent);
  });
} finally {
  for (const q of instances) q.close(); meter(); const current = fs.lstatSync(root, { bigint: true });
  assert(current.isDirectory() && current.dev === stamp.dev && current.ino === stamp.ino && fs.realpathSync.native(root) === root);
  fs.rmSync(root, { recursive: true });
}
console.log(JSON.stringify({ checks, passed: checks.filter(check => check.pass).length, total: checks.length, peak, fixtureRetired: !fs.existsSync(root) }));
if (checks.some(check => !check.pass)) process.exitCode = 1;
