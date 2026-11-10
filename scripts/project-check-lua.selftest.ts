import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, type ActionReceipt } from '../src/lib/actionReceipt';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { buildArtifactPlan } from '../src/lib/artifactPipeline';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { ProjectCheckApprovalLedger, type OwnerDecision } from '../src/server/projectCheckApproval';
import { bindProjectCheckCommand } from '../src/server/projectCheckCommand';
import { executeProjectCheck } from '../src/server/projectCheckExecution';
import { isProjectCheckRelativeFile } from '../src/server/projectCheckProposal';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator } from '../src/server/sharedSourceCoordinator';

// This entry point runs only an explicitly supplied, marker-owned qualification
// fixture. It never discovers AiLive, installs packages, or changes the runner.
const fixtureInput = process.env.FORGE_QA_LUA_FIXTURE;
const pythonInput = process.env.FORGE_QA_PYTHON;
const tempInput = process.env.FORGE_QA_TMP;
const systemRoot = process.env.SystemRoot;
assert(process.platform === 'win32' && fixtureInput && pythonInput && tempInput && systemRoot,
  'Explicit FORGE_QA_LUA_FIXTURE, FORGE_QA_PYTHON and FORGE_QA_TMP Windows inputs are required.');
const baseline = process.argv.slice(2).includes('--expect-runtime-failure');
assert(process.argv.slice(2).every(argument => argument === '--expect-runtime-failure'), 'Unknown qualification option.');
const samePath = (left: string, right: string) => path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const fileHash = (file: string) => digest(fs.readFileSync(file));
const real = (file: string) => {
  assert(path.isAbsolute(file), 'Fixture inputs must be absolute.');
  const resolved = fs.realpathSync.native(file);
  assert(samePath(file, resolved), 'Fixture input resolves through an alias.');
  return resolved;
};
const fixture = real(fixtureInput);
const pythonPath = real(pythonInput);
const temp = real(tempInput);
const tempFromFixture = path.relative(fixture, temp);
assert(tempFromFixture && (tempFromFixture === '..' || tempFromFixture.startsWith('..' + path.sep) || path.isAbsolute(tempFromFixture)),
  'Qualification scratch must be outside the retained input fixture.');
const fixtureOwner = { owner: 'Forge QA', unit: 'lua61-hub', thread: '01a1b9d0-e607-7061-bb85-ae5fafcec5a2',
  sourceHead: '57d1d210f8fe60f41adb1c1b14e5cf9c8d670774' };
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'owner.json'), 'utf8')), fixtureOwner);
assert.equal(fs.lstatSync(fixture).isDirectory(), true);

interface RuntimeInput {
  version: number;
  modId: string;
  sourceRoot: string;
  interpreterPath: string;
  interpreterDependencies: string[];
  covers: string[];
  expectedRenderCases: number;
  checkId: string;
  metadataVersion: number;
  metadataPath: string;
}
const config = JSON.parse(fs.readFileSync(path.join(fixture, 'runtime.json'), 'utf8')) as RuntimeInput;
assert.equal(config.version, 1);
assert.equal(config.modId, 'forge_qa_lua_hub');
assert.equal(config.sourceRoot, 'source');
assert.equal(config.interpreterPath, 'runtime/python.exe');
assert.equal(config.expectedRenderCases, 29);
assert.equal(config.checkId, 'ui-hub');
assert.equal(config.metadataVersion, 1);
assert.equal(config.metadataPath, 'command-metadata.json');
assert(Array.isArray(config.interpreterDependencies) && config.interpreterDependencies.length <= 128
  && config.interpreterDependencies.every(isProjectCheckRelativeFile));
assert(Array.isArray(config.covers) && config.covers.length === 9 && config.covers.every(file =>
  isProjectCheckRelativeFile(file) && /^ui\/addons\/ai_influence_chat\/[^/]+\.lua$/.test(file)));
