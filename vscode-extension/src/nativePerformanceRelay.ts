import {
  createNativePerformanceSendQueue,
  type NativePerformanceEndpoint,
  type NativePerformanceSendQueue,
  type NativePerformanceSendQueueStatus,
} from '../../shared/nativePerformanceChannel';
import { createNativePerformanceWireSession, type NativeWireBinding } from '../../shared/nativePerformanceProtocol';

export interface NativePerformanceRelayStatus {
  retired: boolean;
  /** Transport dispatch attempts, never remote execution acknowledgements. */
  forwardedHostToBackend: number;
  forwardedBackendToHost: number;
  rejectedFrames: number;
  hostSender: Readonly<NativePerformanceSendQueueStatus>;
  backendSender: Readonly<NativePerformanceSendQueueStatus>;
}
export interface NativePerformanceRelay {
  retire(): void;
  status(): Readonly<NativePerformanceRelayStatus>;
}

/** Relays only this binding's strings. Ordinary lifecycle messages have a separate owner. */
export function createNativePerformanceRelay(options: {
  binding: NativeWireBinding;
  host: NativePerformanceEndpoint;
  backend: NativePerformanceEndpoint;
  /** Once after fencing. The owning adapter propagates a separate lifecycle notice. */
  onRetire?(): void;
}): NativePerformanceRelay {
  const host = options.host, backend = options.backend;
  const onRetire = options.onRetire;
  let retirementNotified = false;
  const fromHost = createNativePerformanceWireSession({ binding: options.binding, incomingDirection: 'host-to-backend' });
  const fromBackend = createNativePerformanceWireSession({ binding: options.binding, incomingDirection: 'backend-to-host' });
  let retired = false, forwardedHostToBackend = 0, forwardedBackendToHost = 0, rejectedFrames = 0;
  let hostSender: NativePerformanceSendQueue | undefined, backendSender: NativePerformanceSendQueue | undefined;
  const subscriptions: Array<() => void> = [];
  const increment = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, value + 1);

  function retire() {
    if (retired) return;
    retired = true;
    fromHost.retire();
    fromBackend.retire();
    hostSender?.retire();
    backendSender?.retire();
    for (const removeListener of subscriptions.splice(0)) {
      try { removeListener(); } catch { /* Native retirement must not escape into app lifecycle. */ }
    }
    if (!retirementNotified) {
      retirementNotified = true;
      try { onRetire?.(); } catch { /* Ordinary shutdown cannot depend on a telemetry notification. */ }
    }
  }
  hostSender = createNativePerformanceSendQueue({ channel: host, onFailure: retire });
  if (retired) hostSender.retire();
  backendSender = createNativePerformanceSendQueue({ channel: backend, onFailure: retire });
  if (retired) backendSender.retire();

  function receive(raw: unknown, origin: 'host' | 'backend') {
    // Parent-loss objects and all other ordinary messages remain untouched and unclaimed.
    if (retired || typeof raw !== 'string') return;
    const session = origin === 'host' ? fromHost : fromBackend;
    const decoded = session.receive(raw);
    if (decoded.ok === false) { rejectedFrames = increment(rejectedFrames); return; }
    const sender = origin === 'host' ? backendSender : hostSender;
    const accepted = sender?.enqueue({
      id: `${origin}_${decoded.frame.sequence}`,
      frame: raw,
      kind: decoded.frame.type === 'snapshot' ? 'snapshot' : 'control',
      canDispatch: () => !retired,
      onDispatch: () => {
        if (origin === 'host') forwardedHostToBackend = increment(forwardedHostToBackend);
        else forwardedBackendToHost = increment(forwardedBackendToHost);
      },
    });
    if (!accepted) rejectedFrames = increment(rejectedFrames);
  }
  function subscribe(channel: NativePerformanceEndpoint, origin: 'host' | 'backend') {
    if (retired) return;
    try {
      const removeListener = channel.onMessage(raw => receive(raw, origin));
      if (typeof removeListener !== 'function') { retire(); return; }
      if (retired) { try { removeListener(); } catch { /* Already retired. */ } }
      else subscriptions.push(removeListener);
    } catch { retire(); }
  }
  subscribe(host, 'host');
  subscribe(backend, 'backend');
  // Both queues are initialized before either message receiver is installed.
  const outgoingHost = hostSender, outgoingBackend = backendSender;
  return {
    retire,
    status: () => Object.freeze({
      retired, forwardedHostToBackend, forwardedBackendToHost, rejectedFrames,
      hostSender: outgoingHost.status(), backendSender: outgoingBackend.status(),
    }),
  };
}
