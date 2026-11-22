import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { orderExtensionDependencies, type ExtensionDependencies } from '../../shared/contentManifestIdentity';
import { scriptOriginInputStamp, type EffectiveScriptOrigins } from '../../shared/workspaceScriptSymbols';
import { physicalStamp, sameStamp } from './aiScriptDefinitionHost';
import type { Inventory, ReferenceFile, WorkspaceReferenceBackend } from './workspaceReferenceSymbolsHost';

const MAX_WATCHES = 1_024;
const MAX_GROUPS_PER_REFRESH = 24;
const MAX_CHAIN_BYTES = 2 * 1024 * 1024;
const REFRESH_BUDGET_MS = 500;
const fileKey = (file: string) => process.platform === 'win32' ? file.toLowerCase() : file;
const logicalKey = (file: string) => file.toLowerCase();
const sourceHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export interface PackedReferenceProfile {
  watches: Map<string, BigIntStats | undefined>;
  officialFolders: Array<ExtensionDependencies & { id: string; directory: string }>;
}

type PackedGroup = { logical: string; records: ReferenceFile[] };
interface GroupResult {
  identity: string;
  projection: EffectiveScriptOrigins;
}
interface BoundOrigin {
  source: ReferenceFile;
  watch: Map<string, BigIntStats | undefined>;
}
interface PackedView {
  game: Inventory;
  dlc: Inventory;
  view: Inventory;
  replaced: Set<ReferenceFile>;
  groups: Map<string, GroupResult>;
  bindings: Map<string, BoundOrigin>;
  cursor: number;
}

async function matchesGameRoot(backend: WorkspaceReferenceBackend, expected: string): Promise<boolean> {
  const configured = await backend.readGameRoot?.();
  return !!configured && path.isAbsolute(configured) && fileKey(path.resolve(configured)) === fileKey(expected);
}

