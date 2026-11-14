import leaseFs from 'node:fs';
import leasePath from 'node:path';
import leaseCrypto from 'node:crypto';
import leaseChildProcess from 'node:child_process';
import { createRequire as leaseCreateRequire } from 'node:module';
import { fileURLToPath as leaseFileURLToPath, pathToFileURL as leasePathToFileURL } from 'node:url';
import { readE2eRunState as leaseReadRunState, isSafeWindowsRuntimeVersion as leaseSafeRuntime } from './e2e-runtime-bootstrap.mjs';
import { types as nodeUtilTypes } from 'node:util';

import {
  initializeSpawnedProcessOwnership,
  readSpawnedProcessOwnershipFailureCode,
  sampleSpawnedProcessOwnership,
} from './e2e-process-ownership-sampler.mjs';
import { terminateCapturedProcessTree } from './e2e-process-termination-executor.mjs';

/**
 * Inactive synchronous process-identity retention. The caller supplies native and
 * failure adapters; importing this module installs nothing and opens no HANDLEs.
 * Every acquired HANDLE remains retained until the owning process is destroyed.
 * In particular, child exit/close must not retire a lease: dependency cleanup can
 * still refer to an exited child while its own asynchronous cleanup is pending.
 */
export function createE2eProcessHandleLeaseOwner({ openProcess, retireChild, onFailure, limit = 4096 } = {}) {
  if (typeof openProcess !== 'function'
    || typeof retireChild !== 'function'
    || typeof onFailure !== 'function'
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 4096) {
    throw new TypeError('Invalid E2E process HANDLE lease owner.');
  }

  const retainedHandles = [];
  const leasedChildren = new WeakMap();
  const spawningChildren = new WeakSet();
  // A retirement request is not proof of process exit. Keep the exact failed
  // child strongly reachable even when its retirement adapter throws.
  const retiredChildren = new Set();
  let inFlight = 0;
  let spawnCalls = 0;
  let spawnThrows = 0;
  let acquisitionAttempts = 0;
  let noPidCalls = 0;
  let idempotentReuses = 0;
  let failed = false;
  let failureCode = null;
  let retirementAttempts = 0;
  let retirementFailed = false;
  let reportingFailed = false;
  let refusedCalls = 0;

  function failureError() {
    const error = new Error(failureCode);
    error.code = failureCode;
    return error;
  }

  function retireExactChild(child) {
    if (retiredChildren.has(child)) return;
    retiredChildren.add(child);
    retirementAttempts += 1;
    try { retireChild(child, failureCode); }
    catch { retirementFailed = true; }
  }

  function latchFailure(code, child) {
    const firstFailure = !failed;
    if (firstFailure) {
      failed = true;
      failureCode = code;
    }
    try {
      if (child !== undefined) retireExactChild(child);
    } finally {
      if (firstFailure) {
        try { onFailure(failureCode); }
        catch { reportingFailed = true; }
      }
    }
  }

  function fail(code, child) {
    latchFailure(code, child);
    throw failureError();
  }

  function validHandle(handle) {
    if (typeof handle === 'number') return Number.isSafeInteger(handle) && handle > 0;
    if (typeof handle === 'bigint') return handle > 0n;
    if (handle === null || typeof handle !== 'object'
      || nodeUtilTypes.isProxy(handle) || nodeUtilTypes.isPromise(handle)) return false;
    try { return typeof handle.then !== 'function'; }
    catch { return false; }
  }

  function spawn(originalSpawn, child, args) {
    if (failed) {
      refusedCalls += 1;
      throw failureError();
    }
    if (typeof originalSpawn !== 'function'
      || child === null || (typeof child !== 'object' && typeof child !== 'function')
      || nodeUtilTypes.isProxy(child) || !Array.isArray(args)) {
      return fail('e2e-handle-lease-invalid-spawn');
    }
    if (spawningChildren.has(child)) return fail('e2e-handle-lease-reentrant-spawn');
    const existing = leasedChildren.get(child);
    if (existing === undefined && retainedHandles.length + inFlight >= limit) {
      return fail('e2e-handle-lease-limit');
    }

    let reserved = existing === undefined;
    if (reserved) inFlight += 1;
    spawningChildren.add(child);
    try {
      let result;
      spawnCalls += 1;
      try { result = Reflect.apply(originalSpawn, child, args); }
      catch (error) {
        spawnThrows += 1;
        let pid;
        let pidReadFailed = false;
        try { pid = child.pid; } catch { pidReadFailed = true; }
        if (failed || pidReadFailed
          || (pid !== undefined && pid !== null && (existing === undefined || existing.pid !== pid))) {
          // A throwing raw call can still have created a process. Preserve the
          // original thrown object, but never abandon its unleased receiver.
          latchFailure('e2e-handle-lease-spawn-threw', child);
        }
        throw error;
      }
      let pid;
      try { pid = child.pid; }
      catch { return fail('e2e-handle-lease-invalid-pid', child); }
      if (failed) return fail(failureCode, child);
      if (pid === undefined || pid === null) {
        if (existing !== undefined) return fail('e2e-handle-lease-child-changed', child);
        noPidCalls += 1;
        return result;
      }
      if (!Number.isSafeInteger(pid) || pid < 1) return fail('e2e-handle-lease-invalid-pid', child);
      if (existing !== undefined) {
        if (existing.pid !== pid) return fail('e2e-handle-lease-child-changed', child);
        idempotentReuses += 1;
        return result;
      }

      acquisitionAttempts += 1;
      let handle;
      try { handle = openProcess(pid); }
      catch { return fail('e2e-handle-lease-acquire-failed', child); }
      if (!validHandle(handle)) return fail('e2e-handle-lease-acquire-failed', child);
      // Convert the reservation into a retained lease before exposing success.
      // Even a reentrant adapter failure must not discard an acquired HANDLE.
      inFlight -= 1;
      reserved = false;
      retainedHandles.push(handle);
      leasedChildren.set(child, { pid, handle });
      if (failed) return fail(failureCode, child);
      return result;
    } finally {
      spawningChildren.delete(child);
      if (reserved) inFlight -= 1;
    }
  }

  function snapshot() {
    return Object.freeze({
      limit, retained: retainedHandles.length, inFlight, spawnCalls, spawnThrows,
      acquisitionAttempts, noPidCalls, idempotentReuses, failed, failureCode,
      retirementAttempts, retirementFailed, reportingFailed, refusedCalls,
    });
  }

  return Object.freeze({ spawn, snapshot });
}

export const E2E_PROCESS_HANDLE_ACTOR_ENV = 'X4_FORGE_E2E_HANDLE_ACTOR';
export const E2E_PROCESS_HANDLE_FAILURE_EXIT_CODE = 86;
const LEASE_RECORD_LIMIT = 64 * 1024;
const LEASE_ACTOR_LIMIT = 512;
const LEASE_FILE_LIMIT = 1543;
const LEASE_PHASES = new Set(['active', 'exiting', 'sealed', 'failed']);
const LEASE_ACTORS = new WeakMap();
const LEASE_REQUIRE = leaseCreateRequire(import.meta.url);