assert.equal(new Set(config.covers).size, 9);
const hubFile = 'ui/addons/ai_influence_chat/aic_hub.lua';
assert(config.covers.includes(hubFile));
const sourceRoot = real(path.join(fixture, config.sourceRoot));
const interpreterPath = real(path.join(fixture, config.interpreterPath));
const metadataPath = path.join(fixture, config.metadataPath);
const fixtureBefore = inventory(fixture, true);
const workerPath = real(fileURLToPath(new URL('../src/server/projectCheckLeaseWorker.py', import.meta.url)));
const launcherPath = real(fileURLToPath(new URL('../src/server/projectCheckWindowsJob.py', import.meta.url)));
const trusted = { pythonPath, pythonSha256: fileHash(pythonPath), workerPath, workerSha256: fileHash(workerPath),
  launcherSha256: fileHash(launcherPath), systemRoot: systemRoot! };
const root = fs.mkdtempSync(path.join(temp, 'x4-check-lua-'));
const rootStamp = fs.lstatSync(root, { bigint: true });
const runOwner = { owner: 'Forge QA', unit: 'project-check-lua-selftest', fixture };
fs.writeFileSync(path.join(root, 'owner.json'), JSON.stringify(runOwner));
const originalTemp = process.env.TEMP;
const originalTmp = process.env.TMP;
process.env.TEMP = root;
process.env.TMP = root;

function inventory(directory: string, omitMetadata = false) {
  const files: Record<string, { size: number; sha256: string }> = {};
  const pending = [directory];
  let entries = 0;
  let bytes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    assert(samePath(real(current), current));
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (omitMetadata && samePath(file, metadataPath)) continue;
      assert(++entries < 1000, 'Qualification inventory exceeds its bounded payload entry census.');
      const stat = fs.lstatSync(file);
      assert(!stat.isSymbolicLink() && samePath(real(file), file), 'Qualification inventory contains a link/alias.');
      if (stat.isDirectory()) pending.push(file);
      else {
        assert(stat.isFile() && stat.nlink === 1, 'Qualification inputs must be regular single-link files.');
        bytes += stat.size;
        assert(bytes < 64 * 1024 * 1024, 'Qualification inventory exceeds its payload byte ceiling.');
        files[path.relative(directory, file).replace(/\\/g, '/')] = { size: stat.size, sha256: fileHash(file) };
      }
    }
  }
  return files;
}
let peakFiles = 0;
let peakBytes = 0;
function footprint() {
  const files = [...Object.values(inventory(fixture)), ...Object.values(inventory(root))];
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  assert(files.length < 1000 && bytes < 64 * 1024 * 1024, 'Qualification exceeded its declared payload file/byte ceiling.');
  peakFiles = Math.max(peakFiles, files.length); peakBytes = Math.max(peakBytes, bytes);
  return { files: files.length, bytes, peakFiles, peakBytes, maxFiles: 1000, maxBytes: 64 * 1024 * 1024,
    separateToolCache: 'Root meters the separate cache budget; it is not counted twice here.' };
}
function assertOwnedRoot() {
  const current = fs.lstatSync(root, { bigint: true });
  assert(current.isDirectory() && current.dev === rootStamp.dev && current.ino === rootStamp.ino);
  assert(samePath(path.dirname(real(root)), temp) && path.basename(root).startsWith('x4-check-lua-'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'owner.json'), 'utf8')), runOwner);
  inventory(root); // Validate descendants before any recursive retirement.
}
function clearMetadata() {
  const entry = fs.lstatSync(metadataPath, { throwIfNoEntry: false });
  if (!entry) return;
  assert(entry.isFile() && entry.nlink === 1 && !entry.isSymbolicLink() && samePath(real(metadataPath), metadataPath));
  assert(samePath(path.dirname(metadataPath), fixture));
  fs.unlinkSync(metadataPath);
}

interface GateMetadata {
  exitCode: number;
  renderCases: number;
  okCases: number;
  failedCases: number;
  artifactRoot: string;
  executable: string;
  pythonVersion: number[];
  lupaVersion: string;
  lupaPackageFile: string;
  lupaModuleFile: string;
  engine: string;
  sysPath: string[];
  loadedLua: string[];
  stdout: string;
  error?: string;
}

