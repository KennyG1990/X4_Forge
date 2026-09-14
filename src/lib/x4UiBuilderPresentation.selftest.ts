import assert from 'node:assert/strict';
import type { ModWorkspace } from '../types';
import {
  buildX4UiBuilderPresentation,
  buildX4UiBuilderPropertyPresentation,
  buildX4UiBuilderPreviewInputPresentation,
  computeX4UiBuilderViewport,
  computeX4UiBuilderSelectionFocus,
  describeX4UiBuilderProperty,
  deriveX4UiBuilderMenuBounds,
  hitTestX4UiBuilderCanvas,
  mapX4UiBuilderSourceSpanThroughEdit,
  reconcileX4UiBuilderSelection,
  resolveX4UiBuilderNodeAfterSourceRowInsertion,
  resolveX4UiBuilderNodeAfterSourceRowMove,
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion,
  resolveX4UiBuilderNodeAfterSourceEdit,
  resolveX4UiBuilderNodeAfterScalarHistory,
  resolveX4UiBuilderNodeAfterHistory,
  resolveX4UiBuilderRowForNode,
  sourceEntriesForX4UiBuilderNode,
  x4UiBuilderProfileKey,
  type X4UiBuilderSourceEditSplice,
  type X4UiBuilderSelection,
} from './x4UiBuilderPresentation';
import type { X4UiEditorSessionProjection } from './x4UiEditorSession';
import { applyX4UiEditorSampleDraft, projectX4UiEditorSession } from './x4UiEditorSession';
import {
  createX4UiLayoutTargetCatalog,
  projectX4UiLayoutProgram,
  type X4UiLayoutProjectionProfile,
} from './x4UiLayoutProgram';
import {
  HELPER_SOURCE_SHA256,
  WIDGET_SOURCE_SHA256,
  X4_LAYOUT_PROVENANCE,
} from './x4UiLayoutKernel';
import {
  X4_UI_CORPUS_9_00_CONTRACT,
  X4_UI_CORPUS_FILE_URL,
  X4_UI_CORPUS_MANIFEST_URL,
  X4_UI_CORPUS_STATUS_URL,
  loadCanonicalX4UiCorpusAssets,
  type X4UiCorpusCanonicalSuccess,
  type X4UiCorpusFetchResponse,
} from './x4UiCorpusAssets';
import {
  ZEKTON_DDS_HEADER_SIZE,
  ZEKTON_DESCRIPTOR_HEADER_SIZE,
  ZEKTON_DESCRIPTOR_TRAILING_SIZE,
  ZEKTON_RECORD_SIZE,
} from './x4UiFontMetrics';
import { buildX4UiWorkspaceSource } from './x4UiWorkspaceSource';
import {
  discoverX4UiSourceEdits,
  normalizeX4UiSourceEditLayoutModel,
} from './x4UiSourceEdits';

const source = { file: 'ui/menu.lua', sourcePath: 'ui/menu.lua', sha256: 'a'.repeat(64) } as const;
const loc = (start: number, end: number) => ({
  file: source.file,
  sourcePath: source.sourcePath,
  start: { line: 1, column: start, offset: start },
  end: { line: 1, column: end, offset: end },
});
const frameSource = loc(0, 120);
const tableSource = loc(10, 110);
const rowSource = loc(20, 100);
const cellSource = loc(30, 90);
const widgetSource = loc(40, 65);
const target = { id: 'target-menu', kind: 'top-level' as const, source: frameSource, sourceIdentity: source };
const profile = { id: 'fixture-profile', drawable: { width: 100, height: 80 }, uiScale: 1 };
const operation = {
  id: 'operation-text',
  kind: 'createText' as const,
  source: widgetSource,
  sourceOrder: 5,
  modelOrder: 5,
  status: 'applied' as const,
  metadata: {},
  frameId: 'frame-1',
  tableId: 'table-1',
  rowId: 'row-1',
  cellId: 'cell-1',
  descriptorFacts: {},
};
const captionOperation = {
  ...operation,
  id: 'operation-caption',
  kind: 'setText' as const,
  source: loc(66, 75),
};
const secondaryCaptionOperation = {
  ...captionOperation,
  id: 'operation-secondary-caption',
  kind: 'setText2' as const,
  source: loc(76, 85),
};
const tableOperation = {
  ...operation,
  id: 'operation-table',
  kind: 'addTable' as const,
  source: tableSource,
  sourceOrder: 2,
  modelOrder: 2,
  rowId: undefined,
  cellId: undefined,
};
const rowOperation = {
  ...operation,
  id: 'operation-row',
  kind: 'addRow' as const,
  source: rowSource,
  sourceOrder: 3,
  modelOrder: 3,
  cellId: undefined,
};
const base = (id: string, kind: string, nodeSource: typeof frameSource, sourceOrder: number, rect?: { x: number; y: number; width: number; height: number }) => ({
  id,
  kind,
  source: nodeSource,
  sourceOrder,
  ...(rect === undefined ? {} : { rect }),
  completeness: 'complete',
  provenance: 'source-derived',
  provenanceLinks: [],
  diagnosticLinks: [],
  diagnosticStyle: { geometry: rect === undefined ? 'unavailable' : 'source-derived', paint: 'unknown-runtime-color', texture: 'unknown-runtime-texture', interaction: 'unknown-runtime-state' },
});

const frame = { id: 'frame-1', source: frameSource, tableIds: ['table-1'], operationIds: [], descriptorFacts: {}, status: 'projected' };
const table = { id: 'table-1', source: tableSource, frameId: 'frame-1', rowIds: ['row-1'], operationIds: ['operation-table', 'operation-row', 'operation-text', 'operation-caption', 'operation-secondary-caption'], descriptorFacts: {}, status: 'projected' };
const row = { id: 'row-1', source: rowSource, tableId: 'table-1', rowIndex: 1, cellIds: ['cell-1'], operationIds: ['operation-row', 'operation-text', 'operation-caption', 'operation-secondary-caption'], descriptorFacts: {}, status: 'projected' };
const cell = { id: 'cell-1', source: cellSource, tableId: 'table-1', rowId: 'row-1', rowIndex: 1, column: 1, operationIds: ['operation-text', 'operation-caption', 'operation-secondary-caption'], metadataOperationIds: [], descriptorFacts: {}, status: 'projected' };
const widget = {
  ...base('scene:widget:cell-1:text', 'text', widgetSource, 5, { x: 10, y: 12, width: 40, height: 16 }),
  cellId: 'scene:cell-1',
  textIds: ['scene:text:cell-1:primary'],
  primaryContent: 'Hello source',
};
const text = {
  ...base('scene:text:cell-1:primary', 'text', widgetSource, 5, { x: 12, y: 14, width: 32, height: 12 }),
  parentId: widget.id,
  widgetId: widget.id,
  slot: 'primary',
  content: 'Hello source',
  lines: [],
  textGaps: [],
  evidence: { metrics: 'exact-source-backed', wrapAndTruncationPolicy: 'source-backed', gameParity: 'not-verified' },
  contentSelection: 'current',
};
const sceneFrame = { ...base('scene:frame-1', 'frame', frameSource, 0, { x: 0, y: 0, width: 100, height: 80 }), zOrder: 1, tableIds: ['scene:table-1'] };
const sceneTable = { ...base('scene:table-1', 'table', tableSource, 1, { x: 0, y: 0, width: 100, height: 80 }), frameId: sceneFrame.id, rowIds: ['scene:row-1'] };
const sceneRow = { ...base('scene:row-1', 'row', rowSource, 2, { x: 0, y: 0, width: 100, height: 80 }), tableId: sceneTable.id, rowIndex: 1, cellIds: ['scene:cell-1'] };
const sceneCell = { ...base('scene:cell-1', 'cell', cellSource, 3), tableId: sceneTable.id, rowId: sceneRow.id, rowIndex: 1, column: 1, widgetIds: [widget.id] };
const scene = {
  profile: { source, drawable: { width: 100, height: 80 } },
  frames: [sceneFrame],
  tables: [sceneTable],
  rows: [sceneRow],
  cells: [sceneCell],
  widgets: [widget],
  texts: [text],
};
const program = { status: 'projected', target, profile: {}, frames: [frame], tables: [table], rows: [row], cells: [cell], operations: [tableOperation, rowOperation, operation, captionOperation, secondaryCaptionOperation] };
const editableEntry = {
  kind: 'editable' as const,
  id: 'entry-text',
  path: source.file,
  valueType: 'string' as const,
  value: 'Hello source',
  expression: 'text',
  expectedText: '"Hello source"',
  startOffset: 42,
  endOffset: 56,
  source: widgetSource,
  sourceLiteral: widgetSource,
  provenance: {
    sourceIdentity: source,
    targetId: target.id,
    targetSource: target.source,
    operationId: operation.id,
    callName: 'createText',
    callSource: operation.source,
    callOrder: 5,
    fields: ['semantics.text'],
  },
};
const captionEntry = {
  ...editableEntry,
  id: 'entry-caption',
  value: 'Caption source',
  expectedText: '"Caption source"',
  provenance: { ...editableEntry.provenance, operationId: captionOperation.id, callName: 'setText', fields: ['semantics.text'] },
};
const tableEntry = {
  ...editableEntry,
  id: 'entry-table-width',
  value: 100,
  valueType: 'number' as const,
  expectedText: '100',
  provenance: { ...editableEntry.provenance, operationId: tableOperation.id, callName: 'addTable', fields: ['semantics.properties.width'] },
};
const unrelatedEntry = { ...editableEntry, id: 'entry-unrelated', provenance: { ...editableEntry.provenance, operationId: 'operation-other' } };
const lockedEntry = { kind: 'locked' as const, id: 'entry-locked', path: source.file, field: 'semantics.properties.width', operationId: operation.id, callName: 'createText' as const, reason: 'dynamic', detail: 'runtime value', valueType: 'number' as const };
const projection = {
  normalizedProfile: profile,
  preview: {
    status: 'projected',
    selectedSource: { sourceIdentity: source },
    selectedTarget: target,
    program: { status: 'projected', program: { ...program, cells: [{ ...cell }] }, evidenceAuthority: {} },
    scene: { status: 'projected', scene },
  },
} as unknown as X4UiEditorSessionProjection;
const catalog = { entries: [editableEntry, captionEntry, tableEntry, unrelatedEntry, lockedEntry] } as unknown as Parameters<typeof sourceEntriesForX4UiBuilderNode>[0];

/*
 * CONTROLLED UNIT CORPUS ONLY. This follows the existing loader-issued unit
 * fixture pattern so the pure producer/mapping test can exercise the mixed
 * source stream without depending on a machine-local configured corpus. The
 * returned object is used directly as opaque loader authority; this is not
 * configured-corpus, geometry-fidelity, installed, or native evidence.
 */
const responseHeaders = (contentType: string): { get(name: string): string | null } => ({
  get: name => name.toLowerCase() === 'content-type' ? contentType : null,
});

const jsonResponse = (body: unknown): X4UiCorpusFetchResponse => ({
  status: 200,
  headers: responseHeaders('application/json; charset=utf-8'),
  json: async () => body,
});

const bytesResponse = (bytes: Uint8Array, contentType: string): X4UiCorpusFetchResponse => {
  const copied = bytes.slice();
  return {
    status: 200,
    headers: responseHeaders(contentType),
    arrayBuffer: async () => copied.buffer,
  };
};

const makeControlledUnitAbc = (advance: number): Uint8Array => {
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
  for (let codepoint = 0; codepoint <= maxCodepoint; codepoint += 1) {
    view.setUint16(ZEKTON_DESCRIPTOR_HEADER_SIZE + codepoint * 2, 1, true);
  }
  view.setFloat32(recordStart, 0, true);
  view.setFloat32(recordStart + 4, 0, true);
  view.setFloat32(recordStart + 8, 1, true);
  view.setFloat32(recordStart + 12, 1, true);
  view.setInt16(recordStart + 16, 0, true);
  view.setUint16(recordStart + 18, 8, true);
  view.setUint16(recordStart + 20, advance, true);
  view.setUint16(recordStart + 22, 0, true);
  return bytes;
};

const makeControlledUnitDds = (): Uint8Array => {
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
};

const hexDigest = (hex: string): ArrayBuffer => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes.buffer;
};

