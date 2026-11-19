import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { sameArtifactStamp } from '../lib/artifactPipeline';
import { readCanonicalMdProviderGeneration, type CanonicalMdCatalog } from '../lib/canonicalMdProviderCatalog';

export interface CanonicalMdCompiledWorkerIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly source: string;
}

const MAX_COMPILED_WORKER_BYTES = 1024n * 1024n;

/** Capture the reviewed CJS bytes once. A new process is required to admit a new worker. */
export function readCanonicalMdCompiledWorkerIdentity(ownerEntry: string): CanonicalMdCompiledWorkerIdentity {
  const owner = fs.realpathSync.native(path.resolve(ownerEntry));
  const dist = path.dirname(owner);
  if (path.basename(owner) !== 'server.cjs' || path.basename(dist) !== 'dist') {
    throw new Error('Unrecognized compiled canonical MD worker owner.');
  }
  const entry = path.join(dist, 'canonical-md-worker.cjs');
  const before = fs.lstatSync(entry, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || before.size === 0n || before.size > MAX_COMPILED_WORKER_BYTES
    || path.relative(entry, fs.realpathSync.native(entry))) {
    throw new Error('Compiled canonical MD worker must be a bounded physical file.');
  }

  const flags = process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
  const bytes = Buffer.alloc(Number(before.size));
  const fd = fs.openSync(entry, fs.constants.O_RDONLY | flags);
  try {
    if (!sameArtifactStamp(before, fs.fstatSync(fd, { bigint: true }))) {
      throw new Error('Compiled canonical MD worker changed before capture.');
    }
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!count) throw new Error('Compiled canonical MD worker ended during capture.');
      offset += count;
    }
    if (!sameArtifactStamp(before, fs.fstatSync(fd, { bigint: true }))
      || !sameArtifactStamp(before, fs.lstatSync(entry, { bigint: true }))) {
      throw new Error('Compiled canonical MD worker changed during capture.');
    }
  } finally { fs.closeSync(fd); }

  const source = bytes.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(bytes)) throw new Error('Compiled canonical MD worker must use valid UTF-8.');
  return Object.freeze({ path: entry, sha256: createHash('sha256').update(bytes).digest('hex'), source });
}

type Ready = Extract<CanonicalMdCatalog, { status: 'ready' }>;
type Run = {
  root: string;
  completion: Promise<CanonicalMdCatalog>;
  stopped: boolean;
  stop: (reason: string) => void;
};

const unavailable = (reason: string): CanonicalMdCatalog => ({ status: 'unavailable', reason });
const superseded = () => unavailable('Canonical MD preparation was superseded.');

function isCatalog(value: unknown): value is CanonicalMdCatalog {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CanonicalMdCatalog;
  if (candidate.status === 'unavailable') return typeof candidate.reason === 'string' && candidate.reason.length <= 512;
  if (candidate.status !== 'ready' || typeof candidate.root !== 'string' || !path.isAbsolute(candidate.root)
    || typeof candidate.generation !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.generation)
    || !Number.isInteger(candidate.logicalPaths) || candidate.logicalPaths < 1 || candidate.logicalPaths > 2048
    || !(candidate.providers instanceof Map) || candidate.providers.size > candidate.logicalPaths) return false;
  for (const [key, entry] of candidate.providers) {
    if (typeof key !== 'string' || !key || key.length > 32768) return false;
    if (entry === null) continue;
    if (!entry || typeof entry.name !== 'string' || entry.name.toLowerCase() !== key
      || typeof entry.relativePath !== 'string' || !entry.relativePath.startsWith('md/')
      || !/\.xml$/i.test(entry.relativePath) || /[\\:]/.test(entry.relativePath) || entry.relativePath.includes('\0')
      || entry.relativePath.split('/').some(part => !part || part === '.' || part === '..')) return false;
  }
  return true;
}

