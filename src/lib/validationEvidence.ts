/** Evidence, not permission: this projection never grants a deployment or hides a finding. */
import crypto from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { classifyPath, type ExtensionProject, type ProjectFileKind } from './extensionProject';
import { validationSubjectSourceHash } from '../../shared/projectValidationInput';
import { checkXmlWellformed } from './xmlWellformed';
import { parseXmlLenient } from './xmlLite';
import { contentManifestIdentityFromRoot } from '../../shared/contentManifestIdentity';

export const VALIDATION_EVIDENCE_VERSION = 1 as const;
export interface ValidationSourceLocation {
  file: string;
  line?: number;
  column?: number;
}
export const PROJECT_CHECK_MAX_FACTS = 64;
export const MD_INITIAL_STATE_COVERAGE_CHECK = 'md.variable_initial_state';
export const isProjectCheckFactId = (value: unknown): value is string =>
  typeof value === 'string' && /^md-payload-writer\.v2:[a-f0-9]{64}$/.test(value);

export interface PayloadWriterScope {
  event: readonly [screen: string, control: string];
  keys: readonly string[];
  readerPaths: readonly string[];
  writerPaths: readonly string[];
}
interface ProjectCheckFact {
  id: string;
  files: readonly { path: string; sha256: string }[];
}
const payloadWriterCheck = 'md_lua.payload_writer_unverified';

export interface EvidenceDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code?: string;
  filePath?: string;
  sourceRef?: string;
  line?: number;
  column?: number;
  target?: ValidationSourceLocation;
  payloadWriterScope?: PayloadWriterScope;
  message: string;
}
export type MdInitialStateCause =
  | 'ambiguous_cue' | 'ambiguous_script' | 'analysis_budget' | 'duplicate_file' | 'dynamic_destination'
  | 'input_limit' | 'missing_source' | 'omitted_input' | 'omitted_paths_unlisted' | 'self_update_order' | 'unknown_effect'
  | 'unresolved_schema' | 'unsupported_effect' | 'unsupported_namespace' | 'unusable_script';
export interface MdInitialStateSample {
  line: number;
  column: number;
  element?: string;
  attribute?: string;
}
export interface MdInitialStateGapDetail {
  /** Counts reflect observed causes only. An exhausted budget may leave inputs uninspected. */
  analysisLimited: boolean;
  causes: readonly {
    code: MdInitialStateCause;
    count: number;
    locatedCount: number;
    samples: readonly MdInitialStateSample[];
  }[];
}
export interface ValidationCoverageGap {
  check: string;
  reason: string;
  filePath?: string;
  line?: number;
  column?: number;
  projectCheckFact?: ProjectCheckFact;
  mdInitialState?: MdInitialStateGapDetail;
  sourceSha256?: string;
}

export interface SkippedValidationFile {
  path: string;
  reason: string;
  directory?: true;
  sourceSha256?: string;
}

export const VALIDATION_TEXT_ENCODING_UNAVAILABLE = 'Text encoding is not losslessly decodable as UTF-8; semantic validation unavailable.';

/** Preserve original UTF-8 text, including a leading BOM and genuinely encoded U+FFFD. */
export function decodeValidationSourceText(bytes: Buffer): string | undefined {
  return isUtf8(bytes) ? bytes.toString('utf8') : undefined;
}

export function sourceInventoryGaps(skipped: readonly SkippedValidationFile[]): ValidationCoverageGap[] {
  return skipped.map(({ path, reason, sourceSha256 }) => ({ check: 'source.inventory', filePath: path, reason,
    ...(sourceSha256 === undefined ? {} : { sourceSha256 }) }));
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
    /** Optional redacted diagnostic tail; never execution or coverage authority. */
    message?: string;
    coveredFiles: readonly { path: string; size: number; sha256: string }[];
    /** Exact optional check claims reopened from the owner-approved binding. */
    coveredChecks?: readonly string[];
    /** Exact payload facts declared by this approved check before execution. */
    coveredFacts?: readonly string[];
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
  projectCheckFact?: ProjectCheckFact;
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
  payloadWriterCheck,
  'package.md_analysis_unavailable',
]);
const normalizedPath = (value: string) => value.replace(/\\/g, '/').toLowerCase();

export function readContentManifestIdentity(xml: string | undefined): {
  modId: string; modVersion: string | null; modDate: string | null;
} | null {
  const root = typeof xml === 'string' && checkXmlWellformed(xml).ok ? parseXmlLenient(xml) : null;
  return contentManifestIdentityFromRoot(root);
}

/** Name the whole grouped obligation. Current file bytes remain separate proof requirements. */
function payloadWriterFact(
  diagnostic: EvidenceDiagnostic,
  fileHash: (path: string) => string | undefined,
): ProjectCheckFact | undefined {
  const scope = diagnostic.payloadWriterScope;
  if (!scope || diagnostic.code !== payloadWriterCheck || diagnostic.severity !== 'info'
    || diagnostic.sourceRef !== `event_ui_triggered:${JSON.stringify(scope.event)}`
    || scope.event.some(value => !value || value.length > 256)
    || !scope.keys.length || scope.keys.length > 64 || scope.keys.some(key => key.length > 128)
    || !diagnostic.filePath || !scope.readerPaths.includes(diagnostic.filePath)
    || !scope.writerPaths.length || (diagnostic.target && !scope.writerPaths.includes(diagnostic.target.file))) return;
  const readers = [...scope.readerPaths].sort();
  const writers = [...scope.writerPaths].sort();
  const paths = [...readers, ...writers];
  if (paths.length > 64 || new Set(paths).size !== paths.length
    || readers.some(path => !/\.xml$/i.test(path))
    || writers.some(path => !/\.lua$/i.test(path))) return;
  const files: Array<{ path: string; sha256: string }> = [];
  for (const path of paths) {
    const sha256 = fileHash(path);
    if (!sha256) return;
    files.push({ path, sha256 });
  }
  const obligation = [scope.event, [...scope.keys].sort(), readers, writers];
  const digest = crypto.createHash('sha256').update(JSON.stringify(obligation)).digest('hex');
  return { id: `md-payload-writer.v2:${digest}`, files };
}

