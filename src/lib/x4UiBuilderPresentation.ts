/**
 * Small, disposable presentation mapping for the source-backed X4 UI builder.
 *
 * This module deliberately does not calculate layout, mutate a workspace, or
 * interpret Lua. It only joins the exact program/scene identities that the
 * existing Session owners already issued into keyboard-friendly hierarchy
 * rows and native-canvas hit targets.
 */

import type { X4UiSourceLocation } from './x4UiCallModel';
import type {
  X4UiLayoutCellNode,
  X4UiLayoutFrameNode,
  X4UiLayoutOperation,
  X4UiLayoutProgram,
  X4UiLayoutPreviewSampleCatalog,
  X4UiLayoutPreviewSampleCatalogEntry,
  X4UiLayoutRowNode,
  X4UiLayoutTableNode,
} from './x4UiLayoutProgram';
import type { X4UiEditorSessionProjection } from './x4UiEditorSession';
import type { WorkspaceSourceSplice } from './workspaceUndoHistory';
import { createPreviewSourceMapper, mapPreviewSourceRange } from './x4UiPreviewSourceMapping';
import type {
  X4UiSceneCellNode,
  X4UiSceneCompleteness,
  X4UiSceneFrameNode,
  X4UiSceneNodeBase,
  X4UiSceneRect,
  X4UiSceneRowNode,
  X4UiSceneTableNode,
  X4UiSceneTextNode,
  X4UiSceneWidgetNode,
} from './x4UiScene';
import type {
  X4UiSourceEditCatalog,
  X4UiSourceEditCatalogEntry,
  X4UiSourceEditEmptyCellEntry,
  X4UiSourceEditInsertedRow,
  X4UiSourceEditInsertedWidget,
  X4UiSourceEditMovedRow,
} from './x4UiSourceEdits';

export type X4UiBuilderNodeKind = 'frame' | 'table' | 'row' | 'cell' | 'widget' | 'text';

export interface X4UiBuilderNode {
  readonly id: string;
  readonly kind: X4UiBuilderNodeKind;
  readonly label: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  /** Exact owner-issued operation identities; never inferred from labels or paths. */
  readonly operationIds: readonly string[];
  /** Exact properties owned by this node, excluding descendant aggregate membership. */
  readonly propertyOperationIds: readonly string[];
  /** Underlying Scene widget kind; present only for generic widget nodes. */
  readonly widgetKind?: X4UiSceneWidgetNode['kind'];
  /** Primary/secondary slot; present only for text descendants. */
  readonly textSlot?: X4UiSceneTextNode['slot'];
  readonly source: X4UiSourceLocation;
  readonly sourceOrder: number;
  readonly rect?: X4UiSceneRect;
  readonly clipRect?: X4UiSceneRect;
  readonly zOrder?: number;
  /** Frame layer inherited through the exact scene parent chain. */
  readonly paintOrder?: number;
  readonly completeness: X4UiSceneCompleteness;
  readonly provenance: X4UiSceneNodeBase['provenance'];
  readonly selectable: boolean;
  readonly detail: string;
}

export interface X4UiBuilderPresentation {
  readonly status: 'available' | 'partial' | 'unavailable';
  readonly detail: string;
  readonly sourceIdentityKey: string | null;
  readonly targetId?: string;
  readonly profileKey: string | null;
  readonly roots: readonly string[];
  readonly nodes: readonly X4UiBuilderNode[];
}

export interface X4UiBuilderSelection {
  readonly nodeId: string;
  readonly workspace: unknown;
  readonly sourceIdentityKey: string;
  readonly targetId: string;
  readonly profileKey: string;
}

export interface X4UiBuilderSelectionContext {
  readonly workspace: unknown;
  readonly sourceIdentityKey: string | null;
  readonly targetId: string | undefined;
  readonly profileKey: string | null;
}

export type X4UiBuilderViewportMode = 'fit-menu' | 'fit-screen' | 'one-to-one' | 'manual';

export interface X4UiBuilderCanvasBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface X4UiBuilderCanvasViewportInput {
  readonly drawableWidth: number;
  readonly drawableHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly menuBounds?: X4UiBuilderCanvasBounds;
  readonly mode: X4UiBuilderViewportMode;
  readonly manualScale?: number;
  readonly margin?: number;
}

export interface X4UiBuilderCanvasViewport {
  readonly requestedMode: X4UiBuilderViewportMode;
  readonly mode: X4UiBuilderViewportMode;
  readonly fallbackFromMenu: boolean;
  readonly scale: number;
  readonly zoomPercent: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly focus: { readonly x: number; readonly y: number };
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly menuBounds?: X4UiBuilderCanvasBounds;
}

export interface X4UiBuilderSourceEditSplice {
  readonly path: string;
  /** Offsets are the owner-issued UTF-16 source splice range. */
  readonly startOffset: number;
  readonly endOffset: number;
  /** This is the exact encoded Lua replacement returned by SourceEdits. */
  readonly replacement: string;
}

export interface X4UiBuilderMappedSourceSpan {
  readonly startOffset: number;
  readonly endOffset: number;
}

const CREATOR_OPERATION_KINDS = new Set<X4UiLayoutOperation['kind']>([
  'createText',
  'createButton',
  'createEditBox',
  'createIcon',
]);

const PROPERTY_OPERATION_KINDS: Readonly<Record<'frame' | 'table' | 'row' | 'cell', ReadonlySet<X4UiLayoutOperation['kind']>>> = {
  frame: new Set(['createFrameHandle', 'setBackground', 'setBackground2', 'setOverlay', 'display', 'scaleX', 'scaleY', 'scaleFont']),
  table: new Set(['addTable', 'setDefaultCellProperties', 'setDefaultComplexCellProperties', 'setColWidth', 'setColWidthPercent']),
  row: new Set(['addRow']),
  cell: new Set(['setColSpan', 'createText', 'createButton', 'createEditBox', 'setHotkey', 'createIcon', 'setText', 'setText2']),
};

const finiteNonNegative = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const validRect = (value: unknown): value is X4UiSceneRect => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return finiteNonNegative(candidate.x)
    && finiteNonNegative(candidate.y)
    && finiteNonNegative(candidate.width)
    && finiteNonNegative(candidate.height);
};

const locationEquals = (left: X4UiSourceLocation | undefined, right: X4UiSourceLocation | undefined): boolean => (
  left !== undefined
  && right !== undefined
  && left.file === right.file
  && left.sourcePath === right.sourcePath
  && left.start.line === right.start.line
  && left.start.column === right.start.column
  && left.start.offset === right.start.offset
  && left.end.line === right.end.line
  && left.end.column === right.end.column
  && left.end.offset === right.end.offset
);

const identityKey = (value: unknown): string | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.file !== 'string' || typeof record.sha256 !== 'string') return null;
  return `${record.file}|${typeof record.sourcePath === 'string' ? record.sourcePath : ''}|${record.sha256}`;
};

export const x4UiBuilderProfileKey = (value: unknown): string | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const drawable = record.drawable;
  if (drawable === null || typeof drawable !== 'object' || Array.isArray(drawable)) return null;
  const drawableRecord = drawable as Record<string, unknown>;
  if (typeof record.id !== 'string'
    || !finiteNonNegative(drawableRecord.width)
    || !finiteNonNegative(drawableRecord.height)
    || typeof record.uiScale !== 'number'
    || !Number.isFinite(record.uiScale)) return null;
  return `${record.id}|${drawableRecord.width}x${drawableRecord.height}|${record.uiScale}`;
};

