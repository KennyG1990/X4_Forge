import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionReceiptValidationError, type ActionReceipt } from '../src/lib/actionReceipt';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { buildArtifactPlan } from '../src/lib/artifactPipeline';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { ProjectCheckApprovalLedger } from '../src/server/projectCheckApproval';
import { bindProjectCheckCommand } from '../src/server/projectCheckCommand';
import { executeProjectCheck, projectCheckFailureMessage } from '../src/server/projectCheckExecution';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator, SOURCE_COORDINATION_FILENAME, type ProjectCheckSourceLease } from '../src/server/sharedSourceCoordinator';

const pythonInput = process.env.FORGE_QA_PYTHON;
const scratchInput = process.env.FORGE_QA_TMP;
const systemRoot = process.env.SystemRoot;
assert(process.platform === 'win32' && pythonInput && scratchInput && systemRoot, 'An explicit private Windows fixture is required.');
assert(path.isAbsolute(pythonInput) && path.isAbsolute(scratchInput));
const pythonPath = fs.realpathSync.native(pythonInput);
const scratchParent = fs.realpathSync.native(scratchInput);
const root = fs.mkdtempSync(path.join(scratchParent, 'x4-check-execution-'));
const rootStamp = fs.lstatSync(root, { bigint: true });
const rootOwner = { owner: 'Forge QA', unit: 'project-check-execution-selftest' };
fs.writeFileSync(path.join(root, 'owner.json'), JSON.stringify(rootOwner));
const originalTemp = process.env.TEMP;
const originalTmp = process.env.TMP;
process.env.TEMP = root;
process.env.TMP = root;

const workerPath = fileURLToPath(new URL('../src/server/projectCheckLeaseWorker.py', import.meta.url));
const launcherPath = fileURLToPath(new URL('../src/server/projectCheckWindowsJob.py', import.meta.url));
const outputText = 'fixture-private-command-output';
const artifactText = '<mdscript name="ApprovedArtifact"/>\n';
const modId = 'project_check_execution_fixture';
const actorId = 'fixture-execution-agent';
const workspaceId = 'ws_0123456789abcdef01234567';
const require = createRequire(import.meta.url);
const digest = (content: Buffer | string) => createHash('sha256').update(content).digest('hex');
const fileDigest = (file: string) => digest(fs.readFileSync(file));
const samePath = (left: string, right: string) => path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
const maxBytes = 32 * 1024 * 1024;
const maxEntries = 1000;
let peakEntries = 0;
let peakFiles = 0;
let peakBytes = 0;

function assertOwnedRoot() {
  const current = fs.lstatSync(root, { bigint: true });
  assert(current.isDirectory() && !current.isSymbolicLink() && current.dev === rootStamp.dev && current.ino === rootStamp.ino);
  assert(samePath(fs.realpathSync.native(root), root) && samePath(path.dirname(root), scratchParent));
  assert(path.basename(root).startsWith('x4-check-execution-'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'owner.json'), 'utf8')), rootOwner);
}

function footprint() {
  assertOwnedRoot();
  const pending = [root];
  let entries = 0;
  let files = 0;
  let bytes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      const stat = fs.lstatSync(file);
      assert(++entries <= maxEntries, 'Execution fixture exceeded its logical entry budget.');
      assert(!stat.isSymbolicLink() && samePath(fs.realpathSync.native(file), file), 'Execution fixture contains a link/alias.');
      if (stat.isDirectory()) pending.push(file);
      else {
        assert(stat.isFile() && stat.nlink === 1, 'Execution fixture requires regular single-link files.');
        files++;
        bytes += stat.size;
        assert(bytes <= maxBytes, 'Execution fixture exceeded its logical byte budget.');
      }
    }
  }
  peakEntries = Math.max(peakEntries, entries);
  peakFiles = Math.max(peakFiles, files);
  peakBytes = Math.max(peakBytes, bytes);
  return { entries, files, bytes, peakObservedEntries: peakEntries, peakObservedFiles: peakFiles,
    peakObservedBytes: peakBytes, maxEntries, maxBytes };
}

