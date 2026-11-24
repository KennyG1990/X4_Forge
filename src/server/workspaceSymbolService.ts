/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * #130 / #19 — Backend & MCP multi-source Workspace Symbol search and CAS Mission Director
 * symbol rename over shared/workspaceScriptSymbols.ts and shared/mdScriptNavigation.ts.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MAX_MD_DEFINITION_SOURCE,
  hasInvalidNavigationPathCharacters,
  planMdRename,
  type MdRenameSource,
} from '../../shared/mdScriptNavigation';
import {
  readWorkspaceScriptSymbols,
  searchWorkspaceScriptSymbols,
  type WorkspaceScriptSymbol,
} from '../../shared/workspaceScriptSymbols';
import { createSourcePositionLocator } from '../../shared/xmlSourcePosition';
import {
  getReferenceManifestStatus,
  queryReferenceManifest,
  scheduleReferenceManifest,
} from '../lib/referenceManifest';

const MAX_RENAME_MD_FILES = 512;
const MAX_SCRIPT_SYMBOL_FILE_BYTES = 8 * 1024 * 1024;
const MAX_AUTHORED_SYMBOL_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_REFERENCE_SYMBOL_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_INSTALLED_SYMBOL_TOTAL_BYTES = 32 * 1024 * 1024;
const VALID_SYMBOL_KINDS = new Set<WorkspaceScriptSymbol['kind']>([
  'script',
  'cue',
  'library',
  'interrupt-handler',
]);
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

export type WorkspaceSymbolSourceScope = 'authored' | 'base' | 'dlc' | 'installed';

export interface PublicWorkspaceSymbol {
  name: string;
  qualifiedName: string;
  container: string;
  kind: WorkspaceScriptSymbol['kind'];
  sourceScope: WorkspaceSymbolSourceScope;
  origin: string;
  file: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface InternalIndexedSymbol extends WorkspaceScriptSymbol {
  sourceScope: WorkspaceSymbolSourceScope;
  originLabel: string;
}

export interface SearchWorkspaceSymbolsInput {
  query: string;
  modId?: string;
  modDir?: string | null;
  inlineScriptFiles?: ReadonlyArray<{ path: string; content: string }>;
  referenceRoot?: string | null;
  extensionsRoot?: string | null;
  includeReference?: boolean;
  includeInstalled?: boolean;
  kind?: WorkspaceScriptSymbol['kind'];
  limit?: number;
  onDiskScriptRead?: (absPath: string) => void;
}

export interface SearchWorkspaceSymbolsOutput {
  ok: true;
  success: true;
  query: string;
  total: number;
  truncated: boolean;
  referenceIncluded: boolean;
  installedIncluded: boolean;
  countsByScope: Record<WorkspaceSymbolSourceScope, number>;
  symbols: PublicWorkspaceSymbol[];
}

interface CachedFileSymbols {
  stamp: string;
  symbols: InternalIndexedSymbol[];
}

interface CachedReferenceSymbols {
  cacheKey: string;
  symbols: InternalIndexedSymbol[];
}

function fileStampKey(stat: fs.Stats): string {
  return `${stat.size}:${Math.trunc(stat.mtimeMs)}:${Math.trunc(stat.ctimeMs)}`;
}

function normalizePathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isRegularSingleFile(absPath: string): fs.Stats | null {
  try {
    const stat = fs.lstatSync(absPath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) return null;
    const real = fs.realpathSync.native(absPath);
    if (normalizePathKey(real) !== normalizePathKey(absPath)) return null;
    return stat;
  } catch {
    return null;
  }
}

function readUtf8Safe(absPath: string, maxBytes: number, onRead?: (absPath: string) => void): string | null {
  const stat = isRegularSingleFile(absPath);
  if (!stat || stat.size > maxBytes) return null;
  try {
    onRead?.(absPath);
    const bytes = fs.readFileSync(absPath);
    if (bytes.length > maxBytes) return null;
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

function collectFlatDialectSymbols(
  baseDir: string,
  originLabel: string,
  sourceScope: WorkspaceSymbolSourceScope,
  originPriority: number,
  relPrefix: string,
  fileCache: Map<string, CachedFileSymbols>,
  budget: { remainingBytes: number; remainingFiles: number },
  onRead?: (absPath: string) => void,
): InternalIndexedSymbol[] {
  const collected: InternalIndexedSymbol[] = [];
  for (const dialect of ['md', 'aiscripts'] as const) {
    const dialectDir = path.join(baseDir, dialect);
    let dirStat: fs.Stats;
    try {
      dirStat = fs.lstatSync(dialectDir);
      if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) continue;
    } catch {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dialectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/\.xml$/i.test(entry.name)) continue;
      if (budget.remainingFiles <= 0) break;
      const absFile = path.join(dialectDir, entry.name);
      const stat = isRegularSingleFile(absFile);
      if (!stat || stat.size > MAX_SCRIPT_SYMBOL_FILE_BYTES || stat.size > budget.remainingBytes) continue;
      budget.remainingFiles -= 1;
      budget.remainingBytes -= stat.size;
      const logical = `${dialect}/${entry.name}`;
      const publicRelFile = relPrefix ? `${relPrefix}/${logical}` : logical;
      const cacheKey = `${normalizePathKey(absFile)}|${originLabel}|${sourceScope}|${originPriority}|${publicRelFile}`;
      const stamp = fileStampKey(stat);
      const cached = fileCache.get(cacheKey);
      if (cached && cached.stamp === stamp) {
        collected.push(...cached.symbols);
        continue;
      }
      const text = readUtf8Safe(absFile, MAX_SCRIPT_SYMBOL_FILE_BYTES, onRead);
      if (text === null) continue;
      const parsed = readWorkspaceScriptSymbols(logical, text, originLabel).map((sym): InternalIndexedSymbol => ({
        ...sym,
        file: publicRelFile,
        originPriority,
        sourceScope,
        originLabel,
      }));
      fileCache.set(cacheKey, { stamp, symbols: parsed });
      collected.push(...parsed);
    }
  }
  return collected;
}

export class WorkspaceSymbolService {
  private readonly fileSymbolCache = new Map<string, CachedFileSymbols>();
  private referenceCache: CachedReferenceSymbols | null = null;
  private installedCache: CachedReferenceSymbols | null = null;

