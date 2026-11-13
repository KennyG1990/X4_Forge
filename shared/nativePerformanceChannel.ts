import { NATIVE_PERFORMANCE_LIMITS, isNativeInstanceId, type NativeWireBinding } from './nativePerformanceProtocol';

export type NativePerformanceRetirementNotice = Readonly<{
  type: 'x4forge-native-leg-retired'; nonce: string; epoch: string;
}>;
const validRetirementBinding = (binding: NativeWireBinding) => !!binding
  && typeof binding.nonce === 'string' && /^[a-f0-9]{32,128}$/i.test(binding.nonce)
  && isNativeInstanceId(binding.epoch);

/** One bounded ordinary-lifecycle notice, separate from telemetry frames and ACKs. */
export function createNativePerformanceRetirementNotice(binding: NativeWireBinding): NativePerformanceRetirementNotice {
  if (!validRetirementBinding(binding)) throw new TypeError('NATIVE_RETIREMENT_BINDING_INVALID');
  return Object.freeze({ type: 'x4forge-native-leg-retired', nonce: binding.nonce, epoch: binding.epoch });
}

export function isNativePerformanceRetirementNotice(raw: unknown, binding: NativeWireBinding): raw is NativePerformanceRetirementNotice {
  try {
    if (!validRetirementBinding(binding) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const keys = Reflect.ownKeys(raw);
    if (keys.length !== 3 || !keys.every(key => key === 'type' || key === 'nonce' || key === 'epoch')) return false;
    const fields = Object.getOwnPropertyDescriptors(raw);
    for (const key of ['type', 'nonce', 'epoch']) {
      const field = fields[key];
      if (!field || !field.enumerable || !Object.prototype.hasOwnProperty.call(field, 'value')) return false;
    }
    return fields.type.value === 'x4forge-native-leg-retired'
      && fields.nonce.value === binding.nonce && fields.epoch.value === binding.epoch;
  } catch { return false; }
}

/** A private, already-owned transport. A send callback is not a remote execution ACK. */
export interface NativePerformanceEndpoint {
  isConnected(): boolean;
  send(frame: string, callback: (error: Error | null) => void): boolean;
  onMessage(listener: (raw: unknown) => void): () => void;
  onDisconnect(listener: () => void): () => void;
}

export const NATIVE_PERFORMANCE_TRANSPORT_LIMITS = Object.freeze({
  readyMs: 5000,
  controlMs: 5000,
  cancelMs: 5000,
  readers: 16,
  queuedControls: 2,
  queuedSnapshot: 1,
  inFlight: 1,
});

export type NativePerformanceSendKind = 'control' | 'snapshot';
export interface NativePerformanceSendItem {
  id: string;
  frame: string;
  kind: NativePerformanceSendKind;
  canDispatch?: () => boolean;
  onDispatch?: () => void;
  onComplete?: (error: Error | null) => void;
}
export interface NativePerformanceSendQueueStatus {
  retired: boolean;
  inFlight: 0 | 1;
  queuedControls: number;
  queuedSnapshot: 0 | 1;
  accepted: number;
  dispatched: number;
  completed: number;
  rejected: number;
  withdrawn: number;
  droppedSnapshots: number;
  backpressure: number;
  failures: number;
}
export interface NativePerformanceSendQueue {
  enqueue(item: NativePerformanceSendItem): boolean;
  withdraw(id: string): boolean;
  retire(): void;
  status(): Readonly<NativePerformanceSendQueueStatus>;
}

interface PendingSend { item: NativePerformanceSendItem; completed: boolean }
const increment = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, value + 1);
const transportError = (code: string) => new Error(code);

function boundedFrame(frame: string, kind: NativePerformanceSendKind): boolean {
  const limit = kind === 'snapshot' ? NATIVE_PERFORMANCE_LIMITS.maxFrameBytes : NATIVE_PERFORMANCE_LIMITS.maxControlBytes;
  if (!frame.length || frame.length > limit) return false;
  let bytes = 0;
  for (const character of frame) {
    const point = character.codePointAt(0);
    bytes += point === undefined || point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > limit) return false;
  }
  return true;
}

