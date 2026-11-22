/**
 * B115 W3A — atomic, content-verified persistence for authoritative action receipts.
 *
 * Receipt failures remain visible to mutating callers. History can reuse the same physical-path
 * and publication checks for verified blobs in its own directory.
 */

import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { dataPath } from './dataDir';
import {
  assertValidActionReceipt,
  canonicalizeActionReceiptAuthority,
  createPreparedActionReceipt,
  serializeActionReceipt,
  transitionActionReceipt,
  type ActionReceipt,
  type ActionReceiptPrepareInput,
  type ActionReceiptStatus,
  type ActionReceiptTransitionInput,
  ActionReceiptValidationError,
} from './actionReceipt';

export const ACTION_RECEIPT_STORE_DIR = 'action-receipts';
export const ACTION_RECEIPT_MAX_BYTES = 1024 * 1024;

export interface ActionReceiptStoreOptions {
  root?: string;
  now?: () => number;
}

export interface ActionReceiptStoreSuccess {
  ok: true;
  receipt: ActionReceipt;
}

/**
 * Result of the synchronous prepare existence/create decision.  The disposition is intentionally
 * separate from the legacy prepare return so a caller can fail closed on an existing prepared
 * receipt instead of replaying its mutation after a same-operation race.
 */
export interface ActionReceiptPrepareDisposition {
  receipt: ActionReceipt;
  created: boolean;
}

export interface ActionReceiptStoreFailure {
  ok: false;
  code: string;
  error: string;
}

export type ActionReceiptStoreResult = ActionReceiptStoreSuccess | ActionReceiptStoreFailure;

export class ActionReceiptStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ActionReceiptStoreError';
    this.code = code;
  }
}

