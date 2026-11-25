/** Request-local artifact bytes shared by validation and activation. Never rereads source for validation. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artifactPlanIdentity, buildArtifactPlan, materializeArtifact, readVerifiedArtifactFile, verifyMaterializedArtifact, type ArtifactEntry, type ArtifactPlan } from '../lib/artifactPipeline';
import { classifyPath, type ProjectFile } from '../lib/extensionProject';
import { validateDirectoryRoles, type DirectoryRoleInput } from '../lib/pathRoles';
import { readXsdConfig, resolveXsdConfig } from '../lib/xsdParser';
import { validationSubjectSourceHash } from '../../shared/projectValidationInput';
import { PROJECT_RULES_MAX_BYTES, PROJECT_RULES_PATH } from '../lib/projectRules';
import { decodeValidationSourceText, VALIDATION_TEXT_ENCODING_UNAVAILABLE } from '../lib/validationEvidence';
import { decodeProjectCheckManifest, PROJECT_CHECKS_MAX_BYTES, PROJECT_CHECKS_PATH } from './projectCheckProposal';
import { createOwnedProjectCheckStage, type ProjectCheckStageContext } from './projectCheckStaging';
import { canonicalSourceKey } from './resourceCoordinator';

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_FILES = 500;
const MAX_TOTAL_TEXT_BYTES = 64 * 1024 * 1024;

function scratchCapacityCode(error: unknown, parent: string) {
  if (!(error instanceof Error)) return undefined;
  const failure = error as NodeJS.ErrnoException & { dest?: string };
  if (failure.code !== 'ENOSPC' && failure.code !== 'EDQUOT') return undefined;
  const writePath = failure.dest ?? failure.path;
  if (typeof writePath === 'string') {
    const within = path.relative(parent, writePath);
    if (within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) return undefined;
  }
  return failure.code;
}

export type DeploymentSnapshotRootErrorCode =
  | 'DEPLOY_SNAPSHOT_ROOT_STALE'
  | 'DEPLOY_SNAPSHOT_ROOT_INACCESSIBLE'
  | 'DEPLOY_SNAPSHOT_ROOT_ALIASED'
  | 'DEPLOY_SNAPSHOT_ROOT_INVALID';

export class DeploymentSnapshotRootError extends Error {
  constructor(
    readonly code: DeploymentSnapshotRootErrorCode,
    readonly snapshotRoot: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ResolvedSnapshotTempRoot {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly provenance: 'saved' | 'default' | 'launcher';
}

export interface CaptureDeploymentSnapshotOptions {
  configuredTempPath?: string | null;
  lockedToProcessTemp?: boolean;
  roleContext?: DirectoryRoleInput;
}

function hasSnapshotPathControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function resolveDeploymentSnapshotTempRoot(options?: CaptureDeploymentSnapshotOptions): ResolvedSnapshotTempRoot {
  const locked = options?.lockedToProcessTemp ?? (process.env.X4_FORGE_PROJECT_CHECK_OWNER_POLICY !== undefined);
  const rawConfig = options?.configuredTempPath !== undefined ? undefined : readXsdConfig();
  const configured = locked
    ? ''
    : String(options?.configuredTempPath !== undefined ? (options.configuredTempPath || '') : (rawConfig?.snapshotTempPath || '')).trim();
  if (!configured) {
    const parent = fs.realpathSync.native(os.tmpdir());
    const stat = fs.lstatSync(parent, { bigint: true });
    return {
      path: parent,
      device: stat.dev.toString(),
      inode: stat.ino.toString(),
      provenance: locked ? 'launcher' : 'default',
    };
  }
  if (configured.length > 4096 || hasSnapshotPathControlChars(configured)
    || !path.isAbsolute(configured) || /^(?:\\\\|\/\/)/.test(configured)) {
    throw new DeploymentSnapshotRootError(
      'DEPLOY_SNAPSHOT_ROOT_INVALID',
      configured,
      `Configured temporary deploy-snapshot directory must be an absolute local path: "${configured}".`,
    );
  }
  const absolute = path.resolve(configured);
  if (absolute === path.parse(absolute).root) {
    throw new DeploymentSnapshotRootError(
      'DEPLOY_SNAPSHOT_ROOT_INVALID',
      absolute,
      `Configured temporary deploy-snapshot directory must be a dedicated folder, not a bare drive root: "${absolute}".`,
    );
  }
  const roleSource = options?.roleContext ?? (rawConfig ? resolveXsdConfig({ ...rawConfig, snapshotTempPath: configured }) : undefined);
  if (roleSource) {
    const scratchGame = 'isolatedScratch' in roleSource && roleSource.isolatedScratch ? roleSource.x4GamePath : undefined;
    const overlap = validateDirectoryRoles({ ...roleSource, configuredSnapshotTempPath: configured }, scratchGame)
      .find(issue => issue.field === 'snapshotTempPath' && (issue.code === 'PROTECTED_ROOT_OVERLAP' || issue.code === 'SNAPSHOT_TEMP_ROLE_OVERLAP'));
    if (overlap) {
      throw new DeploymentSnapshotRootError('DEPLOY_SNAPSHOT_ROOT_INVALID', absolute, overlap.message);
    }
  }
  let cursor = absolute;
  let leafStat: fs.BigIntStats | undefined;
  for (let depth = 0; ; depth++) {
    if (depth >= 128) {
      throw new DeploymentSnapshotRootError(
        'DEPLOY_SNAPSHOT_ROOT_INVALID',
        absolute,
        `Configured temporary deploy-snapshot directory ancestry exceeds its bound: "${absolute}".`,
      );
    }
    let info: fs.BigIntStats | undefined;
    try {
      info = fs.lstatSync(cursor, { bigint: true, throwIfNoEntry: false });
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException | undefined)?.code;
      throw new DeploymentSnapshotRootError(
        code === 'EACCES' || code === 'EPERM' ? 'DEPLOY_SNAPSHOT_ROOT_INACCESSIBLE' : 'DEPLOY_SNAPSHOT_ROOT_INVALID',
        absolute,
        `Configured temporary deploy-snapshot directory could not be inspected at "${absolute}".`,
      );
    }
    if (info) {
      let real = '';
      try {
        real = fs.realpathSync.native(cursor);
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException | undefined)?.code;
        throw new DeploymentSnapshotRootError(
          code === 'EACCES' || code === 'EPERM' ? 'DEPLOY_SNAPSHOT_ROOT_INACCESSIBLE' : 'DEPLOY_SNAPSHOT_ROOT_ALIASED',
          absolute,
          `Configured temporary deploy-snapshot directory could not resolve physical ancestry at "${absolute}".`,
        );
      }
      if (!info.isDirectory() || info.isSymbolicLink() || path.relative(cursor, real)) {
        throw new DeploymentSnapshotRootError(
          'DEPLOY_SNAPSHOT_ROOT_ALIASED',
          absolute,
          `Configured temporary deploy-snapshot directory must be a physical non-aliased folder: "${absolute}".`,
        );
      }
      if (cursor === absolute) {
        if (info.ino <= 0n) {
          throw new DeploymentSnapshotRootError(
            'DEPLOY_SNAPSHOT_ROOT_ALIASED',
            absolute,
            `Configured temporary deploy-snapshot directory identity is unavailable at "${absolute}".`,
          );
        }
        leafStat = info;
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (!leafStat) {
    throw new DeploymentSnapshotRootError(
      'DEPLOY_SNAPSHOT_ROOT_STALE',
      absolute,
      `Configured temporary deploy-snapshot directory no longer exists at "${absolute}". Recreate it or clear Temporary Deploy Snapshot Folder in Settings.`,
    );
  }
  try {
    fs.accessSync(absolute, fs.constants.R_OK | fs.constants.W_OK);
    fs.readdirSync(absolute);
  } catch {
    throw new DeploymentSnapshotRootError(
      'DEPLOY_SNAPSHOT_ROOT_INACCESSIBLE',
      absolute,
      `Configured temporary deploy-snapshot directory is not readable and writable at "${absolute}".`,
    );
  }
  return {
    path: absolute,
    device: leafStat.dev.toString(),
    inode: leafStat.ino.toString(),
    provenance: 'saved',
  };
}

export class DeploymentSnapshotStorageError extends Error {
  readonly code = 'DEPLOY_SNAPSHOT_NO_SPACE';
  readonly storage: {
    errno: 'ENOSPC' | 'EDQUOT'; directory: string; volume?: string; payloadBytes: number;
    availableBytes?: number; cleanupIncomplete?: true;
  };

  constructor(
    cause: unknown,
    errno: 'ENOSPC' | 'EDQUOT',
    directory: string,
    payloadBytes: number,
    cleanupIncomplete: boolean,
    provenance: 'saved' | 'default' | 'launcher' = 'default',
  ) {
    const volume = process.platform === 'win32' ? path.parse(directory).root : undefined;
    const state = errno === 'EDQUOT' ? 'has exhausted its storage quota' : 'is out of space';
    const temporaryVariables = process.platform === 'win32' ? 'TEMP/TMP' : 'TMPDIR';
    const retry = provenance === 'saved'
      ? `Free space in ${directory} or choose another Temporary Deploy Snapshot Folder in Forge Settings, then retry.`
      : `Free space in Forge’s temporary directory, choose a Temporary Deploy Snapshot Folder on another volume in Forge Settings, or restart Forge with ${temporaryVariables} on a writable volume, then retry.`;
    super(`Forge’s snapshot storage at ${provenance === 'saved' ? directory : (volume ?? directory)} ${state}. ${retry}`
      + (cleanupIncomplete ? ' Forge could not verify cleanup of its temporary snapshot.' : ''), { cause });
    let availableBytes: number | undefined;
    try {
      const capacity = fs.statfsSync(directory, { bigint: true });
      const available = Number(capacity.bavail * capacity.bsize);
      if (Number.isSafeInteger(available) && available >= 0) availableBytes = available;
    } catch { /* A failed sample cannot hide the operating system error. */ }
    this.storage = { errno, directory, payloadBytes, ...(volume ? { volume } : {}),
      ...(availableBytes !== undefined ? { availableBytes } : {}), ...(cleanupIncomplete ? { cleanupIncomplete: true } : {}) };
  }
}

