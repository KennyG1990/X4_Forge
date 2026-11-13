#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

// Ownership is the exact child object captured at spawn, never a reported PID.
const ownedProbeChildStates = new WeakMap();
function trackOwnedProbeChild(childHandle) {
  const owner = Object.freeze({});
  const state = { child: childHandle, closed: false, stdoutClosed: false, stderrClosed: false,
    error: false, retirement: undefined };
  ownedProbeChildStates.set(owner, state);
  childHandle.once('close', () => { state.closed = true; });
  childHandle.on('error', () => { state.error = true; });
  childHandle.stdin?.on?.('error', () => { state.error = true; });
  for (const [stream, key] of [[childHandle.stdout, 'stdoutClosed'], [childHandle.stderr, 'stderrClosed']]) {
    if (!stream || typeof stream.once !== 'function' || typeof stream.on !== 'function') { state.error = true; continue; }
    stream.once('close', () => { state[key] = true; });
    stream.on('error', () => { state.error = true; });
  }
  return owner;
}

async function waitForOwnedProbeRetirement(predicate, milliseconds) {
  const deadline = performance.now() + milliseconds;
  while (!predicate() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  return predicate();
}

async function retireOwnedProbeChild(owner, options = {}) {
  const state = ownedProbeChildStates.get(owner);
  if (!state) return Object.freeze({ confirmed: false, graceful: false });
  if (!state.retirement) state.retirement = Promise.resolve().then(async () => {
    const handle = state.child;
    const live = () => handle.exitCode === null && handle.signalCode === null;
    const terminal = () => (Number.isSafeInteger(handle.exitCode) && handle.exitCode >= 0 && handle.signalCode === null)
      || (handle.exitCode === null && typeof handle.signalCode === 'string' && handle.signalCode.length > 0);
    const drained = () => terminal() && state.closed && state.stdoutClosed && state.stderrClosed;
    let graceful = true;
    const result = () => Object.freeze({ confirmed: drained() && !state.error, graceful });
    try {
      if (!live() && !terminal()) return Object.freeze({ confirmed: false, graceful: false });
      if (drained()) return result();
      const wait = options.wait ?? waitForOwnedProbeRetirement;
      if (typeof wait !== 'function') return Object.freeze({ confirmed: false, graceful: false });
      if (live()) {
        try {
          if (typeof handle.stdin?.end !== 'function') state.error = true;
          else handle.stdin.end();
        } catch { state.error = true; }
      }
      await wait(drained, 3500);
      if (drained()) return result();
      // An exited child with pending stream/close events must only be drained.
      if (!live()) return Object.freeze({ confirmed: false, graceful });
      graceful = false;
      try { if (handle.kill('SIGTERM') !== true) state.error = true; } catch { state.error = true; }
      await wait(drained, 1500);
      if (drained()) return result();
      if (!live()) return Object.freeze({ confirmed: false, graceful });
      try { if (handle.kill('SIGKILL') !== true) state.error = true; } catch { state.error = true; }
      await wait(drained, 2000);
      return result();
    } catch {
      state.error = true;
      return Object.freeze({ confirmed: false, graceful });
    }
  });
  // The first result is latched; a late close cannot upgrade a failed retirement.
  return state.retirement;
}

/** Injected handles/events only: no timers, process launch/kill, or filesystem calls. */
async function runProbeCleanupSelftest() {
  const checks = [];
  const expect = condition => { if (!condition) throw new Error('OWNED_PROBE_CLEANUP_ASSERTION'); };
  const runCase = async (name, action) => {
    try { await action(); checks.push({ name, pass: true }); }
    catch { checks.push({ name, pass: false }); }
  };
  function fixture({ exitCode = null, signalCode = null, numericPid = 4242,
    onEnd, onKill, killValue = true, killThrows = false } = {}) {
    const handle = new EventEmitter();
    handle.exitCode = exitCode; handle.signalCode = signalCode;
    handle.stdout = new EventEmitter(); handle.stderr = new EventEmitter();
    let pidReads = 0, ends = 0;
    const signals = [], waits = [];
    Object.defineProperty(handle, 'pid', { get() { pidReads++; throw new Error(`FORBIDDEN_FIXTURE_PID_${numericPid}`); } });
    handle.stdin = { end() { ends++; onEnd?.(controls); } };
    handle.kill = signal => {
      signals.push(signal);
      if (killThrows) throw new Error('FIXTURE_KILL_THROW');
      onKill?.(signal, controls);
      return killValue;
    };
    const owner = trackOwnedProbeChild(handle);
    const controls = {
      handle, owner, signals, waits,
      pidReads: () => pidReads, ends: () => ends,
      terminal(code = 0, signal = null) {
        handle.exitCode = code; handle.signalCode = signal; handle.emit('exit', code, signal);
      },
      drain() { handle.stdout.emit('close'); handle.stderr.emit('close'); handle.emit('close', handle.exitCode, handle.signalCode); },
      close(code = 0, signal = null) { controls.terminal(code, signal); controls.drain(); },
      options(effect) {
        return { wait: async (predicate, milliseconds) => {
          waits.push(milliseconds); effect?.(controls, waits.length); return predicate();
        } };
      },
    };
    return controls;
  }

  await runCase('terminal_exit_never_signalled_or_pid_read', async () => {
    const f = fixture({ exitCode: 0 }); f.drain();
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(result.confirmed && result.graceful && f.ends() === 0 && f.signals.length === 0 && f.pidReads() === 0);
  });
  await runCase('terminal_signal_never_signalled_or_pid_read', async () => {
    const f = fixture({ signalCode: 'SIGTERM' }); f.drain();
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(result.confirmed && result.graceful && f.ends() === 0 && f.signals.length === 0 && f.pidReads() === 0);
  });
  await runCase('duplicate_recycled_pid_cannot_transfer_ownership', async () => {
    const old = fixture({ exitCode: 0, numericPid: 4242 }); old.drain();
    const next = fixture({ numericPid: 4242, onEnd: f => f.close() });
    const first = await retireOwnedProbeChild(old.owner, old.options());
    const second = await retireOwnedProbeChild(next.owner, next.options());
    expect(first.confirmed && second.confirmed && old.ends() === 0 && next.ends() === 1
      && old.signals.length === 0 && next.signals.length === 0 && old.pidReads() === 0 && next.pidReads() === 0);
  });
  await runCase('live_eof_retires_only_exact_owned_handle', async () => {
    const f = fixture({ onEnd: item => item.close() });
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(result.confirmed && result.graceful && f.ends() === 1 && f.signals.length === 0 && f.pidReads() === 0);
  });
  await runCase('live_sigterm_retires_only_exact_owned_handle', async () => {
    const f = fixture({ onKill: (signal, item) => { if (signal === 'SIGTERM') item.close(null, signal); } });
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(result.confirmed && !result.graceful && f.ends() === 1 && f.signals.join(',') === 'SIGTERM'
      && f.waits.join(',') === '3500,1500' && f.pidReads() === 0);
  });
  await runCase('live_sigkill_retires_only_exact_owned_handle', async () => {
    const f = fixture({ onKill: (signal, item) => { if (signal === 'SIGKILL') item.close(null, signal); } });
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(result.confirmed && !result.graceful && f.signals.join(',') === 'SIGTERM,SIGKILL'
      && f.waits.join(',') === '3500,1500,2000' && f.pidReads() === 0);
  });
  await runCase('false_kill_never_authorizes_scratch_cleanup', async () => {
    const f = fixture({ killValue: false });
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(!result.confirmed && f.signals.length > 0 && f.pidReads() === 0);
  });
  await runCase('thrown_kill_never_authorizes_scratch_cleanup', async () => {
    const f = fixture({ killThrows: true });
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(!result.confirmed && f.signals.length > 0 && f.pidReads() === 0);
  });
  await runCase('unconfirmed_cleanup_has_finite_waits_and_preserves_scratch', async () => {
    const f = fixture();
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(!result.confirmed && f.ends() === 1 && f.signals.join(',') === 'SIGTERM,SIGKILL'
      && f.waits.join(',') === '3500,1500,2000' && f.pidReads() === 0);
  });
  await runCase('terminal_exit_without_child_close_never_confirms', async () => {
    const f = fixture({ exitCode: 0 }); f.handle.stdout.emit('close'); f.handle.stderr.emit('close');
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(!result.confirmed && f.ends() === 0 && f.signals.length === 0 && f.pidReads() === 0);
  });
  await runCase('terminal_child_without_stream_drain_never_confirms', async () => {
    const f = fixture({ exitCode: 0 }); f.handle.stdout.emit('close'); f.handle.emit('close', 0, null);
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(!result.confirmed && f.ends() === 0 && f.signals.length === 0 && f.pidReads() === 0);
  });
  await runCase('late_stream_error_is_consumed_and_latched', async () => {
    const f = fixture();
    const result = await retireOwnedProbeChild(f.owner, f.options(item => {
      item.terminal(); item.handle.stderr.emit('error', new Error('FIXTURE_LATE_ERROR')); item.drain();
    }));
    expect(!result.confirmed && f.pidReads() === 0);
  });
  await runCase('duplicate_retirement_is_idempotent', async () => {
    const f = fixture({ onKill: (signal, item) => { if (signal === 'SIGTERM') item.close(null, signal); } });
    const first = await retireOwnedProbeChild(f.owner, f.options());
    const endCount = f.ends(), signalCount = f.signals.length, waitCount = f.waits.length;
    const second = await retireOwnedProbeChild(f.owner, f.options());
    expect(first.confirmed && second === first && f.ends() === endCount
      && f.signals.length === signalCount && f.waits.length === waitCount && f.pidReads() === 0);
  });
  await runCase('unregistered_owner_never_authorizes_cleanup', async () => {
    const result = await retireOwnedProbeChild(Object.freeze({}), { wait() { throw new Error('UNOWNED_WAIT'); } });
    expect(!result.confirmed);
  });
  await runCase('unknown_exit_identity_never_authorizes_cleanup', async () => {
    const f = fixture(); f.handle.exitCode = undefined; f.handle.signalCode = undefined; f.drain();
    const result = await retireOwnedProbeChild(f.owner, f.options());
    expect(!result.confirmed && f.ends() === 0 && f.signals.length === 0 && f.pidReads() === 0);
  });
  await runCase('rejected_wait_never_authorizes_cleanup', async () => {
    const f = fixture();
    const result = await retireOwnedProbeChild(f.owner, { wait: async () => { throw new Error('FIXTURE_WAIT_REJECTED'); } });
    expect(!result.confirmed && f.pidReads() === 0);
  });
  await runCase('late_close_cannot_upgrade_failed_retirement', async () => {
    const f = fixture();
    const first = await retireOwnedProbeChild(f.owner, f.options()); f.close();
    const second = await retireOwnedProbeChild(f.owner, f.options());
    expect(!first.confirmed && second === first && !second.confirmed && f.pidReads() === 0);
  });
  const passed = checks.filter(item => item.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks,
    injectedHandlesOnly: true, realProcesses: false, filesystemMutation: false, compiledOrInstalledProof: false };
}

if (process.argv.includes('--cleanup-selftest')) {
  if (process.argv.length !== 3 || process.argv[2] !== '--cleanup-selftest') {
    console.log(JSON.stringify({ pass: false, code: 'CLEANUP_SELFTEST_ARGUMENTS' }));
    process.exit(1);
  }
  const result = await runProbeCleanupSelftest();
  console.log(JSON.stringify(result));
  process.exit(result.pass ? 0 : 1);
}

const extensionRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appRoot = path.join(extensionRoot, 'app');
const serverPath = path.join(appRoot, 'dist', 'server.cjs');
const supervisorPath = path.join(extensionRoot, 'out', 'sidecar-supervisor.js');
const extensionVersion = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')).version;
const port = Number(process.env.X4_STAGED_PROBE_PORT || 8982);
const base = `http://127.0.0.1:${port}`;
const token = `staged-app-probe-${process.pid}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x4forge-staged-probe-'));
const configuredReferenceRoot = process.env.X4_REFERENCE_ROOT?.trim();
const localReferenceRoot = 'F:\\Downskies\\x4unpackersuiteV1\\X4 unpacked 9.00';
let referenceRoot = configuredReferenceRoot || localReferenceRoot;
let fixtureReference = false;
if (!fs.existsSync(path.join(referenceRoot, 'libraries'))) {
  fixtureReference = true;
  referenceRoot = path.join(tmp, 'reference');
  const libraries = path.join(referenceRoot, 'libraries');
  fs.mkdirSync(libraries, { recursive: true });
  fs.writeFileSync(path.join(libraries, 'factions.xml'), '<factions><faction id="ci_probe_faction" name="CI Probe Faction" tags="economic"/></factions>');
  fs.writeFileSync(path.join(libraries, 'wares.xml'), '<wares><ware id="ci_probe_ware" name="CI Probe Ware" group="test" tags="economy"/></wares>');
  fs.writeFileSync(path.join(libraries, 'scriptproperties.xml'), '<scriptproperties><datatype name="faction"><property name="id" result="ID" type="string"/></datatype></scriptproperties>');
}
const canonicalReference = !fixtureReference
  && fs.existsSync(path.join(referenceRoot, 'extensions', 'ego_dlc_split'))
  && fs.existsSync(path.join(referenceRoot, 'extensions', 'ego_dlc_timelines'));
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

async function waitForExit(processHandle, timeoutMs) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return true;
  return await new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    processHandle.once('exit', () => { clearTimeout(timer); resolve(true); });
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
let child;
let stubborn;
let nativeChild;
let childOwner;
let stubbornOwner;
let nativeChildOwner;
let nativeScratchSafe = true;
let output = '';

/** Compiled application wiring proof, separate from the source IPC control suite. */
async function probeNativeStagedBackend(discoveryDir) {
  const { require: requireTs } = createRequire(import.meta.url)('tsx/cjs/api');
  const { createNativePerformance } = requireTs(path.join(extensionRoot, 'src', 'nativePerformance.ts'), import.meta.url);
  const { createNativePerformanceHost } = requireTs(path.join(extensionRoot, 'src', 'nativePerformanceHost.ts'), import.meta.url);
  const { isNativePerformanceRetirementNotice } = requireTs(path.join(extensionRoot, '..', 'shared', 'nativePerformanceChannel.ts'), import.meta.url);
  const { decodeNativePerformanceFrame, encodeNativePerformanceFrame, NATIVE_PERFORMANCE_WIRE_SCHEMA } = requireTs(
    path.join(extensionRoot, '..', 'shared', 'nativePerformanceProtocol.ts'), import.meta.url);
  const binding = { nonce: crypto.randomBytes(32).toString('hex'), epoch: crypto.randomUUID() };
  let resourcesAttempted = 0, timersAttempted = 0, current = true, bridge;
  let hello = false, lastHostSequence = 0, notices = 0, actualSendCallbacks = 0, outputBytes = 0, failed = false;
  let stagedPid = 0, supervisedPidCount = 0, stdoutBuffer = '', boundStartedAt = null;
  let childClosed = false, stdoutClosed = false, stderrClosed = false;
  let faultDispatched = false, faultCallbackSucceeded = false, postFaultNotices = 0;
  const nativePidAbsent = pid => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return false; } catch (error) { return error?.code === 'ESRCH'; }
  };
  const nativeTerminalAndDrained = () => !!nativeChild && (nativeChild.exitCode !== null || nativeChild.signalCode !== null)
    && childClosed && stdoutClosed && stderrClosed;
  const waitNative = async (predicate, milliseconds) => {
    const deadline = performance.now() + milliseconds;
    while (!predicate() && performance.now() < deadline) await sleep(10);
    return predicate();
  };
  const freshIdentityMatches = instance => {
    if (supervisedPidCount !== 1 || !Number.isSafeInteger(stagedPid) || stagedPid <= 0) return false;
    try {
      const own = JSON.parse(fs.readFileSync(path.join(discoveryDir, 'instances', `${stagedPid}.json`), 'utf8'));
      const latest = JSON.parse(fs.readFileSync(path.join(discoveryDir, 'latest.json'), 'utf8'));
      const same = value => value?.pid === stagedPid && value.port === port && value.mode === 'release-host'
        && value.version === extensionVersion && typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt));
      if (!same(instance) || !same(own) || !same(latest) || instance.startedAt !== own.startedAt || instance.startedAt !== latest.startedAt
        || (boundStartedAt !== null && instance.startedAt !== boundStartedAt)) return false;
      if (boundStartedAt === null) boundStartedAt = instance.startedAt;
      return true;
    } catch { return false; }
  };
  const nativeFetch = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  const forbiddenResource = () => { resourcesAttempted++; throw new Error('NATIVE_PROBE_DEFAULT_OFF_RESOURCE'); };
  const producer = createNativePerformance({
    pid: process.pid, instanceId: crypto.randomUUID(), now: () => performance.now(), wallNow: () => Date.now(),
    resources: { pid: forbiddenResource, cpuUsage: forbiddenResource, memoryUsage: forbiddenResource,
      uptime: forbiddenResource, logicalCpuCount: forbiddenResource, eventLoopUtilization: forbiddenResource },
    timers: { set() { timersAttempted++; throw new Error('NATIVE_PROBE_DEFAULT_OFF_TIMER'); },
      clear() { timersAttempted++; throw new Error('NATIVE_PROBE_DEFAULT_OFF_TIMER'); } },
    delayHistogram() { resourcesAttempted++; throw new Error('NATIVE_PROBE_DEFAULT_OFF_HISTOGRAM'); },
  });
  const host = createNativePerformanceHost({ producer });
  try {
    nativeScratchSafe = false;
    nativeChild = spawn(process.execPath, [supervisorPath, serverPath], {
      cwd: appRoot, shell: false, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), X4_FORGE_MODE: 'release-host',
        X4_FORGE_EXTENSION_VERSION: extensionVersion, STUDIO_API_TOKEN: token,
        X4_STATE_DIR: path.join(tmp, 'state'), X4_SOURCE_COORDINATION_DIR: path.join(tmp, 'source-coordination'),
        X4_DATA_DIR: path.join(tmp, 'data'), X4_CONFIG_DIR: path.join(tmp, 'config'),
        X4_REFERENCE_ROOT: referenceRoot, X4_XSD_PATH: path.join(referenceRoot, 'libraries'), X4FORGE_DISCOVERY_DIR: discoveryDir,
        X4_FORGE_PARENT_MODE: 'pipe-v1', X4_FORGE_PARENT_PID: String(process.pid), X4_FORGE_PARENT_NONCE: binding.nonce,
        X4_FORGE_NATIVE_MODE: 'ipc-v1', X4_FORGE_NATIVE_EPOCH: binding.epoch },
    });
    nativeChildOwner = trackOwnedProbeChild(nativeChild);
    nativeChild.on('error', () => { failed = true; });
    nativeChild.once('close', () => { childClosed = true; });
    nativeChild.stdout.once('close', () => { stdoutClosed = true; });
    nativeChild.stderr.once('close', () => { stderrClosed = true; });
    const boundedOutput = chunk => {
      outputBytes += chunk.length;
      if (outputBytes > 262144) { failed = true; nativeChild.stdin?.end(); return false; }
      return true;
    };
    const parseNativeLine = line => {
      const match = /^\[sidecar-supervisor\] X4FORGE_SUPERVISED_PID=(\d+)$/.exec(line.trim());
      if (!match) return;
      supervisedPidCount++;
      if (supervisedPidCount !== 1) failed = true; else stagedPid = Number(match[1]);
    };
    nativeChild.stdout.on('data', chunk => {
      if (!boundedOutput(chunk)) return;
      stdoutBuffer += chunk.toString('utf8');
      let end;
      while ((end = stdoutBuffer.indexOf('\n')) >= 0) {
        parseNativeLine(stdoutBuffer.slice(0, end)); stdoutBuffer = stdoutBuffer.slice(end + 1);
      }
    });
    nativeChild.stdout.once('end', () => { if (stdoutBuffer) parseNativeLine(stdoutBuffer); stdoutBuffer = ''; });
    nativeChild.stderr.on('data', boundedOutput);
    const channel = {
      isConnected: () => nativeChild.connected,
      send(text, callback) {
        const decoded = decodeNativePerformanceFrame(text, { binding, direction: 'host-to-backend' });
        if (decoded.ok) lastHostSequence = Math.max(lastHostSequence, decoded.frame.sequence);
        return nativeChild.send(text, error => { if (error === null) actualSendCallbacks++; callback(error); });
      },
      onMessage(listener) {
        const receive = raw => {
          if (!current || nativeChild.exitCode !== null || nativeChild.signalCode !== null) return;
          if (isNativePerformanceRetirementNotice(raw, binding)) {
            notices++;
            if (faultDispatched) postFaultNotices++; else failed = true;
            bridge?.retire('staged-native-leg-retirement'); return;
          }
          const decoded = decodeNativePerformanceFrame(raw, { binding, direction: 'backend-to-host' });
          if (decoded.ok && decoded.frame.type === 'hello') hello = true;
          listener(raw);
        };
        nativeChild.on('message', receive); return () => { nativeChild.removeListener('message', receive); };
      },
      onDisconnect(listener) { nativeChild.on('disconnect', listener); return () => { nativeChild.removeListener('disconnect', listener); }; },
    };
    bridge = host.attach({ binding, channel, isCurrent: () => current && nativeChild.exitCode === null && nativeChild.signalCode === null });
    let ready = false;
    const startupDeadline = performance.now() + 20_000;
    for (let attempt = 0; attempt < 80 && !failed && performance.now() < startupDeadline; attempt++) {
      await sleep(250);
      try {
        const response = await nativeFetch(`${base}/api/reference/status`);
        if (response.ok) { const body = await response.json(); if (freshIdentityMatches(body.instance)) { ready = true; break; } }
      } catch { /* Ordinary startup does not wait for telemetry readiness. */ }
    }
    check('native staged backend boots over owned four-pipe supervisor', ready && !failed && stagedPid > 0
      && nativeChild.exitCode === null && nativeChild.signalCode === null);
    if (!ready || failed) throw new Error('NATIVE_STAGED_STARTUP_FAILED');
    check('native stdout HTTP and private discovery bind one fresh incarnation', supervisedPidCount === 1 && boundStartedAt !== null);
    for (let attempt = 0; attempt < 50 && (!hello || actualSendCallbacks === 0); attempt++) await sleep(20);
    check('compiled backend hello and ready frame handoff reaches actual production host', hello && lastHostSequence > 0 && actualSendCallbacks > 0);
    const before = await nativeFetch(`${base}/api/schema/config`, { headers: auth });
    await before.arrayBuffer();
    const beforeIdentityResponse = await nativeFetch(`${base}/api/reference/status`); const beforeIdentity = await beforeIdentityResponse.json();
    check('ordinary staged HTTP is alive before native-only retirement', before.status === 200 && beforeIdentityResponse.status === 200
      && freshIdentityMatches(beforeIdentity.instance) && nativeChild.connected && nativeChild.exitCode === null && nativeChild.signalCode === null);
    const initial = producer.status();
    check('compiled handshake leaves native resources and timers default-off', !initial.collectionActive
      && initial.ownedTimerCount === 0 && initial.failedTimerCount === 0 && !initial.eventLoopDelayMonitoring
      && resourcesAttempted === 0 && timersAttempted === 0);
    const zeroNoticeBaseline = notices === 0 && postFaultNotices === 0 && !failed && current && nativeChild.connected
      && nativeChild.exitCode === null && nativeChild.signalCode === null;
    check('native retirement fault has a current channel and zero notice baseline', zeroNoticeBaseline);
    if (!zeroNoticeBaseline) throw new Error('NATIVE_STAGED_PREFAULT_INVALID');

    // Private-IPC fault injection, NOT an ordinary host auto-retirement or execution ACK.
    // Use the real inactive producer status, current binding and a fresh monotonic sequence.
    if (!Number.isSafeInteger(lastHostSequence) || lastHostSequence < 1 || lastHostSequence === Number.MAX_SAFE_INTEGER) throw new Error('NATIVE_STAGED_SEQUENCE_INVALID');
    const encoded = encodeNativePerformanceFrame({ schemaVersion: NATIVE_PERFORMANCE_WIRE_SCHEMA,
      ...binding, direction: 'host-to-backend', sequence: lastHostSequence + 1, type: 'retired', status: producer.status() });
    if (!encoded.ok) throw new Error('NATIVE_STAGED_RETIREMENT_INVALID');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { failed = true; reject(new Error('NATIVE_STAGED_SEND_TIMEOUT')); }, 2000);
      try {
        faultDispatched = true;
        nativeChild.send(encoded.text, error => {
          clearTimeout(timer);
          if (error === null) { faultCallbackSucceeded = true; resolve(); }
          else { failed = true; reject(new Error('NATIVE_STAGED_SEND_FAILED')); }
        });
      } catch { clearTimeout(timer); failed = true; reject(new Error('NATIVE_STAGED_SEND_FAILED')); }
    });
    for (let attempt = 0; attempt < 100 && postFaultNotices === 0; attempt++) await sleep(20);
    check('actual compiled backend retirement notice retires current host bridge', faultDispatched && faultCallbackSucceeded
      && notices === 1 && postFaultNotices === 1 && !failed && !producer.status().collectionActive
      && producer.status().ownedTimerCount === 0 && producer.status().failedTimerCount === 0 && !producer.status().eventLoopDelayMonitoring);
    const after = await nativeFetch(`${base}/api/schema/config`, { headers: auth }); await after.arrayBuffer();
    const identityResponse = await nativeFetch(`${base}/api/reference/status`); const identity = await identityResponse.json();
    check('native-only retirement leaves ordinary compiled HTTP and processes alive', after.status === 200 && identityResponse.status === 200
      && freshIdentityMatches(identity.instance) && nativeChild.exitCode === null && nativeChild.signalCode === null && nativeChild.connected);
    check('staged native retirement never starts resource or timer work', resourcesAttempted === 0 && timersAttempted === 0);
    nativeChild.stdin.end();
    const exited = await waitForExit(nativeChild, 3500);
    check('native enabled staged backend retains parent EOF shutdown', exited && nativeChild.exitCode === 0 && !failed);
    let latestPid = 0;
    try { latestPid = JSON.parse(fs.readFileSync(path.join(discoveryDir, 'latest.json'), 'utf8')).pid; } catch { /* absent is clean */ }
    check('native enabled EOF retires exact staged discovery', !fs.existsSync(path.join(discoveryDir, 'instances', `${stagedPid}.json`)) && latestPid !== stagedPid);
  } finally {
    current = false; bridge?.retire('staged-probe-finally');
    let activationClean = false;
    try {
      const disposed = host.dispose();
      activationClean = disposed.ok && !disposed.status.collectionActive && disposed.status.ownedTimerCount === 0
        && disposed.status.failedTimerCount === 0 && !disposed.status.eventLoopDelayMonitoring;
    } catch { failed = true; }
    check('staged native activation cleanup is confirmed', activationClean);
    if (nativeChild) {
      const retirement = await retireOwnedProbeChild(nativeChildOwner);
      const drained = retirement.confirmed;
      if (!retirement.graceful) failed = true;
      const bound = supervisedPidCount === 1 && stagedPid > 0 && Number.isSafeInteger(stagedPid) && boundStartedAt !== null;
      const workerAbsent = bound && await waitNative(() => nativePidAbsent(stagedPid), 2000);
      nativeScratchSafe = drained && bound && workerAbsent;
    }
    // Child close follows stdout/stderr close: consume every late cap/error latch before credit.
    check('native terminal ownership output and bound backend absence are confirmed', nativeScratchSafe && !failed
      && nativeTerminalAndDrained() && nativeChild.exitCode === 0 && outputBytes <= 262144);
  }
}
try {
  check('staged server exists', fs.existsSync(serverPath), serverPath);
  if (!fs.existsSync(serverPath)) throw new Error('staged server missing');
  check('packaged supervisor exists', fs.existsSync(supervisorPath), supervisorPath);
  if (!fs.existsSync(supervisorPath)) throw new Error('sidecar supervisor missing');
  const parentNonce = 'a'.repeat(64);
  const discoveryDir = path.join(tmp, 'discovery');
  child = spawn(process.execPath, [supervisorPath, serverPath], {
    cwd: appRoot,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      X4_FORGE_MODE: 'release-host',
      X4_FORGE_EXTENSION_VERSION: extensionVersion,
      STUDIO_API_TOKEN: token,
      X4_STATE_DIR: path.join(tmp, 'state'),
      X4_SOURCE_COORDINATION_DIR: path.join(tmp, 'source-coordination'),
      X4_DATA_DIR: path.join(tmp, 'data'),
      X4_CONFIG_DIR: path.join(tmp, 'config'),
      X4_REFERENCE_ROOT: referenceRoot,
      X4_XSD_PATH: path.join(referenceRoot, 'libraries'),
      X4FORGE_DISCOVERY_DIR: discoveryDir,
      X4_FORGE_PARENT_MODE: 'pipe-v1',
      X4_FORGE_PARENT_PID: String(process.pid),
      X4_FORGE_PARENT_NONCE: parentNonce,
    },
  });
  childOwner = trackOwnedProbeChild(child);
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    await sleep(250);
    try {
      const response = await fetch(`${base}/api/reference/status`);
      if (response.ok) { ready = true; break; }
    } catch { /* keep polling */ }
  }
  check('staged sidecar boots', ready, ready ? '' : output.slice(-500));
  if (!ready) throw new Error('staged sidecar did not become ready');

  const page = await fetch(`${base}/`).then(response => response.text());
  check('production UI serves injected session token', /__STUDIO_API_TOKEN__/.test(page));
  const unauthConfig = await fetch(`${base}/api/schema/config`);
  check('directory config remains protected', unauthConfig.status === 401, String(unauthConfig.status));
  const configResponse = await fetch(`${base}/api/schema/config`, { headers: auth });
  const config = await configResponse.json();
  check('authenticated directory config loads', configResponse.ok && config.resolved?.x4ReferenceExists === true, JSON.stringify(config.resolved || config));

  if (canonicalReference) {
    const completionResponse = await fetch(`${base}/api/reference/complete`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({
        path: 'md/probe.xml',
        content: '<mdscript><cues><cue name="Probe"><actions><set_value name="$x" exact="faction."/></actions></cue></cues></mdscript>',
        line: 0,
        column: 79,
      }),
    });
    const completion = await completionResponse.json();
    check('staged completion reaches canonical corpus', completionResponse.ok && Array.isArray(completion)
      && completion.length === 32 && completion.some(item => item.label === 'fallensplit')
      && !completion.some(item => item.label === 'riptide'),
    `status=${completionResponse.status} count=${Array.isArray(completion) ? completion.length : 'n/a'} root=${referenceRoot}`);
  } else {
    const fixtureResponse = await fetch(`${base}/api/reference/factions`);
    const factions = await fixtureResponse.json();
    check('staged reference API reaches hermetic CI corpus', fixtureResponse.ok && Array.isArray(factions)
      && factions.length === 1 && factions[0]?.id === 'ci_probe_faction',
    `status=${fixtureResponse.status} count=${Array.isArray(factions) ? factions.length : 'n/a'} root=${referenceRoot}`);
  }

  const supervisedPid = Number(/X4FORGE_SUPERVISED_PID=(\d+)/.exec(output)?.[1] || 0);
  check('supervisor reports exact owned server pid', supervisedPid > 0 && pidAlive(supervisedPid), String(supervisedPid));
  const publicStatus = await fetch(`${base}/api/reference/status`);
  const { instance } = await publicStatus.json();
  const discovery = JSON.parse(fs.readFileSync(path.join(discoveryDir, 'latest.json'), 'utf8'));
  check('public identity agrees with the staged host discovery', publicStatus.ok && publicStatus.headers.get('cache-control') === 'no-store'
    && instance?.mode === 'release-host' && instance.pid === supervisedPid && instance.port === port
    && instance.startedAt === discovery.startedAt && instance.version === extensionVersion
    && instance.mode === discovery.mode && instance.pid === discovery.pid && instance.port === discovery.port
    && instance.version === discovery.version && Object.keys(instance).sort().join(',') === 'mode,pid,port,startedAt,version');
  check('claimed parent pid is alive before orphan drill', pidAlive(process.pid), String(process.pid));
  child.stdin.end();
  const gracefulExit = await waitForExit(child, 3000);
  check('parent pipe loss exits supervised staged sidecar', gracefulExit && !pidAlive(supervisedPid), `supervisorExit=${child.exitCode} serverPid=${supervisedPid}`);
  check('live claimed parent pid cannot preserve orphan', pidAlive(process.pid), String(process.pid));
  const instanceRecord = path.join(discoveryDir, 'instances', `${supervisedPid}.json`);
  let latestPid = 0;
  try { latestPid = JSON.parse(fs.readFileSync(path.join(discoveryDir, 'latest.json'), 'utf8')).pid; } catch { /* absent is clean */ }
  check('graceful orphan exit removes discovery', !fs.existsSync(instanceRecord) && latestPid !== supervisedPid, `record=${fs.existsSync(instanceRecord)} latestPid=${latestPid}`);

  const invalidEnv = { ...process.env };
  delete invalidEnv.X4_FORGE_PARENT_MODE;
  delete invalidEnv.X4_FORGE_PARENT_PID;
  delete invalidEnv.X4_FORGE_PARENT_NONCE;
  const invalid = spawnSync(process.execPath, [supervisorPath, serverPath], {
    cwd: appRoot, env: invalidEnv, encoding: 'utf8', windowsHide: true,
  });
  check('invalid parent contract refuses before spawn', invalid.status === 64 && /refusing to spawn/.test(invalid.stderr || ''), `status=${invalid.status}`);

  const stubbornPath = path.join(tmp, 'stubborn-child.cjs');
  fs.writeFileSync(stubbornPath, `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore',
  windowsHide: true,
});
const discovery = process.env.X4FORGE_DISCOVERY_DIR;
const instances = path.join(discovery, 'instances');
fs.mkdirSync(instances, { recursive: true });
const record = JSON.stringify({ pid: process.pid, port: Number(process.env.PORT),
  startedAt: new Date().toISOString(), cwd: process.cwd(), mode: 'staged-probe' });
