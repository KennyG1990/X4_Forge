/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cached Node-only Vanilla Additive Index builder for #142.
 *
 * Discovers vanilla file paths (aiscripts/, md/, libraries/, index/, maps/, t/)
 * across base + official `ego_dlc_*` overlays and combines them with Forge's
 * existing AI script, canonical MD provider, and localization page indexes.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  EMPTY_VANILLA_ADDITIVE_INDEX,
  type VanillaAdditiveIndex,
  type VanillaFileMatch,
  type VanillaPageMatch,
  type VanillaScriptMatch,
} from '../lib/additiveGuard';
import { readCanonicalMdProviderCatalog, type CanonicalMdCatalog } from '../lib/canonicalMdProviderCatalog';
import { getReferenceCorpus } from '../lib/referenceCorpus';
import { discoverOfficialDlcOrder } from '../lib/referenceOverlay';

const ADDITIVE_VANILLA_DIRS = ['aiscripts', 'md', 'libraries', 'index', 'maps', 't'] as const;
const MAX_WALK_DEPTH = 12;
const MAX_CACHE_ENTRIES = 8;

interface CachedFilesEntry {
  readonly signature: string;
  readonly files: ReadonlyMap<string, VanillaFileMatch>;
}

const filesCache = new Map<string, CachedFilesEntry>();

export function clearVanillaAdditiveIndexCache(): void {
  filesCache.clear();
}

function sourceLabelFromPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (parts[0]?.toLowerCase() === 'extensions' && parts[1]) return parts[1].toLowerCase();
  return 'base';
}

function safeStat(targetPath: string): fs.Stats | null {
  try {
    const st = fs.lstatSync(targetPath);
    if (st.isSymbolicLink()) return null;
    return st;
  } catch {
    return null;
  }
}

