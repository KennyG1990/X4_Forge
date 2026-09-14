import { createPreviewSourceMapper } from './x4UiPreviewSourceMapping';
export { mapPreviewSourceRange } from './x4UiPreviewSourceMapping';
/** Computer-local preview data only. Never source, history, or serialized authority. */
import {
  applyX4UiEditorSampleDraft, updateX4UiEditorLoopState, updateX4UiEditorPathState,
  type X4UiEditorSessionInput, type X4UiEditorSessionOwner, type X4UiEditorSessionProjection,
} from './x4UiEditorSession';
import { createX4UiLayoutTargetCatalog } from './x4UiLayoutProgram';
import type { X4UiPreviewSelection } from './x4UiPreviewPipeline';
import type { WorkspaceSourceSplice } from './workspaceUndoHistory';

export interface X4UiPreviewScenarioView {
  readonly width: number;
  readonly height: number;
  readonly uiScale: number;
  readonly scaleMode: 'derived-from-x4-user-scale' | 'custom-effective-helper-scale';
  readonly userScale: number;
}
export interface X4UiPreviewScenario {
  readonly id: string;
  readonly name: string;
  readonly sourceKey: string;
  readonly targetId: string;
  readonly view: X4UiPreviewScenarioView;
  /** Exact catalog-entry descriptors are lookup hints, never issued authority. */
  readonly paths: readonly string[];
  readonly loops: readonly { readonly key: string; readonly count: number }[];
  readonly samples: readonly { readonly key: string; readonly value: string }[];
}
type Failure = { readonly ok: false; readonly message: string };
type StoreResult = Failure | { readonly ok: true; readonly scenarios: readonly X4UiPreviewScenario[] };
export type PreviewScenarioStorage = Pick<Storage, 'getItem' | 'setItem'>;
const MAX_CHARS = 240 * 1024;
const MAX_SCENARIOS = 20;
const fail = (message: string): Failure => ({ ok: false, message });
export const previewScenarioStorageKey = (scope: string): string => `x4forge:ui-preview-scenarios:v1:${encodeURIComponent(scope)}`;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const shortString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;
const key = (value: unknown): string => JSON.stringify(value);

function validScenario(value: unknown): value is X4UiPreviewScenario {
  if (!record(value) || !shortString(value.id, 100) || !shortString(value.name, 60) || value.name.trim() !== value.name
    || !shortString(value.sourceKey, 4096) || !shortString(value.targetId, 2048) || !record(value.view)) return false;
  const view = value.view;
  if (![view.width, view.height, view.uiScale, view.userScale].every(positive)
    || !['derived-from-x4-user-scale', 'custom-effective-helper-scale'].includes(String(view.scaleMode))) return false;
  if (!Array.isArray(value.paths) || value.paths.length > 128 || !value.paths.every(item => shortString(item, 16000))
    || !unique(value.paths as string[])) return false;
  if (!Array.isArray(value.loops) || value.loops.length > 128 || !value.loops.every(item => record(item)
    && shortString(item.key, 16000) && Number.isSafeInteger(item.count) && Number(item.count) >= 0)
    || !unique(value.loops.map(item => item.key as string))) return false;
  return Array.isArray(value.samples) && value.samples.length <= 256 && value.samples.every(item => record(item)
    && shortString(item.key, 16000) && typeof item.value === 'string' && item.value.length <= 16384)
    && unique(value.samples.map(item => item.key as string));
}

export function readPreviewScenarios(storage: PreviewScenarioStorage, scope: string): StoreResult {
  if (!shortString(scope, 256)) return fail('Choose a saved workspace before saving scenarios.');
  try {
    const raw = storage.getItem(previewScenarioStorageKey(scope));
    if (raw === null) return { ok: true, scenarios: [] };
    if (raw.length > MAX_CHARS) return fail('Saved scenarios exceed the local limit. Existing data was left untouched.');
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || value.scope !== scope || !Array.isArray(value.scenarios)
      || value.scenarios.length > MAX_SCENARIOS || !value.scenarios.every(validScenario)
      || !unique(value.scenarios.map(item => item.id))) return fail('Saved scenarios could not be read. Existing data was left untouched.');
    return { ok: true, scenarios: value.scenarios };
  } catch {
    return fail('Local scenario storage is unavailable or unreadable. Existing scenarios were left untouched.');
  }
}

