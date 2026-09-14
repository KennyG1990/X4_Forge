import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ModWorkspace } from '../types';
import {
  readPreviewScenarios, savePreviewScenario, removePreviewScenario,
  previewScenarioStorageKey, type X4UiPreviewScenario,
  capturePreviewScenario, projectPreviewScenario,
  transferPreviewScenario, mapPreviewSourceRange, migratePreviewScenarios,
} from './x4UiPreviewScenarios';
import { reverseWorkspaceSourceSplice, type WorkspaceSourceSplice } from './workspaceUndoHistory';
import { createX4UiEditorSessionOwner, updateX4UiEditorPathState, updateX4UiEditorLoopState,
  applyX4UiEditorSampleDraft, type X4UiEditorSessionInput, type X4UiEditorSessionProjection } from './x4UiEditorSession';
import { createX4UiLayoutTargetCatalog } from './x4UiLayoutProgram';
import { createPreviewSourceMapper } from './x4UiPreviewSourceMapping';

const data = new Map<string, string>([['unrelated-workspace-cache', 'preserve']]);
let failRead = false;
let failWrite = false;
const storage = {
  getItem(key: string): string | null { if (failRead) throw new Error('security'); return data.get(key) ?? null; },
  setItem(key: string, value: string): void { if (failWrite) throw new Error('quota'); data.set(key, value); },
};
const scenario: X4UiPreviewScenario = {
  id: 'a', name: 'Short text', sourceKey: 'source-sha-and-path', targetId: 'target-1',
  view: { width: 1920, height: 1080, uiScale: 1, scaleMode: 'derived-from-x4-user-scale', userScale: 1 },
  paths: [], loops: [], samples: [{ key: 'exact-source-consumer-1', value: 'first' }, { key: 'exact-source-consumer-2', value: 'second' }],
};
assert.equal(readPreviewScenarios(storage, '').ok, false, 'unbound scope must not use default');
assert.equal(savePreviewScenario(storage, 'workspace-A', scenario).ok, true);
assert.equal(savePreviewScenario(storage, 'workspace-A', { ...scenario, id: 'duplicate', name: ' short TEXT ' }).ok, false);
assert.equal(savePreviewScenario(storage, 'workspace-B', scenario).ok, true, 'immutable workspace isolation');
assert.equal(savePreviewScenario(storage, 'workspace-A', { ...scenario, id: 'b', name: 'Long text' }).ok, true);
const read = readPreviewScenarios(storage, 'workspace-A');
assert.equal(read.ok, true);
if (read.ok) {
  assert.equal(read.scenarios.length, 2);
  assert.deepEqual(read.scenarios[0]?.samples, scenario.samples, 'distinct consumers retained');
}
const beforeFailure = new Map(data);
failWrite = true;
assert.equal(savePreviewScenario(storage, 'workspace-A', { ...scenario, id: 'c', name: 'Quota' }).ok, false);
assert.equal(removePreviewScenario(storage, 'workspace-A', 'a').ok, false);
assert.deepEqual(data, beforeFailure, 'quota must preserve ALL keys');
failWrite = false;
failRead = true;
assert.equal(readPreviewScenarios(storage, 'workspace-A').ok, false);
assert.equal(savePreviewScenario(storage, 'workspace-A', scenario).ok, false);
assert.deepEqual(data, beforeFailure);
failRead = false;
assert.equal(removePreviewScenario(storage, 'workspace-A', 'a').ok, true);
assert.equal(readPreviewScenarios(storage, 'workspace-B').ok, true);
data.set(previewScenarioStorageKey('corrupt'), '{not-json');
assert.equal(readPreviewScenarios(storage, 'corrupt').ok, false);
assert.equal(savePreviewScenario(storage, 'corrupt', scenario).ok, false, 'do not overwrite corrupt data');
assert.equal(data.get(previewScenarioStorageKey('corrupt')), '{not-json');
assert.equal(savePreviewScenario(storage, 'workspace-A', { ...scenario, id: 'big', name: 'Huge', samples: [{ key: 'one', value: 'x'.repeat(250_000) }] }).ok, false);
for (let i = 0; i < 20; i++) assert.equal(savePreviewScenario(storage, 'bounded', { ...scenario, id: String(i), name: `Case ${i}` }).ok, true);
assert.equal(savePreviewScenario(storage, 'bounded', { ...scenario, id: '21', name: 'Overflow' }).ok, false);
assert.equal(data.get('unrelated-workspace-cache'), 'preserve');
console.log('Preview scenario storage: PASS (scope, duplicates, exact input identity, quota, read failure, corruption, bounds, deletion)');

