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
type DeployFence = { at: string; boundary?: GameLogDeployBoundary };
type Cursor = {
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
  load: LoadRecord | null;
};

const cursors = new Map<string, Cursor>();

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

/** Read recent output and bounded load evidence from the same open log. */
export function readGameLogLoadEvidence(file: string, modIds: readonly string[], isFault: (line: string) => boolean, deploy?: DeployFence) {
  const mods = new Set(modIds);
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('X4 log is not a regular file.');
    const { size, mtimeMs } = stat;
    const fileIdentity = `dev:${stat.dev}:ino:${stat.ino}`;
    const identity = `${fileIdentity}:${stat.birthtimeMs}`;
    const tailStartByte = Math.max(0, size - TAIL_BYTES);
    const tail = readBytes(fd, tailStartByte, size - tailStartByte).toString('utf8');
    const fileKey = logPathKey(file);
    const cacheKey = JSON.stringify([fileKey, modIds, deploy]);
    const prior = cursors.get(cacheKey);
    const head = readBytes(fd, 0, Math.min(size, ANCHOR_BYTES));
    const end = readBytes(fd, Math.max(0, size - ANCHOR_BYTES), Math.min(size, ANCHOR_BYTES));
    const sameGeneration = prior?.identity === identity;
    const continuous = prior && sameGeneration && size >= prior.size
      && (size !== prior.size || mtimeMs === prior.mtimeMs)
      && head.subarray(0, prior.head.length).equals(prior.head)
      && readBytes(fd, Math.max(0, prior.size - ANCHOR_BYTES), prior.end.length).equals(prior.end);
    const boundary = deploy?.boundary;
    const boundaryInvalidated = !!(sameGeneration && (!continuous || prior.boundaryInvalidated));
    const newLog = !!deploy && stat.birthtimeMs > Date.parse(deploy.at);
    const trustedBoundary = boundary && !newLog && !boundaryInvalidated && boundary.fileIdentity === fileIdentity
      && logPathKey(boundary.logPath) === fileKey && size >= boundary.offset;
    let floor = !deploy || newLog ? 0 : trustedBoundary ? boundary.offset : null;
    // An unavailable deploy fence can only authorize evidence appended after the first observation.
    if (continuous && floor === null) floor = prior.floor ?? prior.size;
    const reuse = continuous && prior.floor === floor && size - prior.next <= SCAN_BYTES;
    const start = reuse ? prior.next : Math.max(floor ?? size, size - SCAN_BYTES);
    const from = reuse ? prior.from : start;
    let load = reuse && prior.load ? { ...prior.load } : null;
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
        if (oversized) skippedLine = true;
        if (newline === -1) {
          discardingLine ||= oversized;
          next = discardingLine ? size : start + at;
          break;
        }
        if (!discardingLine && !oversized) {
          const line = data.toString('utf8', at, endOfLine);
          const loading = /^\s*\[general\]\s+(?:[\d.:]+\s+)?loading extension\s+['"]?([a-z0-9_.-]+)(?=$|[\s'"])/i.exec(line)?.[1].toLowerCase();
          if (loading && mods.has(loading)) {
            load = { offset: start + at, fault: false };
            skippedLine = false;
          } else if (load && !load.fault && isFault(line)) {
            load.fault = true;
          }
        }
        discardingLine = false;
        at = newline + 1;
        next = start + at;
      }
    }

    cursors.delete(cacheKey);
    if (cursors.size >= CACHE_ENTRIES) cursors.delete(cursors.keys().next().value!);
    cursors.set(cacheKey, { identity, size, mtimeMs, head, end, from, next, discardingLine, skippedLine, floor, boundaryInvalidated, load });
    return {
      stat, tail, tailStartByte, from, bytesScanned, load,
      coverageLimited: skippedLine || next < size,
      deployCoverage: !deploy || newLog || !!trustedBoundary,
    };
  } finally {
    fs.closeSync(fd);
  }
}