export function captureDeploymentSnapshot(
  plan: ArtifactPlan,
  format: 'loose' | 'catalog',
  context?: ProjectCheckStageContext,
  options?: CaptureDeploymentSnapshotOptions,
) {
  if (context && plan.sourceRoot && canonicalSourceKey(plan.sourceRoot) !== context.sourceKey) throw new Error('Owned snapshot does not match the claimed source.');
  const tempRoot = resolveDeploymentSnapshotTempRoot(options);
  const parent = tempRoot.path;
  const parentStamp = fs.lstatSync(parent, { bigint: true });
  let cleanup: (() => void) | undefined;
  try {
    const stage = context && createOwnedProjectCheckStage(context, parent, 'snapshot',
      plan.entries.map(entry => ({ path: `payload/${entry.path}`, size: entry.size, sha256: entry.sha256 })));
    cleanup = stage?.dispose;
    const root = stage?.root ?? fs.mkdtempSync(path.join(parent, 'x4forge-deploy-snapshot-'));
    const payload = path.join(root, 'payload');
    const rootStamp = fs.lstatSync(root, { bigint: true });
    let disposed = false;
    const assertOwnedDirectory = (directory: string, expected: fs.BigIntStats) => {
      const current = fs.lstatSync(directory, { bigint: true, throwIfNoEntry: false });
      if (!current?.isDirectory() || current.dev !== expected.dev || current.ino !== expected.ino
        || fs.realpathSync.native(directory) !== directory) {
        throw Object.assign(new Error('Deployment snapshot directory changed.'), { code: 'DEPLOY_SNAPSHOT_CHANGED' });
      }
    };
    const dispose = () => {
      if (disposed) return;
      if (stage) { stage.dispose(); disposed = true; return; }
      assertOwnedDirectory(parent, parentStamp);
      assertOwnedDirectory(root, rootStamp);
      fs.rmSync(root, { recursive: true, force: true });
      disposed = true;
    };
    cleanup = dispose;
    const built = materializeArtifact(plan, payload, 'per-file', stage?.assertOwned, failure => {
      if (scratchCapacityCode(failure, parent)) throw failure;
    });
    if (!built.ok) throw Object.assign(new Error(`Deployment snapshot refused: ${built.errors.join('; ')}`), {
      code: built.errors.some(message => /changed|hash|mismatch/i.test(message)) ? 'DEPLOY_SOURCE_CHANGED' : 'DEPLOY_SNAPSHOT_FAILED',
    });
    stage?.assertComplete();
    // Every packaging read, including originally generated bytes, now comes from
    // the snapshot whose hashes were verified. Keep original totals as provenance.
    const frozenPlan: ArtifactPlan = {
      ...plan,
      entries: plan.entries.map(entry => Object.freeze({
        ...entry, disposition: 'source-copy', sourcePath: path.join(payload, ...entry.path.split('/')), content: undefined,
      })),
      excluded: plan.excluded.map(entry => Object.freeze({ ...entry })),
      runtimeOwned: plan.runtimeOwned.map(entry => Object.freeze({ ...entry })),
      rules: Object.freeze({ exclude: [...plan.rules.exclude], runtimeOwned: [...plan.rules.runtimeOwned], catalogLoose: [...plan.rules.catalogLoose] }),
      errors: [...plan.errors],
      totals: Object.freeze({ ...plan.totals }),
    };
    for (const list of [frozenPlan.entries, frozenPlan.excluded, frozenPlan.runtimeOwned, frozenPlan.errors,
      frozenPlan.rules.exclude, frozenPlan.rules.runtimeOwned, frozenPlan.rules.catalogLoose]) Object.freeze(list);
    Object.freeze(frozenPlan);
    const payloadStamp = fs.lstatSync(payload, { bigint: true });
    const assertIntegrity = () => {
      stage?.assertOwned();
      assertOwnedDirectory(parent, parentStamp);
      assertOwnedDirectory(root, rootStamp);
      assertOwnedDirectory(payload, payloadStamp);
      const verified = verifyMaterializedArtifact(frozenPlan, payload);
      if (!verified.ok) throw Object.assign(new Error(`Deployment snapshot changed: ${verified.errors.join('; ')}`), { code: 'DEPLOY_SNAPSHOT_CHANGED' });
      assertOwnedDirectory(payload, payloadStamp);
      assertOwnedDirectory(root, rootStamp);
      assertOwnedDirectory(parent, parentStamp);
    };
    // materializeArtifact(..., 'per-file') already verified every entry hash on copy;
    // keep lightweight root/payload identity here and run full assertIntegrity() below after manifest reads.
    stage?.assertOwned();
    assertOwnedDirectory(parent, parentStamp);
    assertOwnedDirectory(root, rootStamp);
    assertOwnedDirectory(payload, payloadStamp);
    const files: ProjectFile[] = [];
    const skipped: Array<{ path: string; reason: string }> = [];
    let textBytes = 0;
    const readSnapshotEntry = (entry: ArtifactEntry, maxBytes: number) => {
      try {
        return readVerifiedArtifactFile(path.join(payload, ...entry.path.split('/')), entry, maxBytes);
      } catch (cause) {
        if (scratchCapacityCode(cause, parent)) throw cause;
        throw Object.assign(new Error(`Deployment snapshot changed: could not verify ${entry.path}.`, { cause }), {
          code: 'DEPLOY_SNAPSHOT_CHANGED',
        });
      }
    };
    const manifestFiles = frozenPlan.entries.map(entry => {
      const item = { path: entry.path, size: entry.size, sha256: entry.sha256, validation: 'bytes-only' as 'text' | 'bytes-only' | 'unavailable' };
      if (entry.path.toLowerCase() === PROJECT_CHECKS_PATH) {
        const content = entry.size <= PROJECT_CHECKS_MAX_BYTES
          ? decodeProjectCheckManifest(readSnapshotEntry(entry, PROJECT_CHECKS_MAX_BYTES)) : undefined;
        files.push({ path: entry.path, kind: 'other', content });
        item.validation = content === undefined ? 'unavailable' : 'text';
        return item;
      }
      const isRules = entry.path.toLowerCase() === PROJECT_RULES_PATH;
      if (isRules && entry.size > PROJECT_RULES_MAX_BYTES) {
        throw Object.assign(new Error(`forge.rules.json exceeds ${PROJECT_RULES_MAX_BYTES} bytes; invalid validation rules cannot be deployed.`), { code: 'DEPLOY_INPUT_INVALID' });
      }
      if (!/\.(xml|lua)$/i.test(entry.path) && !isRules) return item;
      let reason = '';
      if (entry.size > MAX_TEXT_BYTES) reason = `Semantic validation limit: file exceeds ${MAX_TEXT_BYTES} bytes.`;
      else if (files.length >= MAX_TEXT_FILES) reason = `Semantic validation limit: ${MAX_TEXT_FILES} text files.`;
      else if (textBytes + entry.size > MAX_TOTAL_TEXT_BYTES) reason = `Semantic validation limit: ${MAX_TOTAL_TEXT_BYTES} total text bytes.`;
      else {
        const bytes = readSnapshotEntry(entry, isRules ? PROJECT_RULES_MAX_BYTES : MAX_TEXT_BYTES);
        const content = decodeValidationSourceText(bytes);
        if (content === undefined) reason = VALIDATION_TEXT_ENCODING_UNAVAILABLE;
        else {
          files.push({ path: entry.path, kind: classifyPath(entry.path), content });
          textBytes += bytes.length;
          item.validation = 'text';
        }
      }
      if (reason) {
        if (isRules) throw Object.assign(new Error(`${PROJECT_RULES_PATH} could not be validated. ${reason}`), { code: 'DEPLOY_INPUT_INVALID' });
        skipped.push({ path: entry.path, reason });
        item.validation = 'unavailable';
      }
      return item;
    });
    assertIntegrity();
    const manifest = Object.freeze({ version: 1, scope: 'logical-artifact-bytes', hash: artifactPlanIdentity(frozenPlan, format),
      format, files: Object.freeze(manifestFiles.map(entry => Object.freeze(entry))) });
    const assertProjectCheckStageContext = (expected: ProjectCheckStageContext) => {
      if (!stage || !context || context !== expected) throw new Error('Deployment snapshot does not belong to this owned check context.');
      stage.assertOwned();
    };
    return Object.freeze({
      plan: frozenPlan,
      payloadRoot: payload,
      tempRoot: Object.freeze({ ...tempRoot }),
      files,
      skipped,
      assertIntegrity,
      dispose,
      manifest,
      assertProjectCheckStageContext,
    });
  } catch (error) {
    const aggregated = error instanceof AggregateError;
    const errno = scratchCapacityCode(aggregated ? error.errors[0] : error, parent);
    try { cleanup?.(); }
    catch (cleanupError) {
      if (!errno) throw cleanupError;
      throw new DeploymentSnapshotStorageError(new AggregateError([error, cleanupError]), errno, parent, plan.totals.includedBytes, true, tempRoot.provenance);
    }
    if (errno) throw new DeploymentSnapshotStorageError(error, errno, parent, plan.totals.includedBytes, aggregated, tempRoot.provenance);
    throw error;
  }
}

