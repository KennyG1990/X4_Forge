import { readX4MenuLuaPaths } from '../lib/x4UiSourceBundle';
import type { DeploymentSnapshot } from './deploymentSnapshot';
import { installedRootFileVariants, MAX_INSTALLED_ROOT_FILE_BYTES, readInstalledExtensionRootVariants } from './installedExtensionRootFiles';

const EXTENSION_CATALOG_PART = /^(?:ext|subst)_(?:\d{2}(?:_diff_v\d{3,})?|v\d{3,})\.(cat|dat)$/i;

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

/** Compare the exact reviewed artifact with the native target before any write. */
export function previewLuaRegistrationChange(snapshot: DeploymentSnapshot, target: string, preserved: readonly string[]) {
  const unavailable = { status: 'unavailable' as const, detail: 'Forge could not compare the prior and planned Lua registrations.' };
  const planned = snapshot.plan.entries.filter(file => file.path.toLowerCase() === 'ui.xml');
  if (!planned.length) return null;
  const manifest = snapshot.files.find(file => file.path === planned[0].path);
  if (planned.length !== 1 || planned[0].size > MAX_INSTALLED_ROOT_FILE_BYTES || typeof manifest?.content !== 'string') return unavailable;
  if (snapshot.plan.entries.some(file => EXTENSION_CATALOG_PART.test(file.path))
    || preserved.some(name => EXTENSION_CATALOG_PART.test(name)
      || (snapshot.manifest.format === 'catalog' && !planned[0].catalogLoose && name.toLowerCase() === 'ui.xml'))) return unavailable;
  try {
    const next = readX4MenuLuaPaths(manifest.content, true);
    if (!next) return unavailable;
    if (!next.size) return null;
    const sources = readInstalledExtensionRootVariants(target, ['ui.xml']);
    const { loosePreferred, catalogPreferred } = installedRootFileVariants(sources, 'ui.xml');
    const uniqueNext = new Map([...next].map(name => [pathKey(name), name]));
    const additions = (text: string | undefined) => {
      const prior = text === undefined ? [] : readX4MenuLuaPaths(text, true);
      if (!prior) return null;
      const previous = new Set([...prior].map(pathKey));
      return [...uniqueNext].filter(([name]) => !previous.has(name)).map(([, name]) => name).sort();
    };
    const added = additions(loosePreferred);
    if (!added) return unavailable;
    if (loosePreferred !== catalogPreferred) {
      const catalogAdded = additions(catalogPreferred);
      if (!catalogAdded || catalogAdded.length !== added.length || catalogAdded.some((name, i) => name !== added[i])) {
        return { ...unavailable, detail: 'The installed loose and packed ui.xml give different Lua registration comparisons. Forge could not verify which copy X4 uses.' };
      }
    }
    return added.length ? { status: 'added' as const, addedCount: added.length,
      addedPaths: added.slice(0, 64), restartMayBeRequired: true as const } : null;
  } catch {
    return unavailable;
  }
}