const loadControlledUnitCorpus = async (): Promise<X4UiCorpusCanonicalSuccess> => {
  const root = 'b119-controlled-unit-corpus-root';
  const generation = 'b119-controlled-unit-corpus-generation';
  const generatedAt = '2026-09-12T00:00:00.000Z';
  const contract = X4_UI_CORPUS_9_00_CONTRACT;
  const buffers = new Map<string, Uint8Array>([
    [contract.helper.relativePath, new TextEncoder().encode('-- B119 controlled unit helper\n')],
    [contract.widget.relativePath, new TextEncoder().encode('-- B119 controlled unit widget\n')],
    [contract.regular.descriptor.relativePath, makeControlledUnitAbc(8)],
    [contract.regular.atlas.relativePath, makeControlledUnitDds()],
    [contract.bold.descriptor.relativePath, makeControlledUnitAbc(8)],
    [contract.bold.atlas.relativePath, makeControlledUnitDds()],
  ]);
  const expectedHashes = [
    contract.helper.sha256,
    contract.widget.sha256,
    contract.regular.descriptor.sha256,
    contract.regular.atlas.sha256,
    contract.bold.descriptor.sha256,
    contract.bold.atlas.sha256,
  ];
  const status = {
    available: true,
    root,
    generatedAt,
    manifestGeneration: generation,
    manifest: { available: true, state: 'ready', root, current: { generation, root, generatedAt } },
  };
  const pathFromQuery = (url: string, key: string): string => {
    const pair = url.slice(url.indexOf('?') + 1).split('&').find(part => part.startsWith(`${key}=`));
    if (!pair) throw new Error(`B119 controlled unit corpus query is missing ${key}`);
    return decodeURIComponent(pair.slice(key.length + 1));
  };
  const transport = async (url: string): Promise<X4UiCorpusFetchResponse> => {
    if (url === X4_UI_CORPUS_STATUS_URL) return jsonResponse(status);
    if (url.startsWith(`${X4_UI_CORPUS_MANIFEST_URL}?`)) {
      const path = pathFromQuery(url, 'q');
      const bytes = buffers.get(path);
      if (!bytes) throw new Error(`B119 controlled unit corpus has no manifest path ${path}`);
      return jsonResponse({
        status: { available: true, state: 'ready', root, current: { generation, root, generatedAt } },
        generation,
        total: 1,
        limit: 500,
        offset: 0,
        files: [{ path, bytes: bytes.byteLength }],
      });
    }
    if (url.startsWith(`${X4_UI_CORPUS_FILE_URL}?`)) {
      const path = pathFromQuery(url, 'path');
      const bytes = buffers.get(path);
      if (!bytes) throw new Error(`B119 controlled unit corpus has no file path ${path}`);
      return bytesResponse(bytes, path.endsWith('.lua') ? 'text/plain' : 'application/octet-stream');
    }
    throw new Error(`unexpected B119 controlled unit corpus URL ${url}`);
  };
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalValue = (globalThis as unknown as { crypto?: unknown }).crypto;
  let hashIndex = 0;
  const controlledCrypto = {
    subtle: {
      digest: async (): Promise<ArrayBuffer> => {
        const expected = expectedHashes[hashIndex++];
        if (expected === undefined) throw new Error('B119 controlled unit corpus hash count mismatch');
        return hexDigest(expected);
      },
    },
  };
  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      enumerable: originalDescriptor?.enumerable ?? true,
      writable: true,
      value: controlledCrypto,
    });
    const result = await loadCanonicalX4UiCorpusAssets({ transport });
    if (result.ok === false) throw new Error(`B119 controlled unit corpus loader failed: ${result.error.message}`);
    return result;
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, 'crypto', originalDescriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
    assert.equal((globalThis as unknown as { crypto?: unknown }).crypto, originalValue, 'controlled unit corpus loader restores platform Web Crypto');
  }
};

const actualSourceXml = '<addon><environment type="menus"><file name="ui/b119-property-recovery.lua"/></environment></addon>';
const actualPropertyLua = [
  'local menu = { name = "B119PropertyRecovery", layer = 1 }',
  'local frame = Helper.createFrameHandle(menu, { width = 100, height = 80, layer = 2, standardButtons = true, blurBackground = true })',
  'local table = frame:addTable(3, { width = 80, scaling = false })',
  'table:setDefaultCellProperties("editbox", { height = 18, scaling = true })',
  'table:setDefaultComplexCellProperties("editbox", "hotkey", { hotkey = "DEFAULT", displayIcon = true })',
  'local row = table:addRow(false, { height = 20, paddingTop = 2, paddingBottom = 3, borderBelow = true, fixed = false, scaling = false, interactive = true })',
  'local text = row[1]:createText("Title", { width = 20, height = 10, fontsize = 12, font = "Zekton", halign = "center", wordwrap = true, scaling = true, x = 1, y = 2 })',
  'local button = row[2]:createButton({ width = 30, height = 20, active = true, scaling = false, affectRowHeight = true })',
  'button:setText("Press", { fontsize = 11, ["mystery-key"] = 3 })',
  'button:setText2("Secondary", { font = "Zekton" })',
  'local input = row[3]:createEditBox({ width = 40, height = 18, defaultText = "Type here", description = "Description", maxChars = 32, selectTextOnActivation = true, active = true, scaling = true })',
  'local dynamicRow = table:addRow(false, {})',
  'local dynamicWidth = getWidth()',
  'dynamicRow[1]:createButton({ width = dynamicWidth, height = 20 })',
  'local aliasedRow = table:addRow(false, {})',
  'local aliasedWidth = 24',
  'aliasedRow[1]:createButton({ width = aliasedWidth, height = 20 })',
  'local calculatedRow = table:addRow(false, {})',
  'local calculatedHeight = 10 + 5',
  'calculatedRow[1]:createButton({ width = 20, height = calculatedHeight })',
  'local widthScale = Helper.scaleX(1.25, true)',
  'local heightScale = Helper.scaleY(0.9, false)',
  'local fontScale = Helper.scaleFont("Zekton", 14, true)',
  'frame:display()',
  '',
].join('\n');

const actualPin = (value: number, lineStart: number, lineEnd = lineStart) => ({
  value,
  source: {
    sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath,
    lineStart,
    lineEnd,
  },
});

const actualWorkspace: ModWorkspace = {
  id: 'b119-property-recovery-builder-selftest',
  name: 'B119 property recovery builder selftest',
  version: '1.0.0',
  author: 'Forge',
  description: 'B119 actual producer presentation fixture',
  nodes: [],
  links: [],
  uiWidgets: [],
  uiTheme: {
    backgroundColor: '#000000',
    borderColor: '#111111',
    accentColor: '#00ffff',
    opacity: 1,
    showIcons: true,
  },
  compileSettings: {
    md: false,
    ui: true,
    ai: false,
    library: false,
    translations: false,
    patches: false,
  },
  passthroughFiles: [
    { path: 'README.md', content: '# unchanged\n', reason: 'unknown_domain' },
    { path: 'ui.xml', content: actualSourceXml, reason: 'partial', bytes: actualSourceXml.length },
    { path: 'ui/b119-property-recovery.lua', content: actualPropertyLua, reason: 'partial', bytes: actualPropertyLua.length },
  ],
};

const controlledUnitCorpus = await loadControlledUnitCorpus();

const actualPropertyFixture = (() => {
  const actualSource = buildX4UiWorkspaceSource(actualWorkspace);
  if (!actualSource.bundle) throw new Error('actual property source fixture did not build a bundle');
  const sourceFile = actualSource.bundle.sourceFiles.find(file => file.path === 'ui/b119-property-recovery.lua');
  if (!sourceFile) throw new Error('actual property source fixture Lua file missing');
  const model = normalizeX4UiSourceEditLayoutModel(sourceFile.callModel);
  const target = createX4UiLayoutTargetCatalog(model).targets.find(candidate => candidate.kind === 'top-level');
  if (!target) throw new Error('actual property source fixture top-level target missing');
  const profile: X4UiLayoutProjectionProfile = {
    id: 'b119-property-recovery-profile',
    provenance: 'B119 actual source-issued presentation selftest profile',
    truthGrade: 'captured',
    source: target.sourceIdentity,
    frame: { width: 100, height: 80 },
    metrics: {
      uiScale: 1,
      borderSize: 1,
      scrollbarWidth: 12,
      standardContainerOffset: 2,
    },
    helper: {
      sourcePath: X4_LAYOUT_PROVENANCE.helperSourcePath,
      sha256: HELPER_SOURCE_SHA256,
      constants: {
        standardTextHeight: actualPin(16, 533),
        standardButtonHeight: actualPin(25, 522),
        viewWidth: actualPin(100, 707),
        viewHeight: actualPin(80, 708),
        borderSize: actualPin(1, 709),
      },
    },
    widget: {
      sourcePath: X4_LAYOUT_PROVENANCE.widgetSourcePath,
      sha256: WIDGET_SOURCE_SHA256,
    },
    defaults: {
      standardButtonHeight: actualPin(25, 522),
      minTextHeight: 7,
    },
  };
  const noCorpusResult = projectX4UiLayoutProgram(model, target, profile);
  if (noCorpusResult.status === 'refused' || noCorpusResult.program === undefined || noCorpusResult.evidenceAuthority === undefined) {
    throw new Error(`actual property source fixture no-corpus layout refused before catalog boundary: ${JSON.stringify(noCorpusResult)}`);
  }
  const noCorpusCatalog = discoverX4UiSourceEdits(actualWorkspace, actualSource, noCorpusResult.program, noCorpusResult.evidenceAuthority);
  assert.equal(noCorpusCatalog.status, 'locked', 'mixed dynamic source fixture is globally refused without canonical corpus authority');
  assert.equal(noCorpusCatalog.reason, 'operation-not-applied', 'no-corpus refusal retains the operation-not-applied reason');
  assert.match(noCorpusCatalog.detail, /canonical corpus/, 'no-corpus refusal explains the canonical corpus boundary');

  const result = projectX4UiLayoutProgram(model, target, profile, undefined, undefined, undefined, controlledUnitCorpus);
  if (result.status === 'refused' || result.program === undefined || result.evidenceAuthority === undefined) {
    throw new Error(`actual property source fixture layout refused: ${JSON.stringify(result)}`);
  }
  return {
    source: actualSource,
    sourceFile,
    targetCatalog: createX4UiLayoutTargetCatalog(model),
    target,
    result,
    catalog: discoverX4UiSourceEdits(actualWorkspace, actualSource, result.program, result.evidenceAuthority),
  };
})();
const actualPropertyCatalog = actualPropertyFixture.catalog;

const actualSelectedSession = projectX4UiEditorSession({
  workspace: actualWorkspace,
  corpus: controlledUnitCorpus,
  profile: { width: 100, height: 80, uiScale: 1 },
  selection: {
    sourceIndex: actualPropertyFixture.sourceFile.index,
    path: actualPropertyFixture.sourceFile.path,
    sourceIdentity: actualPropertyFixture.targetCatalog.sourceIdentity,
    target: { ...actualPropertyFixture.target, id: actualPropertyFixture.target.id },
  },
});
const actualSelectedSessionProgram = actualSelectedSession.preview.program;
assert.ok(
  actualSelectedSessionProgram !== undefined
    && actualSelectedSessionProgram.status !== 'refused'
    && actualSelectedSessionProgram.program !== undefined,
  `actual selected Session did not issue a Layout program: ${JSON.stringify(actualSelectedSessionProgram)}`,
);
const actualSelectedSessionScene = actualSelectedSession.preview.scene;
assert.ok(
  actualSelectedSessionScene !== undefined
    && actualSelectedSessionScene.status !== 'refused',
  `actual selected Session did not issue a Scene: ${JSON.stringify(actualSelectedSessionScene)}`,
);
const actualSelectedPresentation = buildX4UiBuilderPresentation(actualSelectedSession);
const actualSelectedWidgets = actualSelectedPresentation.nodes.filter(node => node.kind === 'widget');
assert.ok(actualSelectedWidgets.length > 0, 'actual selected Session must retain source-issued scene widgets');
assert.equal(
  actualSelectedWidgets.some(node => node.widgetKind === 'text' && node.label === 'Widget · Title'),
  true,
  `actual selected Session retains the generic createText widget before its Text content child: ${JSON.stringify(actualSelectedWidgets.map(node => ({ id: node.id, label: node.label, widgetKind: node.widgetKind, parentId: node.parentId })))}`,
);
const actualButtonOperation = actualSelectedSessionProgram.program.operations.find(operation => operation.kind === 'createButton');
assert.ok(actualButtonOperation, 'actual selected Session must retain a source-issued createButton operation');
const actualButtonWidget = actualSelectedWidgets.find(node => node.id === `scene:widget:${actualButtonOperation.cellId}:button`);
assert.ok(actualButtonWidget, 'actual selected Session must bind createButton to its exact source-issued widget id');
assert.equal(actualButtonWidget.widgetKind, 'button');
assert.equal(actualButtonWidget.parentId, `scene:${actualButtonOperation.cellId}`);
const actualTextOperation = actualSelectedSessionProgram.program.operations.find(operation => operation.kind === 'createText');
assert.ok(actualTextOperation, 'actual selected Session must retain a source-issued createText operation');
const actualTextWidget = actualSelectedWidgets.find(node => node.id === `scene:widget:${actualTextOperation.cellId}:text`);
assert.ok(actualTextWidget, 'actual selected Session must retain the createText widget before its Text child');
assert.equal(actualSelectedPresentation.nodes.some(node => node.id === `scene:text:${actualTextOperation.cellId}:primary` && node.label === 'Text · Title'), true, 'actual selected Session retains the source-issued Text child label');
const actualDynamicOperation = actualSelectedSessionProgram.program.operations.find(operation => operation.kind === 'createButton' && operation.source.start.line === 14);
const actualCalculatedOperation = actualSelectedSessionProgram.program.operations.find(operation => operation.kind === 'createButton' && operation.source.start.line === 20);
assert.ok(actualDynamicOperation && actualCalculatedOperation, 'actual selected Session retains distinct dynamic and calculated button creators');
assert.equal(actualSelectedWidgets.some(node => node.id === `scene:widget:${actualDynamicOperation.cellId}:button` && node.widgetKind === 'button'), true, 'dynamic button receives its exact source-issued widget id');
const actualCalculatedWidget = actualSelectedWidgets.find(node => node.id === `scene:widget:${actualCalculatedOperation.cellId}:button`);
if (actualCalculatedWidget === undefined) {
  assert.equal(actualPropertyCatalog.entries.some(entry => entry.kind === 'locked' && entry.callName === 'createButton' && entry.reason === 'constant-folded-value'), true, 'calculated source property remains in the catalog when its Scene geometry is unavailable');
} else {
  assert.equal(actualCalculatedWidget.widgetKind, 'button', 'calculated button receives its exact source-issued widget id when Scene geometry is issued');
}

