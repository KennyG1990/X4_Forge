import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const RUNTIME_NODE_OVERRIDE = 'X4_FORGE_E2E_NODE_PATH';
export const RUNTIME_BOOTSTRAP_MARKER = 'X4_FORGE_E2E_RUNTIME_BOOTSTRAP_MARKER';
export const RUNTIME_EXPECTED_EXEC_PATH = 'X4_FORGE_E2E_RUNTIME_EXPECTED_EXEC_PATH';

const WINDOWS_PLATFORM = 'win32';
const SAFE_NODE_MAJOR = 24;
const MIN_SAFE_UV = [1, 52, 1];
const MAX_PATH_LENGTH = 32768;
const MAX_PROBE_OUTPUT_BYTES = 8192;
const PROBE_TIMEOUT_MS = 2000;
const MARKER_VALUE = '1';
const RECEIPT_MUTATION_E2E = 'e2e';
const RECEIPT_MUTATION_PRESERVE = 'preserve';
const DEFAULT_RECEIPT_NAME = path.join('test-results', 'e2e-verdict.json');
const CANDIDATE_PROBE = 'process.stdout.write(JSON.stringify({execPath:process.execPath,node:process.versions.node,uv:process.versions.uv}));';
const NODE_RESOLUTION_PROBE = 'process.stdout.write(JSON.stringify({execPath:process.execPath}));';
const RUNTIME_REMEDIATION_HINT = `Set ${RUNTIME_NODE_OVERRIDE} to an absolute Node 24 node.exe with libuv >=1.52.1.`;
const ENVIRONMENT_REMEDIATION_HINT = 'Run via npm run test:e2e using own string environment values and one PATH key; do not set private bootstrap variables.';
const RECEIPT_REMEDIATION_HINT = 'Ensure the default E2E verdict file can be removed, then retry.';

function isPlainRecord(value) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isEnvironmentRecord(value) {
  try {
    if (value === process.env) return true;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function readOwnData(value, key) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return { present: false, valid: false, value: undefined };
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return { present: false, valid: true, value: undefined };
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || Object.prototype.hasOwnProperty.call(descriptor, 'get')
      || Object.prototype.hasOwnProperty.call(descriptor, 'set')) {
      return { present: true, valid: false, value: undefined };
    }
    return { present: true, valid: true, value: descriptor.value };
  } catch {
    return { present: true, valid: false, value: undefined };
  }
}

function platformPath(platform) {
  return platform === WINDOWS_PLATFORM ? path.win32 : path.posix;
}

function hasUnsafeText(value) {
  return typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_PATH_LENGTH
    || /[\u0000-\u001F\u007F-\u009F]/u.test(value);
}

function isAbsolutePath(value, platform) {
  if (hasUnsafeText(value)) return false;
  return platformPath(platform).isAbsolute(value);
}

function comparablePath(value, platform) {
  const normalized = platformPath(platform).normalize(value);
  return platform === WINDOWS_PLATFORM ? normalized.toLowerCase() : normalized;
}

function ownPropertyNames(value) {
  try {
    if (!isEnvironmentRecord(value)) return null;
    if (Object.getOwnPropertySymbols(value).length !== 0) return null;
    return Object.getOwnPropertyNames(value);
  } catch {
    return null;
  }
}

function hasPrototypeProperty(value, names) {
  try {
    let prototype = Object.getPrototypeOf(value);
    const wanted = new Set(names.map(name => name.toLowerCase()));
    while (prototype !== null) {
      const keys = Object.getOwnPropertyNames(prototype);
      if (keys.some(key => wanted.has(key.toLowerCase()))) return true;
      prototype = Object.getPrototypeOf(prototype);
    }
  } catch {
    return true;
  }
  return false;
}

