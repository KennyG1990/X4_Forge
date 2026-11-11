import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { canonicalJson, hashActionReceiptAuthority, type ActionReceipt } from '../src/lib/actionReceipt';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { artifactPlanIdentity, buildArtifactPlan } from '../src/lib/artifactPipeline';
import { isSameOrDescendant, pathsOverlap } from '../src/lib/pathRoles';
import { applyProjectCheckCoverage, buildValidationEvidence } from '../src/lib/validationEvidence';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { createOwnedProjectCheckStage, openProjectCheckStageContext, retireAbandonedProjectCheckStages,
  type ProjectCheckStageContext } from '../src/server/projectCheckStaging';
import { ProjectCheckApprovalLedger, projectCheckApprovalCoordinationKey } from '../src/server/projectCheckApproval';
import { loadNativeProjectCheckAuthority, openNativeProjectCheckProof, openNativeProjectCheckStaging, type NativeProofScope } from '../src/server/projectCheckNativeProof';
import { PROJECT_CHECKS_MAX_BYTES, PROJECT_CHECKS_PATH } from '../src/server/projectCheckProposal';
import { captureProjectCheckSetup, freezeProjectCheckSetup } from '../src/server/projectCheckSetup';
import { executeProjectCheckSuite, projectCheckSuiteReceiptId, readProjectCheckSuiteReport, readProjectCheckWorkerEvidence, readTerminalProjectCheckSuite,
  requirePassedProjectCheckSuite } from '../src/server/projectCheckSuite';
import { ProjectCheckRunRefusal, ProjectCheckRunService } from '../src/server/projectCheckRunService';
import { canonicalSourceKey } from '../src/server/resourceCoordinator';
import { SharedSourceCoordinator, type ProjectCheckSourceLease, type ProjectCheckStageLease } from '../src/server/sharedSourceCoordinator';

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
if mode not in ('nonzero-empty', 'pass-empty'):
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

const nativeAdaptersOnly = process.env.FORGE_QA_NATIVE_STAGING_ONLY === '1';
const footprintLimit = nativeAdaptersOnly ? { bytes: 32 * 1024 * 1024, entries: 1000 } : { bytes: 128 * 1024 * 1024, entries: 2000 };
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

