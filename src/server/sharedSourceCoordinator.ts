import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { canonicalSourceKey, conflicts, type ResourceOwner } from './resourceCoordinator';

export const SOURCE_COORDINATION_FILENAME = 'source-coordination.sqlite';
export const SOURCE_COORDINATION_SCHEMA_VERSION = 4;
export const PROJECT_CHECK_MAX_PARALLEL = 4;
export const PROJECT_CHECK_STAGE_LIMITS = Object.freeze({ roots: 16, bytes: 1024 * 1024 * 1024, entries: 32768 });
const APPLICATION_ID = 0x58345343; // X4SC; never share the disposable index cache.
const MAX_ENTRIES = 4096;
const MAX_KEYS = 64;
const MAX_PROJECT_CHECK_GUARDS = 32;

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
  guards: ProjectCheckJournalEntry[];
  checkBudget: number | null;
  guardPhase: 'armed' | 'running' | 'drained' | null;
  handlerFinished: boolean;
}
interface ProjectCheckGuard {
  bindingHash: string;
  commandHash: string;
  helperPid: number;
  jobName: string;
  launcherHash: string;
  runId: string;
}
interface PersistedProjectCheckGuard extends ProjectCheckGuard {
  registryDevice: string;
  registryFile: string;
}
interface ProjectCheckJournalEntry {
  guard: PersistedProjectCheckGuard;
  phase: 'armed' | 'running' | 'drained' | 'confirmed';
}
interface ProjectCheckLaunchFrame {
  registry: string;
  claimId: string;
  instanceId: string;
  backendPid: number;
  guardJson: string;
}
export interface ProjectCheckStageScope {
  sourceKey: string;
  workspaceId: string;
  actorId: string;
  runId: string;
}
export interface ProjectCheckStageHandle {
  id: string;
  root: string;
  runId: string;
  kind: 'setup' | 'snapshot';
}
export interface PhysicalStageIdentity { device: string; file: string }
export interface ProjectCheckStageManifestPin { bytes: number; sha256: string }
export interface ProjectCheckStageRecord extends ProjectCheckStageHandle, ProjectCheckStageScope {
  claimId: string;
  instanceId: string;
  pid: number;
  parent: PhysicalStageIdentity & { path: string };
  identity: PhysicalStageIdentity | null;
  bytes: number;
  entries: number;
  retirement: { token: string; instanceId: string; pid: number } | null;
  manifest?: ProjectCheckStageManifestPin;
  quarantineRoot?: string;
}
type StageReservation = ProjectCheckStageScope & { parent: string; kind: 'setup' | 'snapshot'; bytes: number; entries: number; manifest?: ProjectCheckStageManifestPin };
type StageRetirement = (stage: Readonly<ProjectCheckStageRecord>, assertOwned: () => void) => undefined;
export interface ProjectCheckSourceLease {
  ownsResource(key: string): boolean;
  assertProjectCheckAuthority(sourceKey: string, workspaceId: string, actorId: string): void;
  armProjectCheck(input: ProjectCheckGuard, maxParallelChecks?: number): Readonly<ProjectCheckLaunchFrame>;
  assertProjectCheckDrained(frame: Readonly<ProjectCheckLaunchFrame>): void;
  reserveProjectCheckStage(input: StageReservation): Readonly<ProjectCheckStageHandle>;
  adoptProjectCheckStage(handle: Readonly<ProjectCheckStageHandle>, created: PhysicalStageIdentity): void;
  assertProjectCheckStage(handle: Readonly<ProjectCheckStageHandle>): void;
  retireProjectCheckStage(handle: Readonly<ProjectCheckStageHandle>, cleanup: StageRetirement): void;
}
export type ProjectCheckStageLease = Pick<ProjectCheckSourceLease, 'reserveProjectCheckStage' | 'adoptProjectCheckStage'
  | 'assertProjectCheckStage' | 'retireProjectCheckStage'>;
