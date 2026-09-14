/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import { sanitizeWorkspace } from '../types';
import { canonicalWorkspaceSnapshotString } from './workspaceIdentity';
import { buildX4UiWorkspaceSource, createX4UiWorkspaceMenu } from './x4UiWorkspaceSource';
import {
  WORKSPACE_HISTORY_LIMIT,
  appendWorkspaceHistoryEntry,
  createLegacyWorkspaceHistoryEntry,
  prepareX4UiSourceHistoryEntry,
  scheduleWorkspaceHistoryTransition,
  settleWorkspaceHistoryTransition,
  transitionWorkspaceHistory,
  previewWorkspaceHistoryContinuation,
  type PendingWorkspaceHistoryTransition,
  type WorkspaceHistoryEntry,
} from './workspaceUndoHistory';

const base = sanitizeWorkspace({
  id: 'source-history-fixture',
  name: 'Same Name',
  version: '1.0.0',
  author: 'source history selftest',
  description: 'A',
  nodes: [],
  links: [],
  uiWidgets: [],
  uiTheme: {
    backgroundColor: '#0d0d14',
    borderColor: '#df9825',
    accentColor: '#f59e0b',
    textColor: '#ffffff',
  },
  customLua: '',
  passthroughFiles: [
    { path: 'sibling.xml', content: '<sibling />', reason: 'partial' },
  ],
  compileSettings: { ui: false },
  integrationContract: null,
});

const edited = sanitizeWorkspace({ ...base, description: 'B' });
const beforeSnapshot = canonicalWorkspaceSnapshotString(base);
const afterSnapshot = canonicalWorkspaceSnapshotString(edited);
assert.notEqual(beforeSnapshot, afterSnapshot, 'the fixture edit must change the complete canonical snapshot');

const sourceAttempt = {};
const acceptedSourceAcknowledgement = {
  status: 'accepted' as const,
  attempt: sourceAttempt,
  expectedWorkspace: base,
  workspace: edited,
  currentWorkspace: edited,
  detail: 'exact parent readback',
};
const sourceReceipt = {
  scope: 'selected-scope-a',
  expectedWorkspace: base,
  workspace: edited,
  acknowledgement: acceptedSourceAcknowledgement,
};
const seenAttempts = new WeakSet<object>();
const recorded = prepareX4UiSourceHistoryEntry(sourceReceipt, 'selected-scope-a', edited, seenAttempts);
assert.equal(recorded.status, 'recorded', 'an accepted exact source readback must produce one history entry');
assert.equal(recorded.entry.kind, 'source');
assert.equal(recorded.entry.beforeSnapshot, beforeSnapshot);
assert.equal(recorded.entry.afterSnapshot, afterSnapshot);
const recordedSourceEntry = recorded.status === 'recorded'
  ? recorded.entry
  : (() => { throw new Error('source history fixture was not recorded'); })();

const duplicate = prepareX4UiSourceHistoryEntry(sourceReceipt, 'selected-scope-a', edited, seenAttempts);
assert.equal(duplicate.status, 'ignored');
assert.equal(duplicate.reason, 'duplicate', 'replayed acknowledgement must not create another entry');

const clonedCurrent = JSON.parse(JSON.stringify(edited));
const clonedCurrentResult = prepareX4UiSourceHistoryEntry(
  sourceReceipt,
  'selected-scope-a',
  clonedCurrent,
  new WeakSet<object>(),
);
assert.equal(clonedCurrentResult.status, 'ignored', 'equal bytes from a different live object must not record a source transaction');
assert.equal(clonedCurrentResult.reason, 'stale-current');

const clonedAcknowledgementResult = prepareX4UiSourceHistoryEntry(
  {
    ...sourceReceipt,
    acknowledgement: {
      ...acceptedSourceAcknowledgement,
      expectedWorkspace: JSON.parse(JSON.stringify(base)),
      workspace: JSON.parse(JSON.stringify(edited)),
      currentWorkspace: JSON.parse(JSON.stringify(edited)),
    },
  },
  'selected-scope-a',
  edited,
  new WeakSet<object>(),
);
assert.equal(clonedAcknowledgementResult.status, 'ignored', 'a cloned acknowledgement tuple must not record a source transaction');
assert.equal(clonedAcknowledgementResult.reason, 'invalid-acknowledgement');

