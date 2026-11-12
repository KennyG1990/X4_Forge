import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { startE2EViteServer } from '../tests/e2e/e2e-vite-server';
import { E2E_STATE_DIR, resolveE2eRuntime } from '../playwright.config';

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

async function main(): Promise<void> {
  const stateExisted = fs.existsSync(E2E_STATE_DIR);
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
    const backend = http.createServer((req, res) => {
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
      const proxyPort = proxy?.port;
      await proxy?.close();
      await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
      if (proxyPort !== undefined) await assertPortFree(proxyPort);
    }
    assert.deepEqual(snapshotEnvironment(), SENTINEL_ENV, 'compiled close restored the caller environment');
    assert.deepEqual(cacheNames(), originalCaches, 'all repeated/negative lifecycles preserve the initial cache set');
  } finally {
    restoreEnvironment(originalEnvironment);
    if (!stateExisted && fs.existsSync(E2E_STATE_DIR) && fs.readdirSync(E2E_STATE_DIR).length === 0) fs.rmdirSync(E2E_STATE_DIR);
  }
}

main()
  .then(() => console.log('[e2e-vite-server selftest] PASS'))
  .catch(error => {
    console.error(`[e2e-vite-server selftest] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
