import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { atomicWriteJson } from './workspaceState';
import { validationProjectContentHash } from '../../shared/projectValidationInput';

export const VALIDATION_BASELINE_SCHEMA = 1 as const;
export const VALIDATION_BASELINE_MAX_MODS = 128;
export const VALIDATION_BASELINE_MAX_WARNINGS = 2_000;
export const VALIDATION_DELTA_SAMPLE_LIMIT = 12;
const WARNING_MESSAGE_EXCERPT_LENGTH = 500;
const LEGACY_MESSAGE_MATCH_LIMIT = 16_000;

export interface ValidationWarningInput {
  severity?: string;
  code?: string;
  filePath?: string;
  sourceRef?: unknown;
  line?: number;
  column?: number;
  message?: string;
}

export interface ValidationProjectFileInput {
  path: string;
  content?: string;
}

export interface StoredValidationWarning {
  identity: string;
  code: string;
  filePath: string;
  sourceRef: string;
  line?: number;
  message: string;
}

export interface ValidationBaselineSnapshot {
  schemaVersion: typeof VALIDATION_BASELINE_SCHEMA;
  modId: string;
  contentHash: string;
  recordedAt: string;
  warnings: StoredValidationWarning[];
}

interface ValidationBaselineDocument {
  schemaVersion: typeof VALIDATION_BASELINE_SCHEMA;
  baselines: Record<string, ValidationBaselineSnapshot>;
}

export type ValidationBaselineRead =
  | { status: 'missing' }
  | { status: 'available'; snapshot: ValidationBaselineSnapshot }
  | { status: 'unavailable'; reason: string };

export interface ValidationDeltaResult {
  status: 'compared' | 'no_baseline' | 'unavailable';
  modId: string;
  currentContentHash: string;
  baseline: {
    status: 'available' | 'missing' | 'unavailable';
    contentHash?: string;
    recordedAt?: string;
    reason?: string;
  };
  counts: {
    current: number;
    baseline: number;
    new: number;
    resolved: number;
    unchanged: number;
  };
  newWarnings: StoredValidationWarning[];
  resolvedWarnings: StoredValidationWarning[];
}

function normalizeModId(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePath(value: string | undefined): string {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function sourceRefText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.label === 'string') return record.label.trim();
  }
  return '';
}

function boundedText(value: unknown, max: number): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export { validationProjectContentHash };

type WarningDetails = Omit<StoredValidationWarning, 'identity'>;

function warningIdentity({ code, filePath, sourceRef, line }: WarningDetails, fullMessage: string): string {
  return sha256(JSON.stringify({ code, filePath, sourceRef, line: line || 0, message: fullMessage }));
}

function warningComparisonGroup({ code, filePath, sourceRef, message }: WarningDetails): string {
  return JSON.stringify([code, filePath, sourceRef, message]);
}

function canonicalWarningRows(diagnostics: ValidationWarningInput[]) {
  const byIdentity = new Map<string, { warning: StoredValidationWarning; fullMessage: string }>();
  for (const finding of diagnostics) {
    if (String(finding.severity || '').toLowerCase() !== 'warning') continue;
    const code = boundedText(finding.code || 'validation.warning', 160).toLowerCase();
    const filePath = normalizePath(finding.filePath);
    const sourceRef = boundedText(sourceRefText(finding.sourceRef), 300);
    const line = Number.isSafeInteger(finding.line) && Number(finding.line) > 0 ? Number(finding.line) : undefined;
    const fullMessage = boundedText(finding.message, 4_000);
    const details = { code, filePath, sourceRef, ...(line ? { line } : {}), message: fullMessage.slice(0, WARNING_MESSAGE_EXCERPT_LENGTH) };
    const identity = warningIdentity(details, fullMessage);
    if (!byIdentity.has(identity)) byIdentity.set(identity, { warning: { identity, ...details }, fullMessage });
  }
  return [...byIdentity.values()].sort((left, right) => left.warning.identity.localeCompare(right.warning.identity));
}

