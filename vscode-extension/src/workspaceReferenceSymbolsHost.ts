import { createHash } from 'node:crypto';
import { promises as fs, type BigIntStats } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { DOMParser } from '@xmldom/xmldom';
import { hasInvalidNavigationPathCharacters } from '../../shared/mdScriptNavigation';
import {
  MAX_SCRIPT_ORIGIN_INPUTS, readWorkspaceScriptSymbols, scriptOriginInputStamp,
  type EffectiveScriptOrigins, type ScriptOriginInput, type WorkspaceScriptSymbol,
} from '../../shared/workspaceScriptSymbols';
import { scanXmlTagTokens } from '../../shared/xmlMarkup';
import { contentManifestIdentityFromRoot, readExtensionDependencies, type ExtensionDependencies } from '../../shared/contentManifestIdentity';
import { createPackedReferenceOrigins, type PackedReferenceProfile } from './workspacePackedReferenceOrigins';
import { VERSIONED_EXTENSION_CATALOG_PART, VERSIONED_SUBSTITUTION_CATALOG_PART } from '../../shared/x4CatalogManifest';
import { physicalStamp, readDiskInput, sameStamp } from './aiScriptDefinitionHost';
import {
  extensionScriptCatalogsCurrent, readBaseGameScriptCatalogs, readExtensionScriptCatalogs, readGameCatalogVersion,
  readPackedScript, readSubstitutionScriptCatalogs, REFERENCE_SYMBOL_FILE_LIMIT,
  type ExtensionScriptCatalogs, type GameCatalogVersion, type PackedScriptInput,
} from './installedScriptCatalogs';

const SCHEME = 'x4forge-reference-symbol';
const PAGE_SIZE = 500;
const MAX_FILES = REFERENCE_SYMBOL_FILE_LIMIT;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CORPUS_BYTES = 64 * 1024 * 1024;
const MAX_INSTALLED_BYTES = 32 * 1024 * 1024;
const MAX_CONTENT_BYTES = 64 * 1024;
const MAX_INSTALLED_ENTRIES = 4_096;
const MAX_DECLARATIONS = 32_768;
const MAX_COMPOSITION_REQUESTS = 24;
const COMPOSITION_BUDGET_MS = 500;
const SHA256 = /^[a-f0-9]{64}$/;
const SYMBOL_KINDS = new Set(['script', 'cue', 'library', 'interrupt-handler']);
const REFRESH_MS = 15_000;
const RETRY_MS = 1_500;
const DOMAINS = ['md', 'aiscripts'] as const;
const utf8 = new TextDecoder('utf-8', { fatal: true });
type Domain = typeof DOMAINS[number];
type Scope = 'corpus' | 'game' | 'dlc' | 'installed';

export interface WorkspaceReferenceBackend {
  owner: object;
  readPage(domain: Domain, offset: number, limit: number): Promise<unknown>;
  readScriptOrigins?(logical: string): Promise<unknown>;
  readInstalledRoot?(): Promise<string | undefined>;
  readGameRoot?(): Promise<string | undefined>;
}

interface ManifestPage {
  status: { root: string; current?: { generation: string } };
  generation: string;
  offset: number;
  total: number;
  files: Array<{ path: string; source: string }>;
}

interface InstalledFolder {
  directory: string;
  identity: string;
  stamp: BigIntStats;
  manifestStamp?: BigIntStats;
  official: boolean;
  catalogs?: ExtensionScriptCatalogs;
  gameVersion?: GameCatalogVersion | null;
}

type ScriptComposition = EffectiveScriptOrigins & { identity: string; inputs: ScriptOriginInput[] };

export interface ReferenceFile {
  file: string;
  logical: string;
  replacement?: boolean;
  stamp: BigIntStats;
  origin: string;
  installedFolder?: InstalledFolder;
  packed?: PackedScriptInput;
  archiveIdentity?: string;
  isPatch?: boolean;
  composition?: { logical: string; identity: string };
  hash: string;
  uri: vscode.Uri;
  symbols: WorkspaceScriptSymbol[];
}

export interface Inventory {
  scope: Scope;
  owner: object;
  root: string;
  generation?: string;
  rootStamp?: BigIntStats;
  gameCatalogs?: ExtensionScriptCatalogs;
  gameVersion?: GameCatalogVersion | null;
  packedProfile?: PackedReferenceProfile;
  compositions: Map<string, ScriptComposition>;
  compositionCursor: number;
  files: Map<string, ReferenceFile>;
  locations: Map<string, ReferenceFile>;
  symbols: WorkspaceScriptSymbol[];
}

interface SourceInput {
  root: string;
  path: string;
  logical: string;
  origin: string;
  priority: number;
  installedFolder?: InstalledFolder;
  packed?: PackedScriptInput;
  archiveIdentity?: string;
  replacement?: boolean;
}

function readManifestPage(value: unknown, offset: number, limit = PAGE_SIZE): ManifestPage {
  const page = value as ManifestPage | null;
  if (!page || typeof page.status?.root !== 'string' || !path.isAbsolute(page.status.root)
    || typeof page.generation !== 'string' || page.generation !== page.status.current?.generation
    || page.offset !== offset || !Number.isSafeInteger(page.total) || page.total < offset || page.total > MAX_FILES
    || !Array.isArray(page.files) || page.files.length !== Math.min(limit, page.total - offset)) {
    throw new Error('The prepared reference inventory is unavailable or incomplete.');
  }
  return page;
}

