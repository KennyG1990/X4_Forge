/** Owned backend IPC state. Transport delivery never proves a native control executed. */
import type { ForgePerformanceSnapshot } from '../../shared/forgePerformance.js';
import {
  createNativePerformanceWireSession, isNativeInstanceId, normalizeNativeCollectionOptions,
  type NativeCollectionOptions, type NativeControlFailureCode, type NativeHostMessage,
  type NativePerformanceStatus, type NativePerformanceWireSession, type NativeWireBinding,
} from '../../shared/nativePerformanceProtocol.js';
import {
  createNativePerformanceSendQueue, NATIVE_PERFORMANCE_TRANSPORT_LIMITS,
  type NativePerformanceEndpoint,
} from '../../shared/nativePerformanceChannel.js';

export interface NativeBrokerActor {
  kind: 'studio' | 'agent';
  id: string;
  /** Trusted adapter: re-read current authority, not an HTTP body or retained bearer. */
  isCurrent(): boolean;
}
export interface NativeBrokerTimers {
  /** Return a finite numeric/object handle; throwing must not retain unreturned work. */
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}
export interface NativePerformanceBrokerOptions {
  backendInstanceId: string;
  binding?: NativeWireBinding;
  channel?: NativePerformanceEndpoint;
  expectedHostPid?: number;
  now(): number;
  timers: NativeBrokerTimers;
  /** Once after local fencing. Lifecycle notification is not a native execution ACK. */
  onRetire?(reason: NativeBrokerRetireReason): void;
}
export type NativeBrokerFailureCode = NativeControlFailureCode
  | 'NATIVE_PERFORMANCE_UNAVAILABLE' | 'NATIVE_PERFORMANCE_IDENTITY_MISMATCH'
  | 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED' | 'NATIVE_PERFORMANCE_NOT_OWNER'
  | 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT' | 'NATIVE_PERFORMANCE_ABORTED'
  | 'NATIVE_PERFORMANCE_PREEMPTED' | 'NATIVE_PERFORMANCE_PROTOCOL_ERROR'
  | 'NATIVE_PERFORMANCE_RETIRED' | 'NATIVE_PERFORMANCE_READER_LIMIT';
export type NativeBrokerRetireReason =
  'backend-exit' | 'disconnect' | 'stopped' | 'disposed' | 'protocol' | 'send-failed' | 'timer-failed';
export type NativeBrokerRefreshOutcome =
  'never' | 'pending' | 'ok' | 'timeout' | 'aborted' | 'preempted' | 'rejected' | 'invalidated' | 'retired';
export type NativeCaptureOwnership = 'none' | 'self' | 'other' | 'operator';
export interface NativeBrokerView {
  schemaVersion: 'forge.native-performance.broker.v1';
  backendInstanceId: string;
  availability: 'unavailable' | 'waiting' | 'ready' | 'retired';
  unavailableReason: 'transport-absent' | 'contract-invalid' | 'waiting' | 'ready-timeout' | 'producer-disposed' | 'retired' | 'authority-revoked' | null;
  native: NativePerformanceStatus | null;
  pending: 'read' | 'start' | 'stop' | null;
  cancellation: 'none' | 'pending' | 'unknown';
  cleanupUnconfirmed: boolean;
  orphaned: boolean;
  captureOwned: boolean;
  readSubscribers: number;
  snapshot: ForgePerformanceSnapshot | null;
  snapshotAgeMs: number | null;
  lastRefreshOutcome: NativeBrokerRefreshOutcome;
  rejectedMessages: number;
  lateResults: number;
  droppedSnapshots: number;
  timerCleanupUnconfirmed: boolean;
}
export type NativeBrokerResult =
  | { ok: true; status: Readonly<NativeBrokerView> }
  | { ok: false; code: NativeBrokerFailureCode; status: Readonly<NativeBrokerView> };