function leaseError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
function leaseAssert(condition, code = 'e2e-handle-family-invalid') {
  if (!condition) throw leaseError(code);
}
function leaseHash(value) { return leaseCrypto.createHash('sha256').update(value).digest('hex'); }
function leaseKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function leaseIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}
function leaseSameIdentity(stat, identity) {
  return Object.entries(leaseIdentity(stat)).every(([key, value]) => value === identity[key]);
}
function leaseSamePath(a, b) {
  return typeof a === 'string' && typeof b === 'string'
    && leasePath.resolve(a).toLowerCase() === leasePath.resolve(b).toLowerCase();
}
function leaseFingerprint(file, io) {
  const lexical = leasePath.resolve(file);
  const physical = io.realpathSync.native(lexical);
  const before = io.lstatSync(physical, { bigint: true });
  leaseAssert(before.isFile() && !before.isSymbolicLink() && before.size <= 256n * 1024n * 1024n);
  const fd = io.openSync(physical, 'r');
  const hash = leaseCrypto.createHash('sha256');
  try {
    leaseAssert(leaseSameIdentity(io.fstatSync(fd, { bigint: true }), leaseIdentity(before)));
    const buffer = Buffer.alloc(65536);
    let offset = 0;
    while (true) {
      const count = io.readSync(fd, buffer, 0, buffer.length, offset);
      if (!count) break;
      offset += count;
      leaseAssert(offset <= Number(before.size));
      hash.update(buffer.subarray(0, count));
    }
    const after = io.fstatSync(fd, { bigint: true });
    leaseAssert(offset === Number(before.size) && after.size === before.size
      && after.mtimeNs === before.mtimeNs && leaseSameIdentity(after, leaseIdentity(before)));
  } finally { io.closeSync(fd); }
  leaseAssert(leaseSamePath(io.realpathSync.native(lexical), physical));
  return { lexical, physical, identity: leaseIdentity(before), size: String(before.size), sha256: hash.digest('hex') };
}
function leaseVerifyFingerprint(value, io) {
  leaseAssert(leaseKeys(value, ['lexical', 'physical', 'identity', 'size', 'sha256']));
  const actual = leaseFingerprint(value.lexical, io);
  leaseAssert(JSON.stringify(actual) === JSON.stringify(value), 'e2e-handle-family-fingerprint');
}
function leaseRolePaths(cwd) {
  return {
    cli: leasePath.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js'),
    loader: leasePath.join(cwd, 'node_modules', 'playwright', 'lib', 'loader', 'loaderProcessEntry.js'),
    worker: leasePath.join(cwd, 'node_modules', 'playwright', 'lib', 'worker', 'workerProcessEntry.js'),
  };
}
function leaseNative(manifest) {
  const koffi = LEASE_REQUIRE(manifest.files.koffi.lexical);
  const kernel = koffi.load('kernel32.dll');
  const open = kernel.func('__stdcall', 'OpenProcess', 'void *', ['uint32_t', 'int', 'uint32_t']);
  const getPid = kernel.func('__stdcall', 'GetProcessId', 'uint32_t', ['void *']);
  const times = kernel.func('__stdcall', 'GetProcessTimes', 'int', ['void *', 'void *', 'void *', 'void *', 'void *']);
  const getExit = kernel.func('__stdcall', 'GetExitCodeProcess', 'int', ['void *', 'void *']);
  const current = kernel.func('__stdcall', 'GetCurrentProcess', 'void *', []);
  const retained = [];
  const identity = handle => {
    const pid = getPid(handle);
    const creation = Buffer.alloc(8), exit = Buffer.alloc(8), kernelTime = Buffer.alloc(8), user = Buffer.alloc(8);
    leaseAssert(pid > 0 && times(handle, creation, exit, kernelTime, user), 'e2e-handle-family-native-query');
    return { pid, creationToken: creation.toString('hex') };
  };
  return {
    open(pid) {
      const handle = open(0x101000, 0, pid);
      leaseAssert(handle, 'e2e-handle-family-native-open');
      retained.push(handle); // Keep partial acquisitions too, before any later native query.
      return handle;
    },
    identity,
    self: () => identity(current()),
    exitCode(handle) {
      const value = Buffer.alloc(4);
      leaseAssert(getExit(handle, value), 'e2e-handle-family-native-query');
      return value.readUInt32LE(0);
    },
  };
}
function leaseCatalog({ cwd, preloadPath, runtimePath, extraPreloads, io }) {
  leaseAssert(Array.isArray(extraPreloads) && extraPreloads.length <= 1);
  const integration = leasePath.join(cwd, 'scripts', 'e2e-runner-integration.selftest.mjs');
  leaseAssert(extraPreloads.every(file => leaseSamePath(file, integration)), 'e2e-handle-family-extra-preload');
  const roles = Object.fromEntries(Object.entries(leaseRolePaths(cwd)).map(([role, file]) => [role, leaseFingerprint(file, io)]));
  const koffi = leasePath.join(cwd, 'vscode-extension', 'node_modules', 'koffi', 'index.cjs');
  const koffiRoot = leasePath.dirname(koffi);
  const nativeFile = LEASE_REQUIRE.resolve(leasePath.join(cwd, 'vscode-extension', 'node_modules', '@koromix', `koffi-win32-${process.arch}`));
  const files = {
    preload: leaseFingerprint(preloadPath, io), runtime: leaseFingerprint(runtimePath, io),
    lifecycle: leaseFingerprint(leaseFileURLToPath(import.meta.url), io), koffi: leaseFingerprint(koffi, io),
    koffiLoader: leaseFingerprint(leasePath.join(koffiRoot, 'src', 'koffi', 'index.cjs'), io),
    koffiPackage: leaseFingerprint(leasePath.join(koffiRoot, 'package.json'), io),
    koffiNativeEntry: leaseFingerprint(nativeFile, io),
    koffiNative: leaseFingerprint(leasePath.join(leasePath.dirname(nativeFile), `win32_${process.arch}`, 'koffi.node'), io),
    runner: leaseFingerprint(leasePath.join(cwd, 'node_modules', 'playwright', 'lib', 'runner', 'index.js'), io),
    core: leaseFingerprint(leasePath.join(cwd, 'node_modules', 'playwright-core', 'lib', 'coreBundle.js'), io),
  };
  return { roles, files, extraPreloads: extraPreloads.map(file => leaseFingerprint(file, io)) };
}
function leaseImports(manifest) {
  return [manifest.files.preload, ...manifest.extraPreloads].map(file => leasePathToFileURL(file.lexical).href);
}
function leaseParseNodeArgs(args) {
  leaseAssert(Array.isArray(args) && args.length <= 10000 && args.every(value => typeof value === 'string'));
  const imports = [];
  let ambiguous = false;
  // Reviewed fixed-family prefixes, not a general parser for every Node option.
  const values = new Set(['--import', '--require', '-r', '--loader', '--experimental-loader', '--conditions', '-C', '--inspect-port', '--input-type', '--experimental-default-type', '--env-file', '--env-file-if-exists', '--openssl-config', '--icu-data-dir', '--title', '--max-old-space-size', '--max_old_space_size', '--stack-size', '--redirect-warnings', '--redirect_warnings']);
  const unary = new Set(['--version', '-v', '--help', '-h', '--no-warnings', '--trace-warnings', '--enable-source-maps', '--expose-gc', '--inspect', '--inspect-brk', '--inspect-wait', '--use-strict', '--experimental-strip-types', '--no-experimental-strip-types']);
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') return { entry: args[i + 1] === '-' ? null : args[i + 1], imports, ambiguous, leaf: args[i + 1] === '-' };
    if (arg === '-' || ['-e', '--eval', '-p', '--print'].includes(arg)
      || /^(?:--eval|--print)=/u.test(arg) || /^-[ep].+/u.test(arg)) {
      return { entry: null, imports, ambiguous: false, leaf: true };
    }
    if (values.has(arg)) {
      leaseAssert(i + 1 < args.length);
      if (arg === '--import') imports.push(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--import=')) imports.push(arg.slice(9));
    else if (!arg.startsWith('-')) return { entry: arg, imports, ambiguous, leaf: false };
    else if (!arg.includes('=') && !unary.has(arg)) ambiguous = true;
  }
  return { entry: null, imports, ambiguous, leaf: false };
}
function leaseRoleForEntry(entry, manifest) {
  if (typeof entry !== 'string') return null;
  return Object.keys(manifest.roles).find(role => leaseSamePath(entry, manifest.roles[role].lexical)
    || leaseSamePath(entry, manifest.roles[role].physical)) ?? null;
}
function leaseClassify(options, manifest) {
  const parsed = leaseParseNodeArgs(options?.args);
  if (parsed.leaf) return null;
  // A later canonical occurrence can only REFUSE an ambiguous prefix. It never
  // positively selects a role or treats eval/stdin/script arguments as entries.
  if (parsed.ambiguous && options.args.slice(1).some(value => leaseRoleForEntry(value, manifest) !== null)) {
    throw leaseError('e2e-handle-family-ambiguous-canonical-target');
  }
  const role = leaseRoleForEntry(parsed.entry, manifest);
  if (role) {
    leaseAssert(leaseSamePath(options.file, manifest.files.runtime.lexical)
      || leaseSamePath(options.file, manifest.files.runtime.physical), 'e2e-handle-family-runtime-mismatch');
    leaseAssert(JSON.stringify(parsed.imports) === JSON.stringify(leaseImports(manifest)), 'e2e-handle-family-preload-mismatch');
  }
  return role;
}
function leaseEnvironment(env, marker) {
  const result = Object.create(null);
  for (const [key, value] of Object.entries(env)) {
    leaseAssert(typeof value === 'string');
    if (key.toUpperCase() !== E2E_PROCESS_HANDLE_ACTOR_ENV) result[key] = value;
  }
  if (marker !== null) result[E2E_PROCESS_HANDLE_ACTOR_ENV] = marker;
  return Object.freeze(result);
}
function leaseForwardArgs(args, marker) {
  leaseAssert(Array.isArray(args) && args.length > 0 && args[0] && Array.isArray(args[0].envPairs));
  const envPairs = args[0].envPairs.filter(pair => {
    leaseAssert(typeof pair === 'string');
    return pair.slice(0, pair.indexOf('=')).toUpperCase() !== E2E_PROCESS_HANDLE_ACTOR_ENV;
  });
  if (marker !== null) envPairs.push(`${E2E_PROCESS_HANDLE_ACTOR_ENV}=${marker}`);
  return [{ ...args[0], envPairs }, ...args.slice(1)];
}
function leaseStore({ env, root, rootIdentity, stateDir, runId, io, readRunState }) {
  const known = new Map();
  function check() {
    const state = readRunState(env);
    leaseAssert(state.runId === runId && leaseSamePath(state.stateDir, stateDir));
    const stat = io.lstatSync(root, { bigint: true });
    leaseAssert(stat.isDirectory() && !stat.isSymbolicLink() && leaseSameIdentity(stat, rootIdentity)
      && leaseSamePath(io.realpathSync.native(root), root), 'e2e-handle-family-root-changed');
  }
  function nameFor(actorId, type) {
    leaseAssert((actorId === 'cli' || /^child-\d{4}$/u.test(actorId)) && ['intent', 'binding', 'phase'].includes(type));
    return `${actorId}.${type}.json`;
  }
  function fileStat(file) {
    const stat = io.lstatSync(file, { bigint: true });
    leaseAssert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n
      && stat.size > 0n && stat.size <= BigInt(LEASE_RECORD_LIMIT), 'e2e-handle-family-record-kind');
    return stat;
  }
  function read(name) {
    check();
    leaseAssert(name === 'family.json' || /^(?:cli|child-\d{4})\.(?:intent|binding|phase)\.json$/u.test(name));
    const file = leasePath.join(root, name);
    const before = fileStat(file);
    const fd = io.openSync(file, 'r');
    let text;
    try {
      leaseAssert(leaseSameIdentity(io.fstatSync(fd, { bigint: true }), leaseIdentity(before)));
      const buffer = Buffer.alloc(Number(before.size));
      leaseAssert(io.readSync(fd, buffer, 0, buffer.length, 0) === buffer.length);
      text = buffer.toString('utf8');
      const after = io.fstatSync(fd, { bigint: true });
      leaseAssert(after.size === before.size && after.mtimeNs === before.mtimeNs && leaseSameIdentity(after, leaseIdentity(before)));
    } finally { io.closeSync(fd); }
    leaseAssert(leaseSameIdentity(fileStat(file), leaseIdentity(before)));
    check();
    return { value: JSON.parse(text), hash: leaseHash(text) };
  }
  function write(name, value, mutable = false) {
    check();
    const text = `${JSON.stringify(value)}\n`;
    leaseAssert(Buffer.byteLength(text) <= LEASE_RECORD_LIMIT, 'e2e-handle-family-record-limit');
    const target = leasePath.join(root, name);
    if (io.existsSync(target)) {
      leaseAssert(mutable && known.has(name) && leaseSameIdentity(fileStat(target), known.get(name)), 'e2e-handle-family-record-replaced');
    } else leaseAssert(!known.has(name), 'e2e-handle-family-record-missing');
    const temporary = leasePath.join(root, `${name}.tmp`);
    leaseAssert(io.readdirSync(root).length < LEASE_FILE_LIMIT, 'e2e-handle-family-file-limit');
    const fd = io.openSync(temporary, 'wx', 0o600);
    try {
      leaseAssert(io.writeSync(fd, text, null, 'utf8') === Buffer.byteLength(text));
      io.fsyncSync(fd);
    } finally { io.closeSync(fd); }
    const publishedIdentity = leaseIdentity(fileStat(temporary));
    const hash = leaseHash(text);
    check();
    // The rename is the final fallible admission operation. Its immutable bytes
    // may be consumed by another process immediately after publication.
    known.set(name, publishedIdentity);
    io.renameSync(temporary, target);
    return hash;
  }
  function inventory() {
    check();
    const names = io.readdirSync(root);
    leaseAssert(names.length <= LEASE_FILE_LIMIT, 'e2e-handle-family-file-limit');
    let bytes = 0;
    for (const name of names) { leaseAssert(name === 'family.json' || /^(?:cli|child-\d{4})\.(?:intent|binding|phase)\.json$/u.test(name)); bytes += Number(fileStat(leasePath.join(root, name)).size); }
    return { names, recordFiles: names.length, recordBytes: bytes };
  }
  return { check, read, write, inventory, nameFor };
}
function leaseValidIdentity(value) {
  return leaseKeys(value, ['pid', 'creationToken']) && Number.isSafeInteger(value.pid) && value.pid > 0
    && typeof value.creationToken === 'string' && /^[a-f0-9]{16}$/u.test(value.creationToken);
}
function leaseValidateManifest(manifest) {
  leaseAssert(leaseKeys(manifest, ['schemaVersion', 'familyId', 'runId', 'stateDir', 'root', 'rootIdentity', 'cwd', 'creator', 'roles', 'files', 'extraPreloads', 'testProfile'])
    && manifest.schemaVersion === 'forge.e2e-handle-family.v1' && leaseValidIdentity(manifest.creator)
    && typeof manifest.familyId === 'string' && /^[a-f0-9-]{36}$/u.test(manifest.familyId)
    && leaseKeys(manifest.roles, ['cli', 'loader', 'worker'])
    && leaseKeys(manifest.files, ['preload', 'runtime', 'lifecycle', 'koffi', 'koffiLoader', 'koffiPackage', 'koffiNativeEntry', 'koffiNative', 'runner', 'core'])
    && Array.isArray(manifest.extraPreloads) && manifest.extraPreloads.length <= 1);
  leaseAssert(manifest.testProfile === null || (manifest.extraPreloads.length === 1
    && leaseSamePath(manifest.extraPreloads[0].lexical, leasePath.join(manifest.cwd, 'scripts', 'e2e-runner-integration.selftest.mjs'))
    && leaseKeys(manifest.testProfile, ['handleLimit']) && Number.isSafeInteger(manifest.testProfile.handleLimit)
    && manifest.testProfile.handleLimit >= 1 && manifest.testProfile.handleLimit <= 4096), 'e2e-handle-family-test-profile');
}
function leaseReadActor(store, manifest, actorId) {
  const intentRecord = store.read(store.nameFor(actorId, 'intent'));
  const intent = intentRecord.value;
  leaseAssert(leaseKeys(intent, ['schemaVersion', 'familyId', 'runId', 'actorId', 'parentId', 'parentIdentity', 'role', 'nonce'])
    && intent.schemaVersion === 'forge.e2e-handle-intent.v1' && intent.familyId === manifest.familyId && intent.runId === manifest.runId
    && intent.actorId === actorId && leaseValidIdentity(intent.parentIdentity)
    && typeof intent.nonce === 'string' && /^[a-f0-9]{64}$/u.test(intent.nonce));
  leaseAssert(actorId === 'cli' ? intent.role === 'cli' && intent.parentId === 'main'
    : ['loader', 'worker'].includes(intent.role) && intent.parentId === 'cli' && Number(actorId.slice(6)) >= 1 && Number(actorId.slice(6)) <= LEASE_ACTOR_LIMIT);
  const bindingRecord = store.read(store.nameFor(actorId, 'binding'));
  const binding = bindingRecord.value;
  leaseAssert(leaseKeys(binding, ['schemaVersion', 'familyId', 'actorId', 'intentHash', 'disposition', 'identity'])
    && binding.schemaVersion === 'forge.e2e-handle-binding.v1' && binding.familyId === manifest.familyId && binding.actorId === actorId
    && binding.intentHash === intentRecord.hash && ['created', 'not-created'].includes(binding.disposition)
    && (binding.disposition === 'created' ? leaseValidIdentity(binding.identity) : binding.identity === null));
  return { intent, binding, intentHash: intentRecord.hash, bindingHash: bindingRecord.hash };
}
function leaseHealthySnapshot(value) {
  const counters = ['limit', 'retained', 'inFlight', 'spawnCalls', 'spawnThrows', 'acquisitionAttempts',
    'noPidCalls', 'idempotentReuses', 'retirementAttempts', 'refusedCalls'];
  return leaseKeys(value, [...counters, 'failed', 'failureCode', 'retirementFailed', 'reportingFailed'])
    && counters.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    && value.limit >= 1 && value.limit <= 4096 && value.retained <= value.limit && value.inFlight === 0
    && value.failed === false && value.failureCode === null && value.retirementFailed === false && value.reportingFailed === false;
}
function leaseReadSealed(store, manifest, actorId, expectedIdentity) {
  const actor = leaseReadActor(store, manifest, actorId);
  leaseAssert(actor.binding.disposition === 'created' && JSON.stringify(actor.binding.identity) === JSON.stringify(expectedIdentity));
  const phase = store.read(store.nameFor(actorId, 'phase')).value;
  leaseAssert(leaseKeys(phase, ['schemaVersion', 'familyId', 'actorId', 'role', 'identity', 'intentHash', 'bindingHash', 'generation', 'phase', 'failed', 'failureCode', 'owner', 'children'])
    && phase.schemaVersion === 'forge.e2e-handle-phase.v1' && phase.familyId === manifest.familyId && phase.actorId === actorId
    && phase.role === actor.intent.role && JSON.stringify(phase.identity) === JSON.stringify(expectedIdentity)
    && phase.intentHash === actor.intentHash && phase.bindingHash === actor.bindingHash
    && Number.isSafeInteger(phase.generation) && phase.generation >= 1 && LEASE_PHASES.has(phase.phase)
    && phase.phase === 'sealed' && phase.failed === false && phase.failureCode === null
    && leaseHealthySnapshot(phase.owner) && phase.owner.limit === (manifest.testProfile?.handleLimit ?? 4096) && Array.isArray(phase.children)
    && phase.children.length <= LEASE_ACTOR_LIMIT && new Set(phase.children).size === phase.children.length);
  return { ...actor, phase };
}

