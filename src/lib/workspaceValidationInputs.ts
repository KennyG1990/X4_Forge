import { classifyPath, type ProjectFile } from './extensionProject';
import type { ValidationEvidence } from './validationEvidence';

const MAX_DIFFERENT_DISK_PATHS = 8;

interface WorkspaceValidationInputOrigins {
  workspaceFiles: number;
  overrideFiles: number;
  diskFiles: number;
  differentDiskFileCount: number;
  differentDiskPaths: string[];
}

export interface WorkspaceValidationInputs extends WorkspaceValidationInputOrigins {
  sourceHash?: string;
  sourceHashScope?: ValidationEvidence['hashScope'];
  diskSource: 'unlinked' | 'unavailable' | 'read';
  skippedDiskFiles: number;
  /** Studio attaches the retained ID to the matching displayed response. */
  resultId?: string;
}

/** The generated manifest has already been overlaid with the request's overrides. */
export function selectWorkspaceValidationFiles(
  files: Readonly<Record<string, string>>,
  diskFiles: readonly ProjectFile[],
  overridePaths?: ReadonlySet<string>,
) {
  const byPath = new Map<string, ProjectFile>(
    Object.entries(files).map(([filePath, content]) => [filePath.toLowerCase(), {
      path: filePath, kind: classifyPath(filePath), content: String(content),
    }]),
  );
  const origins: WorkspaceValidationInputOrigins | undefined = overridePaths && {
    workspaceFiles: byPath.size, overrideFiles: 0, diskFiles: 0,
    differentDiskFileCount: 0, differentDiskPaths: [],
  };
  if (origins) {
    for (const file of byPath.values()) {
      if (overridePaths?.has(file.path)) origins.overrideFiles++;
    }
    origins.workspaceFiles -= origins.overrideFiles;
  }
  const diskKeys = origins ? new Set<string>() : undefined;
  for (const file of diskFiles) {
    const key = file.path.toLowerCase();
    const selected = byPath.get(key);
    if (!selected) {
      byPath.set(key, file);
      if (origins) {
        if (typeof file.content === 'string') origins.diskFiles++;
        diskKeys?.add(key);
      }
    } else if (origins && !diskKeys?.has(key) && typeof file.content === 'string' && selected.content !== file.content) {
      origins.differentDiskFileCount++;
      if (origins.differentDiskPaths.length < MAX_DIFFERENT_DISK_PATHS) origins.differentDiskPaths.push(file.path);
    }
  }
  return { byPath, origins };
}
