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

if (typeof require !== 'undefined' && require.main === module) {
  const role = process.env.X4_NATIVE_PERFORMANCE_SELFTEST_ROLE;
  const scenario = process.env.X4_NATIVE_PERFORMANCE_SELFTEST_SCENARIO;
  if (role === 'worker' && isScenario(scenario)) {
    void worker(scenario).catch(() => { process.stderr.write('NATIVE_IPC_WORKER_FAILED\n'); process.exit(1); });
  } else if (role === undefined) {
    void runNativePerformanceIpcSelftest().then(result => {
      console.log(JSON.stringify(result)); if (!result.pass) process.exitCode = 1;
    }).catch(() => { process.stderr.write('NATIVE_IPC_SELFTEST_FAILED\n'); process.exitCode = 1; });
  } else { process.stderr.write('NATIVE_IPC_SELFTEST_MODE_INVALID\n'); process.exitCode = 1; }
}