function inspectEnvironment(environment) {
  const names = ownPropertyNames(environment);
  if (names === null) return { ok: false, code: 'environment-shape-invalid' };

  const reservedNames = [
    'PATH',
    RUNTIME_NODE_OVERRIDE,
    RUNTIME_BOOTSTRAP_MARKER,
    RUNTIME_EXPECTED_EXEC_PATH,
  ];
  if (hasPrototypeProperty(environment, reservedNames)) {
    return { ok: false, code: 'environment-prototype-value' };
  }

  const entries = [];
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(environment, name);
    if (descriptor === undefined
      || descriptor.enumerable !== true
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || Object.prototype.hasOwnProperty.call(descriptor, 'get')
      || Object.prototype.hasOwnProperty.call(descriptor, 'set')
      || typeof descriptor.value !== 'string'
      || /[\u0000-\u001F\u007F-\u009F]/u.test(name)
      || /[\u0000-\u001F\u007F-\u009F]/u.test(descriptor.value)) {
      return { ok: false, code: 'environment-data-invalid' };
    }
    entries.push({ name, value: descriptor.value });
  }

  const pathEntries = entries.filter(entry => entry.name.toLowerCase() === 'path');
  if (pathEntries.length > 1 && !pathEntries.every(entry => entry.value === pathEntries[0].value)) {
    return { ok: false, code: 'environment-path-duplicate' };
  }

  return {
    ok: true,
    entries,
    pathValue: pathEntries.length === 0 ? '' : pathEntries[0].value,
  };
}

function caseInsensitiveEntries(entries, name) {
  const wanted = name.toLowerCase();
  return entries.filter(entry => entry.name.toLowerCase() === wanted);
}

function normalizePathValue(value, runtimeDirectory, platform) {
  if (typeof value !== 'string' || value.length > MAX_PATH_LENGTH
    || /[\u0000-\u001F\u007F-\u009F]/u.test(value)) {
    return { ok: false, code: 'environment-path-invalid' };
  }
  const delimiter = platform === WINDOWS_PLATFORM ? ';' : path.delimiter;
  const entries = value.length === 0 ? [] : value.split(delimiter);
  const runtimeKey = comparablePath(runtimeDirectory, platform);
  const retained = entries.filter(entry => comparablePath(entry, platform) !== runtimeKey);
  return { ok: true, value: [runtimeDirectory, ...retained].join(delimiter) };
}

/** Create a fresh child environment with one canonical case-insensitive PATH key. */
export function normalizeE2eEnvironment(environment, runtimeDirectory, { platform = process.platform, excludeNames = [] } = {}) {
  if (platform !== WINDOWS_PLATFORM) return { ok: true, environment: undefined };
  if (!isAbsolutePath(runtimeDirectory, platform)) return { ok: false, code: 'runtime-directory-invalid' };

  const inspected = inspectEnvironment(environment);
  if (!inspected.ok) return inspected;

  const excluded = new Set(excludeNames.map(name => name.toLowerCase()));
  const output = Object.create(null);
  for (const entry of inspected.entries) {
    const lowerName = entry.name.toLowerCase();
    if (lowerName === 'path' || excluded.has(lowerName)) continue;
    output[entry.name] = entry.value;
  }

  const normalizedPath = normalizePathValue(inspected.pathValue, runtimeDirectory, platform);
  if (!normalizedPath.ok) return normalizedPath;
  output.PATH = normalizedPath.value;
  return { ok: true, environment: output };
}

function parseVersion(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/u.exec(value);
  if (!match) return null;
  const numbers = match.slice(1, 4).map(Number);
  if (!numbers.every(number => Number.isSafeInteger(number))) return null;
  return numbers;
}

export function isSafeWindowsRuntimeVersion(nodeVersion, uvVersion) {
  const node = parseVersion(nodeVersion);
  const uv = parseVersion(uvVersion);
  if (node === null || uv === null || node[0] !== SAFE_NODE_MAJOR) return false;
  for (let index = 0; index < MIN_SAFE_UV.length; index += 1) {
    if (uv[index] > MIN_SAFE_UV[index]) return true;
    if (uv[index] < MIN_SAFE_UV[index]) return false;
  }
  return true;
}

