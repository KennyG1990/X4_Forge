import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, hashActionReceiptAuthority, type ActionReceipt } from '../src/lib/actionReceipt';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { buildArtifactPlan } from '../src/lib/artifactPipeline';
import { applyProjectCheckCoverage, buildValidationEvidence } from '../src/lib/validationEvidence';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { ProjectCheckApprovalLedger } from '../src/server/projectCheckApproval';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';
import { executeProjectCheckSuite, readProjectCheckSuiteReport, requirePassedProjectCheckSuite } from '../src/server/projectCheckSuite';
import { ProjectCheckRunService } from '../src/server/projectCheckRunService';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator, type ProjectCheckSourceLease } from '../src/server/sharedSourceCoordinator';

const pythonInput = process.env.FORGE_QA_PYTHON;
const scratchInput = process.env.FORGE_QA_TMP;
const systemRoot = process.env.SystemRoot;
assert(process.platform === 'win32' && pythonInput && scratchInput && systemRoot, 'An explicit private Windows fixture is required.');
assert(path.isAbsolute(pythonInput) && path.isAbsolute(scratchInput));
const pythonPath = fs.realpathSync.native(pythonInput);
const scratchParent = fs.realpathSync.native(scratchInput);
const root = fs.mkdtempSync(path.join(scratchParent, 'x4-check-suite-'));
const rootStamp = fs.lstatSync(root, { bigint: true });
const originalTemp = process.env.TEMP;
const originalTmp = process.env.TMP;
process.env.TEMP = root;
process.env.TMP = root;
const workspaceId = 'ws_0123456789abcdef01234567';
const actorId = 'fixture-suite-agent';
const modId = 'project_check_suite_fixture';
const digestFile = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const workerPath = fs.realpathSync.native(fileURLToPath(new URL('../src/server/projectCheckLeaseWorker.py', import.meta.url)));
const launcherPath = path.join(path.dirname(workerPath), 'projectCheckWindowsJob.py');
const runtime = {
  pythonPath, pythonSha256: digestFile(pythonPath), workerPath, workerSha256: digestFile(workerPath),
  launcherSha256: digestFile(launcherPath), systemRoot,
};

const stage = String.raw`
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
name, marker, release, mode = sys.argv[1:5]
assert sys.path == [os.path.join(os.path.dirname(sys.executable), 'python312.zip')], sys.path
assert 'PYTHONPATH' not in os.environ and 'PATH' not in os.environ
with open(os.path.join(os.environ['FORGE_ARTIFACT_ROOT'], 'md', name + '.xml'), encoding='utf8') as covered:
    assert covered.read() == '<mdscript name="' + name + '"/>\n'
if len(sys.argv) == 6:
    with open(os.path.join(os.environ['FORGE_ARTIFACT_ROOT'], sys.argv[5]), encoding='utf8') as lua:
        assert lua.read() == 'return 1\n'
with open(marker, 'a', encoding='ascii', newline='\n') as record:
    record.write('started\n')
if mode in ('wait', 'wait-nonzero'):
    while not os.path.exists(release):
        time.sleep(0.02)
if mode != 'nonzero-empty':
    print(name)
sys.exit(7 if mode in ('nonzero', 'nonzero-empty', 'wait-nonzero') else 0)
`;

function stageInterpreter() {
  const directory = path.join(root, 'runtime');
  fs.mkdirSync(directory);
  const child = spawnSync(pythonPath, ['-I', '-S', '-B', '-c', stage, directory], {
    cwd: root, env: { SystemRoot: systemRoot }, windowsHide: true,
    encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 15_000,
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const interpreterDependencies = JSON.parse(child.stdout) as string[];
  assert(interpreterDependencies.includes('python312.dll') && interpreterDependencies.includes('python312.zip'));
  return { interpreterPath: path.join(directory, 'python.exe'), interpreterDependencies };
}

const checks: string[] = [];
const cleanup: (() => void)[] = [];
const retained: (() => boolean)[] = [];
function record(name: string) { checks.push(name); console.log(`PASS ${name}`); }

const footprintLimit = { bytes: 128 * 1024 * 1024, entries: 2000 };
const peakFootprint = { bytes: 0, entries: 0 };
function meterFixture() {
  const current = fs.lstatSync(root, { bigint: true });
  assert(current.isDirectory() && current.dev === rootStamp.dev && current.ino === rootStamp.ino);
  assert.equal(path.dirname(fs.realpathSync.native(root)), scratchParent);
  const pending = [root];
  let bytes = 0;
  let entries = 0;
  while (pending.length) {
    const directory = pending.pop()!;
    assert.equal(fs.realpathSync.native(directory).toLowerCase(), path.resolve(directory).toLowerCase());
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), 'Fixture inventory must not follow a reparse directory.');
      assert(++entries <= footprintLimit.entries, 'Suite fixture entry budget exceeded.');
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else {
        bytes += fs.lstatSync(file).size;
        assert(bytes <= footprintLimit.bytes, 'Suite fixture byte budget exceeded.');
      }
    }
  }
  peakFootprint.bytes = Math.max(peakFootprint.bytes, bytes);
  peakFootprint.entries = Math.max(peakFootprint.entries, entries);
}

