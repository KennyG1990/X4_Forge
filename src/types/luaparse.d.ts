declare module 'luaparse' {
  export const SyntaxError: typeof globalThis.SyntaxError;
  export function parse(input: string, options?: Record<string, unknown>): unknown;
}
