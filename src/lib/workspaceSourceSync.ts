/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit 75 (DA-1, #140) — Pure disk-authoritative workspace sync policy.
 *
 * Folder-backed workspaces freeze an imported JSON snapshot in the registry while
 * external editors, agents, git, or canonical deploys mutate files on disk.
 * Comparing live workspace substance against `sourceStamp.importedWorkspaceHash`
 * lets the Studio auto-sync clean folder-backed workspaces when disk changes,
 * while strictly refusing silent overwrite when local edits exist or the workspace
 * predates import-substance hashing (`legacy-stamp`).
 */

import { sanitizeWorkspace, type ModWorkspace } from '../types';
import { toContentVersion } from './modCompiler';
import { canonicalWorkspaceContentPayload, fnvHash, stableStringify } from './workspaceIdentity';

export interface DiskContentMeta {
  id?: string;
  name?: string;
  version?: string;
  author?: string;
  description?: string;
}

export interface SourceReimportTarget {
  root: 'workspace' | 'filesystem';
  path: string;
}

export interface DiskFileCounts {
  total: number;
  md: number;
  aiscripts: number;
  libraries: number;
  t: number;
  ui: number;
}

export type LocalEditState = 'clean' | 'local-edits' | 'legacy-stamp';

export interface WorkspaceSourceSyncStatus {
  known: boolean;
  inSync?: boolean;
  detail: string;
  stampedHash?: string;
  currentHash?: string;
  diskMeta?: DiskContentMeta | null;
  diskFileCounts?: DiskFileCounts;
  localEditState?: LocalEditState;
  canAutoSync?: boolean;
  versionDrifted?: boolean;
  reimportTarget?: SourceReimportTarget | null;
}

export type DiskSyncDecision = 'none' | 'auto-reload' | 'prompt-banner';

/**
 * Compute the deterministic hash of an imported workspace's authored substance,
 * excluding `sourceStamp` so refreshing stamp metadata alone does not flip
 * clean-import status.
 */
export function workspaceImportSubstanceHash(ws: ModWorkspace): string {
  const payload = canonicalWorkspaceContentPayload(sanitizeWorkspace(ws));
  if (!payload) return 'empty';
  return fnvHash(stableStringify({ ...payload, sourceStamp: undefined }));
}

/**
 * Determine whether a folder-backed workspace matches its import-time baseline.
 */
export function classifyLocalEditState(ws: ModWorkspace): LocalEditState {
  const stamped = ws.sourceStamp?.importedWorkspaceHash;
  if (typeof stamped !== 'string' || !stamped.trim()) return 'legacy-stamp';
  return workspaceImportSubstanceHash(ws) === stamped ? 'clean' : 'local-edits';
}

/**
 * Compare disk `content.xml` version against the active workspace version using
 * X4's normalized numeric content-version mapping.
 */
export function isContentVersionDrifted(
  diskVersion: string | undefined | null,
  workspaceVersion: string | undefined | null,
): boolean {
  const diskTrimmed = typeof diskVersion === 'string' ? diskVersion.trim() : '';
  if (!diskTrimmed) return false;
  return toContentVersion(diskTrimmed) !== toContentVersion(typeof workspaceVersion === 'string' ? workspaceVersion : '');
}

/**
 * Categorize relative mod file paths into top-level X4 domain counts.
 */
export function classifyDiskFileCounts(relativePaths: readonly string[]): DiskFileCounts {
  const counts: DiskFileCounts = {
    total: 0,
    md: 0,
    aiscripts: 0,
    libraries: 0,
    t: 0,
    ui: 0,
  };
  for (const rawPath of relativePaths) {
    const norm = String(rawPath || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    if (!norm) continue;
    counts.total += 1;
    if (norm.startsWith('md/')) counts.md += 1;
    else if (norm.startsWith('aiscripts/')) counts.aiscripts += 1;
    else if (norm.startsWith('libraries/')) counts.libraries += 1;
    else if (norm.startsWith('t/')) counts.t += 1;
    else if (norm === 'ui.xml' || norm.startsWith('ui/')) counts.ui += 1;
  }
  return counts;
}

/**
 * Decide whether the Studio should silently adopt newer disk files, show the
 * explicit drift banner, or do nothing.
 */
export function decideDiskSyncAction(params: {
  sourceSync: WorkspaceSourceSyncStatus | null;
  workspace: ModWorkspace;
  hasUnsavedLocalDirty: boolean;
  queuedSyncs: number;
  syncConflict: boolean;
  inFlightReload: boolean;
  dismissedDiskHash: string | null;
  lastFailedAutoReloadHash: string | null;
}): DiskSyncDecision {
  const {
    sourceSync,
    workspace,
    hasUnsavedLocalDirty,
    queuedSyncs,
    syncConflict,
    inFlightReload,
    dismissedDiskHash,
    lastFailedAutoReloadHash,
  } = params;

  if (!sourceSync || !sourceSync.known || sourceSync.inSync !== false) {
    return 'none';
  }

  if (sourceSync.currentHash && workspace.sourceStamp?.hash && sourceSync.currentHash === workspace.sourceStamp.hash) {
    return 'none';
  }

  const clientEditState = classifyLocalEditState(workspace);
  const currentHash = sourceSync.currentHash;
  const canAutoReload = Boolean(
    sourceSync.canAutoSync === true
    && sourceSync.localEditState === 'clean'
    && clientEditState === 'clean'
    && sourceSync.reimportTarget
    && !hasUnsavedLocalDirty
    && queuedSyncs === 0
    && !syncConflict
    && !inFlightReload
    && currentHash
    && currentHash !== lastFailedAutoReloadHash,
  );
  if (canAutoReload) return 'auto-reload';

  if (currentHash && currentHash === dismissedDiskHash) {
    return 'none';
  }

  return 'prompt-banner';
}
