import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProjectFile } from '../lib/extensionProject';
import { fnvHash } from '../lib/workspaceIdentity';
import { MD_INITIAL_STATE_COVERAGE_CHECK } from '../lib/validationEvidence';
import { indexXmlElementSpans, type XmlElementSourceSpan } from '../lib/xmlSourceSpans';
import type { DiagnosticSourceNavigation, ModWorkspace } from '../types';

const rawReferenceCodes = new Set([
  'reference.unknown_faction', 'reference.unknown_ware', 'reference.unknown_macro', 'reference.unknown_sector',
]);
const orderParameterCodes = new Set([
  'aiscript.order_param_missing_type', 'aiscript.order_param_illegal_type', 'aiscript.order_param_missing_text',
]);

/** A direct child of the same configured root used by the installed native editor. */
export function diagnosticSourceFolder(workspaceRoot: string | undefined, sourceDir: string): string | undefined {
  if (!workspaceRoot || !sourceDir) return;
  try {
    const source = fs.lstatSync(sourceDir);
    if (!source.isDirectory() || source.isSymbolicLink()) return;
    const relative = path.relative(fs.realpathSync(workspaceRoot), fs.realpathSync(sourceDir));
    if (relative !== '.' && relative !== '..' && /^[a-zA-Z0-9._-]+$/.test(relative)) return relative;
  } catch { /* Source cannot currently be addressed by the native editor. */ }
}

type LocatableFinding = { code?: string; filePath?: string; line?: number; column?: number };
type ImportedSources = Pick<ModWorkspace, 'nodes' | 'originalFiles'>;

function importedNodeResolver(workspace: ImportedSources, file: string, content: string) {
  const originals = workspace.originalFiles?.filter(entry => entry.kind === 'md' && entry.path === file);
  if (originals?.length !== 1 || originals[0].content !== content) return;

  const spans = indexXmlElementSpans(content);
  const ordered = [...spans.values()].sort((a, b) => a.start - b.start);
  const hash = fnvHash(content);
  const lineStarts = [0];
  for (const end of content.matchAll(/\r\n?|\n/g)) lineStarts.push(end.index + end[0].length);
  const occurrences = new Map<string, number>();
  const bySpan = new Map<string, string[]>();
  for (const node of workspace.nodes) {
    occurrences.set(node.id, (occurrences.get(node.id) ?? 0) + 1);
    const source = node.source;
    if (!source?.modeled || source.path !== file || source.identity?.fileHash !== hash) continue;
    const span = spans.get(source.semanticPath);
    if (!span || span.start !== source.start || span.end !== source.end || span.tag !== node.xmlTag) continue;
    const matches = bySpan.get(span.path);
    if (matches) matches.push(node.id);
    else bySpan.set(span.path, [node.id]);
  }

  return (line: number, column: number): string | undefined => {
    const start = lineStarts[line - 1];
    if (start === undefined || column < 1) return;
    const offset = start + column - 1;
    if (offset >= (lineStarts[line] ?? content.length) || /[\r\n]/.test(content[offset])) return;
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (ordered[middle].start <= offset) low = middle + 1;
      else high = middle;
    }
    let span: XmlElementSourceSpan | undefined = ordered[low - 1];
    while (span && span.end <= offset) {
      span = spans.get(span.path.slice(0, span.path.lastIndexOf('/')));
    }
    if (!span) return;
    const names = bySpan.get(span.path);
    if (names?.length === 1 && occurrences.get(names[0]) === 1) return names[0];
  };
}

/** The canonical project validator has already consumed these exact selected file strings. */
export function bindDiagnosticSourceFiles(
  sourceFolder: string | undefined,
  selected: ReadonlyMap<string, ProjectFile>,
  original: readonly ProjectFile[],
  workspace?: ImportedSources,
) {
  const disk = new Map(original.map(file => [file.path, file]));
  const hashes = new Map<string, string>();
  const standardXmlLines = new Map<string, boolean>();
  const importedNodes = new Map<string, ReturnType<typeof importedNodeResolver>>();
  return ({ code, filePath, line, column }: LocatableFinding): DiagnosticSourceNavigation | undefined => {
    if (!code || !filePath) return;
    const rawReference = rawReferenceCodes.has(code);
    const orderParameter = orderParameterCodes.has(code);
    const initialState = code === MD_INITIAL_STATE_COVERAGE_CHECK;
    if (!rawReference && !orderParameter && !initialState) return;
    const file = selected.get(filePath.toLowerCase());
    if (!sourceFolder || file?.path !== filePath || typeof file.content !== 'string' || !disk.has(filePath)
      || (initialState && file.kind !== 'md')) {
      return { status: 'unavailable', reason: 'materialized-source' };
    }
    if (file.content !== disk.get(filePath)?.content) {
      return { status: 'unavailable', reason: 'source-mismatch' };
    }
    const content = file.content;
    // Raw references and initial-state evidence count the leading BOM; the
    // editor does not. DOM coordinates also require the editor's line endings.
    const authoredLine = line ?? 0;
    const includesBom = rawReference || initialState;
    const authoredColumn = (column ?? 0) - Number(includesBom && authoredLine === 1 && content.startsWith('\uFEFF'));
    const domPosition = orderParameter || initialState;
    if (domPosition && !standardXmlLines.has(filePath)) {
      standardXmlLines.set(filePath, !/[\u0085\u2028\u2029]/.test(content));
    }
    if (!Number.isSafeInteger(authoredLine) || authoredLine < 1
        || !Number.isSafeInteger(authoredColumn) || authoredColumn < 1
        || (domPosition && standardXmlLines.get(filePath) === false)) {
      return { status: 'unavailable', reason: 'position-unavailable' };
    }
    let sha256 = hashes.get(filePath);
    if (!sha256) {
      sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      hashes.set(filePath, sha256);
    }
    let nodeId: string | undefined;
    if (rawReference && workspace && file.kind === 'md' && column !== undefined) {
      if (!importedNodes.has(filePath)) importedNodes.set(filePath, importedNodeResolver(workspace, filePath, content));
      nodeId = importedNodes.get(filePath)?.(authoredLine, column);
    }
    return {
      status: 'ready', path: filePath, sourceFolder, sha256, line: authoredLine - 1, column: authoredColumn - 1,
      ...(nodeId ? { nodeId } : {}),
    };
  };
}