// Actual public Session owners, not invented catalogs or serialized opaque authority.
// Corpus is intentionally unavailable here: this is binding/replay proof, not paint proof.
const lua = [
  'local menu = { name = "SavedScenarioBindings", layer = 1 }',
  'function menu.display(tab, dynamicText)',
  ' local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  ' local table = frame:addTable(1, { width = 100 })',
  ' for i = 1, 3 do',
  '  local row = table:addRow(false, {})',
  '  if tab == "first" then',
  '   row[1]:createText(dynamicText, { height = 10 })',
  '  else',
  '   row[1]:createText("other", { height = 10 })',
  '  end',
  ' end',
  ' frame:display()',
  'end',
].join('\n');
const workspace: ModWorkspace = {
  id: 'scenario-test', name: 'Scenario test', version: '1.0.0', author: 'Forge', description: 'Isolated scenario binding fixture',
  nodes: [], links: [], uiWidgets: [],
  uiTheme: { backgroundColor: '#000000', borderColor: '#111111', accentColor: '#00ffff', opacity: 1, showIcons: true },
  passthroughFiles: [
  { path: 'ui.xml', content: '<addon name="scenario"><environment type="menus"><file name="ui/scenario.lua" /></environment></addon>' },
  { path: 'ui/scenario.lua', content: lua, reason: 'unparsed' },
] };
const workspaceBefore = JSON.stringify(workspace);
// Finite dispatch selection must follow source edits, not source-offset ID strings.
// These are producer-issued catalogs and real scenario replay, never invented authority.
const dispatchLua = [
  'local menu = { name = "DispatchScenario" }',
  'local function first(frame)',
  ' local row = frame:addTable(1, {width=200}):addRow(false, {})',
  ' row[1]:createText("FIRST BODY", {height=20})',
  'end',
  'local function second(frame)',
  ' local row = frame:addTable(1, {width=200}):addRow(false, {})',
  ' row[1]:createText("SECOND BODY", {height=20})',
  'end',
  'local builders = { ONE = first, TWO = second }',
  'function menu.display()',
  ' local frame = Helper.createFrameHandle(menu, {width=400, height=300})',
  ' local row = frame:addTable(1, {width=200}):addRow(false, {})',
  ' row[1]:createText("HEADING", {height=20})',
  ' local builder = builders[selected] or first',
  ' pcall(builder, frame)',
  ' frame:display()',
  'end',
].join('\n');
const dispatchWorkspace = (text: string): ModWorkspace => ({ ...workspace, passthroughFiles:
  workspace.passthroughFiles!.map(file => file.path === 'ui/scenario.lua' ? { ...file, content: text } : file) });
const dispatchOriginal = dispatchWorkspace(dispatchLua);
const dispatchOwner = createX4UiEditorSessionOwner(dispatchOriginal);
const dispatchSeed = dispatchOwner.project({ workspace: dispatchOriginal, corpus: undefined });
const dispatchFile = dispatchSeed.source.bundle.sourceFiles.find(file => file.path === 'ui/scenario.lua')!;
const dispatchTargets = createX4UiLayoutTargetCatalog(dispatchFile.callModel);
const dispatchTarget = dispatchTargets.targets.find(item => item.name === 'menu.display')!;
const dispatchInput: X4UiEditorSessionInput = { workspace: dispatchOriginal, corpus: undefined,
  profile: { width: 1920, height: 1080, uiScale: 1 }, selection: { sourceIndex: dispatchFile.index,
    path: dispatchFile.path, sourceIdentity: dispatchTargets.sourceIdentity, target: dispatchTarget } };
const dispatchBase = dispatchOwner.project(dispatchInput);
const dispatchChoice = dispatchBase.pathCatalog?.entries.find(entry => entry.arm === 'dispatch' && entry.label === 'ONE');
assert.ok(dispatchChoice, 'generic finite dispatch must be catalogued');
const dispatchUpdate = updateX4UiEditorPathState(undefined, dispatchBase.pathCatalog, dispatchChoice.id, dispatchBase.pathCatalogAuthority);
assert.equal(dispatchUpdate.status, 'accepted');
const dispatchSelected = dispatchOwner.project({ ...dispatchInput, paths: dispatchUpdate.paths,
  pathBinding: dispatchBase.pathBinding, pathCatalogAuthority: dispatchBase.pathCatalogAuthority });
