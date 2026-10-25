import fs from 'node:fs';
import path from 'node:path';
import type { ResolvedXsdConfig } from '../lib/xsdParser';

export interface DependencyPath {
  id: string;
  path: string | null;
  kind: 'file' | 'directory';
  setting: string;
  affects: string;
}

export interface DependencyPathIo {
  statSync: typeof fs.statSync;
  openSync: typeof fs.openSync;
  readSync: typeof fs.readSync;
  closeSync: typeof fs.closeSync;
  opendirSync: typeof fs.opendirSync;
}

/** Bounded readability probe, not a schema validator, corpus scan or game connection. */
export function probeDependencyPath(input: DependencyPath, io: DependencyPathIo = fs) {
  let reason: 'unconfigured' | 'missing' | 'wrong-type' | 'unreadable' | 'probe-failed' | null = null;
  let errorCode: string | null = null;
  try {
    if (!input.path) reason = 'unconfigured';
    else {
      const stat = io.statSync(input.path);
      if (input.kind === 'file' ? !stat.isFile() : !stat.isDirectory()) reason = 'wrong-type';
      else if (input.kind === 'directory') {
        const dir = io.opendirSync(input.path);
        try { dir.readSync(); } finally { dir.closeSync(); }
      } else {
        const fd = io.openSync(input.path, 'r');
        try { io.readSync(fd, Buffer.alloc(1), 0, 1, 0); } finally { io.closeSync(fd); }
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Return a bounded code, never arbitrary exception text or credentials.
    errorCode = typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'UNKNOWN';
    reason = code === 'ENOENT' || code === 'ENOTDIR' ? 'missing'
      : code === 'EACCES' || code === 'EPERM' ? 'unreadable' : 'probe-failed';
  }
  return { ...input, status: reason ? 'unavailable' as const : 'readable' as const, reason, errorCode,
    detail: reason ? `${input.id}: ${reason} (${input.path || 'no path configured'}). Check ${input.setting}.`
      : `${input.id}: path is readable; content and runtime behavior are not verified.` };
}

export function buildDependencyHealth(resolved: ResolvedXsdConfig, io: DependencyPathIo = fs) {
  const libraries = path.join(resolved.x4ReferenceRoot, 'libraries');
  // These are resolved schema inputs plus canonical loose corpus inputs. Packed game
  // fallbacks and parser/index status remain separate; absence here is not a mod error.
  const dependencies = [
    { id: 'reference_root', path: resolved.x4ReferenceRoot, kind: 'directory', setting: 'X4_REFERENCE_ROOT / x4ReferenceRoot', affects: 'Canonical reference lookup' },
    { id: 'md_schema', path: resolved.mdXsdPath, kind: 'file', setting: 'X4_XSD_PATH / xsdSchemaPath / schemaFiles', affects: 'Mission Director schema input' },
    { id: 'common_schema', path: resolved.commonXsdPath, kind: 'file', setting: 'X4_XSD_PATH / xsdSchemaPath / schemaFiles', affects: 'Shared schema input' },
    { id: 'ai_schema', path: resolved.aiscriptsXsdPath || path.join(resolved.schemaDir, 'aiscripts.xsd'), kind: 'file', setting: 'X4_XSD_PATH / xsdSchemaPath', affects: 'Loose AI-script schema input' },
    { id: 'script_properties', path: path.join(libraries, 'scriptproperties.xml'), kind: 'file', setting: 'X4_REFERENCE_ROOT / x4ReferenceRoot', affects: 'Canonical loose script-property input' },
    { id: 'staging', path: resolved.modWorkspacePath || null, kind: 'directory', setting: 'modWorkspacePath', affects: 'Mod source staging; write access is not tested' },
    { id: 'game_directory', path: resolved.x4GamePath || null, kind: 'directory', setting: 'X4_GAME_PATH / x4GamePath', affects: 'Configured game directory; game installation/running state is not tested' },
  ].map(input => probeDependencyPath(input as DependencyPath, io));
  const unavailable = dependencies.filter(row => row.status === 'unavailable');
  return {
    scope: 'configured-dependency-path-readability' as const,
    status: unavailable.length ? 'dependencies-unavailable' as const : 'paths-readable' as const,
    failureKind: unavailable.length ? 'forge-environment' as const : null,
    validatesMod: false as const,
    changesDeployPolicy: false as const,
    note: 'Path readability only. Does not verify schema contents, include chains, cached indexes, packed fallbacks, write access or X4. Use project validation for mod findings.',
    unavailableCount: unavailable.length,
    dependencies,
  };
}