export function canonicalValidationWarnings(diagnostics: ValidationWarningInput[]): StoredValidationWarning[] {
  return canonicalWarningRows(diagnostics).map(row => row.warning);
}

export function createValidationBaselineSnapshot(
  modIdInput: string,
  contentHash: string,
  diagnostics: ValidationWarningInput[],
  recordedAt = new Date().toISOString(),
): ValidationBaselineSnapshot {
  const modId = normalizeModId(modIdInput);
  if (!modId) throw new Error('Validation baseline requires a non-empty mod id.');
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('Validation baseline requires a SHA-256 content hash.');
  const warnings = canonicalValidationWarnings(diagnostics);
  if (warnings.length > VALIDATION_BASELINE_MAX_WARNINGS) {
    throw new Error(`Validation baseline has ${warnings.length} warnings; maximum is ${VALIDATION_BASELINE_MAX_WARNINGS}. No baseline was recorded.`);
  }
  if (!Number.isFinite(Date.parse(recordedAt))) throw new Error('Validation baseline recordedAt must be an ISO timestamp.');
  return { schemaVersion: VALIDATION_BASELINE_SCHEMA, modId, contentHash, recordedAt, warnings };
}

export function compareValidationWarnings(
  modIdInput: string,
  contentHash: string,
  diagnostics: ValidationWarningInput[],
  baselineRead: ValidationBaselineRead,
): ValidationDeltaResult {
  const modId = normalizeModId(modIdInput);
  const current = canonicalWarningRows(diagnostics);
  const common = {
    modId,
    currentContentHash: contentHash,
    newWarnings: [] as StoredValidationWarning[],
    resolvedWarnings: [] as StoredValidationWarning[],
  };
  if (baselineRead.status === 'missing') {
    return {
      ...common,
      status: 'no_baseline',
      baseline: { status: 'missing' },
      counts: { current: current.length, baseline: 0, new: 0, resolved: 0, unchanged: 0 },
    };
  }
  const unavailable = (reason: string): ValidationDeltaResult => ({
    ...common,
    status: 'unavailable',
    baseline: { status: 'unavailable', reason },
    counts: { current: current.length, baseline: 0, new: 0, resolved: 0, unchanged: 0 },
  });
  if (baselineRead.status === 'unavailable') return unavailable(baselineRead.reason);

  const baseline = baselineRead.snapshot.warnings;
  const remainingBaseline = new Map(baseline.map(warning => [warning.identity, warning]));
  const unmatched = current.filter(({ warning }) => !remainingBaseline.delete(warning.identity));
  const baselineLinesByGroup = new Map<string, Map<number | undefined, number>>();
  for (const warning of remainingBaseline.values()) {
    const group = warningComparisonGroup(warning);
    const lines = baselineLinesByGroup.get(group) ?? new Map<number | undefined, number>();
    lines.set(warning.line, (lines.get(warning.line) ?? 0) + 1);
    baselineLinesByGroup.set(group, lines);
  }
  const added: StoredValidationWarning[] = [];
  let legacyMatches = 0;
  for (const { warning, fullMessage } of unmatched) {
    const lines = baselineLinesByGroup.get(warningComparisonGroup(warning));
    let matched = false;
    if (lines) {
      // A v1 snapshot holds only the display excerpt. Check the old ID at its
      // saved line to distinguish different full messages with the same excerpt.
      for (const [line, count] of lines) {
        if (warning.message.length === WARNING_MESSAGE_EXCERPT_LENGTH && ++legacyMatches > LEGACY_MESSAGE_MATCH_LIMIT) {
          return unavailable('Too many ambiguous long warning messages to compare against the saved baseline.');
        }
        if (!remainingBaseline.delete(warningIdentity({ ...warning, line }, fullMessage))) continue;
        if (count === 1) lines.delete(line);
        else lines.set(line, count - 1);
        matched = true;
        break;
      }
    }
    if (!matched) added.push(warning);
  }
  const resolved = [...remainingBaseline.values()];
  return {
    ...common,
    status: 'compared',
    baseline: {
      status: 'available',
      contentHash: baselineRead.snapshot.contentHash,
      recordedAt: baselineRead.snapshot.recordedAt,
    },
    counts: {
      current: current.length,
      baseline: baseline.length,
      new: added.length,
      resolved: resolved.length,
      unchanged: current.length - added.length,
    },
    newWarnings: added.slice(0, VALIDATION_DELTA_SAMPLE_LIMIT),
    resolvedWarnings: resolved.slice(0, VALIDATION_DELTA_SAMPLE_LIMIT),
  };
}

