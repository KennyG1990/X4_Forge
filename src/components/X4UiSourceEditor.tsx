/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import X4UiPreviewScenarios from './X4UiPreviewScenarios';
import { capturePreviewScenario, projectPreviewScenario, resolvePreviewScenarioTransitionSelection, transferPreviewScenario, type X4UiPreviewScenarioView } from '../lib/x4UiPreviewScenarios';
import type { WorkspaceSourceContinuation, WorkspaceSourceSplice } from '../lib/workspaceUndoHistory';
import {
  createX4UiWorkspaceMenu,
  exportX4UiWorkspaceLua,
  importX4UiWorkspaceLua,
  X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES,
  type X4UiWorkspaceSource,
} from '../lib/x4UiWorkspaceSource';
import {
  X4_UI_EDITOR_DEFAULT_PROFILE,
  X4_UI_EDITOR_EMPTY_CANVAS_STATE,
  X4_UI_EDITOR_SESSION_GAME_TRUTH,
  X4_UI_EDITOR_UNSELECTED_SOURCE,
  adoptX4UiEditorCanvasResult,
  applyX4UiEditorSampleDraft,
  createX4UiEditorSessionOwner,
  resetX4UiEditorLoopState,
  resetX4UiEditorPathState,
  sameX4UiEditorLoopBinding,
  sameX4UiEditorPathBinding,
  sameX4UiEditorSampleBinding,
  updateX4UiEditorLoopState,
  updateX4UiEditorPathState,
  type X4UiEditorCanvasState,
  type X4UiEditorLoopBinding,
  type X4UiEditorLoopCatalogAuthority,
  type X4UiEditorLoopState,
  type X4UiEditorPathBinding,
  type X4UiEditorPathCatalogAuthority,
  type X4UiEditorPathState,
  type X4UiEditorProfileControls,
  type X4UiEditorSampleBinding,
  type X4UiEditorSampleCatalogAuthority,
  type X4UiEditorSampleState,
  type X4UiEditorSessionInput,
  type X4UiEditorSessionProjection,
} from '../lib/x4UiEditorSession';
import type {
  X4UiLayoutPreviewLoopCatalog,
  X4UiLayoutPreviewPathCatalog,
  X4UiLayoutPreviewPathSelectionInput,
  X4UiLayoutPreviewSampleCatalog,
  X4UiLayoutPreviewSampleInput,
  X4UiLayoutScalar,
} from '../lib/x4UiLayoutProgram';
import {
  X4_UI_CORPUS_FILE_URL,
  X4_UI_CORPUS_MANIFEST_URL,
  X4_UI_CORPUS_STATUS_URL,
  isX4UiCorpusCanonicalColorSuccess,
  isX4UiCorpusCanonicalSuccess,
  loadConfiguredX4UiCorpusAssets,
  loadConfiguredX4UiCorpusColorEvidence,
  type X4UiCorpusCanonicalColorSuccess,
  type X4UiCorpusCanonicalSuccess,
  type X4UiCorpusTransport,
} from '../lib/x4UiCorpusAssets';
import {
  applyX4UiSourceEdit,
  applyX4UiSourceRowMove,
  applyX4UiSourceRowInsertion,
  applyX4UiSourceStructuralEdit,
  applyX4UiSourceTextPropertyAddition,
  applyX4UiSourceWidgetInsertion,
  discoverX4UiSourceEdits,
  discoverX4UiSourceTextPropertyAdditions,
  type X4UiSourceTextPropertyAddition,
  type X4UiSourceTextPropertyAdditionResult,
  type X4UiSourceEditCatalog,
  type X4UiSourceEditCatalogEntry,
  type X4UiSourceEditEmptyCellEntry,
  type X4UiSourceEditInsertedRow,
  type X4UiSourceEditInsertedWidget,
  type X4UiSourceEditMovedRow,
  type X4UiSourceEditRowMoveDirection,
  type X4UiSourceEditRowMoveEntry,
  type X4UiSourceEditRowInsertionEntry,
  type X4UiSourceEditScalar,
  type X4UiSourceEditInsertBlockEntry,
  type X4UiSourceEditResult,
  type X4UiSourceEditWidgetKind,
  type X4UiSourceStructuralEditResult,
  type X4UiSourceRowInsertionResult,
  type X4UiSourceRowMoveResult,
  type X4UiSourceWidgetInsertionResult,
} from '../lib/x4UiSourceEdits';
import {
  X4_UI_CANVAS_RENDERER_FORMAT,
  X4_UI_CANVAS_RENDERER_VERSION,
  createX4UiCanvasRenderSession,
  renderX4UiPaintPlanToCanvas,
  type X4UiCanvasRenderResult,
  type X4UiCanvasRenderSession,
  type X4UiCanvasSurface,
  type X4UiCanvasSurfaceFactory,
} from '../lib/x4UiCanvasRenderer';
import { getBuiltInKeepOut, KEEP_OUT_PRESETS } from '../lib/x4UiKeepOuts';
import type { KeepOutCalibrationInput } from '../lib/x4UiKeepOuts';
import {
  buildX4UiGameVerificationCurrentSnapshot,
  type X4UiGameVerificationCurrentSnapshot,
} from '../lib/x4UiGameVerification';
import {
  buildX4UiBuilderPresentation,
  buildX4UiBuilderPropertyPresentation,
  buildX4UiBuilderPreviewInputPresentation,
  computeX4UiBuilderViewport,
  computeX4UiBuilderSelectionFocus,
  describeX4UiBuilderProperty,
  deriveX4UiBuilderMenuBounds,
  hitTestX4UiBuilderCanvas,
  reconcileX4UiBuilderSelection,
  resolveX4UiBuilderNodeAfterSourceRowMove,
  resolveX4UiBuilderNodeAfterSourceRowInsertion,
  resolveX4UiBuilderNodeAfterSourceEdit,
  resolveX4UiBuilderNodeAfterHistory,
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion,
  resolveX4UiBuilderRowForNode,
  sourceEntriesForX4UiBuilderNode,
  type X4UiBuilderCanvasViewport,
  type X4UiBuilderSourceEditSplice,
  type X4UiBuilderSourceAnchor,
  type X4UiBuilderNode,
  type X4UiBuilderPresentation,
  type X4UiBuilderSelection,
  type X4UiBuilderSelectionContext,
  type X4UiBuilderViewportMode,
} from '../lib/x4UiBuilderPresentation';

const builderNodeDepthFor = (node: X4UiBuilderNode, presentation: X4UiBuilderPresentation): number => {
  let depth = 0;
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    depth += 1;
    parentId = presentation.nodes.find(candidate => candidate.id === parentId)?.parentId;
  }
  return depth;
};

export interface X4UiHistoryRestorationNotice {
  readonly direction: 'undo' | 'redo';
  readonly scope: string;
  readonly beforeWorkspace: unknown;
  readonly afterWorkspace: unknown;
  readonly sourceSplice?: WorkspaceSourceSplice;
}

interface X4UiBuilderHistoryIntent {
  readonly anchor: X4UiBuilderSourceAnchor;
  readonly catalog: X4UiSourceEditCatalog;
  readonly profileKey: string | null;
}

/** The editor deliberately receives the workspace as an opaque session input. */
export interface X4UiSourceEditorProps {
  readonly workspace: unknown;
  readonly corpusLoader?: X4UiSourceEditorCorpusLoader;
  readonly surfaceFactory?: X4UiCanvasSurfaceFactory;
  readonly onWorkspaceEdit?: X4UiWorkspaceEditHandler;
  /** Exact App-owned source-history restoration metadata; never carries builder or draft state. */
  readonly workspaceScope?: string;
  readonly historyRestoration?: X4UiHistoryRestorationNotice | null;
  /** Emits only current plain source/target/profile data; deploy evidence remains parent-owned. */
  readonly onVerificationSnapshotChange?: (snapshot: X4UiGameVerificationCurrentSnapshot | null) => void;
  /** Test/diagnostic observer for deterministic mounted projection-count evidence. */
  readonly onSessionProjection?: (projection: X4UiEditorSessionProjection) => void;
}

export interface X4UiWorkspaceEditRequest {
  readonly expectedWorkspace: unknown;
  readonly workspace: unknown;
  readonly sourceSplice?: WorkspaceSourceSplice;
}

export type X4UiWorkspaceEditResult =
  | { readonly accepted: true; readonly detail: string }
  | { readonly accepted: false; readonly reason: string; readonly detail: string };

export interface X4UiWorkspaceEditAcknowledgement {
  readonly status: 'accepted' | 'refused';
  readonly attempt: object;
  readonly expectedWorkspace: unknown;
  readonly workspace: unknown;
  readonly currentWorkspace: unknown;
  readonly reason?: 'stale-parent-workspace';
  readonly detail: string;
}

export interface X4UiWorkspaceEditPending {
  readonly status: 'pending';
  readonly attempt: object;
  readonly expectedWorkspace: unknown;
  readonly workspace: unknown;
  readonly acknowledgement: Promise<X4UiWorkspaceEditAcknowledgement>;
  readonly detail: string;
}

export type X4UiWorkspaceEditSubmission =
  | X4UiWorkspaceEditPending
  | { readonly status: 'refused'; readonly reason: string; readonly detail: string };

export type X4UiWorkspaceEditReadback =
  | { readonly status: 'pending'; readonly detail: string }
  | { readonly status: 'accepted'; readonly detail: string }
  | {
    readonly status: 'refused';
    readonly reason: 'stale-parent-workspace' | 'invalid-parent-workspace-acknowledgement';
    readonly detail: string;
  };

export interface X4UiWorkspaceEditPendingAuthority {
  readonly submission: X4UiWorkspaceEditPending;
  readonly acknowledge: (currentWorkspace: unknown) => X4UiWorkspaceEditAcknowledgement;
}

export type X4UiWorkspaceEditHandler = (request: X4UiWorkspaceEditRequest) => X4UiWorkspaceEditSubmission;

export type X4UiSourceEditorCorpusLoader = (input: {
  readonly signal: AbortSignal;
}) => Promise<unknown>;

type ValueRecord = Record<string, unknown>;

type CorpusLoadStatus = 'idle' | 'loading' | 'canonical' | 'unavailable' | 'stale' | 'malformed' | 'refused';

interface CorpusLoadState {
  readonly status: CorpusLoadStatus;
  readonly result: unknown;
  readonly detail: string;
  readonly colorStatus: CorpusLoadStatus;
  readonly colorEvidence?: X4UiCorpusCanonicalColorSuccess;
  readonly colorDetail: string;
}

interface SourceCandidateView {
  readonly raw: ValueRecord;
  readonly index: number;
  readonly path: string;
  readonly key: string;
  readonly sourceIdentity: unknown;
  readonly targets: readonly TargetCandidateView[];
}

interface TargetCandidateView {
  readonly raw: ValueRecord;
  readonly key: string;
  readonly label: string;
}

export interface X4UiEditorSelectionCandidate {
  readonly key: string;
  readonly targets: readonly { readonly key: string }[];
}

export const reconcileX4UiEditorSelections = (input: {
  readonly sourceSelector: string;
  readonly targetSelector: string;
  readonly candidates: readonly X4UiEditorSelectionCandidate[];
}): { readonly sourceSelector: string; readonly targetSelector: string } => {
  if (input.sourceSelector === '') return { sourceSelector: '', targetSelector: '' };
  const source = input.candidates.find(candidate => candidate.key === input.sourceSelector);
  if (source === undefined) return { sourceSelector: '', targetSelector: '' };
  if (input.targetSelector === '') return { sourceSelector: input.sourceSelector, targetSelector: '' };
  const target = source.targets.find(candidate => candidate.key === input.targetSelector)
    ?? (() => {
      const targetBody = targetKeyBodyFor(input.targetSelector);
      if (targetBody === null) return undefined;
      const matches = source.targets.filter(candidate => targetKeyBodyFor(candidate.key) === targetBody);
      return matches.length === 1 ? matches[0] : undefined;
    })();
  return {
    sourceSelector: input.sourceSelector,
    targetSelector: target?.key ?? '',
  };
};

interface ProjectionView {
  readonly status?: string;
  readonly reason?: string;
  readonly normalizedProfile?: unknown;
  readonly source?: ValueRecord;
  readonly preview?: ValueRecord;
  readonly gaps?: readonly unknown[];
  readonly keepOutPresets?: readonly unknown[];
  readonly activePresetId?: string | null;
  readonly activeKeepOuts?: readonly unknown[];
  readonly paint?: unknown;
  readonly canRender?: boolean;
}

interface SourceCandidateCatalogView {
  readonly sourceCandidates: readonly unknown[];
}

interface PreviewView extends SourceCandidateCatalogView {
  readonly lint: readonly unknown[];
}

export interface X4UiEditorLintFinding {
  readonly filePath: string;
  readonly severity: string;
  readonly code: string;
  readonly location: string;
  readonly message: string;
  readonly failureMode: string;
  readonly evidenceBoundary: string;
  readonly nextAction: string;
}

export type X4UiLintSummaryKind =
  | 'no-source-analyzed'
  | 'static-errors-found'
  | 'static-warnings-found'
  | 'static-checks-incomplete'
  | 'no-known-static-rule-violated';

export interface X4UiLintInspection {
  readonly sourceAnalyzed: boolean;
  readonly findings: readonly X4UiEditorLintFinding[];
  readonly incompleteFindingCount: number;
  readonly diagnosticCount: number;
  readonly verificationGapCount: number;
  readonly lintErrorCount: number;
  readonly truncated: boolean;
}

export interface X4UiLintSummary {
  readonly kind: X4UiLintSummaryKind;
  readonly label: string;
}

export type X4UiPreviewGeometryCategory = 'height' | 'width';

export interface X4UiPreviewGeometryPosition {
  readonly line: number;
  readonly column: number;
  readonly offset: number | null;
}

export interface X4UiPreviewGeometryRange {
  readonly start: X4UiPreviewGeometryPosition;
  readonly end: X4UiPreviewGeometryPosition;
}

export interface X4UiPreviewGeometryDiagnostic {
  readonly category: X4UiPreviewGeometryCategory;
  readonly status: string;
  readonly file: string;
  readonly range: X4UiPreviewGeometryRange;
  readonly reason: string;
  readonly nodeId?: string;
}

export type X4UiPreviewGeometryInspectionState = 'available' | 'empty' | 'unavailable' | 'incomplete';

export interface X4UiPreviewGeometryInspection {
  readonly state: X4UiPreviewGeometryInspectionState;
  readonly sceneStatus: string;
  readonly diagnostics: readonly X4UiPreviewGeometryDiagnostic[];
  readonly diagnosticCount: number;
  readonly incompleteCount: number;
  readonly detail: string;
}

const EMPTY_CORPUS_STATE: CorpusLoadState = Object.freeze({
  status: 'idle',
  result: null,
  detail: 'Configured corpus has not loaded yet.',
  colorStatus: 'idle',
  colorDetail: 'Configured canonical-default color evidence has not loaded yet.',
});

const asRecord = (value: unknown): ValueRecord | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ValueRecord
    : null
);

const asArray = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];

const stringValue = (value: unknown, fallback = 'unavailable'): string => (
  typeof value === 'string' && value.length > 0 ? value : fallback
);

const finiteValue = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const positiveValue = (value: unknown): number | null => {
  const number = finiteValue(value);
  return number !== null && number > 0 ? number : null;
};

export type X4UiSourceEditorScaleMode =
  | 'derived-from-x4-user-scale'
  | 'custom-effective-helper-scale';

export const X4_UI_SOURCE_EDITOR_SCALE_MODE_DERIVED: X4UiSourceEditorScaleMode = 'derived-from-x4-user-scale';
export const X4_UI_SOURCE_EDITOR_SCALE_MODE_CUSTOM: X4UiSourceEditorScaleMode = 'custom-effective-helper-scale';
export const X4_UI_SOURCE_EDITOR_DEFAULT_USER_SCALE = 1.05;

const X4_UI_SOURCE_EDITOR_REFERENCE_HEIGHT = 1080;

const positiveScaleResult = (value: number): number | null => (
  Number.isFinite(value) && value > 0 ? value : null
);

export const deriveX4UiEffectiveScale = (
  userScale: unknown,
  drawableHeight: unknown,
): number | null => {
  const user = positiveValue(userScale);
  const height = positiveValue(drawableHeight);
  if (user === null || height === null) return null;
  const directResult = (user * height) / X4_UI_SOURCE_EDITOR_REFERENCE_HEIGHT;
  if (Number.isFinite(directResult)) return positiveScaleResult(directResult);
  return positiveScaleResult(user * (height / X4_UI_SOURCE_EDITOR_REFERENCE_HEIGHT));
};

export const deriveX4UiUserScale = (
  effectiveScale: unknown,
  drawableHeight: unknown,
): number | null => {
  const effective = positiveValue(effectiveScale);
  const height = positiveValue(drawableHeight);
  if (effective === null || height === null) return null;
  const directResult = (effective * X4_UI_SOURCE_EDITOR_REFERENCE_HEIGHT) / height;
  if (Number.isFinite(directResult)) return positiveScaleResult(directResult);
  const result = (effective / height) * X4_UI_SOURCE_EDITOR_REFERENCE_HEIGHT;
  return positiveScaleResult(result);
};

const boolValue = (value: unknown): boolean => value === true;

const sourceIdentityKey = (identity: unknown): string => {
  const record = asRecord(identity);
  return [
    stringValue(record?.file, 'no-file'),
    stringValue(record?.sourcePath, 'no-source-path'),
    stringValue(record?.sha256, 'no-sha256'),
  ].join('|');
};

const builderSourceIdentityKey = (identity: unknown): string | null => {
  const record = asRecord(identity);
  if (typeof record?.file !== 'string' || typeof record.sha256 !== 'string') return null;
  return `${record.file}|${typeof record.sourcePath === 'string' ? record.sourcePath : ''}|${record.sha256}`;
};

const builderSourceLocationEquals = (
  left: X4UiBuilderNode['source'] | undefined,
  right: X4UiBuilderNode['source'] | undefined,
): boolean => left !== undefined
  && right !== undefined
  && left.file === right.file
  && left.sourcePath === right.sourcePath
  && left.start.line === right.start.line
  && left.start.column === right.start.column
  && left.start.offset === right.start.offset
  && left.end.line === right.end.line
  && left.end.column === right.end.column
  && left.end.offset === right.end.offset;

const sourceKeyFor = (candidate: ValueRecord, index: number): string => (
  [
    index,
    stringValue(candidate.path, 'unavailable'),
    sourceIdentityKey(candidate.sourceIdentity),
    String(boolValue(candidate.registered)),
    String(boolValue(candidate.editable)),
    stringValue(candidate.parseStatus, 'unavailable'),
    stringValue(candidate.verificationStatus, 'unavailable'),
  ].join(':')
);

const targetKeyFor = (candidate: ValueRecord, index: number): string => (
  `${index}:${stringValue(candidate.id, 'unavailable')}:${stringValue(candidate.kind, 'unavailable')}`
);

const targetKeyBodyFor = (key: string): string | null => {
  const separator = key.indexOf(':');
  if (separator <= 0) return null;
  const indexText = key.slice(0, separator);
  if (!/^(0|[1-9]\d*)$/.test(indexText)) return null;
  const index = Number(indexText);
  const body = key.slice(separator + 1);
  return Number.isSafeInteger(index) && index >= 0 && body.length > 0 ? body : null;
};

const sourceCandidatesFor = (catalog: SourceCandidateCatalogView): readonly SourceCandidateView[] => (
  catalog.sourceCandidates.map((value, index) => {
    const candidate = asRecord(value) ?? {};
    const targets = asArray(candidate.targets).flatMap((targetValue, targetIndex) => {
      const target = asRecord(targetValue);
      if (target === null) return [];
      return [{
        raw: target,
        key: targetKeyFor(target, targetIndex),
        label: stringValue(target.name, stringValue(target.id, `target ${targetIndex + 1}`)),
      }];
    });
    return {
      raw: candidate,
      index: finiteValue(candidate.index) ?? index,
      path: stringValue(candidate.path, `source ${index + 1}`),
      key: sourceKeyFor(candidate, index),
      sourceIdentity: candidate.sourceIdentity,
      targets,
    };
  })
);

/** A display subset of the exact catalog, never a new target or write authority. */
const menuTargetsFor = (source: SourceCandidateView | undefined): readonly TargetCandidateView[] => {
  if (source === undefined) return [];
  const ids = new Set(asArray(source.raw.menuTargetIds).filter((id): id is string => typeof id === 'string'));
  return source.targets.filter(target => typeof target.raw.id === 'string' && ids.has(target.raw.id));
};

const previewFor = (projection: X4UiEditorSessionProjection): PreviewView => {
  const view = projection as unknown as ProjectionView;
  const preview = asRecord(view.preview) ?? {};
  return {
    sourceCandidates: asArray(preview.sourceCandidates),
    lint: asArray(preview.lint),
  };
};

const projectionFor = (projection: X4UiEditorSessionProjection): ProjectionView => (
  projection as unknown as ProjectionView
);

const boundedCorpusTransport: X4UiCorpusTransport = async (input, init) => {
  const path = input.startsWith('/') ? input.split(/[?#]/, 1)[0] : '';
  const allowed: ReadonlySet<string> = new Set([
    X4_UI_CORPUS_STATUS_URL,
    X4_UI_CORPUS_MANIFEST_URL,
    X4_UI_CORPUS_FILE_URL,
  ]);
  if (!allowed.has(path)) {
    throw new Error('Configured corpus transport refused an unknown endpoint.');
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Configured corpus transport is unavailable in this browser.');
  }
  return globalThis.fetch(input, { signal: init?.signal, cache: 'no-store' });
};

export interface X4UiSourceEditorCorpusEnvelope {
  readonly core: unknown;
  readonly color: unknown;
}

export type X4UiSourceEditorCorpusBranchLoader = (input: {
  readonly transport: X4UiCorpusTransport;
  readonly signal: AbortSignal;
}) => Promise<unknown>;

export interface X4UiSourceEditorCorpusEnvelopeOptions {
  readonly transport: X4UiCorpusTransport;
  readonly signal: AbortSignal;
  readonly coreLoader?: X4UiSourceEditorCorpusBranchLoader;
  readonly colorLoader?: X4UiSourceEditorCorpusBranchLoader;
}

const rejectedCorpusLoaderResult = (authority: 'core' | 'color', signal: AbortSignal): unknown => ({
  ok: false,
  error: {
    code: signal.aborted ? 'aborted' : 'internal-error',
    stage: 'consistency',
    message: signal.aborted
      ? `Configured canonical ${authority} loader was aborted.`
      : `Configured canonical ${authority} loader rejected before producing evidence.`,
  },
});

export const loadX4UiSourceEditorCorpusEnvelope = async ({
  transport,
  signal,
  coreLoader,
  colorLoader,
}: X4UiSourceEditorCorpusEnvelopeOptions): Promise<X4UiSourceEditorCorpusEnvelope> => {
  const resolvedCoreLoader = coreLoader ?? ((input: { readonly transport: X4UiCorpusTransport; readonly signal: AbortSignal }) => loadConfiguredX4UiCorpusAssets(input));
  const resolvedColorLoader = colorLoader ?? ((input: { readonly transport: X4UiCorpusTransport; readonly signal: AbortSignal }) => loadConfiguredX4UiCorpusColorEvidence(input));
  const corePromise = Promise.resolve().then(() => resolvedCoreLoader({ transport, signal }));
  const colorPromise = Promise.resolve().then(() => resolvedColorLoader({ transport, signal }));
  const [core, color] = await Promise.allSettled([corePromise, colorPromise]);
  return {
    core: core.status === 'fulfilled' ? core.value : rejectedCorpusLoaderResult('core', signal),
    color: color.status === 'fulfilled' ? color.value : rejectedCorpusLoaderResult('color', signal),
  };
};

const defaultCorpusLoader: X4UiSourceEditorCorpusLoader = ({ signal }) => (
  loadX4UiSourceEditorCorpusEnvelope({ transport: boundedCorpusTransport, signal })
);

const defaultSurfaceFactory: X4UiCanvasSurfaceFactory = (width, height) => {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

type CorpusFailureStatus = Exclude<CorpusLoadStatus, 'idle' | 'loading' | 'canonical'>;

interface CorpusFailureClassification {
  readonly status: CorpusFailureStatus;
  readonly detail: string;
  readonly aborted: boolean;
}

interface OwnDataField {
  readonly present: boolean;
  readonly valid: boolean;
  readonly value?: unknown;
}

const ownEnumerableDataField = (value: unknown, key: string): OwnDataField => {
  if (value === null || typeof value !== 'object') return { present: false, valid: false };
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return { present: false, valid: true };
    if (!descriptor.enumerable || !('value' in descriptor)) return { present: true, valid: false };
    return { present: true, valid: true, value: descriptor.value };
  } catch {
    return { present: true, valid: false };
  }
};

const ownDataString = (value: unknown, key: string): string | undefined => {
  const field = ownEnumerableDataField(value, key);
  return field.present && field.valid && typeof field.value === 'string' && field.value.length > 0
    ? field.value
    : undefined;
};

const ownPlainRecord = (value: unknown): ValueRecord | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value as ValueRecord : null;
  } catch {
    return null;
  }
};

const usableOwnDataString = (value: unknown, key: string): string | undefined => {
  const text = ownDataString(value, key);
  return text !== undefined && text.trim().length > 0 ? text : undefined;
};

const previewGeometryPositionFor = (value: unknown): X4UiPreviewGeometryPosition | null => {
  if (ownPlainRecord(value) === null) return null;
  const lineField = ownEnumerableDataField(value, 'line');
  const columnField = ownEnumerableDataField(value, 'column');
  if (!lineField.present || !lineField.valid || !columnField.present || !columnField.valid) return null;
  const line = finiteValue(lineField.value);
  const column = finiteValue(columnField.value);
  if (line === null || column === null || !Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 0) return null;
  const offsetField = ownEnumerableDataField(value, 'offset');
  let offset: number | null = null;
  if (offsetField.present) {
    if (!offsetField.valid) return null;
    const parsedOffset = finiteValue(offsetField.value);
    if (parsedOffset === null || !Number.isInteger(parsedOffset) || parsedOffset < 0) return null;
    offset = parsedOffset;
  }
  return { line, column, offset };
};

const previewGeometryRangeFor = (source: unknown): X4UiPreviewGeometryRange | null => {
  if (ownPlainRecord(source) === null) return null;
  const file = usableOwnDataString(source, 'file');
  if (file === undefined) return null;
  const rangeField = ownEnumerableDataField(source, 'range');
  if (rangeField.present && !rangeField.valid) return null;
  const range = rangeField.present ? ownPlainRecord(rangeField.value) : source;
  if (range === null) return null;
  const startField = ownEnumerableDataField(range, 'start');
  const endField = ownEnumerableDataField(range, 'end');
  if (!startField.present || !startField.valid || !endField.present || !endField.valid) return null;
  const start = previewGeometryPositionFor(startField.value);
  const end = previewGeometryPositionFor(endField.value);
  if (start === null || end === null) return null;
  if (end.line < start.line || (end.line === start.line && end.column < start.column)) return null;
  if (start.offset !== null && end.offset !== null && end.offset < start.offset) return null;
  return { start, end };
};

const PREVIEW_GEOMETRY_SCENE_STATUSES = new Set(['partial', 'projected']);

const hasPreviewGeometryVerification = (value: unknown): boolean => {
  if (ownPlainRecord(value) === null) return false;
  const gameField = ownEnumerableDataField(value, 'game');
  const gameVerifiedField = ownEnumerableDataField(value, 'gameVerified');
  return gameField.present
    && gameField.valid
    && gameField.value === X4_UI_EDITOR_SESSION_GAME_TRUTH
    && gameVerifiedField.present
    && gameVerifiedField.valid
    && gameVerifiedField.value === false;
};

const unavailablePreviewGeometryInspection = (detail: string, sceneStatus = 'unavailable'): X4UiPreviewGeometryInspection => ({
  state: 'unavailable',
  sceneStatus,
  diagnostics: [],
  diagnosticCount: 0,
  incompleteCount: 0,
  detail,
});

const previewGeometryPositionKey = (position: X4UiPreviewGeometryPosition): string => (
  `${position.line}:${position.column}:${position.offset === null ? '' : position.offset}`
);

const previewGeometryDiagnosticKey = (diagnostic: X4UiPreviewGeometryDiagnostic): string => JSON.stringify([
  diagnostic.nodeId ?? '',
  diagnostic.category,
  diagnostic.status,
  diagnostic.file,
  previewGeometryPositionKey(diagnostic.range.start),
  previewGeometryPositionKey(diagnostic.range.end),
  diagnostic.reason,
]);

const comparePreviewGeometryText = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

const comparePreviewGeometryPosition = (left: X4UiPreviewGeometryPosition, right: X4UiPreviewGeometryPosition): number => (
  left.line - right.line
  || left.column - right.column
  || (left.offset ?? Number.MAX_SAFE_INTEGER) - (right.offset ?? Number.MAX_SAFE_INTEGER)
);

const comparePreviewGeometryDiagnostics = (
  left: X4UiPreviewGeometryDiagnostic,
  right: X4UiPreviewGeometryDiagnostic,
): number => (
  comparePreviewGeometryText(left.file, right.file)
  || comparePreviewGeometryPosition(left.range.start, right.range.start)
  || comparePreviewGeometryPosition(left.range.end, right.range.end)
  || comparePreviewGeometryText(left.category, right.category)
  || comparePreviewGeometryText(left.status, right.status)
  || comparePreviewGeometryText(left.nodeId ?? '', right.nodeId ?? '')
  || comparePreviewGeometryText(left.reason, right.reason)
);

export const inspectX4UiPreviewGeometry = (sceneResult: unknown): X4UiPreviewGeometryInspection => {
  const resultRecord = ownPlainRecord(sceneResult);
  if (resultRecord === null) return unavailablePreviewGeometryInspection('Scene result evidence is unavailable or malformed.');
  const resultStatusField = ownEnumerableDataField(resultRecord, 'status');
  if (!resultStatusField.present || !resultStatusField.valid || typeof resultStatusField.value !== 'string') {
    return unavailablePreviewGeometryInspection('Scene result evidence has no usable own-data status.');
  }
  const resultStatus = resultStatusField.value;
  if (!PREVIEW_GEOMETRY_SCENE_STATUSES.has(resultStatus)) {
    return unavailablePreviewGeometryInspection(`Scene result evidence is ${resultStatus}; source-linked geometry diagnostics are unavailable.`, resultStatus);
  }
  const verificationField = ownEnumerableDataField(resultRecord, 'verification');
  if (!verificationField.present || !verificationField.valid || !hasPreviewGeometryVerification(verificationField.value)) {
    return unavailablePreviewGeometryInspection('Scene result verification is missing or malformed.', resultStatus);
  }
  const sceneField = ownEnumerableDataField(resultRecord, 'scene');
  if (!sceneField.present || !sceneField.valid) {
    return unavailablePreviewGeometryInspection('Scene result has no usable own-data nested Scene.', resultStatus);
  }
  const sceneRecord = ownPlainRecord(sceneField.value);
  if (sceneRecord === null) {
    return unavailablePreviewGeometryInspection('Scene result nested Scene is unavailable or malformed.', resultStatus);
  }
  const sceneStatusField = ownEnumerableDataField(sceneRecord, 'status');
  if (!sceneStatusField.present || !sceneStatusField.valid || typeof sceneStatusField.value !== 'string' || !PREVIEW_GEOMETRY_SCENE_STATUSES.has(sceneStatusField.value)) {
    return unavailablePreviewGeometryInspection('Nested Scene has no usable own-data projected/partial status.', resultStatus);
  }
  const sceneStatus = sceneStatusField.value;
  const gapsField = ownEnumerableDataField(sceneRecord, 'gaps');
  if (!gapsField.present || !gapsField.valid || !Array.isArray(gapsField.value)) {
    return unavailablePreviewGeometryInspection('Scene evidence has no usable own-data gap list.', sceneStatus);
  }

  const diagnostics: X4UiPreviewGeometryDiagnostic[] = [];
  let incompleteCount = 0;
  const gapValues = gapsField.value;
  for (let gapIndex = 0; gapIndex < gapValues.length; gapIndex += 1) {
    const gapField = ownEnumerableDataField(gapValues, String(gapIndex));
    if (!gapField.present || !gapField.valid) {
      incompleteCount += 1;
      continue;
    }
    const gapValue = gapField.value;
    if (gapValue === null || typeof gapValue !== 'object' || Array.isArray(gapValue)) {
      incompleteCount += 1;
      continue;
    }
    const categoryField = ownEnumerableDataField(gapValue, 'category');
    if (!categoryField.present) continue;
    if (!categoryField.valid) {
      incompleteCount += 1;
      continue;
    }
    if (categoryField.value !== 'height' && categoryField.value !== 'width') continue;
    if (ownPlainRecord(gapValue) === null) {
      incompleteCount += 1;
      continue;
    }
    const status = usableOwnDataString(gapValue, 'status');
    const reason = usableOwnDataString(gapValue, 'reason');
    const sourceField = ownEnumerableDataField(gapValue, 'source');
    const source = sourceField.present && sourceField.valid ? sourceField.value : null;
    const range = previewGeometryRangeFor(source);
    if (status === undefined || reason === undefined || range === null) {
      incompleteCount += 1;
      continue;
    }
    const nodeIdField = ownEnumerableDataField(gapValue, 'nodeId');
    if (nodeIdField.present && (
      !nodeIdField.valid
      || typeof nodeIdField.value !== 'string'
      || nodeIdField.value.trim().length === 0
    )) {
      incompleteCount += 1;
      continue;
    }
    const nodeId = nodeIdField.present ? nodeIdField.value as string : undefined;
    const diagnostic: X4UiPreviewGeometryDiagnostic = {
      category: categoryField.value,
      status,
      file: usableOwnDataString(source, 'file') ?? 'unavailable',
      range,
      reason,
      ...(nodeId === undefined ? {} : { nodeId }),
    };
    if (diagnostic.file === 'unavailable') {
      incompleteCount += 1;
      continue;
    }
    diagnostics.push(diagnostic);
  }

  const uniqueDiagnostics: X4UiPreviewGeometryDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  for (const diagnostic of diagnostics) {
    const key = previewGeometryDiagnosticKey(diagnostic);
    if (diagnosticKeys.has(key)) continue;
    diagnosticKeys.add(key);
    uniqueDiagnostics.push(diagnostic);
  }
  uniqueDiagnostics.sort(comparePreviewGeometryDiagnostics);
  const diagnosticCount = uniqueDiagnostics.length;
  const state: X4UiPreviewGeometryInspectionState = incompleteCount > 0
    ? 'incomplete'
    : diagnosticCount > 0
      ? 'available'
      : 'empty';
  return {
    state,
    sceneStatus,
    diagnostics: uniqueDiagnostics,
    diagnosticCount,
    incompleteCount,
    detail: incompleteCount > 0
      ? `${incompleteCount} source-linked height/width candidate${incompleteCount === 1 ? '' : 's'} were malformed and are not rendered.`
      : diagnosticCount > 0
        ? `${diagnosticCount} source-linked height/width diagnostic${diagnosticCount === 1 ? '' : 's'} accepted in stable source order.`
        : 'No source-linked height/width diagnostics are available in this Scene.',
  };
};

const corpusFailure = (value: unknown, fallbackDetail = 'Configured corpus evidence was not accepted.'): CorpusFailureClassification => {
  let failure: unknown;
  for (const key of ['failure', 'refusal', 'error']) {
    const field = ownEnumerableDataField(value, key);
    if (field.present && field.valid) {
      failure = field.value;
      break;
    }
    if (field.present && !field.valid) {
      return { status: 'refused', detail: fallbackDetail, aborted: false };
    }
  }
  const code = (ownDataString(failure, 'code') ?? ownDataString(value, 'code') ?? 'refused').toLowerCase();
  const detail = ownDataString(failure, 'message') ?? ownDataString(value, 'message') ?? fallbackDetail;
  if (code === 'aborted') return { status: 'unavailable', detail, aborted: true };
  if (code === 'offline' || code === 'network' || code === 'file-http' || code === 'manifest-http' || code === 'status-http'
    || code === 'status-unavailable' || code === 'manifest-unavailable' || code === 'manifest-pending'
    || code === 'internal-error') {
    return { status: 'unavailable', detail, aborted: false };
  }
  if (code === 'stale' || code === 'generation-drift' || code === 'status-stale') {
    return { status: 'stale', detail, aborted: false };
  }
  if (code.includes('malformed') || code === 'content-type' || code === 'unexpected-content-type') {
    return { status: 'malformed', detail, aborted: false };
  }
  return { status: 'refused', detail, aborted: false };
};

type CorpusEnvelopeSnapshot =
  | { readonly kind: 'direct' }
  | { readonly kind: 'envelope'; readonly core: unknown; readonly colorPresent: boolean; readonly color?: unknown }
  | { readonly kind: 'refused'; readonly detail: string };

const snapshotCorpusEnvelope = (value: unknown): CorpusEnvelopeSnapshot => {
  if (value === null || typeof value !== 'object') return { kind: 'direct' };
  try {
    if (Reflect.getPrototypeOf(value) !== Object.prototype) {
      return { kind: 'refused', detail: 'Configured corpus envelope must have the plain object prototype.' };
    }
    const keys = Reflect.ownKeys(value);
    const envelopeShaped = keys.some(key => key === 'core' || key === 'color');
    if (!envelopeShaped) return { kind: 'direct' };
    if (!keys.includes('core') || keys.some(key => key !== 'core' && key !== 'color')) {
      return { kind: 'refused', detail: 'Configured corpus envelope has inherited, missing, or decorated authority fields.' };
    }
    const coreDescriptor = Reflect.getOwnPropertyDescriptor(value, 'core');
    if (coreDescriptor === undefined || !coreDescriptor.enumerable || !('value' in coreDescriptor)) {
      return { kind: 'refused', detail: 'Configured corpus core authority must be an own enumerable data field.' };
    }
    const colorPresent = keys.includes('color');
    if (!colorPresent) return { kind: 'envelope', core: coreDescriptor.value, colorPresent: false };
    const colorDescriptor = Reflect.getOwnPropertyDescriptor(value, 'color');
    if (colorDescriptor === undefined || !colorDescriptor.enumerable || !('value' in colorDescriptor)) {
      return { kind: 'refused', detail: 'Configured corpus color authority must be an own enumerable data field.' };
    }
    return {
      kind: 'envelope',
      core: coreDescriptor.value,
      colorPresent: true,
      color: colorDescriptor.value,
    };
  } catch {
    return { kind: 'refused', detail: 'Configured corpus envelope reflection was refused.' };
  }
};

const canonicalCoreSuccess = (value: unknown): value is X4UiCorpusCanonicalSuccess => {
  try {
    return isX4UiCorpusCanonicalSuccess(value);
  } catch {
    return false;
  }
};

const canonicalColorSuccess = (value: unknown): value is X4UiCorpusCanonicalColorSuccess => {
  try {
    return isX4UiCorpusCanonicalColorSuccess(value);
  } catch {
    return false;
  }
};

export interface X4UiCorpusLoadResultClassification {
  readonly status: CorpusLoadStatus | 'ignored';
  readonly accepted: boolean;
  readonly result: X4UiCorpusCanonicalSuccess | null;
  readonly detail: string;
  readonly colorStatus: CorpusLoadStatus;
  readonly colorEvidence?: X4UiCorpusCanonicalColorSuccess;
  readonly colorDetail: string;
}

export const classifyX4UiCorpusLoadResult = (input: {
  readonly result: unknown;
  readonly loaderIssued: boolean;
  readonly signalAborted: boolean;
  readonly requestActive: boolean;
  readonly requestGeneration: number;
  readonly currentGeneration: number;
}): X4UiCorpusLoadResultClassification => {
  const ignored = (): X4UiCorpusLoadResultClassification => ({
    status: 'ignored',
    accepted: false,
    result: null,
    detail: 'Ignored aborted, late, or non-loader corpus evidence.',
    colorStatus: 'unavailable',
    colorDetail: 'Ignored aborted, late, or non-loader canonical-default color evidence.',
  });
  if (!input.loaderIssued || input.signalAborted || !input.requestActive || input.requestGeneration !== input.currentGeneration) {
    return ignored();
  }

  const snapshot = snapshotCorpusEnvelope(input.result);
  if (snapshot.kind === 'refused') {
    return {
      status: 'refused',
      accepted: false,
      result: null,
      detail: snapshot.detail,
      colorStatus: 'refused',
      colorDetail: snapshot.detail,
    };
  }

  if (snapshot.kind === 'direct') {
    if (canonicalCoreSuccess(input.result)) {
      return {
        status: 'canonical',
        accepted: true,
        result: input.result,
        detail: 'Loader-issued canonical X4 corpus accepted.',
        colorStatus: 'unavailable',
        colorDetail: 'Configured canonical-default color evidence was not supplied.',
      };
    }
    const failure = corpusFailure(input.result);
    if (failure.aborted) return ignored();
    return {
      status: failure.status,
      accepted: false,
      result: null,
      detail: failure.detail,
      colorStatus: 'unavailable',
      colorDetail: 'Configured canonical-default color evidence was not supplied.',
    };
  }

  const coreAccepted = canonicalCoreSuccess(snapshot.core);
  const coreFailure = coreAccepted
    ? undefined
    : corpusFailure(snapshot.core, 'Configured canonical core evidence was not accepted.');
  const colorAccepted = snapshot.colorPresent && canonicalColorSuccess(snapshot.color);
  const colorFailure = snapshot.colorPresent && !colorAccepted
    ? corpusFailure(snapshot.color, 'Configured canonical-default color evidence was not accepted.')
    : undefined;
  if (coreFailure?.aborted) return ignored();

  if (!coreAccepted) {
    return {
      status: coreFailure?.status ?? 'refused',
      accepted: false,
      result: null,
      detail: coreFailure?.detail ?? 'Configured canonical core evidence was not accepted.',
      colorStatus: colorAccepted ? 'canonical' : colorFailure?.status ?? 'unavailable',
      colorDetail: colorAccepted
        ? 'Loader-issued canonical-default color evidence was accepted but withheld because canonical core evidence is unavailable.'
        : colorFailure?.detail ?? 'Configured canonical-default color evidence was not supplied.',
    };
  }

  if (colorAccepted) {
    return {
      status: 'canonical',
      accepted: true,
      result: snapshot.core,
      detail: 'Loader-issued canonical X4 corpus accepted.',
      colorStatus: 'canonical',
      colorEvidence: snapshot.color,
      colorDetail: 'Loader-issued canonical-default color evidence accepted.',
    };
  }

  return {
    status: 'canonical',
    accepted: true,
    result: snapshot.core,
    detail: 'Loader-issued canonical X4 corpus accepted.',
    colorStatus: colorFailure?.status ?? 'unavailable',
    colorDetail: colorFailure?.detail ?? 'Configured canonical-default color evidence was not supplied.',
  };
};

const profileScale = (profile: X4UiEditorProfileControls): number | null => (
  positiveValue(asRecord(profile)?.uiScale)
);

const formatNumber = (value: unknown): string => {
  const number = finiteValue(value);
  return number === null ? 'unavailable' : String(number);
};

const formatCanvasZoomPercent = (value: number): string => {
  if (!Number.isFinite(value)) return 'unavailable';
  return String(Math.round(value * 10) / 10);
};

const findingLocation = (finding: ValueRecord): string | null => {
  const locationValue = finding.sourceLocation ?? finding.location ?? finding.source;
  if (typeof locationValue === 'string' && locationValue.trim().length > 0) return locationValue;
  const location = asRecord(locationValue);
  const path = typeof location?.path === 'string' && location.path.trim().length > 0
    ? location.path
    : typeof location?.file === 'string' && location.file.trim().length > 0
      ? location.file
      : null;
  if (path === null) return null;
  const line = finiteValue(location?.line) ?? finiteValue(finding.line);
  const column = finiteValue(location?.column) ?? finiteValue(finding.column);
  if (line === null) return path;
  return `${path}:${line}${column === null ? '' : `:${column}`}`;
};

const requiredFindingValue = (finding: ValueRecord, key: string): string | null => {
  const value = finding[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

const normalizeFinding = (finding: ValueRecord, filePath: string): X4UiEditorLintFinding | null => {
  const location = findingLocation(finding);
  const severity = requiredFindingValue(finding, 'severity');
  const code = requiredFindingValue(finding, 'code');
  const message = requiredFindingValue(finding, 'message');
  const failureMode = requiredFindingValue(finding, 'failureMode');
  const evidenceBoundary = requiredFindingValue(finding, 'evidenceBoundary');
  const nextAction = requiredFindingValue(finding, 'nextAction');
  if (location === null || severity === null || code === null || message === null || failureMode === null || evidenceBoundary === null || nextAction === null) return null;
  return {
    filePath,
    severity,
    code,
    location,
    message,
    failureMode,
    evidenceBoundary,
    nextAction,
  };
};

const lintInspectionFor = (preview: PreviewView): X4UiLintInspection => {
  const findings: X4UiEditorLintFinding[] = [];
  const findingKeys = new Set<string>();
  let incompleteFindingCount = 0;
  let diagnosticCount = 0;
  let verificationGapCount = 0;
  let lintErrorCount = 0;
  let truncated = false;
  for (const fileValue of preview.lint) {
    const file = asRecord(fileValue) ?? {};
    const lint = asRecord(file.lint);
    const filePath = stringValue(file.path, 'source file unavailable');
    if (file.diagnostics !== undefined && !Array.isArray(file.diagnostics)) incompleteFindingCount += 1;
    if (file.verificationGaps !== undefined && !Array.isArray(file.verificationGaps)) incompleteFindingCount += 1;
    const diagnostics = asArray(file.diagnostics);
    const verificationGaps = asArray(file.verificationGaps);
    diagnosticCount += diagnostics.length;
    verificationGapCount += verificationGaps.length;
    if (file.lintError !== undefined && file.lintError !== null) lintErrorCount += 1;
    const lintSummary = asRecord(lint?.x4UiSummary) ?? asRecord(file.x4UiSummary);
    const unverifiedCount = finiteValue(lintSummary?.unverifiedCount) ?? 0;
    const truncatedCount = finiteValue(lintSummary?.truncatedCount) ?? 0;
    verificationGapCount += unverifiedCount;
    truncated = truncated || file.truncated === true || lint?.truncated === true || truncatedCount > 0;
    if (lint === null) {
      incompleteFindingCount += 1;
      continue;
    }
    if (!Array.isArray(lint.findings)) {
      incompleteFindingCount += 1;
      continue;
    }
    const normalizedFindings = lint.findings;
    for (const findingValueRaw of normalizedFindings) {
      const finding = asRecord(findingValueRaw);
      if (finding === null) {
        incompleteFindingCount += 1;
        continue;
      }
      const normalized = normalizeFinding(finding, filePath);
      if (normalized === null) {
        incompleteFindingCount += 1;
        continue;
      }
      const key = [
        normalized.filePath,
        normalizedLintToken(normalized.severity),
        normalized.code,
        normalized.location,
        normalized.message,
        normalized.failureMode,
        normalized.evidenceBoundary,
        normalized.nextAction,
      ].join('\u001f');
      if (findingKeys.has(key)) continue;
      findingKeys.add(key);
      findings.push(normalized);
    }
  }
  return {
    sourceAnalyzed: preview.lint.length > 0,
    findings,
    incompleteFindingCount,
    diagnosticCount,
    verificationGapCount,
    lintErrorCount,
    truncated,
  };
};

export const inspectX4UiLint = (preview: { readonly lint: readonly unknown[] }): X4UiLintInspection => (
  lintInspectionFor({ sourceCandidates: [], lint: preview.lint })
);

export const classifyX4UiLintState = (inspection: X4UiLintInspection): X4UiLintSummary => {
  if (!inspection.sourceAnalyzed) return { kind: 'no-source-analyzed', label: 'No source analyzed' };
  const severities = inspection.findings.map(finding => finding.severity.trim().toLowerCase());
  if (severities.some(severity => severity === 'error' || severity === 'fatal')) {
    return { kind: 'static-errors-found', label: 'Static errors found' };
  }
  if (severities.some(severity => severity === 'warning' || severity === 'warn')) {
    return { kind: 'static-warnings-found', label: 'Static warnings found' };
  }
  if (inspection.incompleteFindingCount > 0
    || inspection.diagnosticCount > 0
    || inspection.verificationGapCount > 0
    || inspection.lintErrorCount > 0
  || inspection.truncated) {
    return { kind: 'static-checks-incomplete', label: 'Static checks incomplete' };
  }
  return { kind: 'no-known-static-rule-violated', label: 'No known static rule violated' };
};

const normalizedLintToken = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export const isBlockingX4UiAddTableFinding = (finding: X4UiEditorLintFinding): boolean => {
  const code = normalizedLintToken(finding.code);
  const severity = normalizedLintToken(finding.severity);
  const evidence = normalizedLintToken(finding.evidenceBoundary);
  const failureMode = normalizedLintToken(finding.failureMode);
  return code === normalizedLintToken('x4-ui.add-table-column-limit')
    && severity === 'error'
    && failureMode.includes('entireframe')
    && evidence.includes('24failed');
};

const keepOutEvidence = (member: ValueRecord | null): string => {
  const entry = asRecord(member?.entry);
  const geometry = asRecord(entry?.geometry);
  if (geometry?.kind === 'horizontal-guide') return `y=${formatNumber(geometry.y)}`;
  if (geometry?.kind === 'vertical-guide') return `x=${formatNumber(geometry.x)}`;
  if (geometry?.kind === 'polygon') {
    const provenance = asRecord(entry?.provenance);
    const screenshot = asRecord(provenance?.screenshot);
    return `screenshot-calibrated polygon · ${stringValue(screenshot?.hash, 'screenshot hash unavailable')}`;
  }
  return 'unavailable/unmeasured; no rectangle inferred';
};

const keepOutMemberFor = (presetValue: unknown, entryId: string): ValueRecord | null => {
  const preset = asRecord(presetValue);
  const member = asArray(preset?.members).find(value => asRecord(value)?.entryId === entryId);
  return asRecord(member);
};

export const toggleX4UiKeepOutEntry = (
  activePresetId: string | null,
  originatingPresetId: string,
  enabledEntryIds: readonly string[],
  entryId: string,
  presets: readonly { readonly id: string; readonly members: readonly { readonly entryId: string; readonly applicability?: string }[] }[],
): readonly string[] => {
  if (activePresetId === null || originatingPresetId !== activePresetId) return enabledEntryIds;
  const activePreset = presets.find(preset => preset.id === activePresetId);
  const activeMember = activePreset?.members.find(member => member.entryId === entryId);
  if (activeMember === undefined || activeMember.applicability !== undefined && activeMember.applicability !== 'applicable') return enabledEntryIds;
  return enabledEntryIds.includes(entryId)
    ? enabledEntryIds.filter(value => value !== entryId)
    : [...enabledEntryIds, entryId];
};

export const isX4UiKeepOutEntryChecked = (
  activePresetId: string | null,
  presetId: string,
  enabledEntryIds: readonly string[],
  entryId: string,
): boolean => activePresetId === presetId && enabledEntryIds.includes(entryId);

export interface X4UiManualCalibrationPointDraft {
  readonly x: string;
  readonly y: string;
}

export interface X4UiManualCalibrationDraft {
  readonly stableId: string;
  readonly context: string;
  readonly sourceNote: string;
  readonly screenshotHash: string;
  readonly profile: string;
  readonly drawableLeft: string;
  readonly drawableTop: string;
  readonly drawableWidth: string;
  readonly drawableHeight: string;
  readonly points: readonly X4UiManualCalibrationPointDraft[];
}

export interface X4UiManualCalibrationRow {
  readonly rowId: string;
  readonly draft: X4UiManualCalibrationDraft;
}

export interface X4UiManualCalibrationState {
  readonly draft: X4UiManualCalibrationDraft;
  readonly rows: readonly X4UiManualCalibrationRow[];
  readonly enabledManualRowIds: readonly string[];
}

export type X4UiManualCalibrationDraftField = Exclude<keyof X4UiManualCalibrationDraft, 'points'>;

export type X4UiManualCalibrationDraftRefusal = {
  readonly accepted: false;
  readonly reason: 'malformed-draft' | 'invalid-number';
  readonly message: string;
};

export type X4UiManualCalibrationDraftResult =
  | { readonly accepted: true; readonly input: KeepOutCalibrationInput }
  | X4UiManualCalibrationDraftRefusal;

export type X4UiManualCalibrationSessionRefusalReason =
  | X4UiManualCalibrationDraftRefusal['reason']
  | 'duplicate-stable-id';

export interface X4UiManualCalibrationSessionInput {
  readonly manualCalibrations: readonly KeepOutCalibrationInput[];
  readonly enabledManualEntryIds: readonly string[];
  readonly acceptedRowIds: readonly string[];
  readonly refusedRows: readonly {
    readonly rowId: string;
    readonly reason: X4UiManualCalibrationSessionRefusalReason;
    readonly message: string;
  }[];
}

const manualCalibrationInitialPoints = (): readonly X4UiManualCalibrationPointDraft[] => [
  { x: '0', y: '0' },
  { x: '100', y: '0' },
  { x: '0', y: '100' },
];

export const createX4UiManualCalibrationDraft = (): X4UiManualCalibrationDraft => ({
  stableId: '',
  context: '',
  sourceNote: '',
  screenshotHash: '',
  profile: '',
  drawableLeft: '0',
  drawableTop: '0',
  drawableWidth: String(X4_UI_EDITOR_DEFAULT_PROFILE.drawable.width),
  drawableHeight: String(X4_UI_EDITOR_DEFAULT_PROFILE.drawable.height),
  points: manualCalibrationInitialPoints(),
});

export const createX4UiManualCalibrationState = (): X4UiManualCalibrationState => ({
  draft: createX4UiManualCalibrationDraft(),
  rows: [],
  enabledManualRowIds: [],
});

const copyManualCalibrationDraft = (draft: X4UiManualCalibrationDraft): X4UiManualCalibrationDraft => ({
  ...draft,
  points: draft.points.map(point => ({ x: point.x, y: point.y })),
});

export const updateX4UiManualCalibrationDraft = (
  draft: X4UiManualCalibrationDraft,
  field: X4UiManualCalibrationDraftField,
  value: string,
): X4UiManualCalibrationDraft => draft[field] === value
  ? draft
  : { ...draft, [field]: value } as X4UiManualCalibrationDraft;

export const updateX4UiManualCalibrationPoint = (
  draft: X4UiManualCalibrationDraft,
  index: number,
  axis: 'x' | 'y',
  value: string,
): X4UiManualCalibrationDraft => {
  if (!Number.isSafeInteger(index) || index < 0 || index >= draft.points.length) return draft;
  const point = draft.points[index];
  if (point[axis] === value) return draft;
  const points = draft.points.map((candidate, candidateIndex) => candidateIndex === index
    ? { ...candidate, [axis]: value }
    : candidate);
  return { ...draft, points };
};

export const addX4UiManualCalibrationPoint = (
  draft: X4UiManualCalibrationDraft,
): X4UiManualCalibrationDraft => ({
  ...draft,
  points: [...draft.points, { x: '', y: '' }],
});

export const removeX4UiManualCalibrationPoint = (
  draft: X4UiManualCalibrationDraft,
  index: number,
): X4UiManualCalibrationDraft => {
  if (!Number.isSafeInteger(index) || index < 0 || index >= draft.points.length) return draft;
  return {
    ...draft,
    points: [...draft.points.slice(0, index), ...draft.points.slice(index + 1)],
  };
};

const manualCalibrationNumber = (
  raw: unknown,
  label: string,
): { readonly accepted: true; readonly value: number } | { readonly accepted: false; readonly message: string } => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { accepted: false, message: `${label} must be a non-empty finite number.` };
  }
  const value = Number(raw);
  return Number.isFinite(value)
    ? { accepted: true, value }
    : { accepted: false, message: `${label} must be a non-empty finite number.` };
};

export const parseX4UiManualCalibrationDraft = (
  draft: X4UiManualCalibrationDraft,
): X4UiManualCalibrationDraftResult => {
  try {
    const numericFields = [
      ['drawable left', draft.drawableLeft],
      ['drawable top', draft.drawableTop],
      ['drawable width', draft.drawableWidth],
      ['drawable height', draft.drawableHeight],
    ] as const;
    const numericValues: number[] = [];
    for (const [label, raw] of numericFields) {
      const result = manualCalibrationNumber(raw, label);
      if ('message' in result) return { accepted: false, reason: 'invalid-number', message: result.message };
      numericValues.push(result.value);
    }
    if (!Array.isArray(draft.points)) {
      return { accepted: false, reason: 'malformed-draft', message: 'Manual calibration points must be a dense draft array.' };
    }
    const points: { readonly x: number; readonly y: number }[] = [];
    for (let index = 0; index < draft.points.length; index += 1) {
      const point = draft.points[index];
      if (point === undefined || point === null || typeof point !== 'object') {
        return { accepted: false, reason: 'malformed-draft', message: `Manual calibration point ${index + 1} is malformed.` };
      }
      const x = manualCalibrationNumber(point.x, `point ${index + 1} x`);
      if ('message' in x) return { accepted: false, reason: 'invalid-number', message: x.message };
      const y = manualCalibrationNumber(point.y, `point ${index + 1} y`);
      if ('message' in y) return { accepted: false, reason: 'invalid-number', message: y.message };
      points.push({ x: x.value, y: y.value });
    }
    if (typeof draft.stableId !== 'string'
      || typeof draft.context !== 'string'
      || typeof draft.sourceNote !== 'string'
      || typeof draft.screenshotHash !== 'string'
      || typeof draft.profile !== 'string') {
      return { accepted: false, reason: 'malformed-draft', message: 'Manual calibration text fields must be strings.' };
    }
    return {
      accepted: true,
      input: {
        stableId: draft.stableId,
        context: draft.context,
        sourceNote: draft.sourceNote,
        screenshotHash: draft.screenshotHash,
        profile: draft.profile,
        drawableBounds: {
          left: numericValues[0],
          top: numericValues[1],
          width: numericValues[2],
          height: numericValues[3],
        },
        points,
      },
    };
  } catch {
    return { accepted: false, reason: 'malformed-draft', message: 'Manual calibration draft was malformed.' };
  }
};

const nextManualCalibrationRowId = (rows: readonly X4UiManualCalibrationRow[]): string => {
  const used = new Set(rows.map(row => row.rowId));
  let ordinal = rows.length + 1;
  let rowId = `manual-calibration-row-${ordinal}`;
  while (used.has(rowId)) {
    ordinal += 1;
    rowId = `manual-calibration-row-${ordinal}`;
  }
  return rowId;
};

export const addX4UiManualCalibrationDraft = (
  state: X4UiManualCalibrationState,
  draft = state.draft,
): X4UiManualCalibrationState => ({
  draft: createX4UiManualCalibrationDraft(),
  rows: [
    ...state.rows,
    { rowId: nextManualCalibrationRowId(state.rows), draft: copyManualCalibrationDraft(draft) },
  ],
  enabledManualRowIds: state.enabledManualRowIds,
});

const manualCalibrationRowStableId = (row: X4UiManualCalibrationRow): string => row.draft.stableId;

export const setX4UiManualCalibrationRowEnabled = (
  state: X4UiManualCalibrationState,
  rowId: string,
  enabled: boolean,
): X4UiManualCalibrationState => {
  const row = state.rows.find(candidate => candidate.rowId === rowId);
  if (row === undefined || row.draft.stableId.trim().length === 0) return state;
  const alreadyEnabled = state.enabledManualRowIds.includes(rowId);
  if (alreadyEnabled === enabled) return state;
  return {
    ...state,
    enabledManualRowIds: enabled
      ? [...state.enabledManualRowIds, rowId]
      : state.enabledManualRowIds.filter(value => value !== rowId),
  };
};

export const toggleX4UiManualCalibrationRow = (
  state: X4UiManualCalibrationState,
  rowId: string,
): X4UiManualCalibrationState => {
  const row = state.rows.find(candidate => candidate.rowId === rowId);
  if (row === undefined || row.draft.stableId.trim().length === 0) return state;
  return setX4UiManualCalibrationRowEnabled(
    state,
    rowId,
    !state.enabledManualRowIds.includes(rowId),
  );
};

export const removeX4UiManualCalibrationRow = (
  state: X4UiManualCalibrationState,
  rowId: string,
): X4UiManualCalibrationState => {
  const rowIndex = state.rows.findIndex(candidate => candidate.rowId === rowId);
  if (rowIndex < 0) return state;
  const rows = [...state.rows.slice(0, rowIndex), ...state.rows.slice(rowIndex + 1)];
  const removedRowWasEnabled = state.enabledManualRowIds.includes(rowId);
  return {
    ...state,
    rows,
    enabledManualRowIds: removedRowWasEnabled
      ? state.enabledManualRowIds.filter(value => value !== rowId)
      : state.enabledManualRowIds,
  };
};

export const buildX4UiManualCalibrationSessionInput = (
  state: X4UiManualCalibrationState,
): X4UiManualCalibrationSessionInput => {
  const stableIdCounts = new Map<string, number>();
  for (const row of state.rows) {
    const stableId = manualCalibrationRowStableId(row);
    if (stableId.trim().length === 0) continue;
    stableIdCounts.set(stableId, (stableIdCounts.get(stableId) ?? 0) + 1);
  }
  const ambiguousStableIds = new Set(
    [...stableIdCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([stableId]) => stableId),
  );
  const manualCalibrations: KeepOutCalibrationInput[] = [];
  const enabledManualEntryIds: string[] = [];
  const acceptedRowIds: string[] = [];
  const refusedRows: X4UiManualCalibrationSessionInput['refusedRows'][number][] = [];
  for (const row of state.rows) {
    const stableId = manualCalibrationRowStableId(row);
    const ambiguous = ambiguousStableIds.has(stableId);
    const parsed = parseX4UiManualCalibrationDraft(row.draft);
    if (ambiguous) {
      refusedRows.push({
        rowId: row.rowId,
        reason: 'duplicate-stable-id',
        message: `Manual calibration stable ID is duplicated locally: ${stableId}.`,
      });
    }
    if ('input' in parsed) {
      manualCalibrations.push(parsed.input);
      acceptedRowIds.push(row.rowId);
      if (
        !ambiguous
        && parsed.input.stableId.trim().length > 0
        && state.enabledManualRowIds.includes(row.rowId)
      ) {
        enabledManualEntryIds.push(parsed.input.stableId);
      }
    } else if (!ambiguous) {
      refusedRows.push({ rowId: row.rowId, reason: parsed.reason, message: parsed.message });
    }
  }
  return {
    manualCalibrations,
    enabledManualEntryIds,
    acceptedRowIds,
    refusedRows,
  };
};

export interface X4UiCanvasStateDescription {
  readonly status: 'empty' | 'current' | 'stale' | 'refused';
  readonly label: string;
  readonly detail: string;
}

export const classifyX4UiCanvasState = (state: X4UiEditorCanvasState): X4UiCanvasStateDescription => {
  const value = asRecord(state);
  const refusal = asRecord(value?.refusal);
  switch (state.status) {
    case 'current':
      return {
        status: 'current',
        label: 'rendered/current',
        detail: 'Rendered/current bitmap is mounted from the accepted raw paint plan.',
      };
    case 'stale':
      return {
        status: 'stale',
        label: 'stale',
        detail: stringValue(refusal?.message, 'Previously rendered bitmap retained; the latest canvas state is stale.'),
      };
    case 'refused':
      return {
        status: 'refused',
        label: 'refused',
        detail: stringValue(refusal?.message, 'Latest canvas render was refused; no replacement was mounted.'),
      };
    case 'empty':
      return {
        status: 'empty',
        label: 'empty',
        detail: 'No rendered bitmap yet.',
      };
  }
};

const sessionRefusalResult = (reason: string): X4UiCanvasRenderResult => ({
  status: 'refused',
  receipt: {
    format: X4_UI_CANVAS_RENDERER_FORMAT,
    version: X4_UI_CANVAS_RENDERER_VERSION,
    status: 'refused',
    gameTruth: X4_UI_EDITOR_SESSION_GAME_TRUTH,
    gameVerified: false,
    verification: {
      game: X4_UI_EDITOR_SESSION_GAME_TRUTH,
      gameVerified: false,
    },
    refusal: {
      code: 'input-refused',
      message: reason,
    },
  },
});

export interface X4UiCanvasCommitDecision {
  readonly nextState: X4UiEditorCanvasState;
  readonly replaceSurface?: X4UiCanvasSurface;
  readonly discardSurface?: X4UiCanvasSurface;
}

export const classifyX4UiCanvasCommit = (
  previous: X4UiEditorCanvasState,
  result: X4UiCanvasRenderResult,
): X4UiCanvasCommitDecision => {
  const commitResult = result.status === 'refused' && result.receipt.refusal.code === 'no-visible-output'
    ? sessionRefusalResult(result.receipt.refusal.message)
    : result;
  const nextState = adoptX4UiEditorCanvasResult(previous, commitResult);
  if (result.status !== 'rendered'
    || nextState.status !== 'current'
    || nextState.surface !== result.surface
    || nextState.stale) {
    return result.status === 'rendered'
      ? { nextState, discardSurface: result.surface }
      : { nextState };
  }
  return { nextState, replaceSurface: result.surface };
};

export interface X4UiCanvasExportInput {
  readonly state: unknown;
  readonly mountedCanvas: unknown;
  readonly currentIdentity: unknown;
  readonly committedIdentity: unknown;
}

export interface X4UiCanvasExportClassification {
  readonly status: 'available' | 'refused';
  readonly detail: string;
  readonly filename?: string;
  readonly identityKey?: string;
  readonly width?: number;
  readonly height?: number;
}

const canvasExportRefusal = (detail: string): X4UiCanvasExportClassification => ({
  status: 'refused',
  detail,
});

const safePositiveInteger = (value: unknown): number | null => (
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
);

const canvasExportIdentityFor = (value: unknown): X4UiGameVerificationCurrentSnapshot | null => {
  const record = asRecord(value);
  if (record === null) return null;
  const sourceIdentity = ownEnumerableDataField(record, 'sourceIdentity');
  const targetIdentity = ownEnumerableDataField(record, 'targetIdentity');
  const normalizedProfile = ownEnumerableDataField(record, 'normalizedProfile');
  if (!sourceIdentity.present || !sourceIdentity.valid
    || !targetIdentity.present || !targetIdentity.valid
    || !normalizedProfile.present || !normalizedProfile.valid) return null;
  return buildX4UiGameVerificationCurrentSnapshot({
    sourceIdentity: sourceIdentity.value,
    targetIdentity: targetIdentity.value,
    normalizedProfile: normalizedProfile.value,
  });
};

const canvasExportIdentityKey = (value: X4UiGameVerificationCurrentSnapshot): string | null => {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
};

const canvasExportToken = (value: string, fallback: string): string => {
  let normalized = value;
  try {
    normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    normalized = value;
  }
  const token = normalized
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 96);
  return token.length > 0 ? token : fallback;
};

const canvasExportFilenameFor = (identity: X4UiGameVerificationCurrentSnapshot): string | null => {
  try {
    const sourceFile = canvasExportToken(identity.sourceIdentity.file, 'source');
    const targetRecord = asRecord(identity.targetIdentity);
    const targetId = targetRecord === null ? undefined : targetRecord.id;
    if (typeof targetId !== 'string' || targetId.length === 0) return null;
    const profile = asRecord(identity.normalizedProfile);
    const drawable = asRecord(profile?.drawable);
    const width = safePositiveInteger(drawable?.width);
    const height = safePositiveInteger(drawable?.height);
    const uiScale = finiteValue(profile?.uiScale);
    if (width === null || height === null || uiScale === null || uiScale <= 0) return null;
    return `x4-ui-${sourceFile}-${canvasExportToken(targetId, 'target')}-${width}x${height}-effective-scale-${canvasExportToken(String(uiScale), 'scale')}.png`;
  } catch {
    return null;
  }
};

const renderedCanvasReceiptFor = (
  value: unknown,
): { readonly width: number; readonly height: number } | null => {
  const receipt = asRecord(value);
  if (receipt === null) return null;
  const required = [
    'format',
    'version',
    'status',
    'gameTruth',
    'gameVerified',
    'verification',
    'width',
    'height',
    'layers',
    'commandIds',
    'commandCount',
    'atlasRoles',
    'palette',
  ];
  try {
    const keys = Reflect.ownKeys(receipt);
    if (keys.length !== required.length || required.some(key => !keys.includes(key))) return null;
    if (receipt.format !== X4_UI_CANVAS_RENDERER_FORMAT
      || receipt.version !== X4_UI_CANVAS_RENDERER_VERSION
      || receipt.status !== 'rendered'
      || receipt.gameTruth !== X4_UI_EDITOR_SESSION_GAME_TRUTH
      || receipt.gameVerified !== false) return null;
    const verification = asRecord(receipt.verification);
    if (verification === null || verification.game !== X4_UI_EDITOR_SESSION_GAME_TRUTH || verification.gameVerified !== false) return null;
    const width = safePositiveInteger(receipt.width);
    const height = safePositiveInteger(receipt.height);
    if (width === null || height === null) return null;
    if (!Array.isArray(receipt.layers)
      || receipt.layers.length !== 4
      || receipt.layers.some((layer, index) => layer !== ['diagnostic-background', 'glyph-alpha-blits', 'diagnostics', 'keep-out-overlays'][index])) return null;
    if (!Array.isArray(receipt.commandIds)
      || receipt.commandIds.some(commandId => typeof commandId !== 'string')
      || receipt.commandCount !== receipt.commandIds.length) return null;
    if (!Array.isArray(receipt.atlasRoles)
      || receipt.atlasRoles.some(role => role !== 'regular' && role !== 'bold')) return null;
    const palette = asRecord(receipt.palette);
    if (palette === null || palette.id !== 'diagnostic-only' || palette.diagnosticOnly !== true) return null;
    return { width, height };
  } catch {
    return null;
  }
};

export const classifyX4UiCanvasExport = (
  input: X4UiCanvasExportInput,
): X4UiCanvasExportClassification => {
  try {
    const state = asRecord(input.state);
    if (state === null
      || state.status !== 'current'
      || state.stale !== false
      || state.gameTruth !== X4_UI_EDITOR_SESSION_GAME_TRUTH
      || state.gameVerified !== false
      || Object.prototype.hasOwnProperty.call(state, 'refusal')) {
      return canvasExportRefusal('Current rendered canvas evidence is unavailable or stale.');
    }
    const surface = state.surface;
    const canvasConstructor = typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement;
    if (canvasConstructor === null || !(input.mountedCanvas instanceof canvasConstructor)) {
      return canvasExportRefusal('The current mounted surface is not an HTMLCanvasElement.');
    }
    if (surface === null || surface !== input.mountedCanvas) {
      return canvasExportRefusal('The mounted canvas is not the current renderer surface.');
    }
    const receipt = renderedCanvasReceiptFor(state.receipt);
    if (receipt === null) return canvasExportRefusal('The current renderer receipt is malformed or refused.');
    const canvasWidth = safePositiveInteger(input.mountedCanvas.width);
    const canvasHeight = safePositiveInteger(input.mountedCanvas.height);
    if (canvasWidth === null || canvasHeight === null || canvasWidth !== receipt.width || canvasHeight !== receipt.height) {
      return canvasExportRefusal('Mounted canvas dimensions do not match the current renderer receipt.');
    }
    const currentIdentity = canvasExportIdentityFor(input.currentIdentity);
    const committedIdentity = canvasExportIdentityFor(input.committedIdentity);
    if (currentIdentity === null || committedIdentity === null) {
      return canvasExportRefusal('Current source, target, or profile identity is unavailable.');
    }
    const currentKey = canvasExportIdentityKey(currentIdentity);
    const committedKey = canvasExportIdentityKey(committedIdentity);
    if (currentKey === null || committedKey === null || currentKey !== committedKey) {
      return canvasExportRefusal('Current source, target, or profile identity superseded the mounted canvas.');
    }
    const profile = asRecord(currentIdentity.normalizedProfile);
    const drawable = asRecord(profile?.drawable);
    const profileWidth = safePositiveInteger(drawable?.width);
    const profileHeight = safePositiveInteger(drawable?.height);
    if (profileWidth === null || profileHeight === null || profileWidth !== receipt.width || profileHeight !== receipt.height) {
      return canvasExportRefusal('Current profile dimensions do not match the mounted renderer receipt.');
    }
    const filename = canvasExportFilenameFor(currentIdentity);
    if (filename === null) return canvasExportRefusal('Current source, target, or profile cannot produce a safe filename.');
    return {
      status: 'available',
      detail: 'Current rendered canvas is eligible for native PNG export.',
      filename,
      identityKey: currentKey,
      width: receipt.width,
      height: receipt.height,
    };
  } catch {
    return canvasExportRefusal('Current canvas export evidence was malformed and was refused.');
  }
};

const setCompletedBitmapStyle = (surface: X4UiCanvasSurface): void => {
  if (!(surface instanceof HTMLElement)) return;
  surface.style.maxWidth = 'none';
  surface.style.maxHeight = 'none';
  surface.style.width = '100%';
  surface.style.height = '100%';
  surface.style.objectFit = 'fill';
  surface.style.imageRendering = 'pixelated';
};

const statusLabel = (status: CorpusLoadStatus): string => {
  switch (status) {
    case 'loading': return 'loading';
    case 'canonical': return 'canonical';
    case 'stale': return 'stale';
    case 'malformed': return 'malformed';
    case 'refused': return 'refused';
    case 'unavailable': return 'unavailable';
    case 'idle': return 'unavailable (not loaded)';
  }
};

const sourceStatusText = (source: ValueRecord | undefined, key: string): string => (
  stringValue(source?.[key], 'unavailable')
);

export type X4UiSourceEditInputResult =
  | { readonly accepted: true; readonly value: X4UiSourceEditScalar }
  | { readonly accepted: false; readonly reason: 'replacement-parse-failure' | 'invalid-replacement'; readonly detail: string };

/** Parse only the scalar type that the owner-issued catalog declared. */
export const parseX4UiSourceEditInput = (entry: unknown, raw: string): X4UiSourceEditInputResult => {
  const record = asRecord(entry);
  const valueType = record?.valueType;
  if (typeof raw !== 'string') {
    return { accepted: false, reason: 'invalid-replacement', detail: 'source edit input must be a string control value' };
  }
  if (valueType === 'string') return { accepted: true, value: raw };
  if (valueType === 'number') {
    if (raw.trim().length === 0) {
      return { accepted: false, reason: 'replacement-parse-failure', detail: 'number input must not be blank' };
    }
    const value = Number(raw.trim());
    if (!Number.isFinite(value)) {
      return { accepted: false, reason: 'replacement-parse-failure', detail: 'number input must be finite' };
    }
    return { accepted: true, value };
  }
  if (valueType === 'boolean') {
    if (raw === 'true') return { accepted: true, value: true };
    if (raw === 'false') return { accepted: true, value: false };
    return { accepted: false, reason: 'replacement-parse-failure', detail: 'boolean input must be exactly true or false' };
  }
  return { accepted: false, reason: 'invalid-replacement', detail: 'source edit entry has no supported scalar type' };
};

/** Stage a control value locally; this function has no source or workspace authority. */
export const stageX4UiSourceEditInput = (
  staged: Readonly<Record<string, string>>,
  entryId: string,
  raw: string,
): Readonly<Record<string, string>> => ({ ...staged, [entryId]: raw });

export interface X4UiSourceEditContext {
  readonly workspace: unknown;
  readonly source: unknown;
  readonly selection: unknown;
  readonly target: unknown;
  readonly program: unknown;
  readonly evidenceAuthority: unknown;
  readonly catalog: unknown;
  readonly profile: unknown;
}

const X4_UI_SOURCE_EDIT_CONTEXTS = new WeakSet<object>();

/** Issue one plain source-edit context from the exact current editor authority identities. */
export const createX4UiSourceEditContext = (
  workspace: unknown,
  source: unknown,
  selection: unknown,
  target: unknown,
  program: unknown,
  evidenceAuthority: unknown,
  catalog: unknown,
  profile: unknown,
): X4UiSourceEditContext => {
  const context: X4UiSourceEditContext = Object.freeze({
    workspace,
    source,
    selection,
    target,
    program,
    evidenceAuthority,
    catalog,
    profile,
  });
  X4_UI_SOURCE_EDIT_CONTEXTS.add(context);
  return context;
};

const isX4UiSourceEditContext = (value: unknown): value is X4UiSourceEditContext => (
  value !== null
  && typeof value === 'object'
  && X4_UI_SOURCE_EDIT_CONTEXTS.has(value)
);

const sameX4UiSourceEditContext = (left: X4UiSourceEditContext | null | undefined, right: X4UiSourceEditContext): boolean => (
  isX4UiSourceEditContext(left)
  && isX4UiSourceEditContext(right)
  && left.workspace === right.workspace
  && left.source === right.source
  && left.selection === right.selection
  && left.target === right.target
  && left.program === right.program
  && left.evidenceAuthority === right.evidenceAuthority
  && left.catalog === right.catalog
  && left.profile === right.profile
);

/** A changed authority input invalidates all staged values and receipts. */
export const shouldClearX4UiSourceEditState = (
  previous: X4UiSourceEditContext | null | undefined,
  current: X4UiSourceEditContext,
): boolean => !sameX4UiSourceEditContext(previous, current);

export const classifyX4UiWorkspaceCommit = (
  currentWorkspace: unknown,
  expectedWorkspace: unknown,
  replacementWorkspace: unknown,
): X4UiWorkspaceEditResult => {
  if (currentWorkspace !== expectedWorkspace) {
    return {
      accepted: false,
      reason: 'stale-parent-workspace',
      detail: 'parent workspace changed before the source edit could be committed',
    };
  }
  if (replacementWorkspace === null || typeof replacementWorkspace !== 'object') {
    return {
      accepted: false,
      reason: 'invalid-replacement-workspace',
      detail: 'accepted source edit did not return an object workspace',
    };
  }
  return { accepted: true, detail: 'accepted source edit workspace matches the expected parent object' };
};

const X4_UI_WORKSPACE_ACKNOWLEDGEMENTS = new WeakMap<X4UiWorkspaceEditPending, X4UiWorkspaceEditAcknowledgement>();

/** Create one exact pending attempt and the sole acknowledgement function bound to it. */
export const createX4UiWorkspaceEditPending = (
  expectedWorkspace: unknown,
  workspace: unknown,
): X4UiWorkspaceEditPendingAuthority => {
  const attempt = Object.freeze({});
  let resolveAcknowledgement: (acknowledgement: X4UiWorkspaceEditAcknowledgement) => void = () => undefined;
  const acknowledgement = new Promise<X4UiWorkspaceEditAcknowledgement>(resolve => {
    resolveAcknowledgement = resolve;
  });
  const submission: X4UiWorkspaceEditPending = Object.freeze({
    status: 'pending',
    attempt,
    expectedWorkspace,
    workspace,
    acknowledgement,
    detail: 'workspace CAS was scheduled; awaiting exact parent-issued attempt acknowledgement',
  });
  const acknowledge = (currentWorkspace: unknown): X4UiWorkspaceEditAcknowledgement => {
    const existing = X4_UI_WORKSPACE_ACKNOWLEDGEMENTS.get(submission);
    if (existing !== undefined) return existing;
    const issued: X4UiWorkspaceEditAcknowledgement = currentWorkspace === workspace
      ? Object.freeze({
        status: 'accepted',
        attempt,
        expectedWorkspace,
        workspace,
        currentWorkspace,
        detail: 'parent commit boundary processed the exact attempt and read back the exact owner workspace',
      })
      : Object.freeze({
        status: 'refused',
        attempt,
        expectedWorkspace,
        workspace,
        currentWorkspace,
        reason: 'stale-parent-workspace',
        detail: 'parent commit boundary processed the exact attempt against a newer live workspace',
      });
    X4_UI_WORKSPACE_ACKNOWLEDGEMENTS.set(submission, issued);
    resolveAcknowledgement(issued);
    return issued;
  };
  return Object.freeze({ submission, acknowledge });
};

/** Acceptance requires the exact registered acknowledgement object for this exact pending attempt. */
export const classifyX4UiWorkspaceEditAcknowledgement = (
  currentWorkspace: unknown,
  submission: X4UiWorkspaceEditPending,
  acknowledgement?: X4UiWorkspaceEditAcknowledgement,
): X4UiWorkspaceEditReadback => {
  if (acknowledgement === undefined) {
    return {
      status: 'pending',
      detail: 'parent workspace commit remains pending an exact attempt acknowledgement',
    };
  }
  const issued = X4_UI_WORKSPACE_ACKNOWLEDGEMENTS.get(submission);
  if (
    issued !== acknowledgement
    || acknowledgement.attempt !== submission.attempt
    || acknowledgement.expectedWorkspace !== submission.expectedWorkspace
    || acknowledgement.workspace !== submission.workspace
  ) {
    return {
      status: 'refused',
      reason: 'invalid-parent-workspace-acknowledgement',
      detail: 'parent acknowledgement was cloned, crossed, forged, or not issued for this exact pending attempt',
    };
  }
  if (
    acknowledgement.currentWorkspace !== currentWorkspace
    || acknowledgement.status === 'refused'
    || currentWorkspace !== submission.workspace
  ) {
    return {
      status: 'refused',
      reason: 'stale-parent-workspace',
      detail: acknowledgement.status === 'refused'
        ? acknowledgement.detail
        : 'parent acknowledgement no longer matches the exact current workspace outcome',
    };
  }
  return {
    status: 'accepted',
    detail: acknowledgement.detail,
  };
};

/** Compatibility name retained; identity readback alone never accepts without an acknowledgement. */
export const classifyX4UiWorkspaceEditReadback = classifyX4UiWorkspaceEditAcknowledgement;

/** Submit both changed and no-op owner results through the same exact parent commit seam. */
export const submitX4UiSourceEditWorkspaceCommit = (
  expectedWorkspace: unknown,
  workspace: unknown,
  onWorkspaceEdit: X4UiWorkspaceEditHandler | undefined,
  sourceSplice?: WorkspaceSourceSplice,
): X4UiWorkspaceEditSubmission => {
  if (onWorkspaceEdit === undefined) {
    return {
      status: 'refused',
      reason: 'parent-workspace-owner-unavailable',
      detail: 'the UIBuilder workspace owner did not provide a commit seam',
    };
  }
  const submission = onWorkspaceEdit({ expectedWorkspace, workspace, ...(sourceSplice === undefined ? {} : { sourceSplice }) });
  if (submission.status === 'refused') return submission;
  if (
    submission.expectedWorkspace !== expectedWorkspace
    || submission.workspace !== workspace
    || submission.attempt === null
    || typeof submission.attempt !== 'object'
    || typeof submission.acknowledgement?.then !== 'function'
  ) {
    return {
      status: 'refused',
      reason: 'invalid-parent-workspace-acknowledgement',
      detail: 'parent pending submission did not preserve the exact attempt, expected workspace, replacement workspace, and acknowledgement identities',
    };
  }
  return submission;
};

interface X4UiSourceEditSelectionIntent {
  readonly path: string;
  readonly targetKind: string;
  readonly targetName?: string;
}

export interface X4UiSourceEditSelectionContinuation {
  readonly node: X4UiBuilderNode;
  readonly splice: X4UiBuilderSourceEditSplice;
  /** Accepted widget insertion proof; scalar edits continue by mapped span. */
  readonly insertedWidget?: X4UiSourceEditInsertedWidget;
  /** Accepted Add-row proof; the fresh catalog chooses the first eligible cell. */
  readonly insertedRow?: X4UiSourceEditInsertedRow;
  /** Accepted row-move proof; the fresh presentation must resolve the moved row. */
  readonly movedRow?: X4UiSourceEditMovedRow;
}

export interface X4UiSourceEditSelectionResult {
  readonly sourceSelector: string;
  readonly targetSelector: string;
  /** Fresh selection identity, present only after exact source-span mapping. */
  readonly builderSelection?: X4UiBuilderSelection;
}

const resolveSourceEditSelectionIntent = (
  candidates: readonly SourceCandidateView[],
  intent: X4UiSourceEditSelectionIntent,
): { readonly sourceSelector: string; readonly targetSelector: string } | undefined => {
  const sources = candidates.filter(candidate => candidate.path === intent.path);
  if (sources.length !== 1) return undefined;
  const targets = sources[0].targets.filter(target => (
    target.raw.kind === intent.targetKind && target.raw.name === intent.targetName
  ));
  return targets.length === 1 ? { sourceSelector: sources[0].key, targetSelector: targets[0].key } : undefined;
};

/** Disposable view state only; confirmation comes from the existing selection-transfer owner. */
export function useX4UiInspectorScrollRetention(input: {
  readonly workspace: unknown;
  readonly scope: string;
  readonly profile: unknown;
  readonly selectionEpoch: number;
  readonly nodeId?: string;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<{
    readonly before: unknown; readonly after: unknown; readonly scope: string;
    readonly profile: unknown; readonly epoch: number; readonly top: number;
    nodeId?: string;
  } | null>(null);
  const cancel = useCallback((attempt?: unknown): void => {
    if (attempt === undefined || pendingRef.current === attempt) pendingRef.current = null;
  }, []);
  useLayoutEffect(() => () => cancel(), [cancel]);
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    if (input.scope !== pending.scope || input.profile !== pending.profile
      || input.selectionEpoch !== pending.epoch
      || (input.workspace !== pending.before && input.workspace !== pending.after)) {
      cancel(pending); return;
    }
    if (input.workspace !== pending.after || pending.nodeId === undefined || input.nodeId !== pending.nodeId) return;
    const container = containerRef.current;
    if (container !== null) {
      container.scrollTop = Math.min(pending.top, Math.max(0, container.scrollHeight - container.clientHeight));
    }
    cancel(pending);
  }, [input.workspace, input.scope, input.profile, input.selectionEpoch, input.nodeId, cancel]);
  return {
    containerRef, cancel,
    begin(after: unknown): unknown {
      const top = containerRef.current?.scrollTop;
      if (after === input.workspace || input.nodeId === undefined || top === undefined || !Number.isFinite(top) || top < 0) return undefined;
      const pending = { before: input.workspace, after, scope: input.scope,
        profile: input.profile, epoch: input.selectionEpoch, top };
      pendingRef.current = pending;
      return pending;
    },
    confirm(selection: X4UiBuilderSelection | undefined): void {
      const pending = pendingRef.current;
      // A source/target-only acknowledgement is intermediate, not element confirmation.
      if (pending === null || selection === undefined) return;
      if (selection.workspace !== pending.after || input.workspace !== pending.after
        || input.scope !== pending.scope || input.profile !== pending.profile
        || input.selectionEpoch !== pending.epoch) { cancel(pending); return; }
      pending.nodeId = selection.nodeId;
    },
  };
}

interface X4UiSourceEditSelectionAttempt {
  readonly expectedWorkspace: unknown;
  readonly workspace: unknown;
  readonly sourceSelector: string;
  readonly targetSelector: string;
  readonly profile: X4UiEditorProfileControls;
  readonly intent: X4UiSourceEditSelectionIntent;
  readonly continuation?: X4UiSourceEditSelectionContinuation;
  adoptedSelection?: { readonly sourceSelector: string; readonly targetSelector: string };
  readbackSeen: boolean;
  submission?: X4UiWorkspaceEditPending;
  acknowledgement?: X4UiWorkspaceEditAcknowledgement;
}

/** Selection intent only: never transfers a draft, receipt, source identity, projection, or paint. */
export function useX4UiSourceEditSelectionTransfer(input: {
  readonly workspace: unknown;
  readonly candidates: readonly SourceCandidateView[];
  readonly sourceSelector: string;
  readonly targetSelector: string;
  readonly profile: X4UiEditorProfileControls;
  readonly onWorkspaceEdit?: X4UiWorkspaceEditHandler;
  readonly builderNodes?: readonly X4UiBuilderNode[];
  readonly sourceEditCatalog?: X4UiSourceEditCatalog;
  readonly builderProjectionStatus?: X4UiBuilderPresentation['status'];
  readonly builderProjectionLoading?: boolean;
  readonly builderSelectionContext?: X4UiBuilderSelectionContext;
  readonly builderSelectionNodeId?: string;
  readonly onSelect: (selection: X4UiSourceEditSelectionResult) => void;
}) {
  const liveRef = useRef(input);
  const mountedRef = useRef(false);
  const ownerWorkspaceRef = useRef(input.workspace);
  const attemptRef = useRef<X4UiSourceEditSelectionAttempt | null>(null);
  const cancel = useCallback((): void => { attemptRef.current = null; }, []);
  const settle = useCallback((): void => {
    const attempt = attemptRef.current;
    if (!mountedRef.current || attempt?.submission === undefined || attempt.acknowledgement === undefined) return;
    const live = liveRef.current;
    const readback = classifyX4UiWorkspaceEditAcknowledgement(live.workspace, attempt.submission, attempt.acknowledgement);
    if (readback.status === 'refused'
      && readback.reason === 'stale-parent-workspace'
      && attempt.acknowledgement.status === 'accepted'
      && live.workspace === attempt.expectedWorkspace
      && !attempt.readbackSeen) return;
    if (readback.status === 'pending') return;
    if (readback.status !== 'accepted') {
      // Terminal refusals, including a rejected acknowledgement promise, must not
      // monopolize the next edit attempt. Only the explicit accepted-before-readback
      // branch above is allowed to remain pending.
      attemptRef.current = null;
      return;
    }
    const selected = resolveSourceEditSelectionIntent(live.candidates, attempt.intent);
    if (selected === undefined) {
      // The fresh owner catalog is definitive at this point. Do not retain an
      // unsupported or ambiguous continuation as an invisible submission lock.
      attemptRef.current = null;
      return;
    }
    if (attempt.continuation === undefined) {
      attemptRef.current = null;
      live.onSelect(selected);
      return;
    }
    if (live.builderSelectionNodeId !== undefined && live.builderSelectionNodeId !== attempt.continuation.node.id) {
      attemptRef.current = null;
      return;
    }
    const selectedKeysMatch = live.sourceSelector === selected.sourceSelector && live.targetSelector === selected.targetSelector;
    if (!selectedKeysMatch) {
      // Parent readback can arrive while the old source/target selectors still
      // point at the old SHA. Adopt the fresh exact keys first and retain only
      // this short-lived span intent until the next projection is rendered.
      attempt.adoptedSelection = selected;
      live.onSelect(selected);
      return;
    }
    const builderSelectionContext = live.builderSelectionContext;
    const builderProjectionReady = live.builderProjectionStatus !== 'unavailable'
      && builderSelectionContext !== undefined
      && builderSelectionContext.workspace === attempt.workspace
      && builderSelectionContext.sourceIdentityKey !== null
      && builderSelectionContext.targetId !== undefined
      && builderSelectionContext.profileKey !== null;
    if (!builderProjectionReady) {
      if (live.builderProjectionLoading === true) {
        // The owner explicitly reports a live corpus/projection load. Retain
        // only the exact intent until that owner state changes.
        attempt.adoptedSelection = selected;
        return;
      }
      // The current exact projection is settled but cannot expose a usable
      // context. This is unsupported, not an indefinite wait state.
      attemptRef.current = null;
      return;
    }
    const freshBuilderNode = attempt.continuation.movedRow !== undefined
      ? resolveX4UiBuilderNodeAfterSourceRowMove(
        live.builderNodes,
        builderSelectionContext.sourceIdentityKey,
        attempt.continuation.movedRow,
      )
      : attempt.continuation.insertedRow !== undefined
      ? resolveX4UiBuilderNodeAfterSourceRowInsertion(
        live.builderNodes,
        builderSelectionContext.sourceIdentityKey,
        attempt.continuation.insertedRow,
        live.sourceEditCatalog,
      )
        : attempt.continuation.insertedWidget === undefined
          ? resolveX4UiBuilderNodeAfterSourceEdit(live.builderNodes, attempt.continuation.node, attempt.continuation.splice)
          : resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
            live.builderNodes,
            builderSelectionContext.sourceIdentityKey,
            attempt.continuation.insertedWidget,
          );
    if (freshBuilderNode === undefined) {
      // The current authoritative projection exists, but no uniquely mapped node
      // survived the exact owner-issued splice. Discard the continuation.
      attemptRef.current = null;
      return;
    }
    attemptRef.current = null;
    const builderSelection: X4UiBuilderSelection = {
      nodeId: freshBuilderNode.id,
      workspace: builderSelectionContext.workspace,
      sourceIdentityKey: builderSelectionContext.sourceIdentityKey,
      targetId: builderSelectionContext.targetId,
      profileKey: builderSelectionContext.profileKey,
    };
    live.onSelect({ ...selected, builderSelection });
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; cancel(); };
  }, [cancel]);
  useLayoutEffect(() => {
    liveRef.current = input;
    const attempt = attemptRef.current;
    if (attempt !== null) {
      const originalSelectorsMatch = input.sourceSelector === attempt.sourceSelector
        && input.targetSelector === attempt.targetSelector;
      const adoptedSelectorsMatch = attempt.adoptedSelection !== undefined
        && input.sourceSelector === attempt.adoptedSelection.sourceSelector
        && input.targetSelector === attempt.adoptedSelection.targetSelector;
      if ((!originalSelectorsMatch && !adoptedSelectorsMatch) || input.profile !== attempt.profile) {
        cancel();
      } else if (ownerWorkspaceRef.current !== input.workspace) {
        if (ownerWorkspaceRef.current === attempt.expectedWorkspace
          && input.workspace === attempt.workspace
          && !attempt.readbackSeen) {
          attempt.readbackSeen = true;
        } else {
          cancel();
        }
      }
    }
    ownerWorkspaceRef.current = input.workspace;
    settle();
  }, [input, cancel, settle]);

  const submit = useCallback((expectedWorkspace: unknown, replacement: unknown, continuation?: X4UiSourceEditSelectionContinuation, sourceSplice?: WorkspaceSourceSplice): X4UiWorkspaceEditSubmission => {
    const live = liveRef.current;
    if (!mountedRef.current || expectedWorkspace !== live.workspace || attemptRef.current !== null) {
      return { status: 'refused', reason: 'stale-parent-workspace', detail: 'source selection changed or another source edit is awaiting acknowledgement' };
    }
    // No-op receipts keep their existing context/settlement behavior, with no selection transfer.
    if (expectedWorkspace === replacement) return submitX4UiSourceEditWorkspaceCommit(expectedWorkspace, replacement, live.onWorkspaceEdit);
    const source = live.candidates.find(candidate => candidate.key === live.sourceSelector);
    const target = source?.targets.find(candidate => candidate.key === live.targetSelector);
    const intent: X4UiSourceEditSelectionIntent | undefined = source !== undefined && typeof target?.raw.kind === 'string' && target.raw.kind !== ''
      && (target.raw.name === undefined || typeof target.raw.name === 'string')
      ? { path: source.path, targetKind: target.raw.kind, targetName: typeof target.raw.name === 'string' ? target.raw.name : undefined }
      : undefined;
    const unique = intent === undefined ? undefined : resolveSourceEditSelectionIntent(live.candidates, intent);
    const attempt: X4UiSourceEditSelectionAttempt | null = intent !== undefined
      && unique?.sourceSelector === live.sourceSelector && unique.targetSelector === live.targetSelector
      ? { expectedWorkspace, workspace: replacement, sourceSelector: live.sourceSelector, targetSelector: live.targetSelector,
        profile: live.profile, intent, continuation, readbackSeen: false }
      : null;
    // The real parent may flushSync its replacement before this call returns.
    attemptRef.current = attempt;
    let submission: X4UiWorkspaceEditSubmission;
    try {
      submission = submitX4UiSourceEditWorkspaceCommit(expectedWorkspace, replacement, live.onWorkspaceEdit, sourceSplice);
    } catch (error) {
      if (attemptRef.current === attempt) cancel();
      throw error;
    }
    if (attempt === null || !mountedRef.current || attemptRef.current !== attempt) return submission;
    if (submission.status === 'refused') {
      cancel();
      return submission;
    }
    attempt.submission = submission;
    void submission.acknowledgement.then(acknowledgement => {
      if (!mountedRef.current || attemptRef.current !== attempt) return;
      attempt.acknowledgement = acknowledgement;
      settle();
    }, () => { if (attemptRef.current === attempt) cancel(); });
    settle();
    return submission;
  }, [cancel, settle]);
  return { submit, cancel };
}

interface X4UiNewMenuDraft {
  readonly open: boolean;
  readonly name: string;
  readonly status: 'idle' | 'pending' | 'refused' | 'accepted';
  readonly detail: string;
}

interface X4UiNewMenuAttempt {
  readonly expectedWorkspace: unknown;
  readonly workspace: unknown;
  readonly name: string;
  readonly path: string;
  readonly targetName: string;
  readbackSeen: boolean;
  submission?: X4UiWorkspaceEditPending;
  acknowledgement?: X4UiWorkspaceEditAcknowledgement;
}

const EMPTY_NEW_MENU_DRAFT: X4UiNewMenuDraft = { open: false, name: '', status: 'idle', detail: '' };

type X4UiLuaFileActionStatus = 'idle' | 'reading' | 'pending' | 'accepted' | 'refused' | 'cancelled';

interface X4UiLuaFileStatus {
  readonly status: X4UiLuaFileActionStatus;
  readonly detail: string;
  readonly technical?: string;
}

const EMPTY_X4_UI_LUA_FILE_STATUS: X4UiLuaFileStatus = { status: 'idle', detail: '' };

interface X4UiLuaFileLiveProps {
  readonly workspace: unknown;
  readonly scope: string;
  readonly source: X4UiWorkspaceSource;
  readonly selectedSourcePath?: string;
  readonly candidates: readonly SourceCandidateView[];
  readonly sourceSelector: string;
  readonly targetSelector: string;
  readonly onWorkspaceEdit?: X4UiWorkspaceEditHandler;
  readonly sourceEditStaged: boolean;
  readonly sourceEditPending: boolean;
  readonly onSelect: (selection: { readonly sourceSelector: string; readonly targetSelector: string }) => void;
}

interface X4UiLuaImportAttempt {
  readonly token: object;
  readonly expectedWorkspace: unknown;
  readonly expectedSource: X4UiWorkspaceSource;
  readonly scope: string;
  readonly sourceSelector: string;
  readonly targetSelector: string;
  readonly path: string;
  readonly previousCandidateKeys: readonly string[];
  replacementWorkspace: unknown;
  replacementSource: X4UiWorkspaceSource;
  readbackSeen: boolean;
  invalidated: boolean;
  phase: 'reading' | 'pending';
  submission?: X4UiWorkspaceEditPending;
  acknowledgement?: X4UiWorkspaceEditAcknowledgement;
}

interface X4UiLuaFileStatusContext {
  readonly workspace: unknown;
  readonly scope: string;
  readonly source: X4UiWorkspaceSource;
  readonly sourceSelector: string;
  readonly targetSelector: string;
}

const x4UiLuaFileStatusContextFor = (live: X4UiLuaFileLiveProps): X4UiLuaFileStatusContext => ({
  workspace: live.workspace,
  scope: live.scope,
  source: live.source,
  sourceSelector: live.sourceSelector,
  targetSelector: live.targetSelector,
});

const x4UiLuaFileNameIsSafe = (name: unknown): name is string => {
  if (typeof name !== 'string' || name.length === 0 || name.length > 255) return false;
  if (!name.toLowerCase().endsWith('.lua')) return false;
  if (name === '.' || name === '..' || [...name].some(character => {
    const code = character.charCodeAt(0);
    return character === '\\' || character === '/' || character === ':' || code <= 0x1f || code === 0x7f;
  }) || /[ .]$/.test(name)) return false;
  if (/^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return false;
  return true;
};

const x4UiLuaFileRefusalCopy = (reason: string, detail: string): string => {
  switch (reason) {
    case 'file-too-large':
    case 'existing-file-too-large':
    case 'aggregate-too-large':
      return 'The Lua file is larger than the supported inline workspace limit. Choose a file under 4 MiB and keep the workspace under its total limit.';
    case 'binary-content':
    case 'nul-content':
    case 'lone-surrogate':
      return 'The file is not valid UTF-8 Lua text. Save it as UTF-8 text and try again.';
    case 'wrong-extension':
    case 'unsafe-traversal-path':
    case 'unsafe-absolute-path':
    case 'invalid-path':
    case 'device-name':
      return 'Choose one safe .lua file with a simple filename.';
    case 'path-collision':
    case 'generated-path-collision':
      return 'That filename is already used by the workspace. Choose a different filename; existing files are never overwritten.';
    case 'source-unavailable':
    case 'source-locked':
    case 'generated-shadowing-source':
    case 'workspace-source-mismatch':
    case 'source-projection-mismatch':
      return 'The current UI source is unavailable or changed. Keep the current workspace, then retry the file action.';
    case 'registration-refused':
    case 'resulting-source-invalid':
      return 'The Lua file was read, but the workspace could not accept it as a supported UI source. Inspect the details for the source-owner result.';
    case 'not-registered':
    case 'ambiguous-source':
    case 'missing-source':
    case 'omitted-source':
      return 'The selected source is not one exact editable UI Lua file. Choose a registered source file and try again.';
    case 'lint-errors':
      return 'Error-level Lua diagnostics block export. Fix the source or inspect the diagnostics before exporting.';
    case 'parent-workspace-owner-unavailable':
      return 'The workspace owner is not available to apply this imported file.';
    case 'stale-parent-workspace':
    case 'invalid-parent-workspace-acknowledgement':
      return 'The workspace changed before the imported file could be confirmed. Retry from the current workspace.';
    case 'invalid-input':
      if (/exactly one/i.test(detail)) return 'Select exactly one .lua file.';
      return 'The selected Lua file could not be read or used. Choose one readable UTF-8 .lua file and try again.';
    default:
      return detail.length > 0 ? 'The Lua file action was refused. Inspect the details for recovery.' : 'The Lua file action was refused.';
  }
};

const x4UiLuaFileTechnical = (reason: string, detail: string, extra = ''): string => (
  `${reason}${detail.length > 0 ? `: ${detail}` : ''}${extra.length > 0 ? `\n${extra}` : ''}`
);

export type X4UiSourceEditorLuaFilesProps = X4UiLuaFileLiveProps;

/**
 * File round-trip controls for the current source owner. This component owns
 * only local file I/O and the existing exact workspace acknowledgement seam;
 * it never compiles, deploys, materializes, or writes a native file itself.
 */
export function X4UiSourceEditorLuaFiles(props: X4UiSourceEditorLuaFilesProps) {
  const [status, setStatus] = useState<X4UiLuaFileStatus>(EMPTY_X4_UI_LUA_FILE_STATUS);
  const statusRef = useRef(status);
  const liveRef = useRef<X4UiLuaFileLiveProps>(props);
  const mountedRef = useRef(false);
  const ownerWorkspaceRef = useRef(props.workspace);
  const importAttemptRef = useRef<X4UiLuaImportAttempt | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const exportInFlightRef = useRef(false);
  const statusContextRef = useRef<X4UiLuaFileStatusContext>(x4UiLuaFileStatusContextFor(props));
  const automaticSelectionRef = useRef<{ readonly workspace: unknown; readonly sourceSelector: string; readonly targetSelector: string } | null>(null);

  const publish = useCallback((next: X4UiLuaFileStatus, live: X4UiLuaFileLiveProps = liveRef.current): void => {
    statusRef.current = next;
    statusContextRef.current = x4UiLuaFileStatusContextFor(live);
    setStatus(next);
  }, []);

  const refuse = useCallback((reason: string, detail: string, extra = ''): void => {
    importAttemptRef.current = null;
    publish({
      status: 'refused',
      detail: x4UiLuaFileRefusalCopy(reason, detail),
      technical: x4UiLuaFileTechnical(reason, detail, extra),
    });
  }, [publish]);

  const settleImport = useCallback((): void => {
    const attempt = importAttemptRef.current;
    if (!mountedRef.current || attempt === null || attempt.submission === undefined || attempt.acknowledgement === undefined) return;
    const live = liveRef.current;
    if (live.scope !== attempt.scope) {
      importAttemptRef.current = null;
      publish({
        status: 'cancelled',
        detail: 'Lua open was cancelled because the workspace scope changed before confirmation.',
      });
      return;
    }
    const readback = classifyX4UiWorkspaceEditAcknowledgement(live.workspace, attempt.submission, attempt.acknowledgement);
    if (readback.status === 'refused'
      && readback.reason === 'stale-parent-workspace'
      && attempt.acknowledgement.status === 'accepted'
      && live.workspace === attempt.expectedWorkspace
      && !attempt.readbackSeen) return;
    if (readback.status === 'pending') return;
    if (readback.status === 'refused') {
      refuse(readback.reason, readback.detail);
      return;
    }
    if (!attempt.readbackSeen || live.workspace !== attempt.replacementWorkspace) return;
    const selectionInvalidated = attempt.invalidated || live.sourceEditStaged || live.sourceEditPending;
    const freshSources = live.candidates.filter(candidate => (
      candidate.path === attempt.path
      && !attempt.previousCandidateKeys.includes(candidate.key)
      && asRecord(candidate.sourceIdentity) !== null
    ));
    importAttemptRef.current = null;
    if (selectionInvalidated) {
      publish({
        status: 'accepted',
        detail: `Opened ${attempt.path}; no automatic selection was applied because another source action intervened · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`,
        technical: 'The accepted import did not override an intervening staged or pending source action.',
      });
      return;
    }
    if (freshSources.length !== 1) {
      publish({
        status: 'accepted',
        detail: freshSources.length === 0
          ? `Opened ${attempt.path}, but its fresh source is not available to select yet. Choose it from File when it appears · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`
          : `Opened ${attempt.path}, but more than one fresh source matched it. Choose the source manually · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`,
        technical: freshSources.length === 0
          ? 'The parent accepted the exact workspace, but the current candidate catalog did not expose one fresh issued source.'
          : 'The current candidate catalog exposed multiple fresh sources for one path; no guessed source was selected.',
      });
      return;
    }
    const freshSource = freshSources[0];
    const targets = menuTargetsFor(freshSource);
    const selectionStillMatches = live.sourceSelector === attempt.sourceSelector
      && live.targetSelector === attempt.targetSelector;
    const nextSelection = {
      sourceSelector: freshSource.key,
      targetSelector: targets.length === 1 ? targets[0].key : '',
    };
    let selectionApplied = false;
    if (selectionStillMatches && mountedRef.current) {
      automaticSelectionRef.current = { workspace: live.workspace, ...nextSelection };
      try {
        live.onSelect(nextSelection);
        selectionApplied = true;
      } catch { /* A parent selection callback cannot turn an accepted import into a source write. */ }
    }
    const selectionDetail = targets.length === 1
      ? selectionApplied
        ? `Opened ${attempt.path} and selected its menu target`
        : `Opened ${attempt.path}; the file was accepted but its menu target was not selected. Choose it from Menu`
      : targets.length > 1
        ? `Opened ${attempt.path}. Choose a menu target from Menu`
        : `Opened ${attempt.path}, but no supported menu target was found. The file is open; choose another source or inspect the details`;
    if (!mountedRef.current) return;
    publish({
      status: 'accepted',
      detail: `${selectionDetail}${selectionStillMatches || selectionApplied ? '' : '; your later selection was kept'} · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`,
      technical: targets.length > 1
        ? 'More than one owner-issued menu target exists; no target was guessed.'
        : targets.length === 0
          ? 'The imported source was accepted, but the current owner exposed no supported menu target.'
          : !selectionApplied
            ? 'The imported source was accepted, but the current selection callback did not apply the automatic menu selection.'
            : undefined,
    });
  }, [publish, refuse]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      importAttemptRef.current = null;
      exportInFlightRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    liveRef.current = props;
    const attempt = importAttemptRef.current;
    if (attempt !== null) {
      if (attempt.phase === 'reading') {
        const readContextMatches = props.workspace === attempt.expectedWorkspace
          && props.source === attempt.expectedSource
          && props.scope === attempt.scope
          && props.sourceSelector === attempt.sourceSelector
          && props.targetSelector === attempt.targetSelector
          && !props.sourceEditStaged
          && !props.sourceEditPending;
        if (!readContextMatches) {
          importAttemptRef.current = null;
          if (mountedRef.current) publish({
            status: 'cancelled',
            detail: 'Lua open was cancelled because the current workspace, source, selection, or draft changed.',
          });
        }
      } else {
        if (props.workspace === attempt.replacementWorkspace && props.scope === attempt.scope) {
          attempt.readbackSeen = true;
        } else if (props.workspace === attempt.replacementWorkspace) {
          importAttemptRef.current = null;
          if (mountedRef.current) publish({
            status: 'cancelled',
            detail: 'Lua open was cancelled because the workspace scope changed before confirmation.',
          });
        } else if (props.workspace === attempt.expectedWorkspace && props.scope === attempt.scope) {
          if (props.source !== attempt.expectedSource || props.scope !== attempt.scope) importAttemptRef.current = null;
        } else {
          importAttemptRef.current = null;
          if (mountedRef.current) publish({
            status: 'cancelled',
            detail: props.workspace === attempt.expectedWorkspace
              ? 'Lua open was cancelled because the workspace scope changed before confirmation.'
              : 'Lua open was cancelled because a different workspace became current.',
          });
        }
        if (props.sourceEditStaged || props.sourceEditPending) attempt.invalidated = true;
      }
    }
    const previousStatusContext = statusContextRef.current;
    const contextChanged = previousStatusContext.workspace !== props.workspace
      || previousStatusContext.scope !== props.scope
      || previousStatusContext.source !== props.source
      || previousStatusContext.sourceSelector !== props.sourceSelector
      || previousStatusContext.targetSelector !== props.targetSelector;
    const automaticSelection = automaticSelectionRef.current;
    const automaticSelectionMatches = automaticSelection !== null
      && automaticSelection.workspace === props.workspace
      && automaticSelection.sourceSelector === props.sourceSelector
      && automaticSelection.targetSelector === props.targetSelector;
    if (importAttemptRef.current === null && contextChanged && statusRef.current.status !== 'idle' && !automaticSelectionMatches) {
      statusRef.current = EMPTY_X4_UI_LUA_FILE_STATUS;
      setStatus(EMPTY_X4_UI_LUA_FILE_STATUS);
    }
    if (automaticSelectionMatches) automaticSelectionRef.current = null;
    statusContextRef.current = x4UiLuaFileStatusContextFor(props);
    ownerWorkspaceRef.current = props.workspace;
    settleImport();
  }, [props, props.candidates, props.onSelect, props.onWorkspaceEdit, props.scope, props.selectedSourcePath, props.source, props.sourceEditPending, props.sourceEditStaged, props.sourceSelector, props.targetSelector, props.workspace, publish, settleImport]);

  const clearFileInput = (input: HTMLInputElement): void => {
    try { input.value = ''; } catch { /* Some hosts expose a read-only file input value. */ }
  };

  const blockIfDraftOrBusy = (): boolean => {
    const live = liveRef.current;
    if (live.sourceEditStaged || live.sourceEditPending) {
      publish({
        status: 'refused',
        detail: live.sourceEditPending
          ? 'Apply or Discard the pending source edit before opening or exporting Lua.'
          : 'Apply or Discard your staged source edit before opening or exporting Lua.',
        technical: 'File actions do not silently discard staged or pending source edits.',
      });
      return true;
    }
    if (importAttemptRef.current !== null || exportInFlightRef.current) return true;
    return false;
  };

  const cancelOpen = (): void => {
    const attempt = importAttemptRef.current;
    if (!mountedRef.current || attempt === null || attempt.phase !== 'reading') return;
    importAttemptRef.current = null;
    publish({ status: 'cancelled', detail: 'Lua open was cancelled; no workspace change was submitted.' });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const selectedFiles = input.files === null ? [] : Array.from(input.files);
    clearFileInput(input);
    if (!mountedRef.current || blockIfDraftOrBusy()) return;
    if (selectedFiles.length === 0) {
      publish({ status: 'cancelled', detail: 'Lua open was cancelled; no workspace change was submitted.' });
      return;
    }
    if (selectedFiles.length !== 1) {
      refuse('invalid-input', 'Select exactly one .lua file.');
      return;
    }
    const file = selectedFiles[0];
    let name: unknown;
    let size: unknown;
    try {
      name = file.name;
      size = file.size;
    } catch {
      refuse('invalid-input', 'The selected file could not be inspected.');
      return;
    }
    if (!x4UiLuaFileNameIsSafe(name)) {
      refuse(typeof name === 'string' && !name.toLowerCase().endsWith('.lua') ? 'wrong-extension' : 'invalid-path', 'The selected file name is not a safe .lua basename.');
      return;
    }
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || size > X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES) {
      refuse('file-too-large', `The selected file must be at most ${X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES} bytes.`);
      return;
    }
    if (typeof file.arrayBuffer !== 'function') {
      refuse('invalid-input', 'The selected file does not provide a readable byte buffer.');
      return;
    }
    const live = liveRef.current;
    const attempt: X4UiLuaImportAttempt = {
      token: Object.freeze({}),
      expectedWorkspace: live.workspace,
      expectedSource: live.source,
      scope: live.scope,
      sourceSelector: live.sourceSelector,
      targetSelector: live.targetSelector,
      path: `ui/${name}`,
      previousCandidateKeys: live.candidates.map(candidate => candidate.key),
      replacementWorkspace: null,
      replacementSource: live.source,
      readbackSeen: false,
      invalidated: false,
      phase: 'reading',
    };
    importAttemptRef.current = attempt;
    publish({ status: 'reading', detail: `Reading ${attempt.path}…` }, live);
    void (async (): Promise<void> => {
      try {
        const buffer = await file.arrayBuffer();
        if (!mountedRef.current || importAttemptRef.current !== attempt) return;
        const bytes = new Uint8Array(buffer);
        if (bytes.byteLength > X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES) {
          refuse('file-too-large', `The selected file decoded to more than ${X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES} bytes.`);
          return;
        }
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
        let text: string;
        try {
          text = decoder.decode(bytes);
        } catch {
          refuse('binary-content', 'The selected file is not valid UTF-8 text.');
          return;
        }
        const encoded = new TextEncoder().encode(text);
        if (encoded.byteLength > X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES
          || encoded.byteLength !== bytes.byteLength
          || encoded.some((value, index) => value !== bytes[index])) {
          refuse('binary-content', 'The decoded Lua text did not preserve the selected UTF-8 bytes exactly.');
          return;
        }
        const current = liveRef.current;
        const readContextMatches = current.workspace === attempt.expectedWorkspace
          && current.source === attempt.expectedSource
          && current.scope === attempt.scope
          && current.sourceSelector === attempt.sourceSelector
          && current.targetSelector === attempt.targetSelector
          && !current.sourceEditStaged
          && !current.sourceEditPending;
        if (!mountedRef.current || importAttemptRef.current !== attempt || !readContextMatches) {
          if (importAttemptRef.current === attempt) {
            importAttemptRef.current = null;
            publish({ status: 'cancelled', detail: 'Lua open was cancelled because the current workspace, source, selection, or draft changed.' });
          }
          return;
        }
        const result = importX4UiWorkspaceLua(
          current.workspace as Parameters<typeof importX4UiWorkspaceLua>[0],
          current.source,
          { path: attempt.path, text },
        );
        if (result.accepted === false) {
          refuse(result.reason, result.detail);
          return;
        }
        attempt.replacementWorkspace = result.workspace;
        attempt.replacementSource = result.source;
        attempt.phase = 'pending';
        publish({ status: 'pending', detail: `Applying ${result.path}…` });
        const submission = submitX4UiSourceEditWorkspaceCommit(current.workspace, result.workspace, current.onWorkspaceEdit);
        if (!mountedRef.current || importAttemptRef.current !== attempt) return;
        if (submission.status === 'refused') {
          refuse(submission.reason, submission.detail);
          return;
        }
        attempt.submission = submission;
        const pendingAttempt = attempt;
        void submission.acknowledgement.then(acknowledgement => {
          if (!mountedRef.current || importAttemptRef.current !== pendingAttempt) return;
          pendingAttempt.acknowledgement = acknowledgement;
          settleImport();
        }, () => {
          if (!mountedRef.current || importAttemptRef.current !== pendingAttempt) return;
          refuse('invalid-parent-workspace-acknowledgement', 'The parent workspace acknowledgement promise was rejected.');
        });
        settleImport();
      } catch (error) {
        if (!mountedRef.current || importAttemptRef.current !== attempt) return;
        const detail = error instanceof Error && error.message.length > 0 ? error.message : 'The selected file could not be read or decoded.';
        refuse('invalid-input', detail);
      } finally {
        clearFileInput(input);
      }
    })();
  };

  const handleExport = (): void => {
    if (!mountedRef.current || blockIfDraftOrBusy()) return;
    const live = liveRef.current;
    const path = live.selectedSourcePath;
    if (path === undefined || path.length === 0) {
      refuse('invalid-input', 'Select a source file before exporting Lua.');
      return;
    }
    const expected = {
      workspace: live.workspace,
      scope: live.scope,
      source: live.source,
      sourceSelector: live.sourceSelector,
      targetSelector: live.targetSelector,
      path,
    };
    exportInFlightRef.current = true;
    let objectUrl: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    let downloaded = false;
    let cleanupFailed = false;
    let failureDetail = 'The Lua download request could not be handed to the host/browser.';
    let acceptedResult: Extract<ReturnType<typeof exportX4UiWorkspaceLua>, { readonly accepted: true }> | undefined;
    try {
      const result = exportX4UiWorkspaceLua(
        live.workspace as Parameters<typeof exportX4UiWorkspaceLua>[0],
        live.source,
        path,
      );
      if (result.accepted === false) {
        exportInFlightRef.current = false;
        refuse(result.reason, result.detail, result.lint === null ? '' : `lint: ${result.lint.summary}`);
        return;
      }
      const encoded = new TextEncoder().encode(result.text);
      if (encoded.byteLength > X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES) {
        exportInFlightRef.current = false;
        refuse('file-too-large', `The selected source is larger than ${X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES} UTF-8 bytes.`);
        return;
      }
      const current = liveRef.current;
      if (!mountedRef.current
        || current.workspace !== expected.workspace
        || current.scope !== expected.scope
        || current.source !== expected.source
        || current.sourceSelector !== expected.sourceSelector
        || current.targetSelector !== expected.targetSelector
        || current.selectedSourcePath !== expected.path
        || current.sourceEditStaged
        || current.sourceEditPending) {
        exportInFlightRef.current = false;
        refuse('workspace-source-mismatch', 'The current source or selection changed before the download handoff.');
        return;
      }
      if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
        throw new Error('The host does not provide bounded Blob/object URL download support.');
      }
      if (typeof document === 'undefined' || document.body === null) throw new Error('The document download host is unavailable.');
      const byteBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
      const blob = new Blob([byteBuffer], { type: 'text/plain;charset=utf-8' });
      if (blob.size !== encoded.byteLength) throw new Error('The download Blob did not retain the exact UTF-8 byte length.');
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = result.path.slice(result.path.lastIndexOf('/') + 1);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      const handoff = liveRef.current;
      if (!mountedRef.current
        || handoff.workspace !== expected.workspace
        || handoff.scope !== expected.scope
        || handoff.source !== expected.source
        || handoff.sourceSelector !== expected.sourceSelector
        || handoff.targetSelector !== expected.targetSelector
        || handoff.selectedSourcePath !== expected.path
        || handoff.sourceEditStaged
        || handoff.sourceEditPending) {
        throw new Error('The current source or selection changed before the download click.');
      }
      anchor.click();
      downloaded = true;
      acceptedResult = result;
    } catch (error) {
      failureDetail = error instanceof Error && error.message.length > 0 ? error.message : failureDetail;
    } finally {
      if (anchor !== undefined && anchor.parentNode !== null) {
        try { anchor.parentNode.removeChild(anchor); } catch { cleanupFailed = true; }
      }
      if (objectUrl !== undefined) {
        try { URL.revokeObjectURL(objectUrl); } catch { cleanupFailed = true; }
      }
      exportInFlightRef.current = false;
    }
    if (!mountedRef.current) return;
    if (cleanupFailed) {
      refuse('invalid-input', 'The Lua download was not considered complete because temporary download cleanup failed.', 'cleanup failure');
      return;
    }
    if (!downloaded) {
      refuse('invalid-input', failureDetail);
      return;
    }
    if (acceptedResult === undefined) {
      refuse('invalid-input', 'The Lua export did not produce a complete download result.');
      return;
    }
    const warningNote = acceptedResult.lint.warningCount > 0 ? ` ${acceptedResult.lint.warningCount} warning(s) remain truthful.` : '';
    const gapNote = acceptedResult.lint.verificationGapCount > 0 ? ` ${acceptedResult.lint.verificationGapCount} verification gap(s) remain.` : '';
    publish({
      status: 'accepted',
      detail: `Download requested for ${acceptedResult.path}; final file save is not verified. Lua source only; dependencies are not included.${warningNote}${gapNote} · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`,
      technical: acceptedResult.lint.summary,
    });
  };

  const busy = status.status === 'reading' || status.status === 'pending';
  const draftBlocked = props.sourceEditStaged || props.sourceEditPending;
  return (
    <section data-testid="x4-ui-lua-files" className="flex min-w-0 shrink-0 flex-wrap items-center gap-1" aria-label="Lua file controls">
      <button
        type="button"
        data-testid="x4-ui-lua-open"
        aria-label="Open Lua file"
        disabled={draftBlocked || busy}
        title={draftBlocked ? 'Apply or Discard the current source edit before opening Lua.' : 'Open one UTF-8 .lua file into the current UI workspace.'}
        onClick={() => { if (!draftBlocked && !busy) fileInputRef.current?.click(); }}
        className="rounded border border-cyan-500/40 px-2 py-1 text-xs font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
      >Open Lua…</button>
      <input
        ref={fileInputRef}
        data-testid="x4-ui-lua-file-input"
        aria-label="Select one Lua file to open"
        type="file"
        accept=".lua,text/x-lua"
        disabled={draftBlocked || busy}
        onChange={handleFileChange}
        className="sr-only"
      />
      <button
        type="button"
        data-testid="x4-ui-lua-export"
        aria-label="Export current Lua file"
        disabled={draftBlocked || busy || exportInFlightRef.current}
        title={draftBlocked ? 'Apply or Discard the current source edit before exporting Lua.' : 'Export the current selected whole Lua source file.'}
        onClick={handleExport}
        className="rounded border border-cyan-500/40 px-2 py-1 text-xs font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
      >Export Lua</button>
      {props.selectedSourcePath === undefined || props.selectedSourcePath === ''
        ? <span data-testid="x4-ui-lua-current" className="text-[10px] text-slate-500">Select a source to export</span>
        : <span data-testid="x4-ui-lua-current" className="max-w-48 truncate text-[10px] text-slate-500" title={props.selectedSourcePath}>{props.selectedSourcePath}</span>}
      {draftBlocked && <span data-testid="x4-ui-lua-draft-block" className="text-[10px] text-amber-200">Apply or Discard the current source edit before file actions.</span>}
      {status.detail !== '' && <div data-testid="x4-ui-lua-status" role="status" aria-live="polite" className={`max-w-[min(40rem,calc(100vw-2rem))] whitespace-normal break-words text-[11px] ${status.status === 'accepted' ? 'text-cyan-200' : status.status === 'refused' ? 'text-amber-200' : 'text-slate-300'}`}>{status.detail}</div>}
      {status.technical !== undefined && <details data-testid="x4-ui-lua-technical" className="basis-full text-[10px] text-slate-500"><summary className="cursor-pointer">Inspect details</summary><pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words">{status.technical}</pre></details>}
      {busy && <button type="button" data-testid="x4-ui-lua-cancel" aria-label="Cancel Lua open" disabled={status.status !== 'reading'} onClick={cancelOpen} className="rounded border border-white/20 px-2 py-1 text-[10px] text-slate-300 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>}
    </section>
  );
}

/** Creation has its own short-lived intent: only its exact replacement may cross the workspace boundary. */
export function X4UiSourceEditorNewMenu({
  workspace,
  source,
  candidates,
  onWorkspaceEdit,
  onSelect,
}: {
  readonly workspace: unknown;
  readonly source: X4UiWorkspaceSource;
  readonly candidates: readonly SourceCandidateView[];
  readonly onWorkspaceEdit?: X4UiWorkspaceEditHandler;
  readonly onSelect: (selection: { readonly sourceSelector: string; readonly targetSelector: string }) => void;
}) {
  const [draft, setDraft] = useState<X4UiNewMenuDraft>(EMPTY_NEW_MENU_DRAFT);
  const draftRef = useRef(draft);
  const attemptRef = useRef<X4UiNewMenuAttempt | null>(null);
  const mountedRef = useRef(false);
  const ownerWorkspaceRef = useRef(workspace);
  const liveRef = useRef({ workspace, source, candidates, onWorkspaceEdit, onSelect });
  useLayoutEffect(() => {
    liveRef.current = { workspace, source, candidates, onWorkspaceEdit, onSelect };
  }, [workspace, source, candidates, onWorkspaceEdit, onSelect]);

  const publish = useCallback((next: X4UiNewMenuDraft): void => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const refuse = useCallback((detail: string): void => {
    attemptRef.current = null;
    publish({ ...draftRef.current, open: true, status: 'refused', detail });
  }, [publish]);

  const settle = useCallback((): void => {
    const attempt = attemptRef.current;
    if (!mountedRef.current || attempt?.submission === undefined || attempt.acknowledgement === undefined) return;
    const live = liveRef.current;
    const readback = classifyX4UiWorkspaceEditAcknowledgement(live.workspace, attempt.submission, attempt.acknowledgement);
    // The parent may acknowledge before React commits its replacement props. Retain only this
    // exact pending transition; the classifier still rejects forged/crossed acknowledgements.
    if (readback.status === 'refused'
      && readback.reason === 'stale-parent-workspace'
      && attempt.acknowledgement.status === 'accepted'
      && live.workspace === attempt.expectedWorkspace
      && !attempt.readbackSeen) return;
    if (readback.status === 'pending') return;
    if (readback.status === 'refused') {
      refuse('The menu could not be saved. Your name is kept; check the workspace and try again.');
      return;
    }
    const sources = live.candidates.filter(candidate => candidate.path === attempt.path);
    const targets = sources.length === 1
      ? sources[0].targets.filter(target => target.raw.name === attempt.targetName)
      : [];
    if (sources.length !== 1 || targets.length !== 1) {
      refuse('The menu was saved, but its preview could not be opened. Inspect the source diagnostics before retrying.');
      return;
    }
    attemptRef.current = null;
    publish({ open: false, name: '', status: 'accepted', detail: `Created ${attempt.name}.` });
    live.onSelect({ sourceSelector: sources[0].key, targetSelector: targets[0].key });
  }, [publish, refuse]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (ownerWorkspaceRef.current !== workspace) {
      const attempt = attemptRef.current;
      if (attempt !== null
        && ownerWorkspaceRef.current === attempt.expectedWorkspace
        && workspace === attempt.workspace
        && !attempt.readbackSeen) {
        attempt.readbackSeen = true;
      } else {
        attemptRef.current = null;
        publish(EMPTY_NEW_MENU_DRAFT);
      }
      ownerWorkspaceRef.current = workspace;
    }
    settle();
  }, [workspace, candidates, publish, settle]);

  const createMenu = (): void => {
    if (!mountedRef.current || attemptRef.current !== null || draftRef.current.status === 'pending' || !draftRef.current.open) return;
    const live = liveRef.current;
    if (ownerWorkspaceRef.current !== live.workspace) return;
    const name = draftRef.current.name;
    publish({ open: true, name, status: 'pending', detail: 'Creating menu…' });
    let attempt: X4UiNewMenuAttempt | null = null;
    try {
      const result = createX4UiWorkspaceMenu(
        live.workspace as Parameters<typeof createX4UiWorkspaceMenu>[0],
        live.source,
        name,
      );
      if (result.accepted === false) {
        refuse(result.detail);
        return;
      }
      attempt = {
        expectedWorkspace: live.workspace,
        workspace: result.workspace,
        name: result.menu.name,
        path: result.menu.path,
        targetName: result.menu.targetName,
        readbackSeen: false,
      };
      // Install before invoking the parent: a synchronous callback may render, reenter, or unmount.
      attemptRef.current = attempt;
      const submission = submitX4UiSourceEditWorkspaceCommit(live.workspace, result.workspace, live.onWorkspaceEdit);
      if (!mountedRef.current || attemptRef.current !== attempt) return;
      if (submission.status === 'refused') {
        refuse('The menu could not be saved. Your name is kept; check the workspace and try again.');
        return;
      }
      attempt.submission = submission;
      const pendingAttempt = attempt;
      void submission.acknowledgement.then(acknowledgement => {
        if (!mountedRef.current || attemptRef.current !== pendingAttempt) return;
        pendingAttempt.acknowledgement = acknowledgement;
        settle();
      }, () => {
        if (!mountedRef.current || attemptRef.current !== pendingAttempt) return;
        refuse('Saving the menu failed. Your name is kept; check the workspace and try again.');
      });
      settle();
    } catch {
      if (!mountedRef.current || (attempt !== null && attemptRef.current !== attempt)
        || liveRef.current.workspace !== ownerWorkspaceRef.current) return;
      refuse('Creating the menu failed. Your name is kept; check the workspace and try again.');
    }
  };

  const pending = draft.status === 'pending';
  return (
    <section data-testid="x4-ui-new-menu" className="flex min-w-0 shrink-0 items-center gap-1">
      {!draft.open ? (
        <button type="button" data-testid="x4-ui-new-menu-open" onClick={() => {
          if (mountedRef.current && attemptRef.current === null && draftRef.current.status !== 'pending') {
            publish({ open: true, name: '', status: 'idle', detail: '' });
          }
        }} className="rounded border border-cyan-500/40 px-2 py-1 text-xs font-semibold text-cyan-200">New menu</button>
      ) : (
        <form data-testid="x4-ui-new-menu-form" onSubmit={event => { event.preventDefault(); createMenu(); }} className="flex min-w-0 flex-wrap items-center gap-1">
          <label className="flex items-center gap-1 text-[11px] text-slate-300">
            Menu name
            <input data-testid="x4-ui-new-menu-name" type="text" maxLength={80} value={draft.name} disabled={pending} onChange={event => {
              if (draftRef.current.status !== 'pending') publish({ open: true, name: event.target.value, status: 'idle', detail: '' });
            }} className="w-32 rounded border border-white/20 bg-black/30 px-2 py-1 text-xs disabled:opacity-60" />
          </label>
          <button type="submit" data-testid="x4-ui-new-menu-create" disabled={pending || draft.name.trim().length === 0} className="rounded border border-cyan-500/40 px-2 py-1 text-xs font-semibold text-cyan-200 disabled:opacity-50">Create</button>
          <button type="button" data-testid="x4-ui-new-menu-cancel" disabled={pending} onClick={() => {
            if (draftRef.current.status !== 'pending') publish(EMPTY_NEW_MENU_DRAFT);
          }} className="rounded border border-white/20 px-2 py-1 text-xs text-slate-300 disabled:opacity-50">Cancel</button>
        </form>
      )}
      {draft.detail !== '' && <div data-testid="x4-ui-new-menu-status" role="status" className={`text-[11px] ${draft.status === 'accepted' ? 'max-w-48 truncate text-cyan-200' : `max-w-[min(30rem,calc(100vw-2rem))] whitespace-normal break-words ${draft.status === 'refused' ? 'text-amber-200' : 'text-cyan-200'}`}`}>{draft.detail}</div>}
    </section>
  );
}

/** Derive the source-edit catalog only from one exact current session projection. */
export const discoverX4UiSourceEditorCatalog = (
  workspace: unknown,
  projection: X4UiEditorSessionProjection,
): X4UiSourceEditCatalog | undefined => {
  const programResult = projection.preview.program;
  if (programResult === undefined || programResult.status === 'refused' || programResult.program === undefined) return undefined;
  try {
    return discoverX4UiSourceEdits(
      workspace as Parameters<typeof discoverX4UiSourceEdits>[0],
      projection.source,
      programResult.program,
      programResult.evidenceAuthority,
    );
  } catch {
    return undefined;
  }
};

export type X4UiSourceEditUiReceipt =
  | {
    readonly status: 'pending';
    readonly submission: X4UiWorkspaceEditPending;
    readonly context: X4UiSourceEditContext;
    readonly changed: boolean;
    readonly detail: string;
    readonly acceptedDetail: string;
  }
  | { readonly status: 'accepted'; readonly changed: boolean; readonly detail: string }
  | { readonly status: 'refused'; readonly reason: string; readonly detail: string };

/** Settle one pending child receipt only from the exact parent-issued acknowledgement. */
export const settleX4UiSourceEditReceipt = (
  currentWorkspace: unknown,
  pendingReceipt: Extract<X4UiSourceEditUiReceipt, { readonly status: 'pending' }>,
  acknowledgement: X4UiWorkspaceEditAcknowledgement | undefined,
  currentContext: X4UiSourceEditContext,
): X4UiSourceEditUiReceipt => {
  const settlement = classifyX4UiWorkspaceEditAcknowledgement(
    currentWorkspace,
    pendingReceipt.submission,
    acknowledgement,
  );
  if (settlement.status === 'pending') return pendingReceipt;
  if (settlement.status === 'refused') {
    return { status: 'refused', reason: settlement.reason, detail: settlement.detail };
  }
  if (!sameX4UiSourceEditContext(pendingReceipt.context, currentContext)) {
    return {
      status: 'refused',
      reason: 'stale-editor-context',
      detail: 'source editor authority changed before the parent acknowledgement settled',
    };
  }
  return {
    status: 'accepted',
    changed: pendingReceipt.changed,
    detail: pendingReceipt.acceptedDetail,
  };
};

export interface X4UiSourceEditorSourceEditsProps {
  readonly catalog: X4UiSourceEditCatalog;
  readonly staged: Readonly<Record<string, string>>;
  readonly receipt?: X4UiSourceEditUiReceipt;
  readonly onStage: (entryId: string, raw: string) => void;
  readonly onApply: (entryId: string) => void;
  readonly onDiscard?: () => void;
  readonly discardTestId?: string;
  /** Optional exact-operation subset used by the selected-element inspector. */
  readonly entries?: readonly X4UiSourceEditCatalogEntry[];
  readonly title?: string;
  readonly showTechnicalDetails?: boolean;
  readonly showFrameBlocks?: boolean;
  /** Scoped route to this editor instance's existing Inspect disclosure. */
  readonly onOpenInspect?: () => void;
  readonly inspectTargetId?: string;
}

const sourceEditLocationLabel = (entry: X4UiSourceEditCatalogEntry): string => {
  const location = entry.sourceLiteral ?? entry.source;
  if (location === undefined) return `${entry.path ?? 'source unavailable'} · range unavailable`;
  const sourcePath = location.sourcePath === undefined ? '' : ` · ${location.sourcePath}`;
  return `${entry.path ?? location.file}${sourcePath} · ${location.start.line}:${location.start.column + 1}-${location.end.line}:${location.end.column + 1} · bytes ${location.start.offset}-${location.end.offset}`;
};

const sourceEditIdentityLabel = (entry: X4UiSourceEditCatalogEntry): string => {
  if (entry.kind === 'editable') {
    return `${entry.provenance.callName} · ${entry.provenance.fields.join(', ')} · operation ${entry.provenance.operationId}`;
  }
  return `${entry.callName ?? 'call unavailable'} · ${entry.field} · operation ${entry.operationId ?? 'operation unavailable'}`;
};

const sourceEditLiteralLabel = (entry: X4UiSourceEditCatalogEntry): string => {
  if (entry.expectedText !== undefined) return entry.expectedText;
  if (entry.expression !== undefined) return entry.expression;
  return entry.value === undefined ? 'unavailable' : String(entry.value);
};

const sourceEditFriendlyLabel = (entry: X4UiSourceEditCatalogEntry): string => {
  return describeX4UiBuilderProperty(entry).label;
};

/** Open one caller-owned Inspect panel without changing editor state. */
export const openX4UiSourceEditorInspect = (panel: HTMLDetailsElement | null | undefined): void => {
  if (panel === null || panel === undefined) return;
  const details = panel;
  details.open = true;
  const summary = details.querySelector('summary');
  if (summary instanceof HTMLElement) summary.focus({ preventScroll: true });
};

const SourceEditInspectButton = ({
  testId,
  onOpenInspect,
  inspectTargetId,
}: {
  readonly testId: string;
  readonly onOpenInspect?: () => void;
  readonly inspectTargetId?: string;
}) => onOpenInspect === undefined || inspectTargetId === undefined ? null : (
  <button
    type="button"
    data-testid={testId}
    aria-controls={inspectTargetId}
    onClick={onOpenInspect}
    className="rounded border border-cyan-500/30 px-2 py-1 text-[9px] font-bold uppercase text-cyan-300"
  >
    Open Inspect
  </button>
);

const friendlySourceEditCatalogRecovery = (catalog: X4UiSourceEditCatalog): string => {
  switch (String(catalog.reason)) {
    case 'operation-not-applied':
      return 'The preview could not apply this source operation, so its controls are unavailable here.';
    case 'stale-range':
    case 'source-record-drift':
    case 'provenance-drift':
      return 'The source or selection changed; refresh it before trying again.';
    case 'source-locked':
    case 'source-unavailable':
    case 'generated-shadowed-source':
      return 'The source is currently unavailable to this control; inspect the source state before retrying.';
    case 'unsupported-provenance':
    case 'unsupported-value':
    case 'unsupported-string-style':
      return 'The preview cannot safely expose this source record as a control; inspect the retained record.';
    default:
      return 'The preview could not issue a safe source control for this selection; inspect the retained record.';
  }
};

const sourceEditInputTestId = (entryId: string): string => `x4-ui-source-edit-input-${entryId}`;

const sourceEditBlockLocationLabel = (entry: X4UiSourceEditInsertBlockEntry): string => (
  `${entry.path} · frame/display anchor bytes ${entry.startOffset}-${entry.endOffset}`
);

const sourceEditBlockOwnerLabel = (entry: X4UiSourceEditInsertBlockEntry): string => {
  const owner = entry.provenance.owner;
  if (owner === undefined) return 'owner unavailable';
  return `${owner.kind} ${owner.ownerId}${owner.frameId === undefined ? '' : ` · frame ${owner.frameId}`}`;
};

/** Resolve the one owner-issued empty-cell entry for the current exact hierarchy cell. */
export const resolveX4UiSourceEditorContextualInsertionEntry = (
  catalog: X4UiSourceEditCatalog | undefined,
  nodes: readonly X4UiBuilderNode[],
  selectedNode: X4UiBuilderNode | undefined,
  presentationSourceIdentityKey: string | null | undefined,
): X4UiSourceEditEmptyCellEntry | undefined => {
  if (catalog === undefined
    || selectedNode?.kind !== 'cell'
    || presentationSourceIdentityKey === null
    || presentationSourceIdentityKey === undefined
    || builderSourceIdentityKey(catalog.sourceIdentity) !== presentationSourceIdentityKey) return undefined;
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) return undefined;
    nodeIds.add(node.id);
  }
  const byId = new Map(nodes.map(node => [node.id, node] as const));
  if (byId.get(selectedNode.id) !== selectedNode) return undefined;
  const entries = (catalog.insertEntries ?? []).filter((entry): entry is X4UiSourceEditEmptyCellEntry => (
    entry.kind === 'insert-widget' && entry.anchor === 'empty-cell'
  ));
  const matches = entries.filter(entry => {
    const cellId = `scene:${entry.cellId}`;
    const rowId = `scene:${entry.rowId}`;
    const tableId = `scene:${entry.tableId}`;
    const frameId = `scene:${entry.frameId}`;
    const row = byId.get(rowId);
    const table = byId.get(tableId);
    const frame = byId.get(frameId);
    const ownerSourceMatches = [selectedNode, row, table, frame].every(node => (
      node !== undefined
      && node.source.file === entry.cellSource.file
      && node.source.sourcePath === entry.cellSource.sourcePath
    ));
    return selectedNode.id === cellId
      && selectedNode.parentId === rowId
      && row?.kind === 'row'
      && row.parentId === tableId
      && table?.kind === 'table'
      && table.parentId === frameId
      && frame?.kind === 'frame'
      && ownerSourceMatches;
  });
  return matches.length === 1 ? matches[0] : undefined;
};

/** Check the current row's exact owner-issued child-cell entries for palette eligibility. */
export const hasX4UiSourceEditorContextualEligibleChildCell = (
  catalog: X4UiSourceEditCatalog | undefined,
  nodes: readonly X4UiBuilderNode[],
  selectedNode: X4UiBuilderNode | undefined,
  presentationSourceIdentityKey: string | null | undefined,
): boolean => {
  const row = resolveX4UiBuilderRowForNode(nodes, selectedNode);
  if (row === undefined) return false;
  const byId = new Map(nodes.map(node => [node.id, node] as const));
  return row.childIds.some(childId => {
    const cell = byId.get(childId);
    return cell?.kind === 'cell'
      && cell.parentId === row.id
      && resolveX4UiSourceEditorContextualInsertionEntry(
        catalog,
        nodes,
        cell,
        presentationSourceIdentityKey,
      ) !== undefined;
  });
};

/** Resolve the one owner-issued row-below entry for a selected row or descendant. */
export const resolveX4UiSourceEditorContextualRowInsertionEntry = (
  catalog: X4UiSourceEditCatalog | undefined,
  nodes: readonly X4UiBuilderNode[],
  selectedNode: X4UiBuilderNode | undefined,
  presentationSourceIdentityKey: string | null | undefined,
  presentationTargetId?: string,
): X4UiSourceEditRowInsertionEntry | undefined => {
  if (catalog === undefined
    || selectedNode === undefined
    || presentationSourceIdentityKey === null
    || presentationSourceIdentityKey === undefined
    || builderSourceIdentityKey(catalog.sourceIdentity) !== presentationSourceIdentityKey) return undefined;
  const row = resolveX4UiBuilderRowForNode(nodes, selectedNode);
  if (row === undefined) return undefined;
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) return undefined;
    nodeIds.add(node.id);
  }
  const byId = new Map(nodes.map(node => [node.id, node] as const));
  const table = row.parentId === undefined ? undefined : byId.get(row.parentId);
  const frame = table?.parentId === undefined ? undefined : byId.get(table.parentId);
  if (table?.kind !== 'table' || frame?.kind !== 'frame') return undefined;
  const entries = (catalog.insertEntries ?? []).filter((entry): entry is X4UiSourceEditRowInsertionEntry => (
    entry.kind === 'insert-row' && entry.anchor === 'row-below'
  ));
  const matches = entries.filter(entry => {
    const rowOwner = entry.provenance.rowOwner;
    const structuralOwner = entry.provenance.owner;
    const ownerSourcesMatch = [selectedNode, row, table, frame].every(node => (
      node.source.file === entry.rowSource.file && node.source.sourcePath === entry.rowSource.sourcePath
    ));
    return byId.get(row.id) === row
      && entry.frameId === frame.id.slice('scene:'.length)
      && entry.tableId === table.id.slice('scene:'.length)
      && entry.rowId === row.id.slice('scene:'.length)
      && builderSourceLocationEquals(entry.rowSource, row.source)
      && ownerSourcesMatch
      && builderSourceIdentityKey(entry.provenance.sourceIdentity) === presentationSourceIdentityKey
      && (presentationTargetId === undefined || entry.provenance.targetId === presentationTargetId)
      && rowOwner.frameId === entry.frameId
      && rowOwner.tableId === entry.tableId
      && rowOwner.rowId === entry.rowId
      && structuralOwner.kind === 'table'
      && structuralOwner.ownerId === entry.tableId
      && structuralOwner.frameId === entry.frameId;
  });
  return matches.length === 1 ? matches[0] : undefined;
};

export interface X4UiSourceEditorRowMoveContext {
  readonly row?: X4UiBuilderNode;
  readonly up?: X4UiSourceEditRowMoveEntry;
  readonly down?: X4UiSourceEditRowMoveEntry;
  readonly detail: string;
  readonly upDetail: string;
  readonly downDetail: string;
}

const unavailableRowMoveContext = (detail: string): X4UiSourceEditorRowMoveContext => ({
  detail,
  upDetail: detail,
  downDetail: detail,
});

const sceneNodeId = (id: string): string | undefined => (
  id.startsWith('scene:') && id.length > 'scene:'.length ? id.slice('scene:'.length) : undefined
);

const rowMoveBlockMatchesCurrentRow = (
  block: X4UiSourceEditRowMoveEntry['upper'] | undefined,
  row: X4UiBuilderNode,
  frameId: string,
  tableId: string,
): boolean => block !== undefined && block !== null
  && block.frameId === frameId
  && block.tableId === tableId
  && block.rowId === sceneNodeId(row.id)
  && Number.isSafeInteger(block.rowIndex)
  && builderSourceLocationEquals(block.rowSource, row.source)
  && block.creatorCallName === 'addRow'
  && typeof block.creatorOperationId === 'string'
  && block.creatorOperationId.length > 0
  && block.owner?.kind === 'table'
  && block.owner.ownerId === tableId
  && block.owner.frameId === frameId
  && block.rowOwner?.frameId === frameId
  && block.rowOwner.tableId === tableId
  && block.rowOwner.rowId === sceneNodeId(row.id);

const rowMoveEntryMatchesCurrentPair = (
  entry: X4UiSourceEditRowMoveEntry,
  catalog: X4UiSourceEditCatalog,
  frame: X4UiBuilderNode,
  table: X4UiBuilderNode,
  upper: X4UiBuilderNode,
  lower: X4UiBuilderNode,
  selected: X4UiBuilderNode,
  adjacent: X4UiBuilderNode,
  direction: X4UiSourceEditRowMoveDirection,
  presentationSourceIdentityKey: string,
  presentationTargetId: string | undefined,
): boolean => {
  if (entry === undefined || entry === null
    || entry.kind !== 'move-row'
    || entry.upper === undefined
    || entry.lower === undefined
    || entry.provenance === undefined) return false;
  const frameId = sceneNodeId(frame.id);
  const tableId = sceneNodeId(table.id);
  const upperId = sceneNodeId(upper.id);
  const lowerId = sceneNodeId(lower.id);
  const selectedId = sceneNodeId(selected.id);
  const adjacentId = sceneNodeId(adjacent.id);
  const selectedBlock = direction === 'down' ? entry.upper : entry.lower;
  const adjacentBlock = direction === 'down' ? entry.lower : entry.upper;
  return selectedBlock !== undefined
    && adjacentBlock !== undefined
    && frameId !== undefined
    && tableId !== undefined
    && upperId !== undefined
    && lowerId !== undefined
    && selectedId !== undefined
    && adjacentId !== undefined
    && entry.path === catalog.sourceIdentity.file
    && entry.frameId === frameId
    && entry.tableId === tableId
    && entry.rowId === selectedId
    && entry.adjacentRowId === adjacentId
    && entry.rowIndex === selectedBlock.rowIndex
    && entry.adjacentRowIndex === adjacentBlock.rowIndex
    && entry.upper.rowId === upperId
    && entry.lower.rowId === lowerId
    && rowMoveBlockMatchesCurrentRow(entry.upper, upper, frameId, tableId)
    && rowMoveBlockMatchesCurrentRow(entry.lower, lower, frameId, tableId)
    && selectedBlock.rowId === selectedId
    && adjacentBlock.rowId === adjacentId
    && entry.provenance.targetId === (presentationTargetId ?? entry.provenance.targetId)
    && builderSourceIdentityKey(entry.provenance.sourceIdentity) === presentationSourceIdentityKey
    && entry.provenance.owner?.kind === 'table'
    && entry.provenance.owner.ownerId === tableId
    && entry.provenance.owner.frameId === frameId
    && entry.provenance.rowOwner?.frameId === frameId
    && entry.provenance.rowOwner.tableId === tableId
    && entry.provenance.rowOwner.rowId === selectedId;
};

/** Resolve owner-issued adjacent row moves for the selected row or descendant. */
export const resolveX4UiSourceEditorContextualRowMoveEntries = (
  catalog: X4UiSourceEditCatalog | undefined,
  nodes: readonly X4UiBuilderNode[],
  selectedNode: X4UiBuilderNode | undefined,
  presentationSourceIdentityKey: string | null | undefined,
  presentationTargetId?: string,
): X4UiSourceEditorRowMoveContext => {
  if (catalog === undefined) return unavailableRowMoveContext('Row controls are unavailable until this menu is ready.');
  if (presentationSourceIdentityKey === null
    || presentationSourceIdentityKey === undefined
    || builderSourceIdentityKey(catalog.sourceIdentity) !== presentationSourceIdentityKey) {
    return unavailableRowMoveContext('Row controls are updating. Try again when the menu settles.');
  }
  if (selectedNode === undefined) return unavailableRowMoveContext('Select a row or an element inside a row that supports reordering.');
  const row = resolveX4UiBuilderRowForNode(nodes, selectedNode);
  if (row === undefined) return unavailableRowMoveContext('Select a row or an element inside a row that supports reordering.');
  const byId = new Map<string, X4UiBuilderNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) return unavailableRowMoveContext('Row controls are updating. Try again when the menu settles.');
    byId.set(node.id, node);
  }
  if (byId.get(row.id) !== row) return unavailableRowMoveContext('Row controls are updating. Try again when the menu settles.');
  const table = row.parentId === undefined ? undefined : byId.get(row.parentId);
  const frame = table?.parentId === undefined ? undefined : byId.get(table.parentId);
  if (table?.kind !== 'table' || frame?.kind !== 'frame') {
    return unavailableRowMoveContext('This row does not support reordering.');
  }
  const rowChildren = table.childIds.map(childId => byId.get(childId));
  const rowIds = new Set(table.childIds);
  if (rowChildren.some(child => child?.kind !== 'row' || child.parentId !== table.id)
    || rowIds.size !== table.childIds.length) {
    return unavailableRowMoveContext('Row controls are updating. Try again when the menu settles.');
  }
  const orderedRows = rowChildren as X4UiBuilderNode[];
  const rowIndex = orderedRows.indexOf(row);
  if (rowIndex < 0) return unavailableRowMoveContext('This row is not available for reordering right now.');
  const moveEntries = catalog.moveEntries ?? [];
  const entriesFor = (
    direction: X4UiSourceEditRowMoveDirection,
    upper: X4UiBuilderNode | undefined,
    lower: X4UiBuilderNode | undefined,
  ): { readonly entry?: X4UiSourceEditRowMoveEntry; readonly ambiguous: boolean } => {
    if (upper === undefined || lower === undefined) return { ambiguous: false };
    const matches = moveEntries.filter(entry => rowMoveEntryMatchesCurrentPair(
      entry,
      catalog,
      frame,
      table,
      upper,
      lower,
      direction === 'down' ? upper : lower,
      direction === 'down' ? lower : upper,
      direction,
      presentationSourceIdentityKey,
      presentationTargetId,
    ));
    return matches.length === 1
      ? { entry: matches[0], ambiguous: false }
      : { ambiguous: matches.length > 1 };
  };
  const upResult = entriesFor('up', orderedRows[rowIndex - 1], row);
  const downResult = entriesFor('down', row, orderedRows[rowIndex + 1]);
  if (upResult.ambiguous || downResult.ambiguous) {
    return { row, ...unavailableRowMoveContext('Row controls are updating. Try again when the menu settles.') };
  }
  const upDetail = orderedRows[rowIndex - 1] === undefined
    ? 'This is already the first row.'
    : upResult.entry === undefined
      ? 'Move up is not available for this row.'
      : 'Move up is available.';
  const downDetail = orderedRows[rowIndex + 1] === undefined
    ? 'This is already the last row.'
    : downResult.entry === undefined
      ? 'Move down is not available for this row.'
      : 'Move down is available.';
  return {
    row,
    ...(upResult.entry === undefined ? {} : { up: upResult.entry }),
    ...(downResult.entry === undefined ? {} : { down: downResult.entry }),
    detail: upResult.entry !== undefined || downResult.entry !== undefined
      ? 'Use the row controls to move this row one position.'
      : 'This row cannot be reordered right now.',
    upDetail,
    downDetail,
  };
};

export interface X4UiSourceEditorRowControlsProps {
  readonly context: X4UiSourceEditorRowMoveContext;
  readonly builderStatus: X4UiBuilderPresentation['status'];
  readonly projectionLoading: boolean;
  readonly propertyDraftPending: boolean;
  readonly receipt?: X4UiSourceEditUiReceipt;
  readonly onMove: (entryId: string, direction: X4UiSourceEditRowMoveDirection) => void;
}

/** One compact, human-readable row action group; source coordinates stay in Inspect. */
export function X4UiSourceEditorRowControls({
  context,
  builderStatus,
  projectionLoading,
  propertyDraftPending,
  receipt,
  onMove,
}: X4UiSourceEditorRowControlsProps) {
  const transactionPending = receipt?.status === 'pending';
  const unavailableDetail = projectionLoading
    ? 'Loading menu…'
    : builderStatus === 'unavailable'
      ? 'Row controls are unavailable until this menu is ready.'
      : context.detail;
  const statusDetail = propertyDraftPending
    ? 'Apply or discard your property changes first.'
    : transactionPending
      ? 'Saving your change…'
      : receipt?.status === 'refused'
        ? 'That row change could not be saved. Open Inspect for details.'
        : unavailableDetail;
  const disabled = propertyDraftPending || transactionPending || projectionLoading || builderStatus === 'unavailable';
  const upDisabled = disabled || context.up === undefined;
  const downDisabled = disabled || context.down === undefined;
  return (
    <section data-testid="x4-ui-row-controls" className="mt-2 rounded border border-cyan-500/30 bg-cyan-950/10 p-2" aria-label="Row controls">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">Row controls</h3>
      <div data-testid="x4-ui-row-controls-status" className="mt-1 break-words text-slate-400" aria-live="polite">{statusDetail}</div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button
          type="button"
          data-testid="x4-ui-row-controls-move-up"
          disabled={upDisabled}
          title={context.up === undefined ? context.upDetail : 'Move this row up one position.'}
          onClick={() => { if (context.up !== undefined) onMove(context.up.id, 'up'); }}
          className="min-h-[28px] rounded border border-cyan-400/40 px-2 py-1 text-[11px] font-bold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Move up
        </button>
        <button
          type="button"
          data-testid="x4-ui-row-controls-move-down"
          disabled={downDisabled}
          title={context.down === undefined ? context.downDetail : 'Move this row down one position.'}
          onClick={() => { if (context.down !== undefined) onMove(context.down.id, 'down'); }}
          className="min-h-[28px] rounded border border-cyan-400/40 px-2 py-1 text-[11px] font-bold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Move down
        </button>
      </div>
    </section>
  );
}

export interface X4UiSourceEditorContextualPaletteProps {
  readonly selectedNode?: X4UiBuilderNode;
  readonly entry?: X4UiSourceEditEmptyCellEntry;
  readonly rowEntry?: X4UiSourceEditRowInsertionEntry;
  readonly rowHasEligibleCell: boolean;
  readonly catalogAvailable: boolean;
  readonly sourceIdentityMatches: boolean;
  readonly builderStatus: X4UiBuilderPresentation['status'];
  readonly projectionLoading: boolean;
  readonly propertyDraftPending: boolean;
  readonly receipt?: X4UiSourceEditUiReceipt;
  readonly onDiscard?: () => void;
  readonly onInsert: (entryId: string, widget: X4UiSourceEditWidgetKind, text: string) => void;
  readonly onInsertRow?: (entryId: string) => void;
}

/** Compact, controlled contextual insert surface; all mutation remains in the existing source transaction. */
export function X4UiSourceEditorContextualPalette({
  selectedNode,
  entry,
  rowEntry,
  rowHasEligibleCell,
  catalogAvailable,
  sourceIdentityMatches,
  builderStatus,
  projectionLoading,
  propertyDraftPending,
  receipt,
  onDiscard,
  onInsert,
  onInsertRow,
}: X4UiSourceEditorContextualPaletteProps) {
  const [text, setText] = useState('New text');
  const contextKey = `${selectedNode?.id ?? 'none'}:${entry?.id ?? 'none'}:${rowEntry?.id ?? 'none'}`;
  useEffect(() => {
    setText('New text');
  }, [contextKey]);

  const selectedCell = selectedNode?.kind === 'cell';
  const selectedRowContext = rowEntry !== undefined;
  const transactionPending = receipt?.status === 'pending';
  const unavailableDetail = projectionLoading
      ? 'Loading menu…'
      : !catalogAvailable
      ? 'This menu is not ready for adding content yet.'
      : !sourceIdentityMatches || builderStatus === 'unavailable'
        ? 'This menu is still updating. Try again when it settles.'
        : selectedRowContext
          ? undefined
          : !selectedCell
            ? 'Choose a row or an element inside a row to add a row.'
            : entry === undefined
              ? 'This cell is not available for adding a widget.'
              : undefined;
  const disabledDetail = propertyDraftPending
    ? 'Apply or discard your property changes first.'
    : transactionPending
      ? 'Saving your change…'
      : unavailableDetail;
  const insertionDisabled = disabledDetail !== undefined || text.trim().length === 0;
  const rowInsertionDisabled = disabledDetail !== undefined;

  return (
    <section data-testid="x4-ui-contextual-palette" className="mt-2 rounded border border-fuchsia-500/30 bg-fuchsia-950/10 p-2" aria-label="Contextual widget palette">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">Add to selection</h3>
      </div>
      <div id="x4-ui-contextual-palette-status" data-testid="x4-ui-contextual-palette-status" className="mt-1 break-words text-slate-400" aria-live="polite">
        {disabledDetail ?? (selectedRowContext
          ? entry === undefined
            ? rowHasEligibleCell
              ? 'Select an empty cell to add text, button, or input. Add a row below this row.'
              : 'No eligible cell is available for adding content right now. Add another row below this row.'
            : 'Choose text, button, or input. Add a row below this row.'
          : 'Choose text, button, or input.')}
      </div>
      {propertyDraftPending && onDiscard !== undefined && (
        <button
          type="button"
          data-testid="x4-ui-contextual-palette-discard"
          disabled={transactionPending}
          onClick={onDiscard}
          className="mt-2 rounded border border-amber-400/40 px-2 py-1 text-[9px] font-bold uppercase text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Discard property changes
        </button>
      )}
      {rowEntry !== undefined && onInsertRow !== undefined && (
        <button
          type="button"
          data-testid="x4-ui-contextual-palette-add-row"
          disabled={rowInsertionDisabled}
          onClick={() => onInsertRow(rowEntry.id)}
          className="mt-2 w-full rounded border border-cyan-400/40 px-2 py-1 text-[9px] font-bold uppercase text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add row below
        </button>
      )}
      {entry !== undefined && selectedCell && catalogAvailable && sourceIdentityMatches && builderStatus !== 'unavailable' && !projectionLoading && (
        <>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
            Text
            <input
              data-testid="x4-ui-contextual-palette-text"
              type="text"
              aria-label="New widget text"
              aria-describedby="x4-ui-contextual-palette-status"
              value={text}
              onChange={event => setText(event.target.value)}
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200"
            />
          </label>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {(['text', 'button', 'input'] as const).map(widget => (
              <button
                key={widget}
                type="button"
                data-testid={`x4-ui-contextual-palette-add-${widget}`}
                disabled={insertionDisabled}
                onClick={() => onInsert(entry.id, widget, text)}
                className="rounded border border-fuchsia-400/40 px-2 py-1 text-[9px] font-bold uppercase text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add {widget === 'input' ? 'Input' : widget[0].toUpperCase() + widget.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}
      {receipt?.status === 'refused' && <div data-testid="x4-ui-contextual-palette-refusal" className="mt-1 break-words text-red-300">That change could not be saved. Open Inspect for details.</div>}
    </section>
  );
}

const textPropertyLabels: Record<X4UiSourceTextPropertyAddition['property'], string> = {
  halign: 'Alignment', fontsize: 'Font size', wordwrap: 'Word wrap',
  x: 'Horizontal offset', y: 'Vertical offset', minRowHeight: 'Minimum row height',
};
const textPropertyLabel = (item: X4UiSourceTextPropertyAddition): string =>
  `${item.callName === 'setText2' ? 'Secondary text: ' : ''}${textPropertyLabels[item.property]}`;

/** A local choice and the existing source draft; this surface owns no Lua or history. */
export function X4UiSourceEditorAddTextProperty({ additions, staged, pending, onStage, onApply }: {
  additions: readonly X4UiSourceTextPropertyAddition[];
  staged: Readonly<Record<string, string>>;
  pending: boolean;
  onStage: (id: string, value: string) => void;
  onApply: (id: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const selected = additions.find(item => item.id === choice);
  const value = selected === undefined ? '' : staged[selected.id] ?? '';
  const hasOtherDraft = Object.keys(staged).some(id => id !== selected?.id);
  const disabled = pending || hasOtherDraft;
  if (additions.length === 0) return null;
  return <section data-testid="x4-ui-add-text-property" className="mt-2 border-t border-white/10 px-1 pt-2 text-[11px]">
    <h3 className="font-semibold text-cyan-200">Add text property</h3>
    <label className="mt-1 block text-slate-300">Property
      <select value={selected?.id ?? ''} disabled={pending || Object.keys(staged).length > 0}
        onChange={event => setChoice(event.target.value)} className="mt-1 w-full rounded border border-white/20 bg-slate-900 px-2 py-1">
        <option value="">Choose a property…</option>
        {additions.map(item => <option key={item.id} value={item.id}>{textPropertyLabel(item)}</option>)}
      </select>
    </label>
    {selected !== undefined && <label className="mt-2 block text-slate-300">{textPropertyLabel(selected)}
      {selected.valueType === 'number'
        ? <input type="number" min={selected.property === 'fontsize' ? undefined : 0} step="any" value={value} disabled={disabled}
          onChange={event => onStage(selected.id, event.target.value)} className="mt-1 w-full rounded border border-white/20 bg-black/30 px-2 py-1" />
        : <select value={value} disabled={disabled} onChange={event => onStage(selected.id, event.target.value)}
          className="mt-1 w-full rounded border border-white/20 bg-slate-900 px-2 py-1">
          <option value="">Choose a value…</option>
          {(selected.valueType === 'boolean' ? [['true', 'Yes'], ['false', 'No']] : [['left', 'Left'], ['center', 'Center'], ['right', 'Right']])
            .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>}
    </label>}
    <button type="button" disabled={disabled || selected === undefined || value.trim() === ''}
      onClick={() => { if (!disabled && selected && value.trim() !== '') onApply(selected.id); }}
      className="mt-2 rounded border border-cyan-500/40 px-2 py-1 font-semibold text-cyan-200 disabled:opacity-40">Add property</button>
    {hasOtherDraft && <p className="mt-1 text-amber-200">Apply or discard the current property changes first.</p>}
  </section>;
}

export function X4UiSourceEditorSourceEdits({
  catalog,
  staged,
  receipt,
  onStage,
  onApply,
  onDiscard,
  discardTestId = 'x4-ui-source-edit-discard',
  entries,
  title = 'Source-safe property controls',
  showTechnicalDetails = true,
  showFrameBlocks = true,
  onOpenInspect,
  inspectTargetId,
}: X4UiSourceEditorSourceEditsProps) {
  const parentCommitPending = receipt?.status === 'pending';
  const requestedEntries = entries ?? catalog.entries;
  const frameBlockEntries = (catalog.insertEntries ?? []).filter((entry): entry is X4UiSourceEditInsertBlockEntry => (
    entry.kind === 'insert-block' && entry.anchor === 'frame-display'
  ));
  const friendly = !showTechnicalDetails;
  const propertyPresentation = friendly
    ? buildX4UiBuilderPropertyPresentation(requestedEntries)
    : undefined;
  const visibleEntries = friendly
    ? propertyPresentation?.primary.map(view => view.entry) ?? []
    : requestedEntries;
  const propertyViewFor = (entry: X4UiSourceEditCatalogEntry) => propertyPresentation?.primary.find(view => view.entry === entry)
    ?? propertyPresentation?.technical.find(view => view.entry === entry)
    ?? describeX4UiBuilderProperty(entry);
  const renderReceipt = () => {
    if (receipt === undefined) return null;
    return (
      <div
        data-testid="x4-ui-source-edit-receipt"
        className={`mt-1 ${friendly ? 'px-1 py-1 text-[10px]' : 'rounded border p-2'} ${receipt.status === 'accepted' ? 'border-emerald-500/30 text-emerald-300' : receipt.status === 'pending' ? 'border-amber-500/30 text-amber-300' : 'border-red-500/30 text-red-300'}`}
      >
        {showTechnicalDetails
          ? receipt.status === 'accepted'
            ? `Accepted${receipt.changed ? ' source change' : ' no-op'}: ${receipt.detail}`
            : receipt.status === 'pending'
              ? `Pending parent workspace acknowledgement: ${receipt.detail}`
              : `Refused: ${receipt.reason} · ${receipt.detail}`
          : receipt.status === 'accepted'
            ? `Saved${receipt.changed ? ' source change' : ' no-op'}: the selected value was accepted.`
            : receipt.status === 'pending'
              ? 'Saving the selected value through the source owner…'
              : `Could not apply this value: ${receipt.detail}`}
      </div>
    );
  };
  return (
    <section data-testid="x4-ui-source-edits" className={friendly ? 'mt-1 min-w-0' : 'mt-3 rounded border border-white/10 bg-black/20 p-3'}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${friendly ? 'px-1' : ''}`}>
        <h2 className={friendly ? 'text-[11px] font-semibold text-cyan-200' : 'text-[10px] font-bold uppercase tracking-wider text-cyan-300'}>{title}</h2>
        {!friendly && <span data-testid="x4-ui-source-edit-verification" className="text-[9px] font-bold text-amber-300">{X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>}
        {onDiscard !== undefined && Object.keys(staged).length > 0 && (
          <button
            type="button"
            data-testid={discardTestId}
            disabled={parentCommitPending}
            onClick={onDiscard}
            className="rounded border border-amber-400/40 px-2 py-1 text-[9px] font-bold uppercase text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Discard property changes
          </button>
        )}
      </div>
      {showTechnicalDetails && <div data-testid="x4-ui-source-edit-catalog-detail" className="mt-1 break-words font-mono text-slate-500">{catalog.detail}</div>}
      {catalog.status === 'locked' && (
        <div data-testid="x4-ui-source-edit-catalog-locked" role="alert" className="mt-2 rounded border border-amber-500/30 bg-amber-950/20 p-2 text-[11px] text-amber-200">
          <div className="font-semibold">Property controls are unavailable for this source selection.</div>
          <div className="mt-1 break-words">{friendly ? friendlySourceEditCatalogRecovery(catalog) : catalog.detail}</div>
          {friendly && <div className="mt-2"><SourceEditInspectButton testId="x4-ui-builder-open-inspect-catalog" onOpenInspect={onOpenInspect} inspectTargetId={inspectTargetId} /></div>}
        </div>
      )}
      {friendly && propertyPresentation !== undefined && propertyPresentation.notices.length > 0 && (
        <div data-testid="x4-ui-builder-property-notices" role="status" className="mt-2 rounded border border-white/10 bg-black/20 p-2 text-[10px] text-slate-400">
          {propertyPresentation.notices.map(notice => <div key={notice}>{notice}</div>)}
          <div className="mt-2"><SourceEditInspectButton testId="x4-ui-builder-open-inspect-properties" onOpenInspect={onOpenInspect} inspectTargetId={inspectTargetId} /></div>
        </div>
      )}
      {receipt?.status !== 'accepted' && renderReceipt()}
      <div className={friendly ? 'mt-1 space-y-1' : 'mt-2 space-y-2'}>
        {visibleEntries.map(entry => {
          const hasStaged = Object.prototype.hasOwnProperty.call(staged, entry.id);
          const stagedValue = hasStaged ? staged[entry.id] : undefined;
          const propertyView = propertyViewFor(entry);
          const alignmentChoices = friendly && entry.kind === 'editable' && entry.valueType === 'string'
            && propertyView.availability === 'supported'
            && propertyView.fields.includes('semantics.properties.halign')
            && ['createText', 'setText', 'setText2', 'createEditBox'].includes(entry.provenance.callName);
          const stringDraftValue = stagedValue ?? (entry.kind === 'editable' && entry.value !== undefined ? String(entry.value) : '');
          return (
            <article key={entry.id} data-testid={`x4-ui-source-edit-entry-${entry.id}`} className={friendly ? 'min-w-0 rounded border border-white/10 bg-black/30 p-1' : 'rounded border border-white/10 bg-black/30 p-2'}>
              {!friendly && (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-200">{sourceEditFriendlyLabel(entry)}</div>
                  </div>
                  {entry.kind === 'locked' ? (
                    <span data-testid={`x4-ui-source-edit-locked-${entry.id}`} className="rounded border border-amber-500/30 px-2 py-1 text-[9px] font-bold uppercase text-amber-300">Read-only · {entry.reason}</span>
                  ) : (
                    <span className="rounded border border-emerald-500/30 px-2 py-1 text-[9px] font-bold uppercase text-emerald-300">Owner-issued literal</span>
                  )}
                </div>
              )}
              {entry.kind === 'locked' ? (
                <div data-testid={`x4-ui-source-edit-lock-reason-${entry.id}`} className={friendly ? 'px-1 py-1 text-[11px] text-amber-200' : 'mt-2 break-words text-amber-200'}>{friendly ? propertyView.recovery ?? `${propertyView.label} cannot be changed with this control; inspect the exact reason.` : `owner lock/refusal reason: ${entry.reason} · ${entry.detail}`}</div>
              ) : (
                <>
                  {showTechnicalDetails && <div className="mt-2 break-words font-mono text-slate-500">owner lock/refusal reason: none · exact owner-issued direct source literal</div>}
                  <div className={friendly ? 'flex min-w-0 items-center gap-2' : 'mt-2 flex flex-wrap items-end gap-2'}>
                  <label className={friendly ? 'flex min-w-0 flex-1 items-center gap-2 text-[11px] text-slate-300' : 'flex min-w-48 flex-1 flex-col gap-1 text-slate-500'}>
                    {friendly ? propertyView.label : `Stage ${entry.valueType} literal`}
                    {entry.valueType === 'number' && (
                      <input
                        data-testid={sourceEditInputTestId(entry.id)}
                        type="number"
                        step="any"
                        aria-label={propertyView.label}
                        value={stagedValue ?? (entry.value === undefined ? '' : String(entry.value))}
                        disabled={parentCommitPending}
                        onChange={event => onStage(entry.id, event.target.value)}
                        className={friendly ? 'min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200' : 'rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200'}
                      />
                    )}
                    {entry.valueType === 'string' && alignmentChoices && (
                      <select
                        data-testid={sourceEditInputTestId(entry.id)}
                        aria-label={propertyView.label}
                        value={stringDraftValue}
                        disabled={parentCommitPending}
                        onChange={event => onStage(entry.id, event.target.value)}
                        className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200"
                      >
                        {!['left', 'center', 'right'].includes(stringDraftValue) && <option value={stringDraftValue}>Other value: {stringDraftValue}</option>}
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    )}
                    {entry.valueType === 'string' && !alignmentChoices && (
                      <input
                        data-testid={sourceEditInputTestId(entry.id)}
                        type="text"
                        aria-label={propertyView.label}
                        value={stagedValue ?? (entry.value === undefined ? '' : String(entry.value))}
                        disabled={parentCommitPending}
                        onChange={event => onStage(entry.id, event.target.value)}
                        className={friendly ? 'min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200' : 'rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200'}
                      />
                    )}
                    {entry.valueType === 'boolean' && (
                      <span className="flex items-center gap-2 rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200">
                        <input
                          data-testid={sourceEditInputTestId(entry.id)}
                          type="checkbox"
                          aria-label={propertyView.label}
                          checked={stagedValue === undefined ? entry.value === true : stagedValue === 'true'}
                          disabled={parentCommitPending}
                          onChange={event => onStage(entry.id, String(event.target.checked))}
                        />
                        <span>{stagedValue === undefined ? String(entry.value) : stagedValue}</span>
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    data-testid={`x4-ui-source-edit-apply-${entry.id}`}
                    disabled={!hasStaged || parentCommitPending}
                    onClick={() => onApply(entry.id)}
                    className="shrink-0 rounded border border-cyan-500/30 px-2 py-1 text-[9px] font-bold uppercase text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Apply
                  </button>
                  </div>
                </>
              )}
              <details data-testid={`x4-ui-source-edit-technical-${entry.id}`} className={friendly ? 'mt-1 px-1 text-[10px] text-slate-500' : 'mt-1 font-mono text-[10px] text-slate-500'}>
                <summary className="cursor-pointer text-cyan-300">Technical source details</summary>
                {entry.kind === 'locked' && <div className="mt-1 break-words">owner lock/refusal reason: <span className="text-amber-200">{entry.reason} · {entry.detail}</span></div>}
                <div className="mt-1 break-words">source path/range: <span className="text-slate-300">{sourceEditLocationLabel(entry)}</span></div>
                <div className="break-words">call/field: <span className="text-slate-300">{sourceEditIdentityLabel(entry)}</span></div>
                <div className="break-words">current literal: <code className="text-slate-200">{sourceEditLiteralLabel(entry)}</code></div>
              </details>
            </article>
          );
        })}
      </div>
      {visibleEntries.length === 0 && (
        <div data-testid="x4-ui-builder-properties-empty-friendly" className="mt-2 text-slate-500">
          {friendly
            ? 'No user-facing property controls are available for this selection. Technical source bindings remain under Inspect.'
            : 'No owner-issued source properties were exposed for this exact selection.'}
        </div>
      )}
      {receipt?.status === 'accepted' && renderReceipt()}
      {showFrameBlocks && <section data-testid="x4-ui-source-edit-frame-blocks" className="mt-3 rounded border border-violet-500/30 bg-violet-950/10 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Frame-level direct X4 UI insertion block</h3>
          <span className="text-[9px] font-bold text-amber-300">{X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>
        </div>
        <div data-testid="x4-ui-source-edit-frame-block-detail" className="mt-1 break-words text-slate-500">
          Only the owner-issued frame/display authority may stage a bounded direct-UI construction block. Parent acknowledgement remains required before adopting changed source.
        </div>
        {frameBlockEntries.length === 0 ? (
          <div data-testid="x4-ui-source-edit-frame-block-none" className="mt-2 text-slate-500">No owner-issued frame/display block authority is available for this exact target.</div>
        ) : (
          <div className="mt-2 space-y-2">
            {frameBlockEntries.map(entry => {
              const hasStaged = Object.prototype.hasOwnProperty.call(staged, entry.id);
              return (
                <article key={entry.id} data-testid={`x4-ui-source-edit-frame-block-${entry.id}`} className="rounded border border-white/10 bg-black/30 p-2">
                  <div className="font-bold text-slate-200">{entry.id}</div>
                  <div className="mt-1 break-words text-slate-500">authority: <span className="text-slate-300">{sourceEditBlockLocationLabel(entry)}</span></div>
                  <div className="break-words text-slate-500">owner proof: <span className="text-slate-300">{sourceEditBlockOwnerLabel(entry)}</span></div>
                  <div className="break-words text-slate-500">CAS range: <span className="text-slate-300">{entry.startOffset}-{entry.endOffset} · expected text is empty at the display anchor</span></div>
                  <label className="mt-2 flex flex-col gap-1 text-slate-500">
                    Stage bounded direct X4 UI source block
                    <textarea
                      data-testid={`x4-ui-source-edit-block-input-${entry.id}`}
                      value={staged[entry.id] ?? ''}
                      disabled={parentCommitPending}
                      rows={8}
                      spellCheck={false}
                      onChange={event => onStage(entry.id, event.target.value)}
                      className="min-h-32 rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200"
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span data-testid={`x4-ui-source-edit-block-diagnostic-${entry.id}`} className="break-words text-amber-200">Diagnostic: {catalog.detail} · {X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>
                    <button
                      type="button"
                      data-testid={`x4-ui-source-edit-apply-block-${entry.id}`}
                      disabled={!hasStaged || parentCommitPending}
                      onClick={() => onApply(entry.id)}
                      className="rounded border border-violet-400/40 px-2 py-1 text-[9px] font-bold uppercase text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Apply frame block
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>}
    </section>
  );
}

interface X4UiSourceEditDraftState {
  readonly context: X4UiSourceEditContext | null;
  readonly staged: Readonly<Record<string, string>>;
  readonly receipt?: X4UiSourceEditUiReceipt;
}

/** Recheck the live draft at effect execution time before clearing drifted authority state. */
export const reconcileX4UiSourceEditDraftContext = (
  previous: X4UiSourceEditDraftState,
  current: X4UiSourceEditContext,
): X4UiSourceEditDraftState => {
  if (previous.context === current) return previous;
  if (!shouldClearX4UiSourceEditState(previous.context, current)) {
    return { ...previous, context: current };
  }
  return { context: current, staged: {} };
};

export function X4UiSourceEditorLinter({ inspection }: { readonly inspection: X4UiLintInspection }) {
  const summary = classifyX4UiLintState(inspection);
  return (
    <section data-testid="x4-ui-linter-region" className="mt-3 rounded border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Imported-source linter</h2>
        <span data-testid="x4-ui-linter-summary" className={`font-bold ${summary.kind === 'static-errors-found' ? 'text-red-300' : summary.kind === 'static-warnings-found' || summary.kind === 'static-checks-incomplete' ? 'text-amber-300' : 'text-emerald-300'}`}>{summary.label}</span>
      </div>
      {inspection.findings.length === 0 ? (
        <div className="mt-2 text-slate-500">{summary.kind === 'no-known-static-rule-violated' ? 'No imported-source findings are currently available.' : 'Imported-source findings are not complete enough to display.'}</div>
      ) : (
        <div className="mt-2 space-y-2">
          {inspection.findings.map((finding, index) => (
            <article key={`${finding.code}:${finding.location}:${index}`} className="rounded border border-white/10 bg-black/30 p-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span>severity: <strong className="text-slate-200">{finding.severity}</strong></span>
                <span>code: <strong className="text-slate-200">{finding.code}</strong></span>
                <span>source location: <strong className="text-slate-200">{finding.location}</strong></span>
              </div>
              <div className="mt-1 break-words">message: <span className="text-slate-200">{finding.message}</span></div>
              <div className="mt-1 grid grid-cols-1 gap-1 text-slate-500 lg:grid-cols-3">
                <span>failureMode: {finding.failureMode}</span>
                <span>evidenceBoundary: {finding.evidenceBoundary}</span>
                <span>nextAction: {finding.nextAction}</span>
              </div>
              {isBlockingX4UiAddTableFinding(finding) && <div data-testid="x4-ui-addtable-symptom" className="mt-1 text-amber-300">Symptom: whole frame disappears; UI reloads; conversation closes.</div>}
              <div className="mt-1 text-slate-600">file: {finding.filePath}</div>
            </article>
          ))}
        </div>
      )}
      {(inspection.diagnosticCount > 0 || inspection.verificationGapCount > 0 || inspection.lintErrorCount > 0 || inspection.truncated || inspection.incompleteFindingCount > 0) && (
        <div className="mt-2 text-amber-300">Static evidence remains incomplete; diagnostics and verification gaps are not rendered as normalized findings.</div>
      )}
    </section>
  );
}

const previewGeometryPositionLabel = (position: X4UiPreviewGeometryPosition): string => (
  `${position.line}:${position.column + 1}${position.offset === null ? '' : ` @${position.offset}`}`
);

const previewGeometryRangeLabel = (range: X4UiPreviewGeometryRange): string => (
  `${previewGeometryPositionLabel(range.start)}-${previewGeometryPositionLabel(range.end)}`
);

export function X4UiSourceEditorPreviewGeometry({ scene }: { readonly scene: unknown }) {
  const inspection = inspectX4UiPreviewGeometry(scene);
  const stateLabel = inspection.state === 'available'
    ? 'available'
    : inspection.state === 'empty'
      ? 'empty'
      : inspection.state === 'incomplete'
        ? 'incomplete'
        : 'unavailable';
  return (
    <section data-testid="x4-ui-preview-geometry-region" className="mt-3 rounded border border-violet-500/30 bg-violet-950/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Preview geometry diagnostics</h2>
        <span data-testid="x4-ui-preview-geometry-state" className="font-bold text-violet-200">{stateLabel}</span>
      </div>
      <div data-testid="x4-ui-preview-geometry-filter" className="mt-2 text-slate-500">Source-linked geometry filter: only height/width evidence is shown. Paint/text/kernel/scrollbar/state/data-flow gaps are not shown.</div>
      <div className="mt-1 text-slate-400">Scene status: <span data-testid="x4-ui-preview-geometry-scene-status" className="text-slate-200">{inspection.sceneStatus}</span></div>
      <div className="mt-1 text-slate-400">Count: <span data-testid="x4-ui-preview-geometry-count" className="font-bold text-slate-200">{inspection.diagnosticCount}</span> source-linked height/width diagnostics</div>
      {inspection.incompleteCount > 0 && (
        <div data-testid="x4-ui-preview-geometry-incomplete-count" className="mt-1 text-amber-300">Incomplete candidates: {inspection.incompleteCount} malformed source-linked height/width gap{inspection.incompleteCount === 1 ? '' : 's'} were not rendered.</div>
      )}
      {inspection.state === 'unavailable' ? (
        <div data-testid="x4-ui-preview-geometry-unavailable" className="mt-2 break-words text-slate-500">Unavailable: {inspection.detail}</div>
      ) : inspection.state === 'empty' ? (
        <div data-testid="x4-ui-preview-geometry-empty" className="mt-2 text-slate-500">Empty: no source-linked height/width diagnostics are available.</div>
      ) : (
        <div className="mt-2 space-y-2">
          {inspection.diagnostics.map((diagnostic, index) => (
            <article key={`${diagnostic.file}:${previewGeometryRangeLabel(diagnostic.range)}:${diagnostic.category}:${diagnostic.status}:${diagnostic.nodeId ?? ''}:${diagnostic.reason}:${index}`} data-testid={`x4-ui-preview-geometry-diagnostic-${index}`} className="rounded border border-white/10 bg-black/25 p-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span>category: <strong className="text-slate-200">{diagnostic.category}</strong></span>
                <span>status: <strong className="text-slate-200">{diagnostic.status}</strong></span>
              </div>
              <div className="mt-1 break-words">file: <span className="text-slate-200">{diagnostic.file}</span></div>
              <div className="mt-1 break-words">range: <span className="text-slate-200">{previewGeometryRangeLabel(diagnostic.range)}</span></div>
              <div className="mt-1 break-words">reason: <span className="text-slate-200">{diagnostic.reason}</span></div>
              {diagnostic.nodeId !== undefined && <div className="mt-1 break-words">node owner: <span className="text-slate-200">{diagnostic.nodeId}</span></div>}
            </article>
          ))}
        </div>
      )}
      <div data-testid="x4-ui-preview-geometry-boundary" className="mt-2 font-bold text-amber-300">Layout evidence only · Not verified in game</div>
    </section>
  );
}

export interface X4UiSourceEditorSamplesProps {
  readonly catalog: X4UiLayoutPreviewSampleCatalog | null;
  readonly samples: X4UiLayoutPreviewSampleInput | undefined;
  readonly draft?: X4UiSourceEditorSampleDraft;
  readonly onSampleInput: (entryId: string, raw: string) => void;
  readonly onApply?: () => void;
  readonly onReset?: () => void;
  readonly onClear?: () => void;
  readonly primary?: boolean;
  readonly presentation?: X4UiBuilderPresentation;
  readonly contextNode?: X4UiBuilderNode;
  readonly onOpenInspect?: () => void;
  readonly inspectTargetId?: string;
  readonly error?: string;
}

export interface X4UiSourceEditorSampleDraft {
  readonly catalog: X4UiLayoutPreviewSampleCatalog;
  readonly binding: X4UiEditorSampleBinding;
  readonly authority: X4UiEditorSampleCatalogAuthority;
  readonly values: Readonly<Record<string, string>>;
}

const sampleValueFor = (
  samples: X4UiLayoutPreviewSampleInput | undefined,
  entryId: string,
): X4UiLayoutScalar | undefined => samples?.values.find(value => value.id === entryId)?.value;

const sampleControlValue = (
  expectedType: X4UiLayoutPreviewSampleCatalog['entries'][number]['expectedType'],
  value: X4UiLayoutScalar | undefined,
): string => {
  if (value === undefined) return '';
  if (expectedType === 'boolean') return typeof value === 'boolean' ? String(value) : '';
  if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  return typeof value === 'string' ? value : '';
};

const sampleDraftValuesFor = (
  samples: X4UiLayoutPreviewSampleInput | undefined,
  catalog: X4UiLayoutPreviewSampleCatalog,
): Readonly<Record<string, string>> => Object.freeze(Object.fromEntries(
  catalog.entries.flatMap(entry => {
    const value = sampleValueFor(samples, entry.id);
    return value === undefined ? [] : [[entry.id, sampleControlValue(entry.expectedType, value)] as const];
  }),
));

const sampleSourceLabel = (catalog: X4UiLayoutPreviewSampleCatalog, entry: X4UiLayoutPreviewSampleCatalog['entries'][number]): string => {
  const sourcePath = entry.source.sourcePath ?? entry.source.file;
  const sourceIdentity = catalog.sourceIdentity.sourcePath ?? catalog.sourceIdentity.file;
  return `${sourcePath}:${entry.source.start.line}:${entry.source.start.column + 1}-${entry.source.end.line}:${entry.source.end.column + 1} · source identity ${sourceIdentity} · ${catalog.sourceIdentity.sha256}`;
};

export function X4UiSourceEditorSamples({
  catalog,
  samples,
  draft,
  onSampleInput,
  onApply,
  onReset,
  onClear,
  primary = false,
  presentation,
  contextNode,
  onOpenInspect,
  inspectTargetId,
  error,
}: X4UiSourceEditorSamplesProps) {
  const contextual = primary && contextNode !== undefined;
  const regionId = contextual ? 'x4-ui-context-inputs' : primary ? 'x4-ui-preview-inputs' : 'x4-ui-samples';
  const controlId = contextual ? 'x4-ui-context-input' : primary ? 'x4-ui-preview-input' : 'x4-ui-sample';
  const views = buildX4UiBuilderPreviewInputPresentation(catalog, presentation, contextual ? contextNode : undefined);
  const appliedCount = views.filter(view => sampleValueFor(samples, view.entry.id) !== undefined).length;
  return (
    <section data-testid={`${regionId}-region`} className="mt-3 rounded border border-cyan-500/30 bg-cyan-950/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">{contextual ? 'Related preview inputs' : primary ? 'Preview inputs' : 'Preview-only samples'}</h2>
        <span data-testid={`${regionId}-preview-only`} className="font-bold text-amber-300">Preview only</span>
      </div>
      <div className="mt-2 text-amber-200">{primary ? 'Try realistic values without changing your Lua. Empty inputs remain unresolved; preview values do not unlock source editing.' : 'Samples affect preview measurement only. They never change source, workspace, export bytes, linter truth, or Not verified in game.'}</div>
      {contextual && <div className="mt-2 text-slate-400">Values used by this element, its contents or containers. Other menu values can also affect the layout. Apply and Discard include input edits made in other views.</div>}
      <div data-testid={`${regionId}-applied`} className="mt-2 text-slate-400">{contextual ? `${appliedCount} of ${views.length} related values applied; ${views.length - appliedCount} not supplied.` : primary ? `${samples?.values.length ?? 0} values applied to preview. Applied values stay active until you apply or clear them.` : 'currently applied preview values remain active while edits are staged; staged edits take effect only after explicit Apply.'}</div>
      <div data-testid={`${regionId}-staged`} className="mt-1 text-slate-400">{primary ? (draft === undefined ? 'No unapplied edits' : 'Unapplied edits') : (draft === undefined ? 'no staged sample draft' : 'staged sample draft · not applied')}</div>
      {catalog === null ? (
        <div data-testid={`${regionId}-empty`} className="mt-2 text-slate-500">{primary ? 'Choose a menu to see its preview inputs.' : 'Select an exact source and target to expose the selected layout-program sample catalog.'}</div>
      ) : views.length === 0 ? (
        <div data-testid={`${regionId}-none`} className="mt-2 text-slate-500">{contextual ? 'No supported preview inputs are linked to this selection. Inspect may explain other unresolved content.' : primary ? 'This menu has no supported preview inputs. Some runtime-driven content may still need game testing.' : 'The selected layout program declares no dynamic preview samples.'}</div>
      ) : (
        <div className={contextual ? 'mt-2 max-h-64 space-y-2 overflow-y-auto' : 'mt-2 space-y-2'}>
          {views.map(({ entry, label, affectedElements }) => {
            const value = sampleValueFor(samples, entry.id);
            const controlValue = draft !== undefined && Object.prototype.hasOwnProperty.call(draft.values, entry.id)
              ? draft.values[entry.id]!
              : sampleControlValue(entry.expectedType, value);
            return (
              <label key={entry.id} data-testid={`${controlId}-${entry.id}`} className="flex flex-col gap-1 rounded border border-white/10 bg-black/25 p-2 text-slate-400">
                <span className="font-bold text-slate-200">{primary ? label : `{${entry.expression}} · ${entry.expectedType} · ${entry.id}`}</span>
                <span className="break-words text-slate-500">{primary ? `Used by ${affectedElements.join(', ') || 'menu preview'}` : sampleSourceLabel(catalog, entry)}</span>
                {entry.expectedType === 'boolean' ? (
                  <select aria-label={primary ? label : undefined} data-testid={`${controlId}-control-${entry.id}`} value={controlValue} onChange={event => onSampleInput(entry.id, event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200">
                    <option value="">{primary ? 'Not supplied' : 'Reset sample'}</option>
                    <option value="true">{primary ? 'On' : 'true'}</option>
                    <option value="false">{primary ? 'Off' : 'false'}</option>
                  </select>
                ) : primary && entry.expectedType === 'string' ? (
                  <textarea aria-label={label} data-testid={`${controlId}-control-${entry.id}`} rows={3} value={controlValue} onChange={event => onSampleInput(entry.id, event.target.value)} placeholder="Enter preview text" className="min-w-0 resize-y rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" />
                ) : (
                  <input aria-label={primary ? label : undefined} data-testid={`${controlId}-control-${entry.id}`} type={entry.expectedType === 'number' ? 'number' : 'text'} step={entry.expectedType === 'number' ? 'any' : undefined} value={controlValue} onChange={event => onSampleInput(entry.id, event.target.value)} placeholder={primary ? 'Not supplied' : `{${entry.expression}}`} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" />
                )}
              </label>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" data-testid={`${regionId}-apply`} onClick={onApply} disabled={draft === undefined || onApply === undefined} className="rounded border border-cyan-500/30 px-2 py-1 text-[9px] font-bold uppercase text-cyan-300 disabled:border-white/10 disabled:text-slate-600">{primary ? 'Apply to preview' : 'Apply staged samples'}</button>
        <button type="button" data-testid={`${regionId}-reset`} onClick={onReset} disabled={draft === undefined || onReset === undefined} className="rounded border border-white/10 px-2 py-1 text-[9px] font-bold uppercase text-slate-300 disabled:border-white/10 disabled:text-slate-600">{primary ? 'Discard edits' : 'Reset staged samples'}</button>
        {onClear !== undefined && <button type="button" data-testid={`${regionId}-clear`} onClick={onClear} disabled={catalog === null || ((samples?.values.length ?? 0) === 0 && draft === undefined)} className="rounded border border-white/10 px-2 py-1 text-[9px] font-bold uppercase text-slate-300 disabled:text-slate-600">Clear preview values</button>}
        <span data-testid={`${regionId}-truth`} className="font-bold text-amber-300">{X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>
      </div>
      {error !== undefined && <div role="alert" data-testid={`${regionId}-error`} className="mt-2 text-red-300">{primary ? 'Preview values were not applied. Check your inputs, or reselect the menu if it changed.' : error}</div>}
      {primary && <div className="mt-2"><SourceEditInspectButton testId={`${regionId}-inspect`} onOpenInspect={onOpenInspect} inspectTargetId={inspectTargetId} /></div>}
    </section>
  );
}

export interface X4UiSourceEditorPreviewPathsProps {
  readonly primary?: boolean;
  readonly catalog: X4UiLayoutPreviewPathCatalog | null;
  readonly paths: X4UiLayoutPreviewPathSelectionInput | undefined;
  readonly onPathSelection: (entryId: string) => void;
  readonly onReset: () => void;
  readonly error?: string;
}

const pathSelectionFor = (
  paths: X4UiLayoutPreviewPathSelectionInput | undefined,
  boundaryId: string,
): string | undefined => paths?.selections.find(selection => selection.boundaryId === boundaryId)?.id;

const pathBoundaryLabel = (entry: X4UiLayoutPreviewPathCatalog['entries'][number]): string => {
  const sourcePath = entry.boundary.sourcePath ?? entry.boundary.file;
  return `${sourcePath}:${entry.boundary.start.line}:${entry.boundary.start.column + 1}-${entry.boundary.end.line}:${entry.boundary.end.column + 1}`;
};

export function X4UiSourceEditorPreviewPaths({
  primary = false,
  catalog,
  paths,
  onPathSelection,
  onReset,
  error,
}: X4UiSourceEditorPreviewPathsProps) {
  const groups = catalog === null
    ? []
    : [...catalog.entries.reduce((grouped, entry) => {
      const current = grouped.get(entry.boundaryId);
      if (current === undefined) grouped.set(entry.boundaryId, [entry]);
      else current.push(entry);
      return grouped;
    }, new Map<string, X4UiLayoutPreviewPathCatalog['entries'][number][]>()).values()];
  if (primary) {
    const dispatchGroups = groups.filter(entries => entries.every(entry => entry.arm === 'dispatch'));
    if (dispatchGroups.length === 0) return null;
    return <div data-testid="x4-ui-preview-sections" className="flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
      {dispatchGroups.map((entries, index) => {
        const boundaryId = entries[0].boundaryId;
        const title = dispatchGroups.length === 1 ? 'Preview section' : `Preview section ${index + 1}`;
        return <label key={boundaryId} className="flex min-w-0 items-center gap-1 text-cyan-200">
          <span>{title}</span>
          <select aria-label={title} data-testid={`x4-ui-preview-section-${index}`}
            value={pathSelectionFor(paths, boundaryId) ?? ''} onChange={event => onPathSelection(event.target.value)}
            className="max-w-48 rounded border border-cyan-500/30 bg-[#111722] px-2 py-1 text-slate-100">
            <option value="" disabled>Choose a section</option>
            {entries.map(entry => <option key={entry.id} value={entry.id} disabled={entry.reachability === 'unreachable'}>{entry.label}</option>)}
          </select>
        </label>;
      })}
      <span className="text-amber-200" title="Choose which content to preview. This does not change your Lua or the running game.">Preview only · Lua unchanged</span>
      <button type="button" data-testid="x4-ui-preview-sections-reset" onClick={onReset}
        disabled={!paths?.selections.length} className="rounded border border-white/10 px-2 py-1 text-slate-300 disabled:text-slate-600">Clear preview choices</button>
      {error && <span role="alert" className="text-red-300">Preview section was not applied. Reselect the menu if its source changed.</span>}
    </div>;
  }
  return (
    <section data-testid="x4-ui-preview-paths-region" className="mt-3 rounded border border-fuchsia-500/30 bg-fuchsia-950/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Preview branch paths</h2>
        <span data-testid="x4-ui-preview-paths-preview-only" className="font-bold text-amber-300">Preview only</span>
      </div>
      <div className="mt-2 text-amber-200">Selected arms affect source preview only. They never change source, workspace, export bytes, linter truth, deploy state, or <span className="font-bold">Not verified in game</span>.</div>
      {catalog === null ? (
        <div data-testid="x4-ui-preview-paths-empty" className="mt-2 text-slate-500">Select an exact source and target to expose the owner-issued preview path catalog.</div>
      ) : catalog.entries.length === 0 ? (
        <div data-testid="x4-ui-preview-paths-none" className="mt-2 text-slate-500">The selected layout program declares no selectable branch arms.</div>
      ) : (
        <div className="mt-2 space-y-2">
          {groups.map(entries => {
            const boundaryId = entries[0]!.boundaryId;
            const selectedId = pathSelectionFor(paths, boundaryId);
            return (
              <fieldset key={boundaryId} data-testid={`x4-ui-preview-path-boundary-${boundaryId}`} className="rounded border border-white/10 bg-black/25 p-2">
                <legend className="break-all px-1 text-[10px] font-bold text-slate-200">Source boundary · {pathBoundaryLabel(entries[0]!)}</legend>
                <div className="mt-1 space-y-1">
                  {entries.map(entry => {
                    const unavailable = entry.reachability === 'unreachable';
                    return (
                      <label key={entry.id} data-testid={`x4-ui-preview-path-${entry.id}`} className={`flex items-start gap-2 rounded border border-white/5 px-2 py-1 text-[10px] ${unavailable ? 'text-slate-600' : 'text-slate-400'}`}>
                        <input
                          type="radio"
                          name={`x4-ui-preview-path-${boundaryId}`}
                          data-testid={`x4-ui-preview-path-control-${entry.id}`}
                          checked={selectedId === entry.id}
                          disabled={unavailable}
                          onChange={() => onPathSelection(entry.id)}
                        />
                        <span className="break-all">
                          <span className="font-bold text-slate-200">arm {entry.arm} [{entry.armIndex}]</span>
                          {' · '}{unavailable ? 'unavailable · statically unreachable' : entry.reachability}
                          {' · '}{entry.id}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" data-testid="x4-ui-preview-paths-reset" onClick={onReset} disabled={paths === undefined} className="rounded border border-fuchsia-500/30 px-2 py-1 text-[9px] font-bold uppercase text-fuchsia-300 disabled:border-white/10 disabled:text-slate-600">Reset path selections</button>
        <span data-testid="x4-ui-preview-paths-truth" className="font-bold text-amber-300">{X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>
      </div>
      {error !== undefined && <div data-testid="x4-ui-preview-paths-error" className="mt-2 break-words text-red-300">{error}</div>}
    </section>
  );
}

export interface X4UiSourceEditorPreviewLoopsProps {
  readonly catalog: X4UiLayoutPreviewLoopCatalog | null;
  readonly loops: X4UiEditorLoopState;
  readonly effectiveSelections?: X4UiEditorSessionProjection['previewLoopSelections'];
  readonly onLoopIteration: (entryId: string, raw: string) => void;
  readonly onReset: () => void;
  readonly error?: string;
}

const loopIterationFor = (
  loops: X4UiEditorLoopState,
  entryId: string,
): number | undefined => loops?.selections.find(selection => selection.id === entryId)?.iterationCount;

const loopControlValue = (loops: X4UiEditorLoopState, entryId: string): string => {
  const value = loopIterationFor(loops, entryId);
  return value === undefined ? '' : String(value);
};

const loopSourceLabel = (entry: X4UiLayoutPreviewLoopCatalog['entries'][number]): string => {
  const sourcePath = entry.source.sourcePath ?? entry.source.file;
  return `${sourcePath}:${entry.source.start.line}:${entry.source.start.column + 1}-${entry.source.end.line}:${entry.source.end.column + 1}`;
};

export function X4UiSourceEditorPreviewLoops({
  catalog,
  loops,
  effectiveSelections = [],
  onLoopIteration,
  onReset,
  error,
}: X4UiSourceEditorPreviewLoopsProps) {
  const hasEntries = catalog !== null && catalog.entries.length > 0;
  return (
    <section data-testid="x4-ui-preview-loops-region" className="mt-3 rounded border border-indigo-500/30 bg-indigo-950/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Preview Loop Iterations</h2>
        <span data-testid="x4-ui-preview-loops-preview-only" className="font-bold text-amber-300">Preview only</span>
      </div>
      <div className="mt-2 text-amber-200">Finite loop selections affect preview replay only. They never change source, workspace, export bytes, linter truth, deploy state, or <span className="font-bold">Not verified in game</span>.</div>
      {catalog === null ? (
        <div data-testid="x4-ui-preview-loops-empty" className="mt-2 text-slate-500">Select an exact source and target to expose the owner-issued preview loop catalog.</div>
      ) : catalog.entries.length === 0 ? (
        <div data-testid="x4-ui-preview-loops-none" className="mt-2 text-slate-500">The selected layout program declares no selectable direct preview loops.</div>
      ) : (
        <div className="mt-2 space-y-2">
          {catalog.entries.map((entry, index) => {
            const manualCount = loopIterationFor(loops, entry.id);
            const effectiveCount = effectiveSelections.find(selection => selection.id === entry.id)?.iterationCount;
            const automaticCount = manualCount === undefined ? effectiveCount : undefined;
            return (
              <div key={entry.id} data-testid={`x4-ui-preview-loop-${entry.id}`} className="flex flex-col gap-1 rounded border border-white/10 bg-black/25 p-2 text-slate-400">
                <span className="font-bold text-slate-200">Loop {index + 1}</span>
                <span data-testid={`x4-ui-preview-loop-status-${entry.id}`} className="text-slate-200" aria-live="polite">
                  {manualCount !== undefined ? `Manual preview: ${manualCount} iteration${manualCount === 1 ? '' : 's'}`
                    : automaticCount !== undefined ? `Automatic from source: ${automaticCount} iteration${automaticCount === 1 ? '' : 's'}`
                      : 'Count unavailable: enter a preview override'}
                </span>
                <label className="flex flex-col gap-1 text-slate-400">
                  Preview override · iterations (1–16, optional when automatic)
                  <input
                    data-testid={`x4-ui-preview-loop-control-${entry.id}`}
                    aria-label={`Loop ${index + 1} preview override`}
                    type="number"
                    min={1}
                    max={16}
                    step={1}
                    value={loopControlValue(loops, entry.id)}
                    onChange={event => onLoopIteration(entry.id, event.target.value)}
                    placeholder={automaticCount === undefined ? '' : `Automatic: ${automaticCount}`}
                    className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200"
                  />
                </label>
                {automaticCount !== undefined && <span className="text-slate-400">Leave the override empty to use the source count.</span>}
                <details data-testid={`x4-ui-preview-loop-details-${entry.id}`} className="mt-1 text-slate-500">
                  <summary className="cursor-pointer">Source details</summary>
                  <div data-testid={`x4-ui-preview-loop-source-${entry.id}`} className="break-all">Source range: {loopSourceLabel(entry)}</div>
                  <div data-testid={`x4-ui-preview-loop-metadata-${entry.id}`} className="break-all">Kind: {entry.kind} · multiplicity: {entry.multiplicity} · ID: {entry.id} · depth: {entry.depth} · provenance: {entry.provenance}</div>
                </details>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" data-testid="x4-ui-preview-loops-reset" onClick={onReset} disabled={!hasEntries || loops === undefined} className="rounded border border-indigo-500/30 px-2 py-1 text-[9px] font-bold uppercase text-indigo-300 disabled:border-white/10 disabled:text-slate-600">Reset preview loop iterations</button>
        <span data-testid="x4-ui-preview-loops-truth" className="font-bold text-amber-300">{X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>
      </div>
      {error !== undefined && <div data-testid="x4-ui-preview-loops-error" className="mt-2 break-words text-red-300">{error}</div>}
    </section>
  );
}

export default function X4UiSourceEditor({
  workspace,
  corpusLoader,
  surfaceFactory,
  onWorkspaceEdit,
  workspaceScope,
  historyRestoration,
  onVerificationSnapshotChange,
  onSessionProjection,
}: X4UiSourceEditorProps) {
  const [profile, setProfile] = useState<X4UiEditorProfileControls>(() => ({
    width: X4_UI_EDITOR_DEFAULT_PROFILE.drawable.width,
    height: X4_UI_EDITOR_DEFAULT_PROFILE.drawable.height,
    uiScale: X4_UI_EDITOR_DEFAULT_PROFILE.uiScale,
  }));
  const [scaleMode, setScaleMode] = useState<X4UiSourceEditorScaleMode>(X4_UI_SOURCE_EDITOR_SCALE_MODE_DERIVED);
  const [userScale, setUserScale] = useState(X4_UI_SOURCE_EDITOR_DEFAULT_USER_SCALE);
  const [profileError, setProfileError] = useState<string | undefined>(undefined);
  const currentWorkspaceScope = workspaceScope || '';
  const previewBeforeRef = useRef<{
    readonly workspace: unknown; readonly scope: string; readonly projection: X4UiEditorSessionProjection;
    readonly selectionEpoch: number;
  } | null>(null);
  type PreviewEditContinuation = WorkspaceSourceContinuation & { readonly beforeProjection: X4UiEditorSessionProjection; readonly selectionEpoch: number };
  const previewEditTransitionRef = useRef<PreviewEditContinuation | null>(null);
  const [acceptedPreviewEdit, setAcceptedPreviewEdit] = useState<PreviewEditContinuation | null>(null);
  // View intent only, scoped to this mounted editor and immutable workspace ID. Catalog
  // reconciliation below must still resolve these exact keys before issuing any selection.
  const [workspaceSelections, setWorkspaceSelections] = useState<ReadonlyMap<string, {
    readonly sourceSelector: string;
    readonly targetSelector: string;
  }>>(() => new Map());
  const sourceSelector = workspaceSelections.get(currentWorkspaceScope)?.sourceSelector ?? '';
  const targetSelector = workspaceSelections.get(currentWorkspaceScope)?.targetSelector ?? '';
  const setSourceSelector = useCallback((value: string): void => {
    setWorkspaceSelections(previous => {
      const selected = previous.get(currentWorkspaceScope);
      if ((selected?.sourceSelector ?? '') === value) return previous;
      return new Map(previous).set(currentWorkspaceScope, {
        sourceSelector: value, targetSelector: selected?.targetSelector ?? '',
      });
    });
  }, [currentWorkspaceScope]);
  const setTargetSelector = useCallback((value: string): void => {
    setWorkspaceSelections(previous => {
      const selected = previous.get(currentWorkspaceScope);
      if ((selected?.targetSelector ?? '') === value) return previous;
      return new Map(previous).set(currentWorkspaceScope, {
        sourceSelector: selected?.sourceSelector ?? '', targetSelector: value,
      });
    });
  }, [currentWorkspaceScope]);
  const [pathInput, setPathInput] = useState<X4UiEditorPathState>(undefined);
  const [pathBinding, setPathBinding] = useState<X4UiEditorPathBinding | undefined>(undefined);
  const [pathCatalogAuthority, setPathCatalogAuthority] = useState<X4UiEditorPathCatalogAuthority | undefined>(undefined);
  const [pathError, setPathError] = useState<string | undefined>(undefined);
  const [loopInput, setLoopInput] = useState<X4UiEditorLoopState>(undefined);
  const [loopBinding, setLoopBinding] = useState<X4UiEditorLoopBinding | undefined>(undefined);
  const [loopCatalogAuthority, setLoopCatalogAuthority] = useState<X4UiEditorLoopCatalogAuthority | undefined>(undefined);
  const [loopError, setLoopError] = useState<string | undefined>(undefined);
  const [sampleInput, setSampleInput] = useState<X4UiEditorSampleState>(undefined);
  const [sampleBinding, setSampleBinding] = useState<X4UiEditorSampleBinding | undefined>(undefined);
  const [sampleCatalogAuthority, setSampleCatalogAuthority] = useState<X4UiEditorSampleCatalogAuthority | undefined>(undefined);
  const [sampleDraft, setSampleDraft] = useState<X4UiSourceEditorSampleDraft | undefined>(undefined);
  const [sampleError, setSampleError] = useState<string | undefined>(undefined);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [enabledEntryIds, setEnabledEntryIds] = useState<readonly string[]>([]);
  const [manualCalibrationState, setManualCalibrationState] = useState<X4UiManualCalibrationState>(() => createX4UiManualCalibrationState());
  const [corpusState, setCorpusState] = useState<CorpusLoadState>(EMPTY_CORPUS_STATE);
  const [corpusGeneration, setCorpusGeneration] = useState(0);
  const [canvasState, setCanvasState] = useState<X4UiEditorCanvasState>(() => X4_UI_EDITOR_EMPTY_CANVAS_STATE);
  const [canvasExportFeedback, setCanvasExportFeedback] = useState<string | undefined>(undefined);
  const [canvasZoomMode, setCanvasZoomMode] = useState<X4UiBuilderViewportMode>('fit-menu');
  const [manualCanvasZoomScale, setManualCanvasZoomScale] = useState(1);
  const [canvasFocusRevision, setCanvasFocusRevision] = useState(0);
  const [canvasViewportSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
  const [builderSelection, setBuilderSelection] = useState<X4UiBuilderSelection | null>(null);
  const [sourceEditDraft, setSourceEditDraft] = useState<X4UiSourceEditDraftState>(() => ({
    context: null,
    staged: {},
  }));
  const selectionEpochRef = useRef(0);
  const selectedMenuIntentRef = useRef<{
    readonly workspace: unknown;
    readonly scope: string;
    readonly intent: X4UiSourceEditSelectionIntent;
    readonly selectionEpoch: number;
    readonly builder?: X4UiBuilderHistoryIntent;
  } | null>(null);
  const historySelectionCarryRef = useRef<{
    readonly notice: X4UiHistoryRestorationNotice;
    readonly sourceWorkspace: unknown;
    readonly scope: string;
    readonly intent: X4UiSourceEditSelectionIntent;
    readonly selectionEpoch: number;
    readonly lastWorkspace: unknown;
    readonly builder?: X4UiBuilderHistoryIntent;
  } | null>(null);
  const lastHistoryRestorationNoticeRef = useRef<X4UiHistoryRestorationNotice | null>(null);
  const previousWorkspaceRef = useRef(workspace);
  const loopInputRef = useRef<X4UiEditorLoopState>(undefined);
  const loopCatalogRef = useRef<X4UiLayoutPreviewLoopCatalog | null>(null);
  const loopCatalogAuthorityRef = useRef<X4UiEditorLoopCatalogAuthority | undefined>(undefined);
  const sampleDraftRef = useRef<X4UiSourceEditorSampleDraft | undefined>(sampleDraft);
  const builderSelectionRef = useRef<X4UiBuilderSelection | null>(builderSelection);
  const sourceEditContextRef = useRef<X4UiSourceEditContext | null>(null);
  const sourceEditDraftRef = useRef(sourceEditDraft);
  const canvasStateRef = useRef(canvasState);
  const canvasWorkspaceScopeRef = useRef(currentWorkspaceScope);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasZoomAnchorRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const canvasCameraRef = useRef({ scale: 1, viewportWidth: 0, viewportHeight: 0, scrollLeft: 0, scrollTop: 0 });
  const canvasViewportKeyRef = useRef<string | null>(null);
  const currentVerificationSnapshotRef = useRef<X4UiGameVerificationCurrentSnapshot | null>(null);
  const canvasExportIdentityRef = useRef<X4UiGameVerificationCurrentSnapshot | null>(null);
  const canvasExportInFlightRef = useRef(false);
  const sessionProjectionObserverRef = useRef(onSessionProjection);
  const [rendererSession] = useState<X4UiCanvasRenderSession>(() => createX4UiCanvasRenderSession());
  const inspectPanelRef = useRef<HTMLDetailsElement | null>(null);
  const inspectTargetId = `x4-ui-inspect-panel-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const openInspect = useCallback(() => openX4UiSourceEditorInspect(inspectPanelRef.current), []);

  const resetCanvasView = useCallback((): void => {
    // A working camera belongs to the menu being viewed, not the next navigation target.
    canvasZoomAnchorRef.current = null;
    canvasViewportKeyRef.current = null;
    canvasCameraRef.current = { scale: 1, viewportWidth: 0, viewportHeight: 0, scrollLeft: 0, scrollTop: 0 };
    setManualCanvasZoomScale(1);
    setCanvasZoomMode('fit-menu');
  }, []);

  const invalidateHistorySelectionCarry = useCallback(() => {
    selectionEpochRef.current += 1;
    historySelectionCarryRef.current = null;
  }, []);

  sessionProjectionObserverRef.current = onSessionProjection;

  const resolvedCorpusLoader = useMemo(() => corpusLoader ?? defaultCorpusLoader, [corpusLoader]);
  const resolvedSurfaceFactory = useMemo(() => surfaceFactory ?? defaultSurfaceFactory, [surfaceFactory]);
  const profileValue = useMemo(() => profile, [profile]);
  const manualSessionInput = useMemo(
    () => buildX4UiManualCalibrationSessionInput(manualCalibrationState),
    [manualCalibrationState],
  );
  const sessionOwner = useMemo(
    () => createX4UiEditorSessionOwner(workspace),
    [workspace],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const requestGeneration = corpusGeneration;
    setCorpusState({
      status: 'loading',
      result: null,
      detail: 'Loading configured canonical X4 corpus evidence.',
      colorStatus: 'loading',
      colorDetail: 'Loading configured canonical-default color evidence.',
    });
    void resolvedCorpusLoader({ signal: controller.signal }).then(result => {
      const classification = classifyX4UiCorpusLoadResult({
        result,
        loaderIssued: true,
        signalAborted: controller.signal.aborted,
        requestActive: active,
        requestGeneration,
        currentGeneration: corpusGeneration,
      });
      if (classification.status === 'ignored') return;
      setCorpusState({
        status: classification.status,
        result: classification.result,
        detail: classification.detail,
        colorStatus: classification.colorStatus,
        colorDetail: classification.colorDetail,
        ...(classification.colorEvidence === undefined ? {} : { colorEvidence: classification.colorEvidence }),
      });
    }).catch(error => {
      const classification = classifyX4UiCorpusLoadResult({
        result: error,
        loaderIssued: true,
        signalAborted: controller.signal.aborted,
        requestActive: active,
        requestGeneration,
        currentGeneration: corpusGeneration,
      });
      if (classification.status === 'ignored') return;
      setCorpusState({
        status: classification.status,
        result: null,
        detail: classification.detail,
        colorStatus: classification.colorStatus,
        colorDetail: classification.colorDetail,
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [corpusGeneration, resolvedCorpusLoader]);

  const canonicalCorpus = isX4UiCorpusCanonicalSuccess(corpusState.result)
    ? corpusState.result as X4UiCorpusCanonicalSuccess
    : null;
  const canonicalColorEvidence = canonicalCorpus !== null && canonicalColorSuccess(corpusState.colorEvidence)
    ? corpusState.colorEvidence
    : undefined;

  const committedPreview = previewBeforeRef.current;
  const previewContinuation = useMemo(() => {
    // Source edits use the existing exact acknowledgement/selection owner. Only
    // history has an App-guarded notice on the first replacement render.
    const edit = acceptedPreviewEdit !== null && acceptedPreviewEdit.afterWorkspace === workspace
      && acceptedPreviewEdit.scope === currentWorkspaceScope && acceptedPreviewEdit.selectionEpoch === selectionEpochRef.current
      ? acceptedPreviewEdit : null;
    const before = edit === null ? committedPreview : {
      workspace: edit.beforeWorkspace, scope: edit.scope, projection: edit.beforeProjection, selectionEpoch: edit.selectionEpoch,
    };
    if (before === null || before.scope !== currentWorkspaceScope || before.selectionEpoch !== selectionEpochRef.current) return undefined;
    const notice = [historyRestoration, edit].find(item => item !== null && item !== undefined
      && item.scope === currentWorkspaceScope && item.beforeWorkspace === before.workspace && item.afterWorkspace === workspace);
    if (notice?.sourceSplice === undefined || before.workspace === workspace) return undefined;
    const freshSelection = resolvePreviewScenarioTransitionSelection(sessionOwner,
      { workspace, corpus: canonicalCorpus, profile: profileValue } as X4UiEditorSessionInput, before.projection, notice.sourceSplice);
    return { before: before.projection, splice: notice.sourceSplice, scope: currentWorkspaceScope, afterWorkspace: workspace, freshSelection };
  }, [workspace, currentWorkspaceScope, historyRestoration, profileValue, sessionOwner, canonicalCorpus, acceptedPreviewEdit, committedPreview]);

  const selection = useMemo(() => {
    const candidates = sourceCandidatesFor(sessionOwner.candidateCatalog);
    let reconciled = reconcileX4UiEditorSelections({
      sourceSelector,
      targetSelector,
      candidates,
    });
    if (previewContinuation !== undefined) {
      const fresh = previewContinuation.freshSelection;
      const freshSource = fresh === undefined ? undefined : candidates.find(candidate => candidate.path === fresh.path && candidate.index === fresh.sourceIndex);
      const freshTargetId = asRecord(fresh?.target)?.id;
      const freshTargets = freshSource?.targets.filter(candidate => candidate.raw.id === freshTargetId) ?? [];
      if (freshSource !== undefined && freshTargets.length === 1) reconciled = { sourceSelector: freshSource.key, targetSelector: freshTargets[0]!.key };
    }
    const source = candidates.find(candidate => candidate.key === reconciled.sourceSelector);
    const target = source?.targets.find(candidate => candidate.key === reconciled.targetSelector);
    if (source === undefined || target === undefined || !asRecord(source.sourceIdentity)) {
      return {
        candidates,
        source,
        target,
        reconciled,
        selection: undefined,
      };
    }
    return {
      candidates,
      source,
      target,
      reconciled,
      selection: {
        sourceIndex: source.index,
        path: source.path,
        sourceIdentity: source.sourceIdentity,
        target: target.raw,
      },
    };
  }, [
    sessionOwner,
    sourceSelector,
    targetSelector,
    previewContinuation,
  ]);

  const sessionInput = useMemo(() => ({
    workspace,
    corpus: canonicalCorpus,
    profile: profileValue,
    enabledEntryIds,
    manualCalibrations: manualSessionInput.manualCalibrations,
    enabledManualEntryIds: manualSessionInput.enabledManualEntryIds,
    ...(canonicalColorEvidence === undefined ? {} : { colorEvidence: canonicalColorEvidence }),
    ...(pathBinding === undefined ? {} : { pathBinding }),
    ...(pathCatalogAuthority === undefined ? {} : { pathCatalogAuthority }),
    ...(pathInput === undefined ? {} : { paths: pathInput }),
    ...(loopBinding === undefined ? {} : { loopBinding }),
    ...(loopCatalogAuthority === undefined ? {} : { loopCatalogAuthority }),
    ...(loopInput === undefined ? {} : { loops: loopInput }),
    ...(sampleBinding === undefined ? {} : { sampleBinding }),
    ...(sampleCatalogAuthority === undefined ? {} : { sampleCatalogAuthority }),
    ...(sampleInput === undefined ? {} : { samples: sampleInput }),
    ...(activePresetId === null ? {} : { activePresetId }),
    ...(selection.selection === undefined ? {} : { selection: selection.selection }),
  }) as unknown as X4UiEditorSessionInput, [
    activePresetId,
    canonicalColorEvidence,
    canonicalCorpus,
    enabledEntryIds,
    manualSessionInput.enabledManualEntryIds,
    manualSessionInput.manualCalibrations,
    pathBinding,
    pathCatalogAuthority,
    pathInput,
    loopBinding,
    loopCatalogAuthority,
    loopInput,
    profileValue,
    sampleBinding,
    sampleCatalogAuthority,
    sampleInput,
    selection.selection,
    workspace,
  ]);

  useLayoutEffect(() => {
    const previousWorkspace = previousWorkspaceRef.current;
    const previousCarry = historySelectionCarryRef.current;
    const notice = historyRestoration ?? null;
    const workspaceChanged = previousWorkspace !== workspace;
    const prior = selectedMenuIntentRef.current;
    const priorIntentMatches = notice !== null
      && prior !== null
      && prior.workspace === notice.beforeWorkspace
      && prior.scope === notice.scope
      && prior.selectionEpoch === selectionEpochRef.current;
    const chainedIntentMatches = notice !== null
      && previousCarry !== null
      && previousCarry.scope === notice.scope
      && previousCarry.lastWorkspace === notice.beforeWorkspace
      && previousCarry.notice.afterWorkspace === notice.beforeWorkspace
      && previousCarry.selectionEpoch === selectionEpochRef.current;
    const sameRestoration = notice !== null && previousCarry !== null
      && notice.direction === previousCarry.notice.direction && notice.scope === previousCarry.scope
      && notice.beforeWorkspace === previousCarry.notice.beforeWorkspace
      && notice.afterWorkspace === previousCarry.notice.afterWorkspace
      && previousCarry.selectionEpoch === selectionEpochRef.current;
    const carryingSourceReturn = notice !== null
      && previousCarry !== null
      && historyRestoration === previousCarry.notice
      && previousWorkspace === previousCarry.lastWorkspace
      && workspace === previousCarry.sourceWorkspace
      && previousCarry.scope === currentWorkspaceScope
      && previousCarry.selectionEpoch === selectionEpochRef.current;
    const exactRestoration = notice !== null
      && notice.scope === currentWorkspaceScope
      && notice.afterWorkspace === workspace
      && (
        (workspaceChanged && (notice.beforeWorkspace === previousWorkspace || chainedIntentMatches))
        // App publishes a successful notice in the readback effect, after the target
        // workspace render. This second-render path is still exact because it must match
        // the immediately preceding owner-issued menu intent and immutable scope.
        || (!workspaceChanged && (priorIntentMatches || chainedIntentMatches || sameRestoration))
      );

    if (workspaceChanged && !exactRestoration && !carryingSourceReturn) historySelectionCarryRef.current = null;
    if (notice === null) {
      historySelectionCarryRef.current = null;
    } else if (lastHistoryRestorationNoticeRef.current !== notice) {
      lastHistoryRestorationNoticeRef.current = notice;
      if (!exactRestoration) {
        historySelectionCarryRef.current = null;
      } else {
        if (priorIntentMatches && prior !== null && (prior.builder !== undefined || !chainedIntentMatches)) {
          historySelectionCarryRef.current = {
            notice,
            sourceWorkspace: prior.workspace,
            scope: prior.scope,
            intent: prior.intent,
            selectionEpoch: prior.selectionEpoch,
            lastWorkspace: workspace,
            builder: prior.builder,
          };
        } else if (sameRestoration && previousCarry !== null) {
          // App's final receipt can replace its equivalent pending preview notice
          // before fresh selectors have committed. Keep that exact in-flight intent.
          historySelectionCarryRef.current = { ...previousCarry, notice };
        } else if (chainedIntentMatches && previousCarry !== null) {
          historySelectionCarryRef.current = {
            notice,
            sourceWorkspace: previousCarry.sourceWorkspace,
            scope: previousCarry.scope,
            intent: previousCarry.intent,
            selectionEpoch: previousCarry.selectionEpoch,
            lastWorkspace: workspace,
            builder: previousCarry.builder,
          };
        } else {
          historySelectionCarryRef.current = null;
        }
      }
    }
    previousWorkspaceRef.current = workspace;
  }, [currentWorkspaceScope, historyRestoration, workspace]);

  const projectedPreview = useMemo(
    () => {
      if (previewContinuation !== undefined) {
        // These are the current validated controls copied unchanged by the
        // session profile normalizer. Do not build a preview just to read them.
        const captured = capturePreviewScenario(previewContinuation.before, {
          width: profileValue.width, height: profileValue.height, uiScale: profileValue.uiScale, scaleMode, userScale,
        }, 'current-preview', 'Current preview');
        if (captured.ok) {
          const transferred = transferPreviewScenario(sessionOwner, sessionInput, captured.scenario, previewContinuation.before, previewContinuation.splice);
          if (transferred.ok === true) return { projection: transferred.projection, continuation: previewContinuation };
          return { projection: sessionOwner.project(sessionInput), error: transferred.message };
        }
      }
      return { projection: sessionOwner.project(sessionInput) };
    },
    [sessionInput, sessionOwner, previewContinuation, profileValue, scaleMode, userScale],
  );
  const projection = projectedPreview.projection;

  useLayoutEffect(() => {
    if (projectedPreview.continuation !== undefined) {
      // Adopt the freshly issued state before a parent acknowledgement can cause its
      // second render. The first projection itself already contains the retained values.
      setPathInput(projection.paths);
      setPathBinding(projection.paths === undefined ? undefined : projection.pathBinding);
      setPathCatalogAuthority(projection.paths === undefined ? undefined : projection.pathCatalogAuthority);
      setLoopInput(projection.loops);
      setLoopBinding(projection.loops === undefined ? undefined : projection.loopBinding);
      setLoopCatalogAuthority(projection.loops === undefined ? undefined : projection.loopCatalogAuthority);
      setSampleInput(projection.samples);
      setSampleBinding(projection.samples === undefined ? undefined : projection.sampleBinding);
      setSampleCatalogAuthority(projection.samples === undefined ? undefined : projection.sampleCatalogAuthority);
      setSampleDraft(undefined);
      setSampleError(undefined);
      setPathError(undefined);
      setLoopError(undefined);
    } else if (projectedPreview.error !== undefined) setSampleError(projectedPreview.error);
    if (acceptedPreviewEdit !== null) setAcceptedPreviewEdit(null);
  }, [projectedPreview, projection, acceptedPreviewEdit]);

  // Selection-only commits can advance the user-interruption epoch without changing
  // the memoized preview. Retain the actual last committed epoch as well as its data.
  useLayoutEffect(() => {
    const before = previewBeforeRef.current;
    if (before === null || before.workspace !== workspace || before.scope !== currentWorkspaceScope || before.projection !== projection
      || before.selectionEpoch !== selectionEpochRef.current) {
      previewBeforeRef.current = { workspace, scope: currentWorkspaceScope, projection, selectionEpoch: selectionEpochRef.current };
    }
  });

  useEffect(() => {
    sessionProjectionObserverRef.current?.(projection);
  }, [projection]);

  loopInputRef.current = loopInput;
  loopCatalogRef.current = projection.loopCatalog;
  loopCatalogAuthorityRef.current = projection.loopCatalogAuthority;
  const projectionView = projectionFor(projection);
  const preview = previewFor(projection);
  const currentVerificationSnapshot = useMemo(
    () => buildX4UiGameVerificationCurrentSnapshot({
      sourceIdentity: selection.selection?.sourceIdentity,
      targetIdentity: selection.selection?.target,
      normalizedProfile: projectionView.normalizedProfile,
    }),
    [projectionView.normalizedProfile, selection.selection],
  );
  currentVerificationSnapshotRef.current = currentVerificationSnapshot;
  const currentVerificationSnapshotKey = currentVerificationSnapshot === null
    ? 'none'
    : canvasExportIdentityKey(currentVerificationSnapshot);
  const committedVerificationSnapshotKey = canvasExportIdentityRef.current === null
    ? null
    : canvasExportIdentityKey(canvasExportIdentityRef.current);
  const canvasCommitMatchesSnapshot = currentVerificationSnapshot === null
    ? canvasState.status !== 'current'
    : canvasState.status === 'current'
      && canvasState.stale === false
      && canvasState.surface === (canvasHostRef.current?.firstElementChild as unknown as X4UiCanvasSurface | null | undefined)
      && (currentVerificationSnapshotKey !== null && committedVerificationSnapshotKey !== null
        ? currentVerificationSnapshotKey === committedVerificationSnapshotKey
        : canvasExportIdentityRef.current === currentVerificationSnapshot);

  const source = projectionView.source;
  const lintInspection = lintInspectionFor(preview);
  const currentProgramResult = projection.preview.program;
  const currentProgramRefusalMessage = currentProgramResult !== undefined && 'refusal' in currentProgramResult
    ? currentProgramResult.refusal.message
    : undefined;
  const currentProgram = currentProgramResult?.status === 'refused' ? undefined : currentProgramResult?.program;
  const currentEvidenceAuthority = currentProgramResult?.status === 'refused' ? undefined : currentProgramResult?.evidenceAuthority;
  const sourceEditCatalog = useMemo(
    () => discoverX4UiSourceEditorCatalog(workspace, projection),
    [projection, workspace],
  );
  const builderPresentation = useMemo<X4UiBuilderPresentation>(
    () => buildX4UiBuilderPresentation(projection),
    [projection],
  );
  const builderSelectionContext = useMemo(() => ({
    workspace,
    sourceIdentityKey: builderPresentation.sourceIdentityKey,
    targetId: builderPresentation.targetId,
    profileKey: builderPresentation.profileKey,
  }), [builderPresentation.profileKey, builderPresentation.sourceIdentityKey, builderPresentation.targetId, workspace]);
  const reconciledBuilderSelection = useMemo(
    () => reconcileX4UiBuilderSelection(builderSelection, builderSelectionContext, builderPresentation.nodes),
    [builderPresentation.nodes, builderSelection, builderSelectionContext],
  );
  const selectedBuilderNode = useMemo(
    () => reconciledBuilderSelection === undefined
      ? undefined
      : builderPresentation.nodes.find(node => node.id === reconciledBuilderSelection.nodeId),
    [builderPresentation.nodes, reconciledBuilderSelection],
  );
  const contextualPreviewInputs = useMemo(
    () => selectedBuilderNode === undefined ? []
      : buildX4UiBuilderPreviewInputPresentation(projection.sampleCatalog, builderPresentation, selectedBuilderNode),
    [builderPresentation, projection.sampleCatalog, selectedBuilderNode],
  );
  useLayoutEffect(() => {
    const carry = historySelectionCarryRef.current;
    if (carry === null) return;
    const awaitingSourceReturn = historyRestoration === carry.notice
      && workspace === carry.sourceWorkspace
      && workspace !== carry.notice.afterWorkspace
      && currentWorkspaceScope === carry.scope
      && selectionEpochRef.current === carry.selectionEpoch;
    if (
      (!awaitingSourceReturn && historyRestoration !== carry.notice)
      || currentWorkspaceScope !== carry.scope
      || (!awaitingSourceReturn && workspace !== carry.notice.afterWorkspace)
      || selectionEpochRef.current !== carry.selectionEpoch
    ) {
      historySelectionCarryRef.current = null;
      return;
    }
    if (awaitingSourceReturn) return;
    const selected = resolveSourceEditSelectionIntent(selection.candidates, carry.intent);
    if (selected === undefined) return;
    if (sourceSelector !== selected.sourceSelector || targetSelector !== selected.targetSelector) {
      setSourceSelector(selected.sourceSelector);
      setTargetSelector(selected.targetSelector);
      return; // Selection keys must reproject before any element can be resolved.
    }
    if (corpusState.status === 'loading') return;
    const intent = carry.builder;
    if (intent !== undefined && intent.profileKey !== builderSelectionContext.profileKey) {
      historySelectionCarryRef.current = null;
      return;
    }
    const fresh = intent !== undefined && intent.profileKey === builderSelectionContext.profileKey
      && sourceEditCatalog !== undefined
      ? resolveX4UiBuilderNodeAfterHistory(builderPresentation.nodes, intent.anchor, intent.catalog, sourceEditCatalog, carry.notice.sourceSplice)
      : undefined;
    if (fresh !== undefined && builderSelectionContext.sourceIdentityKey !== null
      && builderSelectionContext.targetId !== undefined && builderSelectionContext.profileKey !== null) {
      setBuilderSelection({ ...builderSelectionContext, nodeId: fresh.id });
      historySelectionCarryRef.current = null;
    }
    // A removed element has no substitute. Keep only its source anchor through
    // contiguous scoped history notices, so an exact later return can resolve it.
    // Explicit selection/navigation or an unrelated workspace change cancels it.
  }, [
    builderPresentation.nodes, builderSelectionContext, corpusState.status, currentWorkspaceScope,
    historyRestoration, selection.candidates, setSourceSelector, setTargetSelector,
    sourceEditCatalog, sourceSelector, targetSelector, workspace,
  ]);

  useLayoutEffect(() => {
    const source = selection.source;
    const target = selection.target;
    if (currentWorkspaceScope === '' || source === undefined || target === undefined) return;
    const targetKind = target.raw.kind;
    const targetNameValue = target.raw.name;
    if (typeof targetKind !== 'string' || (targetNameValue !== undefined && typeof targetNameValue !== 'string')) return;
    const targetName = targetNameValue as string | undefined;
    selectedMenuIntentRef.current = {
      workspace,
      scope: currentWorkspaceScope,
      intent: { path: source.path, targetKind, ...(targetName === undefined ? {} : { targetName }) },
      selectionEpoch: selectionEpochRef.current,
      ...(selectedBuilderNode === undefined || sourceEditCatalog === undefined ? {} : {
        builder: {
          anchor: { kind: selectedBuilderNode.kind, source: selectedBuilderNode.source },
          catalog: sourceEditCatalog,
          profileKey: builderSelectionContext.profileKey,
        },
      }),
    };
  }, [builderSelection, builderSelectionContext.profileKey, currentWorkspaceScope, selectedBuilderNode,
    selection.source, selection.target, sourceEditCatalog, workspace]);

  const selectedBuilderEntries = useMemo(
    () => sourceEntriesForX4UiBuilderNode(sourceEditCatalog, selectedBuilderNode),
    [selectedBuilderNode, sourceEditCatalog],
  );
  const contextualTextPropertyAdditions = useMemo(() => {
    if (!sourceEditCatalog || !selectedBuilderNode
      || !['text', 'widget'].includes(selectedBuilderNode.kind)) return [];
    return selectedBuilderNode.propertyOperationIds.flatMap(operationId =>
      discoverX4UiSourceTextPropertyAdditions(sourceEditCatalog, operationId));
  }, [sourceEditCatalog, selectedBuilderNode]);
  const contextualInsertionEntry = useMemo(
    () => resolveX4UiSourceEditorContextualInsertionEntry(
      sourceEditCatalog,
      builderPresentation.nodes,
      selectedBuilderNode,
      builderPresentation.sourceIdentityKey,
    ),
    [builderPresentation.nodes, builderPresentation.sourceIdentityKey, selectedBuilderNode, sourceEditCatalog],
  );
  const contextualRowInsertionEntry = useMemo(
    () => resolveX4UiSourceEditorContextualRowInsertionEntry(
      sourceEditCatalog,
      builderPresentation.nodes,
      selectedBuilderNode,
      builderPresentation.sourceIdentityKey,
      builderPresentation.targetId,
    ),
    [builderPresentation.nodes, builderPresentation.sourceIdentityKey, builderPresentation.targetId, selectedBuilderNode, sourceEditCatalog],
  );
  const contextualRowMove = useMemo(
    () => resolveX4UiSourceEditorContextualRowMoveEntries(
      sourceEditCatalog,
      builderPresentation.nodes,
      selectedBuilderNode,
      builderPresentation.sourceIdentityKey,
      builderPresentation.targetId,
    ),
    [builderPresentation.nodes, builderPresentation.sourceIdentityKey, builderPresentation.targetId, selectedBuilderNode, sourceEditCatalog],
  );
  const contextualRowHasEligibleCell = useMemo(
    () => hasX4UiSourceEditorContextualEligibleChildCell(
      sourceEditCatalog,
      builderPresentation.nodes,
      selectedBuilderNode,
      builderPresentation.sourceIdentityKey,
    ),
    [builderPresentation.nodes, builderPresentation.sourceIdentityKey, selectedBuilderNode, sourceEditCatalog],
  );
  const sourceEditCatalogIdentityMatches = sourceEditCatalog !== undefined
    && builderPresentation.sourceIdentityKey !== null
    && builderSourceIdentityKey(sourceEditCatalog.sourceIdentity) === builderPresentation.sourceIdentityKey;
  const targetOptions = selection.source?.targets ?? [];
  const menuOptions = menuTargetsFor(selection.source);
  const selectedSourceIdentity = asRecord(selection.source?.sourceIdentity);
  const sourceIdentityForDisplay = selectedSourceIdentity ?? asRecord(X4_UI_EDITOR_UNSELECTED_SOURCE);
  const selectedSourceFile = stringValue(sourceIdentityForDisplay?.file, 'unavailable');
  const selectedSourceHash = stringValue(sourceIdentityForDisplay?.sha256, 'unavailable');
  const sourceKeepOutPresets = asArray(projectionView.keepOutPresets);
  const canRender = projectionView.canRender === true
    && projectionView.paint !== null
    && projectionView.paint !== undefined
    && canonicalCorpus !== null;
  const canvasDescription = classifyX4UiCanvasState(canvasState);
  const sourceEditContext = useMemo<X4UiSourceEditContext>(() => createX4UiSourceEditContext(
    workspace,
    projection.source,
    selection.selection,
    projection.preview.selectedTarget,
    currentProgram,
    currentEvidenceAuthority,
    sourceEditCatalog,
    projection.normalizedProfile,
  ), [
    currentEvidenceAuthority,
    currentProgram,
    projection.normalizedProfile,
    projection.preview.selectedTarget,
    projection.source,
    selection.selection,
    sourceEditCatalog,
    workspace,
  ]);
  builderSelectionRef.current = builderSelection;
  sourceEditContextRef.current = sourceEditContext;
  sourceEditDraftRef.current = sourceEditDraft;
  sampleDraftRef.current = sampleDraft;
  const sampleDraftMatchesProjection = sampleDraft !== undefined
    && projection.sampleCatalog === sampleDraft.catalog
    && projection.sampleCatalogAuthority === sampleDraft.authority
    && sameX4UiEditorSampleBinding(projection.sampleBinding, sampleDraft.binding);
  const visibleSampleDraft = sampleDraftMatchesProjection ? sampleDraft : undefined;
  const currentSampleProjectionRef = useRef(projection);
  currentSampleProjectionRef.current = projection;
  const previewInputsPanelRef = useRef<HTMLDetailsElement>(null);
  const sourceEditDraftMatches = sourceEditDraft.context !== null
    && !shouldClearX4UiSourceEditState(sourceEditDraft.context, sourceEditContext);
  const visibleSourceEditStaged = sourceEditDraftMatches ? sourceEditDraft.staged : {};
  const visibleSourceEditReceipt = sourceEditDraftMatches ? sourceEditDraft.receipt : undefined;

  const inspectorScroll = useX4UiInspectorScrollRetention({
    workspace, scope: currentWorkspaceScope, profile: profileValue,
    selectionEpoch: selectionEpochRef.current, nodeId: selectedBuilderNode?.id,
  });
  const { submit: submitSourceEditWithSelectionTransfer, cancel: cancelSourceEditSelectionTransfer } = useX4UiSourceEditSelectionTransfer({
    workspace,
    candidates: selection.candidates,
    sourceSelector,
    targetSelector,
    profile: profileValue,
    builderNodes: builderPresentation.nodes,
    builderProjectionStatus: builderPresentation.status,
    builderProjectionLoading: corpusState.status === 'loading',
    sourceEditCatalog,
    builderSelectionContext,
    builderSelectionNodeId: builderSelection?.nodeId,
    onWorkspaceEdit,
    onSelect: selected => {
      inspectorScroll.confirm(selected.builderSelection);
      const edit = previewEditTransitionRef.current;
      if (edit !== null && edit.afterWorkspace === workspace && edit.scope === currentWorkspaceScope
        && edit.selectionEpoch === selectionEpochRef.current) {
        previewEditTransitionRef.current = null;
        setAcceptedPreviewEdit(edit);
      }
      setSourceSelector(selected.sourceSelector);
      setTargetSelector(selected.targetSelector);
      setBuilderSelection(selected.builderSelection ?? null);
    },
  });

  useEffect(() => {
    setSourceEditDraft(previous => reconcileX4UiSourceEditDraftContext(
      previous,
      sourceEditContextRef.current ?? sourceEditContext,
    ));
  }, [sourceEditContext]);

  useEffect(() => {
    setBuilderSelection(previous => {
      const next = reconcileX4UiBuilderSelection(previous, builderSelectionContext, builderPresentation.nodes);
      if (next === undefined) return previous === null ? previous : null;
      return next === previous ? previous : next;
    });
  }, [builderPresentation.nodes, builderSelectionContext]);

  useEffect(() => {
    if (projection.paths !== pathInput) setPathInput(projection.paths);
    if (projection.paths === undefined) {
      if (pathBinding !== undefined) setPathBinding(undefined);
      if (pathCatalogAuthority !== undefined) setPathCatalogAuthority(undefined);
    } else {
      if (!sameX4UiEditorPathBinding(projection.pathBinding, pathBinding)) setPathBinding(projection.pathBinding);
      if (projection.pathCatalogAuthority !== pathCatalogAuthority) setPathCatalogAuthority(projection.pathCatalogAuthority);
    }
    if (projection.pathReconciliation.status !== 'accepted') {
      setPathError(projection.pathReconciliation.message);
    }
  }, [pathBinding, pathCatalogAuthority, pathInput, projection.pathBinding, projection.pathCatalogAuthority, projection.pathReconciliation, projection.paths]);

  useEffect(() => {
    const projectionRequiresLoopStateSync = projection.loopReconciliation.status !== 'accepted'
      || projection.loopReconciliation.changed;
    if (projectionRequiresLoopStateSync) {
      if (projection.loops !== loopInputRef.current) {
        loopInputRef.current = projection.loops;
        setLoopInput(projection.loops);
      }
    }
    if (projection.loops === undefined) {
      if (loopBinding !== undefined) setLoopBinding(undefined);
      if (loopCatalogAuthority !== undefined) setLoopCatalogAuthority(undefined);
    } else if (!sameX4UiEditorLoopBinding(projection.loopBinding, loopBinding)) {
      setLoopBinding(projection.loopBinding);
      setLoopCatalogAuthority(projection.loopCatalogAuthority);
    } else if (loopCatalogAuthority === undefined && projection.loopCatalogAuthority !== undefined) {
      setLoopCatalogAuthority(projection.loopCatalogAuthority);
    }
    if (projection.loopReconciliation.status !== 'accepted') {
      setLoopError(projection.loopReconciliation.message);
    }
  }, [loopBinding, loopCatalogAuthority, loopInput, projection.loopBinding, projection.loopCatalogAuthority, projection.loopReconciliation, projection.loops]);

  useEffect(() => {
    if (projection.samples !== sampleInput) setSampleInput(projection.samples);
    if (projection.samples === undefined) {
      if (sampleBinding !== undefined) setSampleBinding(undefined);
      if (sampleCatalogAuthority !== undefined) setSampleCatalogAuthority(undefined);
    } else {
      if (!sameX4UiEditorSampleBinding(projection.sampleBinding, sampleBinding)) setSampleBinding(projection.sampleBinding);
      if (projection.sampleCatalogAuthority !== sampleCatalogAuthority) setSampleCatalogAuthority(projection.sampleCatalogAuthority);
    }
    if (projection.sampleReconciliation.status !== 'accepted') {
      setSampleError(projection.sampleReconciliation.message);
    }
  }, [projection.sampleBinding, projection.sampleCatalogAuthority, projection.sampleReconciliation, projection.samples, sampleBinding, sampleCatalogAuthority, sampleInput]);

  useEffect(() => {
    if (sampleDraft !== undefined && !sampleDraftMatchesProjection) setSampleDraft(undefined);
  }, [projection.sampleBinding, projection.sampleCatalog, projection.sampleCatalogAuthority, sampleDraft, sampleDraftMatchesProjection]);

  useEffect(() => {
    // An empty reconciliation is a fail-closed derived view during a transient authority gap;
    // retain the owner-issued intent so a stable catalog can restore it. selectSource clears the
    // target explicitly for a genuine source change.
    if (selection.reconciled.sourceSelector !== '') {
      if (selection.reconciled.sourceSelector !== sourceSelector) setSourceSelector(selection.reconciled.sourceSelector);
      if (selection.reconciled.targetSelector !== '' && selection.reconciled.targetSelector !== targetSelector) {
        setTargetSelector(selection.reconciled.targetSelector);
      }
    }
  }, [selection.reconciled.sourceSelector, selection.reconciled.targetSelector, setSourceSelector, setTargetSelector, sourceSelector, targetSelector]);

  useEffect(() => {
    setCanvasExportFeedback(undefined);
  }, [currentVerificationSnapshot]);

  useLayoutEffect(() => {
    let active = true;
    const host = canvasHostRef.current;
    if (canvasWorkspaceScopeRef.current !== currentWorkspaceScope) {
      // A stale preview belongs to its workspace, never to the next workspace's refusal.
      resetCanvasView();
      host?.replaceChildren();
      canvasStateRef.current = X4_UI_EDITOR_EMPTY_CANVAS_STATE;
      canvasExportIdentityRef.current = null;
      canvasWorkspaceScopeRef.current = currentWorkspaceScope;
    }
    const reason = stringValue(projectionView.reason, `session status is ${stringValue(projectionView.status, 'unavailable')}`);
    const disposeSurface = (surface: X4UiCanvasSurface): void => {
      if (typeof HTMLElement !== 'undefined' && surface instanceof HTMLElement) surface.remove();
    };
    const adopt = (result: X4UiCanvasRenderResult): void => {
      const decision = classifyX4UiCanvasCommit(canvasStateRef.current, result);
      canvasStateRef.current = decision.nextState;
      setCanvasState(decision.nextState);
      if (decision.replaceSurface === undefined) {
        canvasExportIdentityRef.current = null;
        if (decision.discardSurface !== undefined) disposeSurface(decision.discardSurface);
        return;
      }
      if (!active || host === null) {
        canvasExportIdentityRef.current = null;
        disposeSurface(decision.replaceSurface);
        return;
      }
      setCompletedBitmapStyle(decision.replaceSurface);
      host.replaceChildren(decision.replaceSurface as unknown as Node);
      canvasExportIdentityRef.current = currentVerificationSnapshot;
    };

    if (!canRender || canonicalCorpus === null || projectionView.paint === null || projectionView.paint === undefined) {
      adopt(sessionRefusalResult(`Session is not renderable: ${reason}`));
      return () => {
        active = false;
      };
    }

    const result = renderX4UiPaintPlanToCanvas(
      projectionView.paint as Parameters<typeof renderX4UiPaintPlanToCanvas>[0],
      canonicalCorpus,
      { surfaceFactory: resolvedSurfaceFactory, presentation: 'source-composition', session: rendererSession },
    );
    if (active) adopt(result);
    return () => {
      active = false;
    };
  }, [canRender, canonicalCorpus, currentVerificationSnapshot, currentWorkspaceScope, projectionView.paint, projectionView.reason, projectionView.status, rendererSession, resetCanvasView, resolvedSurfaceFactory]);

  useLayoutEffect(() => {
    if (onVerificationSnapshotChange === undefined) return;
    if (!canvasCommitMatchesSnapshot) return;
    onVerificationSnapshotChange(currentVerificationSnapshotRef.current);
    return () => onVerificationSnapshotChange(null);
  }, [canvasCommitMatchesSnapshot, currentVerificationSnapshotKey, onVerificationSnapshotChange]);

  const adoptPreviewScenario = (next: X4UiEditorSessionProjection, view: X4UiPreviewScenarioView): void => {
    setProfile({ width: view.width, height: view.height, uiScale: view.uiScale });
    setScaleMode(view.scaleMode);
    setUserScale(view.userScale);
    setPathInput(next.paths);
    setPathBinding(next.pathBinding);
    setPathCatalogAuthority(next.pathCatalogAuthority);
    setLoopInput(next.loops);
    setLoopBinding(next.loopBinding);
    setLoopCatalogAuthority(next.loopCatalogAuthority);
    setSampleInput(next.samples);
    setSampleBinding(next.sampleBinding);
    setSampleCatalogAuthority(next.sampleCatalogAuthority);
    setPathError(undefined);
    setLoopError(undefined);
    setSampleError(undefined);
    setSampleDraft(undefined);
    sampleDraftRef.current = undefined;
    setProfileError(undefined);
  };

  const applyProfileView = (view: X4UiPreviewScenarioView): void => {
    if (currentSampleProjectionRef.current !== projection) return;
    const draft = sampleDraftRef.current;
    if (draft !== undefined && draft.catalog === projection.sampleCatalog
      && draft.authority === projection.sampleCatalogAuthority
      && sameX4UiEditorSampleBinding(draft.binding, projection.sampleBinding)) {
      setProfileError('Apply or discard your preview input edits before changing the profile.');
      return;
    }
    const hasInputs = (projection.samples?.values.length ?? 0) > 0
      || (projection.paths?.selections.length ?? 0) > 0
      || (projection.loops?.selections.length ?? 0) > 0;
    if (hasInputs) {
      // Profile-bound authority must be freshly issued, never carried across profiles.
      // Replay the same source/menu data before committing any visible profile change.
      const captured = capturePreviewScenario(projection, view, 'current-preview', 'Current preview');
      if (captured.ok === false) {
        setProfileError(`Profile unchanged: ${captured.message}`);
        return;
      }
      const replayed = projectPreviewScenario(sessionOwner, sessionInput, captured.scenario);
      if (replayed.ok === false) {
        setProfileError(`Profile unchanged: ${replayed.message}`);
        return;
      }
      cancelSourceEditSelectionTransfer();
      adoptPreviewScenario(replayed.projection, view);
      return;
    }
    cancelSourceEditSelectionTransfer();
    setProfile({ width: view.width, height: view.height, uiScale: view.uiScale });
    setScaleMode(view.scaleMode);
    setUserScale(view.userScale);
    setProfileError(undefined);
  };

  const updateProfileDimension = (field: 'width' | 'height' | 'uiScale', raw: string): void => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    if (field === 'uiScale' && scaleMode !== X4_UI_SOURCE_EDITOR_SCALE_MODE_CUSTOM) return;
    const next = { ...profile, [field]: value };
    if (field === 'height' && scaleMode === X4_UI_SOURCE_EDITOR_SCALE_MODE_DERIVED) {
      const effectiveScale = deriveX4UiEffectiveScale(userScale, value);
      if (effectiveScale === null) return;
      next.uiScale = effectiveScale;
    }
    applyProfileView({ ...next, scaleMode, userScale });
  };

  const updateUserScale = (raw: string): void => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    const effectiveScale = scaleMode === X4_UI_SOURCE_EDITOR_SCALE_MODE_DERIVED
      ? deriveX4UiEffectiveScale(value, profile.height) : profile.uiScale;
    if (effectiveScale === null) return;
    applyProfileView({ ...profile, uiScale: effectiveScale, scaleMode, userScale: value });
  };

  const updateScaleMode = (value: string): void => {
    if (value !== X4_UI_SOURCE_EDITOR_SCALE_MODE_DERIVED && value !== X4_UI_SOURCE_EDITOR_SCALE_MODE_CUSTOM) return;
    const effectiveScale = value === X4_UI_SOURCE_EDITOR_SCALE_MODE_DERIVED
      ? deriveX4UiEffectiveScale(userScale, profile.height) : profile.uiScale;
    if (effectiveScale === null) return;
    applyProfileView({ ...profile, uiScale: effectiveScale, scaleMode: value, userScale });
  };

  const selectSource = (value: string): void => {
    cancelSourceEditSelectionTransfer();
    invalidateHistorySelectionCarry();
    if (value !== sourceSelector) resetCanvasView();
    setSourceSelector(value);
    setTargetSelector('');
    setBuilderSelection(null);
  };

  const selectTarget = (value: string): void => {
    cancelSourceEditSelectionTransfer();
    invalidateHistorySelectionCarry();
    if (value !== targetSelector) resetCanvasView();
    setTargetSelector(value);
  };

  const selectBuilderNode = (node: X4UiBuilderNode | undefined): void => {
    cancelSourceEditSelectionTransfer();
    invalidateHistorySelectionCarry();
    if (node === undefined
      || builderPresentation.sourceIdentityKey === null
      || builderPresentation.targetId === undefined
      || builderPresentation.profileKey === null) {
      setBuilderSelection(null);
      return;
    }
    setBuilderSelection({
      nodeId: node.id,
      workspace,
      sourceIdentityKey: builderPresentation.sourceIdentityKey,
      targetId: builderPresentation.targetId,
      profileKey: builderPresentation.profileKey,
    });
  };

  const handleBuilderCanvasClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    invalidateHistorySelectionCarry();
    const mounted = canvasHostRef.current?.firstElementChild;
    const canvasConstructor = typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement;
    if (canvasConstructor === null || !(mounted instanceof canvasConstructor)) {
      setBuilderSelection(null);
      return;
    }
    const classification = classifyX4UiCanvasExport({
      state: canvasStateRef.current,
      mountedCanvas: mounted,
      currentIdentity: currentVerificationSnapshotRef.current,
      committedIdentity: canvasExportIdentityRef.current,
    });
    if (classification.status !== 'available') {
      setBuilderSelection(null);
      return;
    }
    const bounds = mounted.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0 || mounted.width <= 0 || mounted.height <= 0) return;
    const nativePoint = {
      x: (event.clientX - bounds.left) * mounted.width / bounds.width,
      y: (event.clientY - bounds.top) * mounted.height / bounds.height,
    };
    const node = hitTestX4UiBuilderCanvas(builderPresentation.nodes, nativePoint);
    selectBuilderNode(node);
  };

  const selectPreset = (value: string | null): void => {
    setActivePresetId(value);
    if (value === null) {
      setEnabledEntryIds([]);
      return;
    }
    const definition = KEEP_OUT_PRESETS.find(preset => preset.id === value);
    setEnabledEntryIds(definition?.members.filter(member => member.applicability === 'applicable').map(member => member.entryId) ?? []);
  };

  const toggleEntry = (originatingPresetId: string, entryId: string): void => {
    setEnabledEntryIds(previous => toggleX4UiKeepOutEntry(activePresetId, originatingPresetId, previous, entryId, KEEP_OUT_PRESETS));
  };

  const updateManualDraftField = (field: X4UiManualCalibrationDraftField, value: string): void => {
    setManualCalibrationState(previous => ({
      ...previous,
      draft: updateX4UiManualCalibrationDraft(previous.draft, field, value),
    }));
  };

  const updateManualDraftPoint = (index: number, axis: 'x' | 'y', value: string): void => {
    setManualCalibrationState(previous => ({
      ...previous,
      draft: updateX4UiManualCalibrationPoint(previous.draft, index, axis, value),
    }));
  };

  const addManualDraftPoint = (): void => {
    setManualCalibrationState(previous => ({
      ...previous,
      draft: addX4UiManualCalibrationPoint(previous.draft),
    }));
  };

  const removeManualDraftPoint = (index: number): void => {
    setManualCalibrationState(previous => ({
      ...previous,
      draft: removeX4UiManualCalibrationPoint(previous.draft, index),
    }));
  };

  const addManualCalibration = (): void => {
    setManualCalibrationState(previous => addX4UiManualCalibrationDraft(previous));
  };

  const toggleManualCalibration = (rowId: string): void => {
    setManualCalibrationState(previous => toggleX4UiManualCalibrationRow(previous, rowId));
  };

  const removeManualCalibration = (rowId: string): void => {
    setManualCalibrationState(previous => removeX4UiManualCalibrationRow(previous, rowId));
  };

  const updatePath = (entryId: string): void => {
    const result = updateX4UiEditorPathState(pathInput, projection.pathCatalog, entryId, projection.pathCatalogAuthority);
    setPathInput(result.paths);
    if (result.status !== 'refused') {
      setPathBinding(result.paths === undefined ? undefined : projection.pathBinding);
      setPathCatalogAuthority(result.paths === undefined ? undefined : projection.pathCatalogAuthority);
    }
    setPathError(result.status === 'refused' ? result.message : undefined);
  };

  const resetPaths = (): void => {
    const result = resetX4UiEditorPathState(pathInput, projection.pathCatalog, projection.pathCatalogAuthority);
    setPathInput(result.paths);
    if (result.status !== 'refused') {
      setPathBinding(undefined);
      setPathCatalogAuthority(undefined);
    }
    setPathError(result.status === 'refused' ? result.message : undefined);
  };

  const updateLoop = (entryId: string, raw: string): void => {
    const result = updateX4UiEditorLoopState(
      loopInputRef.current,
      loopCatalogRef.current,
      entryId,
      raw,
      loopCatalogAuthorityRef.current,
    );
    loopInputRef.current = result.loops;
    setLoopInput(result.loops);
    if (result.status !== 'refused') {
      setLoopBinding(result.loops === undefined ? undefined : projection.loopBinding);
      setLoopCatalogAuthority(result.loops === undefined ? undefined : projection.loopCatalogAuthority);
    }
    setLoopError(result.status === 'refused' ? result.message : undefined);
  };

  const resetLoops = (): void => {
    const result = resetX4UiEditorLoopState(
      loopInputRef.current,
      loopCatalogRef.current,
      loopCatalogAuthorityRef.current,
    );
    loopInputRef.current = result.loops;
    setLoopInput(result.loops);
    if (result.status !== 'refused') {
      setLoopBinding(undefined);
      setLoopCatalogAuthority(undefined);
    }
    setLoopError(result.status === 'refused' ? result.message : undefined);
  };

  const updateSample = (entryId: string, raw: string): void => {
    const catalog = projection.sampleCatalog;
    const binding = projection.sampleBinding;
    const authority = projection.sampleCatalogAuthority;
    if (catalog === null || binding === undefined || authority === undefined) {
      setSampleError('preview samples require the exact owner-issued catalog and authority');
      return;
    }
    if (!catalog.entries.some(entry => entry.id === entryId)) {
      setSampleError(`unknown preview sample ID: ${entryId}`);
      return;
    }
    setSampleDraft(previous => {
      const previousMatches = previous !== undefined
        && previous.catalog === catalog
        && previous.authority === authority
        && sameX4UiEditorSampleBinding(previous.binding, binding);
      const values = previousMatches ? previous.values : sampleDraftValuesFor(sampleInput, catalog);
      return {
        catalog,
        binding,
        authority,
        values: Object.freeze({ ...values, [entryId]: raw }),
      };
    });
    setSampleError(undefined);
  };

  const applySampleDraft = (): void => {
    const draft = sampleDraftRef.current;
    const catalog = projection.sampleCatalog;
    const binding = projection.sampleBinding;
    const authority = projection.sampleCatalogAuthority;
    if (
      draft === undefined
      || catalog === null
      || binding === undefined
      || authority === undefined
      || !sampleDraftMatchesProjection
      || currentSampleProjectionRef.current !== projection
    ) {
      setSampleError('staged preview samples were refused because the owner-issued authority or binding drifted');
      return;
    }
    const result = applyX4UiEditorSampleDraft(sampleInput, catalog, draft.values, draft.authority);
    if (result.status === 'refused') {
      setSampleError(result.message);
      return;
    }
    sampleDraftRef.current = undefined;
    setSampleInput(result.samples);
    if (result.samples === undefined) {
      setSampleBinding(undefined);
      setSampleCatalogAuthority(undefined);
    } else {
      setSampleBinding(binding);
      setSampleCatalogAuthority(authority);
    }
    setSampleDraft(undefined);
    setSampleError(undefined);
  };

  const resetSampleDraft = (): void => {
    sampleDraftRef.current = undefined;
    setSampleDraft(undefined);
    setSampleError(undefined);
  };

  const clearPreviewValues = (): void => {
    const catalog = projection.sampleCatalog;
    const binding = projection.sampleBinding;
    const authority = projection.sampleCatalogAuthority;
    if (currentSampleProjectionRef.current !== projection || catalog === null || binding === undefined || authority === undefined) {
      setSampleError('preview values could not be cleared because the selected menu or input authority changed');
      return;
    }
    const values = Object.fromEntries(catalog.entries.map(entry => [entry.id, '']));
    const result = applyX4UiEditorSampleDraft(sampleInput, catalog, values, authority);
    if (result.status === 'refused') {
      setSampleError(result.message);
      return;
    }
    sampleDraftRef.current = undefined;
    setSampleInput(result.samples);
    setSampleBinding(result.samples === undefined ? undefined : binding);
    setSampleCatalogAuthority(result.samples === undefined ? undefined : authority);
    setSampleDraft(undefined);
    setSampleError(undefined);
  };

  const stageSourceEdit = (entryId: string, raw: string): void => {
    const executionContext = sourceEditContextRef.current;
    if (executionContext === null || executionContext !== sourceEditContext) return;
    setSourceEditDraft(previous => {
      if (sourceEditContextRef.current !== executionContext) return previous;
      const previousMatches = previous.context !== null
        && !shouldClearX4UiSourceEditState(previous.context, executionContext);
      return {
        context: executionContext,
        staged: stageX4UiSourceEditInput(previousMatches ? previous.staged : {}, entryId, raw),
      };
    });
  };

  const discardSourceEditDraft = (): void => {
    const executionContext = sourceEditContextRef.current;
    const executionDraft = sourceEditDraftRef.current;
    if (executionContext === null
      || executionContext !== sourceEditContext
      || executionDraft !== sourceEditDraft
      || executionDraft.receipt?.status === 'pending'
      || !sourceEditDraftMatches
      || Object.keys(executionDraft.staged).length === 0) return;
    setSourceEditDraft(previous => {
      if (sourceEditContextRef.current !== executionContext
        || sourceEditDraftRef.current !== executionDraft
        || previous !== executionDraft
        || previous.receipt?.status === 'pending'
        || shouldClearX4UiSourceEditState(previous.context, executionContext)) return previous;
      return { context: executionContext, staged: {} };
    });
  };

  const refuseSourceEdit = (reason: string, detail: string): void => {
    setSourceEditDraft({
      context: sourceEditContext,
      staged: {},
      receipt: { status: 'refused', reason, detail },
    });
  };

  const applySourceEdit = (
    entryId: string,
    insertionWidget?: X4UiSourceEditWidgetKind,
    insertionText?: string,
    insertRow = false,
    moveDirection?: X4UiSourceEditRowMoveDirection,
  ): void => {
    const executionContext = sourceEditContextRef.current;
    const executionDraft = sourceEditDraftRef.current;
    if (
      executionContext === null
      || executionContext !== sourceEditContext
      || executionDraft !== sourceEditDraft
      || builderSelectionRef.current?.nodeId !== selectedBuilderNode?.id
    ) return;
    const insertionRequested = insertionWidget !== undefined || insertionText !== undefined || insertRow || moveDirection !== undefined;
    if (insertionRequested
      && (executionDraft.receipt?.status === 'pending' || Object.keys(executionDraft.staged).length > 0)) return;
    if (!sourceEditDraftMatches) {
      refuseSourceEdit('stale-editor-context', 'source edit staging was cleared because the current session projection changed');
      return;
    }
    const catalog = sourceEditCatalog;
    if (catalog === undefined || currentProgram === undefined || currentEvidenceAuthority === undefined) {
      refuseSourceEdit('catalog-unavailable', 'the exact current session has no projected source-edit catalog');
      return;
    }
    const insertionEntry = catalog.insertEntries?.find((candidate): candidate is X4UiSourceEditEmptyCellEntry => (
      candidate.id === entryId && candidate.kind === 'insert-widget' && candidate.anchor === 'empty-cell'
    ));
    const rowInsertionEntry = catalog.insertEntries?.find((candidate): candidate is X4UiSourceEditRowInsertionEntry => (
      candidate.id === entryId && candidate.kind === 'insert-row' && candidate.anchor === 'row-below'
    ));
    const rowMoveMatches = moveDirection === undefined
      ? []
      : (catalog.moveEntries ?? []).filter(candidate => candidate.id === entryId && candidate.kind === 'move-row');
    const rowMoveEntry = rowMoveMatches.length === 1 ? rowMoveMatches[0] : undefined;
    const hasStaged = Object.prototype.hasOwnProperty.call(executionDraft.staged, entryId);
    const textProperty = contextualTextPropertyAdditions.find(item => item.id === entryId);
    if (textProperty !== undefined && (insertionRequested || executionDraft.receipt?.status === 'pending'
      || Object.keys(executionDraft.staged).some(id => id !== entryId)
      || !selectedBuilderNode?.propertyOperationIds.includes(textProperty.operationId))) return;
    if (moveDirection !== undefined
      && (insertRow || insertionWidget !== undefined || insertionText !== undefined)) {
      refuseSourceEdit(
        'move-unavailable',
        'Row controls are unavailable for this selection.',
      );
      return;
    }
    if (moveDirection !== undefined) {
      const contextualMoveEntry = moveDirection === 'up' ? contextualRowMove.up : contextualRowMove.down;
      if (rowMoveEntry === undefined
        || rowMoveEntry.direction !== moveDirection
        || contextualMoveEntry !== rowMoveEntry
        || contextualRowMove.row === undefined
        || selectedBuilderNode === undefined
        || resolveX4UiBuilderRowForNode(builderPresentation.nodes, selectedBuilderNode) !== contextualRowMove.row) {
        refuseSourceEdit(
          'move-unavailable',
          'the selected row is no longer available for movement',
        );
        return;
      }
    } else if (insertRow) {
      if (rowInsertionEntry === undefined
        || insertionWidget !== undefined
        || insertionText !== undefined
        || contextualRowInsertionEntry === undefined
        || contextualRowInsertionEntry.id !== rowInsertionEntry.id
        || selectedBuilderNode === undefined) {
        refuseSourceEdit(
          'insertion-unavailable',
          'the selected row is no longer available for adding a row below',
        );
        return;
      }
    } else if (insertionEntry !== undefined) {
      if (insertionWidget === undefined
        || insertionText === undefined
        || insertionText.trim().length === 0
        || contextualInsertionEntry === undefined
        || contextualInsertionEntry.id !== insertionEntry.id
        || selectedBuilderNode?.kind !== 'cell'
        || selectedBuilderNode.id !== `scene:${insertionEntry.cellId}`
      ) {
        refuseSourceEdit(
          'insertion-unavailable',
          'the selected cell is no longer available for adding a widget',
        );
        return;
      }
    } else if (!hasStaged) {
      return;
    }
    const raw = insertionText ?? executionDraft.staged[entryId];
    let result: X4UiSourceEditResult | X4UiSourceStructuralEditResult | X4UiSourceWidgetInsertionResult | X4UiSourceRowInsertionResult | X4UiSourceRowMoveResult | X4UiSourceTextPropertyAdditionResult;
    let editedEntry: X4UiSourceEditCatalogEntry | undefined;
    if (textProperty !== undefined) {
      const parsed = parseX4UiSourceEditInput(textProperty, raw);
      if (parsed.accepted === false) { refuseSourceEdit(parsed.reason, parsed.detail); return; }
      result = applyX4UiSourceTextPropertyAddition(
        executionContext.workspace as Parameters<typeof applyX4UiSourceTextPropertyAddition>[0], projection.source,
        catalog, textProperty.operationId, textProperty.property, parsed.value,
      );
    } else if (rowMoveEntry !== undefined && moveDirection !== undefined) {
      result = applyX4UiSourceRowMove(
        executionContext.workspace as Parameters<typeof applyX4UiSourceRowMove>[0],
        projection.source,
        catalog,
        {
          entry: rowMoveEntry,
          expected: {
            path: rowMoveEntry.path,
            startOffset: rowMoveEntry.startOffset,
            endOffset: rowMoveEntry.endOffset,
            expectedText: rowMoveEntry.expectedText,
          },
        },
      );
    } else if (rowInsertionEntry !== undefined && insertRow) {
      result = applyX4UiSourceRowInsertion(
        executionContext.workspace as Parameters<typeof applyX4UiSourceRowInsertion>[0],
        projection.source,
        catalog,
        {
          entry: rowInsertionEntry,
          expected: {
            path: rowInsertionEntry.path,
            startOffset: rowInsertionEntry.startOffset,
            endOffset: rowInsertionEntry.endOffset,
            expectedText: rowInsertionEntry.expectedText,
          },
        },
      );
    } else if (insertionEntry !== undefined) {
      result = applyX4UiSourceWidgetInsertion(
        executionContext.workspace as Parameters<typeof applyX4UiSourceWidgetInsertion>[0],
        projection.source,
        catalog,
        {
          entry: insertionEntry,
          widget: insertionWidget,
          text: raw,
          expected: {
            path: insertionEntry.path,
            startOffset: insertionEntry.startOffset,
            endOffset: insertionEntry.endOffset,
            expectedText: insertionEntry.expectedText,
          },
        },
      );
    } else {
      const blockEntry = catalog.insertEntries?.find(candidate => candidate.id === entryId && candidate.kind === 'insert-block');
      if (blockEntry !== undefined) {
      result = applyX4UiSourceStructuralEdit(
        executionContext.workspace as Parameters<typeof applyX4UiSourceStructuralEdit>[0],
        projection.source,
        catalog,
        blockEntry.id,
        raw,
        blockEntry.path,
        blockEntry.startOffset,
        blockEntry.endOffset,
        blockEntry.expectedText,
      );
      } else {
        const entry = catalog.entries.find(candidate => candidate.id === entryId);
        if (entry === undefined) {
          refuseSourceEdit('entry-not-found', 'the selected entry is not in the exact current owner-issued catalog');
          return;
        }
        if (entry.kind !== 'editable') {
          refuseSourceEdit(entry.reason, entry.detail);
          return;
        }
        editedEntry = entry;
        const parsed = parseX4UiSourceEditInput(entry, raw);
        if (parsed.accepted === false) {
          refuseSourceEdit(parsed.reason, parsed.detail);
          return;
        }
        result = applyX4UiSourceEdit(
          executionContext.workspace as Parameters<typeof applyX4UiSourceEdit>[0],
          projection.source,
          catalog,
          entry.id,
          parsed.value,
          entry.path,
          entry.startOffset,
          entry.endOffset,
          entry.expectedText,
        );
      }
    }
    if (result.accepted === false) {
      refuseSourceEdit(result.reason, result.detail);
      return;
    }
    const insertedWidget = 'insertedWidget' in result ? result.insertedWidget : undefined;
    const insertedRow = 'insertedRow' in result ? result.insertedRow : undefined;
    const movedRow = 'movedRow' in result ? result.movedRow : undefined;
    const propertySplice = 'propertySplice' in result ? result.propertySplice : undefined;
    const effectiveSplice = propertySplice ?? result;
    const selectionContinuation: X4UiSourceEditSelectionContinuation | undefined = result.changed
      && (editedEntry?.kind === 'editable' || propertySplice !== undefined || insertedWidget !== undefined || insertedRow !== undefined || movedRow !== undefined)
      && selectedBuilderNode !== undefined
      ? {
        node: selectedBuilderNode,
        splice: {
          path: effectiveSplice.path,
          startOffset: effectiveSplice.startOffset,
          endOffset: effectiveSplice.endOffset,
          replacement: effectiveSplice.replacement,
        },
        ...(insertedWidget === undefined ? {} : { insertedWidget }),
        ...(insertedRow === undefined ? {} : { insertedRow }),
        ...(movedRow === undefined ? {} : { movedRow }),
      }
      : undefined;
    const sourceSplice: WorkspaceSourceSplice | undefined = result.changed ? Object.freeze({
      path: effectiveSplice.path, startOffset: effectiveSplice.startOffset, endOffset: effectiveSplice.endOffset,
      expectedText: effectiveSplice.expectedText, replacement: effectiveSplice.replacement,
      ...(movedRow === undefined || rowMoveEntry === undefined ? {} : { retainedSpans: Object.freeze([
        Object.freeze({ beforeStart: rowMoveEntry.upper.startOffset, beforeEnd: rowMoveEntry.upper.endOffset,
          afterStart: result.startOffset + rowMoveEntry.lower.expectedText.length }),
        Object.freeze({ beforeStart: rowMoveEntry.lower.startOffset, beforeEnd: rowMoveEntry.lower.endOffset, afterStart: result.startOffset }),
      ]) }),
    }) : undefined;
    if (sourceSplice !== undefined) previewEditTransitionRef.current = {
      direction: 'edit', scope: currentWorkspaceScope, beforeWorkspace: executionContext.workspace,
      afterWorkspace: result.workspace, sourceSplice, beforeProjection: projection, selectionEpoch: selectionEpochRef.current,
    };
    const inspectorAttempt = !insertionRequested && selectionContinuation !== undefined
      ? inspectorScroll.begin(result.workspace) : undefined;
    const parentResult = submitSourceEditWithSelectionTransfer(
      executionContext.workspace,
      result.workspace,
      selectionContinuation,
      sourceSplice,
    );
    if (parentResult.status === 'refused') {
      if (inspectorAttempt !== undefined) inspectorScroll.cancel(inspectorAttempt);
      previewEditTransitionRef.current = null;
      refuseSourceEdit(parentResult.reason, parentResult.detail);
      return;
    }
    const acceptedDetail = result.changed
      ? `${result.path} bytes ${result.startOffset}-${result.endOffset} changed; session and preview reprojected from exact parent acknowledgement · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`
      : `owner reported no source-byte change; exact parent commit attempt acknowledged the original workspace identity · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`;
    const pendingContext = executionContext;
    const pendingReceipt: Extract<X4UiSourceEditUiReceipt, { readonly status: 'pending' }> = {
      status: 'pending',
      submission: parentResult,
      context: pendingContext,
      changed: result.changed,
      detail: parentResult.detail,
      acceptedDetail,
    };
    const pendingDraft: X4UiSourceEditDraftState = {
      context: pendingContext,
      staged: {},
      receipt: pendingReceipt,
    };
    setSourceEditDraft(previous => {
      if (
        sourceEditContextRef.current !== pendingContext
        || sourceEditDraftRef.current !== executionDraft
        || previous !== executionDraft
        || previous.context !== pendingContext
      ) return previous;
      return pendingDraft;
    });
    void parentResult.acknowledgement.then(
      acknowledgement => {
        if (inspectorAttempt !== undefined && acknowledgement.status !== 'accepted') inspectorScroll.cancel(inspectorAttempt);
        const currentContext = sourceEditContextRef.current;
        if (currentContext === null || currentContext !== pendingContext) return;
        setSourceEditDraft(previous => {
          if (
            sourceEditContextRef.current !== currentContext
            || sourceEditContextRef.current !== pendingContext
            || sourceEditDraftRef.current !== pendingDraft
            || previous !== pendingDraft
            || previous.context !== pendingContext
            || previous.receipt !== pendingReceipt
          ) return previous;
          const settledReceipt = settleX4UiSourceEditReceipt(
            currentContext.workspace,
            pendingReceipt,
            acknowledgement,
            currentContext,
          );
          if (settledReceipt.status === 'pending') return previous;
          return {
            context: pendingContext,
            staged: {},
            receipt: settledReceipt,
          };
        });
      },
      () => {
        if (inspectorAttempt !== undefined) inspectorScroll.cancel(inspectorAttempt);
        const currentContext = sourceEditContextRef.current;
        if (currentContext === null || currentContext !== pendingContext) return;
        setSourceEditDraft(previous => {
          if (
            sourceEditContextRef.current !== currentContext
            || sourceEditContextRef.current !== pendingContext
            || sourceEditDraftRef.current !== pendingDraft
            || previous !== pendingDraft
            || previous.context !== pendingContext
            || previous.receipt !== pendingReceipt
          ) return previous;
          return {
            context: pendingContext,
            staged: {},
            receipt: {
              status: 'refused',
              reason: 'invalid-parent-workspace-acknowledgement',
              detail: 'parent acknowledgement promise rejected before exact commit confirmation',
            },
          };
        });
      },
    );
  };

  const selectedTargetIdentity = asRecord(selection.selection?.target);
  const selectedTargetId = stringValue(selectedTargetIdentity?.id, 'unavailable');
  const selectedTargetName = selectedTargetIdentity?.kind === 'top-level'
    ? 'Top-level menu'
    : stringValue(selectedTargetIdentity?.name, selectedTargetId);
  const selectedTargetKind = stringValue(selectedTargetIdentity?.kind, 'unavailable');
  const normalizedProfileRecord = asRecord(projectionView.normalizedProfile);
  const normalizedDrawable = asRecord(normalizedProfileRecord?.drawable);
  const exportProfileId = stringValue(normalizedProfileRecord?.id, 'unavailable');
  const exportProfileWidth = formatNumber(normalizedDrawable?.width);
  const exportProfileHeight = formatNumber(normalizedDrawable?.height);
  const exportEffectiveScale = formatNumber(normalizedProfileRecord?.uiScale);
  const mountedCanvas = canvasHostRef.current?.firstElementChild;
  const canvasExportClassification = classifyX4UiCanvasExport({
    state: canvasState,
    mountedCanvas,
    currentIdentity: currentVerificationSnapshot,
    committedIdentity: canvasExportIdentityRef.current,
  });
  const canvasExportReady = canvasExportClassification.status === 'available';
  const canvasExportStatusText = canvasExportFeedback
    ?? (canvasExportReady
      ? 'ready · native PNG export uses the mounted current canvas'
      : `unavailable · ${canvasExportClassification.detail}`);
  const nativeBitmapWidth = canvasExportReady ? formatNumber(canvasExportClassification.width) : 'unavailable';
  const nativeBitmapHeight = canvasExportReady ? formatNumber(canvasExportClassification.height) : 'unavailable';
  const width = positiveValue(asRecord(profileValue)?.width);
  const height = positiveValue(asRecord(profileValue)?.height);
  const uiScale = profileScale(profileValue);
  const normalizedProfile = asRecord(projectionView.normalizedProfile);
  const mountedSurfaceRecord = asRecord(mountedCanvas);
  const mountedSurfaceWidth = safePositiveInteger(mountedSurfaceRecord?.width);
  const mountedSurfaceHeight = safePositiveInteger(mountedSurfaceRecord?.height);
  const canvasSurfaceDimensions = mountedSurfaceWidth !== null && mountedSurfaceHeight !== null
    ? { width: mountedSurfaceWidth, height: mountedSurfaceHeight }
    : null;
  const canvasDrawableWidth = canvasSurfaceDimensions?.width ?? width ?? 1;
  const canvasDrawableHeight = canvasSurfaceDimensions?.height ?? height ?? 1;
  const canvasMenuBounds = deriveX4UiBuilderMenuBounds(builderPresentation, canvasDrawableWidth, canvasDrawableHeight);
  const measuredCanvasViewportWidth = canvasViewportSize.width > 0
    ? canvasViewportSize.width
    : canvasScrollRef.current?.clientWidth ?? 0;
  const measuredCanvasViewportHeight = canvasViewportSize.height > 0
    ? canvasViewportSize.height
    : canvasScrollRef.current?.clientHeight ?? 0;
  const canvasViewport: X4UiBuilderCanvasViewport = computeX4UiBuilderViewport({
    drawableWidth: canvasDrawableWidth,
    drawableHeight: canvasDrawableHeight,
    viewportWidth: measuredCanvasViewportWidth,
    viewportHeight: measuredCanvasViewportHeight,
    menuBounds: canvasMenuBounds,
    mode: canvasZoomMode,
    manualScale: manualCanvasZoomScale,
    margin: 16,
  });
  const canvasSurfaceStyle = canvasSurfaceDimensions === null ? undefined : {
    width: `${canvasViewport.stageWidth}px`,
    height: `${canvasViewport.stageHeight}px`,
  };
  const canvasSurfaceFillStyle = canvasSurfaceDimensions === null ? undefined : {
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    maxHeight: 'none',
  };
  const canvasSurfaceIsMounted = canvasSurfaceDimensions !== null;

  useLayoutEffect(() => {
    const scroll = canvasScrollRef.current;
    if (scroll === null) return;
    let active = true;
    const measure = (): void => {
      if (!active) return;
      const next = { width: scroll.clientWidth, height: scroll.clientHeight };
      if (next.width === canvasViewportSize.width && next.height === canvasViewportSize.height) return;
      if (canvasZoomAnchorRef.current === null && canvasZoomMode === 'manual' && canvasViewport.scale > 0) {
        const previousCamera = canvasCameraRef.current;
        const previousWidth = previousCamera.viewportWidth > 0
          ? previousCamera.viewportWidth
          : canvasViewportSize.width > 0 ? canvasViewportSize.width : scroll.clientWidth;
        const previousHeight = previousCamera.viewportHeight > 0
          ? previousCamera.viewportHeight
          : canvasViewportSize.height > 0 ? canvasViewportSize.height : scroll.clientHeight;
        const previousScale = previousCamera.scale > 0 ? previousCamera.scale : canvasViewport.scale;
        const previousLeft = previousCamera.viewportWidth > 0 ? previousCamera.scrollLeft : scroll.scrollLeft;
        const previousTop = previousCamera.viewportHeight > 0 ? previousCamera.scrollTop : scroll.scrollTop;
        canvasZoomAnchorRef.current = {
          x: (previousLeft + previousWidth / 2) / previousScale,
          y: (previousTop + previousHeight / 2) / previousScale,
        };
      }
      setCanvasViewportSize(next);
    };
    measure();
    const resizeObserverConstructor = typeof ResizeObserver === 'undefined' ? undefined : ResizeObserver;
    const resizeObserver = resizeObserverConstructor === undefined ? undefined : new resizeObserverConstructor(measure);
    resizeObserver?.observe(scroll);
    const ownerWindow = scroll.ownerDocument?.defaultView ?? (typeof window === 'undefined' ? undefined : window);
    ownerWindow?.addEventListener('resize', measure);
    return () => {
      active = false;
      resizeObserver?.disconnect();
      ownerWindow?.removeEventListener('resize', measure);
    };
  }, [canvasViewport.scale, canvasViewportSize.height, canvasViewportSize.width, canvasZoomMode]);

  const canvasViewportKey = [
    canvasFocusRevision,
    canvasZoomMode,
    canvasViewport.mode,
    canvasViewport.scale,
    canvasViewport.stageWidth,
    canvasViewport.stageHeight,
    canvasViewport.focus.x,
    canvasViewport.focus.y,
    measuredCanvasViewportWidth,
    measuredCanvasViewportHeight,
  ].join('|');
  useLayoutEffect(() => {
    const scroll = canvasScrollRef.current;
    if (scroll === null) return;
    const anchor = canvasZoomAnchorRef.current;
    if (anchor !== null) {
      const maxLeft = Math.max(0, canvasViewport.stageWidth - scroll.clientWidth);
      const maxTop = Math.max(0, canvasViewport.stageHeight - scroll.clientHeight);
      scroll.scrollLeft = Math.min(maxLeft, Math.max(0, anchor.x * canvasViewport.scale - scroll.clientWidth / 2));
      scroll.scrollTop = Math.min(maxTop, Math.max(0, anchor.y * canvasViewport.scale - scroll.clientHeight / 2));
      canvasZoomAnchorRef.current = null;
    } else if (canvasViewportKeyRef.current !== canvasViewportKey) {
      const maxLeft = Math.max(0, canvasViewport.stageWidth - scroll.clientWidth);
      const maxTop = Math.max(0, canvasViewport.stageHeight - scroll.clientHeight);
      scroll.scrollLeft = Math.min(maxLeft, Math.max(0, canvasViewport.scrollLeft));
      scroll.scrollTop = Math.min(maxTop, Math.max(0, canvasViewport.scrollTop));
    }
    canvasViewportKeyRef.current = canvasViewportKey;
    canvasCameraRef.current = {
      scale: canvasViewport.scale,
      viewportWidth: scroll.clientWidth,
      viewportHeight: scroll.clientHeight,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
    };
  }, [canvasViewport.focus.x, canvasViewport.focus.y, canvasViewport.mode, canvasViewport.scale, canvasViewport.scrollLeft, canvasViewport.scrollTop, canvasViewport.stageHeight, canvasViewport.stageWidth, canvasViewportKey]);

  const captureCanvasZoomAnchor = (): void => {
    const scroll = canvasScrollRef.current;
    const camera = canvasCameraRef.current;
    const scale = camera.scale > 0 ? camera.scale : canvasViewport.scale;
    if (scroll === null || scale <= 0) return;
    const viewportWidth = camera.viewportWidth > 0 ? camera.viewportWidth : scroll.clientWidth;
    const viewportHeight = camera.viewportHeight > 0 ? camera.viewportHeight : scroll.clientHeight;
    const scrollLeft = camera.viewportWidth > 0 ? camera.scrollLeft : scroll.scrollLeft;
    const scrollTop = camera.viewportHeight > 0 ? camera.scrollTop : scroll.scrollTop;
    canvasZoomAnchorRef.current = {
      x: (scrollLeft + viewportWidth / 2) / scale,
      y: (scrollTop + viewportHeight / 2) / scale,
    };
  };

  const updateCanvasZoomMode = (value: string): void => {
    if (value !== 'fit-menu' && value !== 'fit-screen' && value !== 'one-to-one' && value !== 'manual') return;
    if (value === 'fit-menu' || value === 'fit-screen') {
      canvasZoomAnchorRef.current = null;
      setCanvasZoomMode(value);
      return;
    }
    captureCanvasZoomAnchor();
    if (value === 'manual') setManualCanvasZoomScale(canvasViewport.scale);
    setCanvasZoomMode(value);
  };

  const canvasSelectionFocus = computeX4UiBuilderSelectionFocus({
    drawableWidth: canvasDrawableWidth,
    drawableHeight: canvasDrawableHeight,
    viewportWidth: measuredCanvasViewportWidth,
    viewportHeight: measuredCanvasViewportHeight,
    margin: 16,
  }, selectedBuilderNode);
  const focusCanvasSelection = (): void => {
    if (canvasSelectionFocus === undefined
      || currentSampleProjectionRef.current !== projection
      || builderSelectionRef.current !== reconciledBuilderSelection) return;
    const currentCanvas = classifyX4UiCanvasExport({
      state: canvasStateRef.current,
      mountedCanvas: canvasHostRef.current?.firstElementChild,
      currentIdentity: currentVerificationSnapshotRef.current,
      committedIdentity: canvasExportIdentityRef.current,
    });
    if (currentCanvas.status !== 'available') return;
    canvasZoomAnchorRef.current = canvasSelectionFocus.focus;
    setManualCanvasZoomScale(canvasSelectionFocus.scale);
    setCanvasZoomMode('manual');
    // Refocusing after a user pan must run the existing camera effect even at the same scale.
    setCanvasFocusRevision(previous => previous + 1);
  };

  const adjustCanvasZoom = (direction: 1 | -1): void => {
    captureCanvasZoomAnchor();
    const nextScale = Math.min(16, Math.max(0.05, canvasViewport.scale * (direction > 0 ? 1.25 : 0.8)));
    setManualCanvasZoomScale(nextScale);
    setCanvasZoomMode('manual');
  };

  const handleCanvasScroll = (): void => {
    const scroll = canvasScrollRef.current;
    if (scroll === null) return;
    canvasCameraRef.current = {
      scale: canvasViewport.scale,
      viewportWidth: scroll.clientWidth,
      viewportHeight: scroll.clientHeight,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
    };
  };

  const handleCanvasExport = (): void => {
    if (canvasExportInFlightRef.current) return;
    const currentMountedCanvas = canvasHostRef.current?.firstElementChild;
    const classification = classifyX4UiCanvasExport({
      state: canvasStateRef.current,
      mountedCanvas: currentMountedCanvas,
      currentIdentity: currentVerificationSnapshotRef.current,
      committedIdentity: canvasExportIdentityRef.current,
    });
    if (classification.status !== 'available' || classification.filename === undefined) {
      setCanvasExportFeedback(`refused: ${classification.detail}`);
      return;
    }
    const canvasConstructor = typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement;
    if (canvasConstructor === null || !(currentMountedCanvas instanceof canvasConstructor)) {
      setCanvasExportFeedback('refused: the current mounted surface is not an HTMLCanvasElement.');
      return;
    }
    const canvas = currentMountedCanvas;
    const filename = classification.filename;
    const identityKey = classification.identityKey;
    canvasExportInFlightRef.current = true;
    setCanvasExportFeedback('serializing current canvas as image/png…');
    let callbackSettled = false;
    const refuse = (detail: string): void => {
      canvasExportInFlightRef.current = false;
      if (canvasHostRef.current !== null) setCanvasExportFeedback(`refused: ${detail}`);
    };
    try {
      const toBlob = canvas.toBlob;
      if (typeof toBlob !== 'function') {
        callbackSettled = true;
        refuse('native PNG serialization is unavailable.');
        return;
      }
      toBlob.call(canvas, blob => {
        if (callbackSettled) return;
        callbackSettled = true;
        const liveMountedCanvas = canvasHostRef.current?.firstElementChild;
        const liveClassification = classifyX4UiCanvasExport({
          state: canvasStateRef.current,
          mountedCanvas: liveMountedCanvas,
          currentIdentity: currentVerificationSnapshotRef.current,
          committedIdentity: canvasExportIdentityRef.current,
        });
        if (liveMountedCanvas !== canvas
          || liveClassification.status !== 'available'
          || liveClassification.filename !== filename
          || liveClassification.identityKey !== identityKey) {
          refuse('the current source, target, profile, or mounted canvas changed before serialization completed.');
          return;
        }
        const blobConstructor = typeof Blob === 'undefined' ? null : Blob;
        let blobType = '';
        let blobSize = 0;
        try {
          blobType = typeof blob?.type === 'string' ? blob.type.toLowerCase() : '';
          blobSize = typeof blob?.size === 'number' ? blob.size : 0;
        } catch {
          refuse('native PNG serialization returned an unreadable blob.');
          return;
        }
        if (blobConstructor === null || !(blob instanceof blobConstructor) || blobSize <= 0 || blobType !== 'image/png') {
          refuse('native PNG serialization returned an empty or non-PNG blob.');
          return;
        }
        let objectUrl: string | undefined;
        let downloaded = false;
        let cleanupFailed = false;
        let failureDetail = 'native PNG download could not be created.';
        try {
          if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
            failureDetail = 'object URL support is unavailable for the native PNG download.';
            throw new Error(failureDetail);
          }
          if (typeof document === 'undefined' || document.body === null) {
            failureDetail = 'the document download host is unavailable.';
            throw new Error(failureDetail);
          }
          objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = filename;
          anchor.style.display = 'none';
          document.body.appendChild(anchor);
          try {
            anchor.click();
            downloaded = true;
          } finally {
            anchor.remove();
          }
        } catch {
          downloaded = false;
        } finally {
          if (objectUrl !== undefined) {
            try {
              URL.revokeObjectURL(objectUrl);
            } catch {
              cleanupFailed = true;
            }
          }
        }
        if (cleanupFailed) {
          refuse('native PNG object URL cleanup failed.');
          return;
        }
        if (!downloaded) {
          refuse(failureDetail);
          return;
        }
        canvasExportInFlightRef.current = false;
        if (canvasHostRef.current !== null) setCanvasExportFeedback(`PNG serialization succeeded; a save/download request was handed to the host/browser · final Save As/file completion is not verified; please confirm the file · ${X4_UI_EDITOR_SESSION_GAME_TRUTH}`);
      }, 'image/png');
    } catch {
      if (!callbackSettled) {
        callbackSettled = true;
        refuse('native PNG serialization threw before producing a blob.');
      }
    }
  };

  return (
    <section data-testid="x4-ui-source-editor" className="flex min-w-0 flex-1 min-h-0 flex-col overflow-hidden bg-[#090c12] p-2 text-slate-300 font-sans text-xs">
      <div data-testid="x4-ui-builder-header" className="mb-1 flex min-h-8 shrink-0 flex-wrap items-center gap-2">
        <div data-testid="x4-ui-game-truth" className="shrink-0 whitespace-nowrap font-semibold text-amber-300">{X4_UI_EDITOR_SESSION_GAME_TRUTH}</div>
        <details data-testid="x4-ui-preview-settings" className="relative min-w-0 shrink-0">
          <summary data-testid="x4-ui-preview-settings-toggle" className="cursor-pointer rounded border border-cyan-500/30 bg-cyan-950/20 px-2 py-1 text-[11px] font-semibold text-cyan-200">Preview settings</summary>
          <div data-testid="x4-ui-profile-region" className="absolute left-0 top-full z-30 mt-1 max-h-[min(60vh,24rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded border border-white/10 bg-[#111722] p-2 shadow-xl">
            <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">Profile controls</h2>
            {profileError !== undefined && <div data-testid="x4-ui-profile-error" role="alert" className="mb-2 text-amber-300">{profileError}</div>}
            <div className="grid grid-cols-2 gap-1">
              <label className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-500">
                Drawable width
                <input data-testid="x4-ui-profile-width" type="number" min="0.000001" step="any" value={width === null ? '' : width} onChange={event => updateProfileDimension('width', event.target.value)} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-500">
                Drawable height
                <input data-testid="x4-ui-profile-height" type="number" min="0.000001" step="any" value={height === null ? '' : height} onChange={event => updateProfileDimension('height', event.target.value)} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200" />
              </label>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <label className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-500">
                Preview scale mode
                <select data-testid="x4-ui-profile-scale-mode" value={scaleMode} onChange={event => updateScaleMode(event.target.value)} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200">
                  <option value={X4_UI_SOURCE_EDITOR_SCALE_MODE_DERIVED}>Derived from X4 user scale</option>
                  <option value={X4_UI_SOURCE_EDITOR_SCALE_MODE_CUSTOM}>Custom effective Helper scale</option>
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-500">
                X4 user scale
                <input data-testid="x4-ui-profile-user-scale" type="number" min="0.000001" step="any" value={userScale} onChange={event => updateUserScale(event.target.value)} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[11px] text-slate-500">
                Preview scale
                <input data-testid="x4-ui-profile-scale" type="number" min="0.000001" step="any" value={uiScale === null ? '' : uiScale} disabled={scaleMode !== X4_UI_SOURCE_EDITOR_SCALE_MODE_CUSTOM} onChange={event => updateProfileDimension('uiScale', event.target.value)} className="min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200" />
              </label>
            </div>
          </div>
        </details>

        <details data-testid="x4-ui-overlay-toolbar" className="relative min-w-0 shrink-0">
          <summary data-testid="x4-ui-overlay-toggle" className="cursor-pointer rounded border border-cyan-500/30 bg-cyan-950/20 px-2 py-1 text-[11px] font-semibold text-cyan-200">Game overlays · {KEEP_OUT_PRESETS.find(preset => preset.id === activePresetId)?.label ?? 'Off'}</summary>
          <div data-testid="x4-ui-overlay-panel" className="absolute left-0 top-full z-30 mt-1 max-h-[min(60vh,26rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded border border-white/10 bg-[#111722] p-3 text-xs shadow-xl">
            <h2 className="font-semibold text-cyan-200">Game overlays</h2>
            <p className="mt-1 text-slate-400">Show where game UI may occupy the screen while you design. Preview only; your Lua is unchanged.</p>
            <p data-testid="x4-ui-overlay-truth" className="mt-1 font-semibold text-amber-300">Advisory only · Not verified in game</p>
            <div className="mt-3 flex flex-wrap gap-1" aria-label="Game context">
              <button type="button" data-testid="x4-ui-keepout-off" aria-pressed={activePresetId === null} onClick={() => selectPreset(null)} className={`rounded border px-2 py-1 text-[11px] ${activePresetId === null ? 'border-cyan-400 text-cyan-300' : 'border-white/10 text-slate-400'}`}>Off</button>
              {KEEP_OUT_PRESETS.map(preset => <button type="button" key={preset.id} data-testid={`x4-ui-keepout-preset-${preset.id}`} aria-pressed={activePresetId === preset.id} onClick={() => selectPreset(preset.id)} className={`rounded border px-2 py-1 text-[11px] ${activePresetId === preset.id ? 'border-cyan-400 text-cyan-300' : 'border-white/10 text-slate-400'}`}>{preset.label}</button>)}
            </div>
            {activePresetId === null && <p className="mt-3 text-slate-400">Choose a game context to show its guides.</p>}
            {KEEP_OUT_PRESETS.filter(preset => preset.id === activePresetId).map(preset => {
              const sessionPreset = sourceKeepOutPresets.find(value => asRecord(value)?.id === preset.id);
              return <div key={preset.id} className="mt-3 space-y-2">
                {preset.members.map(member => {
                  const sessionMember = keepOutMemberFor(sessionPreset, member.entryId);
                  const label = stringValue(asRecord(sessionMember?.entry)?.label, getBuiltInKeepOut(member.entryId)?.label ?? 'Unavailable guide');
                  const applicable = member.applicability === 'applicable';
                  return <label key={member.entryId} className="flex items-start gap-2 text-slate-300">
                    <input type="checkbox" data-testid={`x4-ui-overlay-entry-${member.entryId}`} className="mt-0.5"
                      checked={isX4UiKeepOutEntryChecked(activePresetId, preset.id, enabledEntryIds, member.entryId)}
                      disabled={!applicable} onChange={() => toggleEntry(preset.id, member.entryId)} />
                    <span>{label}{!applicable && <span className="block text-slate-500">Not mapped for this context.</span>}</span>
                  </label>;
                })}
              </div>;
            })}
            <p className="mt-3 text-slate-500">Guides are not guaranteed safe areas. Capture evidence and manual calibration are available in Inspect.</p>
          </div>
        </details>

        <details ref={previewInputsPanelRef} data-testid="x4-ui-preview-inputs-panel" className="relative min-w-0 shrink-0">
          <summary data-testid="x4-ui-preview-inputs-toggle" className="cursor-pointer rounded border border-cyan-500/30 bg-cyan-950/20 px-2 py-1 text-[11px] font-semibold text-cyan-200">Preview inputs{visibleSampleDraft !== undefined ? ' · unapplied edits' : ''}</summary>
          <div className="absolute left-0 top-full z-30 mt-1 max-h-[min(60vh,28rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded border border-white/10 bg-[#111722] p-2 text-xs shadow-xl">
            <X4UiPreviewScenarios
              scope={currentWorkspaceScope}
              owner={sessionOwner}
              input={sessionInput}
              projection={projection}
              view={{ width: projection.profile.drawable.width, height: projection.profile.drawable.height,
                uiScale: projection.profile.uiScale, scaleMode, userScale }}
              draftPending={visibleSampleDraft !== undefined}
              transition={projectedPreview.continuation}
              onApply={adoptPreviewScenario}
            />
            <X4UiSourceEditorSamples
              primary
              presentation={builderPresentation}
              catalog={projection.sampleCatalog}
              samples={projection.samples}
              draft={visibleSampleDraft}
              onSampleInput={updateSample}
              onApply={applySampleDraft}
              onReset={resetSampleDraft}
              onClear={clearPreviewValues}
              error={sampleError}
              onOpenInspect={() => {
                if (previewInputsPanelRef.current !== null) previewInputsPanelRef.current.open = false;
                openInspect();
              }}
              inspectTargetId={inspectTargetId}
            />
          </div>
        </details>

        <X4UiSourceEditorPreviewPaths primary catalog={projection.pathCatalog} paths={projection.paths}
          onPathSelection={updatePath} onReset={resetPaths} error={pathError} />

        <X4UiSourceEditorNewMenu
          workspace={workspace}
          source={projection.source}
          candidates={selection.candidates}
          onWorkspaceEdit={onWorkspaceEdit}
          onSelect={created => {
            selectSource(created.sourceSelector);
            setTargetSelector(created.targetSelector);
          }}
        />
        <X4UiSourceEditorLuaFiles
          workspace={workspace}
          scope={currentWorkspaceScope}
          source={projection.source}
          selectedSourcePath={selection.source?.path}
          candidates={selection.candidates}
          sourceSelector={sourceSelector}
          targetSelector={targetSelector}
          onWorkspaceEdit={onWorkspaceEdit}
          sourceEditStaged={Object.keys(visibleSourceEditStaged).length > 0}
          sourceEditPending={visibleSourceEditReceipt?.status === 'pending'}
          onSelect={created => {
            selectSource(created.sourceSelector);
            setTargetSelector(created.targetSelector);
          }}
        />
      </div>

      <div data-testid="x4-ui-builder-toolbar" className="mb-1 flex min-w-0 shrink-0 items-center gap-2">
        <section data-testid="x4-ui-source-region" aria-label="Source and target selection" className="flex min-w-0 flex-1 items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-slate-500">
            <span className="shrink-0">File</span>
            <select data-testid="x4-ui-source-selector" value={sourceSelector} onChange={event => selectSource(event.target.value)} className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200">
              <option value="">Select source…</option>
              {selection.candidates.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.path}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-slate-500">
            <span className="shrink-0">Menu</span>
            <select data-testid="x4-ui-target-selector" value={targetSelector} onChange={event => selectTarget(event.target.value)} className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200">
              <option value="">Select menu…</option>
              {targetOptions.some(target => target.key === targetSelector) && !menuOptions.some(target => target.key === targetSelector) && <option value={targetSelector}>Inspect target selected</option>}
              {menuOptions.map(target => <option key={target.key} value={target.key}>{target.raw.kind === 'top-level' ? 'Top-level menu' : target.label}</option>)}
            </select>
          </label>
        </section>
      </div>

      <div data-testid="x4-ui-builder-workspace" className="mt-1 grid min-h-0 flex-1 grid-cols-[minmax(8rem,0.55fr)_minmax(0,2.4fr)_minmax(18rem,1.2fr)] gap-1 overflow-hidden">
        <aside data-testid="x4-ui-builder-hierarchy" className="min-h-0 min-w-0 overflow-y-auto rounded border border-white/10 bg-black/20 p-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Menu hierarchy</h2>
              <div data-testid="x4-ui-builder-hierarchy-detail" className="mt-1 text-slate-500">Browse frames, tables, rows, cells, and widgets.</div>
            </div>
            <span data-testid="x4-ui-builder-hierarchy-status" className={builderPresentation.status === 'available' ? 'text-emerald-300' : 'text-amber-300'}>{builderPresentation.status}</span>
          </div>
          <div data-testid="x4-ui-builder-hierarchy-list" role="tree" className="mt-3 space-y-1">
            {builderPresentation.nodes.map(node => {
              const selected = reconciledBuilderSelection?.nodeId === node.id;
              const depth = builderNodeDepthFor(node, builderPresentation);
              return (
                <button
                  key={node.id}
                  type="button"
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-pressed={selected}
                  data-testid={`x4-ui-builder-node-${node.id}`}
                  onClick={() => selectBuilderNode(node)}
                  className={`flex w-full items-start justify-between gap-2 rounded border px-2 py-1 text-left ${selected ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200' : 'border-white/5 text-slate-300 hover:border-cyan-500/30 hover:bg-white/5'}`}
                  style={{ paddingLeft: `${8 + Math.min(depth, 3) * 6}px` }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold">{node.label}</span>
                    <span className="block truncate text-[9px] text-slate-500">{node.kind} · {node.selectable ? 'geometry issued' : 'geometry unresolved'}</span>
                  </span>
                  <span className={node.selectable ? 'text-emerald-300' : 'text-amber-300'} aria-hidden="true">{node.selectable ? '●' : '!'}</span>
                </button>
              );
            })}
            {builderPresentation.nodes.length === 0 && <div data-testid="x4-ui-builder-hierarchy-empty" className="rounded border border-amber-500/20 bg-amber-950/10 p-2 text-amber-200">{builderPresentation.detail}</div>}
          </div>
        </aside>

        <main data-testid="x4-ui-builder-canvas-column" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <section data-testid="x4-ui-preview-region" className="flex min-h-0 flex-1 flex-col rounded border border-white/10 bg-black/20 p-1">
            <div className="flex min-h-6 shrink-0 items-center justify-between gap-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Source canvas</h2>
              <span data-testid="x4-ui-canvas-status" className={canvasDescription.status === 'current' ? 'text-[10px] text-slate-300' : 'text-[10px] text-amber-300'}>{canvasDescription.label}</span>
            </div>
            {canvasDescription.status === 'stale' && (
              <div data-testid="x4-ui-canvas-stale-notice" role="status" className="mt-1 shrink-0 rounded border border-amber-500/40 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                <div className="font-semibold">Previous preview — not current</div>
                <div>The last successful preview is shown for reference only. It cannot be selected or exported.</div>
                {selection.source === undefined || selection.target === undefined
                  ? <div>Choose a file and menu above to render a current preview.</div>
                  : <div>Review the preview inputs or open Inspect to find what prevents a current render.</div>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {(projection.sampleCatalog?.entries.length ?? 0) > 0 && (
                    <button type="button" data-testid="x4-ui-canvas-stale-inputs" onClick={() => {
                      const panel = previewInputsPanelRef.current;
                      if (panel !== null) {
                        panel.open = true;
                        (panel.firstElementChild as HTMLElement | null)?.focus();
                      }
                    }} className="rounded border border-amber-500/40 px-2 py-1 font-semibold">Review preview inputs</button>
                  )}
                  <SourceEditInspectButton testId="x4-ui-canvas-stale-inspect" onOpenInspect={openInspect} inspectTargetId={inspectTargetId} />
                </div>
              </div>
            )}
            {builderPresentation.status === 'partial' && (projection.sampleCatalog?.entries.length ?? 0) > 0 && (
              <div data-testid="x4-ui-context-inputs-hint" className="shrink-0 text-[10px] text-amber-200">Missing content? Select an element or container in the hierarchy for related preview inputs. The Preview inputs menu shows all values.</div>
            )}
            <section data-testid="x4-ui-canvas-export-region" className="mt-1 flex shrink-0 flex-wrap items-center gap-2">
              <div data-testid="x4-ui-canvas-export-compact" className="text-[10px] text-slate-500">PNG export in Inspect · zoom changes the view only</div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
                <button type="button" data-testid="x4-ui-canvas-focus-selection" title="Center the selected element at 100%; fit larger elements." disabled={!canvasExportReady || canvasSelectionFocus === undefined} onClick={focusCanvasSelection} className="rounded border border-cyan-500/30 px-2 py-1 text-xs text-cyan-200 disabled:cursor-not-allowed disabled:text-slate-600">Focus selection</button>
                <label className="flex items-center gap-1 text-[10px] text-slate-500">
                  Preview zoom
                  <select data-testid="x4-ui-canvas-zoom-mode" aria-label="Preview zoom mode" value={canvasZoomMode} onChange={event => updateCanvasZoomMode(event.target.value)} className="rounded border border-white/10 bg-black/40 px-1 py-1 text-xs text-slate-200">
                    <option value="fit-menu">Fit menu</option>
                    <option value="fit-screen">Fit screen</option>
                    <option value="one-to-one">100%</option>
                    <option value="manual">Custom</option>
                  </select>
                </label>
                <button type="button" data-testid="x4-ui-canvas-zoom-out" aria-label="Zoom preview out" disabled={!canvasSurfaceIsMounted} onClick={() => adjustCanvasZoom(-1)} className="rounded border border-white/10 px-2 py-1 text-xs text-slate-300 disabled:cursor-not-allowed disabled:text-slate-600">−</button>
                <span data-testid="x4-ui-canvas-zoom-value" className="min-w-[4rem] text-center text-[10px] text-slate-400">{formatCanvasZoomPercent(canvasViewport.zoomPercent)}% preview</span>
                <button type="button" data-testid="x4-ui-canvas-zoom-in" aria-label="Zoom preview in" disabled={!canvasSurfaceIsMounted} onClick={() => adjustCanvasZoom(1)} className="rounded border border-white/10 px-2 py-1 text-xs text-slate-300 disabled:cursor-not-allowed disabled:text-slate-600">+</button>
              </div>
              <div data-testid="x4-ui-canvas-zoom-detail" className="basis-full text-[10px] text-slate-500">
                {canvasViewport.fallbackFromMenu ? 'Menu bounds unavailable; showing full screen.' : 'Zoom changes the view, not your menu.'}
              </div>
            </section>
            <div data-testid="x4-ui-canvas-scroll" ref={canvasScrollRef} onScroll={handleCanvasScroll} className="mt-1 min-h-0 flex-1 overflow-auto rounded border border-white/10 bg-black/40">
              <div data-testid="x4-ui-canvas-stage" className="relative inline-block align-top" style={canvasSurfaceStyle}>
                <div data-testid="x4-ui-canvas-host" ref={canvasHostRef} className={`flex items-start justify-start overflow-hidden rounded bg-black/40 ${canvasSurfaceIsMounted ? '' : 'min-h-24'}`} style={canvasSurfaceFillStyle} />
                <div
                  data-testid="x4-ui-canvas-overlay"
                  role="presentation"
                  onClick={handleBuilderCanvasClick}
                  className="pointer-events-auto absolute inset-0 cursor-crosshair"
                  style={canvasSurfaceFillStyle}
                >
                  {reconciledBuilderSelection !== undefined && selectedBuilderNode?.rect !== undefined && canvasExportReady && (
                    <div
                      data-testid="x4-ui-canvas-selection"
                      aria-label={`Selected ${selectedBuilderNode.label}`}
                      className="pointer-events-none absolute rounded border-2 border-cyan-300 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(8,145,178,0.5)]"
                      style={{
                        left: `${selectedBuilderNode.rect.x / canvasDrawableWidth * 100}%`,
                        top: `${selectedBuilderNode.rect.y / canvasDrawableHeight * 100}%`,
                        width: `${selectedBuilderNode.rect.width / canvasDrawableWidth * 100}%`,
                        height: `${selectedBuilderNode.rect.height / canvasDrawableHeight * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside data-testid="x4-ui-builder-inspector" ref={inspectorScroll.containerRef}
          onPointerDownCapture={() => inspectorScroll.cancel()} onWheelCapture={() => inspectorScroll.cancel()}
          onTouchMoveCapture={() => inspectorScroll.cancel()} onKeyDownCapture={() => inspectorScroll.cancel()}
          className="min-h-0 min-w-0 overflow-y-auto rounded border border-white/10 bg-black/20 p-1">
          <div className="flex min-h-6 items-center justify-between gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Selected element</h2>
          </div>
          {selectedBuilderNode === undefined ? (
            <>
              <div data-testid="x4-ui-builder-selection-empty" className="mt-2 rounded border border-amber-500/20 bg-amber-950/10 p-1 text-amber-200">Select an element on the canvas or in the hierarchy.</div>
              <X4UiSourceEditorRowControls
                context={contextualRowMove}
                builderStatus={builderPresentation.status}
                projectionLoading={corpusState.status === 'loading'}
                propertyDraftPending={Object.keys(visibleSourceEditStaged).length > 0}
                receipt={visibleSourceEditReceipt}
                onMove={(entryId, direction) => applySourceEdit(entryId, undefined, undefined, false, direction)}
              />
            </>
          ) : (
            <div data-testid="x4-ui-builder-selection" className="mt-1 rounded border border-cyan-500/30 bg-cyan-950/10 p-1">
               <div data-testid="x4-ui-builder-selected-node-label" className="font-bold text-cyan-200">{selectedBuilderNode.label}</div>
              {contextualPreviewInputs.length > 0 && (
                <details key={selectedBuilderNode.id} data-testid="x4-ui-context-inputs-panel" open={!selectedBuilderNode.selectable} className="mt-2 text-[11px]">
                  <summary className="cursor-pointer font-semibold text-cyan-200">Related preview inputs · {contextualPreviewInputs.length}</summary>
                  <X4UiSourceEditorSamples
                    primary
                    contextNode={selectedBuilderNode}
                    presentation={builderPresentation}
                    catalog={projection.sampleCatalog}
                    samples={projection.samples}
                    draft={visibleSampleDraft}
                    onSampleInput={updateSample}
                    onApply={applySampleDraft}
                    onReset={resetSampleDraft}
                    error={sampleError}
                    onOpenInspect={openInspect}
                    inspectTargetId={inspectTargetId}
                  />
                </details>
              )}
              <X4UiSourceEditorContextualPalette
                selectedNode={selectedBuilderNode}
                entry={contextualInsertionEntry}
                rowEntry={contextualRowInsertionEntry}
                rowHasEligibleCell={contextualRowHasEligibleCell}
                catalogAvailable={sourceEditCatalog !== undefined}
                sourceIdentityMatches={sourceEditCatalogIdentityMatches}
                builderStatus={builderPresentation.status}
                projectionLoading={corpusState.status === 'loading'}
                propertyDraftPending={Object.keys(visibleSourceEditStaged).length > 0}
                receipt={visibleSourceEditReceipt}
                onDiscard={discardSourceEditDraft}
                onInsert={(entryId, widget, text) => applySourceEdit(entryId, widget, text)}
                onInsertRow={entryId => applySourceEdit(entryId, undefined, undefined, true)}
              />
              <X4UiSourceEditorRowControls
                context={contextualRowMove}
                builderStatus={builderPresentation.status}
                projectionLoading={corpusState.status === 'loading'}
                propertyDraftPending={Object.keys(visibleSourceEditStaged).length > 0}
                receipt={visibleSourceEditReceipt}
                onMove={(entryId, direction) => applySourceEdit(entryId, undefined, undefined, false, direction)}
              />
              {selectedBuilderNode.selectable === false && contextualInsertionEntry === undefined && (
                <div data-testid="x4-ui-builder-selection-unresolved" role="alert" className="mt-2 rounded border border-amber-500/20 bg-amber-950/10 p-1 text-amber-200">
                  <div>{contextualPreviewInputs.length > 0 ? 'This element’s position is unresolved. Supply related preview values above, or open Inspect for other missing information.' : 'This element’s position is unresolved. You can still select it here; open Inspect to see what’s missing.'}</div>
                  <div className="mt-1"><SourceEditInspectButton testId="x4-ui-builder-open-inspect-unresolved" onOpenInspect={openInspect} inspectTargetId={inspectTargetId} /></div>
                </div>
              )}
              {sourceEditCatalog === undefined ? (
                <div data-testid="x4-ui-builder-properties-unavailable" role="alert" className="mt-2 rounded border border-amber-500/20 bg-amber-950/10 p-1 text-amber-200">
                  <div>This element cannot be edited here. Open Inspect for details.</div>
                  <div className="mt-1 text-slate-400">
                    {currentProgramResult?.status === 'refused'
                      ? 'The current source program could not issue property controls for this selection; open Inspect for the exact reason.'
                      : 'No current source property catalog was issued for this selection; refresh the source and open Inspect for the exact diagnostics.'}
                  </div>
                  <div className="mt-1"><SourceEditInspectButton testId="x4-ui-builder-open-inspect-unavailable" onOpenInspect={openInspect} inspectTargetId={inspectTargetId} /></div>
                </div>
              ) : sourceEditCatalog.status === 'locked' && selectedBuilderEntries.length === 0 ? (
                <div data-testid="x4-ui-builder-properties-unavailable" role="alert" className="mt-2 rounded border border-amber-500/30 bg-amber-950/20 p-1 text-amber-200">
                  <div>Property controls are unavailable for this source selection. Open Inspect for details.</div>
                  <div className="mt-1 text-slate-400">The source property catalog is unavailable to this control; inspect the exact source record before retrying.</div>
                  <div className="mt-1"><SourceEditInspectButton testId="x4-ui-builder-open-inspect-locked-catalog" onOpenInspect={openInspect} inspectTargetId={inspectTargetId} /></div>
                </div>
              ) : selectedBuilderEntries.length === 0 ? (
                contextualInsertionEntry === undefined && (
                  <div data-testid="x4-ui-builder-properties-empty" role="alert" className="mt-2 rounded border border-amber-500/20 bg-amber-950/10 p-1 text-amber-200">
                    <div>There are no editable properties for this element here. Open Inspect for details.</div>
                    <div className="mt-1 text-slate-400">The exact source records may be technical or unavailable for this selection; inspect them before retrying.</div>
                    <div className="mt-1"><SourceEditInspectButton testId="x4-ui-builder-open-inspect-empty" onOpenInspect={openInspect} inspectTargetId={inspectTargetId} /></div>
                  </div>
                )
              ) : (
                <X4UiSourceEditorSourceEdits
                  catalog={sourceEditCatalog}
                  entries={selectedBuilderEntries}
                  title="Friendly properties"
                  showTechnicalDetails={false}
                  showFrameBlocks={false}
                  staged={visibleSourceEditStaged}
                  receipt={visibleSourceEditReceipt}
                  onStage={stageSourceEdit}
                  onApply={applySourceEdit}
                  onDiscard={discardSourceEditDraft}
                  discardTestId="x4-ui-builder-source-edit-discard"
                  onOpenInspect={openInspect}
                  inspectTargetId={inspectTargetId}
                />
              )}
              <X4UiSourceEditorAddTextProperty key={selectedBuilderNode.id}
                additions={contextualTextPropertyAdditions} staged={visibleSourceEditStaged}
                pending={visibleSourceEditReceipt?.status === 'pending'} onStage={stageSourceEdit} onApply={applySourceEdit} />
            </div>
          )}
      <details id={inspectTargetId} ref={inspectPanelRef} data-testid="x4-ui-inspect-panel" className="mt-2 min-h-0 shrink-0 overflow-hidden rounded border border-white/10 bg-black/20">
        <summary data-testid="x4-ui-inspect-toggle" className="cursor-pointer px-2 py-1 font-bold uppercase tracking-wider text-cyan-300">Inspect source authority, diagnostics, scenarios, and exact controls</summary>
        <div data-testid="x4-ui-inspect-scroll" className="max-h-[34vh] overflow-y-auto px-2 pb-2 font-mono text-[11px]">
      <label className="mt-3 flex items-center gap-2 text-slate-400">
        <span>All source targets</span>
        <select data-testid="x4-ui-inspect-target-selector" value={targetSelector} onChange={event => selectTarget(event.target.value)} className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1">
          <option value="">Select target…</option>
          {targetOptions.map(target => <option key={target.key} value={target.key}>{target.label}</option>)}
        </select>
      </label>
      <p className="mt-1 text-slate-500">Includes helper functions and unsupported targets. Menu lists source-known frame builders; a selection does not verify it in game.</p>
      {selectedBuilderNode !== undefined && <div data-testid="x4-ui-builder-selected-node-inspect" className="mt-3 break-words text-slate-400">{selectedBuilderNode.detail}</div>}

      <section data-testid="x4-ui-corpus-inspect" className="mt-3 rounded border border-white/10 bg-black/20 p-3">
        <section data-testid="x4-ui-corpus-region">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Configured X4 corpus</h2>
            <button type="button" data-testid="x4-ui-corpus-reload" onClick={() => setCorpusGeneration(value => value + 1)} className="rounded border border-cyan-500/30 px-2 py-1 text-[9px] font-bold uppercase text-cyan-300">Reload</button>
          </div>
          <div className="mt-2 text-slate-400">Status: <span data-testid="x4-ui-corpus-status" className="font-bold text-slate-200">{statusLabel(corpusState.status)}</span></div>
          <div data-testid="x4-ui-corpus-toolbar-note" className="mt-1 text-slate-500">The configured corpus is read-only preview authority; derivation, color, and hash evidence remain available under Inspect.</div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Configured X4 corpus details</h2>
          <span className="text-[9px] text-slate-500">technical evidence</span>
        </div>
        <div data-testid="x4-ui-corpus-detail" className="mt-2 break-words text-slate-500">{corpusState.detail}</div>
        <div className="mt-2 text-slate-400">Canonical-default color: <span data-testid="x4-ui-corpus-color-status" className="font-bold text-slate-200">{statusLabel(corpusState.colorStatus)}</span></div>
        <div data-testid="x4-ui-corpus-color-detail" className="mt-1 break-words text-slate-500">{corpusState.colorDetail}</div>
        <div className="mt-1 text-slate-600">Canonical status is accepted only from the configured loader. Source derivation, corpus identity, and hash evidence are not inferred by this surface.</div>
      </section>

      <section data-testid="x4-ui-profile-inspect" className="mt-3 rounded border border-white/10 p-3">
        <div className="text-slate-500">Preview is for layout inspection; static analysis is not engine acceptance.</div>
        <div data-testid="x4-ui-profile-scale-derivation" className="mt-2 text-slate-500">Derived effective Helper scale = X4 user scale × drawable height ÷ 1080. Drawable width does not affect the derived value. Custom mode retains its effective value across height changes.</div>
        <div className="mt-2 text-slate-500">Truth grade: <span data-testid="x4-ui-profile-truth" className="text-amber-300">{stringValue(normalizedProfile?.truthGrade, 'unverified-default')}</span></div>
        <div className="text-slate-500">Profile: <span>{stringValue(normalizedProfile?.id, 'x4-ui-editor-default')}</span> · drawable {formatNumber(width)} × {formatNumber(height)} · effective Helper scale {formatNumber(uiScale)} · {X4_UI_EDITOR_SESSION_GAME_TRUTH}</div>
        <div className="mt-2 text-slate-500">Selected source identity: <span data-testid="x4-ui-selected-source-identity" className="break-all text-slate-300">{selectedSourceFile} · {selectedSourceHash}</span></div>
      </section>

      <section data-testid="x4-ui-canvas-export-inspect" className="mt-3 rounded border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">PNG export identity</h2>
          <button type="button" data-testid="x4-ui-canvas-export" disabled={!canvasExportReady || canvasExportInFlightRef.current} onClick={handleCanvasExport} className="rounded border border-emerald-500/40 px-2 py-1 text-[9px] font-bold uppercase text-emerald-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-600">Export current PNG</button>
        </div>
        <div data-testid="x4-ui-canvas-detail" className="mt-1 text-slate-500">{canvasDescription.detail} · {X4_UI_EDITOR_SESSION_GAME_TRUTH}</div>
        <div data-testid="x4-ui-canvas-export-status" className="mt-2 break-words text-amber-200">{canvasExportStatusText}</div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[9px] text-slate-500">technical evidence</span>
        </div>
        <div data-testid="x4-ui-canvas-export-metadata" className="mt-2 grid grid-cols-1 gap-1 text-slate-400 lg:grid-cols-2">
          <div data-testid="x4-ui-canvas-export-source">Source file: <span className="break-all text-slate-200">{selectedSourceFile} · sha256 {selectedSourceHash}</span></div>
          <div data-testid="x4-ui-canvas-export-target">Target: <span className="break-all text-slate-200">{selectedTargetName} · id {selectedTargetId} · kind {selectedTargetKind}</span></div>
          <div data-testid="x4-ui-canvas-export-profile">Profile: <span className="text-slate-200">{exportProfileId} · drawable {exportProfileWidth} × {exportProfileHeight} · Effective Helper scale {exportEffectiveScale}</span></div>
          <div data-testid="x4-ui-canvas-export-native-bitmap">Native bitmap: <span data-testid="x4-ui-canvas-export-native-width" className="text-slate-200">{nativeBitmapWidth}</span> × <span data-testid="x4-ui-canvas-export-native-height" className="text-slate-200">{nativeBitmapHeight}</span></div>
        </div>
        <div data-testid="x4-ui-canvas-export-boundary" className="mt-2 font-bold text-amber-300">Preview evidence only · {X4_UI_EDITOR_SESSION_GAME_TRUTH}</div>
      </section>

      <section data-testid="x4-ui-source-authority" className="mt-3 rounded border border-white/10 bg-black/20 p-3">
        <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300">Source authority</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 lg:grid-cols-4">
          <div>Status: <span className="text-slate-200">{sourceStatusText(source, 'status')}</span></div>
          <div>Availability: <span className="text-slate-200">{sourceStatusText(source, 'availability')}</span></div>
          <div>Editable: <span className="text-slate-200">{String(boolValue(source?.editable))}</span></div>
          <div>Shippable: <span className="text-slate-200">{String(boolValue(source?.shippable))}</span></div>
          <div>Registration: <span className="text-slate-200">{String(asArray(source?.registeredLuaFiles).length)} registered Lua file(s)</span></div>
          <div>Generated shadow lock: <span className="text-slate-200">{String(source?.status === 'generated-shadowing-source' || boolValue(source?.locked))}</span></div>
        </div>
        <div className="mt-2 text-slate-500">{stringValue(source?.detail, 'Source authority is unavailable.')}</div>
        <div className="mt-1 break-words text-slate-500">Reasons: {asArray(source?.reasons).map(value => String(value)).join(', ') || stringValue(source?.reason, 'none')}</div>
        <div className="mt-1 break-words text-slate-500">Generated collisions: {asArray(asRecord(source?.compile)?.generatedCollisions).map(value => String(value)).join(', ') || 'none'}</div>
      </section>

      {sourceEditCatalog === undefined ? (
        <section data-testid="x4-ui-source-edits" className="mt-3 rounded border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Source-safe property controls</h2>
            <span data-testid="x4-ui-source-edit-verification" className="text-[9px] font-bold text-amber-300">{X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>
          </div>
          <div data-testid="x4-ui-source-edit-catalog-unavailable" role="alert" className="mt-2 rounded border border-amber-500/30 bg-amber-950/20 p-2 text-amber-200">
            <div>Property controls are unavailable for the current source selection.</div>
            <div className="mt-1 text-slate-400">Select an exact source and target with a projected current session to expose owner-issued scalar literals. No caller-supplied catalog, program, evidence, source, target, or profile is accepted.</div>
            <div className="mt-1 break-words text-slate-400">
              {currentProgramRefusalMessage !== undefined
                ? 'The current source program could not issue property controls for this selection; open Inspect for the exact reason.'
                : 'The source property catalog was not issued for this selection; refresh the source and inspect the exact diagnostics.'}
            </div>
            <div data-testid="x4-ui-source-edit-catalog-technical-detail" className="mt-1 break-words text-slate-500">
              Exact current program diagnostic: {currentProgramRefusalMessage !== undefined
                ? currentProgramRefusalMessage
                : 'no exact current program refusal was issued'}
            </div>
          </div>
        </section>
      ) : (
        <X4UiSourceEditorSourceEdits
          catalog={sourceEditCatalog}
          staged={visibleSourceEditStaged}
          receipt={visibleSourceEditReceipt}
          onStage={stageSourceEdit}
          onApply={applySourceEdit}
          onDiscard={discardSourceEditDraft}
          discardTestId="x4-ui-source-edit-discard"
          onOpenInspect={openInspect}
          inspectTargetId={inspectTargetId}
        />
      )}

      <X4UiSourceEditorLinter inspection={lintInspection} />

      <X4UiSourceEditorPreviewGeometry scene={projection.preview.scene} />

      <X4UiSourceEditorPreviewPaths
        catalog={projection.pathCatalog}
        paths={projection.paths}
        onPathSelection={updatePath}
        onReset={resetPaths}
        error={pathError}
      />

      <X4UiSourceEditorPreviewLoops
        catalog={projection.loopCatalog}
        loops={projection.loops}
        effectiveSelections={projection.previewLoopSelections}
        onLoopIteration={updateLoop}
        onReset={resetLoops}
        error={loopError}
      />

      <X4UiSourceEditorSamples
        catalog={projection.sampleCatalog}
        samples={projection.samples}
        draft={visibleSampleDraft}
        onSampleInput={updateSample}
        onApply={applySampleDraft}
        onReset={resetSampleDraft}
        onClear={clearPreviewValues}
        error={sampleError}
      />

      <section data-testid="x4-ui-keepout-region" className="mt-3 rounded border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Context keep-outs</h2>
          <p className="text-slate-400">Choose visible guides in Game overlays above the canvas.</p>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
          {KEEP_OUT_PRESETS.map(preset => {
            const sessionPreset = sourceKeepOutPresets.find(value => asRecord(value)?.id === preset.id);
            return (
              <article key={preset.id} className="rounded border border-white/10 bg-black/25 p-2">
                <div className="font-bold text-slate-200">{preset.label}</div>
                <div className="mt-1 space-y-1">
                  {preset.members.map(member => {
                    const sessionMember = keepOutMemberFor(sessionPreset, member.entryId);
                    const sessionMemberRecord = sessionMember;
                    const entry = asRecord(sessionMemberRecord?.entry);
                    const label = stringValue(entry?.label, member.entryId);
                    const enabled = boolValue(sessionMemberRecord?.enabled);
                    return (
                      <div key={member.entryId} className="text-slate-500">
                        <span><span className="text-slate-300">{label}</span> · {keepOutEvidence(sessionMemberRecord)} · {member.evidenceGrade} · {member.applicabilityEvidence}{enabled ? '' : ' · unavailable in active preset'}</span>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
        <div data-testid="x4-ui-manual-calibration-region" className="mt-3 rounded border border-violet-500/30 bg-violet-950/10 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Manual screenshot-polygon calibration</h3>
              <div className="mt-1 text-slate-500">Session-local draft only. Add stores the plain calibration input; the accepted Session, Paint, and Canvas owners remain authoritative.</div>
            </div>
            <span data-testid="x4-ui-manual-calibration-truth" className="font-bold text-amber-300">Advisory only · {X4_UI_EDITOR_SESSION_GAME_TRUTH}</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
            <label className="flex flex-col gap-1 text-slate-500">
              Stable ID
              <input data-testid="x4-ui-manual-calibration-stable-id" type="text" value={manualCalibrationState.draft.stableId} onChange={event => updateManualDraftField('stableId', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" />
            </label>
            <label className="flex flex-col gap-1 text-slate-500">
              Context
              <input data-testid="x4-ui-manual-calibration-context" type="text" value={manualCalibrationState.draft.context} onChange={event => updateManualDraftField('context', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" />
            </label>
            <label className="flex flex-col gap-1 text-slate-500 lg:col-span-2">
              Source note
              <input data-testid="x4-ui-manual-calibration-source-note" type="text" value={manualCalibrationState.draft.sourceNote} onChange={event => updateManualDraftField('sourceNote', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" />
            </label>
            <label className="flex flex-col gap-1 text-slate-500">
              Screenshot SHA-256/hash
              <input data-testid="x4-ui-manual-calibration-screenshot-hash" type="text" value={manualCalibrationState.draft.screenshotHash} onChange={event => updateManualDraftField('screenshotHash', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" />
            </label>
            <label className="flex flex-col gap-1 text-slate-500">
              Screenshot profile
              <input data-testid="x4-ui-manual-calibration-profile" type="text" value={manualCalibrationState.draft.profile} onChange={event => updateManualDraftField('profile', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" />
            </label>
          </div>
          <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
            <div className="font-bold text-slate-300">Drawable bounds (screenshot pixels)</div>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-slate-500">Left<input data-testid="x4-ui-manual-calibration-drawable-left" type="number" step="any" value={manualCalibrationState.draft.drawableLeft} onChange={event => updateManualDraftField('drawableLeft', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" /></label>
              <label className="flex flex-col gap-1 text-slate-500">Top<input data-testid="x4-ui-manual-calibration-drawable-top" type="number" step="any" value={manualCalibrationState.draft.drawableTop} onChange={event => updateManualDraftField('drawableTop', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" /></label>
              <label className="flex flex-col gap-1 text-slate-500">Width<input data-testid="x4-ui-manual-calibration-drawable-width" type="number" step="any" value={manualCalibrationState.draft.drawableWidth} onChange={event => updateManualDraftField('drawableWidth', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" /></label>
              <label className="flex flex-col gap-1 text-slate-500">Height<input data-testid="x4-ui-manual-calibration-drawable-height" type="number" step="any" value={manualCalibrationState.draft.drawableHeight} onChange={event => updateManualDraftField('drawableHeight', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" /></label>
            </div>
          </div>
          <div className="mt-2 rounded border border-white/10 bg-black/20 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-slate-300">Polygon points (screenshot pixels)</div>
              <button type="button" data-testid="x4-ui-manual-calibration-add-point" onClick={addManualDraftPoint} className="rounded border border-violet-500/30 px-2 py-1 text-[9px] font-bold uppercase text-violet-300">Add point</button>
            </div>
            <div className="mt-2 space-y-1">
              {manualCalibrationState.draft.points.map((point, index) => (
                <div key={index} data-testid={`x4-ui-manual-calibration-point-${index}`} className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-28 flex-1 flex-col gap-1 text-slate-500">Point {index + 1} x<input data-testid={`x4-ui-manual-calibration-point-${index}-x`} type="number" step="any" value={point.x} onChange={event => updateManualDraftPoint(index, 'x', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" /></label>
                  <label className="flex min-w-28 flex-1 flex-col gap-1 text-slate-500">Point {index + 1} y<input data-testid={`x4-ui-manual-calibration-point-${index}-y`} type="number" step="any" value={point.y} onChange={event => updateManualDraftPoint(index, 'y', event.target.value)} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-slate-200" /></label>
                  <button type="button" data-testid={`x4-ui-manual-calibration-remove-point-${index}`} onClick={() => removeManualDraftPoint(index)} className="rounded border border-white/10 px-2 py-1 text-[9px] uppercase text-slate-400">Remove point</button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" data-testid="x4-ui-manual-calibration-add" onClick={addManualCalibration} className="mt-2 rounded border border-violet-500/30 px-2 py-1 text-[9px] font-bold uppercase text-violet-300">Add calibration · reset draft</button>
          <div className="mt-2 space-y-2">
            {manualCalibrationState.rows.map(row => {
              const acceptedIndex = manualSessionInput.acceptedRowIds.indexOf(row.rowId);
              const localRefusal = manualSessionInput.refusedRows.find(candidate => candidate.rowId === row.rowId);
              const sessionProjection = acceptedIndex < 0 ? undefined : projection.manualCalibrations[acceptedIndex];
              const sessionProjectionRecord = asRecord(sessionProjection);
              const entry = asRecord(sessionProjectionRecord?.entry);
              const provenance = asRecord(sessionProjectionRecord?.evidence) ?? asRecord(entry?.provenance);
              const screenshot = asRecord(provenance?.screenshot);
              const drawableBounds = asRecord(provenance?.drawableBounds);
              const geometry = asRecord(entry?.geometry);
              const normalizedPoints = asArray(geometry?.points);
              const explicitEnabled = manualCalibrationState.enabledManualRowIds.includes(row.rowId);
              const refusedReason = localRefusal?.reason ?? stringValue(sessionProjectionRecord?.reason, 'session-projection-unavailable');
              const refusedMessage = localRefusal?.message ?? stringValue(sessionProjectionRecord?.message, 'Session did not accept this calibration.');
              const calibrated = localRefusal === undefined && sessionProjectionRecord?.status === 'success';
              return (
                <article key={row.rowId} data-testid={`x4-ui-manual-calibration-row-${row.rowId}`} className="rounded border border-white/10 bg-black/30 p-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-200">{row.draft.stableId || '(empty stable ID)'} · {row.draft.context || '(empty context)'}</div>
                      <div data-testid={`x4-ui-manual-calibration-status-${row.rowId}`} className={calibrated ? 'mt-1 text-emerald-300' : 'mt-1 text-red-300'}>{calibrated ? `Calibrated · ${explicitEnabled ? 'enabled' : 'disabled'}` : `Refused: ${refusedReason} · ${refusedMessage}`}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-[9px] uppercase text-slate-400">
                        <input type="checkbox" data-testid={`x4-ui-manual-calibration-enable-${row.rowId}`} checked={explicitEnabled} disabled={row.draft.stableId.trim().length === 0} onChange={() => toggleManualCalibration(row.rowId)} />
                        Enabled
                      </label>
                      <button type="button" data-testid={`x4-ui-manual-calibration-remove-${row.rowId}`} onClick={() => removeManualCalibration(row.rowId)} className="rounded border border-red-500/30 px-2 py-1 text-[9px] font-bold uppercase text-red-300">Remove</button>
                    </div>
                  </div>
                  {calibrated && (
                    <>
                      <div className="mt-1 break-all text-slate-400">Screenshot hash: <span className="text-slate-200">{stringValue(screenshot?.hash, 'unavailable')}</span> · profile: <span className="text-slate-200">{stringValue(screenshot?.profile, 'unavailable')}</span></div>
                      <div className="mt-1 break-words text-slate-400">Drawable bounds: <span className="text-slate-200">left={String(drawableBounds?.left ?? 'unavailable')}, top={String(drawableBounds?.top ?? 'unavailable')}, width={String(drawableBounds?.width ?? 'unavailable')}, height={String(drawableBounds?.height ?? 'unavailable')}</span></div>
                      <div data-testid={`x4-ui-manual-calibration-evidence-${row.rowId}`} className="mt-1 break-all text-slate-400">Normalized polygon evidence: <span className="text-slate-200">{JSON.stringify(normalizedPoints)}</span></div>
                    </>
                  )}
                  <div className="mt-1 text-amber-300">Advisory only · {X4_UI_EDITOR_SESSION_GAME_TRUTH}</div>
                </article>
              );
            })}
            {manualCalibrationState.rows.length === 0 && <div data-testid="x4-ui-manual-calibration-empty" className="text-slate-500">No session-local manual calibrations have been added.</div>}
          </div>
        </div>
        <div className="mt-2 text-slate-600">Measured guides remain advisory: y=0.788, y=0.74, x=0.664. Screenshot-calibrated Mission/MESSAGES ticker and Top HUD strip polygons retain their capture evidence. All keep-outs remain Advisory only · Not verified in game; no INFORMATION rectangle is inferred.</div>
      </section>

        </div>
      </details>
        </aside>
      </div>

    </section>
  );
}