type VisibleClaim = Omit<Claim, 'state' | 'sequence' | 'guards' | 'checkBudget' | 'guardPhase' | 'handlerFinished'> & {
  guardPhase?: NonNullable<Claim['guardPhase']>;
};
export interface SourceCoordinationStatus {
  scope: 'shared-participating-processes';
  available: boolean;
  controlsExternalEditors: false;
  controlsOtherProcesses: false;
  coordinatesParticipatingProcesses: true;
  pid: number;
  instanceId: string;
  active: VisibleClaim[];
  waiting: VisibleClaim[];
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
function validateProjectCheckGuard(guard: ProjectCheckGuard): ProjectCheckGuard {
  if (!guard || typeof guard.bindingHash !== 'string' || !/^[a-f0-9]{64}$/.test(guard.bindingHash)
    || typeof guard.commandHash !== 'string' || !/^[a-f0-9]{64}$/.test(guard.commandHash)
    || typeof guard.launcherHash !== 'string' || !/^[a-f0-9]{64}$/.test(guard.launcherHash)
    || !Number.isSafeInteger(guard.helperPid) || guard.helperPid <= 0 || guard.helperPid > 0xffff_ffff
    || typeof guard.jobName !== 'string' || !/^Local\\X4ForgeProjectCheck-[a-f0-9]{32}$/.test(guard.jobName)
    || typeof guard.runId !== 'string' || !/^[a-f0-9]{32}$/.test(guard.runId)) {
    throw failure('PROJECT_CHECK_GUARD_INVALID', 'Project check guard does not identify an exact helper and command.');
  }
  return { bindingHash: guard.bindingHash, commandHash: guard.commandHash, helperPid: guard.helperPid,
    jobName: guard.jobName, launcherHash: guard.launcherHash, runId: guard.runId };
}
function persistedProjectCheckGuard(input: PersistedProjectCheckGuard): PersistedProjectCheckGuard {
  const { bindingHash, commandHash, helperPid, jobName, launcherHash, runId } = validateProjectCheckGuard(input);
  const { registryDevice, registryFile } = input;
  if (typeof registryDevice !== 'string' || !/^[1-9]\d{0,9}$/.test(registryDevice)
    || typeof registryFile !== 'string' || !/^[1-9]\d{0,19}$/.test(registryFile)) {
    throw new Error('Invalid project check registry identity.');
  }
  return { bindingHash, commandHash, helperPid, jobName, launcherHash, registryDevice, registryFile, runId };
}
function readProjectCheckJournal(text: unknown, budget: unknown, backendPid: number): ProjectCheckJournalEntry[] {
  if (typeof text !== 'string' || text.length > 32 * 1024) throw new Error('Invalid project check journal.');
  const entries: unknown = JSON.parse(text);
  if (!Array.isArray(entries) || entries.length > MAX_PROJECT_CHECK_GUARDS
    || (entries.length === 0 ? budget !== null : !Number.isInteger(budget) || (budget as number) < 1 || (budget as number) > PROJECT_CHECK_MAX_PARALLEL)) {
    throw new Error('Invalid project check journal budget.');
  }
  const journal: ProjectCheckJournalEntry[] = entries.map(entry => {
    if (!entry || typeof entry !== 'object' || !['armed', 'running', 'drained', 'confirmed'].includes(entry.phase)) {
      throw new Error('Invalid project check journal entry.');
    }
    const guard = persistedProjectCheckGuard(entry.guard);
    if (guard.helperPid === backendPid) throw new Error('Project check helper cannot own its source claim.');
    return { guard, phase: entry.phase };
  });
  const active = journal.filter(entry => entry.phase !== 'confirmed');
  for (const key of ['jobName', 'commandHash', 'bindingHash'] as const) {
    if (new Set(journal.map(entry => entry.guard[key])).size !== journal.length) throw new Error('Replayed project check journal entry.');
  }
  if (JSON.stringify(journal) !== text || new Set(journal.map(entry => entry.guard.runId)).size > 1
    || new Set(active.map(entry => entry.guard.helperPid)).size !== active.length || active.length > ((budget as number | null) ?? 0)) {
    throw new Error('Noncanonical or over-capacity project check journal.');
  }
  return journal;
}
function journalPhase(journal: ProjectCheckJournalEntry[]): Claim['guardPhase'] {
  return journal.some(entry => entry.phase === 'running') ? 'running'
    : journal.some(entry => entry.phase === 'drained') ? 'drained'
      : journal.some(entry => entry.phase === 'armed') ? 'armed' : journal.length ? 'drained' : null;
}
function createClaimsTable(database: RegistryDatabase): void {
  database.exec(`CREATE TABLE claims (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE, instance_id TEXT NOT NULL, pid INTEGER NOT NULL,
    keys_json TEXT NOT NULL, owner_json TEXT NOT NULL,
    queued_at TEXT NOT NULL, started_at TEXT,
    state TEXT NOT NULL CHECK (state IN ('waiting', 'active')),
    protocol INTEGER NOT NULL CHECK (protocol = ${SOURCE_COORDINATION_SCHEMA_VERSION}),
    guards_json TEXT NOT NULL DEFAULT '[]',
    check_budget INTEGER CHECK (check_budget BETWEEN 1 AND ${PROJECT_CHECK_MAX_PARALLEL}),
    handler_finished INTEGER NOT NULL DEFAULT 0 CHECK (handler_finished IN (0, 1))
  ); CREATE TABLE project_check_stages (id TEXT PRIMARY KEY NOT NULL, record_json TEXT NOT NULL);
  PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${SOURCE_COORDINATION_SCHEMA_VERSION};`);
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
function stageScope(input: ProjectCheckStageScope): ProjectCheckStageScope {
  if (!input || typeof input.workspaceId !== 'string' || !input.workspaceId || input.workspaceId.length > 512
    || typeof input.actorId !== 'string' || !input.actorId || input.actorId.length > 1024
    || typeof input.runId !== 'string' || !/^[a-f0-9]{32}$/.test(input.runId)) throw new Error('Invalid stage scope.');
  const [sourceKey] = normalizeKeys([input.sourceKey]);
  return { sourceKey, workspaceId: input.workspaceId, actorId: input.actorId, runId: input.runId };
}
function localStagePath(value: string): string {
  if (typeof value !== 'string' || value.length > 32767 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || !path.isAbsolute(value) || /^(?:\\\\|\/\/)/.test(value) || path.resolve(value) !== value
    || (process.platform === 'win32' && !/^[A-Za-z]:[\\/][^:]*$/.test(value))) throw new Error('Invalid local stage path.');
  return value;
}
function physicalIdentity(input: PhysicalStageIdentity): PhysicalStageIdentity {
  if (!input || typeof input.device !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(input.device)
    || typeof input.file !== 'string' || !/^[1-9]\d{0,19}$/.test(input.file)) throw new Error('Invalid physical stage identity.');
  return { device: input.device, file: input.file };
}
function manifestPin(input: ProjectCheckStageManifestPin): ProjectCheckStageManifestPin {
  if (!input || !Number.isSafeInteger(input.bytes) || input.bytes < 1 || input.bytes > 2 * 1024 * 1024
    || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new Error('Invalid stage manifest pin.');
  return { bytes: input.bytes, sha256: input.sha256 };
}
function directoryIdentity(directory: string): PhysicalStageIdentity {
  localStagePath(directory);
  const stat = fs.lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync.native(directory) !== directory) {
    throw new Error('Stage directory is aliased or unavailable.');
  }
  return physicalIdentity({ device: stat.dev.toString(), file: stat.ino.toString() });
}
function readStageRecord(text: unknown): ProjectCheckStageRecord {
  if (typeof text !== 'string' || text.length > 80 * 1024) throw new Error('Invalid stage journal.');
  const value = JSON.parse(text);
  if (!value || !uuid(value.id) || !uuid(value.claimId) || !uuid(value.instanceId)
    || !Number.isSafeInteger(value.pid) || value.pid < 1 || value.pid > 0xffff_ffff
    || !['setup', 'snapshot'].includes(value.kind) || !value.parent
    || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > PROJECT_CHECK_STAGE_LIMITS.bytes
    || !Number.isSafeInteger(value.entries) || value.entries < 1 || value.entries > PROJECT_CHECK_STAGE_LIMITS.entries) throw new Error('Invalid stage reservation.');
  const parent = { path: localStagePath(value.parent.path), ...physicalIdentity(value.parent) };
  const root = path.join(parent.path, `x4forge-check-stage-${value.id}`);
  const scope = stageScope(value);
  let retirement: ProjectCheckStageRecord['retirement'] = null;
  if (value.retirement !== null) {
    const current = value.retirement;
    if (!current || !uuid(current.token) || !uuid(current.instanceId)
      || !Number.isSafeInteger(current.pid) || current.pid < 1 || current.pid > 0xffff_ffff) throw new Error('Invalid stage retirement owner.');
    retirement = { token: current.token, instanceId: current.instanceId, pid: current.pid };
  }
  const record: ProjectCheckStageRecord = { id: value.id, root, runId: scope.runId, kind: value.kind,
    sourceKey: scope.sourceKey, workspaceId: scope.workspaceId, actorId: scope.actorId,
    claimId: value.claimId, instanceId: value.instanceId, pid: value.pid, parent,
    identity: value.identity === null ? null : physicalIdentity(value.identity), bytes: value.bytes, entries: value.entries, retirement };
  if (Object.hasOwn(value, 'manifest')) {
    record.manifest = manifestPin(value.manifest);
    record.quarantineRoot = path.join(parent.path, `x4forge-check-retiring-${record.id}`);
    if (record.bytes < record.manifest.bytes || record.entries < 2) throw new Error('Stage manifest exceeds its reservation.');
  }
  if (JSON.stringify(record) !== text) throw new Error('Noncanonical stage journal.');
  return record;
}
function assertStagePhysical(record: ProjectCheckStageRecord, allowMissing = false): boolean {
  const { path: parent, ...identity } = record.parent;
  if (JSON.stringify(directoryIdentity(parent)) !== JSON.stringify(identity)) throw new Error('Stage parent identity changed.');
  const roots = [record.root, ...(record.quarantineRoot ? [record.quarantineRoot] : [])];
  const present = roots.filter(root => fs.lstatSync(root, { throwIfNoEntry: false }));
  if (!present.length && allowMissing) return false;
  if (present.length !== 1 || (!record.retirement && present[0] !== record.root) || !record.identity
    || JSON.stringify(directoryIdentity(present[0])) !== JSON.stringify(record.identity)) throw new Error('Stage root is not physically owned.');
  return true;
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
 * persisted claim protects the asynchronous handler. A running check guard also
 * requires durable process-tree drain before the claim can be reclaimed.
 * This is not access control against editors, older Forge versions, or registry tampering.
 */
export class SharedSourceCoordinator {
  readonly instanceId = randomUUID();
  readonly filename: string;
  private database?: RegistryDatabase;
  private fileIdentity?: { dev: bigint; ino: bigint };
  private inFlight = 0;
  private readonly maxPending: number;
  private readonly waitMs: number;
  private readonly pollMs: number;
  private readonly stageRetirements = new Set<string>();

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
          createClaimsTable(database!);
        } else if ((version === 1 || version === 2 || version === 3) && application === APPLICATION_ID) {
          const previous = database!.prepare('SELECT sequence,id,instance_id,pid,keys_json,owner_json,queued_at,started_at,state FROM claims LIMIT 1').all();
          const triggers = database!.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all();
          const tables = database!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'claims'").all();
          if (previous.length || triggers.length || tables.length) {
            throw new Error('Previous coordination schema is not empty and quiescent. No migration or ownership reset was performed.');
          }
          if (version === 2) database!.prepare('SELECT guard_json,guard_phase,handler_finished FROM claims LIMIT 0').all();
          if (version === 3) database!.prepare('SELECT protocol,guards_json,check_budget,handler_finished FROM claims LIMIT 0').all();
          // Old cached clients also check user_version on every transaction.
          // Old single-guard columns disappear; protocol4 also rejects old
          // journal clients' direct inserts and exact protocol3 guard updates.
          database!.exec('DROP TABLE claims');
          createClaimsTable(database!);
        } else if (version !== SOURCE_COORDINATION_SCHEMA_VERSION || application !== APPLICATION_ID) {
          throw new Error(`Unsupported coordination schema/application (${String(version)}/${String(application)}); no migration or reset was performed.`);
        }
        // Prepare the complete column contract so a misleading version stamp fails closed.
        database!.prepare('SELECT sequence,id,instance_id,pid,keys_json,owner_json,queued_at,started_at,state,protocol,guards_json,check_budget,handler_finished FROM claims LIMIT 0').all();
        database!.prepare('SELECT id,record_json FROM project_check_stages LIMIT 0').all();
        if (database!.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('claims','project_check_stages')").all().length) {
          throw new Error('Unexpected coordination ownership trigger.');
        }
      }).immediate();
      if (database.pragma('quick_check(1)', { simple: true }) !== 'ok') throw new Error('Coordination database integrity check failed.');
      const stat = fs.statSync(this.filename, { bigint: true });
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
      const stat = fs.statSync(this.filename, { bigint: true });
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

