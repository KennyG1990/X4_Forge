import { buildX4UiCallModel, type X4UiLuaFileInput } from './x4UiCallModel';
import { lintX4UiCallModel, type X4UiLintResult } from './x4UiLint';

const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

/** Process-local cache of pure file-local facts, never project validation verdicts. */
export function createX4UiAnalysisCache(
  limits = { maxEntries: DEFAULT_MAX_ENTRIES, maxBytes: DEFAULT_MAX_BYTES },
  compute: (input: X4UiLuaFileInput) => X4UiLintResult = input => lintX4UiCallModel(buildX4UiCallModel(input)),
) {
  const { maxEntries, maxBytes } = limits;
  for (const value of [maxEntries, maxBytes]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Cache limits must be nonnegative safe integers.');
  }
  const entries = new Map<string, { result: X4UiLintResult; bytes: number }>();
  let accountedBytes = 0;
  let hits = 0;
  let misses = 0;
  let bypasses = 0;
  let evictions = 0;
  return {
    analyze(input: X4UiLuaFileInput): X4UiLintResult {
      // Bound retained payload, not the size of inputs the validator may inspect.
      // An oversized source is still analyzed in full and never silently truncated.
      const sourceBytes = 2 * (input.rel.length + input.text.length + (input.sourcePath?.length || 0));
      if (!maxEntries || sourceBytes > maxBytes) {
        misses++; bypasses++;
        return compute(input);
      }
      const key = JSON.stringify([input.rel, input.sourcePath ?? null, input.text]);
      const cached = entries.get(key);
      if (cached) {
        hits++;
        entries.delete(key); entries.set(key, cached);
        return structuredClone(cached.result);
      }
      misses++;
      // Exceptions are deliberately not memoized; a later attempt can recover.
      const result = compute(input);
      // UTF-16 key plus serialized-result payload accounting is deterministic;
      // object/Map overhead is also bounded by entry count, not an exact heap claim.
      const bytes = 2 * (key.length + JSON.stringify(result).length);
      if (bytes > maxBytes) { bypasses++; return result; }
      while (entries.size >= maxEntries || accountedBytes + bytes > maxBytes) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        accountedBytes -= entries.get(oldest)!.bytes;
        entries.delete(oldest); evictions++;
      }
      entries.set(key, { result: structuredClone(result), bytes });
      accountedBytes += bytes;
      return result;
    },
    stats() { return { hits, misses, bypasses, evictions, entries: entries.size, accountedBytes }; },
    clear() { entries.clear(); accountedBytes = hits = misses = bypasses = evictions = 0; },
  };
}

const sharedCache = createX4UiAnalysisCache();
export const analyzeX4UiFile = sharedCache.analyze;
/** Deterministic observability for focused tests; not an API or persistent store. */
export const getX4UiAnalysisCacheStats = sharedCache.stats;
export const clearX4UiAnalysisCache = sharedCache.clear;
