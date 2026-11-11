/** Read-only planning shared by configuration transports. This is not authority,
 * a bound preview/CAS contract, persistence, or permission to change a profile. */
import path from 'node:path';
import { normalizeDeployFormat, type DeployFormat } from '../lib/deployFormat';
import { validateDirectoryRoles, type DirectoryPathIssue } from '../lib/pathRoles';
import { readXsdConfig, resolveXsdConfig, type XsdConfig, type ResolvedXsdConfig } from '../lib/xsdParser';

type ConfigurationBody = Record<string, unknown> | null | undefined;
interface ConfigurationReaders {
  readConfig(): XsdConfig;
  resolveConfig(config: XsdConfig): ResolvedXsdConfig;
}
export type DirectoryConfigurationPlan = {
  ok: true;
  nextConfig: XsdConfig & { deployFormat?: DeployFormat };
  resolved: ResolvedXsdConfig;
  scratch: boolean;
  referenceRootChanged: boolean;
  schemaComplete: boolean;
  schemaWarning: string | null;
} | {
  ok: false;
  status: 400 | 409;
  body: { success: false; code: string; error: string; field?: string;
    issues?: DirectoryPathIssue[]; resolved?: ResolvedXsdConfig };
};

/** Keep legacy Studio coercions here. Future agent input must first pass its
 * strict field/grant/proposal validation; this helper cannot provide those. */
export function planDirectoryConfigurationChange(
  body: ConfigurationBody,
  ownerRootsLocked: boolean,
  readers: ConfigurationReaders = { readConfig: readXsdConfig, resolveConfig: resolveXsdConfig },
): DirectoryConfigurationPlan {
  if (ownerRootsLocked && ['schemaDir', 'x4GamePath', 'modWorkspacePath', 'filesystemPath', 'x4ReferenceRoot']
    .some(field => body && Object.hasOwn(body, field))) {
    return { ok: false, status: 409, body: { success: false, code: 'PROJECT_CHECK_OWNER_ROOTS_LOCKED',
      error: 'Stop the isolated Dev host before changing its owner approval directory roles.' } };
  }
  // Omission preserves; explicit empty/null/false legacy values clear the field.
  const schemaDir = body?.schemaDir !== undefined ? String(body.schemaDir || '').trim() : undefined;
  const gamePath = body?.x4GamePath !== undefined ? String(body.x4GamePath || '').trim() : undefined;
  const modWorkspacePath = body?.modWorkspacePath !== undefined ? String(body.modWorkspacePath || '').trim() : undefined;
  const filesystemPath = body?.filesystemPath !== undefined ? String(body.filesystemPath || '').trim() : undefined;
  const referenceRoot = body?.x4ReferenceRoot !== undefined ? String(body.x4ReferenceRoot || '').trim() : undefined;
  let deployFormat: DeployFormat | undefined;
  if (body?.deployFormat !== undefined) {
    const normalized = normalizeDeployFormat(body.deployFormat);
    if (!normalized) return { ok: false, status: 400, body: {
      success: false, code: 'UNKNOWN_DEPLOY_FORMAT',
      error: `Unknown deploy format "${String(body.deployFormat)}". Use "loose" or "catalog".`,
    } };
    deployFormat = normalized;
  }

  const previousConfig = readers.readConfig();
  const previousResolved = readers.resolveConfig(previousConfig);
  const scratch = !!previousResolved.isolatedScratch;
  if (scratch) {
    const pin = (['x4GamePath', 'modWorkspacePath', 'filesystemPath', 'x4LogPath'] as const)
      .find(field => Object.hasOwn(body ?? {}, field)
        && (typeof body![field] !== 'string' || !path.isAbsolute((body![field] as string).trim())
          || path.relative(previousResolved[field]!, (body![field] as string).trim())));
    if (pin) return { ok: false, status: 409, body: { success: false, code: 'DEV_SCRATCH_PATH_LOCKED',
      error: `The Forge Dev launcher owns ${pin}.`, field: pin } };
  }
  const nextConfig = {
    ...previousConfig,
    ...(!scratch && gamePath !== undefined ? { x4GamePath: gamePath } : {}),
    ...(!scratch && modWorkspacePath !== undefined ? { modWorkspacePath } : {}),
    ...(!scratch && filesystemPath !== undefined ? { filesystemPath } : {}),
    ...(referenceRoot !== undefined ? { x4ReferenceRoot: referenceRoot } : {}),
    ...(deployFormat !== undefined ? { deployFormat } : {}),
    ...(schemaDir !== undefined ? { xsdSchemaPath: schemaDir } : {}),
    schemaFiles: ['md.xsd', 'common.xsd'],
  };
  const resolved = readers.resolveConfig(nextConfig);
  const issues = validateDirectoryRoles(resolved, resolved.isolatedScratch ? resolved.x4GamePath : undefined);
  if (issues.length) return { ok: false, status: 400, body: { success: false,
    error: issues[0].message, code: issues[0].code, issues, resolved } };
  const schemaComplete = !!(resolved.mdExists && resolved.commonExists);
  const schemaWarning = schemaComplete ? null : schemaDir
    ? `Paths saved. Schema directory "${schemaDir}" is missing md.xsd and/or common.xsd, so schema-aware validation stays disabled until that resolves.`
    : 'Paths saved. No schema directory is set, so schema-aware validation stays disabled until you point one at a folder containing md.xsd + common.xsd.';
  return { ok: true, nextConfig, resolved, scratch, schemaComplete, schemaWarning,
    referenceRootChanged: path.resolve(previousResolved.x4ReferenceRoot) !== path.resolve(resolved.x4ReferenceRoot) };
}