const actualE2ePropertyLua = [
  'local menu = { name = "X4UiSourceEditorB119PropertyRecoveryE2E", layer = 1 }',
  'function menu.createFrame()',
  '  local frame = Helper.createFrameHandle(menu, { width = 100, height = 80, layer = 2, standardButtons = true, blurBackground = true })',
  '  local table = frame:addTable(3, { width = 80, scaling = false })',
  '  local row = table:addRow(false, { height = 20, interactive = true })',
  '  local text = row[1]:createText("Title", { width = 20, height = 10, fontsize = 12, font = "Zekton", halign = "center", wordwrap = true, scaling = true, x = 1, y = 2 })',
  '  local button = row[2]:createButton({ width = 30, height = 20, active = true, scaling = false, affectRowHeight = true })',
  '  button:setText("Press", { fontsize = 11, ["mystery-key"] = 3 })',
  '  button:setText2("Secondary", { font = "Zekton" })',
  '  local input = row[3]:createEditBox({ width = 40, height = 18, defaultText = "Type here", description = "Description", maxChars = 32, selectTextOnActivation = true, active = true, scaling = true })',
  '  local dynamicRow = table:addRow(false, {})',
  '  local dynamicWidth = getWidth()',
  '  dynamicRow[1]:createButton({ width = dynamicWidth, height = 20 })',
  '  local calculatedRow = table:addRow(false, {})',
  '  local calculatedHeight = 10 + 5',
  '  calculatedRow[1]:createButton({ width = 20, height = calculatedHeight })',
  '  frame:display()',
  'end',
  '',
].join('\n');
const actualE2ePropertyWorkspace: ModWorkspace = {
  ...actualWorkspace,
  id: 'b119-property-recovery-e2e-session-selftest',
  name: 'B119 property recovery E2E session selftest',
  passthroughFiles: [
    { path: 'ui.xml', content: '<addon><environment type="menus"><file name="ui/b119-property-recovery-e2e.lua"/></environment></addon>', reason: 'partial' },
    { path: 'ui/b119-property-recovery-e2e.lua', content: actualE2ePropertyLua, reason: 'partial' },
  ],
};
const actualE2eSource = buildX4UiWorkspaceSource(actualE2ePropertyWorkspace);
if (!actualE2eSource.bundle) throw new Error('actual E2E property source fixture did not build a bundle');
const actualE2eSourceFile = actualE2eSource.bundle.sourceFiles.find(file => file.path === 'ui/b119-property-recovery-e2e.lua');
if (!actualE2eSourceFile) throw new Error('actual E2E property source fixture Lua file missing');
const actualE2eModel = normalizeX4UiSourceEditLayoutModel(actualE2eSourceFile.callModel);
const actualE2eTargetCatalog = createX4UiLayoutTargetCatalog(actualE2eModel);
const actualE2eTarget = actualE2eTargetCatalog.targets.find(candidate => candidate.kind === 'function' && candidate.name === 'menu.createFrame');
assert.ok(actualE2eTarget, 'actual E2E property source fixture must issue the exact menu.createFrame target');
const actualE2eSelectedSession = projectX4UiEditorSession({
  workspace: actualE2ePropertyWorkspace,
  corpus: controlledUnitCorpus,
  profile: { width: 2560, height: 1440, uiScale: 1.4 },
  selection: {
    sourceIndex: actualE2eSourceFile.index,
    path: actualE2eSourceFile.path,
    sourceIdentity: actualE2eTargetCatalog.sourceIdentity,
    target: { ...actualE2eTarget, id: actualE2eTarget.id },
  },
});
const actualE2eProgramResult = actualE2eSelectedSession.preview.program;
const actualE2eSceneResult = actualE2eSelectedSession.preview.scene;
assert.ok(actualE2eProgramResult !== undefined && actualE2eProgramResult.status !== 'refused', 'actual E2E property source selected Session must issue a Layout program');
assert.ok(actualE2eSceneResult !== undefined && actualE2eSceneResult.status !== 'refused', 'actual E2E property source selected Session must issue a Scene');
const actualE2ePresentation = buildX4UiBuilderPresentation(actualE2eSelectedSession);
const previewInputLua = [
  'local menu = { name = "B119PreviewInputs" }',
  'function menu.createFrame()',
  '  local frame = Helper.createFrameHandle(menu, { width = 200, height = 120 })',
  '  local knownTable = frame:addTable(1, { width = 100, scaling = false })',
  '  local knownRow = knownTable:addRow(false, {})',
  '  knownRow[1]:createText("Always visible", {})',
  '  local table = frame:addTable(1, { width = previewWidth, y = 30, scaling = previewScaling })',
  '  local row = table:addRow(false, {})',
  '  row[1]:createText(previewText, {})',
  '  local row2 = table:addRow(false, {})',
  '  row2[1]:createText(previewText, {})',
  '  frame:display()',
  'end',
].join('\n');
const previewInputWorkspace: ModWorkspace = {
  ...actualE2ePropertyWorkspace,
  passthroughFiles: actualE2ePropertyWorkspace.passthroughFiles!.map(file => file.path.endsWith('.lua') ? { ...file, content: previewInputLua } : file),
};
const previewInputSource = buildX4UiWorkspaceSource(previewInputWorkspace);
const previewInputFile = previewInputSource.bundle?.sourceFiles.find(file => file.path.endsWith('.lua'));
assert.ok(previewInputFile);
const previewInputTargets = createX4UiLayoutTargetCatalog(normalizeX4UiSourceEditLayoutModel(previewInputFile.callModel));
const previewInputTarget = previewInputTargets.targets.find(candidate => candidate.kind === 'function' && candidate.name === 'menu.createFrame');
assert.ok(previewInputTarget);
const previewInputSession = projectX4UiEditorSession({
  workspace: previewInputWorkspace,
  corpus: controlledUnitCorpus,
  profile: { width: 2560, height: 1440, uiScale: 1.4 },
  selection: { sourceIndex: previewInputFile.index, path: previewInputFile.path, sourceIdentity: previewInputTargets.sourceIdentity, target: previewInputTarget },
});
const previewInputCatalog = previewInputSession.sampleCatalog;
assert.ok(previewInputCatalog && previewInputCatalog.entries.length >= 3, 'actual source must issue typed preview inputs');
const previewInputCatalogBefore = JSON.stringify(previewInputCatalog);
const previewInputViews = buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, buildX4UiBuilderPresentation(previewInputSession));
const previewContextPresentation = buildX4UiBuilderPresentation(previewInputSession);
const unrelatedPreviewNode = previewContextPresentation.nodes.find(node => node.label === 'Text · Always visible');
assert.ok(unrelatedPreviewNode);
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, previewContextPresentation, unrelatedPreviewNode), [],
  'known unrelated element must not inherit another table\'s preview controls');
const unresolvedInputTable = previewContextPresentation.nodes.find(node => node.label === 'Table 2')!;
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, previewContextPresentation, unresolvedInputTable).map(view => view.entry),
  previewInputCatalog.entries.filter(entry => entry.expectedType !== 'string'), 'unissued cell identities do not invent associations; table geometry inputs remain reachable');
function verifyPreviewContextRelationships(previewContextPresentation: ReturnType<typeof buildX4UiBuilderPresentation>, previewInputCatalog: NonNullable<typeof previewInputSession.sampleCatalog>): void {
const firstTextInput = previewInputCatalog.entries.find(entry => entry.expectedType === 'string')!;
const firstInputCell = previewContextPresentation.nodes.find(node => node.kind === 'cell'
  && node.propertyOperationIds.includes(firstTextInput.consumers[0]!.operationId));
assert.ok(firstInputCell, 'the projected read retains its exact source cell');
const firstInputRow = previewContextPresentation.nodes.find(node => node.id === firstInputCell.parentId)!;
const inputTable = previewContextPresentation.nodes.find(node => node.id === firstInputRow.parentId)!;
const previewContextBefore = JSON.stringify(previewContextPresentation);
const expectedCellInputs = previewInputCatalog.entries.filter(entry => entry.expectedType !== 'string' || entry === firstTextInput);
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, previewContextPresentation, firstInputCell).map(view => view.entry),
  expectedCellInputs, 'cell inherits table geometry inputs, but not an equal expression in a sibling row');
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, previewContextPresentation, firstInputRow).map(view => view.entry),
  expectedCellInputs, 'row includes its descendant cell and ancestor table');
const tableInputViews = buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, previewContextPresentation, inputTable);
assert.deepEqual(tableInputViews.map(view => view.entry), previewInputCatalog.entries, 'table includes both separate descendant reads');
assert.ok(tableInputViews.every((view, index) => view.entry === previewInputCatalog.entries[index]), 'context retains original entry objects');
assert.equal(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, previewContextPresentation, firstInputCell)
  .find(view => view.entry === firstTextInput)?.label, 'Text', 'context labels are disambiguated locally');
