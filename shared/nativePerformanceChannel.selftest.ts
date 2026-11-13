import assert from 'node:assert/strict';
import {
  createNativePerformanceSendQueue, NATIVE_PERFORMANCE_TRANSPORT_LIMITS,
  createNativePerformanceRetirementNotice, isNativePerformanceRetirementNotice,
  type NativePerformanceEndpoint, type NativePerformanceSendItem, type NativePerformanceSendQueue,
} from './nativePerformanceChannel';
import { NATIVE_PERFORMANCE_LIMITS } from './nativePerformanceProtocol';

function endpoint() {
  const sent: string[] = [], callbacks: Array<(error: Error | null) => void> = [];
  const disconnects = new Set<() => void>();
  const state: { connected: boolean; writable: boolean; synchronous: boolean; error: boolean; onSend?: () => void } = {
    connected: true, writable: true, synchronous: false, error: false,
  };
  const channel: NativePerformanceEndpoint = {
    isConnected: () => state.connected,
    send(frame, callback) {
      sent.push(frame); callbacks.push(callback); state.onSend?.();
      if (state.synchronous) callback(state.error ? new Error('PRIVATE_ENDPOINT_ERROR') : null);
      return state.writable;
    },
    onMessage: () => () => undefined,
    onDisconnect(listener) { disconnects.add(listener); return () => { disconnects.delete(listener); }; },
  };
  return {
    channel, state, sent, callbacks, disconnects,
    disconnect() { state.connected = false; for (const listener of [...disconnects]) listener(); },
    complete(index = 0, error: Error | null = null) { callbacks[index](error); },
  };
}
const item = (id: string, onComplete?: (error: Error | null) => void): NativePerformanceSendItem => ({ id, frame: id, kind: 'control', onComplete });
const snapshot = (id: string, onComplete?: (error: Error | null) => void): NativePerformanceSendItem => ({ id, frame: id, kind: 'snapshot', onComplete });

