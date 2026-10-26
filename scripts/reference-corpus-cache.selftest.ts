import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Standalone process only: never patch the runtime oracle's global clock or fs.
// The parent waits for child exit before removing its private SQLite directory.
const script = fileURLToPath(import.meta.url);
const fixtureArgument = process.argv.indexOf('--fixture');

async function runFixture(directory: string): Promise<void> {
  const root = path.join(directory, 'corpus');
  const data = path.join(directory, 'data');
  assert.equal(process.env.X4_DATA_DIR, data);
  assert.equal(process.env.X4_REFERENCE_ROOT, root);
  fs.mkdirSync(path.join(root, 'libraries'), { recursive: true });
  const wareFile = path.join(root, 'libraries', 'wares.xml');
  const originalXml = '<wares><ware id="fixture_energy" name="Fixture Energy"/></wares>';
  fs.writeFileSync(wareFile, originalXml);

  // Import only after the private environment has been established.
  const { getReferenceCorpus, clearReferenceCorpusCache } = await import('../src/lib/referenceCorpus');
  const { refreshReferenceManifest, getReferenceManifestStatus } = await import('../src/lib/referenceManifest');
  const firstManifest = await refreshReferenceManifest(root);
  const status = getReferenceManifestStatus(root);
  assert.equal(status.state, 'ready');
  assert.equal(status.database, path.join(data, 'reference-manifest', 'index.db'));

  const originalNow = Date.now;
  const originalStat = fs.statSync;
  let clock = 1_000_000;
  let fileProbes = 0;
  let checks = 0;
  const check = (name: string, fn: () => void) => {
    fn();
    checks += 1;
    console.log(`PASS ${name}`);
  };
  try {
    Date.now = () => clock;
    (fs as { statSync: typeof fs.statSync }).statSync = ((...args: Parameters<typeof fs.statSync>) => {
      if (typeof args[0] === 'string' && path.resolve(args[0]) === wareFile) {
        fileProbes += 1;
        // Each discovery/signature pass costs more than the one-second interval,
        // without sleeps or a large fabricated workload. File reads remain real.
        clock += 1_100;
      }
      return Reflect.apply(originalStat, fs, args);
    }) as typeof fs.statSync;
    clearReferenceCorpusCache();
    const coldStarted = clock;
    const first = getReferenceCorpus(root);
    check('real private manifest and source are loaded after expensive discovery', () => {
      assert.ok(clock - coldStarted > 1_000);
      assert.equal(first.manifestGeneration, firstManifest.generation);
      assert.deepEqual([...first.references.wares], ['fixture_energy']);
      assert.deepEqual(first.sourceFiles, ['libraries/wares.xml']);
    });
    let probesBefore = fileProbes;
    check('immediate unchanged call skips discovery after an expensive cold load', () => {
      assert.equal(getReferenceCorpus(root), first);
      assert.equal(fileProbes, probesBefore);
    });
    clock += 999;
    check('unchanged call inside the existing interval stays cached', () => {
      assert.equal(getReferenceCorpus(root), first);
      assert.equal(fileProbes, probesBefore);
    });
    clock += 1;
    check('exact interval expiry rechecks signature and reuses the same corpus', () => {
      assert.equal(getReferenceCorpus(root), first);
      assert.ok(fileProbes > probesBefore);
    });
    probesBefore = fileProbes;
    check('an expensive unchanged recheck also starts its interval on completion', () => {
      assert.equal(getReferenceCorpus(root), first);
      assert.equal(fileProbes, probesBefore);
    });
    const forced = getReferenceCorpus(root, true);
    check('force bypasses the interval and rebuilds equivalent corpus content', () => {
      assert.notEqual(forced, first);
      assert.ok(fileProbes > probesBefore);
      assert.equal(forced.signature, first.signature);
      assert.equal(forced.manifestGeneration, first.manifestGeneration);
      assert.deepEqual(forced.references, first.references);
      assert.deepEqual(forced.symbols, first.symbols);
    });
    fs.writeFileSync(wareFile, '<wares><ware id="fixture_energy"/><ware id="fixture_added"/></wares>');
    check('ordinary source changes retain the existing one-second interval', () => {
      assert.equal(getReferenceCorpus(root), forced);
    });
    clock += 1_000;
    const changed = getReferenceCorpus(root);
    check('source signature changes invalidate the corpus after the interval', () => {
      assert.notEqual(changed, forced);
      assert.notEqual(changed.signature, forced.signature);
      assert.ok(changed.references.wares.has('fixture_added'));
    });
    fs.writeFileSync(wareFile, originalXml);
    clock += 1_000;
    const recovered = getReferenceCorpus(root);
    check('restored source recovers the original reference content', () => {
      assert.notEqual(recovered, changed);
      assert.deepEqual(recovered.references, first.references);
      assert.deepEqual(recovered.symbols, first.symbols);
    });
    const nextManifest = await refreshReferenceManifest(root);
    clock += 1_000;
    const regenerated = getReferenceCorpus(root);
    check('a changed manifest generation invalidates an unchanged file signature', () => {
      assert.notEqual(nextManifest.generation, firstManifest.generation);
      assert.notEqual(regenerated, recovered);
      assert.equal(regenerated.signature, recovered.signature);
      assert.equal(regenerated.manifestGeneration, nextManifest.generation);
      assert.deepEqual(regenerated.references, recovered.references);
    });
    probesBefore = fileProbes;
    check('missing roots refuse without corrupting the valid cached corpus', () => {
      assert.throws(() => getReferenceCorpus(path.join(directory, 'missing')), /does not exist or is not a directory/);
      assert.equal(getReferenceCorpus(root), regenerated);
      assert.equal(fileProbes, probesBefore);
    });
    console.log(JSON.stringify({ pass: true, checks, fileProbes, simulatedDiscoveryMsPerProbe: 1_100 }));
  } finally {
    Date.now = originalNow;
    (fs as { statSync: typeof fs.statSync }).statSync = originalStat;
    clearReferenceCorpusCache();
  }
}

if (fixtureArgument >= 0) {
  const directory = path.resolve(process.argv[fixtureArgument + 1] || '');
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('forge-reference-cache-'));
  await runFixture(directory);
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-reference-cache-'));
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  environment.X4_DATA_DIR = path.join(directory, 'data');
  environment.X4_REFERENCE_ROOT = path.join(directory, 'corpus');
  try {
    execFileSync(process.execPath, ['--import', 'tsx', script, '--fixture', directory], {
      cwd: path.resolve(path.dirname(script), '..'), env: environment,
      stdio: 'inherit', timeout: 30_000, windowsHide: true,
    });
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('forge-reference-cache-'));
    fs.rmSync(directory, { recursive: true, force: true });
    assert.equal(fs.existsSync(directory), false);
    console.log('PASS owned child exited and private corpus/SQLite directory removed');
  }
}
