/** Content identity of an already parsed X4 extension manifest root. */
export function contentManifestIdentityFromRoot(root: {
  nodeName: string;
  getAttribute(name: string): string | null;
} | null | undefined): { modId: string; modVersion: string | null; modDate: string | null } | null {
  if (!root || root.nodeName !== 'content') return null;
  const modId = root.getAttribute('id')?.trim();
  return modId ? { modId, modVersion: root.getAttribute('version') || null, modDate: root.getAttribute('date') || null } : null;
}

export interface ExtensionDependencies {
  dependencies: string[];
  requiredDependencies: string[];
}

interface DependencyElement {
  getAttribute(name: string): string | null;
}

export function readExtensionDependencies(root: {
  getElementsByTagName(tag: string): ArrayLike<DependencyElement>;
} | null | undefined): ExtensionDependencies {
  const dependencies: string[] = [];
  const requiredDependencies: string[] = [];
  for (const element of Array.from(root?.getElementsByTagName('dependency') ?? [])) {
    const id = element.getAttribute('id')?.toLowerCase();
    if (!id) continue;
    dependencies.push(id);
    if (!/^(?:true|1)$/i.test(element.getAttribute('optional') ?? '')) requiredDependencies.push(id);
  }
  return { dependencies, requiredDependencies };
}

/** The caller supplies the deterministic order for extensions with no dependency relationship. */
export function orderExtensionDependencies<T extends { id: string; dependencies: readonly string[] }>(
  extensions: readonly T[], strict: boolean,
): T[] {
  const byId = new Map(extensions.map(extension => [extension.id, extension]));
  if (strict && byId.size !== extensions.length) throw new Error('Official DLC IDs are ambiguous.');
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: T[] = [];
  const visit = (extension: T) => {
    if (visited.has(extension.id)) return;
    if (visiting.has(extension.id)) {
      if (strict) throw new Error('Official DLC dependency order is ambiguous.');
      return;
    }
    visiting.add(extension.id);
    for (const dependency of extension.dependencies) {
      const info = byId.get(dependency);
      if (info) visit(info);
    }
    visiting.delete(extension.id);
    visited.add(extension.id);
    ordered.push(extension);
  };
  for (const extension of extensions) visit(extension);
  return ordered;
}