  clearCaches(): void {
    this.fileSymbolCache.clear();
    this.referenceCache = null;
    this.installedCache = null;
  }

  private pruneFileCacheIfNeeded(): void {
    if (this.fileSymbolCache.size > 4096) {
      this.fileSymbolCache.clear();
    }
  }

  private loadReferenceSymbols(
    referenceRoot: string,
    onRead?: (absPath: string) => void,
  ): { included: boolean; symbols: InternalIndexedSymbol[] } {
    const trimmed = referenceRoot.trim();
    if (!trimmed) return { included: false, symbols: [] };
    let rootStat: fs.Stats;
    try {
      rootStat = fs.lstatSync(trimmed);
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return { included: false, symbols: [] };
    } catch {
      return { included: false, symbols: [] };
    }

    let generation = '';
    try {
      let status = getReferenceManifestStatus(trimmed);
      if (status.state === 'idle') status = scheduleReferenceManifest(trimmed, false);
      if (status.current?.generation) generation = status.current.generation;
    } catch {
      generation = '';
    }

    if (generation) {
      const manifestCacheKey = `manifest:${normalizePathKey(trimmed)}:${generation}`;
      if (this.referenceCache?.cacheKey === manifestCacheKey) {
        return { included: true, symbols: this.referenceCache.symbols };
      }
      const symbols: InternalIndexedSymbol[] = [];
      const budget = { remainingBytes: MAX_REFERENCE_SYMBOL_TOTAL_BYTES, remainingFiles: 4096 };
      let usedManifestRows = false;
      for (const domain of ['md', 'aiscripts'] as const) {
        let offset = 0;
        while (offset < 4096) {
          const page = queryReferenceManifest(trimmed, { domain, limit: 500, offset });
          if (!page || page.files.length === 0) break;
          usedManifestRows = true;
          for (const row of page.files) {
            if (budget.remainingFiles <= 0) break;
            const relPath = String(row.path || '').replace(/\\/g, '/');
            if (hasInvalidNavigationPathCharacters(relPath)) continue;
            const parts = relPath.split('/');
            const filename = parts[parts.length - 1] || '';
            if (!/^[^/:]+\.xml$/i.test(filename)) continue;
            let logical = '';
            let originLabel = '';
            let sourceScope: WorkspaceSymbolSourceScope = 'base';
            let priority = 1;
            if (parts.length === 2 && parts[0].toLowerCase() === domain && row.source === 'base') {
              logical = `${domain}/${filename}`;
              originLabel = 'Base game';
              sourceScope = 'base';
              priority = 1;
            } else if (
              parts.length === 4
              && parts[0].toLowerCase() === 'extensions'
              && parts[2].toLowerCase() === domain
              && typeof row.source === 'string'
              && /^ego_dlc_[a-z0-9_-]+$/i.test(row.source)
              && parts[1].toLowerCase() === row.source.toLowerCase()
            ) {
              logical = `${domain}/${filename}`;
              originLabel = `DLC ${row.source}`;
              sourceScope = 'dlc';
              priority = 2;
            } else {
              continue;
            }
            const absFile = path.join(trimmed, ...parts);
            const stat = isRegularSingleFile(absFile);
            if (!stat || stat.size > MAX_SCRIPT_SYMBOL_FILE_BYTES || stat.size > budget.remainingBytes) continue;
            budget.remainingFiles -= 1;
            budget.remainingBytes -= stat.size;
            const cacheKey = `${normalizePathKey(absFile)}|${originLabel}|${sourceScope}|${priority}|${relPath}`;
            const stamp = fileStampKey(stat);
            const cached = this.fileSymbolCache.get(cacheKey);
            if (cached && cached.stamp === stamp) {
              symbols.push(...cached.symbols);
              continue;
            }
            const text = readUtf8Safe(absFile, MAX_SCRIPT_SYMBOL_FILE_BYTES, onRead);
            if (text === null) continue;
            const parsed = readWorkspaceScriptSymbols(logical, text, originLabel).map((sym): InternalIndexedSymbol => ({
              ...sym,
              file: relPath,
              originPriority: priority,
              sourceScope,
              originLabel,
            }));
            this.fileSymbolCache.set(cacheKey, { stamp, symbols: parsed });
            symbols.push(...parsed);
          }
          offset += page.files.length;
          if (offset >= page.total) break;
        }
      }
      if (usedManifestRows) {
        this.referenceCache = { cacheKey: manifestCacheKey, symbols };
        return { included: true, symbols };
      }
    }

    // Fallback direct loose scan when referenceManifest has not finished indexing yet (e.g. cold boot / small fixture).
    const dlcRoot = path.join(trimmed, 'extensions');
    let dlcEntries: string[] = [];
    try {
      if (fs.existsSync(dlcRoot) && fs.lstatSync(dlcRoot).isDirectory()) {
        dlcEntries = fs.readdirSync(dlcRoot)
          .filter(name => /^ego_dlc_[a-z0-9_-]+$/i.test(name))
          .sort((a, b) => a.localeCompare(b));
      }
    } catch {
      dlcEntries = [];
    }
    const fallbackKeyParts = [normalizePathKey(trimmed), fileStampKey(rootStat)];
    for (const sub of ['md', 'aiscripts']) {
      try {
        const s = fs.lstatSync(path.join(trimmed, sub));
        if (s.isDirectory()) fallbackKeyParts.push(`${sub}:${fileStampKey(s)}`);
      } catch { /* absent */ }
    }
    for (const dlc of dlcEntries) {
      for (const sub of ['md', 'aiscripts']) {
        try {
          const s = fs.lstatSync(path.join(dlcRoot, dlc, sub));
          if (s.isDirectory()) fallbackKeyParts.push(`${dlc}/${sub}:${fileStampKey(s)}`);
        } catch { /* absent */ }
      }
    }
    const fallbackCacheKey = `loose:${fallbackKeyParts.join('|')}`;
    if (this.referenceCache?.cacheKey === fallbackCacheKey) {
      return { included: true, symbols: this.referenceCache.symbols };
    }
    const budget = { remainingBytes: MAX_REFERENCE_SYMBOL_TOTAL_BYTES, remainingFiles: 4096 };
    const symbols: InternalIndexedSymbol[] = [
      ...collectFlatDialectSymbols(trimmed, 'Base game', 'base', 1, '', this.fileSymbolCache, budget, onRead),
    ];
    for (const dlc of dlcEntries) {
      symbols.push(
        ...collectFlatDialectSymbols(
          path.join(dlcRoot, dlc),
          `DLC ${dlc}`,
          'dlc',
          2,
          `extensions/${dlc}`,
          this.fileSymbolCache,
          budget,
          onRead,
        ),
      );
    }
    this.referenceCache = { cacheKey: fallbackCacheKey, symbols };
    return { included: true, symbols };
  }

