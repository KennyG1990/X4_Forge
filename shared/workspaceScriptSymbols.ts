import type { BigIntStats } from 'node:fs';
import { readAiScriptWorkspaceDocument } from './aiScriptNavigation';
import { authoredNavigationMarkupIssue, hasInvalidNavigationPathCharacters, readMdDefinitionDocument, MAX_MD_DEFINITION_SOURCE } from './mdScriptNavigation';
import { createSourcePositionLocator } from './xmlSourcePosition';

interface SymbolPosition { line: number; column: number }
export interface WorkspaceScriptSymbol {
  name: string;
  qualifiedName: string;
  container: string;
  kind: 'script' | 'cue' | 'library' | 'interrupt-handler';
  originPriority?: number;
  file: string;
  start: SymbolPosition;
  end: SymbolPosition;
}


export const MAX_SCRIPT_ORIGIN_INPUTS = 96;

export interface ScriptOriginInput {
  path: string;
  stamp: string | null;
}

export interface EffectiveScriptOriginSymbol extends WorkspaceScriptSymbol {
  origin: string;
  sourceHash: string;
}

export interface EffectiveScriptOrigins {
  complete: boolean;
  detail?: string;
  identity?: string;
  inputs?: ScriptOriginInput[];
  symbols: EffectiveScriptOriginSymbol[];
}

export function scriptOriginInputStamp(stamp: BigIntStats): string {
  return [stamp.dev, stamp.ino, stamp.mode, stamp.nlink, stamp.size, stamp.mtimeNs, stamp.ctimeNs, stamp.birthtimeNs].join(':');
}

/** Locate declarations in one selected script. The caller owns the source selection and freshness. */
export function readWorkspaceScriptSymbols(file: string, source: string, origin: string): WorkspaceScriptSymbol[] {
  const normalized = file.replace(/\\/g, '/');
  const dialect = /^(md|aiscripts)\/[^/]+\.xml$/i.exec(normalized)?.[1].toLowerCase();
  if (!dialect || hasInvalidNavigationPathCharacters(normalized) || source.length > MAX_MD_DEFINITION_SOURCE
    || authoredNavigationMarkupIssue(source)) return [];
  const text = source.replace(/^\uFEFF/, '');

  if (dialect === 'aiscripts') {
    const { name, declaration, interruptLibraries } = readAiScriptWorkspaceDocument(normalized, text);
    if (!name || !declaration || normalized !== `aiscripts/${name}.xml`) return [];
    const script: WorkspaceScriptSymbol = { name, qualifiedName: name, container: origin, kind: 'script', file, ...declaration };
    return [script, ...(interruptLibraries ?? []).map(({ name: library, kind, start, end }): WorkspaceScriptSymbol => ({
      name: library, qualifiedName: library, container: `${name} (${origin}, interrupt ${kind})`,
      kind: kind === 'handler' ? 'interrupt-handler' : 'library', file, start, end,
    }))];
  }

  const document = readMdDefinitionDocument(normalized, text, undefined, false, { includeNameSpans: true });
  if (!document?.scriptNameSpan) return [];
  const locate = createSourcePositionLocator(text);
  const position = (offset: number) => {
    const { line, column } = locate(offset);
    return { line: line - 1, column: column - 1 };
  };
  const script = `md.${document.name}`;
  const container = `${script} (${origin})`;
  const result: WorkspaceScriptSymbol[] = [{
    name: document.name, qualifiedName: script, container: origin, kind: 'script', file,
    start: position(document.scriptNameSpan.start), end: position(document.scriptNameSpan.end),
  }];
  for (const declaration of document.declarations) {
    const span = declaration.source.span;
    if (span) result.push({
      name: declaration.name, qualifiedName: `${script}.${declaration.name}`, container,
      kind: declaration.kind, file, start: position(span.start), end: position(span.end),
    });
  }
  return result;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** The input can retain multiple declarations of the same name. */
export function searchWorkspaceScriptSymbols(symbols: readonly WorkspaceScriptSymbol[], query: string): WorkspaceScriptSymbol[] {
  const term = query.trim().toLowerCase();
  const qualified = term.includes('.');
  return symbols.flatMap(symbol => {
    const name = (qualified ? symbol.qualifiedName : symbol.name).toLowerCase();
    const index = name.indexOf(term);
    return index < 0 ? [] : [{ symbol, rank: name === term ? 0 : index === 0 ? 1 : 2 }];
  }).sort((a, b) => a.rank - b.rank
    || compareText(a.symbol.qualifiedName, b.symbol.qualifiedName)
    || (a.symbol.originPriority ?? 0) - (b.symbol.originPriority ?? 0)
    || compareText(a.symbol.container, b.symbol.container)
    || compareText(a.symbol.file, b.symbol.file)
    || a.symbol.start.line - b.symbol.start.line || a.symbol.start.column - b.symbol.start.column)
    .map(result => result.symbol);
}