function write(storage: PreviewScenarioStorage, scope: string, scenarios: readonly X4UiPreviewScenario[]): StoreResult {
  const raw = JSON.stringify({ version: 1, scope, scenarios });
  if (raw.length > MAX_CHARS || scenarios.length > MAX_SCENARIOS) return fail('Scenario limit reached (20 per workspace). Remove a saved scenario or shorten its text.');
  try {
    // Web Storage setItem is atomic on failure. No eviction, clearing, retry, or other-key writes.
    storage.setItem(previewScenarioStorageKey(scope), raw);
    return { ok: true, scenarios };
  } catch {
    return fail('Not saved: local storage is full or unavailable. Existing scenarios and preview values are unchanged.');
  }
}

export function savePreviewScenario(storage: PreviewScenarioStorage, scope: string, scenario: X4UiPreviewScenario): StoreResult {
  const current = readPreviewScenarios(storage, scope);
  if (!current.ok) return current;
  const candidate = { ...scenario, name: scenario.name.trim() };
  if (!validScenario(candidate)) return fail('Use a name of 1–60 characters and bounded preview values.');
  if (current.scenarios.some(item => item.id === candidate.id || (item.sourceKey === candidate.sourceKey
    && item.targetId === candidate.targetId && item.name.toLowerCase() === candidate.name.toLowerCase()))) {
    return fail('That scenario name already exists for this menu. Choose a different name.');
  }
  return write(storage, scope, [...current.scenarios, candidate]);
}

export function removePreviewScenario(storage: PreviewScenarioStorage, scope: string, id: string): StoreResult {
  const current = readPreviewScenarios(storage, scope);
  if (!current.ok) return current;
  if (!current.scenarios.some(item => item.id === id)) return fail('The selected scenario is no longer saved.');
  return write(storage, scope, current.scenarios.filter(item => item.id !== id));
}

export function previewScenarioMenuKey(projection: X4UiEditorSessionProjection): string | null {
  return projection.sampleCatalog === null ? null : key(projection.sampleCatalog.sourceIdentity);
}

export function capturePreviewScenario(
  projection: X4UiEditorSessionProjection, view: X4UiPreviewScenarioView, id: string, name: string,
): Failure | { readonly ok: true; readonly scenario: X4UiPreviewScenario } {
  const sourceKey = previewScenarioMenuKey(projection);
  if (sourceKey === null || projection.sampleCatalog === null
    || [projection.sampleReconciliation, projection.pathReconciliation, projection.loopReconciliation].some(item => item.status !== 'accepted')) {
    return fail('Choose a current menu and apply valid preview values before saving.');
  }
  const paths = (projection.paths?.selections ?? []).map(value => key(projection.pathCatalog?.entries.find(entry => entry.id === value.id)));
  const loops = (projection.loops?.selections ?? []).map(value => ({
    key: key(projection.loopCatalog?.entries.find(entry => entry.id === value.id)), count: value.iterationCount,
  }));
  const samples = (projection.samples?.values ?? []).map(value => ({
    key: key(projection.sampleCatalog?.entries.find(entry => entry.id === value.id)), value: String(value.value),
  }));
  const scenario = { id, name: name.trim(), sourceKey, targetId: projection.sampleCatalog.targetId, view, paths, loops, samples };
  return validScenario(scenario) ? { ok: true, scenario } : fail('These preview values exceed the local scenario limits.');
}

