/** Exact, content-sealed temporary lifecycle for the existing check materializers. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { hashArtifactFile } from '../lib/artifactPipeline';
import { isProjectCheckRelativeFile } from './projectCheckProposal';
import { PROJECT_CHECK_STAGE_LIMITS, type ProjectCheckStageLease, type ProjectCheckStageRecord,
  type ProjectCheckStageScope, type SharedSourceCoordinator } from './sharedSourceCoordinator';

export const PROJECT_CHECK_STAGE_MANIFEST = '.forge-stage-manifest.json';
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export interface ProjectCheckStageFile { path: string; size: number; sha256: string }
export interface ProjectCheckStageContext extends ProjectCheckStageScope { lease: ProjectCheckStageLease }
type Manifest = { version: 1; kind: 'setup' | 'snapshot'; files: ProjectCheckStageFile[] };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const identity = (stat: fs.BigIntStats) => ({ device: stat.dev.toString(), file: stat.ino.toString() });
const sameIdentity = (a: fs.BigIntStats, b: fs.BigIntStats) => a.dev === b.dev && a.ino === b.ino;
const sameFile = (a: fs.BigIntStats, b: fs.BigIntStats) => sameIdentity(a, b) && a.size === b.size
  && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && b.isFile() && b.nlink === 1n;

function manifestFor(kind: Manifest['kind'], input: readonly ProjectCheckStageFile[]) {
  if (!['setup', 'snapshot'].includes(kind) || !Array.isArray(input) || input.length > PROJECT_CHECK_STAGE_LIMITS.entries - 2) throw new Error('Invalid stage inventory.');
  const files = input.map(file => {
    if (!file || typeof file.path !== 'string' || file.path.length > 1024 || file.path === PROJECT_CHECK_STAGE_MANIFEST
      || file.path.split('/').length > 64 || !file.path.split('/').every(isProjectCheckRelativeFile)
      || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid stage file inventory.');
    return { path: file.path, size: file.size, sha256: file.sha256 };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const names = new Set<string>(); const directories = new Set<string>();
  for (const file of files) {
    const name = file.path.toLowerCase(); if (names.has(name)) throw new Error('Colliding stage inventory.'); names.add(name);
    const segments = file.path.split('/'); segments.pop();
    while (segments.length) { directories.add(segments.join('/')); segments.pop(); }
  }
  if ([...directories].some(directory => names.has(directory.toLowerCase()))) throw new Error('Stage file/directory collision.');
  const manifest: Manifest = { version: 1, kind, files };
  const bytes = Buffer.from(JSON.stringify(manifest));
  const entries = 2 + directories.size + files.length;
  const totalBytes = files.reduce((total, file) => total + file.size, bytes.length);
  if (bytes.length > MAX_MANIFEST_BYTES || entries > PROJECT_CHECK_STAGE_LIMITS.entries || totalBytes > PROJECT_CHECK_STAGE_LIMITS.bytes) throw new Error('Stage inventory exceeds its reservation limit.');
  return { manifest, bytes, entries, totalBytes, directories };
}

function regularDirectory(directory: string) {
  const stamp = fs.lstatSync(directory, { bigint: true });
  if (!stamp.isDirectory() || stamp.isSymbolicLink() || fs.realpathSync.native(directory) !== directory) throw new Error('Stage directory is aliased.');
  return stamp;
}
function readManifest(root: string, record: Pick<ProjectCheckStageRecord, 'manifest' | 'kind'>) {
  if (!record.manifest) throw new Error('Legacy stage has no sealed inventory.');
  const marker = path.join(root, PROJECT_CHECK_STAGE_MANIFEST);
  const before = fs.lstatSync(marker, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size !== BigInt(record.manifest.bytes) || before.size > BigInt(MAX_MANIFEST_BYTES)) throw new Error('Stage inventory marker changed.');
  const fd = fs.openSync(marker, fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW));
  let bytes: Buffer;
  try {
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true }))) throw new Error('Stage marker changed before read.');
    bytes = Buffer.allocUnsafe(record.manifest.bytes);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!read) break;
      offset += read;
    }
    if (offset !== bytes.length) throw new Error('Stage marker became incomplete.');
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true }))) throw new Error('Stage marker changed during read.');
  } finally { fs.closeSync(fd); }
  if (!sameFile(before, fs.lstatSync(marker, { bigint: true })) || bytes.length !== record.manifest.bytes
    || digest(bytes) !== record.manifest.sha256) throw new Error('Stage marker no longer matches its durable pin.');
  const parsed = JSON.parse(bytes.toString('utf8'));
  const expected = manifestFor(parsed.kind, parsed.files);
  if (parsed.kind !== record.kind || !expected.bytes.equals(bytes)) throw new Error('Invalid sealed stage inventory.');
  return { ...expected, stamp: before };
}

function inspectTree(root: string, record: ProjectCheckStageRecord, complete: boolean, hashFiles: boolean) {
  const inventory = readManifest(root, record);
  if (inventory.totalBytes > record.bytes || inventory.entries > record.entries) throw new Error('Stage inventory exceeds durable budget.');
  const expected = new Map(inventory.manifest.files.map(file => [file.path, file]));
  const stamps = new Map<string, fs.BigIntStats>(); let count = 1; let bytes = 0; let files = 0;
  const pending = [''];
  while (pending.length) {
    const relative = pending.pop()!; const directory = path.join(root, ...relative.split('/').filter(Boolean));
    regularDirectory(directory);
    for (const name of fs.readdirSync(directory)) {
      const item = relative ? `${relative}/${name}` : name; const file = path.join(directory, name);
      const stamp = fs.lstatSync(file, { bigint: true });
      if (++count > record.entries || stamp.isSymbolicLink() || fs.realpathSync.native(file) !== file) throw new Error('Stage has an unowned or aliased entry.');
      if (stamp.isDirectory()) {
        if (!inventory.directories.has(item)) throw new Error('Stage has an unexpected directory.'); pending.push(item);
      } else {
        if (!stamp.isFile() || stamp.nlink !== 1n) throw new Error('Stage has a non-regular or hardlinked file.');
        if (item === PROJECT_CHECK_STAGE_MANIFEST) {
          if (!sameFile(inventory.stamp, stamp)) throw new Error('Stage inventory marker changed.');
        } else {
          const planned = expected.get(item);
          if (!planned || stamp.size !== BigInt(planned.size) || (hashFiles && hashArtifactFile(file, 'sha256', stamp) !== planned.sha256)
            || !sameFile(stamp, fs.lstatSync(file, { bigint: true }))) throw new Error('Stage has unknown, partial or changed bytes.');
          files++;
        }
        bytes += Number(stamp.size); if (bytes > record.bytes) throw new Error('Stage byte budget exceeded.');
      }
      stamps.set(item, stamp);
    }
  }
  if (complete && files !== expected.size) throw new Error('Stage inventory is incomplete.');
  return { stamps, bytes, entries: count };
}

/** Called only after the existing durable journal admits exact retirement. */
export function retireProjectCheckStageFiles(record: Readonly<ProjectCheckStageRecord>, assertOwned: () => void): undefined {
  if (!record.manifest || !record.quarantineRoot) throw new Error('Unsealed legacy stage is preserved.');
  assertOwned();
  let root = fs.lstatSync(record.root, { throwIfNoEntry: false }) ? record.root : record.quarantineRoot;
  if (!fs.lstatSync(path.join(root, PROJECT_CHECK_STAGE_MANIFEST), { throwIfNoEntry: false })) {
    if (fs.readdirSync(root).length) throw new Error('Stage with missing inventory is not empty.');
  } else { inspectTree(root, record, false, true); }
  assertOwned();
  if (root === record.root) { fs.renameSync(root, record.quarantineRoot); root = record.quarantineRoot; }
  // Durable quarantine was named before creation, so death after rename cannot
  // turn it into an untracked sibling. Recheck physical identity before deletion.
  assertOwned();
  const inventory = fs.lstatSync(path.join(root, PROJECT_CHECK_STAGE_MANIFEST), { throwIfNoEntry: false })
    ? inspectTree(root, record, false, true) : { stamps: new Map<string, fs.BigIntStats>() };
  const files = [...inventory.stamps].filter(([name, stamp]) => stamp.isFile() && name !== PROJECT_CHECK_STAGE_MANIFEST);
  for (const [name, stamp] of files) {
    assertOwned(); const file = path.join(root, ...name.split('/'));
    if (!sameFile(stamp, fs.lstatSync(file, { bigint: true }))) throw new Error('Stage file changed before retirement.');
    fs.unlinkSync(file);
  }
  const directories = [...inventory.stamps].filter(([, stamp]) => stamp.isDirectory()).sort((a, b) => b[0].length - a[0].length);
  for (const [name, stamp] of directories) {
    assertOwned(); const directory = path.join(root, ...name.split('/'));
    if (!sameIdentity(stamp, regularDirectory(directory))) throw new Error('Stage subdirectory changed before retirement.');
    fs.rmdirSync(directory);
  }
  const marker = path.join(root, PROJECT_CHECK_STAGE_MANIFEST);
  const markerStamp = inventory.stamps.get(PROJECT_CHECK_STAGE_MANIFEST);
  if (markerStamp) {
    assertOwned();
    if (fs.readdirSync(root).some(name => name !== PROJECT_CHECK_STAGE_MANIFEST) || !sameFile(markerStamp, fs.lstatSync(marker, { bigint: true }))) throw new Error('Stage root changed before inventory retirement.');
    fs.unlinkSync(marker);
  }
  assertOwned(); fs.rmdirSync(root); return undefined;
}

