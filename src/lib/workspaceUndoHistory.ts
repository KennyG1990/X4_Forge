/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sanitizeWorkspace, type ModWorkspace } from '../types';
import { canonicalWorkspaceSnapshotString } from './workspaceIdentity';

/** Keep the existing bounded history behavior for both legacy and source entries. */
export const WORKSPACE_HISTORY_LIMIT = 40;

/** Optional source-only provenance; never preview values or another undo stack. */
export interface WorkspaceSourceSplice {
  readonly path: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly expectedText: string;
  readonly replacement: string;
  readonly retainedSpans?: readonly { readonly beforeStart: number; readonly beforeEnd: number; readonly afterStart: number }[];
}

export function reverseWorkspaceSourceSplice(splice: WorkspaceSourceSplice): WorkspaceSourceSplice {
  return {
    path: splice.path, startOffset: splice.startOffset,
    endOffset: splice.startOffset + splice.replacement.length,
    expectedText: splice.replacement, replacement: splice.expectedText,
    ...(splice.retainedSpans === undefined ? {} : { retainedSpans: splice.retainedSpans.map(span => ({
      beforeStart: span.afterStart, beforeEnd: span.afterStart + span.beforeEnd - span.beforeStart, afterStart: span.beforeStart,
    })) }),
  };
}

export interface WorkspaceSourceContinuation {
  readonly direction: 'undo' | 'redo' | 'edit';
  readonly scope: string;
  readonly beforeWorkspace: unknown;
  readonly afterWorkspace: unknown;
  readonly sourceSplice?: WorkspaceSourceSplice;
}

export interface LegacyWorkspaceHistoryEntry {
  readonly kind: 'legacy';
  readonly snapshot: ModWorkspace;
}

export interface SourceWorkspaceHistoryEntry {
  readonly kind: 'source';
  /** The immutable selected-workspace scope, not the mutable mod id or display name. */
  readonly workspaceScope: string;
  readonly before: ModWorkspace;
  readonly after: ModWorkspace;
  readonly beforeSnapshot: string;
  readonly afterSnapshot: string;
  readonly sourceSplice?: WorkspaceSourceSplice;
}

export type WorkspaceHistoryEntry = LegacyWorkspaceHistoryEntry | SourceWorkspaceHistoryEntry;

export interface WorkspaceSourceHistoryAcknowledgement {
  readonly status: 'accepted' | 'refused';
  readonly attempt: object;
  readonly expectedWorkspace: unknown;
  readonly workspace: unknown;
  readonly currentWorkspace: unknown;
  readonly reason?: string;
  readonly detail: string;
}

export interface WorkspaceSourceHistoryReceipt {
  readonly scope: string;
  readonly expectedWorkspace: unknown;
  readonly workspace: unknown;
  readonly acknowledgement: WorkspaceSourceHistoryAcknowledgement;
  readonly sourceSplice?: WorkspaceSourceSplice;
}

export type SourceHistoryPreparationResult =
  | { readonly status: 'recorded'; readonly entry: SourceWorkspaceHistoryEntry }
  | {
      readonly status: 'ignored';
      readonly reason:
        | 'refused'
        | 'duplicate'
        | 'wrong-scope'
        | 'invalid-acknowledgement'
        | 'stale-current'
        | 'no-op';
      readonly detail: string;
    };

export type WorkspaceHistoryTransition = 'undo' | 'redo';

export type AppliedWorkspaceHistoryTransition = Extract<WorkspaceHistoryTransitionResult, { status: 'applied' }>;

export interface PendingWorkspaceHistoryTransition {
  readonly transition: WorkspaceHistoryTransition;
  readonly expectedWorkspace: ModWorkspace;
  readonly expectedWorkspaceSnapshot: string;
  readonly targetWorkspaceSnapshot: string;
  readonly expectedScope: string;
  readonly expectedPast: WorkspaceHistoryEntry[];
  readonly expectedFuture: WorkspaceHistoryEntry[];
  readonly result: AppliedWorkspaceHistoryTransition;
}

