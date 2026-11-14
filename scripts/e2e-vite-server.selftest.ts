import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { createE2eRunStateOwner, E2E_RUN_STATE_ENV, readE2eRunState } from './e2e-runtime-bootstrap.mjs';
import { configureProfileProxyCancellation } from '../src/lib/profileProxyCancellation';

let startE2EViteServer: typeof import('../tests/e2e/e2e-vite-server').startE2EViteServer;
let E2E_STATE_DIR: string;
let resolveE2eRuntime: typeof import('../playwright.config').resolveE2eRuntime;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_KEYS = ['API_PORT', 'STUDIO_API_TOKEN', 'DISABLE_HMR'] as const;
const SENTINEL_ENV = {
  API_PORT: 'selftest-original-api-port',
  STUDIO_API_TOKEN: 'selftest-original-token',
  DISABLE_HMR: 'selftest-original-hmr',
};

type Listener = { port: number; close(): Promise<void> };
type SelftestEnvironment = Record<(typeof ENV_KEYS)[number], string | undefined>;

function snapshotEnvironment(): SelftestEnvironment {
  return Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as SelftestEnvironment;
}

function restoreEnvironment(snapshot: SelftestEnvironment): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setEnvironment(values: Record<(typeof ENV_KEYS)[number], string>): void {
  for (const key of ENV_KEYS) process.env[key] = values[key];
}

async function listen(port: number): Promise<Listener> {
  const listener = net.createServer();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      listener.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      listener.removeListener('error', onError);
      resolve();
    };
    listener.once('error', onError);
    listener.once('listening', onListening);
    listener.listen({ host: '127.0.0.1', port });
  });
  const address = listener.address();
  if (address === null || typeof address === 'string') {
    listener.close();
    throw new Error('selftest listener did not expose an address');
  }
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve())),
  };
}

async function assertPortFree(port: number): Promise<void> {
  const listener = await listen(port);
  await listener.close();
}

