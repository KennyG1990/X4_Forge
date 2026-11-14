/** Injected broker controls only; actual process/host IPC is a separate qualification. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createForgePerformanceCollector } from '../../shared/forgePerformance';
import {
  createNativePerformanceWireSession, type NativeHostMessage, type NativePerformanceFrame,
  type NativePerformanceStatus, type NativeControlFailureCode,
} from '../../shared/nativePerformanceProtocol';
import type { NativePerformanceEndpoint } from '../../shared/nativePerformanceChannel';
import {
  createNativePerformanceBroker, type NativeBrokerActor, type NativeBrokerIdentityRequest,
  type NativeBrokerResult, type NativeBrokerTimers, type NativePerformanceBroker, type NativeBrokerRetireReason,
} from './nativePerformanceBroker';

const binding = { nonce: 'private_nonce_broker_01', epoch: 'epoch_broker_01' };
const backendId = 'backend_instance_broker_01';
const nativeId = 'native_instance_broker_01';
const initialStatus = (): NativePerformanceStatus => ({
  schemaVersion: 'forge.native-performance.status.v1',
  producer: { component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: nativeId },
  disposed: false, collectionActive: false, captureId: null,
  collectionStartedAtUnixMs: null, collectionExpiresAtUnixMs: null, intervalMs: 2000,
  eventLoopDelayMonitoring: false, resourceSamples: 0, resourceErrors: 0, throttledSamples: 0,
  counterResets: 0, sampleOverheadMs: 0, lastResourceError: null, collectionStopDelayMs: null,
  collectionCleanupUnconfirmed: false, ownedTimerCount: 0, failedTimerCount: 0, lastStopReason: null,
});
class Clock implements NativeBrokerTimers {
  now = 1000;
  sequence = 0;
  throwSet = false;
  throwClear = false;
  synchronous = false;
  readonly tasks = new Map<number, { due: number; callback: () => void }>();
  set = (callback: () => void, delay: number): unknown => {
    if (this.throwSet) throw new Error('INJECTED_PRIVATE_TIMER_SET');
    const id = ++this.sequence;
    this.tasks.set(id, { due: this.now + delay, callback });
    if (this.synchronous) callback();
    return id;
  };
  clear = (id: unknown) => {
    if (this.throwClear) throw new Error('INJECTED_PRIVATE_TIMER_CLEAR');
    if (typeof id === 'number') this.tasks.delete(id);
  };
  advance(ms: number) {
    const end = this.now + ms;
    for (let bound = 0; bound < 128; bound++) {
      const next = [...this.tasks].filter(([, task]) => task.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) { this.now = end; return; }
      this.tasks.delete(next[0]); this.now = next[1].due; next[1].callback();
    }
    throw new Error('FIXTURE_TIMER_BOUND');
  }
}
class Fixture implements NativePerformanceEndpoint {
  readonly clock = new Clock();
  readonly inbound = new Set<(raw: unknown) => void>();
  readonly disconnected = new Set<() => void>();
  readonly outbound: NativePerformanceFrame[] = [];
  readonly sentRaw: string[] = [];
  readonly callbacks: Array<(error: Error | null) => void> = [];
  readonly hostWire = createNativePerformanceWireSession({ binding, incomingDirection: 'backend-to-host' });
  native = initialStatus();
  connected = true;
  hold = false;
  falseSend = false;
  failSend = false;
  autoReady = true;
  actorCurrent = true;
  otherCurrent = true;
  clockThrows = false;
  readonly agent: NativeBrokerActor = { kind: 'agent', id: 'private_actor_agent_A', isCurrent: () => this.actorCurrent };
  readonly other: NativeBrokerActor = { kind: 'agent', id: 'private_actor_agent_B', isCurrent: () => this.otherCurrent };
  readonly studio: NativeBrokerActor = { kind: 'studio', id: 'private_actor_studio', isCurrent: () => true };
  readonly broker: NativePerformanceBroker;
  constructor(options: { ready?: boolean; hold?: boolean; native?: Partial<NativePerformanceStatus>; backendId?: string;
    onRetire?: (reason: NativeBrokerRetireReason) => void } = {}) {
    this.autoReady = options.ready !== false;
    this.hold = options.hold === true;
    this.native = { ...this.native, ...options.native };
    const brokerOptions = {
      backendInstanceId: options.backendId ?? backendId, binding, channel: this, expectedHostPid: 42,
      now: () => { if (this.clockThrows) throw new Error('PRIVATE_CLOCK'); return this.clock.now; }, timers: this.clock,
      onRetire: options.onRetire,
    };
    this.broker = createNativePerformanceBroker(brokerOptions);
  }
  isConnected = () => this.connected;
  onMessage = (listener: (raw: unknown) => void) => { this.inbound.add(listener); return () => { this.inbound.delete(listener); }; };
  onDisconnect = (listener: () => void) => { this.disconnected.add(listener); return () => { this.disconnected.delete(listener); }; };
  send = (raw: string, callback: (error: Error | null) => void) => {
    if (this.failSend) throw new Error('PRIVATE_SEND_SECRET');
    const decoded = this.hostWire.receive(raw);
    if (!decoded.ok) throw new Error('FIXTURE_BACKEND_FRAME_INVALID');
    this.outbound.push(decoded.frame); this.sentRaw.push(raw);
    if (this.hold) this.callbacks.push(callback); else callback(null);
    if (decoded.frame.type === 'hello' && this.autoReady) this.emit({
      type: 'ready', backendInstanceId: decoded.frame.backendInstanceId, status: this.native,
    });
    return !this.falseSend;
  };
  emit(message: NativeHostMessage) {
    const encoded = this.hostWire.encode(message);
    if (!encoded.ok) throw new Error('FIXTURE_HOST_FRAME_INVALID');
    this.raw(encoded.text);
    return encoded.text;
  }
  raw(value: unknown) { for (const handler of [...this.inbound]) handler(value); }
  ready(backendInstanceId = backendId) { return this.emit({ type: 'ready', backendInstanceId, status: this.native }); }
  active(captureId: string) {
    this.native = { ...this.native, captureId, collectionActive: true, ownedTimerCount: 2,
      collectionStartedAtUnixMs: 10000, collectionExpiresAtUnixMs: 70000 };
  }
  inactive(uncertain = false) {
    this.native = { ...this.native, collectionActive: false, ownedTimerCount: uncertain ? 1 : 0,
      failedTimerCount: uncertain ? 1 : 0, collectionCleanupUnconfirmed: uncertain,
      eventLoopDelayMonitoring: false, lastStopReason: 'requested' };
  }
  result(control: { controlId: string; captureId: string }, code?: NativeControlFailureCode) {
    return this.emit({ type: 'result', controlId: control.controlId, captureId: control.captureId,
      result: code ? { ok: false, code, status: this.native } : { ok: true, status: this.native } });
  }
  snapshot(controlId: string | null) {
    const collector = createForgePerformanceCollector({ component: 'extension-host', scope: 'shared-process', pid: this.native.producer.pid,
      instanceId: this.native.producer.instanceId, enabled: this.native.collectionActive, now: () => this.clock.now, wallNow: () => 10000 });
    collector.recordOperation({ name: 'native.backend.ensure', durationMs: 5, outcome: 'ok' });
    return this.emit({ type: 'snapshot', controlId, status: this.native, snapshot: collector.snapshot() });
  }
  startFrame() {
    const frame = [...this.outbound].reverse().find(value => value.type === 'start');
    if (!frame || frame.type !== 'start') throw new Error('FIXTURE_START_MISSING');
    return frame;
  }
  stopFrame() {
    const frame = [...this.outbound].reverse().find(value => value.type === 'stop');
    if (!frame || frame.type !== 'stop') throw new Error('FIXTURE_STOP_MISSING');
    return frame;
  }
  readFrame() {
    const frame = [...this.outbound].reverse().find(value => value.type === 'read');
    if (!frame || frame.type !== 'read') throw new Error('FIXTURE_READ_MISSING');
    return frame;
  }
  cancelFrame() {
    const frame = [...this.outbound].reverse().find(value => value.type === 'cancel');
    if (!frame || frame.type !== 'cancel') throw new Error('FIXTURE_CANCEL_MISSING');
    return frame;
  }
  request(actor = this.agent, signal?: AbortSignal): NativeBrokerIdentityRequest {
    return { actor, expectedBackendInstanceId: this.broker.status().backendInstanceId, expectedNativeInstanceId: nativeId, signal };
  }
  flushOne(error: Error | null = null) {
    const callback = this.callbacks.shift(); if (!callback) throw new Error('FIXTURE_CALLBACK_MISSING');
    callback(error);
  }
  disconnect() { this.connected = false; for (const listener of [...this.disconnected]) listener(); }
}
const failed = (result: NativeBrokerResult, code: string) => {
  if (result.ok === true) assert.fail('EXPECTED_BROKER_FAILURE');
  assert.equal(result.code, code);
};
async function activeFixture() {
  const f = new Fixture();
  const promise = f.broker.start(f.request());
  const frame = f.startFrame(); f.active(frame.captureId); f.result(frame);
  assert.equal((await promise).ok, true);
  return { f, frame };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

export async function runNativePerformanceBrokerSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = async (name: string, work: () => void | Promise<void>) => {
    try { await work(); checks.push({ name, pass: true }); }
    catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.message : 'SELFTEST_FAILURE' }); }
  };
  await check('absent transport is unavailable without timers or native work', async () => {
    const clock = new Clock();
    const broker = createNativePerformanceBroker({ backendInstanceId: backendId, now: () => clock.now, timers: clock });
    assert.equal(broker.status().availability, 'unavailable'); assert.equal(clock.tasks.size, 0);
    failed(await broker.read({ actor: { kind: 'agent', id: 'agent_fixture', isCurrent: () => true } }), 'NATIVE_PERFORMANCE_UNAVAILABLE');
    broker.retire(); broker.retire(); assert.equal(clock.tasks.size, 0);
  });
  await check('initial hello receives readiness through receiver installed before send', () => {
    const f = new Fixture();
    assert.equal(f.outbound[0].type, 'hello'); assert.equal(f.broker.status().availability, 'ready');
    assert.equal(f.broker.status().captureOwned, false); assert.equal(f.clock.tasks.size, 0);
  });
  await check('readiness timeout permits late current ready without capture activation', async () => {
    const f = new Fixture({ ready: false }); f.clock.advance(5000);
    assert.equal(f.broker.status().unavailableReason, 'ready-timeout');
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_UNAVAILABLE');
    f.ready(); assert.equal(f.broker.status().availability, 'ready'); assert.equal(f.broker.status().captureOwned, false);
  });
  await check('foreign backend ready and diagnostic PID mismatch never establish native availability', () => {
    const f = new Fixture({ ready: false }); f.ready('foreign_backend_01');
    assert.equal(f.broker.status().availability, 'waiting');
    f.native = { ...f.native, producer: { ...f.native.producer, pid: 999 } }; f.ready();
    assert.equal(f.broker.status().availability, 'waiting'); assert.equal(f.broker.status().rejectedMessages, 2);
  });
  await check('wrong nonce, direction, malformed objects and replay are inert', () => {
    const f = new Fixture({ ready: false });
    const raw = f.ready(); const before = f.broker.status();
    f.raw(raw); f.raw('{broken'); f.raw({ type: 'x4forge-parent-lost' });
    const wrong = JSON.parse(raw); wrong.nonce = 'foreign_nonce_01'; wrong.sequence += 1; f.raw(JSON.stringify(wrong));
    wrong.nonce = binding.nonce; wrong.direction = 'backend-to-host'; f.raw(JSON.stringify(wrong));
    assert.equal(f.broker.status().availability, 'ready');
    assert.equal(f.broker.status().rejectedMessages, before.rejectedMessages + 5);
  });
  await check('changed native incarnation retires binding instead of accepting replacement', () => {
    const f = new Fixture(); f.native = { ...f.native, producer: { ...f.native.producer, instanceId: 'new_native_instance_01' } };
    f.ready(); assert.equal(f.broker.status().availability, 'retired');
  });
  await check('duplicate ready cannot erase a pending capture or mutate an established native session', () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame();
    f.ready(); assert.equal(f.broker.status().pending, 'start');
    f.active(frame.captureId); f.result(frame); void promise;
    assert.equal(f.broker.status().captureOwned, true);
  });
  await check('start needs matching execution ACK rather than send callback', async () => {
    const f = new Fixture(); let settled = false;
    const promise = f.broker.start(f.request()).then(result => { settled = true; return result; });
    await flush(); assert.equal(settled, false); assert.equal(f.broker.status().captureOwned, false);
    const frame = f.startFrame(); f.active(frame.captureId); f.result(frame);
    const result = await promise; assert.equal(result.ok, true); assert.equal(result.status.pending, null);
    assert.equal(result.status.captureOwned, true);
  });
  await check('stale expected backend or native identity refuses before a start frame', async () => {
    const f = new Fixture();
    failed(await f.broker.start({ ...f.request(), expectedBackendInstanceId: 'old_backend_01' }), 'NATIVE_PERFORMANCE_IDENTITY_MISMATCH');
    failed(await f.broker.start({ ...f.request(), expectedNativeInstanceId: 'old_native_01' }), 'NATIVE_PERFORMANCE_IDENTITY_MISMATCH');
    assert.equal(f.outbound.length, 1);
  });
  await check('invalid collection options refuse without dispatch', async () => {
    const f = new Fixture();
    failed(await f.broker.start({ ...f.request(), options: { durationMs: 999 } }), 'NATIVE_PERFORMANCE_INPUT_INVALID');
    assert.equal(f.outbound.length, 1);
  });
  await check('revoked and already-aborted requests do not dispatch', async () => {
    const f = new Fixture(); f.actorCurrent = false;
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    f.actorCurrent = true; const abort = new AbortController(); abort.abort();
    failed(await f.broker.start(f.request(f.agent, abort.signal)), 'NATIVE_PERFORMANCE_ABORTED');
    assert.equal(f.outbound.length, 1);
  });
  await check('queued authority is revalidated at actual dispatch with no cancel for unsent work', async () => {
    const f = new Fixture({ hold: true }); const promise = f.broker.start(f.request());
    f.actorCurrent = false; f.flushOne();
    failed(await promise, 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    assert.equal(f.outbound.length, 1); assert.equal(f.broker.status().cancellation, 'none');
  });
  await check('queued abort is withdrawn before physical send and retains the abort reason', async () => {
    const f = new Fixture({ hold: true }); const abort = new AbortController();
    const promise = f.broker.start(f.request(f.agent, abort.signal)); abort.abort();
    failed(await promise, 'NATIVE_PERFORMANCE_ABORTED');
    f.flushOne(); assert.equal(f.outbound.length, 1); assert.equal(f.broker.status().cancellation, 'none');
  });
  await check('queued control deadline is known unsent and does not send cancellation', async () => {
    const f = new Fixture({ hold: true }); const promise = f.broker.start(f.request()); f.clock.advance(5000);
    failed(await promise, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT'); assert.equal(f.outbound.length, 1);
    assert.equal(f.broker.status().cancellation, 'none');
  });
  await check('false send return never causes retransmission', async () => {
    const f = new Fixture(); f.falseSend = true;
    const promise = f.broker.start(f.request()); const frame = f.startFrame();
    assert.equal(f.outbound.filter(value => value.type === 'start').length, 1);
    f.active(frame.captureId); f.result(frame); assert.equal((await promise).ok, true);
  });
  await check('wrong capture ACK cannot establish a lease or satisfy pending start', async () => {
    const f = new Fixture(); let settled = false;
    const promise = f.broker.start(f.request()).then(result => { settled = true; return result; }); const frame = f.startFrame();
    f.active('foreign_capture_01'); f.result({ controlId: frame.controlId, captureId: 'foreign_capture_01' });
    await flush(); assert.equal(settled, false); assert.equal(f.broker.status().captureOwned, false);
    f.active(frame.captureId); f.result(frame); assert.equal((await promise).ok, true);
  });
  await check('foreign producer ACK is rejected without overwriting current producer', async () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame();
    f.active(frame.captureId); const original = f.native.producer;
    f.native = { ...f.native, producer: { ...original, instanceId: 'foreign_native_01' } }; f.result(frame);
    assert.equal(f.broker.status().native?.producer.instanceId, nativeId);
    f.native = { ...f.native, producer: original }; f.result(frame); assert.equal((await promise).ok, true);
  });
  await check('producer failure is returned without inventing activation', async () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame();
    f.result(frame, 'NATIVE_PERFORMANCE_START_FAILED');
    failed(await promise, 'NATIVE_PERFORMANCE_START_FAILED'); assert.equal(f.broker.status().captureOwned, false);
  });
  await check('wrong active result status produces uncertainty instead of false success', async () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame();
    f.active('foreign_capture_01'); f.result(frame);
    failed(await promise, 'NATIVE_PERFORMANCE_PROTOCOL_ERROR'); assert.equal(f.broker.status().captureOwned, false);
    assert.equal(f.broker.status().cancellation, 'pending');
  });
  await check('post-dispatch timeout cancels original control and blocks a new capture', async () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame();
    f.clock.advance(5000); failed(await promise, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT');
    const cancel = f.cancelFrame(); assert.equal(cancel.controlId, frame.controlId); assert.equal(cancel.captureId, frame.captureId);
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
    f.clock.advance(5000); assert.equal(f.broker.status().cancellation, 'unknown');
  });
  await check('late active start ACK cannot turn timed-out control into a lease', async () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000);
    failed(await promise, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT');
    f.active(frame.captureId); f.result(frame);
    assert.equal(f.broker.status().captureOwned, false); assert.equal(f.broker.status().cancellation, 'pending');
    f.inactive(); f.result(f.cancelFrame()); assert.equal(f.broker.status().cancellation, 'none');
  });
  await check('post-dispatch abort preserves uncertainty until cleanup confirmation', async () => {
    const f = new Fixture(); const abort = new AbortController(); const promise = f.broker.start(f.request(f.agent, abort.signal));
    const frame = f.startFrame(); abort.abort(); failed(await promise, 'NATIVE_PERFORMANCE_ABORTED');
    assert.equal(f.cancelFrame().controlId, frame.controlId);
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive(); f.result(f.cancelFrame());
    assert.equal(f.broker.status().cleanupUnconfirmed, false);
  });
  await check('revocation at ACK cannot grant a lease and triggers exact cleanup', async () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame();
    f.actorCurrent = false; f.active(frame.captureId); f.result(frame);
    failed(await promise, 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    assert.equal(f.cancelFrame().captureId, frame.captureId); assert.equal(f.broker.status().captureOwned, false);
  });
  await check('fresh matching authorized clean read resolves uncertainty without changing old timeout result', async () => {
    const f = new Fixture(); const promise = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000);
    const original = await promise; failed(original, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT');
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive();
    const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId);
    assert.equal((await read).ok, true); assert.equal(f.broker.status().cancellation, 'none');
    failed(original, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT');
  });
  await check('fresh active read keeps uncertainty and never inherits ownership', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000); await start;
    f.active(frame.captureId); const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); await read;
    assert.notEqual(f.broker.status().cancellation, 'none'); assert.equal(f.broker.status().captureOwned, false);
  });
  await check('matching late cancellation result cannot satisfy a newer cleanup Stop caller', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000); await start;
    let settled = false; const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId }).then(result => { settled = true; return result; });
    const cleanup = f.stopFrame(); assert.notEqual(cleanup.controlId, frame.controlId);
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive(); f.result(f.cancelFrame());
    await flush(); assert.equal(settled, false);
    f.result(cleanup); assert.equal((await stop).ok, true);
  });
  await check('cleanup reconciliation timeout frees primary slot and retains recovery authority', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000); await start;
    const first = f.broker.stop({ ...f.request(), captureId: frame.captureId }); const firstStop = f.stopFrame();
    f.clock.advance(5000); failed(await first, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT');
    const second = f.broker.stop({ ...f.request(), captureId: frame.captureId }); const secondStop = f.stopFrame();
    assert.notEqual(firstStop.controlId, secondStop.controlId);
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive(); f.result(secondStop);
    assert.equal((await second).ok, true); assert.equal(f.broker.status().cancellation, 'none');
  });
  await check('late latest reconciliation ACK clears uncertainty but not prior failed result', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000); await start;
    const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId }); const stopFrame = f.stopFrame(); f.clock.advance(5000);
    const result = await stop; failed(result, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT');
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive(); f.result(stopFrame);
    assert.equal(f.broker.status().cancellation, 'none'); failed(result, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT');
  });
  await check('another agent cannot reconcile a known pending-owner capture', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000); await start;
    failed(await f.broker.stop({ ...f.request(f.other), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    assert.equal(f.outbound.filter(value => value.type === 'stop').length, 0);
  });
  await check('new backend orphan blocks agents but permits explicit trusted Studio stop', async () => {
    const f = new Fixture({ native: { captureId: 'old_capture_01', collectionActive: true, ownedTimerCount: 2 } });
    assert.equal(f.broker.status().orphaned, true);
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
    failed(await f.broker.stop({ ...f.request(), captureId: 'old_capture_01' }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    const stop = f.broker.stop({ ...f.request(f.studio), captureId: 'old_capture_01' }); f.inactive(); f.result(f.stopFrame());
    assert.equal((await stop).ok, true); assert.equal(f.broker.status().orphaned, false);
  });
  await check('clean retained history permits new agent capture without human reconciliation', async () => {
    const f = new Fixture({ native: { captureId: 'old_capture_01' } });
    assert.equal(f.broker.status().orphaned, false);
    const start = f.broker.start(f.request()); const frame = f.startFrame(); f.active(frame.captureId); f.result(frame);
    assert.equal((await start).ok, true);
  });
  await check('uncertain inactive orphan stays blocked until explicit clean stop result', async () => {
    const f = new Fixture({ native: { captureId: 'old_capture_01', collectionCleanupUnconfirmed: true, failedTimerCount: 1, ownedTimerCount: 1 } });
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
    const stop = f.broker.stop({ ...f.request(f.studio), captureId: 'old_capture_01' }); f.inactive(); f.result(f.stopFrame());
    assert.equal((await stop).ok, true);
  });
  await check('cross-actor and wrong-capture stop never dispatch against owned capture', async () => {
    const { f, frame } = await activeFixture();
    failed(await f.broker.stop({ ...f.request(f.other), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    failed(await f.broker.stop({ ...f.request(), captureId: 'wrong_capture_01' }), 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH');
    assert.equal(f.outbound.filter(value => value.type === 'stop').length, 0);
  });
  await check('stop requires inactive clean acknowledgement and releases the original actor lease', async () => {
    const { f, frame } = await activeFixture(); let settled = false;
    const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId }).then(result => { settled = true; return result; });
    const request = f.stopFrame(); await flush(); assert.equal(settled, false);
    f.inactive(); f.result(request); const result = await stop;
    assert.equal(result.ok, true); assert.equal(result.status.captureOwned, false); assert.equal(result.status.pending, null);
  });
  await check('uncertain stop result cannot be reported as success', async () => {
    const { f, frame } = await activeFixture();
    const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId }); f.inactive(true); f.result(f.stopFrame());
    failed(await stop, 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED');
    assert.notEqual(f.broker.status().cancellation, 'none');
  });
  await check('expiry observed by fresh read clears lease and permits a new capture', async () => {
    const { f } = await activeFixture(); f.inactive();
    const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); await read;
    assert.equal(f.broker.status().captureOwned, false);
    const start = f.broker.start(f.request(f.other)); const frame = f.startFrame(); f.active(frame.captureId); f.result(frame);
    assert.equal((await start).ok, true);
  });
  await check('coalesced reads share one wire request and enforce sixteen subscriber limit', async () => {
    const f = new Fixture(); const readers = Array.from({ length: 16 }, () => f.broker.read({ actor: f.agent }));
    failed(await f.broker.read({ actor: f.agent }), 'NATIVE_PERFORMANCE_READER_LIMIT');
    assert.equal(f.outbound.filter(value => value.type === 'read').length, 1); assert.equal(f.broker.status().readSubscribers, 16);
    f.snapshot(f.readFrame().controlId); assert((await Promise.all(readers)).every(result => result.ok));
    assert.equal(f.broker.status().readSubscribers, 0);
  });
  await check('one reader abort detaches only itself and never stops a capture', async () => {
    const f = new Fixture(); const abort = new AbortController();
    const first = f.broker.read({ actor: f.agent, signal: abort.signal }); const second = f.broker.read({ actor: f.agent });
    abort.abort(); failed(await first, 'NATIVE_PERFORMANCE_ABORTED'); assert.equal(f.broker.status().readSubscribers, 1);
    f.snapshot(f.readFrame().controlId); assert.equal((await second).ok, true);
    assert.equal(f.outbound.filter(value => value.type === 'cancel' || value.type === 'stop').length, 0);
  });
  await check('all readers abort leaves no waiter timer and late response cannot refresh cache', async () => {
    const f = new Fixture(); const abort = new AbortController();
    const read = f.broker.read({ actor: f.agent, signal: abort.signal }); const request = f.readFrame(); abort.abort();
    failed(await read, 'NATIVE_PERFORMANCE_ABORTED'); f.snapshot(request.controlId);
    assert.equal(f.broker.status().snapshot, null); assert.equal(f.clock.tasks.size, 0);
  });
  await check('start preempts read and rejects its late snapshot without cancel', async () => {
    const f = new Fixture(); const read = f.broker.read({ actor: f.agent }); const oldRead = f.readFrame();
    const start = f.broker.start(f.request()); const frame = f.startFrame();
    failed(await read, 'NATIVE_PERFORMANCE_PREEMPTED'); f.snapshot(oldRead.controlId);
    assert.equal(f.broker.status().snapshot, null);
    f.active(frame.captureId); f.result(frame); assert.equal((await start).ok, true);
    assert.equal(f.outbound.filter(value => value.type === 'cancel').length, 0);
  });
  await check('unsolicited and null-control snapshots never become fresh', () => {
    const f = new Fixture(); f.snapshot(null); f.snapshot('foreign_control_01');
    assert.equal(f.broker.status().snapshot, null); assert.equal(f.broker.status().droppedSnapshots, 2);
  });
  await check('cached snapshot uses monotonic receipt age and shared-process attribution', async () => {
    const f = new Fixture(); const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId);
    const result = await read; assert.equal(result.ok, true); assert.equal(result.status.snapshotAgeMs, 0);
    f.clock.advance(25); assert.equal(f.broker.status().snapshotAgeMs, 25);
    assert.equal(f.broker.status().snapshot?.producer.scope, 'shared-process');
    assert.equal(f.broker.status().snapshot?.coverage.cpuAttribution, 'process-interval-not-exclusive-operation');
  });
  await check('new capture invalidates old report rather than making old bytes fresh', async () => {
    const f = new Fixture(); const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); await read;
    assert.notEqual(f.broker.status().snapshot, null);
    const start = f.broker.start(f.request()); const frame = f.startFrame(); f.active(frame.captureId); f.result(frame); await start;
    assert.equal(f.broker.status().snapshot, null); assert.equal(f.broker.status().snapshotAgeMs, null);
  });
  await check('all-revoked read cannot publish cache or clear pending cleanup uncertainty', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000); await start;
    const read = f.broker.read({ actor: f.agent }); const request = f.readFrame(); f.actorCurrent = false;
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive(); f.snapshot(request.controlId);
    failed(await read, 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    assert.equal(f.broker.status().snapshot, null); assert.notEqual(f.broker.status().cancellation, 'none');
  });
  await check('queued reader authority is checked again before dispatch', async () => {
    const f = new Fixture({ hold: true }); const read = f.broker.read({ actor: f.agent });
    f.actorCurrent = false; f.flushOne();
    failed(await read, 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED'); assert.equal(f.outbound.length, 1);
  });
  await check('read timeout does not cancel or stop capture and cannot become fresh later', async () => {
    const f = new Fixture(); const read = f.broker.read({ actor: f.agent }); const frame = f.readFrame(); f.clock.advance(5000);
    failed(await read, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT'); f.snapshot(frame.controlId);
    assert.equal(f.broker.status().snapshot, null); assert.equal(f.broker.status().cancellation, 'none');
  });
  await check('throwing authority callback fails closed with no private error in status', async () => {
    const f = new Fixture(); const actor: NativeBrokerActor = { kind: 'agent', id: 'actor_throw_01', isCurrent() { throw new Error('PRIVATE_AUTH_SECRET'); } };
    failed(await f.broker.start(f.request(actor)), 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    const serialized = JSON.stringify(f.broker.status());
    for (const secret of [binding.nonce, binding.epoch, actor.id, 'PRIVATE_AUTH_SECRET']) assert(!serialized.includes(secret));
  });
  await check('revoked caller cannot retrieve previously authorized cached native evidence', async () => {
    const f = new Fixture(); const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); await read;
    assert.notEqual(f.broker.status().snapshot, null); f.actorCurrent = false;
    const result = await f.broker.start(f.request()); failed(result, 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    assert.equal(result.status.native, null); assert.equal(result.status.snapshot, null);
    assert.equal(result.status.unavailableReason, 'authority-revoked'); assert.equal(result.status.pending, null);
  });
  await check('clock faults preserve explicit unknown snapshot age without leaking exceptions', async () => {
    const f = new Fixture(); f.clockThrows = true;
    const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); assert.equal((await read).ok, true);
    assert.equal(f.broker.status().snapshotAgeMs, null); assert(!JSON.stringify(f.broker.status()).includes('PRIVATE_CLOCK'));
  });
  await check('disconnect retires pending work and saved callbacks cannot reactivate it', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame();
    const listeners = [...f.inbound]; f.disconnect(); failed(await start, 'NATIVE_PERFORMANCE_RETIRED');
    const encoded = f.hostWire.encode({ type: 'result', controlId: frame.controlId, captureId: frame.captureId,
      result: { ok: true, status: { ...f.native, captureId: frame.captureId, collectionActive: true } } });
    if (!encoded.ok) throw new Error('FIXTURE_LATE_RESULT_INVALID');
    for (const listener of listeners) listener(encoded.text);
    assert.equal(f.broker.status().availability, 'retired'); assert.equal(f.broker.status().captureOwned, false);
    assert.equal(f.inbound.size, 0); assert.equal(f.disconnected.size, 0); assert.equal(f.clock.tasks.size, 0);
  });
  await check('explicit retirement settles coalesced readers and is idempotent', async () => {
    const f = new Fixture(); const first = f.broker.read({ actor: f.agent }); const second = f.broker.read({ actor: f.agent });
    f.broker.retire('backend-exit'); f.broker.retire('backend-exit');
    failed(await first, 'NATIVE_PERFORMANCE_RETIRED'); failed(await second, 'NATIVE_PERFORMANCE_RETIRED');
    assert.equal(f.broker.status().lastRefreshOutcome, 'retired'); assert.equal(f.clock.tasks.size, 0);
  });
  await check('send exception is a retired failure rather than execution success', async () => {
    const f = new Fixture(); f.failSend = true;
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_RETIRED');
    assert.equal(f.broker.status().availability, 'retired');
    assert(!JSON.stringify(f.broker.status()).includes('PRIVATE_SEND_SECRET'));
  });
  await check('disposed producer is unavailable without creating false orphan cleanup state', async () => {
    const f = new Fixture({ native: { disposed: true } });
    assert.equal(f.broker.status().availability, 'unavailable'); assert.equal(f.broker.status().orphaned, false);
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_UNAVAILABLE');
  });
  await check('timer setter failure retires pending control without throwing into caller', async () => {
    const f = new Fixture(); f.clock.throwSet = true;
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_RETIRED');
    assert.equal(f.broker.status().pending, null);
  });
  await check('synchronous timer callback fails closed before physical start', async () => {
    const f = new Fixture(); f.clock.synchronous = true;
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_RETIRED');
    assert.equal(f.outbound.filter(value => value.type === 'start').length, 0);
  });
  await check('timer cleanup failure is terminal and stale physical callbacks are fenced', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.throwClear = true;
    f.active(frame.captureId); f.result(frame); failed(await start, 'NATIVE_PERFORMANCE_RETIRED');
    assert.equal(f.broker.status().timerCleanupUnconfirmed, true);
    const sent = f.outbound.length; f.clock.advance(10000); assert.equal(f.outbound.length, sent);
  });
  await check('generated IDs remain bounded and distinct for a maximum-length backend identity', async () => {
    const f = new Fixture({ backendId: 'b'.repeat(128) });
    const start = f.broker.start(f.request()); const frame = f.startFrame();
    assert(frame.controlId.length <= 128); assert(frame.captureId.length <= 128); assert.notEqual(frame.controlId, frame.captureId);
    f.active(frame.captureId); f.result(frame); await start;
    const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId }); const stopFrame = f.stopFrame();
    assert.notEqual(stopFrame.controlId, frame.controlId); f.inactive(); f.result(stopFrame); await stop;
  });
  await check('disconnect during sender construction cannot resurrect readiness or add timers', () => {
    const clock = new Clock(); let messages = 0, releases = 0;
    const channel: NativePerformanceEndpoint = {
      isConnected: () => true, send: (_raw, callback) => { callback(null); return true; },
      onMessage: () => { messages++; return () => undefined; },
      onDisconnect: listener => { listener(); return () => { releases++; }; },
    };
    const broker = createNativePerformanceBroker({ backendInstanceId: backendId, binding, channel, now: () => clock.now, timers: clock });
    assert.equal(broker.status().availability, 'retired'); assert.equal(messages, 0);
    assert.equal(clock.tasks.size, 0); assert.equal(releases, 1);
  });
  await check('disconnect during broker subscription releases newly returned listener', () => {
    const clock = new Clock(); let disconnects = 0, releases = 0, sends = 0;
    const channel: NativePerformanceEndpoint = {
      isConnected: () => true, send: (_raw, callback) => { sends++; callback(null); return true; },
      onMessage: () => () => { releases++; },
      onDisconnect: listener => {
        disconnects++; if (disconnects === 2) listener();
        return () => { releases++; };
      },
    };
    const broker = createNativePerformanceBroker({ backendInstanceId: backendId, binding, channel, now: () => clock.now, timers: clock });
    assert.equal(broker.status().availability, 'retired'); assert.equal(clock.tasks.size, 0);
    assert.equal(releases, 3); assert.equal(sends, 0);
  });
  await check('invalid returned timer handle is fenced and cannot leave a control waiting', async () => {
    const f = new Fixture(); const original = f.clock.set;
    f.clock.set = (callback, delay) => { original(callback, delay); return undefined; };
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_RETIRED');
    assert.equal(f.broker.status().timerCleanupUnconfirmed, true);
    const count = f.outbound.length; f.clock.advance(10000); assert.equal(f.outbound.length, count);
  });
  await check('admitted failed start retains original actor cleanup authority without granting a lease', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame();
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive(true);
    f.result(frame, 'NATIVE_PERFORMANCE_START_FAILED');
    failed(await start, 'NATIVE_PERFORMANCE_START_FAILED'); assert.equal(f.broker.status().captureOwned, false);
    assert.equal(f.broker.status().orphaned, false);
    const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId });
    const stopFrame = f.stopFrame(); f.inactive(); f.result(stopFrame);
    assert.equal((await stop).ok, true);
  });
  await check('failed admitted cleanup cannot be taken by a foreign or revoked agent', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame();
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive(true);
    f.result(frame, 'NATIVE_PERFORMANCE_START_FAILED'); await start;
    failed(await f.broker.stop({ ...f.request(f.other), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    f.actorCurrent = false;
    failed(await f.broker.stop({ ...f.request(), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
    assert.equal(f.outbound.filter(value => value.type === 'stop').length, 0);
  });
  await check('clean admitted start failure permits another authorized capture without reconciliation', async () => {
    const f = new Fixture(); const first = f.broker.start(f.request()); const old = f.startFrame();
    f.native = { ...f.native, captureId: old.captureId }; f.inactive();
    f.result(old, 'NATIVE_PERFORMANCE_START_FAILED'); failed(await first, 'NATIVE_PERFORMANCE_START_FAILED');
    const second = f.broker.start(f.request(f.other)); const next = f.startFrame();
    assert.notEqual(next.captureId, old.captureId); f.active(next.captureId); f.result(next);
    assert.equal((await second).ok, true);
  });
  await check('fresh clean cancellation observation preserves exact known actor for idempotent Stop', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); const frame = f.startFrame();
    f.clock.advance(5000); await start;
    f.native = { ...f.native, captureId: frame.captureId }; f.inactive();
    const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); await read;
    const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId });
    const stopFrame = f.stopFrame(); f.result(stopFrame); assert.equal((await stop).ok, true);
  });
  await check('broker retirement notice is once after fencing and callback exceptions cannot escape', async () => {
    const holder: { fixture?: Fixture } = {};
    const observed: Array<{ reason: NativeBrokerRetireReason; availability: string; pending: string | null }> = [];
    const f = new Fixture({ onRetire: reason => {
      const current = holder.fixture; if (!current) throw new Error('FIXTURE_RETIRE_HOLDER_MISSING');
      observed.push({ reason, availability: current.broker.status().availability, pending: current.broker.status().pending });
      current.broker.retire('disposed'); throw new Error('PRIVATE_RETIRE_CALLBACK');
    } });
    holder.fixture = f;
    const read = f.broker.read({ actor: f.agent }); f.broker.retire('backend-exit');
    failed(await read, 'NATIVE_PERFORMANCE_RETIRED'); f.broker.retire('stopped');
    assert.deepEqual(observed, [{ reason: 'backend-exit', availability: 'retired', pending: null }]);
    assert.equal(f.inbound.size + f.disconnected.size, 0);
  });
  await check('transport send failure notifies broker retirement once without execution success', async () => {
    const reasons: NativeBrokerRetireReason[] = [];
    const f = new Fixture({ onRetire: reason => { reasons.push(reason); } }); f.failSend = true;
    failed(await f.broker.start(f.request()), 'NATIVE_PERFORMANCE_RETIRED');
    f.broker.retire('stopped'); assert.deepEqual(reasons, ['send-failed']);
  });
  await check('constructor retirement callback is exception-contained and delivered exactly once', () => {
    const clock = new Clock(); const reasons: NativeBrokerRetireReason[] = [];
    const channel: NativePerformanceEndpoint = {
      isConnected: () => true, send: (_raw, callback) => { callback(null); return true; },
      onMessage: () => () => undefined,
      onDisconnect: listener => { listener(); return () => undefined; },
    };
    const options = { backendInstanceId: backendId, binding, channel, now: () => clock.now, timers: clock,
      onRetire: (reason: NativeBrokerRetireReason) => { reasons.push(reason); throw new Error('PRIVATE_CONSTRUCTOR_NOTICE'); } };
    const broker = createNativePerformanceBroker(options); broker.retire('stopped');
    assert.deepEqual(reasons, ['send-failed']); assert.equal(broker.status().availability, 'retired');
    assert.equal(clock.tasks.size, 0);
  });
  await check('unavailable broker explicit retirement notice is bounded and does not allocate work', () => {
    const clock = new Clock(); const reasons: NativeBrokerRetireReason[] = [];
    const options = { backendInstanceId: backendId, now: () => clock.now, timers: clock,
      onRetire: (reason: NativeBrokerRetireReason) => { reasons.push(reason); } };
    const broker = createNativePerformanceBroker(options); broker.retire('stopped'); broker.retire('disposed');
    assert.deepEqual(reasons, ['stopped']); assert.equal(clock.tasks.size, 0);
  });
  await check('actor IDs preserve every UTF-16 code unit and existing length boundaries', async () => {
    const clock = new Clock();
    const broker = createNativePerformanceBroker({ backendInstanceId: backendId, now: () => clock.now, timers: clock });
    const readId = (id: string) => broker.read({ actor: { kind: 'agent', id, isCurrent: () => true } });
    try {
      for (let unit = 0; unit <= 0xffff; unit++) {
        failed(await readId(`actor_${String.fromCharCode(unit)}_fixture`), unit <= 0x1f || unit === 0x7f
          ? 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED' : 'NATIVE_PERFORMANCE_UNAVAILABLE');
      }
      for (const id of ['a', ' ', 'a'.repeat(256)]) failed(await readId(id), 'NATIVE_PERFORMANCE_UNAVAILABLE');
      for (const id of ['', 'a'.repeat(257)]) failed(await readId(id), 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED');
      assert.equal(broker.status().availability, 'unavailable');
      assert.equal(clock.sequence, 0); assert.equal(clock.tasks.size, 0);
    } finally { broker.retire(); }
  });
  checks.push(...(await runNativePerformanceBrokerOwnershipSelftest()).checks);
  return { pass: checks.every(result => result.pass), passed: checks.filter(result => result.pass).length, total: checks.length, checks };
}

/** Relative public ownership must reuse the broker's real stop-owner records. */
export async function runNativePerformanceBrokerOwnershipSelftest() {
  type Ownership = 'none' | 'self' | 'other' | 'operator';
  type ProjectedBroker = NativePerformanceBroker & { ownership(actor: NativeBrokerActor): Ownership };
  const probe = new Fixture();
  const available = typeof (probe.broker as Partial<ProjectedBroker>).ownership === 'function'; probe.broker.retire();
  const checks: Array<{ name: string; pass: boolean; detail?: string; blocked?: boolean }> = [];
  const check = async (name: string, work: () => void | Promise<void>, prerequisite = true) => {
    if (prerequisite && !available) {
      checks.push({ name, pass: false, blocked: true, detail: 'BLOCKED: trusted relative-ownership projection absent; behavior not exercised.' }); return;
    }
    try { await work(); checks.push({ name, pass: true }); }
    catch (error) { checks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) }); }
  };
  const ownership = (f: Fixture, actor: NativeBrokerActor) => (f.broker as ProjectedBroker).ownership(actor);
  await check('native relative-ownership prerequisite exists (absence is not a runtime defect)', () => assert.equal(available, true), false);
  await check('native idle broker has no relative owner for agent or operator', () => {
    const f = new Fixture(); try {
      for (const actor of [f.agent, f.other, f.studio]) assert.equal(ownership(f, actor), 'none');
      assert.equal(f.broker.status().captureOwned, false);
    } finally { f.broker.retire(); }
  });
  await check('native active global lease projects self, other and trusted operator separately', async () => {
    const { f } = await activeFixture(); try {
      assert.equal(f.broker.status().captureOwned, true); assert.equal(ownership(f, f.agent), 'self');
      assert.equal(ownership(f, f.other), 'other'); assert.equal(ownership(f, f.studio), 'operator');
    } finally { f.broker.retire(); }
  });
  await check('native ownership matches both actor kind and ID rather than a caller string', async () => {
    const f = new Fixture(); try {
      const start = f.broker.start(f.request(f.studio)); const frame = f.startFrame(); f.active(frame.captureId); f.result(frame); await start;
      const agentWithStudioId: NativeBrokerActor = { kind: 'agent', id: f.studio.id, isCurrent: () => true };
      assert.equal(ownership(f, agentWithStudioId), 'other');
      failed(await f.broker.stop({ ...f.request(agentWithStudioId), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    } finally { f.broker.retire(); }
  });
  await check('native revoked or throwing authority has no ownership even with a retained lease', async () => {
    const { f } = await activeFixture(); try {
      f.actorCurrent = false; assert.equal(ownership(f, f.agent), 'none'); assert.equal(f.broker.status().captureOwned, true);
      assert.equal(ownership(f, { ...f.agent, isCurrent() { throw new Error('PRIVATE_OWNERSHIP_AUTHORITY'); } }), 'none');
      assert.equal(ownership(f, { ...f.agent, id: '' }), 'none');
    } finally { f.broker.retire(); }
  });
  await check('native clean matching history retains original agent idempotent Stop ownership', async () => {
    const { f, frame } = await activeFixture(); try {
      const stop = f.broker.stop({ ...f.request(), captureId: frame.captureId }); const stopped = f.stopFrame(); f.inactive(); f.result(stopped); await stop;
      assert.equal(f.broker.status().captureOwned, false); assert.equal(ownership(f, f.agent), 'self');
      assert.equal(ownership(f, f.other), 'other'); assert.equal(ownership(f, f.studio), 'operator');
      failed(await f.broker.stop({ ...f.request(f.other), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    } finally { f.broker.retire(); }
  });
  await check('native operator Stop transfers matching idempotent history to its actual stop owner', async () => {
    const { f, frame } = await activeFixture(); try {
      const stop = f.broker.stop({ ...f.request(f.studio), captureId: frame.captureId }); const stopped = f.stopFrame(); f.inactive(); f.result(stopped); await stop;
      assert.equal(ownership(f, f.agent), 'other'); assert.equal(ownership(f, f.studio), 'operator');
      failed(await f.broker.stop({ ...f.request(), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    } finally { f.broker.retire(); }
  });
  await check('native timed-out unACKed start exposes exact cancellation owner without a capture lease', async () => {
    const f = new Fixture(); try {
      const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000);
      failed(await start, 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT'); assert.equal(f.native.captureId, null);
      assert.equal(f.broker.status().captureOwned, false); assert.notEqual(f.broker.status().cancellation, 'none');
      assert.equal(ownership(f, f.agent), 'self'); assert.equal(ownership(f, f.other), 'other'); assert.equal(ownership(f, f.studio), 'operator');
      failed(await f.broker.stop({ ...f.request(f.other), captureId: frame.captureId }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    } finally { f.broker.retire(); }
  });
  await check('native clean cancellation reconciliation retains known history for relative ownership', async () => {
    const f = new Fixture(); try {
      const start = f.broker.start(f.request()); const frame = f.startFrame(); f.clock.advance(5000); await start;
      f.native = { ...f.native, captureId: frame.captureId }; f.inactive();
      const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); await read;
      assert.equal(f.broker.status().cancellation, 'none'); assert.equal(ownership(f, f.agent), 'self'); assert.equal(ownership(f, f.other), 'other');
    } finally { f.broker.retire(); }
  });
  await check('native failed admitted start cleanup projects its exact owner without pretending a lease', async () => {
    const f = new Fixture(); try {
      const start = f.broker.start(f.request()); const frame = f.startFrame(); f.native = { ...f.native, captureId: frame.captureId }; f.inactive(true);
      f.result(frame, 'NATIVE_PERFORMANCE_START_FAILED'); failed(await start, 'NATIVE_PERFORMANCE_START_FAILED');
      assert.equal(f.broker.status().captureOwned, false); assert.equal(ownership(f, f.agent), 'self'); assert.equal(ownership(f, f.other), 'other');
    } finally { f.broker.retire(); }
  });
  await check('native unknown orphan capture belongs to neither agent and permits only trusted operator targeting', async () => {
    const f = new Fixture({ native: { captureId: 'orphan_capture_owner_01', collectionActive: true, ownedTimerCount: 2 } }); try {
      assert.equal(f.broker.status().orphaned, true); assert.equal(f.broker.status().captureOwned, false);
      assert.equal(ownership(f, f.agent), 'other'); assert.equal(ownership(f, f.other), 'other'); assert.equal(ownership(f, f.studio), 'operator');
      failed(await f.broker.stop({ ...f.request(), captureId: 'orphan_capture_owner_01' }), 'NATIVE_PERFORMANCE_NOT_OWNER');
    } finally { f.broker.retire(); }
  });
  await check('native replacement capture invalidates old known-owner projection', async () => {
    const { f } = await activeFixture(); try {
      f.native = { ...f.native, captureId: 'foreign_capture_owner_01' };
      const read = f.broker.read({ actor: f.agent }); f.snapshot(f.readFrame().controlId); await read;
      assert.equal(f.broker.status().captureOwned, false); assert.equal(ownership(f, f.agent), 'other');
    } finally { f.broker.retire(); }
  });
  await check('native ownership preserves admitted primitive owner identity despite later actor mutation', async () => {
    const f = new Fixture(); try {
      const actor: NativeBrokerActor = { kind: 'agent', id: 'private_immutable_original', isCurrent: () => true };
      const original = { ...actor }; const start = f.broker.start(f.request(actor)); const frame = f.startFrame(); actor.id = 'private_mutated_owner';
      f.active(frame.captureId); f.result(frame); await start;
      assert.equal(ownership(f, original), 'self'); assert.equal(ownership(f, actor), 'other');
    } finally { f.broker.retire(); }
  });
  await check('native retired broker cannot advertise live self or operator control ownership', async () => {
    const { f } = await activeFixture(); f.broker.retire('backend-exit');
    for (const actor of [f.agent, f.other, f.studio]) assert.equal(ownership(f, actor), 'none');
    assert.equal(f.broker.status().availability, 'retired'); assert.equal(f.broker.status().captureOwned, false);
  });
  await check('native retired cleanup-unknown keeps uncertainty while withholding controllable ownership', async () => {
    const f = new Fixture(); const start = f.broker.start(f.request()); f.startFrame(); f.broker.retire('backend-exit');
    failed(await start, 'NATIVE_PERFORMANCE_RETIRED'); assert.equal(f.broker.status().cancellation, 'unknown');
    assert.equal(f.broker.status().cleanupUnconfirmed, true);
    for (const actor of [f.agent, f.other, f.studio]) assert.equal(ownership(f, actor), 'none');
  });
  await check('native relative projection serializes only its enum and never actor or channel secrets', async () => {
    const { f } = await activeFixture(); try {
      const serialized = JSON.stringify({ ownership: ownership(f, f.agent), status: f.broker.status() });
      for (const secret of [f.agent.id, f.other.id, f.studio.id, binding.nonce, binding.epoch]) assert(!serialized.includes(secret));
    } finally { f.broker.retire(); }
  });
  return { pass: checks.every(result => result.pass), passed: checks.filter(result => result.pass).length, total: checks.length, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void (process.argv.includes('--native-ownership-selftest') ? runNativePerformanceBrokerOwnershipSelftest() : runNativePerformanceBrokerSelftest()).then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.pass) process.exitCode = 1;
  }).catch(error => { process.stderr.write((error instanceof Error ? error.message : 'SELFTEST_FAILED') + '\n'); process.exitCode = 1; });
}