async function matchesDisk(files: ReadonlyMap<string, BigIntStats | undefined>): Promise<boolean> {
  for (const [file, stamp] of files) {
    try {
      const current = await physicalStamp(file);
      if (!stamp || !sameStamp(stamp, current)) return false;
    } catch (error) {
      if (stamp || (error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    }
  }
  return true;
}

function orderedGroups(game: Inventory, dlc: Inventory): PackedGroup[] {
  const profile = dlc.packedProfile!;
  const available = new Set(profile.officialFolders.map(folder => folder.id));
  if (profile.officialFolders.some(folder => folder.requiredDependencies.some(id => !available.has(id)))) return [];
  let ordered: PackedReferenceProfile['officialFolders'];
  try {
    ordered = orderExtensionDependencies([...profile.officialFolders].sort((a, b) => a.directory.localeCompare(b.directory)), true);
  } catch { return []; }
  const order = new Map(ordered.map((folder, index) => [folder.directory, index + 1]));
  const groups = new Map<string, PackedGroup>();
  const rank = (record: ReferenceFile) => record.installedFolder ? order.get(record.installedFolder.directory) : 0;
  for (const record of [...game.files.values(), ...dlc.files.values()]) {
    if (record.replacement || rank(record) === undefined) continue;
    const key = logicalKey(record.logical);
    const group = groups.get(key) ?? { logical: record.logical, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.records.some(record => record.isPatch && record.installedFolder)
    && new Set(group.records.map(rank)).size === group.records.length)
    .map(group => ({ ...group, records: [...group.records].sort((a, b) => rank(a)! - rank(b)!) }));
}

function chainFor(group: PackedGroup): ReferenceFile[] {
  let chain: ReferenceFile[] = [];
  for (const record of group.records) {
    if (!record.isPatch) chain = [record];
    else if (chain.length) chain.push(record);
  }
  return chain;
}

const immutableUri = (source: ReferenceFile, identity: string) => vscode.Uri.from({
  scheme: source.uri.scheme,
  authority: createHash('sha256').update(source.uri.authority).update('\0').update(identity).digest('hex'),
  path: source.uri.path,
});

export function createPackedReferenceOrigins(
  getBackend: () => WorkspaceReferenceBackend | undefined,
  readBytes: (source: ReferenceFile) => Promise<Buffer>,
  report: (message: string) => void,
  expireRaw: () => void,
) {
  let current: PackedView | undefined;
  let checked: { game: Inventory; dlc: Inventory } | undefined;
  let pending: { game: Inventory; dlc: Inventory; promise: Promise<PackedView | undefined> } | undefined;
  let reported: string | undefined;
  const reportChange = (message: string) => {
    if (reported !== message) { reported = message; report(message); }
  };

  async function collect(game: Inventory, dlc: Inventory): Promise<PackedView | undefined> {
    const groups = orderedGroups(game, dlc);
    if (!groups.length) return undefined;
    const watches = new Map([...game.packedProfile!.watches, ...dlc.packedProfile!.watches]);
    if (watches.size > MAX_WATCHES || !await matchesDisk(watches)) return undefined;
    const profileIdentity = createHash('sha256').update(JSON.stringify([...watches].sort(([left], [right]) => left.localeCompare(right)).map(([file, stamp]) =>
      [fileKey(file), stamp ? scriptOriginInputStamp(stamp) : null]))).digest('hex');
    const prior = current?.game.owner === game.owner && current.game.root === game.root ? current : undefined;
    const results = new Map<string, GroupResult>();
    const bindings = new Map<string, BoundOrigin>();
    const replaced = new Set<ReferenceFile>();
    const locations = new Map<string, ReferenceFile>();
    let cursor = prior?.cursor ?? 0;
    const begin = cursor;
    let requests = 0;
    let declarations = game.symbols.length + dlc.symbols.length;
    const deadline = Date.now() + REFRESH_BUDGET_MS;
    for (let index = 0; index < groups.length; index++) {
      if (getBackend()?.owner !== game.owner) return undefined;
      const targetIndex = (begin + index) % groups.length;
      const group = groups[targetIndex];
      const key = logicalKey(group.logical);
      const chain = chainFor(group);
      const bytes = chain.reduce((total, record) => total + (record.packed?.entry.size ?? Number(record.stamp.size)), 0);
      if (!chain.length || bytes > MAX_CHAIN_BYTES) continue;
      const identity = createHash('sha256').update(profileIdentity).update('\0')
        .update(JSON.stringify(group.records.map(record => [record.uri.toString(), record.hash, scriptOriginInputStamp(record.stamp)]))).digest('hex');
      let result = prior?.groups.get(key);
      if (result?.identity !== identity) {
        if (requests >= MAX_GROUPS_PER_REFRESH || Date.now() > deadline) continue;
        requests++;
        cursor = (targetIndex + 1) % groups.length;
        try {
          const layers = [];
          for (const record of chain) {
            const original = await readBytes(record);
            if (sourceHash(original) !== record.hash) throw new Error('Packed script source changed.');
            layers.push({ source: record.origin, path: record.uri.toString(), text: decoder.decode(original) });
          }
          const { composePackedScriptOrigins } = await import('../../shared/x4ScriptComposition.js');
          const projection = composePackedScriptOrigins(group.logical, layers);
          result = projection?.complete ? { identity, projection } : undefined;
        } catch { result = undefined; }
      }
      if (!result) continue;
      const projectedDeclarations = declarations - group.records.reduce((total, record) => total + record.symbols.length, 0)
        + result.projection.symbols.length;
      if (projectedDeclarations > 32_768) continue;
      const original = new Map(chain.map(record => [record.uri.toString(), record]));
      if (result.projection.symbols.some(symbol => original.get(symbol.file)?.hash !== symbol.sourceHash)) continue;
      const watch = new Map(group.records.map(record => [record.file, record.stamp]));
      if (!await matchesDisk(watch)) continue;
      for (const symbol of result.projection.symbols) {
        const source = original.get(symbol.file)!;
        const uri = immutableUri(source, identity);
        const key = uri.toString();
        const record = locations.get(key) ?? { ...source, uri, symbols: [] };
        record.symbols.push({ ...symbol, file: key,
          container: symbol.container.replace('Effective reference', `${source.origin}, effective reference`),
          originPriority: source.installedFolder ? 2 : 1 });
        locations.set(key, record);
        bindings.set(key, { source, watch });
      }
      declarations = projectedDeclarations;
      results.set(key, result);
      for (const record of group.records) replaced.add(record);
    }
    if (getBackend()?.owner !== game.owner || !await matchesDisk(watches)) return undefined;
    reportChange(`${results.size} of ${groups.length} official installed script compositions are available.`);
    return {
      game, dlc, groups: results, replaced, bindings, cursor,
      view: { ...game, locations, symbols: [...locations.values()].flatMap(record => record.symbols) },
    };
  }

  function withEffective(inputs: Inventory[], snapshot: PackedView | undefined): Inventory[] {
    if (!snapshot?.view.symbols.length) return inputs;
    const visible = inputs.map(input => {
      if (input !== snapshot.game && input !== snapshot.dlc) return input;
      const locations = new Map([...input.locations].filter(([, record]) => !snapshot.replaced.has(record)));
      return { ...input, locations, symbols: [...locations.values()].flatMap(record => record.symbols) };
    });
    return [...visible, snapshot.view];
  }

  return {
    async read(inputs: Inventory[]): Promise<Inventory[]> {
      const game = inputs.find(input => input.scope === 'game');
      const dlc = game && inputs.find(input => (input.scope === 'dlc' || input.scope === 'installed')
        && fileKey(input.root) === fileKey(path.join(game.root, 'extensions')));
      if (!game?.packedProfile || !dlc?.packedProfile) { checked = undefined; current = undefined; pending = undefined; return inputs; }
      if (checked?.game === game && checked.dlc === dlc) return withEffective(inputs, current);
      if (pending?.game !== game || pending.dlc !== dlc) {
        const promise = collect(game, dlc).then(snapshot => {
          if (pending?.promise === promise && getBackend()?.owner === game.owner) { checked = { game, dlc }; current = snapshot; }
          return current === snapshot ? snapshot : undefined;
        }).catch(() => undefined).finally(() => { if (pending?.promise === promise) pending = undefined; });
        pending = { game, dlc, promise };
      }
      return withEffective(inputs, await pending.promise);
    },
    owns(snapshot: Inventory): boolean { return current?.view === snapshot; },
    async check(file: string): Promise<vscode.Uri | undefined> {
      const selected = current;
      const record = selected?.view.locations.get(file);
      if (!record || getBackend()?.owner !== selected?.game.owner
        || !await matchesDisk(new Map([[record.file, record.stamp]])) || current !== selected) return undefined;
      return record.uri;
    },
    selection(uri: vscode.Uri) {
      const selected = current;
      const bound = selected?.bindings.get(uri.toString());
      if (!selected || !bound) return undefined;
      return async (token: vscode.CancellationToken): Promise<string> => {
        const backend = getBackend();
        const watches = new Map([...selected.game.packedProfile!.watches, ...selected.dlc.packedProfile!.watches, ...bound.watch]);
        try {
          if (!token.isCancellationRequested && backend?.owner === selected.game.owner
            && await matchesGameRoot(backend, selected.game.root) && await matchesDisk(watches)) {
            const bytes = await readBytes(bound.source);
            if (sourceHash(bytes) === bound.source.hash && await matchesDisk(watches)
              && await matchesGameRoot(backend, selected.game.root)
              && !token.isCancellationRequested && current === selected && getBackend()?.owner === selected.game.owner) {
              return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            }
          }
        } catch { /* Expire the stale selection and refresh its owning inventories. */ }
        if (current === selected) { checked = undefined; current = undefined; expireRaw(); }
        throw new Error('This packed reference changed. Search for the symbol again.');
      };
    },
  };
}