const unboundScope = prepareX4UiSourceHistoryEntry(
  sourceReceipt,
  'unbound',
  edited,
  new WeakSet<object>(),
);
assert.equal(unboundScope.status, 'ignored', 'an unbound scope cannot own source history');
assert.equal(unboundScope.reason, 'wrong-scope');
const emptyScope = prepareX4UiSourceHistoryEntry(
  { ...sourceReceipt, scope: '' },
  '',
  edited,
  new WeakSet<object>(),
);
assert.equal(emptyScope.status, 'ignored', 'an empty scope cannot own source history');
assert.equal(emptyScope.reason, 'wrong-scope');

const sourcePast: WorkspaceHistoryEntry[] = [recorded.entry];
const sourceFuture: WorkspaceHistoryEntry[] = [];
const undone = transitionWorkspaceHistory('undo', sourcePast, sourceFuture, edited, 'selected-scope-a');
assert.equal(undone.status, 'applied', 'Undo must accept the exact acknowledged after snapshot');
assert.equal(canonicalWorkspaceSnapshotString(undone.workspace), beforeSnapshot, 'Undo must restore exact A');
assert.equal(undone.past.length, 0);
assert.equal(undone.future.length, 1);

const redone = transitionWorkspaceHistory('redo', undone.past, undone.future, undone.workspace, 'selected-scope-a');
assert.equal(redone.status, 'applied', 'Redo must accept the exact acknowledged before snapshot');
assert.equal(canonicalWorkspaceSnapshotString(redone.workspace), afterSnapshot, 'Redo must restore exact B');
assert.equal(redone.past.length, 1);
assert.equal(redone.future.length, 0);

const unrelatedEdit = sanitizeWorkspace({ ...edited, author: 'external edit' });
const staleUndo = transitionWorkspaceHistory('undo', sourcePast, sourceFuture, unrelatedEdit, 'selected-scope-a');
assert.equal(staleUndo.status, 'refused', 'an unrelated complete-snapshot edit must refuse Undo');
assert.equal(staleUndo.past, sourcePast, 'a stale refusal must preserve the past stack');
assert.equal(staleUndo.future, sourceFuture, 'a stale refusal must preserve the future stack');

const wrongScopeUndo = transitionWorkspaceHistory('undo', sourcePast, sourceFuture, edited, 'selected-scope-b');
assert.equal(wrongScopeUndo.status, 'refused', 'same mod name/id under another immutable selected scope must refuse Undo');
assert.match(wrongScopeUndo.detail, /scope/i, 'wrong-scope refusal must be actionable');

const externalAfterUndo = sanitizeWorkspace({ ...undone.workspace, author: 'changed after Undo' });
const staleRedo = transitionWorkspaceHistory('redo', undone.past, undone.future, externalAfterUndo, 'selected-scope-a');
assert.equal(staleRedo.status, 'refused', 'an external edit before Redo must refuse without overwriting it');
assert.equal(staleRedo.past, undone.past);
assert.equal(staleRedo.future, undone.future);

const noOpAttempt = {};
const noOpWorkspace = sanitizeWorkspace(JSON.parse(JSON.stringify(base)));
const noOp = prepareX4UiSourceHistoryEntry({
  scope: 'selected-scope-a',
  expectedWorkspace: base,
  workspace: noOpWorkspace,
  acknowledgement: {
    status: 'accepted',
    attempt: noOpAttempt,
    expectedWorkspace: base,
    workspace: noOpWorkspace,
    currentWorkspace: noOpWorkspace,
    detail: 'exact parent readback of no-op',
  },
}, 'selected-scope-a', noOpWorkspace, new WeakSet<object>());
assert.equal(noOp.status, 'ignored');
assert.equal(noOp.reason, 'no-op', 'an acknowledged no-op must not clear redo or add history');

const refused = prepareX4UiSourceHistoryEntry({
  scope: 'selected-scope-a',
  expectedWorkspace: base,
  workspace: edited,
  acknowledgement: {
    status: 'refused',
    attempt: {},
    expectedWorkspace: base,
    workspace: edited,
    currentWorkspace: base,
    reason: 'stale-parent-workspace',
    detail: 'stale parent',
  },
}, 'selected-scope-a', base, new WeakSet<object>());
assert.equal(refused.status, 'ignored');
assert.equal(refused.reason, 'refused');

