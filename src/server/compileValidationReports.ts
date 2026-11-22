import { createHash, randomUUID } from 'node:crypto';

const MAX_ENTRIES = 16;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_REPORT_BYTES = 12 * 1024 * 1024;
const TTL_MS = 2 * 60 * 1000;

export type CompileValidationCapture =
  | { status: 'retained'; id: string; sha256: string; bytes: number; expiresAt: string }
  | { status: 'too-large' | 'unavailable' };

interface Entry {
  workspaceId: string;
  expires: number;
  body: Buffer;
}

/** Completed replies only. Reading an ID cannot invoke validation or extend its lifetime. */
export function createCompileValidationReports({
  now = Date.now, maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES, maxReportBytes = MAX_REPORT_BYTES, ttlMs = TTL_MS,
} = {}) {
  const entries = new Map<string, Entry>();
  let byteCount = 0;
  function remove(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    byteCount -= entry.body.length;
    entries.delete(id);
  }
  return {
    capture(workspaceId: string, report: unknown): CompileValidationCapture {
      try {
        const serialized = JSON.stringify(report);
        if (!serialized || maxEntries < 1) return { status: 'unavailable' };
        const bytes = Buffer.byteLength(serialized);
        if (bytes > maxReportBytes || bytes > maxBytes) return { status: 'too-large' };
        const current = now();
        for (const [id, entry] of entries) if (entry.expires <= current) remove(id);
        while (entries.size >= maxEntries || byteCount + bytes > maxBytes) {
          const oldest = entries.keys().next().value;
          if (!oldest) return { status: 'unavailable' };
          remove(oldest);
        }
        const body = Buffer.from(serialized);
        const id = randomUUID();
        const expires = current + ttlMs;
        const sha256 = createHash('sha256').update(body).digest('hex');
        const expiresAt = new Date(expires).toISOString();
        entries.set(id, { workspaceId, expires, body });
        byteCount += bytes;
        return { status: 'retained', id, sha256, bytes, expiresAt };
      } catch {
        // An optional capture failure cannot change the compile verdict.
        return { status: 'unavailable' };
      }
    },
    read(workspaceId: string, id: string): Buffer | undefined {
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) return undefined;
      const entry = entries.get(id);
      return entry && entry.workspaceId === workspaceId && entry.expires > now() ? Buffer.from(entry.body) : undefined;
    },
  };
}
