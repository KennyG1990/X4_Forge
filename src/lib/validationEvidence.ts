/** Evidence, not permission: this projection never grants a deployment or hides a finding. */
import crypto from 'node:crypto';
import { classifyPath, type ExtensionProject, type ProjectFileKind } from './extensionProject';
import { validationProjectContentHash } from './validationDelta';
import { checkXmlWellformed } from './xmlWellformed';
import { parseXmlLenient } from './xmlLite';

export const VALIDATION_EVIDENCE_VERSION = 1 as const;
export interface ValidationSourceLocation {
  file: string;
  line?: number;
  column?: number;
}
export interface EvidenceDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code?: string;
  filePath?: string;
  sourceRef?: string;
  line?: number;
  column?: number;
  target?: ValidationSourceLocation;
  message: string;
}
export interface ValidationCoverageGap {
  check: string;
  reason: string;
  filePath?: string;
}
export interface ProjectCheckVerification {
  suite: { id: string; hash: string };
  artifactHash: string;
  checks: readonly {
    id: string;
    receiptId: string;
    receiptHash: string;
    durationMs: number;
    outputBytes: number;
    outputTailSha256: string;
    coveredFiles: readonly { path: string; size: number; sha256: string }[];
    /** Exact optional check claims reopened from the owner-approved binding. */
    coveredChecks?: readonly string[];
  }[];
}
export const PROJECT_CHECK_COVERAGE_CHECKS = Object.freeze([
  'x4-ui.verification-gap', 'x4-ui.truncated-evidence', 'lua_md.emit_verification_gap',
  'md_lua.registration_verification_gap', 'lua.runtime_scope_unverified',
]);
interface ProjectCheckCoverage extends ProjectCheckVerification {
  status: 'project-verified';
  resolvedGaps: ValidationCoverageGap[];
  creditedFindingIds: string[];
  forgeComplete: boolean;
}
export interface ValidationEvidenceFinding extends EvidenceDiagnostic {
  findingId: string;
  category: 'mod-finding' | 'check-unavailable';
}
export interface ValidationEvidence {
  version: typeof VALIDATION_EVIDENCE_VERSION;
  modId: string | null;
  declaredProjectId: string;
  modVersion: string | null;
  identitySource: 'content.xml' | 'unresolved';
  sourceHash: string;
  hashScope: 'project-validation-inputs-v1';
  outcome: 'mod-findings' | 'incomplete' | 'no-known-findings';
  modErrorCount: number;
  checkUnavailableCount: number;
  coverage: { complete: boolean; gaps: ValidationCoverageGap[]; projectVerification?: ProjectCheckCoverage };
  findings: ValidationEvidenceFinding[];
}

const unavailableCodes = new Set([
  'diff.reference',
  'validation.lua_ast_unavailable', 'validation.disk_file_skipped', 'UI_SCHEMA_UNAVAILABLE',
  'x4-ui.truncated-evidence', 'x4-ui.verification-gap',
  'lua.runtime_scope_unverified',
  'lua_md.emit_verification_gap',
  'md_lua.registration_verification_gap',
  'package.md_analysis_unavailable',
]);
const normalizedPath = (value: string) => value.replace(/\\/g, '/').toLowerCase();

export function readContentManifestIdentity(xml: string | undefined): {
  modId: string; modVersion: string | null; modDate: string | null;
} | null {
  const root = typeof xml === 'string' && checkXmlWellformed(xml).ok ? parseXmlLenient(xml) : null;
  const modId = root?.nodeName === 'content' ? root.getAttribute('id')?.trim() : undefined;
  return modId ? { modId, modVersion: root?.getAttribute('version') || null, modDate: root?.getAttribute('date') || null } : null;
}

export function buildValidationEvidence(
  project: ExtensionProject,
  diagnostics: readonly EvidenceDiagnostic[],
  coverageGaps: readonly ValidationCoverageGap[] = [],
): ValidationEvidence {
  // Reuse the canonical validation hasher, but encode presence and declared kind too:
  // absent source must not have the same identity as an inspected empty file.
  const sourceHash = validationProjectContentHash(project.files.map(file => ({
    path: file.path,
    content: JSON.stringify([file.kind, typeof file.content === 'string', file.content ?? null]),
  })));
  const manifests = project.files.filter(file => normalizedPath(file.path) === 'content.xml');
  const manifest = manifests.length === 1 ? readContentManifestIdentity(manifests[0].content) : null;
  const modId = manifest?.modId ?? null;
  const modVersion = manifest?.modVersion ?? null;
  const gaps: ValidationCoverageGap[] = [...coverageGaps];
  if (!modId) gaps.push({ check: 'subject.identity', reason: 'No unique well-formed content.xml with a mod ID was available.' });
  if (!project.files.length) gaps.push({ check: 'source.inventory', reason: 'No files were supplied.' });
  for (const file of project.files) {
    if (typeof file.content !== 'string') gaps.push({ check: 'source.content', filePath: file.path, reason: 'File content was not supplied; the file was not validated.' });
  }
  const findings = diagnostics.map(finding => {
    const category = unavailableCodes.has(finding.code || '') ? 'check-unavailable' as const : 'mod-finding' as const;
    // Bind acceptance to exact source + subject + finding, not an unstable list index.
    const findingId = crypto.createHash('sha256').update(JSON.stringify([
      VALIDATION_EVIDENCE_VERSION, modId, project.id, sourceHash, category, finding.code || '',
      normalizedPath(finding.filePath || ''), finding.sourceRef || '', finding.line ?? null,
      finding.severity, finding.message,
      ...(finding.column === undefined ? [] : [finding.column]),
    ])).digest('hex');
    if (category === 'check-unavailable') gaps.push({ check: finding.code!, filePath: finding.filePath, reason: finding.message });
    return { ...finding, findingId, category };
  });
  const uniqueGaps = [...new Map(gaps.map(gap => [JSON.stringify(gap), gap])).values()];
  const modErrorCount = findings.filter(finding => finding.category === 'mod-finding' && finding.severity === 'error').length;
  return {
    version: VALIDATION_EVIDENCE_VERSION, modId, declaredProjectId: project.id,
    modVersion, identitySource: modId ? 'content.xml' : 'unresolved', sourceHash,
    hashScope: 'project-validation-inputs-v1',
    outcome: modErrorCount ? 'mod-findings' : uniqueGaps.length ? 'incomplete' : 'no-known-findings',
    modErrorCount, checkUnavailableCount: uniqueGaps.length,
    coverage: { complete: uniqueGaps.length === 0, gaps: uniqueGaps }, findings,
  };
}

