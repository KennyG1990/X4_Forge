/** Shared identity rules for authored X4 AI script declarations and calls. */
import type { Attr, Element } from '@xmldom/xmldom';

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

/** Direct script parameters use the authored X4 paramname grammar. */
export function isAuthoredAiScriptParameterName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export interface AiScriptInputParameter {
  readonly name: string;
  readonly attribute: Attr;
  readonly element: Element;
}

/** Exclude only the selected editor argument; validators qualify every supplied argument. */
export function readAiScriptInputParameters(
  parent: Element, supplied: boolean, selected?: Element,
): AiScriptInputParameter[] | undefined {
  const names = new Set<string>();
  const result: AiScriptInputParameter[] = [];
  for (const parameter of Array.from(parent.children).filter(child => child.localName === 'param')) {
    if (parameter === selected) continue;
    const name = parameter.getAttributeNode('name');
    if (parameter.namespaceURI || !name || !isAuthoredAiScriptParameterName(name.value)
      || (supplied && !parameter.getAttribute('value')?.trim()) || names.has(name.value.toLowerCase())) return;
    names.add(name.value.toLowerCase());
    result.push({ name: name.value, attribute: name, element: parameter });
  }
  return result;
}

export interface AiScriptSignatureParameter extends AiScriptInputParameter {
  readonly hasDefault: boolean;
  readonly defaultValue?: string;
  readonly comment?: string;
}

/** An order's independent context cannot establish a direct script-call signature. */
export function readAiScriptSignature(root: Element): AiScriptSignatureParameter[] | undefined {
  const children = Array.from(root.children);
  if (children.some(child => child.localName === 'order')) return;
  const containers = children.filter(child => child.localName === 'params');
  if (containers.length === 0) return [];
  if (containers.length !== 1 || containers[0].namespaceURI) return;
  const nodes = Array.from(containers[0].children);
  if (nodes.some(node => node.localName !== 'param'
    || (node.hasAttribute('default') && !node.getAttribute('default')?.trim()))) return;
  return readAiScriptInputParameters(containers[0], false)?.map(parameter => ({
    ...parameter,
    hasDefault: parameter.element.hasAttribute('default'),
    ...(parameter.element.hasAttribute('default') ? { defaultValue: parameter.element.getAttribute('default')! } : {}),
    ...(parameter.element.hasAttribute('comment') ? { comment: parameter.element.getAttribute('comment')! } : {}),
  }));
}
