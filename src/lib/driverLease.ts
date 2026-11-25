/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #49 (FF-3, FF-13) — Opt-in, TTL-bounded driver session lease for coordinating
 * multi-step Studio UI, Agent API, and MCP runs on a shared Forge sidecar.
 *
 * Ephemeral in-memory state by design: lease expiry or a sidecar restart always
 * clears the holder without leaving stale lockfiles on disk.
 */

export const DRIVER_LEASE_MIN_TTL_MS = 5_000;
export const DRIVER_LEASE_MAX_TTL_MS = 3_600_000;
export const DRIVER_LEASE_DEFAULT_TTL_MS = 300_000;
export const DRIVER_LEASE_ID_RE = /^dl_[a-f0-9]{24}$/;
export const DRIVER_LEASE_DRIVER_MAX_LENGTH = 64;
export const DRIVER_LEASE_PURPOSE_MAX_LENGTH = 240;
export const DRIVER_LEASE_CLIENT_MAX_LENGTH = 128;

export type DriverLeaseAction = 'acquire' | 'renew' | 'release';
export type DriverLeaseActorKind = 'studio' | 'agent';

export type DriverLeaseErrorCode =
  | 'CAPABILITY_INPUT_INVALID'
  | 'DRIVER_LEASE_HELD'
  | 'DRIVER_LEASE_NOT_HELD'
  | 'DRIVER_LEASE_MISMATCH'
  | 'DRIVER_LEASE_FORCE_STUDIO_ONLY';

export interface DriverLeaseActor {
  readonly principalId: string;
  readonly actorKind: DriverLeaseActorKind;
  readonly actorLabel: string;
  readonly defaultDriver: string;
  readonly workspaceId?: string | null;
  readonly modId?: string | null;
}

export interface PublicDriverLeaseStatus {
  readonly held: boolean;
  readonly heldByCaller: boolean;
  readonly driver: string | null;
  readonly leaseId: string | null;
  readonly actorKind: DriverLeaseActorKind | null;
  readonly actorLabel: string | null;
  readonly client: string | null;
  readonly purpose: string | null;
  readonly workspaceId: string | null;
  readonly modId: string | null;
  readonly since: string | null;
  readonly renewedAt: string | null;
  readonly expiresAt: string | null;
  readonly ttlMs: number | null;
  readonly remainingMs: number;
}

export interface DriverLeaseManageInput {
  readonly action: DriverLeaseAction;
  readonly driver?: string;
  readonly purpose?: string;
  readonly client?: string;
  readonly ttlMs?: number;
  readonly leaseId?: string;
  readonly force?: boolean;
}

export type DriverLeaseManageResult =
  | {
      readonly ok: true;
      readonly status: 200;
      readonly body: {
        readonly ok: true;
        readonly success: true;
        readonly action: DriverLeaseAction;
        readonly acquired?: boolean;
        readonly reused?: boolean;
        readonly preempted?: boolean;
        readonly renewed?: boolean;
        readonly released?: boolean;
        readonly forced?: boolean;
        readonly releasedLeaseId?: string | null;
        readonly driverLease: PublicDriverLeaseStatus;
      };
    }
  | {
      readonly ok: false;
      readonly status: 400 | 403 | 409;
      readonly body: {
        readonly ok: false;
        readonly success: false;
        readonly code: DriverLeaseErrorCode;
        readonly error: string;
        readonly driverLease: PublicDriverLeaseStatus;
      };
    };

export type DriverLeaseMutationDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly status: 403 | 409;
      readonly code: 'DRIVER_LEASE_HELD' | 'DRIVER_LEASE_FORCE_STUDIO_ONLY';
      readonly error: string;
      readonly driverLease: PublicDriverLeaseStatus;
    };

interface InternalDriverLeaseRecord {
  leaseId: string;
  principalId: string;
  actorKind: DriverLeaseActorKind;
  actorLabel: string;
  driver: string;
  client: string | null;
  purpose: string | null;
  workspaceId: string | null;
  modId: string | null;
  sinceMs: number;
  renewedAtMs: number;
  expiresAtMs: number;
  ttlMs: number;
}

