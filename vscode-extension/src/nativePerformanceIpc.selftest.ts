/** Real production modules over owned Node IPC; no IDE, installed-host or game claim. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  createNativePerformanceRetirementNotice, isNativePerformanceRetirementNotice,
  type NativePerformanceEndpoint,
} from '../../shared/nativePerformanceChannel';
import { decodeNativePerformanceFrame, type NativeWireBinding } from '../../shared/nativePerformanceProtocol';
import { createNativePerformance, type NativePerformanceTimer } from './nativePerformance';
import { createNativePerformanceHost, type NativePerformanceHostBridge } from './nativePerformanceHost';

type Check = { name: string; pass: boolean };
type Scenario = 'normal' | 'abort' | 'timeout' | 'leave-active' | 'retire-leg' | 'legacy';
const WORKER_CHECKS: Record<Scenario, readonly string[]> = {
  normal: ['ready_identity', 'ready_inactive', 'start_execution_ack', 'read_execution_snapshot', 'sample_is_actual_host', 'operation_is_recorded', 'stop_execution_ack', 'stop_cleanup_confirmed'],
  abort: ['ready_identity', 'ready_inactive', 'actual_result_held', 'caller_remains_aborted', 'late_active_ack_observed', 'fresh_read_cleanup_confirmed'],
  timeout: ['ready_identity', 'ready_inactive', 'actual_result_held', 'caller_remains_timeout', 'real_control_deadline_elapsed', 'late_active_ack_observed', 'fresh_read_cleanup_confirmed'],
  'leave-active': ['ready_identity', 'ready_inactive', 'start_execution_ack', 'retained_capture_active'],
  'retire-leg': ['ready_identity', 'ready_inactive', 'start_execution_ack', 'local_retirement_fenced', 'ordinary_ipc_stays_connected'],
  legacy: ['legacy_native_mode_stripped', 'legacy_transport_unavailable', 'legacy_zero_broker_timers'],
};
const PREFIX = 'X4FORGE_NATIVE_IPC_WORKER=';
const ALIVE = 'X4FORGE_NATIVE_IPC_ORDINARY_ALIVE';
const modulePath = path.join(__dirname, 'nativePerformanceIpc.selftest.ts');
const supervisorPath = path.join(__dirname, 'sidecarSupervisor.ts');
const localRequire = createRequire(modulePath);
const loaderPath = pathToFileURL(localRequire.resolve('tsx')).href;
const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isScenario = (value: unknown): value is Scenario => typeof value === 'string' && Object.hasOwn(WORKER_CHECKS, value);
function pidAbsent(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return false; }
  catch (error) { return record(error) && error.code === 'ESRCH'; }
}

export interface NativeIpcOwnerMarkerBoundary {
  lstat(): { isFile(): boolean; isSymbolicLink(): boolean };
  read(): string;
}
/** The marker's own entry must be regular before its contents can authorize cleanup. */
export function nativeIpcOwnerMarkerPermitsCleanup(expectedOwner: string, boundary: NativeIpcOwnerMarkerBoundary): boolean {
  try {
    const entry = boundary.lstat();
    if (entry.isSymbolicLink() || !entry.isFile()) return false;
    const ownerData: unknown = JSON.parse(boundary.read());
    return record(ownerData) && ownerData.owner === expectedOwner && Object.keys(ownerData).length === 1;
  } catch { return false; }
}

/** Pure injected boundaries: no real symlink, filesystem mutation, process or worker. */
export function runNativePerformanceIpcOwnerMarkerGuardSelftest() {
  let pass = false;
  try {
    const owner = 'owner_native_marker_guard_01';
    let linkedTargetReads = 0, linkedStats = 0, regularReads = 0, failedStatReads = 0;
    // Reject both normal link stats and an inconsistent link/regular classification.
    for (const reportsRegular of [false, true]) {
      const cleanupAuthorized = nativeIpcOwnerMarkerPermitsCleanup(owner, {
        lstat: () => { linkedStats++; return { isFile: () => reportsRegular, isSymbolicLink: () => true }; },
        read: () => { linkedTargetReads++; return JSON.stringify({ owner }); },
      });
      assert.equal(cleanupAuthorized, false);
    }
    assert.equal(linkedStats, 2); assert.equal(linkedTargetReads, 0);
    assert.equal(nativeIpcOwnerMarkerPermitsCleanup(owner, {
      lstat: () => { throw new Error('INJECTED_MARKER_STAT_FAILURE'); },
      read: () => { failedStatReads++; return JSON.stringify({ owner }); },
    }), false);
    assert.equal(failedStatReads, 0);
    assert.equal(nativeIpcOwnerMarkerPermitsCleanup(owner, {
      lstat: () => ({ isFile: () => true, isSymbolicLink: () => false }),
      read: () => { throw new Error('INJECTED_MARKER_READ_FAILURE'); },
    }), false);
    assert.equal(nativeIpcOwnerMarkerPermitsCleanup(owner, {
      lstat: () => ({ isFile: () => true, isSymbolicLink: () => false }),
      read: () => { regularReads++; return JSON.stringify({ owner }); },
    }), true);
    assert.equal(regularReads, 1);
    pass = true;
  } catch { /* Fixed verdict only; injected errors and marker contents are never emitted. */ }
  return { pass, passed: pass ? 1 : 0, total: 1,
    checks: [{ name: 'linked_owner_marker_is_not_read_or_authorized_for_cleanup', pass }] };
}

interface WorkerReceipt { mode: Scenario; pid: number; pass: boolean; passed: number; total: number; checks: Check[] }
function parseReceipt(text: string): WorkerReceipt | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!record(value) || value.kind !== 'native-ipc-worker-v1' || !isScenario(value.mode)
      || typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid <= 0
      || typeof value.pass !== 'boolean' || typeof value.passed !== 'number' || typeof value.total !== 'number'
      || !Array.isArray(value.checks) || value.checks.length > 16) return null;
    const checks: Check[] = [];
    for (const row of value.checks) {
      if (!record(row) || typeof row.name !== 'string' || !/^[a-z][a-z0-9_]{1,100}$/.test(row.name) || typeof row.pass !== 'boolean') return null;
      checks.push({ name: row.name, pass: row.pass });
    }
    if (value.total !== checks.length || value.passed !== checks.filter(row => row.pass).length
      || value.pass !== checks.every(row => row.pass)) return null;
    return { mode: value.mode, pid: value.pid, pass: value.pass, passed: value.passed, total: value.total, checks };
  } catch { return null; }
}
function checked(checks: Check[], name: string, pass: boolean) {
  checks.push({ name, pass });
  assert.equal(pass, true, 'NATIVE_IPC_CHECK_FAILED');
}
async function until(predicate: () => boolean, milliseconds: number) {
  const end = performance.now() + milliseconds;
  while (!predicate() && performance.now() < end) await delay(10);
  assert.equal(predicate(), true, 'NATIVE_IPC_WAIT_FAILED');
}

