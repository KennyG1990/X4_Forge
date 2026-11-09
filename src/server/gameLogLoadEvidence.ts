import fs from 'node:fs';
import path from 'node:path';

const TAIL_BYTES = 256 * 1024;
const SCAN_BYTES = 16 * 1024 * 1024;
const MAX_LINE_BYTES = 8192;
const ANCHOR_BYTES = 64;
const CACHE_ENTRIES = 16;

export interface GameLogDeployBoundary {
  logPath: string;
  fileIdentity: string;
  offset: number;
}

type LoadRecord = { offset: number; fault: boolean };
export type GameLogDeployFence = { at: string; boundary?: GameLogDeployBoundary };
type Cursor<T> = {
  identity: string;
  size: number;
  mtimeMs: number;
  head: Buffer;
  end: Buffer;
  from: number;
  next: number;
  discardingLine: boolean;
  skippedLine: boolean;
  floor: number | null;
  boundaryInvalidated: boolean;
  revision?: string;
  revisionFloor: number | null;
  revisionObservedAt?: number;
  invalidated?: boolean;
  evidence: T;
};

export type GameLogEvidenceFold<T> = {
  initial: () => T;
  copy: (value: T) => T;
  /** Return a new value when this line establishes a fresh coverage boundary. */
  line: (value: T, line: string, offset: number) => T | undefined;
  gap?: (value: T) => T;
};

function readBytes(fd: number, start: number, length: number): Buffer {
  const bytes = Buffer.allocUnsafe(length);
  let done = 0;
  while (done < length) {
    const count = fs.readSync(fd, bytes, done, length - done, start + done);
    if (!count) throw new Error('X4 log changed while it was being read.');
    done += count;
  }
  return bytes;
}

