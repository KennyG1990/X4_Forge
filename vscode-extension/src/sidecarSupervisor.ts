/**
 * Standalone parent-death supervisor for the managed Forge sidecar.
 *
 * It intentionally does not import VS Code. The extension host owns this process through stdin;
 * this process owns exactly one server child. Parent PID is diagnostic only—pipe closure is the
 * authority, so PID reuse can never keep the server alive or cause an unrelated process to die.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { enterWindowsSidecarJob } from './windowsSidecarJob';
import { createNativePerformanceRelay } from './nativePerformanceRelay';
import {
  createNativePerformanceRetirementNotice, isNativePerformanceRetirementNotice,
  type NativePerformanceEndpoint,
} from '../../shared/nativePerformanceChannel';
import { isNativeInstanceId } from '../../shared/nativePerformanceProtocol';

const MODE = 'pipe-v1';
const NONCE_PATTERN = /^[a-f0-9]{32,128}$/i;
const GRACE_MS = 750;

function validContract(): boolean {
  const pid = Number(process.env.X4_FORGE_PARENT_PID);
  return process.env.X4_FORGE_PARENT_MODE === MODE
    && Number.isSafeInteger(pid)
    && pid > 0
    && NONCE_PATTERN.test(String(process.env.X4_FORGE_PARENT_NONCE || ''));
}

function forceKillOwnedTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') return;
  try { process.kill(-child.pid, 'SIGKILL'); }
  catch { try { process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ } }
}

function fail(message: string, code: number): never {
  console.error(`[sidecar-supervisor] ${message}`);
  process.exit(code);
}

if (!validContract()) fail('invalid or missing pipe-v1 parent contract; refusing to spawn an unowned server.', 64);

const [serverArg, ...nodeArgs] = process.argv.slice(2);
if (!serverArg) fail('missing server entrypoint.', 64);
const serverPath = path.resolve(serverArg);
const nativeEpoch = process.env.X4_FORGE_NATIVE_EPOCH;
const nativeEnabled = process.connected === true && typeof process.send === 'function'
  && process.env.X4_FORGE_NATIVE_MODE === 'ipc-v1' && isNativeInstanceId(nativeEpoch);
const nativeBinding = nativeEnabled
  ? { nonce: String(process.env.X4_FORGE_PARENT_NONCE), epoch: nativeEpoch! } : undefined;
if (process.platform === 'win32') {
  try { enterWindowsSidecarJob(); }
  catch (error) {
    fail(`Windows sidecar containment unavailable: ${error instanceof Error ? error.message : String(error)}`, 70);
  }
}

const server = spawn(process.execPath, [...nodeArgs, serverPath], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    X4_FORGE_NATIVE_MODE: nativeEnabled ? 'ipc-v1' : '',
    X4_FORGE_NATIVE_EPOCH: nativeEnabled ? nativeEpoch : '',
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  windowsHide: true,
  detached: process.platform !== 'win32',
});
console.log(`[sidecar-supervisor] X4FORGE_SUPERVISED_PID=${server.pid || 0}`);
server.stdout?.pipe(process.stdout);
server.stderr?.pipe(process.stderr);

let nativeRelay: ReturnType<typeof createNativePerformanceRelay> | undefined;
let nativeRetirementAnnounced = false;
let releaseNativeLifecycle: (() => void) | undefined;
function announceNativeRetirement(): void {
  const release = releaseNativeLifecycle;
  releaseNativeLifecycle = undefined;
  try { release?.(); } catch { /* observer listener cleanup cannot delay shutdown */ }
  if (!nativeBinding || nativeRetirementAnnounced) return;
  nativeRetirementAnnounced = true;
  // Separate, once-only lifecycle propagation; never synthesize a telemetry ACK.
  try {
    if (process.connected && process.send) process.send(createNativePerformanceRetirementNotice(nativeBinding), () => {});
  } catch { /* no resend; the activation-owned lease still expires locally */ }
}
if (nativeBinding) {
  const host: NativePerformanceEndpoint = {
    isConnected: () => process.connected === true,
    send: (frame, callback) => {
      if (!process.send) { callback(new Error('NATIVE_IPC_UNAVAILABLE')); return false; }
      return process.send(frame, callback);
    },
    onMessage: listener => { process.on('message', listener); return () => { process.removeListener('message', listener); }; },
    onDisconnect: listener => { process.on('disconnect', listener); return () => { process.removeListener('disconnect', listener); }; },
  };
  const backend: NativePerformanceEndpoint = {
    isConnected: () => server.connected,
    send: (frame, callback) => server.send(frame, callback),
    onMessage: listener => { server.on('message', listener); return () => { server.removeListener('message', listener); }; },
    onDisconnect: listener => { server.on('disconnect', listener); return () => { server.removeListener('disconnect', listener); }; },
  };
  const onNativeLifecycle = (raw: unknown) => {
    if (isNativePerformanceRetirementNotice(raw, nativeBinding)) retireNativeRelay();
  };
  server.on('message', onNativeLifecycle);
  releaseNativeLifecycle = () => { server.removeListener('message', onNativeLifecycle); };
  try {
    nativeRelay = createNativePerformanceRelay({
      binding: nativeBinding,
      host,
      backend,
      onRetire: announceNativeRetirement,
    });
  } catch {
    announceNativeRetirement();
    console.warn('[native-performance] relay unavailable; ordinary sidecar remains available');
  }
}