  private loadInstalledSymbols(
    extensionsRoot: string,
    excludedModId: string,
    onRead?: (absPath: string) => void,
  ): { included: boolean; symbols: InternalIndexedSymbol[] } {
    const trimmed = extensionsRoot.trim();
    if (!trimmed) return { included: false, symbols: [] };
    let rootStat: fs.Stats;
    try {
      rootStat = fs.lstatSync(trimmed);
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return { included: false, symbols: [] };
    } catch {
      return { included: false, symbols: [] };
    }
    let folders: string[] = [];
    try {
      folders = fs.readdirSync(trimmed)
        .filter(name => !name.startsWith('.') && !/^ego_dlc_[a-z0-9_-]+$/i.test(name))
        .filter(name => !excludedModId || name.toLowerCase() !== excludedModId.toLowerCase())
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return { included: false, symbols: [] };
    }
    const keyParts = [normalizePathKey(trimmed), excludedModId.toLowerCase(), fileStampKey(rootStat)];
    for (const folder of folders) {
      for (const sub of ['md', 'aiscripts']) {
        try {
          const s = fs.lstatSync(path.join(trimmed, folder, sub));
          if (s.isDirectory()) keyParts.push(`${folder}/${sub}:${fileStampKey(s)}`);
        } catch { /* absent */ }
      }
    }
    const cacheKey = `installed:${keyParts.join('|')}`;
    if (this.installedCache?.cacheKey === cacheKey) {
      return { included: true, symbols: this.installedCache.symbols };
    }
    const budget = { remainingBytes: MAX_INSTALLED_SYMBOL_TOTAL_BYTES, remainingFiles: 2048 };
    const symbols: InternalIndexedSymbol[] = [];
    for (const folder of folders) {
      const extDir = path.join(trimmed, folder);
      try {
        const extStat = fs.lstatSync(extDir);
        if (extStat.isSymbolicLink() || !extStat.isDirectory()) continue;
      } catch {
        continue;
      }
      symbols.push(
        ...collectFlatDialectSymbols(
          extDir,
          `Installed ${folder}`,
          'installed',
          3,
          `extensions/${folder}`,
          this.fileSymbolCache,
          budget,
          onRead,
        ),
      );
    }
    this.installedCache = { cacheKey, symbols };
    return { included: true, symbols };
  }