function isStoredWarning(value: unknown): value is StoredValidationWarning {
  if (!value || typeof value !== 'object') return false;
  const warning = value as Record<string, unknown>;
  return typeof warning.identity === 'string' && /^[a-f0-9]{64}$/.test(warning.identity)
    && typeof warning.code === 'string' && typeof warning.filePath === 'string'
    && typeof warning.sourceRef === 'string' && typeof warning.message === 'string'
    && (warning.line === undefined || (Number.isSafeInteger(warning.line) && Number(warning.line) > 0));
}

function isSnapshot(value: unknown, key: string): value is ValidationBaselineSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return snapshot.schemaVersion === VALIDATION_BASELINE_SCHEMA
    && snapshot.modId === key
    && typeof snapshot.contentHash === 'string' && /^[a-f0-9]{64}$/.test(snapshot.contentHash)
    && typeof snapshot.recordedAt === 'string' && Number.isFinite(Date.parse(snapshot.recordedAt))
    && Array.isArray(snapshot.warnings) && snapshot.warnings.length <= VALIDATION_BASELINE_MAX_WARNINGS
    && snapshot.warnings.every(isStoredWarning);
}

function parseDocument(file: string): { ok: true; document: ValidationBaselineDocument } | { ok: false; reason: string } {
  if (!fs.existsSync(file)) return { ok: true, document: { schemaVersion: VALIDATION_BASELINE_SCHEMA, baselines: {} } };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (parsed?.schemaVersion !== VALIDATION_BASELINE_SCHEMA || !parsed.baselines || typeof parsed.baselines !== 'object' || Array.isArray(parsed.baselines)) {
      return { ok: false, reason: `Validation baseline store has an unsupported or malformed schema: ${file}` };
    }
    const entries = Object.entries(parsed.baselines as Record<string, unknown>);
    if (entries.length > VALIDATION_BASELINE_MAX_MODS || entries.some(([key, value]) => key !== normalizeModId(key) || !isSnapshot(value, key))) {
      return { ok: false, reason: `Validation baseline store failed integrity checks: ${file}` };
    }
    return { ok: true, document: parsed as unknown as ValidationBaselineDocument };
  } catch {
    return { ok: false, reason: `Validation baseline store could not be read: ${file}` };
  }
}

export class ValidationBaselineStore {
  constructor(private readonly file: string) {}

  read(modIdInput: string): ValidationBaselineRead {
    const parsed = parseDocument(this.file);
    if ('reason' in parsed) return { status: 'unavailable', reason: parsed.reason };
    const snapshot = parsed.document.baselines[normalizeModId(modIdInput)];
    return snapshot ? { status: 'available', snapshot } : { status: 'missing' };
  }

  record(snapshot: ValidationBaselineSnapshot): void {
    const parsed = parseDocument(this.file);
    if ('reason' in parsed) throw new Error(`${parsed.reason} No baseline was recorded.`);
    const key = normalizeModId(snapshot.modId);
    const exists = Boolean(parsed.document.baselines[key]);
    if (!exists && Object.keys(parsed.document.baselines).length >= VALIDATION_BASELINE_MAX_MODS) {
      throw new Error(`Validation baseline store already contains ${VALIDATION_BASELINE_MAX_MODS} mods. No baseline was recorded.`);
    }
    const next: ValidationBaselineDocument = {
      schemaVersion: VALIDATION_BASELINE_SCHEMA,
      baselines: { ...parsed.document.baselines, [key]: snapshot },
    };
    atomicWriteJson(this.file, next);
  }
}

