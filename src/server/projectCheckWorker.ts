import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { bindProjectCheckCommand } from './projectCheckCommand';
import type { ProjectCheckSourceLease } from './sharedSourceCoordinator';

const MAX_FRAME_BYTES = 256 * 1024;
const MAX_PROTOCOL_BYTES = 96 * 1024;
const MAX_BOOTSTRAP_FILE_BYTES = 64 * 1024 * 1024;
// Allow interpreter startup, registry admission and the launcher's five-second Job drain.
const WORKER_GRACE_MS = 20_000;
const WORKER_BOOTSTRAP = `
import hashlib, sys
filename, expected = sys.argv[1:]
with open(filename, "rb") as source:
    code = source.read(${MAX_BOOTSTRAP_FILE_BYTES + 1})
if len(code) > ${MAX_BOOTSTRAP_FILE_BYTES} or hashlib.sha256(code).hexdigest() != expected:
    raise SystemExit(1)
sys.argv = [filename]
exec(compile(code, filename, "exec", dont_inherit=True), {"__name__": "__main__", "__file__": filename})
`;

export interface TrustedProjectCheckWorker {
  pythonPath: string;
  pythonSha256: string;
  workerPath: string;
  workerSha256: string;
  launcherSha256: string;
  systemRoot: string;
}

const WORKER_STATUSES = ['passed', 'failed', 'timed-out', 'output-limit', 'canceled', 'infrastructure-error'] as const;
type WorkerStatus = typeof WORKER_STATUSES[number];
type BoundProjectCheck = ReturnType<typeof bindProjectCheckCommand>;

export interface ProjectCheckWorkerResult {
  status: WorkerStatus;
  exitCode: number | null;
  outputBytes: number;
  durationSeconds: number;
  outputTailBase64: string;
}

function trustedLocalPath(value: string): string {
  if (!/^[A-Za-z]:[\\/]/.test(value) || /[:\u0000-\u001f\u007f]/.test(value.slice(2))) {
    throw new Error('The project check worker requires absolute local runtime paths.');
  }
  const normalized = path.resolve(value);
  const physical = fs.realpathSync.native(normalized);
  if (physical.toLowerCase() !== normalized.toLowerCase()) {
    throw new Error('The project check worker runtime path resolves through an alias.');
  }
  return physical;
}

function sameFile(a: fs.BigIntStats, b: fs.BigIntStats) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && b.isFile() && b.nlink === 1n;
}

function verifyRuntimeFile(filename: string, expectedSha256: string): void {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('A pinned project check worker runtime is required.');
  const before = fs.lstatSync(filename, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(MAX_BOOTSTRAP_FILE_BYTES)) {
    throw new Error('The project check worker runtime file is unsafe or too large.');
  }
  const fd = fs.openSync(filename, 'r');
  try {
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true }))) {
      throw new Error('The project check worker runtime file changed before verification.');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += count;
      if (total > MAX_BOOTSTRAP_FILE_BYTES) throw new Error('The project check worker runtime file exceeds its limit.');
      hash.update(buffer.subarray(0, count));
    }
    if (BigInt(total) !== before.size || !sameFile(before, fs.fstatSync(fd, { bigint: true }))
      || !sameFile(before, fs.lstatSync(filename, { bigint: true })) || hash.digest('hex') !== expectedSha256) {
      throw new Error('The project check worker runtime file failed its pinned integrity check.');
    }
  } finally {
    fs.closeSync(fd);
  }
}

function parseResult(output: Buffer, bound: BoundProjectCheck, workerDeadlineMs: number): ProjectCheckWorkerResult {
  const invalid = () => new Error('The project check worker returned an invalid terminal result.');
  if (output.some(byte => byte > 0x7f)) throw invalid();
  const wire = output.toString('ascii');
  if (!wire.endsWith('\n')) throw invalid();
  const line = wire.slice(0, wire.endsWith('\r\n') ? -2 : -1);
  if (!line || /[^\x20-\x7e]/.test(line)) throw invalid();

  let result: unknown;
  try {
    result = JSON.parse(line);
  } catch {
    throw invalid();
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw invalid();
  const values = result as Record<string, unknown>;
  const fields = ['status', 'exitCode', 'outputBytes', 'durationSeconds', 'outputTailBase64', 'treeEmpty', 'cleanupPersisted'];
  // Each permitted value is a flat primitive with no colon. Counting separators also rejects duplicate keys.
  if (Object.keys(values).length !== fields.length || fields.some(key => !Object.hasOwn(values, key))
    || line.match(/:/g)?.length !== fields.length) throw invalid();

  const { status, exitCode, outputBytes, durationSeconds, outputTailBase64, treeEmpty, cleanupPersisted } = values;
  const knownStatus = WORKER_STATUSES.find(known => known === status);
  const { maxOutputBytes, retainedOutputBytes } = bound.binding.command;
  if (!knownStatus || treeEmpty !== true || cleanupPersisted !== true
    || typeof outputBytes !== 'number' || !Number.isSafeInteger(outputBytes) || outputBytes < 0
    || (knownStatus === 'output-limit' ? outputBytes !== maxOutputBytes + 1 : outputBytes > maxOutputBytes)
    || typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)
    || durationSeconds < 0 || durationSeconds > workerDeadlineMs / 1000
    || typeof outputTailBase64 !== 'string') throw invalid();

  if (knownStatus === 'passed' && exitCode !== 0) throw invalid();
  if (knownStatus === 'failed' && (typeof exitCode !== 'number'
    || !Number.isSafeInteger(exitCode) || exitCode < 1 || exitCode > 0xffffffff)) throw invalid();
  if (knownStatus !== 'passed' && knownStatus !== 'failed' && exitCode !== null) throw invalid();

  const tail = Buffer.from(outputTailBase64, 'base64');
  if (tail.length !== Math.min(outputBytes, retainedOutputBytes) || tail.toString('base64') !== outputTailBase64) throw invalid();
  return { status: knownStatus, exitCode: typeof exitCode === 'number' ? exitCode : null, outputBytes, durationSeconds, outputTailBase64 };
}