function referenceInput(row: ManifestPage['files'][number], domain: Domain) {
  if (typeof row?.path !== 'string' || hasInvalidNavigationPathCharacters(row.path) || row.path.includes('\\')) {
    throw new Error('The reference inventory contains an invalid script path.');
  }
  const parts = row.path.split('/');
  const filename = parts.at(-1) ?? '';
  if (!/^[^/:]+\.xml$/i.test(filename)) return undefined;
  if (parts.length === 2 && parts[0].toLowerCase() === domain && row.source === 'base') {
    return { logical: `${domain}/${filename}`, origin: 'Base game', priority: 1 };
  }
  if (parts.length === 4 && parts[0].toLowerCase() === 'extensions' && parts[2].toLowerCase() === domain
    && typeof row.source === 'string' && /^ego_dlc_[a-z0-9_-]+$/.test(row.source)
    && parts[1].toLowerCase() === row.source) {
    return { logical: `${domain}/${filename}`, origin: `DLC ${row.source}`, priority: 2 };
  }
  return undefined;
}

const pathKey = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;

function matchesScriptInput(input: string, logical: string): boolean {
  if (typeof input !== 'string' || hasInvalidNavigationPathCharacters(input) || input.includes('\\')) return false;
  if (input === 'extensions' || pathKey(input) === pathKey(logical)) return true;
  const owner = /^extensions\/ego_dlc_[a-z0-9_-]+\/(.+)$/i.exec(input);
  return !!owner && (pathKey(owner[1]) === pathKey(logical) || owner[1] === 'content.xml');
}

function readScriptComposition(value: unknown, root: string, logical: string): ScriptComposition | undefined {
  const reply = value as { root?: string; relativePath?: string; complete?: boolean; scriptSymbolOrigins?: EffectiveScriptOrigins } | null;
  const projection = reply?.scriptSymbolOrigins;
  if (reply?.complete !== true || typeof reply.root !== 'string' || pathKey(reply.root) !== pathKey(root)
    || reply.relativePath !== logical || projection?.complete !== true || typeof projection.identity !== 'string'
    || !SHA256.test(projection.identity) || !Array.isArray(projection.inputs) || projection.inputs.length < 2
    || projection.inputs.length > MAX_SCRIPT_ORIGIN_INPUTS || !Array.isArray(projection.symbols)
    || projection.symbols.length > MAX_DECLARATIONS) return undefined;
  const inputs = new Set<string>();
  for (const input of projection.inputs) {
    if (!input || !matchesScriptInput(input.path, logical)
      || (input.stamp !== null && (typeof input.stamp !== 'string' || !/^-?\d+(:-?\d+){7}$/.test(input.stamp)))
      || inputs.has(pathKey(input.path))) return undefined;
    inputs.add(pathKey(input.path));
  }
  if (!inputs.has('extensions') || !inputs.has(pathKey(logical))) return undefined;
  const validPosition = (position: WorkspaceScriptSymbol['start']) => position
    && [position.line, position.column].every(value => Number.isSafeInteger(value) && value >= 0 && value < MAX_FILE_BYTES);
  if (!projection.symbols.some(symbol => symbol?.kind === 'script') || projection.symbols.some(symbol =>
    !symbol || !SYMBOL_KINDS.has(symbol.kind) || !matchesScriptInput(symbol.file, logical)
    || !inputs.has(pathKey(symbol.file))
    || typeof symbol.name !== 'string' || !symbol.name || typeof symbol.qualifiedName !== 'string'
    || typeof symbol.container !== 'string' || typeof symbol.sourceHash !== 'string' || !SHA256.test(symbol.sourceHash)
    || !validPosition(symbol.start) || !validPosition(symbol.end) || symbol.end.line < symbol.start.line
    || (symbol.end.line === symbol.start.line && symbol.end.column <= symbol.start.column))) return undefined;
  return { ...projection, identity: projection.identity, inputs: projection.inputs };
}

function isScriptDiff(text: string): boolean {
  const first = scanXmlTagTokens(text.slice(0, 32_768)).next().value;
  return !!first && /^<diff(?:[\s/>])/i.test(first.token);
}

async function originInputStamp(file: string): Promise<string | null> {
  const stamp = await existingStamp(file);
  return stamp ? scriptOriginInputStamp(stamp) : null;
}

async function compositionInputsCurrent(
  root: string, composition: ScriptComposition, observe: (file: string) => Promise<string | null> = originInputStamp,
): Promise<boolean> {
  for (const input of composition.inputs) {
    if (await observe(path.join(root, ...input.path.split('/'))) !== input.stamp) return false;
  }
  return true;
}

