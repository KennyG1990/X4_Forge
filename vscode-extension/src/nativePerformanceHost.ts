import type { ForgePerformanceOutcome } from '../../shared/forgePerformance';
import {
  createNativePerformanceSendQueue,
  NATIVE_PERFORMANCE_TRANSPORT_LIMITS,
  type NativePerformanceEndpoint,
  type NativePerformanceSendQueue,
} from '../../shared/nativePerformanceChannel';
import {
  createNativePerformanceWireSession,
  isNativeControlResult,
  isNativePerformanceStatus,
  type NativeCaptureKey,
  type NativeControlFailureCode,
  type NativeControlResult,
  type NativeHostMessage,
  type NativeOperationId,
  type NativePerformanceStatus,
  type NativePerformanceWireSession,
  type NativeStopReason,
  type NativeWireBinding,
} from '../../shared/nativePerformanceProtocol';
import type { NativePerformanceProducer } from './nativePerformance';

export const NATIVE_PERFORMANCE_HOST_LIMITS = NATIVE_PERFORMANCE_TRANSPORT_LIMITS;
export interface NativePerformanceHostBridge { retire(reason: string): void }
export interface NativePerformanceHostAttachOptions {
  binding: NativeWireBinding;
  channel: NativePerformanceEndpoint;
  /** The adapter establishes ownership from the exact actual child handle. */
  isCurrent(): boolean;
}
export interface NativePerformanceHost {
  attach(options: NativePerformanceHostAttachOptions): NativePerformanceHostBridge;
  beginOperation(id: NativeOperationId): (outcome?: ForgePerformanceOutcome) => void;
  dispose(): NativeControlResult;
}
interface CaptureRecord {
  key: Readonly<NativeCaptureKey>;
  startControlId: string;
  latestStopControlId?: string;
}
interface BridgeState {
  epoch: string;
  channel: NativePerformanceEndpoint;
  isCurrent: () => boolean;
  wire: NativePerformanceWireSession;
  retired: boolean;
  backendInstanceId?: string;
  sender?: NativePerformanceSendQueue;
  unsubscribe: Array<() => void>;
}
const inactiveClean = (status: NativePerformanceStatus) => !status.collectionActive
  && !status.collectionCleanupUnconfirmed && status.ownedTimerCount === 0
  && status.failedTimerCount === 0 && !status.eventLoopDelayMonitoring;
const ignore = () => undefined;