function logPathKey(file: string): string {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Each projection has a separate bounded cursor and retains no raw log text. */
export function createGameLogEvidenceReader<T>() {
  const cursors = new Map<string, Cursor<T>>();
  const invalidated = new Set<string>();
  const keyFor = (file: string, subject: unknown, deploy?: GameLogDeployFence) =>
    JSON.stringify([logPathKey(file), subject, deploy]);

  const invalidate = (file: string, subject: unknown, deploy?: GameLogDeployFence) => {
    const key = keyFor(file, subject, deploy);
    const prior = cursors.get(key);
    if (prior) {
      prior.invalidated = true;
      return;
    }
    if (invalidated.has(key)) return;
    if (invalidated.size >= CACHE_ENTRIES) invalidated.delete(invalidated.values().next().value!);
    invalidated.add(key);
  };

  const read = (file: string, subject: unknown, fold: GameLogEvidenceFold<T>, deploy?: GameLogDeployFence,
    { revision, includeTail = false, observationOnly = false }: { revision?: string; includeTail?: boolean; observationOnly?: boolean } = {}) =>
    scanGameLog(file, keyFor(file, subject, deploy), fold, cursors, invalidated, deploy, revision, includeTail, observationOnly);
  return { read, invalidate };
}

function scanGameLog<T>(file: string, cacheKey: string, fold: GameLogEvidenceFold<T>, cursors: Map<string, Cursor<T>>,
  invalidated: Set<string>, deploy: GameLogDeployFence | undefined, revision: string | undefined,
  includeTail: boolean, observationOnly: boolean) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('X4 log is not a regular file.');
    const { size, mtimeMs } = stat;
    const fileIdentity = `dev:${stat.dev}:ino:${stat.ino}`;
    const identity = `${fileIdentity}:${stat.birthtimeMs}`;
    const tailStartByte = Math.max(0, size - TAIL_BYTES);
    const tail = includeTail ? readBytes(fd, tailStartByte, size - tailStartByte).toString('utf8') : '';
    const fileKey = logPathKey(file);
    const prior = cursors.get(cacheKey);
    const head = readBytes(fd, 0, Math.min(size, ANCHOR_BYTES));
    const end = readBytes(fd, Math.max(0, size - ANCHOR_BYTES), Math.min(size, ANCHOR_BYTES));
    const sameGeneration = prior?.identity === identity;
    const sameAnchors = prior && sameGeneration && size >= prior.size
      && head.subarray(0, prior.head.length).equals(prior.head)
      && readBytes(fd, Math.max(0, prior.size - ANCHOR_BYTES), prior.end.length).equals(prior.end);
    const continuous = sameAnchors && (size !== prior.size || mtimeMs === prior.mtimeMs);
    const boundary = deploy?.boundary;
    const boundaryInvalidated = !!(sameGeneration && (!continuous || prior.boundaryInvalidated));
    const newLog = !!deploy && stat.birthtimeMs > Date.parse(deploy.at);
    const trustedBoundary = boundary && !newLog && !boundaryInvalidated && boundary.fileIdentity === fileIdentity
      && logPathKey(boundary.logPath) === fileKey && size >= boundary.offset;
    let floor = (!deploy && !observationOnly) || newLog ? 0 : trustedBoundary ? boundary.offset : null;
    const replacedWithOlderLog = observationOnly && !sameGeneration && prior?.revisionObservedAt !== undefined
      && stat.birthtimeMs <= prior.revisionObservedAt;
    const revised = invalidated.has(cacheKey) || prior?.invalidated || (prior && prior.revision !== revision)
      || (observationOnly && sameGeneration && !continuous) || replacedWithOlderLog;
    const revisionFloor = revised ? size : sameAnchors ? prior.revisionFloor : null;
    const revisionObservedAt = revised ? Date.now() : sameAnchors ? prior.revisionObservedAt : undefined;
    // An unavailable deploy fence can only authorize evidence appended after the first observation.
    if (continuous && floor === null) floor = prior.floor ?? prior.size;
    if (revisionFloor !== null) floor = Math.max(floor ?? 0, revisionFloor);
    const reuse = !revised && continuous && prior.floor === floor && size - prior.next <= SCAN_BYTES;
    const start = reuse ? prior.next : Math.max(floor ?? size, size - SCAN_BYTES);
    const from = reuse ? prior.from : start;
    let evidence = reuse ? fold.copy(prior.evidence) : fold.initial();
    let next = start;
    let discardingLine = reuse ? prior.discardingLine : start > 0 && readBytes(fd, start - 1, 1)[0] !== 10;
    let skippedLine = reuse ? prior.skippedLine : discardingLine;
    let bytesScanned = 0;

    if (floor !== null && size > start) {
      const data = readBytes(fd, start, size - start);
      bytesScanned = data.length;
      for (let at = 0; at < data.length;) {
        const newline = data.indexOf(10, at);
        const endOfLine = newline === -1 ? data.length : newline;
        const oversized = endOfLine - at > MAX_LINE_BYTES;
        if (oversized) {
          skippedLine = true;
          if (fold.gap) evidence = fold.gap(evidence);
        }
        if (newline === -1) {
          discardingLine ||= oversized;
          next = discardingLine ? size : start + at;
          break;
        }
        if (!discardingLine && !oversized) {
          const newBoundary = fold.line(evidence, data.toString('utf8', at, endOfLine), start + at);
          if (newBoundary !== undefined) {
            evidence = newBoundary;
            skippedLine = false;
          }
        }
        discardingLine = false;
        at = newline + 1;
        next = start + at;
      }
    }

    cursors.delete(cacheKey);
    if (cursors.size >= CACHE_ENTRIES) cursors.delete(cursors.keys().next().value!);
    cursors.set(cacheKey, { identity, size, mtimeMs, head, end, from, next, discardingLine, skippedLine,
      floor, boundaryInvalidated, revision, revisionFloor, revisionObservedAt, evidence });
    invalidated.delete(cacheKey);
    return {
      stat, tail, tailStartByte, from, bytesScanned, evidence,
      partialLinePending: discardingLine || next < size,
      coverageLimited: skippedLine || next < size,
      deployCoverage: !deploy || newLog || !!trustedBoundary,
    };
  } finally {
    fs.closeSync(fd);
  }
}

const loadReader = createGameLogEvidenceReader<LoadRecord | null>();

/** Read recent output and bounded load evidence from the same open log. */
export function readGameLogLoadEvidence(file: string, modIds: readonly string[], isFault: (line: string) => boolean, deploy?: GameLogDeployFence) {
  const mods = new Set(modIds);
  const { evidence: load, ...result } = loadReader.read(file, modIds, {
    initial: () => null,
    copy: value => value && { ...value },
    line: (load, line, offset) => {
      const loading = /^\s*\[general\]\s+(?:[\d.:]+\s+)?loading extension\s+['"]?([a-z0-9_.-]+)(?=$|[\s'"])/i.exec(line)?.[1].toLowerCase();
      if (loading && mods.has(loading)) return { offset, fault: false };
      if (load && !load.fault && isFault(line)) load.fault = true;
    },
  }, deploy, { includeTail: true });
  return { ...result, load };
}
