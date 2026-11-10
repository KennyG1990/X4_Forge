import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createBulkTransformPlan, mergeBulkTransformPatches, type BulkTransformRule } from '../src/lib/bulkCorpusTransform';
import { resolveEffectiveReferenceDocument, type EffectiveReferenceDocument } from '../src/lib/referenceOverlay';
import { registerReferenceRoutes } from '../src/server/referenceRoutes';

type Wire = {
  available?: boolean; complete?: boolean; code?: string; ok?: boolean; error?: string;
  content?: string; items?: unknown[]; operations?: unknown[]; signature?: string;
  findings?: { severity: string; code: string }[];
  incompleteFindings?: { source: string; code: string }[];
  base?: Wire;
};
const childRoot = process.argv[2] === '--worker' ? process.argv[3] : undefined;
const root = childRoot ? path.resolve(childRoot) : fs.mkdtempSync(path.join(os.tmpdir(), 'forge-reference-consumers-'));
const owner = path.join(root, 'fixture-owner.json');
const assertOwnedFixture = () => {
  assert.ok(path.basename(root).startsWith('forge-reference-consumers-'));
  assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir()));
  assert.ok(!fs.lstatSync(root).isSymbolicLink());
  assert.deepEqual(JSON.parse(fs.readFileSync(owner, 'utf8')), { owner: 'Forge QA', unit: 'reference-consumer-selftest' });
};
const keys = ['X4_REFERENCE_ROOT', 'X4_CONFIG_DIR', 'X4_GAME_PATH', 'X4_XSD_PATH', 'X4_DATA_DIR',
  'X4_FORGE_DEV_SCRATCH_SETTINGS', 'X4_FORGE_DEV_ROOT'];