  private liveness(pid: number): ProcessLiveness {
    if (!Number.isSafeInteger(pid) || pid <= 0) return 'unknown';
    if (pid === process.pid) return 'alive';
    try { return (this.options.liveness ?? processLiveness)(pid); }
    catch { return 'unknown'; }
  }

  private claims(database: RegistryDatabase): Claim[] {
    const records = database.prepare('SELECT * FROM claims ORDER BY sequence LIMIT ?').all(MAX_ENTRIES + 1);
    if (records.length > MAX_ENTRIES) throw new Error('Coordination registry exceeds its safety bound.');
    const liveness = new Map<number, ProcessLiveness>();
    const observe = (pid: number) => {
      if (!liveness.has(pid)) liveness.set(pid, this.liveness(pid));
      return liveness.get(pid);
    };
    const claims: Claim[] = [];
    for (const record of records) {
      const row = record as Record<string, unknown>;
      if (!Number.isSafeInteger(row.sequence) || (row.sequence as number) < 1
        || typeof row.id !== 'string' || !/^[\da-f-]{36}$/i.test(row.id)
        || typeof row.instance_id !== 'string' || !/^[\da-f-]{36}$/i.test(row.instance_id)
        || !Number.isSafeInteger(row.pid) || (row.pid as number) <= 0
        || typeof row.keys_json !== 'string' || row.keys_json.length > 262144
        || typeof row.owner_json !== 'string' || row.owner_json.length > 8192
        || row.protocol !== SOURCE_COORDINATION_SCHEMA_VERSION
        || typeof row.queued_at !== 'string' || !Number.isFinite(Date.parse(row.queued_at))
        || (row.state !== 'waiting' && row.state !== 'active')
        || (row.state === 'waiting' ? row.started_at !== null : typeof row.started_at !== 'string' || !Number.isFinite(Date.parse(row.started_at)))) {
        throw new Error('Invalid coordination claim; refusing to discard possible ownership.');
      }
      const finished = row.handler_finished === 1;
      let guards: ProjectCheckJournalEntry[];
      let resources: string[];
      let owner: ResourceOwner;
      try {
        resources = normalizeKeys(JSON.parse(row.keys_json));
        owner = validateOwner(JSON.parse(row.owner_json));
        guards = readProjectCheckJournal(row.guards_json, row.check_budget, row.pid as number);
      } catch { throw new Error('Invalid coordination claim data; refusing to discard possible ownership.'); }
      if ((row.handler_finished !== 0 && !finished) || (finished && guards.length === 0)
        || (guards.length > 0 && row.state !== 'active')) throw new Error('Invalid project check guard state.');
      if (JSON.stringify(resources) !== row.keys_json) throw new Error('Coordination claim keys are not canonical.');
      const pid = row.pid as number;
      const backendDead = observe(pid) === 'dead';
      // Every helper transitions its own entry before launch. Closing an armed
      // claim invalidates delayed frames; running entries require durable drain.
      const safe = guards.every(entry => entry.phase === 'armed' || entry.phase === 'confirmed'
        || (entry.phase === 'drained' && observe(entry.guard.helperPid) === 'dead'));
      if ((backendDead || finished) && safe) {
        database.prepare('DELETE FROM claims WHERE id = ? AND instance_id = ? AND pid = ?').run(row.id, row.instance_id, pid);
        continue;
      }
      claims.push({ sequence: row.sequence as number, id: row.id, instanceId: row.instance_id, pid, resources, owner,
        queuedAt: row.queued_at, startedAt: row.started_at as string | null, state: row.state,
        guards, checkBudget: row.check_budget as number | null, guardPhase: journalPhase(guards), handlerFinished: finished });
    }
    return claims;
  }

