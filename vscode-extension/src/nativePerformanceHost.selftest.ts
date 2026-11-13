import assert from 'node:assert/strict';
import { createNativePerformance } from './nativePerformance';
import {
  createNativePerformanceHost,
  type NativePerformanceHost,
  type NativePerformanceHostBridge,
} from './nativePerformanceHost';
import type { NativePerformanceEndpoint } from '../../shared/nativePerformanceChannel';
import {
  createNativePerformanceWireSession,
  decodeNativePerformanceFrame,
  type NativeBackendMessage,
  type NativeCaptureKey,
  type NativePerformanceFrame,
  type NativePerformanceWireSession,
  type NativeWireBinding,
} from '../../shared/nativePerformanceProtocol';

const bindingA: NativeWireBinding = Object.freeze({ nonce: 'a'.repeat(64), epoch: 'epoch_native_01' });
const bindingB: NativeWireBinding = Object.freeze({ nonce: 'b'.repeat(64), epoch: 'epoch_native_02' });
const captureA = 'capture_native_01';
const captureB = 'capture_native_02';
const controlA = 'control_native_01';
const controlB = 'control_native_02';
const backendA = 'backend_native_01';

class Endpoint implements NativePerformanceEndpoint {
  connected = true;
  automatic = true;
  writable = true;
  throwSend = false;
  callbackError = false;
  readonly frames: string[] = [];
  readonly callbacks: Array<(error: Error | null) => void> = [];
  readonly messages = new Set<(raw: unknown) => void>();
  readonly disconnects = new Set<() => void>();
  isConnected() { return this.connected; }
  send(frame: string, callback: (error: Error | null) => void) {
    if (this.throwSend) throw new Error('PRIVATE_SEND_FAILURE');
    this.frames.push(frame); this.callbacks.push(callback);
    if (this.automatic) callback(this.callbackError ? new Error('PRIVATE_CALLBACK_FAILURE') : null);
    return this.writable;
  }
  onMessage(listener: (raw: unknown) => void) {
    this.messages.add(listener); return () => { this.messages.delete(listener); };
  }
  onDisconnect(listener: () => void) {
    this.disconnects.add(listener); return () => { this.disconnects.delete(listener); };
  }
  receive(raw: unknown) { for (const listener of [...this.messages]) listener(raw); }
  disconnect() {
    this.connected = false;
    for (const listener of [...this.disconnects]) listener();
  }
  complete(index: number, error: Error | null = null) { this.callbacks[index]?.(error); }
}
interface Connection {
  endpoint: Endpoint;
  current: { value: boolean };
  binding: NativeWireBinding;
  wire: NativePerformanceWireSession;
  bridge: NativePerformanceHostBridge;
  send(message: NativeBackendMessage): string;
  hello(backendInstanceId?: string): void;
  last(): NativePerformanceFrame;
}

