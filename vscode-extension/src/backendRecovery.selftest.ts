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
interface Handle { baseUrl: string; owned: boolean; token?: string; workspaceId?: string; clientId?: string }
interface Probe {
  restart(context: Context, code: number | null): Promise<void>;
  start(context: Context): Promise<void>;
  bootstrap(context: Context, handle: Handle, generation: number, exact?: string): Promise<void>;
  factory(fn: (context: Context, exact?: string) => Promise<Handle>): void;
  generation(): number;
  setCurrent(handle: Handle | null): void;
  stop(): boolean;
  init(log: (line: string) => void): void;
}

function harness(saved: string | undefined, mode: 'ready' | 'missing' | 'wrong' = 'ready', owned = true) {
  const values = new Map<string, unknown>();
  if (saved !== undefined) values.set('x4forge.workspaceId', saved);
  const updates: unknown[] = [];
  const context: Context = { globalState: {
    get: <T>(key: string) => values.get(key) as T | undefined,
    update: async (key, value) => { updates.push(value); values.set(key, value); },
  } };
  const timers: { fn: () => void; delay: number }[] = [];
  const delays: number[] = [];
  const requests: { workspaceId?: string; header: string | null }[] = [];
  const information: string[] = [];
  const errors: string[] = [];
  const logs: string[] = [];
  let launches = 0;
  let paused: Promise<void> | undefined;
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
    withProgress: (_options: unknown, task: () => unknown) => task(),
    createWebviewPanel: forbidden,
  }, ProgressLocation: { Notification: 15 }, DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 } };
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
    process: { pid: 1, platform: process.platform, env: {} }, console, Headers, URL, Buffer,
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
    restart: autoRestartSidecar, start: startLocalBackend,
    bootstrap: bindBackendWorkspace,
    factory(fn) { ensureBackendOnce = fn; },
    generation() { return backendStopGeneration; },
    setCurrent(handle) { backend = handle; },
    stop() { return stopOwnedSidecar('controller selftest'); },
    init(appendLine) { output = { appendLine, show() {} }; }
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
    get launches() { return launches; }, get saved() { return values.get('x4forge.workspaceId'); },
    pause() { paused = new Promise<void>(resolve => { resume = resolve; }); },
    resume() { resume?.(); paused = undefined; },
    async fire() { const timer = timers.shift(); assert(timer, 'No restart backoff was scheduled.'); timer.fn(); await new Promise<void>(resolve => setImmediate(resolve)); },
    async restart() { probe.setCurrent(null); const pending = probe.restart(context, 1); await this.fire(); await pending; },
  };
}

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
  await check('watchdog_does_not_claim_external_backend_as_owned', async () => {
    const h = harness(SAVED, 'ready', false); await h.restart();
    assert.equal(h.requests.length, 0); assert.equal(h.information.length, 0); assert.equal(h.errors.length, 1);
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