for (const wrongCatalog of [
  { ...previewInputCatalog, sourceIdentity: { ...previewInputCatalog.sourceIdentity, sha256: 'wrong-source' } },
  { ...previewInputCatalog, targetId: 'wrong-target' },
]) {
  assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(wrongCatalog, previewContextPresentation, firstInputCell), [], 'foreign catalog fails closed');
}
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, previewContextPresentation, { ...firstInputCell }), [], 'copied selection is not current membership');
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(null, previewContextPresentation, firstInputCell), []);
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, undefined, firstInputCell), []);
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, {
  ...previewContextPresentation, nodes: [...previewContextPresentation.nodes, firstInputCell],
}, firstInputCell), [], 'ambiguous duplicate node IDs fail closed');
const cyclicCell = { ...firstInputCell, childIds: [firstInputCell.id], parentId: firstInputCell.id };
assert.deepEqual(buildX4UiBuilderPreviewInputPresentation(previewInputCatalog, {
  ...previewContextPresentation, nodes: [cyclicCell],
}, cyclicCell).map(view => view.entry), [firstTextInput], 'malformed cycle terminates without including unrelated operations');
assert.equal(JSON.stringify(previewContextPresentation), previewContextBefore, 'context does not change issued geometry or hierarchy');
}
assert.ok(buildX4UiBuilderPresentation(previewInputSession).nodes.some(node => node.label === 'Text · Always visible'), 'known content remains available before missing preview inputs are supplied');
assert.deepEqual(previewInputViews.map(view => view.entry), previewInputCatalog.entries, 'presentation preserves every exact source entry in order');
for (const type of ['number', 'string', 'boolean']) {
  assert.ok(previewInputViews.some(view => view.entry.expectedType === type), `actual source must issue ${type} input`);
}
assert.ok(previewInputViews.some(view => /Width/.test(view.label)));
assert.ok(previewInputViews.some(view => /Text/.test(view.label)));
assert.ok(previewInputViews.some(view => /Scale with UI/.test(view.label)));
assert.equal(new Set(previewInputViews.map(view => view.label)).size, previewInputViews.length, 'same-label controls remain distinguishable without source IDs');
assert.equal(JSON.stringify(previewInputCatalog), previewInputCatalogBefore, 'presentation cannot mutate source catalog');
assert.equal(previewInputViews.filter(view => view.entry.expectedType === 'string').length, 2, 'equal expressions at separate source reads remain separate controls');
assert.ok(previewInputViews.every(view => view.affectedElements.length > 0), 'each actual input explains its consumers without requiring source IDs');
const unknownPreviewInput = { ...previewInputCatalog.entries[0], consumers: [{ ...previewInputCatalog.entries[0].consumers[0], field: 'internal.numeric:binding' }] };
const unknownPreviewViews = buildX4UiBuilderPreviewInputPresentation({ ...previewInputCatalog, entries: [unknownPreviewInput] });
assert.strictEqual(unknownPreviewViews[0].entry, unknownPreviewInput);
assert.doesNotMatch(unknownPreviewViews[0].label, /internal|binding|source/i, 'unknown metadata remains a generic typed input, not compiler jargon');
const previewDraft = Object.fromEntries(previewInputCatalog.entries.map(entry => [entry.id, entry.expectedType === 'number' ? '100' : entry.expectedType === 'boolean' ? 'false' : 'A long preview message\nwith a second line']));
const previewApplied = applyX4UiEditorSampleDraft(undefined, previewInputCatalog, previewDraft, previewInputSession.sampleCatalogAuthority);
assert.notEqual(previewApplied.status, 'refused');
assert.ok(previewApplied.samples);
const previewAppliedSession = projectX4UiEditorSession({
  workspace: previewInputWorkspace,
  corpus: controlledUnitCorpus,
  profile: { width: 2560, height: 1440, uiScale: 1.4 },
  selection: { sourceIndex: previewInputFile.index, path: previewInputFile.path, sourceIdentity: previewInputTargets.sourceIdentity, target: previewInputTarget },
  samples: previewApplied.samples,
  sampleBinding: previewInputSession.sampleBinding,
  sampleCatalogAuthority: previewInputSession.sampleCatalogAuthority,
});
assert.equal(previewAppliedSession.samples?.values.length, 4, 'the normal Session accepts all four explicitly applied values');
assert.equal(buildX4UiBuilderPresentation(previewAppliedSession).nodes.filter(node => node.kind === 'text' && node.label.startsWith('Text · A long preview message')).length, 2, 'both independent source reads reach actual Scene text after sample adoption');
const activePreviewCatalog = previewAppliedSession.sampleCatalog;
assert.ok(activePreviewCatalog);
verifyPreviewContextRelationships(buildX4UiBuilderPresentation(previewAppliedSession), activePreviewCatalog);
assert.equal(applyX4UiEditorSampleDraft(previewApplied.samples, previewInputCatalog, {}, previewInputSession.sampleCatalogAuthority).status, 'refused', 'a new Session expires the preceding catalog authority');
const previewNumber = activePreviewCatalog.entries.find(entry => entry.expectedType === 'number')!;
const previewInvalid = applyX4UiEditorSampleDraft(previewAppliedSession.samples, activePreviewCatalog, { [previewNumber.id]: 'not a number' }, previewAppliedSession.sampleCatalogAuthority);
assert.equal(previewInvalid.status, 'refused');
assert.deepEqual(previewInvalid.samples, previewAppliedSession.samples, 'invalid preview draft preserves accepted values under current authority');
const previewCleared = applyX4UiEditorSampleDraft(previewAppliedSession.samples, activePreviewCatalog, Object.fromEntries(activePreviewCatalog.entries.map(entry => [entry.id, ''])), previewAppliedSession.sampleCatalogAuthority);
assert.equal(previewCleared.status, 'reset');
assert.equal(previewCleared.samples, undefined);
assert.equal(applyX4UiEditorSampleDraft(previewAppliedSession.samples, activePreviewCatalog, {}, {}).status, 'refused', 'forged authority cannot clear preview');
assert.equal(previewInputWorkspace.passthroughFiles!.find(file => file.path.endsWith('.lua'))!.content, previewInputLua, 'preview transactions never rewrite source');

// A caption is source information even when its parent has no drawable position.
const captionDiscoveryLua = [
  'local menu = {}', 'function menu.createFrame()',
  ' local frame = Helper.createFrameHandle(menu, { width = 800, height = 500 })',
  ' local t = frame:addTable(3, { width = 600, y = menu.previewY, scaling = false })',
  ' local row = t:addRow(false, { height = 30 })',
  ' row[1]:createButton({ height = 20 }):setText("Repeat"):setText2("Secondary")',
  ' row[2]:createButton({ height = 20 }):setText("Repeat")',
  ' row[3]:createText(menu.caption, { height = 20, fontsize = 12, scaling = false })',
  ' frame:display()', 'end',
].join('\n');
const captionDiscoveryWorkspace: ModWorkspace = { ...actualE2ePropertyWorkspace,
  passthroughFiles: actualE2ePropertyWorkspace.passthroughFiles!.map(file => file.path.endsWith('.lua') ? { ...file, content: captionDiscoveryLua } : file),
};
const captionDiscoveryBefore = JSON.stringify(captionDiscoveryWorkspace);
const captionFile = buildX4UiWorkspaceSource(captionDiscoveryWorkspace).bundle?.sourceFiles.find(file => file.path.endsWith('.lua'));
assert.ok(captionFile);
const captionTargets = createX4UiLayoutTargetCatalog(normalizeX4UiSourceEditLayoutModel(captionFile.callModel));
const captionTarget = captionTargets.targets.find(candidate => candidate.kind === 'function' && candidate.name === 'menu.createFrame');
assert.ok(captionTarget);
const captionInput = { workspace: captionDiscoveryWorkspace, corpus: controlledUnitCorpus,
  profile: { width: 2560, height: 1440, uiScale: 1.4 },
  selection: { sourceIndex: captionFile.index, path: captionFile.path, sourceIdentity: captionTargets.sourceIdentity, target: captionTarget },
};
const captionSession = projectX4UiEditorSession(captionInput);
const captionPresentation = buildX4UiBuilderPresentation(captionSession);
const repeatedCaptions = captionPresentation.nodes.filter(node => node.label === 'Text · Repeat');
assert.equal(repeatedCaptions.length, 2, 'known repeated captions remain discoverable before table Y is supplied');
assert.notEqual(repeatedCaptions[0].id, repeatedCaptions[1].id, 'equal captions do not merge cell identities');
for (const node of repeatedCaptions) {
  assert.equal(node.rect, undefined); assert.equal(node.clipRect, undefined); assert.equal(node.selectable, false);
  const inputs = buildX4UiBuilderPreviewInputPresentation(captionSession.sampleCatalog, captionPresentation, node);
  assert.deepEqual(inputs.map(view => view.label), ['Position Y'], 'caption directly exposes ancestor Y, not sibling unknown text');
}
assert.equal(captionPresentation.nodes.filter(node => node.label === 'Secondary text · Secondary').length, 1);
assert.ok(captionPresentation.nodes.some(node => node.kind === 'text' && node.label === 'Text'), 'unknown caption is not invented');
assert.ok(captionPresentation.nodes.every(node => !node.label.includes('menu.caption')));
assert.equal(hitTestX4UiBuilderCanvas(repeatedCaptions, { x: 1, y: 1 }), undefined, 'unresolved captions never become canvas hit targets');
const captionScene = captionSession.preview.scene;
assert.ok(captionScene && captionScene.status !== 'refused');
const foreignCaptionScene = buildX4UiBuilderPresentation({ ...captionSession, preview: { ...captionSession.preview,
  scene: { ...captionScene, scene: { ...captionScene.scene,
    profile: { ...captionScene.scene.profile, source: { ...captionScene.scene.profile.source, sha256: 'foreign' } },
  } },
} });
assert.ok(foreignCaptionScene.nodes.every(node => node.kind !== 'widget' && node.kind !== 'text'), 'foreign Scene cannot issue fallback captions');
const captionProgram = captionSession.preview.program;
assert.ok(captionProgram && captionProgram.status !== 'refused');
const firstCaptionCell = captionProgram.program.cells.find(cell => cell.descriptorFacts.text?.status === 'known' && cell.descriptorFacts.text.value === 'Repeat')!;
const firstCaptionCreator = captionProgram.program.operations.find(operation => operation.cellId === firstCaptionCell.id && operation.kind === 'createButton')!;
assert.ok(firstCaptionCreator);
const ambiguousCaption = buildX4UiBuilderPresentation({ ...captionSession, preview: { ...captionSession.preview,
  program: { ...captionProgram, program: { ...captionProgram.program, operations: [...captionProgram.program.operations, firstCaptionCreator] } },
} });
assert.ok(!ambiguousCaption.nodes.some(node => (node.kind === 'widget' || node.kind === 'text') && node.id.includes(firstCaptionCell.id)), 'ambiguous creator membership does not manufacture a source association');
const captionCatalog = captionSession.sampleCatalog!;
const captionY = captionCatalog.entries.find(entry => entry.expectedType === 'number' && entry.consumers.some(consumer => consumer.field === 'y'))!;
assert.ok(captionY);
const captionApplied = applyX4UiEditorSampleDraft(undefined, captionCatalog, { [captionY.id]: '80' }, captionSession.sampleCatalogAuthority);
assert.notEqual(captionApplied.status, 'refused');
const captionRecovered = projectX4UiEditorSession({ ...captionInput, samples: captionApplied.samples,
  sampleBinding: captionSession.sampleBinding, sampleCatalogAuthority: captionSession.sampleCatalogAuthority });
const captionRecoveredPresentation = buildX4UiBuilderPresentation(captionRecovered);
for (const before of repeatedCaptions) {
  const after = captionRecoveredPresentation.nodes.find(node => node.id === before.id);
  assert.ok(after?.selectable, 'supplying Y restores the same recognizable identity with issued geometry');
  assert.deepEqual(after.propertyOperationIds, before.propertyOperationIds);
}
assert.equal(JSON.stringify(captionDiscoveryWorkspace), captionDiscoveryBefore);
console.log('B119_UNRESOLVED_CAPTION_DISCOVERY PASS: exact duplicate captions, slots, missing geometry, scoped inputs and current recovery');
assert.equal(actualE2eSelectedSession.status, 'partial', 'unit-only selected E2E Session retains its honest partial status');
assert.equal(actualE2ePresentation.status, 'partial', 'unit-only selected E2E hierarchy retains its honest partial status');
const actualE2eCreator = (kind: 'createText' | 'createButton' | 'createEditBox', sourceLine: number) => {
  const matches = actualE2eProgramResult.program.operations.filter(operation => operation.kind === kind && operation.source.start.line === sourceLine);
  assert.equal(matches.length, 1, `actual E2E selected Session must issue one ${kind} creator at line ${sourceLine}`);
  return matches[0];
};
const actualE2eWidget = (creator: { readonly cellId?: string }, widgetKind: 'text' | 'button' | 'editbox') => {
  assert.ok(creator.cellId, `actual E2E ${widgetKind} creator must retain its exact cell owner`);
  const widget = actualE2ePresentation.nodes.find(node => node.id === `scene:widget:${creator.cellId}:${widgetKind}`);
  assert.ok(widget, `actual E2E selected Session must retain the ${widgetKind} widget for its issued creator`);
  return widget;
};
const actualE2eTextCreator = actualE2eCreator('createText', 6);
const actualE2eButtonCreator = actualE2eCreator('createButton', 7);
const actualE2eInputCreator = actualE2eCreator('createEditBox', 10);
const actualE2eDynamicCreator = actualE2eCreator('createButton', 13);
const actualE2eCalculatedCreator = actualE2eCreator('createButton', 16);
assert.equal(actualE2eTextCreator.status, 'applied', 'actual E2E Text creator is applied');
assert.equal(actualE2eButtonCreator.status, 'applied', 'actual E2E Button creator is applied');
assert.equal(actualE2eInputCreator.status, 'applied', 'actual E2E Input creator is applied');
assert.equal(actualE2eDynamicCreator.status, 'unresolved', 'actual E2E dynamic creator remains unresolved');
assert.equal(actualE2eCalculatedCreator.status, 'applied', 'actual E2E calculated creator remains applied');
assert.equal(actualE2eWidget(actualE2eTextCreator, 'text').label, 'Widget · Title', 'actual E2E Text widget identity is source-issued');
assert.equal(actualE2eWidget(actualE2eButtonCreator, 'button').label, 'Widget · Press', 'actual E2E Button widget identity is source-issued');
assert.equal(actualE2eWidget(actualE2eInputCreator, 'editbox').label, 'Widget', 'actual E2E Input widget identity is source-issued');
const actualInputTextId = `scene:text:${actualE2eInputCreator.cellId}:primary`;
const actualInputText = actualE2eSceneResult.scene.texts.find(node => node.id === actualInputTextId);
assert.ok(actualInputText, 'actual Input creator must issue its Text child');
assert.equal(actualInputText.contentSelection, 'preview-default', 'actual inactive Input Scene selects default content');
assert.equal(actualInputText.defaultContent, 'Type here');
assert.equal(actualE2ePresentation.nodes.find(node => node.id === actualInputTextId)?.label, 'Text · Type here',
  'Input hierarchy must show the same source-issued default content selected for the canvas');
