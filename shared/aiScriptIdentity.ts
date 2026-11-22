/** Shared identity rules for authored X4 AI script declarations and calls. */
import type { Element } from '@xmldom/xmldom';

// The authored aiscriptname grammar in X4 9.00.
const scriptNamePattern = /^[!A-Za-z][A-Za-z0-9_.]+$/;
const literalScriptNamePattern = /^'([!A-Za-z][A-Za-z0-9_.]+)'$/;
const aiscriptPathPattern = /^aiscripts\/([!A-Za-z][A-Za-z0-9_.]+)\.xml$/i;

const normalizedAiPath = (path: string) => path.replace(/\\/g, '/');

export function isAuthoredAiScriptName(name: string): boolean {
  return scriptNamePattern.test(name);
}

export function readLiteralAiScriptName(value: string): string | undefined {
  return literalScriptNamePattern.exec(value.trim())?.[1];
}

/** The caller must locate the candidate call among the root's descendants first. */
export function isInsideAiScriptActions(call: Element, root: Element): boolean {
  let inActions = false;
  for (let node: Element | null = call; node && node !== root; node = node.parentNode as Element | null) {
    if (node.namespaceURI) return false;
    if (node.nodeName === 'actions') inActions = true;
  }
  return inActions;
}

/** The name selector supplies a validated authored declaration, when one exists. */
export function buildAuthoredAiScriptIndex<T extends { path: string }>(
  files: readonly T[], scriptName: (file: T) => string | undefined,
): ReadonlyMap<string, T | null> {
  // A malformed file can still reserve its direct filename. A valid declaration may
  // also reserve a different name. Two files claiming either spelling are ambiguous.
  const names = new Map<string, T | null>();
  for (const file of files) {
    const ids = new Set([
      aiscriptPathPattern.exec(normalizedAiPath(file.path))?.[1]?.toLowerCase(),
      scriptName(file)?.toLowerCase(),
    ]);
    for (const id of ids) if (id) names.set(id, names.has(id) ? null : file);
  }
  return names;
}

export function resolveAuthoredAiScript<T extends { path: string }>(
  index: ReadonlyMap<string, T | null>, name: string, scriptName: (file: T) => string | undefined,
): T | undefined {
  const file = index.get(name.toLowerCase());
  if (file && normalizedAiPath(file.path) === `aiscripts/${name}.xml` && scriptName(file) === name) return file;
}