const ALLOWED_MANAGE_KEYS = new Set([
  'action',
  'driver',
  'purpose',
  'client',
  'ttlMs',
  'leaseId',
  'force',
]);

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function defaultGenerateLeaseId(): string {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let hex = '';
  for (let index = 0; index < bytes.length; index += 1) {
    hex += bytes[index].toString(16).padStart(2, '0');
  }
  return `dl_${hex}`;
}

export function formatDriverLeaseConflictMessage(
  holder: {
    readonly driver: string;
    readonly actorLabel: string;
    readonly purpose: string | null;
    readonly expiresAtMs: number;
  },
  nowMs: number,
): string {
  const remainingSec = Math.max(1, Math.ceil((holder.expiresAtMs - nowMs) / 1000));
  const who = holder.actorLabel && holder.actorLabel !== holder.driver
    ? `${holder.driver} (${holder.actorLabel})`
    : holder.driver;
  const purposeClause = holder.purpose ? ` for "${holder.purpose}"` : '';
  return `Forge is currently in use by ${who}${purposeClause} (${remainingSec}s remaining until ${new Date(holder.expiresAtMs).toISOString()}). Wait for the active driver to release its lease, or use Force Release from the Studio UI if you own this session.`;
}

export function parseDriverLeaseManageBody(
  raw: unknown,
): { ok: true; value: DriverLeaseManageInput } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'session.lease.manage requires a JSON object body.' };
  }
  const extra = Object.keys(raw).filter(key => !ALLOWED_MANAGE_KEYS.has(key));
  if (extra.length > 0) {
    return { ok: false, error: `session.lease.manage does not accept: ${extra.join(', ')}` };
  }
  const action = raw.action;
  if (action !== 'acquire' && action !== 'renew' && action !== 'release') {
    return { ok: false, error: 'action must be "acquire", "renew", or "release".' };
  }
  let driver: string | undefined;
  if (raw.driver !== undefined) {
    if (typeof raw.driver !== 'string') {
      return { ok: false, error: 'driver must be a non-empty printable string.' };
    }
    const trimmed = raw.driver.trim();
    if (!trimmed || trimmed.length > DRIVER_LEASE_DRIVER_MAX_LENGTH || hasControlChars(trimmed)) {
      return {
        ok: false,
        error: `driver must be 1..${DRIVER_LEASE_DRIVER_MAX_LENGTH} printable characters without control codes.`,
      };
    }
    driver = trimmed;
  }
  let purpose: string | undefined;
  if (raw.purpose !== undefined) {
    if (typeof raw.purpose !== 'string') {
      return { ok: false, error: 'purpose must be a string.' };
    }
    const trimmed = raw.purpose.trim();
    if (trimmed.length > DRIVER_LEASE_PURPOSE_MAX_LENGTH || hasControlChars(trimmed)) {
      return {
        ok: false,
        error: `purpose must be at most ${DRIVER_LEASE_PURPOSE_MAX_LENGTH} printable characters without control codes.`,
      };
    }
    purpose = trimmed;
  }
  let client: string | undefined;
  if (raw.client !== undefined) {
    if (typeof raw.client !== 'string') {
      return { ok: false, error: 'client must be a string.' };
    }
    const trimmed = raw.client.trim();
    if (trimmed.length > DRIVER_LEASE_CLIENT_MAX_LENGTH || hasControlChars(trimmed)) {
      return {
        ok: false,
        error: `client must be at most ${DRIVER_LEASE_CLIENT_MAX_LENGTH} printable characters without control codes.`,
      };
    }
    client = trimmed;
  }
  let ttlMs: number | undefined;
  if (raw.ttlMs !== undefined) {
    if (
      typeof raw.ttlMs !== 'number'
      || !Number.isSafeInteger(raw.ttlMs)
      || raw.ttlMs < DRIVER_LEASE_MIN_TTL_MS
      || raw.ttlMs > DRIVER_LEASE_MAX_TTL_MS
    ) {
      return {
        ok: false,
        error: `ttlMs must be an integer between ${DRIVER_LEASE_MIN_TTL_MS} and ${DRIVER_LEASE_MAX_TTL_MS}.`,
      };
    }
    ttlMs = raw.ttlMs;
  }
  let leaseId: string | undefined;
  if (raw.leaseId !== undefined) {
    if (typeof raw.leaseId !== 'string' || !DRIVER_LEASE_ID_RE.test(raw.leaseId)) {
      return { ok: false, error: 'leaseId must match dl_<24 lowercase hex chars>.' };
    }
    leaseId = raw.leaseId;
  }
  let force: boolean | undefined;
  if (raw.force !== undefined) {
    if (typeof raw.force !== 'boolean') {
      return { ok: false, error: 'force must be a boolean.' };
    }
    force = raw.force;
  }
  return {
    ok: true,
    value: {
      action,
      ...(driver !== undefined ? { driver } : {}),
      ...(purpose !== undefined ? { purpose } : {}),
      ...(client !== undefined ? { client } : {}),
      ...(ttlMs !== undefined ? { ttlMs } : {}),
      ...(leaseId !== undefined ? { leaseId } : {}),
      ...(force !== undefined ? { force } : {}),
    },
  };
}