  private stages(database: RegistryDatabase): ProjectCheckStageRecord[] {
    const registry = fs.lstatSync(this.filename, { bigint: true });
    if (!registry.isFile() || registry.nlink !== 1n || registry.dev !== this.fileIdentity?.dev || registry.ino !== this.fileIdentity?.ino
      || fs.realpathSync.native(this.filename) !== this.filename) throw new Error('Stage registry is replaced or linked.');
    directoryIdentity(path.dirname(this.filename));
    const rows = database.prepare('SELECT id,record_json FROM project_check_stages ORDER BY id LIMIT ?').all(PROJECT_CHECK_STAGE_LIMITS.roots + 1);
    if (rows.length > PROJECT_CHECK_STAGE_LIMITS.roots) throw new Error('Stage root quota exceeded; ownership preserved.');
    const stages = rows.map(row => {
      const value = row as { id: unknown; record_json: unknown }; const record = readStageRecord(value.record_json);
      if (record.id !== value.id) throw new Error('Stage journal identity mismatch.');
      return record;
    });
    if (stages.reduce((total, record) => total + record.bytes, 0) > PROJECT_CHECK_STAGE_LIMITS.bytes
      || stages.reduce((total, record) => total + record.entries, 0) > PROJECT_CHECK_STAGE_LIMITS.entries) throw new Error('Stage reservation quota exceeded; ownership preserved.');
    return stages;
  }