let boundedLegacy: WorkspaceHistoryEntry[] = [];
for (let index = 0; index < WORKSPACE_HISTORY_LIMIT + 5; index += 1) {
  boundedLegacy = appendWorkspaceHistoryEntry(
    boundedLegacy,
    createLegacyWorkspaceHistoryEntry(sanitizeWorkspace({ ...base, description: `legacy-${index}` })),
  );
}
assert.equal(boundedLegacy.length, WORKSPACE_HISTORY_LIMIT, 'legacy checkpoints must retain the existing 40-entry bound');
const legacyUndo = transitionWorkspaceHistory('undo', [createLegacyWorkspaceHistoryEntry(base)], [], edited, 'any-scope');
assert.equal(legacyUndo.status, 'applied', 'legacy checkpoint callers must retain ordinary Undo behavior');
assert.equal(canonicalWorkspaceSnapshotString(legacyUndo.workspace), beforeSnapshot);

function runLegacyAppScopeBoundary(absentScope: string | null): void {
  const legacyEntry = createLegacyWorkspaceHistoryEntry(base);
  let live = edited;
  let past: WorkspaceHistoryEntry[] = [legacyEntry];
  let future: WorkspaceHistoryEntry[] = [];
  let pending: PendingWorkspaceHistoryTransition | null = null;
  const queued: Array<(workspace: typeof edited) => typeof edited> = [];
  const normalizedScope = absentScope || '';
  const schedule = (direction: 'undo' | 'redo'): void => {
    const result = scheduleWorkspaceHistoryTransition(
      direction,
      past,
      future,
      live,
      normalizedScope,
      updater => queued.push(updater as (workspace: typeof edited) => typeof edited),
      () => normalizedScope,
      () => past,
      () => future,
      nextPending => { pending = nextPending; },
      () => undefined,
    );
    assert.equal(result.status, 'pending', `${direction} must stage a legacy checkpoint at an absent scope boundary`);
    assert.ok(pending);
    const updater = queued.shift();
    assert.ok(updater);
    live = updater(live);
    const settlement = settleWorkspaceHistoryTransition(pending, live, absentScope, past, future);
    assert.equal(settlement.status, 'applied', `${direction} must settle through a null/empty legacy scope boundary`);
    if (settlement.status !== 'applied') throw new Error(`${direction} legacy scope boundary did not settle`);
    live = settlement.result.workspace;
    past = settlement.result.past;
    future = settlement.result.future;
    pending = null;
  };
  schedule('undo');
  assert.equal(canonicalWorkspaceSnapshotString(live), beforeSnapshot, 'legacy Undo must restore A without a selected scope');
  assert.equal(past.length, 0);
  assert.equal(future.length, 1);
  schedule('redo');
  assert.equal(canonicalWorkspaceSnapshotString(live), afterSnapshot, 'legacy Redo must restore B without a selected scope');
  assert.equal(past.length, 1);
  assert.equal(future.length, 0);
}

runLegacyAppScopeBoundary(null);
runLegacyAppScopeBoundary('');

const creationBase = sanitizeWorkspace({
  ...base,
  id: 'source-history-creation',
  name: 'Creation Base',
  passthroughFiles: [
    { path: 'sibling.xml', content: '<sibling>preserve me</sibling>', reason: 'partial' },
  ],
});
const creationSource = buildX4UiWorkspaceSource(creationBase);
const created = createX4UiWorkspaceMenu(creationBase, creationSource, 'History Menu');
assert.equal(created.accepted, true, 'the real source owner must accept source-less menu creation');
const createdLua = created.workspace.passthroughFiles.find(file => file.path === 'ui/history_menu.lua');
const createdUiXml = created.workspace.passthroughFiles.find(file => file.path === 'ui.xml');
assert.equal(created.workspace.passthroughFiles.length, creationBase.passthroughFiles.length + 2, 'creation must add ui.xml and one Lua file');
assert.equal(created.workspace.passthroughFiles[0]?.content, creationBase.passthroughFiles[0]?.content, 'creation must preserve the sibling file');
assert.ok(createdLua, 'creation must materialize the new full Lua file');
assert.ok(createdUiXml, 'creation must materialize the source registration file');
assert.ok(created.source.bundle?.registrations.some(registration => registration.rawPath === 'ui/history_menu.lua'), 'creation must preserve exact source registration');