const dispatchSaved = capturePreviewScenario(dispatchSelected, scenario.view, 'dispatch-one', 'First body');
assert.equal(dispatchSaved.ok, true);
if (!dispatchSaved.ok) throw new Error('dispatch scenario capture unexpectedly refused');
for (const [expectedText, replacement] of [
  ['"HEADING"', '"MUCH LONGER HEADING"'],
  ['"HEADING"', '"H"'],
  ['"DispatchScenario"', '"Renamed Dispatch Scenario"'],
] as const) {
  const startOffset = dispatchLua.indexOf(expectedText);
  const splice: WorkspaceSourceSplice = { path: dispatchFile.path, startOffset,
    endOffset: startOffset + expectedText.length, expectedText, replacement };
  const nextText = dispatchLua.slice(0, startOffset) + replacement + dispatchLua.slice(splice.endOffset);
  const nextWorkspace = dispatchWorkspace(nextText);
  const nextOwner = createX4UiEditorSessionOwner(nextWorkspace);
  const transferred = transferPreviewScenario(nextOwner, { ...dispatchInput, workspace: nextWorkspace },
    dispatchSaved.scenario, dispatchSelected, splice);
  assert.equal(transferred.ok, true, `finite dispatch must follow ${replacement}: ${transferred.ok === false ? transferred.message : ''}`);
  if (!transferred.ok) throw new Error('dispatch transfer unexpectedly refused');
  assert.equal(transferred.projection.paths?.selections.length, 1);
  const freshChoice = transferred.projection.pathCatalog?.entries.find(entry => entry.id === transferred.projection.paths?.selections[0]?.id);
  assert.equal(freshChoice?.label, 'ONE');
  assert.notDeepEqual(freshChoice?.invocationIds, dispatchChoice.invocationIds, 'shifted IDs must be freshly issued');
  const nextFile = transferred.projection.source.bundle.sourceFiles.find(file => file.path === dispatchFile.path)!;
  const models = { before: dispatchFile.callModel, after: nextFile.callModel };
  const mapper = createPreviewSourceMapper(dispatchLua, nextText, splice, models);
  assert.ok(mapper);
  assert.equal(mapper.matches('path', dispatchChoice, freshChoice), true);
  assert.equal(mapper.matches('path', { ...dispatchChoice, invocationIds: ['unknown-id'] }, freshChoice), false);
  assert.equal(mapper.matches('path', { ...dispatchChoice, invocationIds: [...dispatchChoice.invocationIds, ...dispatchChoice.invocationIds] }, freshChoice), false);
  const selectedInvocation = models.before.localInvocations.find(item => item.id === dispatchChoice.invocationIds[0])!;
  const ambiguous = createPreviewSourceMapper(dispatchLua, nextText, splice, { ...models,
    before: { ...models.before, localInvocations: [...models.before.localInvocations, selectedInvocation] } });
  assert.equal(ambiguous?.matches('path', dispatchChoice, freshChoice), false, 'ambiguous source ledger refuses');
  assert.equal(createPreviewSourceMapper(dispatchLua, nextText, splice, { ...models, before: models.after }), undefined, 'stale source model refuses');
  const inverse = transferPreviewScenario(dispatchOwner, dispatchInput, transferred.scenario,
    transferred.projection, reverseWorkspaceSourceSplice(splice));
  assert.equal(inverse.ok, true, 'inverse source edit retains the selected body');
  if (!inverse.ok) throw new Error('dispatch inverse unexpectedly refused');
  assert.deepEqual(inverse.scenario.paths, dispatchSaved.scenario.paths);
  const redo = transferPreviewScenario(nextOwner, { ...dispatchInput, workspace: nextWorkspace }, inverse.scenario, inverse.projection, splice);
  assert.equal(redo.ok, true, 'redo retains the selected body');
  assert.equal(transferPreviewScenario(nextOwner, { ...dispatchInput, workspace: nextWorkspace }, dispatchSaved.scenario,
    dispatchSelected, { ...splice, expectedText: 'stale source' }).ok, false);
}
for (const [expectedText, replacement] of [
  ['ONE = first', 'ONE = second'],
  ['pcall(builder, frame)', 'pcall(second, frame)'],
  ['pcall(builder, frame)', '-- call removed'],
] as const) {
  const startOffset = dispatchLua.indexOf(expectedText);
  const splice: WorkspaceSourceSplice = { path: dispatchFile.path, startOffset,
    endOffset: startOffset + expectedText.length, expectedText, replacement };
  const nextWorkspace = dispatchWorkspace(dispatchLua.slice(0, startOffset) + replacement + dispatchLua.slice(splice.endOffset));
  const nextOwner = createX4UiEditorSessionOwner(nextWorkspace);
  assert.equal(transferPreviewScenario(nextOwner, { ...dispatchInput, workspace: nextWorkspace }, dispatchSaved.scenario,
    dispatchSelected, splice).ok, false, `changed dispatch authority must refuse: ${replacement}`);
}
assert.deepEqual(dispatchOriginal, dispatchWorkspace(dispatchLua), 'scenario transfer must never mutate source');
console.log('Preview finite dispatch continuation: PASS (longer/shorter/pre-declaration, inverse/redo, changed candidate/call/stale refusal)');
const owner = createX4UiEditorSessionOwner(workspace);
const seed = owner.project({ workspace, corpus: undefined });
const sourceFile = seed.source.bundle.sourceFiles.find(file => file.path === 'ui/scenario.lua');
assert.ok(sourceFile);
const targets = createX4UiLayoutTargetCatalog(sourceFile.callModel);
const target = targets.targets.find(item => item.name === 'menu.display');
assert.ok(target);
const base: X4UiEditorSessionInput = { workspace, corpus: undefined, profile: { width: 1920, height: 1080, uiScale: 1 },
  selection: { sourceIndex: sourceFile.index, path: sourceFile.path, sourceIdentity: targets.sourceIdentity, target } };