  /** Internal lifecycle inventory; never projected by the public coordination status. */
  projectCheckStages(): ProjectCheckStageRecord[] {
    return this.transaction(database => this.stages(database));
  }

  private retireStage(id: string, scope: ProjectCheckStageScope, cleanup: StageRetirement, ownClaimId?: string): void {
    const expectedScope = stageScope(scope);
    if (!uuid(id) || typeof cleanup !== 'function' || this.stageRetirements.has(id)) throw new Error('Invalid or reentrant stage retirement.');
    this.stageRetirements.add(id);
    try {
      const retiring = this.transaction(database => {
        const claims = this.claims(database);
        const record = this.stages(database).find(stage => stage.id === id);
        if (!record || JSON.stringify(stageScope(record)) !== JSON.stringify(expectedScope)) throw new Error('Stage scope does not match.');
        const claim = claims.find(candidate => candidate.id === record.claimId);
        if (claim && (claim.id !== ownClaimId || claim.instanceId !== this.instanceId || claim.pid !== process.pid
          || claim.state !== 'active' || claim.handlerFinished || claim.guards.some(entry => entry.phase !== 'confirmed'))) {
          throw failure('PROJECT_CHECK_CLEANUP_UNCONFIRMED', 'Stage remains owned by an active or unconfirmed source claim.', 503);
        }
        const prior = record.retirement;
        if (prior && prior.instanceId !== this.instanceId && this.liveness(prior.pid) !== 'dead') {
          throw failure('PROJECT_CHECK_CLEANUP_UNCONFIRMED', 'Stage retirement owner is alive or unknown.', 503);
        }
        assertStagePhysical(record, true);
        const next = { ...record, retirement: { token: randomUUID(), instanceId: this.instanceId, pid: process.pid } };
        const changed = database.prepare('UPDATE project_check_stages SET record_json = ? WHERE id = ? AND record_json = ? COLLATE BINARY')
          .run(JSON.stringify(next), record.id, JSON.stringify(record));
        if (changed.changes !== 1) throw new Error('Stage retirement admission was not persisted.');
        return next;
      });
      // No SQLite transaction is held during filesystem work. A failed callback
      // retains the exact journal reservation, including its retirement owner.
      const assertOwned = () => {
        this.transaction(database => {
          const current = this.stages(database).find(stage => stage.id === id);
          if (JSON.stringify(current) !== JSON.stringify(retiring)) throw new Error('Stage retirement ownership changed.');
        });
        assertStagePhysical(retiring);
      };
      if (assertStagePhysical(retiring, true)) {
        const result: unknown = cleanup(Object.freeze({ ...retiring, parent: Object.freeze({ ...retiring.parent }),
          identity: retiring.identity && Object.freeze({ ...retiring.identity }), retirement: Object.freeze({ ...retiring.retirement }),
          ...(retiring.manifest ? { manifest: Object.freeze({ ...retiring.manifest }) } : {}) }), assertOwned);
        if (result !== undefined) throw new Error('Stage cleanup must be synchronous and return no value.');
      }
      if (assertStagePhysical(retiring, true)) throw new Error('Stage cleanup did not remove the exact owned root.');
      this.transaction(database => {
        // Revalidate all ownership rows; corruption must not be erased by cleanup.
        this.stages(database);
        const changed = database.prepare('DELETE FROM project_check_stages WHERE id = ? AND record_json = ? COLLATE BINARY')
          .run(id, JSON.stringify(retiring));
        if (changed.changes !== 1) throw new Error('Stage retirement acknowledgement was not persisted.');
      });
    } finally { this.stageRetirements.delete(id); }
  }

  /** Only absent safely-reclaimed claims qualify; age and path prefix are irrelevant. */
  retireAbandonedProjectCheckStage(id: string, scope: ProjectCheckStageScope, cleanup: StageRetirement): void {
    this.retireStage(id, scope, cleanup);
  }

  status(keys: string[], workspaceId?: string): SourceCoordinationStatus {
    try {
      const normalized = normalizeKeys(keys, true);
      const claims = this.transaction(database => this.claims(database));
      const relevant: Claim[] = [];
      for (const claim of claims) {
        if (overlap(claim.resources, normalized)) relevant.push(claim);
        else if (workspaceId && claim.owner.workspaceId === workspaceId) {
          // Workspace identity can reveal the holder without revealing its resources.
          relevant.push({ ...claim, resources: [], guardPhase: null });
        }
      }
      const copy = ({ sequence: _sequence, state: _state, guards: _guards, checkBudget: _budget, guardPhase, handlerFinished: _finished, ...claim }: Claim) =>
        ({ ...claim, ...(guardPhase === null ? {} : { guardPhase }) });
      return { ...statusBase(this.instanceId), active: relevant.filter(claim => claim.state === 'active').map(copy),
        waiting: relevant.filter(claim => claim.state === 'waiting').map(copy) };
    } catch (error) { return unavailableStatus(this.instanceId, error); }
  }

