import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, type ViteDevServer } from 'vite';
import { configureProfileProxyCancellation } from '../../src/lib/profileProxyCancellation';
import { readE2eRunState } from '../../scripts/e2e-runtime-bootstrap.mjs';
import {
  E2E_API_PORT,
  E2E_TOKEN,
  E2E_VITE_ENV,
  E2E_WEB_PORT,
  E2E_STATE_DIR,
} from '../../playwright.config';

const E2E_VITE_HOST = '127.0.0.1';
const ENV_KEYS = Object.keys(E2E_VITE_ENV) as Array<keyof typeof E2E_VITE_ENV>;

export interface E2EViteServerOptions {
  rootDir?: string;
  port?: number;
  apiPort?: number;
  token?: string;
  compiled?: boolean;
}

export interface E2EViteServerHandle {
  port: number;
  cacheDir: string;
  server: ViteDevServer;
  close(): Promise<void>;
}

type EnvironmentSnapshot = Record<keyof typeof E2E_VITE_ENV, string | undefined>;

const CACHE_OWNER_FILE = '.e2e-vite-owner';
const MAX_CACHE_ENTRIES = 10_000;
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
type OwnedPath = { file: string; identity: fs.Stats };

function sameIdentity(actual: fs.Stats, expected: fs.Stats): boolean {
  return actual.dev === expected.dev && actual.ino === expected.ino && actual.birthtimeMs === expected.birthtimeMs;
}

function assertPhysical(entry: OwnedPath): fs.Stats {
  const actual = fs.lstatSync(entry.file);
  if (actual.isSymbolicLink() || !sameIdentity(actual, entry.identity)) {
    throw new Error(`E2E Vite cache cleanup refused changed/linked path: ${entry.file}`);
  }
  return actual;
}

/** One cache owner inside the existing per-run state; never the shared dependency root. */
function createCacheOwner(): { dir: string; retire(): void } {
  const state = path.resolve(E2E_STATE_DIR);
  if (path.resolve(readE2eRunState(process.env).stateDir) !== state) {
    throw new Error('E2E Vite cache requires the current bootstrap-owned state.');
  }
  const parent: OwnedPath = { file: state, identity: fs.lstatSync(state) };
  if (!parent.identity.isDirectory() || parent.identity.isSymbolicLink()) {
    throw new Error(`E2E Vite cache requires a physical state directory: ${state}`);
  }
  const dir = fs.mkdtempSync(path.join(state, 'vite-cache-'));
  const root: OwnedPath = { file: dir, identity: fs.lstatSync(dir) };
  const marker = randomUUID();
  const markerPath = path.join(dir, CACHE_OWNER_FILE);
  fs.writeFileSync(markerPath, marker, { flag: 'wx' });
  const markerIdentity: OwnedPath = { file: markerPath, identity: fs.lstatSync(markerPath) };
  return {
    dir,
    retire() {
      assertPhysical(parent);
      assertPhysical(root);
      assertPhysical(markerIdentity);
      if (fs.readFileSync(markerPath, 'utf8') !== marker) {
        throw new Error(`E2E Vite cache cleanup refused foreign owner marker: ${dir}`);
      }
      // Inspect the whole tree before deleting anything. In particular never follow
      // a junction/symlink or remove a hardlinked file or an unbounded foreign tree.
      const entries: OwnedPath[] = [];
      let bytes = 0;
      const inspect = (folder: string): void => {
        for (const name of fs.readdirSync(folder)) {
          const file = path.join(folder, name);
          const identity = fs.lstatSync(file);
          if (identity.isSymbolicLink() || (!identity.isDirectory() && !identity.isFile()) || (identity.isFile() && identity.nlink !== 1)) {
            throw new Error(`E2E Vite cache cleanup refused linked/unknown entry: ${file}`);
          }
          entries.push({ file, identity });
          bytes += identity.isFile() ? identity.size : 0;
          if (entries.length > MAX_CACHE_ENTRIES || bytes > MAX_CACHE_BYTES) {
            throw new Error(`E2E Vite cache cleanup refused oversized tree: ${dir}`);
          }
          if (identity.isDirectory()) inspect(file);
        }
      };
      inspect(dir);
      assertPhysical(parent);
      assertPhysical(root);
      for (const entry of entries) assertPhysical(entry);
      // Children precede their parents on removal; no recursive delete can wander
      // into a replacement or linked subtree observed during the ownership check.
      for (const entry of entries.reverse()) {
        assertPhysical(parent);
        assertPhysical(root);
        const actual = assertPhysical(entry);
        if (actual.isDirectory()) fs.rmdirSync(entry.file);
        else fs.unlinkSync(entry.file);
      }
      fs.rmdirSync(dir);
      console.log(`[e2e-vite-cache] retired entries=${entries.length} bytes=${bytes} path=${dir}`);
    },
  };
}