function canonicalizeExecutable(candidate, platform, fsImpl) {
  if (!isAbsolutePath(candidate, platform)) return { ok: false, code: 'candidate-path-invalid' };
  try {
    const initialStat = fsImpl.statSync(candidate);
    if (!initialStat || typeof initialStat.isFile !== 'function' || initialStat.isFile() !== true) {
      return { ok: false, code: 'candidate-file-invalid' };
    }
    const nativeRealpath = fsImpl.realpathSync?.native;
    if (typeof nativeRealpath !== 'function') return { ok: false, code: 'candidate-realpath-unavailable' };
    const resolved = nativeRealpath.call(fsImpl.realpathSync, candidate);
    if (!isAbsolutePath(resolved, platform)) return { ok: false, code: 'candidate-realpath-invalid' };
    const resolvedStat = fsImpl.statSync(resolved);
    if (!resolvedStat || typeof resolvedStat.isFile !== 'function' || resolvedStat.isFile() !== true) {
      return { ok: false, code: 'candidate-file-invalid' };
    }
    return { ok: true, path: resolved };
  } catch {
    return { ok: false, code: 'candidate-file-inaccessible' };
  }
}

function readSpawnField(value, key) {
  const field = readOwnData(value, key);
  return field.present && field.valid ? field.value : undefined;
}

function boundedOutput(value) {
  if (Buffer.isBuffer(value)) {
    if (value.byteLength > MAX_PROBE_OUTPUT_BYTES) return null;
    return value.toString('utf8');
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_PROBE_OUTPUT_BYTES) return null;
    return value;
  }
  return null;
}

function runProbe(file, args, environment, cwd, spawnSyncImpl) {
  let result;
  try {
    result = spawnSyncImpl(file, args, {
      shell: false,
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: PROBE_TIMEOUT_MS,
      maxBuffer: MAX_PROBE_OUTPUT_BYTES,
      windowsHide: true,
    });
  } catch {
    return { ok: false, code: 'probe-spawn-error' };
  }

  const status = readSpawnField(result, 'status');
  const signal = readSpawnField(result, 'signal');
  const error = readSpawnField(result, 'error');
  const stdout = boundedOutput(readSpawnField(result, 'stdout'));
  const stderr = boundedOutput(readSpawnField(result, 'stderr'));
  if (status !== 0 || signal !== null || error !== undefined && error !== null || stdout === null || stderr === null) {
    return { ok: false, code: 'probe-result-invalid' };
  }
  return { ok: true, stdout };
}

function exactDataRecord(value, expectedKeys) {
  if (!isPlainRecord(value)) return false;
  try {
    const names = Object.getOwnPropertyNames(value);
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length !== 0 || names.length !== expectedKeys.length) return false;
    const expected = new Set(expectedKeys);
    for (const name of names) {
      if (!expected.has(name)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || Object.prototype.hasOwnProperty.call(descriptor, 'get')
        || Object.prototype.hasOwnProperty.call(descriptor, 'set')) return false;
    }
  } catch {
    return false;
  }
  return true;
}

function parseJsonOutput(text, expectedKeys) {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!exactDataRecord(value, expectedKeys)) return null;
  for (const key of expectedKeys) {
    const field = readOwnData(value, key);
    if (!field.valid || typeof field.value !== 'string' || hasUnsafeText(field.value)) return null;
  }
  return value;
}

function probeCandidate(candidate, candidateEnvironment, cwd, platform, fsImpl, spawnSyncImpl) {
  const result = runProbe(candidate, ['-e', CANDIDATE_PROBE], candidateEnvironment, cwd, spawnSyncImpl);
  if (!result.ok) return result;
  const report = parseJsonOutput(result.stdout, ['execPath', 'node', 'uv']);
  if (report === null) return { ok: false, code: 'candidate-probe-output-invalid' };
  const reportedPath = canonicalizeExecutable(report.execPath, platform, fsImpl);
  if (!reportedPath.ok || comparablePath(reportedPath.path, platform) !== comparablePath(candidate, platform)) {
    return { ok: false, code: 'candidate-identity-mismatch' };
  }
  if (!isSafeWindowsRuntimeVersion(report.node, report.uv)) {
    return { ok: false, code: 'candidate-version-unsafe' };
  }
  return { ok: true };
}

function probeLiteralNode(environment, expectedPath, cwd, platform, fsImpl, spawnSyncImpl) {
  const result = runProbe('node', ['-e', NODE_RESOLUTION_PROBE], environment, cwd, spawnSyncImpl);
  if (!result.ok) return { ok: false, code: 'literal-node-probe-invalid' };
  const report = parseJsonOutput(result.stdout, ['execPath']);
  if (report === null) return { ok: false, code: 'literal-node-output-invalid' };
  const resolved = canonicalizeExecutable(report.execPath, platform, fsImpl);
  if (!resolved.ok || comparablePath(resolved.path, platform) !== comparablePath(expectedPath, platform)) {
    return { ok: false, code: 'literal-node-identity-mismatch' };
  }
  return { ok: true };
}

