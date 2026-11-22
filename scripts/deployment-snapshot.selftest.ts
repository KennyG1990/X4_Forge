import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { artifactPlanIdentity, buildArtifactPlan, buildArtifactPlanWithDiskIdentity, hashArtifactFile, materializeArtifact, readVerifiedArtifactFile } from '../src/lib/artifactPipeline';
import { captureDeploymentSnapshot } from '../src/server/deploymentSnapshot';
import { buildValidationEvidence } from '../src/lib/validationEvidence';
import { PROJECT_CHECKS_MAX_BYTES, PROJECT_CHECKS_PATH } from '../src/server/projectCheckProposal';
import { PROJECT_RULES_MAX_BYTES, PROJECT_RULES_PATH } from '../src/lib/projectRules';
import { ActionReceiptStore } from '../src/lib/actionReceiptStore';
import { AgentHistoryStore } from '../src/lib/agentHistoryStore';
import { readDeployManagedEvidence, storeDeployManagedEvidence } from '../src/server/deployManagedEvidence';
import { observeManagedOutputs } from '../src/server/deployManagedObservation';
import { redactReceiptMetadata } from '../src/lib/actionReceipt';
import { DestructiveRecoveryStore } from '../src/lib/destructiveRecovery';
import { evaluateFindingAcceptances } from '../src/server/findingAcceptance';
import { prepareDeployRecord, commitDeployRecord, deployOperationStatus, deployReceiptIdentity, readDeployOperationStatus, compareDeployPreviewTarget, deploymentBuildIdentity, findUnchangedDeploymentVersion } from '../src/server/deploymentTrust';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-snapshot-test-'));
let assertions = 0;
const check = (name: string, value: unknown) => { assert.ok(value, name); assertions++; };
try {
  const verifiedReadRoot = path.join(root, 'verified-artifact-reads');
  fs.mkdirSync(verifiedReadRoot);
  const verifiedReadCases = [
    { name: 'empty', bytes: Buffer.alloc(0),
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
    { name: 'small', bytes: Buffer.from('hello world', 'utf8'),
      sha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9' },
    { name: 'multi-chunk', bytes: Buffer.alloc(1024 * 1024 + 257, 0x50),
      sha256: 'd01b53c826134fe8f33f60ed799ec2f6965a7da793f570f0187c264efa4d8878' },
  ];
  for (const fixture of verifiedReadCases) {
    const file = path.join(verifiedReadRoot, fixture.name);
    fs.writeFileSync(file, fixture.bytes);
    assert.deepEqual(readVerifiedArtifactFile(file, { size: fixture.bytes.length, sha256: fixture.sha256 },
      fixture.bytes.length), fixture.bytes, 'verified exact ' + fixture.name + ' bytes'); assertions++;
  }
  const staticSmallFile = path.join(verifiedReadRoot, 'small');
  const staticSmallHash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
  for (const size of [10, 12]) {
    assert.throws(() => readVerifiedArtifactFile(staticSmallFile, { size, sha256: staticSmallHash }, 12),
      /Artifact file changed before reading\./, 'fixed declared length mismatch'); assertions++;
  }
  assert.throws(() => readVerifiedArtifactFile(staticSmallFile, { size: 11, sha256: '0'.repeat(64) }, 11),
    /Artifact file hash does not match the manifest\./, 'fixed wrong digest'); assertions++;
  assert.throws(() => readVerifiedArtifactFile(staticSmallFile, { size: 12, sha256: '0'.repeat(64) }, 11),
    /Artifact file size is outside the read limit\./, 'declared oversize refuses before reading'); assertions++;

  const exactTextInputs: Record<string, string> = {
    'content.xml': '\uFEFF<content id="verified_read_fixture" name="Verified 雪 🚀" version="100"/>\r\n',
    'md/Verified.xml': '\uFEFF<mdscript name="Verified"><cues><cue name="Probe"><actions><debug_text text="\'雪 🚀\'"/></actions></cue></cues></mdscript>\r\n',
    'checks/verify.lua': '\uFEFF-- 雪 🚀\r\nreturn true\r\n',
    [PROJECT_CHECKS_PATH]: '\uFEFF{"version":1,"checks":[{"id":"verified_read","script":"checks/verify.lua","args":[],"dependencies":[],"covers":["md/Verified.xml"],"timeoutSeconds":1}]}',
    [PROJECT_RULES_PATH]: '\uFEFF{"version":1,"suppressions":[]}',
  };
  const exactTextSnapshot = captureDeploymentSnapshot(buildArtifactPlan({
    sourceRoot: '', memoryOnly: true, generatedFiles: exactTextInputs,
  }), 'loose');
  try {
    for (const [file, content] of Object.entries(exactTextInputs)) {
      assert.equal(exactTextSnapshot.files.find(entry => entry.path === file)?.content, content,
        'snapshot retains exact BOM and UTF-8 for ' + file); assertions++;
      check('snapshot marks verified text for ' + file,
        exactTextSnapshot.manifest.files.find(entry => entry.path === file)?.validation === 'text');
    }
    check('checks manifest keeps its special metadata kind',
      exactTextSnapshot.files.find(entry => entry.path === PROJECT_CHECKS_PATH)?.kind === 'other');
    check('exact text snapshot has no semantic skip', exactTextSnapshot.skipped.length === 0);
    assert.doesNotThrow(exactTextSnapshot.assertIntegrity); assertions++;
  } finally { exactTextSnapshot.dispose(); }
  const limitedChecksSnapshot = captureDeploymentSnapshot(buildArtifactPlan({
    sourceRoot: '', memoryOnly: true,
    generatedFiles: { ...exactTextInputs, [PROJECT_CHECKS_PATH]: Buffer.alloc(PROJECT_CHECKS_MAX_BYTES + 1, 0x20) },
  }), 'loose');
  try {
    check('checks manifest above its own limit stays byte-preserved but unavailable',
      limitedChecksSnapshot.files.find(entry => entry.path === PROJECT_CHECKS_PATH)?.content === undefined
      && limitedChecksSnapshot.manifest.files.find(entry => entry.path === PROJECT_CHECKS_PATH)?.validation === 'unavailable'
      && limitedChecksSnapshot.plan.entries.find(entry => entry.path === PROJECT_CHECKS_PATH)?.size === PROJECT_CHECKS_MAX_BYTES + 1);
    assert.doesNotThrow(limitedChecksSnapshot.assertIntegrity); assertions++;
  } finally { limitedChecksSnapshot.dispose(); }
  assert.throws(() => captureDeploymentSnapshot(buildArtifactPlan({
    sourceRoot: '', memoryOnly: true,
    generatedFiles: { ...exactTextInputs, [PROJECT_RULES_PATH]: Buffer.alloc(PROJECT_RULES_MAX_BYTES + 1, 0x20) },
  }), 'loose'), /invalid validation rules/, 'rules above their own limit fail closed'); assertions++;


  const jointRoot = path.join(root, 'joint-observation');
  fs.mkdirSync(jointRoot);
  const overlaidPath = path.join(jointRoot, 'overlay.xml');
  fs.writeFileSync(overlaidPath, '<before/>');
  fs.writeFileSync(path.join(jointRoot, 'passthrough.lua'), 'return 1');
  fs.writeFileSync(path.join(jointRoot, 'loose.bin'), Buffer.from([0, 1, 255]));
  fs.writeFileSync(path.join(jointRoot, 'ignored.lua'), 'return 1');
  fs.writeFileSync(path.join(jointRoot, 'runtime.lua'), 'return 2');
  fs.writeFileSync(path.join(jointRoot, '.forgeartifact.json'), JSON.stringify({
    exclude: ['ignored.lua'], runtimeOwned: ['runtime.lua'], catalogLoose: ['loose.bin'],
  }));
  const jointInput = { sourceRoot: jointRoot, generatedFiles: { 'overlay.xml': '<emitted/>' },
    passthroughFiles: { 'passthrough.lua': 'return 3' } };
  for (const format of ['loose', 'catalog'] as const) {
    const selected = buildArtifactPlanWithDiskIdentity(jointInput, format);
    assert.deepEqual(selected.plan, buildArtifactPlan(jointInput)); assertions++;
    check(`same original disk identity in ${format}`,
      selected.diskIdentity === artifactPlanIdentity(buildArtifactPlan({ sourceRoot: jointRoot }), format));
  }
  const baseline = buildArtifactPlanWithDiskIdentity(jointInput, 'loose');
  const original = fs.statSync(overlaidPath);
  fs.writeFileSync(overlaidPath, '<change/>');
  fs.utimesSync(overlaidPath, original.atime, original.mtime);
  const overlaidEdit = buildArtifactPlanWithDiskIdentity(jointInput, 'loose');
  check('same-size edit hidden by the selected output still changes the disk identity',
    artifactPlanIdentity(overlaidEdit.plan, 'loose') === artifactPlanIdentity(baseline.plan, 'loose')
    && overlaidEdit.diskIdentity !== baseline.diskIdentity);
  fs.writeFileSync(path.join(jointRoot, 'added.xml'), '<added/>');
  const added = buildArtifactPlanWithDiskIdentity(jointInput, 'loose');
  check('new disk file appears in both identities', added.plan.entries.some(entry => entry.path === 'added.xml')
    && added.diskIdentity === artifactPlanIdentity(buildArtifactPlan({ sourceRoot: jointRoot }), 'loose')
    && added.diskIdentity !== overlaidEdit.diskIdentity);
  fs.unlinkSync(path.join(jointRoot, 'loose.bin'));
  const removed = buildArtifactPlanWithDiskIdentity(jointInput, 'loose');
  check('removed disk file is absent from both identities', !removed.plan.entries.some(entry => entry.path === 'loose.bin')
    && removed.diskIdentity === artifactPlanIdentity(buildArtifactPlan({ sourceRoot: jointRoot }), 'loose')
    && removed.diskIdentity !== added.diskIdentity);
  const memoryInput = { sourceRoot: '', memoryOnly: true, generatedFiles: { 'content.xml': '<content id="lab"/>' } };
  assert.deepEqual(buildArtifactPlanWithDiskIdentity(memoryInput, 'loose'), {
    plan: buildArtifactPlan(memoryInput), diskIdentity: null,
  }); assertions++;

  const observed = path.join(root, 'observed-file');
  fs.writeFileSync(observed, 'original bytes');
  const observedStamp = fs.lstatSync(observed, { bigint: true });
  check('guarded artifact digest equals the canonical digest', hashArtifactFile(observed, 'sha256', observedStamp) === hashArtifactFile(observed));
  fs.writeFileSync(observed, 'other bytes');
  assert.throws(() => hashArtifactFile(observed, 'sha256', observedStamp), /changed before reading/); assertions++;
  fs.writeFileSync(observed, '');
  check('guarded zero-byte file keeps the canonical digest',
    hashArtifactFile(observed, 'sha256', fs.lstatSync(observed, { bigint: true })) === hashArtifactFile(observed));
  const source = path.join(root, 'source'); fs.mkdirSync(source);
  fs.mkdirSync(path.join(source, 'support'));
  fs.writeFileSync(path.join(source, 'content.xml'), '<content id="lab" name="Lab" version="100" date="2026-11-08"/>');
  fs.writeFileSync(path.join(source, 'support/probe.lua'), '--' + 'P'.repeat(300000) + '\nlocal broken = )');
  fs.writeFileSync(path.join(source, 'excluded.lua'), 'local invalid = )');
  fs.writeFileSync(path.join(source, 'binary.bin'), Buffer.from([0, 255, 128]));
  const plan = buildArtifactPlan({ sourceRoot: source, rules: { exclude: ['excluded.lua'] }, generatedFiles: { 'generated.lua': 'return true' } });
  const scratchParent = fs.realpathSync.native(os.tmpdir());
  const snapshotMembers = () => fs.readdirSync(scratchParent).filter(entry => entry.startsWith('x4forge-deploy-snapshot-')).sort();
  const membersBefore = snapshotMembers();
  const copy = fs.copyFileSync;
  let copies = 0;
  const scratchFailure = (errno: string, dest: string) => Object.assign(new Error('synthetic storage error'), { code: errno, dest });
  const isScratchSpaceRefusal = (error: unknown) => {
    const refusal = error as { code?: string; storage?: { errno?: string; directory?: string; payloadBytes?: number } };
    return refusal.code === 'DEPLOY_SNAPSHOT_NO_SPACE' && refusal.storage?.errno === 'ENOSPC'
      && refusal.storage.directory === scratchParent && refusal.storage.payloadBytes === plan.totals.includedBytes;
  };
  fs.copyFileSync = (from, to, mode) => {
    if (++copies === 2) throw scratchFailure('ENOSPC', String(to));
    copy(from, to, mode);
  };
  try {
    assert.throws(() => captureDeploymentSnapshot(plan, 'loose'), isScratchSpaceRefusal); assertions++;
    check('typed copy failure followed one successful write', copies === 2);
    assert.deepEqual(snapshotMembers(), membersBefore); assertions++;
  } finally { fs.copyFileSync = copy; }
  const allocate = fs.mkdtempSync;
  fs.mkdtempSync = ((prefix: Parameters<typeof fs.mkdtempSync>[0]) => {
    throw scratchFailure('ENOSPC', String(prefix));
  }) as typeof fs.mkdtempSync;
  try {
    assert.throws(() => captureDeploymentSnapshot(plan, 'loose'), isScratchSpaceRefusal); assertions++;
    assert.deepEqual(snapshotMembers(), membersBefore); assertions++;
  } finally { fs.mkdtempSync = allocate; }
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, data, options) => {
    if (String(file).endsWith('generated.lua')) throw scratchFailure('ENOSPC', String(file));
    write(file, data, options);
  };
  const statfs = fs.statfsSync;
  fs.statfsSync = (() => { throw new Error('storage sample unavailable'); }) as typeof fs.statfsSync;
  try {
    assert.throws(() => captureDeploymentSnapshot(plan, 'catalog'), (error: unknown) => isScratchSpaceRefusal(error)
      && !('availableBytes' in (error as { storage: object }).storage)); assertions++;
    assert.deepEqual(snapshotMembers(), membersBefore); assertions++;
  } finally { fs.writeFileSync = write; fs.statfsSync = statfs; }
  fs.copyFileSync = (_from, to) => { throw scratchFailure('EACCES', String(to)); };
  try {
    assert.throws(() => captureDeploymentSnapshot(plan, 'loose'), { code: 'DEPLOY_SNAPSHOT_FAILED' }); assertions++;
    assert.deepEqual(snapshotMembers(), membersBefore); assertions++;
  } finally { fs.copyFileSync = copy; }
  fs.copyFileSync = () => { throw scratchFailure('ENOSPC', path.resolve(scratchParent, '..', 'outside-snapshot')); };
  try {
    assert.throws(() => captureDeploymentSnapshot(plan, 'loose'), { code: 'DEPLOY_SNAPSHOT_FAILED' }); assertions++;
    assert.deepEqual(snapshotMembers(), membersBefore); assertions++;
  } finally { fs.copyFileSync = copy; }
  const remove = fs.rmSync;
  let retained: string | undefined;
  fs.copyFileSync = (_from, to) => { throw scratchFailure('EDQUOT', String(to)); };
  fs.rmSync = (file, options) => {
    const child = String(file);
    if (path.dirname(child) === scratchParent && path.basename(child).startsWith('x4forge-deploy-snapshot-')) {
      retained = child;
      throw new Error('synthetic cleanup refusal');
    }
    remove(file, options);
  };
  try {
    assert.throws(() => captureDeploymentSnapshot(plan, 'loose'), (error: unknown) => {
      const refusal = error as { code?: string; storage?: { errno?: string; cleanupIncomplete?: boolean } };
      return refusal.code === 'DEPLOY_SNAPSHOT_NO_SPACE' && refusal.storage?.errno === 'EDQUOT'
        && refusal.storage.cleanupIncomplete === true;
    }); assertions++;
    check('primary capacity refusal is preserved even if owned cleanup fails', retained && fs.existsSync(retained));
  } finally {
    fs.copyFileSync = copy;
    fs.rmSync = remove;
    if (retained) {
      assert.equal(fs.realpathSync.native(retained), retained);
      remove(retained, { recursive: true });
    }
  }
  assert.deepEqual(snapshotMembers(), membersBefore); assertions++;
  const snapshot = captureDeploymentSnapshot(plan, 'loose');
  const canonicalTarget = `source:${path.join(root, 'extensions', 'lab_alias')}`;
  const build = deploymentBuildIdentity(snapshot, canonicalTarget);
  assert.ok(build);
  try {
    check('build fields come from the frozen manifest', build.modId === 'lab' && build.modVersion === '100' && build.modDate === '2026-11-08');
    const catalog = captureDeploymentSnapshot(plan, 'catalog');
    try {
      check('logical build identity is independent of output format',
        deploymentBuildIdentity(catalog, canonicalTarget)?.logicalPayloadHash === build.logicalPayloadHash);
    } finally { catalog.dispose(); }
    check('exact logical plan identity', snapshot.manifest.hash === artifactPlanIdentity(plan, 'loose'));
    check('excluded source not validated', !snapshot.files.some(f => f.path === 'excluded.lua'));
    check('disk-only Lua outside old path allowlist validated', snapshot.files.some(f => f.path === 'support/probe.lua' && f.content.endsWith('local broken = )')));
    check('binary coverage honest', snapshot.manifest.files.find(f => f.path === 'binary.bin')?.validation === 'bytes-only');
    check('generated bytes included', snapshot.files.find(f => f.path === 'generated.lua')?.content === 'return true');
    fs.writeFileSync(path.join(source, 'support/probe.lua'), 'return "changed"');
    check('source change cannot alter frozen input', snapshot.files.find(f => f.path === 'support/probe.lua')!.content.length > 300000);
    const packaged = materializeArtifact(snapshot.plan, path.join(root, 'deployed'));
    check('packaging reads the same snapshot bytes', packaged.ok && fs.readFileSync(path.join(root, 'deployed/support/probe.lua'), 'utf8') === snapshot.files.find(f => f.path === 'support/probe.lua')!.content);
    const snapshotFile = snapshot.plan.entries.find(e => e.path === 'generated.lua')!.sourcePath!;
    fs.writeFileSync(snapshotFile, 'return false');
    assert.throws(snapshot.assertIntegrity, /snapshot changed/); assertions++;
  } finally { snapshot.dispose(); }
  const changed = buildArtifactPlan({ sourceRoot: source });
  fs.writeFileSync(path.join(source, 'binary.bin'), Buffer.from([0, 255, 129]));
  assert.throws(() => captureDeploymentSnapshot(changed, 'loose'), /snapshot refused/); assertions++;
  fs.writeFileSync(path.join(source, 'huge.lua'), '--' + 'Q'.repeat(4 * 1024 * 1024));
  const bounded = captureDeploymentSnapshot(buildArtifactPlan({ sourceRoot: source }), 'catalog');
  try {
    check('oversize semantic gap explicit', bounded.skipped.some(s => s.path === 'huge.lua') && bounded.manifest.files.find(f => f.path === 'huge.lua')?.validation === 'unavailable');
    check('catalog logical identity', bounded.manifest.format === 'catalog' && bounded.plan.entries.some(e => e.path === 'huge.lua'));
  } finally { bounded.dispose(); }
  fs.writeFileSync(path.join(source, 'forge.rules.json'), ' '.repeat(4 * 1024 * 1024 + 1));
  assert.throws(() => captureDeploymentSnapshot(buildArtifactPlan({ sourceRoot: source }), 'loose'), /invalid validation rules/); assertions++;
  const store = new ActionReceiptStore({ root: path.join(root, 'receipts') });
  const evidence = buildValidationEvidence({ id: 'lab', name: 'Lab', files: [{ path: 'content.xml', kind: 'content', content: '<content id="lab" version="100"/>' }] }, []);
  const subject = { evidence, artifactHash: 'a'.repeat(64), validatorHash: 'b'.repeat(64), corpusHash: 'c'.repeat(64), targetHash: 'd'.repeat(64) };
  const principal = { kind: 'agent' as const, id: 'key_snapshot_test', label: 'Snapshot test', scope: 'deploy' as const, deployAuthorized: true };
  const decision = evaluateFindingAcceptances(subject, [], principal);
  const recovery = new DestructiveRecoveryStore({ root: path.join(root, 'recovery') });
  const prepared = prepareDeployRecord(store, subject, decision, principal, [], 'recovery_snapshot_test', 'lab_alias', 'absent',
    artifactPlanIdentity(plan, 'loose'), undefined, undefined, undefined, build);
  check('legacy prepared receipt has unknown write outcome', deployOperationStatus(prepared, recovery).outcome === 'unknown');
  const targetRoot = path.join(root, 'extensions');
  const before = recovery.prepareDeployment({ priorExisted: false, targetRoot, targetPath: path.join(targetRoot, 'lab'),
    modId: 'lab', beforeFingerprint: 'absent', beforeBytes: 0, summary: 'Test deployment', trackWriteAdmission: true });
  const operation = deployReceiptIdentity(principal, { workspaceId: 'ws_111111111111111111111111', operationId: 'test-write-admission' });
  const tracked = prepareDeployRecord(store, subject, decision, principal, [], before.id, before.modId, before.beforeFingerprint,
    artifactPlanIdentity(plan, 'loose'), operation, undefined, before, build);
  check('live prepared owner has unknown write outcome', deployOperationStatus(tracked, recovery).outcome === 'unknown');
  assert.throws(() => recovery.admitDeploymentWrite({ ...before, beforeBytes: 1 }), /no longer matches/); assertions++;
  const rename = fs.renameSync;
  const recoveryFile = path.join(recovery.root, before.id, 'record.json');
  fs.renameSync = (from, to) => {
    if (to === recoveryFile) throw new Error('Test write admission rename failure');
    rename(from, to);
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => recovery.admitDeploymentWrite(before), /Test write admission rename failure/); assertions++;
    const pending = recovery.read(before.id);
    check('failed write admission leaves the pending record and target untouched', pending.ok && pending.record.kind === 'deploy'
      && pending.record.writeAdmission?.phase === 'pending-v1' && !fs.existsSync(targetRoot));
  } finally {
    fs.renameSync = rename;
    syncBuiltinESMExports();
  }
  const admitted = recovery.admitDeploymentWrite(before);
  const readAdmission = recovery.read(before.id);
  check('write admission persisted before any target write', readAdmission.ok && readAdmission.record.kind === 'deploy'
    && readAdmission.record.writeAdmission?.phase === 'started-v1' && !fs.existsSync(targetRoot));
  check('admitted prepared receipt has unknown write outcome', deployOperationStatus(tracked, recovery).outcome === 'unknown');
  assert.throws(() => recovery.recordStagedDeployment(before, tracked.hash, 'e'.repeat(64)), /Invalid staged/); assertions++;
  const stagedRecord = recovery.recordStagedDeployment(admitted, tracked.hash, 'e'.repeat(64));
  const staged = recovery.read(before.id);
  check('staged fingerprint and receipt hash persist before target activation', staged.ok && staged.record.kind === 'deploy'
    && staged.record.stagedEvidence?.preparedReceiptHash === tracked.hash
    && staged.record.stagedEvidence.fingerprint === 'e'.repeat(64) && !fs.existsSync(targetRoot));
  check('live owner cannot project staged evidence', !('reconciliation' in deployOperationStatus(tracked, recovery)));
  assert.throws(() => recovery.recordStagedDeployment(admitted, tracked.hash, 'f'.repeat(64)), /no longer matches/); assertions++;
  if (staged.ok && staged.record.kind === 'deploy' && staged.record.stagedEvidence) {
    fs.writeFileSync(recoveryFile, JSON.stringify({ ...staged.record,
      stagedEvidence: { ...staged.record.stagedEvidence, fingerprint: 'f'.repeat(64) } }));
  }
  check('changed staged fingerprint invalidates the record', !recovery.read(before.id).ok
    && !('reconciliation' in deployOperationStatus(tracked, recovery)));
  assert.throws(() => recovery.admitDeploymentWrite(before), /no longer matches/); assertions++;
  fs.writeFileSync(recoveryFile, JSON.stringify(stagedRecord));
  assert.throws(() => recovery.finalizeVerifiedDeployment(stagedRecord, 'f'.repeat(64)), /does not match its staged evidence/); assertions++;
  const verified = recovery.finalizeVerifiedDeployment(stagedRecord, 'e'.repeat(64));
  const reopenedRecovery = recovery.read(before.id);
  check('verified finalization reopens the exact ready recovery with bound postchecks',
    reopenedRecovery.ok && reopenedRecovery.record.kind === 'deploy' && reopenedRecovery.record.status === 'ready'
    && reopenedRecovery.record.expectedCurrentHash === 'e'.repeat(64) && !!verified.postcheckEvidence
    && reopenedRecovery.record.postcheckEvidence?.hash === verified.postcheckEvidence.hash);
  check('live owner does not project historical postchecks', !('postchecks' in deployOperationStatus(tracked, recovery)));
  assert.throws(() => recovery.finalizeVerifiedDeployment(stagedRecord, 'e'.repeat(64)), /no longer matches/); assertions++;
  fs.writeFileSync(recoveryFile, JSON.stringify({ ...verified,
    postcheckEvidence: { ...verified.postcheckEvidence, checkedAt: '2000-01-01T00:00:00.000Z' } }));
  check('changed postcheck timestamp invalidates the recovery', !recovery.read(before.id).ok);
  recovery.abandon(before.id);
  assert.throws(() => recovery.admitDeploymentWrite(before), /no longer matches/); assertions++;
  check('missing recovery keeps prepared outcome unknown', deployOperationStatus(tracked, recovery).outcome === 'unknown');
  const trackedCommit = commitDeployRecord(store, tracked, 'e'.repeat(64));
  const tryRead = store.tryRead.bind(store);
  let statusReads = 0;
  store.tryRead = id => ++statusReads === 1 ? { ok: true, receipt: tracked } : tryRead(id);
  try {
    const status = readDeployOperationStatus(store, recovery, operation);
    check('status prefers the exact terminal receipt over its initial prepared read',
      statusReads === 2 && status?.outcome === 'committed' && status.receipt.hash === trackedCommit.hash);
  } finally {
    store.tryRead = tryRead;
  }
  const previewEvidence = { outcome: 'unknown' as const, reconciliation: {
    targetBindingHash: subject.targetHash, beforeTargetFingerprint: 'absent', stagedTargetFingerprint: 'e'.repeat(64),
  } };
  const compare = (fingerprint: string, binding = subject.targetHash) => compareDeployPreviewTarget(previewEvidence, binding, fingerprint);
  check('fresh preview matches an absent original target', compare('absent').targetState === 'matches-before');
  check('fresh preview matches the staged target without promoting the history',
    compare('e'.repeat(64)).targetState === 'matches-staged' && compare('e'.repeat(64)).historicalOutcome === 'unknown');
  check('fresh preview sees unrelated target bytes', compare('f'.repeat(64)).targetState === 'matches-neither');
  const verifiedHistory = { ...previewEvidence, postchecks: { status: 'passed' as const, checkedAt: '2000-01-01T00:00:00.000Z' } };
  const changedTarget = compareDeployPreviewTarget(verifiedHistory, subject.targetHash, 'f'.repeat(64));
  check('later bytes leave historical postchecks separate from current target and commit outcome',
    changedTarget.historicalOutcome === 'unknown' && changedTarget.targetState === 'matches-neither'
    && changedTarget.historicalPostchecks?.checkedAt === verifiedHistory.postchecks.checkedAt);
  check('binding mismatch precedes fingerprint equality', compare('absent', 'f'.repeat(64)).targetState === 'binding-mismatch');
  const identical = { ...previewEvidence, reconciliation: { ...previewEvidence.reconciliation, beforeTargetFingerprint: 'e'.repeat(64) } };
  check('fresh preview distinguishes identical prior and staged targets',
    compareDeployPreviewTarget(identical, subject.targetHash, 'e'.repeat(64)).targetState === 'matches-both');
  check('missing operation has unknown history and unavailable comparison',
    compareDeployPreviewTarget(undefined, subject.targetHash, 'absent').historicalOutcome === 'unknown'
    && compareDeployPreviewTarget(undefined, subject.targetHash, 'absent').targetState === 'unavailable');
  check('known terminal outcome does not imply current target evidence',
    compareDeployPreviewTarget({ outcome: 'committed' }, subject.targetHash, 'absent').historicalOutcome === 'committed'
    && compareDeployPreviewTarget({ outcome: 'committed' }, subject.targetHash, 'absent').targetState === 'unavailable');
  const managedRoot = path.join(root, 'installed-managed');
  const managedUi = path.join(managedRoot, 'ui');
  const managedLua = path.join(managedUi, 'probe.lua');
  const runtime = path.join(managedRoot, 'campaign.db');
  fs.mkdirSync(managedUi, { recursive: true });
  fs.writeFileSync(managedLua, 'return 1');
  fs.writeFileSync(runtime, 'first');
  const files = [{ path: 'ui/probe.lua', size: 8, sha256: hashArtifactFile(managedLua) }];
  const managedHistory = new AgentHistoryStore({ root: path.join(root, 'managed-history') });
  const managedReference = storeDeployManagedEvidence(managedHistory, 'loose', files);
  check('managed manifest reference is content-addressed and deduplicated', /^deploy-managed-v1:[a-f0-9]{64}$/.test(managedReference)
    && storeDeployManagedEvidence(managedHistory, 'loose', files) === managedReference);
  assert.deepEqual(readDeployManagedEvidence(managedHistory, managedReference), { status: 'available', format: 'loose', files }); assertions++;
  assert.deepEqual(readDeployManagedEvidence(managedHistory, undefined), { status: 'legacy' }); assertions++;
  for (const invalid of [
    [{ ...files[0], path: '../escape' }],
    [{ ...files[0], path: 'C:/escape' }],
    [{ ...files[0], path: 'ui/LPT1.lua' }],
    [files[0], { ...files[0], path: 'UI/PROBE.LUA' }],
    [files[0], { ...files[0], path: 'ui' }],
    [{ ...files[0], size: 129 * 1024 * 1024 }],
  ]) check('unsafe or out-of-budget manifest cannot verify files',
    readDeployManagedEvidence(managedHistory, storeDeployManagedEvidence(managedHistory, 'loose', invalid)).status === 'unavailable');
  const observeManaged = () => observeManagedOutputs(managedRoot, fs.lstatSync(managedRoot, { bigint: true }), files);
  assert.deepEqual(observeManaged(), {
    scope: 'managed-physical', state: 'matches-committed', checkedFiles: 1, missingPaths: [], changedPaths: [],
  }); assertions++;
  fs.writeFileSync(runtime, 'other');
  check('runtime-only drift does not taint managed-file verification', observeManaged().state === 'matches-committed');
  fs.writeFileSync(managedLua, 'return 2');
  assert.deepEqual(observeManaged(), {
    scope: 'managed-physical', state: 'differs-from-committed', checkedFiles: 1, missingPaths: [], changedPaths: ['ui/probe.lua'],
  }); assertions++;
  fs.unlinkSync(managedLua);
  fs.rmdirSync(managedUi);
  assert.deepEqual(observeManaged(), {
    scope: 'managed-physical', state: 'differs-from-committed', checkedFiles: 1, missingPaths: ['ui/probe.lua'], changedPaths: [],
  }); assertions++;
  fs.writeFileSync(managedUi, 'ordinary file replacing the ui directory');
  const blockedPaths = [
    files[0],
    { ...files[0], path: 'ui/submenu/probe.lua' },
    { path: 'campaign.db', size: fs.statSync(runtime).size, sha256: hashArtifactFile(runtime) },
  ];
  assert.deepEqual(observeManagedOutputs(managedRoot, fs.lstatSync(managedRoot, { bigint: true }), blockedPaths), {
    scope: 'managed-physical', state: 'differs-from-committed', checkedFiles: 3,
    missingPaths: ['ui/probe.lua', 'ui/submenu/probe.lua'], changedPaths: [],
  }); assertions++;

  const originalManagedLstat = fs.lstatSync;
  let managedAncestorChecks = 0;
  const replaceManagedAncestor = (...args: Parameters<typeof fs.lstatSync>) => {
    if (args[0] === managedUi && ++managedAncestorChecks === 2) {
      fs.unlinkSync(managedUi);
      fs.mkdirSync(managedUi);
    }
    return originalManagedLstat(...args);
  };
  assert.ok(Reflect.set(fs, 'lstatSync', replaceManagedAncestor));
  syncBuiltinESMExports();
  try {
    check('a changing managed ancestor cannot establish missing descendants',
      observeManagedOutputs(managedRoot, originalManagedLstat(managedRoot, { bigint: true }), blockedPaths).state === 'unavailable'
      && managedAncestorChecks === 2);
  } finally {
    assert.ok(Reflect.set(fs, 'lstatSync', originalManagedLstat));
    syncBuiltinESMExports();
  }
  const decoyLua = path.join(root, 'decoy.lua');
  fs.writeFileSync(decoyLua, 'return 1');
  fs.linkSync(decoyLua, managedLua);
  check('identical hard-linked bytes are not trusted as installed output', observeManaged().state === 'unavailable');
  fs.unlinkSync(managedLua);
  fs.writeFileSync(managedLua, 'return 1');
  const originalManagedRoot = fs.lstatSync(managedRoot, { bigint: true });
  fs.renameSync(managedRoot, path.join(root, 'retired-managed'));
  fs.mkdirSync(managedRoot);
  check('replaced target cannot be observed with the original root stamp',
    observeManagedOutputs(managedRoot, originalManagedRoot, files).state === 'unavailable');

  const committed = commitDeployRecord(store, prepared, 'e'.repeat(64), managedReference);
  const reopened = new ActionReceiptStore({ root: store.root }).read(committed.id);
  check('managed reference survives exact receipt reopen', reopened.after?.code === managedReference
    && readDeployManagedEvidence(new AgentHistoryStore({ root: managedHistory.root }), reopened.after.code).status === 'available');
  const managedHash = managedReference.slice('deploy-managed-v1:'.length);
  const managedBlob = path.join(managedHistory.root, 'blobs', managedHash.slice(0, 2), managedHash);
  fs.writeFileSync(managedBlob, '{}');
  check('corrupt manifest preserves the historical committed receipt',
    readDeployManagedEvidence(managedHistory, reopened.after?.code).status === 'unavailable' && store.read(committed.id).hash === committed.hash);
  fs.unlinkSync(managedBlob);
  check('retired manifest cannot imply verified current output', readDeployManagedEvidence(managedHistory, reopened.after?.code).status === 'unavailable');
  check('deploy receipt binds the actual folder and preserves the manifest ID', reopened.metadata?.modId === 'lab'
    && reopened.authority.resources[0].relativePath === 'lab_alias' && reopened.after?.resources[0].relativePath === 'lab_alias');
  check('snapshot audit hash survives durable committed readback', reopened.status === 'committed' && reopened.metadata?.validatedArtifactHash === artifactPlanIdentity(plan, 'loose'));
  check('snapshot scope retained', reopened.metadata?.validatedArtifactScope === 'logical-artifact-bytes');
  check('committed outcome survives without a recovery record', deployOperationStatus(reopened, recovery).outcome === 'committed');
  const observeCommitted = (fingerprint: string) => deployOperationStatus(reopened, recovery, (folder, binding) => {
    check('current observation receives the receipt folder and recorded binding', folder === 'lab_alias' && binding === subject.targetHash);
    return { fingerprint };
  });
  const stateFromStatus = (result: ReturnType<typeof deployOperationStatus>) =>
    'targetObservation' in result ? result.targetObservation?.targetState : undefined;
  check('ordinary committed status performs no observation', stateFromStatus(deployOperationStatus(reopened, recovery)) === undefined);
  const exactCommitted = observeCommitted('e'.repeat(64));
  check('opt-in compares current bytes to a committed receipt without recovery', exactCommitted.outcome === 'committed'
    && stateFromStatus(exactCommitted) === 'matches-committed');
  const changedCommitted = observeCommitted('f'.repeat(64));
  check('changed bytes do not erase the historical commit', changedCommitted.outcome === 'committed'
    && stateFromStatus(changedCommitted) === 'differs-from-committed');
  check('an absent child is distinct from drift or an unverified root', stateFromStatus(observeCommitted('absent')) === 'absent');
  check('bound target refusal is preserved alongside the commit', stateFromStatus(deployOperationStatus(reopened, recovery,
    () => ({ targetState: 'binding-mismatch' }))) === 'binding-mismatch');
  const noTargetRead = () => assert.fail('Insufficient evidence must not request a target observation');
  const noBinding = { ...reopened, metadata: { ...reopened.metadata, targetHash: null } };
  const wrongResource = { ...reopened, after: { ...reopened.after!, resources: reopened.after!.resources.map(resource =>
    resource.role === 'deploy' ? { ...resource, relativePath: 'elsewhere' } : resource) } };
  check('committed evidence without a target binding cannot locate a target', stateFromStatus(deployOperationStatus(noBinding, recovery, noTargetRead)) === undefined);
  check('committed evidence without the same written resource cannot locate a target', stateFromStatus(deployOperationStatus(wrongResource, recovery, noTargetRead)) === undefined);
  const summary = String(reopened.metadata?.summary);
  const prefix = 'X4 deployment build v1 ';
  check('existing receipt summary round-trips bounded build facts', summary.startsWith(prefix) && summary.length <= 512
    && JSON.parse(summary.slice(prefix.length)).date === '2026-11-08');
  const target = { folder: 'lab_alias', fingerprint: 'e'.repeat(64), legacyHashes: [subject.targetHash] };
  const editedBuild = { ...build, modVersion: '0100', logicalPayloadHash: 'f'.repeat(64) };
  check('changed payload and same numeric version uses verified installed ancestry',
    findUnchangedDeploymentVersion(editedBuild, [reopened], target)?.hash === reopened.hash);
  check('exact redeploy, version bump and nonnumeric versions do not warn',
    !findUnchangedDeploymentVersion(build, [reopened], target)
    && !findUnchangedDeploymentVersion({ ...editedBuild, modVersion: '101' }, [reopened], target)
    && !findUnchangedDeploymentVersion({ ...editedBuild, modVersion: 'rc1' }, [reopened], target));
  check('changed, absent, aliased-folder mismatch or moved target gives no ancestry',
    !findUnchangedDeploymentVersion(editedBuild, [reopened], { ...target, fingerprint: 'f'.repeat(64) })
    && !findUnchangedDeploymentVersion(editedBuild, [reopened], { ...target, fingerprint: 'absent' })
    && !findUnchangedDeploymentVersion(editedBuild, [reopened], { ...target, folder: 'another' })
    && !findUnchangedDeploymentVersion({ ...editedBuild, destinationHash: 'f'.repeat(64) }, [reopened], target));
  const later = { ...reopened, times: { ...reopened.times, committedAt: '9999-01-01T00:00:00.000Z' } };
  check('newer legacy or different manifest deployment blocks fallback to old ancestry',
    !findUnchangedDeploymentVersion(editedBuild, [reopened, { ...later, metadata: { ...later.metadata, summary: null } }], target)
    && !findUnchangedDeploymentVersion(editedBuild, [reopened, { ...later, metadata: { ...later.metadata, modId: 'other' } }], target));
  const superseded = { ...later, after: { ...later.after!, resources: later.after!.resources.map(resource =>
    ({ ...resource, hash: 'f'.repeat(64) })) } };
  check('a rollback to older matching output does not revive superseded ancestry',
    !findUnchangedDeploymentVersion(editedBuild, [reopened, superseded], target));
  check('prepared receipts and ambiguous latest timestamps cannot establish ancestry',
    !findUnchangedDeploymentVersion(editedBuild, [tracked], target)
    && !findUnchangedDeploymentVersion(editedBuild, [reopened, { ...reopened, id: `ar_${'f'.repeat(64)}` }], target));

  const prepareCommitTest = () => prepareDeployRecord(store, subject, decision, principal, [],
    'recovery_snapshot_test', 'lab', 'absent', artifactPlanIdentity(plan, 'loose'), undefined, undefined, undefined, build);
  const withCommittedReadFailure = (receiptId: string, failures: number, run: () => void) => {
    const read = fs.readFileSync;
    fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      const bytes = read(...args);
      if (args[0] === store.pathFor(receiptId) && failures > 0 && JSON.parse(bytes.toString()).status === 'committed') {
        failures--;
        throw new Error('Test committed receipt readback failure');
      }
      return bytes;
    }) as typeof fs.readFileSync;
    try { run(); }
    finally { fs.readFileSync = read; }
  };
  const transient = prepareCommitTest();
  withCommittedReadFailure(transient.id, 1, () => {
    const result = commitDeployRecord(store, transient, 'a'.repeat(64));
    check('one failed readback recovers the exact committed action', result.hash === store.read(transient.id).hash
      && result.after?.resources[0].hash === 'a'.repeat(64));
  });
  const unreadable = prepareCommitTest();
  withCommittedReadFailure(unreadable.id, Infinity, () => {
    assert.throws(() => commitDeployRecord(store, unreadable, 'b'.repeat(64)), { code: 'DEPLOY_COMMIT_OUTCOME_UNKNOWN' }); assertions++;
  });
  check('unreadable result can later resolve from the durable committed record', store.read(unreadable.id).status === 'committed');
  const unpublished = prepareCommitTest();
  fs.renameSync = (from, to) => {
    if (to === store.pathFor(unpublished.id)) throw new Error('Test committed receipt publication failure');
    rename(from, to);
  };
  try {
    assert.throws(() => commitDeployRecord(store, unpublished, 'c'.repeat(64)), { code: 'RECEIPT_STORE_WRITE_FAILED' }); assertions++;
  } finally { fs.renameSync = rename; }
  check('failed publication leaves the exact prepared record', store.read(unpublished.id).hash === unpublished.hash);
  assert.throws(() => redactReceiptMetadata({ arbitraryUnreviewedField: 'not allowed' }), /narrow safe metadata policy/); assertions++;
  console.log(JSON.stringify({ pass: true, assertions }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