async function worker(mode: Scenario) {
  // Preserve the extension Node16/CommonJS boundary; the backend module is ESM.
  const { createNativePerformanceBroker } = await import('../../src/server/nativePerformanceBroker.js');
  type WorkerBroker = ReturnType<typeof createNativePerformanceBroker>;
  type WorkerActor = Parameters<WorkerBroker['read']>[0]['actor'];
  const checks: Check[] = [];
  const epoch = process.env.X4_FORGE_NATIVE_EPOCH || '';
  const binding: NativeWireBinding = { nonce: process.env.X4_FORGE_PARENT_NONCE || '', epoch };
  const backendInstanceId = crypto.randomUUID();
  const timers = new Map<unknown, ReturnType<typeof setTimeout>>();
  let held: string | null = null, heldOnce = false, lateDelivered = false, lateAcquired = false;
  let abort: AbortController | undefined;
  let broker: WorkerBroker | undefined;
  let releaseParent: (() => void) | undefined;
  let ordinaryEnded = process.connected !== true;
  const parentLost = new Promise<void>(resolve => { releaseParent = resolve; if (ordinaryEnded) resolve(); });
  const ordinaryDisconnect = () => { ordinaryEnded = true; releaseParent?.(); };
  const ordinaryMessage = (raw: unknown) => {
    if (!record(raw)) return;
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Object.keys(fields).length === 2 && fields.type?.value === 'x4forge-parent-lost'
      && fields.nonce?.value === binding.nonce) ordinaryDisconnect();
  };
  process.on('message', ordinaryMessage);
  process.once('disconnect', ordinaryDisconnect);
  const deadline = setTimeout(() => { process.stderr.write('NATIVE_IPC_WORKER_DEADLINE\n'); process.exit(1); }, 25_000);
  const channel: NativePerformanceEndpoint = {
    isConnected: () => process.connected === true,
    send: (text, callback) => {
      if (!process.send) { callback(new Error('NATIVE_IPC_UNAVAILABLE')); return false; }
      return process.send(text, callback);
    },
    onMessage(listener) {
      const receive = (raw: unknown) => {
        const decoded = decodeNativePerformanceFrame(raw, { binding, direction: 'host-to-backend' });
        if ((mode === 'abort' || mode === 'timeout') && decoded.ok && decoded.frame.type === 'result') {
          if (!heldOnce && decoded.frame.result.ok && decoded.frame.result.status.collectionActive && typeof raw === 'string') {
            // This string already arrived through real IPC. No send callback or ACK is fabricated.
            held = raw; heldOnce = true;
            if (mode === 'abort') abort?.abort();
            return;
          }
          if (held !== null && !decoded.frame.result.status.collectionActive) {
            const prior = held; held = null;
            // Preserve original wire order: late start result precedes real cancellation result.
            listener(prior);
            lateDelivered = true; lateAcquired = broker?.status().captureOwned === true;
          }
        }
        listener(raw);
      };
      process.on('message', receive); return () => { process.removeListener('message', receive); };
    },
    onDisconnect(listener) { process.on('disconnect', listener); return () => { process.removeListener('disconnect', listener); }; },
  };
  const enabled = mode !== 'legacy' && process.env.X4_FORGE_NATIVE_MODE === 'ipc-v1';
  let failed = false;
  try {
    broker = createNativePerformanceBroker({
      backendInstanceId, ...(enabled ? { binding, channel, expectedHostPid: Number(process.env.X4_FORGE_PARENT_PID) } : {}),
      now: () => performance.now(),
      timers: {
        set(callback, milliseconds) {
          const timer: ReturnType<typeof setTimeout> = setTimeout(() => { timers.delete(timer); callback(); }, milliseconds);
          timers.set(timer, timer); return timer;
        },
        clear(handle) { const timer = timers.get(handle); if (timer) { clearTimeout(timer); timers.delete(handle); } },
      },
      onRetire: () => {
        if (!enabled) return;
        try { process.send?.(createNativePerformanceRetirementNotice(binding), () => undefined); } catch { /* No retry or synthetic success. */ }
      },
    });
    if (mode === 'legacy') {
      checked(checks, 'legacy_native_mode_stripped', process.env.X4_FORGE_NATIVE_MODE !== 'ipc-v1');
      checked(checks, 'legacy_transport_unavailable', broker.status().availability === 'unavailable');
      checked(checks, 'legacy_zero_broker_timers', timers.size === 0);
    } else {
      await until(() => ordinaryEnded || broker?.status().availability === 'ready', 6500);
      if (ordinaryEnded) throw new Error('NATIVE_IPC_ORDINARY_PARENT_LOST');
      const initial = broker.status(), native = initial.native;
      checked(checks, 'ready_identity', native !== null && native.producer.pid === Number(process.env.X4_FORGE_PARENT_PID));
      checked(checks, 'ready_inactive', !!native && !native.collectionActive && !native.collectionCleanupUnconfirmed
        && native.ownedTimerCount === 0 && native.failedTimerCount === 0 && !native.eventLoopDelayMonitoring);
      if (!native) throw new Error('NATIVE_IPC_NO_READY');
      const actor: WorkerActor = { kind: 'studio', id: 'native-ipc-selftest', isCurrent: () => true };
      const identity = { actor, expectedBackendInstanceId: backendInstanceId, expectedNativeInstanceId: native.producer.instanceId };
      abort = new AbortController();
      const began = performance.now();
      const start = await broker.start({ ...identity, options: { durationMs: 20_000, intervalMs: 1000, eventLoopDelay: true },
        ...((mode === 'abort') ? { signal: abort.signal } : {}) });
      if (mode === 'abort' || mode === 'timeout') {
        checked(checks, 'actual_result_held', heldOnce);
        checked(checks, mode === 'abort' ? 'caller_remains_aborted' : 'caller_remains_timeout',
          start.ok === false && start.code === (mode === 'abort' ? 'NATIVE_PERFORMANCE_ABORTED' : 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT'));
        if (mode === 'timeout') checked(checks, 'real_control_deadline_elapsed', performance.now() - began >= 4900);
        await until(() => ordinaryEnded || broker?.status().cancellation === 'none', 6500);
        if (ordinaryEnded) throw new Error('NATIVE_IPC_ORDINARY_PARENT_LOST');
        checked(checks, 'late_active_ack_observed', held === null && lateDelivered && !lateAcquired && !broker.status().captureOwned);
        const read = await broker.read({ actor });
        checked(checks, 'fresh_read_cleanup_confirmed', read.ok && !!read.status.native && !read.status.native.collectionActive
          && !read.status.cleanupUnconfirmed && read.status.native.ownedTimerCount === 0 && read.status.native.failedTimerCount === 0
          && !read.status.native.eventLoopDelayMonitoring && !start.ok);
      } else {
        checked(checks, 'start_execution_ack', start.ok && !!start.status.native?.collectionActive && start.status.captureOwned);
        if (mode === 'leave-active') {
          checked(checks, 'retained_capture_active', !!start.status.native?.captureId && start.status.native.producer.instanceId === native.producer.instanceId);
        } else if (mode === 'retire-leg') {
          broker.retire('disconnect');
          checked(checks, 'local_retirement_fenced', broker.status().availability === 'retired' && timers.size === 0 && !broker.status().captureOwned);
          checked(checks, 'ordinary_ipc_stays_connected', process.connected === true);
        } else {
          const read = await broker.read({ actor });
          checked(checks, 'read_execution_snapshot', read.ok && read.status.snapshot !== null && read.status.lastRefreshOutcome === 'ok');
          checked(checks, 'sample_is_actual_host', !!read.status.snapshot && read.status.snapshot.resources.length > 0
            && read.status.snapshot.producer.pid === Number(process.env.X4_FORGE_PARENT_PID)
            && read.status.snapshot.producer.component === 'extension-host' && read.status.snapshot.producer.scope === 'shared-process');
          checked(checks, 'operation_is_recorded', !!read.status.snapshot?.operations.some(row => row.name === 'native.command' && row.count > 0));
          const captureId = start.status.native?.captureId;
          if (!captureId) throw new Error('NATIVE_IPC_CAPTURE_MISSING');
          const stop = await broker.stop({ ...identity, captureId });
          checked(checks, 'stop_execution_ack', stop.ok);
          checked(checks, 'stop_cleanup_confirmed', !!stop.status.native && !stop.status.native.collectionActive
            && !stop.status.cleanupUnconfirmed && stop.status.native.ownedTimerCount === 0
            && stop.status.native.failedTimerCount === 0 && !stop.status.native.eventLoopDelayMonitoring);
        }
      }
    }
  } catch { failed = true; checks.push({ name: 'worker_completed', pass: false }); }
  const passed = checks.filter(row => row.pass).length;
  const receipt = { kind: 'native-ipc-worker-v1', mode, pid: process.pid, pass: !failed && passed === checks.length,
    passed, total: checks.length, checks };
  await new Promise<void>(resolve => { process.stdout.write(PREFIX + JSON.stringify(receipt) + '\n', () => resolve()); });
  const heartbeat = setTimeout(() => { process.stdout.write(ALIVE + '\n'); }, 1200);
  await parentLost;
  broker?.retire('stopped');
  if (heartbeat) clearTimeout(heartbeat);
  clearTimeout(deadline);
  process.removeListener('message', ordinaryMessage);
  process.removeListener('disconnect', ordinaryDisconnect);
  // Only ordinary parent-EOF shutdown exits this owned fixture. Native retirement never does.
  process.exit(receipt.pass ? 0 : 1);
}

interface Run {
  child: ChildProcess; binding: NativeWireBinding; mode: Scenario; label: string;
  current: boolean; bridge?: NativePerformanceHostBridge; receive?: (raw: unknown) => void;
  receipt?: WorkerReceipt; buffer: string; outputBytes: number; errorBytes: number; failure: boolean;
  supervisedPid: number; supervisedPidCount: number; notices: number; alive: boolean; originalStart?: string;
  closed: boolean; stdoutClosed: boolean; stderrClosed: boolean; cleanupRecorded: boolean;
}
const terminalAndDrained = (run: Run) => (run.child.exitCode !== null || run.child.signalCode !== null)
  && run.closed && run.stdoutClosed && run.stderrClosed;
const boundWorker = (run: Run) => run.supervisedPidCount === 1 && Number.isSafeInteger(run.supervisedPid)
  && run.supervisedPid > 0 && run.receipt?.pid === run.supervisedPid;

export async function runNativePerformanceIpcSelftest() {
  const markerGuard = runNativePerformanceIpcOwnerMarkerGuardSelftest();
  if (!markerGuard.pass) return { ...markerGuard, realOwnedIpc: false, productionModules: true, installedHostOrGameProof: false };
  const checks: Check[] = [...markerGuard.checks], runs: Run[] = [];
  const ownedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-native-ipc-'));
  const owner = crypto.randomUUID(), ownerFile = path.join(ownedRoot, 'owner.json');
  fs.writeFileSync(ownerFile, JSON.stringify({ owner }));
  const discovery = path.join(ownedRoot, 'discovery'); fs.mkdirSync(discovery);
  let current: Run | undefined, resourceReads = 0, phase = 'initial', parentRetired = false;
  const nativeTimers = new Map<NativePerformanceTimer, ReturnType<typeof setTimeout>>();
  const producer = createNativePerformance({ pid: process.pid, instanceId: crypto.randomUUID(),
    now: () => performance.now(), wallNow: () => Date.now(),
    resources: { pid: () => process.pid, cpuUsage: () => { resourceReads++; return process.cpuUsage(); },
      memoryUsage: () => process.memoryUsage(), uptime: () => process.uptime(), logicalCpuCount: () => os.cpus().length,
      eventLoopUtilization: () => performance.eventLoopUtilization() },
    timers: {
      set(callback, milliseconds) {
        const timer: ReturnType<typeof setTimeout> = setTimeout(() => { nativeTimers.delete(timer); callback(); }, milliseconds);
        nativeTimers.set(timer, timer); return timer;
      },
      clear(handle) { const timer = nativeTimers.get(handle); if (timer) { clearTimeout(timer); nativeTimers.delete(handle); } },
    }, delayHistogram: () => monitorEventLoopDelay({ resolution: 20 }),
  });
  const host = createNativePerformanceHost({ producer });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const check = (name: string, pass: boolean) => checked(checks, name, pass);

  async function close(run: Run) {
    run.current = false;
    run.bridge?.retire('owned-test-shutdown');
    if (current === run) current = undefined;
    if (run.child.exitCode === null && run.child.signalCode === null) run.child.stdin?.end();
    let forced = false;
    try {
      try { await until(() => terminalAndDrained(run), 3500); }
      catch {
        forced = true;
        // Give the production owner its normal signal/EOF path before last-resort termination.
        if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM');
        try { await until(() => terminalAndDrained(run), 1500); }
        catch {
          if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGKILL');
          await until(() => terminalAndDrained(run), 2000);
        }
      }
      assert.equal(boundWorker(run), true, 'NATIVE_IPC_WORKER_IDENTITY_UNKNOWN');
      // A separately detached POSIX worker must really be absent, not merely its supervisor.
      // A recycled/present/permission-unknown PID fails closed; it never licenses a PID kill.
      await until(() => pidAbsent(run.supervisedPid), 2000);
      if (!run.cleanupRecorded) {
        run.cleanupRecorded = true;
        check(`${run.label}_terminal_drained_bound_worker_absent`, terminalAndDrained(run) && !run.failure && !forced);
      }
      if (forced || run.failure) throw new Error('NATIVE_IPC_GRACEFUL_CLEANUP_FAILED');
    } catch {
      if (!run.cleanupRecorded) {
        run.cleanupRecorded = true; checks.push({ name: `${run.label}_terminal_drained_bound_worker_absent`, pass: false });
      }
      throw new Error('NATIVE_IPC_CLEANUP_UNCONFIRMED');
    }
  }
  async function launch(mode: Scenario, label: string) {
    assert.equal(parentRetired, false, 'NATIVE_IPC_PARENT_RETIRED');
    const binding = { nonce: crypto.randomBytes(32).toString('hex'), epoch: crypto.randomUUID() };
    const child = spawn(process.execPath, ['--max-old-space-size=512', '--import', loaderPath, supervisorPath,
      modulePath, '--max-old-space-size=512', '--import', loaderPath], {
      cwd: ownedRoot, shell: false, windowsHide: true, detached: process.platform !== 'win32',
      stdio: mode === 'legacy' ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, X4_NATIVE_PERFORMANCE_SELFTEST_ROLE: 'worker', X4_NATIVE_PERFORMANCE_SELFTEST_SCENARIO: mode,
        X4_FORGE_PARENT_MODE: 'pipe-v1', X4_FORGE_PARENT_PID: String(process.pid), X4_FORGE_PARENT_NONCE: binding.nonce,
        X4_FORGE_NATIVE_MODE: 'ipc-v1', X4_FORGE_NATIVE_EPOCH: binding.epoch, X4FORGE_DISCOVERY_DIR: discovery },
    });
    const run: Run = { child, binding, mode, label, current: true, buffer: '', outputBytes: 0, errorBytes: 0,
      failure: false, supervisedPid: 0, supervisedPidCount: 0, notices: 0, alive: false,
      closed: false, stdoutClosed: false, stderrClosed: false, cleanupRecorded: false };
    runs.push(run); current = run;
    child.on('error', () => { run.failure = true; });
    child.once('close', () => { run.closed = true; });
    child.stdout?.once('close', () => { run.stdoutClosed = true; });
    child.stderr?.once('close', () => { run.stderrClosed = true; });
    child.stdout?.on('data', (chunk: Buffer) => {
      run.outputBytes += chunk.length;
      if (run.outputBytes > 65_536) { run.failure = true; child.stdin?.end(); return; }
      run.buffer += chunk.toString('utf8');
      let index: number;
      while ((index = run.buffer.indexOf('\n')) >= 0) {
        const line = run.buffer.slice(0, index).trim(); run.buffer = run.buffer.slice(index + 1);
        const pid = /^\[sidecar-supervisor\] X4FORGE_SUPERVISED_PID=(\d+)$/.exec(line);
        if (pid) {
          run.supervisedPidCount++;
          if (run.supervisedPidCount !== 1) run.failure = true;
          else run.supervisedPid = Number(pid[1]);
        }
        if (line === ALIVE) run.alive = true;
        if (line.startsWith(PREFIX)) {
          const receipt = parseReceipt(line.slice(PREFIX.length));
          if (!receipt || run.receipt) run.failure = true; else run.receipt = receipt;
        }
      }
    });
    child.stdout?.once('end', () => { if (run.buffer.trim()) run.failure = true; run.buffer = ''; });
    child.stderr?.on('data', (chunk: Buffer) => { run.errorBytes += chunk.length; if (run.errorBytes > 16_384) { run.failure = true; child.stdin?.end(); } });
    if (mode !== 'legacy') {
      const channel: NativePerformanceEndpoint = {
        isConnected: () => child.connected,
        send(text, callback) {
          const decoded = decodeNativePerformanceFrame(text, { binding, direction: 'host-to-backend' });
          if (decoded.ok && decoded.frame.type === 'result' && decoded.frame.result.ok && decoded.frame.result.status.collectionActive) {
            host.beginOperation('native.command')('ok');
          }
          return child.send(text, callback);
        },
        onMessage(listener) {
          const receive = (raw: unknown) => {
            const actualCurrent = current === run && run.current && child.exitCode === null && child.signalCode === null;
            if (isNativePerformanceRetirementNotice(raw, binding)) {
              if (actualCurrent) { run.notices++; run.bridge?.retire('actual-native-leg-retirement'); }
              return;
            }
            if (!actualCurrent) return;
            const decoded = decodeNativePerformanceFrame(raw, { binding, direction: 'backend-to-host' });
            if (decoded.ok && decoded.frame.type === 'start' && typeof raw === 'string' && run.originalStart === undefined) run.originalStart = raw;
            listener(raw);
          };
          run.receive = receive; child.on('message', receive);
          return () => { child.removeListener('message', receive); };
        },
        onDisconnect(listener) { child.on('disconnect', listener); return () => { child.removeListener('disconnect', listener); }; },
      };
      run.bridge = host.attach({ binding, channel, isCurrent: () => current === run && run.current
        && child.exitCode === null && child.signalCode === null });
    }
    await until(() => !!run.receipt || run.failure || child.exitCode !== null || child.signalCode !== null, 18_000);
    assert.equal(parentRetired, false, 'NATIVE_IPC_PARENT_RETIRED');
    const receipt = run.receipt;
    check(`${label}_complete_owned_worker_receipt`, !run.failure && !!receipt && receipt.mode === mode
      && boundWorker(run) && child.exitCode === null && child.signalCode === null);
    if (!receipt) throw new Error('NATIVE_IPC_RECEIPT_MISSING');
    check(`${label}_exact_worker_contract`, receipt.pass && receipt.total === WORKER_CHECKS[mode].length
      && receipt.checks.every((row, index) => row.name === WORKER_CHECKS[mode][index]));
    for (const row of receipt.checks) check(`${label}_${row.name}`, row.pass);
    return run;
  }
  async function execute() {
    check('production_module_paths_exist', fs.existsSync(modulePath) && fs.existsSync(supervisorPath));
    check('native_producer_default_off', !producer.status().collectionActive && nativeTimers.size === 0 && resourceReads === 0);
    phase = 'normal'; const normal = await launch('normal', 'normal'); await close(normal);
    check('normal_exact_cleanup', normal.child.exitCode === 0 && !producer.status().collectionActive && nativeTimers.size === 0);
    phase = 'abort'; const aborted = await launch('abort', 'abort'); await close(aborted);
    check('abort_exact_cleanup', aborted.child.exitCode === 0 && !producer.status().collectionActive && nativeTimers.size === 0);
    phase = 'timeout'; const timedOut = await launch('timeout', 'timeout'); await close(timedOut);
    check('timeout_exact_cleanup', timedOut.child.exitCode === 0 && !producer.status().collectionActive && nativeTimers.size === 0);
    phase = 'rebind'; const first = await launch('leave-active', 'old_epoch');
    const oldStatus = producer.status(), oldReceive = first.receive, oldFrame = first.originalStart;
    check('old_epoch_capture_is_active', oldStatus.collectionActive && oldStatus.ownedTimerCount > 0);
    await close(first);
    check('old_epoch_exact_key_retired', !producer.status().collectionActive && nativeTimers.size === 0 && producer.status().lastStopReason === 'retired');
    const next = await launch('leave-active', 'new_epoch'); const nextStatus = producer.status();
    check('rebind_same_producer_fresh_capture', nextStatus.producer.instanceId === oldStatus.producer.instanceId
      && next.binding.epoch !== first.binding.epoch && next.binding.nonce !== first.binding.nonce
      && nextStatus.collectionActive && nextStatus.captureId !== oldStatus.captureId);
    first.bridge?.retire('stale-old-bridge');
    const staleNotice = createNativePerformanceRetirementNotice(first.binding);
    oldReceive?.(staleNotice); next.receive?.(staleNotice);
    if (oldFrame) { oldReceive?.(oldFrame); next.receive?.(oldFrame); }
    check('stale_epoch_cannot_cancel_new_capture', !!oldFrame && producer.status().collectionActive
      && producer.status().captureId === nextStatus.captureId && next.notices === 0);
    await close(next);
    phase = 'retire-leg'; const retired = await launch('retire-leg', 'native_leg');
    await until(() => retired.notices > 0 && !producer.status().collectionActive && nativeTimers.size === 0, 2000);
    check('actual_backend_leg_notice_stops_exact_host_capture', retired.notices === 1 && producer.status().ownedTimerCount === 0
      && producer.status().failedTimerCount === 0 && !producer.status().eventLoopDelayMonitoring);
    const readsAfterRetirement = resourceReads, observedAt = performance.now();
    await until(() => retired.alive && performance.now() - observedAt >= 1100, 3000);
    check('native_retirement_preserves_ordinary_processes', retired.child.exitCode === null && retired.child.signalCode === null
      && retired.child.connected && retired.alive);
    check('retired_capture_has_no_subsequent_resource_reads', resourceReads === readsAfterRetirement && !producer.status().collectionActive && nativeTimers.size === 0);
    await close(retired);
    phase = 'legacy'; const legacy = await launch('legacy', 'legacy'); await close(legacy);
    check('legacy_ordinary_shutdown', legacy.child.exitCode === 0 && nativeTimers.size === 0);
  }
  try {
    await Promise.race([execute(), new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => {
      parentRetired = true; reject(new Error('NATIVE_IPC_DEADLINE'));
    }, 80_000); })]);
  } catch { checks.push({ name: `parent_${phase}_completed`, pass: false }); }
  finally {
    parentRetired = true;
    if (deadline) clearTimeout(deadline);
    for (const run of runs) {
      try { await close(run); } catch { checks.push({ name: 'owned_child_cleanup_confirmed', pass: false }); }
    }
    const result = host.dispose();
    checks.push({ name: 'activation_cleanup_confirmed', pass: result.ok && !result.status.collectionActive
      && result.status.ownedTimerCount === 0 && result.status.failedTimerCount === 0 && !result.status.eventLoopDelayMonitoring && nativeTimers.size === 0 });
    const allTerminal = runs.every(terminalAndDrained);
    checks.push({ name: 'all_owned_supervisors_terminal', pass: allTerminal });
    const workersAbsent = runs.every(run => boundWorker(run) && pidAbsent(run.supervisedPid));
    checks.push({ name: 'all_bound_worker_pids_absent', pass: workersAbsent });
    try {
      const markerOwned = nativeIpcOwnerMarkerPermitsCleanup(owner, {
        lstat: () => fs.lstatSync(ownerFile), read: () => fs.readFileSync(ownerFile, 'utf8'),
      });
      const entries = fs.readdirSync(ownedRoot).sort();
      const safe = allTerminal && workersAbsent && markerOwned
        && fs.realpathSync(ownedRoot) === path.resolve(ownedRoot) && !fs.lstatSync(ownedRoot).isSymbolicLink()
        && entries.join(',') === 'discovery,owner.json' && !fs.lstatSync(discovery).isSymbolicLink() && fs.readdirSync(discovery).length === 0;
      if (safe) {
        fs.rmSync(ownedRoot, { recursive: true });
        checks.push({ name: 'owned_scratch_retired', pass: !fs.existsSync(ownedRoot) });
      } else checks.push({ name: 'owned_scratch_retired', pass: false });
    } catch { checks.push({ name: 'owned_scratch_retired', pass: false }); }
  }
  const passed = checks.filter(row => row.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks,
    realOwnedIpc: true, productionModules: true, installedHostOrGameProof: false };
}