  search(input: SearchWorkspaceSymbolsInput): SearchWorkspaceSymbolsOutput {
    this.pruneFileCacheIfNeeded();
    const query = String(input.query || '').trim();
    const modLabel = String(input.modId || 'workspace').trim() || 'workspace';
    const allSymbols: InternalIndexedSymbol[] = [];

    if (input.modDir) {
      const budget = { remainingBytes: MAX_AUTHORED_SYMBOL_TOTAL_BYTES, remainingFiles: 1024 };
      allSymbols.push(
        ...collectFlatDialectSymbols(
          input.modDir,
          modLabel,
          'authored',
          0,
          '',
          this.fileSymbolCache,
          budget,
          input.onDiskScriptRead,
        ),
      );
    } else if (input.inlineScriptFiles?.length) {
      let remainingBytes = MAX_AUTHORED_SYMBOL_TOTAL_BYTES;
      for (const file of input.inlineScriptFiles.slice(0, 1024)) {
        const normalized = String(file.path || '').replace(/\\/g, '/');
        if (!/^(md|aiscripts)\/[^/]+\.xml$/i.test(normalized)) continue;
        const size = Buffer.byteLength(file.content, 'utf8');
        if (size > MAX_SCRIPT_SYMBOL_FILE_BYTES || size > remainingBytes) continue;
        remainingBytes -= size;
        const parsed = readWorkspaceScriptSymbols(normalized, file.content, modLabel).map((sym): InternalIndexedSymbol => ({
          ...sym,
          file: normalized,
          originPriority: 0,
          sourceScope: 'authored',
          originLabel: modLabel,
        }));
        allSymbols.push(...parsed);
      }
    }

    let referenceIncluded = false;
    if (input.includeReference !== false && input.referenceRoot) {
      const refLoaded = this.loadReferenceSymbols(input.referenceRoot, input.onDiskScriptRead);
      referenceIncluded = refLoaded.included;
      allSymbols.push(...refLoaded.symbols);
    }

    let installedIncluded = false;
    if (input.includeInstalled !== false && input.extensionsRoot) {
      const instLoaded = this.loadInstalledSymbols(input.extensionsRoot, modLabel, input.onDiskScriptRead);
      installedIncluded = instLoaded.included;
      allSymbols.push(...instLoaded.symbols);
    }

    const kindFilter = input.kind && VALID_SYMBOL_KINDS.has(input.kind) ? input.kind : undefined;
    const candidatePool = kindFilter ? allSymbols.filter(s => s.kind === kindFilter) : allSymbols;
    const ranked = searchWorkspaceScriptSymbols(candidatePool, query) as InternalIndexedSymbol[];
    const countsByScope: Record<WorkspaceSymbolSourceScope, number> = {
      authored: 0,
      base: 0,
      dlc: 0,
      installed: 0,
    };
    for (const sym of ranked) {
      countsByScope[sym.sourceScope] += 1;
    }
    const limit = Math.max(1, Math.min(200, Number.isSafeInteger(input.limit) ? Number(input.limit) : 50));
    const sliced = ranked.slice(0, limit).map((sym): PublicWorkspaceSymbol => ({
      name: sym.name,
      qualifiedName: sym.qualifiedName,
      container: sym.container,
      kind: sym.kind,
      sourceScope: sym.sourceScope,
      origin: sym.originLabel,
      file: sym.file,
      start: sym.start,
      end: sym.end,
    }));
    return {
      ok: true,
      success: true,
      query,
      total: ranked.length,
      truncated: sliced.length < ranked.length,
      referenceIncluded,
      installedIncluded,
      countsByScope,
      symbols: sliced,
    };
  }
}

export interface MdRenamePublicEdit {
  file: string;
  start: number;
  end: number;
  line: number;
  column: number;
  before: string;
  after: string;
}

export interface MdRenameFileCommit {
  relModPath: string;
  beforeText: string;
  afterText: string;
  expectedBeforeSha256: string;
}

export interface MdRenameFsAdapter {
  inspectModDirectory(modDir: string):
    | {
      ok: true;
      mdFiles: Array<{ relPath: string; bytes: Buffer; sha256: string }>;
    }
    | { ok: false; status: number; code: string; error: string };
}

export const defaultMdRenameFsAdapter: MdRenameFsAdapter = {
  inspectModDirectory(modDir: string) {
    let rootStat: fs.BigIntStats;
    try {
      rootStat = fs.lstatSync(modDir, { bigint: true });
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
        || normalizePathKey(fs.realpathSync.native(modDir)) !== normalizePathKey(modDir)) {
        return { ok: false, status: 403, code: 'MD_RENAME_NONPHYSICAL_PATH', error: 'Rename requires a physical unpacked mod folder.' };
      }
    } catch {
      return { ok: false, status: 404, code: 'MOD_FOLDER_INVALID', error: 'Target mod folder does not exist.' };
    }

    const contentXmlPath = path.join(modDir, 'content.xml');
    try {
      const manifestStat = fs.lstatSync(contentXmlPath, { bigint: true });
      if (manifestStat.isSymbolicLink() || !manifestStat.isFile() || manifestStat.nlink !== 1n
        || normalizePathKey(fs.realpathSync.native(contentXmlPath)) !== normalizePathKey(contentXmlPath)) {
        return { ok: false, status: 409, code: 'MD_RENAME_MANIFEST_INVALID', error: 'Rename requires a regular single-link content.xml file.' };
      }
    } catch {
      return { ok: false, status: 409, code: 'MD_RENAME_MANIFEST_INVALID', error: 'Rename requires a root content.xml file.' };
    }

    const rootEntries = fs.readdirSync(modDir);
    if (rootEntries.some(name => /^extensions$|\.(cat|dat)$/i.test(name))) {
      return {
        ok: false,
        status: 409,
        code: 'MD_RENAME_UNSUPPORTED_LAYOUT',
        error: 'This mod has dependency overlays or packed .cat/.dat archives; Forge cannot safely review all Mission Director references.',
      };
    }

    const mdDir = path.join(modDir, 'md');
    try {
      const mdStat = fs.lstatSync(mdDir, { bigint: true });
      if (mdStat.isSymbolicLink() || !mdStat.isDirectory()
        || normalizePathKey(fs.realpathSync.native(mdDir)) !== normalizePathKey(mdDir)) {
        return { ok: false, status: 409, code: 'MD_RENAME_MD_DIR_INVALID', error: 'Rename requires a physical md/ directory.' };
      }
    } catch {
      return { ok: false, status: 409, code: 'MD_RENAME_MD_DIR_MISSING', error: 'Target mod folder has no md/ directory.' };
    }

    const mdFiles: Array<{ relPath: string; bytes: Buffer; sha256: string }> = [];
    let remainingBytes = 4 * MAX_MD_DEFINITION_SOURCE;
    const entries = fs.readdirSync(mdDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        return {
          ok: false,
          status: 409,
          code: 'MD_RENAME_UNSUPPORTED_LAYOUT',
          error: `Nested directory or link md/${entry.name} prevents complete Mission Director rename verification.`,
        };
      }
      if (!/\.xml$/i.test(entry.name)) continue;
      const absFile = path.join(mdDir, entry.name);
      const stat = fs.lstatSync(absFile, { bigint: true });
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n
        || normalizePathKey(fs.realpathSync.native(absFile)) !== normalizePathKey(absFile)) {
        return {
          ok: false,
          status: 409,
          code: 'MD_RENAME_NONPHYSICAL_PATH',
          error: `Rename requires regular single-link MD files (check md/${entry.name}).`,
        };
      }
      if (mdFiles.length >= MAX_RENAME_MD_FILES || Number(stat.size) > MAX_MD_DEFINITION_SOURCE || Number(stat.size) > remainingBytes) {
        return {
          ok: false,
          status: 413,
          code: 'MD_RENAME_INVENTORY_LIMIT',
          error: `Mission Director inventory exceeds bounded rename review limits at md/${entry.name}.`,
        };
      }
      const bytes = fs.readFileSync(absFile);
      if (bytes.length !== Number(stat.size)) {
        return { ok: false, status: 409, code: 'MD_RENAME_CONFLICT', error: `md/${entry.name} changed while reading.` };
      }
      remainingBytes -= bytes.length;
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      mdFiles.push({ relPath: `md/${entry.name}`, bytes, sha256 });
    }
    if (mdFiles.length === 0) {
      return { ok: false, status: 409, code: 'MD_RENAME_MD_DIR_EMPTY', error: 'Target mod md/ directory has no XML files.' };
    }
    return { ok: true, mdFiles };
  },
};