let projection = owner.project(base);
const pathEntry = projection.pathCatalog?.entries.find(entry => entry.arm === 'then');
assert.ok(pathEntry);
const pathUpdate = updateX4UiEditorPathState(undefined, projection.pathCatalog, pathEntry.id, projection.pathCatalogAuthority);
assert.equal(pathUpdate.status, 'accepted');
const pathInput = { ...base, paths: pathUpdate.paths, pathBinding: projection.pathBinding, pathCatalogAuthority: projection.pathCatalogAuthority };
projection = owner.project(pathInput);
const loopEntry = projection.loopCatalog?.entries[0];
assert.ok(loopEntry);
const loopUpdate = updateX4UiEditorLoopState(undefined, projection.loopCatalog, loopEntry.id, '3', projection.loopCatalogAuthority);
assert.equal(loopUpdate.status, 'accepted');
const loopInput = { ...pathInput, loops: loopUpdate.loops, loopBinding: projection.loopBinding, loopCatalogAuthority: projection.loopCatalogAuthority };
projection = owner.project(loopInput);
assert.equal(projection.sampleCatalog?.entries.length, 3);
const draft = Object.fromEntries(projection.sampleCatalog!.entries.map((entry, index) => [entry.id, `Iteration ${index + 1}`]));
const sampleUpdate = applyX4UiEditorSampleDraft(undefined, projection.sampleCatalog, draft, projection.sampleCatalogAuthority);
assert.equal(sampleUpdate.status, 'accepted');
projection = owner.project({ ...loopInput, samples: sampleUpdate.samples, sampleBinding: projection.sampleBinding, sampleCatalogAuthority: projection.sampleCatalogAuthority });
const captured = capturePreviewScenario(projection, scenario.view, 'loop-path', 'Three loop rows');
assert.equal(captured.ok, true);
if (captured.ok) {
  const serialized = JSON.stringify(captured.scenario);
  const reloaded = JSON.parse(serialized) as X4UiPreviewScenario;
  const freshOwner = createX4UiEditorSessionOwner(workspace);
  const applied = projectPreviewScenario(freshOwner, { ...base, profile: { width: 1280, height: 720, uiScale: 0.75 } }, reloaded);
  assert.equal(applied.ok, true, 'fresh paths then loops then per-iteration samples must reissue');
  if (applied.ok) {
    assert.equal(applied.projection.profile.drawable.width, 1920);
    assert.deepEqual(applied.projection.samples?.values, projection.samples?.values);
    assert.deepEqual(applied.projection.paths, projection.paths);
    assert.deepEqual(applied.projection.loops, projection.loops);
    assert.equal(applied.projection.gameVerified, false);
    assert.notEqual(applied.projection.sampleCatalogAuthority, projection.sampleCatalogAuthority);
  }
  assert.equal(projectPreviewScenario(freshOwner, base, { ...reloaded, sourceKey: 'foreign-source' }).ok, false);
  assert.equal(projectPreviewScenario(freshOwner, base, { ...reloaded, targetId: 'foreign-menu' }).ok, false);
  const changedWorkspace: ModWorkspace = { ...workspace, passthroughFiles: workspace.passthroughFiles!.map(file =>
    file.path === 'ui/scenario.lua' ? { ...file, content: file.content.replace('"other"', '"changed"') } : file) };
  const changedOwner = createX4UiEditorSessionOwner(changedWorkspace);
  const changedFile = changedOwner.project({ workspace: changedWorkspace, corpus: undefined }).source.bundle.sourceFiles.find(file => file.path === sourceFile.path)!;
  const changedTargets = createX4UiLayoutTargetCatalog(changedFile.callModel);
  const changedTarget = changedTargets.targets.find(item => item.name === 'menu.display')!;
  assert.notEqual(changedTargets.sourceIdentity.sha256, targets.sourceIdentity.sha256);
  assert.equal(projectPreviewScenario(changedOwner, { ...base, workspace: changedWorkspace,
    selection: { sourceIndex: changedFile.index, path: changedFile.path, sourceIdentity: changedTargets.sourceIdentity, target: changedTarget } }, reloaded).ok, false,
  'saved source revision must not apply to a freshly issued changed-source catalog');
  const start = lua.indexOf('"other"');
  const splice: WorkspaceSourceSplice = { path: sourceFile.path, startOffset: start, endOffset: start + '"other"'.length,
    expectedText: '"other"', replacement: '"changed"' };
  const transferred = transferPreviewScenario(changedOwner, { ...base, workspace: changedWorkspace }, reloaded, projection, splice);
  assert.equal(transferred.ok, true, 'exact source edit must reissue branch, loop and samples');
  if (transferred.ok) {
    assert.notEqual(transferred.scenario.sourceKey, reloaded.sourceKey);
    assert.deepEqual(transferred.projection.samples?.values.map(item => item.value), ['Iteration 1', 'Iteration 2', 'Iteration 3']);
    const switched = applyX4UiEditorSampleDraft(undefined, transferred.projection.sampleCatalog,
      Object.fromEntries(transferred.projection.sampleCatalog!.entries.map((entry, index) => [entry.id, `Scenario B ${index}`])),
      transferred.projection.sampleCatalogAuthority);
    assert.equal(switched.status, 'accepted');
    const nextSelection = { sourceIndex: changedFile.index, path: changedFile.path, sourceIdentity: changedTargets.sourceIdentity, target: changedTarget };
    const chosenB = changedOwner.project({ ...base, workspace: changedWorkspace, selection: nextSelection,
      paths: transferred.projection.paths, pathBinding: transferred.projection.pathBinding, pathCatalogAuthority: transferred.projection.pathCatalogAuthority,
      loops: transferred.projection.loops, loopBinding: transferred.projection.loopBinding, loopCatalogAuthority: transferred.projection.loopCatalogAuthority,
      samples: switched.samples, sampleBinding: transferred.projection.sampleBinding, sampleCatalogAuthority: transferred.projection.sampleCatalogAuthority });
    const scenarioB = capturePreviewScenario(chosenB, reloaded.view, 'B', 'Chosen after edit A');
    assert.ok(scenarioB.ok);
    if (scenarioB.ok) {
      const undoneB = transferPreviewScenario(owner, base, scenarioB.scenario, chosenB, reverseWorkspaceSourceSplice(splice));
      assert.ok(undoneB.ok, 'Undo must retain B, not the values present when A was edited');
      if (undoneB.ok) {
        assert.deepEqual(undoneB.projection.samples?.values.map(item => item.value), ['Scenario B 0', 'Scenario B 1', 'Scenario B 2']);
        const redoneB = transferPreviewScenario(changedOwner, { ...base, workspace: changedWorkspace }, undoneB.scenario, undoneB.projection, splice);
        assert.ok(redoneB.ok);
        if (redoneB.ok) assert.deepEqual(redoneB.scenario, scenarioB.scenario);
      }
    }
    assert.equal(savePreviewScenario(storage, 'migration', reloaded).ok, true);
    const migrated = migratePreviewScenarios(storage, 'migration', changedOwner, { ...base, workspace: changedWorkspace }, projection, splice);
    assert.ok(migrated.ok);
    if (migrated.ok) assert.deepEqual(migrated.scenarios[0], transferred.scenario);
    const migrationBytes = data.get(previewScenarioStorageKey('migration'));
    failWrite = true;
    assert.equal(migratePreviewScenarios(storage, 'migration', owner, base, transferred.projection, reverseWorkspaceSourceSplice(splice)).ok, false);
    failWrite = false;
    assert.equal(data.get(previewScenarioStorageKey('migration')), migrationBytes, 'migration quota preserves old record bytes');
  }
  assert.equal(transferPreviewScenario(changedOwner, { ...base, workspace: changedWorkspace }, reloaded, projection, { ...splice, expectedText: 'false proof' }).ok, false);
  assert.equal(transferPreviewScenario(changedOwner, { ...base, workspace: changedWorkspace }, reloaded, projection, { ...splice, startOffset: start + 1 }).ok, false);
  for (const [needle, replacement, accepted] of [
    ['dynamicText, { height', 'differentInput, { height', false],
    ['row[1]:createText(dynamicText', 'row[1]:setText(dynamicText', false],
    [' frame:display()', '-- retained inputs\n frame:display()', true],
  ] as const) {
    const offset = lua.indexOf(needle); assert.ok(offset >= 0);
    const edit: WorkspaceSourceSplice = { path: sourceFile.path, startOffset: offset,
      endOffset: offset + needle.length, expectedText: needle, replacement };
    const edited = { ...workspace, passthroughFiles: workspace.passthroughFiles.map(file => file.path === sourceFile.path
      ? { ...file, content: lua.slice(0, offset) + replacement + lua.slice(offset + needle.length) } : file) };
    assert.equal(transferPreviewScenario(createX4UiEditorSessionOwner(edited), { ...base, workspace: edited }, reloaded, projection, edit).ok,
      accepted, `source change ${needle}: changed root or consumer must refuse, independent retained source must pass`);
  }
  const insertion: WorkspaceSourceSplice = { path: sourceFile.path, startOffset: lua.indexOf(' frame:display()'),
    endOffset: lua.indexOf(' frame:display()'), expectedText: '', replacement: '-- zero-length insertion\n' };
  const inserted = { ...workspace, passthroughFiles: workspace.passthroughFiles.map(file => file.path === sourceFile.path
    ? { ...file, content: lua.slice(0, insertion.startOffset) + insertion.replacement + lua.slice(insertion.endOffset) } : file) };
  assert.equal(transferPreviewScenario(createX4UiEditorSessionOwner(inserted), { ...base, workspace: inserted }, reloaded, projection, insertion).ok, true);
  assert.equal(transferPreviewScenario(changedOwner, { ...base, workspace: changedWorkspace }, reloaded, projection,
    { ...splice, retainedSpans: [{ beforeStart: start, beforeEnd: start + 1, afterStart: start + 2 }] }).ok, false, 'invented retained bytes refuse');
  assert.equal(projectPreviewScenario(freshOwner, base, { ...reloaded, samples: [{ key: 'invented consumer', value: 'wrong' }] }).ok, false);
  assert.equal(projectPreviewScenario(freshOwner, base, { ...reloaded, loops: [{ ...reloaded.loops[0]!, count: 129 }] }).ok, false);
  const conflictingArms = owner.project(base).pathCatalog!.entries.map(entry => JSON.stringify(entry));
  assert.equal(projectPreviewScenario(freshOwner, base, { ...reloaded, paths: conflictingArms }).ok, false,
    'mutually exclusive saved arms cannot silently apply only the last arm');
  for (const field of ['samples', 'loops', 'paths'] as const) {
    assert.ok(reloaded[field].length > 0);
    assert.equal(projectPreviewScenario(freshOwner, base, { ...reloaded, [field]: [...reloaded[field], reloaded[field][0]] }).ok, false,
      `duplicate ${field} cannot disappear during exact replay verification`);
  }
  assert.equal(JSON.stringify(reloaded), serialized, 'replay must not mutate saved data');
}
assert.equal(JSON.stringify(workspace), workspaceBefore, 'source and metadata unchanged');
console.log('Preview scenario public replay: PASS (fresh path/loop/sample authority, exact iteration identity, profile restore, foreign source/menu/consumer and excessive-loop refusal; no paint claim)');
const rangeSplice: WorkspaceSourceSplice = { path: 'x', startOffset: 10, endOffset: 20, expectedText: '0123456789', replacement: 'new' };
assert.deepEqual(mapPreviewSourceRange(0, 10, rangeSplice), [0, 10]);
assert.deepEqual(mapPreviewSourceRange(20, 25, rangeSplice), [13, 18]);
assert.deepEqual(mapPreviewSourceRange(0, 30, rangeSplice), [0, 23]);
assert.equal(mapPreviewSourceRange(10, 20, rangeSplice), undefined, 'a replaced input is never retained');
assert.equal(mapPreviewSourceRange(15, 25, rangeSplice), undefined, 'partially overlapped inputs fail closed');
const permutation: WorkspaceSourceSplice = { ...rangeSplice, replacement: '5678901234', retainedSpans: [
  { beforeStart: 10, beforeEnd: 15, afterStart: 15 }, { beforeStart: 15, beforeEnd: 20, afterStart: 10 },
] };
assert.deepEqual(mapPreviewSourceRange(11, 14, permutation), [16, 19]);
assert.deepEqual(mapPreviewSourceRange(16, 19, reverseWorkspaceSourceSplice(permutation)), [11, 14]);
console.log('Preview scenario source continuation: PASS (exact splice, inverse B-after-A/UndoRedo, independent loop samples, local migration quota, retained permutation spans and negative overlaps)');