export type WorkspaceHistoryTransitionResult =
  | {
      readonly status: 'applied';
      readonly workspace: ModWorkspace;
      readonly past: WorkspaceHistoryEntry[];
      readonly future: WorkspaceHistoryEntry[];
      readonly entry: WorkspaceHistoryEntry;
      readonly detail: string;
    }
  | {
      readonly status: 'empty';
      readonly past: WorkspaceHistoryEntry[];
      readonly future: WorkspaceHistoryEntry[];
      readonly detail: string;
    }
  | {
      readonly status: 'refused';
      readonly past: WorkspaceHistoryEntry[];
      readonly future: WorkspaceHistoryEntry[];
      readonly detail: string;
    };

export type WorkspaceHistoryScheduleResult =
  | { readonly status: 'pending'; readonly pending: PendingWorkspaceHistoryTransition; readonly detail: string }
  | { readonly status: 'empty'; readonly detail: string }
  | { readonly status: 'refused'; readonly detail: string };

export type WorkspaceHistorySettlementResult =
  | { readonly status: 'pending'; readonly detail: string }
  | { readonly status: 'applied'; readonly result: AppliedWorkspaceHistoryTransition }
  | { readonly status: 'refused'; readonly detail: string };

function cloneWorkspaceSnapshot(workspace: ModWorkspace): ModWorkspace {
  return JSON.parse(JSON.stringify(workspace)) as ModWorkspace;
}

/** Restore through the same workspace boundary used by App before capturing CAS/readback identity. */
function materializeRestoredWorkspace(workspace: ModWorkspace): ModWorkspace {
  return sanitizeWorkspace(cloneWorkspaceSnapshot(workspace));
}

function snapshotString(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  return canonicalWorkspaceSnapshotString(value as ModWorkspace);
}

function isBoundWorkspaceScope(scope: string): boolean {
  return scope.trim().length > 0 && scope !== 'unbound';
}

function describeTransition(transition: WorkspaceHistoryTransition): string {
  return transition === 'undo' ? 'Undo' : 'Redo';
}

export function createLegacyWorkspaceHistoryEntry(workspace: ModWorkspace): LegacyWorkspaceHistoryEntry {
  return Object.freeze({
    kind: 'legacy' as const,
    snapshot: cloneWorkspaceSnapshot(workspace),
  });
}

export function appendWorkspaceHistoryEntry(
  entries: readonly WorkspaceHistoryEntry[],
  entry: WorkspaceHistoryEntry,
): WorkspaceHistoryEntry[] {
  return [...entries.slice(-(WORKSPACE_HISTORY_LIMIT - 1)), entry];
}

export function createSourceWorkspaceHistoryEntry(
  workspaceScope: string,
  before: ModWorkspace,
  after: ModWorkspace,
  sourceSplice?: WorkspaceSourceSplice,
): SourceWorkspaceHistoryEntry | null {
  const beforeClone = cloneWorkspaceSnapshot(before);
  const afterClone = cloneWorkspaceSnapshot(after);
  const beforeSnapshot = canonicalWorkspaceSnapshotString(beforeClone);
  const afterSnapshot = canonicalWorkspaceSnapshotString(afterClone);
  if (beforeSnapshot === afterSnapshot) return null;
  return Object.freeze({
    kind: 'source' as const,
    workspaceScope,
    before: beforeClone,
    after: afterClone,
    beforeSnapshot,
    afterSnapshot,
    ...(sourceSplice === undefined ? {} : { sourceSplice: Object.freeze({
      path: sourceSplice.path, startOffset: sourceSplice.startOffset, endOffset: sourceSplice.endOffset,
      expectedText: sourceSplice.expectedText, replacement: sourceSplice.replacement,
      ...(sourceSplice.retainedSpans === undefined ? {} : {
        retainedSpans: Object.freeze(sourceSplice.retainedSpans.map(span => Object.freeze({
          beforeStart: span.beforeStart, beforeEnd: span.beforeEnd, afterStart: span.afterStart,
        }))),
      }),
    }) }),
  });
}