export function runNativePerformanceChannelSelftest() {
  const checks: Array<{ name: string; pass: boolean }> = [];
  const check = (name: string, run: () => void) => {
    try { run(); checks.push({ name, pass: true }); } catch { checks.push({ name, pass: false }); }
  };
  const binding = { nonce: 'a'.repeat(64), epoch: 'native_epoch_one' };
  check('owned retirement notice roundtrips IPC serialization with only fixed lifecycle fields', () => {
    const notice = createNativePerformanceRetirementNotice(binding);
    assert(Object.isFrozen(notice));
    assert.deepEqual(Object.keys(notice).sort(), ['epoch', 'nonce', 'type']);
    assert(isNativePerformanceRetirementNotice(JSON.parse(JSON.stringify(notice)), binding));
    assert(Buffer.byteLength(JSON.stringify(notice)) <= NATIVE_PERFORMANCE_LIMITS.maxControlBytes);
  });
  check('retirement rejects a foreign parent nonce', () => {
    assert.equal(isNativePerformanceRetirementNotice(createNativePerformanceRetirementNotice(binding), { ...binding, nonce: 'b'.repeat(64) }), false);
  });
  check('late retirement from an old epoch cannot identify the replacement', () => {
    assert.equal(isNativePerformanceRetirementNotice(createNativePerformanceRetirementNotice(binding), { ...binding, epoch: 'native_epoch_two' }), false);
  });
  check('retirement does not claim parent-loss objects or telemetry frame strings', () => {
    assert.equal(isNativePerformanceRetirementNotice({ type: 'x4forge-parent-lost', nonce: binding.nonce }, binding), false);
    assert.equal(isNativePerformanceRetirementNotice(JSON.stringify(createNativePerformanceRetirementNotice(binding)), binding), false);
  });
  check('retirement rejects extra owner ACK success and capture fields', () => {
    for (const extra of ['owner', 'ok', 'captureId', 'controlId']) {
      assert.equal(isNativePerformanceRetirementNotice({ ...createNativePerformanceRetirementNotice(binding), [extra]: true }, binding), false);
    }
  });
  check('retirement rejects symbolic fields and incomplete inherited identities', () => {
    assert.equal(isNativePerformanceRetirementNotice({ ...createNativePerformanceRetirementNotice(binding), [Symbol('extra')]: 1 }, binding), false);
    assert.equal(isNativePerformanceRetirementNotice(Object.create(createNativePerformanceRetirementNotice(binding)), binding), false);
  });
  check('retirement never invokes an incoming field accessor', () => {
    let reads = 0;
    const raw = { type: 'x4forge-native-leg-retired', epoch: binding.epoch,
      get nonce() { reads++; throw new Error('PRIVATE_GETTER'); } };
    assert.equal(isNativePerformanceRetirementNotice(raw, binding), false);
    assert.equal(reads, 0);
  });
  check('retirement rejects nonenumerable identities and throwing reflection without propagating', () => {
    const raw = { ...createNativePerformanceRetirementNotice(binding) };
    Object.defineProperty(raw, 'nonce', { value: binding.nonce, enumerable: false });
    assert.equal(isNativePerformanceRetirementNotice(raw, binding), false);
    assert.equal(isNativePerformanceRetirementNotice(new Proxy({}, { ownKeys() { throw new Error('PRIVATE_PROXY'); } }), binding), false);
  });
  check('retirement rejects malformed shapes and oversized mismatched identity strings', () => {
    for (const raw of [null, undefined, 0, [], true, {}, { type: 'x4forge-native-leg-retired' },
      { type: 'x4forge-native-leg-retired', nonce: 'a'.repeat(10000), epoch: binding.epoch }]) {
      assert.equal(isNativePerformanceRetirementNotice(raw, binding), false);
    }
  });
  check('retirement builder refuses invalid private bindings without producing a notice', () => {
    for (const bad of [{ nonce: 'wrong', epoch: binding.epoch }, { nonce: binding.nonce, epoch: 'x' }]) {
      assert.throws(() => createNativePerformanceRetirementNotice(bad), /NATIVE_RETIREMENT_BINDING_INVALID/);
      assert.equal(isNativePerformanceRetirementNotice(createNativePerformanceRetirementNotice(binding), bad), false);
    }
  });
  check('fixed deadlines and slots are frozen without load admission thresholds', () => {
    assert.deepEqual(NATIVE_PERFORMANCE_TRANSPORT_LIMITS, {
      readyMs: 5000, controlMs: 5000, cancelMs: 5000, readers: 16, queuedControls: 2, queuedSnapshot: 1, inFlight: 1,
    });
    assert(Object.isFrozen(NATIVE_PERFORMANCE_TRANSPORT_LIMITS));
  });
  check('idle sender owns one disconnect listener and zero pending slots', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    assert.equal(f.disconnects.size, 1); assert.equal(q.status().inFlight, 0); assert.equal(q.status().queuedControls, 0);
    assert.equal(q.status().queuedSnapshot, 0); assert.equal(q.status().accepted, 0); q.retire(); assert.equal(f.disconnects.size, 0);
  });
  check('asynchronous completion releases one slot once', () => {
    const f = endpoint(), results: Array<Error | null> = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    assert(q.enqueue(item('one', error => results.push(error)))); assert.equal(q.status().inFlight, 1);
    f.complete(); assert.deepEqual(results, [null]); assert.equal(q.status().inFlight, 0); assert.equal(q.status().completed, 1); q.retire();
  });
  check('false underlying send remains in flight and never retransmits', () => {
    const f = endpoint(); f.state.writable = false;
    const q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one')); q.enqueue(item('two'));
    assert.deepEqual(f.sent, ['one']); assert.equal(q.status().backpressure, 1); assert.equal(q.status().inFlight, 1);
    f.complete(); assert.deepEqual(f.sent, ['one', 'two']); assert.equal(q.status().backpressure, 2); q.retire();
  });
  check('duplicate transport callbacks cannot complete or dispatch twice', () => {
    const f = endpoint(), results: Array<Error | null> = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one', error => results.push(error))); q.enqueue(item('two')); f.complete(); f.complete();
    assert.deepEqual(results, [null]); assert.deepEqual(f.sent, ['one', 'two']); assert.equal(q.status().completed, 1); q.retire();
  });
  check('synchronous callback reentrancy sends after the first physical call returns', () => {
    const f = endpoint(), order: string[] = []; f.state.synchronous = true;
    const originalSend = f.channel.send;
    f.channel.send = (frame, callback) => { order.push(`enter_${frame}`); const result = originalSend(frame, callback); order.push(`exit_${frame}`); return result; };
    const q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one', () => { q.enqueue(item('two')); }));
    assert.deepEqual(order, ['enter_one', 'exit_one', 'enter_two', 'exit_two']); assert.equal(q.status().completed, 2); q.retire();
  });
  check('synchronous callback plus false return is completion without a resend', () => {
    const f = endpoint(); f.state.synchronous = true; f.state.writable = false;
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    assert.deepEqual(f.sent, ['one']); assert.equal(q.status().completed, 1); assert.equal(q.status().backpressure, 1); assert.equal(q.status().inFlight, 0); q.retire();
  });
  check('synchronous error retires transport and reports only a fixed error', () => {
    const f = endpoint(); f.state.synchronous = true; f.state.error = true;
    const failures: string[] = [], completions: string[] = [];
    const q = createNativePerformanceSendQueue({ channel: f.channel, onFailure: error => failures.push(error.message) });
    q.enqueue(item('one', error => completions.push(error?.message ?? 'ok')));
    assert.equal(q.status().retired, true); assert.deepEqual(failures, ['NATIVE_SEND_FAILED']);
    assert.deepEqual(completions, ['NATIVE_SEND_RETIRED']); assert.equal(q.enqueue(item('two')), false);
  });
  check('throwing physical send is caught and completes once', () => {
    const f = endpoint(); f.channel.send = () => { throw new Error('PRIVATE_SEND_FAILURE'); };
    const results: Array<Error | null> = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    assert.doesNotThrow(() => q.enqueue(item('one', error => results.push(error)))); assert.equal(results.length, 1);
    assert.equal(q.status().retired, true); assert.equal(q.status().failures, 1);
  });
  check('callback success followed by a send exception never rewrites prior completion', () => {
    const f = endpoint(), results: Array<Error | null> = [];
    f.channel.send = (_frame, callback) => { callback(null); throw new Error('PRIVATE_AFTER_CALLBACK'); };
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one', error => results.push(error)));
    assert.deepEqual(results, [null]); assert.equal(q.status().retired, true); assert.equal(q.status().completed, 1);
  });
  check('invalid physical return fails closed instead of guessing delivery', () => {
    const f = endpoint(); Object.defineProperty(f.channel, 'send', { value: () => undefined });
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    assert.equal(q.status().retired, true); assert.equal(q.status().failures, 1);
  });
  check('disconnect drains all bounded slots and removes listener once', () => {
    const f = endpoint(), results: string[] = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one', () => results.push('one'))); q.enqueue(item('two', () => results.push('two')));
    q.enqueue(snapshot('three', () => results.push('three'))); f.disconnect(); f.disconnect();
    assert.deepEqual(results, ['one', 'two', 'three']); assert.equal(q.status().completed, 3); assert.equal(f.disconnects.size, 0);
    assert.equal(q.status().inFlight + q.status().queuedControls + q.status().queuedSnapshot, 0);
  });
  check('late callbacks after retirement cannot flush queued work', () => {
    const f = endpoint(), results: Array<Error | null> = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one', error => results.push(error))); q.enqueue(item('two')); q.retire(); f.complete(); f.complete(0, new Error('PRIVATE_LATE_ERROR'));
    assert.equal(results.length, 1); assert(results[0] instanceof Error); assert.deepEqual(f.sent, ['one']); assert.equal(q.status().failures, 0);
  });
  check('explicit retirement is idempotent and does not report transport failure', () => {
    const f = endpoint(), failures: Error[] = [], q = createNativePerformanceSendQueue({ channel: f.channel, onFailure: error => failures.push(error) });
    q.enqueue(item('one')); q.retire(); q.retire(); assert.equal(q.status().completed, 1); assert.equal(failures.length, 0); assert.equal(f.disconnects.size, 0);
  });
  check('saved disconnect listener is inert after explicit retirement', () => {
    const f = endpoint(), failures: Error[] = [], q = createNativePerformanceSendQueue({ channel: f.channel, onFailure: error => failures.push(error) });
    const saved = [...f.disconnects]; q.retire(); for (const listener of saved) listener();
    assert.equal(q.status().failures, 0); assert.equal(failures.length, 0); assert.equal(q.status().retired, true);
  });
  check('one in-flight plus two queued controls and one snapshot is the hard bound', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    for (const id of ['one', 'two', 'three']) assert(q.enqueue(item(id)));
    assert(q.enqueue(snapshot('four'))); assert.equal(q.enqueue(item('five')), false);
    assert.equal(q.status().inFlight, 1); assert.equal(q.status().queuedControls, 2); assert.equal(q.status().queuedSnapshot, 1);
    assert.equal(q.status().accepted, 4); assert.equal(q.status().rejected, 1); q.retire();
  });
  check('overflow refusal leaves the existing snapshot intact', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one')); q.enqueue(item('two')); q.enqueue(item('three')); q.enqueue(snapshot('four'));
    assert.equal(q.enqueue(item('five')), false); assert.equal(q.status().droppedSnapshots, 0);
    f.complete(0); f.complete(1); f.complete(2); assert.deepEqual(f.sent, ['one', 'two', 'three', 'four']); q.retire();
  });
  check('latest queued snapshot replaces exactly one prior snapshot', () => {
    const f = endpoint(), results: string[] = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one')); q.enqueue(snapshot('two', error => results.push(error?.message ?? 'ok'))); q.enqueue(snapshot('three'));
    assert.deepEqual(results, ['NATIVE_SEND_REPLACED']); assert.equal(q.status().queuedSnapshot, 1); assert.equal(q.status().droppedSnapshots, 1);
    f.complete(); assert.deepEqual(f.sent, ['one', 'three']); q.retire();
  });
  check('a later control drops the older snapshot before preserving control FIFO', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('seq_1')); q.enqueue(snapshot('seq_2')); q.enqueue(item('seq_3')); q.enqueue(snapshot('seq_4')); q.enqueue(item('seq_5')); q.enqueue(snapshot('seq_6'));
    f.complete(0); f.complete(1); f.complete(2);
    assert.deepEqual(f.sent, ['seq_1', 'seq_3', 'seq_5', 'seq_6']); assert.equal(q.status().droppedSnapshots, 2); q.retire();
  });
  check('queued control withdrawal proves unsent and preserves other FIFO work', () => {
    const f = endpoint(), results: string[] = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one')); q.enqueue(item('two', error => results.push(error?.message ?? 'ok'))); q.enqueue(item('three'));
    assert(q.withdraw('two')); assert.equal(q.withdraw('two'), false); f.complete();
    assert.deepEqual(results, ['NATIVE_SEND_WITHDRAWN']); assert.deepEqual(f.sent, ['one', 'three']); assert.equal(q.status().withdrawn, 1); q.retire();
  });
  check('queued snapshot withdrawal proves unsent', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one')); q.enqueue(snapshot('two'));
    assert(q.withdraw('two')); f.complete(); assert.deepEqual(f.sent, ['one']); assert.equal(q.status().queuedSnapshot, 0); q.retire();
  });
  check('in-flight and unknown withdrawal never claims unsent', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    assert.equal(q.withdraw('one'), false); assert.equal(q.withdraw('absent'), false); assert.equal(q.status().inFlight, 1); q.retire();
  });
  check('fresh delayed authority guard rejects stale work without retiring the queue', () => {
    const f = endpoint(), results: string[] = []; let current = true;
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    q.enqueue({ ...item('two', error => results.push(error?.message ?? 'ok')), canDispatch: () => current });
    q.enqueue(item('three')); current = false; f.complete();
    assert.deepEqual(f.sent, ['one', 'three']); assert.deepEqual(results, ['NATIVE_SEND_NOT_CURRENT']); assert.equal(q.status().retired, false); q.retire();
  });
  check('throwing dispatch guard fails closed without leaking its private error', () => {
    const f = endpoint(), results: string[] = [], q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue({ ...item('one', error => results.push(error?.message ?? 'ok')), canDispatch: () => { throw new Error('PRIVATE_GUARD_ERROR'); } });
    assert.deepEqual(f.sent, []); assert.deepEqual(results, ['NATIVE_SEND_NOT_CURRENT']); assert.equal(q.status().retired, false); q.retire();
  });
  check('endpoint getter side effects precede the last authority guard', () => {
    const f = endpoint(); let current = true;
    Object.defineProperty(f.channel, 'isConnected', { get() { current = false; return () => true; } });
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue({ ...item('one'), canDispatch: () => current });
    assert.deepEqual(f.sent, []); assert.equal(q.status().completed, 1); q.retire();
  });
  check('guard retirement cannot physically send the now-retired item', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue({ ...item('one'), canDispatch: () => { q.retire(); return true; } });
    assert.deepEqual(f.sent, []); assert.equal(q.status().retired, true); assert.equal(q.status().completed, 1);
  });
  check('onDispatch runs before send and can retire without physical dispatch', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue({ ...item('one'), onDispatch: () => { assert.equal(f.sent.length, 0); q.retire(); } });
    assert.deepEqual(f.sent, []); assert.equal(q.status().dispatched, 0); assert.equal(q.status().retired, true);
  });
  check('throwing onDispatch cannot send or escape', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    assert.doesNotThrow(() => q.enqueue({ ...item('one'), onDispatch: () => { throw new Error('PRIVATE_DISPATCH_ERROR'); } }));
    assert.deepEqual(f.sent, []); assert.equal(q.status().retired, true);
  });
  check('completion callback exception retires remaining work without duplicate callback', () => {
    const f = endpoint(); let calls = 0;
    const q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one', () => { calls++; throw new Error('PRIVATE_COMPLETION_ERROR'); })); q.enqueue(item('two')); f.complete(); f.complete();
    assert.equal(calls, 1); assert.equal(q.status().retired, true); assert.deepEqual(f.sent, ['one']); assert.equal(q.status().completed, 2);
  });
  check('onFailure exception is isolated and notified only once', () => {
    const f = endpoint(); let calls = 0;
    const q = createNativePerformanceSendQueue({ channel: f.channel, onFailure: () => { calls++; throw new Error('PRIVATE_FAILURE_HANDLER'); } });
    q.enqueue(item('one')); assert.doesNotThrow(() => f.complete(0, new Error('PRIVATE_PHYSICAL_FAILURE'))); f.disconnect();
    assert.equal(calls, 1); assert.equal(q.status().retired, true);
  });
  check('throwing send getter is a terminal transport error', () => {
    const f = endpoint(); Object.defineProperty(f.channel, 'send', { get() { throw new Error('PRIVATE_SEND_GETTER'); } });
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    assert.equal(q.status().retired, true); assert.deepEqual(f.sent, []);
  });
  check('throwing connected getter is a terminal transport error', () => {
    const f = endpoint(); Object.defineProperty(f.channel, 'isConnected', { get() { throw new Error('PRIVATE_CONNECTED_GETTER'); } });
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    assert.equal(q.status().retired, true); assert.deepEqual(f.sent, []);
  });
  check('disconnected endpoint is never physically sent', () => {
    const f = endpoint(); f.state.connected = false;
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    assert.equal(q.status().retired, true); assert.deepEqual(f.sent, []);
  });
  check('throwing disconnect subscription fails closed at construction', () => {
    const f = endpoint(); f.channel.onDisconnect = () => { throw new Error('PRIVATE_SUBSCRIPTION_ERROR'); };
    const q = createNativePerformanceSendQueue({ channel: f.channel }); assert.equal(q.status().retired, true); assert.equal(q.enqueue(item('one')), false);
  });
  check('synchronous disconnect during subscription cleans returned unsubscriber', () => {
    const f = endpoint(); let removed = 0;
    f.channel.onDisconnect = listener => { listener(); return () => { removed++; }; };
    const q = createNativePerformanceSendQueue({ channel: f.channel }); assert.equal(q.status().retired, true); assert.equal(removed, 1);
  });
  check('unsubscribe exception cannot escape explicit retirement', () => {
    const f = endpoint(); f.channel.onDisconnect = () => () => { throw new Error('PRIVATE_UNSUBSCRIBE_ERROR'); };
    const q = createNativePerformanceSendQueue({ channel: f.channel }); assert.doesNotThrow(() => q.retire()); assert.equal(q.status().retired, true);
  });
  check('throwing input getter rejects before accepting or sending', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel }), input = item('one');
    Object.defineProperty(input, 'frame', { get() { throw new Error('PRIVATE_ITEM_GETTER'); } });
    assert.equal(q.enqueue(input), false); assert.equal(q.status().accepted, 0); assert.deepEqual(f.sent, []); q.retire();
  });
  check('input getter retirement cannot enqueue onto the retired queue', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel }), input = item('one');
    Object.defineProperty(input, 'frame', { get() { q.retire(); return 'one'; } });
    assert.equal(q.enqueue(input), false); assert.deepEqual(f.sent, []); assert.equal(q.status().accepted, 0);
  });
  check('caller mutation cannot replace queued frame or authority function', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel }), input = { ...item('two'), canDispatch: () => true };
    q.enqueue(item('one')); q.enqueue(input); input.frame = 'PRIVATE_REPLACEMENT'; input.canDispatch = () => false; f.complete();
    assert.deepEqual(f.sent, ['one', 'two']); q.retire();
  });
  check('duplicate pending ID rejects without disturbing the accepted callback', () => {
    const f = endpoint(); let rejectedCallback = 0;
    const q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one')); q.enqueue(item('two'));
    assert.equal(q.enqueue(item('one', () => { rejectedCallback++; })), false); assert.equal(q.enqueue(snapshot('two')), false);
    assert.equal(rejectedCallback, 0); assert.equal(q.status().accepted, 2); q.retire();
  });
  check('invalid bounded IDs are rejected and exact maximum is accepted', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    for (const id of ['', 'a'.repeat(129), 'private/id', 'private id', 'private\n']) assert.equal(q.enqueue(item(id)), false);
    assert(q.enqueue(item('a'.repeat(128)))); assert.equal(q.status().accepted, 1); q.retire();
  });
  check('control UTF8 byte bound accepts exact size and rejects one extra byte', () => {
    const f = endpoint(); f.state.synchronous = true;
    const q = createNativePerformanceSendQueue({ channel: f.channel });
    assert(q.enqueue({ ...item('ascii'), frame: 'a'.repeat(NATIVE_PERFORMANCE_LIMITS.maxControlBytes) }));
    assert.equal(q.enqueue({ ...item('large'), frame: 'a'.repeat(NATIVE_PERFORMANCE_LIMITS.maxControlBytes + 1) }), false);
    assert(q.enqueue({ ...item('unicode'), frame: '😀'.repeat(NATIVE_PERFORMANCE_LIMITS.maxControlBytes / 4) }));
    assert.equal(q.enqueue({ ...item('unicode_large'), frame: '😀'.repeat(NATIVE_PERFORMANCE_LIMITS.maxControlBytes / 4) + 'a' }), false); q.retire();
  });
  check('snapshot byte bound is independent of the smaller control bound', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    assert(q.enqueue({ ...snapshot('one'), frame: 'a'.repeat(NATIVE_PERFORMANCE_LIMITS.maxFrameBytes) }));
    assert.equal(q.enqueue({ ...snapshot('two'), frame: 'a'.repeat(NATIVE_PERFORMANCE_LIMITS.maxFrameBytes + 1) }), false);
    assert.equal(q.enqueue({ ...item('three'), frame: '' }), false); q.retire();
  });
  check('reentrant snapshot replacement preserves the newest work only', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue(item('one')); q.enqueue(snapshot('two', () => { q.enqueue(snapshot('four')); })); q.enqueue(snapshot('three'));
    f.complete(); assert.deepEqual(f.sent, ['one', 'four']); assert.equal(q.status().droppedSnapshots, 2); q.retire();
  });
  check('guard can withdraw another queued item without dispatching it', () => {
    const f = endpoint(); let q: NativePerformanceSendQueue;
    q = createNativePerformanceSendQueue({ channel: f.channel }); q.enqueue(item('one'));
    q.enqueue({ ...item('two'), canDispatch: () => { assert(q.withdraw('three')); return true; } }); q.enqueue(item('three')); f.complete();
    assert.deepEqual(f.sent, ['one', 'two']); assert.equal(q.status().withdrawn, 1); q.retire();
  });
  check('status is immutable and contains no frame ID callback or private error text', () => {
    const f = endpoint(), q = createNativePerformanceSendQueue({ channel: f.channel });
    q.enqueue({ ...item('private_id'), frame: 'private_frame' }); const status = q.status();
    assert(Object.isFrozen(status)); assert.equal(JSON.stringify(status).includes('private_'), false);
    assert.deepEqual(Object.keys(status).sort(), ['retired', 'inFlight', 'queuedControls', 'queuedSnapshot', 'accepted', 'dispatched', 'completed', 'rejected', 'withdrawn', 'droppedSnapshots', 'backpressure', 'failures'].sort()); q.retire();
  });
  const passed = checks.filter(result => result.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks };
}

if (typeof require !== 'undefined' && require.main === module) {
  const result = runNativePerformanceChannelSelftest();
  console.log(JSON.stringify(result));
  if (!result.pass) process.exitCode = 1;
}