// Reordering sampled rows changes catalog order, not which source consumer owns each value.
const firstBlock = ' local first = t:addRow(false, {})\n first[1]:createText(dynamicText, { height = 10 })\n';
const secondBlock = ' local second = t:addRow(false, {})\n second[1]:createText(dynamicText, { height = 10 })\n';
const rowLua = 'local menu = { name = "SampledRows" }\nfunction menu.display()\n'
  + ' local frame = Helper.createFrameHandle(menu, { width = 200, height = 100 })\n'
  + ' local t = frame:addTable(1, { width = 180 })\n' + firstBlock + secondBlock + ' frame:display()\nend';
const rowsWorkspace = { ...workspace, passthroughFiles: workspace.passthroughFiles.map(file => file.path === sourceFile.path ? { ...file, content: rowLua } : file) };
const rowsOwner = createX4UiEditorSessionOwner(rowsWorkspace);
const rowCandidate = rowsOwner.candidateCatalog.sourceCandidates.find(item => item.path === sourceFile.path)!;
const rowTarget = rowCandidate.targets.find(item => item.name === 'menu.display')!;
assert.ok(rowCandidate.sourceIdentity && rowTarget);
const rowsInput: X4UiEditorSessionInput = { workspace: rowsWorkspace, corpus: undefined, profile: base.profile,
  selection: { sourceIndex: rowCandidate.index, path: rowCandidate.path, sourceIdentity: rowCandidate.sourceIdentity, target: rowTarget } };