export const VALIDATION_RECEIPT_SCHEMA = 'forge.validation-receipt.v1' as const;
export const VALIDATION_RECEIPT_STORE_SCHEMA = 1 as const;

export type ValidationReceiptSurface = 'deploy-verify' | 'project-validate';

export interface ValidationVerdictReceipt {
  schemaVersion: typeof VALIDATION_RECEIPT_SCHEMA;
  receiptHash: string;
  surface: ValidationReceiptSurface;
  canonicalForDeploy: boolean;
  modId: string;
  verdict: 'pass' | 'fail';
  deployAllowed: boolean | null;
  outcome: string;
  sourceHash: string;
  diskSourceHash: string | null;
  artifactPlanHash: string | null;
  artifactHash: string | null;
  bindingHash: string | null;
  forgeVersion: string;
  validatedAt: string;
  errors: number;
  warnings: number;
  acceptedWarnings: number;
  unreviewedWarnings: number;
  coverageGaps: number;
  unavailableChecks: number;
}

export interface ValidationVerdictReceiptInput {
  surface: ValidationReceiptSurface;
  modId: string;
  verdict: 'pass' | 'fail';
  deployAllowed: boolean | null;
  outcome: string;
  sourceHash: string;
  diskSourceHash?: string | null;
  artifactPlanHash?: string | null;
  artifactHash?: string | null;
  bindingHash?: string | null;
  forgeVersion: string;
  validatedAt?: string;
  errors: number;
  warnings: number;
  acceptedWarnings?: number;
  unreviewedWarnings: number;
  coverageGaps: number;
  unavailableChecks?: number;
}

interface ValidationModReceiptSlots {
  deployVerify?: ValidationVerdictReceipt;
  projectValidate?: ValidationVerdictReceipt;
}

interface ValidationReceiptStoreDocument {
  schemaVersion: typeof VALIDATION_RECEIPT_STORE_SCHEMA;
  mods: Record<string, ValidationModReceiptSlots>;
}

export type ValidationReceiptRead =
  | { status: 'missing'; receipt: null; sourceValidation: ValidationVerdictReceipt | null }
  | { status: 'available'; receipt: ValidationVerdictReceipt; sourceValidation: ValidationVerdictReceipt | null }
  | { status: 'unavailable'; reason: string };

function computeValidationReceiptHash(body: Omit<ValidationVerdictReceipt, 'receiptHash'>): string {
  return sha256(JSON.stringify([
    body.schemaVersion,
    body.surface,
    body.canonicalForDeploy,
    body.modId,
    body.verdict,
    body.deployAllowed,
    body.outcome,
    body.sourceHash,
    body.diskSourceHash,
    body.artifactPlanHash,
    body.artifactHash,
    body.bindingHash,
    body.forgeVersion,
    body.validatedAt,
    body.errors,
    body.warnings,
    body.acceptedWarnings,
    body.unreviewedWarnings,
    body.coverageGaps,
    body.unavailableChecks,
  ]));
}