const inputContentLabel = (fields: Partial<typeof actualInputText>): string | undefined => buildX4UiBuilderPresentation({
  ...actualE2eSelectedSession,
  preview: { ...actualE2eSelectedSession.preview, scene: { ...actualE2eSceneResult,
    scene: { ...actualE2eSceneResult.scene, texts: actualE2eSceneResult.scene.texts.map(node =>
      node.id === actualInputTextId ? { ...node, ...fields } : node) },
  } },
}).nodes.find(node => node.id === actualInputTextId)?.label;
// Presentation-only branch controls; these do not issue new Scene/paint authority.
assert.equal(inputContentLabel({ contentSelection: 'current', content: 'Typed value' }), 'Text · Typed value');
assert.equal(inputContentLabel({ contentSelection: 'runtime-choice-unavailable', content: '' }), 'Text');
assert.equal(inputContentLabel({ contentSelection: 'unavailable', content: undefined }), 'Text');
assert.equal(inputContentLabel({ contentSelection: 'preview-default', content: 'Not selected', defaultContent: undefined }), 'Text');
assert.equal(actualE2eWidget(actualE2eDynamicCreator, 'button').label, 'Widget', 'actual E2E dynamic widget identity is source-issued');
assert.equal(actualE2eWidget(actualE2eCalculatedCreator, 'button').label, 'Widget', 'actual E2E calculated widget identity is source-issued');
assert.equal(actualE2ePresentation.nodes.some(node => node.id === `scene:text:${actualE2eTextCreator.cellId}:primary` && node.label === 'Text · Title'), true, 'actual E2E Text child follows its source-issued widget');

const actualEntrySummary = actualPropertyCatalog.entries.map(entry => (
  entry.kind === 'editable'
    ? `${entry.kind}:${entry.provenance.callName}:${entry.provenance.fields.join('|')}:${entry.value}`
    : `${entry.kind}:${entry.callName ?? 'unknown'}:${entry.field}:${entry.reason}`
)).join('\n');
const actualEntry = (
  predicate: (entry: typeof actualPropertyCatalog.entries[number]) => boolean,
  label: string,
) => {
  const found = actualPropertyCatalog.entries.find(predicate);
  assert.ok(found, `${label} missing from actual producer catalog (${actualPropertyCatalog.status}; ${actualPropertyCatalog.reason ?? 'no reason'}; ${actualPropertyCatalog.detail}):\n${actualEntrySummary}`);
  return found!;
};

const actualTextEntry = actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'createText'
    && entry.provenance.fields.includes('semantics.text')
    && entry.value === 'Title',
  'source-issued Text property',
);
assert.equal(actualTextEntry.kind, 'editable');
assert.equal(actualTextEntry.provenance.operationId.length > 0, true, 'actual Text property retains operation identity');
const actualSecondaryEntry = actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'setText2'
    && entry.provenance.fields.includes('semantics.text')
    && entry.value === 'Secondary',
  'source-issued secondary Text property',
);
assert.equal(actualSecondaryEntry.kind, 'editable');
actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'createEditBox'
    && entry.provenance.fields.includes('semantics.editBox.defaultText')
    && entry.provenance.fields.includes('semantics.properties.defaultText'),
  'joined editBox default text property',
);
actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'createEditBox'
    && entry.provenance.fields.includes('semantics.editBox.description'),
  'nested editBox description property',
);
actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'scaleX'
    && entry.provenance.fields.includes('semantics.scale.input')
    && entry.provenance.fields.includes('arguments[0]'),
  'joined scaleX input property',
);
actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'scaleFont'
    && entry.provenance.fields.includes('semantics.scale.fontname')
    && entry.provenance.fields.includes('arguments[0]')
    && entry.value === 'Zekton',
  'joined scaleFont font-name property',
);
actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'scaleFont'
    && entry.provenance.fields.includes('semantics.scale.fontsize')
    && entry.provenance.fields.includes('arguments[1]')
    && entry.value === 14,
  'joined scaleFont font-size property',
);
actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'scaleFont'
    && entry.provenance.fields.includes('semantics.scale.enabled')
    && entry.provenance.fields.includes('arguments[2]')
    && entry.value === true,
  'joined scaleFont enablement property',
);
const actualUnknownEntry = actualEntry(
  entry => entry.kind === 'locked'
    && entry.callName === 'setText'
    && entry.field === 'semantics.unsupportedProperties.mystery-key'
    && entry.reason === 'operation-not-applied',
  'unknown actual source property',
);
const actualJoinedFontSizeLock = actualEntry(
  entry => entry.kind === 'locked'
    && entry.callName === 'setText'
    && entry.field === 'semantics.fontsize,semantics.properties.fontsize'
    && entry.reason === 'operation-not-applied',
  'joined locked font-size property',
);
const actualDynamicEntry = actualEntry(
  entry => entry.kind === 'locked' && entry.reason === 'dynamic-value' && entry.callName === 'createButton',
  'dynamic source-issued locked property',
);
const actualAliasedEntry = actualEntry(
  entry => entry.kind === 'locked' && entry.reason === 'aliased-value' && entry.callName === 'createButton',
  'aliased source-issued locked property',
);
const actualCalculatedEntry = actualEntry(
  entry => entry.kind === 'locked'
    && entry.reason === 'constant-folded-value'
    && entry.callName === 'createButton'
    && entry.field === 'semantics.properties.height',
  'calculated source-issued locked property',
);
const actualLayerEntry = actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'createFrameHandle'
    && entry.provenance.fields.includes('semantics.layer')
    && entry.value === 2,
  'source-issued frame layer property',
);
const actualActiveEntry = actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'createButton'
    && entry.provenance.fields.includes('semantics.properties.active')
    && entry.value === true,
  'source-issued button active property',
);
const actualInteractiveEntry = actualEntry(
  entry => entry.kind === 'editable'
    && entry.provenance.callName === 'addRow'
    && entry.provenance.fields.includes('semantics.properties.interactive')
    && entry.value === true,
  'source-issued row interactive property',
);
assert.equal(actualPropertyCatalog.entries.some(entry => entry.kind === 'locked' && entry.field.includes(',')), true, 'locked producer records retain comma-joined source roles');
assert.equal(actualDynamicEntry.kind, 'locked');
assert.equal(actualAliasedEntry.kind, 'locked');
assert.equal(actualCalculatedEntry.kind, 'locked');

const actualPropertyPresentation = buildX4UiBuilderPropertyPresentation(actualPropertyCatalog.entries);
assert.equal(actualPropertyPresentation.primary.every(view => view.entry === actualPropertyCatalog.entries.find(entry => entry.id === (view.entry as { id: string }).id)), true, 'presentation retains exact entry object identity');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualTextEntry && view.label === 'Text'), true, 'shared mapper gives source-issued text a semantic label');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualSecondaryEntry && view.label === 'Secondary text'), true, 'shared mapper distinguishes secondary text');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry.kind === 'editable' && view.entry.provenance.callName === 'createEditBox' && view.label === 'Default text'), true, 'shared mapper exposes input default text');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry.kind === 'editable' && view.entry.provenance.callName === 'scaleX' && view.label === 'Horizontal value'), true, 'shared mapper distinguishes horizontal scale value');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry.kind === 'editable' && view.entry.provenance.callName === 'scaleX' && view.label === 'UI-scale enabled'), true, 'shared mapper distinguishes scale enablement');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualDynamicEntry && view.recovery?.includes('controlled by menu logic')), true, 'dynamic recovery explains why the literal is locked');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualAliasedEntry && view.recovery?.includes('shared from another source')), true, 'aliased recovery explains why the literal is locked');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualCalculatedEntry && view.recovery?.includes('calculated by the menu')), true, 'calculated recovery explains why the control is locked');
const actualUnknownView = actualPropertyPresentation.primary.find(view => view.entry === actualUnknownEntry);
assert.ok(actualUnknownView, 'unknown real property remains in the primary presentation');
assert.equal(actualUnknownView.role, 'unsupported', 'unknown punctuation property remains visibly unsupported');
assert.equal(actualUnknownView.availability, 'unsupported', 'unknown punctuation property has no edit authority');
assert.match(actualUnknownView.label, /mystery-key/, 'unknown punctuation property keeps its exact safe display name');
const actualJoinedFontSizeView = actualPropertyPresentation.primary.find(view => view.entry === actualJoinedFontSizeLock);
assert.ok(actualJoinedFontSizeView, 'joined locked font-size property remains in the primary presentation');
assert.equal(actualJoinedFontSizeView.label, 'Font size', 'joined locked semantic and properties roles map to one friendly label');
assert.equal(actualJoinedFontSizeLock.kind, 'locked');
assert.deepEqual(actualJoinedFontSizeLock.field.split(','), ['semantics.fontsize', 'semantics.properties.fontsize'], 'joined font-size lock retains both exact producer roles');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualLayerEntry && view.label === 'Layer' && view.availability === 'supported'), true, 'known frame layer stays a supported semantic property');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualActiveEntry && view.label === 'Active'), true, 'real button active property keeps an active label');
assert.equal(actualPropertyPresentation.primary.some(view => view.entry === actualInteractiveEntry && view.label === 'Interactive'), true, 'real row interactive property keeps an interactive label');
assert.deepEqual(buildX4UiBuilderPropertyPresentation([actualLayerEntry]).notices, [], 'supported frame layer must not produce a false unsupported notice');
assert.equal(actualPropertyPresentation.technical.length > 0, true, 'internal source bindings remain available as technical records');
assert.equal(actualPropertyPresentation.notices.some(notice => notice.includes('Technical source bindings')), true, 'technical records produce one recovery notice');

const syntheticJoinedLocked = {
  kind: 'locked' as const,
  id: 'entry-joined-locked',
  field: 'arguments[0], semantics.scale.input',
  operationId: 'operation-scale',
  callName: 'scaleX' as const,
  reason: 'dynamic-value' as const,
  detail: 'scale is dynamic',
  valueType: 'number' as const,
};
assert.equal(describeX4UiBuilderProperty(syntheticJoinedLocked).label, 'Horizontal value', 'joined locked fields prefer explicit scale semantics over an argument alias');
assert.equal(describeX4UiBuilderProperty({
  ...syntheticJoinedLocked,
  id: 'entry-secondary-locked',
  field: 'arguments[0]',
  callName: 'setText2',
}).label, 'Secondary text', 'argument mapping remains call-aware for secondary text');
assert.equal(describeX4UiBuilderProperty({
  ...syntheticJoinedLocked,
  id: 'entry-inherited-name',
  field: 'semantics.properties.constructor',
  callName: 'createText',
}).label, 'Source property · constructor', 'inherited object names remain neutral unknown properties');

