import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../lib/actionReceipt';
import { isSameOrDescendant } from '../lib/pathRoles';
import {
  inspectProjectCheckProposal, isProjectCheckRelativeFile, PROJECT_CHECKS_MAX_BYTES, PROJECT_CHECKS_PATH,
} from './projectCheckProposal';

const MAX_INPUT_FILES = 2048;
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

export interface ProjectCheckSetupInput {
  modId: string;
  sourceRoot: string;
  interpreterPath: string;
  /** Explicit trusted runtime files relative to the interpreter directory. */
  interpreterDependencies?: readonly string[];
}

type SetupFingerprint = { size: number; sha256: string };
type SetupStage = { root: string; assertOwned: () => void };

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function canonicalLocalPath(value: string): string {
  const root = path.parse(value).root;
  if (!path.isAbsolute(value) || (process.platform === 'win32' && !/^[A-Za-z]:[\\/]$/.test(root))
    || value.slice(root.length).includes(':')) {
    throw new Error('A local absolute setup path is required.');
  }
  const normalized = path.resolve(value);
  const real = fs.realpathSync.native(normalized);
  if (!samePath(real, normalized)) throw new Error('Setup path is an alias or symbolic link.');
  return real;
}

function relativeInput(root: string, relative: string): string {
  if (!isProjectCheckRelativeFile(relative)) throw new Error('Unsafe relative setup file path.');
  const result = canonicalLocalPath(path.resolve(root, relative));
  if (!isSameOrDescendant(result, root)) throw new Error('Setup file is outside its declared root.');
  return result;
}

function sameStats(a: fs.BigIntStats, b: fs.BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size
    && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function sameFile(a: fs.BigIntStats, b: fs.BigIntStats): boolean {
  return sameStats(a, b) && b.isFile() && b.nlink === 1n;
}

function distinctPaths(paths: readonly string[], limit: number): string[] {
  if (paths.length > limit) throw new Error('Too many project check setup files.');
  const distinct = new Map<string, string>();
  for (const file of paths) {
    if (!isProjectCheckRelativeFile(file)) throw new Error('Unsafe relative setup file path.');
    const key = file.toLowerCase();
    if (distinct.has(key) && distinct.get(key) !== file) throw new Error('Case-colliding project check setup files.');
    distinct.set(key, file);
  }
  return [...distinct.values()].sort();
}

function readSetupFile(file: string, maxBytes: number, consume: (chunk: Buffer) => void) {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n) throw new Error('Setup inputs must be regular, single-link files.');
  if (before.size > BigInt(maxBytes)) throw new Error('Project check setup exceeds its byte limit.');
  const flags = fs.constants.O_RDONLY | (process.platform === 'win32' ? 0 : fs.constants.O_NOFOLLOW);
  const fd = fs.openSync(file, flags);
  const hash = createHash('sha256');
  let size = 0;
  try {
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true }))) throw new Error('Setup file changed before reading.');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      size += count;
      if (size > maxBytes) throw new Error('Project check setup exceeds its byte limit.');
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      consume(chunk);
    }
    if (BigInt(size) !== before.size || !sameFile(before, fs.fstatSync(fd, { bigint: true }))) {
      throw new Error('Setup file changed while reading.');
    }
  } finally {
    fs.closeSync(fd);
  }
  return { before, fingerprint: { size, sha256: hash.digest('hex') } };
}

function copyChunk(fd: number, chunk: Buffer): void {
  let offset = 0;
  while (offset < chunk.length) {
    const count = fs.writeSync(fd, chunk, offset, chunk.length - offset);
    if (!count) throw new Error('Could not write the frozen project check input.');
    offset += count;
  }
}

function openStagedFile(stage: SetupStage, relative: string, mode: number): number {
  stage.assertOwned();
  const segments = relative.split('/');
  const name = segments.pop()!;
  let directory = stage.root;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    if (!fs.lstatSync(directory, { throwIfNoEntry: false })) fs.mkdirSync(directory, { mode: 0o700 });
    canonicalLocalPath(directory);
    if (!fs.lstatSync(directory).isDirectory()) throw new Error('Frozen project check directory changed.');
  }
  return fs.openSync(path.join(directory, name), 'wx', mode);
}