export class DriverLeaseStore {
  private current: InternalDriverLeaseRecord | null = null;
  private readonly nowFn: () => number;
  private readonly generateId: () => string;

  constructor(options?: { now?: () => number; generateLeaseId?: () => string }) {
    this.nowFn = options?.now ?? (() => Date.now());
    this.generateId = options?.generateLeaseId ?? defaultGenerateLeaseId;
  }

  private pruneExpired(nowMs: number): void {
    if (this.current && this.current.expiresAtMs <= nowMs) {
      this.current = null;
    }
  }

  status(viewerPrincipalId?: string | null, atMs?: number): PublicDriverLeaseStatus {
    const nowMs = atMs ?? this.nowFn();
    this.pruneExpired(nowMs);
    if (!this.current) {
      return {
        held: false,
        heldByCaller: false,
        driver: null,
        leaseId: null,
        actorKind: null,
        actorLabel: null,
        client: null,
        purpose: null,
        workspaceId: null,
        modId: null,
        since: null,
        renewedAt: null,
        expiresAt: null,
        ttlMs: null,
        remainingMs: 0,
      };
    }
    return {
      held: true,
      heldByCaller: Boolean(viewerPrincipalId && this.current.principalId === viewerPrincipalId),
      driver: this.current.driver,
      leaseId: this.current.leaseId,
      actorKind: this.current.actorKind,
      actorLabel: this.current.actorLabel,
      client: this.current.client,
      purpose: this.current.purpose,
      workspaceId: this.current.workspaceId,
      modId: this.current.modId,
      since: new Date(this.current.sinceMs).toISOString(),
      renewedAt: new Date(this.current.renewedAtMs).toISOString(),
      expiresAt: new Date(this.current.expiresAtMs).toISOString(),
      ttlMs: this.current.ttlMs,
      remainingMs: Math.max(0, this.current.expiresAtMs - nowMs),
    };
  }