export function executeModFolderMdRename(input: {
  modDir: string;
  modId: string;
  file: string;
  offset: number;
  newName: string;
  apply: boolean;
  expectedSha256ByFile?: Record<string, string>;
  fsAdapter?: MdRenameFsAdapter;
  commitFiles?: (commits: MdRenameFileCommit[]) =>
    | { ok: true; writtenByFile: Record<string, { sha256: string; bytes: number }> }
    | { ok: false; status: number; code: string; error: string; details?: unknown };
}):
  | {
    ok: true;
    success: true;
    applied: boolean;
    modId: string;
    symbolFile: string;
    newName: string;
    editCount: number;
    touchedFiles: string[];
    expectedSha256ByFile: Record<string, string>;
    writtenByFile?: Record<string, { sha256: string; bytes: number }>;
    edits: MdRenamePublicEdit[];
  }
  | { ok: false; status: number; code: string; error: string; details?: unknown } {
  const normalizedFile = String(input.file || '').trim().replace(/\\/g, '/');
  if (!/^md\/[^/\\:<>"|?*]+\.xml$/i.test(normalizedFile) || hasInvalidNavigationPathCharacters(normalizedFile)) {
    return { ok: false, status: 400, code: 'CAPABILITY_INPUT_INVALID', error: 'project.md.rename file must be a direct md/<name>.xml path.' };
  }
  if (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > MAX_MD_DEFINITION_SOURCE) {
    return { ok: false, status: 400, code: 'CAPABILITY_INPUT_INVALID', error: 'project.md.rename offset must be a non-negative integer UTF-16 offset.' };
  }
  const newName = String(input.newName || '');
  if (!newName.trim() || newName.length > 128 || /[\r\n\0]/.test(newName)) {
    return { ok: false, status: 400, code: 'CAPABILITY_INPUT_INVALID', error: 'project.md.rename newName must be a non-empty single-line identifier (at most 128 characters).' };
  }

  const adapter = input.fsAdapter ?? defaultMdRenameFsAdapter;
  const inspected = adapter.inspectModDirectory(input.modDir);
  if (inspected.ok === false) return inspected;

  const sources: MdRenameSource[] = [];
  const byLowerKey = new Map<string, { relPath: string; text: string; sha256: string }>();
  for (const entry of inspected.mdFiles) {
    let text: string;
    try {
      text = strictUtf8.decode(entry.bytes);
    } catch {
      return { ok: false, status: 422, code: 'MD_RENAME_INVALID_UTF8', error: `${entry.relPath} is not valid UTF-8.` };
    }
    const key = entry.relPath.toLowerCase();
    if (byLowerKey.has(key)) {
      return { ok: false, status: 409, code: 'MD_RENAME_DUPLICATE_FILE', error: `Case-colliding MD path: ${entry.relPath}.` };
    }
    byLowerKey.set(key, { relPath: entry.relPath, text, sha256: entry.sha256 });
    sources.push({ file: key, text });
  }

  const targetEntry = byLowerKey.get(normalizedFile.toLowerCase());
  if (!targetEntry) {
    return { ok: false, status: 404, code: 'MD_RENAME_FILE_NOT_FOUND', error: `Mission Director file not found: ${normalizedFile}.` };
  }
  if (input.offset > targetEntry.text.length) {
    return { ok: false, status: 400, code: 'CAPABILITY_INPUT_INVALID', error: `offset ${input.offset} exceeds ${targetEntry.relPath} length (${targetEntry.text.length}).` };
  }

  const planned = planMdRename(sources, normalizedFile.toLowerCase(), input.offset, newName);
  if ('reason' in planned) {
    return { ok: false, status: 422, code: 'MD_RENAME_REFUSED', error: planned.reason };
  }

  const locators = new Map<string, ReturnType<typeof createSourcePositionLocator>>();
  const editsByKey = new Map<string, typeof planned.edits>();
  const publicEdits: MdRenamePublicEdit[] = [];

  for (const edit of planned.edits) {
    const owner = byLowerKey.get(edit.file);
    if (!owner) {
      return { ok: false, status: 500, code: 'MD_RENAME_INTERNAL_MISMATCH', error: 'Planned edit referenced an unknown MD file.' };
    }
    let locate = locators.get(edit.file);
    if (!locate) {
      locate = createSourcePositionLocator(owner.text);
      locators.set(edit.file, locate);
    }
    const pos = locate(edit.start);
    publicEdits.push({
      file: owner.relPath,
      start: edit.start,
      end: edit.end,
      line: pos.line,
      column: pos.column,
      before: edit.before,
      after: edit.after,
    });
    const list = editsByKey.get(edit.file) ?? [];
    list.push(edit);
    editsByKey.set(edit.file, list);
  }

  const touchedKeys = [...editsByKey.keys()].sort();
  const touchedFiles: string[] = [];
  const expectedSha256ByFile: Record<string, string> = {};
  const commits: MdRenameFileCommit[] = [];

  for (const key of touchedKeys) {
    const owner = byLowerKey.get(key)!;
    touchedFiles.push(owner.relPath);
    expectedSha256ByFile[owner.relPath] = owner.sha256;
    const sortedDesc = [...(editsByKey.get(key) || [])].sort((a, b) => b.start - a.start);
    let updated = owner.text;
    for (const edit of sortedDesc) {
      if (updated.slice(edit.start, edit.end) !== edit.before) {
        return { ok: false, status: 409, code: 'MD_RENAME_CONFLICT', error: `Span mismatch while applying rename to ${owner.relPath}.` };
      }
      updated = updated.slice(0, edit.start) + edit.after + updated.slice(edit.end);
    }
    commits.push({
      relModPath: owner.relPath,
      beforeText: owner.text,
      afterText: updated,
      expectedBeforeSha256: owner.sha256,
    });
  }

  if (!input.apply) {
    return {
      ok: true,
      success: true,
      applied: false,
      modId: input.modId,
      symbolFile: targetEntry.relPath,
      newName: newName.trim(),
      editCount: publicEdits.length,
      touchedFiles,
      expectedSha256ByFile,
      edits: publicEdits,
    };
  }

  const callerHashes = input.expectedSha256ByFile;
  if (!callerHashes || typeof callerHashes !== 'object' || Array.isArray(callerHashes)) {
    return {
      ok: false,
      status: 400,
      code: 'CAPABILITY_INPUT_INVALID',
      error: 'project.md.rename apply: true requires expectedSha256ByFile from a prior dry-run preview.',
    };
  }
  const callerKeys = Object.keys(callerHashes).sort();
  const expectedKeys = [...touchedFiles].sort();
  if (callerKeys.some(k => typeof callerHashes[k] !== 'string' || !/^[a-f0-9]{64}$/.test(callerHashes[k]))) {
    return {
      ok: false,
      status: 400,
      code: 'CAPABILITY_INPUT_INVALID',
      error: 'expectedSha256ByFile values must be 64-character lowercase hex SHA-256 digests.',
    };
  }
  if (JSON.stringify(callerKeys) !== JSON.stringify(expectedKeys)
    || expectedKeys.some(rel => callerHashes[rel] !== expectedSha256ByFile[rel])) {
    return {
      ok: false,
      status: 409,
      code: 'MD_RENAME_CONFLICT',
      error: 'One or more Mission Director files changed after the rename preview was prepared. Run a fresh preview.',
      details: { expectedByCaller: callerHashes, currentSha256ByFile: expectedSha256ByFile },
    };
  }

  // Re-verify physical disk hashes immediately before commit to close TOCTOU.
  const recheck = adapter.inspectModDirectory(input.modDir);
  if (recheck.ok === false) return recheck;
  const recheckMap = new Map(recheck.mdFiles.map(item => [item.relPath, item.sha256]));
  if (recheck.mdFiles.length !== inspected.mdFiles.length
    || inspected.mdFiles.some(item => recheckMap.get(item.relPath) !== item.sha256)) {
    return {
      ok: false,
      status: 409,
      code: 'MD_RENAME_CONFLICT',
      error: 'Mission Director inventory changed before commit; nothing was written.',
    };
  }

  if (!input.commitFiles) {
    return { ok: false, status: 500, code: 'MD_RENAME_COMMIT_UNAVAILABLE', error: 'Rename commit callback is not configured.' };
  }
  const committed = input.commitFiles(commits);
  if (committed.ok === false) return committed;

  return {
    ok: true,
    success: true,
    applied: true,
    modId: input.modId,
    symbolFile: targetEntry.relPath,
    newName: newName.trim(),
    editCount: publicEdits.length,
    touchedFiles,
    expectedSha256ByFile,
    writtenByFile: committed.writtenByFile,
    edits: publicEdits,
  };
}

export function runWorkspaceSymbolServiceSelftest(): {
  pass: boolean;
  passed: number;
  total: number;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
} {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) =>
    checks.push({ name, pass: !!pass, ...(detail ? { detail } : {}) });

  const service = new WorkspaceSymbolService();
  const inlineSearch = service.search({
    query: 'Start',
    modId: 'forge_sym_mod',
    inlineScriptFiles: [
      {
        path: 'md/setup.xml',
        content: '<mdscript name="ForgeSetup"><cues><cue name="Start"><cues><cue name="Nested_Start"/></cues></cue><library name="Start_Helper"/></cues></mdscript>',
      },
      {
        path: 'aiscripts/forge.patrol.xml',
        content: '<aiscript name="forge.patrol"><interrupts><library><actions name="StartInterrupt"/></library></interrupts><attention min="unknown"><actions/></attention></aiscript>',
      },
    ],
    includeReference: false,
    includeInstalled: false,
  });
  ok(
    'inline_symbol_search_ranks_exact_before_prefix_and_substring',
    inlineSearch.ok
      && inlineSearch.total === 4
      && inlineSearch.symbols[0]?.name === 'Start'
      && inlineSearch.symbols[0]?.qualifiedName === 'md.ForgeSetup.Start'
      && inlineSearch.symbols.some(s => s.kind === 'library' && s.name === 'Start_Helper')
      && inlineSearch.symbols.some(s => s.name === 'StartInterrupt'),
    JSON.stringify(inlineSearch.symbols.map(s => `${s.kind}:${s.qualifiedName}`)),
  );

  const qualifiedSearch = service.search({
    query: 'md.ForgeSetup.Start',
    modId: 'forge_sym_mod',
    inlineScriptFiles: [
      { path: 'md/setup.xml', content: '<mdscript name="ForgeSetup"><cues><cue name="Start"/></cues></mdscript>' },
      { path: 'md/other.xml', content: '<mdscript name="OtherSetup"><cues><cue name="Start"/></cues></mdscript>' },
    ],
    includeReference: false,
    includeInstalled: false,
  });
  ok(
    'qualified_symbol_query_disambiguates_script_owner',
    qualifiedSearch.total === 1 && qualifiedSearch.symbols[0]?.qualifiedName === 'md.ForgeSetup.Start',
  );

  // In-memory MdRenameFsAdapter tests (zero filesystem mutation!)
  const makeAdapter = (files: Record<string, string>): MdRenameFsAdapter => ({
    inspectModDirectory() {
      const mdFiles = Object.entries(files).map(([relPath, text]) => {
        const bytes = Buffer.from(text, 'utf8');
        return {
          relPath,
          bytes,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        };
      });
      return { ok: true, mdFiles };
    },
  });

  const mdOne = '<mdscript name="One"><cues><cue name="Shared"><actions><signal_cue cue="Shared"/></actions></cue><library name="Templ&#97;te"/></cues></mdscript>';
  const mdTwo = '<mdscript name="Two"><cues><cue name="Caller"><actions><signal_cue cue="md.One.Sh&#97;red"/></actions></cue><cue name="Inst" ref="md.One.Templ&#97;te"/></cues></mdscript>';
  const memFiles: Record<string, string> = { 'md/one.xml': mdOne, 'md/two.xml': mdTwo };
  const preview = executeModFolderMdRename({
    modDir: '/virtual/mod',
    modId: 'virtual_mod',
    file: 'md/one.xml',
    offset: mdOne.indexOf('name="Shared"') + 'name="Shared'.length - 1,
    newName: 'RenamedCue',
    apply: false,
    fsAdapter: makeAdapter(memFiles),
  });
  ok(
    'md_rename_preview_plans_exact_cross_file_spans_without_mutation',
    preview.ok === true
      && preview.applied === false
      && preview.editCount === 3
      && JSON.stringify(preview.touchedFiles) === JSON.stringify(['md/one.xml', 'md/two.xml']),
    JSON.stringify(preview),
  );

  const staleCommit = executeModFolderMdRename({
    modDir: '/virtual/mod',
    modId: 'virtual_mod',
    file: 'md/one.xml',
    offset: mdOne.indexOf('name="Shared"') + 'name="Shared'.length - 1,
    newName: 'RenamedCue',
    apply: true,
    expectedSha256ByFile: {
      'md/one.xml': '0'.repeat(64),
      'md/two.xml': preview.ok ? preview.expectedSha256ByFile['md/two.xml'] : '0'.repeat(64),
    },
    fsAdapter: makeAdapter(memFiles),
    commitFiles: () => { throw new Error('must not commit on CAS mismatch'); },
  });
  ok(
    'md_rename_apply_refuses_stale_sha256_before_commit',
    staleCommit.ok === false && staleCommit.status === 409 && staleCommit.code === 'MD_RENAME_CONFLICT',
  );

  const committedTexts: Record<string, string> = {};
  const validCommit = preview.ok && executeModFolderMdRename({
    modDir: '/virtual/mod',
    modId: 'virtual_mod',
    file: 'md/one.xml',
    offset: mdOne.indexOf('name="Shared"') + 'name="Shared'.length - 1,
    newName: 'RenamedCue',
    apply: true,
    expectedSha256ByFile: preview.expectedSha256ByFile,
    fsAdapter: makeAdapter(memFiles),
    commitFiles(commits) {
      const writtenByFile: Record<string, { sha256: string; bytes: number }> = {};
      for (const item of commits) {
        committedTexts[item.relModPath] = item.afterText;
        const buf = Buffer.from(item.afterText, 'utf8');
        writtenByFile[item.relModPath] = {
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
          bytes: buf.length,
        };
      }
      return { ok: true, writtenByFile };
    },
  });
  ok(
    'md_rename_apply_commits_exact_cross_file_replacements',
    !!validCommit
      && validCommit.ok === true
      && validCommit.applied === true
      && committedTexts['md/one.xml']?.includes('name="RenamedCue"') === true
      && committedTexts['md/one.xml']?.includes('cue="RenamedCue"') === true
      && committedTexts['md/two.xml']?.includes('cue="md.One.RenamedCue"') === true,
  );

  const collisionRefused = executeModFolderMdRename({
    modDir: '/virtual/mod',
    modId: 'virtual_mod',
    file: 'md/one.xml',
    offset: mdOne.indexOf('name="Shared"') + 'name="Shared'.length - 1,
    newName: 'template',
    apply: false,
    fsAdapter: makeAdapter(memFiles),
  });
  ok(
    'md_rename_refuses_casefolded_collision_and_keywords',
    collisionRefused.ok === false && collisionRefused.status === 422 && collisionRefused.code === 'MD_RENAME_REFUSED',
  );

  const passed = checks.filter(c => c.pass).length;
  return { pass: passed === checks.length, passed, total: checks.length, checks };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = runWorkspaceSymbolServiceSelftest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exit(1);
}
