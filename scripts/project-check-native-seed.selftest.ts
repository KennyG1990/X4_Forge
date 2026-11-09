import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { artifactPlanIdentity, buildArtifactPlan } from '../src/lib/artifactPipeline';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { ProjectCheckApprovalLedger, projectCheckApprovalCoordinationKey } from '../src/server/projectCheckApproval';
import { isProjectCheckRelativeFile } from '../src/server/projectCheckProposal';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';
import { executeProjectCheckSuite, requirePassedProjectCheckSuite } from '../src/server/projectCheckSuite';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator } from '../src/server/sharedSourceCoordinator';

const authorityFilename = 'project-check-deploy-authority.json';
const ownerId = 'fixture-native-project-check-owner';
const approveProof = 'fixture-native-approve';
const revokeProof = 'fixture-native-revoke';
const reviewId = 'fixture-native-project-check-review';
const sha256 = /^[a-f0-9]{64}$/;
const receiptId = /^ar_[a-f0-9]{64}$/;
const MAX_INPUT_BYTES = 512 * 1024;
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const digestFile = (file: string) => digest(fs.readFileSync(file));
const samePath = (left: string, right: string) => path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase();
const seedDirectories = new Set(['data', 'coordination', 'temp', 'runtime', 'bootstrap']);

function localPath(value: unknown): string {
  assert(typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value) && !/[:\u0000-\u001f\u007f]/.test(value.slice(2)),
    'Expected an explicit absolute local Windows path.');
  return path.resolve(value);
}

function physicalDirectory(value: unknown): string {
  const directory = localPath(value);
  const stat = fs.lstatSync(directory);
  const physical = fs.realpathSync.native(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && samePath(physical, directory), 'Expected a physical fixture directory.');
  return physical;
}

function physicalFile(value: unknown, cap: number): string {
  const filename = localPath(value);
  const stat = fs.lstatSync(filename);
  const physical = fs.realpathSync.native(filename);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0 && stat.size <= cap
    && samePath(physical, filename), 'Expected a bounded physical fixture file.');
  return physical;
}

function ownedPath(root: string, value: unknown): string {
  const target = localPath(value);
  const relative = path.relative(root, target);
  assert(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
    'The requested path must be inside the private fixture root.');
  let ancestor = path.dirname(target);
  while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) ancestor = path.dirname(ancestor);
  physicalDirectory(ancestor);
  return target;
}

function ownedDirectory(root: string, ...segments: string[]): string {
  const requested = ownedPath(root, path.join(root, ...segments));
  if (!fs.lstatSync(requested, { throwIfNoEntry: false })) fs.mkdirSync(requested);
  return physicalDirectory(requested);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), `Expected a ${label} object.`);
  return value as Record<string, unknown>;
}

function readObject(file: string, label: string) {
  return asObject(JSON.parse(fs.readFileSync(physicalFile(file, MAX_INPUT_BYTES), 'utf8')), label);
}

function parseOptions() {
  const argv = process.argv.slice(2);
  const optionalModes = new Set(['--revoke', '--hold-revoke', '--authority-only']);
  const modes = argv.filter(value => optionalModes.has(value));
  assert(modes.length <= 1, 'Specify at most one seed mode.');
  const args = argv.filter(value => !optionalModes.has(value));
  assert(args.length === 1 || (args.length === 2 && args[0] === '--root'), 'Supply an explicit private fixture root.');
  const root = physicalDirectory(args.at(-1));
  assert(!samePath(root, path.parse(root).root), 'A drive root cannot be a fixture.');
  return { root, mode: modes[0] };
}

