import type { ForgePerformanceResourceSample } from './forgePerformance';

export interface ForgeProcessResourceBaseline {
  now: number;
  cpu: { user: number; system: number };
  loop?: { idle: number; active: number; utilization?: number };
}

export type ForgeProcessResourceDeltaFields = Partial<Pick<
  ForgePerformanceResourceSample,
  | 'elapsedMs'
  | 'cpuUserMicros'
  | 'cpuSystemMicros'
  | 'cpuOneCorePercent'
  | 'cpuHostPercent'
  | 'eventLoopUtilization'
>>;

/**
 * Existing process-interval arithmetic only. Producers own reading validation,
 * identity, throttling, baseline replacement, counters and recording failures.
 * Unavailable deltas remain absent for the collector to represent as null.
 */
export function calculateForgeProcessResourceDelta(
  current: ForgeProcessResourceBaseline,
  previous: ForgeProcessResourceBaseline | undefined,
  logicalCpuCount: number,
): { fields: ForgeProcessResourceDeltaFields; counterReset: boolean } {
  const fields: ForgeProcessResourceDeltaFields = {};
  if (previous && current.now > previous.now
    && current.cpu.user >= previous.cpu.user && current.cpu.system >= previous.cpu.system) {
    fields.elapsedMs = current.now - previous.now;
    fields.cpuUserMicros = current.cpu.user - previous.cpu.user;
    fields.cpuSystemMicros = current.cpu.system - previous.cpu.system;
    const oneCore = (fields.cpuUserMicros + fields.cpuSystemMicros) / (fields.elapsedMs * 1000) * 100;
    fields.cpuOneCorePercent = Number.isFinite(oneCore) && oneCore >= 0 ? oneCore : null;
    const host = oneCore / logicalCpuCount;
    fields.cpuHostPercent = Number.isFinite(host) && host >= 0 && host <= 100 ? host : null;
    if (current.loop && previous.loop
      && current.loop.active >= previous.loop.active && current.loop.idle >= previous.loop.idle) {
      const used = current.loop.active - previous.loop.active;
      const total = used + current.loop.idle - previous.loop.idle;
      fields.eventLoopUtilization = total > 0 ? used / total : null;
    }
    return { fields, counterReset: false };
  }
  return { fields, counterReset: Boolean(previous) };
}