const presentation = buildX4UiBuilderPresentation(projection);
assert.equal(presentation.status, 'available');
assert.deepEqual(presentation.roots, ['scene:frame-1']);
assert.deepEqual(presentation.nodes.find(node => node.id === 'scene:frame-1')?.childIds, ['scene:table-1']);
assert.equal(presentation.nodes.find(node => node.id === 'scene:row-1')?.label, 'Row 1', 'LayoutProgram rowIndex is already one-based');
assert.equal(presentation.nodes.find(node => node.id === 'scene:cell-1')?.label, 'Cell 1', 'LayoutProgram column is already one-based');
const widgetNode = presentation.nodes.find(node => node.id === widget.id);
assert.ok(widgetNode);
assert.equal(widgetNode.widgetKind, 'text', 'generic widget nodes retain the exact Scene widget kind');
assert.equal(presentation.nodes.find(node => node.id === text.id)?.textSlot, 'primary', 'text nodes retain the exact Scene text slot');
const tableNode = presentation.nodes.find(node => node.id === 'scene:table-1');
assert.ok(tableNode);
assert.deepEqual(tableNode.operationIds, table.operationIds, 'table retains aggregate ledger membership for provenance');
assert.deepEqual(tableNode.propertyOperationIds, [tableOperation.id], 'table properties use exact table-owner operations only');
assert.deepEqual(sourceEntriesForX4UiBuilderNode(catalog, tableNode), [tableEntry], 'table inspector must not expose addRow or child-text properties');
assert.deepEqual(widgetNode.operationIds, [operation.id, captionOperation.id, secondaryCaptionOperation.id], 'widget properties must use exact cell operation membership');
assert.deepEqual(presentation.nodes.find(node => node.id === text.id)?.operationIds, [operation.id, captionOperation.id], 'primary caption must bind createText and setText, but not setText2');
assert.equal(presentation.nodes.find(node => node.id === sceneCell.id)?.selectable, false, 'missing Scene rect must remain unresolved');
assert.deepEqual(sourceEntriesForX4UiBuilderNode(catalog, widgetNode), [editableEntry, captionEntry, lockedEntry]);
assert.deepEqual(sourceEntriesForX4UiBuilderNode(catalog, presentation.nodes.find(node => node.id === sceneCell.id)), [editableEntry, captionEntry, lockedEntry], 'unresolved geometry must not discard exact source properties');
assert.equal(hitTestX4UiBuilderCanvas(presentation.nodes, { x: 14, y: 16 })?.id, text.id, 'native-coordinate hit testing must choose the deepest known issued rect');
assert.equal(hitTestX4UiBuilderCanvas(presentation.nodes, { x: 101, y: 81 }), undefined, 'hit testing must not invent geometry');
const clippedNodes = presentation.nodes.map(node => node.id === text.id ? { ...node, clipRect: { x: 60, y: 60, width: 10, height: 10 } } : node);
assert.equal(hitTestX4UiBuilderCanvas(clippedNodes, { x: 14, y: 16 })?.id, widget.id, 'clipRect must prevent an occluded text node from stealing the click');
assert.equal(x4UiBuilderProfileKey(profile), 'fixture-profile|100x80|1');

const rowTwoSource = loc(21, 101);
const cellTwoSource = loc(31, 91);
const widgetTwoSource = loc(41, 66);
const rowTwo = { ...row, id: 'row-2', source: rowTwoSource, rowIndex: 2, cellIds: ['cell-2'], operationIds: [] };
const cellTwo = { ...cell, id: 'cell-2', source: cellTwoSource, rowId: 'row-2', rowIndex: 2, operationIds: [], metadataOperationIds: [] };
const widgetTwo = {
  ...base('scene:widget:cell-2:secondary', 'widget', widgetTwoSource, 6, { x: 10, y: 34, width: 40, height: 16 }),
  cellId: 'scene:cell-2',
  textIds: ['scene:text:cell-2:secondary'],
  primaryContent: '',
};
const secondaryText = {
  ...text,
  id: 'scene:text:cell-2:secondary',
  source: widgetTwoSource,
  parentId: widgetTwo.id,
  widgetId: widgetTwo.id,
  slot: 'secondary',
  content: '',
};
const twoRowProjection = {
  ...projection,
  preview: {
    ...projection.preview,
    program: {
      ...projection.preview.program,
      program: {
        ...program,
        tables: [{ ...table, rowIds: ['row-1', 'row-2'] }],
        rows: [row, rowTwo],
        cells: [cell, cellTwo],
      },
    },
    scene: {
      ...projection.preview.scene,
      scene: {
        ...scene,
        tables: [{ ...sceneTable, rowIds: ['scene:row-1', 'scene:row-2'] }],
        rows: [sceneRow, { ...sceneRow, id: 'scene:row-2', source: rowTwoSource, rowIndex: 2, cellIds: ['scene:cell-2'] }],
        cells: [sceneCell, { ...sceneCell, id: 'scene:cell-2', source: cellTwoSource, rowId: 'scene:row-2', rowIndex: 2, widgetIds: [widgetTwo.id] }],
        widgets: [widget, widgetTwo],
        texts: [text, secondaryText],
      },
    },
  },
} as unknown as X4UiEditorSessionProjection;
const twoRowPresentation = buildX4UiBuilderPresentation(twoRowProjection);
assert.deepEqual(
  twoRowPresentation.nodes.map(node => node.id),
  ['scene:frame-1', 'scene:table-1', 'scene:row-1', 'scene:cell-1', widget.id, text.id, 'scene:row-2', 'scene:cell-2', widgetTwo.id, secondaryText.id],
  'hierarchy display must use exact child-first preorder, not type-grouped projection order',
);
assert.equal(twoRowPresentation.nodes.find(node => node.id === secondaryText.id)?.label, 'Secondary text', 'empty secondary text must retain a friendly label without an internal scene id');

const rowOneNode = twoRowPresentation.nodes.find(node => node.id === 'scene:row-1');
const rowTwoNode = twoRowPresentation.nodes.find(node => node.id === 'scene:row-2');
const cellTwoNode = twoRowPresentation.nodes.find(node => node.id === 'scene:cell-2');
const secondaryTextNode = twoRowPresentation.nodes.find(node => node.id === secondaryText.id);
assert.ok(rowOneNode && rowTwoNode && cellTwoNode && secondaryTextNode);
assert.equal(resolveX4UiBuilderRowForNode(twoRowPresentation.nodes, rowOneNode), rowOneNode, 'a selected row is its own exact row owner');
assert.equal(resolveX4UiBuilderRowForNode(twoRowPresentation.nodes, cellTwoNode), rowTwoNode, 'a selected cell resolves through its exact row parent');
assert.equal(resolveX4UiBuilderRowForNode(twoRowPresentation.nodes, secondaryTextNode), rowTwoNode, 'a selected text descendant resolves through widget and cell to its exact row owner');
assert.equal(resolveX4UiBuilderRowForNode(twoRowPresentation.nodes, { ...cellTwoNode }), undefined, 'a cloned selection object is not accepted as an owner-issued hierarchy node');

const freshRowNodes = twoRowPresentation.nodes.map(node => node.id === rowTwoNode.id
  ? { ...node, operationIds: ['operation-new-row'] }
  : node);
const freshRowCatalog = {
  sourceIdentity: source,
  insertEntries: [{
    kind: 'insert-widget',
    anchor: 'empty-cell',
    frameId: 'frame-1',
    tableId: 'table-1',
    rowId: 'row-2',
    cellId: 'cell-2',
    column: 1,
    rowSource: rowTwoSource,
    cellSource: cellTwoSource,
    provenance: { sourceIdentity: source },
  }],
} as unknown as Parameters<typeof resolveX4UiBuilderNodeAfterSourceRowInsertion>[3];
const insertedRowProof = {
  frameId: 'frame-1',
  tableId: 'table-1',
  rowId: 'row-2',
  rowIndex: 2,
  cellIds: ['cell-2'],
  creatorOperationId: 'operation-new-row',
  creatorCallName: 'addRow' as const,
  creatorSource: rowTwoSource,
  sourceIdentity: source,
};
const movedRowProof = {
  ...insertedRowProof,
  movedFromRowId: 'row-1',
  movedFromRowIndex: 1,
  direction: 'down' as const,
};
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(freshRowNodes, twoRowPresentation.sourceIdentityKey, movedRowProof)?.id,
  rowTwoNode.id,
  'accepted row movement must select the exact fresh moved row, not its first cell or an old row index',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...movedRowProof, movedFromRowIndex: 0 }),
  undefined,
  'row movement must refuse the old zero-based moved-from index',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...movedRowProof, rowIndex: 3 }),
  undefined,
  'row movement must refuse a declared index that does not match the fresh adjacent permutation',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...movedRowProof, cellIds: [] }),
  undefined,
  'row movement must refuse a fresh proof with missing cell ownership',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...movedRowProof, direction: 'sideways' as never }),
  undefined,
  'row movement must refuse a forged direction proof',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...movedRowProof, sourceIdentity: { ...source, sha256: 'b'.repeat(64) } }),
  undefined,
  'row movement must refuse a fresh projection with a different source identity',
);
const duplicateCreatorNodes = [
  ...freshRowNodes,
  { ...rowTwoNode, id: 'scene:row-duplicate-creator', childIds: ['scene:cell-duplicate-creator'], operationIds: ['operation-new-row'] },
  { ...cellTwoNode, id: 'scene:cell-duplicate-creator', parentId: 'scene:row-duplicate-creator' },
];
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(duplicateCreatorNodes, twoRowPresentation.sourceIdentityKey, movedRowProof),
  undefined,
  'row movement must refuse duplicate fresh creator ownership rather than guess a row',
);
const selectedCreatorRepeatedNodes = freshRowNodes.map(node => node.id === rowTwoNode.id
  ? { ...node, operationIds: ['operation-new-row', 'operation-new-row'] }
  : node);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(selectedCreatorRepeatedNodes, twoRowPresentation.sourceIdentityKey, movedRowProof),
  undefined,
  'row movement must refuse a selected fresh row with repeated creator ownership',
);
const duplicateCreatorRepeatedNodes = [
  ...freshRowNodes,
  { ...rowTwoNode, id: 'scene:row-duplicate-creator-repeated', childIds: ['scene:cell-duplicate-creator-repeated'], operationIds: ['operation-new-row', 'operation-new-row'] },
  { ...cellTwoNode, id: 'scene:cell-duplicate-creator-repeated', parentId: 'scene:row-duplicate-creator-repeated' },
];
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowMove(duplicateCreatorRepeatedNodes, twoRowPresentation.sourceIdentityKey, movedRowProof),
  undefined,
  'row movement must count every fresh row owner even when another row repeats the creator operation',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(freshRowNodes, twoRowPresentation.sourceIdentityKey, insertedRowProof, freshRowCatalog)?.id,
  cellTwoNode.id,
  'accepted Add row proof must select the first fresh owner-issued empty cell after exact reprojected row mapping',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(freshRowNodes, twoRowPresentation.sourceIdentityKey, insertedRowProof, { ...freshRowCatalog, insertEntries: [] })?.id,
  rowTwoNode.id,
  'a fresh row with no eligible empty-cell entry must retain the exact new row selection',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...insertedRowProof, creatorOperationId: 'operation-other' }, freshRowCatalog),
  undefined,
  'row continuation must refuse a forged creator operation identity',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(selectedCreatorRepeatedNodes, twoRowPresentation.sourceIdentityKey, insertedRowProof, freshRowCatalog),
  undefined,
  'row continuation must refuse a selected fresh row with repeated creator ownership',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(duplicateCreatorRepeatedNodes, twoRowPresentation.sourceIdentityKey, insertedRowProof, freshRowCatalog),
  undefined,
  'row continuation must count every fresh row owner even when another row repeats the creator operation',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...insertedRowProof, creatorSource: rowSource }, freshRowCatalog),
  undefined,
  'row continuation must refuse a forged creator source range',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(freshRowNodes, twoRowPresentation.sourceIdentityKey, { ...insertedRowProof, sourceIdentity: { ...source, sha256: 'b'.repeat(64) } }, freshRowCatalog),
  undefined,
  'row continuation must refuse a fresh projection with a different source identity',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceRowInsertion(freshRowNodes, twoRowPresentation.sourceIdentityKey, insertedRowProof, {
    ...freshRowCatalog,
    insertEntries: [...(freshRowCatalog.insertEntries ?? []), ...(freshRowCatalog.insertEntries ?? [])],
  }),
  undefined,
  'row continuation must refuse ambiguous fresh owner-issued cell entries rather than guess a cell',
);

const workspace = {};
const selection: X4UiBuilderSelection = {
  nodeId: widget.id,
  workspace,
  sourceIdentityKey: presentation.sourceIdentityKey ?? '',
  targetId: target.id,
  profileKey: presentation.profileKey ?? '',
};
assert.equal(reconcileX4UiBuilderSelection(selection, { workspace, sourceIdentityKey: presentation.sourceIdentityKey, targetId: target.id, profileKey: presentation.profileKey }, presentation.nodes), selection);
assert.equal(reconcileX4UiBuilderSelection(selection, { workspace: {}, sourceIdentityKey: presentation.sourceIdentityKey, targetId: target.id, profileKey: presentation.profileKey }, presentation.nodes), undefined, 'workspace drift must clear local selection');
assert.equal(reconcileX4UiBuilderSelection(selection, { workspace, sourceIdentityKey: 'b'.repeat(64), targetId: target.id, profileKey: presentation.profileKey }, presentation.nodes), undefined, 'source drift must clear local selection');