export type DeploymentSnapshot = ReturnType<typeof captureDeploymentSnapshot>;

/**
 * Zero-copy deploy-candidate hash probe (#138): computes the exact `sourceHash` and
 * `artifactPlanHash` that `captureDeploymentSnapshot` produces for a pure disk source folder,
 * without materializing temporary files on disk.
 */
export function computeDeployCandidateIdentity(
  sourceRoot: string,
  format: 'loose' | 'catalog' = 'loose',
): { ok: true; sourceHash: string; artifactPlanHash: string } | { ok: false; reason: string } {
  const plan = buildArtifactPlan({ sourceRoot });
  if (!plan.ok) return { ok: false, reason: plan.errors.join('; ') || 'Artifact plan unavailable.' };
  const files: ProjectFile[] = [];
  let textBytes = 0;
  try {
    for (const entry of plan.entries) {
      if (entry.path.toLowerCase() === PROJECT_CHECKS_PATH) {
        const content = entry.size <= PROJECT_CHECKS_MAX_BYTES
          ? decodeProjectCheckManifest(readVerifiedArtifactFile(path.join(sourceRoot, ...entry.path.split('/')), entry, PROJECT_CHECKS_MAX_BYTES))
          : undefined;
        files.push({ path: entry.path, kind: 'other', content });
        continue;
      }
      const isRules = entry.path.toLowerCase() === PROJECT_RULES_PATH;
      if (isRules && entry.size > PROJECT_RULES_MAX_BYTES) {
        return { ok: false, reason: `forge.rules.json exceeds ${PROJECT_RULES_MAX_BYTES} bytes.` };
      }
      if (!/\.(xml|lua)$/i.test(entry.path) && !isRules) continue;
      if (entry.size > MAX_TEXT_BYTES || files.length >= MAX_TEXT_FILES || textBytes + entry.size > MAX_TOTAL_TEXT_BYTES) {
        if (isRules) return { ok: false, reason: `${PROJECT_RULES_PATH} could not be validated.` };
        continue;
      }
      const bytes = readVerifiedArtifactFile(path.join(sourceRoot, ...entry.path.split('/')), entry, isRules ? PROJECT_RULES_MAX_BYTES : MAX_TEXT_BYTES);
      const content = decodeValidationSourceText(bytes);
      if (content === undefined) {
        if (isRules) return { ok: false, reason: `${PROJECT_RULES_PATH} could not be decoded as UTF-8.` };
        continue;
      }
      files.push({ path: entry.path, kind: classifyPath(entry.path), content });
      textBytes += bytes.length;
    }
    return {
      ok: true,
      sourceHash: validationSubjectSourceHash(files),
      artifactPlanHash: artifactPlanIdentity(plan, format),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