const boundedCanvasRect = (
  value: X4UiBuilderCanvasBounds | undefined,
  drawableWidth: number,
  drawableHeight: number,
): X4UiBuilderCanvasBounds | undefined => {
  if (value === undefined
    || !finiteNonNegative(value.x)
    || !finiteNonNegative(value.y)
    || !finiteNonNegative(value.width)
    || !finiteNonNegative(value.height)
    || drawableWidth <= 0
    || drawableHeight <= 0) return undefined;
  const left = Math.min(drawableWidth, value.x);
  const top = Math.min(drawableHeight, value.y);
  const right = Math.min(drawableWidth, Math.max(left, value.x + value.width));
  const bottom = Math.min(drawableHeight, Math.max(top, value.y + value.height));
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const unionCanvasRects = (rects: readonly X4UiBuilderCanvasBounds[]): X4UiBuilderCanvasBounds | undefined => {
  if (rects.length === 0) return undefined;
  let left = rects[0].x;
  let top = rects[0].y;
  let right = rects[0].x + rects[0].width;
  let bottom = rects[0].y + rects[0].height;
  for (let index = 1; index < rects.length; index += 1) {
    const rect = rects[index];
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** Returns the issued menu extent suitable for Fit menu, including blank frames/tables. */
export const deriveX4UiBuilderMenuBounds = (
  presentation: Pick<X4UiBuilderPresentation, 'nodes'> | undefined,
  drawableWidth: number,
  drawableHeight: number,
): X4UiBuilderCanvasBounds | undefined => {
  if (presentation === undefined || !finiteNonNegative(drawableWidth) || !finiteNonNegative(drawableHeight)
    || drawableWidth <= 0 || drawableHeight <= 0) return undefined;
  const frameNodes = presentation.nodes.filter(node => node.kind === 'frame' && node.rect !== undefined && node.selectable);
  const contentNodes = presentation.nodes.filter(node => node.kind !== 'frame' && node.rect !== undefined && node.selectable);
  const issuedNodes = frameNodes.length > 0 ? frameNodes : contentNodes;
  return unionCanvasRects(issuedNodes
    .map(node => boundedCanvasRect(node.rect, drawableWidth, drawableHeight))
    .filter((rect): rect is X4UiBuilderCanvasBounds => rect !== undefined));
};

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const X4_UI_BUILDER_MIN_SCALE = 0.01;
const X4_UI_BUILDER_MAX_SCALE = 16;
const X4_UI_BUILDER_MAX_FINITE_DRAWABLE = Number.MAX_VALUE / X4_UI_BUILDER_MAX_SCALE;

/**
 * One native-coordinate camera for the mounted canvas and its overlay. The
 * native drawable is never resized here; only its CSS presentation rectangle
 * changes, so paint/export identity remains owned by the renderer path.
 */
export const computeX4UiBuilderViewport = (
  input: X4UiBuilderCanvasViewportInput,
): X4UiBuilderCanvasViewport => {
  const drawableWidth = Number.isFinite(input.drawableWidth) && input.drawableWidth > 0
    ? Math.min(input.drawableWidth, X4_UI_BUILDER_MAX_FINITE_DRAWABLE)
    : 1;
  const drawableHeight = Number.isFinite(input.drawableHeight) && input.drawableHeight > 0
    ? Math.min(input.drawableHeight, X4_UI_BUILDER_MAX_FINITE_DRAWABLE)
    : 1;
  const viewportWidth = Number.isFinite(input.viewportWidth) && input.viewportWidth > 0 ? input.viewportWidth : 0;
  const viewportHeight = Number.isFinite(input.viewportHeight) && input.viewportHeight > 0 ? input.viewportHeight : 0;
  const margin = Number.isFinite(input.margin) && (input.margin ?? 0) >= 0 ? input.margin ?? 0 : 0;
  const menuBounds = boundedCanvasRect(input.menuBounds, drawableWidth, drawableHeight);
  const fallbackFromMenu = input.mode === 'fit-menu' && menuBounds === undefined;
  const mode: X4UiBuilderViewportMode = fallbackFromMenu ? 'fit-screen' : input.mode;
  const hasViewport = viewportWidth > 0 && viewportHeight > 0;
  const scaleForFit = (bounds: X4UiBuilderCanvasBounds): number => {
    if (!hasViewport) return 1;
    const availableWidth = Math.max(1, viewportWidth - margin * 2);
    const availableHeight = Math.max(1, viewportHeight - margin * 2);
    return clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height), X4_UI_BUILDER_MIN_SCALE, X4_UI_BUILDER_MAX_SCALE);
  };
  const scale = mode === 'one-to-one'
    ? 1
    : mode === 'manual'
      ? clamp(Number.isFinite(input.manualScale) && (input.manualScale ?? 0) > 0 ? input.manualScale ?? 1 : 1, X4_UI_BUILDER_MIN_SCALE, X4_UI_BUILDER_MAX_SCALE)
      : scaleForFit(mode === 'fit-menu' && menuBounds !== undefined
        ? menuBounds
        : { x: 0, y: 0, width: drawableWidth, height: drawableHeight });
  const stageWidth = drawableWidth * scale;
  const stageHeight = drawableHeight * scale;
  const focusBounds = mode === 'fit-menu' && menuBounds !== undefined
    ? menuBounds
    : { x: 0, y: 0, width: drawableWidth, height: drawableHeight };
  const focus = {
    x: focusBounds.x + focusBounds.width / 2,
    y: focusBounds.y + focusBounds.height / 2,
  };
  const scrollLeft = hasViewport
    ? clamp(focus.x * scale - viewportWidth / 2, 0, Math.max(0, stageWidth - viewportWidth))
    : 0;
  const scrollTop = hasViewport
    ? clamp(focus.y * scale - viewportHeight / 2, 0, Math.max(0, stageHeight - viewportHeight))
    : 0;
  return {
    requestedMode: input.mode,
    mode,
    fallbackFromMenu,
    scale,
    zoomPercent: scale * 100,
    stageWidth,
    stageHeight,
    focus,
    scrollLeft,
    scrollTop,
    ...(menuBounds === undefined ? {} : { menuBounds }),
  };
};

/** A deliberate working-view request; never changes authored geometry or the native bitmap. */
export const computeX4UiBuilderSelectionFocus = (
  input: Pick<X4UiBuilderCanvasViewportInput, 'drawableWidth' | 'drawableHeight' | 'viewportWidth' | 'viewportHeight' | 'margin'>,
  node: X4UiBuilderNode | undefined,
): Pick<X4UiBuilderCanvasViewport, 'scale' | 'focus'> | undefined => {
  if (node?.selectable !== true
    || [input.drawableWidth, input.drawableHeight, input.viewportWidth, input.viewportHeight]
      .some(value => !Number.isFinite(value) || value <= 0)) return undefined;
  const bounds = boundedCanvasRect(node.rect, input.drawableWidth, input.drawableHeight);
  if (bounds === undefined) return undefined;
  const fitted = computeX4UiBuilderViewport({ ...input, mode: 'fit-menu', menuBounds: bounds });
  return { scale: Math.min(1, fitted.scale), focus: fitted.focus };
};

const sourceOffset = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
);

/** Compatibility anchor only: never an old selection ID or write authority. */
export type X4UiBuilderSourceAnchor = Pick<X4UiBuilderNode, 'kind' | 'source'>;

/** Map one actual node source interval through one exact owner-issued splice. */
export const mapX4UiBuilderSourceSpanThroughEdit = (
  node: X4UiBuilderSourceAnchor | undefined,
  splice: X4UiBuilderSourceEditSplice | undefined,
): X4UiBuilderMappedSourceSpan | undefined => {
  if (node === undefined || splice === undefined || splice.path !== node.source.file || typeof splice.replacement !== 'string') return undefined;
  const nodeStart = sourceOffset(node.source.start.offset);
  const nodeEnd = sourceOffset(node.source.end.offset);
  const spliceStart = sourceOffset(splice.startOffset);
  const spliceEnd = sourceOffset(splice.endOffset);
  if (nodeStart === undefined || nodeEnd === undefined || nodeEnd < nodeStart
    || spliceStart === undefined || spliceEnd === undefined || spliceEnd < spliceStart) return undefined;
  const replacementEnd = spliceStart + splice.replacement.length;
  if (!Number.isSafeInteger(replacementEnd)) return undefined;
  const delta = splice.replacement.length - (spliceEnd - spliceStart);
  const overlaps = nodeStart < spliceEnd && nodeEnd > spliceStart;
  if (!overlaps) {
    const shift = nodeStart >= spliceEnd ? delta : 0;
    const mappedStart = nodeStart + shift;
    const mappedEnd = nodeEnd + shift;
    return Number.isSafeInteger(mappedStart) && Number.isSafeInteger(mappedEnd)
      ? { startOffset: mappedStart, endOffset: mappedEnd }
      : undefined;
  }
  if (nodeStart === spliceStart && nodeEnd === spliceEnd) {
    return { startOffset: spliceStart, endOffset: replacementEnd };
  }
  // An enclosing source node may survive a literal edit; preserve its exact
  // outer span only when the splice does not cut either boundary.
  if (nodeStart <= spliceStart && nodeEnd >= spliceEnd) {
    const mappedEnd = nodeEnd + delta;
    return Number.isSafeInteger(mappedEnd)
      ? { startOffset: nodeStart, endOffset: mappedEnd }
      : undefined;
  }
  return undefined;
};

/**
 * Resolve a continuation only against the fresh UI catalog/presentation. The
 * old node's label, geometry, id, and sourceOrder are deliberately ignored.
 */
export const resolveX4UiBuilderNodeAfterSourceEdit = (
  freshNodes: readonly X4UiBuilderNode[] | undefined,
  oldNode: X4UiBuilderSourceAnchor | undefined,
  splice: X4UiBuilderSourceEditSplice | undefined,
): X4UiBuilderNode | undefined => {
  if (freshNodes === undefined || oldNode === undefined || splice === undefined) return undefined;
  const mapped = mapX4UiBuilderSourceSpanThroughEdit(oldNode, splice);
  if (mapped === undefined) return undefined;
  const matches = freshNodes.filter(node => (
    node.kind === oldNode.kind
    && node.source.file === splice.path
    && node.source.sourcePath === oldNode.source.sourcePath
    && node.source.start.offset === mapped.startOffset
    && node.source.end.offset === mapped.endOffset
  ));
  return matches.length === 1 ? matches[0] : undefined;
};

/**
 * UI continuity after an exact owner-approved history restoration. Both parsed
 * catalogs must describe the same scalar splice; arbitrary structural diffs are
 * not element identity. Nothing here applies edits or reuses old authority.
 */
export const resolveX4UiBuilderNodeAfterScalarHistory = (
  freshNodes: readonly X4UiBuilderNode[],
  anchor: X4UiBuilderSourceAnchor,
  before: X4UiSourceEditCatalog,
  after: X4UiSourceEditCatalog,
): X4UiBuilderNode | undefined => {
  const beforeText = before.sourceText;
  const afterText = after.sourceText;
  const path = anchor.source.file;
  if (beforeText === undefined || afterText === undefined
    || before.sourceIdentity.file !== path || after.sourceIdentity.file !== path
    || before.sourcePath !== after.sourcePath
    || before.target.kind !== after.target.kind || before.target.name !== after.target.name) return undefined;
  if (beforeText === afterText) {
    return resolveX4UiBuilderNodeAfterSourceEdit(freshNodes, anchor, {
      path, startOffset: beforeText.length, endOffset: beforeText.length, replacement: '',
    });
  }
  let firstDifference = 0;
  while (firstDifference < Math.min(beforeText.length, afterText.length)
    && beforeText[firstDifference] === afterText[firstDifference]) firstDifference += 1;
  let suffixLength = 0;
  while (suffixLength < Math.min(beforeText.length, afterText.length) - firstDifference
    && beforeText[beforeText.length - suffixLength - 1] === afterText[afterText.length - suffixLength - 1]) suffixLength += 1;
  const lastDifference = beforeText.length - suffixLength;
  const delta = afterText.length - beforeText.length;
  const splices = new Map<string, X4UiBuilderSourceEditSplice>();
  for (const entry of before.entries) {
    if (entry.kind !== 'editable' || entry.path !== path
      || sourceOffset(entry.startOffset) === undefined || sourceOffset(entry.endOffset) === undefined
      || entry.startOffset > firstDifference || entry.endOffset < lastDifference
      || entry.endOffset <= entry.startOffset || entry.endOffset > beforeText.length
      || beforeText.slice(entry.startOffset, entry.endOffset) !== entry.expectedText) continue;
    const endOffset = entry.endOffset + delta;
    for (const fresh of after.entries) {
      if (fresh.kind !== 'editable' || fresh.path !== path
        || fresh.startOffset !== entry.startOffset || fresh.endOffset !== endOffset
        || fresh.valueType !== entry.valueType
        || fresh.sourceLiteral.sourcePath !== entry.sourceLiteral.sourcePath
        || fresh.provenance.callName !== entry.provenance.callName
        || JSON.stringify(fresh.provenance.fields) !== JSON.stringify(entry.provenance.fields)
        || afterText.slice(fresh.startOffset, fresh.endOffset) !== fresh.expectedText
        || beforeText.slice(0, entry.startOffset) !== afterText.slice(0, fresh.startOffset)
        || beforeText.slice(entry.endOffset) !== afterText.slice(fresh.endOffset)) continue;
      const splice = { path, startOffset: entry.startOffset, endOffset: entry.endOffset, replacement: fresh.expectedText };
      splices.set(JSON.stringify(splice), splice);
    }
  }
  return splices.size === 1
    ? resolveX4UiBuilderNodeAfterSourceEdit(freshNodes, anchor, [...splices.values()][0])
    : undefined;
};

