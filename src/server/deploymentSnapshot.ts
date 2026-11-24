/** Request-local artifact bytes shared by validation and activation. Never rereads source for validation. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artifactPlanIdentity, buildArtifactPlan, materializeArtifact, readVerifiedArtifactFile, verifyMaterializedArtifact, type ArtifactEntry, type ArtifactPlan } from '../lib/artifactPipeline';
import { classifyPath, type ProjectFile } from '../lib/extensionProject';
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

export class DeploymentSnapshotStorageError extends Error {
  readonly code = 'DEPLOY_SNAPSHOT_NO_SPACE';
  readonly storage: {
    errno: 'ENOSPC' | 'EDQUOT'; directory: string; volume?: string; payloadBytes: number;
    availableBytes?: number; cleanupIncomplete?: true;
  };

  constructor(cause: unknown, errno: 'ENOSPC' | 'EDQUOT', directory: string, payloadBytes: number, cleanupIncomplete: boolean) {
    const volume = process.platform === 'win32' ? path.parse(directory).root : undefined;
    const state = errno === 'EDQUOT' ? 'has exhausted its storage quota' : 'is out of space';
    const temporaryVariables = process.platform === 'win32' ? 'TEMP/TMP' : 'TMPDIR';
    const retry = `Free space in Forge’s temporary directory or restart Forge with ${temporaryVariables} on a writable volume, then retry.`;
    super(`Forge’s snapshot storage at ${volume ?? directory} ${state}. ${retry}`
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

export function captureDeploymentSnapshot(plan: ArtifactPlan, format: 'loose' | 'catalog', context?: ProjectCheckStageContext) {
  if (context && plan.sourceRoot && canonicalSourceKey(plan.sourceRoot) !== context.sourceKey) throw new Error('Owned snapshot does not match the claimed source.');
  const parent = fs.realpathSync.native(os.tmpdir());
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
      assertOwnedDirectory(root, rootStamp);
      assertOwnedDirectory(payload, payloadStamp);
      const verified = verifyMaterializedArtifact(frozenPlan, payload);
      if (!verified.ok) throw Object.assign(new Error(`Deployment snapshot changed: ${verified.errors.join('; ')}`), { code: 'DEPLOY_SNAPSHOT_CHANGED' });
      assertOwnedDirectory(payload, payloadStamp);
      assertOwnedDirectory(root, rootStamp);
    };
    // materializeArtifact(..., 'per-file') already verified every entry hash on copy;
    // keep lightweight root/payload identity here and run full assertIntegrity() below after manifest reads.
    stage?.assertOwned();
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
    return Object.freeze({ plan: frozenPlan, payloadRoot: payload, files, skipped, assertIntegrity, dispose, manifest, assertProjectCheckStageContext });
  } catch (error) {
    const aggregated = error instanceof AggregateError;
    const errno = scratchCapacityCode(aggregated ? error.errors[0] : error, parent);
    try { cleanup?.(); }
    catch (cleanupError) {
      if (!errno) throw cleanupError;
      throw new DeploymentSnapshotStorageError(new AggregateError([error, cleanupError]), errno, parent, plan.totals.includedBytes, true);
    }
    if (errno) throw new DeploymentSnapshotStorageError(error, errno, parent, plan.totals.includedBytes, aggregated);
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