const creationAttempt = {};
const creationReceipt = {
  scope: 'selected-scope-creation',
  expectedWorkspace: creationBase,
  workspace: created.workspace,
  acknowledgement: {
    status: 'accepted' as const,
    attempt: creationAttempt,
    expectedWorkspace: creationBase,
    workspace: created.workspace,
    currentWorkspace: created.workspace,
    detail: 'exact parent readback of source menu creation',
  },
};
const creationHistory = prepareX4UiSourceHistoryEntry(
  creationReceipt,
  'selected-scope-creation',
  created.workspace,
  new WeakSet<object>(),
);
assert.equal(creationHistory.status, 'recorded', 'the real creation transaction must enter guarded history');
const creationPast: WorkspaceHistoryEntry[] = [creationHistory.entry];
const creationFuture: WorkspaceHistoryEntry[] = [];
const creationUndo = transitionWorkspaceHistory(
  'undo',
  creationPast,
  creationFuture,
  created.workspace,
  'selected-scope-creation',
);
assert.equal(creationUndo.status, 'applied', 'creation Undo must accept the exact created workspace');
assert.equal(canonicalWorkspaceSnapshotString(creationUndo.workspace), canonicalWorkspaceSnapshotString(creationBase), 'creation Undo must restore the exact prior workspace');
assert.equal(creationUndo.workspace.passthroughFiles.length, creationBase.passthroughFiles.length, 'creation Undo must restore the prior file count');
assert.equal(creationUndo.workspace.passthroughFiles[0]?.content, creationBase.passthroughFiles[0]?.content, 'creation Undo must restore sibling bytes');
assert.equal(creationUndo.workspace.passthroughFiles.some(file => file.path === 'ui/history_menu.lua'), false, 'creation Undo must remove the created Lua file');
assert.equal(creationUndo.workspace.passthroughFiles.some(file => file.path === 'ui.xml'), false, 'creation Undo must remove the created registration file');

const creationRedo = transitionWorkspaceHistory(
  'redo',
  creationUndo.past,
  creationUndo.future,
  creationUndo.workspace,
  'selected-scope-creation',
);
assert.equal(creationRedo.status, 'applied', 'creation Redo must accept the exact restored prior workspace');
assert.equal(canonicalWorkspaceSnapshotString(creationRedo.workspace), canonicalWorkspaceSnapshotString(created.workspace), 'creation Redo must restore the exact new workspace');
assert.equal(creationRedo.workspace.passthroughFiles.find(file => file.path === 'ui/history_menu.lua')?.content, createdLua?.content, 'creation Redo must restore the complete new Lua bytes');
assert.equal(creationRedo.workspace.passthroughFiles.find(file => file.path === 'ui.xml')?.content, createdUiXml?.content, 'creation Redo must restore the complete registration bytes');
assert.equal(creationRedo.workspace.passthroughFiles.find(file => file.path === 'sibling.xml')?.content, creationBase.passthroughFiles[0]?.content, 'creation Redo must preserve sibling bytes');

type CausalHistoryState = {
  live: typeof edited;
  scope: string | null;
  past: WorkspaceHistoryEntry[];
  future: WorkspaceHistoryEntry[];
  queued: Array<(workspace: typeof edited) => typeof edited>;
  pending: PendingWorkspaceHistoryTransition | null;
  boundaryCount: number;
};

function createCausalHistoryState(): CausalHistoryState {
  return {
    live: JSON.parse(JSON.stringify(edited)) as typeof edited,
    scope: 'selected-scope-a',
    past: [recordedSourceEntry],
    future: [],
    queued: [],
    pending: null,
    boundaryCount: 0,
  };
}