/** Extend scalar continuity only with the exact source splice carried by history. */
export const resolveX4UiBuilderNodeAfterHistory = (
  freshNodes: readonly X4UiBuilderNode[],
  anchor: X4UiBuilderSourceAnchor,
  before: X4UiSourceEditCatalog,
  after: X4UiSourceEditCatalog,
  splice: WorkspaceSourceSplice | undefined,
): X4UiBuilderNode | undefined => {
  const scalar = resolveX4UiBuilderNodeAfterScalarHistory(freshNodes, anchor, before, after);
  if (splice === undefined || before.sourceText === after.sourceText) return scalar;
  if (before.sourceText === undefined || after.sourceText === undefined
    || splice.path !== anchor.source.file || before.sourceIdentity.file !== splice.path
    || after.sourceIdentity.file !== splice.path || before.sourcePath !== after.sourcePath
    || before.target.kind !== after.target.kind || before.target.name !== after.target.name
    || anchor.source.end.offset > before.sourceText.length
    || createPreviewSourceMapper(before.sourceText, after.sourceText, splice) === undefined) return undefined;
  if (scalar !== undefined) return scalar;
  const mapped = mapPreviewSourceRange(anchor.source.start.offset, anchor.source.end.offset, splice);
  if (mapped === undefined) return undefined;
  const matches = freshNodes.filter(node => node.kind === anchor.kind
    && node.source.file === splice.path && node.source.sourcePath === anchor.source.sourcePath
    && node.source.start.offset === mapped[0] && node.source.end.offset === mapped[1]);
  return matches.length === 1 ? matches[0] : undefined;
};

const sameSourceFile = (left: X4UiSourceLocation | undefined, right: X4UiSourceLocation | undefined): boolean => (
  left !== undefined
  && right !== undefined
  && left.file === right.file
  && left.sourcePath === right.sourcePath
);

const sourceRangeContained = (
  inner: X4UiSourceLocation | undefined,
  outer: X4UiSourceLocation | undefined,
): boolean => (
  sameSourceFile(inner, outer)
  && inner !== undefined
  && outer !== undefined
  && inner.start.offset >= outer.start.offset
  && inner.end.offset <= outer.end.offset
);

/**
 * Continue a typed widget insertion only against a fresh acknowledged
 * presentation. Unlike scalar continuation, insertion has no old widget
 * span to map: the accepted creator proof is the sole authority for the new
 * node and its exact frame/table/row/cell owner chain.
 */
export const resolveX4UiBuilderNodeAfterSourceWidgetInsertion = (
  freshNodes: readonly X4UiBuilderNode[] | undefined,
  freshSourceIdentityKey: string | null | undefined,
  insertedWidget: X4UiSourceEditInsertedWidget | undefined,
): X4UiBuilderNode | undefined => {
  if (freshNodes === undefined || insertedWidget === undefined || freshSourceIdentityKey === null || freshSourceIdentityKey === undefined) return undefined;
  const proofSourceIdentityKey = identityKey(insertedWidget.sourceIdentity);
  if (proofSourceIdentityKey === null || proofSourceIdentityKey !== freshSourceIdentityKey) return undefined;
  const nodeIds = new Set<string>();
  for (const node of freshNodes) {
    if (nodeIds.has(node.id)) return undefined;
    nodeIds.add(node.id);
  }

  const byId = new Map(freshNodes.map(node => [node.id, node] as const));
  const cell = byId.get(`scene:${insertedWidget.cellId}`);
  const row = byId.get(`scene:${insertedWidget.rowId}`);
  const table = byId.get(`scene:${insertedWidget.tableId}`);
  const frame = byId.get(`scene:${insertedWidget.frameId}`);
  if (cell?.kind !== 'cell'
    || row?.kind !== 'row'
    || table?.kind !== 'table'
    || frame?.kind !== 'frame'
    || cell.parentId !== row.id
    || row.parentId !== table.id
    || table.parentId !== frame.id
    || [cell, row, table, frame].some(node => !sameSourceFile(node.source, insertedWidget.creatorSource))) return undefined;

  const expectedWidgetKind = insertedWidget.widget === 'input' ? 'editbox' : insertedWidget.widget;
  const creatorWidgetKind: Record<X4UiSourceEditInsertedWidget['creatorCallName'], X4UiSceneWidgetNode['kind']> = {
    createText: 'text',
    createButton: 'button',
    createEditBox: 'editbox',
  };
  if (creatorWidgetKind[insertedWidget.creatorCallName] !== expectedWidgetKind) return undefined;
  const widgetMatches = freshNodes.filter(node => (
    node.kind === 'widget'
    && node.widgetKind === expectedWidgetKind
    && node.parentId === cell.id
    && sameSourceFile(node.source, insertedWidget.creatorSource)
    && locationEquals(node.source, insertedWidget.creatorSource)
    && node.operationIds.includes(insertedWidget.creatorOperationId)
  ));
  if (widgetMatches.length !== 1) return undefined;
  const widgetNode = widgetMatches[0];
  if (insertedWidget.widget !== 'text') return widgetNode;

  const textMatches = freshNodes.filter(node => (
    node.kind === 'text'
    && node.textSlot === 'primary'
    && node.parentId === widgetNode.id
    && sameSourceFile(node.source, insertedWidget.creatorSource)
    && sourceRangeContained(node.source, insertedWidget.creatorSource)
    && node.operationIds.includes(insertedWidget.creatorOperationId)
  ));
  return textMatches.length === 1 ? textMatches[0] : undefined;
};

/**
 * Resolve the exact row owner for a selected row or a proven descendant. The
 * hierarchy relationship, not a label or canvas coordinate, authorizes the
 * row-local action.
 */
export const resolveX4UiBuilderRowForNode = (
  nodes: readonly X4UiBuilderNode[] | undefined,
  selectedNode: X4UiBuilderNode | undefined,
): X4UiBuilderNode | undefined => {
  if (nodes === undefined || selectedNode === undefined) return undefined;
  const byId = new Map<string, X4UiBuilderNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) return undefined;
    byId.set(node.id, node);
  }
  if (byId.get(selectedNode.id) !== selectedNode) return undefined;
  let current = selectedNode;
  const visited = new Set<string>();
  while (current.kind !== 'row') {
    if (visited.has(current.id)
      || (current.kind !== 'cell' && current.kind !== 'widget' && current.kind !== 'text')
      || current.parentId === undefined) return undefined;
    visited.add(current.id);
    const parent = byId.get(current.parentId);
    if (parent === undefined) return undefined;
    current = parent;
  }
  const table = current.parentId === undefined ? undefined : byId.get(current.parentId);
  const frame = table?.parentId === undefined ? undefined : byId.get(table.parentId);
  return table?.kind === 'table' && frame?.kind === 'frame' ? current : undefined;
};

/**
 * Continue an accepted Add-row transaction against the fresh acknowledged
 * presentation and catalog. The accepted creator proof identifies the new
 * row; the fresh owner-issued empty-cell entries identify the first cell that
 * can receive the existing widget palette. If every cell is occupied, retain
 * the exact new row rather than inventing a cell selection.
 */