  async run<T>(keys: string[], owner: ResourceOwner, task: (lease: ProjectCheckSourceLease) => T | Promise<T>, currentKeys?: () => string[]): Promise<T> {
    const resources = normalizeKeys(keys);
    const identity = validateOwner(owner);
    const id = randomUUID();
    const queuedAt = new Date().toISOString();
    const deadline = performance.now() + this.waitMs;
    let enqueued = false;
    let operationFailed = false;
    let operationError: unknown;
    let result: T;
    let leaseOpen = false;
    let guardMayExist = false;
    const frames = new Set<Readonly<ProjectCheckLaunchFrame>>();
    const stages = new Map<Readonly<ProjectCheckStageHandle>, ProjectCheckStageRecord>();
    const ownStage = (database: RegistryDatabase, handle: Readonly<ProjectCheckStageHandle>) => {
      const admitted = stages.get(handle);
      const claim = this.claims(database).find(candidate => candidate.id === id && candidate.instanceId === this.instanceId && candidate.pid === process.pid);
      if (!leaseOpen || !admitted || claim?.state !== 'active' || claim.handlerFinished) throw new Error('Stage handle has no active source claim.');
      const record = this.stages(database).find(stage => stage.id === admitted.id);
      if (!record || JSON.stringify({ ...record, retirement: null }) !== JSON.stringify({ ...admitted, retirement: null })) throw new Error('Stage handle changed.');
      return record;
    };
    const lease: ProjectCheckSourceLease = {
      ownsResource: key => leaseOpen && resources.includes(key),
      assertProjectCheckAuthority: (sourceKey, workspaceId, actorId) => {
        if (!lease.ownsResource(sourceKey) || identity.workspaceId !== workspaceId || identity.actor !== actorId) {
          throw failure('PROJECT_CHECK_SCOPE_MISMATCH', 'The source lease does not own this project check and workspace.', 403);
        }
      },
      reserveProjectCheckStage: input => {
        const scope = stageScope(input);
        lease.assertProjectCheckAuthority(scope.sourceKey, scope.workspaceId, scope.actorId);
        if (!['setup', 'snapshot'].includes(input.kind) || !Number.isSafeInteger(input.bytes) || input.bytes < 0
          || !Number.isSafeInteger(input.entries) || input.entries < 1) throw new Error('Invalid stage budget.');
        const parent = { path: localStagePath(input.parent), ...directoryIdentity(input.parent) };
        if (conflicts(canonicalSourceKey(parent.path), scope.sourceKey) || conflicts(canonicalSourceKey(parent.path), canonicalSourceKey(path.dirname(this.filename)))) {
          throw new Error('Stage parent overlaps source or coordination storage.');
        }
        const stageId = randomUUID();
        const record: ProjectCheckStageRecord = { id: stageId, root: path.join(parent.path, `x4forge-check-stage-${stageId}`), runId: scope.runId, kind: input.kind,
          sourceKey: scope.sourceKey, workspaceId: scope.workspaceId, actorId: scope.actorId, claimId: id, instanceId: this.instanceId, pid: process.pid,
          parent, identity: null, bytes: input.bytes, entries: input.entries, retirement: null };
        if (input.manifest !== undefined) {
          record.manifest = manifestPin(input.manifest);
          record.quarantineRoot = path.join(parent.path, `x4forge-check-retiring-${stageId}`);
        }
        readStageRecord(JSON.stringify(record));
        this.transaction(database => {
          const own = this.claims(database).find(claim => claim.id === id && claim.instanceId === this.instanceId && claim.pid === process.pid);
          const prior = this.stages(database);
          if (!leaseOpen || own?.state !== 'active' || own.handlerFinished || own.guards.some(entry => entry.guard.runId !== scope.runId)
            || prior.some(stage => stage.claimId === id && (stage.runId !== scope.runId || stage.retirement))) throw new Error('Stage reservation lost exact run ownership.');
          if (prior.length >= PROJECT_CHECK_STAGE_LIMITS.roots
            || prior.reduce((total, stage) => total + stage.bytes, input.bytes) > PROJECT_CHECK_STAGE_LIMITS.bytes
            || prior.reduce((total, stage) => total + stage.entries, input.entries) > PROJECT_CHECK_STAGE_LIMITS.entries) throw failure('PROJECT_CHECK_STAGE_LIMIT', 'Private project-check staging budget is occupied; no payload was created.');
          if (fs.lstatSync(record.root, { throwIfNoEntry: false })) throw new Error('Reserved stage path is already occupied.');
          if (record.quarantineRoot && fs.lstatSync(record.quarantineRoot, { throwIfNoEntry: false })) throw new Error('Reserved quarantine path is already occupied.');
          if (JSON.stringify(directoryIdentity(parent.path)) !== JSON.stringify(physicalIdentity(parent))) throw new Error('Stage parent changed before reservation.');
          database.prepare('INSERT INTO project_check_stages (id,record_json) VALUES (?,?)').run(record.id, JSON.stringify(record));
        });
        const handle = Object.freeze({ id: record.id, root: record.root, runId: record.runId, kind: record.kind });
        stages.set(handle, record); return handle;
      },
      adoptProjectCheckStage: (handle, created) => {
        const adopted = this.transaction(database => {
          const record = ownStage(database, handle);
          if (record.identity || record.retirement) throw new Error('Stage is already adopted or retiring.');
          const identity = directoryIdentity(record.root);
          if (record.quarantineRoot && fs.lstatSync(record.quarantineRoot, { throwIfNoEntry: false })) throw new Error('Unadopted stage quarantine is occupied.');
          if (JSON.stringify(identity) !== JSON.stringify(physicalIdentity(created))) throw new Error('Stage root differs from the created directory.');
          if (fs.readdirSync(record.root).length || JSON.stringify(directoryIdentity(record.parent.path)) !== JSON.stringify(physicalIdentity(record.parent))) throw new Error('Stage must be empty under its original parent before adoption.');
          const next = { ...record, identity };
          const changed = database.prepare('UPDATE project_check_stages SET record_json = ? WHERE id = ? AND record_json = ? COLLATE BINARY')
            .run(JSON.stringify(next), record.id, JSON.stringify(record));
          if (changed.changes !== 1) throw new Error('Stage adoption was not persisted.');
          return next;
        });
        stages.set(handle, adopted);
      },
      assertProjectCheckStage: handle => {
        this.transaction(database => {
          const record = ownStage(database, handle);
          if (record.retirement) throw new Error('Stage is retiring.');
          assertStagePhysical(record);
        });
      },
      retireProjectCheckStage: (handle, cleanup) => {
        const record = this.transaction(database => ownStage(database, handle));
        this.retireStage(record.id, record, cleanup, id);
      },
      armProjectCheck: (input, maxParallelChecks = 1) => {
        if (!leaseOpen) throw failure('SOURCE_COORDINATION_LOST', 'Project check requires active source ownership.', 503);
        const guard = validateProjectCheckGuard(input);
        if (!Number.isInteger(maxParallelChecks) || maxParallelChecks < 1 || maxParallelChecks > PROJECT_CHECK_MAX_PARALLEL) {
          throw failure('PROJECT_CHECK_GUARD_INVALID', 'Project check count budget must be an integer from 1 to 4.');
        }
        guardMayExist = true;
        const frame = this.transaction(database => {
          const own = this.claims(database).find(claim => claim.id === id && claim.instanceId === this.instanceId && claim.pid === process.pid);
          if (!own || own.state !== 'active' || own.handlerFinished) throw failure('SOURCE_COORDINATION_LOST', 'Project check lost its exact active claim.', 503);
          if (this.stages(database).some(stage => stage.claimId === id && (stage.runId !== guard.runId || stage.retirement))) {
            throw failure('PROJECT_CHECK_GUARD_INVALID', 'Project check stage run is different or already retiring.');
          }
          if ((own.checkBudget !== null && own.checkBudget !== maxParallelChecks)
            || own.guards.some(entry => entry.guard.runId !== guard.runId)) {
            throw failure('PROJECT_CHECK_GUARD_INVALID', 'Project checks on one claim must retain the same run and count budget.');
          }
          if (own.guards.some(({ guard: prior }) => prior.jobName === guard.jobName || prior.commandHash === guard.commandHash
            || prior.bindingHash === guard.bindingHash)) throw failure('PROJECT_CHECK_GUARD_REPLAY', 'This Job or command was already admitted on the source lease.');
          if (own.guards.length >= MAX_PROJECT_CHECK_GUARDS) throw failure('PROJECT_CHECK_GUARD_LIMIT', 'The source lease reached its project check limit.');
          const active = own.guards.filter(entry => entry.phase !== 'confirmed');
          if (active.length >= maxParallelChecks) throw failure(maxParallelChecks === 1 ? 'PROJECT_CHECK_REARM_UNCONFIRMED' : 'PROJECT_CHECK_GUARD_CAPACITY',
            'Project check count budget is occupied until exact prior drain and helper exit are confirmed.', 503);
          if (process.platform !== 'win32' || guard.helperPid === process.pid || this.liveness(guard.helperPid) !== 'alive'
            || active.some(entry => entry.guard.helperPid === guard.helperPid)) throw failure('PROJECT_CHECK_GUARD_INVALID', 'Project check must use a distinct live helper.');
          const registry = fs.realpathSync.native(this.filename);
          const stat = fs.statSync(registry, { bigint: true });
          if (!stat.isFile() || stat.nlink !== 1n || stat.dev !== this.fileIdentity?.dev || stat.ino !== this.fileIdentity?.ino) {
            throw new Error('Project check coordination file changed or is linked.');
          }
          const guardJson = JSON.stringify(persistedProjectCheckGuard({
            ...guard, registryDevice: (stat.dev & 0xffff_ffffn).toString(), registryFile: stat.ino.toString(),
          }));
          const entries: ProjectCheckJournalEntry[] = [...own.guards, { guard: JSON.parse(guardJson) as PersistedProjectCheckGuard, phase: 'armed' }];
          const changed = database.prepare("UPDATE claims SET guards_json = ?, check_budget = ? WHERE id = ? AND instance_id = ? AND pid = ? AND state = 'active' AND handler_finished = 0 AND guards_json = ? COLLATE BINARY AND check_budget IS ?")
            .run(JSON.stringify(entries), maxParallelChecks, id, this.instanceId, process.pid, JSON.stringify(own.guards), own.checkBudget);
          if (changed.changes !== 1) {
            throw failure('SOURCE_COORDINATION_LOST', 'Could not arm the exact active source claim.', 503);
          }
          return Object.freeze({ registry, claimId: id, instanceId: this.instanceId, backendPid: process.pid, guardJson });
        });
        frames.add(frame);
        return frame;
      },
      assertProjectCheckDrained: frame => {
        if (!leaseOpen || !frames.has(frame)) {
          throw failure('SOURCE_COORDINATION_LOST', 'Project check drain is not bound to this active claim.', 503);
        }
        this.transaction(database => {
          const own = this.claims(database).find(claim => claim.id === id && claim.instanceId === this.instanceId && claim.pid === process.pid);
          const entry = own?.guards.find(item => JSON.stringify(item.guard) === frame.guardJson);
          if (own?.state !== 'active' || own.handlerFinished || !entry || entry.phase !== 'drained' || this.liveness(entry.guard.helperPid) !== 'dead') {
            throw failure('PROJECT_CHECK_CLEANUP_UNCONFIRMED', 'Project check has no verified drain and helper exit for this claim.', 503);
          }
          const before = JSON.stringify(own.guards);
          entry.phase = 'confirmed';
          const updated = database.prepare("UPDATE claims SET guards_json = ? WHERE id = ? AND instance_id = ? AND pid = ? AND handler_finished = 0 AND guards_json = ? COLLATE BINARY")
            .run(JSON.stringify(own.guards), id, this.instanceId, process.pid, before);
          if (updated.changes !== 1) throw failure('PROJECT_CHECK_CLEANUP_UNCONFIRMED', 'Project check drain acknowledgement was not persisted.', 503);
        });
        frames.delete(frame);
      },
    };
    this.inFlight++;
    try {
      this.transaction(database => {
        if (this.claims(database).length >= this.maxPending) throw failure('RESOURCE_QUEUE_FULL', 'Shared source operation queue is full; retry after current work completes.');
        database.prepare('INSERT INTO claims (id,instance_id,pid,keys_json,owner_json,queued_at,protocol,started_at,state) VALUES (?,?,?,?,?,?,?,NULL,\'waiting\')')
          .run(id, this.instanceId, process.pid, JSON.stringify(resources), JSON.stringify(identity), queuedAt, SOURCE_COORDINATION_SCHEMA_VERSION);
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
      leaseOpen = true;
      result = await task(lease);
    } catch (error) {
      operationFailed = true;
      operationError = error;
    }
    leaseOpen = false;
    try {
      const retained = enqueued && this.transaction(database => {
        const own = guardMayExist
          ? this.claims(database).find(claim => claim.id === id && claim.instanceId === this.instanceId && claim.pid === process.pid)
          : undefined;
        if (own?.guards.some(entry => entry.phase === 'running'
          || (entry.phase === 'drained' && this.liveness(entry.guard.helperPid) !== 'dead'))) {
          database.prepare('UPDATE claims SET handler_finished = 1 WHERE id = ? AND instance_id = ? AND pid = ?')
            .run(id, this.instanceId, process.pid);
          return true;
        }
        database.prepare('DELETE FROM claims WHERE id = ? AND instance_id = ? AND pid = ?').run(id, this.instanceId, process.pid);
        return false;
      });
      if (retained) throw failure('PROJECT_CHECK_CLEANUP_UNCONFIRMED', 'Project check ownership retained until its helper exits with durable cleanup evidence.', 503);
    } catch (cleanupError) {
      // If storage fails, retaining ownership is safer than guessing it was released.
      // Never imply handler rollback, and preserve both failures for diagnostics.
      if (operationFailed) throw Object.assign(new AggregateError([operationError, cleanupError],
        `Source operation failed (${operationError instanceof Error ? operationError.message : String(operationError)}); coordination cleanup also failed. Ownership may remain until process exit.`),
      { code: 'SOURCE_COORDINATION_UNAVAILABLE', status: 503, category: 'forge-infrastructure' });
      if (cleanupError instanceof Error && 'code' in cleanupError && cleanupError.code === 'PROJECT_CHECK_CLEANUP_UNCONFIRMED') throw cleanupError;
      throw failure('SOURCE_COORDINATION_UNAVAILABLE',
        `Source operation completed but coordination cleanup failed. Writes may already have occurred; ownership may remain until process exit. ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 503);
    } finally { this.inFlight--; }
    if (operationFailed) throw operationError;
    return result!;
  }

  /** Tests/owned shutdown only: never drop an active claim merely to close a connection. */
  close(): void {
    if (this.inFlight || this.stageRetirements.size) throw failure('SOURCE_COORDINATION_BUSY', 'Cannot close coordination while operations are in flight.');
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
  run<T>(keys: string[], owner: ResourceOwner, task: (lease: ProjectCheckSourceLease) => T | Promise<T>, currentKeys?: () => string[]): Promise<T> {
    try { return coordinator().run(keys, owner, task, currentKeys); }
    catch (error) { return Promise.reject(unavailable(error)); }
  },
  status(keys: string[], workspaceId?: string): SourceCoordinationStatus {
    try { return coordinator().status(keys, workspaceId); }
    catch (error) { return unavailableStatus(defaultInstanceId, error); }
  },
};
