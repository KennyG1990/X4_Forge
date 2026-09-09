import path from 'node:path';

const checks = [];

function check(name, pass) {
  checks.push({ name, pass: pass === true });
}

function result(status = 0, signal = null, stdout = '') {
  return {
    status,
    signal,
    error: undefined,
    stdout: Buffer.from(stdout),
    stderr: Buffer.alloc(0),
  };
}

function key(value) {
  return value.toLowerCase();
}

function makeFs(files, removed, { events = [], removeFails = false } = {}) {
  const canonical = new Map(files.map(file => [key(file), file]));
  return {
    realpathSync: {
      native(value) {
        const resolved = canonical.get(key(value));
        if (!resolved) throw new Error('missing fixture');
        return resolved;
      },
    },
    statSync(value) {
      if (!canonical.has(key(value))) throw new Error('missing fixture');
      return { isFile: () => true };
    },
    rmSync(value, options) {
      events.push({ type: 'remove', value, options });
      removed.push({ value, options });
      if (removeFails) throw new Error('fixture cleanup failure');
    },
  };
}

function makeSpawn({ candidate, candidateReport, literalExecPath, relaunch = result() }, events = []) {
  const calls = [];
  const spawnSyncImpl = (file, args, options) => {
    calls.push({ file, args: [...args], options });
    events.push({ type: 'spawn', file, args: [...args] });
    if (file === candidate && args[0] === '-e') return candidateReport;
    if (file === 'node' && args[0] === '-e') {
      return result(0, null, JSON.stringify({ execPath: literalExecPath }));
    }
    if (file === candidate) return relaunch;
    throw new Error('unexpected fixture process');
  };
  return { calls, spawnSyncImpl };
}

function pathKeys(environment) {
  return Object.keys(environment).filter(name => name.toLowerCase() === 'path');
}

function fixtureSet() {
  const root = path.win32.join('C:', 'x4-forge-runtime-bootstrap-selftest');
  const home = path.win32.join(root, 'home');
  const current = path.win32.join(root, 'current', 'node.exe');
  const derived = path.win32.join(
    home,
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'node',
    'bin',
    'node.exe',
  );
  const explicit = path.win32.join(root, 'explicit', 'node.exe');
  const other = path.win32.join(root, 'other', 'node.exe');
  const cwd = path.win32.join(root, 'cwd');
  const script = path.win32.join(root, 'scripts', 'run-e2e.mjs');
  return { root, home, current, derived, explicit, other, cwd, script };
}

function baseOptions(api, fixtures, overrides = {}) {
  const safeVersion = overrides.safeVersion ?? true;
  const currentExecPath = overrides.currentExecPath ?? fixtures.current;
  const currentNodeVersion = overrides.currentNodeVersion ?? (safeVersion ? '24.19.0' : '24.15.0');
  const currentUvVersion = overrides.currentUvVersion ?? (safeVersion ? '1.52.1' : '1.51.0');
  const candidate = overrides.candidate ?? fixtures.derived;
  const candidateReport = overrides.candidateReport
    ?? result(0, null, JSON.stringify({ execPath: candidate, node: '24.19.0', uv: '1.52.1' }));
  const literalExecPath = overrides.literalExecPath ?? currentExecPath;
  const removed = [];
  const events = [];
  const logs = [];
  const files = overrides.files ?? [fixtures.current, fixtures.derived, fixtures.explicit, fixtures.other];
  const fsImpl = overrides.fsImpl ?? makeFs(files, removed, {
    events,
    removeFails: overrides.removeFails === true,
  });
  const spawn = overrides.spawn ?? makeSpawn(
    { candidate, candidateReport, literalExecPath, relaunch: overrides.relaunch },
    events,
  );
  const environment = overrides.env ?? { Path: path.win32.join(fixtures.root, 'other-bin') };
  const options = {
    platform: 'win32',
    cwd: fixtures.cwd,
    scriptPath: fixtures.script,
    args: ['--project', 'tests/e2e/sample.spec.ts'],
    env: environment,
    currentExecPath,
    currentNodeVersion,
    currentUvVersion,
    homedirImpl: () => fixtures.home,
    fsImpl,
    spawnSyncImpl: spawn.spawnSyncImpl,
    receiptPath: path.win32.join(fixtures.cwd, 'test-results', 'e2e-verdict.json'),
    receiptMutationPolicy: 'e2e',
    logImpl: message => logs.push(String(message)),
    ...overrides,
  };
  delete options.safeVersion;
  delete options.candidate;
  delete options.candidateReport;
  delete options.literalExecPath;
  delete options.files;
  delete options.relaunch;
  delete options.spawn;
  delete options.removeFails;
  return { options, removed, calls: spawn.calls, events, logs, api };
}