export const resolveX4UiBuilderNodeAfterSourceRowInsertion = (
  freshNodes: readonly X4UiBuilderNode[] | undefined,
  freshSourceIdentityKey: string | null | undefined,
  insertedRow: X4UiSourceEditInsertedRow | undefined,
  freshCatalog: X4UiSourceEditCatalog | undefined,
): X4UiBuilderNode | undefined => {
  if (freshNodes === undefined
    || insertedRow === undefined
    || freshSourceIdentityKey === null
    || freshSourceIdentityKey === undefined) return undefined;
  const proofSourceIdentityKey = identityKey(insertedRow.sourceIdentity);
  if (proofSourceIdentityKey === null || proofSourceIdentityKey !== freshSourceIdentityKey) return undefined;
  const byId = new Map<string, X4UiBuilderNode>();
  for (const node of freshNodes) {
    if (byId.has(node.id)) return undefined;
    byId.set(node.id, node);
  }
  const row = byId.get(`scene:${insertedRow.rowId}`);
  const table = byId.get(`scene:${insertedRow.tableId}`);
  const frame = byId.get(`scene:${insertedRow.frameId}`);
  if (row?.kind !== 'row'
    || table?.kind !== 'table'
    || frame?.kind !== 'frame'
    || row.parentId !== table.id
    || table.parentId !== frame.id
    || !row.operationIds.includes(insertedRow.creatorOperationId)
    || !locationEquals(row.source, insertedRow.creatorSource)
    || [row, table, frame].some(node => !sameSourceFile(node.source, insertedRow.creatorSource))) return undefined;
  const creatorRows = freshNodes.filter(node => (
    node.kind === 'row'
    && node.operationIds.includes(insertedRow.creatorOperationId)
  ));
  if (creatorRows.length !== 1
    || creatorRows[0] !== row
    || row.operationIds.filter(operationId => operationId === insertedRow.creatorOperationId).length !== 1) return undefined;
  const insertedCellIds = new Set(insertedRow.cellIds);
  const insertedSceneCellIds = new Set(insertedRow.cellIds.map(cellId => `scene:${cellId}`));
  if (insertedCellIds.size !== insertedRow.cellIds.length
    || insertedCellIds.size === 0
    || row.childIds.length !== insertedCellIds.size
    || row.childIds.some(cellId => !insertedSceneCellIds.has(cellId))) return undefined;
  const cells = insertedRow.cellIds.map(cellId => byId.get(`scene:${cellId}`));
  if (cells.some(cell => cell?.kind !== 'cell' || cell.parentId !== row.id)) return undefined;
  const cellNodes = cells as X4UiBuilderNode[];
  if (freshCatalog === undefined) return row;
  if (identityKey(freshCatalog.sourceIdentity) !== freshSourceIdentityKey) return undefined;
  const rowEntries = (freshCatalog.insertEntries ?? []).filter((entry): entry is X4UiSourceEditEmptyCellEntry => (
    entry.kind === 'insert-widget'
    && entry.anchor === 'empty-cell'
    && entry.frameId === insertedRow.frameId
    && entry.tableId === insertedRow.tableId
    && entry.rowId === insertedRow.rowId
  ));
  if (rowEntries.length === 0) return row;
  const cellById = new Map(cellNodes.map(cell => [cell.id.slice('scene:'.length), cell] as const));
  const seenEntryCells = new Set<string>();
  for (const entry of rowEntries) {
    const cell = cellById.get(entry.cellId);
    if (cell === undefined
      || seenEntryCells.has(entry.cellId)
      || identityKey(entry.provenance.sourceIdentity) !== freshSourceIdentityKey
      || !locationEquals(entry.rowSource, row.source)
      || !locationEquals(entry.cellSource, cell.source)) return undefined;
    seenEntryCells.add(entry.cellId);
  }
  const firstEntry = [...rowEntries].sort((left, right) => left.column - right.column || left.cellId.localeCompare(right.cellId))[0];
  const firstCell = firstEntry === undefined ? undefined : cellById.get(firstEntry.cellId);
  return firstCell ?? row;
};

/**
 * Continue an accepted row-move transaction against the fresh acknowledged
 * presentation. Row movement shares the Add-row creator/cell ownership proof,
 * but always returns the exact fresh moved row; it never falls back to a stale
 * row index or a descendant widget.
 */
export const resolveX4UiBuilderNodeAfterSourceRowMove = (
  freshNodes: readonly X4UiBuilderNode[] | undefined,
  freshSourceIdentityKey: string | null | undefined,
  movedRow: X4UiSourceEditMovedRow | undefined,
): X4UiBuilderNode | undefined => {
  if (movedRow === undefined
    || typeof movedRow.movedFromRowId !== 'string'
    || movedRow.movedFromRowId.length === 0
    || !Number.isSafeInteger(movedRow.movedFromRowIndex)
    || movedRow.movedFromRowIndex < 1
    || !Number.isSafeInteger(movedRow.rowIndex)
    || movedRow.rowIndex < 1
    || (movedRow.direction !== 'up' && movedRow.direction !== 'down')) return undefined;
  try {
    const resolvedRow = resolveX4UiBuilderNodeAfterSourceRowInsertion(
      freshNodes,
      freshSourceIdentityKey,
      movedRow,
      undefined,
    );
    if (resolvedRow === undefined || freshNodes === undefined) return undefined;
    const byId = new Map<string, X4UiBuilderNode>();
    for (const node of freshNodes) {
      if (byId.has(node.id)) return undefined;
      byId.set(node.id, node);
    }
    const table = resolvedRow.parentId === undefined ? undefined : byId.get(resolvedRow.parentId);
    if (table?.kind !== 'table') return undefined;
    const freshRows = table.childIds.map(childId => byId.get(childId));
    if (freshRows.some(child => child?.kind !== 'row' || child.parentId !== table.id)
      || new Set(table.childIds).size !== table.childIds.length) return undefined;
    const freshRowIndex = freshRows.indexOf(resolvedRow) + 1;
    const expectedRowIndex = movedRow.movedFromRowIndex + (movedRow.direction === 'down' ? 1 : -1);
    return freshRowIndex >= 1
      && movedRow.rowIndex === freshRowIndex
      && movedRow.rowIndex === expectedRowIndex
      ? resolvedRow
      : undefined;
  } catch {
    return undefined;
  }
};

const sceneIdentityIsExact = (
  projection: X4UiEditorSessionProjection,
  program: X4UiLayoutProgram,
  scene: { readonly profile: { readonly source: unknown } },
): boolean => {
  const selectedSource = projection.preview.selectedSource?.sourceIdentity;
  const selectedTarget = projection.preview.selectedTarget;
  const programTarget = program.target;
  return selectedSource !== undefined
    && selectedTarget !== undefined
    && identityKey(selectedSource) !== null
    && identityKey(selectedSource) === identityKey(selectedTarget.sourceIdentity)
    && identityKey(selectedTarget.sourceIdentity) === identityKey(programTarget.sourceIdentity)
    && selectedTarget.id === programTarget.id
    && locationEquals(selectedTarget.source, programTarget.source)
    && identityKey(scene.profile.source) === identityKey(programTarget.sourceIdentity);
};

const programIdentityIsExact = (projection: X4UiEditorSessionProjection, program: X4UiLayoutProgram): boolean => {
  const selectedSource = projection.preview.selectedSource?.sourceIdentity;
  const selectedTarget = projection.preview.selectedTarget;
  return selectedSource !== undefined
    && selectedTarget !== undefined
    && identityKey(selectedSource) !== null
    && identityKey(selectedSource) === identityKey(selectedTarget.sourceIdentity)
    && identityKey(selectedTarget.sourceIdentity) === identityKey(program.target.sourceIdentity)
    && selectedTarget.id === program.target.id
    && locationEquals(selectedTarget.source, program.target.source);
};

const sceneNodeById = (scene: {
  readonly frames: readonly X4UiSceneFrameNode[];
  readonly tables: readonly X4UiSceneTableNode[];
  readonly rows: readonly X4UiSceneRowNode[];
  readonly cells: readonly X4UiSceneCellNode[];
  readonly widgets: readonly X4UiSceneWidgetNode[];
  readonly texts: readonly X4UiSceneTextNode[];
}): ReadonlyMap<string, X4UiSceneNodeBase> => {
  const nodes: X4UiSceneNodeBase[] = [
    ...scene.frames,
    ...scene.tables,
    ...scene.rows,
    ...scene.cells,
    ...scene.widgets,
    ...scene.texts,
  ];
  return new Map(nodes.map(node => [node.id, node] as const));
};

const operationIdsAtExactSource = (
  operations: readonly X4UiLayoutOperation[],
  source: X4UiSourceLocation,
  creatorOnly: boolean,
): readonly string[] => operations
  .filter(operation => (!creatorOnly || CREATOR_OPERATION_KINDS.has(operation.kind)) && locationEquals(operation.source, source))
  .map(operation => operation.id);

const programCellForSceneWidget = (
  program: X4UiLayoutProgram,
  widget: X4UiSceneWidgetNode,
): X4UiLayoutCellNode | undefined => {
  if (!widget.cellId.startsWith('scene:')) return undefined;
  const cellId = widget.cellId.slice('scene:'.length);
  return program.cells.find(cell => cell.id === cellId);
};

const operationIdsForWidget = (
  program: X4UiLayoutProgram,
  widget: X4UiSceneWidgetNode,
): readonly string[] => {
  const cell = programCellForSceneWidget(program, widget);
  if (cell === undefined) return operationIdsAtExactSource(program.operations, widget.source, true);
  const membership = new Set([...cell.operationIds, ...cell.metadataOperationIds]);
  return program.operations
    .filter(operation => membership.has(operation.id)
      && (operation.cellId === cell.id || CREATOR_OPERATION_KINDS.has(operation.kind)))
    .map(operation => operation.id);
};

const operationIdsForText = (
  program: X4UiLayoutProgram,
  text: Pick<X4UiSceneTextNode, 'source' | 'slot'>,
  parentWidget: X4UiBuilderNode | undefined,
): readonly string[] => {
  const parentOperationIds = parentWidget?.operationIds ?? [];
  if (parentOperationIds.length === 0) return operationIdsAtExactSource(program.operations, text.source, false);
  const parentOperations = program.operations.filter(operation => parentOperationIds.includes(operation.id));
  return parentOperations
    .filter(operation => {
      if (operation.kind === 'setText2') return text.slot === 'secondary';
      if (operation.kind === 'setText') return text.slot === 'primary';
      return CREATOR_OPERATION_KINDS.has(operation.kind);
    })
    .map(operation => operation.id);
};

/**
 * Layout ledgers intentionally retain aggregate membership for auditability.
 * Inspector controls need the narrower owner role, however, so descendants do
 * not appear as properties of their containing table/row/frame.
 */