/** Reissue in dependency order. Never forward persisted bindings/authority, even on the same source. */
function replayPreviewScenario(
  owner: X4UiEditorSessionOwner, current: X4UiEditorSessionInput, scenario: X4UiPreviewScenario,
  transfer?: ScenarioTransferContext,
): Failure | { readonly ok: true; readonly projection: X4UiEditorSessionProjection; readonly scenario: X4UiPreviewScenario } {
  if (!validScenario(scenario)) return fail('This saved scenario is invalid; the current preview was left unchanged.');
  const base: X4UiEditorSessionInput = {
    ...current, profile: { width: scenario.view.width, height: scenario.view.height, uiScale: scenario.view.uiScale },
    paths: undefined, pathBinding: undefined, pathCatalogAuthority: undefined,
    loops: undefined, loopInput: undefined, previewLoopInput: undefined, loopBinding: undefined,
    loopCatalogAuthority: undefined, previewLoopCatalogAuthority: undefined,
    samples: undefined, sampleBinding: undefined, sampleCatalogAuthority: undefined,
  };
  let projection = owner.project(base);
  const stale = (): Failure => fail('This scenario belongs to a different or changed menu. The current preview was left unchanged.');
  if (previewScenarioMenuKey(projection) !== (transfer?.sourceKey ?? scenario.sourceKey)
    || projection.sampleCatalog?.targetId !== (transfer?.targetId ?? scenario.targetId)) return stale();
  const matches = (kind: 'path' | 'loop' | 'sample', saved: string, entry: unknown): boolean => transfer === undefined ? key(entry) === saved : transfer.matches(kind, saved, entry);
  const migratedPaths: string[] = [];
  const migratedLoops: { key: string; count: number }[] = [];
  const migratedSamples: { key: string; value: string }[] = [];
  let paths = projection.paths;
  for (const saved of scenario.paths) {
    const entries = projection.pathCatalog?.entries.filter(entry => matches('path', saved, entry)) ?? [];
    if (entries.length !== 1) return stale();
    const update = updateX4UiEditorPathState(paths, projection.pathCatalog, entries[0]!.id, projection.pathCatalogAuthority);
    if (update.status !== 'accepted') return stale();
    paths = update.paths;
    migratedPaths.push(key(entries[0]));
  }
  const withPaths = { ...base, paths, pathBinding: projection.pathBinding, pathCatalogAuthority: projection.pathCatalogAuthority };
  // The base already issued this catalog when there are no path selections.
  if (scenario.paths.length > 0 || paths !== undefined) projection = owner.project(withPaths);
  let loops = projection.loops;
  for (const saved of scenario.loops) {
    const entries = projection.loopCatalog?.entries.filter(entry => matches('loop', saved.key, entry)) ?? [];
    if (entries.length !== 1) return stale();
    const update = updateX4UiEditorLoopState(loops, projection.loopCatalog, entries[0]!.id, String(saved.count), projection.loopCatalogAuthority);
    if (update.status !== 'accepted') return stale();
    loops = update.loops;
    migratedLoops.push({ key: key(entries[0]), count: saved.count });
  }
  const withLoops = { ...withPaths, loops, loopBinding: projection.loopBinding, loopCatalogAuthority: projection.loopCatalogAuthority };
  // Keep dependency replay for selected/default state; do not rebuild an empty stage.
  if (scenario.loops.length > 0 || loops !== undefined) projection = owner.project(withLoops);
  const draft: Record<string, string> = {};
  for (const saved of scenario.samples) {
    const entries = projection.sampleCatalog?.entries.filter(entry => matches('sample', saved.key, entry)) ?? [];
    if (entries.length !== 1) return stale();
    draft[entries[0]!.id] = saved.value;
    migratedSamples.push({ key: key(entries[0]), value: saved.value });
  }
  const update = applyX4UiEditorSampleDraft(undefined, projection.sampleCatalog, draft, projection.sampleCatalogAuthority);
  if (update.status !== 'accepted') return stale();
  projection = owner.project({ ...withLoops, samples: update.samples,
    sampleBinding: projection.sampleBinding, sampleCatalogAuthority: projection.sampleCatalogAuthority });
  if ([projection.sampleReconciliation, projection.pathReconciliation, projection.loopReconciliation].some(item => item.status !== 'accepted')) return stale();
  const desired = { ...scenario, sourceKey: previewScenarioMenuKey(projection)!, targetId: projection.sampleCatalog!.targetId,
    paths: migratedPaths, loops: migratedLoops, samples: migratedSamples };
  const readback = capturePreviewScenario(projection, scenario.view, scenario.id, scenario.name);
  // Source permutations reorder catalogs, not input identity. Compare complete
  // keyed bindings, including values and multiplicity; never discard duplicates
  // or accept only a subset. Persist the fresh owner's canonical display order.
  const sameBindings = (left: readonly unknown[], right: readonly unknown[]): boolean =>
    key(left.map(key).sort()) === key(right.map(key).sort());
  if (readback.ok === false || !sameBindings(readback.scenario.paths, desired.paths)
    || !sameBindings(readback.scenario.loops, desired.loops) || !sameBindings(readback.scenario.samples, desired.samples)) return stale();
  return { ok: true, projection, scenario: readback.scenario };
}

export function projectPreviewScenario(owner: X4UiEditorSessionOwner, current: X4UiEditorSessionInput, scenario: X4UiPreviewScenario) {
  return replayPreviewScenario(owner, current, scenario);
}

interface ScenarioTransferContext {
  readonly selection: X4UiPreviewSelection;
  readonly sourceKey: string;
  readonly targetId: string;
  readonly matches: (kind: 'path' | 'loop' | 'sample', saved: string, entry: unknown) => boolean;
}

