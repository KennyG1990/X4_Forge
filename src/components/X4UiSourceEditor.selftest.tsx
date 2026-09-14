/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { compile as compileTailwind } from '@tailwindcss/node';
import { sanitizeWorkspace } from '../types';
import { retainWorkspaceCandidateIfNormalizedUnchanged } from '../lib/workspaceIdentity';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { buildX4UiCallModel, type X4UiLuaFileInput } from '../lib/x4UiCallModel';
import { importX4UiWorkspaceLua, X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES } from '../lib/x4UiWorkspaceSource';
import {
  X4_UI_CORPUS_9_00_COLOR_CONTRACT,
  X4_UI_CORPUS_9_00_CONTRACT,
  X4_UI_CORPUS_COLOR_CANONICAL_EVIDENCE,
  X4_UI_CORPUS_COLORS_XML_PATH,
  X4_UI_CORPUS_COLORS_XML_SHA256,
  X4_UI_CORPUS_COLORS_XML_SIZE,
  X4_UI_CORPUS_COLORS_XSD_PATH,
  X4_UI_CORPUS_COLORS_XSD_SHA256,
  X4_UI_CORPUS_COLORS_XSD_SIZE,
  X4_UI_CORPUS_FILE_URL,
  X4_UI_CORPUS_MANIFEST_URL,
  X4_UI_CORPUS_STATUS_URL,
  X4_UI_CORPUS_VERIFICATION,
  isX4UiCorpusCanonicalColorSuccess,
  isX4UiCorpusCanonicalSuccess,
  loadConfiguredX4UiCorpusAssets,
  loadConfiguredX4UiCorpusColorEvidence,
  type X4UiCorpusCanonicalColorSuccess,
  type X4UiCorpusCanonicalSuccess,
  type X4UiCorpusFetchResponse,
  type X4UiCorpusTransport,
} from '../lib/x4UiCorpusAssets';
import {
  X4_UI_EDITOR_DEFAULT_PROFILE,
  createX4UiEditorSessionOwner,
  projectX4UiEditorSession,
  resetX4UiEditorLoopState,
  updateX4UiEditorLoopState,
  updateX4UiEditorSampleState,
  type X4UiEditorSessionProjection,
} from '../lib/x4UiEditorSession';
import { capturePreviewScenario, transferPreviewScenario } from '../lib/x4UiPreviewScenarios';
import { KEEP_OUT_IDS, KEEP_OUT_PRESET_IDS, KEEP_OUT_PRESETS } from '../lib/x4UiKeepOuts';
import { lintX4UiCallModel } from '../lib/x4UiLint';
import { diagnoseX4UiSceneStructureForTest } from '../lib/x4UiScene';
import { buildX4UiBuilderPresentation, resolveX4UiBuilderRowForNode } from '../lib/x4UiBuilderPresentation';
import type {
  X4UiLayoutPreviewLoopCatalog,
  X4UiLayoutPreviewPathCatalog,
  X4UiLayoutPreviewPathSelectionInput,
  X4UiLayoutPreviewSampleCatalog,
} from '../lib/x4UiLayoutProgram';
import { applyX4UiSourceEdit, type X4UiSourceEditCatalog } from '../lib/x4UiSourceEdits';
import {
  prepareX4UiSourceHistoryEntry,
  transitionWorkspaceHistory,
  createSourceWorkspaceHistoryEntry,
  reverseWorkspaceSourceSplice,
  type WorkspaceHistoryEntry,
} from '../lib/workspaceUndoHistory';
import {
  ZEKTON_DDS_HEADER_SIZE,
  ZEKTON_DESCRIPTOR_HEADER_SIZE,
  ZEKTON_DESCRIPTOR_TRAILING_SIZE,
  ZEKTON_RECORD_SIZE,
} from '../lib/x4UiFontMetrics';
import UIBuilder, { type UIBuilderSourceHistoryAcknowledgement } from './UIBuilder';
import * as UIBuilderApiModule from './UIBuilder';
import X4UiSourceEditor, {
  X4UiSourceEditorLuaFiles,
  X4UiSourceEditorRowControls,
  X4UiSourceEditorContextualPalette,
  X4UiSourceEditorLinter,
  X4UiSourceEditorPreviewLoops,
  X4UiSourceEditorPreviewGeometry,
  X4UiSourceEditorPreviewPaths,
  X4UiSourceEditorSamples,
  addX4UiManualCalibrationPoint,
  addX4UiManualCalibrationDraft,
  buildX4UiManualCalibrationSessionInput,
  classifyX4UiCanvasCommit,
  createX4UiWorkspaceEditPending,
  classifyX4UiCanvasState,
  classifyX4UiCorpusLoadResult,
  classifyX4UiLintState,
  createX4UiManualCalibrationDraft,
  createX4UiManualCalibrationState,
  deriveX4UiEffectiveScale,
  deriveX4UiUserScale,
  discoverX4UiSourceEditorCatalog,
  inspectX4UiLint,
  inspectX4UiPreviewGeometry,
  isBlockingX4UiAddTableFinding,
  isX4UiKeepOutEntryChecked,
  parseX4UiManualCalibrationDraft,
  reconcileX4UiEditorSelections,
  resolveX4UiSourceEditorContextualRowMoveEntries,
  removeX4UiManualCalibrationPoint,
  removeX4UiManualCalibrationRow,
  setX4UiManualCalibrationRowEnabled,
  toggleX4UiKeepOutEntry,
  toggleX4UiManualCalibrationRow,
  useX4UiSourceEditSelectionTransfer,
  useX4UiInspectorScrollRetention,
  type X4UiEditorLintFinding,
  type X4UiHistoryRestorationNotice,
  type X4UiManualCalibrationDraft,
  type X4UiSourceEditSelectionResult,
  type X4UiWorkspaceEditPendingAuthority,
  type X4UiWorkspaceEditHandler,
  updateX4UiManualCalibrationDraft,
  updateX4UiManualCalibrationPoint,
} from './X4UiSourceEditor';
import * as X4UiSourceEditorApiModule from './X4UiSourceEditor';

const workspace = {
  id: 'x4-ui-source-editor-selftest',
  name: 'X4 UI Source Editor selftest',
  version: '1.0.0',
  author: 'selftest',
  description: 'SSR fixture',
  nodes: [],
  uiWidgets: [],
  uiTheme: {
    backgroundColor: '#0d0d14',
    borderColor: '#df9825',
    accentColor: '#f59e0b',
    textColor: '#ffffff',
  },
  customLua: '',
  passthroughFiles: [],
  compileSettings: { ui: false },
  integrationContract: null,
} as unknown as React.ComponentProps<typeof UIBuilder>['workspace'];

const lintFixtureWorkspace = {
  ...workspace,
  passthroughFiles: [
    {
      path: 'ui.xml',
      content: '<root><environment type="menus"><file name="ui/test.lua" /></environment></root>',
    },
    {
      path: 'ui/test.lua',
      content: 'function (',
    },
  ],
};

const renderSource = (fixture = workspace) => renderToStaticMarkup(
  <X4UiSourceEditor workspace={fixture} corpusLoader={async () => ({ ok: false, failure: { code: 'offline', message: 'selftest unavailable' } })} />,
);

const sourceMarkup = renderSource();
const sourceMarkupAgain = renderSource();
assert.equal(sourceMarkup, sourceMarkupAgain, 'identical initial props must produce deterministic SSR markup');
assert.match(sourceMarkup, /Not verified in game/);
assert.match(sourceMarkup, /Source authority/);
assert.match(sourceMarkup, /Configured X4 corpus/);
assert.match(sourceMarkup, /Profile controls/);
assert.match(sourceMarkup, /Source and target selection/);
assert.match(sourceMarkup, /Preview settings/);
assert.match(sourceMarkup, /data-testid="x4-ui-preview-settings-toggle"/);
assert.match(sourceMarkup, /<section data-testid="x4-ui-source-editor"[^>]*font-sans/);
const previewSettingsOpenTag = sourceMarkup.match(/<details data-testid="x4-ui-preview-settings"[^>]*>/)?.[0];
assert.ok(previewSettingsOpenTag !== undefined, 'Preview settings disclosure is missing');
assert.doesNotMatch(previewSettingsOpenTag, /\bopen(?:=|>)/, 'Preview settings must start closed');
assert.match(sourceMarkup, />File</);
assert.match(sourceMarkup, />Menu</);
assert.match(sourceMarkup, /Imported-source linter/);
assert.match(sourceMarkup, /Preview geometry diagnostics/);
assert.match(sourceMarkup, /Layout evidence only · Not verified in game/);
assert.match(sourceMarkup, /Preview branch paths/);
assert.match(sourceMarkup, /owner-issued preview path catalog/);
assert.match(sourceMarkup, /Preview Loop Iterations/);
assert.match(sourceMarkup, /owner-issued preview loop catalog/);
assert.match(sourceMarkup, /Preview only/);
assert.match(sourceMarkup, /data-testid="x4-ui-builder-workspace"/);
assert.match(sourceMarkup, /data-testid="x4-ui-builder-hierarchy"/);
assert.match(sourceMarkup, /data-testid="x4-ui-builder-canvas-column"/);
assert.match(sourceMarkup, /data-testid="x4-ui-builder-inspector"/);
assert.match(sourceMarkup, /data-testid="x4-ui-canvas-overlay"/);
assert.match(sourceMarkup, /data-testid="x4-ui-inspect-panel"/);
assert.match(sourceMarkup, /data-testid="x4-ui-canvas-export-inspect"/);
assert.match(sourceMarkup, /data-testid="x4-ui-new-menu-open"/);
assert.match(sourceMarkup, /data-testid="x4-ui-lua-files"/);
assert.match(sourceMarkup, /data-testid="x4-ui-lua-open"/);
assert.match(sourceMarkup, /data-testid="x4-ui-lua-export"/);
assert.doesNotMatch(sourceMarkup, /data-testid="x4-ui-new-menu-name"/);
assert.match(sourceMarkup, /Preview scale mode/);
const emptySelectionCopy = sourceMarkup.match(/data-testid="x4-ui-builder-selection-empty"[^>]*>([^<]+)</)?.[1];
assert.ok(emptySelectionCopy?.includes('Select an element on the canvas or in the hierarchy.'));
assert.doesNotMatch(emptySelectionCopy, /Session|operation identity|authority/);
const emptyRowMoveContext = resolveX4UiSourceEditorContextualRowMoveEntries(undefined, [], undefined, null);
assert.match(emptyRowMoveContext.detail, /Row controls are unavailable/);
const emptySelectionRowMoveContext = resolveX4UiSourceEditorContextualRowMoveEntries(
  { sourceIdentity: { file: 'ui/row-controls.lua', sha256: 'a'.repeat(64) } } as unknown as X4UiSourceEditCatalog,
  [],
  undefined,
  'ui/row-controls.lua||' + 'a'.repeat(64),
);
const emptyRowControlsMarkup = renderToStaticMarkup(
  <X4UiSourceEditorRowControls
    context={emptySelectionRowMoveContext}
    builderStatus="available"
    projectionLoading={false}
    propertyDraftPending={false}
    onMove={() => undefined}
  />,
);
assert.match(emptyRowControlsMarkup, /data-testid="x4-ui-row-controls"/);
assert.match(emptyRowControlsMarkup, /Row controls/);
assert.match(emptyRowControlsMarkup, /Select a row or an element inside a row that supports reordering\./);
assert.match(emptyRowControlsMarkup, /data-testid="x4-ui-row-controls-move-up"[^>]*disabled/);
assert.match(emptyRowControlsMarkup, /data-testid="x4-ui-row-controls-move-down"[^>]*disabled/);
assert.match(emptyRowControlsMarkup, /min-h-\[28px\]/, 'row action buttons must retain the compact minimum height');
assert.match(emptyRowControlsMarkup, /text-\[11px\]/, 'row action buttons must remain readable at the supported narrow viewport');
const rowControlsSection = emptyRowControlsMarkup.match(/<section data-testid="x4-ui-row-controls"[\s\S]*?<\/section>/)?.[0] ?? '';
assert.doesNotMatch(rowControlsSection, /bytes|scene:|operation/i, 'ordinary row controls must keep technical IDs and offsets behind Inspect');
assert.doesNotMatch(rowControlsSection, /source authority|movement authority/i, 'ordinary row controls must not expose compiler terminology');

const fallbackPaletteMarkup = renderToStaticMarkup(
  <X4UiSourceEditorContextualPalette
    selectedNode={{ id: 'scene:fallback-row', kind: 'row' } as React.ComponentProps<typeof X4UiSourceEditorContextualPalette>['selectedNode']}
    rowEntry={{ id: 'row-below-fallback' } as NonNullable<React.ComponentProps<typeof X4UiSourceEditorContextualPalette>['rowEntry']>}
    rowHasEligibleCell={false}
    catalogAvailable
    sourceIdentityMatches
    builderStatus="available"
    projectionLoading={false}
    propertyDraftPending={false}
    onInsert={() => undefined}
    onInsertRow={() => undefined}
  />,
);
assert.match(fallbackPaletteMarkup, /No eligible cell is available for adding content right now\. Add another row below this row\./, 'row fallback must explain why widget insertion is unavailable and provide a valid next step');
assert.match(fallbackPaletteMarkup, /data-testid="x4-ui-contextual-palette-add-row"/);
assert.doesNotMatch(fallbackPaletteMarkup, /data-testid="x4-ui-contextual-palette-add-(text|button|input)"/, 'row fallback must not imply that a widget can be inserted without an eligible cell');

const rowWithEligibleCellPaletteMarkup = renderToStaticMarkup(
  <X4UiSourceEditorContextualPalette
    selectedNode={{ id: 'scene:eligible-row', kind: 'row' } as React.ComponentProps<typeof X4UiSourceEditorContextualPalette>['selectedNode']}
    rowEntry={{ id: 'row-below-eligible' } as NonNullable<React.ComponentProps<typeof X4UiSourceEditorContextualPalette>['rowEntry']>}
    rowHasEligibleCell
    catalogAvailable
    sourceIdentityMatches
    builderStatus="available"
    projectionLoading={false}
    propertyDraftPending={false}
    onInsert={() => undefined}
    onInsertRow={() => undefined}
  />,
);
assert.match(rowWithEligibleCellPaletteMarkup, /Select an empty cell to add text, button, or input. Add a row below this row./, 'a row with an eligible child must direct the user to select that child');
assert.doesNotMatch(rowWithEligibleCellPaletteMarkup, /No eligible cell is available/, 'a row with an eligible child must not claim that no cell is available');

const canvasExportFailFirstApi = X4UiSourceEditorApiModule as unknown as Record<string, unknown>;
const canvasExportFailFirstMissing = [
  ['current-only canvas export classifier is absent', typeof canvasExportFailFirstApi.classifyX4UiCanvasExport === 'function'],
  ['current canvas export control is absent', /data-testid="x4-ui-canvas-export"/.test(sourceMarkup)],
  ['current canvas export metadata is absent', /data-testid="x4-ui-canvas-export-metadata"/.test(sourceMarkup)],
].filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(
  canvasExportFailFirstMissing,
  [],
  `NATIVE_PNG_CANVAS_EXPORT causal fail-first red assertions: ${canvasExportFailFirstMissing.join(', ')}`,
);

const sourceEditorApiFailFirst = X4UiSourceEditorApiModule as unknown as Record<string, unknown>;
const previewGeometryFailFirstMissing = [
  ['source-linked preview geometry inspector is absent', typeof sourceEditorApiFailFirst.inspectX4UiPreviewGeometry === 'function'],
  ['source-linked preview geometry panel is absent', typeof sourceEditorApiFailFirst.X4UiSourceEditorPreviewGeometry === 'function'],
].filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(
  previewGeometryFailFirstMissing,
  [],
  `SOURCE_LINKED_PREVIEW_GEOMETRY causal fail-first red assertions: ${previewGeometryFailFirstMissing.join(', ')}`,
);

assert.match(sourceMarkup, /Context keep-outs/);
assert.match(sourceMarkup, /data-testid="x4-ui-overlay-toolbar"/, 'everyday overlays belong beside canvas preview controls');
assert.match(sourceMarkup, /data-testid="x4-ui-inspect-panel"/);
assert.ok(sourceMarkup.indexOf('data-testid="x4-ui-overlay-toolbar"') < sourceMarkup.indexOf('data-testid="x4-ui-inspect-panel"'),
  'overlay controls must not require technical Inspect');
assert.equal((sourceMarkup.match(/data-testid="x4-ui-keepout-off"/g) ?? []).length, 1, 'one ordinary overlay control owner');
assert.match(sourceMarkup, /Advisory only.*Not verified in game/, 'ordinary guides retain their truth boundary');
assert.match(sourceMarkup, /x4-ui-manual-calibration-region/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-stable-id/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-context/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-source-note/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-screenshot-hash/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-profile/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-drawable-left/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-drawable-top/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-drawable-width/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-drawable-height/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-point-0-x/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-point-0-y/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-point-1-x/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-point-1-y/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-point-2-x/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-point-2-y/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-add-point/);
assert.match(sourceMarkup, /x4-ui-manual-calibration-add/);
assert.match(sourceMarkup, /Advisory only · Not verified in game/);
assert.match(sourceMarkup, /Cockpit conversation/);
assert.match(sourceMarkup, /Map open/);
assert.match(sourceMarkup, /Fullscreen menu/);
assert.match(sourceMarkup, /First person/);
assert.match(sourceMarkup, /screenshot-calibrated polygon/);
assert.match(sourceMarkup, /777D001A6CDF46F77AAEE76F9AC7F6E4FFF9E8CFF0F5E7C3082E93E88388DF20/);
assert.match(sourceMarkup, /2BA6C8C065EF3563A0C2C06E814BCD226BA160BC0EE64981D07E01C01AD2ADC8/);
assert.match(sourceMarkup, /Measured guides remain advisory: y=0\.788, y=0\.74, x=0\.664/);
assert.doesNotMatch(sourceMarkup, /Mission\/MESSAGES ticker and Top HUD strip remain unavailable\/unmeasured/);
assert.match(sourceMarkup, /2560/);
assert.match(sourceMarkup, /1440/);
assert.match(sourceMarkup, /1\.4/);
assert.match(sourceMarkup, /unverified-default/);
assert.match(sourceMarkup, /Select source/);
assert.match(sourceMarkup, /Select target/);
assert.match(sourceMarkup, /No source analyzed|Static checks incomplete/);
assert.doesNotMatch(sourceMarkup, /No known static rule violated/);
assert.doesNotMatch(sourceMarkup, /game accurate|render accurate|engine proof|game-proof/i);
assert.match(sourceMarkup, /data-testid="x4-ui-profile-scale-mode"/);
assert.match(sourceMarkup, /Derived from X4 user scale/);
assert.match(sourceMarkup, /Custom effective Helper scale/);
assert.match(sourceMarkup, /data-testid="x4-ui-profile-user-scale"/);
assert.match(sourceMarkup, /data-testid="x4-ui-profile-scale"[^>]*disabled/);
assert.match(sourceMarkup, /Derived effective Helper scale = X4 user scale .*1080/);
assert.match(sourceMarkup, /Effective Helper scale/);
assert.doesNotMatch(sourceMarkup, /UI scale/);
assert.match(sourceMarkup, /value="1\.05"/);
assert.equal((sourceMarkup.match(/value="[^"]+"/g) ?? []).some(value => value.includes('source 1') || value.includes('target 1')), false, 'selectors must not auto-select a candidate');

assert.equal(deriveX4UiEffectiveScale(1, 1353), 1353 / 1080, 'effective scale must use the exact 1080-height derivation');
const reverse1353 = deriveX4UiUserScale(deriveX4UiEffectiveScale(1, 1353), 1353);
assert.ok(reverse1353 !== null && Math.abs(reverse1353 - 1) <= 1e-12, 'reverse derivation must recover the user factor within tolerance');
const compatibilityUserScale = deriveX4UiUserScale(1.4, 1440);
assert.ok(compatibilityUserScale !== null && Math.abs(compatibilityUserScale - 1.05) <= 1e-12, '1440/1.4 compatibility must retain the 1.05 user factor');
const compatibilityEffectiveScale = deriveX4UiEffectiveScale(1.05, 1440);
assert.ok(compatibilityEffectiveScale !== null && Math.abs(compatibilityEffectiveScale - 1.4) <= 1e-12, '1440/1.05 must preserve the unverified 1.4 effective default');
const invalidEffectiveScaleInputs: readonly [unknown, unknown][] = [
  [0, 1440],
  [-1, 1440],
  [Infinity, 1440],
  [NaN, 1440],
  ['1', 1440],
  [1, 0],
  [1, -1],
  [1, Infinity],
  [1, NaN],
  [Number.MAX_VALUE, Number.MAX_VALUE],
  [Number.MIN_VALUE, Number.MIN_VALUE],
];
for (const [userScale, drawableHeight] of invalidEffectiveScaleInputs) {
  assert.equal(deriveX4UiEffectiveScale(userScale, drawableHeight), null, 'invalid or overflowing effective derivation must fail closed');
}
const invalidUserScaleInputs: readonly [unknown, unknown][] = [
  [0, 1440],
  [-1, 1440],
  [Infinity, 1440],
  [NaN, 1440],
  ['1', 1440],
  [1, 0],
  [1, -1],
  [1, Infinity],
  [1, NaN],
  [Number.MAX_VALUE, Number.MIN_VALUE],
];
for (const [effectiveScale, drawableHeight] of invalidUserScaleInputs) {
  assert.equal(deriveX4UiUserScale(effectiveScale, drawableHeight), null, 'invalid or overflowing user derivation must fail closed');
}

const sampleLocation = {
  file: 'ui/samples.lua',
  sourcePath: 'selftest/ui/samples.lua',
  start: { line: 4, column: 18, offset: 91 },
  end: { line: 4, column: 30, offset: 103 },
};
const sampleCatalog: X4UiLayoutPreviewSampleCatalog = {
  id: 'preview-sample-catalog-selftest',
  sourceIdentity: { file: 'ui/samples.lua', sourcePath: 'selftest/ui/samples.lua', sha256: 'a'.repeat(64) },
  targetId: 'target-selftest',
  entries: [
    {
      id: 'sample-number',
      expression: 'tableWidth',
      expectedType: 'number',
      source: sampleLocation,
      consumers: [{ operationId: 'operation-number', operationKind: 'addTable', field: 'width', source: sampleLocation }],
      provenance: 'preview-only',
    },
    {
      id: 'sample-string',
      expression: 'dynamicText',
      expectedType: 'string',
      source: sampleLocation,
      consumers: [{ operationId: 'operation-string', operationKind: 'createText', field: 'text', source: sampleLocation }],
      provenance: 'preview-only',
    },
    {
      id: 'sample-boolean',
      expression: 'tableScaling',
      expectedType: 'boolean',
      source: sampleLocation,
      consumers: [{ operationId: 'operation-boolean', operationKind: 'addTable', field: 'scaling', source: sampleLocation }],
      provenance: 'preview-only',
    },
  ],
};
const sampleMarkup = renderToStaticMarkup(
  <X4UiSourceEditorSamples catalog={sampleCatalog} samples={undefined} onSampleInput={() => undefined} />,
);
assert.match(sampleMarkup, /Preview-only samples/);
assert.match(sampleMarkup, /Samples affect preview measurement only/);
assert.match(sampleMarkup, /\{tableWidth\}/);
assert.match(sampleMarkup, /\{dynamicText\}/);
assert.match(sampleMarkup, /\{tableScaling\}/);
assert.match(sampleMarkup, /ui\/samples\.lua/);
assert.match(sampleMarkup, /sample-number/);
assert.match(sampleMarkup, /sample-string/);
assert.match(sampleMarkup, /sample-boolean/);
assert.match(sampleMarkup, /type="number"/);
assert.match(sampleMarkup, /type="text"/);
assert.match(sampleMarkup, /true/);
assert.match(sampleMarkup, /false/);

const primarySampleMarkup = renderToStaticMarkup(
  <X4UiSourceEditorSamples primary catalog={sampleCatalog}
    samples={{ catalogId: sampleCatalog.id, source: sampleCatalog.sourceIdentity, values: [
      { id: 'sample-number', value: 120 }, { id: 'sample-string', value: 'Long message\nSecond line' }, { id: 'sample-boolean', value: false },
    ] }}
    onSampleInput={() => undefined} onClear={() => undefined} onApply={() => undefined} onReset={() => undefined}
    onOpenInspect={() => undefined} inspectTargetId="primary-sample-inspect" />,
);
assert.match(primarySampleMarkup, /Preview inputs/);
assert.match(primarySampleMarkup, /aria-label="Width"/);
assert.match(primarySampleMarkup, /aria-label="Text"/);
assert.match(primarySampleMarkup, /aria-label="Scale with UI"/);
assert.match(primarySampleMarkup, /Used by Table/);
assert.match(primarySampleMarkup, /<textarea[^>]*>Long message\nSecond line<\/textarea>/);
assert.match(primarySampleMarkup, /3 values applied to preview/);
assert.match(primarySampleMarkup, /No unapplied edits/);
assert.match(primarySampleMarkup, /Apply to preview/);
assert.match(primarySampleMarkup, /Discard edits/);
const primaryClearButton = primarySampleMarkup.match(/<button[^>]*data-testid="x4-ui-preview-inputs-clear"[^>]*>/)?.[0];
assert.ok(primaryClearButton);
assert.doesNotMatch(primaryClearButton, /\sdisabled(?:=|[\s>])/, 'Clear works with applied values and no draft; CSS disabled variants are not a disabled attribute');
assert.doesNotMatch(primarySampleMarkup, /\{tableWidth\}|\{dynamicText\}|source identity|ui\/samples.lua/);
assert.match(primarySampleMarkup, /aria-controls="primary-sample-inspect"/);
assert.match(primarySampleMarkup, /Not verified in game/);
assert.equal(new Set([...primarySampleMarkup.matchAll(/data-testid="([^"]+)"/g)].map(match => match[1])).size,
  [...primarySampleMarkup.matchAll(/data-testid="([^"]+)"/g)].length, 'primary inputs have unique test identities');
const primaryRefusedMarkup = renderToStaticMarkup(
  <X4UiSourceEditorSamples primary catalog={sampleCatalog} samples={undefined} onSampleInput={() => undefined}
    error="owner-issued source authority drifted at internal-id" />,
);
assert.match(primaryRefusedMarkup, /role="alert"/);
assert.match(primaryRefusedMarkup, /Preview values were not applied/);
assert.doesNotMatch(primaryRefusedMarkup, /internal-id|owner-issued|source authority/);

const pathCatalog: X4UiLayoutPreviewPathCatalog = {
  id: 'preview-path-catalog-selftest',
  sourceIdentity: sampleCatalog.sourceIdentity,
  targetId: 'target-selftest',
  entries: [
    {
      id: 'path-then',
      boundaryId: 'boundary-one',
      armId: 'boundary-one:then:0',
      boundary: { ...sampleLocation, start: { line: 5, column: 2, offset: 120 }, end: { line: 12, column: 3, offset: 260 } },
      arm: 'then',
      armIndex: 0,
      reachability: 'reachable',
      invocationIds: [],
      provenance: 'preview-only',
    },
    {
      id: 'path-elseif',
      boundaryId: 'boundary-one',
      armId: 'boundary-one:elseif:1',
      boundary: { ...sampleLocation, start: { line: 5, column: 2, offset: 120 }, end: { line: 12, column: 3, offset: 260 } },
      arm: 'elseif',
      armIndex: 1,
      reachability: 'conditional',
      invocationIds: [],
      provenance: 'preview-only',
    },
    {
      id: 'path-else',
      boundaryId: 'boundary-one',
      armId: 'boundary-one:else:2',
      boundary: { ...sampleLocation, start: { line: 5, column: 2, offset: 120 }, end: { line: 12, column: 3, offset: 260 } },
      arm: 'else',
      armIndex: 2,
      reachability: 'unreachable',
      invocationIds: [],
      provenance: 'preview-only',
    },
  ],
};
const pathInput: X4UiLayoutPreviewPathSelectionInput = {
  catalogId: pathCatalog.id,
  source: pathCatalog.sourceIdentity,
  selections: [{ id: 'path-then', boundaryId: 'boundary-one', armId: 'boundary-one:then:0' }],
};
let renderedPathSelections = 0;
const pathMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewPaths
    catalog={pathCatalog}
    paths={pathInput}
    onPathSelection={() => { renderedPathSelections += 1; }}
    onReset={() => { renderedPathSelections += 1; }}
  />,
);
assert.equal(renderedPathSelections, 0, 'path controls must not mutate state during SSR');
assert.match(pathMarkup, /data-testid="x4-ui-preview-paths-region"/);
assert.match(pathMarkup, /Preview branch paths/);
assert.match(pathMarkup, /Preview only/);
assert.match(pathMarkup, /selftest\/ui\/samples\.lua:5:3-12:4/);
assert.match(pathMarkup, /arm then \[0\]/);
assert.match(pathMarkup, /arm elseif \[1\]/);
assert.match(pathMarkup, /arm else \[2\]/);
assert.match(pathMarkup, /unavailable · statically unreachable/);
assert.match(pathMarkup, /data-testid="x4-ui-preview-paths-reset"/);
assert.match(pathMarkup, /Reset path selections/);
assert.match(pathMarkup, /Not verified in game/);
assert.doesNotMatch(pathMarkup, /programKey|profileKey|selectionKey/);

const loopCatalog: X4UiLayoutPreviewLoopCatalog = {
  id: 'preview-loop-catalog-selftest',
  sourceIdentity: sampleCatalog.sourceIdentity,
  targetId: 'target-selftest',
  profileId: 'profile-selftest',
  entries: [{
    id: 'loop-direct',
    loopId: 'loop-direct-owner-id',
    source: { ...sampleLocation, start: { line: 14, column: 4, offset: 320 }, end: { line: 17, column: 7, offset: 410 } },
    kind: 'numeric-for',
    multiplicity: 'zero-or-more',
    depth: 1,
    callIds: ['call-loop-direct'],
    provenance: 'preview-only',
  }],
};
const loopState = {
  catalogId: loopCatalog.id,
  source: loopCatalog.sourceIdentity,
  targetId: loopCatalog.targetId,
  profileId: loopCatalog.profileId,
  selections: [{ id: 'loop-direct', iterationCount: 4 }],
} as Parameters<typeof updateX4UiEditorLoopState>[0];
let renderedLoopUpdates = 0;
const loopMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewLoops
    catalog={loopCatalog}
    loops={undefined}
    onLoopIteration={() => { renderedLoopUpdates += 1; }}
    onReset={() => { renderedLoopUpdates += 1; }}
  />,
);
assert.equal(renderedLoopUpdates, 0, 'loop controls must not mutate state during SSR');
assert.match(loopMarkup, /data-testid="x4-ui-preview-loops-region"/);
assert.match(loopMarkup, /Preview Loop Iterations/);
assert.match(loopMarkup, /data-testid="x4-ui-preview-loops-preview-only"[^>]*>Preview only</);
assert.match(loopMarkup, /data-testid="x4-ui-preview-loop-loop-direct"/);
assert.match(loopMarkup, /Source range: selftest\/ui\/samples\.lua:14:5-17:8/);
assert.match(loopMarkup, /Kind: numeric-for · multiplicity: zero-or-more · ID: loop-direct · depth: 1 · provenance: preview-only/);
assert.match(loopMarkup, /data-testid="x4-ui-preview-loop-control-loop-direct"/);
assert.match(loopMarkup, /min="1"/);
assert.match(loopMarkup, /max="16"/);
assert.match(loopMarkup, /step="1"/);
assert.match(loopMarkup, /data-testid="x4-ui-preview-loop-control-loop-direct"[^>]*value=""/);
assert.match(loopMarkup, /data-testid="x4-ui-preview-loops-reset"/);
assert.match(loopMarkup, /Reset preview loop iterations/);
assert.match(loopMarkup, /Not verified in game/);
assert.doesNotMatch(loopMarkup, /programKey|profileKey|selectionKey/);
assert.match(loopMarkup, /Count unavailable: enter a preview override/);
assert.doesNotMatch(loopMarkup, /Automatic from source/);

const automaticLoopSelections = [{ ...loopCatalog.entries[0]!, iterationCount: 2 }];
const automaticLoopMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewLoops catalog={loopCatalog} loops={undefined}
    effectiveSelections={automaticLoopSelections}
    onLoopIteration={() => { renderedLoopUpdates += 1; }} onReset={() => { renderedLoopUpdates += 1; }} />,
);
assert.match(automaticLoopMarkup, /Automatic from source: 2 iterations/);
assert.match(automaticLoopMarkup, /placeholder="Automatic: 2"/);
assert.match(automaticLoopMarkup, />Loop 1</);
assert.match(automaticLoopMarkup, /aria-label="Loop 1 preview override"/);
assert.match(automaticLoopMarkup, /<summary[^>]*>Source details</);
assert.doesNotMatch(automaticLoopMarkup, /<details[^>]*\sopen/);
assert.match(automaticLoopMarkup, /data-testid="x4-ui-preview-loop-control-loop-direct"[^>]*value=""/);
assert.match(automaticLoopMarkup, /data-testid="x4-ui-preview-loops-reset"[^>]*disabled/);
assert.equal(renderedLoopUpdates, 0, 'automatic display must not become manual state during render');

const selectedLoopMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewLoops
    catalog={loopCatalog}
    loops={loopState}
    effectiveSelections={automaticLoopSelections}
    onLoopIteration={() => undefined}
    onReset={() => undefined}
  />,
);
assert.match(selectedLoopMarkup, /data-testid="x4-ui-preview-loop-control-loop-direct"[^>]*value="4"/);
assert.match(selectedLoopMarkup, /Manual preview: 4 iterations/);
assert.doesNotMatch(selectedLoopMarkup, /Automatic from source/);

const nullLoopMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewLoops catalog={null} loops={undefined} onLoopIteration={() => undefined} onReset={() => undefined} />,
);
assert.match(nullLoopMarkup, /data-testid="x4-ui-preview-loops-empty"/);
assert.match(nullLoopMarkup, /owner-issued preview loop catalog/);
assert.match(nullLoopMarkup, /data-testid="x4-ui-preview-loops-reset"[^>]*disabled/);

const noEntryLoopMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewLoops catalog={{ ...loopCatalog, entries: [] }} loops={undefined} onLoopIteration={() => undefined} onReset={() => undefined} />,
);
assert.match(noEntryLoopMarkup, /data-testid="x4-ui-preview-loops-none"/);
assert.match(noEntryLoopMarkup, /no selectable direct preview loops/);
assert.match(noEntryLoopMarkup, /data-testid="x4-ui-preview-loops-reset"[^>]*disabled/);

const refusedLoopMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewLoops
    catalog={loopCatalog}
    loops={undefined}
    onLoopIteration={() => undefined}
    onReset={() => undefined}
    error="preview loop iterationCount must be an integer from 1 through 16"
  />,
);
assert.match(refusedLoopMarkup, /data-testid="x4-ui-preview-loops-error"[^>]*>preview loop iterationCount must be an integer from 1 through 16</);

const loopProjectionSource = [
  'local menu = { name = "Loop Editor", layer = 1 }',
  'function menu.display()',
  '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  '  if menu.active then',
  '    local table = frame:addTable(1, { width = 100 })',
  '    for i = 1, 2 do',
  '      local row = table:addRow(false, {})',
  '      row[1]:createText(dynamicText)',
  '    end',
  '  else',
  '    frame:addTable(1, { width = 90 })',
  '  end',
  '  frame:display()',
  'end',
  'return menu',
  '',
].join('\n');
const loopProjectionWorkspace = {
  ...workspace,
  id: 'x4-ui-source-editor-loop-projection',
  compileSettings: { ui: true },
  passthroughFiles: [
    { path: 'ui.xml', content: '<addon><environment type="menus"><file name="ui/loop.lua" /></environment></addon>' },
    { path: 'ui/loop.lua', content: loopProjectionSource },
  ],
} as unknown as React.ComponentProps<typeof UIBuilder>['workspace'];
const loopUnselectedProjection = projectX4UiEditorSession({
  workspace: loopProjectionWorkspace,
  corpus: undefined,
  profile: { width: 100, height: 80, uiScale: 1 },
});
const loopSourceCandidate = loopUnselectedProjection.preview.sourceCandidates.find(candidate => candidate.path === 'ui/loop.lua');
if (loopSourceCandidate === undefined) throw new Error('loop projection fixture did not issue its exact source candidate');
const loopTarget = loopSourceCandidate.targets.find(candidate => candidate.name === 'menu.display');
if (loopTarget === undefined) throw new Error('loop projection fixture did not issue the menu.display target');
const loopProjection = projectX4UiEditorSession({
  workspace: loopProjectionWorkspace,
  corpus: undefined,
  profile: { width: 100, height: 80, uiScale: 1 },
  selection: {
    sourceIndex: loopSourceCandidate.index,
    path: loopSourceCandidate.path,
    sourceIdentity: loopSourceCandidate.sourceIdentity,
    target: loopTarget,
  },
});
if (loopProjection.loopCatalog === null || loopProjection.sampleCatalog === null || loopProjection.pathCatalog === null) {
  throw new Error('loop projection fixture did not issue path, loop, and sample catalogs');
}
const loopEntry = loopProjection.loopCatalog.entries[0];
const loopSampleEntry = loopProjection.sampleCatalog.entries[0];
if (loopEntry === undefined || loopSampleEntry === undefined) throw new Error('loop projection fixture issued no loop or sample entry');
assert.equal(loopProjection.pathCatalog.entries.length, 2, 'branch projection must retain both owner-issued path arms');
assert.equal(loopProjection.loopCatalog.entries.length, 1, 'loop projection must retain one owner-issued direct loop');
assert.equal(loopProjection.sampleCatalog.entries.length, 2, 'source-proven replay must issue one sample for each actual iteration');
assert.deepEqual(loopProjection.sampleCatalog.entries.map(entry => entry.previewLoop?.iteration), [1, 2]);
assert.equal(new Set(loopProjection.sampleCatalog.entries.map(entry => entry.id)).size, 2);
assert.equal(loopProjection.loops, undefined, 'automatic replay must not manufacture manual loop state');
const acceptedLoopUpdate = updateX4UiEditorLoopState(
  loopProjection.loops,
  loopProjection.loopCatalog,
  loopEntry.id,
  '4',
  loopProjection.loopCatalogAuthority,
);
assert.equal(acceptedLoopUpdate.status, 'accepted', 'finite loop update must be accepted by the session owner');
if (acceptedLoopUpdate.status !== 'accepted') throw new Error('finite loop update unexpectedly refused');
assert.equal(acceptedLoopUpdate.loops?.selections[0]?.iterationCount, 4, 'accepted loop update must reach session state');
const invalidLoopUpdate = updateX4UiEditorLoopState(
  loopProjection.loops,
  loopProjection.loopCatalog,
  loopEntry.id,
  '0',
  loopProjection.loopCatalogAuthority,
);
assert.equal(invalidLoopUpdate.status, 'refused', 'out-of-range loop input must be refused by the session owner');
assert.match(invalidLoopUpdate.message, /integer from 1 through 16/);
const upperBoundLoopUpdate = updateX4UiEditorLoopState(
  loopProjection.loops,
  loopProjection.loopCatalog,
  loopEntry.id,
  '17',
  loopProjection.loopCatalogAuthority,
);
assert.equal(upperBoundLoopUpdate.status, 'refused', 'upper-bound loop input must be refused by the session owner');
assert.match(upperBoundLoopUpdate.message, /integer from 1 through 16/);
const upperBoundLoopMarkup = renderToStaticMarkup(
  <X4UiSourceEditorPreviewLoops
    catalog={loopProjection.loopCatalog}
    loops={loopProjection.loops}
    onLoopIteration={() => undefined}
    onReset={() => undefined}
    error={upperBoundLoopUpdate.message}
  />,
);
assert.match(upperBoundLoopMarkup, /data-testid="x4-ui-preview-loops-error"[^>]*>preview loop iterationCount must be an integer from 1 through 16/);
const emptyLoopUpdate = updateX4UiEditorLoopState(
  acceptedLoopUpdate.loops,
  loopProjection.loopCatalog,
  loopEntry.id,
  '',
  loopProjection.loopCatalogAuthority,
);
assert.equal(emptyLoopUpdate.status, 'accepted', 'empty override must return this loop to automatic behavior');
assert.equal(emptyLoopUpdate.loops, undefined);
assert.equal(emptyLoopUpdate.changed, true);
const resetLoopUpdate = resetX4UiEditorLoopState(
  acceptedLoopUpdate.loops,
  loopProjection.loopCatalog,
  loopProjection.loopCatalogAuthority,
);
assert.equal(resetLoopUpdate.status, 'reset', 'explicit loop reset must be accepted by the session owner');
assert.equal(resetLoopUpdate.loops, undefined);
const acceptedSampleUpdate = updateX4UiEditorSampleState(
  loopProjection.samples,
  loopProjection.sampleCatalog,
  loopSampleEntry.id,
  'loop sample',
  loopProjection.sampleCatalogAuthority,
);
assert.equal(acceptedSampleUpdate.status, 'accepted', 'loop fixture sample must be accepted before loop changes');
if (acceptedSampleUpdate.status !== 'accepted') throw new Error('loop fixture sample unexpectedly refused');
const changedLoopProjection = projectX4UiEditorSession({
  workspace: loopProjectionWorkspace,
  corpus: undefined,
  profile: { width: 100, height: 80, uiScale: 1 },
  selection: {
    sourceIndex: loopSourceCandidate.index,
    path: loopSourceCandidate.path,
    sourceIdentity: loopSourceCandidate.sourceIdentity,
    target: loopTarget,
  },
  loops: acceptedLoopUpdate.loops,
  loopBinding: loopProjection.loopBinding,
  loopCatalogAuthority: loopProjection.loopCatalogAuthority,
  samples: acceptedSampleUpdate.samples,
  sampleBinding: loopProjection.sampleBinding,
  sampleCatalogAuthority: loopProjection.sampleCatalogAuthority,
});
assert.equal(changedLoopProjection.loopReconciliation.status, 'accepted');
assert.equal(changedLoopProjection.loops?.selections[0]?.iterationCount, 4);
assert.equal(changedLoopProjection.sampleReconciliation.status, 'cleared', 'changing loop authority must clear iteration-dependent samples');
assert.equal(changedLoopProjection.samples, undefined, 'cleared iteration-dependent samples must be absent from session projection');

const fixtureBefore = JSON.stringify(workspace);
renderSource(workspace);
assert.equal(JSON.stringify(workspace), fixtureBefore, 'SSR must not mutate the caller workspace');

const lintMarkup = renderSource(lintFixtureWorkspace);
assert.match(lintMarkup, /severity:/);
assert.match(lintMarkup, /code:/);
assert.match(lintMarkup, /source location:/);
assert.match(lintMarkup, /message:/);
assert.match(lintMarkup, /failureMode:/);
assert.match(lintMarkup, /evidenceBoundary:/);
assert.match(lintMarkup, /nextAction:/);
assert.doesNotMatch(lintMarkup, /No known static rule violated/);

const finding = (overrides: Partial<X4UiEditorLintFinding> = {}): X4UiEditorLintFinding => ({
  filePath: 'ui/test.lua',
  severity: 'warning',
  code: 'lint-rule',
  location: 'ui/test.lua:13:1',
  message: 'fixture finding',
  failureMode: 'fixture failure mode',
  evidenceBoundary: 'unbisected fixture evidence',
  nextAction: 'inspect fixture',
  ...overrides,
});

const warningAddTable = finding({
  severity: 'warning',
  code: 'x4-ui.add-table-column-limit',
  location: 'ui/test.lua:23:1',
  failureMode: 'No refusal is proven for this literal count; the measured mod failure boundary is at 24 and must not be generalized to 13-23.',
  evidenceBoundary: 'Official X4 9.00 sources contain valid 13-column tables. Measured mod evidence is 12 passed / 24 failed; 13-23 remain unbisected.',
});
const blockingAddTable = finding({
  severity: 'error',
  code: 'x4-ui.add-table-column-limit',
  location: 'ui/test.lua:24:1',
  failureMode: 'Engine refuses the ENTIRE frame: no partial draw/Lua error; UI auto-reloads, and the conversation-open symptom can look like the conversation closes.',
  evidenceBoundary: 'Measured mod boundary: 12 passed / 24 failed / 13-23 unbisected.',
});

const addTableSource = (count: number): X4UiLuaFileInput => ({
  rel: 'ui/add-table.lua',
  sourcePath: 'selftest/ui/add-table.lua',
  text: [
    'local menu = { name = "Main", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 100 })',
    `local table = frame:addTable(${count}, { width = 2, height = 20 })`,
    'local row = table:addRow(nil, { height = 10 })',
    'row[1]:setText("ok", { fontsize = 12 })',
    'frame:display()',
  ].join('\n'),
});
const actualAddTable13Lint = lintX4UiCallModel(buildX4UiCallModel(addTableSource(13)));
const actualAddTable24Lint = lintX4UiCallModel(buildX4UiCallModel(addTableSource(24)));
const actualAddTable13Inspection = inspectX4UiLint({ lint: [{ path: 'ui/add-table.lua', lint: actualAddTable13Lint }] });
const actualAddTable24Inspection = inspectX4UiLint({ lint: [{ path: 'ui/add-table.lua', lint: actualAddTable24Lint }] });
const actualAddTable13Finding = actualAddTable13Inspection.findings.find(findingValue => findingValue.code === 'x4-ui.add-table-column-limit');
const actualAddTable24Finding = actualAddTable24Inspection.findings.find(findingValue => findingValue.code === 'x4-ui.add-table-column-limit');
assert.equal(actualAddTable13Finding?.severity, 'warning');
assert.equal(actualAddTable24Finding?.severity, 'error');
assert.equal(actualAddTable13Finding?.code, 'x4-ui.add-table-column-limit');
assert.equal(actualAddTable24Finding?.code, 'x4-ui.add-table-column-limit');
const actualAddTable24FailFirstMarkup = renderToStaticMarkup(<X4UiSourceEditorLinter inspection={actualAddTable24Inspection} />);
assert.match(actualAddTable24FailFirstMarkup, /whole frame disappears; UI reloads; conversation closes/);

assert.equal(classifyX4UiLintState({
  sourceAnalyzed: false,
  findings: [],
  incompleteFindingCount: 0,
  diagnosticCount: 0,
  verificationGapCount: 0,
  lintErrorCount: 0,
  truncated: false,
}).label, 'No source analyzed');
assert.equal(classifyX4UiLintState({
  sourceAnalyzed: true,
  findings: [finding({ severity: 'error', code: 'syntax-error' })],
  incompleteFindingCount: 0,
  diagnosticCount: 0,
  verificationGapCount: 0,
  lintErrorCount: 0,
  truncated: false,
}).label, 'Static errors found');
assert.equal(classifyX4UiLintState({
  sourceAnalyzed: true,
  findings: [warningAddTable],
  incompleteFindingCount: 0,
  diagnosticCount: 0,
  verificationGapCount: 0,
  lintErrorCount: 0,
  truncated: false,
}).label, 'Static warnings found');
assert.equal(classifyX4UiLintState({
  sourceAnalyzed: true,
  findings: [],
  incompleteFindingCount: 1,
  diagnosticCount: 0,
  verificationGapCount: 0,
  lintErrorCount: 0,
  truncated: false,
}).label, 'Static checks incomplete');
assert.equal(classifyX4UiLintState({
  sourceAnalyzed: true,
  findings: [],
  incompleteFindingCount: 0,
  diagnosticCount: 0,
  verificationGapCount: 0,
  lintErrorCount: 0,
  truncated: false,
}).label, 'No known static rule violated');

const warningAddTableMarkup = renderToStaticMarkup(
  <X4UiSourceEditorLinter inspection={{
    sourceAnalyzed: true,
    findings: [warningAddTable],
    incompleteFindingCount: 0,
    diagnosticCount: 0,
    verificationGapCount: 0,
    lintErrorCount: 0,
    truncated: false,
  }} />,
);
assert.match(warningAddTableMarkup, /Static warnings found/);
assert.doesNotMatch(warningAddTableMarkup, /whole frame disappears; UI reloads; conversation closes/);
assert.equal(isBlockingX4UiAddTableFinding(warningAddTable), false);

const blockingAddTableMarkup = renderToStaticMarkup(
  <X4UiSourceEditorLinter inspection={{
    sourceAnalyzed: true,
    findings: [blockingAddTable],
    incompleteFindingCount: 0,
    diagnosticCount: 0,
    verificationGapCount: 0,
    lintErrorCount: 0,
    truncated: false,
  }} />,
);
assert.match(blockingAddTableMarkup, /Static errors found/);
assert.match(blockingAddTableMarkup, /whole frame disappears; UI reloads; conversation closes/);
assert.equal(isBlockingX4UiAddTableFinding(blockingAddTable), true);
assert.doesNotMatch(blockingAddTableMarkup, /No known static rule violated/);
for (const fieldLabel of ['severity:', 'code:', 'source location:', 'message:', 'failureMode:', 'evidenceBoundary:', 'nextAction:']) {
  assert.match(blockingAddTableMarkup, new RegExp(fieldLabel.replace(':', '\\:')));
}

const actualAddTable13Markup = renderToStaticMarkup(<X4UiSourceEditorLinter inspection={actualAddTable13Inspection} />);
assert.match(actualAddTable13Markup, /Static warnings found/);
assert.match(actualAddTable13Markup, /x4-ui\.add-table-column-limit/);
assert.doesNotMatch(actualAddTable13Markup, /whole frame disappears; UI reloads; conversation closes/);
assert.equal(isBlockingX4UiAddTableFinding(actualAddTable13Finding as X4UiEditorLintFinding), false);

const actualAddTable24Markup = renderToStaticMarkup(<X4UiSourceEditorLinter inspection={actualAddTable24Inspection} />);
assert.match(actualAddTable24Markup, /Static errors found/);
assert.match(actualAddTable24Markup, /x4-ui\.add-table-column-limit/);
assert.match(actualAddTable24Markup, /whole frame disappears; UI reloads; conversation closes/);
assert.equal(isBlockingX4UiAddTableFinding(actualAddTable24Finding as X4UiEditorLintFinding), true);

const blockingWithGapInspection = { ...actualAddTable24Inspection, verificationGapCount: 1 };
const blockingWithGapMarkup = renderToStaticMarkup(<X4UiSourceEditorLinter inspection={blockingWithGapInspection} />);
assert.equal(classifyX4UiLintState(blockingWithGapInspection).label, 'Static errors found');
assert.match(blockingWithGapMarkup, /Static errors found/);
assert.match(blockingWithGapMarkup, /Static evidence remains incomplete/);

const warningWithGapInspection = { ...actualAddTable13Inspection, verificationGapCount: 1 };
const warningWithGapMarkup = renderToStaticMarkup(<X4UiSourceEditorLinter inspection={warningWithGapInspection} />);
assert.equal(classifyX4UiLintState(warningWithGapInspection).label, 'Static warnings found');
assert.match(warningWithGapMarkup, /Static warnings found/);
assert.match(warningWithGapMarkup, /Static evidence remains incomplete/);

const inspectedLint = inspectX4UiLint({ lint: [{
  path: 'ui/test.lua',
  lint: { findings: [warningAddTable, warningAddTable] },
  diagnostics: [{ code: 'diagnostic-only', message: 'do not render this as a finding' }],
  verificationGaps: [{ code: 'gap-only', message: 'do not render this as a finding' }],
  lintError: 'fixture also has incomplete evidence',
}] });
assert.equal(inspectedLint.findings.length, 1, 'duplicate normalized findings must render once');
assert.equal(inspectedLint.diagnosticCount, 1);
assert.equal(inspectedLint.verificationGapCount, 1);
assert.equal(inspectedLint.lintErrorCount, 1);
assert.equal(classifyX4UiLintState(inspectedLint).label, 'Static warnings found');
const inspectedLintMarkup = renderToStaticMarkup(<X4UiSourceEditorLinter inspection={inspectedLint} />);
assert.match(inspectedLintMarkup, /Static warnings found/);
assert.match(inspectedLintMarkup, /Static evidence remains incomplete/);
assert.equal(inspectedLint.findings[0].failureMode, warningAddTable.failureMode);
assert.equal(inspectedLint.findings[0].evidenceBoundary, warningAddTable.evidenceBoundary);
assert.equal(inspectedLint.findings[0].nextAction, warningAddTable.nextAction);

const actualWarningFinding = actualAddTable13Lint.findings.find(findingValue => findingValue.code === 'x4-ui.add-table-column-limit');
assert.ok(actualWarningFinding);
const warningThenErrorInspection = inspectX4UiLint({ lint: [{
  path: 'ui/add-table.lua',
  lint: { findings: [actualWarningFinding, { ...actualWarningFinding, severity: 'error' }] },
}] });
assert.equal(warningThenErrorInspection.findings.length, 2, 'severity must participate in finding dedupe');
assert.equal(classifyX4UiLintState(warningThenErrorInspection).label, 'Static errors found');

const incompleteMarkup = renderToStaticMarkup(
  <X4UiSourceEditorLinter inspection={{
    sourceAnalyzed: false,
    findings: [],
    incompleteFindingCount: 0,
    diagnosticCount: 0,
    verificationGapCount: 0,
    lintErrorCount: 0,
    truncated: false,
  }} />,
);
assert.match(incompleteMarkup, /No source analyzed/);
assert.doesNotMatch(incompleteMarkup, /No known static rule violated/);

const cleanMarkup = renderToStaticMarkup(
  <X4UiSourceEditorLinter inspection={{
    sourceAnalyzed: true,
    findings: [],
    incompleteFindingCount: 0,
    diagnosticCount: 0,
    verificationGapCount: 0,
    lintErrorCount: 0,
    truncated: false,
  }} />,
);
assert.match(cleanMarkup, /No known static rule violated/);

const geometrySource = (line: number, column: number, offset: number) => ({
  file: 'ui/menu.lua',
  start: { line, column, offset },
  end: { line, column: column + 5, offset: offset + 5 },
});
const geometryGap = (overrides: Record<string, unknown> = {}) => ({
  category: 'height',
  status: 'unavailable',
  source: geometrySource(531, 4, 5_310),
  nodeId: 'menu.row.531',
  reason: '81.6875 px bottom overflow',
  ...overrides,
});
const withoutGeometryNodeId = (gap: Record<string, unknown>): Record<string, unknown> => {
  const copy = { ...gap };
  delete copy.nodeId;
  return copy;
};
const geometryScene = {
  status: 'partial',
  gaps: [
    { category: 'paint', reason: 'paint gap must remain filtered' },
    geometryGap(),
    geometryGap({
      category: 'width',
      source: geometrySource(312, 8, 3_120),
      nodeId: 'menu.row.312',
      reason: 'negative omitted width',
    }),
    geometryGap({
      category: 'width',
      source: geometrySource(312, 8, 3_120),
      nodeId: 'menu.row.312',
      reason: 'negative omitted width',
    }),
    geometryGap({
      category: 'width',
      source: geometrySource(312, 8, 3_120),
      nodeId: 'different-owner',
      reason: 'negative omitted width',
    }),
    { category: 'text', reason: 'text gap must remain filtered' },
    { category: 'height', status: 'unavailable', reason: 'missing source is incomplete' },
    {
      category: 'width',
      status: 'unavailable',
      source: geometrySource(0, 8, 3_120),
      reason: 'invalid range is incomplete',
    },
  ],
};
const geometryVerification = { game: 'Not verified in game', gameVerified: false };
const geometryResult = { status: 'partial', scene: geometryScene, verification: geometryVerification };
const geometryInspection = inspectX4UiPreviewGeometry(geometryResult);
assert.equal(geometryInspection.state, 'incomplete');
assert.equal(geometryInspection.diagnosticCount, 3, 'exact duplicate geometry entries dedupe once');
assert.equal(geometryInspection.incompleteCount, 2, 'malformed height/width candidates are explicitly incomplete');
assert.deepEqual(geometryInspection, inspectX4UiPreviewGeometry({
  ...geometryResult,
  scene: { ...geometryScene, gaps: [...geometryScene.gaps].reverse() },
}), 'geometry inspection must be deterministic independent of gap arrival order');
assert.equal(geometryInspection.diagnostics[0]?.range.start.line, 312, 'geometry diagnostics render in source order');
assert.equal(geometryInspection.diagnostics[2]?.range.start.line, 531, 'height evidence remains after earlier width evidence');
assert.equal(
  geometryInspection.diagnostics.filter(diagnostic => diagnostic.reason === 'negative omitted width').length,
  2,
  'different nodeIds are never merged by matching reason',
);
assert.deepEqual(
  geometryInspection.diagnostics
    .filter(diagnostic => diagnostic.reason === 'negative omitted width')
    .map(diagnostic => diagnostic.nodeId),
  ['different-owner', 'menu.row.312'],
  'authoritative nodeId participates in stable ordering and exact dedupe',
);
assert.equal(
  geometryInspection.diagnostics.some(diagnostic => diagnostic.reason.endsWith('must remain filtered')),
  false,
  'paint/text candidates must remain outside the geometry diagnostics',
);

const geometryMarkup = renderToStaticMarkup(<X4UiSourceEditorPreviewGeometry scene={geometryResult} />);
assert.match(geometryMarkup, /x4-ui-preview-geometry-region/);
assert.match(geometryMarkup, /incomplete/);
assert.match(geometryMarkup, />3<\/span> source-linked height\/width diagnostics/);
assert.match(geometryMarkup, /Incomplete candidates: 2/);
assert.match(geometryMarkup, /category:[\s\S]*height/);
assert.match(geometryMarkup, /category:[\s\S]*width/);
assert.match(geometryMarkup, /status:[\s\S]*unavailable/);
assert.match(geometryMarkup, /file:[\s\S]*ui\/menu\.lua/);
assert.match(geometryMarkup, /range:[\s\S]*312:/);
assert.match(geometryMarkup, /81\.6875 px bottom overflow/);
assert.match(geometryMarkup, /negative omitted width/);
assert.match(geometryMarkup, /node owner:[\s\S]*menu\.row\.531/);
assert.match(geometryMarkup, /node owner:[\s\S]*different-owner/);
assert.match(geometryMarkup, /only height\/width evidence is shown/);
assert.match(geometryMarkup, /Paint\/text\/kernel\/scrollbar\/state\/data-flow gaps are not shown/);
assert.match(geometryMarkup, /Layout evidence only · Not verified in game/);
assert.doesNotMatch(geometryMarkup, /paint gap must remain filtered|text gap must remain filtered/);

const geometryAvailableResult = {
  status: 'partial',
  scene: { status: 'partial', gaps: [geometryGap()] },
  verification: geometryVerification,
};
const geometryAvailableInspection = inspectX4UiPreviewGeometry(geometryAvailableResult);
assert.equal(geometryAvailableInspection.state, 'available');
assert.equal(geometryAvailableInspection.diagnosticCount, 1);
assert.equal(geometryAvailableInspection.incompleteCount, 0);
const geometryAvailableMarkup = renderToStaticMarkup(<X4UiSourceEditorPreviewGeometry scene={geometryAvailableResult} />);
assert.match(geometryAvailableMarkup, /data-testid="x4-ui-preview-geometry-state"[^>]*>available</);
assert.match(geometryAvailableMarkup, />1<\/span> source-linked height\/width diagnostics/);

const geometryWithoutNodeIdResult = {
  status: 'partial',
  scene: {
    status: 'partial',
    gaps: [withoutGeometryNodeId(geometryGap({
      source: geometrySource(540, 2, 5_400),
      reason: 'optional nodeId is absent',
    }))],
  },
  verification: geometryVerification,
};
const geometryWithoutNodeIdInspection = inspectX4UiPreviewGeometry(geometryWithoutNodeIdResult);
assert.equal(geometryWithoutNodeIdInspection.state, 'available');
assert.equal(geometryWithoutNodeIdInspection.diagnosticCount, 1);
assert.equal(geometryWithoutNodeIdInspection.diagnostics[0]?.nodeId, undefined);
const geometryWithoutNodeIdMarkup = renderToStaticMarkup(<X4UiSourceEditorPreviewGeometry scene={geometryWithoutNodeIdResult} />);
assert.doesNotMatch(geometryWithoutNodeIdMarkup, /node owner:/);

const aliasGeometryResult = {
  status: 'partial',
  scene: {
    status: 'partial',
    gaps: [
      { ...withoutGeometryNodeId(geometryGap({ source: geometrySource(541, 2, 5_410), reason: 'nodeOwner alias' })), nodeOwner: 'synthetic-nodeOwner' },
      { ...withoutGeometryNodeId(geometryGap({ source: geometrySource(542, 2, 5_420), reason: 'owner alias' })), owner: 'synthetic-owner' },
      { ...withoutGeometryNodeId(geometryGap({ source: geometrySource(543, 2, 5_430), reason: 'node alias' })), node: 'synthetic-node' },
    ],
  },
  verification: geometryVerification,
};
const aliasGeometryInspection = inspectX4UiPreviewGeometry(aliasGeometryResult);
assert.equal(aliasGeometryInspection.diagnosticCount, 3, 'aliases do not invalidate an otherwise valid gap with optional nodeId absent');
assert.equal(aliasGeometryInspection.diagnostics.every(diagnostic => diagnostic.nodeId === undefined), true);
assert.equal(
  aliasGeometryInspection.diagnostics.some(diagnostic => Object.prototype.hasOwnProperty.call(diagnostic, 'nodeOwner')),
  false,
  'synthetic owner aliases are not promoted into diagnostics',
);
const aliasGeometryMarkup = renderToStaticMarkup(<X4UiSourceEditorPreviewGeometry scene={aliasGeometryResult} />);
assert.doesNotMatch(aliasGeometryMarkup, /synthetic-nodeOwner|synthetic-owner|synthetic-node/);

const geometryEmptyResult = {
  status: 'projected',
  scene: { status: 'projected', gaps: [] },
  verification: geometryVerification,
};
const geometryEmptyInspection = inspectX4UiPreviewGeometry(geometryEmptyResult);
assert.equal(geometryEmptyInspection.state, 'empty');
assert.equal(geometryEmptyInspection.diagnosticCount, 0);
const geometryEmptyMarkup = renderToStaticMarkup(<X4UiSourceEditorPreviewGeometry scene={geometryEmptyResult} />);
assert.match(geometryEmptyMarkup, /data-testid="x4-ui-preview-geometry-empty"/);
assert.match(geometryEmptyMarkup, /Empty: no source-linked height\/width diagnostics are available/);

const refusedGeometryResult = {
  status: 'refused',
  refusal: { code: 'invalid-input', message: 'fixture refusal' },
  verification: geometryVerification,
};
const unavailableGeometryInspection = inspectX4UiPreviewGeometry(refusedGeometryResult);
assert.equal(unavailableGeometryInspection.state, 'unavailable');
assert.equal(unavailableGeometryInspection.diagnosticCount, 0, 'refused Scene cannot fabricate diagnostics');
const unavailableGeometryMarkup = renderToStaticMarkup(<X4UiSourceEditorPreviewGeometry scene={refusedGeometryResult} />);
assert.match(unavailableGeometryMarkup, /data-testid="x4-ui-preview-geometry-unavailable"/);
assert.doesNotMatch(unavailableGeometryMarkup, /81\.6875 px bottom overflow/);
assert.equal(inspectX4UiPreviewGeometry({
  status: 'partial',
  scene: { status: 'partial', gaps: 'malformed' },
  verification: geometryVerification,
}).state, 'unavailable');
assert.equal(inspectX4UiPreviewGeometry(geometryScene).state, 'unavailable', 'raw inner Scene is not a production result wrapper');

let geometryGetterReads = 0;
const accessorGeometryGap = geometryGap();
Object.defineProperty(accessorGeometryGap, 'reason', {
  configurable: true,
  enumerable: true,
  get: () => {
    geometryGetterReads += 1;
    return 'getter reason must not be read';
  },
});
const inheritedGeometryGap = Object.create({
  category: 'height',
  status: 'unavailable',
  source: geometrySource(600, 0, 6_000),
  reason: 'inherited reason must not be read',
});
const hostileGeometryInspection = inspectX4UiPreviewGeometry({
  status: 'partial',
  scene: { status: 'partial', gaps: [accessorGeometryGap, inheritedGeometryGap] },
  verification: geometryVerification,
});
assert.equal(geometryGetterReads, 0, 'accessor-backed geometry fields must not be invoked');
assert.equal(hostileGeometryInspection.diagnosticCount, 0, 'accessor/inherited geometry data cannot become diagnostics');
assert.equal(hostileGeometryInspection.incompleteCount, 1, 'an own malformed geometry candidate is explicit incomplete evidence');

let wrapperGetterReads = 0;
const accessorSceneResult: Record<string, unknown> = { status: 'partial', verification: geometryVerification };
Object.defineProperty(accessorSceneResult, 'scene', {
  configurable: true,
  enumerable: true,
  get: () => {
    wrapperGetterReads += 1;
    return geometryScene;
  },
});
const accessorVerificationResult: Record<string, unknown> = { status: 'partial', scene: geometryScene };
Object.defineProperty(accessorVerificationResult, 'verification', {
  configurable: true,
  enumerable: true,
  get: () => {
    wrapperGetterReads += 1;
    return geometryVerification;
  },
});
const nonEnumerableSceneResult: Record<string, unknown> = { status: 'partial', verification: geometryVerification };
Object.defineProperty(nonEnumerableSceneResult, 'scene', {
  configurable: true,
  enumerable: false,
  writable: true,
  value: geometryScene,
});
const inheritedSceneResult = Object.assign(Object.create({ scene: geometryScene }) as Record<string, unknown>, {
  status: 'partial',
  verification: geometryVerification,
});
for (const malformedResult of [
  { status: 'partial', verification: geometryVerification },
  { status: 'partial', scene: geometryScene },
  { status: 'partial', scene: geometryScene, verification: { game: 'Not verified in game', gameVerified: true } },
  accessorSceneResult,
  accessorVerificationResult,
  nonEnumerableSceneResult,
  inheritedSceneResult,
]) {
  const inspection = inspectX4UiPreviewGeometry(malformedResult);
  assert.equal(inspection.state, 'unavailable');
  assert.equal(inspection.diagnosticCount, 0);
}
assert.equal(wrapperGetterReads, 0, 'accessor-backed nested Scene must not be invoked');

let nodeIdGetterReads = 0;
const accessorNodeIdGap = geometryGap({ source: geometrySource(610, 1, 6_100), reason: 'accessor nodeId' });
Object.defineProperty(accessorNodeIdGap, 'nodeId', {
  configurable: true,
  enumerable: true,
  get: () => {
    nodeIdGetterReads += 1;
    return 'accessor-node';
  },
});
const nonEnumerableNodeIdGap = geometryGap({ source: geometrySource(611, 1, 6_110), reason: 'non-enumerable nodeId' });
Object.defineProperty(nonEnumerableNodeIdGap, 'nodeId', {
  configurable: true,
  enumerable: false,
  writable: true,
  value: 'hidden-node',
});
const malformedNodeIdInspection = inspectX4UiPreviewGeometry({
  status: 'partial',
  scene: {
    status: 'partial',
    gaps: [
      accessorNodeIdGap,
      nonEnumerableNodeIdGap,
      geometryGap({ source: geometrySource(612, 1, 6_120), reason: 'non-string nodeId', nodeId: 12 }),
      geometryGap({ source: geometrySource(613, 1, 6_130), reason: 'empty nodeId', nodeId: '   ' }),
    ],
  },
  verification: geometryVerification,
});
assert.equal(nodeIdGetterReads, 0, 'accessor-backed nodeId must not be invoked');
assert.equal(malformedNodeIdInspection.diagnosticCount, 0, 'malformed own nodeId drops the candidate instead of stripping its owner');
assert.equal(malformedNodeIdInspection.incompleteCount, 4, 'every malformed own nodeId is explicit incomplete evidence');

let inheritedNodeIdGetterReads = 0;
const inheritedNodeIdPrototype = {};
Object.defineProperty(inheritedNodeIdPrototype, 'nodeId', {
  configurable: true,
  enumerable: true,
  get: () => {
    inheritedNodeIdGetterReads += 1;
    return 'inherited-node';
  },
});
const inheritedNodeIdGap = Object.assign(
  Object.create(inheritedNodeIdPrototype) as Record<string, unknown>,
  withoutGeometryNodeId(geometryGap({ source: geometrySource(614, 1, 6_140), reason: 'inherited nodeId' })),
);
const inheritedNodeIdInspection = inspectX4UiPreviewGeometry({
  status: 'partial',
  scene: { status: 'partial', gaps: [inheritedNodeIdGap] },
  verification: geometryVerification,
});
assert.equal(inheritedNodeIdGetterReads, 0, 'inherited nodeId must not be invoked');
assert.equal(inheritedNodeIdInspection.diagnosticCount, 0, 'forged prototype data is not promoted');
assert.equal(inheritedNodeIdInspection.incompleteCount, 1);

assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: 'missing-source',
  targetSelector: 'target-1',
  candidates: [{ key: 'source-1', targets: [{ key: 'target-1' }] }],
}), { sourceSelector: '', targetSelector: '' });
assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: 'source-1',
  targetSelector: 'missing-target',
  candidates: [{ key: 'source-1', targets: [{ key: 'target-1' }] }],
}), { sourceSelector: 'source-1', targetSelector: '' });
assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: '',
  targetSelector: '',
  candidates: [{ key: 'source-1', targets: [{ key: 'target-1' }] }],
}), { sourceSelector: '', targetSelector: '' });

const stableSelectionCandidates = [
  {
    key: 'source-menu',
    targets: [{ key: 'target-cleanup' }, { key: 'target-display' }],
  },
  {
    key: 'source-other',
    targets: [{ key: 'target-other' }],
  },
] as const;
const sourceSelectionTransition = reconcileX4UiEditorSelections({
  sourceSelector: 'source-menu',
  targetSelector: '',
  candidates: stableSelectionCandidates,
});
assert.deepEqual(sourceSelectionTransition, { sourceSelector: 'source-menu', targetSelector: '' }, 'source selection must not auto-select a target');
const targetSelectionTransition = reconcileX4UiEditorSelections({
  sourceSelector: sourceSelectionTransition.sourceSelector,
  targetSelector: 'target-display',
  candidates: stableSelectionCandidates,
});
assert.deepEqual(targetSelectionTransition, { sourceSelector: 'source-menu', targetSelector: 'target-display' }, 'valid target must survive the user-selection/reconciliation transition');
assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: 'source-other',
  targetSelector: targetSelectionTransition.targetSelector,
  candidates: stableSelectionCandidates,
}), { sourceSelector: 'source-other', targetSelector: '' }, 'changing source must clear the prior target');
const delimiterTargetBody = 'target:ui/addons/ai_influence_chat/aic_menu.lua||8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD|function|ui/addons/ai_influence_chat/aic_menu.lua||315:0:16768|893:3:53651:function';
assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: 'source-real',
  targetSelector: `12:${delimiterTargetBody}`,
  candidates: [{ key: 'source-real', targets: [{ key: `13:${delimiterTargetBody}` }] }],
}), { sourceSelector: 'source-real', targetSelector: `13:${delimiterTargetBody}` }, 'target index drift must rebase on the unique stable target identity');
assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: 'source-real',
  targetSelector: `12:${delimiterTargetBody}`,
  candidates: [{ key: 'source-real', targets: [{ key: '13:another-target:function' }] }],
}), { sourceSelector: 'source-real', targetSelector: '' }, 'missing drifted target authority must remain fail-closed');
assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: 'source-real',
  targetSelector: `12:${delimiterTargetBody}`,
  candidates: [{ key: 'source-real', targets: [{ key: `13:${delimiterTargetBody}` }, { key: `14:${delimiterTargetBody}` }] }],
}), { sourceSelector: 'source-real', targetSelector: '' }, 'ambiguous drifted target authority must remain fail-closed');
assert.deepEqual(reconcileX4UiEditorSelections({
  sourceSelector: 'source-real',
  targetSelector: 'invalid-target-authority',
  candidates: [{ key: 'source-real', targets: [{ key: `13:${delimiterTargetBody}` }] }],
}), { sourceSelector: 'source-real', targetSelector: '' }, 'invalid target authority must remain fail-closed');
console.log('X4UiSourceEditor selection reconciliation regression: valid target retention 1/1; no-auto-select 1/1; source-change reset 1/1');

assert.equal(classifyX4UiCorpusLoadResult({
  result: { ok: true },
  loaderIssued: false,
  signalAborted: false,
  requestActive: true,
  requestGeneration: 1,
  currentGeneration: 1,
}).accepted, false);
assert.equal(classifyX4UiCorpusLoadResult({
  result: null,
  loaderIssued: true,
  signalAborted: true,
  requestActive: true,
  requestGeneration: 1,
  currentGeneration: 1,
}).status, 'ignored');
assert.equal(classifyX4UiCorpusLoadResult({
  result: { ok: true },
  loaderIssued: true,
  signalAborted: false,
  requestActive: false,
  requestGeneration: 1,
  currentGeneration: 2,
}).status, 'ignored');
const corpusClassificationInput = {
  loaderIssued: true,
  signalAborted: false,
  requestActive: true,
  requestGeneration: 1,
  currentGeneration: 1,
};
assert.equal(classifyX4UiCorpusLoadResult({ ...corpusClassificationInput, result: { ok: false, error: { code: 'status-unavailable', message: 'offline fixture' } } }).status, 'unavailable');
assert.equal(classifyX4UiCorpusLoadResult({ ...corpusClassificationInput, result: { ok: false, error: { code: 'generation-drift', message: 'stale fixture' } } }).status, 'stale');
assert.equal(classifyX4UiCorpusLoadResult({ ...corpusClassificationInput, result: { ok: false, error: { code: 'manifest-malformed', message: 'malformed fixture' } } }).status, 'malformed');
assert.equal(classifyX4UiCorpusLoadResult({ ...corpusClassificationInput, result: { ok: false, error: { code: 'path-invalid', message: 'refused fixture' } } }).status, 'refused');
assert.equal(classifyX4UiCorpusLoadResult({ ...corpusClassificationInput, result: { ok: false, error: { code: 'aborted', message: 'aborted fixture' } } }).status, 'ignored');

const initialCanvasState = {
  status: 'empty',
  surface: null,
  receipt: null,
  stale: false,
  gameTruth: 'Not verified in game',
  gameVerified: false,
} as const;
assert.match(classifyX4UiCanvasState(initialCanvasState).detail, /No rendered bitmap yet/);
assert.doesNotMatch(classifyX4UiCanvasState({ ...initialCanvasState, status: 'current', stale: false }).detail, /stale/i);
assert.match(classifyX4UiCanvasState({ ...initialCanvasState, status: 'stale', stale: true }).detail, /retained|stale/i);
assert.match(classifyX4UiCanvasState({ ...initialCanvasState, status: 'refused', stale: false }).detail, /refused/i);

const previousSurface = { width: 2, height: 2, getContext: () => ({}) };
const freshSurface = { width: 2, height: 2, getContext: () => ({}) };
const renderedResult = {
  status: 'rendered',
  surface: freshSurface,
  receipt: {
    format: 'x4-ui-canvas-renderer',
    version: 1,
    status: 'rendered',
    gameTruth: 'Not verified in game',
    gameVerified: false,
    verification: { game: 'Not verified in game', gameVerified: false },
    width: 2,
    height: 2,
    layers: ['diagnostic-background', 'glyph-alpha-blits', 'diagnostics', 'keep-out-overlays'],
    commandIds: [],
    commandCount: 0,
    atlasRoles: [],
    palette: { id: 'diagnostic-only', diagnosticOnly: true },
  },
} as const;
const firstRenderedDecision = classifyX4UiCanvasCommit(initialCanvasState, { ...renderedResult, surface: previousSurface });
assert.equal(firstRenderedDecision.nextState.surface, previousSurface);
const renderedDecision = classifyX4UiCanvasCommit(firstRenderedDecision.nextState, renderedResult);
assert.equal(renderedDecision.replaceSurface, freshSurface);
assert.equal(renderedDecision.nextState.surface, freshSurface);
const refusalDecision = classifyX4UiCanvasCommit(firstRenderedDecision.nextState, {
  status: 'refused',
  receipt: {
    format: 'x4-ui-canvas-renderer',
    version: 1,
    status: 'refused',
    gameTruth: 'Not verified in game',
    gameVerified: false,
    verification: { game: 'Not verified in game', gameVerified: false },
    refusal: { code: 'input-refused', message: 'refused fixture' },
  },
} as const);
assert.equal(refusalDecision.replaceSurface, undefined);
assert.equal(refusalDecision.nextState.surface, previousSurface);
const malformedDecision = classifyX4UiCanvasCommit(firstRenderedDecision.nextState, {
  ...renderedResult,
  receipt: null,
} as unknown as Parameters<typeof classifyX4UiCanvasCommit>[1]);
assert.equal(malformedDecision.replaceSurface, undefined);
assert.equal(malformedDecision.discardSurface, freshSurface);
assert.equal(malformedDecision.nextState.surface, previousSurface);
assert.equal(malformedDecision.nextState.status, 'stale');
assert.equal(malformedDecision.nextState.stale, true);
assert.equal((malformedDecision.nextState as unknown as { refusal?: { code?: string } }).refusal?.code, 'invalid-result');
const unexpectedCanvasResult = {
  ...renderedResult,
  [['target', 'Surface'].join('')]: freshSurface,
};
const unexpectedDecision = classifyX4UiCanvasCommit(firstRenderedDecision.nextState, unexpectedCanvasResult as unknown as Parameters<typeof classifyX4UiCanvasCommit>[1]);
assert.equal(unexpectedDecision.replaceSurface, undefined);
assert.equal(unexpectedDecision.discardSurface, freshSurface);
assert.equal(unexpectedDecision.nextState.surface, previousSurface);
assert.equal(unexpectedDecision.nextState.status, 'stale');
assert.equal(unexpectedDecision.nextState.stale, true);
assert.equal((unexpectedDecision.nextState as unknown as { refusal?: { code?: string } }).refusal?.code, 'invalid-result');
const unexpectedExistingCanvasResult = {
  ...renderedResult,
  [['existing', 'Surface'].join('')]: freshSurface,
};
const unexpectedExistingDecision = classifyX4UiCanvasCommit(firstRenderedDecision.nextState, unexpectedExistingCanvasResult as unknown as Parameters<typeof classifyX4UiCanvasCommit>[1]);
assert.equal(unexpectedExistingDecision.replaceSurface, undefined);
assert.equal(unexpectedExistingDecision.discardSurface, freshSurface);
assert.equal(unexpectedExistingDecision.nextState.surface, previousSurface);
assert.equal(unexpectedExistingDecision.nextState.status, 'stale');
assert.equal(unexpectedExistingDecision.nextState.stale, true);
assert.equal((unexpectedExistingDecision.nextState as unknown as { refusal?: { code?: string } }).refusal?.code, 'invalid-result');
const malformedEmptyDecision = classifyX4UiCanvasCommit(initialCanvasState, {
  ...renderedResult,
  receipt: null,
} as unknown as Parameters<typeof classifyX4UiCanvasCommit>[1]);
assert.equal(malformedEmptyDecision.replaceSurface, undefined);
assert.equal(malformedEmptyDecision.discardSurface, freshSurface);
assert.equal(malformedEmptyDecision.nextState.status, 'refused');

type CanvasExportClassificationFixture = {
  readonly status: 'available' | 'refused';
  readonly detail: string;
  readonly filename?: string;
  readonly identityKey?: string;
  readonly width?: number;
  readonly height?: number;
};
type CanvasExportClassifierFixture = (input: {
  readonly state: unknown;
  readonly mountedCanvas: unknown;
  readonly currentIdentity: unknown;
  readonly committedIdentity: unknown;
}) => CanvasExportClassificationFixture;
const classifyCanvasExport = canvasExportFailFirstApi.classifyX4UiCanvasExport as CanvasExportClassifierFixture;
class CanvasExportFixture {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}
const globalFixture = globalThis as unknown as Record<string, unknown>;
const hadCanvasConstructor = Object.prototype.hasOwnProperty.call(globalFixture, 'HTMLCanvasElement');
const previousCanvasConstructor = globalFixture.HTMLCanvasElement;
Object.defineProperty(globalThis, 'HTMLCanvasElement', {
  configurable: true,
  writable: true,
  value: CanvasExportFixture,
});
try {
  const exportSourceIdentity = {
    file: 'ui/pipeline test/evil?.lua',
    sourcePath: 'selftest/ui/pipeline test/evil?.lua',
    sha256: 'a'.repeat(64),
  };
  const exportIdentity = {
    sourceIdentity: exportSourceIdentity,
    targetIdentity: { id: 'menu/createFrame<>', kind: 'function' },
    normalizedProfile: {
      id: 'unverified-default',
      source: exportSourceIdentity,
      drawable: { width: 2560, height: 1440 },
      uiScale: 1.4,
    },
  };
  const exportReceipt = { ...renderedResult.receipt, width: 2560, height: 1440 };
  const exportCanvas = new CanvasExportFixture(2560, 1440);
  const exportState = {
    status: 'current',
    surface: exportCanvas,
    receipt: exportReceipt,
    stale: false,
    gameTruth: 'Not verified in game',
    gameVerified: false,
  };
  const classifyExport = (overrides: Partial<Parameters<CanvasExportClassifierFixture>[0]> = {}) => classifyCanvasExport({
    state: exportState,
    mountedCanvas: exportCanvas,
    currentIdentity: exportIdentity,
    committedIdentity: exportIdentity,
    ...overrides,
  });
  const exportAvailable = classifyExport();
  assert.equal(exportAvailable.status, 'available', 'current DOM canvas and exact identity are exportable');
  assert.equal(exportAvailable.width, 2560);
  assert.equal(exportAvailable.height, 1440);
  assert.match(exportAvailable.filename ?? '', /^x4-ui-/);
  assert.match(exportAvailable.filename ?? '', /-2560x1440-effective-scale-1\.4\.png$/);
  assert.doesNotMatch(exportAvailable.filename ?? '', /[\\/:*?"<>|]/, 'export filename removes path and reserved characters');
  assert.equal(classifyExport().filename, exportAvailable.filename, 'safe export filename is deterministic');
  const changedSourceDigestIdentity = {
    ...exportIdentity,
    sourceIdentity: { ...exportSourceIdentity, sha256: 'b'.repeat(64) },
    normalizedProfile: {
      ...exportIdentity.normalizedProfile,
      source: { ...exportSourceIdentity, sha256: 'b'.repeat(64) },
    },
  };
  const changedSourceDigest = classifyCanvasExport({
    state: exportState,
    mountedCanvas: exportCanvas,
    currentIdentity: changedSourceDigestIdentity,
    committedIdentity: changedSourceDigestIdentity,
  });
  assert.equal(changedSourceDigest.status, 'available');
  assert.equal(changedSourceDigest.filename, exportAvailable.filename, 'safe filenames may remain stable across source digest changes');
  assert.notEqual(changedSourceDigest.identityKey, exportAvailable.identityKey, 'pending completion must compare exact identity beyond the safe filename');
  const refusalCases: readonly [string, Partial<Parameters<CanvasExportClassifierFixture>[0]>][] = [
    ['empty state', { state: initialCanvasState }],
    ['refused state', { state: { ...exportState, status: 'refused', surface: null, receipt: null } }],
    ['stale state', { state: { ...exportState, status: 'stale', stale: true } }],
    ['malformed receipt', { state: { ...exportState, receipt: { status: 'rendered', width: 2560, height: 1440 } } }],
    ['mismatched receipt dimensions', { state: { ...exportState, receipt: { ...exportReceipt, width: 1800, height: 900 } } }],
    ['non-DOM surface', { state: { ...exportState, surface: { width: 2560, height: 1440 } }, mountedCanvas: { width: 2560, height: 1440 } }],
    ['different mounted canvas', { mountedCanvas: new CanvasExportFixture(2560, 1440) }],
    ['missing current identity', { currentIdentity: null }],
    ['superseded identity', { committedIdentity: { ...exportIdentity, targetIdentity: { id: 'menu/otherTarget' } } }],
    ['profile dimension mismatch', { currentIdentity: { ...exportIdentity, normalizedProfile: { ...exportIdentity.normalizedProfile, drawable: { width: 1800, height: 900 } } } }],
  ];
  for (const [name, overrides] of refusalCases) {
    assert.equal(classifyExport(overrides).status, 'refused', `${name} must fail closed`);
  }
  const replacementIdentity = {
    ...exportIdentity,
    normalizedProfile: { ...exportIdentity.normalizedProfile, drawable: { width: 1800, height: 900 } },
  };
  const replacementCanvas = new CanvasExportFixture(1800, 900);
  const replacementState = { ...exportState, surface: replacementCanvas, receipt: { ...exportReceipt, width: 1800, height: 900 } };
  assert.equal(classifyCanvasExport({
    state: replacementState,
    mountedCanvas: replacementCanvas,
    currentIdentity: replacementIdentity,
    committedIdentity: exportIdentity,
  }).status, 'refused', 'profile replacement cannot export with the prior identity');
  assert.equal(classifyCanvasExport({
    state: replacementState,
    mountedCanvas: replacementCanvas,
    currentIdentity: replacementIdentity,
    committedIdentity: replacementIdentity,
  }).status, 'available', 'profile replacement becomes exportable only after current commit');
  const selectionReplacementIdentity = {
    ...exportIdentity,
    sourceIdentity: { ...exportSourceIdentity, file: 'ui/other.lua' },
    normalizedProfile: { ...exportIdentity.normalizedProfile, source: { ...exportSourceIdentity, file: 'ui/other.lua' } },
  };
  assert.equal(classifyExport({ currentIdentity: selectionReplacementIdentity }).status, 'refused', 'selection replacement cannot export the prior canvas identity');
  assert.equal(
    classifyExport({ state: { ...exportState, status: 'stale', stale: true } }).status,
    'refused',
    'canvas click must refuse a stale retained bitmap before hit-testing current builder nodes',
  );
  assert.equal(
    classifyExport({ currentIdentity: selectionReplacementIdentity }).status,
    'refused',
    'canvas click must refuse a retained bitmap whose source identity was superseded',
  );
} finally {
  if (hadCanvasConstructor) {
    globalFixture.HTMLCanvasElement = previousCanvasConstructor;
  } else {
    delete globalFixture.HTMLCanvasElement;
  }
}
const sharedKeepOutPresets = [
  { id: 'cockpit-conversation', members: [{ entryId: 'conversation-back-row' }] },
  { id: 'map-open', members: [{ entryId: 'conversation-back-row' }] },
] as const;
const sharedEnabledEntryIds = ['conversation-back-row'];
const inactiveOriginPresetId = 'map-open';
const inactiveOriginResult = toggleX4UiKeepOutEntry(
  'cockpit-conversation',
  inactiveOriginPresetId,
  sharedEnabledEntryIds,
  'conversation-back-row',
  sharedKeepOutPresets,
);
assert.equal(inactiveOriginResult, sharedEnabledEntryIds, `${inactiveOriginPresetId} control must not toggle the active cockpit-conversation keep-out`);
assert.deepEqual(inactiveOriginResult, ['conversation-back-row']);
const activeOriginDisabled = [] as const;
const activeOriginEnabled = toggleX4UiKeepOutEntry('cockpit-conversation', 'cockpit-conversation', activeOriginDisabled, 'conversation-back-row', sharedKeepOutPresets);
assert.deepEqual(activeOriginEnabled, ['conversation-back-row'], 'active-origin callback toggles the entry on');
assert.deepEqual(activeOriginDisabled, [], 'toggle must not mutate the disabled input array');
const activeOriginDisabledAgain = toggleX4UiKeepOutEntry('cockpit-conversation', 'cockpit-conversation', activeOriginEnabled, 'conversation-back-row', sharedKeepOutPresets);
assert.deepEqual(activeOriginDisabledAgain, [], 'active-origin callback toggles the entry off');
const nullActiveResult = toggleX4UiKeepOutEntry(null, 'cockpit-conversation', sharedEnabledEntryIds, 'conversation-back-row', sharedKeepOutPresets);
assert.equal(nullActiveResult, sharedEnabledEntryIds, 'null active preset preserves the original array identity');
const unknownActiveResult = toggleX4UiKeepOutEntry('unknown-preset', 'unknown-preset', sharedEnabledEntryIds, 'conversation-back-row', sharedKeepOutPresets);
assert.equal(unknownActiveResult, sharedEnabledEntryIds, 'unknown active preset preserves the original array identity');
const unknownOriginResult = toggleX4UiKeepOutEntry('cockpit-conversation', 'unknown-preset', sharedEnabledEntryIds, 'conversation-back-row', sharedKeepOutPresets);
assert.equal(unknownOriginResult, sharedEnabledEntryIds, 'unknown originating preset preserves the original array identity');
const wrongOriginResult = toggleX4UiKeepOutEntry('cockpit-conversation', 'map-open', sharedEnabledEntryIds, 'conversation-back-row', sharedKeepOutPresets);
assert.equal(wrongOriginResult, sharedEnabledEntryIds, 'wrong originating preset preserves the original array identity');
const foreignEntryResult = toggleX4UiKeepOutEntry('cockpit-conversation', 'cockpit-conversation', sharedEnabledEntryIds, 'foreign-entry', sharedKeepOutPresets);
assert.equal(foreignEntryResult, sharedEnabledEntryIds, 'foreign entry preserves the original array identity');
assert.equal(isX4UiKeepOutEntryChecked('preset-a', 'preset-b', ['member-a'], 'member-a'), false, 'inactive preset members render unchecked');
assert.equal(isX4UiKeepOutEntryChecked('preset-a', 'preset-a', ['member-a'], 'member-a'), true, 'active preset members reflect enabled IDs');
assert.deepEqual(
  toggleX4UiKeepOutEntry(KEEP_OUT_PRESET_IDS.cockpitConversation, KEEP_OUT_PRESET_IDS.cockpitConversation, [], KEEP_OUT_IDS.missionMessagesTicker, KEEP_OUT_PRESETS),
  [KEEP_OUT_IDS.missionMessagesTicker],
  'active cockpit controls must independently enable the calibrated ticker',
);
assert.deepEqual(
  toggleX4UiKeepOutEntry(KEEP_OUT_PRESET_IDS.mapOpen, KEEP_OUT_PRESET_IDS.mapOpen, [], KEEP_OUT_IDS.topHudStrip, KEEP_OUT_PRESETS),
  [KEEP_OUT_IDS.topHudStrip],
  'active map controls must independently enable the calibrated HUD strip',
);
assert.deepEqual(
  toggleX4UiKeepOutEntry(KEEP_OUT_PRESET_IDS.mapOpen, KEEP_OUT_PRESET_IDS.mapOpen, [KEEP_OUT_IDS.missionMessagesTicker], KEEP_OUT_IDS.missionMessagesTicker, KEEP_OUT_PRESETS),
  [KEEP_OUT_IDS.missionMessagesTicker],
  'unsupported map ticker toggle must not cross-enable a member from another preset',
);
assert.deepEqual(
  toggleX4UiKeepOutEntry(KEEP_OUT_PRESET_IDS.cockpitConversation, KEEP_OUT_PRESET_IDS.cockpitConversation, [KEEP_OUT_IDS.topHudStrip], KEEP_OUT_IDS.topHudStrip, KEEP_OUT_PRESETS),
  [KEEP_OUT_IDS.topHudStrip],
  'unsupported cockpit HUD toggle must remain isolated from active members',
);

const uiBuilderMarkup = renderToStaticMarkup(
  <UIBuilder
    workspace={workspace}
    setWorkspace={() => undefined}
    selectedWidget={null}
    setSelectedWidget={() => undefined}
  />,
);
assert.match(uiBuilderMarkup, /X4 Source Preview/);
assert.match(uiBuilderMarkup, /Legacy pixel designer/);
assert.match(uiBuilderMarkup, /LUA Script Event Manager/);
assert.match(uiBuilderMarkup, /x4-ui-source-editor/);
assert.match(uiBuilderMarkup, /Not verified in game/);
const verifiedUiBuilderMarkup = renderToStaticMarkup(
  <UIBuilder
    workspace={workspace}
    setWorkspace={() => undefined}
    selectedWidget={null}
    setSelectedWidget={() => undefined}
    x4UiVerification={{
      status: 'verified',
      label: 'Externally verified in game',
      detail: 'Exact evidence fixture',
      canConfirm: false,
      reason: 'verified',
    }}
  />,
);
assert.match(verifiedUiBuilderMarkup, /data-testid="ui-game-verification-status"/);
assert.match(verifiedUiBuilderMarkup, /External game verification/);
assert.match(verifiedUiBuilderMarkup, /Externally verified in game/);
const confirmReadyDecision = {
  status: 'not-verified' as const,
  label: 'Not verified in game' as const,
  detail: 'Exact evidence is ready for explicit confirmation.',
  canConfirm: true,
  reason: 'confirmation-required' as const,
};
const confirmWithoutHandlerMarkup = renderToStaticMarkup(
  <UIBuilder
    workspace={workspace}
    setWorkspace={() => undefined}
    selectedWidget={null}
    setSelectedWidget={() => undefined}
    x4UiVerification={confirmReadyDecision}
  />,
);
const confirmWithoutHandlerButton = confirmWithoutHandlerMarkup.match(/<button[^>]*data-testid="ui-game-verification-confirm"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
assert.match(confirmWithoutHandlerButton, /disabled=""/);
assert.match(confirmWithoutHandlerButton, /Confirm after exact clean deploy/);
const confirmWithHandlerMarkup = renderToStaticMarkup(
  <UIBuilder
    workspace={workspace}
    setWorkspace={() => undefined}
    selectedWidget={null}
    setSelectedWidget={() => undefined}
    x4UiVerification={confirmReadyDecision}
    onConfirmX4UiVerification={() => undefined}
  />,
);
const confirmWithHandlerButton = confirmWithHandlerMarkup.match(/<button[^>]*data-testid="ui-game-verification-confirm"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
assert.doesNotMatch(confirmWithHandlerButton, /disabled=/);
assert.match(confirmWithHandlerButton, /Confirm X4 UI in game/);

const sourceText = readFileSync(new URL('./X4UiSourceEditor.tsx', import.meta.url), 'utf8');
const selftestText = readFileSync(new URL('./X4UiSourceEditor.selftest.tsx', import.meta.url), 'utf8');
const uiBuilderText = readFileSync(new URL('./UIBuilder.tsx', import.meta.url), 'utf8');
const appText = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const projectionMemoSource = sourceText.match(/ {2}const projectedPreview = useMemo\([\s\S]*?\n {2}\);/)?.[0] ?? '';
const projectionObserverContractRows = [
  ['projection memo computes the ordinary fallback projection', /projection: sessionOwner\.project\(sessionInput\)/.test(projectionMemoSource)],
  ['successful continuation precedes ordinary fallback projection', projectionMemoSource.indexOf('transferPreviewScenario(') >= 0
    && projectionMemoSource.indexOf('transferPreviewScenario(') < projectionMemoSource.indexOf('sessionOwner.project(')],
  ['continuation captures current profile controls, not an old or discarded projection',
    /width: profileValue\.width, height: profileValue\.height, uiScale: profileValue\.uiScale/.test(projectionMemoSource)],
  ['projection memo has no render-phase observer callback', !/sessionProjectionObserverRef\.current\?\.\(next\)/.test(projectionMemoSource)],
  ['observer callback is keyed to committed projection in an effect', /useEffect\(\(\) => \{\s*sessionProjectionObserverRef\.current\?\.\(projection\);\s*\}, \[projection\]\);/s.test(sourceText)],
  ['observer ref remains fresh for the latest callback', /sessionProjectionObserverRef\.current = onSessionProjection;/.test(sourceText)],
] as const;
const projectionObserverContractMissing = projectionObserverContractRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(
  projectionObserverContractMissing,
  [],
  `B119 projection observer committed-effect fail-first red assertions: ${projectionObserverContractMissing.join(', ')}`,
);
assert.doesNotMatch(appText, /setX4UiVerificationSnapshot\(null\)/, 'App must not clobber the child-owned current snapshot from a parent layout effect');
assert.match(appText, /refreshExperienceConfirmationPreservingX4UiSnapshot/);
assert.match(sourceText, /return \(\) => onVerificationSnapshotChange\(null\);/, 'SourceEditor cleanup remains the null-emission owner');
const manualStateSourceStart = sourceText.indexOf('export interface X4UiManualCalibrationState');
const manualStateSourceEnd = sourceText.indexOf('export interface X4UiCanvasStateDescription', manualStateSourceStart);
const manualActionSourceStart = sourceText.indexOf('  const updateManualDraftField');
const manualActionSourceEnd = sourceText.indexOf('  const updateSample', manualActionSourceStart);
const manualRowSourceStart = sourceText.indexOf('            {manualCalibrationState.rows.map');
const manualRowSourceEnd = sourceText.indexOf('            {manualCalibrationState.rows.length === 0', manualRowSourceStart);
assert.equal(
  [manualStateSourceStart, manualStateSourceEnd, manualActionSourceStart, manualActionSourceEnd, manualRowSourceStart, manualRowSourceEnd].every(offset => offset >= 0),
  true,
  'manual calibration source boundaries must remain available for ownership scans',
);
const manualCalibrationOwnedSource = [
  sourceText.slice(manualStateSourceStart, manualStateSourceEnd),
  sourceText.slice(manualActionSourceStart, manualActionSourceEnd),
  sourceText.slice(manualRowSourceStart, manualRowSourceEnd),
].join('\n');
for (const forbiddenManualSource of ['onWorkspaceEdit', 'localStorage', 'sessionStorage', 'indexedDB', 'globalThis.fetch', 'fetch(', 'gameVerified: true', 'Verified in game']) {
  assert.equal(manualCalibrationOwnedSource.includes(forbiddenManualSource), false, `manual calibration ownership leak present: ${forbiddenManualSource}`);
}
assert.doesNotMatch(manualCalibrationOwnedSource, /\bas any\b|:\s*any\b/);
for (const forbidden of [
  'showDirectoryPicker',
  'showOpenFilePicker',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'targetSurface',
  'existingSurface',
  'workspace.uiWidgets',
  'screenshot capture',
  'source regeneration',
]) {
  assert.equal(sourceText.includes(forbidden), false, `forbidden source-editor API/text present: ${forbidden}`);
}
assert.match(sourceText, /loadConfiguredX4UiCorpusAssets/);
assert.match(sourceText, /isX4UiCorpusCanonicalSuccess/);
assert.match(sourceText, /renderX4UiPaintPlanToCanvas\(/);
assert.match(sourceText, /createX4UiCanvasRenderSession/);
assert.match(sourceText, /const \[rendererSession\] = useState<X4UiCanvasRenderSession>\(\(\) => createX4UiCanvasRenderSession\(\)\);/);
assert.match(sourceText, /session:\s*rendererSession/);
assert.match(sourceText, /className="flex min-w-0 flex-1 min-h-0 flex-col overflow-hidden/);
assert.match(sourceText, /buildX4UiBuilderPresentation\(projection\)/);
assert.match(sourceText, /hitTestX4UiBuilderCanvas\(builderPresentation\.nodes, nativePoint\)/);
assert.match(sourceText, /sourceEntriesForX4UiBuilderNode\(sourceEditCatalog, selectedBuilderNode\)/);
assert.match(sourceText, /data-testid="x4-ui-canvas-export-compact"/);
assert.match(sourceText, /data-testid="x4-ui-canvas-export-inspect"/);
assert.match(sourceText, /computeX4UiBuilderViewport\(/);
assert.match(sourceText, /deriveX4UiBuilderMenuBounds\(/);
assert.match(sourceText, /data-testid="x4-ui-canvas-zoom-mode"/);
assert.match(sourceText, /data-testid="x4-ui-canvas-zoom-in"/);
assert.match(sourceText, /data-testid="x4-ui-canvas-zoom-out"/);
assert.match(sourceText, /data-testid="x4-ui-canvas-zoom-value"/);
assert.match(sourceText, /value=\{stagedValue \?\? \(entry\.value === undefined \? '' : String\(entry\.value\)\)\}/);
assert.match(sourceText, /width: `\$\{canvasViewport\.stageWidth\}px`/);
assert.match(sourceText, /height: `\$\{canvasViewport\.stageHeight\}px`/);
assert.doesNotMatch(sourceText, /width: `min\(100%, calc\(70vh \* \$\{canvasSurfaceDimensions\.width \/ canvasSurfaceDimensions\.height\}\)\)`/);
assert.match(sourceText, /surface\.style\.maxWidth = 'none';/);
assert.match(sourceText, /surface\.style\.maxHeight = 'none';/);
assert.match(sourceText, /surface\.style\.width = '100%';/);
assert.match(sourceText, /surface\.style\.height = '100%';/);
assert.match(sourceText, /surface\.style\.objectFit = 'fill';/);
assert.doesNotMatch(sourceText, /data-testid="x4-ui-canvas-host"[^\n]*min-h-24[^\n]*max-h-\[70vh\]/, 'mounted canvas host must not impose independent min/max geometry');
const builderCanvasClickSourceStart = sourceText.indexOf('  const handleBuilderCanvasClick = ');
const builderCanvasClickSourceEnd = sourceText.indexOf('\n\n  const selectPreset', builderCanvasClickSourceStart);
assert.ok(builderCanvasClickSourceStart >= 0 && builderCanvasClickSourceEnd > builderCanvasClickSourceStart, 'builder canvas click source boundary must remain available');
const builderCanvasClickSource = sourceText.slice(builderCanvasClickSourceStart, builderCanvasClickSourceEnd);
const builderCanvasCurrentGateRows = [
  ['canvas click reuses the current mounted-surface classifier', /classifyX4UiCanvasExport\(\{/.test(builderCanvasClickSource)],
  ['canvas click reads the current canvas state ref', /state:\s*canvasStateRef\.current/.test(builderCanvasClickSource)],
  ['canvas click reads the current verification snapshot ref', /currentIdentity:\s*currentVerificationSnapshotRef\.current/.test(builderCanvasClickSource)],
  ['canvas click compares the committed canvas identity', /committedIdentity:\s*canvasExportIdentityRef\.current/.test(builderCanvasClickSource)],
  ['canvas click clears selection when the mounted proof is refused', /if \(classification\.status !== 'available'\)[\s\S]*?setBuilderSelection\(null\)/.test(builderCanvasClickSource)],
] as const;
const builderCanvasCurrentGateMissing = builderCanvasCurrentGateRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(
  builderCanvasCurrentGateMissing,
  [],
  `B119 stale mounted canvas click safety fail-first red assertions: ${builderCanvasCurrentGateMissing.join(', ')}`,
);
assert.match(sourceText, /selectedBuilderNode\?\.rect !== undefined && canvasExportReady/, 'selection outline must use the exact current mounted-surface proof');
// Fail-first B119 presentation contract: Source Preview must select source composition explicitly.
assert.match(sourceText, /presentation:\s*['"]source-composition['"]/);
assert.match(sourceText, /<X4UiSourceEditorPreviewGeometry scene=\{projection\.preview\.scene\} \/>/);
assert.ok(sourceText.indexOf('<X4UiSourceEditorLinter inspection={lintInspection} />') < sourceText.indexOf('<X4UiSourceEditorPreviewGeometry scene={projection.preview.scene} />'));
assert.match(sourceText, /adoptX4UiEditorCanvasResult/);
assert.match(sourceText, /sampleBinding/);
assert.match(sourceText, /projection\.sampleBinding/);
assert.match(sourceText, /sameX4UiEditorSampleBinding/);
assert.match(sourceText, /sampleCatalogAuthority/);
assert.match(sourceText, /projection\.sampleCatalogAuthority/);
assert.match(sourceText, /const updateSample = \(entryId: string, raw: string\): void => \{/);
assert.match(sourceText, /setSampleDraft\(previous =>/);
assert.match(sourceText, /applyX4UiEditorSampleDraft\(sampleInput, catalog, draft\.values, draft\.authority\)/);
assert.match(sourceText, /onApply=\{applySampleDraft\}/);
assert.match(sourceText, /onReset=\{resetSampleDraft\}/);
assert.doesNotMatch(sourceText, /updateX4UiEditorSampleState\(sampleInput, projection\.sampleCatalog, entryId, raw, projection\.sampleCatalogAuthority\)/);
assert.match(sourceText, /X4UiSourceEditorPreviewPaths/);
assert.match(sourceText, /X4UiSourceEditorPreviewLoops/);
assert.match(sourceText, /pathBinding/);
assert.match(sourceText, /projection\.pathBinding/);
assert.match(sourceText, /sameX4UiEditorPathBinding/);
assert.match(sourceText, /pathCatalogAuthority/);
assert.match(sourceText, /projection\.pathCatalogAuthority/);
assert.match(sourceText, /updateX4UiEditorPathState\(pathInput, projection\.pathCatalog, entryId, projection\.pathCatalogAuthority\)/);
assert.match(sourceText, /resetX4UiEditorPathState\(pathInput, projection\.pathCatalog, projection\.pathCatalogAuthority\)/);
assert.match(sourceText, /name=\{`x4-ui-preview-path-\$\{boundaryId\}`\}/);
assert.match(sourceText, /disabled=\{unavailable\}/);
assert.match(sourceText, /onPathSelection=\{updatePath\}/);
assert.match(sourceText, /onReset=\{resetPaths\}/);
assert.match(sourceText, /loopBinding/);
assert.match(sourceText, /projection\.loopBinding/);
assert.match(sourceText, /sameX4UiEditorLoopBinding/);
assert.match(sourceText, /loopCatalogAuthority/);
assert.match(sourceText, /projection\.loopCatalogAuthority/);
assert.match(sourceText, /updateX4UiEditorLoopState\(\s*loopInputRef\.current,\s*loopCatalogRef\.current,\s*entryId,\s*raw,\s*loopCatalogAuthorityRef\.current,/);
assert.match(sourceText, /resetX4UiEditorLoopState\(\s*loopInputRef\.current,\s*loopCatalogRef\.current,\s*loopCatalogAuthorityRef\.current,/);
assert.match(sourceText, /onLoopIteration=\{updateLoop\}/);
assert.match(sourceText, /onReset=\{resetLoops\}/);
assert.ok(sourceText.indexOf('<X4UiSourceEditorPreviewPaths') < sourceText.indexOf('<X4UiSourceEditorPreviewLoops'));
const inspectSampleSource = sourceText.slice(sourceText.indexOf('<details id={inspectTargetId}'));
assert.ok(inspectSampleSource.indexOf('<X4UiSourceEditorPreviewLoops') >= 0);
assert.ok(inspectSampleSource.indexOf('<X4UiSourceEditorPreviewLoops') < inspectSampleSource.indexOf('<X4UiSourceEditorSamples'), 'technical Inspect keeps paths then loops then samples');
assert.ok(sourceText.indexOf('data-testid="x4-ui-preview-inputs-panel"') < sourceText.indexOf('data-testid="x4-ui-builder-workspace"'), 'primary preview inputs are in the toolbar before the canvas workspace');
assert.match(sourceText, /onClear=\{clearPreviewValues\}/);
assert.match(sourceText, /currentSampleProjectionRef\.current !== projection/);
assert.ok(sourceText.indexOf('if (projection.paths !== pathInput)') < sourceText.indexOf('if (projection.loops !== loopInputRef.current)'));
assert.ok(sourceText.indexOf('if (projection.loops !== loopInputRef.current)') < sourceText.indexOf('if (projection.samples !== sampleInput)'));
assert.ok(sourceText.indexOf('const updatePath =') < sourceText.indexOf('const updateLoop ='));
assert.ok(sourceText.indexOf('const updateLoop =') < sourceText.indexOf('const updateSample ='));
assert.doesNotMatch(sampleMarkup, /programKey|profileKey|selectionKey/);
assert.match(sourceText, /whole frame disappears; UI reloads; conversation closes\./);
assert.match(sourceText, /workspace,\n\s+corpus:/);
assert.match(sourceText, /enabledEntryIds/);
assert.match(sourceText, /AbortController/);
assert.match(sourceText, /gameVerified: false/);
assert.doesNotMatch(sourceText, /gameVerified:\s*true/);
assert.doesNotMatch(sourceText, /Verified in game/);
assert.match(sourceText, /const explicitEnabled = manualCalibrationState\.enabledManualRowIds\.includes\(row\.rowId\)/);
assert.doesNotMatch(sourceText, /const explicitEnabled = manualCalibrationState\.[^;]*stableId/);
assert.match(sourceText, /<article key=\{row\.rowId\} data-testid=\{`x4-ui-manual-calibration-row-\$\{row\.rowId\}`\}/);
assert.match(sourceText, /x4-ui-manual-calibration-enable-\$\{row\.rowId\}/);
assert.match(sourceText, /x4-ui-manual-calibration-remove-\$\{row\.rowId\}/);
assert.match(selftestText, /Historical B119 8C\.2 duplicate-admission fail-first receipt from the pre-correction candidate/);
assert.match(selftestText, /these hashes are evidence for that earlier red run, not current file-hash expectations/);
assert.ok(
  /useState<'source' \| 'canvas' \| 'lua'>\('source'\)/.test(uiBuilderText)
    || (/presentationTab \?\? localActiveUiSubTab/.test(uiBuilderText)
      && /useState<UIBuilderPresentationTab>\('source'\)/.test(uiBuilderText)),
  'UIBuilder must retain the standalone source/canvas/lua fallback while allowing the parent controlled subtab',
);
assert.match(uiBuilderText, /<X4UiSourceEditor workspace=\{workspace\}/);
assert.match(uiBuilderText, /data-testid="ui-game-verification-status"/);
assert.match(uiBuilderText, /External game verification/);
assert.match(uiBuilderText, /onX4UiVerificationSnapshotChange/);
assert.match(uiBuilderText, /onConfirmX4UiVerification/);

const sourceEditorApiUnknown = X4UiSourceEditorApiModule as unknown as Record<string, unknown>;
const batch8c2FailFirstMissing = [
  [
    'manual controls/fields/test IDs are absent from initial SSR',
    /x4-ui-manual-calibration-region/.test(sourceMarkup)
      && /x4-ui-manual-calibration-stable-id/.test(sourceMarkup)
      && /x4-ui-manual-calibration-point-0-x/.test(sourceMarkup),
  ],
  [
    'valid draft cannot be added or wired because the pure helper/API is absent',
    typeof sourceEditorApiUnknown.createX4UiManualCalibrationDraft === 'function'
      && typeof sourceEditorApiUnknown.addX4UiManualCalibrationDraft === 'function'
      && typeof sourceEditorApiUnknown.buildX4UiManualCalibrationSessionInput === 'function',
  ],
  [
    'enable/remove duplicate-ID reconciliation behavior is absent',
    typeof sourceEditorApiUnknown.toggleX4UiManualCalibrationRow === 'function'
      && typeof sourceEditorApiUnknown.removeX4UiManualCalibrationRow === 'function',
  ],
  [
    'component session input cannot receive manualCalibrations/enabledManualEntryIds',
    /manualCalibrations/.test(sourceText) && /enabledManualEntryIds/.test(sourceText),
  ],
  ['permanent Not verified truth is expected', /Not verified in game/.test(sourceMarkup) && /Not verified in game/.test(sourceText)],
].filter(([, pass]) => !pass)
  .map(([name]) => name);
assert.deepEqual(
  batch8c2FailFirstMissing,
  [],
  `B119 8C.2 fail-first red assertions: ${batch8c2FailFirstMissing.join(', ')}`,
);

const makeManualCalibrationDraft = (stableId: string): X4UiManualCalibrationDraft => {
  let draft = createX4UiManualCalibrationDraft();
  for (const [field, value] of [
    ['stableId', stableId],
    ['context', 'manual-context'],
    ['sourceNote', 'operator screenshot calibration'],
    ['screenshotHash', 'A'.repeat(64)],
    ['profile', '2560x1440-ui-1.4'],
    ['drawableLeft', '10'],
    ['drawableTop', '20'],
    ['drawableWidth', '100'],
    ['drawableHeight', '80'],
  ] as const) {
    draft = updateX4UiManualCalibrationDraft(draft, field, value);
  }
  draft = updateX4UiManualCalibrationPoint(draft, 0, 'x', '20');
  draft = updateX4UiManualCalibrationPoint(draft, 0, 'y', '30');
  draft = updateX4UiManualCalibrationPoint(draft, 1, 'x', '100');
  draft = updateX4UiManualCalibrationPoint(draft, 1, 'y', '30');
  draft = updateX4UiManualCalibrationPoint(draft, 2, 'x', '20');
  draft = updateX4UiManualCalibrationPoint(draft, 2, 'y', '80');
  return draft;
};

const initialManualDraft = createX4UiManualCalibrationDraft();
const updatedManualPointDraft = updateX4UiManualCalibrationPoint(initialManualDraft, 0, 'x', '12.5');
assert.notEqual(updatedManualPointDraft, initialManualDraft, 'manual point update must create a new draft');
assert.notEqual(updatedManualPointDraft.points, initialManualDraft.points, 'manual point update must create a new point array');
assert.equal(initialManualDraft.points[0].x, '0', 'manual point update must not mutate the original point');
assert.equal(updatedManualPointDraft.points[1], initialManualDraft.points[1], 'manual point update must preserve untouched point identity');
const addedManualPointDraft = addX4UiManualCalibrationPoint(initialManualDraft);
assert.equal(addedManualPointDraft.points.length, 4, 'manual add-point must append one draft point');
assert.equal(initialManualDraft.points.length, 3, 'manual add-point must not mutate the original point array');
const removedManualPointDraft = removeX4UiManualCalibrationPoint(addedManualPointDraft, 3);
assert.equal(removedManualPointDraft.points.length, 3, 'manual remove-point must remove exactly one draft point');
assert.equal(removedManualPointDraft.points[0], addedManualPointDraft.points[0], 'manual remove-point must preserve remaining point identity');
assert.equal(removeX4UiManualCalibrationPoint(initialManualDraft, -1), initialManualDraft, 'unknown manual point removal must be a no-op');
assert.equal(updateX4UiManualCalibrationPoint(initialManualDraft, 99, 'x', '1'), initialManualDraft, 'unknown manual point update must be a no-op');

const validManualDraft = makeManualCalibrationDraft('manual-polygon-1');
const parsedManualDraft = parseX4UiManualCalibrationDraft(validManualDraft);
assert.equal(parsedManualDraft.accepted, true, 'valid manual draft must convert to a plain calibration input');
if (!parsedManualDraft.accepted) throw new Error('valid manual draft unexpectedly refused');
assert.deepEqual(Object.keys(parsedManualDraft.input).sort(), ['context', 'drawableBounds', 'points', 'profile', 'screenshotHash', 'sourceNote', 'stableId']);
assert.deepEqual(parsedManualDraft.input.drawableBounds, { left: 10, top: 20, width: 100, height: 80 }, 'manual bounds must convert numeric text exactly');
assert.deepEqual(parsedManualDraft.input.points, [{ x: 20, y: 30 }, { x: 100, y: 30 }, { x: 20, y: 80 }], 'manual points must convert numeric text exactly');
const blankNumericDraft = updateX4UiManualCalibrationDraft(validManualDraft, 'drawableWidth', '');
const nonFiniteNumericDraft = updateX4UiManualCalibrationDraft(validManualDraft, 'drawableWidth', 'Infinity');
const blankPointDraft = updateX4UiManualCalibrationPoint(validManualDraft, 0, 'x', '');
assert.deepEqual(parseX4UiManualCalibrationDraft(blankNumericDraft), { accepted: false, reason: 'invalid-number', message: 'drawable width must be a non-empty finite number.' });
assert.deepEqual(parseX4UiManualCalibrationDraft(nonFiniteNumericDraft), { accepted: false, reason: 'invalid-number', message: 'drawable width must be a non-empty finite number.' });
assert.deepEqual(parseX4UiManualCalibrationDraft(blankPointDraft), { accepted: false, reason: 'invalid-number', message: 'point 1 x must be a non-empty finite number.' });

const manualEmptyState = createX4UiManualCalibrationState();
const manualPreparedState = { ...manualEmptyState, draft: validManualDraft };
const manualOneState = addX4UiManualCalibrationDraft(manualPreparedState);
const manualTwoState = addX4UiManualCalibrationDraft(manualOneState, validManualDraft);
assert.equal(manualOneState.rows.length, 1, 'manual Add must store one row');
assert.equal(manualTwoState.rows.length, 2, 'manual Add must preserve duplicate rows');
assert.notEqual(manualTwoState.rows[0].rowId, manualTwoState.rows[1].rowId, 'manual duplicate rows must have distinct local identities');
assert.equal(manualOneState.draft.stableId, '', 'manual Add must reset only the draft deterministically');
const manualRowOne = manualTwoState.rows[0];
const manualRowTwo = manualTwoState.rows[1];
const manualUnknownToggle = toggleX4UiManualCalibrationRow(manualTwoState, 'unknown-row');
const manualUnknownRemove = removeX4UiManualCalibrationRow(manualTwoState, 'unknown-row');
assert.equal(manualUnknownToggle, manualTwoState, 'unknown manual toggle must preserve state identity');
assert.equal(manualUnknownRemove, manualTwoState, 'unknown manual remove must preserve state identity');
const manualEnabledState = setX4UiManualCalibrationRowEnabled(manualTwoState, manualRowOne.rowId, true);
assert.deepEqual(manualEnabledState.enabledManualRowIds, [manualRowOne.rowId], 'explicit manual enable must store only the immutable local row ID');
assert.equal(manualEnabledState.enabledManualRowIds.includes(manualRowTwo.rowId), false, 'enabling duplicate row 1 must leave duplicate row 2 disabled');
assert.equal(setX4UiManualCalibrationRowEnabled(manualEnabledState, manualRowOne.rowId, true), manualEnabledState, 'repeating explicit enable must be a no-op');
const manualBothEnabledState = setX4UiManualCalibrationRowEnabled(manualEnabledState, manualRowTwo.rowId, true);
assert.deepEqual(manualBothEnabledState.enabledManualRowIds, [manualRowOne.rowId, manualRowTwo.rowId], 'enabling both duplicates must retain both local row IDs');
const manualSecondToggledOffState = toggleX4UiManualCalibrationRow(manualBothEnabledState, manualRowTwo.rowId);
assert.deepEqual(manualSecondToggledOffState.enabledManualRowIds, [manualRowOne.rowId], 'toggling duplicate row 2 off must leave row 1 enabled');
assert.deepEqual(manualBothEnabledState.enabledManualRowIds, [manualRowOne.rowId, manualRowTwo.rowId], 'toggling one duplicate must not mutate the prior enablement array');
const manualRemovedDuplicateState = removeX4UiManualCalibrationRow(manualEnabledState, manualRowOne.rowId);
assert.deepEqual(manualRemovedDuplicateState.enabledManualRowIds, [], 'removing enabled row 1 must not transfer enablement to disabled duplicate row 2');
const manualRemovedFinalState = removeX4UiManualCalibrationRow(manualRemovedDuplicateState, manualRowTwo.rowId);
assert.deepEqual(manualRemovedFinalState.enabledManualRowIds, [], 'removing the final duplicate must leave no local row enablement');
const manualRemovedDisabledSiblingState = removeX4UiManualCalibrationRow(manualEnabledState, manualRowTwo.rowId);
assert.equal(manualRemovedDisabledSiblingState.enabledManualRowIds, manualEnabledState.enabledManualRowIds, 'removing disabled row 2 must preserve row 1 enablement-array identity');
const manualRemovedBothFirstState = removeX4UiManualCalibrationRow(manualBothEnabledState, manualRowOne.rowId);
const manualRemovedBothSecondState = removeX4UiManualCalibrationRow(manualBothEnabledState, manualRowTwo.rowId);
assert.deepEqual(manualRemovedBothFirstState.enabledManualRowIds, [manualRowTwo.rowId], 'removing enabled row 1 must retain enabled row 2 only');
assert.deepEqual(manualRemovedBothSecondState.enabledManualRowIds, [manualRowOne.rowId], 'removing enabled row 2 must retain enabled row 1 only');
const manualToggledOffState = toggleX4UiManualCalibrationRow(manualEnabledState, manualRowOne.rowId);
assert.deepEqual(manualToggledOffState.enabledManualRowIds, [], 'manual toggle must explicitly disable only the addressed row ID');

const rowLocalFailFirstState = setX4UiManualCalibrationRowEnabled(manualTwoState, manualRowOne.rowId, true);
const rowLocalFailFirstEnabledRowIds = rowLocalFailFirstState.enabledManualRowIds;
const rowLocalFailFirstRed = [
  [
    'enabling duplicate row 1 is row-local and leaves row 2 disabled',
    rowLocalFailFirstEnabledRowIds?.length === 1
      && rowLocalFailFirstEnabledRowIds[0] === manualRowOne.rowId
      && !rowLocalFailFirstEnabledRowIds.includes(manualRowTwo.rowId),
  ],
] as const;
const rowLocalFailFirstMissing = rowLocalFailFirstRed
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
assert.deepEqual(
  rowLocalFailFirstMissing,
  [],
  `B119 8C.2 row-local enablement fail-first red assertions: ${rowLocalFailFirstMissing.join(', ')}`,
);

const projectManualState = (state: ReturnType<typeof createX4UiManualCalibrationState>, profile = { width: 100, height: 80, uiScale: 1 }) => {
  const manualInput = buildX4UiManualCalibrationSessionInput(state);
  return {
    input: manualInput,
    projection: projectX4UiEditorSession({
      workspace,
      corpus: undefined,
      profile,
      manualCalibrations: manualInput.manualCalibrations,
      enabledManualEntryIds: manualInput.enabledManualEntryIds,
    }),
  };
};

const disabledManualSession = projectManualState(manualOneState);
assert.equal(disabledManualSession.input.manualCalibrations.length, 1, 'component must send one exact plain manual calibration input');
assert.deepEqual(disabledManualSession.input.enabledManualEntryIds, [], 'new manual rows must be disabled until explicitly enabled');
assert.equal(disabledManualSession.projection.manualCalibrations[0]?.status, 'success', 'valid disabled manual row must still receive Session success provenance');
assert.equal(disabledManualSession.projection.manualCalibrations[0]?.enabled, false, 'valid disabled manual row must not be enabled for Paint');
assert.equal(disabledManualSession.projection.activeKeepOuts.length, 0, 'valid disabled manual row must emit no active Paint keep-out');

const enabledManualSession = projectManualState(manualEnabledState);
assert.equal(enabledManualSession.input.manualCalibrations.length, 2, 'duplicate manual inputs must both reach Session in index order');
assert.equal(enabledManualSession.projection.manualCalibrations.length, 2, 'Session must preserve one refusal projection per duplicate occurrence');
assert.equal(enabledManualSession.projection.manualCalibrations.every(value => value.status === 'refused' && value.reason === 'duplicate-stable-id'), true, 'duplicate stable IDs must remain visibly refused by Session');
assert.equal(enabledManualSession.projection.activeKeepOuts.length, 0, 'duplicate refusal must issue no manual Paint keep-out');
assert.deepEqual(enabledManualSession.input.enabledManualEntryIds, [], 'ambiguous stable IDs must be excluded from Session enablement while local enablement is retained');
assert.deepEqual(
  enabledManualSession.input.refusedRows.map(row => row.reason),
  ['duplicate-stable-id', 'duplicate-stable-id'],
  'both valid duplicate occurrences must be visibly refused at the component boundary',
);
const bothEnabledManualSession = projectManualState(manualBothEnabledState);
assert.deepEqual(manualBothEnabledState.enabledManualRowIds, [manualRowOne.rowId, manualRowTwo.rowId], 'both duplicate checkboxes must remain independently checked in local state');
assert.deepEqual(bothEnabledManualSession.input.enabledManualEntryIds, [], 'enabling both duplicate rows must not grant ambiguous stable-ID authority to Session');
assert.equal(bothEnabledManualSession.projection.activeKeepOuts.length, 0, 'enabling both duplicate rows must still issue zero active keep-outs');
const validDuplicateAfterRemovingFirst = projectManualState(removeX4UiManualCalibrationRow(manualEnabledState, manualRowOne.rowId));
const validDuplicateAfterRemovingSecond = projectManualState(removeX4UiManualCalibrationRow(manualEnabledState, manualRowTwo.rowId));
assert.equal(validDuplicateAfterRemovingFirst.projection.activeKeepOuts.length, 0, 'removing enabled row 1 must not enable surviving disabled row 2');
assert.equal(validDuplicateAfterRemovingSecond.projection.activeKeepOuts.length, 1, 'removing disabled row 2 must restore surviving enabled row 1');
assert.deepEqual(validDuplicateAfterRemovingFirst.input.enabledManualEntryIds, []);
assert.deepEqual(validDuplicateAfterRemovingSecond.input.enabledManualEntryIds, ['manual-polygon-1']);
const manualSecondOnlyEnabledState = setX4UiManualCalibrationRowEnabled(manualTwoState, manualRowTwo.rowId, true);
const secondOnlyAfterRemovingFirst = projectManualState(removeX4UiManualCalibrationRow(manualSecondOnlyEnabledState, manualRowOne.rowId));
const secondOnlyAfterRemovingSecond = projectManualState(removeX4UiManualCalibrationRow(manualSecondOnlyEnabledState, manualRowTwo.rowId));
assert.equal(secondOnlyAfterRemovingFirst.projection.activeKeepOuts.length, 1, 'removing disabled row 1 must restore surviving enabled row 2');
assert.equal(secondOnlyAfterRemovingSecond.projection.activeKeepOuts.length, 0, 'removing enabled row 2 must not enable surviving disabled row 1');
const bothEnabledAfterRemovingFirst = projectManualState(removeX4UiManualCalibrationRow(manualBothEnabledState, manualRowOne.rowId));
const bothEnabledAfterRemovingSecond = projectManualState(removeX4UiManualCalibrationRow(manualBothEnabledState, manualRowTwo.rowId));
assert.equal(bothEnabledAfterRemovingFirst.projection.activeKeepOuts.length, 1, 'removing row 1 when both were enabled must restore surviving enabled row 2');
assert.equal(bothEnabledAfterRemovingSecond.projection.activeKeepOuts.length, 1, 'removing row 2 when both were enabled must restore surviving enabled row 1');

const enabledSingleManualState = addX4UiManualCalibrationDraft({ ...manualEmptyState, enabledManualRowIds: [] }, validManualDraft);
const enabledSingleManual = projectManualState(setX4UiManualCalibrationRowEnabled(enabledSingleManualState, enabledSingleManualState.rows[0].rowId, true));
const enabledManualProjection = enabledSingleManual.projection.manualCalibrations[0];
assert.equal(enabledManualProjection?.status, 'success', 'valid enabled manual row must be accepted by Session');
assert.equal(enabledManualProjection?.enabled, true, 'valid enabled manual row must be enabled by primitive ID');
assert.deepEqual(enabledSingleManual.input.enabledManualEntryIds, ['manual-polygon-1'], 'one enabled valid row must derive exactly one primitive stable ID for Session');
assert.equal(enabledSingleManual.input.enabledManualEntryIds.every(value => typeof value === 'string'), true, 'manual enablement input must contain primitive IDs only');
assert.equal(enabledSingleManual.projection.activeKeepOuts.length, 1, 'valid enabled manual row must issue exactly one active manual keep-out to Paint');
assert.equal(enabledSingleManual.projection.keepOuts.length, 1, 'Session must forward exactly one active manual keep-out to Paint');
assert.equal(enabledSingleManual.projection.activeKeepOuts[0]?.entry.id, 'manual-polygon-1');
assert.equal(enabledSingleManual.projection.activeKeepOuts[0]?.projection.advisoryOnly, true);
assert.equal(enabledSingleManual.projection.activeKeepOuts[0]?.projection.gameVerification, 'Not verified in game');
assert.match(sourceText, /manualCalibrations: manualSessionInput\.manualCalibrations/);
assert.match(sourceText, /enabledManualEntryIds: manualSessionInput\.enabledManualEntryIds/);
assert.match(sourceText, /projectionView\.paint/);
assert.match(sourceText, /renderX4UiPaintPlanToCanvas\(/);
const removedSingleManual = projectManualState(removeX4UiManualCalibrationRow(
  setX4UiManualCalibrationRowEnabled(enabledSingleManualState, enabledSingleManualState.rows[0].rowId, true),
  enabledSingleManualState.rows[0].rowId,
));
assert.equal(removedSingleManual.projection.manualCalibrations.length, 0, 'removing an enabled manual row must remove its Session projection');
assert.equal(removedSingleManual.projection.activeKeepOuts.length, 0, 'removing an enabled manual row must remove its Paint keep-out');

const invalidManualCases = [
  ['invalid hash', updateX4UiManualCalibrationDraft(validManualDraft, 'screenshotHash', 'not-a-sha256'), 'malformed-screenshot-hash'],
  ['invalid bounds', updateX4UiManualCalibrationDraft(validManualDraft, 'drawableWidth', '-1'), 'invalid-bounds'],
  ['invalid points', updateX4UiManualCalibrationPoint(validManualDraft, 0, 'x', '1000'), 'out-of-bounds'],
  ['too few points', removeX4UiManualCalibrationPoint(removeX4UiManualCalibrationPoint(validManualDraft, 2), 1), 'too-few-points'],
  ['built-in ID', updateX4UiManualCalibrationDraft(validManualDraft, 'stableId', 'conversation-back-row'), 'built-in-id-collision'],
] as const;

// Historical B119 8C.2 duplicate-admission fail-first receipt from the pre-correction candidate;
// these hashes are evidence for that earlier red run, not current file-hash expectations:
// production SHA256 27266888BDB35415B128A4005FB5325C1DD60AA3D4EC780E6ACD3F3BDFA5CF5E;
// selftest SHA256 9EB566E8BD437B907606B44F21F27E160008BE15446F193E1EA252673C87288D.
const targetedDuplicateValidDraft = makeManualCalibrationDraft('shared-local-id');
const targetedDuplicateSingleState = addX4UiManualCalibrationDraft({ ...manualEmptyState, draft: targetedDuplicateValidDraft });
const targetedDuplicateEnabledState = setX4UiManualCalibrationRowEnabled(
  targetedDuplicateSingleState,
  targetedDuplicateSingleState.rows[0]?.rowId ?? 'missing-row',
  true,
);
const targetedDuplicateMalformedState = addX4UiManualCalibrationDraft({
  ...targetedDuplicateEnabledState,
  draft: updateX4UiManualCalibrationDraft(targetedDuplicateValidDraft, 'drawableWidth', ''),
});
const targetedDuplicateValidRow = targetedDuplicateMalformedState.rows[0];
const targetedDuplicateMalformedRow = targetedDuplicateMalformedState.rows[1];
assert.deepEqual(targetedDuplicateMalformedState.enabledManualRowIds, [targetedDuplicateValidRow.rowId], 'adding a malformed duplicate must leave only the previously enabled valid row checked');
assert.equal(targetedDuplicateMalformedState.enabledManualRowIds.includes(targetedDuplicateMalformedRow.rowId), false, 'malformed duplicate row must begin independently disabled');
const targetedDuplicateBothEnabledState = setX4UiManualCalibrationRowEnabled(
  targetedDuplicateMalformedState,
  targetedDuplicateMalformedRow.rowId,
  true,
);
assert.deepEqual(targetedDuplicateBothEnabledState.enabledManualRowIds, [targetedDuplicateValidRow.rowId, targetedDuplicateMalformedRow.rowId], 'valid and malformed duplicate rows must be independently enableable by row ID');
const targetedDuplicateBothEnabledProjection = projectManualState(targetedDuplicateBothEnabledState);
assert.deepEqual(targetedDuplicateBothEnabledProjection.input.enabledManualEntryIds, [], 'valid-malformed ambiguity must gate Session authority even when both local rows are enabled');
assert.equal(targetedDuplicateBothEnabledProjection.projection.activeKeepOuts.length, 0, 'valid-malformed ambiguity must issue no active keep-out');
const targetedMalformedToggledOffState = toggleX4UiManualCalibrationRow(targetedDuplicateBothEnabledState, targetedDuplicateMalformedRow.rowId);
const targetedValidToggledOffState = toggleX4UiManualCalibrationRow(targetedDuplicateBothEnabledState, targetedDuplicateValidRow.rowId);
assert.deepEqual(targetedMalformedToggledOffState.enabledManualRowIds, [targetedDuplicateValidRow.rowId], 'toggling malformed duplicate off must leave valid duplicate enabled');
assert.deepEqual(targetedValidToggledOffState.enabledManualRowIds, [targetedDuplicateMalformedRow.rowId], 'toggling valid duplicate off must leave malformed duplicate enabled');
const targetedDuplicateInput = buildX4UiManualCalibrationSessionInput(targetedDuplicateMalformedState);
const targetedDuplicateProjection = projectManualState(targetedDuplicateMalformedState).projection;
const targetedDuplicateRefusalReasons = targetedDuplicateMalformedState.rows.map(row =>
  targetedDuplicateInput.refusedRows.find(refusal => refusal.rowId === row.rowId)?.reason,
);
const targetedDuplicateRemovedState = removeX4UiManualCalibrationRow(
  targetedDuplicateMalformedState,
  targetedDuplicateMalformedState.rows[1]?.rowId ?? 'missing-row',
);
const targetedDuplicateRestored = projectManualState(targetedDuplicateRemovedState);
const targetedValidRemovedState = removeX4UiManualCalibrationRow(
  targetedDuplicateMalformedState,
  targetedDuplicateValidRow.rowId,
);
assert.deepEqual(targetedValidRemovedState.enabledManualRowIds, [], 'removing enabled valid duplicate must not transfer enablement to malformed sibling');
assert.equal(projectManualState(targetedValidRemovedState).projection.activeKeepOuts.length, 0, 'surviving disabled malformed row must remain inactive');
const targetedMalformedOnlyEnabledState = setX4UiManualCalibrationRowEnabled(
  setX4UiManualCalibrationRowEnabled(targetedDuplicateMalformedState, targetedDuplicateValidRow.rowId, false),
  targetedDuplicateMalformedRow.rowId,
  true,
);
const targetedMalformedOnlyAfterRemoveMalformed = projectManualState(removeX4UiManualCalibrationRow(
  targetedMalformedOnlyEnabledState,
  targetedDuplicateMalformedRow.rowId,
));
assert.deepEqual(targetedMalformedOnlyAfterRemoveMalformed.input.enabledManualEntryIds, [], 'surviving valid row must not inherit removed malformed sibling enablement');
assert.equal(targetedMalformedOnlyAfterRemoveMalformed.projection.activeKeepOuts.length, 0, 'surviving valid row must remain inactive when only removed malformed sibling was enabled');
const targetedBothAfterRemoveMalformed = projectManualState(removeX4UiManualCalibrationRow(
  targetedDuplicateBothEnabledState,
  targetedDuplicateMalformedRow.rowId,
));
assert.deepEqual(targetedBothAfterRemoveMalformed.input.enabledManualEntryIds, ['shared-local-id'], 'removing malformed duplicate must restore surviving valid row when that row itself was enabled');
assert.equal(targetedBothAfterRemoveMalformed.projection.activeKeepOuts.length, 1, 'enabled valid survivor must return exactly one active keep-out after ambiguity clears');

const targetedDifferentInvalidState = addX4UiManualCalibrationDraft({
  ...(() => {
    const state = addX4UiManualCalibrationDraft({ ...manualEmptyState, draft: makeManualCalibrationDraft('independent-valid-id') });
    return setX4UiManualCalibrationRowEnabled(state, state.rows[0]?.rowId ?? 'missing-row', true);
  })(),
  draft: updateX4UiManualCalibrationDraft(makeManualCalibrationDraft('independent-invalid-id'), 'drawableWidth', ''),
});
const targetedDifferentInvalid = projectManualState(targetedDifferentInvalidState);
const targetedBuiltInAndInvalidRemainRefused = invalidManualCases.every(([, draft]) => {
  const state = addX4UiManualCalibrationDraft({ ...manualEmptyState, draft });
  const prepared = setX4UiManualCalibrationRowEnabled(state, state.rows[0]?.rowId ?? 'missing-row', true);
  const projected = projectManualState(prepared).projection;
  return projected.manualCalibrations[0]?.status === 'refused' && projected.activeKeepOuts.length === 0;
});

const targetedDuplicateFailFirstRows: readonly (readonly [string, boolean])[] = [
  ['single valid enabled row remains one active keep-out', enabledSingleManual.projection.activeKeepOuts.length === 1],
  [
    'valid plus locally numeric-refused duplicate is refused at the component boundary',
    targetedDuplicateInput.enabledManualEntryIds.length === 0 &&
      targetedDuplicateProjection.activeKeepOuts.length === 0 &&
      targetedDuplicateRefusalReasons.every(reason => reason === 'duplicate-stable-id'),
  ],
  [
    'removing malformed duplicate restores prior explicit enablement and one active keep-out',
    targetedDuplicateRestored.input.enabledManualEntryIds.includes('shared-local-id') &&
      targetedDuplicateRestored.projection.activeKeepOuts.length === 1,
  ],
  [
    'different-ID local numeric refusal does not block valid enabled row',
    targetedDifferentInvalid.projection.activeKeepOuts.length === 1 &&
      targetedDifferentInvalid.input.refusedRows.some(refusal => refusal.reason === 'invalid-number'),
  ],
  ['built-in collision and existing invalid cases remain refused with no paint', targetedBuiltInAndInvalidRemainRefused],
  [
    'duplicate rows preserve distinct local row identity and independent remove controls',
    targetedDuplicateMalformedState.rows.length === 2 &&
      targetedDuplicateMalformedState.rows[0]?.rowId !== targetedDuplicateMalformedState.rows[1]?.rowId &&
      /x4-ui-manual-calibration-remove-\$\{row\.rowId\}/.test(sourceText),
  ],
];
const targetedDuplicateFailFirstMissing = targetedDuplicateFailFirstRows
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
assert.deepEqual(
  targetedDuplicateFailFirstMissing,
  [],
  `B119 8C.2 targeted duplicate-admission fail-first red assertions: ${targetedDuplicateFailFirstMissing.join(', ')}`,
);

for (const [label, draft, reason] of invalidManualCases) {
  const state = addX4UiManualCalibrationDraft({ ...manualEmptyState, draft });
  const prepared = setX4UiManualCalibrationRowEnabled(state, state.rows[0].rowId, true);
  const result = projectManualState(prepared).projection.manualCalibrations[0];
  assert.equal(result?.status, 'refused', `${label} must remain visible as a Session refusal`);
  assert.equal(result?.reason, reason, `${label} must preserve the exact Session refusal reason`);
  assert.equal(projectManualState(prepared).projection.activeKeepOuts.length, 0, `${label} must emit no manual Paint keep-out`);
}

const blankStableIdState = addX4UiManualCalibrationDraft(
  manualEmptyState,
  updateX4UiManualCalibrationDraft(validManualDraft, 'stableId', '   '),
);
const blankStableIdEnableAttempt = setX4UiManualCalibrationRowEnabled(blankStableIdState, blankStableIdState.rows[0].rowId, true);
assert.equal(blankStableIdEnableAttempt, blankStableIdState, 'blank stable-ID row enable request must be an identity-preserving no-op');
assert.deepEqual(projectManualState(blankStableIdEnableAttempt).input.enabledManualEntryIds, [], 'blank stable ID must never derive Session enablement authority');
assert.equal(projectManualState(blankStableIdEnableAttempt).projection.activeKeepOuts.length, 0, 'blank stable ID must never reach an active keep-out');

const editedIdentityFirstDraft = makeManualCalibrationDraft('edited-row-first');
const editedIdentitySecondDraft = makeManualCalibrationDraft('edited-row-second');
const editedIdentityFirstState = addX4UiManualCalibrationDraft(manualEmptyState, editedIdentityFirstDraft);
const editedIdentityTwoState = addX4UiManualCalibrationDraft(editedIdentityFirstState, editedIdentitySecondDraft);
const editedIdentityFirstRow = editedIdentityTwoState.rows[0];
const editedIdentitySecondRow = editedIdentityTwoState.rows[1];
const editedIdentityEnabledState = setX4UiManualCalibrationRowEnabled(editedIdentityTwoState, editedIdentityFirstRow.rowId, true);
const editedIdentityCollisionState = {
  ...editedIdentityEnabledState,
  rows: editedIdentityEnabledState.rows.map(row => row.rowId === editedIdentityFirstRow.rowId
    ? { ...row, draft: updateX4UiManualCalibrationDraft(row.draft, 'stableId', 'edited-row-second') }
    : row),
};
assert.deepEqual(editedIdentityCollisionState.enabledManualRowIds, [editedIdentityFirstRow.rowId], 'editing an enabled row stable ID must retain that row identity only');
assert.equal(editedIdentityCollisionState.enabledManualRowIds.includes(editedIdentitySecondRow.rowId), false, 'stable-ID collision edit must not merge enablement into sibling row');
assert.equal(editedIdentityTwoState.rows[0].draft.stableId, 'edited-row-first', 'stored-row stable-ID fixture edit must not mutate the prior row');
assert.deepEqual(projectManualState(editedIdentityCollisionState).input.enabledManualEntryIds, [], 'edited stable-ID collision must remain ambiguity-gated');
assert.equal(projectManualState(editedIdentityCollisionState).projection.activeKeepOuts.length, 0, 'edited stable-ID collision must paint nothing');
const editedIdentityRecoveredState = {
  ...editedIdentityCollisionState,
  rows: editedIdentityCollisionState.rows.map(row => row.rowId === editedIdentityFirstRow.rowId
    ? { ...row, draft: updateX4UiManualCalibrationDraft(row.draft, 'stableId', 'edited-row-third') }
    : row),
};
const editedIdentityRecovered = projectManualState(editedIdentityRecoveredState);
assert.deepEqual(editedIdentityRecovered.input.enabledManualEntryIds, ['edited-row-third'], 'clearing edited ambiguity must derive the enabled row current stable ID only');
assert.equal(editedIdentityRecovered.projection.activeKeepOuts.length, 1, 'enabled row must recover one active keep-out after its stable-ID ambiguity clears');

const viewportAt100 = projectManualState(setX4UiManualCalibrationRowEnabled(enabledSingleManualState, enabledSingleManualState.rows[0].rowId, true), { width: 100, height: 80, uiScale: 1 }).projection.manualCalibrations[0];
const viewportAt200 = projectManualState(setX4UiManualCalibrationRowEnabled(enabledSingleManualState, enabledSingleManualState.rows[0].rowId, true), { width: 200, height: 160, uiScale: 1 }).projection.manualCalibrations[0];
if (viewportAt100?.status !== 'success' || viewportAt200?.status !== 'success' || viewportAt100.projection?.status !== 'projected' || viewportAt200.projection?.status !== 'projected') throw new Error('viewport reproject fixture was not accepted');
assert.notDeepEqual(viewportAt100.projection.geometry, viewportAt200.projection.geometry, 'profile/viewport change must reproject the accepted polygon through Session');
const expectedManualEvidence = {
  source: 'manual-calibration',
  evidenceGrade: 'calibrated',
  sourceNote: 'operator screenshot calibration',
  screenshot: { hash: 'A'.repeat(64), profile: '2560x1440-ui-1.4' },
  drawableBounds: { left: 10, top: 20, width: 100, height: 80 },
};
assert.deepEqual(viewportAt100.evidence, expectedManualEvidence, 'viewport reproject must preserve exact screenshot and drawable-bound provenance');
assert.deepEqual(viewportAt200.evidence, expectedManualEvidence, 'viewport reproject must preserve exact evidence identity at the second viewport');
assert.deepEqual(viewportAt100.calibration.status === 'success' ? viewportAt100.calibration.entry.geometry.points : [], [{ x: 0.1, y: 0.125 }, { x: 0.9, y: 0.125 }, { x: 0.1, y: 0.75 }], 'Session must expose normalized polygon evidence');

type SourceEditParseResult =
  | { readonly accepted: true; readonly value: string | number | boolean }
  | { readonly accepted: false; readonly reason: string; readonly detail: string };

type SourceEditContextFixture = {
  readonly workspace: unknown;
  readonly source: unknown;
  readonly selection: unknown;
  readonly target: unknown;
  readonly program: unknown;
  readonly evidenceAuthority: unknown;
  readonly catalog: unknown;
  readonly profile: unknown;
};

type SourceEditReceiptFixture = {
  readonly status: 'pending' | 'accepted' | 'refused';
  readonly marker: string;
  readonly submission?: unknown;
};

type SourceEditDraftFixture = {
  readonly context: unknown;
  readonly staged: Readonly<Record<string, string>>;
  readonly receipt?: SourceEditReceiptFixture;
};

type SourceEditDraftUpdate = SourceEditDraftFixture | ((previous: SourceEditDraftFixture) => SourceEditDraftFixture);
type SourceEditDraftReconciler = (previous: SourceEditDraftFixture, current: unknown) => SourceEditDraftFixture;
type SourceEditContextFactory = (
  workspace: unknown,
  source: unknown,
  selection: unknown,
  target: unknown,
  program: unknown,
  evidenceAuthority: unknown,
  catalog: unknown,
  profile: unknown,
) => SourceEditContextFixture;

type SourceEditUiApi = {
  readonly discoverX4UiSourceEditorCatalog?: (workspace: unknown, projection: unknown) => unknown;
  readonly parseX4UiSourceEditInput?: (entry: unknown, raw: string) => SourceEditParseResult;
  readonly stageX4UiSourceEditInput?: (staged: Readonly<Record<string, string>>, entryId: string, raw: string) => Readonly<Record<string, string>>;
  readonly shouldClearX4UiSourceEditState?: (previous: unknown, current: unknown) => boolean;
  readonly createX4UiSourceEditContext?: SourceEditContextFactory;
  readonly createX4UiWorkspaceEditPending?: (expectedWorkspace: unknown, workspace: unknown) => {
    readonly submission: WorkspaceCommitSubmission;
    readonly acknowledge: (currentWorkspace: unknown) => WorkspaceCommitAcknowledgement;
  };
  readonly reconcileX4UiSourceEditDraftContext?: SourceEditDraftReconciler;
  readonly classifyX4UiWorkspaceCommit?: (current: unknown, expected: unknown, replacement: unknown) => unknown;
  readonly classifyX4UiWorkspaceEditReadback?: (current: unknown, submission: unknown, acknowledgement?: unknown) => unknown;
  readonly classifyX4UiWorkspaceEditAcknowledgement?: (current: unknown, submission: unknown, acknowledgement?: unknown) => unknown;
  readonly submitX4UiSourceEditWorkspaceCommit?: (
    expectedWorkspace: unknown,
    workspace: unknown,
    onWorkspaceEdit: ((request: { readonly expectedWorkspace: unknown; readonly workspace: unknown }) => WorkspaceCommitSubmission) | undefined,
  ) => WorkspaceCommitSubmission;
  readonly settleX4UiSourceEditReceipt?: (
    currentWorkspace: unknown,
    pendingReceipt: unknown,
    acknowledgement: unknown,
    currentContext: unknown,
  ) => WorkspaceCommitSubmission;
  readonly X4UiSourceEditorSourceEdits?: React.ComponentType<Record<string, unknown>>;
  readonly X4UiSourceEditorAddTextProperty?: React.ComponentType<Record<string, unknown>>;
};

type WorkspaceUpdater = (current: unknown) => unknown;
type WorkspaceCommitAcknowledgement = {
  readonly status?: string;
  readonly attempt?: unknown;
  readonly expectedWorkspace?: unknown;
  readonly workspace?: unknown;
  readonly currentWorkspace?: unknown;
  readonly reason?: string;
  readonly detail?: string;
};
type WorkspaceAcknowledger = (currentWorkspace: unknown) => WorkspaceCommitAcknowledgement;
type WorkspaceUpdateScheduler = (updater: WorkspaceUpdater, acknowledge?: WorkspaceAcknowledger) => void;
type WorkspaceCommitSubmission = {
  readonly status?: string;
  readonly accepted?: boolean;
  readonly changed?: boolean;
  readonly attempt?: unknown;
  readonly expectedWorkspace?: unknown;
  readonly workspace?: unknown;
  readonly acknowledgement?: Promise<WorkspaceCommitAcknowledgement>;
  readonly reason?: string;
  readonly detail?: string;
};
type UIBuilderCommitApi = {
  readonly beginX4UiWorkspaceCommit?: (
    renderedWorkspace: unknown,
    request: { readonly expectedWorkspace: unknown; readonly workspace: unknown },
    scheduleWorkspaceUpdate: WorkspaceUpdateScheduler,
  ) => WorkspaceCommitSubmission;
  readonly acknowledgeX4UiWorkspaceCommitBoundary?: (
    acknowledgements: ReadonlyArray<WorkspaceAcknowledger>,
    currentWorkspace: unknown,
  ) => ReadonlyArray<WorkspaceCommitAcknowledgement>;
};

const sourceEditUiApi = X4UiSourceEditorApiModule as unknown as SourceEditUiApi;
const uiBuilderCommitApi = UIBuilderApiModule as unknown as UIBuilderCommitApi;
const createSourceEditContext = sourceEditUiApi.createX4UiSourceEditContext;
const makeSourceEditContext = (context: SourceEditContextFixture): SourceEditContextFixture => (
  createSourceEditContext?.(
    context.workspace,
    context.source,
    context.selection,
    context.target,
    context.program,
    context.evidenceAuthority,
    context.catalog,
    context.profile,
  ) ?? context
);
const failFirstScalarEntry = {
  kind: 'editable',
  id: 'fail-first-number',
  path: 'ui/edit.lua',
  valueType: 'number',
  value: 1,
  expression: 'width',
  expectedText: '1',
  startOffset: 10,
  endOffset: 11,
  source: { file: 'ui/edit.lua', start: { line: 1, column: 10, offset: 10 }, end: { line: 1, column: 11, offset: 11 } },
  sourceLiteral: { file: 'ui/edit.lua', start: { line: 1, column: 10, offset: 10 }, end: { line: 1, column: 11, offset: 11 } },
  provenance: {
    sourceIdentity: { file: 'ui/edit.lua', sha256: 'a'.repeat(64) },
    targetId: 'target',
    targetSource: { file: 'ui/edit.lua', start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 20, offset: 20 } },
    operationId: 'operation',
    callName: 'addTable',
    callSource: { file: 'ui/edit.lua', start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 20, offset: 20 } },
    callOrder: 0,
    fields: ['semantics.properties.width'],
  },
} as const;
const failFirstLockedEntry = {
  kind: 'locked',
  id: 'fail-first-locked',
  path: 'ui/edit.lua',
  valueType: 'number',
  value: 2,
  expression: 'dynamicWidth',
  expectedText: 'dynamicWidth',
  startOffset: 30,
  endOffset: 42,
  source: { file: 'ui/edit.lua', start: { line: 2, column: 0, offset: 30 }, end: { line: 2, column: 12, offset: 42 } },
  sourceLiteral: { file: 'ui/edit.lua', start: { line: 2, column: 0, offset: 30 }, end: { line: 2, column: 12, offset: 42 } },
  field: 'semantics.properties.width',
  operationId: 'operation-dynamic',
  callName: 'addTable',
  reason: 'dynamic-value',
  detail: 'dynamic expression is not a direct source literal',
} as const;
const failFirstStringEntry = {
  ...failFirstScalarEntry,
  id: 'fail-first-string',
  valueType: 'string' as const,
  value: 'old',
  expression: 'label',
  expectedText: '"old"',
  quoteStyle: 'double' as const,
  provenance: { ...failFirstScalarEntry.provenance, callName: 'createText' as const, fields: ['semantics.text'] as const },
} as const;
const failFirstBooleanEntry = {
  ...failFirstScalarEntry,
  id: 'fail-first-boolean',
  valueType: 'boolean' as const,
  value: true,
  expression: 'scaling',
  expectedText: 'true',
  provenance: { ...failFirstScalarEntry.provenance, fields: ['semantics.properties.scaling'] as const },
} as const;
const failFirstCatalog = {
  status: 'ready',
  sourceIdentity: failFirstScalarEntry.provenance.sourceIdentity,
  target: {
    id: 'target',
    kind: 'top-level',
    source: failFirstScalarEntry.provenance.targetSource,
    sourceIdentity: failFirstScalarEntry.provenance.sourceIdentity,
  },
  sourcePath: 'ui/edit.lua',
  sourceText: 'local width = 1',
  entries: [failFirstScalarEntry, failFirstStringEntry, failFirstBooleanEntry, failFirstLockedEntry],
  editableEntries: [failFirstScalarEntry, failFirstStringEntry, failFirstBooleanEntry],
  lockedEntries: [failFirstLockedEntry],
  editable: true,
  detail: 'direct source literals are available for bounded CAS editing',
  verification: 'Not verified in game',
} as const;

const failFirstMissing7DAssertions = [
  ['projection-bound discovery API', typeof sourceEditUiApi.discoverX4UiSourceEditorCatalog === 'function'],
  ['strict scalar parse API', typeof sourceEditUiApi.parseX4UiSourceEditInput === 'function'],
  ['staged-input API', typeof sourceEditUiApi.stageX4UiSourceEditInput === 'function'],
  ['declared-drift clearing API', typeof sourceEditUiApi.shouldClearX4UiSourceEditState === 'function'],
  ['parent expected-workspace CAS API', typeof sourceEditUiApi.classifyX4UiWorkspaceCommit === 'function'],
  ['deterministic scalar control component', typeof sourceEditUiApi.X4UiSourceEditorSourceEdits === 'function'],
  ['source-safe controls heading', /Source-safe property controls/.test(sourceText)],
  ['owner discovery call', /discoverX4UiSourceEdits\(/.test(sourceText)],
  ['owner apply call', /applyX4UiSourceEdit\(/.test(sourceText)],
  ['exact current projection program/evidence', /projection\.preview\.program/.test(sourceText)],
  ['expected workspace submission', /expectedWorkspace/.test(sourceText)],
  ['parent CAS wiring', /onWorkspaceEdit/.test(uiBuilderText)],
  ['permanent game truth in source-edit UI', /Not verified in game/.test(sourceText)],
].filter(([, pass]) => !pass)
  .map(([name]) => name);
assert.deepEqual(failFirstMissing7DAssertions, [], `B119 7D fail-first red assertions: ${failFirstMissing7DAssertions.join(', ')}`);

const parseScalar = sourceEditUiApi.parseX4UiSourceEditInput;
if (!parseScalar) throw new Error('fail-first guard did not establish the scalar parser');
assert.deepEqual(parseScalar(failFirstScalarEntry, '7.5'), { accepted: true, value: 7.5 });
assert.deepEqual(parseScalar({ ...failFirstScalarEntry, valueType: 'string', value: 'old', expectedText: '"old"' }, 'new text'), { accepted: true, value: 'new text' });
assert.deepEqual(parseScalar({ ...failFirstScalarEntry, valueType: 'boolean', value: true, expectedText: 'true' }, 'false'), { accepted: true, value: false });
assert.equal(parseScalar(failFirstScalarEntry, '' ).accepted, false, 'blank number input must refuse before mutation');
assert.equal(parseScalar(failFirstScalarEntry, 'Infinity').accepted, false, 'nonfinite number input must refuse before mutation');
assert.equal(parseScalar({ ...failFirstScalarEntry, valueType: 'boolean' }, '1').accepted, false, 'type-mismatched boolean input must refuse');

const stageScalar = sourceEditUiApi.stageX4UiSourceEditInput;
if (!stageScalar) throw new Error('fail-first guard did not establish the staging helper');
const stagedScalar = stageScalar({}, failFirstScalarEntry.id, '7.5');
assert.deepEqual(stagedScalar, { [failFirstScalarEntry.id]: '7.5' });
assert.deepEqual({}, {}, 'staging is a local value operation and has no source mutation authority');

const clearOnDrift = sourceEditUiApi.shouldClearX4UiSourceEditState;
if (!clearOnDrift) throw new Error('fail-first guard did not establish drift clearing');
const sharedContextObject = {};
const stableSourceEditContext = makeSourceEditContext({
  workspace: sharedContextObject,
  source: sharedContextObject,
  selection: sharedContextObject,
  target: sharedContextObject,
  program: sharedContextObject,
  evidenceAuthority: sharedContextObject,
  catalog: sharedContextObject,
  profile: sharedContextObject,
});
assert.equal(clearOnDrift(stableSourceEditContext, stableSourceEditContext), false);
for (const driftKey of ['workspace', 'source', 'selection', 'target', 'program', 'evidenceAuthority', 'catalog', 'profile']) {
  const drifted = makeSourceEditContext({ ...stableSourceEditContext, [driftKey]: {} });
  assert.equal(clearOnDrift(stableSourceEditContext, drifted), true, `${driftKey} drift clears staged input and receipt`);
}

const classifyCommit = sourceEditUiApi.classifyX4UiWorkspaceCommit;
if (!classifyCommit) throw new Error('fail-first guard did not establish parent CAS');
const expectedWorkspace = {};
const replacementWorkspace = {};
const acceptedCommit = classifyCommit(expectedWorkspace, expectedWorkspace, replacementWorkspace) as { readonly accepted?: boolean };
const refusedCommit = classifyCommit({}, expectedWorkspace, replacementWorkspace) as { readonly accepted?: boolean; readonly reason?: string };
assert.equal(acceptedCommit.accepted, true);
assert.equal(refusedCommit.accepted, false);
assert.match(refusedCommit.reason || '', /stale|expected|current/i);

const compileRenderedUiBuilderCommit = (): NonNullable<UIBuilderCommitApi['beginX4UiWorkspaceCommit']> => {
  const startMarker = '  const commitX4UiSourceEditWorkspace = ';
  const endMarker = '\n  // Legacy pixel geometry summary';
  const startOffset = uiBuilderText.indexOf(startMarker);
  const endOffset = uiBuilderText.indexOf(endMarker, startOffset);
  if (startOffset < 0 || endOffset < 0) throw new Error('could not locate the actual UIBuilder source-edit commit callback');
  const callbackSource = uiBuilderText.slice(startOffset, endOffset);
  const compiled = transpileModule([
    'export default function createCommit(workspace, setWorkspace, classifyX4UiWorkspaceCommit) {',
    callbackSource,
    'return commitX4UiSourceEditWorkspace;',
    '}',
  ].join('\n'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const commonJsExports: Record<string, unknown> = {};
  const commonJsModule = { exports: commonJsExports };
  runInNewContext(compiled, { module: commonJsModule, exports: commonJsExports });
  const createCommit = (commonJsModule.exports as { readonly default?: unknown }).default;
  if (typeof createCommit !== 'function') throw new Error('could not compile the actual UIBuilder source-edit commit callback');
  return (renderedWorkspace, request, scheduleWorkspaceUpdate) => {
    const commit = createCommit(renderedWorkspace, scheduleWorkspaceUpdate, classifyCommit) as unknown;
    if (typeof commit !== 'function') throw new Error('actual UIBuilder source-edit commit callback was not callable');
    return commit(request) as WorkspaceCommitSubmission;
  };
};

const compileActualSourceEditApply = (
  environment: Readonly<Record<string, unknown>>,
): ((entryId: string, insertionWidget?: unknown, insertionText?: string, insertRow?: boolean, moveDirection?: string) => void) => {
  const startMarker = '  const applySourceEdit = ';
  const endMarker = '\n\n  const selectedTargetIdentity = ';
  const startOffset = sourceText.indexOf(startMarker);
  const endOffset = sourceText.indexOf(endMarker, startOffset);
  if (startOffset < 0 || endOffset < 0) throw new Error('could not locate the actual X4UiSourceEditor apply callback');
  const callbackSource = sourceText.slice(startOffset, endOffset);
  const compiled = transpileModule([
    'export default function createApply(environment) {',
    'const { sourceEditDraftMatches, refuseSourceEdit, sourceEditCatalog, currentProgram, currentEvidenceAuthority, sourceEditDraft, sourceEditContextRef, sourceEditDraftRef, parseX4UiSourceEditInput, applyX4UiSourceEdit, applyX4UiSourceStructuralEdit, applyX4UiSourceRowMove, applyX4UiSourceRowInsertion, applyX4UiSourceWidgetInsertion, sourceEditContext, projection, selectedBuilderNode, builderPresentation, contextualRowMove, builderSelectionRef: suppliedBuilderSelectionRef, onWorkspaceEdit, submitX4UiSourceEditWorkspaceCommit, setSourceEditDraft, settleX4UiSourceEditReceipt, X4_UI_EDITOR_SESSION_GAME_TRUTH } = environment;',
    'const builderSelectionRef = suppliedBuilderSelectionRef ?? { current: selectedBuilderNode === undefined ? null : { nodeId: selectedBuilderNode.id } };',
    'const contextualTextPropertyAdditions = environment.contextualTextPropertyAdditions ?? []; const applyX4UiSourceTextPropertyAddition = environment.applyX4UiSourceTextPropertyAddition;',
    'const previewEditTransitionRef = { current: null }; const currentWorkspaceScope = "callback-isolation"; const selectionEpochRef = { current: 0 };',
    'const inspectorScroll = environment.inspectorScroll ?? { begin: () => undefined, cancel: () => {} };',
    // These causal tests isolate the unchanged draft/receipt path; mounted tests exercise the transfer hook.
    'const submitSourceEditWithSelectionTransfer = (expected, replacement, continuation, splice) => submitX4UiSourceEditWorkspaceCommit(expected, replacement, onWorkspaceEdit, splice);',
    callbackSource,
    'return applySourceEdit;',
    '}',
  ].join('\n'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const commonJsExports: Record<string, unknown> = {};
  const commonJsModule = { exports: commonJsExports };
  runInNewContext(compiled, { module: commonJsModule, exports: commonJsExports });
  const createApply = (commonJsModule.exports as { readonly default?: unknown }).default;
  if (typeof createApply !== 'function') throw new Error('could not compile the actual X4UiSourceEditor apply callback');
  const apply = createApply(environment) as unknown;
  if (typeof apply !== 'function') throw new Error('actual X4UiSourceEditor apply callback was not callable');
  return apply as (entryId: string, insertionWidget?: unknown, insertionText?: string, insertRow?: boolean, moveDirection?: string) => void;
};

const compileActualSourceEditStage = (
  environment: Readonly<Record<string, unknown>>,
): ((entryId: string, raw: string) => void) => {
  const startMarker = '  const stageSourceEdit = ';
  const endMarker = '\n\n  const refuseSourceEdit = ';
  const startOffset = sourceText.indexOf(startMarker);
  const endOffset = sourceText.indexOf(endMarker, startOffset);
  if (startOffset < 0 || endOffset < 0) throw new Error('could not locate the actual X4UiSourceEditor stage callback');
  const callbackSource = sourceText.slice(startOffset, endOffset);
  const compiled = transpileModule([
    'export default function createStage(environment) {',
    'const { sourceEditContext, sourceEditContextRef, sourceEditDraftRef, setSourceEditDraft, stageX4UiSourceEditInput, shouldClearX4UiSourceEditState } = environment;',
    callbackSource,
    'return stageSourceEdit;',
    '}',
  ].join('\n'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const commonJsExports: Record<string, unknown> = {};
  const commonJsModule = { exports: commonJsExports };
  runInNewContext(compiled, { module: commonJsModule, exports: commonJsExports });
  const createStage = (commonJsModule.exports as { readonly default?: unknown }).default;
  if (typeof createStage !== 'function') throw new Error('could not compile the actual X4UiSourceEditor stage callback');
  const stage = createStage(environment) as unknown;
  if (typeof stage !== 'function') throw new Error('actual X4UiSourceEditor stage callback was not callable');
  return stage as (entryId: string, raw: string) => void;
};

const compileActualSourceEditContextEffect = (): ((environment: {
  readonly sourceEditDraftMatches: boolean;
  readonly sourceEditDraft: SourceEditDraftFixture;
  readonly sourceEditContext: SourceEditContextFixture;
  readonly sourceEditContextRef: { readonly current: SourceEditContextFixture | null };
  readonly setSourceEditDraft: (update: SourceEditDraftUpdate) => void;
  readonly reconcileX4UiSourceEditDraftContext?: SourceEditDraftReconciler;
}) => void) => {
  const contextMarker = '  const visibleSourceEditReceipt = ';
  const contextOffset = sourceText.indexOf(contextMarker);
  const startOffset = sourceText.indexOf('\n\n  useEffect(() => {', contextOffset);
  const endOffset = sourceText.indexOf('\n\n  useEffect(() => {', startOffset + 2);
  if (contextOffset < 0 || startOffset < 0 || endOffset < 0) {
    throw new Error('could not locate the actual X4UiSourceEditor draft-context effect');
  }
  const effectSource = sourceText.slice(startOffset, endOffset);
  const compiled = transpileModule([
    'export default function runEffect(environment) {',
    'const { sourceEditDraftMatches, sourceEditDraft, sourceEditContext, sourceEditContextRef, setSourceEditDraft, reconcileX4UiSourceEditDraftContext } = environment;',
    'const useEffect = effect => effect();',
    effectSource,
    '}',
  ].join('\n'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const commonJsExports: Record<string, unknown> = {};
  const commonJsModule = { exports: commonJsExports };
  runInNewContext(compiled, { module: commonJsModule, exports: commonJsExports });
  const runEffect = commonJsModule.exports.default;
  if (typeof runEffect !== 'function') throw new Error('actual X4UiSourceEditor draft-context effect was not callable');
  return environment => {
    runEffect(environment);
  };
};

const exportedBeginWorkspaceCommit = uiBuilderCommitApi.beginX4UiWorkspaceCommit;
const beginWorkspaceCommit = exportedBeginWorkspaceCommit ?? compileRenderedUiBuilderCommit();
const acknowledgeWorkspaceCommitBoundary = uiBuilderCommitApi.acknowledgeX4UiWorkspaceCommitBoundary;
const classifyWorkspaceReadback = sourceEditUiApi.classifyX4UiWorkspaceEditReadback;
const classifyWorkspaceAcknowledgement = sourceEditUiApi.classifyX4UiWorkspaceEditAcknowledgement;
const expectedWorkspaceE = { identity: 'expected-E' };
const replacementWorkspaceR = { identity: 'replacement-R' };
const newerWorkspaceN = { identity: 'newer-N' };
const sourceEditAuthorityIdentity = {
  source: {},
  selection: {},
  target: {},
  program: {},
  evidenceAuthority: {},
  catalog: {},
  profile: {},
};
const expectedSourceEditContextE = makeSourceEditContext({
  workspace: expectedWorkspaceE,
  ...sourceEditAuthorityIdentity,
});
const replacementSourceEditContextR = makeSourceEditContext({
  workspace: replacementWorkspaceR,
  ...sourceEditAuthorityIdentity,
});
const newerSourceEditContextN = makeSourceEditContext({
  workspace: newerWorkspaceN,
  ...sourceEditAuthorityIdentity,
});
const requestER = { expectedWorkspace: expectedWorkspaceE, workspace: replacementWorkspaceR };
let staleUpdater: WorkspaceUpdater | undefined;
let staleAcknowledger: WorkspaceAcknowledger | undefined;
const staleSubmission = beginWorkspaceCommit(expectedWorkspaceE, requestER, (updater, acknowledge) => {
  staleUpdater = updater;
  staleAcknowledger = acknowledge;
});
if (staleUpdater === undefined) throw new Error('actual UIBuilder protocol did not schedule a functional workspace update');
const delayedReadback = classifyWorkspaceAcknowledgement?.(expectedWorkspaceE, staleSubmission) as WorkspaceCommitSubmission | undefined;
const staleLiveWorkspace = staleUpdater(newerWorkspaceN);
const staleAcknowledgement = staleAcknowledger?.(staleLiveWorkspace);
const staleReadback = classifyWorkspaceAcknowledgement?.(staleLiveWorkspace, staleSubmission, staleAcknowledgement) as WorkspaceCommitSubmission | undefined;
const staleChildReceiptStatus = staleReadback?.status
  ?? (staleSubmission.accepted === true ? 'accepted' : staleSubmission.accepted === false ? 'refused' : staleSubmission.status);

let acceptedUpdater: WorkspaceUpdater | undefined;
let acceptedAcknowledger: WorkspaceAcknowledger | undefined;
const acceptedSubmission = beginWorkspaceCommit(expectedWorkspaceE, requestER, (updater, acknowledge) => {
  acceptedUpdater = updater;
  acceptedAcknowledger = acknowledge;
});
if (acceptedUpdater === undefined) throw new Error('actual UIBuilder protocol did not schedule the accepted functional workspace update');
const acceptedLiveWorkspace = acceptedUpdater(expectedWorkspaceE);
const acceptedAcknowledgement = acceptedAcknowledger?.(acceptedLiveWorkspace);
const acceptedReadback = classifyWorkspaceAcknowledgement?.(acceptedLiveWorkspace, acceptedSubmission, acceptedAcknowledgement) as WorkspaceCommitSubmission | undefined;
const acceptedChildReceiptStatus = acceptedReadback?.status
  ?? (acceptedSubmission.accepted === true ? 'accepted' : acceptedSubmission.accepted === false ? 'refused' : acceptedSubmission.status);

const causalWorkspaceCommitRows = [
  ['actual UIBuilder begin protocol is exported and exercised', typeof exportedBeginWorkspaceCommit === 'function' && /commitX4UiSourceEditWorkspace[\s\S]{0,500}beginX4UiWorkspaceCommit/.test(uiBuilderText) && /flushSync\([\s\S]{0,300}setWorkspaceCommitBoundary\(/.test(uiBuilderText)],
  ['actual child readback protocol is exported and exercised', typeof classifyWorkspaceAcknowledgement === 'function' && /classifyX4UiWorkspaceEditAcknowledgement\(/.test(sourceText)],
  ['submission remains pending before live readback', staleSubmission.status === 'pending' && staleSubmission.accepted !== true],
  ['delayed expected-workspace readback remains pending', delayedReadback?.status === 'pending'],
  ['live-current mismatch preserves the newer workspace object', staleLiveWorkspace === newerWorkspaceN],
  ['live-current mismatch settles as a typed refusal', staleReadback?.status === 'refused'],
  ['live-current mismatch reports stale-parent-workspace', staleReadback?.reason === 'stale-parent-workspace'],
  ['live-current mismatch never yields an accepted child receipt', staleChildReceiptStatus !== 'accepted'],
  ['exact expected live state commits the exact replacement object', acceptedLiveWorkspace === replacementWorkspaceR],
  ['only exact replacement readback yields accepted child receipt', acceptedChildReceiptStatus === 'accepted'],
] as const;
const causalWorkspaceCommitFailures = causalWorkspaceCommitRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(causalWorkspaceCommitFailures, [], `B119 7D causal parent-CAS red assertions: ${causalWorkspaceCommitFailures.join(', ')}`);

const submitSourceEditWorkspaceCommit = sourceEditUiApi.submitX4UiSourceEditWorkspaceCommit;
const settleSourceEditReceipt = sourceEditUiApi.settleX4UiSourceEditReceipt;
let noOpChildParentCalls = 0;
let noOpChildUpdater: WorkspaceUpdater | undefined;
const noOpChildParent = (request: { readonly expectedWorkspace: unknown; readonly workspace: unknown }): WorkspaceCommitSubmission => {
  noOpChildParentCalls += 1;
  return beginWorkspaceCommit(expectedWorkspaceE, request, updater => {
    noOpChildUpdater = updater;
  });
};
let noOpChildSubmission: WorkspaceCommitSubmission | undefined;
let noOpChildDraft: unknown;
if (submitSourceEditWorkspaceCommit !== undefined) {
  noOpChildSubmission = submitSourceEditWorkspaceCommit(
    expectedWorkspaceE,
    expectedWorkspaceE,
    noOpChildParent,
  );
  noOpChildDraft = { receipt: { status: noOpChildSubmission.status } };
} else {
  const noOpSourceEditContext = { ...stableSourceEditContext, workspace: expectedWorkspaceE };
  const applyNoOp = compileActualSourceEditApply({
    sourceEditDraftMatches: true,
    refuseSourceEdit: (reason: string, detail: string) => {
      noOpChildDraft = { context: noOpSourceEditContext, staged: {}, receipt: { status: 'refused', reason, detail } };
    },
    sourceEditCatalog: failFirstCatalog,
    currentProgram: {},
    currentEvidenceAuthority: {},
    sourceEditDraft: { context: noOpSourceEditContext, staged: { [failFirstScalarEntry.id]: '1' } },
    parseX4UiSourceEditInput: sourceEditUiApi.parseX4UiSourceEditInput,
    applyX4UiSourceEdit: () => ({
      accepted: true,
      changed: false,
      workspace: expectedWorkspaceE,
      path: failFirstScalarEntry.path,
      startOffset: failFirstScalarEntry.startOffset,
      endOffset: failFirstScalarEntry.endOffset,
    }),
    sourceEditContext: noOpSourceEditContext,
    projection: { source: {} },
    onWorkspaceEdit: noOpChildParent,
    setSourceEditDraft: (next: unknown) => {
      noOpChildDraft = next;
    },
    X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
  });
  applyNoOp(failFirstScalarEntry.id);
}
const noOpChildReceipt = (noOpChildDraft as { readonly receipt?: WorkspaceCommitSubmission } | undefined)?.receipt;

let delayedNoOpUpdater: WorkspaceUpdater | undefined;
let delayedNoOpAcknowledger: WorkspaceAcknowledger | undefined;
const delayedNoOpSubmission = beginWorkspaceCommit(
  expectedWorkspaceE,
  { expectedWorkspace: expectedWorkspaceE, workspace: expectedWorkspaceE },
  (updater, acknowledge) => {
    delayedNoOpUpdater = updater;
    delayedNoOpAcknowledger = acknowledge;
  },
);
if (delayedNoOpUpdater === undefined) throw new Error('actual UIBuilder protocol did not schedule the delayed no-op updater');
const classifyNoOp = (
  currentWorkspace: unknown,
  submission: WorkspaceCommitSubmission,
  acknowledgement?: WorkspaceCommitAcknowledgement,
): WorkspaceCommitSubmission => (
  (classifyWorkspaceAcknowledgement?.(currentWorkspace, submission, acknowledgement)
    ?? classifyWorkspaceReadback?.(currentWorkspace, submission)) as WorkspaceCommitSubmission
);
const delayedNoOpBeforeUpdater = classifyNoOp(expectedWorkspaceE, delayedNoOpSubmission);
const delayedNoOpStaleWorkspace = delayedNoOpUpdater(newerWorkspaceN);
const delayedNoOpStaleAcknowledgement = delayedNoOpAcknowledger?.(delayedNoOpStaleWorkspace);
const delayedNoOpStaleSettlement = classifyNoOp(
  delayedNoOpStaleWorkspace,
  delayedNoOpSubmission,
  delayedNoOpStaleAcknowledgement,
);
const delayedNoOpPendingReceipt = {
  status: 'pending',
  submission: delayedNoOpSubmission,
  context: expectedSourceEditContextE,
  changed: false,
  detail: delayedNoOpSubmission.detail,
  acceptedDetail: 'acknowledged owner no-op',
};
const delayedNoOpChildBeforeAcknowledgement = settleSourceEditReceipt?.(
  expectedWorkspaceE,
  delayedNoOpPendingReceipt,
  undefined,
  expectedSourceEditContextE,
);
const delayedNoOpStaleChildReceipt = settleSourceEditReceipt?.(
  delayedNoOpStaleWorkspace,
  delayedNoOpPendingReceipt,
  delayedNoOpStaleAcknowledgement,
  newerSourceEditContextN,
);

let acceptedNoOpUpdater: WorkspaceUpdater | undefined;
let acceptedNoOpAcknowledger: WorkspaceAcknowledger | undefined;
const acceptedNoOpSubmission = beginWorkspaceCommit(
  expectedWorkspaceE,
  { expectedWorkspace: expectedWorkspaceE, workspace: expectedWorkspaceE },
  (updater, acknowledge) => {
    acceptedNoOpUpdater = updater;
    acceptedNoOpAcknowledger = acknowledge;
  },
);
if (acceptedNoOpUpdater === undefined) throw new Error('actual UIBuilder protocol did not schedule the accepted no-op updater');
const acceptedNoOpBeforeUpdater = classifyNoOp(expectedWorkspaceE, acceptedNoOpSubmission);
const acceptedNoOpWorkspace = acceptedNoOpUpdater(expectedWorkspaceE);
const acceptedNoOpAcknowledgement = acceptedNoOpAcknowledger?.(acceptedNoOpWorkspace);
const acceptedNoOpSettlement = classifyNoOp(
  acceptedNoOpWorkspace,
  acceptedNoOpSubmission,
  acceptedNoOpAcknowledgement,
);
const acceptedNoOpPendingReceipt = {
  status: 'pending',
  submission: acceptedNoOpSubmission,
  context: expectedSourceEditContextE,
  changed: false,
  detail: acceptedNoOpSubmission.detail,
  acceptedDetail: 'acknowledged owner no-op',
};
const acceptedNoOpChildReceipt = settleSourceEditReceipt?.(
  acceptedNoOpWorkspace,
  acceptedNoOpPendingReceipt,
  acceptedNoOpAcknowledgement,
  expectedSourceEditContextE,
);
const staleAcceptedNoOpSettlement = classifyNoOp(
  newerWorkspaceN,
  acceptedNoOpSubmission,
  acceptedNoOpAcknowledgement,
);
const clonedNoOpAcknowledgement = acceptedNoOpAcknowledgement === undefined
  ? undefined
  : { ...acceptedNoOpAcknowledgement };
const forgedNoOpAcknowledgement: WorkspaceCommitAcknowledgement = {
  status: 'accepted',
  attempt: acceptedNoOpSubmission.attempt,
  expectedWorkspace: expectedWorkspaceE,
  workspace: expectedWorkspaceE,
  currentWorkspace: expectedWorkspaceE,
  detail: 'caller-forged acknowledgement',
};
const clonedNoOpSettlement = classifyNoOp(acceptedNoOpWorkspace, acceptedNoOpSubmission, clonedNoOpAcknowledgement);
const crossedNoOpSettlement = classifyNoOp(acceptedNoOpWorkspace, acceptedNoOpSubmission, delayedNoOpStaleAcknowledgement);
const forgedNoOpSettlement = classifyNoOp(acceptedNoOpWorkspace, acceptedNoOpSubmission, forgedNoOpAcknowledgement);
const clonedNoOpSubmission = { ...acceptedNoOpSubmission };
const clonedNoOpSubmissionSettlement = classifyNoOp(
  acceptedNoOpWorkspace,
  clonedNoOpSubmission,
  acceptedNoOpAcknowledgement,
);

let committedBoundaryNoOpUpdater: WorkspaceUpdater | undefined;
let committedBoundaryNoOpAcknowledger: WorkspaceAcknowledger | undefined;
const committedBoundaryNoOpSubmission = beginWorkspaceCommit(
  expectedWorkspaceE,
  { expectedWorkspace: expectedWorkspaceE, workspace: expectedWorkspaceE },
  (updater, acknowledge) => {
    committedBoundaryNoOpUpdater = updater;
    committedBoundaryNoOpAcknowledger = acknowledge;
  },
);
if (committedBoundaryNoOpUpdater === undefined) throw new Error('actual UIBuilder protocol did not schedule the committed-boundary no-op updater');
const committedBoundaryBeforeUpdater = classifyNoOp(expectedWorkspaceE, committedBoundaryNoOpSubmission);
const committedBoundaryLiveWorkspace = committedBoundaryNoOpUpdater(newerWorkspaceN);
const committedBoundaryAcknowledgements = acknowledgeWorkspaceCommitBoundary !== undefined
  && committedBoundaryNoOpAcknowledger !== undefined
  ? acknowledgeWorkspaceCommitBoundary([committedBoundaryNoOpAcknowledger], committedBoundaryLiveWorkspace)
  : [];
const committedBoundaryAcknowledgement = committedBoundaryAcknowledgements[0];
const committedBoundarySettlement = classifyNoOp(
  committedBoundaryLiveWorkspace,
  committedBoundaryNoOpSubmission,
  committedBoundaryAcknowledgement,
);

const causalNoOpAcknowledgementRows = [
  ['actual child no-op path uses the unified parent submission protocol', typeof submitSourceEditWorkspaceCommit === 'function'
    && /const parentResult = submitSourceEditWithSelectionTransfer\(/.test(sourceText)
    && /if \(expectedWorkspace === replacement\) return submitX4UiSourceEditWorkspaceCommit\(expectedWorkspace, replacement, live\.onWorkspaceEdit\)/.test(sourceText)],
  ['actual child receipt settlement protocol is exported and wired', typeof settleSourceEditReceipt === 'function' && /settleX4UiSourceEditReceipt\(/.test(sourceText)],
  ['changed and no-op owner successes share one parent submission branch', !/if \(!result\.changed\)/.test(sourceText)],
  ['owner accepted changed-false calls the actual parent once', noOpChildParentCalls === 1],
  ['owner accepted changed-false remains pending before acknowledgement', noOpChildSubmission?.status === 'pending' && noOpChildReceipt?.status !== 'accepted'],
  ['owner accepted changed-false schedules the actual parent updater', typeof noOpChildUpdater === 'function'],
  ['unchanged E before updater or acknowledgement remains pending', delayedNoOpBeforeUpdater.status === 'pending'],
  ['actual child receipt remains pending while acknowledgement is omitted', delayedNoOpChildBeforeAcknowledgement?.status === 'pending'],
  ['stale live parent N is preserved by the delayed no-op updater', delayedNoOpStaleWorkspace === newerWorkspaceN],
  ['stale no-op receives an actual parent-issued acknowledgement', delayedNoOpStaleAcknowledgement !== undefined],
  ['stale no-op acknowledgement settles as typed refusal', delayedNoOpStaleSettlement.status === 'refused' && delayedNoOpStaleSettlement.reason === 'stale-parent-workspace'],
  ['stale no-op final child receipt is typed stale-parent-workspace', delayedNoOpStaleChildReceipt?.status === 'refused' && delayedNoOpStaleChildReceipt.reason === 'stale-parent-workspace'],
  ['exact no-op E remains pending until its updater executes', acceptedNoOpBeforeUpdater.status === 'pending'],
  ['exact no-op updater preserves exact E', acceptedNoOpWorkspace === expectedWorkspaceE],
  ['exact no-op accepts only after exact parent-issued acknowledgement', acceptedNoOpAcknowledgement !== undefined && acceptedNoOpSettlement.status === 'accepted'],
  ['exact acknowledgement retains attempt and workspace identities', acceptedNoOpAcknowledgement?.attempt === acceptedNoOpSubmission.attempt && acceptedNoOpAcknowledgement.expectedWorkspace === expectedWorkspaceE && acceptedNoOpAcknowledgement.workspace === expectedWorkspaceE && acceptedNoOpAcknowledgement.currentWorkspace === expectedWorkspaceE],
  ['acknowledged exact no-op becomes Accepted no-op in the actual child protocol', acceptedNoOpChildReceipt?.status === 'accepted' && acceptedNoOpChildReceipt.changed === false],
  ['previously accepted acknowledgement becomes stale after current workspace drift', staleAcceptedNoOpSettlement.status !== 'accepted'],
  ['cloned acknowledgement never becomes accepted', clonedNoOpSettlement.status !== 'accepted'],
  ['crossed acknowledgement never becomes accepted', crossedNoOpSettlement.status !== 'accepted'],
  ['forged acknowledgement never becomes accepted', forgedNoOpSettlement.status !== 'accepted'],
  ['cloned pending submission never becomes accepted', clonedNoOpSubmissionSettlement.status !== 'accepted'],
  ['actual committed-workspace acknowledgement boundary is exported and exercised', typeof acknowledgeWorkspaceCommitBoundary === 'function'],
  ['committed-boundary no-op remains pending before its updater and acknowledgement', committedBoundaryBeforeUpdater.status === 'pending'],
  ['committed-boundary stale updater preserves newer N', committedBoundaryLiveWorkspace === newerWorkspaceN],
  ['committed-boundary readback issues exactly one acknowledgement for the queued attempt', committedBoundaryAcknowledgements.length === 1],
  ['committed-boundary stale no-op settles as typed stale-parent-workspace', committedBoundarySettlement.status === 'refused' && committedBoundarySettlement.reason === 'stale-parent-workspace'],
  ['actual UIBuilder queues acknowledgement and forces a committed readback render', /pendingWorkspaceAcknowledgementsRef\.current\s*=\s*\[[\s\S]{0,300}setWorkspaceCommitBoundary\(/.test(uiBuilderText) && /useLayoutEffect\([\s\S]{0,500}acknowledgeX4UiWorkspaceCommitBoundary\([\s\S]{0,200}workspace/.test(uiBuilderText)],
  ['actual UIBuilder never acknowledges from a potentially stale post-updater ref', !/acknowledge\(workspaceRef\.current\)/.test(uiBuilderText)],
] as const;
const causalNoOpAcknowledgementFailures = causalNoOpAcknowledgementRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(causalNoOpAcknowledgementFailures, [], `B119 7D no-op acknowledgement red assertions: ${causalNoOpAcknowledgementFailures.join(', ')}`);

const reconcileSourceEditDraftContext = sourceEditUiApi.reconcileX4UiSourceEditDraftContext;
const passiveEffectAuthority = {
  workspace: {},
  source: {},
  selection: {},
  target: {},
  program: {},
  evidenceAuthority: {},
  catalog: {},
  profile: {},
};
const passiveEffectContextE = makeSourceEditContext({
  workspace: {},
  source: {},
  selection: {},
  target: {},
  program: {},
  evidenceAuthority: {},
  catalog: {},
  profile: {},
});
const passiveEffectContextR = makeSourceEditContext({ ...passiveEffectAuthority });
const passiveEffectEquivalentContextR = makeSourceEditContext({ ...passiveEffectAuthority });
const oldDraftE: SourceEditDraftFixture = {
  context: passiveEffectContextE,
  staged: Object.freeze({ field: 'old' }),
};
const pendingReceiptFixture: SourceEditReceiptFixture = Object.freeze({ status: 'pending', marker: 'newer-pending-R' });
const acceptedReceiptFixture: SourceEditReceiptFixture = Object.freeze({ status: 'accepted', marker: 'accepted-R' });
const refusedReceiptFixture: SourceEditReceiptFixture = Object.freeze({ status: 'refused', marker: 'refused-R' });
const newerPendingDraftR: SourceEditDraftFixture = Object.freeze({
  context: passiveEffectContextR,
  staged: Object.freeze({}),
  receipt: pendingReceiptFixture,
});
let liveDraftAfterScheduledEffect = newerPendingDraftR;
let functionalDraftUpdates = 0;
let objectDraftUpdates = 0;
const runActualContextEffect = compileActualSourceEditContextEffect();
runActualContextEffect({
  sourceEditDraftMatches: false,
  sourceEditDraft: oldDraftE,
  sourceEditContext: passiveEffectContextR,
  sourceEditContextRef: { current: passiveEffectContextR },
  setSourceEditDraft: update => {
    if (typeof update === 'function') {
      functionalDraftUpdates += 1;
      liveDraftAfterScheduledEffect = update(liveDraftAfterScheduledEffect);
    } else {
      objectDraftUpdates += 1;
      liveDraftAfterScheduledEffect = update;
    }
  },
  reconcileX4UiSourceEditDraftContext: reconcileSourceEditDraftContext,
});

const exactAcceptedDraftR: SourceEditDraftFixture = Object.freeze({
  context: passiveEffectContextR,
  staged: Object.freeze({ field: 'accepted-staged' }),
  receipt: acceptedReceiptFixture,
});
const exactRefusedDraftR: SourceEditDraftFixture = Object.freeze({
  context: passiveEffectContextR,
  staged: Object.freeze({ field: 'refused-staged' }),
  receipt: refusedReceiptFixture,
});
const exactAcceptedReconciled = reconcileSourceEditDraftContext?.(exactAcceptedDraftR, passiveEffectContextR);
const exactRefusedReconciled = reconcileSourceEditDraftContext?.(exactRefusedDraftR, passiveEffectContextR);

const equivalentReceipts = [pendingReceiptFixture, acceptedReceiptFixture, refusedReceiptFixture] as const;
const equivalentReconciliations = equivalentReceipts.map(receipt => {
  const staged = Object.freeze({ field: `${receipt.status}-staged` });
  const previous: SourceEditDraftFixture = Object.freeze({
    context: passiveEffectEquivalentContextR,
    staged,
    receipt,
  });
  const reconciled = reconcileSourceEditDraftContext?.(previous, passiveEffectContextR);
  return reconciled?.context === passiveEffectContextR
    && reconciled.staged === staged
    && reconciled.receipt === receipt;
});

const passiveEffectDriftKeys = ['workspace', 'source', 'selection', 'target', 'program', 'evidenceAuthority', 'catalog', 'profile'] as const;
const driftReconciliations = passiveEffectDriftKeys.map(key => {
  const driftedContext = makeSourceEditContext({ ...passiveEffectContextR, [key]: {} });
  const previous: SourceEditDraftFixture = {
    context: driftedContext,
    staged: Object.freeze({ field: 'must-clear' }),
    receipt: acceptedReceiptFixture,
  };
  const reconciled = reconcileSourceEditDraftContext?.(previous, passiveEffectContextR);
  return reconciled?.context === passiveEffectContextR
    && Object.keys(reconciled.staged).length === 0
    && reconciled.receipt === undefined;
});

const passiveEffectReconciliationRows = [
  ['execution-time draft-context reconciliation owner is exported', typeof reconcileSourceEditDraftContext === 'function'],
  ['actual scheduled context effect performs a functional execution-time update', functionalDraftUpdates === 1],
  ['actual scheduled context effect never performs a stale object replacement', objectDraftUpdates === 0],
  ['old-E effect executed after newer pending-R preserves the exact newer draft object', liveDraftAfterScheduledEffect === newerPendingDraftR],
  ['exact-current accepted receipt preserves the exact previous draft object', exactAcceptedReconciled === exactAcceptedDraftR],
  ['exact-current refused receipt preserves the exact previous draft object', exactRefusedReconciled === exactRefusedDraftR],
  ['equivalent current authority preserves staged and pending/accepted/refused receipts while adopting current context identity', equivalentReconciliations.every(Boolean)],
  ['real authority drift clears staged values and every receipt state across all eight context fields', driftReconciliations.every(Boolean)],
] as const;
const passiveEffectReconciliationFailures = passiveEffectReconciliationRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(passiveEffectReconciliationFailures, [], `B119 7D passive-effect reconciliation red assertions: ${passiveEffectReconciliationFailures.join(', ')}`);

const findingOneControlRows = [
  functionalDraftUpdates === 1,
  objectDraftUpdates === 0,
  liveDraftAfterScheduledEffect === newerPendingDraftR,
  reconcileSourceEditDraftContext?.(newerPendingDraftR, passiveEffectContextR) === newerPendingDraftR,
];
assert.equal(findingOneControlRows.every(Boolean), true, 'audit finding 1 control must preserve pending R when closure and ref are both R');
console.log('X4UiSourceEditor audit finding 1 control: closure R / ref R / live pending R PASS 4/4');

let staleClosureLiveDraft = newerPendingDraftR;
let staleClosureFunctionalUpdates = 0;
let staleClosureObjectUpdates = 0;
runActualContextEffect({
  sourceEditDraftMatches: true,
  sourceEditDraft: oldDraftE,
  sourceEditContext: passiveEffectContextE,
  sourceEditContextRef: { current: passiveEffectContextR },
  setSourceEditDraft: update => {
    if (typeof update === 'function') {
      staleClosureFunctionalUpdates += 1;
      staleClosureLiveDraft = update(staleClosureLiveDraft);
    } else {
      staleClosureObjectUpdates += 1;
      staleClosureLiveDraft = update;
    }
  },
  reconcileX4UiSourceEditDraftContext: reconcileSourceEditDraftContext,
});

type CausalRow = readonly [string, boolean];
type HostileContextProbe = {
  readonly clear: boolean | undefined;
  readonly reconciled: SourceEditDraftFixture | undefined;
  readonly threw: boolean;
};
const probeHostilePreviousContext = (candidate: unknown): HostileContextProbe => {
  let clear: boolean | undefined;
  let reconciled: SourceEditDraftFixture | undefined;
  let threw = false;
  try {
    clear = clearOnDrift(candidate, passiveEffectContextR);
    reconciled = reconcileSourceEditDraftContext?.({
      context: candidate,
      staged: Object.freeze({ field: 'must-clear' }),
      receipt: acceptedReceiptFixture,
    }, passiveEffectContextR);
  } catch {
    threw = true;
  }
  return { clear, reconciled, threw };
};
const probeHostileCurrentContext = (candidate: unknown): HostileContextProbe => {
  let clear: boolean | undefined;
  let reconciled: SourceEditDraftFixture | undefined;
  let threw = false;
  try {
    clear = clearOnDrift(passiveEffectContextR, candidate);
    reconciled = reconcileSourceEditDraftContext?.({
      context: passiveEffectContextR,
      staged: Object.freeze({ field: 'must-clear' }),
      receipt: acceptedReceiptFixture,
    }, candidate);
  } catch {
    threw = true;
  }
  return { clear, reconciled, threw };
};
const hostileProbeCleared = (probe: HostileContextProbe, current: unknown): boolean => (
  !probe.threw
  && probe.clear === true
  && probe.reconciled?.context === current
  && Object.keys(probe.reconciled.staged).length === 0
  && probe.reconciled.receipt === undefined
);

let accessorContextReads = 0;
const accessorContext: object = {};
for (const key of passiveEffectDriftKeys) {
  Object.defineProperty(accessorContext, key, {
    configurable: true,
    enumerable: true,
    get: () => {
      accessorContextReads += 1;
      return passiveEffectContextR[key];
    },
  });
}
const accessorContextProbe = probeHostilePreviousContext(accessorContext);

const hostileContextSymbol = Symbol('hostile-context');
const symbolContext = { ...passiveEffectAuthority, [hostileContextSymbol]: true };
const symbolContextProbe = probeHostilePreviousContext(symbolContext);

const customPrototypeContext: Record<string, unknown> = Object.create(Object.freeze({ hostile: true }));
for (const key of passiveEffectDriftKeys) customPrototypeContext[key] = passiveEffectContextR[key];
const customPrototypeContextProbe = probeHostilePreviousContext(customPrototypeContext);

let proxyContextReads = 0;
const proxyContext = new Proxy({ ...passiveEffectAuthority }, {
  get: (target, property, receiver) => {
    proxyContextReads += 1;
    return Reflect.get(target, property, receiver);
  },
});
const proxyPreviousContextProbe = probeHostilePreviousContext(proxyContext);
const proxyCurrentContextProbe = probeHostileCurrentContext(proxyContext);

const fullContextDriftKeys = ['workspace', 'source', 'selection', 'target', 'program', 'evidenceAuthority', 'catalog', 'profile'] as const;
const changedPendingReceipt = {
  status: 'pending',
  submission: acceptedSubmission,
  context: replacementSourceEditContextR,
  changed: true,
  detail: acceptedSubmission.detail,
  acceptedDetail: 'acknowledged owner source change',
};
const exactNoOpContextSettlement = settleSourceEditReceipt?.(
  expectedWorkspaceE,
  acceptedNoOpPendingReceipt,
  acceptedNoOpAcknowledgement,
  expectedSourceEditContextE,
);
const exactChangedContextSettlement = settleSourceEditReceipt?.(
  replacementWorkspaceR,
  changedPendingReceipt,
  acceptedAcknowledgement,
  replacementSourceEditContextR,
);
const contextDriftRows = (
  label: 'no-op' | 'changed',
  baseContext: SourceEditContextFixture,
  pendingReceipt: unknown,
  acknowledgement: WorkspaceCommitAcknowledgement | undefined,
): ReadonlyArray<CausalRow> => fullContextDriftKeys.map(key => {
  const driftedContext = makeSourceEditContext({ ...baseContext, [key]: {} });
  const settlement = settleSourceEditReceipt?.(
    driftedContext.workspace,
    pendingReceipt,
    acknowledgement,
    driftedContext,
  );
  return [
    `${label} acknowledgement after ${key} drift refuses with typed stale context`,
    settlement?.status === 'refused'
      && (settlement.reason === 'stale-editor-context' || settlement.reason === 'stale-parent-workspace'),
  ] as const;
});
const round4PreRenderRows: ReadonlyArray<CausalRow> = [
  ['stale closure E with execution-time ref R preserves exact newer pending R', staleClosureFunctionalUpdates === 1 && staleClosureObjectUpdates === 0 && staleClosureLiveDraft === newerPendingDraftR],
  ['exact unchanged no-op context still accepts exact parent acknowledgement', exactNoOpContextSettlement?.status === 'accepted'],
  ['exact post-commit changed context R still accepts exact parent acknowledgement', exactChangedContextSettlement?.status === 'accepted'],
  ...contextDriftRows('no-op', expectedSourceEditContextE, acceptedNoOpPendingReceipt, acceptedNoOpAcknowledgement),
  ...contextDriftRows('changed', replacementSourceEditContextR, changedPendingReceipt, acceptedAcknowledgement),
  ['owner-issued plain source-edit context factory is exported', typeof createSourceEditContext === 'function'],
  ['accessor context clears without throw or getter reads', hostileProbeCleared(accessorContextProbe, passiveEffectContextR) && accessorContextReads === 0],
  ['symbol-decorated context clears without traversal', hostileProbeCleared(symbolContextProbe, passiveEffectContextR)],
  ['custom-prototype context clears without traversal', hostileProbeCleared(customPrototypeContextProbe, passiveEffectContextR)],
  ['proxy contexts clear in both positions without get-trap reads', hostileProbeCleared(proxyPreviousContextProbe, passiveEffectContextR) && hostileProbeCleared(proxyCurrentContextProbe, proxyContext) && proxyContextReads === 0],
];

const renderSourceEditControls = sourceEditUiApi.X4UiSourceEditorSourceEdits;
const addTextPropertyControl = sourceEditUiApi.X4UiSourceEditorAddTextProperty;
assert.equal(typeof addTextPropertyControl, 'function');
if (!addTextPropertyControl) throw new Error('missing typed property control');
const propertyChoiceMarkup = (pending: boolean, staged: Record<string, string> = {}) => renderToStaticMarkup(React.createElement(addTextPropertyControl, {
  additions: [{ id: 'private-operation-halign', operationId: 'private-operation', property: 'halign', valueType: 'string', callName: 'createText' },
    { id: 'private-operation-fontsize', operationId: 'private-operation', property: 'fontsize', valueType: 'number', callName: 'createText' },
    { id: 'secondary-halign', operationId: 'secondary', property: 'halign', valueType: 'string', callName: 'setText2' }],
  staged, pending, onStage: () => undefined, onApply: () => undefined,
}));
assert.match(propertyChoiceMarkup(false), /Choose a property/);
assert.match(propertyChoiceMarkup(false), />Alignment</);
assert.match(propertyChoiceMarkup(false), />Font size</);
assert.match(propertyChoiceMarkup(false), />Secondary text: Alignment</);
assert.match(propertyChoiceMarkup(false), /<button[^>]*disabled=""[^>]*>Add property/);
assert.match(propertyChoiceMarkup(true), /<select[^>]*disabled=""/);
assert.match(propertyChoiceMarkup(false, { 'other-entry': 'draft' }), /Apply or discard the current property changes first/);
assert.match(propertyChoiceMarkup(false, { 'other-entry': 'draft' }), /<select[^>]*disabled=""/);
if (!renderSourceEditControls) throw new Error('fail-first guard did not establish source-edit controls');
const sourceEditControlsMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: failFirstCatalog,
  staged: { [failFirstScalarEntry.id]: '7.5' },
  receipt: undefined,
  onStage: () => undefined,
  onApply: () => undefined,
}));
assert.match(sourceEditControlsMarkup, /Source-safe property controls/);
assert.match(sourceEditControlsMarkup, /ui\/edit\.lua/);
assert.match(sourceEditControlsMarkup, /addTable/);
assert.match(sourceEditControlsMarkup, /width/);
assert.match(sourceEditControlsMarkup, /dynamic expression is not a direct source literal/);
assert.match(sourceEditControlsMarkup, /type="number"/);
assert.match(sourceEditControlsMarkup, /type="text"/);
assert.match(sourceEditControlsMarkup, /type="checkbox"/);
assert.doesNotMatch(sourceEditControlsMarkup, /data-testid="x4-ui-source-edit-input-fail-first-locked"/);
assert.match(sourceEditControlsMarkup, /Not verified in game/);
const alignmentControlEntry = {
  ...failFirstStringEntry,
  id: 'alignment-control',
  value: 'center',
  provenance: { ...failFirstStringEntry.provenance, fields: ['semantics.properties.halign'] },
};
const renderAlignmentControl = (value: string, technical = false, pending = false) => renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: failFirstCatalog,
  entries: [{ ...alignmentControlEntry, value }],
  staged: {},
  showTechnicalDetails: technical,
  showFrameBlocks: false,
  receipt: pending ? { status: 'pending', detail: 'Awaiting acknowledgement' } : undefined,
  onStage: () => undefined,
  onApply: () => undefined,
}));
const alignmentControlMarkup = renderAlignmentControl('center');
assert.match(alignmentControlMarkup, /<select[^>]*data-testid="x4-ui-source-edit-input-alignment-control"/);
assert.match(alignmentControlMarkup, /<option value="left">Left<\/option>/);
assert.match(alignmentControlMarkup, /<option value="center" selected="">Center<\/option>/);
assert.match(alignmentControlMarkup, /<option value="right">Right<\/option>/);
assert.doesNotMatch(alignmentControlMarkup, /<input[^>]*aria-label="Alignment"/);
assert.match(renderAlignmentControl('custom-imported'), /<option value="custom-imported" selected="">Other value: custom-imported<\/option>/);
assert.match(renderAlignmentControl('center', true), /<input[^>]*aria-label="Alignment"[^>]*value="center"/);
assert.match(renderAlignmentControl('center', false, true), /<select[^>]*disabled=""/);
const lockedCatalog = {
  ...failFirstCatalog,
  status: 'locked' as const,
  reason: 'operation-not-applied' as const,
  detail: 'operation-not-applied: the mixed source stream was not applied',
};
const lockedFriendlyMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: lockedCatalog,
  entries: [],
  title: 'Friendly properties',
  showTechnicalDetails: false,
  showFrameBlocks: false,
  staged: {},
  receipt: undefined,
  onStage: () => undefined,
  onApply: () => undefined,
  onOpenInspect: () => undefined,
  inspectTargetId: 'x4-ui-inspect-panel-locked-selftest',
}));
assert.match(lockedFriendlyMarkup, /Property controls are unavailable for this source selection\./);
assert.match(lockedFriendlyMarkup, /The preview could not apply this source operation, so its controls are unavailable here\./);
assert.doesNotMatch(lockedFriendlyMarkup, /operation-not-applied: the mixed source stream was not applied/);
const lockedTechnicalMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: lockedCatalog,
  entries: [],
  title: 'Technical source controls',
  showTechnicalDetails: true,
  showFrameBlocks: false,
  staged: {},
  receipt: undefined,
  onStage: () => undefined,
  onApply: () => undefined,
}));
assert.match(lockedTechnicalMarkup, /operation-not-applied: the mixed source stream was not applied/);
const friendlyJoinedFontSizeEntry = {
  ...failFirstLockedEntry,
  id: 'fail-first-joined-font-size',
  field: 'semantics.fontsize,semantics.properties.fontsize',
  callName: 'setText' as const,
  reason: 'operation-not-applied' as const,
  detail: 'the selected setText operation was not applied',
} as const;
const friendlyUnknownPropertyEntry = {
  ...failFirstLockedEntry,
  id: 'fail-first-unknown-property',
  field: 'semantics.unsupportedProperties.mystery-key',
  callName: 'setText' as const,
  reason: 'operation-not-applied' as const,
  detail: 'the selected setText operation was not applied',
} as const;
const friendlyTechnicalBindingEntry = {
  ...failFirstLockedEntry,
  id: 'fail-first-technical-binding',
  field: 'arguments[1], semantics.options',
  callName: 'setText' as const,
  reason: 'constant-folded-value' as const,
  detail: 'the source options record is a constant-folded producer value',
} as const;
const friendlySourceEditControlsMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: failFirstCatalog,
  entries: [
    failFirstStringEntry,
    failFirstScalarEntry,
    failFirstLockedEntry,
    friendlyJoinedFontSizeEntry,
    friendlyUnknownPropertyEntry,
    friendlyTechnicalBindingEntry,
  ],
  title: 'Friendly properties',
  showTechnicalDetails: false,
  showFrameBlocks: false,
  staged: {},
  receipt: undefined,
  onStage: () => undefined,
  onApply: () => undefined,
  onOpenInspect: () => undefined,
  inspectTargetId: 'x4-ui-inspect-panel-selftest',
}));
assert.match(friendlySourceEditControlsMarkup, /Friendly properties/);
assert.match(friendlySourceEditControlsMarkup, />Text</);
assert.match(friendlySourceEditControlsMarkup, />Width</);
assert.match(friendlySourceEditControlsMarkup, /data-testid="x4-ui-source-edit-input-fail-first-string"[^>]*value="old"/);
assert.match(friendlySourceEditControlsMarkup, /data-testid="x4-ui-source-edit-apply-fail-first-string"[^>]*disabled/);
assert.match(friendlySourceEditControlsMarkup, /Technical source details/);
assert.doesNotMatch(friendlySourceEditControlsMarkup, /Stage string literal|Editable source value|Change this value locally, then Apply/);
assert.match(friendlySourceEditControlsMarkup, /Width is controlled by menu logic or a runtime value; it cannot be changed with this control\./);
assert.match(friendlySourceEditControlsMarkup, /Font size belongs to a source operation the preview did not apply; inspect the exact details\./);
assert.match(friendlySourceEditControlsMarkup, /Source property · mystery-key belongs to a source operation the preview did not apply; inspect the exact details\./);
assert.match(friendlySourceEditControlsMarkup, /Technical source bindings remain available under Inspect\./);
assert.match(friendlySourceEditControlsMarkup, /1 source setting is not modeled by the preview; the original record remains under Inspect\./);
assert.match(friendlySourceEditControlsMarkup, /data-testid="x4-ui-builder-open-inspect-properties"/);
assert.match(friendlySourceEditControlsMarkup, /aria-controls="x4-ui-inspect-panel-selftest"/);
assert.doesNotMatch(friendlySourceEditControlsMarkup, /data-testid="x4-ui-source-edit-entry-fail-first-technical-binding"/, 'technical bindings are aggregated out of friendly primary cards');
const friendlyInputPosition = friendlySourceEditControlsMarkup.indexOf('data-testid="x4-ui-source-edit-input-fail-first-string"');
const friendlyTechnicalPosition = friendlySourceEditControlsMarkup.indexOf('data-testid="x4-ui-source-edit-technical-fail-first-string"');
assert.ok(friendlyInputPosition >= 0 && friendlyTechnicalPosition > friendlyInputPosition, 'friendly technical details must follow the immediate property control');
assert.doesNotMatch(friendlySourceEditControlsMarkup, /Owner-issued literal/);
assert.match(friendlySourceEditControlsMarkup, /data-testid="x4-ui-source-edit-technical-fail-first-locked"[\s\S]*owner lock\/refusal reason:[\s\S]*dynamic expression is not a direct source literal/);
const noScopedInspectRouteMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: failFirstCatalog,
  entries: [friendlyTechnicalBindingEntry],
  title: 'Friendly properties',
  showTechnicalDetails: false,
  showFrameBlocks: false,
  staged: {},
  receipt: undefined,
  onStage: () => undefined,
  onApply: () => undefined,
}));
assert.match(noScopedInspectRouteMarkup, /Technical source bindings remain available under Inspect\./);
assert.doesNotMatch(noScopedInspectRouteMarkup, /Open Inspect|aria-controls=/, 'friendly controls must not emit an unscoped Inspect route');
const failFirstBlockEntry = {
  kind: 'insert-block',
  id: 'fail-first-frame-block',
  path: 'ui/edit.lua',
  startOffset: 20,
  endOffset: 20,
  expectedText: '',
  anchor: 'frame-display',
  anchorSource: { file: 'ui/edit.lua', start: { line: 2, column: 0, offset: 20 }, end: { line: 2, column: 0, offset: 20 } },
  indentation: '  ',
  lineEnding: '\n',
  provenance: {
    sourceIdentity: { file: 'ui/edit.lua', sha256: 'a'.repeat(64) },
    targetId: 'target',
    targetSource: { file: 'ui/edit.lua', start: { line: 1, column: 0, offset: 0 }, end: { line: 3, column: 0, offset: 30 } },
    statementSource: { file: 'ui/edit.lua', start: { line: 2, column: 0, offset: 20 }, end: { line: 2, column: 15, offset: 35 } },
    callBindings: [{ operationId: 'operation-display', callName: 'display', callOrder: 2, callSource: { file: 'ui/edit.lua', start: { line: 2, column: 0, offset: 20 }, end: { line: 2, column: 15, offset: 35 } } }],
    owner: { kind: 'frame', ownerId: 'frame:fixture' },
  },
} as const;
const failFirstBlockCatalog = {
  ...failFirstCatalog,
  structuralEntries: [failFirstBlockEntry],
  deleteEntries: [],
  insertEntries: [failFirstBlockEntry],
} as unknown as X4UiSourceEditCatalog;
const sourceEditBlockControlsMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: failFirstBlockCatalog,
  staged: { [failFirstBlockEntry.id]: 'local inputTable = frame:addTable(1, {})' },
  receipt: undefined,
  onStage: () => undefined,
  onApply: () => undefined,
}));
assert.match(sourceEditBlockControlsMarkup, /Frame-level direct X4 UI insertion block/);
assert.match(sourceEditBlockControlsMarkup, /data-testid="x4-ui-source-edit-block-input-fail-first-frame-block"/);
assert.match(sourceEditBlockControlsMarkup, /textarea/);
assert.match(sourceEditBlockControlsMarkup, /Apply frame block/);
assert.match(sourceEditBlockControlsMarkup, /Not verified in game/);
const pendingSourceEditBlockControlsMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: failFirstBlockCatalog,
  staged: { [failFirstBlockEntry.id]: 'local inputTable = frame:addTable(1, {})' },
  receipt: {
    status: 'pending',
    submission: acceptedSubmission,
    context: replacementSourceEditContextR,
    changed: true,
    detail: 'awaiting exact parent-issued acknowledgement',
    acceptedDetail: 'frame block must remain pending until exact acknowledgement',
  },
  onStage: () => undefined,
  onApply: () => undefined,
}));
assert.match(pendingSourceEditBlockControlsMarkup, /Pending parent workspace acknowledgement/);
assert.match(pendingSourceEditBlockControlsMarkup, /data-testid="x4-ui-source-edit-block-input-fail-first-frame-block"[^>]*disabled/);
assert.match(pendingSourceEditBlockControlsMarkup, /data-testid="x4-ui-source-edit-apply-block-fail-first-frame-block"[^>]*disabled/);

const frameBlockPayload = [
  'local inputTable = frame:addTable(2, {})',
  'inputTable:setColWidthPercent(1, 50)',
  'inputTable:setColWidthPercent(2, 50)',
  'local inputRow = inputTable:addRow(false, {})',
  'inputRow[1]:createText("AI Influence", {}):setColSpan(1)',
].join('\n');
const stagedFrameBlock = stageScalar({}, failFirstBlockEntry.id, frameBlockPayload);
assert.equal(stagedFrameBlock[failFirstBlockEntry.id], frameBlockPayload, 'frame block staging retains the exact source payload');
const blockExpectedWorkspace = { identity: 'frame-block-current' };
const blockReplacementWorkspace = blockExpectedWorkspace;
const blockContextR = makeSourceEditContext({
  workspace: blockExpectedWorkspace,
  ...sourceEditAuthorityIdentity,
});
const blockContextAfter = makeSourceEditContext({
  workspace: blockReplacementWorkspace,
  ...sourceEditAuthorityIdentity,
});
const blockContextRef: { current: unknown } = { current: blockContextR };
let blockStageDraft: unknown = { context: blockContextR, staged: {} };
const stageFrameBlock = compileActualSourceEditStage({
  sourceEditContext: blockContextR,
  sourceEditContextRef: blockContextRef,
  sourceEditDraftRef: { current: blockStageDraft },
  setSourceEditDraft: update => {
    blockStageDraft = typeof update === 'function' ? update(blockStageDraft) : update;
  },
  stageX4UiSourceEditInput: stageScalar,
  shouldClearX4UiSourceEditState: clearOnDrift,
});
stageFrameBlock(failFirstBlockEntry.id, frameBlockPayload);
const blockStagedDraft = blockStageDraft as { readonly context: unknown; readonly staged: Readonly<Record<string, string>> };
let blockUpdater: WorkspaceUpdater | undefined;
let blockAcknowledger: WorkspaceAcknowledger | undefined;
const blockSubmission = beginWorkspaceCommit(
  blockExpectedWorkspace,
  { expectedWorkspace: blockExpectedWorkspace, workspace: blockReplacementWorkspace },
  (updater, acknowledge) => {
    blockUpdater = updater;
    blockAcknowledger = acknowledge;
  },
);
const blockDraftRef: { current: unknown } = { current: blockStagedDraft };
let blockAppliedDraft: unknown = blockStagedDraft;
let blockStructuralApplyCalls = 0;
let blockStructuralApplyArgs: readonly unknown[] | undefined;
const applyFrameBlock = compileActualSourceEditApply({
  sourceEditDraftMatches: true,
  refuseSourceEdit: (reason: string, detail: string) => {
    blockAppliedDraft = { context: blockContextR, staged: {}, receipt: { status: 'refused', reason, detail } };
  },
  sourceEditCatalog: failFirstBlockCatalog,
  currentProgram: {},
  currentEvidenceAuthority: {},
  sourceEditDraft: blockStagedDraft,
  sourceEditContextRef: blockContextRef,
  sourceEditDraftRef: blockDraftRef,
  parseX4UiSourceEditInput: parseScalar,
  applyX4UiSourceEdit: () => {
    throw new Error('frame-block apply must use the structural owner');
  },
  applyX4UiSourceStructuralEdit: (...args: readonly unknown[]) => {
    blockStructuralApplyCalls += 1;
    blockStructuralApplyArgs = args;
    return {
      accepted: true,
      changed: true,
      workspace: blockReplacementWorkspace,
      source: {},
      catalog: failFirstBlockCatalog,
      entry: failFirstBlockEntry,
      path: failFirstBlockEntry.path,
      startOffset: failFirstBlockEntry.startOffset,
      endOffset: failFirstBlockEntry.endOffset,
      expectedText: failFirstBlockEntry.expectedText,
      replacement: `${failFirstBlockEntry.indentation}${frameBlockPayload}${failFirstBlockEntry.lineEnding}`,
      byteLocal: true,
      reparsed: true,
      provenanceReestablished: true,
    };
  },
  sourceEditContext: blockContextR,
  projection: { source: {} },
  onWorkspaceEdit: () => blockSubmission,
  submitX4UiSourceEditWorkspaceCommit: submitSourceEditWorkspaceCommit,
  setSourceEditDraft: update => {
    blockAppliedDraft = typeof update === 'function' ? update(blockAppliedDraft) : update;
  },
  settleX4UiSourceEditReceipt: settleSourceEditReceipt,
  X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
});
applyFrameBlock(failFirstBlockEntry.id);
const pendingBlockReceipt = (blockAppliedDraft as { readonly receipt?: unknown }).receipt as { readonly status?: string; readonly submission?: unknown; readonly changed?: boolean } | undefined;
const blockLiveWorkspace = blockUpdater?.(blockExpectedWorkspace);
const blockAcknowledgement = blockAcknowledger?.(blockLiveWorkspace);
const acceptedBlockSettlement = pendingBlockReceipt && blockAcknowledgement
  ? settleSourceEditReceipt?.(blockReplacementWorkspace, pendingBlockReceipt, blockAcknowledgement, blockContextAfter) as { readonly status?: string; readonly changed?: boolean } | undefined
  : undefined;
const staleBlockSettlement = pendingBlockReceipt && blockAcknowledgement
  ? settleSourceEditReceipt?.(newerWorkspaceN, pendingBlockReceipt, blockAcknowledgement, blockContextAfter) as { readonly status?: string; readonly reason?: string } | undefined
  : undefined;
const blockUiCausalRows: ReadonlyArray<CausalRow> = [
  ['frame block stage callback preserves exact payload', blockStagedDraft.staged[failFirstBlockEntry.id] === frameBlockPayload],
  ['frame block apply dispatches the owner structural path with exact CAS arguments', blockStructuralApplyCalls === 1
    && blockStructuralApplyArgs?.[3] === failFirstBlockEntry.id
    && blockStructuralApplyArgs?.[4] === frameBlockPayload
    && blockStructuralApplyArgs?.[5] === failFirstBlockEntry.path
    && blockStructuralApplyArgs?.[6] === failFirstBlockEntry.startOffset
    && blockStructuralApplyArgs?.[7] === failFirstBlockEntry.endOffset
    && blockStructuralApplyArgs?.[8] === failFirstBlockEntry.expectedText],
  ['frame block apply waits in pending parent acknowledgement state', pendingBlockReceipt?.status === 'pending' && pendingBlockReceipt.changed === true],
  ['exact frame block parent acknowledgement settles as accepted changed source', acceptedBlockSettlement?.status === 'accepted' && acceptedBlockSettlement.changed === true],
  ['stale frame block parent readback refuses without acceptance', staleBlockSettlement?.status === 'refused' && staleBlockSettlement.reason === 'stale-parent-workspace'],
];
const blockUiCausalFailures = blockUiCausalRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(blockUiCausalFailures, [], `B119 frame-block UI causal red assertions: ${blockUiCausalFailures.join(', ')}`);

const pendingSourceEditControlsMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: failFirstCatalog,
  staged: {},
  receipt: {
    status: 'pending',
    submission: acceptedSubmission,
    context: replacementSourceEditContextR,
    changed: true,
    detail: 'awaiting exact parent-issued acknowledgement',
    acceptedDetail: 'must remain hidden until exact acknowledgement',
  },
  onStage: () => undefined,
  onApply: () => undefined,
}));
assert.match(pendingSourceEditControlsMarkup, /Pending parent workspace acknowledgement/);
assert.doesNotMatch(pendingSourceEditControlsMarkup, /Accepted source change/);

const forgedVerificationCatalog = Object.freeze({
  ...failFirstCatalog,
  verification: 'Verified in game',
});
const forgedVerificationCatalogBefore = JSON.stringify(forgedVerificationCatalog);
const forgedVerificationMarkup = renderToStaticMarkup(React.createElement(renderSourceEditControls, {
  catalog: forgedVerificationCatalog,
  staged: {},
  receipt: undefined,
  onStage: () => undefined,
  onApply: () => undefined,
}));
const round4CausalRows: ReadonlyArray<CausalRow> = [
  ...round4PreRenderRows,
  ['forged catalog verification cannot render Verified in game', !/>Verified in game</.test(forgedVerificationMarkup)],
  ['forged catalog still renders permanent Not verified in game truth', />Not verified in game</.test(forgedVerificationMarkup)],
  ['source-edit controls do not mutate caller catalog while enforcing truth', JSON.stringify(forgedVerificationCatalog) === forgedVerificationCatalogBefore],
];
const round4CausalFailures = round4CausalRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(round4CausalFailures, [], `B119 7D round-4 causal red assertions: ${round4CausalFailures.join(', ')}`);

const round5ReceiptStatuses = ['pending', 'accepted', 'refused'] as const;
const round5SourceEditContextFor = (key: typeof fullContextDriftKeys[number]): {
  readonly contextE: SourceEditContextFixture;
  readonly contextR: SourceEditContextFixture;
} => {
  const base: SourceEditContextFixture = {
    workspace: { id: `round-5-${key}-workspace-E` },
    source: { id: `round-5-${key}-source-E` },
    selection: { id: `round-5-${key}-selection-E` },
    target: { id: `round-5-${key}-target-E` },
    program: { id: `round-5-${key}-program-E` },
    evidenceAuthority: { id: `round-5-${key}-evidence-E` },
    catalog: { id: `round-5-${key}-catalog-E` },
    profile: { id: `round-5-${key}-profile-E` },
  };
  const drifted: SourceEditContextFixture = {
    ...base,
    [key]: { id: `round-5-${key}-${key}-R` },
  };
  return {
    contextE: makeSourceEditContext(base),
    contextR: makeSourceEditContext(drifted),
  };
};

const round5DraftFor = (
  context: unknown,
  status: typeof round5ReceiptStatuses[number],
  marker: string,
): SourceEditDraftFixture => Object.freeze({
  context,
  staged: Object.freeze({ [failFirstScalarEntry.id]: `${marker}-${status}` }),
  receipt: Object.freeze({ status, marker }) as SourceEditReceiptFixture,
});

const hostileRetainedContext = (context: unknown): { readonly context: unknown; readonly reads: () => number } => {
  let reads = 0;
  const retained = new Proxy(context as object, {
    get: () => {
      reads += 1;
      throw new Error('stale retained context was accessed');
    },
  });
  return { context: retained, reads: () => reads };
};

const round5StageEntryRows: ReadonlyArray<CausalRow> = fullContextDriftKeys.flatMap(key => (
  round5ReceiptStatuses.map(status => {
    const { contextE, contextR } = round5SourceEditContextFor(key);
    const hostileE = hostileRetainedContext(contextE);
    const liveDraftR = round5DraftFor(contextR, status, `live-${key}`);
    const sourceEditContextRef: { current: unknown } = { current: contextR };
    let liveDraft: SourceEditDraftFixture = liveDraftR;
    let updaterCalls = 0;
    let objectUpdates = 0;
    let threw = false;
    const stage = compileActualSourceEditStage({
      sourceEditContext: hostileE.context,
      sourceEditContextRef,
      sourceEditDraftRef: { current: liveDraftR },
      setSourceEditDraft: update => {
        updaterCalls += 1;
        if (typeof update === 'function') {
          liveDraft = update(liveDraft);
        } else {
          objectUpdates += 1;
          liveDraft = update;
        }
      },
      stageX4UiSourceEditInput: sourceEditUiApi.stageX4UiSourceEditInput,
      shouldClearX4UiSourceEditState: clearOnDrift,
    });
    try {
      stage(failFirstScalarEntry.id, 'stale-entry-value');
    } catch {
      threw = true;
    }
    return [
      `stale stage before entry rejects ${key} drift with live ${status} R`,
      !threw
        && updaterCalls === 0
        && objectUpdates === 0
        && liveDraft === liveDraftR
        && hostileE.reads() === 0,
    ] as const;
  })
));

const round5StageScheduleRows: ReadonlyArray<CausalRow> = fullContextDriftKeys.flatMap(key => (
  round5ReceiptStatuses.map(status => {
    const { contextE, contextR } = round5SourceEditContextFor(key);
    const hostileE = hostileRetainedContext(contextE);
    const sourceEditContextRef: { current: unknown } = { current: hostileE.context };
    const liveDraftE = round5DraftFor(contextE, status, `scheduled-${key}`);
    const liveDraftR = round5DraftFor(contextR, status, `live-${key}`);
    let liveDraft = liveDraftE;
    const scheduledUpdates: Array<(previous: SourceEditDraftFixture) => SourceEditDraftFixture> = [];
    let setterCalls = 0;
    let objectUpdates = 0;
    let stageHelperCalls = 0;
    let clearHelperCalls = 0;
    const stage = compileActualSourceEditStage({
      sourceEditContext: hostileE.context,
      sourceEditContextRef,
      sourceEditDraftRef: { current: liveDraftE },
      setSourceEditDraft: update => {
        setterCalls += 1;
        if (typeof update === 'function') {
          scheduledUpdates.push(update);
        } else {
          objectUpdates += 1;
          liveDraft = update;
        }
      },
      stageX4UiSourceEditInput: (staged, entryId, raw) => {
        stageHelperCalls += 1;
        return stageScalar?.(staged, entryId, raw) ?? staged;
      },
      shouldClearX4UiSourceEditState: (previous, current) => {
        clearHelperCalls += 1;
        return clearOnDrift(previous, current);
      },
    });
    stage(failFirstScalarEntry.id, 'scheduled-entry-value');
    sourceEditContextRef.current = contextR;
    liveDraft = liveDraftR;
    const scheduled = scheduledUpdates[0];
    const firstResult = scheduled?.(liveDraftR);
    const secondResult = scheduled?.(liveDraftR);
    return [
      `stale stage between scheduling and updater rejects ${key} drift with live ${status} R`,
      scheduledUpdates.length === 1
        && setterCalls === 1
        && objectUpdates === 0
        && firstResult === liveDraftR
        && secondResult === liveDraftR
        && liveDraft === liveDraftR
        && stageHelperCalls === 0
        && clearHelperCalls === 0
        && hostileE.reads() === 0,
    ] as const;
  })
));

const round5ApplyEntryRows: ReadonlyArray<CausalRow> = fullContextDriftKeys.flatMap(key => (
  round5ReceiptStatuses.map(status => {
    const { contextE, contextR } = round5SourceEditContextFor(key);
    const hostileE = hostileRetainedContext(contextE);
    const liveDraftR = round5DraftFor(contextR, status, `live-apply-${key}`);
    const staleDraftE = round5DraftFor(hostileE.context, status, `stale-apply-${key}`);
    const sourceEditContextRef: { current: unknown } = { current: contextR };
    const sourceEditDraftRef: { current: unknown } = { current: liveDraftR };
    let liveDraft: SourceEditDraftFixture = liveDraftR;
    let sourceMutations = 0;
    let workspaceEditCalls = 0;
    let parentAttemptIssuances = 0;
    let setterCalls = 0;
    let refusedStateCalls = 0;
    let threw = false;
    const submit = sourceEditUiApi.submitX4UiSourceEditWorkspaceCommit;
    const apply = compileActualSourceEditApply({
      sourceEditDraftMatches: true,
      refuseSourceEdit: () => {
        refusedStateCalls += 1;
      },
      sourceEditCatalog: failFirstCatalog,
      currentProgram: {},
      currentEvidenceAuthority: {},
      sourceEditDraft: staleDraftE,
      sourceEditContextRef,
      sourceEditDraftRef,
      parseX4UiSourceEditInput: parseScalar,
      applyX4UiSourceEdit: () => {
        sourceMutations += 1;
        return {
          accepted: true,
          changed: true,
          workspace: { id: `round-5-${key}-replacement` },
          path: failFirstScalarEntry.path,
          startOffset: failFirstScalarEntry.startOffset,
          endOffset: failFirstScalarEntry.endOffset,
        };
      },
      sourceEditContext: hostileE.context,
      projection: { source: {} },
      onWorkspaceEdit: () => {
        workspaceEditCalls += 1;
        return { status: 'refused', reason: 'unexpected-stale-parent-call', detail: 'stale apply must not reach the parent' };
      },
      submitX4UiSourceEditWorkspaceCommit: (expected, replacement, onWorkspaceEdit) => {
        parentAttemptIssuances += 1;
        if (submit === undefined) return { status: 'refused', reason: 'submit-helper-unavailable', detail: 'fixture submit helper unavailable' };
        return submit(expected, replacement, request => {
          workspaceEditCalls += 1;
          return onWorkspaceEdit?.(request) ?? { status: 'refused', reason: 'missing-parent', detail: 'missing parent callback' };
        });
      },
      setSourceEditDraft: update => {
        setterCalls += 1;
        if (typeof update === 'function') {
          liveDraft = update(liveDraft);
        } else {
          liveDraft = update;
        }
      },
      X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
    });
    try {
      apply(failFirstScalarEntry.id);
    } catch {
      threw = true;
    }
    return [
      `stale apply before entry rejects ${key} drift with live ${status} R`,
      !threw
        && sourceMutations === 0
        && workspaceEditCalls === 0
        && parentAttemptIssuances === 0
        && setterCalls === 0
        && refusedStateCalls === 0
        && liveDraft === liveDraftR
        && hostileE.reads() === 0,
    ] as const;
  })
));

const contextEAndR = (label: 'E' | 'R'): readonly [string, SourceEditContextFixture] => {
  const { contextE, contextR } = round5SourceEditContextFor('workspace');
  return [label, label === 'E' ? contextE : contextR];
};

const round5StagePositiveRows: ReadonlyArray<CausalRow> = [contextEAndR('E'), contextEAndR('R')].map(([label, context]) => {
  const draft = round5DraftFor(context, 'pending', `positive-${label}`);
  const sourceEditContextRef: { current: unknown } = { current: context };
  let liveDraft = draft;
  const scheduledUpdates: Array<(previous: SourceEditDraftFixture) => SourceEditDraftFixture> = [];
  const stage = compileActualSourceEditStage({
    sourceEditContext: context,
    sourceEditContextRef,
    sourceEditDraftRef: { current: draft },
    setSourceEditDraft: update => {
      if (typeof update === 'function') scheduledUpdates.push(update);
      else liveDraft = update;
    },
    stageX4UiSourceEditInput: sourceEditUiApi.stageX4UiSourceEditInput,
    shouldClearX4UiSourceEditState: clearOnDrift,
  });
  stage(failFirstScalarEntry.id, `positive-${label}`);
  const updated = scheduledUpdates[0]?.(liveDraft);
  if (updated !== undefined) liveDraft = updated;
  return [
    `exact-current ${label} stage retains owned behavior`,
    scheduledUpdates.length === 1
      && updated?.context === context
      && liveDraft.context === context
      && liveDraft.staged[failFirstScalarEntry.id] === `positive-${label}`,
  ] as const;
});

const round5ApplyPositiveRows: ReadonlyArray<CausalRow> = ['E', 'R'].map(label => {
  const context = contextEAndR(label as 'E' | 'R')[1];
  const draft = Object.freeze({
    context,
    staged: Object.freeze({ [failFirstScalarEntry.id]: '7.5' }),
  });
  const sourceEditContextRef: { current: unknown } = { current: context };
  const sourceEditDraftRef: { current: unknown } = { current: draft };
  let sourceMutations = 0;
  let parentAttemptIssuances = 0;
  let workspaceEditCalls = 0;
  let setterCalls = 0;
  let appliedValue: unknown;
  const submit = sourceEditUiApi.submitX4UiSourceEditWorkspaceCommit;
  const apply = compileActualSourceEditApply({
    sourceEditDraftMatches: true,
    refuseSourceEdit: () => {
      setterCalls += 1;
    },
    sourceEditCatalog: failFirstCatalog,
    currentProgram: {},
    currentEvidenceAuthority: {},
    sourceEditDraft: draft,
    sourceEditContextRef,
    sourceEditDraftRef,
    parseX4UiSourceEditInput: parseScalar,
    applyX4UiSourceEdit: (_workspace, _source, _catalog, _entryId, value) => {
      sourceMutations += 1;
      appliedValue = value;
      return {
        accepted: true,
        changed: false,
        workspace: context.workspace,
        path: failFirstScalarEntry.path,
        startOffset: failFirstScalarEntry.startOffset,
        endOffset: failFirstScalarEntry.endOffset,
      };
    },
    sourceEditContext: context,
    projection: { source: {} },
    onWorkspaceEdit: () => {
      workspaceEditCalls += 1;
      return { status: 'refused', reason: 'positive-fixture-refusal', detail: 'positive control parent refusal' };
    },
    submitX4UiSourceEditWorkspaceCommit: (expected, replacement, onWorkspaceEdit) => {
      parentAttemptIssuances += 1;
      if (submit === undefined) return { status: 'refused', reason: 'submit-helper-unavailable', detail: 'fixture submit helper unavailable' };
      return submit(expected, replacement, onWorkspaceEdit);
    },
    setSourceEditDraft: () => {
      setterCalls += 1;
    },
    X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
  });
  let threw = false;
  try {
    apply(failFirstScalarEntry.id);
  } catch {
    threw = true;
  }
  return [
    `exact-current ${label} apply retains owned behavior`,
    !threw
      && sourceMutations === 1
      && appliedValue === 7.5
      && parentAttemptIssuances === 1
      && workspaceEditCalls === 1
      && setterCalls === 1,
  ] as const;
});

const round5ApplyUpdaterRows: ReadonlyArray<CausalRow> = fullContextDriftKeys.map(key => {
  const { contextR } = round5SourceEditContextFor(key);
  const contextN = makeSourceEditContext({
    ...contextR,
    [key]: { id: `round-5-${key}-${key}-N` },
  });
  const draftR = Object.freeze({
    context: contextR,
    staged: Object.freeze({ [failFirstScalarEntry.id]: '7.5' }),
  });
  const sourceEditContextRef: { current: unknown } = { current: contextR };
  const sourceEditDraftRef: { current: unknown } = { current: draftR };
  const scheduledUpdates: Array<(previous: SourceEditDraftFixture) => SourceEditDraftFixture> = [];
  let rejectionHandler: ((reason: unknown) => unknown) | undefined;
  const pendingAcknowledgement = {
    then: (
      _onFulfilled: (acknowledgement: WorkspaceCommitAcknowledgement) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => {
      rejectionHandler = onRejected;
      return pendingAcknowledgement;
    },
  };
  const pendingSubmission = {
    status: 'pending',
    attempt: {},
    expectedWorkspace: contextR.workspace,
    workspace: { id: `round-5-${key}-replacement` },
    acknowledgement: pendingAcknowledgement,
    detail: 'round-5 pending acknowledgement fixture',
  };
  let liveDraft: unknown = draftR;
  let sourceMutations = 0;
  let parentAttemptIssuances = 0;
  let workspaceEditCalls = 0;
  let setterCalls = 0;
  const submit = sourceEditUiApi.submitX4UiSourceEditWorkspaceCommit;
  const apply = compileActualSourceEditApply({
    sourceEditDraftMatches: true,
    refuseSourceEdit: () => {
      setterCalls += 1;
    },
    sourceEditCatalog: failFirstCatalog,
    currentProgram: {},
    currentEvidenceAuthority: {},
    sourceEditDraft: draftR,
    sourceEditContextRef,
    sourceEditDraftRef,
    parseX4UiSourceEditInput: parseScalar,
    applyX4UiSourceEdit: () => {
      sourceMutations += 1;
      return {
        accepted: true,
        changed: true,
        workspace: pendingSubmission.workspace,
        path: failFirstScalarEntry.path,
        startOffset: failFirstScalarEntry.startOffset,
        endOffset: failFirstScalarEntry.endOffset,
      };
    },
    sourceEditContext: contextR,
    projection: { source: {} },
    onWorkspaceEdit: () => {
      workspaceEditCalls += 1;
      return pendingSubmission;
    },
    submitX4UiSourceEditWorkspaceCommit: (expected, replacement, onWorkspaceEdit) => {
      parentAttemptIssuances += 1;
      if (submit === undefined) return { status: 'refused', reason: 'submit-helper-unavailable', detail: 'fixture submit helper unavailable' };
      return submit(expected, replacement, onWorkspaceEdit);
    },
    setSourceEditDraft: update => {
      setterCalls += 1;
      if (typeof update === 'function') {
        scheduledUpdates.push(update);
      } else {
        liveDraft = update;
      }
    },
    X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
  });
  let threw = false;
  try {
    apply(failFirstScalarEntry.id);
    sourceEditContextRef.current = contextR;
    const pendingInstaller = scheduledUpdates[0];
    const installedPendingDraft = pendingInstaller?.(draftR);
    if (installedPendingDraft !== undefined) {
      liveDraft = installedPendingDraft;
      sourceEditDraftRef.current = installedPendingDraft;
    }
    rejectionHandler?.(new Error('round-5 rejection fixture'));
    const liveDraftN: SourceEditDraftFixture = Object.freeze({
      context: contextN,
      staged: Object.freeze({}),
      receipt: Object.freeze({ status: 'pending', marker: `newer-${key}`, submission: pendingSubmission }),
    });
    sourceEditContextRef.current = contextN;
    liveDraft = liveDraftN;
    const updater = scheduledUpdates[1];
    const firstResult = updater?.(liveDraftN);
    const secondResult = updater?.(liveDraftN);
    return [
      `stale apply updater after ${key} drift preserves live N`,
      rejectionHandler !== undefined
        && scheduledUpdates.length === 2
        && firstResult === liveDraftN
        && secondResult === liveDraftN
        && liveDraft === liveDraftN
        && sourceMutations === 1
        && parentAttemptIssuances === 1
        && workspaceEditCalls === 1
        && setterCalls === 2,
    ] as const;
  } catch {
    threw = true;
  }
  return [`stale apply updater after ${key} drift preserves live N`, !threw] as const;
});

assert.equal(round5StageEntryRows.length, 24, 'round-5 stale-stage entry matrix must cover 8 identities x 3 live receipts');
assert.equal(round5StageScheduleRows.length, 24, 'round-5 stale-stage scheduled-updater matrix must cover 8 identities x 3 live receipts');
assert.equal(round5ApplyEntryRows.length, 24, 'round-5 stale-apply entry matrix must cover 8 identities x 3 live receipts');
assert.equal(round5StagePositiveRows.length, 2, 'round-5 stage positive controls must cover E/E and R/R');
assert.equal(round5ApplyPositiveRows.length, 2, 'round-5 apply positive controls must cover E/E and R/R');
assert.equal(round5ApplyUpdaterRows.length, 8, 'round-5 stale-apply updater matrix must cover all eight identities');
const round5CausalRows: ReadonlyArray<CausalRow> = [
  ...round5StageEntryRows,
  ...round5StageScheduleRows,
  ...round5ApplyEntryRows,
  ...round5StagePositiveRows,
  ...round5ApplyPositiveRows,
  ...round5ApplyUpdaterRows,
];
const round5CausalFailures = round5CausalRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(round5CausalFailures, [], `B119 7D round-5 stale-handler red assertions: ${round5CausalFailures.join(', ')}`);

type Round6DraftVariant = 'staged' | 'accepted' | 'refused' | 'pending';
type Round6Outcome = 'fulfillment' | 'rejection';
type Round6AcknowledgementController = {
  readonly acknowledgement: {
    readonly then: (
      onFulfilled: (acknowledgement: WorkspaceCommitAcknowledgement) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => unknown;
  };
  readonly fulfill: (acknowledgement: WorkspaceCommitAcknowledgement) => unknown;
  readonly reject: (reason: unknown) => unknown;
};

const createRound6AcknowledgementController = (): Round6AcknowledgementController => {
  let onFulfilled: ((acknowledgement: WorkspaceCommitAcknowledgement) => unknown) | undefined;
  let onRejected: ((reason: unknown) => unknown) | undefined;
  const acknowledgement = {
    then: (
      fulfilled: (acknowledgement: WorkspaceCommitAcknowledgement) => unknown,
      rejected: (reason: unknown) => unknown,
    ): unknown => {
      onFulfilled = fulfilled;
      onRejected = rejected;
      return acknowledgement;
    },
  };
  return {
    acknowledgement,
    fulfill: value => onFulfilled?.(value),
    reject: reason => onRejected?.(reason),
  };
};

const round6SettleFor = (outcome: Round6Outcome) => (
  _currentWorkspace: unknown,
  _pendingReceipt: unknown,
  _acknowledgement: unknown,
  _currentContext: unknown,
) => outcome === 'fulfillment'
  ? { status: 'accepted', changed: true, detail: 'round-6 exact acknowledgement accepted' }
  : { status: 'refused', reason: 'round-6-rejected-acknowledgement', detail: 'round-6 acknowledgement rejected' };

const round6SourceEditContextFor = (key: typeof fullContextDriftKeys[number]): {
  readonly contextE: SourceEditContextFixture;
  readonly contextR: SourceEditContextFixture;
} => {
  const base: SourceEditContextFixture = {
    workspace: { id: `round-6-${key}-workspace-E` },
    source: { id: `round-6-${key}-source-E` },
    selection: { id: `round-6-${key}-selection-E` },
    target: { id: `round-6-${key}-target-E` },
    program: { id: `round-6-${key}-program-E` },
    evidenceAuthority: { id: `round-6-${key}-evidence-E` },
    catalog: { id: `round-6-${key}-catalog-E` },
    profile: { id: `round-6-${key}-profile-E` },
  };
  const drifted: SourceEditContextFixture = {
    ...base,
    [key]: { id: `round-6-${key}-${key}-R` },
  };
  return { contextE: makeSourceEditContext(base), contextR: makeSourceEditContext(drifted) };
};

const round6DraftFor = (
  context: unknown,
  variant: Round6DraftVariant,
  submission: unknown,
  marker: string,
): SourceEditDraftFixture => {
  const staged = Object.freeze({ [failFirstScalarEntry.id]: marker });
  if (variant === 'staged') return Object.freeze({ context, staged });
  const receipt: SourceEditReceiptFixture = { status: variant, marker, submission };
  return Object.freeze({ context, staged, receipt });
};

const round6ReentrantRows: ReadonlyArray<CausalRow> = fullContextDriftKeys.flatMap(key => (
  (['staged', 'accepted', 'refused', 'pending'] as const).flatMap(variant => (
    (['fulfillment', 'rejection'] as const).map(outcome => {
      const { contextE, contextR } = round6SourceEditContextFor(key);
      const executionDraft: SourceEditDraftFixture = Object.freeze({
        context: contextE,
        staged: Object.freeze({ [failFirstScalarEntry.id]: '7.5' }),
      });
      const newerDraft = round6DraftFor(contextR, variant, { id: `round-6-${key}-${variant}-newer-submission` }, `round-6-newer-${variant}`);
      const controller = createRound6AcknowledgementController();
      const sourceEditContextRef: { current: unknown } = { current: contextE };
      const sourceEditDraftRef: { current: unknown } = { current: executionDraft };
      let liveDraft: unknown = executionDraft;
      let liveWorkspace: unknown = contextE.workspace;
      let parentAcknowledger: WorkspaceAcknowledger | undefined;
      let sourceMutations = 0;
      let workspaceEditCalls = 0;
      let parentAttemptIssuances = 0;
      let parentUpdaterCalls = 0;
      let setterCalls = 0;
      let objectUpdates = 0;
      let refusedStateCalls = 0;
      let threw = false;
      const submit = sourceEditUiApi.submitX4UiSourceEditWorkspaceCommit;
      const apply = compileActualSourceEditApply({
        sourceEditDraftMatches: true,
        refuseSourceEdit: () => {
          refusedStateCalls += 1;
        },
        sourceEditCatalog: failFirstCatalog,
        currentProgram: {},
        currentEvidenceAuthority: {},
        sourceEditDraft: executionDraft,
        sourceEditContextRef,
        sourceEditDraftRef,
        parseX4UiSourceEditInput: parseScalar,
        applyX4UiSourceEdit: () => {
          sourceMutations += 1;
          return {
            accepted: true,
            changed: true,
            workspace: contextR.workspace,
            path: failFirstScalarEntry.path,
            startOffset: failFirstScalarEntry.startOffset,
            endOffset: failFirstScalarEntry.endOffset,
          };
        },
        sourceEditContext: contextE,
        projection: { source: {} },
        onWorkspaceEdit: (request: { readonly expectedWorkspace: unknown; readonly workspace: unknown }) => {
          workspaceEditCalls += 1;
          const actualSubmission = beginWorkspaceCommit(
            request.expectedWorkspace,
            request,
            (updater, acknowledge) => {
              parentUpdaterCalls += 1;
              liveWorkspace = updater(liveWorkspace);
              parentAcknowledger = acknowledge;
              sourceEditContextRef.current = contextR;
              sourceEditDraftRef.current = newerDraft;
              liveDraft = newerDraft;
            },
          );
          return { ...actualSubmission, acknowledgement: controller.acknowledgement };
        },
        submitX4UiSourceEditWorkspaceCommit: (expected, replacement, onWorkspaceEdit) => {
          parentAttemptIssuances += 1;
          if (submit === undefined) return { status: 'refused', reason: 'submit-helper-unavailable', detail: 'fixture submit helper unavailable' };
          return submit(expected, replacement, request => onWorkspaceEdit?.(request) ?? { status: 'refused', reason: 'missing-parent', detail: 'missing parent callback' });
        },
        setSourceEditDraft: update => {
          setterCalls += 1;
          if (typeof update === 'function') {
            liveDraft = update(liveDraft);
          } else {
            objectUpdates += 1;
            liveDraft = update;
          }
        },
        settleX4UiSourceEditReceipt: round6SettleFor(outcome),
        X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
      });
      try {
        apply(failFirstScalarEntry.id);
        const acknowledgement = parentAcknowledger?.(liveWorkspace);
        if (outcome === 'fulfillment') controller.fulfill(acknowledgement ?? { status: 'accepted', currentWorkspace: liveWorkspace });
        else controller.reject(new Error(`round-6 ${key} ${variant} rejection`));
      } catch {
        threw = true;
      }
      return [
        `reentrant parent ${key} ${variant} ${outcome} preserves the newer draft after the exact UIBuilder boundary`,
        !threw
          && sourceMutations === 1
          && workspaceEditCalls === 1
          && parentAttemptIssuances === 1
          && parentUpdaterCalls === 1
          && setterCalls === 1
          && objectUpdates === 0
          && refusedStateCalls === 0
          && liveDraft === newerDraft
          && sourceEditContextRef.current === contextR
          && sourceEditDraftRef.current === newerDraft,
      ] as const;
    })
  ))
));

const round6DraftOnlyRows: ReadonlyArray<CausalRow> = (['fulfillment', 'rejection'] as const).flatMap(outcome => (
  (['staged', 'accepted', 'refused', 'pending'] as const).flatMap(variant => (
    (['same', 'different'] as const).map(relation => {
      const context = round6SourceEditContextFor('workspace').contextE;
      const executionDraft: SourceEditDraftFixture = Object.freeze({
        context,
        staged: Object.freeze({ [failFirstScalarEntry.id]: '7.5' }),
      });
      const controller = createRound6AcknowledgementController();
      const differentSubmission = { status: 'pending', attempt: {}, expectedWorkspace: context.workspace, workspace: { id: 'round-6-different-submission' }, acknowledgement: controller.acknowledgement };
      const pendingSubmission = { status: 'pending', attempt: {}, expectedWorkspace: context.workspace, workspace: { id: 'round-6-parent-submission' }, acknowledgement: controller.acknowledgement, detail: 'round-6 pending submission' };
      const newerDraft = round6DraftFor(
        context,
        variant,
        relation === 'same' ? pendingSubmission : differentSubmission,
        `round-6-newer-${outcome}-${variant}-${relation}`,
      );
      const sourceEditContextRef: { current: unknown } = { current: context };
      const sourceEditDraftRef: { current: unknown } = { current: executionDraft };
      const scheduledUpdates: Array<(previous: unknown) => unknown> = [];
      let liveDraft: unknown = executionDraft;
      let sourceMutations = 0;
      let workspaceEditCalls = 0;
      let parentAttemptIssuances = 0;
      let setterCalls = 0;
      let objectUpdates = 0;
      let refusedStateCalls = 0;
      let threw = false;
      const submit = sourceEditUiApi.submitX4UiSourceEditWorkspaceCommit;
      const apply = compileActualSourceEditApply({
        sourceEditDraftMatches: true,
        refuseSourceEdit: () => {
          refusedStateCalls += 1;
        },
        sourceEditCatalog: failFirstCatalog,
        currentProgram: {},
        currentEvidenceAuthority: {},
        sourceEditDraft: executionDraft,
        sourceEditContextRef,
        sourceEditDraftRef,
        parseX4UiSourceEditInput: parseScalar,
        applyX4UiSourceEdit: () => {
          sourceMutations += 1;
          return {
            accepted: true,
            changed: true,
            workspace: pendingSubmission.workspace,
            path: failFirstScalarEntry.path,
            startOffset: failFirstScalarEntry.startOffset,
            endOffset: failFirstScalarEntry.endOffset,
          };
        },
        sourceEditContext: context,
        projection: { source: {} },
        onWorkspaceEdit: () => {
          workspaceEditCalls += 1;
          return pendingSubmission;
        },
        submitX4UiSourceEditWorkspaceCommit: (expected, replacement, onWorkspaceEdit) => {
          parentAttemptIssuances += 1;
          if (submit === undefined) return { status: 'refused', reason: 'submit-helper-unavailable', detail: 'fixture submit helper unavailable' };
          return submit(expected, replacement, request => onWorkspaceEdit?.(request) ?? { status: 'refused', reason: 'missing-parent', detail: 'missing parent callback' });
        },
        setSourceEditDraft: update => {
          setterCalls += 1;
          if (typeof update === 'function') {
            scheduledUpdates.push(update);
          } else {
            objectUpdates += 1;
            liveDraft = update;
            sourceEditDraftRef.current = update;
          }
        },
        settleX4UiSourceEditReceipt: round6SettleFor(outcome),
        X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
      });
      try {
        apply(failFirstScalarEntry.id);
        const installationUpdater = scheduledUpdates[0];
        if (installationUpdater !== undefined) {
          liveDraft = newerDraft;
          sourceEditDraftRef.current = newerDraft;
          liveDraft = installationUpdater(liveDraft);
        } else {
          liveDraft = newerDraft;
          sourceEditDraftRef.current = newerDraft;
        }
        const settlementStart = scheduledUpdates.length;
        if (outcome === 'fulfillment') controller.fulfill({ status: 'accepted', attempt: pendingSubmission.attempt, expectedWorkspace: pendingSubmission.expectedWorkspace, workspace: pendingSubmission.workspace, currentWorkspace: pendingSubmission.workspace, detail: 'round-6 exact acknowledgement' });
        else controller.reject(new Error(`round-6 draft-only ${variant} ${relation} rejection`));
        const settlementUpdater = scheduledUpdates[settlementStart];
        const firstResult = settlementUpdater?.(liveDraft);
        if (firstResult !== undefined) liveDraft = firstResult;
        const secondResult = settlementUpdater?.(liveDraft);
        if (secondResult !== undefined) liveDraft = secondResult;
      } catch {
        threw = true;
      }
      return [
        `draft-only ${outcome} ${variant} ${relation} callback preserves the newer exact draft`,
        !threw
          && sourceMutations === 1
          && workspaceEditCalls === 1
          && parentAttemptIssuances === 1
          && setterCalls === 2
          && objectUpdates === 0
          && refusedStateCalls === 0
          && scheduledUpdates.length === 2
          && liveDraft === newerDraft
          && sourceEditContextRef.current === context
          && sourceEditDraftRef.current === newerDraft,
      ] as const;
    })
  ))
));

const round6ExactSettlementRows: ReadonlyArray<CausalRow> = (['fulfillment', 'rejection'] as const).map(outcome => {
  const context = round6SourceEditContextFor('workspace').contextE;
  const executionDraft: SourceEditDraftFixture = Object.freeze({
    context,
    staged: Object.freeze({ [failFirstScalarEntry.id]: '7.5' }),
  });
  const controller = createRound6AcknowledgementController();
  const pendingSubmission = { status: 'pending', attempt: {}, expectedWorkspace: context.workspace, workspace: { id: `round-6-exact-${outcome}` }, acknowledgement: controller.acknowledgement, detail: 'round-6 exact pending submission' };
  const sourceEditContextRef: { current: unknown } = { current: context };
  const sourceEditDraftRef: { current: unknown } = { current: executionDraft };
  let liveDraft: unknown = executionDraft;
  let settlementUpdater: ((previous: unknown) => unknown) | undefined;
  let sourceMutations = 0;
  let workspaceEditCalls = 0;
  let parentAttemptIssuances = 0;
  let setterCalls = 0;
  let objectUpdates = 0;
  let refusedStateCalls = 0;
  let threw = false;
  const submit = sourceEditUiApi.submitX4UiSourceEditWorkspaceCommit;
  const apply = compileActualSourceEditApply({
    sourceEditDraftMatches: true,
    refuseSourceEdit: () => {
      refusedStateCalls += 1;
    },
    sourceEditCatalog: failFirstCatalog,
    currentProgram: {},
    currentEvidenceAuthority: {},
    sourceEditDraft: executionDraft,
    sourceEditContextRef,
    sourceEditDraftRef,
    parseX4UiSourceEditInput: parseScalar,
    applyX4UiSourceEdit: () => {
      sourceMutations += 1;
      return {
        accepted: true,
        changed: true,
        workspace: pendingSubmission.workspace,
        path: failFirstScalarEntry.path,
        startOffset: failFirstScalarEntry.startOffset,
        endOffset: failFirstScalarEntry.endOffset,
      };
    },
    sourceEditContext: context,
    projection: { source: {} },
    onWorkspaceEdit: () => {
      workspaceEditCalls += 1;
      return pendingSubmission;
    },
    submitX4UiSourceEditWorkspaceCommit: (expected, replacement, onWorkspaceEdit) => {
      parentAttemptIssuances += 1;
      if (submit === undefined) return { status: 'refused', reason: 'submit-helper-unavailable', detail: 'fixture submit helper unavailable' };
      return submit(expected, replacement, request => onWorkspaceEdit?.(request) ?? { status: 'refused', reason: 'missing-parent', detail: 'missing parent callback' });
    },
    setSourceEditDraft: update => {
      setterCalls += 1;
      if (typeof update === 'function') {
        const result = update(liveDraft);
        liveDraft = result;
        sourceEditDraftRef.current = result;
        settlementUpdater = update;
      } else {
        objectUpdates += 1;
        liveDraft = update;
        sourceEditDraftRef.current = update;
      }
    },
    settleX4UiSourceEditReceipt: round6SettleFor(outcome),
    X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
  });
  try {
    apply(failFirstScalarEntry.id);
    if (outcome === 'fulfillment') controller.fulfill({ status: 'accepted', attempt: pendingSubmission.attempt, expectedWorkspace: pendingSubmission.expectedWorkspace, workspace: pendingSubmission.workspace, currentWorkspace: pendingSubmission.workspace, detail: 'round-6 exact acknowledgement' });
    else controller.reject(new Error(`round-6 exact ${outcome} rejection`));
    const repeatedResult = settlementUpdater?.(liveDraft);
    if (repeatedResult !== undefined) liveDraft = repeatedResult;
  } catch {
    threw = true;
  }
  const receiptStatus = typeof liveDraft === 'object' && liveDraft !== null && 'receipt' in liveDraft
    ? (liveDraft as { readonly receipt?: { readonly status?: unknown }}).receipt?.status
    : undefined;
  return [
    `exact pending receipt ${outcome} settles once and repeated updater calls are idempotent`,
    !threw
      && sourceMutations === 1
      && workspaceEditCalls === 1
      && parentAttemptIssuances === 1
      && setterCalls === 2
      && objectUpdates === 0
      && refusedStateCalls === 0
      && settlementUpdater !== undefined
      && receiptStatus === (outcome === 'fulfillment' ? 'accepted' : 'refused'),
  ] as const;
});

assert.equal(round6ReentrantRows.length, 64, 'round-6 reentrant parent matrix must cover 8 contexts x 4 newer draft variants x 2 callbacks');
assert.equal(round6DraftOnlyRows.length, 16, 'round-6 draft-only matrix must cover 2 callbacks x 4 newer draft variants x 2 submission identities');
assert.equal(round6ExactSettlementRows.length, 2, 'round-6 exact settlement controls must cover fulfillment and rejection');
const round6CausalRows: ReadonlyArray<CausalRow> = [
  ...round6ReentrantRows,
  ...round6DraftOnlyRows,
  ...round6ExactSettlementRows,
];
const round6CausalFailures = round6CausalRows.filter(([, pass]) => !pass).map(([name]) => name);
assert.deepEqual(round6CausalFailures, [], `B119 7D Round-6 stale-state red assertions: ${round6CausalFailures.join(', ')}`);

const mixedRowActionContext = stableSourceEditContext;
const mixedRowActionContextRef: { current: SourceEditContextFixture | null } = { current: mixedRowActionContext };
const mixedRowActionDraft: SourceEditDraftFixture = { context: mixedRowActionContext, staged: {} };
const mixedRowActionDraftRef: { current: SourceEditDraftFixture } = { current: mixedRowActionDraft };
let mixedRowActionRefusal: { readonly reason: string; readonly detail: string } | undefined;
let mixedRowActionMutations = 0;
let mixedRowActionParentCalls = 0;
const applyMixedRowAction = compileActualSourceEditApply({
  sourceEditDraftMatches: true,
  refuseSourceEdit: (reason: string, detail: string) => {
    mixedRowActionRefusal = { reason, detail };
  },
  sourceEditCatalog: failFirstCatalog,
  currentProgram: {},
  currentEvidenceAuthority: {},
  sourceEditDraft: mixedRowActionDraft,
  sourceEditContextRef: mixedRowActionContextRef,
  sourceEditDraftRef: mixedRowActionDraftRef,
  parseX4UiSourceEditInput: parseScalar,
  applyX4UiSourceEdit: () => {
    mixedRowActionMutations += 1;
    throw new Error('mixed row action must refuse before a scalar owner call');
  },
  applyX4UiSourceStructuralEdit: () => {
    mixedRowActionMutations += 1;
    throw new Error('mixed row action must refuse before a structural owner call');
  },
  applyX4UiSourceRowMove: () => {
    mixedRowActionMutations += 1;
    throw new Error('mixed row action must refuse before a movement owner call');
  },
  applyX4UiSourceRowInsertion: () => {
    mixedRowActionMutations += 1;
    throw new Error('mixed row action must refuse before a row-insertion owner call');
  },
  applyX4UiSourceWidgetInsertion: () => {
    mixedRowActionMutations += 1;
    throw new Error('mixed row action must refuse before a widget-insertion owner call');
  },
  sourceEditContext: mixedRowActionContext,
  projection: { source: {} },
  builderPresentation: { nodes: [] },
  contextualRowMove: { detail: '', upDetail: '', downDetail: '' },
  onWorkspaceEdit: () => {
    mixedRowActionParentCalls += 1;
    throw new Error('mixed row action must refuse before the parent callback');
  },
  submitX4UiSourceEditWorkspaceCommit: () => {
    mixedRowActionParentCalls += 1;
    throw new Error('mixed row action must refuse before the parent commit helper');
  },
  setSourceEditDraft: () => undefined,
  settleX4UiSourceEditReceipt: () => undefined,
  X4_UI_EDITOR_SESSION_GAME_TRUTH: 'Not verified in game',
});
applyMixedRowAction('mixed-row-action', 'button', 'Mixed action text', true, 'down');
assert.deepEqual(mixedRowActionRefusal, {
  reason: 'move-unavailable',
  detail: 'Row controls are unavailable for this selection.',
}, 'the actual apply callback must refuse an ambiguous movement plus insertion request');
assert.equal(mixedRowActionMutations, 0, 'an ambiguous movement plus insertion request must not reach any source owner');
assert.equal(mixedRowActionParentCalls, 0, 'an ambiguous movement plus insertion request must not reach the parent commit seam');

const sourceEditIntegrationWorkspace = {
  ...workspace,
  id: 'x4-ui-source-editor-source-edit-integration',
  compileSettings: { ui: true },
  passthroughFiles: [
    { path: 'ui.xml', content: '<addon name="b119_source_edit_integration"><environment type="menus"><file name="ui/edit.lua" /></environment></addon>' },
    {
      path: 'ui/edit.lua',
      content: [
        'local menu = { name = "Edit", layer = 1 }',
        'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
        'local table = frame:addTable(1, { width = 80, scaling = false })',
        'frame:display()',
        '',
      ].join('\n'),
    },
  ],
} as unknown as React.ComponentProps<typeof UIBuilder>['workspace'];
const unselectedIntegrationProjection = projectX4UiEditorSession({
  workspace: sourceEditIntegrationWorkspace,
  corpus: undefined,
  profile: { width: 100, height: 80, uiScale: 1 },
});
const integrationSourceCandidate = unselectedIntegrationProjection.preview.sourceCandidates.find(candidate => candidate.path === 'ui/edit.lua');
assert.ok(integrationSourceCandidate?.sourceIdentity, 'session must issue the exact source identity used by the source editor');
const integrationTarget = integrationSourceCandidate.targets[0];
assert.ok(integrationTarget, 'session must expose an exact target for the source editor');
const integrationProjection = projectX4UiEditorSession({
  workspace: sourceEditIntegrationWorkspace,
  corpus: undefined,
  profile: { width: 100, height: 80, uiScale: 1 },
  selection: {
    sourceIndex: integrationSourceCandidate.index,
    path: integrationSourceCandidate.path,
    sourceIdentity: integrationSourceCandidate.sourceIdentity,
    target: integrationTarget,
  },
});
const integrationCatalog = sourceEditUiApi.discoverX4UiSourceEditorCatalog(sourceEditIntegrationWorkspace, integrationProjection) as X4UiSourceEditCatalog | undefined;
assert.ok(integrationCatalog, 'source editor must derive a catalog from the exact current projection');
assert.equal(integrationCatalog.status, 'ready');
const integrationEntry = integrationCatalog.editableEntries.find(entry => entry.valueType === 'number');
assert.ok(integrationEntry, 'source editor integration fixture must expose an owner-issued number literal');
if (typeof integrationEntry.value !== 'number') throw new Error('source editor integration number entry was not numeric');
const originalIntegrationWorkspace = JSON.stringify(sourceEditIntegrationWorkspace);
const integrationApply = applyX4UiSourceEdit(
  sourceEditIntegrationWorkspace as Parameters<typeof applyX4UiSourceEdit>[0],
  integrationProjection.source,
  integrationCatalog,
  integrationEntry.id,
  integrationEntry.value + 1,
  integrationEntry.path,
  integrationEntry.startOffset,
  integrationEntry.endOffset,
  integrationEntry.expectedText,
);
assert.equal(integrationApply.accepted, true, 'accepted UI integration must forward the exact owner-issued edit');
assert.equal(integrationApply.changed, true);
assert.notEqual(JSON.stringify(integrationApply.workspace), originalIntegrationWorkspace);
assert.equal(JSON.stringify(sourceEditIntegrationWorkspace), originalIntegrationWorkspace, 'source editor integration must not mutate the original workspace object');
assert.equal(integrationProjection.gameTruth, 'Not verified in game');

console.log('X4UiSourceEditor selftest: B119 8C.2 row-local manual SSR/draft/state/session matrix passed; prior Batch 7D assertions 41/41; causal parent-CAS rows 10/10; pending SSR rows 2/2; frame-block UI causal rows 5/5; causal no-op acknowledgement rows 29/29; passive-effect reconciliation rows 8/8; round-4 authority rows 27/27; round-5 stale-stage entry 24/24; round-5 stale-stage updater 24/24; round-5 stale-apply entry 24/24; round-5 stage positives 2/2; round-5 apply positives 2/2; round-5 stale-apply updater 8/8; round-6 reentrant parent 64/64; round-6 draft-only acknowledgement 16/16; round-6 exact settlement 2/2; all earlier SSR, authority, linter, canvas, and UIBuilder boundaries passed');

type P7SourceAuthorityFixture = {
  readonly core: X4UiCorpusCanonicalSuccess;
  readonly color: X4UiCorpusCanonicalColorSuccess;
};

type P7SourceRow = {
  readonly name: string;
  readonly fixtureReady: boolean;
  readonly threw: boolean;
  readonly expected: string;
  readonly observed: unknown;
  readonly pass: boolean;
};

const p7SourceRows: P7SourceRow[] = [];

function p7SourceResponseHeaders(contentType: string): { get(name: string): string | null } {
  return { get: name => name.toLowerCase() === 'content-type' ? contentType : null };
}

function p7SourceJsonResponse(body: unknown, status = 200): X4UiCorpusFetchResponse {
  return {
    status,
    headers: p7SourceResponseHeaders('application/json; charset=utf-8'),
    json: async () => body,
  };
}

function p7SourceBytesResponse(bytes: Uint8Array, status = 200, contentType = 'application/octet-stream'): X4UiCorpusFetchResponse {
  const copied = bytes.slice();
  return {
    status,
    headers: p7SourceResponseHeaders(contentType),
    arrayBuffer: async () => copied.buffer,
  };
}

function p7SourceHexDigest(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes.buffer;
}

function p7SourceDigestInputBytes(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('SourceEditor P7 digest input was not a byte buffer');
}

async function p7SourceWithCanonicalPlatformHash<T>(expectedHashes: readonly string[], run: () => Promise<T>): Promise<T> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let hashIndex = 0;
  const fakeCrypto = {
    subtle: {
      digest: async (): Promise<ArrayBuffer> => {
        const expected = expectedHashes[hashIndex++];
        if (expected === undefined) throw new Error('SourceEditor P7 canonical hash count mismatch');
        return p7SourceHexDigest(expected);
      },
    },
  };
  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      enumerable: originalDescriptor?.enumerable ?? true,
      writable: true,
      value: fakeCrypto,
    });
    return await run();
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, 'crypto', originalDescriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
}

function p7SourceMakeCanonicalAbc(advance: number): Uint8Array {
  const maxCodepoint = 127;
  const mapBytes = (maxCodepoint + 1) * 2;
  const recordStart = (ZEKTON_DESCRIPTOR_HEADER_SIZE + mapBytes + 3) & ~3;
  const bytes = new Uint8Array(recordStart + ZEKTON_RECORD_SIZE + ZEKTON_DESCRIPTOR_TRAILING_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 9, true);
  view.setFloat32(4, 16, true);
  view.setFloat32(8, 3, true);
  view.setFloat32(12, 3, true);
  view.setFloat32(16, 10, true);
  view.setInt32(20, 4, true);
  view.setInt32(24, 6, true);
  view.setInt32(28, 0, true);
  view.setUint32(32, 0, true);
  view.setUint32(36, 8, true);
  view.setUint32(40, 10, true);
  view.setUint32(44, maxCodepoint, true);
  for (let codepoint = 0; codepoint <= maxCodepoint; codepoint += 1) view.setUint16(ZEKTON_DESCRIPTOR_HEADER_SIZE + codepoint * 2, 1, true);
  view.setFloat32(recordStart, 0, true);
  view.setFloat32(recordStart + 4, 0, true);
  view.setFloat32(recordStart + 8, 1, true);
  view.setFloat32(recordStart + 12, 1, true);
  view.setInt16(recordStart + 16, 0, true);
  view.setUint16(recordStart + 18, 8, true);
  view.setUint16(recordStart + 20, advance, true);
  view.setUint16(recordStart + 22, 0, true);
  return bytes;
}

function p7SourceMakeCanonicalDds(): Uint8Array {
  const bytes = new Uint8Array(ZEKTON_DDS_HEADER_SIZE + 8 * 10);
  bytes.set([0x44, 0x44, 0x53, 0x20]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 124, true);
  view.setUint32(8, 0x1007, true);
  view.setUint32(12, 10, true);
  view.setUint32(16, 8, true);
  view.setUint32(76, 32, true);
  view.setUint32(80, 2, true);
  view.setUint32(88, 8, true);
  view.setUint32(104, 0xff, true);
  view.setUint32(108, 0x1002, true);
  for (let index = ZEKTON_DDS_HEADER_SIZE; index < bytes.length; index += 1) bytes[index] = 255;
  return bytes;
}

function p7SourcePaddedUtf8(text: string, size: number): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > size) throw new Error(`SourceEditor P7 color fixture exceeds ${size} bytes`);
  const padded = new Uint8Array(size);
  padded.set(bytes);
  padded.fill(0x20, bytes.byteLength);
  return padded;
}

function p7SourceColorBuffers(): Map<string, Uint8Array> {
  const baseIds = [
    'white',
    'black_alpha_0',
    'white_weak_glow',
    'azure_very_dark',
    'azure_moderate_glow',
    'azure_dark_alpha_160_glow',
    'azure_very_dark_alpha_224',
    'literal_base',
  ];
  while (baseIds.length < 224) baseIds.push(`source_p7_base_${baseIds.length.toString().padStart(3, '0')}`);
  const specialValues: Record<string, readonly [number, number, number, number, number]> = {
    white: [11, 22, 33, 44, 0.1],
    black_alpha_0: [51, 52, 53, 54, 0.2],
    white_weak_glow: [101, 102, 103, 104, 0.3],
    azure_very_dark: [61, 62, 63, 64, 0.4],
    azure_moderate_glow: [71, 72, 73, 74, 0.5],
    azure_dark_alpha_160_glow: [81, 82, 83, 84, 0.6],
    azure_very_dark_alpha_224: [91, 92, 93, 94, 0.7],
    literal_base: [131, 132, 133, 134, 0.9],
  };
  const colors = baseIds.map((id, index) => {
    const values = specialValues[id] || [index % 256, (index + 1) % 256, (index + 2) % 256, (index + 3) % 256, 0];
    return `    <color id="${id}" r="${values[0]}" g="${values[1]}" b="${values[2]}" a="${values[3]}" glow="${values[4]}"/>`;
  });
  const mappingRefs: Record<string, string> = {
    table_background_default: 'white',
    row_background: 'black_alpha_0',
    text_normal: 'white_weak_glow',
    icon_normal: 'white_weak_glow',
    button_background_default: 'azure_very_dark',
    button_highlight_default: 'azure_moderate_glow',
    button_border_default: 'azure_dark_alpha_160_glow',
    editbox_background_default: 'azure_very_dark_alpha_224',
  };
  const mappings = Object.entries(mappingRefs).map(([id, ref]) => `    <mapping id="${id}" ref="${ref}"/>`);
  for (let index = mappings.length; index < 804; index += 1) mappings.push(`    <mapping id="source_p7_map_${index.toString().padStart(3, '0')}" ref="${baseIds[index % baseIds.length]}"/>`);
  return new Map([
    [X4_UI_CORPUS_COLORS_XML_PATH, p7SourcePaddedUtf8([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<colormap>',
      '  <colors>',
      ...colors,
      '  </colors>',
      '  <mappings>',
      ...mappings,
      '  </mappings>',
      '</colormap>',
    ].join('\n'), X4_UI_CORPUS_COLORS_XML_SIZE)],
    [X4_UI_CORPUS_COLORS_XSD_PATH, p7SourcePaddedUtf8([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">',
      '  <xs:simpleType name="identifier"><xs:restriction base="xs:string"><xs:pattern value="[a-zA-Z_][a-zA-Z0-9_]*"/></xs:restriction></xs:simpleType>',
      '</xs:schema>',
    ].join('\n'), X4_UI_CORPUS_COLORS_XSD_SIZE)],
  ]);
}

function p7SourcePathFromQuery(url: string, key: string): string {
  const pair = url.slice(url.indexOf('?') + 1).split('&').find(part => part.startsWith(`${key}=`));
  if (!pair) throw new Error(`SourceEditor P7 missing query ${key}`);
  return decodeURIComponent(pair.slice(key.length + 1));
}

function p7SourceManifestStatus(root: string, generation: string): Record<string, unknown> {
  return {
    available: true,
    state: 'ready',
    root,
    current: { generation, root, generatedAt: '2026-08-19T00:00:00.000Z' },
  };
}

function p7SourceFixtureTransport(
  calls: Array<{ readonly url: string; readonly signal: AbortSignal | undefined }>,
): X4UiCorpusTransport {
  const root = 'source-editor-p7-canonical-root';
  const generation = 'source-editor-p7-canonical-generation';
  const contract = X4_UI_CORPUS_9_00_CONTRACT;
  const buffers = new Map<string, Uint8Array>([
    [contract.helper.relativePath, new TextEncoder().encode('-- SourceEditor P7 canonical helper\n')],
    [contract.widget.relativePath, new TextEncoder().encode('-- SourceEditor P7 canonical widget\n')],
    [contract.regular.descriptor.relativePath, p7SourceMakeCanonicalAbc(8)],
    [contract.regular.atlas.relativePath, p7SourceMakeCanonicalDds()],
    [contract.bold.descriptor.relativePath, p7SourceMakeCanonicalAbc(8)],
    [contract.bold.atlas.relativePath, p7SourceMakeCanonicalDds()],
  ]);
  for (const [path, bytes] of p7SourceColorBuffers()) buffers.set(path, bytes);
  const status = {
    available: true,
    root,
    generatedAt: '2026-08-19T00:00:00.000Z',
    manifestGeneration: generation,
    manifest: { available: true, state: 'ready', root, current: { generation, root, generatedAt: '2026-08-19T00:00:00.000Z' } },
  };
  return async (url, init) => {
    calls.push({ url, signal: init?.signal });
    if (url === X4_UI_CORPUS_STATUS_URL) return p7SourceJsonResponse(status);
    if (url.startsWith(`${X4_UI_CORPUS_MANIFEST_URL}?`)) {
      const path = p7SourcePathFromQuery(url, 'q');
      const bytes = buffers.get(path);
      if (!bytes) throw new Error(`SourceEditor P7 unknown manifest path ${path}`);
      return p7SourceJsonResponse({
        status: p7SourceManifestStatus(root, generation),
        generation,
        total: 1,
        limit: 500,
        offset: 0,
        files: [{ path, bytes: bytes.byteLength }],
      });
    }
    if (url.startsWith(`${X4_UI_CORPUS_FILE_URL}?`)) {
      const path = p7SourcePathFromQuery(url, 'path');
      const bytes = buffers.get(path);
      if (!bytes) throw new Error(`SourceEditor P7 unknown file path ${path}`);
      const contentType = path.endsWith('.lua') ? 'text/plain' : path.endsWith('.xml') || path.endsWith('.xsd') ? 'application/xml' : 'application/octet-stream';
      return p7SourceBytesResponse(bytes, 200, contentType);
    }
    throw new Error(`SourceEditor P7 unexpected URL ${url}`);
  };
}

async function loadP7SourceAuthorities(): Promise<P7SourceAuthorityFixture> {
  const calls: Array<{ readonly url: string; readonly signal: AbortSignal | undefined }> = [];
  const transport = p7SourceFixtureTransport(calls);
  const contract = X4_UI_CORPUS_9_00_CONTRACT;
  const coreHashes = [
    contract.helper.sha256,
    contract.widget.sha256,
    contract.regular.descriptor.sha256,
    contract.regular.atlas.sha256,
    contract.bold.descriptor.sha256,
    contract.bold.atlas.sha256,
  ];
  const coreResult = await p7SourceWithCanonicalPlatformHash(coreHashes, () => loadConfiguredX4UiCorpusAssets({ transport }));
  if (!isX4UiCorpusCanonicalSuccess(coreResult)) throw new Error(`SourceEditor P7 core fixture failed: ${JSON.stringify(coreResult)}`);
  const colorResult = await p7SourceWithCanonicalPlatformHash(
    [X4_UI_CORPUS_COLORS_XML_SHA256, X4_UI_CORPUS_COLORS_XSD_SHA256],
    () => loadConfiguredX4UiCorpusColorEvidence({ transport }),
  );
  if (!isX4UiCorpusCanonicalColorSuccess(colorResult)) throw new Error(`SourceEditor P7 color fixture failed: ${JSON.stringify(colorResult)}`);
  if (colorResult.evidenceKind !== X4_UI_CORPUS_COLOR_CANONICAL_EVIDENCE || colorResult.verification !== X4_UI_CORPUS_VERIFICATION) throw new Error('SourceEditor P7 color fixture identity drifted');
  if (colorResult.identities.xml.relativePath !== X4_UI_CORPUS_9_00_COLOR_CONTRACT.xml.relativePath || colorResult.identities.xsd.relativePath !== X4_UI_CORPUS_9_00_COLOR_CONTRACT.xsd.relativePath) throw new Error('SourceEditor P7 color contract path drifted');
  return { core: coreResult, color: colorResult };
}

function p7SourceRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function p7SourceString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function p7SourceNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

function p7SourceClassify(
  result: unknown,
  overrides: Partial<{ readonly signalAborted: boolean; readonly requestActive: boolean; readonly requestGeneration: number; readonly currentGeneration: number }> = {},
): Record<string, unknown> {
  return classifyX4UiCorpusLoadResult({
    result,
    loaderIssued: true,
    signalAborted: false,
    requestActive: true,
    requestGeneration: 1,
    currentGeneration: 1,
    ...overrides,
  } as never) as unknown as Record<string, unknown>;
}

function p7SourceCoreCanonical(observed: unknown, core: X4UiCorpusCanonicalSuccess): boolean {
  const record = p7SourceRecord(observed);
  return record?.status === 'canonical'
    && record.accepted === true
    && record.result === core
    && isX4UiCorpusCanonicalSuccess(record.result);
}

function p7SourceColorCanonical(observed: unknown, color: X4UiCorpusCanonicalColorSuccess): boolean {
  const record = p7SourceRecord(observed);
  return record?.colorStatus === 'canonical'
    && record.colorEvidence === color
    && isX4UiCorpusCanonicalColorSuccess(record.colorEvidence);
}

function p7SourceNoColorAuthority(observed: unknown): boolean {
  const record = p7SourceRecord(observed);
  return record?.colorEvidence === undefined && record?.colorStatus !== 'canonical';
}

function p7SourceNoAuthority(observed: unknown): boolean {
  const record = p7SourceRecord(observed);
  return record?.status !== 'canonical'
    && record?.accepted !== true
    && (record?.result === null || record?.result === undefined)
    && record?.colorEvidence === undefined;
}

function p7SourceReceipt(value: unknown): unknown {
  const record = p7SourceRecord(value);
  if (record === undefined) return value;
  if (typeof record.error === 'string') return { error: record.error };
  const receipt: Record<string, unknown> = {};
  for (const key of ['status', 'accepted', 'detail', 'colorStatus', 'colorDetail', 'getterReads', 'getTrapReads', 'threw', 'dualCanonical', 'detached', 'timeout', 'statusCallCount', 'overlapBeforeEitherSettled', 'callsUseSharedSignal', 'coreCanonical', 'colorCanonical', 'canonicalCount', 'failedBranchOrdinary', 'coreLoaderStarted', 'colorLoaderStarted', 'branchStartsBeforeSettlement', 'injectedBranchRejected', 'branchSignalsUseSharedSignal', 'initialCanvasStatus', 'initialCanvasDetail', 'parentInitialSnapshot', 'sourceOnlyCanvasStatus', 'sourceOnlyCanvasDetail', 'parentSourceOnlySnapshot', 'sourceOnlyCanvasRetained', 'currentCanvasStatus', 'currentCanvasDetail', 'currentCanvasMounted', 'currentCanvasReplaced', 'currentCanvasWidth', 'currentCanvasHeight', 'targetCommitCanvasStatus', 'parentTargetSnapshot', 'parentTargetCallbackCanvasStatus', 'parentTargetCallbackCanvasMounted', 'parentTargetCallbackExportDisabled', 'currentExportDisabled', 'currentExportStatus', 'currentExportProfile', 'currentNativeBitmapWidth', 'currentNativeBitmapHeight', 'currentSourceIdentity', 'currentTargetMetadata', 'currentSceneStatus', 'presetActive', 'presetCanvasStatus', 'presetExportDisabled', 'staleCanvasStatus', 'staleCanvasRetained', 'staleExportStatus', 'restoredCanvasStatus', 'restoredCanvasReplaced', 'restoredExportDisabled', 'sourcePath', 'targetOptionCount', 'targetOptionValueBefore', 'targetOptionValueAfter', 'targetSelectValue', 'targetRetained', 'targetMetadata', 'canvasStatus', 'canvasDetail', 'canvasExportDisabled', 'canvasExportStatus', 'pathRegion', 'loopRegion', 'sampleRegion', 'parentReconciled', 'fixtureHash', 'targetOptionValue', 'targetCanvasStatus', 'targetCanvasDetail', 'targetCanvasMounted', 'targetCanvasReplaced', 'targetExportDisabled', 'targetExportStatus', 'targetSourceIdentity', 'targetSceneStatus', 'handlerOptionValue', 'handlerCanvasStatus', 'handlerCanvasDetail', 'handlerCanvasMounted', 'handlerExportStatus', 'handlerTargetMetadata', 'restoredCanvasDetail', 'restoredCanvasMounted', 'restoredExportDisabled', 'restoredExportStatus', 'parentReconciliations', 'parentCallbackNotifications', 'gameTruth', 'initialLoopValue', 'immediateLoopValue', 'settledLoopValue', 'acceptedLoopIterationCount', 'invalidLoopValue', 'invalidLoopIterationCount', 'resetLoopValue', 'resetLoopIterationCount', 'loopGameTruth', 'initialOwnerBuilds', 'initialCandidateCatalogBuilds', 'initialCandidateMaterializations', 'initialProvisionalProjectionCalls', 'profileOnlyOwnerBuilds', 'profileOnlyCandidateCatalogBuilds', 'profileOnlyCandidateMaterializations', 'profileOnlyProvisionalProjectionCalls', 'sameWorkspaceParentOwnerBuilds', 'sameWorkspaceParentCandidateCatalogBuilds', 'sameWorkspaceParentCandidateMaterializations', 'sameWorkspaceParentProvisionalProjectionCalls', 'newWorkspaceOwnerBuilds', 'newWorkspaceCandidateCatalogBuilds', 'newWorkspaceCandidateMaterializations', 'newWorkspaceProvisionalProjectionCalls', 'selectedPath', 'selectedTargetId', 'requestedTargetKey', 'replacementTargetKey', 'targetSelectValueBeforeProjection', 'targetSelectValueAfterProjection', 'targetOptionAfterProjection', 'targetResetObserved', 'targetRetained']) {
    if (Object.hasOwn(record, key)) receipt[key] = record[key];
  }
  for (const key of ['issuedSampleCount', 'initialProjectionCount', 'stagedProjectionCount', 'appliedProjectionCount', 'invalidProjectionCount', 'stagedControlValues', 'appliedControlValues', 'invalidControlValue', 'invalidAcceptedControlValue', 'resetControlValue', 'initialCanvasPresent', 'stagedCanvasPresent', 'stagedCanvasSame', 'canvasRetainedWhileStaged', 'exportRetainedWhileStaged', 'stagedLabel', 'appliedLabel', 'transientTargetOptionValue', 'transientTargetSelectRawValue', 'transientTargetSelectValue', 'transientTargetSelectText', 'transientProjectionRefused', 'transientRenderRevision']) {
    if (Object.hasOwn(record, key)) receipt[key] = record[key];
  }
  if (Object.hasOwn(record, 'result')) receipt.result = record.result === null ? null : record.result === undefined ? undefined : 'present';
  if (Object.hasOwn(record, 'colorEvidence')) receipt.colorEvidence = record.colorEvidence === undefined ? undefined : 'present';
  if (Array.isArray(record.calls)) receipt.calls = { count: record.calls.length, allowlisted: record.calls.every(call => {
    const item = p7SourceRecord(call);
    return item !== undefined && typeof item.url === 'string';
  }) };
  for (const key of ['results', 'negativeResults', 'reflectionResults']) {
    if (!Array.isArray(record[key])) continue;
    receipt[key] = record[key].map(item => {
      const row = p7SourceRecord(item);
      return row === undefined ? item : { name: row.name, getTrapReads: row.getTrapReads, trapReads: row.trapReads, threw: row.threw, rejected: row.rejected };
    });
  }
  for (const key of ['transparent', 'active', 'late', 'aborted', 'reload', 'offlineColor', 'abortedColor']) {
    if (Object.hasOwn(record, key)) receipt[key] = p7SourceReceipt(record[key]);
  }
  return receipt;
}

type MountedDomEventListener = (event: MountedDomEvent) => void;

class MountedDomEvent {
  readonly composed = true;
  readonly isTrusted = false;
  readonly timeStamp = Date.now();
  target: MountedDomNode | null = null;
  currentTarget: MountedDomNode | null = null;
  eventPhase = 0;
  defaultPrevented = false;
  cancelBubble = false;

  constructor(
    readonly type: string,
    options: { readonly bubbles?: boolean; readonly cancelable?: boolean; readonly propertyName?: string } = {},
  ) {
    this.bubbles = options.bubbles === true;
    this.cancelable = options.cancelable === true;
    this.propertyName = options.propertyName;
  }

  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly propertyName?: string;

  preventDefault(): void { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation(): void { this.cancelBubble = true; }
  stopImmediatePropagation(): void { this.cancelBubble = true; }

  composedPath(): MountedDomNode[] {
    const path: MountedDomNode[] = [];
    for (let current = this.target; current !== null; current = current.parentNode) path.push(current);
    return path;
  }
}

class MountedDomNode {
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly COMMENT_NODE = 8;
  static readonly DOCUMENT_NODE = 9;

  readonly childNodes: MountedDomNode[] = [];
  parentNode: MountedDomNode | null = null;
  nodeValue: string | null = null;
  private readonly listeners = new Map<string, Set<MountedDomEventListener>>();

  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    public ownerDocument: MountedDomDocument,
  ) {}

  get parentElement(): MountedDomElement | null {
    return this.parentNode instanceof MountedDomElement ? this.parentNode : null;
  }
  get firstChild(): MountedDomNode | null { return this.childNodes[0] ?? null; }
  get lastChild(): MountedDomNode | null { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get firstElementChild(): MountedDomElement | null {
    return this.childNodes.find(child => child instanceof MountedDomElement) as MountedDomElement | undefined ?? null;
  }
  get nextSibling(): MountedDomNode | null {
    if (this.parentNode === null) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return index < 0 ? null : this.parentNode.childNodes[index + 1] ?? null;
  }
  get textContent(): string {
    return this.nodeType === MountedDomNode.TEXT_NODE || this.nodeType === MountedDomNode.COMMENT_NODE
      ? this.nodeValue ?? ''
      : this.childNodes.map(child => child.textContent).join('');
  }
  set textContent(value: string) {
    this.replaceChildren(...(value === '' ? [] : [this.ownerDocument.createTextNode(value)]));
  }

  appendChild<T extends MountedDomNode>(child: T): T {
    if (child.parentNode !== null) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.push(child);
    return child;
  }
  insertBefore<T extends MountedDomNode>(child: T, before: MountedDomNode | null): T {
    if (before === null) return this.appendChild(child);
    const index = this.childNodes.indexOf(before);
    if (index < 0) throw new Error('mounted DOM insertBefore target is not a child');
    if (child.parentNode !== null) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.splice(index, 0, child);
    return child;
  }
  removeChild<T extends MountedDomNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error('mounted DOM removeChild target is not a child');
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  replaceChildren(...children: MountedDomNode[]): void {
    for (const child of [...this.childNodes]) this.removeChild(child);
    for (const child of children) this.appendChild(child);
  }
  addEventListener(type: string, listener: unknown): void {
    const callback = typeof listener === 'function'
      ? listener as MountedDomEventListener
      : listener !== null && typeof listener === 'object' && typeof (listener as { readonly handleEvent?: unknown }).handleEvent === 'function'
        ? event => (listener as { readonly handleEvent: MountedDomEventListener }).handleEvent(event)
        : undefined;
    if (callback === undefined) return;
    const callbacks = this.listeners.get(type) ?? new Set<MountedDomEventListener>();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }
  attachEvent(type: string, listener: unknown): void { this.addEventListener(type.replace(/^on/, ''), listener); }
  detachEvent(type: string, listener: unknown): void { this.removeEventListener(type.replace(/^on/, ''), listener); }
  removeEventListener(type: string, listener: unknown): void {
    if (typeof listener === 'function') this.listeners.get(type)?.delete(listener as MountedDomEventListener);
  }
  dispatchEvent(event: MountedDomEvent): boolean {
    if (event.target === null) event.target = this;
    const notify = (current: MountedDomNode, phase: number): boolean => {
      event.currentTarget = current;
      event.eventPhase = phase;
      for (const listener of [...(current.listeners.get(event.type) ?? [])]) listener(event);
      return !event.cancelBubble;
    };
    if (notify(this, 2) && event.bubbles) {
      for (let current = this.parentNode; current !== null; current = current.parentNode) {
        if (!notify(current, 3)) break;
      }
    }
    event.currentTarget = null;
    event.eventPhase = 0;
    return !event.defaultPrevented;
  }
  contains(node: MountedDomNode | null): boolean {
    return node === this || this.childNodes.some(child => child.contains(node));
  }
  getRootNode(): MountedDomNode {
    if (this.parentNode === null) return this;
    let root = this.parentNode;
    while (root.parentNode !== null) root = root.parentNode;
    return root;
  }
  remove(): void { this.parentNode?.removeChild(this); }
}

class MountedDomText extends MountedDomNode {
  constructor(value: string, ownerDocument: MountedDomDocument) {
    super(MountedDomNode.TEXT_NODE, '#text', ownerDocument);
    this.nodeValue = value;
  }
}
class MountedDomComment extends MountedDomNode {
  constructor(value: string, ownerDocument: MountedDomDocument) {
    super(MountedDomNode.COMMENT_NODE, '#comment', ownerDocument);
    this.nodeValue = value;
  }
}

class MountedDomStyle {
  [property: string]: unknown;
  cssText = '';
  setProperty(property: string, value: string): void { this[property] = value; }
  removeProperty(property: string): void { delete this[property]; }
}

class MountedDomElement extends MountedDomNode {
  readonly attributes = new Map<string, string>();
  readonly style = new MountedDomStyle();
  readonly tagName: string;
  readonly localName: string;
  readonly namespaceURI: string;
  className = '';
  id = '';
  value = '';
  defaultValue = '';
  type = '';
  name = '';
  checked = false;
  defaultChecked = false;
  disabled = false;
  private selectedState = false;
  multiple = false;
  min = '';
  max = '';
  step = '';
  htmlFor = '';
  files: FileList | null = null;

  constructor(tagName: string, ownerDocument: MountedDomDocument, namespaceURI = 'http://www.w3.org/1999/xhtml') {
    super(MountedDomNode.ELEMENT_NODE, tagName.toUpperCase(), ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.localName = tagName.toLowerCase();
    this.namespaceURI = namespaceURI;
    if (this.localName === 'input') {
      let inputValue = '';
      Object.defineProperty(this, 'value', {
        configurable: true,
        enumerable: true,
        get: () => inputValue,
        set: (next: string) => {
          inputValue = String(next);
          if (this.type === 'file' && inputValue === '') this.files = null;
        },
      });
    } else if (this.localName === 'textarea') {
      // React initializes textareas through defaultValue/textContent. Match the
      // browser's pristine-versus-dirty value behavior instead of a plain field.
      let textareaValue = '';
      let dirtyValue = false;
      Object.defineProperty(this, 'value', {
        configurable: true,
        enumerable: true,
        get: () => textareaValue,
        set: (next: string) => { textareaValue = String(next); dirtyValue = true; },
      });
      Object.defineProperty(this, 'defaultValue', {
        configurable: true,
        enumerable: true,
        get: () => this.textContent,
        set: (next: string) => {
          this.textContent = String(next);
          if (!dirtyValue) textareaValue = String(next);
        },
      });
    } else if (this.localName === 'select') {
      let selectValue = '';
      Object.defineProperty(this, 'value', {
        configurable: true,
        enumerable: true,
        get: () => selectValue,
        set: (next: string) => {
          selectValue = String(next);
          const selectedOption = this.options.find(option => option.value === selectValue);
          for (const option of this.options) option.selectedState = option === selectedOption;
        },
      });
    }
  }

  get selected(): boolean { return this.selectedState; }
  set selected(next: boolean) {
    this.selectedState = next === true;
    if (!this.selectedState) return;
    const parent = this.parentNode;
    if (!(parent instanceof MountedDomElement) || parent.localName !== 'select' || parent.multiple) return;
    for (const option of parent.options) {
      if (option !== this) option.selectedState = false;
    }
  }

  get options(): MountedDomElement[] {
    return this.childNodes.filter(child => child instanceof MountedDomElement && child.localName === 'option') as MountedDomElement[];
  }
  appendChild<T extends MountedDomNode>(child: T): T {
    const appended = super.appendChild(child);
    if (this.localName === 'select' && appended instanceof MountedDomElement && appended.localName === 'option' && appended.selected && !this.multiple) {
      for (const option of this.options) {
        if (option !== appended) option.selectedState = false;
      }
    }
    return appended;
  }

  insertBefore<T extends MountedDomNode>(child: T, before: MountedDomNode | null): T {
    const inserted = super.insertBefore(child, before);
    if (this.localName === 'select' && inserted instanceof MountedDomElement && inserted.localName === 'option' && inserted.selected && !this.multiple) {
      for (const option of this.options) {
        if (option !== inserted) option.selectedState = false;
      }
    }
    return inserted;
  }

  setAttribute(name: string, value: string): void {
    const key = name.toLowerCase();
    this.attributes.set(key, String(value));
    if (key === 'class') this.className = String(value);
    else if (key === 'id') this.id = String(value);
    else if (key === 'value') this.value = String(value);
    else if (key === 'type') this.type = String(value);
    else if (key === 'name') this.name = String(value);
    else if (key === 'for') this.htmlFor = String(value);
    else if (key === 'checked') this.checked = true;
    else if (key === 'selected') this.selected = true;
    else if (key === 'disabled') this.disabled = true;
    else if (key === 'multiple') this.multiple = true;
  }
  setAttributeNS(_namespace: string | null, name: string, value: string): void { this.setAttribute(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name.toLowerCase()) ?? null; }
  getAttributeNS(_namespace: string | null, name: string): string | null { return this.getAttribute(name); }
  hasAttribute(name: string): boolean { return this.attributes.has(name.toLowerCase()); }
  removeAttribute(name: string): void {
    const key = name.toLowerCase();
    this.attributes.delete(key);
    if (key === 'checked') this.checked = false;
    else if (key === 'selected') this.selected = false;
    else if (key === 'disabled') this.disabled = false;
    else if (key === 'multiple') this.multiple = false;
  }
  removeAttributeNS(_namespace: string | null, name: string): void { this.removeAttribute(name); }
  getElementsByTagName(tagName: string): MountedDomElement[] {
    const match = tagName.toLowerCase();
    return this.childNodes.flatMap(child => child instanceof MountedDomElement
      ? [ ...(match === '*' || child.localName === match ? [child] : []), ...child.getElementsByTagName(tagName) ]
      : []);
  }
  querySelectorAll(selector: string): MountedDomElement[] {
    const testId = selector.match(/^\[data-testid=["']([^"']+)["']\]$/)?.[1];
    const tag = selector.match(/^[A-Za-z][A-Za-z0-9-]*$/)?.[0]?.toLowerCase();
    return this.getElementsByTagName('*').filter(element => testId !== undefined
      ? element.getAttribute('data-testid') === testId
      : tag !== undefined && element.localName === tag);
  }
  querySelector(selector: string): MountedDomElement | null { return this.querySelectorAll(selector)[0] ?? null; }
  focus(): void { this.ownerDocument.activeElement = this; }
  blur(): void { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  click(): void { this.dispatchEvent(new MountedDomEvent('click', { bubbles: true, cancelable: true })); }
  getBoundingClientRect(): { readonly top: number; readonly left: number; readonly right: number; readonly bottom: number; readonly width: number; readonly height: number } {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
}

class MountedCanvasElement extends MountedDomElement {
  width = 300;
  height = 150;
  private readonly context: Record<string, unknown>;

  constructor(ownerDocument: MountedDomDocument, width: number, height: number) {
    super('canvas', ownerDocument);
    this.width = width;
    this.height = height;
    const noOp = (): undefined => undefined;
    const target: Record<string, unknown> = {
      canvas: this,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }),
      getImageData: (left: number, top: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h, left, top }),
    };
    for (const method of ['save', 'restore', 'beginPath', 'rect', 'clip', 'fillRect', 'drawImage', 'moveTo', 'lineTo', 'closePath', 'stroke', 'putImageData', 'scale', 'translate', 'rotate', 'clearRect', 'fill', 'strokeRect', 'fillText', 'strokeText', 'setLineDash']) {
      target[method] = noOp;
    }
    this.context = new Proxy(target, {
      get: (value, property, receiver) => {
        if (Reflect.has(value, property)) return Reflect.get(value, property, receiver);
        if (typeof property === 'symbol') return undefined;
        Reflect.set(value, property, noOp);
        return noOp;
      },
    });
  }

  getContext(contextId: string): Record<string, unknown> | null { return contextId === '2d' ? this.context : null; }
  toDataURL(): string { return 'data:image/png;base64,'; }
  toBlob(callback: (blob: Blob | null) => void): void { callback(new Blob()); }
}

class MountedDomDocument extends MountedDomNode {
  readonly documentElement: MountedDomElement;
  readonly body: MountedDomElement;
  readonly implementation = {};
  defaultView: MountedDomWindow | null = null;
  activeElement: MountedDomElement | null = null;

  constructor() {
    super(MountedDomNode.DOCUMENT_NODE, '#document', null as unknown as MountedDomDocument);
    this.ownerDocument = this;
    this.documentElement = new MountedDomElement('html', this);
    this.body = new MountedDomElement('body', this);
    this.appendChild(this.documentElement).appendChild(this.body);
  }

  createElement(tagName: string): MountedDomElement {
    return tagName.toLowerCase() === 'canvas' ? new MountedCanvasElement(this, 300, 150) : new MountedDomElement(tagName, this);
  }
  createElementNS(namespaceURI: string, tagName: string): MountedDomElement { return new MountedDomElement(tagName, this, namespaceURI); }
  createTextNode(value: string): MountedDomText { return new MountedDomText(value, this); }
  createComment(value: string): MountedDomComment { return new MountedDomComment(value, this); }
  getElementById(id: string): MountedDomElement | null { return this.documentElement.getElementsByTagName('*').find(element => element.id === id) ?? null; }
  querySelector(selector: string): MountedDomElement | null { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector: string): MountedDomElement[] { return this.documentElement.querySelectorAll(selector); }
  createEvent(type: string): MountedDomEvent { return new MountedDomEvent(type); }
  hasFocus(): boolean { return true; }
}

class MountedDomWindow {
  readonly window = this;
  readonly self = this;
  readonly navigator = { userAgent: 'mounted-source-editor-selftest' };
  HTMLIFrameElement = MountedDomElement;
  constructor(readonly document: MountedDomDocument) {}
  addEventListener(): void {}
  removeEventListener(): void {}
  getComputedStyle(): Record<string, string> { return {}; }
  getSelection(): null { return null; }
}

function installMountedDomGlobals(document: MountedDomDocument): () => void {
  const window = new MountedDomWindow(document);
  document.defaultView = window;
  const values: Record<string, unknown> = {
    window, self: window, document, navigator: window.navigator,
    Node: MountedDomNode, Element: MountedDomElement, HTMLElement: MountedDomElement,
    SVGElement: MountedDomElement, Text: MountedDomText, Event: MountedDomEvent,
    EventTarget: MountedDomNode, Document: MountedDomDocument, HTMLCanvasElement: MountedCanvasElement,
    HTMLIFrameElement: MountedDomElement, HTMLSelectElement: MountedDomElement, HTMLOptionElement: MountedDomElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, enumerable: false, writable: true, value });
  }
  Object.assign(window, {
    Node: MountedDomNode, Element: MountedDomElement, HTMLElement: MountedDomElement,
    SVGElement: MountedDomElement, Text: MountedDomText, Event: MountedDomEvent,
    EventTarget: MountedDomNode, Document: MountedDomDocument, HTMLCanvasElement: MountedCanvasElement,
    HTMLIFrameElement: MountedDomElement, HTMLSelectElement: MountedDomElement, HTMLOptionElement: MountedDomElement,
  });
  return () => {
    for (const [key, descriptor] of previous) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
      else Object.defineProperty(globalThis, key, descriptor);
    }
  };
}

function mountedElementByTestId(root: MountedDomNode, testId: string): MountedDomElement | null {
  if (root instanceof MountedDomElement && root.getAttribute('data-testid') === testId) return root;
  for (const child of root.childNodes) {
    const found = mountedElementByTestId(child, testId);
    if (found !== null) return found;
  }
  return null;
}

function mountedElementByTestIdPrefix(root: MountedDomNode, prefix: string): MountedDomElement | null {
  if (root instanceof MountedDomElement && (root.getAttribute('data-testid') ?? '').startsWith(prefix)) return root;
  for (const child of root.childNodes) {
    const found = mountedElementByTestIdPrefix(child, prefix);
    if (found !== null) return found;
  }
  return null;
}

function mountedReactClickCallback(element: MountedDomElement, detail: string): () => void {
  const propsKey = Object.getOwnPropertyNames(element).find(key => key.startsWith('__reactProps$'));
  assert.ok(propsKey !== undefined, `${detail}: mounted React props were not retained on the real DOM node`);
  const props = (element as unknown as Record<string, unknown>)[propsKey];
  assert.ok(props !== null && typeof props === 'object' && !Array.isArray(props), `${detail}: mounted React props were malformed`);
  const callback = (props as Record<string, unknown>).onClick;
  assert.equal(typeof callback, 'function', `${detail}: the real mounted onClick callback was not retained`);
  return callback as () => void;
}

function mountedElementText(root: MountedDomNode, testId: string): string {
  return mountedElementByTestId(root, testId)?.textContent ?? '';
}
function mountedOptionByText(select: MountedDomElement, text: string): MountedDomElement | null {
  return select.options.find(option => option.textContent === text) ?? null;
}

type MountedCandidateProjectionReceipt = {
  readonly initialOwnerBuilds: number;
  readonly initialCandidateCatalogBuilds: number;
  readonly initialCandidateMaterializations: number;
  readonly initialProvisionalProjectionCalls: number;
  readonly profileOnlyOwnerBuilds: number;
  readonly profileOnlyCandidateCatalogBuilds: number;
  readonly profileOnlyCandidateMaterializations: number;
  readonly profileOnlyProvisionalProjectionCalls: number;
  readonly sameWorkspaceParentOwnerBuilds: number;
  readonly sameWorkspaceParentCandidateCatalogBuilds: number;
  readonly sameWorkspaceParentCandidateMaterializations: number;
  readonly sameWorkspaceParentProvisionalProjectionCalls: number;
  readonly newWorkspaceOwnerBuilds: number;
  readonly newWorkspaceCandidateCatalogBuilds: number;
  readonly newWorkspaceCandidateMaterializations: number;
  readonly newWorkspaceProvisionalProjectionCalls: number;
  readonly selectedPath: string;
  readonly selectedTargetId: string;
};

type MountedCandidateProjectionHarnessProps = {
  readonly React: typeof React;
  readonly createX4UiEditorSessionOwner: (workspace: unknown) => unknown;
  readonly reconcileX4UiEditorSelections: typeof reconcileX4UiEditorSelections;
  readonly sourceCandidatesFor: (value: unknown) => readonly unknown[];
  readonly previewFor: (value: unknown) => unknown;
  readonly asRecord: (value: unknown) => Record<string, unknown> | null;
  readonly workspace: unknown;
  readonly canonicalCorpus: unknown;
  readonly profileValue: unknown;
  readonly enabledEntryIds: readonly string[];
  readonly manualSessionInput: {
    readonly manualCalibrations: readonly unknown[];
    readonly enabledManualEntryIds: readonly string[];
  };
  readonly canonicalColorEvidence: unknown;
  readonly activePresetId: string | null;
  readonly sourceSelector: string;
  readonly targetSelector: string;
  readonly parentRevision: number;
  readonly targetKeyDrift?: {
    readonly initial: string;
    readonly replacement: string;
  };
  readonly observed: { latestSelection?: unknown };
};

function compileMountedCandidateProjectionHarness(): React.ComponentType<MountedCandidateProjectionHarnessProps> {
  const ownerStartMarker = '  const sessionOwner = useMemo(';
  const ownerStartOffset = sourceText.indexOf(ownerStartMarker);
  const ownerEndOffset = sourceText.indexOf('\n\n  useEffect(() => {', ownerStartOffset);
  const selectionStartMarker = '  const selection = useMemo(() => {';
  const selectionStartOffset = sourceText.indexOf(selectionStartMarker);
  const selectionEndOffset = sourceText.indexOf('\n\n  const sessionInput = useMemo', selectionStartOffset);
  if (ownerStartOffset < 0 || ownerEndOffset < 0 || selectionStartOffset < 0 || selectionEndOffset < 0) {
    throw new Error('could not locate the actual SourceEditor owner/candidate memo blocks');
  }
  const ownerSource = sourceText.slice(ownerStartOffset, ownerEndOffset);
  const selectionSource = sourceText.slice(selectionStartOffset, selectionEndOffset);
  const compiled = transpileModule([
    'export default function MountedCandidateProjectionHarness(props) {',
    'const { React, createX4UiEditorSessionOwner, reconcileX4UiEditorSelections, sourceCandidatesFor, previewFor, asRecord, workspace, canonicalCorpus, profileValue, enabledEntryIds, manualSessionInput, canonicalColorEvidence, activePresetId, sourceSelector, targetSelector: requestedTargetSelector, parentRevision, targetKeyDrift, observed } = props;',
    'const useMemo = React.useMemo;',
    'const useEffect = React.useEffect;',
    'const [mountedTargetSelector, setMountedTargetSelector] = React.useState(requestedTargetSelector);',
    'const targetSelector = mountedTargetSelector;',
    'const previewContinuation = undefined;',
    ownerSource,
    selectionSource,
    'useEffect(() => {',
    '  if (selection.reconciled.targetSelector !== mountedTargetSelector) setMountedTargetSelector(selection.reconciled.targetSelector);',
    '}, [selection.reconciled.targetSelector, mountedTargetSelector]);',
    'observed.latestMountedTargetSelector = mountedTargetSelector;',
    'observed.latestSelection = selection;',
    'const targetSelect = React.createElement("select", { "data-testid": "x4-ui-mounted-target-selector", value: mountedTargetSelector, onChange: event => setMountedTargetSelector(event.target.value) }, [React.createElement("option", { key: "", value: "" }, "Select target…"), ...(selection.source?.targets ?? []).map(target => React.createElement("option", { key: target.key, value: target.key }, target.label))]);',
    'return React.createElement(React.Fragment, null, targetKeyDrift === undefined ? null : targetSelect, React.createElement("output", { "data-testid": "x4-ui-candidate-projection-harness", "data-parent-revision": parentRevision }, String(parentRevision)));',
    '}',
  ].join('\n'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const commonJsExports: Record<string, unknown> = {};
  const commonJsModule = { exports: commonJsExports };
  runInNewContext(compiled, { module: commonJsModule, exports: commonJsExports });
  const harness = (commonJsModule.exports as { readonly default?: unknown }).default;
  if (typeof harness !== 'function') throw new Error('actual SourceEditor owner/candidate memo harness was not callable');
  return harness as React.ComponentType<MountedCandidateProjectionHarnessProps>;
}

async function runMountedCandidateProjectionRegression(): Promise<MountedCandidateProjectionReceipt> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const Harness = compileMountedCandidateProjectionHarness();
  const candidateSourceIdentity = Object.freeze({
    file: 'ui/candidate-profile-independent.lua',
    sourcePath: 'ui/candidate-profile-independent.lua',
    sha256: 'A'.repeat(64),
  });
  const candidateTarget = Object.freeze({ id: 'candidate-target', kind: 'function', name: 'menu.display' });
  const candidateView = Object.freeze({
    raw: Object.freeze({}),
    index: 0,
    path: 'ui/candidate-profile-independent.lua',
    key: 'candidate-source',
    sourceIdentity: candidateSourceIdentity,
    targets: Object.freeze([Object.freeze({ raw: candidateTarget, key: 'candidate-target', label: 'menu.display' })]),
  });
  let ownerBuilds = 0;
  let candidateCatalogBuilds = 0;
  let candidateMaterializations = 0;
  let provisionalProjectionCalls = 0;
  let activeCandidateView = candidateView;
  const createCountingOwner = (): unknown => {
    ownerBuilds += 1;
    candidateCatalogBuilds += 1;
    activeCandidateView = candidateView;
    const candidateCatalog = Object.freeze({ sourceCandidates: Object.freeze([candidateView.raw]) });
    return Object.freeze({
      candidateCatalog,
      project: (): unknown => {
        provisionalProjectionCalls += 1;
        return Object.freeze({ preview: candidateCatalog });
      },
    });
  };
  const sourceCandidatesForHarness = (): readonly unknown[] => {
    candidateMaterializations += 1;
    return Object.freeze([activeCandidateView]);
  };
  const previewForHarness = (value: unknown): unknown => (
    value !== null && typeof value === 'object' && 'preview' in value
      ? (value as { readonly preview: unknown }).preview
      : Object.freeze({ sourceCandidates: Object.freeze([]) })
  );
  const asRecordHarness = (value: unknown): Record<string, unknown> | null => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  );
  const enabledEntryIds = Object.freeze([]) as readonly string[];
  const manualSessionInput = Object.freeze({
    manualCalibrations: Object.freeze([]),
    enabledManualEntryIds: Object.freeze([]),
  });
  const observed: { latestSelection?: unknown } = {};
  const initialWorkspace = Object.freeze({ id: 'candidate-workspace-one' });
  const replacementWorkspace = Object.freeze({ id: 'candidate-workspace-two' });
  const initialProfile = Object.freeze({ width: 320, height: 360, uiScale: 0.4 });
  const changedProfile = Object.freeze({ width: 480, height: 360, uiScale: 0.4 });
  const snapshot = (): readonly [number, number, number, number] => [
    ownerBuilds,
    candidateCatalogBuilds,
    candidateMaterializations,
    provisionalProjectionCalls,
  ];
  const delta = (
    before: readonly [number, number, number, number],
    after: readonly [number, number, number, number],
  ): readonly [number, number, number, number] => after.map((value, index) => value - before[index]) as unknown as readonly [number, number, number, number];
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
    });
  };
  let root: ReturnType<typeof createRoot> | undefined;
  const renderHarness = async (workspaceValue: unknown, profileValue: unknown, parentRevision: number): Promise<void> => {
    await flush(() => {
      root ??= createRoot(container as unknown as Element);
      root.render(<Harness
        React={React}
        createX4UiEditorSessionOwner={createCountingOwner}
        reconcileX4UiEditorSelections={reconcileX4UiEditorSelections}
        sourceCandidatesFor={sourceCandidatesForHarness}
        previewFor={previewForHarness}
        asRecord={asRecordHarness}
        workspace={workspaceValue}
        canonicalCorpus={null}
        profileValue={profileValue}
        enabledEntryIds={enabledEntryIds}
        manualSessionInput={manualSessionInput}
        canonicalColorEvidence={undefined}
        activePresetId={null}
        sourceSelector="candidate-source"
        targetSelector="candidate-target"
        parentRevision={parentRevision}
        observed={observed}
      />);
    });
  };
  try {
    await renderHarness(initialWorkspace, initialProfile, 0);
    const initial = snapshot();
    const beforeProfileOnly = snapshot();
    await renderHarness(initialWorkspace, changedProfile, 1);
    const profileOnly = delta(beforeProfileOnly, snapshot());
    const beforeSameWorkspaceParent = snapshot();
    await renderHarness(initialWorkspace, changedProfile, 2);
    const sameWorkspaceParent = delta(beforeSameWorkspaceParent, snapshot());
    const beforeNewWorkspace = snapshot();
    await renderHarness(replacementWorkspace, changedProfile, 3);
    const newWorkspace = delta(beforeNewWorkspace, snapshot());
    const selection = observed.latestSelection as { readonly selection?: { readonly path?: unknown; readonly target?: { readonly id?: unknown } } } | undefined;
    return {
      initialOwnerBuilds: initial[0],
      initialCandidateCatalogBuilds: initial[1],
      initialCandidateMaterializations: initial[2],
      initialProvisionalProjectionCalls: initial[3],
      profileOnlyOwnerBuilds: profileOnly[0],
      profileOnlyCandidateCatalogBuilds: profileOnly[1],
      profileOnlyCandidateMaterializations: profileOnly[2],
      profileOnlyProvisionalProjectionCalls: profileOnly[3],
      sameWorkspaceParentOwnerBuilds: sameWorkspaceParent[0],
      sameWorkspaceParentCandidateCatalogBuilds: sameWorkspaceParent[1],
      sameWorkspaceParentCandidateMaterializations: sameWorkspaceParent[2],
      sameWorkspaceParentProvisionalProjectionCalls: sameWorkspaceParent[3],
      newWorkspaceOwnerBuilds: newWorkspace[0],
      newWorkspaceCandidateCatalogBuilds: newWorkspace[1],
      newWorkspaceCandidateMaterializations: newWorkspace[2],
      newWorkspaceProvisionalProjectionCalls: newWorkspace[3],
      selectedPath: typeof selection?.selection?.path === 'string' ? selection.selection.path : '',
      selectedTargetId: typeof selection?.selection?.target?.id === 'string' ? selection.selection.target.id : '',
    };
  } finally {
    if (root !== undefined) {
      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    }
    restoreGlobals();
  }
}

type MountedDelimiterTargetReconciliationReceipt = {
  readonly requestedTargetKey: string;
  readonly replacementTargetKey: string;
  readonly targetSelectValueBeforeProjection: string;
  readonly targetSelectValueAfterProjection: string;
  readonly targetOptionAfterProjection: string;
  readonly selectedPath: string;
  readonly selectedTargetId: string;
  readonly targetResetObserved: boolean;
  readonly targetRetained: boolean;
};

async function runMountedDelimiterTargetReconciliationRegression(): Promise<MountedDelimiterTargetReconciliationReceipt> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const Harness = compileMountedCandidateProjectionHarness();
  const sourcePath = 'ui/addons/ai_influence_chat/aic_menu.lua';
  const sourceIdentity = Object.freeze({
    file: sourcePath,
    sourcePath,
    sha256: 'A'.repeat(64),
  });
  const targetId = 'target:ui/addons/ai_influence_chat/aic_menu.lua||8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD|function|ui/addons/ai_influence_chat/aic_menu.lua||315:0:16768|893:3:53651';
  const requestedTargetKey = `12:${targetId}:function`;
  const replacementTargetKey = `13:${targetId}:function`;
  const targetRaw = Object.freeze({ id: targetId, kind: 'function', name: 'menu.display' });
  const candidateRaw = Object.freeze({ path: sourcePath, sourceIdentity, targets: Object.freeze([targetRaw]) });
  const makeCandidateView = (targetKey: string): unknown => Object.freeze({
    raw: candidateRaw,
    index: 0,
    path: sourcePath,
    key: 'candidate-source',
    sourceIdentity,
    targets: Object.freeze([Object.freeze({ raw: targetRaw, key: targetKey, label: 'menu.display' })]),
  });
  let activeCandidateView = makeCandidateView(requestedTargetKey);
  const createCountingOwner = (workspaceValue: unknown): unknown => {
    const workspaceId = asRecordHarness(workspaceValue)?.id;
    const targetKey = workspaceId === 'delimiter-target-replacement' ? replacementTargetKey : requestedTargetKey;
    activeCandidateView = makeCandidateView(targetKey);
    const candidateCatalog = Object.freeze({ sourceCandidates: Object.freeze([candidateRaw]) });
    return Object.freeze({
      candidateCatalog,
      project: (): unknown => Object.freeze({ preview: candidateCatalog }),
    });
  };
  const sourceCandidatesForHarness = (): readonly unknown[] => Object.freeze([activeCandidateView]);
  const previewForHarness = (value: unknown): unknown => (
    value !== null && typeof value === 'object' && 'preview' in value
      ? (value as { readonly preview: unknown }).preview
      : Object.freeze({ sourceCandidates: Object.freeze([]) })
  );
  const asRecordHarness = (value: unknown): Record<string, unknown> | null => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  );
  const enabledEntryIds = Object.freeze([]) as readonly string[];
  const manualSessionInput = Object.freeze({ manualCalibrations: Object.freeze([]), enabledManualEntryIds: Object.freeze([]) });
  const canonicalColorEvidence = undefined;
  const activePresetId = null;
  const initialWorkspace = Object.freeze({ id: 'delimiter-target-initial' });
  const replacementWorkspace = Object.freeze({ id: 'delimiter-target-replacement' });
  const profileValue = Object.freeze({ width: 320, height: 360, uiScale: 0.4 });
  const observed: { latestSelection?: unknown } = {};
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  let root: ReturnType<typeof createRoot> | undefined;
  const renderHarness = async (workspaceValue: unknown, parentRevision: number): Promise<void> => {
    await flush(() => {
      root ??= createRoot(container as unknown as Element);
      root.render(<Harness
        React={React}
        createX4UiEditorSessionOwner={createCountingOwner}
        reconcileX4UiEditorSelections={reconcileX4UiEditorSelections}
        sourceCandidatesFor={sourceCandidatesForHarness}
        previewFor={previewForHarness}
        asRecord={asRecordHarness}
        workspace={workspaceValue}
        canonicalCorpus={null}
        profileValue={profileValue}
        enabledEntryIds={enabledEntryIds}
        manualSessionInput={manualSessionInput}
        canonicalColorEvidence={canonicalColorEvidence}
        activePresetId={activePresetId}
        sourceSelector="candidate-source"
        targetSelector={requestedTargetKey}
        parentRevision={parentRevision}
        targetKeyDrift={{ initial: requestedTargetKey, replacement: replacementTargetKey }}
        observed={observed}
      />);
    });
  };
  try {
    await renderHarness(initialWorkspace, 0);
    const initialTargetSelect = mountedElementByTestId(container, 'x4-ui-mounted-target-selector');
    if (initialTargetSelect === null) throw new Error('delimiter target mounted selector was not rendered');
    const initialTargetOption = initialTargetSelect.options.find(option => option.value === requestedTargetKey);
    if (initialTargetOption === undefined) throw new Error(`delimiter target option was not rendered: ${initialTargetSelect.options.map(option => option.value).join('|')}`);
    await flush(() => {
      initialTargetSelect.value = initialTargetOption.value;
      initialTargetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const targetSelectValueBeforeProjection = (observed as { readonly latestMountedTargetSelector?: unknown }).latestMountedTargetSelector;
    if (typeof targetSelectValueBeforeProjection !== 'string') throw new Error('delimiter target controlled selection was not committed');
    await renderHarness(replacementWorkspace, 1);
    const replacementTargetSelect = mountedElementByTestId(container, 'x4-ui-mounted-target-selector');
    if (replacementTargetSelect === null) throw new Error('delimiter target mounted selector disappeared after owner replacement');
    const selected = observed.latestSelection as { readonly selection?: { readonly path?: unknown; readonly target?: { readonly id?: unknown } } } | undefined;
    const mountedTargetSelector = (observed as { readonly latestMountedTargetSelector?: unknown }).latestMountedTargetSelector;
    const targetSelectValueAfterProjection = typeof mountedTargetSelector === 'string' && replacementTargetSelect.options.some(option => option.value === mountedTargetSelector)
      ? mountedTargetSelector
      : '';
    const targetOptionAfterProjection = replacementTargetSelect.options.find(option => option.value === replacementTargetKey)?.value ?? '';
    return {
      requestedTargetKey,
      replacementTargetKey,
      targetSelectValueBeforeProjection,
      targetSelectValueAfterProjection,
      targetOptionAfterProjection,
      selectedPath: typeof selected?.selection?.path === 'string' ? selected.selection.path : '',
      selectedTargetId: typeof selected?.selection?.target?.id === 'string' ? selected.selection.target.id : '',
      targetResetObserved: targetSelectValueAfterProjection === '',
      targetRetained: targetSelectValueBeforeProjection === requestedTargetKey
        && targetSelectValueAfterProjection === replacementTargetKey
        && targetOptionAfterProjection === replacementTargetKey,
    };
  } finally {
    if (root !== undefined) {
      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    }
    restoreGlobals();
  }
}

type MountedSourceEditorTransitionReceipt = {
  readonly initialCanvasStatus: string;
  readonly initialCanvasDetail: string;
  readonly parentInitialSnapshot: string;
  readonly sourceOnlyCanvasStatus: string;
  readonly sourceOnlyCanvasDetail: string;
  readonly parentSourceOnlySnapshot: string;
  readonly sourceOnlyCanvasRetained: boolean;
  readonly currentCanvasStatus: string;
  readonly currentCanvasDetail: string;
  readonly currentCanvasMounted: boolean;
  readonly currentCanvasReplaced: boolean;
  readonly currentCanvasWidth: number;
  readonly currentCanvasHeight: number;
  readonly targetCommitCanvasStatus: string;
  readonly parentTargetSnapshot: string;
  readonly parentTargetCallbackCanvasStatus: string;
  readonly parentTargetCallbackCanvasMounted: boolean;
  readonly parentTargetCallbackExportDisabled: boolean;
  readonly currentExportDisabled: boolean;
  readonly currentExportStatus: string;
  readonly currentExportProfile: string;
  readonly currentNativeBitmapWidth: string;
  readonly currentNativeBitmapHeight: string;
  readonly currentSourceIdentity: string;
  readonly currentTargetMetadata: string;
  readonly currentSceneStatus: string;
  readonly presetActive: boolean;
  readonly presetCanvasStatus: string;
  readonly presetExportDisabled: boolean;
  readonly staleCanvasStatus: string;
  readonly staleCanvasRetained: boolean;
  readonly staleExportStatus: string;
  readonly restoredCanvasStatus: string;
  readonly restoredCanvasReplaced: boolean;
  readonly restoredExportDisabled: boolean;
};

async function runMountedSourceEditorTransitionRegression(
  fixture: P7SourceAuthorityFixture,
  scopeProbe?: 'identical' | 'empty',
): Promise<MountedSourceEditorTransitionReceipt> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const transitionSourceContent = "-- Pipeline Test UI — X4 UI extension entry point\n-- Packaged at: extensions/pipeline_test/ui/pipeline_test.lua\n-- Registered by: extensions/pipeline_test/ui.xml (<environment type=\"menus\">)\n-- Generated from the visual designer by X4 Forge. Uses the corpus-backed\n-- standalone-menu lifecycle: lazy Helper -> deferred registration -> OpenMenu\n-- -> onShowMenu -> createFrameHandle/fTable -> frame:display().\n\nlocal widgets = {\n    { type = \"window\", id = \"w_win\", label = \"Pipeline Test Panel\", x = 120, y = 120, width = 280, height = 120 },\n    { type = \"header\", id = \"w_header\", label = \"B119 Pipeline Test\", x = 140, y = 140, width = 380, height = 32 },\n    { type = \"button\", id = \"w_btn\", label = \"My First Button\", x = 150, y = 170, width = 220, height = 40 },\n    { type = \"text\", id = \"w_status\", label = \"Status: source-first Forge preview\", x = 140, y = 182, width = 380, height = 32 },\n    { type = \"button\", id = \"w_btn_secondary\", label = \"Second Button\", x = 390, y = 230, width = 160, height = 40 },\n    { type = \"input\", id = \"w_input\", label = \"Operator note\", x = 140, y = 286, width = 410, height = 44 },\n}\n\nlocal Helper = rawget(_G, \"Helper\")\nlocal function refreshHelper()\n  if not Helper then Helper = rawget(_G, \"Helper\") end\n  return Helper\nend\n\nlocal menu = {\n  name = \"pipeline_test_menu\",\n  layer = 4,\n  active = false,\n  widgets = widgets,\n  transcript = \"\",\n}\n\nlocal function log(message)\n  if DebugError then DebugError(\"[pipeline_test] \" .. tostring(message)) end\nend\n\nfunction menu.ensureRegistered()\n  refreshHelper()\n  _G.Menus = _G.Menus or {}\n  local found = false\n  for i, existing in ipairs(_G.Menus) do\n    if existing.name == menu.name then _G.Menus[i] = menu; found = true; break end\n  end\n  if not found then table.insert(_G.Menus, menu) end\n  if Helper and Helper.registerMenu and not menu._registered then\n    local ok = pcall(Helper.registerMenu, menu)\n    menu._registered = ok\n  end\n  return menu._registered == true\nend\n\nfunction menu.open(context)\n  menu.context = type(context) == \"table\" and context or {}\n  if not menu.ensureRegistered() then\n    if SetScript then SetScript(\"onUpdate\", menu.retryOpen) end\n    return false\n  end\n  if OpenMenu then OpenMenu(menu.name, nil, nil, true)\n  elseif menu.onShowMenu then menu.onShowMenu() end\n  return true\nend\n\nfunction menu.retryOpen()\n  if not menu.ensureRegistered() then return end\n  if RemoveScript then RemoveScript(\"onUpdate\", menu.retryOpen) end\n  menu.open(menu.context)\nend\n\nfunction menu.onShowMenu()\n  refreshHelper()\n  menu.active = true\n  menu.createFrame()\nend\n\nfunction menu.emit(widgetId, payload)\n  if AddUITriggeredEvent then AddUITriggeredEvent(menu.name, widgetId, payload or {}) end\nend\n\nfunction menu.createFrame()\n  refreshHelper()\n  if not Helper then log(\"Helper unavailable; frame not built\"); return end\n  if menu.frame and Helper.clearDataForRefresh then Helper.clearDataForRefresh(menu, menu.layer) end\n  local width = Helper.scaleX(530)\n  local height = Helper.scaleY(436)\n  local x = ((Helper.viewWidth or 1920) - width) / 2\n  local y = ((Helper.viewHeight or 1080) - height) / 2\n  menu.frame = Helper.createFrameHandle(menu, { x = x, y = y, width = width, height = height, layer = menu.layer, standardButtons = { close = true } })\n  local ftable = menu.frame:addTable(2, { tabOrder = 1, width = width, highlightMode = \"off\", reserveScrollBar = false })\n  ftable:setColWidthPercent(1, 55)\n  ftable:setColWidthPercent(2, 45)\n  local row\n  row = ftable:addRow(false, {})\n  row[1]:setColSpan(2):createText(\"Pipeline Test Panel\", Helper.headerRowCenteredProperties)\n  row = ftable:addRow(false, {})\n  row[1]:setColSpan(2):createText(\"B119 Pipeline Test\", Helper.headerRowCenteredProperties)\n  row = ftable:addRow(true, {})\n  row[1]:setColSpan(2):createButton({ active = true }):setText(\"My First Button\", { halign = \"center\" })\n  row[1].handlers.onClick = function() menu.emit(\"w_btn\", { widget = \"w_btn\" }) end\n  row = ftable:addRow(false, {})\n  row[1]:setColSpan(2):createText(\"Status: source-first Forge preview\", { wordwrap = true })\n  row = ftable:addRow(true, {})\n  row[1]:setColSpan(2):createButton({ active = true }):setText(\"Second Button\", { halign = \"center\" })\n  row[1].handlers.onClick = function() menu.emit(\"w_btn_secondary\", { widget = \"w_btn_secondary\" }) end\n  row = ftable:addRow(true, {})\n  row[1]:setColSpan(2):createEditBox({ defaultText = \"Type a note...\", maxChars = 255, height = 44 })\n  row[1].handlers.onEditBoxDeactivated = function(_, text) menu.emit(\"w_input\", { text = text }) end\n  menu.frame:display()\nend\n\nfunction menu.cleanup()\n  menu.frame = nil\n  menu.active = false\nend\n\nfunction menu.onCloseElement(dueToClose)\n  refreshHelper()\n  if Helper and Helper.closeMenu then Helper.closeMenu(menu, dueToClose) end\n  menu.cleanup()\nend\n\nfunction menu.close()\n  menu.onCloseElement(\"close\")\nend\n\n-- Deliberate opening path for MD/companion Lua: <raise_lua_event name=\"'pipeline_test_menu.open'\"/>.\nif RegisterEvent then RegisterEvent(\"pipeline_test_menu.open\", function(_, context) menu.open(context) end) end\n_G[\"pipeline_test_menu\"] = menu\n\n-- The beginner template opts into one visible first result. Ordinary authored menus do not auto-open.\nlocal function autoOpenWhenReady()\n  refreshHelper()\n  if not Helper then return end\n  if RemoveScript then RemoveScript(\"onUpdate\", autoOpenWhenReady) end\n  menu.open({ source = \"x4_forge_template\" })\nend\nif SetScript then SetScript(\"onUpdate\", autoOpenWhenReady) end\n\n\nreturn menu\n";
  const transitionWorkspace = {
    ...workspace,
    id: 'x4-ui-source-editor-mounted-transition',
    compileSettings: { ui: true },
    passthroughFiles: [
      {
        path: 'ui.xml',
        content: '<?xml version="1.0" encoding="utf-8"?>\n<addon name="pipeline_test" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="../../ui/core/addon.xsd">\n  <environment type="menus">\n    <file name="ui/pipeline_test.lua" />\n  </environment>\n</addon>',
        reason: 'unknown_domain',
      },
      {
        path: 'ui/pipeline_test.lua',
        content: transitionSourceContent,
        reason: 'partial',
      },
    ],
  };
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const canonicalLoader = async (): Promise<{ readonly core: P7SourceAuthorityFixture['core']; readonly color: P7SourceAuthorityFixture['color'] }> => ({
    core: fixture.core,
    color: fixture.color,
  });
  const mountedSurfaceFactory = (width: number, height: number): MountedCanvasElement => new MountedCanvasElement(mountedDocument, width, height);
  const parentSnapshotCallbacks: Array<{
    readonly snapshot: string;
    readonly canvasStatus: string;
    readonly canvasMounted: boolean;
    readonly exportDisabled: boolean;
  }> = [];
  let renderedWorkspace = transitionWorkspace;
  let renderedScope = scopeProbe === undefined ? undefined : 'transition-scope-a';
  let requestParentRender: (() => void) | undefined;
  const MountedSourceEditorParent = (): React.ReactElement => {
    const [parentVerificationSnapshot, setParentVerificationSnapshot] = React.useState<unknown>(null);
    const [, setParentRevision] = React.useState(0);
    requestParentRender = () => setParentRevision(previous => previous + 1);
    const onVerificationSnapshotChange = React.useCallback((snapshot: unknown): void => {
      const exportControl = mountedElementByTestId(container, 'x4-ui-canvas-export');
      parentSnapshotCallbacks.push({
        snapshot: snapshot === null ? 'null' : JSON.stringify(snapshot),
        canvasStatus: mountedElementText(container, 'x4-ui-canvas-status'),
        canvasMounted: (mountedElementByTestId(container, 'x4-ui-canvas-host')?.firstElementChild ?? null) !== null,
        exportDisabled: exportControl?.disabled === true,
      });
      setParentVerificationSnapshot(snapshot);
    }, []);
    return (
      <>
        <div data-testid="x4-ui-parent-verification-snapshot">
          {parentVerificationSnapshot === null ? 'null' : JSON.stringify(parentVerificationSnapshot)}
        </div>
        <X4UiSourceEditor
          workspace={renderedWorkspace}
          workspaceScope={renderedScope}
          corpusLoader={canonicalLoader}
          surfaceFactory={mountedSurfaceFactory}
          onVerificationSnapshotChange={onVerificationSnapshotChange}
        />
      </>
    );
  };
  let root: ReturnType<typeof createRoot> | undefined;
  const requestParentRenderOnChange = (): void => requestParentRender?.();
  container.addEventListener('change', requestParentRenderOnChange);
  try {
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<React.StrictMode><MountedSourceEditorParent /></React.StrictMode>);
    });
    const sourceSelect = mountedElementByTestId(container, 'x4-ui-source-selector');
    const targetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (sourceSelect === null || targetSelect === null) throw new Error('mounted SourceEditor selectors were not rendered');
    const sourceOption = mountedOptionByText(sourceSelect, 'ui/pipeline_test.lua');
    if (sourceOption === null) throw new Error('mounted SourceEditor did not expose ui/pipeline_test.lua');
    const initialCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const initialCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const parentInitialSnapshot = mountedElementText(container, 'x4-ui-parent-verification-snapshot');

    let sourceOnlyCanvasStatus = '';
    let sourceOnlyCanvasDetail = '';
    let sourceOnlyCanvas: MountedDomElement | null = null;
    let targetCommitCanvasStatus = '';
    await act(async () => {
      flushSync(() => {
        sourceSelect.value = sourceOption.value;
        sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      });
    });
    const sourceOnlyTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (sourceOnlyTargetSelect === null) throw new Error('target selector disappeared after source selection');
    sourceOnlyCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    sourceOnlyCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const parentSourceOnlySnapshot = mountedElementText(container, 'x4-ui-parent-verification-snapshot');
    const sourceOnlyHost = mountedElementByTestId(container, 'x4-ui-canvas-host');
    sourceOnlyCanvas = sourceOnlyHost?.firstElementChild ?? null;
    const targetOption = mountedOptionByText(sourceOnlyTargetSelect, 'menu.createFrame');
    if (targetOption === null) throw new Error('mounted SourceEditor did not expose menu.createFrame');
    await act(async () => {
      flushSync(() => {
        targetSelect.value = targetOption.value;
        targetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      });
      targetCommitCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    });
    const parentTargetSnapshot = mountedElementText(container, 'x4-ui-parent-verification-snapshot');
    const parentTargetCallback = parentSnapshotCallbacks
      .find(callback => callback.snapshot.includes('ui/pipeline_test.lua') && callback.snapshot.includes('menu.createFrame'));
    const currentHost = mountedElementByTestId(container, 'x4-ui-canvas-host');
    const currentCanvas = currentHost?.firstElementChild;
    const currentExport = mountedElementByTestId(container, 'x4-ui-canvas-export');
    const currentCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const currentCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const currentSourceIdentity = mountedElementText(container, 'x4-ui-selected-source-identity');
    const currentTargetMetadata = mountedElementText(container, 'x4-ui-canvas-export-target');
    const currentSceneStatus = mountedElementText(container, 'x4-ui-preview-geometry-scene-status');
    const currentExportStatus = mountedElementText(container, 'x4-ui-canvas-export-status');
    const currentExportProfile = mountedElementText(container, 'x4-ui-canvas-export-profile');
    const currentNativeBitmapWidth = mountedElementText(container, 'x4-ui-canvas-export-native-width');
    const currentNativeBitmapHeight = mountedElementText(container, 'x4-ui-canvas-export-native-height');
    if (currentCanvas === null) {
      throw new Error(`current transition did not mount a canvas: status=${currentCanvasStatus}, detail=${currentCanvasDetail}, exportDisabled=${String(currentExport?.disabled)}`);
    }

    const preset = KEEP_OUT_PRESETS.find(candidate => candidate.members.some(member => member.applicability === 'applicable')) ?? KEEP_OUT_PRESETS[0];
    if (preset === undefined) throw new Error('mounted SourceEditor has no keep-out preset fixture');
    const presetButton = mountedElementByTestId(container, `x4-ui-keepout-preset-${preset.id}`);
    if (presetButton === null) throw new Error(`mounted SourceEditor did not expose keep-out preset ${preset.id}`);
    await flush(() => presetButton.click());
    const activePresetButton = mountedElementByTestId(container, `x4-ui-keepout-preset-${preset.id}`);
    const offButton = mountedElementByTestId(container, 'x4-ui-keepout-off');
    const presetExport = mountedElementByTestId(container, 'x4-ui-canvas-export');
    const presetCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const presetActive = activePresetButton?.className.includes('border-cyan-400') === true
      && offButton?.className.includes('border-cyan-400') !== true;
    await flush(() => offButton?.click());
    const committedCanvasBeforeStale = mountedElementByTestId(container, 'x4-ui-canvas-host')?.firstElementChild ?? null;

    const currentTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (currentTargetSelect === null) throw new Error('target selector disappeared after exact target commit');
    await flush(() => {
      currentTargetSelect.value = '';
      currentTargetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const staleHost = mountedElementByTestId(container, 'x4-ui-canvas-host');
    const staleCanvas = staleHost?.firstElementChild;
    const staleCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const staleExportStatus = mountedElementText(container, 'x4-ui-canvas-export-status');

    const restoredTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (restoredTargetSelect === null) throw new Error('target selector disappeared while restoring exact selection');
    const restoredTargetOption = mountedOptionByText(restoredTargetSelect, 'menu.createFrame');
    if (restoredTargetOption === null) throw new Error('menu.createFrame disappeared while restoring exact selection');
    await flush(() => {
      restoredTargetSelect.value = restoredTargetOption.value;
      restoredTargetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const restoredHost = mountedElementByTestId(container, 'x4-ui-canvas-host');
    const restoredCanvas = restoredHost?.firstElementChild;
    const restoredExport = mountedElementByTestId(container, 'x4-ui-canvas-export');
    const restoredCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    if (scopeProbe !== undefined) {
      const originalWorkspaceBytes = JSON.stringify(transitionWorkspace);
      // React selects options directly; this fixture's select.value getter only tracks dispatched
      // input. Read selected options, as the existing history probes do, for render-driven changes.
      const selectedValue = (id: string): string => (
        mountedElementByTestId(container, id)?.options.find(option => option.selected)?.value ?? ''
      );
      const selectTarget = async (selected: boolean): Promise<void> => {
        const control = mountedElementByTestId(container, 'x4-ui-target-selector');
        assert.ok(control, 'scope transition must retain the target selector');
        const option = selected ? mountedOptionByText(control, 'menu.createFrame') : null;
        if (selected) assert.ok(option, 'scope transition must expose the original target');
        await flush(() => {
          control.value = option?.value ?? '';
          control.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
      };
      const mountedCanvas = (): MountedDomElement | null => (
        mountedElementByTestId(container, 'x4-ui-canvas-host')?.firstElementChild ?? null
      );
      await selectTarget(false);
      await flush(() => {
        renderedWorkspace = { ...transitionWorkspace };
        requestParentRender?.();
      });
      assert.ok(mountedCanvas() === restoredCanvas, 'same-scope workspace object churn must retain the prior stale canvas');
      assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'stale');
      assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-export')?.disabled, true);
      await selectTarget(true);
      const beforeSwitch = mountedCanvas();
      assert.ok(beforeSwitch instanceof MountedCanvasElement, 'scope probe must start from a rendered canvas');
      if (scopeProbe === 'identical') {
        let finishOldExport: ((blob: Blob | null) => void) | undefined;
        beforeSwitch.toBlob = callback => { finishOldExport = callback; };
        await flush(() => mountedElementByTestId(container, 'x4-ui-canvas-export')?.click());
        assert.ok(finishOldExport, 'scope probe must start a real pending PNG serialization');
        await flush(() => {
          renderedScope = 'transition-scope-identical';
          requestParentRender?.();
        });
        assert.ok(mountedCanvas() === null, 'unseen immutable scope must not inherit selection even with identical source and mod name');
        assert.equal(selectedValue('x4-ui-source-selector'), '');
        assert.equal(selectedValue('x4-ui-target-selector'), '');
        const independentSource = mountedElementByTestId(container, 'x4-ui-source-selector');
        const independentOption = independentSource && mountedOptionByText(independentSource, 'ui/pipeline_test.lua');
        assert.ok(independentSource && independentOption);
        await flush(() => {
          independentSource.value = independentOption.value;
          independentSource.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        await selectTarget(true);
        assert.ok(mountedCanvas() instanceof MountedCanvasElement && mountedCanvas() !== beforeSwitch,
          'explicit selection in an identical workspace must render a fresh canvas');
        assert.ok(beforeSwitch.parentNode === null, 'previous scope canvas must be detached');
        assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current');
        await flush(() => finishOldExport?.(new Blob(['png'], { type: 'image/png' })));
        assert.match(mountedElementText(container, 'x4-ui-canvas-export-status'), /changed before serialization completed/);
      }
      const beforeEmpty = mountedCanvas();
      await flush(() => {
        renderedWorkspace = { ...transitionWorkspace, uiWidgets: [], passthroughFiles: [] };
        renderedScope = 'transition-scope-empty';
        requestParentRender?.();
      });
      assert.ok(mountedCanvas() === null, 'independent empty workspace must not retain another workspace canvas');
      assert.ok(beforeEmpty?.parentNode === null, 'empty workspace must detach the prior scope canvas');
      assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'refused');
      assert.equal(mountedElementText(container, 'x4-ui-parent-verification-snapshot'), 'null');
      assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-export')?.disabled, true);
      await flush(() => {
        renderedWorkspace = transitionWorkspace;
        renderedScope = 'transition-scope-a';
        requestParentRender?.();
      });
      const returningSource = mountedElementByTestId(container, 'x4-ui-source-selector');
      assert.ok(returningSource, 'returning workspace must expose its source selector');
      const returningOption = mountedOptionByText(returningSource, 'ui/pipeline_test.lua');
      assert.ok(returningOption, 'returning workspace must retain canonical source');
      assert.equal(selectedValue('x4-ui-source-selector'), returningOption.value, 'return must restore the original file without a user reselect');
      assert.equal(selectedValue('x4-ui-target-selector'),
        mountedOptionByText(mountedElementByTestId(container, 'x4-ui-target-selector')!, 'menu.createFrame')?.value,
        'return must restore the original menu without a user reselect');
      assert.ok(mountedCanvas() instanceof MountedCanvasElement && mountedCanvas() !== beforeEmpty
        && mountedCanvas() !== beforeSwitch, 'returning workspace must render a fresh canvas, never borrow old pixels');
      assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current');
      assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-export')?.disabled, false);
      assert.notEqual(mountedElementText(container, 'x4-ui-parent-verification-snapshot'), 'null');

      const visitEmpty = async (): Promise<void> => flush(() => {
        renderedWorkspace = { ...transitionWorkspace, uiWidgets: [], passthroughFiles: [] };
        renderedScope = 'transition-scope-empty';
        requestParentRender?.();
      });
      const returnToOriginal = async (next = transitionWorkspace): Promise<void> => flush(() => {
        renderedWorkspace = next;
        renderedScope = 'transition-scope-a';
        requestParentRender?.();
      });
      await selectTarget(false);
      await visitEmpty();
      await returnToOriginal();
      assert.equal(selectedValue('x4-ui-source-selector'), returningOption.value,
        'explicitly cleared menu must retain its separately selected file');
      assert.equal(selectedValue('x4-ui-target-selector'), '',
        'return must preserve a deliberate menu deselection');
      assert.ok(mountedCanvas() === null, 'deliberate menu deselection must not restore old pixels');
      await selectTarget(true);
      await visitEmpty();
      await returnToOriginal({
        ...transitionWorkspace,
        passthroughFiles: transitionWorkspace.passthroughFiles.map(file => file.path === 'ui/pipeline_test.lua'
          ? { ...file, content: `${file.content}\n-- externally changed while away\n` } : file),
      });
      assert.ok(mountedCanvas() === null, 'changed source must reject remembered selection and old canvas');
      assert.equal(mountedElementText(container, 'x4-ui-parent-verification-snapshot'), 'null');
      assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-export')?.disabled, true);
      await visitEmpty();
      await returnToOriginal({ ...transitionWorkspace, uiWidgets: [], passthroughFiles: [] });
      assert.ok(mountedCanvas() === null, 'missing source must reject remembered selection');
      await visitEmpty();
      await returnToOriginal();
      assert.ok(mountedCanvas() instanceof MountedCanvasElement,
        'only the exact original catalog may resolve retained selection again');
      const clearedSource = mountedElementByTestId(container, 'x4-ui-source-selector');
      assert.ok(clearedSource);
      await flush(() => {
        clearedSource.value = '';
        clearedSource.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      });
      await visitEmpty();
      await returnToOriginal();
      assert.equal(selectedValue('x4-ui-source-selector'), '');
      assert.equal(selectedValue('x4-ui-target-selector'), '');
      assert.ok(mountedCanvas() === null, 'explicit file deselection must not be replaced by remembered or first source');
      assert.equal(JSON.stringify(transitionWorkspace), originalWorkspaceBytes, 'scope transitions must not mutate source');
    }
    return {
      initialCanvasStatus,
      initialCanvasDetail,
      parentInitialSnapshot,
      sourceOnlyCanvasStatus,
      sourceOnlyCanvasDetail,
      parentSourceOnlySnapshot,
      sourceOnlyCanvasRetained: sourceOnlyCanvas === null,
      currentCanvasStatus,
      currentCanvasDetail,
      currentCanvasMounted: currentCanvas instanceof MountedCanvasElement,
      currentCanvasReplaced: currentCanvas !== sourceOnlyCanvas,
      currentCanvasWidth: currentCanvas instanceof MountedCanvasElement ? currentCanvas.width : 0,
      currentCanvasHeight: currentCanvas instanceof MountedCanvasElement ? currentCanvas.height : 0,
      targetCommitCanvasStatus,
      parentTargetSnapshot,
      parentTargetCallbackCanvasStatus: parentTargetCallback?.canvasStatus ?? '',
      parentTargetCallbackCanvasMounted: parentTargetCallback?.canvasMounted === true,
      parentTargetCallbackExportDisabled: parentTargetCallback?.exportDisabled === true,
      currentExportDisabled: currentExport?.disabled === true,
      currentExportStatus,
      currentExportProfile,
      currentNativeBitmapWidth,
      currentNativeBitmapHeight,
      currentSourceIdentity,
      currentTargetMetadata,
      currentSceneStatus,
      presetActive,
      presetCanvasStatus,
      presetExportDisabled: presetExport?.disabled === true,
      staleCanvasStatus,
      staleCanvasRetained: staleCanvas === committedCanvasBeforeStale,
      staleExportStatus,
      restoredCanvasStatus,
      restoredCanvasReplaced: restoredCanvas !== committedCanvasBeforeStale,
      restoredExportDisabled: restoredExport?.disabled === true,
    };
  } finally {
    if (root !== undefined) {
      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    }
    restoreGlobals();
    container.removeEventListener('change', requestParentRenderOnChange);
  }
}

const PORTABLE_PIPELINE_TEST_SOURCE = [
  'local menuA = { name = "pipeline_test_menu_a", layer = 4 }',
  'function menuA.createFrame()',
  '  local frame = Helper.createFrameHandle(menuA, { width = 530, height = 436, layer = menuA.layer })',
  '  local ftable = frame:addTable(1, { width = 530 })',
  '  local row = ftable:addRow(true, {})',
  '  row[1]:createButton({ active = true }):setText("Menu A")',
  '  row[1].handlers.onClick = function() menuA.clicked = true end',
  '  frame:display()',
  'end',
  '',
  'local menuB = { name = "pipeline_test_menu_b", layer = 4 }',
  'function menuB.createFrame()',
  '  local frame = Helper.createFrameHandle(menuB, { width = 420, height = 260, layer = menuB.layer })',
  '  frame:addTable(1, { width = 420 })',
  '  frame:display()',
  'end',
  '',
  'local menuC = { name = "pipeline_test_menu_c", layer = 4 }',
  'function menuC.createFrame()',
  '  local frame = Helper.createFrameHandle(menuC, { width = 360, height = 220, layer = menuC.layer })',
  '  frame:addTable(1, { width = 360 })',
  '  frame:display()',
  'end',
  '',
  'return menuA',
  '',
].join('\n');

const HISTORY_ROW_REARRANGEMENT_SOURCE = [
  'local menuA = { name = "pipeline_test_menu_a", layer = 4 }',
  'function menuA.createFrame()',
  '  local frame = Helper.createFrameHandle(menuA, { width = 530, height = 436, layer = menuA.layer })',
  '  local ftable = frame:addTable(2, { width = 530, reserveScrollBar = false, scaling = false })',
  '  ftable:setColWidthPercent(1, 55)',
  '  ftable:setColWidthPercent(2, 45)',
  '  local first = ftable:addRow(true, {})',
  '  first[1]:setColSpan(2)',
  '  first[1]:createText("History Before", {})',
  '  local second = ftable:addRow(true, {})',
  '  second[1]:setColSpan(2)',
  '  second[1]:createButton({ active = true }):setText("History Row 2", {})',
  '  local third = ftable:addRow(true, {})',
  '  third[1]:setColSpan(2)',
  '  third[1]:createText("History Row 3", {})',
  '  local fourth = ftable:addRow(true, {})',
  '  fourth[1]:setColSpan(2)',
  '  fourth[1]:createText("History Row 4", {})',
  '  frame:display()',
  'end',
  '',
  'return menuA',
  '',
].join('\n');

const PORTABLE_PIPELINE_TEST_XML = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<addon name="pipeline_test">',
  '  <environment type="menus">',
  '    <file name="ui/pipeline_test.lua" />',
  '  </environment>',
  '</addon>',
].join('\n');

type MountedExactPipelineWorkspaceFile = {
  readonly path: string;
  readonly content: string;
  readonly reason: string;
};

type MountedExactPipelineWorkspace = Record<string, unknown> & {
  readonly passthroughFiles: readonly MountedExactPipelineWorkspaceFile[];
};

type MountedExactPipelineTransitionReceipt = {
  readonly fixtureHash: string;
  readonly initialCanvasStatus: string;
  readonly initialCanvasDetail: string;
  readonly sourceOnlyCanvasStatus: string;
  readonly sourceOnlyCanvasDetail: string;
  readonly targetOptionValue: string;
  readonly targetCanvasStatus: string;
  readonly targetCanvasDetail: string;
  readonly targetCanvasMounted: boolean;
  readonly targetCanvasReplaced: boolean;
  readonly targetExportDisabled: boolean;
  readonly targetExportStatus: string;
  readonly targetSourceIdentity: string;
  readonly targetMetadata: string;
  readonly targetSceneStatus: string;
  readonly handlerOptionValue: string;
  readonly handlerCanvasStatus: string;
  readonly handlerCanvasDetail: string;
  readonly handlerCanvasMounted: boolean;
  readonly handlerExportStatus: string;
  readonly handlerTargetMetadata: string;
  readonly restoredCanvasStatus: string;
  readonly restoredCanvasDetail: string;
  readonly restoredCanvasMounted: boolean;
  readonly restoredCanvasReplaced: boolean;
  readonly restoredExportDisabled: boolean;
  readonly restoredExportStatus: string;
  readonly parentReconciliations: number;
  readonly parentCallbackNotifications: number;
  readonly gameTruth: string;
};

function portablePipelineTestWorkspace(): {
  readonly workspace: MountedExactPipelineWorkspace;
  readonly sourceHash: string;
} {
  const sourceHash = createHash('sha256').update(PORTABLE_PIPELINE_TEST_SOURCE, 'utf8').digest('hex').toUpperCase();
  const baseWorkspace = workspace as unknown as MountedExactPipelineWorkspace;
  return {
    workspace: {
      ...baseWorkspace,
      id: 'x4-ui-source-editor-mounted-portable-pipeline-test',
      compileSettings: { ui: true },
      passthroughFiles: [
        { path: 'ui.xml', content: PORTABLE_PIPELINE_TEST_XML, reason: 'unknown_domain' },
        { path: 'ui/pipeline_test.lua', content: PORTABLE_PIPELINE_TEST_SOURCE, reason: 'partial' },
      ],
    },
    sourceHash,
  };
}

async function runMountedExactPipelineTestTransitionRegression(
  fixture: P7SourceAuthorityFixture,
): Promise<MountedExactPipelineTransitionReceipt> {
  const exactFixture = portablePipelineTestWorkspace();
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const baseFiles = exactFixture.workspace.passthroughFiles.map(file => ({ ...file }));
  const baseWorkspace = exactFixture.workspace;
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const canonicalLoader = async (): Promise<{ readonly core: P7SourceAuthorityFixture['core']; readonly color: P7SourceAuthorityFixture['color'] }> => ({
    core: fixture.core,
    color: fixture.color,
  });
  const mountedSurfaceFactory = (width: number, height: number): MountedCanvasElement => new MountedCanvasElement(mountedDocument, width, height);
  let parentRevision = 0;
  let parentCallbackNotifications = 0;
  let parentCallbackReconciled = false;
  let requestParentRender: (() => void) | undefined;
  const MountedSourceEditorParent = (): React.ReactElement => {
    const [, setParentSnapshot] = React.useState<unknown>(null);
    const [, setParentRevision] = React.useState(0);
    requestParentRender = () => {
      parentRevision += 1;
      setParentRevision(previous => previous + 1);
    };
    const onVerificationSnapshotChange = React.useCallback((snapshot: unknown): void => {
      if (snapshot === null) return;
      parentCallbackNotifications += 1;
      if (!parentCallbackReconciled) {
        parentCallbackReconciled = true;
        setParentSnapshot(snapshot);
      }
    }, []);
    const renderedWorkspace = parentRevision === 0
      ? baseWorkspace
      : {
        ...baseWorkspace,
        passthroughFiles: baseFiles.map(file => ({ ...file })),
      };
    return (
      <X4UiSourceEditor
        workspace={renderedWorkspace}
        corpusLoader={canonicalLoader}
        surfaceFactory={mountedSurfaceFactory}
        onVerificationSnapshotChange={onVerificationSnapshotChange}
      />
    );
  };
  const requestParentRenderOnChange = (): void => requestParentRender?.();
  container.addEventListener('change', requestParentRenderOnChange);
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<React.StrictMode><MountedSourceEditorParent /></React.StrictMode>);
    });
    const sourceSelect = mountedElementByTestId(container, 'x4-ui-source-selector');
    if (sourceSelect === null) throw new Error('exact pipeline_test SourceEditor source selector was not rendered');
    const sourceOption = mountedOptionByText(sourceSelect, 'ui/pipeline_test.lua');
    if (sourceOption === null) throw new Error('exact pipeline_test SourceEditor source option was not rendered');
    const initialCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const initialCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');

    await flush(() => {
      sourceSelect.value = sourceOption.value;
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const sourceOnlyCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const sourceOnlyCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const sourceOnlyCanvas = mountedElementByTestId(container, 'x4-ui-canvas-host')?.firstElementChild ?? null;
    const sourceTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (sourceTargetSelect === null) throw new Error('exact pipeline_test target selector disappeared after source selection');
    for (const targetName of ['menuA.createFrame', 'menuB.createFrame', 'menuC.createFrame']) {
      if (mountedOptionByText(sourceTargetSelect, targetName) === null) {
        throw new Error(`portable pipeline_test did not expose ${targetName}`);
      }
    }
    const targetOption = mountedOptionByText(sourceTargetSelect, 'menuA.createFrame');
    if (targetOption === null) throw new Error('exact pipeline_test menuA.createFrame target option was not rendered');
    const targetOptionValue = targetOption.value;

    await flush(() => {
      sourceTargetSelect.value = targetOptionValue;
      sourceTargetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const targetCanvas = mountedElementByTestId(container, 'x4-ui-canvas-host')?.firstElementChild ?? null;
    const targetCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const targetCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const targetExport = mountedElementByTestId(container, 'x4-ui-canvas-export');
    const targetExportStatus = mountedElementText(container, 'x4-ui-canvas-export-status');
    const targetSourceIdentity = mountedElementText(container, 'x4-ui-selected-source-identity');
    const targetMetadata = mountedElementText(container, 'x4-ui-canvas-export-target');
    const targetSceneStatus = mountedElementText(container, 'x4-ui-preview-geometry-scene-status');

    const primaryMenuSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    assert.deepEqual(primaryMenuSelect?.options.map(option => option.textContent), ['Select menu…', 'menuA.createFrame', 'menuB.createFrame', 'menuC.createFrame'], 'ordinary menu choices must exclude helper and handler targets');
    const exactTargetSelect = mountedElementByTestId(container, 'x4-ui-inspect-target-selector');
    if (exactTargetSelect === null) throw new Error('exact pipeline_test target selector disappeared after menuA.createFrame');
    const handlerOption = exactTargetSelect.options.find(option => option.textContent.includes('handler'));
    if (handlerOption === undefined) throw new Error(`exact pipeline_test handler target option was not rendered: ${exactTargetSelect.options.map(option => option.textContent).join(', ')}`);
    const handlerOptionValue = handlerOption.value;
    await flush(() => {
      exactTargetSelect.value = handlerOptionValue;
      exactTargetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const handlerCanvas = mountedElementByTestId(container, 'x4-ui-canvas-host')?.firstElementChild ?? null;
    const handlerCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const handlerCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const handlerExportStatus = mountedElementText(container, 'x4-ui-canvas-export-status');
    const handlerTargetMetadata = mountedElementText(container, 'x4-ui-canvas-export-target');

    const handlerTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (handlerTargetSelect === null) throw new Error('exact pipeline_test target selector disappeared at handler target');
    const restoredTargetOption = mountedOptionByText(handlerTargetSelect, 'menuA.createFrame');
    if (restoredTargetOption === null) throw new Error('exact pipeline_test menuA.createFrame target disappeared after handler transition');
    await flush(() => {
      handlerTargetSelect.value = restoredTargetOption.value;
      handlerTargetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const restoredCanvas = mountedElementByTestId(container, 'x4-ui-canvas-host')?.firstElementChild ?? null;
    const restoredCanvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const restoredCanvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const restoredExport = mountedElementByTestId(container, 'x4-ui-canvas-export');
    const restoredExportStatus = mountedElementText(container, 'x4-ui-canvas-export-status');
    return {
      fixtureHash: exactFixture.sourceHash,
      initialCanvasStatus,
      initialCanvasDetail,
      sourceOnlyCanvasStatus,
      sourceOnlyCanvasDetail,
      targetOptionValue,
      targetCanvasStatus,
      targetCanvasDetail,
      targetCanvasMounted: targetCanvas instanceof MountedCanvasElement,
      targetCanvasReplaced: targetCanvas !== null && targetCanvas !== sourceOnlyCanvas,
      targetExportDisabled: targetExport?.disabled === true,
      targetExportStatus,
      targetSourceIdentity,
      targetMetadata,
      targetSceneStatus,
      handlerOptionValue,
      handlerCanvasStatus,
      handlerCanvasDetail,
      handlerCanvasMounted: handlerCanvas instanceof MountedCanvasElement,
      handlerExportStatus,
      handlerTargetMetadata,
      restoredCanvasStatus,
      restoredCanvasDetail,
      restoredCanvasMounted: restoredCanvas instanceof MountedCanvasElement,
      restoredCanvasReplaced: restoredCanvas !== targetCanvas,
      restoredExportDisabled: restoredExport?.disabled === true,
      restoredExportStatus,
      parentReconciliations: parentRevision,
      parentCallbackNotifications,
      gameTruth: mountedElementText(container, 'x4-ui-canvas-export-boundary'),
    };
  } finally {
    if (root !== undefined) {
      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    }
    restoreGlobals();
    container.removeEventListener('change', requestParentRenderOnChange);
  }
}

type MountedLargeSourceTargetSelectionReceipt = {
  readonly sourcePath: string;
  readonly targetOptionCount: number;
  readonly targetOptionValueBefore: string;
  readonly transientTargetOptionValue: string;
  readonly transientTargetSelectRawValue: string;
  readonly transientTargetSelectValue: string;
  readonly transientTargetSelectText: string;
  readonly transientProjectionRefused: boolean;
  readonly transientRenderRevision: number;
  readonly targetOptionValueAfter: string;
  readonly targetSelectValue: string;
  readonly targetRetained: boolean;
  readonly targetMetadata: string;
  readonly canvasStatus: string;
  readonly canvasDetail: string;
  readonly canvasExportDisabled: boolean;
  readonly canvasExportStatus: string;
  readonly pathRegion: string;
  readonly loopRegion: string;
  readonly sampleRegion: string;
  readonly parentReconciled: boolean;
};

async function runMountedLargeSourceTargetSelectionRegression(
  fixture: P7SourceAuthorityFixture,
): Promise<MountedLargeSourceTargetSelectionReceipt> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const helperFunctions = Array.from({ length: 128 }, (_, index) => [
    `function menu.helper${index}()`,
    '  local frame = Helper.createFrameHandle(menu, {})',
    `  frame:addTable(${(index % 4) + 1}, { width = ${530 + index} })`,
    '  frame:display()',
    'end',
  ].join('\n'));
  const sourceContent = [
    '-- Large canonical source selection regression for the installed UI editor.',
    'local menu = {}',
    ...helperFunctions.slice(0, 11),
     'function menu.display()',
     '  local frame = Helper.createFrameHandle(menu, { width = 90, height = 80 })',
     '  local table = frame:addTable(1, { width = 90 })',
     '  local row = table:addRow(false, {})',
     '  row[1]:createText("menu.display", { height = 10 })',
     '  if menu.active then',
     '    for i = 1, 2 do',
     '      row[1]:createText("active", { height = 10 })',
     '    end',
     '  elseif menu.retry then',
     '    frame:addTable(3, { width = 90 })',
     '  else',
     '    frame:addTable(4, { width = 90 })',
    '  end',
    '  frame:display()',
    'end',
    ...helperFunctions.slice(11),
    'return menu',
  ].join('\n\n');
  const basePassthroughFiles = [
    {
      path: 'ui.xml',
      content: '<?xml version="1.0" encoding="utf-8"?>\n<addon name="ai_influence_chat" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="../../ui/core/addon.xsd">\n  <environment type="menus">\n    <file name="ui/addons/ai_influence_chat/aic_menu.lua" />\n  </environment>\n</addon>',
      reason: 'unknown_domain',
    },
    {
      path: 'ui/addons/ai_influence_chat/aic_menu.lua',
      content: sourceContent,
      reason: 'partial',
    },
  ];
  const baseWorkspace = {
    ...workspace,
    id: 'x4-ui-source-editor-mounted-large-target',
    compileSettings: { ui: true },
    passthroughFiles: basePassthroughFiles,
  };
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const canonicalLoader = async (): Promise<{ readonly core: P7SourceAuthorityFixture['core']; readonly color: P7SourceAuthorityFixture['color'] }> => ({
    core: fixture.core,
    color: fixture.color,
  });
  const mountedSurfaceFactory = (width: number, height: number): MountedCanvasElement => new MountedCanvasElement(mountedDocument, width, height);
  let requestParentRender: (() => void) | undefined;
  let parentRevision = 0;
  let transientTargetOptionValue = '';
  let transientTargetSelectRawValue = '';
  let transientTargetSelectValue = '';
  let transientTargetSelectText = '';
  let transientProjectionRefused = false;
  let transientRenderRevision = 0;
  let releaseTransient: (() => void) | undefined;
  const MountedSourceEditorParent = (): React.ReactElement => {
    const [, setParentRevision] = React.useState(0);
    const transientObservedRef = React.useRef(false);
    const transientReleasedRef = React.useRef(false);
    requestParentRender = () => {
      parentRevision += 1;
      setParentRevision(previous => previous + 1);
    };
    const renderedWorkspace = parentRevision === 0
      ? baseWorkspace
      : {
        ...baseWorkspace,
        passthroughFiles: parentRevision > 1 && !transientReleasedRef.current
          ? []
          : basePassthroughFiles.map(file => ({ ...file })),
      };
    React.useLayoutEffect(() => {
      if (parentRevision <= 1 || transientObservedRef.current) return;
      transientObservedRef.current = true;
      transientRenderRevision = parentRevision;
      releaseTransient = () => {
        if (transientReleasedRef.current) return;
        transientReleasedRef.current = true;
        parentRevision += 1;
        setParentRevision(previous => previous + 1);
      };
    });
    return (
      <X4UiSourceEditor
        workspace={renderedWorkspace}
        corpusLoader={canonicalLoader}
        surfaceFactory={mountedSurfaceFactory}
        onVerificationSnapshotChange={() => undefined}
      />
    );
  };
  const requestParentRenderOnChange = (): void => requestParentRender?.();
  container.addEventListener('change', requestParentRenderOnChange);
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<MountedSourceEditorParent />);
    });
    const sourceSelect = mountedElementByTestId(container, 'x4-ui-source-selector');
    const targetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (sourceSelect === null || targetSelect === null) throw new Error('large-source SourceEditor selectors were not rendered');
    const sourceOption = mountedOptionByText(sourceSelect, 'ui/addons/ai_influence_chat/aic_menu.lua');
    if (sourceOption === null) throw new Error('large-source SourceEditor did not expose the exact aic_menu.lua source');
    await flush(() => {
      sourceSelect.value = sourceOption.value;
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const sourceTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (sourceTargetSelect === null) throw new Error('large-source target selector disappeared after source selection');
    const targetOptionBefore = mountedOptionByText(sourceTargetSelect, 'menu.display');
    if (targetOptionBefore === null) throw new Error('large-source SourceEditor did not expose the menu.display target');
    const targetOptionValueBefore = targetOptionBefore.value;
    const targetOptionCount = sourceTargetSelect.options.length;
    await flush(() => {
      sourceTargetSelect.value = targetOptionValueBefore;
      sourceTargetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      requestParentRender?.();
      requestParentRender?.();
    });
    if (releaseTransient === undefined) throw new Error(`large-source transient owner/catalog projection was not staged at revision ${parentRevision}`);
    const transientTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    transientTargetOptionValue = transientTargetSelect?.options.find(option => option.textContent === 'menu.display')?.value ?? '';
    transientTargetSelectRawValue = transientTargetSelect?.value ?? '';
    const transientSelectedOption = transientTargetSelect?.options.find(option => option.value === transientTargetSelect.value);
    transientTargetSelectValue = transientSelectedOption?.value ?? '';
    transientTargetSelectText = transientSelectedOption?.textContent ?? transientTargetSelect?.options[0]?.textContent ?? '';
    transientProjectionRefused = mountedElementText(container, 'x4-ui-canvas-status') === 'refused';
    await flush(() => releaseTransient?.());
    const finalTargetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    const targetOptionAfter = finalTargetSelect === null ? null : mountedOptionByText(finalTargetSelect, 'menu.display');
    const targetOptionValueAfter = targetOptionAfter?.value ?? '';
    const targetSelectValue = finalTargetSelect?.value ?? '';
    const targetMetadata = mountedElementText(container, 'x4-ui-canvas-export-target');
    const canvasStatus = mountedElementText(container, 'x4-ui-canvas-status');
    const canvasDetail = mountedElementText(container, 'x4-ui-canvas-detail');
    const canvasExport = mountedElementByTestId(container, 'x4-ui-canvas-export');
    const canvasExportStatus = mountedElementText(container, 'x4-ui-canvas-export-status');
    const pathRegion = mountedElementText(container, 'x4-ui-preview-paths-region');
    const loopRegion = mountedElementText(container, 'x4-ui-preview-loops-region');
    const sampleRegion = mountedElementText(container, 'x4-ui-samples-region');
    if (finalTargetSelect === null) throw new Error('large-source target selector disappeared after target selection');
    return {
      sourcePath: mountedElementText(container, 'x4-ui-selected-source-identity'),
      targetOptionCount,
      targetOptionValueBefore,
      transientTargetOptionValue,
      transientTargetSelectRawValue,
      transientTargetSelectValue,
      transientTargetSelectText,
      transientProjectionRefused,
      transientRenderRevision,
      targetOptionValueAfter,
      targetSelectValue,
      targetRetained: targetSelectValue.length > 0
        && targetSelectValue === targetOptionValueBefore
        && targetOptionValueAfter === targetOptionValueBefore,
      targetMetadata,
      canvasStatus,
      canvasDetail,
      canvasExportDisabled: canvasExport?.disabled === true,
      canvasExportStatus,
      pathRegion,
      loopRegion,
      sampleRegion,
      parentReconciled: parentRevision > 0,
    };
  } finally {
    if (root !== undefined) {
      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    }
    restoreGlobals();
    container.removeEventListener('change', requestParentRenderOnChange);
  }
}

type MountedPreviewLoopStateReceipt = {
  readonly initialLoopValue: string;
  readonly immediateLoopValue: string;
  readonly settledLoopValue: string;
  readonly acceptedLoopIterationCount: number | null;
  readonly invalidLoopValue: string;
  readonly invalidLoopIterationCount: number | null;
  readonly resetLoopValue: string;
  readonly resetLoopIterationCount: number | null;
  readonly loopGameTruth: string;
  readonly parentReconciliations: number;
};

const MOUNTED_PREVIEW_LOOP_SOURCE = [
  'local menu = { name = "Loop Editor", layer = 1 }',
  'function menu.previewLoop()',
  '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  '  if menu.active then',
  '    local table = frame:addTable(1, { width = 100 })',
  '    for i = 1, 2 do',
  '      local row = table:addRow(false, {})',
  '      row[1]:createText(dynamicText)',
  '    end',
  '  else',
  '    frame:addTable(1, { width = 90 })',
  '  end',
  '  frame:display()',
  'end',
  'return menu',
  '',
].join('\n');

async function runMountedPreviewLoopStateRegression(
  fixture: P7SourceAuthorityFixture,
): Promise<MountedPreviewLoopStateReceipt> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const baseWorkspace = {
    ...workspace,
    id: 'x4-ui-source-editor-mounted-preview-loop-state',
    compileSettings: { ui: true },
    passthroughFiles: [
      {
        path: 'ui.xml',
        content: '<?xml version="1.0" encoding="utf-8"?>\n<addon name="loop_editor"><environment type="menus"><file name="ui/loop.lua" /></environment></addon>',
        reason: 'unknown_domain',
      },
      { path: 'ui/loop.lua', content: MOUNTED_PREVIEW_LOOP_SOURCE, reason: 'partial' },
    ],
  } as unknown as React.ComponentProps<typeof X4UiSourceEditor>['workspace'];
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const canonicalLoader = async (): Promise<{ readonly core: P7SourceAuthorityFixture['core']; readonly color: P7SourceAuthorityFixture['color'] }> => ({
    core: fixture.core,
    color: fixture.color,
  });
  const mountedSurfaceFactory = (width: number, height: number): MountedCanvasElement => new MountedCanvasElement(mountedDocument, width, height);
  let parentReconciliations = 0;
  let requestParentRender: (() => void) | undefined;
  const MountedSourceEditorParent = (): React.ReactElement => {
    const [, setParentRevision] = React.useState(0);
    requestParentRender = () => {
      parentReconciliations += 1;
      setParentRevision(previous => previous + 1);
    };
    const renderedWorkspace = baseWorkspace;
    return (
      <X4UiSourceEditor
        workspace={renderedWorkspace}
        corpusLoader={canonicalLoader}
        surfaceFactory={mountedSurfaceFactory}
        onVerificationSnapshotChange={() => undefined}
      />
    );
  };
  const requestParentRenderOnEvent = (): void => requestParentRender?.();
  container.addEventListener('input', requestParentRenderOnEvent);
  container.addEventListener('change', requestParentRenderOnEvent);
  let root: ReturnType<typeof createRoot> | undefined;
  const numericValue = (value: string): number | null => {
    const parsed = Number(value);
    return value.length > 0 && Number.isFinite(parsed) ? parsed : null;
  };
  try {
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<React.StrictMode><MountedSourceEditorParent /></React.StrictMode>);
    });
    const sourceSelect = mountedElementByTestId(container, 'x4-ui-source-selector');
    if (sourceSelect === null) throw new Error('mounted loop SourceEditor source selector was not rendered');
    const sourceOption = mountedOptionByText(sourceSelect, 'ui/loop.lua');
    if (sourceOption === null) throw new Error('mounted loop SourceEditor did not expose ui/loop.lua');
    await flush(() => {
      sourceSelect.value = sourceOption.value;
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const targetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (targetSelect === null) throw new Error('mounted loop target selector disappeared after source selection');
    const targetOption = mountedOptionByText(targetSelect, 'menu.previewLoop');
    if (targetOption === null) throw new Error('mounted loop SourceEditor did not expose menu.previewLoop');
    await flush(() => {
      targetSelect.value = targetOption.value;
      targetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const loopControlTestIdPrefix = 'x4-ui-preview-loop-control-';
    const initialControl = mountedElementByTestIdPrefix(container, loopControlTestIdPrefix);
    if (initialControl === null) {
      throw new Error(`mounted loop SourceEditor did not expose its owner-issued loop control; target=${targetSelect.value}; options=${targetSelect.options.map(option => option.textContent).join('|')}; loops=${mountedElementText(container, 'x4-ui-preview-loops-region')}`);
    }
    const initialLoopValue = initialControl.value;
    assert.equal(mountedElementByTestIdPrefix(container, 'x4-ui-preview-loop-status-')?.textContent,
      'Automatic from source: 2 iterations');
    initialControl.value = '4';
    const immediateLoopValue = initialControl.value;
    await flush(() => {
      initialControl.focus();
      initialControl.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
      initialControl.value = '4';
      initialControl.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
      initialControl.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const settledControl = mountedElementByTestIdPrefix(container, loopControlTestIdPrefix);
    if (settledControl === null) throw new Error('mounted loop control disappeared after accepted input');
    const settledLoopValue = settledControl.value;
    assert.equal(mountedElementByTestIdPrefix(container, 'x4-ui-preview-loop-status-')?.textContent,
      'Manual preview: 4 iterations');
    const acceptedLoopIterationCount = numericValue(settledLoopValue);
    await flush(() => {
      settledControl.value = '0';
      settledControl.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
      settledControl.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      settledControl.dispatchEvent(new MountedDomEvent('focusout', { bubbles: true }));
    });
    const invalidControl = mountedElementByTestIdPrefix(container, loopControlTestIdPrefix);
    if (invalidControl === null) throw new Error('mounted loop control disappeared after refused input');
    const invalidLoopValue = invalidControl.value;
    const invalidLoopIterationCount = numericValue(invalidLoopValue);
    const reset = mountedElementByTestId(container, 'x4-ui-preview-loops-reset');
    if (reset === null) throw new Error('mounted loop reset control was not rendered');
    await flush(() => reset.click());
    const resetControl = mountedElementByTestIdPrefix(container, loopControlTestIdPrefix);
    if (resetControl === null) throw new Error('mounted loop control disappeared after reset');
    const resetLoopValue = resetControl.value;
    assert.equal(mountedElementByTestIdPrefix(container, 'x4-ui-preview-loop-status-')?.textContent,
      'Automatic from source: 2 iterations');
    return {
      initialLoopValue,
      immediateLoopValue,
      settledLoopValue,
      acceptedLoopIterationCount,
      invalidLoopValue,
      invalidLoopIterationCount,
      resetLoopValue,
      resetLoopIterationCount: numericValue(resetLoopValue),
      loopGameTruth: mountedElementText(container, 'x4-ui-preview-loops-truth'),
      parentReconciliations,
    };
  } finally {
    if (root !== undefined) {
      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    }
    restoreGlobals();
    container.removeEventListener('input', requestParentRenderOnEvent);
    container.removeEventListener('change', requestParentRenderOnEvent);
  }
}

type MountedSampleDraftBatchReceipt = {
  readonly issuedSampleCount: number;
  readonly initialProjectionCount: number;
  readonly stagedProjectionCount: number;
  readonly appliedProjectionCount: number;
  readonly invalidProjectionCount: number;
  readonly stagedControlValues: readonly string[];
  readonly appliedControlValues: readonly string[];
  readonly invalidControlValue: string;
  readonly invalidAcceptedControlValue: string;
  readonly resetControlValue: string;
  readonly initialCanvasPresent: boolean;
  readonly stagedCanvasPresent: boolean;
  readonly stagedCanvasSame: boolean;
  readonly canvasRetainedWhileStaged: boolean;
  readonly exportRetainedWhileStaged: boolean;
  readonly stagedLabel: string;
  readonly appliedLabel: string;
  readonly refusal: string;
  readonly previewOnly: string;
  readonly gameTruth: string;
  readonly renderPhaseStateUpdateWarnings: readonly string[];
};

const MOUNTED_SAMPLE_DRAFT_PARAMETER_NAMES = Array.from({ length: 31 }, (_, index) => `sample${index}`);
const MOUNTED_SAMPLE_DRAFT_SOURCE = [
  'local menu = { name = "Batch Samples", layer = 1 }',
  `function menu.display(${MOUNTED_SAMPLE_DRAFT_PARAMETER_NAMES.join(', ')})`,
  '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
  '  local table = frame:addTable(1, { width = sample0 })',
  '  local row = table:addRow(false, {})',
  ...MOUNTED_SAMPLE_DRAFT_PARAMETER_NAMES.slice(1).map(parameter => `  row[1]:createText(${parameter}, { height = 10 })`),
  '  frame:display()',
  'end',
  '',
].join('\n');

async function runMountedSampleDraftBatchRegression(
  fixture: P7SourceAuthorityFixture,
): Promise<MountedSampleDraftBatchReceipt> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const batchWorkspace = {
    ...workspace,
    id: 'x4-ui-source-editor-mounted-sample-draft-batch',
    compileSettings: { ui: true },
    passthroughFiles: [
      {
        path: 'ui.xml',
        content: '<?xml version="1.0" encoding="utf-8"?>\n<addon name="batch_samples"><environment type="menus"><file name="ui/batch-samples.lua" /></environment></addon>',
        reason: 'unknown_domain',
      },
      { path: 'ui/batch-samples.lua', content: MOUNTED_SAMPLE_DRAFT_SOURCE, reason: 'partial' },
    ],
  } as unknown as React.ComponentProps<typeof X4UiSourceEditor>['workspace'];
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const canonicalLoader = async (): Promise<{ readonly core: P7SourceAuthorityFixture['core']; readonly color: P7SourceAuthorityFixture['color'] }> => ({
    core: fixture.core,
    color: fixture.color,
  });
  const mountedSurfaceFactory = (width: number, height: number): MountedCanvasElement => new MountedCanvasElement(mountedDocument, width, height);
  const observedProjections = new Set<object>();
  const renderPhaseStateUpdateWarnings: string[] = [];
  const ObservedSourceEditor = X4UiSourceEditor as unknown as React.ComponentType<Record<string, unknown>>;
  const ProjectionObservingParent = (): React.ReactElement => {
    const [, setParentProjection] = React.useState<unknown>(null);
    return React.createElement(ObservedSourceEditor, {
      workspace: batchWorkspace,
      corpusLoader: canonicalLoader,
      surfaceFactory: mountedSurfaceFactory,
      onVerificationSnapshotChange: () => undefined,
      onSessionProjection: (projection: unknown) => {
        if (projection !== null && typeof projection === 'object') observedProjections.add(projection);
        setParentProjection(() => projection);
      },
    });
  };
  const sampleControls = (): MountedDomElement[] => container.querySelectorAll('input').filter(element => (
    element.getAttribute('data-testid') ?? ''
  ).startsWith('x4-ui-sample-control-'));
  const sampleControlAt = (index: number): MountedDomElement => {
    const control = sampleControls()[index];
    if (control === undefined) throw new Error(`mounted sample draft control ${index} was not rendered`);
    return control;
  };
  let root: ReturnType<typeof createRoot> | undefined;
  const previousConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.map(value => String(value)).join(' ');
    if (/Cannot update a component.*while rendering a different component/i.test(message)) {
      renderPhaseStateUpdateWarnings.push(message);
    }
    previousConsoleError(...args);
  };
  try {
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<React.StrictMode><ProjectionObservingParent /></React.StrictMode>);
    });
    const sourceSelect = mountedElementByTestId(container, 'x4-ui-source-selector');
    if (sourceSelect === null) throw new Error('mounted sample draft SourceEditor source selector was not rendered');
    const sourceOption = mountedOptionByText(sourceSelect, 'ui/batch-samples.lua');
    if (sourceOption === null) throw new Error('mounted sample draft SourceEditor did not expose ui/batch-samples.lua');
    await flush(() => {
      sourceSelect.value = sourceOption.value;
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const targetSelect = mountedElementByTestId(container, 'x4-ui-target-selector');
    if (targetSelect === null) throw new Error('mounted sample draft target selector was not rendered');
    const targetOption = mountedOptionByText(targetSelect, 'menu.display');
    if (targetOption === null) throw new Error('mounted sample draft SourceEditor did not expose menu.display');
    await flush(() => {
      targetSelect.value = targetOption.value;
      targetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const initialControls = sampleControls();
    if (initialControls.length !== 31) throw new Error(`mounted sample draft issued ${initialControls.length} controls, expected 31`);
    const initialProjectionCount = observedProjections.size;
    const canvasHost = mountedElementByTestId(container, 'x4-ui-canvas-host');
    if (canvasHost === null) throw new Error('mounted sample draft canvas host was not rendered');
    const initialCanvas = canvasHost.firstElementChild;
    const initialExportIdentity = [
      mountedElementText(container, 'x4-ui-canvas-export-source'),
      mountedElementText(container, 'x4-ui-canvas-export-target'),
      mountedElementText(container, 'x4-ui-canvas-export-profile'),
      mountedElementText(container, 'x4-ui-canvas-export-status'),
    ].join('\u0000');
    const stagedValues = initialControls.map((control, index) => (
      control.type === 'number' ? '120' : ` exact value ${index} `
    ));
    for (let index = 0; index < stagedValues.length; index += 1) {
      await flush(() => {
        const control = sampleControlAt(index);
        control.focus();
        control.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
        control.value = stagedValues[index]!;
        control.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
        control.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      });
    }
    const stagedProjectionCount = observedProjections.size;
    const stagedControlValues = sampleControls().map(control => control.value);
    const stagedLabel = mountedElementText(container, 'x4-ui-samples-staged');
    const stagedCanvas = canvasHost.firstElementChild;
    const stagedExportIdentity = [
      mountedElementText(container, 'x4-ui-canvas-export-source'),
      mountedElementText(container, 'x4-ui-canvas-export-target'),
      mountedElementText(container, 'x4-ui-canvas-export-profile'),
      mountedElementText(container, 'x4-ui-canvas-export-status'),
    ].join('\u0000');
    const applyButton = mountedElementByTestId(container, 'x4-ui-samples-apply');
    if (applyButton === null) throw new Error('mounted sample draft Apply control was not rendered');
    await flush(() => applyButton.click());
    const appliedProjectionCount = observedProjections.size;
    const appliedControlValues = sampleControls().map(control => control.value);
    const appliedLabel = mountedElementText(container, 'x4-ui-samples-applied');
    const numberControl = sampleControls().find(control => control.type === 'number');
    if (numberControl === undefined) throw new Error('mounted sample draft number control was not rendered');
    const invalidAcceptedControlValue = numberControl.value;
    await flush(() => {
      numberControl.focus();
      numberControl.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
      numberControl.value = 'not-a-number';
      numberControl.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
      numberControl.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const invalidApplyButton = mountedElementByTestId(container, 'x4-ui-samples-apply');
    if (invalidApplyButton === null) throw new Error('mounted sample draft Apply control disappeared after invalid staging');
    const beforeInvalidApply = observedProjections.size;
    await flush(() => invalidApplyButton.click());
    const refusal = mountedElementText(container, 'x4-ui-samples-error');
    const invalidControlValue = sampleControls().find(control => control.type === 'number')?.value ?? '';
    const resetButton = mountedElementByTestId(container, 'x4-ui-samples-reset');
    if (resetButton === null) throw new Error('mounted sample draft Reset control was not rendered');
    await flush(() => resetButton.click());
    const resetControlValue = sampleControls().find(control => control.type === 'number')?.value ?? '';
    return {
      issuedSampleCount: initialControls.length,
      initialProjectionCount,
      stagedProjectionCount,
      appliedProjectionCount,
      invalidProjectionCount: beforeInvalidApply,
      stagedControlValues,
      appliedControlValues,
      invalidControlValue,
      invalidAcceptedControlValue,
      resetControlValue,
      initialCanvasPresent: initialCanvas !== null,
      stagedCanvasPresent: stagedCanvas !== null,
      stagedCanvasSame: stagedCanvas === initialCanvas,
      canvasRetainedWhileStaged: stagedCanvas === initialCanvas,
      exportRetainedWhileStaged: initialExportIdentity === stagedExportIdentity,
      stagedLabel,
      appliedLabel,
      refusal,
      previewOnly: mountedElementText(container, 'x4-ui-samples-preview-only'),
      gameTruth: mountedElementText(container, 'x4-ui-samples-truth'),
      renderPhaseStateUpdateWarnings,
    };
  } finally {
    console.error = previousConsoleError;
    if (root !== undefined) {
      await act(async () => {
        root?.unmount();
        await Promise.resolve();
      });
    }
    restoreGlobals();
  }
}

async function runMountedInspectorScrollRetentionRegression(): Promise<void> {
  type Input = Parameters<typeof useX4UiInspectorScrollRetention>[0];
  const cases = ['confirmed', 'clamped', 'no-confirmation', 'foreign-workspace', 'scope',
    'profile', 'selection', 'cancel', 'late-old-refusal', 'unmount'] as const;
  for (const scenario of cases) {
    const doc = new MountedDomDocument();
    const restore = installMountedDomGlobals(doc);
    const container = doc.createElement('div'); doc.body.appendChild(container);
    const before = {}, after = {};
    let state: Input = { workspace: before, scope: 'same-workspace', profile: {}, selectionEpoch: 0, nodeId: 'old-node' };
    let api!: ReturnType<typeof useX4UiInspectorScrollRetention>;
    let root: ReturnType<typeof createRoot> | undefined;
    const Parent = (): React.ReactElement => {
      api = useX4UiInspectorScrollRetention(state);
      return <aside data-testid="scroll-test" ref={api.containerRef} />;
    };
    const render = (): void => root!.render(<React.StrictMode><Parent /></React.StrictMode>);
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); });
    };
    const update = (patch: Partial<Input>): void => { state = { ...state, ...patch }; render(); };
    try {
      await flush(() => { root = createRoot(container as unknown as Element); render(); });
      const panel = mountedElementByTestId(container, 'scroll-test') as unknown as HTMLElement;
      assert.ok(panel);
      // Event-only DOM: simulate the browser's clamp. The E2E test proves actual layout.
      Object.defineProperties(panel, { scrollTop: { value: 137, writable: true },
        scrollHeight: { value: scenario === 'clamped' ? 150 : 500 }, clientHeight: { value: 100 } });
      const oldAttempt = api.begin(after);
      assert.ok(oldAttempt);
      if (scenario === 'late-old-refusal') {
        panel.scrollTop = 145;
        assert.ok(api.begin(after));
        api.cancel(oldAttempt);
      }
      panel.scrollTop = 0;
      if (scenario === 'unmount') {
        await flush(() => { root!.unmount(); root = undefined; });
      } else {
        if (scenario === 'foreign-workspace') await flush(() => update({ workspace: {} }));
        if (scenario === 'scope') await flush(() => update({ scope: 'different-workspace' }));
        if (scenario === 'profile') await flush(() => update({ profile: {} }));
        if (scenario === 'selection') await flush(() => update({ selectionEpoch: 1 }));
        if (scenario === 'cancel') api.cancel();
        await flush(() => update({ workspace: after, nodeId: undefined }));
        assert.equal(panel.scrollTop, 0, `${scenario}: readback alone must not restore`);
        api.confirm(undefined);
        assert.equal(panel.scrollTop, 0, `${scenario}: source-only selection must not restore`);
      }
      const freshSelection: Parameters<typeof api.confirm>[0] = {
        workspace: after, nodeId: 'new-node', sourceIdentityKey: 'fresh-source', targetId: 'fresh-target', profileKey: 'same-profile',
      };
      if (scenario !== 'no-confirmation') api.confirm(freshSelection);
      if (root !== undefined) await flush(() => update({ nodeId: 'new-node' }));
      const expected = scenario === 'confirmed' ? 137 : scenario === 'clamped' ? 50 : scenario === 'late-old-refusal' ? 145 : 0;
      assert.equal(panel.scrollTop, expected, `${scenario}: only confirmed uninterrupted view restores`);
      panel.scrollTop = 23;
      if (root !== undefined) await flush(render);
      assert.equal(panel.scrollTop, 23, `${scenario}: consumed or cancelled snapshot must not fight later scrolling`);
    } finally {
      if (root !== undefined) await flush(() => root!.unmount());
      restore();
    }
  }
  console.log(`B119_INSPECTOR_SCROLL_RETENTION ${cases.length}/${cases.length} PASS; view-only lifecycle, not DOM layout proof`);
}

async function runMountedSourceEditSelectionTransferRegression(): Promise<void> {
  type Input = Parameters<typeof useX4UiSourceEditSelectionTransfer>[0];
  type State = Pick<Input, 'workspace' | 'candidates' | 'sourceSelector' | 'targetSelector' | 'profile'>;
  const scenarios = [
    'ack-before-readback', 'readback-before-ack', 'sync-readback', 'sync-reentrant', 'no-op',
    'workspace-switch', 'replacement-clone', 'backward-transition', 'source-change', 'target-change',
    'profile-change', 'cancel', 'unmount', 'sync-unmount', 'sync-switch', 'callback-throws',
    'parent-refused', 'ack-refused', 'forged-ack', 'crossed-ack', 'rejected-promise', 'superseded',
    'missing-source', 'ambiguous-source', 'missing-target', 'ambiguous-target',
    'old-ambiguous-source', 'old-ambiguous-target',
    'unnamed-sync-readback', 'unnamed-now-empty', 'empty-now-unnamed', 'ambiguous-unnamed-target',
  ] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string }[] = [];
  for (const scenario of scenarios) {
    const doc = new MountedDomDocument();
    const restore = installMountedDomGlobals(doc);
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    const original = { revision: 'old' };
    const replacement = { revision: 'new' };
    const switched = { revision: 'other-workspace' };
    // Producer-shaped catalogs isolate UI lifecycle here; the full mounted journey below uses
    // real Session catalogs, SourceEdits results, App normalization and fresh canvas rendering.
    const catalog = (revision: string): Input['candidates'] => [{
      raw: {}, index: 0, path: 'ui/menu.lua', key: `source-${revision}`, sourceIdentity: { sha256: revision },
      targets: [{ raw: { kind: 'function', name: 'menu.createFrame', id: `target-${revision}` }, key: `target-${revision}`, label: 'menu.createFrame' }],
    }];
    let oldCandidates = catalog('old');
    let newCandidates = catalog('new');
    if (['unnamed-sync-readback', 'unnamed-now-empty', 'empty-now-unnamed', 'ambiguous-unnamed-target'].includes(scenario)) {
      const unnamed = (items: Input['candidates'], name?: string): Input['candidates'] => [{ ...items[0], targets: [{
        ...items[0].targets[0], raw: { kind: 'top-level', ...(name === undefined ? {} : { name }), id: items[0].targets[0].raw.id },
      }] }];
      oldCandidates = unnamed(oldCandidates, scenario === 'empty-now-unnamed' ? '' : undefined);
      newCandidates = unnamed(newCandidates, scenario === 'unnamed-now-empty' ? '' : undefined);
      if (scenario === 'ambiguous-unnamed-target') newCandidates = [{ ...newCandidates[0], targets: [...newCandidates[0].targets, { ...newCandidates[0].targets[0], key: 'other-unnamed-target' }] }];
    }
    if (scenario === 'old-ambiguous-source') oldCandidates = [...oldCandidates, { ...oldCandidates[0], key: 'other-source' }];
    if (scenario === 'old-ambiguous-target') oldCandidates = [{ ...oldCandidates[0], targets: [...oldCandidates[0].targets, { ...oldCandidates[0].targets[0], key: 'other-target' }] }];
    if (scenario === 'missing-source') newCandidates = [];
    if (scenario === 'ambiguous-source') newCandidates = [...newCandidates, { ...newCandidates[0], key: 'other-source' }];
    if (scenario === 'missing-target') newCandidates = [{ ...newCandidates[0], targets: [] }];
    if (scenario === 'ambiguous-target') newCandidates = [{ ...newCandidates[0], targets: [...newCandidates[0].targets, { ...newCandidates[0].targets[0], key: 'other-target' }] }];
    const initial: State = { workspace: original, candidates: oldCandidates, sourceSelector: 'source-old', targetSelector: 'target-old', profile: { width: 800, height: 600, uiScale: 1 } };
    let liveState = initial;
    let update: (next: Partial<State>) => void = () => { throw new Error('transfer harness not mounted'); };
    let api: ReturnType<typeof useX4UiSourceEditSelectionTransfer> | undefined;
    let root: ReturnType<typeof createRoot> | undefined;
    let parentCalls = 0;
    const adoptions: { sourceSelector: string; targetSelector: string }[] = [];
    const authorities: X4UiWorkspaceEditPendingAuthority[] = [];
    let rejectNextPromise = scenario === 'rejected-promise';
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); });
    };
    const handler: X4UiWorkspaceEditHandler = request => {
      parentCalls += 1;
      assert.equal(request.expectedWorkspace, liveState.workspace);
      if (scenario === 'parent-refused') return { status: 'refused', reason: 'stale-parent-workspace', detail: 'fixture refused' };
      const authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
      authorities.push(authority);
      if (scenario === 'callback-throws') throw new Error('fixture throw');
      if (scenario === 'sync-reentrant') assert.equal(api?.submit(original, replacement).status, 'refused', 'installed intent blocks a reentrant submission');
      if (['sync-readback', 'sync-reentrant', 'unnamed-sync-readback'].includes(scenario)) {
        flushSync(() => update({ workspace: request.workspace, candidates: newCandidates }));
        authority.acknowledge(request.workspace);
      }
      if (scenario === 'sync-unmount') flushSync(() => { root?.unmount(); root = undefined; });
      if (scenario === 'sync-switch') flushSync(() => update({ workspace: switched }));
      if (scenario === 'forged-ack') return { ...authority.submission, acknowledgement: Promise.resolve({ ...authority.acknowledge(request.workspace) }) };
      if (scenario === 'crossed-ack') {
        const crossed = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
        return { ...authority.submission, acknowledgement: Promise.resolve(crossed.acknowledge(request.workspace)) };
      }
      if (scenario === 'rejected-promise' && rejectNextPromise) {
        rejectNextPromise = false;
        return { ...authority.submission, acknowledgement: Promise.reject(new Error('fixture rejection')) };
      }
      return authority.submission;
    };
    const Parent = (): React.ReactElement | null => {
      const [state, setState] = React.useState(initial);
      liveState = state;
      update = next => setState(previous => ({ ...previous, ...next }));
      api = useX4UiSourceEditSelectionTransfer({ ...state, onWorkspaceEdit: handler, onSelect: selected => {
        const expectedAdoptionWorkspace = scenario === 'superseded' || scenario === 'rejected-promise'
          ? authorities[1]?.submission.workspace
          : replacement;
        assert.equal(state.workspace, expectedAdoptionWorkspace);
        assert.equal(state.candidates, newCandidates, 'adoption reads the committed NEW catalog');
        adoptions.push(selected);
        update(selected);
      } });
      return null;
    };
    try {
      await flush(() => { root = createRoot(container as unknown as Element); root.render(<React.StrictMode><Parent /></React.StrictMode>); });
      assert.ok(api);
      const submit = (): void => { api?.submit(original, scenario === 'no-op' ? original : replacement); };
      if (scenario === 'callback-throws') {
        await flush(() => assert.throws(submit, /fixture throw/));
        assert.equal(adoptions.length, 0);
        continue;
      }
      await flush(submit);
      assert.equal(parentCalls, 1);
      if (scenario === 'rejected-promise') {
        assert.equal(adoptions.length, 0, 'a rejected acknowledgement cannot adopt selection');
        const validReplacement = { revision: 'valid-after-rejection' };
        await flush(() => { api?.submit(original, validReplacement); });
        assert.equal(parentCalls, 2, 'a terminal rejected acknowledgement must release the next edit attempt');
        const validAuthority = authorities[1];
        assert.ok(validAuthority);
        await flush(() => update({ workspace: validReplacement, candidates: newCandidates }));
        await flush(() => { validAuthority.acknowledge(validReplacement); });
        assert.deepEqual(adoptions, [{ sourceSelector: 'source-new', targetSelector: 'target-new' }]);
        continue;
      }
      if (['parent-refused', 'forged-ack', 'crossed-ack', 'sync-unmount', 'sync-switch'].includes(scenario)) {
        await flush(() => {
          if (root !== undefined) update({ workspace: replacement, candidates: newCandidates });
          authorities[0]?.acknowledge(replacement);
        });
        assert.equal(adoptions.length, 0);
        continue;
      }
      const authority = authorities[0];
      assert.ok(authority);
      if (['sync-readback', 'sync-reentrant', 'unnamed-sync-readback'].includes(scenario)) {
        assert.deepEqual(adoptions, [{ sourceSelector: 'source-new', targetSelector: 'target-new' }]);
        continue;
      }
      if (scenario === 'no-op' || scenario === 'ack-refused') {
        await flush(() => { authority.acknowledge(original); });
        assert.equal(adoptions.length, 0, 'no changed-source transfer or false refusal acceptance');
        continue;
      }
      if (scenario === 'unmount') {
        await flush(() => { root?.unmount(); root = undefined; });
        await flush(() => { authority.acknowledge(replacement); });
        assert.equal(adoptions.length, 0);
        continue;
      }
      if (scenario === 'source-change') await flush(() => update({ sourceSelector: '' }));
      if (scenario === 'target-change') await flush(() => update({ targetSelector: '' }));
      if (scenario === 'profile-change') await flush(() => update({ profile: { ...initial.profile, width: 1024 } }));
      if (scenario === 'workspace-switch') await flush(() => update({ workspace: switched }));
      if (scenario === 'replacement-clone') await flush(() => update({ workspace: { ...replacement }, candidates: newCandidates }));
      if (scenario === 'backward-transition') {
        await flush(() => update({ workspace: replacement, candidates: newCandidates }));
        await flush(() => update(initial));
      }
      if (scenario === 'cancel' || scenario === 'superseded') api.cancel();
      if (scenario === 'superseded') {
        const secondReplacement = { revision: 'second' };
        await flush(() => { api?.submit(original, secondReplacement); });
        assert.equal(parentCalls, 2);
        await flush(() => update({ workspace: secondReplacement, candidates: newCandidates }));
        await flush(() => { authority.acknowledge(replacement); });
        assert.equal(adoptions.length, 0, 'old acknowledgement cannot adopt over a newer pending edit');
        await flush(() => { authorities[1].acknowledge(secondReplacement); });
        assert.deepEqual(adoptions, [{ sourceSelector: 'source-new', targetSelector: 'target-new' }]);
        continue;
      }
      if (scenario === 'ack-before-readback') {
        await flush(() => { authority.acknowledge(replacement); });
        assert.equal(adoptions.length, 0, 'ack alone cannot select a source from old props');
        await flush(() => update({ workspace: replacement, candidates: newCandidates }));
      } else {
        await flush(() => update({ workspace: replacement, candidates: newCandidates }));
        assert.equal(adoptions.length, 0, 'readback alone cannot grant selection');
        await flush(() => { authority.acknowledge(replacement); });
      }
      assert.deepEqual(adoptions, ['ack-before-readback', 'readback-before-ack'].includes(scenario)
        ? [{ sourceSelector: 'source-new', targetSelector: 'target-new' }] : []);
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      if (root !== undefined) await flush(() => root?.unmount());
      restore();
    }
  }
  console.log(`B119_SOURCE_EDIT_SELECTION_TRANSFER_MATRIX ${JSON.stringify({ total: scenarios.length, passed: scenarios.length - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'source edit selection transfer requires exact acknowledgement, live replacement, and unique fresh catalog identities');
}

async function runMountedSourceEditSelectionTransferInsertionRegression(): Promise<void> {
  type Input = Parameters<typeof useX4UiSourceEditSelectionTransfer>[0];
  type State = Pick<Input, 'workspace' | 'candidates' | 'sourceSelector' | 'targetSelector' | 'profile'> & {
    readonly builderNodes?: Input['builderNodes'];
    readonly builderProjectionStatus?: Input['builderProjectionStatus'];
    readonly builderProjectionLoading?: Input['builderProjectionLoading'];
    readonly builderSelectionContext?: Input['builderSelectionContext'];
    readonly builderSelectionNodeId?: Input['builderSelectionNodeId'];
  };
  const scenarios = [
    'ack-before-readback', 'readback-before-ack', 'source-identity-drift',
    'ambiguous-node-id', 'selection-intervention', 'refused-ack',
  ] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string }[] = [];
  const sourceIdentityFor = (revision: string) => ({ file: 'ui/menu.lua', sourcePath: 'ui/menu.lua', sha256: revision });
  const sourceLocationFor = (startOffset: number, endOffset: number) => ({
    file: 'ui/menu.lua',
    sourcePath: 'ui/menu.lua',
    start: { line: 1, column: startOffset, offset: startOffset },
    end: { line: 1, column: endOffset, offset: endOffset },
  });
  const nodesFor = (variant: 'valid' | 'ambiguous'): Input['builderNodes'] => {
    const ownerSource = sourceLocationFor(0, 60);
    const creatorSource = sourceLocationFor(10, 30);
    const descriptorSource = sourceLocationFor(12, 20);
    const common = {
      source: ownerSource,
      sourceOrder: 0,
      childIds: [],
      operationIds: [],
      propertyOperationIds: [],
      completeness: 'complete',
      provenance: 'source-derived',
      selectable: false,
      detail: 'fixture',
    };
    const nodes = [
      { ...common, id: 'scene:frame-1', kind: 'frame', label: 'Frame 1', childIds: ['scene:table-1'] },
      { ...common, id: 'scene:table-1', kind: 'table', label: 'Table 1', parentId: 'scene:frame-1', childIds: ['scene:row-1'] },
      { ...common, id: 'scene:row-1', kind: 'row', label: 'Row 1', parentId: 'scene:table-1', childIds: ['scene:cell-1'] },
      { ...common, id: 'scene:cell-1', kind: 'cell', label: 'Cell 1', parentId: 'scene:row-1', childIds: ['scene:widget-1'] },
      { ...common, id: 'scene:widget-1', kind: 'widget', label: 'Text', parentId: 'scene:cell-1', source: creatorSource, childIds: ['scene:text-1'], operationIds: ['creator'], widgetKind: 'text' },
      { ...common, id: 'scene:text-1', kind: 'text', label: 'Text · inserted', parentId: 'scene:widget-1', source: descriptorSource, operationIds: ['creator'], textSlot: 'primary' },
    ];
    return (variant === 'ambiguous' ? [...nodes, { ...nodes[3] }] : nodes) as unknown as Input['builderNodes'];
  };
  for (const scenario of scenarios) {
    const doc = new MountedDomDocument();
    const restore = installMountedDomGlobals(doc);
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    const original = { revision: 'old' };
    const replacement = { revision: 'new' };
    const oldCandidates: Input['candidates'] = [{
      raw: {}, index: 0, path: 'ui/menu.lua', key: 'source-old', sourceIdentity: sourceIdentityFor('old'),
      targets: [{ raw: { kind: 'function', name: 'menu.createFrame', id: 'target-old' }, key: 'target-old', label: 'menu.createFrame' }],
    }];
    const newCandidates: Input['candidates'] = [{
      raw: {}, index: 0, path: 'ui/menu.lua', key: 'source-new', sourceIdentity: sourceIdentityFor('new'),
      targets: [{ raw: { kind: 'function', name: 'menu.createFrame', id: 'target-new' }, key: 'target-new', label: 'menu.createFrame' }],
    }];
    const newSourceIdentityKey = 'ui/menu.lua|ui/menu.lua|new';
    const oldSourceIdentityKey = 'ui/menu.lua|ui/menu.lua|old';
    const initial: State = {
      workspace: original,
      candidates: oldCandidates,
      sourceSelector: 'source-old',
      targetSelector: 'target-old',
      profile: { width: 800, height: 600, uiScale: 1 },
      builderNodes: nodesFor('valid'),
      builderProjectionStatus: 'available',
      builderProjectionLoading: false,
      builderSelectionContext: { workspace: original, sourceIdentityKey: oldSourceIdentityKey, targetId: 'target-old', profileKey: 'profile' },
      builderSelectionNodeId: 'scene:cell-1',
    };
    let liveState = initial;
    let update: (next: Partial<State>) => void = () => { throw new Error('insertion transfer harness not mounted'); };
    let api: ReturnType<typeof useX4UiSourceEditSelectionTransfer> | undefined;
    let root: ReturnType<typeof createRoot> | undefined;
    const authorities: X4UiWorkspaceEditPendingAuthority[] = [];
    const adoptions: X4UiSourceEditSelectionResult[] = [];
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); });
    };
    const handler: X4UiWorkspaceEditHandler = request => {
      assert.equal(request.expectedWorkspace, liveState.workspace, `${scenario}: exact expected workspace`);
      const authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
      authorities.push(authority);
      return authority.submission;
    };
    const Parent = (): React.ReactElement | null => {
      const [state, setState] = React.useState(initial);
      liveState = state;
      update = next => setState(previous => ({ ...previous, ...next }));
      api = useX4UiSourceEditSelectionTransfer({
        ...state,
        onWorkspaceEdit: handler,
        onSelect: selected => {
          assert.equal(state.workspace, replacement, `${scenario}: selection must wait for replacement workspace readback`);
          assert.equal(state.candidates, newCandidates, `${scenario}: selection must use the fresh catalog`);
          adoptions.push(selected);
          update({
            sourceSelector: selected.sourceSelector,
            targetSelector: selected.targetSelector,
            ...(selected.builderSelection === undefined ? {} : { builderSelectionNodeId: selected.builderSelection.nodeId }),
          });
        },
      });
      return null;
    };
    try {
      await flush(() => { root = createRoot(container as unknown as Element); root.render(<React.StrictMode><Parent /></React.StrictMode>); });
      assert.ok(api);
      const proof = {
        widget: 'text' as const,
        frameId: 'frame-1',
        tableId: 'table-1',
        rowId: 'row-1',
        cellId: 'cell-1',
        creatorOperationId: 'creator',
        creatorCallName: 'createText' as const,
        creatorSource: sourceLocationFor(10, 30),
        sourceIdentity: sourceIdentityFor('new'),
      };
      const continuation = {
        node: initial.builderNodes?.find(node => node.id === 'scene:cell-1'),
        splice: { path: 'ui/menu.lua', startOffset: 30, endOffset: 30, replacement: 'inserted' },
        insertedWidget: proof,
      };
      assert.ok(continuation.node);
      await flush(() => { api?.submit(original, replacement, continuation); });
      const authority = authorities[0];
      assert.ok(authority);
      if (scenario === 'selection-intervention') {
        await flush(() => update({ builderSelectionNodeId: 'scene:other' }));
        await flush(() => { authority.acknowledge(replacement); });
        assert.equal(adoptions.length, 0, 'user selection intervention must cancel insertion continuation');
        continue;
      }
      if (scenario === 'ack-before-readback') {
        await flush(() => { authority.acknowledge(replacement); });
        assert.equal(adoptions.length, 0, 'ack alone cannot select the new widget');
        await flush(() => update({ workspace: replacement, candidates: newCandidates, builderNodes: nodesFor('valid'), builderSelectionContext: { workspace: replacement, sourceIdentityKey: newSourceIdentityKey, targetId: 'target-new', profileKey: 'profile' } }));
      } else {
        await flush(() => update({ workspace: replacement, candidates: newCandidates, builderNodes: nodesFor(scenario === 'ambiguous-node-id' ? 'ambiguous' : 'valid'), builderSelectionContext: { workspace: replacement, sourceIdentityKey: scenario === 'source-identity-drift' ? 'ui/menu.lua|ui/menu.lua|drift' : newSourceIdentityKey, targetId: 'target-new', profileKey: 'profile' } }));
        assert.equal(adoptions.length, 0, 'readback alone cannot select the new widget');
        if (scenario === 'refused-ack') {
          await flush(() => { authority.acknowledge(original); });
          assert.equal(adoptions.length, 0, 'a refused parent acknowledgement cannot select the new widget');
          continue;
        }
        await flush(() => { authority.acknowledge(replacement); });
      }
      if (scenario === 'source-identity-drift' || scenario === 'ambiguous-node-id') {
        assert.equal(adoptions.length, 1, `${scenario}: fresh source/target adoption may proceed without widget selection`);
        assert.equal(adoptions[0]?.builderSelection, undefined, `${scenario}: no exact new-widget selection on an ineligible fresh projection`);
      } else {
        assert.equal(adoptions.length, 2, `${scenario}: source-key adoption and exact builder continuation must both settle`);
        assert.equal(adoptions[1]?.builderSelection?.nodeId, 'scene:text-1', `${scenario}: Text must select its exact primary descendant`);
      }
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      if (root !== undefined) await flush(() => root?.unmount());
      restore();
    }
  }
  console.log(`B119_SOURCE_EDIT_INSERTION_TRANSFER_MATRIX ${JSON.stringify({ total: scenarios.length, passed: scenarios.length - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'typed insertion continuation requires delayed acknowledgement, exact fresh proof, and user-intervention cancellation');
}

async function runMountedUnnamedChunkEditRegression(fixture: P7SourceAuthorityFixture): Promise<void> {
  const doc = new MountedDomDocument();
  const restore = installMountedDomGlobals(doc);
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const path = 'ui/unnamed-chunk.lua';
  const content = [
    'local menu = { name = "X4UiSourceEditorP7E2E", layer = 1 }',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 100, reserveScrollBar = false, scaling = false })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("P7 E2E source")',
    'frame:display()',
    'function menu.previewLoop()',
    '  local loopFrame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    '  for i = 1, 2 do loopFrame:addTable(1, { width = 100 }) end',
    '  loopFrame:display()',
    'end',
    '',
  ].join('\n');
  const original = sanitizeWorkspace({ ...workspace, id: 'unnamed-chunk-edit', compileSettings: { ui: false }, passthroughFiles: [
    { path: 'ui.xml', content: `<addon name="chunk"><environment type="menus"><file name="${path}" /></environment></addon>`, reason: 'partial' },
    { path, content, reason: 'partial' },
  ] });
  const initialBytes = JSON.stringify(original);
  const candidate = projectX4UiEditorSession({ workspace: original, corpus: fixture.core }).preview.sourceCandidates.find(source => source.path === path);
  const chunk = candidate?.targets.find(target => target.kind === 'top-level');
  assert.ok(chunk, 'real Session must issue an unnamed chunk beside the named function');
  assert.equal(chunk.name, undefined);
  let currentWorkspace = original;
  let replacement: typeof original | undefined;
  let commit: React.Dispatch<React.SetStateAction<typeof original>> = () => { throw new Error('chunk parent not mounted'); };
  let root: ReturnType<typeof createRoot> | undefined;
  let submissions = 0;
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); });
  };
  const control = (id: string): MountedDomElement => {
    const element = mountedElementByTestId(container, id);
    assert.ok(element, `unnamed chunk: missing ${id}`);
    return element;
  };
  const loader = async () => ({ core: fixture.core, color: fixture.color });
  const surfaceFactory = (width: number, height: number) => new MountedCanvasElement(doc, width, height);
  const handler: X4UiWorkspaceEditHandler = request => {
    submissions += 1;
    assert.equal(request.expectedWorkspace, currentWorkspace);
    const next = request.workspace as typeof original;
    assert.equal(Object.isFrozen(next), true, 'actual SourceEdits returns its frozen replacement');
    const authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, next);
    flushSync(() => commit(next));
    assert.equal(currentWorkspace, next, 'real sanitizer helper retains exact frozen owner identity');
    replacement = next;
    authority.acknowledge(currentWorkspace);
    return authority.submission;
  };
  const Parent = (): React.ReactElement => {
    const [live, setLive] = React.useState(original);
    currentWorkspace = live;
    commit = update => setLive(previous => {
      const next = typeof update === 'function' ? update(previous) : update;
      return retainWorkspaceCandidateIfNormalizedUnchanged(next, sanitizeWorkspace(next));
    });
    return <X4UiSourceEditor workspace={live} corpusLoader={loader} surfaceFactory={surfaceFactory} onWorkspaceEdit={handler} />;
  };
  try {
    await flush(() => { root = createRoot(container as unknown as Element); root.render(<React.StrictMode><Parent /></React.StrictMode>); });
    await flush(() => {
      const select = control('x4-ui-source-selector');
      const option = select.options.find(item => item.textContent === path);
      assert.ok(option);
      select.value = option.value;
      select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    await flush(() => {
      const select = control('x4-ui-target-selector');
      const option = select.options.find(item => item.value.endsWith(`:${chunk.id}:top-level`));
      assert.ok(option, 'select exact owner-issued chunk, not a fallback name');
      select.value = option.value;
      select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current');
    const oldCanvas = control('x4-ui-canvas-host').firstElementChild;
    const oldSourceKey = control('x4-ui-source-selector').options.find(item => item.textContent === path)?.value;
    const oldTargetKey = control('x4-ui-target-selector').options.find(item => item.value.endsWith(':top-level'))?.value;
    const title = control('x4-ui-builder-hierarchy-list').querySelectorAll('button').find(item => item.textContent.startsWith('Text · P7 E2E source'));
    assert.ok(title);
    await flush(() => title.click());
    const input = control('x4-ui-builder-selection').querySelectorAll('input').find(item => item.value === 'P7 E2E source');
    assert.ok(input);
    const entryId = input.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
    assert.ok(entryId);
    const firstTitle = 'Edited "unnamed" \\ path';
    await flush(() => {
      input.focus();
      input.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
      input.value = firstTitle;
      input.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
      input.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    await flush(() => control(`x4-ui-source-edit-apply-${entryId}`).click());
    assert.equal(submissions, 1);
    assert.equal(currentWorkspace, replacement);
    const firstEditedContent = content.replace('"P7 E2E source"', JSON.stringify(firstTitle));
    assert.equal(currentWorkspace.passthroughFiles.find(file => file.path === path)?.content,
      firstEditedContent, 'only the selected escaped literal bytes change');
    assert.ok(firstEditedContent.includes(JSON.stringify(firstTitle)), 'the actual source edit must preserve quote/backslash encoding');
    assert.deepEqual(currentWorkspace.passthroughFiles.filter(file => file.path !== path), original.passthroughFiles.filter(file => file.path !== path));
    assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current', 'unnamed chunk edit must adopt a fresh current projection');
    assert.notEqual(control('x4-ui-canvas-host').firstElementChild, oldCanvas);
    const newSource = control('x4-ui-source-selector').options.find(item => item.textContent === path);
    const newTarget = control('x4-ui-target-selector').options.find(item => item.value.endsWith(':top-level'));
    assert.equal(newSource?.selected, true);
    assert.equal(newTarget?.selected, true);
    assert.notEqual(newSource?.value, oldSourceKey);
    assert.notEqual(newTarget?.value, oldTargetKey);
    assert.equal(control('x4-ui-canvas-export').disabled, false);
    assert.ok(control('x4-ui-builder-hierarchy-list').querySelectorAll('button').some(item => item.textContent.startsWith(`Text · ${firstTitle}`)));
    const retainedSelection = control('x4-ui-builder-selection');
    const retainedInput = retainedSelection.querySelectorAll('input').find(item => item.value === firstTitle);
    assert.ok(retainedInput, 'accepted exact title edit must retain the fresh selected element');
    const secondTitle = 'x';
    await flush(() => {
      retainedInput.focus();
      retainedInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
      retainedInput.value = secondTitle;
      retainedInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
      retainedInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    const secondEntryId = retainedInput.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
    assert.ok(secondEntryId, 'the fresh owner catalog must issue the second exact entry identity');
    await flush(() => control(`x4-ui-source-edit-apply-${secondEntryId}`).click());
    assert.equal(submissions, 2, 'the fresh selection must permit a repeated edit without reselecting');
    const secondEditedContent = firstEditedContent.replace(JSON.stringify(firstTitle), JSON.stringify(secondTitle));
    assert.equal(currentWorkspace.passthroughFiles.find(file => file.path === path)?.content, secondEditedContent);
    assert.ok(control('x4-ui-builder-selection').querySelectorAll('input').some(item => item.value === secondTitle));
    assert.ok(control('x4-ui-builder-hierarchy-list').querySelectorAll('button').some(item => item.textContent.startsWith('Text · x')));
    assert.equal(mountedElementText(container, 'x4-ui-game-truth'), 'Not verified in game');
    console.log('B119 unnamed-chunk actual Session/source-local edit + frozen sanitizer/flushSync acknowledgement + repeated fresh selection/canvas: PASS');
  } finally {
    assert.equal(JSON.stringify(original), initialBytes);
    if (root !== undefined) await flush(() => root?.unmount());
    restore();
  }
}

type MountedLuaTestFile = {
  readonly name: string;
  readonly size: number;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
};

const mountedLuaFileList = (files: readonly MountedLuaTestFile[]): FileList => {
  const list = {
    length: files.length,
    item: (index: number): MountedLuaTestFile | null => files[index] ?? null,
  } as unknown as FileList & Record<string, unknown>;
  files.forEach((file, index) => { list[String(index)] = file; });
  return list;
};

const mountedLuaFile = (name: string, bytes: Uint8Array, arrayBuffer?: () => Promise<ArrayBuffer>): MountedLuaTestFile => {
  const copy = bytes.slice();
  const buffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer;
  return { name, size: copy.byteLength, arrayBuffer: arrayBuffer ?? (async () => buffer.slice(0)) };
};

async function runMountedLuaFileRoundtrip(
  fixture: P7SourceAuthorityFixture,
  order: 'sync-readback' | 'ack-before-readback' | 'delayed-readback' | 'scope-crossed',
): Promise<void> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const name = order === 'sync-readback'
    ? 'b119-sync.lua'
    : order === 'ack-before-readback' ? 'b119-ack-first.lua'
      : order === 'scope-crossed' ? 'b119-scope.lua' : 'b119-delayed.lua';
  const path = `ui/${name}`;
  const importedText = `\uFEFF-- exact Unicode: Café 🚀\r\nlocal menu = { name = "${name}", layer = 1 }\r\nlocal frame = Helper.createFrameHandle(menu, { width = 120, height = 90 })\r\nlocal table = frame:addTable(1, { width = 100, scaling = false })\r\nframe:display()\r\n`;
  const importedBytes = new TextEncoder().encode(importedText);
  const originalUiXml = [
    '<addon name="b119_roundtrip">',
    '  <environment type="menus">',
    '    <file name="ui/edit.lua" />',
    '  </environment>',
    '</addon>',
  ].join('\r\n');
  const expectedUiXml = [
    '<addon name="b119_roundtrip">',
    '  <environment type="menus">',
    '    <file name="ui/edit.lua" />',
    `    <file name="${path}" />`,
    '  </environment>',
    '</addon>',
  ].join('\r\n');
  const original = sanitizeWorkspace({
    ...sourceEditIntegrationWorkspace,
    id: `x4-ui-lua-roundtrip-${order}`,
    passthroughFiles: sourceEditIntegrationWorkspace.passthroughFiles.map(file => file.path === 'ui.xml'
      ? { ...file, content: originalUiXml }
      : { ...file }),
  });
  const originalBytes = JSON.stringify(original);
  const expectedFiles = original.passthroughFiles.map((file, index) => index === 0
    ? { ...file, content: expectedUiXml }
    : { ...file });
  expectedFiles.push({ path, content: importedText, reason: 'partial', bytes: importedBytes.byteLength });
  const expectedWorkspace = { ...original, passthroughFiles: expectedFiles };
  let currentWorkspace: unknown = original;
  let replaceWorkspace: React.Dispatch<React.SetStateAction<unknown>> = () => { throw new Error('Lua roundtrip parent is not mounted'); };
  let changeScope: () => void = () => { throw new Error('Lua roundtrip scope parent is not mounted'); };
  let authority: X4UiWorkspaceEditPendingAuthority | undefined;
  let submissions = 0;
  let root: ReturnType<typeof createRoot> | undefined;
  let createdBlob: Blob | undefined;
  let downloadedPath = '';
  const revokedUrls: string[] = [];
  const urlCreateDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const urlRevokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const originalCreateElement = mountedDocument.createElement;
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const control = (testId: string): MountedDomElement => {
    const element = mountedElementByTestId(container, testId);
    assert.ok(element, `${order}: missing ${testId}`);
    return element;
  };
  const handler: X4UiWorkspaceEditHandler = request => {
    submissions += 1;
    assert.equal(request.expectedWorkspace, currentWorkspace, `${order}: import must use the exact live workspace CAS`);
    authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
    if (order === 'sync-readback') {
      flushSync(() => replaceWorkspace(request.workspace));
      authority.acknowledge(request.workspace);
    } else if (order === 'ack-before-readback') {
      authority.acknowledge(request.workspace);
    }
    return authority.submission;
  };
  const canonicalLoader = async (): Promise<{ readonly core: P7SourceAuthorityFixture['core']; readonly color: P7SourceAuthorityFixture['color'] }> => ({
    core: fixture.core,
    color: fixture.color,
  });
  const mountedSurfaceFactory = (width: number, height: number): MountedCanvasElement => new MountedCanvasElement(mountedDocument, width, height);
  const Parent = (): React.ReactElement => {
    const [liveWorkspace, setLiveWorkspace] = React.useState<unknown>(original);
    const [scope, setScope] = React.useState(`b119-lua-roundtrip-${order}`);
    currentWorkspace = liveWorkspace;
    changeScope = () => setScope('b119-lua-roundtrip-crossed-scope');
    replaceWorkspace = update => setLiveWorkspace(previous => {
      const candidate = typeof update === 'function' ? update(previous) : update;
      const normalized = sanitizeWorkspace(candidate);
      return retainWorkspaceCandidateIfNormalizedUnchanged(candidate, normalized);
    });
    return <X4UiSourceEditor
      workspace={liveWorkspace}
      corpusLoader={canonicalLoader}
      surfaceFactory={mountedSurfaceFactory}
      onWorkspaceEdit={handler}
      workspaceScope={scope}
    />;
  };
  const restoreDownloadHooks = (): void => {
    mountedDocument.createElement = originalCreateElement;
    if (urlCreateDescriptor === undefined) Reflect.deleteProperty(URL, 'createObjectURL');
    else Object.defineProperty(URL, 'createObjectURL', urlCreateDescriptor);
    if (urlRevokeDescriptor === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL');
    else Object.defineProperty(URL, 'revokeObjectURL', urlRevokeDescriptor);
  };
  try {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: (blob: Blob): string => {
        createdBlob = blob;
        return `blob:b119-${order}`;
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: (url: string): void => { revokedUrls.push(url); },
    });
    mountedDocument.createElement = (tagName: string): MountedDomElement => {
      const element = originalCreateElement.call(mountedDocument, tagName);
      if (tagName.toLowerCase() === 'a') {
        (element as unknown as { click: () => void }).click = () => {
          downloadedPath = String((element as unknown as { readonly download?: unknown }).download ?? '');
        };
      }
      return element;
    };
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<React.StrictMode><Parent /></React.StrictMode>);
    });
    const input = control('x4-ui-lua-file-input');
    (input as unknown as { files: FileList | null }).files = mountedLuaFileList([mountedLuaFile(name, importedBytes)]);
    input.value = `C:\\fakepath\\${name}`;
    assert.equal(input.files?.length, 1, `${order}: the mounted file input must expose the selected File before reset`);
    await flush(() => input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
    assert.equal(input.value, '', `${order}: file input must clear for same-file retry`);
    assert.equal(input.files?.length ?? 0, 0, `${order}: clearing the file input must clear its live FileList after the handler captured the File`);
    const assertNoEarlyAcceptance = (): void => {
      assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /Opened /, `${order}: one acknowledgement/readback signal must not report an opened file`);
      assert.equal(sourceSelectHasImportedSelection(), false, `${order}: one acknowledgement/readback signal must not select the imported source`);
    };
    const sourceSelectHasImportedSelection = (): boolean => {
      const sourceSelect = control('x4-ui-source-selector');
      return sourceSelect.options.some(option => option.textContent === path && option.selected);
    };
    if (order === 'ack-before-readback') {
      assert.equal(submissions, 1, `${order}: exactly one import is submitted before the delayed parent readback`);
      assert.equal(currentWorkspace, original, `${order}: acknowledgement alone must not replace the live parent workspace`);
      assertNoEarlyAcceptance();
      assert.ok(authority);
      await flush(() => replaceWorkspace(authority!.submission.workspace));
    } else if (order === 'delayed-readback') {
      assert.equal(submissions, 1, `${order}: exactly one import is submitted before delayed readback`);
      assert.equal(currentWorkspace, original, `${order}: delayed acknowledgement must not guess parent readback`);
      assert.ok(authority);
      await flush(() => replaceWorkspace(authority!.submission.workspace));
      assertNoEarlyAcceptance();
      await flush(() => authority!.acknowledge(authority!.submission.workspace));
    }
    if (order === 'scope-crossed') {
      assert.ok(authority, `${order}: parent must receive the import before the scope crossing`);
      await flush(() => replaceWorkspace(authority!.submission.workspace));
      assert.equal(currentWorkspace, authority!.submission.workspace, `${order}: the replacement object must be the exact parent readback object`);
      await flush(changeScope);
      assertNoEarlyAcceptance();
      assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /Opened |import applied|download requested/i, `${order}: a crossed workspace scope must not report confirmation`);
      await flush(() => authority!.acknowledge(authority!.submission.workspace));
      assertNoEarlyAcceptance();
      assert.equal(submissions, 1, `${order}: the crossed-scope attempt must never retry or create a second submission`);
      const crossedWorkspace = currentWorkspace as typeof original;
      assert.deepEqual(crossedWorkspace, expectedWorkspace, `${order}: scope cancellation must not alter the exact accepted workspace`);
      console.log('B119 Batch B mounted same-object readback plus crossed workspace-scope refusal: PASS');
      return;
    }
    const importedWorkspace = currentWorkspace as typeof original;
    assert.deepEqual(importedWorkspace, expectedWorkspace, `${order}: accepted import must preserve the complete workspace and only apply the exact registration/file transaction`);
    const importedFile = importedWorkspace.passthroughFiles.find(file => file.path === path);
    assert.equal(importedFile?.content, importedText, `${order}: import must preserve full text including BOM, CRLF, Unicode, and comments`);
    assert.deepEqual(
      Array.from(new TextEncoder().encode(importedFile?.content ?? '')),
      Array.from(importedBytes),
      `${order}: imported UTF-8 bytes must round-trip exactly`,
    );
    assert.notEqual(JSON.stringify(importedWorkspace), originalBytes);
    assert.equal(submissions, 1, `${order}: file import creates exactly one workspace submission`);
    const sourceSelect = control('x4-ui-source-selector');
    const importedOption = sourceSelect.options.find(option => option.textContent === path);
    assert.ok(importedOption, `${order}: imported source must be issued into the current source catalog`);
    assert.equal(importedOption.selected, true, `${order}: a uniquely fresh imported source must be selected`);
    const importStatus = mountedElementText(container, 'x4-ui-lua-status');
    assert.match(importStatus, /opened/i, `${order}: import status must describe the opened file`);
    assert.doesNotMatch(importStatus, /operation|compiler|source.?op|compile/i, `${order}: ordinary status must not expose source-operation/compiler controls`);

    const workspaceBeforeExport = JSON.stringify(currentWorkspace);
    await flush(() => mountedReactClickCallback(control('x4-ui-lua-export'), 'Lua roundtrip export')());
    assert.ok(createdBlob, `${order}: export must hand the exact source bytes to Blob/objectURL`);
    const exported = new Uint8Array(await createdBlob!.arrayBuffer());
    assert.deepEqual(Array.from(exported), Array.from(importedBytes), `${order}: exported Blob bytes must equal the imported whole file`);
    assert.equal(downloadedPath, name, `${order}: export must use the safe source filename for download`);
    assert.deepEqual(revokedUrls, [`blob:b119-${order}`], `${order}: export must revoke the object URL exactly once`);
    assert.equal(mountedDocument.body.getElementsByTagName('a').length, 0, `${order}: export must remove its temporary anchor`);
    assert.equal(JSON.stringify(currentWorkspace), workspaceBeforeExport, `${order}: export must not mutate the workspace or create a parent history submission`);
    assert.equal(submissions, 1, `${order}: export must not call the workspace commit seam`);
    const exportStatus = mountedElementText(container, 'x4-ui-lua-status');
    assert.match(exportStatus, /download requested/i, `${order}: export must report a download request, not a disk save`);
    assert.match(exportStatus, /final file save is not verified/i, `${order}: export must keep final save verification honest`);
    assert.match(exportStatus, /Lua source only/i, `${order}: export must state that dependencies are excluded`);
    assert.match(exportStatus, /Not verified in game/);
    console.log(`B119 Batch B mounted actual Session/New-menu Lua ${order} + exact Blob/cleanup/no-history: PASS`);
  } finally {
    if (root !== undefined) await flush(() => root?.unmount());
    restoreDownloadHooks();
    restoreGlobals();
  }
}

async function runMountedLuaFileGuardRegression(): Promise<void> {
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  const source = integrationProjection.source;
  const candidate = {
    raw: integrationSourceCandidate as unknown as Record<string, unknown>,
    index: integrationSourceCandidate.index,
    path: integrationSourceCandidate.path,
    key: 'guard-source',
    sourceIdentity: integrationSourceCandidate.sourceIdentity,
    targets: [],
  } as unknown as React.ComponentProps<typeof X4UiSourceEditorLuaFiles>['candidates'][number];
  let parentCalls = 0;
  let root: ReturnType<typeof createRoot> | undefined;
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); });
  };
  const control = (testId: string): MountedDomElement => {
    const element = mountedElementByTestId(container, testId);
    assert.ok(element, `Lua guard: missing ${testId}`);
    return element;
  };
  const render = async (staged: boolean, pending: boolean): Promise<void> => {
    await flush(() => {
      root ??= createRoot(container as unknown as Element);
      root.render(<X4UiSourceEditorLuaFiles
        workspace={sourceEditIntegrationWorkspace}
        scope="b119-lua-guard"
        source={source}
        selectedSourcePath="ui/edit.lua"
        candidates={[candidate]}
        sourceSelector="guard-source"
        targetSelector="guard-target"
        onWorkspaceEdit={() => { parentCalls += 1; return { status: 'refused', reason: 'unexpected', detail: 'guard parent must not be called' }; }}
        sourceEditStaged={staged}
        sourceEditPending={pending}
        onSelect={() => undefined}
      />);
    });
  };
  try {
    await render(true, false);
    const input = control('x4-ui-lua-file-input');
    const bytes = new TextEncoder().encode('local value = 1');
    (input as unknown as { files: FileList | null }).files = mountedLuaFileList([mountedLuaFile('guard.lua', bytes)]);
    await flush(() => input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
    await flush(() => mountedReactClickCallback(control('x4-ui-lua-export'), 'Lua guard export')());
    assert.match(mountedElementText(container, 'x4-ui-lua-status'), /Apply or Discard/i, 'staged source edits must block both direct file handlers');
    assert.equal(parentCalls, 0, 'staged source edits must not reach the commit seam');
    await render(false, true);
    await flush(() => mountedReactClickCallback(control('x4-ui-lua-export'), 'Lua pending guard export')());
    assert.match(mountedElementText(container, 'x4-ui-lua-status'), /pending source edit/i, 'pending source edits must block export');
    assert.equal(parentCalls, 0, 'pending source edits must not reach the commit seam');
    const pendingInput = control('x4-ui-lua-file-input');
    (pendingInput as unknown as { files: FileList | null }).files = mountedLuaFileList([mountedLuaFile('pending.lua', bytes)]);
    pendingInput.value = 'C:\\fakepath\\pending.lua';
    await flush(() => pendingInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
    assert.match(mountedElementText(container, 'x4-ui-lua-status'), /pending source edit/i, 'pending source edits must block direct Open handling');
    assert.equal(parentCalls, 0, 'pending direct Open must not reach the commit seam');

    await render(false, false);
    const invalidInput = control('x4-ui-lua-file-input');
    let invalidReads = 0;
    const invalidBytes = new Uint8Array([0xff, 0xfe, 0xfd]);
    (invalidInput as unknown as { files: FileList | null }).files = mountedLuaFileList([mountedLuaFile(
      'invalid.lua',
      invalidBytes,
      async () => { invalidReads += 1; return invalidBytes.buffer.slice(0); },
    )]);
    await flush(() => invalidInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
    assert.equal(invalidReads, 1, 'invalid UTF-8 must be read once before fatal decode refusal');
    assert.match(mountedElementText(container, 'x4-ui-lua-status'), /UTF-8/i);
    assert.equal(parentCalls, 0);
    const oversizedInput = control('x4-ui-lua-file-input');
    let oversizedReads = 0;
    (oversizedInput as unknown as { files: FileList | null }).files = mountedLuaFileList([{
      name: 'oversized.lua',
      size: X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES + 1,
      arrayBuffer: async () => { oversizedReads += 1; throw new Error('size guard must run before arrayBuffer'); },
    }]);
    await flush(() => oversizedInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
    assert.equal(oversizedReads, 0, 'File.size must be checked before arrayBuffer');
    assert.match(mountedElementText(container, 'x4-ui-lua-status'), /4 MiB|4,194,304|size/i);
    assert.equal(parentCalls, 0);
    console.log('B119 Batch B direct-handler staged/pending/invalid-UTF8/pre-read-size guards: PASS');
  } finally {
    if (root !== undefined) await flush(() => root?.unmount());
    restoreGlobals();
  }
}

async function runMountedLuaFileAsyncGuardMatrix(): Promise<void> {
  const scenarios = [
    'cancel', 'read-failure', 'double-action', 'superseded', 'workspace-switch',
    'source-switch', 'selection-switch', 'unmount', 'reentrant',
  ] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string; status: string; technical: string }[] = [];
  for (const scenario of scenarios) {
    const mountedDocument = new MountedDomDocument();
    const restoreGlobals = installMountedDomGlobals(mountedDocument);
    const container = mountedDocument.createElement('div');
    mountedDocument.body.appendChild(container);
    const original = sourceEditIntegrationWorkspace;
    const source = integrationProjection.source;
    const oldCandidate = {
      raw: {},
      index: 0,
      path: 'ui/edit.lua',
      key: `b119-old-${scenario}`,
      sourceIdentity: { file: 'ui/edit.lua', sha256: `old-${scenario}` },
      targets: [{ raw: { name: 'menu.old' }, key: `b119-old-target-${scenario}`, label: 'menu.old' }],
    } as unknown as React.ComponentProps<typeof X4UiSourceEditorLuaFiles>['candidates'][number];
    const validBytes = new TextEncoder().encode(`local menu = { name = "${scenario}", layer = 1 }\nlocal frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })\nframe:display()\n`);
    const validBuffer = validBytes.buffer.slice(validBytes.byteOffset, validBytes.byteOffset + validBytes.byteLength) as ArrayBuffer;
    let root: ReturnType<typeof createRoot> | undefined;
    let parentCalls = 0;
    let secondReads = 0;
    let currentProps: React.ComponentProps<typeof X4UiSourceEditorLuaFiles>;
    let resolveRead: ((buffer: ArrayBuffer) => void) | undefined;
    let authority: X4UiWorkspaceEditPendingAuthority | undefined;
    let reentrantInputReads = 0;
    let downloadUrlHandoffs = 0;
    let anchorClickHandoffs = 0;
    const urlCreateDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalCreateElement = mountedDocument.createElement;
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => {
        operation();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    const control = (testId: string): MountedDomElement => {
      const element = mountedElementByTestId(container, testId);
      assert.ok(element, `${scenario}: missing ${testId}`);
      return element;
    };
    const handler: X4UiWorkspaceEditHandler = request => {
      parentCalls += 1;
      assert.equal(request.expectedWorkspace, currentProps.workspace, `${scenario}: parent must receive the exact live workspace`);
      authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
      if (scenario === 'reentrant') {
        const input = control('x4-ui-lua-file-input');
        const reentrantFile = mountedLuaFile('b119-reentrant.lua', validBytes, async () => {
          reentrantInputReads += 1;
          return validBuffer.slice(0);
        });
        (input as unknown as { files: FileList | null }).files = mountedLuaFileList([reentrantFile]);
        input.value = 'C:\\fakepath\\b119-reentrant.lua';
        input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        mountedReactClickCallback(control('x4-ui-lua-export'), `${scenario}: reentrant export callback`)();
      }
      return authority.submission;
    };
    currentProps = {
      workspace: original,
      scope: `b119-lua-async-${scenario}`,
      source,
      selectedSourcePath: 'ui/edit.lua',
      candidates: [oldCandidate],
      sourceSelector: oldCandidate.key,
      targetSelector: oldCandidate.targets[0].key,
      onWorkspaceEdit: handler,
      sourceEditStaged: false,
      sourceEditPending: false,
      onSelect: () => undefined,
    };
    const render = (next: Partial<React.ComponentProps<typeof X4UiSourceEditorLuaFiles>> = {}): void => {
      currentProps = { ...currentProps, ...next };
      root?.render(<X4UiSourceEditorLuaFiles {...currentProps} />);
    };
    const dispatchFile = async (file: MountedLuaTestFile): Promise<void> => {
      const input = control('x4-ui-lua-file-input');
      (input as unknown as { files: FileList | null }).files = mountedLuaFileList([file]);
      input.value = `C:\\fakepath\\${file.name}`;
      await flush(() => input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
    };
    const deferredFile = (name: string): MountedLuaTestFile => mountedLuaFile(name, validBytes, () => (
      new Promise<ArrayBuffer>(resolve => { resolveRead = resolve; })
    ));
    try {
      const originalSnapshot = JSON.stringify(original);
      const preflight = importX4UiWorkspaceLua(original, source, {
        path: `ui/b119-preflight-${scenario}.lua`,
        text: new TextDecoder().decode(validBytes),
      });
      assert.equal(preflight.accepted, true, `${scenario}: guard fixture must reach the real import owner: ${JSON.stringify(preflight.accepted ? { accepted: true } : preflight)}`);
      assert.equal(JSON.stringify(original), originalSnapshot, `${scenario}: import preflight must not mutate the guard fixture`);
      if (scenario === 'reentrant') {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          writable: true,
          value: (): string => {
            downloadUrlHandoffs += 1;
            return 'blob:b119-reentrant-download';
          },
        });
        mountedDocument.createElement = (tagName: string): MountedDomElement => {
          const element = originalCreateElement.call(mountedDocument, tagName);
          if (tagName.toLowerCase() === 'a') {
            (element as unknown as { click: () => void }).click = () => { anchorClickHandoffs += 1; };
          }
          return element;
        };
      }
      await flush(() => {
        root = createRoot(container as unknown as Element);
        render();
      });
      if (scenario === 'read-failure') {
        await dispatchFile(mountedLuaFile('b119-read-failure.lua', validBytes, async () => {
          throw new Error('fixture read failure');
        }));
        assert.equal(parentCalls, 0, `${scenario}: a failed read must not reach the workspace owner`);
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /could not be read|refused/i);
        assert.equal(mountedElementText(container, 'x4-ui-lua-technical').includes('fixture read failure'), true,
          `${scenario}: the technical read failure must remain inspectable`);
        continue;
      }
      if (scenario === 'double-action') {
        await dispatchFile(deferredFile('b119-first.lua'));
        const second = mountedLuaFile('b119-second.lua', validBytes, async () => {
          secondReads += 1;
          return validBuffer.slice(0);
        });
        await dispatchFile(second);
        assert.equal(secondReads, 0, `${scenario}: a second file action must not start while the first is reading`);
        assert.equal(parentCalls, 0, `${scenario}: a double action must not submit before the first read settles`);
        resolveRead?.(validBuffer.slice(0));
        await flush(() => undefined);
        assert.equal(parentCalls, 1, `${scenario}: only the first file action may submit`);
        continue;
      }
      if (scenario === 'superseded') {
        await dispatchFile(deferredFile('b119-superseded-old.lua'));
        await flush(() => mountedReactClickCallback(control('x4-ui-lua-cancel'), `${scenario}: cancel old read`)());
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /cancelled/i);
        const second = mountedLuaFile('b119-superseded-new.lua', validBytes);
        await dispatchFile(second);
        assert.equal(parentCalls, 1, `${scenario}: the replacement attempt must submit once`);
        resolveRead?.(validBuffer.slice(0));
        await flush(() => undefined);
        assert.equal(parentCalls, 1, `${scenario}: the late old read must not submit or overwrite the replacement attempt`);
        continue;
      }
      if (scenario === 'cancel') {
        await dispatchFile(deferredFile('b119-cancel.lua'));
        await flush(() => mountedReactClickCallback(control('x4-ui-lua-cancel'), `${scenario}: direct cancel callback`)());
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /cancelled/i);
        resolveRead?.(validBuffer.slice(0));
        await flush(() => undefined);
        assert.equal(parentCalls, 0, `${scenario}: a cancelled read must not submit after its promise resolves`);
        continue;
      }
      if (scenario === 'unmount') {
        await dispatchFile(deferredFile('b119-unmount.lua'));
        await flush(() => { root?.unmount(); root = undefined; });
        resolveRead?.(validBuffer.slice(0));
        await flush(() => undefined);
        assert.equal(parentCalls, 0, `${scenario}: an unmounted read must not reach the workspace owner`);
        assert.equal(container.childNodes.length, 0, `${scenario}: unmount must leave no mounted file controls`);
        continue;
      }
      if (scenario === 'workspace-switch' || scenario === 'source-switch' || scenario === 'selection-switch') {
        await dispatchFile(deferredFile(`b119-${scenario}.lua`));
        const next = scenario === 'workspace-switch'
          ? { workspace: { ...original, id: `b119-switched-${scenario}` } }
          : scenario === 'source-switch'
            ? { source: { ...source } as typeof source }
            : { sourceSelector: 'b119-deliberate-source', targetSelector: 'b119-deliberate-target' };
        await flush(() => render(next));
        resolveRead?.(validBuffer.slice(0));
        await flush(() => undefined);
        assert.equal(parentCalls, 0, `${scenario}: a changed live context must cancel the pending read before commit`);
        assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /Opened /, `${scenario}: a cancelled read must not report opened`);
        continue;
      }
      if (scenario === 'reentrant') {
        await dispatchFile(deferredFile('b119-reentrant-first.lua'));
        assert.equal(control('x4-ui-lua-export').disabled, true, `${scenario}: Export must be visibly disabled while Open Lua is reading`);
        await flush(() => mountedReactClickCallback(control('x4-ui-lua-export'), `${scenario}: direct busy export callback`)());
        assert.equal(parentCalls, 0, `${scenario}: a direct busy Export callback must not submit or create a download`);
        assert.equal(downloadUrlHandoffs, 0, `${scenario}: a busy Export callback must not create an object URL while File reading is deferred`);
        assert.equal(anchorClickHandoffs, 0, `${scenario}: a busy Export callback must not click a download anchor while File reading is deferred`);
        resolveRead?.(validBuffer.slice(0));
        await flush(() => undefined);
        assert.equal(parentCalls, 1, `${scenario}: the outer import must submit exactly once`);
        assert.equal(reentrantInputReads, 0, `${scenario}: the reentrant file action must be blocked before reading`);
        assert.equal(control('x4-ui-lua-export').disabled, true, `${scenario}: Export must remain visibly disabled while parent acknowledgement is pending`);
        await flush(() => mountedReactClickCallback(control('x4-ui-lua-export'), `${scenario}: direct pending export callback`)());
        assert.equal(parentCalls, 1, `${scenario}: a retained Export callback must be rejected while parent acknowledgement is pending`);
        assert.equal(downloadUrlHandoffs, 0, `${scenario}: a pending Export callback must not create an object URL`);
        assert.equal(anchorClickHandoffs, 0, `${scenario}: a pending Export callback must not click a download anchor`);
        continue;
      }
      throw new Error(`${scenario}: unhandled async guard scenario`);
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error),
        status: mountedElementText(container, 'x4-ui-lua-status'),
        technical: mountedElementText(container, 'x4-ui-lua-technical') });
    } finally {
      if (root !== undefined) await flush(() => root?.unmount());
      mountedDocument.createElement = originalCreateElement;
      if (urlCreateDescriptor === undefined) Reflect.deleteProperty(URL, 'createObjectURL');
      else Object.defineProperty(URL, 'createObjectURL', urlCreateDescriptor);
      restoreGlobals();
    }
  }
  console.log(`B119_LUA_FILE_ASYNC_GUARD_MATRIX ${JSON.stringify({ total: scenarios.length, passed: scenarios.length - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'Lua file reads must honor cancellation, supersession, live-context guards, unmount, and reentrant-action boundaries');
}

async function runMountedLuaFileSelectionAndAcknowledgementMatrix(): Promise<void> {
  const scenarios = ['sole-target', 'multiple-targets', 'no-targets', 'later-selection', 'selection-callback-throws', 'parent-refused', 'forged-ack', 'crossed-ack', 'rejected-ack'] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string }[] = [];
  for (const scenario of scenarios) {
    const mountedDocument = new MountedDomDocument();
    const restoreGlobals = installMountedDomGlobals(mountedDocument);
    const container = mountedDocument.createElement('div');
    mountedDocument.body.appendChild(container);
    const original = sanitizeWorkspace({ ...sourceEditIntegrationWorkspace, id: `b119-lua-selection-${scenario}` });
    const exactProjection = projectX4UiEditorSession({
      workspace: original,
      corpus: undefined,
      profile: { width: 100, height: 80, uiScale: 1 },
    });
    const source = exactProjection.source;
    const path = `ui/b119-${scenario}.lua`;
    const bytes = new TextEncoder().encode(`local menu = { name = "${scenario}", layer = 1 }\nlocal frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })\nframe:display()\n`);
    const oldCandidate = {
      raw: {}, index: 0, path: 'ui/edit.lua', key: `old-${scenario}`,
      sourceIdentity: { file: 'ui/edit.lua', sha256: `old-${scenario}` },
      targets: [{ raw: { name: 'menu.old' }, key: `old-target-${scenario}`, label: 'menu.old' }],
    } as unknown as React.ComponentProps<typeof X4UiSourceEditorLuaFiles>['candidates'][number];
    const targetFor = (suffix: string) => ({ raw: { id: `id-${suffix}-${scenario}`, name: `menu.${suffix}` }, key: `target-${suffix}-${scenario}`, label: `menu.${suffix}` });
    const freshTargets = scenario === 'sole-target' || scenario === 'later-selection' || scenario === 'selection-callback-throws' ? [targetFor('sole')]
      : scenario === 'multiple-targets' ? [targetFor('first'), targetFor('second')] : [];
    const freshCandidate = {
      raw: { menuTargetIds: freshTargets.map(target => target.raw.id) }, index: 1, path, key: `fresh-${scenario}`,
      sourceIdentity: { file: path, sourcePath: path, sha256: `fresh-${scenario}` },
      targets: [...freshTargets, targetFor('cleanup')],
    } as unknown as React.ComponentProps<typeof X4UiSourceEditorLuaFiles>['candidates'][number];
    let root: ReturnType<typeof createRoot> | undefined;
    let currentWorkspace: unknown = original;
    const originalWorkspaceSnapshot = JSON.stringify(original);
    let currentProps: React.ComponentProps<typeof X4UiSourceEditorLuaFiles>;
    let parentCalls = 0;
    let authority: X4UiWorkspaceEditPendingAuthority | undefined;
    const retryScenarios = new Set<typeof scenarios[number]>(['parent-refused', 'forged-ack', 'crossed-ack', 'rejected-ack']);
    const selections: { readonly sourceSelector: string; readonly targetSelector: string }[] = [];
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    };
    const control = (testId: string): MountedDomElement => {
      const element = mountedElementByTestId(container, testId);
      assert.ok(element, `${scenario}: missing ${testId}`);
      return element;
    };
    const handler: X4UiWorkspaceEditHandler = request => {
      parentCalls += 1;
      assert.equal(request.expectedWorkspace, currentWorkspace, `${scenario}: import must use the exact current workspace`);
      authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
      if (retryScenarios.has(scenario) && parentCalls === 1 && scenario === 'parent-refused') {
        return { status: 'refused', reason: 'stale-parent-workspace', detail: 'fixture parent refusal' };
      }
      if (retryScenarios.has(scenario) && parentCalls === 1 && scenario === 'forged-ack') {
        const issued = authority.acknowledge(request.workspace);
        return { ...authority.submission, acknowledgement: Promise.resolve({ ...issued }) };
      }
      if (retryScenarios.has(scenario) && parentCalls === 1 && scenario === 'crossed-ack') {
        const crossed = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
        return { ...authority.submission, acknowledgement: Promise.resolve(crossed.acknowledge(request.workspace)) };
      }
      if (retryScenarios.has(scenario) && parentCalls === 1 && scenario === 'rejected-ack') {
        return { ...authority.submission, acknowledgement: Promise.reject(new Error('fixture acknowledgement rejection')) };
      }
      return authority.submission;
    };
    currentProps = {
      workspace: original,
      scope: `b119-lua-selection-scope-${scenario}`,
      source,
      selectedSourcePath: 'ui/edit.lua',
      candidates: [oldCandidate],
      sourceSelector: oldCandidate.key,
      targetSelector: oldCandidate.targets[0].key,
      onWorkspaceEdit: handler,
      sourceEditStaged: false,
      sourceEditPending: false,
      onSelect: selection => {
        if (scenario === 'selection-callback-throws') throw new Error('fixture selection callback failure');
        selections.push(selection);
      },
    };
    const render = (next: Partial<React.ComponentProps<typeof X4UiSourceEditorLuaFiles>> = {}): void => {
      currentProps = { ...currentProps, ...next };
      root?.render(<X4UiSourceEditorLuaFiles {...currentProps} />);
    };
    try {
      await flush(() => {
        root = createRoot(container as unknown as Element);
        render();
      });
      const input = control('x4-ui-lua-file-input');
      (input as unknown as { files: FileList | null }).files = mountedLuaFileList([mountedLuaFile(path.slice(3), bytes)]);
      input.value = `C:\\fakepath\\${path.slice(3)}`;
      await flush(() => input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
      if (retryScenarios.has(scenario)) {
        assert.equal(parentCalls, 1, `${scenario}: refusal/forged receipt must be observed exactly once`);
        assert.equal(currentWorkspace, original, `${scenario}: refusal must preserve the current workspace identity`);
        assert.equal(JSON.stringify(currentWorkspace), originalWorkspaceSnapshot, `${scenario}: refusal must preserve the detached complete workspace snapshot`);
        assert.equal(JSON.stringify(original), originalWorkspaceSnapshot, `${scenario}: refusal must not mutate the original workspace object in place`);
        assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /Opened /, `${scenario}: refusal must not report an opened file`);
        assert.equal(selections.length, 0, `${scenario}: refusal must not select a source or target`);
        assert.equal(mountedElementText(container, 'x4-ui-lua-status'), 'The workspace changed before the imported file could be confirmed. Retry from the current workspace.',
          `${scenario}: refusal must expose the visible retry instruction`);
        assert.equal(control('x4-ui-lua-open').disabled, false, `${scenario}: Open Lua must be usable after refusal settles`);
        assert.equal(control('x4-ui-lua-file-input').disabled, false, `${scenario}: file input must be usable after refusal settles`);
        assert.equal(control('x4-ui-lua-export').disabled, false, `${scenario}: Export must be usable after refusal settles`);
        assert.equal(mountedDocument.body.getElementsByTagName('a').length, 0, `${scenario}: refusal must not create a download anchor`);
        const retryInput = control('x4-ui-lua-file-input');
        (retryInput as unknown as { files: FileList | null }).files = mountedLuaFileList([mountedLuaFile(path.slice(3), bytes)]);
        retryInput.value = `C:\\fakepath\\${path.slice(3)}`;
        await flush(() => retryInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
        assert.equal(parentCalls, 2, `${scenario}: a valid retry must reach the parent exactly once after the refusal`);
        assert.ok(authority, `${scenario}: the valid retry must retain a parent acknowledgement authority`);
        const retryAuthority = authority;
        const replacement = retryAuthority.submission.workspace;
        assert.notEqual(JSON.stringify(replacement), originalWorkspaceSnapshot, `${scenario}: the valid retry must produce a replacement workspace`);
        currentWorkspace = replacement;
        assert.equal(JSON.stringify(original), originalWorkspaceSnapshot, `${scenario}: the valid retry must not mutate the detached original workspace object`);
        await flush(() => render({ workspace: replacement, candidates: [oldCandidate, freshCandidate] }));
        assert.equal(selections.length, 0, `${scenario}: retry readback alone must not adopt a source before acknowledgement`);
        await flush(() => retryAuthority.acknowledge(replacement));
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /Opened /, `${scenario}: valid retry must report opened after authentic acknowledgement`);
        assert.deepEqual(selections, [{ sourceSelector: freshCandidate.key, targetSelector: '' }], `${scenario}: valid retry must select the imported source on readback`);
        assert.equal(mountedDocument.body.getElementsByTagName('a').length, 0, `${scenario}: retry must not create a download anchor`);
        continue;
      }
      assert.ok(authority, `${scenario}: accepted import must retain the parent acknowledgement authority`);
      const replacement = authority.submission.workspace;
      currentWorkspace = replacement;
      const deliberate = scenario === 'later-selection'
        ? { sourceSelector: 'deliberate-source', targetSelector: 'deliberate-target' }
        : {};
      await flush(() => render({ workspace: replacement, candidates: [oldCandidate, freshCandidate], ...deliberate }));
      assert.equal(selections.length, 0, `${scenario}: exact readback alone must not adopt a source`);
      await flush(() => authority!.acknowledge(replacement));
      assert.equal(parentCalls, 1, `${scenario}: one accepted import must have exactly one parent call`);
      assert.match(mountedElementText(container, 'x4-ui-lua-status'), /Opened /, `${scenario}: accepted import must report opened`);
      if (scenario === 'sole-target') {
        assert.deepEqual(selections, [{ sourceSelector: freshCandidate.key, targetSelector: freshTargets[0].key }], `${scenario}: one target must be selected automatically`);
      } else if (scenario === 'multiple-targets') {
        assert.deepEqual(selections, [{ sourceSelector: freshCandidate.key, targetSelector: '' }], `${scenario}: multiple targets must prompt a target choice`);
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /Choose a menu target from Menu/);
      } else if (scenario === 'no-targets') {
        assert.deepEqual(selections, [{ sourceSelector: freshCandidate.key, targetSelector: '' }], `${scenario}: a source with no targets must still be selected`);
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /no supported menu target/i);
        assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /failed|refused/i);
      } else if (scenario === 'later-selection') {
        assert.deepEqual(selections, [], `${scenario}: a later deliberate selection must not be overwritten`);
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /later selection was kept/);
        assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /selected its menu target/);
      } else {
        assert.deepEqual(selections, [], `${scenario}: a throwing selection callback must not report an applied target`);
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /not selected|accepted/i);
        assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /selected its menu target/);
        assert.match(mountedElementText(container, 'x4-ui-lua-technical'), /selection callback/i);
      }
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      if (root !== undefined) await flush(() => root?.unmount());
      restoreGlobals();
    }
  }
  console.log(`B119_LUA_FILE_SELECTION_ACK_MATRIX ${JSON.stringify({ total: scenarios.length, passed: scenarios.length - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'Lua file acknowledgement and target cardinality must have exact acceptance and selection behavior');
}

async function runMountedLuaFileInputBoundaryMatrix(): Promise<void> {
  const scenarios = ['wrong-extension', 'traversal', 'reserved-device', 'collision', 'multiple-files', 'post-read-cap'] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string }[] = [];
  for (const scenario of scenarios) {
    const mountedDocument = new MountedDomDocument();
    const restoreGlobals = installMountedDomGlobals(mountedDocument);
    const container = mountedDocument.createElement('div');
    mountedDocument.body.appendChild(container);
    const original = sourceEditIntegrationWorkspace;
    const originalBytes = JSON.stringify(original);
    const source = integrationProjection.source;
    const candidate = {
      raw: {}, index: 0, path: 'ui/edit.lua', key: `boundary-source-${scenario}`,
      sourceIdentity: { file: 'ui/edit.lua', sha256: `boundary-${scenario}` },
      targets: [{ raw: { name: 'menu.edit' }, key: `boundary-target-${scenario}`, label: 'menu.edit' }],
    } as unknown as React.ComponentProps<typeof X4UiSourceEditorLuaFiles>['candidates'][number];
    const validBytes = new TextEncoder().encode('local menu = { name = "Boundary", layer = 1 }\nlocal frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })\nframe:display()\n');
    const oversizedBytes = new Uint8Array(X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES + 1);
    let root: ReturnType<typeof createRoot> | undefined;
    let parentCalls = 0;
    let reads = 0;
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    };
    const control = (testId: string): MountedDomElement => {
      const element = mountedElementByTestId(container, testId);
      assert.ok(element, `${scenario}: missing ${testId}`);
      return element;
    };
    const props: React.ComponentProps<typeof X4UiSourceEditorLuaFiles> = {
      workspace: original,
      scope: `b119-lua-boundary-${scenario}`,
      source,
      selectedSourcePath: 'ui/edit.lua',
      candidates: [candidate],
      sourceSelector: candidate.key,
      targetSelector: candidate.targets[0].key,
      onWorkspaceEdit: () => { parentCalls += 1; return { status: 'refused', reason: 'unexpected', detail: 'boundary must not commit' }; },
      sourceEditStaged: false,
      sourceEditPending: false,
      onSelect: () => undefined,
    };
    const fileFor = (): MountedLuaTestFile => {
      if (scenario === 'wrong-extension') return mountedLuaFile('not-lua.txt', validBytes, async () => { reads += 1; return validBytes.buffer.slice(0); });
      if (scenario === 'traversal') return mountedLuaFile('../escape.lua', validBytes, async () => { reads += 1; return validBytes.buffer.slice(0); });
      if (scenario === 'reserved-device') return mountedLuaFile('COM¹.lua', validBytes, async () => { reads += 1; return validBytes.buffer.slice(0); });
      if (scenario === 'collision') return mountedLuaFile('edit.lua', validBytes, async () => { reads += 1; return validBytes.buffer.slice(0); });
      if (scenario === 'post-read-cap') return {
        name: 'post-read-cap.lua', size: X4_UI_WORKSPACE_LUA_MAX_FILE_BYTES,
        arrayBuffer: async () => { reads += 1; return oversizedBytes.buffer.slice(0) as ArrayBuffer; },
      };
      return mountedLuaFile('first.lua', validBytes, async () => { reads += 1; return validBytes.buffer.slice(0); });
    };
    try {
      await flush(() => {
        root = createRoot(container as unknown as Element);
        root.render(<X4UiSourceEditorLuaFiles {...props} />);
      });
      const input = control('x4-ui-lua-file-input');
      const first = fileFor();
      (input as unknown as { files: FileList | null }).files = scenario === 'multiple-files'
        ? mountedLuaFileList([first, mountedLuaFile('second.lua', validBytes)])
        : mountedLuaFileList([first]);
      input.value = `C:\\fakepath\\${first.name}`;
      await flush(() => input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true })));
      assert.equal(input.files?.length ?? 0, 0, `${scenario}: the input reset must clear the selected FileList`);
      assert.equal(parentCalls, 0, `${scenario}: boundary refusal must not reach the workspace owner`);
      assert.equal(JSON.stringify(original), originalBytes, `${scenario}: boundary refusal must preserve the complete workspace`);
      if (scenario === 'wrong-extension' || scenario === 'traversal') {
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /safe .lua|simple filename/i);
        assert.equal(reads, 0, `${scenario}: unsafe names must be refused before reading`);
      } else if (scenario === 'reserved-device') {
        assert.match(`${mountedElementText(container, 'x4-ui-lua-status')} ${mountedElementText(container, 'x4-ui-lua-technical')}`, /safe|device|Windows/i);
        assert.equal(reads, 1, `${scenario}: the source owner may perform the bounded device-name refusal after reading`);
      } else if (scenario === 'collision') {
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /already used|never overwritten/i);
        assert.equal(reads, 1);
      } else if (scenario === 'multiple-files') {
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /exactly one/i);
        assert.equal(reads, 0, `${scenario}: selecting multiple files must not read either file`);
      } else {
        assert.match(mountedElementText(container, 'x4-ui-lua-status'), /4 MiB|4,194,304|larger|size/i);
        assert.equal(reads, 1, `${scenario}: the post-read size cap must inspect the returned bytes once`);
      }
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      if (root !== undefined) await flush(() => root?.unmount());
      restoreGlobals();
    }
  }
  console.log(`B119_LUA_FILE_INPUT_BOUNDARY_MATRIX ${JSON.stringify({ total: scenarios.length, passed: scenarios.length - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'Lua file input names, collision, cardinality, and post-read cap must refuse without mutation');
}

async function runMountedLuaFileExportFailureMatrix(): Promise<void> {
  const scenarios = ['url-create-failure', 'anchor-click-failure', 'anchor-append-failure', 'url-revoke-failure', 'handoff-selection-change'] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string }[] = [];
  for (const scenario of scenarios) {
    const mountedDocument = new MountedDomDocument();
    const restoreGlobals = installMountedDomGlobals(mountedDocument);
    const container = mountedDocument.createElement('div');
    mountedDocument.body.appendChild(container);
    const originalCreateElement = mountedDocument.createElement;
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const original = sourceEditIntegrationWorkspace;
    const originalBytes = JSON.stringify(original);
    const source = integrationProjection.source;
    const candidate = {
      raw: {}, index: 0, path: 'ui/edit.lua', key: `export-failure-source-${scenario}`,
      sourceIdentity: { file: 'ui/edit.lua', sha256: `export-failure-${scenario}` },
      targets: [{ raw: { name: 'menu.edit' }, key: `export-failure-target-${scenario}`, label: 'menu.edit' }],
    } as unknown as React.ComponentProps<typeof X4UiSourceEditorLuaFiles>['candidates'][number];
    let root: ReturnType<typeof createRoot> | undefined;
    let currentProps: React.ComponentProps<typeof X4UiSourceEditorLuaFiles>;
    let parentCalls = 0;
    let createCalls = 0;
    let revokeCalls = 0;
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    };
    const control = (testId: string): MountedDomElement => {
      const element = mountedElementByTestId(container, testId);
      assert.ok(element, `${scenario}: missing ${testId}`);
      return element;
    };
    const handler: X4UiWorkspaceEditHandler = () => {
      parentCalls += 1;
      return { status: 'refused', reason: 'unexpected', detail: 'export must not submit' };
    };
    currentProps = {
      workspace: original,
      scope: `b119-lua-export-failure-${scenario}`,
      source,
      selectedSourcePath: 'ui/edit.lua',
      candidates: [candidate],
      sourceSelector: candidate.key,
      targetSelector: candidate.targets[0].key,
      onWorkspaceEdit: handler,
      sourceEditStaged: false,
      sourceEditPending: false,
      onSelect: () => undefined,
    };
    const render = (next: Partial<React.ComponentProps<typeof X4UiSourceEditorLuaFiles>> = {}): void => {
      currentProps = { ...currentProps, ...next };
      root?.render(<X4UiSourceEditorLuaFiles {...currentProps} />);
    };
    try {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: (_blob: Blob): string => {
          createCalls += 1;
          if (scenario === 'url-create-failure') throw new Error('fixture URL creation failure');
          if (scenario === 'handoff-selection-change') flushSync(() => render({ sourceSelector: 'deliberate-export-selection' }));
          return `blob:b119-export-failure-${scenario}`;
        },
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: (_url: string): void => {
          revokeCalls += 1;
          if (scenario === 'url-revoke-failure') throw new Error('fixture URL revoke failure');
        },
      });
      mountedDocument.createElement = (tagName: string): MountedDomElement => {
        const element = originalCreateElement.call(mountedDocument, tagName);
        if (tagName.toLowerCase() === 'a' && scenario === 'anchor-click-failure') {
          (element as unknown as { click: () => void }).click = () => { throw new Error('fixture anchor click failure'); };
        }
        return element;
      };
      if (scenario === 'anchor-append-failure') {
        const originalAppendChild = mountedDocument.body.appendChild.bind(mountedDocument.body);
        mountedDocument.body.appendChild = <T extends MountedDomNode>(child: T): T => {
          if (child instanceof MountedDomElement && child.localName === 'a') throw new Error('fixture anchor append failure');
          return originalAppendChild(child);
        };
      }
      await flush(() => {
        root = createRoot(container as unknown as Element);
        render();
      });
      await flush(() => mountedReactClickCallback(control('x4-ui-lua-export'), `${scenario}: retained export callback`)());
      assert.equal(parentCalls, 0, `${scenario}: export failure must not reach the workspace owner/history seam`);
      assert.equal(JSON.stringify(original), originalBytes, `${scenario}: export failure must preserve the complete workspace`);
      assert.equal(mountedDocument.body.getElementsByTagName('a').length, 0, `${scenario}: failed export must not leak a temporary anchor`);
      assert.doesNotMatch(mountedElementText(container, 'x4-ui-lua-status'), /download requested|saved to disk|written to disk/i,
        `${scenario}: failure must not claim a disk save or successful download`);
      if (scenario === 'url-create-failure') {
        assert.equal(createCalls, 1);
        assert.equal(revokeCalls, 0);
      } else {
        assert.equal(createCalls, 1);
        assert.equal(revokeCalls, 1, `${scenario}: an object URL must be revoked exactly once after handoff failure`);
      }
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      if (root !== undefined) await flush(() => root?.unmount());
      mountedDocument.createElement = originalCreateElement;
      if (createDescriptor === undefined) Reflect.deleteProperty(URL, 'createObjectURL');
      else Object.defineProperty(URL, 'createObjectURL', createDescriptor);
      if (revokeDescriptor === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL');
      else Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor);
      restoreGlobals();
    }
  }

  const fatalWorkspace = sanitizeWorkspace({
    ...workspace,
    id: 'b119-lua-fatal24-export',
    compileSettings: { ui: true },
    passthroughFiles: [
      {
        path: 'ui.xml',
        content: '<addon name="fatal24"><environment type="menus"><file name="ui/fatal24.lua" /></environment></addon>',
        reason: 'partial',
      },
      {
        path: 'ui/fatal24.lua',
        content: [
          'local menu = { name = "fatal24", layer = 1 }',
          'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
          'local table = frame:addTable(24, { width = 80 })',
          'frame:display()',
          '',
        ].join('\n'),
        reason: 'partial',
      },
    ],
  });
  const fatalProjection = projectX4UiEditorSession({ workspace: fatalWorkspace, corpus: undefined, profile: { width: 100, height: 80, uiScale: 1 } });
  const fatalCandidate = fatalProjection.preview.sourceCandidates.find(candidate => candidate.path === 'ui/fatal24.lua');
  assert.ok(fatalCandidate, 'fatal24 fixture must issue the selected source candidate');
  const fatalMountedCandidate = {
    raw: {},
    index: fatalCandidate.index,
    path: fatalCandidate.path,
    key: 'fatal24-source',
    sourceIdentity: fatalCandidate.sourceIdentity,
    targets: fatalCandidate.targets.map((target, index) => ({
      raw: target as unknown as Record<string, unknown>,
      key: `fatal24-target-${index}`,
      label: target.name ?? target.handler ?? target.kind,
    })),
  } as unknown as React.ComponentProps<typeof X4UiSourceEditorLuaFiles>['candidates'][number];
  const fatalDocument = new MountedDomDocument();
  const restoreFatalGlobals = installMountedDomGlobals(fatalDocument);
  const fatalContainer = fatalDocument.createElement('div');
  fatalDocument.body.appendChild(fatalContainer);
  const fatalCreateDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  let fatalCreateCalls = 0;
  let fatalParentCalls = 0;
  let fatalRoot: ReturnType<typeof createRoot> | undefined;
  const fatalFlush = async (operation: () => void): Promise<void> => {
    await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  };
  try {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: (): string => { fatalCreateCalls += 1; return 'blob:b119-fatal24'; } });
    await fatalFlush(() => {
      fatalRoot = createRoot(fatalContainer as unknown as Element);
      fatalRoot.render(<X4UiSourceEditorLuaFiles
        workspace={fatalWorkspace}
        scope="b119-lua-fatal24"
        source={fatalProjection.source}
        selectedSourcePath="ui/fatal24.lua"
        candidates={[fatalMountedCandidate]}
        sourceSelector={fatalMountedCandidate.key}
        targetSelector={fatalMountedCandidate.targets[0]?.key ?? ''}
        onWorkspaceEdit={() => { fatalParentCalls += 1; return { status: 'refused', reason: 'unexpected', detail: 'fatal24 export must not submit' }; }}
        sourceEditStaged={false}
        sourceEditPending={false}
        onSelect={() => undefined}
      />);
    });
    const fatalExport = mountedElementByTestId(fatalContainer, 'x4-ui-lua-export');
    assert.ok(fatalExport, 'fatal24 fixture must mount the Export Lua control');
    const fatalBefore = JSON.stringify(fatalWorkspace);
    await fatalFlush(() => mountedReactClickCallback(fatalExport, 'fatal24 retained export callback')());
    assert.match(mountedElementText(fatalContainer, 'x4-ui-lua-status'), /error-level|diagnostic|block|fix/i, 'fatal24 must visibly block export with recovery copy');
    assert.match(mountedElementText(fatalContainer, 'x4-ui-lua-technical'), /lint-errors|addTable|24/i, 'fatal24 source-owner lint refusal must remain inspectable');
    assert.equal(fatalCreateCalls, 0, 'fatal24 lint refusal must not create a download URL');
    assert.equal(fatalParentCalls, 0, 'fatal24 lint refusal must not create history or parent writes');
    assert.equal(JSON.stringify(fatalWorkspace), fatalBefore, 'fatal24 lint refusal must preserve exact workspace bytes');
  } finally {
    if (fatalRoot !== undefined) await fatalFlush(() => fatalRoot?.unmount());
    if (fatalCreateDescriptor === undefined) Reflect.deleteProperty(URL, 'createObjectURL');
    else Object.defineProperty(URL, 'createObjectURL', fatalCreateDescriptor);
    restoreFatalGlobals();
  }
  console.log(`B119_LUA_FILE_EXPORT_FAILURE_MATRIX ${JSON.stringify({ total: scenarios.length + 1, passed: scenarios.length + 1 - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'Lua export must clean up failed URL/anchor handoffs and block known fatal lint errors without history writes');
}

async function runMountedNewMenuCreationRegression(fixture: P7SourceAuthorityFixture): Promise<void> {
  const scenarios = [
    'ack-before-readback', 'readback-before-ack', 'sync-readback', 'cancel', 'invalid-name',
    'parent-refused', 'callback-throws', 'double-submit', 'workspace-switch', 'replacement-clone',
    'backward-transition', 'unmount', 'late-superseded', 'forged-ack', 'rejected-promise', 'duplicate-name',
    'callback-switch-throws', 'callback-unmount', 'ack-refused', 'second-menu', 'add-row', 'row-rearrangement', 'row-move-refused', 'row-move-superseded', 'history-roundtrip',
  ] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string }[] = [];
  for (const scenario of scenarios) {
    const mountedDocument = new MountedDomDocument();
    const restoreGlobals = installMountedDomGlobals(mountedDocument);
    const container = mountedDocument.createElement('div');
    mountedDocument.body.appendChild(container);
    const unrelated = { path: 'content.xml', content: '<content id="kept_asset" />\r\n', reason: 'unknown_domain' };
    const original = sanitizeWorkspace({ ...workspace, id: `new-menu-${scenario}`, passthroughFiles: [unrelated], compileSettings: { ui: false } });
    const originalBytes = JSON.stringify(original);
    const switched = { ...original, id: `other-${scenario}` };
    const historyScope = `new-menu-history-scope-${scenario}`;
    let currentWorkspace: unknown = original;
    let replaceWorkspace: React.Dispatch<React.SetStateAction<unknown>> = () => { throw new Error('creation parent is not mounted'); };
    let publishHistoryRestoration: React.Dispatch<React.SetStateAction<X4UiHistoryRestorationNotice | null>> = () => { throw new Error('history restoration parent is not mounted'); };
    const authorities: X4UiWorkspaceEditPendingAuthority[] = [];
    let latestProjection: X4UiEditorSessionProjection | undefined;
    let submissions = 0;
    let root: ReturnType<typeof createRoot> | undefined;
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); });
    };
    const control = (id: string): MountedDomElement => {
      const element = mountedElementByTestId(container, id);
      assert.ok(element, `${scenario}: missing ${id}`);
      return element;
    };
    const submit = (): void => {
      control('x4-ui-new-menu-form').dispatchEvent(new MountedDomEvent('submit', { bubbles: true, cancelable: true }));
    };
    const handler: X4UiWorkspaceEditHandler = request => {
      submissions += 1;
      assert.equal(request.expectedWorkspace, currentWorkspace, `${scenario}: exact live expected workspace`);
      if (scenario === 'parent-refused') return { status: 'refused', reason: 'stale-parent-workspace', detail: 'fixture refusal' };
      if (scenario === 'callback-throws') throw new Error('fixture synchronous callback exception');
      const authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
      authorities.push(authority);
      if (scenario === 'callback-switch-throws') {
        flushSync(() => replaceWorkspace(switched));
        throw new Error('fixture callback switched workspace before throwing');
      }
      if (scenario === 'callback-unmount') {
        flushSync(() => { root?.unmount(); root = undefined; });
        authority.acknowledge(request.workspace);
      }
      if (scenario === 'sync-readback') {
        flushSync(() => replaceWorkspace(request.workspace));
        authority.acknowledge(request.workspace);
      }
      if (scenario === 'double-submit') submit();
      if (scenario === 'rejected-promise') {
        return { ...authority.submission, acknowledgement: Promise.reject(new Error('fixture rejection')) };
      }
      if (scenario === 'forged-ack') {
        const acknowledgement = authority.acknowledge(request.workspace);
        return { ...authority.submission, acknowledgement: Promise.resolve({ ...acknowledgement }) };
      }
      return authority.submission;
    };
    const canonicalLoader = async () => ({ core: fixture.core, color: fixture.color });
    const mountedSurfaceFactory = (width: number, height: number) => new MountedCanvasElement(mountedDocument, width, height);
    const Parent = (): React.ReactElement => {
      const [liveWorkspace, setLiveWorkspace] = React.useState<unknown>(original);
      const [historyRestoration, setHistoryRestoration] = React.useState<X4UiHistoryRestorationNotice | null>(null);
      currentWorkspace = liveWorkspace;
      publishHistoryRestoration = setHistoryRestoration;
      replaceWorkspace = update => setLiveWorkspace(previous => {
        const candidate = typeof update === 'function' ? update(previous) : update;
        const normalized = sanitizeWorkspace(candidate);
        return retainWorkspaceCandidateIfNormalizedUnchanged(candidate, normalized);
      });
      return <X4UiSourceEditor
        workspace={liveWorkspace}
        corpusLoader={canonicalLoader}
        surfaceFactory={mountedSurfaceFactory}
        onWorkspaceEdit={handler}
        workspaceScope={historyScope}
        historyRestoration={historyRestoration}
        onSessionProjection={projection => { latestProjection = projection; }}
      />;
    };
    const enterName = async (name: string): Promise<void> => {
      await flush(() => control('x4-ui-new-menu-open').click());
      await flush(() => {
        const input = control('x4-ui-new-menu-name');
        input.focus();
        input.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
        input.value = name;
        input.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
        input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      });
    };
    const assertNoAcceptance = (): void => {
      assert.doesNotMatch(mountedElementText(container, 'x4-ui-new-menu-status'), /^Created /, `${scenario}: no false success`);
      for (const kind of ['source', 'target']) {
        assert.deepEqual(control(`x4-ui-${kind}-selector`).options.filter(option => option.selected && option.value !== ''), [],
          `${scenario}: no automatic ${kind} adoption`);
      }
    };
    const assertSelectedOption = (id: string, text: string): void => {
      // React sets option.selected; this lightweight DOM does not reflect that into select.value.
      // The current canvas and producer-derived hierarchy below independently prove adoption.
      const option = control(id).options.find(candidate => candidate.textContent === text);
      assert.ok(option, `${scenario}: ${text} must be in the current catalog`);
      assert.equal(option.selected, true, `${scenario}: ${text} must be selected`);
    };
    try {
      await flush(() => {
        root = createRoot(container as unknown as Element);
        root.render(<React.StrictMode><Parent /></React.StrictMode>);
      });
      assert.equal(control('x4-ui-source-selector').value, '');
      assert.equal(control('x4-ui-target-selector').value, '');
      const name = scenario === 'invalid-name' ? 'x'.repeat(81) : 'First visual menu';
      await enterName(name);
      if (scenario === 'cancel') {
        await flush(() => control('x4-ui-new-menu-cancel').click());
        assert.equal(mountedElementByTestId(container, 'x4-ui-new-menu-form'), null);
        assert.equal(submissions, 0);
        assert.equal(currentWorkspace, original);
        assertNoAcceptance();
        continue;
      }
      await flush(submit);
      if (scenario === 'callback-unmount') {
        assert.equal(submissions, 1);
        assert.equal(container.childNodes.length, 0);
        assert.equal(currentWorkspace, original);
        continue;
      }
      if (scenario === 'callback-switch-throws') {
        assert.equal(currentWorkspace, switched);
        assert.equal(mountedElementByTestId(container, 'x4-ui-new-menu-form'), null, 'old callback must not reopen a draft in another workspace');
        assertNoAcceptance();
        continue;
      }
      if (['invalid-name', 'parent-refused', 'callback-throws', 'forged-ack', 'rejected-promise'].includes(scenario)) {
        assert.equal(currentWorkspace, original);
        assert.equal(control('x4-ui-new-menu-name').value, name, `${scenario}: refused draft preserved`);
        assert.ok(mountedElementText(container, 'x4-ui-new-menu-status').length > 0);
        assert.equal(control('x4-ui-new-menu-create').disabled, false);
        assert.equal(submissions, scenario === 'invalid-name' ? 0 : 1);
        assertNoAcceptance();
        continue;
      }
      const authority = authorities[0];
      assert.ok(authority, `${scenario}: parent received creation`);
      const replacement = authority.submission.workspace;
      assert.equal(submissions, 1, `${scenario}: one submission including reentrant/double submit`);
      if (scenario === 'ack-refused') {
        await flush(() => { authority.acknowledge(original); });
        assertNoAcceptance();
        assert.equal(currentWorkspace, original);
        assert.equal(control('x4-ui-new-menu-name').value, name);
        assert.equal(control('x4-ui-new-menu-create').disabled, false);
        continue;
      }
      if (scenario !== 'sync-readback') {
        assertNoAcceptance();
        assert.equal(currentWorkspace, original);
        assert.equal(control('x4-ui-new-menu-create').disabled, true);
        assert.equal(control('x4-ui-new-menu-cancel').disabled, true);
        await flush(submit);
        assert.equal(submissions, 1, `${scenario}: pending submit cannot create another menu`);
      }
      if (scenario === 'unmount') {
        await flush(() => { root?.unmount(); root = undefined; });
        await flush(() => { authority.acknowledge(replacement); });
        assert.equal(container.childNodes.length, 0);
        assert.equal(currentWorkspace, original);
        continue;
      }
      if (['workspace-switch', 'replacement-clone', 'backward-transition', 'late-superseded'].includes(scenario)) {
        if (scenario === 'backward-transition') {
          await flush(() => replaceWorkspace(replacement));
          await flush(() => replaceWorkspace(original));
        } else {
          await flush(() => replaceWorkspace(scenario === 'replacement-clone' ? { ...replacement as object } : switched));
        }
        if (scenario === 'late-superseded') {
          await enterName('Second attempt');
          await flush(submit);
          assert.equal(submissions, 2);
        }
        await flush(() => { authority.acknowledge(replacement); });
        assertNoAcceptance();
        if (scenario === 'late-superseded') {
          assert.equal(control('x4-ui-new-menu-name').value, 'Second attempt');
          assert.equal(control('x4-ui-new-menu-create').disabled, true);
          const currentAuthority = authorities[1];
          assert.ok(currentAuthority);
          await flush(() => replaceWorkspace(currentAuthority.submission.workspace));
          await flush(() => { currentAuthority.acknowledge(currentAuthority.submission.workspace); });
          assert.match(mountedElementText(container, 'x4-ui-new-menu-status'), /^Created Second attempt/);
        }
        continue;
      }
      if (scenario === 'ack-before-readback') {
        await flush(() => { authority.acknowledge(replacement); });
        assertNoAcceptance();
        assert.equal(control('x4-ui-new-menu-create').disabled, true);
        await flush(() => replaceWorkspace(replacement));
      } else if (scenario !== 'sync-readback') {
        await flush(() => replaceWorkspace(replacement));
        assertNoAcceptance();
        assert.equal(control('x4-ui-new-menu-create').disabled, true, 'exact identity readback alone is not an acknowledgement');
        await flush(() => { authority.acknowledge(replacement); });
      }
      assert.match(mountedElementText(container, 'x4-ui-new-menu-status'), /^Created First visual menu/);
      assert.equal(currentWorkspace, replacement);
      const current = replacement as typeof original;
      assert.deepEqual(current.passthroughFiles.find(file => file.path === 'content.xml'), unrelated);
      const newFile = current.passthroughFiles.find(file => file.path.endsWith('.lua'));
      assert.ok(newFile);
      assert.ok(current.passthroughFiles.some(file => file.path === 'ui.xml'));
      assertSelectedOption('x4-ui-source-selector', newFile.path);
      assertSelectedOption('x4-ui-target-selector', 'menu.createFrame');
      if (scenario === 'history-roundtrip') {
        const acknowledgement = authority.acknowledge(replacement);
        const preparedHistory = prepareX4UiSourceHistoryEntry(
          {
            scope: historyScope,
            expectedWorkspace: original,
            workspace: replacement,
            acknowledgement,
          },
          historyScope,
          replacement as typeof original,
          new WeakSet<object>(),
        );
        assert.equal(preparedHistory.status, 'recorded', 'the actual New-menu creation ACK must enter guarded source history');
        if (preparedHistory.status !== 'recorded') throw new Error('history-roundtrip creation was not recorded');
        const historyPast: WorkspaceHistoryEntry[] = [preparedHistory.entry];
        const historyFuture: WorkspaceHistoryEntry[] = [];
        const undo = transitionWorkspaceHistory(
          'undo',
          historyPast,
          historyFuture,
          replacement as typeof original,
          historyScope,
        );
        assert.equal(undo.status, 'applied', 'the actual created source must accept guarded Undo');
        if (undo.status !== 'applied') throw new Error('history-roundtrip creation Undo was refused');
        await flush(() => replaceWorkspace(undo.workspace));
        assert.equal(currentWorkspace, undo.workspace, 'creation Undo must read back the exact proposed workspace object');
        assert.equal((undo.workspace as typeof original).passthroughFiles.length, original.passthroughFiles.length);
        assert.equal((undo.workspace as typeof original).passthroughFiles.some(file => file.path === newFile.path), false);
        assert.equal((undo.workspace as typeof original).passthroughFiles.some(file => file.path === 'ui.xml'), false);
        assert.equal((undo.workspace as typeof original).passthroughFiles.find(file => file.path === 'content.xml')?.content, unrelated.content);
        await flush(() => publishHistoryRestoration({
          direction: 'undo',
          scope: historyScope,
          beforeWorkspace: replacement,
          afterWorkspace: undo.workspace,
        }));
        assert.deepEqual(control('x4-ui-source-selector').options.filter(option => option.selected && option.value !== ''), [],
          'creation Undo must remove the source selection when its file is absent');
        assert.deepEqual(control('x4-ui-target-selector').options.filter(option => option.selected && option.value !== ''), [],
          'creation Undo must remove the target selection when its source is absent');

        const redo = transitionWorkspaceHistory(
          'redo',
          undo.past,
          undo.future,
          undo.workspace as typeof original,
          historyScope,
        );
        assert.equal(redo.status, 'applied', 'the actual created source must accept guarded Redo');
        if (redo.status !== 'applied') throw new Error('history-roundtrip creation Redo was refused');
        await flush(() => replaceWorkspace(redo.workspace));
        assert.equal(currentWorkspace, redo.workspace, 'creation Redo must read back the exact proposed workspace object');
        const redone = redo.workspace as typeof original;
        assert.equal(redone.passthroughFiles.length, current.passthroughFiles.length, 'Redo must restore the created file count');
        assert.equal(redone.passthroughFiles.find(file => file.path === newFile.path)?.content, newFile.content,
          'Redo must restore the complete generated Lua bytes');
        assert.equal(redone.passthroughFiles.find(file => file.path === 'ui.xml')?.content,
          current.passthroughFiles.find(file => file.path === 'ui.xml')?.content,
          'Redo must restore the complete registration bytes');
        assert.equal(redone.passthroughFiles.find(file => file.path === 'content.xml')?.content, unrelated.content,
          'Redo must preserve the unrelated sibling bytes');
        await flush(() => publishHistoryRestoration({
          direction: 'redo',
          scope: historyScope,
          beforeWorkspace: undo.workspace,
          afterWorkspace: redo.workspace,
        }));
        assertSelectedOption('x4-ui-source-selector', newFile.path);
        assertSelectedOption('x4-ui-target-selector', 'menu.createFrame');
        assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current',
          'creation Redo must refresh the mounted current canvas');
        assert.ok(control('x4-ui-canvas-host').firstElementChild instanceof MountedCanvasElement,
          'creation Redo must mount fresh canvas output');
        continue;
      }
      let sceneStructureFailure: string | undefined;
      if (mountedElementText(container, 'x4-ui-canvas-status') !== 'rendered/current') {
        const input = { workspace: current, corpus: fixture.core, colorEvidence: fixture.color, profile: { width: 2560, height: 1440, uiScale: 1.4 } };
        const available = projectX4UiEditorSession(input);
        const source = available.preview.sourceCandidates.find(candidate => candidate.path === newFile.path);
        const target = source?.targets.find(candidate => candidate.name === 'menu.createFrame');
        if (source !== undefined && target !== undefined) {
          const selected = projectX4UiEditorSession({ ...input, selection: { sourceIndex: source.index, path: source.path, sourceIdentity: source.sourceIdentity, target } });
          const program = selected.preview.program;
          if (program !== undefined && program.status !== 'refused') {
            sceneStructureFailure = diagnoseX4UiSceneStructureForTest(program.program, program.evidenceAuthority);
          }
        }
      }
      assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current',
        `${scenario}: ${mountedElementText(container, 'x4-ui-canvas-detail')}; structure stage: ${sceneStructureFailure ?? 'not refused'}`);
      assert.ok(control('x4-ui-canvas-host').firstElementChild instanceof MountedCanvasElement);
      const hierarchy = control('x4-ui-builder-hierarchy-list');
      const textNode = hierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Text · First visual menu'));
      assert.ok(textNode, `${scenario}: creation projects known visible text`);
      await flush(() => textNode.click());
      const selected = control('x4-ui-builder-selection');
      const textInput = selected.querySelectorAll('input').find(input => input.value === name);
      assert.ok(textInput, `${scenario}: new title is an editable literal`);
      assert.equal(mountedElementText(container, 'x4-ui-game-truth'), 'Not verified in game');
      if (['row-rearrangement', 'row-move-refused', 'row-move-superseded'].includes(scenario)) {
        const rowControl = (id: string): MountedDomElement => control(id);
        const selectNodeByPrefix = async (labelPrefix: string): Promise<MountedDomElement> => {
          const node = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
            .find(element => element.textContent.startsWith(labelPrefix));
          assert.ok(node, `${scenario}: hierarchy node ${labelPrefix} was not issued`);
          await flush(() => node.click());
          return node;
        };
        const selectNodeContaining = async (labelPart: string): Promise<MountedDomElement> => {
          const node = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
            .find(element => element.textContent.includes(labelPart));
          assert.ok(node, `${scenario}: hierarchy node containing ${labelPart} was not issued`);
          await flush(() => node.click());
          return node;
        };
        const setPaletteText = async (textValue: string): Promise<void> => {
          await flush(() => {
            const input = rowControl('x4-ui-contextual-palette-text');
            input.focus();
            input.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
            input.value = textValue;
            input.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
            input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
          });
        };
        const settleLast = async (): Promise<typeof original> => {
          const authority = authorities[authorities.length - 1];
          assert.ok(authority, `${scenario}: the last source action must retain a parent acknowledgement owner`);
          const replacement = authority.submission.workspace as typeof original;
          await flush(() => replaceWorkspace(replacement));
          await flush(() => { authority.acknowledge(replacement); });
          assert.equal(currentWorkspace, replacement, `${scenario}: accepted source action must read back the exact replacement workspace`);
          return replacement;
        };
        const addRowAndWidget = async (widget: 'text' | 'button' | 'input', textValue: string): Promise<void> => {
          const addRow = rowControl('x4-ui-contextual-palette-add-row');
          assert.equal(addRow.disabled, false, `${scenario}: a selected row descendant must expose Add row`);
          await flush(() => addRow.click());
          assert.equal(addRow.disabled, true, `${scenario}: pending Add row must disable the old callback`);
          await settleLast();
          const selectedFreshCell = rowControl('x4-ui-builder-hierarchy-list').querySelectorAll('button')
            .find(element => element.getAttribute('aria-pressed') === 'true');
          assert.ok(selectedFreshCell, `${scenario}: Add row must select a fresh cell before widget insertion`);
          assert.match(selectedFreshCell.textContent, /^Cell 1/);
          await setPaletteText(textValue);
          const addWidget = rowControl(`x4-ui-contextual-palette-add-${widget}`);
          assert.equal(addWidget.disabled, false, `${scenario}: fresh empty cell must expose Add ${widget}`);
          await flush(() => addWidget.click());
          await settleLast();
          assert.ok(rowControl('x4-ui-builder-hierarchy-list').querySelectorAll('button')
            .some(element => element.textContent.includes(textValue)), `${scenario}: ${widget} producer must project ${textValue}`);
        };

        await selectNodeByPrefix('Text · First visual menu');
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, true, `${scenario}: first row Move up must be disabled`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, true, `${scenario}: one-row menu Move down has no adjacent row yet`);
        await addRowAndWidget('text', 'Second row Text');
        await selectNodeByPrefix('Text · Second row Text');
        await addRowAndWidget('button', 'Third row Button');
        await selectNodeContaining('Third row Button');
        await flush(() => rowControl('x4-ui-contextual-palette-add-row').click());
        await settleLast();
        const emptyFourthCell = rowControl('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .find(element => element.getAttribute('aria-pressed') === 'true');
        assert.ok(emptyFourthCell, `${scenario}: fourth Add row must select an empty fresh cell`);
        assert.match(emptyFourthCell.textContent, /^Cell 1/);
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, false, `${scenario}: empty last row may move up`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, true, `${scenario}: empty last row Move down must be disabled`);
        await setPaletteText('Fourth row Input');
        await flush(() => rowControl('x4-ui-contextual-palette-add-input').click());
        await settleLast();

        await selectNodeByPrefix('Row 1');
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, true, `${scenario}: first row Move up must stay disabled`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, false, `${scenario}: first row Move down must be enabled`);
        await selectNodeByPrefix('Row 4');
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, false, `${scenario}: last row Move up must be enabled`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, true, `${scenario}: last row Move down must stay disabled`);
        const middleDescendant = await selectNodeByPrefix('Text · Second row Text');
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, false, `${scenario}: middle row Move up must be enabled`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, false, `${scenario}: middle row Move down must be enabled`);
        const staleMoveDownCallback = mountedReactClickCallback(
          rowControl('x4-ui-row-controls-move-down'),
          `${scenario}: middle-row Move down callback must be retained by the mounted control`,
        );
        const beforeStaleMoveWorkspace = currentWorkspace;
        const submissionsBeforeStaleMove = submissions;
        await selectNodeByPrefix('Row 1');
        await flush(staleMoveDownCallback);
        assert.equal(submissions, submissionsBeforeStaleMove, `${scenario}: stale Move down callback must not submit after selection changed`);
        assert.equal(currentWorkspace, beforeStaleMoveWorkspace, `${scenario}: stale Move down callback must not replace the live workspace`);
        await selectNodeByPrefix('Text · Second row Text');
        const draftInput = control('x4-ui-builder-selection').querySelectorAll('input')
          .find(input => input.value === 'Second row Text');
        assert.ok(draftInput, `${scenario}: middle row must expose a property input for draft blocking`);
        await flush(() => {
          draftInput.focus();
          draftInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          draftInput.value = 'Draft row text';
          draftInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          draftInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, true, `${scenario}: staged property changes must disable Move up`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, true, `${scenario}: staged property changes must disable Move down`);
        assert.match(rowControl('x4-ui-row-controls-status').textContent, /Apply or discard/);
        const draftMoveDownCallback = mountedReactClickCallback(
          rowControl('x4-ui-row-controls-move-down'),
          `${scenario}: disabled Move down must still guard its direct callback`,
        );
        const submissionsBeforeDraftMove = submissions;
        await flush(draftMoveDownCallback);
        assert.equal(submissions, submissionsBeforeDraftMove, `${scenario}: a direct Move down callback must refuse while a property draft is staged`);
        await flush(() => control('x4-ui-builder-source-edit-discard').click());
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, false, `${scenario}: discarding the property draft must restore Move up`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, false, `${scenario}: discarding the property draft must restore Move down`);
        const oldMiddleNodeId = middleDescendant.getAttribute('data-testid');
        assert.ok(oldMiddleNodeId, `${scenario}: middle descendant must expose an exact builder identity`);
        const moveProjection = latestProjection;
        assert.ok(moveProjection, `${scenario}: mounted projection observer must expose the exact current producer projection`);
        const movePresentation = buildX4UiBuilderPresentation(moveProjection);
        const moveSelectedNode = movePresentation.nodes.find(node => node.id === oldMiddleNodeId.replace('x4-ui-builder-node-', ''));
        assert.ok(moveSelectedNode, `${scenario}: current selected descendant must map to the exact presentation node`);
        const moveRow = resolveX4UiBuilderRowForNode(movePresentation.nodes, moveSelectedNode);
        assert.ok(moveRow, `${scenario}: current selected descendant must map to its exact row owner`);
        const moveCatalog = discoverX4UiSourceEditorCatalog(currentWorkspace, moveProjection);
        assert.ok(moveCatalog, `${scenario}: actual Newmenu/Addrow/Text/Button/Input producer must issue a source catalog`);
        const moveEntry = moveCatalog.moveEntries?.find(entry => entry.direction === 'down' && entry.rowId === moveRow.id.slice('scene:'.length));
        assert.ok(moveEntry, `${scenario}: actual producer must issue the middle-row Move down entry`);
        const beforeMoveSource = (currentWorkspace as typeof original).passthroughFiles.find(file => file.path === newFile.path)?.content;
        assert.ok(beforeMoveSource, `${scenario}: source bytes must be present before movement`);
        const expectedDownSource = beforeMoveSource.slice(0, moveEntry.startOffset)
          + moveEntry.lower.expectedText + moveEntry.upper.expectedText
          + beforeMoveSource.slice(moveEntry.endOffset);
        const moveDownCallback = mountedReactClickCallback(
          rowControl('x4-ui-row-controls-move-down'),
          `${scenario}: enabled Move down must retain the actual mounted callback`,
        );
        const beforeMoveWorkspace = currentWorkspace;
        await flush(moveDownCallback);
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, true, `${scenario}: a pending move must disable Move up`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, true, `${scenario}: a pending move must disable Move down`);
        assert.equal(rowControl('x4-ui-row-controls-status').textContent, 'Saving your change…', `${scenario}: a pending move must expose the concise pending reason`);
        const moveAuthority = authorities[authorities.length - 1];
        assert.ok(moveAuthority, `${scenario}: Move down must reach the existing parent acknowledgement owner`);
        const movedWorkspace = moveAuthority.submission.workspace as typeof original;
        const movedSource = movedWorkspace.passthroughFiles.find(file => file.path === newFile.path)?.content;
        assert.equal(movedSource, expectedDownSource, `${scenario}: Move down must produce the exact owner-issued source permutation`);
        if (scenario === 'row-move-refused') {
          await flush(() => { moveAuthority.acknowledge(beforeMoveWorkspace); });
          assert.equal(currentWorkspace, beforeMoveWorkspace, `${scenario}: a refused movement acknowledgement must preserve the current source workspace`);
          assert.equal(rowControl('x4-ui-row-controls-status').textContent, 'That row change could not be saved. Open Inspect for details.', `${scenario}: refused movement must expose the concise refusal status`);
          const refusedSource = (currentWorkspace as typeof original).passthroughFiles.find(file => file.path === newFile.path)?.content;
          assert.ok(refusedSource);
          assert.ok(refusedSource.indexOf('Second row Text') < refusedSource.indexOf('Third row Button'), `${scenario}: refused movement must not permute source rows`);
          assert.ok(control('x4-ui-builder-selection').textContent.includes('Second row Text'), `${scenario}: refused movement must not lose the selected row context`);
          continue;
        }
        if (scenario === 'row-move-superseded') {
          const submissionsBeforeSupersededCallback = submissions;
          await flush(() => replaceWorkspace(switched));
          assert.equal(currentWorkspace, switched, `${scenario}: intervening source/workspace change must become current before the old acknowledgement`);
          assert.deepEqual(control('x4-ui-source-selector').options.filter(option => option.selected && option.value !== ''), [], `${scenario}: intervening source change must clear the source selection`);
          assert.deepEqual(control('x4-ui-target-selector').options.filter(option => option.selected && option.value !== ''), [], `${scenario}: intervening source change must clear the target selection`);
          await flush(() => { moveAuthority.acknowledge(movedWorkspace); });
          assert.equal(currentWorkspace, switched, `${scenario}: superseded movement acknowledgement must not replace the intervening workspace`);
          assert.deepEqual(control('x4-ui-source-selector').options.filter(option => option.selected && option.value !== ''), [], `${scenario}: superseded movement acknowledgement must not restore source selection`);
          assert.deepEqual(control('x4-ui-target-selector').options.filter(option => option.selected && option.value !== ''), [], `${scenario}: superseded movement acknowledgement must not restore target selection`);
          await flush(moveDownCallback);
          assert.equal(submissions, submissionsBeforeSupersededCallback, `${scenario}: stale movement callback must remain inert after the source/workspace change`);
          continue;
        }
        await flush(() => replaceWorkspace(movedWorkspace));
        assert.equal(rowControl('x4-ui-row-controls-move-up').disabled, true, `${scenario}: readback before ACK must not re-enable Move up`);
        assert.equal(rowControl('x4-ui-row-controls-move-down').disabled, true, `${scenario}: readback before ACK must not re-enable Move down`);
        await flush(() => { moveAuthority.acknowledge(movedWorkspace); });
        const freshMovedSelection = rowControl('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .find(element => element.getAttribute('aria-pressed') === 'true');
        assert.ok(freshMovedSelection, `${scenario}: accepted Move down must retain a fresh selected node`);
        assert.match(freshMovedSelection.textContent, /^Row 3/);
        assert.notEqual(freshMovedSelection.getAttribute('data-testid'), oldMiddleNodeId, `${scenario}: accepted Move down must not retain the old descendant identity`);
        assert.ok(rowControl('x4-ui-builder-hierarchy-list').querySelectorAll('button').some(element => element.textContent.startsWith('Row 3')),
          `${scenario}: moved middle row must reproject at its new row position`);

        const inverseProjection = latestProjection;
        assert.ok(inverseProjection, `${scenario}: inverse movement must observe the fresh projection`);
        const inversePresentation = buildX4UiBuilderPresentation(inverseProjection);
        const inverseSelectedId = freshMovedSelection.getAttribute('data-testid')?.replace('x4-ui-builder-node-', '');
        assert.ok(inverseSelectedId);
        const inverseSelectedNode = inversePresentation.nodes.find(node => node.id === inverseSelectedId);
        assert.ok(inverseSelectedNode);
        const inverseRow = resolveX4UiBuilderRowForNode(inversePresentation.nodes, inverseSelectedNode);
        assert.ok(inverseRow);
        const inverseCatalog = discoverX4UiSourceEditorCatalog(currentWorkspace, inverseProjection);
        assert.ok(inverseCatalog);
        const inverseEntry = inverseCatalog.moveEntries?.find(entry => entry.direction === 'up' && entry.rowId === inverseRow.id.slice('scene:'.length));
        assert.ok(inverseEntry, `${scenario}: accepted fresh moved row must issue its exact inverse Move up entry`);
        const beforeInverseSource = (currentWorkspace as typeof original).passthroughFiles.find(file => file.path === newFile.path)?.content;
        assert.ok(beforeInverseSource);
        const expectedInverseSource = beforeInverseSource.slice(0, inverseEntry.startOffset)
          + inverseEntry.lower.expectedText + inverseEntry.upper.expectedText
          + beforeInverseSource.slice(inverseEntry.endOffset);
        await flush(() => rowControl('x4-ui-row-controls-move-up').click());
        const inverseAuthority = authorities[authorities.length - 1];
        assert.ok(inverseAuthority);
        const inverseWorkspace = inverseAuthority.submission.workspace as typeof original;
        assert.equal(inverseWorkspace.passthroughFiles.find(file => file.path === newFile.path)?.content,
          expectedInverseSource, `${scenario}: inverse Move up must produce the exact inverse source permutation`);
        await flush(() => replaceWorkspace(inverseWorkspace));
        await flush(() => { inverseAuthority.acknowledge(inverseWorkspace); });
        const freshInverseSelection = rowControl('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .find(element => element.getAttribute('aria-pressed') === 'true');
        assert.ok(freshInverseSelection);
        assert.match(freshInverseSelection.textContent, /^Row 2/);
        assert.notEqual(freshInverseSelection.getAttribute('data-testid'), freshMovedSelection.getAttribute('data-testid'), `${scenario}: inverse must select the newly reprojected row descendant`);
        assert.equal((currentWorkspace as typeof original).passthroughFiles.find(file => file.path === newFile.path)?.content,
          beforeMoveSource, `${scenario}: inverse movement must restore the exact original source bytes`);

        await selectNodeContaining('Second row Text');
        const continuedEditInput = control('x4-ui-builder-selection').querySelectorAll('input').find(input => input.value === 'Second row Text');
        assert.ok(continuedEditInput, `${scenario}: fresh moved row must expose its ordinary editable widget property`);
        const continuedEditId = continuedEditInput.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
        assert.ok(continuedEditId);
        await flush(() => {
          continuedEditInput.focus();
          continuedEditInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          continuedEditInput.value = 'Second row Text edited';
          continuedEditInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          continuedEditInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        await flush(() => control(`x4-ui-source-edit-apply-${continuedEditId}`).click());
        const continuedEditAuthority = authorities[authorities.length - 1];
        assert.ok(continuedEditAuthority, `${scenario}: ordinary property edit after movement must use the existing source commit seam`);
        const continuedEditWorkspace = continuedEditAuthority.submission.workspace as typeof original;
        assert.match(continuedEditWorkspace.passthroughFiles.find(file => file.path === newFile.path)?.content ?? '', /Second row Text edited/);
        await flush(() => replaceWorkspace(continuedEditWorkspace));
        await flush(() => { continuedEditAuthority.acknowledge(continuedEditWorkspace); });
        assert.ok(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'Second row Text edited'),
          `${scenario}: continued property editing must retain the fresh selected widget after movement`);
        assert.equal(currentWorkspace, continuedEditWorkspace);
        continue;
      }
      if (['ack-before-readback', 'readback-before-ack', 'sync-readback'].includes(scenario)) {
        const oldCanvas = control('x4-ui-canvas-host').firstElementChild;
        const oldSourceKey = control('x4-ui-source-selector').options.find(option => option.textContent === newFile.path)?.value;
        const oldTargetKey = control('x4-ui-target-selector').options.find(option => option.textContent === 'menu.createFrame')?.value;
        const entryId = textInput.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
        assert.ok(entryId);
        const firstEditedTitle = 'Edited "visual" \\ title';
        await flush(() => {
          textInput.focus();
          textInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          textInput.value = firstEditedTitle;
          textInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          textInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        await flush(() => control(`x4-ui-source-edit-apply-${entryId}`).click());
        assert.equal(submissions, 2, `${scenario}: title edit reached the real parent commit seam`);
        const editAuthority = authorities[1];
        assert.ok(editAuthority);
        const edited = editAuthority.submission.workspace as typeof original;
        assert.equal(edited.passthroughFiles.find(file => file.path === newFile.path)?.content,
          newFile.content.replace(JSON.stringify(name), JSON.stringify(firstEditedTitle)), 'only the escaped title literal changes');
        assert.deepEqual(edited.passthroughFiles.filter(file => file.path !== newFile.path),
          current.passthroughFiles.filter(file => file.path !== newFile.path), 'registration and unrelated assets stay byte-identical');
        const normalizedEdit = sanitizeWorkspace(edited);
        assert.equal(retainWorkspaceCandidateIfNormalizedUnchanged(edited, normalizedEdit), edited,
          `source-edit readback must retain the actual owner result: frozen=${Object.isFrozen(edited)}, normalizedFrozen=${Object.isFrozen(normalizedEdit)}, sameJSON=${JSON.stringify(edited) === JSON.stringify(normalizedEdit)}`);
        if (scenario === 'ack-before-readback') {
          await flush(() => { editAuthority.acknowledge(edited); });
          assert.equal(currentWorkspace, replacement, 'ack alone cannot adopt replacement source identities');
          assert.equal(control('x4-ui-canvas-host').firstElementChild, oldCanvas);
          await flush(() => replaceWorkspace(edited));
        } else if (scenario === 'readback-before-ack') {
          await flush(() => replaceWorkspace(edited));
          assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'stale', 'readback alone cannot authorize fresh selection');
          assert.equal(control('x4-ui-canvas-export').disabled, true, 'old pixels stay unexportable');
          await flush(() => { editAuthority.acknowledge(edited); });
        }
        assert.equal(currentWorkspace, edited);
        assertSelectedOption('x4-ui-source-selector', newFile.path);
        assertSelectedOption('x4-ui-target-selector', 'menu.createFrame');
        assert.notEqual(control('x4-ui-source-selector').options.find(option => option.textContent === newFile.path)?.value, oldSourceKey);
        assert.notEqual(control('x4-ui-target-selector').options.find(option => option.textContent === 'menu.createFrame')?.value, oldTargetKey);
        assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current', 'acknowledged edit reprojects a fresh current canvas');
        assert.notEqual(control('x4-ui-canvas-host').firstElementChild, oldCanvas, 'old mounted paint is replaced');
        assert.ok(control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .some(element => element.textContent.startsWith(`Text · ${firstEditedTitle}`)), 'fresh hierarchy contains the changed literal');
        const retainedTitleInput = control('x4-ui-builder-selection').querySelectorAll('input').find(input => input.value === firstEditedTitle);
        assert.ok(retainedTitleInput, `${scenario}: accepted title edit retains the fresh selected element`);
        const secondEditedTitle = 'x';
        const secondEntryId = retainedTitleInput.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
        assert.ok(secondEntryId);
        await flush(() => {
          retainedTitleInput.focus();
          retainedTitleInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          retainedTitleInput.value = secondEditedTitle;
          retainedTitleInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          retainedTitleInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        await flush(() => control(`x4-ui-source-edit-apply-${secondEntryId}`).click());
        assert.equal(submissions, 3, `${scenario}: repeated title edit uses the retained selection without a canvas reselect`);
        const secondEditAuthority = authorities[2];
        assert.ok(secondEditAuthority);
        const secondEdited = secondEditAuthority.submission.workspace as typeof original;
        const firstEditedFile = edited.passthroughFiles.find(file => file.path === newFile.path);
        assert.ok(firstEditedFile);
        assert.equal(secondEdited.passthroughFiles.find(file => file.path === newFile.path)?.content,
          firstEditedFile.content.replace(JSON.stringify(firstEditedTitle), JSON.stringify(secondEditedTitle)));
        if (scenario === 'ack-before-readback') {
          await flush(() => { secondEditAuthority.acknowledge(secondEdited); });
          assert.equal(currentWorkspace, edited, `${scenario}: second ack alone cannot adopt a replacement`);
          await flush(() => replaceWorkspace(secondEdited));
        } else if (scenario === 'readback-before-ack') {
          await flush(() => replaceWorkspace(secondEdited));
          assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'stale', `${scenario}: second readback alone cannot authorize fresh selection`);
          await flush(() => { secondEditAuthority.acknowledge(secondEdited); });
        }
        assert.equal(currentWorkspace, secondEdited);
        assert.ok(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === secondEditedTitle), `${scenario}: second edit remains continuously selected`);
        assert.equal(mountedElementText(container, 'x4-ui-game-truth'), 'Not verified in game');
      }
      if (scenario === 'add-row') {
        const initialCellIds = hierarchy.querySelectorAll('button')
          .filter(element => element.textContent.startsWith('Cell '))
          .map(element => element.getAttribute('data-testid'));
        const firstRow = hierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Row 1'));
        assert.ok(firstRow, 'actual New-menu producer must expose its first row for Add row');
        await flush(() => firstRow.click());
        assert.match(mountedElementText(container, 'x4-ui-contextual-palette-status'), /Select an empty cell to add text, button, or input\. Add a row below this row\./,
          'a selected row with an eligible child must not claim that no cell is available');
        assert.doesNotMatch(mountedElementText(container, 'x4-ui-contextual-palette-status'), /No eligible cell is available/);
        const addRow = control('x4-ui-contextual-palette-add-row');
        assert.equal(addRow.disabled, false, 'an exact selected actual row must expose enabled Add row');
        await flush(() => addRow.click());
        assert.equal(submissions, 2, 'actual New-menu Add row must use the existing parent commit seam');
        const rowAuthority = authorities[1];
        assert.ok(rowAuthority, 'Add row must retain the existing acknowledgement owner');
        const rowReplacement = rowAuthority.submission.workspace as typeof original;
        const rowSourceBefore = newFile.content;
        const rowFileAfter = rowReplacement.passthroughFiles.find(file => file.path === newFile.path);
        assert.ok(rowFileAfter);
        assert.equal(rowFileAfter.content.split('addRow(false, {})').length, rowSourceBefore.split('addRow(false, {})').length + 1,
          'Add row must add exactly one canonical default-height row statement');
        assert.deepEqual(rowReplacement.passthroughFiles.filter(file => file.path !== newFile.path),
          current.passthroughFiles.filter(file => file.path !== newFile.path),
          'Add row must preserve ui.xml, unrelated assets, and sibling source files');
        assert.equal(addRow.disabled, true, 'a pending Add row transaction cannot be submitted twice');
        await flush(() => replaceWorkspace(rowReplacement));
        await flush(() => { rowAuthority.acknowledge(rowReplacement); });
        const freshRow = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .find(element => element.textContent.startsWith('Row 2'));
        assert.ok(freshRow, 'acknowledged Add row must expose the newly reparsed row');
        const selectedFreshCell = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .find(element => element.getAttribute('aria-pressed') === 'true');
        assert.ok(selectedFreshCell, 'acknowledged Add row must retain a fresh selected node');
        assert.match(selectedFreshCell.textContent, /^Cell 1/);
        assert.equal(initialCellIds.includes(selectedFreshCell.getAttribute('data-testid')), false,
          'acknowledged Add row must select a fresh owner-issued cell, not adopt a prior cell identity');
        const freshPaletteAddText = control('x4-ui-contextual-palette-add-text');
        assert.equal(freshPaletteAddText.disabled, false, 'the fresh Add row cell must expose the existing widget palette');
        await flush(() => {
          const freshPaletteText = control('x4-ui-contextual-palette-text');
          freshPaletteText.focus();
          freshPaletteText.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          freshPaletteText.value = 'New-row text';
          freshPaletteText.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          freshPaletteText.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        await flush(() => control('x4-ui-contextual-palette-add-text').click());
        assert.equal(submissions, 3, 'the acknowledged fresh Add row cell must submit through the existing widget palette');
        const widgetAuthority = authorities[2];
        assert.ok(widgetAuthority);
        const widgetReplacement = widgetAuthority.submission.workspace as typeof original;
        const widgetFileAfter = widgetReplacement.passthroughFiles.find(file => file.path === newFile.path);
        assert.ok(widgetFileAfter);
        assert.match(widgetFileAfter.content, /New-row text/);
        assert.equal(widgetReplacement.passthroughFiles.find(file => file.path === newFile.path)?.content.includes('New-row text'), true);
        await flush(() => replaceWorkspace(widgetReplacement));
        await flush(() => { widgetAuthority.acknowledge(widgetReplacement); });
        assert.ok(control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .some(element => element.textContent.startsWith('Text · New-row text')),
        'the existing palette must project the newly inserted widget after exact acknowledgement');
        const selectedWidget = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .find(element => element.getAttribute('aria-pressed') === 'true');
        assert.ok(selectedWidget);
        const addRowFromDescendant = control('x4-ui-contextual-palette-add-row');
        assert.equal(addRowFromDescendant.disabled, false, 'a proven widget descendant must expose Add row below its exact owner row');
        await flush(() => addRowFromDescendant.click());
        assert.equal(submissions, 4, 'repeated Add row from a fresh widget descendant must use one new parent transaction');
        const repeatedRowAuthority = authorities[3];
        assert.ok(repeatedRowAuthority);
        const repeatedRowReplacement = repeatedRowAuthority.submission.workspace as typeof original;
        const repeatedRowFile = repeatedRowReplacement.passthroughFiles.find(file => file.path === newFile.path);
        assert.ok(repeatedRowFile);
        assert.equal(repeatedRowFile.content.split('addRow(false, {})').length,
          widgetFileAfter.content.split('addRow(false, {})').length + 1,
          'repeated Add row must use the fresh catalog and add exactly one more row');
        assert.deepEqual(repeatedRowReplacement.passthroughFiles.filter(file => file.path !== newFile.path),
          widgetReplacement.passthroughFiles.filter(file => file.path !== newFile.path),
          'repeated Add row must preserve ui.xml and all non-target siblings');
        await flush(() => replaceWorkspace(repeatedRowReplacement));
        await flush(() => { repeatedRowAuthority.acknowledge(repeatedRowReplacement); });
        const repeatedFreshSelection = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .find(element => element.getAttribute('aria-pressed') === 'true');
        assert.ok(repeatedFreshSelection);
        assert.match(repeatedFreshSelection.textContent, /^Cell 1/);
        assert.notEqual(repeatedFreshSelection.getAttribute('data-testid'), selectedWidget.getAttribute('data-testid'),
          'repeated Add row must not retain the prior descendant as a provisional selection');
        assert.ok(control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .some(element => element.textContent.startsWith('Row 3')),
        'repeated Add row must expose the next fresh row');
        assert.equal(currentWorkspace, repeatedRowReplacement);
        continue;
      }
      if (scenario === 'second-menu') {
        const firstLua = newFile.content;
        await enterName('Another visual menu');
        await flush(submit);
        assert.equal(submissions, 2);
        const secondAuthority = authorities[1];
        assert.ok(secondAuthority);
        assert.equal(secondAuthority.submission.expectedWorkspace, replacement);
        await flush(() => replaceWorkspace(secondAuthority.submission.workspace));
        assert.equal(control('x4-ui-new-menu-create').disabled, true);
        await flush(() => { secondAuthority.acknowledge(secondAuthority.submission.workspace); });
        assert.match(mountedElementText(container, 'x4-ui-new-menu-status'), /^Created Another visual menu/);
        const secondWorkspace = secondAuthority.submission.workspace as typeof original;
        assert.equal(secondWorkspace.passthroughFiles.find(file => file.path === newFile.path)?.content, firstLua);
        const secondLua = secondWorkspace.passthroughFiles.find(file => file.path.endsWith('.lua') && file.path !== newFile.path);
        assert.ok(secondLua);
        assertSelectedOption('x4-ui-source-selector', secondLua.path);
        assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current');
        assert.ok(control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
          .some(element => element.textContent.startsWith('Text · Another visual menu')));
        const secondHierarchy = control('x4-ui-builder-hierarchy-list');
        const secondTitleNode = secondHierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Text · Another visual menu'));
        assert.ok(secondTitleNode, 'second actual New-menu fixture must expose its title widget');
        await flush(() => secondTitleNode.click());
        const secondTitleInput = control('x4-ui-builder-selection').querySelectorAll('input').find(input => input.value === 'Another visual menu');
        assert.ok(secondTitleInput, 'second actual New-menu title must expose its ordinary property input');
        const secondTitleEntryId = secondTitleInput.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
        assert.ok(secondTitleEntryId);
        await flush(() => {
          secondTitleInput.focus();
          secondTitleInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          secondTitleInput.value = 'Unapplied title draft';
          secondTitleInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          secondTitleInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        assert.equal(control(`x4-ui-source-edit-apply-${secondTitleEntryId}`).disabled, false);
        const emptyCell = secondHierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Cell 2'));
        assert.ok(emptyCell, 'second actual New-menu fixture must expose its empty second cell in the hierarchy');
        await flush(() => emptyCell.click());
        const palette = control('x4-ui-contextual-palette');
        assert.equal(mountedElementByTestId(container, 'x4-ui-builder-selection-unresolved'), null, 'an exact eligible empty cell must not show an unresolved-position warning');
        assert.match(mountedElementText(palette, 'x4-ui-contextual-palette-status'), /Apply or discard your property changes first\./);
        const pendingAddText = mountedElementByTestId(container, 'x4-ui-contextual-palette-add-text');
        assert.ok(pendingAddText, 'an unapplied property draft must keep the palette action visible');
        assert.equal(pendingAddText.disabled, true, 'an unapplied property draft must disable insertion');
        const discard = control('x4-ui-contextual-palette-discard');
        assert.equal(discard.disabled, false);
        await flush(() => discard.click());
        const postDiscardPalette = control('x4-ui-contextual-palette');
        assert.match(mountedElementText(postDiscardPalette, 'x4-ui-contextual-palette-status'), /Choose text, button, or input\./);
        const postDiscardAddText = mountedElementByTestId(container, 'x4-ui-contextual-palette-add-text');
        assert.ok(postDiscardAddText, 'discarding the local property draft must keep the palette action visible');
        assert.equal(postDiscardAddText.disabled, false, 'discarding the local property draft must re-enable insertion');
        assert.equal(currentWorkspace, secondWorkspace, 'discarding a property draft must not submit a workspace change');
        assert.equal((currentWorkspace as typeof original).passthroughFiles.find(file => file.path === secondLua.path)?.content, secondLua.content, 'discarding a property draft must leave the original Lua unchanged');
        const paletteText = control('x4-ui-contextual-palette-text');
        assert.equal(paletteText.value, 'New text');
        await flush(() => {
          paletteText.focus();
          paletteText.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          paletteText.value = 'Inserted widget';
          paletteText.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          paletteText.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        const addText = mountedElementByTestId(container, 'x4-ui-contextual-palette-add-text');
        assert.ok(addText, 'the settled empty cell must expose palette actions');
        assert.equal(addText.disabled, false);
        await flush(() => addText.click());
        assert.equal(submissions, 3, 'actual New-menu insertion must use the existing parent commit seam');
        const insertionAuthority = authorities[2];
        assert.ok(insertionAuthority);
        const insertedWorkspace = insertionAuthority.submission.workspace as typeof original;
        const insertedSecondFile = insertedWorkspace.passthroughFiles.find(file => file.path === secondLua.path);
        assert.ok(insertedSecondFile);
        assert.match(insertedSecondFile.content, /Inserted widget/);
        assert.notEqual(insertedSecondFile.content, secondLua.content, 'the empty cell insertion must change only the selected menu source');
        assert.equal(insertedWorkspace.passthroughFiles.find(file => file.path === newFile.path)?.content, firstLua);
        assert.deepEqual(insertedWorkspace.passthroughFiles.find(file => file.path === 'content.xml'), unrelated);
        assert.equal(control('x4-ui-contextual-palette-add-text').disabled, true, 'a pending insertion cannot be submitted twice');
        await flush(() => replaceWorkspace(insertedWorkspace));
        await flush(() => { insertionAuthority.acknowledge(insertedWorkspace); });
        const insertedHierarchy = control('x4-ui-builder-hierarchy-list');
        assert.ok(insertedHierarchy.querySelectorAll('button').some(element => element.textContent.startsWith('Text · Inserted widget')), 'acknowledged insertion must project the new Text node');
        const insertedSelection = control('x4-ui-builder-selection');
        const insertedInput = insertedSelection.querySelectorAll('input').find(input => input.value === 'Inserted widget');
        assert.ok(insertedInput, 'acknowledged insertion must select its ordinary editable text property');
        const insertedEntryId = insertedInput.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
        assert.ok(insertedEntryId);
        await flush(() => {
          insertedInput.focus();
          insertedInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          insertedInput.value = 'Edited inserted widget';
          insertedInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          insertedInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        await flush(() => control(`x4-ui-source-edit-apply-${insertedEntryId}`).click());
        assert.equal(submissions, 4, 'the newly selected widget must use the ordinary property Apply path');
        const insertedEditAuthority = authorities[3];
        assert.ok(insertedEditAuthority);
        const editedInsertedWorkspace = insertedEditAuthority.submission.workspace as typeof original;
        const editedInsertedFile = editedInsertedWorkspace.passthroughFiles.find(file => file.path === secondLua.path);
        assert.ok(editedInsertedFile);
        assert.match(editedInsertedFile.content, /Edited inserted widget/);
        assert.match(editedInsertedFile.content, /Another visual menu/);
        assert.equal(editedInsertedWorkspace.passthroughFiles.find(file => file.path === newFile.path)?.content, firstLua);
        await flush(() => replaceWorkspace(editedInsertedWorkspace));
        await flush(() => { insertedEditAuthority.acknowledge(editedInsertedWorkspace); });
        assert.ok(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'Edited inserted widget'), 'the ordinary property edit must retain the new widget selection');
      }
      if (scenario === 'duplicate-name') {
        const beforeDuplicate = JSON.stringify(currentWorkspace);
        await enterName(name);
        await flush(submit);
        assert.equal(submissions, 1, 'duplicate creation must refuse before parent submission');
        assert.equal(JSON.stringify(currentWorkspace), beforeDuplicate);
        assert.equal(control('x4-ui-new-menu-name').value, name);
        assert.doesNotMatch(mountedElementText(container, 'x4-ui-new-menu-status'), /^Created /);
      }
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      assert.equal(JSON.stringify(original), originalBytes, `${scenario}: original workspace must remain immutable`);
      if (root !== undefined) await flush(() => root?.unmount());
      restoreGlobals();
    }
  }
  console.log(`B119_NEW_MENU_UI_MATRIX ${JSON.stringify({ total: scenarios.length, passed: scenarios.length - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'New-menu creation, adoption, canvas and lifecycle safety must all pass');
}

async function runMountedPreviewScenarioHistoryRegression(fixture: P7SourceAuthorityFixture): Promise<void> {
  const doc = new MountedDomDocument();
  const restore = installMountedDomGlobals(doc);
  const container = doc.createElement('div'); doc.body.appendChild(container);
  const path = 'ui/pipeline_test.lua';
  const lua = [
    'local menu = { name = "ScenarioHistory" }', 'function menu.createFrame()',
    ' local frame = Helper.createFrameHandle(menu, { width = 220, height = 140 })',
    ' local t = frame:addTable(1, { width = 200, scaling = false })',
    ' local title = t:addRow(false, {})', ' title[1]:createText("Before", {})',
    ' local other = t:addRow(false, {})', ' other[1]:createText("Other known row", {})',
    ' local last = t:addRow(false, {})', ' last[1]:createText("Last known row", {})',
    ' local sampled = frame:addTable(1, { width = 200, y = 70, scaling = false })',
    ' local a = sampled:addRow(false, {})', ' a[1]:createText(previewText, {})',
    ' local b = sampled:addRow(false, {})', ' b[1]:createText(previewText, {})',
    ' frame:display()', 'end',
  ].join('\n');
  const original = sanitizeWorkspace({ ...portablePipelineTestWorkspace().workspace, id: 'scenario-first-render',
    passthroughFiles: portablePipelineTestWorkspace().workspace.passthroughFiles.map(file => file.path === path ? { ...file, content: lua } : file) });
  let current = original;
  let notice: X4UiHistoryRestorationNotice | null = null;
  let rerender: () => void = () => { throw new Error('not mounted'); };
  const scope = 'scenario-first-render-scope';
  const entries: WorkspaceHistoryEntry[] = [];
  const observations: { workspace: typeof original; values: unknown[];
    profile: { width: number; height: number; uiScale: number } }[] = [];
  let projection: X4UiEditorSessionProjection | undefined;
  const loader = async () => ({ core: fixture.core, color: fixture.color });
  const surfaceFactory = (width: number, height: number) => new MountedCanvasElement(doc, width, height);
  const handler: X4UiWorkspaceEditHandler = request => {
    assert.equal(request.expectedWorkspace, current);
    const authority = createX4UiWorkspaceEditPending(current, request.workspace);
    const next = request.workspace as typeof original;
    assert.ok(projection && request.sourceSplice);
    const captured = capturePreviewScenario(projection, { width: projection.profile.drawable.width, height: projection.profile.drawable.height,
      uiScale: projection.profile.uiScale, scaleMode: 'custom-effective-helper-scale', userScale: 1 }, 'mounted', 'Mounted');
    assert.ok(captured.ok);
    if (captured.ok) {
      const transfer = transferPreviewScenario(createX4UiEditorSessionOwner(next), { workspace: next, corpus: fixture.core, colorEvidence: fixture.color }, captured.scenario, projection, request.sourceSplice);
      assert.ok(transfer.ok, `mounted source-owner splice must transfer independently: ${JSON.stringify(transfer.ok ? null : transfer)}`);
    }
    entries.push(createSourceWorkspaceHistoryEntry(scope, current, next, request.sourceSplice));
    flushSync(() => { current = next; rerender(); });
    authority.acknowledge(current);
    return authority.submission;
  };
  const Parent = () => {
    const [, setRevision] = React.useState(0);
    rerender = () => setRevision(value => value + 1);
    return <X4UiSourceEditor workspace={current} workspaceScope={scope} historyRestoration={notice}
      corpusLoader={loader} surfaceFactory={surfaceFactory} onWorkspaceEdit={handler}
      onSessionProjection={value => { projection = value; observations.push({ workspace: current,
        values: value.samples?.values.map(item => item.value) ?? [], profile: {
          width: value.profile.drawable.width, height: value.profile.drawable.height, uiScale: value.profile.uiScale,
        } }); }} />;
  };
  const flush = async (fn: () => void) => { await act(async () => { fn(); await Promise.resolve(); await Promise.resolve(); }); };
  const control = (id: string) => { const found = mountedElementByTestId(container, id); assert.ok(found, id); return found; };
  const change = async (element: MountedDomElement, value: string) => flush(() => {
    element.focus(); element.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
    element.value = value;
    element.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
    element.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
  });
  const choose = async (id: string, label: string) => { const el = control(id); const option = mountedOptionByText(el, label); assert.ok(option, label); await change(el, option.value); };
  const fillPreview = async (values: string[]) => {
    const region = control('x4-ui-preview-inputs-region');
    const fields = region.querySelectorAll('textarea');
    assert.equal(fields.length, 2, 'actual primary sample controls must expose independent consumers');
    for (let i = 0; i < fields.length; i++) await change(fields[i]!, values[i]!);
    const apply = region.querySelectorAll('button').find(button => button.textContent === 'Apply to preview');
    assert.ok(apply); await flush(() => apply.click());
    assert.deepEqual(projection?.samples?.values.map(item => item.value), values);
  };
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    await flush(() => { root = createRoot(container as unknown as Element); root.render(<React.StrictMode><Parent /></React.StrictMode>); });
    await choose('x4-ui-source-selector', path); await choose('x4-ui-target-selector', 'menu.createFrame');
    await flush(() => control('x4-ui-preview-inputs-toggle').click());
    await fillPreview(['Scenario A', 'Independent A']);
    assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-stale-notice'), null, 'current partial preview is not historical');
    const contextualNode = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .find(button => button.textContent.startsWith('Text · Scenario A'));
    assert.ok(contextualNode); await flush(() => contextualNode.click());
    const contextFields = () => control('x4-ui-context-inputs-region').querySelectorAll('textarea');
    assert.equal(contextFields().length, 1, 'selected read does not expose its equal-expression sibling');
    assert.equal(contextFields()[0]!.value, 'Scenario A');
    assert.match(control('x4-ui-context-inputs-region').textContent, /Apply and Discard include input edits made in other views/);
    assert.equal(mountedElementByTestId(container, 'x4-ui-context-inputs-clear'), null, 'context has no ambiguous clear-all action');
    const allFields = () => control('x4-ui-preview-inputs-region').querySelectorAll('textarea');
    await change(contextFields()[0]!, 'Context draft');
    assert.equal(allFields()[0]!.value, 'Context draft', 'context writes the one shared draft');
    await change(allFields()[1]!, 'Sibling draft');
    await flush(() => control('x4-ui-context-inputs-reset').click());
    assert.deepEqual(allFields().map(field => field.value), ['Scenario A', 'Independent A'], 'context Discard resets edits from both views');
    await change(contextFields()[0]!, 'Context applied');
    await change(allFields()[1]!, 'Sibling applied');
    await flush(() => control('x4-ui-context-inputs-apply').click());
    assert.deepEqual(projection?.samples?.values.map(item => item.value), ['Context applied', 'Sibling applied'], 'context Apply includes both shared-draft edits');
    assert.equal(current, original); assert.equal(entries.length, 0, 'preview controls create no source/history changes');
    await fillPreview(['Scenario A', 'Independent A']);
    const title = control('x4-ui-builder-hierarchy-list').querySelectorAll('button').find(button => button.textContent.startsWith('Text · Before'));
    assert.ok(title); await flush(() => title.click());
    const field = control('x4-ui-builder-selection').querySelectorAll('input').find(input => input.value === 'Before');
    assert.ok(field); const fieldId = field.getAttribute('data-testid'); assert.ok(fieldId);
    await change(field, 'After source edit A');
    await flush(() => control(fieldId.replace('x4-ui-source-edit-input-', 'x4-ui-source-edit-apply-')).click());
    assert.equal(entries.length, 1);
    assert.deepEqual(projection?.samples?.values.map(item => item.value), ['Scenario A', 'Independent A'], `forward edit retains active inputs; last committed values=${JSON.stringify(observations.slice(-6).map(item => item.values))}`);
    await fillPreview(['Scenario B', 'Independent B']);
    // View changes after the source edit are not source history. Undo/Redo must
    // use this current profile on its very first committed projection.
    for (const [id, value] of [['x4-ui-profile-width', '1450'], ['x4-ui-profile-height', '950'],
      ['x4-ui-profile-user-scale', '1.25']] as const) await change(control(id), value);
    const retainedProfile = { width: 1450, height: 950, uiScale: deriveX4UiEffectiveScale(1.25, 950) };
    assert.deepEqual(observations.at(-1)?.profile, retainedProfile);
    assert.deepEqual(projection?.samples?.values.map(item => item.value), ['Scenario B', 'Independent B']);
    const edited = current;
    const historyEntry = entries[0]!;
    assert.equal(historyEntry.kind, 'source');
    if (historyEntry.kind !== 'source') throw new Error('source entry expected');
    assert.ok(historyEntry.sourceSplice);
    let past = entries; let future: WorkspaceHistoryEntry[] = [];
    for (const direction of ['undo', 'redo'] as const) {
      const from = current;
      const result = transitionWorkspaceHistory(direction, past, future, current, scope);
      assert.equal(result.status, 'applied'); if (result.status !== 'applied') throw new Error('history refused');
      const index = observations.length;
      await flush(() => {
        current = result.workspace as typeof original;
        notice = { direction, scope, beforeWorkspace: from, afterWorkspace: current,
          sourceSplice: direction === 'undo' ? reverseWorkspaceSourceSplice(historyEntry.sourceSplice!) : historyEntry.sourceSplice };
        rerender();
      });
      const firstAndLater = observations.slice(index);
      assert.ok(firstAndLater.length > 0, `${direction}: real committed projection observer must run`);
      for (const observed of firstAndLater) {
        assert.equal(observed.workspace, current);
        assert.deepEqual(observed.values, ['Scenario B', 'Independent B'], `${direction}: FIRST pre-parent-ack and all subsequent projections retain current B`);
        assert.deepEqual(observed.profile, retainedProfile, `${direction}: FIRST and subsequent projections retain current view, not the profile at source-edit time`);
      }
      assert.equal(JSON.stringify(current), JSON.stringify(direction === 'undo' ? original : edited));
      past = result.past; future = result.future;
      const stable = projection;
      await flush(() => { notice = { ...notice! }; rerender(); });
      assert.deepEqual(projection?.samples?.values, stable?.samples?.values, 'duplicate notice preserves state');
    }
    assert.equal(entries.length, 1, 'scenario choice and history do not create additional source entries');
    assert.doesNotMatch(JSON.stringify(entries), /Scenario [AB]|Independent [AB]/);
    const previewLabels = () => control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .filter(button => /^(Text · Scenario B|Text · Independent B)/.test(button.textContent)).map(button => button.textContent.split('text ·')[0].trim());
    assert.deepEqual(previewLabels(), ['Text · Scenario B', 'Text · Independent B']);
    const row = control('x4-ui-builder-hierarchy-list').querySelectorAll('button').find(button => button.textContent.startsWith('Row 1'));
    assert.ok(row); await flush(() => row.click());
    assert.equal(control('x4-ui-row-controls-move-down').disabled, false, control('x4-ui-row-controls-status').textContent);
    await flush(() => control('x4-ui-row-controls-move-down').click());
    assert.equal(entries.length, 2, `actual row permutation uses one source history entry; ${mountedElementText(container, 'x4-ui-source-edit-receipt')}`);
    assert.deepEqual(previewLabels(), ['Text · Scenario B', 'Text · Independent B'], 'supported row permutation retains the separate sampled table');
    const move = entries[1]!; assert.equal(move.kind, 'source');
    if (move.kind === 'source') assert.equal(move.sourceSplice?.retainedSpans?.length, 2, 'actual source owner issues both retained row spans');
    const firstRow = control('x4-ui-builder-hierarchy-list').querySelectorAll('button').find(button => button.textContent.startsWith('Row 1'));
    assert.ok(firstRow); await flush(() => firstRow.click());
    assert.equal(control('x4-ui-contextual-palette-add-row').disabled, false);
    await flush(() => control('x4-ui-contextual-palette-add-row').click());
    assert.equal(entries.length, 3);
    const insertion = entries[2]!; assert.equal(insertion.kind, 'source');
    if (insertion.kind === 'source') assert.equal(insertion.sourceSplice?.startOffset, insertion.sourceSplice?.endOffset, 'actual insertion is zero-length');
    assert.deepEqual(previewLabels(), ['Text · Scenario B', 'Text · Independent B'], 'zero-length insertion retains independent samples');
    console.log('B119_SCENARIO_FIRST_RENDER PASS: mounted real SourceEditor A edit, later B, first Undo/Redo projection, duplicate notice, exact source-only history');
    await change(control('x4-ui-contextual-palette-text'), 'History inserted text');
    await flush(() => control('x4-ui-contextual-palette-add-text').click());
    assert.equal(entries.length, 4);
    const structuralAuthored = JSON.stringify(current);
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, 'Text · History inserted text');
    let structuralPast = [...entries]; let structuralFuture: WorkspaceHistoryEntry[] = [];
    const restoreStructure = async (direction: 'undo' | 'redo') => {
      const from = current;
      const result = transitionWorkspaceHistory(direction, structuralPast, structuralFuture, current, scope);
      assert.equal(result.status, 'applied'); if (result.status !== 'applied') throw new Error('structural history refused');
      assert.equal(result.entry.kind, 'source'); if (result.entry.kind !== 'source') throw new Error('source history expected');
      const splice = result.entry.sourceSplice; assert.ok(splice);
      await flush(() => {
        current = result.workspace as typeof original;
        notice = { direction, scope, beforeWorkspace: from, afterWorkspace: current,
          sourceSplice: direction === 'undo' ? reverseWorkspaceSourceSplice(splice) : splice };
        rerender();
      });
      structuralPast = result.past; structuralFuture = result.future;
      assert.deepEqual(previewLabels(), ['Text · Scenario B', 'Text · Independent B']);
      assert.equal(entries.length, 4, 'restoration must not append source history');
    };
    for (const direction of ['undo', 'undo', 'undo', 'redo', 'redo', 'redo'] as const) {
      await restoreStructure(direction);
      if (JSON.stringify(current) !== structuralAuthored) {
        assert.equal(mountedElementByTestId(container, 'x4-ui-builder-selected-node-label'), null,
          'removed element must not select a substitute');
      }
    }
    assert.equal(JSON.stringify(current), structuralAuthored);
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, 'Text · History inserted text',
      'exact multi-step structural Redo restores the inserted element inspector');
    await restoreStructure('undo');
    const interruption = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .find(button => button.textContent.startsWith('Text · Scenario B'));
    assert.ok(interruption); await flush(() => interruption.click());
    await restoreStructure('redo');
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, 'Text · Scenario B',
      'explicit selection while an element is absent cancels dormant restoration');
    for (const interruptionKind of ['profile', 'foreign-notice', 'external-replacement'] as const) {
      const inserted = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
        .find(button => button.textContent.startsWith('Text · History inserted text'));
      assert.ok(inserted); await flush(() => inserted.click());
      await restoreStructure('undo');
      const originalWidth = control('x4-ui-profile-width').value;
      if (interruptionKind === 'profile') await change(control('x4-ui-profile-width'), '1200');
      else await flush(() => {
        if (interruptionKind === 'foreign-notice') notice = { ...notice!, scope: 'foreign-history-scope' };
        else { current = sanitizeWorkspace(JSON.parse(JSON.stringify(current))); notice = null; }
        rerender();
      });
      await restoreStructure('redo');
      assert.equal(mountedElementByTestId(container, 'x4-ui-builder-selected-node-label'), null,
        `${interruptionKind} invalidates dormant element intent`);
      if (interruptionKind === 'profile') await change(control('x4-ui-profile-width'), originalWidth);
      await flush(() => { notice = { ...notice! }; rerender(); });
      assert.equal(mountedElementByTestId(container, 'x4-ui-builder-selected-node-label'), null,
        'duplicate restoration cannot revive cancelled element intent');
    }
    console.log('B119_STRUCTURAL_HISTORY_SELECTION PASS: exact multi-step return, no missing-element substitute, explicit interruption, source/input/history preservation');
    const profileWorkspace = JSON.stringify(current);
    const profileHistoryCount = entries.length;
    for (const [id, value] of [['x4-ui-profile-width', '1600'], ['x4-ui-profile-height', '900'], ['x4-ui-profile-user-scale', '1.2'],
      ['x4-ui-profile-scale-mode', 'custom-effective-helper-scale'], ['x4-ui-profile-scale', '1.4'],
      ['x4-ui-profile-scale-mode', 'derived-from-x4-user-scale']] as const) {
      const firstObservation = observations.length;
      await change(control(id), value);
      assert.equal(control(id).value, value, `${id} actually applies the requested profile setting`);
      assert.ok(observations.length > firstObservation, `${id} emits a current projection`);
      assert.deepEqual(projection?.samples?.values.map(item => item.value), ['Scenario B', 'Independent B'], `${id} retains current inputs`);
      assert.ok(observations.slice(firstObservation).every(item => JSON.stringify(item.values) === JSON.stringify(['Scenario B', 'Independent B'])), `${id} must not first commit an empty sampled preview`);
    }
    const draftField = control('x4-ui-preview-inputs-region').querySelectorAll('textarea')[0]!;
    await change(draftField, 'Unapplied\nmessage');
    const oldWidth = control('x4-ui-profile-width').value;
    await change(control('x4-ui-profile-width'), '1700');
    assert.equal(control('x4-ui-profile-width').value, oldWidth, 'profile change over unapplied input refuses');
    assert.equal(draftField.value, 'Unapplied\nmessage');
    assert.match(control('x4-ui-profile-error').textContent, /Apply or discard/);
    assert.equal(JSON.stringify(current), profileWorkspace);
    assert.equal(entries.length, profileHistoryCount);
    console.log('B119_PROFILE_INPUT_CONTINUITY PASS: width/height/user-scale/custom/derived retain first-render inputs; unapplied draft refuses without source/history change');
    await flush(() => control('x4-ui-preview-inputs-reset').click());
    const currentSampledNode = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .find(button => button.textContent.startsWith('Text · Scenario B'));
    assert.ok(currentSampledNode); await flush(() => currentSampledNode.click());
    await change(control('x4-ui-context-inputs-region').querySelectorAll('textarea')[0]!, 'Do not apply after navigation');
    const staleApply = mountedReactClickCallback(control('x4-ui-context-inputs-apply'), 'context sample Apply');
    await change(control('x4-ui-target-selector'), '');
    assert.equal(mountedElementByTestId(container, 'x4-ui-context-inputs-region'), null);
    assert.match(control('x4-ui-canvas-stale-notice').textContent, /Previous preview.*not current/);
    assert.match(control('x4-ui-canvas-stale-notice').textContent, /Choose a file and menu above/);
    assert.equal(control('x4-ui-canvas-focus-selection').disabled, true);
    assert.equal(control('x4-ui-canvas-export').disabled, true);
    assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-stale-inputs'), null, 'no inputs action when no menu is selected');
    await flush(staleApply);
    assert.equal(projection?.samples, undefined, 'retained context Apply cannot cross target selection');
    await choose('x4-ui-target-selector', 'menu.createFrame');
    await fillPreview(['Scenario B', 'Independent B']);
    const returnedNode = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .find(button => button.textContent.startsWith('Text · Scenario B'));
    assert.ok(returnedNode); await flush(() => returnedNode.click());
    assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-stale-notice'), null, 'recovered current preview removes historical notice');
    await change(control('x4-ui-context-inputs-region').querySelectorAll('textarea')[0]!, 'Do not apply after source navigation');
    const staleSourceApply = mountedReactClickCallback(control('x4-ui-context-inputs-apply'), 'context source sample Apply');
    await change(control('x4-ui-source-selector'), '');
    await flush(staleSourceApply);
    assert.equal(mountedElementByTestId(container, 'x4-ui-context-inputs-region'), null);
    assert.equal(projection?.samples, undefined, 'retained context Apply cannot cross source selection');
    assert.equal(JSON.stringify(current), profileWorkspace); assert.equal(entries.length, profileHistoryCount);
    console.log('B119_CONTEXT_PREVIEW_INPUTS PASS: mounted independent read, shared drafts/Apply/Discard, no source/history mutation, stale target/source handler refusal');
    const captionSource = lua.replace('y = 70', 'y = previewY')
      .replace('a[1]:createText(previewText', 'a[1]:createText("Locate me"')
      .replace('b[1]:createText(previewText, {})', 'b[1]:createText(previewText, { height = 20 })');
    await flush(() => {
      current = sanitizeWorkspace({ ...original, passthroughFiles: original.passthroughFiles!.map(file => file.path === path ? { ...file, content: captionSource } : file) });
      rerender();
    });
    await choose('x4-ui-source-selector', path); await choose('x4-ui-target-selector', 'menu.createFrame');
    // Reuse the event-only Focus fixture's measured viewport. This DOM has no
    // layout engine; actual sizing and label visibility are browser assertions.
    Object.defineProperties(control('x4-ui-canvas-scroll'), {
      clientWidth: { value: 640 }, clientHeight: { value: 320 },
      scrollLeft: { value: 0, writable: true }, scrollTop: { value: 0, writable: true },
    });
    const captionWorkspace = JSON.stringify(current); const captionHistoryCount = entries.length;
    const captionNode = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .find(button => button.textContent.startsWith('Text · Locate me'));
    assert.ok(captionNode, 'missing Y does not hide a known caption'); await flush(() => captionNode.click());
    assert.match(control('x4-ui-builder-selection-unresolved').textContent, /position is unresolved/);
    assert.equal(control('x4-ui-canvas-focus-selection').disabled, true);
    assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-selection'), null);
    const related = control('x4-ui-context-inputs-region');
    assert.equal(related.querySelectorAll('input').length, 1);
    assert.equal(related.querySelectorAll('textarea').length, 0, 'unrelated sibling text input is excluded');
    await change(related.querySelectorAll('input')[0]!, '70');
    await flush(() => control('x4-ui-context-inputs-apply').click());
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, 'Text · Locate me');
    assert.equal(control('x4-ui-canvas-focus-selection').disabled, false, JSON.stringify({
      canvas: control('x4-ui-canvas-status').textContent,
      samples: projection?.samples?.values.map(value => value.value),
      gaps: projection?.preview.program && projection.preview.program.status !== 'refused'
        ? projection.preview.program.program.gaps.filter(gap => gap.source.start.line >= 10)
          .slice(0, 12).map(gap => ({ line: gap.source.start.line, reason: gap.reason })) : [],
      node: buildX4UiBuilderPresentation(projection).nodes.filter(node => node.label === 'Text · Locate me')
        .map(node => ({ selectable: node.selectable, rect: node.rect, detail: node.detail })),
    }));
    assert.ok(mountedElementByTestId(container, 'x4-ui-canvas-selection'));
    await flush(() => control('x4-ui-preview-inputs-clear').click());
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, 'Text · Locate me');
    assert.equal(control('x4-ui-canvas-focus-selection').disabled, true);
    assert.equal(mountedElementByTestId(container, 'x4-ui-canvas-selection'), null);
    assert.equal(JSON.stringify(current), captionWorkspace); assert.equal(entries.length, captionHistoryCount);
    console.log('B119_MOUNTED_UNRESOLVED_CAPTION PASS: recognizable selected control, related Y, apply and clear retain source/history and exact selection');
  } finally { if (root) await flush(() => root!.unmount()); restore(); }
}

type MountedUiBuilderHistoryRun = {
  readonly name: string;
  readonly source: string;
  readonly titleBefore: string;
  readonly exerciseRowMovement: boolean;
  readonly preserveMultiTargetRecovery: boolean;
};

async function runMountedUiBuilderHistoryRestorationRegression(
  fixture: P7SourceAuthorityFixture,
  run: MountedUiBuilderHistoryRun,
): Promise<void> {
  const portable = portablePipelineTestWorkspace().workspace;
  const sourcePath = 'ui/pipeline_test.lua';
  const beforeSource = run.source;
  const historyBefore = sanitizeWorkspace({
    ...portable,
    id: `x4-ui-builder-history-${run.name}`,
    passthroughFiles: [
      ...portable.passthroughFiles.map(file => file.path === sourcePath ? { ...file, content: beforeSource } : { ...file }),
      { path: 'sibling.xml', content: '<sibling>preserve during title history</sibling>', reason: 'partial' },
    ],
  });
  const historyScope = `ui-builder-history-${run.name}-scope`;
  const mountedDocument = new MountedDomDocument();
  const restoreGlobals = installMountedDomGlobals(mountedDocument);
  const canonicalLoader = async (): Promise<{ readonly core: P7SourceAuthorityFixture['core']; readonly color: P7SourceAuthorityFixture['color'] }> => ({
    core: fixture.core,
    color: fixture.color,
  });
  const container = mountedDocument.createElement('div');
  mountedDocument.body.appendChild(container);
  let currentWorkspace: unknown = historyBefore;
  let replaceWorkspace: React.Dispatch<React.SetStateAction<typeof historyBefore>> = () => { throw new Error('UIBuilder history parent is not mounted'); };
  let publishHistoryRestoration: React.Dispatch<React.SetStateAction<X4UiHistoryRestorationNotice | null>> = () => { throw new Error('UIBuilder history notice parent is not mounted'); };
  const receipts: UIBuilderSourceHistoryAcknowledgement[] = [];
  const entries: WorkspaceHistoryEntry[] = [];
  const seenAttempts = new WeakSet<object>();
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => {
      operation();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const control = (id: string): MountedDomElement => {
    const element = mountedElementByTestId(container, id);
    assert.ok(element, `UIBuilder history: missing ${id}`);
    return element;
  };
  const selectedOptionText = (id: string): string => {
    const select = control(id);
    return select.options.find(option => option.selected && option.value !== '')?.textContent ?? '';
  };
  const assertNoMenuSelection = (detail: string): void => {
    assert.equal(selectedOptionText('x4-ui-source-selector'), '', `${detail}: source selection must remain empty`);
    assert.equal(selectedOptionText('x4-ui-target-selector'), '', `${detail}: target selection must remain empty`);
  };
  const selectHistoryMenu = async (): Promise<void> => {
    const sourceSelect = control('x4-ui-source-selector');
    const sourceOption = mountedOptionByText(sourceSelect, sourcePath);
    assert.ok(sourceOption, 'UIBuilder history: the current source catalog must expose the history source');
    await flush(() => {
      sourceSelect.value = sourceOption.value;
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const targetSelect = control('x4-ui-target-selector');
    const targetOption = mountedOptionByText(targetSelect, 'menuA.createFrame');
    assert.ok(targetOption, 'UIBuilder history: the current source catalog must expose the history target');
    await flush(() => {
      targetSelect.value = targetOption.value;
      targetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
  };
  const Parent = (): React.ReactElement => {
    const [liveWorkspace, setLiveWorkspace] = React.useState<typeof historyBefore>(historyBefore);
    const [historyRestoration, setHistoryRestoration] = React.useState<X4UiHistoryRestorationNotice | null>(null);
    const setNormalizedWorkspace = React.useCallback<React.Dispatch<React.SetStateAction<typeof historyBefore>>>(update => {
      setLiveWorkspace(previous => {
        const candidate = typeof update === 'function' ? update(previous) : update;
        return retainWorkspaceCandidateIfNormalizedUnchanged(candidate, sanitizeWorkspace(candidate));
      });
    }, []);
    currentWorkspace = liveWorkspace;
    replaceWorkspace = setNormalizedWorkspace;
    publishHistoryRestoration = setHistoryRestoration;
    const onSourceHistoryAcknowledged = React.useCallback((receipt: UIBuilderSourceHistoryAcknowledgement): void => {
      receipts.push(receipt);
      const prepared = prepareX4UiSourceHistoryEntry(
        receipt,
        historyScope,
        currentWorkspace as typeof historyBefore,
        seenAttempts,
      );
      if (prepared.status === 'recorded') entries.push(prepared.entry);
    }, []);
    return <UIBuilder
      workspace={liveWorkspace}
      setWorkspace={setNormalizedWorkspace}
      selectedWidget={null}
      setSelectedWidget={() => undefined}
      presentationTab="source"
      workspaceScope={historyScope}
      historyRestoration={historyRestoration}
      sourceEditorCorpusLoader={canonicalLoader}
      onX4UiSourceEditAcknowledged={onSourceHistoryAcknowledged}
    />;
  };
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<Parent />);
    });
    const sourceSelect = control('x4-ui-source-selector');
    const sourceOption = mountedOptionByText(sourceSelect, sourcePath);
    assert.ok(sourceOption, 'UIBuilder history: the actual SourceEditor source option must be rendered');
    await flush(() => {
      sourceSelect.value = sourceOption.value;
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const targetSelect = control('x4-ui-target-selector');
    const targetOption = mountedOptionByText(targetSelect, 'menuA.createFrame');
    assert.ok(targetOption, 'UIBuilder history: the actual SourceEditor target option must be rendered');
    await flush(() => {
      targetSelect.value = targetOption.value;
      targetSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const beforeSourceKey = sourceOption.value;
    const beforeTargetKey = targetOption.value;
    const hierarchy = control('x4-ui-builder-hierarchy-list');
    const titleNode = hierarchy.querySelectorAll('button').find(button => button.textContent.startsWith(`Text · ${run.titleBefore}`));
    assert.ok(titleNode, `UIBuilder history: the actual hierarchy must expose the editable title node; status=${control('x4-ui-builder-hierarchy-status').textContent}; hierarchy=${hierarchy.textContent}; sourceStatus=${control('x4-ui-corpus-status').textContent}; corpusDetail=${control('x4-ui-corpus-detail').textContent}`);
    await flush(() => titleNode.click());
    const selection = control('x4-ui-builder-selection');
    const titleInput = selection.querySelectorAll('input').find(input => input.value === run.titleBefore);
    assert.ok(titleInput, 'UIBuilder history: the actual selected title must expose its ordinary property input');
    const entryId = titleInput.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
    assert.ok(entryId, 'UIBuilder history: the title input must expose its owner-issued entry ID');
    await flush(() => {
      titleInput.focus();
      titleInput.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
      titleInput.value = 'History After';
      titleInput.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
      titleInput.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    await flush(() => control(`x4-ui-source-edit-apply-${entryId}`).click());
    assert.equal(receipts.length, 1, 'UIBuilder must publish exactly one accepted source history callback');
    assert.equal(entries.length, 1, 'the accepted UIBuilder callback must record exactly one source history entry');
    const acceptedReceipt = receipts[0];
    const historyEntry = entries[0];
    assert.ok(acceptedReceipt);
    assert.ok(historyEntry);
    assert.equal(acceptedReceipt.acknowledgement.expectedWorkspace, historyBefore);
    assert.equal(acceptedReceipt.acknowledgement.workspace, currentWorkspace);
    assert.equal(acceptedReceipt.acknowledgement.currentWorkspace, currentWorkspace);
    const historyAfter = currentWorkspace as typeof historyBefore;
    assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath, 'the accepted title edit must retain a selected source');
    assert.equal(selectedOptionText('x4-ui-target-selector'), 'menuA.createFrame', 'the accepted title edit must retain a selected target');
    const afterSourceKey = control('x4-ui-source-selector').options.find(option => option.textContent === sourcePath && option.selected)?.value;
    const afterTargetKey = control('x4-ui-target-selector').options.find(option => option.textContent === 'menuA.createFrame')?.value;
    assert.ok(afterSourceKey, 'the accepted title edit must expose a defined selected fresh source key');
    assert.ok(afterTargetKey, 'the accepted title edit must expose a defined fresh target key');
    assert.notEqual(afterSourceKey, beforeSourceKey, 'the accepted title edit must issue a fresh source identity');
    assert.notEqual(afterTargetKey, beforeTargetKey, 'the accepted title edit must issue a fresh target identity');
    assert.equal(historyAfter.passthroughFiles.find(file => file.path === 'sibling.xml')?.content,
      '<sibling>preserve during title history</sibling>');
    assert.match(historyAfter.passthroughFiles.find(file => file.path === sourcePath)?.content ?? '', /History After/);
    const editedTitleNode = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .find(button => button.textContent.startsWith('Text · History After'));
    assert.ok(editedTitleNode, 'the fresh edited title must remain directly selectable before Undo');
    await flush(() => editedTitleNode.click());

    const undo = transitionWorkspaceHistory('undo', [historyEntry], [], historyAfter, historyScope);
    assert.equal(undo.status, 'applied', 'UIBuilder title edit must accept guarded Undo');
    if (undo.status !== 'applied') throw new Error('UIBuilder history Undo was refused');
    await flush(() => replaceWorkspace(undo.workspace as typeof historyBefore));
    assert.equal(currentWorkspace, undo.workspace, 'UIBuilder Undo must read back the exact restored workspace object');
    assertNoMenuSelection('UIBuilder title Undo before delayed notice');
    const undoNotice: X4UiHistoryRestorationNotice = {
      direction: 'undo',
      scope: historyScope,
      beforeWorkspace: historyAfter,
      afterWorkspace: undo.workspace,
    };
    await flush(() => publishHistoryRestoration(undoNotice));
    assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath, 'delayed Undo notice must recover the fresh source selector');
    assert.equal(selectedOptionText('x4-ui-target-selector'), 'menuA.createFrame', 'delayed Undo notice must recover the fresh target selector');
    assert.equal(control('x4-ui-canvas-status').textContent, 'rendered/current', 'delayed Undo notice must refresh a current canvas');
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, `Text · ${run.titleBefore}`,
      'scalar Undo must resolve the selected element against the fresh restored source');
    assert.ok(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === run.titleBefore),
      'scalar Undo must restore the ordinary editable property inspector, not only the canvas');

    const redo = transitionWorkspaceHistory('redo', undo.past, undo.future, undo.workspace as typeof historyBefore, historyScope);
    assert.equal(redo.status, 'applied', 'UIBuilder title edit must accept guarded Redo');
    if (redo.status !== 'applied') throw new Error('UIBuilder history Redo was refused');
    await flush(() => replaceWorkspace(redo.workspace as typeof historyBefore));
    assertNoMenuSelection('UIBuilder title Redo before delayed notice');
    const redoNotice: X4UiHistoryRestorationNotice = {
      direction: 'redo',
      scope: historyScope,
      beforeWorkspace: undo.workspace,
      afterWorkspace: redo.workspace,
    };
    await flush(() => publishHistoryRestoration(redoNotice));
    assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath, 'delayed Redo notice must recover the fresh source selector');
    assert.equal(selectedOptionText('x4-ui-target-selector'), 'menuA.createFrame', 'delayed Redo notice must recover the fresh target selector');
    assert.equal(control('x4-ui-canvas-status').textContent, 'rendered/current', 'delayed Redo notice must refresh a current canvas');
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, 'Text · History After',
      'scalar Redo must resolve the selected element again from fresh source authority');
    assert.ok(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'History After'),
      'scalar Redo must expose the restored property value for continued editing');
    assert.match((redo.workspace as typeof historyBefore).passthroughFiles.find(file => file.path === sourcePath)?.content ?? '', /History After/);
    assert.equal((redo.workspace as typeof historyBefore).passthroughFiles.find(file => file.path === 'sibling.xml')?.content,
      '<sibling>preserve during title history</sibling>');
    const frameAfterRedo = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
      .find(button => button.textContent.startsWith('Frame 1'));
    assert.ok(frameAfterRedo, 'history interruption control needs a different selectable element');
    await flush(() => frameAfterRedo.click());
    await flush(() => publishHistoryRestoration({ ...redoNotice }));
    assert.equal(control('x4-ui-builder-selected-node-label').textContent, 'Frame 1',
      'replayed history metadata must not replace an explicit new element selection');

    if (run.exerciseRowMovement) {
      const moveHierarchy = control('x4-ui-builder-hierarchy-list');
      const moveNode = moveHierarchy.querySelectorAll('button').find(button => button.textContent.includes('History Row 2'));
      assert.ok(moveNode, 'UIBuilder history: the actual hierarchy must expose the populated middle row for movement');
      await flush(() => moveNode.click());
      assert.equal(control('x4-ui-row-controls-move-up').disabled, false,
        `UIBuilder history: a populated middle row must move up; status=${control('x4-ui-row-controls-status').textContent}; title=${control('x4-ui-row-controls-move-up').getAttribute('title')}; hierarchy=${moveHierarchy.textContent}`);
      assert.equal(control('x4-ui-row-controls-move-down').disabled, false,
        `UIBuilder history: a populated middle row must move down; status=${control('x4-ui-row-controls-status').textContent}; title=${control('x4-ui-row-controls-move-down').getAttribute('title')}; hierarchy=${moveHierarchy.textContent}`);

      const hierarchyLabels = (): readonly string[] => control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
        .map(button => button.textContent);
      const rowOrder = (labels: readonly string[], rowText: string): number => labels.findIndex(label => label.includes(rowText));
      const workspaceWithoutMovedSource = (candidate: typeof historyBefore): string => JSON.stringify({
        ...candidate,
        passthroughFiles: candidate.passthroughFiles.map(file => file.path === sourcePath
          ? { ...file, content: '<source-content-omitted-for-metadata-comparison>' }
          : { ...file }),
      });
      const preMoveWorkspace = currentWorkspace as typeof historyBefore;
      const preMoveWorkspaceSnapshot = JSON.stringify(preMoveWorkspace);
      const preMoveSourceContent = preMoveWorkspace.passthroughFiles.find(file => file.path === sourcePath)?.content;
      assert.ok(preMoveSourceContent, 'UIBuilder history: the pre-move snapshot must retain the complete source');
      const preMoveHierarchyLabels = hierarchyLabels();
      assert.ok(rowOrder(preMoveHierarchyLabels, 'History Row 2') < rowOrder(preMoveHierarchyLabels, 'History Row 3'),
        'UIBuilder history: the mounted hierarchy must expose the original sibling order before movement');
      const preMoveCanvas = control('x4-ui-canvas-host').firstElementChild;
      assert.ok(preMoveCanvas instanceof MountedCanvasElement,
        'UIBuilder history: the mounted pre-move canvas must be available for the movement restoration check');

      const currentProjectionInput = {
        workspace: preMoveWorkspace,
        corpus: fixture.core,
        colorEvidence: fixture.color,
        profile: X4_UI_EDITOR_DEFAULT_PROFILE,
      };
      const currentProjectionWithoutSelection = projectX4UiEditorSession(currentProjectionInput);
      const currentSourceCandidate = currentProjectionWithoutSelection.preview.sourceCandidates.find(candidate => candidate.path === sourcePath);
      assert.ok(currentSourceCandidate, 'UIBuilder history: the identical current workspace must issue the history source candidate');
      const currentTargetCandidate = currentSourceCandidate?.targets.find(candidate => candidate.name === 'menuA.createFrame');
      assert.ok(currentTargetCandidate, 'UIBuilder history: the identical current workspace must issue the history target candidate');
      const currentProjection = projectX4UiEditorSession({
        ...currentProjectionInput,
        selection: {
          sourceIndex: currentSourceCandidate.index,
          path: currentSourceCandidate.path,
          sourceIdentity: currentSourceCandidate.sourceIdentity,
          target: currentTargetCandidate,
        },
      });
      const currentPresentation = buildX4UiBuilderPresentation(currentProjection);
      const currentNodeId = moveNode.getAttribute('data-testid')?.replace('x4-ui-builder-node-', '');
      assert.ok(currentNodeId, 'UIBuilder history: the mounted selected row must expose its builder identity');
      const currentNode = currentPresentation.nodes.find(node => node.id === currentNodeId);
      assert.ok(currentNode, 'UIBuilder history: the identical current projection must expose the mounted selected node');
      const currentRow = resolveX4UiBuilderRowForNode(currentPresentation.nodes, currentNode);
      assert.ok(currentRow, 'UIBuilder history: the identical current projection must resolve the selected row');
      const currentCatalog = discoverX4UiSourceEditorCatalog(preMoveWorkspace, currentProjection);
      assert.ok(currentCatalog, 'UIBuilder history: the identical current projection must issue a source catalog');
      const issuedMoveEntry = currentCatalog?.moveEntries?.find(entry => entry.direction === 'down'
        && entry.path === sourcePath
        && entry.rowId === currentRow.id.slice('scene:'.length));
      assert.ok(issuedMoveEntry, 'UIBuilder history: the current issued catalog must contain the selected row Move down entry');
      assert.equal(currentCatalog?.sourceText, preMoveSourceContent,
        'UIBuilder history: the issued move catalog must bind to the exact pre-move source bytes');
      assert.equal(preMoveSourceContent.slice(issuedMoveEntry.startOffset, issuedMoveEntry.endOffset), issuedMoveEntry.expectedText,
        'UIBuilder history: the issued move range must match its owner-issued expected block text');
      const expectedMovedSource = preMoveSourceContent.slice(0, issuedMoveEntry.startOffset)
        + issuedMoveEntry.lower.expectedText + issuedMoveEntry.upper.expectedText
        + preMoveSourceContent.slice(issuedMoveEntry.endOffset);
      const expectedMovedWorkspace = sanitizeWorkspace({
        ...preMoveWorkspace,
        passthroughFiles: preMoveWorkspace.passthroughFiles.map(file => file.path === sourcePath
          ? { ...file, content: expectedMovedSource }
          : { ...file }),
      });

      await flush(() => control('x4-ui-row-controls-move-down').click());
      assert.equal(receipts.length, 2, 'UIBuilder must publish the row move acknowledgement through the existing history owner');
      assert.equal(entries.length, 2, 'the accepted row move must record exactly one additional guarded history entry');
      const moveHistoryEntry = entries[1];
      assert.ok(moveHistoryEntry, 'the accepted row move must have a guarded source history entry');
      const historyMoved = currentWorkspace as typeof historyBefore;
      const movedSourceContent = historyMoved.passthroughFiles.find(file => file.path === sourcePath)?.content;
      assert.equal(movedSourceContent, expectedMovedSource,
        'UIBuilder history: Move down must equal the exact independently derived issued-entry splice');
      assert.equal(JSON.stringify(historyMoved), JSON.stringify(expectedMovedWorkspace),
        'UIBuilder history: Move down must preserve the exact full workspace apart from the issued source splice');
      assert.equal(workspaceWithoutMovedSource(historyMoved), workspaceWithoutMovedSource(preMoveWorkspace),
        'UIBuilder history: Move down must preserve all non-source files and workspace metadata');
      const movedHierarchyLabels = hierarchyLabels();
      assert.notDeepEqual(movedHierarchyLabels, preMoveHierarchyLabels,
        'UIBuilder history: accepted Move down must reproject a changed hierarchy order');
      assert.ok(rowOrder(movedHierarchyLabels, 'History Row 3') < rowOrder(movedHierarchyLabels, 'History Row 2'),
        'UIBuilder history: accepted Move down must swap the mounted sibling order');
      const movedCanvas = control('x4-ui-canvas-host').firstElementChild;
      assert.ok(movedCanvas instanceof MountedCanvasElement,
        'UIBuilder history: accepted Move down must mount a fresh canvas');
      assert.notEqual(movedCanvas, preMoveCanvas,
        'UIBuilder history: accepted Move down must change the mounted canvas signature');
      const movedWorkspaceSnapshot = JSON.stringify(historyMoved);
      const movedSourceSnapshot = movedSourceContent;
      const movedSelection = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
        .find(button => button.getAttribute('aria-pressed') === 'true');
      assert.ok(movedSelection, 'UIBuilder history: accepted Move down must select a fresh row');
      assert.match(movedSelection.textContent, /^Row 3/);

      const moveUndo = transitionWorkspaceHistory('undo', [moveHistoryEntry], [], historyMoved, historyScope);
      assert.equal(moveUndo.status, 'applied', 'UIBuilder row move must accept guarded Undo');
      if (moveUndo.status !== 'applied') throw new Error('UIBuilder row move Undo was refused');
      assert.equal(JSON.stringify(moveUndo.workspace), preMoveWorkspaceSnapshot,
        'UIBuilder history: guarded Move Undo must restore the exact full pre-move workspace');
      assert.equal((moveUndo.workspace as typeof historyBefore).passthroughFiles.find(file => file.path === sourcePath)?.content,
        preMoveSourceContent, 'UIBuilder history: guarded Move Undo must restore the exact pre-move source bytes');
      assert.equal(workspaceWithoutMovedSource(moveUndo.workspace as typeof historyBefore), workspaceWithoutMovedSource(preMoveWorkspace),
        'UIBuilder history: guarded Move Undo must preserve all non-source files and workspace metadata');
      await flush(() => replaceWorkspace(moveUndo.workspace as typeof historyBefore));
      assertNoMenuSelection('UIBuilder row move Undo before delayed notice');
      await flush(() => publishHistoryRestoration({
        direction: 'undo',
        scope: historyScope,
        beforeWorkspace: historyMoved,
        afterWorkspace: moveUndo.workspace,
      }));
      assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath, 'row move Undo must recover the fresh source selector');
      assert.equal(selectedOptionText('x4-ui-target-selector'), 'menuA.createFrame', 'row move Undo must recover the fresh target selector');
      assert.equal(control('x4-ui-canvas-status').textContent, 'rendered/current', 'row move Undo must reproject a current canvas');
      const undoneHierarchyLabels = hierarchyLabels();
      assert.deepEqual(undoneHierarchyLabels, preMoveHierarchyLabels,
        'UIBuilder history: Move Undo must restore the exact mounted hierarchy order');
      const undoneCanvas = control('x4-ui-canvas-host').firstElementChild;
      assert.ok(undoneCanvas instanceof MountedCanvasElement,
        'UIBuilder history: Move Undo must mount a restored canvas');
      assert.notEqual(undoneCanvas, movedCanvas,
        'UIBuilder history: Move Undo must change the mounted canvas signature');

      const moveRedo = transitionWorkspaceHistory('redo', moveUndo.past, moveUndo.future, moveUndo.workspace as typeof historyBefore, historyScope);
      assert.equal(moveRedo.status, 'applied', 'UIBuilder row move must accept guarded Redo');
      if (moveRedo.status !== 'applied') throw new Error('UIBuilder row move Redo was refused');
      assert.equal(JSON.stringify(moveRedo.workspace), movedWorkspaceSnapshot,
        'UIBuilder history: guarded Move Redo must restore the exact accepted moved workspace');
      assert.equal((moveRedo.workspace as typeof historyBefore).passthroughFiles.find(file => file.path === sourcePath)?.content,
        movedSourceSnapshot, 'UIBuilder history: guarded Move Redo must restore the exact accepted moved source bytes');
      assert.equal(workspaceWithoutMovedSource(moveRedo.workspace as typeof historyBefore), workspaceWithoutMovedSource(preMoveWorkspace),
        'UIBuilder history: guarded Move Redo must preserve all non-source files and workspace metadata');
      await flush(() => replaceWorkspace(moveRedo.workspace as typeof historyBefore));
      assertNoMenuSelection('UIBuilder row move Redo before delayed notice');
      await flush(() => publishHistoryRestoration({
        direction: 'redo',
        scope: historyScope,
        beforeWorkspace: moveUndo.workspace,
        afterWorkspace: moveRedo.workspace,
      }));
      assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath, 'row move Redo must recover the fresh source selector');
      assert.equal(selectedOptionText('x4-ui-target-selector'), 'menuA.createFrame', 'row move Redo must recover the fresh target selector');
      assert.equal(control('x4-ui-canvas-status').textContent, 'rendered/current', 'row move Redo must reproject a current canvas');
      const redoneHierarchyLabels = hierarchyLabels();
      assert.deepEqual(redoneHierarchyLabels, movedHierarchyLabels,
        'UIBuilder history: Move Redo must restore the exact accepted mounted hierarchy order');
      const redoneCanvas = control('x4-ui-canvas-host').firstElementChild;
      assert.ok(redoneCanvas instanceof MountedCanvasElement,
        'UIBuilder history: Move Redo must mount a restored moved canvas');
      assert.notEqual(redoneCanvas, undoneCanvas,
        'UIBuilder history: Move Redo must change the mounted canvas signature');
      await flush(() => publishHistoryRestoration(null));
      await flush(() => replaceWorkspace(redo.workspace as typeof historyBefore));
    }

    if (run.preserveMultiTargetRecovery) {
    const redoneSourceContent = (redo.workspace as typeof historyBefore).passthroughFiles.find(file => file.path === sourcePath)?.content;
    assert.ok(redoneSourceContent, 'UIBuilder history: Redo must retain the full source content for negative controls');
    const workspaceWithSourceContent = (id: string, content: string): typeof historyBefore => sanitizeWorkspace({
      ...(redo.workspace as typeof historyBefore),
      id,
      passthroughFiles: (redo.workspace as typeof historyBefore).passthroughFiles.map(file => file.path === sourcePath
        ? { ...file, content }
        : { ...file }),
    });
    const externalReplacement = workspaceWithSourceContent('x4-ui-builder-history-external', redoneSourceContent.replace('History After', 'External replacement'));
    await flush(() => publishHistoryRestoration(null));
    await flush(() => replaceWorkspace(externalReplacement));
    assertNoMenuSelection('external replacement before stale restoration notice');
    await flush(() => publishHistoryRestoration(undoNotice));
    assertNoMenuSelection('external replacement must reject an old restoration notice');
    assert.equal(mountedElementByTestId(container, 'x4-ui-builder-selected-node-label'), null,
      'an external replacement must not reuse the old selected element');

    await flush(() => publishHistoryRestoration(null));
    await flush(() => replaceWorkspace(redo.workspace as typeof historyBefore));
    await selectHistoryMenu();
    await flush(() => replaceWorkspace(undo.workspace as typeof historyBefore));
    const wrongScopeNotice: X4UiHistoryRestorationNotice = {
      direction: 'undo',
      scope: 'different-immutable-history-scope',
      beforeWorkspace: redo.workspace,
      afterWorkspace: undo.workspace,
    };
    await flush(() => publishHistoryRestoration(wrongScopeNotice));
    assertNoMenuSelection('scope change must reject an otherwise exact restoration notice');

    await flush(() => publishHistoryRestoration(null));
    await flush(() => replaceWorkspace(redo.workspace as typeof historyBefore));
    await selectHistoryMenu();
    await flush(() => replaceWorkspace(undo.workspace as typeof historyBefore));
    const undoSourceOption = mountedOptionByText(control('x4-ui-source-selector'), sourcePath);
    assert.ok(undoSourceOption, 'user-interruption fixture must retain the source path in the restored catalog');
    await flush(() => {
      const sourceSelect = control('x4-ui-source-selector');
      sourceSelect.value = undoSourceOption.value;
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath);
    assert.equal(selectedOptionText('x4-ui-target-selector'), '', 'user source selection must leave target selection empty');
    await flush(() => publishHistoryRestoration({
      direction: 'undo',
      scope: historyScope,
      beforeWorkspace: redo.workspace,
      afterWorkspace: undo.workspace,
    }));
    assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath, 'user source selection must not be replaced by history recovery');
    assert.equal(selectedOptionText('x4-ui-target-selector'), '', 'user selection interruption must not recover the stale target');

    await flush(() => publishHistoryRestoration(null));
    await flush(() => replaceWorkspace(redo.workspace as typeof historyBefore));
    await selectHistoryMenu();
    await flush(() => replaceWorkspace(undo.workspace as typeof historyBefore));
    const duplicateNotice: X4UiHistoryRestorationNotice = {
      direction: 'undo',
      scope: historyScope,
      beforeWorkspace: redo.workspace,
      afterWorkspace: undo.workspace,
    };
    await flush(() => publishHistoryRestoration(duplicateNotice));
    assert.equal(selectedOptionText('x4-ui-source-selector'), sourcePath, 'the first restoration notice must recover the fresh source');
    assert.equal(selectedOptionText('x4-ui-target-selector'), 'menuA.createFrame', 'the first restoration notice must recover the fresh target');
    await flush(() => {
      const sourceSelect = control('x4-ui-source-selector');
      sourceSelect.value = '';
      sourceSelect.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
    });
    const clearedSourceSelect = control('x4-ui-source-selector');
    assert.equal(clearedSourceSelect.value, '', 'single-select clearing must update the mounted select value');
    assert.deepEqual(
      clearedSourceSelect.options.filter(option => option.selected).map(option => option.value),
      [''],
      'single-select clearing must deselect the previous option in the mounted DOM',
    );
    assertNoMenuSelection('user interruption must clear the prior restoration selection before duplicate notice check');
    await flush(() => replaceWorkspace({ ...(undo.workspace as typeof historyBefore) }));
    await flush(() => replaceWorkspace(undo.workspace as typeof historyBefore));
    assertNoMenuSelection('a duplicate restoration notice must not re-adopt an interrupted selection');

    const missingTargetWorkspace = workspaceWithSourceContent(
      'x4-ui-builder-history-missing-target',
      redoneSourceContent.replace('function menuA.createFrame()', 'function menuA.notCreateFrame()'),
    );
    await flush(() => publishHistoryRestoration(null));
    await flush(() => replaceWorkspace(redo.workspace as typeof historyBefore));
    await selectHistoryMenu();
    await flush(() => replaceWorkspace(missingTargetWorkspace));
    await flush(() => publishHistoryRestoration({
      direction: 'undo',
      scope: historyScope,
      beforeWorkspace: redo.workspace,
      afterWorkspace: missingTargetWorkspace,
    }));
    assertNoMenuSelection('a missing target must fail closed during history recovery');

    const ambiguousTargetWorkspace = workspaceWithSourceContent(
      'x4-ui-builder-history-ambiguous-target',
      `${redoneSourceContent}\nfunction menuA.createFrame()\n  return nil\nend\n`,
    );
    await flush(() => publishHistoryRestoration(null));
    await flush(() => replaceWorkspace(redo.workspace as typeof historyBefore));
    await selectHistoryMenu();
    await flush(() => replaceWorkspace(ambiguousTargetWorkspace));
    await flush(() => publishHistoryRestoration({
      direction: 'undo',
      scope: historyScope,
      beforeWorkspace: redo.workspace,
      afterWorkspace: ambiguousTargetWorkspace,
    }));
    assertNoMenuSelection('an ambiguous target must fail closed during history recovery');
    }
    console.log(`B119_UIBUILDER_HISTORY_${run.name.toUpperCase().replaceAll('-', '_')} PASS: actual UIBuilder accepted title edit callback, exact source history Undo/Redo, delayed post-readback notices, fresh menu selectors, canvas refresh, and sibling preservation`);
  } finally {
    if (root !== undefined) await flush(() => root?.unmount());
    restoreGlobals();
  }
}

async function runMountedSourceEditorStaleCellCallbackRegression(fixture: P7SourceAuthorityFixture): Promise<void> {
  const doc = new MountedDomDocument();
  const restore = installMountedDomGlobals(doc);
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const path = 'ui/stale-cell-callback.lua';
  const otherPath = 'ui/stale-cell-other.lua';
  const content = [
    'local menu = { name = "X4UiStaleCellCallback", layer = 1 }',
    'function menu.createFrame()',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(2, { width = 100, reserveScrollBar = false, scaling = false })',
    'local row = table:addRow(false, {})',
    'local anchorRow = table:addRow(false, {})',
    'anchorRow[1]:createText("Anchor")',
    'frame:display()',
    'end',
    'function menu.alternate()',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(1, { width = 100, reserveScrollBar = false, scaling = false })',
    'local row = table:addRow(false, {})',
    'row[1]:createText("Alternate")',
    'frame:display()',
    'end',
    '',
  ].join('\n');
  const original = sanitizeWorkspace({ ...workspace, id: 'stale-cell-callback', compileSettings: { ui: true }, passthroughFiles: [
    { path: 'ui.xml', content: `<addon name="callback"><environment type="menus"><file name="${path}" /><file name="${otherPath}" /></environment></addon>`, reason: 'partial' },
    { path, content, reason: 'partial' },
    { path: otherPath, content: content.replace('X4UiStaleCellCallback', 'X4UiOtherCamera'), reason: 'partial' },
  ] });
  const originalBytes = JSON.stringify(original);
  let currentWorkspace = original;
  const authorities: X4UiWorkspaceEditPendingAuthority[] = [];
  let submittedWorkspace: typeof original | undefined;
  let submissions = 0;
  let root: ReturnType<typeof createRoot> | undefined;
  const flush = async (operation: () => void): Promise<void> => {
    await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); });
  };
  const control = (id: string): MountedDomElement => {
    const element = mountedElementByTestId(container, id);
    assert.ok(element, `stale cell callback: missing ${id}`);
    return element;
  };
  const handler: X4UiWorkspaceEditHandler = request => {
    submissions += 1;
    assert.equal(request.expectedWorkspace, currentWorkspace, 'stale cell callback received the exact live workspace identity');
    submittedWorkspace = request.workspace as typeof original;
    const authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
    authorities.push(authority);
    return authority.submission;
  };
  const loader = async () => ({ core: fixture.core, color: fixture.color });
  const surfaceFactory = (width: number, height: number) => new MountedCanvasElement(doc, width, height);
  let changeViewScope: (value: string) => void = () => { throw new Error('camera parent not mounted'); };
  const Parent = (): React.ReactElement => {
    const [liveWorkspace] = React.useState(original);
    const [scope, setScope] = React.useState('focus-workspace-a');
    changeViewScope = setScope;
    currentWorkspace = liveWorkspace;
    return <X4UiSourceEditor workspace={liveWorkspace} workspaceScope={scope} corpusLoader={loader} surfaceFactory={surfaceFactory} onWorkspaceEdit={handler} />;
  };
  try {
    await flush(() => {
      root = createRoot(container as unknown as Element);
      root.render(<React.StrictMode><Parent /></React.StrictMode>);
    });
    await flush(() => {
      const select = control('x4-ui-source-selector');
      const option = select.options.find(candidate => candidate.textContent === path);
      assert.ok(option, 'stale cell callback source must be issued by the real owner catalog');
      select.value = option.value;
      select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    await flush(() => {
      const select = control('x4-ui-target-selector');
      const option = select.options.find(candidate => candidate.textContent === 'menu.createFrame');
      assert.ok(option, 'stale cell callback target must be issued by the real owner catalog');
      select.value = option.value;
      select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current', 'stale cell callback fixture must render a current canvas');
    const hierarchy = control('x4-ui-builder-hierarchy-list');
    // This event-only DOM has no layout engine. Supply measured viewport dimensions
    // for callback tests; real sizing, scrolling and pixels remain browser assertions.
    Object.defineProperties(control('x4-ui-canvas-scroll'), {
      clientWidth: { value: 640 }, clientHeight: { value: 320 },
      scrollLeft: { value: 0, writable: true }, scrollTop: { value: 0, writable: true },
    });
    assert.equal(control('x4-ui-canvas-focus-selection').disabled, true, 'no selection cannot focus the viewport');
    const frameForFocus = hierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Frame 1'));
    const textForFocus = hierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Text · Anchor'));
    assert.ok(frameForFocus); assert.ok(textForFocus);
    await flush(() => frameForFocus.click());
    assert.equal(control('x4-ui-canvas-focus-selection').disabled, false);
    const staleFocus = mountedReactClickCallback(control('x4-ui-canvas-focus-selection'), 'retained frame focus');
    await flush(() => textForFocus.click());
    const selectedZoomMode = (): string | undefined => control('x4-ui-canvas-zoom-mode').options.find(option => option.selected)?.value;
    assert.equal(selectedZoomMode(), 'fit-menu', 'ordinary selection never moves the camera');
    await flush(staleFocus);
    assert.equal(selectedZoomMode(), 'fit-menu', 'retained focus for another selection is refused');
    await flush(mountedReactClickCallback(control('x4-ui-canvas-focus-selection'), 'fresh text focus'));
    assert.equal(selectedZoomMode(), 'manual');
    assert.equal(mountedElementText(container, 'x4-ui-canvas-zoom-value'), '100% preview');
    assert.equal(submissions, 0, 'focus must never submit a source transaction');
    assert.equal(JSON.stringify(original), originalBytes);
    console.log('B119_MOUNTED_SELECTION_FOCUS PASS: disabled/no automatic pan/fresh focus/stale callback/source preservation');
    const choose = async (id: string, label: string): Promise<void> => flush(() => {
      const select = control(id);
      const option = select.options.find(candidate => candidate.textContent === label);
      assert.ok(option, `camera navigation option ${label}`);
      select.value = option.value;
      select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    const chooseNativeZoom = async (): Promise<void> => flush(() => {
      const select = control('x4-ui-canvas-zoom-mode');
      select.value = 'one-to-one';
      select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
    });
    await choose('x4-ui-target-selector', 'menu.createFrame');
    assert.equal(selectedZoomMode(), 'manual', 'same-menu selection keeps the working camera');
    await choose('x4-ui-target-selector', 'menu.alternate');
    assert.equal(selectedZoomMode(), 'fit-menu', 'different menu opens in its own overview');
    await chooseNativeZoom();
    await choose('x4-ui-inspect-target-selector', 'menu.createFrame');
    assert.equal(selectedZoomMode(), 'fit-menu', 'Inspect menu navigation uses the same camera reset');
    await chooseNativeZoom();
    await choose('x4-ui-source-selector', otherPath);
    assert.equal(selectedZoomMode(), 'fit-menu', 'different source opens in its own overview');
    await choose('x4-ui-target-selector', 'menu.createFrame');
    await choose('x4-ui-source-selector', path);
    await choose('x4-ui-target-selector', 'menu.createFrame');
    const freshAnchor = control('x4-ui-builder-hierarchy-list').querySelectorAll('button').find(element => element.textContent.startsWith('Text · Anchor'));
    assert.ok(freshAnchor);
    await flush(() => freshAnchor.click());
    const oldWorkspaceFocus = mountedReactClickCallback(control('x4-ui-canvas-focus-selection'), 'old workspace focus');
    await flush(oldWorkspaceFocus);
    assert.equal(selectedZoomMode(), 'manual');
    await flush(() => changeViewScope('focus-workspace-b'));
    assert.equal(selectedZoomMode(), 'fit-menu', 'another workspace cannot inherit the old focused camera');
    await flush(oldWorkspaceFocus);
    assert.equal(selectedZoomMode(), 'fit-menu', 'retained old-workspace focus remains refused');
    await flush(() => changeViewScope('focus-workspace-a'));
    assert.equal(selectedZoomMode(), 'fit-menu', 'returning workspace gets a valid overview, not a stale anchor');
    assert.equal(submissions, 0, 'view navigation never submits source transactions');
    assert.equal(JSON.stringify(original), originalBytes);
    console.log('B119_MOUNTED_CAMERA_NAVIGATION PASS: source/menu/Inspect/workspace overview, same-menu stability and stale focus refusal');
    const firstCell = hierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Cell 1'));
    const secondCell = hierarchy.querySelectorAll('button').find(element => element.textContent.startsWith('Cell 2'));
    assert.ok(firstCell, 'stale cell callback fixture must expose Cell 1');
    assert.ok(secondCell, 'stale cell callback fixture must expose Cell 2');
    await flush(() => firstCell.click());
    const addText = mountedElementByTestId(container, 'x4-ui-contextual-palette-add-text');
    const selectedAfterFirstClick = hierarchy.querySelectorAll('button').find(element => element.getAttribute('aria-pressed') === 'true');
    assert.ok(addText, `the current Cell 1 must expose its contextual Add control; hierarchy=${JSON.stringify(hierarchy.querySelectorAll('button').map(element => element.textContent))}; selected=${selectedAfterFirstClick?.getAttribute('data-testid')}`);
    assert.equal(addText.disabled, false, 'the current Cell 1 palette callback must be enabled');
    const retainedCallback = mountedReactClickCallback(addText, 'retained Cell 1 palette callback');
    const beforeWorkspace = currentWorkspace;
    const beforeBytes = JSON.stringify(currentWorkspace);
    await flush(() => secondCell.click());
    const selectedCell = hierarchy.querySelectorAll('button').find(element => element.getAttribute('aria-pressed') === 'true');
    assert.equal(selectedCell?.getAttribute('data-testid'), secondCell.getAttribute('data-testid'), 'the live selection must move to Cell 2 before invoking the retained callback');
    await flush(retainedCallback);
    assert.equal(submissions, 0, `a retained Cell 1 callback must not submit into Cell 1; submissions=${submissions}; authorities=${authorities.length}`);
    assert.equal(currentWorkspace, beforeWorkspace, 'a retained stale-cell callback must preserve workspace identity');
    assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'a retained stale-cell callback must preserve exact source bytes');
    const freshAddText = control('x4-ui-contextual-palette-add-text');
    assert.equal(freshAddText.disabled, false, 'the freshly rendered Cell 2 palette callback must remain enabled');
    const freshCallback = mountedReactClickCallback(freshAddText, 'fresh Cell 2 palette callback');
    await flush(freshCallback);
    assert.equal(submissions, 1, 'the fresh Cell 2 callback must submit exactly one owner transaction');
    assert.ok(submittedWorkspace, 'the fresh Cell 2 callback must provide the owner-issued replacement workspace');
    const submittedSource = submittedWorkspace.passthroughFiles.find(file => file.path === path)?.content;
    assert.ok(submittedSource, 'the fresh Cell 2 callback must retain the edited source file');
    assert.notEqual(submittedSource, content, 'the fresh Cell 2 callback must change source bytes');
    assert.match(submittedSource, /row\[2\].*New text/, 'the fresh Cell 2 callback must insert the widget into Cell 2 source');
    assert.doesNotMatch(submittedSource, /row\[1\].*New text/, 'the fresh Cell 2 callback must not insert the widget into Cell 1 source');
    assert.equal(JSON.stringify(original), originalBytes, 'the stale-cell probe must not mutate the original workspace');
    console.log('B119_SOURCE_EDITOR_STALE_CELL_CALLBACK_PROBE PASS: retained Cell 1 Add callback refused after exact Cell 2 selection; fresh Cell 2 callback submitted one exact source transaction');
  } finally {
    if (root !== undefined) await flush(() => root?.unmount());
    restore();
  }
}

async function runMountedSourceEditorCallbackDiscardRegression(fixture: P7SourceAuthorityFixture): Promise<void> {
  const scenarios = [
    'exact-current-discard', 'pending-property-draft', 'pending-transaction', 'changed-cell',
    'changed-source', 'changed-profile', 'changed-workspace', 'stale-discard-newer-draft', 'delayed-ack',
    'row-refused', 'row-stale-descendant', 'row-delayed-selection',
  ] as const;
  const failures: { scenario: typeof scenarios[number]; detail: string }[] = [];
  const sourcePath = 'ui/callback-safety.lua';
  const secondarySourcePath = 'ui/callback-secondary.lua';
  const sourceFor = (menuName: string, first: string, second: string): string => [
    `local menu = { name = ${JSON.stringify(menuName)}, layer = 1 }`,
    'function menu.createFrame()',
    'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80 })',
    'local table = frame:addTable(2, { width = 100, reserveScrollBar = false, scaling = false })',
    'local firstRow = table:addRow(false, {})',
    `firstRow[1]:createText(${JSON.stringify(first)})`,
    'local secondRow = table:addRow(false, {})',
    `secondRow[1]:createText(${JSON.stringify(second)})`,
    'frame:display()',
    'end',
    '',
  ].join('\n');

  for (const scenario of scenarios) {
    const doc = new MountedDomDocument();
    const restore = installMountedDomGlobals(doc);
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    const original = sanitizeWorkspace({ ...workspace, id: `callback-discard-${scenario}`, compileSettings: { ui: true }, passthroughFiles: [
      {
        path: 'ui.xml',
        content: `<addon name="callback"><environment type="menus"><file name="${sourcePath}" /><file name="${secondarySourcePath}" /></environment></addon>`,
        reason: 'partial',
      },
      { path: sourcePath, content: sourceFor('X4UiCallbackSafety', 'First', 'Second'), reason: 'partial' },
      { path: secondarySourcePath, content: sourceFor('X4UiCallbackSecondary', 'Secondary', 'Other'), reason: 'partial' },
    ] });
    const originalBytes = JSON.stringify(original);
    const switched = sanitizeWorkspace({ ...original, id: `callback-discard-switched-${scenario}` });
    let currentWorkspace: typeof original = original;
    let replaceWorkspace: React.Dispatch<React.SetStateAction<typeof original>> = () => { throw new Error('callback/Discard parent is not mounted'); };
    const authorities: X4UiWorkspaceEditPendingAuthority[] = [];
    let submissions = 0;
    let root: ReturnType<typeof createRoot> | undefined;
    const flush = async (operation: () => void): Promise<void> => {
      await act(async () => { operation(); await Promise.resolve(); await Promise.resolve(); });
    };
    const control = (id: string): MountedDomElement => {
      const element = mountedElementByTestId(container, id);
      assert.ok(element, `${scenario}: missing ${id}`);
      return element;
    };
    const selectSource = async (path: string): Promise<void> => {
      await flush(() => {
        const select = control('x4-ui-source-selector');
        const option = select.options.find(candidate => candidate.textContent === path);
        assert.ok(option, `${scenario}: source ${path} was not issued by the current owner catalog`);
        select.value = option.value;
        select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
      });
    };
    const selectTarget = async (): Promise<void> => {
      await flush(() => {
        const select = control('x4-ui-target-selector');
        const option = select.options.find(candidate => candidate.textContent === 'menu.createFrame');
        assert.ok(option, `${scenario}: menu.createFrame was not issued by the current owner catalog`);
        select.value = option.value;
        select.dispatchEvent(new MountedDomEvent('change', { bubbles: true }));
      });
    };
    const selectNode = async (labelPrefix: string): Promise<MountedDomElement> => {
      const node = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
        .find(element => element.textContent.startsWith(labelPrefix));
      assert.ok(node, `${scenario}: hierarchy node ${labelPrefix} was not issued`);
      await flush(() => node.click());
      return node;
    };
    const selectedNodeId = (): string => {
      const selected = control('x4-ui-builder-hierarchy-list').querySelectorAll('button')
        .find(element => element.getAttribute('aria-pressed') === 'true');
      const id = selected?.getAttribute('data-testid');
      assert.ok(id, `${scenario}: exact selected builder node was not retained`);
      return id;
    };
    const stageText = async (expected: string, raw: string): Promise<string> => {
      const input = control('x4-ui-builder-selection').querySelectorAll('input').find(element => element.value === expected);
      assert.ok(input, `${scenario}: editable Text literal ${expected} was not retained`);
      const entryId = input.getAttribute('data-testid')?.slice('x4-ui-source-edit-input-'.length);
      assert.ok(entryId, `${scenario}: staged Text literal did not expose an owner-issued entry id`);
      await flush(() => {
        input.focus();
        input.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
        input.value = raw;
        input.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
        input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
      });
      assert.equal(input.value, raw, `${scenario}: staged Text literal was not retained locally`);
      return entryId;
    };
    const applyCallback = (entryId: string, detail: string): (() => void) =>
      mountedReactClickCallback(control(`x4-ui-source-edit-apply-${entryId}`), detail);
    const discardCallback = (detail: string): (() => void) =>
      mountedReactClickCallback(control('x4-ui-builder-source-edit-discard'), detail);
    const invokeCallback = async (callback: () => void): Promise<void> => { await flush(callback); };
    const assertNoWrite = (beforeWorkspace: typeof original, beforeBytes: string, beforeSelection: string, detail: string): void => {
      assert.equal(submissions, 0, `${scenario}: ${detail} submitted an unexpected workspace edit`);
      assert.equal(currentWorkspace, beforeWorkspace, `${scenario}: ${detail} changed workspace identity`);
      assert.equal(JSON.stringify(currentWorkspace), beforeBytes, `${scenario}: ${detail} changed exact source bytes`);
      assert.equal(selectedNodeId(), beforeSelection, `${scenario}: ${detail} changed exact builder selection`);
    };
    const handler: X4UiWorkspaceEditHandler = request => {
      submissions += 1;
      assert.equal(request.expectedWorkspace, currentWorkspace, `${scenario}: callback received the exact live workspace identity`);
      if (scenario === 'row-refused') return { status: 'refused', reason: 'stale-parent-workspace', detail: 'row action refused by the existing parent owner' };
      const authority = createX4UiWorkspaceEditPending(request.expectedWorkspace, request.workspace);
      authorities.push(authority);
      return authority.submission;
    };
    const loader = async () => ({ core: fixture.core, color: fixture.color });
    const surfaceFactory = (width: number, height: number) => new MountedCanvasElement(doc, width, height);
    const Parent = (): React.ReactElement => {
      const [live, setLive] = React.useState(original);
      currentWorkspace = live;
      replaceWorkspace = update => setLive(previous => {
        const candidate = typeof update === 'function' ? update(previous) : update;
        return retainWorkspaceCandidateIfNormalizedUnchanged(candidate, sanitizeWorkspace(candidate));
      });
      return <X4UiSourceEditor workspace={live} corpusLoader={loader} surfaceFactory={surfaceFactory} onWorkspaceEdit={handler} />;
    };

    try {
      await flush(() => {
        root = createRoot(container as unknown as Element);
        root.render(<React.StrictMode><Parent /></React.StrictMode>);
      });
      await selectSource(sourcePath);
      await selectTarget();
      assert.equal(mountedElementText(container, 'x4-ui-canvas-status'), 'rendered/current', `${scenario}: callback fixture must render a current canvas`);

      if (scenario === 'exact-current-discard') {
        await selectNode('Text · First');
        const entryId = await stageText('First', 'exact discard draft');
        const discard = discardCallback('exact current Discard');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(discard);
        assert.equal(submissions, 0, 'exact current Discard must not submit a workspace edit');
        assert.equal(currentWorkspace, beforeWorkspace, 'exact current Discard must preserve the live workspace identity');
        assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'exact current Discard must preserve exact source bytes');
        assert.equal(selectedNodeId(), beforeSelection, 'exact current Discard must preserve exact builder selection');
        assert.equal(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'First'), true, 'exact current Discard must clear only the local staged value');
        assert.equal(control(`x4-ui-source-edit-apply-${entryId}`).disabled, true, 'exact current Discard must leave Apply disabled with no staged value');
      }

      if (scenario === 'pending-property-draft') {
        await selectNode('Text · First');
        await stageText('First', 'pending property draft');
        await selectNode('Cell 2');
        const addText = control('x4-ui-contextual-palette-add-text');
        assert.equal(addText.disabled, true, 'a staged property draft must disable contextual insertion in the real markup');
        const callback = mountedReactClickCallback(addText, 'pending property draft Add callback');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(callback);
        assertNoWrite(beforeWorkspace, beforeBytes, beforeSelection, 'property-draft Add callback');
        await selectNode('Text · First');
        assert.equal(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'pending property draft'), true, 'direct Add refusal must preserve the staged property draft');
      }

      if (scenario === 'pending-transaction') {
        await selectNode('Text · First');
        const entryId = await stageText('First', 'pending transaction draft');
        const apply = applyCallback(entryId, 'pending transaction Apply callback');
        const discard = discardCallback('pending transaction Discard callback');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        await invokeCallback(apply);
        assert.equal(submissions, 1, 'the first direct Apply callback must submit exactly one transaction');
        assert.ok(authorities[0], 'the pending direct Apply callback must retain the existing acknowledgement owner');
        assert.match(mountedElementText(container, 'x4-ui-source-edit-receipt'), /^Saving the selected value through the source owner/);
        await selectNode('Cell 2');
        const pendingAddText = control('x4-ui-contextual-palette-add-text');
        assert.equal(pendingAddText.disabled, true, 'a pending transaction must disable the freshly rendered Cell 2 Add callback');
        const pendingAddCallback = mountedReactClickCallback(pendingAddText, 'pending transaction fresh Add callback');
        const pendingCellSelection = selectedNodeId();
        await invokeCallback(pendingAddCallback);
        assert.equal(submissions, 1, 'a pending transaction Add callback must not submit a second workspace edit');
        assert.equal(currentWorkspace, beforeWorkspace, 'a pending transaction Add callback must preserve workspace identity');
        assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'a pending transaction Add callback must preserve exact source bytes');
        assert.equal(selectedNodeId(), pendingCellSelection, 'a pending transaction Add callback must preserve the current Cell 2 selection');
        assert.match(mountedElementText(container, 'x4-ui-contextual-palette-status'), /^Saving your change/, 'a pending transaction Add callback must preserve the pending receipt');
        const pendingAddRow = control('x4-ui-contextual-palette-add-row');
        assert.equal(pendingAddRow.disabled, true, 'a pending transaction must disable the freshly rendered Add row callback');
        const pendingAddRowCallback = mountedReactClickCallback(pendingAddRow, 'pending transaction fresh Add row callback');
        await invokeCallback(pendingAddRowCallback);
        assert.equal(submissions, 1, 'a pending transaction Add row callback must not submit a second workspace edit');
        assert.equal(currentWorkspace, beforeWorkspace, 'a pending transaction Add row callback must preserve workspace identity');
        assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'a pending transaction Add row callback must preserve exact source bytes');
        assert.equal(selectedNodeId(), pendingCellSelection, 'a pending transaction Add row callback must preserve the current Cell 2 selection');
        await invokeCallback(apply);
        await invokeCallback(discard);
        assert.equal(submissions, 1, 'pending transaction callbacks must not submit a second workspace edit');
        assert.equal(currentWorkspace, beforeWorkspace, 'pending transaction callbacks must preserve workspace identity before acknowledgement');
        assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'pending transaction callbacks must preserve exact source bytes before acknowledgement');
        assert.equal(selectedNodeId(), pendingCellSelection, 'pending transaction callbacks must preserve the current Cell 2 selection');
      }

      if (scenario === 'row-refused') {
        await selectNode('Row 1');
        const addRow = control('x4-ui-contextual-palette-add-row');
        assert.equal(addRow.disabled, false, 'an exact current row must expose an enabled Add row callback');
        const callback = mountedReactClickCallback(addRow, 'refused Add row callback');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(callback);
        assert.equal(submissions, 1, 'a refused Add row callback must reach the existing parent owner once');
        assert.equal(currentWorkspace, beforeWorkspace, 'a refused Add row must preserve workspace identity');
        assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'a refused Add row must preserve exact source bytes');
        assert.equal(selectedNodeId(), beforeSelection, 'a refused Add row must preserve exact row selection');
        assert.match(mountedElementText(container, 'x4-ui-contextual-palette-refusal'), /could not be saved/);
      }

      if (scenario === 'row-stale-descendant') {
        await selectNode('Row 1');
        const callback = mountedReactClickCallback(control('x4-ui-contextual-palette-add-row'), 'stale Add row callback after descendant selection');
        await selectNode('Text · Second');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(callback);
        assertNoWrite(beforeWorkspace, beforeBytes, beforeSelection, 'stale Add row callback after descendant selection');
      }

      if (scenario === 'row-delayed-selection') {
        await selectNode('Row 1');
        const callback = mountedReactClickCallback(control('x4-ui-contextual-palette-add-row'), 'delayed Add row callback');
        await invokeCallback(callback);
        assert.equal(submissions, 1, 'delayed Add row acknowledgement must start one transaction');
        const authority = authorities[0];
        assert.ok(authority, 'delayed Add row must retain the existing acknowledgement owner');
        const replacement = authority.submission.workspace as typeof original;
        await selectNode('Text · Second');
        await flush(() => replaceWorkspace(replacement));
        await selectSource(sourcePath);
        await selectTarget();
        await selectNode('Text · Second');
        const beforeSelection = selectedNodeId();
        const beforeBytes = JSON.stringify(currentWorkspace);
        await flush(() => { authority.acknowledge(replacement); });
        assert.equal(submissions, 1, 'a late Add row acknowledgement must not submit a second workspace edit');
        assert.equal(currentWorkspace, replacement, 'a late Add row acknowledgement must retain the exact parent replacement');
        assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'a late Add row acknowledgement must preserve the accepted replacement bytes');
        assert.equal(selectedNodeId(), beforeSelection, 'a late Add row acknowledgement must preserve the newer descendant selection');
      }

      if (scenario === 'changed-cell') {
        await selectNode('Cell 2');
        const addText = control('x4-ui-contextual-palette-add-text');
        assert.equal(addText.disabled, false, 'an exact current empty cell must expose an enabled contextual Add callback');
        const callback = mountedReactClickCallback(addText, 'stale selected-cell Add callback');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        await selectNode('Text · Second');
        const beforeSelection = selectedNodeId();
        await invokeCallback(callback);
        assertNoWrite(beforeWorkspace, beforeBytes, beforeSelection, 'stale selected-cell Add callback');
      }

      if (scenario === 'changed-source') {
        await selectNode('Text · First');
        const oldEntryId = await stageText('First', 'stale source draft');
        const oldApply = applyCallback(oldEntryId, 'stale source Apply callback');
        await selectSource(secondarySourcePath);
        await selectTarget();
        await selectNode('Text · Secondary');
        await stageText('Secondary', 'secondary newer draft');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(oldApply);
        assertNoWrite(beforeWorkspace, beforeBytes, beforeSelection, 'stale source Apply callback');
        assert.equal(control('x4-ui-source-selector').options.find(option => option.selected && option.textContent === secondarySourcePath)?.selected, true, 'stale source Apply callback must not adopt the old source');
        assert.equal(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'secondary newer draft'), true, 'stale source Apply callback must preserve the newer draft');
      }

      if (scenario === 'changed-profile') {
        await selectNode('Text · First');
        const oldEntryId = await stageText('First', 'stale profile draft');
        const oldApply = applyCallback(oldEntryId, 'stale profile Apply callback');
        await flush(() => {
          const input = control('x4-ui-profile-width');
          input.focus();
          input.dispatchEvent(new MountedDomEvent('focusin', { bubbles: true }));
          input.value = '1024';
          input.dispatchEvent(new MountedDomEvent('propertychange', { propertyName: 'value' }));
          input.dispatchEvent(new MountedDomEvent('change', { bubbles: true, cancelable: true }));
        });
        assert.match(mountedElementText(container, 'x4-ui-profile-inspect'), /1024/, 'profile callback fixture must observe the changed profile');
        await selectNode('Text · First');
        await stageText('First', 'profile newer draft');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(oldApply);
        assertNoWrite(beforeWorkspace, beforeBytes, beforeSelection, 'stale profile Apply callback');
        assert.equal(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'profile newer draft'), true, 'stale profile Apply callback must preserve the newer draft');
      }

      if (scenario === 'changed-workspace') {
        await selectNode('Text · First');
        const oldEntryId = await stageText('First', 'stale workspace draft');
        const oldApply = applyCallback(oldEntryId, 'stale workspace Apply callback');
        await flush(() => replaceWorkspace(switched));
        assert.equal(currentWorkspace, switched, 'workspace callback fixture must adopt the exact replacement identity');
        await selectSource(sourcePath);
        await selectTarget();
        await selectNode('Text · First');
        await stageText('First', 'workspace newer draft');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(oldApply);
        assertNoWrite(beforeWorkspace, beforeBytes, beforeSelection, 'stale workspace Apply callback');
        assert.equal(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'workspace newer draft'), true, 'stale workspace Apply callback must preserve the newer draft');
      }

      if (scenario === 'stale-discard-newer-draft') {
        await selectNode('Text · First');
        await stageText('First', 'old discard draft');
        const oldDiscard = discardCallback('stale Discard after newer draft');
        await selectNode('Text · Second');
        await stageText('Second', 'newer discard draft');
        const beforeWorkspace = currentWorkspace;
        const beforeBytes = JSON.stringify(currentWorkspace);
        const beforeSelection = selectedNodeId();
        await invokeCallback(oldDiscard);
        assertNoWrite(beforeWorkspace, beforeBytes, beforeSelection, 'stale Discard callback');
        assert.equal(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'newer discard draft'), true, 'stale Discard callback must preserve the newer draft');
      }

      if (scenario === 'delayed-ack') {
        await selectNode('Text · First');
        const entryId = await stageText('First', 'delayed accepted value');
        const oldApply = applyCallback(entryId, 'delayed acknowledgement Apply callback');
        const oldDiscard = discardCallback('delayed acknowledgement Discard callback');
        await invokeCallback(oldApply);
        assert.equal(submissions, 1, 'delayed acknowledgement must start one transaction');
        const authority = authorities[0];
        assert.ok(authority, 'delayed acknowledgement must retain the existing acknowledgement owner');
        const replacement = authority.submission.workspace as typeof original;
        await flush(() => replaceWorkspace(replacement));
        await selectSource(sourcePath);
        await selectTarget();
        await selectNode('Text · delayed accepted value');
        await stageText('delayed accepted value', 'newer after delayed ack');
        const beforeSelection = selectedNodeId();
        const beforeBytes = JSON.stringify(currentWorkspace);
        await invokeCallback(oldDiscard);
        await flush(() => { authority.acknowledge(replacement); });
        await invokeCallback(oldApply);
        assert.equal(submissions, 1, 'delayed acknowledgement and stale callbacks must not submit a second transaction');
        assert.equal(currentWorkspace, replacement, 'delayed acknowledgement must retain the exact parent replacement identity');
        assert.equal(JSON.stringify(currentWorkspace), beforeBytes, 'delayed acknowledgement must preserve replacement source bytes after the newer draft');
        assert.equal(selectedNodeId(), beforeSelection, 'delayed acknowledgement must preserve the newer exact selection');
        assert.equal(control('x4-ui-builder-selection').querySelectorAll('input').some(input => input.value === 'newer after delayed ack'), true, 'delayed acknowledgement must preserve the newer draft');
      }
    } catch (error) {
      failures.push({ scenario, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      assert.equal(JSON.stringify(original), originalBytes, `${scenario}: original workspace must remain immutable`);
      if (root !== undefined) await flush(() => root?.unmount());
      restore();
    }
  }
  console.log(`B119_SOURCE_EDITOR_DIRECT_CALLBACK_DISCARD_MATRIX ${JSON.stringify({ total: scenarios.length, passed: scenarios.length - failures.length, red: failures })}`);
  assert.deepEqual(failures, [], 'direct SourceEditor callback and Discard safety must preserve current state and exact source bytes');
}

async function recordP7SourceRow(
  name: string,
  fixtureReady: boolean,
  expected: string,
  invoke: () => unknown | Promise<unknown>,
  accepts: (observed: unknown) => boolean,
): Promise<void> {
  let threw = false;
  let observed: unknown;
  try {
    observed = await invoke();
  } catch (error) {
    threw = true;
    observed = { error: error instanceof Error ? error.message : String(error) };
  }
  p7SourceRows.push({ name, fixtureReady, threw, expected, observed, pass: fixtureReady && !threw && accepts(observed) });
}

async function runP7SourceEditorCanonicalColorMatrix(): Promise<void> {
  let fixture: P7SourceAuthorityFixture | undefined;
  let fixtureError: string | undefined;
  try {
    fixture = await loadP7SourceAuthorities();
  } catch (error) {
    fixtureError = error instanceof Error ? error.message : String(error);
  }
  const core = fixture?.core;
  const color = fixture?.color;
  const fixtureReady = fixture !== undefined;

  if (process.env.X4_UI_SOURCE_EDITOR_SCENARIO_ONLY === '1') {
    if (!fixture) throw new Error(fixtureError ?? 'Scenario fixture unavailable');
    await runMountedPreviewScenarioHistoryRegression(fixture);
    return;
  }

  await recordP7SourceRow(
    'B119 mounted delimiter-heavy real target does not reset when owner projection renumbers it',
    true,
    'the mounted SourceEditor owner/selection path accepts the exact aic_menu.lua menu.display target key, then retains its target selection and owner-issued source identity when a parent/workspace rerender changes only the positional target prefix',
    runMountedDelimiterTargetReconciliationRegression,
    observed => {
      const receipt = p7SourceRecord(observed);
      return receipt?.requestedTargetKey === '12:target:ui/addons/ai_influence_chat/aic_menu.lua||8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD|function|ui/addons/ai_influence_chat/aic_menu.lua||315:0:16768|893:3:53651:function'
        && receipt.replacementTargetKey === receipt.requestedTargetKey.replace(/^12:/, '13:')
        && receipt.targetSelectValueBeforeProjection === receipt.requestedTargetKey
        && receipt.targetSelectValueAfterProjection === receipt.replacementTargetKey
        && receipt.targetOptionAfterProjection === receipt.replacementTargetKey
        && receipt.selectedPath === 'ui/addons/ai_influence_chat/aic_menu.lua'
        && receipt.selectedTargetId === 'target:ui/addons/ai_influence_chat/aic_menu.lua||8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD|function|ui/addons/ai_influence_chat/aic_menu.lua||315:0:16768|893:3:53651'
        && receipt.targetResetObserved === false
        && receipt.targetRetained === true;
    },
  );

  await recordP7SourceRow(
    'P12 mounted profile-only edit does not invoke provisional candidate projection',
    true,
    'the actual mounted owner/candidate memo builds one owner/catalog initially, performs no provisional project call, does not rebuild or rediscover candidates for a profile-only or same-workspace parent rerender, and rebuilds one owner/catalog for a new workspace identity',
    runMountedCandidateProjectionRegression,
    observed => {
      const receipt = p7SourceRecord(observed);
      return receipt?.initialOwnerBuilds === 1
        && receipt.initialCandidateCatalogBuilds === 1
        && receipt.initialCandidateMaterializations === 1
        && receipt.initialProvisionalProjectionCalls === 0
        && receipt.profileOnlyOwnerBuilds === 0
        && receipt.profileOnlyCandidateCatalogBuilds === 0
        && receipt.profileOnlyCandidateMaterializations === 0
        && receipt.profileOnlyProvisionalProjectionCalls === 0
        && receipt.sameWorkspaceParentOwnerBuilds === 0
        && receipt.sameWorkspaceParentCandidateCatalogBuilds === 0
        && receipt.sameWorkspaceParentCandidateMaterializations === 0
        && receipt.sameWorkspaceParentProvisionalProjectionCalls === 0
        && receipt.newWorkspaceOwnerBuilds === 1
        && receipt.newWorkspaceCandidateCatalogBuilds === 1
        && receipt.newWorkspaceCandidateMaterializations === 1
        && receipt.newWorkspaceProvisionalProjectionCalls === 0
        && receipt.selectedPath === 'ui/candidate-profile-independent.lua'
        && receipt.selectedTargetId === 'candidate-target';
    },
  );

  await recordP7SourceRow(
    'P11 mounted preview-loop control retains accepted values across React reconciliation',
    fixtureReady,
    'the mounted owner-issued loop control starts empty, accepts 4, retains 4 after the controlled projection/effect and parent rerender, refuses 0 without replacing 4, resets to empty, and remains Not verified in game',
    async () => {
      if (fixture === undefined) throw new Error(fixtureError ?? 'SourceEditor P11 mounted loop fixture unavailable');
      return runMountedPreviewLoopStateRegression(fixture);
    },
    observed => {
      const receipt = p7SourceRecord(observed);
      return receipt?.initialLoopValue === ''
        && receipt.immediateLoopValue === '4'
        && receipt.settledLoopValue === '4'
        && receipt.acceptedLoopIterationCount === 4
        && receipt.invalidLoopValue === '4'
        && receipt.invalidLoopIterationCount === 4
        && receipt.resetLoopValue === ''
        && receipt.resetLoopIterationCount === null
        && receipt.loopGameTruth === 'Not verified in game'
        && typeof receipt.parentReconciliations === 'number'
        && receipt.parentReconciliations >= 2;
    },
  );

  await recordP7SourceRow(
    'B119 mounted sample draft stages all issued values before one explicit Apply',
    fixtureReady,
    'the mounted editor stages all 31 sample controls without a projection or canvas/export change, Apply creates one new projection, invalid input is refused without replacing accepted state, Reset discards the draft while preserving the permanent preview truth boundary, and the parent observer produces no render-phase state-update warning',
    async () => {
      if (fixture === undefined) throw new Error(fixtureError ?? 'SourceEditor B119 sample draft fixture unavailable');
      return runMountedSampleDraftBatchRegression(fixture);
    },
    observed => {
      const receipt = p7SourceRecord(observed);
      const staged = Array.isArray(receipt?.stagedControlValues) ? receipt.stagedControlValues : [];
      const applied = Array.isArray(receipt?.appliedControlValues) ? receipt.appliedControlValues : [];
      const initialProjectionCount = p7SourceNumber(receipt, 'initialProjectionCount');
      const stagedProjectionCount = p7SourceNumber(receipt, 'stagedProjectionCount');
      const appliedProjectionCount = p7SourceNumber(receipt, 'appliedProjectionCount');
      const invalidProjectionCount = p7SourceNumber(receipt, 'invalidProjectionCount');
      return receipt?.issuedSampleCount === 31
        && initialProjectionCount !== undefined
        && stagedProjectionCount !== undefined
        && appliedProjectionCount !== undefined
        && invalidProjectionCount !== undefined
        && initialProjectionCount > 0
        && stagedProjectionCount === initialProjectionCount
        && appliedProjectionCount === initialProjectionCount + 1
        && invalidProjectionCount === appliedProjectionCount
        && staged.length === 31
        && applied.length === 31
        && staged.some(value => value === ' exact value 1 ')
        && applied.some(value => value === ' exact value 1 ')
        && receipt.canvasRetainedWhileStaged === true
        && receipt.exportRetainedWhileStaged === true
        && typeof receipt.stagedLabel === 'string'
        && receipt.stagedLabel.includes('staged')
        && receipt.appliedLabel === 'currently applied preview values remain active while edits are staged; staged edits take effect only after explicit Apply.'
        && receipt.invalidControlValue === 'not-a-number'
        && receipt.invalidAcceptedControlValue === '120'
        && receipt.resetControlValue === '120'
        && typeof receipt.refusal === 'string'
        && receipt.refusal.length > 0
        && receipt.previewOnly === 'Preview only'
        && receipt.gameTruth === 'Not verified in game'
        && Array.isArray(receipt.renderPhaseStateUpdateWarnings)
        && receipt.renderPhaseStateUpdateWarnings.length === 0;
    },
  );

  await recordP7SourceRow(
    'P10 mounted portable three-menu pipeline_test source and target transitions commit the current canvas',
    fixtureReady,
    'the inline source-derived hash is selected from no selection, menuA.createFrame commits a current replacement canvas with exact export identity, a non-renderable handler transition does not poison the later menuA.createFrame commit, and the permanent game-truth boundary remains visible',
    async () => {
      if (fixture === undefined) throw new Error(fixtureError ?? 'SourceEditor P10 portable pipeline_test fixture unavailable');
      return runMountedExactPipelineTestTransitionRegression(fixture);
    },
    observed => {
      const receipt = p7SourceRecord(observed);
      const fixtureHash = p7SourceString(receipt, 'fixtureHash');
      const initialCanvasDetail = p7SourceString(receipt, 'initialCanvasDetail');
      const sourceOnlyCanvasDetail = p7SourceString(receipt, 'sourceOnlyCanvasDetail');
      const targetOptionValue = p7SourceString(receipt, 'targetOptionValue');
      const targetCanvasDetail = p7SourceString(receipt, 'targetCanvasDetail');
      const targetExportStatus = p7SourceString(receipt, 'targetExportStatus');
      const targetSourceIdentity = p7SourceString(receipt, 'targetSourceIdentity');
      const targetMetadata = p7SourceString(receipt, 'targetMetadata');
      const targetSceneStatus = p7SourceString(receipt, 'targetSceneStatus');
      const handlerOptionValue = p7SourceString(receipt, 'handlerOptionValue');
      const handlerCanvasDetail = p7SourceString(receipt, 'handlerCanvasDetail');
      const handlerExportStatus = p7SourceString(receipt, 'handlerExportStatus');
      const handlerTargetMetadata = p7SourceString(receipt, 'handlerTargetMetadata');
      const restoredCanvasDetail = p7SourceString(receipt, 'restoredCanvasDetail');
      const restoredExportStatus = p7SourceString(receipt, 'restoredExportStatus');
      const parentReconciliations = p7SourceNumber(receipt, 'parentReconciliations');
      const parentCallbackNotifications = p7SourceNumber(receipt, 'parentCallbackNotifications');
      return fixtureHash !== undefined
        && /^[A-F0-9]{64}$/.test(fixtureHash)
        && receipt.initialCanvasStatus === 'refused'
        && initialCanvasDetail?.includes('exact source index/path/identity and target ID/range are required') === true
        && receipt.sourceOnlyCanvasStatus === 'refused'
        && sourceOnlyCanvasDetail?.includes('exact source index/path/identity and target ID/range are required') === true
        && targetOptionValue !== undefined
        && targetOptionValue.length > 0
        && receipt.targetCanvasStatus === 'rendered/current'
        && receipt.targetCanvasMounted === true
        && receipt.targetCanvasReplaced === true
        && targetCanvasDetail?.includes('Not verified in game') === true
        && receipt.targetExportDisabled === false
        && targetExportStatus === 'ready · native PNG export uses the mounted current canvas'
        && targetSourceIdentity?.includes('ui/pipeline_test.lua') === true
        && targetSourceIdentity?.includes(fixtureHash) === true
        && targetMetadata?.includes('menuA.createFrame') === true
        && targetSceneStatus === 'partial'
        && handlerOptionValue !== undefined
        && handlerOptionValue.length > 0
        && (receipt.handlerCanvasStatus === 'stale' || receipt.handlerCanvasStatus === 'refused')
        && receipt.handlerCanvasMounted === true
        && handlerCanvasDetail?.includes('Not verified in game') === true
        && handlerExportStatus === 'unavailable · Current rendered canvas evidence is unavailable or stale.'
        && handlerTargetMetadata?.includes('handlers.onClick') === true
        && receipt.restoredCanvasStatus === 'rendered/current'
        && receipt.restoredCanvasMounted === true
        && receipt.restoredCanvasReplaced === true
        && restoredCanvasDetail?.includes('Not verified in game') === true
        && receipt.restoredExportDisabled === false
        && restoredExportStatus === 'ready · native PNG export uses the mounted current canvas'
        && parentReconciliations !== undefined
        && parentReconciliations >= 4
        && parentCallbackNotifications === 2
        && p7SourceString(receipt, 'gameTruth') === 'Preview evidence only · Not verified in game';
    },
  );

  await recordP7SourceRow(
    'P9 mounted large-source menu.display target survives controlled React reconciliation',
    fixtureReady,
    'the exact aic_menu.lua source exposes a large owner-issued target catalog; selecting menu.display through the mounted controlled select survives the parent reconciliation rerender, retains the byte-identical option value, produces a non-empty target, and keeps the branch-path preview attached to that target',
    async () => {
      if (fixture === undefined) throw new Error(fixtureError ?? 'SourceEditor P9 canonical fixture unavailable');
      return runMountedLargeSourceTargetSelectionRegression(fixture);
    },
    observed => {
      const receipt = p7SourceRecord(observed);
      return typeof receipt?.sourcePath === 'string'
        && receipt.sourcePath.includes('ui/addons/ai_influence_chat/aic_menu.lua')
        && typeof receipt.targetOptionCount === 'number'
        && receipt.targetOptionCount >= 90
        && typeof receipt.targetOptionValueBefore === 'string'
        && receipt.targetOptionValueBefore.length > 0
        && receipt.targetOptionValueBefore.startsWith('12:target:ui/addons/ai_influence_chat/aic_menu.lua||')
        && receipt.targetOptionValueBefore.includes('|function|ui/addons/ai_influence_chat/aic_menu.lua||')
        && receipt.targetOptionValueBefore.endsWith(':function')
        && receipt.targetOptionValueAfter === receipt.targetOptionValueBefore
        && receipt.targetSelectValue === receipt.targetOptionValueBefore
        && receipt.targetRetained === true
        && receipt.transientTargetOptionValue === ''
        && receipt.transientTargetSelectRawValue === receipt.targetOptionValueBefore
        && receipt.transientTargetSelectValue === ''
        && receipt.transientTargetSelectText === 'Select menu…'
        && receipt.transientProjectionRefused === true
        && typeof receipt.targetMetadata === 'string'
        && receipt.targetMetadata.includes('menu.display')
        && receipt.canvasStatus === 'rendered/current'
        && typeof receipt.canvasDetail === 'string'
        && !receipt.canvasDetail.includes('exact source index/path/identity and target ID/range are required')
        && receipt.canvasExportDisabled === false
        && receipt.canvasExportStatus === 'ready · native PNG export uses the mounted current canvas'
        && typeof receipt.pathRegion === 'string'
        && receipt.pathRegion.includes('Preview branch paths')
        && typeof receipt.loopRegion === 'string'
        && receipt.loopRegion.includes('Preview Loop Iterations')
        && typeof receipt.sampleRegion === 'string'
        && receipt.sampleRegion.includes('Preview-only samples')
        && receipt.parentReconciled === true;
    },
  );

  await recordP7SourceRow(
    'P8 mounted SourceEditor source-then-target transition replaces the prior refusal and preserves stale-result semantics',
    fixtureReady,
    'the actual mounted React source selector first refuses without a target, an exact menu.createFrame target commits a current canvas and enables export, source-only transition retains the prior canvas as stale, and restoring the target commits a replacement current canvas',
    async () => {
      if (fixture === undefined) throw new Error(fixtureError ?? 'SourceEditor P8 canonical fixture unavailable');
      return runMountedSourceEditorTransitionRegression(fixture);
    },
    observed => {
      const receipt = p7SourceRecord(observed);
      return receipt?.initialCanvasStatus === 'refused'
        && typeof receipt.initialCanvasDetail === 'string'
        && receipt.initialCanvasDetail.includes('exact source index/path/identity and target ID/range are required')
        && receipt.parentInitialSnapshot === 'null'
        && receipt.sourceOnlyCanvasStatus === 'refused'
        && typeof receipt.sourceOnlyCanvasDetail === 'string'
        && receipt.sourceOnlyCanvasDetail.includes('exact source index/path/identity and target ID/range are required')
        && receipt.parentSourceOnlySnapshot === 'null'
        && receipt.sourceOnlyCanvasRetained === true
        && receipt.currentCanvasStatus === 'rendered/current'
        && receipt.targetCommitCanvasStatus === 'rendered/current'
        && typeof receipt.currentCanvasDetail === 'string'
        && !receipt.currentCanvasDetail.includes('exact source index/path/identity and target ID/range are required')
        && receipt.currentCanvasMounted === true
        && receipt.currentCanvasReplaced === true
        && receipt.currentCanvasWidth === 2560
        && receipt.currentCanvasHeight === 1440
        && receipt.currentExportDisabled === false
        && receipt.currentExportStatus === 'ready · native PNG export uses the mounted current canvas'
        && typeof receipt.currentExportProfile === 'string'
        && receipt.currentExportProfile.includes('drawable 2560 × 1440')
        && receipt.currentExportProfile.includes('Effective Helper scale 1.4')
        && receipt.currentNativeBitmapWidth === '2560'
        && receipt.currentNativeBitmapHeight === '1440'
        && typeof receipt.parentTargetSnapshot === 'string'
        && receipt.parentTargetSnapshot.includes('ui/pipeline_test.lua')
        && receipt.parentTargetSnapshot.includes('menu.createFrame')
        && receipt.parentTargetCallbackCanvasStatus === 'rendered/current'
        && receipt.parentTargetCallbackCanvasMounted === true
        && receipt.parentTargetCallbackExportDisabled === false
        && typeof receipt.currentSourceIdentity === 'string'
        && receipt.currentSourceIdentity.includes('ui/pipeline_test.lua')
        && typeof receipt.currentTargetMetadata === 'string'
        && receipt.currentTargetMetadata.includes('menu.createFrame')
        && receipt.currentSceneStatus === 'partial'
        && receipt.presetActive === true
        && receipt.presetCanvasStatus === 'rendered/current'
        && receipt.presetExportDisabled === false
        && receipt.staleCanvasStatus === 'stale'
        && receipt.staleCanvasRetained === true
        && receipt.staleExportStatus === 'unavailable · Current rendered canvas evidence is unavailable or stale.'
        && receipt.restoredCanvasStatus === 'rendered/current'
        && receipt.restoredCanvasReplaced === true
        && receipt.restoredExportDisabled === false;
    },
  );

  for (const scopeProbe of ['identical', 'empty'] as const) {
    await recordP7SourceRow(
      `B119 mounted SourceEditor workspace scope boundary: ${scopeProbe}`,
      fixtureReady,
      'same-scope object churn retains stale recovery; scope changes detach old pixels, reject pending old exports, clear empty workspace evidence and render fresh on return without mutating source',
      async () => {
        if (fixture === undefined) throw new Error(fixtureError ?? 'SourceEditor scope canonical fixture unavailable');
        await runMountedSourceEditorTransitionRegression(fixture, scopeProbe);
        return { scopeTransitionsVerified: true };
      },
      observed => p7SourceRecord(observed)?.scopeTransitionsVerified === true,
    );
  }

  await recordP7SourceRow(
    'P7 SourceEditor default dual loader overlaps branches and preserves the fulfilled authority when the injected branch rejects',
    fixtureReady,
    'both injected loader branches start before either settles; one branch rejects outside transport normalization while the other reaches exact canonical authority and remains observable as an ordinary failure/canonical pair',
    async () => {
      const ownerLoader = sourceEditorApiUnknown.loadX4UiSourceEditorCorpusEnvelope;
      if (typeof ownerLoader !== 'function') throw new Error('missing future test seam: loadX4UiSourceEditorCorpusEnvelope');
      const controller = new AbortController();
      const sharedSignal = controller.signal;
      const calls: Array<{ readonly url: string; readonly signal: AbortSignal | undefined }> = [];
      const contract = X4_UI_CORPUS_9_00_CONTRACT;
      const buffers = new Map<string, Uint8Array>([
        [contract.helper.relativePath, new TextEncoder().encode('-- SourceEditor P7 canonical helper\n')],
        [contract.widget.relativePath, new TextEncoder().encode('-- SourceEditor P7 canonical widget\n')],
        [contract.regular.descriptor.relativePath, p7SourceMakeCanonicalAbc(8)],
        [contract.regular.atlas.relativePath, p7SourceMakeCanonicalDds()],
        [contract.bold.descriptor.relativePath, p7SourceMakeCanonicalAbc(8)],
        [contract.bold.atlas.relativePath, p7SourceMakeCanonicalDds()],
      ]);
      for (const [path, bytes] of p7SourceColorBuffers()) buffers.set(path, bytes);
      const digestHashes = new Map<string, string>();
      const digestCandidates: readonly { readonly bytes: Uint8Array; readonly hash: string }[] = [
        { bytes: buffers.get(contract.helper.relativePath) as Uint8Array, hash: contract.helper.sha256 },
        { bytes: buffers.get(contract.widget.relativePath) as Uint8Array, hash: contract.widget.sha256 },
        { bytes: buffers.get(contract.regular.descriptor.relativePath) as Uint8Array, hash: contract.regular.descriptor.sha256 },
        { bytes: buffers.get(contract.regular.atlas.relativePath) as Uint8Array, hash: contract.regular.atlas.sha256 },
        { bytes: buffers.get(contract.bold.descriptor.relativePath) as Uint8Array, hash: contract.bold.descriptor.sha256 },
        { bytes: buffers.get(contract.bold.atlas.relativePath) as Uint8Array, hash: contract.bold.atlas.sha256 },
        { bytes: buffers.get(X4_UI_CORPUS_COLORS_XML_PATH) as Uint8Array, hash: X4_UI_CORPUS_COLORS_XML_SHA256 },
        { bytes: buffers.get(X4_UI_CORPUS_COLORS_XSD_PATH) as Uint8Array, hash: X4_UI_CORPUS_COLORS_XSD_SHA256 },
      ];
      for (const candidate of digestCandidates) digestHashes.set(`${candidate.bytes.byteLength}:${Array.from(candidate.bytes.slice(0, 16)).join(',')}`, candidate.hash);
      let coreLoaderStarted = false;
      let colorLoaderStarted = false;
      let branchStartsBeforeSettlement = false;
      let injectedBranchRejected = false;
      let firstBranchSettled = false;
      let coreSignal: AbortSignal | undefined;
      let colorSignal: AbortSignal | undefined;
      let releaseBothBranches!: () => void;
      const bothBranchesStarted = new Promise<void>(resolve => { releaseBothBranches = resolve; });
      const noteBranchStart = (): void => {
        if (coreLoaderStarted && colorLoaderStarted && !firstBranchSettled) branchStartsBeforeSettlement = true;
      };
      const rejectingCoreLoader = async ({ signal }: { readonly signal: AbortSignal }): Promise<never> => {
        coreLoaderStarted = true;
        coreSignal = signal;
        noteBranchStart();
        await bothBranchesStarted;
        firstBranchSettled = true;
        injectedBranchRejected = true;
        throw new Error('P7 injected core branch rejection outside transport normalization');
      };
      const canonicalColorLoader = async ({ transport, signal }: { readonly transport: X4UiCorpusTransport; readonly signal: AbortSignal }): Promise<unknown> => {
        colorLoaderStarted = true;
        colorSignal = signal;
        noteBranchStart();
        releaseBothBranches();
        return loadConfiguredX4UiCorpusColorEvidence({ transport, signal });
      };
      const boundedTransport = p7SourceFixtureTransport(calls);
      const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      try {
        Object.defineProperty(globalThis, 'crypto', {
          configurable: true,
          enumerable: originalDescriptor?.enumerable ?? true,
          writable: true,
          value: {
            subtle: {
              digest: async (_algorithm: unknown, data: unknown): Promise<ArrayBuffer> => {
                const bytes = p7SourceDigestInputBytes(data);
                const hash = digestHashes.get(`${bytes.byteLength}:${Array.from(bytes.slice(0, 16)).join(',')}`);
                if (hash === undefined) throw new Error(`P7 default-loader unknown digest input (${bytes.byteLength} bytes)`);
                return p7SourceHexDigest(hash);
              },
            },
          },
        });
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<unknown>(resolve => {
          timeoutHandle = setTimeout(() => resolve({ timeout: true }), 1_000);
        });
        const loaderPromise = (ownerLoader as (options: {
          readonly transport: X4UiCorpusTransport;
          readonly signal: AbortSignal;
          readonly coreLoader: typeof rejectingCoreLoader;
          readonly colorLoader: typeof canonicalColorLoader;
        }) => Promise<unknown>)({
          transport: boundedTransport,
          signal: sharedSignal,
          coreLoader: rejectingCoreLoader,
          colorLoader: canonicalColorLoader,
        });
        const value = await Promise.race([loaderPromise, timeout]);
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        const record = p7SourceRecord(value);
        const coreResult = record?.core;
        const colorResult = record?.color;
        const coreCanonical = isX4UiCorpusCanonicalSuccess(coreResult);
        const colorCanonical = isX4UiCorpusCanonicalColorSuccess(colorResult);
        const branchResults = [coreResult, colorResult];
        const failed = branchResults.find(branch => p7SourceRecord(branch)?.ok === false || (p7SourceRecord(branch)?.error !== undefined));
        const failureRecord = p7SourceRecord(failed);
        const callsUseSharedSignal = calls.length >= 1 && calls.every(call => call.signal === sharedSignal);
        const branchSignalsUseSharedSignal = coreSignal === sharedSignal && colorSignal === sharedSignal;
        return {
          value,
          calls,
          sharedSignal,
          coreLoaderStarted,
          colorLoaderStarted,
          branchStartsBeforeSettlement,
          injectedBranchRejected,
          branchSignalsUseSharedSignal,
          callsUseSharedSignal,
          coreCanonical,
          colorCanonical,
          canonicalCount: Number(coreCanonical) + Number(colorCanonical),
          failedBranchOrdinary: failureRecord?.ok === false && failureRecord.error !== undefined,
        };
      } finally {
        if (originalDescriptor) Object.defineProperty(globalThis, 'crypto', originalDescriptor);
        else Reflect.deleteProperty(globalThis, 'crypto');
      }
    },
    observed => {
      const record = p7SourceRecord(observed);
      return record?.timeout !== true
        && record.coreLoaderStarted === true
        && record.colorLoaderStarted === true
        && record.branchStartsBeforeSettlement === true
        && record.injectedBranchRejected === true
        && record.branchSignalsUseSharedSignal === true
        && record.callsUseSharedSignal === true
        && record.coreCanonical !== record.colorCanonical
        && record.canonicalCount === 1
        && record.failedBranchOrdinary === true;
    },
  );

  await recordP7SourceRow(
    'P7 SourceEditor exact dual-authority classification accepts core and color authorities',
    fixtureReady,
    'an exact own-data { core, color } envelope is canonical for both authorities and preserves both identities',
    () => p7SourceClassify({ core, color }),
    observed => core !== undefined && color !== undefined && p7SourceCoreCanonical(observed, core) && p7SourceColorCanonical(observed, color),
  );

  await recordP7SourceRow(
    'P7 SourceEditor legacy core-only custom-loader compatibility',
    fixtureReady,
    'an exact core-only custom loader remains canonical while color is unavailable and no color authority is issued',
    () => p7SourceClassify(core),
    observed => core !== undefined && p7SourceCoreCanonical(observed, core) && p7SourceNoColorAuthority(observed) && p7SourceRecord(observed)?.colorStatus === 'unavailable',
  );

  await recordP7SourceRow(
    'P7 SourceEditor core success with color absent preserves core usability',
    fixtureReady,
    'core remains canonical/usable; color status is unavailable with no false color authority',
    () => p7SourceClassify({ core }),
    observed => core !== undefined && p7SourceCoreCanonical(observed, core) && p7SourceNoColorAuthority(observed) && p7SourceRecord(observed)?.colorStatus === 'unavailable',
  );

  const colorFailure = { ok: false, error: { code: 'offline', stage: 'status', message: 'P7 color offline' } };
  const colorAborted = { ok: false, error: { code: 'aborted', stage: 'consistency', message: 'P7 color independently aborted' } };
  await recordP7SourceRow(
    'P7 SourceEditor core success with independently offline/aborted color result',
    fixtureReady,
    'an active exact core remains canonical for both offline and independently aborted color results; each color result is unavailable with its own detail and no false color authority',
    () => ({
      offlineColor: p7SourceClassify({ core, color: colorFailure }),
      abortedColor: p7SourceClassify({ core, color: colorAborted }),
    }),
    observed => {
      const record = p7SourceRecord(observed);
      const offlineColor = p7SourceRecord(record?.offlineColor);
      const abortedColor = p7SourceRecord(record?.abortedColor);
      return core !== undefined
        && p7SourceCoreCanonical(offlineColor, core)
        && p7SourceNoColorAuthority(offlineColor)
        && offlineColor?.colorStatus === 'unavailable'
        && String(offlineColor.colorDetail || '').includes('P7 color offline')
        && p7SourceCoreCanonical(abortedColor, core)
        && p7SourceNoColorAuthority(abortedColor)
        && abortedColor?.colorStatus === 'unavailable'
        && String(abortedColor.colorDetail || '').includes('P7 color independently aborted');
    },
  );

  const colorThrown = { ok: false, error: { code: 'internal-error', stage: 'consistency', message: 'P7 color loader threw' } };
  await recordP7SourceRow(
    'P7 SourceEditor core success with color throw is all-settled and core-usable',
    fixtureReady,
    'a color throw becomes a separate unavailable detail and cannot erase the usable core result',
    () => p7SourceClassify({ core, color: colorThrown }),
    observed => core !== undefined && p7SourceCoreCanonical(observed, core)
      && p7SourceNoColorAuthority(observed)
      && p7SourceRecord(observed)?.colorStatus === 'unavailable'
      && String(p7SourceRecord(observed)?.colorDetail || '').includes('P7 color loader threw'),
  );

  const colorMalformed = { ok: true, evidenceKind: X4_UI_CORPUS_COLOR_CANONICAL_EVIDENCE };
  await recordP7SourceRow(
    'P7 SourceEditor core success with malformed color refuses color only',
    fixtureReady,
    'malformed color is visibly malformed/refused while core remains canonical and usable',
    () => p7SourceClassify({ core, color: colorMalformed }),
    observed => core !== undefined && p7SourceCoreCanonical(observed, core)
      && p7SourceNoColorAuthority(observed)
      && (p7SourceRecord(observed)?.colorStatus === 'malformed' || p7SourceRecord(observed)?.colorStatus === 'refused'),
  );

  const staleColor = { ok: false, error: { code: 'generation-drift', stage: 'consistency', message: 'P7 color stale generation' } };
  await recordP7SourceRow(
    'P7 SourceEditor core success with stale/late color cannot replace current color state',
    fixtureReady,
    'stale color is separate stale state; core remains canonical and no stale color authority is accepted',
    () => p7SourceClassify({ core, color: staleColor }),
    observed => core !== undefined && p7SourceCoreCanonical(observed, core)
      && p7SourceNoColorAuthority(observed)
      && p7SourceRecord(observed)?.colorStatus === 'stale',
  );

  const coreFailure = { ok: false, error: { code: 'offline', stage: 'status', message: 'P7 core unavailable' } };
  await recordP7SourceRow(
    'P7 SourceEditor color success without exact core is never core-canonical/paintable',
    fixtureReady,
    'color may be reported separately, but core accepted/result authority remains absent',
    () => p7SourceClassify({ core: coreFailure, color }),
    observed => color !== undefined
      && p7SourceRecord(observed)?.status !== 'canonical'
      && p7SourceRecord(observed)?.accepted === false
      && (p7SourceRecord(observed)?.result === null || p7SourceRecord(observed)?.result === undefined)
      && p7SourceRecord(observed)?.colorEvidence === undefined,
  );

  await recordP7SourceRow(
    'P7 SourceEditor transparent envelope facade detaches exact authorities and hostile reflection is contained',
    fixtureReady,
    'a transparent get-only facade is dual-canonical from exact own data descriptors with zero get reads and no retained wrapper; accessor/inherited/decorated/cloned/reassigned forms and throwing reflection facades expose no authority or outward throw',
    () => {
      if (core === undefined || color === undefined) return { fixtureReady: false };
      const cloneCore = JSON.parse(JSON.stringify(core)) as Record<string, unknown>;
      const cloneColor = JSON.parse(JSON.stringify(color)) as Record<string, unknown>;
      const exactEnvelope = { core, color };
      const transparentGetFacade = (target: object): { readonly candidate: object; readonly getTrapReads: () => number } => {
        let reads = 0;
        return {
          candidate: new Proxy(target, {
            get(current, key, receiver) {
              reads += 1;
              return Reflect.get(current, key, receiver);
            },
          }),
          getTrapReads: () => reads,
        };
      };
      const transparentFixture = transparentGetFacade(exactEnvelope);
      const transparentFacade = transparentFixture.candidate;
      let transparentResult: unknown;
      let transparentThrew = false;
      try { transparentResult = p7SourceClassify(transparentFacade); } catch { transparentThrew = true; }
      const transparentRecord = p7SourceRecord(transparentResult);
      const transparent = {
        getTrapReads: transparentFixture.getTrapReads(),
        threw: transparentThrew,
        dualCanonical: p7SourceCoreCanonical(transparentResult, core) && p7SourceColorCanonical(transparentResult, color),
        detached: transparentRecord?.result === core
          && transparentRecord.colorEvidence === color
          && !Object.hasOwn(transparentRecord, 'envelope')
          && transparentRecord.result !== transparentFacade
          && transparentRecord.colorEvidence !== transparentFacade,
      };

      let getterReads = 0;
      const accessor = { core, color } as Record<string, unknown>;
      Object.defineProperty(accessor, 'core', {
        configurable: true,
        enumerable: true,
        get: () => {
          getterReads += 1;
          throw new Error('P7 SourceEditor envelope getter executed');
        },
      });
      const inherited = Object.create({ core, color }) as Record<string, unknown>;
      const decorated = { core, color, extra: true };
      const reassigned = { core, color } as Record<string, unknown>;
      reassigned.core = cloneCore;
      reassigned.color = cloneColor;
      const negativeCases = [
        { name: 'structural-clone', ...transparentGetFacade({ core: cloneCore, color: cloneColor }) },
        { name: 'inherited', ...transparentGetFacade(inherited) },
        { name: 'accessor', ...transparentGetFacade(accessor) },
        { name: 'decorated', ...transparentGetFacade(decorated) },
        { name: 'reassigned', ...transparentGetFacade(reassigned) },
        (() => {
          const revoked = Proxy.revocable({ core, color }, {});
          revoked.revoke();
          return { name: 'revoked', candidate: revoked.proxy, getTrapReads: () => 0 };
        })(),
      ];
      const negativeResults = negativeCases.map(({ name, candidate, getTrapReads: readCount }) => {
        let result: unknown;
        let threw = false;
        try { result = p7SourceClassify(candidate); } catch { threw = true; }
        return { name, getTrapReads: readCount(), threw, rejected: p7SourceNoAuthority(result) };
      });

      let descriptorGetReads = 0;
      let descriptorTrapReads = 0;
      const throwingDescriptor = new Proxy(exactEnvelope, {
        get(target, key, receiver) {
          descriptorGetReads += 1;
          return Reflect.get(target, key, receiver);
        },
        getOwnPropertyDescriptor() {
          descriptorTrapReads += 1;
          throw new Error('P7 SourceEditor getOwnPropertyDescriptor trap');
        },
      });
      let ownKeysGetReads = 0;
      let ownKeysTrapReads = 0;
      const throwingOwnKeys = new Proxy(exactEnvelope, {
        get(target, key, receiver) {
          ownKeysGetReads += 1;
          return Reflect.get(target, key, receiver);
        },
        ownKeys() {
          ownKeysTrapReads += 1;
          throw new Error('P7 SourceEditor ownKeys trap');
        },
      });
      let prototypeGetReads = 0;
      let prototypeTrapReads = 0;
      const throwingPrototype = new Proxy(exactEnvelope, {
        get(target, key, receiver) {
          prototypeGetReads += 1;
          return Reflect.get(target, key, receiver);
        },
        getPrototypeOf() {
          prototypeTrapReads += 1;
          throw new Error('P7 SourceEditor getPrototypeOf trap');
        },
      });
      const reflectionCases: readonly { readonly name: string; readonly candidate: unknown; readonly getTrapReads: () => number; readonly trapReads: () => number }[] = [
        { name: 'throwing-getOwnPropertyDescriptor', candidate: throwingDescriptor, getTrapReads: () => descriptorGetReads, trapReads: () => descriptorTrapReads },
        { name: 'throwing-ownKeys', candidate: throwingOwnKeys, getTrapReads: () => ownKeysGetReads, trapReads: () => ownKeysTrapReads },
        { name: 'throwing-getPrototypeOf', candidate: throwingPrototype, getTrapReads: () => prototypeGetReads, trapReads: () => prototypeTrapReads },
      ];
      const reflectionResults = reflectionCases.map(({ name, candidate, getTrapReads: getReadCount, trapReads }) => {
        let result: unknown;
        let threw = false;
        try { result = p7SourceClassify(candidate); } catch { threw = true; }
        return { name, getTrapReads: getReadCount(), trapReads: trapReads(), threw, rejected: p7SourceNoAuthority(result) };
      });
      return { transparent, getterReads, negativeResults, reflectionResults };
    },
    observed => {
      const record = p7SourceRecord(observed);
      const transparent = p7SourceRecord(record?.transparent);
      const negativeResults = record?.negativeResults;
      const reflectionResults = record?.reflectionResults;
      return transparent?.getTrapReads === 0
        && transparent.threw === false
        && transparent.dualCanonical === true
        && transparent.detached === true
        && record?.getterReads === 0
        && Array.isArray(negativeResults)
        && negativeResults.length === 6
        && negativeResults.every(item => {
          const value = p7SourceRecord(item);
          return value?.getTrapReads === 0 && value.threw === false && value.rejected === true;
        })
        && Array.isArray(reflectionResults)
        && reflectionResults.length === 3
        && reflectionResults.every(item => {
          const value = p7SourceRecord(item);
          return value?.getTrapReads === 0 && value.trapReads === 1 && value.threw === false && value.rejected === true;
        });
    },
  );

  await recordP7SourceRow(
    'P7 SourceEditor request-generation late/abort/reload stays one lifecycle',
    fixtureReady,
    'active generation accepts exact dual authorities; late and aborted completions are ignored; reload generation accepts the replacement once',
    () => {
      const envelope = { core, color };
      const active = p7SourceClassify(envelope);
      const late = p7SourceClassify(envelope, { requestActive: false, requestGeneration: 1, currentGeneration: 2 });
      const aborted = p7SourceClassify(envelope, { signalAborted: true });
      const reload = p7SourceClassify(envelope, { requestGeneration: 2, currentGeneration: 2 });
      return { active, late, aborted, reload };
    },
    observed => {
      const record = p7SourceRecord(observed);
      const active = p7SourceRecord(record?.active);
      const late = p7SourceRecord(record?.late);
      const aborted = p7SourceRecord(record?.aborted);
      const reload = p7SourceRecord(record?.reload);
      return core !== undefined && color !== undefined
        && p7SourceCoreCanonical(active, core) && p7SourceColorCanonical(active, color)
        && late?.status === 'ignored' && late.accepted === false && late.result === null && late.colorEvidence === undefined
        && aborted?.status === 'ignored' && aborted.accepted === false && aborted.result === null && aborted.colorEvidence === undefined
        && p7SourceCoreCanonical(reload, core) && p7SourceColorCanonical(reload, color);
    },
  );

  await recordP7SourceRow(
    'P7 SourceEditor visible canonical-default-color detail retains permanent game truth',
    fixtureReady,
    'SSR visibly separates canonical-default color status/detail and always retains Not verified in game',
    () => p7SourceClassify({ core, color: colorFailure }),
    observed => /canonical.?default.?color/i.test(sourceMarkup)
      && /Not verified in game/.test(sourceMarkup)
      && typeof p7SourceRecord(observed)?.colorDetail === 'string'
      && String(p7SourceRecord(observed)?.colorDetail).includes('P7 color offline'),
  );

  const failedRows = p7SourceRows.filter(row => !row.pass);
  console.log(`P7_SOURCE_EDITOR_CANONICAL_COLOR_MATRIX ${JSON.stringify({ total: p7SourceRows.length, passed: p7SourceRows.length - failedRows.length, red: failedRows.map(row => ({ ...row, observed: p7SourceReceipt(row.observed) })), fixtureError })}`);
  if (failedRows.length > 0) throw new Error(`${failedRows.length} SourceEditor P7 canonical-color checks failed`);
  if (fixture === undefined) throw new Error(fixtureError ?? 'New-menu corpus fixture unavailable');
  if (process.env.X4_UI_SELECTION_FOCUS_ONLY === '1') {
    await runMountedSourceEditorStaleCellCallbackRegression(fixture);
    return;
  }
  await runMountedInspectorScrollRetentionRegression();
  await runMountedSourceEditSelectionTransferRegression();
  await runMountedSourceEditSelectionTransferInsertionRegression();
  // Keep history observable even when a later, independent import matrix fails.
  // All import checks below still execute and remain required for a green suite.
  await runMountedUiBuilderHistoryRestorationRegression(fixture, {
    name: 'portable-title-history',
    source: PORTABLE_PIPELINE_TEST_SOURCE,
    titleBefore: 'Menu A',
    exerciseRowMovement: false,
    preserveMultiTargetRecovery: true,
  });
  await runMountedUiBuilderHistoryRestorationRegression(fixture, {
    name: 'original-row-movement-history',
    source: HISTORY_ROW_REARRANGEMENT_SOURCE,
    titleBefore: 'History Before',
    exerciseRowMovement: true,
    preserveMultiTargetRecovery: false,
  });
  await runMountedLuaFileRoundtrip(fixture, 'sync-readback');
  await runMountedLuaFileRoundtrip(fixture, 'ack-before-readback');
  await runMountedLuaFileRoundtrip(fixture, 'delayed-readback');
  await runMountedLuaFileRoundtrip(fixture, 'scope-crossed');
  await runMountedLuaFileGuardRegression();
  await runMountedLuaFileAsyncGuardMatrix();
  await runMountedLuaFileSelectionAndAcknowledgementMatrix();
  await runMountedLuaFileInputBoundaryMatrix();
  await runMountedLuaFileExportFailureMatrix();
  await runMountedNewMenuCreationRegression(fixture);
  await runMountedSourceEditorStaleCellCallbackRegression(fixture);
  await runMountedSourceEditorCallbackDiscardRegression(fixture);
  await runMountedUnnamedChunkEditRegression(fixture);
  // Run the new structural continuation requirement after the existing regressions;
  // its failure must remain red, without hiding whether those earlier gates passed.
  await runMountedPreviewScenarioHistoryRegression(fixture);
}

void runP7SourceEditorCanonicalColorMatrix().catch(error => {
  console.error('X4UiSourceEditor P7 matrix: FAIL');
  console.error(error);
  process.exitCode = 1;
});

type X4UiCanvasSurfaceLayoutProfile = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
};

type X4UiCanvasSurfaceLayoutRect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
};

type X4UiCanvasSurfaceLayoutResult = {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly scroll: X4UiCanvasSurfaceLayoutRect & {
    readonly clientWidth: number;
    readonly clientHeight: number;
    readonly scrollWidth: number;
    readonly scrollHeight: number;
    readonly scrollTop: number;
  };
  readonly boxes: Readonly<Record<'stage' | 'host' | 'overlay' | 'canvas' | 'selection', X4UiCanvasSurfaceLayoutRect>>;
  readonly nativePoint: { readonly x: number; readonly y: number };
  readonly bitmap: string;
};

type X4UiBuilderViewportLayoutResult = {
  readonly canvas: X4UiCanvasSurfaceLayoutRect;
  readonly scroll: X4UiCanvasSurfaceLayoutRect;
  readonly editor: X4UiCanvasSurfaceLayoutRect;
  readonly visibleWidth: number;
  readonly visibleHeight: number;
  readonly compactExportVisible: boolean;
  readonly exportVisible: boolean;
  readonly exportHit: boolean;
  readonly inspectorScrollTop: number;
  readonly bitmap: string;
};

const runX4UiCanvasSurfaceLayoutSelftest = async (): Promise<void> => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 500, height: 720 } });
    const profiles: readonly X4UiCanvasSurfaceLayoutProfile[] = [
      { name: 'normal 16:9', width: 1920, height: 1080, expectedWidth: 500, expectedHeight: 281.25 },
      { name: 'tall', width: 400, height: 1080, expectedWidth: 504 * 400 / 1080, expectedHeight: 504 },
      { name: 'short/wide', width: 800, height: 100, expectedWidth: 500, expectedHeight: 62.5 },
    ];
    for (const profile of profiles) {
      const ratio = profile.width / profile.height;
      await page.setContent(`<!doctype html>
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
          #canvas-scroll { width: 500px; height: 300px; overflow: auto; font-size: 0; }
          #canvas-stage { position: relative; display: inline-block; width: min(100%, calc(70vh * ${ratio})); height: auto; aspect-ratio: ${profile.width} / ${profile.height}; }
          #canvas-host { display: flex; width: 100%; height: 100%; align-items: flex-start; justify-content: flex-start; overflow: hidden; }
          #canvas { display: block; width: 100%; height: 100%; max-width: none; max-height: none; object-fit: fill; image-rendering: pixelated; }
          #canvas-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: auto; }
          #selection { position: absolute; left: 10%; top: 20%; width: 20%; height: 30%; pointer-events: none; }
        </style>
        <div id="canvas-scroll">
          <div id="canvas-stage">
            <div id="canvas-host"><canvas id="canvas" width="${profile.width}" height="${profile.height}"></canvas></div>
            <div id="canvas-overlay"><div id="selection"></div></div>
          </div>
        </div>`);

      const readLayout = async (): Promise<X4UiCanvasSurfaceLayoutResult> => page.evaluate<X4UiCanvasSurfaceLayoutResult>(`(() => {
        function element(id) {
          const candidate = document.getElementById(id);
          if (!(candidate instanceof HTMLElement)) throw new Error('missing layout element ' + id);
          return candidate;
        }
        function rectFor(id) {
          const rect = element(id).getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        }
        const canvas = element('canvas');
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('layout fixture canvas is not an HTMLCanvasElement');
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('layout fixture canvas has no 2d context');
        context.fillStyle = '#123456';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const canvasBox = rectFor('canvas');
        const selectionBox = rectFor('selection');
        const scroll = element('canvas-scroll');
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scroll: { ...rectFor('canvas-scroll'), clientWidth: scroll.clientWidth, clientHeight: scroll.clientHeight, scrollWidth: scroll.scrollWidth, scrollHeight: scroll.scrollHeight, scrollTop: scroll.scrollTop },
          boxes: {
            stage: rectFor('canvas-stage'),
            host: rectFor('canvas-host'),
            overlay: rectFor('canvas-overlay'),
            canvas: canvasBox,
            selection: selectionBox,
          },
          nativePoint: {
            x: (selectionBox.left + selectionBox.width / 2 - canvasBox.left) * canvas.width / canvasBox.width,
            y: (selectionBox.top + selectionBox.height / 2 - canvasBox.top) * canvas.height / canvasBox.height,
          },
          bitmap: canvas.toDataURL('image/png'),
        };
      })()`);
      const layout = await readLayout();
      const closeTo = (actual: number, expected: number, label: string): void => {
        assert.ok(Math.abs(actual - expected) <= 0.5, `${profile.name} ${label}: expected ${expected}, received ${actual}`);
      };
      closeTo(layout.boxes.stage.width, profile.expectedWidth, 'stage width');
      closeTo(layout.boxes.stage.height, profile.expectedHeight, 'stage height');
      for (const key of ['host', 'overlay', 'canvas'] as const) {
        closeTo(layout.boxes[key].left, layout.boxes.stage.left, `${key} left edge`);
        closeTo(layout.boxes[key].top, layout.boxes.stage.top, `${key} top edge`);
        closeTo(layout.boxes[key].width, layout.boxes.stage.width, `${key} width`);
        closeTo(layout.boxes[key].height, layout.boxes.stage.height, `${key} height`);
      }
      closeTo(layout.nativePoint.x, profile.width * 0.2, 'CSS-to-native x mapping');
      closeTo(layout.nativePoint.y, profile.height * 0.35, 'CSS-to-native y mapping');
      assert.ok(layout.bitmap.startsWith('data:image/png'), `${profile.name} must retain native PNG serialization`);
      assert.ok(layout.boxes.canvas.top < layout.scroll.bottom && layout.boxes.canvas.bottom > layout.scroll.top, `${profile.name} canvas must intersect the scroll viewport`);
      assert.ok(layout.scroll.clientWidth > 0 && layout.scroll.clientHeight > 0, `${profile.name} scroll viewport must be measurable`);
      if (profile.name === 'tall') {
        assert.ok(layout.scroll.scrollHeight > layout.scroll.clientHeight, 'tall profile must remain reachable through the outer scroll container');
        await page.evaluate("(() => { const scroll = document.getElementById('canvas-scroll'); if (!(scroll instanceof HTMLElement)) throw new Error('layout fixture scroll container disappeared'); scroll.scrollTop = scroll.scrollHeight; })()");
        const scrolledLayout = await readLayout();
        assert.ok(scrolledLayout.scroll.scrollTop > 0, 'tall profile must scroll the bounded outer canvas surface');
        for (const key of ['stage', 'host', 'overlay', 'canvas'] as const) {
          closeTo(scrolledLayout.boxes[key].width, layout.boxes[key].width, `scrolled ${key} width`);
          closeTo(scrolledLayout.boxes[key].height, layout.boxes[key].height, `scrolled ${key} height`);
        }
        closeTo(scrolledLayout.nativePoint.x, profile.width * 0.2, 'scrolled CSS-to-native x mapping');
        closeTo(scrolledLayout.nativePoint.y, profile.height * 0.35, 'scrolled CSS-to-native y mapping');
        assert.equal(scrolledLayout.bitmap, layout.bitmap, 'scrolling and CSS sizing must not alter native PNG bytes');
        assert.ok(scrolledLayout.boxes.canvas.top < scrolledLayout.scroll.bottom && scrolledLayout.boxes.canvas.bottom > scrolledLayout.scroll.top, 'scrolled tall canvas must remain in the bounded viewport');
      } else {
        assert.ok(layout.scroll.scrollHeight <= layout.scroll.clientHeight + 1, `${profile.name} should fit without an unnecessary vertical canvas scroll`);
      }
    }
    // Exercise the actual UIBuilder/SourceEditor markup and generated utility CSS in the
    // bounded space left by the app chrome. This is layout proof, not source paint authority.
    const compiler = await compileTailwind('@import "tailwindcss";', { base: process.cwd(), onDependency: () => undefined });
    const classes = Array.from(uiBuilderMarkup.matchAll(/class="([^"]*)"/g)).flatMap(match => match[1].split(/\s+/));
    const css = compiler.build(classes);
    for (const viewport of [{ width: 1280, height: 720, rail: 320 }, { width: 1024, height: 768, rail: 256 }]) {
      await page.setViewportSize(viewport);
      await page.setContent(`<!doctype html><style>${css}
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
        #app-content { position: fixed; left: ${viewport.rail}px; right: 0; top: 128px; bottom: 0; display: flex; min-width: 0; min-height: 0; }
      </style><div id="app-content">${uiBuilderMarkup}</div>`);
      await page.evaluate(`(() => {
        const get = id => { const node = document.querySelector('[data-testid="' + id + '"]'); if (!(node instanceof HTMLElement)) throw new Error('missing ' + id); return node; };
        const stage = get('x4-ui-canvas-stage');
        Object.assign(stage.style, { width: 'min(100%, calc(70vh * ' + (1920 / 1080) + '))', height: 'auto', aspectRatio: '1920 / 1080' });
        const host = get('x4-ui-canvas-host');
        host.classList.remove('min-h-24');
        Object.assign(host.style, { width: '100%', height: '100%' });
        Object.assign(get('x4-ui-canvas-overlay').style, { width: '100%', height: '100%' });
        const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
        Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', objectFit: 'fill' });
        const context = canvas.getContext('2d'); if (context === null) throw new Error('missing 2d context');
        context.fillStyle = '#123456'; context.fillRect(0, 0, canvas.width, canvas.height); host.appendChild(canvas);
        const hierarchy = get('x4-ui-builder-hierarchy-list');
        for (let i = 0; i < 30; i++) { const row = document.createElement('button'); row.textContent = 'Text · visible source ' + i; row.style.display = 'block'; hierarchy.appendChild(row); }
      })()`);
      const readViewport = (): Promise<X4UiBuilderViewportLayoutResult> => page.evaluate<X4UiBuilderViewportLayoutResult>(`(() => {
        const get = id => { const node = document.querySelector('[data-testid="' + id + '"]'); if (!(node instanceof HTMLElement)) throw new Error('missing ' + id); return node; };
        const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
         const canvas = get('x4-ui-canvas-host').firstElementChild; if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing layout canvas');
         const c = rect(canvas), s = rect(get('x4-ui-canvas-scroll'));
         const button = get('x4-ui-canvas-export'), b = rect(button), compactExport = get('x4-ui-canvas-export-compact');
         const exportVisible = b.width > 0 && b.height > 0 && getComputedStyle(button).visibility !== 'hidden';
         const hit = exportVisible ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
         return { canvas:c, scroll:s, editor:rect(get('x4-ui-source-editor')),
           visibleWidth:Math.max(0, Math.min(c.right,s.right,innerWidth) - Math.max(c.left,s.left,0)),
           visibleHeight:Math.max(0, Math.min(c.bottom,s.bottom,innerHeight) - Math.max(c.top,s.top,0)),
           compactExportVisible:rect(compactExport).width > 0 && rect(compactExport).height > 0,
           exportVisible,
           exportHit:hit === button || (hit !== null && button.contains(hit)),
           inspectorScrollTop:get('x4-ui-builder-inspector').scrollTop, bitmap:canvas.toDataURL('image/png') };
      })()`);
      const initial = await readViewport();
      assert.ok(initial.visibleWidth >= 180 && initial.visibleHeight >= 120,
        `bounded ${viewport.width}px editor must expose usable canvas pixels: ${initial.visibleWidth} x ${initial.visibleHeight}; scroll ${JSON.stringify(initial.scroll)}`);
      assert.ok(initial.editor.bottom <= viewport.height + 1, 'editor must remain within app height');
       assert.ok(initial.compactExportVisible, 'compact PNG export status must remain visible with Inspect closed');
       await page.evaluate(`(() => {
         const panel = document.querySelector('[data-testid="x4-ui-inspect-panel"]');
         const inspector = document.querySelector('[data-testid="x4-ui-builder-inspector"]');
         const inspectScroll = document.querySelector('[data-testid="x4-ui-inspect-scroll"]');
         const exportControl = document.querySelector('[data-testid="x4-ui-canvas-export"]');
         if (!(panel instanceof HTMLDetailsElement) || !(inspector instanceof HTMLElement) || !(inspectScroll instanceof HTMLElement) || !(exportControl instanceof HTMLElement)) throw new Error('missing Inspect panel');
         panel.open = true; inspectScroll.scrollTop = inspectScroll.scrollHeight; inspector.scrollTop = inspector.scrollHeight;
         exportControl.scrollIntoView({ block: 'center', inline: 'nearest' });
       })()`);
      const inspected = await readViewport();
       assert.ok(inspected.exportVisible && inspected.exportHit, 'Export must be hit-testable when its Inspect control is open');
      assert.deepEqual(inspected.scroll, initial.scroll, 'Inspect must not consume the canvas viewport');
      assert.deepEqual(inspected.canvas, initial.canvas, 'Inspect must preserve the canvas box');
      assert.equal(inspected.bitmap, initial.bitmap, 'Inspect must not change native PNG bytes');
      assert.ok(inspected.visibleWidth >= 180 && inspected.visibleHeight >= 120, 'canvas must remain usable while Inspect is open');
    }
     console.log('X4UiSourceEditor bounded viewport layout: actual UIBuilder/SourceEditor markup + Tailwind, usable canvas, compact export status, and unobstructed Inspect Export 2/2');
  } finally {
    await browser.close();
  }
  console.log('X4UiSourceEditor canvas surface layout selftest: normal 16:9, tall, short/wide exact stage/host/overlay/canvas boxes, viewport scroll, CSS-to-native mapping, and PNG byte preservation 3/3');
};

void runX4UiCanvasSurfaceLayoutSelftest().catch(error => {
  console.error('X4UiSourceEditor canvas surface layout selftest: FAIL');
  console.error(error);
  process.exitCode = 1;
});