/** One physical send at a time; false means possibly queued and is never retried. */
export function createNativePerformanceSendQueue(options: {
  channel: NativePerformanceEndpoint;
  onFailure?: (error: Error) => void;
}): NativePerformanceSendQueue {
  const channel = options.channel;
  const onFailure = options.onFailure;
  let retired = false, pumping = false, failureNotified = false;
  let inFlight: PendingSend | undefined, snapshot: PendingSend | undefined;
  const controls: PendingSend[] = [];
  let unsubscribe: (() => void) | undefined;
  let accepted = 0, dispatched = 0, completed = 0, rejected = 0, withdrawn = 0;
  let droppedSnapshots = 0, backpressure = 0, failures = 0;

  function notifyFailure(error: Error) {
    if (failureNotified) return;
    failureNotified = true;
    try { onFailure?.(error); } catch { /* Consumer failure cannot escape the transport owner. */ }
  }
  function finish(pending: PendingSend, error: Error | null) {
    if (pending.completed) return;
    pending.completed = true;
    completed = increment(completed);
    if (inFlight === pending) inFlight = undefined;
    try { pending.item.onComplete?.(error); }
    catch { fail('NATIVE_SEND_COMPLETION_FAILED'); }
  }
  function retire() {
    if (retired) return;
    retired = true;
    const active = inFlight;
    const queued = controls.splice(0);
    const oldSnapshot = snapshot;
    inFlight = undefined;
    snapshot = undefined;
    const removeListener = unsubscribe;
    unsubscribe = undefined;
    try { removeListener?.(); } catch { /* Retirement remains terminal. */ }
    const error = transportError('NATIVE_SEND_RETIRED');
    if (active) finish(active, error);
    for (const pending of queued) finish(pending, error);
    if (oldSnapshot) finish(oldSnapshot, error);
  }
  function fail(code: string) {
    if (retired) return;
    failures = increment(failures);
    retire();
    notifyFailure(transportError(code));
  }
  function pump() {
    if (pumping || retired) return;
    pumping = true;
    try {
      while (!retired && !inFlight) {
        const pending = controls.shift() ?? snapshot;
        if (!pending) break;
        if (snapshot === pending) snapshot = undefined;
        inFlight = pending;
        try {
          const send = channel.send;
          if (!channel.isConnected()) { fail('NATIVE_SEND_DISCONNECTED'); break; }
          if (retired) break;
          let current = true;
          try { if (pending.item.canDispatch) current = pending.item.canDispatch() === true; }
          catch { current = false; }
          if (retired) break;
          if (!current) {
            finish(pending, transportError('NATIVE_SEND_NOT_CURRENT'));
            continue;
          }
          pending.item.onDispatch?.();
          if (retired) break;
          dispatched = increment(dispatched);
          const writable = send.call(channel, pending.item.frame, error => {
            if (retired || pending.completed || inFlight !== pending) return;
            if (error !== null) { fail('NATIVE_SEND_FAILED'); return; }
            finish(pending, null);
            pump();
          });
          if (writable === false) backpressure = increment(backpressure);
          else if (writable !== true) fail('NATIVE_SEND_RESULT_INVALID');
        } catch { fail('NATIVE_SEND_FAILED'); }
      }
    } finally { pumping = false; }
  }
  function enqueue(input: NativePerformanceSendItem): boolean {
    let item: NativePerformanceSendItem;
    try {
      // Copy once so queued authority/callback/frame fields cannot be replaced by the caller.
      const { id, frame, kind, canDispatch, onDispatch, onComplete } = input;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)
        || typeof frame !== 'string' || (kind !== 'control' && kind !== 'snapshot')
        || !boundedFrame(frame, kind)
        || (canDispatch !== undefined && typeof canDispatch !== 'function')
        || (onDispatch !== undefined && typeof onDispatch !== 'function')
        || (onComplete !== undefined && typeof onComplete !== 'function')) {
        rejected = increment(rejected); return false;
      }
      item = { id, frame, kind, canDispatch, onDispatch, onComplete };
    } catch { rejected = increment(rejected); return false; }
    if (retired || inFlight?.item.id === item.id || controls.some(pending => pending.item.id === item.id)
      || snapshot?.item.id === item.id || (item.kind === 'control' && controls.length >= NATIVE_PERFORMANCE_TRANSPORT_LIMITS.queuedControls)) {
      rejected = increment(rejected); return false;
    }
    const pending = { item, completed: false };
    const previousSnapshot = snapshot;
    if (item.kind === 'control') {
      controls.push(pending);
      snapshot = undefined;
    } else snapshot = pending;
    accepted = increment(accepted);
    if (previousSnapshot) {
      droppedSnapshots = increment(droppedSnapshots);
      finish(previousSnapshot, transportError('NATIVE_SEND_REPLACED'));
    }
    pump();
    return true;
  }
  function withdraw(id: string): boolean {
    const index = controls.findIndex(pending => pending.item.id === id);
    const pending = index >= 0 ? controls.splice(index, 1)[0] : snapshot?.item.id === id ? snapshot : undefined;
    if (!pending) return false;
    if (snapshot === pending) snapshot = undefined;
    withdrawn = increment(withdrawn);
    finish(pending, transportError('NATIVE_SEND_WITHDRAWN'));
    pump();
    return true;
  }
  try {
    const removeListener = channel.onDisconnect(() => fail('NATIVE_SEND_DISCONNECTED'));
    if (typeof removeListener !== 'function') fail('NATIVE_SEND_SUBSCRIPTION_FAILED');
    else if (retired) { try { removeListener(); } catch { /* Already terminal. */ } }
    else unsubscribe = removeListener;
  } catch { fail('NATIVE_SEND_SUBSCRIPTION_FAILED'); }
  return {
    enqueue, withdraw, retire,
    status: () => Object.freeze({
      retired, inFlight: inFlight ? 1 : 0, queuedControls: controls.length, queuedSnapshot: snapshot ? 1 : 0,
      accepted, dispatched, completed, rejected, withdrawn, droppedSnapshots, backpressure, failures,
    }),
  };
}