function samePath(left: string, right: string): boolean {
  const a = path.normalize(left);
  const b = path.normalize(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function contained(root: string, candidate: string): boolean {
  const normalizedRoot = path.normalize(root);
  const normalizedCandidate = path.normalize(candidate);
  if (samePath(normalizedRoot, normalizedCandidate)) return true;
  const prefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
  return process.platform === 'win32'
    ? normalizedCandidate.toLowerCase().startsWith(prefix.toLowerCase())
    : normalizedCandidate.startsWith(prefix);
}

function validReceiptId(id: string): boolean {
  return /^ar_[a-f0-9]{64}$/.test(String(id || ''));
}

function errorDetails(error: unknown): { code: string; error: string } {
  if (error instanceof ActionReceiptStoreError) return { code: error.code, error: error.message };
  if (error instanceof ActionReceiptValidationError) return { code: error.code, error: error.message };
  return { code: 'RECEIPT_STORE_UNAVAILABLE', error: error instanceof Error ? error.message : String(error) };
}

function isMissingFilesystemEntry(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as NodeJS.ErrnoException).code
    : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isUnavailableRealpathAncestor(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as NodeJS.ErrnoException).code
    : undefined;
  return code === 'EPERM';
}

function transitionAt(input: Omit<ActionReceiptTransitionInput, 'to' | 'at'> & { at?: string }, now: () => number): string {
  return input.at ?? new Date(now()).toISOString();
}

export class ActionReceiptStore {
  readonly root: string;
  private readonly now: () => number;

  constructor(options: ActionReceiptStoreOptions = {}) {
    this.root = path.resolve(options.root ?? dataPath(ACTION_RECEIPT_STORE_DIR));
    if (samePath(this.root, path.parse(this.root).root)) {
      throw new ActionReceiptStoreError('RECEIPT_ROOT_INVALID', 'Receipt store root may not be a filesystem root.');
    }
    this.now = options.now ?? (() => Date.now());
  }

  /** Exposed for focused fixtures; it still rejects traversal before constructing a path. */
  pathFor(id: string): string {
    if (!validReceiptId(id)) throw new ActionReceiptStoreError('RECEIPT_ID_INVALID', 'Receipt id is malformed.');
    const candidate = path.resolve(this.root, `${id}.json`);
    if (!contained(this.root, candidate) || samePath(this.root, candidate)) {
      throw new ActionReceiptStoreError('RECEIPT_PATH_ESCAPE', 'Receipt id escaped its store root.');
    }
    return candidate;
  }

  receiptPath(id: string): string {
    return this.pathFor(id);
  }

  private assertPhysicalDirectory(candidate: string, stat: fs.Stats, allowUnavailableRealpath = false): boolean {
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new ActionReceiptStoreError('RECEIPT_ROOT_ESCAPE', 'Receipt store root contains a non-directory or symbolic-link segment.');
    }
    let realCandidate: string;
    try {
      realCandidate = fs.realpathSync.native(candidate);
    } catch (error) {
      if (allowUnavailableRealpath && isUnavailableRealpathAncestor(error)) return false;
      throw error;
    }
    if (!samePath(realCandidate, candidate)) {
      throw new ActionReceiptStoreError('RECEIPT_ROOT_ESCAPE', 'Receipt store root contains a junction or symlink ancestor.');
    }
    return true;
  }

  private ensureRoot(create: boolean): boolean {
    try {
      const parsed = path.parse(this.root);
      const relative = path.relative(parsed.root, this.root);
      let current = parsed.root;
      // A strict ancestor may be lstat-accessible while Windows denies realpath (for example, a
      // sandboxed user-profile directory).  Defer that ancestor's proof until a deeper existing
      // directory resolves exactly.  lstat still rejects Node-visible symlinks and junctions first,
      // and no missing segment may be created unless its immediate parent is the latest exactly
      // resolved directory.  EPERM therefore never becomes authority to write through an unknown
      // ancestor; it only permits the walk to reach a stronger, deeper physical-path proof.
      let verifiedDirectory = parsed.root;
      for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        let stat: fs.Stats;
        let existed = true;
        try {
          stat = fs.lstatSync(current);
        } catch (error) {
          if (!isMissingFilesystemEntry(error)) throw error;
          if (!create) return false;
          if (!samePath(verifiedDirectory, path.dirname(current))) {
            throw new ActionReceiptStoreError(
              'RECEIPT_ROOT_UNAVAILABLE',
              'Receipt store root cannot be created beneath an ancestor whose physical path is unavailable.',
            );
          }
          // Create one segment only after every existing ancestor has been checked.  Recursive
          // mkdir would follow a junction ancestor and write outside the declared root first.
          try { fs.mkdirSync(current); } catch (mkdirError) {
            if (!isMissingFilesystemEntry(mkdirError) && (mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
          }
          stat = fs.lstatSync(current);
          existed = false;
        }
        const realpathVerified = this.assertPhysicalDirectory(
          current,
          stat,
          existed && !samePath(current, this.root),
        );
        if (realpathVerified) verifiedDirectory = current;
      }
      return true;
    } catch (error) {
      if (error instanceof ActionReceiptStoreError) throw error;
      throw new ActionReceiptStoreError('RECEIPT_ROOT_UNAVAILABLE', `Receipt store root is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private assertEntrySafe(file: string): void {
    if (!contained(this.root, file) || samePath(this.root, file)) {
      throw new ActionReceiptStoreError('RECEIPT_PATH_ESCAPE', 'Receipt path escaped its store root.');
    }
    const realRoot = fs.realpathSync.native(this.root);
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new ActionReceiptStoreError('RECEIPT_PATH_ESCAPE', 'Receipt path is not a regular file.');
      }
      const realFile = fs.realpathSync.native(file);
      if (!contained(realRoot, realFile)) {
        throw new ActionReceiptStoreError('RECEIPT_PATH_ESCAPE', 'Receipt file resolves outside its store root.');
      }
    }
  }

  private atomicWrite(file: string, bytes: Buffer, replace = true): void {
    this.assertEntrySafe(file);
    const temporary = path.join(this.root, `.${path.basename(file)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      const tempStat = fs.lstatSync(temporary);
      if (tempStat.isSymbolicLink() || !tempStat.isFile()) throw new ActionReceiptStoreError('RECEIPT_PATH_ESCAPE', 'Receipt temporary path is not a regular file.');
      if (replace) {
        fs.renameSync(temporary, file);
      } else {
        // A content-addressed name is immutable. A concurrent publisher may win,
        // but its bytes must pass the same verification as a newly published file.
        try { fs.linkSync(temporary, file); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
    } catch (error) {
      if (error instanceof ActionReceiptStoreError) throw error;
      throw new ActionReceiptStoreError('RECEIPT_STORE_WRITE_FAILED', `Receipt atomic write failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor); } catch { /* best effort */ }
      }
      try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
    }
  }

  putVerifiedBlob(bytes: Buffer, maxBytes: number): string {
    if (bytes.length > maxBytes) throw new ActionReceiptStoreError('BLOB_SIZE_LIMIT', 'Blob exceeds its storage limit.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    this.ensureRoot(true);
    const file = path.join(this.root, hash);
    if (!fs.existsSync(file)) this.atomicWrite(file, bytes, false);
    if (!this.readVerifiedBlob(hash, maxBytes)?.equals(bytes)) {
      throw new ActionReceiptStoreError('BLOB_UNVERIFIED', 'Blob publication could not be verified.');
    }
    return hash;
  }

  readVerifiedBlob(hash: string, maxBytes: number): Buffer | null {
    if (!/^[a-f0-9]{64}$/.test(hash) || !this.ensureRoot(false)) return null;
    const file = path.join(this.root, hash);
    if (!fs.existsSync(file)) return null;
    this.assertEntrySafe(file);
    const entry = fs.lstatSync(file);
    if (!entry.isFile() || entry.nlink !== 1 || entry.size > maxBytes) return null;
    const handle = fs.openSync(file, 'r');
    try {
      const opened = fs.fstatSync(handle);
      if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== entry.dev || opened.ino !== entry.ino
        || opened.size !== entry.size) return null;
      const bytes = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < bytes.length) {
        const count = fs.readSync(handle, bytes, offset, bytes.length - offset, offset);
        if (count === 0) return null;
        offset += count;
      }
      const finished = fs.fstatSync(handle);
      if (!this.ensureRoot(false)) return null;
      this.assertEntrySafe(file);
      const current = fs.lstatSync(file);
      if (finished.size !== opened.size || finished.mtimeMs !== opened.mtimeMs || current.nlink !== 1
        || current.dev !== opened.dev || current.ino !== opened.ino) return null;
      return createHash('sha256').update(bytes).digest('hex') === hash ? bytes : null;
    } finally {
      fs.closeSync(handle);
    }
  }

  private readChecked(id: string): ActionReceipt {
    const file = this.pathFor(id);
    if (!this.ensureRoot(false) || !fs.existsSync(file)) {
      throw new ActionReceiptStoreError('RECEIPT_NOT_FOUND', 'Receipt was not found.');
    }
    this.assertEntrySafe(file);
    let raw: string;
    try {
      const bytes = fs.readFileSync(file);
      if (bytes.length > ACTION_RECEIPT_MAX_BYTES) throw new ActionReceiptStoreError('RECEIPT_CORRUPT', 'Receipt exceeds the supported size limit.');
      raw = bytes.toString('utf8');
    } catch (error) {
      if (error instanceof ActionReceiptStoreError) throw error;
      throw new ActionReceiptStoreError('RECEIPT_CORRUPT', `Receipt bytes are unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new ActionReceiptStoreError('RECEIPT_CORRUPT', `Receipt JSON is corrupt: ${error instanceof Error ? error.message : String(error)}`);
    }
    const checked = (() => {
      try { return assertValidActionReceipt(parsed); }
      catch (error) { throw new ActionReceiptStoreError('RECEIPT_CORRUPT', `Receipt schema or hash verification failed: ${error instanceof Error ? error.message : String(error)}`); }
    })();
    // The authoritative writer emits canonical bytes.  Requiring the exact canonical form also
    // rejects duplicate JSON keys, hidden whitespace changes, and other byte-level tampering that
    // JSON.parse alone would erase.
    let canonical: string;
    try { canonical = serializeActionReceipt(checked); }
    catch (error) { throw new ActionReceiptStoreError('RECEIPT_CORRUPT', `Receipt canonicalization failed: ${error instanceof Error ? error.message : String(error)}`); }
    if (raw !== canonical) throw new ActionReceiptStoreError('RECEIPT_CORRUPT', 'Receipt bytes are not canonical.');
    return checked;
  }

  read(id: string): ActionReceipt {
    return this.readChecked(id);
  }

  /** Bounded, verified enumeration. Never use a partial/corrupt ledger as authority. */
  listVerified(): ActionReceipt[] {
    if (!this.ensureRoot(false)) return [];
    const entries = fs.readdirSync(this.root);
    if (entries.length > 10000) throw new ActionReceiptStoreError('RECEIPT_SCAN_LIMIT', 'Receipt history exceeds the 10000-entry review limit.');
    let bytes = 0;
    return entries.filter(name => /^ar_[a-f0-9]{64}\.json$/.test(name)).sort().map(name => {
      this.assertEntrySafe(path.join(this.root, name));
      bytes += fs.statSync(path.join(this.root, name)).size;
      if (bytes > 64 * 1024 * 1024) throw new ActionReceiptStoreError('RECEIPT_SCAN_LIMIT', 'Review history exceeds the 64 MiB scan limit.');
      return this.readChecked(name.slice(0, -5));
    });
  }

  tryRead(id: string): ActionReceiptStoreResult {
    try { return { ok: true, receipt: this.readChecked(id) }; }
    catch (error) { const detail = errorDetails(error); return { ok: false, ...detail }; }
  }

  prepareWithDisposition(input: ActionReceiptPrepareInput): ActionReceiptPrepareDisposition {
    const candidate = createPreparedActionReceipt({
      ...input,
      preparedAt: input.preparedAt ?? new Date(this.now()).toISOString(),
    });
    this.ensureRoot(true);
    const file = this.pathFor(candidate.id);
    if (fs.existsSync(file)) {
      const existing = this.readChecked(candidate.id);
      const existingAuthority = canonicalizeActionReceiptAuthority(existing);
      const candidateAuthority = canonicalizeActionReceiptAuthority(candidate);
      if (existing.authorityHash === candidate.authorityHash && existingAuthority === candidateAuthority) {
        return { receipt: existing, created: false };
      }
      throw new ActionReceiptStoreError('RECEIPT_DUPLICATE_CONFLICT', 'A materially different receipt already occupies this deterministic receipt id.');
    }
    const bytes = Buffer.from(serializeActionReceipt(candidate), 'utf8');
    this.atomicWrite(file, bytes);
    return { receipt: this.readChecked(candidate.id), created: true };
  }

  /** Backward-compatible W3A writer surface; callers that need race disposition use the method above. */
  prepare(input: ActionReceiptPrepareInput): ActionReceipt {
    return this.prepareWithDisposition(input).receipt;
  }

  tryPrepare(input: ActionReceiptPrepareInput): ActionReceiptStoreResult {
    try { return { ok: true, receipt: this.prepare(input) }; }
    catch (error) { const detail = errorDetails(error); return { ok: false, ...detail }; }
  }

  transition(id: string, input: ActionReceiptTransitionInput): ActionReceipt {
    const current = this.readChecked(id);
    const next = transitionActionReceipt(current, input);
    if (next.hash === current.hash) return current;
    this.ensureRoot(false);
    this.atomicWrite(this.pathFor(id), Buffer.from(serializeActionReceipt(next), 'utf8'));
    return this.readChecked(id);
  }

  tryTransition(id: string, input: ActionReceiptTransitionInput): ActionReceiptStoreResult {
    try { return { ok: true, receipt: this.transition(id, input) }; }
    catch (error) { const detail = errorDetails(error); return { ok: false, ...detail }; }
  }

  commit(id: string, input: Omit<ActionReceiptTransitionInput, 'to' | 'at'> & { at?: string }): ActionReceipt {
    return this.transition(id, { ...input, to: 'committed', at: transitionAt(input, this.now) });
  }

  fail(id: string, input: Omit<ActionReceiptTransitionInput, 'to' | 'at'> & { at?: string }): ActionReceipt {
    return this.transition(id, { ...input, to: 'failed', at: transitionAt(input, this.now) });
  }

  rollBack(id: string, input: Omit<ActionReceiptTransitionInput, 'to' | 'at'> & { at?: string }): ActionReceipt {
    return this.transition(id, { ...input, to: 'rolled_back', at: transitionAt(input, this.now) });
  }

  compensate(id: string, input: Omit<ActionReceiptTransitionInput, 'to' | 'at'> & { at?: string }): ActionReceipt {
    return this.transition(id, { ...input, to: 'compensated', at: transitionAt(input, this.now) });
  }

  /** Small audit seam used by the selftest to show the store has no retention side channel. */
  status(id: string): ActionReceiptStatus {
    return this.readChecked(id).status;
  }
}
