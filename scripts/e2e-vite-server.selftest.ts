import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { startE2EViteServer } from '../tests/e2e/e2e-vite-server';

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

async function assertFrontendStyleSources(): Promise<void> {
  const cssPath = path.join(ROOT, 'src', 'index.css');
  const css = readFileSync(cssPath, 'utf8');
  const options = { base: path.dirname(cssPath), onDependency: () => undefined };
  const compiler = await compile(css, options);
  // Match the installed Vite plugin's source resolution, not a test-only glob.
  const sources = (compiler.root === 'none' ? [] : compiler.root === null
    ? [{ base: ROOT, pattern: '**/*', negated: false }]
    : [{ ...compiler.root, negated: false }]).concat(compiler.sources);
  const started = performance.now();
  const actual = new Scanner({ sources });
  const actualCandidates = actual.scan();
  const scanMs = performance.now() - started;
  const frontend = new Scanner({ sources: [
    { base: path.join(ROOT, 'src'), pattern: '**/*', negated: false },
    { base: ROOT, pattern: 'index.html', negated: false },
  ] });
  const expectedCandidates = frontend.scan();
  const fileKeys = (files: string[]) => files.map(file => path.resolve(file).toLowerCase()).sort();
  const expectedFiles = new Set(fileKeys(frontend.files));
  const outside = actual.files.filter(file => !expectedFiles.has(path.resolve(file).toLowerCase()));
  // Counterfactual retains the exact stylesheet/custom rules, changing detection only.
  const unrestricted = await compile(css.replace(' source("./")', '').replace('@source "../index.html";', ''), options);
  assert.equal(unrestricted.root, null, 'Old implicit source root is the negative control');
  const actualCss = compiler.build(expectedCandidates);
  assert.equal(actualCss, unrestricted.build(expectedCandidates), 'All frontend utility and custom CSS is unchanged');
  console.log(JSON.stringify({ frontendStyleSources: { scanMs, scannedFiles: actual.files.length,
    expectedFiles: frontend.files.length, candidates: actualCandidates.length,
    expectedCandidates: expectedCandidates.length, outsideFiles: outside.length,
    frontendCssSha256: createHash('sha256').update(actualCss).digest('hex') } }));
  assert.equal(outside.length, 0, `Non-frontend files must not affect stylesheet generation: ${outside.slice(0, 3).map(file => path.relative(ROOT, file)).join(', ')}`);
  assert.deepEqual(fileKeys(actual.files), fileKeys(frontend.files), 'Every frontend file remains scanned');
  assert.deepEqual(actualCandidates, expectedCandidates, 'Exact frontend candidate coverage, no documentation or evidence candidates');
}

async function main(): Promise<void> {
  await assertFrontendStyleSources();
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
