import assert from 'node:assert/strict';
import { createForgePerformanceCollector, type ForgePerformanceSnapshot } from './forgePerformance';
import {
  NATIVE_PERFORMANCE_LIMITS, NATIVE_PERFORMANCE_OPERATION_IDS, NATIVE_OPERATION_IDS,
  NATIVE_PERFORMANCE_WIRE_SCHEMA, isNativeCaptureKey, isNativeInstanceId, isNativeOperationId,
  normalizeNativeCollectionOptions, isNativePerformanceStatus, isNativePerformanceSnapshot, isNativeControlResult,
  encodeNativePerformanceFrame, decodeNativePerformanceFrame, createNativePerformanceWireSession,
  type NativePerformanceStatus, type NativePerformanceFrame, type NativePerformanceMessage,
  type NativeWireDirection, type NativeWireExpectation, type NativeFrameEncodeResult,
} from './nativePerformanceProtocol';

export function runNativePerformanceProtocolSelftest() {
  const checks: Array<{ name: string; pass: boolean }> = [];
  const check = (name: string, run: () => void) => {
    try { run(); checks.push({ name, pass: true }); } catch { checks.push({ name, pass: false }); }
  };
  try {
  const privateBinding = { nonce: 'private_nonce_01', epoch: 'epoch_native_01' };
  const expectation = (direction: NativeWireDirection): NativeWireExpectation => ({ binding: privateBinding, direction });
  const nativeStatus = (): NativePerformanceStatus => ({
    schemaVersion: 'forge.native-performance.status.v1',
    producer: { component: 'extension-host', scope: 'shared-process', pid: 42, instanceId: 'instance_native_01' },
    disposed: false, collectionActive: false, captureId: null,
    collectionStartedAtUnixMs: null, collectionExpiresAtUnixMs: null, intervalMs: 2000,
    eventLoopDelayMonitoring: false, resourceSamples: 0, resourceErrors: 0, throttledSamples: 0,
    counterResets: 0, sampleOverheadMs: 0, lastResourceError: null, collectionStopDelayMs: null,
    collectionCleanupUnconfirmed: false, ownedTimerCount: 0, failedTimerCount: 0, lastStopReason: null,
  });
  const nativeSnapshot = (full = false): ForgePerformanceSnapshot => {
    let clock = 0;
    const collector = createForgePerformanceCollector({ component: 'extension-host', scope: 'shared-process', pid: 42,
      instanceId: 'instance_native_01', enabled: true, now: () => clock++, wallNow: () => 1000 });
    for (let index = 0; index < (full ? 140 : 1); index++) {
      collector.recordOperation({ name: NATIVE_PERFORMANCE_OPERATION_IDS[index % NATIVE_PERFORMANCE_OPERATION_IDS.length], durationMs: 200, outcome: 'ok' });
      collector.recordResource({ cpuOneCorePercent: 250, cpuHostPercent: null, rssBytes: 1024 });
    }
    return collector.snapshot();
  };
  const makeFrame = (message: NativePerformanceMessage, direction: NativeWireDirection, sequence = 1): NativePerformanceFrame => ({
    ...message, schemaVersion: NATIVE_PERFORMANCE_WIRE_SCHEMA, direction, ...privateBinding, sequence,
  });
  const text = (encoded: NativeFrameEncodeResult) => {
    if (encoded.ok === false) throw new Error('ENCODE_FIXTURE_FAILED');
    assert.equal(encoded.ok, true);
    return encoded.text;
  };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const hello = () => makeFrame({ type: 'hello', backendInstanceId: 'backend_native_01' }, 'backend-to-host');

  check('fixed operation IDs are unique, frozen and have one shared alias', () => {
    assert.equal(NATIVE_OPERATION_IDS, NATIVE_PERFORMANCE_OPERATION_IDS);
    assert(Object.isFrozen(NATIVE_PERFORMANCE_OPERATION_IDS));
    assert.equal(new Set(NATIVE_PERFORMANCE_OPERATION_IDS).size, NATIVE_PERFORMANCE_OPERATION_IDS.length);
    assert(NATIVE_PERFORMANCE_OPERATION_IDS.every(isNativeOperationId));
    for (const bad of ['native.user.document', 'C:/private/file', 'native.command?token', undefined, 1]) assert.equal(isNativeOperationId(bad), false);
  });
  check('instance and capture identities use bounded opaque data', () => {
    assert(isNativeInstanceId('a'.repeat(8))); assert(isNativeInstanceId('b'.repeat(128)));
    for (const bad of ['', 'a'.repeat(7), 'a'.repeat(129), 'file/name_01', 'id_private\n', 1]) assert.equal(isNativeInstanceId(bad), false);
    assert(isNativeCaptureKey({ epoch: privateBinding.epoch, captureId: 'capture_native_01' }));
    for (const bad of [null, [], { epoch: privateBinding.epoch }, { epoch: privateBinding.epoch, captureId: 'capture_native_01', owner: 'caller' }]) assert.equal(isNativeCaptureKey(bad), false);
  });
  check('option defaults are immutable and explicit undefined stays optional', () => {
    for (const value of [undefined, {}, { durationMs: undefined, intervalMs: undefined }]) {
      const result = normalizeNativeCollectionOptions(value);
      assert.deepEqual(result, { ok: true, options: { durationMs: 60000, intervalMs: 2000, eventLoopDelay: false } });
      if (result.ok === true) assert(Object.isFrozen(result.options));
    }
  });
  check('option boundaries preserve frozen inputs', () => {
    for (const value of [{ durationMs: 1000, intervalMs: 1000, eventLoopDelay: true }, { durationMs: 900000, intervalMs: 60000, eventLoopDelay: false }]) {
      Object.freeze(value);
      assert.deepEqual(normalizeNativeCollectionOptions(value), { ok: true, options: value });
    }
  });
  for (const [name, value] of [
    ['null', null], ['array', []], ['duration-low', { durationMs: 999 }], ['duration-high', { durationMs: 900001 }],
    ['duration-fraction', { durationMs: 1000.5 }], ['duration-string', { durationMs: '1000' }],
    ['interval-low', { intervalMs: 999 }], ['interval-high', { intervalMs: 60001 }],
    ['event-loop-string', { eventLoopDelay: 'true' }], ['nonfinite', { durationMs: Infinity }],
    ['owner-field', { owner: 'caller_supplied' }], ['workspace-field', { workspaceId: 'workspace_native_01' }],
  ] as const) check(`options refuse ${name} without echoing input`, () => {
    assert.deepEqual(normalizeNativeCollectionOptions(value), { ok: false, code: 'NATIVE_PERFORMANCE_INPUT_INVALID' });
  });
  check('data getters are rejected without invoking their contents', () => {
    let calls = 0;
    const input = Object.defineProperty({}, 'durationMs', { enumerable: true, get() { calls++; return 1000; } });
    assert.equal(normalizeNativeCollectionOptions(input).ok, false);
    const key = Object.defineProperty({ captureId: 'capture_native_01' }, 'epoch', { enumerable: true, get() { calls++; return privateBinding.epoch; } });
    assert.equal(isNativeCaptureKey(key), false);
    assert.equal(calls, 0);
  });
  check('public status contains no binding and accepts explicit cleanup uncertainty', () => {
    const status = nativeStatus();
    assert(isNativePerformanceStatus(status));
    assert(isNativePerformanceStatus({ ...status, collectionCleanupUnconfirmed: true, failedTimerCount: 1 }));
    assert.equal(isNativePerformanceStatus({ ...status, nonce: privateBinding.nonce }), false);
    assert.equal(isNativePerformanceStatus({ ...status, epoch: privateBinding.epoch }), false);
    assert.equal(isNativePerformanceStatus({ ...status, owner: 'raw_key_id' }), false);
  });
  check('status identity and activity contradictions fail closed', () => {
    const status = nativeStatus();
    for (const bad of [
      { ...status, producer: { ...status.producer, component: 'backend' } },
      { ...status, producer: { ...status.producer, scope: 'owned-process' } },
      { ...status, producer: { ...status.producer, pid: 0 } },
      { ...status, collectionActive: true }, { ...status, collectionActive: true, captureId: 'capture_native_01', disposed: true },
      { ...status, resourceErrors: -1 }, { ...status, sampleOverheadMs: NaN }, { ...status, lastStopReason: 'unknown text' },
    ]) assert.equal(isNativePerformanceStatus(bad), false);
  });
  check('control results use fixed codes and never arbitrary error strings', () => {
    const status = nativeStatus();
    assert(isNativeControlResult({ ok: true, status }));
    for (const suffix of ['INPUT_INVALID', 'BUSY', 'CAPTURE_MISMATCH', 'DISPOSED', 'CLEANUP_UNCONFIRMED', 'START_FAILED']) {
      assert(isNativeControlResult({ ok: false, code: `NATIVE_PERFORMANCE_${suffix}`, status }));
    }
    assert.equal(isNativeControlResult({ ok: false, code: 'FOREIGN', status }), false);
    assert.equal(isNativeControlResult({ ok: true, status, error: 'private path' }), false);
  });
  check('actual collector snapshot preserves shared-host scope and CPU above one core', () => {
    const snapshot = nativeSnapshot();
    assert(isNativePerformanceSnapshot(snapshot));
    assert.equal(snapshot.resources[0].cpuOneCorePercent, 250);
    assert.equal(snapshot.resources[0].cpuHostPercent, null);
    assert.equal(snapshot.resources[0].fps, null);
  });
  check('full retained collector snapshot stays a valid bounded native frame', () => {
    const snapshot = nativeSnapshot(true);
    assert.equal(snapshot.resources.length, 120); assert.equal(snapshot.recentSlowOperations.length, 64);
    assert(isNativePerformanceSnapshot(snapshot));
    const value = makeFrame({ type: 'snapshot', controlId: null, status: nativeStatus(), snapshot }, 'host-to-backend');
    const raw = text(encodeNativePerformanceFrame(value));
    assert(raw.length > NATIVE_PERFORMANCE_LIMITS.maxControlBytes);
    assert.equal(decodeNativePerformanceFrame(raw, expectation('host-to-backend')).ok, true);
  });
  check('snapshot refuses foreign labels, correlation IDs and browser metrics', () => {
    const base = nativeSnapshot();
    const badName = clone(base); badName.operations[0].name = 'C:/private/project';
    const correlation = clone(base); correlation.recentSlowOperations[0].correlationId = 'private_correlation';
    const browser = clone(base); browser.resources[0].fps = 60;
    for (const bad of [badName, correlation, browser, { ...base, sourcePath: 'C:/private/project' }]) assert.equal(isNativePerformanceSnapshot(bad), false);
  });
  check('snapshot refuses changed histogram, counts, unknown coverage and resource fields', () => {
    const base = nativeSnapshot();
    const histogram = clone(base); histogram.operations[0].histogram.upperBoundsMs[0]++;
    const count = clone(base); count.operations[0].count++;
    const resource = clone(base); Object.assign(resource.resources[0], { path: 'private' });
    const coverage = clone(base); Object.assign(coverage.coverage, { cpuAttribution: 'exclusive-forge' });
    for (const bad of [histogram, count, resource, coverage]) assert.equal(isNativePerformanceSnapshot(bad), false);
  });
  check('snapshot refuses excess arrays and duplicate operation rows', () => {
    const base = clone(nativeSnapshot());
    assert.equal(isNativePerformanceSnapshot({ ...base, resources: Array.from({ length: 121 }, () => base.resources[0]) }), false);
    assert.equal(isNativePerformanceSnapshot({ ...base, operations: [base.operations[0], base.operations[0]] }), false);
  });
  const messages: Array<[NativeWireDirection, NativePerformanceMessage]> = [
    ['backend-to-host', { type: 'hello', backendInstanceId: 'backend_native_01' }],
    ['backend-to-host', { type: 'start', controlId: 'control_native_01', captureId: 'capture_native_01', options: {} }],
    ['backend-to-host', { type: 'stop', controlId: 'control_native_01', captureId: 'capture_native_01', reason: 'requested' }],
    ['backend-to-host', { type: 'cancel', controlId: 'control_native_01', captureId: 'capture_native_01' }],
    ['backend-to-host', { type: 'read', controlId: 'control_native_01' }],
    ['host-to-backend', { type: 'ready', backendInstanceId: 'backend_native_01', status: nativeStatus() }],
    ['host-to-backend', { type: 'result', controlId: 'control_native_01', captureId: 'capture_native_01', result: { ok: true, status: nativeStatus() } }],
    ['host-to-backend', { type: 'snapshot', controlId: null, status: nativeStatus(), snapshot: nativeSnapshot() }],
    ['host-to-backend', { type: 'retired', status: nativeStatus() }],
  ];
  for (const [direction, message] of messages) check(`closed ${direction} ${message.type} string roundtrip`, () => {
    const source = makeFrame(message, direction);
    const decoded = decodeNativePerformanceFrame(text(encodeNativePerformanceFrame(source)), expectation(direction));
    assert.equal(decoded.ok, true);
    if (decoded.ok === true) { assert.deepEqual(decoded.frame, source); assert(Object.isFrozen(decoded.frame)); }
  });
  check('failure result roundtrip retains only fixed refusal evidence', () => {
    const value = makeFrame({ type: 'result', controlId: 'control_native_01', captureId: 'capture_native_01',
      result: { ok: false, code: 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED', status: nativeStatus() } }, 'host-to-backend');
    assert.equal(decodeNativePerformanceFrame(text(encodeNativePerformanceFrame(value)), expectation('host-to-backend')).ok, true);
  });
  check('snapshot producer comparison ignores JSON property order', () => {
    const status = nativeStatus();
    status.producer = { instanceId: status.producer.instanceId, pid: 42, scope: 'shared-process', component: 'extension-host' };
    const value = makeFrame({ type: 'snapshot', controlId: null, status, snapshot: nativeSnapshot() }, 'host-to-backend');
    assert.equal(encodeNativePerformanceFrame(value).ok, true);
  });
  check('snapshot from another producer is rejected', () => {
    const snapshot = clone(nativeSnapshot()); snapshot.producer.instanceId = 'instance_native_02';
    assert.equal(encodeNativePerformanceFrame(makeFrame({ type: 'snapshot', controlId: null, status: nativeStatus(), snapshot }, 'host-to-backend')).ok, false);
  });
  check('decoder rejects objects before any object getter or conversion', () => {
    let invoked = 0;
    const input = { get schemaVersion() { invoked++; return NATIVE_PERFORMANCE_WIRE_SCHEMA; }, toString() { invoked++; return '{}'; } };
    assert.deepEqual(decodeNativePerformanceFrame(input, expectation('backend-to-host')), { ok: false, code: 'NATIVE_WIRE_INPUT_TYPE' });
    assert.equal(invoked, 0);
  });
  check('wrong binding and actual incoming direction are separate refusals', () => {
    const raw = text(encodeNativePerformanceFrame(hello()));
    assert.deepEqual(decodeNativePerformanceFrame(raw, { ...expectation('backend-to-host'), binding: { ...privateBinding, nonce: 'foreign_nonce_01' } }), { ok: false, code: 'NATIVE_WIRE_BINDING_MISMATCH' });
    assert.deepEqual(decodeNativePerformanceFrame(raw, expectation('host-to-backend')), { ok: false, code: 'NATIVE_WIRE_DIRECTION_MISMATCH' });
  });
  for (const [name, alter] of [
    ['version', (value: Record<string, unknown>) => { value.schemaVersion = 'foreign.v2'; }],
    ['type', (value: Record<string, unknown>) => { value.type = 'unknown'; }],
    ['sequence-zero', (value: Record<string, unknown>) => { value.sequence = 0; }],
    ['sequence-fraction', (value: Record<string, unknown>) => { value.sequence = 1.5; }],
    ['sequence-unsafe', (value: Record<string, unknown>) => { value.sequence = Number.MAX_SAFE_INTEGER + 1; }],
    ['extra-owner', (value: Record<string, unknown>) => { value.owner = 'caller_owner'; }],
    ['wrong-direction-type', (value: Record<string, unknown>) => { value.direction = 'host-to-backend'; }],
    ['long-id', (value: Record<string, unknown>) => { value.backendInstanceId = 'a'.repeat(129); }],
  ] as const) check(`frame refuses ${name}`, () => {
    const value: Record<string, unknown> = { ...hello() }; alter(value);
    assert.deepEqual(encodeNativePerformanceFrame(value), { ok: false, code: 'NATIVE_WIRE_INVALID' });
    assert.equal(decodeNativePerformanceFrame(JSON.stringify(value), expectation('backend-to-host')).ok, false);
  });
  check('missing and undefined start options cannot encode a broken wire frame', () => {
    const value = makeFrame({ type: 'start', controlId: 'control_native_01', captureId: 'capture_native_01', options: {} }, 'backend-to-host');
    assert.equal(encodeNativePerformanceFrame({ ...value, options: undefined }).ok, false);
    const missing: Record<string, unknown> = { ...value }; delete missing.options;
    assert.equal(encodeNativePerformanceFrame(missing).ok, false);
  });
  check('control wire cap counts whitespace and frame cap counts UTF-8 bytes', () => {
    const raw = text(encodeNativePerformanceFrame(hello()));
    assert.deepEqual(decodeNativePerformanceFrame(raw + ' '.repeat(4096), expectation('backend-to-host')), { ok: false, code: 'NATIVE_WIRE_TOO_LARGE' });
    assert.deepEqual(decodeNativePerformanceFrame(' '.repeat(NATIVE_PERFORMANCE_LIMITS.maxFrameBytes + 1), expectation('backend-to-host')), { ok: false, code: 'NATIVE_WIRE_TOO_LARGE' });
    const multibyte = '😀'.repeat(Math.floor(NATIVE_PERFORMANCE_LIMITS.maxFrameBytes / 4) + 1);
    assert(multibyte.length < NATIVE_PERFORMANCE_LIMITS.maxFrameBytes);
    assert.deepEqual(decodeNativePerformanceFrame(multibyte, expectation('backend-to-host')), { ok: false, code: 'NATIVE_WIRE_TOO_LARGE' });
  });
  check('malformed JSON, excessive depth, cycles and hidden data stay fixed refusals', () => {
    for (const raw of ['', '{', 'null', '[]', '{"__proto__":{"owner":"foreign"}}']) assert.equal(decodeNativePerformanceFrame(raw, expectation('backend-to-host')).ok, false);
    let deep: unknown = {};
    for (let index = 0; index < 14; index++) deep = { nested: deep };
    assert.equal(encodeNativePerformanceFrame({ ...hello(), deep }).ok, false);
    const cycle: Record<string, unknown> = { ...hello() }; cycle.loop = cycle;
    assert.equal(encodeNativePerformanceFrame(cycle).ok, false);
    const hidden = { ...hello() }; Object.defineProperty(hidden, 'secret', { value: 'not exported' });
    assert.equal(encodeNativePerformanceFrame(hidden).ok, false);
  });
  check('wire session matches directions, tracks order and rejects replay without advancing', () => {
    const backend = createNativePerformanceWireSession({ binding: privateBinding, incomingDirection: 'host-to-backend' });
    const host = createNativePerformanceWireSession({ binding: privateBinding, incomingDirection: 'backend-to-host' });
    const raw = text(backend.encode({ type: 'hello', backendInstanceId: 'backend_native_01' }));
    assert.equal(host.receive(raw).ok, true);
    assert.deepEqual(host.receive(raw), { ok: false, code: 'NATIVE_WIRE_REPLAY' });
    assert.equal(host.status().lastReceivedSequence, 1);
    const ready = text(host.encode({ type: 'ready', backendInstanceId: 'backend_native_01', status: nativeStatus() }));
    assert.equal(backend.receive(ready).ok, true);
    assert.equal(host.status().rejectedFrames, 1);
  });
  check('invalid outgoing direction and forged binding fields do not consume sequence', () => {
    const session = createNativePerformanceWireSession({ binding: privateBinding, incomingDirection: 'host-to-backend' });
    assert.equal(session.encode({ type: 'ready', backendInstanceId: 'backend_native_01', status: nativeStatus() }).ok, false);
    const forged = { type: 'read' as const, controlId: 'control_native_01', nonce: 'foreign_nonce_01' };
    assert.equal(session.encode(forged).ok, false);
    assert.equal(session.status().lastSentSequence, 0);
    assert.equal(JSON.parse(text(session.encode({ type: 'read', controlId: 'control_native_01' }))).sequence, 1);
  });
  check('sequence gaps are explicit and valid result decoding does not match pending controls', () => {
    const session = createNativePerformanceWireSession({ binding: privateBinding, incomingDirection: 'host-to-backend' });
    const value = makeFrame({ type: 'result', controlId: 'unmatched_control_01', captureId: 'unmatched_capture_01', result: { ok: true, status: nativeStatus() } }, 'host-to-backend', 3);
    const decoded = session.receive(text(encodeNativePerformanceFrame(value)));
    assert.equal(decoded.ok, true);
    assert.deepEqual(Object.keys(decoded).sort(), ['frame', 'ok']);
    assert.equal(session.status().sequenceGaps, 2);
  });
  check('binding is copied and maximum safe sequence never wraps or overflows counters', () => {
    const binding = { ...privateBinding };
    const session = createNativePerformanceWireSession({ binding, incomingDirection: 'backend-to-host' });
    binding.nonce = 'changed_nonce_01';
    const raw = text(encodeNativePerformanceFrame({ ...hello(), sequence: Number.MAX_SAFE_INTEGER }));
    assert.equal(session.receive(raw).ok, true);
    assert.equal(session.status().lastReceivedSequence, Number.MAX_SAFE_INTEGER);
    assert.equal(session.status().sequenceGaps, Number.MAX_SAFE_INTEGER - 1);
    assert.equal(session.receive(raw).ok, false);
    assert(Number.isSafeInteger(session.status().sequenceGaps));
  });
  check('retirement is sticky and status is immutable without private binding', () => {
    const session = createNativePerformanceWireSession({ binding: privateBinding, incomingDirection: 'backend-to-host' });
    const before = session.status(); session.retire(); session.retire();
    assert.equal(before.retired, false); assert(Object.isFrozen(before));
    assert.deepEqual(session.receive(text(encodeNativePerformanceFrame(hello()))), { ok: false, code: 'NATIVE_WIRE_RETIRED' });
    assert.deepEqual(session.encode({ type: 'retired', status: nativeStatus() }), { ok: false, code: 'NATIVE_WIRE_RETIRED' });
    assert.deepEqual(Object.keys(session.status()).sort(), ['lastReceivedSequence', 'lastSentSequence', 'rejectedFrames', 'retired', 'sequenceGaps']);
  });
  check('invalid expected binding cannot be mistaken for a valid session', () => {
    const bad = { nonce: 'short', epoch: privateBinding.epoch };
    assert.throws(() => createNativePerformanceWireSession({ binding: bad, incomingDirection: 'backend-to-host' }), /NATIVE_WIRE_BINDING_INVALID/);
    assert.deepEqual(decodeNativePerformanceFrame(text(encodeNativePerformanceFrame(hello())), { binding: bad, direction: 'backend-to-host' }), { ok: false, code: 'NATIVE_WIRE_BINDING_INVALID' });
  });
  } catch {
    checks.push({ name: 'all protocol selftest fixtures were constructed', pass: false });
  }
  const passed = checks.filter(result => result.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks };
}

if (typeof require !== 'undefined' && require.main === module) {
  const result = runNativePerformanceProtocolSelftest();
  console.log(JSON.stringify(result));
  if (!result.pass) process.exitCode = 1;
}
