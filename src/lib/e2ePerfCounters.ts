export type E2EPerfCounterName = 'generateMDXML' | 'validateModWorkspace';

export type E2EPerfCounters = {
  generateMDXML: number;
  validateModWorkspace: number;
  bySource: Record<string, number>;
};

const emptyCounters = (): E2EPerfCounters => ({
  generateMDXML: 0,
  validateModWorkspace: 0,
  bySource: {},
});

type E2EPerfWindow = Window & {
  __X4_E2E_PERF__?: E2EPerfCounters;
};

const perfWindow = (): E2EPerfWindow | null => {
  if (typeof window === 'undefined') return null;
  return window as E2EPerfWindow;
};

const ensureCounters = (): E2EPerfCounters | null => {
  const target = perfWindow();
  if (!target) return null;
  if (!target.__X4_E2E_PERF__) target.__X4_E2E_PERF__ = emptyCounters();
  return target.__X4_E2E_PERF__;
};

export function resetE2EPerfCounters(): E2EPerfCounters {
  const target = perfWindow();
  const next = emptyCounters();
  if (target) target.__X4_E2E_PERF__ = next;
  return next;
}

export function getE2EPerfCounters(): E2EPerfCounters {
  const counters = ensureCounters();
  return counters ? {
    generateMDXML: counters.generateMDXML,
    validateModWorkspace: counters.validateModWorkspace,
    bySource: { ...counters.bySource },
  } : emptyCounters();
}

export function markE2EPerfCounter(name: E2EPerfCounterName, source: string): void {
  const target = perfWindow();
  const counters = target?.__X4_E2E_PERF__;
  if (!counters) return;
  counters[name] += 1;
  counters.bySource[source] = (counters.bySource[source] || 0) + 1;
}