const rowsSeed = rowsOwner.project(rowsInput);
assert.equal(rowsSeed.sampleCatalog!.entries.length, 2);
const rowsSamples = applyX4UiEditorSampleDraft(undefined, rowsSeed.sampleCatalog,
  Object.fromEntries(rowsSeed.sampleCatalog!.entries.map((entry, i) => [entry.id, ['First input', 'Second input'][i]!])), rowsSeed.sampleCatalogAuthority);
assert.equal(rowsSamples.status, 'accepted');
if (rowsSamples.status !== 'accepted') throw new Error('sampled rows fixture refused');
const rowsProjection = rowsOwner.project({ ...rowsInput, samples: rowsSamples.samples, sampleBinding: rowsSeed.sampleBinding, sampleCatalogAuthority: rowsSeed.sampleCatalogAuthority });
const rowsSaved = capturePreviewScenario(rowsProjection, { width: 1920, height: 1080, uiScale: 1, scaleMode: 'custom-effective-helper-scale', userScale: 1 }, 'rows', 'Rows');
assert.ok(rowsSaved.ok);
const startRow = rowLua.indexOf(firstBlock);
const rowSplice: WorkspaceSourceSplice = { path: sourceFile.path, startOffset: startRow, endOffset: startRow + firstBlock.length + secondBlock.length,
  expectedText: firstBlock + secondBlock, replacement: secondBlock + firstBlock,
  retainedSpans: [
    { beforeStart: startRow, beforeEnd: startRow + firstBlock.length, afterStart: startRow + secondBlock.length },
    { beforeStart: startRow + firstBlock.length, beforeEnd: startRow + firstBlock.length + secondBlock.length, afterStart: startRow },
  ] };
