import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';

const parent = fs.realpathSync.native(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(parent, 'x4-check-freeze-'));
const sourceRoot = path.join(fixture, 'source');
const runtime = path.join(fixture, 'runtime');
const scratch = path.join(fixture, 'scratch');
const interpreterPath = path.join(runtime, 'python.exe');
const manifest = path.join(sourceRoot, 'forge.checks.json');
const script = path.join(sourceRoot, 'checks', 'smoke.py');
const helper = path.join(sourceRoot, 'checks', 'helper.py');
const library = path.join(runtime, 'libs', 'python.dll');
const outside = path.join(fixture, 'outside');
const sentinel = path.join(outside, 'keep.txt');
const input = { modId: 'fixture', sourceRoot, interpreterPath, interpreterDependencies: ['libs/python.dll'] };
const manifestBytes = Buffer.from(JSON.stringify({ version: 1, checks: [{
  id: 'smoke', script: 'checks/smoke.py', dependencies: ['checks/helper.py'], covers: ['md/smoke.xml'],
}] }));
const original = new Map([
  [manifest, manifestBytes],
  [script, Buffer.from('must not execute')],
  [helper, Buffer.from('fixture helper')],
  [interpreterPath, Buffer.from([0, 0xff, 0x4d, 0x5a])],
  [library, Buffer.from([0x7f, 1, 0])],
]);

function alterDuringRead(watchedFile: string, alter: () => void, run: () => void): void {
  const expected = fs.lstatSync(watchedFile, { bigint: true });
  const readSync = fs.readSync;
  let changed = false;
  fs.readSync = ((fd: number, ...args: unknown[]) => {
    const count = Reflect.apply(readSync, fs, [fd, ...args]);
    const current = fs.fstatSync(fd, { bigint: true });
    if (!changed && current.dev === expected.dev && current.ino === expected.ino) {
      changed = true;
      alter();
    }
    return count;
  }) as typeof fs.readSync;
  try {
    run();
    assert(changed);
  } finally {
    fs.readSync = readSync;
  }
}