function defaultReceiptPath(cwd) {
  return path.join(cwd, DEFAULT_RECEIPT_NAME);
}

function remediationHint(code) {
  if (code === 'default-receipt-cleanup-failed' || code === 'receipt-mutation-policy-invalid') {
    return RECEIPT_REMEDIATION_HINT;
  }
  if (code.startsWith('environment-') || code.startsWith('recursion-marker-')) {
    return ENVIRONMENT_REMEDIATION_HINT;
  }
  return RUNTIME_REMEDIATION_HINT;
}

function createReceiptCleanup({ fsImpl, receiptPath, mutationAllowed }) {
  let attempted = false;
  let cleaned = false;
  return {
    clear() {
      if (!mutationAllowed) return { ok: true, cleaned: false, preserved: true };
      if (attempted) return { ok: cleaned, cleaned, preserved: false };
      attempted = true;
      try {
        if (typeof fsImpl.rmSync !== 'function') throw new Error('remove unavailable');
        fsImpl.rmSync(receiptPath, { force: true });
        cleaned = true;
      } catch {
        cleaned = false;
      }
      return { ok: cleaned, cleaned, preserved: false };
    },
  };
}

function cleanAndRefuse({ code, receiptCleanup, log }) {
  const cleanup = receiptCleanup.clear();
  try {
    log(`[run-e2e] RUNTIME PREFLIGHT FAIL: ${code}. ${remediationHint(code)}${cleanup.ok ? '' : ' Default verdict cleanup failed.'}`);
  } catch {
    // Refusal remains authoritative even if diagnostics are unavailable.
  }
  return { action: 'refuse', exitCode: 1, reason: code, receiptCleaned: cleanup.cleaned };
}

function currentRuntimeValue(options, name, fallback) {
  return options[name] === undefined ? fallback : options[name];
}

function validLaunchInputs(scriptPath, args, cwd) {
  if (typeof scriptPath !== 'string' || scriptPath.length === 0 || scriptPath.length > MAX_PATH_LENGTH
    || /[\u0000-\u001F\u007F-\u009F]/u.test(scriptPath)) return false;
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.length > MAX_PATH_LENGTH
    || /[\u0000-\u001F\u007F-\u009F]/u.test(arg))) return false;
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > MAX_PATH_LENGTH
    || /[\u0000-\u001F\u007F-\u009F]/u.test(cwd)) return false;
  return true;
}

function launchCandidate(candidate, scriptPath, args, cwd, environment, spawnSyncImpl) {
  let result;
  try {
    result = spawnSyncImpl(candidate, [scriptPath, ...args], {
      shell: false,
      cwd,
      env: environment,
      stdio: 'inherit',
      windowsHide: false,
    });
  } catch {
    return { ok: false, code: 'relaunch-spawn-error' };
  }
  const status = readSpawnField(result, 'status');
  const signal = readSpawnField(result, 'signal');
  const error = readSpawnField(result, 'error');
  if ((status !== 0 && status !== 1) || signal !== null || error !== undefined && error !== null) {
    return { ok: false, code: 'relaunch-result-invalid' };
  }
  return { ok: true, exitCode: status };
}

function deriveCandidate(homedirImpl, platform) {
  let home;
  try {
    home = homedirImpl();
  } catch {
    return { ok: false, code: 'derived-candidate-home-unavailable' };
  }
  if (!isAbsolutePath(home, platform)) return { ok: false, code: 'derived-candidate-home-invalid' };
  return {
    ok: true,
    path: platformPath(platform).join(
      home,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'bin',
      'node.exe',
    ),
  };
}

function candidateForEnvironment(inspected, homedirImpl, platform, { derive = true } = {}) {
  const overrideEntries = caseInsensitiveEntries(inspected.entries, RUNTIME_NODE_OVERRIDE);
  if (overrideEntries.length > 1) return { ok: false, code: 'candidate-override-duplicate' };
  if (overrideEntries.length === 1) {
    const candidate = overrideEntries[0].value;
    if (!isAbsolutePath(candidate, platform)) return { ok: false, code: 'candidate-override-invalid' };
    return { ok: true, path: candidate, explicit: true };
  }
  if (!derive) return { ok: true, explicit: false };
  const derived = deriveCandidate(homedirImpl, platform);
  return derived.ok ? { ...derived, explicit: false } : derived;
}