function inspectSetup(input: ProjectCheckSetupInput, stage?: SetupStage) {
  if (!input.modId || input.modId.length > 256) throw new Error('A bounded addressed mod ID is required.');
  const sourceRoot = canonicalLocalPath(input.sourceRoot);
  if (!fs.lstatSync(sourceRoot).isDirectory()) throw new Error('The project source must be a directory.');
  const interpreterPath = canonicalLocalPath(input.interpreterPath);
  if (process.platform === 'win32' && path.extname(interpreterPath).toLowerCase() !== '.exe') {
    throw new Error('The Windows interpreter must be an explicit .exe file.');
  }
  const interpreterRoot = path.dirname(interpreterPath);
  const interpreterName = path.basename(interpreterPath);
  if (stage && !isProjectCheckRelativeFile(interpreterName)) throw new Error('Unsafe interpreter file name.');
  const reads = new Map<string, fs.BigIntStats>();
  const staged = new Map<string, { file: string; fingerprint: SetupFingerprint }>();
  let remaining = MAX_INPUT_BYTES;

  function capture(file: string, relative: string, maxBytes = MAX_FILE_BYTES, retain = false) {
    const previous = stage && staged.get(relative.toLowerCase());
    if (previous && previous.file !== relative) throw new Error('Case-colliding frozen project check files.');
    let output: number | undefined;
    const chunks: Buffer[] = [];
    try {
      if (stage && !previous) output = openStagedFile(stage, relative, relative === `runtime/${interpreterName}` ? 0o700 : 0o600);
      const { before, fingerprint } = readSetupFile(file, Math.min(remaining, maxBytes), chunk => {
        if (retain) chunks.push(Buffer.from(chunk));
        if (output !== undefined) copyChunk(output, chunk);
      });
      const priorRead = reads.get(file);
      if (priorRead && !sameFile(priorRead, before)) throw new Error('Setup file changed between reads.');
      if (previous && (previous.fingerprint.size !== fingerprint.size || previous.fingerprint.sha256 !== fingerprint.sha256)) {
        throw new Error('Frozen project check input changed between reads.');
      }
      reads.set(file, before);
      if (stage) staged.set(relative.toLowerCase(), { file: relative, fingerprint });
      remaining -= fingerprint.size;
      return { fingerprint, bytes: Buffer.concat(chunks) };
    } finally {
      if (output !== undefined) fs.closeSync(output);
    }
  }

  const manifestPath = relativeInput(sourceRoot, PROJECT_CHECKS_PATH);
  const manifest = capture(manifestPath, `project/${PROJECT_CHECKS_PATH}`, PROJECT_CHECKS_MAX_BYTES, true);
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(manifest.bytes);
  const proposal = inspectProjectCheckProposal([{ path: PROJECT_CHECKS_PATH, kind: 'other', content }]);
  if (!proposal || proposal.status !== 'proposed' || proposal.manifestHash !== manifest.fingerprint.sha256) {
    throw new Error(proposal?.status === 'invalid' ? proposal.error : 'Manifest bytes are unavailable.');
  }
  const scripts = distinctPaths(proposal.checks.flatMap(check => [check.script, ...check.dependencies]), MAX_INPUT_FILES);
  const runtimeFiles = distinctPaths(input.interpreterDependencies ?? [], 128);
  if (scripts.length + runtimeFiles.length + 2 > MAX_INPUT_FILES) throw new Error('Too many project check setup files.');

  const setup = {
    version: 1,
    modId: input.modId,
    sourceRoot,
    manifest: { path: PROJECT_CHECKS_PATH, ...manifest.fingerprint },
    interpreter: {
      path: interpreterPath,
      ...capture(interpreterPath, `runtime/${interpreterName}`).fingerprint,
      dependencies: runtimeFiles.map(file => ({
        path: file, ...capture(relativeInput(interpreterRoot, file), `runtime/${file}`).fingerprint,
      })),
    },
    harness: scripts.map(file => ({
      path: file, ...capture(relativeInput(sourceRoot, file), `project/${file}`).fingerprint,
    })),
    checks: proposal.checks,
    ...(proposal.maxParallelChecks === undefined ? {} : { maxParallelChecks: proposal.maxParallelChecks }),
  };
  for (const [file, expected] of reads) {
    canonicalLocalPath(file);
    if (!sameFile(expected, fs.lstatSync(file, { bigint: true }))) throw new Error('Setup file changed during capture.');
  }
  return { setup: { ...setup, setupHash: createHash('sha256').update(canonicalJson(setup)).digest('hex') }, staged };
}

/** Read-only identity for review. The caller must resolve and authorize the subject separately. */
export function captureProjectCheckSetup(input: ProjectCheckSetupInput) {
  return inspectSetup(input).setup;
}