const menuBounds = deriveX4UiBuilderMenuBounds(presentation, 100, 80);
assert.deepEqual(menuBounds, { x: 0, y: 0, width: 100, height: 80 }, 'Fit menu must include the full issued frame extent, including blank menu space');
const issuedFrameNode = presentation.nodes.find(node => node.kind === 'frame');
assert.ok(issuedFrameNode);
const sparseFrameBounds = deriveX4UiBuilderMenuBounds({
  nodes: [{ ...issuedFrameNode, rect: { x: 0, y: 0, width: 530, height: 180 }, childIds: [] }],
}, 530, 180);
assert.deepEqual(sparseFrameBounds, { x: 0, y: 0, width: 530, height: 180 }, 'sparse menus must fit the whole issued frame, not only a readable leaf');
const blankTableNode = presentation.nodes.find(node => node.kind === 'table');
assert.ok(blankTableNode);
const blankTableBounds = deriveX4UiBuilderMenuBounds({
  nodes: [{ ...blankTableNode, rect: { x: 12, y: 8, width: 530, height: 180 }, childIds: [] }],
}, 600, 220);
assert.deepEqual(blankTableBounds, { x: 12, y: 8, width: 530, height: 180 }, 'a blank issued table remains a valid Fit-menu extent when no frame rect is available');
const fitMenuViewport = computeX4UiBuilderViewport({
  drawableWidth: 100,
  drawableHeight: 80,
  viewportWidth: 400,
  viewportHeight: 300,
  menuBounds: { x: 10, y: 12, width: 40, height: 16 },
  mode: 'fit-menu',
  margin: 16,
});
assert.equal(fitMenuViewport.fallbackFromMenu, false);
assert.ok(fitMenuViewport.scale > 1, 'Fit menu must make the issued content readable');
assert.ok(Math.abs(fitMenuViewport.stageWidth / fitMenuViewport.stageHeight - 100 / 80) < 1e-9, 'viewport must preserve native aspect ratio');
assert.ok(fitMenuViewport.scrollLeft > 0 || fitMenuViewport.scrollTop > 0, 'Fit menu must center a bounded menu extent through the scroll offset');
const fitScreenViewport = computeX4UiBuilderViewport({
  drawableWidth: 2560,
  drawableHeight: 1440,
  viewportWidth: 920,
  viewportHeight: 500,
  menuBounds,
  mode: 'fit-screen',
  margin: 16,
});
assert.ok(fitScreenViewport.scale < 1);
assert.ok(Math.abs(fitScreenViewport.stageWidth / fitScreenViewport.stageHeight - 2560 / 1440) < 1e-9, 'Fit screen must not stretch either axis');
const oneToOneViewport = computeX4UiBuilderViewport({
  drawableWidth: 100,
  drawableHeight: 80,
  viewportWidth: 400,
  viewportHeight: 300,
  menuBounds,
  mode: 'one-to-one',
});
assert.equal(oneToOneViewport.scale, 1);
const manualViewport = computeX4UiBuilderViewport({
  drawableWidth: 100,
  drawableHeight: 80,
  viewportWidth: 400,
  viewportHeight: 300,
  menuBounds,
  mode: 'manual',
  manualScale: 2.25,
});
assert.equal(manualViewport.scale, 2.25);
const missingMenuViewport = computeX4UiBuilderViewport({
  drawableWidth: 100,
  drawableHeight: 80,
  viewportWidth: 400,
  viewportHeight: 300,
  mode: 'fit-menu',
});
assert.equal(missingMenuViewport.fallbackFromMenu, true, 'Fit menu must fail closed to Fit screen when no issued content bounds exist');
const boundedManualViewport = computeX4UiBuilderViewport({
  drawableWidth: 100,
  drawableHeight: 80,
  viewportWidth: 400,
  viewportHeight: 300,
  mode: 'manual',
  manualScale: 1e308,
});
assert.equal(boundedManualViewport.scale, 16, 'manual zoom must be bounded by the pure viewport helper');
assert.equal(Number.isFinite(boundedManualViewport.stageWidth) && Number.isFinite(boundedManualViewport.stageHeight), true);
const tinyExtentViewport = computeX4UiBuilderViewport({
  drawableWidth: 100,
  drawableHeight: 80,
  viewportWidth: 400,
  viewportHeight: 300,
  menuBounds: { x: 0, y: 0, width: Number.MIN_VALUE, height: Number.MIN_VALUE },
  mode: 'fit-menu',
});
assert.equal(tinyExtentViewport.scale, 16, 'tiny issued extents must not create unbounded CSS scale');

const titleNode = presentation.nodes.find(node => node.id === text.id);
assert.ok(titleNode);
assert.equal(typeof computeX4UiBuilderSelectionFocus, 'function', 'selected-element focus must be provided by the existing viewport owner');
const focusInput = { drawableWidth: 2560, drawableHeight: 1440, viewportWidth: 640, viewportHeight: 320, margin: 16 };
const focusNode = { ...titleNode, selectable: true, rect: { x: 1454, y: 986, width: 46, height: 22 } };
const focusSourceBefore = JSON.stringify(focusNode);
assert.deepEqual(computeX4UiBuilderSelectionFocus(focusInput, focusNode), { scale: 1, focus: { x: 1477, y: 997 } },
  'offset caption centers at native size, not a full-frame fit or huge glyph magnification');
const largeFocus = computeX4UiBuilderSelectionFocus(focusInput, { ...focusNode, rect: { x: 400, y: 300, width: 1600, height: 900 } });
assert.deepEqual(largeFocus, { scale: 0.32, focus: { x: 1200, y: 750 } }, 'oversized selection fits both axes with context margin');
assert.deepEqual(computeX4UiBuilderSelectionFocus(focusInput, { ...focusNode, rect: { x: 2550, y: 986, width: 46, height: 22 } }),
  { scale: 1, focus: { x: 2555, y: 997 } }, 'partly clipped selection uses only its in-bounds extent');
assert.equal(computeX4UiBuilderSelectionFocus(focusInput, undefined), undefined);
assert.equal(computeX4UiBuilderSelectionFocus(focusInput, { ...focusNode, selectable: false }), undefined);
assert.equal(computeX4UiBuilderSelectionFocus(focusInput, { ...focusNode, rect: undefined }), undefined);
for (const rect of [
  { x: 2700, y: 986, width: 46, height: 22 }, { x: -1, y: 986, width: 46, height: 22 },
  { x: 1, y: 1, width: 0, height: 1 }, { x: 1, y: 1, width: 1, height: Number.NaN },
]) assert.equal(computeX4UiBuilderSelectionFocus(focusInput, { ...focusNode, rect }), undefined, 'unknown/outside/invalid geometry cannot be focused');
for (const key of ['drawableWidth', 'drawableHeight', 'viewportWidth', 'viewportHeight'] as const) {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(computeX4UiBuilderSelectionFocus({ ...focusInput, [key]: value }, focusNode), undefined, `${key} must be known and positive`);
  }
}
assert.equal(JSON.stringify(focusNode), focusSourceBefore, 'focus cannot change issued geometry');
console.log('B119_SELECTION_FOCUS_GEOMETRY PASS: native scale/oversized fit/clipping/unknown and invalid geometry refusal');
const longEscapedSplice: X4UiBuilderSourceEditSplice = {
  path: source.file,
  startOffset: titleNode.source.start.offset,
  endOffset: titleNode.source.end.offset,
  replacement: '"long title \\\\"quoted\\\\\\\\path"',
};
const mappedLongTitle = mapX4UiBuilderSourceSpanThroughEdit(titleNode, longEscapedSplice);
assert.deepEqual(mappedLongTitle, { startOffset: longEscapedSplice.startOffset, endOffset: longEscapedSplice.startOffset + longEscapedSplice.replacement.length }, 'exact replacement span must follow the encoded escaped title length');
const freshLongTitleNode = {
  ...titleNode,
  source: loc(longEscapedSplice.startOffset, longEscapedSplice.startOffset + longEscapedSplice.replacement.length),
  label: 'Long title "quoted" \\\\path',
};
assert.equal(
  resolveX4UiBuilderNodeAfterSourceEdit([freshLongTitleNode], titleNode, longEscapedSplice),
  freshLongTitleNode,
  'fresh same-kind node must be selected by the mapped source interval, not its old label or geometry',
);
const enclosingWidget = { ...widgetNode, source: loc(35, 75), sourceOrder: 999, rect: { x: 1, y: 1, width: 90, height: 70 } };
const mappedEnclosingWidget = mapX4UiBuilderSourceSpanThroughEdit(enclosingWidget, longEscapedSplice);
assert.deepEqual(mappedEnclosingWidget, { startOffset: 35, endOffset: 75 + longEscapedSplice.replacement.length - (longEscapedSplice.endOffset - longEscapedSplice.startOffset) }, 'a selected widget call containing the literal must shift its end through the accepted splice');
const freshEnclosingWidget = {
  ...enclosingWidget,
  source: loc(mappedEnclosingWidget?.startOffset ?? -1, mappedEnclosingWidget?.endOffset ?? -1),
  rect: { x: 999, y: 999, width: 1, height: 1 },
};
assert.equal(resolveX4UiBuilderNodeAfterSourceEdit([freshEnclosingWidget], enclosingWidget, longEscapedSplice), freshEnclosingWidget, 'enclosing widget continuation must use the mapped fresh interval even when geometry changes');
const frameNode = issuedFrameNode;
const freshFrameSource = mapX4UiBuilderSourceSpanThroughEdit(frameNode, longEscapedSplice);
assert.ok(freshFrameSource);
const freshFrame = { ...frameNode, source: loc(freshFrameSource.startOffset, freshFrameSource.endOffset), sourceOrder: -10 };
assert.equal(resolveX4UiBuilderNodeAfterSourceEdit([freshFrame], frameNode, longEscapedSplice), freshFrame, 'an enclosing frame call must also follow the exact mapped interval');
const beforeSplice: X4UiBuilderSourceEditSplice = { path: source.file, startOffset: 0, endOffset: 10, replacement: '"a longer prefix"' };
assert.deepEqual(mapX4UiBuilderSourceSpanThroughEdit(titleNode, beforeSplice), { startOffset: 40 + beforeSplice.replacement.length - 10, endOffset: 65 + beforeSplice.replacement.length - 10 }, 'a disjoint edit before the node must shift both offsets');
const afterSplice: X4UiBuilderSourceEditSplice = { path: source.file, startOffset: 80, endOffset: 90, replacement: '"x"' };
assert.deepEqual(mapX4UiBuilderSourceSpanThroughEdit(titleNode, afterSplice), { startOffset: 40, endOffset: 65 }, 'a disjoint edit after the node must not move it');
const shortSplice: X4UiBuilderSourceEditSplice = {
  path: source.file,
  startOffset: titleNode.source.start.offset,
  endOffset: titleNode.source.end.offset,
  replacement: '"x"',
};
assert.deepEqual(
  mapX4UiBuilderSourceSpanThroughEdit(titleNode, shortSplice),
  { startOffset: shortSplice.startOffset, endOffset: shortSplice.startOffset + shortSplice.replacement.length },
  'shorter literal replacements must map to their new exact interval',
);
const ambiguousFreshTitle = { ...freshLongTitleNode, id: `${freshLongTitleNode.id}:duplicate` };
assert.equal(resolveX4UiBuilderNodeAfterSourceEdit([freshLongTitleNode, ambiguousFreshTitle], titleNode, longEscapedSplice), undefined, 'ambiguous fresh intervals must clear selection');
assert.equal(resolveX4UiBuilderNodeAfterSourceEdit([freshLongTitleNode], titleNode, { ...longEscapedSplice, path: 'ui/other.lua' }), undefined, 'cross-file splice provenance must refuse selection');
assert.equal(resolveX4UiBuilderNodeAfterSourceEdit([freshLongTitleNode], titleNode, { ...longEscapedSplice, startOffset: titleNode.source.start.offset + 1, endOffset: titleNode.source.end.offset + 1 }), undefined, 'a splice crossing the selected node boundary must refuse selection');