export interface NativeBrokerReadRequest { actor: NativeBrokerActor; signal?: AbortSignal }
export interface NativeBrokerIdentityRequest extends NativeBrokerReadRequest {
  expectedBackendInstanceId: string;
  expectedNativeInstanceId: string;
}
export interface NativeBrokerStartRequest extends NativeBrokerIdentityRequest { options?: NativeCollectionOptions }
export interface NativeBrokerStopRequest extends NativeBrokerIdentityRequest { captureId: string }
export interface NativePerformanceBroker {
  status(): Readonly<NativeBrokerView>;
  /** Trusted relative projection only; never serialize the underlying actor identity. */
  ownership(actor: NativeBrokerActor): NativeCaptureOwnership;
  read(request: NativeBrokerReadRequest): Promise<NativeBrokerResult>;
  start(request: NativeBrokerStartRequest): Promise<NativeBrokerResult>;
  stop(request: NativeBrokerStopRequest): Promise<NativeBrokerResult>;
  retire(reason?: NativeBrokerRetireReason): void;
}

type Identity = Pick<NativeBrokerActor, 'kind' | 'id'>;
interface TimerOwner { active: boolean; ready: boolean; handle: unknown }
interface Lease { captureId: string; owner: Identity }
interface Cancellation {
  controlId: string; captureId: string; owner: Identity; nativeInstanceId: string;
  reconciliationId: string | null; state: 'pending' | 'unknown'; timer?: TimerOwner;
}
interface PendingBase { id: string; attempted: boolean; timer?: TimerOwner }
interface ReadWaiter {
  actor: NativeBrokerActor; resolve(result: NativeBrokerResult): void; releaseAbort(): void;
}
interface ReadPending extends PendingBase { kind: 'read'; waiters: Set<ReadWaiter> }
interface ControlPending extends PendingBase {
  kind: 'start' | 'stop'; captureId: string; nativeInstanceId: string; actor: NativeBrokerActor;
  signal?: AbortSignal; releaseAbort(): void; resolve(result: NativeBrokerResult): void;
}
type Pending = ReadPending | ControlPending;
interface CachedReport {
  nativeInstanceId: string; captureId: string | null; snapshot: ForgePerformanceSnapshot; receivedAt: number | null;
}
const sameOwner = (a: Identity, b: Identity) => a.kind === b.kind && a.id === b.id;
const clean = (status: NativePerformanceStatus) => !status.disposed && !status.collectionActive
  && !status.collectionCleanupUnconfirmed && status.ownedTimerCount === 0 && status.failedTimerCount === 0
  && !status.eventLoopDelayMonitoring;
const actorShape = (actor: NativeBrokerActor | undefined): actor is NativeBrokerActor => {
  if (!actor || !(actor.kind === 'studio' || actor.kind === 'agent') || typeof actor.id !== 'string'
    || !(actor.id.length > 0 && actor.id.length <= 256)) return false;
  const id = actor.id;
  for (let index = 0; index < id.length; index++) {
    const unit = id.charCodeAt(index);
    if (unit <= 0x1f || unit === 0x7f) return false;
  }
  return typeof actor.isCurrent === 'function';
};
const identity = (actor: NativeBrokerActor): Identity => ({ kind: actor.kind, id: actor.id });
const current = (actor: NativeBrokerActor) => { try { return actor.isCurrent() === true; } catch { return false; } };
const add = (count: number) => Math.min(Number.MAX_SAFE_INTEGER, count + 1);