function retireNativeRelay(): void {
  try { nativeRelay?.retire(); } catch { /* telemetry cannot prevent owned shutdown */ }
  announceNativeRetirement();
}

let shuttingDown = false;
let forceTimer: ReturnType<typeof setTimeout> | null = null;
let failsafeTimer: ReturnType<typeof setTimeout> | null = null;

function beginShutdown(reason: string, signalChild: boolean): void {
  if (shuttingDown) return;
  shuttingDown = true;
  retireNativeRelay();
  console.error(`[sidecar-supervisor] ${reason}; waiting ${GRACE_MS} ms for owned server ${server.pid || 0} to exit.`);
  if (server.connected) {
    try {
      server.send({ type: 'x4forge-parent-lost', nonce: process.env.X4_FORGE_PARENT_NONCE });
    } catch { /* force fallback below */ }
  } else if (signalChild) {
    try { server.kill('SIGTERM'); } catch { /* force fallback below */ }
  }
  forceTimer = setTimeout(() => {
    if (process.platform === 'win32') {
      console.error('[sidecar-supervisor] graceful shutdown expired; terminating the owned server.');
      // Let the child's exit handler retire discovery before the Job closes over its descendants.
      try { server.kill('SIGKILL'); } catch { /* the Job closes on the failsafe below */ }
    } else {
      forceKillOwnedTree(server);
    }
    failsafeTimer = setTimeout(() => process.exit(1), 1500);
    failsafeTimer.unref();
  }, GRACE_MS);
  forceTimer.unref();
}

process.stdin.once('end', () => beginShutdown('parent pipe ended', false));
process.stdin.once('close', () => beginShutdown('parent pipe closed', false));
process.stdin.once('error', () => beginShutdown('parent pipe errored', false));
process.stdin.resume();

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.once(signal, () => beginShutdown(`supervisor received ${signal}`, true));
}

server.once('error', error => fail(`server spawn failed: ${error.message}`, 1));
server.once('exit', async (code, signal) => {
  shuttingDown = true;
  retireNativeRelay();
  if (forceTimer) clearTimeout(forceTimer);
  if (failsafeTimer) clearTimeout(failsafeTimer);
  // Abrupt exit can skip the server's own cleanup. Leave a reused PID alone.
  try {
    const { pidAlive, unpublishInstance } = await import('../../src/lib/instanceDiscovery.js');
    if (server.pid && !pidAlive(server.pid)) unpublishInstance(server.pid);
  } catch {
    console.warn('[sidecar-supervisor] Discovery cleanup unavailable. Startup pruning can recover stale records.');
  }
  console.error(`[sidecar-supervisor] owned server exited (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`);
  process.exit(code ?? (signal ? 1 : 0));
});

process.once('exit', () => { retireNativeRelay(); forceKillOwnedTree(server); });
