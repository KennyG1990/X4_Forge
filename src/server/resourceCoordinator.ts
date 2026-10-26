import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ResourceOwner { actor: string; operation: string; workspaceId?: string }
interface Entry { id: string; keys: string[]; owner: ResourceOwner; queuedAt: string; startedAt?: string }
interface Waiting extends Entry { start(): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout> }
const failure = (code: string, message: string) => Object.assign(new Error(message), { code, status: 409 });

/** Resolve aliases even for a not-yet-created descendant; never create a directory to lock it. */
export function canonicalSourceKey(input: string): string {
  let cursor = path.resolve(input);
  const suffix: string[] = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw failure('SOURCE_UNAVAILABLE', 'Cannot resolve source resource.');
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  let resolved = path.join(fs.realpathSync.native(cursor), ...suffix);
  if (process.platform === 'win32') resolved = resolved.toLowerCase();
  return `source:${resolved}`;
}

function conflicts(a: string, b: string): boolean {
  return a === b || (a.startsWith('source:') && b.startsWith('source:')
    && (a.startsWith(b.endsWith(path.sep) ? b : b + path.sep) || b.startsWith(a.endsWith(path.sep) ? a : a + path.sep)));
}
const overlaps = (a: Entry, b: Entry) => a.keys.some(x => b.keys.some(y => conflicts(x, y)));

/** Cooperative, process-scoped serialization. Does not claim authority over external editors. */
export class ResourceCoordinator {
  private readonly active = new Map<string, Entry>();
  private readonly waiting: Waiting[] = [];
  constructor(private readonly maxPending = 256, private readonly waitMs = 120_000) {}

  status(keys: string[]) {
    const subject: Entry = { id: '', keys, owner: { actor: '', operation: '' }, queuedAt: '' };
    const copy = (entry: Entry) => ({ id: entry.id, resources: [...entry.keys], owner: { ...entry.owner }, queuedAt: entry.queuedAt, startedAt: entry.startedAt ?? null });
    return { scope: 'server-process' as const, pid: process.pid, controlsExternalEditors: false,
      controlsOtherProcesses: false, active: [...this.active.values()].filter(e => overlaps(e, subject)).map(copy),
      waiting: this.waiting.filter(e => overlaps(e, subject)).map(copy) };
  }

  async run<T>(keys: string[], owner: ResourceOwner, task: () => T | Promise<T>, currentKeys?: () => string[]): Promise<T> {
    if (!keys.length || keys.some(key => !key)) throw failure('RESOURCE_KEYS_INVALID', 'Resource keys must be nonempty.');
    if (this.active.size + this.waiting.length >= this.maxPending) throw failure('RESOURCE_QUEUE_FULL', 'Source operation queue is full; retry after current work completes.');
    const entry: Entry = { id: randomUUID(), keys: [...new Set(keys)].sort(), owner: { ...owner }, queuedAt: new Date().toISOString() };
    await new Promise<void>((resolve, reject) => {
      const waiting: Waiting = { ...entry, start: resolve, reject };
      waiting.timer = setTimeout(() => {
        const index = this.waiting.indexOf(waiting);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        reject(failure('RESOURCE_QUEUE_TIMEOUT', 'Source operation did not start before its queue deadline; no work was performed.'));
        this.pump();
      }, this.waitMs);
      this.waiting.push(waiting);
      this.pump();
    });
    try {
      if (currentKeys && JSON.stringify([...new Set(currentKeys())].sort()) !== JSON.stringify(entry.keys)) {
        throw failure('SOURCE_COORDINATION_CHANGED', 'Source/configuration aliases changed while waiting; obtain fresh state before retrying.');
      }
      return await task();
    }
    finally { this.active.delete(entry.id); this.pump(); }
  }

  private pump() {
    for (let i = 0; i < this.waiting.length;) {
      const candidate = this.waiting[i];
      // FIFO only among overlapping resources: unrelated mods need not wait.
      if ([...this.active.values(), ...this.waiting.slice(0, i)].some(e => overlaps(e, candidate))) { i++; continue; }
      this.waiting.splice(i, 1);
      clearTimeout(candidate.timer);
      this.active.set(candidate.id, { id: candidate.id, keys: candidate.keys, owner: candidate.owner,
        queuedAt: candidate.queuedAt, startedAt: new Date().toISOString() });
      candidate.start();
    }
  }
}

export const forgeResourceCoordinator = new ResourceCoordinator();