/** Stage only an approved setup, under a canonical runner-owned scratch parent. */
export function freezeProjectCheckSetup(input: ProjectCheckSetupInput, approvedSetupHash: string, scratchParent: string) {
  if (!/^[a-f0-9]{64}$/.test(approvedSetupHash)) throw new Error('A valid approved setup hash is required.');
  const parent = canonicalLocalPath(scratchParent);
  const source = canonicalLocalPath(input.sourceRoot);
  const runtime = path.dirname(canonicalLocalPath(input.interpreterPath));
  if (!fs.lstatSync(parent).isDirectory() || isSameOrDescendant(parent, source) || isSameOrDescendant(parent, runtime)) {
    throw new Error('Project check scratch must be a directory outside both input roots.');
  }
  const root = fs.mkdtempSync(path.join(parent, 'project-check-'));
  const owned = fs.lstatSync(root, { bigint: true });
  let disposed = false;
  const assertOwned = () => {
    if (disposed || !samePath(path.dirname(canonicalLocalPath(root)), parent)) {
      throw new Error('Frozen project check scratch is no longer owned.');
    }
    const current = fs.lstatSync(root, { bigint: true });
    if (!current.isDirectory() || current.dev !== owned.dev || current.ino !== owned.ino) {
      throw new Error('Frozen project check scratch is no longer owned.');
    }
  };
  const dispose = () => {
    if (disposed) return;
    assertOwned();
    fs.rmSync(root, { recursive: true, force: true });
    disposed = true;
  };
  try {
    assertOwned();
    const { setup, staged } = inspectSetup(input, { root, assertOwned });
    if (setup.setupHash !== approvedSetupHash) throw new Error('Project check setup no longer matches its approval.');
    const contents = new Map<string, Map<string, SetupFingerprint | undefined>>();
    for (const { file, fingerprint } of staged.values()) {
      let child = path.join(root, file);
      let entry: SetupFingerprint | undefined = fingerprint;
      while (child !== root) {
        const directory = path.dirname(child);
        const siblings = contents.get(directory) ?? new Map();
        siblings.set(path.basename(child), entry);
        contents.set(directory, siblings);
        child = directory;
        entry = undefined;
      }
    }
    const assertIntegrity = () => {
      assertOwned();
      const verified = new Map<string, fs.BigIntStats>();
      for (const [directory, expected] of contents) {
        canonicalLocalPath(directory);
        const directoryStamp = fs.lstatSync(directory, { bigint: true });
        if (!directoryStamp.isDirectory()) throw new Error('Frozen project check inventory changed.');
        verified.set(directory, directoryStamp);
        const actual = fs.readdirSync(directory, { withFileTypes: true });
        if (actual.length !== expected.size) throw new Error('Frozen project check inventory changed.');
        for (const entry of actual) {
          const fingerprint = expected.get(entry.name);
          if (!expected.has(entry.name) || (fingerprint ? !entry.isFile() : !entry.isDirectory())) {
            throw new Error('Frozen project check inventory changed.');
          }
          if (!fingerprint) continue;
          const file = canonicalLocalPath(path.join(directory, entry.name));
          const read = readSetupFile(file, fingerprint.size, () => {});
          if (read.fingerprint.sha256 !== fingerprint.sha256 || read.fingerprint.size !== fingerprint.size) {
            throw new Error('Frozen project check input changed.');
          }
          verified.set(file, read.before);
        }
      }
      for (const [name, stamp] of verified) {
        canonicalLocalPath(name);
        const current = fs.lstatSync(name, { bigint: true });
        if (!(stamp.isDirectory() ? current.isDirectory() && sameStats(stamp, current) : sameFile(stamp, current))) {
          throw new Error('Frozen project check input changed during verification.');
        }
      }
      assertOwned();
    };
    assertIntegrity();
    for (const check of setup.checks) {
      Object.freeze(check.args);
      Object.freeze(check.dependencies);
      Object.freeze(check.covers);
      Object.freeze(check);
    }
    Object.freeze(setup.checks);
    for (const file of [...setup.harness, ...setup.interpreter.dependencies]) Object.freeze(file);
    Object.freeze(setup.harness);
    Object.freeze(setup.interpreter.dependencies);
    Object.freeze(setup.interpreter);
    Object.freeze(setup.manifest);
    return Object.freeze({ setup: Object.freeze(setup), root, projectRoot: path.join(root, 'project'),
      interpreterPath: path.join(root, 'runtime', path.basename(setup.interpreter.path)), assertIntegrity, dispose });
  } catch (error) {
    try { dispose(); }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Project check freeze failed and scratch ownership could not be cleaned up.');
    }
    throw error;
  }
}