type Mode = 'wait' | 'wait-nonzero' | 'nonzero' | 'nonzero-empty' | 'pass';
function fixture(name: string, declarations: ReadonlyArray<readonly [string, Mode, number?]>, interpreter: ReturnType<typeof stageInterpreter>,
  maxParallelChecks?: number, coversChecks?: string[]) {
  const directory = path.join(root, name);
  const sourceRoot = path.join(directory, 'source');
  const scratch = path.join(directory, 'scratch');
  const script = path.join(sourceRoot, 'checks', 'run.py');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.mkdirSync(scratch);
  fs.writeFileSync(script, probe, 'utf8');
  const commands = declarations.map(([id, mode, timeoutSeconds = 12]) => ({
    id, mode, timeoutSeconds, covered: `md/${id}.xml`, luaCovered: coversChecks === undefined ? undefined : `ui/${id}.lua`,
    marker: path.join(directory, `${id}-started.txt`),
    release: path.join(directory, `${id}-release.txt`),
  }));
  const manifest = JSON.stringify({ version: 1, ...(maxParallelChecks === undefined ? {} : { maxParallelChecks }),
    checks: commands.map(command => ({
    id: command.id, script: 'checks/run.py', covers: [command.covered, ...(command.luaCovered ? [command.luaCovered] : [])],
    timeoutSeconds: command.timeoutSeconds,
    args: [command.id, command.marker, command.release, command.mode, ...(command.luaCovered ? [command.luaCovered] : [])],
    ...(coversChecks === undefined ? {} : { coversChecks }),
  })) });
  fs.writeFileSync(path.join(sourceRoot, 'forge.checks.json'), manifest, 'utf8');

  const setupInput = { modId, sourceRoot, ...interpreter };
  const reviewed = captureProjectCheckSetup(setupInput);
  const store = new ActionReceiptStore({ root: path.join(directory, 'receipts') });
  const approvals = new ProjectCheckApprovalLedger(store, 'fixture-owner', (owner, decision, proof) =>
    owner === 'fixture-owner' && (decision.action === 'approve'
      ? proof === 'fixture-approve' && decision.reviewId === 'fixture-suite-owner-review' && decision.setupHash === reviewed.setupHash
      : proof === 'fixture-revoke'));
  const approval = approvals.approve(setupInput, reviewed.setupHash, 'fixture-suite-owner-review', 'fixture-approve');
  const runId = randomBytes(16).toString('hex');

  const inputDisposers: (() => void)[] = [];
  const inputs = (changeArtifact = false) => {
    const frozen = freezeProjectCheckSetup(setupInput, reviewed.setupHash, scratch);
    cleanup.push(frozen.dispose);
    inputDisposers.push(frozen.dispose);
    const plan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: {
      'content.xml': `<content id="${modId}" name="Fixture" version="100"/>`,
      'forge.checks.json': manifest,
      ...Object.fromEntries(commands.map((command, index) => [command.covered,
        `<mdscript name="${changeArtifact && index === 0 ? 'different' : command.id}"/>\n`])),
      ...Object.fromEntries(commands.filter(command => command.luaCovered).map(command => [command.luaCovered!, 'return 1\n'])),
    } });
    assert(plan.ok, plan.errors.join('\n'));
    const snapshot = captureDeploymentSnapshot(plan, 'loose');
    cleanup.push(snapshot.dispose);
    inputDisposers.push(snapshot.dispose);
    meterFixture();
    return { setupInput, frozen, artifact: { modId, snapshot }, approvals, approvalId: approval.id, runId,
      systemRoot: systemRoot!, runtime, store, workspaceId, actorId };
  };
  const exact = inputs();
  const registry = path.join(directory, 'registry');
  const coordinator = new SharedSourceCoordinator({ directory: registry, waitMs: 8_000, pollMs: 10 });
  const observer = new SharedSourceCoordinator({ directory: registry, waitMs: 8_000, pollMs: 10 });
  cleanup.push(() => coordinator.close(), () => observer.close());
  const key = canonicalSourceKey(sourceRoot);
  const ownership = () => observer.status([key]);
  retained.push(() => {
    const status = ownership();
    return !status.available || status.active.some(claim => claim.guardPhase === 'running');
  });
  const execute = (selected = exact, wrapLease: (lease: ProjectCheckSourceLease) => ProjectCheckSourceLease = lease => lease) =>
    coordinator.run([key], { actor: actorId, operation: 'fixture-suite', workspaceId },
      lease => executeProjectCheckSuite({ ...selected, lease: wrapLease(lease) }));
  return { commands, approvals, approval, store, script, exact, inputs, execute, coordinator, observer, key, ownership,
    retireInputs: () => { for (const dispose of inputDisposers.splice(0).reverse()) dispose(); } };
}