function assertPort(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new RangeError(`${name} must be an integer between 0 and 65535`);
  }
}

function snapshotEnvironment(): EnvironmentSnapshot {
  return Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as EnvironmentSnapshot;
}

function applyEnvironment(apiPort: number, token: string): void {
  const desired = {
    ...E2E_VITE_ENV,
    API_PORT: String(apiPort),
    STUDIO_API_TOKEN: token,
    DISABLE_HMR: 'true',
  };
  for (const key of ENV_KEYS) process.env[key] = desired[key];
}

function restoreEnvironment(snapshot: EnvironmentSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function listeningPort(server: ViteDevServer): number {
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === 'string') {
    throw new Error('Vite did not expose a TCP listener after listen()');
  }
  if (!Number.isInteger(address.port) || address.port <= 0) {
    throw new Error('Vite exposed an invalid TCP listener port after listen()');
  }
  return address.port;
}

function startupError(error: unknown, cleanupError: unknown): Error {
  const startMessage = error instanceof Error ? error.message : String(error);
  if (cleanupError === undefined) return error instanceof Error ? error : new Error(startMessage);
  const closeMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
  return new Error(`Vite startup failed and cleanup failed: ${startMessage}; cleanup: ${closeMessage}`, {
    cause: error,
  });
}

async function stopViteServer(server: ViteDevServer): Promise<void> {
  // A scan can establish a writer after close's cancellation snapshot; onCrawlEnd
  // can also hold its result outside that snapshot. Drain the public request/scan/
  // dependency promises so esbuild's result and disposal finish before retirement.
  try {
    for (const environment of Object.values(server.environments)) {
      await environment.waitForRequestsIdle();
      const optimizer = environment.depsOptimizer;
      await optimizer?.scanProcessing;
      await Promise.all(Object.values(optimizer?.metadata.discovered ?? {}).map(dependency => dependency.processing));
    }
  } finally {
    await server.close();
  }
  if (server.httpServer?.listening) throw new Error('Vite shutdown unconfirmed; TCP listener remains active');
}

/**
 * Start the E2E UI server in the calling Playwright runner process.
 *
 * Source mode loads repository Vite config after applying the temporary environment.
 * Compiled mode loads no project config and forwards all bytes to the production
 * backend. Both retain one lifecycle and restore the caller environment on close.
 */
export async function startE2EViteServer(options: E2EViteServerOptions = {}): Promise<E2EViteServerHandle> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const configFile = path.join(rootDir, 'vite.config.ts');
  const port = options.port ?? E2E_WEB_PORT;
  const apiPort = options.apiPort ?? E2E_API_PORT;
  const token = options.token ?? E2E_TOKEN;
  const compiled = options.compiled === true;
  assertPort('Vite port', port);
  assertPort('API proxy port', apiPort);
  if (token.trim().length === 0) throw new Error('E2E Vite token must not be empty');
  if (compiled && apiPort === 0) throw new Error('Compiled E2E proxy requires a nonzero backend port');
  if (!compiled && !fs.existsSync(configFile)) throw new Error(`Vite config not found: ${configFile}`);

  const environment = snapshotEnvironment();
  const cache = createCacheOwner();
  let server: ViteDevServer | undefined;
  try {
    applyEnvironment(apiPort, token);
    server = await createServer({
      root: rootDir,
      configFile: compiled ? false : configFile,
      cacheDir: cache.dir,
      ...(compiled ? { envFile: false, appType: 'custom' as const, optimizeDeps: { noDiscovery: true, include: [] } } : {}),
      clearScreen: false,
      logLevel: 'error',
      server: {
        host: E2E_VITE_HOST,
        port,
        strictPort: true,
        hmr: false,
        watch: null,
        // Proxy every request to the compiled server. Its production owner serves
        // and authenticates the built HTML/assets; Vite applies no source transforms.
        ...(compiled ? { proxy: { '/': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, ws: false, configure: configureProfileProxyCancellation } } } : {}),
      },
    });
    await server.listen();
    const actualPort = listeningPort(server);
    let closePromise: Promise<void> | undefined;
    return {
      port: actualPort,
      cacheDir: cache.dir,
      server,
      close: () => {
        closePromise ??= (async () => {
          try {
            await stopViteServer(server!);
            cache.retire();
          } finally {
            restoreEnvironment(environment);
          }
        })();
        return closePromise;
      },
    };
  } catch (error) {
    let cleanupError: unknown;
    try {
      if (server === undefined) throw new Error(`No Vite handle acquired; cache preserved because shutdown is unconfirmed: ${cache.dir}`);
      await stopViteServer(server);
      cache.retire();
    } catch (closeError) {
      cleanupError = closeError;
    } finally {
      restoreEnvironment(environment);
    }
    throw startupError(error, cleanupError);
  }
}
