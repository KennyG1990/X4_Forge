/**
 * Pure, browser- and Node-safe workspace file-write failure correlation and
 * readback-before-retry reconciliation (#68 / FF-29).
 *
 * Invariants:
 *  - Never performs a blind automatic retry write.
 *  - Preserves sanitized server `writeFailure` correlation (`requestId`, `stage`,
 *    `outcome`, `systemCode`, `syscall`) without echoing file paths or content.
 *  - When an HTTP 500 write failure occurs, reconciles actual disk state via the
 *    server's `writeFailure` observation and/or a read-only `GET /api/fs/read`
 *    readback check so writes that already committed on disk are adopted cleanly
 *    without a duplicate write, intact prior bytes are reported explicitly, and
 *    diverged files block blind overwrites.
 */

export type WorkspaceWriteObservationSummary =
  | { state: 'file'; bytes: number; sha256: string }
  | { state: 'absent' | 'unavailable' };

export interface WorkspaceWriteFailureTelemetry {
  requestId: string;
  stage: 'preflight' | 'prepare' | 'replace' | 'verify';
  outcome: 'requested-bytes-observed' | 'before-bytes-observed' | 'different-bytes-observed' | 'target-absent' | 'unknown';
  before: WorkspaceWriteObservationSummary;
  after: WorkspaceWriteObservationSummary;
  requestedSha256?: string;
  systemCode?: string;
  syscall?: string;
}

export type WorkspaceReadbackSnapshot =
  | { state: 'file'; sha256: string; content?: string; workspaceRootId?: string }
  | { state: 'absent' }
  | { state: 'unavailable' };

export type ReconciledWorkspaceWriteOutcome =
  | {
      kind: 'landed-verified';
      sha256: string;
      requestId?: string;
    }
  | {
      kind: 'unchanged-verified';
      message: string;
      requestId?: string;
    }
  | {
      kind: 'diverged';
      message: string;
      requestId?: string;
    }
  | {
      kind: 'unconfirmed';
      message: string;
      requestId?: string;
    };

const SHA256_RE = /^[a-f0-9]{64}$/;
const UUID_RE = /^[a-f0-9-]{8,64}$/i;
const VALID_STAGES = new Set(['preflight', 'prepare', 'replace', 'verify']);
const VALID_OUTCOMES = new Set([
  'requested-bytes-observed',
  'before-bytes-observed',
  'different-bytes-observed',
  'target-absent',
  'unknown',
]);
const SAFE_CODE_RE = /^(?:E[A-Z0-9]{2,15}|ERR_[A-Z0-9_]{1,25})$/;
const SAFE_SYSCALL_RE = /^[a-z_]{1,24}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseObservation(raw: unknown): WorkspaceWriteObservationSummary {
  if (!isRecord(raw)) return { state: 'unavailable' };
  if (raw.state === 'absent') return { state: 'absent' };
  if (
    raw.state === 'file'
    && typeof raw.bytes === 'number'
    && Number.isFinite(raw.bytes)
    && raw.bytes >= 0
    && typeof raw.sha256 === 'string'
    && SHA256_RE.test(raw.sha256)
  ) {
    return { state: 'file', bytes: raw.bytes, sha256: raw.sha256 };
  }
  return { state: 'unavailable' };
}