async function until<T>(read: () => T | undefined, label: string): Promise<T> {
  const deadline = performance.now() + 6_000;
  while (performance.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

const started = (marker: string) => fs.existsSync(marker) && fs.readFileSync(marker, 'ascii') === 'started\n';
const release = (marker: string) => fs.writeFileSync(marker, 'release', 'ascii');
const isCommand = (receipt: ActionReceipt) => 'id' in receipt.capability && receipt.capability.id === 'project-check.command';

try {
  const interpreter = stageInterpreter();
  // Deliberately out of alphabetical order. Declaration order is part of the suite.
  const success = fixture('success', [['omega', 'wait'], ['alpha', 'wait']], interpreter);
  const [first, second] = success.commands;
  const admissions: { guard: Parameters<ProjectCheckSourceLease['armProjectCheck']>[0];
    frame: ReturnType<ProjectCheckSourceLease['armProjectCheck']> }[] = [];
  let observedLease: ProjectCheckSourceLease | undefined;
  const running = success.execute(success.exact, lease => {
    observedLease = lease;
    return {
      ...lease,
      armProjectCheck(guard) {
        const frame = lease.armProjectCheck(guard);
        admissions.push({ guard, frame });
        return frame;
      },
    };
  });
  void running.catch(() => {});
  let competing: Promise<unknown> | undefined;
  let writerEntered = false;
  let receipt: ActionReceipt;
  try {
    await until(() => started(first.marker) ? true : undefined, 'the first real command');
    assert(!fs.existsSync(second.marker));
    const firstStatus = success.ownership();
    assert(firstStatus.available);
    assert.equal(firstStatus.active.length, 1);
    assert.equal(firstStatus.active[0].guardPhase, 'running');
    const claim = firstStatus.active[0];
    assert(observedLease);
    assert.equal(admissions.length, 1);
    const lease = observedLease;
    const firstAdmission = admissions[0];
    const earlyHash = createHash('sha256').update('fixture-early-successor').digest('hex');
    const earlyCommand = createHash('sha256').update('fixture-early-command').digest('hex');
    assert.throws(() => lease.armProjectCheck({
      ...firstAdmission.guard, bindingHash: earlyHash, commandHash: earlyCommand,
      jobName: `Local\\X4ForgeProjectCheck-${earlyCommand.slice(0, 32)}`,
    }), { code: 'PROJECT_CHECK_REARM_UNCONFIRMED' });
    const preflight = success.store.listVerified();
    assert.equal(preflight.filter(item => item.status === 'prepared' && !isCommand(item)).length, 1,
      'The parent attempt must be durable before the first command executes.');

    competing = success.observer.run([success.key], { actor: 'fixture-writer', operation: 'competing-write' },
      () => { writerEntered = true; });
    void competing.catch(() => {});
    await until(() => success.ownership().waiting.some(waiter => waiter.owner.actor === 'fixture-writer')
      ? true : undefined, 'the overlapping writer to queue');

    release(first.release);
    await until(() => started(second.marker) ? true : undefined, 'the second real command');
    const secondStatus = success.ownership();
    assert(secondStatus.available);
    assert.equal(secondStatus.active.length, 1);
    assert.equal(secondStatus.active[0].id, claim.id);
    assert.equal(secondStatus.active[0].instanceId, claim.instanceId);
    assert.equal(secondStatus.active[0].guardPhase, 'running');
    assert.equal(admissions.length, 2);
    assert.throws(() => lease.assertProjectCheckDrained(firstAdmission.frame), { code: 'SOURCE_COORDINATION_LOST' });
    assert.throws(() => lease.armProjectCheck(firstAdmission.guard), { code: 'PROJECT_CHECK_GUARD_REPLAY' });
    assert.equal(writerEntered, false);
    assert(secondStatus.waiting.some(waiter => waiter.owner.actor === 'fixture-writer'));
    const duringSecond = success.store.listVerified().filter(isCommand);
    assert.deepEqual(duringSecond.map(item => [item.authority.operationId.split(':').at(-1), item.status]).sort(),
      [['alpha', 'prepared'], ['omega', 'committed']]);

    release(second.release);
    receipt = await running;
    await competing;
    assert.equal(writerEntered, true);
  } finally {
    for (const command of success.commands) release(command.release);
    await running.catch(() => {});
    await competing?.catch(() => {});
  }
  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.validation.code, 'PROJECT_CHECK_SUITE_PASSED');
  record('two real checks rearm one source claim in declaration order while an overlapping writer remains queued');
  record('early rearm, the stale drain frame and replay of the original guard are refused');

  await assert.rejects(success.execute(), { code: 'PROJECT_CHECK_SUITE_EXISTS' });
  for (const command of success.commands) assert(started(command.marker));
  assert.equal(success.store.read(receipt.id).hash, receipt.hash);
  assert.equal(success.store.listVerified().length, 4);
  record('replaying an exact suite attempt never launches either command again');

  const previousFrozenRoot = success.exact.frozen.root;
  const previousPayloadRoot = success.exact.artifact.snapshot.payloadRoot;
  success.exact.artifact.snapshot.dispose();
  success.exact.frozen.dispose();
  assert(!fs.existsSync(previousFrozenRoot) && !fs.existsSync(previousPayloadRoot));
  const fresh = success.inputs();
  assert.notEqual(fresh.frozen.root, previousFrozenRoot);
  assert.notEqual(fresh.artifact.snapshot.payloadRoot, previousPayloadRoot);
  const reopened = new ActionReceiptStore({ root: success.store.root });
  const reopenedInput = { ...fresh, store: reopened };
  const verified = await requirePassedProjectCheckSuite(reopenedInput, receipt.id);
  assert.deepEqual(verified.receipt, reopened.read(receipt.id));
  assert.match(verified.reviewBasisHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(verified.commandReceipts.map(command => command.authority.operationId),
    success.commands.map(command => `project-check:${fresh.runId}:${command.id}`));
  assert.equal(new Set(verified.commandReceipts.map(command => command.id)).size, 2);
  assert(verified.verification.checks.every(check => !Object.hasOwn(check, 'coveredChecks')));
  for (const child of verified.commandReceipts) {
    assert.equal(child.status, 'committed');
    assert.equal(child.validation.code, 'PROJECT_CHECK_PASSED');
    assert.deepEqual(child, reopened.read(child.id));
  }
  const passedReport = readProjectCheckSuiteReport(reopened, receipt);
  assert(passedReport);
  assert.equal(passedReport.state, 'passed');
  assert.equal(passedReport.notRunCount, 0);
  assert.deepEqual(passedReport.checks.map(check => check.id).sort(), ['alpha', 'omega']);
  assert(passedReport.checks.every(check => check.message === undefined));
  record('the exact parent and both command receipts reopen against independently frozen identical inputs');

  const incompleteChild = verified.commandReceipts[0];
  const childPath = reopened.pathFor(incompleteChild.id);
  const hidden = childPath + '.fixture-hidden';
  fs.renameSync(childPath, hidden);
  try {
    await assert.rejects(async () => requirePassedProjectCheckSuite(reopenedInput, receipt.id));
    assert.throws(() => readProjectCheckSuiteReport(reopened, receipt));
  }
  finally { fs.renameSync(hidden, childPath); }
  const childBytes = fs.readFileSync(childPath);
  fs.appendFileSync(childPath, '\n');
  try { await assert.rejects(async () => requirePassedProjectCheckSuite(reopenedInput, receipt.id)); }
  finally { fs.writeFileSync(childPath, childBytes); }
  assert.equal((await requirePassedProjectCheckSuite(reopenedInput, receipt.id)).reviewBasisHash, verified.reviewBasisHash);
  record('a missing or changed linked command receipt prevents credit for the suite');

  await assert.rejects(async () => requirePassedProjectCheckSuite({ ...success.inputs(true), store: reopened }, receipt.id));
  fs.appendFileSync(success.script, '\n# setup drift\n', 'utf8');
  try { await assert.rejects(async () => requirePassedProjectCheckSuite(reopenedInput, receipt.id)); }
  finally { fs.writeFileSync(success.script, probe, 'utf8'); }
  assert.equal((await requirePassedProjectCheckSuite(reopenedInput, receipt.id)).reviewBasisHash, verified.reviewBasisHash);
  const revocation = success.approvals.revoke(success.approval.id, 'fixture-revoke');
  assert.equal(revocation.status, 'committed');
  await assert.rejects(async () => requirePassedProjectCheckSuite(reopenedInput, receipt.id));
  record('current artifact drift, approved setup drift and revoked approval each prevent reuse of a historical pass');

  const failure = fixture('second-fails', [['omega', 'pass'], ['alpha', 'nonzero'], ['unused', 'pass']], interpreter);
  const runs = new ProjectCheckRunService(failure.store, failure.coordinator);
  const admitted = await runs.start({ actorId, workspaceId, operationId: 'failure-excerpt-report', modId,
    artifactHash: failure.exact.artifact.snapshot.manifest.hash,
    requestHash: createHash('sha256').update('failure-excerpt-report').digest('hex'), sourceKey: failure.key },
  async (lease, runId) => {
    failure.exact.runId = runId;
    const suite = await executeProjectCheckSuite({ ...failure.exact, lease });
    return { suite, logicalArtifactHash: suite.input.beforeHash };
  });
  const runStatus = await until(() => {
    const status = runs.status(actorId, workspaceId, admitted.id);
    return status.state === 'queued' || status.state === 'running' ? undefined : status;
  }, 'failed run report');
  assert.equal(runStatus.state, 'failed');
  assert(runStatus.suiteReport);
  const failed = failure.store.read(runStatus.suiteReport.suite.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.validation.code, 'PROJECT_CHECK_SUITE_FAILED');
  assert.deepEqual(new ActionReceiptStore({ root: failure.store.root }).read(failed.id), failed);
  const children = failure.store.listVerified().filter(isCommand);
  assert.deepEqual(children.map(item => [item.authority.operationId.split(':').at(-1), item.validation.code]).sort(),
    [['alpha', 'PROJECT_CHECK_EXIT_NONZERO'], ['omega', 'PROJECT_CHECK_PASSED']]);
  const failedReport = readProjectCheckSuiteReport(failure.store, failed);
  assert(failedReport);
  assert.equal(failedReport.state, 'failed');
  assert.equal(failedReport.plannedCount, 3);
  assert.equal(failedReport.notRunCount, 1);
  const failedCheck = failedReport.checks.find(check => check.id === 'alpha');
  assert(failedCheck);
  assert.equal(failedCheck.state, 'failed');
  assert.equal(failedCheck.code, 'PROJECT_CHECK_EXIT_NONZERO');
  assert.equal(failedCheck.worker?.exitCode, 7);
  assert.equal(failedCheck.worker?.status, 'failed');
  assert.equal(failedCheck.message, 'Check output (excerpt): alpha');
  const reopenedFailure = readProjectCheckSuiteReport(new ActionReceiptStore({ root: failure.store.root }), failed);
  assert.deepEqual(JSON.parse(JSON.stringify(reopenedFailure)), failedReport);
  const reopenedRun = new ProjectCheckRunService(new ActionReceiptStore({ root: failure.store.root }), failure.coordinator);
  assert.deepEqual(JSON.parse(JSON.stringify(reopenedRun.status(actorId, workspaceId, admitted.id))), runStatus);
  assert.throws(() => reopenedRun.status('different-agent', workspaceId, admitted.id), { code: 'PROJECT_CHECK_RUN_NOT_FOUND' });
  assert.deepEqual(runStatus.suiteReport, failedReport);
  assert(started(failure.commands[0].marker) && started(failure.commands[1].marker));
  assert(!fs.existsSync(failure.commands[2].marker));
  await assert.rejects(async () => requirePassedProjectCheckSuite(failure.exact, failed.id));
  await assert.rejects(failure.execute(), { code: 'PROJECT_CHECK_SUITE_EXISTS' });
  assert(started(failure.commands[0].marker) && started(failure.commands[1].marker));
  record('a real second-command failure stops the suite before a third command and provides no passing proof');
  const outputless = fixture('no-output', [['alpha', 'nonzero-empty']], interpreter);
  const outputlessSuite = await outputless.execute();
  const outputlessReport = readProjectCheckSuiteReport(new ActionReceiptStore({ root: outputless.store.root }), outputlessSuite);
  assert.equal(outputlessReport?.state, 'failed');
  assert.equal(outputlessReport.checks[0].message, undefined);
  await assert.rejects(async () => requirePassedProjectCheckSuite(outputless.exact, outputlessSuite.id));
  record('the historical hash-only failure shape remains readable without inventing output or passing proof');

  const unknown = fixture('unconfirmed-first', [['omega', 'pass'], ['alpha', 'pass']], interpreter);
  const wrongRuntime = { ...unknown.exact, runtime: { ...runtime, workerSha256: '0'.repeat(64) } };
  const incomplete = await unknown.execute(wrongRuntime);
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.validation.code, 'PROJECT_CHECK_SUITE_UNCONFIRMED');
  assert.deepEqual(new ActionReceiptStore({ root: unknown.store.root }).read(incomplete.id), incomplete);
  const attempted = unknown.store.listVerified().filter(isCommand);
  assert.equal(attempted.length, 1);
  assert.equal(attempted[0].authority.operationId, `project-check:${unknown.exact.runId}:omega`);
  assert.equal(attempted[0].validation.code, 'PROJECT_CHECK_RESULT_UNCONFIRMED');
  const incompleteReport = readProjectCheckSuiteReport(unknown.store, incomplete);
  assert(incompleteReport);
  assert.equal(incompleteReport.state, 'incomplete');
  assert.equal(incompleteReport.notRunCount, 1);
  assert.equal(incompleteReport.checks[0].id, 'omega');
  assert.equal(incompleteReport.checks[0].state, 'incomplete');
  assert.equal(incompleteReport.checks[0].worker, undefined);
  for (const command of unknown.commands) assert(!fs.existsSync(command.marker));
  await assert.rejects(async () => requirePassedProjectCheckSuite(wrongRuntime, incomplete.id));
  record('an unconfirmed first result leaves an incomplete suite and never creates the second child attempt');

  const changed = fixture('revoke-between', [['omega', 'pass'], ['alpha', 'pass']], interpreter);
  let revokeReceipt: ActionReceipt | undefined;
  class RevokeAfterFirstCommand extends ActionReceiptStore {
    override commit(...args: Parameters<ActionReceiptStore['commit']>) {
      const committed = super.commit(...args);
      if (isCommand(committed) && committed.authority.operationId === `project-check:${changed.exact.runId}:omega`) {
        revokeReceipt = changed.approvals.revoke(changed.approval.id, 'fixture-revoke');
      }
      return committed;
    }
  }
  const revokedBetween = await changed.execute({
    ...changed.exact, store: new RevokeAfterFirstCommand({ root: changed.store.root }),
  });
  assert.equal(revokedBetween.status, 'failed');
  assert.equal(revokedBetween.validation.code, 'PROJECT_CHECK_SUITE_BINDING_CHANGED');
  const reopenedChanged = new ActionReceiptStore({ root: changed.store.root });
  assert.deepEqual(reopenedChanged.read(revokedBetween.id), revokedBetween);
  assert(revokeReceipt);
  assert.equal(reopenedChanged.read(revokeReceipt.id).status, 'committed');
  const changedChildren = reopenedChanged.listVerified().filter(isCommand);
  assert.equal(changedChildren.length, 1);
  assert.equal(changedChildren[0].authority.operationId, `project-check:${changed.exact.runId}:omega`);
  assert.equal(changedChildren[0].validation.code, 'PROJECT_CHECK_PASSED');
  const stoppedReport = readProjectCheckSuiteReport(reopenedChanged, revokedBetween);
  assert(stoppedReport);
  assert.equal(stoppedReport.state, 'failed');
  assert.equal(stoppedReport.stoppedBeforeCheckId, 'alpha');
  assert.equal(stoppedReport.notRunCount, 1);
  assert.deepEqual(stoppedReport.checks.map(check => [check.id, check.state]), [['omega', 'passed']]);
  assert(started(changed.commands[0].marker));
  assert(!fs.existsSync(changed.commands[1].marker));
  record('owner revocation after the first child commits leaves a durable failed suite without starting the second');

  const namedClaims = ['x4-ui.truncated-evidence', 'lua_md.emit_verification_gap', 'md_lua.registration_verification_gap', 'lua.runtime_scope_unverified'];
  const parallel = fixture('parallel-refill', [['omega', 'wait'], ['alpha', 'wait'], ['middle', 'wait']], interpreter, 2, namedClaims);
  assert(Object.isFrozen(parallel.exact.frozen.setup.checks[0].coversChecks));
  assert.throws(() => parallel.exact.frozen.setup.checks[0].coversChecks!.push('unknown'));
  const parallelAdmissions: number[] = [];
  const parallelRun = parallel.execute(parallel.exact, lease => ({ ...lease,
    armProjectCheck(guard, budget) { parallelAdmissions.push(budget!); return lease.armProjectCheck(guard, budget); },
  }));
  void parallelRun.catch(() => {});
  let parallelReceipt: ActionReceipt;
  try {
    await until(() => parallel.commands.slice(0, 2).every(command => started(command.marker)) ? true : undefined, 'two overlapping suite Jobs');
    assert(!fs.existsSync(parallel.commands[2].marker));
    assert.deepEqual(parallelAdmissions, [2, 2]);
    release(parallel.commands[1].release); // Complete index1 before index0.
    await until(() => started(parallel.commands[2].marker) ? true : undefined, 'one refilled suite slot');
    assert.equal(parallel.store.listVerified().filter(isCommand).filter(child => child.status === 'prepared').length, 2);
    assert.deepEqual(parallelAdmissions, [2, 2, 2]);
    release(parallel.commands[2].release);
    await until(() => parallel.store.listVerified().some(child => isCommand(child)
      && child.authority.operationId.endsWith(':middle') && child.status === 'committed') ? true : undefined, 'out-of-order third completion');
    release(parallel.commands[0].release);
    parallelReceipt = await parallelRun;
  } finally {
    for (const command of parallel.commands) release(command.release);
    await parallelRun.catch(() => {});
  }
  assert.equal(parallelReceipt.status, 'committed');
  assert.equal(parallelReceipt.metadata?.projectCheckPolicyVersion, 2);
  assert.equal(parallelReceipt.metadata?.maxParallelChecks, 2);
  const parallelProof = requirePassedProjectCheckSuite(parallel.inputs(), parallelReceipt.id);
  assert(parallelProof.verification.checks.every(check => canonicalJson(check.coveredChecks) === canonicalJson(namedClaims)));
  const luaEvidence = buildValidationEvidence({ id: modId, name: 'Fixture', files: parallel.exact.artifact.snapshot.files },
    namedClaims.map(code => ({ code, severity: 'info', filePath: parallel.commands[0].luaCovered, message: `Fixture gap ${code}` })));
  const luaCredit = applyProjectCheckCoverage(luaEvidence, parallelProof.verification);
  assert(luaCredit.coverage.complete && luaCredit.coverage.projectVerification?.status === 'project-verified');
  assert.equal(luaCredit.coverage.projectVerification.creditedFindingIds.length, namedClaims.length);
  assert.equal(luaCredit.coverage.projectVerification.forgeComplete, false);
  assert.equal(luaCredit.findings, luaEvidence.findings);
  const projected = JSON.parse(JSON.stringify(luaCredit));
  assert.deepEqual(projected.coverage.projectVerification.checks[0].coveredChecks, namedClaims);
  assert(Object.isFrozen(parallelProof.verification.checks[0].coveredChecks));
  const claimedManifestPath = path.join(parallel.exact.setupInput.sourceRoot, 'forge.checks.json');
  const claimedManifestBytes = fs.readFileSync(claimedManifestPath);
  const changedClaims = JSON.parse(claimedManifestBytes.toString('utf8'));
  changedClaims.checks[0].coversChecks = [];
  fs.writeFileSync(claimedManifestPath, JSON.stringify(changedClaims));
  try { assert.throws(() => requirePassedProjectCheckSuite(parallel.exact, parallelReceipt.id)); }
  finally { fs.writeFileSync(claimedManifestPath, claimedManifestBytes); }
  assert.deepEqual(requirePassedProjectCheckSuite(parallel.exact, parallelReceipt.id).verification, parallelProof.verification);
  assert.throws(() => requirePassedProjectCheckSuite({ ...parallel.exact, actorId: 'different-agent' }, parallelReceipt.id),
    { code: 'PROJECT_CHECK_SUITE_MISMATCH' });
  record('explicit coverage claims survive exact Lua artifact reads and reopened proof; altered approved claims refuse and raw findings remain');
  assert.deepEqual(parallelProof.commandReceipts.map(child => child.authority.operationId.split(':').at(-1)), ['omega', 'alpha', 'middle']);
  assert.equal(readProjectCheckSuiteReport(new ActionReceiptStore({ root: parallel.store.root }), parallelReceipt)?.state, 'passed');
  await assert.rejects(parallel.execute(), { code: 'PROJECT_CHECK_SUITE_EXISTS' });
  const firstBinding = parallelProof.commandReceipts[0];
  assert.equal(firstBinding.validation.validator, 'windows-python-job-v1');
  assert.notEqual(hashActionReceiptAuthority(parallelReceipt), hashActionReceiptAuthority({ ...parallelReceipt,
    metadata: { ...parallelReceipt.metadata, maxParallelChecks: 1 } }));
  const altered = new ActionReceiptStore({ root: path.join(root, 'wrong-budget-proof') });
  const wrongBudget = altered.prepare({ actor: parallelReceipt.actor, client: parallelReceipt.client,
    capability: parallelReceipt.capability, authority: parallelReceipt.authority, effects: parallelReceipt.effects,
    input: parallelReceipt.input, validation: parallelReceipt.validation, rollback: parallelReceipt.rollback,
    metadata: { ...parallelReceipt.metadata, maxParallelChecks: 1 } });
  for (const child of parallelProof.commandReceipts) fs.copyFileSync(parallel.store.pathFor(child.id), altered.pathFor(child.id));
  altered.commit(wrongBudget.id, { validation: parallelReceipt.validation, after: parallelReceipt.after });
  assert.throws(() => requirePassedProjectCheckSuite({ ...parallel.exact, store: altered }, wrongBudget.id),
    { code: 'PROJECT_CHECK_SUITE_MISMATCH' });
  parallel.retireInputs();
  record('approved budget2 overlaps two real Jobs, refills only a drained slot and reopens declaration-ordered exact proof after out-of-order completion');

  const simultaneous = fixture('parallel-fail', [['omega', 'wait-nonzero'], ['alpha', 'wait-nonzero'], ['unused', 'pass']], interpreter, 2, namedClaims);
  const parallelRuns = new ProjectCheckRunService(simultaneous.store, simultaneous.coordinator);
  const parallelAdmitted = await parallelRuns.start({ actorId, workspaceId, operationId: 'parallel-two-failures', modId,
    artifactHash: simultaneous.exact.artifact.snapshot.manifest.hash,
    requestHash: createHash('sha256').update('parallel-two-failures').digest('hex'), sourceKey: simultaneous.key },
  async (lease, runId) => {
    simultaneous.exact.runId = runId;
    const suite = await executeProjectCheckSuite({ ...simultaneous.exact, lease });
    return { suite, logicalArtifactHash: suite.input.beforeHash };
  });
  const failureRun = until(() => {
    const state = parallelRuns.status(actorId, workspaceId, parallelAdmitted.id);
    return state.suiteReport ? simultaneous.store.read(state.suiteReport.suite.id) : undefined;
  }, 'parallel named run report');
  void failureRun.catch(() => {});
  let failureSettled = false;
  void failureRun.then(() => { failureSettled = true; }, () => { failureSettled = true; });
  let blockedWriter: Promise<unknown> | undefined;
  let writerAfterFailures = false;
  let simultaneousReceipt: ActionReceipt;
  try {
    await until(() => simultaneous.commands.slice(0, 2).every(command => started(command.marker)) ? true : undefined, 'two in-flight failures');
    release(simultaneous.commands[0].release);
    await until(() => simultaneous.store.listVerified().some(child => isCommand(child) && child.status === 'failed') ? true : undefined, 'first observed suite failure');
    assert(!failureSettled && !fs.existsSync(simultaneous.commands[2].marker));
    blockedWriter = simultaneous.observer.run([simultaneous.key], { actor: 'fixture-writer', operation: 'failure-tail' },
      () => { writerAfterFailures = true; });
    void blockedWriter.catch(() => {});
    await until(() => simultaneous.ownership().waiting.length ? true : undefined, 'writer behind failed suite tail');
    assert(!writerAfterFailures);
    release(simultaneous.commands[1].release);
    simultaneousReceipt = await failureRun;
    await blockedWriter;
  } finally {
    for (const command of simultaneous.commands) release(command.release);
    await failureRun.catch(() => {});
    await blockedWriter?.catch(() => {});
  }
  const multipleReport = readProjectCheckSuiteReport(new ActionReceiptStore({ root: simultaneous.store.root }), simultaneousReceipt);
  assert.equal(multipleReport?.state, 'failed');
  assert.equal(multipleReport.notRunCount, 1);
  assert.deepEqual(multipleReport.checks.map(child => [child.id, child.state]), [['alpha', 'failed'], ['omega', 'failed']]);
  assert(writerAfterFailures && !fs.existsSync(simultaneous.commands[2].marker));
  const recreatedRuns = new ProjectCheckRunService(new ActionReceiptStore({ root: simultaneous.store.root }), simultaneous.coordinator);
  assert.deepEqual(recreatedRuns.status(actorId, workspaceId, parallelAdmitted.id).suiteReport, multipleReport);
  assert.throws(() => requirePassedProjectCheckSuite(simultaneous.exact, simultaneousReceipt.id));
  // Reissue only policy authority in tiny private stores; real child bytes remain exact.
  for (const [name, metadata, summaryVersion] of [
    ['legacy-multiple', { ...simultaneousReceipt.metadata, projectCheckPolicyVersion: undefined, maxParallelChecks: undefined }, 1],
    ['missing-budget', { ...simultaneousReceipt.metadata, maxParallelChecks: undefined }, 2],
    ['unknown-policy', { ...simultaneousReceipt.metadata, projectCheckPolicyVersion: 3 }, 2],
    ['out-of-range', { ...simultaneousReceipt.metadata, maxParallelChecks: 5 }, 2],
  ] as const) {
    const copy = new ActionReceiptStore({ root: path.join(root, name) });
    const cleanMetadata = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
    const prepared = copy.prepare({ actor: simultaneousReceipt.actor, client: simultaneousReceipt.client,
      capability: simultaneousReceipt.capability, authority: simultaneousReceipt.authority, effects: simultaneousReceipt.effects,
      input: simultaneousReceipt.input, validation: simultaneousReceipt.validation, rollback: simultaneousReceipt.rollback, metadata: cleanMetadata });
    for (const child of simultaneous.store.listVerified().filter(isCommand)) fs.copyFileSync(simultaneous.store.pathFor(child.id), copy.pathFor(child.id));
    const refused = copy.fail(prepared.id, { validation: { ...simultaneousReceipt.validation,
      summary: canonicalJson({ ...JSON.parse(simultaneousReceipt.validation.summary!), version: summaryVersion }) },
      failure: simultaneousReceipt.failure });
    assert.throws(() => readProjectCheckSuiteReport(copy, refused), { code: 'PROJECT_CHECK_SUITE_MISMATCH' });
  }
  simultaneous.retireInputs();
  record('first failure stops admission and retains the source until its failing sibling drains; both named failures reopen and legacy/invalid policy refuses');

  const mixed = fixture('parallel-mixed', [['omega', 'wait-nonzero'], ['alpha', 'wait'], ['unused', 'pass']], interpreter, 2);
  let drains = 0;
  const mixedRun = mixed.execute(mixed.exact, lease => ({ ...lease,
    assertProjectCheckDrained(frame) {
      lease.assertProjectCheckDrained(frame);
      if (++drains === 2) throw new Error('Fixture loses acknowledgement after actual drain and helper exit.');
    },
  }));
  void mixedRun.catch(() => {});
  let mixedReceipt: ActionReceipt;
  try {
    await until(() => mixed.commands.slice(0, 2).every(command => started(command.marker)) ? true : undefined, 'mixed-result overlap');
    release(mixed.commands[0].release);
    await until(() => mixed.store.listVerified().some(child => isCommand(child) && child.status === 'failed') ? true : undefined, 'mixed confirmed failure');
    release(mixed.commands[1].release);
    mixedReceipt = await mixedRun;
  } finally {
    for (const command of mixed.commands) release(command.release);
    await mixedRun.catch(() => {});
  }
  const mixedReport = readProjectCheckSuiteReport(new ActionReceiptStore({ root: mixed.store.root }), mixedReceipt);
  assert.equal(mixedReport?.state, 'incomplete');
  assert.equal(mixedReport.notRunCount, 1);
  assert.deepEqual(mixedReport.checks.map(child => [child.id, child.state]), [['alpha', 'incomplete'], ['omega', 'failed']]);
  assert(!fs.existsSync(mixed.commands[2].marker));
  assert.throws(() => requirePassedProjectCheckSuite(mixed.exact, mixedReceipt.id));
  mixed.retireInputs();
  record('an unconfirmed acknowledgement dominates a concurrent confirmed failure, preserves both named results and never credits coverage');

  const storage = fixture('parallel-storage', [['omega', 'wait'], ['alpha', 'wait'], ['unused', 'pass']], interpreter, 2);
  class LoseCommandCommit extends ActionReceiptStore {
    override commit(...args: Parameters<ActionReceiptStore['commit']>) {
      const current = this.read(args[0]);
      if (isCommand(current) && current.authority.operationId.endsWith(':omega')) throw new Error('Fixture command receipt write failed.');
      return super.commit(...args);
    }
  }
  let storageAcknowledged = false;
  const storageRun = storage.execute({ ...storage.exact, store: new LoseCommandCommit({ root: storage.store.root }) },
    lease => ({ ...lease, assertProjectCheckDrained(frame) { lease.assertProjectCheckDrained(frame); storageAcknowledged = true; } }));
  void storageRun.catch(() => {});
  let storageSettled = false;
  void storageRun.then(() => { storageSettled = true; }, () => { storageSettled = true; });
  try {
    await until(() => storage.commands.slice(0, 2).every(command => started(command.marker)) ? true : undefined, 'storage-fault siblings');
    release(storage.commands[0].release);
    // A durable confirmed guard proves the first helper is done, even though its receipt write failed.
    await until(() => storageAcknowledged ? true : undefined, 'first storage-fault helper acknowledgement');
    assert(!storageSettled && !fs.existsSync(storage.commands[2].marker));
    release(storage.commands[1].release);
    await assert.rejects(storageRun, /Fixture command receipt write failed/);
  } finally {
    for (const command of storage.commands) release(command.release);
    await storageRun.catch(() => {});
  }
  assert(!fs.existsSync(storage.commands[2].marker));
  assert.equal(storage.ownership().active.length, 0);
  assert(!storage.store.listVerified().some(child => !isCommand(child) && child.status === 'committed'
    && 'id' in child.capability && child.capability.id === 'project-check.suite'));
  storage.retireInputs();
  record('a command receipt storage error drains every started sibling before propagating, stops new admission and never commits the suite');

  const timeout = fixture('parallel-timeout', [['omega', 'wait-nonzero'], ['alpha', 'wait', 2], ['unused', 'pass']], interpreter, 2);
  const timeoutRun = timeout.execute();
  void timeoutRun.catch(() => {});
  let timeoutReceipt: ActionReceipt;
  try {
    await until(() => timeout.commands.slice(0, 2).every(command => started(command.marker)) ? true : undefined, 'timeout sibling overlap');
    release(timeout.commands[0].release);
    timeoutReceipt = await timeoutRun; // The other owned Job must reach its real timeout, not an observation deadline.
  } finally {
    for (const command of timeout.commands) release(command.release);
    await timeoutRun.catch(() => {});
  }
  const timeoutReport = readProjectCheckSuiteReport(timeout.store, timeoutReceipt);
  assert.equal(timeoutReport?.state, 'failed');
  assert.equal(timeoutReport.checks.find(child => child.id === 'alpha')?.code, 'PROJECT_CHECK_TIMED_OUT');
  assert.equal(timeout.ownership().active.length, 0);
  assert(!fs.existsSync(timeout.commands[2].marker));
  timeout.retireInputs();
  record('a real timeout tail drains its Job after a sibling failure without admitting the queued third check');

  const revokedParallel = fixture('parallel-revoke', [['omega', 'wait'], ['alpha', 'wait'], ['unused', 'pass']], interpreter, 2);
  let revokedAfterCommit = false;
  class RevokeParallelCommand extends ActionReceiptStore {
    override commit(...args: Parameters<ActionReceiptStore['commit']>) {
      const committed = super.commit(...args);
      if (isCommand(committed) && committed.authority.operationId.endsWith(':omega')) {
        revokedParallel.approvals.revoke(revokedParallel.approval.id, 'fixture-revoke');
        revokedAfterCommit = true;
      }
      return committed;
    }
  }
  const revokedRun = revokedParallel.execute({ ...revokedParallel.exact,
    store: new RevokeParallelCommand({ root: revokedParallel.store.root }) });
  void revokedRun.catch(() => {});
  let revokedReceipt: ActionReceipt;
  try {
    await until(() => revokedParallel.commands.slice(0, 2).every(command => started(command.marker)) ? true : undefined, 'revocation overlap');
    release(revokedParallel.commands[0].release);
    await until(() => revokedAfterCommit ? true : undefined, 'parallel owner revocation');
    assert(!fs.existsSync(revokedParallel.commands[2].marker));
    release(revokedParallel.commands[1].release);
    revokedReceipt = await revokedRun;
  } finally {
    for (const command of revokedParallel.commands) release(command.release);
    await revokedRun.catch(() => {});
  }
  const revokedReport = readProjectCheckSuiteReport(revokedParallel.store, revokedReceipt);
  assert.equal(revokedReport?.state, 'failed');
  assert.equal(revokedReport.notRunCount, 1);
  assert.equal(revokedReport.checks.find(child => child.id === 'alpha')?.code, 'PROJECT_CHECK_BINDING_CHANGED');
  assert(!fs.existsSync(revokedParallel.commands[2].marker));
  assert.throws(() => requirePassedProjectCheckSuite(revokedParallel.exact, revokedReceipt.id));
  revokedParallel.retireInputs();
  record('owner revocation refuses the queued admission and credits no proof while the already-running sibling drains');

  meterFixture();
  console.log(JSON.stringify({ status: 'passed', realWindowsProcesses: true, fixtureOwnerApproval: true, checks,
    observedPeakFootprint: peakFootprint, footprintLimit }));
} finally {
  try {
    const keepScratch = retained.some(unresolved => unresolved());
    if (keepScratch) {
      console.error(`Unresolved fixture ownership. Preserved isolated scratch at ${root}.`);
    } else {
      for (const dispose of cleanup.reverse()) dispose();
      assert.equal(path.dirname(fs.realpathSync.native(root)), scratchParent);
      const current = fs.lstatSync(root, { bigint: true });
      assert(current.dev === rootStamp.dev && current.ino === rootStamp.ino);
      fs.rmSync(root, { recursive: true, force: true });
    }
  } finally {
    if (originalTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = originalTemp;
    if (originalTmp === undefined) delete process.env.TMP;
    else process.env.TMP = originalTmp;
  }
}