// Controlled compatibility fixtures; the SourceEditor mounted test using the
// actual Session owner separately proves that parsed catalogs reach this resolver.
const historyPrefix = 'local title = ';
const historySuffix = '\nlocal sibling = "keep"\n';
const historyCatalogFor = (value: string): Parameters<typeof resolveX4UiBuilderNodeAfterScalarHistory>[2] => {
  const literal = JSON.stringify(value);
  const literalSource = loc(historyPrefix.length, historyPrefix.length + literal.length);
  return {
    ...catalog,
    sourceIdentity: source,
    sourcePath: source.file,
    target,
    sourceText: historyPrefix + literal + historySuffix,
    entries: [{ ...editableEntry, path: source.file, value, expression: literal, expectedText: literal,
      startOffset: literalSource.start.offset, endOffset: literalSource.end.offset, sourceLiteral: literalSource }],
  } as Parameters<typeof resolveX4UiBuilderNodeAfterScalarHistory>[2];
};
const historyBeforeCatalog = historyCatalogFor('Before');
const historyAfterCatalog = historyCatalogFor('A longer "quoted" title \\ path');
const historyBeforeNode = { ...titleNode, source: loc(historyPrefix.length, historyPrefix.length + JSON.stringify('Before').length) };
const historyAfterNode = { ...titleNode, id: 'fresh-history-title',
  source: loc(historyPrefix.length, historyPrefix.length + JSON.stringify('A longer "quoted" title \\ path').length) };
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyAfterNode], historyBeforeNode, historyBeforeCatalog, historyAfterCatalog), historyAfterNode,
  'long escaped scalar history must resolve a fresh node without relying on its ID or label');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyBeforeNode], historyAfterNode, historyAfterCatalog, historyBeforeCatalog), historyBeforeNode,
  'inverse shorter scalar history must restore the original source interval');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyBeforeNode], historyBeforeNode, historyBeforeCatalog, historyBeforeCatalog), historyBeforeNode,
  'history affecting another source may preserve an unchanged selected source');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([], historyBeforeNode, historyBeforeCatalog, historyAfterCatalog), undefined,
  'missing fresh nodes must remain unselected');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyAfterNode, { ...historyAfterNode, id: 'duplicate' }], historyBeforeNode, historyBeforeCatalog, historyAfterCatalog), undefined,
  'ambiguous fresh node ranges must remain unselected');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyAfterNode], historyBeforeNode, historyBeforeCatalog,
  { ...historyAfterCatalog, sourceIdentity: { ...source, file: 'other.lua' } }), undefined, 'cross-file history must refuse continuation');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyAfterNode], historyBeforeNode, historyBeforeCatalog,
  { ...historyAfterCatalog, sourceText: historyAfterCatalog.sourceText?.replace('"keep"', '"changed"') }), undefined,
  'two changed literals must not masquerade as one scalar history splice');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyAfterNode], historyBeforeNode, historyBeforeCatalog,
  { ...historyAfterCatalog, sourceText: 'local replacement = {}', entries: [] }), undefined,
  'structural replacement must not reuse positional node identity');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyAfterNode], historyBeforeNode, historyBeforeCatalog,
  { ...historyAfterCatalog, entries: [] }), undefined, 'a missing fresh scalar catalog entry must refuse continuity');
assert.equal(resolveX4UiBuilderNodeAfterScalarHistory([historyAfterNode], historyBeforeNode,
  { ...historyBeforeCatalog, sourceText: undefined }, historyAfterCatalog), undefined, 'missing old bytes cannot prove scalar compatibility');

const historyInsertedPrefix = 'local inserted = true\n';
const shiftedHistoryCatalog = { ...historyBeforeCatalog, sourceText: historyInsertedPrefix + historyBeforeCatalog.sourceText, entries: [] };
const shiftedHistoryNode = { ...historyBeforeNode, id: 'shifted-by-structure', source: loc(
  historyBeforeNode.source.start.offset + historyInsertedPrefix.length, historyBeforeNode.source.end.offset + historyInsertedPrefix.length) };
const historyInsertionSplice = { path: source.file, startOffset: 0, endOffset: 0, expectedText: '', replacement: historyInsertedPrefix };
assert.equal(resolveX4UiBuilderNodeAfterHistory([shiftedHistoryNode], historyBeforeNode, historyBeforeCatalog, shiftedHistoryCatalog, historyInsertionSplice), shiftedHistoryNode);
assert.equal(resolveX4UiBuilderNodeAfterHistory([shiftedHistoryNode], historyBeforeNode, historyBeforeCatalog, shiftedHistoryCatalog, undefined), undefined, 'structural history still needs exact splice provenance');
assert.equal(resolveX4UiBuilderNodeAfterHistory([shiftedHistoryNode], historyBeforeNode, historyBeforeCatalog, shiftedHistoryCatalog, { ...historyInsertionSplice, replacement: 'wrong' }), undefined);
assert.equal(resolveX4UiBuilderNodeAfterHistory([shiftedHistoryNode, { ...shiftedHistoryNode, id: 'duplicate' }], historyBeforeNode, historyBeforeCatalog, shiftedHistoryCatalog, historyInsertionSplice), undefined);
assert.equal(resolveX4UiBuilderNodeAfterHistory([shiftedHistoryNode], historyBeforeNode, historyBeforeCatalog, { ...shiftedHistoryCatalog, target: { ...target, name: 'other' } }, historyInsertionSplice), undefined);
const historyUpper = 'a[1]:createText("same")\n'; const historyLower = 'b[1]:createText("same")\n';
const rowHistoryBefore = { ...historyBeforeCatalog, sourceText: historyUpper + historyLower, entries: [] };
const rowHistoryAfter = { ...rowHistoryBefore, sourceText: historyLower + historyUpper };
const rowHistoryAnchor = { ...historyBeforeNode, source: loc(historyUpper.indexOf('"same"'), historyUpper.indexOf('"same"') + 6) };
const rowHistoryFresh = { ...rowHistoryAnchor, id: 'moved-exact-consumer', source: loc(rowHistoryAnchor.source.start.offset + historyLower.length, rowHistoryAnchor.source.end.offset + historyLower.length) };
const rowHistorySplice = { path: source.file, startOffset: 0, endOffset: rowHistoryBefore.sourceText.length,
  expectedText: rowHistoryBefore.sourceText, replacement: rowHistoryAfter.sourceText, retainedSpans: [
    { beforeStart: 0, beforeEnd: historyUpper.length, afterStart: historyLower.length },
    { beforeStart: historyUpper.length, beforeEnd: rowHistoryBefore.sourceText.length, afterStart: 0 },
  ] };
assert.equal(resolveX4UiBuilderNodeAfterHistory([rowHistoryFresh, rowHistoryAnchor], rowHistoryAnchor, rowHistoryBefore, rowHistoryAfter, rowHistorySplice), rowHistoryFresh, 'same caption in different rows follows the exact retained source span');
assert.equal(resolveX4UiBuilderNodeAfterHistory([rowHistoryFresh], rowHistoryAnchor, rowHistoryBefore, rowHistoryAfter, { ...rowHistorySplice, retainedSpans: [rowHistorySplice.retainedSpans[0]!, rowHistorySplice.retainedSpans[0]!] }), undefined, 'overlapping retained spans cannot identify an element');
assert.equal(resolveX4UiBuilderNodeAfterHistory([rowHistoryFresh], rowHistoryAnchor, rowHistoryBefore, rowHistoryAfter, { ...rowHistorySplice, retainedSpans: [{ ...rowHistorySplice.retainedSpans[0]!, afterStart: 0 }] }), undefined, 'false retained bytes refuse');
console.log('B119_STRUCTURAL_HISTORY_MAPPING PASS: exact inserted shift, same-caption row permutation, missing/false/duplicate/foreign provenance refusal');

const insertedWidgetProof = {
  widget: 'text' as const,
  frameId: 'frame-1',
  tableId: 'table-1',
  rowId: 'row-1',
  cellId: 'cell-1',
  creatorOperationId: operation.id,
  creatorCallName: 'createText' as const,
  creatorSource: operation.source,
  sourceIdentity: source,
};
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes,
    presentation.sourceIdentityKey,
    insertedWidgetProof,
  )?.id,
  text.id,
  'accepted Text insertion must select the exact primary editable text child from the fresh cell owner chain',
);
const descriptorSource = loc(42, 56);
const descriptorTextNodes = presentation.nodes.map(node => node.id === text.id ? { ...node, source: descriptorSource } : node);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    descriptorTextNodes,
    presentation.sourceIdentityKey,
    insertedWidgetProof,
  )?.id,
  text.id,
  'Text continuation must accept the descriptor argument range nested inside, but distinct from, the createText call range',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes,
    'ui/menu.lua|ui/menu.lua|' + 'b'.repeat(64),
    insertedWidgetProof,
  ),
  undefined,
  'inserted-widget continuation must refuse a fresh projection with a different source identity',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes,
    presentation.sourceIdentityKey,
    { ...insertedWidgetProof, creatorSource: loc(41, 66) },
  ),
  undefined,
  'inserted-widget continuation must refuse a creator source mismatch even when cell and operation identities look similar',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes,
    presentation.sourceIdentityKey,
    { ...insertedWidgetProof, creatorOperationId: 'operation-other' },
  ),
  undefined,
  'inserted-widget continuation must refuse a creator operation mismatch',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes,
    presentation.sourceIdentityKey,
    { ...insertedWidgetProof, creatorCallName: 'createButton' },
  ),
  undefined,
  'inserted-widget continuation must refuse a creator call/widget-kind mismatch',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes,
    presentation.sourceIdentityKey,
    { ...insertedWidgetProof, cellId: 'cell-2' },
  ),
  undefined,
  'inserted-widget continuation must refuse a proof whose exact owner chain is absent',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    [...presentation.nodes, { ...widgetNode, id: `${widgetNode.id}:duplicate` }],
    presentation.sourceIdentityKey,
    insertedWidgetProof,
  ),
  undefined,
  'inserted-widget continuation must refuse an ambiguous widget creator match',
);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    [...presentation.nodes, { ...presentation.nodes.find(node => node.id === text.id)!, id: `${text.id}:duplicate` }],
    presentation.sourceIdentityKey,
    insertedWidgetProof,
  ),
  undefined,
  'Text continuation must refuse an ambiguous primary text child match',
);
const primaryTextNode = presentation.nodes.find(node => node.id === text.id);
assert.ok(primaryTextNode);
const wrongFileText = {
  ...primaryTextNode,
  source: { ...descriptorSource, file: 'ui/other.lua', sourcePath: 'ui/other.lua' },
};
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes.map(node => node.id === primaryTextNode.id ? wrongFileText : node),
    presentation.sourceIdentityKey,
    insertedWidgetProof,
  ),
  undefined,
  'Text continuation must refuse a primary descriptor from another source file',
);
const outsideCreatorText = { ...primaryTextNode, source: loc(66, 75) };
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    presentation.nodes.map(node => node.id === primaryTextNode.id ? outsideCreatorText : node),
    presentation.sourceIdentityKey,
    insertedWidgetProof,
  ),
  undefined,
  'Text continuation must refuse a primary descriptor range outside the createText call',
);
const structuralCellNode = presentation.nodes.find(node => node.id === 'scene:cell-1');
assert.ok(structuralCellNode);
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    [...presentation.nodes, { ...structuralCellNode }],
    presentation.sourceIdentityKey,
    insertedWidgetProof,
  ),
  undefined,
  'inserted-widget continuation must reject duplicate structural IDs instead of overwriting them in a Map',
);

const buttonSource = loc(90, 115);
const buttonWidgetNode = {
  ...widgetNode,
  id: 'scene:widget:cell-1:button',
  label: 'Widget',
  childIds: [],
  operationIds: ['operation-button'],
  source: buttonSource,
  widgetKind: 'button' as const,
};
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    [...presentation.nodes, buttonWidgetNode],
    presentation.sourceIdentityKey,
    {
      ...insertedWidgetProof,
      widget: 'button',
      creatorOperationId: 'operation-button',
      creatorCallName: 'createButton',
      creatorSource: buttonSource,
    },
  )?.id,
  buttonWidgetNode.id,
  'Button insertion must select the exact widget node, not a text descendant',
);

const inputSource = loc(116, 142);
const inputWidgetNode = {
  ...widgetNode,
  id: 'scene:widget:cell-1:input',
  label: 'Widget',
  childIds: [],
  operationIds: ['operation-input'],
  source: inputSource,
  widgetKind: 'editbox' as const,
};
assert.equal(
  resolveX4UiBuilderNodeAfterSourceWidgetInsertion(
    [...presentation.nodes, inputWidgetNode],
    presentation.sourceIdentityKey,
    {
      ...insertedWidgetProof,
      widget: 'input',
      creatorOperationId: 'operation-input',
      creatorCallName: 'createEditBox',
      creatorSource: inputSource,
    },
  )?.id,
  inputWidgetNode.id,
  'Input insertion must select the exact editbox widget node, not a label child',
);

const sceneRefusedProjection = {
  ...projection,
  preview: { ...projection.preview, scene: { status: 'refused', refusal: { code: 'font-mismatch', message: 'font evidence unavailable' } } },
} as unknown as X4UiEditorSessionProjection;
const sceneRefused = buildX4UiBuilderPresentation(sceneRefusedProjection);
assert.equal(sceneRefused.status, 'partial');
assert.deepEqual(sceneRefused.roots, ['scene:frame-1']);
assert.equal(sceneRefused.nodes.length, 4, 'Scene refusal must retain exact frame/table/row/cell program nodes');
assert.equal(sceneRefused.nodes.every(node => node.rect === undefined), true, 'Scene refusal must not invent geometry');
assert.match(sceneRefused.detail, /Scene geometry is unavailable/);

console.log('x4UiBuilderPresentation selftest: exact source/scene hierarchy, owner-role properties, preview input labels and validated apply/refuse/clear, clip-aware hit testing, unresolved geometry, and exact insertion continuation passed');