export function createValidationVerdictReceipt(input: ValidationVerdictReceiptInput): ValidationVerdictReceipt {
  const modId = normalizeModId(input.modId);
  if (!modId) throw new Error('Validation receipt requires a modId.');
  if (!/^[a-f0-9]{64}$/i.test(input.sourceHash)) throw new Error('Validation receipt requires a 64-hex sourceHash.');
  const canonicalForDeploy = input.surface === 'deploy-verify';
  const validatedAt = input.validatedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(validatedAt))) throw new Error('Validation receipt requires a valid ISO timestamp.');
  const nonNegInt = (n: number) => (Number.isInteger(n) && n >= 0 ? n : 0);
  const body: Omit<ValidationVerdictReceipt, 'receiptHash'> = {
    schemaVersion: VALIDATION_RECEIPT_SCHEMA,
    surface: input.surface,
    canonicalForDeploy,
    modId,
    verdict: input.verdict === 'pass' ? 'pass' : 'fail',
    deployAllowed: canonicalForDeploy ? Boolean(input.deployAllowed) : null,
    outcome: boundedText(input.outcome || (input.verdict === 'pass' ? 'clean' : 'failed'), 96),
    sourceHash: input.sourceHash.toLowerCase(),
    diskSourceHash: input.diskSourceHash ? String(input.diskSourceHash).toLowerCase() : null,
    artifactPlanHash: input.artifactPlanHash ? String(input.artifactPlanHash).toLowerCase() : null,
    artifactHash: input.artifactHash ? String(input.artifactHash).toLowerCase() : null,
    bindingHash: input.bindingHash ? String(input.bindingHash).toLowerCase() : null,
    forgeVersion: boundedText(input.forgeVersion || 'unknown', 48),
    validatedAt,
    errors: nonNegInt(input.errors),
    warnings: nonNegInt(input.warnings),
    acceptedWarnings: nonNegInt(input.acceptedWarnings ?? 0),
    unreviewedWarnings: nonNegInt(input.unreviewedWarnings),
    coverageGaps: nonNegInt(input.coverageGaps),
    unavailableChecks: nonNegInt(input.unavailableChecks ?? 0),
  };
  return {
    ...body,
    receiptHash: computeValidationReceiptHash(body),
  };
}

export function formatValidationVerdictBanner(
  receipt: ValidationVerdictReceipt,
  freshness?: { status: 'current' | 'superseded' | 'unknown'; currentSourceHash?: string | null },
): string {
  const shortHash = receipt.sourceHash.slice(0, 12);
  const base = `Forge validation: ${receipt.verdict.toUpperCase()} for source ${shortHash}, Forge ${receipt.forgeVersion}, at ${receipt.validatedAt}`;
  if (freshness?.status === 'superseded') {
    const cur = freshness.currentSourceHash ? freshness.currentSourceHash.slice(0, 12) : 'changed';
    return `${base} [SUPERSEDED by working source ${cur}]`;
  }
  return base;
}

function isValidReceipt(value: unknown, expectedKey: string, expectedSurface: ValidationReceiptSurface): value is ValidationVerdictReceipt {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.schemaVersion !== VALIDATION_RECEIPT_SCHEMA || r.surface !== expectedSurface) return false;
  if (r.canonicalForDeploy !== (expectedSurface === 'deploy-verify')) return false;
  if (r.modId !== expectedKey || (r.verdict !== 'pass' && r.verdict !== 'fail')) return false;
  if (expectedSurface === 'deploy-verify' ? typeof r.deployAllowed !== 'boolean' : r.deployAllowed !== null) return false;
  if (typeof r.outcome !== 'string' || !r.outcome || r.outcome.length > 96) return false;
  if (typeof r.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.sourceHash)) return false;
  for (const nullableHash of ['diskSourceHash', 'artifactPlanHash', 'artifactHash', 'bindingHash'] as const) {
    const h = r[nullableHash];
    if (h !== null && (typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h))) return false;
  }
  if (typeof r.forgeVersion !== 'string' || !r.forgeVersion || r.forgeVersion.length > 48) return false;
  if (typeof r.validatedAt !== 'string' || !Number.isFinite(Date.parse(r.validatedAt))) return false;
  for (const numField of ['errors', 'warnings', 'acceptedWarnings', 'unreviewedWarnings', 'coverageGaps', 'unavailableChecks'] as const) {
    const n = r[numField];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return false;
  }
  if (typeof r.receiptHash !== 'string' || !/^[a-f0-9]{64}$/.test(r.receiptHash)) return false;
  const { receiptHash, ...rest } = r as unknown as ValidationVerdictReceipt;
  return computeValidationReceiptHash(rest) === receiptHash;
}