async function existingStamp(file: string) {
  return physicalStamp(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
}

function optionalStampMatches(before: BigIntStats | undefined, after: BigIntStats | undefined) {
  return before && after ? sameStamp(before, after) : before === after;
}

function validReferenceRoot(input: string | undefined): string | undefined {
  if (!input || !path.isAbsolute(input)) return undefined;
  const root = path.resolve(input);
  return root !== path.parse(root).root ? root : undefined;
}

async function gameExtensionsRoot(backend: WorkspaceReferenceBackend): Promise<string | undefined> {
  const root = validReferenceRoot(await backend.readGameRoot?.());
  return root ? path.join(root, 'extensions') : undefined;
}

function extensionRoot(scope: Scope, backend: WorkspaceReferenceBackend): Promise<string | undefined> {
  return scope === 'dlc' ? gameExtensionsRoot(backend) : readConfiguredExtensionRoot(backend);
}

async function readConfiguredExtensionRoot(backend: WorkspaceReferenceBackend): Promise<string | undefined> {
  return validReferenceRoot(await backend.readInstalledRoot?.());
}

function gameVersionReader() {
  let pending: { owner: object; result: Promise<GameCatalogVersion | null> } | undefined;
  return (backend: WorkspaceReferenceBackend, fresh = false) => {
    if (!fresh && pending?.owner === backend.owner) return pending.result;
    const result = Promise.resolve().then(async () => {
      const root = validReferenceRoot(await backend.readGameRoot?.());
      return root ? readGameCatalogVersion(root) : null;
    }).catch(() => null).finally(() => {
      if (pending?.result === result) pending = undefined;
    });
    pending = { owner: backend.owner, result };
    return result;
  };
}

function installedContent(bytes: Buffer): ({ id: string } & ExtensionDependencies) | undefined {
  let malformed = false;
  const document = new DOMParser({ onError: () => { malformed = true; } })
    .parseFromString(utf8.decode(bytes), 'text/xml');
  const root = document.documentElement;
  const identity = !malformed && !document.doctype && !root?.namespaceURI ? contentManifestIdentityFromRoot(root) : undefined;
  return identity ? { id: identity.modId, ...readExtensionDependencies(root) } : undefined;
}

export function readReferenceBytes(file: ReferenceFile): Promise<Buffer> {
  return file.packed ? readPackedScript(file.packed) : readDiskInput({ file: file.file, stamp: file.stamp });
}

/** A separate cache keeps a missing configured source from withholding the other. */
function createReferenceIndex(
  scope: Scope,
  getBackend: () => WorkspaceReferenceBackend | undefined,
  report: (message: string) => void,
  readGameVersion: ReturnType<typeof gameVersionReader>,
) {
  let inventory: Inventory | undefined;
  let pending: { owner: object; result: Promise<Inventory | undefined> } | undefined;
  let expires = 0;
  let retryOwner: object | undefined;
  let lastMessage = '';
  const labels = {
    corpus: 'Unpacked game and DLC',
    game: 'Installed base game',
    dlc: 'Installed DLC',
    installed: 'Configured extension',
  };
  const label = labels[scope];
  const reportChange = (message: string) => {
    if (message !== lastMessage) { lastMessage = message; report(message); }
  };
  const isCurrent = (owner: object) => getBackend()?.owner === owner;

  async function collect(backend: WorkspaceReferenceBackend): Promise<Inventory | undefined> {
    const priorInventory = inventory?.owner === backend.owner ? inventory : undefined;
    const saved = priorInventory?.files;
    const files = new Map<string, ReferenceFile>();
    const seen = new Set<string>();
    const compositions = new Map<string, ScriptComposition>();
    const replacedFiles = new Set<ReferenceFile>();
    const patchCandidates = new Set<ReferenceFile>();
    const effectiveFiles: ReferenceFile[] = [];
    const packedWatches = new Map<string, BigIntStats | undefined>();
    const officialFolders: PackedReferenceProfile['officialFolders'] = [];
    let packedQualified = scope === 'game';
    let compositionCursor = 0;
    let remaining = scope === 'installed' || scope === 'dlc' ? MAX_INSTALLED_BYTES : MAX_CORPUS_BYTES;
    let declarations = 0;
    let skipped = 0;
    const chargeRead = (size: number) => {
      if (size > remaining) throw new Error('The reference inventory exceeds its byte budget.');
      remaining -= size;
    };

    async function collectFile(input: SourceInput) {
      if (!isCurrent(backend.owner)) throw new Error('The reference backend changed.');
      const logicalFile = path.join(input.root, ...input.path.split('/'));
      const file = input.packed?.data.file ?? logicalFile;
      const key = pathKey(logicalFile);
      if (seen.has(key)) throw new Error('The reference inventory contains duplicate source paths.');
      seen.add(key);
      if (seen.size > MAX_FILES) throw new Error('The reference inventory exceeds its file budget.');
      const stamp = input.packed?.data.stamp ?? await physicalStamp(file).catch(() => undefined);
      const packedContributor = scope === 'game' || (input.installedFolder?.official && !input.replacement);
      const unreadable = () => { skipped++; if (packedContributor) packedQualified = false; };
      if (!stamp?.isFile() || stamp.nlink !== 1n) { unreadable(); return; }
      const size = input.packed?.entry.size ?? Number(stamp.size);
      if (size > MAX_FILE_BYTES) throw new Error('The reference script exceeds its byte budget.');
      chargeRead(size);

      const prior = saved?.get(key);
      let record: ReferenceFile;
      if (prior && prior.origin === input.origin && sameStamp(prior.stamp, stamp)
        && prior.installedFolder?.identity === input.installedFolder?.identity
        && prior.archiveIdentity === input.archiveIdentity) {
        record = { ...prior, installedFolder: input.installedFolder, packed: input.packed };
      } else {
        const bytes = await (input.packed ? readPackedScript(input.packed) : readDiskInput({ file, stamp }))
          .catch(() => undefined);
        if (!bytes) { unreadable(); return; }
        let text: string;
        try { text = utf8.decode(bytes); } catch { unreadable(); return; }
        const hash = createHash('sha256').update(bytes).digest('hex');
        const authority = createHash('sha256').update(scope).update('\0').update(input.root)
          .update('\0').update(input.path).update('\0').update(hash)
          .update('\0').update(input.installedFolder?.identity ?? input.archiveIdentity ?? '').digest('hex');
        const uri = vscode.Uri.from({ scheme: SCHEME, authority, path: `/${input.path}` });
        const symbols = readWorkspaceScriptSymbols(input.logical, text, input.origin)
          .map(symbol => ({ ...symbol, file: uri.toString(), originPriority: input.priority }));
        record = { file, logical: input.logical, replacement: input.replacement, stamp, origin: input.origin,
          installedFolder: input.installedFolder, packed: input.packed, archiveIdentity: input.archiveIdentity,
          isPatch: (scope === 'corpus' || packedContributor) && isScriptDiff(text), hash, uri, symbols };
      }
      if (record.symbols.length === 0 && !(record.isPatch && (packedContributor || backend.readScriptOrigins))) skipped++;
      declarations += record.symbols.length;
      if (declarations > MAX_DECLARATIONS) throw new Error('The reference symbol index exceeds its declaration budget.');
      files.set(key, record);
    }

    let root: string;
    let generation: string | undefined;
    let rootStamp: BigIntStats | undefined;
    let gameCatalogs: ExtensionScriptCatalogs | undefined;
    let gameVersion: GameCatalogVersion | null | undefined;
    if (scope === 'corpus') {
      let identity: { root: string; generation: string } | undefined;
      const scriptGroups = new Map<string, { logical: string; records: Map<string, ReferenceFile> }>();
      let observedCount = 0;
      for (const domain of DOMAINS) {
        let total = 0;
        for (let offset = 0; offset === 0 || offset < total; offset += PAGE_SIZE) {
          const page = readManifestPage(await backend.readPage(domain, offset, PAGE_SIZE), offset);
          const currentRoot = path.resolve(page.status.root);
          identity ??= { root: currentRoot, generation: page.generation };
          if (!isCurrent(backend.owner) || identity.root !== currentRoot || identity.generation !== page.generation
            || (offset > 0 && total !== page.total)) throw new Error('The reference inventory changed during collection.');
          total = page.total;
          if (offset === 0 && (observedCount += total) > MAX_FILES) throw new Error('The reference inventory exceeds its file budget.');
          for (const row of page.files) {
            const input = referenceInput(row, domain);
            if (!input) continue;
            await collectFile({ root: currentRoot, path: row.path, ...input });
            if (backend.readScriptOrigins) {
              const key = pathKey(input.logical);
              const group = scriptGroups.get(key) ?? { logical: input.logical, records: new Map<string, ReferenceFile>() };
              const record = files.get(pathKey(path.join(currentRoot, ...row.path.split('/'))));
              if (record) group.records.set(pathKey(row.path), record);
              scriptGroups.set(key, group);
            }
          }
        }
      }
      const page = readManifestPage(await backend.readPage('md', 0, 1), 0, 1);
      if (!identity || path.resolve(page.status.root) !== identity.root || page.generation !== identity.generation) {
        throw new Error('The reference inventory changed during collection.');
      }
      ({ root, generation } = identity);
      if (backend.readScriptOrigins) {
        const targets = [...scriptGroups.values()].filter(group => [...group.records.values()].some(record => record.isPatch));
        const prior = priorInventory?.root === root && priorInventory.generation === generation ? priorInventory : undefined;
        const observed = new Map<string, Promise<string | null>>();
        const observe = (file: string) => {
          const prior = observed.get(file);
          if (prior) return prior;
          const observation = originInputStamp(file);
          observed.set(file, observation);
          return observation;
        };
        const inputsCurrent = (projection: ScriptComposition) => compositionInputsCurrent(root, projection, observe);
        const begin = prior?.compositionCursor ?? 0;
        const deadline = Date.now() + COMPOSITION_BUDGET_MS;
        let requests = 0;
        compositionCursor = begin;
        for (let index = 0; index < targets.length; index++) {
          if (!isCurrent(backend.owner)) throw new Error('The reference backend changed.');
          const targetIndex = (begin + index) % targets.length;
          const group = targets[targetIndex];
          const key = pathKey(group.logical);
          for (const record of group.records.values()) patchCandidates.add(record);
          let projection = prior?.compositions.get(key);
          if (projection && !await inputsCurrent(projection).catch(() => false)) projection = undefined;
          if (!projection && requests < MAX_COMPOSITION_REQUESTS && Date.now() <= deadline) {
            requests++;
            compositionCursor = (targetIndex + 1) % targets.length;
            projection = await backend.readScriptOrigins(group.logical).then(value =>
              readScriptComposition(value, root, group.logical)).catch(() => undefined);
          }
          if (!projection || !await inputsCurrent(projection).catch(() => false)
            || projection.inputs.some(input => input.stamp !== null && !/^(extensions|extensions\/[^/]+\/content\.xml)$/i.test(input.path)
              && !group.records.has(pathKey(input.path)))) { skipped++; continue; }
          const attributed = new Map<string, ReferenceFile>();
          for (const symbol of projection.symbols) {
            const file = pathKey(symbol.file);
            const source = group.records.get(file);
            if (!source || source.hash !== symbol.sourceHash) { attributed.clear(); break; }
            let record = attributed.get(file);
            if (!record) {
              const authority = createHash('sha256').update(source.uri.authority).update('\0').update(generation)
                .update('\0').update(projection.identity).digest('hex');
              const uri = vscode.Uri.from({ scheme: SCHEME, authority, path: source.uri.path });
              record = { ...source, uri, symbols: [], composition: { logical: group.logical, identity: projection.identity } };
              attributed.set(file, record);
            }
            record.symbols.push({ ...symbol, file: record.uri.toString(),
              container: symbol.container.replace('Effective reference', `${source.origin}, effective reference`),
              originPriority: file.startsWith('extensions/') ? 2 : 1 });
          }
          const removed = [...group.records.values()].reduce((count, record) => count + record.symbols.length, 0);
          const projectedDeclarations = declarations - removed + projection.symbols.length;
          if (!attributed.size || projectedDeclarations > MAX_DECLARATIONS) { skipped++; continue; }
          declarations = projectedDeclarations;
          compositions.set(key, projection);
          for (const record of group.records.values()) replacedFiles.add(record);
          effectiveFiles.push(...attributed.values());
        }
        if (requests) {
          const current = readManifestPage(await backend.readPage('md', 0, 1), 0, 1);
          if (path.resolve(current.status.root) !== root || current.generation !== generation) {
            throw new Error('The reference inventory changed during script composition.');
          }
        }
      }
    } else if (scope === 'game') {
      const configured = validReferenceRoot(await backend.readGameRoot?.());
      if (!configured) return undefined;
      root = configured;
      rootStamp = await physicalStamp(root);
      if (!rootStamp.isDirectory()) throw new Error('The configured game root is not a directory.');
      packedWatches.set(root, rootStamp);
      const oldCatalogs = priorInventory?.root === root && priorInventory.rootStamp
        && sameStamp(priorInventory.rootStamp, rootStamp) ? priorInventory.gameCatalogs : undefined;
      let entries = 0;
      const observeEntry = () => {
        if (!isCurrent(backend.owner) || ++entries > MAX_INSTALLED_ENTRIES) {
          throw new Error('The game root inventory changed or exceeded its bounds.');
        }
      };
      if (oldCatalogs && await extensionScriptCatalogsCurrent(oldCatalogs.parts)) {
        gameCatalogs = oldCatalogs;
      } else {
        const names: string[] = [];
        for await (const entry of await fs.opendir(root)) {
          observeEntry();
          if (/^\d{2}\.(cat|dat)$/i.test(entry.name)) names.push(entry.name);
        }
        gameCatalogs = await readBaseGameScriptCatalogs(root, names);
      }
      const archiveIdentity = gameCatalogs.identity;
      for (const part of gameCatalogs.parts) packedWatches.set(part.file, part.stamp);
      for (const packed of gameCatalogs.scripts.values()) {
        if (packed.entry.size === 0) continue;
        await collectFile({ root, path: packed.logical, logical: packed.logical,
          origin: `Base game, ${packed.archive}`, priority: 1, packed, archiveIdentity });
      }
      for (const domain of DOMAINS) {
        const directory = path.join(root, domain);
        const stamp = await existingStamp(directory);
        packedWatches.set(directory, stamp);
        if (!stamp?.isDirectory()) {
          if (stamp) packedQualified = false;
          continue;
        }
        for await (const entry of await fs.opendir(directory)) {
          observeEntry();
          if (!entry.isFile() || !/\.xml$/i.test(entry.name) || hasInvalidNavigationPathCharacters(entry.name)) continue;
          const logical = `${domain}/${entry.name}`;
          if (gameCatalogs.scripts.has(logical.toLowerCase())) continue;
          await collectFile({ root, path: logical, logical, origin: 'Base game, loose', priority: 1, archiveIdentity });
        }
        if (!sameStamp(stamp, await physicalStamp(directory))) throw new Error('The base-game script directory changed.');
      }
      if (validReferenceRoot(await backend.readGameRoot?.()) !== root || !sameStamp(rootStamp, await physicalStamp(root))
        || !(await extensionScriptCatalogsCurrent(gameCatalogs.parts))) {
        throw new Error('The configured game catalogs changed during collection.');
      }
    } else {
      const configured = await extensionRoot(scope, backend);
      if (!configured) return undefined;
      root = configured;
      rootStamp = await existingStamp(root);
      if (!rootStamp?.isDirectory()) return undefined;
      // Both paths are resolved physical directories. If the configured folder is
      // already this root, its inventory includes the official DLC as well.
      const otherRoot = scope === 'dlc'
        ? await readConfiguredExtensionRoot(backend).catch(() => undefined)
        : await gameExtensionsRoot(backend).catch(() => undefined);
      const sameRoot = otherRoot !== undefined && pathKey(root) === pathKey(otherRoot);
      if (scope === 'dlc' && sameRoot) return undefined;
      const gameOwned = scope === 'dlc' || sameRoot;
      const knownDlcFolders = new Set<string>();
      if (gameOwned) {
        packedQualified = true;
        packedWatches.set(root, rootStamp);
      }
      let observedEntries = 0;
      const observeEntry = () => {
        if (!isCurrent(backend.owner) || ++observedEntries > MAX_INSTALLED_ENTRIES) {
          throw new Error('The configured extension inventory changed or exceeded its bounds.');
        }
      };
      for await (const entry of await fs.opendir(root)) {
        observeEntry();
        const folderName = entry.name.toLowerCase();
        const dlcFolder = gameOwned && /^ego_dlc_[a-z0-9_-]+$/.test(folderName);
        if (dlcFolder) knownDlcFolders.add(entry.name);
        if (!entry.isDirectory() || entry.name.startsWith('.') || hasInvalidNavigationPathCharacters(entry.name)) continue;
        if (scope === 'dlc' && !dlcFolder) continue;
        const directory = path.join(root, entry.name);
        const stamp = await physicalStamp(directory).catch(() => undefined);
        if (!stamp?.isDirectory()) { skipped++; continue; }
        const manifest = path.join(directory, 'content.xml');
        let manifestStamp: BigIntStats | undefined;
        let id: string | undefined;
        let content: ReturnType<typeof installedContent>;
        let identity = `${stamp.dev}:${stamp.ino}`;
        try { manifestStamp = await existingStamp(manifest); } catch { skipped++; continue; }
        if (manifestStamp) {
          const size = Number(manifestStamp.size);
          if (!manifestStamp.isFile() || manifestStamp.nlink !== 1n || size > MAX_CONTENT_BYTES) { skipped++; continue; }
          chargeRead(size);
          try {
            const bytes = await readDiskInput({ file: manifest, stamp: manifestStamp });
            const digest = createHash('sha256').update(bytes).digest('hex');
            identity += `:${manifestStamp.dev}:${manifestStamp.ino}:${digest}`;
            content = installedContent(bytes);
            if (content && /^[a-z0-9_.-]{1,128}$/i.test(content.id)) id = content.id;
          } catch { skipped++; continue; }
        }
        const official = dlcFolder && id?.toLowerCase() === folderName;
        if (scope === 'dlc' && !official) { skipped++; continue; }
        const parts: string[] = [];
        for await (const child of await fs.opendir(directory)) {
          observeEntry();
          if (/^(?:ext|subst)_.+\.(?:cat|dat)$/i.test(child.name)) parts.push(child.name);
        }
        const versioned = parts.some(name => VERSIONED_EXTENSION_CATALOG_PART.test(name));
        const substitutionParts = parts.filter(name => /^subst_/i.test(name));
        const versionedSubstitutions = substitutionParts.some(name => VERSIONED_SUBSTITUTION_CATALOG_PART.test(name));
        if ((versioned || versionedSubstitutions) && gameVersion === undefined) gameVersion = await readGameVersion(backend);

        const version = versioned ? gameVersion : undefined;
        const catalogs = await readExtensionScriptCatalogs(directory, parts, chargeRead, version?.version).catch(() => undefined);
        const ownerFor = (source: ExtensionScriptCatalogs | undefined, selectedVersion: GameCatalogVersion | null | undefined): InstalledFolder => {
          const authority = `${identity}:${source?.identity ?? 'catalogs-unavailable'}`;
          return {
            directory, stamp, manifestStamp, official, catalogs: source, gameVersion: selectedVersion,
            identity: selectedVersion === undefined ? authority : `${authority}:${selectedVersion?.identity ?? 'version-unavailable'}`,
          };
        };
        if (!catalogs) skipped++;
        const owner = ownerFor(catalogs, version);
        if (official && content && catalogs) {
          officialFolders.push({ ...content, id: folderName, directory });
          packedWatches.set(directory, stamp);
          packedWatches.set(manifest, manifestStamp);
          for (const part of catalogs.parts) packedWatches.set(part.file, part.stamp);
        }
        const origin = official ? `DLC ${folderName}` : id
          ? `Configured extension ${id}${id === entry.name ? '' : ` [${entry.name}]`}`
          : `Configured folder ${entry.name}`;
        const priority = official ? 2 : 3;
        for (const packed of catalogs?.scripts.values() ?? []) {
          if (packed.entry.size === 0) continue;
          const logical = packed.logical;
          await collectFile({ root, path: `${entry.name}/${logical}`, logical,
            origin: `${origin}, ${packed.archive}`, priority, installedFolder: owner, packed });
        }
        if (substitutionParts.length) {
          const replacementVersion = versionedSubstitutions ? gameVersion : undefined;
          const replacements = await readSubstitutionScriptCatalogs(directory, substitutionParts, chargeRead, replacementVersion?.version)
            .catch(() => undefined);
          if (!replacements) skipped++;
          const replacementOwner = ownerFor(replacements, replacementVersion);
          for (const packed of replacements?.scripts.values() ?? []) {
            if (packed.entry.size === 0) continue;
            const target = packed.entry.name;
            await collectFile({ root, path: `${entry.name}/.substitutions/${target}`, logical: packed.logical,
              origin: `${origin}, ${packed.archive}, replacement candidate for ${target}`, priority: 4,
              installedFolder: replacementOwner, packed, replacement: true });
          }
        }
        for (const domain of DOMAINS) {
          const dir = path.join(directory, domain);
          const dirStamp = await existingStamp(dir).catch(() => {
            skipped++;
            if (official) packedQualified = false;
            return undefined;
          });
          if (official) packedWatches.set(dir, dirStamp);
          if (!dirStamp?.isDirectory()) {
            if (official && dirStamp) packedQualified = false;
            continue;
          }
          for await (const script of await fs.opendir(dir)) {
            observeEntry();
            if (!script.isFile() || !/\.xml$/i.test(script.name) || hasInvalidNavigationPathCharacters(script.name)) continue;
            const logical = `${domain}/${script.name}`;
            if (catalogs?.scripts.has(logical.toLowerCase())) continue;
            await collectFile({ root, path: `${entry.name}/${logical}`, logical,
              origin: catalogs ? origin : `${origin}, catalog coverage unavailable`, priority, installedFolder: owner });
          }
          if (!sameStamp(dirStamp, await physicalStamp(dir))) throw new Error('The configured script folder changed.');
        }
        if (!sameStamp(stamp, await physicalStamp(directory))
          || !optionalStampMatches(manifestStamp, await existingStamp(manifest))) throw new Error('The configured extension identity changed.');
      }
      if (officialFolders.length !== knownDlcFolders.size) packedQualified = false;
      if (gameVersion) packedWatches.set(gameVersion.file, gameVersion.stamp);
      if (await extensionRoot(scope, backend) !== root || !sameStamp(rootStamp, await physicalStamp(root))) {
        throw new Error('The configured extension root changed.');
      }
      if (gameVersion !== undefined && gameVersion?.identity !== (await readGameVersion(backend, true))?.identity) {
        throw new Error('The configured game version changed during collection.');
      }
    }
    if (!isCurrent(backend.owner)) throw new Error('The reference backend changed.');
    const locations = new Map([...files.values(), ...effectiveFiles]
      .filter(file => file.symbols.length > 0 && !replacedFiles.has(file)).map(file => {
        const source = patchCandidates.has(file) ? { ...file, symbols: file.symbols.map(symbol =>
          ({ ...symbol, container: `${symbol.container} · effective reference unavailable` })) } : file;
        return [source.uri.toString(), source];
      }));
    reportChange(skipped ? `${label} symbol inventory skipped ${skipped} unreadable or unsupported inputs.` : `${label} symbol inventory ready.`);
    return { scope, owner: backend.owner, root, generation, rootStamp, gameCatalogs, gameVersion,
      packedProfile: packedQualified ? { watches: packedWatches, officialFolders } : undefined,
      files, locations, compositions, compositionCursor, symbols: [...locations.values()].flatMap(file => file.symbols) };
  }

  return {
    expire() { expires = 0; },
    async read(): Promise<Inventory | undefined> {
      const backend = getBackend();
      if (!backend || (scope === 'installed' && !backend.readInstalledRoot) || ((scope === 'game' || scope === 'dlc') && !backend.readGameRoot)) {
        inventory = undefined;
        return undefined;
      }
      if (pending?.owner === backend.owner) return pending.result;
      if (inventory?.owner !== backend.owner) inventory = undefined;
      const reusable = Date.now() < expires && (inventory || retryOwner === backend.owner);
      const cached = reusable ? inventory : undefined;
      if (reusable && !cached?.gameVersion) return cached;
      const result = Promise.resolve().then(async () => {
        if (cached?.gameVersion) {
          const version = cached.gameVersion;
          const stamp = await physicalStamp(version.file).catch(() => undefined);
          if (optionalStampMatches(version.stamp, stamp)) return cached;
        }
        return collect(backend);
      }).then(snapshot => {
        if (!isCurrent(backend.owner)) return undefined;
        inventory = snapshot;
        retryOwner = snapshot ? undefined : backend.owner;
        if (snapshot !== cached || !snapshot) expires = Date.now() + (snapshot ? REFRESH_MS : RETRY_MS);
        return snapshot;
      }).catch(() => {
        if (isCurrent(backend.owner)) {
          inventory = undefined;
          retryOwner = backend.owner;
          expires = Date.now() + RETRY_MS;
          reportChange(`${label} symbols are unavailable for the current reference inputs.`);
        }
        return undefined;
      }).finally(() => {
        if (pending?.result === result) pending = undefined;
      });
      pending = { owner: backend.owner, result };
      return result;
    },
    async check(snapshot: Inventory, file: string): Promise<vscode.Uri | undefined> {
      const source = snapshot.locations.get(file);
      if (!source || !isCurrent(snapshot.owner)) return undefined;
      const stamp = await physicalStamp(source.file).catch(() => undefined);
      if (!stamp || !sameStamp(stamp, source.stamp)) {
        expires = 0;
        return undefined;
      }
      return isCurrent(snapshot.owner) && inventory?.locations.get(file) === source ? source.uri : undefined;
    },
    selection(uri: vscode.Uri) {
      const key = uri.toString();
      const selected = inventory;
      const source = selected?.locations.get(key);
      if (!selected || !source) return undefined;
      return async (token: vscode.CancellationToken) => {
        const backend = getBackend();
        if (token.isCancellationRequested || backend?.owner !== selected.owner) {
          throw new Error('This reference selection expired. Search for the symbol again.');
        }
        const before = await physicalStamp(source.file);
        if (!sameStamp(source.stamp, before)) {
          expires = 0;
          throw new Error('This reference changed. Search for the symbol again.');
        }
        const bytes = await readReferenceBytes(source);
        let selectionMatches: boolean;
        if (source.installedFolder) {
          const current = await extensionRoot(selected.scope, backend);
          const folder = source.installedFolder;
          const rootAfter = current === selected.root ? await physicalStamp(current) : undefined;
          const gameOwner = folder.official
            ? selected.scope === 'dlc' ? current : await gameExtensionsRoot(backend)
            : undefined;
          selectionMatches = !!rootAfter && !!selected.rootStamp
            && (!folder.official || (gameOwner !== undefined && pathKey(gameOwner) === pathKey(selected.root)))
            && rootAfter.dev === selected.rootStamp.dev && rootAfter.ino === selected.rootStamp.ino
            && sameStamp(folder.stamp, await physicalStamp(folder.directory))
            && optionalStampMatches(folder.manifestStamp, await existingStamp(path.join(folder.directory, 'content.xml')))
            && (!folder.catalogs || await extensionScriptCatalogsCurrent(folder.catalogs.parts));
        } else if (selected.gameCatalogs && selected.rootStamp) {
          const current = validReferenceRoot(await backend.readGameRoot?.());
          selectionMatches = current === selected.root
            && await extensionScriptCatalogsCurrent(selected.gameCatalogs.parts)
            && sameStamp(selected.rootStamp, await physicalStamp(current));
        } else {
          const current = readManifestPage(await backend.readPage('md', 0, 1), 0, 1);
          selectionMatches = path.resolve(current.status.root) === selected.root && current.generation === selected.generation;
          const composition = source.composition;
          if (selectionMatches && composition) {
            try {
              const fresh = readScriptComposition(await backend.readScriptOrigins?.(composition.logical), selected.root, composition.logical);
              const confirmed = readManifestPage(await backend.readPage('md', 0, 1), 0, 1);
              selectionMatches = !!fresh && fresh.identity === composition.identity
                && path.resolve(confirmed.status.root) === selected.root && confirmed.generation === selected.generation
                && await compositionInputsCurrent(selected.root, fresh);
            } catch { selectionMatches = false; }
            if (!selectionMatches) selected.compositions.delete(pathKey(composition.logical));
          }
        }
        const after = await physicalStamp(source.file);
        const version = source.installedFolder?.gameVersion;
        if (selectionMatches && version !== undefined) {
          selectionMatches = version?.identity === (await readGameVersion(backend, true))?.identity;
        }
        if (!selectionMatches || token.isCancellationRequested || inventory?.locations.get(key) !== source
          || !isCurrent(selected.owner) || createHash('sha256').update(bytes).digest('hex') !== source.hash || !sameStamp(before, after)) {
          expires = 0;
          throw new Error('This reference changed. Search for the symbol again.');
        }
        return utf8.decode(bytes);
      };
    },
  };
}

export function registerWorkspaceReferenceSymbols(
  context: vscode.ExtensionContext,
  getBackend: () => WorkspaceReferenceBackend | undefined,
  report: (message: string) => void,
) {
  const readGameVersion = gameVersionReader();
  const corpus = createReferenceIndex('corpus', getBackend, report, readGameVersion);
  const installed = createReferenceIndex('installed', getBackend, report, readGameVersion);
  const game = createReferenceIndex('game', getBackend, report, readGameVersion);
  const dlc = createReferenceIndex('dlc', getBackend, report, readGameVersion);
  const indices = { corpus, game, dlc, installed };
  const packed = createPackedReferenceOrigins(getBackend, readReferenceBytes, report, () => {
    game.expire(); dlc.expire(); installed.expire();
  });
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    async provideTextDocumentContent(uri, token) {
      const read = packed.selection(uri) ?? corpus.selection(uri) ?? game.selection(uri) ?? dlc.selection(uri) ?? installed.selection(uri);
      if (!read) throw new Error('This reference selection expired. Search for the symbol again.');
      return read(token);
    },
  }));
  return {
    async read(): Promise<Inventory[]> {
      const reference = corpus.read().then<Array<Inventory | undefined>>(snapshot =>
        snapshot ? [snapshot] : Promise.all([game.read(), dlc.read()]));
      const [gameInputs, configured] = await Promise.all([reference, installed.read()]);
      const inputs = [...gameInputs, configured].filter((input): input is Inventory => input !== undefined);
      return packed.read(inputs);
    },
    check(snapshot: Inventory, file: string): Promise<vscode.Uri | undefined> {
      return packed.owns(snapshot) ? packed.check(file) : indices[snapshot.scope].check(snapshot, file);
    },
  };
}