function leaseMakeContext({ manifest, store, env, native, processObject, childProcessModule, actorId, role, identity, actorRecord = null }) {
  const originalKill = childProcessModule.ChildProcess.prototype.kill;
  const originalEmit = processObject.emit;
  const originalReallyExit = processObject.reallyExit;
  const originalPrototypeSpawn = childProcessModule.ChildProcess.prototype.spawn;
  const children = new Map();
  const nativeHandles = [];
  const pending = [];
  let failed = false, failureCode = null, preparedActors = 0, boundActors = 0;
  let generation = 0, exitDepth = 0, fenced = false, installedSpawn, installedEmit, phaseReady = false;
  let nextFault = null;
  let faultObserver = null;
  function faultConsumed(kind, stage, recordName) {
    const observer = faultObserver;
    faultObserver = null; // Sticky persistence refusal still reports only once.
    if (observer !== null) {
      try { observer(Object.freeze({ kind, stage, recordName })); }
      catch { /* A test observer cannot replace the controlled owner failure. */ }
    }
  }
  function publish(name, value, mutable = false) {
    if (nextFault === 'persist') {
      faultConsumed('persist', 'publish', name);
      throw leaseError('e2e-handle-family-test-persist');
    }
    return store.write(name, value, mutable);
  }
  let owner;
  function hardExit() {
    leaseAssert(typeof originalReallyExit === 'function', 'e2e-handle-family-really-exit');
    Reflect.apply(originalReallyExit, processObject, [E2E_PROCESS_HANDLE_FAILURE_EXIT_CODE]);
    throw leaseError('e2e-handle-family-native-exit-returned');
  }
  function phase(phaseName) {
    leaseAssert(actorRecord !== null);
    return {
      schemaVersion: 'forge.e2e-handle-phase.v1', familyId: manifest.familyId, actorId, role, identity,
      intentHash: actorRecord.intentHash, bindingHash: actorRecord.bindingHash, generation,
      phase: phaseName, failed, failureCode, owner: owner.snapshot(), children: [...children.keys()],
    };
  }
  function writePhase(phaseName) {
    publish(store.nameFor(actorId, 'phase'), phase(phaseName), phaseReady);
    phaseReady = true;
  }
  function fail(code, fatal = role !== 'main') {
    if (!failed) { failed = true; failureCode = code; }
    if (actorRecord !== null) {
      try { writePhase('failed'); } catch { if (role !== 'main') hardExit(); }
    }
    if (fatal) hardExit();
  }
  function refuse(code) { fail(code); throw leaseError(failureCode); }
  owner = createE2eProcessHandleLeaseOwner({
    limit: manifest.testProfile?.handleLimit ?? 4096,
    openProcess(pid) {
      const launch = pending[pending.length - 1];
      leaseAssert(launch, 'e2e-handle-family-missing-launch');
      const handle = native.open(pid);
      const retained = { handle, identity: null, actorId: launch.ticket?.actorId ?? null };
      nativeHandles.push(retained); // Preserve partial acquisition even if querying/publication fails.
      if (nextFault === 'acquire') {
        faultConsumed('acquire', 'native-open', null);
        nextFault = null;
        throw leaseError('e2e-handle-family-test-acquire');
      }
      const actual = native.identity(handle);
      leaseAssert(leaseValidIdentity(actual) && actual.pid === pid, 'e2e-handle-family-native-identity');
      retained.identity = actual;
      if (launch.ticket) {
        launch.ticket.pendingIdentity = actual;
        // Fixed trusted Node fork/public-spawn inputs have no fallible work
        // after this chokepoint. MAIN's public wrapper instead calls admit().
        if (role !== 'main') publishBinding(launch.ticket, actual);
      }
      return handle;
    },
    retireChild(child) {
      const ticket = pending[pending.length - 1]?.ticket;
      if (ticket) ticket.retirementRequested = true;
      Reflect.apply(originalKill, child, ['SIGKILL']);
    },
    onFailure: code => fail(code),
  });
  function publishBinding(ticket, actual) {
    leaseAssert(ticket.binding === null);
    const binding = {
      schemaVersion: 'forge.e2e-handle-binding.v1', familyId: manifest.familyId,
      actorId: ticket.actorId, intentHash: ticket.intentHash,
      disposition: actual === null ? 'not-created' : 'created', identity: actual,
    };
    ticket.bindingHash = publish(store.nameFor(ticket.actorId, 'binding'), binding);
    ticket.binding = binding;
    boundActors += 1;
  }
  function prepareProtectedSpawn({ role: childRole, env: childEnv = env }) {
    if (failed || fenced) return refuse('e2e-handle-family-launch-fenced');
    if (!(role === 'main' ? childRole === 'cli' && preparedActors === 0
      : role === 'cli' && ['loader', 'worker'].includes(childRole) && preparedActors < LEASE_ACTOR_LIMIT)) {
      return refuse('e2e-handle-family-role-graph');
    }
    const childId = role === 'main' ? 'cli' : `child-${String(preparedActors + 1).padStart(4, '0')}`;
    const intent = {
      schemaVersion: 'forge.e2e-handle-intent.v1', familyId: manifest.familyId, runId: manifest.runId,
      actorId: childId, parentId: actorId, parentIdentity: identity, role: childRole,
      nonce: leaseCrypto.randomBytes(32).toString('hex'),
    };
    const intentHash = publish(store.nameFor(childId, 'intent'), intent);
    const marker = JSON.stringify({ version: 1, root: manifest.root, manifestHash: manifest.hash, actorId: childId, intentHash });
    const ticket = { actorId: childId, role: childRole, intentHash, binding: null, bindingHash: null,
      used: false, marker, child: null, pendingIdentity: null, rawReturned: false, cancelled: false, retirementRequested: false };
    children.set(childId, ticket);
    preparedActors += 1;
    return Object.freeze({
      environment: leaseEnvironment(childEnv, marker),
      execArgv: Object.freeze(leaseImports(manifest).flatMap(file => ['--import', file])),
      spawn(originalSpawn, child, args) {
        if (ticket.used || failed || fenced) return refuse('e2e-handle-family-launch-fenced');
        ticket.used = true;
        try { leaseAssert(leaseClassify(args[0], manifest) === childRole, 'e2e-handle-family-role-mismatch'); }
        catch (error) {
          fail(typeof error?.code === 'string' ? error.code : 'e2e-handle-family-launch-failed');
          throw error;
        }
        ticket.child = child; // Keep exact ownership even if a public wrapper throws later.
        return protect(originalSpawn, child, args, ticket);
      },
      admit() {
        if (role !== 'main' || failed || ticket.cancelled || !ticket.rawReturned || ticket.binding !== null) {
          return refuse('e2e-handle-family-admission-order');
        }
        try { publishBinding(ticket, ticket.pendingIdentity); }
        catch (error) { fail('e2e-handle-family-publication-failed'); throw error; }
      },
      cancel() {
        ticket.cancelled = true;
        fail('e2e-handle-family-launch-cancelled', false);
        if (ticket.child !== null && !ticket.retirementRequested) {
          ticket.retirementRequested = true;
          let hasPid = false;
          try { hasPid = ticket.child.pid !== undefined && ticket.child.pid !== null; } catch { hasPid = true; }
          if (hasPid) {
            try { Reflect.apply(originalKill, ticket.child, ['SIGKILL']); }
            catch { fail('e2e-handle-family-cancel-retirement-failed', false); }
          }
        }
      },
    });
  }
  function protect(originalSpawn, child, args, ticket) {
    const forwarded = leaseForwardArgs(args, ticket?.marker ?? null);
    const launch = { child, ticket };
    pending.push(launch);
    try {
      const result = owner.spawn(originalSpawn, child, forwarded);
      if (ticket) ticket.rawReturned = true;
      if (ticket && ticket.binding === null && role !== 'main') {
        try { publishBinding(ticket, null); }
        catch { fail('e2e-handle-family-publication-failed'); throw leaseError('e2e-handle-family-publication-failed'); }
      }
      return result;
    } catch (error) {
      if (ticket && ticket.binding === null && !failed) {
        let noPid = false;
        try { noPid = child.pid === undefined || child.pid === null; } catch { /* Unknown identity never becomes not-created. */ }
        if (noPid && role !== 'main') {
          try { publishBinding(ticket, null); }
          catch { fail('e2e-handle-family-publication-failed'); }
        }
      }
      throw error;
    } finally { pending.pop(); }
  }
  function inspectChildren() {
    for (const retained of nativeHandles) {
      leaseAssert(retained.identity !== null);
      const exitCode = native.exitCode(retained.handle);
      leaseAssert(Number.isInteger(exitCode) && exitCode >= 0 && exitCode !== 259
        && (retained.actorId === null || exitCode !== E2E_PROCESS_HANDLE_FAILURE_EXIT_CODE), 'e2e-handle-family-child-not-terminal');
      if (retained.actorId !== null) {
        const child = leaseReadSealed(store, manifest, retained.actorId, retained.identity);
        leaseAssert(JSON.stringify(child.intent.parentIdentity) === JSON.stringify(identity));
      }
    }
    for (const ticket of children.values()) {
      leaseAssert(ticket.binding !== null, 'e2e-handle-family-child-unbound');
      if (ticket.binding.disposition === 'created') leaseAssert(nativeHandles.some(value => value.actorId === ticket.actorId));
    }
  }
  function hooksCurrent() {
    return childProcessModule.ChildProcess.prototype.spawn === installedSpawn && processObject.emit === installedEmit;
  }
  function install() {
    leaseAssert(role !== 'main' && typeof originalEmit === 'function' && typeof originalReallyExit === 'function');
    installedSpawn = function (...args) {
      if (failed || fenced || !hooksCurrent()) return refuse('e2e-handle-family-launch-fenced');
      let childRole, ticket;
      try {
        childRole = leaseClassify(args[0], manifest);
        if (childRole !== null) ticket = prepareProtectedSpawn({ role: childRole });
      } catch (error) {
        fail(typeof error?.code === 'string' ? error.code : 'e2e-handle-family-spawn-failed');
        throw error;
      }
      if (ticket) return ticket.spawn(originalPrototypeSpawn, this, args);
      return protect(originalPrototypeSpawn, this, args, null);
    };
    installedEmit = function (...args) {
      if (this !== processObject || args[0] !== 'exit' || processObject._exiting !== true) {
        return Reflect.apply(originalEmit, this, args);
      }
      try {
        if (failed || !hooksCurrent()) return refuse('e2e-handle-family-exit-guard');
        generation += 1;
        leaseAssert(Number.isSafeInteger(generation), 'e2e-handle-family-generation-limit');
        writePhase('exiting'); // Invalidate any previous success before user exit listeners.
      } catch { fail('e2e-handle-family-exit-publication'); return hardExit(); }
      exitDepth += 1;
      let result;
      try { result = Reflect.apply(originalEmit, this, args); }
      catch (error) { fail('e2e-handle-family-exit-listener-threw', false); throw error; }
      finally { exitDepth -= 1; }
      if (exitDepth === 0) {
        try {
          leaseAssert(!failed && hooksCurrent() && !owner.snapshot().failed && owner.snapshot().inFlight === 0);
          inspectChildren();
          fenced = true;
          writePhase('sealed');
        } catch { fail('e2e-handle-family-exit-incomplete'); return hardExit(); }
      }
      return result;
    };
    childProcessModule.ChildProcess.prototype.spawn = installedSpawn;
    processObject.emit = installedEmit;
    writePhase('active');
  }
  function snapshot() {
    return Object.freeze({ failed, failureCode, owner: owner.snapshot(), preparedActors, boundActors });
  }
  function testFault(kind, onConsumed) {
    leaseAssert(manifest.testProfile !== null && ['acquire', 'persist'].includes(kind) && nextFault === null
      && (onConsumed === undefined || typeof onConsumed === 'function'), 'e2e-handle-family-test-profile');
    faultObserver = onConsumed ?? null;
    nextFault = kind;
  }
  return { prepareProtectedSpawn, snapshot, install, inspectChildren, nativeHandles, children, hardExit, fail, testFault };
}

