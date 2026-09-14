import type { WorkspaceSourceSplice } from './workspaceUndoHistory';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const key = (value: unknown): string => JSON.stringify(value);

/** Exact interval map shared by source validation and local scenario continuation. */
export function mapPreviewSourceRange(start: number, end: number, splice: WorkspaceSourceSplice): readonly [number, number] | undefined {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return undefined;
  const retained = splice.retainedSpans?.filter(span => start >= span.beforeStart && end <= span.beforeEnd) ?? [];
  if (retained.length === 1) return [retained[0]!.afterStart + start - retained[0]!.beforeStart, retained[0]!.afterStart + end - retained[0]!.beforeStart];
  if (retained.length > 1) return undefined;
  const delta = splice.replacement.length - (splice.endOffset - splice.startOffset);
  if (end <= splice.startOffset) return [start, end];
  if (start >= splice.endOffset) return [start + delta, end + delta];
  if (start <= splice.startOffset && end >= splice.endOffset && (start < splice.startOffset || end > splice.endOffset)) return [start, end + delta];
  return undefined;
}

export function createPreviewSourceMapper(beforeText: string, afterText: string, splice: WorkspaceSourceSplice) {
  if (typeof splice?.path !== 'string' || typeof splice.expectedText !== 'string' || typeof splice.replacement !== 'string'
    || !Number.isSafeInteger(splice.startOffset) || !Number.isSafeInteger(splice.endOffset)
    || splice.startOffset < 0 || splice.endOffset < splice.startOffset || splice.endOffset > beforeText.length
    || beforeText.slice(splice.startOffset, splice.endOffset) !== splice.expectedText
    || afterText !== beforeText.slice(0, splice.startOffset) + splice.replacement + beforeText.slice(splice.endOffset)) return undefined;
  const spans = splice.retainedSpans ?? [];
  if (!Array.isArray(spans) || spans.length > 2 || spans.some(span => !Number.isSafeInteger(span.beforeStart)
    || !Number.isSafeInteger(span.beforeEnd) || !Number.isSafeInteger(span.afterStart)
    || span.beforeStart < splice.startOffset || span.beforeEnd > splice.endOffset || span.beforeEnd <= span.beforeStart
    || span.afterStart < splice.startOffset || span.afterStart + span.beforeEnd - span.beforeStart > splice.startOffset + splice.replacement.length
    || beforeText.slice(span.beforeStart, span.beforeEnd) !== afterText.slice(span.afterStart, span.afterStart + span.beforeEnd - span.beforeStart))) return undefined;
  if (spans.length === 2 && (Math.max(spans[0]!.beforeStart, spans[1]!.beforeStart) < Math.min(spans[0]!.beforeEnd, spans[1]!.beforeEnd)
    || Math.max(spans[0]!.afterStart, spans[1]!.afterStart) < Math.min(spans[0]!.afterStart + spans[0]!.beforeEnd - spans[0]!.beforeStart,
      spans[1]!.afterStart + spans[1]!.beforeEnd - spans[1]!.beforeStart))) return undefined;
  const range = (value: unknown, move: boolean): unknown => {
    if (!record(value) || !record(value.start) || !record(value.end) || typeof value.file !== 'string'
      || !Number.isSafeInteger(value.start.offset) || !Number.isSafeInteger(value.end.offset)) throw new Error('invalid source range');
    const offsets = move && (value.sourcePath ?? value.file) === splice.path
      ? mapPreviewSourceRange(Number(value.start.offset), Number(value.end.offset), splice) : [value.start.offset, value.end.offset];
    if (offsets === undefined) throw new Error('replaced source range');
    return [value.file, value.sourcePath ?? null, ...offsets];
  };
  const loop = (value: unknown, move: boolean): unknown => {
    if (value === undefined) return null;
    if (!record(value)) throw new Error('invalid loop identity');
    return [range(value.source, move), value.kind, value.multiplicity, value.depth, value.iteration, value.iterationCount];
  };
  const descriptor = (kind: 'path' | 'loop' | 'sample', value: unknown, move: boolean): unknown => {
    if (!record(value)) throw new Error('invalid preview descriptor');
    if (kind === 'path') return [range(value.boundary, move), value.arm, value.armIndex, value.reachability, value.invocationIds];
    if (kind === 'loop') return [range(value.source, move), value.kind, value.multiplicity, value.depth];
    if (!Array.isArray(value.consumers)) throw new Error('invalid sample consumers');
    return [range(value.source, move), value.expression, value.expectedType, loop(value.previewLoop, move), value.consumers.map(consumer => {
      if (!record(consumer)) throw new Error('invalid sample consumer');
      return key([range(consumer.source, move), consumer.operationKind, consumer.field, loop(consumer.previewLoop, move)]);
    }).sort()];
  };
  return { range, matches: (kind: 'path' | 'loop' | 'sample', before: unknown, after: unknown): boolean => {
    try { return key(descriptor(kind, before, true)) === key(descriptor(kind, after, false)); } catch { return false; }
  } };
}