function pin(worker: string) {
  const canonicalWorker = fs.realpathSync.native(worker);
  return {
    pythonPath, pythonSha256: fileDigest(pythonPath), workerPath: canonicalWorker, workerSha256: fileDigest(canonicalWorker),
    launcherSha256: fileDigest(path.join(path.dirname(canonicalWorker), path.basename(launcherPath))), systemRoot: systemRoot!,
  };
}

// Use the same small, explicitly listed Python 3.12 runtime shape as the
// project-check composition fixture. The check executes the frozen copy.
const stagePortablePython = String.raw`
import json, pathlib, shutil, sys, zipfile
assert sys.version_info[:2] == (3, 12), sys.version
source = pathlib.Path(sys.executable).parent
runtime = pathlib.Path(sys.argv[1])
for name in ["python.exe", "python312.dll", "python3.dll", "vcruntime140.dll", "vcruntime140_1.dll"]:
    if (source / name).is_file():
        shutil.copyfile(source / name, runtime / name)
encodings = sorted((source / "Lib" / "encodings").glob("*.py"))
assert encodings
with zipfile.ZipFile(runtime / "python312.zip", "w", compression=zipfile.ZIP_STORED) as archive:
    for file in encodings:
        archive.write(file, f"encodings/{file.name}")
(runtime / "python312._pth").write_text("python312.zip\n", encoding="ascii")
print(json.dumps(sorted(file.name for file in runtime.iterdir() if file.name != "python.exe")))
`;

const probe = String.raw`
import os, sys, time
mode, marker, release = sys.argv[1:]
assert sys.path == [os.path.join(os.path.dirname(sys.executable), 'python312.zip')], sys.path
assert 'PYTHONPATH' not in os.environ and 'PATH' not in os.environ, sorted(os.environ)
with open(os.path.join(os.environ['FORGE_ARTIFACT_ROOT'], 'md', 'probe.xml'), encoding='utf8') as covered:
    assert covered.read() == '<mdscript name="ApprovedArtifact"/>\n'
with open(marker, 'a', encoding='ascii', newline='\n') as record:
    record.write('started\n')
if mode == 'wait':
    while not os.path.exists(release):
        time.sleep(0.02)
    with open(marker + '.completed', 'w', encoding='ascii') as record:
        record.write('released')
sys.stdout.reconfigure(newline='\n')
print('fixture-private-command-output')
if mode == 'nonzero':
    print('token=fixture-sensitive-secret')
    print(os.getcwd())
sys.exit(7 if mode == 'nonzero' else 0)
`;

