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

function localLimitError(node: LuaParserNode): SyntaxError {
  return Object.assign(new SyntaxError('LuaJIT allows at most 200 active local variables in one function or chunk.'),
    node.loc?.start);
}

export function parseX4Lua(source: string, options: Record<string, unknown> = {}) {
  const onCreateNode = options.onCreateNode;
  const deferred = !!options.wait;
  let overflow: LuaParserNode | undefined;
  const ast = parse(source, {
    ...options,
    luaVersion: 'LuaJIT',
    onCreateNode(node: LuaParserNode) {
      // luaparse exposes cdata as ordinary (possibly rounded) JS numbers. Keep
      // syntax/provenance, but never let scalar consumers claim that meaning.
      if (node.type === 'NumericLiteral' && typeof node.raw === 'string' && /(?:u?ll|i)$/i.test(node.raw)) node.value = null;
      if (typeof onCreateNode === 'function') onCreateNode(node);
      const failure = node.type === 'FunctionDeclaration' ? functionLocalOverflow(node)
        : node.type === 'Chunk' ? localBlockOverflow(node, 0) : undefined;
      if (failure) {
        const at = failure.loc?.start;
        const previous = overflow?.loc?.start;
        if (!overflow || (at && previous && (at.line < previous.line
          || (at.line === previous.line && at.column < previous.column)))) overflow = failure;
      }
      if (node.type === 'Chunk' && overflow && deferred) throw localLimitError(overflow);
    },
  });
  if (overflow) throw localLimitError(overflow);
  return ast;
}