class Harness {
  now = 1000;
  reads = 0;
  setCalls = 0;
  failClear = false;
  beginThrows = false;
  finishThrows = false;
  snapshotThrows = false;
  stopThrows = false;
  readonly tasks = new Set<object>();
  readonly stopKeys: NativeCaptureKey[] = [];
  readonly producer: ReturnType<typeof createNativePerformance>;
  readonly owner: NativePerformanceHost;
  constructor() {
    this.producer = createNativePerformance({
      pid: 42, instanceId: 'instance_native_01', now: () => this.now, wallNow: () => this.now + 100_000,
      resources: {
        pid: () => { this.reads++; return 42; },
        cpuUsage: () => { this.reads++; return { user: 0, system: 0 }; },
        memoryUsage: () => { this.reads++; return { rss: 100, heapUsed: 20, heapTotal: 40, external: 3 }; },
        logicalCpuCount: () => { this.reads++; return 2; },
        uptime: () => { this.reads++; return 1; },
      },
      timers: {
        set: () => { this.setCalls++; const handle = { unref() {} }; this.tasks.add(handle); return handle; },
        clear: handle => {
          if (this.failClear) throw new Error('PRIVATE_CLEAR_FAILURE');
          assert.equal(this.tasks.delete(handle as object), true, 'Clear only an exact owned live timer.');
        },
      },
    });
    this.owner = createNativePerformanceHost({ producer: {
      ...this.producer,
      beginOperation: id => {
        if (this.beginThrows) throw new Error('PRIVATE_BEGIN_FAILURE');
        const finish = this.producer.beginOperation(id);
        return (outcome?: Parameters<typeof finish>[0]) => { if (this.finishThrows) throw new Error('PRIVATE_FINISH_FAILURE'); finish(outcome); };
      },
      snapshot: () => {
        if (this.snapshotThrows) throw new Error('PRIVATE_SNAPSHOT_FAILURE');
        return this.producer.snapshot();
      },
      stopCollection: (key, reason) => {
        this.stopKeys.push({ ...key });
        if (this.stopThrows) throw new Error('PRIVATE_STOP_FAILURE');
        return this.producer.stopCollection(key, reason);
      },
    } });
  }
  connect(binding: NativeWireBinding = bindingA, endpoint = new Endpoint()): Connection {
    const expectedBinding = Object.freeze({ ...binding });
    const current = { value: true };
    const wire = createNativePerformanceWireSession({ binding, incomingDirection: 'host-to-backend' });
    const bridge = this.owner.attach({ binding, channel: endpoint, isCurrent: () => current.value });
    return {
      endpoint, current, binding: expectedBinding, wire, bridge,
      send(message) {
        const encoded = wire.encode(message);
        if (!encoded.ok) throw new Error('INVALID_HOST_TEST_MESSAGE');
        endpoint.receive(encoded.text); return encoded.text;
      },
      hello(backendInstanceId = backendA) { this.send({ type: 'hello', backendInstanceId }); },
      last() {
        const decoded = decodeNativePerformanceFrame(endpoint.frames.at(-1), { binding: expectedBinding, direction: 'host-to-backend' });
        if (!decoded.ok) throw new Error('MISSING_HOST_TEST_REPLY');
        return decoded.frame;
      },
    };
  }
  start(connection: Connection, captureId = captureA, controlId = controlA) {
    connection.send({ type: 'start', captureId, controlId, options: {} });
    const reply = connection.last();
    if (reply.type !== 'result') throw new Error('EXPECTED_START_RESULT');
    assert.equal(reply.controlId, controlId); assert.equal(reply.captureId, captureId);
    assert.equal(reply.result.ok, true); assert.equal(reply.result.status.collectionActive, true);
  }
}