export function buildValidationEvidence(
  project: ExtensionProject,
  diagnostics: readonly EvidenceDiagnostic[],
  coverageGaps: readonly ValidationCoverageGap[] = [],
): ValidationEvidence {
  const sourceHash = validationSubjectSourceHash(project.files);
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
  let filesByPath: Map<string, ExtensionProject['files'][number] | null> | undefined;
  const hashes = new Map<string, string | undefined>();
  const fileHash = (path: string) => {
    if (!filesByPath) {
      filesByPath = new Map();
      for (const file of project.files) {
        const key = normalizedPath(file.path);
        filesByPath.set(key, filesByPath.has(key) ? null : file);
      }
    }
    if (!hashes.has(path)) {
      const file = filesByPath.get(normalizedPath(path));
      hashes.set(path, file?.path === path && typeof file.content === 'string'
        ? crypto.createHash('sha256').update(file.content).digest('hex') : undefined);
    }
    return hashes.get(path);
  };
  const findings = diagnostics.map(finding => {
    const category = unavailableCodes.has(finding.code || '') ? 'check-unavailable' as const : 'mod-finding' as const;
    // Bind acceptance to exact source + subject + finding, not an unstable list index.
    const findingId = crypto.createHash('sha256').update(JSON.stringify([
      VALIDATION_EVIDENCE_VERSION, modId, project.id, sourceHash, category, finding.code || '',
      normalizedPath(finding.filePath || ''), finding.sourceRef || '', finding.line ?? null,
      finding.severity, finding.message,
      ...(finding.column === undefined ? [] : [finding.column]),
    ])).digest('hex');
    const projectCheckFact = payloadWriterFact(finding, fileHash);
    const fact = projectCheckFact ? { projectCheckFact } : {};
    if (category === 'check-unavailable') gaps.push({ check: finding.code!, filePath: finding.filePath, reason: finding.message, ...fact });
    const current: ValidationEvidenceFinding = { ...finding, findingId, category };
    if (projectCheckFact) current.projectCheckFact = projectCheckFact;
    else delete current.projectCheckFact;
    return current;
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
  const factClaims = new Map<string, Map<string, string>[]>();
  for (const check of verification.checks) {
    if (check.coveredFacts?.length) {
      const files = new Map(check.coveredFiles.map(file => [file.path, file.sha256]));
      for (const id of check.coveredFacts) {
        const candidateChecks = factClaims.get(id) ?? [];
        candidateChecks.push(files);
        factClaims.set(id, candidateChecks);
      }
    }
    for (const code of check.coveredChecks ?? []) {
      if (!PROJECT_CHECK_COVERAGE_CHECKS.includes(code)) continue;
      const files = claims.get(code) ?? new Set<string>();
      for (const file of check.coveredFiles) if (/\.lua$/i.test(file.path)) files.add(file.path);
      claims.set(code, files);
    }
  }
  const gapKey = (check: string | undefined, filePath: string | undefined, reason: string, fact?: ProjectCheckFact) =>
    JSON.stringify([check, filePath, reason, fact?.id]);
  const exactFacts = new Map(evidence.findings.flatMap(finding =>
    finding.category === 'check-unavailable' && finding.code === payloadWriterCheck && finding.projectCheckFact
      ? [[gapKey(finding.code, finding.filePath, finding.message, finding.projectCheckFact), finding.projectCheckFact] as const] : []));
  const claimsFact = (gap: ValidationCoverageGap) => {
    if (gap.check !== payloadWriterCheck || !gap.projectCheckFact) return false;
    const fact = exactFacts.get(gapKey(gap.check, gap.filePath, gap.reason, gap.projectCheckFact));
    return fact && factClaims.get(fact.id)?.some(files => fact.files.every(file => files.get(file.path) === file.sha256));
  };
  const rawGaps = [...evidence.coverage.gaps, ...(evidence.coverage.projectVerification?.resolvedGaps || [])];
  const gaps: ValidationCoverageGap[] = [];
  const resolvedGaps: ValidationCoverageGap[] = [];
  const creditedGaps = new Set<string>();
  for (const gap of rawGaps) {
    if (executionGap(gap)) {
      resolvedGaps.push(gap);
    } else if (claimsFact(gap) || (gap.filePath && claims.get(gap.check)?.has(gap.filePath))) {
      resolvedGaps.push(gap);
      creditedGaps.add(gapKey(gap.check, gap.filePath, gap.reason, gap.projectCheckFact));
    } else {
      gaps.push(gap);
    }
  }
  const creditedFindingIds = evidence.findings.filter(finding => finding.category === 'check-unavailable'
    && creditedGaps.has(gapKey(finding.code, finding.filePath, finding.message, finding.projectCheckFact))).map(finding => finding.findingId);
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