async function getText(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 10_000 }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.once('end', () => {
        if ((response.statusCode ?? 0) !== 200) {
          reject(new Error(`Vite readiness returned HTTP ${response.statusCode ?? 'unknown'}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.once('timeout', () => request.destroy(new Error('Vite readiness request timed out')));
    request.once('error', reject);
  });
}

function cacheNames(): string[] {
  return fs.existsSync(E2E_STATE_DIR) ? fs.readdirSync(E2E_STATE_DIR).filter(name => name.startsWith('vite-cache-')).sort() : [];
}

function retireTestCache(dir: string): void {
  assert.equal(path.dirname(dir), E2E_STATE_DIR, 'test cleanup is confined to the exact private state child');
  assert.match(path.basename(dir), /^vite-cache-/u);
  assert.equal(fs.lstatSync(dir).isSymbolicLink(), false);
  assert.equal(fs.lstatSync(E2E_STATE_DIR).isSymbolicLink(), false);
  // Called only after the actual server stopped and deliberate links/replacements
  // were restored below. This is the test fixture's cleanup, not a retry by the owner.
  fs.rmSync(dir, { recursive: true });
}

async function cleanupRefusals(apiPort: number): Promise<void> {
  const callerEnvironment = snapshotEnvironment();
  for (const kind of ['active', 'pretend', 'replaced', 'marker', 'linked', 'hardlinked'] as const) {
    const vite = await startE2EViteServer({ rootDir: ROOT, port: 0, apiPort, compiled: true });
    const originalClose = vite.server.close.bind(vite.server);
    const markerPath = path.join(vite.cacheDir, '.e2e-vite-owner');
    const marker = fs.readFileSync(markerPath, 'utf8');
    const moved = `${vite.cacheDir}-moved`;
    let foreign: string | undefined;
    const link = path.join(vite.cacheDir, 'foreign-link');
    try {
      if (kind === 'active') vite.server.close = async () => { throw new Error('selftest unconfirmed writer shutdown'); };
      if (kind === 'pretend') vite.server.close = async () => {};
      if (kind === 'replaced') {
        fs.renameSync(vite.cacheDir, moved);
        fs.mkdirSync(vite.cacheDir);
        fs.writeFileSync(markerPath, marker);
        fs.writeFileSync(path.join(vite.cacheDir, 'foreign.txt'), 'preserve replacement');
      }
      if (kind === 'marker') fs.writeFileSync(markerPath, 'foreign-owner');
      if (kind === 'linked' || kind === 'hardlinked') {
        foreign = fs.mkdtempSync(path.join(E2E_STATE_DIR, 'foreign-cache-control-'));
        const sentinel = path.join(foreign, 'sentinel.txt');
        fs.writeFileSync(sentinel, 'preserve outside bytes');
        if (kind === 'linked') fs.symlinkSync(foreign, link, 'junction');
        else fs.linkSync(sentinel, link);
      }
      const close = vite.close();
      assert.equal(vite.close(), close, `${kind}: close is once-only even on refusal`);
      await assert.rejects(close, /unconfirmed writer shutdown|shutdown unconfirmed|cleanup refused/u, `${kind}: preserve and report instead of deleting`);
      assert.equal(fs.existsSync(vite.cacheDir), true, `${kind}: cache is preserved`);
      assert.deepEqual(snapshotEnvironment(), callerEnvironment, `${kind}: environment is restored on refusal`);
      if (kind === 'active' || kind === 'pretend') assert.equal(vite.server.httpServer?.listening, true, 'active writer was not presented as stopped');
      else await assertPortFree(vite.port);
      if (kind === 'replaced') {
        assert.equal(fs.readFileSync(path.join(vite.cacheDir, 'foreign.txt'), 'utf8'), 'preserve replacement');
        assert.equal(fs.readFileSync(path.join(moved, '.e2e-vite-owner'), 'utf8'), marker, 'original cache also preserved');
      }
      if (foreign) assert.equal(fs.readFileSync(path.join(foreign, 'sentinel.txt'), 'utf8'), 'preserve outside bytes');
    } finally {
      vite.server.close = originalClose;
      await originalClose();
      await assertPortFree(vite.port);
      if (kind === 'replaced') {
        retireTestCache(vite.cacheDir);
        fs.renameSync(moved, vite.cacheDir);
      }
      if (kind === 'marker') fs.writeFileSync(markerPath, marker);
      if (foreign) {
        fs.unlinkSync(link);
        assert.equal(path.dirname(foreign), E2E_STATE_DIR);
        fs.rmSync(foreign, { recursive: true });
      }
      retireTestCache(vite.cacheDir);
    }
    console.log(`[e2e-vite-cache selftest] refusal=${kind} PASS`);
  }
}

// BEGIN BATCH3 native proxy test result type
type NativeProxyCheck = { name: string; pass: boolean; detail?: string };
// END BATCH3 native proxy test result type
function profileProxyListenerControls(nativeChecks?: NativeProxyCheck[]): void {
  class Upstream extends EventEmitter {
    destroyed = false;
    destroys = 0;
    throwOnDestroy = false;
    destroy() { this.destroys++; this.destroyed = true; if (this.throwOnDestroy) throw new Error('owned destroy failed'); return this; }
  }
  class Downstream extends EventEmitter { destroyed = false; writableFinished = false; }
  const proxy = new EventEmitter();
  configureProfileProxyCancellation(proxy as Parameters<typeof configureProfileProxyCancellation>[0]);
  const make = (method = 'POST', url = '/api/agent/performance/profile', before?: (upstream: Upstream, response: Downstream) => void) => {
    const upstream = new Upstream(); const response = new Downstream(); const request = new EventEmitter();
    const sentinel = () => {};
    for (const event of ['response', 'error', 'close']) upstream.on(event, sentinel);
    response.on('close', sentinel);
    before?.(upstream, response);
    proxy.emit('proxyReq', upstream, Object.assign(request, { method, url }), response);
    return { upstream, response, request, retired: () => {
      for (const event of ['response', 'error', 'close']) assert.deepEqual(upstream.listeners(event), [sentinel], `only owned ${event} listener retired`);
      assert.deepEqual(response.listeners('close'), [sentinel], 'unrelated response listener survives');
    } };
  };
  // BEGIN BATCH3 native proxy listener controls
  if (nativeChecks) {
    const attempt = (name: string, work: () => void) => {
      try { work(); nativeChecks.push({ name, pass: true }); }
      catch (error) { nativeChecks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) }); }
    };
    for (const [method, url] of [
      ['GET', '/api/agent/performance/native'], ['POST', '/api/agent/performance/native/collection'], ['POST', '/api/agent/performance/native/stop'],
    ] as const) {
      attempt(`native proxy ${method} ${url} owns pre-header disconnect once`, () => {
        const row = make(method, url);
        try {
          row.request.emit('end'); row.request.emit('close'); assert.equal(row.upstream.destroys, 0, 'request body completion is not cancellation');
          row.response.emit('close'); assert.equal(row.upstream.destroys, 1, 'downstream disconnect destroys exact upstream');
          row.retired(); row.response.emit('close'); assert.equal(row.upstream.destroys, 1, 'owned disconnect runs once');
        } finally { row.upstream.emit('response'); }
      });
      attempt(`native proxy ${method} ${url} retires pre-header listeners at headers`, () => {
        const row = make(method, url);
        try {
          assert.equal(row.response.listenerCount('close'), 2, 'native downstream cancellation owner is attached before headers');
          assert.equal(row.upstream.listenerCount('response'), 2, 'native upstream ownership is attached before retirement');
          row.upstream.emit('response'); row.retired(); row.response.emit('close'); assert.equal(row.upstream.destroys, 0, 'post-header lifetime belongs to Vite');
        }
        finally { row.upstream.emit('response'); }
      });
      attempt(`native proxy ${method} ${url} preserves completed response and unrelated listeners`, () => {
        const row = make(method, url);
        try {
          assert.equal(row.response.listenerCount('close'), 2, 'native downstream cancellation owner is attached before completion');
          row.response.writableFinished = true; row.response.emit('close'); assert.equal(row.upstream.destroys, 0); row.retired();
        }
        finally { row.upstream.emit('response'); }
      });
      attempt(`native proxy ${method} ${url} handles already disconnected and already destroyed endpoints`, () => {
        const downstream = make(method, url, (_upstream, response) => { response.destroyed = true; });
        const upstream = make(method, url, request => { request.destroyed = true; });
        try { assert.equal(downstream.upstream.destroys, 1); downstream.retired(); assert.equal(upstream.upstream.destroys, 0); upstream.retired(); }
        finally { downstream.upstream.emit('response'); upstream.upstream.emit('response'); }
      });
      attempt(`native proxy ${method} ${url} contains cleanup throws and retires only owned listeners`, () => {
        const row = make(method, url, request => { request.throwOnDestroy = true; });
        try { assert.doesNotThrow(() => row.response.emit('close')); assert.equal(row.upstream.destroys, 1); row.retired(); }
        finally { row.upstream.emit('response'); }
      });
    }
    for (const [method, url] of [
      ['POST', '/api/agent/performance/native'], ['PUT', '/api/agent/performance/native'],
      ['GET', '/api/agent/performance/native/collection'], ['GET', '/api/agent/performance/native/stop'],
      ['POST', '/api/agent/performance/native/collection-extra'], ['POST', '/api/agent/performance/native/stop/extra'],
      ['GET', '/api/agent/performance/native?unexpected=1'], ['POST', '/api/agent/performance/native/collection?unexpected=1'],
      ['POST', '/api/agent/performance/native/stop?unexpected=1'], ['post', '/api/agent/performance/native/stop'],
    ] as const) {
      attempt(`native proxy exact raw URL leaves ${method} ${url} unchanged`, () => {
        const row = make(method, url); row.retired(); row.response.emit('close'); assert.equal(row.upstream.destroys, 0);
      });
    }
    return;
  }
  // END BATCH3 native proxy listener controls
  const disconnected = make(); disconnected.response.emit('close');
  assert.equal(disconnected.upstream.destroys, 1); disconnected.retired();
  disconnected.response.emit('close'); assert.equal(disconnected.upstream.destroys, 1, 'disconnect is once-only');
  const normal = make(); normal.response.writableFinished = true; normal.response.emit('close');
  assert.equal(normal.upstream.destroys, 0, 'finished response is not cancelled'); normal.retired();
  const body = make(); body.request.emit('end'); body.request.emit('close');
  assert.equal(body.request.listenerCount('close'), 0, 'incoming request close is not owned');
  assert.equal(body.upstream.destroys, 0, 'body completion is not cancellation'); body.upstream.emit('response'); body.retired();
  body.response.emit('close'); assert.equal(body.upstream.destroys, 0, 'post-header handling belongs to Vite');
  for (const event of ['response', 'error', 'close']) {
    const completed = make(); completed.upstream.emit(event); completed.retired();
    completed.response.emit('close'); assert.equal(completed.upstream.destroys, 0, `${event} removes pre-header ownership`);
  }
  const alreadyGone = make('POST', '/api/agent/performance/profile', (_upstream, response) => { response.destroyed = true; });
  assert.equal(alreadyGone.upstream.destroys, 1); alreadyGone.retired();
  const upstreamGone = make('POST', '/api/agent/performance/profile', upstream => { upstream.destroyed = true; });
  assert.equal(upstreamGone.upstream.destroys, 0); upstreamGone.retired();
  const throwing = make('POST', '/api/agent/performance/profile', upstream => { upstream.throwOnDestroy = true; });
  assert.doesNotThrow(() => throwing.response.emit('close')); throwing.retired();
  for (const [method, url] of [['GET', '/api/agent/performance/profile'], ['PUT', '/api/agent/performance/profile'],
    ['POST', '/api/agent/performance/collection'], ['POST', '/api/agent/performance/profile/extra'],
    ['POST', '/api/agent/performance/profile?unexpected=1'], ['post', '/api/agent/performance/profile']]) {
    const untouched = make(method, url); untouched.retired(); untouched.response.emit('close');
    assert.equal(untouched.upstream.destroys, 0, `${method} ${url} retains existing behavior`);
  }
  console.log('[profile-proxy listener controls] PASS');
}
// BEGIN BATCH3 native proxy isolated entry
/** No Vite stack, state-root writer or listener is started by this focused mode. */
export function runNativePerformanceProxySelftest() {
  const checks: NativeProxyCheck[] = []; profileProxyListenerControls(checks);
  const passed = checks.filter(check => check.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
// END BATCH3 native proxy isolated entry

function profileProxyHttpControls() {
  type Row = { ready: Promise<void>; received: () => void; settled: Promise<void>; settle: () => void; bodyComplete: boolean; earlyClose: boolean; finished: boolean };
  const rows = new Map<string, Row>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const responses = new Set<http.ServerResponse>();
  const body = '{"probe":"owned-preheader-cancel"}';
  const bounded = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), 3000); })]); }
    finally { clearTimeout(timer); }
  };
  return {
    handle(req: http.IncomingMessage, res: http.ServerResponse): boolean {
      const id = req.headers['x-forge-profile-proxy-control'];
      const row = typeof id === 'string' ? rows.get(id) : undefined;
      if (!row) return false;
      let text = ''; let bytes = 0; let timer: ReturnType<typeof setTimeout> | undefined;
      responses.add(res);
      res.once('finish', () => { row.finished = true; });
      res.once('close', () => { clearTimeout(timer); if (timer) timers.delete(timer); responses.delete(res); row.earlyClose = !res.writableFinished; row.settle(); });
      req.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 64) { req.destroy(); return; } text += chunk.toString('utf8'); });
      req.once('end', () => {
        row.bodyComplete = req.complete && text === body; row.received();
        timer = setTimeout(() => { if (timer) timers.delete(timer); res.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' }).end('owned-profile-complete'); }, 500);
        timers.add(timer);
      });
      return true;
    },
    async run(apiPort: number, proxyPort: number): Promise<void> {
      const cases = [
        { id: 'direct-abort', port: apiPort, method: 'POST', path: '/api/agent/performance/profile', abort: true, early: true },
        { id: 'proxy-abort', port: proxyPort, method: 'POST', path: '/api/agent/performance/profile', abort: true, early: true },
        { id: 'direct-complete', port: apiPort, method: 'POST', path: '/api/agent/performance/profile', abort: false, early: false },
        { id: 'proxy-complete', port: proxyPort, method: 'POST', path: '/api/agent/performance/profile', abort: false, early: false },
        { id: 'other-route-abort', port: proxyPort, method: 'POST', path: '/api/agent/performance/collection', abort: true, early: false },
        { id: 'other-method-abort', port: proxyPort, method: 'PUT', path: '/api/agent/performance/profile', abort: true, early: false },
        // BEGIN BATCH3 native proxy actual HTTP controls
        { id: 'native-read-direct-abort', port: apiPort, method: 'GET', path: '/api/agent/performance/native', abort: true, early: true },
        { id: 'native-read-proxy-abort', port: proxyPort, method: 'GET', path: '/api/agent/performance/native', abort: true, early: true },
        { id: 'native-read-direct-complete', port: apiPort, method: 'GET', path: '/api/agent/performance/native', abort: false, early: false },
        { id: 'native-read-proxy-complete', port: proxyPort, method: 'GET', path: '/api/agent/performance/native', abort: false, early: false },
        { id: 'native-start-direct-abort', port: apiPort, method: 'POST', path: '/api/agent/performance/native/collection', abort: true, early: true },
        { id: 'native-start-proxy-abort', port: proxyPort, method: 'POST', path: '/api/agent/performance/native/collection', abort: true, early: true },
        { id: 'native-start-direct-complete', port: apiPort, method: 'POST', path: '/api/agent/performance/native/collection', abort: false, early: false },
        { id: 'native-start-proxy-complete', port: proxyPort, method: 'POST', path: '/api/agent/performance/native/collection', abort: false, early: false },
        { id: 'native-stop-direct-abort', port: apiPort, method: 'POST', path: '/api/agent/performance/native/stop', abort: true, early: true },
        { id: 'native-stop-proxy-abort', port: proxyPort, method: 'POST', path: '/api/agent/performance/native/stop', abort: true, early: true },
        { id: 'native-stop-direct-complete', port: apiPort, method: 'POST', path: '/api/agent/performance/native/stop', abort: false, early: false },
        { id: 'native-stop-proxy-complete', port: proxyPort, method: 'POST', path: '/api/agent/performance/native/stop', abort: false, early: false },
        { id: 'native-read-query-unowned', port: proxyPort, method: 'GET', path: '/api/agent/performance/native?unexpected=1', abort: true, early: false },
        { id: 'native-stop-wrong-method', port: proxyPort, method: 'GET', path: '/api/agent/performance/native/stop', abort: true, early: false },
        { id: 'native-stop-prefix-unowned', port: proxyPort, method: 'POST', path: '/api/agent/performance/native/stop-extra', abort: true, early: false },
        // END BATCH3 native proxy actual HTTP controls
      ];
      for (const sample of cases) {
        let received!: () => void; let settle!: () => void;
        const row: Row = { ready: new Promise(resolve => { received = resolve; }), received: () => received(), settled: new Promise(resolve => { settle = resolve; }), settle: () => settle(), bodyComplete: false, earlyClose: false, finished: false };
        rows.set(sample.id, row);
        const controller = new AbortController(); let headers = false; let clientRequest: http.ClientRequest | undefined;
        try {
          const client = new Promise<{ status?: number; body?: string; error?: string }>(resolve => {
            clientRequest = http.request({ host: '127.0.0.1', port: sample.port, path: sample.path, method: sample.method, agent: false, signal: controller.signal,
              headers: { 'Content-Length': Buffer.byteLength(body), 'x-forge-profile-proxy-control': sample.id } }, res => {
              headers = true; let content = ''; res.on('data', chunk => { content += chunk.toString(); });
              res.once('end', () => resolve({ status: res.statusCode, body: content }));
              res.once('error', error => resolve({ error: error.name }));
            });
            clientRequest.once('error', error => resolve({ error: error.name })); clientRequest.end(body);
          });
          await bounded(row.ready, `${sample.id} consumed body`); assert.equal(row.bodyComplete, true);
          if (sample.abort) { assert.equal(headers, false, 'abort occurs before headers'); assert.equal(row.finished, false); controller.abort(); }
          const result = await bounded(client, `${sample.id} client`); await bounded(row.settled, `${sample.id} backend`);
          if (sample.abort) assert.equal(result.error, 'AbortError');
          else { assert.equal(result.status, 200); assert.equal(result.body, 'owned-profile-complete'); }
          assert.equal(row.earlyClose, sample.early, `${sample.id}: scoped pre-header cancellation`);
          assert.equal(row.finished, !sample.early, `${sample.id}: normal completion is independent`);
        } finally { controller.abort(); clientRequest?.destroy(); }
      }
      // BEGIN BATCH3 native proxy actual count
      assert.equal(rows.size, cases.length); assert.equal(cases.length, 21); assert.equal(timers.size, 0); assert.equal(responses.size, 0);
      console.log(`[profile-proxy actual HTTP controls] PASS ${cases.length}/${cases.length}`);
      // END BATCH3 native proxy actual count
    },
    dispose() { for (const timer of timers) clearTimeout(timer); timers.clear(); for (const response of responses) response.destroy(); responses.clear(); },
  };
}

async function main(): Promise<void> {
  const stateOwner = createE2eRunStateOwner();
  process.env[E2E_RUN_STATE_ENV] = stateOwner.environment[E2E_RUN_STATE_ENV];
  try {
  ({ E2E_STATE_DIR, resolveE2eRuntime } = await import('../playwright.config'));
  ({ startE2EViteServer } = await import('../tests/e2e/e2e-vite-server'));
  assert.equal(E2E_STATE_DIR, stateOwner.stateDir, 'config and Vite imports consume one bootstrap root');
  assert.equal(readE2eRunState({ ...stateOwner.environment }).stateDir, E2E_STATE_DIR, 'worker-like consumer shares that root');
  profileProxyListenerControls();
  // BEGIN BATCH3 native proxy default coverage
  const nativeProxy = runNativePerformanceProxySelftest(); assert.equal(nativeProxy.allPassed, true, JSON.stringify(nativeProxy));
  // END BATCH3 native proxy default coverage
  const originalCaches = cacheNames();
  assert.equal(resolveE2eRuntime({}).mode, 'source');
  assert.equal(resolveE2eRuntime({ X4_FORGE_E2E_MODE: 'source' }).command, 'node node_modules/tsx/dist/cli.mjs server.ts');
  for (const mode of ['', 'COMPILED', ' compiled ', null, 1, true]) {
    assert.throws(() => resolveE2eRuntime({ X4_FORGE_E2E_MODE: mode }), /Invalid X4_FORGE_E2E_MODE/u);
  }
  const fakeBuild = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-e2e-compiled-contract-'));
  assert.equal(path.dirname(path.resolve(fakeBuild)), path.resolve(os.tmpdir()), 'recursive cleanup remains in the named temporary fixture base');
  try {
    assert.throws(() => resolveE2eRuntime({ X4_FORGE_E2E_MODE: 'compiled' }, fakeBuild), /physical dist\/server.cjs/u);
    fs.mkdirSync(path.join(fakeBuild, 'dist'));
    fs.writeFileSync(path.join(fakeBuild, 'dist/server.cjs'), 'never executed; mode resolution fixture');
    assert.throws(() => resolveE2eRuntime({ X4_FORGE_E2E_MODE: 'compiled' }, fakeBuild), /physical dist\/index.html/u);
    fs.mkdirSync(path.join(fakeBuild, 'dist/index.html'));
    assert.throws(() => resolveE2eRuntime({ X4_FORGE_E2E_MODE: 'compiled' }, fakeBuild), /physical dist\/index.html/u);
    fs.rmdirSync(path.join(fakeBuild, 'dist/index.html'));
    fs.writeFileSync(path.join(fakeBuild, 'dist/index.html'), '<html>never served</html>');
    const compiled = resolveE2eRuntime({ X4_FORGE_E2E_MODE: 'compiled' }, fakeBuild);
    assert.equal(compiled.command, 'node dist/server.cjs');
    assert.match(compiled.serverSha256!, /^[a-f0-9]{64}$/u);
  } finally { fs.rmSync(fakeBuild, { recursive: true, force: true }); }
  const originalEnvironment = snapshotEnvironment();
  setEnvironment(SENTINEL_ENV);
  let successfulPort: number | undefined;
  try {
    let vite: Awaited<ReturnType<typeof startE2EViteServer>> | undefined;
    try {
      vite = await startE2EViteServer({
        rootDir: ROOT,
        port: 0,
        apiPort: 0,
        token: 'x4forge-e2e-vite-selftest-token',
      });
      successfulPort = vite.port;
      assert(vite.port > 0, 'Vite selected a disposable listener port');
      assert.equal(vite.server.httpServer?.listening, true, 'Vite listener is ready');
      assert.equal(path.dirname(vite.cacheDir), E2E_STATE_DIR, 'cache belongs to private per-run state');
      assert.equal(path.resolve(vite.server.config.cacheDir), vite.cacheDir);
      assert.notEqual(vite.server.config.optimizeDeps.noDiscovery, true, 'source dependency discovery remains enabled');
      const html = await getText(vite.port);
      assert.match(html, /__STUDIO_API_TOKEN__/u, 'repository token plugin injected the E2E token');
      const resolvedServer = vite.server.config.server;
      assert.equal(resolvedServer.host, '127.0.0.1', 'Vite host is IPv4 loopback');
      assert.equal(resolvedServer.strictPort, true, 'Vite strictPort is preserved');
      assert.equal(resolvedServer.hmr, false, 'HMR is disabled');
      assert.equal(resolvedServer.watch, null, 'watch is disabled');
      const proxy = resolvedServer.proxy as Record<string, { target?: unknown }> | undefined;
      assert.equal(proxy?.['/api']?.target, 'http://127.0.0.1:0', 'API proxy uses the disposable API port');
      assert.equal(process.env.API_PORT, '0', 'Vite environment applied API proxy port');
      assert.equal(process.env.STUDIO_API_TOKEN, 'x4forge-e2e-vite-selftest-token', 'Vite environment applied token');
      assert.equal(process.env.DISABLE_HMR, 'true', 'Vite environment applied HMR flag');
    } finally {
      await vite?.close();
    }
    assert.equal(successfulPort !== undefined, true, 'successful lifecycle returned a port');
    await assertPortFree(successfulPort!);
    assert.deepEqual(snapshotEnvironment(), SENTINEL_ENV, 'successful close restored the caller environment');
    assert.deepEqual(cacheNames(), originalCaches, 'successful source close retires its cache');

    const occupied = await listen(0);
    try {
      await assert.rejects(
        startE2EViteServer({
          rootDir: ROOT,
          port: occupied.port,
          apiPort: 0,
          token: 'x4forge-e2e-vite-occupied-token',
        }),
        /already in use|EADDRINUSE/iu,
        'occupied Vite port is rejected fail-closed',
      );
    } finally {
      await occupied.close();
    }
    await assertPortFree(occupied.port);
    assert.deepEqual(snapshotEnvironment(), SENTINEL_ENV, 'failed startup restored the caller environment');
    assert.deepEqual(cacheNames(), originalCaches, 'occupied-port failure retires its cache after shutdown');

    const failedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-vite-config-failure-'));
    try {
      fs.writeFileSync(path.join(failedRoot, 'vite.config.ts'), "throw new Error('selftest original config failure');");
      await assert.rejects(startE2EViteServer({ rootDir: failedRoot, port: 0 }), (error: Error) => {
        assert.match(error.message, /selftest original config failure/u);
        assert.match(error.message, /No Vite handle acquired; cache preserved/u);
        assert.match(String(error.cause), /selftest original config failure/u);
        return true;
      });
      const preserved = cacheNames().filter(name => !originalCaches.includes(name));
      assert.equal(preserved.length, 1, 'unconfirmed startup reports and preserves its sole cache');
      const dir = path.join(E2E_STATE_DIR, preserved[0]);
      assert.deepEqual(fs.readdirSync(dir), ['.e2e-vite-owner'], 'top-level config failure started no dependency writer');
      retireTestCache(dir);
      assert.deepEqual(snapshotEnvironment(), SENTINEL_ENV, 'config failure restored caller environment');
    } finally {
      assert.equal(path.dirname(failedRoot), path.resolve(os.tmpdir()));
      fs.rmSync(failedRoot, { recursive: true });
    }

    const builtHtml = '<html><script>window.__STUDIO_API_TOKEN__="compiled-selftest"</script><body>Exact compiled HTML</body></html>';
    const cancellation = profileProxyHttpControls();
    const backend = http.createServer((req, res) => {
      if (cancellation.handle(req, res)) return;
      if (req.url === '/') res.writeHead(200, { 'Content-Type': 'text/html' }).end(builtHtml);
      else if (req.url === '/assets/compiled.js') res.writeHead(200, { 'Content-Type': 'application/javascript' }).end('/* exact compiled asset */');
      else res.writeHead(404, { 'Content-Type': 'text/plain' }).end('compiled backend missing');
    });
    await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
    const address = backend.address();
    assert(address !== null && typeof address !== 'string');
    let proxy: Awaited<ReturnType<typeof startE2EViteServer>> | undefined;
    try {
      proxy = await startE2EViteServer({ rootDir: ROOT, port: 0, apiPort: address.port, compiled: true, token: 'not-a-source-transform' });
      assert.equal(await getText(proxy.port), builtHtml, 'built HTML is forwarded byte-for-byte, without source token injection');
      assert.equal(proxy.server.config.configFile, undefined, 'compiled mode loads no project Vite config');
      assert.equal(proxy.server.config.inlineConfig.envFile, false);
      assert.equal(proxy.server.config.appType, 'custom');
      assert.equal(proxy.server.config.optimizeDeps.noDiscovery, true);
      assert.deepEqual(proxy.server.config.optimizeDeps.include, []);
      const response = await fetch(`http://127.0.0.1:${proxy.port}/assets/compiled.js`);
      assert.equal(await response.text(), '/* exact compiled asset */');
      const missing = await fetch(`http://127.0.0.1:${proxy.port}/missing`);
      assert.equal(missing.status, 404, 'compiled backend refusal is preserved');
      assert.equal(await missing.text(), 'compiled backend missing');
      await cancellation.run(address.port, proxy.port);
      assert.deepEqual(fs.readdirSync(proxy.cacheDir), ['.e2e-vite-owner'], 'compiled proxy never discovers/prebundles source dependencies');

      await proxy.close();
      await cleanupRefusals(address.port);
      for (let iteration = 0; iteration < 3; iteration++) {
        for (const compiled of [false, true]) {
          const before = cacheNames();
          const repeat = await startE2EViteServer({ rootDir: ROOT, port: 0, apiPort: address.port, compiled });
          await getText(repeat.port);
          const closing = repeat.close();
          assert.equal(repeat.close(), closing, 'successful close is once-only');
          await closing;
          await assertPortFree(repeat.port);
          // A prior broken owner removed its cache then allowed the dependency
          // scan to recreate it later. Observe after an event-loop interval too.
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.deepEqual(cacheNames(), before, `iteration${iteration} compiled=${compiled}: no accumulated cache`);
        }
      }
    } finally {
      cancellation.dispose();
      const proxyPort = proxy?.port;
      await proxy?.close();
      await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
      if (proxyPort !== undefined) await assertPortFree(proxyPort);
    }
    assert.deepEqual(snapshotEnvironment(), SENTINEL_ENV, 'compiled close restored the caller environment');
    assert.deepEqual(cacheNames(), originalCaches, 'all repeated/negative lifecycles preserve the initial cache set');
  } finally {
    restoreEnvironment(originalEnvironment);
  }
  } finally {
    try { stateOwner.retire(); } finally { delete process.env[E2E_RUN_STATE_ENV]; }
  }
}

// BEGIN BATCH3 native proxy CLI selection
const run = process.argv.includes('--native-performance-selftest') ? async () => {
  const result = runNativePerformanceProxySelftest(); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.allPassed) throw new Error('native proxy cancellation controls failed');
} : main;
// END BATCH3 native proxy CLI selection
run()
  .then(() => console.log('[e2e-vite-server selftest] PASS'))
  .catch(error => {
    console.error(`[e2e-vite-server selftest] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