const propertyOperationIdsForProgramNode = (
  program: X4UiLayoutProgram,
  kind: 'frame' | 'table' | 'row' | 'cell',
  nodeId: string,
  operationIds: readonly string[],
): readonly string[] => {
  const membership = new Set(operationIds);
  const allowedKinds = PROPERTY_OPERATION_KINDS[kind];
  return program.operations
    .filter(operation => membership.has(operation.id) && allowedKinds.has(operation.kind))
    .filter(operation => {
      if (kind === 'frame') {
        return operation.frameId === nodeId
          && operation.tableId === undefined
          && operation.rowId === undefined
          && operation.cellId === undefined;
      }
      if (kind === 'table') {
        return operation.tableId === nodeId
          && operation.rowId === undefined
          && operation.cellId === undefined;
      }
      if (kind === 'row') {
        return operation.rowId === nodeId && operation.cellId === undefined;
      }
      return operation.cellId === nodeId;
    })
    .map(operation => operation.id);
};

const detailFor = (sceneNode: X4UiSceneNodeBase | undefined, hasGeometry: boolean): string => {
  if (!hasGeometry) return 'Source identity is known, but the renderer did not issue selectable geometry for this element.';
  if (sceneNode?.completeness === 'partial') return 'Source-derived geometry is partial; inspect the retained diagnostics before relying on this preview.';
  if (sceneNode?.provenance === 'unavailable') return 'This source construct is retained in the hierarchy but its preview geometry is unavailable.';
  return 'Source-derived element; selection is preview-only and does not change the native bitmap.';
};

const labelFor = (
  kind: X4UiBuilderNodeKind,
  index: number,
  value: { readonly id: string; readonly rowIndex?: number; readonly column?: number; readonly primaryContent?: string; readonly content?: string; readonly defaultContent?: string; readonly contentSelection?: X4UiSceneTextNode['contentSelection']; readonly slot?: string },
): string => {
  if (kind === 'frame') return `Frame ${index + 1}`;
  if (kind === 'table') return `Table ${index + 1}`;
  if (kind === 'row') return `Row ${value.rowIndex === undefined ? index + 1 : value.rowIndex}`;
  if (kind === 'cell') return `Cell ${value.column === undefined ? index + 1 : value.column}`;
  const content = kind === 'text' && value.contentSelection === 'preview-default'
    ? value.defaultContent
    : value.primaryContent ?? value.content;
  const roleLabel = kind === 'text'
    ? value.slot === 'secondary' ? 'Secondary text' : 'Text'
    : 'Widget';
  const suffix = typeof content === 'string' && content.trim().length > 0
    ? ` · ${content.trim().slice(0, 42)}`
    : '';
  return `${roleLabel}${suffix}`;
};

const selectable = (rect: X4UiSceneRect | undefined): boolean => (
  rect !== undefined && rect.width > 0 && rect.height > 0
);

const makeNode = (
  kind: X4UiBuilderNodeKind,
  index: number,
  sceneNode: X4UiSceneNodeBase | undefined,
  value: { readonly id: string; readonly source: X4UiSourceLocation; readonly sourceOrder?: number; readonly operationIds?: readonly string[]; readonly metadataOperationIds?: readonly string[]; readonly rowIndex?: number; readonly column?: number; readonly primaryContent?: string; readonly content?: string; readonly defaultContent?: string; readonly contentSelection?: X4UiSceneTextNode['contentSelection']; readonly slot?: string; readonly widgetKind?: X4UiSceneWidgetNode['kind']; readonly textSlot?: X4UiSceneTextNode['slot'] },
  childIds: readonly string[],
  parentId: string | undefined,
  operationIds: readonly string[],
  propertyOperationIds: readonly string[] = operationIds,
): X4UiBuilderNode => {
  const rect = sceneNode?.rect !== undefined && validRect(sceneNode.rect) ? sceneNode.rect : undefined;
  const clipRect = sceneNode?.clipRect !== undefined && validRect(sceneNode.clipRect) ? sceneNode.clipRect : undefined;
  return {
    id: sceneNode?.id ?? (kind === 'frame' || kind === 'table' || kind === 'row' || kind === 'cell' ? `scene:${value.id}` : value.id),
    kind,
    label: labelFor(kind, index, value),
    ...(parentId === undefined ? {} : { parentId }),
    childIds,
    operationIds: [...new Set(operationIds)],
    propertyOperationIds: [...new Set(propertyOperationIds)],
    ...(value.widgetKind === undefined ? {} : { widgetKind: value.widgetKind }),
    ...(value.textSlot === undefined ? {} : { textSlot: value.textSlot }),
    source: sceneNode?.source ?? value.source,
    sourceOrder: sceneNode?.sourceOrder ?? value.sourceOrder ?? Number.MAX_SAFE_INTEGER,
    ...(rect === undefined ? {} : { rect }),
    ...(clipRect === undefined ? {} : { clipRect }),
    ...(sceneNode?.zOrder === undefined ? {} : { zOrder: sceneNode.zOrder }),
    completeness: sceneNode?.completeness ?? 'unavailable',
    provenance: sceneNode?.provenance ?? 'unavailable',
    selectable: selectable(rect),
    detail: detailFor(sceneNode, selectable(rect)),
  };
};

const sceneStructuralNode = (
  nodes: ReadonlyMap<string, X4UiSceneNodeBase>,
  id: string,
): X4UiSceneNodeBase | undefined => nodes.get(`scene:${id}`);