let api;
try {
  api = await import('./e2e-runtime-bootstrap.mjs');
} catch {
  check('runtime_bootstrap_module_loads', false);
  for (const item of checks) console.log(`${item.pass ? '  ok  ' : ' FAIL '}${item.name}`);
  console.log(`[e2e-runtime-bootstrap selftest] ${checks.filter(item => item.pass).length}/${checks.length}`);
  process.exit(1);
}

const fixtures = fixtureSet();
const safeReport = candidate => result(0, null, JSON.stringify({ execPath: candidate, node: '24.19.0', uv: '1.52.1' }));

{
  const run = baseOptions(api, fixtures, { currentExecPath: fixtures.current, safeVersion: true });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('safe_current_runs_directly', outcome.action === 'run');
  check('safe_current_does_not_relaunch', run.calls.filter(call => call.args[0] === fixtures.script).length === 0);
  check('safe_current_literal_node_matches', outcome.environment?.PATH?.split(';')[0] === path.win32.dirname(fixtures.current));
  check('safe_current_path_has_one_case_insensitive_key', pathKeys(outcome.environment ?? {}).length === 1);
  check('safe_current_full_run_preclears_receipt_once', outcome.action === 'run' && run.removed.length === 1);
}

{
  const run = baseOptions(api, fixtures, {
    receiptMutationPolicy: 'preserve',
    currentExecPath: fixtures.current,
    safeVersion: true,
    homedirImpl: () => { throw new Error('derived candidate must not be needed'); },
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('safe_current_does_not_require_derived_candidate', outcome.action === 'run'
    && run.calls.filter(call => call.args[0] === fixtures.script).length === 0);
  check('safe_current_selftest_preserves_receipt', outcome.action === 'run' && run.removed.length === 0);
}

{
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: safeReport(fixtures.derived),
    literalExecPath: fixtures.derived,
    relaunch: result(),
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  const relaunch = run.calls.at(-1);
  check('derived_candidate_relaunches_once', outcome.action === 'exit' && run.calls.filter(call => call.file === fixtures.derived && call.args[0] === fixtures.script).length === 1);
  check('derived_relaunch_preserves_args', JSON.stringify(relaunch?.args.slice(1)) === JSON.stringify(run.options.args));
  check('derived_relaunch_preserves_cwd', relaunch?.options.cwd === fixtures.cwd);
  check('derived_relaunch_path_first', relaunch?.options.env?.PATH?.split(';')[0] === path.win32.dirname(fixtures.derived));
  check('derived_relaunch_sets_private_marker', relaunch?.options.env?.X4_FORGE_E2E_RUNTIME_BOOTSTRAP_MARKER === '1');
  check('derived_relaunch_sets_expected_path', relaunch?.options.env?.X4_FORGE_E2E_RUNTIME_EXPECTED_EXEC_PATH === fixtures.derived);
  const removalIndex = run.events.findIndex(event => event.type === 'remove');
  const relaunchIndex = run.events.findIndex(event => event.type === 'spawn' && event.args[0] === fixtures.script);
  check('derived_relaunch_preclears_receipt_once', run.removed.length === 1 && removalIndex >= 0 && removalIndex < relaunchIndex);
}

{
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: safeReport(fixtures.derived),
    literalExecPath: fixtures.derived,
    relaunch: result(1),
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  const removalIndex = run.events.findIndex(event => event.type === 'remove');
  const relaunchIndex = run.events.findIndex(event => event.type === 'spawn' && event.args[0] === fixtures.script);
  check('relaunched_child_exit1_propagates_exact_exit1', outcome.action === 'exit' && outcome.exitCode === 1);
  check('relaunched_child_exit1_cleanup_happens_before_launch_once', run.removed.length === 1
    && removalIndex >= 0
    && removalIndex < relaunchIndex);
  check('relaunched_child_exit1_has_no_post_cleanup', run.removed.length === 1
    && run.events.at(-1)?.type === 'spawn'
    && outcome.action === 'exit');
}

{
  const run = baseOptions(api, fixtures, {
    receiptMutationPolicy: 'preserve',
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: safeReport(fixtures.derived),
    literalExecPath: fixtures.derived,
    relaunch: result(1),
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('selftest_relaunch_exit1_propagates', outcome.action === 'exit' && outcome.exitCode === 1);
  check('selftest_relaunch_preserves_receipt', run.removed.length === 0);
}

{
  const run = baseOptions(api, fixtures, {
    receiptMutationPolicy: 'preserve',
    env: {
      X4_FORGE_E2E_RUNTIME_BOOTSTRAP_MARKER: '0',
      X4_FORGE_E2E_RUNTIME_EXPECTED_EXEC_PATH: fixtures.current,
    },
    currentExecPath: fixtures.current,
    safeVersion: true,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('selftest_preflight_failure_preserves_receipt', outcome.action === 'refuse' && run.removed.length === 0);
}

{
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: safeReport(fixtures.derived),
    literalExecPath: fixtures.derived,
    removeFails: true,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('full_run_cleanup_failure_refuses_before_relaunch', outcome.action === 'refuse'
    && run.removed.length === 1
    && run.calls.filter(call => call.args[0] === fixtures.script).length === 0);
}

{
  const run = baseOptions(api, fixtures, {
    env: {
      Path: path.win32.join(fixtures.root, 'other-bin'),
      X4_FORGE_E2E_NODE_PATH: fixtures.explicit,
    },
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.explicit,
    candidateReport: safeReport(fixtures.explicit),
    literalExecPath: fixtures.explicit,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('explicit_candidate_wins', outcome.action === 'exit' && run.calls[0]?.file === fixtures.explicit);
  check('explicit_candidate_override_not_in_child_env', !Object.keys(run.calls.at(-1)?.options?.env ?? {}).some(name => name.toLowerCase() === 'x4_forge_e2e_node_path'));
}

{
  const markedEnvironment = {
    Path: path.win32.join(fixtures.root, 'other-bin'),
    X4_FORGE_E2E_RUNTIME_BOOTSTRAP_MARKER: '1',
    X4_FORGE_E2E_RUNTIME_EXPECTED_EXEC_PATH: fixtures.current,
  };
  const run = baseOptions(api, fixtures, {
    env: markedEnvironment,
    currentExecPath: fixtures.current,
    safeVersion: true,
    literalExecPath: fixtures.current,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('valid_relaunched_child_runs_directly', outcome.action === 'run');
  check('valid_relaunched_child_does_not_recurse', run.calls.filter(call => call.file === fixtures.current).length === 0);
}

for (const [name, env] of [
  ['bad_marker_value', { X4_FORGE_E2E_RUNTIME_BOOTSTRAP_MARKER: '0', X4_FORGE_E2E_RUNTIME_EXPECTED_EXEC_PATH: fixtures.current }],
  ['missing_expected_marker_path', { X4_FORGE_E2E_RUNTIME_BOOTSTRAP_MARKER: '1' }],
  ['expected_path_mismatch', { X4_FORGE_E2E_RUNTIME_BOOTSTRAP_MARKER: '1', X4_FORGE_E2E_RUNTIME_EXPECTED_EXEC_PATH: fixtures.other }],
]) {
  const run = baseOptions(api, fixtures, { env, currentExecPath: fixtures.current, safeVersion: true });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check(`${name}_refuses`, outcome.action === 'refuse' && run.calls.length === 0 && run.removed.length === 1);
}

for (const [name, candidateReport, spawnOverrides] of [
  ['candidate_missing', null, { files: [fixtures.current] }],
  ['candidate_identity_mismatch', safeReport(fixtures.other), {}],
  ['candidate_unsafe_version', result(0, null, JSON.stringify({ execPath: fixtures.derived, node: '24.15.0', uv: '1.51.0' })), {}],
  ['candidate_malformed_probe', result(0, null, '{not-json'), {}],
  ['candidate_timeout', result(null, null, ''), {}],
  ['candidate_spawn_error', { status: null, signal: null, error: new Error('fixture'), stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }, {}],
  ['candidate_signal', result(null, 'SIGTERM', ''), {}],
]) {
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: candidateReport ?? safeReport(fixtures.derived),
    literalExecPath: fixtures.derived,
    ...spawnOverrides,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check(`${name}_refuses_before_relaunch`, outcome.action === 'refuse' && run.calls.filter(call => call.args[0] === fixtures.script).length === 0 && run.removed.length === 1);
  check(`${name}_cleans_exact_receipt_with_force`, outcome.action === 'refuse'
    && run.removed[0]?.value === run.options.receiptPath
    && run.removed[0]?.options?.force === true);
}

{
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: safeReport(fixtures.derived),
    literalExecPath: fixtures.other,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('literal_node_mismatch_refuses_before_relaunch', outcome.action === 'refuse' && run.calls.filter(call => call.args[0] === fixtures.script).length === 0);
}

for (const [name, env] of [
  ['relative_override', { X4_FORGE_E2E_NODE_PATH: 'node.exe' }],
  ['non_string_override', { X4_FORGE_E2E_NODE_PATH: 7 }],
]) {
  const run = baseOptions(api, fixtures, { env, currentExecPath: fixtures.current, safeVersion: false });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check(`${name}_is_authoritative_and_refuses`, outcome.action === 'refuse' && run.calls.length === 0);
}

{
  const env = Object.create({ X4_FORGE_E2E_NODE_PATH: fixtures.other });
  env.Path = path.win32.join(fixtures.root, 'other-bin');
  const run = baseOptions(api, fixtures, { env, currentExecPath: fixtures.current, safeVersion: false });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('hostile_prototype_env_refuses', outcome.action === 'refuse' && run.calls.length === 0);
}

{
  const env = {};
  Object.defineProperty(env, 'Path', { enumerable: true, get: () => path.win32.join(fixtures.root, 'other-bin') });
  const run = baseOptions(api, fixtures, { env, currentExecPath: fixtures.current, safeVersion: false });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('accessor_env_refuses', outcome.action === 'refuse' && run.calls.length === 0);
}

{
  const normalized = api.normalizeE2eEnvironment(
    { Path: 'C:\\one;C:\\two', PATH: 'C:\\one;C:\\two' },
    path.win32.dirname(fixtures.current),
    { platform: 'win32' },
  );
  check('identical_case_insensitive_path_keys_dedupe', normalized.ok && pathKeys(normalized.environment).length === 1);
  check('deduped_path_runtime_directory_first', normalized.environment?.PATH?.split(';')[0] === path.win32.dirname(fixtures.current));
}

{
  const run = baseOptions(api, fixtures, {
    env: { Path: 'C:\\one', PATH: 'C:\\two' },
    currentExecPath: fixtures.current,
    safeVersion: false,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('conflicting_case_insensitive_path_keys_refuse', outcome.action === 'refuse' && run.calls.length === 0);
}

{
  const run = baseOptions(api, fixtures, {
    platform: 'linux',
    env: Object.create({ PATH: 'hostile' }),
    currentExecPath: 'not-used',
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('non_windows_remains_direct', outcome.action === 'run' && outcome.environment === undefined && run.calls.length === 0);
}

{
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: safeReport(fixtures.derived),
    literalExecPath: fixtures.derived,
    relaunch: result(null, 'SIGTERM', ''),
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('abnormal_relaunch_refuses_and_cleans_receipt', outcome.action === 'refuse' && run.removed.length === 1);
}

{
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    candidate: fixtures.derived,
    candidateReport: safeReport(fixtures.derived),
    literalExecPath: fixtures.derived,
    relaunch: result(2),
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('abnormal_relaunch_status_refuses_and_cleans_receipt', outcome.action === 'refuse' && run.removed.length === 1);
}

{
  const run = baseOptions(api, fixtures, {
    receiptMutationPolicy: 'preserve',
    env: { Path: 'C:\\one', BAD_VALUE: 'line\nbreak' },
    currentExecPath: fixtures.current,
    safeVersion: false,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('environment_control_character_refuses', outcome.action === 'refuse' && run.calls.length === 0 && run.removed.length === 0);
}

{
  const env = { Path: 'C:\\one' };
  Object.defineProperty(env, 'BAD\u0001NAME', { enumerable: true, value: 'value' });
  const run = baseOptions(api, fixtures, {
    receiptMutationPolicy: 'preserve',
    env,
    currentExecPath: fixtures.current,
    safeVersion: false,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('environment_name_control_character_refuses', outcome.action === 'refuse' && run.calls.length === 0 && run.removed.length === 0);
}

{
  const run = baseOptions(api, fixtures, {
    currentExecPath: fixtures.current,
    safeVersion: false,
    files: [fixtures.current],
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('candidate_failure_has_actionable_bounded_hint', outcome.action === 'refuse'
    && run.logs.length === 1
    && run.logs[0].includes('X4_FORGE_E2E_NODE_PATH')
    && run.logs[0].includes('Node 24 node.exe')
    && run.logs[0].includes('libuv >=1.52.1')
    && !run.logs[0].includes(fixtures.root));
}

{
  const env = {};
  Object.defineProperty(env, 'Path', { enumerable: true, get: () => 'C:\\one' });
  const run = baseOptions(api, fixtures, {
    receiptMutationPolicy: 'preserve',
    env,
    currentExecPath: fixtures.current,
    safeVersion: false,
  });
  const outcome = api.bootstrapE2eRuntime(run.options);
  check('environment_failure_has_actionable_bounded_hint', outcome.action === 'refuse'
    && run.logs.length === 1
    && run.logs[0].includes('own string environment values')
    && run.logs[0].includes('one PATH key')
    && !run.logs[0].includes(fixtures.root));
}

{
  const originalEnvironment = { Path: 'C:\\one' };
  const normalized = api.normalizeE2eEnvironment(originalEnvironment, path.win32.dirname(fixtures.current), { platform: 'win32' });
  check('normalized_environment_is_fresh', normalized.ok && normalized.environment !== originalEnvironment);
  check('normalized_environment_has_one_path_key', normalized.ok && pathKeys(normalized.environment).length === 1);
}

const passed = checks.filter(item => item.pass).length;
for (const item of checks) console.log(`${item.pass ? '  ok  ' : ' FAIL '}${item.name}`);
console.log(`[e2e-runtime-bootstrap selftest] ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