export function prepareX4UiSourceHistoryEntry(
  receipt: WorkspaceSourceHistoryReceipt,
  activeWorkspaceScope: string,
  currentWorkspace: ModWorkspace,
  seenAttempts: WeakSet<object>,
): SourceHistoryPreparationResult {
  const acknowledgement = receipt.acknowledgement;
  if (acknowledgement.status !== 'accepted') {
    return {
      status: 'ignored',
      reason: 'refused',
      detail: `Source edit was refused: ${acknowledgement.detail}`,
    };
  }
  if (!isBoundWorkspaceScope(receipt.scope) || !isBoundWorkspaceScope(activeWorkspaceScope) || receipt.scope !== activeWorkspaceScope) {
    return {
      status: 'ignored',
      reason: 'wrong-scope',
      detail: 'The source edit has no matching bound selected workspace scope.',
    };
  }
  if (acknowledgement.attempt === null || typeof acknowledgement.attempt !== 'object') {
    return {
      status: 'ignored',
      reason: 'invalid-acknowledgement',
      detail: 'The source edit acknowledgement did not preserve its attempt identity.',
    };
  }
  if (seenAttempts.has(acknowledgement.attempt)) {
    return {
      status: 'ignored',
      reason: 'duplicate',
      detail: 'The source edit acknowledgement was already recorded.',
    };
  }
  seenAttempts.add(acknowledgement.attempt);

  if (
    acknowledgement.expectedWorkspace !== receipt.expectedWorkspace
    || acknowledgement.workspace !== receipt.workspace
    || acknowledgement.currentWorkspace !== receipt.workspace
  ) {
    return {
      status: 'ignored',
      reason: 'invalid-acknowledgement',
      detail: 'The source edit acknowledgement did not preserve the exact parent readback tuple.',
    };
  }
  if (currentWorkspace !== receipt.workspace) {
    return {
      status: 'ignored',
      reason: 'stale-current',
      detail: 'The exact acknowledged workspace object is no longer current; history was not changed.',
    };
  }

  const expectedReceiptSnapshot = snapshotString(receipt.expectedWorkspace);
  const expectedAcknowledgementSnapshot = snapshotString(acknowledgement.expectedWorkspace);
  const requestedSnapshot = snapshotString(receipt.workspace);
  const acknowledgedSnapshot = snapshotString(acknowledgement.workspace);
  const readbackSnapshot = snapshotString(acknowledgement.currentWorkspace);
  const currentSnapshot = canonicalWorkspaceSnapshotString(currentWorkspace);

  if (
    expectedReceiptSnapshot === null
    || expectedAcknowledgementSnapshot === null
    || requestedSnapshot === null
    || acknowledgedSnapshot === null
    || readbackSnapshot === null
  ) {
    return {
      status: 'ignored',
      reason: 'invalid-acknowledgement',
      detail: 'The source edit acknowledgement did not contain complete workspace snapshots.',
    };
  }
  if (
    expectedReceiptSnapshot !== expectedAcknowledgementSnapshot
    || requestedSnapshot !== acknowledgedSnapshot
    || readbackSnapshot !== requestedSnapshot
  ) {
    return {
      status: 'ignored',
      reason: 'invalid-acknowledgement',
      detail: 'The source edit acknowledgement did not match its submitted workspace.',
    };
  }
  if (currentSnapshot !== requestedSnapshot) {
    return {
      status: 'ignored',
      reason: 'stale-current',
      detail: 'The accepted source edit is no longer the current workspace; history was not changed.',
    };
  }

  const entry = createSourceWorkspaceHistoryEntry(
    receipt.scope,
    receipt.expectedWorkspace as ModWorkspace,
    receipt.workspace as ModWorkspace,
    receipt.sourceSplice,
  );
  if (entry === null) {
    return {
      status: 'ignored',
      reason: 'no-op',
      detail: 'The accepted source edit produced no complete workspace change.',
    };
  }
  return { status: 'recorded', entry };
}