/** Build the left hierarchy and the exact source-operation binding for the selected target. */
export const buildX4UiBuilderPresentation = (
  projection: X4UiEditorSessionProjection | undefined,
): X4UiBuilderPresentation => {
  const empty = (detail: string, status: X4UiBuilderPresentation['status'] = 'unavailable'): X4UiBuilderPresentation => ({
    status,
    detail,
    sourceIdentityKey: null,
    profileKey: x4UiBuilderProfileKey(projection?.normalizedProfile),
    roots: [],
    nodes: [],
  });
  if (projection === undefined) return empty('The source-backed Session projection is not available yet.');
  const programResult = projection.preview.program;
  if (programResult === undefined || programResult.status === 'refused' || programResult.program === undefined) {
    return empty('Select an exact source and target with a projected Session before using the hierarchy.');
  }
  const sceneResult = projection.preview.scene;
  const program = programResult.program;
  if (!programIdentityIsExact(projection, program)) return empty('Source or target identity drifted; hierarchy selection was cleared until Session reissued matching program data.', 'partial');
  const scene = sceneResult?.status === 'projected' || sceneResult?.status === 'partial' ? sceneResult.scene : undefined;
  const sceneMatchesProgram = scene !== undefined && sceneIdentityIsExact(projection, program, scene);
  const profileKey = x4UiBuilderProfileKey(projection.normalizedProfile);
  const sourceIdentityKey = identityKey(program.target.sourceIdentity);
  const sceneNodes = sceneMatchesProgram && scene !== undefined ? sceneNodeById(scene) : new Map<string, X4UiSceneNodeBase>();
  const nodes: X4UiBuilderNode[] = [];
  const roots: string[] = [];
  const byId = new Map<string, X4UiBuilderNode>();
  const add = (node: X4UiBuilderNode): void => {
    if (byId.has(node.id)) return;
    byId.set(node.id, node);
    nodes.push(node);
  };

  program.frames.forEach((frame: X4UiLayoutFrameNode, frameIndex) => {
    const id = `scene:${frame.id}`;
    add(makeNode(
      'frame',
      frameIndex,
      sceneStructuralNode(sceneNodes, frame.id),
      frame,
      frame.tableIds.map(tableId => `scene:${tableId}`),
      undefined,
      frame.operationIds,
      propertyOperationIdsForProgramNode(program, 'frame', frame.id, frame.operationIds),
    ));
    roots.push(id);
  });
  program.tables.forEach((table: X4UiLayoutTableNode, tableIndex) => {
    add(makeNode(
      'table',
      tableIndex,
      sceneStructuralNode(sceneNodes, table.id),
      table,
      table.rowIds.map(rowId => `scene:${rowId}`),
      table.frameId === undefined ? undefined : `scene:${table.frameId}`,
      table.operationIds,
      propertyOperationIdsForProgramNode(program, 'table', table.id, table.operationIds),
    ));
  });
  program.rows.forEach((row: X4UiLayoutRowNode, rowIndex) => {
    add(makeNode(
      'row',
      rowIndex,
      sceneStructuralNode(sceneNodes, row.id),
      row,
      row.cellIds.map(cellId => `scene:${cellId}`),
      row.tableId === undefined ? undefined : `scene:${row.tableId}`,
      row.operationIds,
      propertyOperationIdsForProgramNode(program, 'row', row.id, row.operationIds),
    ));
  });
  program.cells.forEach((cell: X4UiLayoutCellNode, cellIndex) => {
    const operationIds = [...cell.operationIds, ...cell.metadataOperationIds];
    add(makeNode(
      'cell',
      cellIndex,
      sceneStructuralNode(sceneNodes, cell.id),
      cell,
      [],
      cell.rowId === undefined ? undefined : `scene:${cell.rowId}`,
      operationIds,
      propertyOperationIdsForProgramNode(program, 'cell', cell.id, operationIds),
    ));
  });
  if (sceneMatchesProgram && scene !== undefined) {
    scene.widgets.forEach((widget, widgetIndex) => {
      const operationIds = operationIdsForWidget(program, widget);
      add(makeNode('widget', widgetIndex, widget, { ...widget, widgetKind: widget.kind }, widget.textIds, widget.cellId, operationIds));
    });
    scene.texts.forEach((text, textIndex) => {
      // buildTextNode pins text content to the descriptor argument location,
      // not the enclosing createText call. The parent widget is the exact
      // owner relationship that carries the creator operation identity.
      const parentWidget = byId.get(text.widgetId);
      const operationIds = operationIdsForText(program, text, parentWidget);
      add(makeNode('text', textIndex, text, { ...text, textSlot: text.slot }, [], text.widgetId, operationIds));
    });
    // Scene can withhold a widget solely because its parent's geometry is unknown.
    // Keep its current, source-issued descriptor discoverable without manufacturing
    // a rectangle, paint node, or source-edit permission. Real Scene nodes win by ID.
    const knownText = (fact: X4UiLayoutCellNode['descriptorFacts'][string] | undefined): string | undefined => (
      fact?.status === 'known' && fact.expectedType === 'string' && typeof fact.value === 'string' ? fact.value : undefined
    );
    program.cells.forEach(cell => {
      const widgetKind = knownText(cell.descriptorFacts.contentKind);
      if (widgetKind !== 'text' && widgetKind !== 'button' && widgetKind !== 'editbox' && widgetKind !== 'icon') return;
      const membership = new Set([...cell.operationIds, ...cell.metadataOperationIds]);
      const owned = program.operations.filter(operation => membership.has(operation.id) && operation.cellId === cell.id);
      const creators = owned.filter(operation => CREATOR_OPERATION_KINDS.has(operation.kind));
      if (creators.length !== 1) return;
      const creator = creators[0];
      const expectedCreator = widgetKind === 'editbox' ? 'createEditBox' : `create${widgetKind[0].toUpperCase()}${widgetKind.slice(1)}`;
      if (creator.kind !== expectedCreator
        || !locationEquals(creator.source, cell.descriptorFacts.contentKind.source)
        || (creator.status !== 'applied' && !(creator.status === 'unresolved' && creator.kernel !== undefined))) return;
      const widgetId = `scene:widget:${cell.id}:${widgetKind}`;
      add(makeNode('widget', 0, undefined, {
        id: widgetId, source: creator.source, sourceOrder: creator.sourceOrder,
        widgetKind, primaryContent: knownText(cell.descriptorFacts.text),
      }, [], `scene:${cell.id}`, owned.map(operation => operation.id)));
      const parent = byId.get(widgetId);
      const slots: readonly X4UiSceneTextNode['slot'][] = widgetKind === 'text' || widgetKind === 'editbox'
        ? ['primary'] : ['primary', 'secondary'];
      for (const slot of slots) {
        const fact = slot === 'primary' ? cell.descriptorFacts.text ?? cell.descriptorFacts.primaryContent : cell.descriptorFacts.text2;
        if (fact === undefined) continue;
        const textId = `scene:text:${cell.id}:${slot}`;
        add(makeNode('text', 0, undefined, {
          id: textId, source: fact.source, sourceOrder: fact.source.start.offset,
          content: knownText(fact), slot, textSlot: slot,
        }, [], widgetId, operationIdsForText(program, { source: fact.source, slot }, parent)));
      }
    });
  }

  const knownIds = new Set(nodes.map(node => node.id));
  const nodesById = new Map(nodes.map(node => [node.id, node] as const));
  const framePaintOrderById = new Map(
    nodes.filter(node => node.kind === 'frame' && node.zOrder !== undefined).map(node => [node.id, node.zOrder!] as const),
  );
  const inheritedPaintOrderFor = (node: X4UiBuilderNode): number | undefined => {
    if (node.paintOrder !== undefined) return node.paintOrder;
    if (node.zOrder !== undefined) return node.zOrder;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId !== undefined && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = nodesById.get(parentId);
      if (parent === undefined) break;
      const framePaintOrder = framePaintOrderById.get(parent.id);
      if (framePaintOrder !== undefined) return framePaintOrder;
      parentId = parent.parentId;
    }
    return undefined;
  };
  const normalizedNodes = nodes.map(node => {
    const relationshipChildren = nodes
      .filter(child => child.parentId === node.id)
      .map(child => child.id);
    const paintOrder = inheritedPaintOrderFor(node);
    return {
      ...node,
      childIds: [...new Set([...node.childIds, ...relationshipChildren])].filter(childId => knownIds.has(childId)),
      ...(node.parentId !== undefined && !knownIds.has(node.parentId) ? { parentId: undefined } : {}),
      ...(paintOrder === undefined ? {} : { paintOrder }),
    };
  });
  const normalizedById = new Map(normalizedNodes.map(node => [node.id, node] as const));
  const orderedIds: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const node = normalizedById.get(id);
    if (node === undefined) return;
    visited.add(id);
    orderedIds.push(id);
    node.childIds.forEach(visit);
  };
  roots.forEach(visit);
  // Keep known but rootless structures visible after the exact rooted preorder.
  normalizedNodes.forEach(node => visit(node.id));
  const orderedNodes: X4UiBuilderNode[] = [];
  orderedIds.forEach(id => {
    const node = normalizedById.get(id);
    if (node !== undefined) orderedNodes.push(node);
  });
  const sceneUnavailableDetail = sceneResult === undefined || sceneResult.status === 'refused'
    ? 'Scene geometry is unavailable, but the exact program hierarchy is retained with locked geometry explanations.'
    : sceneMatchesProgram ? undefined : 'Scene identity does not match the exact program; structural nodes remain, while stale geometry and widget children are withheld.';
  return {
    status: projection.preview.status === 'partial' || program.status === 'partial' || sceneResult?.status === 'partial' || sceneUnavailableDetail !== undefined ? 'partial' : 'available',
    detail: sceneUnavailableDetail ?? 'Hierarchy is derived from the exact issued program and matching Scene identities. Unsupported or unresolved nodes remain selectable as locked explanations.',
    sourceIdentityKey,
    targetId: program.target.id,
    profileKey,
    roots: roots.filter(root => knownIds.has(root)),
    nodes: orderedNodes,
  };
};

/** Filter controls by the exact operation identities owned by one hierarchy node. */
export const sourceEntriesForX4UiBuilderNode = (
  catalog: X4UiSourceEditCatalog | undefined,
  node: X4UiBuilderNode | undefined,
): readonly X4UiSourceEditCatalogEntry[] => {
  if (catalog === undefined || node === undefined || node.propertyOperationIds.length === 0) return [];
  const operationIds = new Set(node.propertyOperationIds);
  return catalog.entries.filter(entry => {
    const operationId = entry.kind === 'editable' ? entry.provenance.operationId : entry.operationId;
    return typeof operationId === 'string' && operationIds.has(operationId);
  });
};

export type X4UiBuilderPropertyRole =
  | 'text'
  | 'secondary-text'
  | 'dimension'
  | 'position'
  | 'columns'
  | 'column'
  | 'column-width'
  | 'column-span'
  | 'font'
  | 'font-size'
  | 'input-default'
  | 'input-description'
  | 'input-max-chars'
  | 'scale'
  | 'scale-enabled'
  | 'wrapping'
  | 'alignment'
  | 'boolean'
  | 'unsupported'
  | 'technical';

export type X4UiBuilderPropertyAvailability = 'supported' | 'locked' | 'unsupported' | 'technical';

export interface X4UiBuilderPropertyView {
  /** The exact catalog object; presentation never clones or edits source authority. */
  readonly entry: X4UiSourceEditCatalogEntry;
  /** Human-facing semantic label for the exact source field or field group. */
  readonly label: string;
  readonly role: X4UiBuilderPropertyRole;
  readonly surface: 'primary' | 'technical';
  readonly availability: X4UiBuilderPropertyAvailability;
  /** One honest explanation for a locked source value, when applicable. */
  readonly recovery?: string;
  /** Exact producer field spellings retained for diagnostics and tests. */
  readonly fields: readonly string[];
}

export interface X4UiBuilderPropertyPresentation {
  readonly primary: readonly X4UiBuilderPropertyView[];
  readonly technical: readonly X4UiBuilderPropertyView[];
  readonly notices: readonly string[];
}

interface PropertyClassification {
  readonly label: string;
  readonly role: X4UiBuilderPropertyRole;
  readonly surface: 'primary' | 'technical';
  readonly availability: X4UiBuilderPropertyAvailability;
}

const humanizeUnknownProperty = (name: string): string => `Unsupported setting · ${name}`;