function parseReceiptStoreDocument(file: string): { ok: true; document: ValidationReceiptStoreDocument } | { ok: false; reason: string } {
  if (!fs.existsSync(file)) return { ok: true, document: { schemaVersion: VALIDATION_RECEIPT_STORE_SCHEMA, mods: {} } };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (parsed?.schemaVersion !== VALIDATION_RECEIPT_STORE_SCHEMA || !parsed.mods || typeof parsed.mods !== 'object' || Array.isArray(parsed.mods)) {
      return { ok: false, reason: `Validation receipt store has an unsupported or malformed schema: ${file}` };
    }
    const entries = Object.entries(parsed.mods as Record<string, unknown>);
    if (entries.length > VALIDATION_BASELINE_MAX_MODS) {
      return { ok: false, reason: `Validation receipt store exceeds maximum mod count: ${file}` };
    }
    for (const [key, slotVal] of entries) {
      if (key !== normalizeModId(key) || !slotVal || typeof slotVal !== 'object' || Array.isArray(slotVal)) {
        return { ok: false, reason: `Validation receipt store failed integrity checks: ${file}` };
      }
      const slot = slotVal as Record<string, unknown>;
      for (const k of Object.keys(slot)) {
        if (k !== 'deployVerify' && k !== 'projectValidate') {
          return { ok: false, reason: `Validation receipt store has unexpected slot "${k}": ${file}` };
        }
      }
      if (slot.deployVerify !== undefined && !isValidReceipt(slot.deployVerify, key, 'deploy-verify')) {
        return { ok: false, reason: `Validation receipt store failed deployVerify integrity check for "${key}": ${file}` };
      }
      if (slot.projectValidate !== undefined && !isValidReceipt(slot.projectValidate, key, 'project-validate')) {
        return { ok: false, reason: `Validation receipt store failed projectValidate integrity check for "${key}": ${file}` };
      }
    }
    return { ok: true, document: parsed as unknown as ValidationReceiptStoreDocument };
  } catch {
    return { ok: false, reason: `Validation receipt store could not be read: ${file}` };
  }
}

export class ValidationReceiptStore {
  constructor(private readonly file: string) {}

  read(modIdInput: string): ValidationReceiptRead {
    const parsed = parseReceiptStoreDocument(this.file);
    if ('reason' in parsed) return { status: 'unavailable', reason: parsed.reason };
    const key = normalizeModId(modIdInput);
    const slot = key ? parsed.document.mods[key] : undefined;
    const receipt = slot?.deployVerify ?? null;
    const sourceValidation = slot?.projectValidate ?? null;
    return receipt
      ? { status: 'available', receipt, sourceValidation }
      : { status: 'missing', receipt: null, sourceValidation };
  }

  record(receipt: ValidationVerdictReceipt): void {
    const parsed = parseReceiptStoreDocument(this.file);
    if ('reason' in parsed) throw new Error(`${parsed.reason} No validation receipt was recorded.`);
    const key = normalizeModId(receipt.modId);
    if (!isValidReceipt(receipt, key, receipt.surface)) {
      throw new Error(`Validation receipt failed integrity verification for "${key}".`);
    }
    const existing = parsed.document.mods[key];
    if (!existing && Object.keys(parsed.document.mods).length >= VALIDATION_BASELINE_MAX_MODS) {
      throw new Error(`Validation receipt store already contains ${VALIDATION_BASELINE_MAX_MODS} mods. No receipt was recorded.`);
    }
    const nextSlot: ValidationModReceiptSlots = {
      ...(existing || {}),
      ...(receipt.surface === 'deploy-verify' ? { deployVerify: receipt } : { projectValidate: receipt }),
    };
    const next: ValidationReceiptStoreDocument = {
      schemaVersion: VALIDATION_RECEIPT_STORE_SCHEMA,
      mods: { ...parsed.document.mods, [key]: nextSlot },
    };
    atomicWriteJson(this.file, next);
  }
}