export function transitionWorkspaceHistory(
  transition: WorkspaceHistoryTransition,
  past: WorkspaceHistoryEntry[],
  future: WorkspaceHistoryEntry[],
  currentWorkspace: ModWorkspace,
  activeWorkspaceScope: string,
): WorkspaceHistoryTransitionResult {
  const source = transition === 'undo' ? past : future;
  if (source.length === 0) {
    return {
      status: 'empty',
      past,
      future,
      detail: `${describeTransition(transition)} has no history entry.`,
    };
  }

  const entry = transition === 'undo' ? source[source.length - 1] : source[0];
  if (entry.kind === 'source') {
    const expectedCurrent = transition === 'undo' ? entry.afterSnapshot : entry.beforeSnapshot;
    const actualCurrent = canonicalWorkspaceSnapshotString(currentWorkspace);
    if (
      !isBoundWorkspaceScope(entry.workspaceScope)
      || !isBoundWorkspaceScope(activeWorkspaceScope)
      || entry.workspaceScope !== activeWorkspaceScope
    ) {
      return {
        status: 'refused',
        past,
        future,
        detail: `${describeTransition(transition)} refused: the selected workspace scope changed.`,
      };
    }
    if (actualCurrent !== expectedCurrent) {
      return {
        status: 'refused',
        past,
        future,
        detail: `${describeTransition(transition)} refused: the current workspace changed since this source edit.`,
      };
    }
    const nextPast = transition === 'undo' ? past.slice(0, -1) : [...past, entry];
    const nextFuture = transition === 'undo' ? [entry, ...future] : future.slice(1);
    return {
      status: 'applied',
      workspace: materializeRestoredWorkspace(transition === 'undo' ? entry.before : entry.after),
      past: nextPast,
      future: nextFuture,
      entry,
      detail: `${describeTransition(transition)} applied to the guarded source edit.`,
    };
  }

  const nextPast = transition === 'undo'
    ? past.slice(0, -1)
    : [...past, createLegacyWorkspaceHistoryEntry(currentWorkspace)];
  const nextFuture = transition === 'undo'
    ? [createLegacyWorkspaceHistoryEntry(currentWorkspace), ...future]
    : future.slice(1);
  return {
    status: 'applied',
    workspace: materializeRestoredWorkspace(entry.snapshot),
    past: nextPast,
    future: nextFuture,
    entry,
    detail: `${describeTransition(transition)} applied to a legacy checkpoint.`,
  };
}

/**
 * Schedule the actual App-owned workspace CAS without mutating history. The caller installs
 * the returned pending record before the updater can be observed and settles it only after the
 * caller's committed readback boundary runs.
 */
export function scheduleWorkspaceHistoryTransition(
  transition: WorkspaceHistoryTransition,
  past: WorkspaceHistoryEntry[],
  future: WorkspaceHistoryEntry[],
  currentWorkspace: ModWorkspace,
  activeWorkspaceScope: string,
  scheduleWorkspaceUpdate: (updater: (currentWorkspace: ModWorkspace) => ModWorkspace) => void,
  readWorkspaceScope: () => string | null,
  readPast: () => WorkspaceHistoryEntry[],
  readFuture: () => WorkspaceHistoryEntry[],
  installPending: (pending: PendingWorkspaceHistoryTransition) => void,
  requestReadbackBoundary: () => void,
): WorkspaceHistoryScheduleResult {
  const result = transitionWorkspaceHistory(transition, past, future, currentWorkspace, activeWorkspaceScope);
  if (result.status === 'empty' || result.status === 'refused') return result;

  const expectedWorkspaceSnapshot = canonicalWorkspaceSnapshotString(currentWorkspace);
  const targetWorkspaceSnapshot = canonicalWorkspaceSnapshotString(result.workspace);
  const pending: PendingWorkspaceHistoryTransition = Object.freeze({
    transition,
    expectedWorkspace: currentWorkspace,
    expectedWorkspaceSnapshot,
    targetWorkspaceSnapshot,
    expectedScope: activeWorkspaceScope,
    expectedPast: past,
    expectedFuture: future,
    result,
  });
  installPending(pending);
  scheduleWorkspaceUpdate(current => {
    if (
      current !== currentWorkspace
      || canonicalWorkspaceSnapshotString(current) !== expectedWorkspaceSnapshot
      || readWorkspaceScope() !== activeWorkspaceScope
      || readPast() !== past
      || readFuture() !== future
      || canonicalWorkspaceSnapshotString(result.workspace) !== targetWorkspaceSnapshot
    ) return current;
    return result.workspace;
  });
  // Even a CAS refusal can return the same workspace object and therefore bail out of the
  // workspace state update. The explicit boundary guarantees the pending record is settled.
  requestReadbackBoundary();
  return {
    status: 'pending',
    pending,
    detail: `${describeTransition(transition)} is waiting for exact workspace readback.`,
  };
}