function validateCandidate({ candidate, environment, cwd, platform, fsImpl, spawnSyncImpl }) {
  const canonical = canonicalizeExecutable(candidate, platform, fsImpl);
  if (!canonical.ok) return canonical;
  const runtimeDirectory = platformPath(platform).dirname(canonical.path);
  const normalized = normalizeE2eEnvironment(environment, runtimeDirectory, { platform });
  if (!normalized.ok) return normalized;
  const probed = probeCandidate(canonical.path, normalized.environment, cwd, platform, fsImpl, spawnSyncImpl);
  if (!probed.ok) return probed;
  const literal = probeLiteralNode(normalized.environment, canonical.path, cwd, platform, fsImpl, spawnSyncImpl);
  if (!literal.ok) return literal;
  return { ok: true, path: canonical.path, directory: runtimeDirectory, environment: normalized.environment };
}

function readMarkerState(inspected) {
  const markers = caseInsensitiveEntries(inspected.entries, RUNTIME_BOOTSTRAP_MARKER);
  const expected = caseInsensitiveEntries(inspected.entries, RUNTIME_EXPECTED_EXEC_PATH);
  if (markers.length === 0 && expected.length === 0) return { kind: 'absent' };
  if (markers.length !== 1 || expected.length !== 1) return { kind: 'invalid', code: 'recursion-marker-shape-invalid' };
  if (markers[0].value !== MARKER_VALUE || !isAbsolutePath(expected[0].value, WINDOWS_PLATFORM)) {
    return { kind: 'invalid', code: 'recursion-marker-invalid' };
  }
  return { kind: 'present', expectedPath: expected[0].value };
}

/**
 * Select the safe Windows runtime for the main run-e2e executable.
 * This function performs no work when imported; callers decide whether to run the existing runner.
 */
