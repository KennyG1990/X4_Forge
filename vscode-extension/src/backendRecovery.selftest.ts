/** Real controller/authority code, controlled lifecycle only; no IDE or process recovery claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const controllerPath = path.join(__dirname, 'extension.ts');
const source = fs.readFileSync(controllerPath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const localRequire = createRequire(controllerPath);
const SAVED = `ws_${'a'.repeat(24)}`;
const DEFAULT = `ws_${'b'.repeat(24)}`;
let forbiddenAttempts = 0;

interface Context {
  globalState: { get<T>(key: string): T | undefined; update(key: string, value: unknown): Promise<void> };
}
interface StartupChild { exitCode: number | null; signalCode: NodeJS.Signals | null }
interface Handle { baseUrl: string; owned: boolean; token?: string; workspaceId?: string; clientId?: string; child?: StartupChild }
interface Probe {
  restart(context: Context, code: number | null): Promise<void>;
  start(context: Context): Promise<void>;
  restore(context: Context, panel: ReturnType<typeof restoredPanel>): Promise<void>;
  bootstrap(context: Context, handle: Handle, generation: number, exact?: string): Promise<void>;
  factory(fn: (context: Context, exact?: string) => Promise<Handle>): void;
  generation(): number;
  setCurrent(handle: Handle | null): void;
  current(): Handle | null;
  stop(): boolean;
  init(log: (line: string) => void): void;
  ensure(context: Context, exact?: string): Promise<Handle>;
  acquire(context: Context, exact?: string): Promise<Handle>;
  acquisition(
    probe: (url: string) => Promise<boolean>,
    spawn: (context: Context, generation: number, exact?: string) => Promise<Handle>,
    retire: (generation: number) => Promise<void>,
  ): void;
}
interface AcquisitionOptions {
  attachUrl?: string;
  scratch?: string;
  externalAvailable?: boolean;
  startupError?: Error;
  retirementError?: Error;
  child?: StartupChild;
}

function restoredPanel() {
  let onDispose: (() => void) | undefined;
  let disposed = false;
  let htmlAttempts = 0;
  const html: string[] = [];
  const reveals: unknown[][] = [];
  return {
    active: true,
    webview: {
      options: {},
      set html(value: string) {
        htmlAttempts++;
        if (disposed) throw new Error(htmlAttempts === 1 ? 'host rejected first panel write' : 'Webview is disposed');
        html.push(value);
      },
      onDidReceiveMessage: () => ({ dispose() {} }),
    },
    onDidChangeViewState: () => {},
    onDidDispose: (listener: () => void) => { onDispose = listener; },
    reveal: (...args: unknown[]) => {
      if (disposed) throw new Error('Cannot reveal a disposed panel');
      reveals.push(args);
    },
    close(deliverEvent = true) {
      assert(onDispose, 'The controller must track the panel before startup settles.');
      disposed = true;
      if (deliverEvent) onDispose();
    },
    get htmlAttempts() { return htmlAttempts; },
    html,
    reveals,
  };
}

function harness(saved: string | undefined, mode: 'ready' | 'missing' | 'wrong' = 'ready', owned = true) {
  const values = new Map<string, unknown>();
  if (saved !== undefined) values.set('x4forge.workspaceId', saved);
  const updates: unknown[] = [];
  const context: Context & { subscriptions: unknown[] } = { subscriptions: [], globalState: {
    get: <T>(key: string) => values.get(key) as T | undefined,
    update: async (key, value) => { updates.push(value); values.set(key, value); },
  } };
  const timers: { fn: () => void; delay: number }[] = [];
  const delays: number[] = [];
  const requests: { workspaceId?: string; header: string | null }[] = [];
  const information: string[] = [];
  const errors: string[] = [];
  const logs: string[] = [];
  const launchEnvironment: Record<string, string | undefined> = {};
  let attachUrl = 'http://127.0.0.1:3000';
  const externalProbes: string[] = [];
  const managedStarts: { context: Context; generation: number; exact: string | undefined }[] = [];
  const retirements: number[] = [];
  let launches = 0;
  let paused: Promise<void> | undefined;
  let afterProgress: (() => void) | undefined;
  let resume: (() => void) | undefined;
  const forbidden = () => {
    forbiddenAttempts++;
    throw new Error('The controller selftest attempted an actual external effect.');
  };
  const mutations = /^(?:write|append|mkdir|mkdtemp|rename|copy|cp|rm|unlink|rmdir|symlink|link|chmod|chown|truncate|createWrite|open)/;
  const readOnlyFs = new Proxy(fs, { get(target, key) {
    if (typeof key === 'string' && mutations.test(key)) return forbidden;
    if (key === 'promises') return new Proxy(fs.promises, { get(p, k) {
      return typeof k === 'string' && mutations.test(k) ? forbidden : Reflect.get(p, k);
    } });
    return Reflect.get(target, key);
  } });
  const vscode = { window: {
    showInformationMessage: async (message: string) => { information.push(message); },
    showErrorMessage: async (message: string) => { errors.push(message); return undefined; },
    withProgress: (_options: unknown, task: () => unknown) => {
      const result = task();
      return afterProgress ? Promise.resolve(result).then(value => {
        afterProgress?.();
        return value;
      }) : result;
    },
    createWebviewPanel: forbidden,
  }, workspace: { getConfiguration: () => ({ get: (key: string) => key === 'attachUrl' ? attachUrl : undefined }) },
  ProgressLocation: { Notification: 15 }, DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 } };
  const module = { exports: {} as { __probe?: Probe } };
  const allowed = new Set(['./panelBinding', './workspaceAuthorityHeaders', '../../shared/actionOperationId']);
  const sandbox = {
    module, exports: module.exports, __dirname: path.dirname(controllerPath), __filename: controllerPath,
    require: (id: string) => {
      if (id === 'vscode') return vscode;
      if (id === 'node:child_process') return { spawn: forbidden };
      if (id === 'node:fs') return readOnlyFs;
      if (id === 'node:net') return { createServer: forbidden, connect: forbidden, Socket: forbidden };
      if (id === 'node:os') return { cpus: forbidden };
      if (id === 'node:perf_hooks') return {
        performance: { now: forbidden, eventLoopUtilization: forbidden }, monitorEventLoopDelay: forbidden,
      };
      if (id === './nativePerformance') return { createNativePerformance: forbidden };
      if (id === './nativePerformanceHost') return { createNativePerformanceHost: forbidden };
      if (allowed.has(id) || id === 'node:crypto' || id === 'node:path') return localRequire(id);
      if (id.startsWith('./') || id.startsWith('../../shared/')) return {};
      throw new Error(`Unexpected controller import: ${id}`);
    },
    process: { pid: 1, platform: process.platform, env: launchEnvironment }, console, Headers, URL, Buffer,
    setTimeout: (fn: () => void, delay: number) => { timers.push({ fn, delay }); delays.push(delay); return timers.length; },
    clearTimeout: forbidden,
    fetch: async (url: string, init: RequestInit) => {
      assert.equal(url, 'http://127.0.0.1:1/api/agent/workspaces/bootstrap');
      const body = JSON.parse(String(init.body)) as { workspaceId?: string };
      requests.push({ workspaceId: body.workspaceId, header: new Headers(init.headers).get('x-workspace-id') });
      if (paused) await paused;
      if (mode === 'missing' && body.workspaceId === SAVED) return {
        ok: false, status: 404, json: async () => ({ code: 'WORKSPACE_NOT_FOUND' }),
      };
      return { ok: true, status: 200,
        json: async () => ({ workspaceId: mode === 'wrong' ? DEFAULT : body.workspaceId || DEFAULT }) };
    },
  };
  // These accessors exist only in memory; production exports and functions are unchanged.
  const access = `\nmodule.exports.__probe = {
    restart: autoRestartSidecar, start: startLocalBackend, restore: restoreStudioPanel,
    bootstrap: bindBackendWorkspace,
    ensure: ensureBackend,
    acquire: ensureBackendOnce,
    acquisition(probe, spawn, retire) {
      probeForge = probe; spawnSidecar = spawn; awaitManagedSidecarRetirement = retire;
    },
    factory(fn) { ensureBackendOnce = fn; },
    generation() { return backendStopGeneration; },
    setCurrent(handle) { backend = handle; },
    current() { return backend; },
    stop() { return stopOwnedSidecar('controller selftest'); },
    init(appendLine) {
      output = { appendLine, show() {} };
      statusItem = { show() {}, hide() {} };
    }
  };`;
  new vm.Script(compiled + access, { filename: controllerPath }).runInNewContext(sandbox, { timeout: 2000 });
  const probe = module.exports.__probe!;
  assert(probe);
  probe.init(line => logs.push(line));
  probe.factory(async (ctx, exact) => {
    launches++;
    const handle: Handle = { baseUrl: 'http://127.0.0.1:1', owned, ...(owned ? { token: 'fixture-only' } : {}) };
    await probe.bootstrap(ctx, handle, probe.generation(), exact);
    probe.setCurrent(handle);
    return handle;
  });
  return { probe, context, updates, requests, information, errors, logs, delays,
    externalProbes, managedStarts, retirements,
    afterProgress(callback: () => void) { afterProgress = callback; },
    get launches() { return launches; }, get saved() { return values.get('x4forge.workspaceId'); },
    pause() { paused = new Promise<void>(resolve => { resume = resolve; }); },
    resume() { resume?.(); paused = undefined; },
    async fire() { const timer = timers.shift(); assert(timer, 'No restart backoff was scheduled.'); timer.fn(); await new Promise<void>(resolve => setImmediate(resolve)); },
    async restart() { probe.setCurrent(null); const pending = probe.restart(context, 1); await this.fire(); await pending; },
    async acquire(options: AcquisitionOptions = {}, exact?: string) {
      attachUrl = options.attachUrl ?? 'http://127.0.0.1:3000';
      if (options.scratch !== undefined) launchEnvironment.X4_FORGE_DEV_SCRATCH_SETTINGS = options.scratch;
      probe.acquisition(async url => {
        externalProbes.push(url);
        return options.externalAvailable ?? true;
      }, async (ctx, generation, requested) => {
        managedStarts.push({ context: ctx, generation, exact: requested });
        if (options.startupError) throw options.startupError;
        return { baseUrl: 'http://127.0.0.1:1', owned: true, token: 'fixture-only', child: options.child };
      }, async generation => {
        retirements.push(generation);
        if (options.retirementError) throw options.retirementError;
      });
      return probe.acquire(context, exact);
    },
  };
}

const exitedDuringStartup = /exited during startup/;

const checks: { name: string; pass: boolean; detail?: string }[] = [];
async function check(name: string, run: () => Promise<void>) {
  const attemptsBefore = forbiddenAttempts;
  try {
    await run();
    assert.equal(forbiddenAttempts - attemptsBefore, 0, 'Controlled recovery attempted a forbidden external effect.');
    checks.push({ name, pass: true });
  }
  catch (error) { checks.push({ name, pass: false, detail: String(error) }); }
}

async function main() {
  for (const [scratch, attachUrl] of [
    ['1', undefined], ['1', 'http://127.0.0.1:4567'],
    ['', undefined], ['0', 'http://127.0.0.1:4567'], ['malformed', undefined],
  ] as const) {
    await check(`scratch_${JSON.stringify(scratch)}_skips_available_${attachUrl ? 'custom' : 'default'}_external_forge`, async () => {
      const h = harness(SAVED);
      const startupError = scratch === '1' ? undefined : new Error('Scratch launch marker rejected by managed startup.');
      const pending = h.acquire({ scratch, attachUrl, startupError });
      if (startupError) await assert.rejects(pending, error => error === startupError);
      else assert.equal((await pending).owned, true);
      assert.deepEqual(h.externalProbes, []);
      assert.deepEqual(h.retirements, [h.probe.generation()]);
      assert.equal(h.managedStarts.length, 1);
      assert.equal(h.managedStarts[0].context, h.context);
    });
  }
  for (const [attachUrl, expected] of [
    [undefined, 'http://127.0.0.1:3000'], [' http://127.0.0.1:4567/// ', 'http://127.0.0.1:4567'],
  ] as const) {
    await check(`ordinary_start_attaches_to_available_${attachUrl ? 'custom' : 'default'}_forge`, async () => {
      const h = harness(SAVED); const handle = await h.acquire({ attachUrl });
      assert.equal(handle.owned, false); assert.equal(handle.baseUrl, expected);
      assert.deepEqual(h.externalProbes, [expected]);
      assert.deepEqual(h.retirements, []); assert.deepEqual(h.managedStarts, []);
    });
  }
  for (const [attachUrl, expectedProbes] of [['', []], [undefined, ['http://127.0.0.1:3000']]] as const) {
    await check(`ordinary_${attachUrl === '' ? 'disabled_attach' : 'non_forge_response'}_starts_managed_sidecar`, async () => {
      const h = harness(SAVED); const handle = await h.acquire({ attachUrl, externalAvailable: false });
      assert.equal(handle.owned, true); assert.deepEqual(h.externalProbes, [...expectedProbes]);
      assert.deepEqual(h.retirements, [h.probe.generation()]); assert.equal(h.managedStarts.length, 1);
    });
  }
  await check('scratch_managed_startup_error_propagates_without_external_fallback', async () => {
    const h = harness(SAVED); const error = new Error('Managed startup failed.');
    await assert.rejects(h.acquire({ scratch: '1', startupError: error }), actual => actual === error);
    assert.deepEqual(h.externalProbes, []); assert.equal(h.managedStarts.length, 1);
  });
  await check('scratch_managed_start_keeps_exact_workspace_request', async () => {
    const h = harness(SAVED); await h.acquire({ scratch: '1' }, SAVED);
    assert.deepEqual(h.externalProbes, []); assert.equal(h.managedStarts[0].exact, SAVED);
  });
  await check('ordinary_exact_workspace_request_refuses_external_attachment', async () => {
    const h = harness(SAVED);
    await assert.rejects(h.acquire({}, SAVED), /already answers at the configured external address/);
    assert.deepEqual(h.externalProbes, ['http://127.0.0.1:3000']);
    assert.deepEqual(h.retirements, []); assert.deepEqual(h.managedStarts, []);
  });
  await check('scratch_waits_for_retirement_before_starting_managed_sidecar', async () => {
    const h = harness(SAVED); const error = new Error('Previous managed child has not retired.');
    await assert.rejects(h.acquire({ scratch: '1', retirementError: error }), actual => actual === error);
    assert.deepEqual(h.externalProbes, []); assert.deepEqual(h.retirements, [h.probe.generation()]);
    assert.deepEqual(h.managedStarts, []);
  });
  await check('watchdog_restores_exact_saved_workspace_without_a_panel', async () => {
    const h = harness(SAVED); await h.restart();
    assert.deepEqual(h.requests, [{ workspaceId: SAVED, header: SAVED }]);
    assert.equal(h.saved, SAVED); assert.equal(h.information.length, 1); assert.equal(h.errors.length, 0);
  });
  await check('watchdog_missing_saved_workspace_never_bootstraps_default', async () => {
    const h = harness(SAVED, 'missing'); await h.restart();
    assert.deepEqual(h.requests, [{ workspaceId: SAVED, header: SAVED }]);
    assert.equal(h.saved, SAVED); assert.equal(h.updates.length, 0);
    assert.equal(h.information.length, 0); assert.equal(h.errors.length, 1);
  });
  await check('manual_start_already_refuses_missing_saved_workspace', async () => {
    const h = harness(SAVED, 'missing'); await h.probe.start(h.context);
    assert.equal(h.requests.length, 1); assert.equal(h.saved, SAVED); assert.equal(h.errors.length, 1);
  });
  await check('wrong_success_identity_is_not_saved_or_reported_ready', async () => {
    const h = harness(SAVED, 'wrong'); await h.restart();
    assert.equal(h.updates.length, 0); assert.equal(h.saved, SAVED);
    assert.equal(h.information.length, 0); assert.equal(h.errors.length, 1);
  });
  await check('empty_saved_state_can_bootstrap_initial_workspace', async () => {
    const h = harness(undefined); await h.restart();
    assert.deepEqual(h.requests, [{ workspaceId: undefined, header: null }]); assert.equal(h.saved, DEFAULT);
  });
  await check('stop_during_backoff_cancels_restart', async () => {
    const h = harness(SAVED); const pending = h.probe.restart(h.context, 1);
    h.probe.stop(); await h.fire(); await pending;
    assert.equal(h.launches, 0); assert.equal(h.updates.length, 0); assert.equal(h.information.length, 0);
  });
  await check('stop_during_bootstrap_prevents_saved_state_update', async () => {
    const h = harness(SAVED); h.pause(); const pending = h.probe.restart(h.context, 1);
    await h.fire(); assert.equal(h.requests.length, 1); h.probe.stop(); h.resume(); await pending;
    assert.equal(h.updates.length, 0); assert.equal(h.information.length, 0);
  });
  await check('restart_budget_and_linear_backoff_remain_bounded', async () => {
    const h = harness(SAVED); await h.restart(); await h.restart(); await h.restart();
    h.probe.setCurrent(null); await h.probe.restart(h.context, 1);
    assert.deepEqual(h.delays, [1000, 2000, 3000]); assert.equal(h.launches, 3);
    assert(h.errors.some(message => message.includes('after 3 attempts')));
  });
  await check('watchdog_and_exact_manual_start_share_one_startup', async () => {
    const h = harness(SAVED); h.pause(); const restart = h.probe.restart(h.context, 1);
    await h.fire(); const manual = h.probe.start(h.context); h.resume(); await Promise.all([restart, manual]);
    assert.equal(h.launches, 1); assert.equal(h.requests.length, 1); assert.equal(h.saved, SAVED);
    assert.equal(h.errors.length, 0); assert.equal(h.information.length, 2);
  });
  await check('fresh_manual_start_joins_background_validation_startup', async () => {
    const h = harness(undefined);
    h.pause();
    const automatic = h.probe.ensure(h.context);
    assert.equal(h.requests.length, 1);
    const manual = h.probe.start(h.context);
    h.resume();
    const [handle] = await Promise.all([automatic, manual]);
    assert.equal(h.launches, 1);
    assert.deepEqual(h.requests, [{ workspaceId: undefined, header: null }]);
    assert.equal(handle.workspaceId, DEFAULT);
    assert.deepEqual(h.updates, [DEFAULT]);
    assert.deepEqual(h.errors, []);
    assert.deepEqual(h.information, ['X4 Forge: local backend is running.']);
  });
  await check('specific_manual_start_refuses_ordinary_workspace_fallback', async () => {
    const h = harness(SAVED, 'missing');
    h.pause();
    const automatic = h.probe.ensure(h.context);
    await h.probe.start(h.context);
    assert.match(h.errors[0], /different Forge backend startup/);
    assert.deepEqual(h.requests, [{ workspaceId: SAVED, header: SAVED }]);
    h.resume();
    await automatic;
    assert.equal(h.launches, 1);
    assert.equal(h.saved, DEFAULT);
    assert.deepEqual(h.information, []);
  });
  await check('joining_manual_start_refuses_ordinary_external_attachment', async () => {
    const h = harness(undefined, 'ready', false);
    const automatic = h.probe.ensure(h.context);
    const manual = h.probe.start(h.context);
    const [handle] = await Promise.all([automatic, manual]);
    assert.equal(handle.owned, false);
    assert.equal(h.launches, 1);
    assert.deepEqual(h.requests, []);
    assert.deepEqual(h.updates, []);
    assert.deepEqual(h.information, []);
    assert.match(h.errors[0], /externally managed/);
  });
  await check('stop_while_fresh_manual_start_is_joined_prevents_ready', async () => {
    const h = harness(undefined);
    h.pause();
    const automatic = h.probe.ensure(h.context);
    const manual = h.probe.start(h.context);
    h.probe.stop();
    h.resume();
    await assert.rejects(automatic, /Forge backend startup was stopped/);
    await manual;
    assert.equal(h.launches, 1);
    assert.deepEqual(h.updates, []);
    assert.deepEqual(h.errors, []);
    assert.deepEqual(h.information, []);
    await h.probe.start(h.context);
    assert.equal(h.launches, 2);
    assert.deepEqual(h.updates, [DEFAULT]);
    assert.deepEqual(h.information, ['X4 Forge: local backend is running.']);
  });
  await check('watchdog_does_not_claim_external_backend_as_owned', async () => {
    const h = harness(SAVED, 'ready', false); await h.restart();
    assert.equal(h.requests.length, 0); assert.equal(h.information.length, 0); assert.equal(h.errors.length, 1);
  });
  await check('restored_panel_binds_and_reveals_without_taking_focus', async () => {
    const h = harness(SAVED);
    const panel = restoredPanel();
    await h.probe.restore(h.context, panel);
    assert(panel.html[0]?.includes('http://127.0.0.1:1/'));
    assert.deepEqual(panel.reveals, [[undefined, true]]);
    assert.equal(h.errors.length, 0);
  });
  await check('restore_success_after_disposal_does_not_reveal_or_render_old_panel', async () => {
    const h = harness(SAVED);
    const panel = restoredPanel();
    h.pause();
    const pending = h.probe.restore(h.context, panel);
    panel.close();
    h.resume();
    await pending;
    assert.equal(panel.htmlAttempts, 0);
    assert.equal(panel.reveals.length, 0);
    assert.equal(h.errors.length, 0);
    const replacement = restoredPanel();
    await h.probe.restore(h.context, replacement);
    assert.deepEqual(replacement.reveals, [[undefined, true]]);
  });
  await check('restore_failure_after_disposal_preserves_original_in_log', async () => {
    const h = harness(SAVED);
    const panel = restoredPanel();
    h.probe.factory(async () => { throw new Error('sidecar startup failed'); });
    const pending = h.probe.restore(h.context, panel);
    panel.close();
    await pending;
    assert.equal(panel.htmlAttempts, 0);
    assert.equal(h.errors.length, 0);
    assert.equal(h.logs.filter(line => line.includes('sidecar startup failed')).length, 1);
  });
  await check('restore_failure_on_open_panel_renders_existing_fallback', async () => {
    const h = harness(SAVED);
    const panel = restoredPanel();
    h.probe.factory(async () => { throw new Error('sidecar startup failed'); });
    await h.probe.restore(h.context, panel);
    assert.equal(panel.htmlAttempts, 1);
    assert(panel.html[0]?.includes('Forge backend is offline'));
    assert.equal(h.errors.length, 1);
    assert(h.errors[0].includes('sidecar startup failed'));
  });
  await check('restore_logs_original_binding_error_when_host_rejects_fallback_before_disposal_event', async () => {
    const h = harness(SAVED);
    const panel = restoredPanel();
    h.pause();
    const pending = h.probe.restore(h.context, panel);
    panel.close(false);
    h.resume();
    await pending;
    assert.equal(panel.htmlAttempts, 2);
    const original = h.logs.findIndex(line => line.includes('host rejected first panel write'));
    assert(original >= 0 && h.logs.findIndex(line => line.includes('Webview is disposed')) > original);
    assert.equal(h.errors.length, 1);
    panel.close();
  });
  await check('child_exit_during_workspace_bootstrap_does_not_write_workspace', async () => {
    const h = harness(undefined);
    const child: StartupChild = { exitCode: null, signalCode: null };
    const handle: Handle = { baseUrl: 'http://127.0.0.1:1', owned: true, token: 'fixture-only', child };
    h.pause();
    const pending = h.probe.bootstrap(h.context, handle, h.probe.generation());
    child.exitCode = 1;
    h.resume();
    await assert.rejects(pending, exitedDuringStartup);
    assert.equal(handle.workspaceId, undefined);
    assert.deepEqual(h.updates, []);
    assert.equal(h.saved, undefined);
  });
  await check('signaled_child_does_not_start_fallback_after_missing_saved_workspace', async () => {
    const h = harness(SAVED, 'missing');
    const child: StartupChild = { exitCode: null, signalCode: null };
    const handle: Handle = { baseUrl: 'http://127.0.0.1:1', owned: true, token: 'fixture-only', child };
    h.pause();
    const pending = h.probe.bootstrap(h.context, handle, h.probe.generation());
    child.signalCode = 'SIGTERM';
    h.resume();
    await assert.rejects(pending, /exited during startup \(code SIGTERM\)/);
    assert.deepEqual(h.requests, [{ workspaceId: SAVED, header: SAVED }]);
    assert.deepEqual(h.updates, []);
    assert.equal(h.saved, SAVED);
  });
  await check('child_exit_during_workspace_save_does_not_report_ready', async () => {
    const h = harness(SAVED);
    const child: StartupChild = { exitCode: null, signalCode: null };
    const handle: Handle = { baseUrl: 'http://127.0.0.1:1', owned: true, token: 'fixture-only', child };
    const write = h.context.globalState.update;
    let writeStarted!: () => void;
    let resumeWrite!: () => void;
    const started = new Promise<void>(resolve => { writeStarted = resolve; });
    const resume = new Promise<void>(resolve => { resumeWrite = resolve; });
    h.context.globalState.update = async (key, value) => {
      writeStarted();
      await resume;
      await write(key, value);
    };
    h.probe.factory(async () => {
      await h.probe.bootstrap(h.context, handle, h.probe.generation(), SAVED);
      return handle;
    });
    const pending = h.probe.start(h.context);
    await started;
    child.exitCode = 9;
    resumeWrite();
    await pending;
    assert.equal(h.saved, SAVED);
    assert.deepEqual(h.updates, [SAVED]);
    assert.equal(handle.workspaceId, undefined);
    assert.equal(h.information.length, 0);
    assert.equal(h.errors.length, 1);
    assert.match(h.errors[0], exitedDuringStartup);
    assert.equal(h.logs.some(line => line.includes('workspace authority bound')), false);
  });
  await check('startup_never_publishes_an_exited_handle_and_allows_a_live_retry', async () => {
    const h = harness(SAVED);
    await assert.rejects(h.acquire({ scratch: '1', child: { exitCode: 1, signalCode: null } }, SAVED),
      exitedDuringStartup);
    assert.equal(h.probe.current(), null);
    const child: StartupChild = { exitCode: null, signalCode: null };
    const handle = await h.acquire({ scratch: '1', child }, SAVED);
    assert.equal(handle.child, child);
    assert.equal(h.probe.current(), handle);
    assert.equal(h.managedStarts.length, 2);
    assert.deepEqual(h.externalProbes, []);
  });
  await check('shared_ready_callback_does_not_render_a_disconnected_backend', async () => {
    const h = harness(SAVED);
    const panel = restoredPanel();
    h.probe.factory(async () => {
      const child: StartupChild = { exitCode: 1, signalCode: null };
      const handle: Handle = {
        baseUrl: 'http://127.0.0.1:1', owned: true, token: 'fixture-only', workspaceId: SAVED, child,
      };
      h.probe.setCurrent(handle);
      return handle;
    });
    await h.probe.restore(h.context, panel);
    assert.deepEqual(panel.reveals, []);
    assert.equal(panel.htmlAttempts, 1);
    assert.match(panel.html[0], /Forge backend is offline/);
    assert.equal(h.errors.length, 1);
    assert.match(h.errors[0], exitedDuringStartup);
  });
  await check('manual_start_checks_child_again_when_progress_wrapper_resolves', async () => {
    const h = harness(SAVED);
    const child: StartupChild = { exitCode: null, signalCode: null };
    const handle: Handle = {
      baseUrl: 'http://127.0.0.1:1', owned: true, token: 'fixture-only', workspaceId: SAVED, child,
    };
    h.probe.factory(async () => {
      h.probe.setCurrent(handle);
      return handle;
    });
    h.afterProgress(() => {
      child.exitCode = 1;
      h.probe.setCurrent(null);
    });
    await h.probe.start(h.context);
    assert.deepEqual(h.information, []);
    assert.equal(h.errors.length, 1);
    assert.match(h.errors[0], exitedDuringStartup);
  });
  await check('controlled_recovery_never_attempts_native_construction_or_resource_effects', async () => {
    assert.equal(forbiddenAttempts, 0);
  });
  console.log(JSON.stringify({ allPassed: checks.every(c => c.pass), passed: checks.filter(c => c.pass).length,
    sourceSha256: createHash('sha256').update(source).digest('hex'), compilerVersion: ts.version,
    total: checks.length, realControllerFunctions: true, controlledLifecycleOnly: true, compiledFilesWritten: 0, forbiddenAttempts, checks }));
  if (checks.some(c => !c.pass)) process.exitCode = 1;
}
const deadline = setTimeout(() => {
  console.error('BACKEND_RECOVERY_SELFTEST_INCOMPLETE: no complete verdict within 15 seconds.');
  process.exit(1);
}, 15_000);
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(deadline));