function scheduleCausalUndo(state: CausalHistoryState): void {
  const result = scheduleWorkspaceHistoryTransition(
    'undo',
    state.past,
    state.future,
    state.live,
    state.scope ?? '',
    updater => state.queued.push(updater as (workspace: typeof edited) => typeof edited),
    () => state.scope,
    () => state.past,
    () => state.future,
    pending => { state.pending = pending; },
    () => { state.boundaryCount += 1; },
  );
  assert.equal(result.status, 'pending', 'the App-used scheduler must stage an exact guarded transition');
  assert.ok(state.pending, 'the App-used scheduler must install pending state before its updater is observed');
  assert.equal(state.boundaryCount, 1, 'the App-used scheduler must request one explicit readback boundary');
}

function flushCausalQueue(state: CausalHistoryState): void {
  while (state.queued.length > 0) {
    const updater = state.queued.shift();
    assert.ok(updater);
    state.live = updater(state.live);
  }
}

function settleCausalState(state: CausalHistoryState): ReturnType<typeof settleWorkspaceHistoryTransition> {
  assert.ok(state.pending);
  return settleWorkspaceHistoryTransition(state.pending, state.live, state.scope, state.past, state.future);
}

const causalAccepted = createCausalHistoryState();
scheduleCausalUndo(causalAccepted);
flushCausalQueue(causalAccepted);
const causalAcceptedSettlement = settleCausalState(causalAccepted);
assert.equal(causalAcceptedSettlement.status, 'applied', 'the App-used scheduler must accept exact queued readback');
if (causalAcceptedSettlement.status === 'applied') {
  causalAccepted.live = causalAcceptedSettlement.result.workspace;
  causalAccepted.past = causalAcceptedSettlement.result.past;
  causalAccepted.future = causalAcceptedSettlement.result.future;
}
assert.equal(canonicalWorkspaceSnapshotString(causalAccepted.live), beforeSnapshot, 'the App-used scheduler must restore exact A');
assert.equal(causalAccepted.past.length, 0);
assert.equal(causalAccepted.future.length, 1);

const causalReplayedUpdater = createCausalHistoryState();
scheduleCausalUndo(causalReplayedUpdater);
const replayUpdater = causalReplayedUpdater.queued.shift();
assert.ok(replayUpdater);
const replayedTarget = replayUpdater(causalReplayedUpdater.live);
const replayedAgain = replayUpdater(replayedTarget);
assert.equal(replayedAgain, replayedTarget, 'a replayed functional updater must be a side-effect-free no-op after the first result');
causalReplayedUpdater.live = replayedAgain;
const causalReplayedSettlement = settleCausalState(causalReplayedUpdater);
assert.equal(causalReplayedSettlement.status, 'applied', 'a replayed updater must still settle one accepted transition');

function assertCausalRefusal(
  label: string,
  mutateBeforeUpdater: (state: CausalHistoryState) => void,
  assertCurrentStacks: (state: CausalHistoryState, expectedPast: WorkspaceHistoryEntry[], expectedFuture: WorkspaceHistoryEntry[]) => void = (state, expectedPast, expectedFuture) => {
    assert.equal(state.past, expectedPast, `${label}: refusal must preserve past identity`);
    assert.equal(state.future, expectedFuture, `${label}: refusal must preserve future identity`);
  },
): void {
  const state = createCausalHistoryState();
  const expectedPast = state.past;
  const expectedFuture = state.future;
  scheduleCausalUndo(state);
  mutateBeforeUpdater(state);
  flushCausalQueue(state);
  const settlement = settleCausalState(state);
  assert.equal(settlement.status, 'refused', `${label}: stale queued restore must refuse at readback`);
  assertCurrentStacks(state, expectedPast, expectedFuture);
  assert.equal(state.pending !== null, true, `${label}: the refusal must have crossed the explicit boundary`);
}

assertCausalRefusal('queued newer workspace', state => {
  const newer = JSON.parse(JSON.stringify(state.live)) as typeof edited;
  newer.description = 'newer external edit';
  state.queued.unshift(() => newer);
});
assertCausalRefusal('in-place mutation before updater', state => {
  state.live.author = 'mutated before updater';
});
assertCausalRefusal('mutated target before updater', state => {
  assert.ok(state.pending);
  state.pending.result.workspace.author = 'mutated proposed target';
});
assertCausalRefusal('scope changed before updater', state => {
  state.scope = 'different-selected-scope';
});
assertCausalRefusal('history origin changed before updater', state => {
  state.past = [...state.past];
}, (state, expectedPast, expectedFuture) => {
  assert.notEqual(state.past, expectedPast, 'history-origin refusal must not rewind an externally replaced past stack');
  assert.equal(state.past.length, expectedPast.length);
  assert.equal(state.future, expectedFuture, 'history-origin refusal must preserve the current future stack');
});

