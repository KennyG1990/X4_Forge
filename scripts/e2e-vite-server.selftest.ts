import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { startE2EViteServer } from '../tests/e2e/e2e-vite-server';
import { resolveE2eRuntime } from '../playwright.config';

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

async function main(): Promise<void> {
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
      const response = await fetch(`http://127.0.0.1:${proxy.port}/assets/compiled.js`);
      assert.equal(await response.text(), '/* exact compiled asset */');
      const missing = await fetch(`http://127.0.0.1:${proxy.port}/missing`);
      assert.equal(missing.status, 404, 'compiled backend refusal is preserved');
      assert.equal(await missing.text(), 'compiled backend missing');
    } finally {
      const proxyPort = proxy?.port;
      await proxy?.close();
      await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
      if (proxyPort !== undefined) await assertPortFree(proxyPort);
    }
    assert.deepEqual(snapshotEnvironment(), SENTINEL_ENV, 'compiled close restored the caller environment');
  } finally {
    restoreEnvironment(originalEnvironment);
  }
}

main()
  .then(() => console.log('[e2e-vite-server selftest] PASS'))
  .catch(error => {
    console.error(`[e2e-vite-server selftest] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