function createPortableRuntime() {
  footprint();
  const runtime = path.join(root, 'runtime');
  fs.mkdirSync(runtime);
  const child = spawnSync(pythonPath, ['-I', '-S', '-B', '-c', stagePortablePython, runtime], {
    encoding: 'utf8', env: { SystemRoot: systemRoot }, cwd: root, windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024,
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const dependencies = JSON.parse(child.stdout) as string[];
  assert(dependencies.includes('python312.dll') && dependencies.includes('python312.zip'));
  footprint();
  return { interpreterPath: path.join(runtime, 'python.exe'), interpreterDependencies: dependencies };
}

const dispose: (() => void)[] = [];
const retirementGuards: (() => void)[] = [];
function registerCleanup(cleanup: () => void) {
  let pending = true;
  const once = () => {
    if (!pending) return;
    cleanup();
    pending = false;
  };
  dispose.push(once);
  return once;
}
const checks: string[] = [];
const record = (name: string) => { checks.push(name); console.log(`PASS ${name}`); };
let finalFootprint: ReturnType<typeof footprint> | undefined;

function createFixture(name: string, mode: 'pass' | 'nonzero' | 'wait', interpreter: ReturnType<typeof createPortableRuntime>,
  timeoutSeconds = 10, extraArgs: string[] = []) {
  footprint();
  const directory = path.join(root, name);
  const sourceRoot = path.join(directory, 'source');
  const scratch = path.join(directory, 'scratch');
  const marker = path.join(directory, 'started.txt');
  const release = path.join(directory, 'release.txt');
  fs.mkdirSync(path.join(sourceRoot, 'checks'), { recursive: true });
  fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(sourceRoot, 'checks', 'run.py'), probe, 'utf8');
  const manifest = JSON.stringify({ version: 1, checks: [{
    id: 'smoke', script: 'checks/run.py', covers: ['md/probe.xml'], args: [mode, marker, release, ...extraArgs], timeoutSeconds,
  }] });
  fs.writeFileSync(path.join(sourceRoot, 'forge.checks.json'), manifest, 'utf8');
  const setupInput = { modId, sourceRoot, ...interpreter };
  const reviewed = captureProjectCheckSetup(setupInput);
  const store = new ActionReceiptStore({ root: path.join(directory, 'receipts') });
  const approvals = new ProjectCheckApprovalLedger(store, 'fixture-owner', (owner, decision, proof) =>
    owner === 'fixture-owner' && (decision.action === 'approve'
      ? proof === 'fixture-approve' && decision.reviewId === 'fixture-execution-review' && decision.setupHash === reviewed.setupHash
      : proof === 'fixture-revoke'));
  const approval = approvals.approve(setupInput, reviewed.setupHash, 'fixture-execution-review', 'fixture-approve');
  const frozen = freezeProjectCheckSetup(setupInput, reviewed.setupHash, scratch);
  const retireFrozen = registerCleanup(frozen.dispose);
  footprint();
  const plan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: {
    'content.xml': `<content id="${modId}" name="Fixture" version="100"/>`,
    'forge.checks.json': manifest,
    'md/probe.xml': artifactText,
  } });
  assert(plan.ok, plan.errors.join('\n'));
  const snapshot = captureDeploymentSnapshot(plan, 'loose');
  const retireSnapshot = registerCleanup(snapshot.dispose);
  footprint();
  const bound = bindProjectCheckCommand({
    setupInput, frozen, artifact: { modId, snapshot }, approvals, approvalId: approval.id,
    checkId: 'smoke', runId: randomBytes(16).toString('hex'), systemRoot: systemRoot!,
  });
  const coordinator = new SharedSourceCoordinator({ directory: path.join(directory, 'registry'), waitMs: 1_000, pollMs: 10 });
  let closed = false;
  let retired = false;
  const assertIdle = () => {
    if (closed) return;
    const status = coordinator.status([canonicalSourceKey(sourceRoot)]);
    assert(status.available && status.active.length === 0, `Execution ownership is unresolved; retain scratch: ${root}`);
  };
  retirementGuards.push(assertIdle);
  const closeCoordinator = registerCleanup(() => { assertIdle(); coordinator.close(); closed = true; });
  const execute = (runtime: ReturnType<typeof pin>, commandStore = store,
    wrapLease: (lease: ProjectCheckSourceLease) => ProjectCheckSourceLease = lease => lease,
    keys = [canonicalSourceKey(sourceRoot)], ownerWorkspace = workspaceId) => coordinator.run(
    keys, { actor: actorId, operation: 'fixture-execute-check', workspaceId: ownerWorkspace },
    lease => executeProjectCheck({ lease: wrapLease(lease), bound, runtime, store: commandStore, actorId, workspaceId }),
  );
  const ownership = () => coordinator.status([canonicalSourceKey(sourceRoot)]);
  const retire = () => {
    if (retired) return;
    assertIdle();
    footprint();
    closeCoordinator(); retireSnapshot(); retireFrozen();
    retired = true;
    footprint();
  };
  footprint();
  return { directory, marker, release, sourceRoot, store, approval, approvals, frozen, snapshot, bound, execute, ownership, retire };
}