/** Project a verified suite only onto evidence built from the same frozen artifact. */
export function applyProjectCheckCoverage(evidence: ValidationEvidence, verification: ProjectCheckVerification): ValidationEvidence {
  const coveredPaths = new Set(verification.checks.flatMap(check => check.coveredFiles.map(file => file.path)));
  const executionGap = (gap: ValidationCoverageGap) => gap.check === 'project-checks.execution' && gap.filePath === 'forge.checks.json';
  const uiGap = 'x4-ui.verification-gap';
  const claims = new Map<string, Set<string>>([[uiGap, coveredPaths]]);
  for (const check of verification.checks) {
    for (const code of check.coveredChecks ?? []) {
      if (!PROJECT_CHECK_COVERAGE_CHECKS.includes(code)) continue;
      const files = claims.get(code) ?? new Set<string>();
      for (const file of check.coveredFiles) if (/\.lua$/i.test(file.path)) files.add(file.path);
      claims.set(code, files);
    }
  }
  const gapKey = (check: string | undefined, filePath: string | undefined, reason: string) => JSON.stringify([check, filePath, reason]);
  const rawGaps = [...evidence.coverage.gaps, ...(evidence.coverage.projectVerification?.resolvedGaps || [])];
  const gaps: ValidationCoverageGap[] = [];
  const resolvedGaps: ValidationCoverageGap[] = [];
  const creditedGaps = new Set<string>();
  for (const gap of rawGaps) {
    if (executionGap(gap)) {
      resolvedGaps.push(gap);
    } else if (gap.filePath && claims.get(gap.check)?.has(gap.filePath)) {
      resolvedGaps.push(gap);
      creditedGaps.add(gapKey(gap.check, gap.filePath, gap.reason));
    } else {
      gaps.push(gap);
    }
  }
  const creditedFindingIds = evidence.findings.filter(finding => finding.category === 'check-unavailable'
    && creditedGaps.has(gapKey(finding.code, finding.filePath, finding.message))).map(finding => finding.findingId);
  return {
    ...evidence,
    outcome: evidence.modErrorCount ? 'mod-findings' : gaps.length ? 'incomplete' : 'no-known-findings',
    checkUnavailableCount: gaps.length,
    coverage: {
      complete: gaps.length === 0,
      gaps,
      projectVerification: { ...verification, status: 'project-verified', resolvedGaps, creditedFindingIds,
        forgeComplete: rawGaps.every(executionGap) },
    },
  };
}

export class ValidationInputError extends Error {
  readonly code = 'VALIDATION_INPUT_INVALID';
}
const kinds = new Set<ProjectFileKind>(['md', 'lua', 'ui', 'content', 't', 'library', 'aiscript', 'other']);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Reject malformed inputs, rather than sanitizing them into an unrelated empty project. */
export function parseValidationProject(value: unknown): ExtensionProject {
  if (!object(value) || typeof value.id !== 'string' || !value.id.trim()
    || value.id.length > 256 || typeof value.name !== 'string' || value.name.length > 512
    || !Array.isArray(value.files) || value.files.length > 2000) {
    throw new ValidationInputError('project requires a nonempty id, name string and at most 2000 files.');
  }
  const seen = new Set<string>();
  const files = value.files.map((file: unknown, index: number) => {
    if (!object(file) || typeof file.path !== 'string' || !file.path || file.path.length > 1024
      || file.path.includes(':') || [...file.path].some(char => char.charCodeAt(0) < 32) || /^[\\/]/.test(file.path)
      || file.path.replace(/\\/g, '/').split('/').some(part => !part || part === '.' || part === '..')
      || (file.content !== undefined && typeof file.content !== 'string')
      || (file.kind !== undefined && !kinds.has(file.kind as ProjectFileKind))) {
      throw new ValidationInputError(`project.files[${index}] requires a safe relative path, optional valid kind and optional string content.`);
    }
    const key = normalizedPath(file.path);
    if (seen.has(key)) throw new ValidationInputError(`Duplicate/case-colliding project path: ${file.path}`);
    seen.add(key);
    return { path: file.path, kind: (file.kind as ProjectFileKind | undefined) || classifyPath(file.path),
      ...(typeof file.content === 'string' ? { content: file.content } : {}) };
  });
  return { id: value.id, name: value.name, files };
}