type Mode = 'wait' | 'wait-nonzero' | 'nonzero' | 'nonzero-empty' | 'pass' | 'pass-empty';
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
    return !status.available || status.active.length > 0 || status.waiting.length > 0;
  });
  const execute = (selected = exact, wrapLease: (lease: ProjectCheckSourceLease) => ProjectCheckSourceLease = lease => lease) =>
    coordinator.run([key], { actor: actorId, operation: 'fixture-suite', workspaceId },
      lease => executeProjectCheckSuite({ ...selected, lease: wrapLease(lease) }));
  return { commands, approvals, approval, store, script, exact, inputs, execute, coordinator, observer, key, ownership, directory, registry, scratch,
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

function crashBackend(f: ReturnType<typeof fixture>, mode: 'finish' | 'running', suffix = '') {
  const input = { actorId, workspaceId, operationId: `recovery-${mode}${suffix}`, modId,
    artifactHash: f.exact.artifact.snapshot.manifest.hash,
    requestHash: createHash('sha256').update(`recovery-${mode}`).digest('hex'), sourceKey: f.key };
  const imports = [
    ['ActionReceiptStore', '../src/lib/actionReceiptStore.ts'], ['buildArtifactPlan', '../src/lib/artifactPipeline.ts'],
    ['captureDeploymentSnapshot', '../src/server/deploymentSnapshot.ts'], ['ProjectCheckApprovalLedger', '../src/server/projectCheckApproval.ts'],
    ['captureProjectCheckSetup, freezeProjectCheckSetup', '../src/server/projectCheckSetup.ts'],
    ['executeProjectCheckSuite', '../src/server/projectCheckSuite.ts'], ['ProjectCheckRunService', '../src/server/projectCheckRunService.ts'],
    ['SharedSourceCoordinator', '../src/server/sharedSourceCoordinator.ts'],
  ].map(([names, file]) => `import { ${names} } from ${JSON.stringify(new URL(file, import.meta.url).href)};`).join('\n');
  const source = `${imports}
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
class InterruptedStore extends ActionReceiptStore {
  commit(...args) {
    if (data.mode === 'finish' && this.read(args[0]).capability.id === 'project-check.run') process.exit(73);
    return super.commit(...args);
  }
}
const store = new InterruptedStore({ root: data.storeRoot });
const coordinator = new SharedSourceCoordinator({ directory: data.registry, waitMs: 8000, pollMs: 10 });
const service = new ProjectCheckRunService(store, coordinator);
setTimeout(() => process.exit(90), 12000);
if (data.mode === 'running') setInterval(() => { if (fs.existsSync(data.marker)) process.exit(74); }, 10);
const admitted = await service.start(data.input, async (lease, runId) => {
  try {
  const setup = captureProjectCheckSetup(data.setupInput);
  const stageContext = { lease, sourceKey: data.input.sourceKey, actorId: data.input.actorId, workspaceId: data.input.workspaceId, runId };
  const frozen = freezeProjectCheckSetup(data.setupInput, setup.setupHash, data.scratch, stageContext);
  const plan = buildArtifactPlan({ sourceRoot: '', memoryOnly: true,
    generatedFiles: Object.fromEntries(data.files.map(file => [file.path, file.content])) });
  if (!plan.ok) throw new Error('Fixture artifact refused.');
  const snapshot = captureDeploymentSnapshot(plan, 'loose', stageContext);
  if (snapshot.manifest.hash !== data.input.artifactHash) throw new Error('Fixture artifact identity changed.');
  const approvals = new ProjectCheckApprovalLedger(store, 'fixture-owner', () => false);
  const suite = await executeProjectCheckSuite({ setupInput: data.setupInput, frozen,
    artifact: { modId: data.input.modId, snapshot }, approvals, approvalId: data.approvalId,
    runId, systemRoot: data.runtime.systemRoot, runtime: data.runtime, store,
    workspaceId: data.input.workspaceId, actorId: data.input.actorId, lease });
  return { suite, logicalArtifactHash: snapshot.manifest.hash };
  } catch (error) { console.error('BACKEND_EXECUTION_REFUSED', error?.code, error?.message); throw error; }
});
console.log(JSON.stringify(admitted));
setInterval(() => {
  const status = service.status(data.input.actorId, data.input.workspaceId, admitted.id);
  if (!['queued','running'].includes(status.state)) { console.error(JSON.stringify(status)); process.exit(91); }
}, 20);
`;
  const driver = path.join(root, 'recovery-backend.mts');
  const dataFile = path.join(root, 'recovery-backend-input.json');
  fs.writeFileSync(driver, source);
  fs.writeFileSync(dataFile, JSON.stringify({ mode, input, registry: f.registry, scratch: f.scratch,
    setupInput: f.exact.setupInput, storeRoot: f.store.root, approvalId: f.approval.id, runtime,
    files: f.exact.artifact.snapshot.files, marker: f.commands[0].marker }));
  const child = spawnSync(process.execPath, ['--import', new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href, driver, dataFile], {
    cwd: process.cwd(), env: { ...process.env, TEMP: f.scratch, TMP: f.scratch, NODE_DISABLE_COMPILE_CACHE: '1' },
    windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 15_000,
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, mode === 'finish' ? 73 : 74, child.stderr || child.stdout);
  const admitted = JSON.parse(child.stdout.trim()) as { id: string };
  const receipt = f.store.read(admitted.id);
  assert.equal(receipt.status, 'prepared');
  f.exact.runId = receipt.authority.operationId.split(':')[1];
  return { input, id: admitted.id };
}

function crashRetirementBackend(f: ReturnType<typeof fixture>) {
  const driver = path.join(root, 'recovery-backend.mts');
  const dataFile = path.join(root, 'recovery-backend-input.json');
  const source = `import fs from 'node:fs';
import { SharedSourceCoordinator } from ${JSON.stringify(new URL('../src/server/sharedSourceCoordinator.ts', import.meta.url).href)};
import { retireAbandonedProjectCheckStages } from ${JSON.stringify(new URL('../src/server/projectCheckStaging.ts', import.meta.url).href)};
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const coordinator = new SharedSourceCoordinator({ directory: data.registry });
const rename = fs.renameSync;
fs.renameSync = (...args) => { rename(...args); process.exit(75); };
retireAbandonedProjectCheckStages(coordinator, data.scope, [data.scratch]);
process.exit(92);
`;
  fs.writeFileSync(driver, source);
  fs.writeFileSync(dataFile, JSON.stringify({ registry: f.registry, scratch: f.scratch, scope: { sourceKey: f.key, actorId, workspaceId } }));
  const result = spawnSync(process.execPath, ['--import', new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href, driver, dataFile], {
    cwd: process.cwd(), env: { ...process.env, TEMP: f.scratch, TMP: f.scratch, NODE_DISABLE_COMPILE_CACHE: '1' },
    windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 15_000,
  });
  assert.equal(result.error, undefined, String(result.error)); assert.equal(result.status, 75, result.stderr || result.stdout);
  const rows = f.coordinator.projectCheckStages();
  assert.equal(rows.filter(row => row.retirement && row.quarantineRoot && fs.existsSync(row.quarantineRoot) && !fs.existsSync(row.root)).length, 1);
}

async function nativeStagingAdapters(f: ReturnType<typeof fixture>) {
  const sourceRoot = f.exact.setupInput.sourceRoot;
  const generated = f.exact.artifact.snapshot.files.map(file => ({ ...file }));
  f.retireInputs();
  for (const file of generated) {
    const destination = path.join(sourceRoot, ...file.path.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, file.content ?? '');
  }
  const plan = buildArtifactPlan({ sourceRoot }); assert(plan.ok, plan.errors.join(';'));
  const artifactHash = artifactPlanIdentity(plan, 'loose');
  const bootstrap = path.join(root, 'native-bootstrap'); fs.mkdirSync(bootstrap);
  const nativeWorkerPath = path.join(bootstrap, path.basename(workerPath));
  fs.copyFileSync(workerPath, nativeWorkerPath); fs.copyFileSync(launcherPath, path.join(bootstrap, path.basename(launcherPath)));
  const nativeRuntime = { ...runtime, workerPath: nativeWorkerPath };
  const gameRoot = path.join(f.directory, 'game'); fs.mkdirSync(gameRoot);
  const authorityFile = path.join(f.directory, 'project-check-deploy-authority.json');
  const authority = { version: 1, actorId, workspaceId, modId, sourceRoot, ownerId: 'fixture-owner', approvalId: f.approval.id,
    interpreterPath: f.exact.setupInput.interpreterPath, interpreterDependencies: f.exact.setupInput.interpreterDependencies, runtime: nativeRuntime };
  fs.writeFileSync(authorityFile, JSON.stringify(authority));
  const environment = { X4_FORGE_MODE: 'dev-build', X4_FORGE_DEV_ROOT: root, X4_FORGE_PROJECT_CHECK_LEGACY_FIXTURE: '1',
    X4_SOURCE_COORDINATION_DIR: f.registry, X4_STATE_DIR: path.join(f.directory, 'state'), X4_CONFIG_DIR: path.join(f.directory, 'config'),
    X4_STUDIO_CACHE_DIR: path.join(f.directory, 'cache'), TEMP: f.scratch, TMP: f.scratch };
  for (const directory of [environment.X4_STATE_DIR, environment.X4_CONFIG_DIR, environment.X4_STUDIO_CACHE_DIR]) fs.mkdirSync(directory);
  const oldEnvironment = new Map([...Object.keys(environment), 'X4_FORGE_PROJECT_CHECK_OWNER_POLICY'].map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(environment)) process.env[key] = value;
  delete process.env.X4_FORGE_PROJECT_CHECK_OWNER_POLICY;
  const scope: NativeProofScope = { store: f.store, actorId, workspaceId, modId, sourceRoot, addressedSourceRoot: sourceRoot,
    workspaceRoot: f.directory, targetRoot: path.join(gameRoot, 'extensions', modId), stagingRoot: path.join(f.directory, '.forge-builds', 'loose') };
  const owner = { actor: actorId, workspaceId, operation: 'native-adapter-test' };
  const recordState = { workspaceId, head: 'native-fixture-head', workspace: { modId, sourceStamp: { dir: sourceRoot } } };
  let keyCurrent = true; let executeCalls = 0; let ownedSnapshots = 0; let ownedFreezes = 0;
  let recoveryStageLease: Readonly<ProjectCheckStageLease> | undefined;
  const source = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  const names = ['projectCheckArtifactIssue', 'sourceDeclaresProjectChecks', 'projectCheckRunAuthority', 'projectCheckRunError',
    'startProjectCheckRun', 'openProjectValidationProof', 'openDeploymentProjectCheckStaging'];
  const declarations = names.map(name => {
    const found = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert(found, `Missing actual server function ${name}`); return found.getText(ast);
  });
  const operationVariable = ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === 'ACTION_RECEIPT_OPERATION_ID_RE'); assert(operationVariable?.initializer);
  const extracted = `const ACTION_RECEIPT_OPERATION_ID_RE = ${operationVariable.initializer.getText(ast)};\n${declarations.join('\n')}\nreturn {${names.join(',')}};`;
  const compiled = ts.transpileModule(extracted, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  type Request = { body: Record<string, unknown>; get(name: string): string | undefined };
  const response = () => ({ code: 200, body: undefined as unknown, status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; } });
  type Response = ReturnType<typeof response>;
  type RunStatus = ReturnType<ProjectCheckRunService['status']>;
  type Handlers = {
    startProjectCheckRun(req: Request, res: Response): Promise<unknown>;
    openProjectValidationProof(req: Request, res: Response, fromPath: string, lease?: ProjectCheckSourceLease):
      { snapshot: ReturnType<typeof captureDeploymentSnapshot>; verify(): void; dispose(): void } | undefined;
    openDeploymentProjectCheckStaging(input: Record<string, unknown>, lease?: ProjectCheckSourceLease): Readonly<ProjectCheckStageContext> | undefined;
  };
  const request = (operation: string, body: Record<string, unknown> = { expectedArtifactHash: artifactHash, deployFormat: 'loose' }): Request =>
    ({ body, get: name => name === 'x-forge-operation-id' ? operation : undefined });
  const createHandlers = (service: ProjectCheckRunService) => {
    const bindings = { fs, path, process, console, ProjectCheckRunRefusal, PROJECT_CHECKS_PATH, PROJECT_CHECKS_MAX_BYTES,
      activeBuildWorkspace: (workspace: typeof recordState.workspace) => workspace,
      effectiveModId: (workspace: typeof recordState.workspace) => workspace.modId,
      resolveXsdConfig: () => ({ modWorkspacePath: f.directory, x4GamePath: gameRoot }),
      actionReceiptStore: f.store, loadNativeProjectCheckAuthority, canonicalSourceKey, isSameOrDescendant, pathsOverlap,
      projectCheckRunCaller: () => ({ actorId, addressed: recordState, keyIsCurrent: () => keyCurrent }),
      workspaceRegistry: { readPersisted: (id: string) => id === workspaceId ? recordState : undefined },
      trustHash: (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex'),
      projectCheckRuns: service, captureActionReceiptProjection: () => {},
      importModFolder: () => ({ workspace: recordState.workspace }), deploymentPlan: () => ({ plan, artifactHash }),
      captureDeploymentSnapshot: (...args: Parameters<typeof captureDeploymentSnapshot>) => {
        assert(args[2], 'Actual native handler must supply an owned context.'); ownedSnapshots++;
        const snapshot = captureDeploymentSnapshot(...args); meterFixture(); return snapshot;
      },
      freezeProjectCheckSetup: (...args: Parameters<typeof freezeProjectCheckSetup>) => {
        assert(args[3], 'Actual native handler must supply an owned context.'); ownedFreezes++;
        const frozen = freezeProjectCheckSetup(...args); meterFixture(); return frozen;
      },
      openProjectCheckStageContext: (...args: Parameters<typeof openProjectCheckStageContext>) => {
        if (!Object.hasOwn(args[1], 'armProjectCheck')) {
          recoveryStageLease = args[1]; assert(Object.isFrozen(recoveryStageLease));
          assert.deepEqual(Object.keys(recoveryStageLease).sort(), ['adoptProjectCheckStage', 'assertProjectCheckAuthority',
            'assertProjectCheckStage', 'reserveProjectCheckStage', 'retireProjectCheckStage']);
        }
        return openProjectCheckStageContext(...args);
      }, forgeSourceCoordinator: f.coordinator,
      executeProjectCheckSuite: (...args: Parameters<typeof executeProjectCheckSuite>) => { executeCalls++; return executeProjectCheckSuite(...args); },
      readTerminalProjectCheckSuite, projectCheckSuiteReceiptId, artifactPlanIdentity,
      projectCheckRunsAvailable: () => true, projectCheckApprovalCoordinationKey,
      resolveModFolder: () => ({ abs: sourceRoot }), openNativeProjectCheckProof,
      openNativeProjectCheckStaging: (input: NativeProofScope, lease: Parameters<typeof openNativeProjectCheckStaging>[1],
        selection?: Parameters<typeof openNativeProjectCheckStaging>[2]) => openNativeProjectCheckStaging(input, lease, selection, f.coordinator),
    };
    const factory = vm.compileFunction(compiled, Object.keys(bindings), { filename: 'actual-server-native-staging-functions.js' });
    return factory(...Object.values(bindings)) as Handlers;
  };
  const terminal = async (service: ProjectCheckRunService, id: string) => until(() => {
    const state = service.status(actorId, workspaceId, id); return ['passed', 'failed', 'incomplete', 'refused', 'pending-recovery'].includes(state.state) ? state : undefined;
  }, 'native handler terminal result');
  try {
    // Keep one old exact stage so failed admissions must prove they did not sweep it.
    let orphanRoot = '';
    await f.coordinator.run([f.key], owner, lease => {
      orphanRoot = createOwnedProjectCheckStage({ sourceKey: f.key, actorId, workspaceId, runId: 'a'.repeat(32), lease }, f.scratch, 'setup', []).root;
    });
    const service = new ProjectCheckRunService(f.store, f.coordinator); const handlers = createHandlers(service);
    const invalidBody = response(); await handlers.startProjectCheckRun(request('native-extra-field', { expectedArtifactHash: artifactHash, deployFormat: 'loose', extra: true }), invalidBody);
    assert.equal(invalidBody.code, 400); assert.equal(ownedSnapshots, 0); assert(fs.existsSync(orphanRoot));
    keyCurrent = false; const revoked = response(); await handlers.startProjectCheckRun(request('native-revoked'), revoked);
    assert.equal(revoked.code, 409); assert.equal(ownedSnapshots, 0); assert(fs.existsSync(orphanRoot)); keyCurrent = true;
    const changedArtifact = response(); await handlers.startProjectCheckRun(request('native-stale', { expectedArtifactHash: '0'.repeat(64), deployFormat: 'loose' }), changedArtifact);
    assert.equal(changedArtifact.code, 202); const changedView = changedArtifact.body as RunStatus;
    assert.equal((await terminal(service, changedView.id)).state, 'failed');
    assert.equal(f.store.read(changedView.id).validation.code, 'PROJECT_CHECK_RUN_ARTIFACT_CHANGED');
    assert.equal(executeCalls, 0); assert(fs.existsSync(orphanRoot));
    const admitted = response(); await handlers.startProjectCheckRun(request('native-pass'), admitted); assert.equal(admitted.code, 202);
    const passed = await terminal(service, (admitted.body as RunStatus).id); assert.equal(passed.state, 'passed'); assert(passed.suiteReceipt);
    assert.equal(passed.suiteReport?.checks[0].message, 'Check output (excerpt): probe');
    assert.equal(executeCalls, 1); assert.equal(ownedSnapshots, 1); assert.equal(ownedFreezes, 1);
    assert.equal(fs.existsSync(orphanRoot), false); assert.equal(f.coordinator.projectCheckStages().length, 0);
    const retry = response(); await handlers.startProjectCheckRun(request('native-pass'), retry);
    assert.equal((retry.body as RunStatus).id, passed.id); assert.equal(executeCalls, 1); assert.equal(ownedSnapshots, 1);
    record('actual source-extracted run handler uses owned stages, sweeps old roots only after current admission, disposes to journal0 and preserves idempotency/no-allocation refusals');

    const selected = { receiptId: passed.suiteReceipt.id, expectedHash: passed.suiteReceipt.hash, artifactHash };
    const keys = [f.key, projectCheckApprovalCoordinationKey(f.store), canonicalSourceKey(f.store.pathFor(selected.receiptId))];
    await f.coordinator.run(keys, owner, lease => {
      for (const change of [{ actorId: 'foreign' }, { workspaceId: 'ws_foreign' }, { modId: 'foreign' },
        { sourceRoot: f.scratch }, { targetRoot: path.join(sourceRoot, 'extensions', modId) }]) {
        assert.throws(() => openNativeProjectCheckStaging({ ...scope, ...change }, lease, selected, f.coordinator), { code: 'PROJECT_CHECK_PROOF_MISMATCH' });
        assert.equal(f.coordinator.projectCheckStages().length, 0);
      }
      for (const change of [{ receiptId: 'bad' }, { expectedHash: '0'.repeat(64) }, { artifactHash: '0'.repeat(64) }]) {
        assert.throws(() => openNativeProjectCheckStaging(scope, lease, { ...selected, ...change }, f.coordinator), { code: 'PROJECT_CHECK_PROOF_MISMATCH' });
        assert.equal(f.coordinator.projectCheckStages().length, 0);
      }
      const validation = handlers.openProjectValidationProof(request('validation', { projectCheckSuiteReceiptId: selected.receiptId,
        expectedProjectCheckSuiteReceiptHash: selected.expectedHash, deployFormat: 'loose' }), response(), 'source', lease);
      assert(validation); validation.verify(); assert.equal(f.coordinator.projectCheckStages().length, 2); meterFixture();
      validation.dispose(); assert.equal(f.coordinator.projectCheckStages().length, 0);
    });
    const deployInput = { plan, body: { deployFormat: 'loose', projectCheckSuiteReceiptId: selected.receiptId,
      expectedProjectCheckSuiteReceiptHash: selected.expectedHash }, principal: { kind: 'agent', id: actorId }, workspaceId,
      addressedSourceRoot: sourceRoot, sourceRoot, modId, workspaceRoot: f.directory, gameRoot };
    await f.coordinator.run(keys, owner, lease => {
      const context = handlers.openDeploymentProjectCheckStaging(deployInput, lease); assert(context);
      const snapshot = captureDeploymentSnapshot(plan, 'loose', context);
      assert.throws(() => openNativeProjectCheckProof({ ...scope, receiptId: selected.receiptId, snapshot,
        stageContext: { ...context, runId: '0'.repeat(32) } }), { code: 'PROJECT_CHECK_PROOF_MISMATCH' });
      assert.throws(() => openNativeProjectCheckProof({ ...scope, receiptId: selected.receiptId, snapshot,
        stageContext: { ...context } }), { code: 'PROJECT_CHECK_PROOF_MISMATCH' });
      assert.equal(f.coordinator.projectCheckStages().length, 1);
      const originalAuthority = fs.readFileSync(authorityFile); fs.writeFileSync(authorityFile, '{changed-authority');
      try { assert.throws(() => openNativeProjectCheckProof({ ...scope, receiptId: selected.receiptId, snapshot, stageContext: context }), { code: 'PROJECT_CHECK_PROOF_MISMATCH' }); }
      finally { fs.writeFileSync(authorityFile, originalAuthority); }
      assert.equal(f.coordinator.projectCheckStages().length, 1);
      const proof = openNativeProjectCheckProof({ ...scope, receiptId: selected.receiptId, snapshot, stageContext: context });
      assert.equal(proof.verification.checks[0].message, 'Check output (excerpt): probe');
      proof.verify(); assert.equal(f.coordinator.projectCheckStages().length, 2); meterFixture(); proof.dispose(); snapshot.dispose();
      assert.equal(f.coordinator.projectCheckStages().length, 0);
      const legacy = captureDeploymentSnapshot(plan, 'loose');
      try { assert.throws(() => openNativeProjectCheckProof({ ...scope, receiptId: selected.receiptId, snapshot: legacy, stageContext: context }), { code: 'PROJECT_CHECK_PROOF_MISMATCH' }); }
      finally { legacy.dispose(); }
      assert.equal(f.coordinator.projectCheckStages().length, 0);
    });
    await f.coordinator.run([f.key], owner, lease => {
      const original = fs.readFileSync(authorityFile); fs.unlinkSync(authorityFile);
      try {
        const preview = handlers.openDeploymentProjectCheckStaging({ ...deployInput, body: { deployFormat: 'loose' } }, lease); assert(preview);
        assert.notEqual(preview.runId, /^project-check-suite:(.+)$/.exec(f.store.read(selected.receiptId).authority.operationId)![1]);
        const snapshot = captureDeploymentSnapshot(plan, 'loose', preview); meterFixture(); snapshot.dispose();
        assert.equal(f.coordinator.projectCheckStages().length, 0); assert.equal(executeCalls, 1);
      } finally { fs.writeFileSync(authorityFile, original); }
      assert.throws(() => handlers.openDeploymentProjectCheckStaging({ ...deployInput, principal: { kind: 'studio' }, body: {} }, lease), { code: 'ASYNC_VERIFICATION_REQUIRED' });
      assert.throws(() => handlers.openDeploymentProjectCheckStaging({ ...deployInput, body: { ...deployInput.body, autoReimport: true } }, lease), { code: 'PROJECT_CHECK_PROOF_MISMATCH' });
      const plain = buildArtifactPlan({ sourceRoot: '', memoryOnly: true, generatedFiles: { 'content.xml': '<content id="plain"/>' } });
      assert.equal(handlers.openDeploymentProjectCheckStaging({ ...deployInput, plan: plain, body: {}, principal: { kind: 'studio' } }), undefined);
    });
    record('actual native staging/proof plus extracted validation/deploy adapters reuse one owned context, reject foreign/stale/legacy proof before allocation and keep unapproved preview non-executing');

    let failParent = true;
    class InterruptedNativeStore extends ActionReceiptStore {
      override commit(...args: Parameters<ActionReceiptStore['commit']>) {
        const receipt = this.read(args[0]);
        if (failParent && 'id' in receipt.capability && receipt.capability.id === 'project-check.run') throw new Error('fixture-native-parent-write-fault');
        return super.commit(...args);
      }
    }
    const interruptedStore = new InterruptedNativeStore({ root: f.store.root });
    const firstService = new ProjectCheckRunService(interruptedStore, f.coordinator); const firstHandlers = createHandlers(firstService);
    const interruptedResponse = response(); await firstHandlers.startProjectCheckRun(request('native-recovery'), interruptedResponse);
    assert.equal(interruptedResponse.code, 202); const pending = await terminal(firstService, (interruptedResponse.body as RunStatus).id);
    assert.equal(pending.state, 'pending-recovery'); assert.equal(executeCalls, 2); assert.equal(f.coordinator.projectCheckStages().length, 0);
    failParent = false;
    await f.coordinator.run([f.key], owner, lease => {
      orphanRoot = createOwnedProjectCheckStage({ sourceKey: f.key, actorId, workspaceId, runId: 'b'.repeat(32), lease }, f.scratch, 'setup', []).root;
    });
    const recoveredService = new ProjectCheckRunService(f.store, f.coordinator); const recoveredHandlers = createHandlers(recoveredService);
    const repairedResponse = response(); await recoveredHandlers.startProjectCheckRun(request('native-recovery'), repairedResponse);
    const repaired = await terminal(recoveredService, (repairedResponse.body as RunStatus).id);
    assert.equal(repaired.state, 'passed'); assert.equal(repaired.id, pending.id); assert.equal(executeCalls, 2);
    assert.equal(fs.existsSync(orphanRoot), false); assert.equal(f.coordinator.projectCheckStages().length, 0);
    assert(recoveryStageLease); assert.throws(() => recoveryStageLease.assertProjectCheckAuthority(f.key, workspaceId, actorId));
    record('actual source-extracted recovery handler receives stage-only authority, reopens proof and cleans its stages/orphan without executing again');
    meterFixture();
    console.log(JSON.stringify({ nativeAdapterSourceSha256: createHash('sha256').update(source).digest('hex'), extractedFunctions: names,
      actualWindowsChecks: executeCalls, ownedSnapshots, ownedFreezes, journalRemaining: f.coordinator.projectCheckStages().length,
      controlledCallerAndImportProjection: true, realNativeDevScopeAndLegacyFixtureAuthority: true, fullServerHttp: false }));
  } finally {
    for (const [key, value] of oldEnvironment) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

try {
  const interpreter = stageInterpreter();
  if (nativeAdaptersOnly) {
    await nativeStagingAdapters(fixture('native-adapters', [['probe', 'pass']], interpreter));
    meterFixture();
    console.log(JSON.stringify({ status: 'passed', nativeAdaptersOnly: true, realWindowsProcesses: true, checks,
      observedPeakFootprint: peakFootprint, footprintLimit }));
  } else {
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
  assert(passedReport.checks.every(check => check.message === `Check output (excerpt): ${check.id}`));
  assert(verified.verification.checks.every(check => check.message === `Check output (excerpt): ${check.id}`));
  assert.deepEqual(JSON.parse(JSON.stringify(readProjectCheckSuiteReport(new ActionReceiptStore({ root: reopened.root }), receipt))), passedReport);
  record('the exact parent and both command receipts reopen against independently frozen identical inputs');

  const authenticChild = verified.commandReceipts[0];
  const compactSummary = JSON.parse(authenticChild.validation.summary!);
  const missingMessage = { ...compactSummary }; delete missingMessage.m;
  const normalized = readProjectCheckWorkerEvidence(authenticChild);
  const changedSummary = (summary: unknown, status = authenticChild.status) => ({ ...authenticChild, status,
    validation: { ...authenticChild.validation, summary: canonicalJson(summary) } });
  const invalidSummaries = [
    { ...compactSummary, v: 3 }, { ...compactSummary, extra: true }, missingMessage,
    { ...compactSummary, s: 'failed' }, { ...compactSummary, e: 7 }, { ...compactSummary, b: 0 },
    { ...compactSummary, b: 1024 * 1024 + 1 }, { ...compactSummary, d: -1 }, { ...compactSummary, h: 'bad' },
    { ...compactSummary, m: 'no output label' }, { ...compactSummary, m: 'Check output (excerpt): ' + 'x'.repeat(128) },
    { ...compactSummary, m: 'Check output (excerpt): token=unsafe-secret' },
    { ...compactSummary, m: 'Check output (excerpt): escaped\u0000control' },
    { ...compactSummary, m: 'Check output (excerpt): hidden\u202econtrol' },
    { ...compactSummary, m: 'Check output (excerpt): bad\udc00surrogate' },
  ];
  for (const summary of invalidSummaries) assert.throws(() => readProjectCheckWorkerEvidence(changedSummary(summary)), { code: 'PROJECT_CHECK_SUITE_MISMATCH' });
  assert.throws(() => readProjectCheckWorkerEvidence(changedSummary(compactSummary, 'failed')), { code: 'PROJECT_CHECK_SUITE_MISMATCH' });
  const legacyDecoded = readProjectCheckWorkerEvidence(changedSummary(normalized.evidence));
  assert.deepEqual(legacyDecoded.evidence, normalized.evidence); assert.equal(legacyDecoded.message, undefined);
  assert.throws(() => readProjectCheckWorkerEvidence(changedSummary({ ...normalized.evidence, m: compactSummary.m })), { code: 'PROJECT_CHECK_SUITE_MISMATCH' });
  record('versioned success diagnostics normalize exact raw facts and reject unknown, forged, unsafe or failed-message shapes while legacy five-field evidence stays readable');

  const emptyPass = fixture('empty-success', [['alpha', 'pass-empty']], interpreter);
  const emptyPassedSuite = await emptyPass.execute();
  const emptyPassedProof = await requirePassedProjectCheckSuite(emptyPass.exact, emptyPassedSuite.id);
  const emptyPassedReport = readProjectCheckSuiteReport(new ActionReceiptStore({ root: emptyPass.store.root }), emptyPassedSuite);
  assert.equal(emptyPassedReport?.state, 'passed'); assert.equal(emptyPassedReport.checks[0].message, undefined);
  assert.equal(emptyPassedProof.verification.checks[0].message, undefined);
  const emptyChild = emptyPassedProof.commandReceipts[0];
  assert.equal(JSON.parse(emptyChild.validation.summary!).status, 'passed'); assert.equal(JSON.parse(emptyChild.validation.summary!).v, undefined);
  emptyPass.retireInputs();
  record('a real empty-output success retains the exact legacy summary and reopens report and passing proof without invented diagnostic text');

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
  assert(projected.coverage.projectVerification.checks.every((check: { id: string; message: string }) => check.message === `Check output (excerpt): ${check.id}`));
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

  const interrupted = fixture('recover-finished', [['omega', 'pass']], interpreter);
  const crashed = crashBackend(interrupted, 'finish');
  const orphan = interrupted.store.read(crashed.id);
  const orphanBytes = fs.readFileSync(interrupted.store.pathFor(crashed.id));
  const terminal = interrupted.store.listVerified().find(child => 'id' in child.capability && child.capability.id === 'project-check.suite');
  assert(terminal && terminal.status === 'committed');
  const terminalBytes = fs.readFileSync(interrupted.store.pathFor(terminal.id));
  const resumedService = new ProjectCheckRunService(new ActionReceiptStore({ root: interrupted.store.root }), interrupted.coordinator);
  assert.equal(resumedService.status(actorId, workspaceId, crashed.id).state, 'pending-recovery');
  assert.equal(resumedService.retry(actorId, workspaceId, crashed.input.operationId, crashed.input.requestHash)?.state, 'pending-recovery');
  assert.deepEqual(fs.readFileSync(interrupted.store.pathFor(crashed.id)), orphanBytes);
  let replays = 0;
  let repairCalls = 0;
  const resumed = await resumedService.start(crashed.input, async () => { replays++; throw new Error('Recovery must not execute again.'); },
    async runId => {
      repairCalls++;
      const suite = readTerminalProjectCheckSuite({ ...interrupted.exact, runId }, terminal.id);
      assert(suite);
      return { suite, logicalArtifactHash: interrupted.exact.artifact.snapshot.manifest.hash };
    });
  const repeated = await resumedService.start(crashed.input, async () => { replays++; throw new Error('Duplicate execution.'); },
    async () => { throw new Error('Duplicate repair callback.'); });
  assert(['queued', 'running', 'passed'].includes(repeated.state));
  console.log(JSON.stringify({ realBackendExit: 73, parentPrepared: orphan.status === 'prepared', terminalSuite: terminal.status,
    statusAndRetryReadOnly: true, resumedState: resumed.state, executionReplays: replays }));
  assert.notEqual(resumed.state, 'pending-recovery', 'An exact orphan retry must admit reconciliation rather than remain stuck.');
  const repaired = await until(() => {
    const current = resumedService.status(actorId, workspaceId, crashed.id);
    return current.state === 'queued' || current.state === 'running' ? undefined : current;
  }, 'finished backend restart repair');
  assert.equal(repaired.state, 'passed');
  assert.equal(repaired.suiteReceipt?.id, terminal.id);
  assert.equal(replays, 0);
  assert.equal(repairCalls, 1);
  assert.deepEqual(fs.readFileSync(interrupted.store.pathFor(terminal.id)), terminalBytes);
  assert(started(interrupted.commands[0].marker));
  interrupted.retireInputs();
  record('a separate Node backend exits before the parent write; exact retry reconciles the durable suite without executing a check twice');

  const abandoned = fixture('recover-running', [['omega', 'wait']], interpreter);
  const killed = crashBackend(abandoned, 'running');
  assert(started(abandoned.commands[0].marker));
  const abandonedParent = fs.readFileSync(abandoned.store.pathFor(killed.id));
  const abandonedSuite = abandoned.store.listVerified().find(child => 'id' in child.capability && child.capability.id === 'project-check.suite');
  assert(abandonedSuite && abandonedSuite.status === 'prepared');
  const abandonedSuiteBytes = fs.readFileSync(abandoned.store.pathFor(abandonedSuite.id));
  const recoverOne = new ProjectCheckRunService(new ActionReceiptStore({ root: abandoned.store.root }), abandoned.coordinator);
  const recoverTwo = new ProjectCheckRunService(new ActionReceiptStore({ root: abandoned.store.root }), abandoned.observer);
  let firstRepair = 0;
  let secondRepair = 0;
  const neverExecute = async () => { replays++; throw new Error('Abandoned command must not replay.'); };
  try {
    assert.throws(() => retireAbandonedProjectCheckStages(abandoned.coordinator,
      { sourceKey: abandoned.key, actorId, workspaceId }, [abandoned.scratch]), { code: 'PROJECT_CHECK_CLEANUP_UNCONFIRMED' });
    await recoverOne.start(killed.input, neverExecute, async runId => {
      firstRepair++;
      assert.equal(readTerminalProjectCheckSuite({ ...abandoned.exact, runId }, abandonedSuite.id), undefined);
      return undefined;
    });
    await recoverTwo.start(killed.input, neverExecute, async () => { secondRepair++; throw new Error('The second participant must observe the completed repair.'); });
    await until(() => abandoned.ownership().waiting.length === 2 ? true : undefined, 'both repair participants behind the real surviving Job');
    assert.equal(firstRepair, 0);
    assert.equal(secondRepair, 0);
    assert.deepEqual(fs.readFileSync(abandoned.store.pathFor(killed.id)), abandonedParent);
    assert.equal(recoverOne.status(actorId, workspaceId, killed.id).state, 'queued');
    release(abandoned.commands[0].release);
    await until(() => {
      const owned = abandoned.ownership();
      return owned.available && owned.active.length === 0 && owned.waiting.length === 0 ? true : undefined;
    }, 'all old and recovery source claims to drain');
    assert.equal(recoverOne.status(actorId, workspaceId, killed.id).state, 'incomplete');
    assert.equal(recoverTwo.status(actorId, workspaceId, killed.id).state, 'incomplete');
    assert.equal(recoverOne.status(actorId, workspaceId, killed.id).suiteReceipt, undefined);
    assert.equal(firstRepair, 1);
    assert.equal(secondRepair, 0);
    assert.equal(replays, 0);
    assert(started(abandoned.commands[0].marker));
    assert.deepEqual(fs.readFileSync(abandoned.store.pathFor(abandonedSuite.id)), abandonedSuiteBytes);
    const abandonedChild = abandoned.store.listVerified().find(isCommand)!;
    const abandonedChildPath = abandoned.store.pathFor(abandonedChild.id);
    const abandonedChildBytes = fs.readFileSync(abandonedChildPath);
    fs.appendFileSync(abandonedChildPath, '\n');
    try { assert.throws(() => readTerminalProjectCheckSuite(abandoned.exact, abandonedSuite.id), { code: 'PROJECT_CHECK_SUITE_MISMATCH' }); }
    finally { fs.writeFileSync(abandonedChildPath, abandonedChildBytes); }
  } finally {
    release(abandoned.commands[0].release);
    await until(() => {
      const owned = abandoned.ownership();
      return owned.available && !owned.active.length && !owned.waiting.length ? true : undefined;
    }, 'abandoned fixture cleanup');
  }
  abandoned.retireInputs();
  record('backend exit with a live Windows Job blocks two repair participants until drain; the parent becomes incomplete without replay or suite rewrite');

  // One tiny receipt-only model reuses a real failed suite; no second interpreter/runtime family.
  const modelStore = new ActionReceiptStore({ root: path.join(root, 'recovery-negatives') });
  const originalRun = failure.store.read(admitted.id);
  const modelParent = modelStore.prepare({ actor: originalRun.actor, client: originalRun.client, capability: originalRun.capability,
    authority: originalRun.authority, effects: originalRun.effects, input: originalRun.input,
    validation: { validator: originalRun.validation.validator, ruleHash: originalRun.validation.ruleHash },
    rollback: originalRun.rollback, metadata: originalRun.metadata });
  assert.equal(modelParent.id, originalRun.id);
  assert.equal(modelParent.authorityHash, originalRun.authorityHash);
  for (const item of failure.store.listVerified()) if (item.id !== modelParent.id) {
    fs.copyFileSync(failure.store.pathFor(item.id), modelStore.pathFor(item.id));
  }
  const modelInput = { actorId, workspaceId, modId, operationId: 'failure-excerpt-report',
    artifactHash: failure.exact.artifact.snapshot.manifest.hash, requestHash: originalRun.input.requestHash, sourceKey: failure.key };
  const modelExact = { ...failure.exact, store: modelStore,
    approvals: new ProjectCheckApprovalLedger(modelStore, 'fixture-owner', () => false) };
  const modelBefore = fs.readFileSync(modelStore.pathFor(modelParent.id));
  const modelService = new ProjectCheckRunService(modelStore, failure.coordinator);
  const attempt = async (inspect: Parameters<ProjectCheckRunService['start']>[2], service = modelService) => {
    await service.start(modelInput, neverExecute, inspect);
    await until(() => service.status(actorId, workspaceId, modelParent.id).state === 'pending-recovery' ? true : undefined, 'refused model repair');
    assert.deepEqual(fs.readFileSync(modelStore.pathFor(modelParent.id)), modelBefore);
  };
  const rejectProof = async (proofInput: Parameters<typeof readTerminalProjectCheckSuite>[0]) => {
    let refused = false;
    await attempt(async runId => {
      let suite: ActionReceipt | undefined;
      try { suite = readTerminalProjectCheckSuite({ ...proofInput, runId }, failed.id); }
      catch (error) { refused = true; throw error; }
      return suite ? { suite, logicalArtifactHash: proofInput.artifact.snapshot.manifest.hash } : undefined;
    });
    assert(refused, 'The proof reader itself must reject, not merely fail later persistence.');
  };
  await assert.rejects(modelService.start({ ...modelInput, requestHash: '9'.repeat(64) }, neverExecute, async () => undefined),
    { code: 'PROJECT_CHECK_RUN_CONFLICT' });
  await assert.rejects(modelService.start({ ...modelInput, sourceKey: modelInput.sourceKey + '-different' }, neverExecute, async () => undefined),
    { code: 'PROJECT_CHECK_RUN_CONFLICT' });
  assert.throws(() => modelService.status('different-agent', workspaceId, modelParent.id), { code: 'PROJECT_CHECK_RUN_NOT_FOUND' });
  await rejectProof({ ...modelExact, actorId: 'different-agent' });
  const modelChild = modelStore.listVerified().find(isCommand)!;
  const modelChildPath = modelStore.pathFor(modelChild.id);
  const modelChildBytes = fs.readFileSync(modelChildPath);
  const modelHidden = modelChildPath + '.fixture-hidden';
  fs.renameSync(modelChildPath, modelHidden);
  try { await rejectProof(modelExact); }
  finally { fs.renameSync(modelHidden, modelChildPath); }
  fs.appendFileSync(modelChildPath, '\n');
  try { await rejectProof(modelExact); }
  finally { fs.writeFileSync(modelChildPath, modelChildBytes); }
  const driftedArtifact = failure.inputs(true);
  try { await rejectProof({ ...modelExact, artifact: driftedArtifact.artifact }); }
  finally { driftedArtifact.frozen.dispose(); driftedArtifact.artifact.snapshot.dispose(); }
  let authorityReads = 0;
  await rejectProof({ ...modelExact,
    assertLaunchAuthority: () => { if (++authorityReads > 1) throw new Error('Fixture authority changed before returning proof.'); } });
  assert.equal(authorityReads, 2);
  assert.throws(() => readTerminalProjectCheckSuite({ ...fresh, store: reopened }, receipt.id), /revoked/);
  await attempt(async () => { throw new Error('Fixture authority/storage unavailable.'); });
  let interruptedWrites = 0;
  class InterruptRecoveryWrite extends ActionReceiptStore {
    override fail(...args: Parameters<ActionReceiptStore['fail']>) {
      if (args[0] === modelParent.id) { interruptedWrites++; throw new Error('Fixture final recovery write failed.'); }
      return super.fail(...args);
    }
  }
  await attempt(async runId => ({ suite: readTerminalProjectCheckSuite({ ...modelExact, runId }, failed.id)!,
    logicalArtifactHash: failure.exact.artifact.snapshot.manifest.hash }),
  new ProjectCheckRunService(new InterruptRecoveryWrite({ root: modelStore.root }), failure.coordinator));
  assert.equal(interruptedWrites, 1);
  record('exact intent, actor, missing/corrupt child, artifact/late authority drift, revoked proof and recovery-write failures preserve prepared parent bytes');

  const timeoutCoordinator = new SharedSourceCoordinator({ directory: failure.registry, waitMs: 50, pollMs: 5 });
  cleanup.push(() => timeoutCoordinator.close());
  const timeoutRecovery = new ProjectCheckRunService(modelStore, timeoutCoordinator);
  let releaseBlock!: () => void;
  const blocked = new Promise<void>(resolve => { releaseBlock = resolve; });
  let blockerEntered = false;
  const blocking = failure.observer.run([failure.key], { actor: 'fixture-blocker', operation: 'recovery-timeout' }, async () => {
    blockerEntered = true;
    await blocked;
  });
  void blocking.catch(() => {});
  try {
    await until(() => blockerEntered ? true : undefined, 'recovery queue blocker');
    let enteredRecovery = false;
    const queued = await timeoutRecovery.start(modelInput, neverExecute, async () => { enteredRecovery = true; return undefined; });
    assert.equal(queued.state, 'queued');
    await assert.rejects(timeoutRecovery.start({ ...modelInput, operationId: 'different-while-repairing' }, neverExecute),
      { code: 'PROJECT_CHECK_RUN_BUSY' });
    await until(() => timeoutRecovery.status(actorId, workspaceId, modelParent.id).state === 'pending-recovery' ? true : undefined, 'bounded recovery queue timeout');
    assert.equal(enteredRecovery, false);
    assert.deepEqual(fs.readFileSync(modelStore.pathFor(modelParent.id)), modelBefore);
  } finally { releaseBlock(); await blocking; }
  await modelService.start(modelInput, neverExecute, async runId => ({
    suite: readTerminalProjectCheckSuite({ ...modelExact, runId }, failed.id)!, logicalArtifactHash: failure.exact.artifact.snapshot.manifest.hash,
  }));
  await until(() => modelService.status(actorId, workspaceId, modelParent.id).state === 'failed' ? true : undefined, 'failed terminal suite recovery');
  assert.equal(modelService.status(actorId, workspaceId, modelParent.id).suiteReport?.state, 'failed');
  assert.equal(replays, 0);
  record('a real SQLite queue timeout enters no recovery callback; occupied-slot refusal and subsequent failed-suite reconciliation never execute again');

  const incompleteFixture = fixture('recover-incomplete', [['omega', 'pass']], interpreter);
  class InterruptIncompleteParent extends ActionReceiptStore {
    override transition(...args: Parameters<ActionReceiptStore['transition']>) {
      const capability = this.read(args[0]).capability;
      if ('id' in capability && capability.id === 'project-check.run') {
        throw new Error('Fixture stops before incomplete parent write.');
      }
      return super.transition(...args);
    }
  }
  const incompleteStore = new InterruptIncompleteParent({ root: incompleteFixture.store.root });
  const interruptedIncomplete = new ProjectCheckRunService(incompleteStore, incompleteFixture.coordinator);
  const incompleteInput = { actorId, workspaceId, modId, operationId: 'recover-incomplete', sourceKey: incompleteFixture.key,
    artifactHash: incompleteFixture.exact.artifact.snapshot.manifest.hash, requestHash: createHash('sha256').update('recover-incomplete').digest('hex') };
  const incompleteRun = await interruptedIncomplete.start(incompleteInput, async (lease, runId) => {
    incompleteFixture.exact.runId = runId;
    const suite = await executeProjectCheckSuite({ ...incompleteFixture.exact, store: incompleteStore,
      lease: { ...lease, assertProjectCheckDrained(frame) { lease.assertProjectCheckDrained(frame); throw new Error('Fixture loses confirmed acknowledgement.'); } } });
    return { suite, logicalArtifactHash: incompleteFixture.exact.artifact.snapshot.manifest.hash };
  });
  await until(() => interruptedIncomplete.status(actorId, workspaceId, incompleteRun.id).state === 'pending-recovery' ? true : undefined, 'interrupted incomplete parent');
  const incompleteResume = new ProjectCheckRunService(incompleteFixture.store, incompleteFixture.coordinator);
  await incompleteResume.start(incompleteInput, neverExecute, async runId => ({
    suite: readTerminalProjectCheckSuite({ ...incompleteFixture.exact, runId }, projectCheckSuiteReceiptId(actorId, workspaceId, runId))!,
    logicalArtifactHash: incompleteFixture.exact.artifact.snapshot.manifest.hash,
  }));
  await until(() => incompleteResume.status(actorId, workspaceId, incompleteRun.id).suiteReport?.state === 'incomplete' ? true : undefined, 'incomplete terminal suite repair');
  assert.equal(incompleteResume.status(actorId, workspaceId, incompleteRun.id).suiteReceipt, undefined);
  assert.equal(replays, 0);
  const missingInput = { ...incompleteInput, operationId: 'recover-no-suite',
    requestHash: createHash('sha256').update('recover-no-suite').digest('hex') };
  let originalAttempts = 0;
  const missingRun = await interruptedIncomplete.start(missingInput, async () => {
    originalAttempts++;
    throw new Error('Fixture backend stops before suite preparation.');
  });
  await until(() => interruptedIncomplete.status(actorId, workspaceId, missingRun.id).state === 'pending-recovery' ? true : undefined, 'orphan with no suite');
  await incompleteResume.start(missingInput, neverExecute, async runId => {
    const suiteId = projectCheckSuiteReceiptId(actorId, workspaceId, runId);
    assert.equal(readTerminalProjectCheckSuite({ ...incompleteFixture.exact, runId }, suiteId), undefined);
    return undefined;
  });
  await until(() => incompleteResume.status(actorId, workspaceId, missingRun.id).state === 'incomplete' ? true : undefined, 'missing suite incomplete repair');
  assert.equal(incompleteResume.status(actorId, workspaceId, missingRun.id).suiteReceipt, undefined);
  assert.equal(originalAttempts, 1);
  assert.equal(replays, 0);
  incompleteFixture.retireInputs();
  record('terminal incomplete and genuinely absent suites reconcile without passing proof, replay or loss of named incomplete evidence');

  await nativeStagingAdapters(fixture('native-adapters', [['probe', 'pass']], interpreter));
  await until(() => retained.some(unresolved => unresolved()) ? undefined : true, 'every fixture source claim to become quiescent');
  const orphanRoots = [interrupted, abandoned].flatMap(f => f.coordinator.projectCheckStages().map(stage => stage.root));
  const crashStaging = { roots: orphanRoots.length, bytes: 0, entries: 0,
      cleanupOwner: 'owned snapshot/freezer materializers and durable journal filesystem retire function; adapter evidence is separately source-extracted',
    retired: 0, remaining: -1, repeatedCrashRoots: 0, retirementBackendExit: 0 };
  const stagePending = [...orphanRoots];
  while (stagePending.length) {
    const directory = stagePending.pop()!;
    assert.equal(fs.realpathSync.native(directory).toLowerCase(), path.resolve(directory).toLowerCase());
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink());
      crashStaging.entries++;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) stagePending.push(file);
      else crashStaging.bytes += fs.lstatSync(file).size;
    }
  }
  assert.equal(crashStaging.roots, 4);
  assert(crashStaging.bytes < footprintLimit.bytes && crashStaging.entries < footprintLimit.entries);
  for (const f of [interrupted, abandoned]) {
    crashStaging.retired += retireAbandonedProjectCheckStages(f.coordinator, { sourceKey: f.key, actorId, workspaceId }, [f.scratch]);
    assert.equal(f.coordinator.projectCheckStages().length, 0);
    assert.equal(retireAbandonedProjectCheckStages(f.coordinator, { sourceKey: f.key, actorId, workspaceId }, [f.scratch]), 0);
  }
  assert.equal(crashStaging.retired, 4); assert(orphanRoots.every(root => !fs.existsSync(root)));
  crashStaging.remaining = 0;
  // Another real backend death on the same fixture uses a new operation ID,
  // then the same product sweep retires its two roots without retaining a family.
  const repeatedCrash = crashBackend(interrupted, 'finish', '-repeat');
  assert.equal(interrupted.store.read(repeatedCrash.id).status, 'prepared');
  const repeatedRoots = interrupted.coordinator.projectCheckStages().map(stage => stage.root);
  assert.equal(repeatedRoots.length, 2); crashStaging.repeatedCrashRoots = repeatedRoots.length;
  crashRetirementBackend(interrupted); crashStaging.retirementBackendExit = 75;
  const quarantineRoots = interrupted.coordinator.projectCheckStages().flatMap(stage => stage.quarantineRoot ? [stage.quarantineRoot] : []);
  assert.equal(retireAbandonedProjectCheckStages(interrupted.coordinator, { sourceKey: interrupted.key, actorId, workspaceId }, [interrupted.scratch]), 2);
  assert(repeatedRoots.every(root => !fs.existsSync(root))); assert.equal(interrupted.coordinator.projectCheckStages().length, 0);
  assert(quarantineRoots.every(root => !fs.existsSync(root)));
  record('owned snapshot/freezer stages refuse live-Job cleanup and retire4->0, then another backend and a retirement backend exit75 recover2->0 including durable quarantine without harness recursion');

  meterFixture();
  console.log(JSON.stringify({ status: 'passed', realWindowsProcesses: true, fixtureOwnerApproval: true, checks,
    observedPeakFootprint: peakFootprint, footprintLimit, crashStaging }));
  }
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