/** Settle one scheduled transition after the App has rendered its workspace readback. */
export function settleWorkspaceHistoryTransition(
  pending: PendingWorkspaceHistoryTransition,
  currentWorkspace: ModWorkspace,
  activeWorkspaceScope: string | null,
  past: WorkspaceHistoryEntry[],
  future: WorkspaceHistoryEntry[],
): WorkspaceHistorySettlementResult {
  // App normalizes an absent selected-workspace scope to the empty legacy boundary. This keeps
  // legacy checkpoints compatible without ever making an empty scope valid for source entries.
  const settledScope = activeWorkspaceScope ?? '';
  const restoredExactly = currentWorkspace === pending.result.workspace
    && canonicalWorkspaceSnapshotString(currentWorkspace) === pending.targetWorkspaceSnapshot
    && canonicalWorkspaceSnapshotString(pending.result.workspace) === pending.targetWorkspaceSnapshot
    && settledScope === pending.expectedScope
    && past === pending.expectedPast
    && future === pending.expectedFuture;
  const pendingBecameStale = currentWorkspace !== pending.expectedWorkspace
    || canonicalWorkspaceSnapshotString(currentWorkspace) !== pending.expectedWorkspaceSnapshot
    || canonicalWorkspaceSnapshotString(pending.result.workspace) !== pending.targetWorkspaceSnapshot
    || settledScope !== pending.expectedScope
    || past !== pending.expectedPast
    || future !== pending.expectedFuture;
  if (restoredExactly) return { status: 'applied', result: pending.result };
  if (pendingBecameStale) {
    return {
      status: 'refused',
      detail: `${describeTransition(pending.transition)} refused: the workspace or selected scope changed before exact readback.`,
    };
  }
  return {
    status: 'pending',
    detail: `${describeTransition(pending.transition)} remains pending exact workspace readback.`,
  };
}

/** Read-only preview of the already guarded target; does NOT settle or mutate history. */
export function previewWorkspaceHistoryContinuation(
  pending: PendingWorkspaceHistoryTransition | null,
  currentWorkspace: ModWorkspace,
  activeWorkspaceScope: string | null,
  past: WorkspaceHistoryEntry[],
  future: WorkspaceHistoryEntry[],
): (WorkspaceSourceContinuation & { readonly direction: 'undo' | 'redo' }) | null {
  if (pending === null || pending.result.entry.kind !== 'source'
    || settleWorkspaceHistoryTransition(pending, currentWorkspace, activeWorkspaceScope, past, future).status !== 'applied') return null;
  const splice = pending.result.entry.sourceSplice;
  return {
    direction: pending.transition, scope: pending.expectedScope,
    beforeWorkspace: pending.expectedWorkspace, afterWorkspace: pending.result.workspace,
    ...(splice === undefined ? {} : { sourceSplice: pending.transition === 'undo' ? reverseWorkspaceSourceSplice(splice) : splice }),
  };
}