export function runValidationDeltaSelftest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-validation-delta-'));
  try {
    const storeFile = path.join(tempRoot, 'baselines.json');
    const store = new ValidationBaselineStore(storeFile);
    const filesA = [{ path: 'MD\\Main.xml', content: '<mdscript />' }, { path: 'content.xml', content: '<content />' }];
    const filesAReordered = [...filesA].reverse().map(file => ({ ...file, path: file.path.toLowerCase().replace(/\\/g, '/') }));
    const hashA = validationProjectContentHash(filesA);
    const warningA = { severity: 'warning', code: 'XSD.Test', filePath: 'MD\\Main.xml', line: 4, message: 'Test warning' };
    const snapshot = createValidationBaselineSnapshot('Example_Mod', hashA, [warningA], '2026-07-30T12:00:00.000Z');
    const missingBeforeCorruption = store.read('other_mod');
    store.record(snapshot);
    const same = compareValidationWarnings('example_mod', validationProjectContentHash(filesAReordered), [warningA], store.read('EXAMPLE_MOD'));
    const changed = compareValidationWarnings('example_mod', hashA, [
      { ...warningA, message: 'Changed warning' },
      { severity: 'warning', code: 'new.warning', filePath: './ui/test.lua', message: 'New' },
    ], store.read('example_mod'));
    fs.writeFileSync(storeFile, '{broken', 'utf8');
    const corrupt = store.read('example_mod');
    let corruptWriteRejected = false;
    try { store.record(snapshot); } catch { corruptWriteRejected = true; }
    const checks = [
      { name: 'content hash ignores order, slash, and path case', pass: hashA === validationProjectContentHash(filesAReordered) },
      { name: 'stored baseline is compared', pass: same.status === 'compared' && same.counts.unchanged === 1 && same.counts.new === 0 },
      { name: 'changed and added warnings are new and old warning resolves', pass: changed.counts.new === 2 && changed.counts.resolved === 1 },
      { name: 'different mod has no baseline', pass: missingBeforeCorruption.status === 'missing' },
      { name: 'corrupt store is unavailable', pass: corrupt.status === 'unavailable' },
      { name: 'corrupt store refuses overwrite', pass: corruptWriteRejected },
    ];
    const prior = [warningA, { ...warningA, line: 8 }, { ...warningA, sourceRef: 'OtherCue', line: 12 }];
    const legacy = createValidationBaselineSnapshot('example_mod', hashA, prior);
    const moved = compareValidationWarnings('example_mod', hashA, [
      warningA,
      { ...warningA, line: 14 },
      { ...warningA, sourceRef: 'DifferentCue', line: 13 },
    ], { status: 'available', snapshot: JSON.parse(JSON.stringify(legacy)) });
    const prefix = 'x'.repeat(520);
    const longWarning = { ...warningA, message: prefix + 'A' };
    const longBaseline = createValidationBaselineSnapshot('example_mod', hashA, [longWarning]);
    const longMoved = compareValidationWarnings('example_mod', hashA, [{ ...longWarning, line: 5 }],
      { status: 'available', snapshot: longBaseline });
    const longChanged = compareValidationWarnings('example_mod', hashA, [
      { ...longWarning, line: 5, message: prefix + 'B' },
    ], { status: 'available', snapshot: longBaseline });
    const ambiguity = createValidationBaselineSnapshot('example_mod', hashA,
      Array.from({ length: 130 }, (_, i) => ({ ...warningA, message: prefix + 'old' + i, line: i + 1 })));
    const bounded = compareValidationWarnings('example_mod', hashA,
      Array.from({ length: 130 }, (_, i) => ({ ...warningA, message: prefix + 'new' + i, line: i + 200 })),
      { status: 'available', snapshot: ambiguity });
    checks.push(
      { name: 'exact matches are consumed first and moved copies match one-for-one',
        pass: moved.counts.unchanged === 2 && moved.counts.new === 1 && moved.counts.resolved === 1
          && moved.newWarnings[0]?.sourceRef === 'DifferentCue' && moved.newWarnings[0]?.line === 13 },
      { name: 'legacy warning with a truncated display message matches an exact move',
        pass: longBaseline.warnings[0]?.message.length === 500 && longMoved.counts.unchanged === 1 },
      { name: 'different long messages with the same excerpt stay distinct',
        pass: longChanged.counts.unchanged === 0 && longChanged.counts.new === 1 && longChanged.counts.resolved === 1 },
      { name: 'excessive legacy excerpt collisions cannot report a partial comparison',
        pass: bounded.status === 'unavailable' && !!bounded.baseline.reason
          && !bounded.newWarnings.length && !bounded.resolvedWarnings.length },
    );
    const receiptStore = new ValidationReceiptStore(path.join(tempRoot, 'receipts.json'));
    const sourceReceipt = createValidationVerdictReceipt({
      surface: 'project-validate',
      modId: 'Example_Mod',
      verdict: 'pass',
      deployAllowed: true,
      outcome: 'clean',
      sourceHash: hashA,
      forgeVersion: '0.0.94',
      validatedAt: '2026-11-23T19:00:00.000Z',
      errors: 0,
      warnings: 2,
      unreviewedWarnings: 2,
      coverageGaps: 5,
      unavailableChecks: 1,
    });
    receiptStore.record(sourceReceipt);
    const afterSourceOnly = receiptStore.read('example_mod');
    const deployReceipt = createValidationVerdictReceipt({
      surface: 'deploy-verify',
      modId: 'Example_Mod',
      verdict: 'pass',
      deployAllowed: true,
      outcome: 'accepted-findings',
      sourceHash: hashA,
      artifactPlanHash: 'b'.repeat(64),
      artifactHash: 'c'.repeat(64),
      bindingHash: 'd'.repeat(64),
      forgeVersion: '0.0.94',
      validatedAt: '2026-11-23T19:05:00.000Z',
      errors: 0,
      warnings: 2,
      acceptedWarnings: 2,
      unreviewedWarnings: 0,
      coverageGaps: 3,
      unavailableChecks: 0,
    });
    receiptStore.record(deployReceipt);
    const afterDeploy = receiptStore.read('EXAMPLE_MOD');
    const corruptReceiptStore = new ValidationReceiptStore(storeFile);
    const corruptReceiptRead = corruptReceiptStore.read('example_mod');
    let corruptReceiptWriteRejected = false;
    try { corruptReceiptStore.record(deployReceipt); } catch { corruptReceiptWriteRejected = true; }
    let tamperedWriteRejected = false;
    try { receiptStore.record({ ...deployReceipt, errors: 99 }); } catch { tamperedWriteRejected = true; }
    const bannerCurrent = formatValidationVerdictBanner(deployReceipt, { status: 'current', currentSourceHash: hashA });
    const bannerSuperseded = formatValidationVerdictBanner(deployReceipt, { status: 'superseded', currentSourceHash: 'e'.repeat(64) });
    checks.push(
      { name: 'project-validate receipt stays isolated from canonical deploy-verify slot',
        pass: sourceReceipt.canonicalForDeploy === false && sourceReceipt.deployAllowed === null
          && afterSourceOnly.status === 'missing' && afterSourceOnly.receipt === null
          && afterSourceOnly.sourceValidation?.receiptHash === sourceReceipt.receiptHash },
      { name: 'deploy-verify receipt populates canonical slot without erasing sourceValidation',
        pass: afterDeploy.status === 'available'
          && afterDeploy.receipt.receiptHash === deployReceipt.receiptHash
          && afterDeploy.receipt.canonicalForDeploy === true
          && afterDeploy.receipt.deployAllowed === true
          && afterDeploy.sourceValidation?.receiptHash === sourceReceipt.receiptHash },
      { name: 'corrupt or tampered validation receipt store fails closed',
        pass: corruptReceiptRead.status === 'unavailable' && corruptReceiptWriteRejected && tamperedWriteRejected },
      { name: 'validation receipt banner formats current and superseded states cleanly',
        pass: bannerCurrent.includes(`PASS for source ${hashA.slice(0, 12)}, Forge 0.0.94`)
          && !bannerCurrent.includes('SUPERSEDED')
          && bannerSuperseded.includes('[SUPERSEDED by working source eeeeeeeeeeee]') },
    );
    return { pass: checks.every(check => check.pass), checks };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
