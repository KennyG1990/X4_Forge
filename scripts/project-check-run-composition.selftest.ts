import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { buildArtifactPlan } from '../src/lib/artifactPipeline';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { ProjectCheckApprovalLedger } from '../src/server/projectCheckApproval';
import { bindProjectCheckCommand } from '../src/server/projectCheckCommand';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';

const fixtureDriver = String.raw`
import importlib.util, json, pathlib, shutil, sys, zipfile

if sys.argv[1] == "stage":
    assert sys.version_info[:2] == (3, 12), sys.version
    source = pathlib.Path(sys.executable).parent
    runtime = pathlib.Path(sys.argv[2])
    files = ["python.exe", "python312.dll", "python3.dll", "vcruntime140.dll", "vcruntime140_1.dll"]
    for name in files:
        if (source / name).is_file():
            shutil.copyfile(source / name, runtime / name)
    encodings = sorted((source / "Lib" / "encodings").glob("*.py"))
    assert encodings
    with zipfile.ZipFile(runtime / "python312.zip", "w", compression=zipfile.ZIP_STORED) as archive:
        for file in encodings:
            archive.write(file, f"encodings/{file.name}")
    (runtime / "python312._pth").write_text("python312.zip\n", encoding="ascii")
    print(json.dumps(sorted(file.name for file in runtime.iterdir() if file.name != "python.exe")))
else:
    spec = importlib.util.spec_from_file_location("forge_project_job_fixture", sys.argv[2])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    command = json.load(sys.stdin)
    result = module.run_command(command["executable"], command["args"], cwd=command["cwd"],
        environment=command["environment"], job_name=command["jobName"],
        timeout_seconds=command["timeoutSeconds"], retained_bytes=command["retainedOutputBytes"],
        max_output_bytes=command["maxOutputBytes"])
    print(json.dumps({"status": result.status, "exitCode": result.exit_code, "outputBytes": result.output_bytes,
        "output": result.output_tail.decode("utf8"), "treeEmpty": result.tree_empty, "durationSeconds": result.duration_seconds}))
`;

const bootstrap = process.env.FORGE_QA_PYTHON;
const temp = process.env.FORGE_QA_TMP;
const systemRoot = process.env.SystemRoot;
assert(process.platform === 'win32' && bootstrap && temp && systemRoot, 'An explicit private Windows fixture is required.');
const parent = fs.realpathSync.native(temp);
const root = fs.mkdtempSync(path.join(parent, 'x4-check-composition-'));
const runFixture = (action: string, argument: string, input?: unknown): unknown => {
  const child = spawnSync(bootstrap, ['-I', '-S', '-B', '-c', fixtureDriver, action, argument], {
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: 'utf8', env: { SystemRoot: systemRoot }, cwd: root, windowsHide: true, timeout: 15_000, maxBuffer: 128 * 1024,
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout);
};

const sourceRoot = path.join(root, 'source');
const runtime = path.join(root, 'runtime');
const scratch = path.join(root, 'scratch');
const helper = path.join(sourceRoot, 'checks', 'helper.py');
const helperText = 'MARKER = "approved-helper"\n';
const artifactText = '<mdscript name="ExactArtifact"/>\n';
const modId = 'project_check_composition';
const declaration = JSON.stringify({ version: 1, checks: [{
  id: 'smoke', script: 'checks/run.py', dependencies: ['checks/helper.py'], covers: ['md/probe.xml'],
  args: ['literal spaces and "quotes"'], timeoutSeconds: 5,
}] });
const artifactPlan = (includeCovered: boolean, checks = declaration, contentId = modId) => {
  const plan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: {
    'content.xml': `<content id="${contentId}" name="Fixture" version="100"/>`,
    'forge.checks.json': checks,
    ...(includeCovered ? { 'md/probe.xml': artifactText } : {}),
  } });
  assert(plan.ok, plan.errors.join('\n'));
  return captureDeploymentSnapshot(plan, 'loose');
};