function assertDurable(fixture: ReturnType<typeof createFixture>, receipt: ActionReceipt, status: ActionReceipt['status'], code: string) {
  assert.equal(receipt.status, status, receipt.validation.code);
  assert.equal(receipt.validation.code, code);
  assert.equal(receipt.validation.ruleHash, fixture.bound.commandHash);
  assert.equal(receipt.metadata?.modId, modId);
  assert.equal(receipt.metadata?.reviewContextHash, fixture.bound.binding.setupHash);
  assert.equal(receipt.metadata?.artifactHash, fixture.snapshot.manifest.hash);
  assert.equal(receipt.metadata?.originalReceiptId, fixture.approval.id);
  const reopened = new ActionReceiptStore({ root: fixture.store.root }).read(receipt.id);
  assert.deepEqual(reopened, receipt);
  assert.equal(reopened.authority.scope, 'workspace');
  if (reopened.authority.scope === 'workspace') assert.equal(reopened.authority.workspaceId, workspaceId);
  assert.equal(reopened.actor.kind, 'service');
  assert.equal(reopened.actor.id, actorId);
  assert.deepEqual(reopened.effects.declared.map(effect => [effect.operation, effect.reversible]), [['execute', false]]);
  const encoded = JSON.stringify(reopened);
  const withoutExcerpt = JSON.stringify({ ...reopened, failure: reopened.failure && { ...reopened.failure, message: undefined } });
  assert(!withoutExcerpt.includes(outputText), 'Raw command output escaped the bounded failure excerpt.');
  assert(!encoded.includes('fixture-sensitive-secret'), 'A policy-covered output secret was persisted.');
  if (reopened.status === 'committed') assert(!encoded.includes(outputText), 'Successful command output was persisted.');
  for (const privatePath of [root, fixture.frozen.root, fixture.snapshot.payloadRoot, pythonPath]) {
    assert(!encoded.includes(JSON.stringify(privatePath).slice(1, -1)), 'An absolute fixture path was persisted.');
  }
  return reopened;
}

function assertOutput(receipt: ActionReceipt, status: 'passed' | 'failed', exitCode: number, additionalOutput = '') {
  const summary = JSON.parse(receipt.validation.summary ?? '');
  const output = outputText + '\n' + additionalOutput;
  assert.equal(summary.status, status);
  assert.equal(summary.exitCode, exitCode);
  assert.equal(summary.outputBytes, Buffer.byteLength(output));
  assert.equal(summary.outputTailSha256, digest(output));
  assert(Number.isSafeInteger(summary.durationMs) && summary.durationMs >= 0 && summary.durationMs <= 10_000);
}

function fakeRuntime(fixture: ReturnType<typeof createFixture>, mode: 'missing' | 'forged') {
  const worker = path.join(fixture.directory, path.basename(workerPath));
  fs.copyFileSync(launcherPath, path.join(fixture.directory, path.basename(launcherPath)));
  const program = [
    'import json, pathlib, sys',
    'assert sys.stdin.buffer.readline().endswith(b"\\n")',
    'pathlib.Path(__file__).with_name("fake-worker-read.txt").write_text("read", encoding="ascii")',
    ...(mode === 'forged' ? ['print(json.dumps({"status":"passed","exitCode":0,"outputBytes":0,"durationSeconds":0.001,'
      + '"treeEmpty":True,"cleanupPersisted":True,"outputTailBase64":""}))'] : []),
  ];
  fs.writeFileSync(worker, program.join('\n') + '\n', 'utf8');
  return pin(worker);
}