  manage(actor: DriverLeaseActor, rawBody: unknown, atMs?: number): DriverLeaseManageResult {
    const nowMs = atMs ?? this.nowFn();
    this.pruneExpired(nowMs);
    const parsed = parseDriverLeaseManageBody(rawBody);
    if (parsed.ok === false) {
      return {
        ok: false,
        status: 400,
        body: {
          ok: false,
          success: false,
          code: 'CAPABILITY_INPUT_INVALID',
          error: parsed.error,
          driverLease: this.status(actor.principalId, nowMs),
        },
      };
    }
    const input = parsed.value;
    if (input.force === true && actor.actorKind !== 'studio') {
      return {
        ok: false,
        status: 403,
        body: {
          ok: false,
          success: false,
          code: 'DRIVER_LEASE_FORCE_STUDIO_ONLY',
          error: 'Only the Studio owner session may force-override or force-release an active driver lease.',
          driverLease: this.status(actor.principalId, nowMs),
        },
      };
    }

    if (input.action === 'acquire') {
      if (this.current && this.current.principalId !== actor.principalId && input.force !== true) {
        return {
          ok: false,
          status: 409,
          body: {
            ok: false,
            success: false,
            code: 'DRIVER_LEASE_HELD',
            error: formatDriverLeaseConflictMessage(this.current, nowMs),
            driverLease: this.status(actor.principalId, nowMs),
          },
        };
      }
      if (this.current && this.current.principalId === actor.principalId) {
        if (input.leaseId !== undefined && input.leaseId !== this.current.leaseId) {
          return {
            ok: false,
            status: 409,
            body: {
              ok: false,
              success: false,
              code: 'DRIVER_LEASE_MISMATCH',
              error: `Active driver lease "${this.current.leaseId}" does not match expected "${input.leaseId}".`,
              driverLease: this.status(actor.principalId, nowMs),
            },
          };
        }
        const ttlMs = input.ttlMs ?? this.current.ttlMs;
        this.current = {
          ...this.current,
          actorLabel: actor.actorLabel,
          driver: input.driver ?? this.current.driver,
          client: input.client !== undefined ? (input.client || null) : this.current.client,
          purpose: input.purpose !== undefined ? (input.purpose || null) : this.current.purpose,
          workspaceId: actor.workspaceId ?? this.current.workspaceId,
          modId: actor.modId ?? this.current.modId,
          renewedAtMs: nowMs,
          expiresAtMs: nowMs + ttlMs,
          ttlMs,
        };
        return {
          ok: true,
          status: 200,
          body: {
            ok: true,
            success: true,
            action: 'acquire',
            acquired: true,
            reused: true,
            preempted: false,
            driverLease: this.status(actor.principalId, nowMs),
          },
        };
      }
      const preempted = Boolean(this.current && this.current.principalId !== actor.principalId);
      const ttlMs = input.ttlMs ?? DRIVER_LEASE_DEFAULT_TTL_MS;
      this.current = {
        leaseId: this.generateId(),
        principalId: actor.principalId,
        actorKind: actor.actorKind,
        actorLabel: actor.actorLabel,
        driver: input.driver ?? actor.defaultDriver,
        client: input.client ? input.client : null,
        purpose: input.purpose ? input.purpose : null,
        workspaceId: actor.workspaceId ?? null,
        modId: actor.modId ?? null,
        sinceMs: nowMs,
        renewedAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
        ttlMs,
      };
      return {
        ok: true,
        status: 200,
        body: {
          ok: true,
          success: true,
          action: 'acquire',
          acquired: true,
          reused: false,
          preempted,
          driverLease: this.status(actor.principalId, nowMs),
        },
      };
    }

    if (input.action === 'renew') {
      if (!this.current) {
        return {
          ok: false,
          status: 409,
          body: {
            ok: false,
            success: false,
            code: 'DRIVER_LEASE_NOT_HELD',
            error: 'No active driver lease is currently held (it may have expired or been released). Acquire a lease first.',
            driverLease: this.status(actor.principalId, nowMs),
          },
        };
      }
      if (this.current.principalId !== actor.principalId) {
        return {
          ok: false,
          status: 409,
          body: {
            ok: false,
            success: false,
            code: 'DRIVER_LEASE_HELD',
            error: formatDriverLeaseConflictMessage(this.current, nowMs),
            driverLease: this.status(actor.principalId, nowMs),
          },
        };
      }
      if (input.leaseId !== undefined && input.leaseId !== this.current.leaseId) {
        return {
          ok: false,
          status: 409,
          body: {
            ok: false,
            success: false,
            code: 'DRIVER_LEASE_MISMATCH',
            error: `Active driver lease "${this.current.leaseId}" does not match expected "${input.leaseId}".`,
            driverLease: this.status(actor.principalId, nowMs),
          },
        };
      }
      const ttlMs = input.ttlMs ?? this.current.ttlMs;
      this.current = {
        ...this.current,
        actorLabel: actor.actorLabel,
        ...(input.driver !== undefined ? { driver: input.driver } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose || null } : {}),
        ...(input.client !== undefined ? { client: input.client || null } : {}),
        workspaceId: actor.workspaceId ?? this.current.workspaceId,
        modId: actor.modId ?? this.current.modId,
        renewedAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
        ttlMs,
      };
      return {
        ok: true,
        status: 200,
        body: {
          ok: true,
          success: true,
          action: 'renew',
          renewed: true,
          driverLease: this.status(actor.principalId, nowMs),
        },
      };
    }

