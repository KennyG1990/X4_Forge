import { createHash } from 'node:crypto';
import { MAX_SCRIPT_ORIGIN_SOURCE_CHARS, simulateXmlDiff, traceScriptNameOrigins, validateDiffSourceXml } from './x4XmlDiff';
import { readWorkspaceScriptSymbols, type EffectiveScriptOrigins, type WorkspaceScriptSymbol } from './workspaceScriptSymbols';

export interface ScriptCompositionInput {
  source: string;
  path: string;
  text: string;
}

export function projectScriptSymbolOrigins(
  path: string, expected: string, sources: readonly ScriptCompositionInput[],
): EffectiveScriptOrigins {
  const [base, ...patches] = sources;
  const trace = traceScriptNameOrigins(base.text, patches.map(source => source.text));
  if (!trace || trace.content !== expected.replace(/^\uFEFF/, '')) {
    return { complete: false, detail: 'Bounded name tracing could not reproduce the effective script.', symbols: [] };
  }
  const key = (range: Pick<WorkspaceScriptSymbol, 'start' | 'end'>) => JSON.stringify([range.start.line, range.start.column,
    range.end.line, range.end.column]);
  const locations = new Map(trace.names.map(origin => [key(origin.effective), origin]));
  const hashes = sources.map(source => createHash('sha256').update(source.text).digest('hex'));
  const effective = readWorkspaceScriptSymbols(path, trace.content, 'Effective reference');
  const symbols = effective.flatMap(symbol => {
    const origin = locations.get(key(symbol));
    if (!origin) return [];
    const source = sources[origin.source];
    return [{ ...symbol, ...origin.range, file: source.path, origin: source.source, sourceHash: hashes[origin.source] }];
  });
  return effective.some(symbol => symbol.kind === 'script') && symbols.length === effective.length
    ? { complete: true, symbols }
    : { complete: false, detail: 'An effective declaration has no exact contiguous authored span.', symbols: [] };
}

export function composePackedScriptOrigins(path: string, sources: readonly ScriptCompositionInput[]): EffectiveScriptOrigins | undefined {
  if (!sources.length || sources.length > 17
    || sources.reduce((bytes, source) => bytes + source.text.length, 0) > MAX_SCRIPT_ORIGIN_SOURCE_CHARS) return undefined;
  const [base, ...patches] = sources;
  if (validateDiffSourceXml(base.text).length) return undefined;
  let content = base.text;
  for (const patch of patches) {
    if (validateDiffSourceXml(patch.text).length) return undefined;
    const next = simulateXmlDiff(content, patch.text);
    if (!next.ok || next.content.length > MAX_SCRIPT_ORIGIN_SOURCE_CHARS) return undefined;
    content = next.content;
  }
  return projectScriptSymbolOrigins(path, content, sources);
}