function collectDirXmlFiles(
  baseRoot: string,
  domainDir: string,
  depth: number,
  out: string[],
  sigParts: string[],
): void {
  if (depth > MAX_WALK_DEPTH) return;
  const fullDir = path.join(baseRoot, ...domainDir.split('/'));
  const dirStat = safeStat(fullDir);
  if (!dirStat?.isDirectory()) return;
  sigParts.push(`${fullDir.toLowerCase()}:${Math.floor(dirStat.mtimeMs)}`);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(fullDir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const rel = `${domainDir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectDirXmlFiles(baseRoot, rel, depth + 1, out, sigParts);
    } else if (entry.isFile() && /\.xml$/i.test(entry.name)) {
      out.push(rel);
    }
  }
}

function walkVanillaDomainFiles(resolvedRoot: string): {
  readonly available: boolean;
  readonly files: ReadonlyMap<string, VanillaFileMatch>;
} {
  const rootKey = resolvedRoot.toLowerCase();
  const layers: Array<{ readonly dir: string; readonly source: string }> = [
    { dir: resolvedRoot, source: 'base' },
    ...discoverOfficialDlcOrder(resolvedRoot, false).map(dlc => ({
      dir: dlc.root,
      source: dlc.id,
    })),
  ];

  // Build structural mtime signature over roots and domain subdirectories first.
  const collected: Array<{ readonly source: string; readonly paths: string[] }> = [];
  const sigParts: string[] = [rootKey];
  const extStat = safeStat(path.join(resolvedRoot, 'extensions'));
  if (extStat?.isDirectory()) sigParts.push(`ext:${Math.floor(extStat.mtimeMs)}`);

  for (const layer of layers) {
    const paths: string[] = [];
    for (const domain of ADDITIVE_VANILLA_DIRS) {
      collectDirXmlFiles(layer.dir, domain, 0, paths, sigParts);
    }
    collected.push({ source: layer.source, paths });
  }

  const signature = sigParts.join('|');
  const cached = filesCache.get(rootKey);
  if (cached && cached.signature === signature) {
    filesCache.delete(rootKey);
    filesCache.set(rootKey, cached);
    return { available: true, files: cached.files };
  }

  const map = new Map<string, { path: string; sources: string[] }>();
  for (const layer of collected) {
    for (const rel of layer.paths) {
      const normalized = rel.replace(/\\/g, '/');
      const key = normalized.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.sources.includes(layer.source)) existing.sources.push(layer.source);
      } else {
        map.set(key, { path: normalized, sources: [layer.source] });
      }
    }
  }

  if (map.size === 0) {
    return { available: false, files: new Map() };
  }

  const frozenMap = new Map<string, VanillaFileMatch>();
  for (const [k, v] of map) {
    frozenMap.set(k, Object.freeze({ path: v.path, sources: Object.freeze([...v.sources]) }));
  }

  if (filesCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = filesCache.keys().next().value;
    if (oldest !== undefined) filesCache.delete(oldest);
  }
  filesCache.set(rootKey, { signature, files: frozenMap });
  return { available: true, files: frozenMap };
}

export function loadVanillaAdditiveIndex(
  referenceRoot: string | undefined,
  opts: {
    readonly canonicalMdCatalog?: Extract<CanonicalMdCatalog, { status: 'ready' }>;
    readonly allowSyncMdCatalog?: boolean;
  } = {},
): VanillaAdditiveIndex {
  const trimmed = String(referenceRoot || '').trim();
  if (!trimmed) return EMPTY_VANILLA_ADDITIVE_INDEX;
  const resolvedRoot = path.resolve(trimmed);
  const rootStat = safeStat(resolvedRoot);
  if (!rootStat?.isDirectory()) return EMPTY_VANILLA_ADDITIVE_INDEX;

  const walkedFiles = walkVanillaDomainFiles(resolvedRoot);

  let aiScriptsAvailable = false;
  const aiScripts = new Map<string, VanillaScriptMatch>();
  let pageIdsAvailable = false;
  const pageIds = new Map<string, VanillaPageMatch>();

  try {
    const corpus = getReferenceCorpus(resolvedRoot);
    aiScriptsAvailable = true;
    for (const script of corpus.aiScripts) {
      const key = script.id.trim().toLowerCase();
      if (!key || aiScripts.has(key)) continue;
      aiScripts.set(key, { name: script.id, path: script.path, source: script.source });
    }
    if (Array.isArray(corpus.textPages)) {
      pageIdsAvailable = true;
      for (const page of corpus.textPages) {
        if (!page.id || pageIds.has(page.id)) continue;
        pageIds.set(page.id, { id: page.id, path: page.path, source: page.source });
      }
    }
  } catch {
    /* corpus unavailable: sub-indexes keep available=false for honest coverage gaps */
  }

  let mdScriptsAvailable = false;
  const mdScripts = new Map<string, VanillaScriptMatch>();
  try {
    const catalog = opts.canonicalMdCatalog
      && path.resolve(opts.canonicalMdCatalog.root).toLowerCase() === resolvedRoot.toLowerCase()
      ? opts.canonicalMdCatalog
      : opts.allowSyncMdCatalog !== false
        ? (() => {
            const loaded = readCanonicalMdProviderCatalog(resolvedRoot);
            return loaded.status === 'ready' ? loaded : undefined;
          })()
        : undefined;
    if (catalog) {
      mdScriptsAvailable = true;
      for (const [key, provider] of catalog.providers.entries()) {
        if (provider) {
          mdScripts.set(key, {
            name: provider.name,
            path: provider.relativePath,
            source: sourceLabelFromPath(provider.relativePath),
          });
        } else {
          mdScripts.set(key, {
            name: key,
            path: 'md/ (multiple vanilla providers)',
            source: 'vanilla',
          });
        }
      }
    }
  } catch {
    /* md catalog unavailable */
  }

  return {
    filesAvailable: walkedFiles.available,
    files: walkedFiles.files,
    aiScriptsAvailable,
    aiScripts,
    mdScriptsAvailable,
    mdScripts,
    pageIdsAvailable,
    pageIds,
  };
}