try {
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.mkdirSync(runtime);
  fs.mkdirSync(scratch);
  const dependencies = runFixture('stage', runtime) as string[];
  assert(dependencies.includes('python312.dll') && dependencies.includes('python312.zip'));
  fs.writeFileSync(helper, helperText, 'utf8');
  fs.writeFileSync(path.join(sourceRoot, 'checks', 'run.py'), String.raw`
import os, sys
assert sys.argv[1:] == ['literal spaces and "quotes"'], sys.argv
assert sys.path == [os.path.join(os.path.dirname(sys.executable), 'python312.zip')], sys.path
assert 'PYTHONPATH' not in os.environ and 'PATH' not in os.environ, sorted(os.environ)
namespace = {}
with open('checks/helper.py', encoding='utf8') as helper:
    exec(helper.read(), namespace)
covered = os.path.join(os.environ['FORGE_ARTIFACT_ROOT'], 'md', 'probe.xml')
with open(covered, encoding='utf8') as artifact:
    assert artifact.read() == '<mdscript name="ExactArtifact"/>\n'
print(namespace['MARKER'] + ':exact-artifact')
`, 'utf8');
  fs.writeFileSync(path.join(sourceRoot, 'forge.checks.json'), declaration, 'utf8');
  const setupInput = { modId, sourceRoot, interpreterPath: path.join(runtime, 'python.exe'), interpreterDependencies: dependencies };
  const reviewed = captureProjectCheckSetup(setupInput);
  const store = new ActionReceiptStore({ root: path.join(root, 'receipts') });
  const ledger = new ProjectCheckApprovalLedger(store, 'fixture-owner', (owner, decision, proof) =>
    owner === 'fixture-owner' && (decision.action === 'approve'
      ? proof === 'fixture-approval' && decision.reviewId === 'fixture-composition-001' && decision.setupHash === reviewed.setupHash
      : proof === 'fixture-revocation'));
  const approval = ledger.approve(setupInput, reviewed.setupHash, 'fixture-composition-001', 'fixture-approval');
  const frozen = freezeProjectCheckSetup(setupInput, reviewed.setupHash, scratch);
  try {
    const snapshot = artifactPlan(true);
    try {
      const subject = { modId, snapshot };
      const input = { setupInput, frozen, artifact: subject, approvals: ledger, approvalId: approval.id,
        checkId: 'smoke', runId: randomBytes(16).toString('hex'), systemRoot };
      assert.throws(() => Object.assign(frozen, { interpreterPath: bootstrap }), TypeError);
      assert.throws(() => frozen.setup.checks[0].args.push('extra argument'), TypeError);
      assert.throws(() => Object.assign(snapshot, { payloadRoot: root }), TypeError);
      assert.throws(() => Object.assign(snapshot.manifest.files[0], { sha256: '0'.repeat(64) }), TypeError);
      assert.throws(() => Object.assign(snapshot.plan.entries[0], { sha256: '0'.repeat(64) }), TypeError);
      assert.throws(() => snapshot.plan.rules.runtimeOwned.push('md/probe.xml'), TypeError);
      const { binding, bindingHash, assertReady } = bindProjectCheckCommand(input);
      assert.match(bindingHash, /^[a-f0-9]{64}$/);
      assert.equal(binding.approvalHash, approval.hash);
      assert.equal(binding.artifactHash, snapshot.manifest.hash);
      assert.deepEqual(binding.coveredFiles, [{ path: 'md/probe.xml', size: Buffer.byteLength(artifactText),
        sha256: createHash('sha256').update(artifactText).digest('hex') }]);
      assert.throws(() => bindProjectCheckCommand({ ...input, artifact: { ...subject, modId: 'another_mod' } }), /does not match/);
      const changedDeclaration = artifactPlan(true, declaration + '\n');
      try {
        assert.throws(() => bindProjectCheckCommand({ ...input, artifact: { modId, snapshot: changedDeclaration } }), /declaration does not match/);
      } finally { changedDeclaration.dispose(); }
      const changedSubject = artifactPlan(true, declaration, 'another_mod');
      try {
        assert.throws(() => bindProjectCheckCommand({ ...input, artifact: { modId, snapshot: changedSubject } }), /names a different project/);
      } finally { changedSubject.dispose(); }
      assert.throws(() => bindProjectCheckCommand({ ...input, checkId: 'unknown' }), /does not appear/);
      const missing = artifactPlan(false);
      try {
        assert.throws(() => bindProjectCheckCommand({ ...input, artifact: { modId, snapshot: missing } }), /covered file is absent/);
      } finally { missing.dispose(); }

      fs.writeFileSync(helper, 'MARKER = "changed-source"\n', 'utf8');
      assert.throws(assertReady, /setup changed/);
      fs.writeFileSync(helper, helperText, 'utf8');
      assertReady();
      const result = runFixture('run', path.resolve('src/server/projectCheckWindowsJob.py'), binding.command) as {
        status: string; exitCode: number; outputBytes: number; output: string; treeEmpty: boolean; durationSeconds: number;
      };
      assert.equal(result.status, 'passed', JSON.stringify(result));
      assert.equal(result.exitCode, 0);
      assert.equal(result.output.trim(), 'approved-helper:exact-artifact');
      assert.equal(result.treeEmpty, true);
      assert(result.durationSeconds > 0 && result.durationSeconds <= binding.command.timeoutSeconds);
      assertReady();

      const artifactFile = path.join(snapshot.payloadRoot, 'md', 'probe.xml');
      fs.writeFileSync(artifactFile, '<mdscript name="Changed"/>', 'utf8');
      assert.throws(assertReady, { code: 'DEPLOY_SNAPSHOT_CHANGED' });
      fs.writeFileSync(artifactFile, artifactText, 'utf8');
      const displacedPayload = snapshot.payloadRoot + '.owned';
      fs.renameSync(snapshot.payloadRoot, displacedPayload);
      try {
        fs.symlinkSync(displacedPayload, snapshot.payloadRoot, 'junction');
        assert.throws(assertReady, { code: 'DEPLOY_SNAPSHOT_CHANGED' });
      } finally {
        const alias = fs.lstatSync(snapshot.payloadRoot, { throwIfNoEntry: false });
        if (alias) {
          assert(alias.isSymbolicLink());
          fs.rmdirSync(snapshot.payloadRoot);
        }
        fs.renameSync(displacedPayload, snapshot.payloadRoot);
      }
      const frozenHelper = path.join(frozen.projectRoot, 'checks', 'helper.py');
      fs.writeFileSync(frozenHelper, 'MARKER = "changed-frozen"\n', 'utf8');
      assert.throws(assertReady);
      fs.writeFileSync(frozenHelper, helperText, 'utf8');
      assertReady();
      ledger.revoke(approval.id, 'fixture-revocation');
      assert.throws(assertReady, /revoked/);
      console.log(JSON.stringify({ status: 'passed', fixtureApproval: true, exactRuntime: true, exactArtifact: true,
        treeEmpty: result.treeEmpty, outputBytes: result.outputBytes, durationSeconds: result.durationSeconds,
        wrongSubjectRefused: true, missingCoverageRefused: true, setupDriftRefused: true, snapshotTamperRefused: true,
        metadataMutationRefused: true, payloadJunctionRefused: true, revocationRefused: true }));
    } finally { snapshot.dispose(); }
  } finally { frozen.dispose(); }
} finally {
  assert.equal(path.dirname(root), parent);
  fs.rmSync(root, { recursive: true, force: true });
}