const causalTargetMutation = createCausalHistoryState();
scheduleCausalUndo(causalTargetMutation);
flushCausalQueue(causalTargetMutation);
assert.ok(causalTargetMutation.pending);
causalTargetMutation.live.author = 'mutated target after apply';
const targetMutationSettlement = settleCausalState(causalTargetMutation);
assert.equal(targetMutationSettlement.status, 'refused', 'a target mutated after apply must refuse before history settlement');

const causalClonedReadback = createCausalHistoryState();
scheduleCausalUndo(causalClonedReadback);
flushCausalQueue(causalClonedReadback);
causalClonedReadback.live = JSON.parse(JSON.stringify(causalClonedReadback.live)) as typeof edited;
const clonedReadbackSettlement = settleCausalState(causalClonedReadback);
assert.equal(clonedReadbackSettlement.status, 'refused', 'an equal-byte cloned readback must not settle the originating transition');

console.log('workspaceUndoHistory App-used scheduler selftest: accepted exact queued Undo, replayed updater, queued newer/in-place/target/scope/history-origin mutations, post-apply mutation, cloned readback, preserved stacks, and explicit refusal boundaries passed');

console.log('workspaceUndoHistory selftest: exact source A->B->Undo A->Redo B, duplicate/no-op/refused/stale/scope/identity guards, legacy 40-entry compatibility, and real source creation Undo/Redo with registration/file-count/full-Lua/sibling preservation passed');

const spliceMetadata = { path: 'ui/scenario.lua', startOffset: 10, endOffset: 13, expectedText: 'old', replacement: 'new text' };
const withSplice = prepareX4UiSourceHistoryEntry({ ...sourceReceipt, sourceSplice: spliceMetadata }, 'selected-scope-a', edited, new WeakSet<object>());
assert.equal(withSplice.status, 'recorded');
if (withSplice.status === 'recorded') {
  assert.deepEqual(withSplice.entry.sourceSplice, spliceMetadata, 'source history retains optional source-only continuation metadata');
  assert.notEqual(withSplice.entry.sourceSplice, spliceMetadata, 'metadata is a snapshot, not caller-owned mutable state');
  assert.equal(Object.isFrozen(withSplice.entry.sourceSplice), true);
  assert.equal('scenarios' in withSplice.entry, false, 'preview choices must not enter source history');
  const decorated = prepareX4UiSourceHistoryEntry({ ...sourceReceipt,
    sourceSplice: Object.assign({}, spliceMetadata, { scenarios: ['not source metadata'] }) }, 'selected-scope-a', edited, new WeakSet<object>());
  assert.equal(decorated.status, 'recorded');
  if (decorated.status === 'recorded') assert.deepEqual(decorated.entry.sourceSplice, spliceMetadata, 'copy only the source metadata fields, never arbitrary attached preview state');
  const previewState = createCausalHistoryState();
  previewState.past = [withSplice.entry];
  scheduleCausalUndo(previewState);
  assert.equal(previewWorkspaceHistoryContinuation(previewState.pending, previewState.live, previewState.scope, previewState.past, previewState.future), null,
    'scheduled but unapplied target is not a preview continuation');
  flushCausalQueue(previewState);
  const notice = previewWorkspaceHistoryContinuation(previewState.pending, previewState.live, previewState.scope, previewState.past, previewState.future);
  assert.ok(notice);
  assert.equal(notice.sourceSplice?.expectedText, 'new text');
  assert.equal(notice.sourceSplice?.replacement, 'old');
  assert.equal(previewState.past.length, 1, 'preview inspection does not commit history');
  assert.equal(previewWorkspaceHistoryContinuation(previewState.pending, previewState.live, 'foreign-scope', previewState.past, previewState.future), null);
  assert.equal(previewWorkspaceHistoryContinuation(previewState.pending, { ...previewState.live }, previewState.scope, previewState.past, previewState.future), null);
}