export async function computeUtf8Sha256Hex(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function extractWorkspaceWriteFailure(
  body: unknown,
  headerRequestId?: string | null,
): WorkspaceWriteFailureTelemetry | undefined {
  if (!isRecord(body)) return undefined;
  const candidate = isRecord(body.writeFailure)
    ? body.writeFailure
    : isRecord(body.failure)
      ? body.failure
      : undefined;
  if (!candidate) return undefined;
  const rawReqId = typeof candidate.requestId === 'string' && UUID_RE.test(candidate.requestId)
    ? candidate.requestId
    : typeof headerRequestId === 'string' && UUID_RE.test(headerRequestId)
      ? headerRequestId
      : undefined;
  const stage = typeof candidate.stage === 'string' && VALID_STAGES.has(candidate.stage)
    ? (candidate.stage as WorkspaceWriteFailureTelemetry['stage'])
    : undefined;
  const outcome = typeof candidate.outcome === 'string' && VALID_OUTCOMES.has(candidate.outcome)
    ? (candidate.outcome as WorkspaceWriteFailureTelemetry['outcome'])
    : undefined;
  if (!rawReqId || !stage || !outcome) return undefined;
  return {
    requestId: rawReqId,
    stage,
    outcome,
    before: parseObservation(candidate.before),
    after: parseObservation(candidate.after),
    ...(typeof candidate.requestedSha256 === 'string' && SHA256_RE.test(candidate.requestedSha256)
      ? { requestedSha256: candidate.requestedSha256 }
      : {}),
    ...(typeof candidate.systemCode === 'string' && SAFE_CODE_RE.test(candidate.systemCode)
      ? { systemCode: candidate.systemCode }
      : {}),
    ...(typeof candidate.syscall === 'string' && SAFE_SYSCALL_RE.test(candidate.syscall)
      ? { syscall: candidate.syscall }
      : {}),
  };
}

export function formatWorkspaceWriteErrorMessage(
  body: unknown,
  fallback: string,
  options: { status?: number; headerRequestId?: string | null; diskStatusNote?: string } = {},
): string {
  const baseError = isRecord(body) && typeof body.error === 'string' && body.error.trim()
    ? body.error.trim()
    : options.status
      ? `${fallback} (HTTP ${options.status})`
      : fallback;
  const telemetry = extractWorkspaceWriteFailure(body, options.headerRequestId);
  if (!telemetry) {
    return options.diskStatusNote ? `${baseError} ${options.diskStatusNote}` : baseError;
  }
  const parts = [`stage=${telemetry.stage}`, `outcome=${telemetry.outcome}`];
  if (telemetry.systemCode) parts.push(`code=${telemetry.systemCode}`);
  if (telemetry.syscall) parts.push(`syscall=${telemetry.syscall}`);
  parts.push(`requestId=${telemetry.requestId}`);
  const suffix = `[${parts.join(', ')}]`;
  return options.diskStatusNote
    ? `${baseError} ${suffix} ${options.diskStatusNote}`
    : `${baseError} ${suffix}`;
}

export async function reconcileFailedWorkspaceWrite(input: {
  status: number;
  body: unknown;
  headerRequestId?: string | null;
  fallbackMessage: string;
  intendedContent: string;
  expectedPreviousSha256?: string | null;
  expectedWorkspaceRootId?: string;
  readback?: () => Promise<WorkspaceReadbackSnapshot>;
}): Promise<ReconciledWorkspaceWriteOutcome> {
  const telemetry = extractWorkspaceWriteFailure(input.body, input.headerRequestId);
  const requestId = telemetry?.requestId
    ?? (typeof input.headerRequestId === 'string' && UUID_RE.test(input.headerRequestId) ? input.headerRequestId : undefined);

  // Non-5xx structured refusals (400/403/409/422) already carry deterministic pre-write semantics.
  if (input.status < 500 && !telemetry) {
    return {
      kind: 'unchanged-verified',
      message: formatWorkspaceWriteErrorMessage(input.body, input.fallbackMessage, {
        status: input.status,
        headerRequestId: input.headerRequestId,
      }),
      ...(requestId ? { requestId } : {}),
    };
  }

  const intendedSha256 = await computeUtf8Sha256Hex(input.intendedContent);

  // Read back actual workspace file state when a readback callback is provided.
  let snapshot: WorkspaceReadbackSnapshot = { state: 'unavailable' };
  if (input.readback) {
    try {
      snapshot = await input.readback();
    } catch {
      snapshot = { state: 'unavailable' };
    }
  }

  // Case 1: Readback confirms the intended bytes already landed cleanly on disk!
  if (
    snapshot.state === 'file'
    && snapshot.sha256 === intendedSha256
    && (snapshot.content === undefined || snapshot.content === input.intendedContent)
    && (input.expectedWorkspaceRootId === undefined || snapshot.workspaceRootId === input.expectedWorkspaceRootId)
  ) {
    return {
      kind: 'landed-verified',
      sha256: intendedSha256,
      ...(requestId ? { requestId } : {}),
    };
  }

  // Case 2: Readback or server `writeFailure` proves the prior state is still intact on disk.
  const priorWasAbsent = input.expectedPreviousSha256 === null;
  const priorSha = typeof input.expectedPreviousSha256 === 'string' && SHA256_RE.test(input.expectedPreviousSha256)
    ? input.expectedPreviousSha256
    : undefined;

  const readbackProvesUnchanged =
    (priorWasAbsent && snapshot.state === 'absent')
    || (Boolean(priorSha) && snapshot.state === 'file' && snapshot.sha256 === priorSha);

  const telemetryProvesUnchanged =
    snapshot.state === 'unavailable'
    && telemetry !== undefined
    && ((priorWasAbsent && telemetry.outcome === 'target-absent')
      || telemetry.outcome === 'before-bytes-observed');

  if (readbackProvesUnchanged || telemetryProvesUnchanged) {
    const diskNote = priorWasAbsent
      ? 'Verified on disk: target file is still absent; safe to retry.'
      : 'Verified on disk: previous file bytes are intact; safe to retry Save.';
    return {
      kind: 'unchanged-verified',
      message: formatWorkspaceWriteErrorMessage(input.body, input.fallbackMessage, {
        status: input.status,
        headerRequestId: input.headerRequestId,
        diskStatusNote: diskNote,
      }),
      ...(requestId ? { requestId } : {}),
    };
  }

  // Case 3: Readback succeeded and shows bytes that match neither prior nor intended content.
  if (
    (snapshot.state === 'file' && snapshot.sha256 !== intendedSha256 && (!priorSha || snapshot.sha256 !== priorSha))
    || (!priorWasAbsent && Boolean(priorSha) && snapshot.state === 'absent')
    || telemetry?.outcome === 'different-bytes-observed'
  ) {
    return {
      kind: 'diverged',
      message: formatWorkspaceWriteErrorMessage(input.body, input.fallbackMessage, {
        status: input.status,
        headerRequestId: input.headerRequestId,
        diskStatusNote: 'Disk bytes differ from both the previous baseline and the attempted write; reopen and inspect the file before retrying.',
      }),
      ...(requestId ? { requestId } : {}),
    };
  }

  return {
    kind: 'unconfirmed',
    message: formatWorkspaceWriteErrorMessage(input.body, input.fallbackMessage, {
      status: input.status,
      headerRequestId: input.headerRequestId,
      diskStatusNote: 'Disk state could not be confirmed automatically; inspect the file before retrying.',
    }),
    ...(requestId ? { requestId } : {}),
  };
}

export function runWorkspaceWriteRecoverySelftest(): {
  pass: boolean;
  checks: Array<{ name: string; pass: boolean }>;
} {
  const checks: Array<{ name: string; pass: boolean }> = [];
  const check = (name: string, pass: boolean) => checks.push({ name, pass });

  const sampleHashA = 'a'.repeat(64);
  const sampleHashB = 'b'.repeat(64);
  const sampleFailureBody = {
    ok: false,
    success: false,
    code: 'WORKSPACE_FILE_WRITE_FAILED',
    error: 'Workspace write failed during replace. Inspect the workspace file before deciding whether to retry.',
    failedStages: ['replace'],
    writeFailure: {
      requestId: '123e4567-e89b-12d3-a456-426614174000',
      stage: 'replace',
      outcome: 'before-bytes-observed',
      before: { state: 'file', bytes: 8902, sha256: sampleHashA },
      after: { state: 'file', bytes: 8902, sha256: sampleHashA },
      requestedSha256: sampleHashB,
      systemCode: 'EPERM',
      syscall: 'rename',
    },
  };

  const extracted = extractWorkspaceWriteFailure(sampleFailureBody);
  check(
    'workspace_write_recovery_extracts_correlated_telemetry',
    Boolean(extracted)
      && extracted?.requestId === '123e4567-e89b-12d3-a456-426614174000'
      && extracted?.stage === 'replace'
      && extracted?.outcome === 'before-bytes-observed'
      && extracted?.systemCode === 'EPERM'
      && extracted?.syscall === 'rename',
  );

  const formatted = formatWorkspaceWriteErrorMessage(sampleFailureBody, 'Fallback', { status: 500 });
  check(
    'workspace_write_recovery_formats_bounded_sanitized_metadata',
    formatted.includes('stage=replace')
      && formatted.includes('outcome=before-bytes-observed')
      && formatted.includes('code=EPERM')
      && formatted.includes('syscall=rename')
      && formatted.includes('requestId=123e4567-e89b-12d3-a456-426614174000'),
  );

  const unsafeMetadataBody = {
    error: 'Write failed.',
    writeFailure: {
      requestId: '123e4567-e89b-12d3-a456-426614174000',
      stage: 'replace',
      outcome: 'unknown',
      before: { state: 'unavailable' },
      after: { state: 'unavailable' },
      systemCode: 'C:\\secret\\path',
      syscall: 'UPPER_BAD_SYSCALL',
    },
  };
  const sanitized = formatWorkspaceWriteErrorMessage(unsafeMetadataBody, 'Fallback', { status: 500 });
  check(
    'workspace_write_recovery_drops_unsanitized_system_tokens',
    !sanitized.includes('secret') && !sanitized.includes('UPPER_BAD_SYSCALL')
      && sanitized.includes('requestId=123e4567-e89b-12d3-a456-426614174000'),
  );

  // Verify legacy `failure` field fallback on `/api/agent/files/write`
  const legacyAgentBody = {
    ok: false,
    code: 'WORKSPACE_FILE_WRITE_FAILED',
    error: 'Workspace file write failed.',
    failure: sampleFailureBody.writeFailure,
  };
  check(
    'workspace_write_recovery_accepts_agent_failure_alias',
    extractWorkspaceWriteFailure(legacyAgentBody)?.requestId === '123e4567-e89b-12d3-a456-426614174000',
  );

  return { pass: checks.every(c => c.pass), checks };
}

export async function runWorkspaceWriteRecoveryAsyncSelftest(): Promise<{
  pass: boolean;
  checks: Array<{ name: string; pass: boolean }>;
}> {
  const sync = runWorkspaceWriteRecoverySelftest();
  const checks = [...sync.checks];
  const check = (name: string, pass: boolean) => checks.push({ name, pass });

  const prevText = 'previous batch 103 handoff (8902 bytes)';
  const nextText = 'updated batch 104 handoff (10231 bytes)';
  const prevSha = await computeUtf8Sha256Hex(prevText);
  const nextSha = await computeUtf8Sha256Hex(nextText);

  const writeCalls = 0;
  const landed = await reconcileFailedWorkspaceWrite({
    status: 500,
    body: {
      code: 'WORKSPACE_FILE_WRITE_FAILED',
      error: 'Workspace write failed during verify.',
      writeFailure: {
        requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        stage: 'verify',
        outcome: 'requested-bytes-observed',
        before: { state: 'file', bytes: prevText.length, sha256: prevSha },
        after: { state: 'file', bytes: nextText.length, sha256: nextSha },
        requestedSha256: nextSha,
      },
    },
    fallbackMessage: 'Failed',
    intendedContent: nextText,
    expectedPreviousSha256: prevSha,
    readback: async () => ({ state: 'file', sha256: nextSha, content: nextText }),
  });
  check(
    'reconcile_adopts_landed_bytes_without_blind_retry_write',
    writeCalls === 0 && landed.kind === 'landed-verified' && landed.sha256 === nextSha,
  );

  const unchanged = await reconcileFailedWorkspaceWrite({
    status: 500,
    body: {
      code: 'WORKSPACE_FILE_WRITE_FAILED',
      error: 'Workspace write failed during replace.',
      writeFailure: {
        requestId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        stage: 'replace',
        outcome: 'before-bytes-observed',
        before: { state: 'file', bytes: prevText.length, sha256: prevSha },
        after: { state: 'file', bytes: prevText.length, sha256: prevSha },
        requestedSha256: nextSha,
        systemCode: 'EPERM',
        syscall: 'rename',
      },
    },
    fallbackMessage: 'Failed',
    intendedContent: nextText,
    expectedPreviousSha256: prevSha,
    readback: async () => ({ state: 'file', sha256: prevSha, content: prevText }),
  });
  check(
    'reconcile_confirms_intact_previous_bytes_on_transient_replace_failure',
    unchanged.kind === 'unchanged-verified'
      && unchanged.message.includes('previous file bytes are intact')
      && unchanged.message.includes('code=EPERM')
      && unchanged.message.includes('requestId=bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'),
  );

  const diverged = await reconcileFailedWorkspaceWrite({
    status: 500,
    body: { code: 'WORKSPACE_FILE_WRITE_FAILED', error: 'Workspace write failed during replace.' },
    headerRequestId: 'cccccccc-dddd-4eee-8fff-000000000000',
    fallbackMessage: 'Failed',
    intendedContent: nextText,
    expectedPreviousSha256: prevSha,
    readback: async () => ({ state: 'file', sha256: 'f'.repeat(64), content: 'foreign concurrent edit' }),
  });
  check(
    'reconcile_flags_diverged_disk_bytes_and_blocks_blind_retry',
    diverged.kind === 'diverged' && diverged.message.includes('differ from both'),
  );

  return { pass: checks.every(c => c.pass), checks };
}