    // action === 'release'
    if (!this.current) {
      return {
        ok: true,
        status: 200,
        body: {
          ok: true,
          success: true,
          action: 'release',
          released: false,
          forced: false,
          releasedLeaseId: null,
          driverLease: this.status(actor.principalId, nowMs),
        },
      };
    }
    const heldByOther = this.current.principalId !== actor.principalId;
    if (heldByOther && input.force !== true) {
      return {
        ok: false,
        status: 409,
        body: {
          ok: false,
          success: false,
          code: 'DRIVER_LEASE_HELD',
          error: formatDriverLeaseConflictMessage(this.current, nowMs),
          driverLease: this.status(actor.principalId, nowMs),
        },
      };
    }
    if (!heldByOther && input.leaseId !== undefined && input.leaseId !== this.current.leaseId) {
      return {
        ok: false,
        status: 409,
        body: {
          ok: false,
          success: false,
          code: 'DRIVER_LEASE_MISMATCH',
          error: `Active driver lease "${this.current.leaseId}" does not match expected "${input.leaseId}".`,
          driverLease: this.status(actor.principalId, nowMs),
        },
      };
    }
    const releasedLeaseId = this.current.leaseId;
    this.current = null;
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        success: true,
        action: 'release',
        released: true,
        forced: Boolean(heldByOther && input.force === true),
        releasedLeaseId,
        driverLease: this.status(actor.principalId, nowMs),
      },
    };
  }

  checkMutation(
    actor: DriverLeaseActor,
    options?: { forceOverride?: boolean; atMs?: number },
  ): DriverLeaseMutationDecision {
    const nowMs = options?.atMs ?? this.nowFn();
    if (options?.forceOverride === true) {
      if (actor.actorKind !== 'studio') {
        return {
          allowed: false,
          status: 403,
          code: 'DRIVER_LEASE_FORCE_STUDIO_ONLY',
          error: 'Only the Studio owner session may force-bypass an active driver lease.',
          driverLease: this.status(actor.principalId, nowMs),
        };
      }
      return { allowed: true };
    }
    this.pruneExpired(nowMs);
    if (!this.current || this.current.principalId === actor.principalId) {
      return { allowed: true };
    }
    return {
      allowed: false,
      status: 409,
      code: 'DRIVER_LEASE_HELD',
      error: formatDriverLeaseConflictMessage(this.current, nowMs),
      driverLease: this.status(actor.principalId, nowMs),
    };
  }
}