const checks: string[] = [];
const record = (name: string) => { checks.push(name); };
const report: Record<string, unknown> = { qualified: false, mode: baseline ? 'expected-runtime-failure' : 'behavioral-qualification',
  fixtureOwnerApproval: true, realOwnerEnrollment: false, nativeIntegration: 'NOT RUN', installed: 'NOT RUN', game: 'NOT RUN', checks };
const snapshots: ReturnType<typeof captureDeploymentSnapshot>[] = [];
let frozen: ReturnType<typeof freezeProjectCheckSetup> | undefined;
let coordinator: SharedSourceCoordinator | undefined;
const actorId = 'fixture-lua-behavior-agent';
const workspaceId = 'ws_0123456789abcdef01234567';
const sourceKey = canonicalSourceKey(sourceRoot);
const setupInput = { modId: config.modId, sourceRoot, interpreterPath, interpreterDependencies: config.interpreterDependencies };
const extraViews = [/\[ok {2}\]\s+DOCTRINE\/OPORD\b/, /\[ok {2}\]\s+DOCTRINE\/OURS\b/,
  /\[ok {2}\]\s+DOCTRINE\/CODE\b[^\r\n]*\(contents\)/,
  /\[ok {2}\]\s+DOCTRINE\/CODE\b[^\r\n]*\(s\.78\.1\)/, /\[ok {2}\]\s+POWER\/ACCOUNT\b/];