const reorderedWorkspace = { ...rowsWorkspace, passthroughFiles: rowsWorkspace.passthroughFiles.map(file => file.path === sourceFile.path
  ? { ...file, content: rowLua.replace(firstBlock + secondBlock, secondBlock + firstBlock) } : file) };
const reorderedOwner = createX4UiEditorSessionOwner(reorderedWorkspace);
const reorderedCandidate = reorderedOwner.candidateCatalog.sourceCandidates.find(item => item.path === sourceFile.path)!;
const reorderedTarget = reorderedCandidate.targets.find(item => item.name === 'menu.display')!;
assert.ok(reorderedCandidate.sourceIdentity && reorderedTarget);
const reorderedInput: X4UiEditorSessionInput = { ...rowsInput, workspace: reorderedWorkspace,
  selection: { sourceIndex: reorderedCandidate.index, path: reorderedCandidate.path, sourceIdentity: reorderedCandidate.sourceIdentity, target: reorderedTarget } };
const reordered = transferPreviewScenario(reorderedOwner, { ...rowsInput, workspace: reorderedWorkspace }, rowsSaved.scenario, rowsProjection, rowSplice);
assert.ok(reordered.ok, `sampled-row permutation retains both source-bound values: ${JSON.stringify(reordered.ok ? null : reordered)}`);
if (reordered.ok) {
  assert.deepEqual(reordered.projection.samples?.values.map(item => item.value), ['Second input', 'First input']);
  const capturedReorder = capturePreviewScenario(reordered.projection, rowsSaved.scenario.view, 'rows', 'Rows');
  assert.ok(capturedReorder.ok);
  if (capturedReorder.ok) assert.deepEqual(reordered.scenario, capturedReorder.scenario, 'saved migrated data uses actual fresh catalog order');
  const replayed = projectPreviewScenario(reorderedOwner, reorderedInput, reordered.scenario);
  assert.ok(replayed.ok, 'canonical migrated scenario remains selectable on the same source');
  const restored = transferPreviewScenario(rowsOwner, rowsInput, reordered.scenario, reordered.projection, reverseWorkspaceSourceSplice(rowSplice));
  assert.ok(restored.ok);
  if (restored.ok) assert.deepEqual(restored.scenario, rowsSaved.scenario, 'inverse permutation restores exact original scenario');
  for (const field of ['samples'] as const) {
    assert.equal(projectPreviewScenario(reorderedOwner, reorderedInput,
      { ...reordered.scenario, [field]: [...reordered.scenario[field], reordered.scenario[field][0]!] }).ok, false);
  }
}
console.log('Preview sampled-row permutation: PASS (distinct equal-expression consumers, canonical saved order, same-source selection and exact inverse)');