const knownPropertyClassification = (
  name: string,
  callName: string,
  availability: X4UiBuilderPropertyAvailability = 'supported',
): PropertyClassification => {
  const key = name.toLowerCase();
  const labels: Readonly<Record<string, { readonly label: string; readonly role: X4UiBuilderPropertyRole }>> = {
    text: { label: callName === 'setText2' ? 'Secondary text' : 'Text', role: callName === 'setText2' ? 'secondary-text' : 'text' },
    text2: { label: 'Secondary text', role: 'secondary-text' },
    width: { label: callName === 'setColWidth' || callName === 'setColWidthPercent' ? 'Column width' : 'Width', role: callName === 'setColWidth' || callName === 'setColWidthPercent' ? 'column-width' : 'dimension' },
    height: { label: callName === 'addRow' ? 'Row height' : callName === 'setDefaultCellProperties' ? 'Default cell height' : 'Height', role: 'dimension' },
    layer: { label: 'Layer', role: 'dimension' },
    standardbuttons: { label: 'Standard buttons', role: 'boolean' },
    blurbackground: { label: 'Blur background', role: 'boolean' },
    x: { label: 'Position X', role: 'position' },
    y: { label: 'Position Y', role: 'position' },
    count: { label: 'Columns', role: 'columns' },
    index: { label: 'Column', role: 'column' },
    percentage: { label: 'Column width', role: 'column-width' },
    span: { label: 'Column span', role: 'column-span' },
    fontsize: { label: 'Font size', role: 'font-size' },
    font: { label: 'Font', role: 'font' },
    fontname: { label: 'Font', role: 'font' },
    halign: { label: 'Alignment', role: 'alignment' },
    alignment: { label: 'Alignment', role: 'alignment' },
    wordwrap: { label: 'Wrapping', role: 'wrapping' },
    scaling: { label: callName === 'addRow' ? 'Scale row with UI' : callName === 'setColWidth' ? 'Scale column with UI' : 'Scale with UI', role: 'scale' },
    active: { label: 'Active', role: 'boolean' },
    interactive: { label: 'Interactive', role: 'boolean' },
    defaulttext: { label: 'Default text', role: 'input-default' },
    description: { label: 'Description', role: 'input-description' },
    maxchars: { label: 'Maximum characters', role: 'input-max-chars' },
    selecttextonactivation: { label: 'Select text on activation', role: 'boolean' },
    paddingtop: { label: 'Top padding', role: 'dimension' },
    paddingbottom: { label: 'Bottom padding', role: 'dimension' },
    borderbelow: { label: 'Bottom border', role: 'boolean' },
    fixed: { label: 'Fixed row', role: 'boolean' },
    affectrowheight: { label: 'Affects row height', role: 'boolean' },
    displayicon: { label: 'Display icon', role: 'boolean' },
    reservescrollbar: { label: 'Reserve scrollbar', role: 'boolean' },
    taborder: { label: 'Tab order', role: 'column' },
    backgroundid: { label: 'Background', role: 'unsupported' },
    backgroundcolor: { label: 'Background color', role: 'unsupported' },
    highlightmode: { label: 'Highlight mode', role: 'unsupported' },
    maxvisibleheight: { label: 'Maximum visible height', role: 'dimension' },
    autoframeheight: { label: 'Automatic frame height', role: 'boolean' },
    minrowheight: { label: 'Minimum row height', role: 'dimension' },
    color: { label: 'Color', role: 'unsupported' },
    bgcolor: { label: 'Background color', role: 'unsupported' },
    highlightcolor: { label: 'Highlight color', role: 'unsupported' },
    bordercolor: { label: 'Border color', role: 'unsupported' },
    cellbgcolor: { label: 'Cell background color', role: 'unsupported' },
    icon: { label: 'Icon', role: 'unsupported' },
    hotkey: { label: 'Hotkey', role: 'unsupported' },
    rotationrate: { label: 'Rotation rate', role: 'unsupported' },
    rotationstart: { label: 'Rotation start', role: 'unsupported' },
    rotationduration: { label: 'Rotation duration', role: 'unsupported' },
    rotationinterval: { label: 'Rotation interval', role: 'unsupported' },
    initialscalefactor: { label: 'Initial scale factor', role: 'scale' },
    scaleduration: { label: 'Scale duration', role: 'scale' },
    glowfactor: { label: 'Glow factor', role: 'unsupported' },
  };
  const candidate = Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : undefined;
  if (candidate !== undefined) return { ...candidate, surface: 'primary', availability };
  return { label: `Source property · ${name}`, role: 'unsupported', surface: 'primary', availability };
};

const rootSemanticClassification = (
  field: string,
  callName: string,
): PropertyClassification | undefined => {
  const match = /^semantics\.([A-Za-z][A-Za-z0-9_]*)$/.exec(field);
  if (!match) return undefined;
  const name = match[1];
  if (['frame', 'table', 'row', 'cell', 'dataFlow', 'menu', 'menuName', 'options', 'rowData', 'cellType', 'propertyName'].includes(name)) {
    const label = name === 'options' ? 'Options binding'
      : name === 'dataFlow' ? 'Data-flow binding'
        : name === 'rowData' ? 'Row-data binding'
          : name === 'propertyName' || name === 'cellType' ? 'Cell-property binding'
            : name === 'menu' || name === 'menuName' ? 'Menu binding'
              : `${name[0].toUpperCase()}${name.slice(1)} binding`;
    return { label, role: 'technical', surface: 'technical', availability: 'technical' };
  }
  if (name === 'text') return knownPropertyClassification('text', callName);
  return knownPropertyClassification(name, callName);
};

const nestedSemanticClassification = (
  field: string,
  callName: string,
): PropertyClassification | undefined => {
  const editBox = /^semantics\.editBox\.([A-Za-z][A-Za-z0-9_]*)$/.exec(field);
  if (editBox) return knownPropertyClassification(editBox[1], callName);
  const scale = /^semantics\.scale\.([A-Za-z][A-Za-z0-9_]*)$/.exec(field);
  if (scale) {
    switch (scale[1].toLowerCase()) {
      case 'input': return { label: callName === 'scaleY' ? 'Vertical value' : callName === 'scaleX' ? 'Horizontal value' : 'Scale value', role: 'scale', surface: 'primary', availability: 'supported' };
      case 'fontname': return { label: 'Font', role: 'font', surface: 'primary', availability: 'supported' };
      case 'fontsize': return { label: 'Font size', role: 'font-size', surface: 'primary', availability: 'supported' };
      case 'enabled': return { label: 'UI-scale enabled', role: 'scale-enabled', surface: 'primary', availability: 'supported' };
      default: return { label: humanizeUnknownProperty(scale[1]), role: 'unsupported', surface: 'primary', availability: 'unsupported' };
    }
  }
  return undefined;
};

const propertyPathClassification = (
  field: string,
  callName: string,
): PropertyClassification | undefined => {
  const property = /^semantics\.(properties|unsupportedProperties)\.(.+)$/.exec(field);
  if (property) {
    return knownPropertyClassification(property[2], callName, property[1] === 'unsupportedProperties' ? 'unsupported' : 'supported');
  }
  return nestedSemanticClassification(field, callName) ?? rootSemanticClassification(field, callName);
};

const argumentClassification = (
  field: string,
  callName: string,
): PropertyClassification | undefined => {
  const argument = /^arguments\[(\d+)\]$/.exec(field);
  if (!argument) return undefined;
  const index = Number(argument[1]);
  switch (callName) {
    case 'createText':
    case 'setText':
      return index === 0 ? { label: 'Text', role: 'text', surface: 'primary', availability: 'supported' } : undefined;
    case 'setText2':
      return index === 0 ? { label: 'Secondary text', role: 'secondary-text', surface: 'primary', availability: 'supported' } : undefined;
    case 'createIcon':
      return index === 0 ? { label: 'Icon', role: 'unsupported', surface: 'primary', availability: 'supported' } : undefined;
    case 'addTable':
      return index === 0 ? { label: 'Columns', role: 'columns', surface: 'primary', availability: 'supported' } : undefined;
    case 'setColWidth':
      if (index === 0) return { label: 'Column', role: 'column', surface: 'primary', availability: 'supported' };
      if (index === 1) return { label: 'Column width', role: 'column-width', surface: 'primary', availability: 'supported' };
      if (index === 2) return { label: 'UI-scale enabled', role: 'scale-enabled', surface: 'primary', availability: 'supported' };
      return undefined;
    case 'setColWidthPercent':
      if (index === 0) return { label: 'Column', role: 'column', surface: 'primary', availability: 'supported' };
      if (index === 1) return { label: 'Column width', role: 'column-width', surface: 'primary', availability: 'supported' };
      return undefined;
    case 'setColSpan':
      return index === 0 ? { label: 'Column span', role: 'column-span', surface: 'primary', availability: 'supported' } : undefined;
    case 'setHotkey':
      return index === 0 ? { label: 'Hotkey', role: 'unsupported', surface: 'primary', availability: 'supported' } : undefined;
    case 'scaleX':
      if (index === 0) return { label: 'Horizontal value', role: 'scale', surface: 'primary', availability: 'supported' };
      if (index === 1) return { label: 'UI-scale enabled', role: 'scale-enabled', surface: 'primary', availability: 'supported' };
      return undefined;
    case 'scaleY':
      if (index === 0) return { label: 'Vertical value', role: 'scale', surface: 'primary', availability: 'supported' };
      if (index === 1) return { label: 'UI-scale enabled', role: 'scale-enabled', surface: 'primary', availability: 'supported' };
      return undefined;
    case 'scaleFont':
      if (index === 0) return { label: 'Font', role: 'font', surface: 'primary', availability: 'supported' };
      if (index === 1) return { label: 'Font size', role: 'font-size', surface: 'primary', availability: 'supported' };
      if (index === 2) return { label: 'UI-scale enabled', role: 'scale-enabled', surface: 'primary', availability: 'supported' };
      return undefined;
    default:
      return undefined;
  }
};

const technicalClassification = (field: string): PropertyClassification | undefined => {
  if (field.startsWith('arguments[') || field === 'receiver') {
    return { label: 'Technical source binding', role: 'technical', surface: 'technical', availability: 'technical' };
  }
  if (field.startsWith('semantics.')) {
    return { label: 'Technical source binding', role: 'technical', surface: 'technical', availability: 'technical' };
  }
  return undefined;
};

const classificationForField = (
  field: string,
  callName: string,
): PropertyClassification => propertyPathClassification(field, callName)
  ?? argumentClassification(field, callName)
  ?? technicalClassification(field)
  ?? { label: `Source property · ${field}`, role: 'unsupported', surface: 'primary', availability: 'supported' };

const propertyFieldsForEntry = (entry: X4UiSourceEditCatalogEntry): readonly string[] => {
  const rawFields = entry.kind === 'editable' ? entry.provenance.fields : entry.field.split(',');
  return rawFields.map(field => field.trim()).filter(field => field.length > 0);
};

const classificationPriority = (field: string): number => {
  if (field.startsWith('semantics.properties.') || field.startsWith('semantics.unsupportedProperties.')
    || field.startsWith('semantics.editBox.') || field.startsWith('semantics.scale.')) return 0;
  if (field.startsWith('semantics.')) return 1;
  if (field.startsWith('arguments[')) return 2;
  return 3;
};

