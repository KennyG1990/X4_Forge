/** Shared source parser profile; this does not execute Lua or prove engine acceptance. */
import { parse } from 'luaparse';

const MAX_LUAJIT_ACTIVE_LOCALS = 200;
const FOR_CONTROL_LOCALS = 3;

interface LuaParserNode {
  type?: string;
  raw?: string;
  value?: unknown;
  isLocal?: boolean;
  indexer?: string;
  identifier?: LuaParserNode;
  variables?: LuaParserNode[];
  parameters?: LuaParserNode[];
  clauses?: LuaParserNode[];
  body?: LuaParserNode[];
  range?: [number, number];
  loc?: { start: { line: number; column: number } };
}

function localBlockOverflow(block: LuaParserNode, inherited: number): LuaParserNode | undefined {
  if (inherited > MAX_LUAJIT_ACTIVE_LOCALS) return block;
  let active = inherited;
  for (const statement of block.body ?? []) {
    if (statement.type === 'LocalStatement') {
      const variables = statement.variables ?? [];
      if (active + variables.length > MAX_LUAJIT_ACTIVE_LOCALS) return variables[MAX_LUAJIT_ACTIVE_LOCALS - active];
      active += variables.length;
      continue;
    }
    if (statement.type === 'FunctionDeclaration') {
      // A separate callback checks the nested body using that function's own locals.
      if (statement.isLocal && ++active > MAX_LUAJIT_ACTIVE_LOCALS) return statement.identifier ?? statement;
      continue;
    }
    if (statement.type === 'IfStatement') {
      for (const clause of statement.clauses ?? []) {
        const overflow = localBlockOverflow(clause, active);
        if (overflow) return overflow;
      }
      continue;
    }
    if (statement.body) {
      // Numeric and generic for loops each reserve three compiler control locals.
      const loopLocals = statement.type === 'ForNumericStatement' ? FOR_CONTROL_LOCALS + 1
        : statement.type === 'ForGenericStatement' ? FOR_CONTROL_LOCALS + (statement.variables?.length ?? 0) : 0;
      const overflow = localBlockOverflow(statement, active + loopLocals);
      if (overflow) return overflow;
    }
  }
  return undefined;
}

function functionLocalOverflow(node: LuaParserNode): LuaParserNode | undefined {
  const parameters = node.parameters?.filter(parameter => parameter.type === 'Identifier') ?? [];
  const self = node.identifier?.type === 'MemberExpression' && node.identifier.indexer === ':' ? 1 : 0;
  return parameters[MAX_LUAJIT_ACTIVE_LOCALS - self] ?? localBlockOverflow(node, parameters.length + self);
}

type LuaProfileError = SyntaxError & { line?: number; column?: number; index?: number };

function surrogateEscapeError(node: LuaParserNode): LuaProfileError | undefined {
  const raw = node.raw;
  if (!raw || (raw[0] !== '"' && raw[0] !== "'") || !raw.includes('\\u{')) return;
  for (let slash = raw.indexOf('\\'); slash !== -1; slash = raw.indexOf('\\', slash + 2)) {
    if (!raw.startsWith('\\u{', slash)) continue;
    // luaparse has already checked the braces, hex digits, and upper bound.
    const codePoint = Number.parseInt(raw.slice(slash + 3, raw.indexOf('}', slash + 3)), 16);
    if (codePoint < 0xd800 || codePoint > 0xdfff) continue;
    const error: LuaProfileError = new SyntaxError('LuaJIT Unicode escapes cannot encode surrogate code points.');
    if (node.range) error.index = node.range[0] + slash;
    const start = node.loc?.start;
    if (start) {
      const lines = raw.slice(0, slash).split(/\r\n|\n\r|\r|\n/);
      error.line = start.line + lines.length - 1;
      error.column = lines.length === 1 ? start.column + slash : lines[lines.length - 1].length;
    }
    return error;
  }
}

function earlierProfileError(candidate: LuaProfileError, previous: LuaProfileError | undefined): LuaProfileError {
  if (!previous) return candidate;
  if (candidate.index !== undefined && previous.index !== undefined) {
    return candidate.index < previous.index ? candidate : previous;
  }
  if (candidate.line !== undefined && previous.line !== undefined
    && (candidate.line < previous.line || (candidate.line === previous.line
      && (candidate.column ?? 0) < (previous.column ?? 0)))) return candidate;
  return previous;
}

function localLimitError(node: LuaParserNode): LuaProfileError {
  return Object.assign(new SyntaxError('LuaJIT allows at most 200 active local variables in one function or chunk.'),
    node.loc?.start, node.range ? { index: node.range[0] } : undefined);
}

export function parseX4Lua(source: string, options: Record<string, unknown> = {}) {
  const onCreateNode = options.onCreateNode;
  const deferred = !!options.wait;
  let profileError: LuaProfileError | undefined;
  const ast = parse(source, {
    ...options,
    luaVersion: 'LuaJIT',
    onCreateNode(node: LuaParserNode) {
      // luaparse exposes cdata as ordinary (possibly rounded) JS numbers. Keep
      // syntax/provenance, but never let scalar consumers claim that meaning.
      if (node.type === 'NumericLiteral' && typeof node.raw === 'string' && /(?:u?ll|i)$/i.test(node.raw)) node.value = null;
      if (node.type === 'StringLiteral') {
        const failure = surrogateEscapeError(node);
        if (failure) profileError = earlierProfileError(failure, profileError);
      }
      if (typeof onCreateNode === 'function') onCreateNode(node);
      const failure = node.type === 'FunctionDeclaration' ? functionLocalOverflow(node)
        : node.type === 'Chunk' ? localBlockOverflow(node, 0) : undefined;
      if (failure) profileError = earlierProfileError(localLimitError(failure), profileError);
      if (node.type === 'Chunk' && profileError && deferred) throw profileError;
    },
  });
  if (profileError) throw profileError;
  return ast;
}