try {
  for (const [file, bytes] of original) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  fs.mkdirSync(scratch);
  fs.mkdirSync(outside);
  fs.writeFileSync(sentinel, 'outside remains intact');
  const reviewed = captureProjectCheckSetup(input);
  const freeze = () => freezeProjectCheckSetup(input, reviewed.setupHash, scratch);
  const snapshot = freeze();
  const frozenManifest = path.join(snapshot.projectRoot, 'forge.checks.json');
  const frozenScript = path.join(snapshot.projectRoot, 'checks', 'smoke.py');
  const frozenHelper = path.join(snapshot.projectRoot, 'checks', 'helper.py');
  const frozenLibrary = path.join(snapshot.root, 'runtime', 'libs', 'python.dll');
  assert.deepEqual(snapshot.setup, reviewed);
  assert.equal(path.dirname(snapshot.root), scratch);
  for (const [frozen, source] of [[frozenManifest, manifest], [frozenScript, script], [frozenHelper, helper],
    [snapshot.interpreterPath, interpreterPath], [frozenLibrary, library]]) {
    assert.deepEqual(fs.readFileSync(frozen), original.get(source));
  }
  assert.deepEqual(fs.readdirSync(snapshot.root).sort(), ['project', 'runtime']);
  assert(!fs.existsSync(path.join(snapshot.projectRoot, 'md')));
  const [check] = snapshot.setup.checks;
  assert.equal(Reflect.set(snapshot, 'interpreterPath', interpreterPath), false);
  assert.equal(Reflect.set(snapshot.setup, 'setupHash', '0'.repeat(64)), false);
  assert.equal(Reflect.set(check, 'script', 'other.py'), false);
  assert.throws(() => check.args.push('injected'), TypeError);
  assert.throws(() => check.dependencies.push('injected.py'), TypeError);
  assert.throws(() => check.covers.push('md/injected.xml'), TypeError);
  assert.throws(() => snapshot.setup.checks.push(check), TypeError);
  assert.equal(Reflect.set(snapshot.setup.interpreter, 'path', 'other.exe'), false);
  assert.equal(Reflect.set(snapshot.setup.interpreter.dependencies[0], 'path', 'other.dll'), false);
  assert.equal(Reflect.set(snapshot.setup.harness[0], 'sha256', '0'.repeat(64)), false);
  assert.equal(Reflect.set(snapshot.setup.manifest, 'sha256', '0'.repeat(64)), false);
  assert.deepEqual(snapshot.setup, reviewed);
  snapshot.assertIntegrity();

  fs.writeFileSync(script, 'source changed after capture');
  snapshot.assertIntegrity();
  assert.deepEqual(fs.readFileSync(frozenScript), original.get(script));
  assert.throws(freeze, /matches its approval/);
  assert.deepEqual(fs.readdirSync(scratch), [path.basename(snapshot.root)]);
  fs.writeFileSync(script, original.get(script)!);
  const second = freeze();
  assert.notEqual(second.root, snapshot.root);
  assert.deepEqual(second.setup, reviewed);
  second.dispose();
  second.dispose();
  assert(!fs.existsSync(second.root));

  fs.writeFileSync(frozenScript, Buffer.alloc(original.get(script)!.length, 1));
  assert.throws(snapshot.assertIntegrity, /input changed/);
  fs.writeFileSync(frozenScript, original.get(script)!);
  const extra = path.join(snapshot.root, 'runtime', 'unapproved.dll');
  fs.writeFileSync(extra, 'extra');
  assert.throws(snapshot.assertIntegrity, /inventory changed/);
  fs.unlinkSync(extra);
  fs.unlinkSync(frozenHelper);
  assert.throws(snapshot.assertIntegrity, /inventory changed/);
  fs.writeFileSync(frozenHelper, original.get(helper)!);
  alterDuringRead(frozenLibrary, () => fs.appendFileSync(frozenManifest, ' drift'), () => {
    assert.throws(snapshot.assertIntegrity, /input changed during verification/);
  });
  fs.writeFileSync(frozenManifest, manifestBytes);
  snapshot.assertIntegrity();
  snapshot.dispose();

  alterDuringRead(script, () => fs.appendFileSync(script, ' drift'), () => {
    assert.throws(freeze, /changed while reading/);
  });
  fs.writeFileSync(script, original.get(script)!);
  alterDuringRead(script, () => fs.appendFileSync(manifest, ' drift'), () => {
    assert.throws(freeze, /changed during capture/);
  });
  fs.writeFileSync(manifest, manifestBytes);
  assert.deepEqual(fs.readdirSync(scratch), []);
  assert.throws(() => freezeProjectCheckSetup(input, reviewed.setupHash, sourceRoot), /outside both input roots/);
  assert.throws(() => freezeProjectCheckSetup(input, reviewed.setupHash, runtime), /outside both input roots/);
  assert.throws(() => freezeProjectCheckSetup(input, 'not approved', scratch), /approved setup hash/);

  const alias = path.join(fixture, 'scratch-alias');
  fs.symlinkSync(scratch, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => freezeProjectCheckSetup(input, reviewed.setupHash, alias), /alias or symbolic link/);
  const hardLink = path.join(sourceRoot, 'checks', 'linked.py');
  fs.linkSync(script, hardLink);
  assert.throws(freeze, /single-link/);
  fs.unlinkSync(hardLink);
  fs.truncateSync(helper, 64 * 1024 * 1024 + 1);
  assert.throws(freeze, /byte limit/);
  fs.writeFileSync(helper, original.get(helper)!);
  assert.deepEqual(fs.readdirSync(scratch), []);

  // Replace a staged directory with a junction between captures. The next file
  // open refuses it, and rollback leaves the junction's target intact.
  alterDuringRead(manifest, () => {
    const [owned] = fs.readdirSync(scratch);
    assert(owned.startsWith('project-check-'));
    fs.symlinkSync(outside, path.join(scratch, owned, 'runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  }, () => assert.throws(freeze, /alias or symbolic link/));
  assert.deepEqual(fs.readdirSync(scratch), []);
  assert.deepEqual(fs.readdirSync(outside), ['keep.txt']);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside remains intact');

  const displaced = freeze();
  const retired = path.join(scratch, 'retired-owned');
  assert.equal(path.dirname(fs.realpathSync.native(displaced.root)), fs.realpathSync.native(scratch));
  assert.equal(path.dirname(retired), fs.realpathSync.native(scratch));
  assert(!fs.existsSync(retired));
  fs.renameSync(displaced.root, retired);
  fs.mkdirSync(displaced.root);
  const replacement = path.join(displaced.root, 'replacement.txt');
  fs.writeFileSync(replacement, 'different directory');
  assert.throws(displaced.assertIntegrity, /scratch is no longer owned/);
  assert.throws(displaced.dispose, /scratch is no longer owned/);
  assert.equal(fs.readFileSync(replacement, 'utf8'), 'different directory');
  assert.deepEqual(fs.readFileSync(path.join(retired, 'project', 'forge.checks.json')), manifestBytes);
  console.log('Project check freeze selftest passed: exact bytes, sealed metadata, independent staging, source and stage drift, inventory, limits, links, scoped rollback, and replaced-root refusal.');
} finally {
  assert.equal(path.dirname(fs.realpathSync.native(fixture)), parent);
  fs.rmSync(fixture, { recursive: true, force: true });
}