function launch(entryPath: string, root: string, timeoutMs: number, compiledWorker?: CanonicalMdCompiledWorkerIdentity): Run {
  const dir = path.dirname(entryPath);
  const source = path.basename(entryPath) === 'server.ts';
  if (!source && !compiledWorker) throw new Error('Unrecognized canonical MD worker owner.');
  const sourceEntry = path.join(dir, 'src/server/canonicalMdProviderWorker.ts');
  if (source) {
    const stat = fs.lstatSync(sourceEntry);
    if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || path.relative(sourceEntry, fs.realpathSync(sourceEntry))) {
      throw new Error('Canonical MD worker entry is unavailable.');
    }
  }
  const env: NodeJS.ProcessEnv = { TSX_DISABLE_CACHE: '1', NODE_DISABLE_COMPILE_CACHE: '1' };
  for (const name of ['SystemRoot', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[name]) env[name] = process.env[name];
  const sourceBootstrap = `const { workerData } = require('node:worker_threads');
    import(workerData.tsxApi).then(api => api.require(workerData.entry, workerData.anchor));`;
  const compiledBootstrap = `const { workerData } = require('node:worker_threads');
    const { createRequire } = require('node:module');
    const { dirname } = require('node:path');
    const { compileFunction } = require('node:vm');
    const { entry, source } = workerData;
    const ownedModule = { exports: {} };
    const run = compileFunction(source, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: entry });
    run(ownedModule.exports, createRequire(entry), ownedModule, entry, dirname(entry));`;
  const worker = new Worker(source ? sourceBootstrap : compiledBootstrap, {
    eval: true, execArgv: [], env, name: 'forge-canonical-md',
    workerData: source
      ? { root, entry: sourceEntry, anchor: entryPath, tsxApi: import.meta.resolve('tsx/cjs/api') }
      : { root, entry: compiledWorker!.path, source: compiledWorker!.source },
    resourceLimits: { maxOldGenerationSizeMb: 128 },
  });
  let reason: string | undefined;
  let response: CanonicalMdCatalog | undefined;
  let messages = 0;
  const stop = (why: string) => {
    if (reason) return;
    reason = why;
    void worker.terminate().catch(() => { /* only the exit event settles ownership */ });
  };
  const timer = setTimeout(() => stop('Canonical MD preparation exceeded its deadline.'), timeoutMs);
  const completion = new Promise<CanonicalMdCatalog>(resolve => {
    worker.on('message', value => {
      if (++messages !== 1 || !isCatalog(value)) stop('Canonical MD worker returned an invalid result.');
      else response = value;
    });
    worker.on('messageerror', () => stop('Canonical MD worker result could not be read.'));
    worker.on('error', () => { reason ??= 'Canonical MD worker failed.'; });
    worker.once('exit', code => {
      clearTimeout(timer);
      resolve(!reason && code === 0 && response ? response : unavailable(reason || 'Canonical MD worker exited without a result.'));
    });
  });
  return { root, completion, get stopped() { return reason !== undefined; }, stop };
}

/** One Worker and one prepared catalog, scoped to the owning backend's lifetime. */
export function createCanonicalMdProviderPreparation(
  ownerEntry: string,
  timeoutMs = 60_000,
  compiledWorker?: CanonicalMdCompiledWorkerIdentity,
) {
  const entryPath = path.resolve(ownerEntry);
  const pinnedWorker = path.basename(entryPath) === 'server.cjs'
    ? compiledWorker ?? readCanonicalMdCompiledWorkerIdentity(entryPath)
    : undefined;
  let desired = '';
  let closed = false;
  let active: Run | undefined;
  let prepared: Ready | undefined;

  function read(root: string): Ready | undefined {
    if (!prepared || closed || !root.trim() || path.resolve(root) !== desired) return;
    const current = readCanonicalMdProviderGeneration(desired);
    if (current?.root === prepared.root && current.generation === prepared.generation) return prepared;
    prepared = undefined;
  }

  function prepare(rootInput: string): Promise<CanonicalMdCatalog> {
    if (closed) return Promise.resolve(unavailable('Canonical MD preparation is closed.'));
    const root = rootInput.trim() ? path.resolve(rootInput) : '';
    if (root !== desired) { desired = root; prepared = undefined; }
    if (active) {
      if (active.root === root && !active.stopped) return active.completion;
      active.stop('Canonical MD preparation was superseded.');
      return active.completion.then(() => desired === root && !closed ? prepare(root) : superseded());
    }
    if (!root) return Promise.resolve(unavailable('Canonical corpus is not configured.'));
    const current = read(root);
    if (current) return Promise.resolve(current);
    let run: Run;
    try { run = launch(entryPath, root, timeoutMs, pinnedWorker); }
    catch { return Promise.resolve(unavailable('Canonical MD worker could not start.')); }
    run.completion = run.completion.then(result => {
      active = undefined;
      if (closed || desired !== root) return superseded();
      if (result.status !== 'ready') return result;
      const latest = readCanonicalMdProviderGeneration(root);
      if (latest?.root !== result.root || latest.generation !== result.generation) {
        return unavailable('Canonical MD inventory changed during preparation.');
      }
      prepared = result;
      return result;
    });
    active = run;
    return run.completion;
  }

  async function close(): Promise<void> {
    closed = true;
    prepared = undefined;
    active?.stop('Canonical MD preparation is closed.');
    await active?.completion;
  }

  return { prepare, read, close };
}