// Observe real owner calls, not a substituted renderer or invented catalog. Keep
// semantic assertions before the count assertion so the old implementation is a
// positive output control and fails only the redundant-work regression.
const stageCounts: { name: string; actual: number; expected: number }[] = [];
const stageSemantics: unknown[] = [];
const checkReplayStages = (
  name: string, input: X4UiEditorSessionInput, savedProjection: X4UiEditorSessionProjection, expected: number,
): void => {
  const saved = capturePreviewScenario(savedProjection, scenario.view, `stages-${name}`, name);
  assert.ok(saved.ok, `${name}: the real owner must provide a capturable positive fixture`);
  const savedBytes = JSON.stringify(saved.scenario);
  const sourceBytes = JSON.stringify(input.workspace);
  const actualOwner = createX4UiEditorSessionOwner(input.workspace);
  let calls = 0;
  const observedOwner = { candidateCatalog: actualOwner.candidateCatalog,
    project: (value: X4UiEditorSessionInput) => { calls += 1; return actualOwner.project(value); } };
  const replayed = projectPreviewScenario(observedOwner, input, saved.scenario);
  assert.ok(replayed.ok, `${name}: replay must succeed`);
  assert.deepEqual(replayed.scenario, saved.scenario, `${name}: complete keyed scenario readback`);
  assert.deepEqual(replayed.projection.preview.program, savedProjection.preview.program,
    `${name}: complete program and evidence remain identical`);
  assert.notEqual(replayed.projection.sampleCatalogAuthority, savedProjection.sampleCatalogAuthority,
    `${name}: replay still issues fresh authority`);
  assert.equal(replayed.projection.gameVerified, false);
  assert.equal(JSON.stringify(input.workspace), sourceBytes, `${name}: source/metadata untouched`);
  assert.equal(JSON.stringify(saved.scenario), savedBytes, `${name}: saved scenario untouched`);
  stageCounts.push({ name, actual: calls, expected });
  stageSemantics.push({ name, scenario: replayed.scenario, program: replayed.projection.preview.program,
    pathReconciliation: replayed.projection.pathReconciliation,
    loopReconciliation: replayed.projection.loopReconciliation,
    sampleReconciliation: replayed.projection.sampleReconciliation });
  for (const forged of [
    { ...saved.scenario, paths: ['unissued path'] },
    { ...saved.scenario, loops: [{ key: 'unissued loop', count: 1 }] },
    { ...saved.scenario, samples: [{ key: 'unissued sample', value: 'wrong' }] },
  ]) assert.equal(projectPreviewScenario(observedOwner, input, forged).ok, false,
    `${name}: an unknown saved dependency must still refuse`);
};
// A previous populated sample state must be cleared when selecting an empty scenario.
checkReplayStages('empty', { ...rowsInput, samples: rowsProjection.samples,
  sampleBinding: rowsProjection.sampleBinding, sampleCatalogAuthority: rowsProjection.sampleCatalogAuthority }, rowsSeed, 2);
checkReplayStages('samples only', rowsInput, rowsProjection, 2);
checkReplayStages('paths only', base, owner.project(pathInput), 3);
const noPathProjection = owner.project(base);
const noPathLoop = noPathProjection.loopCatalog?.entries[0];
assert.ok(noPathLoop);
const noPathLoopUpdate = updateX4UiEditorLoopState(undefined, noPathProjection.loopCatalog,
  noPathLoop.id, '3', noPathProjection.loopCatalogAuthority);
assert.equal(noPathLoopUpdate.status, 'accepted');
checkReplayStages('loops only', base, owner.project({ ...base, loops: noPathLoopUpdate.loops,
  loopBinding: noPathProjection.loopBinding, loopCatalogAuthority: noPathProjection.loopCatalogAuthority }), 3);
checkReplayStages('paths and loops', base, projection, 4);
console.log('SCENARIO_STAGE_SEMANTICS', createHash('sha256').update(JSON.stringify(stageSemantics)).digest('hex'));
console.log('SCENARIO_STAGE_COUNTS', JSON.stringify(stageCounts));
assert.deepEqual(stageCounts.map(item => item.actual), stageCounts.map(item => item.expected),
  'Only selected or nonempty dependency stages require another full projection');
console.log('Preview scenario stage reuse: PASS (real owners, exact evidence, dependency order, stale-state clearing and forged selection rejection)');