fs.writeFileSync(path.join(instances, process.pid + '.json'), record);
fs.writeFileSync(path.join(discovery, 'latest.json'), record);
console.log('X4FORGE_PROBE_DESCENDANT_PID=' + descendant.pid);
setInterval(() => {}, 1000);
`);
  let stubbornOutput = '';
  stubborn = spawn(process.execPath, [supervisorPath, stubbornPath], {
    cwd: tmp,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      X4FORGE_DISCOVERY_DIR: discoveryDir,
      X4_FORGE_PARENT_MODE: 'pipe-v1',
      X4_FORGE_PARENT_PID: String(process.pid),
      X4_FORGE_PARENT_NONCE: 'b'.repeat(64),
    },
  });
  stubbornOwner = trackOwnedProbeChild(stubborn);
  stubborn.stdout.on('data', chunk => { stubbornOutput += chunk; });
  stubborn.stderr.on('data', chunk => { stubbornOutput += chunk; });
  let stubbornPid = 0;
  let descendantPid = 0;
  for (let attempt = 0; attempt < 30 && (!stubbornPid || !descendantPid); attempt++) {
    await sleep(50);
    stubbornPid = Number(/X4FORGE_SUPERVISED_PID=(\d+)/.exec(stubbornOutput)?.[1] || 0);
    descendantPid = Number(/X4FORGE_PROBE_DESCENDANT_PID=(\d+)/.exec(stubbornOutput)?.[1] || 0);
  }
  check('stubborn fixture and descendant started', stubbornPid > 0 && descendantPid > 0
    && pidAlive(stubbornPid) && pidAlive(descendantPid), `childPid=${stubbornPid} descendantPid=${descendantPid}`);
  const stubbornRecord = path.join(discoveryDir, 'instances', `${stubbornPid}.json`);
  const stubbornLatest = path.join(discoveryDir, 'latest.json');
  check('stubborn fixture published its discovery', fs.existsSync(stubbornRecord)
    && JSON.parse(fs.readFileSync(stubbornLatest, 'utf8')).pid === stubbornPid);
  const forceStart = performance.now();
  stubborn.stdin.end();
  const stubbornExit = await waitForExit(stubborn, 3500);
  while (stubbornExit && (pidAlive(stubbornPid) || pidAlive(descendantPid)) && performance.now() - forceStart < 3500) {
    await sleep(10);
  }
  check('supervisor force reaps pipe-ignorant owned tree', stubbornExit && performance.now() - forceStart <= 3500 && !pidAlive(stubbornPid) && !pidAlive(descendantPid),
    `elapsedMs=${Math.round(performance.now() - forceStart)} supervisorExit=${stubborn.exitCode} childPid=${stubbornPid} descendantPid=${descendantPid}`);
  check('force reap never kills claimed parent pid', pidAlive(process.pid), String(process.pid));
  check('force reap removes owned discovery', !fs.existsSync(stubbornRecord) && !fs.existsSync(stubbornLatest));
  await probeNativeStagedBackend(discoveryDir);
} catch (error) {
  check('probe completed without exception', false, error instanceof Error ? error.message : String(error));
} finally {
  let ownedCleanupConfirmed = true;
  for (const [handle, owner] of [[nativeChild, nativeChildOwner], [stubborn, stubbornOwner], [child, childOwner]]) {
    if (!handle) continue;
    const retirement = await retireOwnedProbeChild(owner);
    if (!retirement.confirmed) ownedCleanupConfirmed = false;
  }
  check('all staged probe owned handles finish terminal with drained streams', ownedCleanupConfirmed);
  if (nativeScratchSafe && ownedCleanupConfirmed) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  } else check('unknown native identity or cleanup preserves owned probe temp', false);
}

const passed = checks.filter(item => item.pass).length;
console.log(`[staged-app-probe] ${passed}/${checks.length} ${passed === checks.length ? 'PASS' : 'FAIL'}`);
process.exit(checks.length > 0 && passed === checks.length ? 0 : 1);
