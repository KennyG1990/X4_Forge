import type { WorkspaceSourceSplice } from './workspaceUndoHistory';
import type { X4UiCallModel } from './x4UiCallModel';

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

export function createPreviewSourceMapper(
  beforeText: string, afterText: string, splice: WorkspaceSourceSplice,
  models?: { readonly before: X4UiCallModel; readonly after: X4UiCallModel },
) {
  if (typeof splice?.path !== 'string' || typeof splice.expectedText !== 'string' || typeof splice.replacement !== 'string'
    || !Number.isSafeInteger(splice.startOffset) || !Number.isSafeInteger(splice.endOffset)
    || splice.startOffset < 0 || splice.endOffset < splice.startOffset || splice.endOffset > beforeText.length
    || beforeText.slice(splice.startOffset, splice.endOffset) !== splice.expectedText
    || afterText !== beforeText.slice(0, splice.startOffset) + splice.replacement + beforeText.slice(splice.endOffset)) return undefined;
  if (models && (!models.before.parsed || !models.after.parsed
    || models.before.file.text !== beforeText || models.after.file.text !== afterText
    || (models.before.file.sourcePath ?? models.before.file.rel) !== splice.path
    || (models.after.file.sourcePath ?? models.after.file.rel) !== splice.path)) return undefined;
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
  // IDs contain source offsets. Resolve them through the caller's existing parsed
  // models, then compare mapped source identity INCLUDING the selected callee.
  // Same dispatch slot is not proof of the same function after a table edit.
  // This is correspondence only; callers still own issuance and CAS validation.
  const invocations = (value: unknown, move: boolean): unknown => {
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string')
      || new Set(value).size !== value.length) throw new Error('invalid path invocation identities');
    if (!models) return value;
    const model = move ? models.before : models.after;
    return value.map(id => {
      const matches = model.localInvocations.filter(invocation => invocation.id === id);
      if (matches.length !== 1) throw new Error('path invocation is not unique in source');
      const invocation = matches[0]!;
      const declarations = model.localFunctions.filter(declaration => declaration.id === invocation.calleeDeclarationId);
      if (invocation.status !== 'supported' || declarations.length !== 1) throw new Error('path callee is not source-resolved');
      const declaration = declarations[0]!;
      return key([
        range(invocation.source, move), range(invocation.calleeSource, move), invocation.calleeExpression,
        invocation.method, invocation.resolution, invocation.resultConsumed,
        range(declaration.source, move), range(declaration.identifierSource, move), range(declaration.bodySource, move),
        declaration.name, declaration.hasVarargs,
        declaration.parameters.map(parameter => [parameter.index, parameter.name, range(parameter.source, move)]),
        invocation.context.branchPath.map(segment => [range(segment.boundary, move), segment.arm,
          segment.armIndex, segment.label ?? null, segment.reachability]),
      ]);
    }).sort();
  };
  const descriptor = (kind: 'path' | 'loop' | 'sample', value: unknown, move: boolean): unknown => {
    if (!record(value)) throw new Error('invalid preview descriptor');
    if (kind === 'path') return [range(value.boundary, move), value.arm, value.armIndex, value.label ?? null,
      value.reachability, invocations(value.invocationIds, move)];
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
