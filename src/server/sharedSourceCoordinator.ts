import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { canonicalSourceKey, conflicts, type ResourceOwner } from './resourceCoordinator';

export const SOURCE_COORDINATION_FILENAME = 'source-coordination.sqlite';
export const SOURCE_COORDINATION_SCHEMA_VERSION = 1;
const APPLICATION_ID = 0x58345343; // X4SC; never share the disposable index cache.
const MAX_ENTRIES = 4096;
const MAX_KEYS = 64;

export type ProcessLiveness = 'alive' | 'dead' | 'unknown';
interface Statement {
  all(...parameters: unknown[]): unknown[];
  get(...parameters: unknown[]): unknown;
  run(...parameters: unknown[]): { changes: number };
}
export interface RegistryDatabase {
  exec(sql: string): unknown;
  pragma(sql: string, options?: { simple: boolean }): unknown;
  prepare(sql: string): Statement;
  transaction<T>(callback: () => T): { immediate(): T };
  close(): void;
}
export interface SharedSourceCoordinatorOptions {
  directory: string;
  maxPending?: number;
  waitMs?: number;
  pollMs?: number;
  liveness?: (pid: number) => ProcessLiveness;
  /** Test seam: production always loads the packaged better-sqlite3 binding. */
  driverFactory?: (filename: string) => RegistryDatabase;
}
interface Claim {
  sequence: number;
  id: string;
  instanceId: string;
  pid: number;
  resources: string[];
  owner: ResourceOwner;
  queuedAt: string;
  startedAt: string | null;
  state: 'waiting' | 'active';
}
export interface SourceCoordinationStatus {
  scope: 'shared-participating-processes';
  available: boolean;
  controlsExternalEditors: false;
  controlsOtherProcesses: false;
  coordinatesParticipatingProcesses: true;
  pid: number;
  instanceId: string;
  active: Omit<Claim, 'state' | 'sequence'>[];
  waiting: Omit<Claim, 'state' | 'sequence'>[];
  code?: string;
  reason?: string;
}
const failure = (code: string, message: string, status = 409) => Object.assign(new Error(message), {
  code, status, ...(status === 503 ? { category: 'forge-infrastructure' } : {}),
});
const unavailable = (error: unknown) => {
  if (error instanceof Error && 'code' in error && error.code === 'SOURCE_COORDINATION_UNAVAILABLE') return error as ReturnType<typeof failure>;
  return failure('SOURCE_COORDINATION_UNAVAILABLE',
  `Shared source coordination is unavailable. ${error instanceof Error ? error.message : String(error)}`, 503);
};

/** Unknown errors must never turn a potentially live writer into a reclaimable lock. */
export function processLiveness(pid: number): ProcessLiveness {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'unknown';
  try { process.kill(pid, 0); return 'alive'; }
  catch (error) { return (error as NodeJS.ErrnoException)?.code === 'ESRCH' ? 'dead' : 'unknown'; }
}

function nativeDriver(filename: string): RegistryDatabase {
  const require = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
  const Driver = require('better-sqlite3') as new (filename: string, options: { timeout: number }) => RegistryDatabase;
  return new Driver(filename, { timeout: 100 });
}
function normalizeKeys(keys: string[], allowEmpty = false): string[] {
  if (!Array.isArray(keys) || (!allowEmpty && !keys.length) || keys.length > MAX_KEYS
    || keys.some(key => typeof key !== 'string' || !key.startsWith('source:') || key.length <= 7 || key.length > 32768 || key.includes('\0'))
    || keys.reduce((size, key) => size + key.length, 0) > 65536) {
    throw failure('RESOURCE_KEYS_INVALID', 'Resource keys must be nonempty strings within the coordination limits.');
  }
  return [...new Set(keys)].sort();
}
function validateOwner(owner: ResourceOwner): ResourceOwner {
  if (!owner || typeof owner.actor !== 'string' || !owner.actor || owner.actor.length > 1024
    || typeof owner.operation !== 'string' || !owner.operation || owner.operation.length > 2048
    || (owner.workspaceId !== undefined && (typeof owner.workspaceId !== 'string' || owner.workspaceId.length > 512))) {
    throw failure('RESOURCE_OWNER_INVALID', 'Resource owner identity is missing or exceeds coordination limits.');
  }
  return { actor: owner.actor, operation: owner.operation, ...(owner.workspaceId === undefined ? {} : { workspaceId: owner.workspaceId }) };
}
const overlap = (a: string[], b: string[]) => a.some(left => b.some(right => conflicts(left, right)));
function statusBase(instanceId: string): SourceCoordinationStatus {
  return { scope: 'shared-participating-processes', available: true, controlsExternalEditors: false,
    controlsOtherProcesses: false, coordinatesParticipatingProcesses: true, pid: process.pid, instanceId, active: [], waiting: [] };
}
function unavailableStatus(instanceId: string, error: unknown): SourceCoordinationStatus {
  const problem = unavailable(error);
  return { ...statusBase(instanceId), available: false, code: problem.code, reason: problem.message };
}