export function bootstrapE2eRuntime(options = {}) {
  const platform = options.platform === undefined ? process.platform : options.platform;
  if (platform !== WINDOWS_PLATFORM) return { action: 'run', environment: undefined, reason: 'non-windows' };

  const fsImpl = options.fsImpl ?? fs;
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const cwd = currentRuntimeValue(options, 'cwd', process.cwd());
  const receiptPath = currentRuntimeValue(options, 'receiptPath', defaultReceiptPath(cwd));
  const log = options.logImpl ?? console.error;
  const environment = currentRuntimeValue(options, 'env', process.env);
  const currentExecPath = currentRuntimeValue(options, 'currentExecPath', process.execPath);
  const currentNodeVersion = currentRuntimeValue(options, 'currentNodeVersion', process.versions.node);
  const currentUvVersion = currentRuntimeValue(options, 'currentUvVersion', process.versions.uv);
  const scriptPath = currentRuntimeValue(options, 'scriptPath', process.argv[1]);
  const args = currentRuntimeValue(options, 'args', process.argv.slice(2));
  const homedirImpl = options.homedirImpl ?? os.homedir;
  const receiptMutationPolicy = currentRuntimeValue(options, 'receiptMutationPolicy', RECEIPT_MUTATION_E2E);
  const receiptCleanup = createReceiptCleanup({
    fsImpl,
    receiptPath,
    mutationAllowed: receiptMutationPolicy === RECEIPT_MUTATION_E2E,
  });

  const refuse = code => cleanAndRefuse({ code, receiptCleanup, log });
  const prepareReceipt = () => {
    const cleanup = receiptCleanup.clear();
    return cleanup.ok ? null : refuse('default-receipt-cleanup-failed');
  };
  try {
    if (receiptMutationPolicy !== RECEIPT_MUTATION_E2E
      && receiptMutationPolicy !== RECEIPT_MUTATION_PRESERVE) {
      return refuse('receipt-mutation-policy-invalid');
    }
    const inspected = inspectEnvironment(environment);
    if (!inspected.ok) return refuse(inspected.code);

    const marker = readMarkerState(inspected);
    if (marker.kind === 'invalid') return refuse(marker.code);

    const currentSafeVersion = isSafeWindowsRuntimeVersion(currentNodeVersion, currentUvVersion);
    if (marker.kind === 'present') {
      if (!currentSafeVersion) return refuse('relaunched-runtime-version-unsafe');
      const current = canonicalizeExecutable(currentExecPath, platform, fsImpl);
      if (!current.ok) return refuse('relaunched-runtime-identity-invalid');
      const expected = canonicalizeExecutable(marker.expectedPath, platform, fsImpl);
      if (!expected.ok || comparablePath(expected.path, platform) !== comparablePath(current.path, platform)) {
        return refuse('relaunched-runtime-identity-mismatch');
      }
      const normalized = normalizeE2eEnvironment(environment, platformPath(platform).dirname(current.path), {
        platform,
        excludeNames: [RUNTIME_NODE_OVERRIDE, RUNTIME_BOOTSTRAP_MARKER, RUNTIME_EXPECTED_EXEC_PATH],
      });
      if (!normalized.ok) return refuse(normalized.code);
      const literal = probeLiteralNode(normalized.environment, current.path, cwd, platform, fsImpl, spawnSyncImpl);
      if (!literal.ok) return refuse(literal.code);
      const cleanupFailure = prepareReceipt();
      if (cleanupFailure !== null) return cleanupFailure;
      return { action: 'run', environment: normalized.environment, reason: 'validated-relaunch' };
    }

    const explicitCandidate = candidateForEnvironment(inspected, homedirImpl, platform, { derive: false });
    if (!explicitCandidate.ok) return refuse(explicitCandidate.code);

    const current = currentSafeVersion ? canonicalizeExecutable(currentExecPath, platform, fsImpl) : null;
    if (currentSafeVersion && !current.ok) return refuse('current-runtime-identity-invalid');

    if (currentSafeVersion) {
      const validatedOverride = explicitCandidate.explicit
        ? validateCandidate({ candidate: explicitCandidate.path, environment, cwd, platform, fsImpl, spawnSyncImpl })
        : { ok: true };
      if (!validatedOverride.ok) return refuse(validatedOverride.code);
      const normalized = normalizeE2eEnvironment(environment, platformPath(platform).dirname(current.path), { platform });
      if (!normalized.ok) return refuse(normalized.code);
      const literal = probeLiteralNode(normalized.environment, current.path, cwd, platform, fsImpl, spawnSyncImpl);
      if (!literal.ok) return refuse(literal.code);
      const cleanupFailure = prepareReceipt();
      if (cleanupFailure !== null) return cleanupFailure;
      return { action: 'run', environment: normalized.environment, reason: 'safe-current-runtime' };
    }

    const candidateInfo = explicitCandidate.explicit
      ? explicitCandidate
      : candidateForEnvironment(inspected, homedirImpl, platform);
    if (!candidateInfo.ok) return refuse(candidateInfo.code);

    const candidate = validateCandidate({
      candidate: candidateInfo.path,
      environment,
      cwd,
      platform,
      fsImpl,
      spawnSyncImpl,
    });
    if (!candidate.ok) return refuse(candidate.code);
    if (!validLaunchInputs(scriptPath, args, cwd)) return refuse('relaunch-input-invalid');

    const marked = normalizeE2eEnvironment(environment, candidate.directory, {
      platform,
      excludeNames: [RUNTIME_NODE_OVERRIDE, RUNTIME_BOOTSTRAP_MARKER, RUNTIME_EXPECTED_EXEC_PATH],
    });
    if (!marked.ok) return refuse(marked.code);
    marked.environment[RUNTIME_BOOTSTRAP_MARKER] = MARKER_VALUE;
    marked.environment[RUNTIME_EXPECTED_EXEC_PATH] = candidate.path;

    const cleanupFailure = prepareReceipt();
    if (cleanupFailure !== null) return cleanupFailure;
    const relaunched = launchCandidate(candidate.path, scriptPath, args, cwd, marked.environment, spawnSyncImpl);
    if (!relaunched.ok) return refuse(relaunched.code);
    return { action: 'exit', exitCode: relaunched.exitCode, reason: 'relaunch-complete' };
  } catch {
    return refuse('runtime-bootstrap-unexpected-failure');
  }
}