/** Explicit creator only; ordinary imports never load Koffi or install hooks. */
export function createE2eProcessHandleLeaseFamily({
  env = process.env, cwd = process.cwd(), preloadPath, runtimePath = process.execPath, extraPreloads = [], testProfile = null,
  io = leaseFs, readRunState = leaseReadRunState, nativeFactory = leaseNative, catalogFactory = leaseCatalog,
  processObject = process, childProcessModule = leaseChildProcess,
} = {}) {
  leaseAssert(process.platform === 'win32' || nativeFactory !== leaseNative, 'e2e-handle-family-platform');
  leaseAssert(leaseSafeRuntime(process.versions.node, process.versions.uv) || nativeFactory !== leaseNative, 'e2e-handle-family-runtime');
  const state = readRunState(env);
  cwd = leasePath.resolve(cwd);
  leaseAssert(testProfile === null || (extraPreloads.length === 1
    && leaseSamePath(extraPreloads[0], leasePath.join(cwd, 'scripts', 'e2e-runner-integration.selftest.mjs'))
    && leaseKeys(testProfile, ['handleLimit']) && Number.isSafeInteger(testProfile.handleLimit)
    && testProfile.handleLimit >= 1 && testProfile.handleLimit <= 4096), 'e2e-handle-family-test-profile');
  const catalog = catalogFactory({ cwd, preloadPath, runtimePath, extraPreloads, io });
  const native = nativeFactory({ files: catalog.files });
  const creator = native.self();
  leaseAssert(leaseValidIdentity(creator) && creator.pid === processObject.pid);
  const root = io.mkdtempSync(leasePath.join(state.stateDir, 'process-handle-family-'));
  const rootIdentity = leaseIdentity(io.lstatSync(root, { bigint: true }));
  const manifest = {
    schemaVersion: 'forge.e2e-handle-family.v1', familyId: leaseCrypto.randomUUID(), runId: state.runId,
    stateDir: state.stateDir, root, rootIdentity, cwd, creator, ...catalog,
    testProfile: testProfile === null ? null : { handleLimit: testProfile.handleLimit },
  };
  const store = leaseStore({ env, root, rootIdentity, ...state, io, readRunState });
  manifest.hash = store.write('family.json', manifest);
  const context = leaseMakeContext({ manifest, store, env, native, processObject, childProcessModule,
    actorId: 'main', role: 'main', identity: creator });
  function inspect() {
    const errors = [];
    let actorCount = 0, recordFiles = 0, recordBytes = 0, cliExitCode = null;
    try {
      const inventory = store.inventory();
      ({ recordFiles, recordBytes } = inventory);
      leaseAssert(!context.snapshot().failed && !context.snapshot().owner.failed);
      leaseAssert(context.children.size === 1 && context.children.has('cli'), 'e2e-handle-family-cli-missing');
      const cliHandle = context.nativeHandles.find(value => value.actorId === 'cli');
      leaseAssert(cliHandle, 'e2e-handle-family-cli-missing');
      cliExitCode = native.exitCode(cliHandle.handle);
      context.inspectChildren();
      const cli = leaseReadSealed(store, manifest, 'cli', cliHandle.identity);
      const listed = new Set(['cli', ...cli.phase.children]);
      leaseAssert(cli.phase.children.every(id => /^child-\d{4}$/u.test(id)));
      for (const id of cli.phase.children) {
        const actor = leaseReadActor(store, manifest, id);
        leaseAssert(JSON.stringify(actor.intent.parentIdentity) === JSON.stringify(cliHandle.identity));
        if (actor.binding.disposition === 'created') {
          const child = leaseReadSealed(store, manifest, id, actor.binding.identity);
          leaseAssert(child.phase.children.length === 0);
        }
      }
      leaseAssert(inventory.names.every(name => name === 'family.json' || listed.has(name.split('.')[0])), 'e2e-handle-family-roster-mismatch');
      const intents = inventory.names.filter(name => name.endsWith('.intent.json')).map(name => name.slice(0, -12));
      leaseAssert(intents.length === listed.size && intents.every(id => listed.has(id)), 'e2e-handle-family-roster-mismatch');
      actorCount = intents.length;
    } catch (error) { errors.push(typeof error?.code === 'string' && /^e2e-handle-[a-z0-9-]{1,100}$/u.test(error.code) ? error.code : 'e2e-handle-family-inspection-failed'); }
    return Object.freeze({ complete: errors.length === 0, errors: Object.freeze(errors), actorCount, recordFiles, recordBytes, cliExitCode, owner: context.snapshot().owner });
  }
  return Object.freeze({ prepareProtectedSpawn: context.prepareProtectedSpawn, inspect, snapshot: context.snapshot });
}

/** Called only by the explicitly requested existing-file preload. */
export async function activateE2eProcessHandleLeaseRole({
  env = process.env, argv = process.argv, execArgv = process.execArgv, processObject = process,
  io = leaseFs, readRunState = leaseReadRunState, nativeFactory = leaseNative,
  childProcessModule = leaseChildProcess, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  verifyFingerprint = leaseVerifyFingerprint,
} = {}) {
  const markerText = env[E2E_PROCESS_HANDLE_ACTOR_ENV];
  const cwd = leasePath.resolve(processObject.cwd());
  const ownedPreloadPath = leasePath.join(cwd, 'scripts', 'run-e2e.mjs');
  let ownedPreload = false;
  try {
    leaseAssert(Array.isArray(execArgv) && execArgv.length <= 10000 && execArgv.every(value => typeof value === 'string'));
    // execArgv contains only Node's already-separated options, not script data.
    // Detect this exact owned import even behind an unreviewed option prefix;
    // missing authority must not turn that canonical role into an inert import.
    const imports = execArgv.flatMap((value, index) => value === '--import' && index + 1 < execArgv.length
      ? [execArgv[index + 1]] : value.startsWith('--import=') ? [value.slice(9)] : []);
    ownedPreload = imports.some(value => value === leasePathToFileURL(ownedPreloadPath).href || leaseSamePath(value, ownedPreloadPath));
  } catch { /* Unknown ordinary imports remain inert without actor authority. */ }
  if (markerText === undefined && !ownedPreload) return Object.freeze({ active: false });
  const paths = leaseRolePaths(cwd);
  const candidate = Object.keys(paths).find(role => leaseSamePath(argv[1], paths[role])
    || (() => { try { return leaseSamePath(argv[1], io.realpathSync.native(paths[role])); } catch { return false; } })());
  if (!candidate) return Object.freeze({ active: false });
  const reallyExit = processObject.reallyExit;
  const fatal = () => {
    Reflect.apply(reallyExit, processObject, [E2E_PROCESS_HANDLE_FAILURE_EXIT_CODE]);
    throw leaseError('e2e-handle-family-native-exit-returned');
  };
  try {
    leaseAssert(typeof markerText === 'string' && Buffer.byteLength(markerText) <= 8192);
    const marker = JSON.parse(markerText);
    leaseAssert(leaseKeys(marker, ['version', 'root', 'manifestHash', 'actorId', 'intentHash']) && marker.version === 1);
    const cached = LEASE_ACTORS.get(processObject);
    if (cached) {
      leaseAssert(cached.actorId === marker.actorId && cached.manifestHash === marker.manifestHash
        && cached.markerText === markerText && cached.entry === argv[1] && cached.execArgv === JSON.stringify(execArgv)
        && cached.pid === processObject.pid && leaseSamePath(cached.cwd, cwd) && leaseSamePath(cached.execPath, processObject.execPath));
      return cached.witness;
    }
    leaseAssert(leaseSafeRuntime(processObject.versions?.node ?? process.versions.node, processObject.versions?.uv ?? process.versions.uv)
      || nativeFactory !== leaseNative, 'e2e-handle-family-runtime');
    const state = readRunState(env);
    leaseAssert(leaseSamePath(leasePath.dirname(marker.root), state.stateDir)
      && /^process-handle-family-[A-Za-z0-9_-]+$/u.test(leasePath.basename(marker.root)));
    const rootIdentity = leaseIdentity(io.lstatSync(marker.root, { bigint: true }));
    const store = leaseStore({ env, root: marker.root, rootIdentity, ...state, io, readRunState });
    const record = store.read('family.json');
    const manifest = record.value;
    leaseValidateManifest(manifest);
    leaseAssert(record.hash === marker.manifestHash && manifest.runId === state.runId
      && leaseSamePath(manifest.root, marker.root) && leaseSamePath(manifest.cwd, cwd)
      && JSON.stringify(manifest.rootIdentity) === JSON.stringify(rootIdentity));
    manifest.hash = record.hash;
    for (const file of [...Object.values(manifest.files), ...Object.values(manifest.roles), ...manifest.extraPreloads]) verifyFingerprint(file, io);
    leaseAssert(leaseSamePath(processObject.execPath, manifest.files.runtime.lexical)
      || leaseSamePath(processObject.execPath, manifest.files.runtime.physical));
    const imports = leaseParseNodeArgs([processObject.execPath, ...execArgv, argv[1]]).imports;
    leaseAssert(JSON.stringify(imports) === JSON.stringify(leaseImports(manifest)), 'e2e-handle-family-preload-mismatch');
    const intentRecord = store.read(store.nameFor(marker.actorId, 'intent'));
    leaseAssert(intentRecord.hash === marker.intentHash && intentRecord.value.role === candidate);
    const started = now();
    while (!io.existsSync(leasePath.join(marker.root, store.nameFor(marker.actorId, 'binding')))) {
      leaseAssert(now() - started < 5000, 'e2e-handle-family-admission-timeout');
      store.check();
      await sleep(5);
    }
    const actorRecord = leaseReadActor(store, manifest, marker.actorId);
    const parent = candidate === 'cli' ? manifest.creator : leaseReadActor(store, manifest, 'cli').binding.identity;
    leaseAssert(leaseValidIdentity(parent) && parent.pid === processObject.ppid
      && JSON.stringify(parent) === JSON.stringify(actorRecord.intent.parentIdentity), 'e2e-handle-family-parent-identity');
    const native = nativeFactory(manifest);
    const identity = native.self();
    leaseAssert(leaseValidIdentity(identity) && identity.pid === processObject.pid
      && actorRecord.binding.disposition === 'created'
      && JSON.stringify(identity) === JSON.stringify(actorRecord.binding.identity), 'e2e-handle-family-admission-identity');
    const context = leaseMakeContext({ manifest, store, env, native, processObject, childProcessModule,
      actorId: marker.actorId, role: candidate, identity, actorRecord });
    context.install();
    const witness = Object.freeze({ active: true, role: candidate, actorId: marker.actorId, snapshot: context.snapshot,
      ...(manifest.testProfile === null ? {} : { testFault: context.testFault }) });
    LEASE_ACTORS.set(processObject, { actorId: marker.actorId, manifestHash: marker.manifestHash, markerText,
      entry: argv[1], execArgv: JSON.stringify(execArgv), pid: processObject.pid, cwd, execPath: processObject.execPath, witness });
    return witness;
  } catch { return fatal(); }
}

// Allow the 120-test serial suite one hour overall; per-test and cleanup limits stay unchanged.
const DEFAULT_OVERALL_DEADLINE_MS = 3_600_000;
const TERMINAL_GRACE_MS = 5_000;
const OWNERSHIP_SAMPLE_INTERVAL_MS = 1_000;
const TERMINATION_MAX_PASSES = 20;
const TERMINATION_POLL_INTERVAL_MS = 25;
const MAX_FACTS = 100000;
const MAX_LIFECYCLE_PROTOTYPE_DEPTH = 1024;

const E2E_LIFECYCLE_INVALID_INPUT = 'e2e-lifecycle-invalid-input';
const E2E_LIFECYCLE_TIMER_FAILED = 'e2e-lifecycle-timer-failed';
const E2E_LIFECYCLE_OWNERSHIP_INCOMPLETE = 'e2e-lifecycle-ownership-incomplete';
const E2E_LIFECYCLE_CHILD_ERROR = 'e2e-lifecycle-child-error';
const E2E_LIFECYCLE_TERMINATION_FAILED = 'e2e-lifecycle-termination-failed';
const OWNERSHIP_FAILURE_CODES = new Set([
  'spawned-ownership-invalid-input',
  'spawned-ownership-snapshot-failed',
  'spawned-ownership-root-unavailable',
  'spawned-ownership-plan-failed',
]);

function createOwnershipDiagnostics() {
  let initializationAttempts = 0;
  let sampleAttempts = 0;
  let failures = 0;
  let firstPhase = 'none';
  let firstCode = 'none';
  const increment = (value) => Math.min(value + 1, Number.MAX_SAFE_INTEGER);
  const write = (message) => {
    try {
      console.error(`[e2e-runner-lifecycle] ${message}`);
    } catch {
      // Diagnostics must not change the existing lifecycle verdict or cleanup path.
    }
  };

  return {
    attempt(initializing) {
      if (initializing) initializationAttempts = increment(initializationAttempts);
      else sampleAttempts = increment(sampleAttempts);
    },
    fail(phase, code) {
      failures = increment(failures);
      if (failures !== 1) return;
      firstPhase = phase;
      firstCode = code;
      write(`ownership-first-failure phase=${firstPhase} code=${firstCode}`);
    },
    summary(ownershipComplete) {
      write(`ownership-summary initializationAttempts=${initializationAttempts} sampleAttempts=${sampleAttempts} failures=${failures} firstPhase=${firstPhase} firstCode=${firstCode} ownershipComplete=${ownershipComplete}`);
    },
  };
}