const recoveryForLockedProperty = (
  entry: X4UiSourceEditCatalogEntry,
  label: string,
): string | undefined => {
  if (entry.kind !== 'locked') return undefined;
  switch (String(entry.reason)) {
    case 'dynamic-value':
    case 'dynamic':
      return `${label} is controlled by menu logic or a runtime value; it cannot be changed with this control.`;
    case 'aliased-value':
      return `${label} is shared from another source location; it cannot be changed with this control.`;
    case 'constant-folded-value':
      return `${label} is calculated by the menu; it cannot be changed with this control.`;
    case 'operation-not-applied':
      return `${label} belongs to a source operation the preview did not apply; inspect the exact details.`;
    case 'unsupported-value':
    case 'unsupported-provenance':
    case 'unsupported-string-style':
      return `${label} cannot be determined safely by the preview; the original record remains available in Inspect.`;
    case 'workspace-source-mismatch':
    case 'foreign-source-identity':
    case 'foreign-target-identity':
    case 'source-literal-mismatch':
    case 'provenance-drift':
    case 'stale-range':
    case 'source-record-drift':
      return `${label} is stale because the source document or selection changed; refresh the source before trying again.`;
    case 'source-unavailable':
    case 'source-locked':
    case 'generated-shadowed-source':
    case 'missing-source':
    case 'unregistered-source':
    case 'ambiguous-registration':
      return `${label} is unavailable because the source is not currently editable; inspect the exact refusal.`;
    case 'missing-location':
    case 'invalid-location':
      return `${label} has no safe source range for this preview; inspect the retained details.`;
    default:
      return `${label} cannot be changed with this control; inspect the exact reason.`;
  }
};

const propertyViewForEntry = (entry: X4UiSourceEditCatalogEntry): X4UiBuilderPropertyView => {
  const fields = propertyFieldsForEntry(entry);
  const callName = entry.kind === 'editable' ? entry.provenance.callName : entry.callName ?? '';
  const candidates = fields
    .map(field => ({ field, classification: classificationForField(field, callName) }))
    .sort((left, right) => classificationPriority(left.field) - classificationPriority(right.field));
  const chosen = candidates.find(candidate => candidate.classification.surface === 'primary')
    ?? candidates.find(candidate => candidate.classification.surface === 'technical')
    ?? { field: 'source', classification: { label: 'Technical source binding', role: 'technical' as const, surface: 'technical' as const, availability: 'technical' as const } };
  const recovery = recoveryForLockedProperty(entry, chosen.classification.label);
  const availability = entry.kind === 'locked'
    && ['unsupported-value', 'unsupported-provenance', 'unsupported-string-style'].includes(String(entry.reason))
    && chosen.classification.surface === 'primary'
    ? 'unsupported' as const
    : entry.kind === 'locked'
      && chosen.classification.availability === 'supported'
      ? 'locked' as const
    : chosen.classification.availability;
  return {
    entry,
    label: chosen.classification.label,
    role: chosen.classification.role,
    surface: chosen.classification.surface,
    availability,
    fields,
    ...(recovery === undefined ? {} : { recovery }),
  };
};

/** Map exact source-issued entries to friendly primary controls and retained technical records. */
export const describeX4UiBuilderProperty = (entry: X4UiSourceEditCatalogEntry): X4UiBuilderPropertyView =>
  propertyViewForEntry(entry);

/** Build a disposable selected-property view without changing catalog identity, order, or authority. */
export const buildX4UiBuilderPropertyPresentation = (
  entries: readonly X4UiSourceEditCatalogEntry[],
): X4UiBuilderPropertyPresentation => {
  const views = entries.map(propertyViewForEntry);
  const primary = views.filter(view => view.surface === 'primary');
  const technical = views.filter(view => view.surface === 'technical');
  const unsupportedCount = primary.filter(view => view.availability === 'unsupported').length;
  const notices: string[] = [];
  if (technical.length > 0) notices.push('Technical source bindings remain available under Inspect.');
  if (unsupportedCount > 0) notices.push(`${unsupportedCount} source setting${unsupportedCount === 1 ? '' : 's'} is not modeled by the preview; the original record remains under Inspect.`);
  if (primary.length === 0 && technical.length > 0) notices.unshift('No user-facing property control is available for this selection; technical source bindings remain under Inspect.');
  return { primary, technical, notices };
};

export interface X4UiBuilderPreviewInputView {
  readonly entry: X4UiLayoutPreviewSampleCatalogEntry;
  readonly label: string;
  readonly affectedElements: readonly string[];
}

/** Labels are disposable; the original catalog entry remains the only input identity. */
export const buildX4UiBuilderPreviewInputPresentation = (
  catalog: X4UiLayoutPreviewSampleCatalog | null,
  presentation?: X4UiBuilderPresentation,
  contextNode?: X4UiBuilderNode,
): readonly X4UiBuilderPreviewInputView[] => {
  let entries = catalog?.entries ?? [];
  if (contextNode !== undefined) {
    if (catalog === null || presentation === undefined
      || presentation.sourceIdentityKey === null
      || identityKey(catalog.sourceIdentity) !== presentation.sourceIdentityKey
      || catalog.targetId !== presentation.targetId) return [];
    const byId = new Map(presentation.nodes.map(node => [node.id, node] as const));
    if (byId.size !== presentation.nodes.length || byId.get(contextNode.id) !== contextNode) return [];
    const related = new Set<X4UiBuilderNode>();
    const pending = [contextNode];
    while (pending.length > 0) {
      const node = pending.pop()!;
      if (related.has(node)) continue;
      related.add(node);
      for (const childId of node.childIds) {
        const child = byId.get(childId);
        if (child?.parentId === node.id) pending.push(child);
      }
    }
    let parentId = contextNode.parentId;
    while (parentId !== undefined) {
      const parent = byId.get(parentId);
      if (parent === undefined || related.has(parent)) break;
      related.add(parent);
      parentId = parent.parentId;
    }
    const operations = new Set([...related].flatMap(node => node.propertyOperationIds));
    entries = entries.filter(entry => entry.consumers.some(consumer => operations.has(consumer.operationId)));
  }
  const views = entries.map(entry => {
    const labels = new Set<string>();
    const affectedElements = new Set<string>();
    for (const consumer of entry.consumers) {
      const classification = consumer.field.startsWith('semantics.') || consumer.field.startsWith('arguments[')
        ? classificationForField(consumer.field, consumer.operationKind)
        : knownPropertyClassification(consumer.field, consumer.operationKind);
      if (classification.surface === 'primary' && !classification.label.startsWith('Source property ·')) {
        labels.add(classification.label);
      }
      const owners = presentation?.nodes.filter(node => node.propertyOperationIds.includes(consumer.operationId)) ?? [];
      const textOwners = owners.filter(node => node.kind === 'text');
      const preferred = consumer.field === 'text' && textOwners.length > 0 ? textOwners : owners;
      if (preferred.length > 0) {
        for (const node of preferred) affectedElements.add(node.label);
      } else {
        // Missing Scene geometry is not a reason to invent an element identity.
        const kind = consumer.operationKind;
        affectedElements.add(kind === 'createFrameHandle' ? 'Frame'
          : kind === 'addTable' || kind === 'setColWidth' || kind === 'setColWidthPercent' ? 'Table'
            : kind === 'addRow' ? 'Row'
              : kind === 'createText' ? 'Text'
                : kind === 'createButton' || kind === 'setText' || kind === 'setText2' ? 'Button'
                  : kind === 'createEditBox' ? 'Input'
                    : kind === 'createIcon' ? 'Icon' : 'Menu preview');
      }
    }
    return {
      entry,
      label: [...labels].join(' / ') || (entry.expectedType === 'number' ? 'Number value' : entry.expectedType === 'boolean' ? 'On/off value' : 'Text value'),
      affectedElements: [...affectedElements],
    };
  });
  const totals = new Map<string, number>();
  const indices = new Map<string, number>();
  for (const view of views) totals.set(view.label, (totals.get(view.label) ?? 0) + 1);
  return views.map(view => {
    const index = (indices.get(view.label) ?? 0) + 1;
    indices.set(view.label, index);
    return (totals.get(view.label) ?? 0) > 1 ? { ...view, label: `${view.label} ${index}` } : view;
  });
};

/** Clear a local selection unless every exact authority identity still agrees. */
export const reconcileX4UiBuilderSelection = (
  selection: X4UiBuilderSelection | null | undefined,
  context: X4UiBuilderSelectionContext,
  nodes: readonly X4UiBuilderNode[],
): X4UiBuilderSelection | undefined => {
  if (selection === null || selection === undefined) return undefined;
  if (selection.workspace !== context.workspace
    || selection.sourceIdentityKey === null
    || context.sourceIdentityKey === null
    || selection.sourceIdentityKey !== context.sourceIdentityKey
    || selection.targetId !== context.targetId
    || selection.profileKey === null
    || context.profileKey === null
    || selection.profileKey !== context.profileKey
    || !nodes.some(node => node.id === selection.nodeId)) return undefined;
  return selection;
};

const kindPriority: Record<X4UiBuilderNodeKind, number> = {
  frame: 0,
  table: 1,
  row: 2,
  cell: 3,
  widget: 4,
  text: 5,
};

/** Hit-test native canvas coordinates against issued Scene rectangles only. */
export const hitTestX4UiBuilderCanvas = (
  nodes: readonly X4UiBuilderNode[],
  point: { readonly x: number; readonly y: number },
): X4UiBuilderNode | undefined => {
  if (!finiteNonNegative(point.x) || !finiteNonNegative(point.y)) return undefined;
  return nodes
    .filter(node => node.selectable && node.rect !== undefined
      && point.x >= node.rect.x
      && point.x <= node.rect.x + node.rect.width
      && point.y >= node.rect.y
      && point.y <= node.rect.y + node.rect.height
      && (node.clipRect === undefined
        || (point.x >= node.clipRect.x
          && point.x <= node.clipRect.x + node.clipRect.width
          && point.y >= node.clipRect.y
          && point.y <= node.clipRect.y + node.clipRect.height)))
    .sort((left, right) => {
      const leftPaint = left.paintOrder ?? Number.NEGATIVE_INFINITY;
      const rightPaint = right.paintOrder ?? Number.NEGATIVE_INFINITY;
      if (leftPaint !== rightPaint) return rightPaint - leftPaint;
      const leftArea = (left.rect?.width ?? 0) * (left.rect?.height ?? 0);
      const rightArea = (right.rect?.width ?? 0) * (right.rect?.height ?? 0);
      return kindPriority[right.kind] - kindPriority[left.kind] || leftArea - rightArea || left.sourceOrder - right.sourceOrder;
    })[0];
};