function runtimeWithPoisonedCache(directory: string) {
  const worker = path.join(directory, path.basename(workerPath));
  const launcher = path.join(directory, path.basename(launcherPath));
  fs.copyFileSync(workerPath, worker);
  fs.copyFileSync(launcherPath, launcher);
  const runtime = pin(worker);
  const buildCache = String.raw`
import importlib._bootstrap_external, importlib.util, pathlib, sys
assert sys.version_info[:2] == (3, 12), sys.version
launcher = pathlib.Path(sys.argv[1])
stat = launcher.stat()
trap = """
import pathlib
from types import SimpleNamespace
def run_command(*args, **kwargs):
    pathlib.Path(__file__).with_name("cache-trap.txt").write_text("cache executed", encoding="ascii")
    output = b"forged cached output"
    return SimpleNamespace(status="passed", exit_code=0, output_bytes=len(output),
                           duration_seconds=0.001, tree_empty=True, output_tail=output)
"""
cache = pathlib.Path(importlib.util.cache_from_source(str(launcher)))
cache.parent.mkdir()
cache.write_bytes(importlib._bootstrap_external._code_to_timestamp_pyc(
    compile(trap, str(launcher), "exec"), int(stat.st_mtime), stat.st_size
))
`;
  const child = spawnSync(pythonPath, ['-I', '-S', '-B', '-c', buildCache, launcher], {
    encoding: 'utf8', env: { SystemRoot: systemRoot }, cwd: directory, windowsHide: true, timeout: 15_000,
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.equal(fileDigest(launcher), runtime.launcherSha256, 'The pinned launcher source must remain exact.');
  assert(fs.existsSync(path.join(directory, '__pycache__', 'projectCheckWindowsJob.cpython-312.pyc')));
  return runtime;
}

async function waitForMarker(marker: string) {
  const deadline = performance.now() + 6_000;
  while (performance.now() < deadline) {
    if (fs.existsSync(marker) && fs.readFileSync(marker, 'ascii') === 'started\n') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('The frozen check did not reach its fixture marker.');
}

async function interruptCheck(
  fixture: ReturnType<typeof createFixture>, runtime: ReturnType<typeof pin>, mutate: () => void,
  commandStore = fixture.store,
) {
  const pending = fixture.execute(runtime, commandStore);
  // The fault injection may fail first. Keep the execution promise observed
  // while the check is blocked and let the private command exit in all cases.
  void pending.catch(() => {});
  try {
    await waitForMarker(fixture.marker);
    mutate();
  } finally {
    fs.writeFileSync(fixture.release, 'release', 'ascii');
    await pending.catch(() => {});
  }
  return pending;
}

try {
  const excerpt = (text: string, paths: string[] = []) => projectCheckFailureMessage({ outputTailBase64: Buffer.from(text).toString('base64') }, paths);
  assert.equal(excerpt(''), undefined);
  assert.equal(excerpt('\x00\n\r\t'), undefined);
  assert.equal(excerpt('\x1b[31mASSERT failed\x1b[0m\nnext\x00\u202e'), 'Check output (excerpt): ASSERT failed next');
  const privateRoot = 'C:\\Private Project\\scratch[abc]';
  const hiddenPaths = excerpt(`failed at c:/private project/scratch[abc]/checks/test.py and "D:\\Other Project\\check.py"`, [privateRoot]);
  assert(hiddenPaths && !/private project|other project|[a-z]:[\\/]/i.test(hiddenPaths));
  const secret = 'sensitive-test-value';
  const hidden = excerpt(`password=${secret} token=${secret} Bearer ${secret} sk-abcdefghijk`);
  assert(hidden && !hidden.includes(secret) && !hidden.includes('sk-abcdefghijk'));
  assert.equal(excerpt(`tok\x1b[31men=${secret} pass\x00word=${secret}`),
    'Check output (excerpt): [redacted-secret] [redacted-secret]');
  const key = excerpt('-----BEGIN PRIVATE KEY-----\nprivate-key-bytes\n-----END PRIVATE KEY-----');
  const partialKey = excerpt('-----BEGIN PRIVATE KEY-----\nprivate-key-bytes');
  assert(key?.includes('[redacted-private-key]') && !key.includes('private-key-bytes'));
  assert(partialKey?.includes('[redacted-private-key]') && !partialKey.includes('private-key-bytes'));
  const clippedSecret = excerpt(`diagnostic token=${'s'.repeat(10_000)} trailing assertion`);
  assert(clippedSecret?.includes('[redacted-secret]') && !clippedSecret.includes('ssss'));
  const long = excerpt('prefix '.repeat(1000) + 'useful final assertion');
  assert(long && long.length === 512 && long.endsWith('useful final assertion'));
  assert([...long].every(character => character.charCodeAt(0) >= 0x20 && character !== '\u007f'));
  record('failure excerpts are bounded, control-free and redact paths/credentials before clipping');
  const interpreter = createPortableRuntime();
  const trusted = pin(workerPath);

  const unrelated = createFixture('unrelated-lease', 'pass', interpreter);
  await assert.rejects(unrelated.execute(trusted, unrelated.store, lease => lease, [canonicalSourceKey(unrelated.directory)]),
    { code: 'PROJECT_CHECK_SCOPE_MISMATCH' });
  await assert.rejects(unrelated.execute(trusted, unrelated.store, lease => lease, [unrelated.bound.sourceKey], 'ws_ffffffffffffffffffffffff'),
    { code: 'PROJECT_CHECK_SCOPE_MISMATCH' });
  assert(!fs.existsSync(unrelated.marker));
  assert.equal(unrelated.store.listVerified().length, 1);
  record('an unrelated source or workspace lease cannot prepare a command receipt');
  unrelated.retire();

  const oversized = createFixture('oversized-argv', 'pass', interpreter, 10, Array(60).fill('a'.repeat(1024)));
  assertDurable(oversized, await oversized.execute(trusted), 'incomplete', 'PROJECT_CHECK_RESULT_UNCONFIRMED');
  assert.equal(oversized.ownership().active.length, 0, 'Oversized input must be rejected before running admission.');
  assert(!fs.existsSync(oversized.marker));
  record('an oversized Windows command never starts and leaves no running claim');
  oversized.retire();

  const invalidRuntime = path.join(root, 'invalid-runtime');
  fs.mkdirSync(invalidRuntime);
  const invalidExe = path.join(invalidRuntime, 'invalid-python.exe');
  fs.writeFileSync(invalidExe, 'This fixture cannot launch as an executable.', 'ascii');
  const refused = createFixture('windows-launch-refused', 'pass', { interpreterPath: invalidExe, interpreterDependencies: [] });
  assertDurable(refused, await refused.execute(trusted), 'failed', 'PROJECT_CHECK_INFRASTRUCTURE_FAILED');
  assert.equal(refused.ownership().active.length, 0);
  assert(!fs.existsSync(refused.marker));
  record('a Win32 failure before process creation records failure and releases ownership');
  refused.retire();

  const pass = createFixture('pass', 'pass', interpreter);
  const success = assertDurable(pass, await pass.execute(trusted), 'committed', 'PROJECT_CHECK_PASSED');
  assert.equal(success.validation.status, 'passed');
  assertOutput(success, 'passed', 0);
  assert.equal(fs.readFileSync(pass.marker, 'ascii'), 'started\n');
  record('approved frozen command reads the exact artifact and commits a reopened passing receipt');

  await assert.rejects(pass.execute(trusted), { code: 'PROJECT_CHECK_ATTEMPT_EXISTS' });
  assert.equal(fs.readFileSync(pass.marker, 'ascii'), 'started\n');
  assert.equal(pass.store.read(success.id).hash, success.hash);
  assert.equal(pass.store.listVerified().length, 2, 'A duplicate must not create another receipt.');
  record('duplicate command receipt identity refuses a second launch');
  pass.retire();

  const cached = createFixture('poisoned-cache', 'pass', interpreter);
  const cacheResult = await cached.execute(runtimeWithPoisonedCache(cached.directory));
  assert(!fs.existsSync(path.join(cached.directory, 'cache-trap.txt')), 'The worker executed unpinned cached launcher bytecode.');
  assert.equal(fs.readFileSync(cached.marker, 'ascii'), 'started\n');
  assertOutput(assertDurable(cached, cacheResult, 'committed', 'PROJECT_CHECK_PASSED'), 'passed', 0);
  record('matching cached bytecode cannot replace pinned launcher source or forge a passing receipt');
  cached.retire();

  const nonzero = createFixture('nonzero', 'nonzero', interpreter);
  const failed = assertDurable(nonzero, await nonzero.execute(trusted), 'failed', 'PROJECT_CHECK_EXIT_NONZERO');
  assert.equal(failed.validation.status, 'failed');
  assert.match(failed.failure?.message ?? '', /Check output \(excerpt\): fixture-private-command-output/);
  assertOutput(failed, 'failed', 7, `token=fixture-sensitive-secret\n${nonzero.frozen.projectRoot}\n`);
  assert(failed.failure?.message?.includes('[redacted-secret]'));
  assert(failed.failure?.message?.includes('[private-path]'));
  assert.equal(fs.readFileSync(nonzero.marker, 'ascii'), 'started\n');
  record('a drained command with exit seven persists a failed receipt');
  nonzero.retire();

  const refusedExcerpt = createFixture('refused-excerpt', 'nonzero', interpreter);
  const persistFailure = refusedExcerpt.store.fail.bind(refusedExcerpt.store);
  let excerptRejections = 0;
  refusedExcerpt.store.fail = (id, input) => {
    if (input.failure.message?.startsWith('Check output (excerpt):')) {
      excerptRejections++;
      throw new ActionReceiptValidationError('failure.message contains a policy-covered secret-bearing value.');
    }
    return persistFailure(id, input);
  };
  const fallback = assertDurable(refusedExcerpt, await refusedExcerpt.execute(trusted), 'failed', 'PROJECT_CHECK_EXIT_NONZERO');
  assert.equal(excerptRejections, 1);
  assert.equal(fallback.failure?.message, 'Check failed; its diagnostic excerpt was unavailable.');
  assertOutput(fallback, 'failed', 7, `token=fixture-sensitive-secret\n${refusedExcerpt.frozen.projectRoot}\n`);
  record('a rejected diagnostic excerpt cannot discard the confirmed failed command result');
  refusedExcerpt.retire();

  const failedStorage = createFixture('failed-storage', 'nonzero', interpreter);
  let failedWrites = 0;
  failedStorage.store.fail = () => { failedWrites++; throw new Error('fixture storage failure'); };
  await assert.rejects(failedStorage.execute(trusted), /fixture storage failure/);
  assert.equal(failedWrites, 1);
  assert.equal(failedStorage.store.listVerified()[0].status, 'prepared');
  record('a failed terminal write is not retried as a presentation fallback or reported as success');
  failedStorage.retire();

  const timeout = createFixture('timeout', 'wait', interpreter, 2);
  const timedOut = assertDurable(timeout, await timeout.execute(trusted), 'failed', 'PROJECT_CHECK_TIMED_OUT');
  const timedOutSummary = JSON.parse(timedOut.validation.summary ?? '');
  assert.equal(timedOut.validation.status, 'failed');
  assert.equal(timedOutSummary.status, 'timed-out');
  assert.equal(timedOutSummary.exitCode, null);
  assert.equal(timedOutSummary.outputBytes, 0);
  assert.equal(timedOutSummary.outputTailSha256, digest(''));
  assert.equal(fs.readFileSync(timeout.marker, 'ascii'), 'started\n');
  assert(!fs.existsSync(timeout.marker + '.completed'));
  record('a real timed-out command drains and persists a distinct failed receipt');
  timeout.retire();

  for (const mode of ['missing', 'forged'] as const) {
    const malformed = createFixture(mode, 'pass', interpreter);
    const rejected = assertDurable(malformed, await malformed.execute(fakeRuntime(malformed, mode)),
      'incomplete', 'PROJECT_CHECK_RESULT_UNCONFIRMED');
    assert.equal(rejected.validation.status, 'failed');
    assert.equal(fs.readFileSync(path.join(malformed.directory, 'fake-worker-read.txt'), 'ascii'), 'read');
    assert(!fs.existsSync(malformed.marker), 'The approved check should not run under the fake worker.');
    record(mode === 'missing' ? 'worker exit without a result records incomplete execution'
      : 'a forged passed result with no durable drain cannot commit');
    malformed.retire();
  }

  const replaced = createFixture('registry-substitution', 'pass', interpreter);
  const Database = require('better-sqlite3');
  const cloneDir = path.join(replaced.directory, 'clone');
  fs.mkdirSync(cloneDir);
  const clonePath = path.join(cloneDir, SOURCE_COORDINATION_FILENAME);
  let copiedClaim: string | undefined;
  const switched = await replaced.execute(trusted, replaced.store, lease => ({
    ...lease,
    armProjectCheck(guard) {
      const frame = lease.armProjectCheck(guard);
      const original = new Database(frame.registry, { readonly: true, fileMustExist: true });
      try { original.prepare('VACUUM INTO ?').run(clonePath); }
      finally { original.close(); }
      copiedClaim = frame.claimId;
      return { ...frame, registry: fs.realpathSync.native(clonePath) };
    },
  }));
  assert(copiedClaim, 'The fixture must substitute the registry only after a real claim is armed.');
  assertDurable(replaced, switched, 'incomplete', 'PROJECT_CHECK_RESULT_UNCONFIRMED');
  assert(!fs.existsSync(replaced.marker), 'The substitute registry must not authorize a launch.');
  const clone = new Database(clonePath, { readonly: true, fileMustExist: true });
  try {
    assert.deepEqual(clone.prepare('SELECT guard_phase FROM claims WHERE id = ?').get(copiedClaim), { guard_phase: 'armed' });
  } finally { clone.close(); }
  record('a substituted registry containing the exact armed row cannot authorize the trusted worker');
  replaced.retire();

  const blocked = createFixture('prepare-fault', 'pass', interpreter);
  const blockedRoot = path.join(blocked.directory, 'blocked-receipts');
  fs.writeFileSync(blockedRoot, 'Fixture prevents receipt root creation.', 'ascii');
  await assert.rejects(blocked.execute(trusted, new ActionReceiptStore({ root: blockedRoot })), /receipt|directory/i);
  assert(!fs.existsSync(blocked.marker));
  assert.equal(blocked.store.listVerified().length, 1, 'Only the owner approval should be durable.');
  record('receipt preparation failure occurs before project execution');
  blocked.retire();

  const failedCommit = createFixture('commit-fault', 'wait', interpreter);
  let clock = Date.UTC(2026, 10, 8, 12);
  const clockedStore = new ActionReceiptStore({ root: failedCommit.store.root, now: () => clock });
  let prepared: ActionReceipt | undefined;
  await assert.rejects(interruptCheck(failedCommit, trusted, () => {
    prepared = failedCommit.store.listVerified().find(receipt => receipt.status === 'prepared');
    assert(prepared, 'A prepared receipt must already be durable while the command runs.');
    clock -= 60_000;
  }, clockedStore), /receipt transition precedes preparation/i);
  assert(prepared);
  assert.equal(fs.readFileSync(failedCommit.marker + '.completed', 'ascii'), 'released');
  assert.deepEqual(failedCommit.store.read(prepared.id), prepared);
  await assert.rejects(failedCommit.execute(trusted), { code: 'PROJECT_CHECK_ATTEMPT_EXISTS' });
  assert.equal(fs.readFileSync(failedCommit.marker, 'ascii'), 'started\n');
  record('terminal receipt transition failure retains prepared state and prevents another launch');
  failedCommit.retire();

  const tampered = createFixture('tamper', 'wait', interpreter);
  const afterTamper = await interruptCheck(tampered, trusted, () =>
    fs.writeFileSync(path.join(tampered.snapshot.payloadRoot, 'md', 'probe.xml'), '<mdscript name="ChangedArtifact!"/>\n', 'utf8'));
  assertDurable(tampered, afterTamper, 'failed', 'PROJECT_CHECK_BINDING_CHANGED');
  assertOutput(afterTamper, 'passed', 0);
  record('changing covered artifact bytes during a real command prevents a passing receipt');
  tampered.retire();

  const revoked = createFixture('revoke', 'wait', interpreter);
  const afterRevocation = await interruptCheck(revoked, trusted, () => {
    const revocation = revoked.approvals.revoke(revoked.approval.id, 'fixture-revoke');
    assert.equal(revocation.status, 'committed');
  });
  assertDurable(revoked, afterRevocation, 'failed', 'PROJECT_CHECK_BINDING_CHANGED');
  assertOutput(afterRevocation, 'passed', 0);
  record('revoking owner approval during a real command prevents a passing receipt');
  revoked.retire();

  finalFootprint = footprint();
} finally {
  try {
    // Check every still-open fixture before retiring anything after a failed case.
    for (const guard of retirementGuards) guard();
    footprint();
    for (const cleanup of dispose.reverse()) cleanup();
    footprint();
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(fs.existsSync(root), false);
  } finally {
    if (originalTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = originalTemp;
    if (originalTmp === undefined) delete process.env.TMP;
    else process.env.TMP = originalTmp;
  }
}
console.log(JSON.stringify({ status: 'passed', realWindowsProcesses: true, fixtureOwnerApproval: true,
  checks, footprint: finalFootprint, runtimeCleaned: true }));