/** Execute one bound check while the caller holds its source lease. */
export async function runProjectCheckWorker(
  lease: ProjectCheckSourceLease,
  bound: BoundProjectCheck,
  runtime: TrustedProjectCheckWorker,
): Promise<ProjectCheckWorkerResult> {
  if (process.platform !== 'win32') throw new Error('The guarded project check worker requires Windows.');
  const python = trustedLocalPath(runtime.pythonPath);
  const worker = trustedLocalPath(runtime.workerPath);
  const cwd = path.dirname(worker);
  const launcher = trustedLocalPath(path.join(cwd, 'projectCheckWindowsJob.py'));
  const systemRoot = trustedLocalPath(runtime.systemRoot);
  const { command } = bound.binding;
  if (path.extname(python).toLowerCase() !== '.exe' || path.basename(worker) !== 'projectCheckLeaseWorker.py'
    || !fs.statSync(systemRoot).isDirectory() || path.resolve(command.environment.SystemRoot).toLowerCase() !== systemRoot.toLowerCase()) {
    throw new Error('The project check worker runtime configuration is invalid.');
  }
  verifyRuntimeFile(python, runtime.pythonSha256);
  verifyRuntimeFile(worker, runtime.workerSha256);
  verifyRuntimeFile(launcher, runtime.launcherSha256);

  const workerDeadlineMs = command.timeoutSeconds * 1000 + WORKER_GRACE_MS;
  const deadline = performance.now() + workerDeadlineMs;
  const child = spawn(python, ['-I', '-S', '-B', '-c', WORKER_BOOTSTRAP, worker, runtime.workerSha256], {
    cwd, env: { SystemRoot: systemRoot }, shell: false, windowsHide: true, detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let transportFailed = false;
  let expired = false;
  let protocolBytes = 0;
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => {
    if (protocolBytes > MAX_PROTOCOL_BYTES) return;
    protocolBytes += chunk.length;
    if (protocolBytes <= MAX_PROTOCOL_BYTES) chunks.push(chunk);
  });
  child.stderr.on('data', () => { transportFailed = true; });
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    stream.on('error', () => { transportFailed = true; });
  }
  const started = new Promise<boolean>(resolve => {
    child.once('spawn', () => resolve(true));
    child.on('error', () => { transportFailed = true; resolve(false); });
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const watchdog = setTimeout(() => {
    expired = true;
    child.stdin.destroy();
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      try { child.kill(); } catch { /* Wait for the actual close event even if termination fails. */ }
    }
    child.stdout.destroy();
    child.stderr.destroy();
  }, workerDeadlineMs);

  try {
    if (!await started || !child.pid || transportFailed) throw new Error('The project check worker failed to start.');
    bound.assertReady();
    if (performance.now() >= deadline) throw new Error('The project check worker launch deadline expired.');
    const frame = lease.armProjectCheck({
      bindingHash: bound.bindingHash, commandHash: bound.commandHash, helperPid: child.pid,
      jobName: command.jobName, launcherHash: runtime.launcherSha256, runId: command.runId,
    });
    const input = JSON.stringify({ ...frame, command }) + '\n';
    if (Buffer.byteLength(input, 'utf8') > MAX_FRAME_BYTES) throw new Error('The project check launch frame exceeds its limit.');
    if (performance.now() >= deadline) throw new Error('The project check worker launch deadline expired.');
    child.stdin.end(input, 'utf8');

    const terminal = await closed;
    if (expired || performance.now() >= deadline || transportFailed
      || terminal.code !== 0 || terminal.signal !== null || protocolBytes > MAX_PROTOCOL_BYTES) {
      throw new Error('The project check worker did not complete its terminal protocol.');
    }
    const result = parseResult(Buffer.concat(chunks, protocolBytes), bound, workerDeadlineMs);
    lease.assertProjectCheckDrained(frame);
    return result;
  } finally {
    // An idle helper receives EOF if admission fails. Once a frame is sent, only
    // actual child closure and durable state can settle execution and cleanup.
    if (!child.stdin.writableEnded) child.stdin.destroy();
    await closed;
    clearTimeout(watchdog);
  }
}