function scenarioTransferContext(
  owner: X4UiEditorSessionOwner, current: X4UiEditorSessionInput,
  before: X4UiEditorSessionProjection, splice: WorkspaceSourceSplice,
): ScenarioTransferContext | undefined {
  const beforeCatalog = before.sampleCatalog;
  if (beforeCatalog === null || typeof splice?.path !== 'string' || typeof splice.expectedText !== 'string'
    || typeof splice.replacement !== 'string' || !Number.isSafeInteger(splice.startOffset) || !Number.isSafeInteger(splice.endOffset)) return undefined;
  const previousFile = before.source.bundle.sourceFiles.find(file => file.path === splice.path);
  if (previousFile === undefined || splice.startOffset < 0 || splice.endOffset < splice.startOffset
    || splice.endOffset > previousFile.text.length || previousFile.text.slice(splice.startOffset, splice.endOffset) !== splice.expectedText) return undefined;
  const seed = owner.project({ ...current, selection: undefined, paths: undefined, loops: undefined, loopInput: undefined,
    previewLoopInput: undefined, samples: undefined });
  const nextFile = seed.source.bundle.sourceFiles.find(file => file.path === splice.path);
  if (nextFile === undefined || nextFile.text !== previousFile.text.slice(0, splice.startOffset) + splice.replacement + previousFile.text.slice(splice.endOffset)) return undefined;
  if (before.source.bundle.sourceFiles.length !== seed.source.bundle.sourceFiles.length
    || before.source.bundle.sourceFiles.some(file => file.path !== splice.path
      && seed.source.bundle.sourceFiles.find(next => next.path === file.path)?.text !== file.text)) return undefined;
  const mapper = createPreviewSourceMapper(previousFile.text, nextFile.text, splice,
    { before: previousFile.callModel, after: nextFile.callModel });
  if (!mapper) return undefined;
  const { range } = mapper;
  const previousTargets = createX4UiLayoutTargetCatalog(previousFile.callModel);
  if (key(previousTargets.sourceIdentity) !== key(beforeCatalog.sourceIdentity)) return undefined;
  const previousTarget = previousTargets.targets.find(target => target.id === beforeCatalog.targetId);
  if (previousTarget === undefined) return undefined;
  const nextTargets = createX4UiLayoutTargetCatalog(nextFile.callModel);
  let targetMatches;
  try {
    targetMatches = nextTargets.targets.filter(target => target.kind === previousTarget.kind && target.name === previousTarget.name
      && target.handler === previousTarget.handler && key(range(target.source, false)) === key(range(previousTarget.source, true)));
  } catch { return undefined; }
  if (targetMatches.length !== 1) return undefined;
  const target = targetMatches[0]!;
  return {
    sourceKey: key(nextTargets.sourceIdentity), targetId: target.id,
    selection: { sourceIndex: nextFile.index, path: nextFile.path, sourceIdentity: nextTargets.sourceIdentity, target },
    matches: (kind, saved, entry) => {
      try { return mapper.matches(kind, JSON.parse(saved), entry); }
      catch { return false; }
    },
  };
}

export function resolvePreviewScenarioTransitionSelection(
  owner: X4UiEditorSessionOwner, current: X4UiEditorSessionInput, before: X4UiEditorSessionProjection, splice: WorkspaceSourceSplice,
): X4UiPreviewSelection | undefined {
  return scenarioTransferContext(owner, current, before, splice)?.selection;
}

export function transferPreviewScenario(
  owner: X4UiEditorSessionOwner, current: X4UiEditorSessionInput, scenario: X4UiPreviewScenario,
  before: X4UiEditorSessionProjection, splice: WorkspaceSourceSplice,
) {
  if (scenario.sourceKey !== previewScenarioMenuKey(before) || scenario.targetId !== before.sampleCatalog?.targetId) return fail('Scenario does not belong to the source being edited.');
  const transfer = scenarioTransferContext(owner, current, before, splice);
  if (transfer === undefined) return fail('Preview scenario could not follow this source change. Existing saved data was left untouched.');
  return replayPreviewScenario(owner, { ...current, selection: transfer.selection }, scenario, transfer);
}

export function migratePreviewScenarios(
  storage: PreviewScenarioStorage, scope: string, owner: X4UiEditorSessionOwner, current: X4UiEditorSessionInput,
  before: X4UiEditorSessionProjection, splice: WorkspaceSourceSplice,
): StoreResult {
  const saved = readPreviewScenarios(storage, scope);
  if (saved.ok === false) return saved;
  let changed = false;
  const scenarios = saved.scenarios.map(scenario => {
    if (scenario.sourceKey !== previewScenarioMenuKey(before) || scenario.targetId !== before.sampleCatalog?.targetId) return scenario;
    const result = transferPreviewScenario(owner, current, scenario, before, splice);
    if (result.ok === false) return scenario; // Unsupported records remain recoverable, never silently truncated.
    changed = true;
    return result.scenario;
  });
  return changed ? write(storage, scope, scenarios) : saved;
}