export function createOwnedProjectCheckStage(context: ProjectCheckStageContext, parent: string, kind: Manifest['kind'], files: readonly ProjectCheckStageFile[]) {
  const inventory = manifestFor(kind, files);
  const handle = context.lease.reserveProjectCheckStage({ ...context, parent, kind, bytes: inventory.totalBytes, entries: inventory.entries,
    manifest: { bytes: inventory.bytes.length, sha256: digest(inventory.bytes) } });
  let disposed = false;
  let markerStamp: fs.BigIntStats | undefined;
  const expectedFiles = new Set(inventory.manifest.files.map(file => file.path));
  const assertOwned = (target?: string) => {
    if (disposed) throw new Error('Stage has been disposed.');
    context.lease.assertProjectCheckStage(handle);
    if (markerStamp && !sameFile(markerStamp, fs.lstatSync(path.join(handle.root, PROJECT_CHECK_STAGE_MANIFEST), { bigint: true }))) throw new Error('Stage inventory changed.');
    if (target !== undefined) {
      const relative = path.relative(handle.root, target).split(path.sep).join('/');
      if (!expectedFiles.has(relative) && !inventory.directories.has(relative)) throw new Error('Stage write is outside its planned inventory.');
      const segments = relative.split('/'); let cursor = handle.root;
      for (const [index, segment] of segments.entries()) {
        cursor = path.join(cursor, segment); const current = fs.lstatSync(cursor, { bigint: true, throwIfNoEntry: false });
        if (!current) continue;
        if (index === segments.length - 1 && expectedFiles.has(relative)) throw new Error('Stage file destination is unexpectedly occupied.');
        regularDirectory(cursor);
      }
    }
  };
  const dispose = () => {
    if (disposed) return;
    context.lease.retireProjectCheckStage(handle, retireProjectCheckStageFiles); disposed = true;
  };
  try {
    fs.mkdirSync(handle.root, { mode: 0o700 });
    context.lease.adoptProjectCheckStage(handle, identity(regularDirectory(handle.root)));
    assertOwned();
    const marker = path.join(handle.root, PROJECT_CHECK_STAGE_MANIFEST);
    const fd = fs.openSync(marker, 'wx', 0o600);
    try { fs.writeFileSync(fd, inventory.bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    markerStamp = fs.lstatSync(marker, { bigint: true });
    readManifest(handle.root, { kind, manifest: { bytes: inventory.bytes.length, sha256: digest(inventory.bytes) } });
    const record: ProjectCheckStageRecord = { sourceKey: context.sourceKey, workspaceId: context.workspaceId, actorId: context.actorId,
      ...handle, claimId: '', instanceId: '', pid: process.pid,
      parent: { path: parent, ...identity(regularDirectory(parent)) }, identity: identity(regularDirectory(handle.root)),
      bytes: inventory.totalBytes, entries: inventory.entries, retirement: null, manifest: { bytes: inventory.bytes.length, sha256: digest(inventory.bytes) } };
    const assertComplete = () => { assertOwned(); const result = inspectTree(handle.root, record, true, false); assertOwned(); return result; };
    return { root: handle.root, assertOwned, assertComplete, dispose };
  } catch (error) {
    try { dispose(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Owned stage creation failed; uncertain staging is preserved.'); }
    throw error;
  }
}

/** No prefix scan: only exact journal records in the caller's private scope. */
export function retireAbandonedProjectCheckStages(coordinator: Pick<SharedSourceCoordinator, 'projectCheckStages' | 'retireAbandonedProjectCheckStage'>,
  scope: Omit<ProjectCheckStageScope, 'runId'>, parents: readonly string[]) {
  const allowed = parents.map(parent => { regularDirectory(parent); return parent; }); let retired = 0;
  for (const record of coordinator.projectCheckStages()) {
    if (!record.manifest || record.sourceKey !== scope.sourceKey || record.actorId !== scope.actorId
      || record.workspaceId !== scope.workspaceId || !allowed.includes(record.parent.path)) continue;
    coordinator.retireAbandonedProjectCheckStage(record.id, record, retireProjectCheckStageFiles); retired++;
  }
  return retired;
}