function readSeedInput(root: string) {
  const input = readObject(ownedPath(root, path.join(root, 'seed-input.json')), 'native seed input');
  const allowed = ['workspaceId', 'actorId', 'modId', 'sourceRoot', 'pythonPath', 'targetRoot', 'validatedArtifact', 'compiledFiles'];
  assert(Object.keys(input).every(key => allowed.includes(key)), 'Unexpected native seed input field.');
  const { workspaceId, actorId, modId } = input;
  assert(typeof workspaceId === 'string' && /^ws_[a-f0-9]{24}$/.test(workspaceId));
  assert(typeof actorId === 'string' && /^[a-zA-Z0-9_.:@-]{1,128}$/.test(actorId));
  assert(typeof modId === 'string' && /^[a-z0-9_][a-z0-9_-]{0,127}$/.test(modId));
  const sourceRoot = physicalDirectory(ownedPath(root, input.sourceRoot));
  assert.equal(path.basename(sourceRoot).toLowerCase(), modId, 'The fixture folder and expected mod ID must match.');
  assert(!seedDirectories.has(path.relative(root, sourceRoot).split(path.sep)[0].toLowerCase()),
    'The project source must be separate from seed-owned state.');
  if (input.targetRoot !== undefined) {
    const target = ownedPath(root, input.targetRoot);
    if (fs.lstatSync(target, { throwIfNoEntry: false })) physicalDirectory(target);
    assert(!seedDirectories.has(path.relative(root, target).split(path.sep)[0].toLowerCase()),
      'The deployment target must be separate from seed-owned state.');
    const sourceKey = sourceRoot.toLowerCase() + path.sep;
    const targetKey = target.toLowerCase() + path.sep;
    assert(!sourceKey.startsWith(targetKey) && !targetKey.startsWith(sourceKey),
      'The project source and deployment target must be separate.');
  }
  const pythonPath = physicalFile(input.pythonPath, 64 * 1024 * 1024);
  assert.equal(path.extname(pythonPath).toLowerCase(), '.exe');
  return { workspaceId, actorId, modId, sourceRoot, pythonPath,
    validatedArtifact: input.validatedArtifact, compiledFiles: input.compiledFiles };
}

const stagePython = String.raw`
import json, pathlib, shutil, sys, zipfile
assert sys.version_info[:2] == (3, 12), sys.version
source = pathlib.Path(sys.executable).parent
destination = pathlib.Path(sys.argv[1])
for name in ["python.exe", "python312.dll", "python3.dll", "vcruntime140.dll", "vcruntime140_1.dll"]:
    if (source / name).is_file():
        shutil.copyfile(source / name, destination / name)
encodings = sorted((source / "Lib" / "encodings").glob("*.py"))
assert encodings
with zipfile.ZipFile(destination / "python312.zip", "w", compression=zipfile.ZIP_STORED) as archive:
    for file in encodings:
        archive.write(file, f"encodings/{file.name}")
(destination / "python312._pth").write_text("python312.zip\n", encoding="ascii")
print(json.dumps(sorted(file.name for file in destination.iterdir() if file.name != "python.exe")))
`;