/** One activation owns the producer; replacing its child never replaces cleanup authority. */
export function createNativePerformanceHost(options: { producer: NativePerformanceProducer }): NativePerformanceHost {
  const producer = options.producer;
  let disposed = false;
  let current: BridgeState | undefined;
  let lastCapture: CaptureRecord | undefined;
  let retirementUnconfirmed = false;

  const publicStatus = (): NativePerformanceStatus => {
    const value = producer.status();
    if (!isNativePerformanceStatus(value)) throw new TypeError('NATIVE_HOST_STATUS_INVALID');
    return retirementUnconfirmed && !value.collectionCleanupUnconfirmed
      ? Object.freeze({ ...value, collectionCleanupUnconfirmed: true }) : value;
  };
  const isCurrent = (state: BridgeState) => {
    try {
      return !disposed && !state.retired && current === state
        && state.isCurrent() === true && state.channel.isConnected() === true;
    } catch { return false; }
  };
  const stopExact = (record: CaptureRecord, reason: NativeStopReason): NativeControlResult => {
    try {
      const value = producer.stopCollection(record.key, reason);
      if (!isNativeControlResult(value)) throw new TypeError('NATIVE_HOST_RESULT_INVALID');
      retirementUnconfirmed = value.status.captureId !== record.key.captureId || !inactiveClean(value.status);
      return value;
    } catch {
      retirementUnconfirmed = true;
      return Object.freeze({ ok: false as const, code: 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED' as const, status: publicStatus() });
    }
  };
  const retire = (state: BridgeState) => {
    if (state.retired) return;
    state.retired = true;
    state.wire.retire();
    state.sender?.retire();
    for (const remove of state.unsubscribe.splice(0)) {
      try { remove(); } catch { /* Never remove another owner's listener. */ }
    }
    if (current !== state) return;
    current = undefined;
    if (lastCapture) {
      try { if (retirementUnconfirmed || !inactiveClean(publicStatus())) stopExact(lastCapture, 'retired'); }
      catch { retirementUnconfirmed = true; }
    }
  };

  const attach = (input: NativePerformanceHostAttachOptions): NativePerformanceHostBridge => {
    if (disposed) return Object.freeze({ retire: ignore });
    const channel = input.channel;
    const ownerIsCurrent = input.isCurrent;
    const fields = Object.getOwnPropertyDescriptors(input.binding);
    const nonce = fields.nonce?.value;
    const epoch = fields.epoch?.value;
    if (typeof nonce !== 'string' || typeof epoch !== 'string') return Object.freeze({ retire: ignore });
    const binding = Object.freeze({ nonce, epoch });
    const wire = createNativePerformanceWireSession({ binding, incomingDirection: 'backend-to-host' });
    try {
      if (ownerIsCurrent() !== true || channel.isConnected() !== true) {
        wire.retire(); return Object.freeze({ retire: ignore });
      }
    } catch { wire.retire(); return Object.freeze({ retire: ignore }); }
    if (current) retire(current);
    const state: BridgeState = {
      epoch: binding.epoch, channel, isCurrent: ownerIsCurrent, wire,
      retired: false, unsubscribe: [],
    };
    current = state;
    const bridge: NativePerformanceHostBridge = Object.freeze({ retire() { retire(state); } });
    state.sender = createNativePerformanceSendQueue({ channel, onFailure: () => retire(state) });
    if (state.retired) { state.sender.retire(); return bridge; }

    const send = (message: NativeHostMessage) => {
      if (!isCurrent(state)) { retire(state); return; }
      const encoded = state.wire.encode(message);
      if (!encoded.ok) { retire(state); return; }
      const accepted = state.sender?.enqueue({
        id: `native_host_reply_${state.wire.status().lastSentSequence}`,
        frame: encoded.text,
        kind: message.type === 'snapshot' ? 'snapshot' : 'control',
        canDispatch: () => isCurrent(state),
        onComplete: () => { if (!state.retired && current === state && !isCurrent(state)) retire(state); },
      });
      if (!accepted) retire(state);
    };
    const failure = (controlId: string, captureId: string, code: NativeControlFailureCode) => send({
      type: 'result', controlId, captureId,
      result: { ok: false, code, status: publicStatus() },
    });
    const receive = (raw: unknown) => {
      if (!isCurrent(state)) { retire(state); return; }
      const decoded = state.wire.receive(raw);
      if (!decoded.ok) return;
      const message = decoded.frame;
      try {
        if (message.type === 'hello') {
          if (state.backendInstanceId !== undefined && state.backendInstanceId !== message.backendInstanceId) return;
          if (state.backendInstanceId === undefined) {
            state.backendInstanceId = message.backendInstanceId;
            // Retry this activation's exact old key once for the new binding, never a synthesized epoch.
            if (lastCapture && (retirementUnconfirmed || !inactiveClean(publicStatus()))) stopExact(lastCapture, 'retired');
          }
          send({ type: 'ready', backendInstanceId: state.backendInstanceId, status: publicStatus() });
          return;
        }
        if (state.backendInstanceId === undefined) return;
        if (message.type === 'read') {
          send({ type: 'snapshot', controlId: message.controlId, status: publicStatus(), snapshot: producer.snapshot() });
        } else if (message.type === 'start') {
          const before = publicStatus();
          if (retirementUnconfirmed || before.collectionCleanupUnconfirmed) {
            failure(message.controlId, message.captureId, 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED'); return;
          }
          if (before.collectionActive) {
            failure(message.controlId, message.captureId, 'NATIVE_PERFORMANCE_BUSY'); return;
          }
          if (before.disposed) {
            failure(message.controlId, message.captureId, 'NATIVE_PERFORMANCE_DISPOSED'); return;
          }
          const key = Object.freeze({ epoch: state.epoch, captureId: message.captureId });
          const preceding = lastCapture;
          lastCapture = { key, startControlId: message.controlId };
          const result = producer.startCollection(key, message.options);
          if (!isNativeControlResult(result)) throw new TypeError('NATIVE_HOST_RESULT_INVALID');
          if (result.ok === false && result.code !== 'NATIVE_PERFORMANCE_START_FAILED') lastCapture = preceding;
          send({ type: 'result', controlId: message.controlId, captureId: message.captureId, result });
        } else if (message.type === 'stop' || message.type === 'cancel') {
          const selected = lastCapture;
          if (!selected || selected.key.captureId !== message.captureId
            || message.type === 'cancel' && message.controlId !== selected.startControlId
              && message.controlId !== selected.latestStopControlId) {
            failure(message.controlId, message.captureId, 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH'); return;
          }
          if (message.type === 'stop') selected.latestStopControlId = message.controlId;
          const result = stopExact(selected, message.type === 'cancel' ? 'cancelled' : message.reason);
          send({ type: 'result', controlId: message.controlId, captureId: message.captureId, result });
        }
      } catch { retire(state); }
    };
    const subscribe = (register: () => (() => void)) => {
      try {
        const remove = register();
        if (typeof remove !== 'function') throw new TypeError('NATIVE_HOST_SUBSCRIPTION_INVALID');
        if (state.retired) { try { remove(); } catch { /* Already retired. */ } }
        else state.unsubscribe.push(remove);
      } catch { retire(state); }
    };
    subscribe(() => channel.onMessage(receive));
    if (!state.retired) subscribe(() => channel.onDisconnect(() => retire(state)));
    return bridge;
  };

  return {
    attach,
    beginOperation(id) {
      if (disposed || !current) return ignore;
      if (!isCurrent(current)) { retire(current); return ignore; }
      try {
        const finish = producer.beginOperation(id);
        return (outcome?: ForgePerformanceOutcome) => { if (!disposed) { try { finish(outcome); } catch { /* Diagnostic only. */ } } };
      } catch { return ignore; }
    },
    dispose() {
      if (current) retire(current);
      disposed = true;
      const value = producer.dispose();
      if (!isNativeControlResult(value)) throw new TypeError('NATIVE_HOST_RESULT_INVALID');
      retirementUnconfirmed = !inactiveClean(value.status);
      return value;
    },
  };
}