/**
 * Cooperative same-user coordination. SQLite protects the decision transaction; the
 * persisted claim protects the asynchronous handler. Only confirmed dead PIDs are
 * reclaimed. Alive, suspended, reused, and unknown PIDs retain ownership indefinitely.
 * This is not access control against editors, older Forge versions, or registry tampering.
 */
export class SharedSourceCoordinator {
  readonly instanceId = randomUUID();
  readonly filename: string;
  private database?: RegistryDatabase;
  private fileIdentity?: { dev: number; ino: number };
  private inFlight = 0;
  private readonly maxPending: number;
  private readonly waitMs: number;
  private readonly pollMs: number;

  constructor(private readonly options: SharedSourceCoordinatorOptions) {
    if (!options || typeof options.directory !== 'string' || !path.isAbsolute(options.directory)
      || /^(?:\\\\|\/\/)/.test(options.directory)) throw failure('RESOURCE_DIRECTORY_INVALID', 'An absolute local coordination directory is required.');
    this.filename = path.join(path.resolve(options.directory), SOURCE_COORDINATION_FILENAME);
    this.maxPending = options.maxPending ?? 256;
    this.waitMs = options.waitMs ?? 120_000;
    this.pollMs = options.pollMs ?? 25;
    for (const [name, value, max] of [['maxPending', this.maxPending, MAX_ENTRIES], ['waitMs', this.waitMs, 3_600_000], ['pollMs', this.pollMs, 60_000]] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > max) throw failure('RESOURCE_OPTIONS_INVALID', `Invalid coordination ${name}.`);
    }
    // Deliberately no filesystem access or native loading during construction/import.
  }

  private open(): RegistryDatabase {
    if (this.database) { this.checkFileIdentity(); return this.database; }
    let database: RegistryDatabase | undefined;
    try {
      const directory = path.dirname(this.filename);
      if (/^(?:\\\\|\/\/)/.test(directory)) throw new Error('The coordination registry must be on a local filesystem, not a network share.');
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (/^(?:\\\\|\/\/)/.test(fs.realpathSync.native(directory))) throw new Error('The coordination directory resolves to a network share.');
      database = (this.options.driverFactory ?? nativeDriver)(this.filename);
      database.pragma('busy_timeout = 100');
      database.pragma('synchronous = FULL');
      database.transaction(() => {
        const version = database!.pragma('user_version', { simple: true });
        const application = database!.pragma('application_id', { simple: true });
        if (version === 0 && application === 0) {
          const tables = database!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
          if (tables.length) throw new Error('Unrecognized coordination database; existing tables were preserved.');
          database!.exec(`CREATE TABLE claims (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL UNIQUE, instance_id TEXT NOT NULL, pid INTEGER NOT NULL,
            keys_json TEXT NOT NULL, owner_json TEXT NOT NULL,
            queued_at TEXT NOT NULL, started_at TEXT,
            state TEXT NOT NULL CHECK (state IN ('waiting', 'active'))
          ); PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${SOURCE_COORDINATION_SCHEMA_VERSION};`);
        } else if (version !== SOURCE_COORDINATION_SCHEMA_VERSION || application !== APPLICATION_ID) {
          throw new Error(`Unsupported coordination schema/application (${String(version)}/${String(application)}); no migration or reset was performed.`);
        }
        // Prepare the complete column contract so a misleading version stamp fails closed.
        database!.prepare('SELECT sequence,id,instance_id,pid,keys_json,owner_json,queued_at,started_at,state FROM claims LIMIT 0').all();
      }).immediate();
      if (database.pragma('quick_check(1)', { simple: true }) !== 'ok') throw new Error('Coordination database integrity check failed.');
      const stat = fs.statSync(this.filename);
      this.fileIdentity = { dev: stat.dev, ino: stat.ino };
      this.database = database;
      return database;
    } catch (error) {
      try { database?.close(); } catch { /* Retain the original dependency/storage failure. */ }
      throw unavailable(error);
    }
  }

  private checkFileIdentity(): void {
    try {
      const stat = fs.statSync(this.filename);
      if (!this.fileIdentity || stat.dev !== this.fileIdentity.dev || stat.ino !== this.fileIdentity.ino) {
        throw new Error('Coordination registry was replaced while this process was using it.');
      }
    } catch (error) { throw unavailable(error); }
  }

  private transaction<T>(callback: (database: RegistryDatabase) => T): T {
    const database = this.open();
    try {
      return database.transaction(() => {
        if (database.pragma('user_version', { simple: true }) !== SOURCE_COORDINATION_SCHEMA_VERSION
          || database.pragma('application_id', { simple: true }) !== APPLICATION_ID) throw new Error('Coordination schema changed while the process was running.');
        return callback(database);
      }).immediate();
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      throw unavailable(error);
    }
  }

  private claims(database: RegistryDatabase, reclaimDead = true): Claim[] {
    const records = database.prepare('SELECT * FROM claims ORDER BY sequence LIMIT ?').all(MAX_ENTRIES + 1);
    if (records.length > MAX_ENTRIES) throw new Error('Coordination registry exceeds its safety bound.');
    const liveness = new Map<number, ProcessLiveness>();
    const claims: Claim[] = [];
    for (const record of records) {
      const row = record as Record<string, unknown>;
      if (!Number.isSafeInteger(row.sequence) || (row.sequence as number) < 1
        || typeof row.id !== 'string' || !/^[\da-f-]{36}$/i.test(row.id)
        || typeof row.instance_id !== 'string' || !/^[\da-f-]{36}$/i.test(row.instance_id)
        || !Number.isSafeInteger(row.pid) || (row.pid as number) <= 0
        || typeof row.keys_json !== 'string' || row.keys_json.length > 262144
        || typeof row.owner_json !== 'string' || row.owner_json.length > 8192
        || typeof row.queued_at !== 'string' || !Number.isFinite(Date.parse(row.queued_at))
        || (row.state !== 'waiting' && row.state !== 'active')
        || (row.state === 'waiting' ? row.started_at !== null : typeof row.started_at !== 'string' || !Number.isFinite(Date.parse(row.started_at)))) {
        throw new Error('Invalid coordination claim; refusing to discard possible ownership.');
      }
      let resources: string[];
      let owner: ResourceOwner;
      try {
        resources = normalizeKeys(JSON.parse(row.keys_json));
        owner = validateOwner(JSON.parse(row.owner_json));
      } catch { throw new Error('Invalid coordination claim data; refusing to discard possible ownership.'); }
      if (JSON.stringify(resources) !== row.keys_json) throw new Error('Coordination claim keys are not canonical.');
      const pid = row.pid as number;
      if (!liveness.has(pid)) {
        let result: ProcessLiveness = 'unknown';
        try { result = pid === process.pid ? 'alive' : (this.options.liveness ?? processLiveness)(pid); } catch { /* Unknown is never dead. */ }
        liveness.set(pid, result);
      }
      if (reclaimDead && liveness.get(pid) === 'dead') {
        database.prepare('DELETE FROM claims WHERE id = ? AND instance_id = ? AND pid = ?').run(row.id, row.instance_id, pid);
        continue;
      }
      claims.push({ sequence: row.sequence as number, id: row.id, instanceId: row.instance_id, pid, resources, owner,
        queuedAt: row.queued_at, startedAt: row.started_at as string | null, state: row.state });
    }
    return claims;
  }

  status(keys: string[]): SourceCoordinationStatus {
    try {
      const normalized = normalizeKeys(keys, true);
      const claims = this.transaction(database => this.claims(database));
      const relevant = claims.filter(claim => overlap(claim.resources, normalized));
      const copy = ({ sequence: _sequence, state: _state, ...claim }: Claim) => claim;
      return { ...statusBase(this.instanceId), active: relevant.filter(claim => claim.state === 'active').map(copy),
        waiting: relevant.filter(claim => claim.state === 'waiting').map(copy) };
    } catch (error) { return unavailableStatus(this.instanceId, error); }
  }

  async run<T>(keys: string[], owner: ResourceOwner, task: () => T | Promise<T>, currentKeys?: () => string[]): Promise<T> {
    const resources = normalizeKeys(keys);
    const identity = validateOwner(owner);
    const id = randomUUID();
    const queuedAt = new Date().toISOString();
    const deadline = performance.now() + this.waitMs;
    let enqueued = false;
    let operationFailed = false;
    let operationError: unknown;
    let result: T;
    this.inFlight++;
    try {
      this.transaction(database => {
        if (this.claims(database).length >= this.maxPending) throw failure('RESOURCE_QUEUE_FULL', 'Shared source operation queue is full; retry after current work completes.');
        database.prepare('INSERT INTO claims (id,instance_id,pid,keys_json,owner_json,queued_at,started_at,state) VALUES (?,?,?,?,?,?,NULL,\'waiting\')')
          .run(id, this.instanceId, process.pid, JSON.stringify(resources), JSON.stringify(identity), queuedAt);
        // If COMMIT fails, cleanup may find no row; it must never delete another claim.
        enqueued = true;
      });
      for (;;) {
        if (performance.now() >= deadline) throw failure('RESOURCE_QUEUE_TIMEOUT', 'Source operation did not start before its queue deadline; no work was performed.');
        const granted = this.transaction(database => {
          const claims = this.claims(database);
          const own = claims.find(claim => claim.id === id && claim.instanceId === this.instanceId && claim.pid === process.pid);
          if (!own || own.state !== 'waiting' || JSON.stringify(own.resources) !== JSON.stringify(resources)) {
            throw failure('SOURCE_COORDINATION_LOST', 'Queued source ownership changed; no work was performed.', 503);
          }
          if (claims.some(claim => claim.id !== id && (claim.state === 'active' || claim.sequence < own.sequence)
            && overlap(claim.resources, resources))) return false;
          if (performance.now() >= deadline) throw failure('RESOURCE_QUEUE_TIMEOUT', 'Source operation did not start before its queue deadline; no work was performed.');
          const changed = database.prepare("UPDATE claims SET state = 'active', started_at = ? WHERE id = ? AND instance_id = ? AND pid = ? AND state = 'waiting'")
            .run(new Date().toISOString(), id, this.instanceId, process.pid);
          if (changed.changes !== 1) throw failure('SOURCE_COORDINATION_LOST', 'Could not confirm source ownership; no work was performed.', 503);
          return true;
        });
        if (granted) break;
        await new Promise<void>(resolve => setTimeout(resolve, Math.max(1, Math.min(this.pollMs, deadline - performance.now()))));
      }
      if (currentKeys && JSON.stringify(normalizeKeys(currentKeys())) !== JSON.stringify(resources)) {
        throw failure('SOURCE_COORDINATION_CHANGED', 'Source/configuration aliases changed while waiting; obtain fresh state before retrying.');
      }
      result = await task();
    } catch (error) {
      operationFailed = true;
      operationError = error;
    }
    try {
      if (enqueued) this.transaction(database => {
        database.prepare('DELETE FROM claims WHERE id = ? AND instance_id = ? AND pid = ?').run(id, this.instanceId, process.pid);
      });
    } catch (cleanupError) {
      // If storage fails, retaining ownership is safer than guessing it was released.
      // Never imply handler rollback, and preserve both failures for diagnostics.
      if (operationFailed) throw Object.assign(new AggregateError([operationError, cleanupError],
        `Source operation failed (${operationError instanceof Error ? operationError.message : String(operationError)}); coordination cleanup also failed. Ownership may remain until process exit.`),
      { code: 'SOURCE_COORDINATION_UNAVAILABLE', status: 503, category: 'forge-infrastructure' });
      throw failure('SOURCE_COORDINATION_UNAVAILABLE',
        `Source operation completed but coordination cleanup failed. Writes may already have occurred; ownership may remain until process exit. ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 503);
    } finally { this.inFlight--; }
    if (operationFailed) throw operationError;
    return result!;
  }

  /** Tests/owned shutdown only: never drop an active claim merely to close a connection. */
  close(): void {
    if (this.inFlight) throw failure('SOURCE_COORDINATION_BUSY', 'Cannot close coordination while operations are in flight.');
    this.database?.close();
    this.database = undefined;
    this.fileIdentity = undefined;
  }
}

export function resolveSourceCoordinationDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const mode = env.X4_FORGE_MODE ?? '';
  const devBuild = /^dev-build$/i.test(mode.trim());
  const productionDirectory = process.platform === 'win32'
    ? path.join(env.LOCALAPPDATA || os.homedir(), 'X4Forge', 'source-coordination')
    : path.join(os.homedir(), '.local', 'state', 'x4forge', 'source-coordination');
  const override = env.X4_SOURCE_COORDINATION_DIR?.trim();
  if (env.X4_SOURCE_COORDINATION_DIR !== undefined) {
    if (!override || !path.isAbsolute(override) || /^(?:\\\\|\/\/)/.test(override)) throw new Error('X4_SOURCE_COORDINATION_DIR must be an absolute local directory.');
    // Read-only canonical resolution rejects aliases without creating/opening a registry.
    if (devBuild && canonicalSourceKey(override) === canonicalSourceKey(productionDirectory)) {
      throw new Error('Dev Build requires a private X4_SOURCE_COORDINATION_DIR distinct from the production coordination directory.');
    }
    return path.resolve(override);
  }
  if (devBuild) {
    throw new Error('Dev Build requires an explicit private X4_SOURCE_COORDINATION_DIR; the user registry was not opened.');
  }
  if (env.NODE_ENV === 'test' || env.FORGE_ROUTE_TEST_MODE === '1'
    || env.X4_FORGE_E2E_STATE_PID || env.X4_FORGE_E2E_API_PORT || env.X4_FORGE_E2E_WEB_PORT
    || /(?:^|[-_])(test|e2e)(?:[-_]|$)/i.test(mode)) {
    throw new Error('Test/E2E processes require an explicit scratch X4_SOURCE_COORDINATION_DIR; the user registry was not opened.');
  }
  return productionDirectory;
}

// A lazy facade also keeps a missing test override/native binding from crashing server import.
let defaultCoordinator: SharedSourceCoordinator | undefined;
const defaultInstanceId = randomUUID();
const coordinator = () => defaultCoordinator ??= new SharedSourceCoordinator({ directory: resolveSourceCoordinationDirectory() });
export const forgeSourceCoordinator = {
  run<T>(keys: string[], owner: ResourceOwner, task: () => T | Promise<T>, currentKeys?: () => string[]): Promise<T> {
    try { return coordinator().run(keys, owner, task, currentKeys); }
    catch (error) { return Promise.reject(unavailable(error)); }
  },
  status(keys: string[]): SourceCoordinationStatus {
    try { return coordinator().status(keys); }
    catch (error) { return unavailableStatus(defaultInstanceId, error); }
  },
};