export function runNativePerformanceHostSelftest() {
  const checks: Array<{ name: string; pass: boolean }> = [];
  const fixtures = new Set<Harness>();
  const fixture = () => { const value = new Harness(); fixtures.add(value); return value; };
  const check = (name: string, run: () => void) => {
    try { run(); checks.push({ name, pass: true }); }
    catch (error) {
      checks.push({ name, pass: false });
      console.error('[native-host] ' + name + ': ' + (error instanceof Error ? error.message : 'Unknown assertion failure'));
    } finally {
      for (const value of fixtures) {
        value.failClear = value.stopThrows = value.snapshotThrows = false;
        try {
          const ended = value.owner.dispose();
          assert.equal(ended.ok, true); assert.equal(value.tasks.size, 0);
        } catch { checks[checks.length - 1].pass = false; }
      }
      fixtures.clear();
    }
  };

  check('idle attachment and hello create no sampling or publishing work', () => {
    const h = fixture(); const connection = h.connect();
    assert.equal(connection.endpoint.frames.length, 0);
    connection.hello(); assert.equal(connection.last().type, 'ready');
    assert.equal(h.reads, 0); assert.equal(h.setCalls, 0); assert.equal(h.tasks.size, 0);
  });
  check('commands before the first current hello cannot start or read a capture', () => {
    const h = fixture(); const connection = h.connect();
    connection.send({ type: 'start', controlId: controlA, captureId: captureA, options: {} });
    connection.send({ type: 'read', controlId: controlB });
    assert.equal(connection.endpoint.frames.length, 0); assert.equal(h.reads, 0); assert.equal(h.setCalls, 0);
  });
  check('a changed backend incarnation cannot replace the first pinned hello', () => {
    const h = fixture(); const connection = h.connect(); connection.hello();
    const frames = connection.endpoint.frames.length;
    connection.hello('backend_native_02'); assert.equal(connection.endpoint.frames.length, frames);
    connection.hello(); assert.equal(connection.last().type, 'ready'); assert.equal(h.reads, 0);
  });
  check('matching start result is an actual producer outcome with private binding omitted', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    assert.equal(h.producer.status().captureId, captureA); assert.equal(h.producer.status().ownedTimerCount, 2);
    const reply = connection.last();
    if (reply.type !== 'result') throw new Error('EXPECTED_RESULT');
    assert(!JSON.stringify(reply.result).includes(bindingA.epoch));
    assert(!JSON.stringify(reply.result).includes(bindingA.nonce));
  });
  check('read snapshots retained data without sampling or another timer', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    const reads = h.reads; const timers = h.setCalls; h.now += 2000;
    connection.send({ type: 'read', controlId: 'read_control_01' });
    const reply = connection.last();
    if (reply.type !== 'snapshot') throw new Error('EXPECTED_SNAPSHOT');
    assert.equal(reply.controlId, 'read_control_01'); assert.equal(reply.status.captureId, captureA);
    assert.equal(reply.snapshot.resources.length, 1); assert.equal(h.reads, reads); assert.equal(h.setCalls, timers);
  });
  check('idle read stays disabled and exposes unknown CPU rather than fabricated work', () => {
    const h = fixture(); const connection = h.connect(); connection.hello();
    connection.send({ type: 'read', controlId: 'read_control_01' });
    const reply = connection.last();
    if (reply.type !== 'snapshot') throw new Error('EXPECTED_SNAPSHOT');
    assert.equal(reply.status.collectionActive, false); assert.equal(reply.snapshot.resources.length, 0);
    assert.equal(h.reads, 0); assert.equal(h.setCalls, 0);
  });
  check('busy start preserves the exact capture key used for later stop', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.send({ type: 'start', controlId: controlB, captureId: captureB, options: {} });
    const rejected = connection.last();
    if (rejected.type !== 'result' || rejected.result.ok === true) throw new Error('EXPECTED_BUSY');
    assert.equal(rejected.result.code, 'NATIVE_PERFORMANCE_BUSY');
    connection.send({ type: 'stop', controlId: 'stop_control_01', captureId: captureA, reason: 'requested' });
    assert.deepEqual(h.stopKeys.at(-1), { epoch: bindingA.epoch, captureId: captureA });
    assert.equal(h.producer.status().collectionActive, false);
  });
  check('a wrong capture stop never performs cleanup on the actual lease', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.send({ type: 'stop', controlId: controlB, captureId: captureB, reason: 'requested' });
    assert.equal(h.stopKeys.length, 0); assert.equal(h.producer.status().collectionActive, true);
  });
  check('cancel must identify the original start or latest exact cleanup control', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.send({ type: 'cancel', controlId: controlB, captureId: captureA });
    assert.equal(h.stopKeys.length, 0); assert.equal(h.producer.status().collectionActive, true);
    connection.send({ type: 'cancel', controlId: controlA, captureId: captureA });
    assert.equal(h.producer.status().collectionActive, false); assert.equal(connection.last().type, 'result');
  });
  check('cancel after an exact cleanup stop remains idempotent and correlated', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.send({ type: 'stop', controlId: 'stop_control_01', captureId: captureA, reason: 'requested' });
    connection.send({ type: 'cancel', controlId: 'stop_control_01', captureId: captureA });
    const reply = connection.last();
    if (reply.type !== 'result') throw new Error('EXPECTED_RESULT');
    assert.equal(reply.controlId, 'stop_control_01'); assert.equal(reply.result.ok, true);
    assert.equal(reply.result.status.collectionCleanupUnconfirmed, false);
  });
  check('malformed foreign binding and wrong direction frames cannot call the producer', () => {
    const h = fixture(); const connection = h.connect(); connection.hello();
    connection.endpoint.receive({ get type() { throw new Error('UNREAD_GETTER'); } });
    connection.endpoint.receive('{');
    const foreign = createNativePerformanceWireSession({ binding: bindingB, incomingDirection: 'host-to-backend' });
    const encoded = foreign.encode({ type: 'start', controlId: controlA, captureId: captureA, options: {} });
    if (!encoded.ok) throw new Error('INVALID_TEST_FRAME');
    connection.endpoint.receive(encoded.text);
    connection.endpoint.receive(connection.endpoint.frames[0]);
    assert.equal(h.reads, 0); assert.equal(h.setCalls, 0);
  });
  check('replaying a valid start cannot invoke the producer twice', () => {
    const h = fixture(); const connection = h.connect(); connection.hello();
    const raw = connection.send({ type: 'start', controlId: controlA, captureId: captureA, options: {} });
    const frames = connection.endpoint.frames.length; const reads = h.reads;
    connection.endpoint.receive(raw);
    assert.equal(connection.endpoint.frames.length, frames); assert.equal(h.reads, reads); assert.equal(h.setCalls, 2);
  });
  check('lost actual owner at receive retires its exact capture', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.current.value = false;
    connection.send({ type: 'read', controlId: controlB });
    assert.equal(h.producer.status().collectionActive, false); assert.equal(h.tasks.size, 0);
    assert.equal(connection.endpoint.messages.size, 0);
  });
  check('lost owner before queued reply dispatch cannot send that reply', () => {
    const h = fixture(); const endpoint = new Endpoint(); endpoint.automatic = false;
    const connection = h.connect(bindingA, endpoint); connection.hello();
    connection.send({ type: 'start', controlId: controlA, captureId: captureA, options: {} });
    assert.equal(endpoint.frames.length, 1); assert.equal(h.producer.status().collectionActive, true);
    connection.current.value = false; endpoint.complete(0);
    assert.equal(endpoint.frames.length, 1); assert.equal(h.producer.status().collectionActive, false);
  });
  check('a false underlying send is not retransmitted', () => {
    const h = fixture(); const endpoint = new Endpoint(); endpoint.automatic = false; endpoint.writable = false;
    const connection = h.connect(bindingA, endpoint); connection.hello();
    assert.equal(endpoint.frames.length, 1);
    endpoint.complete(0); assert.equal(endpoint.frames.length, 1); assert.equal(h.setCalls, 0);
  });
  check('expected latest-snapshot replacement never retires the active capture', () => {
    const h = fixture(); const endpoint = new Endpoint(); endpoint.automatic = false;
    const connection = h.connect(bindingA, endpoint); connection.hello();
    connection.send({ type: 'start', controlId: controlA, captureId: captureA, options: {} });
    const reads = h.reads;
    connection.send({ type: 'read', controlId: 'read_control_01' });
    connection.send({ type: 'read', controlId: 'read_control_02' });
    assert.equal(h.producer.status().collectionActive, true); assert.equal(endpoint.frames.length, 1);
    endpoint.complete(0); endpoint.complete(1);
    const reply = connection.last();
    if (reply.type !== 'snapshot') throw new Error('EXPECTED_LATEST_SNAPSHOT');
    assert.equal(reply.controlId, 'read_control_02'); assert.equal(h.reads, reads);
    assert.equal(h.producer.status().collectionActive, true);
  });
  check('a later control discards an older queued read without stopping telemetry', () => {
    const h = fixture(); const endpoint = new Endpoint(); endpoint.automatic = false;
    const connection = h.connect(bindingA, endpoint); connection.hello();
    connection.send({ type: 'read', controlId: 'read_control_01' });
    connection.send({ type: 'start', controlId: controlA, captureId: captureA, options: {} });
    endpoint.complete(0);
    const reply = connection.last();
    if (reply.type !== 'result') throw new Error('EXPECTED_CONTROL_RESULT');
    assert.equal(reply.controlId, controlA); assert.equal(reply.result.ok, true);
    assert.equal(endpoint.frames.length, 2); assert.equal(h.producer.status().collectionActive, true);
  });
  check('transport callback failure retires telemetry without disposing the activation producer', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.endpoint.callbackError = true;
    connection.send({ type: 'read', controlId: controlB });
    assert.equal(h.producer.status().collectionActive, false); assert.equal(h.producer.status().disposed, false);
    const next = h.connect(bindingB); next.hello(); h.start(next, captureB, controlB);
  });
  check('synchronous send failure cannot escape or leave native sampling active', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.endpoint.throwSend = true;
    assert.doesNotThrow(() => connection.send({ type: 'read', controlId: controlB }));
    assert.equal(h.producer.status().collectionActive, false); assert.equal(h.tasks.size, 0);
  });
  check('disconnect is local telemetry retirement with no producer disposal', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.endpoint.disconnect();
    assert.equal(h.producer.status().collectionActive, false); assert.equal(h.producer.status().disposed, false);
    assert.equal(connection.endpoint.messages.size, 0); assert.equal(connection.endpoint.disconnects.size, 0);
  });
  check('old completion message and retirement callbacks cannot stop a replacement capture', () => {
    const h = fixture(); const endpoint = new Endpoint(); endpoint.automatic = false;
    const old = h.connect(bindingA, endpoint); old.hello();
    old.send({ type: 'start', controlId: controlA, captureId: captureA, options: {} });
    const oldListener = [...endpoint.messages][0];
    const next = h.connect(bindingB); next.hello(); h.start(next, captureB, controlB);
    endpoint.complete(0, new Error('OLD_TRANSPORT_FAILURE'));
    const encoded = old.wire.encode({ type: 'stop', controlId: 'old_stop_control', captureId: captureA, reason: 'requested' });
    if (!encoded.ok) throw new Error('INVALID_TEST_FRAME');
    oldListener(encoded.text); old.bridge.retire('backend-exit'); endpoint.disconnect();
    assert.equal(h.producer.status().collectionActive, true); assert.equal(h.producer.status().captureId, captureB);
    assert.equal(h.stopKeys.filter(key => key.captureId === captureB).length, 0);
  });
  check('uncertain old-key cleanup is retried once by the new hello using the original epoch', () => {
    const h = fixture(); const old = h.connect(); old.hello(); h.start(old);
    h.failClear = true; old.bridge.retire('backend-exit');
    const next = h.connect(bindingB); const before = h.stopKeys.length; next.hello();
    assert.equal(h.stopKeys.length, before + 1);
    assert.deepEqual(h.stopKeys.at(-1), { epoch: bindingA.epoch, captureId: captureA });
    next.hello(); assert.equal(h.stopKeys.length, before + 1);
    assert.equal(h.producer.status().collectionCleanupUnconfirmed, true);
  });
  check('uncertain orphan blocks new capture while explicit stop maps to its exact old key', () => {
    const h = fixture(); const old = h.connect(); old.hello(); h.start(old);
    h.failClear = true; old.bridge.retire('backend-exit');
    const next = h.connect(bindingB); next.hello();
    next.send({ type: 'start', controlId: controlB, captureId: captureB, options: {} });
    const blocked = next.last();
    if (blocked.type !== 'result' || blocked.result.ok === true) throw new Error('EXPECTED_CLEANUP_REFUSAL');
    assert.equal(blocked.result.code, 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
    h.failClear = false;
    next.send({ type: 'stop', controlId: 'reconcile_control_01', captureId: captureA, reason: 'requested' });
    assert.deepEqual(h.stopKeys.at(-1), { epoch: bindingA.epoch, captureId: captureA });
    assert.equal(h.producer.status().collectionCleanupUnconfirmed, false); h.start(next, captureB, controlB);
  });
  check('new binding automatically resolves owned retirement when cleanup becomes available', () => {
    const h = fixture(); const old = h.connect(); old.hello(); h.start(old);
    h.failClear = true; old.bridge.retire('backend-exit'); h.failClear = false;
    const next = h.connect(bindingB); next.hello();
    const ready = next.last();
    if (ready.type !== 'ready') throw new Error('EXPECTED_READY');
    assert.equal(ready.status.captureId, captureA); assert.equal(ready.status.collectionCleanupUnconfirmed, false);
    assert.equal(h.tasks.size, 0); h.start(next, captureB, controlB);
  });
  check('clean retained history permits new capture without a reconciliation barrier', () => {
    const h = fixture(); const old = h.connect(); old.hello(); h.start(old);
    old.send({ type: 'stop', controlId: 'stop_control_01', captureId: captureA, reason: 'requested' });
    const stops = h.stopKeys.length; old.bridge.retire('backend-exit');
    const next = h.connect(bindingB); next.hello(); assert.equal(h.stopKeys.length, stops);
    h.start(next, captureB, controlB); assert.equal(h.producer.status().captureId, captureB);
  });
  check('old clean key remains available for an exact idempotent stop after rebind', () => {
    const h = fixture(); const old = h.connect(); old.hello(); h.start(old); old.bridge.retire('backend-exit');
    const next = h.connect(bindingB); next.hello();
    next.send({ type: 'stop', controlId: 'repeat_stop_01', captureId: captureA, reason: 'requested' });
    assert.deepEqual(h.stopKeys.at(-1), { epoch: bindingA.epoch, captureId: captureA });
    const result = next.last(); if (result.type !== 'result') throw new Error('EXPECTED_RESULT');
    assert.equal(result.result.ok, true);
  });
  check('attachment copies private binding before a caller can mutate its object', () => {
    const h = fixture(); const selected = { ...bindingA }; const connection = h.connect(selected);
    selected.epoch = bindingB.epoch; selected.nonce = bindingB.nonce;
    connection.hello(); h.start(connection); connection.bridge.retire('backend-exit');
    assert.deepEqual(h.stopKeys.at(-1), { epoch: bindingA.epoch, captureId: captureA });
  });
  check('an already noncurrent or disconnected attachment does not displace the current bridge', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    const unused = new Endpoint();
    h.owner.attach({ binding: bindingB, channel: unused, isCurrent: () => false }).retire('unused');
    unused.connected = false;
    h.owner.attach({ binding: bindingB, channel: unused, isCurrent: () => true });
    assert.equal(h.producer.status().collectionActive, true); assert.equal(unused.messages.size, 0);
  });
  check('snapshot observer failure retires only telemetry and never escapes caller work', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    h.snapshotThrows = true;
    assert.doesNotThrow(() => connection.send({ type: 'read', controlId: controlB }));
    assert.equal(h.producer.status().collectionActive, false); assert.equal(h.producer.status().disposed, false);
  });
  check('begin and finish telemetry faults preserve original values and thrown errors', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    h.beginThrows = true; assert.doesNotThrow(() => h.owner.beginOperation('native.command')());
    h.beginThrows = false; h.finishThrows = true;
    const value = Object.freeze({ original: true }); const error = new Error('ORIGINAL_WORK_ERROR');
    const work = () => { const finish = h.owner.beginOperation('native.command'); finish(); return value; };
    assert.equal(work(), value);
    assert.throws(() => { const finish = h.owner.beginOperation('native.command'); try { throw error; } finally { finish('error'); } }, caught => caught === error);
  });
  check('lost actual owner observed by instrumentation stops its current capture', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    connection.current.value = false;
    assert.doesNotThrow(() => h.owner.beginOperation('native.command')());
    assert.equal(h.producer.status().collectionActive, false);
  });
  check('dispose returns honest cleanup uncertainty and a later dispose can retry', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    h.failClear = true; const failed = h.owner.dispose();
    assert.equal(failed.ok, false); assert.equal(failed.status.collectionCleanupUnconfirmed, true);
    const unused = new Endpoint(); h.owner.attach({ binding: bindingB, channel: unused, isCurrent: () => true });
    assert.equal(unused.messages.size, 0); assert.equal(h.producer.status().disposed, true);
    h.failClear = false; const recovered = h.owner.dispose();
    assert.equal(recovered.ok, true); assert.equal(recovered.status.collectionCleanupUnconfirmed, false);
    assert.equal(h.tasks.size, 0);
  });
  check('a malformed binding is rejected before it can displace an active bridge', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    assert.throws(() => h.owner.attach({ binding: { nonce: 'short', epoch: bindingB.epoch }, channel: new Endpoint(), isCurrent: () => true }), TypeError);
    assert.equal(h.producer.status().collectionActive, true);
  });
  check('wire output never echoes observer exception details into native status', () => {
    const h = fixture(); const connection = h.connect(); connection.hello(); h.start(connection);
    h.stopThrows = true;
    connection.send({ type: 'stop', controlId: controlB, captureId: captureA, reason: 'requested' });
    const reply = connection.last();
    if (reply.type !== 'result' || reply.result.ok === true) throw new Error('EXPECTED_UNKNOWN_CLEANUP');
    assert.equal(reply.result.code, 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
    assert(!JSON.stringify(reply.result).includes('PRIVATE'));
    assert.equal(reply.result.status.collectionCleanupUnconfirmed, true);
  });
  return { pass: checks.every(value => value.pass), passed: checks.filter(value => value.pass).length, total: checks.length, checks };
}

if (typeof require !== 'undefined' && require.main === module) {
  const result = runNativePerformanceHostSelftest();
  console.log(JSON.stringify(result));
  if (!result.pass) process.exitCode = 1;
}