const saved = new Map(keys.map(key => [key, process.env[key]]));
const checks: { name: string; pass: boolean; detail?: string }[] = [];
const prefix = 'assets/units/size_xl/macros';
const target = `${prefix}/probe.xml`;
const companion = `${prefix}/healthy.xml`;
const base = '<macros><macro name="fixture_macro" class="ship"><properties><hull max="100"/></properties></macro></macros>';
const partial = '<diff><replace sel="/macros/macro/properties/hull/@max">125</replace><remove sel="//*["/></diff>';
const healthy = '<diff><replace sel="/macros/macro/properties/hull/@max">150</replace></diff>';
const patch = '<diff><replace sel="/macros/macro/properties/hull/@max">200</replace></diff>';
const selector = '/macros/macro/properties/';
const rule: BulkTransformRule = { pathPrefix: prefix, selector: '/macros/macro/properties/hull/@max', operation: 'multiply', operand: 2, maxFiles: 10 };
let clock = Date.now();
const write = (relative: string, content: string) => {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  // Make the filesystem generation explicit rather than relying on sub-ms write timing.
  const stamp = new Date(clock += 1000);
  fs.utimesSync(absolute, stamp, stamp);
};
const dlc = (id: string, content: string) => {
  write(`extensions/${id}/content.xml`, `<content id="${id}"/>`);
  write(`extensions/${id}/${target}`, content);
};
const plan = (selectedRule = rule, targets = [target, companion]) => createBulkTransformPlan({
  rule: selectedRule, logicalPaths: targets, corpusGeneration: 'synthetic-reference-consumers',
  resolve: relative => resolveEffectiveReferenceDocument(root, relative),
});
const check = async (name: string, run: () => void | Promise<void>) => {
  try { await run(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, detail: String(error) }); }
};
const hash = (relative: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');

async function run() {
  process.env.X4_REFERENCE_ROOT = root;
  process.env.X4_CONFIG_DIR = path.join(root, 'config');
  process.env.X4_GAME_PATH = path.join(root, 'game');
  process.env.X4_XSD_PATH = path.join(root, 'schemas');
  process.env.X4_DATA_DIR = path.join(root, 'data');
  delete process.env.X4_FORGE_DEV_SCRATCH_SETTINGS;
  delete process.env.X4_FORGE_DEV_ROOT;
  write(target, base);
  write(companion, base);
  dlc('ego_dlc_a', partial);
  const effective = resolveEffectiveReferenceDocument(root, target);
  await check('fixture retains a real partial mutation and failed official authority', () => {
    assert.equal(effective.available, true);
    assert.equal(effective.complete, false);
    assert.match(effective.content!, /max="125"/);
  });
  await check('partial parent never contributes a bulk row or applicable plan', () => {
    const result = plan();
    assert.equal(result.ok, false);
    assert.equal(result.rows.filter(row => row.targetFile === target).length, 0);
    assert.equal(result.files.find(file => file.targetFile === target)?.status, 'error');
    assert.ok(result.findings.some(finding => finding.code === 'BULK_EFFECTIVE_INCOMPLETE' && finding.path === target));
    assert.throws(() => mergeBulkTransformPatches([], result));
  });
  write(target, '<macros><macro name="no_numeric_target"/></macros>');
  await check('incomplete nonmatching companion cannot become a silently skipped candidate', () => {
    const result = plan();
    assert.equal(result.ok, false);
    assert.equal(result.files.find(file => file.targetFile === target)?.status, 'error');
    assert.equal(result.skippedFiles, 0);
  });
  write(target, base);
  await check('missing completeness metadata never defaults to authoritative success', () => {
    const unknown = { ...effective } as Partial<EffectiveReferenceDocument>;
    delete unknown.complete;
    const result = createBulkTransformPlan({ rule, logicalPaths: [target], corpusGeneration: 'legacy-resolver',
      resolve: () => unknown as EffectiveReferenceDocument });
    assert.equal(result.ok, false);
    assert.equal(result.rows.length, 0);
  });
  await check('unrelated incomplete path does not poison a bounded healthy prefix', () => {
    const result = plan({ ...rule, pathPrefix: companion });
    assert.equal(result.ok, true);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].newValue, '200');
  });

  const app = express();
  app.use(express.json());
  registerReferenceRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (route: string, body?: object) => {
    const response = await fetch(url + route, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as Wire };
  };
  const effectiveRoute = () => request(`/api/reference/effective-file?path=${encodeURIComponent(target)}`);
  try {
    const before = hash(target);
    await check('effective-file refuses authority while retaining partial content for inspection', async () => {
      const result = await effectiveRoute();
      assert.equal(result.status, 503, JSON.stringify(result));
      assert.equal(result.body.code, 'REFERENCE_EFFECTIVE_INCOMPLETE');
      assert.equal(result.body.available, true);
      assert.equal(result.body.complete, false);
      assert.ok(result.body.signature);
      assert.match(result.body.content!, /max="125"/);
    });
    await check('XPath completion produces no suggestions against a partial parent', async () => {
      const result = await request('/api/reference/xpath-complete', { path: target, selector, cursor: selector.length });
      assert.equal(result.status, 503, JSON.stringify(result));
      assert.equal(result.body.code, 'REFERENCE_EFFECTIVE_INCOMPLETE');
      assert.equal(result.body.complete, false);
      assert.deepEqual(result.body.items, []);
    });
    await check('diff preview does not execute or blame a proposed patch against partial authority', async () => {
      const result = await request('/api/reference/simulate-diff', { path: target, content: patch });
      assert.equal(result.status, 503, JSON.stringify(result));
      assert.equal(result.body.code, 'REFERENCE_EFFECTIVE_INCOMPLETE');
      assert.equal(result.body.ok, false);
      assert.equal(result.body.base?.complete, false);
      assert.equal(result.body.content, undefined);
      assert.ok(!result.body.findings?.length);
    });
    await check('reference routes do not mutate corpus bytes', () => assert.equal(hash(target), before));
    dlc('ego_dlc_a', healthy);
    await check('healthy composition remains usable with explicit health metadata', async () => {
      const file = await effectiveRoute();
      assert.equal(file.status, 200);
      assert.equal(file.body.complete, true);
      const completion = await request('/api/reference/xpath-complete', { path: target, selector, cursor: selector.length });
      assert.equal(completion.status, 200);
      assert.equal(completion.body.complete, true);
      assert.ok(completion.body.items!.length > 0);
      const simulation = await request('/api/reference/simulate-diff', { path: target, content: patch });
      assert.equal(simulation.status, 200);
      assert.equal(simulation.body.ok, true);
      assert.equal(simulation.body.base?.complete, true);
      assert.match(simulation.body.content!, /max="200"/);
    });
    await check('healthy bulk plan retains exact numeric results and patch behavior', () => {
      const result = plan();
      assert.equal(result.ok, true);
      assert.equal(result.rows.find(row => row.targetFile === target)?.newValue, '300');
      assert.equal(result.rows.find(row => row.targetFile === companion)?.newValue, '200');
      assert.equal(mergeBulkTransformPatches([], result).length, 2);
    });
    dlc('ego_dlc_a', partial);
    dlc('ego_dlc_b', base);
    await check('full replacement recovers despite retained historical official errors', async () => {
      const file = await effectiveRoute();
      assert.equal(file.status, 200);
      assert.equal(file.body.complete, true);
      assert.ok(file.body.findings?.some(finding => finding.severity === 'error'));
      assert.equal(plan().ok, true);
      const completion = await request('/api/reference/xpath-complete', { path: target, selector, cursor: selector.length });
      assert.equal(completion.status, 200);
      assert.equal(completion.body.complete, true);
      const simulation = await request('/api/reference/simulate-diff', { path: target, content: patch });
      assert.equal(simulation.status, 200);
      assert.equal(simulation.body.base?.complete, true);
    });
    dlc('ego_dlc_b', partial);
    await check('subsequent failing diff reintroduces unavailable authority', async () => {
      assert.equal((await effectiveRoute()).status, 503);
      assert.equal(plan().ok, false);
    });
    dlc('ego_dlc_b', healthy);
    await check('successful later diff cannot heal incomplete earlier lineage', async () => {
      assert.equal((await effectiveRoute()).status, 503);
      assert.equal(plan().ok, false);
    });
    dlc('ego_dlc_b', '<macros value=unquoted/>');
    await check('usable-looking repaired full XML cannot become canonical authority', async () => {
      const result = await effectiveRoute();
      assert.equal(result.status, 503);
      assert.equal(result.body.complete, false);
      assert.ok(result.body.incompleteFindings?.some(finding => finding.source === 'ego_dlc_b' && finding.code === 'DIFF_XML_INVALID'));
      assert.equal(plan().ok, false);
    });
    fs.rmSync(path.join(root, 'extensions', 'ego_dlc_b'), { recursive: true });
    for (const [name, overlay] of [
      ['zero-selector warning', '<diff><remove sel="/macros/missing"/></diff>'],
      ['false-condition skip', '<diff><remove sel="/macros/macro" if="false"/></diff>'],
    ]) {
      dlc('ego_dlc_a', overlay);
      await check(`modeled ${name} remains usable`, async () => {
        const result = await effectiveRoute();
        assert.equal(result.status, 200);
        assert.equal(result.body.complete, true);
        assert.equal(plan().ok, true);
        const simulation = await request('/api/reference/simulate-diff', { path: target, content: patch });
        assert.equal(simulation.status, 200);
        assert.equal(simulation.body.ok, true);
      });
    }
    write(target, '<macros><macro name="fixture_macro"><properties><hull max="100"/></properties></macro><macro name="second"><properties><hull max="200"/></properties></macro></macros>');
    dlc('ego_dlc_a', healthy);
    await check('modeled official multimatch is complete and does not forbid a uniquely addressed transform', async () => {
      const result = await effectiveRoute();
      assert.equal(result.status, 200);
      assert.equal(result.body.complete, true);
      assert.ok(result.body.findings?.some(finding => finding.code === 'DIFF_SELECTOR_MULTI'));
      const named = plan({ ...rule, selector: '/macros/macro[@name="fixture_macro"]/properties/hull/@max' });
      assert.equal(named.ok, true);
      assert.equal(named.rows.find(row => row.targetFile === target)?.newValue, '300');
    });
    await check('authored selector errors stay distinct from complete canonical parent evidence', async () => {
      const result = await request('/api/reference/simulate-diff', { path: target, content: '<diff><remove sel="//*["/></diff>' });
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, false);
      assert.equal(result.body.base?.complete, true);
      assert.ok(result.body.findings?.some(finding => finding.code === 'DIFF_SELECTOR_INVALID'));
    });
    await check('malformed input and traversal keep their established rejection status', async () => {
      assert.equal((await request('/api/reference/xpath-complete', { path: target, selector, cursor: -1 })).status, 400);
      assert.equal((await request('/api/reference/simulate-diff', { path: '../outside.xml', content: patch })).status, 403);
      assert.equal((await request('/api/reference/effective-file?path=missing.xml')).status, 404);
    });
  } finally {
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

if (childRoot) {
  assertOwnedFixture();
  try { await run(); }
  finally { for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  const pass = checks.every(check => check.pass);
  console.log(JSON.stringify({ pass, passed: checks.filter(check => check.pass).length, total: checks.length, checks }, null, 2));
  if (!pass) process.exitCode = 1;
} else {
  // SQLite owns native file handles until this short-lived process exits on Windows.
  // One serial worker uses the real route service; its parent then retires all files.
  try {
    fs.writeFileSync(owner, JSON.stringify({ owner: 'Forge QA', unit: 'reference-consumer-selftest' }));
    assertOwnedFixture();
    const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--worker', root], { stdio: 'inherit' });
    if (child.error) throw child.error;
    process.exitCode = child.status ?? 1;
  } finally { assertOwnedFixture(); fs.rmSync(root, { recursive: true, force: true }); }
}
