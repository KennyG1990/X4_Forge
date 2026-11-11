/** Shared source parser profile; this does not execute Lua or prove engine acceptance. */
import { parse } from 'luaparse';

interface LuaLiteralNode { type?: string; raw?: string; value?: unknown }

export function parseX4Lua(source: string, options: Record<string, unknown> = {}) {
  const onCreateNode = options.onCreateNode;
  return parse(source, {
    ...options,
    luaVersion: 'LuaJIT',
    onCreateNode(node: LuaLiteralNode) {
      // luaparse exposes cdata as ordinary (possibly rounded) JS numbers. Keep
      // syntax/provenance, but never let scalar consumers claim that meaning.
      if (node.type === 'NumericLiteral' && typeof node.raw === 'string' && /(?:u?ll|i)$/i.test(node.raw)) node.value = null;
      if (typeof onCreateNode === 'function') onCreateNode(node);
    },
  });
}