// BEGIN native public replay owner. Source-only; default IPC and staged probes stay separate.
import { types as publicStartupNodeTypes } from 'node:util';
import { isMainThread as publicPreloadMainThread } from 'node:worker_threads';
const PUBLIC_FAULT_CHECKS = new Set(['public_listener_selected', 'public_read_callback_held', 'public_read_callback_released',
  'public_abort_late_ack_replayed', 'public_cleanup_results_held', 'public_cleanup_results_released',
  'public_mcp_late_ack_replayed', 'public_eof_late_ack_replayed']);
interface PublicStartupError { name: string | null; code: string | null; message: string | null }
interface PublicStartupStderr { pending: string; dropping: boolean; lines: string[]; omitted: number; stopped: boolean }
const PUBLIC_STARTUP_LINE_BYTES = 512, PUBLIC_STARTUP_STDERR_BYTES = 2048;
const PUBLIC_STARTUP_FIXED_SYMBOLS = new Set(['NATIVE_PUBLIC_SERVER_WORKER_FAILED', 'VALIDATOR_FINGERPRINT_UNAVAILABLE']);
function publicStartupText(value: string, secrets: readonly string[]): string {
  if (value.length > 4096) return '[oversized startup message omitted]';
  if (/\b(?:request|payload|environment|env|body)["']?\s*[:=]\s*[{\[]/i.test(value)) return '[structured startup data omitted]';
  let text = value;
  for (const secret of secrets.slice(0, 8)) if (secret) text = text.split(secret).join('[redacted]');
  text = text.replace(/\bBearer[ \t]+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\bx4fk_[A-Za-z0-9_-]+/g, '[agent-key]')
    .replace(/file:\/\/\/[^\r\n"'<>]*/gi, '[path]')
    .replace(/\b[A-Za-z]:[\\/][^\r\n"'<>]*/g, '[path]')
    .replace(/\\\\[^\r\n"'<>]*/g, '[path]')
    .replace(/(^|[\s("'=])\/[^\r\n"'<>]*/g, '$1[path]')
    .replace(/(?:%(?:USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP)%|\$(?:HOME|USERPROFILE)|~)[\\/][^\r\n"'<>]*/gi, '[profile-path]')
    .replace(/\b[a-f0-9]{24,}\b/gi, '[opaque]')
    .replace(/\b[A-Za-z0-9+_=-]{32,}\b/g, token => PUBLIC_STARTUP_FIXED_SYMBOLS.has(token) || /^ERR_[A-Z0-9_]{1,60}$/.test(token) ? token : '[opaque]')
    .replace(/[^\x20-\x7e]/g, '?');
  return text.slice(0, PUBLIC_STARTUP_LINE_BYTES);
}
function publicStartupOwn(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  if (publicStartupNodeTypes.isProxy(value)) return null;
  try {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (field && !Object.hasOwn(field, 'value')) return null;
      result[key] = field?.value;
    }
    return result;
  } catch { return null; }
}
function publicStartupError(value: unknown, secrets: readonly string[]): PublicStartupError | null {
  const data = publicStartupOwn(value, ['name', 'code', 'message']); if (!data) return null;
  if (data.message !== undefined && typeof data.message !== 'string') return null;
  return { name: typeof data.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(data.name)
      && publicStartupText(data.name, secrets) === data.name ? data.name : null,
    code: typeof data.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(data.code)
      && publicStartupText(data.code, secrets) === data.code ? data.code : null,
    message: typeof data.message === 'string' ? publicStartupText(data.message, secrets) : null };
}
const publicStartupStderr = (): PublicStartupStderr => ({ pending: '', dropping: false, lines: [], omitted: 0, stopped: false });
function publicStartupStderrLine(state: PublicStartupStderr, line: string, secrets: readonly string[]) {
  if (!/^(?:\[sidecar-supervisor\] |\[native-performance\] |\[parent-liveness\] |NATIVE_PUBLIC_SERVER_WORKER_FAILED(?: |$)|Server failure:|FATAL ERROR:|[A-Za-z]*Error(?:\s*\[[A-Z0-9_]+\])?:|Node\.js v[0-9.])/.test(line)) {
    state.omitted++; return;
  }
  state.lines.push(publicStartupText(line, secrets));
  while (state.lines.join('\n').length > PUBLIC_STARTUP_STDERR_BYTES) { state.lines.shift(); state.omitted++; }
}
function publicStartupAppend(state: PublicStartupStderr, chunk: string, secrets: readonly string[]) {
  if (state.stopped) return;
  for (const unit of chunk) {
    if (unit === '\n') {
      if (!state.dropping && state.pending) publicStartupStderrLine(state, state.pending.replace(/\r$/, ''), secrets);
      state.pending = ''; state.dropping = false;
    } else if (!state.dropping) {
      state.pending += unit;
      if (state.pending.length > 1024) { state.pending = ''; state.dropping = true; state.omitted++; }
    }
  }
}
function publicStartupSeal(state: PublicStartupStderr, _secrets: readonly string[]) {
  if (state.stopped) return;
  if (state.pending) state.omitted++;
  state.pending = ''; state.dropping = false; state.stopped = true;
}
function publicStartupLegs(rows: readonly unknown[], secrets: readonly string[]) {
  const number = (value: unknown, positive = false) => typeof value === 'number' && Number.isSafeInteger(value) && value >= (positive ? 1 : 0) ? value : null;
  const boolean = (value: unknown) => typeof value === 'boolean' ? value : null;
  const legs = rows.slice(0, 2).map(row => {
    const data = publicStartupOwn(row, ['leg', 'supervisorPid', 'backendPid', 'backendPidWitnessCount', 'port', 'exitCode', 'signalCode',
      'connected', 'closed', 'stdoutClosed', 'stderrClosed', 'nativeHelloObserved', 'identityObserved', 'startupComplete', 'failure', 'outputBytes', 'error', 'stderr', 'stderrOmittedLines']);
    if (!data) return null;
    const stderr = publicStartupStderr();
    if (typeof data.stderr === 'string') publicStartupAppend(stderr, data.stderr, secrets); publicStartupSeal(stderr, secrets);
    const port = number(data.port, true);
    return { leg: data.leg === 'native' || data.leg === 'legacy' ? data.leg : null,
      supervisorPid: number(data.supervisorPid, true), backendPid: number(data.backendPid, true), backendPidWitnessCount: number(data.backendPidWitnessCount),
      port: port !== null && port <= 65535 ? port : null, exitCode: number(data.exitCode),
      signalCode: typeof data.signalCode === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(data.signalCode) ? data.signalCode : null,
      connected: boolean(data.connected), closed: boolean(data.closed), stdoutClosed: boolean(data.stdoutClosed), stderrClosed: boolean(data.stderrClosed),
      nativeHelloObserved: boolean(data.nativeHelloObserved), identityObserved: boolean(data.identityObserved), startupComplete: boolean(data.startupComplete),
      failure: boolean(data.failure), outputBytes: number(data.outputBytes),
      error: publicStartupError(data.error, secrets), stderr: stderr.lines.join('\n'),
      stderrOmittedLines: (number(data.stderrOmittedLines) ?? 0) + stderr.omitted };
  });
  return { legs, omittedLegs: Math.max(0, rows.length - 2) };
}

/** Pure privacy/failure boundaries only: no filesystem, timers, process or child operations. */
export function runNativePerformancePublicStartupDiagnosticsSelftest() {
  const checks: Check[] = [];
  const check = (name: string, work: () => void) => {
    try { work(); checks.push({ name, pass: true }); } catch { checks.push({ name, pass: false }); }
  };
  const secrets = ['session_private_1234567890', 'nonce_private_1234567890', 'epoch_private_1234567890'];
  const error = (message: string) => publicStartupError({ name: 'TypeError', code: 'ERR_STARTUP', message }, secrets);
  const append = (text: string) => { const state = publicStartupStderr(); publicStartupAppend(state, text, secrets); publicStartupSeal(state, secrets); return state; };
  check('startup_own_data_error_is_closed_and_preserves_reason', () => {
    assert.deepEqual(error('Module unavailable.'), { name: 'TypeError', code: 'ERR_STARTUP', message: 'Module unavailable.' });
    assert.equal(publicStartupError({ code: 'VALIDATOR_FINGERPRINT_UNAVAILABLE', message: 'ENOENT: missing file.' }, secrets)!.code, 'VALIDATOR_FINGERPRINT_UNAVAILABLE');
  });
  check('startup_selected_accessors_are_refused_without_invocation', () => {
    let reads = 0;
    for (const key of ['name', 'code', 'message']) {
      const value = Object.defineProperty({ name: 'Error', code: 'ERR_TEST', message: 'safe' }, key, { get() { reads++; return 'private'; } });
      assert.equal(publicStartupError(value, secrets), null);
    }
    assert.equal(reads, 0);
  });
  check('startup_throwing_descriptor_trap_fails_closed', () => {
    let traps = 0;
    assert.equal(publicStartupError(new Proxy({}, { getOwnPropertyDescriptor() { traps++; throw new Error('private trap payload'); } }), secrets), null);
    assert.equal(traps, 0);
  });
  // BEGIN startup returning-Proxy privacy regression.
  check('startup_returning_proxy_cannot_fabricate_error_or_identity_evidence', () => {
    let traps = 0;
    const fabricated: Record<string, unknown> = { name: 'Error', code: 'ERR_FABRICATED', message: 'fabricated error evidence',
      leg: 'native', supervisorPid: 123, backendPid: 124, backendPidWitnessCount: 1, port: 45000 };
    const proxy = new Proxy({}, { getOwnPropertyDescriptor(_target, key) {
      traps++; return { configurable: true, enumerable: true, writable: true, value: typeof key === 'string' ? fabricated[key] : undefined };
    } });
    const projectedError = publicStartupError(proxy, secrets), projectedLeg = publicStartupLegs([proxy], secrets).legs[0];
    assert.equal(traps, 0); assert.equal(projectedError, null); assert.equal(projectedLeg, null);
  });
  // END startup returning-Proxy privacy regression.
  check('startup_inherited_accessors_never_supply_error_evidence', () => {
    let reads = 0; const value = Object.create({ get message() { reads++; return 'private'; } });
    assert.deepEqual(publicStartupError(value, secrets), { name: null, code: null, message: null }); assert.equal(reads, 0);
  });
  check('startup_unknown_and_nonstring_messages_are_not_coerced', () => {
    let coercions = 0;
    for (const value of [null, undefined, 'private', 42, { message: { toString() { coercions++; return 'private'; } } }]) assert.equal(publicStartupError(value, secrets), null);
    assert.equal(coercions, 0);
  });
  check('startup_known_session_nonce_and_epoch_are_redacted', () => {
    const value = error(secrets.join(' '))!.message!; for (const secret of secrets) assert(!value.includes(secret));
    assert.equal(publicStartupError({ code: 'PRIVATESESSIONTOKEN', message: 'safe' }, ['PRIVATESESSIONTOKEN'])!.code, null);
  });
  check('startup_bearer_agent_key_and_opaque_tokens_are_redacted', () => {
    const tokens = ['bearer_private_value', 'x4fk_' + 'a'.repeat(64), '0123456789abcdef'.repeat(4), 'Ab9Zq7Rw'.repeat(8)];
    const value = error('Bearer ' + tokens.join(' '))!.message!; for (const token of tokens) assert(!value.includes(token));
  });
  check('startup_windows_absolute_paths_with_spaces_are_redacted', () => assert(!error("Cannot load 'C:\\Users\\Private Name\\secret.ts'")!.message!.includes('Private Name')));
  check('startup_unc_paths_are_redacted', () => assert(!error("Cannot load '\\\\private-server\\private-share\\secret.ts'")!.message!.includes('private-share')));
  check('startup_file_urls_are_redacted', () => assert(!error("Cannot import 'file:///C:/Users/Private/secret.ts'")!.message!.includes('Users/Private')));
  check('startup_posix_and_profile_expansions_are_redacted', () => {
    for (const path of ['/home/private/secret', '/arbitrary-private/secret', '%USERPROFILE%\\secret', '$HOME/secret', '~/secret']) assert(!error('Cannot load "' + path + '"')!.message!.includes(path));
  });
  check('startup_error_drops_stack_environment_request_and_payload_fields', () => {
    const value = publicStartupError({ name: 'Error', code: 'ERR_TEST', message: 'safe', stack: secrets[0], env: secrets[1], request: secrets[2], payload: 'private' }, secrets);
    assert.deepEqual(Object.keys(value!).sort(), ['code', 'message', 'name']); assert(!JSON.stringify(value).includes('private'));
    assert.equal(error('request={"private":"short secret"}')!.message, '[structured startup data omitted]');
  });
  check('startup_message_is_at_most_512_ascii_bytes', () => {
    const message = error(('safe \u00e9\u0000').repeat(140))!.message!; assert(message.length <= 512); assert(/^[\x20-\x7e]*$/.test(message));
    assert.equal(error('safe '.repeat(200))!.message!.length, 512);
  });
  check('startup_oversized_error_message_is_omitted_not_partially_logged', () => assert.equal(error('safe '.repeat(1000))!.message, '[oversized startup message omitted]'));
  check('startup_only_known_stderr_line_classes_are_retained', () => {
    const state = append('Error: Cannot load "' + secrets[0] + '"\n[sidecar-supervisor] owned server exited.\nNATIVE_PUBLIC_SERVER_WORKER_FAILED {"code":"ERR_TEST"}\nFATAL ERROR: heap exhausted\nprivate request payload\n');
    assert.equal(state.lines.length, 4); assert.equal(state.omitted, 1); assert(!state.lines.join('\n').includes(secrets[0]));
    assert(state.lines[2].startsWith('NATIVE_PUBLIC_SERVER_WORKER_FAILED'));
  });
  check('startup_unknown_lines_are_count_only_omissions', () => {
    const state = append('{"request":"' + secrets[1] + '"}\n    at private stack frame\n'); assert.deepEqual(state.lines, []); assert.equal(state.omitted, 2);
  });
  check('startup_oversized_split_line_is_discarded_until_newline', () => {
    const state = publicStartupStderr(); publicStartupAppend(state, 'Error: ' + 'x'.repeat(1100), secrets);
    publicStartupAppend(state, secrets[0] + '\nError: safe\n', secrets); publicStartupSeal(state, secrets);
    assert.deepEqual(state.lines, ['Error: safe']); assert.equal(state.omitted, 1); assert.equal(state.pending, '');
  });
  check('startup_split_secrets_are_redacted_only_after_complete_line', () => {
    const state = publicStartupStderr(); publicStartupAppend(state, 'Error: ' + secrets[0].slice(0, 9), secrets);
    assert.deepEqual<string[]>(state.lines, []); publicStartupAppend(state, secrets[0].slice(9) + '\n', secrets);
    assert(!state.lines.join('\n').includes(secrets[0])); assert(state.lines[0].includes('[redacted]'));
  });
  check('startup_stderr_tail_never_exceeds_2_kib', () => {
    const state = append(('Error: ' + 'safe '.repeat(140) + '\n').repeat(20));
    assert(state.lines.join('\n').length <= 2048); assert(state.lines.every(line => line.length <= 512)); assert(state.omitted > 0);
  });
  check('startup_sealing_prevents_post_identity_or_credential_capture', () => {
    const state = publicStartupStderr(); publicStartupAppend(state, 'Error: safe\n', secrets); publicStartupSeal(state, secrets);
    assert.deepEqual(state.lines, ['Error: safe']);
    const before = JSON.stringify(state); publicStartupAppend(state, 'Error: ' + secrets[0] + '\n', secrets);
    assert.equal(JSON.stringify(state), before); assert.equal(state.pending, '');
  });
  // BEGIN startup partial-secret seal regression.
  check('startup_seal_omits_short_split_secret_and_preserves_completed_lines', () => {
    const state = publicStartupStderr(), prefix = secrets[0].slice(0, 10);
    publicStartupAppend(state, 'Error: safe\nError: ' + prefix, secrets); publicStartupSeal(state, secrets);
    assert.deepEqual(state.lines, ['Error: safe']); assert.equal(state.omitted, 1); assert.equal(state.pending, '');
    const sealed = JSON.stringify(state); assert(!sealed.includes(prefix));
    publicStartupAppend(state, secrets[0].slice(10) + '\n', secrets); assert.equal(JSON.stringify(state), sealed);
  });
  // END startup partial-secret seal regression.
  check('startup_projection_is_closed_and_has_at_most_two_legs', () => {
    const value = publicStartupLegs([{ leg: 'native', supervisorPid: 12, backendPid: 13, backendPidWitnessCount: 1, port: 45000, stderr: 'Error: safe\n', payload: secrets[0] },
      { leg: 'legacy' }, { leg: 'extra', payload: secrets[1] }], secrets);
    assert.equal(value.legs.length, 2); assert.equal(value.omittedLegs, 1); assert(!JSON.stringify(value).includes('private')); assert(!Object.hasOwn(value.legs[0]!, 'payload'));
  });
  check('startup_diagnostic_accessors_traps_and_unknown_identity_fail_closed', () => {
    let reads = 0;
    assert.equal(publicStartupLegs([Object.defineProperty({}, 'leg', { get() { reads++; return 'native'; } })], secrets).legs[0], null);
    assert.equal(publicStartupLegs([new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('private'); } })], secrets).legs[0], null);
    const value = publicStartupLegs([{ leg: 'native', supervisorPid: 0, backendPid: -1, port: 70000, exitCode: null }], secrets).legs[0]!;
    assert.equal(reads, 0); assert.equal(value.supervisorPid, null); assert.equal(value.backendPid, null); assert.equal(value.port, null); assert.equal(value.exitCode, null);
  });
  const passed = checks.filter(row => row.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks, pure: true };
}
// BEGIN native public preload gate.
function publicPreloadRequested(nodeArguments: readonly string[], moduleUrl: string): boolean {
  return nodeArguments.some((argument, index) => argument === '--import' && nodeArguments[index + 1] === moduleUrl);
}
function publicPreloadGate(context: unknown, physical: () => unknown): boolean {
  const data = publicStartupOwn(context, ['role', 'scenario', 'mainThread', 'connected', 'hasSend', 'preloadRequested', 'entry', 'expectedEntry']);
  if (!data || data.role !== 'public-server' || (data.scenario !== 'native' && data.scenario !== 'legacy')
    || data.mainThread !== true || data.connected !== true || data.hasSend !== true || data.preloadRequested !== true
    || typeof data.entry !== 'string' || typeof data.expectedEntry !== 'string' || !path.isAbsolute(data.entry)
    || !path.isAbsolute(data.expectedEntry) || path.basename(data.expectedEntry) !== 'server.ts' || data.entry !== data.expectedEntry) return false;
  try {
    const actual = publicStartupOwn(physical(), ['entry', 'expectedEntry']);
    return !!actual && actual.entry === data.expectedEntry && actual.expectedEntry === data.expectedEntry;
  } catch { return false; }
}
/** Pure context/physical-witness gate checks; callbacks below never access the filesystem. */
export function runNativePerformancePublicPreloadGateSelftest() {
  const checks: Check[] = [];
  const check = (name: string, work: () => void) => {
    try { work(); checks.push({ name, pass: true }); } catch { checks.push({ name, pass: false }); }
  };
  const expectedEntry = '/owned-public-preload/server.ts';
  const base = () => ({ role: 'public-server', scenario: 'native', mainThread: true, connected: true, hasSend: true, preloadRequested: true, entry: expectedEntry, expectedEntry });
  const actual = () => ({ entry: expectedEntry, expectedEntry });
  check('preload_exact_native_backend_activates_with_one_physical_probe', () => {
    let probes = 0; const value = base(), before = JSON.stringify(value);
    assert.equal(publicPreloadGate(value, () => { probes++; return actual(); }), true);
    assert.equal(probes, 1); assert.equal(JSON.stringify(value), before);
  });
  check('preload_exact_legacy_backend_activates_without_native_faults', () => assert.equal(publicPreloadGate({ ...base(), scenario: 'legacy' }, actual), true));
  check('preload_missing_or_wrong_role_is_inert_without_probe', () => {
    let probes = 0;
    for (const role of [undefined, null, '', 'worker', 'studio', 'public-server-child']) assert.equal(publicPreloadGate({ ...base(), role }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_missing_or_wrong_scenario_is_inert_without_probe', () => {
    let probes = 0;
    for (const scenario of [undefined, null, '', 'normal', 'native-other', true, {}]) assert.equal(publicPreloadGate({ ...base(), scenario }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_nonmain_thread_and_truthy_substitutes_are_inert', () => {
    let probes = 0;
    for (const mainThread of [false, undefined, 1, 'true']) assert.equal(publicPreloadGate({ ...base(), mainThread }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_disconnected_channel_and_truthy_substitutes_are_inert', () => {
    let probes = 0;
    for (const connected of [false, undefined, 1, 'true']) assert.equal(publicPreloadGate({ ...base(), connected }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_missing_send_function_witness_is_inert', () => {
    let probes = 0;
    for (const hasSend of [false, undefined, 1, 'true']) assert.equal(publicPreloadGate({ ...base(), hasSend }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_ordinary_import_without_exact_preload_argument_is_inert', () => {
    const moduleUrl = 'file:///owned-public-preload/nativePerformanceIpc.selftest.ts';
    for (const tuple of [['--import', moduleUrl], ['--max-old-space-size=512', '--import', 'file:///loader/tsx.mjs', '--import', moduleUrl]]) {
      let validProbes = 0; const preloadRequested = publicPreloadRequested(tuple, moduleUrl);
      assert.equal(preloadRequested, true);
      assert.equal(publicPreloadGate({ ...base(), preloadRequested }, () => { validProbes++; return actual(); }), true);
      assert.equal(validProbes, 1);
    }
    let probes = 0;
    for (const preloadRequested of [false, undefined, 1, 'true']) assert.equal(publicPreloadGate({ ...base(), preloadRequested }, () => { probes++; return actual(); }), false);
    for (const tuple of [[], ['--import'], [moduleUrl], ['--import', 'file:///owned-public-preload/other.ts'],
      ['--import', '--max-old-space-size=512', moduleUrl], [moduleUrl, '--import'], ['--import=' + moduleUrl],
      ['--require', moduleUrl], ['--import', './nativePerformanceIpc.selftest.ts'], ['--import', moduleUrl + '?copy=1']]) {
      const preloadRequested = publicPreloadRequested(tuple, moduleUrl); assert.equal(preloadRequested, false);
      assert.equal(publicPreloadGate({ ...base(), preloadRequested }, () => { probes++; return actual(); }), false);
    }
    assert.equal(probes, 0);
  });
  check('preload_missing_or_wrong_entry_is_inert', () => {
    let probes = 0;
    for (const entry of [undefined, null, '', '/owned-public-preload/other.ts']) assert.equal(publicPreloadGate({ ...base(), entry }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_relative_entry_and_expected_entry_are_inert', () => {
    let probes = 0;
    assert.equal(publicPreloadGate({ ...base(), entry: 'server.ts', expectedEntry: 'server.ts' }, () => { probes++; return { entry: 'server.ts', expectedEntry: 'server.ts' }; }), false);
    assert.equal(probes, 0);
  });
  check('preload_old_ipc_wrapper_entry_never_probes_or_activates', () => {
    let probes = 0;
    assert.equal(publicPreloadGate({ ...base(), entry: '/owned-public-preload/vscode-extension/src/nativePerformanceIpc.selftest.ts' }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_lexical_alias_is_inert_even_with_matching_physical_witness', () => {
    let probes = 0;
    assert.equal(publicPreloadGate({ ...base(), entry: '/owned-public-preload/alias/../server.ts' }, () => { probes++; return actual(); }), false);
    assert.equal(probes, 0);
  });
  check('preload_different_physical_backend_entry_is_inert', () => {
    let probes = 0;
    assert.equal(publicPreloadGate(base(), () => { probes++; return { entry: '/other/server.ts', expectedEntry }; }), false);
    assert.equal(probes, 1);
  });
  check('preload_aliased_expected_server_root_is_inert', () => {
    let probes = 0;
    assert.equal(publicPreloadGate(base(), () => { probes++; return { entry: '/physical/server.ts', expectedEntry: '/physical/server.ts' }; }), false);
    assert.equal(probes, 1);
  });
  check('preload_failed_or_unknown_physical_probe_is_inert', () => {
    let probes = 0;
    assert.equal(publicPreloadGate(base(), () => { probes++; throw new Error('physical unavailable'); }), false);
    for (const value of [null, {}, { entry: expectedEntry }, { expectedEntry }]) assert.equal(publicPreloadGate(base(), () => { probes++; return value; }), false);
    assert.equal(probes, 5);
  });
  check('preload_ordinary_import_and_inherited_nonbackend_fork_are_inert', () => {
    let probes = 0;
    for (const value of [{ ...base(), role: undefined }, { ...base(), entry: '/owned-public-preload/fork-worker.ts' }]) {
      const before = JSON.stringify(value);
      assert.equal(publicPreloadGate(value, () => { probes++; return actual(); }), false); assert.equal(JSON.stringify(value), before);
    }
    assert.equal(probes, 0);
  });
  check('preload_context_accessors_and_proxies_are_refused_without_effects', () => {
    let reads = 0, traps = 0, probes = 0;
    const getter = Object.defineProperty(base(), 'role', { get() { reads++; return 'public-server'; } });
    const proxy = new Proxy(base(), { getOwnPropertyDescriptor() { traps++; throw new Error('trap'); } });
    for (const value of [getter, proxy]) assert.equal(publicPreloadGate(value, () => { probes++; return actual(); }), false);
    assert.equal(reads, 0); assert.equal(traps, 0); assert.equal(probes, 0);
  });
  const passed = checks.filter(row => row.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks, pure: true };
}
function installPublicServerFaults(native: boolean) {
  if (native) {
    const binding = { nonce: process.env.X4_FORGE_PARENT_NONCE || '', epoch: process.env.X4_FORGE_NATIVE_EPOCH || '' };
    const originalSend = process.send, originalOn = process.on, originalRemove = process.removeListener;
    assert.equal(typeof originalSend, 'function');
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const emit = (name: string, pass = true) => {
      assert.ok(PUBLIC_FAULT_CHECKS.has(name));
      process.stdout.write(PREFIX + JSON.stringify({ kind: 'native-ipc-worker-v1', mode: 'public', pid: process.pid,
        pass, passed: pass ? 1 : 0, total: 1, checks: [{ name, pass }] }) + '\n');
    };
    const later = (work: () => void, milliseconds: number) => {
      const timer = setTimeout(() => { timers.delete(timer); work(); }, milliseconds); timers.add(timer);
    };
    let reads = 0, activeResults = 0, heldOrdinal = 0;
    let held: unknown[] = [], cleanupHeld = false;
    // Hold an ACTUAL callback, after Node reports its actual result. The bytes
    // have already traversed IPC; no callback success or execution ACK is invented.
    process.send = ((message: unknown, ...args: unknown[]) => {
      const decoded = decodeNativePerformanceFrame(message, { binding, direction: 'backend-to-host' });
      if (decoded.ok && decoded.frame.type === 'read' && ++reads === 4) {
        const index = args.findIndex(value => typeof value === 'function'); assert.ok(index >= 0);
        const callback = args[index] as (error: Error | null) => void;
        args[index] = (error: Error | null) => {
          if (error !== null) { emit('public_read_callback_held', false); callback(error); return; }
          emit('public_read_callback_held');
          later(() => { emit('public_read_callback_released'); callback(error); }, 3500);
        };
      }
      return Reflect.apply(originalSend!, process, [message, ...args]);
    }) as typeof process.send;
    let selected: ((...args: unknown[]) => void) | undefined, wrapped: ((raw: unknown) => void) | undefined;
    process.on = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
      if (event !== 'message' || selected) return Reflect.apply(originalOn, process, [event, listener]);
      selected = listener;
      const deliver = (raw: unknown) => Reflect.apply(listener, process, [raw]);
      wrapped = (raw: unknown) => {
        const decoded = decodeNativePerformanceFrame(raw, { binding, direction: 'host-to-backend' });
        if (!decoded.ok) { deliver(raw); return; }
        if (cleanupHeld) { held.push(raw); assert.ok(held.length <= 16); return; }
        if (decoded.frame.type === 'result' && decoded.frame.result.ok && decoded.frame.result.status.collectionActive) {
          activeResults++;
          if ([2, 3, 4, 5].includes(activeResults)) { heldOrdinal = activeResults; held = [raw]; return; }
        }
        if (held.length) {
          held.push(raw); assert.ok(held.length <= 16);
          if (decoded.frame.type !== 'result' || decoded.frame.result.status.collectionActive) return;
          if (heldOrdinal === 3) {
            cleanupHeld = true; emit('public_cleanup_results_held');
            later(() => {
              const actual = held; held = []; cleanupHeld = false;
              for (const frame of actual) deliver(frame);
              emit('public_cleanup_results_released');
            }, 6000);
          } else {
            const actual = held; held = [];
            for (const frame of actual) deliver(frame);
            emit(heldOrdinal === 2 ? 'public_abort_late_ack_replayed' : heldOrdinal === 4 ? 'public_mcp_late_ack_replayed' : 'public_eof_late_ack_replayed');
          }
          return;
        }
        deliver(raw);
      };
      process.on = originalOn;
      emit('public_listener_selected');
      return Reflect.apply(originalOn, process, [event, wrapped]);
    }) as typeof process.on;
    process.removeListener = ((event: string | symbol, listener: (...args: unknown[]) => void) => {
      if (event === 'message' && listener === selected && wrapped) return Reflect.apply(originalRemove, process, [event, wrapped]);
      return Reflect.apply(originalRemove, process, [event, listener]);
    }) as typeof process.removeListener;
    process.once('exit', () => {
      process.send = originalSend; process.on = originalOn; process.removeListener = originalRemove;
      for (const timer of timers) clearTimeout(timer); timers.clear();
    });
  }
}
function activatePublicServerPreload(): boolean {
  const expectedEntry = path.resolve(__dirname, '../../server.ts'), entry = process.argv[1];
  const scenario = process.env.X4_NATIVE_PERFORMANCE_SELFTEST_SCENARIO;
  const preloadUrl = pathToFileURL(modulePath).href;
  const preloadRequested = publicPreloadRequested(process.execArgv, preloadUrl);
  if (!publicPreloadGate({ role: process.env.X4_NATIVE_PERFORMANCE_SELFTEST_ROLE, scenario, mainThread: publicPreloadMainThread,
    connected: process.connected === true, hasSend: typeof process.send === 'function', preloadRequested, entry, expectedEntry },
  () => ({ entry: fs.realpathSync(entry!), expectedEntry: fs.realpathSync(expectedEntry) }))) return false;
  delete process.env.X4_NATIVE_PERFORMANCE_SELFTEST_ROLE; delete process.env.X4_NATIVE_PERFORMANCE_SELFTEST_SCENARIO;
  const secrets = [process.env.STUDIO_API_TOKEN || '', process.env.X4_FORGE_PARENT_NONCE || '', process.env.X4_FORGE_NATIVE_EPOCH || ''];
  process.on('uncaughtExceptionMonitor', error => {
    try { process.stderr.write('NATIVE_PUBLIC_SERVER_WORKER_FAILED ' + JSON.stringify(publicStartupError(error, secrets)) + '\n'); }
    catch { /* Observation must never consume, replace, or throw into the default fatal path. */ }
  });
  installPublicServerFaults(scenario === 'native');
  return true;
}
activatePublicServerPreload();
// END native public preload gate.

/** Test-only HTTP boundary: referenceRoutes plus apiFailureEnvelopeMiddleware/normalizeApiFailureBody.
 * Identity equality with stdout and both discovery records stays outside this resource witness. */
export function publicUnavailableCorpusHttpWitness(statusCode: number, body: unknown, expectedRoot: string): boolean {
  if (statusCode !== 503 || typeof expectedRoot !== 'string' || !path.isAbsolute(expectedRoot) || path.basename(expectedRoot) !== 'reference-unavailable') return false;
  const keys = ['category', 'code', 'error', 'failedStages', 'instance', 'status', 'success'];
  const data = publicStartupOwn(body, keys); if (!data) return false;
  try {
    if (Reflect.ownKeys(body as object).length !== keys.length || Object.keys(body as object).sort().join(',') !== keys.join(',')) return false;
    if (publicStartupNodeTypes.isProxy(data.instance) || !record(data.instance)) return false;
    const instance = publicStartupOwn(data.instance, ['pid', 'port', 'startedAt', 'mode']);
    return data.category === 'forge-failure' && data.success === false && data.status === 'FAILED' && data.code === 'API_SERVICE_UNAVAILABLE'
      && data.error === 'X4 unpacked reference root does not exist or is not a directory: ' + expectedRoot
      && !publicStartupNodeTypes.isProxy(data.failedStages) && Array.isArray(data.failedStages) && data.failedStages.length === 0
      && Reflect.ownKeys(data.failedStages).length === 1 && !!instance
      && typeof instance.pid === 'number' && Number.isSafeInteger(instance.pid) && instance.pid > 0
      && typeof instance.port === 'number' && Number.isSafeInteger(instance.port) && instance.port > 0 && instance.port <= 65535
      && typeof instance.startedAt === 'string' && instance.startedAt.length > 0 && typeof instance.mode === 'string' && instance.mode.length > 0;
  } catch { return false; }
}

interface PublicReplayReport {
  schemaVersion: string; operation: string; ok: boolean; code?: string; availability: string; unavailableReason: string | null;
  ownership: string; status: { backendInstanceId: string; native: { producer: { pid: number; instanceId: string }; captureId: string | null;
    collectionActive: boolean; ownedTimerCount: number; failedTimerCount: number; eventLoopDelayMonitoring: boolean } | null;
    snapshot: { producer: { pid: number; instanceId: string }; resources: unknown[]; operations: Array<{ name: string; count: number }> } | null;
    snapshotAgeMs: number | null; cancellation: string; pending: string | null; cleanupUnconfirmed: boolean; captureOwned: boolean } | null;
}
interface PublicMcpMessage { id?: string | number; error?: unknown; result?: { isError?: boolean; content?: Array<{ text?: string }> } }
interface PublicMcpClient {
  child: ChildProcess; receivedMessages: readonly PublicMcpMessage[];
  request(method: string, params?: unknown, timeoutMs?: number): Promise<PublicMcpMessage>; close(): Promise<void>;
}
interface PublicRun {
  child: ChildProcess; root: string; native: boolean; binding: NativeWireBinding; current: boolean; bridge?: NativePerformanceHostBridge;
  supervisedPid: number; pidCount: number; startedAt: string | null; backendInstanceId: string | null; port: number; failure: boolean; buffer: string; outputBytes: number;
  closed: boolean; stdoutClosed: boolean; stderrClosed: boolean; cleanupConfirmed: boolean;
  startupComplete: boolean; startupError: PublicStartupError | null; startupStderr: PublicStartupStderr;
  faults: Set<string>; starts: Array<{ captureId: string; controlId: string }>; cancels: number; stops: number; reads: number;
}
interface PublicMcpOwner { client: PublicMcpClient; closed: boolean; stdoutClosed: boolean; stderrClosed: boolean; bytes: number; failure: boolean }

export async function runNativePerformancePublicReplaySelftest() {
  const checks: Check[] = [], runs: PublicRun[] = [], clients: PublicMcpOwner[] = [];
  const markerGuard = runNativePerformanceIpcOwnerMarkerGuardSelftest();
  if (!markerGuard.pass) return { ...markerGuard, realPublicReplay: false, installedHostOrGameProof: false };
  checks.push(...markerGuard.checks);
  const ownedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-native-ipc-'));
  const owner = crypto.randomUUID(), ownerFile = path.join(ownedRoot, 'owner.json');
  fs.writeFileSync(ownerFile, JSON.stringify({ owner }));
  const legNames = ['native', 'legacy'] as const;
  const storageNames = ['config', 'state', 'data', 'source-coordination', 'mods', 'schemas', 'scratch-game', 'discovery'] as const;
  for (const leg of legNames) {
    const root = path.join(ownedRoot, leg); fs.mkdirSync(root);
    for (const name of storageNames) fs.mkdirSync(path.join(root, name));
    fs.mkdirSync(path.join(root, 'scratch-game', 'extensions'));
  }
  let phase = 'initial', retired = false, resourceReads = 0, startupCause: PublicStartupError | null = null;
  const nativeTimers = new Map<NativePerformanceTimer, ReturnType<typeof setTimeout>>();
  const producer = createNativePerformance({ pid: process.pid, instanceId: crypto.randomUUID(), now: () => performance.now(), wallNow: () => Date.now(),
    resources: { pid: () => process.pid, cpuUsage: () => { resourceReads++; return process.cpuUsage(); }, memoryUsage: () => process.memoryUsage(),
      uptime: () => process.uptime(), logicalCpuCount: () => os.cpus().length, eventLoopUtilization: () => performance.eventLoopUtilization() },
    timers: { set(callback, milliseconds) { const timer: ReturnType<typeof setTimeout> = setTimeout(() => { nativeTimers.delete(timer); callback(); }, milliseconds);
      nativeTimers.set(timer, timer); return timer; }, clear(handle) { const timer = nativeTimers.get(handle); if (timer) { clearTimeout(timer); nativeTimers.delete(handle); } } },
    delayHistogram: () => monitorEventLoopDelay({ resolution: 20 }),
  });
  const host = createNativePerformanceHost({ producer });
  const session = crypto.randomBytes(32).toString('hex'), clientId = 'client_native_public_replay';
  let workspaceId = '', deadline: ReturnType<typeof setTimeout> | undefined;
  const check = (name: string, pass: boolean) => checked(checks, name, pass);
  const terminal = (run: PublicRun) => (run.child.exitCode !== null || run.child.signalCode !== null) && run.closed && run.stdoutClosed && run.stderrClosed;
  const bound = (run: PublicRun) => run.pidCount === 1 && run.supervisedPid > 0 && run.port > 0 && run.startedAt !== null;
  const sourceServer = path.resolve(__dirname, '../../server.ts');
  const mcpModule = path.resolve(__dirname, '../../scripts/mcp-capability-selftest.ts');
  let mcpFactory: ((base: string, auth: { key: string; workspaceId: string }) => Promise<PublicMcpClient>) | undefined;
  const admit = () => assert.equal(retired, false, 'NATIVE_PUBLIC_REPLAY_RETIRED');
  const enter = (value: string) => { admit(); phase = value; };
  async function http(run: PublicRun, token: string | null, method: string, route: string, body?: unknown, signal?: AbortSignal) {
    admit();
    assert.ok(run.port > 0 && ![3000, 3001, 3100, 3101].includes(run.port));
    const headers: Record<string, string> = { 'x-client-id': clientId };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (workspaceId) headers['x-workspace-id'] = workspaceId;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method === 'POST') headers['x-forge-operation-id'] = `forge_op_${crypto.randomBytes(16).toString('hex')}`;
    const response = await fetch(`http://127.0.0.1:${run.port}${route}`, { method, headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: signal ?? AbortSignal.timeout(7000) });
    const raw = await response.text(); assert.ok(Buffer.byteLength(raw) <= 2 * 1024 * 1024);
    return { status: response.status, body: JSON.parse(raw) as Record<string, unknown> };
  }
  const nativeReport = (response: { status: number; body: Record<string, unknown> }, status: number, operation: string) => {
    assert.equal(response.status, status); const body = response.body as unknown as PublicReplayReport;
    assert.deepEqual(Object.keys(body).sort(), ['schemaVersion', 'operation', 'ok', 'availability', 'unavailableReason', 'ownership', 'status',
      ...(Object.hasOwn(body, 'code') ? ['code'] : [])].sort());
    assert.equal(body.schemaVersion, 'forge.native-performance.report.v1'); assert.equal(body.operation, operation); return body;
  };
  async function closeRun(run: PublicRun) {
    if (run.cleanupConfirmed) return;
    run.current = false; run.bridge?.retire('owned-public-replay-shutdown');
    if (run.child.exitCode === null && run.child.signalCode === null) run.child.stdin?.end();
    let forced = false;
    try { await until(() => terminal(run), 3500); }
    catch { forced = true; if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM');
      try { await until(() => terminal(run), 1500); } catch { if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGKILL'); await until(() => terminal(run), 2000); } }
    if (bound(run)) await until(() => pidAbsent(run.supervisedPid), 2000);
    run.cleanupConfirmed = terminal(run) && bound(run) && pidAbsent(run.supervisedPid) && !forced && !run.failure && run.child.exitCode === 0;
    check(`public_${run.native ? 'native' : 'legacy'}_terminal_drained_bound_backend_absent`, run.cleanupConfirmed);
  }
  async function launch(native: boolean) {
    assert.equal(retired, false); const root = path.join(ownedRoot, native ? 'native' : 'legacy');
    const discovery = path.join(root, 'discovery');
    const binding = { nonce: crypto.randomBytes(32).toString('hex'), epoch: crypto.randomUUID() };
    const environment: NodeJS.ProcessEnv = { ...process.env, PORT: '0', NODE_ENV: 'development', API_ONLY: 'true', DISABLE_HMR: 'true', FORGE_ALLOW_RUN_COMMAND: 'false',
      STUDIO_API_TOKEN: session, X4_FORGE_MODE: 'dev-build', X4_FORGE_DEV_SCRATCH_SETTINGS: '1', X4_FORGE_DEV_ROOT: root,
      X4_GAME_PATH: path.join(root, 'scratch-game'), X4_CONFIG_DIR: path.join(root, 'config'), X4_STATE_DIR: path.join(root, 'state'),
      X4_DATA_DIR: path.join(root, 'data'), X4_SOURCE_COORDINATION_DIR: path.join(root, 'source-coordination'), X4FORGE_DISCOVERY_DIR: discovery,
      X4_REFERENCE_ROOT: path.join(root, 'reference-unavailable'), X4_XSD_PATH: path.join(root, 'schemas'),
      X4_NATIVE_PERFORMANCE_SELFTEST_ROLE: 'public-server', X4_NATIVE_PERFORMANCE_SELFTEST_SCENARIO: native ? 'native' : 'legacy',
      X4_FORGE_PARENT_MODE: 'pipe-v1', X4_FORGE_PARENT_PID: String(process.pid), X4_FORGE_PARENT_NONCE: binding.nonce,
      X4_FORGE_NATIVE_MODE: 'ipc-v1', X4_FORGE_NATIVE_EPOCH: binding.epoch };
    delete environment.NODE_OPTIONS; delete environment.X4_FORGE_PROJECT_CHECK_OWNER_POLICY;
    const child = spawn(process.execPath, ['--max-old-space-size=512', '--import', loaderPath, supervisorPath,
      sourceServer, '--max-old-space-size=512', '--import', loaderPath, '--import', pathToFileURL(modulePath).href], { cwd: root, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: native ? ['pipe', 'pipe', 'pipe', 'ipc'] : ['pipe', 'pipe', 'pipe'], env: environment });
    const run: PublicRun = { child, root, native, binding, current: true, supervisedPid: 0, pidCount: 0, startedAt: null, backendInstanceId: null, port: 0,
      failure: false, buffer: '', outputBytes: 0, closed: false, stdoutClosed: false, stderrClosed: false, cleanupConfirmed: false,
      startupComplete: false, startupError: null, startupStderr: publicStartupStderr(),
      faults: new Set(), starts: [], cancels: 0, stops: 0, reads: 0 };
    runs.push(run);
    child.once('error', error => {
      run.failure = true;
      if (!run.startupComplete) run.startupError = publicStartupError(error, [session, binding.nonce, binding.epoch]);
    }); child.once('close', () => { run.closed = true; });
    child.stdout?.once('close', () => { run.stdoutClosed = true; }); child.stderr?.once('close', () => {
      run.stderrClosed = true; publicStartupSeal(run.startupStderr, [session, binding.nonce, binding.epoch]);
    });
    const output = (chunk: Buffer, stdout: boolean) => {
      run.outputBytes += chunk.length; if (run.outputBytes > 262144) { run.failure = true; child.stdin?.end(); return; }
      if (!stdout) {
        if (!run.startupComplete) publicStartupAppend(run.startupStderr, chunk.toString('utf8'), [session, binding.nonce, binding.epoch]);
        return;
      }
      run.buffer += chunk.toString('utf8'); let index: number;
      while ((index = run.buffer.indexOf('\n')) >= 0) {
        const line = run.buffer.slice(0, index).trim(); run.buffer = run.buffer.slice(index + 1);
        const pid = /^\[sidecar-supervisor\] X4FORGE_SUPERVISED_PID=(\d+)$/.exec(line);
        if (pid) { run.pidCount++; run.supervisedPid = Number(pid[1]); if (run.pidCount !== 1) run.failure = true; }
        const port = /^X4 Forge Dev Server running on http:\/\/127\.0\.0\.1:(\d+)$/.exec(line); if (port) run.port = Number(port[1]);
        if (line.startsWith(PREFIX)) {
          try {
            const receipt: unknown = JSON.parse(line.slice(PREFIX.length));
            assert.ok(record(receipt) && receipt.kind === 'native-ipc-worker-v1' && receipt.mode === 'public' && receipt.pid === run.supervisedPid
              && receipt.pass === true && receipt.passed === 1 && receipt.total === 1 && Array.isArray(receipt.checks) && receipt.checks.length === 1);
            const row: unknown = receipt.checks[0]; assert.ok(record(row) && typeof row.name === 'string' && PUBLIC_FAULT_CHECKS.has(row.name)
              && row.pass === true && !run.faults.has(row.name)); run.faults.add(row.name);
          } catch { run.failure = true; }
        }
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => output(chunk, true)); child.stderr?.on('data', (chunk: Buffer) => output(chunk, false));
    if (native) run.bridge = host.attach({ binding, isCurrent: () => run.current && child.exitCode === null && child.signalCode === null,
      channel: { isConnected: () => child.connected, send: (frame, callback) => child.send(frame, callback),
        onMessage(listener) { const receive = (raw: unknown) => {
          if (!run.current || child.exitCode !== null || child.signalCode !== null) return;
          if (isNativePerformanceRetirementNotice(raw, binding)) { run.bridge?.retire('actual-public-native-retirement'); return; }
          const decoded = decodeNativePerformanceFrame(raw, { binding, direction: 'backend-to-host' });
          if (decoded.ok) { if (decoded.frame.type === 'hello') {
              if (run.backendInstanceId !== null && run.backendInstanceId !== decoded.frame.backendInstanceId) run.failure = true;
              run.backendInstanceId = decoded.frame.backendInstanceId;
            } else if (decoded.frame.type === 'start') run.starts.push({ captureId: decoded.frame.captureId, controlId: decoded.frame.controlId });
            else if (decoded.frame.type === 'cancel') run.cancels++; else if (decoded.frame.type === 'stop') run.stops++; else if (decoded.frame.type === 'read') run.reads++; }
          listener(raw);
        }; child.on('message', receive); return () => { child.removeListener('message', receive); }; },
        onDisconnect(listener) { child.on('disconnect', listener); return () => { child.removeListener('disconnect', listener); }; } } });
    await until(() => run.failure || (run.pidCount === 1 && run.port > 0), 20000); assert.equal(run.failure, false);
    const identity = await http(run, null, 'GET', '/api/reference/status');
    const actual = identity.body.instance; assert.ok(record(actual));
    const own: unknown = JSON.parse(fs.readFileSync(path.join(discovery, 'instances', `${run.supervisedPid}.json`), 'utf8'));
    const latest: unknown = JSON.parse(fs.readFileSync(path.join(discovery, 'latest.json'), 'utf8'));
    for (const value of [actual, own, latest]) assert.ok(record(value) && value.pid === run.supervisedPid && value.port === run.port
      && value.mode === 'dev-build' && typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) && value.startedAt === actual.startedAt);
    run.startedAt = actual.startedAt as string;
    check(`public_${native ? 'native' : 'legacy'}_fresh_supervisor_http_discovery_identity`, publicUnavailableCorpusHttpWitness(identity.status, identity.body, path.join(root, 'reference-unavailable')) && bound(run));
    publicStartupSeal(run.startupStderr, [session, binding.nonce, binding.epoch]); run.startupComplete = true;
    return run;
  }
  async function openMcp(run: PublicRun, key: string) {
    admit(); assert.equal(typeof mcpFactory, 'function');
    const client = await mcpFactory!(`http://127.0.0.1:${run.port}`, { key, workspaceId });
    const owned: PublicMcpOwner = { client, closed: false, stdoutClosed: false, stderrClosed: false, bytes: 0, failure: false }; clients.push(owned);
    client.child.once('close', () => { owned.closed = true; }); client.child.stdout?.once('close', () => { owned.stdoutClosed = true; });
    client.child.stderr?.once('close', () => { owned.stderrClosed = true; });
    const count = (chunk: Buffer | string) => { owned.bytes += Buffer.byteLength(chunk); if (owned.bytes > 1048576) { owned.failure = true; client.child.stdin?.end(); } };
    client.child.stdout?.on('data', count); client.child.stderr?.on('data', count);
    if (retired) { await closeMcp(owned); throw new Error('NATIVE_PUBLIC_REPLAY_RETIRED'); }
    return owned;
  }
  async function closeMcp(owned: PublicMcpOwner) {
    await owned.client.close();
    await until(() => owned.closed && owned.stdoutClosed && owned.stderrClosed && owned.client.child.exitCode !== null, 2500);
    await until(() => pidAbsent(owned.client.child.pid ?? 0), 2000);
    check('public_mcp_exact_child_terminal_drained', owned.client.child.exitCode === 0 && !owned.failure && pidAbsent(owned.client.child.pid ?? 0));
  }
  const mcpReport = (message: PublicMcpMessage) => {
    assert.equal(message.error, undefined);
    const text = message.result?.content?.[0]?.text; assert.equal(typeof text, 'string'); const body = JSON.parse(text!) as PublicReplayReport;
    assert.equal(message.result?.isError, body.ok ? undefined : true);
    assert.deepEqual(Object.keys(body).sort(), ['schemaVersion', 'operation', 'ok', 'availability', 'unavailableReason', 'ownership', 'status',
      ...(Object.hasOwn(body, 'code') ? ['code'] : [])].sort());
    assert.equal(body.schemaVersion, 'forge.native-performance.report.v1'); return body;
  };
  const toolCall = (owned: PublicMcpOwner, name: string, args: Record<string, unknown> = {}) => {
    admit(); return owned.client.request('tools/call', { name, arguments: args }, 12000);
  };
  const toolNames = async (owned: PublicMcpOwner) => {
    const message = await owned.client.request('tools/list');
    assert.equal(message.error, undefined); const result = message.result as unknown as { tools: Array<{ name: string }> };
    assert.ok(Array.isArray(result.tools)); return result.tools.map(tool => tool.name);
  };
  const readRoute = '/api/agent/performance/native', startRoute = readRoute + '/collection', stopRoute = readRoute + '/stop';
  const aliases = ['get_forge_native_performance', 'start_forge_native_performance_capture', 'stop_forge_native_performance_capture'];
  async function execute() {
    const imported = await import(pathToFileURL(mcpModule).href) as { startPrivateNativeReplayMcp?: typeof mcpFactory };
    mcpFactory = imported.startPrivateNativeReplayMcp;
    check('public_source_paths_and_reusable_mcp_owner_exist', fs.existsSync(sourceServer) && fs.existsSync(mcpModule)
      && typeof mcpFactory === 'function');
    check('public_parent_producer_default_off', !producer.status().collectionActive && nativeTimers.size === 0 && resourceReads === 0);
    enter('native_startup'); const run = await launch(true);
    await until(() => run.faults.has('public_listener_selected'), 1000);
    const bootstrap = await http(run, session, 'POST', '/api/agent/workspaces/bootstrap', { clientId });
    assert.equal(bootstrap.status, 200); assert.equal(typeof bootstrap.body.workspaceId, 'string'); workspaceId = bootstrap.body.workspaceId as string;
    const makeKey = async (label: string, scope: string, identities?: string[]) => {
      const response = await http(run, session, 'POST', '/api/agent/keys', { label, scope, ttl: '1h', workspaceId, clientId,
        ...(identities ? { authorityMode: 'exact', capabilityIdentities: identities, allowedEffects: ['read', 'analyze'] } : { authorityMode: 'preset' }) });
      assert.equal(response.status, 200); assert.equal(typeof response.body.token, 'string'); assert.ok(record(response.body.record));
      assert.equal(typeof response.body.record.id, 'string'); return { token: response.body.token as string, id: response.body.record.id as string };
    };
    const grants = ['performance.native.read@1', 'performance.native.collect@1', 'performance.native.stop@1'];
    const a = await makeKey('public-replay-A', 'write', grants), b = await makeKey('public-replay-B', 'write', grants);
    const reader = await makeKey('public-replay-read', 'read', [grants[0]]), legacy = await makeKey('public-replay-legacy', 'all');
    check('public_transient_exact_read_and_legacy_keys_created', [a, b, reader, legacy].every(value => value.token.startsWith('x4fk_')));
    const initial = nativeReport(await http(run, a.token, 'GET', readRoute), 200, 'read');
    assert.ok(initial.ok && initial.status?.native && initial.status.native.producer.pid === process.pid && !initial.status.native.collectionActive
      && initial.status.backendInstanceId === run.backendInstanceId && initial.status.native.producer.instanceId === producer.status().producer.instanceId);
    const identity = { expectedBackendInstanceId: initial.status.backendInstanceId, expectedNativeInstanceId: initial.status.native.producer.instanceId };
    const options = { ...identity, durationMs: 30000, intervalMs: 1000, eventLoopDelay: true };
    check('public_native_read_actual_parent_identity_default_off', initial.status.native.ownedTimerCount === 0 && !initial.status.cleanupUnconfirmed);
    enter('same_capture'); const mcp = await openMcp(run, a.token);
    const available = await toolNames(mcp); check('public_real_agent_discovery_exposes_exact_native_aliases', aliases.every(name => available.includes(name)));
    const start = nativeReport(await http(run, a.token, 'POST', startRoute, options), 200, 'start');
    assert.ok(start.ok && start.status?.native?.collectionActive && start.status.native.captureId);
    const captureId = start.status.native.captureId;
    check('public_http_start_waits_for_actual_matching_host_ack', run.starts.length === 1 && run.starts[0].captureId === captureId
      && producer.status().captureId === captureId && start.ownership === 'self' && start.status.snapshot === null && start.status.snapshotAgeMs === null);
    host.beginOperation('native.command')('ok'); await delay(1100);
    const sampled = mcpReport(await toolCall(mcp, aliases[0]));
    check('public_mcp_same_capture_real_resources_operations_and_shared_parent', sampled.ok && sampled.status?.native?.captureId === captureId
      && sampled.status.backendInstanceId === identity.expectedBackendInstanceId && sampled.status.native.producer.instanceId === identity.expectedNativeInstanceId
      && sampled.status.snapshot?.producer.pid === process.pid && sampled.status.snapshot.resources.length >= 2 && resourceReads >= 2
      && sampled.status.snapshot.operations.some(row => row.name === 'native.command' && row.count > 0));
    for (const route of [startRoute, stopRoute]) {
      const response = await http(run, reader.token, 'POST', route, route === startRoute ? options : { ...identity, captureId });
      check(`public_readonly_denies_${route === startRoute ? 'start' : 'stop'}`, response.status === 403 && producer.status().collectionActive
        && producer.status().captureId === captureId && run.starts.length === 1 && run.stops === 0);
    }
    const activeOther = nativeReport(await http(run, b.token, 'POST', stopRoute, { ...identity, captureId }), 403, 'stop');
    check('public_cross_actor_cannot_stop_actual_active_capture', activeOther.code === 'NATIVE_PERFORMANCE_NOT_OWNER'
      && activeOther.status?.snapshot === null && producer.status().collectionActive && producer.status().captureId === captureId && run.stops === 0);
    const stop = mcpReport(await toolCall(mcp, aliases[2], { ...identity, captureId }));
    check('public_mcp_stop_exact_cleanup_ack_without_snapshot', stop.ok && stop.status?.native?.captureId === captureId && !stop.status.native.collectionActive
      && stop.status.native.ownedTimerCount === 0 && stop.status.native.failedTimerCount === 0 && !stop.status.cleanupUnconfirmed
      && !stop.status.native.eventLoopDelayMonitoring && stop.status.snapshot === null && nativeTimers.size === 0);
    const cleaned = nativeReport(await http(run, a.token, 'GET', readRoute), 200, 'read');
    check('public_fresh_http_read_confirms_same_capture_cleanup', cleaned.ok && cleaned.status?.native?.captureId === captureId && !cleaned.status.cleanupUnconfirmed);
    enter('refusals');
    for (const [method, route, body] of [['GET', readRoute, undefined], ['POST', startRoute, options], ['POST', stopRoute, { ...identity, captureId }]] as const) {
      const response = await http(run, legacy.token, method, route, body); check(`public_legacy_native_${method}_${route.endsWith('stop') ? 'stop' : route.endsWith('collection') ? 'start' : 'read'}_denied`, response.status === 403);
    }
    const other = nativeReport(await http(run, b.token, 'POST', stopRoute, { ...identity, captureId }), 403, 'stop');
    check('public_cross_actor_history_stop_denied_without_snapshot', !other.ok && other.code === 'NATIVE_PERFORMANCE_NOT_OWNER' && other.status?.snapshot === null);
    for (const changed of [{ expectedBackendInstanceId: 'stale_backend_public_01' }, { expectedNativeInstanceId: 'stale_native_public_01' }]) {
      const result = nativeReport(await http(run, b.token, 'POST', startRoute, { ...options, ...changed }), 409, 'start');
      check(`public_stale_${Object.keys(changed)[0]}_denied`, result.code === 'NATIVE_PERFORMANCE_IDENTITY_MISMATCH');
    }
    const wrong = nativeReport(await http(run, a.token, 'POST', stopRoute, { ...identity, captureId: 'wrong_capture_public_01' }), 409, 'stop');
    check('public_wrong_capture_denied', wrong.code === 'NATIVE_PERFORMANCE_CAPTURE_MISMATCH');
    check('public_input_rejection_remains_generic', (await http(run, a.token, 'POST', startRoute, { ...options, owner: 'caller' })).status === 400);
    check('public_refusals_dispatch_no_native_control_or_read', run.starts.length === 1 && run.stops === 1 && run.reads === 3
      && producer.status().captureId === captureId && !producer.status().collectionActive);
    await closeMcp(mcp);
    const readMcp = await openMcp(run, reader.token), readNames = await toolNames(readMcp);
    check('public_readonly_mcp_inventory_only_native_read', readNames.includes(aliases[0]) && !readNames.includes(aliases[1]) && !readNames.includes(aliases[2])); await closeMcp(readMcp);
    const legacyMcp = await openMcp(run, legacy.token), legacyNames = await toolNames(legacyMcp);
    check('public_legacy_mcp_inventory_has_no_native_alias', aliases.every(name => !legacyNames.includes(name))); await closeMcp(legacyMcp);
    enter('revoke_queued');
    nativeReport(await http(run, b.token, 'GET', readRoute), 200, 'read');
    await until(() => run.faults.has('public_read_callback_held'), 1000); assert.equal(run.reads, 4);
    const pending = http(run, a.token, 'POST', startRoute, options); let pendingObserved = false;
    for (let attempt = 0; attempt < 30 && !pendingObserved; attempt++) {
      const state = nativeReport(await http(run, b.token, 'GET', readRoute), 409, 'read');
      pendingObserved = state.code === 'NATIVE_PERFORMANCE_BUSY' && state.status?.pending === 'start'; if (!pendingObserved) await delay(10);
    }
    check('public_revoke_witness_is_admitted_queued_control_before_physical_dispatch', pendingObserved && run.starts.length === 1 && !run.faults.has('public_read_callback_released'));
    const revoked = await http(run, session, 'POST', '/api/agent/keys/revoke', { id: a.id }); assert.equal(revoked.status, 200);
    check('public_revoke_api_completed_before_actual_callback_release', !run.faults.has('public_read_callback_released'));
    const denied = nativeReport(await pending, 403, 'start');
    check('public_fresh_key_revocation_prevents_queued_native_dispatch', denied.code === 'NATIVE_PERFORMANCE_AUTHORITY_REVOKED'
      && denied.status === null && denied.ownership === 'none' && run.starts.length === 1 && !producer.status().collectionActive);
    enter('http_abort'); const abort = new AbortController();
    const aborted = http(run, b.token, 'POST', startRoute, options, abort.signal).then(() => false, () => true);
    await until(() => run.starts.length === 2 && producer.status().collectionActive, 2000); abort.abort();
    check('public_http_caller_abort_is_observed', await aborted);
    await until(() => run.faults.has('public_abort_late_ack_replayed'), 3000);
    const afterAbort = nativeReport(await http(run, b.token, 'GET', readRoute), 200, 'read');
    check('public_http_abort_late_ack_never_acquires_lease_and_cleanup_is_fresh', afterAbort.ok && !afterAbort.status?.captureOwned
      && !afterAbort.status?.native?.collectionActive && !afterAbort.status?.cleanupUnconfirmed && run.cancels >= 1 && nativeTimers.size === 0);
    enter('cleanup_unknown'); const bMcp = await openMcp(run, b.token);
    const timed = mcpReport(await toolCall(bMcp, aliases[1], options));
    check('public_mcp_receives_real_broker_control_timeout_not_success', !timed.ok && timed.code === 'NATIVE_PERFORMANCE_CONTROL_TIMEOUT' && timed.status?.snapshot === null);
    await until(() => run.faults.has('public_cleanup_results_held'), 2000); await delay(5150);
    const uncertain = nativeReport(await http(run, b.token, 'POST', startRoute, options), 409, 'start');
    check('public_actual_cleanup_ack_hold_preserves_unknown_and_blocks_restart', uncertain.code === 'NATIVE_PERFORMANCE_CLEANUP_UNCONFIRMED'
      && uncertain.status?.cancellation === 'unknown' && uncertain.status.cleanupUnconfirmed && !producer.status().collectionActive && nativeTimers.size === 0);
    await until(() => run.faults.has('public_cleanup_results_released'), 2000);
    const reconciled = nativeReport(await http(run, b.token, 'GET', readRoute), 200, 'read');
    check('public_late_actual_results_then_fresh_read_confirm_cleanup', reconciled.ok && reconciled.status?.cancellation === 'none'
      && !reconciled.status.captureOwned && !reconciled.status.cleanupUnconfirmed && !reconciled.status.native?.collectionActive);
    enter('mcp_cancel'); const cancelId = 1000000;
    bMcp.client.child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id: cancelId, method: 'tools/call', params: { name: aliases[1], arguments: options } }) + '\n');
    await until(() => run.starts.length === 4 && producer.status().collectionActive, 2000);
    bMcp.client.child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: cancelId } }) + '\n');
    await until(() => run.faults.has('public_mcp_late_ack_replayed'), 3000); await delay(100);
    check('public_mcp_cancel_propagates_http_abort_and_fences_late_reply', !bMcp.client.receivedMessages.some(message => message.id === cancelId)
      && !producer.status().collectionActive && nativeTimers.size === 0);
    enter('mcp_eof'); const eofId = 1000001;
    bMcp.client.child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id: eofId, method: 'tools/call', params: { name: aliases[1], arguments: options } }) + '\n');
    await until(() => run.starts.length === 5 && producer.status().collectionActive, 2000); bMcp.client.child.stdin?.end();
    await until(() => run.faults.has('public_eof_late_ack_replayed'), 3000); await closeMcp(bMcp);
    check('public_mcp_eof_pending_control_retires_without_late_response', !bMcp.client.receivedMessages.some(message => message.id === eofId)
      && !producer.status().collectionActive && nativeTimers.size === 0);
    const survivorMcp = await openMcp(run, b.token), retained = mcpReport(await toolCall(survivorMcp, aliases[1], options));
    assert.ok(retained.ok && retained.status?.native?.captureId); const retainedId = retained.status.native.captureId;
    const cancelsBeforeEof = run.cancels; await closeMcp(survivorMcp);
    check('public_mcp_eof_after_ack_never_globally_stops_capture', producer.status().collectionActive && producer.status().captureId === retainedId && run.cancels === cancelsBeforeEof);
    nativeReport(await http(run, b.token, 'POST', stopRoute, { ...identity, captureId: retainedId }), 200, 'stop');
    check('public_dtos_never_serialize_transient_identity_or_binding_secrets', [initial, start, sampled, stop, denied, uncertain, reconciled].every(body => {
      const serialized = JSON.stringify(body); return [session, a.token, b.token, reader.token, legacy.token, a.id, b.id, run.binding.nonce, run.binding.epoch].every(secret => !serialized.includes(secret));
    }));
    run.bridge?.retire('public-replay-native-leg-only');
    const ordinary = await http(run, session, 'GET', '/api/agent/performance'), identityAfter = await http(run, null, 'GET', '/api/reference/status');
    check('public_native_only_retirement_preserves_ordinary_backend_http', ordinary.status === 200 && ordinary.body.schemaVersion === 'forge.performance.report.v1'
      && publicUnavailableCorpusHttpWitness(identityAfter.status, identityAfter.body, path.join(run.root, 'reference-unavailable')) && record(identityAfter.body.instance) && identityAfter.body.instance.pid === run.supervisedPid
      && identityAfter.body.instance.startedAt === run.startedAt && run.child.connected && run.child.exitCode === null);
    await closeRun(run);
    check('public_all_fixed_actual_ipc_fault_receipts_observed_once', run.faults.size === PUBLIC_FAULT_CHECKS.size
      && [...PUBLIC_FAULT_CHECKS].every(name => run.faults.has(name)) && !run.failure);
    enter('legacy_startup'); workspaceId = ''; const noNative = await launch(false);
    const absent = nativeReport(await http(noNative, session, 'GET', readRoute), 200, 'read');
    check('public_no_transport_read_is_truthful_unavailable_null_status', absent.ok && absent.availability === 'unavailable'
      && absent.unavailableReason === 'transport-absent' && absent.status === null && absent.ownership === 'none' && !Object.hasOwn(absent, 'code'));
    check('public_no_transport_backend_survives', (await http(noNative, session, 'GET', '/api/agent/performance')).status === 200);
    await closeRun(noNative);
  }
  try { await Promise.race([execute(), new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => {
    retired = true; reject(new Error('NATIVE_PUBLIC_REPLAY_DEADLINE')); }, 80000); })]); }
  catch (error) {
    const startupRun = runs[runs.length - 1];
    if ((phase === 'initial' && !startupRun) || (['native_startup', 'legacy_startup'].includes(phase) && startupRun && !startupRun.startupComplete)) {
      startupCause = publicStartupError(error, [session, ...runs.flatMap(run => [run.binding.nonce, run.binding.epoch])]);
    }
    checks.push({ name: `public_${phase}_completed`, pass: false });
  }
  finally {
    retired = true; if (deadline) clearTimeout(deadline);
    for (const owned of clients) if (owned.client.child.exitCode === null) { try { await closeMcp(owned); } catch { checks.push({ name: 'public_mcp_cleanup_confirmed', pass: false }); } }
    for (const run of runs) if (!run.cleanupConfirmed) { try { await closeRun(run); } catch { checks.push({ name: 'public_owned_backend_cleanup_confirmed', pass: false }); } }
    const disposed = host.dispose();
    checks.push({ name: 'public_parent_activation_cleanup_confirmed', pass: disposed.ok && !disposed.status.collectionActive
      && disposed.status.ownedTimerCount === 0 && disposed.status.failedTimerCount === 0 && !disposed.status.eventLoopDelayMonitoring && nativeTimers.size === 0 });
    try {
      let entries = 0, bytes = 0;
      const physical = (file: string) => { const stat = fs.lstatSync(file); assert.equal(stat.isSymbolicLink(), false);
        assert.equal(path.relative(path.resolve(file), fs.realpathSync(file)), ''); return stat; };
      const leaf = /^(?:native|legacy)\/(?:state\/workspace-registry\.json|state\/workspaces\/ws_[a-f0-9]{24}\.json|data\/agent-keys\.json|data\/history\/ledger(?:\.[1-5])?\.jsonl|data\/history\/blobs\/[a-f0-9]{2}\/[a-f0-9]{64}|data\/studio-cache\/index\.db(?:-wal|-shm)?|source-coordination\/source-coordination\.sqlite(?:-wal|-shm)?|data\/action-receipts\/ar_[a-f0-9]{64}\.json)$/;
      const directory = /^(?:native|legacy)(?:\/(?:config|state(?:\/workspaces)?|data(?:\/(?:history(?:\/blobs(?:\/[a-f0-9]{2})?)?|studio-cache|action-receipts|runtime-debug-sessions|runtime-control|recoveries))?|source-coordination|discovery(?:\/instances)?|mods|schemas|scratch-game(?:\/extensions)?))?$/;
      const walk = (root: string, relative = '') => {
        for (const name of fs.readdirSync(root)) {
          const relativeName = relative ? `${relative}/${name}` : name, file = path.join(root, name), stat = physical(file);
          assert.ok(++entries <= 512);
          if (stat.isDirectory()) { assert.ok(directory.test(relativeName)); walk(file, relativeName); }
          else { assert.ok(stat.isFile() && stat.nlink === 1); assert.ok(relativeName === 'owner.json' || leaf.test(relativeName)); bytes += stat.size; assert.ok(bytes <= 32 * 1024 * 1024); }
        }
      };
      assert.equal(path.relative(fs.realpathSync(os.tmpdir()), path.dirname(ownedRoot)), ''); physical(ownedRoot);
      assert.ok(path.basename(ownedRoot).startsWith('x4forge-native-ipc-'));
      assert.deepEqual(fs.readdirSync(ownedRoot).sort(), ['legacy', 'native', 'owner.json']);
      assert.ok(nativeIpcOwnerMarkerPermitsCleanup(owner, { lstat: () => fs.lstatSync(ownerFile), read: () => fs.readFileSync(ownerFile, 'utf8') }));
      walk(ownedRoot);
      assert.ok(disposed.ok && !disposed.status.collectionActive && disposed.status.ownedTimerCount === 0
        && disposed.status.failedTimerCount === 0 && !disposed.status.eventLoopDelayMonitoring && nativeTimers.size === 0);
      assert.ok(runs.length === 2 && runs.every(run => run.cleanupConfirmed && terminal(run) && bound(run) && pidAbsent(run.supervisedPid)));
      assert.ok(clients.every(owned => owned.closed && owned.stdoutClosed && owned.stderrClosed && owned.client.child.exitCode === 0
        && pidAbsent(owned.client.child.pid ?? 0) && !owned.failure));
      fs.rmSync(ownedRoot, { recursive: true }); checks.push({ name: 'public_owned_physical_allowlisted_scratch_retired', pass: !fs.existsSync(ownedRoot) });
    } catch { checks.push({ name: 'public_owned_physical_allowlisted_scratch_retired', pass: false }); }
  }
  const passed = checks.filter(row => row.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks, realPublicReplay: true, productionModules: true,
    sourceOnly: true, compiledCaptureProof: false, installedHostOrGameProof: false,
    startupDiagnostics: { cause: startupCause, ...publicStartupLegs(runs.map(run => ({ leg: run.native ? 'native' : 'legacy',
      supervisorPid: run.child.pid ?? null, backendPid: run.supervisedPid || null, backendPidWitnessCount: run.pidCount, port: run.port || null,
      exitCode: run.child.exitCode, signalCode: run.child.signalCode, connected: run.child.connected,
      closed: run.closed, stdoutClosed: run.stdoutClosed, stderrClosed: run.stderrClosed,
      nativeHelloObserved: run.backendInstanceId !== null, identityObserved: run.startedAt !== null, startupComplete: run.startupComplete,
      failure: run.failure, outputBytes: run.outputBytes, error: run.startupError,
      stderr: run.startupStderr.lines.length ? run.startupStderr.lines.join('\n') + '\n' : '', stderrOmittedLines: run.startupStderr.omitted,
    })), [session, ...runs.flatMap(run => [run.binding.nonce, run.binding.epoch])]) } };
}
// END native public replay owner.

if (typeof require !== 'undefined' && require.main === module) {
  const role = process.env.X4_NATIVE_PERFORMANCE_SELFTEST_ROLE;
  const scenario = process.env.X4_NATIVE_PERFORMANCE_SELFTEST_SCENARIO;
  if (role === 'worker' && isScenario(scenario)) {
    void worker(scenario).catch(() => { process.stderr.write('NATIVE_IPC_WORKER_FAILED\n'); process.exit(1); });
  } else if (role === undefined) {
    const publicReplay = process.argv.length === 3 && process.argv[2] === '--public-replay-selftest';
    const startupDiagnosticsOnly = process.argv.length === 3 && process.argv[2] === '--public-startup-diagnostics-selftest';
    const preloadGateOnly = process.argv.length === 3 && process.argv[2] === '--public-preload-gate-selftest';
    if (process.argv.length > 2 && !publicReplay && !startupDiagnosticsOnly && !preloadGateOnly) throw new Error('NATIVE_IPC_SELFTEST_ARGUMENT_INVALID');
    void (preloadGateOnly ? Promise.resolve(runNativePerformancePublicPreloadGateSelftest())
      : startupDiagnosticsOnly ? Promise.resolve(runNativePerformancePublicStartupDiagnosticsSelftest())
      : publicReplay ? runNativePerformancePublicReplaySelftest() : runNativePerformanceIpcSelftest()).then(result => {
      console.log(JSON.stringify(result)); if (!result.pass) process.exitCode = 1;
    }).catch(() => { process.stderr.write('NATIVE_IPC_SELFTEST_FAILED\n'); process.exitCode = 1; });
  } else { process.stderr.write('NATIVE_IPC_SELFTEST_MODE_INVALID\n'); process.exitCode = 1; }
}