try {
  footprint();
  const reviewed = captureProjectCheckSetup(setupInput);
  assert.equal(reviewed.checks.length, 1);
  const check = reviewed.checks[0];
  assert.equal(check.id, config.checkId);
  assert.equal(check.script, 'checks/run.py');
  assert(check.timeoutSeconds <= 30);
  assert.deepEqual(check.args, [metadataPath]);
  assert.deepEqual([...check.covers].sort(), [...config.covers].sort());
  assert.deepEqual([...check.dependencies].sort(), ['checks/hubgate.py', 'lupa/__init__.py', 'lupa/version.py',
    'lupa/luajit20.cp312-win_amd64.pyd'].sort());
  assert.equal(fileHash(path.join(sourceRoot, 'lupa/luajit20.cp312-win_amd64.pyd')),
    '21902898820ea0335870cccd25b1670bb6dc86564c1047447ea791ad74cb0fc5');
  report.inputs = { sourceFiles: fixtureBefore, setupHash: reviewed.setupHash, interpreter: reviewed.interpreter,
    harness: reviewed.harness, bootstrap: trusted, covers: config.covers };
  const store = new ActionReceiptStore({ root: path.join(root, 'receipts') });
  const ownerId = 'synthetic-lua-qualification-owner';
  const signing = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const signed = (decision: OwnerDecision) => sign('sha256', Buffer.from(canonicalJson(decision)), signing.privateKey).toString('base64url');
  const approvals = new ProjectCheckApprovalLedger(store, ownerId, (owner, decision, proof) => {
    if (owner !== ownerId || typeof proof !== 'string') return false;
    try { return verify('sha256', Buffer.from(canonicalJson(decision)), signing.publicKey, Buffer.from(proof, 'base64url')); }
    catch { return false; }
  });
  const reviewId = 'fixture-lua-behavior-review-001';
  assert.throws(() => approvals.approve(setupInput, reviewed.setupHash, reviewId, 'not-an-owner-signature'), /confirmation/);
  const approval = approvals.approve(setupInput, reviewed.setupHash, reviewId,
    signed({ action: 'approve', reviewId, setupHash: reviewed.setupHash }));
  assert.equal(approval.status, 'committed');
  assert.deepEqual(new ActionReceiptStore({ root: store.root }).read(approval.id), approval);
  report.approval = approval;
  record('exact setup has a synthetic P-256 owner approval and reopened canonical receipt');
  const scratch = path.join(root, 'frozen');
  fs.mkdirSync(scratch);
  frozen = freezeProjectCheckSetup(setupInput, reviewed.setupHash, scratch);
  const approved = frozen;
  coordinator = new SharedSourceCoordinator({ directory: path.join(root, 'registry'), waitMs: 1000, pollMs: 10 });
  const coordination = coordinator;
  const idle = () => {
    const status = coordination.status([sourceKey]);
    assert(status.available && status.active.length === 0, 'A project check claim did not drain.');
  };
  const utf8 = (file: string) => {
    const bytes = fs.readFileSync(path.join(sourceRoot, ...file.split('/')));
    const text = bytes.toString('utf8');
    assert(Buffer.from(text, 'utf8').equals(bytes), 'Artifact source is not lossless UTF-8.');
    return text;
  };
  const generated: Record<string, string> = Object.fromEntries(['content.xml', 'forge.checks.json', ...config.covers].map(file => [file, utf8(file)]));
  const snapshot = (files: Record<string, string>) => {
    const plan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: files });
    assert(plan.ok, plan.errors.join('\n'));
    const result = captureDeploymentSnapshot(plan, 'loose');
    snapshots.push(result);
    const staged = path.relative(root, result.payloadRoot);
    assert(staged && staged !== '..' && !staged.startsWith('..' + path.sep) && !path.isAbsolute(staged),
      'Snapshot staging must stay inside the metered owned attempt root.');
    assert.deepEqual(result.manifest.files.map(file => file.path).sort(), ['content.xml', 'forge.checks.json', ...config.covers].sort());
    return result;
  };
  const positive = snapshot(generated);
  const bind = (artifact = positive, modId = config.modId) => bindProjectCheckCommand({ setupInput, frozen: approved,
    artifact: { modId, snapshot: artifact }, approvals, approvalId: approval.id, checkId: config.checkId,
    runId: randomBytes(16).toString('hex'), systemRoot });
  const bound = bind();
  footprint();
  assert.deepEqual(bound.binding.command.args.slice(0, 3), ['-I', '-S', '-B']);
  assert(samePath(bound.binding.command.executable, approved.interpreterPath));
  assert.deepEqual(Object.keys(bound.binding.command.environment).sort(), ['FORGE_ARTIFACT_ROOT', 'SystemRoot']);
  assert.deepEqual(bound.binding.coveredFiles.map(file => file.path).sort(), [...config.covers].sort());
  assert.throws(() => bind(positive, 'wrong_fixture_mod'), /does not match/);
  const driftedManifest = snapshot({ ...generated, 'forge.checks.json': generated['forge.checks.json'] + '\n' });
  assert.throws(() => bind(driftedManifest), /declaration does not match/);
  driftedManifest.dispose(); snapshots.splice(snapshots.indexOf(driftedManifest), 1);
  record('only manifest and exact nine Lua payloads enter the artifact; wrong subject/declaration refuse');
  const execute = (command: typeof bound, runtime = trusted) => coordination.run([sourceKey],
    { actor: actorId, operation: 'fixture-lua-behavior', workspaceId }, lease =>
      executeProjectCheck({ lease, bound: command, runtime, store, actorId, workspaceId }));
  const readTerminal = (command: typeof bound, receipt: ActionReceipt, expectedStatus: 'committed' | 'failed' | 'incomplete', code: string) => {
    // Preserve the actual terminal evidence before an expectation can throw and
    // the owned receipt directory is retired. Observation never grants credit.
    const observation: Record<string, unknown> = { receipt, expected: { status: expectedStatus, code,
      commandHash: command.commandHash, artifactHash: command.binding.artifactHash },
      summaryUtf8: receipt.validation.summary ?? null };
    report.lastTerminalReceipt = observation;
    try { observation.summary = JSON.parse(receipt.validation.summary ?? '{}'); }
    catch (error) { observation.summaryError = String(error); }
    try { observation.canonicalReceipt = new ActionReceiptStore({ root: store.root }).read(receipt.id); }
    catch (error) { observation.canonicalReceiptError = String(error); }
    if (receipt.status !== expectedStatus || receipt.validation.code !== code) {
      try {
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'owner.json'), 'utf8')), fixtureOwner);
        const entry = fs.lstatSync(metadataPath, { throwIfNoEntry: false });
        if (!entry) observation.metadataObservation = { present: false };
        else {
          assert(entry.isFile() && entry.nlink === 1 && !entry.isSymbolicLink()
            && samePath(real(metadataPath), metadataPath) && samePath(path.dirname(metadataPath), fixture));
          const limit = command.binding.command.retainedOutputBytes;
          assert(entry.size <= limit, 'Unexpected metadata exceeds the bounded observation limit.');
          const handle = fs.openSync(metadataPath, 'r');
          const buffer = Buffer.alloc(limit + 1);
          let length: number;
          try { length = fs.readSync(handle, buffer, 0, buffer.length, 0); }
          finally { fs.closeSync(handle); }
          assert(length <= limit && length === entry.size, 'Unexpected metadata changed during observation.');
          const bytes = buffer.subarray(0, length);
          observation.metadataObservation = { present: true, validated: false, bytes: length,
            sha256: digest(bytes), utf8: bytes.toString('utf8') };
        }
      } catch (error) { observation.metadataObservationError = String(error); }
    }
    idle();
    assert.equal(receipt.status, expectedStatus);
    assert.equal(receipt.validation.code, code);
    assert.equal(receipt.validation.ruleHash, command.commandHash);
    assert.equal(receipt.metadata?.originalReceiptId, approval.id);
    assert.equal(receipt.metadata?.reviewContextHash, reviewed.setupHash);
    assert.equal(receipt.metadata?.artifactHash, command.binding.artifactHash);
    assert.equal(receipt.actor.kind, 'service'); assert.equal(receipt.actor.id, actorId);
    assert.equal(receipt.authority.scope, 'workspace');
    if (receipt.authority.scope === 'workspace') assert.equal(receipt.authority.workspaceId, workspaceId);
    assert.deepEqual(new ActionReceiptStore({ root: store.root }).read(receipt.id), receipt);
    return JSON.parse(receipt.validation.summary ?? '{}') as { status: string; exitCode: number; outputBytes: number; outputTailSha256: string; durationMs: number };
  };
  const readMetadata = (summary: ReturnType<typeof readTerminal>) => {
    const entry = fs.lstatSync(metadataPath);
    assert(entry.isFile() && entry.nlink === 1 && samePath(real(metadataPath), metadataPath));
    const bytes = fs.readFileSync(metadataPath);
    assert(bytes.length && !bytes.subarray(-1).equals(Buffer.from('\n')), 'Metadata protocol requires file bytes without a final LF.');
    const printed = Buffer.concat([bytes, Buffer.from('\n')]);
    assert(printed.length <= bound.binding.command.retainedOutputBytes, 'Full metadata cannot be proven from a truncated output tail.');
    assert.equal(summary.outputBytes, printed.length);
    assert.equal(summary.outputTailSha256, digest(printed));
    assert(summary.durationMs > 0 && summary.durationMs <= check.timeoutSeconds * 1000 + 20_000);
    return { bytes, utf8: bytes.toString('utf8'), sha256: digest(bytes) };
  };
  const assertOrigins = (metadata: GateMetadata, artifact: typeof positive) => {
    assert(samePath(real(metadata.artifactRoot), artifact.payloadRoot));
    assert(samePath(real(metadata.executable), approved.interpreterPath));
    assert(samePath(real(metadata.lupaPackageFile), path.join(approved.projectRoot, 'lupa/__init__.py')));
    assert(samePath(real(metadata.lupaModuleFile), path.join(approved.projectRoot, 'lupa/luajit20.cp312-win_amd64.pyd')));
    assert.equal(fileHash(metadata.lupaModuleFile), '21902898820ea0335870cccd25b1670bb6dc86564c1047447ea791ad74cb0fc5');
    assert.deepEqual(metadata.pythonVersion, [3, 12, 10]);
    assert.equal(metadata.lupaVersion, '2.6'); assert.equal(metadata.engine, 'lupa.luajit20');
    assert.deepEqual(metadata.sysPath.map(file => real(file).toLowerCase()),
      [path.join(path.dirname(approved.interpreterPath), 'python312.zip'), approved.projectRoot].map(file => real(file).toLowerCase()));
    assert.deepEqual([...new Set(metadata.loadedLua.map(file => file.replace(/\\/g, '/')))].sort(), [...config.covers].sort());
    assert.equal(metadata.okCases, [...metadata.stdout.matchAll(/^\s*\[ok {2}\]\s/gm)].length);
    assert.equal(metadata.failedCases, [...metadata.stdout.matchAll(/^\s*\[FAIL\]\s/gm)].length);
    assert.equal(metadata.renderCases, metadata.okCases + metadata.failedCases);
    artifact.assertIntegrity(); approved.assertIntegrity();
  };
  clearMetadata();
  if (!baseline) {
    const wrong = bind();
    const receipt = await execute(wrong, { ...trusted, pythonSha256: '0'.repeat(64) });
    readTerminal(wrong, receipt, 'incomplete', 'PROJECT_CHECK_RESULT_UNCONFIRMED');
    assert(!fs.existsSync(metadataPath));
    report.wrongRuntimeReceipt = receipt;
    const dependency = path.join(approved.projectRoot, 'lupa/luajit20.cp312-win_amd64.pyd');
    const original = fs.readFileSync(dependency);
    const altered = Buffer.from(original); altered[0] ^= 1;
    try { fs.writeFileSync(dependency, altered); assert.throws(bound.assertReady); }
    finally { fs.writeFileSync(dependency, original); }
    bound.assertReady();
    const runtimeFile = path.join(path.dirname(approved.interpreterPath), 'python312._pth');
    const runtimeBytes = fs.readFileSync(runtimeFile);
    try { fs.writeFileSync(runtimeFile, Buffer.concat([runtimeBytes, Buffer.from('\n# fixture drift\n')])); assert.throws(bound.assertReady); }
    finally { fs.writeFileSync(runtimeFile, runtimeBytes); }
    bound.assertReady();
    const artifactFile = path.join(positive.payloadRoot, ...hubFile.split('/'));
    const artifactBytes = fs.readFileSync(artifactFile);
    try { fs.writeFileSync(artifactFile, Buffer.concat([artifactBytes, Buffer.from('\n-- fixture byte drift\n')]));
      assert.throws(bound.assertReady, { code: 'DEPLOY_SNAPSHOT_CHANGED' }); }
    finally { fs.writeFileSync(artifactFile, artifactBytes); }
    bound.assertReady();
    record('wrong runtime cannot start; frozen dependency/runtime/artifact byte drift refuses binding');
  }
  const positiveReceipt = await execute(bound);
  const positiveSummary = readTerminal(bound, positiveReceipt, baseline ? 'failed' : 'committed',
    baseline ? 'PROJECT_CHECK_EXIT_NONZERO' : 'PROJECT_CHECK_PASSED');
  const positiveOutput = readMetadata(positiveSummary);
  footprint();
  report.positive = { receipt: positiveReceipt, worker: positiveSummary, metadataUtf8: positiveOutput.utf8, metadataSha256: positiveOutput.sha256,
    artifact: positive.manifest, bindingHash: bound.bindingHash };
  if (baseline) {
    assert.equal(positiveSummary.status, 'failed'); assert.equal(positiveSummary.exitCode, 2);
    assert.match(positiveOutput.utf8, /(?:ModuleNotFoundError|ImportError|DLL load failed)/);
    report.status = 'UNQUALIFIED_EXPECTED_RUNTIME_FAILURE';
    record('real approved command fails on missing runtime/import closure; no Lua coverage claimed');
  } else {
    const metadata = JSON.parse(positiveOutput.utf8) as GateMetadata;
    assertOrigins(metadata, positive);
    assert.equal(positiveSummary.status, 'passed'); assert.equal(positiveSummary.exitCode, 0);
    assert.equal(metadata.exitCode, 0); assert.equal(metadata.renderCases, 29); assert.equal(metadata.okCases, 29); assert.equal(metadata.failedCases, 0);
    for (const view of extraViews) assert.match(metadata.stdout, view);
    record('the exact LuaJIT20 artifact executes all 29 full historical cases including five extra views');
    await assert.rejects(execute(bound), { code: 'PROJECT_CHECK_ATTEMPT_EXISTS' });
    idle(); assert.equal(fileHash(metadataPath), positiveOutput.sha256);
    record('a reopened exact command receipt prevents duplicate execution');
    const negative = snapshot({ ...generated, [hubFile]: generated[hubFile]
      + "\nAIC_Hub_Menu.display = function() error('FORGE_QA_SEMANTIC_NEGATIVE') end\n" });
    assert.notEqual(negative.manifest.hash, positive.manifest.hash);
    for (const file of positive.manifest.files.filter(file => file.path !== hubFile)) {
      assert.deepEqual(negative.manifest.files.find(candidate => candidate.path === file.path), file);
    }
    const negativeBound = bind(negative);
    assert.notEqual(negativeBound.bindingHash, bound.bindingHash);
    clearMetadata();
    const negativeReceipt = await execute(negativeBound);
    const negativeSummary = readTerminal(negativeBound, negativeReceipt, 'failed', 'PROJECT_CHECK_EXIT_NONZERO');
    const negativeOutput = readMetadata(negativeSummary);
    footprint();
    const failed = JSON.parse(negativeOutput.utf8) as GateMetadata;
    assertOrigins(failed, negative);
    assert.equal(negativeSummary.status, 'failed'); assert.notEqual(negativeSummary.exitCode, 0);
    assert.notEqual(failed.exitCode, 0); assert(failed.failedCases > 0);
    assert.match(failed.stdout + (failed.error || ''), /FORGE_QA_SEMANTIC_NEGATIVE/);
    report.semanticNegative = { receipt: negativeReceipt, worker: negativeSummary, metadataUtf8: negativeOutput.utf8,
      metadataSha256: negativeOutput.sha256, artifact: negative.manifest, bindingHash: negativeBound.bindingHash };
    record('a syntactically valid planted display failure produces a real failed behavioral receipt');
    const revoked = approvals.revoke(approval.id, signed({ action: 'revoke', approvalId: approval.id, approvalHash: approval.hash }));
    assert.equal(revoked.status, 'committed');
    assert.throws(bound.assertReady, /revoked/);
    assert.throws(() => bind(), /revoked/);
    report.revocation = revoked;
    record('revoked synthetic owner approval cannot bind or reuse prior execution authority');
    report.qualified = true; report.status = 'VERIFIED_CORE_BEHAVIORAL_QUALIFICATION';
  }
  assert.deepEqual(inventory(fixture, true), fixtureBefore, 'Fixture source/runtime inputs changed.');
  report.peakObservedFootprint = footprint();
  idle();
} catch (error) {
  report.status = 'FAILED'; report.qualified = false; report.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  let drained = true;
  try {
    if (coordinator) { const status = coordinator.status([sourceKey]); drained = status.available && status.active.length === 0; }
    assert(drained, 'Runtime cleanup is unresolved; retaining owned scratch.');
    for (const snapshot of snapshots.reverse()) snapshot.dispose();
    frozen?.dispose(); coordinator?.close();
    assertOwnedRoot(); fs.rmSync(root, { recursive: true, force: true });
    report.runtimeCleaned = !fs.existsSync(root);
  } catch (error) {
    report.status = 'FAILED'; report.qualified = false; report.runtimeCleaned = false; report.retainedRuntime = root;
    report.cleanupError = error instanceof Error ? error.stack : String(error); process.exitCode = 1;
  }
  if (originalTemp === undefined) delete process.env.TEMP; else process.env.TEMP = originalTemp;
  if (originalTmp === undefined) delete process.env.TMP; else process.env.TMP = originalTmp;
  console.log(JSON.stringify(report, null, 2));
}
