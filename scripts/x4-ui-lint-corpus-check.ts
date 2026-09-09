import fs from 'fs';
import path from 'path';

import { latestPath } from '../src/lib/instanceDiscovery';
import { analyzeLuaFiles, type LuaFileInput, type LuaStaticAnalysisResult, type LuaStaticX4UiFileResult, type LuaStaticX4UiSummary } from '../src/lib/luaStaticAnalysis';
import type { ReferenceManifestFile } from '../src/lib/referenceManifest';

const MAX_FATAL_FINDINGS = 100;
const MANIFEST_PAGE_SIZE = 500;
const MAX_MANIFEST_PAGES = 10_000;
const HTTP_TIMEOUT_MS = 30_000;

/** The only analyzer finding that is out of scope for the trusted official-source census. */
export const X4_UI_CORPUS_NOT_APPLICABLE_CODE = 'lua.restricted_online_call';
export const X4_UI_CORPUS_NOT_APPLICABLE_REASON = 'Not applicable only for this trusted official base/DLC source census: the lua.restricted_online_call rule is scoped to non-verified sources. The finding remains visible here and is not disabled for mod validation.';

export interface X4UiCorpusReadFailure {
  path: string;
  reason: string;
}

export interface X4UiCorpusFatalFinding {
  code: string;
  path: string;
  line: number | null;
  message: string;
}

export interface X4UiCorpusNotApplicableFinding extends X4UiCorpusFatalFinding {
  severity: string;
  reason: string;
}

export interface X4UiCorpusFindingClassification {
  applicableFatalFindings: X4UiCorpusFatalFinding[];
  notApplicableFindings: X4UiCorpusNotApplicableFinding[];
  applicableFatalErrors: number;
  notApplicableCount: number;
  notApplicableErrors: number;
  warnings: number;
}

export interface X4UiCorpusSelftestCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface X4UiCorpusSelftestResult {
  pass: boolean;
  checks: X4UiCorpusSelftestCheck[];
}

type X4UiVerificationGapCategoryValue = LuaStaticX4UiFileResult['result']['verificationGaps'][number]['category'];
type X4UiVerificationGapStatusValue = LuaStaticX4UiFileResult['result']['verificationGaps'][number]['status'];

export const X4_UI_VERIFICATION_GAP_INVALID_EVIDENCE_BUCKET = 'invalid-evidence';

type X4UiVerificationGapCensusCategory = X4UiVerificationGapCategoryValue | typeof X4_UI_VERIFICATION_GAP_INVALID_EVIDENCE_BUCKET;
type X4UiVerificationGapCensusStatus = X4UiVerificationGapStatusValue | typeof X4_UI_VERIFICATION_GAP_INVALID_EVIDENCE_BUCKET;

export interface X4UiVerificationGapCensusBucket {
  category: X4UiVerificationGapCensusCategory;
  status: X4UiVerificationGapCensusStatus;
  gapCount: number;
  affectedFileCount: number;
  representativePaths: string[];
}

export interface X4UiVerificationGapCensusTopFile {
  path: string;
  gapCount: number;
  categories: X4UiVerificationGapCensusCategory[];
  statuses: X4UiVerificationGapCensusStatus[];
  truncated: boolean;
}

export interface X4UiVerificationGapCensus {
  totalGaps: number;
  affectedFiles: number;
  byCategoryStatus: X4UiVerificationGapCensusBucket[];
  topFiles: X4UiVerificationGapCensusTopFile[];
  evidenceComplete: boolean;
  incompletenessReasons: string[];
}

export interface X4UiVerificationGapCensusContext {
  manifestAvailable: boolean;
  manifestCurrent: boolean;
  manifestComplete: boolean;
  selectedPaths: readonly string[];
  readPaths: readonly string[];
  filesFailed: number;
}

export interface X4UiCorpusReport {
  status: 'no-known-fatal' | 'no-known-fatal-static-gaps' | 'fatal-findings' | 'read-failures' | 'manifest-unavailable';
  authorityBaseUrl: string | null;
  configuredRoot: string;
  manifestGeneration: string | null;
  manifestState: string | null;
  manifestError: string | null;
  filesSelected: number;
  filesRead: number;
  filesFailed: number;
  bytes: number;
  elapsedMs: number;
  selectedPaths: string[];
  readPaths: string[];
  failedFiles: X4UiCorpusReadFailure[];
  x4UiFiles: number;
  /** Backward-compatible alias for applicableFatalErrors. */
  fatalErrors: number;
  applicableFatalErrors: number;
  notApplicableCount: number;
  notApplicableErrors: number;
  notApplicableReason: string;
  notApplicableFindings: X4UiCorpusNotApplicableFinding[];
  warnings: number;
  unverifiedFiles: number;
  truncatedFiles: number;
  verificationGaps: number;
  fatalFindings: X4UiCorpusFatalFinding[];
  fatalFindingsTruncated: boolean;
  x4UiSummary: LuaStaticX4UiSummary;
  x4UiVerificationGapCensus: X4UiVerificationGapCensus;
  exitCode: 0 | 1;
}

interface ReadSelectedFilesResult {
  files: LuaFileInput[];
  readPaths: string[];
  failedFiles: X4UiCorpusReadFailure[];
  bytes: number;
}

interface ParsedManifestStatus {
  available: boolean;
  state: string;
  current: boolean;
  root: string | null;
  generation: string | null;
}

interface ParsedManifestPage {
  generation: string;
  total: number;
  files: ReferenceManifestFile[];
}

interface AuthorityBaseUrlResult {
  baseUrl: string;
  source: 'override' | 'discovery';
}

const EMPTY_X4_UI_SUMMARY: LuaStaticX4UiSummary = {
  filesAnalyzed: 0,
  errorCount: 0,
  warningCount: 0,
  verificationGapCount: 0,
  filesWithErrors: 0,
  filesWithWarnings: 0,
  cleanCount: 0,
  unverifiedCount: 0,
  truncatedCount: 0,
};

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeManifestPath(manifestPath: string): string {
  return manifestPath.replace(/\\/g, '/');
}

const X4_UI_VERIFICATION_GAP_CATEGORIES: readonly X4UiVerificationGapCategoryValue[] = [
  'parse',
  'unsupported',
  'count',
  'index',
  'span',
  'width',
  'percentage',
  'height',
  'layer',
  'menu',
  'data-flow',
  'text',
  'edit-box',
  'fontsize',
  'property',
  'scale',
  'truncated',
];

const X4_UI_VERIFICATION_GAP_STATUSES: readonly X4UiVerificationGapStatusValue[] = [
  'static',
  'dynamic',
  'unknown',
  'unsupported',
];

function isX4UiVerificationGapCategory(value: unknown): value is X4UiVerificationGapCategoryValue {
  return typeof value === 'string'
    && X4_UI_VERIFICATION_GAP_CATEGORIES.includes(value as X4UiVerificationGapCategoryValue);
}

function isX4UiVerificationGapStatus(value: unknown): value is X4UiVerificationGapStatusValue {
  return typeof value === 'string'
    && X4_UI_VERIFICATION_GAP_STATUSES.includes(value as X4UiVerificationGapStatusValue);
}

function safeCensusRelativePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeManifestPath(value.trim());
  if (!normalized || normalized.includes('\0')) return null;
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  if (normalized.split('/').some(segment => segment === '..')) return null;

  const posixNormalized = path.posix.normalize(normalized);
  if (
    posixNormalized === '.'
    || posixNormalized === '..'
    || posixNormalized.startsWith('../')
    || posixNormalized.startsWith('/')
  ) return null;
  return posixNormalized;
}

function nonNegativeSafeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function comparablePath(value: unknown, index: number): string {
  return typeof value === 'string' ? normalizeManifestPath(value) : `__invalid_path_${index}`;
}

function samePathSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false;
  }
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Converts only an integer TCP port into the loopback authority used by Forge. */
export function loopbackBaseUrlFromPort(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65_535) return null;
  return `http://127.0.0.1:${value}`;
}

/** Accepts only an HTTP 127.0.0.1 origin with an explicit valid port. */
export function parseLoopbackBaseUrl(value: string): string | null {
  if (!value.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port) return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return null;
  return loopbackBaseUrlFromPort(Number(parsed.port));
}

export function parseForgeManifestStatus(payload: unknown): ParsedManifestStatus {
  const outer = asRecord(payload);
  const manifest = asRecord(outer?.manifest) || outer;
  const current = asRecord(manifest?.current);
  return {
    available: manifest?.available === true,
    state: nonEmptyString(manifest?.state) || 'invalid',
    current: !!current,
    root: nonEmptyString(current?.root) || nonEmptyString(manifest?.root) || nonEmptyString(outer?.root),
    generation: nonEmptyString(current?.generation)
      || nonEmptyString(manifest?.manifestGeneration)
      || nonEmptyString(outer?.manifestGeneration),
  };
}

function isReferenceManifestFile(value: unknown): value is ReferenceManifestFile {
  const candidate = asRecord(value);
  return !!candidate
    && typeof candidate.path === 'string'
    && typeof candidate.extension === 'string'
    && typeof candidate.source === 'string'
    && typeof candidate.domain === 'string'
    && typeof candidate.role === 'string'
    && typeof candidate.authority === 'string'
    && typeof candidate.consumer === 'string'
    && typeof candidate.bytes === 'number'
    && typeof candidate.mtimeMs === 'number';
}

export function parseManifestPage(payload: unknown, expectedGeneration: string): ParsedManifestPage | null {
  const page = asRecord(payload);
  const generation = page?.generation;
  const total = page?.total;
  const files = page?.files;
  if (typeof generation !== 'string' || generation !== expectedGeneration || typeof total !== 'number' || !Number.isInteger(total) || total < 0) return null;
  if (!Array.isArray(files) || files.length > MANIFEST_PAGE_SIZE || !files.every(isReferenceManifestFile)) return null;
  return { generation, total, files };
}

export function buildManifestPageUrl(baseUrl: string, offset: number): string {
  const url = new URL('/api/reference/manifest', baseUrl);
  url.search = new URLSearchParams({
    extension: '.lua',
    limit: String(MANIFEST_PAGE_SIZE),
    offset: String(offset),
  }).toString();
  return url.toString();
}

function authorityBaseUrl(override?: string): AuthorityBaseUrlResult {
  const selectedOverride = override?.trim() || process.env.X4_FORGE_BASE_URL?.trim();
  if (selectedOverride) {
    const baseUrl = parseLoopbackBaseUrl(selectedOverride);
    if (!baseUrl) throw new Error('X4_FORGE_BASE_URL/--base-url must be an HTTP 127.0.0.1 URL with an integer port.');
    return { baseUrl, source: 'override' };
  }

  const discoveryFile = latestPath();
  let record: Record<string, unknown>;
  try {
    record = asRecord(JSON.parse(fs.readFileSync(discoveryFile, 'utf8'))) || {};
  } catch (error) {
    throw new Error(`Could not read running Forge discovery record ${discoveryFile}: ${errorText(error)}`);
  }
  const baseUrl = loopbackBaseUrlFromPort(record.port);
  if (!baseUrl) throw new Error(`Running Forge discovery record ${discoveryFile} has no valid integer loopback port.`);
  return { baseUrl, source: 'discovery' };
}

function compareManifestFiles(left: ReferenceManifestFile, right: ReferenceManifestFile): number {
  return compareStrings(normalizeManifestPath(left.path), normalizeManifestPath(right.path))
    || compareStrings(left.source, right.source)
    || compareStrings(left.domain, right.domain);
}

/** Selects only official base/DLC UI Lua from the existing manifest authority. */
export function selectOfficialLuaEntries(entries: readonly ReferenceManifestFile[]): ReferenceManifestFile[] {
  return entries
    .filter(entry => entry.extension.toLowerCase() === '.lua')
    .filter(entry => entry.source === 'base' || /^ego_dlc_/.test(entry.source))
    .filter(entry => entry.domain === 'ui' || entry.domain === 'subst_lua')
    .slice()
    .sort(compareManifestFiles);
}

/** Resolves a manifest path only when it is a non-root path beneath the configured root. */
export function resolveContainedPath(rootInput: string, manifestPath: string): string | null {
  if (!rootInput || !manifestPath) return null;
  const root = path.resolve(rootInput);
  const candidate = path.resolve(root, manifestPath);
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return candidate;
}