export function createNativePerformanceBroker(options: NativePerformanceBrokerOptions): NativePerformanceBroker {
  if (!options || !isNativeInstanceId(options.backendInstanceId) || typeof options.now !== 'function'
    || (options.expectedHostPid !== undefined && (!Number.isSafeInteger(options.expectedHostPid) || options.expectedHostPid <= 0))
    || (options.onRetire !== undefined && typeof options.onRetire !== 'function')
    || !options.timers || typeof options.timers.set !== 'function' || typeof options.timers.clear !== 'function') {
    throw new TypeError('NATIVE_BROKER_DEPENDENCIES_INVALID');
  }
  const backendInstanceId = options.backendInstanceId;
  const onRetire = options.onRetire;
  let retirementNotified = false;
  let retired = false;
  let availability: NativeBrokerView['availability'] = 'unavailable';
  let unavailableReason: NativeBrokerView['unavailableReason'] = 'transport-absent';
  let native: NativePerformanceStatus | null = null;
  let pinnedNativeId: string | null = null;
  let pinnedPid: number | null = null;
  let pending: Pending | null = null;
  let cancellation: Cancellation | null = null;
  let lease: Lease | null = null;
  let history: Lease | null = null;
  let cached: CachedReport | null = null;
  let refresh: NativeBrokerRefreshOutcome = 'never';
  let rejectedMessages = 0, lateResults = 0, droppedSnapshots = 0;
  let timerCleanupUnconfirmed = false;
  let sequence = 0;
  let readyTimer: TimerOwner | undefined;
  let helloAttempted = false;
  let releaseMessage: (() => void) | undefined, releaseDisconnect: (() => void) | undefined;
  let wire: NativePerformanceWireSession | undefined;
  let sender: ReturnType<typeof createNativePerformanceSendQueue> | undefined;
  const timers = new Set<TimerOwner>();

  const clock = () => { try { const n = options.now(); return Number.isFinite(n) && n >= 0 ? n : null; } catch { return null; } };
  const orphan = () => !!native && (native.collectionActive || native.collectionCleanupUnconfirmed
    || native.ownedTimerCount > 0 || native.failedTimerCount > 0 || native.eventLoopDelayMonitoring)
    && !(lease && native.captureId === lease.captureId)
    && !(history && native.captureId === history.captureId) && !cancellation;
  const view = (): Readonly<NativeBrokerView> => {
    const now = clock();
    return Object.freeze({
      schemaVersion: 'forge.native-performance.broker.v1' as const, backendInstanceId, availability, unavailableReason,
      native, pending: pending?.kind ?? null, cancellation: cancellation?.state ?? 'none',
      cleanupUnconfirmed: !!cancellation || !!native?.collectionCleanupUnconfirmed || orphan(),
      orphaned: orphan(), captureOwned: !!lease && lease.captureId === native?.captureId && native?.collectionActive === true,
      readSubscribers: pending?.kind === 'read' ? pending.waiters.size : 0,
      snapshot: cached?.snapshot ?? null,
      snapshotAgeMs: cached?.receivedAt !== null && cached?.receivedAt !== undefined && now !== null && now >= cached.receivedAt
        ? now - cached.receivedAt : null,
      lastRefreshOutcome: refresh, rejectedMessages, lateResults, droppedSnapshots, timerCleanupUnconfirmed,
    });
  };
  const fail = (code: NativeBrokerFailureCode): NativeBrokerResult => {
    const observed = view();
    // A revoked queued caller cannot obtain evidence collected for another authorized reader.
    const status = code === 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED' ? Object.freeze({
      ...observed, availability: 'unavailable' as const, unavailableReason: 'authority-revoked' as const,
      native: null, snapshot: null, snapshotAgeMs: null, pending: null, cancellation: 'none' as const,
      cleanupUnconfirmed: false, orphaned: false, captureOwned: false, readSubscribers: 0,
      lastRefreshOutcome: 'never' as const, rejectedMessages: 0, lateResults: 0, droppedSnapshots: 0,
      timerCleanupUnconfirmed: false,
    }) : observed;
    return { ok: false, code, status };
  };
  const success = (): NativeBrokerResult => ({ ok: true, status: view() });
  const nextId = (kind: 'control' | 'capture' | 'cancel') => {
    if (sequence === Number.MAX_SAFE_INTEGER) return null;
    return kind + '_' + backendInstanceId.slice(0, 96) + '_' + ++sequence;
  };
  const clearTimer = (timer: TimerOwner | undefined) => {
    if (!timer || !timer.active) return;
    timer.active = false; timers.delete(timer);
    try { options.timers.clear(timer.handle); }
    catch { timerCleanupUnconfirmed = true; retire('timer-failed'); }
  };
  const setTimer = (delay: number, callback: () => void): TimerOwner | undefined => {
    const timer: TimerOwner = { active: true, ready: false, handle: undefined };
    let synchronous = false;
    timers.add(timer);
    try {
      timer.handle = options.timers.set(() => {
        if (!timer.active) return;
        if (!timer.ready) { synchronous = true; return; }
        timer.active = false; timers.delete(timer); callback();
      }, delay);
      timer.ready = true;
      if (!(typeof timer.handle === 'number' && Number.isFinite(timer.handle) && timer.handle >= 0
        || typeof timer.handle === 'object' && timer.handle !== null)) {
        timer.active = false; timers.delete(timer); timerCleanupUnconfirmed = true;
        retire('timer-failed'); return undefined;
      }
      if (synchronous) { clearTimer(timer); retire('timer-failed'); return undefined; }
      return timer;
    } catch {
      timer.active = false; timers.delete(timer); retire('timer-failed'); return undefined;
    }
  };
  const invalidateReport = () => {
    if (!cached) return;
    cached = null; refresh = 'invalidated';
  };
  const clearCancellation = () => {
    const prior = cancellation;
    cancellation = null;
    if (prior && native && native.captureId === prior.captureId && clean(native)) {
      history = { captureId: prior.captureId, owner: prior.owner };
    }
    clearTimer(prior?.timer);
  };
  const observe = (status: NativePerformanceStatus) => {
    if (cached && (cached.nativeInstanceId !== status.producer.instanceId || cached.captureId !== status.captureId)) invalidateReport();
    native = status;
    if (lease && (status.captureId !== lease.captureId || clean(status))) {
      if (status.captureId === lease.captureId) history = lease;
      lease = null;
    }
    if (status.disposed) { availability = 'unavailable'; unavailableReason = 'producer-disposed'; }
  };
  const detachAbort = (signal: AbortSignal | undefined, callback: () => void) => {
    if (!signal) return () => undefined;
    try { signal.addEventListener('abort', callback, { once: true }); }
    catch { return () => undefined; }
    return () => { try { signal.removeEventListener('abort', callback); } catch { /* trusted signal teardown is best effort */ } };
  };
  const releaseControl = (row: ControlPending, result: NativeBrokerResult) => {
    if (pending !== row) return;
    pending = null; clearTimer(row.timer); row.releaseAbort();
    row.resolve(retired ? fail('NATIVE_PERFORMANCE_RETIRED') : result.ok === true ? success() : fail(result.code));
  };
  const finishRead = (row: ReadPending, code?: NativeBrokerFailureCode) => {
    if (pending !== row) return;
    pending = null; clearTimer(row.timer);
    const waiters = [...row.waiters]; row.waiters.clear();
    for (const waiter of waiters) {
      waiter.releaseAbort();
      waiter.resolve(retired ? fail('NATIVE_PERFORMANCE_RETIRED')
        : !current(waiter.actor) ? fail('NATIVE_PERFORMANCE_AUTHORITY_REVOKED') : code ? fail(code) : success());
    }
  };
  const preemptRead = () => {
    if (pending?.kind !== 'read') return;
    const row = pending; refresh = 'preempted';
    finishRead(row, 'NATIVE_PERFORMANCE_PREEMPTED'); sender?.withdraw(row.id);
  };
  const sendCancel = (row: Cancellation) => {
    if (!wire || !sender || retired || cancellation !== row) return;
    const encoded = wire.encode({ type: 'cancel', controlId: row.controlId, captureId: row.captureId });
    const queueId = nextId('cancel');
    if (!encoded.ok || !queueId) { row.state = 'unknown'; return; }
    const accepted = sender.enqueue({ id: queueId, frame: encoded.text, kind: 'control',
      canDispatch: () => !retired && cancellation === row,
      onComplete: error => { if (error && cancellation === row) row.state = 'unknown'; },
    });
    if (!accepted && cancellation === row) row.state = 'unknown';
    if (accepted && cancellation === row && !retired) row.timer = setTimer(NATIVE_PERFORMANCE_TRANSPORT_LIMITS.cancelMs, () => {
      if (cancellation === row) row.state = 'unknown';
    });
  };
  const revoke = (row: ControlPending, code: NativeBrokerFailureCode) => {
    if (pending !== row) return;
    const unsent = !row.attempted;
    if (!unsent && !cancellation) {
      cancellation = { controlId: row.id, captureId: row.captureId, nativeInstanceId: row.nativeInstanceId,
        owner: identity(row.actor), reconciliationId: null, state: 'pending' };
    }
    const cancel = cancellation;
    releaseControl(row, fail(code));
    if (unsent) sender?.withdraw(row.id);
    if (cancel && !unsent && cancel.controlId === row.id) sendCancel(cancel);
  };
  const matchesProducer = (status: NativePerformanceStatus) => pinnedNativeId !== null
    && status.producer.instanceId === pinnedNativeId && status.producer.pid === pinnedPid;
  const onHost = (message: NativeHostMessage) => {
    if (message.type === 'ready') {
      if (!helloAttempted || message.backendInstanceId !== backendInstanceId
        || (options.expectedHostPid !== undefined && message.status.producer.pid !== options.expectedHostPid)) {
        rejectedMessages = add(rejectedMessages); return;
      }
      if (pinnedNativeId !== null) {
        if (!matchesProducer(message.status)) retire('protocol');
        else rejectedMessages = add(rejectedMessages);
        return;
      }
      pinnedNativeId = message.status.producer.instanceId; pinnedPid = message.status.producer.pid;
      clearTimer(readyTimer); readyTimer = undefined;
      if (retired) return;
      availability = message.status.disposed ? 'unavailable' : 'ready';
      unavailableReason = message.status.disposed ? 'producer-disposed' : null;
      observe(message.status);
      // Fresh clean current-host state ends stale ownership, never an earlier caller's timeout.
      if (clean(message.status)) clearCancellation();
      return;
    }
    if (!matchesProducer(message.type === 'result' ? message.result.status : message.status)) {
      rejectedMessages = add(rejectedMessages); return;
    }
    if (message.type === 'retired') { observe(message.status); retire('disconnect'); return; }
    if (message.type === 'snapshot') {
      const row = pending;
      if (row?.kind !== 'read' || message.controlId !== row.id || !row.attempted) {
        droppedSnapshots = add(droppedSnapshots); return;
      }
      for (const waiter of [...row.waiters]) if (!current(waiter.actor)) {
        row.waiters.delete(waiter); waiter.releaseAbort(); waiter.resolve(fail('NATIVE_PERFORMANCE_AUTHORITY_REVOKED'));
      }
      if (row.waiters.size === 0) {
        droppedSnapshots = add(droppedSnapshots); refresh = 'rejected'; finishRead(row); return;
      }
      observe(message.status);
      cached = { nativeInstanceId: message.status.producer.instanceId, captureId: message.status.captureId,
        snapshot: message.snapshot, receivedAt: clock() };
      refresh = 'ok';
      // New authorized ordered read ACK is recovery evidence, not retroactive control success.
      if (clean(message.status)) clearCancellation();
      finishRead(row);
      return;
    }
    const row = pending;
    if (row && row.kind !== 'read' && row.id === message.controlId && row.captureId === message.captureId && row.attempted) {
      if (row.nativeInstanceId !== message.result.status.producer.instanceId) { rejectedMessages = add(rejectedMessages); return; }
      if (!current(row.actor) || row.signal?.aborted) {
        observe(message.result.status);
        revoke(row, row.signal?.aborted ? 'NATIVE_PERFORMANCE_ABORTED' : 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
        return;
      }
      observe(message.result.status);
      if (row.kind === 'start') {
        if (message.result.ok && message.result.status.collectionActive && !message.result.status.collectionCleanupUnconfirmed
          && message.result.status.captureId === row.captureId && !message.result.status.disposed) {
          lease = { captureId: row.captureId, owner: identity(row.actor) }; history = null;
          releaseControl(row, success());
        } else if (message.result.ok === false) {
          // START_FAILED is the producer's admitted-attempt rollback result. Preserve
          // its proven cleanup actor without granting an operational capture lease.
          if (message.result.code === 'NATIVE_PERFORMANCE_START_FAILED'
            && message.result.status.captureId === row.captureId) {
            history = { captureId: row.captureId, owner: identity(row.actor) };
          }
          releaseControl(row, fail(message.result.code));
        }
        else revoke(row, 'NATIVE_PERFORMANCE_PROTOCOL_ERROR');
      } else if (message.result.ok && message.result.status.captureId === row.captureId && clean(message.result.status)) {
        history = { captureId: row.captureId, owner: identity(row.actor) };
        if (cancellation?.captureId === row.captureId) clearCancellation();
        releaseControl(row, success());
      } else if (message.result.ok === false) releaseControl(row, fail(message.result.code));
      else revoke(row, 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
      return;
    }
    const cancel = cancellation;
    if (cancel && (message.controlId === cancel.controlId || message.controlId === cancel.reconciliationId)
      && message.captureId === cancel.captureId
      && message.result.status.producer.instanceId === cancel.nativeInstanceId) {
      observe(message.result.status);
      if (clean(message.result.status)) clearCancellation();
      return; // Active late start ACK never establishes ownership or resolves a new control.
    }
    lateResults = add(lateResults);
  };
  const onMessage = (raw: unknown) => {
    if (retired || !wire) return;
    const result = wire.receive(raw);
    if (!result.ok) { rejectedMessages = add(rejectedMessages); return; }
    const frame = result.frame;
    if (frame.direction !== 'host-to-backend') { rejectedMessages = add(rejectedMessages); return; }
    switch (frame.type) {
      case 'ready': case 'result': case 'snapshot': case 'retired': onHost(frame); break;
      default: rejectedMessages = add(rejectedMessages);
    }
  };
  function retire(reason: NativeBrokerRetireReason = 'stopped') {
    if (retired) return;
    retired = true; availability = 'retired'; unavailableReason = 'retired'; refresh = 'retired';
    try { releaseMessage?.(); } catch { /* telemetry teardown must not affect application work */ }
    try { releaseDisconnect?.(); } catch { /* same */ }
    wire?.retire(); sender?.retire();
    for (const timer of [...timers]) clearTimer(timer);
    const row = pending;
    if (row?.kind === 'read') finishRead(row, 'NATIVE_PERFORMANCE_RETIRED');
    else if (row) {
      if (row.attempted && !cancellation) cancellation = {
        controlId: row.id, captureId: row.captureId, nativeInstanceId: row.nativeInstanceId,
        owner: identity(row.actor), reconciliationId: null, state: 'unknown',
      };
      releaseControl(row, fail('NATIVE_PERFORMANCE_RETIRED'));
    }
    if (cancellation) cancellation.state = 'unknown';
    lease = null; history = null; invalidateReport(); refresh = 'retired';
    if (!retirementNotified) {
      retirementNotified = true;
      try { onRetire?.(reason); } catch { /* Notification must not interrupt ordinary app lifecycle. */ }
    }
  }
  const authorized = (actor: NativeBrokerActor) => actorShape(actor) && current(actor);
  const knownCapture = (captureId: string) => cancellation?.captureId === captureId ? cancellation
    : lease?.captureId === captureId ? lease : history?.captureId === captureId ? history : null;
  const ownership = (actor: NativeBrokerActor): NativeCaptureOwnership => {
    if (retired || availability !== 'ready' || !authorized(actor)) return 'none';
    const captureId = cancellation?.captureId ?? native?.captureId;
    if (!captureId) return 'none';
    if (actor.kind === 'studio') return 'operator';
    const known = knownCapture(captureId);
    return known && sameOwner(known.owner, actor) ? 'self' : 'other';
  };
  const basicFailure = (request: NativeBrokerReadRequest): NativeBrokerFailureCode | null => {
    if (!request || !authorized(request.actor)) return 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED';
    if (request.signal?.aborted) return 'NATIVE_PERFORMANCE_ABORTED';
    if (retired) return 'NATIVE_PERFORMANCE_RETIRED';
    if (availability !== 'ready' || !native || native.disposed) return 'NATIVE_PERFORMANCE_UNAVAILABLE';
    return null;
  };
  const identityFailure = (request: NativeBrokerIdentityRequest): NativeBrokerFailureCode | null => {
    const code = basicFailure(request); if (code) return code;
    return request.expectedBackendInstanceId !== backendInstanceId || request.expectedNativeInstanceId !== pinnedNativeId
      ? 'NATIVE_PERFORMANCE_IDENTITY_MISMATCH' : null;
  };
  const makeControl = (kind: 'start' | 'stop', request: NativeBrokerStartRequest | NativeBrokerStopRequest,
    captureId: string, collection?: NativeCollectionOptions): Promise<NativeBrokerResult> => new Promise(resolve => {
    const id = nextId('control');
    if (!id || !wire || !sender || !pinnedNativeId) { resolve(fail('NATIVE_PERFORMANCE_UNAVAILABLE')); return; }
    const row: ControlPending = { kind, id, captureId, nativeInstanceId: pinnedNativeId, attempted: false,
      actor: { kind: request.actor.kind, id: request.actor.id, isCurrent: request.actor.isCurrent },
      signal: request.signal, resolve, releaseAbort: () => undefined };
    pending = row;
    if (kind === 'stop' && cancellation) cancellation.reconciliationId = id;
    row.releaseAbort = detachAbort(row.signal, () => revoke(row, 'NATIVE_PERFORMANCE_ABORTED'));
    row.timer = setTimer(NATIVE_PERFORMANCE_TRANSPORT_LIMITS.controlMs, () => revoke(row, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT'));
    if (pending !== row || retired) return;
    const encoded = wire.encode(kind === 'start'
      ? { type: 'start', controlId: id, captureId, options: collection ?? {} }
      : { type: 'stop', controlId: id, captureId, reason: 'requested' });
    if (!encoded.ok) { releaseControl(row, fail('NATIVE_PERFORMANCE_INPUT_INVALID')); return; }
    const accepted = sender.enqueue({ id, frame: encoded.text, kind: 'control',
      canDispatch: () => {
        if (pending !== row || retired) return false;
        const code = row.signal?.aborted ? 'NATIVE_PERFORMANCE_ABORTED'
          : !current(row.actor) ? 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED'
            : row.nativeInstanceId !== pinnedNativeId ? 'NATIVE_PERFORMANCE_IDENTITY_MISMATCH' : null;
        if (code) { revoke(row, code); return false; }
        return true;
      },
      onDispatch: () => { if (pending === row) row.attempted = true; },
      onComplete: error => { if (error && pending === row && !row.attempted) revoke(row, 'NATIVE_PERFORMANCE_UNAVAILABLE'); },
    });
    if (!accepted && pending === row) revoke(row, 'NATIVE_PERFORMANCE_UNAVAILABLE');
  });
  const read = (request: NativeBrokerReadRequest): Promise<NativeBrokerResult> => {
    const error = basicFailure(request); if (error) return Promise.resolve(fail(error));
    if (pending && pending.kind !== 'read') return Promise.resolve(fail('NATIVE_PERFORMANCE_BUSY'));
    let row = pending?.kind === 'read' ? pending : undefined;
    if (row && row.waiters.size >= NATIVE_PERFORMANCE_TRANSPORT_LIMITS.readers) return Promise.resolve(fail('NATIVE_PERFORMANCE_READER_LIMIT'));
    const fresh = !row;
    if (!row) {
      const id = nextId('control'); if (!id) return Promise.resolve(fail('NATIVE_PERFORMANCE_UNAVAILABLE'));
      row = { kind: 'read', id, attempted: false, waiters: new Set() }; pending = row;
    }
    const target = row;
    const result = new Promise<NativeBrokerResult>(resolve => {
      const waiter: ReadWaiter = { actor: { kind: request.actor.kind, id: request.actor.id, isCurrent: request.actor.isCurrent },
        resolve, releaseAbort: () => undefined };
      target.waiters.add(waiter);
      waiter.releaseAbort = detachAbort(request.signal, () => {
        if (!target.waiters.delete(waiter)) return;
        waiter.releaseAbort();
        if (pending === target && target.waiters.size === 0) {
          pending = null; clearTimer(target.timer); sender?.withdraw(target.id); refresh = 'aborted';
        }
        resolve(fail('NATIVE_PERFORMANCE_ABORTED'));
      });
    });
    if (!fresh) return result;
    refresh = 'pending';
    target.timer = setTimer(NATIVE_PERFORMANCE_TRANSPORT_LIMITS.controlMs, () => {
      if (pending !== target) return;
      refresh = 'timeout'; finishRead(target, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT'); sender?.withdraw(target.id);
    });
    if (pending !== target || retired || !wire || !sender) return result;
    const encoded = wire.encode({ type: 'read', controlId: target.id });
    if (!encoded.ok) { refresh = 'rejected'; finishRead(target, 'NATIVE_PERFORMANCE_PROTOCOL_ERROR'); return result; }
    const accepted = sender.enqueue({ id: target.id, frame: encoded.text, kind: 'control',
      canDispatch: () => {
        if (pending !== target || retired) return false;
        for (const waiter of [...target.waiters]) if (!current(waiter.actor)) {
          target.waiters.delete(waiter); waiter.releaseAbort(); waiter.resolve(fail('NATIVE_PERFORMANCE_AUTHORITY_REVOKED'));
        }
        if (target.waiters.size === 0) { refresh = 'rejected'; finishRead(target); return false; }
        return true;
      },
      onDispatch: () => { if (pending === target) target.attempted = true; },
      onComplete: error => {
        if (error && pending === target && !target.attempted) {
          refresh = 'rejected'; finishRead(target, 'NATIVE_PERFORMANCE_UNAVAILABLE');
        }
      },
    });
    if (!accepted && pending === target) { refresh = 'rejected'; finishRead(target, 'NATIVE_PERFORMANCE_UNAVAILABLE'); }
    return result;
  };
  const start = (request: NativeBrokerStartRequest) => {
    const code = identityFailure(request); if (code) return Promise.resolve(fail(code));
    const normalized = normalizeNativeCollectionOptions(request.options);
    if (!normalized.ok) return Promise.resolve(fail('NATIVE_PERFORMANCE_INPUT_INVALID'));
    if (cancellation || native?.collectionCleanupUnconfirmed || orphan()) return Promise.resolve(fail('NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED'));
    if (native?.collectionActive || (pending && pending.kind !== 'read')) return Promise.resolve(fail('NATIVE_PERFORMANCE_BUSY'));
    preemptRead();
    const captureId = nextId('capture'); if (!captureId) return Promise.resolve(fail('NATIVE_PERFORMANCE_UNAVAILABLE'));
    return makeControl('start', request, captureId, normalized.options);
  };
  const stop = (request: NativeBrokerStopRequest) => {
    const code = identityFailure(request); if (code) return Promise.resolve(fail(code));
    if (!isNativeInstanceId(request.captureId)) return Promise.resolve(fail('NATIVE_PERFORMANCE_INPUT_INVALID'));
    if (pending && pending.kind !== 'read') return Promise.resolve(fail('NATIVE_PERFORMANCE_BUSY'));
    const known = knownCapture(request.captureId);
    const isStudio = request.actor.kind === 'studio';
    if (request.captureId !== cancellation?.captureId && request.captureId !== native?.captureId) {
      return Promise.resolve(fail('NATIVE_PERFORMANCE_CAPTURE_MISMATCH'));
    }
    if (!isStudio && (!known || !sameOwner(known.owner, request.actor))) return Promise.resolve(fail('NATIVE_PERFORMANCE_NOT_OWNER'));
    if (cancellation && cancellation.captureId !== request.captureId) return Promise.resolve(fail('NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED'));
    preemptRead();
    return makeControl('stop', request, request.captureId);
  };
  const broker: NativePerformanceBroker = Object.freeze({ status: view, ownership, read, start, stop, retire });
  if (!options.channel || !options.binding) return broker;
  try {
    if (!options.channel.isConnected()) return broker;
    wire = createNativePerformanceWireSession({ binding: options.binding, incomingDirection: 'host-to-backend' });
    sender = createNativePerformanceSendQueue({ channel: options.channel, onFailure: () => retire('send-failed') });
    if (retired) return broker;
    if (sender.status().retired) { retire('send-failed'); return broker; }
    availability = 'waiting'; unavailableReason = 'waiting';
    releaseMessage = options.channel.onMessage(onMessage);
    if (retired) { releaseMessage(); return broker; }
    if (typeof releaseMessage !== 'function') { retire('protocol'); return broker; }
    releaseDisconnect = options.channel.onDisconnect(() => retire('disconnect'));
    if (retired) { releaseDisconnect(); return broker; }
    if (typeof releaseDisconnect !== 'function') { retire('protocol'); return broker; }
    readyTimer = setTimer(NATIVE_PERFORMANCE_TRANSPORT_LIMITS.readyMs, () => {
      if (!retired && availability === 'waiting') { availability = 'unavailable'; unavailableReason = 'ready-timeout'; }
    });
    if (retired) return broker;
    const hello = wire.encode({ type: 'hello', backendInstanceId });
    const id = nextId('control');
    if (!hello.ok || !id || !sender.enqueue({
      id, frame: hello.text, kind: 'control', canDispatch: () => !retired,
      onDispatch: () => { helloAttempted = true; },
    })) retire('protocol');
  } catch {
    unavailableReason = 'contract-invalid'; retire('protocol');
  }
  return broker;
}
