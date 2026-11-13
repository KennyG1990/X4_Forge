import assert from 'node:assert/strict';
import { createForgePerformanceCollector } from '../../shared/forgePerformance';
import { type NativePerformanceEndpoint } from '../../shared/nativePerformanceChannel';
import {
  NATIVE_PERFORMANCE_LIMITS, NATIVE_PERFORMANCE_WIRE_SCHEMA, encodeNativePerformanceFrame,
  type NativePerformanceMessage, type NativePerformanceStatus, type NativeWireDirection,
} from '../../shared/nativePerformanceProtocol';
import { createNativePerformanceRelay } from './nativePerformanceRelay';

const binding = Object.freeze({ nonce: 'private_relay_nonce_01', epoch: 'epoch_relay_01' });
function status(): NativePerformanceStatus {
  return {
    schemaVersion: 'forge.native-performance.status.v1',
    producer: { component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: 'instance_relay_01' },
    disposed: false, collectionActive: false, captureId: null, collectionStartedAtUnixMs: null,
    collectionExpiresAtUnixMs: null, intervalMs: 2000, eventLoopDelayMonitoring: false,
    resourceSamples: 0, resourceErrors: 0, throttledSamples: 0, counterResets: 0, sampleOverheadMs: 0,
    lastResourceError: null, collectionStopDelayMs: null, collectionCleanupUnconfirmed: false,
    ownedTimerCount: 0, failedTimerCount: 0, lastStopReason: null,
  };
}
function frame(message: NativePerformanceMessage, direction: NativeWireDirection, sequence = 1): string {
  const encoded = encodeNativePerformanceFrame({ ...message, schemaVersion: NATIVE_PERFORMANCE_WIRE_SCHEMA, ...binding, direction, sequence });
  if (encoded.ok === false) throw new Error('RELAY_FIXTURE_INVALID');
  return encoded.text;
}
const hello = (sequence = 1) => frame({ type: 'hello', backendInstanceId: 'backend_relay_01' }, 'backend-to-host', sequence);
const read = (sequence: number) => frame({ type: 'read', controlId: `read_relay_${sequence}` }, 'backend-to-host', sequence);
const ready = (sequence = 1) => frame({ type: 'ready', backendInstanceId: 'backend_relay_01', status: status() }, 'host-to-backend', sequence);
function snapshot(sequence: number) {
  const collector = createForgePerformanceCollector({ component: 'extension-host', scope: 'shared-process', pid: 42,
    instanceId: 'instance_relay_01', enabled: false, now: () => 0, wallNow: () => 1000 });
  return frame({ type: 'snapshot', controlId: null, status: status(), snapshot: collector.snapshot() }, 'host-to-backend', sequence);
}
function endpoint() {
  const messages = new Set<(raw: unknown) => void>(), disconnects = new Set<() => void>();
  const sent: string[] = [], callbacks: Array<(error: Error | null) => void> = [];
  const state = { connected: true, writable: true, synchronous: false };
  const channel: NativePerformanceEndpoint = {
    isConnected: () => state.connected,
    send(text, callback) { sent.push(text); callbacks.push(callback); if (state.synchronous) callback(null); return state.writable; },
    onMessage(listener) { messages.add(listener); return () => { messages.delete(listener); }; },
    onDisconnect(listener) { disconnects.add(listener); return () => { disconnects.delete(listener); }; },
  };
  return {
    channel, state, messages, disconnects, sent, callbacks,
    emit(raw: unknown) { for (const listener of [...messages]) listener(raw); },
    disconnect() { state.connected = false; for (const listener of [...disconnects]) listener(); },
    complete(index = 0, error: Error | null = null) { callbacks[index](error); },
  };
}
function pair(onRetire?: () => void) {
  const host = endpoint(), backend = endpoint();
  const options = { binding, host: host.channel, backend: backend.channel, onRetire };
  const relay = createNativePerformanceRelay(options);
  return { host, backend, relay };
}