export function isPathContained(rootInput: string, candidatePath: string): boolean {
  return resolveContainedPath(rootInput, candidatePath) !== null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getJson(baseUrl: string, endpoint: string): Promise<unknown> {
  const response = await fetch(new URL(endpoint, baseUrl), {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${endpoint} returned HTTP ${response.status}.`);
  return response.json();
}

async function listManifestFiles(baseUrl: string, expectedGeneration: string): Promise<ReferenceManifestFile[]> {
  const files: ReferenceManifestFile[] = [];
  let expectedTotal: number | null = null;
  let offset = 0;
  let pages = 0;

  while (expectedTotal === null || offset < expectedTotal) {
    pages++;
    if (pages > MAX_MANIFEST_PAGES) throw new Error(`Manifest pagination exceeded the ${MAX_MANIFEST_PAGES}-page safety bound.`);
    const endpoint = buildManifestPageUrl(baseUrl, offset);
    const page = parseManifestPage(await getJson(baseUrl, endpoint), expectedGeneration);
    if (!page) throw new Error(`Manifest page at offset ${offset} was malformed or did not match generation ${expectedGeneration}.`);
    if (expectedTotal === null) expectedTotal = page.total;
    else if (page.total !== expectedTotal) throw new Error(`Manifest total changed during pagination (${expectedTotal} -> ${page.total}).`);

    files.push(...page.files);
    offset += page.files.length;
    if (offset < expectedTotal && page.files.length === 0) throw new Error(`Manifest pagination returned no files before total ${expectedTotal}.`);
    if (offset < expectedTotal && page.files.length < MANIFEST_PAGE_SIZE) {
      throw new Error(`Manifest pagination returned a short page at offset ${offset - page.files.length} before total ${expectedTotal}.`);
    }
  }

  if (expectedTotal !== files.length) throw new Error(`Manifest pagination read ${files.length} files but reported total ${expectedTotal}.`);
  return files;
}

function readSelectedFiles(root: string, entries: readonly ReferenceManifestFile[]): ReadSelectedFilesResult {
  const files: LuaFileInput[] = [];
  const readPaths: string[] = [];
  const failedFiles: X4UiCorpusReadFailure[] = [];
  let bytes = 0;

  for (const entry of entries) {
    const rel = normalizeManifestPath(entry.path);
    const absolute = resolveContainedPath(root, rel);
    if (!absolute) {
      failedFiles.push({ path: rel, reason: 'manifest path is outside the configured reference root' });
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(absolute);
    } catch (error) {
      failedFiles.push({ path: rel, reason: `could not stat file: ${errorText(error)}` });
      continue;
    }

    if (!stat.isFile()) {
      failedFiles.push({ path: rel, reason: 'manifest path is not a regular file' });
      continue;
    }

    let content: Buffer;
    try {
      content = fs.readFileSync(absolute);
    } catch (error) {
      failedFiles.push({ path: rel, reason: `could not read file: ${errorText(error)}` });
      continue;
    }

    bytes += content.byteLength;
    readPaths.push(rel);
    files.push({
      rel,
      text: content.toString('utf8'),
      source: 'loose',
      sourcePath: absolute,
      extension: { folder: entry.source, id: entry.source, name: entry.source },
    });
  }

  return { files, readPaths, failedFiles, bytes };
}

function sortReadFailures(failures: readonly X4UiCorpusReadFailure[]): X4UiCorpusReadFailure[] {
  return failures.slice().sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.reason, right.reason));
}

function fatalFindingSort(left: X4UiCorpusFatalFinding, right: X4UiCorpusFatalFinding): number {
  return compareStrings(left.path, right.path)
    || ((left.line ?? 0) - (right.line ?? 0))
    || compareStrings(left.code, right.code)
    || compareStrings(left.message, right.message);
}

function toFatalFinding(finding: LuaStaticAnalysisResult['findings'][number]): X4UiCorpusFatalFinding {
  return {
    code: finding.code,
    path: finding.rel,
    line: finding.line ?? null,
    message: finding.message,
  };
}

type LuaStaticFinding = LuaStaticAnalysisResult['findings'][number];

/** Classifies only the exact trusted-source exception; all other errors remain applicable. */
export function isCorpusFindingNotApplicable(finding: Pick<LuaStaticFinding, 'code'>): boolean {
  return finding.code === X4_UI_CORPUS_NOT_APPLICABLE_CODE;
}

function toNotApplicableFinding(finding: LuaStaticFinding): X4UiCorpusNotApplicableFinding {
  return {
    ...toFatalFinding(finding),
    severity: finding.severity,
    reason: X4_UI_CORPUS_NOT_APPLICABLE_REASON,
  };
}

export function classifyCorpusFindings(findings: readonly LuaStaticFinding[]): X4UiCorpusFindingClassification {
  const notApplicableFindings = findings
    .filter(isCorpusFindingNotApplicable)
    .map(toNotApplicableFinding)
    .sort(fatalFindingSort);
  const applicableFatalFindings = findings
    .filter(finding => finding.severity === 'error' && !isCorpusFindingNotApplicable(finding))
    .map(toFatalFinding)
    .sort(fatalFindingSort);
  return {
    applicableFatalFindings,
    notApplicableFindings,
    applicableFatalErrors: applicableFatalFindings.length,
    notApplicableCount: notApplicableFindings.length,
    notApplicableErrors: notApplicableFindings.filter(finding => finding.severity === 'error').length,
    warnings: findings.filter(finding => finding.severity === 'warning').length,
  };
}

export function corpusExitCode(applicableFatalErrors: number, filesFailed: number): 0 | 1 {
  return applicableFatalErrors > 0 || filesFailed > 0 ? 1 : 0;
}

interface X4UiVerificationGapBucketAccumulator {
  category: X4UiVerificationGapCensusCategory;
  status: X4UiVerificationGapCensusStatus;
  gapCount: number;
  fileKeys: Set<string>;
  representativePaths: Set<string>;
}

interface X4UiVerificationGapFileAccumulator {
  path: string | null;
  gapCount: number;
  categories: Set<X4UiVerificationGapCensusCategory>;
  statuses: Set<X4UiVerificationGapCensusStatus>;
  truncated: boolean;
}

function emptyX4UiVerificationGapCensus(reason: string): X4UiVerificationGapCensus {
  return {
    totalGaps: 0,
    affectedFiles: 0,
    byCategoryStatus: [],
    topFiles: [],
    evidenceComplete: false,
    incompletenessReasons: [reason],
  };
}

/** Pure, bounded aggregation of the existing per-file X4 UI verification-gap results. */
export function aggregateX4UiVerificationGapCensus(
  x4UiResults: readonly LuaStaticX4UiFileResult[],
  x4UiSummary: LuaStaticX4UiSummary,
  context: X4UiVerificationGapCensusContext,
): X4UiVerificationGapCensus {
  const reasons = new Set<string>();
  const addReason = (reason: string): void => {
    reasons.add(reason);
  };
  const contextRecord = asRecord(context);
  const selectedValue = contextRecord?.selectedPaths;
  const readValue = contextRecord?.readPaths;
  const selectedPaths = Array.isArray(selectedValue) ? selectedValue : [];
  const readPaths = Array.isArray(readValue) ? readValue : [];
  const results = Array.isArray(x4UiResults) ? x4UiResults : [];
  const summaryRecord = asRecord(x4UiSummary);
  let resultShapeInvalid = !Array.isArray(x4UiResults)
    || !Array.isArray(selectedValue)
    || !Array.isArray(readValue)
    || !summaryRecord;

  const filesFailedValue = nonNegativeSafeInteger(contextRecord?.filesFailed);
  const filesFailed = filesFailedValue ?? 0;
  if (filesFailedValue === null) resultShapeInvalid = true;

  const summaryTruncatedCountValue = nonNegativeSafeInteger(summaryRecord?.truncatedCount);
  const summaryTruncatedCount = summaryTruncatedCountValue ?? 0;
  if (summaryTruncatedCountValue === null) resultShapeInvalid = true;

  const representedRawPaths = results.map(result => asRecord(result)?.rel);
  const selectedComparable = selectedPaths.map((value, index) => comparablePath(value, index));
  const readComparable = readPaths.map((value, index) => comparablePath(value, index));
  const representedComparable = representedRawPaths.map((value, index) => comparablePath(value, index));
  const coverageHasDuplicates = [selectedComparable, readComparable, representedComparable]
    .some(values => new Set(values).size !== values.length);
  const coverageCountsMatch = selectedPaths.length === readPaths.length
    && readPaths.length === results.length
    && filesFailed === 0;
  const coverageSetsMatch = samePathSet(selectedComparable, readComparable)
    && samePathSet(selectedComparable, representedComparable);
  if (!coverageCountsMatch || coverageHasDuplicates || !coverageSetsMatch) {
    addReason(`result-coverage-mismatch: selected=${selectedPaths.length}, read=${readPaths.length}, represented=${results.length}`);
  }

  if (contextRecord?.manifestAvailable !== true || contextRecord?.manifestCurrent !== true) {
    addReason('manifest-unavailable');
  } else if (contextRecord.manifestComplete !== true) {
    addReason('manifest-incomplete');
  }
  if (filesFailed > 0) addReason(`read-failure: ${filesFailed}`);

  let unsafePathCount = 0;
  for (const value of [...selectedPaths, ...readPaths, ...representedRawPaths]) {
    if (!safeCensusRelativePath(value)) unsafePathCount += 1;
  }
  if (unsafePathCount > 0) addReason(`unsafe-path: ${unsafePathCount} path(s) omitted from bounded census fields`);

  const buckets = new Map<string, X4UiVerificationGapBucketAccumulator>();
  const files = new Map<string, X4UiVerificationGapFileAccumulator>();
  let declaredPerFileGapCount = 0;
  let invalidPerFileGapCounts = 0;
  let observedStructuredGapCount = 0;
  let invalidCategoryStatusCount = 0;
  let observedTruncatedFiles = 0;

  for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
    const resultEntry = asRecord(results[resultIndex]);
    const safePath = safeCensusRelativePath(resultEntry?.rel);
    const resultRecord = asRecord(resultEntry?.result);
    if (!resultEntry || !resultRecord) {
      resultShapeInvalid = true;
      continue;
    }

    const declaredCount = nonNegativeSafeInteger(resultRecord.verificationGapCount);
    if (declaredCount === null) invalidPerFileGapCounts += 1;
    else declaredPerFileGapCount += declaredCount;

    const rawGaps = resultRecord.verificationGaps;
    if (!Array.isArray(rawGaps)) {
      resultShapeInvalid = true;
      continue;
    }
    const truncated = resultRecord.hasTruncatedEvidence === true || resultRecord.verificationGapsTruncated === true;
    if (truncated) observedTruncatedFiles += 1;
    const fileKey = safePath ?? `__unsafe_file_${resultIndex}`;

    for (const rawGap of rawGaps) {
      observedStructuredGapCount += 1;
      const gapRecord = asRecord(rawGap);
      const categoryValue = gapRecord?.category;
      const statusValue = gapRecord?.status;
      const categoryValid = isX4UiVerificationGapCategory(categoryValue);
      const statusValid = isX4UiVerificationGapStatus(statusValue);
      const validEvidence = categoryValid && statusValid;
      if (!validEvidence) invalidCategoryStatusCount += 1;
      const category: X4UiVerificationGapCensusCategory = validEvidence
        ? categoryValue
        : X4_UI_VERIFICATION_GAP_INVALID_EVIDENCE_BUCKET;
      const status: X4UiVerificationGapCensusStatus = validEvidence
        ? statusValue
        : X4_UI_VERIFICATION_GAP_INVALID_EVIDENCE_BUCKET;
      const bucketKey = `${category}\u0000${status}`;
      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          category,
          status,
          gapCount: 0,
          fileKeys: new Set<string>(),
          representativePaths: new Set<string>(),
        };
        buckets.set(bucketKey, bucket);
      }
      bucket.gapCount += 1;
      bucket.fileKeys.add(fileKey);
      if (safePath) bucket.representativePaths.add(safePath);

      let file = files.get(fileKey);
      if (!file) {
        file = {
          path: safePath,
          gapCount: 0,
          categories: new Set<X4UiVerificationGapCensusCategory>(),
          statuses: new Set<X4UiVerificationGapCensusStatus>(),
          truncated,
        };
        files.set(fileKey, file);
      }
      file.gapCount += 1;
      file.categories.add(category);
      file.statuses.add(status);
      file.truncated = file.truncated || truncated;
    }
  }

  if (invalidPerFileGapCounts > 0) addReason(`verification-gap-count-invalid: ${invalidPerFileGapCounts}`);
  if (invalidCategoryStatusCount > 0) addReason(`invalid-category-status: ${invalidCategoryStatusCount}`);
  const truncatedFiles = Math.max(summaryTruncatedCount, observedTruncatedFiles);
  if (truncatedFiles > 0) addReason(`truncated-files: ${truncatedFiles}`);
  if (summaryTruncatedCount !== observedTruncatedFiles) {
    addReason(`truncation-count-mismatch: summary=${summaryTruncatedCount}, observed=${observedTruncatedFiles}`);
  }

  const bucketValues = [...buckets.values()].sort((left, right) =>
    compareStrings(left.category, right.category) || compareStrings(left.status, right.status));
  const byCategoryStatus = bucketValues.map(bucket => ({
    category: bucket.category,
    status: bucket.status,
    gapCount: bucket.gapCount,
    affectedFileCount: bucket.fileKeys.size,
    representativePaths: [...bucket.representativePaths].sort(compareStrings).slice(0, 3),
  }));
  const aggregateBucketGapCount = bucketValues.reduce((total, bucket) => total + bucket.gapCount, 0);
  if (
    declaredPerFileGapCount !== observedStructuredGapCount
    || observedStructuredGapCount !== aggregateBucketGapCount
    || declaredPerFileGapCount !== aggregateBucketGapCount
  ) {
    addReason(`verification-gap-count-mismatch: per-file=${declaredPerFileGapCount}, observed=${observedStructuredGapCount}, aggregate=${aggregateBucketGapCount}`);
  }

  const topFiles = [...files.values()]
    .filter(file => file.path !== null)
    .sort((left, right) => right.gapCount - left.gapCount || compareStrings(left.path!, right.path!))
    .slice(0, 12)
    .map(file => ({
      path: file.path!,
      gapCount: file.gapCount,
      categories: [...file.categories].sort(compareStrings),
      statuses: [...file.statuses].sort(compareStrings),
      truncated: file.truncated,
    }));

  if (resultShapeInvalid) addReason('result-shape-invalid');
  return {
    totalGaps: observedStructuredGapCount,
    affectedFiles: files.size,
    byCategoryStatus,
    topFiles,
    evidenceComplete: reasons.size === 0,
    incompletenessReasons: [...reasons].sort(compareStrings),
  };
}

function guidanceForManifest(status: ParsedManifestStatus): string {
  return `Forge /api/reference/status is not ready/current (available=${status.available}, state=${status.state}, generation=${status.generation || '(none)'}). No /api/reference/manifest request was made; refresh through the existing Forge reference-manifest owner, then rerun this read-only census.`;
}

function baseReport(startedAt: number, authorityUrl: string | null, configuredRoot: string, manifestState: string | null): X4UiCorpusReport {
  return {
    status: 'manifest-unavailable',
    authorityBaseUrl: authorityUrl,
    configuredRoot,
    manifestGeneration: null,
    manifestState,
    manifestError: null,
    filesSelected: 0,
    filesRead: 0,
    filesFailed: 0,
    bytes: 0,
    elapsedMs: Date.now() - startedAt,
    selectedPaths: [],
    readPaths: [],
    failedFiles: [],
    x4UiFiles: 0,
    fatalErrors: 0,
    applicableFatalErrors: 0,
    notApplicableCount: 0,
    notApplicableErrors: 0,
    notApplicableReason: X4_UI_CORPUS_NOT_APPLICABLE_REASON,
    notApplicableFindings: [],
    warnings: 0,
    unverifiedFiles: 0,
    truncatedFiles: 0,
    verificationGaps: 0,
    fatalFindings: [],
    fatalFindingsTruncated: false,
    x4UiSummary: { ...EMPTY_X4_UI_SUMMARY },
    x4UiVerificationGapCensus: emptyX4UiVerificationGapCensus('manifest-unavailable'),
    exitCode: 1,
  };
}

function finishReport(
  report: X4UiCorpusReport,
  startedAt: number,
  selectedEntries: readonly ReferenceManifestFile[],
  readResult: ReadSelectedFilesResult,
  analysis: LuaStaticAnalysisResult,
): X4UiCorpusReport {
  const classification = classifyCorpusFindings(analysis.findings);
  const allFatalFindings = classification.applicableFatalFindings;
  const x4UiSummary = analysis.x4UiSummary;
  const selectedPaths = selectedEntries.map(entry => normalizeManifestPath(entry.path));
  const failedFiles = sortReadFailures(readResult.failedFiles);
  const x4UiVerificationGapCensus = aggregateX4UiVerificationGapCensus(
    analysis.x4UiResults,
    x4UiSummary,
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths,
      readPaths: readResult.readPaths,
      filesFailed: failedFiles.length,
    },
  );
  const hasStaticGaps = analysis.findings.some(finding => finding.severity === 'warning')
    || x4UiSummary.verificationGapCount > 0
    || x4UiSummary.unverifiedCount > 0
    || x4UiSummary.truncatedCount > 0;
  const status: X4UiCorpusReport['status'] = allFatalFindings.length > 0
    ? 'fatal-findings'
    : failedFiles.length > 0
      ? 'read-failures'
      : hasStaticGaps
        ? 'no-known-fatal-static-gaps'
        : 'no-known-fatal';

  return {
    ...report,
    status,
    manifestGeneration: report.manifestGeneration,
    filesSelected: selectedEntries.length,
    filesRead: readResult.files.length,
    filesFailed: failedFiles.length,
    bytes: readResult.bytes,
    elapsedMs: Date.now() - startedAt,
    selectedPaths,
    readPaths: readResult.readPaths.slice().sort(compareStrings),
    failedFiles,
    x4UiFiles: x4UiSummary.filesAnalyzed,
    fatalErrors: classification.applicableFatalErrors,
    applicableFatalErrors: classification.applicableFatalErrors,
    notApplicableCount: classification.notApplicableCount,
    notApplicableErrors: classification.notApplicableErrors,
    notApplicableReason: X4_UI_CORPUS_NOT_APPLICABLE_REASON,
    notApplicableFindings: classification.notApplicableFindings,
    warnings: classification.warnings,
    unverifiedFiles: x4UiSummary.unverifiedCount,
    truncatedFiles: x4UiSummary.truncatedCount,
    verificationGaps: x4UiSummary.verificationGapCount,
    fatalFindings: allFatalFindings.slice(0, MAX_FATAL_FINDINGS),
    fatalFindingsTruncated: allFatalFindings.length > MAX_FATAL_FINDINGS,
    x4UiSummary,
    x4UiVerificationGapCensus,
    exitCode: corpusExitCode(classification.applicableFatalErrors, failedFiles.length),
  };
}

export async function runX4UiCorpusCensus(options: { baseUrl?: string } = {}): Promise<X4UiCorpusReport> {
  const startedAt = Date.now();
  let authorityUrl: string | null = null;
  let configuredRoot = '';
  const report = baseReport(startedAt, authorityUrl, configuredRoot, null);

  try {
    const authority = authorityBaseUrl(options.baseUrl);
    authorityUrl = authority.baseUrl;
    report.authorityBaseUrl = authority.baseUrl;
    const manifestStatus = parseForgeManifestStatus(await getJson(authority.baseUrl, '/api/reference/status'));
    report.manifestState = manifestStatus.state;
    report.configuredRoot = manifestStatus.root || '';
    configuredRoot = manifestStatus.root || '';
    report.manifestGeneration = manifestStatus.generation;

    if (!manifestStatus.available || manifestStatus.state !== 'ready' || !manifestStatus.current || !manifestStatus.root || !manifestStatus.generation) {
      report.manifestError = guidanceForManifest(manifestStatus);
      report.elapsedMs = Date.now() - startedAt;
      return report;
    }

    try {
      const manifestFiles = await listManifestFiles(authority.baseUrl, manifestStatus.generation);
      const selectedEntries = selectOfficialLuaEntries(manifestFiles);
      const readResult = readSelectedFiles(manifestStatus.root, selectedEntries);
      const analysis = analyzeLuaFiles(readResult.files);
      report.manifestGeneration = manifestStatus.generation;
      return finishReport(report, startedAt, selectedEntries, readResult, analysis);
    } catch (error) {
      report.manifestError = `Could not complete read-only manifest pagination or census: ${errorText(error)}`;
      report.elapsedMs = Date.now() - startedAt;
      return report;
    }
  } catch (error) {
    report.authorityBaseUrl = authorityUrl;
    report.configuredRoot = configuredRoot;
    report.manifestError = `Census could not complete: ${errorText(error)}`;
    report.elapsedMs = Date.now() - startedAt;
    return report;
  }
}

function syntheticManifestFile(filePath: string, source: string, domain: string, extension = '.lua'): ReferenceManifestFile {
  return {
    path: filePath,
    extension,
    source,
    domain,
    role: 'executable-example',
    authority: 'advisory',
    consumer: 'selftest',
    bytes: 0,
    mtimeMs: 0,
  };
}

interface SyntheticGapInput {
  category: unknown;
  status: unknown;
  expression?: string;
  reason?: string;
}

function syntheticX4UiFileResult(
  rel: string,
  gaps: readonly SyntheticGapInput[],
  options: { declaredCount?: number; truncated?: boolean } = {},
): LuaStaticX4UiFileResult {
  const truncated = options.truncated === true;
  const hasVerificationGaps = gaps.length > 0 || truncated;
  const location = {
    file: rel,
    sourcePath: 'C:\\sensitive\\source.lua',
    start: { line: 1, column: 0, offset: 0 },
    end: { line: 1, column: 1, offset: 1 },
  };
  const verificationGaps = gaps.map(gap => ({
    code: 'x4-ui.verification-gap',
    category: gap.category,
    status: gap.status,
    expression: gap.expression || 'SECRET_SOURCE_TEXT',
    reason: gap.reason || 'SECRET_ANALYZER_MESSAGE',
    location,
    source: location,
  })) as unknown as LuaStaticX4UiFileResult['result']['verificationGaps'];
  return {
    rel,
    source: 'loose',
    sourcePath: 'C:\\sensitive\\source.lua',
    result: {
      parsed: true,
      findings: [],
      verificationGaps,
      verificationGapsTruncated: truncated,
      hasErrors: false,
      hasWarnings: false,
      hasVerificationGaps,
      hasTruncatedEvidence: truncated,
      isStaticallyVerified: !hasVerificationGaps,
      status: hasVerificationGaps ? 'not-statically-verified' : 'clean',
      summary: hasVerificationGaps ? 'Not statically verified' : 'No known rule violated',
      errorCount: 0,
      warningCount: 0,
      verificationGapCount: options.declaredCount ?? gaps.length,
    },
  };
}

function syntheticX4UiSummary(results: readonly LuaStaticX4UiFileResult[]): LuaStaticX4UiSummary {
  return {
    filesAnalyzed: results.length,
    errorCount: 0,
    warningCount: 0,
    verificationGapCount: results.reduce((total, file) => total + file.result.verificationGapCount, 0),
    filesWithErrors: 0,
    filesWithWarnings: 0,
    cleanCount: results.filter(file => file.result.status === 'clean').length,
    unverifiedCount: results.filter(file => !file.result.isStaticallyVerified).length,
    truncatedCount: results.filter(file => file.result.hasTruncatedEvidence || file.result.verificationGapsTruncated).length,
  };
}

export function runX4UiCorpusCensusSelftest(): X4UiCorpusSelftestResult {
  const root = path.resolve('synthetic-x4-reference-root');
  const entries = [
    syntheticManifestFile('ui/z.lua', 'base', 'ui'),
    syntheticManifestFile('subst_lua/a.lua', 'ego_dlc_01', 'subst_lua'),
    syntheticManifestFile('ui/community.lua', 'community', 'ui'),
    syntheticManifestFile('ui/deprecated.lua', 'ego_dlc_01', 'deprecated'),
    syntheticManifestFile('ui/prison.lua', 'prison', 'ui'),
    syntheticManifestFile('ui/not-lua.txt', 'base', 'ui', '.txt'),
    syntheticManifestFile('ui/not-official.lua', 'ego_dlc', 'ui'),
  ];
  const selected = selectOfficialLuaEntries(entries).map(entry => normalizeManifestPath(entry.path));
  const syntheticFindings = [
    {
      code: X4_UI_CORPUS_NOT_APPLICABLE_CODE,
      severity: 'error',
      rel: 'ui/official-online-call.lua',
      line: 11,
      message: 'trusted official restricted call',
    },
    {
      code: X4_UI_CORPUS_NOT_APPLICABLE_CODE,
      severity: 'warning',
      rel: 'ui/official-online-call-warning.lua',
      line: 12,
      message: 'trusted official restricted warning',
    },
    {
      code: 'lua.restricted_online_call_extra',
      severity: 'error',
      rel: 'ui/not-whitelisted.lua',
      line: 13,
      message: 'near-match remains applicable',
    },
    {
      code: 'lua.other_rule',
      severity: 'error',
      rel: 'ui/other-error.lua',
      line: 14,
      message: 'other analyzer error remains applicable',
    },
  ] as LuaStaticFinding[];
  const classified = classifyCorpusFindings(syntheticFindings);
  const baseReportShape = baseReport(0, null, root, 'invalid') as unknown as Record<string, unknown>;
  const baseCensus = baseReportShape.x4UiVerificationGapCensus as Record<string, unknown> | undefined;
  const orderedGapResults = [
    syntheticX4UiFileResult('ui/z.lua', [
      { category: 'text', status: 'dynamic' },
      { category: 'index', status: 'unknown' },
    ]),
    syntheticX4UiFileResult('ui/a.lua', [{ category: 'text', status: 'dynamic' }]),
    syntheticX4UiFileResult('subst_lua/m.lua', [{ category: 'menu', status: 'unsupported' }]),
  ];
  const orderedGapPaths = orderedGapResults.map(result => result.rel);
  const orderedGapSummary = syntheticX4UiSummary(orderedGapResults);
  const orderedGapCensus = aggregateX4UiVerificationGapCensus(
    orderedGapResults,
    orderedGapSummary,
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: orderedGapPaths,
      readPaths: orderedGapPaths,
      filesFailed: 0,
    },
  );
  const permutedGapPaths = [...orderedGapPaths].reverse();
  const permutedGapCensus = aggregateX4UiVerificationGapCensus(
    [...orderedGapResults].reverse(),
    orderedGapSummary,
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: permutedGapPaths,
      readPaths: permutedGapPaths,
      filesFailed: 0,
    },
  );
  const capTieResults = Array.from({ length: 13 }, (_, index) => {
    const name = String(index + 1).padStart(2, '0');
    return syntheticX4UiFileResult(`ui/tie-${name}.lua`, [{ category: 'width', status: 'static' }]);
  });
  const capTiePaths = capTieResults.map(result => result.rel);
  const capTieCensus = aggregateX4UiVerificationGapCensus(
    capTieResults,
    syntheticX4UiSummary(capTieResults),
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: capTiePaths,
      readPaths: capTiePaths,
      filesFailed: 0,
    },
  );
  const truncatedResult = syntheticX4UiFileResult('ui/truncated.lua', [{ category: 'height', status: 'unknown' }], { truncated: true });
  const truncatedCensus = aggregateX4UiVerificationGapCensus(
    [truncatedResult],
    syntheticX4UiSummary([truncatedResult]),
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: ['ui/truncated.lua'],
      readPaths: ['ui/truncated.lua'],
      filesFailed: 0,
    },
  );
  const mismatchResult = syntheticX4UiFileResult('ui/mismatch.lua', [
    { category: 'count', status: 'unknown' },
    { category: 'count', status: 'unknown' },
  ], { declaredCount: 3 });
  const mismatchCensus = aggregateX4UiVerificationGapCensus(
    [mismatchResult],
    syntheticX4UiSummary([mismatchResult]),
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: ['ui/mismatch.lua'],
      readPaths: ['ui/mismatch.lua'],
      filesFailed: 0,
    },
  );
  const malformedResult = syntheticX4UiFileResult('ui/malformed.lua', [{ category: 42, status: '' }]);
  const malformedCensus = aggregateX4UiVerificationGapCensus(
    [malformedResult],
    syntheticX4UiSummary([malformedResult]),
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: ['ui/malformed.lua'],
      readPaths: ['ui/malformed.lua'],
      filesFailed: 0,
    },
  );
  const unsafeResult = syntheticX4UiFileResult('C:\\secrets\\source.lua', [{
    category: 'text',
    status: 'dynamic',
    expression: 'SECRET_SOURCE_TEXT',
    reason: 'SECRET_ANALYZER_MESSAGE',
  }]);
  const unsafeCensus = aggregateX4UiVerificationGapCensus(
    [unsafeResult],
    syntheticX4UiSummary([unsafeResult]),
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: ['C:\\secrets\\source.lua'],
      readPaths: ['C:\\secrets\\source.lua'],
      filesFailed: 0,
    },
  );
  const manifestUnavailableCensus = aggregateX4UiVerificationGapCensus(
    [],
    { ...EMPTY_X4_UI_SUMMARY },
    {
      manifestAvailable: false,
      manifestCurrent: false,
      manifestComplete: false,
      selectedPaths: [],
      readPaths: [],
      filesFailed: 0,
    },
  );
  const readFailureResult = syntheticX4UiFileResult('ui/read.lua', [{ category: 'parse', status: 'unsupported' }]);
  const readFailureCensus = aggregateX4UiVerificationGapCensus(
    [readFailureResult],
    syntheticX4UiSummary([readFailureResult]),
    {
      manifestAvailable: true,
      manifestCurrent: true,
      manifestComplete: true,
      selectedPaths: ['ui/read.lua', 'ui/missing.lua'],
      readPaths: ['ui/read.lua'],
      filesFailed: 1,
    },
  );
  const checks: X4UiCorpusSelftestCheck[] = [
    {
      name: 'verification-gap-census-is-always-present',
      pass: !!baseCensus,
      detail: `present=${!!baseCensus}`,
    },
    {
      name: 'verification-gap-census-contract-fields-exist',
      pass: !!baseCensus
        && baseCensus.totalGaps === 0
        && baseCensus.affectedFiles === 0
        && Array.isArray(baseCensus.byCategoryStatus)
        && Array.isArray(baseCensus.topFiles)
        && baseCensus.evidenceComplete === false
        && Array.isArray(baseCensus.incompletenessReasons),
      detail: `census=${JSON.stringify(baseCensus ?? null)}`,
    },
    {
      name: 'official-source-and-domain-filter',
      pass: JSON.stringify(selected) === JSON.stringify(['subst_lua/a.lua', 'ui/z.lua']),
      detail: `selected=${JSON.stringify(selected)}`,
    },
    {
      name: 'contained-relative-path',
      pass: resolveContainedPath(root, 'ui/menu.lua') === path.join(root, 'ui', 'menu.lua'),
    },
    {
      name: 'contained-absolute-path',
      pass: isPathContained(root, path.join(root, 'ui', 'menu.lua')),
    },
    {
      name: 'parent-traversal-rejected',
      pass: resolveContainedPath(root, '../outside.lua') === null,
    },
    {
      name: 'root-itself-rejected',
      pass: resolveContainedPath(root, '.') === null,
    },
    {
      name: 'loopback-port-validation',
      pass: loopbackBaseUrlFromPort(61175) === 'http://127.0.0.1:61175'
        && loopbackBaseUrlFromPort(0) === null
        && loopbackBaseUrlFromPort(65_536) === null
        && loopbackBaseUrlFromPort(61175.5) === null
        && loopbackBaseUrlFromPort('61175') === null,
    },
    {
      name: 'loopback-url-validation',
      pass: parseLoopbackBaseUrl('http://127.0.0.1:61175/') === 'http://127.0.0.1:61175'
        && parseLoopbackBaseUrl('http://localhost:61175') === null
        && parseLoopbackBaseUrl('https://127.0.0.1:61175') === null,
    },
    {
      name: 'manifest-page-generation-match',
      pass: parseManifestPage({ generation: 'gen-1', total: 0, files: [] }, 'gen-1')?.generation === 'gen-1'
        && parseManifestPage({ generation: 'gen-2', total: 0, files: [] }, 'gen-1') === null,
    },
    {
      name: 'manifest-page-url-is-bounded',
      pass: buildManifestPageUrl('http://127.0.0.1:61175', 500) === 'http://127.0.0.1:61175/api/reference/manifest?extension=.lua&limit=500&offset=500',
    },
    {
      name: 'exact-restricted-online-code-is-the-only-not-applicable-class',
      pass: classified.notApplicableCount === 2
        && classified.notApplicableFindings.every(finding => finding.code === X4_UI_CORPUS_NOT_APPLICABLE_CODE)
        && isCorpusFindingNotApplicable({ code: X4_UI_CORPUS_NOT_APPLICABLE_CODE })
        && !isCorpusFindingNotApplicable({ code: 'lua.restricted_online_call_extra' })
        && !isCorpusFindingNotApplicable({ code: 'lua.other_rule' }),
      detail: `notApplicable=${JSON.stringify(classified.notApplicableFindings.map(finding => finding.code))}`,
    },
    {
      name: 'not-applicable-findings-remain-visible-with-exact-reason',
      pass: classified.notApplicableErrors === 1
        && classified.notApplicableFindings.length === 2
        && classified.notApplicableFindings.every(finding => finding.reason === X4_UI_CORPUS_NOT_APPLICABLE_REASON)
        && classified.notApplicableFindings.some(finding => finding.path === 'ui/official-online-call.lua')
        && classified.notApplicableFindings.some(finding => finding.path === 'ui/official-online-call-warning.lua'),
      detail: `reason=${X4_UI_CORPUS_NOT_APPLICABLE_REASON}`,
    },
    {
      name: 'applicable-fatal-and-exit-behavior-is-preserved',
      pass: classified.applicableFatalErrors === 2
        && classified.applicableFatalFindings.some(finding => finding.code === 'lua.restricted_online_call_extra')
        && classified.applicableFatalFindings.some(finding => finding.code === 'lua.other_rule')
        && corpusExitCode(classified.applicableFatalErrors, 0) === 1
        && corpusExitCode(0, 0) === 0
        && corpusExitCode(0, 1) === 1,
      detail: `applicableFatal=${classified.applicableFatalErrors}`,
    },
    {
      name: 'verification-gap-census-is-deterministic-under-permutation',
      pass: orderedGapCensus.evidenceComplete
        && JSON.stringify(orderedGapCensus) === JSON.stringify(permutedGapCensus),
      detail: `total=${orderedGapCensus.totalGaps}`,
    },
    {
      name: 'verification-gap-census-reconciles-all-counts',
      pass: orderedGapCensus.totalGaps === 4
        && orderedGapCensus.affectedFiles === 3
        && orderedGapCensus.byCategoryStatus.reduce((total, bucket) => total + bucket.gapCount, 0) === 4
        && orderedGapCensus.byCategoryStatus.every(bucket => bucket.representativePaths.length <= 3)
        && orderedGapCensus.topFiles[0]?.categories.join(',') === 'index,text'
        && orderedGapCensus.topFiles[0]?.statuses.join(',') === 'dynamic,unknown',
      detail: `buckets=${JSON.stringify(orderedGapCensus.byCategoryStatus)}`,
    },
    {
      name: 'verification-gap-census-cap-and-tie-order-are-bounded',
      pass: capTieCensus.topFiles.length === 12
        && capTieCensus.topFiles[0]?.path === 'ui/tie-01.lua'
        && capTieCensus.topFiles[11]?.path === 'ui/tie-12.lua'
        && capTieCensus.byCategoryStatus.length === 1
        && capTieCensus.byCategoryStatus[0].representativePaths.length === 3
        && JSON.stringify(capTieCensus.byCategoryStatus[0].representativePaths)
          === JSON.stringify(['ui/tie-01.lua', 'ui/tie-02.lua', 'ui/tie-03.lua']),
      detail: `topFiles=${capTieCensus.topFiles.length}`,
    },
    {
      name: 'verification-gap-census-truncation-is-incomplete',
      pass: truncatedCensus.totalGaps === 1
        && !truncatedCensus.evidenceComplete
        && truncatedCensus.topFiles[0]?.truncated === true
        && truncatedCensus.incompletenessReasons.some(reason => reason.startsWith('truncated-files: ')),
      detail: `reasons=${JSON.stringify(truncatedCensus.incompletenessReasons)}`,
    },
    {
      name: 'verification-gap-census-count-mismatch-is-explicit',
      pass: mismatchCensus.totalGaps === 2
        && !mismatchCensus.evidenceComplete
        && mismatchCensus.incompletenessReasons.includes(
          'verification-gap-count-mismatch: per-file=3, observed=2, aggregate=2',
        ),
      detail: `reasons=${JSON.stringify(mismatchCensus.incompletenessReasons)}`,
    },
    {
      name: 'verification-gap-census-invalid-evidence-is-reserved',
      pass: malformedCensus.totalGaps === 1
        && !malformedCensus.evidenceComplete
        && malformedCensus.byCategoryStatus.some(bucket =>
          bucket.category === X4_UI_VERIFICATION_GAP_INVALID_EVIDENCE_BUCKET
          && bucket.status === X4_UI_VERIFICATION_GAP_INVALID_EVIDENCE_BUCKET)
        && !malformedCensus.byCategoryStatus.some(bucket => bucket.status === 'unknown')
        && malformedCensus.incompletenessReasons.some(reason => reason.startsWith('invalid-category-status: ')),
      detail: `buckets=${JSON.stringify(malformedCensus.byCategoryStatus)}`,
    },
    {
      name: 'verification-gap-census-unsafe-paths-and-sensitive-fields-do-not-leak',
      pass: !unsafeCensus.evidenceComplete
        && unsafeCensus.topFiles.length === 0
        && unsafeCensus.byCategoryStatus.every(bucket => bucket.representativePaths.length === 0)
        && unsafeCensus.incompletenessReasons.some(reason => reason.startsWith('unsafe-path: '))
        && !JSON.stringify(unsafeCensus).includes('C:\\secrets\\source.lua')
        && !JSON.stringify(unsafeCensus).includes('SECRET_SOURCE_TEXT')
        && !JSON.stringify(unsafeCensus).includes('SECRET_ANALYZER_MESSAGE'),
      detail: `census=${JSON.stringify(unsafeCensus)}`,
    },
    {
      name: 'verification-gap-census-failure-shapes-remain-explicit',
      pass: manifestUnavailableCensus.totalGaps === 0
        && manifestUnavailableCensus.affectedFiles === 0
        && manifestUnavailableCensus.byCategoryStatus.length === 0
        && manifestUnavailableCensus.topFiles.length === 0
        && !manifestUnavailableCensus.evidenceComplete
        && manifestUnavailableCensus.incompletenessReasons.includes('manifest-unavailable')
        && readFailureCensus.totalGaps === 1
        && readFailureCensus.byCategoryStatus.length === 1
        && !readFailureCensus.evidenceComplete
        && readFailureCensus.incompletenessReasons.some(reason => reason.startsWith('read-failure: '))
        && readFailureCensus.incompletenessReasons.some(reason => reason.startsWith('result-coverage-mismatch: ')),
      detail: `readFailureReasons=${JSON.stringify(readFailureCensus.incompletenessReasons)}`,
    },
    {
      name: 'verification-gap-census-does-not-change-gap-only-exit-semantics',
      pass: orderedGapCensus.totalGaps > 0 && corpusExitCode(0, 0) === 0 && corpusExitCode(0, 1) === 1,
      detail: `gapOnlyExit=${corpusExitCode(0, 0)}`,
    },
  ];
  return { pass: checks.every(check => check.pass), checks };
}

function printTextReport(report: X4UiCorpusReport): void {
  console.log(`status: ${report.status}`);
  console.log(`authority base URL: ${report.authorityBaseUrl || '(none)'}`);
  console.log(`configured root: ${report.configuredRoot}`);
  console.log(`manifest generation: ${report.manifestGeneration || '(none)'}`);
  console.log(`manifest state: ${report.manifestState || '(none)'}`);
  if (report.manifestError) console.log(`manifest error: ${report.manifestError}`);
  console.log(`files selected/read/failed: ${report.filesSelected}/${report.filesRead}/${report.filesFailed}`);
  console.log(`bytes: ${report.bytes}`);
  console.log(`elapsedMs: ${report.elapsedMs}`);
  console.log(`x4Ui files: ${report.x4UiFiles}`);
  console.log(`applicable fatal errors: ${report.applicableFatalErrors}`);
  console.log(`not-applicable findings: ${report.notApplicableCount}`);
  console.log(`not-applicable errors: ${report.notApplicableErrors}`);
  console.log(`not-applicable reason: ${report.notApplicableReason}`);
  console.log(`warnings: ${report.warnings}`);
  console.log(`unverified files: ${report.unverifiedFiles}`);
  console.log(`truncated files: ${report.truncatedFiles}`);
  console.log(`verification gaps: ${report.verificationGaps}`);
  const gapCensus = report.x4UiVerificationGapCensus;
  console.log(`verification-gap census: ${gapCensus.totalGaps} gaps across ${gapCensus.affectedFiles} files; evidenceComplete=${gapCensus.evidenceComplete}`);
  if (gapCensus.incompletenessReasons.length) {
    console.log(`verification-gap census reasons: ${gapCensus.incompletenessReasons.join('; ')}`);
  }
  if (gapCensus.byCategoryStatus.length) {
    console.log('verification-gap census buckets:');
    for (const bucket of gapCensus.byCategoryStatus) {
      const paths = bucket.representativePaths.length ? bucket.representativePaths.join(', ') : '(no safe paths)';
      console.log(`  ${bucket.category}/${bucket.status}: ${bucket.gapCount} gaps across ${bucket.affectedFileCount} files [${paths}]`);
    }
  }
  if (gapCensus.topFiles.length) {
    console.log('verification-gap census top files:');
    for (const file of gapCensus.topFiles) {
      console.log(`  ${file.path}: ${file.gapCount} gaps [${file.categories.join(', ')}] [${file.statuses.join(', ')}] truncated=${file.truncated}`);
    }
  }
  console.log('selected paths:');
  for (const filePath of report.selectedPaths) console.log(`  ${filePath}`);
  if (!report.selectedPaths.length) console.log('  (none)');
  if (report.failedFiles.length) {
    console.log('read failures:');
    for (const failure of report.failedFiles) console.log(`  ${failure.path}: ${failure.reason}`);
  }
  if (report.fatalFindings.length) {
    console.log(`fatal findings (showing ${report.fatalFindings.length}/${report.fatalErrors}):`);
    for (const finding of report.fatalFindings) {
      console.log(`  ${finding.code} ${finding.path}:${finding.line ?? '?'} ${finding.message}`);
    }
  } else {
    console.log('fatal findings: none known');
  }
  if (report.fatalFindingsTruncated) console.log(`fatal findings list bounded at ${MAX_FATAL_FINDINGS}`);
  if (report.notApplicableFindings.length) {
    console.log('not-applicable findings (visible; not used for exit):');
    for (const finding of report.notApplicableFindings) {
      console.log(`  ${finding.code} [${finding.severity}] ${finding.path}:${finding.line ?? '?'} ${finding.message}`);
    }
  } else {
    console.log('not-applicable findings: none');
  }
}

function cliBaseUrl(args: readonly string[]): { value?: string; error?: string } {
  const inline = args.find(argument => argument.startsWith('--base-url='));
  if (inline) return { value: inline.slice('--base-url='.length) };
  const index = args.indexOf('--base-url');
  if (index < 0) return {};
  if (!args[index + 1] || args[index + 1].startsWith('--')) return { error: '--base-url requires a URL value.' };
  return { value: args[index + 1] };
}

async function runCli(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--selftest')) {
    const result = runX4UiCorpusCensusSelftest();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.pass ? 0 : 1;
    return;
  }

  const baseUrl = cliBaseUrl(process.argv.slice(2));
  if (baseUrl.error) {
    console.error(baseUrl.error);
    process.exitCode = 1;
    return;
  }
  const report = await runX4UiCorpusCensus({ baseUrl: baseUrl.value });
  if (args.has('--json')) console.log(JSON.stringify(report, null, 2));
  else printTextReport(report);
  process.exitCode = report.exitCode;
}

const isDirectInvocation = /(?:^|[\\/])x4-ui-lint-corpus-check\.(?:ts|js)$/.test(process.argv[1] || '');
if (isDirectInvocation) void runCli();
