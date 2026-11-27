import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface RustTreeEntry {
  path: string;
  kind: 'file' | 'directory';
  size: number;
  mtimeMs: number;
  sha256?: string;
  utf8?: boolean;
}

export interface RustTreeReport {
  ok: boolean;
  missing: boolean;
  totalBytes: number;
  entries: RustTreeEntry[];
}

export interface TryRustHashTreeOptions {
  checkUtf8?: boolean;
  allowMissing?: boolean;
  excludeDirs?: readonly string[];
  maxEntries?: number;
  maxBytes?: number;
}

export const RUST_TREE_MIN_BYTES = 8 * 1024 * 1024;
export const RUST_TREE_MIN_ENTRIES = 512;

let cachedEnvOverride: string | undefined;
let cachedBinPath: string | null | undefined;

export function isRustDisabled(): boolean {
  return process.env.X4_FORGE_DISABLE_RUST === '1';
}

export function isRustForced(): boolean {
  return process.env.X4_FORGE_FORCE_RUST === '1';
}

export function shouldUseRustForDirectory(rootPath: string): boolean {
  if (isRustDisabled() || !resolveRustX4ForgeBin()) return false;
  if (isRustForced()) return true;
  if (!fs.existsSync(rootPath)) return false;

  let entries = 0;
  let bytes = 0;
  const stack: string[] = [rootPath];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const child of children) {
      const abs = path.join(dir, child.name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(abs);
      } catch {
        return false;
      }
      if (stat.isSymbolicLink()) return false;
      entries++;
      if (entries >= RUST_TREE_MIN_ENTRIES) return true;
      if (stat.isDirectory()) {
        stack.push(abs);
      } else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes >= RUST_TREE_MIN_BYTES) return true;
      }
    }
  }
  return false;
}

function isExecutableFile(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function resolveRustX4ForgeBin(): string | null {
  if (isRustDisabled()) return null;

  const envOverride = (process.env.X4_FORGE_RUST_BIN || '').trim();
  if (cachedBinPath !== undefined && cachedEnvOverride === envOverride) {
    return cachedBinPath;
  }

  const exeName = process.platform === 'win32' ? 'x4forge.exe' : 'x4forge';
  if (envOverride) {
    cachedEnvOverride = envOverride;
    cachedBinPath = isExecutableFile(envOverride) ? envOverride : null;
    return cachedBinPath;
  }

  const anchors: string[] = [];
  const cwd = process.cwd();
  anchors.push(cwd);
  if (typeof __dirname === 'string' && __dirname) {
    anchors.push(__dirname);
  }

  const seen = new Set<string>();
  for (const anchor of anchors) {
    let dir = path.resolve(anchor);
    for (let depth = 0; depth < 5; depth++) {
      const releaseCandidate = path.join(dir, 'rust', 'target', 'release', exeName);
      if (!seen.has(releaseCandidate)) {
        seen.add(releaseCandidate);
        if (isExecutableFile(releaseCandidate)) {
          cachedEnvOverride = envOverride;
          cachedBinPath = releaseCandidate;
          return cachedBinPath;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  cachedEnvOverride = envOverride;
  cachedBinPath = null;
  return null;
}

export function tryRustHashTree(
  rootPath: string,
  opts: TryRustHashTreeOptions = {},
): RustTreeReport | null {
  if (isRustDisabled()) return null;
  const bin = resolveRustX4ForgeBin();
  if (!bin) return null;

  const args: string[] = ['hash-tree', rootPath];
  if (opts.checkUtf8) args.push('--check-utf8');
  if (opts.allowMissing) args.push('--allow-missing');
  if (opts.maxEntries !== undefined) {
    args.push('--max-entries', String(opts.maxEntries));
  }
  if (opts.maxBytes !== undefined) {
    args.push('--max-bytes', String(opts.maxBytes));
  }
  for (const excluded of opts.excludeDirs ?? []) {
    args.push('--exclude-dir', excluded);
  }

  try {
    const raw = execFileSync(bin, args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: 30_000,
    });
    const parsed = JSON.parse(raw) as Partial<RustTreeReport>;
    if (!parsed || parsed.ok !== true || !Array.isArray(parsed.entries)) {
      return null;
    }
    return {
      ok: true,
      missing: Boolean(parsed.missing),
      totalBytes: typeof parsed.totalBytes === 'number' ? parsed.totalBytes : 0,
      entries: parsed.entries,
    };
  } catch {
    return null;
  }
}