export function runNativePerformanceRelaySelftest() {
  const checks: Array<{ name: string; pass: boolean }> = [];
  const check = (name: string, run: () => void) => {
    try { run(); checks.push({ name, pass: true }); } catch { checks.push({ name, pass: false }); }
  };
  check('backend frame forwards its original encoded whitespace and bytes', () => {
    const p = pair(), raw = ` \n${hello()}\t`; p.backend.emit(raw);
    assert.deepEqual(p.host.sent, [raw]); assert.deepEqual(p.backend.sent, []); assert.equal(p.relay.status().forwardedBackendToHost, 1); p.relay.retire();
  });
  check('host frame forwards original bytes in the reverse direction', () => {
    const p = pair(), raw = ready(); p.host.emit(raw);
    assert.deepEqual(p.backend.sent, [raw]); assert.deepEqual(p.host.sent, []); assert.equal(p.relay.status().forwardedHostToBackend, 1); p.relay.retire();
  });
  check('relay emits no synthetic ready result or acknowledgement', () => {
    const p = pair(); assert.deepEqual(p.host.sent, []); assert.deepEqual(p.backend.sent, []);
    p.backend.emit(read(1)); assert.equal(p.host.sent.length, 1); p.host.complete();
    assert.deepEqual(p.backend.sent, []); assert.equal(p.relay.status().retired, false); p.relay.retire();
  });
  check('wrong nonce is dropped without consuming a valid later sequence', () => {
    const p = pair(), raw = hello(); p.backend.emit(raw.replace(binding.nonce, 'different_relay_nonce'));
    assert.deepEqual(p.host.sent, []); p.backend.emit(raw); assert.deepEqual(p.host.sent, [raw]); assert.equal(p.relay.status().rejectedFrames, 1); p.relay.retire();
  });
  check('wrong epoch is rejected without changing the current binding', () => {
    const p = pair(); p.host.emit(ready().replace(binding.epoch, 'epoch_different_01'));
    assert.deepEqual(p.backend.sent, []); p.host.emit(ready()); assert.equal(p.backend.sent.length, 1); assert.equal(p.relay.status().rejectedFrames, 1); p.relay.retire();
  });
  check('valid frame from the wrong endpoint direction is rejected', () => {
    const p = pair(); p.host.emit(hello()); p.backend.emit(ready());
    assert.deepEqual(p.host.sent, []); assert.deepEqual(p.backend.sent, []); assert.equal(p.relay.status().rejectedFrames, 2); p.relay.retire();
  });
  check('wrong schema version is rejected while the relay remains usable', () => {
    const p = pair(); p.backend.emit(hello().replace(NATIVE_PERFORMANCE_WIRE_SCHEMA, 'forge.native-performance.wire.v2'));
    assert.equal(p.relay.status().retired, false); assert.equal(p.relay.status().rejectedFrames, 1);
    p.backend.emit(hello()); assert.equal(p.host.sent.length, 1); p.relay.retire();
  });
  check('malformed and unknown message strings are dropped without a generated reply', () => {
    const p = pair(); for (const raw of ['{', 'null', '[]', '{}', hello().replace('"hello"', '"unrecognized"')]) p.backend.emit(raw);
    assert.equal(p.relay.status().rejectedFrames, 5); assert.deepEqual(p.host.sent, []); assert.deepEqual(p.backend.sent, []); p.relay.retire();
  });
  check('oversized ASCII frame is rejected before forwarding', () => {
    const p = pair(); p.backend.emit('a'.repeat(NATIVE_PERFORMANCE_LIMITS.maxFrameBytes + 1));
    assert.equal(p.relay.status().rejectedFrames, 1); assert.deepEqual(p.host.sent, []); p.relay.retire();
  });
  check('oversized UTF8 control string cannot exploit its smaller character count', () => {
    const p = pair(); p.backend.emit('😀'.repeat(NATIVE_PERFORMANCE_LIMITS.maxFrameBytes / 4 + 1));
    assert.equal(p.relay.status().rejectedFrames, 1); assert.deepEqual(p.host.sent, []); p.relay.retire();
  });
  check('ordinary parent-lost objects remain untouched and do not retire telemetry', () => {
    const p = pair(); let reads = 0;
    const parentLost = Object.freeze(Object.defineProperty({}, 'type', { get() { reads++; throw new Error('PRIVATE_PARENT_OBJECT'); } }));
    p.host.emit(parentLost); p.backend.emit(parentLost); p.host.emit(null); p.backend.emit(42);
    assert.equal(reads, 0); assert.equal(p.relay.status().retired, false); assert.equal(p.relay.status().rejectedFrames, 0);
    assert.deepEqual(p.host.sent, []); assert.deepEqual(p.backend.sent, []); p.relay.retire();
  });
  check('replayed valid frame is not forwarded twice', () => {
    const p = pair(), raw = hello(); p.backend.emit(raw); p.host.complete(); p.backend.emit(raw);
    assert.deepEqual(p.host.sent, [raw]); assert.equal(p.relay.status().rejectedFrames, 1); p.relay.retire();
  });
  check('monotonic gaps are accepted and a lower later sequence is rejected', () => {
    const p = pair(); p.backend.emit(hello(3)); p.host.complete(); p.backend.emit(read(5)); p.host.complete(1); p.backend.emit(read(4));
    assert.deepEqual(p.host.sent, [hello(3), read(5)]); assert.equal(p.relay.status().rejectedFrames, 1); p.relay.retire();
  });
  check('host and backend sequences are independent sessions', () => {
    const p = pair(); p.backend.emit(hello()); p.host.emit(ready());
    assert.deepEqual(p.host.sent, [hello()]); assert.deepEqual(p.backend.sent, [ready()]); assert.equal(p.relay.status().rejectedFrames, 0); p.relay.retire();
  });
  check('control queue overflows at exactly two queued frames without an ACK', () => {
    const p = pair(); p.backend.emit(hello()); p.backend.emit(read(2)); p.backend.emit(read(3)); p.backend.emit(read(4));
    assert.equal(p.relay.status().hostSender.queuedControls, 2); assert.equal(p.relay.status().rejectedFrames, 1);
    p.host.complete(0); p.host.complete(1); p.host.complete(2);
    assert.deepEqual(p.host.sent, [hello(), read(2), read(3)]); assert.deepEqual(p.backend.sent, []); p.relay.retire();
  });
  check('later control drops older queued snapshot to preserve wire order', () => {
    const p = pair(); const first = snapshot(1), dropped = snapshot(2), control = ready(3), latest = snapshot(4);
    p.host.emit(first); p.host.emit(dropped); p.host.emit(control); p.host.emit(latest);
    p.backend.complete(0); p.backend.complete(1);
    assert.deepEqual(p.backend.sent, [first, control, latest]); assert.equal(p.relay.status().backendSender.droppedSnapshots, 1); p.relay.retire();
  });
  check('queued snapshots replace each other without exceeding one slot', () => {
    const p = pair(), first = snapshot(1), latest = snapshot(3);
    p.host.emit(first); p.host.emit(snapshot(2)); p.host.emit(latest);
    assert.equal(p.relay.status().backendSender.queuedSnapshot, 1); assert.equal(p.relay.status().backendSender.droppedSnapshots, 1);
    p.backend.complete(); assert.deepEqual(p.backend.sent, [first, latest]); p.relay.retire();
  });
  check('host disconnect retires only telemetry and removes all listeners', () => {
    const p = pair(); p.backend.emit(hello()); p.host.disconnect();
    assert.equal(p.relay.status().retired, true); assert.equal(p.host.messages.size + p.backend.messages.size, 0);
    assert.equal(p.host.disconnects.size + p.backend.disconnects.size, 0); assert.deepEqual(p.backend.sent, []);
  });
  check('backend disconnect retires both sender queues with no host command', () => {
    const p = pair(); p.host.emit(ready()); p.backend.disconnect();
    assert.equal(p.relay.status().retired, true); assert.equal(p.relay.status().hostSender.retired, true);
    assert.equal(p.relay.status().backendSender.retired, true); assert.deepEqual(p.host.sent, []);
  });
  check('send callback failure retires telemetry without forwarding private errors', () => {
    const p = pair(); p.backend.emit(hello()); p.backend.emit(read(2)); p.host.complete(0, new Error('PRIVATE_RELAY_SEND_FAILURE'));
    assert.equal(p.relay.status().retired, true); assert.deepEqual(p.host.sent, [hello()]); assert.deepEqual(p.backend.sent, []);
    assert.equal(JSON.stringify(p.relay.status()).includes('PRIVATE_'), false);
  });
  check('false send is never retransmitted while its callback is pending', () => {
    const p = pair(); p.host.state.writable = false; p.backend.emit(hello()); p.backend.emit(read(2));
    assert.deepEqual(p.host.sent, [hello()]); assert.equal(p.relay.status().hostSender.backpressure, 1);
    p.host.complete(); assert.deepEqual(p.host.sent, [hello(), read(2)]); assert.equal(p.relay.status().hostSender.backpressure, 2); p.relay.retire();
  });
  check('synchronous transport callbacks preserve exact bytes and forward once', () => {
    const p = pair(); p.host.state.synchronous = true;
    p.backend.emit(hello()); p.backend.emit(read(2)); p.backend.emit(read(3));
    assert.deepEqual(p.host.sent, [hello(), read(2), read(3)]); assert.equal(p.relay.status().hostSender.completed, 3); p.relay.retire();
  });
  check('saved old message listeners become inert after relay retirement', () => {
    const p = pair(), savedHost = [...p.host.messages], savedBackend = [...p.backend.messages]; p.relay.retire();
    for (const listener of savedHost) listener(ready()); for (const listener of savedBackend) listener(hello());
    assert.deepEqual(p.host.sent, []); assert.deepEqual(p.backend.sent, []); assert.equal(p.relay.status().rejectedFrames, 0);
  });
  check('late old send completion cannot retire a newly attached relay', () => {
    const p = pair(); p.backend.emit(hello()); p.relay.retire();
    const next = createNativePerformanceRelay({ binding, host: p.host.channel, backend: p.backend.channel });
    p.host.complete(0, new Error('PRIVATE_OLD_CALLBACK')); p.backend.emit(hello());
    assert.equal(next.status().retired, false); assert.deepEqual(p.host.sent, [hello(), hello()]); assert.equal(next.status().forwardedBackendToHost, 1); next.retire();
  });
  check('explicit retirement is idempotent and zeroes all bounded pending slots', () => {
    const p = pair(); p.backend.emit(hello()); p.backend.emit(read(2)); p.relay.retire(); p.relay.retire();
    const retired = p.relay.status(); assert.equal(retired.hostSender.inFlight + retired.hostSender.queuedControls + retired.hostSender.queuedSnapshot, 0);
    assert.equal(retired.backendSender.inFlight + retired.backendSender.queuedControls + retired.backendSender.queuedSnapshot, 0);
    assert.equal(p.host.messages.size + p.backend.messages.size + p.host.disconnects.size + p.backend.disconnects.size, 0);
  });
  check('throwing message subscription getter cleans both sender listeners', () => {
    const host = endpoint(), backend = endpoint();
    Object.defineProperty(host.channel, 'onMessage', { get() { throw new Error('PRIVATE_MESSAGE_GETTER'); } });
    const relay = createNativePerformanceRelay({ binding, host: host.channel, backend: backend.channel });
    assert.equal(relay.status().retired, true); assert.equal(host.disconnects.size + backend.disconnects.size + backend.messages.size, 0);
  });
  check('synchronous disconnect at construction cannot leak the other sender', () => {
    const host = endpoint(), backend = endpoint(); let removed = 0;
    host.channel.onDisconnect = listener => { listener(); return () => { removed++; }; };
    const relay = createNativePerformanceRelay({ binding, host: host.channel, backend: backend.channel });
    assert.equal(relay.status().retired, true); assert.equal(removed, 1); assert.equal(backend.disconnects.size + host.messages.size + backend.messages.size, 0);
  });
  check('throwing disconnect getter fails closed without touching app lifecycle', () => {
    const host = endpoint(), backend = endpoint();
    Object.defineProperty(backend.channel, 'onDisconnect', { get() { throw new Error('PRIVATE_DISCONNECT_GETTER'); } });
    const relay = createNativePerformanceRelay({ binding, host: host.channel, backend: backend.channel });
    assert.equal(relay.status().retired, true); assert.equal(host.disconnects.size + host.messages.size, 0); assert.deepEqual(host.sent, []);
  });
  check('throwing message unsubscriber is isolated during explicit retirement', () => {
    const host = endpoint(), backend = endpoint(); host.channel.onMessage = () => () => { throw new Error('PRIVATE_REMOVE_MESSAGE'); };
    const relay = createNativePerformanceRelay({ binding, host: host.channel, backend: backend.channel });
    assert.doesNotThrow(() => relay.retire()); assert.equal(relay.status().retired, true); assert.equal(backend.messages.size, 0);
  });
  check('send getter failure retires telemetry without synthesizing lifecycle objects', () => {
    const host = endpoint(), backend = endpoint(); Object.defineProperty(host.channel, 'send', { get() { throw new Error('PRIVATE_PHYSICAL_GETTER'); } });
    const relay = createNativePerformanceRelay({ binding, host: host.channel, backend: backend.channel }); backend.emit(hello());
    assert.equal(relay.status().retired, true); assert.deepEqual(host.sent, []); assert.deepEqual(backend.sent, []);
  });
  check('a protocol-valid changed backend hello is forwarded for the host semantic owner', () => {
    const p = pair(), raw = frame({ type: 'hello', backendInstanceId: 'backend_changed_01' }, 'backend-to-host');
    p.backend.emit(raw); assert.deepEqual(p.host.sent, [raw]); assert.equal(p.relay.status().rejectedFrames, 0); p.relay.retire();
  });
  check('exact control byte limit is accepted and the next byte is rejected', () => {
    const p = pair(), raw = hello(), padded = raw + ' '.repeat(NATIVE_PERFORMANCE_LIMITS.maxControlBytes - raw.length);
    p.backend.emit(padded + ' '); assert.deepEqual(p.host.sent, []); assert.equal(p.relay.status().rejectedFrames, 1);
    p.backend.emit(padded); assert.deepEqual(p.host.sent, [padded]); p.relay.retire();
  });
  check('invalid constructor binding fails before any endpoint listener is installed', () => {
    const host = endpoint(), backend = endpoint();
    assert.throws(() => createNativePerformanceRelay({ binding: { nonce: '', epoch: binding.epoch }, host: host.channel, backend: backend.channel }), /NATIVE_WIRE_BINDING_INVALID/);
    assert.equal(host.messages.size + backend.messages.size + host.disconnects.size + backend.disconnects.size, 0);
  });
  check('relay diagnostics are frozen counts without private binding or frame payloads', () => {
    const p = pair(); p.backend.emit(hello()); const result = p.relay.status();
    assert(Object.isFrozen(result)); assert(Object.isFrozen(result.hostSender)); assert(Object.isFrozen(result.backendSender));
    const text = JSON.stringify(result); assert.equal(text.includes(binding.nonce), false); assert.equal(text.includes(binding.epoch), false);
    assert.equal(text.includes('backend_relay_01'), false); assert.equal(text.includes('frame'), false); p.relay.retire();
  });
  check('manual retirement notice is once after fencing and contains callback failure', () => {
    const holder: { pair?: ReturnType<typeof pair> } = {};
    const observed: Array<{ retired: boolean; listeners: number }> = [];
    const p = pair(() => {
      const current = holder.pair; if (!current) throw new Error('RELAY_HOLDER_MISSING');
      observed.push({ retired: current.relay.status().retired,
        listeners: current.host.messages.size + current.backend.messages.size + current.host.disconnects.size + current.backend.disconnects.size });
      current.relay.retire(); throw new Error('PRIVATE_RELAY_NOTICE');
    });
    holder.pair = p; p.relay.retire(); p.relay.retire();
    assert.deepEqual(observed, [{ retired: true, listeners: 0 }]);
  });
  check('host leg disconnect emits one retirement notice without synthetic traffic', () => {
    let notices = 0; const p = pair(() => { notices++; });
    p.host.disconnect(); p.host.disconnect(); p.relay.retire();
    assert.equal(notices, 1); assert.equal(p.relay.status().retired, true);
    assert.deepEqual(p.host.sent, []); assert.deepEqual(p.backend.sent, []);
  });
  check('backend leg disconnect emits one upstream-adapter retirement notice', () => {
    let notices = 0; const p = pair(() => { notices++; });
    p.backend.disconnect(); p.backend.disconnect(); p.relay.retire();
    assert.equal(notices, 1); assert.equal(p.relay.status().retired, true);
  });
  check('send callback failure emits retirement notice once and keeps no listeners', () => {
    let notices = 0; const p = pair(() => { notices++; });
    p.backend.emit(hello()); p.host.complete(0, new Error('PRIVATE_RELAY_SEND')); p.relay.retire();
    assert.equal(notices, 1);
    assert.equal(p.host.messages.size + p.backend.messages.size + p.host.disconnects.size + p.backend.disconnects.size, 0);
  });
  check('constructor disconnect notice is exception-contained and never duplicated', () => {
    const host = endpoint(), backend = endpoint(); let notices = 0;
    host.channel.onDisconnect = listener => { listener(); return () => undefined; };
    const options = { binding, host: host.channel, backend: backend.channel,
      onRetire: () => { notices++; throw new Error('PRIVATE_CONSTRUCTOR_RELAY_NOTICE'); } };
    const relay = createNativePerformanceRelay(options); relay.retire();
    assert.equal(notices, 1); assert.equal(relay.status().retired, true);
    assert.deepEqual(host.sent, []); assert.deepEqual(backend.sent, []);
  });
  check('invalid data refusal does not masquerade as lifecycle retirement', () => {
    let notices = 0; const p = pair(() => { notices++; });
    p.backend.emit('{invalid'); p.host.emit({ type: 'x4forge-parent-lost' });
    assert.equal(notices, 0); assert.equal(p.relay.status().retired, false);
    p.relay.retire(); assert.equal(notices, 1);
  });
  const passed = checks.filter(result => result.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks };
}

if (typeof require !== 'undefined' && require.main === module) {
  const result = runNativePerformanceRelaySelftest();
  console.log(JSON.stringify(result));
  if (!result.pass) process.exitCode = 1;
}
