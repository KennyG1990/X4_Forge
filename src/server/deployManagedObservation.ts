import fs from 'node:fs';
import path from 'node:path';
import { hashArtifactFile, sameArtifactStamp } from '../lib/artifactPipeline';
import { DEPLOY_MANAGED_MAX_BYTES, DEPLOY_MANAGED_MAX_FILES, type DeployManagedFile } from './deployManagedEvidence';

const SCOPE = 'managed-physical';
const MAX_OBSERVED_PATHS = 2 * DEPLOY_MANAGED_MAX_FILES + 1;

export type ManagedDeploymentObservation =
  | {
    scope: typeof SCOPE;
    state: 'matches-committed' | 'differs-from-committed';
    checkedFiles: number;
    missingPaths: string[];
    changedPaths: string[];
  }
  | { scope: typeof SCOPE; state: 'unavailable' | 'absent' | 'binding-mismatch' };

function pathKey(filename: string): string {
  return process.platform === 'win32' ? filename.toLowerCase() : filename;
}

/** Read only the committed manifest's files and the directories needed to reach them. */
export function observeManagedOutputs(
  target: string,
  initialRoot: fs.BigIntStats,
  files: readonly DeployManagedFile[],
): ManagedDeploymentObservation {
  const unavailable = { scope: SCOPE, state: 'unavailable' } as const;
  if (!path.isAbsolute(target) || !initialRoot.isDirectory()
    || files.length === 0 || files.length > DEPLOY_MANAGED_MAX_FILES) return unavailable;

  const root = path.resolve(target);
  const observed = new Map<string, { filename: string; stamp: fs.BigIntStats | undefined }>();
  const missingPaths: string[] = [];
  const changedPaths: string[] = [];
  let remainingBytes = DEPLOY_MANAGED_MAX_BYTES;

  const readStamp = (filename: string): fs.BigIntStats | undefined => {
    const stamp = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
    if (!stamp) return;
    if ((!stamp.isDirectory() && !stamp.isFile()) || stamp.isSymbolicLink()
      || stamp.ino === 0n || stamp.dev !== initialRoot.dev || (stamp.isFile() && stamp.nlink !== 1n)
      || pathKey(path.resolve(fs.realpathSync.native(filename))) !== pathKey(filename)) {
      throw new Error('A managed deployment path is not a stable physical directory or single-link file.');
    }
    return stamp;
  };

  const observe = (filename: string): fs.BigIntStats | undefined => {
    const key = pathKey(filename);
    const cached = observed.get(key);
    if (cached) return cached.stamp;
    if (observed.size >= MAX_OBSERVED_PATHS) throw new Error('Managed deployment observation exceeds its path budget.');
    const stamp = readStamp(filename);
    observed.set(key, { filename, stamp });
    return stamp;
  };

  try {
    const rootStamp = observe(root);
    if (!rootStamp?.isDirectory() || !sameArtifactStamp(initialRoot, rootStamp)) return unavailable;

    for (const file of files) {
      const parts = file.path.split('/');
      if (parts.length > 64 || parts.some(part => !part || /[ .]$|[\\:]/.test(part))) return unavailable;
      let filename = root;
      let stamp: fs.BigIntStats | undefined = rootStamp;
      for (const segment of parts) {
        // An absent prefix or a stable regular file cannot contain managed descendants.
        if (!stamp?.isDirectory()) {
          stamp = undefined;
          break;
        }
        filename = path.join(filename, segment);
        stamp = observe(filename);
      }

      if (!stamp) {
        missingPaths.push(file.path);
      } else if (!stamp.isFile() || stamp.size !== BigInt(file.size)) {
        changedPaths.push(file.path);
      } else {
        if (stamp.size > BigInt(remainingBytes)) return unavailable;
        remainingBytes -= Number(stamp.size);
        if (hashArtifactFile(filename, 'sha256', stamp) !== file.sha256) changedPaths.push(file.path);
      }
    }

    // Recheck descendants before their ancestors. Include missing entries in the
    // same check so concurrent creation cannot be reported as stable absence.
    for (const { filename, stamp } of Array.from(observed.values()).reverse()) {
      const current = readStamp(filename);
      if (stamp ? !current || !sameArtifactStamp(stamp, current) : current) return unavailable;
    }
    return {
      scope: SCOPE,
      state: missingPaths.length || changedPaths.length ? 'differs-from-committed' : 'matches-committed',
      checkedFiles: files.length,
      missingPaths,
      changedPaths,
    };
  } catch {
    return unavailable;
  }
}