function readOwnershipFailureCode(raw) {
  const snapshotCode = readSpawnedProcessOwnershipFailureCode(raw);
  if (snapshotCode !== null) return snapshotCode;
  const envelope = readOwnershipEnvelopeBase(raw);
  const code = envelope?.complete === false ? envelope.errors[0] : null;
  return OWNERSHIP_FAILURE_CODES.has(code) ? code : 'ownership-envelope-invalid';
}

function isProxyObject(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }

  try {
    return nodeUtilTypes.isProxy(value);
  } catch {
    return true;
  }
}

function isPlainRecord(value) {
  try {
    if (value === null || typeof value !== 'object' || isProxyObject(value) || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isEnumerableDataDescriptor(descriptor) {
  try {
    return descriptor !== undefined
      && descriptor !== null
      && descriptor.enumerable === true
      && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      && Object.prototype.hasOwnProperty.call(descriptor, 'writable')
      && !Object.prototype.hasOwnProperty.call(descriptor, 'get')
      && !Object.prototype.hasOwnProperty.call(descriptor, 'set');
  } catch {
    return false;
  }
}

function hasExactOrderedDataKeys(value, expectedKeys) {
  try {
    if (!Array.isArray(expectedKeys)) {
      return false;
    }

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== expectedKeys.length) {
      return false;
    }

    for (let index = 0; index < expectedKeys.length; index += 1) {
      const expectedKey = expectedKeys[index];
      if (typeof expectedKey !== 'string' || ownKeys[index] !== expectedKey) {
        return false;
      }

      if (!isEnumerableDataDescriptor(Object.getOwnPropertyDescriptor(value, expectedKey))) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function readDenseArrayValues(value) {
  try {
    if (isProxyObject(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return null;
    }

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (lengthDescriptor === undefined
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'writable')
      || Object.prototype.hasOwnProperty.call(lengthDescriptor, 'get')
      || Object.prototype.hasOwnProperty.call(lengthDescriptor, 'set')
      || lengthDescriptor.value < 0
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value > MAX_FACTS
      || lengthDescriptor.writable !== true
      || lengthDescriptor.enumerable !== false
      || lengthDescriptor.configurable !== false) {
      return null;
    }

    const length = lengthDescriptor.value;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1 || ownKeys[length] !== 'length') {
      return null;
    }

    const values = new Array(length);
    for (let index = 0; index < length; index += 1) {
      if (ownKeys[index] !== String(index)) {
        return null;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, ownKeys[index]);
      if (!isEnumerableDataDescriptor(descriptor)) {
        return null;
      }

      values[index] = descriptor.value;
    }

    return values;
  } catch {
    return null;
  }
}

function readExactIdentity(value) {
  try {
    if (!isPlainRecord(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || !hasExactOrderedDataKeys(value, ['pid', 'creationToken'])) {
      return null;
    }

    const pidDescriptor = Object.getOwnPropertyDescriptor(value, 'pid');
    const creationTokenDescriptor = Object.getOwnPropertyDescriptor(value, 'creationToken');
    if (!isEnumerableDataDescriptor(pidDescriptor) || !isEnumerableDataDescriptor(creationTokenDescriptor)) {
      return null;
    }

    const pid = pidDescriptor.value;
    const rawCreationToken = creationTokenDescriptor.value;
    if (!Number.isSafeInteger(pid) || pid <= 0 || typeof rawCreationToken !== 'string') {
      return null;
    }

    if (/[\u0000-\u001F\u007F-\u009F]/u.test(rawCreationToken)) {
      return null;
    }

    if (rawCreationToken.length === 0
      || rawCreationToken.length > 128
      || rawCreationToken.trim() !== rawCreationToken) {
      return null;
    }

    return { pid, creationToken: rawCreationToken };
  } catch {
    return null;
  }
}

function readDenseIdentityArray(value) {
  const values = readDenseArrayValues(value);
  if (values === null) {
    return null;
  }

  try {
    const result = new Array(values.length);
    const seenPids = new Set();
    for (let index = 0; index < values.length; index += 1) {
      const identity = readExactIdentity(values[index]);
      if (identity === null || seenPids.has(identity.pid)) {
        return null;
      }

      seenPids.add(identity.pid);
      result[index] = identity;
    }

    return result;
  } catch {
    return null;
  }
}

function readDensePidArray(value) {
  const values = readDenseArrayValues(value);
  if (values === null) {
    return null;
  }

  try {
    const result = new Array(values.length);
    const seenPids = new Set();
    for (let index = 0; index < values.length; index += 1) {
      const pid = values[index];
      if (!Number.isSafeInteger(pid) || pid <= 0 || seenPids.has(pid)) {
        return null;
      }

      seenPids.add(pid);
      result[index] = pid;
    }

    return result;
  } catch {
    return null;
  }
}

function readStableErrors(value) {
  const values = readDenseArrayValues(value);
  if (values === null || values.length > 1) {
    return null;
  }

  try {
    if (values.length === 0) {
      return [];
    }

    const error = values[0];
    if (typeof error !== 'string'
      || error.length === 0
      || error.length > 128
      || error.trim() !== error
      || /[\u0000-\u001F\u007F-\u009F]/u.test(error)) {
      return null;
    }

    return [error];
  } catch {
    return null;
  }
}

function isOrdinaryEmptyArray(value) {
  const values = readDenseArrayValues(value);
  return values !== null && values.length === 0;
}

function cloneIdentity(value) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  return {
    pid: value.pid,
    creationToken: value.creationToken,
  };
}

function cloneIdentityArray(array) {
  return array.map(cloneIdentity);
}

function clonePidArray(array) {
  return array.map((pid) => pid);
}

function cloneOwnershipEnvelope(value) {
  return {
    complete: value.complete,
    errors: value.errors.map((error) => error),
    rootIdentity: cloneIdentity(value.rootIdentity),
    rootPresent: value.rootPresent,
    captured: cloneIdentityArray(value.captured),
    newlyCaptured: cloneIdentityArray(value.newlyCaptured),
    reusedPids: clonePidArray(value.reusedPids),
  };
}

function readOwnershipEnvelopeBase(value) {
  try {
    if (!isPlainRecord(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || !hasExactOrderedDataKeys(value, [
        'complete',
        'errors',
        'rootIdentity',
        'rootPresent',
        'captured',
        'newlyCaptured',
        'reusedPids',
      ])) {
      return null;
    }

    const completeDescriptor = Object.getOwnPropertyDescriptor(value, 'complete');
    const errorsDescriptor = Object.getOwnPropertyDescriptor(value, 'errors');
    const rootIdentityDescriptor = Object.getOwnPropertyDescriptor(value, 'rootIdentity');
    const rootPresentDescriptor = Object.getOwnPropertyDescriptor(value, 'rootPresent');
    const capturedDescriptor = Object.getOwnPropertyDescriptor(value, 'captured');
    const newlyCapturedDescriptor = Object.getOwnPropertyDescriptor(value, 'newlyCaptured');
    const reusedPidsDescriptor = Object.getOwnPropertyDescriptor(value, 'reusedPids');
    if (!isEnumerableDataDescriptor(completeDescriptor)
      || !isEnumerableDataDescriptor(errorsDescriptor)
      || !isEnumerableDataDescriptor(rootIdentityDescriptor)
      || !isEnumerableDataDescriptor(rootPresentDescriptor)
      || !isEnumerableDataDescriptor(capturedDescriptor)
      || !isEnumerableDataDescriptor(newlyCapturedDescriptor)
      || !isEnumerableDataDescriptor(reusedPidsDescriptor)) {
      return null;
    }

    const complete = completeDescriptor.value;
    const errors = readStableErrors(errorsDescriptor.value);
    const rawRootIdentity = rootIdentityDescriptor.value;
    const rootIdentity = rawRootIdentity === null ? null : readExactIdentity(rawRootIdentity);
    const rootPresent = rootPresentDescriptor.value;
    const captured = readDenseIdentityArray(capturedDescriptor.value);
    const newlyCaptured = readDenseIdentityArray(newlyCapturedDescriptor.value);
    const reusedPids = readDensePidArray(reusedPidsDescriptor.value);
    if (typeof complete !== 'boolean'
      || errors === null
      || (rawRootIdentity !== null && rootIdentity === null)
      || typeof rootPresent !== 'boolean'
      || captured === null
      || newlyCaptured === null
      || reusedPids === null) {
      return null;
    }

    if (complete === false) {
      if (errors.length !== 1
        || rootIdentity !== null
        || rootPresent !== false
        || captured.length !== 0
        || newlyCaptured.length !== 0
        || reusedPids.length !== 0) {
        return null;
      }
    } else if (errors.length !== 0
      || rootIdentity === null
      || captured.length === 0) {
      return null;
    }

    if (complete === true) {
      const capturedByPid = new Map();
      for (const identity of captured) {
        capturedByPid.set(identity.pid, identity.creationToken);
      }

      if (capturedByPid.get(rootIdentity.pid) !== rootIdentity.creationToken) {
        return null;
      }

      for (const identity of newlyCaptured) {
        if (capturedByPid.get(identity.pid) !== identity.creationToken) {
          return null;
        }
      }

      for (const pid of reusedPids) {
        if (!capturedByPid.has(pid)) {
          return null;
        }
      }
    }

    return cloneOwnershipEnvelope({
      complete,
      errors,
      rootIdentity,
      rootPresent,
      captured,
      newlyCaptured,
      reusedPids,
    });
  } catch {
    return null;
  }
}

function readInitialOwnershipEnvelope(value, expectedRootPid) {
  try {
    const envelope = readOwnershipEnvelopeBase(value);
    if (envelope === null
      || envelope.complete !== true
      || !Number.isSafeInteger(expectedRootPid)
      || expectedRootPid <= 0
      || envelope.rootIdentity === null
      || envelope.rootIdentity.pid !== expectedRootPid
      || envelope.rootPresent !== true
      || envelope.newlyCaptured.length !== envelope.captured.length) {
      return null;
    }

    const newlyCapturedByPid = new Map();
    for (const identity of envelope.newlyCaptured) {
      newlyCapturedByPid.set(identity.pid, identity.creationToken);
    }
    for (const identity of envelope.captured) {
      if (newlyCapturedByPid.get(identity.pid) !== identity.creationToken) {
        return null;
      }
    }

    return cloneOwnershipEnvelope(envelope);
  } catch {
    return null;
  }
}

function readSampleOwnershipEnvelope(value, expectedRoot, previousCaptured) {
  try {
    const envelope = readOwnershipEnvelopeBase(value);
    const expected = readExactIdentity(expectedRoot);
    const previous = readDenseIdentityArray(previousCaptured);
    if (envelope === null
      || envelope.complete !== true
      || expected === null
      || previous === null
      || previous.length === 0
      || envelope.rootIdentity === null
      || envelope.rootIdentity.pid !== expected.pid
      || envelope.rootIdentity.creationToken !== expected.creationToken) {
      return null;
    }

    const capturedByPid = new Map();
    for (const identity of envelope.captured) {
      capturedByPid.set(identity.pid, identity.creationToken);
    }

    for (const identity of previous) {
      if (capturedByPid.get(identity.pid) !== identity.creationToken) {
        return null;
      }
    }

    const previousPids = new Set(previous.map((identity) => identity.pid));
    for (const identity of envelope.newlyCaptured) {
      if (previousPids.has(identity.pid)) {
        return null;
      }
    }

    return cloneOwnershipEnvelope(envelope);
  } catch {
    return null;
  }
}

function readTerminationEnvelope(value, expectedRoot, previousCaptured) {
  try {
    if (!isPlainRecord(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || !hasExactOrderedDataKeys(value, [
        'complete',
        'errors',
        'treeGone',
        'passes',
        'captured',
        'commanded',
        'reusedPids',
      ])) {
      return null;
    }

    const completeDescriptor = Object.getOwnPropertyDescriptor(value, 'complete');
    const errorsDescriptor = Object.getOwnPropertyDescriptor(value, 'errors');
    const treeGoneDescriptor = Object.getOwnPropertyDescriptor(value, 'treeGone');
    const passesDescriptor = Object.getOwnPropertyDescriptor(value, 'passes');
    const capturedDescriptor = Object.getOwnPropertyDescriptor(value, 'captured');
    const commandedDescriptor = Object.getOwnPropertyDescriptor(value, 'commanded');
    const reusedPidsDescriptor = Object.getOwnPropertyDescriptor(value, 'reusedPids');
    if (!isEnumerableDataDescriptor(completeDescriptor)
      || !isEnumerableDataDescriptor(errorsDescriptor)
      || !isEnumerableDataDescriptor(treeGoneDescriptor)
      || !isEnumerableDataDescriptor(passesDescriptor)
      || !isEnumerableDataDescriptor(capturedDescriptor)
      || !isEnumerableDataDescriptor(commandedDescriptor)
      || !isEnumerableDataDescriptor(reusedPidsDescriptor)) {
      return null;
    }

    const complete = completeDescriptor.value;
    const errors = readStableErrors(errorsDescriptor.value);
    const treeGone = treeGoneDescriptor.value;
    const passes = passesDescriptor.value;
    const expected = readExactIdentity(expectedRoot);
    const previous = readDenseIdentityArray(previousCaptured);
    const captured = readDenseIdentityArray(capturedDescriptor.value);
    const commanded = readDenseIdentityArray(commandedDescriptor.value);
    const reusedPids = readDensePidArray(reusedPidsDescriptor.value);
    if (typeof complete !== 'boolean'
      || errors === null
      || typeof treeGone !== 'boolean'
      || !Number.isSafeInteger(passes)
      || passes < 0
      || passes > 1000
      || expected === null
      || previous === null
      || previous.length === 0
      || captured === null
      || captured.length === 0
      || commanded === null
      || reusedPids === null) {
      return null;
    }

    const capturedByPid = new Map();
    for (const identity of captured) {
      capturedByPid.set(identity.pid, identity.creationToken);
    }

    if (capturedByPid.get(expected.pid) !== expected.creationToken) {
      return null;
    }

    for (const identity of previous) {
      if (capturedByPid.get(identity.pid) !== identity.creationToken) {
        return null;
      }
    }

    for (const identity of commanded) {
      if (capturedByPid.get(identity.pid) !== identity.creationToken) {
        return null;
      }
    }

    for (const pid of reusedPids) {
      if (!capturedByPid.has(pid)) {
        return null;
      }
    }

    if (complete === true && (errors.length !== 0 || treeGone !== true)) {
      return null;
    }
    if (complete === false && (errors.length !== 1 || treeGone !== false)) {
      return null;
    }

    return {
      complete,
      errors: [...errors],
      treeGone,
      passes,
      captured: cloneIdentityArray(captured),
      commanded: cloneIdentityArray(commanded),
      reusedPids: clonePidArray(reusedPids),
    };
  } catch {
    return null;
  }
}

function normalizeProcessOptions(value) {
  try {
    if (!isPlainRecord(value)) return null;

    const descriptors = [];
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !['platform', 'execFileImpl', 'timeoutMs'].includes(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!isEnumerableDataDescriptor(descriptor)) return null;
      descriptors.push([key, descriptor.value]);
    }

    for (const [key, optionValue] of descriptors) {
      if (key === 'platform' && optionValue !== undefined && typeof optionValue !== 'string') return null;
      if (key === 'execFileImpl' && optionValue !== undefined && typeof optionValue !== 'function') return null;
      if (key === 'timeoutMs'
        && optionValue !== undefined
        && (!Number.isSafeInteger(optionValue) || optionValue < 10 || optionValue > 15000)) return null;
    }

    const clone = {};
    for (const [key, optionValue] of descriptors) {
      clone[key] = optionValue;
    }
    return clone;
  } catch {
    return null;
  }
}

function boundedInteger(value, defaultValue, min, max) {
  if (value === undefined) return defaultValue;
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function normalizeLifecycleBounds(descriptors) {
  try {
    const readOptionalDescriptorValue = (key) => {
      const descriptor = descriptors.get(key);
      if (descriptor === undefined) return undefined;
      if (!isEnumerableDataDescriptor(descriptor)) return null;
      return descriptor.value;
    };

    const overallDeadlineMs = boundedInteger(
      readOptionalDescriptorValue('overallDeadlineMs'),
      DEFAULT_OVERALL_DEADLINE_MS,
      10,
      7200000,
    );
    const terminalGraceMs = boundedInteger(
      readOptionalDescriptorValue('terminalGraceMs'),
      TERMINAL_GRACE_MS,
      10,
      60000,
    );
    const sampleIntervalMs = boundedInteger(
      readOptionalDescriptorValue('sampleIntervalMs'),
      OWNERSHIP_SAMPLE_INTERVAL_MS,
      0,
      60000,
    );
    const maxTerminationPasses = boundedInteger(
      readOptionalDescriptorValue('maxTerminationPasses'),
      TERMINATION_MAX_PASSES,
      1,
      1000,
    );
    const terminationPollIntervalMs = boundedInteger(
      readOptionalDescriptorValue('terminationPollIntervalMs'),
      TERMINATION_POLL_INTERVAL_MS,
      0,
      1000,
    );

    if (overallDeadlineMs === null
      || terminalGraceMs === null
      || sampleIntervalMs === null
      || maxTerminationPasses === null
      || terminationPollIntervalMs === null) {
      return null;
    }

    return {
      overallDeadlineMs,
      terminalGraceMs,
      sampleIntervalMs,
      maxTerminationPasses,
      terminationPollIntervalMs,
    };
  } catch {
    return null;
  }
}

function captureChildEventMethods(child) {
  try {
    const seen = new Set();
    let current = child;
    let on = null;
    let removeListener = null;

    for (let depth = 0; current !== null; depth += 1) {
      if (depth >= MAX_LIFECYCLE_PROTOTYPE_DEPTH
        || (typeof current !== 'object' && typeof current !== 'function')
        || isProxyObject(current)
        || seen.has(current)) {
        return null;
      }

      seen.add(current);

      if (on === null) {
        const descriptor = Object.getOwnPropertyDescriptor(current, 'on');
        if (descriptor !== undefined) {
          if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')
            || !Object.prototype.hasOwnProperty.call(descriptor, 'writable')
            || Object.prototype.hasOwnProperty.call(descriptor, 'get')
            || Object.prototype.hasOwnProperty.call(descriptor, 'set')
            || typeof descriptor.value !== 'function') {
            return null;
          }

          on = descriptor.value;
        }
      }

      if (removeListener === null) {
        const descriptor = Object.getOwnPropertyDescriptor(current, 'removeListener');
        if (descriptor !== undefined) {
          if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')
            || !Object.prototype.hasOwnProperty.call(descriptor, 'writable')
            || Object.prototype.hasOwnProperty.call(descriptor, 'get')
            || Object.prototype.hasOwnProperty.call(descriptor, 'set')
            || typeof descriptor.value !== 'function') {
            return null;
          }

          removeListener = descriptor.value;
        }
      }

      current = Object.getPrototypeOf(current);
    }

    return on !== null && removeListener !== null ? { on, removeListener } : null;
  } catch {
    return null;
  }
}

function normalizeLifecycleInput(input) {
  try {
    if (!isPlainRecord(input)) {
      return null;
    }

    const requiredKeys = [
      'child',
      'rootPid',
      'snapshotOptions',
      'commandOptions',
      'probeTerminalReport',
    ];
    const optionalKeys = [
      'overallDeadlineMs',
      'terminalGraceMs',
      'sampleIntervalMs',
      'maxTerminationPasses',
      'terminationPollIntervalMs',
      'initializeOwnershipImpl',
      'sampleOwnershipImpl',
      'terminateImpl',
      'setTimeoutImpl',
      'clearTimeoutImpl',
    ];
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    const descriptors = new Map();

    const ownKeys = Reflect.ownKeys(input);
    for (const key of ownKeys) {
      if (typeof key !== 'string' || !allowedKeys.has(key)) {
        return null;
      }

      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!isEnumerableDataDescriptor(descriptor)) {
        return null;
      }

      descriptors.set(key, descriptor);
    }

    for (const key of requiredKeys) {
      if (!descriptors.has(key)) {
        return null;
      }
    }

    const child = descriptors.get('child').value;
    const rootPid = descriptors.get('rootPid').value;
    const rawSnapshotOptions = descriptors.get('snapshotOptions').value;
    const rawCommandOptions = descriptors.get('commandOptions').value;
    const probeTerminalReport = descriptors.get('probeTerminalReport').value;
    if (child === undefined
      || rootPid === undefined
      || rawSnapshotOptions === undefined
      || rawCommandOptions === undefined
      || probeTerminalReport === undefined) {
      return null;
    }

    if (!Number.isSafeInteger(rootPid) || rootPid <= 0) {
      return null;
    }

    if (child === input
      || child === null
      || typeof child !== 'object'
      || Array.isArray(child)
      || isProxyObject(child)) {
      return null;
    }

    const childPidDescriptor = Object.getOwnPropertyDescriptor(child, 'pid');
    if (childPidDescriptor === undefined
      || !Object.prototype.hasOwnProperty.call(childPidDescriptor, 'value')
      || !Object.prototype.hasOwnProperty.call(childPidDescriptor, 'writable')
      || Object.prototype.hasOwnProperty.call(childPidDescriptor, 'get')
      || Object.prototype.hasOwnProperty.call(childPidDescriptor, 'set')
      || childPidDescriptor.value !== rootPid) {
      return null;
    }

    const childMethods = captureChildEventMethods(child);
    if (childMethods === null) {
      return null;
    }

    const snapshotOptions = normalizeProcessOptions(rawSnapshotOptions);
    const commandOptions = normalizeProcessOptions(rawCommandOptions);
    if (snapshotOptions === null || commandOptions === null || typeof probeTerminalReport !== 'function') {
      return null;
    }

    const bounds = normalizeLifecycleBounds(descriptors);
    if (bounds === null) {
      return null;
    }

    const readDependency = (key, readDefault) => {
      const descriptor = descriptors.get(key);
      const value = descriptor === undefined ? undefined : descriptor.value;
      if (value === undefined) {
        const defaultValue = readDefault();
        return typeof defaultValue === 'function' ? defaultValue : null;
      }

      return typeof value === 'function' ? value : null;
    };
    const initializeOwnershipImpl = readDependency(
      'initializeOwnershipImpl',
      () => initializeSpawnedProcessOwnership,
    );
    const sampleOwnershipImpl = readDependency(
      'sampleOwnershipImpl',
      () => sampleSpawnedProcessOwnership,
    );
    const terminateImpl = readDependency('terminateImpl', () => terminateCapturedProcessTree);
    const setTimeoutImpl = readDependency('setTimeoutImpl', () => globalThis.setTimeout);
    const clearTimeoutImpl = readDependency('clearTimeoutImpl', () => globalThis.clearTimeout);
    if (initializeOwnershipImpl === null
      || sampleOwnershipImpl === null
      || terminateImpl === null
      || setTimeoutImpl === null
      || clearTimeoutImpl === null) {
      return null;
    }

    return {
      child,
      rootPid,
      snapshotOptions,
      commandOptions,
      probeTerminalReport,
      overallDeadlineMs: bounds.overallDeadlineMs,
      terminalGraceMs: bounds.terminalGraceMs,
      sampleIntervalMs: bounds.sampleIntervalMs,
      maxTerminationPasses: bounds.maxTerminationPasses,
      terminationPollIntervalMs: bounds.terminationPollIntervalMs,
      initializeOwnershipImpl,
      sampleOwnershipImpl,
      terminateImpl,
      setTimeoutImpl,
      clearTimeoutImpl,
      on: childMethods.on,
      removeListener: childMethods.removeListener,
    };
  } catch {
    return null;
  }
}

function normalizeChildExit(code, signal) {
  try {
    if (code !== null && !Number.isSafeInteger(code)) {
      return null;
    }

    if (signal !== null
      && (typeof signal !== 'string'
        || signal.length === 0
        || signal.length > 128
        || signal.trim() !== signal
        || /[\u0000-\u001F\u007F-\u009F]/u.test(signal))) {
      return null;
    }

    if (code === null && signal === null) {
      return null;
    }

    return { code, signal };
  } catch {
    return null;
  }
}

function cloneChildExit(value) {
  try {
    if (!isPlainRecord(value) || !hasExactOrderedDataKeys(value, ['code', 'signal'])) {
      return null;
    }

    const codeDescriptor = Object.getOwnPropertyDescriptor(value, 'code');
    const signalDescriptor = Object.getOwnPropertyDescriptor(value, 'signal');
    if (!isEnumerableDataDescriptor(codeDescriptor) || !isEnumerableDataDescriptor(signalDescriptor)) {
      return null;
    }

    return normalizeChildExit(codeDescriptor.value, signalDescriptor.value);
  } catch {
    return null;
  }
}

function createLifecycleTriggerGate() {
  let settledRecord = null;
  let resolveFirstSettlement;
  const firstSettlementPromise = new Promise((resolve) => {
    resolveFirstSettlement = resolve;
  });

  const read = () => {
    if (settledRecord === null) {
      return null;
    }

    return {
      trigger: settledRecord.trigger,
      childExit: settledRecord.childExit === null
        ? null
        : {
          code: settledRecord.childExit.code,
          signal: settledRecord.childExit.signal,
        },
    };
  };

  const settle = (trigger, childExit) => {
    if (settledRecord !== null) {
      return false;
    }

    let normalizedChildExit;
    switch (trigger) {
      case 'child-close':
        normalizedChildExit = cloneChildExit(childExit);
        if (normalizedChildExit === null) {
          return false;
        }
        break;
      case 'child-error':
      case 'terminal-report-grace-expired':
      case 'outer-deadline':
        if (childExit !== null) {
          return false;
        }
        normalizedChildExit = null;
        break;
      default:
        return false;
    }

    settledRecord = {
      trigger,
      childExit: normalizedChildExit,
    };
    resolveFirstSettlement(read());
    return true;
  };

  return {
    promise: firstSettlementPromise,
    settle,
    read,
  };
}

function createLifecycleControl(normalized, diagnostics) {
  const gate = createLifecycleTriggerGate();
  const child = normalized.child;
  const on = normalized.on;
  const removeListener = normalized.removeListener;
  const setTimeoutImpl = normalized.setTimeoutImpl;
  const clearTimeoutImpl = normalized.clearTimeoutImpl;
  const overallDeadlineMs = normalized.overallDeadlineMs;
  const terminalGraceMs = normalized.terminalGraceMs;
  const sampleIntervalMs = normalized.sampleIntervalMs;

  let childInteractionFailed = false;
  let timerFailed = false;
  let stopped = false;
  let cleanedUp = false;
  let terminalGraceArmed = false;
  let pendingSampleDelay = null;

  const outerTimer = {
    active: false,
    handle: undefined,
  };
  const terminalGraceTimer = {
    active: false,
    handle: undefined,
  };

  let closeListenerAttempted = false;
  let errorListenerAttempted = false;

  const settleOuterDeadlineAfterTimerFailure = (phase) => {
    diagnostics.fail(phase, 'timer-exception');
    timerFailed = true;
    gate.settle('outer-deadline', null);
  };

  const settleChildErrorAfterInteractionFailure = (phase) => {
    diagnostics.fail(phase, 'child-interaction-exception');
    childInteractionFailed = true;
    gate.settle('child-error', null);
  };

  const clearTimer = (timer) => {
    if (!timer.active) {
      return;
    }

    const handle = timer.handle;
    timer.active = false;
    timer.handle = undefined;
    try {
      Reflect.apply(clearTimeoutImpl, undefined, [handle]);
    } catch {
      settleOuterDeadlineAfterTimerFailure('control-clear-timer');
    }
  };

  const closeListener = (code, signal) => {
    if (stopped || cleanedUp) {
      return;
    }

    const childExit = normalizeChildExit(code, signal);
    if (childExit === null) {
      gate.settle('child-error', null);
      return;
    }

    gate.settle('child-close', {
      code: childExit.code,
      signal: childExit.signal,
    });
  };

  const errorListener = () => {
    if (stopped || cleanedUp) {
      return;
    }

    gate.settle('child-error', null);
  };

  closeListenerAttempted = true;
  try {
    Reflect.apply(on, child, ['close', closeListener]);
  } catch {
    settleChildErrorAfterInteractionFailure('control-close-listener');
  }

  errorListenerAttempted = true;
  try {
    Reflect.apply(on, child, ['error', errorListener]);
  } catch {
    settleChildErrorAfterInteractionFailure('control-error-listener');
  }

  const outerDeadlineCallback = () => {
    outerTimer.active = false;
    outerTimer.handle = undefined;
    if (stopped || cleanedUp) {
      return;
    }

    gate.settle('outer-deadline', null);
  };

  try {
    const handle = Reflect.apply(setTimeoutImpl, undefined, [outerDeadlineCallback, overallDeadlineMs]);
    outerTimer.handle = handle;
    outerTimer.active = true;
  } catch {
    settleOuterDeadlineAfterTimerFailure('control-outer-timer');
  }

  const settleSampleDelay = (delay, outcome, clearHandle) => {
    if (delay.settled) {
      return;
    }

    delay.settled = true;
    if (pendingSampleDelay === delay) {
      pendingSampleDelay = null;
    }

    if (clearHandle) {
      clearTimer(delay.timer);
    } else {
      delay.timer.active = false;
      delay.timer.handle = undefined;
    }

    delay.resolve(outcome);
  };

  const armTerminalGrace = () => {
    if (terminalGraceArmed || stopped || cleanedUp || gate.read() !== null) {
      return;
    }

    terminalGraceArmed = true;
    const terminalGraceCallback = () => {
      terminalGraceTimer.active = false;
      terminalGraceTimer.handle = undefined;
      if (stopped || cleanedUp) {
        return;
      }

      gate.settle('terminal-report-grace-expired', null);
    };

    try {
      const handle = Reflect.apply(setTimeoutImpl, undefined, [terminalGraceCallback, terminalGraceMs]);
      terminalGraceTimer.handle = handle;
      terminalGraceTimer.active = true;
    } catch {
      settleOuterDeadlineAfterTimerFailure('control-terminal-grace');
    }
  };

  const waitForSampleDelay = () => {
    if (pendingSampleDelay !== null) {
      return pendingSampleDelay.promise;
    }

    if (stopped || cleanedUp || gate.read() !== null) {
      return Promise.resolve('triggered');
    }

    const delay = {
      promise: null,
      resolve: null,
      settled: false,
      timer: {
        active: false,
        handle: undefined,
      },
    };
    delay.promise = new Promise((resolve) => {
      delay.resolve = resolve;
    });
    pendingSampleDelay = delay;

    gate.promise.then(() => {
      if (pendingSampleDelay !== delay || delay.settled) {
        return;
      }

      settleSampleDelay(delay, 'triggered', true);
    });

    const sampleDelayCallback = () => {
      if (pendingSampleDelay !== delay || delay.settled || stopped || cleanedUp) {
        return;
      }

      settleSampleDelay(delay, 'elapsed', false);
    };

    try {
      const handle = Reflect.apply(setTimeoutImpl, undefined, [sampleDelayCallback, sampleIntervalMs]);
      if (!delay.settled && pendingSampleDelay === delay) {
        delay.timer.handle = handle;
        delay.timer.active = true;
      }
    } catch {
      settleOuterDeadlineAfterTimerFailure('control-sample-delay');
      settleSampleDelay(delay, 'triggered', false);
    }

    return delay.promise;
  };

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    const delay = pendingSampleDelay;
    if (delay !== null) {
      settleSampleDelay(delay, 'triggered', true);
    }
  };

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    const delay = pendingSampleDelay;
    stop();
    clearTimer(outerTimer);
    clearTimer(terminalGraceTimer);
    if (delay !== null) {
      clearTimer(delay.timer);
    }

    if (closeListenerAttempted) {
      try {
        Reflect.apply(removeListener, child, ['close', closeListener]);
      } catch {
        diagnostics.fail('control-remove-close-listener', 'child-interaction-exception');
        childInteractionFailed = true;
      }
    }

    if (errorListenerAttempted) {
      try {
        Reflect.apply(removeListener, child, ['error', errorListener]);
      } catch {
        diagnostics.fail('control-remove-error-listener', 'child-interaction-exception');
        childInteractionFailed = true;
      }
    }
  };

  const readFailures = () => Object.freeze({
    childInteractionFailed,
    timerFailed,
  });

  const triggerPromise = gate.promise;
  const readTrigger = gate.read;
  return Object.freeze({
    triggerPromise,
    readTrigger,
    promise: triggerPromise,
    read: readTrigger,
    armTerminalGrace,
    waitForSampleDelay,
    stop,
    cleanup,
    readFailures,
  });
}

async function monitorLifecycleOwnership(normalized, control, diagnostics) {
  let ownershipComplete = true;
  let rootIdentity = null;
  let captured = [];
  let reusedPids = [];
  const reusedPidSet = new Set();

  const cloneFacts = () => ({
    ownershipComplete,
    rootIdentity: cloneIdentity(rootIdentity),
    captured: cloneIdentityArray(captured),
    reusedPids: clonePidArray(reusedPids),
  });

  const unionReusedPids = (validated) => {
    const validatedReusedPids = clonePidArray(validated.reusedPids);
    for (const pid of validatedReusedPids) {
      if (!reusedPidSet.has(pid)) {
        reusedPidSet.add(pid);
        reusedPids.push(pid);
      }
    }
  };

  while (true) {
    diagnostics.attempt(rootIdentity === null);
    if (rootIdentity === null) {
      try {
        const raw = await Reflect.apply(normalized.initializeOwnershipImpl, undefined, [{
          rootPid: normalized.rootPid,
          snapshotOptions: { ...normalized.snapshotOptions },
        }]);
        const validated = readInitialOwnershipEnvelope(raw, normalized.rootPid);
        if (validated === null) {
          diagnostics.fail('initialize', readOwnershipFailureCode(raw));
          ownershipComplete = false;
        } else {
          rootIdentity = cloneIdentity(validated.rootIdentity);
          captured = cloneIdentityArray(validated.captured);
          unionReusedPids(validated);
        }
      } catch {
        diagnostics.fail('initialize', 'sampler-exception');
        ownershipComplete = false;
      }
    } else {
      try {
        const sampleRootIdentity = cloneIdentity(rootIdentity);
        const samplePreviousCaptured = cloneIdentityArray(captured);
        const raw = await Reflect.apply(normalized.sampleOwnershipImpl, undefined, [{
          rootIdentity: sampleRootIdentity,
          previousCaptured: samplePreviousCaptured,
          snapshotOptions: { ...normalized.snapshotOptions },
        }]);
        const validated = readSampleOwnershipEnvelope(raw, rootIdentity, captured);
        if (validated === null) {
          diagnostics.fail('sample', readOwnershipFailureCode(raw));
          ownershipComplete = false;
        } else {
          rootIdentity = cloneIdentity(validated.rootIdentity);
          captured = cloneIdentityArray(validated.captured);
          unionReusedPids(validated);
        }
      } catch {
        diagnostics.fail('sample', 'sampler-exception');
        ownershipComplete = false;
      }
    }

    let probeResult = false;
    try {
      probeResult = Reflect.apply(normalized.probeTerminalReport, undefined, []);
    } catch {
      probeResult = false;
    }

    if (probeResult === true) {
      try {
        Reflect.apply(control.armTerminalGrace, undefined, []);
      } catch {
        diagnostics.fail('terminal-grace', 'control-exception');
        ownershipComplete = false;
        return cloneFacts();
      }
    }

    let controlPhase = 'read-trigger';
    try {
      if (control.readTrigger() !== null) {
        return cloneFacts();
      }

      controlPhase = 'sample-delay';
      const delayOutcome = await control.waitForSampleDelay();
      if (delayOutcome === 'triggered') {
        return cloneFacts();
      }

      controlPhase = 'read-trigger';
      if (control.readTrigger() !== null) {
        return cloneFacts();
      }

      if (delayOutcome !== 'elapsed') {
        diagnostics.fail('sample-delay', 'control-outcome-invalid');
        ownershipComplete = false;
        return cloneFacts();
      }
    } catch {
      diagnostics.fail(controlPhase, 'control-exception');
      ownershipComplete = false;
      return cloneFacts();
    }
  }
}

async function terminateLifecycleOwnership(normalized, ownershipFacts) {
  let rootIdentity = null;
  let captured = [];
  let reusedPids = [];

  const failureProjection = () => ({
    termination: null,
    captured: cloneIdentityArray(captured),
    reusedPids: clonePidArray(reusedPids),
  });

  const ownershipRecord = isPlainRecord(ownershipFacts) ? ownershipFacts : null;
  const rootDescriptor = ownershipRecord === null
    ? null
    : Object.getOwnPropertyDescriptor(ownershipRecord, 'rootIdentity');
  const capturedDescriptor = ownershipRecord === null
    ? null
    : Object.getOwnPropertyDescriptor(ownershipRecord, 'captured');
  const reusedPidsDescriptor = ownershipRecord === null
    ? null
    : Object.getOwnPropertyDescriptor(ownershipRecord, 'reusedPids');

  const rawRootIdentity = isEnumerableDataDescriptor(rootDescriptor)
    ? rootDescriptor.value
    : null;
  const validatedRootIdentity = rawRootIdentity === null
    ? null
    : readExactIdentity(rawRootIdentity);
  const validatedCaptured = isEnumerableDataDescriptor(capturedDescriptor)
    ? readDenseIdentityArray(capturedDescriptor.value)
    : null;
  const validatedReusedPids = isEnumerableDataDescriptor(reusedPidsDescriptor)
    ? readDensePidArray(reusedPidsDescriptor.value)
    : null;

  rootIdentity = validatedRootIdentity === null ? null : cloneIdentity(validatedRootIdentity);
  captured = validatedCaptured === null ? [] : cloneIdentityArray(validatedCaptured);

  const capturedPids = new Set(captured.map((identity) => identity.pid));
  reusedPids = validatedReusedPids === null
    ? []
    : validatedReusedPids.filter((pid) => capturedPids.has(pid));
  reusedPids = clonePidArray(reusedPids);

  const rootContained = rootIdentity !== null
    && captured.some((identity) => (
      identity.pid === rootIdentity.pid
      && identity.creationToken === rootIdentity.creationToken
    ));
  if (rootIdentity === null || captured.length === 0 || !rootContained) {
    return failureProjection();
  }

  let terminateImpl;
  let snapshotOptions;
  let commandOptions;
  let maxPasses;
  let pollIntervalMs;
  try {
    if (!isPlainRecord(normalized)) {
      return failureProjection();
    }

    terminateImpl = normalized.terminateImpl;
    snapshotOptions = normalizeProcessOptions(normalized.snapshotOptions);
    commandOptions = normalizeProcessOptions(normalized.commandOptions);
    maxPasses = normalized.maxTerminationPasses;
    pollIntervalMs = normalized.terminationPollIntervalMs;
  } catch {
    return failureProjection();
  }

  if (typeof terminateImpl !== 'function'
    || snapshotOptions === null
    || commandOptions === null
    || !Number.isSafeInteger(maxPasses)
    || maxPasses < 1
    || maxPasses > 1000
    || !Number.isSafeInteger(pollIntervalMs)
    || pollIntervalMs < 0
    || pollIntervalMs > 1000) {
    return failureProjection();
  }

  const validationRootIdentity = cloneIdentity(rootIdentity);
  const validationPreviousCaptured = cloneIdentityArray(captured);
  const terminationInput = {
    rootIdentity: cloneIdentity(rootIdentity),
    previousCaptured: cloneIdentityArray(captured),
    snapshotOptions,
    commandOptions,
    maxPasses,
    pollIntervalMs,
  };

  let raw;
  try {
    raw = await Reflect.apply(terminateImpl, undefined, [terminationInput]);
  } catch {
    return failureProjection();
  }

  try {
    const validatedTermination = readTerminationEnvelope(
      raw,
      validationRootIdentity,
      validationPreviousCaptured,
    );
    if (validatedTermination === null) {
      return failureProjection();
    }

    const projectedReusedPids = clonePidArray(reusedPids);
    const projectedReusedPidSet = new Set(projectedReusedPids);
    for (const pid of validatedTermination.reusedPids) {
      if (!projectedReusedPidSet.has(pid)) {
        projectedReusedPidSet.add(pid);
        projectedReusedPids.push(pid);
      }
    }

    return {
      termination: cloneTermination(validatedTermination),
      captured: cloneIdentityArray(validatedTermination.captured),
      reusedPids: clonePidArray(projectedReusedPids),
    };
  } catch {
    return failureProjection();
  }
}

function cloneTermination(value) {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  return {
    complete: value.complete,
    errors: value.errors.map((error) => error),
    treeGone: value.treeGone,
    passes: value.passes,
    captured: cloneIdentityArray(value.captured),
    commanded: cloneIdentityArray(value.commanded),
    reusedPids: clonePidArray(value.reusedPids),
  };
}

function buildLifecycleResult({
  complete,
  errors,
  trigger,
  childExit,
  ownershipComplete,
  rootIdentity,
  captured,
  reusedPids,
  termination,
}) {
  return {
    complete,
    errors: errors.map((error) => error),
    trigger,
    childExit: cloneChildExit(childExit),
    ownershipComplete,
    rootIdentity: cloneIdentity(rootIdentity),
    captured: cloneIdentityArray(captured),
    reusedPids: clonePidArray(reusedPids),
    termination: cloneTermination(termination),
  };
}

export async function superviseSpawnedE2eProcess(input = {}) {
  const normalized = normalizeLifecycleInput(input);
  if (normalized === null) {
    return buildLifecycleResult({
      complete: false,
      errors: [E2E_LIFECYCLE_INVALID_INPUT],
      trigger: null,
      childExit: null,
      ownershipComplete: false,
      rootIdentity: null,
      captured: [],
      reusedPids: [],
      termination: null,
    });
  }

  const diagnostics = createOwnershipDiagnostics();
  let compositionFailed = false;
  let control = null;
  let ownershipFacts = {
    ownershipComplete: false,
    rootIdentity: null,
    captured: [],
    reusedPids: [],
  };

  try {
    control = createLifecycleControl(normalized, diagnostics);
  } catch {
    diagnostics.fail('control-create', 'control-exception');
    compositionFailed = true;
  }

  if (control === null) {
    compositionFailed = true;
  } else {
    try {
      const rawOwnershipFacts = await monitorLifecycleOwnership(normalized, control, diagnostics);
      if (!isPlainRecord(rawOwnershipFacts)
        || !hasExactOrderedDataKeys(rawOwnershipFacts, [
          'ownershipComplete',
          'rootIdentity',
          'captured',
          'reusedPids',
        ])) {
        diagnostics.fail('monitor-result', 'ownership-facts-invalid');
        compositionFailed = true;
      } else {
        const ownershipCompleteDescriptor = Object.getOwnPropertyDescriptor(
          rawOwnershipFacts,
          'ownershipComplete',
        );
        const rootIdentityDescriptor = Object.getOwnPropertyDescriptor(rawOwnershipFacts, 'rootIdentity');
        const capturedDescriptor = Object.getOwnPropertyDescriptor(rawOwnershipFacts, 'captured');
        const reusedPidsDescriptor = Object.getOwnPropertyDescriptor(rawOwnershipFacts, 'reusedPids');
        const rawRootIdentity = rootIdentityDescriptor.value;
        const validatedRootIdentity = rawRootIdentity === null
          ? null
          : readExactIdentity(rawRootIdentity);
        const validatedCaptured = readDenseIdentityArray(capturedDescriptor.value);
        const validatedReusedPids = readDensePidArray(reusedPidsDescriptor.value);

        if (!isEnumerableDataDescriptor(ownershipCompleteDescriptor)
          || !isEnumerableDataDescriptor(rootIdentityDescriptor)
          || !isEnumerableDataDescriptor(capturedDescriptor)
          || !isEnumerableDataDescriptor(reusedPidsDescriptor)
          || typeof ownershipCompleteDescriptor.value !== 'boolean'
          || (rawRootIdentity !== null && validatedRootIdentity === null)
          || validatedCaptured === null
          || validatedReusedPids === null) {
          diagnostics.fail('monitor-result', 'ownership-facts-invalid');
          compositionFailed = true;
        } else {
          ownershipFacts = {
            ownershipComplete: ownershipCompleteDescriptor.value,
            rootIdentity: validatedRootIdentity === null ? null : cloneIdentity(validatedRootIdentity),
            captured: cloneIdentityArray(validatedCaptured),
            reusedPids: clonePidArray(validatedReusedPids),
          };
        }
      }
    } catch {
      diagnostics.fail('monitor', 'monitor-exception');
      compositionFailed = true;
    }
  }

  if (control !== null) {
    try {
      control.stop();
    } catch {
      diagnostics.fail('control-stop', 'control-exception');
      compositionFailed = true;
    }

    try {
      control.cleanup();
    } catch {
      diagnostics.fail('control-cleanup', 'control-exception');
      compositionFailed = true;
    }
  }

  let triggerRecord = null;
  let timerFailed = false;
  let childInteractionFailed = false;

  if (control !== null) {
    try {
      const rawTriggerRecord = control.readTrigger();
      if (rawTriggerRecord !== null
        && (!isPlainRecord(rawTriggerRecord)
          || !hasExactOrderedDataKeys(rawTriggerRecord, ['trigger', 'childExit']))) {
        diagnostics.fail('control-trigger', 'control-result-invalid');
        compositionFailed = true;
      } else if (rawTriggerRecord !== null) {
        const triggerDescriptor = Object.getOwnPropertyDescriptor(rawTriggerRecord, 'trigger');
        const childExitDescriptor = Object.getOwnPropertyDescriptor(rawTriggerRecord, 'childExit');
        const triggerValue = triggerDescriptor.value;
        const childExitValue = childExitDescriptor.value;
        const allowedTrigger = triggerValue === 'child-close'
          || triggerValue === 'child-error'
          || triggerValue === 'terminal-report-grace-expired'
          || triggerValue === 'outer-deadline';
        const clonedChildExit = cloneChildExit(childExitValue);
        if (!isEnumerableDataDescriptor(triggerDescriptor)
          || !isEnumerableDataDescriptor(childExitDescriptor)
          || !allowedTrigger
          || (triggerValue === 'child-close' && clonedChildExit === null)
          || (triggerValue !== 'child-close' && childExitValue !== null)) {
          diagnostics.fail('control-trigger', 'control-result-invalid');
          compositionFailed = true;
        } else {
          triggerRecord = {
            trigger: triggerValue,
            childExit: clonedChildExit,
          };
        }
      }
    } catch {
      diagnostics.fail('control-trigger', 'control-exception');
      compositionFailed = true;
    }

    try {
      const rawFailures = control.readFailures();
      if (!isPlainRecord(rawFailures)
        || !hasExactOrderedDataKeys(rawFailures, ['childInteractionFailed', 'timerFailed'])) {
        diagnostics.fail('control-failures', 'control-result-invalid');
        compositionFailed = true;
      } else {
        const childInteractionFailedDescriptor = Object.getOwnPropertyDescriptor(
          rawFailures,
          'childInteractionFailed',
        );
        const timerFailedDescriptor = Object.getOwnPropertyDescriptor(rawFailures, 'timerFailed');
        if (!isEnumerableDataDescriptor(childInteractionFailedDescriptor)
          || !isEnumerableDataDescriptor(timerFailedDescriptor)
          || typeof childInteractionFailedDescriptor.value !== 'boolean'
          || typeof timerFailedDescriptor.value !== 'boolean') {
          diagnostics.fail('control-failures', 'control-result-invalid');
          compositionFailed = true;
        } else {
          childInteractionFailed = childInteractionFailedDescriptor.value;
          timerFailed = timerFailedDescriptor.value;
        }
      }
    } catch {
      diagnostics.fail('control-failures', 'control-exception');
      compositionFailed = true;
    }
  } else {
    compositionFailed = true;
  }

  let teardown = {
    termination: null,
    captured: [],
    reusedPids: [],
  };
  try {
    const rawTeardown = await terminateLifecycleOwnership(normalized, ownershipFacts);
    if (!isPlainRecord(rawTeardown)
      || !hasExactOrderedDataKeys(rawTeardown, ['termination', 'captured', 'reusedPids'])) {
      compositionFailed = true;
    } else {
      const terminationDescriptor = Object.getOwnPropertyDescriptor(rawTeardown, 'termination');
      const capturedDescriptor = Object.getOwnPropertyDescriptor(rawTeardown, 'captured');
      const reusedPidsDescriptor = Object.getOwnPropertyDescriptor(rawTeardown, 'reusedPids');
      const validatedCaptured = readDenseIdentityArray(capturedDescriptor.value);
      const validatedReusedPids = readDensePidArray(reusedPidsDescriptor.value);
      if (!isEnumerableDataDescriptor(terminationDescriptor)
        || !isEnumerableDataDescriptor(capturedDescriptor)
        || !isEnumerableDataDescriptor(reusedPidsDescriptor)
        || (terminationDescriptor.value !== null && !isPlainRecord(terminationDescriptor.value))
        || validatedCaptured === null
        || validatedReusedPids === null) {
        compositionFailed = true;
      } else {
        teardown = {
          termination: terminationDescriptor.value === null
            ? null
            : cloneTermination(terminationDescriptor.value),
          captured: cloneIdentityArray(validatedCaptured),
          reusedPids: clonePidArray(validatedReusedPids),
        };
      }
    }
  } catch {
    compositionFailed = true;
  }

  const trigger = triggerRecord === null ? null : triggerRecord.trigger;
  const childExit = triggerRecord === null ? null : cloneChildExit(triggerRecord.childExit);
  const ownershipComplete = ownershipFacts.ownershipComplete === true;
  const terminationComplete = teardown.termination !== null
    && teardown.termination.complete === true
    && teardown.termination.treeGone === true;
  const complete = triggerRecord !== null
    && compositionFailed === false
    && trigger !== 'child-error'
    && timerFailed === false
    && childInteractionFailed === false
    && ownershipComplete
    && terminationComplete;

  let error;
  if (timerFailed) {
    error = E2E_LIFECYCLE_TIMER_FAILED;
  } else if (compositionFailed
    || triggerRecord === null
    || trigger === 'child-error'
    || childInteractionFailed) {
    error = E2E_LIFECYCLE_CHILD_ERROR;
  } else if (ownershipComplete === false) {
    error = E2E_LIFECYCLE_OWNERSHIP_INCOMPLETE;
  } else if (!terminationComplete) {
    error = E2E_LIFECYCLE_TERMINATION_FAILED;
  }

  diagnostics.summary(ownershipComplete);
  return buildLifecycleResult({
    complete,
    errors: complete ? [] : [error],
    trigger,
    childExit,
    ownershipComplete,
    rootIdentity: ownershipFacts.rootIdentity,
    captured: teardown.captured,
    reusedPids: teardown.reusedPids,
    termination: teardown.termination,
  });
}