function createPinnedRuntime(root: string, pythonPath: string, systemRoot: string) {
  const interpreter = ownedDirectory(root, 'runtime');
  assert.equal(fs.readdirSync(interpreter).length, 0, 'The seed runtime directory must be empty.');
  const child = spawnSync(pythonPath, ['-I', '-S', '-B', '-c', stagePython, interpreter], {
    cwd: root, env: { SystemRoot: systemRoot }, windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024,
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const interpreterDependencies = JSON.parse(child.stdout) as string[];
  assert(interpreterDependencies.includes('python312.dll') && interpreterDependencies.includes('python312.zip'));
  const bootstrap = ownedDirectory(root, 'bootstrap');
  for (const name of ['projectCheckLeaseWorker.py', 'projectCheckWindowsJob.py']) {
    const source = fileURLToPath(new URL(`../src/server/${name}`, import.meta.url));
    fs.copyFileSync(source, path.join(bootstrap, name), fs.constants.COPYFILE_EXCL);
  }
  const workerPath = path.join(bootstrap, 'projectCheckLeaseWorker.py');
  const runtime = { pythonPath, pythonSha256: digestFile(pythonPath), workerPath, workerSha256: digestFile(workerPath),
    launcherSha256: digestFile(path.join(bootstrap, 'projectCheckWindowsJob.py')), systemRoot };
  return { interpreterPath: path.join(interpreter, 'python.exe'), interpreterDependencies, runtime };
}

function exactArtifactPlan(input: ReturnType<typeof readSeedInput>) {
  let plan = buildArtifactPlan({ sourceRoot: input.sourceRoot });
  assert(plan.ok, plan.errors.join('\n'));
  if (input.validatedArtifact === undefined) {
    // Fresh native import preserves original README, content and unchanged MD
    // bytes. The driver supplies all three, so no generated README is needed.
    assert(plan.entries.some(entry => entry.path === 'README.md'), 'Include uppercase README.md or the native manifest.');
    return plan;
  }

  const expected = asObject(input.validatedArtifact, 'native artifact manifest');
  assert(expected.version === 1 && expected.scope === 'logical-artifact-bytes' && expected.format === 'loose'
    && typeof expected.hash === 'string' && sha256.test(expected.hash) && Array.isArray(expected.files)
    && expected.files.length > 0 && expected.files.length <= 128, 'Unexpected native artifact manifest.');
  const entries = expected.files.map(item => {
    const { path: relative, size, sha256: hash } = asObject(item, 'native artifact file');
    assert(isProjectCheckRelativeFile(relative) && typeof size === 'number' && Number.isSafeInteger(size) && size >= 0
      && typeof hash === 'string' && sha256.test(hash), 'Unexpected native artifact file.');
    return { relative, size, hash };
  });
  assert.equal(new Set(entries.map(entry => entry.relative.toLowerCase())).size, entries.length);
  if (artifactPlanIdentity(plan, 'loose') !== expected.hash) {
    const compiled = asObject(input.compiledFiles, 'compiled artifact files');
    const generatedFiles = Object.create(null) as Record<string, string>;
    const disk = new Map(plan.entries.map(entry => [entry.path, entry]));
    for (const entry of entries) {
      const fromDisk = disk.get(entry.relative);
      if (fromDisk?.sha256 === entry.hash && fromDisk.size === entry.size) continue;
      const fromCompiler = compiled[entry.relative];
      assert(typeof fromCompiler === 'string' && Buffer.byteLength(fromCompiler) === entry.size && digest(fromCompiler) === entry.hash,
        `No compiled bytes match the native artifact for ${entry.relative}.`);
      generatedFiles[entry.relative] = fromCompiler;
    }
    plan = buildArtifactPlan({ sourceRoot: input.sourceRoot, generatedFiles });
    assert(plan.ok, plan.errors.join('\n'));
  }
  assert.equal(artifactPlanIdentity(plan, 'loose'), expected.hash, 'Seed bytes differ from native frozen preflight.');
  const actualEntries = plan.entries.map(entry => [entry.path, entry.size, entry.sha256]).sort();
  assert.deepEqual(actualEntries, entries.map(entry => [entry.relative, entry.size, entry.hash]).sort());
  return plan;
}

async function holdAndRevoke(root: string, ledger: ProjectCheckApprovalLedger, store: ActionReceiptStore,
  coordinator: SharedSourceCoordinator, approvalId: string) {
  const held = ownedPath(root, path.join(root, 'approval-held'));
  const release = ownedPath(root, path.join(root, 'approval-release'));
  assert(!fs.lstatSync(held, { throwIfNoEntry: false }) && !fs.lstatSync(release, { throwIfNoEntry: false }),
    'Approval handoff markers must be absent before holding.');
  return coordinator.run([projectCheckApprovalCoordinationKey(store)], { actor: ownerId, operation: 'fixture-hold-revoke' },
    async () => {
      fs.writeFileSync(held, 'held\n', { encoding: 'ascii', flag: 'wx' });
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        if ((fs.lstatSync(release, { throwIfNoEntry: false })?.size ?? 0) > 0) {
          assert.equal(fs.readFileSync(physicalFile(release, 32), 'ascii').trim(), 'release');
          return ledger.revoke(approvalId, revokeProof);
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('The approval hold timed out before release.');
    });
}

async function main() {
  assert.equal(process.platform, 'win32');
  const { root, mode } = parseOptions();
  const input = readSeedInput(root);
  const data = ownedDirectory(root, 'data');
  const coordination = ownedDirectory(root, 'coordination');
  const receipts = ownedDirectory(root, 'data', 'action-receipts');
  const temp = ownedDirectory(root, 'temp');
  if (process.env.X4_DATA_DIR) assert(samePath(physicalDirectory(process.env.X4_DATA_DIR), data));
  if (process.env.X4_SOURCE_COORDINATION_DIR) assert(samePath(physicalDirectory(process.env.X4_SOURCE_COORDINATION_DIR), coordination));
  const authorityPath = path.join(data, authorityFilename);
  const store = new ActionReceiptStore({ root: receipts });
  const coordinator = new SharedSourceCoordinator({ directory: coordination, waitMs: 8_000, pollMs: 10 });
  const originalTemp = process.env.TEMP;
  const originalTmp = process.env.TMP;
  process.env.TEMP = temp;
  process.env.TMP = temp;

  try {
    if (mode === '--revoke' || mode === '--hold-revoke') {
      const authority = readObject(authorityPath, 'fixture deployment authority');
      assert(authority.version === 1 && authority.ownerId === ownerId && authority.workspaceId === input.workspaceId
        && authority.actorId === input.actorId && authority.modId === input.modId && authority.sourceRoot === input.sourceRoot
        && typeof authority.approvalId === 'string' && receiptId.test(authority.approvalId));
      const approvalId = authority.approvalId;
      const currentApproval = store.read(approvalId);
      const ledger = new ProjectCheckApprovalLedger(store, ownerId, (owner, decision, proof) =>
        owner === ownerId && proof === revokeProof && decision.action === 'revoke'
        && decision.approvalId === approvalId && decision.approvalHash === currentApproval.hash);
      const receipt = mode === '--hold-revoke'
        ? await holdAndRevoke(root, ledger, store, coordinator, approvalId)
        : await ledger.revokeCoordinated(approvalId, revokeProof, coordinator);
      assert.equal(receipt.status, 'committed');
      assert.deepEqual(store.read(receipt.id), receipt);
      console.log(JSON.stringify({ id: receipt.id, hash: receipt.hash, approvalId, code: receipt.validation.code }));
      return;
    }

    assert(!fs.lstatSync(authorityPath, { throwIfNoEntry: false }), 'The fixture authority already exists.');
    const systemRoot = physicalDirectory(process.env.SystemRoot);
    const { runtime, interpreterPath, interpreterDependencies } = createPinnedRuntime(root, input.pythonPath, systemRoot);
    const setupInput = { modId: input.modId, sourceRoot: input.sourceRoot, interpreterPath, interpreterDependencies };
    const reviewed = captureProjectCheckSetup(setupInput);
    const ledger = new ProjectCheckApprovalLedger(store, ownerId, (owner, decision, proof) =>
      owner === ownerId && proof === approveProof && decision.action === 'approve'
      && decision.reviewId === reviewId && decision.setupHash === reviewed.setupHash);
    const approval = ledger.approve(setupInput, reviewed.setupHash, reviewId, approveProof);
    const authority = { version: 1, workspaceId: input.workspaceId, actorId: input.actorId, modId: input.modId,
      sourceRoot: input.sourceRoot, ownerId, approvalId: approval.id, interpreterPath, interpreterDependencies, runtime };
    if (mode === '--authority-only') {
      const artifactHash = artifactPlanIdentity(exactArtifactPlan(input), 'loose');
      fs.writeFileSync(authorityPath, JSON.stringify(authority) + '\n', { encoding: 'utf8', flag: 'wx' });
      console.log(JSON.stringify({ approvalId: approval.id, approvalHash: approval.hash, artifactHash }));
      return;
    }
    const sourceKey = canonicalSourceKey(input.sourceRoot);
    const frozen = freezeProjectCheckSetup(setupInput, reviewed.setupHash, temp);
    let snapshot: ReturnType<typeof captureDeploymentSnapshot> | undefined;
    try {
      snapshot = captureDeploymentSnapshot(exactArtifactPlan(input), 'loose');
      const artifact = { modId: input.modId, snapshot };
      const runSuite = async () => {
        const runId = randomBytes(16).toString('hex');
        const args = { setupInput, frozen, artifact, approvals: ledger,
          approvalId: approval.id, runId, systemRoot, runtime, store, workspaceId: input.workspaceId, actorId: input.actorId };
        const receipt = await coordinator.run([sourceKey], { actor: input.actorId, workspaceId: input.workspaceId, operation: 'fixture-native-suite' },
          lease => executeProjectCheckSuite({ ...args, lease }));
        assert.equal(receipt.status, 'committed', receipt.validation.code);
        const proof = requirePassedProjectCheckSuite(args, receipt.id);
        assert.equal(proof.receipt.hash, receipt.hash);
        return { id: receipt.id, hash: receipt.hash, runId, reviewBasisHash: proof.reviewBasisHash };
      };
      const first = await runSuite();
      const alternate = await runSuite();
      fs.writeFileSync(authorityPath, JSON.stringify(authority) + '\n', { encoding: 'utf8', flag: 'wx' });
      console.log(JSON.stringify({ ...first, alternate, approvalId: approval.id, artifactHash: snapshot.manifest.hash }));
    } finally {
      const ownership = coordinator.status([sourceKey]);
      if (ownership.available && !ownership.active.some(claim => claim.guardPhase === 'running')) {
        snapshot?.dispose();
        frozen.dispose();
      }
    }
  } finally {
    coordinator.close();
    if (originalTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = originalTemp;
    if (originalTmp === undefined) delete process.env.TMP;
    else process.env.TMP = originalTmp;
  }
}

await main();