export function runDriverLeaseSelftest(): { passed: number; checks: string[] } {
  let clock = 1_700_000_000_000;
  let seq = 0;
  const store = new DriverLeaseStore({
    now: () => clock,
    generateLeaseId: () => `dl_${(++seq).toString(16).padStart(24, '0')}`,
  });
  const studio: DriverLeaseActor = {
    principalId: 'studio',
    actorKind: 'studio',
    actorLabel: 'Studio UI',
    defaultDriver: 'studio-ui',
    workspaceId: 'ws_111111111111111111111111',
    modId: 'demo_mod',
  };
  const agentA: DriverLeaseActor = {
    principalId: 'agent:key_a',
    actorKind: 'agent',
    actorLabel: 'Codex UI Harness',
    defaultDriver: 'agent-api',
    workspaceId: 'ws_111111111111111111111111',
    modId: 'demo_mod',
  };
  const agentB: DriverLeaseActor = {
    principalId: 'agent:key_b',
    actorKind: 'agent',
    actorLabel: 'Background Worker',
    defaultDriver: 'agent-mcp',
    workspaceId: 'ws_111111111111111111111111',
    modId: 'demo_mod',
  };

  const checks: string[] = [];
  const expectCheck = (name: string, cond: boolean) => {
    if (!cond) throw new Error(`driverLease selftest failed: ${name}`);
    checks.push(name);
  };

  expectCheck('idle_status_allows_all_mutations', !store.status(studio.principalId).held && store.checkMutation(agentA).allowed);

  const acquired = store.manage(agentA, { action: 'acquire', driver: 'codex-ui', purpose: 'E2E modal walkthrough', ttlMs: 60_000 });
  expectCheck(
    'agent_acquire_succeeds',
    acquired.ok === true
      && acquired.body.acquired === true
      && acquired.body.reused === false
      && acquired.body.driverLease.held === true
      && acquired.body.driverLease.heldByCaller === true
      && acquired.body.driverLease.driver === 'codex-ui',
  );
  const firstLeaseId = acquired.body.driverLease.leaseId!;

  const reacquired = store.manage(agentA, { action: 'acquire', driver: 'codex-ui', purpose: 'Step 2', ttlMs: 90_000 });
  expectCheck(
    'same_principal_reacquire_reuses_lease',
    reacquired.ok === true
      && reacquired.body.reused === true
      && reacquired.body.driverLease.leaseId === firstLeaseId
      && reacquired.body.driverLease.ttlMs === 90_000,
  );

  const blockedAgentB = store.manage(agentB, { action: 'acquire', driver: 'worker-b' });
  expectCheck(
    'other_agent_acquire_409',
    blockedAgentB.ok === false && blockedAgentB.status === 409 && blockedAgentB.body.code === 'DRIVER_LEASE_HELD',
  );

  const blockedMutation = store.checkMutation(studio);
  expectCheck(
    'unforced_studio_mutation_409_while_agent_holds_lease',
    blockedMutation.allowed === false && blockedMutation.status === 409 && blockedMutation.code === 'DRIVER_LEASE_HELD',
  );
  expectCheck('holder_own_mutation_allowed', store.checkMutation(agentA).allowed === true);
  expectCheck('studio_force_mutation_override_allowed', store.checkMutation(studio, { forceOverride: true }).allowed === true);

  const agentForceDenied = store.checkMutation(agentB, { forceOverride: true });
  expectCheck(
    'agent_force_mutation_override_403',
    agentForceDenied.allowed === false && agentForceDenied.status === 403 && agentForceDenied.code === 'DRIVER_LEASE_FORCE_STUDIO_ONLY',
  );

  const agentForceManageDenied = store.manage(agentB, { action: 'release', force: true });
  expectCheck(
    'agent_force_manage_403',
    agentForceManageDenied.ok === false && agentForceManageDenied.status === 403 && agentForceManageDenied.body.code === 'DRIVER_LEASE_FORCE_STUDIO_ONLY',
  );

  const wrongCas = store.manage(agentA, { action: 'renew', leaseId: `dl_${'f'.repeat(24)}` });
  expectCheck(
    'lease_id_cas_mismatch_409',
    wrongCas.ok === false && wrongCas.status === 409 && wrongCas.body.code === 'DRIVER_LEASE_MISMATCH',
  );

  clock += 90_001;
  expectCheck('ttl_expiry_auto_frees_lease', store.status(agentA.principalId).held === false);

  const renewAfterExpiry = store.manage(agentA, { action: 'renew' });
  expectCheck(
    'renew_after_expiry_409_not_held',
    renewAfterExpiry.ok === false && renewAfterExpiry.status === 409 && renewAfterExpiry.body.code === 'DRIVER_LEASE_NOT_HELD',
  );

  const reAcquireAgent = store.manage(agentA, { action: 'acquire', driver: 'codex-ui', ttlMs: 120_000 });
  expectCheck('reacquire_after_expiry_new_id', reAcquireAgent.ok === true && reAcquireAgent.body.driverLease.leaseId !== firstLeaseId);

  const studioForceRelease = store.manage(studio, { action: 'release', force: true });
  expectCheck(
    'studio_owner_force_release_clears_agent_lease',
    studioForceRelease.ok === true && studioForceRelease.body.released === true && studioForceRelease.body.forced === true && !store.status().held,
  );

  const idempotentRelease = store.manage(studio, { action: 'release' });
  expectCheck('idempotent_release_when_idle', idempotentRelease.ok === true && idempotentRelease.body.released === false);

  const invalidInput = store.manage(studio, { action: 'acquire', ttlMs: 1000, extra: true });
  expectCheck('closed_input_validation_400', invalidInput.ok === false && invalidInput.status === 400 && invalidInput.body.code === 'CAPABILITY_INPUT_INVALID');

  return { passed: checks.length, checks };
}
